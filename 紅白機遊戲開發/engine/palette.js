/*!
 * engine/palette.js — NES 系統調色盤（64 色 NTSC RGB 近似表）
 * 專案：紅白機遊戲開發 / R1 核心引擎 ｜ agent: ppu ｜ 版本 1.0.0（2026-09-17）
 *
 * 來源（RGB 值）：
 *   docs/research/01_硬體規格與限制.md §3.4「NES 系統調色盤（常用 RGB 近似值）」
 *   原始出處：ROM Detectives Wiki 的 2C02 調色盤表（即 FCEUX / Nestopia 常見的預設 RGB 近似）。
 *   注意：2C02 輸出的是 NTSC 複合訊號，沒有唯一正解的 RGB；本表僅為工作用近似值。
 *
 * 規格要點（docs/research/01 §3.4、05 §1.1）：
 *   - 索引為 6 bit（$00–$3F），編碼 `VVHHHH`：低 4 bit 色相、高 2 bit 亮度。
 *   - $0F 為標準黑；$0D 是「blacker than black」，官方警告不要用 → FORBIDDEN。
 *   - $0E/$0F/$1D/$1E/$1F/$2E/$2F/$3E/$3F 實質同為黑（去重後約 54 色）。
 *
 * API（docs/TASKS.md「API 契約」）：
 *   NES.PALETTE            → 長度 64 的陣列，每項 [r, g, b]
 *   NES.PALETTE.FORBIDDEN  → [0x0D]
 *   NES.PALETTE.rgb(i)     → [r, g, b]（複本；i 超出 0..63 會 throw）
 *   NES.PALETTE.nearest(r, g, b) → 最接近的調色盤索引（自動跳過 FORBIDDEN）
 *   附加（非契約，便利用）：hex(i)、isForbidden(i)、assert(i)、SIZE、VERSION
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};

  // 依 $00..$3F 順序排列的 24-bit RGB。
  var HEX = [
    0x7C7C7C, 0x0000FC, 0x0000BC, 0x4428BC, 0x940084, 0xA80020, 0xA81000, 0x881400,
    0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0x000000, 0x000000,
    0xBCBCBC, 0x0078F8, 0x0058F8, 0x6844FC, 0xD800CC, 0xE40058, 0xF83800, 0xE45C10,
    0xAC7C00, 0x00B800, 0x00A800, 0x00A844, 0x008888, 0x000000, 0x000000, 0x000000,
    0xF8F8F8, 0x3CBCFC, 0x6888FC, 0x9878F8, 0xF878F8, 0xF85898, 0xF87858, 0xFCA044,
    0xF8B800, 0xB8F818, 0x58D854, 0x58F898, 0x00E8D8, 0x787878, 0x000000, 0x000000,
    0xFCFCFC, 0xA4E4FC, 0xB8B8F8, 0xD8B8F8, 0xF8B8F8, 0xF8A4C0, 0xF0D0B0, 0xFCE0A8,
    0xF8D878, 0xD8F878, 0xB8F8B8, 0xB8F8D8, 0x00FCFC, 0xF8D8F8, 0x000000, 0x000000
  ];

  var PALETTE = [];
  for (var i = 0; i < 64; i++) {
    var h = HEX[i];
    PALETTE.push([(h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF]);
  }

  PALETTE.VERSION = '1.0.0';
  PALETTE.SIZE = 64;
  PALETTE.SOURCE = 'ROM Detectives Wiki 2C02 palette (via docs/research/01 §3.4)';
  PALETTE.FORBIDDEN = [0x0D]; // $0D = blacker than black，禁用

  PALETTE.isForbidden = function (i) {
    return PALETTE.FORBIDDEN.indexOf(i | 0) >= 0;
  };

  // 驗證色號：非 0..63 整數或禁用色 → throw。ppu.js 設調色盤時會呼叫。
  PALETTE.assert = function (i, where) {
    if (typeof i !== 'number' || (i | 0) !== i || i < 0 || i > 63) {
      throw new Error('NES.PALETTE: 色號必須是 0..63 的整數，收到 ' + i +
        (where ? ' (' + where + ')' : ''));
    }
    if (PALETTE.isForbidden(i)) {
      throw new Error('NES.PALETTE: $' + ('0' + i.toString(16).toUpperCase()).slice(-2) +
        ' 是禁用色（blacker than black）' + (where ? ' (' + where + ')' : ''));
    }
    return i;
  };

  PALETTE.rgb = function (i) {
    if (typeof i !== 'number' || (i | 0) !== i || i < 0 || i > 63) {
      throw new Error('NES.PALETTE.rgb: 索引必須是 0..63 的整數，收到 ' + i);
    }
    var c = PALETTE[i];
    return [c[0], c[1], c[2]];
  };

  PALETTE.hex = function (i) {
    var c = PALETTE.rgb(i);
    return '#' + ('00000' + ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).toUpperCase()).slice(-6);
  };

  // 最接近色（歐氏距離平方，跳過禁用色）。相同距離取索引小者。
  PALETTE.nearest = function (r, g, b) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < 64; i++) {
      if (PALETTE.isForbidden(i)) continue;
      var c = PALETTE[i];
      var dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
      var d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
    }
    return best;
  };

  NES.PALETTE = PALETTE;
})(typeof window !== 'undefined' ? window : this);
