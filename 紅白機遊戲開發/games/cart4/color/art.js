/*
 * games/cart4/color/art.js — 《星塵色感 HUE SENSE》CHR（全部原創；程式化 + 手繪）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-0 cart4-shell+color（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 背景磚（color_bg）：
 *   F_*            字型（色 3）
 *   BIG_<字>0..3   16×16 大字（色 1 描邊陰影 / 色 2 本體 / 色 3 上緣高光）：色字題目與標題共用；
 *                  色字題目時第 3 組 BG 調色盤 = [$00 灰陰影, 墨色, 墨色] ⇒ 整個字只有一種墨色
 *   SH_<k>_0..3    6 種色鍵的形狀標記（16×16）：k = 0 紅● / 1 藍■ / 2 綠▲ / 3 黃★ / 4 粉◆ / 5 白✚，
 *                  各自畫在固定的調色盤色號（紅藍綠 = BG1 的 1/2/3、黃粉白 = BG2 的 1/2/3）⇒ 色弱也能靠形狀分
 *   SOL1..3        實心磚（色塊衝刺 / 調色的色塊）；QM_0..3 大問號（記憶回合蓋住目標色）
 *   TB0..8         計時條（0~8 px 填滿，色 3）
 *   BH/BHB/BV/BVR  外框；ST1/ST2 背景星點；PADC 十字鍵中心
 * 精靈（color_spr）：MK_<k>_0..3 形狀標記（色 3 = 墨色、色 1 = 白描邊；SHAPE ASSIST 用）、
 *   ARW 箭頭、CUR 游標角、DOT（backTile）、SPK 閃光、TICK 調色刻度指針
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CO = CT.Color = CT.Color || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function canvas(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(0); } return a; }
  function slice(px) {
    var h = px.length, w = px[0].length, out = [];
    for (var ty = 0; ty < h / 8; ty++) for (var tx = 0; tx < w / 8; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  function fill8(c) { var r = ''; for (var i = 0; i < 8; i++) r += c; return [r, r, r, r, r, r, r, r]; }
  function outline(px, v) {
    var h = px.length, w = px[0].length, src = px.map(function (r) { return r.slice(); });
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y][x]) continue;
      if ((x > 0 && src[y][x - 1]) || (x < w - 1 && src[y][x + 1]) || (y > 0 && src[y - 1][x]) || (y < h - 1 && src[y + 1][x])) px[y][x] = v;
    }
  }
  // 8×8 字身放大 2×：本體色 2、上 3 列高光 3、右下陰影 1
  function bigGlyph(g) {
    var px = canvas(16, 16), i, j, dx, dy, X, Y;
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (!g || g[j].charAt(i) === '.') continue;
      for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
        X = i * 2 + dx - 1; Y = j * 2 + dy;
        if (Y + 1 < 16 && X + 1 < 16 && X + 1 >= 0 && px[Y + 1][X + 1] === 0) px[Y + 1][X + 1] = 1;
        if (X >= 0) px[Y][X] = j < 3 ? 3 : 2;
      }
    }
    return px;
  }

  /* ---------------- 形狀 16×16（on = 形狀內）：0 圓 / 1 方 / 2 三角 / 3 星 / 4 菱 / 5 十字 ---------------- */
  function inShape(k, x, y) {
    var dx = x - 7.5, dy = y - 7.5, r, a;
    if (k === 0) return dx * dx + dy * dy <= 6.6 * 6.6;
    if (k === 1) return x >= 2 && x <= 13 && y >= 2 && y <= 13;
    if (k === 2) return y >= 2 && y <= 14 && Math.abs(dx) <= (y - 1) * 0.55;
    if (k === 3) { r = Math.sqrt(dx * dx + dy * dy); a = Math.atan2(dy, dx); return r <= 3.4 + 4.0 * Math.max(0, Math.cos((a + Math.PI / 2) * 5)) * 0.95; }
    if (k === 4) return Math.abs(dx) + Math.abs(dy) <= 7.2;
    return (Math.abs(dx) <= 2.6 && Math.abs(dy) <= 7) || (Math.abs(dy) <= 2.6 && Math.abs(dx) <= 7);
  }
  function shapePx(k, v, ol) {
    var px = canvas(16, 16), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (inShape(k, x, y)) px[y][x] = v;
    if (ol) outline(px, ol);
    return px;
  }
  // BG 形狀標記：紅藍綠 = 色 1/2/3（BG1）、黃粉白 = 色 1/2/3（BG2）
  var SHAPE_IDX = [1, 2, 3, 1, 2, 3];

  /* ---------------- BG bank ---------------- */
  var BG = { SP: E8() };
  (function () {
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()^\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n] && !BG['F_' + n]) BG['F_' + n] = FONT[n];
    }
  })();
  BG.BH = ['........', '11111111', '........', '11111111', '........', '........', '........', '........'];
  BG.BHB = ['........', '........', '........', '........', '11111111', '........', '11111111', '........'];
  BG.BV = ['.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....'];
  BG.BVR = ['....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.'];
  BG.ST1 = ['........', '........', '........', '....3...', '........', '........', '........', '........'];
  BG.ST2 = ['........', '.1......', '........', '........', '........', '........', '......1.', '........'];
  BG.SOL1 = fill8('1'); BG.SOL2 = fill8('2'); BG.SOL3 = fill8('3');
  BG.PADC = ['..1111..', '.1....1.', '1......1', '1..11..1', '1..11..1', '1......1', '.1....1.', '..1111..'];
  for (var p = 0; p <= 8; p++) {
    var row = '';
    for (var q = 0; q < 8; q++) row += q < p ? '3' : '.';
    BG['TB' + p] = ['........', '11111111', row.replace(/\./g, '.'), row, row, row, '11111111', '........'];
  }
  function add(prefix, tiles) { tiles.forEach(function (t, i) { BG[prefix + i] = t; }); }
  // 大字：色名 RED BLUE GREEN YELLOW PINK WHITE + 標題 HUE SENSE 用到的字母
  'REDBLUGNYOWPIKHTSC'.split('').forEach(function (ch) {
    if (!BG['BIG_' + ch + '0']) add('BIG_' + ch, slice(bigGlyph(FONT[CHARMAP[ch]])));
  });
  for (var k = 0; k < 6; k++) add('SH_' + k + '_', slice(shapePx(k, SHAPE_IDX[k], 0)));
  // 大問號（記憶回合蓋住目標色；色 3 on 色 1 底）
  (function () {
    var px = canvas(16, 16), x, y, g = FONT[CHARMAP['?']];
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) px[y][x] = 1;
    if (g) for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) if (g[y].charAt(x) !== '.') {
      px[y * 2][x * 2] = 3; px[y * 2 + 1][x * 2] = 3; px[y * 2][x * 2 + 1] = 3; px[y * 2 + 1][x * 2 + 1] = 3;
    }
    add('QM_', slice(px));
  })();

  /* ---------------- 精靈 ---------------- */
  var SPR = { SP: E8() };
  for (k = 0; k < 6; k++) slice(shapePx(k, 3, 1)).forEach(function (t, j) { SPR['MK_' + k + '_' + j] = t; });
  SPR.ARW = ['........', '.33.....', '.3333...', '.333333.', '.3333...', '.33.....', '........', '........'];
  SPR.CUR = ['3333....', '3.......', '3.......', '3.......', '........', '........', '........', '........'];
  SPR.DOT = ['........', '..33....', '.3333...', '.3333...', '..33....', '........', '........', '........'];
  SPR.SPK = ['...3....', '...3....', '.33133..', '...3....', '...3....', '........', '........', '........'];
  SPR.TICK = ['...3....', '..333...', '.33333..', '3333333.', '........', '........', '........', '........'];

  var made = null;
  CO.Art = {
    inShape: inShape, SHAPE_IDX: SHAPE_IDX,
    make: function () {
      if (made) return made;
      var bg = CHR.bank('color_bg', BG), spr = CHR.bank('color_spr', SPR);
      made = {
        bg: bg, spr: spr,
        t: function (n) { return bg.index(n); },
        s: function (n) { return spr.index(n); },
        ch: function (c) {
          if (c === '★') c = '$';
          if (c === ' ') return 0;
          var n = CHARMAP[c];
          if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
          return (n && bg.has('F_' + n)) ? bg.index('F_' + n) : 0;
        },
        text: function (s) { var o = []; for (var i = 0; i < s.length; i++) o.push(made.ch(s.charAt(i))); return o; }
      };
      return made;
    }
  };
})();
