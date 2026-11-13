/*
 * games/cart3/slide/pics.js — 《星塵拼圖 STAR SLIDE》6 張原創像素畫（程式繪製 160×160）+ PPU 化（屬性量化 + 磁磚去重 / 合併）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：engine/palette.js（NES.PALETTE.rgb，只用來算色距）
 *
 * 每張圖：4 組背景調色盤（色 0 = 共用底色 $0F），用「邏輯色」p*4+i（第 p 組第 i 色）作畫；
 *   每組都含該區的「底色」（天空 / 海水…），所以物件放進那區時，16×16 屬性區裡仍看得到背景。
 * PPU 化（make(i)）：
 *   ① 屬性量化：每個 16×16 區塊挑像素最多的那組調色盤，其他組的像素換成該組 RGB 最近的色（或底色）；
 *   ② 切成 20×20 = 400 塊 8×8 磁磚（2bpp 色號）→ 完全相同的去重；
 *   ③ 仍超過預算（預設 192，bank 另外放字型 / 框線 ≤ 64）⇒ 把漢明距離最小的兩塊合併（少用的併進多用的），直到 ≤ 預算。
 * 輸出：{ name, pal[4][3], blockPal[10][10], tiles[]（去重後的 Uint8Array(64)）, map[20][20]（磁磚索引）, stats }
 * 圖面清單（全部原創）：
 *   0 LIGHTHOUSE 星夜燈塔、1 LIFT OFF 黎明發射、2 CORAL 珊瑚礁、3 OBSERVATORY 夕照天文台、4 CRYSTAL 水晶洞、5 STAR WHALE 星鯨
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SL = CT.Slide = CT.Slide || {};

  var W = 160, H = 160;
  function C(p, i) { return p * 4 + i; }

  /* ---------------- 繪圖工具（邏輯色畫布） ---------------- */
  function Canvas() {
    var px = new Uint8Array(W * H);
    var cv = {
      px: px,
      set: function (x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; },
      get: function (x, y) { return (x >= 0 && y >= 0 && x < W && y < H) ? px[y * W + x] : -1; },
      rect: function (x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) cv.set(x, y, c); },
      fill: function (c) { px.fill(c); },
      ellipse: function (cx, cy, rx, ry, c) {
        for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          var dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) cv.set(x, y, c);
        }
      },
      circ: function (cx, cy, r, c) { cv.ellipse(cx, cy, r, r, c); },
      poly: function (pts, c) {
        var y0 = 1e9, y1 = -1e9, i;
        for (i = 0; i < pts.length; i++) { y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]); }
        for (var y = Math.floor(y0); y <= Math.ceil(y1); y++) {
          var xs = [], yy = y + 0.5;
          for (i = 0; i < pts.length; i++) {
            var a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
          xs.sort(function (p, q) { return p - q; });
          for (i = 0; i + 1 < xs.length; i += 2) for (var x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) cv.set(x, y, c);
        }
      },
      line: function (x0, y0, x1, y1, c, th) {
        th = th || 1;
        var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (var i = 0; i <= n; i++) {
          var x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
          if (th <= 1) cv.set(Math.round(x), Math.round(y), c);
          else cv.rect(Math.round(x - th / 2), Math.round(y - th / 2), Math.round(x - th / 2) + th - 1, Math.round(y - th / 2) + th - 1, c);
        }
      },
      // 4×4 Bayer 混色：lvl 0..16 = c2 的比例（週期 4 px ⇒ 8×8 磁磚可去重）
      dith: function (x0, y0, x1, y1, c1, c2, lvl) {
        var B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) cv.set(x, y, B[(y & 3) * 4 + (x & 3)] < lvl ? c2 : c1);
      },
      // 垂直漸層：y0→y1 從 c1 漸到 c2（分 bands 段、每段 lvl 固定）
      grad: function (x0, y0, x1, y1, c1, c2, bands) {
        bands = bands || 4;
        var h = (y1 - y0 + 1) / bands;
        for (var b = 0; b < bands; b++) {
          var ya = Math.round(y0 + b * h), yb = Math.round(y0 + (b + 1) * h) - 1;
          cv.dith(x0, ya, x1, yb, c1, c2, Math.round((b + 0.5) * 16 / bands));
        }
      },
      // 只在某色上面畫（遮罩）
      over: function (fn, onlyOn) {
        var save = new Uint8Array(px);
        fn();
        for (var i = 0; i < px.length; i++) if (onlyOn.indexOf(save[i]) < 0) px[i] = save[i];
      }
    };
    return cv;
  }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function star(cv, x, y, c, big) {
    cv.set(x, y, c);
    if (big) { cv.set(x - 1, y, c); cv.set(x + 1, y, c); cv.set(x, y - 1, c); cv.set(x, y + 1, c); }
  }

  /* ---------------- 6 張圖 ---------------- */
  var PICS = [];

  // 0 星夜燈塔
  PICS.push({
    name: 'LIGHTHOUSE', short: 'LIGHTHSE',
    pal: [[0x01, 0x28, 0x30], [0x01, 0x11, 0x21], [0x01, 0x16, 0x30], [0x11, 0x07, 0x17]],
    draw: function (cv) {
      var R = rng(7), i, x, y;
      var NAVY = C(1, 1), BLUE = C(1, 2), LBLUE = C(1, 3), YEL = C(0, 2), WHT = C(0, 3), RED = C(2, 2), TW = C(2, 3);
      var BRN = C(3, 2), RUST = C(3, 3), SEA = C(3, 1);
      cv.fill(NAVY);
      cv.grad(0, 80, 159, 111, NAVY, BLUE, 4);
      // 星
      for (i = 0; i < 22; i++) {
        x = 4 + Math.floor(R() * 150); y = 4 + Math.floor(R() * 70);
        if (x > 88 && x < 120) continue;
        if (y > 10 && y < 44 && x < 92) continue;      // 光束區不放
        star(cv, x, y, R() < 0.3 ? YEL : WHT, R() < 0.25);
      }
      // 月亮（右上）
      cv.circ(138, 22, 11, WHT); cv.circ(143, 18, 9, NAVY); cv.circ(134, 25, 2, YEL);
      // 光束（往左擴散，混色）
      cv.over(function () { cv.poly([[96, 22], [0, 10], [0, 36], [96, 29]], YEL); }, [NAVY]);
      for (y = 10; y < 37; y++) for (x = 0; x < 96; x++) {
        if (cv.get(x, y) === YEL) { var far = (96 - x) / 96; if (((x + y) & 1) && far > 0.45) cv.set(x, y, NAVY); if (far > 0.8 && ((x * 3 + y) % 4)) cv.set(x, y, NAVY); }
      }
      // 燈室（屬性列 y16..31 用第 0 組：海軍藍 / 黃 / 白）
      cv.rect(98, 20, 109, 31, YEL); cv.rect(100, 22, 107, 29, WHT);
      cv.poly([[96, 20], [103, 12], [104, 12], [111, 20]], WHT); cv.rect(103, 9, 104, 12, WHT);
      // 塔身（y32..118，紅白條紋）
      for (y = 32; y <= 118; y++) {
        var band = Math.floor((y - 32) / 12) & 1, inset = Math.floor((y - 32) / 30);
        cv.rect(97 + inset, y, 110 - inset, y, band ? TW : RED);
      }
      cv.rect(101, 50, 104, 56, NAVY); cv.rect(101, 80, 104, 86, NAVY);   // 窗
      cv.rect(96, 32, 111, 33, TW);
      // 海
      cv.rect(0, 112, 159, 159, BLUE);
      for (y = 116; y < 160; y += 8) for (x = (y & 8) ? 4 : 0; x < 160; x += 16) cv.rect(x, y, x + 5, y, LBLUE);
      for (y = 114; y < 150; y += 4) cv.rect(116 - (y - 112) / 3, y, 118 + (y - 112) / 6, y, YEL);     // 月光倒影
      // 懸崖
      var cliff = [[60, 160], [72, 140], [80, 126], [92, 118], [118, 116], [134, 119], [150, 124], [160, 128], [160, 160]];
      cv.poly(cliff, BRN);
      for (i = 0; i < 40; i++) { x = 70 + Math.floor(R() * 90); y = 122 + Math.floor(R() * 38); if (cv.get(x, y) === BRN) cv.rect(x, y, x + 3, y, RUST); }
      cv.line(80, 126, 92, 118, RUST, 2); cv.line(92, 118, 118, 116, RUST, 2); cv.line(118, 116, 150, 124, RUST, 2);
      for (y = 128; y < 160; y += 6) cv.set(66 + (y - 128) / 3, y, SEA);
      // 浪花（懸崖腳）
      for (y = 140; y < 160; y += 5) cv.rect(56 + (160 - y) / 3, y, 60 + (160 - y) / 3, y, LBLUE);
    }
  });

  // 1 黎明發射
  PICS.push({
    name: 'LIFT OFF', short: 'LIFT OFF',
    pal: [[0x27, 0x16, 0x30], [0x17, 0x27, 0x37], [0x27, 0x28, 0x30], [0x0A, 0x1A, 0x00]],
    draw: function (cv) {
      var x, y, i, R = rng(11);
      var RUST = C(1, 1), ORG = C(1, 2), PEACH = C(1, 3), RED = C(0, 2), WHT = C(0, 3), YEL = C(2, 2);
      var DG = C(3, 1), GR = C(3, 2), GREY = C(3, 3);
      cv.fill(ORG);
      cv.grad(0, 0, 159, 47, RUST, ORG, 4);
      cv.grad(0, 104, 159, 135, ORG, PEACH, 4);
      cv.rect(0, 136, 159, 159, PEACH);
      // 太陽（左側，剛升起）
      cv.circ(28, 66, 13, PEACH); cv.circ(28, 66, 10, PEACH);
      for (i = 0; i < 4; i++) cv.rect(10, 60 + i * 4, 46, 60 + i * 4, ORG);
      cv.over(function () { cv.circ(28, 66, 13, PEACH); }, [ORG]);
      // 雲（淡）
      for (i = 0; i < 3; i++) { x = 10 + i * 50; y = 20 + (i & 1) * 12; cv.ellipse(x, y, 14, 3, PEACH); cv.ellipse(x + 6, y - 2, 8, 3, PEACH); }
      // 發射塔（鐵鏽色桁架）
      cv.rect(114, 28, 115, 144, RUST); cv.rect(124, 28, 125, 144, RUST);
      for (y = 30; y < 144; y += 8) { cv.line(114, y, 125, y + 8, RUST); cv.line(125, y, 114, y + 8, RUST); }
      cv.rect(112, 26, 127, 27, RUST);
      cv.rect(96, 58, 113, 59, RUST); cv.rect(96, 86, 113, 87, RUST);
      // 火箭
      cv.poly([[80, 6], [72, 22], [70, 32], [89, 32], [87, 22]], RED);
      cv.rect(70, 32, 89, 104, WHT);
      cv.rect(70, 32, 71, 104, C(0, 1)); cv.rect(88, 32, 89, 104, PEACH);
      cv.rect(70, 44, 89, 47, RED); cv.rect(70, 92, 89, 95, RED);
      cv.circ(79.5, 60, 5, RED); cv.circ(79.5, 60, 3, ORG);
      cv.rect(78, 70, 81, 86, RED);
      cv.poly([[70, 84], [58, 104], [58, 110], [70, 104]], RED);
      cv.poly([[89, 84], [101, 104], [101, 110], [89, 104]], RED);
      cv.rect(73, 104, 86, 109, C(0, 1));
      // 火焰 + 煙（第 2 組）
      cv.poly([[72, 110], [87, 110], [84, 124], [80, 136], [75, 124]], C(2, 1));
      cv.poly([[75, 110], [84, 110], [82, 120], [80, 128], [77, 120]], YEL);
      cv.rect(78, 110, 81, 116, C(2, 3));
      var puffs = [[50, 138, 9], [64, 134, 11], [80, 138, 12], [96, 134, 11], [110, 138, 9], [40, 142, 6], [120, 142, 6]];
      puffs.forEach(function (q) { cv.circ(q[0], q[1] + 1, q[2] + 1, ORG); });
      puffs.forEach(function (q) { cv.circ(q[0] - 1, q[1], q[2] - 1, PEACH); });
      puffs.forEach(function (q) { cv.circ(q[0] + 2, q[1] + 3, Math.max(2, q[2] - 5), ORG); cv.circ(q[0] + 1, q[1] + 2, Math.max(2, q[2] - 6), PEACH); });
      // 地面
      cv.rect(0, 146, 159, 159, GR);
      cv.dith(0, 146, 159, 159, GR, DG, 6);
      cv.poly([[0, 146], [30, 140], [54, 146]], GR); cv.poly([[110, 146], [140, 138], [160, 144], [160, 146]], GR);
      cv.rect(50, 144, 110, 149, GREY);
      for (x = 52; x < 110; x += 6) cv.set(x, 146, DG);
    }
  });

  // 2 珊瑚礁
  PICS.push({
    name: 'CORAL REEF', short: 'CORAL',
    pal: [[0x11, 0x28, 0x30], [0x21, 0x11, 0x01], [0x01, 0x15, 0x25], [0x01, 0x2A, 0x37]],
    draw: function (cv) {
      var R = rng(23), i, x, y;
      var LB = C(1, 1), BL = C(1, 2), NV = C(1, 3), YEL = C(0, 2), WH = C(0, 3);
      var ROSE = C(2, 2), PINK = C(2, 3), GRN = C(3, 2), SAND = C(3, 3);
      cv.fill(BL);
      cv.rect(0, 0, 159, 23, LB);
      cv.grad(0, 24, 159, 47, LB, BL, 4);
      cv.grad(0, 88, 159, 111, BL, NV, 4);
      cv.rect(0, 112, 159, 159, NV);
      // 光束（斜）
      for (i = 0; i < 4; i++) { var bx = 10 + i * 40; cv.over(function () { cv.poly([[bx, 0], [bx + 8, 0], [bx + 30, 80], [bx + 24, 80]], LB); }, [BL]); }
      // 魚（第 0 組：藍 / 黃 / 白）
      function fish(fx, fy, dir, s) {
        cv.ellipse(fx, fy, 9 * s, 5 * s, YEL);
        cv.poly(dir > 0 ? [[fx - 8 * s, fy], [fx - 15 * s, fy - 6 * s], [fx - 15 * s, fy + 6 * s]] : [[fx + 8 * s, fy], [fx + 15 * s, fy - 6 * s], [fx + 15 * s, fy + 6 * s]], YEL);
        cv.rect(fx - 1, fy - 5 * s, fx, fy + 5 * s, WH);
        cv.rect(fx + dir * 5 * s, fy - 2, fx + dir * 5 * s + 1, fy - 1, BL);
        cv.poly([[fx - 3, fy - 5 * s], [fx + 3, fy - 5 * s], [fx, fy - 8 * s]], YEL);
      }
      fish(40, 58, 1, 1.4); fish(112, 72, -1, 1.1); fish(76, 40, 1, 0.8);
      // 泡泡
      for (i = 0; i < 12; i++) { x = 8 + Math.floor(R() * 144); y = 10 + Math.floor(R() * 90); cv.circ(x, y, 1 + (i & 1), WH); cv.set(x, y, BL); }
      // 珊瑚（分枝）
      function coral(x0, y0, len, ang, depth, c) {
        if (depth <= 0 || len < 3) return;
        var x1 = x0 + Math.cos(ang) * len, y1 = y0 - Math.sin(ang) * len;
        cv.line(x0, y0, x1, y1, c, Math.max(2, depth));
        coral(x1, y1, len * 0.72, ang + 0.45 + R() * 0.2, depth - 1, c);
        coral(x1, y1, len * 0.7, ang - 0.45 - R() * 0.2, depth - 1, c);
      }
      coral(30, 150, 16, Math.PI / 2, 4, ROSE); coral(118, 152, 18, Math.PI / 2, 4, PINK);
      coral(70, 154, 12, Math.PI / 2 + 0.2, 3, PINK); coral(146, 150, 12, Math.PI / 2 - 0.2, 3, ROSE);
      // 腦珊瑚
      cv.ellipse(88, 146, 14, 8, ROSE);
      for (x = 78; x < 100; x += 4) cv.line(x, 140, x + 2, 152, PINK);
      // 海草
      for (i = 0; i < 4; i++) {
        var sx = 8 + i * 44 + Math.floor(R() * 10);
        for (y = 156; y > 104 + (i & 1) * 12; y--) { x = sx + Math.round(Math.sin(y / 6 + i) * 3); cv.rect(x, y, x + 2, y, GRN); }
      }
      // 沙地
      cv.poly([[0, 160], [0, 152], [40, 150], [90, 156], [130, 150], [160, 153], [160, 160]], SAND);
      for (i = 0; i < 20; i++) { x = Math.floor(R() * 160); cv.set(x, 156 + Math.floor(R() * 4), NV); }
    }
  });

  // 3 夕照天文台
  PICS.push({
    name: 'OBSERVATORY', short: 'OBSERVE',
    pal: [[0x13, 0x24, 0x30], [0x13, 0x24, 0x27], [0x24, 0x03, 0x22], [0x27, 0x28, 0x03]],
    draw: function (cv) {
      var R = rng(31), i, x, y;
      var PUR = C(1, 1), PNK = C(1, 2), ORG = C(1, 3), WHT = C(0, 3), DP = C(2, 2), LAV = C(2, 3), YEL = C(3, 2);
      cv.fill(PUR);
      cv.grad(0, 40, 159, 63, PUR, PNK, 4);
      cv.rect(0, 64, 159, 87, PNK);
      cv.grad(0, 88, 159, 103, PNK, ORG, 2);
      cv.rect(0, 104, 159, 159, ORG);
      // 星 + 流星
      for (i = 0; i < 18; i++) { x = Math.floor(R() * 158); y = 2 + Math.floor(R() * 34); star(cv, x, y, WHT, R() < 0.2); }
      cv.line(20, 10, 46, 22, WHT); cv.line(22, 10, 40, 18, PNK);
      // 太陽
      cv.circ(26, 96, 14, YEL);
      for (y = 92; y < 112; y += 4) cv.rect(10, y, 42, y, ORG);
      cv.over(function () { cv.circ(26, 96, 14, YEL); }, [ORG]);
      // 山（深紫 + 薰衣草雪）
      var mt = [[0, 116], [0, 108], [18, 100], [30, 104], [54, 70], [72, 92], [86, 84], [108, 60], [128, 82], [144, 74], [160, 86], [160, 116]];
      cv.poly(mt, DP);
      cv.poly([[54, 70], [48, 78], [52, 76], [56, 80], [60, 76]], LAV);
      cv.poly([[108, 60], [101, 70], [106, 68], [110, 72], [115, 68]], LAV);
      // 前景丘（黑剪影）+ 天文台
      cv.poly([[0, 160], [0, 128], [40, 124], [80, 120], [120, 112], [160, 118], [160, 160]], 0);
      cv.ellipse(111.5, 106, 16, 14, WHT);
      cv.rect(94, 106, 129, 120, C(0, 1));
      cv.rect(94, 106, 129, 107, C(0, 2));
      cv.rect(110, 92, 113, 105, C(0, 1));
      cv.line(112, 98, 124, 84, C(0, 1), 2);
      cv.rect(108, 112, 114, 120, C(0, 2)); cv.rect(98, 111, 101, 114, WHT); cv.rect(122, 111, 125, 114, WHT);
      // 小路燈
      for (x = 20; x < 96; x += 18) { y = 126 - (x / 40) | 0; cv.rect(x, y - 6, x, y, C(0, 1)); cv.set(x, y - 7, C(0, 2)); }
      for (i = 0; i < 14; i++) { x = Math.floor(R() * 160); y = 132 + Math.floor(R() * 26); cv.set(x, y, C(0, 1)); }
    }
  });

  // 4 水晶洞
  PICS.push({
    name: 'CRYSTAL CAVE', short: 'CRYSTAL',
    pal: [[0x13, 0x23, 0x30], [0x0C, 0x1C, 0x2C], [0x07, 0x00, 0x10], [0x06, 0x27, 0x28]],
    draw: function (cv) {
      var R = rng(41), i, x, y;
      var BR = C(2, 1), GY = C(2, 2), LG = C(2, 3);
      cv.fill(0);
      // 洞壁（上緣 + 左右）
      cv.poly([[0, 0], [160, 0], [160, 30], [140, 22], [120, 34], [100, 20], [80, 30], [60, 18], [40, 32], [20, 20], [0, 34]], GY);
      cv.poly([[0, 0], [24, 0], [18, 60], [26, 110], [12, 160], [0, 160]], GY);
      cv.poly([[160, 0], [138, 0], [146, 50], [134, 100], [148, 160], [160, 160]], GY);
      // 鐘乳石
      for (i = 0; i < 8; i++) { x = 26 + i * 15; var l = 14 + Math.floor(R() * 22); cv.poly([[x - 4, 26], [x + 4, 26], [x, 26 + l]], GY); cv.line(x - 2, 28, x, 22 + l, LG); }
      // 地面
      cv.poly([[0, 160], [0, 140], [30, 132], [70, 138], [100, 130], [140, 136], [160, 132], [160, 160]], BR);
      for (i = 0; i < 40; i++) { x = Math.floor(R() * 160); y = 136 + Math.floor(R() * 24); if (cv.get(x, y) === BR) cv.rect(x, y, x + 2, y, GY); }
      for (i = 0; i < 30; i++) { x = Math.floor(R() * 160); y = Math.floor(R() * 160); if (cv.get(x, y) === GY) cv.rect(x, y, x + 3, y, (i & 1) ? LG : BR); }
      // 水晶簇
      function crystal(cx, by, w, h, lean, p) {
        cv.poly([[cx - w, by], [cx - w + lean, by - h * 0.8], [cx + lean, by - h], [cx + w + lean, by - h * 0.8], [cx + w, by]], C(p, 1));
        cv.poly([[cx, by], [cx + lean * 0.5, by - h * 0.95], [cx + w + lean, by - h * 0.8], [cx + w, by]], C(p, 2));
        cv.line(cx - w / 2, by - 2, cx - w / 2 + lean * 0.8, by - h * 0.8, C(p, 3));
      }
      crystal(36, 138, 7, 46, -6, 0); crystal(50, 136, 6, 34, 4, 0); crystal(24, 140, 5, 26, -8, 0); crystal(60, 138, 4, 20, 6, 0);
      crystal(118, 134, 8, 52, 5, 1); crystal(104, 134, 5, 30, -6, 1); crystal(132, 136, 5, 28, 8, 1); crystal(96, 136, 3, 16, -4, 1);
      // 小水晶（上壁）
      crystal(72, 30, 3, -14, 0, 1); crystal(110, 26, 3, -12, 2, 0);
      // 營火燈籠（中央）
      cv.rect(74, 120, 86, 132, C(3, 1)); cv.rect(76, 122, 84, 130, C(3, 2)); cv.rect(78, 124, 82, 128, C(3, 3));
      cv.rect(79, 114, 81, 119, C(3, 1)); cv.rect(76, 112, 84, 113, C(3, 1));
      for (i = 0; i < 10; i++) { var a = i * 0.63, r = 14 + (i & 1) * 5; cv.set(80 + Math.cos(a) * r, 126 + Math.sin(a) * r * 0.6, C(3, 3)); }
      // 發光菇
      for (i = 0; i < 4; i++) { x = 64 + i * 10 + (i > 1 ? 20 : 0); y = 140; cv.ellipse(x, y - 4, 4, 2, C(3, 2)); cv.rect(x, y - 3, x, y, C(3, 3)); }
      // 螢光點
      for (i = 0; i < 16; i++) { x = 30 + Math.floor(R() * 100); y = 40 + Math.floor(R() * 60); cv.set(x, y, (i & 1) ? C(1, 3) : C(0, 3)); }
    }
  });

  // 5 星鯨
  PICS.push({
    name: 'STAR WHALE', short: 'WHALE',
    pal: [[0x12, 0x21, 0x30], [0x04, 0x14, 0x24], [0x02, 0x12, 0x22], [0x18, 0x28, 0x38]],
    draw: function (cv) {
      var R = rng(53), i, x, y;
      cv.fill(0);
      // 星雲（混色雲團）
      function cloud(cx, cy, rx, ry, p) {
        for (y = Math.floor(cy - ry); y <= cy + ry; y++) for (x = Math.floor(cx - rx); x <= cx + rx; x++) {
          var d = ((x - cx) / rx) * ((x - cx) / rx) + ((y - cy) / ry) * ((y - cy) / ry);
          if (d > 1) continue;
          var lvl = Math.round((1 - d) * 16), B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
          var b = B[(y & 3) * 4 + (x & 3)];
          var cur = cv.get(x, y);
          if (b < lvl) cv.set(x, y, lvl > 12 ? C(p, 3) : (lvl > 7 ? C(p, 2) : C(p, 1)));
          else if (cur === 0 && b < lvl + 4) cv.set(x, y, C(p, 1));
        }
      }
      cloud(30, 28, 44, 24, 1); cloud(60, 18, 26, 12, 1);
      cloud(130, 138, 44, 22, 2); cloud(100, 150, 30, 10, 2);
      // 行星（右上，有環）
      cv.circ(132, 30, 13, C(3, 2)); cv.circ(128, 26, 6, C(3, 3));
      cv.over(function () { cv.ellipse(132, 30, 24, 5, C(3, 1)); }, [0]);
      cv.ellipse(132, 32, 24, 2, C(3, 1)); cv.circ(132, 30, 13, C(3, 2)); cv.rect(119, 31, 145, 32, C(3, 1));
      // 星
      for (i = 0; i < 30; i++) { x = Math.floor(R() * 160); y = Math.floor(R() * 160); if (cv.get(x, y) === 0) star(cv, x, y, R() < 0.5 ? C(3, 3) : C(3, 2), R() < 0.15); }
      // 鯨（第 0 組：靛 / 淺藍 / 白）
      var IND = C(0, 1), LB = C(0, 2), WH = C(0, 3);
      cv.ellipse(92, 88, 50, 22, IND);
      cv.poly([[44, 84], [20, 70], [12, 58], [24, 74], [6, 82], [24, 86], [12, 104], [26, 96], [46, 94]], IND);
      cv.ellipse(98, 98, 40, 11, LB);
      for (x = 70; x < 132; x += 6) cv.line(x, 94, x + 3, 106, IND);
      cv.over(function () { cv.ellipse(92, 88, 50, 22, IND); }, [LB]);
      cv.ellipse(100, 99, 38, 9, LB);
      for (x = 72; x < 132; x += 6) cv.line(x, 93, x + 2, 106, IND);
      cv.circ(124, 82, 3, WH); cv.set(125, 82, IND);
      cv.poly([[88, 98], [76, 118], [100, 104]], IND);
      cv.line(132, 92, 140, 90, IND, 2);
      // 背上星斑
      for (i = 0; i < 8; i++) { x = 60 + i * 8; y = 74 + Math.round(Math.sin(i) * 3); cv.set(x, y, WH); }
      // 尾跡星屑
      for (i = 0; i < 14; i++) { x = 10 + i * 4; y = 64 + Math.round(Math.sin(i * 0.8) * 8) - i; star(cv, x - 6, y + 40, C(3, 3), i % 4 === 0); }
    }
  });

  /* ---------------- PPU 化 ---------------- */
  var cache = {};
  function rgb(c) { return (NES.PALETTE && NES.PALETTE.rgb) ? NES.PALETTE.rgb(c) : [c * 4, c * 4, c * 4]; }
  function dist(a, b) { var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return d0 * d0 + d1 * d1 + d2 * d2; }
  function make(i, budget) {
    budget = budget || 192;
    var key = i + ':' + budget;
    if (cache[key]) return cache[key];
    var P = PICS[i], cv = Canvas();
    P.draw(cv);
    var px = cv.px, bd = 0x0F;
    var colorOf = function (v) { if (!v) return bd; return P.pal[v >> 2][(v & 3) - 1]; };
    var blockPal = [], idx = new Uint8Array(W * H), bx, by, x, y, k;
    var remapped = 0;
    for (by = 0; by < 10; by++) {
      blockPal.push([]);
      for (bx = 0; bx < 10; bx++) {
        var cnt = [0, 0, 0, 0];
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var v = px[(by * 16 + y) * W + bx * 16 + x]; if (v) cnt[v >> 2]++; }
        // 挑「換色誤差總和最小」的那組（同分取像素多的）
        var best = 0, bestErr = 1e18;
        for (k = 0; k < 4; k++) {
          var err = 0, ch = [bd].concat(P.pal[k]);
          for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
            var v1 = px[(by * 16 + y) * W + bx * 16 + x];
            if (!v1 || (v1 >> 2) === k) continue;
            var w1 = rgb(colorOf(v1)), m1 = 1e9;
            for (var c1 = 0; c1 < 4; c1++) m1 = Math.min(m1, dist(w1, rgb(ch[c1])));
            err += m1;
          }
          if (err < bestErr || (err === bestErr && cnt[k] > cnt[best])) { bestErr = err; best = k; }
        }
        blockPal[by].push(best);
        var choices = [bd].concat(P.pal[best]);
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
          var o = (by * 16 + y) * W + bx * 16 + x, v2 = px[o];
          if (!v2) { idx[o] = 0; continue; }
          if ((v2 >> 2) === best) { idx[o] = v2 & 3; continue; }
          var want = rgb(colorOf(v2)), bi = 0, bdv = 1e9;
          for (k = 0; k < 4; k++) { var dd = dist(want, rgb(choices[k])); if (dd < bdv) { bdv = dd; bi = k; } }
          idx[o] = bi; remapped++;
        }
      }
    }
    // 切磁磚 + 去重
    var tiles = [], tkey = {}, map = [], use = [];
    for (var ty = 0; ty < 20; ty++) {
      map.push([]);
      for (var tx = 0; tx < 20; tx++) {
        var t = new Uint8Array(64);
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) t[y * 8 + x] = idx[(ty * 8 + y) * W + tx * 8 + x];
        var s = t.join('');
        if (tkey[s] === undefined) { tkey[s] = tiles.length; tiles.push(t); use.push(0); }
        map[ty].push(tkey[s]); use[tkey[s]]++;
      }
    }
    var unique = tiles.length;
    // 合併最像的兩塊直到 ≤ 預算
    var rep = []; for (k = 0; k < tiles.length; k++) rep.push(k);
    function find(a) { while (rep[a] !== a) { rep[a] = rep[rep[a]]; a = rep[a]; } return a; }
    var alive = tiles.length, merged = 0;
    if (alive > budget) {
      var pairs = [], n = tiles.length;
      for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
        var d = 0, ta = tiles[a], tb = tiles[b];
        for (var q = 0; q < 64; q++) if (ta[q] !== tb[q]) d++;
        if (d <= 40) pairs.push(d * 1048576 + a * 1024 + b);
      }
      pairs.sort(function (p1, p2) { return p1 - p2; });
      for (var pi = 0; pi < pairs.length && alive > budget; pi++) {
        var pa = Math.floor(pairs[pi] / 1024) % 1024, pb = pairs[pi] % 1024;
        var ra = find(pa), rb = find(pb);
        if (ra === rb) continue;
        if (use[ra] >= use[rb]) { rep[rb] = ra; use[ra] += use[rb]; } else { rep[ra] = rb; use[rb] += use[ra]; }
        alive--; merged++;
      }
    }
    var outIdx = {}, out = [];
    for (k = 0; k < tiles.length; k++) { var r = find(k); if (outIdx[r] === undefined) { outIdx[r] = out.length; out.push(tiles[r]); } }
    for (ty = 0; ty < 20; ty++) for (tx = 0; tx < 20; tx++) map[ty][tx] = outIdx[find(map[ty][tx])];
    var res = { name: P.name, short: P.short, pal: P.pal, blockPal: blockPal, tiles: out, map: map,
                stats: { unique: unique, final: out.length, merged: merged, remapped: remapped } };
    cache[key] = res;
    return res;
  }
  // 原始邏輯色畫布（測試用）
  function raw(i) { var cv = Canvas(); PICS[i].draw(cv); return cv.px; }

  SL.Pics = { PICS: PICS, make: make, raw: raw, W: W, H: H, count: PICS.length };
})();
