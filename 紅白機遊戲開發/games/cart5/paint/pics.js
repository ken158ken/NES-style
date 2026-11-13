/*
 * games/cart5/paint/pics.js — 《星塵畫室》原創圖庫：著色本線稿 8 張 + 臨摹範例 8 張 + 調色盤
 * ---------------------------------------------------------------------------
 * 擁有者：C9-1 cart5-paint（R9）｜ 依賴：paint/core.js（Model 繪圖原語）
 * 全部用繪圖指令（線 / 圓 / 橢圓 / 多邊形）在 128×128 上即時畫出，沒有外部圖檔。
 *   線稿：線條一律色碼 3（第 0 組第 3 色；著色本調色盤四組的第 3 色都是黑 $0F，所以線在任何屬性區都是黑）。
 *   範例：只用第 0 組 3 色（碼 1~3）＋ 紙；每張自己的調色盤。
 * 契約：CT.Paint.Pics = { BOOK: [{name, pal13}], COPY: [{name, pal13, time}], book(i) → Uint8Array, copy(i) → Uint8Array, FREE_PAL, GUESS_PAL }
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var P = CT.Paint = CT.Paint || {};
  var C = P.Core;
  var K = 3;   // 線條色碼

  // 著色本調色盤：紙 $30 白；四組 = [淺, 深, 黑線]
  var BOOK_PAL = [0x30, 0x16, 0x27, 0x0F, 0x28, 0x2A, 0x0F, 0x21, 0x12, 0x0F, 0x25, 0x17, 0x0F];
  // 自由畫預設：紙白；紅黃黑 / 綠系 / 藍系 / 粉棕
  var FREE_PAL = [0x30, 0x16, 0x28, 0x0F, 0x2A, 0x1A, 0x0B, 0x21, 0x12, 0x02, 0x25, 0x17, 0x07];
  // 快畫：紙淡黃、墨黑
  var GUESS_PAL = [0x38, 0x0F, 0x16, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F];

  function star5(m, cx, cy, ro, ri, code, rot) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = (rot || -90) * Math.PI / 180 + i * Math.PI / 5, r = (i & 1) ? ri : ro;
      pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
    }
    m.poly(pts, code, 1);
    return pts;
  }
  function arc(m, cx, cy, rx, ry, a0, a1, code) {
    var prev = null;
    for (var a = a0; a <= a1 + 0.01; a += 6) {
      var t = a * Math.PI / 180, p = [Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))];
      if (prev) m.line(prev[0], prev[1], p[0], p[1], code, 1);
      prev = p;
    }
  }
  function zig(m, y, amp, step, code) {
    for (var x = 0; x < 128; x += step) m.line(x, y + ((x / step) & 1 ? amp : 0), x + step, y + (((x / step) + 1) & 1 ? amp : 0), code, 1);
  }
  function newM() { return new C.Model(); }

  /* ---------------- 著色本 8 張 ---------------- */
  var BOOK = [
    { name: 'STAR WHALE', draw: function (m) {
      m.ellipse(14, 46, 102, 96, K);
      m.poly([[98, 64], [124, 42], [116, 70], [124, 96], [98, 80]], K);
      m.circle(34, 64, 5, K); m.circle(34, 64, 2, K);
      arc(m, 58, 72, 38, 18, 25, 155, K);
      m.line(52, 46, 52, 30, K); arc(m, 44, 30, 8, 6, 180, 360, K); arc(m, 60, 30, 8, 6, 180, 360, K);
      star5(m, 18, 18, 11, 5, K); star5(m, 104, 16, 9, 4, K); star5(m, 80, 30, 6, 3, K);
      zig(m, 108, 6, 8, K);
    } },
    { name: 'ROCKET', draw: function (m) {
      m.poly([[64, 6], [86, 36], [86, 94], [42, 94], [42, 36]], K);
      m.line(42, 36, 86, 36, K); m.line(42, 80, 86, 80, K);
      m.circle(64, 52, 10, K); m.circle(64, 52, 5, K);
      m.poly([[42, 66], [22, 102], [42, 94]], K); m.poly([[86, 66], [106, 102], [86, 94]], K);
      m.poly([[48, 94], [64, 124], [80, 94]], K); m.poly([[56, 94], [64, 112], [72, 94]], K);
      m.circle(18, 28, 9, K); m.ellipse(2, 24, 34, 32, K);
      star5(m, 106, 22, 10, 4, K); star5(m, 110, 60, 7, 3, K);
    } },
    { name: 'COZY HOUSE', draw: function (m) {
      m.line(0, 112, 127, 112, K);
      m.rect(22, 62, 84, 112, K);
      m.poly([[16, 64], [53, 28], [90, 64]], K);
      m.rect(68, 30, 78, 50, K);
      m.rect(44, 84, 62, 112, K); m.circle(58, 98, 2, K);
      m.rect(28, 70, 40, 82, K); m.line(34, 70, 34, 82, K); m.line(28, 76, 40, 76, K);
      m.rect(66, 70, 78, 82, K); m.line(72, 70, 72, 82, K); m.line(66, 76, 78, 76, K);
      m.circle(110, 20, 11, K);
      m.rect(100, 88, 106, 112, K); m.circle(103, 74, 14, K);
    } },
    { name: 'FLOWER POT', draw: function (m) {
      m.poly([[42, 98], [86, 98], [80, 124], [48, 124]], K);
      m.rect(38, 90, 90, 98, K);
      m.line(62, 90, 62, 52, K); m.line(66, 90, 66, 52, K);
      m.ellipse(40, 66, 62, 76, K); m.ellipse(66, 60, 88, 70, K);
      for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; m.circle(Math.round(64 + 15 * Math.cos(a)), Math.round(36 + 15 * Math.sin(a)), 8, K); }
      m.circle(64, 36, 7, K);
      star5(m, 16, 18, 9, 4, K); star5(m, 112, 84, 8, 3, K);
    } },
    { name: 'NIGHT OWL', draw: function (m) {
      m.rect(4, 112, 124, 120, K);
      m.ellipse(30, 30, 98, 114, K);
      m.ellipse(44, 64, 84, 110, K);
      m.circle(50, 52, 11, K); m.circle(78, 52, 11, K);
      m.circle(50, 52, 4, K); m.circle(78, 52, 4, K);
      m.poly([[59, 62], [69, 62], [64, 74]], K);
      m.poly([[36, 40], [38, 18], [52, 32]], K); m.poly([[92, 40], [90, 18], [76, 32]], K);
      arc(m, 64, 92, 12, 6, 0, 180, K);
      m.circle(112, 18, 10, K); m.circle(106, 14, 8, K);
    } },
    { name: 'SAILBOAT', draw: function (m) {
      m.poly([[18, 86], [110, 86], [96, 104], [32, 104]], K);
      m.line(64, 86, 64, 12, K);
      m.poly([[67, 16], [67, 80], [106, 80]], K);
      m.poly([[61, 26], [61, 80], [28, 80]], K);
      m.poly([[64, 12], [78, 16], [64, 20]], K);
      zig(m, 108, 5, 10, K); zig(m, 118, 5, 10, K);
      m.circle(18, 20, 10, K);
      m.circle(96, 30, 7, K); m.circle(106, 26, 9, K); m.circle(116, 31, 6, K);
    } },
    { name: 'PARTY CAKE', draw: function (m) {
      m.ellipse(10, 110, 118, 122, K);
      m.rect(22, 82, 106, 114, K);
      m.rect(36, 56, 92, 82, K);
      zig(m, 92, 4, 6, K);
      m.box(0, 92, 21, 100, 0); m.box(107, 92, 127, 100, 0);
      m.rect(44, 32, 50, 56, K); m.rect(61, 32, 67, 56, K); m.rect(78, 32, 84, 56, K);
      m.ellipse(43, 18, 51, 30, K); m.ellipse(60, 18, 68, 30, K); m.ellipse(77, 18, 85, 30, K);
      m.circle(48, 70, 4, K); m.circle(64, 70, 4, K); m.circle(80, 70, 4, K);
      star5(m, 14, 20, 9, 4, K); star5(m, 114, 30, 9, 4, K);
    } },
    { name: 'TIN ROBOT', draw: function (m) {
      m.rect(40, 20, 88, 56, K);
      m.circle(54, 36, 6, K); m.circle(74, 36, 6, K);
      m.rect(52, 45, 76, 50, K);
      m.line(64, 20, 64, 9, K); m.circle(64, 6, 3, K);
      m.rect(56, 56, 72, 62, K);
      m.rect(30, 62, 98, 104, K);
      m.rect(46, 70, 82, 92, K);
      m.circle(56, 81, 4, K); m.circle(72, 81, 4, K);
      m.rect(14, 64, 30, 96, K); m.rect(98, 64, 114, 96, K);
      m.rect(40, 104, 58, 124, K); m.rect(70, 104, 88, 124, K);
    } }
  ];

  /* ---------------- 臨摹範例 8 張（碼 1~3） ---------------- */
  var COPY = [
    { name: 'GIFT BOX', pal: [0x30, 0x12, 0x28, 0x16], draw: function (m) {
      m.box(28, 46, 100, 112, 1); m.box(58, 46, 70, 112, 2); m.box(28, 72, 100, 82, 2);
      m.fpoly([[64, 46], [40, 26], [40, 46]], 3); m.fpoly([[64, 46], [88, 26], [88, 46]], 3);
    } },
    { name: 'SUNNY', pal: [0x31, 0x28, 0x27, 0x16], draw: function (m) {
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; m.line(64, 64, Math.round(64 + 56 * Math.cos(a)), Math.round(64 + 56 * Math.sin(a)), 2, 5); }
      m.fcircle(64, 64, 32, 1);
      m.fcircle(52, 58, 4, 3); m.fcircle(76, 58, 4, 3); m.box(52, 76, 76, 80, 3);
    } },
    { name: 'TINY HOME', pal: [0x31, 0x27, 0x16, 0x07], draw: function (m) {
      m.box(30, 60, 98, 116, 1); m.fpoly([[20, 62], [64, 22], [108, 62]], 2);
      m.box(56, 86, 72, 116, 3); m.box(36, 70, 50, 82, 3); m.box(78, 70, 92, 82, 3);
    } },
    { name: 'APPLE TREE', pal: [0x30, 0x2A, 0x16, 0x07], draw: function (m) {
      m.box(56, 78, 72, 120, 3); m.fcircle(64, 52, 36, 1); m.fcircle(40, 72, 16, 1); m.fcircle(88, 72, 16, 1);
      m.fcircle(50, 44, 5, 2); m.fcircle(78, 56, 5, 2); m.fcircle(60, 72, 5, 2); m.fcircle(86, 36, 5, 2);
    } },
    { name: 'GOLD FISH', pal: [0x31, 0x27, 0x16, 0x0F], draw: function (m) {
      m.fpoly([[86, 64], [120, 36], [120, 92]], 2); m.disc(12, 36, 96, 92, 1);
      m.fpoly([[44, 40], [70, 22], [72, 42]], 2); m.fcircle(32, 58, 6, 3); m.line(66, 44, 66, 84, 2, 3);
    } },
    { name: 'SKY ROCKET', pal: [0x0F, 0x30, 0x16, 0x21], draw: function (m) {
      m.fpoly([[64, 8], [84, 40], [84, 96], [44, 96], [44, 40]], 1);
      m.fpoly([[44, 66], [24, 104], [44, 96]], 2); m.fpoly([[84, 66], [104, 104], [84, 96]], 2);
      m.fpoly([[50, 96], [64, 124], [78, 96]], 2); m.fcircle(64, 54, 10, 3);
    } },
    { name: 'HOT COCOA', pal: [0x30, 0x17, 0x21, 0x07], draw: function (m) {
      m.disc(14, 104, 114, 120, 2); m.fpoly([[30, 50], [94, 50], [86, 110], [38, 110]], 1);
      m.ellipse(88, 62, 116, 92, 1, 5); m.box(32, 50, 92, 58, 3);
      m.line(48, 40, 52, 18, 2, 3); m.line(64, 40, 68, 14, 2, 3); m.line(80, 40, 84, 18, 2, 3);
    } },
    { name: 'STAR FORT', pal: [0x31, 0x00, 0x16, 0x0F], draw: function (m) {
      m.box(20, 50, 44, 120, 1); m.box(84, 50, 108, 120, 1); m.box(44, 70, 84, 120, 1);
      for (var x = 20; x < 108; x += 12) m.box(x, 42, x + 6, 50, 1);
      m.box(52, 62, 58, 70, 1); m.box(70, 62, 76, 70, 1);
      m.disc(54, 88, 74, 108, 3); m.box(54, 98, 74, 120, 3);
      m.line(32, 42, 32, 16, 3, 2); m.fpoly([[33, 16], [50, 22], [33, 28]], 2);
      m.line(96, 42, 96, 16, 3, 2); m.fpoly([[97, 16], [114, 22], [97, 28]], 2);
    } }
  ];

  var cacheB = {}, cacheC = {};
  function book(i) {
    if (cacheB[i]) return new Uint8Array(cacheB[i]);
    var m = newM(); BOOK[i].draw(m); cacheB[i] = m.pix; return new Uint8Array(m.pix);
  }
  function copy(i) {
    if (cacheC[i]) return new Uint8Array(cacheC[i]);
    var m = newM(); COPY[i].draw(m); cacheC[i] = m.pix; return new Uint8Array(m.pix);
  }
  // 臨摹的 13 色：第 0 組 = 範例 3 色；第 3 組第 3 色給面板文字（與紙對比最大的那個由 main 自動挑）
  function copyPal(i) {
    var p = COPY[i].pal, ink = (C.lumOf(p[0]) > 128) ? 0x0F : 0x30;
    return [p[0], p[1], p[2], p[3], 0x00, 0x10, ink, 0x00, 0x10, ink, 0x00, 0x10, ink];
  }
  BOOK.forEach(function (b) { b.pal13 = BOOK_PAL.slice(); });
  COPY.forEach(function (c, i) { c.pal13 = copyPal(i); c.time = 7212; });   // 120 秒（60.0988 Hz）

  P.Pics = { BOOK: BOOK, COPY: COPY, book: book, copy: copy, BOOK_PAL: BOOK_PAL, FREE_PAL: FREE_PAL, GUESS_PAL: GUESS_PAL, star5: star5 };
})();
