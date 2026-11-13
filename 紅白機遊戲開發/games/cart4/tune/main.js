/*
 * games/cart4/tune/main.js — 《星塵旋律 STAR MELODY》（合輯卡帶四，id = tune，全域 CT.Tune）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/*、games/cart1/registry.js、tune/{art,song}.js
 * 舊作概念：music-memory / music-memory-enhanced（只取「聽一段旋律 → 在 8 音鍵盤上彈回去、越來越長」的玩法；
 *           鍵盤是原創的 8 根「星鐘管」、旋律每題依規則當場產生，全部原創）。
 *
 * 8 音鍵盤（C 大調 DO RE MI FA SO LA TI DO）：十字鍵 ← ↓ ↑ → = DO RE MI FA；**按住 B** + ← ↓ ↑ → = SO LA TI 高 DO。
 *   畫面下方每根管子底下都標著唱名 + 方向 + B（對照圖），標題頁另有一張完整對照表。
 * 模式：REPLAY 重彈（主模式，8 級：音數 3→8、音域 DO-MI → 全 8 音、第 5 級起要彈對節奏）/
 *       HIGH-LOW 聽音辨高低（↑ 高 ↓ 低 → 一樣；音程從 8 度縮到半音）/ ODD NOTE 找錯音（聽原句 + 改了一個音的版本，
 *       ←→ 選出被改的那個音按 A）。
 * 提示（標題 ←→ 切換）：HINT ON（預設）＝ 播放時星鐘管跟著亮、上方時間軸畫出音高 ⇒ 聽障 / 靜音也能玩；
 *       HINT OFF ＝「只靠聲音」進階：管子不亮、時間軸只畫節奏點（分數 ×2）。
 * 同步：題目是一首用 driver 播的小曲，畫面「現在亮哪根 / 時間軸畫到哪」全部由 driver 的 row / rowFrame 推回
 *       （不用 Date.now / performance.now）；節奏判定用幀：音距誤差 ≤ max(6 幀, 30%)（整體速度可快慢 ±20%，
 *       先用總長換算成玩家自己的速度再比）；全部 ≤ 4 幀 = PERFECT。顯示時換算成毫秒。
 *       fix-r8 P3-5：容許比例 30% → 35%，且有節奏的級（第 5 級起）可以有 1 個音距超出（≤ 2 倍容許，只拿不到 PERFECT）。
 * fix-r8 P2-6：方向先按、B 晚到 ≤ 4 幀（B_GRACE）仍判高音組（鍵音延後到 B 到或時限到；節奏計時用方向按下那一幀）；
 *       P2-7：同一幀兩個方向一起按下（觸控斜方向）不判定、遊玩中 NES.Touch.setWays(4)；
 *       P3-6：HINT OFF（只靠聲音）開局前 SOUND CHECK（提示 iPhone 靜音開關）。
 * goal = REPLAY 第 6 級過關（不開密技）。
 * 網址：`cart4.html?game=tune&debug=1[&bot=1][&mode=0..2][&hint=0][&seed=N][&lag=N][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TN = CT.Tune = CT.Tune || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var HZ = 60.0988;

  /* ============================== 常數 ============================== */
  var NT_LIMIT = 140, LIVES = 3, MAX_LIVES = 5, GOAL_LV = 6, MAX_LV = 8;
  var READY_F = 120, PREP_F = 24, GOOD_F = 80, MISS_F = 130, LVUP_F = 110, INPUT_TIMEOUT = 480, RESULT_F = 50;
  var RH_MIN = 6, RH_PCT = 0.35, RH_PERFECT = 4, TEMPO_LO = 0.8, TEMPO_HI = 1.25, RH_SLACK = 1, RH_SLACK_MUL = 2;
  var B_GRACE = 4, CHECK_STEP = 24;
  var MODES = [
    { id: 'replay', name: 'REPLAY', key: 'best', desc: ['HEAR A TUNE, THEN PLAY', 'IT BACK ON THE CHIMES'] },
    { id: 'highlow', name: 'HIGH-LOW', key: 'best_hl', desc: ['IS THE 2ND NOTE HIGHER,', 'LOWER OR THE SAME?'] },
    { id: 'odd', name: 'ODD NOTE', key: 'best_odd', desc: ['ONE NOTE CHANGED IN THE', 'REPEAT. FIND IT!'] }
  ];
  // REPLAY 8 級：n 音數、hi 最高鍵（0..7）、rh 要不要對節奏、U 每單位幾幀
  var LEVELS = [
    { n: 3, hi: 2, rh: false, U: 14 }, { n: 4, hi: 3, rh: false, U: 14 }, { n: 4, hi: 4, rh: false, U: 13 }, { n: 5, hi: 7, rh: false, U: 13 },
    { n: 5, hi: 7, rh: true, U: 12 }, { n: 6, hi: 7, rh: true, U: 12 }, { n: 7, hi: 7, rh: true, U: 11 }, { n: 8, hi: 7, rh: true, U: 10 }
  ];
  var PER_LV = 2;
  // HIGH-LOW：音程範圍（半音）、可否「一樣」、每個音幾幀
  var HL_LV = [
    { lo: 7, hi: 12, same: false, len: 30 }, { lo: 5, hi: 6, same: false, len: 30 }, { lo: 4, hi: 4, same: true, len: 30 }, { lo: 3, hi: 3, same: true, len: 27 },
    { lo: 2, hi: 2, same: true, len: 27 }, { lo: 1, hi: 1, same: true, len: 24 }, { lo: 1, hi: 1, same: true, len: 18 }, { lo: 1, hi: 1, same: true, len: 12 }
  ];
  var HL_PER = 8;
  // ODD NOTE：n 音數、hi 音域、step 改動的最小級數、rh 有沒有節奏型
  var ODD_LV = [
    { n: 4, hi: 4, step: 3, rh: false, U: 13 }, { n: 4, hi: 4, step: 2, rh: false, U: 13 }, { n: 5, hi: 5, step: 2, rh: false, U: 12 }, { n: 5, hi: 7, step: 1, rh: false, U: 12 },
    { n: 6, hi: 7, step: 1, rh: false, U: 11 }, { n: 6, hi: 7, step: 1, rh: true, U: 11 }, { n: 7, hi: 7, step: 1, rh: true, U: 10 }, { n: 8, hi: 7, step: 1, rh: true, U: 10 }
  ];
  var ODD_PER = 3;
  var SOLFA = ['DO', 'RE', 'MI', 'FA', 'SO', 'LA', 'TI', 'DO'];
  var KEY_DIR = ['L', 'D', 'U', 'R'];                 // 鍵 k&3 → 方向（← ↓ ↑ →）
  var DIR_BTN = { L: BTN.LEFT, D: BTN.DOWN, U: BTN.UP, R: BTN.RIGHT };
  var ARROW = { L: 'AL', D: 'AD', U: 'AU', R: 'AR' };
  var KEY_C0 = 8, TUBE_R0 = 14, TL_C0 = 6, TL_R0 = 4, TL_W = 24, TITLE_R0 = 18;
  // 管長：遊玩 8→5 列、標題 4→2 列（標題要留位置給段落空列）；唱名 / 方向 / B 標在管下
  var TUBE_PLAY = [8, 8, 7, 7, 6, 6, 5, 5], TUBE_TITLE = [4, 4, 4, 3, 3, 2, 2, 2];
  var PAL_BG = [[0x00, 0x10, 0x30], [0x07, 0x27, 0x38], [0x01, 0x21, 0x31], [0x26, 0x30, 0x30]];
  var PAL_SPR = [[0x30, 0x38, 0x28], [0x11, 0x21, 0x31], [0x17, 0x27, 0x38], [0x30, 0x2C, 0x30]];
  TN.MODES = MODES; TN.LEVELS = LEVELS; TN.HL_LV = HL_LV; TN.ODD_LV = ODD_LV;

  var A = null, Au = null;

  /* ============================== 影子名稱表 + 差異佇列（同 cart3 寫法） ============================== */
  var want = new Uint8Array(960 + 240), have = new Uint8Array(960 + 240), dirty = new Uint8Array(960 + 240);
  var queue = [], qi = 0, ntWrites = 0, ntPeak = 0;
  function put(c, r, t) {
    if (c < 0 || c > 31 || r < 0 || r > 29) return;
    var i = r * 32 + c;
    want[i] = t;
    if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function putA(bx, by, p) {
    if (bx < 0 || bx > 15 || by < 0 || by > 14) return;
    var i = 960 + by * 16 + bx;
    want[i] = p;
    if (have[i] !== p && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function text(c, r, s) { s = String(s); for (var i = 0; i < s.length; i++) put(c + i, r, A.ch(s.charAt(i))); }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function flush(ppu, unlimited) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
    while (qi < queue.length) {
      if (!unlimited && base + n >= NT_LIMIT) break;
      var i = queue[qi++];
      dirty[i] = 0;
      if (want[i] !== have[i]) {
        if (i < 960) ppu.setTile(0, i & 31, i >> 5, want[i]);
        else ppu.setAttr(0, (i - 960) & 15, (i - 960) >> 4, want[i]);
        have[i] = want[i]; n++;
      }
    }
    if (qi >= queue.length) { queue.length = 0; qi = 0; }
    ntWrites = n; if (!unlimited && n > ntPeak) ntPeak = n;
    return n;
  }
  function ntReset() { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; }
  function pending() { return queue.length - qi; }

  /* ============================== 亂數 + 原創旋律產生器 ============================== */
  var rs = 0x2545F491;
  function rnd() { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs; }
  function rndN(n) { return rnd() % n; }
  // 級進為主（±1 一半、±2 三成、±3~4 兩成）、起音 DO/MI/SO、收在主音（低 DO / 高 DO / SO 取近者）、不連三同音
  function genMelody(n, hi, rhythm) {
    var ks = [], i, starts = [0, 2, 4].filter(function (x) { return x <= hi; });
    ks.push(starts[rndN(starts.length)]);
    for (i = 1; i < n; i++) {
      var prev = ks[i - 1], k, tries = 0;
      do {
        var r = rndN(10), step = r < 5 ? 1 : (r < 8 ? 2 : 3 + rndN(2));
        var dir = rndN(2) ? 1 : -1;
        if (prev + step * dir > hi || prev + step * dir < 0) dir = -dir;
        k = Math.max(0, Math.min(hi, prev + step * dir));
        tries++;
      } while (tries < 8 && (i >= 2 && ks[i - 1] === k && ks[i - 2] === k));
      ks.push(k);
    }
    if (n >= 3) {
      var ends = [0, 4, 7].filter(function (x) { return x <= hi; }), best = ends[0];
      ends.forEach(function (e) { if (Math.abs(e - ks[n - 2]) < Math.abs(best - ks[n - 2])) best = e; });
      ks[n - 1] = best;
    }
    var durs = [];
    for (i = 0; i < n; i++) durs.push(2);
    if (rhythm) {
      var POOL = [1, 1, 2, 2, 3];
      for (i = 0; i < n - 1; i++) durs[i] = POOL[rndN(POOL.length)];
      durs[n - 1] = 4;
      if (durs.slice(0, n - 1).every(function (d) { return d === 2; })) durs[rndN(n - 1)] = 1;
      while (durs.reduce(function (a, b) { return a + b; }, 0) > TL_W) { for (i = 0; i < n - 1; i++) if (durs[i] === 3) { durs[i] = 2; break; } if (i === n - 1) break; }
    }
    return ks.map(function (k, j) { return { k: k, dur: durs[j], midi: Au.SCALE[k] }; });
  }
  function layout(notes, row0) {
    var r = row0, out = [];
    notes.forEach(function (nt) { out.push({ row: r, dur: nt.dur, midi: nt.midi, k: nt.k }); r += nt.dur; });
    return out;
  }
  TN.genMelody = function (n, hi, rh, seed) { if (seed) rs = seed >>> 0; return genMelody(n, hi, rh); };

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, menu: 0, hint: true, blink: 0, m: MODES[0],
      phase: 'ready', pt: 0, lv: 1, q: 0, lives: LIVES, score: 0, best: 0, lvDone: 0,
      cur: null, inp: null, part: '', againUsed: false, agains: 0, misses: 0, perfects: 0, idle: 0,
      goal: false, cheats: 0, continues: 0, paused: false, msg: '', msgT: 0, lastMs: 0, lastJudge: null,
      cursor: 0, answer: -1, correct: false, seed: 0, litKey: -1, litAt: -1, onsets: 0, tl: {}, mk: [null, null],
      pend: null, soundOk: false, ct: 0, checkKey: -1, titleMsgT: 0, slackUsed: 0
    };
  }

  /* ============================== 題目 ============================== */
  function U() { return g.cur ? g.cur.U : 12; }
  function makeQuestion() {
    var c = {};
    if (g.m.id === 'replay') {
      var L = LEVELS[g.lv - 1];
      c.notes = genMelody(L.n, L.hi, L.rh); c.U = L.U; c.rh = L.rh;
      c.events = layout(c.notes, 8);
      c.song = Au.phrase(c.events, c.U, { countIn: true, drone: true, droneFrom: 8, name: 'tune_q' });
    } else if (g.m.id === 'highlow') {
      var H = HL_LV[g.lv - 1], m1 = 62 + rndN(17), d = H.lo + rndN(H.hi - H.lo + 1), sgn = rndN(2) ? 1 : -1;
      if (H.same && rndN(5) === 0) d = 0;
      var m2 = m1 + sgn * d;
      if (m2 > 86 || m2 < 58) { sgn = -sgn; m2 = m1 + sgn * d; }
      c.m1 = m1; c.m2 = m2; c.ans = m2 > m1 ? 'U' : (m2 < m1 ? 'D' : 'R'); c.same = H.same;
      c.U = Math.max(4, Math.round(H.len / 3));
      c.events = [{ row: 0, dur: 3, midi: m1, k: -1 }, { row: 5, dur: 3, midi: m2, k: -1 }];
      c.song = Au.phrase(c.events, c.U, { name: 'tune_q', tail: 2 });
    } else {
      var O = ODD_LV[g.lv - 1];
      c.notes = genMelody(O.n, O.hi, O.rh); c.U = O.U;
      var j = 1 + rndN(O.n - 1), k0 = c.notes[j].k, opts = [], s;
      for (s = O.step; s <= O.step + 1; s++) { if (k0 + s <= O.hi) opts.push(k0 + s); if (k0 - s >= 0) opts.push(k0 - s); }
      if (!opts.length) opts.push(k0 > 0 ? k0 - 1 : k0 + 1);
      var nk = opts[rndN(opts.length)];
      c.odd = j;
      c.notesB = c.notes.map(function (nt, i) { return i === j ? { k: nk, dur: nt.dur, midi: Au.SCALE[nk] } : nt; });
      var evA = layout(c.notes, 8), lenA = c.notes.reduce(function (a, b) { return a + b.dur; }, 0);
      c.bStart = 8 + lenA + 4;
      var evB = layout(c.notesB, c.bStart);
      c.events = evA.concat(evB);
      c.song = Au.phrase(c.events, c.U, { countIn: true, drone: true, droneFrom: 8, name: 'tune_q' });
    }
    return c;
  }
  // driver row / rowFrame → 目前正在響的事件索引（最後 2 幀算放開，重複同音也看得出兩下）；-1 = 沒有
  function sounding() {
    if (!g.cur || Au.current !== 'tune_q') return -1;
    var p = Au.pos();
    if (!p || !p.playing) return -1;
    var ev = g.cur.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (p.row >= e.row && p.row < e.row + e.dur) {
        if (p.row === e.row + e.dur - 1 && p.rowFrame >= p.speed - 2) return -1;
        return i;
      }
    }
    return -1;
  }

  /* ============================== 流程 ============================== */
  function sfx(n) { Au.sfx(n); }
  // 觸控十字鍵：遊玩中四方向（±45°、只輸出單一方向）；API 還沒有也不報錯
  function touchWays(n) { try { if (NES.Touch && NES.Touch.setWays) NES.Touch.setWays(n); } catch (e) { } }
  TN.touchWays = touchWays;
  function startGame() {
    g.m = MODES[g.menu];
    if (!g.hint && !g.soundOk) { enterCheck(); return; }
    touchWays(4);
    var seedQ = parseInt((CT.query && CT.query('seed')) || '', 10);
    g.seed = (isFinite(seedQ) && seedQ > 0) ? (seedQ >>> 0) : (((g.frames + 3) * 2654435761) >>> 0) || 0x1234567;
    rs = g.seed;
    g.lv = 1; g.q = 0; g.lives = LIVES; g.score = 0; g.lvDone = 0; g.goal = false; g.cheats = 0; g.continues = 0;
    g.misses = 0; g.agains = 0; g.perfects = 0; g.paused = false; g.msg = ''; g.msgT = 0; g.lastJudge = null; g.pend = null; g.slackUsed = 0;
    g.best = CT.load('tune', g.m.key, 0);
    g.mode = 'play';
    CT.blank(nes0, function () { drawPlayScreen(); });
    Au.stop();
    setPhase('ready');
  }
  function toTitle() {
    saveBest();
    touchWays(8);
    g.mode = 'title'; g.paused = false; g.pend = null;
    CT.blank(nes0, function () { drawTitleScreen(); });
    Au.stop(); Au.play('tune_title');
  }
  function setPhase(p) { g.phase = p; g.pt = 0; g.pend = null; g.judgeWait = 0; }   // judgeWait 也清（重開局不帶進上一題的判定）
  // SOUND CHECK（HINT OFF 開局前）：DO MI SO 高 DO 輪播，A = 聽得到、B = 回標題（提示靜音開關 / 音量）
  var CHECK_ORDER = [0, 2, 4, 7];
  function enterCheck() {
    g.mode = 'check'; g.ct = 0; g.checkKey = -1;
    Au.stop();
    CT.blank(nes0, function () { drawCheckScreen(); });
  }
  function updateCheck() {
    g.ct++;
    if (g.ct % CHECK_STEP === 1) { var k = CHECK_ORDER[((g.ct / CHECK_STEP) | 0) % 4]; Au.key(k, 16); g.checkKey = k; }
    if (g.ct % CHECK_STEP === 17) g.checkKey = -1;
    if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) { g.soundOk = true; sfx('tune_ok'); startGame(); return; }
    if (pressed(BTN.B)) { g.titleMsgT = 240; toTitle(); }
  }
  function newQuestion() {
    g.cur = makeQuestion(); g.againUsed = false;
    if (guardOn) g.cur = guardWrap(g.cur);
    beginListen();
  }
  function beginListen() {
    tlClear(); g.mk = [null, null];
    g.inp = { keys: [], times: [], ok: [] };
    g.part = ''; g.litKey = -1; g.onsets = 0;
    Au.stop();
    setPhase('prep');
  }
  function beatOn() { Au.playSong(Au.beatSong(U()), 'tune_beat'); }

  function updatePrep() { if (g.pt >= PREP_F) { Au.playSong(g.cur.song, 'tune_q'); setPhase('listen'); } }
  function updateListen() {
    var si = sounding(), c = g.cur;
    if (si >= 0) {
      var e = c.events[si];
      if (g.m.id === 'odd') g.part = si >= c.notes.length ? 'B' : 'A';
      if (si !== g.litAt) {     // 新的音開始：時間軸畫上
        g.litAt = si; g.onsets++;
        if (g.m.id === 'odd' && si === c.notes.length) tlClear();
        if (g.m.id === 'highlow') g.mk[si] = { midi: e.midi };
        else tlNote(e.row - (g.m.id === 'odd' && si >= c.notes.length ? c.bStart : 8), e.k, e.dur, g.hint);
      }
      g.litKey = (g.hint && e.k >= 0) ? e.k : -1;
    } else { g.litKey = -1; g.litAt = -1; }
    if (g.pt > 4 && !Au.playing()) {
      g.litKey = -1;
      if (g.m.id === 'replay') { tlClear(); beatOn(); setPhase('input'); g.idle = 0; }
      else if (g.m.id === 'highlow') { setPhase('answer'); g.idle = 0; }
      else { g.cursor = 0; setPhase('pick'); g.idle = 0; }
    }
  }
  function again() {
    if (g.againUsed) { sfx('tune_menu'); return false; }
    g.againUsed = true; g.agains++;
    g.score = Math.max(0, g.score - 5 * g.lv);
    g.msg = 'LISTEN AGAIN -' + (5 * g.lv); g.msgT = 70;
    sfx('tune_again');
    beginListen();
    return true;
  }
  function playKey(k) {
    Au.key(k, 18);
    g.litKey = k; g.keyLitT = 14;
  }
  // REPLAY 輸入
  function inputKey(k, at) {
    var c = g.cur, i = g.inp.keys.length, exp = c.notes[i];
    playKey(k);
    g.idle = 0;
    g.inp.keys.push(k); g.inp.times.push(at === undefined ? g.frames : at);
    var col = c.events[i].row - 8;
    if (k !== exp.k) {
      put(TL_C0 + col, TL_R0 + 7 - k, A.t('NX'));
      failQ('WRONG NOTE: ' + SOLFA[exp.k] + (exp.k === 7 ? "'" : ''));
      return;
    }
    tlNote(col, k, exp.dur, true);
    if (g.inp.keys.length >= c.notes.length) g.judgeWait = 16;
  }
  // 節奏判定（幀）：玩家音距 d_i vs 標準 D_i × 速度比；|誤差| ≤ max(RH_MIN, RH_PCT × 標準) 才算對
  function judgeRhythm(times, notes, Uf) {
    var n = notes.length, D = [], d = [], i, sD = 0, sd = 0;
    for (i = 0; i < n - 1; i++) { D.push(notes[i].dur * Uf); d.push(times[i + 1] - times[i]); sD += D[i]; sd += d[i]; }
    if (n < 2) return { ok: true, perfect: true, errs: [], scale: 1, avgMs: 0 };
    var scale = Math.max(TEMPO_LO, Math.min(TEMPO_HI, sd / Math.max(1, sD)));
    var errs = [], ok = true, perfect = true, sum = 0, over = 0, wild = 0;
    for (i = 0; i < n - 1; i++) {
      var exp = D[i] * scale, err = d[i] - exp, tol = Math.max(RH_MIN, RH_PCT * exp);
      errs.push(Math.round(err * 10) / 10);
      if (Math.abs(err) > tol) { over++; if (Math.abs(err) > tol * RH_SLACK_MUL) wild++; }
      if (Math.abs(err) > RH_PERFECT) perfect = false;
      sum += Math.abs(err);
    }
    // 容許 RH_SLACK 個音距超出（但不能離譜到 2 倍容許以上）；有超出就拿不到 PERFECT
    ok = over <= RH_SLACK && wild === 0;
    if (over > 0) perfect = false;
    var tempoOk = sd / Math.max(1, sD) >= TEMPO_LO - 0.05 && sd / Math.max(1, sD) <= TEMPO_HI + 0.05;
    return { ok: ok && tempoOk, perfect: perfect && tempoOk, over: over, errs: errs, scale: Math.round(scale * 100) / 100, avgMs: Math.round(sum / (n - 1) * 1000 / HZ) };
  }
  TN.judgeRhythm = judgeRhythm;
  function finishReplay() {
    var c = g.cur, j = c.rh ? judgeRhythm(g.inp.times, c.notes, c.U) : { ok: true, perfect: false, avgMs: 0, errs: [] };
    g.lastJudge = j; g.lastMs = j.avgMs;
    if (!j.ok) { failQ('RHYTHM OFF  AVG ' + j.avgMs + 'MS'); return; }
    if (j.over) g.slackUsed++;
    var pts = 100 * g.lv * (g.hint ? 1 : 2) + (j.perfect ? 50 * g.lv : 0) + (g.againUsed ? 0 : 20 * g.lv);
    passQ(pts, c.rh ? (j.perfect ? 'PERFECT! ' : (j.over ? 'CLOSE! ' : 'GOOD! ')) + j.avgMs + 'MS' : 'GOOD!', j.perfect);
  }
  function passQ(pts, msg, perfect) {
    g.score = Math.min(999999, g.score + pts);
    if (perfect) g.perfects++;
    g.msg = msg + '  +' + pts; g.msgT = GOOD_F;
    Au.stop();
    sfx(perfect ? 'tune_perfect' : 'tune_good');
    g.q++;
    var per = g.m.id === 'replay' ? PER_LV : (g.m.id === 'highlow' ? HL_PER : ODD_PER);
    if (g.q >= per) {
      g.lvDone = Math.max(g.lvDone, g.lv);
      if (g.lvDone > g.best) g.best = g.lvDone;
      if (g.m.id === 'replay' && g.lv >= GOAL_LV && g.cheats === 0) g.goal = true;
      setPhase('lvup');
      Au.playSong(Au.SONGS.tune_clear, 'tune_clear');
    } else setPhase('good');
  }
  function failQ(msg) {
    g.misses++; g.lives--;
    g.msg = msg; g.msgT = MISS_F;
    Au.stop();
    sfx('tune_miss');
    g.litKey = -1;
    setPhase('miss');
    // 答案揭曉（時間軸上畫出正解）
    if (g.m.id === 'replay') { tlClear(); g.cur.events.forEach(function (e) { tlNote(e.row - 8, e.k, e.dur, true); }); }
    if (g.m.id === 'highlow') { g.mk = [{ midi: g.cur.m1, show: true }, { midi: g.cur.m2, show: true }]; }
  }
  function gameOver() {
    setPhase('over');
    saveBest();
    Au.stop(); Au.play('tune_over');
  }
  function saveBest() {
    if (!g || g.mode !== 'play') return;
    if (g.lvDone > CT.load('tune', g.m.key, 0)) CT.save('tune', g.m.key, g.lvDone);
    if (g.score > CT.load('tune', g.m.key + '_sc', 0)) CT.save('tune', g.m.key + '_sc', g.score);
  }

  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  // 這一幀按下的方向：剛好一個才算；同一幀兩個方向一起按下（觸控斜方向）= 不判定，等下一個單一方向
  function dirPressed() {
    var d = null, n = 0;
    if (pressed(BTN.LEFT)) { d = 'L'; n++; }
    if (pressed(BTN.DOWN)) { d = 'D'; n++; }
    if (pressed(BTN.UP)) { d = 'U'; n++; }
    if (pressed(BTN.RIGHT)) { d = 'R'; n++; }
    return n === 1 ? d : null;
  }
  function keyFromDir(d) { return KEY_DIR.indexOf(d) + (held(BTN.B) ? 4 : 0); }
  function needB() { return g.m.id === 'replay' && LEVELS[g.lv - 1].hi >= 4; }

  function updateTitle() {
    g.blink++;
    if (pressed(BTN.UP)) { g.menu = (g.menu + MODES.length - 1) % MODES.length; sfx('tune_menu'); }
    if (pressed(BTN.DOWN)) { g.menu = (g.menu + 1) % MODES.length; sfx('tune_menu'); }
    if (pressed(BTN.LEFT) || pressed(BTN.RIGHT)) { g.hint = !g.hint; sfx('tune_menu'); }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('tune_ok'); startGame(); }
  }
  function updatePlay() {
    if (pressed(BTN.START) && !held(BTN.SELECT) && g.phase !== 'over') {
      g.paused = !g.paused;
      if (g.paused) Au.pause(); else Au.resume();
      sfx('tune_menu');
    }
    if (g.paused) return;
    if (g.msgT > 0) g.msgT--;
    if (g.keyLitT > 0 && --g.keyLitT === 0 && g.phase !== 'listen') g.litKey = -1;
    g.pt++;
    var d;
    switch (g.phase) {
      case 'ready':
        if (g.pt === 1 || g.pt === 30 || g.pt === 60 || g.pt === 90) sfx('tune_tick');
        if (g.pt >= READY_F) newQuestion();
        break;
      case 'prep': updatePrep(); break;
      case 'listen': updateListen(); break;
      case 'input':
        if (g.judgeWait > 0) { if (--g.judgeWait === 0) finishReplay(); break; }
        if (g.pend) {
          // 方向先到、B 晚到 ≤ B_GRACE 幀 ⇒ 仍是高音組；時間記方向按下那一幀（節奏判定不受延後影響）
          g.pend.t++;
          var pv = g.pend, nd = dirPressed();
          if (held(BTN.B)) { g.pend = null; inputKey(KEY_DIR.indexOf(pv.d) + 4, pv.f); break; }
          if (nd || pv.t >= B_GRACE) {
            g.pend = null; inputKey(KEY_DIR.indexOf(pv.d), pv.f);
            if (nd && g.phase === 'input' && !g.judgeWait) g.pend = { d: nd, t: 0, f: g.frames };
          }
          break;
        }
        if (pressed(BTN.SELECT)) { again(); break; }
        d = dirPressed();
        if (d) {
          if (needB() && !held(BTN.B) && B_GRACE > 0) g.pend = { d: d, t: 0, f: g.frames };
          else inputKey(keyFromDir(d));
          break;
        }
        if (++g.idle >= INPUT_TIMEOUT) failQ('TIME UP');
        break;
      case 'answer':
        if (pressed(BTN.SELECT)) { again(); break; }
        d = dirPressed();
        if (d === 'U' || d === 'D' || (d === 'R' && g.cur.same)) {
          g.answer = d;
          g.mk = [{ midi: g.cur.m1, show: true }, { midi: g.cur.m2, show: true }];
          if (d === g.cur.ans) passQ(10 * g.lv * (g.hint ? 1 : 2), d === 'R' ? 'SAME - RIGHT!' : (d === 'U' ? 'HIGHER - RIGHT!' : 'LOWER - RIGHT!'), false);
          else failQ('NO - IT WAS ' + (g.cur.ans === 'U' ? 'HIGHER' : (g.cur.ans === 'D' ? 'LOWER' : 'THE SAME')));
          break;
        }
        if (++g.idle >= INPUT_TIMEOUT) failQ('TIME UP');
        break;
      case 'pick':
        if (pressed(BTN.SELECT)) { again(); break; }
        if (pressed(BTN.LEFT)) { g.cursor = (g.cursor + g.cur.notes.length - 1) % g.cur.notes.length; sfx('tune_move'); }
        if (pressed(BTN.RIGHT)) { g.cursor = (g.cursor + 1) % g.cur.notes.length; sfx('tune_move'); }
        if (pressed(BTN.A)) {
          g.answer = g.cursor;
          if (g.cursor === g.cur.odd) passQ(20 * g.lv * (g.hint ? 1 : 2), 'NOTE ' + (g.cur.odd + 1) + ' - RIGHT!', false);
          else failQ('IT WAS NOTE ' + (g.cur.odd + 1));
          break;
        }
        if (++g.idle >= INPUT_TIMEOUT) failQ('TIME UP');
        break;
      case 'good':
        if (g.pt >= GOOD_F) newQuestion();
        break;
      case 'lvup':
        if (g.pt >= LVUP_F) {
          if (g.lv >= MAX_LV) { g.msg = 'ALL 8 LEVELS CLEAR!'; g.msgT = 9999; gameOver(); break; }
          g.lv++; g.q = 0; newQuestion();
        }
        break;
      case 'miss':
        if (g.pt >= MISS_F) {
          if (g.lives <= 0) gameOver();
          else if (g.m.id === 'replay') { g.againUsed = false; beginListen(); }   // 同一題重聽
          else newQuestion();
        }
        break;
      case 'over':
        if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) toTitle();
        break;
    }
  }

  /* ============================== 畫面 ============================== */
  function setPalettes() {
    ppu0.setBackdrop(0x0F);
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  function stars(seed, count, avoid) {
    var s = seed, i;
    for (i = 0; i < count; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (avoid && avoid(c, r)) continue;
      put(c, r, A.t((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
  }
  function bigText(c, r, s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      for (var j = 0; j < 4; j++) put(c + i * 2 + (j & 1), r + (j >> 1), A.t('BIG_' + ch + j));
    }
  }
  function blankAll() { ntReset(); ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0); setPalettes(); }
  // 星鐘管 + 唱名 + 方向 / B 標示（r0 = 管頂列、hs = 各管長）。管下依序：唱名兩列（上下交錯）、方向一列、
  // 「按住 B」一列（只標在高音組 4 根底下）——fix-r8 P3-3：方向與 B 拆成兩列，不再黏成 ←B↓B↑B→B 一串
  var kbR0 = TUBE_R0, kbRows = 4;
  function drawKeyboard(r0, hs) {
    hs = hs || TUBE_PLAY;
    var hMax = Math.max.apply(null, hs), lab = r0 + hMax;
    for (var c = KEY_C0 - 2; c < KEY_C0 + 18; c++) put(c, r0 - 1, A.t('RAIL'));
    for (var k = 0; k < 8; k++) {
      var c0 = KEY_C0 + 2 * k, h = hs[k];
      for (var y = 0; y < h; y++) {
        var nm = y === 0 ? 'KT' : (y === h - 1 ? 'KE' : 'KB');
        put(c0, r0 + y, A.t(nm + '_L')); put(c0 + 1, r0 + y, A.t(nm + '_R'));
      }
      text(c0, lab + (k & 1), SOLFA[k]);
      put(c0, lab + 2, A.t(ARROW[KEY_DIR[k & 3]]));
      if (k >= 4) put(c0, lab + 3, A.ch('B'));
    }
    kbR0 = r0; kbRows = (hMax + 1) >> 1;
    keyAttrs(-1);
    return lab;
  }
  function keyAttrs(lit) {
    for (var k = 0; k < 8; k++) for (var by = kbR0 >> 1; by < (kbR0 >> 1) + kbRows; by++) putA((KEY_C0 >> 1) + k, by, k === lit ? 3 : (k < 4 ? 1 : 2));
  }
  function tlClear() { for (var r = TL_R0; r < TL_R0 + 8; r++) for (var c = TL_C0; c < TL_C0 + TL_W; c++) put(c, r, 0); }
  function tlNote(col, k, dur, pitched) {
    if (col < 0 || col >= TL_W) return;
    var row = (pitched && k >= 0) ? TL_R0 + 7 - k : TL_R0 + 4;
    put(TL_C0 + col, row, A.t(pitched && k >= 0 ? 'NH' : 'DOT8'));
    for (var i = 1; i < dur && col + i < TL_W; i++) put(TL_C0 + col + i, row, A.t('NL'));
  }

  function drawTitleScreen() {
    blankAll();
    // fix-r8 P3-2 / P3-3：大字從第 2 列起；模式 / 說明 / 提示 / 操作 / 鍵盤對照 / PUSH START 各段之間空一列
    stars(41, 60, function (c, r) { return r <= 1 || (r >= 4 && r <= 28 && c >= 1 && c <= 30); });
    bigText(5, 2, 'STAR');
    bigText(15, 2, 'MELODY');
    text(4, 14, 'START PAUSE  C/$ = CHEAT');
    text(4, 15, 'HOLD START+SELECT: MENU');
    var lab = drawKeyboard(TITLE_R0, TUBE_TITLE);
    text(1, lab, 'NOTE'); text(1, lab + 2, 'KEY'); text(1, lab + 3, 'HOLD');
    flush(ppu0, true);
    drawTitleValues();
    flush(ppu0, true);
  }
  function drawTitleValues() {
    for (var i = 0; i < MODES.length; i++) {
      var m = MODES[i];
      text(6, 5 + i, pad(m.name, 9));
      text(17, 5 + i, 'BEST LV' + num(CT.load('tune', m.key, 0), 2));
    }
    text(6, 9, pad(MODES[g.menu].desc[0], 24));
    text(6, 10, pad(MODES[g.menu].desc[1], 24));
    text(4, 12, g.hint ? 'HINT ON  (L/R): SEE+HEAR ' : 'HINT OFF (L/R): EARS, X2 ');
    if (g.titleMsgT > 0) { g.titleMsgT--; text(2, 28, pad(((g.titleMsgT >> 5) & 1) ? '  NO SOUND? CHECK SILENT' : '  SWITCH AND VOLUME', 28)); }
    else text(2, 28, pad((g.blink >> 5) & 1 ? '' : '         PUSH START', 28));
  }

  function drawCheckScreen() {
    blankAll();
    stars(13, 40, function (c, r) { return r <= 1 || (r >= 3 && r <= 27 && c >= 1 && c <= 30); });
    text(10, 3, 'SOUND CHECK');
    text(4, 5, 'HINT OFF IS SOUND ONLY.');
    text(4, 7, 'YOU SHOULD HEAR DO MI SO DO,');
    text(4, 8, 'LOW TO HIGH, OVER AND OVER.');
    drawKeyboard(12, TUBE_TITLE);         // 這頁是檢查，正在響的那根管子跟著亮
    text(4, 21, 'HEAR THEM?');
    text(6, 22, 'A = YES, START');
    text(6, 23, 'B = NO, BACK');
    text(4, 25, 'NO SOUND? CHECK THE PHONE');
    text(4, 26, 'SILENT SWITCH AND VOLUME.');
    flush(ppu0, true);
  }
  function drawPlayScreen() {
    blankAll();
    // fix-r8 P3-2：HUD 從名稱表第 2 列起（第 0、1 列留白）
    text(2, TL_R0, 'HI'); text(2, TL_R0 + 7, 'LO');
    drawKeyboard(TUBE_R0);
    renderPlay();
    flush(ppu0, true);
  }
  function statusText() {
    if (g.paused) return ['PAUSED', 'HOLD START+SELECT: MENU'];
    if (g.msgT > 0 && g.msg && (g.phase === 'good' || g.phase === 'miss' || g.phase === 'lvup' || g.phase === 'over' || g.msgT < 9999)) {
      var second = g.phase === 'lvup' ? 'LEVEL ' + g.lv + ' CLEAR!' : (g.phase === 'over' ? 'A TITLE  $ CONTINUE' : '');
      return [g.msg, second];
    }
    var hintW = g.hint ? '' : ' (EAR)';
    switch (g.phase) {
      case 'ready': return ['GET READY ' + (g.pt < 30 ? '' : Math.max(1, 3 - Math.floor((g.pt - 30) / 30))), g.hint ? 'WATCH THE CHIMES GLOW' : 'NO LIGHTS - EARS ONLY'];
      case 'prep': return ['LISTEN...' + hintW, ''];
      case 'listen':
        if (g.m.id === 'odd') return [g.part === 'B' ? 'SECOND - WITH ONE CHANGE' : 'FIRST - THE ORIGINAL', ''];
        if (g.m.id === 'highlow') return ['NOTE ' + (g.mk[1] ? 2 : 1) + hintW, ''];
        return ['LISTEN...' + hintW, ''];
      case 'input': return ['YOUR TURN  ' + g.inp.keys.length + '/' + g.cur.notes.length + (g.cur.rh ? '  KEEP RHYTHM' : ''), g.againUsed ? '' : 'SELECT = HEAR AGAIN'];
      case 'answer': return ['UP HIGHER  DOWN LOWER' + (g.cur.same ? '' : ''), g.cur.same ? 'RIGHT = SAME  SEL AGAIN' : 'SELECT = HEAR AGAIN'];
      case 'pick': return ['WHICH NOTE CHANGED?', '<> MOVE  A PICK  SEL AGAIN'];
      case 'over': return ['GAME OVER  LV ' + g.lvDone + ' CLEAR', 'A TITLE  $ CONTINUE'];
    }
    return ['', ''];
  }
  function renderPlay() {
    text(2, 2, pad(g.m.name, 9));
    text(12, 2, g.hint ? '    ' : 'EAR ');
    text(2, 3, 'LV' + num(g.lv, 1) + ' Q' + Math.min(g.q + 1, 9) + '/' + (g.m.id === 'replay' ? PER_LV : (g.m.id === 'highlow' ? HL_PER : ODD_PER)));
    text(12, 3, 'SC' + num(g.score, 6));
    for (var i = 0; i < MAX_LIVES; i++) put(24 + i, 2, i < g.lives ? A.t('F_HEART') : 0);
    var st = statusText();
    text(2, 27, pad(st[0], 28)); text(2, 28, pad(st[1], 28));
    keyAttrs(g.paused ? -1 : g.litKey);
  }

  function drawSprites() {
    var slot = 0, i;
    if (g.mode === 'play' && !g.paused) {
      if (g.litKey >= 0) {
        var x = (KEY_C0 + 2 * g.litKey) * 8 + 4, y = TUBE_R0 * 8 - 12 - ((g.frames >> 2) & 3);
        ppu0.sprite(slot++, { x: x, y: y, tile: A.s('NOTE'), pal: 0 });
      }
      if (g.m.id === 'highlow') {
        for (i = 0; i < 2; i++) {
          var mk = g.mk[i];
          if (!mk) continue;
          var yy = (g.hint || mk.show) ? 92 - (((mk.midi - 58) * 5) >> 1) : 60;
          ppu0.sprite(slot++, { x: i ? 168 : 80, y: Math.max(28, Math.min(92, yy)), tile: A.s(i ? 'MK2' : 'MK1'), pal: i ? 2 : 1 });
        }
      }
      if (g.phase === 'pick') {
        var ev = g.cur.events[g.cur.notes.length + g.cursor];
        ppu0.sprite(slot++, { x: (TL_C0 + ev.row - g.cur.bStart) * 8, y: (TL_R0 + 8) * 8, tile: A.s('CUR'), pal: 3 });
      }
    }
    if (g.mode === 'title') ppu0.sprite(slot++, { x: 4 * 8, y: (5 + g.menu) * 8, tile: A.s('NOTE'), pal: 0 });
    for (i = slot; i < 48; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）==============================
   * 只從「播放當下的畫面 / 聲音」讀題：
   *   HINT ON：讀 PPU 屬性表——哪根星鐘管是「亮」調色盤（= 螢幕上看得到的那根）；
   *   HINT OFF / 聽音辨高低 / 找錯音：讀 APU 方波 1 的實際週期 → 頻率 → 最近的半音（= 用耳朵聽音高）。
   * 記下每個音「亮起 / 響起」的那一幀，彈回去時照著同樣的音距（加 ±2 幀人手誤差）；進入輸入後先等 lag 幀（預設 14）。 */
  // 測試用防偷看：dev.guard(true) 之後的題目物件（音符 / 答案 / 事件表）包成 Proxy，bot() 執行期間讀取次數應為 0
  var guardOn = false, inBot = false, guardReads = 0;
  function guardWrap(obj) {
    return new Proxy(obj, { get: function (t, k) { if (inBot) guardReads++; return t[k]; } });
  }
  var bm = null;
  function botReset() {
    bm = { t: 0, rec: [], prev: -1, inPhase: '', plan: null, wait: 0, lag: 14, part: '' };
    var l = parseInt((CT.query && CT.query('lag')) || '', 10); if (isFinite(l) && l >= 0) bm.lag = l;
  }
  function seeKey() {
    for (var k = 0; k < 8; k++) if (ppu0.getAttr(0, (KEY_C0 >> 1) + k, TUBE_R0 >> 1) === 3) return k;
    return -1;
  }
  function hearMidi() {
    var st = nes0.apu && nes0.apu.state && nes0.apu.state();
    if (!st) return -1;
    var p = st.pulse1;
    if (!p.enabled || p.muted || !(p.volume > 0) || !(p.length > 0)) return -1;
    var f = 1789773 / (16 * (p.timer + 1));
    return Math.round(69 + 12 * Math.log(f / 440) / Math.LN2);
  }
  function bot() {
    if (!bm) botReset();
    bm.t++;
    if (g.mode === 'check') return (bm.t & 15) === 0 ? BTN.A : 0;     // 聽得到（機器人有讀 APU）
    if (g.mode === 'title') {
      var want0 = parseInt((CT.query && CT.query('mode')) || '0', 10) || 0;
      if (g.menu !== want0) return (bm.t & 7) === 0 ? BTN.DOWN : 0;
      var wantHint = (CT.query && CT.query('hint')) !== '0';
      if (g.hint !== wantHint) return (bm.t & 7) === 0 ? BTN.RIGHT : 0;
      return (bm.t & 15) === 0 ? BTN.START : 0;
    }
    if (g.paused) return (bm.t & 15) === 0 ? BTN.START : 0;
    if (g.phase === 'over') return (!g.goal && (bm.t & 31) === 0) ? BTN.A : 0;
    var ph = g.phase;
    if (ph !== bm.inPhase) {
      if (ph === 'prep') { bm.rec = []; bm.prev = -1; }
      if (ph === 'input' || ph === 'answer' || ph === 'pick') { bm.wait = bm.lag; bm.plan = null; }
      bm.inPhase = ph;
    }
    if (ph === 'listen' || ph === 'prep') {
      var midi = hearMidi(), seen = (g.hint && g.m.id !== 'highlow') ? seeKey() : -2;
      var on = seen === -2 ? midi >= 0 : seen >= 0;
      if (on && bm.prev < 0) {
        var k = seen >= 0 ? seen : Au.SCALE.indexOf(midi);
        bm.rec.push({ k: k, midi: midi, f: bm.t, part: g.part });
      }
      bm.prev = on ? 1 : -1;
      return 0;
    }
    if (ph === 'input') {
      if (!bm.plan) {
        if (bm.wait > 0) { bm.wait--; return 0; }
        bm.plan = []; var t0 = bm.t;
        var ats = bm.rec.map(function (r, i) { return t0 + 1 + (r.f - bm.rec[0].f) + (i ? ((i * 7) % 5) - 2 : 0); });
        bm.rec.forEach(function (r, i) {
          var at = ats[i], d = DIR_BTN[KEY_DIR[r.k & 3]];
          if (r.k >= 4) {
            // 像人一樣：B 先按、按住到方向之後幾幀才放（最多 4 幀，離下一個音至少 6 幀）
            var end = Math.min(at + 4, i + 1 < ats.length ? ats[i + 1] - 6 : at + 4);
            bm.plan.push([at - 1, BTN.B]); bm.plan.push([at, BTN.B | d]);
            for (var hb = at + 1; hb <= end; hb++) bm.plan.push([hb, BTN.B]);
          } else bm.plan.push([at, d]);
        });
      }
      while (bm.plan.length && bm.plan[0][0] < bm.t) bm.plan.shift();
      if (bm.plan.length && bm.plan[0][0] === bm.t) return bm.plan.shift()[1];
      return 0;
    }
    if (ph === 'answer') {
      if (bm.wait > 0) { bm.wait--; return 0; }
      if (bm.rec.length < 2) return 0;
      bm.wait = 999;
      var m1 = bm.rec[0].midi, m2 = bm.rec[1].midi;
      return m2 > m1 ? BTN.UP : (m2 < m1 ? BTN.DOWN : BTN.RIGHT);
    }
    if (ph === 'pick') {
      if (bm.wait > 0) { bm.wait--; return 0; }
      var a = bm.rec.filter(function (r) { return r.part === 'A'; }), b = bm.rec.filter(function (r) { return r.part === 'B'; });
      var tgt = 0;
      for (var i = 0; i < Math.min(a.length, b.length); i++) if (a[i].midi !== b[i].midi) { tgt = i; break; }
      bm.wait = Math.max(1, bm.lag >> 1);
      if (g.cursor < tgt) return BTN.RIGHT;
      if (g.cursor > tgt) return BTN.LEFT;
      bm.wait = 999;
      return BTN.A;
    }
    return 0;
  }

  /* ============================== 密技 ============================== */
  // 遊玩中：命 +1（上限 5）；GAME OVER：原地續關（同一級同一題、命補回 3）。標題無效；用過密技 goal() 一律 false。
  function cheat() {
    if (!g || g.mode !== 'play') return false;
    g.cheats++; g.goal = false;
    if (g.phase === 'over') {
      g.lives = LIVES; g.continues++;
      if (g.lv > MAX_LV) g.lv = MAX_LV;
      g.msg = 'CONTINUE'; g.msgT = 50;
      Au.stop();
      if (g.cur && g.m.id === 'replay') { g.againUsed = false; beginListen(); } else newQuestion();
    } else {
      g.lives = Math.min(MAX_LIVES, g.lives + 1);
      g.msg = 'EXTRA LIFE'; g.msgT = 50;
    }
    sfx('tune_good');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'tune', order: 4, title: '星塵旋律', legacy: ['music-memory.html', 'music-memory-enhanced.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = TN.Art.make(); Au = TN.Audio;
      NES.CHR.setPattern(0, 'tune_bg');
      NES.CHR.setPattern(1, 'tune_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState(); bm = null;
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10);
      if (mq >= 0 && mq < MODES.length) g.menu = mq;
      if (q('hint') === '0') g.hint = false;
      drawTitleScreen();
      Au.play('tune_title');
      if (q('autostart') === '1') startGame();
    },
    update: function (nes) {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'check') updateCheck();
      else updatePlay();
      Au.tick();
    },
    draw: function (nes) {
      if (g.mode === 'title') drawTitleValues();
      else if (g.mode === 'check') keyAttrs(g.checkKey);
      else { if (g.phase === 'listen' && !g.paused) updateListenLit(); renderPlay(); }
      flush(ppu0, false);
      drawSprites();
    },
    exit: function (nes) { saveBest(); Au.stop(); touchWays(8); },
    get backTile() { if (!A) A = TN.Art.make(); return { tile: A.s('DOT'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, gameMode: g.m.id, menu: g.menu, hint: g.hint, phase: g.phase, pt: g.pt, lv: g.lv, q: g.q,
        lives: g.lives, score: g.score, best: g.best, lvDone: g.lvDone, misses: g.misses, agains: g.agains, againUsed: g.againUsed,
        perfects: g.perfects, idle: g.idle, goal: g.goal, cheats: g.cheats, continues: g.continues, paused: g.paused,
        msg: g.msgT > 0 ? g.msg : '', litKey: g.litKey, pend: g.pend ? g.pend.d : null, soundOk: g.soundOk, titleMsgT: g.titleMsgT, slackUsed: g.slackUsed, part: g.part, cursor: g.cursor, onsets: g.onsets,
        entered: g.inp ? g.inp.keys.length : 0, judge: g.lastJudge, music: Au.current, lastSfx: Au.lastSfx, lastKey: Au.lastKey,
        keyCount: Au.keyCount, queue: pending(), ntWrites: ntWrites, ntPeak: ntPeak, frames: g.frames, seed: g.seed
      };
    },
    cheat: cheat,
    bot: function () { if (!g) return 0; inBot = true; try { return bot(); } finally { inBot = false; } },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    bestText: function () { return '  LV' + num(Math.min(99, CT.load('tune', 'best', 0)), 2); }
  };
  // 亮鍵在 draw 前依 driver 位置重算一次（update 末尾才 tick ⇒ draw 時的 row 就是這一幀正在響的音）
  function updateListenLit() {
    var si = sounding();
    g.litKey = (si >= 0 && g.hint && g.cur.events[si].k >= 0) ? g.cur.events[si].k : -1;
  }

  // 測試鉤子（只讀寫本遊戲狀態；機器人不用）
  TN.dev = {
    start: function (mode, seed, hint) {
      g.menu = mode || 0; g.hint = hint !== false;
      var s0 = CT.query; CT.query = function (k) { return k === 'seed' ? String(seed || 77) : (s0 ? s0(k) : null); }; startGame(); CT.query = s0;
    },
    cur: function () { return g.cur && { notes: g.cur.notes, notesB: g.cur.notesB, odd: g.cur.odd, m1: g.cur.m1, m2: g.cur.m2, ans: g.cur.ans, U: g.cur.U, rh: g.cur.rh, events: g.cur.events }; },
    setLv: function (n) { g.lv = n; g.q = 0; },
    phase: function (p) { setPhase(p); },
    sounding: function () { return sounding(); },
    seeKey: function () { return seeKey(); }, hear: function () { return hearMidi(); },
    soundOk: function (v) { g.soundOk = !!v; },
    inpTimes: function () { return g.inp ? g.inp.times.slice() : null; },
    grace: function (n) { B_GRACE = n | 0; },          // 測試用：0 = 舊版（方向按下那一幀就判組別）
    rhRule: function (pct, slack) { RH_PCT = pct; RH_SLACK = slack; },   // 測試用：(0.30, 0) = 舊版節奏規則
    consts: { B_GRACE: B_GRACE, RH_SLACK: RH_SLACK, RH_SLACK_MUL: RH_SLACK_MUL, GOAL_LV: GOAL_LV, INPUT_TIMEOUT: INPUT_TIMEOUT, LIVES: LIVES, READY_F: READY_F, RH_MIN: RH_MIN, RH_PCT: RH_PCT, RH_PERFECT: RH_PERFECT, PER_LV: PER_LV, NT_LIMIT: NT_LIMIT },
    guard: function (on) { guardOn = !!on; guardReads = 0; }, guardReads: function () { return guardReads; },
    pending: pending,
    flushAll: function () { CT.blank(nes0, function () { flush(ppu0, true); }); }
  };

  if (CT.register) CT.register(GAME);
  TN.GAME = GAME;
})();
