/*
 * games/cart4/reflex/art.js — 《星塵反應 STAR REFLEX》CHR（全部原創；程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 場景：「星港訊號站」——中央一盞 48×48 的訊號燈（外框 + 玻璃罩，燈色靠換調色盤；中央 16×16 是形狀標記，
 *   顏色反應模式同時用形狀區分顏色，色弱也能玩）、四個方位的 32×32 訊號艙（選擇反應，亮哪個按哪個方向）、
 *   32×32 大箭頭精靈（方向挑戰：實心 = 照箭頭方向、空心 = 反方向）。
 * 背景 bank reflex_bg：F_* 字、BIG_*0..3 標題大字、LP_0..35 訊號燈（中央 4 磚另用 MK_<形狀>_0..3）、
 *   POD_0..15（艙框，中央 4 磚 PA_<方向>_0..3）、HUB_0..3、SH_<形狀>（HUD 8×8 形狀小圖）、FR_H、K_A/K_B/K_U/K_D/K_L/K_R、ST1/ST2。
 * 精靈 bank reflex_spr：AU_0..15（實心上箭頭）、AR_0..15（實心右箭頭）、OU_0..15 / OR_0..15（空心）、BACK、SPARK。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var RX = CT.Reflex = CT.Reflex || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = { ' ': 'SP', '-': 'DASH', '!': 'EXCL', '/': 'SLASH', '+': 'PLUS', 'x': 'MUL', ':': 'COLON', '%': 'PCT',
                  '$': 'STAR', '★': 'STAR', '.': 'DOT', '=': 'EQ', '?': 'QUEST', '>': 'ARROW', ',': 'COMMA', '(': 'LPAREN', ')': 'RPAREN', "'": 'APOS' };
  (function () {
    var i;
    for (i = 0; i <= 9; i++) CHARMAP[String(i)] = 'N' + i;
    for (i = 65; i <= 90; i++) CHARMAP[String.fromCharCode(i)] = String.fromCharCode(i);
  })();
  var KEYCH = { '↑': 'K_U', '↓': 'K_D', '←': 'K_L', '→': 'K_R', 'Ⓐ': 'K_A', 'Ⓑ': 'K_B', '●': 'SH_0', '■': 'SH_1', '▲': 'SH_2', '✕': 'SH_3', '◆': 'SH_4' };
  var SHAPES = ['CIRCLE', 'SQUARE', 'TRIANGLE', 'CROSS', 'DIAMOND'];

  function buf(w, h) { var a = []; for (var y = 0; y < h; y++) { var r = []; for (var x = 0; x < w; x++) r.push(0); a.push(r); } return a; }
  function px(b, x, y, v) { if (y >= 0 && y < b.length && x >= 0 && x < b[0].length) b[y][x] = v; }
  function cut(b, w, h) {
    var out = [];
    for (var ty = 0; ty < h; ty++) for (var tx = 0; tx < w; tx++) {
      var t = [];
      for (var y = 0; y < 8; y++) { var s = ''; for (var x = 0; x < 8; x++) { var v = b[ty * 8 + y][tx * 8 + x]; s += v ? String(v) : '.'; } t.push(s); }
      out.push(t);
    }
    return out;
  }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  // 形狀（size×size 內，色 v）
  function shape(b, k, ox, oy, sz, v) {
    var c = (sz - 1) / 2, x, y;
    for (y = 0; y < sz; y++) for (x = 0; x < sz; x++) {
      var dx = x - c, dy = y - c, on = false;
      if (k === 0) on = dx * dx + dy * dy <= c * c + 0.5;
      else if (k === 1) on = Math.abs(dx) <= c * 0.8 && Math.abs(dy) <= c * 0.8;
      else if (k === 2) on = y >= 1 && Math.abs(dx) <= (y / (sz - 1)) * c + 0.3;
      else if (k === 3) on = Math.abs(Math.abs(dx) - Math.abs(dy)) < sz / 6 + 0.4;
      else on = Math.abs(dx) + Math.abs(dy) <= c + 0.3;
      if (on) px(b, ox + x, oy + y, v);
    }
  }

  var BG = { SP: E8() };
  Object.keys(CHARMAP).forEach(function (ch) { var n = CHARMAP[ch]; if (FONT[n] && !BG['F_' + n]) BG['F_' + n] = FONT[n]; });
  'STAREFLXR'.split('').forEach(function (ch) {
    var f = FONT[ch]; if (!f || BG['BIG_' + ch + '0']) return;
    var b = buf(16, 16);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) if (f[y].charAt(x) !== '.') {
      var v = y < 3 ? 3 : (y < 6 ? 2 : 1);
      px(b, x * 2, y * 2, v); px(b, x * 2 + 1, y * 2, v); px(b, x * 2, y * 2 + 1, v); px(b, x * 2 + 1, y * 2 + 1, v);
    }
    cut(b, 2, 2).forEach(function (t, i) { BG['BIG_' + ch + i] = t; });
  });
  BG.ST1 = ['........', '........', '...2....', '........', '........', '......1.', '........', '........'];
  BG.ST2 = ['........', '.1......', '........', '....3...', '...323..', '....3...', '........', '........'];
  BG.FR_H = ['........', '........', '........', '11111111', '........', '........', '........', '........'];
  BG.K_U = ['...3....', '..333...', '.33333..', '3333333.', '..333...', '..333...', '..333...', '........'];
  BG.K_D = ['..333...', '..333...', '..333...', '3333333.', '.33333..', '..333...', '...3....', '........'];
  BG.K_L = ['...3....', '..33....', '.3333333', '33333333', '.3333333', '..33....', '...3....', '........'];
  BG.K_R = ['....3...', '....33..', '3333333.', '33333333', '3333333.', '....33..', '....3...', '........'];
  BG.K_A = ['..3333..', '.3....3.', '3..33..3', '3.3..3.3', '3.3333.3', '3.3..3.3', '.3....3.', '..3333..'];
  BG.K_B = ['..3333..', '.3....3.', '3.333..3', '3.3..3.3', '3.333..3', '3.3..3.3', '.3333.3.', '..3333..'];
  // HUD 形狀小圖（色 3）
  for (var k = 0; k < 5; k++) { var sb = buf(8, 8); shape(sb, k, 1, 1, 6, 3); BG['SH_' + k] = cut(sb, 1, 1)[0]; }
  // 訊號燈 48×48：外框（色 1）+ 玻璃（色 2）+ 上緣反光（色 3 很少）
  (function () {
    var b = buf(48, 48);
    for (var y = 0; y < 48; y++) for (var x = 0; x < 48; x++) {
      var dx = x - 23.5, dy = y - 23.5, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 23.6) px(b, x, y, d > 20.5 ? 1 : 2);
    }
    for (var a = 0; a < 3; a++) for (var t = -6; t <= 0; t++) px(b, 12 + t + a, 9 - Math.round(t * 0.6) + a, 3);
    cut(b, 6, 6).forEach(function (t2, i) { BG['LP_' + i] = t2; });
    // 中央 16×16 形狀標記（色 3 在玻璃色 2 上），-1 = 空白、5 = 星
    for (var s = -1; s < 6; s++) {
      var m = buf(16, 16), nm = s < 0 ? 'NONE' : (s === 5 ? 'STAR' : SHAPES[s]);
      for (var yy = 0; yy < 16; yy++) for (var xx = 0; xx < 16; xx++) m[yy][xx] = 2;
      if (s >= 0 && s < 5) shape(m, s, 2, 2, 12, 3);
      if (s === 5) { for (var q = 0; q < 16; q++) { px(m, 7, q, 3); px(m, 8, q, 3); } for (var q2 = 3; q2 < 13; q2++) { px(m, q2, 7, 3); px(m, q2, 8, 3); } shape(m, 4, 4, 4, 8, 3); }
      cut(m, 2, 2).forEach(function (t3, i) { BG['MK_' + nm + '_' + i] = t3; });
    }
  })();
  // 訊號艙 32×32：圓角框（色 1）+ 艙面（色 2）+ 中央方向符號（色 3）
  (function () {
    var dirs = ['U', 'D', 'L', 'R'];
    var b = buf(32, 32);
    for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
      var ex = Math.max(0, Math.abs(x - 15.5) - 11), ey = Math.max(0, Math.abs(y - 15.5) - 11), d = Math.sqrt(ex * ex + ey * ey);
      if (d <= 4.6) px(b, x, y, d > 2.6 || Math.abs(x - 15.5) > 13 || Math.abs(y - 15.5) > 13 ? 1 : 2);
    }
    cut(b, 4, 4).forEach(function (t, i) { BG['POD_' + i] = t; });
    dirs.forEach(function (dn, di) {
      var c = buf(16, 16);
      for (var yy = 0; yy < 16; yy++) for (var xx = 0; xx < 16; xx++) c[yy][xx] = 2;
      for (var yy2 = 0; yy2 < 16; yy2++) for (var xx2 = 0; xx2 < 16; xx2++) {
        var u = xx2 - 7.5, v = yy2 - 7.5, a = di === 0 ? -v : (di === 1 ? v : (di === 2 ? -u : u)), w2 = di < 2 ? Math.abs(u) : Math.abs(v);
        if ((a >= -1 && a <= 6 && w2 <= (6 - a) * 0.9) || (a >= -6 && a < -1 && w2 <= 2)) px(c, xx2, yy2, 3);
      }
      cut(c, 2, 2).forEach(function (t, i) { BG['PA_' + dn + '_' + i] = t; });
    });
    var h = buf(16, 16);
    for (var y3 = 0; y3 < 16; y3++) for (var x3 = 0; x3 < 16; x3++) { var dd = Math.abs(x3 - 7.5) + Math.abs(y3 - 7.5); if (dd <= 7.5) px(h, x3, y3, dd > 5.5 ? 1 : (dd < 2.5 ? 3 : 2)); }
    cut(h, 2, 2).forEach(function (t, i) { BG['HUB_' + i] = t; });
  })();

  /* 精靈：32×32 箭頭（實心 / 空心），上與右兩個方向，下 / 左靠翻轉 */
  var SPR = { BLANK: E8() };
  (function () {
    function arrow(right, hollow) {
      var b = buf(32, 32), x, y;
      for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
        var u = right ? y - 15.5 : x - 15.5, a = right ? x : 31 - y, w = Math.abs(u), on = false;
        if (a >= 14) on = w <= (31 - a) * 0.95 + 0.5;
        else on = a >= 1 && w <= 5.5;
        if (on) b[y][x] = 2;
      }
      var o = b.map(function (r) { return r.slice(); });
      for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
        if (!o[y][x]) continue;
        var edge = !(o[y - 1] && o[y - 1][x]) || !(o[y + 1] && o[y + 1][x]) || !o[y][x - 1] || !o[y][x + 1];
        if (edge) b[y][x] = 1; else if (hollow) {
          var e2 = !(o[y - 2] && o[y - 2][x]) || !(o[y + 2] && o[y + 2][x]) || !o[y][x - 2] || !o[y][x + 2];
          b[y][x] = e2 ? 3 : 0;
        } else if ((right ? (y < 15 && y > 10) : (x < 15 && x > 10))) b[y][x] = 3;
      }
      return b;
    }
    cut(arrow(false, false), 4, 4).forEach(function (t, i) { SPR['AU_' + i] = t; });
    cut(arrow(true, false), 4, 4).forEach(function (t, i) { SPR['AR_' + i] = t; });
    cut(arrow(false, true), 4, 4).forEach(function (t, i) { SPR['OU_' + i] = t; });
    cut(arrow(true, true), 4, 4).forEach(function (t, i) { SPR['OR_' + i] = t; });
  })();
  SPR.BACK = ['...33...', '..3333..', '33333333', '.333333.', '..3333..', '.333333.', '.33..33.', '........'];
  SPR.SPARK = ['...3....', '...3....', '.3.2.3..', '..222...', '33222233', '..222...', '.3.2.3..', '...3....'];

  var ART = null;
  function make() {
    if (ART) return ART;
    var bg = CHR.bank('reflex_bg', BG), spr = CHR.bank('reflex_spr', SPR);
    function tiles(s) {
      var out = [], i, n, c;
      s = String(s);
      for (i = 0; i < s.length; i++) {
        c = s.charAt(i);
        if (KEYCH[c]) { out.push(bg.index(KEYCH[c])); continue; }
        n = CHARMAP[c];
        if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
        out.push(n && BG['F_' + n] ? bg.index('F_' + n) : 0);
      }
      return out;
    }
    ART = {
      bg: bg, spr: spr,
      t: function (name) { return bg.index(name); },
      s: function (name) { return spr.index(name); },
      text: tiles,
      big: function (ch) { return [0, 1, 2, 3].map(function (q) { return bg.index('BIG_' + ch + q); }); }
    };
    return ART;
  }
  RX.Art = { make: make, BG: BG, SPR: SPR, SHAPES: SHAPES };
})();
