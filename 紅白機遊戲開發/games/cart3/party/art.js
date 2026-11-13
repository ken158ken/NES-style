/*
 * games/cart3/party/art.js — 《星塵派對 STAR PARTY》CHR（全部原創；程式化 + 手繪）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-0 cart3-shell+party（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 背景磚（party_bg）：
 *   F_*        字型（色 3）           DG_0..9   暗色數字（色 2，數字盤上「已排除」的號碼）
 *   B*         外框（色 1）           BIG_<字>0..3  標題大字
 *   K*         星牌（框色 2 / 牌面色 3）、CD_0..9 牌面數字（色 1 字 on 色 3）、SU_<n>_0..3 四種牌花（星 / 月 / 日 / 彗）、
 *              KBK 牌背花紋、KEDGE 翻牌中的側邊
 *   HB_<k>_0..3 猜拳選項圖示（星石 / 星帆 / 星剪，16×16）、LG_0..2 對手出拳紀錄小圖示
 *   PR_<i>_0..15 三位 CPU 頭像（32×32，程式化：岩岩 = 石塊、映映 = 鏡子、軌軌 = 帶環小行星）
 *   PIP0..4    剩餘張數點數
 * 精靈（party_spr）：H_<k>_0..3 手套（16×16；玩家朝上、CPU 垂直翻轉）、CUR 游標角（翻轉成 4 角）、ARW 箭頭、DOT（backTile）、SPK 閃光
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PA = CT.Party = CT.Party || {};
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
  function rowsToPx(rows) { return rows.map(function (r) { return r.split('').map(function (c) { return c === '.' ? 0 : +c; }); }); }
  function remap(rows, map) { return rows.map(function (r) { return r.split('').map(function (c) { return map[c] === undefined ? c : map[c]; }).join(''); }); }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  function fill8(c) { var r = ''; for (var i = 0; i < 8; i++) r += c; return [r, r, r, r, r, r, r, r]; }
  function rect(px, x0, y0, x1, y1, v) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (px[y] && x >= 0 && x < px[y].length) px[y][x] = v; }
  function outline(px, v) {
    var h = px.length, w = px[0].length, src = px.map(function (r) { return r.slice(); });
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y][x]) continue;
      if ((x > 0 && src[y][x - 1]) || (x < w - 1 && src[y][x + 1]) || (y > 0 && src[y - 1][x]) || (y < h - 1 && src[y + 1][x])) px[y][x] = v;
    }
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

  /* ---------------- 手套（0 星石 / 1 星帆 / 2 星剪）：矩形組合 + 自動描邊；1 框 / 2 手套 / 3 高光 ---------------- */
  var HAND_RECTS = [
    [[3, 3, 12, 11]],
    [[3, 7, 11, 11], [3, 1, 4, 6], [6, 0, 7, 6], [9, 1, 10, 6], [12, 6, 13, 8]],
    [[3, 6, 11, 11], [4, 0, 5, 5], [8, 1, 9, 5]]
  ];
  function handPx(k) {
    var px = canvas(16, 16);
    HAND_RECTS[k].forEach(function (r) { rect(px, r[0], r[1], r[2], r[3], 2); });
    if (k === 0) { px[3][3] = 0; px[3][12] = 0; px[11][3] = 0; px[11][12] = 0; }
    rect(px, 4, 12, 11, 13, 2);
    outline(px, 1);
    rect(px, 4, 12, 11, 13, 3);                       // 袖口
    if (k === 0) { for (var x = 4; x <= 10; x += 2) px[4][x] = 3; px[7][4] = 1; px[7][5] = 1; px[7][6] = 1; }
    if (k === 1) { px[2][3] = 3; px[1][6] = 3; px[2][9] = 3; }
    if (k === 2) { px[1][4] = 3; px[2][8] = 3; px[8][5] = 1; px[8][6] = 1; px[8][7] = 1; }
    for (var y = 0; y < 16; y++) px[y][15] = 0;
    return px;
  }

  /* ---------------- CPU 頭像 32×32（程式化） ---------------- */
  function portrait(i) {
    var px = canvas(32, 32), x, y, dx, dy, d;
    if (i === 0) {          // 岩岩：凹凸石塊 + 粗眉 + 裂痕
      for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
        dx = x - 15.5; dy = y - 17;
        var a = Math.atan2(dy, dx), r = 13 + 1.6 * Math.sin(a * 5) + 0.8 * Math.cos(a * 3);
        if (dx * dx + dy * dy <= r * r) px[y][x] = 2;
      }
      outline(px, 1);
      for (y = 6; y < 14; y++) for (x = 6; x < 14; x++) if (px[y][x] === 2 && (x + y) < 17) px[y][x] = 3;
      rect(px, 9, 13, 12, 15, 3); rect(px, 19, 13, 22, 15, 3); rect(px, 11, 14, 12, 15, 1); rect(px, 19, 14, 20, 15, 1);
      rect(px, 8, 11, 13, 11, 1); rect(px, 18, 11, 23, 11, 1); px[10][8] = 1; px[10][23] = 1;
      rect(px, 12, 22, 19, 22, 1); px[21][11] = 1; px[21][20] = 1;
      px[6][20] = 1; px[7][21] = 1; px[8][21] = 1; px[9][22] = 1; px[26][8] = 1; px[25][9] = 1;
    } else if (i === 1) {   // 映映：橢圓鏡子 + 斜反光 + 彎眼笑
      for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
        dx = (x - 15.5) / 12; dy = (y - 15.5) / 14.5;
        d = dx * dx + dy * dy;
        if (d <= 1) px[y][x] = d > 0.78 ? 1 : 3;
      }
      for (y = 4; y < 28; y++) for (x = 4; x < 28; x++) if (px[y][x] === 3 && ((x + y) === 18 || (x + y) === 19 || (x + y) === 22)) px[y][x] = 2;
      [[10, 13], [11, 12], [12, 12], [13, 13], [18, 13], [19, 12], [20, 12], [21, 13]].forEach(function (p) { px[p[1]][p[0]] = 1; });
      [[12, 20], [13, 21], [14, 21], [15, 21], [16, 21], [17, 21], [18, 21], [19, 20]].forEach(function (p) { px[p[1]][p[0]] = 1; });
      rect(px, 8, 17, 9, 17, 2); rect(px, 22, 17, 23, 17, 2);
      rect(px, 14, 30, 17, 31, 1);
    } else {                // 軌軌：條紋小行星 + 前方光環
      for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
        dx = x - 15.5; dy = y - 14.5;
        if (dx * dx + dy * dy <= 10.5 * 10.5) px[y][x] = ((y - 4) % 6 < 2) ? 1 : 2;
      }
      for (x = 0; x < 32; x++) {
        var ry = 14.5 + (x - 15.5) * 0.28 + 4;
        for (y = 0; y < 32; y++) {
          dy = y - ry; dx = (x - 15.5) / 15.5;
          if (Math.abs(dy) <= 1.2 && dx * dx <= 1 && !(px[y][x] && y < ry - 0.3 && Math.abs(x - 15.5) < 10)) px[y][x] = 3;
        }
      }
      rect(px, 11, 11, 12, 13, 3); rect(px, 19, 11, 20, 13, 3);
      px[17][13] = 3; px[18][14] = 3; px[18][15] = 3; px[18][16] = 3; px[18][17] = 3; px[17][18] = 3;
      px[1][4] = 3; px[3][27] = 3; px[29][6] = 3;
    }
    return px;
  }

  /* ---------------- 牌花 16×16（色 1，底 = 牌面色 3） ---------------- */
  function suit(n) {
    var px = canvas(16, 16), x, y, dx, dy;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      dx = x - 7.5; dy = y - 7.5;
      var on = false, r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
      if (n === 0) on = r <= 3.2 + 3.6 * Math.max(0, Math.cos((a + Math.PI / 2) * 5)) ;      // 星
      if (n === 1) on = r <= 6.5 && ((x - 10) * (x - 10) + (y - 5.5) * (y - 5.5)) > 25;       // 月
      if (n === 2) on = r <= 3.6 || (r <= 7 && Math.abs(Math.sin(a * 4)) < 0.25);              // 日
      if (n === 3) on = (((x - 10.5) * (x - 10.5) + (y - 10.5) * (y - 10.5)) <= 10) || (Math.abs((x - y)) <= 1 && x < 10 && x > 1) || (Math.abs(x - y + 3) <= 0 && x < 8 && x > 2); // 彗
      px[y][x] = on ? 1 : 3;
    }
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
    for (i = 0; i <= 9; i++) {
      var f = FONT['N' + i];
      if (!f) continue;
      BG['DG_' + i] = remap(f, { '3': '2' });
      BG['CD_' + i] = remap(remap(f, { '3': '1' }), { '.': '3' });
    }
  })();
  BG.CD_SP = fill8('3');
  BG.H00 = ['........', '333.333.', '3.3.3.3.', '3.3.3.3.', '3.3.3.3.', '3.3.3.3.', '333.333.', '........'];
  BG.DH00 = remap(BG.H00, { '3': '2' });
  BG.BH = ['........', '11111111', '........', '11111111', '........', '........', '........', '........'];
  BG.BHB = ['........', '........', '........', '........', '11111111', '........', '11111111', '........'];
  BG.BV = ['.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....', '.1.1....'];
  BG.BVR = ['....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.', '....1.1.'];
  BG.ST1 = ['........', '........', '........', '....3...', '........', '........', '........', '........'];
  BG.ST2 = ['........', '.1......', '........', '........', '........', '........', '......1.', '........'];
  // 星牌（框色 2、面色 3）
  BG.KTL = ['..222222', '.2333333', '23333333', '23333333', '23333333', '23333333', '23333333', '23333333'];
  BG.KT = ['22222222', '33333333', '33333333', '33333333', '33333333', '33333333', '33333333', '33333333'];
  BG.KTR = ['222222..', '3333332.', '33333332', '33333332', '33333332', '33333332', '33333332', '33333332'];
  BG.KL = fill8('3').map(function (r) { return '2' + r.substring(1); });
  BG.KR = fill8('3').map(function (r) { return r.substring(0, 7) + '2'; });
  BG.KBL = ['23333333', '23333333', '23333333', '23333333', '23333333', '23333333', '.2333333', '..222222'];
  BG.KB = ['33333333', '33333333', '33333333', '33333333', '33333333', '33333333', '33333333', '22222222'];
  BG.KBR = ['33333332', '33333332', '33333332', '33333332', '33333332', '33333332', '3333332.', '222222..'];
  BG.KBK = ['21111112', '12111121', '11211211', '11122111', '11122111', '11211211', '12111121', '21111112'];
  BG.KEDGE = ['...22...', '...22...', '...22...', '...22...', '...22...', '...22...', '...22...', '...22...'];
  for (var p = 0; p <= 4; p++) {
    var rr = '';
    for (var q = 0; q < 4; q++) rr += q < p ? '3' : '1';
    BG['PIP' + p] = ['........', '.' + rr.charAt(0) + '.' + rr.charAt(1) + '....', '........', '.' + rr.charAt(2) + '.' + rr.charAt(3) + '....', '........', '........', '........', '........'];
  }
  BG.LG_0 = ['........', '..333...', '.33333..', '.33333..', '.33333..', '..333...', '........', '........'];
  BG.LG_1 = ['........', '.3.3.3..', '.3.3.3..', '.33333..', '.33333..', '..333...', '........', '........'];
  BG.LG_2 = ['........', '.3...3..', '..3.3...', '...3....', '..333...', '..333...', '........', '........'];
  function add(prefix, tiles) { tiles.forEach(function (t, i) { BG[prefix + i] = t; }); }
  'STARPY'.split('').forEach(function (ch) { if (!BG['BIG_' + ch + '0']) add('BIG_' + ch, slice(bigGlyph(FONT[CHARMAP[ch]]))); });
  for (var s = 0; s < 4; s++) add('SU_' + s + '_', slice(suit(s)));
  for (var k = 0; k < 3; k++) {
    // 選項圖示用 bg 調色盤 2（1 紅 / 2 棕 / 3 奶油）：框 → 2、手套 → 3、高光 → 1
    var hp = handPx(k).map(function (r) { return r.map(function (v) { return [0, 2, 3, 1][v]; }); });
    add('HB_' + k + '_', slice(hp));
  }
  for (var i = 0; i < 3; i++) add('PR_' + i + '_', slice(portrait(i)));

  /* ---------------- 精靈 ---------------- */
  var SPR = { SP: E8() };
  for (k = 0; k < 3; k++) slice(handPx(k)).forEach(function (t, j) { SPR['H_' + k + '_' + j] = t; });
  SPR.CUR = ['3333....', '3.......', '3.......', '3.......', '........', '........', '........', '........'];
  SPR.ARW = ['........', '.33.....', '.3333...', '.333333.', '.3333...', '.33.....', '........', '........'];
  SPR.DOT = ['........', '..33....', '.3333...', '.3333...', '..33....', '........', '........', '........'];
  SPR.SPK = ['...3....', '...3....', '.33133..', '...3....', '...3....', '........', '........', '........'];
  SPR.BAR = ['........', '........', '........', '........', '........', '........', '33333333', '33333333'];

  var made = null;
  PA.Art = {
    handPx: handPx, portrait: portrait,
    make: function () {
      if (made) return made;
      var bg = CHR.bank('party_bg', BG), spr = CHR.bank('party_spr', SPR);
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
