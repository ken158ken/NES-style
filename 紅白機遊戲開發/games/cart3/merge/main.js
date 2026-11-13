/*
 * games/cart3/merge/main.js — 《星塵合星 STAR MERGE》（合輯卡帶三槽 1，id = merge，全域 CT.Merge）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）｜ 依賴：engine/*、games/cart1/registry.js、merge/{art,song}.js
 * 舊作概念：legacy 2048.html（只取「滑動 → 同階相撞合併升階 → 每步補一顆」的玩法；
 *           不做數字方塊：每階是原創天體圖示，數值只在 HUD，名稱 / 配色 / 配樂全原創）。
 *
 * 規則：十字鍵把全部天體往一方滑，相同的兩顆相撞合成下一階（一次滑動每顆只合一次），每次有效滑動後
 *       隨機空槽冒出一顆星塵（90%）或石礫（10%）。12 階：星塵 → 石礫 → 彗星 → 月 → 行星 → 環行星 →
 *       巨行星 → 恆星 → 超新星 → 脈衝星 → 星系 → 星系團。合成分數 = 新階的「值」2^階（HUD 才看得到）。
 * 模式（≥ 3 難度）：CLASSIC 4×4 / WIDE 5×5（寬鬆）/ TINY 3×3（最難）/ HOLE 5×5（中央黑洞格：
 *       擋住滑動；星塵 / 石礫滑進黑洞會被吞掉 +5 分；每 24 步黑洞跳到別的空槽）。
 * 友善：B = 復原 1 步（含卡死畫面）、卡死時 C/★ 原地續關、星等評價（依最高階）。
 *
 * 畫面（brief R7 §1-2）：盤面 / HUD 全在**背景名稱表**，每格 = 3×3 磚圖示 + 1 磚間隔（4 磚 = 2×2 屬性區塊 ⇒
 *       每格自己的調色盤）；精靈只用在合併閃光 / 生成光點（每線 ≤ n + 1 ≤ 6）。
 *       名稱表 + 屬性表寫入 = 影子表 + 差異佇列（每幀 ≤ 140 byte），一次滑動最多 25 格 × 13 byte 自動分幀。
 * 網址：`cart3.html?game=merge&debug=1[&bot=1][&mode=0..3][&seed=N][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MG = CT.Merge = CT.Merge || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var NT_LIMIT = 140, MAX_TIER = 12, GOAL_TIER = 8, HOLE_EVERY = 24, SWALLOW_PTS = 5;
  var MODES = [
    { id: 'classic', name: 'CLASSIC 4X4', n: 4, hole: false, key: 'best', stars: [7, 8, 10] },
    { id: 'wide', name: 'WIDE 5X5', n: 5, hole: false, key: 'best5', stars: [8, 9, 11] },
    { id: 'tiny', name: 'TINY 3X3', n: 3, hole: false, key: 'best3', stars: [5, 6, 7] },
    { id: 'hole', name: 'HOLE 5X5', n: 5, hole: true, key: 'besth', stars: [7, 8, 10] }
  ];
  var LAYOUT = { 3: { ox: 6, oy: 10, P: 22 }, 4: { ox: 4, oy: 8, P: 22 }, 5: { ox: 2, oy: 6, P: 24 } };
  var PAL_BG = [[0x00, 0x10, 0x30], [0x14, 0x27, 0x37], [0x11, 0x1A, 0x2C], [0x16, 0x28, 0x31]];   // fix-r7 P3-6（見 art.js TIERS）
  var PAL_SPR = [[0x28, 0x38, 0x30], [0x21, 0x31, 0x30], [0x16, 0x27, 0x38], [0x00, 0x10, 0x30]];
  var HOLE_PAL = 1;
  // fix-r7 P3-3：黑洞模式第一次進入的說明卡（盤面區 20 欄內、段落空一列）
  var INTRO = ['BLACK HOLE', '', 'BLOCKS SLIDES', '', 'EATS DUST/PEBBLE', '', 'FOR +5 EACH', '', 'JUMPS EVERY 24 MOVES'];
  var DIRS = { LEFT: 0, RIGHT: 1, UP: 2, DOWN: 3 };
  MG.MODES = MODES;

  var A = null;      // art
  var Au = null;     // audio

  /* ============================== 影子名稱表 + 屬性表 + 差異佇列 ============================== */
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

  /* ============================== 亂數（xorshift32，?seed= 可重現） ============================== */
  var rs = 0x2545F491;
  function rnd() { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs; }
  function rndN(n) { return rnd() % n; }

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, menu: 0, blink: 0,
      m: MODES[0], n: 4, cells: [], hole: -1, holeT: HOLE_EVERY,
      score: 0, moves: 0, time: 0, top: 1, best: 0, over: false, paused: false,
      undo: null, undos: 0, cheats: 0, ignited: false, goal: false, msg: '', msgT: 0,
      fx: [], pop: null, lastDir: -1, swallowed: 0, merges: 0, botT: 0, botWait: 0, seed: 0
    };
  }

  /* ============================== 盤面邏輯（純函式，機器人 / 測試共用） ============================== */
  // 線：idx 陣列（往 index 0 那端擠）；cells 值：0 = 空、1..12 = 階、-1 = 黑洞
  function lineIdx(n, dir, k) {
    var out = [], i;
    for (i = 0; i < n; i++) {
      if (dir === 0) out.push(k * n + i);
      else if (dir === 1) out.push(k * n + (n - 1 - i));
      else if (dir === 2) out.push(i * n + k);
      else out.push((n - 1 - i) * n + k);
    }
    return out;
  }
  // 回傳 {cells, moved, score, merged:[idx], swallowed}
  function slide(cells, n, dir) {
    var out = cells.slice(), moved = false, score = 0, merged = [], swallowed = 0, k, i;
    for (k = 0; k < n; k++) {
      var L = lineIdx(n, dir, k);
      var vals = L.map(function (ix) { return cells[ix]; });
      var res = new Array(n).fill(0);
      var a = 0;
      while (a < n) {
        if (vals[a] === -1) { res[a] = -1; a++; continue; }
        var b = a; while (b < n && vals[b] !== -1) b++;            // 段 [a, b)
        var holeFront = a > 0 && vals[a - 1] === -1;
        var seq = [], mergedLast = false, mpos = [];
        for (i = a; i < b; i++) {
          var t = vals[i];
          if (!t) continue;
          if (!seq.length && holeFront && t <= 2) { swallowed++; score += SWALLOW_PTS; continue; }
          if (seq.length && seq[seq.length - 1] === t && !mergedLast && t < MAX_TIER) {
            seq[seq.length - 1] = t + 1; mergedLast = true; score += Math.pow(2, t + 1); mpos.push(seq.length - 1);
          } else { seq.push(t); mergedLast = false; }
        }
        for (i = 0; i < seq.length; i++) res[a + i] = seq[i];
        for (i = 0; i < mpos.length; i++) merged.push(L[a + mpos[i]]);
        a = b;
      }
      for (i = 0; i < n; i++) { if (out[L[i]] !== res[i]) moved = true; out[L[i]] = res[i]; }
    }
    return { cells: out, moved: moved, score: score, merged: merged, swallowed: swallowed };
  }
  function canMove(cells, n) { for (var d = 0; d < 4; d++) if (slide(cells, n, d).moved) return true; return false; }
  function topTier(cells) { var m = 0; for (var i = 0; i < cells.length; i++) if (cells[i] > m) m = cells[i]; return m; }
  function empties(cells) { var e = []; for (var i = 0; i < cells.length; i++) if (cells[i] === 0) e.push(i); return e; }
  MG.logic = { slide: slide, canMove: canMove, topTier: topTier, lineIdx: lineIdx };

  /* ============================== 流程 ============================== */
  function sfx(n) { Au.sfx(n); }
  function spawn() {
    var e = empties(g.cells);
    if (!e.length) return -1;
    var at = e[rndN(e.length)];
    g.cells[at] = (rndN(10) === 0) ? 2 : 1;
    g.pop = { idx: at, t: 0 };
    return at;
  }
  function startGame() {
    g.m = MODES[g.menu]; g.n = g.m.n;
    var N = g.n * g.n;
    g.cells = new Array(N).fill(0);
    var seedQ = parseInt((CT.query && CT.query('seed')) || '', 10);
    g.seed = (isFinite(seedQ) && seedQ > 0) ? (seedQ >>> 0) : (((g.frames + 1) * 2654435761) >>> 0) || 0x1234567;
    rs = g.seed;
    g.hole = -1; g.holeT = HOLE_EVERY;
    if (g.m.hole) { g.hole = ((g.n * g.n) >> 1); g.cells[g.hole] = -1; }
    g.score = 0; g.moves = 0; g.time = 0; g.top = 1; g.over = false; g.paused = false;
    g.undo = null; g.undos = 0; g.cheats = 0; g.ignited = false; g.goal = false; g.msg = ''; g.msgT = 0;
    g.fx = []; g.pop = null; g.swallowed = 0; g.merges = 0; g.botWait = 0;
    g.intro = !!(g.m.hole && !CT.load('merge', 'seenHole', 0));   // fix-r7 P3-3：第一次進黑洞模式先看說明卡
    spawn(); spawn();
    g.top = topTier(g.cells);
    g.best = CT.load('merge', g.m.key, 0);
    g.mode = 'play';
    CT.blank(nes0, function () { drawPlayScreen(); });
    Au.stop(); Au.play('merge_play');
  }
  function toTitle() {
    saveBest();
    g.mode = 'title'; g.paused = false; g.over = false;
    CT.blank(nes0, function () { drawTitleScreen(); });
    Au.stop(); Au.play('merge_title');
  }
  function snapshot() {
    return { cells: g.cells.slice(), score: g.score, moves: g.moves, rs: rs, hole: g.hole, holeT: g.holeT, top: g.top,
             swallowed: g.swallowed, merges: g.merges };
  }
  function doMove(dir) {
    var r = slide(g.cells, g.n, dir);
    if (!r.moved) { sfx('merge_bump'); return false; }
    g.undo = snapshot();
    g.cells = r.cells; g.score = Math.min(9999999, g.score + r.score); g.moves++; g.lastDir = dir;
    g.swallowed += r.swallowed; g.merges += r.merged.length;
    g.fx = r.merged.map(function (ix) { return { idx: ix, t: 0 }; });
    var oldTop = g.top;
    g.top = Math.max(g.top, topTier(g.cells));
    if (g.m.hole) {
      if (--g.holeT <= 0) relocateHole();
    }
    spawn();
    if (r.swallowed) { g.msg = 'GULP +' + (SWALLOW_PTS * r.swallowed); g.msgT = 60; }
    if (r.swallowed) sfx('merge_swallow');
    else if (g.top > oldTop && g.top >= 6) sfx('merge_big');
    else if (r.merged.length) sfx('merge_merge');
    else sfx('merge_slide');
    if (g.top >= GOAL_TIER && !g.ignited) {
      g.ignited = true; g.msg = 'IGNITED!'; g.msgT = 150;
      if (g.m.id === 'classic' && g.cheats === 0) g.goal = true;
      Au.stop(); Au.play('merge_ignite'); g.igniteT = 100;
    } else if (g.top > oldTop && g.top >= 5) { g.msg = 'NEW TIER'; g.msgT = 90; }
    if (g.score > g.best) g.best = g.score;
    if (!canMove(g.cells, g.n)) gameOver();
    return true;
  }
  function relocateHole() {
    g.holeT = HOLE_EVERY;
    var e = empties(g.cells);
    if (!e.length) return;
    var to = e[rndN(e.length)];
    g.cells[g.hole] = 0; g.hole = to; g.cells[to] = -1;
    g.msg = 'SHIFTED!'; g.msgT = 60;
  }
  function gameOver() {
    g.over = true; g.msgT = 0;
    saveBest();
    Au.stop(); Au.play('merge_over');
  }
  function doUndo() {
    if (!g.undo) { sfx('merge_bump'); return false; }
    var u = g.undo;
    g.cells = u.cells; g.score = u.score; g.moves = u.moves; rs = u.rs; g.hole = u.hole; g.holeT = u.holeT; g.top = u.top;
    g.swallowed = u.swallowed; g.merges = u.merges;
    g.undo = null; g.undos++; g.fx = []; g.pop = null;
    if (g.over) { g.over = false; Au.stop(); Au.play('merge_play'); }
    g.msg = 'UNDO'; g.msgT = 40;
    sfx('merge_undo');
    return true;
  }
  function starsOf(top, m) { var s = 0; for (var i = 0; i < 3; i++) if (top >= m.stars[i]) s++; return s; }
  function saveBest() {
    if (!g || g.mode !== 'play') return;
    if (g.score > CT.load('merge', g.m.key, 0)) CT.save('merge', g.m.key, g.score);
    if (g.top > CT.load('merge', g.m.key + 'tier', 0)) CT.save('merge', g.m.key + 'tier', g.top);
  }

  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }

  function updateTitle() {
    g.blink++;
    if (pressed(BTN.LEFT) || pressed(BTN.UP)) { g.menu = (g.menu + MODES.length - 1) % MODES.length; sfx('merge_menu'); }
    if (pressed(BTN.RIGHT) || pressed(BTN.DOWN)) { g.menu = (g.menu + 1) % MODES.length; sfx('merge_menu'); }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('merge_ok'); startGame(); }
  }
  function updatePlay() {
    if (g.intro) {    // 黑洞說明卡：A / START 關閉（只出現一次，存檔記住）
      if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) { g.intro = false; CT.save('merge', 'seenHole', 1); sfx('merge_ok'); }
      return;
    }
    if (pressed(BTN.START) && !held(BTN.SELECT) && !g.over) {
      g.paused = !g.paused;
      if (g.paused) Au.pause(); else if (!Au.resume()) Au.play('merge_play');
      sfx('merge_menu');
    }
    if (g.paused) return;
    if (g.msgT > 0) g.msgT--;
    if (g.igniteT > 0 && --g.igniteT === 0 && !g.over) Au.play('merge_play');
    for (var i = g.fx.length - 1; i >= 0; i--) if (++g.fx[i].t > 14) g.fx.splice(i, 1);
    if (g.pop && ++g.pop.t > 12) g.pop = null;
    if (g.over) {
      if (pressed(BTN.B)) { doUndo(); return; }
      if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) toTitle();
      return;
    }
    g.time++;
    if (pressed(BTN.B)) { doUndo(); return; }
    var d = -1;
    if (pressed(BTN.LEFT)) d = 0; else if (pressed(BTN.RIGHT)) d = 1; else if (pressed(BTN.UP)) d = 2; else if (pressed(BTN.DOWN)) d = 3;
    if (d >= 0) doMove(d);
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
  function icon(c, r, kind, pal) {   // 3×3 磚圖示 + 2×2 屬性區塊（c, r 必為偶數）
    var j, name;
    for (j = 0; j < 9; j++) {
      if (kind === 0) name = 'E_' + j;
      else if (kind === -1) name = 'HOLE' + (((g.frames >> (g.holeT <= 3 ? 2 : 3)) & 1)) + '_' + j;
      else if (kind === -2) name = 'SP';
      else name = 'T' + kind + '_' + j;
      put(c + (j % 3), r + ((j / 3) | 0), A.t(name));
    }
    var bx = c >> 1, by = r >> 1;
    putA(bx, by, pal); putA(bx + 1, by, pal); putA(bx, by + 1, pal); putA(bx + 1, by + 1, pal);
  }
  function tierPal(kind) { return kind > 0 ? MG.TIERS[kind].pal : (kind === -1 ? HOLE_PAL : 0); }
  function frame(c0, r0, c1, r1) {
    var c, r;
    put(c0, r0, A.t('FR_TL')); put(c1, r0, A.t('FR_TR')); put(c0, r1, A.t('FR_BL')); put(c1, r1, A.t('FR_BR'));
    for (c = c0 + 1; c < c1; c++) { put(c, r0, A.t('FR_T')); put(c, r1, A.t('FR_B')); }
    for (r = r0 + 1; r < r1; r++) { put(c0, r, A.t('FR_L')); put(c1, r, A.t('FR_R')); }
  }
  function bigText(c, r, s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      for (var j = 0; j < 4; j++) put(c + i * 2 + (j & 1), r + (j >> 1), A.t('BIG_' + ch + j));
    }
  }
  function blankAll() { ntReset(); ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0); setPalettes(); }

  function drawTitleScreen() {
    blankAll();
    stars(11, 80, function (c, r) { return (r >= 1 && r <= 5 && c >= 6 && c <= 25) || (r >= 6 && r <= 12 && c >= 3 && c <= 27) || (r >= 13 && r <= 27 && c >= 2 && c <= 29); });
    text(12, 1, 'STARDUST');
    bigText(11, 3, 'MERGE');
    ppu0.fillAttr(0, 5, 1, 6, 2, 3);
    for (var k = 0; k < 12; k++) {
      var c = 4 + (k % 6) * 4, r = k < 6 ? 6 : 10;
      icon(c, r, k + 1, MG.TIERS[k + 1].pal);
      if ((k % 6) < 5) put(c + 3, r + 1, A.t('AX'));
    }
    text(4, 14, 'MODE');
    text(4, 16, 'BEST');
    text(4, 18, 'D-PAD SLIDE  B UNDO');
    text(4, 20, 'START PAUSE  C/$ = CHEAT');
    text(4, 22, 'HOLD START+SELECT: MENU');
    flush(ppu0, true);
    drawTitleValues();
    flush(ppu0, true);
  }
  function drawTitleValues() {
    var m = MODES[g.menu];
    put(10, 14, A.t('AL')); text(12, 14, pad(m.name, 11)); put(24, 14, A.t('AR'));
    var best = CT.load('merge', m.key, 0), bt = CT.load('merge', m.key + 'tier', 0);
    text(12, 16, num(Math.min(999999, best), 6) + '  ' + (bt ? pad(MG.TIERS[bt].key, 7) : '       '));
    text(4, 24, pad(m.hole ? 'HOLE EATS DUST  JUMPS/24' : '4X4 GOAL: MAKE A STAR', 26));
    text(11, 26, (g.blink >> 5) & 1 ? '          ' : 'PUSH START');
  }

  function L() { return LAYOUT[g.n]; }
  function drawPlayScreen() {
    blankAll();
    var lo = L(), n = g.n, ox = lo.ox, oy = lo.oy;
    stars(5 + n, 60, function (c, r) { return (c >= ox - 2 && c <= ox + 4 * n && r >= oy - 2 && r <= oy + 4 * n) || c >= lo.P - 1 || r <= 2; });
    text(2, 2, 'STAR MERGE');
    text(18, 2, pad(g.m.name, 11));
    frame(ox - 2, oy - 2, ox + 4 * n, oy + 4 * n);
    var P = lo.P;
    text(P, 4, 'SCORE'); text(P, 7, 'BEST'); text(P, 10, 'MOVES'); text(P, 13, 'TIME'); text(P, 16, 'TOP');
    renderPlay();
    flush(ppu0, true);
  }
  function center(s) { var lo = L(); return lo.ox + 2 * g.n - (s.length >> 1); }
  function renderPlay() {
    var lo = L(), n = g.n, ox = lo.ox, oy = lo.oy, P = lo.P, i;
    var rr, cc;   // 盤面區先清空（影子表：沒變的格不會真的寫），說明卡 / 暫停字留在間隔磚上也會被清掉
    for (rr = oy; rr < oy + 4 * n - 1; rr++) for (cc = ox; cc < ox + 4 * n - 1; cc++) put(cc, rr, 0);
    for (i = 0; i < n * n; i++) {
      var cx = ox + 4 * (i % n), cy = oy + 4 * ((i / n) | 0);
      if (g.intro) icon(cx, cy, i === (n >> 1) ? -1 : -2, i === (n >> 1) ? HOLE_PAL : 0);
      else if (g.paused) icon(cx, cy, -2, 0);
      else icon(cx, cy, g.cells[i], tierPal(g.cells[i]));
    }
    if (g.intro) {
      for (i = 0; i < INTRO.length; i++) if (INTRO[i]) text(center(INTRO[i]), oy + 4 + i, INTRO[i]);
      var ok = (g.frames >> 5) & 1 ? '          ' : 'A: GOT IT';
      text(center('A: GOT IT'), oy + 4 + INTRO.length + 1, ok);
    }
    if (g.paused) {
      var mid = oy + 2 * n - 2;
      text(center('PAUSE'), mid - 2, 'PAUSE');
      text(center('HOLD START+'), mid + 1, 'HOLD START+');
      text(center('SELECT:MENU'), mid + 3, 'SELECT:MENU');
    }
    text(P, 5, num(Math.min(999999, g.score), 6));
    text(P, 8, num(Math.min(999999, Math.max(g.best, g.score)), 6));
    text(P, 11, num(Math.min(99999, g.moves), 5));
    var sec = Math.floor(g.time / 60), mm = Math.min(99, Math.floor(sec / 60));
    text(P, 14, num(mm, 2) + ':' + num(sec % 60, 2));
    icon(P, 18, g.paused ? -2 : g.top, tierPal(g.top));
    text(P + 4, 19, pad(String(Math.pow(2, g.top)), 4));
    text(P, 21, pad(MG.TIERS[g.top].key, 7));
    // 訊息區（列 23..27）
    var lines = ['', '', '', '', ''];
    if (g.over) {
      var s = starsOf(g.top, g.m);
      lines = ['NO MOVES', '', 'A TITLE', 'B UNDO', '$ CONT'];
      for (i = 0; i < 3; i++) put(P + i * 2, 24, A.t(i < s ? 'SR1' : 'SR0'));
      for (i = 0; i < 3; i++) put(P + i * 2 + 1, 24, 0);
    } else {
      lines[0] = g.intro ? 'NEW!' : (g.msgT > 0 ? g.msg : '');
      lines[2] = 'B UNDO ' + (g.undo ? '1' : '-');
      if (g.m.hole) lines[4] = 'SHIFT ' + num(g.holeT, 2);
    }
    for (i = 0; i < 5; i++) { if (g.over && i === 1) continue; text(P, 23 + i, pad(lines[i], 31 - P + 1)); }
  }

  function drawSprites() {
    var slot = 0, i, lo, k;
    if (g.mode === 'play' && !g.paused && !g.intro) {
      lo = L();
      for (i = 0; i < g.fx.length && slot < 40; i++) {
        var f = g.fx[i], ix = f.idx;
        var x = (lo.ox + 4 * (ix % g.n)) * 8 + 8, y = (lo.oy + 4 * ((ix / g.n) | 0)) * 8 + 8;
        ppu0.sprite(slot++, { x: x, y: y, tile: A.s(f.t < 5 ? 'SPK1' : (f.t < 10 ? 'SPK2' : 'SPK0')), pal: f.t & 2 ? 0 : 2 });
      }
      if (g.pop) {
        var p = g.pop.idx;
        ppu0.sprite(slot++, { x: (lo.ox + 4 * (p % g.n)) * 8 + 8, y: (lo.oy + 4 * ((p / g.n) | 0)) * 8 + 8, tile: A.s('POP'), pal: 1 });
      }
      if (g.msgT > 0 && g.msg === 'IGNITED!') {
        for (k = 0; k < 2; k++) ppu0.sprite(slot++, { x: lo.P * 8 + (k ? 26 : -10), y: 18 * 8 + 8 + ((g.frames >> 2) & 3), tile: A.s('SPK1'), pal: 2 });
      }
    }
    for (i = slot; i < 48; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：expectimax 兩層 + 蛇形權重 ============================== */
  var SNAKE = {};
  function snakeW(n) {
    if (SNAKE[n]) return SNAKE[n];
    var w = new Array(n * n), p = 0, r, c;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      var cc = (r & 1) ? (n - 1 - c) : c;
      w[r * n + cc] = Math.pow(0.55, p++);
    }
    return (SNAKE[n] = w);
  }
  function evalBoard(cells, n) {
    var w = snakeW(n), s = 0, e = 0, mx = 0, i;
    for (i = 0; i < cells.length; i++) {
      var t = cells[i];
      if (t === 0) { e++; continue; }
      if (t < 0) continue;
      var v = Math.pow(2, t);
      if (v > mx) mx = v;
      s += v * w[i];
    }
    return s + e * mx * 0.08;
  }
  function bestAfter(cells, n) {
    var b = -1e18;
    for (var d = 0; d < 4; d++) { var r = slide(cells, n, d); if (r.moved) b = Math.max(b, evalBoard(r.cells, n)); }
    return b === -1e18 ? evalBoard(cells, n) - 1e9 : b;
  }
  function botChoose(cells, n) {
    var best = -1e30, pick = -1, d;
    for (d = 0; d < 4; d++) {
      var r = slide(cells, n, d);
      if (!r.moved) continue;
      var e = empties(r.cells), sum = 0;
      if (!e.length) sum = evalBoard(r.cells, n);
      else {
        for (var k = 0; k < e.length; k++) {
          var c1 = r.cells.slice(); c1[e[k]] = 1;
          var c2 = r.cells.slice(); c2[e[k]] = 2;
          sum += 0.9 * bestAfter(c1, n) + 0.1 * bestAfter(c2, n);
        }
        sum /= e.length;
      }
      if (sum > best) { best = sum; pick = d; }
    }
    return pick;
  }
  var DIR_BTN = [BTN.LEFT, BTN.RIGHT, BTN.UP, BTN.DOWN];
  function bot() {
    g.botT++;
    if (g.mode === 'title') {
      if (g.menu !== 0) return (g.botT & 7) === 0 ? BTN.LEFT : 0;
      return (g.botT & 15) === 0 ? BTN.START : 0;
    }
    if (g.paused) return (g.botT & 15) === 0 ? BTN.START : 0;
    if (g.over) return (!g.goal && (g.botT & 15) === 0) ? BTN.A : 0;
    if (pending() > 0) { g.botWait = 0; return 0; }
    if (++g.botWait < 5) return 0;
    g.botWait = 0;
    var d = botChoose(g.cells, g.n);
    return d >= 0 ? DIR_BTN[d] : 0;
  }

  /* ============================== 密技 ============================== */
  // 遊玩中：「星塵掃除」——盤上最低一階（通常是星塵）全部蒸發，騰出空槽；卡死畫面：原地續關（最低兩階蒸發、回到遊玩）。
  // 標題按密技無效；用過密技的那一局 goal() 一律 false。
  function sweep(levels) {
    var tiers = [], i, removed = 0;
    for (i = 0; i < g.cells.length; i++) { var t = g.cells[i]; if (t > 0 && t < g.top && tiers.indexOf(t) < 0) tiers.push(t); }
    tiers.sort(function (a, b) { return a - b; });
    tiers = tiers.slice(0, levels);
    for (i = 0; i < g.cells.length; i++) if (tiers.indexOf(g.cells[i]) >= 0) { g.cells[i] = 0; removed++; }
    if (!removed) {   // 全盤都是最高階：留一顆、其餘蒸發
      var keep = false;
      for (i = 0; i < g.cells.length; i++) if (g.cells[i] > 0) { if (keep) { g.cells[i] = 0; removed++; } keep = true; }
    }
    return removed;
  }
  function cheat() {
    if (!g || g.mode !== 'play') return false;
    g.cheats++; g.goal = false; g.undo = null;
    if (g.over) {
      sweep(2);
      g.over = false; g.paused = false;
      Au.stop(); Au.play('merge_play');
      g.msg = 'CONTINUE'; g.msgT = 90;
    } else {
      sweep(1);
      g.msg = 'SWEEP!'; g.msgT = 60;
    }
    sfx('merge_big');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'merge', order: 1, title: '星塵合星', legacy: ['2048.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = MG.Art.make(); Au = MG.Audio;
      NES.CHR.setPattern(0, 'merge_bg');
      NES.CHR.setPattern(1, 'merge_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10);
      if (mq >= 0 && mq < MODES.length) g.menu = mq;
      drawTitleScreen();
      Au.play('merge_title');
      if (q('autostart') === '1') startGame();
    },
    update: function (nes) {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else updatePlay();
      Au.tick();
    },
    draw: function (nes) {
      if (g.mode === 'title') drawTitleValues();
      else renderPlay();
      flush(ppu0, false);
      drawSprites();
    },
    exit: function (nes) { saveBest(); Au.stop(); },
    get backTile() { if (!A) A = MG.Art.make(); return { tile: A.s('DOT'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, gameMode: g.m.id, n: g.n, cells: g.cells.slice(), hole: g.hole, holeT: g.holeT,
        score: g.score, best: g.best, moves: g.moves, time: g.time, top: g.top, over: g.over, paused: g.paused,
        undoReady: !!g.undo, undos: g.undos, cheats: g.cheats, ignited: g.ignited, goal: g.goal, msg: g.msgT > 0 ? g.msg : '',
        swallowed: g.swallowed, merges: g.merges, menu: g.menu, intro: !!g.intro, seed: g.seed, stars: starsOf(g.top, g.m),
        music: Au.current, lastSfx: Au.lastSfx, queue: pending(), ntWrites: ntWrites, ntPeak: ntPeak, frames: g.frames
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    bestText: function () { return num(Math.min(999999, CT.load('merge', 'best', 0)), 6); }
  };

  // 測試鉤子（只讀寫本遊戲狀態）
  MG.dev = {
    start: function (mode, seed) { g.menu = mode || 0; if (seed) { var s0 = CT.query; CT.query = function (k) { return k === 'seed' ? String(seed) : (s0 ? s0(k) : null); }; startGame(); CT.query = s0; } else startGame(); },
    setCells: function (arr) { g.cells = arr.slice(); g.top = Math.max(1, topTier(g.cells)); g.over = false; for (var i = 0; i < arr.length; i++) if (arr[i] === -1) g.hole = i; },
    move: function (d) { return doMove(d); },
    checkOver: function () { if (!canMove(g.cells, g.n)) gameOver(); return g.over; },
    setTop: function (t) { g.top = t; },
    undo: function () { return doUndo(); },
    choose: function () { return botChoose(g.cells, g.n); },
    layout: function () { return LAYOUT[g.n]; },
    consts: { NT_LIMIT: NT_LIMIT, GOAL_TIER: GOAL_TIER, HOLE_EVERY: HOLE_EVERY, MAX_TIER: MAX_TIER, SWALLOW_PTS: SWALLOW_PTS },
    pending: pending,
    stars: function (top, mi) { return starsOf(top, MODES[mi || 0]); },
    flushAll: function () { CT.blank(nes0, function () { flush(ppu0, true); }); }
  };

  if (CT.register) CT.register(GAME);
  MG.GAME = GAME;
})();
