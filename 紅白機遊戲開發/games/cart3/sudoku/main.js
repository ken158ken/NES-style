/*
 * games/cart3/sudoku/main.js — 《星塵數獨 STAR SUDOKU》（合輯卡帶三槽 2，id = sudoku，全域 CT.Sudoku）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）｜ 依賴：engine/*、games/cart1/registry.js、sudoku/{gen,art,song}.js
 * 舊作概念：legacy sudoku.html / sudoku-game.html / sudoku-challenge.html（只取「難度、筆記、提示、錯誤上限、計時」；
 *           題目由 gen.js 現場產生並驗證唯一解，畫面 / 文案 / 配樂全原創）。
 *
 * 難度（5 級）：INTRO 6×6（宮 3×2）/ EASY / NORMAL / HARD / EXPERT（9×9）；題號 NO.n 每級各自遞增（`?seed=` 指定）。
 *   每題保證唯一解且**不必猜**（gen.js 的邏輯解題器解得完）；HARD 需要區塊排除、EXPERT 需要數對。
 * 操作：十字鍵一格一格移游標（按住：首延遲 12 幀、之後每 4 幀；邊緣繞回）；A = 打開選字列（← → 選、A 填、B 關），
 *       選字列最後兩格 = X 清除 / ? 提示（直接給這格的正解）；B = 筆記模式開關（筆記模式下 A 選的數字是「切換小點」，選字列不關）；
 *       SELECT（放開時，且期間沒按 START）= 復原一步；START = 暫停（盤面藏起來、計時停）。
 * 友善：填入數字自動擦掉同列 / 同欄 / 同宮的同數字筆記；同數字高亮；錯誤提示三段（OFF / ON 紅底 / STRICT 錯 3 次結束）；
 *       全部填完自動檢查；評價 ★ = 時間 / 提示 / 錯誤；最高紀錄 = 各級最短時間。
 * 畫面（brief R7 §1-2）：盤面、選字列、HUD 全在背景名稱表；一格 = 2×2 磚 = 1 屬性區塊（宮交錯底色 / 同數字高亮 / 錯誤紅底
 *   都是改屬性）；精靈只有游標四角（每線 2 顆）與解完的閃光。名稱表 + 屬性寫入走影子表 + 差異佇列（每幀 ≤ 140 byte）。
 * 網址：`cart3.html?game=sudoku&debug=1[&bot=1][&level=0..4][&seed=N][&check=0..2][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SU = CT.Sudoku = CT.Sudoku || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var NT_LIMIT = 140, REP_FIRST = 12, REP_NEXT = 4, UNDO_MAX = 300, STRICT_MISS = 3;
  var LV = ['intro', 'easy', 'normal', 'hard', 'expert'];
  var PAR = { intro: 180, easy: 480, normal: 720, hard: 1200, expert: 1800 };     // 3 星時間（秒）
  var CHECKS = ['OFF', 'ON', 'STRICT'];
  var LAYOUT = { 9: { ox: 2, oy: 4 }, 6: { ox: 6, oy: 6 } };
  var P = 22, PICK_ROW = 24;
  // fix-r7 P3-2：兩種宮底拉開亮度差（亮青 $1C ↔ 深藍 $02），同數字高亮改洋紅 $14（不再和藍宮混），錯誤維持暗紅 $06
  var PAL_BG = [[0x1C, 0x28, 0x30], [0x02, 0x28, 0x30], [0x14, 0x38, 0x30], [0x06, 0x38, 0x30]];
  var PAL_SPR = [[0x30, 0x38, 0x27], [0x28, 0x38, 0x30], [0x21, 0x31, 0x30], [0x16, 0x27, 0x38]];

  var A = null, Au = null, Gen = null;

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
  function mmss(sec) { sec = Math.max(0, Math.floor(sec)); return num(Math.min(99, Math.floor(sec / 60)), 2) + ':' + num(sec % 60, 2); }
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

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, blink: 0, row: 0, lvSel: 1, check: 1,
      level: 'easy', size: 9, puzzle: null, vals: [], given: [], notes: [], cx: 0, cy: 0,
      pick: false, pickSel: 0, noteMode: false, misses: 0, hints: 0, time: 0, paused: false,
      cleared: false, over: false, endT: 0, stars: 0, undo: [], cheats: 0, clears: {}, msg: '', msgT: 0,
      rep: { dir: 0, t: 0 }, selDown: false, selSpoiled: false, newBest: false,
      bot: { t: 0, plan: null }
    };
  }

  /* ============================== 盤面工具 ============================== */
  function N() { return g.size * g.size; }
  function geo() { return Gen.geo(g.size); }
  function idxOf(x, y) { return y * g.size + x; }
  function items() { return g.size + 2; }        // 1..size、X、?
  function boxPal(i) {
    var G = geo(), b = G.box[i], perRow = g.size / G.bw;
    return ((((b / perRow) | 0) + (b % perRow)) & 1);
  }
  function isWrong(i) { return g.vals[i] && !g.given[i] && g.vals[i] !== g.puzzle.solution[i]; }
  function countDigit(d) { var c = 0; for (var i = 0; i < N(); i++) if (g.vals[i] === d) c++; return c; }
  function filled() { for (var i = 0; i < N(); i++) if (!g.vals[i]) return false; return true; }
  function unitDone(i) {   // 剛填的格讓哪些單位完成（列 / 欄 / 宮各自 1..size 齊全）
    var G = geo(), us = G.unitsOf[i], done = 0;
    for (var k = 0; k < 3; k++) {
      var U = G.units[us[k]], ok = true;
      for (var j = 0; j < U.length; j++) if (!g.vals[U[j]] || g.vals[U[j]] !== g.puzzle.solution[U[j]]) { ok = false; break; }
      if (ok) done++;
    }
    return done;
  }

  /* ============================== 流程 ============================== */
  function sfx(n) { Au.sfx(n); }
  function startGame() {
    g.level = LV[g.lvSel];
    var L = SU.LEVELS[g.level];
    g.size = L.size;
    var seedQ = parseInt((CT.query && CT.query('seed')) || '', 10), seed;
    if (isFinite(seedQ) && seedQ > 0) seed = seedQ;
    else { seed = CT.load('sudoku', 'no_' + g.level, 0) + 1; CT.save('sudoku', 'no_' + g.level, seed); }
    g.puzzle = Gen.make(g.level, seed);
    g.vals = g.puzzle.givens.slice();
    g.given = g.puzzle.givens.map(function (v) { return v ? 1 : 0; });
    g.notes = new Array(N()).fill(0);
    g.cx = 0; g.cy = 0;
    for (var i = 0; i < N(); i++) if (!g.vals[i]) { g.cx = i % g.size; g.cy = (i / g.size) | 0; break; }
    g.pick = false; g.pickSel = 0; g.noteMode = false; g.misses = 0; g.hints = 0; g.time = 0; g.paused = false;
    g.cleared = false; g.over = false; g.endT = 0; g.stars = 0; g.undo = []; g.cheats = 0; g.msg = ''; g.msgT = 0; g.newBest = false;
    g.rep = { dir: 0, t: 0 }; g.selDown = false; g.selSpoiled = false;
    g.bot.plan = null;
    g.mode = 'play';
    CT.blank(nes0, function () { drawPlayScreen(); });
    Au.stop(); Au.play('sudoku_play');
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false;
    CT.blank(nes0, function () { drawTitleScreen(); });
    Au.stop(); Au.play('sudoku_title');
  }
  function pushUndo() {
    g.undo.push({ vals: g.vals.slice(), notes: g.notes.slice() });
    if (g.undo.length > UNDO_MAX) g.undo.shift();
  }
  function doUndo() {
    if (!g.undo.length) { sfx('sudoku_bump'); return false; }
    var u = g.undo.pop();
    g.vals = u.vals; g.notes = u.notes;
    g.msg = 'UNDO'; g.msgT = 40;
    sfx('sudoku_undo');
    return true;
  }
  function setValue(i, d) {
    if (g.given[i] || g.vals[i] === d) return false;
    pushUndo();
    g.vals[i] = d; g.notes[i] = 0;
    var G = geo(), bit = 1 << (d - 1);
    for (var k = 0; k < G.peers[i].length; k++) g.notes[G.peers[i][k]] &= ~bit;
    if (d !== g.puzzle.solution[i]) {
      g.misses++;
      if (g.check > 0) { sfx('sudoku_error'); g.msg = 'MISS!'; g.msgT = 50; }
      else sfx('sudoku_set');
      if (g.check === 2 && g.misses >= STRICT_MISS) { gameOver(); return true; }
    } else if (unitDone(i)) sfx('sudoku_unit');
    else sfx('sudoku_set');
    checkDone();
    return true;
  }
  function toggleNote(i, d) {
    if (g.given[i] || g.vals[i]) { sfx('sudoku_bump'); return false; }
    pushUndo();
    g.notes[i] ^= 1 << (d - 1);
    sfx('sudoku_note');
    return true;
  }
  function erase(i) {
    if (g.given[i] || (!g.vals[i] && !g.notes[i])) { sfx('sudoku_bump'); return false; }
    pushUndo();
    g.vals[i] = 0; g.notes[i] = 0;
    sfx('sudoku_erase');
    return true;
  }
  function hint(i) {
    if (g.given[i] || g.vals[i] === g.puzzle.solution[i]) { sfx('sudoku_bump'); return false; }
    pushUndo();
    var d = g.puzzle.solution[i], G = geo(), bit = 1 << (d - 1);
    g.vals[i] = d; g.notes[i] = 0; g.hints++;
    for (var k = 0; k < G.peers[i].length; k++) g.notes[G.peers[i][k]] &= ~bit;
    sfx('sudoku_hint');
    checkDone();
    return true;
  }
  function checkDone() {
    if (!filled()) return;
    for (var i = 0; i < N(); i++) if (g.vals[i] !== g.puzzle.solution[i]) { g.msg = 'NOT YET'; g.msgT = 90; return; }
    clearPuzzle();
  }
  function starsNow() {
    var sec = Math.floor(g.time / 60), s = 1;
    if (g.hints <= 1 && g.misses <= 2) s = 2;
    if (g.hints === 0 && g.misses === 0 && sec <= PAR[g.level]) s = 3;
    return s;
  }
  function clearPuzzle() {
    g.cleared = true; g.endT = 0; g.pick = false;
    g.stars = starsNow();
    var sec = Math.floor(g.time / 60);
    if (g.cheats === 0) {
      g.clears[g.level] = true;
      var best = CT.load('sudoku', 'time_' + g.level, 0);
      if (!best || sec < best) { CT.save('sudoku', 'time_' + g.level, Math.max(1, sec)); g.newBest = true; }
      if (g.stars > CT.load('sudoku', 'star_' + g.level, 0)) CT.save('sudoku', 'star_' + g.level, g.stars);
    }
    Au.stop(); Au.play('sudoku_clear');
  }
  function gameOver() {
    g.over = true; g.endT = 0; g.pick = false;
    Au.stop(); Au.play('sudoku_over');
  }

  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  // 游標連發：首延遲 REP_FIRST、之後每 REP_NEXT 幀；回傳本幀要走的方向遮罩（0 = 不走）
  function repeatDir() {
    var dirs = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT], k;
    for (k = 0; k < 4; k++) if (pressed(dirs[k])) { g.rep.dir = dirs[k]; g.rep.t = 0; return dirs[k]; }
    if (g.rep.dir && held(g.rep.dir)) {
      g.rep.t++;
      if (g.rep.t >= REP_FIRST && ((g.rep.t - REP_FIRST) % REP_NEXT) === 0) return g.rep.dir;
      return 0;
    }
    g.rep.dir = 0; g.rep.t = 0;
    return 0;
  }

  function updateTitle() {
    g.blink++;
    if (pressed(BTN.UP) || pressed(BTN.DOWN)) { g.row ^= 1; sfx('sudoku_menu'); }
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0);
    if (d) {
      if (g.row === 0) g.lvSel = (g.lvSel + d + LV.length) % LV.length;
      else g.check = (g.check + d + 3) % 3;
      sfx('sudoku_menu');
    }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('sudoku_ok'); startGame(); }
  }
  function updatePlay() {
    // SELECT 放開 = 復原（按著 SELECT 期間碰過 START ⇒ 那是回選單組合，不算）
    if (held(BTN.SELECT)) { if (!g.selDown) { g.selDown = true; g.selSpoiled = false; } if (held(BTN.START)) g.selSpoiled = true; }
    var selUp = false;
    if (g.selDown && !held(BTN.SELECT)) { selUp = !g.selSpoiled; g.selDown = false; }

    if (pressed(BTN.START) && !held(BTN.SELECT) && !g.cleared && !g.over) {
      g.paused = !g.paused;
      if (g.paused) Au.pause(); else if (!Au.resume()) Au.play('sudoku_play');
      sfx('sudoku_menu');
    }
    if (g.paused) return;
    if (g.msgT > 0) g.msgT--;
    if (g.cleared || g.over) {
      g.endT++;
      if (g.endT > 40 && (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT)))) toTitle();
      return;
    }
    g.time++;
    if (selUp) { doUndo(); return; }
    var i = idxOf(g.cx, g.cy), dir = repeatDir();
    if (g.pick) {
      if (dir === BTN.LEFT) { g.pickSel = (g.pickSel + items() - 1) % items(); sfx('sudoku_move'); }
      else if (dir === BTN.RIGHT) { g.pickSel = (g.pickSel + 1) % items(); sfx('sudoku_move'); }
      else if (dir === BTN.UP || dir === BTN.DOWN) { g.pick = false; }
      if (pressed(BTN.B)) { g.pick = false; sfx('sudoku_menu'); return; }
      if (pressed(BTN.A)) applyPick(i);
      return;
    }
    if (dir) {
      if (dir === BTN.LEFT) g.cx = (g.cx + g.size - 1) % g.size;
      if (dir === BTN.RIGHT) g.cx = (g.cx + 1) % g.size;
      if (dir === BTN.UP) g.cy = (g.cy + g.size - 1) % g.size;
      if (dir === BTN.DOWN) g.cy = (g.cy + 1) % g.size;
      sfx('sudoku_move');
    }
    if (pressed(BTN.B)) { g.noteMode = !g.noteMode; sfx('sudoku_note'); }
    if (pressed(BTN.A)) {
      i = idxOf(g.cx, g.cy);
      if (g.given[i]) { sfx('sudoku_bump'); return; }
      g.pick = true;
      if (g.vals[i]) g.pickSel = g.vals[i] - 1;
      sfx('sudoku_open');
    }
  }
  function applyPick(i) {
    var s = g.pickSel;
    if (s < g.size) {
      if (g.noteMode) { toggleNote(i, s + 1); return; }     // 筆記模式：選字列不關，可連續切換
      setValue(i, s + 1);
    } else if (s === g.size) erase(i);
    else hint(i);
    g.pick = false;
  }

  /* ============================== 畫面 ============================== */
  function setPalettes() {
    ppu0.setBackdrop(0x0F);
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  function blankAll() { ntReset(); ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0); setPalettes(); }
  function stars(seed, count, avoid) {
    var s = seed, i;
    for (i = 0; i < count; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (avoid && avoid(c, r)) continue;
      put(c, r, A.t((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
  }
  function frame(c0, r0, c1, r1) {
    var c, r;
    put(c0, r0, A.t('FR_TL')); put(c1, r0, A.t('FR_TR')); put(c0, r1, A.t('FR_BL')); put(c1, r1, A.t('FR_BR'));
    for (c = c0 + 1; c < c1; c++) { put(c, r0, A.t('FR_T')); put(c, r1, A.t('FR_B')); }
    for (r = r0 + 1; r < r1; r++) { put(c0, r, A.t('FR_L')); put(c1, r, A.t('FR_R')); }
  }
  function cell(c, r, tiles, pal) {
    put(c, r, tiles[0]); put(c + 1, r, tiles[1]); put(c, r + 1, tiles[2]); put(c + 1, r + 1, tiles[3]);
    putA(c >> 1, r >> 1, pal);
  }
  function bigText(c, r, s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      for (var j = 0; j < 4; j++) put(c + i * 2 + (j & 1), r + (j >> 1), A.t('BIG_' + ch + j));
    }
  }

  function drawTitleScreen() {
    blankAll();
    stars(23, 80, function (c, r) { return (r >= 1 && r <= 8 && c >= 5 && c <= 26) || (r >= 9 && r <= 27 && c >= 1 && c <= 30); });
    text(12, 1, 'STARDUST');
    bigText(10, 3, 'SUDOKU');
    ppu0.fillAttr(0, 5, 1, 7, 2, 2);
    for (var d = 1; d <= 9; d++) cell(6 + (d - 1) * 2, 6, A.cellTiles(d, d % 3 !== 0, 0), (((d - 1) / 3) | 0) & 1);
    text(4, 10, 'LEVEL');
    text(4, 12, 'CHECK');
    text(4, 14, 'BEST');
    text(3, 16, 'A PICK  B NOTE  SELECT UNDO');
    text(3, 18, 'START PAUSE  C/$ = CHEAT');
    text(3, 20, 'HOLD START+SELECT: MENU');
    text(3, 22, 'UNIQUE ANSWER  NO GUESSING');
    flush(ppu0, true);
    drawTitleValues();
    flush(ppu0, true);
  }
  function drawTitleValues() {
    var lv = LV[g.lvSel];
    put(2, 10, g.row === 0 ? A.t('AR') : 0); put(2, 12, g.row === 1 ? A.t('AR') : 0);
    put(11, 10, A.t('AL')); text(13, 10, pad(SU.LEVELS[lv].label, 9)); put(23, 10, A.t('AR'));
    put(11, 12, A.t('AL')); text(13, 12, pad(CHECKS[g.check], 9)); put(23, 12, A.t('AR'));
    var t = CT.load('sudoku', 'time_' + lv, 0), st = CT.load('sudoku', 'star_' + lv, 0);
    text(13, 14, t ? mmss(t) : '--:--');
    for (var k = 0; k < 3; k++) put(20 + k, 14, A.t(k < st ? 'SR1' : 'SR0'));
    text(3, 23, '                          ');
    text(11, 25, (g.blink >> 5) & 1 ? '          ' : 'PUSH START');
  }

  function drawPlayScreen() {
    blankAll();
    var lo = LAYOUT[g.size], w = g.size * 2;
    stars(31 + g.size, 50, function (c, r) { return (c >= lo.ox - 1 && c <= lo.ox + w && r >= lo.oy - 1 && r <= lo.oy + w) || c >= P - 1 || r >= PICK_ROW - 1 || r <= 2; });
    text(2, 2, 'STAR SUDOKU');
    frame(lo.ox - 1, lo.oy - 1, lo.ox + w, lo.oy + w);
    text(P, 3, 'LEVEL'); text(P, 6, 'TIME'); text(P, 9, 'MISS'); text(P, 12, 'HINT'); text(P, 15, 'NOTE');
    text(P, 21, 'NO.');
    renderPlay();
    flush(ppu0, true);
  }
  function renderPlay() {
    var lo = LAYOUT[g.size], n = g.size, i, cur = idxOf(g.cx, g.cy), cv = g.vals[cur];
    var hide = g.paused;
    for (i = 0; i < n * n; i++) {
      var x = i % n, y = (i / n) | 0, pal = boxPal(i), v = g.vals[i];
      if (!hide) {
        if (g.check > 0 && isWrong(i)) pal = 3;
        else if (cv && v === cv) pal = 2;
      }
      cell(lo.ox + 2 * x, lo.oy + 2 * y, hide ? A.cellTiles(0, 0, 0) : A.cellTiles(v, g.given[i], v ? 0 : g.notes[i]), pal);
    }
    // 選字列
    var it = items(), pickPal;
    for (i = 0; i < 11; i++) {
      var c = 2 + 2 * i;
      if (i >= it) { cell(c, PICK_ROW, [0, 0, 0, 0], 0); put(c, PICK_ROW + 2, 0); continue; }
      var tiles = i < n ? A.cellTiles(i + 1, false, 0) : (i === n ? [A.t('PX_0'), A.t('PX_1'), A.t('PX_2'), A.t('PX_3')] : [A.t('PQ_0'), A.t('PQ_1'), A.t('PQ_2'), A.t('PQ_3')]);
      pickPal = (g.pick && g.pickSel === i) ? 2 : 0;
      if (hide) tiles = A.cellTiles(0, 0, 0);
      cell(c, PICK_ROW, tiles, pickPal);
      var left = i < n ? n - countDigit(i + 1) : -1;
      put(c, PICK_ROW + 2, i < n ? (left > 0 ? A.ch(String(Math.min(9, left))) : A.ch('-')) : 0);
    }
    var help = g.pick ? (g.noteMode ? 'A MEMO  B CLOSE' : 'A SET  B CLOSE') : (g.noteMode ? 'A MEMO  B NOTE OFF' : 'A PICK  B NOTE');
    text(2, 28, pad(help, 20));
    // HUD
    text(P, 4, pad(SU.LEVELS[g.level].label, 10));
    text(P, 7, mmss(g.time / 60));
    text(P, 10, pad(g.check === 0 ? '--' : (g.check === 2 ? g.misses + '/' + STRICT_MISS : String(Math.min(99, g.misses))), 6));
    text(P, 13, pad(String(Math.min(99, g.hints)), 3));
    text(P + 5, 15, g.noteMode ? 'ON ' : 'OFF');
    var nt = (!hide && !cv) ? g.notes[cur] : 0;
    for (var k = 0; k < 9; k++) {
      var on = k < n && (nt & (1 << k));
      put(P + 2 + (k % 3) * 2, 17 + ((k / 3) | 0), on ? A.ch(String(k + 1)) : (k < n ? A.ch('.') : 0));
    }
    text(P + 3, 21, num(g.puzzle.seed % 100000, 5));
    // 訊息區（列 23..）：右側
    var m0 = '', m1 = '', m2 = '';
    if (g.paused) { m0 = 'PAUSE'; m1 = 'HOLD STA+'; m2 = 'SEL:MENU'; }
    else if (g.cleared) { m0 = 'CLEAR!'; m1 = g.newBest ? 'NEW BEST' : ''; m2 = 'A TITLE'; }
    else if (g.over) { m0 = 'GAME OVER'; m1 = '$ CONT'; m2 = 'A TITLE'; }
    else if (g.msgT > 0) m0 = g.msg;
    text(24, 24, pad(m0, 8)); text(24, 26, pad(m1, 8)); text(24, 27, pad(m2, 8));
    for (k = 0; k < 3; k++) put(24 + k * 2, 25, g.cleared ? A.t(k < g.stars ? 'SR1' : 'SR0') : 0);
  }

  function drawSprites() {
    var slot = 0, i;
    if (g.mode === 'play' && !g.paused && !g.over) {
      var lo = LAYOUT[g.size];
      if (!g.cleared) {
        var x = (lo.ox + 2 * g.cx) * 8, y = (lo.oy + 2 * g.cy) * 8, pal = g.noteMode ? 1 : 0;
        if (!g.pick && ((g.frames >> 4) & 1) && g.rep.dir === 0) pal = g.noteMode ? 1 : 2;
        ppu0.sprite(slot++, { x: x - 2, y: y - 2, tile: A.s('CTL'), pal: pal });
        ppu0.sprite(slot++, { x: x + 10, y: y - 2, tile: A.s('CTR'), pal: pal });
        ppu0.sprite(slot++, { x: x - 2, y: y + 10, tile: A.s('CBL'), pal: pal });
        ppu0.sprite(slot++, { x: x + 10, y: y + 10, tile: A.s('CBR'), pal: pal });
      } else if (g.endT < 120) {
        // 解完：沿盤面對角線散出閃光（每線 ≤ 2）
        var t = g.endT, w = g.size * 16;
        for (i = 0; i < 4; i++) {
          var p = ((t * 3 + i * w / 4) % w) | 0;
          ppu0.sprite(slot++, { x: lo.ox * 8 + p - 4, y: lo.oy * 8 + p - 4, tile: A.s(t & 4 ? 'SPK1' : 'SPK0'), pal: 1 });
          ppu0.sprite(slot++, { x: lo.ox * 8 + w - p - 4, y: lo.oy * 8 + p - 4, tile: A.s(t & 4 ? 'SPK0' : 'SPK1'), pal: 2 });
        }
      }
    }
    for (i = slot; i < 16; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：解題器找下一步，游標一格一格走過去填 ============================== */
  function wrapStep(from, to, n) { var d = (to - from + n) % n; if (!d) return 0; return d <= n / 2 ? 1 : -1; }
  function bot() {
    var b = g.bot;
    b.t++;
    if (b.t & 1) return 0;                         // 放開一幀，下一幀才是新的「按下」邊緣
    if (g.mode === 'title') {
      var want = g.clears.intro ? 1 : 0;
      if (g.row !== 0) return BTN.UP;
      if (g.lvSel !== want) return wrapStep(g.lvSel, want, LV.length) > 0 ? BTN.RIGHT : BTN.LEFT;
      return (b.t & 15) === 0 ? BTN.START : 0;
    }
    if (g.paused) return BTN.START;
    if (g.cleared || g.over) return (g.endT > 60 && (b.t & 15) === 0 && !(g.clears.intro && g.clears.easy)) ? BTN.A : 0;
    if (g.noteMode && !g.pick) return BTN.B;
    if (!b.plan || g.vals[b.plan.idx]) b.plan = Gen.next(g.vals, g.size);
    var p = b.plan;
    if (!p) return 0;
    var tx = p.idx % g.size, ty = (p.idx / g.size) | 0;
    if (!g.pick) {
      var sx = wrapStep(g.cx, tx, g.size), sy = wrapStep(g.cy, ty, g.size);
      if (sx) return sx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (sy) return sy > 0 ? BTN.DOWN : BTN.UP;
      return BTN.A;
    }
    var want2 = p.val - 1, sd = wrapStep(g.pickSel, want2, items());
    if (sd) return sd > 0 ? BTN.RIGHT : BTN.LEFT;
    return BTN.A;
  }

  /* ============================== 密技 ============================== */
  // 遊玩中：「星光指引」——錯的格全部擦掉，再隨機揭開 3 個空格的正解；STRICT 結束畫面：原地續關（錯誤歸零、錯格擦掉）。
  // 標題 / 解完畫面無效；用過密技的那一題不算進 goal 與最佳紀錄。
  function cheat() {
    if (!g || g.mode !== 'play' || g.cleared) return false;
    g.cheats++;
    var i, empty = [];
    for (i = 0; i < N(); i++) if (isWrong(i)) g.vals[i] = 0;
    if (g.over) {
      g.over = false; g.misses = 0; g.endT = 0;
      Au.stop(); Au.play('sudoku_play');
      g.msg = 'CONTINUE'; g.msgT = 90;
      sfx('sudoku_hint');
      return true;
    }
    for (i = 0; i < N(); i++) if (!g.vals[i]) empty.push(i);
    for (var k = 0; k < 3 && empty.length; k++) {
      var j = (g.frames * 7 + k * 13) % empty.length, at = empty.splice(j, 1)[0];
      g.vals[at] = g.puzzle.solution[at]; g.notes[at] = 0;
    }
    g.undo = [];
    g.msg = 'STARLIGHT'; g.msgT = 60;
    sfx('sudoku_hint');
    checkDone();
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'sudoku', order: 2, title: '星塵數獨', legacy: ['sudoku.html', 'sudoku-game.html', 'sudoku-challenge.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = SU.Art.make(); Au = SU.Audio; Gen = SU.Gen;
      NES.CHR.setPattern(0, 'sudoku_bg');
      NES.CHR.setPattern(1, 'sudoku_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var lq = parseInt(q('level') || '', 10);
      if (lq >= 0 && lq < LV.length) g.lvSel = lq;
      var cq = parseInt(q('check') || '', 10);
      if (cq >= 0 && cq <= 2) g.check = cq;
      drawTitleScreen();
      Au.play('sudoku_title');
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
    exit: function (nes) { Au.stop(); },     // 紀錄 = 解完時間，解完當下就存了（中途離開沒有「目前成績」可存）
    get backTile() { if (!A) A = SU.Art.make(); return { tile: A.s('DOT'), pal: 1 }; },
    state: function () {
      if (!g) return null;
      var empty = 0, wrong = 0;
      for (var i = 0; i < g.vals.length; i++) { if (!g.vals[i]) empty++; else if (g.puzzle && isWrong(i)) wrong++; }
      return {
        mode: g.mode, level: g.level, lvSel: g.lvSel, check: g.check, row: g.row, size: g.size,
        seed: g.puzzle ? g.puzzle.seed : 0, tier: g.puzzle ? g.puzzle.tier : 0, clues: g.puzzle ? g.puzzle.clues : 0,
        cx: g.cx, cy: g.cy, pick: g.pick, pickSel: g.pickSel, noteMode: g.noteMode,
        vals: g.vals.slice(), notes: g.notes.slice(), empty: empty, wrong: wrong,
        misses: g.misses, hints: g.hints, time: g.time, paused: g.paused, cleared: g.cleared, over: g.over, stars: g.stars,
        undo: g.undo.length, cheats: g.cheats, clears: Object.keys(g.clears), msg: g.msgT > 0 ? g.msg : '', goal: GAME.goal(),
        music: Au.current, lastSfx: Au.lastSfx, queue: pending(), ntWrites: ntWrites, ntPeak: ntPeak, frames: g.frames,
        rep: g.rep.dir, plan: g.bot.plan
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.clears.intro && g.clears.easy); },
    // 選單：EASY 最佳時間，右對齊 6 字元（` 03:25`；沒紀錄 = ` --:--`）
    bestText: function () { var t = CT.load('sudoku', 'time_easy', 0); return ' ' + (t ? mmss(t) : '--:--'); }
  };

  SU.dev = {
    start: function (lv, seed, check) {
      g.lvSel = lv; if (check !== undefined) g.check = check;
      var s0 = CT.query;
      CT.query = function (k) { return k === 'seed' ? (seed ? String(seed) : null) : (s0 ? s0(k) : null); };
      try { startGame(); } finally { CT.query = s0; }
    },
    solution: function () { return g.puzzle.solution.slice(); },
    givens: function () { return g.puzzle.givens.slice(); },
    setCursor: function (x, y) { g.cx = x; g.cy = y; },
    fillAllBut: function (k) {   // 測試用：照正解填到只剩 k 格
      var e = [];
      for (var i = 0; i < N(); i++) if (!g.vals[i]) e.push(i);
      for (var j = 0; j < e.length - k; j++) g.vals[e[j]] = g.puzzle.solution[e[j]];
      return e.slice(e.length - k);
    },
    consts: { NT_LIMIT: NT_LIMIT, REP_FIRST: REP_FIRST, REP_NEXT: REP_NEXT, STRICT_MISS: STRICT_MISS, PAR: PAR, LAYOUT: LAYOUT, PICK_ROW: PICK_ROW, P: P },
    pending: pending,
    starsFor: function (time, hints, misses, level) { var s = [g.time, g.hints, g.misses, g.level]; g.time = time * 60; g.hints = hints; g.misses = misses; g.level = level; var r = starsNow(); g.time = s[0]; g.hints = s[1]; g.misses = s[2]; g.level = s[3]; return r; }
  };

  if (CT.register) CT.register(GAME);
  SU.GAME = GAME;
})();
