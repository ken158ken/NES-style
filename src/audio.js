// 音訊：全部以 Web Audio API 即時合成，零外部檔案（agent: audio）
//
// - 音效：振盪器（方波 / 25%、12.5% 脈衝波 / 三角波 / 鋸齒波）+ 白噪音 AudioBuffer + Biquad 濾波 + GainNode 包絡
// - 音樂：自製 4 軌 step sequencer —— p1 主旋律(25% 脈衝)、p2 和聲/對位(12.5% 脈衝)、bass 三角波、drum 噪音鼓
//   每小節 16 步（16 分音符）；音符以 'C4' / 'F#4' / 'Bb3' 表示，'-' 延音，'.' 休止；鼓：k 大鼓 s 小鼓 h 閉鈸 o 開鈸 c 鈸
//   以 AudioContext 時間預排（每 25ms 排未來 100ms），切歌時舊曲淡出；同 key 不重啟；unlock 後自動播放 pending 曲目
// - 所有旋律皆為本專案原創
// - 所有對外呼叫皆 try/catch：無 AudioContext / headless / 尚未 unlock 一律靜默不拋錯；?mute=1 靜音；M 鍵切換靜音
//
// 介面：KB.audio.sfx(name) / music(key|null) / unlock() / setMute(bool) / toggleMute()
//       KB.audio.SFX_NAMES / MUSIC_NAMES / SONGS / compileSong / noteFreq / renderSong / renderSfx（離線渲染，供測試工具）
(function () {
  const W = (typeof window !== 'undefined') ? window : {};
  const AC = W.AudioContext || W.webkitAudioContext || null;
  const OAC = W.OfflineAudioContext || W.webkitOfflineAudioContext || null;
  const VOL = { master: 0.5, sfx: 1.0, music: 0.6 };   // 主音量 0.5；音樂比音效小
  const THROTTLE_MS = 80;                               // 同一音效 80ms 內不重複
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
  let ctx = null, res = null, master = null, comp = null, sfxBus = null, musicBus = null;
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
    sfxBus = ctx.createGain(); sfxBus.gain.value = VOL.sfx; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = VOL.music; musicBus.connect(master);
    if (ctx.addEventListener) ctx.addEventListener('statechange', () => { try { if (ctx.state === 'running') { unlocked = true; startPending(); } } catch (e) { } });
  }
  function setWave(o, w) {
    if (w === 'p25' && res && res.p25) { o.setPeriodicWave(res.p25); return; }
    if (w === 'p12' && res && res.p12) { o.setPeriodicWave(res.p12); return; }
    o.type = (w === 'tri') ? 'triangle' : (w === 'saw') ? 'sawtooth' : (w === 'sine') ? 'sine' : 'square';
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
    ability(b, t) {
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(b, 'p25', F(n), t + i * 0.055, 0.07, 0.22));
      tone(b, 'p25', F('C7'), t + 0.33, 0.35, 0.22, { vib: { rate: 7, depth: 0.01, delay: 0.1 } });
      noise(b, t, 0.5, 0.07, { type: 'highpass', f0: 6000, f1: 9000 });
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
  };

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
    if (pendingMusic === undefined) return;
    const k = pendingMusic; pendingMusic = undefined;
    KB.audio.music(k);
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
    SFX_NAMES: Object.keys(SFX),
    MUSIC_NAMES: Object.keys(SONGS),
    SONGS, TRACKS, compileSong, noteFreq, renderSong, renderSfx,

    // 第一次使用者輸入時呼叫（keydown / pointerdown / 手把）
    unlock() {
      try {
        if (!AC) return;
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
        if (lastPlay[name] && n - lastPlay[name] < THROTTLE_MS) return;
        lastPlay[name] = n;
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
    setMute(m) {
      try {
        muted = !!m;
        if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : VOL.master, ctx.currentTime, 0.02);
      } catch (e) { }
    },
    toggleMute() { this.setMute(!muted); return muted; },
    // 目前播放狀態（除錯 / 測試頁）
    status() { return { unlocked, muted, ctxState: ctx ? ctx.state : null, playing: cur ? cur.key : null, step: cur ? cur.step : 0, bars: cur ? cur.len / STEPS : 0, pending: pendingMusic }; },
  };

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
