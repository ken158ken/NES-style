/*
 * games/cart3/lines/main.js — 《星塵連線 STAR LINK》（合輯卡帶三 槽 6，id = lines）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：lines/gen.js、lines/levels.js、lines/art.js、lines/song.js、games/cart1/registry.js
 * 舊作概念來源（只取「把成對的東西連起來」）：connect-lines（舊作是 ≤ 2 折的配對消除；本作改成原創的填滿連線益智）。
 *
 * 規則（見 gen.js 檔頭）：同色星珠兩兩相連、線不交叉不分岔、填滿每一格；自創機關「星橋」（一橫一直立體交叉）
 *   與「星門」（進一扇、出另一扇）。36 關（6 章）全部由產生器做出且解題器驗證唯一解；RANDOM 模式 = `?seed=` 可重現的隨機關。
 * 操作：十字鍵一格一格移動游標（按住：12 幀後每 4 幀一格）；A = 下筆 / 收筆（在星珠或線上下筆，從那裡接著畫）；
 *   下筆時十字鍵延伸線（走回上一格 = 收回；撞到別色的線 = 切斷它；走到同色另一顆星珠 = 連成、自動收筆）；
 *   B 點一下 = 收筆 / 清掉游標下那條線；B 長按 30 幀 = 提示（把一條線畫成正解）；SELECT（放開時）= 復原；START = 暫停。
 * 盤面全走背景名稱表（每格 2×2 磁磚 + 一個屬性區），寫入走影子表 + 差異佇列（每幀 ≤ 140 byte）；精靈只有游標 4 角 + 筆尖。
 * 評價：時間 ≤ 標準且沒用提示 = ★★★；提示 ≤ 1 或時間 ≤ 2 倍 = ★★；其餘 ★。存每關最佳星數；bestText = 過關數 ` 10/36`。
 * 密技（C / ★）：遊玩中 = 立刻把一條線畫成正解（不算提示，但本次開機之後 goal 一律 false）；標題 / 選關 / 過關畫面無效。
 *   本作沒有失敗狀態，所以沒有「GAME OVER 原地續關」（§6-1 不適用）。
 * goal = 不開密技把前 10 關全破（同一次開機內）。機器人：用解題器的解，操作游標一格一格畫線。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var LN = CT.Lines = CT.Lines || {};
  var AU = LN.Audio, GEN = LN.Gen;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var FLUSH_LIMIT = 140, REP_DELAY = 12, REP_RATE = 4, HINT_HOLD = 30, GOAL_LEVELS = 10;
  var CHAPTERS = ['FIRST LIGHT', 'STAR FIELD', 'BRIDGE WAY', 'TWIN BRIDGES', 'STAR GATES', 'DEEP SKY', 'NEBULA HEART'];
  var PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x16, 0x30], [0x00, 0x2A, 0x28], [0x00, 0x11, 0x2C], [0x00, 0x24, 0x27]],
    spr: [[0x30, 0x10, 0x30], [0x28, 0x27, 0x38], [0x2C, 0x21, 0x30], [0x16, 0x26, 0x30]]
  };
  var DX = { U: 0, R: 1, D: 0, L: -1 }, DY = { U: -1, R: 0, D: 1, L: 0 };
  var DORDER = ['U', 'R', 'D', 'L'];
  var DBTN = { U: BTN.UP, R: BTN.RIGHT, D: BTN.DOWN, L: BTN.LEFT };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, lsel: 0, paused: false, cheatReq: false, cheatUsed: false, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      rep: { U: 0, R: 0, D: 0, L: 0 }, bHold: 0, bUsed: false, selHeld: false, selTaint: false,
      P: null, paths: [], pen: -1, cx: 0, cy: 0, undo: [], hints: 0, time: 0, strokes: 0, cleared: false, stars: 0,
      goalSet: {}, randSeed: 0, clearT: 0, bot: { q: [], t: 0 }
    };
  }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function mmss(f) { var s = Math.floor(f / 60); return pad(Math.min(99, Math.floor(s / 60)), 2) + ':' + pad(s % 60, 2); }

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
  function redraw(fn) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
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
  function starField(r0, r1) {
    for (var r = r0; r <= r1; r++) for (var c = 0; c < 32; c++) {
      var h = ((c * 2654435761) ^ (r * 40503) ^ 0x5a17) >>> 0;
      if (h % 37 === 5) put(c, r, art.frame.ST1);
      else if (h % 53 === 9) put(c, r, art.frame.ST2);
    }
  }
  function clearRow(r) { for (var c = 0; c < 32; c++) put(c, r, 0); }

  /* ---------------- 關卡 ---------------- */
  function makePuzzle(L, idx, seed) {
    var w = L.w, h = L.h, N = w * h, i;
    var P = { L: L, idx: idx, seed: seed, w: w, h: h, N: N, ncol: L.ends.length, colors: L.colors.slice() };
    P.endAt = new Int8Array(N).fill(-1); P.bridge = new Uint8Array(N); P.twin = new Int16Array(N).fill(-1);
    for (i = 0; i < L.ends.length; i++) {
      var e = L.ends[i];
      P.endAt[e[1] * w + e[0]] = i; P.endAt[e[3] * w + e[2]] = i;
    }
    P.endA = L.ends.map(function (e) { return e[1] * w + e[0]; });
    P.endB = L.ends.map(function (e) { return e[3] * w + e[2]; });
    (L.bridges || []).forEach(function (b) { P.bridge[b[1] * w + b[0]] = 1; });
    (L.gates || []).forEach(function (q) { var a = q[1] * w + q[0], b = q[3] * w + q[2]; P.twin[a] = b; P.twin[b] = a; });
    var r = GEN.solve(L, 1);
    P.sol = r.sol;
    P.ox = (16 - w) & ~1; P.oy = 4 + ((((18 - 2 * h) / 2) | 0) & ~1);
    P.par = N * 2 * 60;
    return P;
  }
  function levelOf(i) { return GEN.decode(LN.LEVELS[i].code); }
  function chapterOf(i) { return Math.min(CHAPTERS.length - 1, Math.floor(i / 5)); }

  /* ---------------- 盤面幾何 / 佔用 ---------------- */
  function cxy(c) { return [c % g.P.w, (c / g.P.w) | 0]; }
  function dirTo(p, q) {
    var a = cxy(p), b = cxy(q);
    if (b[0] === a[0] && b[1] === a[1] - 1) return 'U';
    if (b[0] === a[0] && b[1] === a[1] + 1) return 'D';
    if (b[1] === a[1] && b[0] === a[0] + 1) return 'R';
    if (b[1] === a[1] && b[0] === a[0] - 1) return 'L';
    return null;
  }
  function horiz(d) { return d === 'L' || d === 'R'; }
  function axisAt(path, i) {
    var d = null;
    if (i > 0) d = dirTo(path[i - 1], path[i]);
    if (!d && i + 1 < path.length) d = dirTo(path[i], path[i + 1]);
    return d ? (horiz(d) ? 'H' : 'V') : null;
  }
  function occupancy() {
    var P = g.P, N = P.N, occ = new Int8Array(N).fill(-1), occH = new Int8Array(N).fill(-1), occV = new Int8Array(N).fill(-1);
    for (var k = 0; k < g.paths.length; k++) {
      var p = g.paths[k];
      for (var i = 0; i < p.length; i++) {
        var c = p[i];
        if (P.bridge[c]) { var ax = axisAt(p, i); if (ax === 'V') occV[c] = k; else occH[c] = k; }
        else occ[c] = k;
      }
    }
    return { occ: occ, occH: occH, occV: occV };
  }
  function complete(k) {
    var p = g.paths[k], P = g.P;
    if (!p || p.length < 2) return false;
    var a = p[0], b = p[p.length - 1];
    return (a === P.endA[k] && b === P.endB[k]) || (a === P.endB[k] && b === P.endA[k]);
  }
  function filledCount() {
    var O = occupancy(), P = g.P, n = 0, tot = 0;
    for (var c = 0; c < P.N; c++) {
      if (P.bridge[c]) { tot += 2; if (O.occH[c] >= 0) n++; if (O.occV[c] >= 0) n++; }
      else { tot++; if (O.occ[c] >= 0 || P.endAt[c] >= 0) n++; }
    }
    return [n, tot];
  }
  function solved() {
    for (var k = 0; k < g.P.ncol; k++) if (!complete(k)) return false;
    var f = filledCount();
    return f[0] === f[1];
  }

  /* ---------------- 繪製格子 ---------------- */
  function ciOf(k) { return k < 0 ? 0 : 2 + (g.P.colors[k] & 1); }
  function grpOf(k) { return k < 0 ? 0 : (g.P.colors[k] >> 1); }
  function sortDirs(ds) { return ds.sort(function (a, b) { return DORDER.indexOf(a) - DORDER.indexOf(b); }).join(''); }
  function cellLook(c, O) {
    var P = g.P, k, p, i;
    if (P.bridge[c]) {
      var a = O.occH[c], b = O.occV[c], grp = a >= 0 ? grpOf(a) : (b >= 0 ? grpOf(b) : 0);
      var bi = b < 0 ? 0 : (a >= 0 && grpOf(a) !== grpOf(b) ? 1 : ciOf(b));
      if (a < 0 && bi === 1) bi = 0;
      return ['B' + ciOf(a) + bi, grp];
    }
    if (P.endAt[c] >= 0) {
      k = P.endAt[c]; p = g.paths[k]; var d = '';
      if (p && p.length >= 2) {
        if (p[0] === c) d = dirTo(c, p[1]) || '';
        else if (p[p.length - 1] === c) d = dirTo(c, p[p.length - 2]) || '';
      }
      return ['P' + ciOf(k) + d, grpOf(k)];
    }
    k = O.occ[c];
    if (P.twin[c] >= 0) {
      if (k < 0) return ['G0', 0];
      p = g.paths[k]; i = p.indexOf(c); var dd = '';
      if (i > 0 && p[i - 1] !== P.twin[c]) dd = dirTo(c, p[i - 1]) || '';
      if (!dd && i + 1 < p.length && p[i + 1] !== P.twin[c]) dd = dirTo(c, p[i + 1]) || '';
      return ['G' + ciOf(k) + dd, grpOf(k)];
    }
    if (k < 0) return ['E', -1];
    p = g.paths[k]; i = p.indexOf(c);
    var ds = [];
    if (i > 0) { var d1 = dirTo(c, p[i - 1]); if (d1) ds.push(d1); }
    if (i + 1 < p.length) { var d2 = dirTo(c, p[i + 1]); if (d2) ds.push(d2); }
    return ['L' + ciOf(k) + sortDirs(ds), grpOf(k)];
  }
  function drawBoard() {
    var P = g.P, O = occupancy();
    for (var c = 0; c < P.N; c++) {
      var xy = cxy(c), look = cellLook(c, O), t = art.cell(look[0]);
      var col = P.ox + xy[0] * 2, row = P.oy + xy[1] * 2;
      put(col, row, t[0]); put(col + 1, row, t[1]); put(col, row + 1, t[2]); put(col + 1, row + 1, t[3]);
      if (look[1] >= 0) putA(col >> 1, row >> 1, look[1]);
    }
  }
  function drawFrame(ox, oy, w, h) {
    var c, r, x1 = ox + 2 * w, y1 = oy + 2 * h;
    for (c = ox; c < x1; c++) { put(c, oy - 1, art.frame.H); put(c, y1, art.frame.H); }
    for (r = oy; r < y1; r++) { put(ox - 1, r, art.frame.V); put(x1, r, art.frame.V); }
    put(ox - 1, oy - 1, art.frame.C); put(x1, oy - 1, art.frame.C); put(ox - 1, y1, art.frame.C); put(x1, y1, art.frame.C);
  }

  /* ---------------- 畫面：標題 / 說明 / 選關 ---------------- */
  var MENU = ['LEVELS', 'RANDOM', 'RULES'];
  function clearedCount() { var s = CT.load('lines', 'stars', []) || [], n = 0; for (var i = 0; i < LN.LEVELS.length; i++) if ((s[i] | 0) > 0) n++; return n; }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    // 標題的示範盤：第 6 關的正解
    var save = { P: g.P, paths: g.paths };
    g.P = makePuzzle(levelOf(5), 5, 0); g.P.ox = 2; g.P.oy = 6;
    g.paths = g.P.sol.map(function (p) { return p.slice(); });
    redraw(function () {
      starField(1, 28);
      for (var c = 0; c < 32; c++) put(c, 3, 0);
      center(2, '$ S T A R   L I N K $');
      center(4, 'CONNECT THE TWIN STARS');
      for (c = 0; c < 32; c++) { if (g.want[4 * 32 + c] === g.want[0]) put(c, 4, 0); }
      for (var r = 5; r < 20; r++) for (c = 1; c < 15; c++) put(c, r, 0);
      drawFrame(2, 6, 6, 6);
      drawBoard();
      for (r = 6; r < 18; r++) for (c = 15; c < 31; c++) put(c, r, 0);
      for (var i = 0; i < MENU.length; i++) text(19, 7 + i * 2, MENU[i]);
      text(17, 15, 'CLEAR ' + pad(clearedCount(), 2) + '/' + LN.LEVELS.length);
      for (r = 19; r < 28; r++) clearRow(r);
      center(20, 'A/START SELECT');
      center(22, 'HOLD START+SELECT: MENU');
      center(24, 'C/$ = CHEAT');
    });
    g.P = save.P; g.paths = save.paths;
    AU.play('lines_title');
  }
  function enterHelp() {
    g.mode = 'help'; g.t = 0;
    var save = { P: g.P, paths: g.paths };
    redraw(function () {
      center(2, 'HOW TO LINK');
      var L = ['LINK EACH PAIR OF STARS', 'LINES NEVER CROSS OR BRANCH', 'FILL EVERY CELL ON THE BOARD',
               '  BRIDGE: ONE ROW LINE AND', '  ONE COLUMN LINE CROSS IT', '  GATE: GO IN ONE GATE,', '  COME OUT OF ITS TWIN',
               'A PEN   B LIFT / CLEAR LINE', 'HOLD B HINT  SELECT UNDO'];
      var rows = [5, 7, 9, 12, 14, 17, 19, 22, 24];
      for (var i = 0; i < L.length; i++) text(3, rows[i], L[i]);
      // 範例圖：星橋 / 星門（用真的格子磁磚）
      var b = art.cell('B23'), q = art.cell('G3R');
      put(2, 12, b[0]); put(3, 12, b[1]); put(2, 13, b[2]); put(3, 13, b[3]); putA(1, 6, 1);
      put(2, 18, q[0]); put(3, 18, q[1]); put(2, 19, q[2]); put(3, 19, q[3]); putA(1, 9, 2);
      center(27, 'PUSH START');
    });
    g.P = save.P; g.paths = save.paths;
  }
  function selPos(i) { return [6 + (i % 6) * 4, 6 + Math.floor(i / 6) * 2]; }
  function enterSelect() {
    g.mode = 'select'; g.t = 0;
    var st = CT.load('lines', 'stars', []) || [];
    redraw(function () {
      center(2, 'SELECT LEVEL');
      for (var i = 0; i < LN.LEVELS.length; i++) {
        var p = selPos(i), s = st[i] | 0;
        text(p[0], p[1], pad(i + 1, 2));
        putA(p[0] >> 1, p[1] >> 1, s >= 3 ? 2 : (s > 0 ? 1 : 0));
      }
      text(4, 20, 'WHITE NEW  YELLOW CLEAR');
      text(4, 21, '');
      text(4, 22, 'BLUE = 3 STARS');
      center(26, 'A PLAY   B BACK');
    });
    selInfo();
  }
  function selInfo() {
    var i = g.lsel, s = (CT.load('lines', 'stars', []) || [])[i] | 0, L = levelOf(i);
    var mech = (L.bridges.length ? 'BRIDGE ' : '') + (L.gates.length ? 'GATE' : '');
    text(2, 16, padR('LV ' + pad(i + 1, 2) + ' ' + CHAPTERS[chapterOf(i)], 28));
    text(2, 18, padR(L.w + 'X' + L.h + ' ' + L.ends.length + ' PAIRS ' + mech, 28));
    text(24, 16, s ? ('$$$'.substring(0, s) + '   ').substring(0, 3) : '---');
  }

  /* ---------------- 遊玩 ---------------- */
  function startLevel(idx, seed) {
    var L;
    if (idx >= 0) L = levelOf(idx);
    else {
      L = null;
      for (var tries = 0; !L && tries < 8; tries++) L = GEN.generate({ w: 7, h: 7, minLen: 3, maxLen: 10, bridges: 1, gates: 1 }, (seed + tries * 7919) >>> 0, 2000);
      if (!L) L = levelOf(20);
    }
    g.P = makePuzzle(L, idx, seed);
    g.paths = []; for (var k = 0; k < g.P.ncol; k++) g.paths.push([]);
    g.pen = -1; g.undo = []; g.hints = 0; g.time = 0; g.strokes = 0; g.cleared = false; g.levelCheat = false;
    var e0 = cxy(g.P.endA[0]); g.cx = e0[0]; g.cy = e0[1];
    g.mode = 'play'; g.paused = false; g.msg = ''; g.msgT = 0; g.bot.q = [];
    redraw(function () {
      starField(1, 28);
      var P = g.P;
      for (var r = P.oy - 1; r <= P.oy + 2 * P.h; r++) for (var c = P.ox - 1; c <= P.ox + 2 * P.w; c++) put(c, r, 0);
      for (c = 0; c < 32; c++) { put(c, 1, 0); put(c, 2, 0); }
      for (r = 23; r < 29; r++) clearRow(r);
      drawFrame(P.ox, P.oy, P.w, P.h);
      drawBoard();
      hud();
      text(1, 27, 'A PEN  B LIFT  SELECT UNDO');
      text(19, 23, 'HOLD B HINT');
    });
    AU.play('lines_play');
  }
  function snapshot() {
    g.undo.push({ paths: g.paths.map(function (p) { return p.slice(); }) });
    if (g.undo.length > 40) g.undo.shift();
  }
  function doUndo() {
    if (!g.undo.length) { AU.sfx('lines_err'); say('NOTHING TO UNDO', 30); return; }
    var s = g.undo.pop();
    g.paths = s.paths; g.pen = -1;
    AU.sfx('lines_undo'); say('UNDO', 20);
    afterChange();
  }
  function idxIn(k, cell, axis) {
    var p = g.paths[k];
    for (var i = 0; i < p.length; i++) if (p[i] === cell && (!axis || !g.P.bridge[cell] || axisAt(p, i) === axis)) return i;
    return -1;
  }
  function cutAt(k, cell, axis) {
    var i = idxIn(k, cell, axis);
    if (i < 0) return;
    var tw = g.P.twin[cell];
    if (tw >= 0) { var j = g.paths[k].indexOf(tw); if (j >= 0 && j < i) i = j; }
    g.paths[k] = g.paths[k].slice(0, i);
    AU.sfx('lines_cut');
  }
  function head() { var p = g.paths[g.pen]; return p[p.length - 1]; }
  function setCursor(c) { var xy = cxy(c); g.cx = xy[0]; g.cy = xy[1]; }
  function penDown() {
    var P = g.P, c = g.cy * P.w + g.cx, O = occupancy(), k;
    if (P.endAt[c] >= 0) {
      k = P.endAt[c]; snapshot();
      g.paths[k] = [c]; g.pen = k; g.strokes++;
      AU.sfx('lines_pen'); afterChange(); return;
    }
    if (P.bridge[c]) k = O.occH[c] >= 0 ? O.occH[c] : O.occV[c];
    else k = O.occ[c];
    if (k < 0) { AU.sfx('lines_err'); say('START ON A STAR OR A LINE', 40); return; }
    snapshot();
    var i = idxIn(k, c, P.bridge[c] ? (O.occH[c] === k ? 'H' : 'V') : null);
    var tw = P.twin[c];
    if (tw >= 0) { var j = g.paths[k].indexOf(tw); if (j > i) i = j; }
    g.paths[k] = g.paths[k].slice(0, i + 1);
    g.pen = k; g.strokes++;
    setCursor(head());
    AU.sfx('lines_pen'); afterChange();
  }
  function penMove(d) {
    var P = g.P, k = g.pen, p = g.paths[k], h = p[p.length - 1], xy = cxy(h);
    var nx = xy[0] + DX[d], ny = xy[1] + DY[d];
    if (nx < 0 || ny < 0 || nx >= P.w || ny >= P.h) { AU.sfx('lines_err'); return false; }
    var t = ny * P.w + nx, ax = horiz(d) ? 'H' : 'V';
    if (P.bridge[h] && p.length >= 2) {
      var inD = dirTo(p[p.length - 2], h);
      if (inD && (horiz(inD) ? 'H' : 'V') !== ax) { AU.sfx('lines_err'); say('GO STRAIGHT OVER A BRIDGE', 40); return false; }
    }
    if (p.length >= 2 && t === p[p.length - 2]) { p.pop(); AU.sfx('lines_step'); afterChange(); return true; }
    var O = occupancy();
    if (P.endAt[t] >= 0) {
      if (P.endAt[t] !== k) { AU.sfx('lines_err'); say('THAT STAR IS ANOTHER COLOR', 40); return false; }
      if (t === p[0]) { g.paths[k] = [t]; afterChange(); return true; }
      p.push(t); g.pen = -1;
      AU.sfx('lines_link'); afterChange();
      return true;
    }
    var o;
    if (P.bridge[t]) o = ax === 'H' ? O.occH[t] : O.occV[t];
    else o = O.occ[t];
    if (o === k) {
      var i = idxIn(k, t, P.bridge[t] ? ax : null);
      if (P.twin[t] >= 0) { var j = p.indexOf(P.twin[t]); if (j > i) i = j; }
      g.paths[k] = p.slice(0, i + 1);
      AU.sfx('lines_step'); afterChange(); return true;
    }
    if (o >= 0) cutAt(o, t, P.bridge[t] ? ax : null);
    p = g.paths[k];
    p.push(t);
    if (P.twin[t] >= 0) p.push(P.twin[t]);
    AU.sfx('lines_step'); afterChange();
    return true;
  }
  function clearLineAt() {
    var P = g.P, c = g.cy * P.w + g.cx, O = occupancy(), k;
    if (P.endAt[c] >= 0) k = P.endAt[c];
    else if (P.bridge[c]) k = O.occH[c] >= 0 ? O.occH[c] : O.occV[c];
    else k = O.occ[c];
    if (k < 0 || !g.paths[k].length) { AU.sfx('lines_err'); return; }
    snapshot(); g.paths[k] = []; AU.sfx('lines_cut'); say('LINE CLEARED', 24); afterChange();
  }
  function sameAsSol(k) {
    var p = g.paths[k], s = g.P.sol[k];
    if (!p || p.length !== s.length) return false;
    var fw = true, bw = true;
    for (var i = 0; i < s.length; i++) { if (p[i] !== s[i]) fw = false; if (p[i] !== s[s.length - 1 - i]) bw = false; }
    return fw || bw;
  }
  function giveLine(isCheat) {
    var P = g.P;
    for (var k = 0; k < P.ncol; k++) {
      if (sameAsSol(k)) continue;
      snapshot();
      var s = P.sol[k];
      // 先把擋路的別色線切掉
      for (var i = 0; i < s.length; i++) {
        var O = occupancy(), c = s[i], ax = P.bridge[c] ? axisAt(s, i) : null;
        var o = P.bridge[c] ? (ax === 'H' ? O.occH[c] : O.occV[c]) : O.occ[c];
        if (o >= 0 && o !== k) cutAt(o, c, ax);
      }
      g.paths[k] = s.slice(); g.pen = -1;
      if (!isCheat) g.hints++;
      AU.sfx('lines_hint'); say(isCheat ? 'STAR BOOST! LINE DRAWN' : 'HINT: ONE LINE DRAWN', 50);
      afterChange();
      return true;
    }
    return false;
  }
  function afterChange() {
    drawBoard();
    if (!g.cleared && solved()) levelClear();
  }
  function levelClear() {
    var P = g.P;
    g.cleared = true; g.pen = -1; g.clearT = 0; g.mode = 'clear';
    var stars = 1;
    if (!g.hints && !g.levelCheat && g.time <= P.par) stars = 3;
    else if (g.hints <= 1 || g.time <= P.par * 2) stars = 2;
    if (g.levelCheat) stars = 1;
    g.stars = stars;
    var nb = false;
    if (P.idx >= 0 && !g.levelCheat) {
      var st = CT.load('lines', 'stars', []) || [];
      while (st.length < LN.LEVELS.length) st.push(0);
      if (stars > (st[P.idx] | 0)) { st[P.idx] = stars; CT.save('lines', 'stars', st); nb = true; }
      if (!g.cheatUsed) g.goalSet[P.idx] = 1;
    }
    for (var r = 23; r < 29; r++) clearRow(r);
    center(23, 'LINKED!  TIME ' + mmss(g.time) + '  ' + '$$$'.substring(0, stars) + '   '.substring(0, 3 - stars));
    center(25, nb ? 'NEW BEST!' : (g.hints ? 'HINTS ' + g.hints : 'NO HINTS'));
    center(27, P.idx >= 0 && P.idx + 1 < LN.LEVELS.length ? 'A NEXT  B LEVELS' : 'A AGAIN  B LEVELS');
    AU.play('lines_clear');
  }

  /* ---------------- HUD ---------------- */
  function say(s, t) { g.msg = s; g.msgT = t || 40; }
  function hud() {
    var P = g.P;
    if (!P) return;
    var title = P.idx >= 0 ? 'LV ' + pad(P.idx + 1, 2) + ' ' + CHAPTERS[chapterOf(P.idx)] : 'RANDOM ' + pad(P.seed % 100000, 5);
    text(1, 1, padR(title, 20) + 'TIME ' + mmss(g.time) + (g.cheatUsed ? '$' : ' '));
    var done = 0; for (var k = 0; k < P.ncol; k++) if (complete(k)) done++;
    var f = filledCount();
    text(1, 2, padR('LINKS ' + done + '/' + P.ncol + '  FILL ' + pad(Math.floor(f[0] * 100 / f[1]), 3) + '%', 22) + 'HINT ' + g.hints);
    if (g.mode !== 'play') return;
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = g.msg;
    else if (g.pen >= 0) line = 'DRAWING... A TO LIFT THE PEN';
    else if (done === P.ncol) line = 'FILL EVERY CELL TO FINISH';
    else line = 'A ON A STAR TO START A LINE';
    text(1, 25, padR(line, 30));
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0;
    function spr(x, y, tile, pal) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal }); }
    function box(x, y, w, h, pen, pal) {
      var s = pen ? 'P' : '';
      spr(x - 2, y - 2, art.s('TL' + s), pal); spr(x + w - 6, y - 2, art.s('TR' + s), pal);
      spr(x - 2, y + h - 6, art.s('BL' + s), pal); spr(x + w - 6, y + h - 6, art.s('BR' + s), pal);
    }
    var blink = (g.t >> 3) & 1;
    if (g.mode === 'title') box(19 * 8 - 4, (7 + g.sel * 2) * 8 - 2, 6 * 8 + 8, 12, false, blink);
    else if (g.mode === 'select') { var p = selPos(g.lsel); box(p[0] * 8 - 2, p[1] * 8 - 2, 20, 12, false, blink); }
    else if ((g.mode === 'play' || g.mode === 'clear') && g.P && !g.paused) {
      var P = g.P, x = (P.ox + g.cx * 2) * 8, y = (P.oy + g.cy * 2) * 8;
      if (g.mode === 'play') {
        if (g.pen >= 0) { box(x, y, 16, 16, true, 1); if (blink) spr(x + 4, y + 4, art.s('PEN'), 1); }
        else box(x, y, 16, 16, false, 0);
      }
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
  // SELECT：放開時才算，按著期間碰過 START（= 回選單手勢）就作廢
  function selectTap(I) {
    if (I.held(BTN.SELECT)) { if (I.held(BTN.START)) g.selTaint = true; g.selHeld = true; return false; }
    if (g.selHeld) { g.selHeld = false; var ok = !g.selTaint; g.selTaint = false; return ok; }
    return false;
  }
  function updatePlay(I) {
    if (startPressed(I)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
    }
    if (g.paused) { selectTap(I); hud(); return; }
    g.t++; g.time++;
    if (g.msgT > 0) g.msgT--;
    if (selectTap(I)) doUndo();
    var d = dpad(I);
    if (d) {
      if (g.pen >= 0) {
        var pk = g.pen;
        if (penMove(d)) { var pp = g.paths[pk]; if (pp.length) setCursor(pp[pp.length - 1]); }   // 連成那步：游標停在終點星珠
      } else {
        var nx = g.cx + DX[d], ny = g.cy + DY[d];
        if (nx >= 0 && ny >= 0 && nx < g.P.w && ny < g.P.h) { g.cx = nx; g.cy = ny; AU.sfx('lines_move'); }
      }
    }
    if (g.mode !== 'play') return;
    if (I.pressed(BTN.A)) {
      if (g.pen >= 0) { g.pen = -1; AU.sfx('lines_ok'); afterChange(); }
      else penDown();
    }
    if (g.mode !== 'play') return;
    if (I.held(BTN.B)) {
      g.bHold++;
      if (g.bHold === HINT_HOLD) { g.bUsed = true; if (!giveLine(false)) say('ALL LINES ARE RIGHT', 30); }
    } else {
      if (g.bHold > 0 && g.bHold < HINT_HOLD && !g.bUsed) {
        if (g.pen >= 0) { g.pen = -1; AU.sfx('lines_ok'); afterChange(); }
        else clearLineAt();
      }
      g.bHold = 0; g.bUsed = false;
    }
    if (g.mode === 'play') hud();
  }
  function moveSel(d) {
    var i = g.lsel, x = i % 6, y = Math.floor(i / 6), n = LN.LEVELS.length;
    x += DX[d]; y += DY[d];
    if (x < 0) x = 5; if (x > 5) x = 0;
    var rows = Math.ceil(n / 6);
    if (y < 0) y = rows - 1; if (y >= rows) y = 0;
    var ni = y * 6 + x; if (ni >= n) ni = n - 1;
    g.lsel = ni; AU.sfx('lines_move'); selInfo();
  }

  /* ---------------- 密技 ---------------- */
  function doCheat() {
    if (g.mode !== 'play' || !g.P) return;
    g.cheatUsed = true; g.levelCheat = true;
    giveLine(true);
  }

  /* ---------------- 機器人（用解題器的解操作游標） ---------------- */
  function tap(q, m, gap) { q.push(m); for (var i = 0; i < (gap || 1); i++) q.push(0); }
  function moveTo(q, fromX, fromY, toX, toY) {
    while (fromX < toX) { tap(q, BTN.RIGHT); fromX++; }
    while (fromX > toX) { tap(q, BTN.LEFT); fromX--; }
    while (fromY < toY) { tap(q, BTN.DOWN); fromY++; }
    while (fromY > toY) { tap(q, BTN.UP); fromY--; }
  }
  function botPlan() {
    var B = g.bot, q = B.q;
    if (g.mode === 'title') {
      if (g.t < 30) { q.push(0); return; }
      if (g.sel !== 0) { tap(q, BTN.UP, 2); return; }
      tap(q, BTN.A, 4); return;
    }
    if (g.mode === 'help') { tap(q, BTN.START, 4); return; }
    if (g.mode === 'select') {
      var want = 0;
      for (var i = 0; i < GOAL_LEVELS; i++) if (!g.goalSet[i]) { want = i; break; }
      if (g.lsel !== want) {
        var x = g.lsel % 6, y = Math.floor(g.lsel / 6), tx = want % 6, ty = Math.floor(want / 6);
        moveTo(q, x, y, tx, ty); return;
      }
      tap(q, BTN.A, 4); return;
    }
    if (g.mode === 'clear') {
      if (g.clearT < 40) { q.push(0); return; }
      var nextOk = g.P.idx + 1 < GOAL_LEVELS && !g.goalSet[g.P.idx + 1];
      tap(q, nextOk ? BTN.A : BTN.B, 6); return;
    }
    if (g.mode !== 'play') { q.push(0); return; }
    if (g.paused) { tap(q, BTN.START, 2); return; }
    if (g.pen >= 0) { tap(q, BTN.A, 2); return; }
    var P = g.P;
    for (var k = 0; k < P.ncol; k++) {
      if (sameAsSol(k)) continue;
      var s = P.sol[k], st = cxy(s[0]);
      moveTo(q, g.cx, g.cy, st[0], st[1]);
      tap(q, BTN.A, 2);
      for (var j = 1; j < s.length; j++) {
        if (P.twin[s[j - 1]] === s[j]) continue;       // 星門：自動傳送
        tap(q, DBTN[dirTo(s[j - 1], s[j])], 2);
      }
      q.push(0, 0, 0);
      return;
    }
    q.push(0);
  }
  function botMask() {
    var B = g.bot;
    B.t++;
    if (!B.q.length) botPlan();
    return B.q.length ? B.q.shift() : 0;
  }
  function goalOk() {
    if (!g || g.cheatUsed) return false;
    for (var i = 0; i < GOAL_LEVELS; i++) if (!g.goalSet[i]) return false;
    return true;
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'lines', order: 6, title: '星塵連線', legacy: ['connect-lines.html'],
    init: function (nes) {
      nes0 = nes;
      art = LN.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'lines_bg');
      NES.CHR.setPattern(1, 'lines_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(PAL.bd);
      for (i = 0; i < 4; i++) { ppu.setBgPalette(i, PAL.bg[i]); ppu.setSprPalette(i, PAL.spr[i]); }
      GAME.backTile = { tile: art.s('DOT'), pal: 1 };
      AU.init(nes);
      g = newState();
      var qs = CT.query ? CT.query('seed') : null;
      g.randSeed = qs ? (parseInt(qs, 10) >>> 0) : 20261113;
      var lv = CT.query ? parseInt(CT.query('level') || '', 10) : NaN;
      if (qs && CT.query('direct') === '1') startLevel(-1, g.randSeed);
      else if (lv >= 1 && lv <= LN.LEVELS.length) { g.lsel = lv - 1; startLevel(lv - 1, 0); }
      else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        var d = dpad(I);
        if (d === 'U' || d === 'D') { g.sel = (g.sel + (d === 'D' ? 1 : -1) + MENU.length) % MENU.length; AU.sfx('lines_move'); }
        if (startPressed(I) || I.pressed(BTN.A)) {
          AU.sfx('lines_ok');
          if (g.sel === 0) enterSelect();
          else if (g.sel === 1) startLevel(-1, g.randSeed);
          else enterHelp();
        }
      } else if (g.mode === 'help') {
        g.t++;
        if (g.t > 10 && (startPressed(I) || I.pressed(BTN.A) || I.pressed(BTN.B))) enterTitle();
      } else if (g.mode === 'select') {
        g.t++;
        var d2 = dpad(I);
        if (d2) moveSel(d2);
        if (startPressed(I) || I.pressed(BTN.A)) { AU.sfx('lines_ok'); startLevel(g.lsel, 0); }
        else if (I.pressed(BTN.B)) enterTitle();
      } else if (g.mode === 'clear') {
        g.t++; g.clearT++;
        if (g.clearT > 20) {
          if (I.pressed(BTN.A) || startPressed(I)) {
            var P = g.P;
            if (P.idx < 0) { g.randSeed = (g.randSeed + 1) >>> 0; startLevel(-1, g.randSeed); }
            else if (P.idx + 1 < LN.LEVELS.length) { g.lsel = P.idx + 1; startLevel(P.idx + 1, 0); }
            else startLevel(P.idx, 0);
          } else if (I.pressed(BTN.B)) { if (g.P.idx >= 0) g.lsel = g.P.idx; enterSelect(); }
        }
      } else updatePlay(I);
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title' && (g.t & 31) === 0) text(11, 26, (g.t & 32) ? '          ' : 'PUSH START');
      flush();
      drawSprites();
    },
    state: function () {
      var P = g.P, done = 0;
      if (P && g.mode !== 'title' && g.mode !== 'select' && g.mode !== 'help') for (var k = 0; k < P.ncol; k++) if (complete(k)) done++;
      return {
        mode: g.mode, sel: g.sel, lsel: g.lsel, paused: g.paused, t: g.t, queue: g.q.length + g.qa.length,
        level: P ? P.idx : null, w: P ? P.w : 0, h: P ? P.h : 0, ncol: P ? P.ncol : 0, links: done,
        pen: g.pen, cx: g.cx, cy: g.cy, time: g.time, hints: g.hints, stars: g.stars, cleared: g.cleared,
        cheatUsed: g.cheatUsed, goalSet: Object.keys(g.goalSet).map(Number), undo: g.undo.length,
        goal: goalOk()
      };
    },
    exit: function () { AU.stop(); },
    cheat: function () { if (!g || g.mode !== 'play') return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { var s = pad(clearedCount(), 2) + '/' + LN.LEVELS.length; while (s.length < 6) s = ' ' + s; return s; }
  };
  LN.CHAPTERS = CHAPTERS;
  LN.GOAL_LEVELS = GOAL_LEVELS;
  LN.dev = {
    g: function () { return g; }, start: function (i, seed) { startLevel(i, seed || 0); }, title: function () { enterTitle(); },
    select: function () { enterSelect(); }, paths: function () { return g.paths; }, sol: function () { return g.P && g.P.sol; },
    solved: function () { return solved(); }, cellLook: function (c) { return cellLook(c, occupancy()); }, puzzle: function () { return g.P; },
    occupancy: function () { return occupancy(); }
  };
  if (CT.register) CT.register(GAME);
})();
