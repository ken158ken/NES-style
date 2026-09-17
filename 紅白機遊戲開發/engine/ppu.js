/*!
 * engine/ppu.js — NES PPU（2C02）模型
 * 專案：紅白機遊戲開發 / R1 核心引擎 ｜ agent: ppu ｜ 版本 1.0.0（2026-09-17）
 * 相依：engine/palette.js（NES.PALETTE）。可選：engine/chr.js（NES.CHR）— 未載入時用內建假磁磚。
 *
 * 規格來源：docs/research/01_硬體規格與限制.md §3（3.1 畫面 / 3.3 名稱表・屬性表 /
 *           3.4 調色盤 / 3.5 精靈 / 3.6 捲動與分割），docs/research/05_美術與像素規範.md §1、§3、§5。
 *
 * 模型重點：
 *   - 內部畫面 256×240，顯示裁掉上下各 8 列 → 256×224，整數倍放大、無平滑。
 *   - 調色盤：1 底色 + 4 組背景 ×3 色 + 4 組精靈 ×3 色 = 同屏上限 25 色；各組色 0 = 底色 / 透明。
 *   - 名稱表：2 張實體（各 960 byte 磁磚 + 64 byte 屬性），邏輯 4 張經水平 / 垂直鏡像對映。
 *   - 屬性：每 byte 管 32×32 像素，內分 4 個 16×16 區塊，bit 排列 (右下<<6)|(左下<<4)|(右上<<2)|(左上<<0)。
 *   - OAM：64 個精靈、8×8 / 8×16、翻轉、背景優先權；每掃描線最多 8 個，第 9 個起不畫。
 *   - 閃爍：flicker='rotate' 時每幀把 OAM 掃描起點前進 flickerStep（預設 8，NESdev 的 OAM cycling），
 *           被丟掉的精靈會輪流出現 → 視覺上閃爍而非整個消失。
 *           **指標由 endFrame() 推進，不是 render()**：render() 是純函式（同狀態重畫同結果），
 *           所以 __nes.render() / tools/shot.py 的截圖可重現（QA P1-2）。
 *           一幀的正確順序是 render() → endFrame()，NES.boot 的 Timing draw 階段已經接好。
 *   - 分割捲動：split(scanline, {x, y, nt}) 模擬 sprite 0 hit / MMC3 IRQ，下半段用另一組捲動值。
 *   - VBlank 寫入預算：nes.js boot 時把 ppu.budget 綁到 timing.budget，之後每個寫入函式
 *           （setTile/setAttr/fillTiles/fillAttr/setBgPalette/setSprPalette）都會以實際 byte 數
 *           呼叫 budget.use(n)；sprite()/clearSprites() 走 OAM DMA 通道 budget.use(n,'oam')。
 *           沒綁 budget 時全部是 no-op（單元測試直接 create 的 ppu 不受影響）。見 QA P1-6。
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};
  if (!NES.PALETTE) throw new Error('NES.PPU 需要先載入 engine/palette.js');
  var PAL = NES.PALETTE;

  var W = 256, H = 240, VISIBLE_H = 224, OVERSCAN = 8; // 上下各裁 8 列
  var NT_COLS = 32, NT_ROWS = 30, NT_TILES = 960, NT_ATTR = 64;

  // ---- 位元組打包（依執行環境的位元組序組出 RGBA） ----
  var LITTLE_ENDIAN = (function () {
    var b = new ArrayBuffer(4);
    new Uint32Array(b)[0] = 0x11223344;
    return new Uint8Array(b)[0] === 0x44;
  })();
  function pack(r, g, b) {
    return LITTLE_ENDIAN
      ? (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0)
      : (((r << 24) | (g << 16) | (b << 8) | 255) >>> 0);
  }
  // 64 色的預打包表
  var RGB32 = new Uint32Array(64);
  for (var pi = 0; pi < 64; pi++) RGB32[pi] = pack(PAL[pi][0], PAL[pi][1], PAL[pi][2]);

  // ---- 內建假磁磚（NES.CHR 未載入時供測試用） ----
  // idx 0 = 全透明；其餘 = 外框 1、四象限 2/3/3/2（左右、上下皆不對稱 → 可驗翻轉）。
  var fakeCache = [];
  function fakeTile(table, idx) {
    var key = (table & 1) * 256 + (idx & 255);
    var t = fakeCache[key];
    if (t) return t;
    t = new Uint8Array(64);
    if (idx !== 0) {
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var v;
          if (x === 0 || y === 0 || x === 7 || y === 7) v = 1;
          else if (y < 4) v = (x < 4) ? 2 : 3;
          else v = (x < 4) ? 3 : 2;
          if (((idx + table) & 1) && v > 1) v = (v === 2) ? 3 : 2;
          t[y * 8 + x] = v;
        }
      }
    }
    fakeCache[key] = t;
    return t;
  }

  // ---- VBlank 預算計帳（budget 未綁定 / mute 時完全 no-op）----
  function useBudget(ppu, n) {
    var b = ppu.budget;
    if (!b || b.mute || typeof b.use !== 'function') return;
    b.use(n | 0, 'ppu');
  }
  // OAM：真機一幀只做一次 $4014 DMA（256 byte），同一槽重複寫不會變貴 ⇒ 只算「本幀第一次寫」
  function useOam(ppu, i) {
    var b = ppu.budget;
    if (!b || b.mute || typeof b.use !== 'function') return;
    var ser = b.serial | 0;
    if (ppu._oamSerial !== ser) { ppu._oamSerial = ser; ppu._oamTouch.fill(0); }
    if (ppu._oamTouch[i]) return;
    ppu._oamTouch[i] = 1;
    b.use(4, 'oam');
  }

  function iv(n, lo, hi, name) {
    if (typeof n !== 'number' || (n | 0) !== n || n < lo || n > hi) {
      throw new Error('NES.PPU: ' + name + ' 必須是 ' + lo + '..' + hi + ' 的整數，收到 ' + n);
    }
    return n | 0;
  }

  function PPU(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas || null;
    this.scale = 1;

    // 調色盤：backdrop + 4 組背景 ×3 + 4 組精靈 ×3
    this.backdrop = 0x0F;
    this._bg = new Uint8Array(12);
    this._spr = new Uint8Array(12);

    // 名稱表：2 張實體
    this._nt = [new Uint8Array(NT_TILES), new Uint8Array(NT_TILES)];
    this._at = [new Uint8Array(NT_ATTR), new Uint8Array(NT_ATTR)];
    this._mirror = 'h';

    // 捲動
    this._sx = 0; this._sy = 0; this._base = 0;
    this._split = null;

    // 圖樣表：背景用 0、精靈用 1（8×16 時由磁磚 bit0 決定）
    this._bgTable = 0; this._sprTable = 1;

    // OAM
    this._oamX = new Int16Array(64);
    this._oamY = new Int16Array(64);
    this._oamT = new Uint8Array(64);
    this._oamP = new Uint8Array(64);
    this._oamF = new Uint8Array(64); // bit0 flipH, bit1 flipV, bit2 behind
    this._oamOn = new Uint8Array(64);
    this._sprH = 8;
    this._oamStart = 0;
    // VBlank 寫入預算（nes.js boot 時指到 timing.budget；null = 不計帳）
    this.budget = opts.budget || null;
    this._oamTouch = new Uint8Array(64);   // 本幀已寫過的 OAM 槽（OAM DMA 一幀最多 256 byte）
    this._oamSerial = -1;                  // 對應 budget.serial，換幀自動清空
    this.flicker = (opts.flicker === 'none') ? 'none' : 'rotate';
    this.flickerStep = (opts.flickerStep | 0) || 8; // NESdev：每幀 ±8（4 的倍數、非 8 的倍數亦可）

    // 輸出緩衝
    this.frame = new Uint8ClampedArray(W * H * 4);
    this._f32 = new Uint32Array(this.frame.buffer);
    this.indexFrame = new Uint8Array(W * H); // 每像素最終的 NES 調色盤索引（供 lint / 測試）

    // 掃描線暫存
    this._bgV = new Uint8Array(W);
    this._bgK = new Uint8Array(W);
    this._spV = new Uint8Array(W);
    this._spK = new Uint8Array(W);
    this._spB = new Uint8Array(W);
    this._seen = new Uint8Array(64);
    this._tileCache = new Array(512);

    var emptyLines = [];
    this.stats = {
      colors: 0, maxSpritesLine: 0, flickered: 0,
      dropped: 0, overLines: emptyLines, overLine: emptyLines, sprites: 0, ms: 0, frames: 0
    };

    this._initCanvas(opts.scale === undefined ? 3 : opts.scale);
  }

  // ---------- canvas / 縮放 ----------
  PPU.prototype._initCanvas = function (scale) {
    this.setScale(scale);
    if (!this.canvas) return;
    var doc = this.canvas.ownerDocument || global.document;
    this._off = doc.createElement('canvas');
    this._off.width = W; this._off.height = H;
    this._offCtx = this._off.getContext('2d');
    this._img = this._offCtx.createImageData(W, H);
    this._ctx = this.canvas.getContext('2d');
    this._applyCanvasSize();
  };
  PPU.prototype._applyCanvasSize = function () {
    if (!this.canvas) return;
    this.canvas.width = W * this.scale;
    this.canvas.height = VISIBLE_H * this.scale;
    this._ctx.imageSmoothingEnabled = false;
    this._ctx.msImageSmoothingEnabled = false;
    this._ctx.webkitImageSmoothingEnabled = false;
    this._ctx.mozImageSmoothingEnabled = false;
  };
  PPU.prototype.setScale = function (scale) {
    this.scale = iv(scale, 1, 16, 'scale');
    if (this._ctx) this._applyCanvasSize();
    return this;
  };

  // ---------- 調色盤 ----------
  PPU.prototype.setBackdrop = function (c) {
    PAL.assert(c, 'setBackdrop');
    this.backdrop = c | 0;
    useBudget(this, 1);                                     // $3F00
    return this;
  };
  function setPal(arr, i, cols, who) {
    iv(i, 0, 3, who + ' 組別');
    if (!cols || cols.length !== 3) throw new Error('NES.PPU.' + who + ': 需要 3 個色號（色 0 是共用底色 / 透明）');
    for (var k = 0; k < 3; k++) { PAL.assert(cols[k], who); arr[i * 3 + k] = cols[k] | 0; }
  }
  PPU.prototype.setBgPalette = function (i, cols) {
    setPal(this._bg, i, cols, 'setBgPalette'); useBudget(this, 3); return this;   // $3F01-03 三色
  };
  PPU.prototype.setSprPalette = function (i, cols) {
    setPal(this._spr, i, cols, 'setSprPalette'); useBudget(this, 3); return this;
  };
  PPU.prototype.getBgPalette = function (i) {
    iv(i, 0, 3, 'getBgPalette');
    return [this.backdrop, this._bg[i * 3], this._bg[i * 3 + 1], this._bg[i * 3 + 2]];
  };
  PPU.prototype.getSprPalette = function (i) {
    iv(i, 0, 3, 'getSprPalette');
    return [this.backdrop, this._spr[i * 3], this._spr[i * 3 + 1], this._spr[i * 3 + 2]];
  };

  // ---------- 名稱表 / 屬性表 / 鏡像 ----------
  // 邏輯名稱表 0=$2000 1=$2400 2=$2800 3=$2C00 → 實體 0/1
  PPU.prototype._phys = function (nt) {
    iv(nt, 0, 3, 'nt');
    return this._mirror === 'h' ? (nt >> 1) : (nt & 1);
  };
  PPU.prototype.mirroring = function (m) {
    if (m === undefined) return this._mirror;
    if (m !== 'h' && m !== 'v') throw new Error("NES.PPU.mirroring: 只支援 'h'（水平鏡像 / 上下兩張不同）與 'v'（垂直鏡像 / 左右兩張不同）");
    this._mirror = m;
    return this;
  };
  PPU.prototype.setTile = function (nt, col, row, tile) {
    var p = this._phys(nt);
    iv(col, 0, NT_COLS - 1, 'col'); iv(row, 0, NT_ROWS - 1, 'row'); iv(tile, 0, 255, 'tile');
    this._nt[p][row * NT_COLS + col] = tile;
    useBudget(this, 1);                                     // 名稱表 1 byte
    return this;
  };
  PPU.prototype.getTile = function (nt, col, row) {
    var p = this._phys(nt);
    iv(col, 0, NT_COLS - 1, 'col'); iv(row, 0, NT_ROWS - 1, 'row');
    return this._nt[p][row * NT_COLS + col];
  };
  PPU.prototype.fillTiles = function (nt, col, row, w, h, tile) {
    var p = this._phys(nt);
    iv(col, 0, NT_COLS - 1, 'col'); iv(row, 0, NT_ROWS - 1, 'row');
    iv(w, 0, NT_COLS, 'w'); iv(h, 0, NT_ROWS, 'h'); iv(tile, 0, 255, 'tile');
    var nt0 = this._nt[p], n = 0;
    for (var y = row; y < row + h && y < NT_ROWS; y++) {
      var o = y * NT_COLS;
      for (var x = col; x < col + w && x < NT_COLS; x++) { nt0[o + x] = tile; n++; }
    }
    useBudget(this, n);                                     // 實際寫進去幾格就算幾 byte
    return this;
  };
  // 屬性：col16 0..15、row16 0..14（16×16 像素區塊）
  function attrPos(col16, row16) {
    iv(col16, 0, 15, 'col16'); iv(row16, 0, 14, 'row16');
    return { idx: (row16 >> 1) * 8 + (col16 >> 1), shift: ((row16 & 1) << 2) | ((col16 & 1) << 1) };
  }
  PPU.prototype._setAttr = function (nt, col16, row16, palIdx) {
    var p = this._phys(nt), a = attrPos(col16, row16);
    iv(palIdx, 0, 3, 'pal');
    var at = this._at[p];
    at[a.idx] = (at[a.idx] & ~(3 << a.shift)) | (palIdx << a.shift);
  };
  PPU.prototype.setAttr = function (nt, col16, row16, palIdx) {
    this._setAttr(nt, col16, row16, palIdx);
    useBudget(this, 1);                                     // 屬性表 1 byte（唯讀-改-寫）
    return this;
  };
  PPU.prototype.getAttr = function (nt, col16, row16) {
    var p = this._phys(nt), a = attrPos(col16, row16);
    return (this._at[p][a.idx] >> a.shift) & 3;
  };
  PPU.prototype.fillAttr = function (nt, col16, row16, w, h, palIdx) {
    var n = 0;
    for (var y = row16; y < row16 + h; y++) {
      for (var x = col16; x < col16 + w; x++) { this._setAttr(nt, x, y, palIdx); n++; }
    }
    useBudget(this, n);
    return this;
  };

  // ---------- 捲動與分割 ----------
  // scroll(x, y[, nt])：nt 為基底名稱表（0..3），省略則沿用。
  PPU.prototype.scroll = function (x, y, nt) {
    this._sx = x | 0; this._sy = y | 0;
    if (nt !== undefined) this._base = iv(nt, 0, 3, 'nt');
    return this;
  };
  PPU.prototype.getScroll = function () { return { x: this._sx, y: this._sy, nt: this._base }; };
  // split(scanline, {x, y, nt})：scanline 起（含）的掃描線改用這組捲動；null 取消。
  // 語意：下半段第一條掃描線顯示 world y = split.y（模擬 sprite 0 hit 後重寫 $2005/$2006）。
  PPU.prototype.split = function (scanline, s) {
    if (scanline === null || s === null || s === undefined) { this._split = null; return this; }
    iv(scanline, 0, H - 1, 'split scanline');
    this._split = {
      line: scanline | 0,
      x: (s.x | 0) || 0,
      y: (s.y | 0) || 0,
      nt: s.nt === undefined ? this._base : iv(s.nt, 0, 3, 'split nt')
    };
    return this;
  };

  // ---------- 圖樣表 ----------
  PPU.prototype.setPatternTables = function (bgTable, sprTable) {
    if (bgTable !== undefined && bgTable !== null) this._bgTable = iv(bgTable, 0, 1, 'bgTable');
    if (sprTable !== undefined && sprTable !== null) this._sprTable = iv(sprTable, 0, 1, 'sprTable');
    return this;
  };
  PPU.prototype._chr = function (table, idx) {
    var key = table * 256 + idx;
    var t = this._tileCache[key];
    if (t !== undefined) return t;
    if (NES.CHR && typeof NES.CHR.get === 'function') t = NES.CHR.get(table, idx);
    else t = fakeTile(table, idx);
    if (!t || t.length !== 64) throw new Error('NES.PPU: CHR.get(' + table + ',' + idx + ') 必須回傳長度 64 的磁磚');
    this._tileCache[key] = t;
    return t;
  };

  // ---------- OAM ----------
  PPU.prototype.sprite = function (i, s) {
    iv(i, 0, 63, 'sprite index');
    useOam(this, i);                                        // OAM DMA：每槽 4 byte / 幀
    if (s === null) { this._oamOn[i] = 0; return this; }
    s = s || {};
    this._oamX[i] = s.x | 0;
    this._oamY[i] = s.y | 0;
    this._oamT[i] = iv(s.tile === undefined ? 0 : s.tile, 0, 255, 'sprite tile');
    this._oamP[i] = iv(s.pal === undefined ? 0 : s.pal, 0, 3, 'sprite pal');
    this._oamF[i] = (s.flipH ? 1 : 0) | (s.flipV ? 2 : 0) | (s.behind ? 4 : 0);
    this._oamOn[i] = 1;
    return this;
  };
  PPU.prototype.getSprite = function (i) {
    iv(i, 0, 63, 'sprite index');
    var f = this._oamF[i];
    return {
      x: this._oamX[i], y: this._oamY[i], tile: this._oamT[i], pal: this._oamP[i],
      flipH: !!(f & 1), flipV: !!(f & 2), behind: !!(f & 4), on: !!this._oamOn[i]
    };
  };
  PPU.prototype.clearSprites = function () {
    for (var ci = 0; ci < 64; ci++) useOam(this, ci);        // 整頁影子 OAM 清掉 = 同一次 DMA
    this._oamOn.fill(0);
    this._oamX.fill(0); this._oamY.fill(0); this._oamT.fill(0); this._oamP.fill(0); this._oamF.fill(0);
    return this;
  };
  PPU.prototype.spriteMode = function (h) {
    if (h === undefined) return this._sprH;
    if (h !== 8 && h !== 16) throw new Error('NES.PPU.spriteMode: 只能是 8 或 16');
    this._sprH = h;
    return this;
  };
  PPU.prototype.oamStart = function () { return this._oamStart; };

  // 公開的 OAM 唯讀檢視（供 NES.Lint.oam(ppu) 等外部模組）：
  //   ppu.oam → 長度 64 的陣列 [{x, y, tile, pal, flipH, flipV, behind, on, i}]
  // 每次讀取都重新產生物件，改動回傳值不會影響 PPU 內部狀態。
  Object.defineProperty(PPU.prototype, 'oam', {
    enumerable: true,
    get: function () {
      var out = new Array(64);
      for (var i = 0; i < 64; i++) {
        var f = this._oamF[i];
        out[i] = {
          i: i,
          x: this._oamX[i], y: this._oamY[i], tile: this._oamT[i], pal: this._oamP[i],
          flipH: !!(f & 1), flipV: !!(f & 2), behind: !!(f & 4), on: !!this._oamOn[i]
        };
      }
      return out;
    }
  });

  // OAM 的硬體位元組鏡像（256 byte、每精靈 4 byte，Y / 磁磚 / 屬性 / X）。
  // 屬性 byte 依 2C02：bit0-1 調色盤、bit5 背景優先、bit6 水平翻轉、bit7 垂直翻轉。
  // 關閉（on=false）的精靈其 Y 寫成 $EF（真機用 $EF–$FF 把精靈移出畫面）。
  PPU.prototype.oamBytes = function () {
    var b = new Uint8Array(256);
    for (var i = 0; i < 64; i++) {
      var f = this._oamF[i], o = i * 4;
      b[o] = this._oamOn[i] ? (this._oamY[i] & 0xFF) : 0xEF;
      b[o + 1] = this._oamT[i];
      b[o + 2] = (this._oamP[i] & 3) | ((f & 4) ? 0x20 : 0) | ((f & 1) ? 0x40 : 0) | ((f & 2) ? 0x80 : 0);
      b[o + 3] = this._oamX[i] & 0xFF;
    }
    return b;
  };

  // ---------- 渲染 ----------
  // render() 是**純函式**：同一份 PPU 狀態重畫幾次都得到同一張圖（除了 stats.frames / ms）。
  // 閃爍輪替指標在 endFrame() 推進 ⇒ __nes.render() 只重畫、不換精靈（QA P1-2）。
  PPU.prototype.render = function () {
    var t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();

    this._tileCache.length = 0; this._tileCache.length = 512;

    // 預算色表：key = 組×4 + 值（值 0 → 底色）
    var bd = this.backdrop;
    var bgPack = new Uint32Array(16), bgNes = new Uint8Array(16);
    var spPack = new Uint32Array(16), spNes = new Uint8Array(16);
    for (var g = 0; g < 4; g++) {
      bgNes[g * 4] = bd; bgPack[g * 4] = RGB32[bd];
      spNes[g * 4] = bd; spPack[g * 4] = RGB32[bd];
      for (var v = 1; v <= 3; v++) {
        var cb = this._bg[g * 3 + v - 1], cs = this._spr[g * 3 + v - 1];
        bgNes[g * 4 + v] = cb; bgPack[g * 4 + v] = RGB32[cb];
        spNes[g * 4 + v] = cs; spPack[g * 4 + v] = RGB32[cs];
      }
    }

    var seen = this._seen; seen.fill(0);
    var f32 = this._f32, idxF = this.indexFrame;
    var bgV = this._bgV, bgK = this._bgK, spV = this._spV, spK = this._spK, spB = this._spB;

    var maxLine = 0, dropped = 0, overLines = [], sprCount = 0;
    for (var i = 0; i < 64; i++) if (this._oamOn[i]) sprCount++;

    var sp = this._split;
    for (var sl = 0; sl < H; sl++) {
      var sx, sy, base, lineOff;
      if (sp && sl >= sp.line) { sx = sp.x; sy = sp.y; base = sp.nt; lineOff = sl - sp.line; }
      else { sx = this._sx; sy = this._sy; base = this._base; lineOff = sl; }

      this._bgLine(sl, sx, sy + lineOff, base, bgV, bgK);
      var n = this._sprLine(sl, spV, spK, spB);
      if (n > maxLine) maxLine = n;
      if (n > 8) { dropped += n - 8; overLines.push(sl); }

      // 合成
      var o = sl * W;
      for (var x = 0; x < W; x++) {
        var k, pk, ci;
        var sv = spV[x];
        if (sv !== 0 && (spB[x] === 0 || bgV[x] === 0)) { k = spK[x]; pk = spPack[k]; ci = spNes[k]; }
        else { k = bgK[x]; pk = bgPack[k]; ci = bgNes[k]; }
        f32[o + x] = pk;
        idxF[o + x] = ci;
        seen[ci] = 1;
      }
    }

    var colors = 0;
    for (var c = 0; c < 64; c++) if (seen[c]) colors++;

    var st = this.stats;
    st.colors = colors;
    st.maxSpritesLine = maxLine;
    st.dropped = dropped;
    st.overLines = overLines;
    st.overLine = overLines; // 契約 / nes_lint.js 讀單數名稱；與 overLines 是同一個陣列參照
    st.flickered = overLines.length; // 有精靈被丟掉（＝會閃爍）的掃描線數
    st.sprites = sprCount;
    st.frames = (st.frames | 0) + 1;

    this._blit();
    st.ms = ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - t0;
    return this;
  };

  // 一幀結束：推進 OAM 閃爍輪替指標。**必須在 render() 之後、下一幀 update 之前呼叫一次**，
  // NES.boot 的 Timing draw 階段已經接好（draw → ppu.render() → ppu.endFrame()）。
  // 預設 flickerStep = 8：同一條掃描線上連號的 16 個精靈，兩幀聯集剛好畫齊
  // （第 1 幀畫 OAM 0..7、第 2 幀畫 8..15）。遊戲若自己做 sprite cycling，設 flickerStep = 0。
  PPU.prototype.endFrame = function () {
    if (this.flicker === 'rotate') this._oamStart = (this._oamStart + this.flickerStep) & 63;
    return this;
  };
  PPU.prototype.advanceFlicker = PPU.prototype.endFrame;   // 別名（X2 建議的名字）

  // 背景掃描線：wy 為 world y（可超出 0..479，內部取模）
  PPU.prototype._bgLine = function (sl, sx, wy, base, bgV, bgK) {
    var y = wy % 480; if (y < 0) y += 480;
    var ntRow = (base >> 1) & 1;
    if (y >= 240) { y -= 240; ntRow ^= 1; }
    var row = y >> 3, fineY = y & 7;

    var x = sx % 512; if (x < 0) x += 512;
    var ntCol0 = base & 1;
    if (x >= 256) { x -= 256; ntCol0 ^= 1; }
    var coarse0 = x >> 3, fineX = x & 7;

    var attrRow = row >> 1;
    for (var t = 0; t < 33; t++) {
      var c = coarse0 + t, ntc = ntCol0;
      if (c >= 32) { c -= 32; ntc ^= 1; }
      var ntLogical = (ntRow << 1) | ntc;
      var p = this._mirror === 'h' ? (ntLogical >> 1) : (ntLogical & 1);
      var tileIdx = this._nt[p][row * NT_COLS + c];
      var aByte = this._at[p][(attrRow >> 1) * 8 + (c >> 2)];
      var shift = (((attrRow & 1) << 2) | (((c >> 1) & 1) << 1));
      var grp = (aByte >> shift) & 3;
      var td = this._chr(this._bgTable, tileIdx);
      var to = fineY * 8;
      var sxp = t * 8 - fineX;
      var p0 = 0, p1 = 8;
      if (sxp < 0) p0 = -sxp;
      if (sxp + 8 > W) p1 = W - sxp;
      var g4 = grp * 4;
      for (var px = p0; px < p1; px++) {
        var vv = td[to + px];
        var dx = sxp + px;
        bgV[dx] = vv;
        bgK[dx] = vv ? (g4 + vv) : 0;
      }
    }
  };

  // 精靈掃描線：回傳「本線上實際落在範圍內的精靈數」（含被丟掉的），只畫前 8 個
  PPU.prototype._sprLine = function (sl, spV, spK, spB) {
    spV.fill(0);
    var h = this._sprH, count = 0, considered = 0;
    var start = this._oamStart;
    for (var k = 0; k < 64; k++) {
      var i = (start + k) & 63;
      if (!this._oamOn[i]) continue;
      var dy = sl - this._oamY[i];
      if (dy < 0 || dy >= h) continue;
      considered++;
      if (count >= 8) continue; // 每掃描線 8 個上限 → 第 9 個起不畫
      count++;

      var f = this._oamF[i];
      var row = (f & 2) ? (h - 1 - dy) : dy;
      var tile = this._oamT[i], table, tidx;
      if (h === 16) { table = tile & 1; tidx = (tile & 0xFE) + (row >= 8 ? 1 : 0); row &= 7; }
      else { table = this._sprTable; tidx = tile; }
      var td = this._chr(table, tidx);
      var to = row * 8;
      var xs = this._oamX[i];
      var g4 = this._oamP[i] * 4;
      var behind = (f & 4) ? 1 : 0;
      var fh = (f & 1);
      var p0 = 0, p1 = 8;
      if (xs < 0) p0 = -xs;
      if (xs + 8 > W) p1 = W - xs;
      for (var px = p0; px < p1; px++) {
        var dx = xs + px;
        if (spV[dx]) continue; // OAM 索引小者（掃描順序在前）優先
        var vv = td[to + (fh ? 7 - px : px)];
        if (!vv) continue;     // 色 0 = 透明
        spV[dx] = vv; spK[dx] = g4 + vv; spB[dx] = behind;
      }
    }
    return considered;
  };

  // 放大輸出：256×240 → 裁上下各 8 列 → 256×224 × scale，無平滑
  PPU.prototype._blit = function () {
    if (!this.canvas) return;
    this._img.data.set(this.frame);
    this._offCtx.putImageData(this._img, 0, 0);
    var s = this.scale;
    this._ctx.imageSmoothingEnabled = false;
    this._ctx.clearRect(0, 0, W * s, VISIBLE_H * s);
    this._ctx.drawImage(this._off, 0, OVERSCAN, W, VISIBLE_H, 0, 0, W * s, VISIBLE_H * s);
  };

  // ---------- 取樣 / 除錯 ----------
  // 內部畫面座標（0..255, 0..239）的最終 NES 調色盤索引
  PPU.prototype.colorAt = function (x, y) {
    iv(x, 0, W - 1, 'x'); iv(y, 0, H - 1, 'y');
    return this.indexFrame[y * W + x];
  };
  PPU.prototype.rgbAt = function (x, y) { return PAL.rgb(this.colorAt(x, y)); };
  // 可見區（裁掉上下 8 列後）座標 → 內部座標
  PPU.prototype.colorAtVisible = function (x, y) { return this.colorAt(x, y + OVERSCAN); };
  PPU.prototype.usedColors = function () {
    var out = [];
    for (var i = 0; i < 64; i++) if (this._seen[i]) out.push(i);
    return out;
  };

  NES.PPU = {
    VERSION: '1.0.0',
    WIDTH: W, HEIGHT: H, VISIBLE_HEIGHT: VISIBLE_H, OVERSCAN: OVERSCAN,
    MAX_SPRITES: 64, MAX_SPRITES_PER_LINE: 8, MAX_COLORS: 25,
    create: function (canvas, opts) { return new PPU(canvas, opts); },
    _Class: PPU
  };
})(typeof window !== 'undefined' ? window : this);
