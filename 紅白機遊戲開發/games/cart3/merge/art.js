/*
 * games/cart3/merge/art.js — 《星塵合星 STAR MERGE》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 不做成「數字方塊」：每一階是一個 24×24 的天體圖示（3×3 磚，背景名稱表），漂在深空裡，沒有方形色塊底；
 * 數值只出現在右側 HUD。12 階（低 → 高）：
 *   1 星塵 DUST   2 石礫 PEBBLE  3 彗星 COMET   4 月 MOON       5 行星 PLANET  6 環行星 RINGED
 *   7 巨行星 GIANT 8 恆星 STAR   9 超新星 NOVA 10 脈衝星 PULSAR 11 星系 GALAXY 12 星系團 CLUSTER
 * 背景磚（merge_bg）：字型 F_*、T{1..12}_{0..8} 天體、HOLE{0,1}_{0..8} 黑洞（兩格動畫）、
 *   E_{0..8} 空槽角括號、框 FR_*、星點 ST1/ST2、箭頭 AL/AR/AX、大字 BIG_{字}{0..3}、星等 SR0/SR1。
 *   同內容的磚自動合併（dedupe）⇒ bank ≤ 256。
 * 精靈（merge_spr）：SPK0..2 合併閃光、POP 生成光點、DOT 回選單提示（實心星點）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MG = CT.Merge = CT.Merge || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  var TIERS = [null,
    { key: 'DUST', zh: '星塵', pal: 0 }, { key: 'PEBBLE', zh: '石礫', pal: 1 }, { key: 'COMET', zh: '彗星', pal: 2 },
    { key: 'MOON', zh: '月', pal: 0 }, { key: 'PLANET', zh: '行星', pal: 2 }, { key: 'RINGED', zh: '環行星', pal: 1 },
    { key: 'GIANT', zh: '巨行星', pal: 1 }, { key: 'STAR', zh: '恆星', pal: 3 }, { key: 'NOVA', zh: '超新星', pal: 3 },
    { key: 'PULSAR', zh: '脈衝星', pal: 2 }, { key: 'GALAXY', zh: '星系', pal: 2 }, { key: 'CLUSTER', zh: '星系團', pal: 3 }
  ];
  MG.TIERS = TIERS;

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
  function rowsToTile(rows) {
    var t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var c = rows[y].charAt(x); t[y * 8 + x] = c === '.' ? 0 : +c; }
    return t;
  }
  function S(px, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && y < px.length && x < px[0].length) px[y][x] = c; }
  function G(px, x, y) { return (x >= 0 && y >= 0 && y < px.length && x < px[0].length) ? px[y][x] : 0; }
  // 球體：左上打光（3 = 亮面、2 = 本體、1 = 暗面 / 邊）
  function sphere(px, cx, cy, r, opt) {
    opt = opt || {};
    for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      var dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      var l = (-dx - dy) / r, c;
      if (d2 > (r - 1.1) * (r - 1.1)) c = 1;
      else if (l > 0.55) c = 3;
      else if (l > -0.35) c = 2;
      else c = 1;
      if (opt.bands && c === 2 && (Math.floor(y - cy + r) % opt.bands) === 0) c = 1;
      S(px, x, y, c);
    }
  }
  function dot(px, x, y, c, big) { S(px, x, y, c); if (big) { S(px, x + 1, y, c); S(px, x, y + 1, c); S(px, x + 1, y + 1, c); } }
  function line(px, x0, y0, x1, y1, c) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (var i = 0; i <= n; i++) S(px, x0 + (x1 - x0) * i / (n || 1), y0 + (y1 - y0) * i / (n || 1), c);
  }

  var DRAW = {
    1: function (px) {   // 星塵：一撮亮點
      [[5, 9, 3, 1], [11, 5, 2, 0], [15, 10, 3, 1], [9, 14, 2, 1], [14, 16, 3, 0], [18, 14, 2, 0], [7, 18, 1, 0], [12, 11, 3, 0],
       [17, 6, 1, 0], [4, 14, 1, 0], [19, 18, 1, 0], [10, 8, 1, 0]].forEach(function (d) { dot(px, d[0], d[1], d[2], d[3]); });
    },
    2: function (px) {   // 石礫：兩顆凹凸小石
      sphere(px, 10, 13, 5.2); sphere(px, 16, 9, 3.4);
      [[9, 15], [12, 12], [8, 12]].forEach(function (p) { S(px, p[0], p[1], 1); });
      S(px, 5, 12, 0); S(px, 14, 17, 0); S(px, 19, 8, 0);
    },
    3: function (px) {   // 彗星：亮頭 + 往左下拖的尾
      for (var i = 0; i < 14; i++) {
        var t = i / 13;
        line(px, 14 - i, 9 + i * 0.9, 14 - i - 1, 9 + i * 0.9 + 3 * (1 - t), i < 6 ? 2 : 1);
      }
      line(px, 13, 12, 3, 21, 1); line(px, 15, 13, 7, 21, 1);
      sphere(px, 16, 8, 4.2);
      S(px, 15, 6, 3); S(px, 14, 7, 3);
    },
    4: function (px) {   // 月：新月 + 隕石坑
      var x, y;
      for (y = 0; y < 24; y++) for (x = 0; x < 24; x++) {
        var dx = x + 0.5 - 12, dy = y + 0.5 - 12, d2 = dx * dx + dy * dy;
        var ex = x + 0.5 - 16.5, ey = y + 0.5 - 8.5, e2 = ex * ex + ey * ey;
        if (d2 <= 81 && e2 > 56) px[y][x] = (d2 > 66) ? 3 : 2;
      }
      S(px, 7, 13, 1); S(px, 8, 13, 1); S(px, 9, 17, 1); S(px, 6, 9, 1); S(px, 12, 19, 1);
    },
    5: function (px) {   // 行星：條紋球
      sphere(px, 12, 12, 8.6, { bands: 4 });
      S(px, 8, 7, 3); S(px, 9, 7, 3); S(px, 8, 8, 3);
    },
    6: function (px) {   // 環行星：球 + 斜環（後半被球擋住）
      var x, y, back = [], front = [];
      for (y = 0; y < 24; y++) for (x = 0; x < 24; x++) {
        var dx = x + 0.5 - 12, dy = (y + 0.5 - 12) - dx * 0.32;
        var e = (dx * dx) / (11.2 * 11.2) + (dy * dy) / (3.3 * 3.3);
        if (e > 0.72 && e < 1.0) (dy < 0 ? back : front).push([x, y]);
      }
      back.forEach(function (p) { px[p[1]][p[0]] = 1; });
      sphere(px, 12, 12, 6.2);
      front.forEach(function (p) { px[p[1]][p[0]] = 3; });
    },
    7: function (px) {   // 巨行星：大球 + 寬條紋 + 風暴眼
      sphere(px, 12, 12, 10.6, { bands: 3 });
      for (var y = 13; y <= 15; y++) for (var x = 13; x <= 17; x++) if (!((y === 13 || y === 15) && (x === 13 || x === 17))) px[y][x] = 3;
      px[14][15] = 1;
    },
    8: function (px) {   // 恆星：核心 + 8 道光芒 + 日冕點
      var k;
      for (k = 0; k < 8; k++) {
        var a = k * Math.PI / 4, l = (k & 1) ? 9 : 11;
        line(px, 12 + Math.cos(a) * 7, 12 + Math.sin(a) * 7, 12 + Math.cos(a) * l, 12 + Math.sin(a) * l, (k & 1) ? 1 : 2);
      }
      sphere(px, 12, 12, 6.4);
      for (var y = 0; y < 24; y++) for (var x = 0; x < 24; x++) if (px[y][x] === 2 && Math.abs(x - 12) + Math.abs(y - 12) < 5) px[y][x] = 3;
    },
    9: function (px) {   // 超新星：不規則尖刺 + 外圈震波
      var k, L = [11, 7, 10, 8, 11, 6, 10, 9, 11, 7, 9, 8];
      for (k = 0; k < 36; k++) {
        var a = k * Math.PI * 2 / 36, r = 10.5;
        if ((k % 3) === 0) S(px, 12 + Math.cos(a) * r, 12 + Math.sin(a) * r, 1);
      }
      for (k = 0; k < 12; k++) {
        var b = k * Math.PI / 6 + 0.2;
        line(px, 12, 12, 12 + Math.cos(b) * L[k], 12 + Math.sin(b) * L[k], 2);
      }
      sphere(px, 12, 12, 3.6);
      for (var y = 9; y <= 15; y++) for (var x = 9; x <= 15; x++) if (px[y][x] === 2) px[y][x] = 3;
    },
    10: function (px) {  // 脈衝星：小亮核 + 兩道錐形光束 + 磁環
      var i, x, y;
      for (i = 0; i < 11; i++) {
        var w = i * 0.42;
        for (var s = -w; s <= w; s += 0.5) {
          S(px, 12 + i * 0.55 + s, 12 - i, i < 5 ? 3 : 2);
          S(px, 12 - i * 0.55 - s, 12 + i, i < 5 ? 3 : 2);
        }
      }
      for (y = 0; y < 24; y++) for (x = 0; x < 24; x++) {
        var dx = x + 0.5 - 12, dy = y + 0.5 - 12, e = dx * dx / 64 + dy * dy / 9;
        if (e > 0.8 && e < 1.05 && px[y][x] === 0) px[y][x] = 1;
      }
      sphere(px, 12, 12, 3.1);
      px[11][11] = 3; px[11][12] = 3; px[12][11] = 3;
    },
    11: function (px) {  // 星系：雙旋臂
      var t, arm;
      for (arm = 0; arm < 2; arm++) for (t = 0; t < 70; t++) {
        var th = t * 0.11 + arm * Math.PI, r = 1.6 + t * 0.15;
        var x = 12 + Math.cos(th) * r, y = 12 + Math.sin(th) * r * 0.78;
        S(px, x, y, r < 4.5 ? 3 : (r < 8 ? 2 : 1));
        if (r < 7) S(px, x + 1, y, 2);
      }
      sphere(px, 12, 12, 2.6);
      px[11][11] = 3; px[11][12] = 3; px[12][12] = 3; px[12][11] = 3;
    },
    12: function (px) {  // 星系團：五個小星系 + 中央亮核 + 光暈點
      function mini(cx, cy, r, tilt) {
        for (var y = 0; y < 24; y++) for (var x = 0; x < 24; x++) {
          var dx = x + 0.5 - cx, dy = y + 0.5 - cy, ry = dy - dx * tilt, e = dx * dx / (r * r) + ry * ry / (r * r * 0.3);
          if (e <= 1) px[y][x] = e < 0.25 ? 3 : (e < 0.6 ? 2 : 1);
        }
      }
      mini(6, 6, 4, 0.5); mini(18, 6, 3.6, -0.6); mini(5, 17, 3.4, -0.4); mini(18, 18, 4.2, 0.4);
      sphere(px, 12, 12, 4.4);
      for (var y = 10; y <= 14; y++) for (var x = 10; x <= 14; x++) if (px[y][x] === 2) px[y][x] = 3;
      [[12, 2], [2, 12], [22, 12], [12, 22], [9, 20], [21, 9]].forEach(function (p) { S(px, p[0], p[1], 2); });
    }
  };
  function hole(px, phase) {   // 黑洞：中央全黑（色 0），外繞吸積盤（兩格動畫：亮點旋轉）
    var x, y;
    for (y = 0; y < 24; y++) for (x = 0; x < 24; x++) {
      var dx = x + 0.5 - 12, dy = (y + 0.5 - 12), d = Math.sqrt(dx * dx + dy * dy);
      var ry = dy - dx * 0.25, e = Math.sqrt(dx * dx / (11 * 11) + ry * ry / (4.2 * 4.2));
      var ang = Math.atan2(dy, dx) + phase * Math.PI / 4;
      if (d < 4.6) { px[y][x] = 0; continue; }
      if (d < 5.8) { px[y][x] = 1; continue; }
      if (e > 0.62 && e < 1.0) px[y][x] = (Math.floor((ang + 4 * Math.PI) / (Math.PI / 4)) & 1) ? 3 : 2;
      else if (d < 7.2 && (((x + y + phase) & 3) === 0)) px[y][x] = 1;
    }
  }
  function empty(px) {     // 空槽：四角括號 + 中心小點（色 1 = 暗灰）
    var k;
    for (k = 0; k < 4; k++) {
      px[2][2 + k] = 1; px[2 + k][2] = 1; px[2][21 - k] = 1; px[2 + k][21] = 1;
      px[21][2 + k] = 1; px[21 - k][2] = 1; px[21][21 - k] = 1; px[21 - k][21] = 1;
    }
    px[11][11] = 1; px[12][12] = 1; px[11][12] = 1; px[12][11] = 1;
  }
  function bigGlyph(g) {    // 8×8 字身放大成 16×16（色 3 本體 + 色 1 陰影）
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

  /* ---------------- 建 bank（同內容磚合併） ---------------- */
  var made = null;
  function build() {
    var BG = {}, alias = {}, seen = {};
    function key(t) { return Array.prototype.join.call(t, ''); }
    function add(name, t) {
      if (typeof t[0] === 'string') t = rowsToTile(t);
      var k = key(t);
      if (seen[k]) { alias[name] = seen[k]; return; }
      seen[k] = name; BG[name] = t;
    }
    add('SP', new Uint8Array(64));
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n]) add('F_' + n, FONT[n]);
    }
    var tier, k;
    for (tier = 1; tier <= 12; tier++) {
      var px = canvas(24, 24); DRAW[tier](px);
      slice(px).forEach(function (t, j) { add('T' + tier + '_' + j, t); });
    }
    for (k = 0; k < 2; k++) { var hp = canvas(24, 24); hole(hp, k); slice(hp).forEach(function (t, j) { add('HOLE' + k + '_' + j, t); }); }
    var ep = canvas(24, 24); empty(ep); slice(ep).forEach(function (t, j) { add('E_' + j, t); });
    add('FR_TL', ['........', '........', '........', '...11111', '...12222', '...12...', '...12...', '...12...']);
    add('FR_TR', ['........', '........', '........', '11111...', '22221...', '...21...', '...21...', '...21...']);
    add('FR_BL', ['...12...', '...12...', '...12...', '...12222', '...11111', '........', '........', '........']);
    add('FR_BR', ['...21...', '...21...', '...21...', '22221...', '11111...', '........', '........', '........']);
    add('FR_T', ['........', '........', '........', '11111111', '22222222', '........', '........', '........']);
    add('FR_B', ['........', '........', '........', '22222222', '11111111', '........', '........', '........']);
    add('FR_L', ['...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...']);
    add('FR_R', ['...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...']);
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.2......', '........', '........', '........', '........', '......1.', '........']);
    add('AL', ['........', '....3...', '...33...', '..333...', '...33...', '....3...', '........', '........']);
    add('AR', ['........', '..3.....', '..33....', '..333...', '..33....', '..3.....', '........', '........']);
    add('AX', ['........', '...3....', '...33...', '33333...', '...33...', '...3....', '........', '........']);
    add('SR1', ['...3....', '...3....', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    add('SR0', ['...1....', '...1....', '1111111.', '.1...1..', '..1.1...', '.11.11..', '.1...1..', '........']);
    'STARMEGU'.split('').forEach(function (ch) { slice(bigGlyph(FONT[CHARMAP[ch]])).forEach(function (t, j) { add('BIG_' + ch + j, t); }); });

    var SPR = {};
    SPR.SP = rowsToTile(['........', '........', '........', '........', '........', '........', '........', '........']);
    SPR.SPK0 = rowsToTile(['........', '...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........']);
    SPR.SPK1 = rowsToTile(['3.....3.', '.3.3.3..', '..333...', '.33333..', '..333...', '.3.3.3..', '3.....3.', '........']);
    SPR.SPK2 = rowsToTile(['3..2..3.', '........', '..2.2...', '2..1..2.', '..2.2...', '........', '3..2..3.', '........']);
    SPR.POP = rowsToTile(['........', '........', '...2....', '..232...', '...2....', '........', '........', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);

    var bg = CHR.bank('merge_bg', BG), spr = CHR.bank('merge_spr', SPR);
    function T(n) { var a = alias[n] || n; return bg.index(a); }
    made = {
      bg: bg, spr: spr, alias: alias,
      t: T,
      s: function (n) { return spr.index(n); },
      ch: function (c) {
        if (c === '★') c = '$';
        if (c === ' ') return 0;
        var n = CHARMAP[c];
        if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
        if (!n) return 0;
        var nm = 'F_' + n;
        return (bg.has(nm) || alias[nm]) ? T(nm) : 0;
      },
      tierTile: function (tier, j) { return T('T' + tier + '_' + j); }
    };
    return made;
  }
  MG.Art = { make: function () { return made || build(); } };
})();
