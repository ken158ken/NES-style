/*
 * games/cart3/slide/main.js — 《星塵拼圖 STAR SLIDE》（合輯卡帶三 槽 5，id = slide）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：slide/pics.js、slide/solver.js、slide/art.js、slide/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：sliding-puzzle（3×3 / 4×4 / 5×5 推盤）、jigsaw-puzzle + puzzle（拼圖）⇒ 3 種模式：
 *   SLIDE  滑塊：3×3 / 4×4 / 5×5，缺右下一片；A 推游標那片（同列 / 同行可一次推一整排）；打亂 = 亂數排列 + 奇偶修正 ⇒ 必可解。
 *   SWAP   換位：所有片都在、位置打亂；A 選一片、再 A 另一片 ⇒ 兩片交換（標準 = 最少交換次數）。
 *   ROTATE 旋轉：游標是 2×2 窗格；A 順時針、B 逆時針轉四片（3×3 / 4×4；打亂 = 隨機轉）。
 *     ※ 紅白機背景磁磚不能旋轉（要轉就得多放 3 倍 CHR），所以「旋轉拼圖」做成轉「位置」的 2×2 環轉，而不是轉單片的圖。
 * 圖面：6 張原創像素畫（pics.js），每張一個 CHR bank；一片 = 32×32 px = 4×4 磁磚 = 2×2 屬性區（屬性跟著片走）。
 *   盤面全走背景名稱表 + 差異佇列（每幀 ≤ 140 byte）；滑動動畫 = 先畫半格（16 px，仍對齊屬性）再畫到位。
 * 友善版：SELECT（放開時）= 復原；B 點一下 = 提示（解題器的下一步，游標跳過去閃光；ROTATE 的 B 是逆轉，提示改 SELECT 長按）；
 *   B 長按 20 幀 = 偷看完成圖。評價：步數 ≤ 標準且沒用提示 ★★★、≤ 2 倍 ★★、其餘 ★；紀錄：各模式 × 尺寸最佳時間 / 步數 + 每張圖最佳星數。
 * 密技（C / ★）：遊玩中 = 解題器立刻代走 10 步（本次開機之後 goal 一律 false）；標題 / 說明 / 完成畫面無效。沒有失敗狀態 ⇒ 不適用 §6-1 續關。
 * goal = 不開密技把 SLIDE 3×3 與 4×4 各拼好 1 次。機器人：解題器（分段 BFS）的解，一步一步移動游標 + A 推。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SL = CT.Slide = CT.Slide || {};
  var AU = SL.Audio, SV = SL.Solve;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var FLUSH_LIMIT = 140, REP_DELAY = 12, REP_RATE = 4, PEEK_HOLD = 20, HINT_HOLD = 30, ANIM_HALF = 3, ANIM_FULL = 2;
  var MODES = [
    { key: 'SLIDE', sizes: [3, 4, 5] },
    { key: 'SWAP', sizes: [3, 4, 5] },
    { key: 'ROTATE', sizes: [3, 4] }
  ];
  var ROT_SCRAMBLE = { 3: 8, 4: 14 };
  var SPR_PAL = [[0x30, 0x28, 0x30], [0x28, 0x27, 0x38], [0x2C, 0x21, 0x30], [0x16, 0x27, 0x30]];
  var DX = { U: 0, R: 1, D: 0, L: -1 }, DY = { U: -1, R: 0, D: 1, L: 0 };
  var DORDER = ['U', 'R', 'D', 'L'];
  var DBTN = { U: BTN.UP, R: BTN.RIGHT, D: BTN.DOWN, L: BTN.LEFT };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, row: 0, m: 0, sizeI: 0, pic: 0, paused: false, cheatReq: false, cheatUsed: false, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      rep: { U: 0, R: 0, D: 0, L: 0 }, bHold: 0, selHold: 0, selTaint: false, selHeld: false, peek: false,
      n: 3, arr: null, cr: 0, cc: 0, pickPos: -1, moves: 0, time: 0, par: 0, hints: 0, undo: [], anim: null, pending: [],
      done: false, stars: 0, doneT: 0, seedBase: 0, runs: 0, goalDone: {}, spark: 0, sparkPos: -1, bot: { q: [] }, picLoaded: -1
    };
  }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function mmss(f) { var s = Math.floor(f / 60); return pad(Math.min(99, Math.floor(s / 60)), 2) + ':' + pad(s % 60, 2); }
  function modeKey() { return MODES[g.m].key; }
  function sizeOf() { return MODES[g.m].sizes[Math.min(g.sizeI, MODES[g.m].sizes.length - 1)]; }

  /* ---------------- 名稱表影子 + 差異佇列 ---------------- */
  function put(c, r, t) { if (c < 0 || c > 31 || r < 0 || r > 29) return; var k = r * 32 + c; if (g.want[k] === t) return; g.want[k] = t; g.q.push(k); }
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
  // 換圖 = 換 CHR bank + 背景調色盤（關畫面整片重畫，不計 VBlank）
  function loadPic(i) {
    var B = SL.Art.pic(i), ppu = nes0.ppu;
    NES.CHR.setPattern(0, B.name);
    for (var k = 0; k < 4; k++) ppu.setBgPalette(k, B.pic.pal[k]);
    g.picLoaded = i; g.B = B;
  }
  function redraw(fn) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      if (g.picLoaded !== g.pic) loadPic(g.pic);
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
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

  /* ---------------- 片 / 盤面繪製 ---------------- */
  function off() { return (20 - 4 * g.n) >> 1; }        // 圖面磁磚偏移（3×3 = 中央 96 px、4×4 = 128 px、5×5 = 全 160 px）
  function ox() { return 2 + off(); }
  function oy() { return 4 + off(); }
  function drawPiece(piece, tx, ty, n, o) {
    var P = g.B.pic, base = g.B.base, hr = Math.floor(piece / n), hc = piece % n;
    for (var dy = 0; dy < 4; dy++) for (var dx = 0; dx < 4; dx++) put(tx + dx, ty + dy, base + P.map[o + hr * 4 + dy][o + hc * 4 + dx]);
    for (var sy = 0; sy < 2; sy++) for (var sx = 0; sx < 2; sx++) putA((tx >> 1) + sx, (ty >> 1) + sy, P.blockPal[((o + hr * 4) >> 1) + sy][((o + hc * 4) >> 1) + sx]);
  }
  function drawSlot(tx, ty) {
    var s = art.t('SLOT');
    for (var dy = 0; dy < 4; dy++) for (var dx = 0; dx < 4; dx++) put(tx + dx, ty + dy, s);
    for (var sy = 0; sy < 2; sy++) for (var sx = 0; sx < 2; sx++) putA((tx >> 1) + sx, (ty >> 1) + sy, 0);
  }
  function blankId() { return modeKey() === 'SLIDE' ? g.n * g.n - 1 : -1; }
  function posXY(p) { return [ox() + (p % g.n) * 4, oy() + Math.floor(p / g.n) * 4]; }
  function drawCell(p) {
    var xy = posXY(p), v = g.arr[p];
    if (v === blankId() && !g.done) drawSlot(xy[0], xy[1]);
    else drawPiece(v, xy[0], xy[1], g.n, off());
  }
  function drawBoard() { for (var p = 0; p < g.n * g.n; p++) drawCell(p); }
  function drawSolved() { for (var p = 0; p < g.n * g.n; p++) { var xy = posXY(p); drawPiece(p, xy[0], xy[1], g.n, off()); } }
  function drawFrame(x0, y0, w, h) {
    var c, r, x1 = x0 + w, y1 = y0 + h;
    for (c = x0; c < x1; c++) { put(c, y0 - 1, art.t('FH')); put(c, y1, art.t('FH')); }
    for (r = y0; r < y1; r++) { put(x0 - 1, r, art.t('FV')); put(x1, r, art.t('FV')); }
    put(x0 - 1, y0 - 1, art.t('FC')); put(x1, y0 - 1, art.t('FC')); put(x0 - 1, y1, art.t('FC')); put(x1, y1, art.t('FC'));
  }

  /* ---------------- 紀錄 ---------------- */
  function recKey() { return modeKey().toLowerCase() + g.n; }
  function bestRec(k) { return CT.load('slide', 'rec_' + k, null); }
  function picStars(i) { var s = CT.load('slide', 'stars', []) || []; return s[i] | 0; }

  /* ---------------- 標題 ---------------- */
  var ROWS = [5, 9, 13];
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false; g.peek = false; g.done = false;
    var o = 0;
    redraw(function () {
      center(1, '$ STAR SLIDE $');
      g.n = 5; drawFrame(2, 4, 20, 20);
      for (var p = 0; p < 25; p++) { var xy = [2 + (p % 5) * 4, 4 + Math.floor(p / 5) * 4]; drawPiece(p, xy[0], xy[1], 5, o); }
      titlePanel();
      text(2, 25, 'A/START PLAY  B RULES');
      text(2, 27, 'HOLD START+SELECT: MENU');
      text(25, 25, 'C/$ =');
      text(25, 27, 'CHEAT');
    });
    AU.play('slide_title');
  }
  function titlePanel() {
    var mk = modeKey(), n = sizeOf(), rec = bestRec(mk.toLowerCase() + n);
    text(23, ROWS[0], 'MODE'); text(23, ROWS[0] + 1, padR(mk, 8));
    text(23, ROWS[1], 'SIZE'); text(23, ROWS[1] + 1, padR(n + 'X' + n, 8));
    text(23, ROWS[2], 'PICTURE'); text(23, ROWS[2] + 1, padR((g.pic + 1) + '/' + SL.Pics.count + ' ' + '$$$'.substring(0, picStars(g.pic)), 8));
    text(23, ROWS[2] + 2, padR(SL.Pics.PICS[g.pic].short, 9));
    text(23, 18, 'BEST');
    text(23, 19, padR(rec ? mmss(rec.time) : '--:--', 8));
    text(23, 20, padR(rec ? pad(rec.moves, 4) + 'MV' : '', 8));
  }
  function enterRules() {
    g.mode = 'rules'; g.t = 0;
    redraw(function () {
      center(2, 'HOW TO PLAY');
      var L = ['SLIDE: A PUSHES THE PIECE', '  (A WHOLE ROW IF IN LINE)', 'SWAP: A PICK, A SWAP',
               'ROTATE: A TURN RIGHT', '  B TURN LEFT  (2X2 FRAME)', 'B TAP: HINT   HOLD B: PEEK',
               'ROTATE HINT: HOLD SELECT', 'SELECT: UNDO  START: PAUSE', 'FEWER MOVES = MORE STARS'];
      for (var i = 0; i < L.length; i++) text(3, 5 + i * 2, L[i]);
      center(25, 'HOLD START+SELECT: MENU');
      center(27, 'PUSH START');
    });
  }

  /* ---------------- 開局 ---------------- */
  function startGame() {
    var mk = modeKey(), n = sizeOf();
    g.n = n; g.runs++;
    var qs = CT.query ? CT.query('seed') : null;
    var seed = ((qs ? (parseInt(qs, 10) >>> 0) : 0x5EED) + g.runs * 7919 + n * 131 + g.m * 17) >>> 0;
    if (qs && g.runs === 1) seed = parseInt(qs, 10) >>> 0;
    g.seed = seed;
    if (mk === 'SLIDE') { g.arr = SV.scrambleSlide(n, seed); g.par = SV.slide(g.arr, n).length; }
    else if (mk === 'SWAP') { g.arr = SV.scrambleSwap(n, seed); g.par = SV.swapPar(g.arr); }
    else { var r = SV.scrambleRotate(n, seed, ROT_SCRAMBLE[n]); g.arr = r.arr; g.par = Math.min(r.moves.length, SV.rotateSolve(g.arr, n).length); }
    g.start = g.arr.slice();
    g.cr = 0; g.cc = 0; g.pickPos = -1; g.moves = 0; g.time = 0; g.hints = 0; g.undo = []; g.anim = null; g.pending = [];
    g.done = false; g.stars = 0; g.peek = false; g.paused = false; g.msg = ''; g.msgT = 0; g.levelCheat = false; g.bot.q = [];
    if (mk === 'SLIDE') { var b = g.arr.indexOf(n * n - 1); g.cr = Math.floor(b / n); g.cc = b % n; }
    g.mode = 'play';
    redraw(function () {
      center(1, 'STAR SLIDE  ' + SL.Pics.PICS[g.pic].name);
      drawFrame(ox(), oy(), 4 * n, 4 * n);
      drawBoard();
      panel();
      ctrlLine();
    });
    AU.play('slide_play');
  }
  function ctrlLine() {
    var mk = modeKey();
    text(1, 27, padR(mk === 'SLIDE' ? 'A PUSH  B HINT  SELECT UNDO' : (mk === 'SWAP' ? 'A PICK/SWAP  B HINT  SEL UNDO' : 'A RIGHT B LEFT  SELECT UNDO'), 30));
  }
  function panel() {
    text(23, 4, padR(modeKey(), 8)); text(23, 5, padR(g.n + 'X' + g.n, 8));
    text(23, 7, 'MOVES'); text(23, 8, pad(Math.min(9999, g.moves), 4));
    text(23, 10, 'TIME'); text(23, 11, mmss(g.time));
    text(23, 13, 'PAR'); text(23, 14, pad(g.par, 4));
    text(23, 16, 'HINTS'); text(23, 17, pad(g.hints, 2));
    if (g.cheatUsed) text(30, 17, '$');
  }

  /* ---------------- 操作 ---------------- */
  function snapshot() { g.undo.push({ arr: g.arr.slice(), moves: g.moves }); if (g.undo.length > 300) g.undo.shift(); }
  function doUndo() {
    if (g.anim || g.pending.length) return;
    if (!g.undo.length) { AU.sfx('slide_bump'); say('NOTHING TO UNDO', 30); return; }
    var s = g.undo.pop();
    g.arr = s.arr; g.moves = s.moves; g.pickPos = -1;
    drawBoard(); AU.sfx('slide_undo'); say('UNDO', 20);
  }
  // 滑塊：推游標那片（同列 / 同行 ⇒ 一排依序推）
  function pushAt(p) {
    var n = g.n, b = g.arr.indexOf(n * n - 1);
    var pr = Math.floor(p / n), pc = p % n, br = Math.floor(b / n), bc = b % n;
    if (p === b || (pr !== br && pc !== bc)) { AU.sfx('slide_bump'); say('NOT IN LINE WITH THE GAP', 30); return; }
    snapshot();
    var step = pr === br ? (pc > bc ? 1 : -1) : (pr > br ? n : -n);
    for (var q = b + step; ; q += step) { g.pending.push(q); if (q === p) break; }
  }
  function startAnim() {
    if (g.anim || !g.pending.length) return;
    var m = g.pending.shift(), n = g.n, b = g.arr.indexOf(n * n - 1);
    var piece = g.arr[m], a = posXY(m), bb = posXY(b);
    drawSlot(a[0], a[1]); drawSlot(bb[0], bb[1]);
    drawPiece(piece, (a[0] + bb[0]) >> 1, (a[1] + bb[1]) >> 1, n, off());
    SV.slideMove(g.arr, n, m); g.moves++;
    g.anim = { t: 0, from: m, to: b };
    AU.sfx('slide_slide');
  }
  function stepAnim() {
    var A = g.anim;
    if (!A) return;
    A.t++;
    if (A.t === ANIM_HALF) { drawCell(A.from); drawCell(A.to); }
    if (A.t >= ANIM_HALF + ANIM_FULL) { g.anim = null; checkDone(); }
  }
  function swapAt(p) {
    if (g.pickPos < 0) { g.pickPos = p; AU.sfx('slide_pick'); return; }
    if (g.pickPos === p) { g.pickPos = -1; AU.sfx('slide_bump'); return; }
    snapshot();
    var a = g.pickPos, t = g.arr[a]; g.arr[a] = g.arr[p]; g.arr[p] = t;
    g.pickPos = -1; g.moves++;
    drawCell(a); drawCell(p); sparkAt(p);
    AU.sfx('slide_swap'); checkDone();
  }
  function rotAt(cw) {
    snapshot();
    SV.rotate(g.arr, g.n, g.cr, g.cc, cw); g.moves++;
    var w = SV.windowCells(g.n, g.cr, g.cc);
    for (var i = 0; i < 4; i++) drawCell(w[i]);
    AU.sfx('slide_rot'); checkDone();
  }
  function sparkAt(p) { g.spark = 16; g.sparkPos = p; }
  function hint() {
    var mk = modeKey(), n = g.n;
    if (mk === 'SLIDE') {
      var s = SV.slide(g.arr, n); if (!s || !s.length) return;
      g.cr = Math.floor(s[0] / n); g.cc = s[0] % n; sparkAt(s[0]);
    } else if (mk === 'SWAP') {
      var w = SV.swap(g.arr); if (!w.length) return;
      if (g.pickPos >= 0 && g.arr[g.pickPos] !== g.pickPos) { var tgt = g.arr.indexOf(g.pickPos); g.cr = Math.floor(tgt / n); g.cc = tgt % n; sparkAt(tgt); }
      else { g.pickPos = -1; g.cr = Math.floor(w[0][0] / n); g.cc = w[0][0] % n; sparkAt(w[0][1]); }
    } else {
      var r = SV.rotateSolve(g.arr, n); if (!r || !r.length) return;
      g.cr = r[0].r; g.cc = r[0].c; sparkAt(r[0].r * n + r[0].c); say(r[0].cw ? 'HINT: TURN RIGHT (A)' : 'HINT: TURN LEFT (B)', 60);
    }
    g.hints++; AU.sfx('slide_hint');
    if (mk !== 'ROTATE') say('HINT USED', 30);
  }
  function checkDone() {
    if (g.anim || g.pending.length || !SV.solved(g.arr)) return;
    g.done = true; g.mode = 'done'; g.doneT = 0;
    var mk = modeKey(), n = g.n;
    var stars = (!g.hints && g.moves <= g.par) ? 3 : (g.moves <= g.par * 2 ? 2 : 1);
    if (g.levelCheat) stars = 1;
    g.stars = stars;
    var nb = false;
    if (!g.levelCheat) {
      var k = recKey(), rec = bestRec(k);
      if (!rec || g.time < rec.time || (g.time === rec.time && g.moves < rec.moves)) { CT.save('slide', 'rec_' + k, { time: g.time, moves: g.moves }); nb = true; }
      var st = CT.load('slide', 'stars', []) || [];
      while (st.length < SL.Pics.count) st.push(0);
      if (stars > (st[g.pic] | 0)) { st[g.pic] = stars; CT.save('slide', 'stars', st); }
      if (mk === 'SLIDE' && !g.cheatUsed) g.goalDone[n] = 1;
    }
    if (mk === 'SLIDE') drawCell(g.arr.indexOf(n * n - 1));      // 補上最後一片
    text(23, 19, 'CLEAR!'); text(23, 20, padR('$$$'.substring(0, stars), 3));
    text(23, 22, nb ? 'NEW BEST' : '        ');
    panel();
    text(1, 25, padR('COMPLETE!  A/START: TITLE', 30));
    AU.play('slide_clear'); AU.sfx('slide_done');
  }

  /* ---------------- HUD ---------------- */
  function say(s, t) { g.msg = s; g.msgT = t || 40; }
  function msgLine() {
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.peek) line = 'PEEKING AT THE PICTURE...';
    else if (g.msgT > 0) line = g.msg;
    else if (modeKey() === 'SWAP' && g.pickPos >= 0) line = 'PICK THE PIECE TO SWAP WITH';
    else line = 'MAKE THE PICTURE WHOLE!';
    text(1, 25, padR(line, 30));
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0;
    function spr(x, y, tile, pal) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal }); }
    function box(x, y, w, h, pal) {
      spr(x - 1, y - 1, art.s('TL'), pal); spr(x + w - 7, y - 1, art.s('TR'), pal);
      spr(x - 1, y + h - 7, art.s('BL'), pal); spr(x + w - 7, y + h - 7, art.s('BR'), pal);
    }
    var blink = (g.t >> 3) & 1;
    if (g.mode === 'title') spr(22 * 8 - 2, ROWS[g.row] * 8 + 8, art.s('ARR'), blink);
    else if (g.mode === 'play' && !g.paused && !g.peek) {
      var X = ox() * 8, Y = oy() * 8;
      if (modeKey() === 'ROTATE') {
        box(X + g.cc * 32, Y + g.cr * 32, 64, 64, blink ? 0 : 1);
        spr(X + g.cc * 32 + 28, Y + g.cr * 32 + 28, art.s('ROT'), 1);
      } else {
        box(X + g.cc * 32, Y + g.cr * 32, 32, 32, 0);
        if (g.pickPos >= 0) box(X + (g.pickPos % g.n) * 32 + 4, Y + Math.floor(g.pickPos / g.n) * 32 + 4, 24, 24, blink ? 1 : 3);
      }
    }
    if (g.spark > 0 && g.sparkPos >= 0 && (g.mode === 'play' || g.mode === 'done')) {
      var sx = ox() * 8 + (g.sparkPos % g.n) * 32 + 12, sy = oy() * 8 + Math.floor(g.sparkPos / g.n) * 32 + 12;
      spr(sx, sy, art.s((g.spark >> 2) & 1 ? 'STAR' : 'SPARK'), 1);
    }
    if (g.mode === 'done') {
      var k = (g.doneT >> 2) % 4;
      var ex = ox() * 8, ey = oy() * 8, wd = g.n * 32;
      spr(ex - 4 + (k * wd) / 4, ey - 6, art.s(k & 1 ? 'STAR' : 'SPARK'), 1);
      spr(ex + wd - (k * wd) / 4, ey + wd - 2, art.s(k & 1 ? 'SPARK' : 'STAR'), 2);
    }
    for (var q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }

  /* ---------------- 輸入 ---------------- */
  function rep(I, d) {
    var b = DBTN[d];
    if (!I.held(b)) { g.rep[d] = 0; return false; }
    g.rep[d]++;
    if (g.rep[d] === 1) return true;
    return g.rep[d] > REP_DELAY && (g.rep[d] - REP_DELAY - 1) % REP_RATE === 0;
  }
  function dpad(I) { var out = null; for (var i = 0; i < 4; i++) { var d = DORDER[i]; if (rep(I, d) && !out) out = d; } return out; }
  function startPressed(I) { return I.pressed(BTN.START) && !I.held(BTN.SELECT); }
  // SELECT：放開時才算（按著期間碰過 START = 回選單手勢 ⇒ 作廢）；回傳 'tap' / 'hold'（≥ HINT_HOLD 幀，放開前就觸發一次）/ null
  function selectAct(I) {
    if (I.held(BTN.SELECT)) {
      if (I.held(BTN.START)) g.selTaint = true;
      g.selHeld = true; g.selHold++;
      if (g.selHold === HINT_HOLD && !g.selTaint) return 'hold';
      return null;
    }
    var r = null;
    if (g.selHeld && !g.selTaint && g.selHold < HINT_HOLD) r = 'tap';
    g.selHeld = false; g.selTaint = false; g.selHold = 0;
    return r;
  }
  function setPeek(on) {
    if (g.peek === on) return;
    g.peek = on;
    if (on) drawSolved(); else drawBoard();
    msgLine();
  }
  function updatePlay(I) {
    if (startPressed(I) && !g.peek) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      msgLine();
    }
    if (g.paused) { selectAct(I); return; }
    g.t++; g.time++;
    if (g.msgT > 0) g.msgT--;
    if (g.spark > 0) g.spark--;
    stepAnim();
    if (!g.anim && g.pending.length) startAnim();
    if (g.mode !== 'play') return;
    var mk = modeKey(), n = g.n;
    // B：點一下 = 提示（ROTATE = 逆轉）、長按 = 偷看
    if (I.held(BTN.B)) {
      g.bHold++;
      if (g.bHold === PEEK_HOLD) setPeek(true);
    } else {
      if (g.bHold > 0 && g.bHold < PEEK_HOLD && !g.anim && !g.pending.length) {
        if (mk === 'ROTATE') rotAt(false);
        else if (mk === 'SWAP' && g.pickPos >= 0) { g.pickPos = -1; AU.sfx('slide_bump'); }
        else hint();
      }
      if (g.peek) setPeek(false);
      g.bHold = 0;
    }
    if (g.peek || g.mode !== 'play') { if (g.mode === 'play') panel(); return; }
    var sa = selectAct(I);
    if (sa === 'tap') doUndo();
    else if (sa === 'hold' && mk === 'ROTATE') hint();
    var d = dpad(I);
    if (d) {
      var lim = mk === 'ROTATE' ? n - 1 : n, nr = g.cr + DY[d], nc = g.cc + DX[d];
      if (nr >= 0 && nc >= 0 && nr < lim && nc < lim) { g.cr = nr; g.cc = nc; AU.sfx('slide_move'); }
    }
    if (I.pressed(BTN.A) && !g.anim && !g.pending.length) {
      var p = g.cr * n + g.cc;
      if (mk === 'SLIDE') pushAt(p);
      else if (mk === 'SWAP') swapAt(p);
      else rotAt(true);
    }
    if (g.mode === 'play') { panel(); msgLine(); }
  }

  /* ---------------- 密技 ---------------- */
  function doCheat() {
    if (g.mode !== 'play') return;
    g.cheatUsed = true; g.levelCheat = true;
    g.pending = []; if (g.anim) { g.anim = null; }
    var mk = modeKey(), n = g.n, i;
    if (mk === 'SLIDE') { var s = SV.slide(g.arr, n) || []; for (i = 0; i < Math.min(10, s.length); i++) { SV.slideMove(g.arr, n, s[i]); g.moves++; } }
    else if (mk === 'SWAP') { var w = SV.swap(g.arr); for (i = 0; i < Math.min(3, w.length); i++) { var t = g.arr[w[i][0]]; g.arr[w[i][0]] = g.arr[w[i][1]]; g.arr[w[i][1]] = t; g.moves++; } }
    else { var r = SV.rotateSolve(g.arr, n) || []; for (i = 0; i < Math.min(10, r.length); i++) { SV.rotate(g.arr, n, r[i].r, r[i].c, r[i].cw); g.moves++; } }
    g.pickPos = -1;
    drawBoard(); say('STAR BOOST! 10 MOVES', 50); AU.sfx('slide_hint');
    checkDone();
  }

  /* ---------------- 機器人 ---------------- */
  function tap(q, m, gap) { q.push(m); for (var i = 0; i < (gap || 1); i++) q.push(0); }
  function moveTo(q, r0, c0, r1, c1) {
    while (c0 < c1) { tap(q, BTN.RIGHT); c0++; } while (c0 > c1) { tap(q, BTN.LEFT); c0--; }
    while (r0 < r1) { tap(q, BTN.DOWN); r0++; } while (r0 > r1) { tap(q, BTN.UP); r0--; }
  }
  function botPlan() {
    var q = g.bot.q;
    if (g.mode === 'title') {
      if (g.t < 30) { q.push(0); return; }
      var wantSize = g.goalDone[3] ? 4 : 3, wantI = MODES[0].sizes.indexOf(wantSize);
      if (g.m !== 0) { if (g.row !== 0) { tap(q, BTN.UP, 2); return; } tap(q, BTN.LEFT, 2); return; }
      if (g.sizeI !== wantI) { if (g.row !== 1) { tap(q, g.row < 1 ? BTN.DOWN : BTN.UP, 2); return; } tap(q, g.sizeI < wantI ? BTN.RIGHT : BTN.LEFT, 2); return; }
      tap(q, BTN.START, 6); return;
    }
    if (g.mode === 'rules') { tap(q, BTN.START, 4); return; }
    if (g.mode === 'done') { if (g.doneT < 40) { q.push(0); return; } tap(q, BTN.A, 6); return; }
    if (g.mode !== 'play') { q.push(0); return; }
    if (g.paused) { tap(q, BTN.START, 2); return; }
    if (g.anim || g.pending.length) { q.push(0); return; }
    var n = g.n, s = SV.slide(g.arr, n);
    if (!s || !s.length) { q.push(0); return; }
    var m = s[0];
    moveTo(q, g.cr, g.cc, Math.floor(m / n), m % n);
    tap(q, BTN.A, 2);
    for (var i = 0; i < ANIM_HALF + ANIM_FULL; i++) q.push(0);
  }
  function botMask() { if (!g.bot.q.length) botPlan(); return g.bot.q.length ? g.bot.q.shift() : 0; }
  function goalOk() { return !!(g && !g.cheatUsed && g.goalDone[3] && g.goalDone[4]); }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'slide', order: 5, title: '星塵拼圖', legacy: ['sliding-puzzle.html', 'jigsaw-puzzle.html', 'puzzle.html'],
    init: function (nes) {
      nes0 = nes;
      art = SL.Art.make();
      var ppu = nes.ppu, i;
      g = newState();
      var qp = CT.query ? parseInt(CT.query('pic') || '', 10) : NaN;
      if (qp >= 1 && qp <= SL.Pics.count) g.pic = qp - 1;
      loadPic(g.pic);
      NES.CHR.setPattern(1, 'slide_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(0x0F);
      for (i = 0; i < 4; i++) ppu.setSprPalette(i, SPR_PAL[i]);
      GAME.backTile = { tile: art.s('DOT'), pal: 1 };
      AU.init(nes);
      var qm = CT.query ? (CT.query('smode') || '').toUpperCase() : '';
      var qn = CT.query ? parseInt(CT.query('size') || '', 10) : NaN;
      for (i = 0; i < MODES.length; i++) if (MODES[i].key === qm) g.m = i;
      if (qn) { var si = MODES[g.m].sizes.indexOf(qn); if (si >= 0) g.sizeI = si; }
      if (CT.query && CT.query('direct') === '1') startGame(); else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        var d = dpad(I);
        if (d === 'U' || d === 'D') { g.row = (g.row + (d === 'D' ? 1 : 2)) % 3; AU.sfx('slide_move'); }
        if (d === 'L' || d === 'R') {
          var s = d === 'R' ? 1 : -1;
          if (g.row === 0) { g.m = (g.m + s + MODES.length) % MODES.length; g.sizeI = Math.min(g.sizeI, MODES[g.m].sizes.length - 1); titlePanel(); }
          else if (g.row === 1) { var L = MODES[g.m].sizes.length; g.sizeI = (g.sizeI + s + L) % L; titlePanel(); }
          else { g.pic = (g.pic + s + SL.Pics.count) % SL.Pics.count; enterTitle(); }
          AU.sfx('slide_move');
        }
        if (startPressed(I) || I.pressed(BTN.A)) { AU.sfx('slide_ok'); startGame(); }
        else if (I.pressed(BTN.B)) enterRules();
      } else if (g.mode === 'rules') {
        g.t++;
        if (g.t > 10 && (startPressed(I) || I.pressed(BTN.A) || I.pressed(BTN.B))) enterTitle();
      } else if (g.mode === 'done') {
        g.t++; g.doneT++;
        if (g.doneT > 30 && (I.pressed(BTN.A) || startPressed(I))) enterTitle();
      } else updatePlay(I);
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title' && (g.t & 31) === 0) text(23, 22, (g.t & 32) ? '       ' : 'PUSH');
      if (g.mode === 'title' && (g.t & 31) === 0) text(23, 23, (g.t & 32) ? '       ' : 'START');
      flush();
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, row: g.row, smode: modeKey(), size: g.mode === 'title' ? sizeOf() : g.n, pic: g.pic, paused: g.paused, t: g.t,
        queue: g.q.length + g.qa.length, arr: g.arr ? g.arr.slice() : null, cr: g.cr, cc: g.cc, pick: g.pickPos, moves: g.moves,
        time: g.time, par: g.par, hints: g.hints, anim: !!g.anim, pending: g.pending.length, done: g.done, stars: g.stars,
        peek: g.peek, cheatUsed: g.cheatUsed, undo: g.undo.length, seed: g.seed, goalDone: Object.keys(g.goalDone).map(Number), goal: goalOk()
      };
    },
    exit: function () { AU.stop(); },
    cheat: function () { if (!g || g.mode !== 'play') return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () {
      var r = CT.load('slide', 'rec_slide4', null) || CT.load('slide', 'rec_slide3', null);
      var s = r ? mmss(r.time) : '--:--';
      while (s.length < 6) s = ' ' + s;
      return s;
    }
  };
  SL.MODES = MODES;
  SL.dev = {
    g: function () { return g; }, start: function (m, size, pic) {
      g.m = m || 0; g.sizeI = Math.max(0, MODES[g.m].sizes.indexOf(size || 3)); if (pic !== undefined) g.pic = pic; startGame();
    },
    title: function () { enterTitle(); }, off: function () { return off(); }, origin: function () { return [ox(), oy()]; }
  };
  if (CT.register) CT.register(GAME);
})();
