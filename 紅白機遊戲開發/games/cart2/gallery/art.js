/*
 * games/cart2/gallery/art.js — 《星塵射擊場 STAR RANGE》CHR（全部原創；程式化 + 手繪）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-4 cart2-aim（R6）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 世界觀：軌道站外的「星光訓練場」——黑色太空 + 站體桁架邊框，靶是浮空的全像光靶，
 *         不是草地 / 鴨子 / 獵犬（brief §1-5）。
 * 背景磚（gallery_bg）：
 *   字型 F_*（色 3）、星點 ST1 / ST2、桁架框 GH / GV / GC、計量條 BAR0..BAR8（0~8 px）
 *   TB_0..15  精準靶 32×32（環分由 ringScore() 決定，畫面與計分同一份函式）
 *   TS_0..3   精準靶 16×16
 *   CH_0..3   速射星晶片 16×16      N{1..7}_0..3  編號光靶（多目標模式）
 *   BU_0..3   命中爆光 16×16        BIG_{字}{0..3} 標題大字
 * 精靈（gallery_spr）：RET_0..3 準星（16×16，熱點 = 中心像素 (7,7)）、PROBE{0,1}_0..3 追蹤靶（探測球）、
 *   SPARK / TRAIL1 / TRAIL2 逃逸光點、ORB 眼力球、MARK 彈著點
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var GA = CT.Gallery = CT.Gallery || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  /* ---------------- 環分：畫面與計分共用 ---------------- */
  // size 32：半徑門檻 2 / 5 / 9 / 12 / 15 → 10 / 8 / 6 / 4 / 2 分；size 16：2 / 3 / 5 / 6 / 7（fix-r6：10 分環 3×3 → 5×5）
  var RINGS = { 32: [2, 5, 9, 12, 15], 16: [2, 3, 5, 6, 7] };
  var RING_PTS = [10, 8, 6, 4, 2];
  // (dx, dy) = 像素 − 靶中心（中心 = 左上 + size/2）；回傳環序 0..4，靶外 = -1
  function ringIndex(size, dx, dy) {
    var R = RINGS[size], d2 = dx * dx + dy * dy;
    for (var k = 0; k < R.length; k++) if (d2 <= R[k] * R[k]) return k;
    return -1;
  }
  GA.RINGS = RINGS;
  GA.RING_PTS = RING_PTS;
  GA.ringIndex = ringIndex;
  GA.ringScore = function (size, dx, dy) { var k = ringIndex(size, dx, dy); return k < 0 ? 0 : RING_PTS[k]; };
  var RING_COL = [3, 1, 2, 1, 2];

  /* ---------------- 畫布工具 ---------------- */
  function canvas(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(0); } return a; }
  function fromRows(rows) { return rows.map(function (r) { return r.split('').map(function (c) { return c === '.' ? 0 : +c; }); }); }
  // 切成 8×8 磚（列優先：TL, TR, …）
  function slice(px) {
    var h = px.length, w = px[0].length, out = [];
    for (var ty = 0; ty < h / 8; ty++) for (var tx = 0; tx < w / 8; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  function stamp(px, glyph, ox, oy, col) {
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      if (glyph[y].charAt(x) !== '.' && px[oy + y] && px[oy + y][ox + x] !== undefined) px[oy + y][ox + x] = col;
    }
  }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }

  /* ---------------- 背景 ---------------- */
  function ringTarget(size) {
    var px = canvas(size, size), c = size >> 1;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var k = ringIndex(size, x - c, y - c);
      if (k >= 0) px[y][x] = RING_COL[k];
    }
    return px;
  }
  function disc(r2in, r2out) {           // 16×16 圓盤：外圈色 1、內面色 2（中心 = (8,8)）
    var px = canvas(16, 16);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d2 = (x - 8) * (x - 8) + (y - 8) * (y - 8);
      if (d2 <= r2out) px[y][x] = d2 > r2in ? 1 : 2;
    }
    return px;
  }
  function chip() {                      // 星晶片：圓盤 + 中央四芒星
    var px = disc(30, 56);
    var star = ['...3....', '...3....', '..333...', '3333333.', '..333...', '...3....', '...3....', '........'];
    stamp(px, star, 5, 5, 3);
    return px;
  }
  function numbered(n) {
    var px = disc(36, 56), g = FONT['N' + n];
    if (g) stamp(px, g, 5, 5, 3);
    return px;
  }
  function burst() {
    var px = canvas(16, 16);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var dx = x - 8, dy = y - 8, d2 = dx * dx + dy * dy;
      if (d2 <= 6) px[y][x] = 3;
      else if (d2 <= 56 && (dx === 0 || dy === 0 || dx === dy || dx === -dy)) px[y][x] = d2 <= 25 ? 3 : 2;
      else if (d2 > 40 && d2 <= 49 && ((x + y) & 1)) px[y][x] = 1;
    }
    return px;
  }
  function bigLetter(ch) {
    var g = FONT[CHARMAP[ch]], px = canvas(16, 16), i, j, dx, dy, X, Y;
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

  var BG = { SP: E8() };
  (function () {
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n] && !BG['F_' + n]) BG['F_' + n] = FONT[n];
    }
  })();
  BG.ST1 = ['........', '........', '........', '....1...', '........', '........', '........', '........'];
  BG.ST2 = ['........', '.2......', '........', '........', '........', '........', '......1.', '........'];
  BG.ST3 = ['........', '........', '...2....', '..232...', '...2....', '........', '........', '........'];
  // 站體桁架（色 1 暗 / 2 亮 / 3 鉚釘）
  BG.GH = ['22222222', '1.1.1.1.', '.1.1.1.1', '1.1.1.1.', '22222222', '........', '........', '........'];
  BG.GHB = ['........', '........', '........', '22222222', '1.1.1.1.', '.1.1.1.1', '1.1.1.1.', '22222222'];
  BG.GV = ['21.1....', '2.1.....', '21.1....', '2.1.....', '21.1....', '2.1.....', '21.1....', '2.1.....'];
  BG.GVR = ['....1.12', '.....1.2', '....1.12', '.....1.2', '....1.12', '.....1.2', '....1.12', '.....1.2'];
  BG.GC = ['3222222.', '2.1.1.1.', '21.1.1..', '2.1.1.1.', '22222222', '2.1.....', '21.1....', '2.1.....'];
  // 計量條（外框色 1，填色 3）
  for (var b = 0; b <= 8; b++) {
    var mid = '';
    for (var x = 0; x < 8; x++) mid += x < b ? '3' : '.';
    BG['BAR' + b] = ['11111111', mid, mid, mid, mid, mid, '11111111', '........'];
  }
  function add(prefix, tiles) { tiles.forEach(function (t, i) { BG[prefix + i] = t; }); }
  add('TB_', slice(ringTarget(32)));
  add('TS_', slice(ringTarget(16)));
  add('CH_', slice(chip()));
  add('BU_', slice(burst()));
  for (var n = 1; n <= 7; n++) add('N' + n + '_', slice(numbered(n)));
  'STARNGEOD'.split('').forEach(function (ch) { add('BIG_' + ch, slice(bigLetter(ch))); });
  // 評價大字（S / A / B / C / D）
  'SABCD'.split('').forEach(function (ch) { if (!BG['BIG_' + ch + '0']) add('BIG_' + ch, slice(bigLetter(ch))); });

  /* ---------------- 精靈 ---------------- */
  // 準星（16×16，熱點 = (7,7)）：外環（色 1，四個斜角開口）+ 軸向短刻（色 2）+ 中心點（色 3）
  function reticle() {
    var px = canvas(16, 16);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var dx = x - 7, dy = y - 7, d2 = dx * dx + dy * dy, ax = Math.abs(dx), ay = Math.abs(dy);
      if (dx === 0 && dy === 0) px[y][x] = 3;
      else if ((dx === 0 && ay >= 3 && ay <= 4) || (dy === 0 && ax >= 3 && ax <= 4)) px[y][x] = 3;
      else if (d2 >= 30 && d2 <= 42 && Math.abs(ax - ay) > 1) px[y][x] = 1;
      else if ((dx === 0 && ay === 8) || (dy === 0 && ax === 8)) px[y][x] = 2;
    }
    return px;
  }
  var PROBE = [
    '......3.........',
    '......2.........',
    '.....111........',
    '...11222211.....',
    '..1222332221....',
    '.122233332221...',
    '1122223322222111',
    '3122222222222213',
    '1122222222222111',
    '.122221122221...',
    '..1222112221....',
    '...11222211.....',
    '.....1111.......',
    '....1.....1.....',
    '...1.......1....',
    '................'
  ];
  var PROBE2 = PROBE.slice(0, 13).concat(['.....1..1.......', '.....1..1.......', '................']);
  var SPR = { SP: E8() };
  (function () {
    var r = slice(reticle());
    for (var i = 0; i < 4; i++) SPR['RET_' + i] = r[i];
    var p0 = slice(fromRows(PROBE)), p1 = slice(fromRows(PROBE2));
    for (i = 0; i < 4; i++) { SPR['PROBE0_' + i] = p0[i]; SPR['PROBE1_' + i] = p1[i]; }
  })();
  SPR.SPARK = ['...3....', '..323...', '.32123..', '3211123.', '.32123..', '..323...', '...3....', '........'];
  SPR.TRAIL1 = ['........', '...2....', '..212...', '.21112..', '..212...', '...2....', '........', '........'];
  SPR.TRAIL2 = ['........', '........', '...1....', '..111...', '...1....', '........', '........', '........'];
  SPR.ORB = ['..1111..', '.122221.', '12233221', '12232221', '12222221', '12222211', '.122211.', '..1111..'];
  SPR.MARK = ['........', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '........', '........'];

  var made = null;
  GA.Art = {
    make: function () {
      if (made) return made;
      var bg = CHR.bank('gallery_bg', BG), spr = CHR.bank('gallery_spr', SPR);
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
