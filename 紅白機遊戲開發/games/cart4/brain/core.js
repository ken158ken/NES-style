/*
 * games/cart4/brain/core.js — 《星塵腦力》共用底層：名稱表影子 + 差異佇列、精靈配置、亂數、小工具
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/art.js、games/cart1/registry.js（CT.blank）
 * 載入順序：art → song → core → dual / multi / track / tilt → main（註冊）
 *
 * C = CT.Brain.C：所有模式共用的「硬體介面」
 *   C.nes / C.art / C.g（main 的狀態，模式用 C.g.sub 放自己那一關的狀態）
 *   C.put(c, r, tile) / C.putA(c16, r16, pal) / C.text(c, r, str) / C.fill(c, r, w, h, tile)
 *     → 只改影子 + 排入佇列；C.flush() 每幀寫到 FLUSH_LIMIT byte 為止（VBlank ≤ 160）
 *   C.redraw(fn)：整片重畫（CT.blank 內，等同 rendering 關閉），fn 內照樣用 put / putA
 *   C.spr(x, y, tile, pal, flipH, flipV)：本幀精靈（OAM 0..61；62 / 63 留給 shell 的回選單提示）
 *   C.rnd() / C.seed(n)：線性同餘亂數（可重現）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};

  var FLUSH_LIMIT = 140, OAM_MAX = 62;
  var C = BR.C = {
    nes: null, art: null, g: null,
    FLUSH_LIMIT: FLUSH_LIMIT, OAM_MAX: OAM_MAX,
    HZ: 60.0988,
    want: new Int16Array(32 * 30), have: new Int16Array(32 * 30),
    wantA: new Int8Array(16 * 15), haveA: new Int8Array(16 * 15),
    q: [], qa: [], peakQ: 0, sprN: 0, sprUsed: 0, _seed: 0x2468
  };

  C.seed = function (n) { C._seed = (n >>> 0) & 0x7fffffff; if (!C._seed) C._seed = 1; };
  C.rnd = function () { C._seed = (C._seed * 1103515245 + 12345) & 0x7fffffff; return C._seed >> 8; };
  C.rint = function (n) { return n <= 0 ? 0 : C.rnd() % n; };
  C.pad = function (n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; };
  C.padR = function (s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); };
  C.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  C.sec = function (f) { return Math.round(f * C.HZ); };              // 秒 → 幀
  C.ms = function (frames) { return Math.round(frames * 1000 / C.HZ); }; // 幀 → ms（顯示用）
  C.timeText = function (frames) {   // 幀 → "SS.S"（≤ 999.9）
    var t = Math.floor(frames * 10 / C.HZ);
    return C.pad(Math.floor(t / 10), 2) + '.' + (t % 10);
  };

  /* ---------------- 名稱表 / 屬性：影子 + 佇列 ---------------- */
  C.put = function (c, r, t) {
    if (c < 0 || c > 31 || r < 0 || r > 29) return;
    var k = r * 32 + c;
    if (C.want[k] === t) return;
    C.want[k] = t; C.q.push(k);
  };
  C.putA = function (c16, r16, p) {
    if (c16 < 0 || c16 > 15 || r16 < 0 || r16 > 14) return;
    var k = r16 * 16 + c16;
    if (C.wantA[k] === p) return;
    C.wantA[k] = p; C.qa.push(k);
  };
  C.fill = function (c, r, w, h, t) { for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) C.put(c + x, r + y, t); };
  C.fillA = function (c16, r16, w, h, p) { for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) C.putA(c16 + x, r16 + y, p); };
  C.text = function (col, row, s) { var t = C.art.text(String(s)); for (var i = 0; i < t.length; i++) C.put(col + i, row, t[i]); };
  C.center = function (row, s, w0, w1) {
    var a = w0 === undefined ? 0 : w0, b = w1 === undefined ? 32 : w1;
    C.text(a + ((b - a - s.length) >> 1), row, s);
  };
  C.t = function (n) { return C.art.t(n); };
  C.s = function (n) { return C.art.s(n); };
  // 16×16 背景圖（prefix_0..3）
  C.put4 = function (c, r, prefix) {
    C.put(c, r, C.t(prefix + '0')); C.put(c + 1, r, C.t(prefix + '1'));
    C.put(c, r + 1, C.t(prefix + '2')); C.put(c + 1, r + 1, C.t(prefix + '3'));
  };
  C.big = function (col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (ch === ' ') continue;
      C.put4(col + i * 2, row, 'BIG_' + ch);
    }
  };
  C.frame = function (c, r, w, h) {   // 面板框（含四角）
    var x, y;
    C.put(c, r, C.t('FR_TL')); C.put(c + w - 1, r, C.t('FR_TR'));
    C.put(c, r + h - 1, C.t('FR_BL')); C.put(c + w - 1, r + h - 1, C.t('FR_BR'));
    for (x = 1; x < w - 1; x++) { C.put(c + x, r, C.t('FR_T')); C.put(c + x, r + h - 1, C.t('FR_B')); }
    for (y = 1; y < h - 1; y++) { C.put(c, r + y, C.t('FR_L')); C.put(c + w - 1, r + y, C.t('FR_R')); }
  };
  C.bar = function (col, row, cells, frac8) {   // 橫條：cells 格、frac8 = 0..cells*8
    for (var i = 0; i < cells; i++) C.put(col + i, row, C.t('BAR' + C.clamp(frac8 - i * 8, 0, 8)));
  };
  C.flush = function () {
    var nes = C.nes, bud = nes.timing && nes.timing.budget, ppu = nes.ppu;
    if (C.q.length + C.qa.length > C.peakQ) C.peakQ = C.q.length + C.qa.length;
    while (C.qa.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var a = C.qa.shift();
      if (C.haveA[a] !== C.wantA[a]) { ppu.setAttr(0, a & 15, a >> 4, C.wantA[a]); C.haveA[a] = C.wantA[a]; }
    }
    while (C.q.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var k = C.q.shift();
      if (C.have[k] !== C.want[k]) { ppu.setTile(0, k & 31, k >> 5, C.want[k]); C.have[k] = C.want[k]; }
    }
  };
  // 整片重畫（rendering 關閉中）：pal = {bd, bg:[4], spr:[4]} 可省略；nt1Tile = 名稱表 1 的底磚（split 位移時露出的邊）
  C.redraw = function (fn, pal, nt1Tile) {
    var nes = C.nes, ppu = nes.ppu;
    CT.blank(nes, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      if (pal) {
        ppu.setBackdrop(pal.bd);
        for (var i = 0; i < 4; i++) { ppu.setBgPalette(i, pal.bg[i]); ppu.setSprPalette(i, pal.spr[i]); }
      }
      C.q = []; C.qa = [];
      for (var k = 0; k < 960; k++) C.want[k] = 0;
      for (k = 0; k < 240; k++) C.wantA[k] = 0;
      fn();
      for (k = 0; k < 960; k++) ppu.setTile(0, k & 31, k >> 5, C.want[k]);
      for (k = 0; k < 240; k++) ppu.setAttr(0, k & 15, k >> 4, C.wantA[k]);
      var t1 = nt1Tile || 0;
      ppu.fillTiles(1, 0, 0, 32, 30, t1);
      ppu.fillAttr(1, 0, 0, 16, 15, nt1Tile ? 2 : 0);
      C.have.set(C.want); C.haveA.set(C.wantA);
      C.q = []; C.qa = [];
      ppu.clearSprites(); C.sprUsed = 0; C.sprN = 0;
    });
  };
  C.setPal = function (pal) {   // 不重畫、只換調色盤（rendering 關閉中）
    var ppu = C.nes.ppu;
    CT.blank(C.nes, function () {
      ppu.setBackdrop(pal.bd);
      for (var i = 0; i < 4; i++) { ppu.setBgPalette(i, pal.bg[i]); ppu.setSprPalette(i, pal.spr[i]); }
    });
  };

  /* ---------------- 精靈 ---------------- */
  C.sprBegin = function () { C.sprN = 0; };
  C.spr = function (x, y, tile, pal, flipH, flipV) {
    if (C.sprN >= OAM_MAX) return false;
    if (y > 239 || y < -7 || x < -7 || x > 255) return false;
    C.nes.ppu.sprite(C.sprN++, { x: x | 0, y: y | 0, tile: tile, pal: pal | 0, flipH: !!flipH, flipV: !!flipV });
    return true;
  };
  C.spr16 = function (x, y, prefix, pal, flipH) {   // 16×16 = 4 個 8×8（每線 2）
    var a = C.s(prefix + '0'), b = C.s(prefix + '1'), c = C.s(prefix + '2'), d = C.s(prefix + '3');
    if (flipH) { C.spr(x, y, b, pal, true); C.spr(x + 8, y, a, pal, true); C.spr(x, y + 8, d, pal, true); C.spr(x + 8, y + 8, c, pal, true); }
    else { C.spr(x, y, a, pal); C.spr(x + 8, y, b, pal); C.spr(x, y + 8, c, pal); C.spr(x + 8, y + 8, d, pal); }
  };
  C.sprEnd = function () {
    var ppu = C.nes.ppu;
    for (var i = C.sprN; i < C.sprUsed; i++) ppu.sprite(i, null);
    C.sprUsed = C.sprN;
  };
})();
