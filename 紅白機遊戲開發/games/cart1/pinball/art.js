/*
 * games/cart1/pinball/art.js — 《星塵彈珠台》CHR 與桌面名稱表（全部原創、程式化繪製）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：engine/chr.js（NES.CHR）、pinball/phys.js（桌面幾何）
 *
 * 作法：用 phys.js 的同一份幾何資料，把整張桌面（256 × 448）「畫」進 2bpp 像素緩衝，
 *       再切成 8×8 磚並去重 ⇒ 背景圖樣表（pinball_bg，≤ 256 磚）+ 名稱表 / 屬性表。
 *       物理線段與畫面線條同源 ⇒ 看到的牆就是撞到的牆。
 *   燈號（S T A R 滾道 / 倍率 / SAVE / 落下靶 / 立靶 / 星洞）各自佔用不共用的磚格：
 *       桌面畫兩次（全滅 / 全亮），每顆燈記下自己的磚格與「亮 / 滅」兩組磚 ⇒ 開關燈只寫幾個 byte。
 *   擋板 8 個角度影格（3×3 磚）、球、發射桿、標題大字 → 精靈 / 背景磚。
 *
 * 2bpp 色義（背景）：1 = 暗部 / 填色，2 = 主色，3 = 亮部。精靈同。
 * 背景調色盤組：0 桌框（藍）、1 保險桿 / 彈弓（紅）、2 燈號（灰→黃）、3 狀態列（白）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PB = CT.Pinball = CT.Pinball || {};
  var CHR = NES.CHR, P = PB.Phys;

  var W = 256, H = 480, ROWS = 60, COLS = 32;
  var TABLE_ROWS = 56;               // 0..55 = 桌面；56..59 = 狀態列（下方名稱表 row 26..29）

  /* ---------------- 字型（沿用 engine/chr.js 原創 DEMO.FONT 的字身） ---------------- */
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = { ' ': 'SP', '.': 'DOT', ',': 'COMMA', ':': 'COLON', '-': 'DASH', '!': 'EXCL', '?': 'QUEST',
                  '/': 'SLASH', '+': 'PLUS', '=': 'EQ', 'x': 'MUL', '>': 'ARROW', '$': 'STAR', '^': 'HEART' };
  (function () {
    var i;
    for (i = 0; i <= 9; i++) CHARMAP[String(i)] = 'N' + i;
    for (i = 65; i <= 90; i++) CHARMAP[String.fromCharCode(i)] = String.fromCharCode(i);
  })();
  function glyph(ch) {
    var n = CHARMAP[ch];
    if (n === undefined && ch >= 'a' && ch <= 'z') n = CHARMAP[ch.toUpperCase()];
    return FONT[n] || FONT.SP || ['........', '........', '........', '........', '........', '........', '........', '........'];
  }

  /* ---------------- 2bpp 像素畫布 ---------------- */
  function Canvas(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h); this.attr = new Int8Array((w >> 4) * (h >> 4)).fill(-1); }
  Canvas.prototype.set = function (x, y, c, pal) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
    if (pal !== undefined && pal >= 0) {
      var ai = (y >> 4) * (this.w >> 4) + (x >> 4);
      if (this.attr[ai] < pal) this.attr[ai] = pal;     // 數字大者優先（燈 2 > 紅 1 > 框 0）
    }
  };
  Canvas.prototype.get = function (x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.px[y * this.w + x]; };

  // 像素中心到線段的距離平方（Q4 = 1/16 px，整數）
  function dist2Seg(x, y, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, px = x - x1, py = y - y1;
    var l2 = dx * dx + dy * dy, t = px * dx + py * dy, cx, cy;
    if (l2 === 0 || t <= 0) { cx = x1; cy = y1; } else if (t >= l2) { cx = x2; cy = y2; }
    else { cx = x1 + Math.floor(dx * t / l2); cy = y1 + Math.floor(dy * t / l2); }
    return (x - cx) * (x - cx) + (y - cy) * (y - cy);
  }
  // 膠囊線：rings = [[半徑Q4, 色], ...]（由外到內）
  function capsule(cv, x1, y1, x2, y2, rings, pal) {
    var R = rings[0][0], q = 16;
    var X1 = x1 * q, Y1 = y1 * q, X2 = x2 * q, Y2 = y2 * q;
    var minx = Math.floor(Math.min(x1, x2) - R / q - 1), maxx = Math.ceil(Math.max(x1, x2) + R / q + 1);
    var miny = Math.floor(Math.min(y1, y2) - R / q - 1), maxy = Math.ceil(Math.max(y1, y2) + R / q + 1);
    for (var y = miny; y <= maxy; y++) {
      for (var x = minx; x <= maxx; x++) {
        var d2 = dist2Seg(x * q + 8, y * q + 8, X1, Y1, X2, Y2), c = -1;
        for (var k = 0; k < rings.length; k++) if (d2 <= rings[k][0] * rings[k][0]) c = rings[k][1];
        if (c >= 0) cv.set(x, y, c, pal);
      }
    }
  }
  function disc(cv, cx, cy, rings, pal) { capsule(cv, cx, cy, cx, cy, rings, pal); }
  function rect(cv, x, y, w, h, c, pal) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) cv.set(x + i, y + j, c, pal); }
  function blitGlyph(cv, x, y, ch, color, pal) {
    var g = glyph(ch);
    for (var j = 0; j < 8; j++) for (var i = 0; i < 8; i++) {
      if (g[j].charAt(i) !== '.') cv.set(x + i, y + j, color, pal);
    }
    if (pal !== undefined) { cv.set(x, y, cv.get(x, y), pal); }
  }
  // 點在多邊形內（偶奇規則；像素中心）
  function inPoly(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0] * 2, yi = pts[i][1] * 2, xj = pts[j][0] * 2, yj = pts[j][1] * 2;
      var X = x * 2 + 1, Y = y * 2 + 1;
      if ((yi > Y) !== (yj > Y) && X < xi + (xj - xi) * (Y - yi) / (yj - yi)) inside = !inside;
    }
    return inside;
  }
  function fillPoly(cv, pts, fn, pal) {
    var minx = 999, maxx = -1, miny = 999, maxy = -1, i;
    for (i = 0; i < pts.length; i++) {
      minx = Math.min(minx, pts[i][0]); maxx = Math.max(maxx, pts[i][0]);
      miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]);
    }
    for (var y = miny; y <= maxy; y++) for (var x = minx; x <= maxx; x++) {
      if (inPoly(pts, x, y)) { var c = fn(x, y); if (c >= 0) cv.set(x, y, c, pal); }
    }
  }
  var CHECK = function (x, y) { return ((x & 3) === 0 && (y & 3) === 0) ? 2 : 1; };
  var DOTS = function (x, y) { return ((x & 3) === 0 && (y & 3) === 0) ? 1 : 0; };

  /* ---------------- 燈號定義（每顆燈一個矩形磚格範圍） ---------------- */
  // {id, kind, cells:[[col,row],...], draw(cv, on)}
  var LIGHTS = [];
  function light(id, draw, x0, y0, x1, y1) {
    var cells = [], c, r;
    for (r = y0 >> 3; r <= y1 >> 3; r++) for (c = x0 >> 3; c <= x1 >> 3; c++) cells.push([c, r]);
    LIGHTS.push({ id: id, cells: cells, draw: draw, off: [], on: [] });
  }
  // 滾道字母 S T A R
  'STAR'.split('').forEach(function (ch, i) {
    var x = P.LANES[i] - 4, y = 48;
    light('lane' + i, function (cv, on) { blitGlyph(cv, x, y, ch, on ? 3 : 1, 2); }, x, y, x + 7, y + 7);
  });
  // 倍率 2x 3x 4x 5x
  [2, 3, 4, 5].forEach(function (m, i) {
    var x = 64 + i * 32, y = 288;
    light('mult' + m, function (cv, on) { blitGlyph(cv, x, y, String(m), on ? 3 : 1, 2); blitGlyph(cv, x + 8, y, 'x', on ? 3 : 1, 2); }, x, y, x + 15, y + 7);
  });
  // SAVE（救球）
  light('save', function (cv, on) {
    'SAVE'.split('').forEach(function (ch, i) { blitGlyph(cv, 104 + i * 8, 424, ch, on ? 3 : 1, 2); });
  }, 104, 424, 135, 431);
  // 落下靶 ×3（立起 = 亮塊；倒下 = 虛線槽）
  P.DROPS.forEach(function (d, i) {
    light('drop' + i, function (cv, on) {
      if (on) { rect(cv, d[0] - 2, d[1], 5, d[3] - d[1] + 1, 2, 2); rect(cv, d[0] - 1, d[1] + 1, 2, d[3] - d[1] - 1, 3, 2); }
      else { for (var y = d[1]; y <= d[3]; y += 2) cv.set(d[0], y, 1, 2); }
    }, 16, d[1], 23, d[3]);
  });
  // 立靶 ×3（亮 = 被打中過）
  P.STANDUPS.forEach(function (s, i) {
    light('stand' + i, function (cv, on) {
      rect(cv, s[0], s[1] - 2, s[2] - s[0] + 1, 5, on ? 3 : 2, 2);
      rect(cv, s[0] + 2, s[1] - 1, s[2] - s[0] - 3, 3, on ? 2 : 1, 2);
    }, s[0], s[1] - 2, s[2], s[1] + 2);
  });
  // 星洞（亮 = 大獎點亮）
  light('saucer', function (cv, on) {
    var S = P.SAUCER;
    disc(cv, S.x, S.y, [[7 * 16, 2], [5 * 16, 1], [3 * 16, on ? 3 : 0]], 2);
  }, P.SAUCER.x - 8, P.SAUCER.y - 8, P.SAUCER.x + 7, P.SAUCER.y + 7);

  /* ---------------- 桌面本體 ---------------- */
  function drawTable(cv, allOn) {
    var i;
    // 外框以外（上方拱頂外側、左右邊）填格紋
    var outline = [[12, 448], [12, 64], [28, 32], [60, 16], [180, 16], [212, 32], [244, 64], [244, 448]];
    for (var y = 0; y < 448; y++) for (var x = 0; x < W; x++) {
      if (!inPoly(outline, x, y) && CHECK(x, y)) cv.set(x, y, 1, 0);
    }
    // 引導軌下方 / 彈弓內部
    fillPoly(cv, [[12, 357], [92, 397], [92, 448], [12, 448]], CHECK, 0);
    fillPoly(cv, [[228, 357], [148, 397], [148, 448], [228, 448]], CHECK, 0);
    fillPoly(cv, [[40, 312], [64, 360], [40, 348]], DOTS, 1);
    fillPoly(cv, [[200, 312], [176, 360], [200, 348]], DOTS, 1);
    // 中央裝飾：燈塔星芒（不參與物理）
    var cx = 120, cyy = 196;
    capsule(cv, cx - 24, cyy, cx + 24, cyy, [[8, 1]], -1);
    capsule(cv, cx, cyy - 24, cx, cyy + 24, [[8, 1]], -1);
    disc(cv, cx, cyy, [[6 * 16, 1], [4 * 16, 2], [2 * 16, 3]], 0);
    // 發射道箭頭
    for (i = 0; i < 3; i++) {
      var ay = 360 - i * 48;
      capsule(cv, 236, ay, 232, ay + 4, [[8, 1]], -1);
      capsule(cv, 236, ay, 240, ay + 4, [[8, 1]], -1);
    }
    // 牆 / 引導軌 / 柱 / 彈弓
    P.WALLS.forEach(function (w) {
      var kind = w[5], pal = (kind === 'sling' || (w[0] >= 40 && w[0] <= 64 && w[1] >= 312) || (w[0] >= 176 && w[0] <= 200 && w[1] >= 312)) ? 1 : 0;
      if (kind === 'post') capsule(cv, w[0], w[1], w[2], w[3], [[40, 1], [28, 2], [12, 3]], 0);
      else if (kind === 'sling') capsule(cv, w[0], w[1], w[2], w[3], [[32, 1], [22, 2], [10, 3]], 1);
      else capsule(cv, w[0], w[1], w[2], w[3], [[32, 1], [22, 2], [10, 3]], pal);
    });
    // 保險桿
    P.BUMPERS.forEach(function (b) {
      disc(cv, b[0], b[1], [[b[2] * 16 + 8, 1], [b[2] * 16 - 10, 2], [6 * 16, 3], [4 * 16, 1], [2 * 16, 3]], 1);
    });
    // 燈
    for (i = 0; i < LIGHTS.length; i++) LIGHTS[i].draw(cv, allOn);
  }

  /* ---------------- 切磚 + 去重 ---------------- */
  function tileRows(cv, col, row) {
    var rows = [], j, i, s;
    for (j = 0; j < 8; j++) {
      s = '';
      for (i = 0; i < 8; i++) s += '.123'.charAt(cv.get(col * 8 + i, row * 8 + j));
      rows.push(s);
    }
    return rows;
  }
  // 小星星（背景點綴，放在空磚格）
  var STAR_A = ['........', '........', '....1...', '...121..', '....1...', '........', '........', '........'];
  var STAR_B = ['........', '.1......', '........', '........', '........', '......1.', '........', '........'];
  var BLANK = ['........', '........', '........', '........', '........', '........', '........', '........'];

  function build() {
    var off = new Canvas(W, H), on = new Canvas(W, H);
    drawTable(off, false);
    drawTable(on, true);
    var tiles = { BLANK: BLANK }, order = ['BLANK'], key2name = {};
    key2name[BLANK.join('')] = 'BLANK';
    function intern(rows) {
      var k = rows.join('');
      if (key2name[k]) return key2name[k];
      var name = 'T' + order.length;
      key2name[k] = name; tiles[name] = rows; order.push(name);
      return name;
    }
    intern(STAR_A); intern(STAR_B);
    var map = new Array(COLS * TABLE_ROWS), c, r;
    for (r = 0; r < TABLE_ROWS; r++) for (c = 0; c < COLS; c++) map[r * COLS + c] = intern(tileRows(off, c, r));
    // 星點綴：空格 + 雜湊
    for (r = 2; r < 54; r++) for (c = 2; c < 30; c++) {
      var h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      if (map[r * COLS + c] === 'BLANK' && (h % 29) === 0 && off.attr[(r >> 1) * 16 + (c >> 1)] <= 0) map[r * COLS + c] = (h & 64) ? key2name[STAR_A.join('')] : key2name[STAR_B.join('')];
    }
    // 燈：亮 / 滅兩組磚
    var used = {};
    LIGHTS.forEach(function (L) {
      L.off = []; L.on = [];
      L.cells.forEach(function (cr) {
        var k = cr[0] + ',' + cr[1];
        if (used[k]) throw new Error('pinball art：燈 ' + L.id + ' 與 ' + used[k] + ' 共用磚格 ' + k);
        used[k] = L.id;
        L.off.push(map[cr[1] * COLS + cr[0]]);
        L.on.push(intern(tileRows(on, cr[0], cr[1])));
      });
    });
    // 屬性（16×16）
    var attr = new Array(16 * 30);
    for (r = 0; r < 28; r++) for (c = 0; c < 16; c++) { var a = off.attr[r * 16 + c]; attr[r * 16 + c] = a < 0 ? 0 : a; }
    for (r = 28; r < 30; r++) for (c = 0; c < 16; c++) attr[r * 16 + c] = 3;
    return { tiles: tiles, order: order, map: map, attr: attr, used: used };
  }

  /* ---------------- 標題大字（8×8 字身放大 2 倍 + 立體陰影 → 16×16 = 4 磚） ---------------- */
  function bigLetter(ch) {
    var g = glyph(ch), cv = new Canvas(16, 16), i, j;
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (g[j].charAt(i) === '.') continue;
      var col = j < 3 ? 3 : 2;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var X = i * 2 + dx - 1, Y = j * 2 + dy;
        if (cv.get(X + 1, Y + 1) === 0) cv.set(X + 1, Y + 1, 1);
        cv.set(X, Y, col);
      }
    }
    return [tileRows(cv, 0, 0), tileRows(cv, 1, 0), tileRows(cv, 0, 1), tileRows(cv, 1, 1)];
  }
  // 標題框線
  var FRAME = {
    FR_H: ['........', '........', '........', '33333333', '22222222', '........', '........', '........'],
    FR_V: ['...32...', '...32...', '...32...', '...32...', '...32...', '...32...', '...32...', '...32...'],
    FR_TL: ['........', '........', '........', '...33333', '...32222', '...32...', '...32...', '...32...'],
    FR_TR: ['........', '........', '........', '33333...', '22223...', '...32...', '...32...', '...32...'],
    FR_BL: ['...32...', '...32...', '...32...', '...33333', '...22222', '........', '........', '........'],
    FR_BR: ['...32...', '...32...', '...32...', '33333...', '22222...', '........', '........', '........'],
    HUDBAR: ['........', '........', '........', '22222222', '11111111', '........', '........', '........']
  };

  /* ---------------- 精靈：球、發射桿、擋板 8 影格 ---------------- */
  var BALL = ['..1111..', '.122331.', '12223331', '12222231', '12222221', '11222221', '.111221.', '..1111..'];
  var PLUNGE = [
    ['.111111.', '.123321.', '.111111.', '...22...', '..2..2..', '...22...', '..2..2..', '...22...'],
    ['.111111.', '.123321.', '.111111.', '...22...', '..2222..', '..2..2..', '..2222..', '...22...'],
    ['.111111.', '.123321.', '.111111.', '..2222..', '..2222..', '..2222..', '..2222..', '..2222..']
  ];
  var FLIP_FRAMES = 8;
  function flipAngle(k) { return P.FL.REST + Math.round((P.FL.UP - P.FL.REST) * k / (FLIP_FRAMES - 1)); }
  function flipFrameFor(a) {
    var k = Math.round((a - P.FL.REST) * (FLIP_FRAMES - 1) / (P.FL.UP - P.FL.REST));
    return k < 0 ? 0 : (k > FLIP_FRAMES - 1 ? FLIP_FRAMES - 1 : k);
  }
  var FLIP_PX = 4, FLIP_PY = 12;     // 支點在 24×24 影格內的位置（左擋板）
  function flipFrame(k) {
    var a = flipAngle(k), cv = new Canvas(24, 24), q = 16;
    var X1 = FLIP_PX * q, Y1 = FLIP_PY * q;
    var X2 = X1 + Math.floor(18 * q * P.cos(a) / 256), Y2 = Y1 + Math.floor(18 * q * P.sin(a) / 256);
    for (var y = 0; y < 24; y++) for (var x = 0; x < 24; x++) {
      var px = x * q + 8, py = y * q + 8;
      var d2 = dist2Seg(px, py, X1, Y1, X2, Y2);
      // 由支點 3.5 px 漸細到尖端 2.5 px
      var dd = (px - X1) * (X2 - X1) + (py - Y1) * (Y2 - Y1), l2 = (X2 - X1) * (X2 - X1) + (Y2 - Y1) * (Y2 - Y1);
      var t = Math.max(0, Math.min(256, Math.floor(dd * 256 / l2)));
      var R = 56 - Math.floor(16 * t / 256);         // Q4：3.5 → 2.5 px
      if (d2 > R * R) continue;
      var c = 2;
      if (d2 > (R - 16) * (R - 16)) c = 1;
      else {
        // 線上方（叉積 < 0）且靠中線 ⇒ 高光
        var cr = (X2 - X1) * (py - Y1) - (Y2 - Y1) * (px - X1);
        if (cr < 0 && d2 > 4 * 4 * 4) c = 3;
      }
      var dp = (px - X1) * (px - X1) + (py - Y1) * (py - Y1);
      if (dp <= 20 * 20) c = 3;
      if (dp <= 10 * 10) c = 1;
      cv.set(x, y, c);
    }
    var out = [], tx, ty;
    for (ty = 0; ty < 3; ty++) for (tx = 0; tx < 3; tx++) {
      var rows = tileRows(cv, tx, ty);
      out.push(rows.join('') === BLANK.join('') ? null : rows);
    }
    return out;
  }

  /* ---------------- 建 bank ---------------- */
  var ART = null;
  function make() {
    if (ART) return ART;
    var T = build();
    var bg = {}, k;
    T.order.forEach(function (n) { bg[n] = T.tiles[n]; });
    // 字型 + 框 + 大字（bank 不認得的名字才加）
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/+!x:';
    for (k = 0; k < USED.length; k++) { var fn = CHARMAP[USED.charAt(k)]; if (FONT[fn]) bg['F_' + fn] = FONT[fn]; }
    for (k in FRAME) if (Object.prototype.hasOwnProperty.call(FRAME, k)) bg[k] = FRAME[k];
    var BIG = 'PINBAL';
    BIG.split('').forEach(function (ch) { var t = bigLetter(ch); bg['BIG_' + ch + '0'] = t[0]; bg['BIG_' + ch + '1'] = t[1]; bg['BIG_' + ch + '2'] = t[2]; bg['BIG_' + ch + '3'] = t[3]; });
    var bgBank = CHR.bank('pinball_bg', bg);
    // 精靈
    var spr = { BLANK: BLANK, BALL: BALL, PL0: PLUNGE[0], PL1: PLUNGE[1], PL2: PLUNGE[2] };
    var flipIdx = [], f, i;
    for (f = 0; f < FLIP_FRAMES; f++) {
      var fr = flipFrame(f), names = [];
      for (i = 0; i < 9; i++) { if (fr[i]) { spr['FL' + f + '_' + i] = fr[i]; names.push('FL' + f + '_' + i); } else names.push(null); }
      flipIdx.push(names);
    }
    var sprBank = CHR.bank('pinball_spr', spr);
    var flipTiles = flipIdx.map(function (names) { return names.map(function (n) { return n ? sprBank.index(n) : -1; }); });
    ART = {
      bg: bgBank, spr: sprBank, T: T, LIGHTS: LIGHTS, flipTiles: flipTiles, flipFrameFor: flipFrameFor,
      FLIP_PX: FLIP_PX, FLIP_PY: FLIP_PY, TABLE_ROWS: TABLE_ROWS,
      tileOf: function (name) { return bgBank.index(name); },
      textTiles: function (s) {
        var out = [], i, n;
        s = String(s);
        for (i = 0; i < s.length; i++) {
          n = CHARMAP[s.charAt(i)];
          if (n === undefined && s.charAt(i) >= 'a' && s.charAt(i) <= 'z') n = CHARMAP[s.charAt(i).toUpperCase()];
          out.push(!n || n === 'SP' || !bg['F_' + n] ? 0 : bgBank.index('F_' + n));
        }
        return out;
      },
      bigTiles: function (ch) { return [0, 1, 2, 3].map(function (q) { return bgBank.index('BIG_' + ch + q); }); },
      light: function (id) { for (var i = 0; i < LIGHTS.length; i++) if (LIGHTS[i].id === id) return LIGHTS[i]; return null; }
    };
    return ART;
  }

  PB.Art = { make: make, LIGHTS: LIGHTS, Canvas: Canvas, glyph: glyph };
})();
