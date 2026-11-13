/*
 * games/cart3/lines/art.js — 《星塵連線 STAR LINK》CHR（全部原創、程式化）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 一格 = 16×16 px = 2×2 磁磚 = 剛好一個屬性區 ⇒ 每格的線色由屬性（調色盤組）+ 磁磚裡的色號（2 / 3）決定，
 *   色號 1 = 各組共用的暗灰（格點 / 星門框 / 橋欄）。8 色 = 4 組 × 2 色。
 * 格子種類（每種畫成 16×16 再切 4 塊，**以內容去重**後才進 bank）：
 *   空格（四角格點）、線段（中心 + ≤ 2 個方向）、星珠端點（+ ≤ 1 個方向）、星橋（橫色 a × 直色 b，各 0/2/3）、
 *   星門（空 / 有線 + ≤ 1 個方向）
 * 背景 bank `lines_bg`；精靈 bank `lines_spr`（游標四角、筆尖星、回選單提示點）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var LN = CT.Lines = CT.Lines || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  var DIRS = ['U', 'R', 'D', 'L'];
  function px16() { var a = []; for (var y = 0; y < 16; y++) { a.push(new Uint8Array(16)); } return a; }
  function rect(p, x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) p[y][x] = c; }
  function disc(p, cx, cy, r2, c) { for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r2) p[y][x] = c; } }
  function stroke(p, d, c, from) {
    from = from || 0;
    if (d === 'U') rect(p, 6, 0, 9, 7 - from, c);
    if (d === 'D') rect(p, 6, 8 + from, 9, 15, c);
    if (d === 'L') rect(p, 0, 6, 7 - from, 9, c);
    if (d === 'R') rect(p, 8 + from, 6, 15, 9, c);
  }
  function dots(p) { p[0][0] = 1; p[0][15] = 1; p[15][0] = 1; p[15][15] = 1; }

  // 各種格子 → 16×16 像素
  function cellEmpty() { var p = px16(); dots(p); p[7][7] = 1; return p; }
  function cellLine(dirs, ci) {
    var p = px16(); dots(p);
    rect(p, 6, 6, 9, 9, ci);
    for (var i = 0; i < dirs.length; i++) stroke(p, dirs[i], ci);
    return p;
  }
  function cellEnd(dir, ci) {
    var p = px16();
    if (dir) stroke(p, dir, ci);
    disc(p, 7.5, 7.5, 34, ci);
    disc(p, 7.5, 7.5, 8, 0);
    rect(p, 7, 7, 8, 8, 1);
    p[3][7] = 1; p[3][8] = 1;
    return p;
  }
  function cellBridge(a, b) {
    var p = px16();
    // 欄杆（暗灰）：中央十字外框
    rect(p, 4, 4, 11, 4, 1); rect(p, 4, 11, 11, 11, 1); rect(p, 4, 4, 4, 11, 1); rect(p, 11, 4, 11, 11, 1);
    if (b) { rect(p, 6, 0, 9, 4, b); rect(p, 6, 11, 9, 15, b); rect(p, 6, 5, 9, 10, b); }
    if (a) { rect(p, 0, 5, 15, 10, 0); rect(p, 0, 6, 15, 9, a); if (b) { rect(p, 6, 5, 9, 5, 0); rect(p, 6, 10, 9, 10, 0); } }
    return p;
  }
  function cellGate(dir, ci) {
    var p = px16(), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d >= 6 && d <= 7.5) p[y][x] = 1;
    }
    if (ci) {
      if (dir) stroke(p, dir, ci, 0);
      disc(p, 7.5, 7.5, 9, ci);
      rect(p, 7, 7, 8, 8, 0);
    } else { p[7][7] = 1; p[8][8] = 1; p[7][8] = 1; p[8][7] = 1; }
    return p;
  }

  // 去重：磁磚內容字串 → bank 名稱
  var BG = {}, contentName = {}, nTiles = 0;
  function tileKey(t) { return Array.prototype.join.call(t, ''); }
  function addTile(t) {
    var k = tileKey(t);
    if (contentName[k]) return contentName[k];
    var nm = 'T' + (nTiles++);
    BG[nm] = t; contentName[k] = nm;
    return nm;
  }
  function quarter(p, q) {
    var t = new Uint8Array(64), ox = (q & 1) * 8, oy = (q >> 1) * 8;
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = p[oy + y][ox + x];
    return t;
  }
  var CELLS = {};      // 格子鍵 → [4 個 bank 名稱]
  function addCell(key, p) { CELLS[key] = [0, 1, 2, 3].map(function (q) { return addTile(quarter(p, q)); }); }

  addTile(new Uint8Array(64));                 // T0 = 全空（名稱表清空 = 0）
  // 字型
  var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()^\'';
  var FONTN = {};
  for (var i = 0; i < USED.length; i++) {
    var n = CHARMAP[USED.charAt(i)];
    if (n && FONT[n] && !FONTN[n]) FONTN[n] = addTile(CHR.tile ? CHR.tile(FONT[n]) : FONT[n]);
  }
  // 框（色 1 細線 + 色 3 角星）
  function rowsTile(rows) { return CHR.tile(rows); }
  var FR = {
    H: addTile(rowsTile(['........', '........', '........', '11111111', '........', '........', '........', '........'])),
    V: addTile(rowsTile(['...1....', '...1....', '...1....', '...1....', '...1....', '...1....', '...1....', '...1....'])),
    C: addTile(rowsTile(['........', '...3....', '..333...', '.33133..', '..333...', '...3....', '........', '........'])),
    ST1: addTile(rowsTile(['........', '........', '........', '....1...', '........', '........', '........', '........'])),
    ST2: addTile(rowsTile(['........', '.3......', '........', '........', '........', '........', '......1.', '........']))
  };

  addCell('E', cellEmpty());
  var SUBS = [[]];
  DIRS.forEach(function (d) { SUBS.push([d]); });
  for (var a = 0; a < 4; a++) for (var b = a + 1; b < 4; b++) SUBS.push([DIRS[a], DIRS[b]]);
  [2, 3].forEach(function (ci) {
    SUBS.forEach(function (s) { addCell('L' + ci + s.join(''), cellLine(s, ci)); });
    ['', 'U', 'R', 'D', 'L'].forEach(function (d) { addCell('P' + ci + d, cellEnd(d, ci)); addCell('G' + ci + d, cellGate(d, ci)); });
  });
  addCell('G0', cellGate('', 0));
  [0, 2, 3].forEach(function (aa) { [0, 1, 2, 3].forEach(function (bb) { if (bb === 1 && !aa) return; addCell('B' + aa + bb, cellBridge(aa, bb)); }); });

  /* ---------------- 精靈 ---------------- */
  var SPR = {
    BLANK: ['........', '........', '........', '........', '........', '........', '........', '........'],
    TL: ['3333....', '3.......', '3.......', '3.......', '........', '........', '........', '........'],
    TR: ['....3333', '.......3', '.......3', '.......3', '........', '........', '........', '........'],
    BL: ['........', '........', '........', '........', '3.......', '3.......', '3.......', '3333....'],
    BR: ['........', '........', '........', '........', '.......3', '.......3', '.......3', '....3333'],
    TLP: ['33333...', '322.....', '32......', '3.......', '3.......', '........', '........', '........'],
    TRP: ['...33333', '.....223', '......23', '.......3', '.......3', '........', '........', '........'],
    BLP: ['........', '........', '........', '3.......', '3.......', '32......', '322.....', '33333...'],
    BRP: ['........', '........', '........', '.......3', '.......3', '......23', '.....223', '...33333'],
    PEN: ['...3....', '...3....', '.33233..', '3322233.', '.33233..', '...3....', '...3....', '........'],
    DOT: ['........', '..33....', '.3333...', '.3333...', '..33....', '........', '........', '........']
  };

  var made = null;
  LN.Art = {
    CELLS: CELLS,
    make: function () {
      if (made) return made;
      var bg = CHR.bank('lines_bg', BG), spr = CHR.bank('lines_spr', SPR);
      var cellIdx = {};
      Object.keys(CELLS).forEach(function (k) { cellIdx[k] = CELLS[k].map(function (nm) { return bg.index(nm); }); });
      made = {
        bg: bg, spr: spr, cells: cellIdx, frame: {},
        t: function (n) { return bg.index(n); },
        s: function (n) { return spr.index(n); },
        cell: function (k) { return cellIdx[k] || cellIdx.E; },
        ch: function (c) {
          if (c === '★') c = '$';
          if (c === ' ') return 0;
          var nm = CHARMAP[c];
          if (nm === undefined && c >= 'a' && c <= 'z') nm = CHARMAP[c.toUpperCase()];
          return (nm && FONTN[nm]) ? bg.index(FONTN[nm]) : 0;
        },
        text: function (s) { var o = []; for (var i2 = 0; i2 < s.length; i2++) o.push(made.ch(s.charAt(i2))); return o; }
      };
      Object.keys(FR).forEach(function (k) { made.frame[k] = bg.index(FR[k]); });
      return made;
    }
  };
})();
