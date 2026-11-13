/*
 * games/cart3/lines/art.js — 《星塵連線 STAR LINK》CHR（全部原創、程式化）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 一格 = 16×16 px = 2×2 磁磚 = 剛好一個屬性區 ⇒ 每格的線色由屬性（調色盤組）+ 磁磚裡的色號（2 / 3）決定，
 *   色號 1 = 各組共用的亮灰 $10（格點 / 有線經過時的橋欄、門框、鏡面）。8 色 = 4 組 × 2 色。
 * fix-r7（P2-1）：**空的機關用亮色畫**（屬性借某一組的色 3）：星橋 = 白欄杆 + 紅柱（組 0）、星門 = 青色傳送環（組 2）、
 *   星鏡 = 金色斜鏡（組 1）；有線經過後改用亮灰（色 1）畫結構、線用自己的顏色。星橋還沒被兩條線填滿時欄杆閃爍（另一組磁磚）。
 *   星橋畫成「從上往下看的橋」：橫線走在橋面上（上下各 1 px 黑邊），直線從欄杆底下鑽過 ⇒ 一眼看出立體交叉。
 * 格子種類（每種畫成 16×16 再切 4 塊，**以內容去重**後才進 bank）：
 *   空格（四角格點）、線段（中心 + ≤ 2 個方向）、星珠端點（+ ≤ 1 個方向）、星橋（橫色 a × 直色 b，各 0/2/3，× 閃爍）、
 *   星門（空 / 有線 + ≤ 1 個方向）、星鏡（/ 或 \：空 / 有線（成對的兩個方向 A、B））
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
  // 星橋：b = 直線色（0 無 / 1 錯組亮灰 / 2 / 3）、a = 橫線色（0 / 2 / 3）；blink = 閃爍相位（欄杆換色）
  function cellBridge(a, b, blink) {
    var p = px16(), empty = !a && !b;
    var rail = empty ? (blink ? 1 : 3) : (blink ? (a || b) : 1), post = empty ? 2 : rail;   // 只有一條線 ⇒ 欄杆在亮灰 / 該線色之間閃
    if (b) rect(p, 6, 0, 9, 15, b);                                    // 直線（在橋底下）
    rect(p, 1, 2, 14, 3, rail); rect(p, 1, 12, 14, 13, rail);          // 兩道欄杆（壓在直線上 ⇒ 直線從底下鑽過）
    rect(p, 0, 1, 2, 4, post); rect(p, 13, 1, 15, 4, post); rect(p, 0, 11, 2, 14, post); rect(p, 13, 11, 15, 14, post);
    if (empty) { for (var x = 4; x <= 11; x += 3) rect(p, x, 5, x, 10, 1); }   // 空橋：橋面木板
    if (a) { rect(p, 0, 5, 15, 10, 0); rect(p, 0, 6, 15, 9, a); }      // 橫線（在橋面上，上下黑邊）
    return p;
  }
  // 星門：空 = 青色傳送環（色 3）+ 內圈亮灰；有線 = 亮灰環 + 線色核心 + ≤ 1 個方向
  function cellGate(dir, ci) {
    var p = px16(), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d >= 5.5 && d <= 7.5) p[y][x] = ci ? 1 : 3;
      else if (!ci && d >= 2.5 && d <= 3.5) p[y][x] = 1;
    }
    if (ci) {
      if (dir) stroke(p, dir, ci, 0);
      disc(p, 7.5, 7.5, 12, ci);
      rect(p, 7, 7, 8, 8, 0);
    } else { rect(p, 7, 7, 8, 8, 3); }
    return p;
  }
  // 星鏡：t 1 = /、2 = \（\ = / 左右鏡射）；pair 'A'（/：左+上）/ 'B'（/：右+下）/ ''（空）
  function cellMirror(t, ci, pair) {
    var p = px16(), x, y;
    if (!ci) {
      dots(p);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var s = x + y;
        if (x >= 1 && x <= 14 && y >= 1 && y <= 14) { if (s >= 13 && s <= 16) p[y][x] = 3; else if (s === 12 || s === 17 || s === 18) p[y][x] = 1; }
      }
    } else {
      var A = pair === 'A';
      rect(p, 6, 6, 9, 9, ci);
      stroke(p, A ? 'L' : 'R', ci); stroke(p, A ? 'U' : 'D', ci);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var s2 = x + y;
        if (A ? s2 >= 20 && s2 <= 23 && x >= 5 && y >= 5 : s2 >= 7 && s2 <= 10 && x <= 10 && y <= 10) p[y][x] = 1;
      }
    }
    if (t === 2) for (y = 0; y < 16; y++) p[y].reverse();
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
  // 星橋：B<橫><直>，還沒被兩條線填滿的另有閃爍版 B<橫><直>x
  [0, 2, 3].forEach(function (aa) { [0, 1, 2, 3].forEach(function (bb) {
    if (bb === 1 && !aa) return;
    addCell('B' + aa + bb, cellBridge(aa, bb, 0));
    if (!aa || !bb) addCell('B' + aa + bb + 'x', cellBridge(aa, bb, 1));
  }); });
  // 星鏡：M<t>0（空）、M<t><色號><A|B>
  [1, 2].forEach(function (t) {
    addCell('M' + t + '0', cellMirror(t, 0, ''));
    [2, 3].forEach(function (ci) { ['A', 'B'].forEach(function (pr) { addCell('M' + t + ci + pr, cellMirror(t, ci, pr)); }); });
  });

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
