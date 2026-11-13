/*
 * games/cart5/escape/art.js — 《星塵密室》原創像素畫 + CHR 組裝（R9 C9-4 cart5-escape）
 * ---------------------------------------------------------------------------
 * 作法（像 NES 美術師用「整張畫 → 切磁磚 → 去重 → 每 16×16 選調色盤」）：
 *   1. 每一面牆 / 特寫用小型繪圖指令（矩形 / 圓 / 點陣字 / 像素圖）畫在 256×128 的「NES 色號」畫布上；
 *   2. compose()：每個 16×16 屬性區塊挑一組能容納全部顏色的背景調色盤（四組的 c1 都是牆色 W，黑色 = backdrop）；
 *      放不下時取涵蓋最多像素的那組，其餘顏色換成該組裡 RGB 最接近的（stats.approx 計數，測試盯著它）；
 *      「soft」像素（牆上的星點等點綴）只在區塊調色盤剛好有那個顏色時才畫；
 *   3. 切 8×8 磁磚、以 0..3 色號字串去重 ⇒ TileSet；bank = 空白 + 本畫面磁磚 + 物品圖示 + 數字 + CT.Text 字形池。
 * 每面牆一個 bank（轉身 / 狀態改變時在 CT.blank 裡重建），房間畫面磁磚 ≤ BUDGET（測試驗）。
 * 契約：CT.Escape.Art = { Canvas, compose, TileSet, view(room, dir, st), closeup(room, puz, …), icon(itemId), title(), story(k),
 *        sprBank(), SPR, BUDGET }
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var E = CT.Escape = CT.Escape || {};
  var K = 0x0F;                 // backdrop 黑
  var VW = 256, VH = 128;       // 房間畫面
  var BUDGET = 108;             // 房間 / 特寫畫面最多幾個磁磚（其餘留給字形池 / 圖示 / 數字）

  /* ============================================================ 畫布 */
  function Canvas(w, h, bg) {
    this.w = w; this.h = h;
    this.p = new Int16Array(w * h); this.s = new Int16Array(w * h);
    this.p.fill(bg === undefined ? K : bg); this.s.fill(-1);
  }
  var CP = Canvas.prototype;
  CP.px = function (x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) { this.p[y * this.w + x] = c; this.s[y * this.w + x] = -1; } return this; };
  CP.soft = function (x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.s[y * this.w + x] = c; return this; };
  CP.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.p[y * this.w + x] : K; };
  CP.rect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.px(x + i, y + j, c); return this; };
  CP.hl = function (x, y, w, c) { return this.rect(x, y, w, 1, c); };
  CP.vl = function (x, y, h, c) { return this.rect(x, y, 1, h, c); };
  CP.box = function (x, y, w, h, c) { this.hl(x, y, w, c); this.hl(x, y + h - 1, w, c); this.vl(x, y, h, c); this.vl(x + w - 1, y, h, c); return this; };
  CP.panel = function (x, y, w, h, fill, edge) { this.rect(x, y, w, h, fill); return this.box(x, y, w, h, edge === undefined ? K : edge); };
  CP.disc = function (cx, cy, r, c) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
    return this;
  };
  CP.ring = function (cx, cy, r, c, t) {
    t = t || 1;
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      var d = x * x + y * y;
      if (d <= r * r + r * 0.6 && d > (r - t) * (r - t) + (r - t) * 0.6) this.px(cx + x, cy + y, c);
    }
    return this;
  };
  CP.ellipse = function (cx, cy, rx, ry, c) {
    var n = Math.max(rx, ry) * 8;
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; this.px(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), c); }
    return this;
  };
  CP.line = function (x0, y0, x1, y1, c) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, er = dx - dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = er * 2;
      if (e2 > -dy) { er -= dy; x0 += sx; }
      if (e2 < dx) { er += dx; y0 += sy; }
    }
    return this;
  };
  // 像素圖：rows 字串、map {字元: 色號}；'.' 透明
  CP.art = function (x, y, rows, map) {
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
      var ch = rows[j].charAt(i);
      if (ch === '.' || ch === ' ') continue;
      if (map[ch] !== undefined) this.px(x + i, y + j, map[ch]);
    }
    return this;
  };
  // 點陣小字（數字 3×5 / 符號 5×5）
  var MICRO = {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '###', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'],
    '▲': ['..#..', '..#..', '.###.', '.###.', '#####'], '●': ['.###.', '#####', '#####', '#####', '.###.'],
    '■': ['#####', '#####', '#####', '#####', '#####'], '◆': ['..#..', '.###.', '#####', '.###.', '..#..'],
    '★': ['..#..', '#####', '.###.', '.#.#.', '#...#'], '+': ['.....', '..#..', '.###.', '..#..', '.....'],
    '=': ['.....', '.###.', '.....', '.###.', '.....'], 'x': ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
    '-': ['.....', '.....', '.###.', '.....', '.....']
  };
  CP.micro = function (x, y, s, c) {
    var cx = x, arr = Array.from ? Array.from(String(s)) : String(s).split('');
    for (var k = 0; k < arr.length; k++) {
      var g = MICRO[arr[k]];
      if (!g) { cx += 3; continue; }
      for (var j = 0; j < g.length; j++) for (var i = 0; i < g[j].length; i++) if (g[j].charAt(i) === '#') this.px(cx + i, y + j, c);
      cx += g[0].length + 1;
    }
    return cx;
  };

  /* ============================================================ 調色盤工具 */
  var rgbCache = {};
  function rgb(c) {
    if (!rgbCache[c]) rgbCache[c] = (NES.PALETTE && NES.PALETTE.rgb) ? NES.PALETTE.rgb(c) : [c * 4, c * 4, c * 4];
    return rgbCache[c];
  }
  function dist(a, b) { var A = rgb(a), B = rgb(b); return (A[0] - B[0]) * (A[0] - B[0]) * 3 + (A[1] - B[1]) * (A[1] - B[1]) * 4 + (A[2] - B[2]) * (A[2] - B[2]) * 2; }

  /* ============================================================ 磁磚集 + 組合 */
  function TileSet() { this.list = []; this.map = {}; this.map[BLANK_KEY] = -1; }
  var BLANK_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
  // 回傳 bank 內的名字（空白 = 'Z'）
  TileSet.prototype.add = function (key) {
    if (key === BLANK_KEY) return 'Z';
    var i = this.map[key];
    if (i === undefined) { i = this.list.length; this.list.push(key); this.map[key] = i; }
    return 'V' + i;
  };
  TileSet.prototype.rows = function (i) {
    var k = this.list[i], out = [];
    for (var y = 0; y < 8; y++) out.push(k.substr(y * 8, 8).replace(/0/g, '.'));
    return out;
  };
  // compose(cv, pals, ts) → {cols, rows, cells[名字], attr[區塊調色盤], approx}
  function compose(cv, pals, ts) {
    var cols = cv.w >> 3, rows = cv.h >> 3, bw = cv.w >> 4, bh = cv.h >> 4;
    var cells = new Array(cols * rows), attr = new Array(bw * bh), approx = 0;
    for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) {
      var cnt = {}, x, y, c;
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        c = cv.p[(by * 16 + y) * cv.w + bx * 16 + x];
        if (c !== K && c >= 0) cnt[c] = (cnt[c] || 0) + 1;
      }
      var cs = Object.keys(cnt).map(Number), best = -1, bestCov = -1;
      for (var p = 0; p < pals.length; p++) {
        var cov = 0;
        cs.forEach(function (cc) { if (pals[p].indexOf(cc) >= 0) cov += cnt[cc]; });
        if (cov > bestCov) { bestCov = cov; best = p; }
      }
      var pal = pals[best];
      if (cs.some(function (cc) { return pal.indexOf(cc) < 0; })) approx++;
      attr[by * bw + bx] = best;
      var mapc = {};
      cs.forEach(function (cc) {
        var i = pal.indexOf(cc);
        if (i >= 0) { mapc[cc] = i + 1; return; }
        var bd = dist(cc, K), bi = 0;
        for (var k = 0; k < 3; k++) { var d = dist(cc, pal[k]); if (d < bd) { bd = d; bi = k + 1; } }
        mapc[cc] = bi;
      });
      for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
        var key = '';
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
          var px = bx * 16 + tx * 8 + x, py = by * 16 + ty * 8 + y, o = py * cv.w + px;
          var sc = cv.s[o], v;
          if (sc >= 0 && pal.indexOf(sc) >= 0) v = pal.indexOf(sc) + 1;
          else { c = cv.p[o]; v = (c === K || c < 0) ? 0 : mapc[c]; }
          key += v;
        }
        cells[(by * 2 + ty) * cols + bx * 2 + tx] = ts.add(key);
      }
    }
    return { cols: cols, rows: rows, cells: cells, attr: attr, bw: bw, bh: bh, approx: approx };
  }

  /* ============================================================ 共用背景 */
  function roomBg(cv, W, opt) {
    opt = opt || {};
    cv.rect(0, 0, VW, 88, W);
    // 牆紙：每 16 px 一個小菱形（黑）；穹頂星室改成星點
    for (var y = 8; y < 76; y += 16) for (var x = 8; x < VW; x += 16) {
      var ox = ((y >> 4) & 1) ? 8 : 0;
      if (opt.stars) { if (((x * 7 + y * 13) % 5) === 0) cv.soft(x + ox - 4, y, 0x30); else if (((x * 3 + y) % 7) === 0) cv.soft(x + ox, y - 3, 0x12); }
      else { cv.px(x + ox, y - 1, K); cv.px(x + ox - 1, y, K); cv.px(x + ox + 1, y, K); cv.px(x + ox, y + 1, K); }
    }
    if (opt.plates) { for (var yy = 15; yy < 80; yy += 16) cv.hl(0, yy, VW, K); for (var xx = 0; xx < VW; xx += 32) for (yy = 4; yy < 80; yy += 16) cv.px(xx + 3, yy, K); }
    // 踢腳板
    cv.hl(0, 79, VW, K); cv.hl(0, 87, VW, K);
    for (var bx = 0; bx < VW; bx += 32) cv.vl(bx, 80, 7, K);
    // 地板：黑底 + 牆色木紋（越近越寬）
    cv.rect(0, 88, VW, 40, K);
    [92, 99, 108, 119].forEach(function (yy, i) { cv.hl(0, yy, VW, W); for (var x2 = (i * 24) % 48; x2 < VW; x2 += 48 + i * 8) cv.vl(x2, yy + 1, [6, 8, 10, 8][i], W); });
  }
  function tile(c) { return [c, c, c, c, c, c, c, c]; }

  /* ============================================================ 家具 / 道具（各房間共用的畫法） */
  function chair(cv, x, y, c1, c2) {                // 40×72 椅子（x,y = 左上）
    cv.panel(x + 4, y, 32, 8, c2); cv.panel(x + 4, y + 8, 6, 28, c1); cv.panel(x + 30, y + 8, 6, 28, c1);
    cv.rect(x + 12, y + 12, 16, 3, c1); cv.rect(x + 12, y + 20, 16, 3, c1);
    cv.panel(x, y + 36, 40, 8, c2);
    cv.panel(x + 2, y + 44, 5, 26, c1); cv.panel(x + 33, y + 44, 5, 26, c1); cv.rect(x + 7, y + 58, 26, 3, c1);
  }
  function gear(cv, cx, cy, r, c, hi, teeth) {
    teeth = teeth || 8;
    cv.disc(cx, cy, r - 2, c);
    for (var i = 0; i < teeth; i++) {
      var a = i / teeth * Math.PI * 2, tx = Math.round(cx + Math.cos(a) * (r - 1)), ty = Math.round(cy + Math.sin(a) * (r - 1));
      cv.rect(tx - 1, ty - 1, 3, 3, c);
    }
    cv.ring(cx, cy, r - 2, K);
    if (hi !== undefined) cv.ring(cx, cy, r - 4, hi);
    cv.disc(cx, cy, Math.max(2, (r / 3) | 0), K);
  }

  /* ============================================================ 第一室：觀星書房 */
  var Y = 0x28, WH = 0x30, RD = 0x16, GR = 0x1A, SK = 0x21, BR = 0x17, TN = 0x27;
  function study(cv, dir, st) {
    var W = 0x07, f = st.f;
    roomBg(cv, W);
    if (dir === 'N') {
      // 星圖（金框）
      cv.panel(24, 16, 56, 48, K, Y); cv.box(26, 18, 52, 44, Y);
      [[34, 26], [44, 30], [52, 24], [60, 34], [68, 28], [40, 46], [56, 50], [66, 48]].forEach(function (p, i) { cv.px(p[0], p[1], WH); if (i % 3 === 0) { cv.px(p[0] - 1, p[1], WH); cv.px(p[0] + 1, p[1], WH); cv.px(p[0], p[1] - 1, WH); cv.px(p[0], p[1] + 1, WH); } });
      cv.line(34, 26, 44, 30, W); cv.line(44, 30, 52, 24, W); cv.line(52, 24, 60, 34, W); cv.line(60, 34, 68, 28, W); cv.line(40, 46, 56, 50, W); cv.line(56, 50, 66, 48, W);
      // 大門
      cv.panel(102, 14, 52, 74, TN); cv.panel(106, 18, 44, 70, BR);
      if (f.won || f.unlocked) {
        cv.rect(132, 19, 17, 68, K); cv.vl(131, 19, 68, TN); cv.vl(149, 19, 68, BR);
        for (var sy = 30; sy < 80; sy += 9) cv.px(140 + (sy % 5), sy, WH);
      } else {
        cv.box(110, 24, 16, 24, W); cv.box(130, 24, 16, 24, W); cv.box(110, 54, 16, 28, W); cv.box(130, 54, 16, 28, W);
        cv.disc(144, 55, 2, Y);
      }
      // 密碼鎖：燈在上一個區塊（y 40）、面板在下（y 48）
      cv.disc(167, 42, 3, f.unlocked ? GR : RD); cv.ring(167, 42, 3, K);
      cv.panel(161, 48, 14, 22, Y);
      for (var ky = 0; ky < 3; ky++) for (var kx = 0; kx < 3; kx++) cv.rect(164 + kx * 3, 52 + ky * 5, 2, 3, K);
      cv.rect(164, 66, 8, 1, K);
      // 門墊
      cv.panel(100, 110, 56, 14, RD); cv.box(103, 113, 50, 8, Y);
    } else if (dir === 'E') {
      // 書架
      cv.panel(24, 8, 96, 98, BR); cv.rect(24, 8, 96, 4, TN); cv.rect(32, 12, 80, 88, K);
      cv.rect(32, 28, 80, 4, BR); cv.rect(32, 64, 80, 4, BR); cv.rect(24, 100, 96, 6, TN);
      // 上層：木色書
      // 每 16 px 重複同一組書（磁磚可共用）
      for (var bx = 32; bx < 112; bx += 16) { cv.panel(bx + 1, 15, 5, 13, BR); cv.panel(bx + 7, 17, 4, 11, TN); cv.panel(bx + 12, 14, 4, 14, BR); }
      // 中層：四本彩色書（每本獨佔一個 16 px 區塊）+ 牆色書填空
      var books = [[50, SK, '2'], [66, RD, '7'], [82, GR, '4'], [98, Y, '1']];
      cv.panel(34, 40, 6, 24, W); cv.panel(41, 44, 5, 20, W);
      books.forEach(function (b) {
        cv.panel(b[0], 34, 9, 30, b[1]);
        cv.hl(b[0] + 1, 37, 7, K); cv.hl(b[0] + 1, 60, 7, K);
        cv.micro(b[0] + 3, 46, b[2], K);
        cv.panel(b[0] + 10, 42, 5, 22, W);
      });
      // 下層：工具箱
      cv.panel(40, 80, 40, 20, RD); cv.rect(40, 80, 40, 3, Y); cv.box(54, 74, 12, 7, K); cv.rect(57, 89, 6, 4, Y);
      if (!f.got_trowel) { cv.vl(70, 70, 10, WH); cv.rect(68, 66, 5, 5, WH); }
      cv.panel(86, 84, 20, 16, W); cv.hl(88, 90, 16, K);
      // 窗戶
      cv.panel(144, 16, 88, 56, TN); cv.rect(150, 22, 76, 44, K); cv.rect(186, 22, 4, 44, TN); cv.rect(150, 42, 76, 3, TN);
      [[158, 28], [172, 36], [200, 30], [166, 56], [206, 26]].forEach(function (p) { cv.px(p[0], p[1], WH); });
      cv.disc(210, 54, 5, Y); cv.disc(213, 52, 4, K);
      cv.hl(140, 72, 96, BR); cv.hl(140, 73, 96, K);
      // 地球儀
      cv.disc(184, 92, 14, SK); cv.ring(184, 92, 14, K);
      cv.art(176, 84, ['.##....', '####...', '.###..#', '..#..##', '.....##', '......#'], { '#': GR });
      cv.art(186, 94, ['..##', '.###', '###.', '.#..'], { '#': GR });
      cv.rect(182, 106, 4, 8, BR); cv.panel(172, 113, 24, 5, BR);
    } else if (dir === 'S') {
      // 檯燈
      cv.art(136, 16, ['.....######.....', '....########....', '...##########...', '..############..', '.##############.', '################'], { '#': Y });
      cv.hl(136, 22, 16, K); cv.vl(143, 22, 26, K); cv.vl(144, 22, 26, K); cv.panel(134, 48, 20, 8, K, K);
      // 日記（打開的書）
      cv.panel(48, 46, 30, 10, TN); cv.vl(62, 46, 10, K); cv.hl(51, 49, 9, W); cv.hl(51, 52, 8, W); cv.hl(65, 49, 9, W); cv.hl(65, 52, 7, W);
      // 書桌
      cv.panel(36, 56, 152, 8, TN); cv.panel(40, 64, 144, 22, BR);
      cv.panel(104, 66, 46, 14, TN); cv.rect(124, 72, 6, 3, f.drawerOpen ? K : Y);
      if (f.drawerOpen) { cv.rect(106, 68, 42, 10, K); cv.hl(106, 77, 42, BR); }
      cv.panel(44, 86, 8, 32, BR); cv.panel(172, 86, 8, 32, BR);
      if (f.clue) { cv.hl(64, 89, 20, W); cv.hl(90, 89, 30, W); cv.hl(70, 92, 40, W); }
      // 椅子
      if (!f.chairMoved) chair(cv, 186, 48, BR, TN);
      else { cv.rect(190, 116, 32, 2, W); }
    } else {
      // 時鐘
      cv.disc(124, 22, 15, Y); cv.disc(124, 22, 12, WH); cv.ring(124, 22, 15, K);
      for (var h = 0; h < 12; h++) { var a = h / 12 * Math.PI * 2; cv.px(Math.round(124 + Math.sin(a) * 10), Math.round(22 - Math.cos(a) * 10), K); }
      cv.vl(124, 13, 9, K); cv.hl(124, 22, 7, K); cv.disc(124, 22, 1, RD);
      // 盆栽
      cv.art(22, 52, [
        '.........##.........',
        '....##..####..##....',
        '...####.####.####...',
        '..######.##.######..',
        '.###..##.##.##..###.',
        '.##....######....##.',
        '##..##..####..##..##',
        '#..####..##..####..#',
        '..######.##.######..',
        '.###..########..###.',
        '.##....######....##.',
        '##......####......##',
        '#...##...##...##...#',
        '...####..##..####...',
        '..##..##.##.##..##..',
        '.##....######....##.',
        '.#......####......#.',
        '.........##.........',
        '.........##.........',
        '.........##.........',
        '.........##.........',
        '.........##.........'], { '#': GR });
      cv.panel(26, 96, 26, 24, RD); cv.rect(24, 94, 30, 5, Y); cv.box(24, 94, 30, 5, K);
      if (f.dug) { cv.rect(30, 99, 18, 3, K); cv.art(54, 112, ['..##..', '.####.', '######'], { '#': W }); }
      else cv.rect(29, 99, 20, 3, W);
      // 椅子（搬過來之後）
      if (f.chairMoved) chair(cv, 104, 48, BR, TN);
      // 沙發
      cv.panel(160, 64, 72, 24, RD); cv.panel(156, 80, 80, 20, RD); cv.panel(152, 76, 12, 30, Y); cv.panel(228, 76, 12, 30, Y);
      cv.vl(196, 82, 16, K); cv.panel(160, 106, 6, 10, K); cv.panel(226, 106, 6, 10, K);
    }
  }

  /* ============================================================ 第二室：齒輪工坊 */
  var GY = 0x10, BL = 0x11, DK = 0x07;
  function works(cv, dir, st) {
    var W = 0x00, f = st.f;
    roomBg(cv, W, { plates: true });
    if (dir === 'N') {
      // 三盞燈（各在自己的 16 px 區塊）
      [[96, RD, f.power], [128, GR, f.gearIn], [160, BL, f.water]].forEach(function (L) {
        cv.disc(L[0] + 8, 9, 6, L[2] ? L[1] : K); cv.ring(L[0] + 8, 9, 6, W); cv.ring(L[0] + 8, 9, 7, K);
        if (L[2]) { cv.px(L[0] + 6, 6, WH); }
      });
      // 鐵門
      cv.panel(84, 22, 104, 66, GY); cv.rect(88, 26, 96, 58, W);
      for (var yy = 32; yy < 84; yy += 10) cv.hl(88, yy, 96, K);
      for (var xx = 92; xx < 184; xx += 12) { cv.px(xx, 29, WH); cv.px(xx, 81, WH); }
      if (f.won) { cv.rect(88, 26, 96, 50, K); for (yy = 76; yy < 84; yy += 3) cv.hl(88, yy, 96, GY); }
      // 齒輪座
      cv.panel(178, 50, 36, 34, GY); cv.rect(182, 54, 28, 26, K);
      if (f.gearIn) gear(cv, 196, 67, 11, Y, DK, 9);
      else cv.disc(196, 67, 2, GY);
      // 告示牌
      cv.panel(24, 24, 48, 44, WH); cv.rect(24, 24, 48, 8, K);
      for (var l = 0; l < 4; l++) cv.hl(30, 38 + l * 7, 30 + (l * 7) % 10, K);
    } else if (dir === 'E') {
      // 老虎鉗
      cv.panel(24, 56, 28, 10, GY); cv.panel(30, 50, 6, 8, GY); cv.panel(40, 50, 6, 8, GY); cv.hl(20, 60, 36, K);
      // 工具箱（紅，鎖黃）
      cv.panel(64, 46, 56, 26, RD); cv.rect(64, 46, 56, 4, Y); cv.box(80, 40, 24, 7, K);
      cv.panel(86, 54, 12, 12, f.boxOpen ? K : Y); if (!f.boxOpen) cv.micro(89, 57, '★', K);
      if (f.power && !f.boxOpen) cv.px(116, 52, GR);
      // 工作台
      cv.panel(16, 72, 128, 8, BR); cv.panel(20, 80, 8, 40, DK); cv.panel(132, 80, 8, 40, DK); cv.rect(28, 100, 104, 4, DK);
      // 牆上三個齒輪（大 ▲ / 中 ● / 小 ★）
      gear(cv, 176, 40, 18, GY, WH, 10); cv.disc(176, 40, 6, WH); cv.micro(174, 38, '▲', K);
      gear(cv, 214, 24, 12, GY, WH, 8); cv.disc(214, 24, 5, WH); cv.micro(212, 22, '●', K);
      gear(cv, 216, 60, 8, GY, WH, 7); cv.disc(216, 60, 4, WH); cv.micro(214, 58, '★', K);
    } else if (dir === 'S') {
      // 架子
      cv.panel(16, 16, 72, 104, BR); cv.rect(22, 20, 60, 96, K);
      cv.rect(22, 58, 60, 5, BR); cv.rect(22, 96, 60, 5, BR);
      if (!f.got_driver) { cv.rect(30, 52, 14, 5, Y); cv.box(30, 52, 14, 5, K); cv.rect(44, 54, 20, 2, GY); }
      cv.panel(64, 38, 10, 20, W); cv.panel(50, 42, 8, 16, W);
      if (!f.got_oil) { cv.panel(32, 80, 16, 16, Y); cv.line(48, 82, 56, 74, K); cv.line(48, 83, 56, 75, K); cv.rect(36, 77, 8, 3, K); }
      cv.panel(60, 82, 14, 14, W); cv.ellipse(67, 89, 5, 4, K);
      // 閥門 + 直管
      cv.rect(118, 40, 10, 88, GY); cv.vl(118, 40, 88, K); cv.vl(127, 40, 88, K);
      cv.rect(114, 36, 18, 6, GY); cv.box(114, 36, 18, 6, K);
      cv.panel(112, 78, 22, 14, GY);
      if (f.valveOn) { cv.ring(123, 74, 9, RD, 2); cv.rect(122, 64, 3, 20, RD); cv.rect(113, 73, 20, 3, RD); }
      else cv.disc(123, 74, 2, K);
      // 管線盤（預覽：灰管；有水 = 藍）
      cv.panel(160, 16, 80, 96, GY); cv.rect(164, 20, 72, 88, K);
      var pc = f.water ? BL : W;
      cv.rect(168, 60, 16, 4, pc); cv.rect(180, 36, 4, 28, pc); cv.rect(180, 36, 32, 4, pc); cv.rect(208, 36, 4, 52, pc);
      cv.rect(208, 84, 20, 4, pc); cv.rect(224, 60, 4, 28, pc);
      if (!f.water) { cv.rect(196, 72, 4, 14, W); cv.rect(170, 92, 18, 4, W); }
      gear(cv, 228, 50, 6, f.water ? BL : W, undefined, 6);
    } else {
      // 配電盤
      cv.panel(24, 16, 64, 72, GY); cv.rect(28, 20, 56, 64, W);
      if (f.panelOpen) {
        var ls = st.lights || [1, 1, 0, 1, 0, 0, 0, 0, 1];
        if (f.power) ls = [1, 1, 1, 1, 1, 1, 1, 1, 1];
        for (var i = 0; i < 9; i++) {
          var lx = 34 + (i % 3) * 16, ly = 28 + ((i / 3) | 0) * 18;
          cv.disc(lx + 6, ly + 6, 5, ls[i] ? Y : K); cv.ring(lx + 6, ly + 6, 5, K);
        }
      } else {
        cv.rect(30, 22, 52, 60, GY); cv.box(30, 22, 52, 60, K);
        [[33, 25], [77, 25], [33, 77], [77, 77]].forEach(function (p) { cv.disc(p[0] + 1, p[1] + 1, 2, WH); cv.px(p[0], p[1] + 1, K); cv.px(p[0] + 2, p[1] + 1, K); });
        cv.micro(50, 46, '-', K);
      }
      // 海報：十字形示意
      cv.panel(104, 16, 48, 56, WH);
      cv.rect(122, 26, 10, 10, K); cv.rect(112, 36, 10, 10, K); cv.rect(122, 36, 10, 10, Y); cv.rect(132, 36, 10, 10, K); cv.rect(122, 46, 10, 10, K);
      cv.hl(110, 62, 36, K); cv.hl(110, 66, 24, K);
      // 木箱
      cv.panel(160, 64, 72, 54, BR); cv.box(164, 68, 64, 46, DK); cv.line(164, 68, 227, 113, DK); cv.line(227, 68, 164, 113, DK);
    }
  }

  /* ============================================================ 第三室：穹頂星室 */
  var IB = 0x12;
  function dome(cv, dir, st) {
    var W = 0x02, f = st.f;
    roomBg(cv, W, { stars: true });
    if (dir === 'N') {
      // 穹頂小窗
      cv.panel(16, 8, 56, 48, IB); cv.rect(20, 12, 48, 40, K);
      [[26, 18], [40, 28], [56, 20], [62, 40], [30, 44], [48, 46]].forEach(function (p) { cv.px(p[0], p[1], WH); });
      if (f.diskOn) { cv.rect(40, 12, 8, 40, Y); cv.vl(39, 12, 40, WH); }
      // 星門（拱形）：黑色門板 + 金色拱框 + 金星
      cv.disc(136, 34, 40, Y); cv.rect(96, 34, 81, 54, Y);
      cv.disc(136, 34, 37, K); cv.rect(99, 34, 75, 54, K);
      cv.rect(92, 84, 89, 4, Y); cv.box(92, 84, 89, 4, K);
      [[112, 30], [160, 30], [136, 12], [108, 74], [164, 74], [124, 20], [150, 20]].forEach(function (p, i) { if (i < 5) cv.micro(p[0] - 2, p[1] - 2, '★', Y); else cv.px(p[0], p[1], Y); });
      cv.vl(136, 40, 44, W);
      cv.rect(96, 46, 4, 20, K); cv.rect(173, 46, 4, 20, K);
      // 四個寶石座（各在自己的區塊）
      var gc = [SK, WH, RD, Y];
      for (var i = 0; i < 4; i++) {
        var gx = 100 + i * 16;
        cv.rect(gx, 52, 8, 10, K); cv.box(gx - 1, 51, 10, 12, W); cv.box(gx - 2, 50, 12, 14, K);
        if (f.gemOpen) cv.art(gx + 1, 53, ['..##..', '.####.', '######', '.####.', '..##..', '...#..'].slice(0, 6), { '#': gc[i] });
        else if (f.lightOn) cv.px(gx + 4, 57, WH);
      }
      if (f.won) { cv.rect(100, 30, 72, 58, K); for (var s2 = 0; s2 < 8; s2++) cv.px(106 + s2 * 8, 36 + (s2 * 13) % 40, WH); }
      // 星盤座
      cv.panel(188, 76, 40, 8, BR); cv.panel(200, 84, 16, 28, BR); cv.panel(190, 112, 36, 6, BR);
      if (f.diskOn) { cv.disc(208, 70, 10, Y); cv.ring(208, 70, 10, K); cv.micro(206, 68, '★', RD); }
      else { cv.hl(196, 75, 24, K); }
    } else if (dir === 'E') {
      // 望遠鏡：三腳架 + 斜鏡筒
      cv.line(66, 72, 40, 118, BR); cv.line(67, 72, 41, 118, BR); cv.line(66, 72, 92, 118, BR); cv.line(67, 72, 93, 118, BR); cv.line(66, 72, 66, 118, BR);
      cv.disc(66, 70, 5, Y);
      for (var t = 0; t < 70; t++) {
        var cx = 30 + t, cy = 96 - Math.round(t * 0.85), r = 6 + Math.round(t / 24);
        for (var d = -r; d <= r; d++) cv.px(cx + Math.round(d * 0.6), cy + Math.round(d * 0.7), d === -r || d === r ? K : (d < -2 ? IB : WH));
      }
      cv.disc(100, 37, 9, f.scopeFixed ? SK : K); cv.ring(100, 37, 9, Y, 2);
      // 光路盤
      cv.panel(136, 16, 96, 88, Y); cv.rect(140, 20, 88, 80, K);
      var lc = f.lightOn ? Y : W;
      cv.rect(144, 26, 16, 3, lc); cv.rect(158, 26, 3, 30, lc); cv.rect(158, 54, 22, 3, lc); cv.rect(178, 40, 3, 16, lc);
      cv.rect(178, 40, 30, 3, lc); cv.rect(206, 40, 3, 50, lc); cv.rect(206, 88, 18, 3, lc);
      if (!f.lightOn) { cv.rect(186, 70, 3, 18, W); cv.rect(150, 80, 20, 3, W); }
      cv.micro(214, 24, '★', f.diskOn ? Y : W);
    } else if (dir === 'S') {
      // 黑板（粉筆算式）
      cv.panel(16, 8, 88, 64, BR); cv.rect(20, 12, 80, 54, K);
      cv.micro(26, 16, '▲+▲=8', WH); cv.micro(26, 28, '▲+●=7', WH); cv.micro(26, 40, '●x■=12', WH); cv.micro(26, 52, '■-◆=2', WH);
      cv.rect(30, 66, 12, 3, WH);
      // 玻璃櫃
      cv.panel(120, 24, 64, 96, BR); cv.rect(126, 30, 52, 84, K);
      cv.rect(126, 70, 52, 3, BR); cv.line(130, 34, 140, 44, SK); cv.line(132, 34, 142, 44, SK);
      if (!f.cabOpen) { cv.disc(140, 62, 6, IB); cv.ring(140, 62, 6, WH); cv.art(156, 56, ['..####..', '.######.', '########', '########'], { '#': Y }); }
      cv.panel(172, 64, 6, 10, Y); cv.micro(173, 66, '▲', K);
      // 衣帽架
      cv.rect(214, 16, 4, 98, BR); cv.panel(204, 112, 24, 6, BR); cv.hl(206, 20, 20, BR);
      cv.art(204, 8, ['....######....', '...########...', '..##########..', '##############'], { '#': RD });
      if (!f.got_cloth) { cv.panel(218, 24, 14, 22, WH); cv.hl(220, 30, 10, IB); cv.hl(220, 36, 10, IB); }
    } else {
      // 太陽系儀：黃銅箱 + 三條軌道（左端 = 太陽與目標箭頭）+ 三顆行星
      cv.panel(48, 12, 144, 76, 0x17); cv.rect(52, 16, 136, 68, K);
      cv.disc(64, 50, 9, Y); cv.disc(64, 50, 5, RD); cv.ring(64, 50, 9, K);
      var rs = st.rings || [5, 3, 4];
      if (f.ringDone) rs = [0, 0, 0];
      [[24, RD], [48, SK], [72, GR]].forEach(function (o, i) {
        cv.hl(80, o[0], 104, Y);
        for (var q = 0; q < 8; q++) cv.px(84 + q * 13, o[0] - 1, Y);
        var px = 84 + rs[i] * 13;
        cv.disc(px, o[0], 4, o[1]); cv.ring(px, o[0], 4, K);
      });
      cv.art(81, 17, ['#####', '.###.', '..#..'], { '#': WH });
      cv.panel(108, 88, 24, 22, 0x17); cv.panel(96, 108, 48, 10, 0x17);
      // 星座表
      cv.panel(200, 16, 40, 64, WH);
      [[208, 60], [214, 40], [226, 34], [234, 48]].forEach(function (p) { cv.disc(p[0], p[1], 2, K); });
      cv.line(208, 60, 214, 40, IB); cv.line(214, 40, 226, 34, IB); cv.line(226, 34, 234, 48, IB);
      cv.hl(206, 70, 28, K);
    }
  }

  var DRAW = { study: study, works: works, dome: dome };
  function view(room, dir, st) {
    var cv = new Canvas(VW, VH, K);
    DRAW[room.id](cv, dir, st);
    return cv;
  }

  /* ============================================================ 特寫（機關） */
  // 共用底：黑底 + 牆色雙框
  function closeBg(cv, W, frameC) {
    cv.rect(0, 0, VW, VH, K);
    cv.box(4, 2, VW - 8, VH - 4, W); cv.box(6, 4, VW - 12, VH - 8, frameC);
  }
  // 九燈：燈泡 16×16（亮 / 暗）；回傳要另外切的變體畫布
  function lampArt(on) {
    var cv = new Canvas(16, 16, K);
    cv.disc(8, 7, 6, on ? Y : K); cv.ring(8, 7, 6, 0x10); cv.rect(5, 13, 6, 3, 0x10);
    if (on) { cv.px(6, 4, WH); cv.px(5, 5, WH); }
    return cv;
  }
  function slotArt(kind, c) {           // 太陽系儀軌道格：kind 0 空、1 行星、2 行星在目標格
    var cv = new Canvas(16, 16, K);
    cv.hl(0, 8, 16, Y);
    if (kind === 0) cv.disc(8, 8, 1, Y);
    else { cv.disc(8, 8, 5, c); cv.ring(8, 8, 5, K); cv.px(6, 6, WH); }
    return cv;
  }
  function pipeArt(t, r, lit, theme) {
    var cv = new Canvas(16, 16, K), c = lit ? (theme === 'light' ? Y : BL) : (theme === 'light' ? 0x02 : 0x00);
    var L = E.Logic.Pipes, op = L.open(t, r);
    
    cv.rect(5, 5, 6, 6, c);
    op.forEach(function (d) {
      if (d === 0) cv.rect(5, 0, 6, 6, c); if (d === 2) cv.rect(5, 10, 6, 6, c);
      if (d === 1) cv.rect(10, 5, 6, 6, c); if (d === 3) cv.rect(0, 5, 6, 6, c);
    });
    // 管壁黑線
    op.forEach(function (d) {
      if (d === 0 || d === 2) { cv.vl(5, d === 0 ? 0 : 10, 6, K); cv.vl(10, d === 0 ? 0 : 10, 6, K); }
      else { cv.hl(d === 3 ? 0 : 10, 5, 6, K); cv.hl(d === 3 ? 0 : 10, 10, 6, K); }
    });
    if (lit) cv.px(7, 7, WH);
    return cv;
  }
  // 管線格的左上角（房間畫面 px；必須對齊 16 px 屬性區塊）
  function pipeGeom(p) { return { gx: 128 - p.w * 8, gy: 16 + (4 - p.h) * 16 }; }
  // closeup(room, puz) → {cv 主畫布, extra {名字: 畫布}}：extra 的磁磚也進 bank（燈 / 軌道 / 管線的各種狀態）
  function closeup(room, p, st) {
    var cv = new Canvas(VW, VH, K), extra = {};
    var W = room.W, fr = room.id === 'works' ? 0x10 : (room.id === 'dome' ? Y : 0x27);
    closeBg(cv, W, fr);
    if (p.kind === 'dial') {
      // 面板 + 鑰匙孔裝飾（撥盤窗由 CT.Text 框線磁磚畫）
      cv.panel(48, 30, 160, 68, W); cv.box(50, 32, 156, 64, fr);
      cv.disc(128, 106, 5, fr); cv.rect(127, 106, 3, 10, fr); cv.rect(127, 108, 3, 4, K);
    } else if (p.kind === 'lights') {
      cv.panel(72, 12, 112, 108, 0x00); cv.box(74, 14, 108, 104, 0x10);
      extra.on = lampArt(true); extra.off = lampArt(false);
    } else if (p.kind === 'rings') {
      extra.e0 = slotArt(0); extra.p0 = slotArt(1, RD); extra.p1 = slotArt(1, SK); extra.p2 = slotArt(1, GR);
      // 目標箭頭（第 0 格上方）
      cv.art(68, 7, ['#######', '.#####.', '..###..', '...#...'], { '#': WH });
    } else if (p.kind === 'pipes') {
      var L = E.Logic.Pipes;
      ['I', 'L'].forEach(function (t) {
        for (var r = 0; r < L.mod(t); r++) { extra[t + r + 'u'] = pipeArt(t, r, false, p.theme); extra[t + r + 'l'] = pipeArt(t, r, true, p.theme); }
      });
      var G = pipeGeom(p), gx = G.gx, gy = G.gy, inY = gy + p.inRow * 16, outY = gy + p.outRow * 16;
      // 入口（水龍頭 / 星光）與出口（水車 / 星門）
      var lit = p.theme === 'light' ? Y : BL;
      cv.rect(gx - 24, inY + 5, 24, 6, lit); cv.hl(gx - 24, inY + 4, 24, K); cv.hl(gx - 24, inY + 11, 24, K);
      cv.disc(gx - 28, inY + 8, 6, lit); cv.ring(gx - 28, inY + 8, 6, K);
      var ox = gx + p.w * 16;
      cv.rect(ox, outY + 5, 16, 6, 0x00); cv.hl(ox, outY + 4, 16, K); cv.hl(ox, outY + 11, 16, K);
      if (p.theme === 'light') { cv.micro(ox + 18, outY + 6, '★', st && st.f && st.f.lightOn ? Y : W); cv.box(ox + 16, outY, 10, 16, Y); }
      else gear(cv, ox + 24, outY + 8, 9, st && st.f && st.f.water ? BL : 0x10, undefined, 8);
    } else if (p.kind === 'look') {
      // 望遠鏡視野：圓形鏡頭 + 星空 + 提燈座四顆彩色星（各在自己的區塊）
      for (var y = 0; y < VH; y++) for (var x = 0; x < VW; x++) {
        var dx = x - 128, dy = y - 64, d = dx * dx + dy * dy;
        if (d > 58 * 58) cv.px(x, y, K);
        else if (d > 56 * 56) cv.px(x, y, Y);
        else { cv.px(x, y, K); if (((x * 31 + y * 17) % 211) === 0) cv.soft(x, y, WH); }
      }
      var stars = [[88, 72, SK], [112, 48, WH], [144, 40, RD], [168, 56, Y]];
      for (var i = 0; i < 3; i++) cv.line(stars[i][0], stars[i][1], stars[i + 1][0], stars[i + 1][1], W);
      stars.forEach(function (s) { cv.art(s[0] - 4, s[1] - 4, ['....#....', '....#....', '...###...', '#########', '..#####..', '...###...', '..##.##..', '.#.....#.', '.........'], { '#': s[2] }); });
    }
    return { cv: cv, extra: extra };
  }

  /* ============================================================ 物品圖示 16×16 */
  var ICON = {
    trowel: function (cv) { cv.rect(7, 0, 3, 6, 0x17); cv.rect(6, 5, 5, 2, K); cv.art(3, 6, ['.##########.', '############', '############', '.##########.', '..########..', '...######...', '....####....', '.....##.....'], { '#': WH }); cv.vl(8, 7, 5, K); },
    key: function (cv) { cv.ring(4, 8, 3, Y, 2); cv.rect(7, 7, 8, 3, Y); cv.rect(11, 10, 2, 3, Y); cv.rect(14, 10, 2, 2, Y); cv.hl(7, 6, 8, K); },
    flash: function (cv) { cv.panel(1, 5, 10, 6, 0x27); cv.panel(10, 3, 5, 10, Y); cv.rect(14, 5, 1, 6, K); cv.px(4, 8, K); },
    battery: function (cv) { cv.panel(2, 4, 11, 8, RD); cv.rect(2, 4, 4, 8, Y); cv.box(2, 4, 11, 8, K); cv.rect(13, 6, 2, 4, Y); },
    flashOn: function (cv) { cv.panel(0, 6, 8, 5, 0x27); cv.panel(7, 4, 4, 9, Y); cv.art(11, 2, ['..##', '.###', '####', '####', '####', '####', '.###', '..##'].concat(['....']), { '#': WH }); },
    driver: function (cv) { cv.panel(1, 5, 7, 6, Y); cv.hl(2, 7, 5, K); cv.rect(8, 7, 7, 2, 0x10); cv.px(15, 7, K); },
    oil: function (cv) { cv.panel(2, 6, 9, 9, Y); cv.line(11, 7, 15, 2, K); cv.line(11, 8, 15, 3, K); cv.rect(4, 3, 5, 3, RD); cv.hl(3, 10, 7, RD); },
    gear: function (cv) { gear(cv, 8, 8, 7, 0x07, 0x17, 8); },
    handle: function (cv) { cv.ring(8, 8, 6, RD, 2); cv.rect(7, 2, 3, 13, RD); cv.rect(2, 7, 13, 3, RD); cv.disc(8, 8, 1, K); },
    oilGear: function (cv) { gear(cv, 8, 8, 7, 0x10, 0x30, 8); },
    cloth: function (cv) { cv.panel(2, 2, 12, 12, WH); cv.hl(3, 5, 10, IB); cv.hl(3, 9, 10, IB); cv.line(2, 13, 6, 9, IB); },
    lensDirty: function (cv) { cv.disc(8, 8, 6, IB); cv.ring(8, 8, 6, K); cv.px(6, 6, WH); cv.px(10, 9, WH); cv.px(7, 10, WH); },
    lens: function (cv) { cv.disc(8, 8, 6, SK); cv.ring(8, 8, 6, K); cv.line(5, 7, 7, 5, WH); cv.px(5, 6, WH); },
    diskTop: function (cv) { cv.art(1, 3, ['....######....', '..##########..', '.############.', '##############', '##############', '##############'], { '#': Y }); cv.hl(1, 9, 14, K); cv.micro(6, 4, '★', RD); },
    diskBot: function (cv) { cv.art(1, 6, ['##############', '##############', '##############', '.############.', '..##########..', '....######....'], { '#': Y }); cv.hl(1, 6, 14, K); cv.px(5, 9, RD); cv.px(10, 8, RD); },
    disk: function (cv) { cv.disc(8, 8, 7, Y); cv.ring(8, 8, 7, K); cv.micro(6, 6, '★', RD); cv.px(4, 4, RD); cv.px(11, 11, RD); }
  };
  function icon(id) { var cv = new Canvas(16, 16, K); if (ICON[id]) ICON[id](cv); return cv; }

  /* ============================================================ 標題 / 故事畫面 */
  // 星空用的亂數（fix-r9 P3-5：舊寫法 sd * 1103515245 超出 2^53 精度 ⇒ 低位元變 0、x 全落在第 0 欄成一排白點；改 32 位元整數乘法、取高位元）
  function lcg(seed) { var sd = seed | 0; return function () { sd = (Math.imul(sd, 1103515245) + 12345) | 0; return (sd >>> 16) & 0x7FFF; }; }
  function title() {
    // 256×128：星空 + 天文台剪影 + 中央一扇帶鑰匙孔的門
    var cv = new Canvas(VW, VH, K), W = 0x02;
    var rn = lcg(7); for (var i = 0; i < 60; i++) { var x = 4 + rn() % 248, y = rn() % 72; cv.soft(x, y, i % 3 ? 0x30 : 0x28); }
    cv.disc(196, 22, 10, Y); cv.disc(200, 19, 9, K);
    cv.rect(0, 96, VW, 32, W); cv.disc(128, 96, 44, W); cv.rect(96, 60, 64, 40, W);
    cv.rect(152, 50, 6, 20, W); cv.line(150, 52, 176, 34, IB); cv.line(151, 53, 177, 35, IB);
    cv.panel(112, 70, 32, 40, 0x17); cv.box(115, 73, 26, 37, 0x27);
    cv.disc(128, 86, 3, K); cv.rect(127, 88, 3, 8, K);
    for (var x2 = 4; x2 < VW; x2 += 24) cv.px(x2, 120, Y);
    return cv;
  }
  function story(k) {
    var cv = new Canvas(VW, VH, K), W = 0x02;
    var rn = lcg(11); for (var i = 0; i < 50; i++) { var x = 4 + rn() % 248, y = rn() % 100; cv.soft(x, y, i % 4 ? 0x30 : 0x28); }
    cv.rect(0, 104, VW, 24, W);
    // 天文台
    cv.disc(60, 92, 26, W); cv.rect(34, 92, 52, 16, W); cv.rect(58, 66, 4, 30, K);
    cv.line(70, 74, 92, 56, IB); cv.line(71, 75, 93, 57, IB);
    // 朔叔：戴帽子的老觀測員剪影 + 提燈
    var ky = 86;                                     // fix-r9 P3-5：腳踩在地面（地面 y = 104）
    cv.art(150, ky, [
      '.....######.....',
      '....########....',
      '..############..',
      '.....######.....',
      '.....#.##.#.....',
      '.....######.....',
      '......####......',
      '....########....',
      '...##########...',
      '...##########...',
      '..###########...',
      '..###.######....',
      '..##..######....',
      '.....#######....',
      '.....###.###....',
      '.....###.###....',
      '.....###.###....',
      '.....##...##....'], { '#': IB });
    // 提燈：放在腳邊地上（提把 + 燈罩；同一個 16×16 屬性區只有 黑 / 黃 / 地面色）
    cv.hl(180, 95, 3, Y); cv.px(179, 96, Y); cv.px(183, 96, Y);
    cv.rect(178, 97, 7, 7, Y); cv.box(178, 97, 7, 7, K); cv.vl(181, 98, 5, K);
    if (k === 'end') { for (var j = 0; j < 6; j++) cv.art(20 + j * 38, 10 + (j * 17) % 30, ['..#..', '#####', '.###.', '.#.#.'], { '#': Y }); }
    return cv;
  }

  // 結算評價徽章（fix-r9 P3-4）：8×8 半形字形放大 4 倍 = 32×32，黃字 + 紅色右下陰影
  function rankBadge(ch) {
    var cv = new Canvas(32, 32, K), G = (CT.GLYPHS && CT.GLYPHS.ascii) || {}, h = G[ch] || '0000000000000000';
    [[2, 0x16], [0, Y]].forEach(function (L) {
      for (var y = 0; y < 8; y++) {
        var v = parseInt(h.substr(y * 2, 2), 16) | 0;
        for (var x = 0; x < 8; x++) if ((v >> (7 - x)) & 1) cv.rect(x * 4 - 1 + L[0], y * 4 - 1 + L[0], 4, 4, L[1]);
      }
    });
    return cv;
  }

  /* ============================================================ 精靈 bank（8×8） */
  var SPR = {
    S_BLANK: tile('........'),
    S_ARROW: ['11......', '121.....', '1221....', '12221...', '122221..', '12211...', '1.121...', '...11...'],
    S_LOOK: ['.1111...', '122221..', '123321..', '123321..', '122221..', '.11111..', '....111.', '.....11.'],
    S_HAND: ['..11....', '.1221...', '.12211..', '.122221.', '1222221.', '1222221.', '.12221..', '..111...'],
    S_TL: ['3333....', '3.......', '3.......', '3.......', '........', '........', '........', '........'],
    S_TR: ['....3333', '.......3', '.......3', '.......3', '........', '........', '........', '........'],
    S_BL: ['........', '........', '........', '........', '3.......', '3.......', '3.......', '3333....'],
    S_BR: ['........', '........', '........', '........', '.......3', '.......3', '.......3', '....3333'],
    S_LEFT: ['....1...', '...12...', '..1221..', '.122221.', '.122221.', '..1221..', '...12...', '....1...'],
    S_RIGHT: ['...1....', '...21...', '..1221..', '.122221.', '.122221.', '..1221..', '...21...', '...1....'],
    S_UP: ['........', '...1....', '..121...', '.12221..', '1222221.', '1111111.', '........', '........'],
    S_DOWN: ['........', '........', '1111111.', '1222221.', '.12221..', '..121...', '...1....', '........'],
    S_PAUSE: ['........', '.22.22..', '.22.22..', '.22.22..', '.22.22..', '.22.22..', '.22.22..', '........'],
    S_DOT: ['........', '..3333..', '.333333.', '.333333.', '.333333.', '.333333.', '..3333..', '........'],
    S_SPARK: ['........', '...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........']
  };
  function sprBank() {
    var obj = {};
    for (var k in SPR) obj[k] = SPR[k];
    return NES.CHR.bank('escape_spr', obj);
  }

  E.Art = {
    Canvas: Canvas, compose: compose, TileSet: TileSet, view: view, closeup: closeup, icon: icon, title: title, story: story, rankBadge: rankBadge,
    sprBank: sprBank, SPR: SPR, pipeGeom: pipeGeom, BUDGET: BUDGET, VW: VW, VH: VH, ICONS: Object.keys(ICON), K: K
  };
})();
