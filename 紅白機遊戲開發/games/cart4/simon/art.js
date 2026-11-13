/*
 * games/cart4/simon/art.js — 《星塵跟我做 STAR ECHO》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * **外觀刻意不做成「圓盤四色扇形」**：四個鍵是十字排列、彼此分開的四顆「星標」天體，各有自己的**形狀**
 * （色弱 / 黑白也分得出）：
 *   ↑ STAR 五角星（青）   → MOON 新月（金）   ↓ PLANET 環行星（洋紅）   ← COMET 彗星（綠）
 * 每顆 48×48（6×6 磚，背景名稱表），色 1 = 輪廓、色 2 = 本體、色 3 = 白色高光；亮燈 = 換那一組 BG 調色盤
 * （每幀 3 byte），文字一律用色 3（四組調色盤的色 3 都是白）⇒ 亮燈不影響文字。
 * 背景磚（simon_bg）：字型 F_*、P{0..3}_{0..35} 四顆星標、M{0..3}_{0..3} 16×16 迷你圖示（標題對照圖）、
 *   箭頭 AU/AD/AL/AR 各 2×2、核心框角 CR_*、星點 ST1/ST2、大字 BIG_*、愛心 HP1/HP0、計時條 BAR0..8、十字鍵 DP_*。
 * 精靈（simon_spr）：SPK0/SPK1 亮燈星芒、BADGE 「B」徽章（第二組）、ORB 繞行小星（第二組）、DOT 回選單提示。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SM = CT.Simon = CT.Simon || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  SM.PADS = [
    { key: 'STAR', dir: 'UP' }, { key: 'MOON', dir: 'RIGHT' }, { key: 'PLANET', dir: 'DOWN' }, { key: 'COMET', dir: 'LEFT' }
  ];

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

  /* ---------------- 四顆星標：歸一化座標 u,v ∈ [-1,1] 的形狀判定 → 本體 / 輪廓 / 高光 ---------------- */
  function inPoly(u, v, pts) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  var STAR_PTS = (function () {
    var p = [];
    for (var k = 0; k < 10; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 5, r = (k & 1) ? 0.40 : 0.96;
      p.push([Math.cos(a) * r, Math.sin(a) * r + 0.08]);
    }
    return p;
  })();
  // 回傳 0 = 空、2 = 本體、1 = 本體中的暗紋（之後再描輪廓 / 打高光）
  var SHAPE = [
    function star(u, v) { return inPoly(u, v, STAR_PTS) ? 2 : 0; },
    function moon(u, v) {
      var a = u * u + v * v <= 0.86 * 0.86;
      var b = (u - 0.36) * (u - 0.36) + (v + 0.26) * (v + 0.26) <= 0.70 * 0.70;
      if (!a || b) return 0;
      var cr = [[-0.52, 0.18, 0.11], [-0.18, 0.58, 0.09], [-0.62, -0.22, 0.07]];
      for (var i = 0; i < cr.length; i++) { var dx = u - cr[i][0], dy = v - cr[i][1]; if (dx * dx + dy * dy <= cr[i][2] * cr[i][2]) return 1; }
      return 2;
    },
    function planet(u, v) {
      var ca = Math.cos(-0.36), sa = Math.sin(-0.36);
      var ru = u * ca - v * sa, rv = u * sa + v * ca;
      var e = (ru * ru) / (0.98 * 0.98) + (rv * rv) / (0.30 * 0.30);
      var ring = e >= 0.62 && e <= 1.0, sph = u * u + v * v <= 0.54 * 0.54;
      if (sph && !(ring && rv > 0)) return (Math.floor((v + 1) * 7) % 3 === 0) ? 1 : 2;
      if (ring) return e < 0.78 ? 1 : 2;
      return 0;
    },
    function comet(u, v) {
      var hx = -0.50, hy = -0.14, hr = 0.36;
      var dx = u - hx, dy = v - hy;
      if (dx * dx + dy * dy <= hr * hr) return 2;
      if (u <= hx) return 0;
      var t = (u - hx) / (0.98 - hx);
      if (t > 1) return 0;
      var cy = hy + t * 0.40, w = hr * (1 - t * 0.85);
      if (Math.abs(v - cy) > w) return 0;
      // 尾巴三條流紋
      var band = Math.floor(((v - cy) / w + 1) * 2.5);
      return (band === 1 || band === 3) && t > 0.25 ? 1 : 2;
    }
  ];
  var HL = [[-0.16, -0.20, 0.16], [-0.58, -0.10, 0.14], [-0.22, -0.22, 0.16], [-0.62, -0.28, 0.12]];
  function shapePx(kind, size) {
    var px = canvas(size, size), x, y;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      var u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
      px[y][x] = SHAPE[kind](u, v);
    }
    // 輪廓：本體像素 4 鄰任一是空 ⇒ 色 1
    var out = canvas(size, size);
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      var c = px[y][x];
      if (!c) continue;
      var edge = !(y > 0 && px[y - 1][x]) || !(y < size - 1 && px[y + 1][x]) || !(x > 0 && px[y][x - 1]) || !(x < size - 1 && px[y][x + 1]);
      out[y][x] = edge ? 1 : c;
    }
    // 高光（色 3）
    var h = HL[kind];
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      if (out[y][x] !== 2) continue;
      var uu = (x + 0.5) / size * 2 - 1 - h[0], vv = (y + 0.5) / size * 2 - 1 - h[1];
      if (uu * uu + vv * vv <= h[2] * h[2]) out[y][x] = 3;
    }
    return out;
  }
  SM.shapePx = shapePx;

  function bigGlyph(g) {    // 8×8 字身放大成 16×16（色 3 本體 + 色 1 陰影）
    var px = canvas(16, 16), i, j, dx, dy, X, Y;
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (!g || g[j].charAt(i) === '.') continue;
      for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
        X = i * 2 + dx - 1; Y = j * 2 + dy;
        if (Y + 1 < 16 && X + 1 < 16 && X + 1 >= 0 && px[Y + 1][X + 1] === 0) px[Y + 1][X + 1] = 1;
        if (X >= 0) px[Y][X] = 3;
      }
    }
    return px;
  }
  function arrow16(dir) {   // 16×16 實心箭頭（色 3），dir 0 ↑ 1 → 2 ↓ 3 ←
    var px = canvas(16, 16), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      var u = x - 7.5, v = y - 7.5, a, b;   // a = 沿箭頭方向（往尖端為負）、b = 橫向
      if (dir === 0) { a = v; b = u; } else if (dir === 2) { a = -v; b = u; } else if (dir === 1) { a = -u; b = v; } else { a = u; b = v; }
      var head = a >= -6.5 && a <= 0 && Math.abs(b) <= (a + 6.5) * 0.9;
      var shaft = a > 0 && a <= 6 && Math.abs(b) <= 1.6;
      if (head || shaft) px[y][x] = 3;
    }
    return px;
  }

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
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()\'^';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n]) add('F_' + n, FONT[n]);
    }
    var k, j;
    for (k = 0; k < 4; k++) {
      slice(shapePx(k, 48)).forEach(function (t, jj) { add('P' + k + '_' + jj, t); });
      slice(shapePx(k, 16)).forEach(function (t, jj) { add('M' + k + '_' + jj, t); });
      slice(arrow16(k)).forEach(function (t, jj) { add('AW' + k + '_' + jj, t); });
    }
    add('CR_TL', ['33333...', '3.......', '3.......', '3.......', '3.......', '........', '........', '........']);
    add('CR_TR', ['...33333', '.......3', '.......3', '.......3', '.......3', '........', '........', '........']);
    add('CR_BL', ['........', '........', '........', '3.......', '3.......', '3.......', '3.......', '33333...']);
    add('CR_BR', ['........', '........', '........', '.......3', '.......3', '.......3', '.......3', '...33333']);
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.3......', '........', '........', '........', '........', '......1.', '........']);
    add('HP1', ['........', '.33.33..', '3333333.', '3333333.', '.33333..', '..333...', '...3....', '........']);
    add('HP0', ['........', '.11.11..', '1..1..1.', '1.....1.', '.1...1..', '..1.1...', '...1....', '........']);
    for (j = 0; j <= 8; j++) {     // 計時條：0..8 px 填滿
      var rows = [];
      for (var y = 0; y < 8; y++) {
        var s = '';
        for (var x = 0; x < 8; x++) s += (y === 2 || y === 5) ? '3' : ((y > 2 && y < 5 && x < j) ? '3' : (y > 2 && y < 5 ? '.' : '.'));
        rows.push(s);
      }
      add('BAR' + j, rows);
    }
    add('DP_C', ['.333333.', '33....33', '3......3', '3......3', '3......3', '3......3', '33....33', '.333333.']);
    'ECHOSTAR'.split('').forEach(function (ch) { slice(bigGlyph(FONT[CHARMAP[ch]])).forEach(function (t, jj) { add('BIG_' + ch + jj, t); }); });

    var SPR = {};
    SPR.SP = new Uint8Array(64);
    SPR.SPK0 = rowsToTile(['........', '...3....', '...3....', '.33233..', '...3....', '...3....', '........', '........']);
    SPR.SPK1 = rowsToTile(['3.....3.', '.3.3.3..', '..323...', '.32123..', '..323...', '.3.3.3..', '3.....3.', '........']);
    SPR.BADGE = rowsToTile(['.111111.', '11333311', '11311311', '11333111', '11311311', '11333311', '.111111.', '........']);
    SPR.ORB = rowsToTile(['........', '...3....', '..323...', '.32223..', '..323...', '...3....', '........', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    SPR.CUR = rowsToTile(['........', '..3.....', '..33....', '..333...', '..33....', '..3.....', '........', '........']);

    var bg = CHR.bank('simon_bg', BG), spr = CHR.bank('simon_spr', SPR);
    function T(nm) { var a = alias[nm] || nm; return bg.index(a); }
    made = {
      bg: bg, spr: spr, alias: alias, t: T,
      s: function (nm) { return spr.index(nm); },
      ch: function (c) {
        if (c === '★') c = '$';
        if (c === ' ') return 0;
        var nn = CHARMAP[c];
        if (nn === undefined && c >= 'a' && c <= 'z') nn = CHARMAP[c.toUpperCase()];
        if (!nn) return 0;
        var nm = 'F_' + nn;
        return (bg.has(nm) || alias[nm]) ? T(nm) : 0;
      }
    };
    return made;
  }
  SM.Art = { make: function () { return made || build(); } };
})();
