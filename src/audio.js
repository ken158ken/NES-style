// 音訊：全部以 Web Audio API 即時合成，零外部檔案（agent: audio）
//
// - 音效：振盪器（方波 / 25%、12.5% 脈衝波 / 三角波 / 鋸齒波）+ 白噪音 AudioBuffer + Biquad 濾波 + GainNode 包絡
// - 音樂：自製 4 軌 step sequencer —— p1 主旋律(25% 脈衝)、p2 和聲/對位(12.5% 脈衝)、bass 三角波、drum 噪音鼓
//   每小節 16 步（16 分音符）；音符以 'C4' / 'F#4' / 'Bb3' 表示，'-' 延音，'.' 休止；鼓：k 大鼓 s 小鼓 h 閉鈸 o 開鈸 c 鈸
//   以 AudioContext 時間預排（每 25ms 排未來 100ms），切歌時舊曲淡出；同 key 不重啟；unlock 後自動播放 pending 曲目
// - 所有旋律皆為本專案原創
// - 所有對外呼叫皆 try/catch：無 AudioContext / headless / 尚未 unlock 一律靜默不拋錯；?mute=1 靜音；M 鍵切換靜音
//
// - 環境音層（ambient）：獨立的循環噪音層（noise buffer + 濾波 + 慢速 LFO），掛在 sfxBus 之下受音效音量控制，
//   與 music() 完全獨立（music(null) 不影響 ambient，反之亦然）；切房時由關卡 room.ambient 呼叫
//
// 介面：KB.audio.sfx(name) / music(key|null) / ambient(key|null) / unlock() / setMute(bool) / toggleMute() / status()
//       KB.audio.setVolume({music, sfx}) / getVolume() → {music, sfx, muted}（0~1，存 KB.save.settings.audio）
//       KB.audio.duck(on)   暫停時把音樂平滑降到 30%（ui-menu 於暫停 / 恢復呼叫）
//       KB.audio.SFX_NAMES / MUSIC_NAMES / AMBIENT_NAMES / SONGS / SFX_THROTTLE
//       KB.audio.compileSong / noteFreq / renderSong / renderSfx / renderAmbient（離線渲染，供測試工具）
(function () {
  const W = (typeof window !== 'undefined') ? window : {};
  const AC = W.AudioContext || W.webkitAudioContext || null;
  const OAC = W.OfflineAudioContext || W.webkitOfflineAudioContext || null;
  const VOL = { master: 0.5, sfx: 1.0, music: 0.6 };   // 混音基準：主音量 0.5；音樂比音效小
  const UVOL = { music: 1, sfx: 1 };                    // 使用者音量 0~1（乘在基準上），存檔於 KB.save.settings.audio
  const DUCK_PAUSE = 0.3, DUCK_TMP = 0.35;              // 暫停 / 短暫閃避時的音樂倍率
  const SAVE_KEY = 'kirbystar_save';
  const THROTTLE_MS = 80;                               // 同一音效 80ms 內不重複（預設）
  // 特例節流（毫秒，0 = 不節流）：會被高頻重複呼叫的音效需要放寬，否則會被吃掉
  //   count 每 4 幀呼叫（≈67ms）、fuse 每 6 幀（≈100ms）、bubble 水中氣泡不定期
  //   Round 5：gun 每 6 幀連射（30ms）、jet 噴射循環（60ms）、dragon_breath 吐息循環（90ms），
  //   其餘長音 / 大招放寬節流避免疊成噪音牆
  const SFX_THROTTLE = {
    count: 25, fuse: 50, bubble: 45, torch: 90, melt: 90, splash: 120, wind: 150,
    // ---- Round 5：可連續呼叫的招式 ----
    gun: 30, jet: 60, dragon_breath: 90, arrow: 45, shuriken: 60, fireball: 70,
    wing_flap: 90, missile: 90, mech_step: 110, clone_rush: 120, clone_swap: 60,
    stomp: 120, slash_big: 120, wallkick: 100, tail_whip: 100, dragon_dash: 150,
    // ---- Round 5：長音 / 演出用（避免重疊）----
    thunder: 200, meteor: 250, arrow_rain: 250, ghost_wail: 200, giant_roar: 250,
    blackhole: 500, timestop: 400, transform: 400, untransform: 400, ultimate: 400,
  };
  const LOOKAHEAD = 0.1, TICK_MS = 25;                  // 預排參數
  const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // ======================================================================
  // 音符工具
  // ======================================================================
  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NOTE_RE = /^([A-G])([#b]?)(\d)$/;
  function noteNum(n) {
    const m = NOTE_RE.exec(n); if (!m) return null;
    return NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  }
  function noteFreq(n) { const k = noteNum(n); return k === null ? null : 440 * Math.pow(2, (k - 69) / 12); }
  const F = noteFreq;

  // ======================================================================
  // AudioContext 與共用資源
  // ======================================================================
  let ctx = null, res = null, master = null, comp = null, sfxBus = null, musicBus = null, ambBus = null;
  let unlocked = false, muted = !!(KB.MUTE), pendingMusic = undefined, autoSusp = false;
  const warned = {};
  function warnOnce(msg) { if (!warned[msg]) { warned[msg] = true; try { console.warn('[audio]', msg); } catch (e) { } } }

  // 任意佔空比脈衝波（傅立葉係數）
  function makePulse(c, duty) {
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      re[k] = 2 / (k * Math.PI) * Math.sin(2 * Math.PI * k * duty);
      im[k] = 2 / (k * Math.PI) * (1 - Math.cos(2 * Math.PI * k * duty));
    }
    return c.createPeriodicWave(re, im);
  }
  function makeRes(c) {
    const r = {};
    try { r.p25 = makePulse(c, 0.25); r.p12 = makePulse(c, 0.125); } catch (e) { }
    const len = Math.floor(c.sampleRate * 1.0), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    r.noise = buf;
    return r;
  }
  function createCtx() {
    if (ctx || !AC) return;
    ctx = new AC();
    res = makeRes(ctx);
    master = ctx.createGain(); master.gain.value = muted ? 0 : VOL.master;
    try { comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15; master.connect(comp); comp.connect(ctx.destination); }
    catch (e) { master.connect(ctx.destination); }
    sfxBus = ctx.createGain(); sfxBus.gain.value = VOL.sfx * UVOL.sfx; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = VOL.music * UVOL.music * duckFactor(); musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(sfxBus);   // 環境音掛在音效匯流排下（受 sfx 音量控制）
    if (ctx.addEventListener) ctx.addEventListener('statechange', () => { try { if (ctx.state === 'running') { unlocked = true; startPending(); } } catch (e) { } });
  }
  function setWave(o, w) {
    if (w === 'p25' && res && res.p25) { o.setPeriodicWave(res.p25); return; }
    if (w === 'p12' && res && res.p12) { o.setPeriodicWave(res.p12); return; }
    o.type = (w === 'tri') ? 'triangle' : (w === 'saw') ? 'sawtooth' : (w === 'sine') ? 'sine' : 'square';
  }

  // ======================================================================
  // 音量 / 閃避（duck）
  // ======================================================================
  // 音樂倍率：暫停中 30%；短暫閃避（能力取得 jingle）35%；兩者同時取較低
  let duckHold = false, duckTmp = false, duckTimer = null;
  function duckFactor() { return duckHold ? DUCK_PAUSE : (duckTmp ? DUCK_TMP : 1); }
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  function applyVolume(fast) {
    try {
      if (!ctx) return;
      const t = ctx.currentTime, tc = fast ? 0.008 : 0.04;
      if (sfxBus) sfxBus.gain.setTargetAtTime(VOL.sfx * UVOL.sfx, t, 0.008);
      if (musicBus) musicBus.gain.setTargetAtTime(VOL.music * UVOL.music * duckFactor(), t, tc);
    } catch (e) { }
  }
  // 短暫閃避音樂 sec 秒（重複呼叫會延長）
  function duckFor(sec) {
    try {
      duckTmp = true;
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = setTimeout(() => { duckTimer = null; duckTmp = false; applyVolume(); }, Math.max(0, sec) * 1000);
      applyVolume();
    } catch (e) { }
  }

  // ---- 音量存檔（KB.save.settings.audio = {music, sfx}）----
  let volFromSave = false;
  function readSavedAudio() {
    try {
      if (KB.save && KB.save.settings && KB.save.settings.audio) { volFromSave = true; return KB.save.settings.audio; }
      const ls = W.localStorage; if (!ls) return null;
      const raw = ls.getItem(SAVE_KEY); if (!raw) return null;
      const o = JSON.parse(raw);
      return (o && o.settings && o.settings.audio) || null;
    } catch (e) { return null; }
  }
  function loadVolume() {
    try {
      const a = readSavedAudio(); if (!a) return;
      if (typeof a.music === 'number' && isFinite(a.music)) UVOL.music = clamp01(a.music);
      if (typeof a.sfx === 'number' && isFinite(a.sfx)) UVOL.sfx = clamp01(a.sfx);
      applyVolume(true);
    } catch (e) { }
  }
  function saveVolume() {
    try {
      const data = { music: UVOL.music, sfx: UVOL.sfx };
      if (KB.save) {
        KB.save.settings = KB.save.settings || {};
        KB.save.settings.audio = data;
        volFromSave = true;
        if (typeof KB.saveGame === 'function') KB.saveGame();
        return;
      }
      const ls = W.localStorage; if (!ls) return;          // KB.save 尚未建立（audio.js 早於 game.js 載入）
      let o = {}; try { o = JSON.parse(ls.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { o = {}; }
      o.settings = o.settings || {}; o.settings.audio = data;
      ls.setItem(SAVE_KEY, JSON.stringify(o));
    } catch (e) { }
  }

  // ======================================================================
  // 合成基元
  // ======================================================================
  // 單音。w 波形、f0 起始頻率、t0 開始秒、dur 長度、vol 音量。
  // o.to 指數滑音目標（o.slideT 滑音時間，預設 dur）；o.seg [[dt,f],...] 折線滑音；o.steps [[dt,f],...] 階梯跳頻
  // o.vib {rate,depth,delay} 顫音；o.attack / o.release；o.decay + o.sustain 起音後衰減到持續音量
  function tone(bus, w, f0, t0, dur, vol, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    setWave(osc, w);
    const fp = osc.frequency;
    fp.setValueAtTime(f0, t0);
    if (o.to) fp.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + (o.slideT || dur));
    if (o.seg) for (const s of o.seg) fp.exponentialRampToValueAtTime(Math.max(1, s[1]), t0 + s[0]);
    if (o.steps) for (const s of o.steps) fp.setValueAtTime(s[1], t0 + s[0]);
    const a = o.attack || 0.005, r = o.release || 0.03;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    if (o.decay) g.gain.setTargetAtTime(vol * (o.sustain || 0.6), t0 + a, o.decay);
    g.gain.setTargetAtTime(0, t0 + Math.max(a, dur - r), r / 3);
    osc.connect(g); g.connect(bus);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib.rate; lg.gain.value = f0 * o.vib.depth;
      l.connect(lg); lg.connect(fp); l.start(t0 + (o.vib.delay || 0)); l.stop(t0 + dur + 0.1);
    }
    osc.start(t0); osc.stop(t0 + dur + 0.12);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) { } };
  }
  // 白噪音。o.type 濾波（lowpass/highpass/bandpass），o.f0→o.f1 濾波頻率掃頻，o.q，o.wobble 顫抖頻率(Hz)，o.decay
  function noise(bus, t0, dur, vol, o) {
    o = o || {};
    const src = ctx.createBufferSource(); src.buffer = res.noise; src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    const a = o.attack || 0.004, r = o.release || 0.03;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + a);
    if (o.decay) g.gain.setTargetAtTime(vol * 0.3, t0 + a, o.decay);
    g.gain.setTargetAtTime(0, t0 + Math.max(a, dur - r), r / 3);
    let last = src;
    if (o.type) {
      const f = ctx.createBiquadFilter(); f.type = o.type; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.f0 || 1000, t0);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.slideT || dur));
      src.connect(f); last = f;
    }
    if (o.wobble) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.type = 'sine'; l.frequency.value = o.wobble; lg.gain.value = vol * 0.45;
      l.connect(lg); lg.connect(g.gain); l.start(t0); l.stop(t0 + dur + 0.1);
    }
    last.connect(g); g.connect(bus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.12);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { } };
  }
  // 音序（[[note, dur], ...]）便利函式
  function melody(bus, w, notes, t0, vol, o) {
    let t = t0;
    for (const n of notes) { if (n[0] !== '.') tone(bus, w, F(n[0]), t, n[1], vol, o); t += n[1]; }
    return t;
  }

  // 吸入：持續的低頻噪音掃頻（重複觸發時延長，不重啟）。oneShot=秒數 時輸出固定長度（離線渲染用）
  let inh = null;
  function inhaleVoice(bus, t, oneShot) {
    const c = ctx;
    if (!oneShot && inh && inh.ctx === c && !inh.released) { clearTimeout(inh.timer); inh.timer = setTimeout(inh.release, 350); return; }
    const src = c.createBufferSource(); src.buffer = res.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(110, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 7; lg.gain.value = 150; lfo.connect(lg); lg.connect(f.frequency);
    const rum = c.createOscillator(); rum.type = 'triangle'; rum.frequency.setValueAtTime(52, t); rum.frequency.exponentialRampToValueAtTime(96, t + 0.6);
    const rg = c.createGain(); rg.gain.value = 0.6;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.08);
    src.connect(f); f.connect(g); rum.connect(rg); rg.connect(g); g.connect(bus);
    src.start(t); lfo.start(t); rum.start(t);
    const stopAll = (at) => { try { src.stop(at); lfo.stop(at); rum.stop(at); } catch (e) { } };
    if (oneShot) { g.gain.setTargetAtTime(0, t + oneShot - 0.1, 0.05); stopAll(t + oneShot + 0.1); return; }
    const v = { ctx: c, released: false, timer: null, release: null };
    v.release = () => {
      v.released = true;
      try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.07); stopAll(n + 0.45); } catch (e) { }
      if (inh === v) inh = null;
    };
    v.timer = setTimeout(v.release, 700);
    inh = v;
  }

  // ======================================================================
  // 音效表  (bus, t) => void
  // ======================================================================
  const SFX = {
    jump(b, t) { tone(b, 'sq', 300, t, 0.15, 0.25, { to: 780 }); },
    land(b, t) { tone(b, 'tri', 190, t, 0.09, 0.4, { to: 55 }); noise(b, t, 0.05, 0.12, { type: 'lowpass', f0: 900 }); },
    float(b, t) { noise(b, t, 0.13, 0.15, { type: 'lowpass', f0: 400, f1: 1600 }); tone(b, 'tri', 360, t, 0.12, 0.18, { to: 560 }); },
    exhale(b, t) { noise(b, t, 0.18, 0.22, { type: 'highpass', f0: 1500, f1: 300 }); tone(b, 'p25', 560, t, 0.15, 0.16, { to: 200 }); },
    inhale(b, t, oneShot) { inhaleVoice(b, t, oneShot); },
    spit(b, t) { noise(b, t, 0.12, 0.3, { type: 'bandpass', f0: 2800, f1: 500, q: 1 }); tone(b, 'sq', 950, t, 0.13, 0.2, { to: 180 }); },
    swallow(b, t) { tone(b, 'tri', 420, t, 0.08, 0.3, { to: 300 }); tone(b, 'tri', 300, t + 0.08, 0.08, 0.3, { to: 180 }); tone(b, 'sq', 170, t + 0.17, 0.12, 0.2, { to: 80 }); },
    hurt(b, t) { tone(b, 'saw', 440, t, 0.26, 0.22, { to: 90 }); noise(b, t, 0.2, 0.22, { type: 'lowpass', f0: 3000, f1: 300 }); },
    die(b, t) {
      const end = melody(b, 'p25', [['E5', 0.13], ['C5', 0.13], ['A4', 0.13], ['F4', 0.13], ['D4', 0.2], ['B3', 0.45]], t, 0.22, { vib: { rate: 12, depth: 0.03 } });
      noise(b, end - 0.25, 0.45, 0.2, { type: 'lowpass', f0: 1500, f1: 150 });
    },
    enemyhit(b, t) { tone(b, 'sq', 240, t, 0.06, 0.22, { to: 150 }); noise(b, t, 0.05, 0.2, { type: 'bandpass', f0: 1500, q: 0.7 }); },
    enemydie(b, t) { noise(b, t, 0.24, 0.28, { type: 'lowpass', f0: 4000, f1: 200 }); tone(b, 'sq', 720, t, 0.2, 0.18, { to: 80 }); },
    block(b, t) { noise(b, t, 0.18, 0.32, { type: 'lowpass', f0: 2000, f1: 150 }); tone(b, 'sq', 140, t, 0.12, 0.2, { to: 55 }); },
    item(b, t) { tone(b, 'p25', F('C6'), t, 0.06, 0.2); tone(b, 'p25', F('G6'), t + 0.06, 0.12, 0.2); },
    '1up'(b, t) { tone(b, 'p25', F('A5'), t, 0.1, 0.22); tone(b, 'p25', F('E6'), t + 0.1, 0.32, 0.22); },
    // 能力取得：3 音短 jingle（C5→G5→E6），sfx('ability') 會自動 duck 音樂 0.4 秒
    ability(b, t) {
      tone(b, 'p25', F('C5'), t, 0.09, 0.22);
      tone(b, 'p25', F('G5'), t + 0.09, 0.09, 0.22);
      tone(b, 'p25', F('E6'), t + 0.18, 0.3, 0.22, { vib: { rate: 7, depth: 0.012, delay: 0.08 } });
      tone(b, 'p12', F('C6'), t + 0.18, 0.3, 0.1);
      noise(b, t, 0.28, 0.06, { type: 'highpass', f0: 6000, f1: 9000 });
    },
    door(b, t) { tone(b, 'sq', 720, t, 0.32, 0.2, { to: 110, vib: { rate: 28, depth: 0.12 } }); noise(b, t, 0.3, 0.12, { type: 'lowpass', f0: 250, f1: 2500 }); },
    boss_hurt(b, t) { tone(b, 'saw', 280, t, 0.3, 0.25, { to: 70, vib: { rate: 20, depth: 0.1 } }); noise(b, t, 0.28, 0.28, { type: 'lowpass', f0: 2200, f1: 200 }); },
    boss_die(b, t) {
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.22;
        noise(b, tt, 0.45, 0.3, { type: 'lowpass', f0: 2500, f1: 120 });
        tone(b, 'sq', 420 - i * 80, tt, 0.28, 0.18, { to: 40 });
      }
      noise(b, t + 0.9, 1.2, 0.3, { type: 'lowpass', f0: 1800, f1: 60, release: 0.5 });
      tone(b, 'tri', 90, t + 0.9, 1.0, 0.4, { to: 25, release: 0.4 });
    },
    menu(b, t) { tone(b, 'sq', 880, t, 0.05, 0.18); },
    select(b, t) { tone(b, 'sq', 660, t, 0.06, 0.2); tone(b, 'sq', 990, t + 0.06, 0.14, 0.2); },
    slide(b, t) { noise(b, t, 0.24, 0.25, { type: 'bandpass', f0: 350, f1: 2600, q: 1.5 }); },
    sword(b, t) { noise(b, t, 0.14, 0.25, { type: 'highpass', f0: 1500, f1: 7000 }); tone(b, 'sq', 900, t, 0.1, 0.1, { to: 2400 }); tone(b, 'p12', 2600, t + 0.04, 0.2, 0.08, { decay: 0.05, sustain: 0.3 }); },
    fire(b, t) { noise(b, t, 0.32, 0.3, { type: 'lowpass', f0: 900, f1: 2200, q: 0.5, wobble: 28 }); tone(b, 'saw', 110, t, 0.25, 0.12, { to: 60 }); },
    beam(b, t) {
      const steps = []; for (let i = 0; i < 13; i++) steps.push([i * 0.02, (i % 2 ? 1700 : 1200) * (1 - i * 0.02)]);
      tone(b, 'sq', 1200, t, 0.27, 0.16, { steps });
    },
    cutter(b, t) { tone(b, 'sq', 1500, t, 0.32, 0.18, { seg: [[0.15, 800], [0.32, 1500]], vib: { rate: 30, depth: 0.08 } }); },
    spark(b, t) {
      noise(b, t, 0.18, 0.18, { type: 'highpass', f0: 4000 });
      tone(b, 'sq', 900, t, 0.2, 0.15, { steps: [[0.03, 1500], [0.06, 700], [0.09, 1800], [0.12, 1100], [0.15, 1600], [0.18, 800]] });
    },
    ice(b, t) {
      ['G6', 'E6', 'C6', 'G5'].forEach((n, i) => tone(b, 'p12', F(n), t + i * 0.06, 0.09, 0.2));
      noise(b, t, 0.28, 0.12, { type: 'highpass', f0: 7000, decay: 0.08 });
    },
    hammer(b, t) { tone(b, 'tri', 120, t, 0.28, 0.5, { to: 35, slideT: 0.12 }); noise(b, t, 0.14, 0.35, { type: 'lowpass', f0: 700, f1: 100 }); },
    stone(b, t) {
      tone(b, 'tri', 100, t, 0.3, 0.5, { to: 28 }); noise(b, t, 0.25, 0.4, { type: 'lowpass', f0: 500, f1: 80 });
      tone(b, 'tri', 80, t + 0.2, 0.15, 0.3, { to: 30 });
    },
    clear(b, t) {
      ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(b, 'p25', F(n), t + i * 0.07, 0.09, 0.2));
      tone(b, 'p25', F('C7'), t + 0.28, 0.4, 0.2, { vib: { rate: 6, depth: 0.01, delay: 0.1 } });
      tone(b, 'p12', F('E6'), t + 0.28, 0.4, 0.1);
      noise(b, t + 0.28, 0.4, 0.06, { type: 'highpass', f0: 7000, decay: 0.1 });
    },
    pause(b, t) { tone(b, 'sq', 880, t, 0.07, 0.2); tone(b, 'sq', 660, t + 0.08, 0.12, 0.2); },
    // 解除暫停：與 pause 音高相反（低→高）
    unpause(b, t) { tone(b, 'sq', 660, t, 0.07, 0.2); tone(b, 'sq', 880, t + 0.08, 0.12, 0.2); },
    // 低血量警示：短促雙音（HUD 每 90 幀呼叫一次）
    lowhp(b, t) {
      tone(b, 'p12', F('E6'), t, 0.07, 0.15, { to: F('D#6') });
      tone(b, 'p12', F('B5'), t + 0.11, 0.09, 0.15);
    },
    // 1UP：0.6 秒小旋律
    oneup(b, t) {
      ['E5', 'G5', 'C6', 'E6'].forEach((n, i) => tone(b, 'p25', F(n), t + i * 0.1, 0.11, 0.2));
      tone(b, 'p25', F('G6'), t + 0.4, 0.2, 0.22, { vib: { rate: 8, depth: 0.012, delay: 0.05 } });
      tone(b, 'p12', F('C6'), t + 0.4, 0.2, 0.1);
      noise(b, t, 0.6, 0.05, { type: 'highpass', f0: 7000, f1: 10000, decay: 0.2 });
    },
    // 大星星：5 音上行琶音 + 閃光噪音
    bigstar(b, t) {
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) =>
        tone(b, 'p25', F(n), t + i * 0.07, i === 4 ? 0.4 : 0.09, 0.2, i === 4 ? { vib: { rate: 7, depth: 0.012, delay: 0.1 } } : null));
      tone(b, 'p12', F('G6'), t + 0.28, 0.4, 0.09);
      noise(b, t, 0.6, 0.06, { type: 'highpass', f0: 7000, f1: 11000, decay: 0.15 });
    },
    // 蓄力中：短促上升音（可連續呼叫）
    charge(b, t) {
      tone(b, 'p12', 180, t, 0.26, 0.13, { to: 900 });
      noise(b, t, 0.26, 0.07, { type: 'bandpass', f0: 400, f1: 2600, q: 1.2 });
    },
    // 蓄力完成：叮
    charge_ready(b, t) {
      tone(b, 'p25', F('B6'), t, 0.2, 0.17);
      tone(b, 'p25', F('E6'), t, 0.24, 0.11);
      noise(b, t, 0.24, 0.07, { type: 'highpass', f0: 8000, decay: 0.06 });
    },
    // 門 / 機關解鎖：機械聲 + 上行兩音
    unlock(b, t) {
      noise(b, t, 0.09, 0.3, { type: 'lowpass', f0: 1200, f1: 300 });
      tone(b, 'sq', 150, t, 0.1, 0.25, { to: 90 });
      tone(b, 'p25', F('G5'), t + 0.15, 0.1, 0.2);
      tone(b, 'p25', F('C6'), t + 0.25, 0.28, 0.2, { vib: { rate: 7, depth: 0.01, delay: 0.1 } });
    },
    // 魔王二階段登場：低頻重擊 + 失諧上行嘶吼
    phase2(b, t) {
      tone(b, 'tri', 90, t, 0.5, 0.5, { to: 38, slideT: 0.3 });
      noise(b, t, 0.5, 0.35, { type: 'lowpass', f0: 2200, f1: 150 });
      tone(b, 'saw', 110, t + 0.05, 0.7, 0.15, { to: 220, slideT: 0.6, vib: { rate: 9, depth: 0.05, delay: 0.1 } });
      tone(b, 'saw', 116, t + 0.05, 0.7, 0.11, { to: 233, slideT: 0.6 });
      noise(b, t + 0.45, 0.5, 0.16, { type: 'highpass', f0: 3000, f1: 7000, decay: 0.2 });
    },
    // 選單返回 / 取消：下行兩音
    menu_back(b, t) { tone(b, 'sq', 660, t, 0.05, 0.18); tone(b, 'sq', 440, t + 0.06, 0.12, 0.18); },

    // ---- Round 2（audio2）----
    // 入水噗通：低頻撲通 + 由高掃到低的水花噪音 + 幾顆水珠
    splash(b, t) {
      tone(b, 'tri', 320, t, 0.18, 0.42, { to: 70, slideT: 0.12 });
      noise(b, t, 0.3, 0.3, { type: 'lowpass', f0: 4000, f1: 400, q: 0.9 });
      noise(b, t + 0.06, 0.26, 0.14, { type: 'bandpass', f0: 1800, f1: 5200, q: 1.4 });
      tone(b, 'sine', 900, t + 0.12, 0.1, 0.1, { to: 1600 });
    },
    // 小氣泡：短促上滑 blip（水中每隔一陣子呼叫）
    bubble(b, t) {
      tone(b, 'sine', 420, t, 0.11, 0.22, { to: 1250, attack: 0.004, release: 0.04 });
      noise(b, t, 0.06, 0.06, { type: 'bandpass', f0: 2200, q: 2 });
    },
    // 短風聲：帶通噪音緩慢掃過（可循環呼叫；節流 150ms）
    wind(b, t) {
      noise(b, t, 0.9, 0.2, { type: 'bandpass', f0: 500, f1: 1400, q: 1.1, wobble: 1.6, attack: 0.25, release: 0.35 });
      noise(b, t + 0.1, 0.7, 0.07, { type: 'highpass', f0: 3000, f1: 6000, attack: 0.2, release: 0.3 });
    },
    // 火把劈啪：火焰底噪 + 3 顆爆裂
    torch(b, t) {
      noise(b, t, 0.36, 0.18, { type: 'lowpass', f0: 700, f1: 1500, q: 0.6, wobble: 17 });
      for (let i = 0; i < 3; i++) {
        const tt = t + 0.03 + i * 0.107;
        noise(b, tt, 0.035, 0.17 - i * 0.035, { type: 'bandpass', f0: 2600 + i * 900, q: 2.4, attack: 0.001, release: 0.02 });
      }
    },
    // 導火線嘶嘶：短促（每 6 幀重複呼叫，節流 50ms，疊起來即為連續燃燒聲）
    fuse(b, t) {
      noise(b, t, 0.13, 0.15, { type: 'highpass', f0: 3800, f1: 6500, q: 0.9, attack: 0.01, release: 0.05 });
      noise(b, t, 0.12, 0.06, { type: 'bandpass', f0: 1500, q: 1.2, wobble: 40 });
    },
    // 冰融化：兩滴水滴滴答 + 細碎高頻
    melt(b, t) {
      tone(b, 'sine', 1500, t, 0.12, 0.2, { to: 420, attack: 0.003, release: 0.05 });
      tone(b, 'sine', 1180, t + 0.17, 0.12, 0.14, { to: 340, attack: 0.003, release: 0.05 });
      noise(b, t, 0.3, 0.06, { type: 'highpass', f0: 7000, decay: 0.1 });
    },
    // 硬磚（打不破）：兩個失諧高音金屬叮 + 悶響
    hardblock(b, t) {
      tone(b, 'sq', 1760, t, 0.2, 0.14, { decay: 0.04, sustain: 0.25, release: 0.08 });
      tone(b, 'sq', 2093, t, 0.18, 0.1, { decay: 0.04, sustain: 0.2, release: 0.08 });
      tone(b, 'tri', 150, t, 0.1, 0.3, { to: 60 });
      noise(b, t, 0.09, 0.22, { type: 'bandpass', f0: 3200, q: 1.1 });
    },
    // 結算計數 tick（每 4 幀呼叫，節流 25ms）
    count(b, t) { tone(b, 'p12', 1450, t, 0.04, 0.14, { attack: 0.002, release: 0.015 }); },
    // 計數結束：叮咚
    count_end(b, t) {
      tone(b, 'p25', F('G6'), t, 0.1, 0.18);
      tone(b, 'p25', F('C7'), t + 0.1, 0.3, 0.18, { vib: { rate: 7, depth: 0.01, delay: 0.08 } });
      tone(b, 'p12', F('E6'), t + 0.1, 0.3, 0.09);
      noise(b, t, 0.4, 0.06, { type: 'highpass', f0: 8000, decay: 0.12 });
    },
    // 傳送星起飛：上升咻 + 星光琶音
    ride(b, t) {
      noise(b, t, 0.55, 0.22, { type: 'bandpass', f0: 400, f1: 5200, q: 1.3, attack: 0.03 });
      tone(b, 'p12', 260, t, 0.5, 0.15, { to: 2000, slideT: 0.42, vib: { rate: 9, depth: 0.02, delay: 0.1 } });
      ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(b, 'p25', F(n), t + 0.12 + i * 0.07, 0.09, 0.11));
    },
    // 能力台座取得：短琶音（比 ability 短、偏明亮，不 duck 音樂）
    essence(b, t) {
      ['G5', 'B5', 'D6', 'G6'].forEach((n, i) => tone(b, 'p25', F(n), t + i * 0.05, i === 3 ? 0.26 : 0.07, 0.19));
      tone(b, 'p12', F('B5'), t + 0.15, 0.26, 0.09);
      noise(b, t, 0.34, 0.06, { type: 'highpass', f0: 7500, f1: 10000, decay: 0.12 });
    },
    // ---- Round 5（audio5）：12 種新能力的招式音效 + 變身音 ----
    // 【武器系】gunner 槍手 / ninja 忍者 / blade 居合 / bow 弓
    // 槍：極短噪音爆音 + 低頻後座推力（節流 30ms，可每 6 幀連射）
    gun(b, t) {
      noise(b, t, 0.07, 0.42, { type: 'highpass', f0: 3200, f1: 700, q: 0.9, attack: 0.001, release: 0.025 });
      tone(b, 'tri', 200, t, 0.06, 0.4, { to: 42, slideT: 0.04, attack: 0.001, release: 0.02 });
      tone(b, 'sq', 1500, t, 0.022, 0.09, { to: 520, attack: 0.001, release: 0.008 });
    },
    // 霰彈槍：寬頻爆炸 + 低頻悶響 + 散射尾音
    shotgun(b, t) {
      noise(b, t, 0.34, 0.46, { type: 'lowpass', f0: 6000, f1: 260, q: 0.7, attack: 0.002, release: 0.14 });
      tone(b, 'tri', 130, t, 0.24, 0.46, { to: 28, slideT: 0.1, attack: 0.001 });
      noise(b, t + 0.03, 0.26, 0.15, { type: 'bandpass', f0: 800, f1: 2600, q: 0.9, release: 0.1 });
    },
    // 換彈：兩下金屬喀啦（拉柄 + 上膛）+ 彈簧高音
    reload(b, t) {
      noise(b, t, 0.05, 0.3, { type: 'bandpass', f0: 2500, q: 2.4, attack: 0.001, release: 0.02 });
      tone(b, 'sq', 330, t, 0.04, 0.15, { to: 170, attack: 0.001, release: 0.015 });
      noise(b, t + 0.14, 0.06, 0.26, { type: 'bandpass', f0: 1500, q: 1.8, attack: 0.001, release: 0.03 });
      tone(b, 'sq', 210, t + 0.14, 0.05, 0.17, { to: 100, attack: 0.001 });
      tone(b, 'sine', 2700, t + 0.21, 0.1, 0.06, { to: 1700, release: 0.05 });
    },
    // 手裏劍：快速下滑正弦 + 高通旋轉噪音
    shuriken(b, t) {
      tone(b, 'sine', 2700, t, 0.26, 0.2, { to: 520, attack: 0.003, release: 0.06, vib: { rate: 34, depth: 0.05 } });
      noise(b, t, 0.24, 0.11, { type: 'highpass', f0: 5200, f1: 2000, q: 1.1, wobble: 32, release: 0.08 });
    },
    // 瞬移：消失（上滑）與出現（下滑）兩段交錯 + 空間掃頻
    teleport(b, t) {
      tone(b, 'sine', 300, t, 0.2, 0.17, { to: 2900, attack: 0.004, release: 0.05 });
      tone(b, 'p12', 1500, t + 0.02, 0.16, 0.07, { to: 3400, release: 0.04 });
      tone(b, 'sine', 3000, t + 0.16, 0.22, 0.15, { to: 250, release: 0.07 });
      noise(b, t, 0.36, 0.13, { type: 'bandpass', f0: 900, f1: 6500, q: 2.6, attack: 0.02, release: 0.12 });
    },
    // 居合：先 0.1 秒近乎無聲的吸氣，再一聲銳利斬擊
    iai(b, t) {
      noise(b, t, 0.1, 0.045, { type: 'highpass', f0: 6500, f1: 9500, attack: 0.05, release: 0.03 });
      const s = t + 0.12;
      noise(b, s, 0.11, 0.36, { type: 'highpass', f0: 2000, f1: 11000, q: 0.9, attack: 0.002, release: 0.05 });
      tone(b, 'sq', 3100, s, 0.07, 0.1, { to: 650, attack: 0.001, release: 0.03 });
      tone(b, 'p12', 4200, s + 0.05, 0.34, 0.07, { decay: 0.07, sustain: 0.22, release: 0.14 });
    },
    // 大斬擊：厚重風切 + 低頻壓迫 + 刀身金屬餘響
    slash_big(b, t) {
      noise(b, t, 0.32, 0.32, { type: 'bandpass', f0: 600, f1: 5200, q: 0.8, attack: 0.012, release: 0.14 });
      tone(b, 'saw', 420, t, 0.26, 0.15, { to: 85, slideT: 0.2, release: 0.08 });
      tone(b, 'tri', 150, t + 0.08, 0.3, 0.3, { to: 42, release: 0.12 });
      tone(b, 'p25', 1760, t + 0.16, 0.4, 0.08, { decay: 0.1, sustain: 0.3, release: 0.18, vib: { rate: 5, depth: 0.008 } });
    },
    // 拉弓 → 放弦：木頭吱聲 + 弓弦低嗡
    bow(b, t) {
      noise(b, t, 0.18, 0.09, { type: 'bandpass', f0: 420, f1: 1100, q: 3.5, attack: 0.06, release: 0.05 });
      tone(b, 'tri', 250, t + 0.11, 0.16, 0.3, { to: 115, attack: 0.002, release: 0.07 });
      tone(b, 'sq', 500, t + 0.11, 0.06, 0.09, { to: 190, attack: 0.001, release: 0.02 });
    },
    // 箭：高 Q 帶通破空哨音（由高掃到低）
    arrow(b, t) {
      noise(b, t, 0.22, 0.34, { type: 'bandpass', f0: 4400, f1: 1300, q: 4, attack: 0.008, release: 0.08 });
      tone(b, 'sine', 1900, t, 0.2, 0.12, { to: 650, release: 0.06 });
    },
    // 箭雨：6 支錯開落下（音高逐支下降）+ 落地沙沙
    arrow_rain(b, t) {
      for (let i = 0; i < 6; i++) {
        const tt = t + i * 0.075;
        noise(b, tt, 0.3, 0.17, { type: 'bandpass', f0: 3600 - i * 260, f1: 1000, q: 4.5, attack: 0.02, release: 0.1 });
        tone(b, 'sine', 1500 - i * 120, tt, 0.26, 0.075, { to: 480, release: 0.08 });
      }
      noise(b, t + 0.5, 0.34, 0.18, { type: 'lowpass', f0: 2400, f1: 380, decay: 0.1, release: 0.14 });
    },
    // 蹬牆：鞋底摩擦 + 向上彈起
    wallkick(b, t) {
      noise(b, t, 0.1, 0.26, { type: 'bandpass', f0: 1700, f1: 4400, q: 1.4, attack: 0.002, release: 0.04 });
      tone(b, 'tri', 260, t, 0.13, 0.26, { to: 640, slideT: 0.08, release: 0.05 });
      tone(b, 'sq', 170, t, 0.05, 0.11, { to: 85, release: 0.02 });
    },

    // 【魔法系】mage 元素法師 / time 時間 / gravity 重力 / clone 分身
    // 火球：滾動火焰 + 低頻拋射推進（與 fire 的持續噴射不同）
    fireball(b, t) {
      noise(b, t, 0.36, 0.28, { type: 'lowpass', f0: 1700, f1: 620, q: 0.8, wobble: 21, attack: 0.012, release: 0.14 });
      tone(b, 'saw', 190, t, 0.3, 0.13, { to: 68, slideT: 0.26, release: 0.1, vib: { rate: 13, depth: 0.06 } });
      noise(b, t, 0.08, 0.2, { type: 'highpass', f0: 3200, f1: 1200, attack: 0.001, release: 0.03 });
    },
    // 冰牆：結晶上行五音 + 冰霜細噪 + 冰塊隆起的低頻上滑
    icewall(b, t) {
      ['C6', 'E6', 'G6', 'B6', 'D7'].forEach((n, i) => tone(b, 'p12', F(n), t + i * 0.05, 0.14, 0.15, { decay: 0.05, sustain: 0.3, release: 0.07 }));
      noise(b, t, 0.45, 0.1, { type: 'highpass', f0: 8000, f1: 12000, decay: 0.12, release: 0.15 });
      tone(b, 'tri', 90, t, 0.4, 0.26, { to: 180, slideT: 0.3, release: 0.12 });
      noise(b, t + 0.24, 0.14, 0.14, { type: 'bandpass', f0: 3000, q: 1.6, release: 0.06 });
    },
    // 雷：瞬間爆裂 + 滾動雷鳴 + 低頻嘶吼
    thunder(b, t) {
      noise(b, t, 0.06, 0.5, { type: 'highpass', f0: 4200, f1: 1500, attack: 0.001, release: 0.02 });
      noise(b, t + 0.03, 1.0, 0.3, { type: 'lowpass', f0: 2000, f1: 130, q: 0.7, wobble: 5.5, attack: 0.005, release: 0.4 });
      tone(b, 'saw', 72, t + 0.02, 0.7, 0.18, { to: 30, release: 0.3, vib: { rate: 4.5, depth: 0.18 } });
    },
    // 魔法陣展開：懸浮和聲（正弦）+ 緩慢上行 + 漸強空氣感
    magic_circle(b, t) {
      ['D5', 'A5', 'D6', 'F#6'].forEach((n, i) => tone(b, 'sine', F(n), t + i * 0.06, 0.5 - i * 0.05, 0.11, { attack: 0.05, release: 0.16, vib: { rate: 5.5, depth: 0.01, delay: 0.1 } }));
      tone(b, 'p12', 380, t, 0.5, 0.07, { to: 1180, attack: 0.06, release: 0.14 });
      noise(b, t, 0.55, 0.09, { type: 'bandpass', f0: 1200, f1: 5000, q: 1.2, attack: 0.22, release: 0.18 });
    },
    // 大魔法：低頻充能 → 鋸齒和弦爆發 → 高頻餘燼
    magic_big(b, t) {
      tone(b, 'sine', 70, t, 0.26, 0.24, { to: 150, attack: 0.1, release: 0.06 });
      const s = t + 0.22;
      ['D4', 'A4', 'D5', 'F5'].forEach(n => tone(b, 'saw', F(n), s, 0.5, 0.085, { decay: 0.12, sustain: 0.45, release: 0.2, vib: { rate: 6, depth: 0.012, delay: 0.12 } }));
      noise(b, s, 0.55, 0.3, { type: 'lowpass', f0: 4000, f1: 200, q: 0.6, release: 0.25 });
      tone(b, 'tri', 120, s, 0.4, 0.32, { to: 34, slideT: 0.25, release: 0.15 });
      noise(b, s + 0.3, 0.4, 0.07, { type: 'highpass', f0: 7000, f1: 11000, decay: 0.15, release: 0.18 });
    },
    // 時間停止：倒放包絡（慢慢升起後突然靜止）+ 三下越來越慢的滴答 + 低頻停滯嗡鳴
    timestop(b, t) {
      tone(b, 'p12', 300, t, 0.46, 0.15, { to: 920, attack: 0.4, release: 0.015 });
      noise(b, t, 0.46, 0.15, { type: 'bandpass', f0: 600, f1: 3200, q: 1.6, attack: 0.42, release: 0.015 });
      [0, 0.17, 0.4].forEach((d, i) => tone(b, 'sq', 1600 - i * 100, t + d, 0.03, 0.14 - i * 0.02, { to: 880, attack: 0.001, release: 0.012 }));
      tone(b, 'sine', 58, t + 0.47, 0.9, 0.32, { to: 44, attack: 0.03, release: 0.4, vib: { rate: 3.5, depth: 0.05 } });
      tone(b, 'tri', 87, t + 0.47, 0.8, 0.09, { to: 66, attack: 0.05, release: 0.35 });
    },
    // 時間恢復：嗡鳴解除上滑 + 滴答加速 + 明亮放行雙音
    timeresume(b, t) {
      tone(b, 'sine', 44, t, 0.34, 0.3, { to: 96, release: 0.1 });
      [0, 0.14, 0.24, 0.31, 0.36].forEach((d, i) => tone(b, 'sq', 1100 + i * 180, t + d, 0.03, 0.09 + i * 0.012, { to: 700 + i * 180, attack: 0.001, release: 0.012 }));
      tone(b, 'p25', F('E6'), t + 0.4, 0.26, 0.16, { release: 0.1 });
      tone(b, 'p12', F('B6'), t + 0.4, 0.26, 0.08, { release: 0.1 });
      noise(b, t + 0.38, 0.3, 0.07, { type: 'highpass', f0: 6500, f1: 10000, decay: 0.1, release: 0.12 });
    },
    // 慢動作：整體音高像轉盤被拖慢（下滑 + 抖動 + 低通變悶）
    slowmo(b, t) {
      tone(b, 'p25', 880, t, 0.6, 0.15, { to: 170, release: 0.12, vib: { rate: 6, depth: 0.035 } });
      tone(b, 'p12', 1320, t, 0.55, 0.07, { to: 255, release: 0.1 });
      noise(b, t, 0.6, 0.1, { type: 'lowpass', f0: 5200, f1: 520, q: 0.8, wobble: 6.5, release: 0.15 });
    },
    // 倒帶：高速階梯跳頻下行（磁帶倒轉）+ 抖動帶通嘶聲
    rewind(b, t) {
      const steps = [];
      for (let i = 0; i < 16; i++) steps.push([i * 0.028, 2600 - i * 130 + (i % 2 ? 420 : 0)]);
      tone(b, 'sq', 2600, t, 0.46, 0.12, { steps, attack: 0.002, release: 0.04 });
      noise(b, t, 0.46, 0.12, { type: 'bandpass', f0: 5200, f1: 1100, q: 2.2, wobble: 26, release: 0.06 });
      tone(b, 'sine', 900, t, 0.44, 0.08, { to: 210, release: 0.06 });
    },
    // 黑洞：1 秒吸入低鳴（音量倒放漸強、音高持續下墜、螺旋帶通）
    blackhole(b, t) {
      tone(b, 'saw', 125, t, 1.0, 0.24, { to: 33, attack: 0.5, release: 0.12, vib: { rate: 2.2, depth: 0.1 } });
      noise(b, t, 1.0, 0.2, { type: 'bandpass', f0: 2600, f1: 170, q: 1.8, attack: 0.6, release: 0.1, wobble: 3.2 });
      tone(b, 'sine', 72, t, 1.0, 0.2, { to: 27, attack: 0.72, release: 0.1 });
    },
    // 隕石：墜落哨音 → 落地大爆炸 + 碎石
    meteor(b, t) {
      tone(b, 'sine', 1500, t, 0.55, 0.13, { to: 175, release: 0.1, vib: { rate: 5, depth: 0.02 } });
      noise(b, t, 0.55, 0.13, { type: 'bandpass', f0: 3200, f1: 480, q: 1.3, attack: 0.06, release: 0.1 });
      const i = t + 0.55;
      noise(b, i, 0.55, 0.42, { type: 'lowpass', f0: 3500, f1: 85, q: 0.6, release: 0.22 });
      tone(b, 'tri', 115, i, 0.45, 0.44, { to: 25, slideT: 0.22, release: 0.18 });
      noise(b, i + 0.12, 0.4, 0.1, { type: 'bandpass', f0: 1800, f1: 600, q: 0.9, release: 0.18 });
    },
    // 重力上浮：向上牽引的顫動滑音 + 漸強氣流
    gravity_lift(b, t) {
      tone(b, 'sine', 140, t, 0.6, 0.24, { to: 640, attack: 0.06, release: 0.14, vib: { rate: 9, depth: 0.05 } });
      tone(b, 'p12', 280, t + 0.06, 0.5, 0.09, { to: 1280, release: 0.12 });
      noise(b, t, 0.6, 0.1, { type: 'highpass', f0: 700, f1: 5200, attack: 0.2, release: 0.16 });
    },
    // 分身生成：主音 + 兩個延遲失諧的複製（多重殘影感）
    clone_summon(b, t) {
      ['A5', 'C#6', 'E6'].forEach((n, i) => {
        const f = F(n), tt = t + i * 0.055;
        tone(b, 'p25', f, tt, 0.13, 0.16, { release: 0.05 });
        tone(b, 'p25', f * 1.006, tt + 0.035, 0.12, 0.09, { release: 0.05 });
        tone(b, 'p25', f * 0.993, tt + 0.07, 0.11, 0.055, { release: 0.05 });
      });
      noise(b, t, 0.4, 0.06, { type: 'highpass', f0: 6500, f1: 9500, decay: 0.12, release: 0.14 });
    },
    // 分身交換：兩條音高交錯（一升一降）的極短嗖
    clone_swap(b, t) {
      tone(b, 'p12', 400, t, 0.14, 0.15, { to: 1900, attack: 0.002, release: 0.04 });
      tone(b, 'p12', 1900, t, 0.14, 0.13, { to: 400, attack: 0.002, release: 0.04 });
      noise(b, t, 0.16, 0.12, { type: 'bandpass', f0: 2400, f1: 900, q: 2.6, release: 0.05 });
    },
    // 分身連擊：5 連殘影打擊（音高逐次上行）+ 收尾重擊
    clone_rush(b, t) {
      for (let i = 0; i < 5; i++) {
        const tt = t + i * 0.055;
        noise(b, tt, 0.06, 0.2 - i * 0.02, { type: 'bandpass', f0: 1600 + i * 480, q: 1.6, attack: 0.001, release: 0.03 });
        tone(b, 'sq', 520 + i * 130, tt, 0.05, 0.12, { to: 260 + i * 60, attack: 0.001, release: 0.02 });
      }
      tone(b, 'tri', 150, t + 0.28, 0.16, 0.3, { to: 50, release: 0.07 });
    },

    // 【變身系】giant 巨大化 / dragon 龍化 / mech 機甲 / ghost 幽靈
    // 巨大化：低頻隆隆上升 + 骨架撐開的喀喀 + 落地重音
    giant_grow(b, t) {
      tone(b, 'tri', 60, t, 0.65, 0.4, { to: 150, slideT: 0.55, attack: 0.05, release: 0.12, vib: { rate: 4, depth: 0.05 } });
      noise(b, t, 0.65, 0.2, { type: 'lowpass', f0: 300, f1: 2000, q: 0.9, attack: 0.18, release: 0.16 });
      [0.1, 0.26, 0.42].forEach((d, i) => tone(b, 'sq', 180 + i * 70, t + d, 0.07, 0.1, { to: 90 + i * 40, release: 0.03 }));
      tone(b, 'tri', 120, t + 0.62, 0.3, 0.42, { to: 30, slideT: 0.14, release: 0.12 });
      noise(b, t + 0.62, 0.3, 0.26, { type: 'lowpass', f0: 1600, f1: 120, release: 0.14 });
    },
    // 踩踏：地面重擊 + 碎石彈跳
    stomp(b, t) {
      tone(b, 'tri', 105, t, 0.34, 0.5, { to: 22, slideT: 0.16, attack: 0.001, release: 0.14 });
      noise(b, t, 0.3, 0.34, { type: 'lowpass', f0: 2200, f1: 110, q: 0.7, release: 0.14 });
      noise(b, t + 0.08, 0.26, 0.11, { type: 'bandpass', f0: 2600, f1: 1100, q: 1.4, decay: 0.06, release: 0.12 });
    },
    // 巨人咆哮：兩層微失諧鋸齒吼叫（先上揚後下沉）+ 低頻胸腔
    giant_roar(b, t) {
      tone(b, 'saw', 90, t, 0.8, 0.19, { seg: [[0.25, 150], [0.8, 70]], attack: 0.06, release: 0.2, vib: { rate: 6.5, depth: 0.07 } });
      tone(b, 'saw', 93, t + 0.02, 0.78, 0.14, { seg: [[0.25, 155], [0.78, 72]], attack: 0.06, release: 0.2 });
      tone(b, 'tri', 45, t, 0.85, 0.28, { to: 34, attack: 0.05, release: 0.25 });
      noise(b, t, 0.8, 0.13, { type: 'bandpass', f0: 900, f1: 400, q: 0.8, wobble: 7, attack: 0.08, release: 0.25 });
    },
    // 縮小：快速下行閃爍（giant_grow 的反向，短促）+ 收尾啵
    shrink(b, t) {
      tone(b, 'p12', 1400, t, 0.32, 0.15, { to: 260, release: 0.08, vib: { rate: 14, depth: 0.03 } });
      tone(b, 'sine', 700, t, 0.3, 0.11, { to: 140, release: 0.08 });
      noise(b, t, 0.3, 0.09, { type: 'highpass', f0: 6000, f1: 1200, release: 0.1 });
      tone(b, 'sq', 200, t + 0.28, 0.06, 0.12, { to: 420, attack: 0.001, release: 0.03 });
    },
    // 龍息：可循環呼叫的火焰噴流（節流 90ms，連續呼叫即為持續吐息）
    dragon_breath(b, t) {
      noise(b, t, 0.2, 0.26, { type: 'lowpass', f0: 2600, f1: 1200, q: 0.6, wobble: 34, attack: 0.02, release: 0.07 });
      noise(b, t, 0.2, 0.12, { type: 'highpass', f0: 3400, f1: 5200, attack: 0.03, release: 0.07 });
      tone(b, 'saw', 140, t, 0.18, 0.11, { to: 105, release: 0.06, vib: { rate: 19, depth: 0.08 } });
    },
    // 龍衝刺：低空掠過的風壓（先近後遠）+ 翼膜拍擊
    dragon_dash(b, t) {
      noise(b, t, 0.4, 0.3, { type: 'bandpass', f0: 300, f1: 2600, q: 0.7, attack: 0.05, release: 0.16 });
      tone(b, 'tri', 180, t, 0.36, 0.22, { seg: [[0.14, 340], [0.36, 120]], attack: 0.02, release: 0.12 });
      noise(b, t + 0.2, 0.16, 0.18, { type: 'lowpass', f0: 900, f1: 250, attack: 0.01, release: 0.07 });
    },
    // 尾巴掃擊：高速帶通掃頻 + 命中悶響
    tail_whip(b, t) {
      noise(b, t, 0.18, 0.3, { type: 'bandpass', f0: 700, f1: 5600, q: 1.8, attack: 0.01, release: 0.05 });
      tone(b, 'sine', 320, t, 0.16, 0.14, { to: 1500, release: 0.04 });
      tone(b, 'tri', 160, t + 0.15, 0.18, 0.32, { to: 48, slideT: 0.08, release: 0.08 });
    },
    // 拍翅：兩下空氣脈衝（低通噪音鼓起 + 低頻推力）
    wing_flap(b, t) {
      [0, 0.17].forEach((d, i) => {
        noise(b, t + d, 0.16, 0.34 - i * 0.06, { type: 'lowpass', f0: 1500, f1: 400, q: 1.1, attack: 0.05, release: 0.06 });
        tone(b, 'tri', 130 - i * 20, t + d, 0.14, 0.18, { to: 60, attack: 0.02, release: 0.05 });
      });
    },
    // 火箭拳：機械彈射 → 噴射飛行 → 金屬撞擊
    rocket_punch(b, t) {
      noise(b, t, 0.05, 0.26, { type: 'bandpass', f0: 2200, q: 2.2, attack: 0.001, release: 0.02 });
      tone(b, 'sq', 260, t, 0.05, 0.14, { to: 130, attack: 0.001, release: 0.02 });
      noise(b, t + 0.05, 0.3, 0.24, { type: 'highpass', f0: 900, f1: 2800, q: 0.8, attack: 0.02, release: 0.1 });
      tone(b, 'saw', 200, t + 0.05, 0.28, 0.13, { to: 520, release: 0.08 });
      tone(b, 'sq', 1400, t + 0.34, 0.2, 0.12, { decay: 0.05, sustain: 0.25, release: 0.09 });
      tone(b, 'tri', 140, t + 0.34, 0.16, 0.3, { to: 45, release: 0.07 });
    },
    // 飛彈發射：點火 → 推進上升 → 遠去
    missile(b, t) {
      noise(b, t, 0.08, 0.3, { type: 'highpass', f0: 2000, f1: 5000, attack: 0.002, release: 0.03 });
      noise(b, t + 0.04, 0.5, 0.22, { type: 'lowpass', f0: 1200, f1: 3000, q: 0.7, wobble: 13, attack: 0.05, release: 0.2 });
      tone(b, 'saw', 120, t + 0.04, 0.46, 0.14, { to: 460, slideT: 0.4, release: 0.16, vib: { rate: 8, depth: 0.03 } });
      tone(b, 'sine', 600, t + 0.2, 0.34, 0.06, { to: 1500, release: 0.12 });
    },
    // 噴射：可循環呼叫的噴射氣流（節流 60ms）
    jet(b, t) {
      noise(b, t, 0.14, 0.2, { type: 'highpass', f0: 2600, f1: 4200, q: 0.7, attack: 0.02, release: 0.05 });
      noise(b, t, 0.14, 0.12, { type: 'bandpass', f0: 700, q: 1.2, wobble: 46, attack: 0.02, release: 0.05 });
      tone(b, 'saw', 320, t, 0.12, 0.05, { to: 380, release: 0.04 });
    },
    // 機甲步伐：伺服馬達 + 液壓洩壓 + 鋼板落地
    mech_step(b, t) {
      tone(b, 'saw', 420, t, 0.12, 0.07, { to: 260, attack: 0.01, release: 0.04, vib: { rate: 42, depth: 0.05 } });
      noise(b, t + 0.1, 0.06, 0.22, { type: 'bandpass', f0: 3000, q: 2, attack: 0.001, release: 0.03 });
      tone(b, 'tri', 115, t + 0.1, 0.26, 0.42, { to: 30, slideT: 0.12, release: 0.1 });
      noise(b, t + 0.1, 0.22, 0.16, { type: 'lowpass', f0: 1600, f1: 160, release: 0.1 });
      tone(b, 'sq', 1900, t + 0.1, 0.14, 0.05, { decay: 0.03, sustain: 0.2, release: 0.06 });
    },
    // 裝甲碎裂：金屬撕裂 + 4 片碎塊散落
    armor_break(b, t) {
      noise(b, t, 0.18, 0.36, { type: 'bandpass', f0: 1200, f1: 4200, q: 0.8, attack: 0.002, release: 0.07 });
      tone(b, 'tri', 170, t, 0.22, 0.36, { to: 40, slideT: 0.1, release: 0.09 });
      [0.1, 0.19, 0.27, 0.38].forEach((d, i) => {
        tone(b, 'sq', 2400 - i * 380, t + d, 0.13, 0.1 - i * 0.015, { decay: 0.03, sustain: 0.2, release: 0.06 });
        noise(b, t + d, 0.07, 0.12 - i * 0.02, { type: 'highpass', f0: 5000 + i * 800, attack: 0.001, release: 0.03 });
      });
    },
    // 幽靈穿透：空靈微失諧雙音掃過（無實體感）
    ghost_phase(b, t) {
      tone(b, 'sine', 620, t, 0.5, 0.12, { seg: [[0.2, 980], [0.5, 480]], attack: 0.08, release: 0.18, vib: { rate: 4.5, depth: 0.03 } });
      tone(b, 'sine', 627, t, 0.5, 0.09, { seg: [[0.2, 992], [0.5, 486]], attack: 0.1, release: 0.18 });
      noise(b, t, 0.5, 0.1, { type: 'bandpass', f0: 2600, f1: 900, q: 3, attack: 0.12, release: 0.2 });
    },
    // 附身：向內吸附的下行滑音（倒放包絡）+ 低頻落定
    possess(b, t) {
      tone(b, 'p12', 900, t, 0.45, 0.13, { to: 150, attack: 0.3, release: 0.03 });
      noise(b, t, 0.45, 0.14, { type: 'bandpass', f0: 3000, f1: 500, q: 2.2, attack: 0.32, release: 0.03 });
      tone(b, 'sine', 130, t + 0.44, 0.35, 0.28, { to: 58, release: 0.14 });
    },
    // 解除附身：向外彈出 + 上行釋放
    unpossess(b, t) {
      tone(b, 'sine', 90, t, 0.12, 0.3, { to: 220, attack: 0.002, release: 0.05 });
      tone(b, 'p12', 260, t + 0.06, 0.34, 0.12, { to: 1400, release: 0.1 });
      noise(b, t + 0.04, 0.34, 0.12, { type: 'bandpass', f0: 700, f1: 5200, q: 2, attack: 0.02, release: 0.12 });
    },
    // 幽靈哀嚎：緩慢起伏的長哭聲（三段折線滑音 + 顫音）
    ghost_wail(b, t) {
      tone(b, 'sine', 520, t, 0.95, 0.15, { seg: [[0.3, 760], [0.62, 440], [0.95, 300]], attack: 0.12, release: 0.3, vib: { rate: 5.5, depth: 0.04, delay: 0.1 } });
      tone(b, 'tri', 261, t + 0.05, 0.9, 0.09, { seg: [[0.3, 380], [0.6, 220], [0.9, 150]], attack: 0.15, release: 0.3 });
      noise(b, t, 0.95, 0.07, { type: 'bandpass', f0: 1400, f1: 700, q: 2.5, attack: 0.25, release: 0.3, wobble: 5 });
    },

    // 【通用】變身演出 / 必殺 / 蓄力全滿
    // 變身：上升琶音（C 大調七音）+ 白光閃爍，約 0.7 秒
    transform(b, t) {
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) =>
        tone(b, 'p25', F(n), t + i * 0.055, i === 6 ? 0.34 : 0.1, 0.15,
          i === 6 ? { release: 0.14, vib: { rate: 7, depth: 0.012, delay: 0.08 } } : { release: 0.04 }));
      tone(b, 'p12', F('G6'), t + 0.33, 0.36, 0.08, { release: 0.14 });
      tone(b, 'tri', 70, t, 0.42, 0.3, { to: 200, slideT: 0.36, attack: 0.04, release: 0.1 });
      noise(b, t + 0.3, 0.4, 0.16, { type: 'highpass', f0: 3000, f1: 11000, attack: 0.008, decay: 0.1, release: 0.2 });
      noise(b, t + 0.3, 0.36, 0.14, { type: 'lowpass', f0: 4000, f1: 300, release: 0.16 });
    },
    // 解除變身：下行琶音 + 洩氣
    untransform(b, t) {
      ['G6', 'E6', 'C6', 'G5', 'E5'].forEach((n, i) => tone(b, 'p25', F(n), t + i * 0.055, 0.1, 0.14, { release: 0.04 }));
      tone(b, 'tri', 180, t + 0.22, 0.26, 0.22, { to: 60, release: 0.1 });
      noise(b, t + 0.2, 0.3, 0.12, { type: 'lowpass', f0: 3000, f1: 400, release: 0.12 });
    },
    // 必殺登場 stinger（約 0.5 秒）：D 大調銅管式重擊和弦 + 鈸 + 上衝
    ultimate(b, t) {
      ['D4', 'A4', 'D5', 'F#5', 'A5'].forEach(n => tone(b, 'saw', F(n), t, 0.42, 0.07, { decay: 0.08, sustain: 0.55, release: 0.14, vib: { rate: 6, depth: 0.01, delay: 0.14 } }));
      tone(b, 'tri', 110, t, 0.4, 0.38, { to: 55, slideT: 0.3, release: 0.14 });
      noise(b, t, 0.5, 0.2, { type: 'highpass', f0: 4000, f1: 9000, decay: 0.14, release: 0.26 });
      tone(b, 'p25', 500, t + 0.28, 0.24, 0.12, { to: 2000, release: 0.1 });
      noise(b, t + 0.3, 0.2, 0.18, { type: 'lowpass', f0: 2200, f1: 300, release: 0.1 });
    },
    // 蓄力全滿（比 charge_ready 更亮）：雙八度鐘聲 + 極高頻閃光 + 上衝尾音
    max(b, t) {
      tone(b, 'p25', F('E6'), t, 0.3, 0.16, { release: 0.12 });
      tone(b, 'p25', F('B6'), t, 0.34, 0.13, { release: 0.14, vib: { rate: 8, depth: 0.01, delay: 0.08 } });
      tone(b, 'p12', F('E7'), t + 0.04, 0.32, 0.08, { release: 0.14 });
      tone(b, 'sine', F('B5'), t, 0.3, 0.1, { release: 0.12 });
      noise(b, t, 0.36, 0.1, { type: 'highpass', f0: 9000, f1: 13000, decay: 0.07, release: 0.14 });
      tone(b, 'p12', 1200, t + 0.16, 0.2, 0.07, { to: 3200, release: 0.08 });
    },
  };

  // 別名：player.js（player2 的 rideStar）以 'warp' 呼叫傳送星起飛音，與 'ride' 同一個聲音
  SFX.warp = SFX.ride;

  // ======================================================================
  // 環境音層（ambient）：低音量循環噪音床，獨立於音樂，受 sfx 音量控制
  // ======================================================================
  // layers[]: type 濾波型別、f 中心頻率、q、vol 音量、rate 噪音播放速率、
  //           lfo {rate,depth} 濾波頻率慢速擺動、amp {rate,depth} 音量起伏；drone 低頻正弦襯底
  const AMBIENT = {
    // 水下：悶厚的低頻水聲 + 緩慢冒泡的中頻
    water: {
      fade: 1.0,
      layers: [
        { type: 'lowpass', f: 520, q: 1.0, vol: 0.095, rate: 0.6, lfo: { rate: 0.18, depth: 180 } },
        { type: 'bandpass', f: 1400, q: 1.5, vol: 0.036, lfo: { rate: 0.7, depth: 600 }, amp: { rate: 0.45, depth: 0.7 } },
      ],
    },
    // 空中 / 山頂：持續呼嘯的風
    wind: {
      fade: 1.4,
      layers: [
        { type: 'bandpass', f: 760, q: 1.1, vol: 0.075, lfo: { rate: 0.13, depth: 420 }, amp: { rate: 0.09, depth: 0.75 } },
        { type: 'highpass', f: 3600, vol: 0.022, lfo: { rate: 0.21, depth: 1500 }, amp: { rate: 0.15, depth: 0.8 } },
      ],
    },
    // 洞窟：極低頻空氣聲 + 低音嗡鳴
    cave: {
      fade: 1.6,
      layers: [
        { type: 'lowpass', f: 300, q: 1.4, vol: 0.105, rate: 0.5, lfo: { rate: 0.07, depth: 90 } },
      ],
      drone: { f: 58, vol: 0.03 },
    },
    // 城堡：石室低鳴 + 遠處火把的高頻空氣感
    castle: {
      fade: 1.4,
      layers: [
        { type: 'lowpass', f: 400, q: 0.8, vol: 0.082, rate: 0.55, lfo: { rate: 0.05, depth: 110 } },
        { type: 'bandpass', f: 2600, q: 0.9, vol: 0.026, amp: { rate: 0.11, depth: 0.85 } },
      ],
      drone: { f: 98, vol: 0.024 },
    },
  };

  // 於 bus 上建立一個 ambient 聲部；回傳 { stop(at, fade) }。ctx 為當下的 AudioContext（離線渲染時會被暫時替換）
  function makeAmbient(bus, t, key) {
    const spec = AMBIENT[key];
    if (!spec || !ctx || !res) return null;
    const c = ctx, nodes = [], g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + (spec.fade || 1.2));
    g.connect(bus);
    for (const L of spec.layers) {
      const src = c.createBufferSource(); src.buffer = res.noise; src.loop = true;
      if (L.rate) src.playbackRate.value = L.rate;
      const lg = c.createGain(); lg.gain.value = L.vol;
      let last = src;
      if (L.type) {
        const f = c.createBiquadFilter(); f.type = L.type; f.Q.value = L.q || 0.8; f.frequency.value = L.f;
        src.connect(f); last = f;
        if (L.lfo) {
          const o = c.createOscillator(), og = c.createGain();
          o.type = 'sine'; o.frequency.value = L.lfo.rate; og.gain.value = L.lfo.depth;
          o.connect(og); og.connect(f.frequency); o.start(t); nodes.push(o);
        }
      }
      if (L.amp) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine'; o.frequency.value = L.amp.rate; og.gain.value = L.vol * L.amp.depth;
        o.connect(og); og.connect(lg.gain); o.start(t); nodes.push(o);
      }
      last.connect(lg); lg.connect(g);
      src.start(t, Math.random() * 0.5); nodes.push(src);
    }
    if (spec.drone) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = spec.drone.f; og.gain.value = spec.drone.vol;
      o.connect(og); og.connect(g); o.start(t); nodes.push(o);
    }
    return {
      key, g,
      stop(at, fade) {
        fade = fade || 0.5;
        try {
          g.gain.cancelScheduledValues(at);
          g.gain.setTargetAtTime(0, at, fade / 3);
          for (const n of nodes) { try { n.stop(at + fade + 0.25); } catch (e) { } }
          setTimeout(() => { try { g.disconnect(); } catch (e) { } }, (fade + 0.6) * 1000);
        } catch (e) { }
      },
    };
  }

  // ======================================================================
  // 音樂資料
  // ======================================================================
  // 小節 = 16 個 token；下列為伴奏樣式產生器（讓各曲有不同的節奏型）
  const cmp = (a, b) => `. ${a} ${b} . . ${a} ${b} . . ${a} ${b} . . ${a} ${b} .`;           // 後半拍和弦
  const tres = (a, b, c) => `${a} - . ${b} - . ${c} - ${a} - . ${b} - . ${c} -`;               // 3-3-2 節奏
  const oom = (r, f) => `${r} - - . ${f} - - . ${r} - - . ${f} - - .`;                           // 根音-五音 oom-pah
  const arpE = (a, b, c, d) => `${a} - ${b} - ${c} - ${d} - ${a} - ${b} - ${c} - ${d} -`;         // 八分琶音
  const arpUD = (a, b, c, d) => `${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b} ${c} ${d}`; // 十六分上下琶音
  const hold = (n) => `${n} - - - - - - - - - - - - - - -`;                                       // 全音符
  const half = (a, b) => `${a} - - - - - - - ${b} - - - - - - -`;                                 // 二分音符 ×2
  const cal = (a, b) => `. . ${a} ${b} . . ${a} ${b} . ${a} ${b} . . ${a} ${b} .`;               // calypso 伴奏
  const syn = (r, f) => `${r} - - . . ${f} - - . ${r} - . ${f} - - .`;                           // 切分貝斯
  const mar = (a, b) => `${a} . ${a} . ${b} . ${b} . ${a} . ${a} . ${b} . ${b} .`;               // 進行曲
  const oct = (r, f) => `${r} - . . ${f} - . . ${r} - . . ${f} - . .`;                           // 四分音符貝斯
  const stab = (a, b) => `${a} . . ${a} . . ${a} . ${b} . . ${b} . . ${b} .`;                     // 3-3-2 stab
  const b16 = (r, x) => `${r} ${r} ${r} ${r} ${r} ${r} ${r} ${r} ${r} ${r} ${r} ${r} ${x} ${x} ${x} ${x}`; // 十六分連打貝斯
  const D = {
    basic: 'k . h . s . h . k . h . s . h h',
    fill: 'k . h . s . h . k . s . s s s s',
    light: 'k . h . s . h . k . h . s . h .',
    march: 'k . h . s . s . k . h . s . s s',
    marchF: 'k . h . s . s . k . s s s . s s',
    boss: 'k . h h s . h . k . h k s . h h',
    bossF: 'k . h . s . h . k k . k s . s s',
    dbl: 'k . s . k . s . k . s . k k s s',
    dblH: 'k h s h k h s h k h s h k h s h',
    calyp: 'k . . h . . k . s . . h . . h .',
    soft: 'k . h . . . h . k . h . . . h .',
    sparse: 'k . . . . . . . s . . . . . . .',
    sparse2: 'k . . . . . . . s . . . . . h .',
    hats: '. . h . . . h . . . h . . . h .',
    quiet: 'k . . . . . h . . . . . . . h .',
    none: '. . . . . . . . . . . . . . . .',
  };

  // 每首：bpm、loop、order（段落順序）、sec.{A,B}.{p1,p2,bass,drum}（每段各軌小節數相同）
  const SONGS = {};

  // ---- title：G 大調，開場號角般的記憶點，之後轉為跳躍的副歌 ----
  {
    const A1 = 'D5 - G5 - B5 - D6 - - - B5 - D6 - - -';
    const A2 = 'E6 - D6 - C6 - B5 - A5 - - - B5 - C6 -';
    SONGS.title = {
      bpm: 132, loop: true, order: ['A', 'B'],
      sec: {
        A: {
          p1: [A1, A2,
            'B5 - A5 - G5 - F#5 - A5 - - - - - - -',
            'G5 - - - . . D5 E5 F#5 - - - - - . .',
            A1, A2,
            'D6 - - - C6 - B5 - A5 - B5 - C6 - - -',
            'G5 - - - - - - - . . . . . . . .'],
          p2: [tres('G4', 'B4', 'D5'), tres('G4', 'C5', 'E5'), tres('F#4', 'A4', 'D5'), tres('G4', 'B4', 'D5'),
            tres('G4', 'B4', 'D5'), tres('G4', 'C5', 'E5'), tres('F#4', 'A4', 'D5'), 'G4 - - - - - - - . . . . B4 - D5 -'],
          bass: ['G2 - - - D3 - - - G2 - - - B2 - D3 -', 'C3 - - - G2 - - - C3 - - - E3 - G2 -',
            'D3 - - - A2 - - - D3 - - - F#3 - A2 -', 'G2 - - - D3 - - - G2 - - - B2 - D3 -',
            'G2 - - - D3 - - - G2 - - - B2 - D3 -', 'C3 - - - G2 - - - C3 - - - E3 - G2 -',
            'D3 - - - A2 - - - D3 - - - F#3 - A2 -', 'G2 - - - - - - - . . . . D3 - - -'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
        B: {
          p1: ['E5 - G5 - B5 - - - A5 - G5 - E5 - - -',
            'C5 - E5 - G5 - - - A5 - G5 - E5 - - -',
            'D5 - F#5 - A5 - - - B5 - A5 - F#5 - D5 -',
            'G5 - - - - - - - B5 - D6 - G6 - - -',
            'E6 - - - D6 - B5 - G5 - - - A5 - B5 -',
            'C6 - - - B5 - A5 - G5 - - - E5 - G5 -',
            'A5 - - - B5 - C6 - D6 - - - - - - -',
            'G5 - - - - - - - . . . . D5 E5 F#5 -'],
          p2: [tres('G4', 'B4', 'E5'), tres('G4', 'C5', 'E5'), tres('F#4', 'A4', 'D5'), tres('G4', 'B4', 'D5'),
            tres('G4', 'B4', 'E5'), tres('G4', 'C5', 'E5'), tres('F#4', 'A4', 'D5'), 'G4 - - - - - - - . . . . . . . .'],
          bass: ['E3 - - - B2 - - - E3 - - - G3 - B2 -', 'C3 - - - G2 - - - C3 - - - E3 - G2 -',
            'D3 - - - A2 - - - D3 - - - F#3 - A2 -', 'G2 - - - D3 - - - G2 - - - B2 - D3 -',
            'E3 - - - B2 - - - E3 - - - G3 - B2 -', 'C3 - - - G2 - - - C3 - - - E3 - G2 -',
            'D3 - - - A2 - - - D3 - - - F#3 - A2 -', 'G2 - - - D3 - - - G2 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
      },
    };
  }

  // ---- select：F 大調，輕快俏皮的選關曲 ----
  SONGS.select = {
    bpm: 128, loop: true, order: ['A', 'A', 'B', 'B'],
    sec: {
      A: {
        p1: ['A5 - C6 - A5 - F5 - G5 - A5 - - - . .',
          'Bb5 - D6 - Bb5 - F5 - G5 - Bb5 - - - . .',
          'G5 - A5 - Bb5 - C6 - E5 - G5 - - - . .',
          'F5 - A5 - C6 - - - - - - - . . . .'],
        p2: [cmp('A4', 'C5'), cmp('Bb4', 'D5'), cmp('G4', 'C5'), cmp('A4', 'C5')],
        bass: [oom('F2', 'C3'), oom('Bb2', 'F3'), oom('C3', 'G2'), oom('F2', 'C3')],
        drum: [D.light, D.light, D.light, D.fill],
      },
      B: {
        p1: ['D6 - - - C6 - A5 - F5 - - - A5 - C6 -',
          'Bb5 - - - A5 - G5 - F5 - - - D5 - F5 -',
          'E5 - G5 - C6 - - - Bb5 - G5 - E5 - G5 -',
          'F5 - - - - - - - . . . . . . . .'],
        p2: [cmp('A4', 'D5'), cmp('Bb4', 'D5'), cmp('G4', 'C5'), 'A4 - - - - - - - . . . . . . . .'],
        bass: [oom('D3', 'A2'), oom('Bb2', 'F3'), oom('C3', 'G2'), 'F2 - - - - - - - C3 - - - . . . .'],
        drum: [D.light, D.light, D.light, D.fill],
      },
    },
  };

  // ---- green：C 大調，明亮跳躍的草原曲（主題曲之外的第二記憶點）----
  {
    const A1 = 'G5 - E5 G5 C6 - - A5 G5 - E5 - D5 - E5 -';
    const A2 = 'F5 - A5 C6 F6 - - E6 D6 - C6 - A5 - G5 -';
    const B1 = 'A5 - - - C6 - B5 A5 E5 - - - G5 - A5 -';
    SONGS.green = {
      bpm: 160, loop: true, order: ['A', 'B'],
      sec: {
        A: {
          p1: [A1, A2,
            'B5 - G5 B5 D6 - - C6 B5 - A5 - G5 - F5 -',
            'E5 - G5 - C6 - - - . . G5 A5 B5 - - -',
            A1, A2,
            'D6 - B5 G5 A5 - - - B5 - D6 - F5 - D5 -',
            'C6 - - - - - - - . . . . E5 F5 G5 -'],
          p2: [cmp('E4', 'G4'), cmp('F4', 'A4'), cmp('D4', 'G4'), cmp('E4', 'G4'),
            cmp('E4', 'G4'), cmp('F4', 'A4'), cmp('D4', 'G4'), 'E4 - G4 - C5 - - - . . . . . . . .'],
          bass: [oom('C3', 'G2'), oom('F2', 'C3'), oom('G2', 'D3'), oom('C3', 'G2'),
            oom('C3', 'G2'), oom('F2', 'C3'), oom('G2', 'D3'), 'C3 - - . G2 - - . C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
        B: {
          p1: [B1,
            'F5 - - - A5 - G5 F5 C5 - - - E5 - F5 -',
            'G5 - A5 B5 D6 - - - B5 - A5 - G5 - F#5 -',
            'G5 - E5 - C5 - - - C6 - - - . . . .',
            B1,
            'F6 - - - E6 - D6 C6 A5 - - - G5 - A5 -',
            'B5 - - - D6 - - - G6 - - - F6 - D6 -',
            'C6 - - - G5 - E5 - C5 - - - . . . .'],
          p2: [tres('E4', 'A4', 'C5'), tres('F4', 'A4', 'C5'), tres('D4', 'G4', 'B4'), tres('E4', 'G4', 'C5'),
            tres('E4', 'A4', 'C5'), tres('F4', 'A4', 'C5'), tres('D4', 'G4', 'B4'), 'E4 - - - G4 - - - C5 - - - . . . .'],
          bass: [oom('A2', 'E3'), oom('F2', 'C3'), oom('G2', 'D3'), oom('C3', 'G2'),
            oom('A2', 'E3'), oom('F2', 'C3'), oom('G2', 'D3'), 'C3 - - - G2 - - - C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
      },
    };
  }

  // ---- castle：D 小調，神祕、留白多、琶音鋪底、鼓聲稀疏 ----
  {
    const M1 = 'D5 - - - - - F5 - E5 - - - D5 - - -';
    const B1 = 'F5 - - - Bb5 - - - A5 - G5 - F5 - - -';
    const B2 = 'E5 - - - G5 - - - F5 - E5 - D5 - - -';
    const Dm = arpE('D4', 'F4', 'A4', 'F4'), Bb = arpE('Bb3', 'D4', 'F4', 'D4'), A = arpE('A3', 'C#4', 'E4', 'C#4'), Gm = arpE('G3', 'Bb3', 'D4', 'Bb3'), C = arpE('C4', 'E4', 'G4', 'E4');
    const bs = (r, f) => `${r} - - - - - - - ${r} - - - ${f} - ${r} -`;
    SONGS.castle = {
      bpm: 112, loop: true, gain: 0.9, order: ['A', 'B'], inst: { p1: 'sq' },
      sec: {
        A: {
          p1: [M1, 'A4 - - - - - - - - - - - . . . .',
            'Bb4 - - - D5 - - - F5 - - - E5 - D5 -',
            'C#5 - - - - - - - - - - - E5 - - -',
            M1, 'A5 - - - - - - - G5 - F5 - E5 - - -',
            'G5 - - - Bb5 - - - A5 - - - G5 - F5 -',
            'E5 - - - - - - - - - - - - - - -'],
          p2: [Dm, Dm, Bb, A, Dm, Dm, Gm, A],
          bass: [bs('D2', 'A2'), bs('D2', 'A2'), bs('Bb2', 'F2'), bs('A2', 'E2'), bs('D2', 'A2'), bs('D2', 'A2'), bs('G2', 'D2'), hold('A2')],
          drum: [D.sparse, D.sparse2, D.sparse, D.sparse2, D.sparse, D.sparse2, D.sparse, D.sparse2],
        },
        B: {
          p1: [B1, B2,
            'D5 - - - F5 - A5 - D6 - - - C#6 - - -',
            'A5 - - - - - - - . . . . . . . .',
            B1, B2,
            'D6 - - - C#6 - - - D6 - - - A5 - - -',
            'C#5 - - - - - - - - - - - - - - -'],
          p2: [Bb, C, Dm, A, Bb, C, Dm, A],
          bass: [bs('Bb2', 'F2'), bs('C3', 'G2'), bs('D2', 'A2'), bs('A2', 'E2'), bs('Bb2', 'F2'), bs('C3', 'G2'), bs('D2', 'A2'), hold('A2')],
          drum: [D.sparse2, D.sparse2, D.sparse2, D.sparse2, D.sparse2, D.sparse2, D.sparse2, D.sparse],
        },
      },
    };
  }

  // ---- island：F 大調，悠閒 calypso 風，切分貝斯 ----
  {
    const A1 = '. . A5 - C6 - . A5 - - G5 - F5 - - -';
    const A2 = '. . Bb5 - D6 - . Bb5 - - A5 - G5 - - -';
    const B1 = 'D6 - - - . A5 - - F5 - - - A5 - - -';
    const B2 = 'G5 - - - . Bb5 - - D6 - - - - - - -';
    SONGS.island = {
      bpm: 104, loop: true, order: ['A', 'B'], inst: { p1: 'sq', p2: 'p25' },
      sec: {
        A: {
          p1: [A1, A2,
            '. . A5 - C6 - . F6 - - E6 - C6 - - -',
            '. . G5 - E5 - . G5 - - - - - - - -',
            A1, A2,
            '. . E6 - D6 - . C6 - - Bb5 - G5 - - -',
            'F5 - - - - - - - . . . . . . . .'],
          p2: [cal('A4', 'C5'), cal('Bb4', 'D5'), cal('A4', 'C5'), cal('G4', 'C5'), cal('A4', 'C5'), cal('Bb4', 'D5'), cal('G4', 'C5'), cal('A4', 'C5')],
          bass: [syn('F2', 'C3'), syn('Bb2', 'F3'), syn('F2', 'C3'), syn('C3', 'G2'), syn('F2', 'C3'), syn('Bb2', 'F3'), syn('C3', 'G2'), syn('F2', 'C3')],
          drum: [D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp],
        },
        B: {
          p1: [B1, B2,
            'E6 - - - . D6 - - C6 - - - G5 - - -',
            'A5 - - - - - - - . . . . . . . .',
            B1, B2,
            'C6 - - - . D6 - - E6 - - - G6 - - -',
            'F6 - - - - - - - . . . . . . . .'],
          p2: [cal('A4', 'D5'), cal('G4', 'Bb4'), cal('G4', 'C5'), cal('A4', 'C5'), cal('A4', 'D5'), cal('G4', 'Bb4'), cal('G4', 'C5'), cal('A4', 'C5')],
          bass: [syn('D3', 'A2'), syn('G2', 'D3'), syn('C3', 'G2'), syn('F2', 'C3'), syn('D3', 'A2'), syn('G2', 'D3'), syn('C3', 'G2'), syn('F2', 'C3')],
          drum: [D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp],
        },
      },
    };
  }

  // ---- cloud：D 大調，夢幻，maj7 十六分琶音鋪底、長音旋律 ----
  {
    const Dm7 = arpUD('D4', 'F#4', 'A4', 'C#5'), G7 = arpUD('G4', 'B4', 'D5', 'F#5'), Bm = arpUD('B3', 'D4', 'F#4', 'A4'), A = arpUD('A3', 'C#4', 'E4', 'A4'), Fm = arpUD('F#4', 'A4', 'C#5', 'E5');
    const B1 = 'C#6 - - - - - B5 - A5 - - - F#5 - - -';
    SONGS.cloud = {
      bpm: 122, loop: true, order: ['A', 'B'], vol: { p2: 0.1 },
      sec: {
        A: {
          p1: ['F#5 - - - A5 - - - D6 - - - C#6 - - -',
            'B5 - - - - - - - A5 - - - G5 - - -',
            'F#5 - - - D5 - - - B5 - - - A5 - - -',
            'E5 - - - - - - - - - - - . . . .',
            'F#5 - - - A5 - - - D6 - - - E6 - - -',
            'D6 - - - - - - - B5 - - - G5 - - -',
            'A5 - - - C#6 - - - E6 - - - - - - -',
            'D6 - - - - - - - . . . . . . . .'],
          p2: [Dm7, G7, Bm, A, Dm7, G7, A, Dm7],
          bass: [hold('D2'), hold('G2'), hold('B2'), hold('A2'), hold('D2'), hold('G2'), hold('A2'), hold('D2')],
          drum: [D.hats, D.soft, D.hats, D.soft, D.hats, D.soft, D.hats, D.soft],
        },
        B: {
          p1: [B1,
            'B5 - - - - - A5 - F#5 - - - D5 - - -',
            'G5 - - - B5 - - - D6 - - - E6 - - -',
            'C#6 - - - - - - - - - - - . . . .',
            B1,
            'D6 - - - - - C#6 - B5 - - - F#5 - - -',
            'G5 - - - A5 - - - B5 - - - C#6 - - -',
            'E6 - - - - - - - - - - - . . . .'],
          p2: [Fm, Bm, G7, A, Fm, Bm, G7, A],
          bass: [hold('F#2'), hold('B2'), hold('G2'), hold('A2'), hold('F#2'), hold('B2'), hold('G2'), half('A2', 'A2')],
          drum: [D.soft, D.soft, D.soft, D.hats, D.soft, D.soft, D.soft, D.hats],
        },
      },
    };
  }

  // ---- dedede：Bb 大調進行曲，附點節奏、四分音符貝斯、行軍小鼓 ----
  {
    const A1 = 'Bb4 - - D5 F5 - - - Bb5 - - A5 Bb5 - - -';
    const B1 = 'G5 - - - Bb5 - - - Eb6 - - - - - - -';
    SONGS.dedede = {
      bpm: 124, loop: true, order: ['A', 'B'], inst: { p1: 'sq', p2: 'p25' },
      sec: {
        A: {
          p1: [A1, 'F5 - - D5 Bb4 - - - D5 - - - - - . .',
            'Eb5 - - G5 Bb5 - - - Eb6 - - D6 C6 - - -',
            'A5 - - - F5 - - - C5 - - - . . . .',
            A1, 'G5 - - Bb5 D6 - - - G6 - - F6 D6 - - -',
            'C6 - - - A5 - - - F5 - - - Eb5 - - -',
            'D5 - - - Bb4 - - - . . . . . . . .'],
          p2: [mar('D4', 'F4'), mar('D4', 'F4'), mar('Eb4', 'G4'), mar('C4', 'F4'), mar('D4', 'F4'), mar('D4', 'G4'), mar('C4', 'F4'), 'D4 - - - Bb3 - - - . . . . . . . .'],
          bass: [oct('Bb2', 'F2'), oct('Bb2', 'F2'), oct('Eb2', 'Bb2'), oct('F2', 'C3'), oct('Bb2', 'F2'), oct('G2', 'D3'), oct('F2', 'C3'), 'Bb2 - . . F2 - . . Bb2 - - - . . . .'],
          drum: [D.march, D.march, D.march, D.marchF, D.march, D.march, D.march, D.marchF],
        },
        B: {
          p1: [B1, 'F6 - - - D6 - - - Bb5 - - - - - - -',
            'A5 - - C6 F6 - - - Eb6 - - C6 A5 - - -',
            'Bb5 - - - - - - - . . . . . . . .',
            B1, 'G6 - - - Eb6 - - - C6 - - - - - - -',
            'F6 - - Eb6 D6 - - C6 A5 - - - C6 - - -',
            'Bb5 - - - - - - - . . . . . . . .'],
          p2: [mar('Eb4', 'G4'), mar('D4', 'F4'), mar('C4', 'F4'), mar('D4', 'F4'), mar('Eb4', 'G4'), mar('C4', 'Eb4'), mar('C4', 'F4'), 'D4 - - - F4 - - - Bb4 - - - . . . .'],
          bass: [oct('Eb2', 'Bb2'), oct('Bb2', 'F2'), oct('F2', 'C3'), oct('Bb2', 'F2'), oct('Eb2', 'Bb2'), oct('C3', 'G2'), oct('F2', 'C3'), 'Bb2 - . . F2 - . . Bb2 - - - . . . .'],
          drum: [D.march, D.march, D.march, D.marchF, D.march, D.march, D.march, D.marchF],
        },
      },
    };
  }

  // ---- boss：E 小調，緊張，快速跑動貝斯、切分 stab ----
  {
    const A1 = 'E5 - - - . . G5 - F#5 - E5 - D#5 - E5 -';
    const A2 = 'B5 - - - . . A5 - G5 - F#5 - G5 - - -';
    const B1 = 'E6 - - - . . E6 - D6 - C6 - B5 - C6 -';
    const B2 = 'B5 - - - . . B5 - A5 - G5 - F#5 - G5 -';
    const Em = 'E2 - E2 - E3 - E2 - E2 - E2 - G2 - B2 -', C = 'C2 - C2 - C3 - C2 - C2 - C2 - E2 - G2 -', B7 = 'B2 - B2 - B2 - B2 - A2 - A2 - F#2 - D#2 -', Am = 'A2 - A2 - A3 - A2 - A2 - A2 - A3 - G2 -';
    SONGS.boss = {
      bpm: 172, loop: true, order: ['A', 'B'], vol: { p1: 0.19, bass: 0.32 },
      sec: {
        A: {
          p1: [A1, A2,
            'C6 - - - . . B5 - A5 - G5 - A5 - B5 -',
            'D#5 - - - F#5 - - - B5 - - - - - . .',
            A1, A2,
            'C6 - - - E6 - - - D6 - - - B5 - - -',
            'A5 - - - F#5 - - - D#5 - - - B4 - - -'],
          p2: [stab('G4', 'B4'), stab('G4', 'B4'), stab('E4', 'G4'), stab('F#4', 'A4'), stab('G4', 'B4'), stab('G4', 'B4'), stab('E4', 'G4'), stab('F#4', 'A4')],
          bass: [Em, Em, C, B7, Em, Em, C, B7],
          drum: [D.boss, D.boss, D.boss, D.bossF, D.boss, D.boss, D.boss, D.bossF],
        },
        B: {
          p1: [B1, B2,
            'A5 - - - . . C6 - E6 - - - D6 - C6 -',
            'B5 - - - - - - - . . D#5 F#5 A5 - - -',
            B1, B2,
            'E6 - - - G6 - - - F#6 - - - E6 - - -',
            'D#6 - - - B5 - - - F#5 - - - D#5 - - -'],
          p2: [stab('E4', 'A4'), stab('G4', 'B4'), stab('E4', 'G4'), stab('F#4', 'A4'), stab('E4', 'A4'), stab('G4', 'B4'), stab('E4', 'G4'), stab('F#4', 'A4')],
          bass: [Am, Em, C, B7, Am, Em, C, B7],
          drum: [D.boss, D.boss, D.boss, D.bossF, D.boss, D.boss, D.boss, D.bossF],
        },
      },
    };
  }

  // ---- finalboss：D 小調，更激烈：鋸齒波主旋律、十六分連打貝斯、雙倍鼓 ----
  {
    const A1 = 'D5 - D5 - F5 - D5 - A5 - G#5 - A5 - - -';
    const A2 = 'D6 - C#6 D6 C6 - - - Bb5 - A5 - G5 - F5 -';
    const B1 = 'F6 - - - F6 - Eb6 D6 Bb5 - - - D6 - F6 -';
    const B2 = 'G6 - - - G6 - F6 Eb6 D6 - - - Bb5 - D6 -';
    SONGS.finalboss = {
      bpm: 184, loop: true, order: ['A', 'B'], inst: { p1: 'saw', p2: 'p25' }, vol: { p1: 0.14, p2: 0.1, bass: 0.32 },
      sec: {
        A: {
          p1: [A1, A2,
            'Bb5 - - - D6 - - - F6 - E6 - Eb6 - D6 -',
            'C#6 - - - A5 - - - E5 - - - C#5 - - -',
            A1, A2,
            'G5 - Bb5 - D6 - G6 - F6 - Eb6 - D6 - Bb5 -',
            'A5 - - - C#6 - - - E6 - - - G6 - - -'],
          p2: [mar('D4', 'F4'), mar('D4', 'F4'), mar('Bb3', 'D4'), mar('C#4', 'E4'), mar('D4', 'F4'), mar('D4', 'F4'), mar('G3', 'D4'), mar('C#4', 'E4')],
          bass: [b16('D2', 'C2'), b16('D2', 'C2'), b16('Bb2', 'A2'), b16('A2', 'G#2'), b16('D2', 'C2'), b16('D2', 'C2'), b16('G2', 'F2'), b16('A2', 'G#2')],
          drum: [D.dbl, D.dblH, D.dbl, D.dblH, D.dbl, D.dblH, D.dbl, D.bossF],
        },
        B: {
          p1: [B1, B2,
            'Eb6 - - - G6 - - - Bb6 - - - A6 - G6 -',
            'A6 - - - E6 - - - C#6 - - - A5 - - -',
            B1, B2,
            'Eb6 - D6 - Eb6 - F6 - G6 - Bb6 - C7 - Bb6 -',
            'A6 - - - - - - - . . A5 - C#6 - E6 -'],
          p2: [mar('Bb3', 'D4'), mar('G3', 'D4'), mar('Eb4', 'G4'), mar('C#4', 'E4'), mar('Bb3', 'D4'), mar('G3', 'D4'), mar('Eb4', 'G4'), mar('C#4', 'E4')],
          bass: [b16('Bb2', 'A2'), b16('G2', 'F2'), b16('Eb2', 'D2'), b16('A2', 'G#2'), b16('Bb2', 'A2'), b16('G2', 'F2'), b16('Eb2', 'D2'), b16('A2', 'A2')],
          drum: [D.dblH, D.dblH, D.dblH, D.dbl, D.dblH, D.dblH, D.dblH, D.bossF],
        },
      },
    };
  }

  // ---- invincible：C 大調，超快、忙碌又歡樂 ----
  {
    const A1 = 'C6 - G5 - E5 - G5 - C6 - E6 - D6 - C6 -';
    const B1 = 'E6 - - - C6 - E6 - G6 - - - E6 - C6 -';
    SONGS.invincible = {
      bpm: 180, loop: true, order: ['A', 'B'],
      sec: {
        A: {
          p1: [A1, 'B5 - G5 - D5 - G5 - B5 - D6 - C6 - B5 -',
            'A5 - F5 - C5 - F5 - A5 - C6 - B5 - A5 -',
            'G5 - A5 - B5 - C6 - D6 - - - - - - -',
            A1, 'E6 - C6 - A5 - C6 - E6 - - - D6 - C6 -',
            'F6 - E6 - D6 - C6 - B5 - A5 - G5 - F5 -',
            'E5 - G5 - C6 - - - . . . . . . . .'],
          p2: [cmp('E4', 'G4'), cmp('D4', 'G4'), cmp('F4', 'A4'), cmp('D4', 'G4'), cmp('E4', 'G4'), cmp('E4', 'A4'), cmp('F4', 'A4'), 'E4 - G4 - C5 - - - . . . . . . . .'],
          bass: [oom('C3', 'G2'), oom('G2', 'D3'), oom('F2', 'C3'), oom('G2', 'D3'), oom('C3', 'G2'), oom('A2', 'E3'), 'F2 - - . C3 - - . G2 - - . D3 - - .', 'C3 - - . G2 - - . C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
        B: {
          p1: [B1, 'B5 - - - G#5 - B5 - E6 - - - D6 - B5 -',
            'C6 - - - A5 - C6 - E6 - - - C6 - A5 -',
            'F5 - A5 - C6 - F6 - E6 - D6 - C6 - A5 -',
            B1, 'A6 - - - F6 - A6 - C7 - - - A6 - F6 -',
            'G6 - F6 - E6 - D6 - B5 - D6 - F6 - D6 -',
            'C6 - - - - - - - . . . . . . . .'],
          p2: [cmp('E4', 'G4'), cmp('G#4', 'B4'), cmp('E4', 'A4'), cmp('F4', 'A4'), cmp('E4', 'G4'), cmp('F4', 'A4'), cmp('D4', 'G4'), 'E4 - G4 - C5 - - - . . . . . . . .'],
          bass: [oom('C3', 'G2'), oom('E2', 'B2'), oom('A2', 'E3'), oom('F2', 'C3'), oom('C3', 'G2'), oom('F2', 'C3'), oom('G2', 'D3'), 'C3 - - . G2 - - . C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
      },
    };
  }

  // ---- clear：過關短號角（不循環）----
  SONGS.clear = {
    bpm: 150, loop: false, order: ['A'],
    sec: {
      A: {
        p1: ['G5 - - - C6 - - - E6 - - - G6 - - -',
          'F6 - E6 - D6 - C6 - E6 - - - - - - -',
          'G6 - - - E6 - C6 - D6 - - - - - - -',
          'C6 - - - - - - - - - - - - - - -'],
        p2: ['E5 - - - G5 - - - C6 - - - E6 - - -',
          'D6 - C6 - B5 - A5 - C6 - - - - - - -',
          'E6 - - - C6 - A5 - B5 - - - - - - -',
          'E5 - - - - - - - - - - - - - - -'],
        bass: [half('C3', 'C3'), half('F2', 'G2'), half('C3', 'G2'), hold('C3')],
        drum: ['k . . . s . . . k . . . s . . .', 'k . . . s . . . k . . . s . s s', 'k . . . s . . . k . . . s . s s', 'c . . . . . . . . . . . . . . .'],
      },
    },
  };

  // ---- gameover：A 小調緩慢下行（不循環）----
  SONGS.gameover = {
    bpm: 80, loop: false, order: ['A'], inst: { p1: 'sq' },
    sec: {
      A: {
        p1: ['E5 - - - C5 - - - A4 - - - - - - -',
          'D5 - - - B4 - - - G#4 - - - - - - -',
          'C5 - B4 - A4 - G#4 - E4 - - - - - - -',
          'A4 - - - - - - - - - - - - - - -'],
        p2: ['C5 - - - A4 - - - E4 - - - - - - -',
          'B4 - - - G#4 - - - E4 - - - - - - -',
          'E4 - D4 - C4 - B3 - . . . . . . . .',
          'C4 - - - - - - - - - - - - - - -'],
        bass: [hold('A2'), hold('E2'), half('E2', 'E2'), hold('A2')],
        drum: [D.none, D.none, D.none, 'k . . . . . . . . . . . . . . .'],
      },
    },
  };

  // ---- ending：C 大調，溫馨緩慢，八分琶音鋪底 ----
  {
    const C = arpE('C4', 'E4', 'G4', 'E4'), G = arpE('B3', 'D4', 'G4', 'D4'), Am = arpE('A3', 'C4', 'E4', 'C4'), Fc = arpE('A3', 'C4', 'F4', 'C4'), Em = arpE('G3', 'B3', 'E4', 'B3');
    SONGS.ending = {
      bpm: 96, loop: true, order: ['A', 'B'], inst: { p1: 'sq' }, vol: { p1: 0.17, p2: 0.1 },
      sec: {
        A: {
          p1: ['E5 - - - G5 - - - C6 - - - B5 - - -',
            'A5 - - - - - - - G5 - - - D5 - - -',
            'E5 - - - A5 - - - C6 - - - B5 - A5 -',
            'G5 - - - - - - - F5 - - - - - . .',
            'E5 - - - G5 - - - C6 - - - D6 - - -',
            'B5 - - - - - - - A5 - - - G5 - - -',
            'A5 - - - - - G5 - F5 - - - D5 - - -',
            'C5 - - - - - - - . . . . . . . .'],
          p2: [C, G, Am, Fc, C, G, Fc, C],
          bass: [half('C3', 'G2'), half('G2', 'D3'), half('A2', 'E3'), half('F2', 'C3'), half('C3', 'G2'), half('G2', 'D3'), half('F2', 'C3'), hold('C3')],
          drum: [D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.quiet],
        },
        B: {
          p1: ['F5 - - - A5 - - - C6 - - - - - - -',
            'B5 - - - D6 - - - G5 - - - - - - -',
            'G5 - - - B5 - - - E6 - - - D6 - - -',
            'C6 - - - - - - - A5 - - - - - - -',
            'F5 - - - A5 - - - C6 - - - D6 - - -',
            'B5 - - - - - - - D6 - - - - - - -',
            'E6 - - - - - - - C6 - - - - - - -',
            'C6 - - - - - - - - - - - - - - -'],
          p2: [Fc, G, Em, Am, Fc, G, C, C],
          bass: [half('F2', 'C3'), half('G2', 'D3'), half('E2', 'B2'), half('A2', 'E3'), half('F2', 'C3'), half('G2', 'D3'), half('C3', 'G2'), hold('C3')],
          drum: [D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.quiet, D.none],
        },
      },
    };
  }

  // ---- 變奏工具：移調（鼓軌不動），由既有曲目衍生第二階段 / 變奏曲 ----
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function shiftTok(tok, semis) {
    if (tok === '.' || tok === '-') return tok;
    const k = noteNum(tok); if (k === null) return tok;
    const n = k + semis;
    return SHARP[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  }
  const shiftBar = (bar, semis) => bar.trim().split(/\s+/).map(t => shiftTok(t, semis)).join(' ');
  // p1 / p2（預設連 bass）整體移調；bpm 可變；bass / drum 可整段替換（陣列長度需與原段落相同）
  function variation(srcKey, o) {
    const s = SONGS[srcKey];
    const out = { bpm: o.bpm || s.bpm, loop: true, order: (s.order || Object.keys(s.sec)).slice(), sec: {} };
    if (s.inst) out.inst = s.inst;
    if (o.vol || s.vol) out.vol = o.vol || s.vol;
    if (o.gain || s.gain) out.gain = o.gain || s.gain;
    for (const name of Object.keys(s.sec)) {
      const sec = s.sec[name];
      out.sec[name] = {
        p1: sec.p1.map(b => shiftBar(b, o.semis)),
        p2: sec.p2.map(b => shiftBar(b, o.semis)),
        bass: (o.bass && o.bass[name]) || sec.bass.map(b => shiftBar(b, o.semis)),
        drum: (o.drum && o.drum[name]) || sec.drum.slice(),
      };
    }
    return out;
  }
  const dr8 = (r, x) => `${r} - ${r} - ${x} - ${r} - ${r} - ${r} - ${x} - ${r} -`;   // 八分音符驅動貝斯
  D.tight = 'k . h k s . h h k k h . s . s h';      // 短促密集鼓
  D.tightF = 'k h s h k h s s k h s s s s s s';     // 短促鼓 fill

  // ---- boss2：boss 的第二階段變奏（BPM +12、升 2 半音 E 小調→F# 小調、低音 8 分音符、短促鼓）----
  SONGS.boss2 = variation('boss', {
    bpm: 184, semis: 2, vol: { p1: 0.19, p2: 0.11, bass: 0.34 },
    bass: {
      A: [dr8('F#2', 'F#3'), dr8('F#2', 'C#3'), dr8('D2', 'A2'), dr8('C#2', 'G#2'),
        dr8('F#2', 'F#3'), dr8('F#2', 'C#3'), dr8('D2', 'A2'), dr8('C#2', 'G#2')],
      B: [dr8('B2', 'F#3'), dr8('F#2', 'C#3'), dr8('D2', 'A2'), dr8('C#2', 'G#2'),
        dr8('B2', 'F#3'), dr8('F#2', 'C#3'), dr8('D2', 'A2'), dr8('C#2', 'G#2')],
    },
    drum: {
      A: [D.tight, D.tight, D.tight, D.tightF, D.tight, D.tight, D.tight, D.tightF],
      B: [D.tight, D.tight, D.tight, D.tightF, D.tight, D.tight, D.tight, D.tightF],
    },
  });

  // ---- finalboss2：finalboss 的第二階段變奏（BPM +12、升 2 半音 D 小調→E 小調、雙倍鼓）----
  SONGS.finalboss2 = variation('finalboss', {
    bpm: 196, semis: 2, gain: 0.95,
    drum: {
      A: [D.dblH, D.dblH, D.dblH, D.tightF, D.dblH, D.dblH, D.dblH, D.tightF],
      B: [D.dblH, D.dblH, D.dblH, D.tightF, D.dblH, D.dblH, D.dblH, D.tightF],
    },
  });

  // ---- secret：秘密房，A 小調 8 小節神祕短循環（A/B 各 4 小節，order 走兩輪）----
  SONGS.secret = {
    bpm: 100, loop: true, gain: 0.85, order: ['A', 'B', 'A', 'B'],
    inst: { p1: 'p12', p2: 'sine' }, vol: { p1: 0.16, p2: 0.1, bass: 0.24 },
    sec: {
      A: {
        p1: ['A5 - - - . . C6 - B5 - - - - - - -',
          'E5 - - - . . G#5 - A5 - - - - - - -',
          'D6 - - - C6 - B5 - A5 - - - G#5 - - -',
          'A5 - - - - - - - . . . . . . . .'],
        p2: [arpE('A4', 'C5', 'E5', 'C5'), arpE('E4', 'G#4', 'B4', 'G#4'),
          arpE('F4', 'A4', 'D5', 'A4'), arpE('E4', 'G#4', 'B4', 'G#4')],
        bass: [hold('A2'), hold('E2'), hold('F2'), hold('E2')],
        drum: [D.hats, D.none, D.hats, D.sparse],
      },
      B: {
        p1: ['F5 - - - A5 - - - C6 - - - - - - -',
          'E5 - - - G5 - - - B5 - - - - - - -',
          'C6 - B5 - A5 - G#5 - F5 - E5 - D5 - C5 -',
          'B4 - - - - - - - E5 - - - . . . .'],
        p2: [arpE('F4', 'A4', 'C5', 'A4'), arpE('E4', 'G4', 'B4', 'G4'),
          arpE('A4', 'C5', 'E5', 'C5'), arpE('E4', 'G#4', 'B4', 'G#4')],
        bass: [hold('F2'), hold('E2'), hold('A2'), hold('E2')],
        drum: [D.hats, D.none, D.hats, D.sparse2],
      },
    },
  };

  // ---- miniboss：中魔王，A 小調 16 小節緊湊 loop ----
  {
    const A1 = 'A5 A5 - E5 - A5 - C6 - - B5 - A5 - - -';
    const A2 = 'G5 G5 - D5 - G5 - B5 - - A5 - G5 - - -';
    const B1 = 'E6 - - - C6 - E6 - A5 - - - C6 - E6 -';
    const B2 = 'D6 - - - B5 - D6 - G5 - - - B5 - D6 -';
    const END = 'A5 - - - E5 - - - A4 - - - . . . .';
    SONGS.miniboss = {
      bpm: 168, loop: true, order: ['A', 'B'], inst: { p1: 'sq' }, vol: { p1: 0.19, p2: 0.11, bass: 0.3 },
      sec: {
        A: {
          p1: [A1, A2,
            'F5 - A5 - C6 - A5 - E5 - G5 - B5 - G5 -',
            'E5 - - - . . G#5 - B5 - - - E5 - . .',
            A1, A2,
            'F5 - - - E5 - D5 - C6 - - - B5 - A5 -',
            END],
          p2: [stab('C5', 'E5'), stab('B4', 'D5'), stab('A4', 'C5'), stab('G#4', 'B4'),
            stab('C5', 'E5'), stab('B4', 'D5'), stab('A4', 'C5'), stab('G#4', 'B4')],
          bass: [dr8('A2', 'A3'), dr8('G2', 'G3'), dr8('F2', 'C3'), dr8('E2', 'B2'),
            dr8('A2', 'A3'), dr8('G2', 'G3'), dr8('F2', 'C3'), dr8('E2', 'B2')],
          drum: [D.boss, D.boss, D.boss, D.bossF, D.boss, D.boss, D.boss, D.bossF],
        },
        B: {
          p1: [B1, B2,
            'C6 - E6 - A6 - - - G#6 - E6 - C6 - A5 -',
            'B5 - - - E6 - - - B5 - G#5 - E5 - . .',
            B1, B2,
            'F6 - E6 - D6 - C6 - B5 - A5 - G#5 - B5 -',
            END],
          p2: [stab('C5', 'E5'), stab('B4', 'D5'), stab('C5', 'E5'), stab('G#4', 'B4'),
            stab('C5', 'E5'), stab('B4', 'D5'), stab('A4', 'C5'), stab('G#4', 'B4')],
          bass: [dr8('A2', 'E3'), dr8('G2', 'D3'), dr8('A2', 'E3'), dr8('E2', 'B2'),
            dr8('A2', 'E3'), dr8('G2', 'D3'), dr8('F2', 'C3'), dr8('E2', 'B2')],
          drum: [D.tight, D.tight, D.tight, D.tightF, D.tight, D.tight, D.tight, D.tightF],
        },
      },
    };
  }

  // ======================================================================
  // Round 2（audio2）：結算 / 競技場 / 關卡開場 / 各世界第二首曲
  // ======================================================================

  // ---- result：結算，C 大調 8 小節明亮號角（不循環，結尾停在主和弦）----
  SONGS.result = {
    bpm: 140, loop: false, order: ['A'],
    sec: {
      A: {
        p1: ['C5 - E5 - G5 - - - C6 - - - - - - -',
          'A5 - - - G5 - E5 - F5 - - - - - . .',
          'D5 - F5 - A5 - - - D6 - - - - - - -',
          'C6 - - - B5 - A5 - G5 - - - - - . .',
          'E5 - G5 - C6 - E6 - G6 - - - - - - -',
          'F6 - E6 - D6 - C6 - E6 - - - - - . .',
          'D6 - - - F6 - - - E6 - - - G6 - - -',
          'C6 - - - - - - - - - - - - - - -'],
        p2: ['E4 - G4 - C5 - - - E5 - - - - - - -',
          'C5 - - - B4 - G4 - A4 - - - - - . .',
          'F4 - A4 - D5 - - - F5 - - - - - - -',
          'E5 - - - D5 - C5 - B4 - - - - - . .',
          'G4 - C5 - E5 - G5 - C6 - - - - - - -',
          'A5 - G5 - F5 - E5 - G5 - - - - - . .',
          'F5 - - - A5 - - - G5 - - - B5 - - -',
          'E5 - - - - - - - - - - - - - - -'],
        bass: [half('C3', 'C3'), half('F2', 'G2'), half('D3', 'D3'), half('G2', 'G2'),
          half('C3', 'E3'), half('F2', 'C3'), half('G2', 'D3'), hold('C3')],
        drum: ['k . . . s . . . k . . . s . . .', 'k . . . s . . . k . . . s . . .',
          'k . . . s . . . k . . . s . . .', 'k . . . s . . . k . . . s . s s',
          'k . h . s . h . k . h . s . h .', 'k . h . s . h . k . h . s . h .',
          'k . h . s . h . k . s . s s s s', 'c . . . . . . . . . . . . . . .'],
      },
    },
  };

  // ---- w_intro：關卡開場 2 小節短句（不循環）----
  SONGS.w_intro = {
    bpm: 160, loop: false, order: ['A'],
    sec: {
      A: {
        p1: ['C5 - E5 - G5 - C6 - E6 - - - D6 - - -',
          'G6 - - - E6 - C6 - G5 - - - - - - -'],
        p2: ['E4 - G4 - C5 - E5 - G5 - - - F5 - - -',
          'B5 - - - G5 - E5 - C5 - - - - - - -'],
        bass: [half('C3', 'G2'), hold('C3')],
        drum: ['k . . . s . . . k . . . s . s s', 'c . . . . . . . . . . . . . . .'],
      },
    },
  };

  // ---- arena：競技場（Boss Rush）E 小調、BPM 160、緊湊 16 小節 loop ----
  {
    const A1 = 'E5 - B4 - E5 - G5 - B5 - - - A5 - G5 -';
    const A2 = 'F#5 - - - A5 - F#5 - E5 - - - B4 - - -';
    const B1 = 'B5 - - - E6 - - - D6 - B5 - A5 - G5 -';
    const B2 = 'F#5 - - - A5 - - - G5 - E5 - D5 - . .';
    SONGS.arena = {
      bpm: 160, loop: true, order: ['A', 'B'], inst: { p1: 'sq' }, vol: { p1: 0.19, p2: 0.11, bass: 0.32 },
      sec: {
        A: {
          p1: [A1, A2,
            'G5 - D5 - G5 - B5 - D6 - - - C6 - B5 -',
            'A5 - - - C6 - A5 - F#5 - - - . . . .',
            A1, A2,
            'C6 - - - B5 - A5 - G5 - - - F#5 - - -',
            'B5 - - - F#5 - - - E5 - - - . . . .'],
          p2: [stab('G4', 'B4'), stab('A4', 'C5'), stab('G4', 'B4'), stab('F#4', 'A4'),
            stab('G4', 'B4'), stab('E4', 'A4'), stab('G4', 'C5'), stab('F#4', 'B4')],
          bass: [dr8('E2', 'E3'), dr8('D2', 'A2'), dr8('G2', 'D3'), dr8('A2', 'E3'),
            dr8('E2', 'E3'), dr8('C2', 'G2'), dr8('A2', 'E3'), dr8('B2', 'F#3')],
          drum: [D.tight, D.tight, D.tight, D.tightF, D.tight, D.tight, D.tight, D.tightF],
        },
        B: {
          p1: [B1, B2,
            'C6 - - - E6 - - - G6 - - - F#6 - E6 -',
            'D6 - - - B5 - - - G5 - - - . . . .',
            B1, B2,
            'F#5 - A5 - C6 - E6 - D6 - C6 - B5 - A5 -',
            'E5 - - - - - - - . . B4 - D5 - F#5 -'],
          p2: [stab('E4', 'G4'), stab('D4', 'F#4'), stab('E4', 'G4'), stab('G4', 'B4'),
            stab('E4', 'G4'), stab('F#4', 'A4'), stab('D4', 'F#4'), stab('E4', 'B4')],
          bass: [dr8('E2', 'B2'), dr8('D2', 'A2'), dr8('C2', 'G2'), dr8('G2', 'D3'),
            dr8('E2', 'B2'), dr8('F#2', 'C#3'), dr8('D2', 'A2'), dr8('E2', 'B2')],
          drum: [D.tight, D.tight, D.tight, D.tightF, D.tight, D.tight, D.tight, D.bossF],
        },
      },
    };
  }

  // ---- arena_rest：競技場休息房，G 大調 8 小節柔和 loop（order 走兩輪 = 16 小節）----
  SONGS.arena_rest = {
    bpm: 96, loop: true, gain: 0.85, order: ['A', 'B', 'A', 'B'],
    inst: { p1: 'sq', p2: 'p12' }, vol: { p1: 0.16, p2: 0.1, bass: 0.24 },
    sec: {
      A: {
        p1: ['D5 - - - G5 - - - B5 - - - - - - -',
          'A5 - - - - - G5 - E5 - - - D5 - - -',
          'C5 - E5 - G5 - - - A5 - - - B5 - - -',
          'G5 - - - - - - - . . . . D5 - - -'],
        p2: [arpE('G4', 'B4', 'D5', 'B4'), arpE('E4', 'G4', 'B4', 'G4'),
          arpE('C4', 'E4', 'G4', 'E4'), arpE('D4', 'F#4', 'A4', 'F#4')],
        bass: [hold('G2'), hold('E2'), hold('C3'), hold('D3')],
        drum: [D.quiet, D.quiet, D.quiet, D.sparse],
      },
      B: {
        p1: ['B5 - - - A5 - - - G5 - - - - - - -',
          'E5 - - - G5 - - - A5 - - - B5 - - -',
          'D6 - - - - - B5 - G5 - - - A5 - - -',
          'G5 - - - - - - - - - - - . . . .'],
        p2: [arpE('G4', 'B4', 'E5', 'B4'), arpE('E4', 'A4', 'C5', 'A4'),
          arpE('G4', 'B4', 'D5', 'B4'), arpE('D4', 'G4', 'B4', 'G4')],
        bass: [hold('E2'), hold('A2'), hold('G2'), hold('D3')],
        drum: [D.quiet, D.quiet, D.quiet, D.none],
      },
    },
  };

  // ---- green2：草原第二曲（C 大調，與 green 同調不同旋律，供後半房間）----
  {
    const A1 = 'E5 - G5 - C6 - - - B5 - C6 - D6 - - -';
    const B1 = 'A5 - - - G5 - A5 - C6 - - - A5 - G5 -';
    SONGS.green2 = {
      bpm: 158, loop: true, order: ['A', 'B'],
      sec: {
        A: {
          p1: [A1,
            'A5 - C6 - E6 - - - D6 - C6 - A5 - - -',
            'F5 - A5 - C6 - - - A5 - G5 - F5 - E5 -',
            'D5 - - - G5 - - - B5 - - - D6 - - -',
            A1,
            'A5 - C6 - E6 - - - G6 - E6 - C6 - - -',
            'D6 - B5 - G5 - A5 - B5 - - - D6 - - -',
            'C6 - - - - - - - . . . . E5 F5 G5 -'],
          p2: [cmp('E4', 'G4'), cmp('E4', 'A4'), cmp('F4', 'A4'), cmp('D4', 'G4'),
            cmp('E4', 'G4'), cmp('E4', 'A4'), cmp('D4', 'G4'), 'E4 - G4 - C5 - - - . . . . . . . .'],
          bass: [oom('C3', 'G2'), oom('A2', 'E3'), oom('F2', 'C3'), oom('G2', 'D3'),
            oom('C3', 'G2'), oom('A2', 'E3'), oom('G2', 'D3'), 'C3 - - . G2 - - . C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
        B: {
          p1: [B1,
            'B5 - - - A5 - B5 - D6 - - - B5 - A5 -',
            'G5 - B5 - D6 - G6 - E6 - D6 - B5 - G5 -',
            'A5 - - - C6 - - - E6 - - - - - . .',
            B1,
            'B5 - - - A5 - B5 - D6 - - - F6 - E6 -',
            'C6 - D6 - E6 - G6 - F6 - E6 - D6 - C6 -',
            'G5 - - - E5 - - - C5 - - - . . . .'],
          p2: [tres('F4', 'A4', 'C5'), tres('G4', 'B4', 'D5'), tres('E4', 'G4', 'B4'), tres('E4', 'A4', 'C5'),
            tres('F4', 'A4', 'C5'), tres('G4', 'B4', 'D5'), tres('E4', 'G4', 'C5'), 'E4 - - - G4 - - - C5 - - - . . . .'],
          bass: [oom('F2', 'C3'), oom('G2', 'D3'), oom('E2', 'B2'), oom('A2', 'E3'),
            oom('F2', 'C3'), oom('G2', 'D3'), oom('C3', 'G2'), 'C3 - - - G2 - - - C3 - - - . . . .'],
          drum: [D.basic, D.basic, D.basic, D.fill, D.basic, D.basic, D.basic, D.fill],
        },
      },
    };
  }

  // ---- castle2：城堡第二曲（D 小調，比 castle 多一點推進感）----
  {
    const Dm = arpE('D4', 'F4', 'A4', 'F4'), Bb = arpE('Bb3', 'D4', 'F4', 'D4'), A = arpE('A3', 'C#4', 'E4', 'C#4'),
      Gm = arpE('G3', 'Bb3', 'D4', 'Bb3'), C = arpE('C4', 'E4', 'G4', 'E4');
    const bs = (r, f) => `${r} - - - - - - - ${r} - - - ${f} - ${r} -`;
    const A1 = 'A4 - - - D5 - - - F5 - - - E5 - - -';
    const B1 = 'F5 - - - E5 - D5 - A5 - - - - - - -';
    SONGS.castle2 = {
      bpm: 108, loop: true, gain: 0.9, order: ['A', 'B'], inst: { p1: 'sq' },
      sec: {
        A: {
          p1: [A1,
            'D5 - - - - - - - C#5 - - - - - . .',
            'D5 - F5 - A5 - - - G5 - F5 - E5 - - -',
            'F5 - - - - - - - - - - - . . . .',
            A1,
            'G5 - - - - - - - F5 - E5 - D5 - - -',
            'Bb4 - - - D5 - - - G5 - - - F5 - E5 -',
            'D5 - - - - - - - - - - - - - - -'],
          p2: [Dm, Dm, Gm, Dm, Dm, Bb, Gm, A],
          bass: [bs('D2', 'A2'), bs('D2', 'A2'), bs('G2', 'D2'), bs('D2', 'A2'),
            bs('D2', 'A2'), bs('Bb2', 'F2'), bs('G2', 'D2'), hold('A2')],
          drum: [D.sparse, D.sparse2, D.sparse, D.sparse2, D.sparse, D.sparse2, D.sparse, D.sparse2],
        },
        B: {
          p1: [B1,
            'G5 - - - F5 - E5 - D5 - - - C#5 - - -',
            'D6 - - - A5 - F5 - D5 - - - E5 - - -',
            'F5 - - - - - - - . . . . . . . .',
            B1,
            'A5 - - - G5 - F5 - E5 - - - D5 - - -',
            'C#5 - E5 - A5 - - - G5 - F5 - E5 - D5 -',
            'D5 - - - - - - - A4 - - - . . . .'],
          p2: [Bb, A, Dm, Dm, Bb, Gm, C, Dm],
          bass: [bs('Bb2', 'F2'), bs('A2', 'E2'), bs('D2', 'A2'), bs('D2', 'A2'),
            bs('Bb2', 'F2'), bs('G2', 'D2'), bs('C3', 'G2'), hold('D2')],
          drum: [D.sparse2, D.sparse2, D.sparse2, D.sparse, D.sparse2, D.sparse2, D.sparse2, D.sparse],
        },
      },
    };
  }

  // ---- island2：海島第二曲（F 大調 calypso，比 island 更律動）----
  {
    const A1 = '. . F5 - A5 - . C6 - - A5 - G5 - - -';
    const B1 = 'C6 - - - . A5 - - F5 - - - G5 - - -';
    SONGS.island2 = {
      bpm: 106, loop: true, order: ['A', 'B'], inst: { p1: 'sq', p2: 'p25' },
      sec: {
        A: {
          p1: [A1,
            '. . G5 - Bb5 - . D6 - - C6 - A5 - - -',
            '. . A5 - C6 - . F6 - - D6 - C6 - - -',
            '. . G5 - E5 - . C5 - - F5 - - - - -',
            A1,
            '. . G5 - Bb5 - . D6 - - C6 - Bb5 - - -',
            '. . A5 - C6 - . E6 - - D6 - C6 - A5 -',
            'F5 - - - - - - - . . . . . . . .'],
          p2: [cal('A4', 'C5'), cal('G4', 'Bb4'), cal('A4', 'C5'), cal('G4', 'C5'),
            cal('A4', 'C5'), cal('G4', 'Bb4'), cal('A4', 'D5'), cal('A4', 'C5')],
          bass: [syn('F2', 'C3'), syn('G2', 'D3'), syn('F2', 'C3'), syn('C3', 'G2'),
            syn('F2', 'C3'), syn('G2', 'D3'), syn('D3', 'A2'), syn('F2', 'C3')],
          drum: [D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp],
        },
        B: {
          p1: [B1,
            'A5 - - - . G5 - - E5 - - - C5 - - -',
            'D6 - - - . C6 - - Bb5 - - - A5 - - -',
            'G5 - - - . Bb5 - - A5 - - - - - . .',
            B1,
            'D6 - - - . C6 - - Bb5 - - - D6 - - -',
            'E6 - - - . D6 - - C6 - - - Bb5 - G5 -',
            'F5 - - - - - - - . . . . . . . .'],
          p2: [cal('A4', 'C5'), cal('G4', 'C5'), cal('A4', 'D5'), cal('G4', 'Bb4'),
            cal('A4', 'C5'), cal('G4', 'Bb4'), cal('G4', 'C5'), cal('A4', 'C5')],
          bass: [syn('F2', 'C3'), syn('C3', 'G2'), syn('D3', 'A2'), syn('G2', 'D3'),
            syn('F2', 'C3'), syn('G2', 'D3'), syn('C3', 'G2'), syn('F2', 'C3')],
          drum: [D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp, D.calyp],
        },
      },
    };
  }

  // ---- cloud2：雲之國第二曲（D 大調，長音旋律 + 十六分琶音）----
  {
    const Dm7 = arpUD('D4', 'F#4', 'A4', 'C#5'), G7 = arpUD('G4', 'B4', 'D5', 'F#5'),
      Bm = arpUD('B3', 'D4', 'F#4', 'A4'), A = arpUD('A3', 'C#4', 'E4', 'A4'), Em = arpUD('E4', 'G4', 'B4', 'E5');
    const A1 = 'A5 - - - - - F#5 - D5 - - - E5 - - -';
    const B1 = 'B5 - - - A5 - F#5 - E5 - - - - - - -';
    SONGS.cloud2 = {
      bpm: 120, loop: true, order: ['A', 'B'], vol: { p2: 0.1 },
      sec: {
        A: {
          p1: [A1,
            'F#5 - - - - - - - A5 - - - B5 - - -',
            'D6 - - - C#6 - - - B5 - - - A5 - - -',
            'F#5 - - - - - - - - - - - . . . .',
            A1,
            'F#5 - - - - - - - E5 - - - D5 - - -',
            'B5 - - - D6 - - - F#6 - - - E6 - - -',
            'D6 - - - - - - - . . . . . . . .'],
          p2: [Dm7, Bm, G7, A, Dm7, Bm, G7, Dm7],
          bass: [hold('D2'), hold('B2'), hold('G2'), hold('A2'), hold('D2'), hold('B2'), hold('G2'), hold('D2')],
          drum: [D.hats, D.soft, D.hats, D.soft, D.hats, D.soft, D.hats, D.soft],
        },
        B: {
          p1: [B1,
            'G5 - - - A5 - B5 - D6 - - - C#6 - - -',
            'E6 - - - - - D6 - B5 - - - A5 - - -',
            'F#5 - - - - - - - . . . . . . . .',
            B1,
            'A5 - - - - - B5 - C#6 - - - D6 - - -',
            'F#6 - - - E6 - - - D6 - - - B5 - - -',
            'A5 - - - - - - - D6 - - - . . . .'],
          p2: [Em, G7, Bm, A, Em, G7, A, Dm7],
          bass: [hold('E2'), hold('G2'), hold('B2'), hold('A2'), hold('E2'), hold('G2'), half('A2', 'A2'), hold('D2')],
          drum: [D.soft, D.soft, D.soft, D.hats, D.soft, D.soft, D.soft, D.hats],
        },
      },
    };
  }

  // ---- dedede2：城主第二曲（Bb 大調進行曲，比 dedede 更高亢）----
  {
    const A1 = 'F5 - - Bb5 D6 - - - C6 - - Bb5 A5 - - -';
    const B1 = 'D6 - - - F6 - - - Bb6 - - - - - - -';
    SONGS.dedede2 = {
      bpm: 126, loop: true, order: ['A', 'B'], inst: { p1: 'sq', p2: 'p25' },
      sec: {
        A: {
          p1: [A1,
            'Bb5 - - - F5 - - - D5 - - - - - . .',
            'Eb5 - - G5 Bb5 - - - C6 - - Bb5 G5 - - -',
            'F5 - - - C5 - - - F5 - - - - - - -',
            A1,
            'C6 - - - Eb6 - - - D6 - - C6 Bb5 - - -',
            'G5 - - Bb5 Eb6 - - - D6 - - - C6 - - -',
            'Bb5 - - - F5 - - - Bb5 - - - . . . .'],
          p2: [mar('D4', 'F4'), mar('D4', 'F4'), mar('Eb4', 'G4'), mar('C4', 'F4'),
            mar('D4', 'F4'), mar('C4', 'Eb4'), mar('D4', 'G4'), 'D4 - - - F4 - - - Bb3 - - - . . . .'],
          bass: [oct('Bb2', 'F2'), oct('Bb2', 'F2'), oct('Eb2', 'Bb2'), oct('F2', 'C3'),
            oct('Bb2', 'F2'), oct('C3', 'G2'), oct('Eb2', 'Bb2'), 'Bb2 - . . F2 - . . Bb2 - - - . . . .'],
          drum: [D.march, D.march, D.march, D.marchF, D.march, D.march, D.march, D.marchF],
        },
        B: {
          p1: [B1,
            'A6 - - - F6 - - - D6 - - - - - . .',
            'Eb6 - - - C6 - Eb6 - G6 - - - F6 - - -',
            'Eb6 - - D6 C6 - - - Bb5 - - - - - - -',
            B1,
            'G6 - - - Eb6 - - - C6 - - - - - - -',
            'F6 - - Eb6 D6 - - C6 Bb5 - - - D6 - - -',
            'Bb5 - - - - - - - . . . . . . . .'],
          p2: [mar('D4', 'F4'), mar('D4', 'F4'), mar('Eb4', 'G4'), mar('C4', 'Eb4'),
            mar('D4', 'F4'), mar('Eb4', 'G4'), mar('C4', 'F4'), 'D4 - - - Bb3 - - - . . . . . . . .'],
          bass: [oct('Bb2', 'F2'), oct('Bb2', 'F2'), oct('Eb2', 'Bb2'), oct('C3', 'G2'),
            oct('Bb2', 'F2'), oct('Eb2', 'Bb2'), oct('F2', 'C3'), 'Bb2 - . . F2 - . . Bb2 - - - . . . .'],
          drum: [D.march, D.march, D.march, D.marchF, D.march, D.march, D.march, D.marchF],
        },
      },
    };
  }

  // ---- Round 5（audio5）----
  // ultimate_loop：必殺期間的 2 小節高張力 loop（A 小調、BPM 180、十六分驅動 + 雙倍鼓）
  //   素材 A / B 各 2 小節，order 交替 8 次 → 16 小節，聽感仍是「2 小節一循環」的緊迫感
  SONGS.ultimate_loop = {
    bpm: 180, loop: true, gain: 1.05, order: ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'],
    sec: {
      A: {
        p1: ['A5 - E6 - A6 - G6 - E6 - D6 - C6 - B5 -',
          'A5 - C6 - E6 - G6 - F6 - E6 - D6 - C6 -'],
        p2: ['A4 - E5 - A4 - E5 - A4 - E5 - A4 - E5 -',
          'F4 - C5 - F4 - C5 - G4 - D5 - G4 - D5 -'],
        bass: ['A2 . A2 . A2 . A2 . A2 . A2 . A2 . G2 .',
          'F2 . F2 . F2 . F2 . G2 . G2 . G2 . G2 .'],
        drum: [D.dblH, D.dblH],
      },
      B: {
        p1: ['E6 - A6 - E6 - C6 - A5 - B5 - C6 - E6 -',
          'F6 - E6 - D6 - C6 - B5 - - - . . . .'],
        p2: ['C5 - E5 - C5 - E5 - A4 - E5 - A4 - E5 -',
          'F4 - C5 - G4 - D5 - E4 - B4 - E4 - G4 -'],
        bass: ['A2 . A2 . C3 . C3 . A2 . A2 . E2 . E2 .',
          'F2 . F2 . G2 . G2 . A2 . A2 . A2 . E2 .'],
        drum: [D.dblH, D.fill],
      },
    },
  };

  // transform_jingle：變身用 1 小節短句（C 大調上行，不循環，2.0 秒）
  //   與 sfx('transform') 同時呼叫會太厚，兩者擇一即可（通常直接用 sfx）
  SONGS.transform_jingle = {
    bpm: 120, loop: false,
    sec: {
      A: {
        p1: ['C5 E5 G5 C6 E6 G6 C7 - - - - - - - - -'],
        p2: ['E4 - G4 - C5 - E5 - G5 - - - - - - -'],
        bass: ['C3 - - - G2 - - - C3 - - - C3 - - -'],
        drum: ['k . . . h . . . k . s . c . . .'],
      },
    },
  };

  // ======================================================================
  // 音序器
  // ======================================================================
  const TRACKS = ['p1', 'p2', 'bass', 'drum'];
  const DEF_INST = { p1: 'p25', p2: 'p12', bass: 'tri' };
  const DEF_VOL = { p1: 0.2, p2: 0.12, bass: 0.28 };
  const STEPS = 16;

  // 展開段落順序 → 每軌 token 陣列（長度 = 小節數 × 16）
  function compileSong(song) {
    const order = song.order || Object.keys(song.sec);
    const tracks = { p1: [], p2: [], bass: [], drum: [] };
    for (const name of order) {
      const sec = song.sec[name] || {};
      const nb = Math.max.apply(null, TRACKS.map(k => (sec[k] || []).length));
      for (const k of TRACKS) {
        const bars = sec[k] || [];
        for (let b = 0; b < nb; b++) {
          const toks = bars[b] ? bars[b].trim().split(/\s+/) : [];
          for (let i = 0; i < STEPS; i++) tracks[k].push(toks[i] || '.');
        }
      }
    }
    return { tracks, len: tracks.p1.length, bars: tracks.p1.length / STEPS, stepDur: 60 / song.bpm / 4 };
  }

  function seqNote(bus, w, f, t0, dur, vol, lead) {
    const o = { attack: 0.004, release: 0.02, decay: 0.12, sustain: 0.75 };
    if (lead && dur > 0.3) o.vib = { rate: 5.5, depth: 0.004, delay: 0.12 };
    tone(bus, w, f, t0, dur, vol, o);
  }
  function drum(bus, k, t) {
    if (k === 'k') tone(bus, 'tri', 170, t, 0.11, 0.6, { to: 45, slideT: 0.07, attack: 0.002, release: 0.05 });
    else if (k === 's') { noise(bus, t, 0.11, 0.28, { type: 'bandpass', f0: 1800, q: 0.6, release: 0.06 }); tone(bus, 'tri', 220, t, 0.06, 0.3, { to: 120, attack: 0.002 }); }
    else if (k === 'h') noise(bus, t, 0.03, 0.13, { type: 'highpass', f0: 8000, release: 0.02 });
    else if (k === 'o') noise(bus, t, 0.12, 0.13, { type: 'highpass', f0: 7000, release: 0.06 });
    else if (k === 'c') noise(bus, t, 0.5, 0.2, { type: 'highpass', f0: 5000, release: 0.3 });
  }
  // 排程第 i 步（時間 t）。p = { bus, song, tracks, stepDur }
  function scheduleStep(p, i, t) {
    const s = p.song, sd = p.stepDur;
    for (let k = 0; k < 3; k++) {
      const name = TRACKS[k], tr = p.tracks[name], tok = tr[i];
      if (!tok || tok === '-' || tok === '.') continue;
      const f = noteFreq(tok); if (!f) continue;
      let n = 1; while (i + n < tr.length && tr[i + n] === '-') n++;
      const inst = (s.inst && s.inst[name]) || DEF_INST[name];
      const vol = (s.vol && s.vol[name]) || DEF_VOL[name];
      seqNote(p.bus, inst, f, t, n * sd - 0.015, vol, name === 'p1');
    }
    const d = p.tracks.drum[i];
    if (d && d !== '.' && d !== '-') drum(p.bus, d, t);
  }

  let cur = null, timer = null;
  function tick() {
    if (!cur || !ctx) return;
    const p = cur, now = ctx.currentTime;
    if (p.nextT < now - 0.05) p.nextT = now + 0.02;      // 分頁被凍結後直接追上，不補播
    while (!p.ended && p.nextT < now + LOOKAHEAD) {
      scheduleStep(p, p.step, p.nextT);
      p.nextT += p.stepDur; p.step++;
      if (p.step >= p.len) { if (p.song.loop === false) p.ended = true; else p.step = 0; }
    }
    if (p.ended && timer) { clearInterval(timer); timer = null; }
  }
  function fadeOutCurrent() {
    if (!cur) return;
    const p = cur; cur = null;
    try {
      const t = ctx.currentTime;
      p.bus.gain.cancelScheduledValues(t); p.bus.gain.setTargetAtTime(0, t, 0.1);
      setTimeout(() => { try { p.bus.disconnect(); } catch (e) { } }, 1500);
    } catch (e) { }
  }
  function startSong(key) {
    const song = SONGS[key]; if (!song) return;
    fadeOutCurrent();
    const g = ctx.createGain(); g.gain.value = 0; g.connect(musicBus);
    const t = ctx.currentTime;
    g.gain.setTargetAtTime(song.gain || 1, t, 0.03);
    const c = compileSong(song);
    cur = { key, song, bus: g, tracks: c.tracks, len: c.len, stepDur: c.stepDur, step: 0, nextT: t + 0.05, ended: false };
    if (!timer) timer = setInterval(() => { try { tick(); } catch (e) { } }, TICK_MS);
    tick();
  }
  function startPending() {
    if (pendingAmb !== undefined) { const a = pendingAmb; pendingAmb = undefined; KB.audio.ambient(a); }
    if (pendingMusic === undefined) return;
    const k = pendingMusic; pendingMusic = undefined;
    KB.audio.music(k);
  }

  // ---- 環境音層的播放狀態（與音樂完全獨立）----
  let ambCur = null, pendingAmb = undefined;
  function stopAmbient(fade) {
    if (!ambCur) return;
    try { ambCur.stop(ctx ? ctx.currentTime : 0, fade || 0.5); } catch (e) { }
    ambCur = null;
  }

  // 離線渲染（測試工具用）：回傳 Promise<AudioBuffer>
  function withOffline(seconds, fn) {
    return new Promise((resolve, reject) => {
      if (!OAC) { reject(new Error('no OfflineAudioContext')); return; }
      const sr = 44100, oc = new OAC(1, Math.ceil(sr * seconds), sr);
      const saved = [ctx, res]; ctx = oc; res = makeRes(oc);
      try {
        const bus = oc.createGain(); bus.connect(oc.destination);
        fn(oc, bus);
      } catch (e) { ctx = saved[0]; res = saved[1]; reject(e); return; }
      ctx = saved[0]; res = saved[1];
      oc.startRendering().then(resolve, reject);
    });
  }
  function renderSong(key, seconds) {
    const song = SONGS[key]; if (!song) return Promise.reject(new Error('unknown song ' + key));
    const c = compileSong(song);
    if (seconds === undefined) seconds = (song.loop === false ? c.bars * 16 * c.stepDur + 1.5 : c.bars * 16 * c.stepDur);
    return withOffline(seconds, (oc, bus) => {
      bus.gain.value = VOL.master * VOL.music * (song.gain || 1);
      const p = { bus, song, tracks: c.tracks, stepDur: c.stepDur };
      let t = 0.02, i = 0;
      while (t < seconds) { scheduleStep(p, i, t); t += c.stepDur; i++; if (i >= c.len) { if (song.loop === false) break; i = 0; } }
    });
  }
  function renderAmbient(key, seconds) {
    if (!AMBIENT[key]) return Promise.reject(new Error('unknown ambient ' + key));
    seconds = seconds || 4;
    return withOffline(seconds, (oc, bus) => {
      bus.gain.value = VOL.master * VOL.sfx;
      const v = makeAmbient(bus, 0.02, key);
      if (v) v.stop(Math.max(0.1, seconds - 0.45), 0.35);
    });
  }
  function renderSfx(name, seconds) {
    const fn = SFX[name]; if (!fn) return Promise.reject(new Error('unknown sfx ' + name));
    seconds = seconds || 2.5;
    return withOffline(seconds, (oc, bus) => { bus.gain.value = VOL.master * VOL.sfx; fn(bus, 0.02, seconds - 0.3); });
  }

  // ======================================================================
  // 對外介面
  // ======================================================================
  const lastPlay = {};
  KB.audio = {
    get ctx() { return ctx; },
    get unlocked() { return unlocked; },
    get muted() { return muted; },
    musicKey: null,
    ambientKey: null,
    SFX_NAMES: Object.keys(SFX),
    MUSIC_NAMES: Object.keys(SONGS),
    AMBIENT_NAMES: Object.keys(AMBIENT),
    SFX_THROTTLE, THROTTLE_MS,
    SONGS, AMBIENT, TRACKS, compileSong, noteFreq, renderSong, renderSfx, renderAmbient,

    // 第一次使用者輸入時呼叫（keydown / pointerdown / 手把）
    unlock() {
      try {
        if (!AC) return;
        if (!volFromSave && KB.save) loadVolume();   // game.js 建立 KB.save 之後才讀得到存檔設定
        if (!ctx) createCtx();
        if (ctx.state === 'running') { unlocked = true; startPending(); return; }
        const p = ctx.resume && ctx.resume();
        if (p && p.then) p.then(() => { unlocked = true; startPending(); }).catch(() => { });
      } catch (e) { }
    },
    sfx(name) {
      try {
        const fn = SFX[name];
        if (!fn) { warnOnce('unknown sfx: ' + name); return; }
        if (!ctx || !unlocked || muted || ctx.state !== 'running') return;
        const n = nowMs();
        const th = (SFX_THROTTLE[name] !== undefined) ? SFX_THROTTLE[name] : THROTTLE_MS;
        if (th && lastPlay[name] && n - lastPlay[name] < th) return;
        lastPlay[name] = n;
        if (name === 'ability') duckFor(0.4);        // 能力取得 jingle：音樂短暫閃避
        fn(sfxBus, ctx.currentTime + 0.005);
      } catch (e) { }
    },
    music(key) {
      try {
        if (key === undefined) key = null;
        if (key !== null && !SONGS[key]) { warnOnce('unknown music: ' + key); key = null; }
        this.musicKey = key;
        if (!ctx || !unlocked || ctx.state !== 'running') { pendingMusic = key; if (key === null && cur) fadeOutCurrent(); return; }
        pendingMusic = undefined;
        if (key === null) { fadeOutCurrent(); return; }
        if (cur && cur.key === key && !cur.ended) return;   // 同曲不重啟
        startSong(key);
      } catch (e) { }
    },
    // 環境音層：ambient('water' | 'wind' | 'cave' | 'castle') 開始循環，ambient(null) 淡出停止。
    // 與 music() 完全獨立（music(null) 不會停掉 ambient）；音量跟隨 sfx 音量；同 key 重複呼叫不重啟。
    ambient(key) {
      try {
        if (key === undefined) key = null;
        if (key !== null && !AMBIENT[key]) { warnOnce('unknown ambient: ' + key); key = null; }
        this.ambientKey = key;
        if (!ctx || !unlocked || ctx.state !== 'running') { pendingAmb = key; if (key === null) stopAmbient(0.2); return; }
        pendingAmb = undefined;
        if (ambCur && ambCur.key === key) return;
        stopAmbient(key === null ? 0.6 : 0.35);
        if (key === null) return;
        ambCur = makeAmbient(ambBus || sfxBus, ctx.currentTime + 0.02, key);
      } catch (e) { }
      return this.ambientKey;
    },
    setMute(m) {
      try {
        muted = !!m;
        if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : VOL.master, ctx.currentTime, 0.02);
      } catch (e) { }
    },
    toggleMute() { this.setMute(!muted); return muted; },
    // 音樂 / 音效音量（0~1，任一可省略）。寫入 KB.save.settings.audio 並存檔。
    setVolume(v) {
      try {
        v = v || {};
        let changed = false;
        if (typeof v.music === 'number' && isFinite(v.music)) { UVOL.music = clamp01(v.music); changed = true; }
        if (typeof v.sfx === 'number' && isFinite(v.sfx)) { UVOL.sfx = clamp01(v.sfx); changed = true; }
        if (changed) { applyVolume(true); saveVolume(); }
      } catch (e) { }
      return this.getVolume();
    },
    getVolume() { return { music: UVOL.music, sfx: UVOL.sfx, muted }; },
    // 暫停時呼叫 duck(true) 讓音樂平滑降到 30%，恢復時 duck(false)
    duck(on) {
      try { duckHold = (on === undefined) ? true : !!on; applyVolume(); } catch (e) { }
      return duckHold;
    },
    // 目前播放狀態（除錯 / 測試頁）
    status() {
      return {
        unlocked, muted, ctxState: ctx ? ctx.state : null, playing: cur ? cur.key : null,
        step: cur ? cur.step : 0, bars: cur ? cur.len / STEPS : 0, pending: pendingMusic,
        volume: { music: UVOL.music, sfx: UVOL.sfx }, ducked: duckHold,
        ambient: ambCur ? ambCur.key : null, ambientPending: pendingAmb,
        sfxCount: Object.keys(SFX).length, musicCount: Object.keys(SONGS).length,
        ambientCount: Object.keys(AMBIENT).length,
      };
    },
  };

  loadVolume();   // 啟動時先由 localStorage 讀回音量（KB.save 由 game.js 稍後建立，unlock() 會再讀一次）

  // M 鍵切換靜音；分頁隱藏時暫停 AudioContext（避免背景堆積排程），顯示時恢復
  try {
    if (W.addEventListener) W.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) { KB.audio.unlock(); KB.audio.toggleMute(); } });
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => {
      try {
        if (!ctx) return;
        if (document.hidden) { if (ctx.state === 'running') { autoSusp = true; ctx.suspend(); } }
        else if (autoSusp) { autoSusp = false; ctx.resume(); }
      } catch (e) { }
    });
  } catch (e) { }
})();
