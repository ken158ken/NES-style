/*
 * games/cart4/flash/art.js — 《星塵閃記 STAR FLASH》CHR（全部原創；程式化幾何）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * PPU 規劃：
 *   大格 = 4×4 磁磚（32×32，= 2×2 屬性區塊，擺在偶數欄列）：CF0..15 共用框（色 1 框 / 色 2 底），中間 2×2 換圖。
 *   小格 = 2×2 磁磚（16×16，= 1 個屬性區塊）：SC_<狀態>_0..3（競速模式左右兩盤）。
 *   狀態靠「調色盤 + 形狀」雙重區分（色弱 / 灰階也分得出）：
 *     EMP 空格（暗、中心小點）／LIT 亮起（實心星）／MRK 你點的（菱形）／BAD 點錯（叉）／MIS 漏掉的（空心星）。
 *   找差異模式的 8 種符號 SY_<k>（色 3，靠調色盤上 4 種顏色：白 / 粉紅 / 綠 / 黃）：
 *     0 圓 / 1 三角 / 2 方 / 3 星 / 4 十字 / 5 新月 / 6 心 / 7 環
 * 背景磚（flash_bg）：F_* 字型、BH / BHB / BV / BVR 外框、ST1 / ST2 星點、BIG_<字> 標題大字、上述格子磚。
 * 精靈（flash_spr）：CUR 游標角、CHK 找到的勾、XX 點錯的叉、RING 提示圈、DOT（backTile）、ARW 選單箭頭
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var FL = CT.Flash = CT.Flash || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function canvas(w, h, v) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(v || 0); } return a; }
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
  function set(px, x, y, v) { x = Math.round(x); y = Math.round(y); if (px[y] && x >= 0 && x < px[y].length) px[y][x] = v; }
  function rect(px, x0, y0, x1, y1, v) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set(px, x, y, v); }
  function disc(px, cx, cy, r, v) {
    for (var y = 0; y < px.length; y++) for (var x = 0; x < px[0].length; x++) {
      var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) px[y][x] = v;
    }
  }
  function poly(px, pts, v) {
    for (var y = 0; y < px.length; y++) for (var x = 0; x < px[0].length; x++) {
      var X = x + 0.5, Y = y + 0.5, inside = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > Y) !== (yj > Y)) && (X < (xj - xi) * (Y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) px[y][x] = v;
    }
  }
  function line(px, x0, y0, x1, y1, v) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (var i = 0; i <= n; i++) set(px, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, v);
  }
  // 只描在「底色 = bgv」的格子上（符號畫在色 2 底上，描邊 = 色 1）
  function outlineOn(px, v, bgv, src) {
    var h = px.length, w = px[0].length;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y][x] || px[y][x] !== bgv) continue;
      if ((x > 0 && src[y][x - 1]) || (x < w - 1 && src[y][x + 1]) || (y > 0 && src[y - 1][x]) || (y < h - 1 && src[y + 1][x])) px[y][x] = v;
    }
  }
  function star5(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
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

  /* ---------------- 圖形（size×size，畫在 v=3 的 mask 上） ---------------- */
  function shapeMask(kind, S) {
    var m = canvas(S, S), c = S / 2, r = S / 2 - 1.5;
    if (S === 10 && (kind === 'star' || kind === 'hstar')) {   // 小格的星手繪（程式化在 10 px 下太糊）
      var ROWS = kind === 'star'
        ? ['....33....', '...3333...', '...3333...', '3333333333', '.33333333.', '..333333..', '..333333..', '.33333333.', '.333..333.', '.3......3.']
        : ['....33....', '...3..3...', '...3..3...', '3333..3333', '.3......3.', '..3....3..', '..3....3..', '.3..33..3.', '.3.3..3.3.', '.33....33.'];
      for (var yy = 0; yy < 10; yy++) for (var xx = 0; xx < 10; xx++) if (ROWS[yy].charAt(xx) === '3') m[yy][xx] = 3;
      return m;
    }
    switch (kind) {
      case 'star': poly(m, star5(c, c + 0.6, r + 0.6, r * 0.45), 3); break;
      case 'hstar': poly(m, star5(c, c + 0.6, r + 0.6, r * 0.45), 3); poly(m, star5(c, c + 0.6, (r + 0.6) * 0.5, r * 0.22), 0); break;
      case 'diamond': poly(m, [[c, c - r], [c + r, c], [c, c + r], [c - r, c]], 3); disc(m, c, c, r * 0.28, 0); break;
      case 'x': line(m, c - r + 1, c - r + 1, c + r - 1, c + r - 1, 3); line(m, c - r + 1, c + r - 1, c + r - 1, c - r + 1, 3);
        line(m, c - r + 2, c - r + 1, c + r - 1, c + r - 2, 3); line(m, c - r + 1, c + r - 2, c + r - 2, c - r + 1, 3); break;
      case 'dot': disc(m, c, c, Math.max(1, S / 10), 3); break;
      // 找差異符號
      case 's0': disc(m, c, c, r, 3); break;
      case 's1': poly(m, [[c, c - r], [c + r, c + r * 0.8], [c - r, c + r * 0.8]], 3); break;
      case 's2': rect(m, Math.round(c - r * 0.8), Math.round(c - r * 0.8), Math.round(c + r * 0.8) - 1, Math.round(c + r * 0.8) - 1, 3); break;
      case 's3': poly(m, star5(c, c + 0.6, r + 0.6, r * 0.45), 3); break;
      case 's4': rect(m, Math.round(c - r * 0.3), Math.round(c - r), Math.round(c + r * 0.3) - 1, Math.round(c + r) - 1, 3); rect(m, Math.round(c - r), Math.round(c - r * 0.3), Math.round(c + r) - 1, Math.round(c + r * 0.3) - 1, 3); break;
      case 's5': disc(m, c, c, r, 3); disc(m, c + r * 0.55, c - r * 0.35, r * 0.85, 0); break;
      case 's6': disc(m, c - r * 0.45, c - r * 0.25, r * 0.55, 3); disc(m, c + r * 0.45, c - r * 0.25, r * 0.55, 3); poly(m, [[c - r * 0.98, c - r * 0.1], [c + r * 0.98, c - r * 0.1], [c, c + r]], 3); break;
      case 's7': disc(m, c, c, r, 3); disc(m, c, c, r * 0.5, 0); break;
    }
    return m;
  }
  // 中心 16×16（大格中間 2×2 磁磚）：底色 2 + 圖形 3 + 描邊 1
  function centerArt(kind) {
    var px = canvas(16, 16, 2), m = shapeMask(kind, 16);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) if (m[y][x]) px[y][x] = 3;
    if (kind !== 'dot') outlineOn(px, 1, 2, m);
    return px;
  }
  // 大格框 32×32：外 1 px 縫、色 1 圓角框、色 2 底、內側高光（色 3 左上 1 px 線）
  function cellFrame() {
    var px = canvas(32, 32), x, y;
    rect(px, 1, 1, 30, 30, 1);
    rect(px, 3, 3, 28, 28, 2);
    for (x = 5; x <= 26; x++) px[2][x] = 2;          // 上緣一道底色缺口 = 立體感（不用色 3：找差異模式色 3 是符號色）
    px[1][1] = 0; px[1][30] = 0; px[30][1] = 0; px[30][30] = 0;
    return px;
  }
  // 小格 16×16：外 1 px 縫、色 1 框、色 2 底、中央 10×10 圖形
  function smallCell(kind) {
    var px = canvas(16, 16), x, y;
    rect(px, 1, 1, 14, 14, 1);
    rect(px, 2, 2, 13, 13, 2);
    px[1][1] = 0; px[1][14] = 0; px[14][1] = 0; px[14][14] = 0;
    var m = shapeMask(kind, 10), src = canvas(16, 16);
    for (y = 0; y < 10; y++) for (x = 0; x < 10; x++) if (m[y][x]) { px[y + 3][x + 3] = 3; src[y + 3][x + 3] = 3; }
    if (kind !== 'dot') outlineOn(px, 1, 2, src);
    return px;
  }

  /* ---------------- BG bank ---------------- */
  var BG = { SP: E8() };
  (function () {
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()^\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n] && !BG['F_' + n]) BG['F_' + n] = FONT[n];
    }
  })();
  BG.BH = ['........', '11111111', '........', '22222222', '........', '........', '........', '........'];
  BG.BHB = ['........', '........', '........', '........', '22222222', '........', '11111111', '........'];
  BG.BV = ['.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....'];
  BG.BVR = ['....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.'];
  BG.ST1 = ['........', '........', '........', '....3...', '........', '........', '........', '........'];
  BG.ST2 = ['........', '.1......', '........', '........', '........', '........', '......1.', '........'];
  function add(prefix, tiles) { tiles.forEach(function (t, i) { BG[prefix + i] = t; }); }
  add('CF', slice(cellFrame()));
  var STATES = { EMP: 'dot', LIT: 'star', MRK: 'diamond', BAD: 'x', MIS: 'hstar' };
  Object.keys(STATES).forEach(function (k) { add('C_' + k + '_', slice(centerArt(STATES[k]))); add('SC_' + k + '_', slice(smallCell(STATES[k]))); });
  for (var s = 0; s < 8; s++) add('SY_' + s + '_', slice(centerArt('s' + s)));
  'STARFLH'.split('').forEach(function (ch) { if (!BG['BIG_' + ch + '0']) add('BIG_' + ch, slice(bigGlyph(FONT[CHARMAP[ch]]))); });

  /* ---------------- 精靈 ---------------- */
  var SPR = { SP: E8() };
  SPR.CUR = ['3333....', '3222....', '32......', '32......', '........', '........', '........', '........'];
  SPR.CHK = ['......33', '.....332', '3...332.', '33.332..', '23332...', '.232....', '..2.....', '........'];
  SPR.XX = ['33....33', '332..332', '.332332.', '..3332..', '..2333..', '.233.33.', '332..233', '33....33'];
  SPR.RING = ['..3333..', '.3....3.', '3......3', '3......3', '3......3', '3......3', '.3....3.', '..3333..'];
  SPR.DOT = ['........', '..33....', '.3223...', '.3223...', '..33....', '........', '........', '........'];
  SPR.ARW = ['........', '.33.....', '.3233...', '.322233.', '.3233...', '.33.....', '........', '........'];

  var made = null;
  FL.Art = {
    STATES: Object.keys(STATES),
    make: function () {
      if (made) return made;
      var bg = CHR.bank('flash_bg', BG), spr = CHR.bank('flash_spr', SPR);
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
