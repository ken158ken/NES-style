/*
 * games/cart5/adventure/art.js — 《星塵冒險》美術：場景圖（程式化像素畫 → 8×8 磁磚去重）+ 精靈（人物 / 道具）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-3 cart5-adventure（R9）｜ 全部原創。
 *
 * 場景圖 144×112 px（18×14 格、9×7 屬性區塊）。每張圖由 Painter 指令畫成 2bpp 索引圖 + 屬性表，
 * 切成 8×8 磁磚去重；超過 PIC_SLOTS（96）就把最相近的兩塊合併（像真機美術師省磁磚），測試驗合併數。
 * 執行期換場景時在 CT.blank（= 關畫面）裡把這些磁磚寫進背景 bank 的 PIC0.. 保留區（像 CHR-RAM），
 * 所以每張圖都能有自己的一組磁磚。
 * 調色盤：bg0 固定 = 文字（深藍框 / 天藍框 / 白字），場景也可借用畫夜空；bg1~3 每張圖自訂。
 * 輸出：CT.Adv.Art = { picture(id, variant) → {w,h,tiles[],map[],attr[],pals[3],merged,unique}, PIC_SLOTS, SPR, sprBank(), Painter }
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var A = CT.Adv = CT.Adv || {};

  var PIC_SLOTS = 84;
  var TEXT_PAL = [0x01, 0x21, 0x30];

  /* ============================== Painter ============================== */
  function Painter(w, h) {
    this.w = w; this.h = h;
    this.px = new Uint8Array(w * h);
    this.bw = w >> 4; this.bh = h >> 4;
    this.at = new Uint8Array(this.bw * this.bh);
  }
  var P = Painter.prototype;
  P.p = function (x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; return this; };
  P.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.px[y * this.w + x] : 0; };
  P.rect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.p(x + i, y + j, c); return this; };
  P.hl = function (x, y, n, c) { return this.rect(x, y, n, 1, c); };
  P.vl = function (x, y, n, c) { return this.rect(x, y, 1, n, c); };
  P.frame = function (x, y, w, h, c) { this.hl(x, y, w, c); this.hl(x, y + h - 1, w, c); this.vl(x, y, h, c); this.vl(x + w - 1, y, h, c); return this; };
  P.line = function (x0, y0, x1, y1, c) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (;;) { this.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return this;
  };
  P.ell = function (cx, cy, rx, ry, c) {
    for (var y = -ry; y <= ry; y++) for (var x = -rx; x <= rx; x++)
      if ((x * x) / ((rx + 0.5) * (rx + 0.5)) + (y * y) / ((ry + 0.5) * (ry + 0.5)) <= 1) this.p(cx + x, cy + y, c);
    return this;
  };
  P.circ = function (cx, cy, r, c) { return this.ell(cx, cy, r, r, c); };
  P.ring = function (cx, cy, r, c) {
    for (var y = -r - 1; y <= r + 1; y++) for (var x = -r - 1; x <= r + 1; x++) {
      var d = Math.sqrt(x * x + y * y);
      if (d <= r + 0.5 && d > r - 0.6) this.p(cx + x, cy + y, c);
    }
    return this;
  };
  P.poly = function (pts, c) {
    var minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < pts.length; i++) { minY = Math.min(minY, pts[i][1]); maxY = Math.max(maxY, pts[i][1]); }
    for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      var xs = [], yc = y + 0.5;
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (i = 0; i + 1 < xs.length; i += 2) for (var x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.p(x, y, c);
    }
    return this;
  };
  // 棋盤格半色調（c2 落在 (x+y) 奇數格）
  P.dith = function (x, y, w, h, c1, c2) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.p(x + i, y + j, ((x + i + y + j) & 1) ? c2 : c1); return this; };
  // 稀疏半色調（每 4 格一點）
  P.sparse = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) if (((x + i) & 3) === 0 && ((y + j) & 3) === ((((x + i) >> 2) & 1) * 2)) this.p(x + i, y + j, c); return this; };
  // ascii 圖章：'.' 透明、'0'~'3' 色號
  P.stamp = function (x, y, rows) {
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
      var ch = rows[j].charAt(i); if (ch !== '.') this.p(x + i, y + j, ch.charCodeAt(0) - 48);
    }
    return this;
  };
  // 屬性：block 座標
  P.attr = function (bx, by, bw, bh, pal) {
    for (var j = 0; j < bh; j++) for (var i = 0; i < bw; i++) {
      var X = bx + i, Y = by + j; if (X >= 0 && Y >= 0 && X < this.bw && Y < this.bh) this.at[Y * this.bw + X] = pal;
    }
    return this;
  };
  // 星星：small = 1 點、mid = 十字、big = 十字 + 中心亮
  P.star = function (x, y, size, c1, c3) {
    if (size === 0) return this.p(x, y, c3);
    if (size === 1) { this.p(x, y, c3); this.p(x - 1, y, c1); this.p(x + 1, y, c1); this.p(x, y - 1, c1); this.p(x, y + 1, c1); return this; }
    this.p(x, y, c3); this.p(x - 1, y, c3); this.p(x + 1, y, c3); this.p(x, y - 1, c3); this.p(x, y + 1, c3);
    this.p(x - 2, y, c1); this.p(x + 2, y, c1); this.p(x, y - 2, c1); this.p(x, y + 2, c1); return this;
  };
  // 星空：固定種子亂數撒星（只撒在格子內固定位置 ⇒ 去重友善）
  P.stars = function (x, y, w, h, n, seed, c1, c3, avoid) {
    var s = seed | 0 || 7;
    function R() { s = (s * 1103515245 + 12345) & 0x7FFFFFFF; return s / 0x7FFFFFFF; }
    for (var k = 0; k < n; k++) {
      var sx = x + 2 + Math.floor(R() * (w - 4)), sy = y + 2 + Math.floor(R() * (h - 4)), sz = R() < 0.6 ? 0 : (R() < 0.75 ? 1 : 2);
      if (avoid && avoid(sx, sy)) continue;
      this.star(sx, sy, sz, c1, c3);
    }
    return this;
  };
  // 雲團：一排圓
  // 週期 16 px（去重友善）：大小兩種圓交錯
  P.cloudRow = function (x0, x1, y, r, c, seed) {
    var ph = ((seed || 0) % 2) * 8, x = Math.floor(x0 / 16) * 16 - 16 + ph;
    for (; x <= x1 + 16; x += 8) { var big = ((x - ph) & 15) === 0; this.circ(x, y + (big ? 0 : 2), big ? r + 2 : r, c); }
    return this;
  };

  /* ============================== 共用構件 ============================== */
  function skyNight(p, h, seed, n) { p.rect(0, 0, p.w, h, 0); p.stars(0, 0, p.w, h, n || 26, seed, 2, 3); }
  function trees(p, x0, x1, top, bottom, seed, cTrunk, cDark, cLeaf) {
    var s = seed;
    for (var x = x0; x < x1; x += 16) {
      s = (s * 29 + 7) % 97;
      var w = 8 + (s % 3) * 2, tx = x + (s % 5);
      p.rect(tx, top + 8, w, bottom - top - 8, cTrunk);
      for (var y = top + 8; y < bottom; y += 4) p.p(tx + 2 + ((y >> 2) & 1) * 3, y, cDark);
      p.vl(tx, top + 8, bottom - top - 8, cDark);
    }
    for (var k = x0 - 8; k < x1 + 8; k += 12) { s = (s * 29 + 7) % 97; p.circ(k, top + (s % 7), 10 + (s % 4), cLeaf); }
    for (k = x0 - 2; k < x1 + 8; k += 12) { s = (s * 29 + 7) % 97; p.circ(k, top - 6 + (s % 5), 7, cDark); }
  }
  function planksV(p, x, y, w, h, cBase, cLine, step) {
    p.rect(x, y, w, h, cBase);
    for (var i = x; i < x + w; i += step) p.vl(i, y, h, cLine);
  }
  function planksH(p, x, y, w, h, cBase, cLine, step) {
    p.rect(x, y, w, h, cBase);
    for (var j = y; j < y + h; j += step) p.hl(x, j, w, cLine);
    for (j = y; j < y + h; j += step) for (var i = x + ((j / step) & 1) * 16; i < x + w; i += 32) p.vl(i, j, step, cLine);
  }

  /* ============================== 場景圖 ============================== */
  // 每張：function(p, v) → pals（bg1~3 的 3 色）；p 已清 0；v = 變體
  var PICS = {};

  // 1 閣樓小屋（夜 / 晨）
  PICS.room = function (p, v) {
    var morning = v === 'morning';
    p.attr(0, 0, 9, 7, 1);
    planksV(p, 0, 0, 144, 112, 2, 1, 16);                 // 木牆 pal1
    p.poly([[0, 0], [52, 0], [0, 30]], 1); p.line(0, 30, 52, 0, 3); p.line(0, 31, 53, 0, 1);
    p.poly([[92, 0], [144, 0], [144, 30]], 1); p.line(92, 0, 144, 30, 3); p.line(91, 0, 143, 31, 1);
    // 圓窗（玻璃 x 64..111, y 8..55 = 區塊 4..6 × 0..3 用 pal3）
    p.rect(60, 4, 56, 56, 1); p.frame(60, 4, 56, 56, 3);
    p.rect(64, 8, 48, 48, morning ? 2 : 1);
    if (morning) {
      p.circ(96, 22, 6, 3); p.cloudRow(66, 110, 44, 5, 3, 5);
      p.rect(72, 30, 3, 14, 1); p.rect(71, 27, 5, 3, 1);            // 遠方燈塔
    } else {
      p.stars(64, 8, 48, 30, 10, 11, 2, 3);
      p.rect(64, 44, 48, 12, 2); p.cloudRow(64, 112, 44, 4, 2, 9);  // 雲海
      p.rect(78, 26, 4, 18, 0); p.rect(77, 23, 6, 3, 0); p.p(79, 21, 0); p.p(80, 21, 0);
    }
    p.rect(87, 8, 2, 48, 0); p.rect(64, 31, 48, 2, 0);             // 窗框十字
    p.attr(4, 0, 3, 4, 3);
    // 床（左下，pal2 被子）
    p.rect(0, 70, 64, 42, 0);
    p.rect(2, 68, 6, 44, 3); p.rect(2, 66, 6, 2, 1);               // 床柱
    p.rect(8, 74, 52, 10, 3); p.rect(10, 76, 14, 7, 3);            // 枕頭
    p.rect(8, 84, 56, 22, 1); p.dith(8, 84, 56, 22, 1, 2);
    for (var i = 8; i < 64; i += 16) for (var j = 84; j < 106; j += 11) p.rect(i, j, 8, 5, 3);
    p.hl(8, 84, 56, 3);
    p.attr(0, 4, 4, 3, 2);
    // 書桌（右下，木 pal1）
    p.rect(88, 72, 56, 6, 3); p.hl(88, 78, 56, 1); p.rect(92, 78, 6, 34, 1); p.rect(134, 78, 6, 34, 1);
    p.rect(104, 80, 26, 12, 1); p.frame(104, 80, 26, 12, 3); p.rect(115, 85, 4, 2, 3);
    // 地板
    p.rect(0, 106, 144, 6, 1); p.hl(0, 106, 144, 3);
    return [[0x07, 0x17, 0x27], [0x05, 0x15, 0x37], morning ? [0x21, 0x31, 0x30] : [0x02, 0x12, 0x30]];
  };

  // 2 星港廣場
  PICS.plaza = function (p, v) {
    p.stars(0, 0, 144, 30, 9, 21, 2, 3);
    // 彩旗（直線 + 每 16 px 一面三角旗，pal0 白 / 天藍）
    p.hl(0, 8, 144, 2);
    for (var x = 0; x < 144; x += 16) { p.poly([[x + 4, 9], [x + 12, 9], [x + 8, 16]], (x >> 4) & 1 ? 3 : 2); }
    // 房屋（pal1：深棕 / 紅屋頂 / 黃窗）：同一款 32 寬、每 32 px 一棟
    for (var hx = 0; hx < 144; hx += 32) {
      var top = 40;
      p.rect(hx + 2, top, 28, 40, 0); p.vl(hx + 2, top, 40, 1); p.vl(hx + 29, top, 40, 1);
      p.poly([[hx, top + 1], [hx + 16, top - 15], [hx + 32, top + 1]], 2);
      p.line(hx, top + 1, hx + 16, top - 15, 1); p.line(hx + 16, top - 15, hx + 32, top + 1, 1);
      for (var wx = hx + 6; wx < hx + 28; wx += 16) for (var wy = top + 4; wy < 72; wy += 16) {
        p.rect(wx, wy, 6, 8, 3); p.vl(wx + 3, wy, 8, 1); p.hl(wx, wy + 4, 6, 1);
      }
      p.rect(hx + 13, 66, 6, 14, 1);
    }
    p.attr(0, 1, 9, 4, 1);
    // 地面石板 + 噴水池（pal2：深灰 / 灰 / 水藍）
    p.rect(0, 80, 144, 32, 1);
    for (var j = 80; j < 112; j += 8) for (var i = ((j >> 3) & 1) * 8; i < 144; i += 16) p.frame(i, j, 16, 8, 0);
    p.ell(72, 98, 42, 11, 0); p.ell(72, 97, 40, 9, 1); p.ell(72, 98, 36, 7, 3);
    p.hl(48, 96, 10, 2); p.hl(86, 100, 10, 2); p.hl(60, 102, 8, 2);
    p.rect(69, 74, 6, 24, 1); p.rect(66, 70, 12, 5, 1); p.circ(72, 66, 3, 1); p.star(72, 59, 2, 1, 3);
    p.line(66, 70, 61, 84, 3); p.line(78, 70, 83, 84, 3);
    p.attr(0, 5, 9, 2, 2);
    return [[0x07, 0x16, 0x28], [0x00, 0x10, 0x21], [0x0F, 0x0F, 0x0F]];
  };

  // 3 雲海碼頭（夜 / 霧）
  PICS.dock = function (p, v) {
    var fog = v === 'fog';
    if (!fog) { p.stars(0, 0, 144, 46, 16, 31, 2, 3); p.circ(26, 18, 10, 3); p.circ(22, 15, 2, 2); p.circ(30, 22, 3, 2); p.circ(28, 12, 1, 2); }
    // 雲海（pal3）y 48 起
    p.rect(0, 48, 144, 64, 1);
    p.cloudRow(0, 144, 50, 6, 2, 0); p.cloudRow(0, 144, 66, 6, 3, 1); p.cloudRow(0, 144, 84, 7, 2, 0); p.cloudRow(0, 144, 100, 7, 3, 1);
    p.attr(0, 3, 9, 4, 3);
    if (fog) { p.attr(0, 0, 9, 3, 3); p.rect(0, 0, 144, 48, 1); p.dith(0, 0, 144, 48, 1, 2); p.cloudRow(0, 144, 20, 8, 2, 1); p.cloudRow(0, 144, 40, 8, 3, 0); }
    // 雲鯨號（pal1：區塊 4..8 × 0..2；霧夜看不見船）
    if (!fog) {
    p.ell(100, 38, 34, 9, 1); p.ell(100, 37, 32, 7, 2); p.ell(100, 42, 26, 3, 3);
    p.poly([[130, 34], [142, 24], [143, 32], [134, 40]], 2);
    p.p(78, 36, 0); p.p(79, 36, 0); p.line(75, 41, 81, 43, 1);
    p.rect(99, 4, 2, 28, 1); p.poly([[101, 6], [122, 26], [101, 30]], 3); p.poly([[98, 10], [82, 28], [98, 30]], 3);
    p.attr(4, 0, 5, 3, 1);
    }
    // 棧橋（pal2 木，區塊 0..3 × 5..6 整塊鋪滿）
    p.rect(0, 80, 64, 32, 2);
    for (var j = 80; j < 112; j += 4) p.hl(0, j, 64, 1);
    for (var i = 0; i < 64; i += 16) for (j = 80; j < 112; j += 8) p.vl(i + ((j >> 3) & 1) * 8, j, 4, 1);
    p.hl(0, 80, 64, 3);
    p.rect(14, 70, 4, 14, 2); p.rect(44, 70, 4, 14, 2); p.hl(14, 70, 34, 3);
    p.attr(0, 5, 4, 2, 2);
    return [[0x0C, 0x1C, 0x3C], [0x07, 0x17, 0x27], fog ? [0x00, 0x10, 0x20] : [0x02, 0x12, 0x31]];
  };

  // 4 燈塔前（暗 / 亮）
  PICS.tower = function (p, v) {
    var lit = v === 'lit';
    p.stars(0, 0, 144, 96, 30, 41, 2, 3);
    if (lit) { p.poly([[80, 14], [0, 0], [0, 12]], 2); p.poly([[96, 14], [144, 2], [144, 16]], 2); p.line(80, 14, 0, 6, 3); p.line(96, 14, 144, 9, 3); }
    // 塔身（pal1 紅白）x 64..95 往下漸寬
    var y;
    for (y = 22; y < 96; y++) {
      var half = 10 + Math.floor((y - 22) / 8), cx = 88;
      var band = (((y - 22) >> 4) & 1) ? 3 : 2;
      p.hl(cx - half, y, half * 2, band); p.p(cx - half, y, 1); p.p(cx + half - 1, y, 1);
    }
    p.rect(72, 18, 32, 4, 1); p.hl(70, 17, 36, 1);                    // 陽台
    // 燈室（pal3）
    p.rect(76, 2, 24, 15, 1); p.rect(78, 4, 20, 12, 2); p.vl(84, 4, 12, 1); p.vl(91, 4, 12, 1);
    if (lit) { p.rect(80, 6, 16, 8, 3); }
    p.poly([[74, 2], [88, -6], [102, 2]], 1);
    p.attr(4, 0, 3, 1, 3);
    p.attr(4, 1, 3, 5, 1);
    // 門
    p.rect(82, 76, 12, 20, 1); p.rect(84, 78, 8, 18, 0); p.vl(88, 78, 18, 1); p.p(90, 87, 3);
    // 地面 / 花圃（pal2）
    p.rect(0, 96, 144, 16, 1); p.dith(0, 96, 144, 2, 1, 2);
    for (var x = 4; x < 144; x += 9) { if (x > 74 && x < 102) continue; p.vl(x, 92, 5, 2); p.p(x, 91, 3); p.p(x - 1, 92, 3); p.p(x + 1, 92, 3); }
    p.rect(78, 96, 20, 3, 2); p.rect(76, 99, 24, 3, 2);
    p.attr(0, 6, 9, 1, 2);
    return [[0x06, 0x16, 0x30], [0x09, 0x1A, 0x3C], lit ? [0x00, 0x28, 0x38] : [0x00, 0x02, 0x10]];
  };

  // 5 燈室（暗 / 亮）
  PICS.top = function (p, v) {
    var lit = v === 'lit';
    // 窗（pal0 夜空）+ 窗框
    p.stars(0, 0, 144, 64, 18, 51, 2, 3);
    for (var x = 0; x < 144; x += 36) p.rect(x, 0, 3, 64, 1);
    p.hl(0, 30, 144, 1);
    // 透鏡（pal1）中央 x 44..99
    p.ell(72, 38, 26, 30, 1);
    for (var r = 0; r < 4; r++) p.ell(72, 38, 24 - r * 6, 28 - r * 7, r & 1 ? 1 : 2);
    p.ell(72, 38, 4, 6, 3); p.vl(60, 16, 40, 3); p.vl(84, 16, 40, 3);
    p.attr(2, 0, 5, 5, 1);
    // 燈座（pal3 黃銅）
    p.rect(52, 72, 40, 8, 2); p.rect(56, 80, 32, 22, 1); p.rect(58, 82, 28, 18, 2); p.hl(52, 72, 40, 3);
    p.ell(72, 72, 8, 3, 0);
    if (lit) { p.ell(72, 70, 6, 4, 3); }
    else { p.p(68, 71, 3); p.p(74, 72, 3); p.p(71, 73, 3); p.p(77, 71, 3); }
    p.attr(3, 4, 3, 3, 3);
    // 地板（pal2 金屬格柵）
    p.rect(0, 64, 144, 48, 1);
    for (var j = 64; j < 112; j += 8) p.hl(0, j, 144, 0);
    for (x = 0; x < 144; x += 8) p.vl(x, 64, 48, 0);
    p.rect(0, 64, 144, 2, 2);
    p.rect(48, 64, 48, 48, 0); p.rect(48, 64, 48, 2, 3);
    p.attr(0, 4, 3, 3, 2); p.attr(6, 4, 3, 3, 2);
    // 再畫一次燈座邊（地板蓋到的部分）
    p.rect(52, 72, 40, 8, 2); p.hl(52, 72, 40, 3); p.ell(72, 72, 8, 3, 0);
    if (lit) p.ell(72, 70, 6, 4, 3);
    else { p.p(68, 71, 3); p.p(74, 72, 3); p.p(71, 73, 3); }
    return [lit ? [0x27, 0x28, 0x30] : [0x00, 0x1C, 0x2C], [0x00, 0x10, 0x20], [0x07, 0x18, lit ? 0x38 : 0x28]];
  };

  // 6 鐘錶店
  PICS.clock = function (p, v) {
    // 牆紙（pal1 直條紋）
    p.rect(0, 0, 144, 80, 2);
    for (var x = 0; x < 144; x += 8) p.vl(x, 0, 80, 1);
    // 時鐘群
    var C = [[24, 20, 11], [60, 14, 8], [92, 22, 12], [124, 14, 8], [44, 46, 7], [76, 50, 9], [112, 48, 7]];
    C.forEach(function (c) {
      p.circ(c[0], c[1], c[2] + 1, 1); p.circ(c[0], c[1], c[2], 3);
      p.line(c[0], c[1], c[0], c[1] - c[2] + 3, 1); p.line(c[0], c[1], c[0] + Math.round(c[2] * 0.4), c[1] + Math.round(c[2] * 0.25), 1);
      p.p(c[0], c[1] - c[2] + 1, 1); p.p(c[0], c[1] + c[2] - 1, 1); p.p(c[0] - c[2] + 1, c[1], 1); p.p(c[0] + c[2] - 1, c[1], 1);
    });
    // 吊燈
    p.vl(8, 0, 6, 1);
    p.attr(0, 0, 9, 5, 1);
    // 工作台（pal2）
    p.rect(0, 80, 144, 32, 1); p.rect(0, 80, 144, 4, 3); p.hl(0, 84, 144, 2);
    for (x = 0; x < 144; x += 24) p.vl(x, 85, 27, 2);
    p.rect(10, 74, 10, 6, 2); p.p(12, 72, 3); p.p(16, 73, 3);          // 螺絲盒
    p.circ(124, 74, 5, 2); p.circ(124, 74, 3, 3); p.line(128, 78, 134, 80, 2);   // 放大鏡
    p.attr(0, 5, 9, 2, 2);
    return [[0x07, 0x17, 0x37], [0x08, 0x18, 0x28], [0x0F, 0x0F, 0x0F]];
  };

  // 7 天文台
  PICS.obs = function (p, v) {
    // 圓頂內壁（pal1 紫）+ 直肋
    p.rect(0, 0, 144, 96, 1);
    for (var x = 8; x < 144; x += 16) p.vl(x, 0, 96, 2);
    p.attr(0, 0, 9, 6, 1);
    // 圓頂縫隙（pal0 星空）x 64..79
    p.rect(64, 0, 16, 32, 0); p.stars(64, 0, 16, 30, 5, 61, 2, 3); p.attr(4, 0, 1, 2, 0);
    // 望遠鏡（pal1：黑框 / 紫 / 淡紫）
    p.poly([[30, 92], [42, 100], [98, 40], [86, 32]], 0);
    p.poly([[32, 92], [41, 98], [96, 40], [87, 34]], 2);
    p.line(34, 92, 89, 35, 3); p.line(35, 93, 90, 36, 3);
    p.rect(84, 30, 14, 6, 0); p.rect(86, 31, 10, 4, 3);
    p.rect(44, 80, 10, 16, 0); p.rect(46, 80, 6, 16, 2); p.rect(36, 92, 26, 4, 0);
    // 書架（左，pal3）
    p.rect(0, 32, 32, 64, 1);
    for (var j = 36; j < 96; j += 15) { for (x = 2; x < 30; x += 4) p.rect(x, j, 3, 11, (x >> 2) % 3 === 0 ? 3 : 2); p.hl(0, j + 11, 32, 1); }
    p.attr(0, 2, 2, 4, 3);
    // 星座盤（右，pal0 海報）x 112..143 y 32..63
    p.rect(112, 32, 32, 32, 2); p.rect(114, 34, 28, 28, 1);
    p.star(120, 42, 1, 2, 3); p.star(132, 40, 1, 2, 3); p.star(136, 54, 1, 2, 3); p.star(122, 56, 0, 2, 3);
    p.line(120, 42, 132, 40, 2); p.line(132, 40, 136, 54, 2); p.ring(126, 50, 2, 3);
    p.attr(7, 2, 2, 2, 0);
    // 地板（pal3 木）
    p.rect(0, 96, 144, 16, 2); for (j = 96; j < 112; j += 4) p.hl(0, j, 144, 1); p.hl(0, 96, 144, 3);
    p.attr(0, 6, 9, 1, 3);
    return [[0x03, 0x13, 0x33], [0x0F, 0x0F, 0x0F], [0x07, 0x17, 0x26]];
  };

  // 8 森林入口（暗 / 亮）
  PICS.woods = function (p, v) {
    var lit = v === 'lit';
    trees(p, 0, 48, 8, 96, 13, 2, 1, 3); trees(p, 96, 144, 8, 96, 17, 2, 1, 3);
    for (var k = 40; k < 104; k += 12) { p.circ(k, 8 + ((k >> 2) & 3), 11, 3); p.circ(k + 4, 2, 7, 1); }
    p.attr(0, 0, 9, 6, 1);
    // 小路（pal3，區塊 3..5 × 2..6）
    p.poly([[50, 112], [94, 112], [76, 40], [68, 40]], 1);
    p.poly([[58, 112], [86, 112], [74, 44], [70, 44]], 2);
    if (lit) for (k = 0; k < 9; k++) p.p(66 + ((k * 7) % 13), 50 + k * 6, 3);
    p.attr(3, 2, 3, 5, 3);
    // 地面（黑）+ 蘑菇（pal3）
    p.rect(0, 96, 48, 16, 0); p.rect(96, 96, 48, 16, 0);
    [[14, 104], [30, 106], [110, 102], [128, 106]].forEach(function (m) { p.vl(m[0], m[1], 5, 2); p.ell(m[0], m[1], 4, 2, 3); });
    p.attr(0, 6, 3, 1, 3); p.attr(6, 6, 3, 1, 3);
    // 路標（pal2）區塊 6 × 4..5
    p.rect(104, 64, 3, 32, 0); p.rect(105, 64, 2, 32, 1); p.rect(96, 66, 22, 8, 2); p.frame(96, 66, 22, 8, 1); p.poly([[118, 66], [123, 70], [118, 74]], 2);
    p.attr(6, 4, 2, 2, 2);
    return [[0x08, 0x18, 0x0A], [0x07, 0x17, 0x27], lit ? [0x11, 0x21, 0x31] : [0x00, 0x0C, 0x2C]];
  };

  // 9 星石林地
  PICS.deep = function (p, v) {
    trees(p, 0, 40, 6, 80, 5, 2, 1, 3); trees(p, 112, 144, 6, 80, 9, 2, 1, 3);
    p.rect(48, 0, 64, 48, 0); p.stars(48, 0, 64, 44, 8, 71, 2, 3);
    p.attr(0, 0, 3, 5, 1); p.attr(7, 0, 2, 5, 1);
    // 古樹樹洞
    p.rect(12, 34, 24, 46, 2); p.vl(12, 34, 46, 1); p.vl(35, 34, 46, 1); p.ell(24, 58, 6, 9, 0); p.ell(24, 63, 5, 4, 3);
    // 草地 + 水池（pal2：深綠 / 綠 / 水藍）
    p.rect(0, 80, 144, 32, 1); for (var x = 2; x < 144; x += 8) { p.p(x, 80, 2); p.p(x + 4, 82, 2); p.p(x + 2, 88, 2); }
    p.ell(44, 98, 22, 7, 3); p.hl(32, 97, 6, 1); p.hl(48, 100, 8, 1); p.p(40, 96, 0); p.p(54, 99, 0);
    p.attr(0, 5, 9, 2, 2);
    // 星石（pal3 水晶，區塊 5..6 × 1..4）
    p.poly([[82, 80], [88, 30], [98, 22], [108, 34], [110, 80]], 1);
    p.poly([[88, 78], [92, 34], [98, 28], [98, 78]], 2);
    p.line(98, 22, 98, 78, 3); p.line(92, 34, 98, 28, 3); p.line(104, 40, 106, 70, 2);
    p.attr(5, 1, 2, 4, 3);
    return [[0x08, 0x18, 0x0A], [0x09, 0x19, 0x21], [0x0C, 0x2C, 0x30]];
  };

  // 10 星橋（一般 / home 結局 / travel 結局）
  PICS.bridge = function (p, v) {
    p.stars(0, 0, 144, 92, 22, 81, 2, 3);
    // 星座（右上）
    var S = [[96, 14], [110, 8], [124, 16], [132, 30], [116, 30]];
    for (var i = 0; i < S.length - 1; i++) p.line(S[i][0], S[i][1], S[i + 1][0], S[i + 1][1], 2);
    S.forEach(function (s) { p.star(s[0], s[1], 1, 2, 3); });
    if (v === 'home') { p.star(104, 26, 2, 2, 3); p.line(104, 26, 116, 30, 2); }
    else p.ring(104, 26, 2, 2);
    // 星橋（pal1 金）
    for (var x = 0; x < 128; x++) {
      var y = Math.round(100 - x * 0.55 - 14 * Math.sin(Math.PI * x / 128));
      p.vl(x, y, 4, 2); p.p(x, y - 1, 3); p.p(x, y + 4, 1);
      if ((x & 7) === 0) p.vl(x, y - 5, 5, 3);
      if ((x & 7) === 0) p.p(x, y - 6, 3);
    }
    p.attr(0, 0, 9, 6, 0);
    // 雲海（pal3）+ 船燈
    p.rect(0, 96, 144, 16, 1); p.cloudRow(-4, 150, 98, 5, 2, 7);
    for (x = 70; x < 144; x += 9) p.p(x, 104 + ((x >> 3) & 1), 3);
    p.attr(0, 6, 9, 1, 3);
    // 燈室陽台（左下）
    p.rect(0, 88, 22, 24, 2); p.hl(0, 88, 22, 3); for (x = 2; x < 22; x += 4) p.vl(x, 82, 6, 3); p.hl(0, 82, 22, 3);
    // 橋經過的區塊用 pal1
    for (var bx = 0; bx < 8; bx++) {
      var yb = Math.round(100 - (bx * 16 + 8) * 0.55 - 14 * Math.sin(Math.PI * (bx * 16 + 8) / 128));
      p.attr(bx, (yb - 6) >> 4, 1, 1, 1); p.attr(bx, (yb + 4) >> 4, 1, 1, 1);
    }
    p.attr(0, 5, 2, 2, 1);
    return [[0x27, 0x28, 0x38], [0x0F, 0x0F, 0x0F], [0x02, 0x12, 0x28]];
  };

  // 標題（128×112：大字 logo + 夜晚燈塔）
  PICS.title = function (p, v) {
    p.stars(0, 0, 128, 96, 12, 91, 2, 3, function (x, y) { return y > 6 && y < 46; });
    // 雲海 + 小島 + 燈塔
    p.rect(0, 96, 128, 16, 1); p.cloudRow(-4, 132, 96, 5, 2, 3);
    p.poly([[10, 96], [18, 80], [44, 76], [56, 96]], 1);
    p.rect(30, 58, 6, 20, 3); p.hl(30, 64, 6, 2); p.hl(30, 70, 6, 2); p.rect(29, 54, 8, 4, 1); p.p(32, 52, 1); p.p(33, 52, 1);
    p.attr(0, 3, 8, 4, 3); p.attr(0, 0, 8, 3, 0);
    // logo：4 個全形字放大 2 倍（字形來自 CT.GLYPHS，描邊）
    var G = (CT.GLYPHS && CT.GLYPHS.cjk) || {}, word = '星塵冒險';
    for (var k = 0; k < 4; k++) {
      var h = G[word.charAt(k)]; if (!h) continue;
      var ox = k * 32, oy = 8, bits = [];
      for (var r = 0; r < 16; r++) bits.push(parseInt(h.substr(r * 4, 4), 16));
      var on = function (x, y) { return x >= 0 && y >= 0 && x < 16 && y < 16 && ((bits[y] >> (15 - x)) & 1); };
      for (var yy = -1; yy <= 16; yy++) for (var xx = -1; xx <= 16; xx++) {
        if (on(xx, yy)) { p.rect(ox + xx * 2, oy + yy * 2, 2, 2, yy < 8 ? 3 : 2); }
        else if (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1)) p.rect(ox + xx * 2, oy + yy * 2, 2, 2, 1);
      }
    }
    return [[0x0F, 0x0F, 0x0F], [0x0F, 0x0F, 0x0F], [0x02, 0x12, 0x16]];
  };
  // 標題 logo 區用 pal0 會讓字是白 / 天藍，框深藍（夜空同組）；燈塔紅用 pal3

  /* ============================== 磁磚化 + 合併 ============================== */
  function tileKey(px, w, cx, cy) {
    var s = '';
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) s += px[(cy * 8 + y) * w + cx * 8 + x];
    return s;
  }
  function tilesOf(p, cap) {
    var cw = p.w >> 3, ch = p.h >> 3, keys = [], idx = {}, list = [], count = [], map = new Array(cw * ch), i, j;
    for (var cy = 0; cy < ch; cy++) for (var cx = 0; cx < cw; cx++) {
      var k = tileKey(p.px, p.w, cx, cy);
      if (idx[k] === undefined) { idx[k] = list.length; list.push(k); count.push(0); }
      count[idx[k]]++; map[cy * cw + cx] = idx[k];
    }
    var unique = list.length, merged = 0;
    // 超過上限：反覆把「最便宜」的一對合併（差異像素 × 少數那塊的出現次數）
    var alive = list.map(function () { return true; }), remap = list.map(function (_, q) { return q; });
    var n = list.length;
    function dist(a, b) { var d = 0; for (var q = 0; q < 64; q++) if (list[a].charCodeAt(q) !== list[b].charCodeAt(q)) d++; return d; }
    while (n > cap) {
      var best = 1e9, bi = -1, bj = -1;
      for (i = 0; i < list.length; i++) if (alive[i]) for (j = i + 1; j < list.length; j++) if (alive[j]) {
        var c = dist(i, j) * Math.min(count[i], count[j]);
        if (c < best) { best = c; bi = i; bj = j; }
      }
      var keep = count[bi] >= count[bj] ? bi : bj, drop = keep === bi ? bj : bi;
      alive[drop] = false; count[keep] += count[drop]; n--; merged++;
      for (i = 0; i < remap.length; i++) if (remap[i] === drop) remap[i] = keep;
    }
    var out = [], newIdx = {};
    for (i = 0; i < list.length; i++) if (alive[i]) { newIdx[i] = out.length; var t = new Uint8Array(64); for (j = 0; j < 64; j++) t[j] = list[i].charCodeAt(j) - 48; out.push(t); }
    for (i = 0; i < map.length; i++) map[i] = newIdx[remap[map[i]]];
    return { tiles: out, map: map, unique: unique, merged: merged };
  }

  var cache = {};
  function picture(id, variant) {
    var key = id + '/' + (variant || '');
    if (cache[key]) return cache[key];
    var w = id === 'title' ? 128 : 144, h = 112;
    var p = new Painter(w, h);
    var pals = PICS[id](p, variant || '');
    var t = tilesOf(p, PIC_SLOTS);
    var r = { id: id, variant: variant || '', w: w >> 3, h: h >> 3, tiles: t.tiles, map: t.map, attr: Array.prototype.slice.call(p.at),
      pals: pals, unique: t.unique, merged: t.merged };
    cache[key] = r;
    return r;
  }

  /* ============================== 精靈（8×8 模式；人物 16×24 = 2×3 磚） ============================== */
  // 每個：rows（'.' 透明、1~3 色號）+ pal（3 色）
  var SPR = {
    xia: { pal: [0x0F, 0x14, 0x36], rows: [
      '................',
      '......1111......',
      '.....133331.....',
      '....13333331....',
      '....11222211....',
      '...1122222211...',
      '...12232232211..',
      '...12222222211..',
      '....1222222.1...',
      '.....11221..1...',
      '...1111111111...',
      '..133111111331..',
      '..1311333311311.',
      '..1331333313311.',
      '..1133333333111.',
      '...1333333331.1.',
      '...1333333331.1.',
      '...1311111131.1.',
      '...1333333331.1.',
      '...1333333331.1.',
      '...1111111111.1.',
      '....11....11..1.',
      '...111....111.1.',
      '................'] },
    ou: { pal: [0x0F, 0x01, 0x27], rows: [
      '................',
      '....11111111....',
      '...1222222221...',
      '..111111111111..',
      '....13333331....',
      '....13133131....',
      '....13333331....',
      '.....133331.....',
      '......1111......',
      '....11333311....',
      '...1222332221...',
      '..122223322221..',
      '..122222222221..',
      '..132222222231..',
      '..132211112231..',
      '..131222222131..',
      '...12222222211..',
      '...12221122211..',
      '...1222112221...',
      '...1222112221...',
      '...1222112221...',
      '...1111111111...',
      '..11111..11111..',
      '................'] },
    gear: { pal: [0x0F, 0x17, 0x37], rows: [
      '................',
      '.....111111.....',
      '....12222221....',
      '...1222222221...',
      '...1133113311...',
      '...1131331311...',
      '...1133113311...',
      '...1333333331...',
      '...1322222231...',
      '....12222221....',
      '.....122221.....',
      '...1111221111...',
      '..133111111331..',
      '..133222222331..',
      '..133222222331..',
      '..1132222223111.',
      '...1222222221...',
      '...1222222221...',
      '...1222222221...',
      '...1222222221...',
      '...1111111111...',
      '....11....11....',
      '...111....111...',
      '................'] },
    lila: { pal: [0x0F, 0x13, 0x36], rows: [
      '................',
      '.....111111.....',
      '....12222221....',
      '...1222222221...',
      '...1233333321...',
      '..12311331132...',
      '..12133113312...',
      '..12333333332...',
      '..122333333221..',
      '..1221333312211.',
      '..12211111122211',
      '.1222222222222.1',
      '.1222232222322..',
      '.12223332223332.',
      '.1222232222322..',
      '..122222222221..',
      '..122222322221..',
      '..122223332221..',
      '..122222322221..',
      '..122222222221..',
      '...1111111111...',
      '....13....31....',
      '...111....111...',
      '................'] },
    kid: { pal: [0x0F, 0x2C, 0x30], rows: [
      '.......33.......',
      '......3333......',
      '.33..322223..33.',
      '..3332222223333.',
      '...3222222223...',
      '...3222222223...',
      '..32212222122...',
      '..322122221223..',
      '..322222222223..',
      '...3222112223...',
      '....32222223....',
      '...3322222233...',
      '..322222222223..',
      '..3.32222223.3..',
      '....32222223....',
      '....32222223....',
      '.....322223.....',
      '....32333323....',
      '....323..323....',
      '....33....33....',
      '................',
      '................',
      '................',
      '................'] },
    cat: { pal: [0x0F, 0x10, 0x30], rows: [
      '..1.....1.......',
      '..11...11.......',
      '..1311131.......',
      '..1222221.......',
      '..1212121.....1.',
      '..1222221....121',
      '...12321....121.',
      '...1222211111...',
      '..122222222221..',
      '..122222222221..',
      '..12112211221...',
      '..11..11..11....',
      '................',
      '................',
      '................',
      '................'] },
    lamp: { pal: [0x0F, 0x18, 0x38], rows: [
      '...1111.',
      '..1....1',
      '..111111',
      '..133331',
      '..131131',
      '..133331',
      '..111111',
      '...1111.'] },
    lampLit: { pal: [0x0F, 0x18, 0x2C], rows: [
      '...1111.',
      '..1....1',
      '..111111',
      '..133331',
      '..133331',
      '..133331',
      '..111111',
      '...1111.'] },
    bag: { pal: [0x0F, 0x17, 0x27], rows: [
      '..1111..',
      '.1....1.',
      '11111111',
      '12222221',
      '12233221',
      '12222221',
      '11111111',
      '........'] },
    mbox: { pal: [0x0F, 0x17, 0x28], rows: [
      '.11111111111111.',
      '1222222222222221',
      '1111111111111111',
      '1222223322222221',
      '1222232232222221',
      '1222222222222221',
      '1111111111111111',
      '................'] },
    glint: { pal: [0x0F, 0x21, 0x30], rows: [
      '...1....',
      '...1....',
      '..121...',
      '1112111.',
      '..121...',
      '...1....',
      '...1....',
      '........'] },
    glow: { pal: [0x0F, 0x2C, 0x30], rows: [
      '..1111..',
      '.122221.',
      '12233221',
      '12333321',
      '12333321',
      '12233221',
      '.122221.',
      '..1111..'] },
    core: { pal: [0x0F, 0x27, 0x38], rows: [
      '...11...',
      '..1221..',
      '.123321.',
      '12333321',
      '.123321.',
      '..1221..',
      '...11...',
      '........'] },
    star: { pal: [0x0F, 0x28, 0x30], rows: [
      '...3....',
      '...3....',
      '.33333..',
      '..333...',
      '..3.3...',
      '........',
      '........',
      '........'] },
    // 選單游標旁的小星星（backTile 也用這個）
    dot: { pal: [0x0F, 0x28, 0x30], rows: [
      '..3333..',
      '.333333.',
      '33333333',
      '33333333',
      '33333333',
      '33333333',
      '.333333.',
      '..3333..'] }
  };
  // 人物共用「縮短」版（第 2 幀：眨眼 / 拾光閃爍）
  function blink(rows, from, to) { return rows.map(function (r) { return r.split(from).join(to); }); }
  SPR.kid2 = { pal: SPR.kid.pal, rows: blink(SPR.kid.rows, '3', '2') };

  // 切成 8×8：key → [{name, dx, dy}]
  var sprBuilt = null;
  function sprBank() {
    if (sprBuilt) return sprBuilt;
    var obj = { SP0: ['........', '........', '........', '........', '........', '........', '........', '........'] }, parts = {};
    Object.keys(SPR).forEach(function (k) {
      var rows = SPR[k].rows, w = rows[0].length, h = rows.length, list = [];
      for (var ty = 0; ty < h; ty += 8) for (var tx = 0; tx < w; tx += 8) {
        var t = [], empty = true;
        for (var y = 0; y < 8; y++) { var s = rows[ty + y].substr(tx, 8).replace(/[^.123]/g, '.'); t.push(s); if (/[123]/.test(s)) empty = false; }
        if (empty) continue;
        var nm = k + '_' + tx + '_' + ty;
        obj[nm] = t; list.push({ name: nm, dx: tx, dy: ty });
      }
      parts[k] = list;
    });
    var bank = NES.CHR.bank('adventure_spr', obj);
    Object.keys(parts).forEach(function (k) { parts[k].forEach(function (q) { q.tile = bank.index(q.name); }); });
    sprBuilt = { bank: bank, parts: parts };
    return sprBuilt;
  }

  A.Art = { Painter: Painter, PICS: PICS, picture: picture, tilesOf: tilesOf, PIC_SLOTS: PIC_SLOTS, TEXT_PAL: TEXT_PAL, SPR: SPR, sprBank: sprBank,
    resetCache: function () { cache = {}; } };
})();
