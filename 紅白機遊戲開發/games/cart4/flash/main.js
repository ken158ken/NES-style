/*
 * games/cart4/flash/main.js — 《星塵閃記 STAR FLASH》（合輯卡帶四 槽 3，id = flash）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：flash/art.js、flash/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：flash-memory / flash-memory-master / pattern-match / pattern-rush / memory-pattern-race ⇒ 一款四模式。
 *
 * 四模式（標題 ↑↓ 選模式、←→ 選速度 / CPU 強度）：
 *   1 PATTERN 圖案重現：格子裡一些格亮星（展示 40+10k 幀），熄掉後用游標 + A 點出全部亮過的格；點錯 = 扣 1 命、同級換新圖重來。
 *       12 級：3×3（3、4 格）→ 4×4（4、5、6）→ 5×5（6~12）。速度 RELAX ×1.5 / NORMAL / EXPERT ×0.7（分數 ×2）。
 *   2 SEQUENCE 序列重現：格子一格一格依序亮（每格有自己的音高 + 亮星），照順序點回來；長度 = 等級 + 2，3×3 → 4×4。
 *   3 SPOT CHANGE 哪裡變了：記住格子裡的符號（8 形 × 4 色），蓋牌 30 幀後再翻開，找出變了的格（1 → 2 → 3 處；
 *       出現 / 消失 / 換形，第 4 級起也會換色——換色時形狀不變，所以色弱玩家第 4 級前完全不受影響）。
 *   4 RACE ZIPPY 與 CPU 競速：同一張圖同時閃在你和 CPU「吱比 ZIPPY」的盤上，先正確點完的人得 1 分，先到 5 分贏。
 *       吱比強度 EASY / NORMAL / HARD = 游標每 20 / 14 / 13 幀（±3 抖動）走一格、起手思考 45 / 26 / 22 幀、每格記住率 74% / 90% / 94%（記錯就會點錯出局）；
 *       第 4 級 MASTER（11 / 20 / 94%）要先打贏 HARD 一整場才解鎖（標題 →← 未解鎖時只在 EASY~HARD 循環、紀錄列顯示 BEAT HARD>MASTER）。
 * 友善規則：開局 READY 3·2·1（90 幀）、每級開始 LEVEL n（45 幀）；輸入階段 **B = 重看一次**（每級 1 次，該級得分減半、不扣命）。
 * 密技（C / ★）：遊玩中 = +1 命（上限 5）/ 競速 +1 分；GAME OVER = 原地續關（同一級、命補回 3 / 競速吱比分數歸零）；
 *   標題 / 結算無效；用過密技那局不存紀錄、goal false。
 * goal = PATTERN（NORMAL 或 EXPERT）通過第 8 級（不開密技）。
 * 機器人（?bot=1，&lag=N 反應延遲，預設 12）：**只讀畫面**——展示階段每幀用 ppu.getTile 讀每格中央磁磚記下亮過的格 /
 *   亮起的順序 / 符號（找差異另讀屬性表），輸入階段等畫面穩定 2 幀 + lag 幀後，十字鍵每 6 幀一格、A 前停一拍。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var FL = CT.Flash = CT.Flash || {};
  var AU = FL.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var SPEEDS = ['RELAX', 'NORMAL', 'EXPERT'];
  var SPEED_MUL = [384, 256, 179];        // /256：展示時間倍率
  var CPUS = [
    // fix-r8 P2-5：舊值 16/200/30、11/230/22、6/250/12（HARD 每秒 10 格超過人類十字鍵上限、且無抖動 ⇒ 勝負兩極）；
    // 改成「一般玩家模型」量得 EASY 明顯優勢 / NORMAL 約五五波 / HARD 仍有機會（見 test_flash.py 真人濾鏡）；每步 ±jit 幀抖動
    { name: 'EASY', step: 20, acc: 190, think: 45, jit: 3 },
    { name: 'NORMAL', step: 14, acc: 230, think: 26, jit: 3 },
    { name: 'HARD', step: 13, acc: 240, think: 22, jit: 3 },
    // 總控追加：第 4 級 MASTER（打贏 HARD 一整場才解鎖，存 nes.cart4.flash.master；照熟手模型校準）
    { name: 'MASTER', step: 11, acc: 240, think: 20, jit: 3 }
  ];
  var MASTER = 3;
  var MODES = [
    { key: 'pattern', name: 'PATTERN', lv: SPEEDS },
    { key: 'seq', name: 'SEQUENCE', lv: SPEEDS },
    { key: 'spot', name: 'SPOT CHANGE', lv: SPEEDS },
    { key: 'race', name: 'RACE ZIPPY', lv: CPUS.map(function (c) { return c.name; }) }
  ];
  var SHORT = ['PATTERN', 'SEQUENCE', 'SPOT', 'RACE'];
  var MAX_LV = 12, LIVES = 3, RACE_WIN = 5;
  var PAT_N = [0, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5];
  var PAT_K = [0, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12];
  var SPOT_N = [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  var SPOT_K = [0, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13];
  var SPOT_C = [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3];
  var READY_F = 90, LEVEL_F = 45, MASK_F = 30, JUDGE_OK = 50, JUDGE_NG = 80, PRESS_F = 10;
  var REP_DELAY = 12, REP_EVERY = 4, FLUSH_LIMIT = 140, MSG_ROW = 27;
  var PAL_MAIN = [[0x11, 0x01, 0x30], [0x17, 0x28, 0x30], [0x1B, 0x2C, 0x30], [0x06, 0x16, 0x30]];
  var PAL_SPOT = [[0x11, 0x01, 0x30], [0x11, 0x01, 0x25], [0x11, 0x01, 0x2A], [0x11, 0x01, 0x28]];
  var PAL_SPR = [[0x30, 0x28, 0x16], [0x30, 0x24, 0x14], [0x30, 0x2A, 0x1A], [0x30, 0x16, 0x06]];
  var ST_PAL = { EMP: 0, LIT: 1, MRK: 2, BAD: 3, MIS: 1 };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, lvl: [1, 1, 1, 1], paused: false, cheatReq: false, run: null, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      seed: 1, runs: 0, overT: 0, goalRun: null, hold: {}, bot: null, pal: null
    };
  }
  function seedBase() { var s = CT.query ? parseInt(CT.query('seed') || '', 10) : NaN; return isNaN(s) ? 0x1F1A : (s & 0x7fffffff); }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function stars(n) { return ('$$$'.substring(0, n) + '   ').substring(0, 3); }
  function pick(n, k, excl) {        // n 格裡挑 k 個不重複
    var a = [], i;
    for (i = 0; i < n; i++) if (!excl || !excl[i]) a.push(i);
    for (i = a.length - 1; i > 0; i--) { var j = rnd() % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, k);
  }

  /* ---------------- 名稱表影子 + 差異佇列 ---------------- */
  function bgTile(c, r) {
    if (r === 4) return art.t('BH');        // fix-r8 P3-2：HUD 改在名稱表第 2、3 列（第 1 列 = 可見區 y 0 會貼頂），上框線 3 → 4
    if (r === 26) return art.t('BHB');
    if (r < 5 || r > 25) return 0;
    if (c === 0) return art.t('BV');
    if (c === 31) return art.t('BVR');
    if (c > 4 && c < 27) return 0;
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x7e21) >>> 0;
    if (h % 11 === 2) return art.t('ST1');
    if (h % 13 === 5) return art.t('ST2');
    return 0;
  }
  function put(c, r, t) { var k = r * 32 + c; if (g.want[k] === t) return; g.want[k] = t; g.q.push(k); }
  function putA(c16, r16, p) { var k = r16 * 16 + c16; if (g.wantA[k] === p) return; g.wantA[k] = p; g.qa.push(k); }
  function text(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) put(col + i, row, t[i]); }
  function center(row, s) { text(16 - (s.length >> 1), row, s); }
  function flush() {
    var bud = nes0.timing && nes0.timing.budget, ppu = nes0.ppu;
    while (g.qa.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var a = g.qa.shift();
      if (g.haveA[a] !== g.wantA[a]) { ppu.setAttr(0, a & 15, a >> 4, g.wantA[a]); g.haveA[a] = g.wantA[a]; }
    }
    while (g.q.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var k = g.q.shift();
      if (g.have[k] !== g.want[k]) { ppu.setTile(0, k & 31, k >> 5, g.want[k]); g.have[k] = g.want[k]; }
    }
  }
  function setPal(set) {
    if (g.pal === set) return;
    g.pal = set;
    for (var i = 0; i < 4; i++) nes0.ppu.setBgPalette(i, set[i]);
  }
  function redraw(fn, pal) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      setPal(pal || PAL_MAIN);
      for (var k = 0; k < 960; k++) g.want[k] = 0;
      for (k = 0; k < 240; k++) g.wantA[k] = 0;
      g.q = []; g.qa = [];
      fn();
      for (k = 0; k < 960; k++) ppu.setTile(0, k & 31, k >> 5, g.want[k]);
      for (k = 0; k < 240; k++) ppu.setAttr(0, k & 15, k >> 4, g.wantA[k]);
      g.have.set(g.want); g.haveA.set(g.wantA); g.q = []; g.qa = [];
      ppu.clearSprites(); g.sprUsed = 0;
    });
  }
  function drawField() { for (var r = 4; r <= 26; r++) for (var c = 0; c < 32; c++) put(c, r, bgTile(c, r)); }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i), x = col + i * 2;
      if (ch === ' ') continue;
      put(x, row, art.t('BIG_' + ch + '0')); put(x + 1, row, art.t('BIG_' + ch + '1'));
      put(x, row + 1, art.t('BIG_' + ch + '2')); put(x + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }

  /* ---------------- 格子 ---------------- */
  function bigRC(i) { var n = g.run.n, x = i % n, y = (i / n) | 0, b = 16 - 2 * n; return [b + 4 * x, b + 4 * y]; }
  function smallRC(side, i) { var n = g.run.n, x = i % n, y = (i / n) | 0; return [(side ? 18 : 14 - 2 * n) + 2 * x, 10 + 2 * y]; }
  // state：EMP / LIT / MRK / BAD / MIS，或 {s: 符號, c: 顏色}（找差異）
  function drawBig(i, state) {
    var p = bigRC(i), c0 = p[0], r0 = p[1], pal, pre;
    if (typeof state === 'object' && state) { pre = 'SY_' + state.s + '_'; pal = state.c; }
    else { pre = 'C_' + state + '_'; pal = ST_PAL[state]; }
    for (var cy = 0; cy < 4; cy++) for (var cx = 0; cx < 4; cx++) {
      var inner = cx >= 1 && cx <= 2 && cy >= 1 && cy <= 2;
      put(c0 + cx, r0 + cy, inner ? art.t(pre + ((cy - 1) * 2 + cx - 1)) : art.t('CF' + (cy * 4 + cx)));
    }
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) putA((c0 >> 1) + a, (r0 >> 1) + b, pal);
  }
  function drawSmall(side, i, state) {
    var p = smallRC(side, i);
    for (var k = 0; k < 4; k++) put(p[0] + (k & 1), p[1] + (k >> 1), art.t('SC_' + state + '_' + k));
    putA(p[0] >> 1, p[1] >> 1, ST_PAL[state]);
  }
  function cells() { return g.run.n * g.run.n; }
  function drawAll(state) {
    var R = g.run, N = cells(), i;
    if (R.kind === 'race') { for (i = 0; i < N; i++) { drawSmall(0, i, state); drawSmall(1, i, state); } return; }
    for (i = 0; i < N; i++) drawBig(i, state);
  }

  /* ---------------- 游標連發 ---------------- */
  function rep(btn) {
    var I = NES.Input;
    if (!I.held(btn)) { g.hold[btn] = 0; return false; }
    var h = (g.hold[btn] = (g.hold[btn] || 0) + 1);
    return h === 1 || (h > REP_DELAY && (h - REP_DELAY - 1) % REP_EVERY === 0);
  }
  function dirs() { return { u: rep(BTN.UP), d: rep(BTN.DOWN), l: rep(BTN.LEFT), r: rep(BTN.RIGHT) }; }
  function startPressed() { var I = NES.Input; return I.pressed(BTN.START) && !I.held(BTN.SELECT); }

  /* ---------------- 紀錄 ---------------- */
  function load(k) { return CT.load('flash', k, 0) | 0; }
  function save(k, v) { CT.save('flash', k, v); }
  function saveRun(R) {
    if (!R || R.cheated) return false;
    var nb = false;
    if (R.score > load('best')) { save('best', R.score); nb = true; }
    if (R.kind !== 'race' && R.cleared > load('lv' + R.m)) { save('lv' + R.m, R.cleared); nb = true; }
    return nb;
  }
  function bestLine(m) {
    if (m === 3) return masterOpen() ? 'WINS VS ZIPPY ' + pad(load('race' + g.lvl[3]), 3) : 'WINS ' + pad(load('race' + g.lvl[3]), 3) + '  BEAT HARD>MASTER';
    var l = load('lv' + m);
    return l ? 'BEST LEVEL ' + pad(l, 2) + ' CLEARED' : 'NO RECORD YET';
  }

  /* ================================================================ 標題 */
  function titleRow(i) { return 9 + i * 2; }
  function masterOpen() { return load('master') > 0; }
  function lvCount(m) { return (m === 3 && !masterOpen()) ? MASTER : MODES[m].lv.length; }   // 未解鎖：競速只能選 EASY~HARD
  function titleLine(i) { return (i + 1) + ' ' + padR(MODES[i].name, 13) + padL(MODES[i].lv[g.lvl[i]], 10); }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.paused = false;
    redraw(function () {
      for (var c = 0; c < 32; c++) { put(c, 2, art.t('BHB')); put(c, 28, art.t('BH')); }
      big(6, 4, 'STAR FLASH');
      center(7, 'SEE IT  KEEP IT  REPEAT IT');
      for (var i = 0; i < MODES.length; i++) text(3, titleRow(i), titleLine(i));
      center(17, padR(bestLine(g.sel), 26));
      text(3, 19, 'A MARK  B REPLAY ONCE');
      text(3, 21, 'HOLD START+SELECT: MENU');
      text(3, 23, 'C/$ = CHEAT');
    });
    AU.play('flash_title');
  }
  function updateTitle() {
    g.t++;
    var D = dirs(), I = NES.Input;
    var d = D.d || (I.pressed(BTN.SELECT) && !I.held(BTN.START)) ? 1 : (D.u ? -1 : 0);
    if (d) { g.sel = (g.sel + d + MODES.length) % MODES.length; AU.sfx('flash_move'); }
    var l = D.r ? 1 : (D.l ? -1 : 0);
    if (l) { var n = lvCount(g.sel); g.lvl[g.sel] = (g.lvl[g.sel] + l + n) % n; text(3, titleRow(g.sel), titleLine(g.sel)); AU.sfx('flash_move'); }
    if (d || l) center(17, padR(bestLine(g.sel), 26));
    if (startPressed() || I.pressed(BTN.A)) startGame(g.sel, Math.min(g.lvl[g.sel], lvCount(g.sel) - 1));
  }

  /* ================================================================ 開局 / 每級 */
  function startGame(m, opt) {
    g.runs++;
    g.seed = (seedBase() * 7 + g.runs * 7919 + m * 101 + opt * 13) & 0x7fffffff;
    for (var i = 0; i < 4; i++) rnd();
    g.run = { kind: MODES[m].key, m: m, opt: opt, level: 1, lives: LIVES, score: 0, cleared: 0, phase: 'ready', pt: 0, n: 3,
      cx: 1, cy: 1, cheated: false, continues: 0, saved: false, first: true, replayUsed: false, ps: 0, cs: 0, round: 1 };
    g.mode = 'play'; g.paused = false; g.msg = ''; g.msgT = 0; g.t = 0; g.hold = {};
    var song = g.run.kind === 'seq' ? 'flash_seq' : (g.run.kind === 'race' ? 'flash_race' : 'flash_play');
    beginLevel();
    AU.play(song);
    return g.run;
  }
  function showFrames(base) { var R = g.run; return R.kind === 'race' ? base : Math.round(base * SPEED_MUL[R.opt] / 256); }
  function beginLevel() {
    var R = g.run, L = R.level;
    R.replayUsed = false; R.press = null; R.wrong = -1; R.ok = false;
    if (R.kind === 'pattern') { R.n = PAT_N[L]; R.k = PAT_K[L]; R.showT = showFrames(40 + 10 * R.k); }
    else if (R.kind === 'seq') { R.n = L <= 4 ? 3 : 4; R.k = L + 2; R.on = showFrames(L >= 7 ? 18 : 24); R.gap = showFrames(L >= 7 ? 6 : 8); R.showT = R.k * (R.on + R.gap); }
    else if (R.kind === 'spot') { R.n = SPOT_N[L]; R.k = SPOT_K[L]; R.c = SPOT_C[L]; R.showT = showFrames(60 + 12 * R.k); }
    else { R.n = 4; R.k = Math.min(7, 3 + ((R.round - 1) >> 1)); R.showT = 40 + 10 * R.k; }
    R.cx = R.n >> 1; R.cy = R.n >> 1;
    R.phase = 'ready'; R.pt = 0; R.readyT = R.first ? READY_F : LEVEL_F;
    var N = R.n * R.n;
    R.marks = []; for (var i = 0; i < N; i++) R.marks.push(false);
    redraw(function () {
      drawField();
      if (R.kind === 'race') { text(14 - 2 * R.n, 8, 'YOU'); text(18, 8, 'ZIPPY'); }
      drawAll('EMP');
      hud();
    }, R.kind === 'spot' ? PAL_SPOT : PAL_MAIN);
    AU.sfx('flash_ready');
  }
  function makeChallenge() {
    var R = g.run, N = R.n * R.n, i;
    if (R.kind === 'pattern' || R.kind === 'race') {
      R.lit = []; for (i = 0; i < N; i++) R.lit.push(false);
      pick(N, R.k).forEach(function (c) { R.lit[c] = true; });
    } else if (R.kind === 'seq') {
      R.seq = []; R.pos = 0;
      for (i = 0; i < R.k; i++) { var c; do { c = rnd() % N; } while (i > 0 && c === R.seq[i - 1]); R.seq.push(c); }
    } else {
      R.before = []; for (i = 0; i < N; i++) R.before.push(null);
      pick(N, R.k).forEach(function (c) { R.before[c] = { s: rnd() % 8, c: rnd() % 4 }; });
      R.after = R.before.map(function (x) { return x ? { s: x.s, c: x.c } : null; });
      R.changes = pick(N, R.c);
      R.found = [];
      R.changes.forEach(function (c) {
        var b = R.before[c], t;
        if (!b) { R.after[c] = { s: rnd() % 8, c: rnd() % 4 }; return; }
        t = rnd() % (R.level >= 4 ? 3 : 2);
        if (t === 0) R.after[c] = null;
        else if (t === 1) { var s; do { s = rnd() % 8; } while (s === b.s); R.after[c] = { s: s, c: b.c }; }
        else { var cc; do { cc = rnd() % 4; } while (cc === b.c); R.after[c] = { s: b.s, c: cc }; }
      });
    }
  }

  /* ================================================================ 展示 */
  function showBoard() {
    var R = g.run, N = cells(), i;
    if (R.kind === 'pattern') for (i = 0; i < N; i++) drawBig(i, R.lit[i] ? 'LIT' : 'EMP');
    else if (R.kind === 'race') for (i = 0; i < N; i++) { drawSmall(0, i, R.lit[i] ? 'LIT' : 'EMP'); drawSmall(1, i, R.lit[i] ? 'LIT' : 'EMP'); }
    else if (R.kind === 'spot') for (i = 0; i < N; i++) drawBig(i, R.before[i] || 'EMP');
    else drawAll('EMP');
  }
  function inputBoard() {
    var R = g.run, N = cells(), i;
    if (R.kind === 'pattern') for (i = 0; i < N; i++) drawBig(i, R.marks[i] ? 'MRK' : 'EMP');
    else if (R.kind === 'race') {
      for (i = 0; i < N; i++) { drawSmall(0, i, R.pm[i] ? 'MRK' : 'EMP'); drawSmall(1, i, R.cm[i] ? 'MRK' : 'EMP'); }
    } else if (R.kind === 'spot') for (i = 0; i < N; i++) drawBig(i, R.after[i] || 'EMP');
    else drawAll('EMP');
  }
  function enterShow(replay) {
    var R = g.run;
    if (!replay) makeChallenge();
    R.phase = 'show'; R.pt = 0; R.seqLit = -1;
    showBoard();
    if (!replay) AU.sfx('flash_go');
  }
  function updateShow() {
    var R = g.run;
    if (R.kind === 'seq') {
      var step = R.on + R.gap, j = Math.floor(R.pt / step), inOn = (R.pt % step) < R.on, lit = (j < R.k && inOn) ? R.seq[j] : -1;
      if (lit !== R.seqLit) {
        if (R.seqLit >= 0) drawBig(R.seqLit, 'EMP');
        if (lit >= 0) { drawBig(lit, 'LIT'); AU.sfx('flash_t' + lit); }
        R.seqLit = lit;
      }
    }
    if (++R.pt < R.showT) return;
    if (R.kind === 'seq' && R.seqLit >= 0) { drawBig(R.seqLit, 'EMP'); R.seqLit = -1; }
    if (R.kind === 'spot') { R.phase = 'mask'; R.pt = 0; drawAll('EMP'); return; }
    enterInput();
  }
  function enterInput() {
    var R = g.run;
    R.phase = 'input'; R.pt = 0;
    if (R.kind === 'race' && !R.pm) raceStart();
    inputBoard();
  }

  /* ================================================================ 輸入 */
  function cursorMove(D) {
    var R = g.run, moved = false;
    if (D.u && R.cy > 0) { R.cy--; moved = true; }
    if (D.d && R.cy < R.n - 1) { R.cy++; moved = true; }
    if (D.l && R.cx > 0) { R.cx--; moved = true; }
    if (D.r && R.cx < R.n - 1) { R.cx++; moved = true; }
    if (moved) AU.sfx('flash_move');
  }
  function replay() {
    var R = g.run;
    if (R.replayUsed) { say('REPLAY USED THIS LEVEL', 50); return; }
    if (R.kind === 'race') { say('NO REPLAY IN A RACE!', 50); return; }
    if (R.kind === 'seq' && R.press) return;
    R.replayUsed = true;
    if (R.kind === 'seq') R.pos = 0;
    AU.sfx('flash_replay');
    say('REPLAY!  LEVEL SCORE HALVED', 60);
    enterShow(true);
  }
  function updateInput() {
    var R = g.run, I = NES.Input;
    R.pt++;
    if (R.kind === 'race') { updateRace(); }
    if (R.phase !== 'input') return;
    if (R.kind === 'seq' && R.press) {
      if (--R.press.t <= 0) {
        drawBig(R.press.i, 'EMP');
        var pr = R.press; R.press = null;
        if (pr.bad) fail(pr.i);
        else if (R.pos >= R.k) success();
      }
      return;
    }
    if (R.kind === 'race' && R.pOut) return;
    cursorMove(dirs());
    var i = R.cy * R.n + R.cx;
    if (I.pressed(BTN.B)) { replay(); return; }
    if (!I.pressed(BTN.A)) return;
    if (R.kind === 'pattern') {
      if (R.marks[i]) return;
      if (!R.lit[i]) { fail(i); return; }
      R.marks[i] = true; drawBig(i, 'MRK'); AU.sfx('flash_mark');
      if (R.marks.filter(Boolean).length >= R.k) success();
    } else if (R.kind === 'seq') {
      var good = R.seq[R.pos] === i;
      drawBig(i, good ? 'LIT' : 'BAD');
      AU.sfx(good ? 'flash_t' + i : 'flash_bad');
      R.press = { i: i, t: PRESS_F, bad: !good };
      if (good) R.pos++;
    } else if (R.kind === 'spot') {
      if (R.found.indexOf(i) >= 0) return;
      if (R.changes.indexOf(i) < 0) { fail(i); return; }
      R.found.push(i); AU.sfx('flash_mark');
      if (R.found.length >= R.changes.length) success();
    } else {
      if (R.pm[i]) return;
      if (!R.lit[i]) { R.pOut = true; drawSmall(0, i, 'BAD'); AU.sfx('flash_bad'); say('OOPS! WRONG CELL', 60); return; }
      R.pm[i] = true; drawSmall(0, i, 'MRK'); AU.sfx('flash_mark');
      if (R.pm.filter(Boolean).length >= R.k && !R.cDone) R.pDone = true;
    }
  }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }
  function levelScore() {
    var R = g.run, s;
    if (R.kind === 'pattern') s = 100 * R.k;
    else if (R.kind === 'seq') s = 60 * R.k;
    else s = 150 * R.c + 20 * R.k;
    if (R.opt === 2) s *= 2;
    if (R.replayUsed) s = s >> 1;
    return s;
  }
  function success() {
    var R = g.run, s = levelScore();
    R.score += s; R.cleared = Math.max(R.cleared, R.level); R.ok = true;
    R.phase = 'judge'; R.pt = 0;
    AU.sfx('flash_level');
    say('LEVEL ' + R.level + ' CLEAR!  +' + s, JUDGE_OK);
    if (R.kind === 'pattern' && R.opt >= 1 && R.level >= 8 && !R.cheated && !g.goalRun) g.goalRun = R;
  }
  function fail(i) {
    var R = g.run, N = cells(), k;
    R.lives--; R.ok = false; R.wrong = i;
    R.phase = 'judge'; R.pt = 0;
    if (R.kind === 'pattern') { for (k = 0; k < N; k++) if (R.lit[k] && !R.marks[k]) drawBig(k, 'MIS'); drawBig(i, 'BAD'); }
    else if (R.kind === 'seq') { drawBig(R.seq[R.pos], 'MIS'); if (i !== R.seq[R.pos]) drawBig(i, 'BAD'); }
    AU.sfx('flash_bad');
    say(R.lives > 0 ? 'MISS!  LIVES LEFT ' + R.lives : 'MISS!', JUDGE_NG);
  }
  function updateJudge() {
    var R = g.run;
    if (++R.pt < (R.ok ? JUDGE_OK : JUDGE_NG)) return;
    R.first = false;
    if (R.kind === 'race') { raceNext(); return; }
    if (!R.ok) { if (R.lives <= 0) { enterOver('OUT OF LIVES ON LEVEL ' + R.level); return; } beginLevel(); return; }
    if (R.level >= MAX_LV) { allClear(); return; }
    R.level++;
    beginLevel();
  }

  /* ================================================================ 競速（吱比 ZIPPY） */
  function raceStart() {
    var R = g.run, N = cells(), C = CPUS[R.opt], i;
    R.pm = []; R.cm = []; for (i = 0; i < N; i++) { R.pm.push(false); R.cm.push(false); }
    R.pOut = false; R.cOut = false; R.pDone = false; R.cDone = false; R.winner = '';
    // 吱比「記住」：每個亮格以 acc/256 機率記對；記不得的換成一個錯格（之後會點錯出局）
    var good = [], bad = [], used = {};
    for (i = 0; i < N; i++) if (R.lit[i]) { if ((rnd() & 255) < C.acc) good.push(i); else bad.push(i); }
    var wrong = [];
    bad.forEach(function () { var c; do { c = rnd() % N; } while (R.lit[c] || used[c]); used[c] = true; wrong.push(c); });
    // 走訪順序：從中央出發，每次走最近的
    var order = [], pos = [R.n >> 1, R.n >> 1], left = good.slice();
    while (left.length) {
      var bi = 0, bd = 1e9;
      for (var k = 0; k < left.length; k++) { var d = Math.abs(left[k] % R.n - pos[0]) + Math.abs(((left[k] / R.n) | 0) - pos[1]); if (d < bd) { bd = d; bi = k; } }
      var c2 = left.splice(bi, 1)[0]; order.push(c2); pos = [c2 % R.n, (c2 / R.n) | 0];
    }
    R.cpu = { q: order.concat(wrong), t: 0, kx: R.n >> 1, ky: R.n >> 1, stage: 0, j: 0 };
  }
  function cpuJit(C) { var J = C.jit | 0; return J > 0 ? (rnd() % (2 * J + 1)) - J : 0; }   // 每步 −J~+J 幀（遊戲自己的 rnd，可重現）
  function updateRace() {
    var R = g.run, C = CPUS[R.opt], P = R.cpu;
    if (!R.cOut && !R.cDone && P.q.length) {
      P.t++;
      if (P.stage === 0) { if (P.t >= C.think) { P.stage = 1; P.t = 0; P.j = cpuJit(C); } }
      else if (P.t >= C.step + P.j) {
        P.t = 0; P.j = cpuJit(C);
        var tg = P.q[0], tx = tg % R.n, ty = (tg / R.n) | 0;
        if (P.ky !== ty) P.ky += P.ky < ty ? 1 : -1;
        else if (P.kx !== tx) P.kx += P.kx < tx ? 1 : -1;
        else {
          P.q.shift();
          if (!R.lit[tg]) { R.cOut = true; drawSmall(1, tg, 'BAD'); AU.sfx('flash_bad'); say('ZIPPY MISSED!', 50); }
          else { R.cm[tg] = true; drawSmall(1, tg, 'MRK'); if (R.cm.filter(Boolean).length >= R.k && !R.pDone) R.cDone = true; }
        }
      }
    }
    if (R.pDone || R.cDone || (R.pOut && R.cOut)) {
      R.winner = R.pDone ? 'p' : (R.cDone ? 'c' : '');
      if (R.winner === 'p') { R.ps++; R.score += 100 * R.k; AU.sfx('flash_level'); say('YOU TAKE ROUND ' + R.round + '!', JUDGE_NG); }
      else if (R.winner === 'c') { R.cs++; AU.sfx('flash_bad'); say('ZIPPY TAKES ROUND ' + R.round, JUDGE_NG); }
      else say('NOBODY SCORES', JUDGE_NG);
      for (var i = 0; i < cells(); i++) if (R.lit[i]) { if (!R.pm[i]) drawSmall(0, i, 'MIS'); if (!R.cm[i]) drawSmall(1, i, 'MIS'); }
      R.phase = 'judge'; R.pt = 0; R.ok = true;
    }
  }
  function raceNext() {
    var R = g.run;
    R.pm = null;
    if (R.ps >= RACE_WIN) { raceWin(); return; }
    if (R.cs >= RACE_WIN) { enterOver('ZIPPY WINS ' + R.cs + ' TO ' + R.ps); return; }
    R.round++;
    beginLevel();
  }
  function raceWin() {
    var R = g.run, nb = saveRun(R);
    if (!R.cheated) save('race' + R.opt, load('race' + R.opt) + 1);
    var unlock = !R.cheated && R.opt === 2 && !masterOpen();
    if (unlock) save('master', 1);
    R.saved = true;
    enterResult(['YOU OUTRAN ZIPPY!', 'ROUNDS  YOU ' + R.ps + ' - ' + R.cs + ' ZIPPY', '', unlock ? 'NEW RIVAL: ZIPPY MASTER!' : 'ZIPPY ' + CPUS[R.opt].name + '   SCORE ' + pad(R.score, 6)], R.cs === 0 ? 3 : (R.cs <= 2 ? 2 : 1), nb);
  }

  /* ================================================================ 結算 / GAME OVER */
  function allClear() {
    var R = g.run, nb = saveRun(R);
    R.saved = true;
    enterResult(['ALL 12 LEVELS CLEAR!', MODES[R.m].name + '  ' + SPEEDS[R.opt], '', 'LIVES LEFT ' + R.lives + '   SCORE ' + pad(R.score, 6)], R.lives >= 3 ? 3 : (R.lives >= 2 ? 2 : 1), nb);
  }
  function enterResult(lines, st, nb) {
    var R = g.run;
    g.mode = 'result'; g.overT = 0;
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 4, art.t('BH')); put(c, 25, art.t('BHB')); }
      for (var i = 0; i < lines.length; i++) if (lines[i]) center(7 + i * 2, lines[i]);
      center(16, 'RATING ' + stars(st));
      if (R.cheated) center(19, 'CHEAT USED - NOT SAVED');
      else if (nb) center(19, 'NEW RECORD!');
      center(22, 'PUSH START');
    });
    AU.play('flash_win');
  }
  function enterOver(why) {
    var R = g.run;
    saveRun(R);
    g.mode = 'over'; g.overT = 0; R.why = why;
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('BH')); put(c, 24, art.t('BHB')); }
      center(8, 'GAME OVER');
      center(11, why);
      center(14, R.kind === 'race' ? 'SCORE ' + pad(R.score, 6) : 'CLEARED ' + pad(R.cleared, 2) + '  SCORE ' + pad(R.score, 6));
      center(17, 'C/$ = CONTINUE HERE');
      center(19, 'START = TITLE');
    });
    AU.play('flash_lose');
  }

  /* ================================================================ 密技 */
  function doCheat() {
    var R = g.run;
    if (!R) return;
    R.cheated = true;
    if (g.mode === 'over') {
      R.continues++;
      g.mode = 'play';
      AU.play(R.kind === 'seq' ? 'flash_seq' : (R.kind === 'race' ? 'flash_race' : 'flash_play'));
      if (R.kind === 'race') { R.cs = 0; R.round++; R.pm = null; beginLevel(); say('CONTINUE! ZIPPY BACK TO 0', 70); }
      else { R.lives = LIVES; beginLevel(); say('CONTINUE! LEVEL ' + R.level, 70); }
      return;
    }
    if (R.kind === 'race') { R.ps = Math.min(RACE_WIN - 1, R.ps + 1); say('STAR BOOST! +1 POINT', 60); }
    else { R.lives = Math.min(5, R.lives + 1); say('STAR BOOST! +1 LIFE', 60); }
    AU.sfx('flash_win');
  }

  /* ================================================================ 精靈 / HUD */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, R = g.run, q, i;
    function spr(x, y, tile, pal, fh, fv) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv }); }
    function box(x, y, w, pal) {
      var c = art.s('CUR');
      spr(x - 1, y - 1, c, pal); spr(x + w - 7, y - 1, c, pal, true);
      spr(x - 1, y + w - 7, c, pal, false, true); spr(x + w - 7, y + w - 7, c, pal, true, true);
    }
    var blink = (g.t & 8) === 0;
    if (g.mode === 'title') spr(10, titleRow(g.sel) * 8, art.s('ARW'), 0);
    if (R && g.mode === 'play' && !g.paused) {
      var p;
      if (R.kind === 'race') {
        if (R.phase === 'input' || R.phase === 'judge') {
          if (!R.pOut || blink) { p = smallRC(0, R.cy * R.n + R.cx); box(p[0] * 8, p[1] * 8, 16, 0); }
          if (R.cpu && (!R.cOut || blink)) { p = smallRC(1, R.cpu.ky * R.n + R.cpu.kx); box(p[0] * 8, p[1] * 8, 16, 1); }
        }
      } else if (R.phase === 'input' || (R.phase === 'judge' && R.kind !== 'spot')) {
        p = bigRC(R.cy * R.n + R.cx); box(p[0] * 8, p[1] * 8, 32, 0);
      }
      if (R.kind === 'spot' && (R.phase === 'input' || R.phase === 'judge')) {
        for (i = 0; i < R.found.length; i++) { p = bigRC(R.found[i]); spr(p[0] * 8 + 20, p[1] * 8 + 4, art.s('CHK'), 2); }
        if (R.phase === 'judge' && !R.ok) {
          p = bigRC(R.wrong); spr(p[0] * 8 + 12, p[1] * 8 + 12, art.s('XX'), 3);
          if (blink) for (i = 0; i < R.changes.length; i++) if (R.found.indexOf(R.changes[i]) < 0) { p = bigRC(R.changes[i]); spr(p[0] * 8 + 20, p[1] * 8 + 20, art.s('RING'), 0); }
        }
      }
    }
    for (q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }
  function hud() {
    var R = g.run;
    if (!R) return;
    var hearts = '', i, cs = R.cheated ? '$' : ' ';
    for (i = 0; i < 5; i++) hearts += i < R.lives ? '^' : ' ';
    if (R.kind === 'race') text(1, 2, padR('RACE R' + pad(R.round, 2) + '   YOU ' + R.ps + ' - ' + R.cs + ' ZIPPY', 29) + cs);
    else text(1, 2, padR(SHORT[R.m] + ' LV' + pad(R.level, 2) + ' ' + SPEEDS[R.opt], 23) + hearts + ' ' + cs);
    var sub = 'SCORE ' + pad(R.score, 6);
    if (R.kind === 'pattern') sub += '  CELLS ' + R.k;
    else if (R.kind === 'seq') sub += '  LENGTH ' + pad(R.k, 2) + (R.phase === 'input' ? ' ' + pad(R.pos, 2) + '/' + pad(R.k, 2) : '      ');
    else if (R.kind === 'spot') sub += '  CHANGES ' + R.c + (R.found && R.phase === 'input' ? ' FOUND ' + R.found.length : '        ');
    else sub += '  ZIPPY ' + CPUS[R.opt].name;
    text(1, 3, padR(sub, 30));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (R.phase === 'ready') line = R.first ? 'READY  ' + (3 - Math.floor(R.pt / 30)) + '...' : (R.kind === 'race' ? 'ROUND ' + R.round : 'LEVEL ' + R.level) + '  GET READY';
    else if (g.msgT > 0) line = g.msg;
    else if (R.phase === 'show') line = R.kind === 'seq' ? 'WATCH THE ORDER...' : (R.kind === 'spot' ? 'REMEMBER EVERY SYMBOL' : 'REMEMBER THE STARS!');
    else if (R.phase === 'mask') line = '... WHAT CHANGED?';
    else if (R.phase === 'input') {
      if (R.kind === 'race') line = R.pOut ? 'WAIT FOR ZIPPY...' : 'MARK ALL ' + R.k + ' STARS FAST!';
      else line = (R.kind === 'spot' ? 'A = IT CHANGED' : 'A MARK') + '  B REPLAY' + (R.replayUsed ? ' USED' : ' X1');
    } else line = '';
    text(1, MSG_ROW, padR(line, 30));
  }

  /* ================================================================ 主迴圈 */
  function updatePlay() {
    var R = g.run;
    if (startPressed()) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      g.hold = {};
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (R.phase === 'ready') { R.pt++; if (R.first && (R.pt === 30 || R.pt === 60)) AU.sfx('flash_ready'); if (R.pt >= R.readyT) enterShow(false); }
    else if (R.phase === 'show') updateShow();
    else if (R.phase === 'mask') { if (++R.pt >= MASK_F) enterInput(); }
    else if (R.phase === 'input') updateInput();
    else if (R.phase === 'judge') updateJudge();
  }

  /* ================================================================ 機器人：只讀畫面 */
  function botLag() { return botQ('lag', 12, 0, 120); }
  function botQ(k, d, a, b) { var v = parseInt((CT.query && CT.query(k)) || '', 10); return isNaN(v) ? d : clamp(v, a, b); }
  // 真人模型參數（fix-r8，預設 = 舊行為）：&mv= 每格移動間隔（預設 6）、&mvj= 間隔抖動 ±、&forget= 每個亮格記錯的百分比（記成另一格 ⇒ 點錯）、&dec= 每按一次 A 後找下一目標的決策幀、&hseed=
  function botRnd(B) { B.hs = (B.hs * 1103515245 + 12345) & 0x7fffffff; return B.hs >> 8; }
  function botGap(B) { return B.mv + (B.mvj ? (botRnd(B) % (2 * B.mvj + 1)) - B.mvj : 0); }
  function readCell(i) {        // 回傳 [中央磁磚, 屬性]（競速 = 左盤小格）
    var R = g.run, ppu = nes0.ppu, p;
    if (R.kind === 'race') { p = smallRC(0, i); return [ppu.getTile(0, p[0], p[1]), ppu.getAttr(0, p[0] >> 1, p[1] >> 1)]; }
    p = bigRC(i);
    return [ppu.getTile(0, p[0] + 1, p[1] + 1), ppu.getAttr(0, p[0] >> 1, p[1] >> 1)];
  }
  function botMask() {
    var B = g.bot;
    if (!B) {
      B = g.bot = { t: 0, prev: 0, last: 0, react: 0, key: '', lag: botLag(), seen: {}, seq: [], prevLit: -1, before: [], done: {}, pos: 0, sig: '', stable: 0,
        mv: botQ('mv', 6, 1, 60), mvj: botQ('mvj', 0, 0, 20), forget: botQ('forget', 0, 0, 100), dec: botQ('dec', 0, 0, 120), hs: botQ('hseed', 99, 0, 0x7fffffff), gap: 0, got: {} };
      B.gap = botGap(B);
    }
    B.t++;
    var m = inner();
    if (m && B.prev) m = 0;
    B.prev = m;
    if (m) { B.last = B.t; B.gap = botGap(B) + (m === BTN.A ? B.dec : 0); }
    return m;
    function inner() {
      var R = g.run;
      if (g.mode === 'title') {
        var wm = clamp((parseInt((CT.query && CT.query('pmode')) || '1', 10) || 1) - 1, 0, 3);
        var wl = clamp((parseInt((CT.query && CT.query('plvl')) || '2', 10) || 2) - 1, 0, lvCount(wm) - 1);
        if (g.t < 30) return 0;
        if (g.sel !== wm) return (B.t % 8 === 0) ? BTN.DOWN : 0;
        if (g.lvl[wm] !== wl) return (B.t % 8 === 0) ? BTN.RIGHT : 0;
        return (B.t % 20 === 0) ? BTN.START : 0;
      }
      if (g.mode === 'over' || g.mode === 'result') return (g.overT > 60 && B.t % 30 === 0) ? BTN.START : 0;
      if (g.paused) return (B.t % 30 === 0) ? BTN.START : 0;
      if (!R) return 0;
      var N = cells(), i, c, LIT = art.t(R.kind === 'race' ? 'SC_LIT_0' : 'C_LIT_0'), MRK = art.t(R.kind === 'race' ? 'SC_MRK_0' : 'C_MRK_0');
      if (R.phase === 'ready') { B.seen = {}; B.got = {}; B.seq = []; B.prevLit = -1; B.before = []; B.done = {}; B.pos = 0; }
      // 畫面穩定度（格子區連續幾幀沒變）
      var sig = '';
      for (i = 0; i < N; i++) { c = readCell(i); sig += c[0] + ':' + c[1] + ','; }
      if (sig === B.sig) B.stable++; else { B.stable = 0; B.sig = sig; }
      if (R.phase === 'show') {
        var litNow = -1;
        for (i = 0; i < N; i++) {
          c = readCell(i);
          if (R.kind === 'spot') B.before[i] = c[0] + ':' + c[1];
          else if (c[0] === LIT) {
            litNow = i;
            if (!B.got[i]) {        // 第一次看到這格亮：真人模型可能記錯成另一個（當下沒亮的）格
              B.got[i] = true;
              var mem = i;
              if (B.forget && R.kind !== 'seq' && botRnd(B) % 100 < B.forget) {
                var dark = []; for (var q2 = 0; q2 < N; q2++) if (q2 !== i && readCell(q2)[0] !== LIT && !B.seen[q2]) dark.push(q2);
                if (dark.length) mem = dark[botRnd(B) % dark.length];
              }
              B.seen[mem] = true;
            }
          }
        }
        if (R.kind === 'seq') { if (litNow >= 0 && litNow !== B.prevLit) B.seq.push(litNow); B.prevLit = litNow; }
        return 0;
      }
      if (R.phase !== 'ready' && R.phase !== 'input') return 0;
      var k = R.phase + ':' + R.level + ':' + (R.round || 0);
      if (k !== B.key) { B.key = k; B.react = B.lag; }
      if (R.phase !== 'input' || B.stable < 2) return 0;
      if (R.kind === 'race' && R.pOut) return 0;
      if (R.kind === 'seq' && R.press) return 0;
      if (B.react > 0) { B.react--; return 0; }
      // 目標格
      var tgt = -1;
      if (R.kind === 'seq') tgt = B.pos < B.seq.length ? B.seq[B.pos] : -1;
      else if (R.kind === 'spot') { for (i = 0; i < N; i++) { c = readCell(i); if (!B.done[i] && B.before[i] !== undefined && B.before[i] !== c[0] + ':' + c[1]) { tgt = i; break; } } }
      else {
        var bd = 1e9;
        for (i = 0; i < N; i++) {
          if (!B.seen[i] || readCell(i)[0] === MRK) continue;
          var d = Math.abs(i % R.n - R.cx) + Math.abs(((i / R.n) | 0) - R.cy);
          if (d < bd) { bd = d; tgt = i; }
        }
      }
      if (tgt < 0) return 0;
      if (B.t - B.last < B.gap) return 0;
      var tx = tgt % R.n, ty = (tgt / R.n) | 0;
      if (R.cy !== ty) return R.cy < ty ? BTN.DOWN : BTN.UP;
      if (R.cx !== tx) return R.cx < tx ? BTN.RIGHT : BTN.LEFT;
      if (R.kind === 'seq') B.pos++;
      if (R.kind === 'spot') B.done[tgt] = true;
      return BTN.A;
    }
  }
  function goalOk() { return !!(g && g.goalRun && !g.goalRun.cheated); }

  /* ================================================================ 註冊 */
  var GAME = {
    id: 'flash', order: 3, title: '星塵閃記',
    legacy: ['flash-memory.html', 'flash-memory-master.html', 'pattern-match.html', 'pattern-rush.html', 'memory-pattern-race.html'],
    init: function (nes) {
      nes0 = nes;
      art = FL.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'flash_bg');
      NES.CHR.setPattern(1, 'flash_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(0x0F);
      g = newState();
      setPal(PAL_MAIN);
      for (i = 0; i < 4; i++) ppu.setSprPalette(i, PAL_SPR[i]);
      GAME.backTile = { tile: art.s('DOT'), pal: 0 };
      AU.init(nes);
      enterTitle();
      var qm = CT.query ? parseInt(CT.query('pmode') || '', 10) : NaN;
      if (qm >= 1 && qm <= 4 && CT.query('direct') === '1') {
        var ql = clamp((parseInt(CT.query('plvl') || '2', 10) || 2) - 1, 0, lvCount(qm - 1) - 1);
        g.sel = qm - 1; g.lvl[qm - 1] = ql; startGame(qm - 1, ql);
      }
    },
    update: function () {
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'over' || g.mode === 'result') { g.overT++; if (g.overT > 40 && startPressed()) enterTitle(); }
      else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') { if ((g.t & 31) === 0) text(11, 26, (g.t & 32) ? '          ' : 'PUSH START'); }
      else if (g.mode === 'play') hud();
      flush();
      drawSprites();
    },
    state: function () {
      var R = g.run, r = null;
      if (R) {
        r = { kind: R.kind, opt: R.opt, level: R.level, lives: R.lives, score: R.score, cleared: R.cleared, phase: R.phase, pt: R.pt, n: R.n, k: R.k,
          cx: R.cx, cy: R.cy, replayUsed: R.replayUsed, cheated: R.cheated, continues: R.continues, ok: R.ok, showT: R.showT,
          pos: R.pos, c: R.c, found: R.found ? R.found.length : 0, ps: R.ps, cs: R.cs, round: R.round, pOut: !!R.pOut, cOut: !!R.cOut,
          marks: R.marks ? R.marks.filter(Boolean).length : 0 };
      }
      return { mode: g.mode, sel: g.sel, lvl: g.lvl.slice(), paused: g.paused, t: g.t, queue: g.q.length + g.qa.length, run: r, goal: goalOk(), music: AU.current };
    },
    exit: function () { if (g && g.run && (g.mode === 'play' || g.mode === 'over')) saveRun(g.run); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || g.mode === 'result' || !g.run) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return pad(Math.min(999999, load('best')), 6); }
  };
  FL.MODES = MODES; FL.CPUS = CPUS; FL.SPEED_MUL = SPEED_MUL;
  FL.TABLE = { PAT_N: PAT_N, PAT_K: PAT_K, SPOT_N: SPOT_N, SPOT_K: SPOT_K, SPOT_C: SPOT_C, MAX_LV: MAX_LV };
  FL.K = { READY_F: READY_F, LEVEL_F: LEVEL_F, MASK_F: MASK_F, REP: [REP_DELAY, REP_EVERY] };
  FL.dev = {
    g: function () { return g; },
    start: function (m, opt) { g.sel = m; g.lvl[m] = opt; return startGame(m, opt); },
    title: function () { enterTitle(); },
    level: function (L) { g.run.level = L; g.run.first = false; beginLevel(); },
    skipReady: function () { var R = g.run; R.pt = R.readyT; },
    // 測試用（不給機器人）：答案
    answer: function () {
      var R = g.run;
      if (!R) return null;
      if (R.kind === 'seq') return R.seq ? R.seq.slice() : null;
      if (R.kind === 'spot') return R.changes ? R.changes.slice() : null;
      if (!R.lit) return null;
      var a = []; for (var i = 0; i < R.lit.length; i++) if (R.lit[i]) a.push(i); return a;
    },
    bigRC: function (i) { return bigRC(i); }, smallRC: function (s, i) { return smallRC(s, i); }
  };
  if (CT.register) CT.register(GAME);
})();
