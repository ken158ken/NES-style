// engine/nes_lint.js — NES.Lint：執行期「原汁原味」檢查
// ---------------------------------------------------------------------------
// 規格來源：docs/research/01_硬體規格與限制.md §3.1~§3.5、docs/research/05_美術與像素規範.md §1 / §3.3
//   - 系統調色盤只有 64 格；$0D 是禁用色（比黑更黑，可能讓電視出問題）
//   - 同屏最多 4 組背景 + 4 組精靈調色盤（各 3 色）+ 1 個共用底色 → **25 色**
//   - 每掃描線最多 8 個精靈（真機是直接不畫；我們用 OAM 輪替換成閃爍）
// 契約：docs/TASKS.md「API 契約」之 NES.Lint。
// 形式：classic script、IIFE、零相依（NES.PALETTE 有載入就一起驗，沒載入就只算色數）。
//
// 對 ppu 的鴨子型別（有什麼用什麼，ppu.js 還沒好也能跑）：
//   ppu.indexFrame  Uint8Array(256×240)，每像素最終的 NES 色號 0..63 —— **優先用這個**
//                   （能精準抓出禁用色 $0D 與越界色號，也不必比對 RGB）
//   ppu.frame       Uint8ClampedArray(256×240×4) RGBA —— 沒有 indexFrame 時用它比對 64 色表
//   ppu.stats       { overLine | overLines, ... }
//   ppu.oam         精靈物件陣列（{x,y,tile,pal,on}）或 Uint8Array(256) 的真機 OAM；沒有 → skipped
//   ppu.spriteMode()/ppu.sprHeight  精靈高度 8 / 16
//
// 用法：
//   NES.Lint.frame(ppu)  → { ok, colors, badPixels, overLine, ... }
//   NES.Lint.oam(ppu)    → { ok, maxLine, overLine, ... }（ppu 沒有 OAM 時回 { ok:true, skipped:true }）
//   NES.Lint.check(ppu)  → { ok, frame, oam }
//   NES.Lint.strict = true   → 不合格直接 throw
//   NES.Lint.magenta = true  → 把違規像素直接改畫成洋紅（寫回 ppu.frame）
(function () {
  'use strict';
  var NES = (window.NES = window.NES || {});

  var WIDTH = 256, HEIGHT = 240;
  var MAGENTA = [255, 0, 255]; // 故意用「不在 64 色表內」的洋紅，肉眼與 lint 都抓得到

  function fail(msg) { throw new Error('NES.Lint: ' + msg); }

  // ---- 64 色表（由 palette.js 提供；沒載入就只算色數）-----------------------
  var palCache = null, palStamp = null;

  function parseEntry(p) {
    if (p === null || p === undefined) return null;
    if (typeof p === 'number') return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
    if (typeof p === 'string') {
      var s = p.replace('#', '').trim();
      if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
      if (s.length < 6) return null;
      return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)];
    }
    if (typeof p.length === 'number' && p.length >= 3) return [p[0] | 0, p[1] | 0, p[2] | 0];
    if (typeof p.r === 'number') return [p.r | 0, p.g | 0, p.b | 0];
    return null;
  }

  // 回傳 { set: {packedRGB: 色號}, rgb: [packedRGB ×64] }
  function palData() {
    var P = NES.PALETTE;
    if (!P) { palCache = null; palStamp = null; return null; }
    if (palCache && palStamp === P) return palCache;
    var set = {}, rgb = new Array(64), i, e, c, n = 0;
    for (i = 0; i < 64; i++) {
      e = parseEntry(P[i]);
      if (!e && typeof P.rgb === 'function') { try { e = parseEntry(P.rgb(i)); } catch (err) { e = null; } }
      if (!e) { rgb[i] = null; continue; }
      c = (e[0] << 16) | (e[1] << 8) | e[2];
      rgb[i] = c; set[c] = i; n++;
    }
    if (!n) { palCache = null; palStamp = null; return null; }
    palCache = { set: set, rgb: rgb };
    palStamp = P;
    return palCache;
  }

  function forbiddenMap() {
    var f = (NES.PALETTE && NES.PALETTE.FORBIDDEN) || [0x0D], m = {}, i;
    for (i = 0; i < f.length; i++) m[f[i] | 0] = 1;
    return m;
  }

  function hex(c) {
    var s = (c >>> 0).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s.toUpperCase();
  }

  function idxName(i) {
    var s = (i | 0).toString(16).toUpperCase();
    return '$' + (s.length < 2 ? '0' + s : s);
  }

  function overLineOf(ppu) {
    var st = ppu.stats;
    if (!st) return null;
    return st.overLine || st.overLines || null; // ppu.js 用複數，契約用單數 → 兩個都吃
  }

  // ---- frame ---------------------------------------------------------------
  // opts: { y0, y1, useIndex:false }（預設整張 0..240；可視區是 8..232，見研究 01 §3.1）
  function frame(ppu, opts) {
    if (!ppu) fail('frame(ppu)：缺少 ppu');
    opts = opts || {};
    var idxF = (opts.useIndex === false) ? null : ppu.indexFrame;
    var buf = ppu.frame;
    if (!idxF && !buf) fail('frame(ppu)：ppu.frame 不存在');
    var w = ppu.width || WIDTH, h = ppu.height || HEIGHT;
    if (idxF && idxF.length < w * h) fail('frame(ppu)：ppu.indexFrame 長度 ' + idxF.length + ' 不足 ' + (w * h));
    if (!idxF && buf.length < w * h * 4) {
      fail('frame(ppu)：ppu.frame 長度 ' + buf.length + ' 不足 ' + (w * h * 4));
    }
    var y0 = opts.y0 === undefined ? 0 : Math.max(0, opts.y0 | 0);
    var y1 = opts.y1 === undefined ? h : Math.min(h, opts.y1 | 0);

    var pd = palData();
    var mag = Lint.magenta === true;
    var seen = {}, colors = 0, bad = 0, badSeen = {}, badColors = [];
    var idxSeen = {}, idxList = [], forbidden = 0;
    var x, y, i, c, v;

    if (idxF) {
      // ---- 以「NES 色號」直接驗（最準）：色號越界 / 用到禁用色 $0D --------
      var forb = forbiddenMap();
      for (y = y0; y < y1; y++) {
        for (x = 0; x < w; x++) {
          i = y * w + x;
          v = idxF[i];
          if (idxSeen[v] === undefined) { idxSeen[v] = 1; idxList.push(idxName(v)); }
          // 同屏色數以「實際 RGB」計（$0F 與 $1D 同為黑，硬體上算同一色）
          c = (pd && pd.rgb[v] !== null && pd.rgb[v] !== undefined) ? pd.rgb[v] : ('i' + v);
          if (seen[c] === undefined) { seen[c] = 1; colors++; } else { seen[c]++; }
          if (v > 63 || forb[v]) {
            bad++;
            if (forb[v]) forbidden++;
            if (badSeen[v] === undefined) { badSeen[v] = 1; badColors.push(idxName(v)); }
            if (mag && buf) {
              buf[i * 4] = MAGENTA[0]; buf[i * 4 + 1] = MAGENTA[1];
              buf[i * 4 + 2] = MAGENTA[2]; buf[i * 4 + 3] = 255;
            }
          }
        }
      }
    } else {
      // ---- 只有 RGBA：比對 64 色表 ---------------------------------------
      for (y = y0; y < y1; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          c = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
          if (seen[c] === undefined) { seen[c] = 1; colors++; } else { seen[c]++; }
          if (pd && pd.set[c] === undefined) {
            bad++;
            if (badSeen[c] === undefined) { badSeen[c] = 1; badColors.push(hex(c)); }
            if (mag) {
              buf[i] = MAGENTA[0]; buf[i + 1] = MAGENTA[1]; buf[i + 2] = MAGENTA[2]; buf[i + 3] = 255;
            }
          }
        }
      }
    }

    var list = [], k;
    for (k in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, k)) {
        list.push(String(k).charAt(0) === 'i' ? idxName(Number(String(k).substr(1))) : hex(Number(k)));
      }
    }

    var res = {
      ok: true,
      colors: colors,
      badPixels: bad,
      overLine: overLineOf(ppu) || [],
      colorList: list,
      badColors: badColors,
      indexColors: idxList.length ? idxList.length : undefined,
      indexList: idxList.length ? idxList : undefined,
      forbiddenPixels: forbidden,
      paletteChecked: !!(idxF || pd),
      source: idxF ? 'indexFrame' : 'frame',
      maxColors: Lint.maxColors,
      region: [y0, y1],
      errors: []
    };
    if (colors > Lint.maxColors) res.errors.push('同屏色數 ' + colors + ' > ' + Lint.maxColors);
    if (bad > 0) {
      res.errors.push((idxF ? '非法色號 ' : '非 64 色像素 ') + bad + ' 個：' + badColors.slice(0, 8).join(' ') +
        (forbidden ? '（其中 ' + forbidden + ' 個用到禁用色）' : ''));
    }
    res.ok = res.errors.length === 0;
    if (!res.ok && Lint.strict) fail(res.errors.join('；'));
    return res;
  }

  // ---- oam -----------------------------------------------------------------
  function spriteHeight(ppu) {
    var v = ppu.sprHeight || ppu.spriteHeight || ppu.sprMode || null;
    if (typeof ppu.spriteMode === 'number') v = ppu.spriteMode;
    else if (!v && typeof ppu.spriteMode === 'function') {
      try { v = ppu.spriteMode(); } catch (e) { v = null; }
    }
    if (!v && ppu.stats && ppu.stats.spriteHeight) v = ppu.stats.spriteHeight;
    if (v !== 8 && v !== 16) v = 8;
    return v;
  }

  function readSprites(src) {
    var out = [], i, s;
    if (src instanceof Uint8Array || src instanceof Uint8ClampedArray) {
      for (i = 0; i + 3 < src.length && out.length < 64; i += 4) {
        out.push({ y: src[i], tile: src[i + 1], pal: src[i + 2] & 3, x: src[i + 3], raw: true });
      }
      return out;
    }
    if (typeof src.length !== 'number') fail('oam(ppu)：ppu.oam 格式不認得');
    for (i = 0; i < src.length; i++) {
      s = src[i];
      if (!s) continue;
      if (s.on === false || s.active === false || s.enabled === false || s.visible === false) continue;
      out.push(s);
    }
    return out;
  }

  function oam(ppu, opts) {
    if (!ppu) fail('oam(ppu)：缺少 ppu');
    opts = opts || {};
    var src = ppu.oam || ppu.sprites;
    if (!src) {
      // ppu.js 還沒提供 OAM 檢視 → 容錯跳過，不擋住整條 lint
      return { ok: true, skipped: true, reason: 'ppu.oam 不存在', overLine: [], errors: [] };
    }
    var list = readSprites(src);
    var h = opts.height || spriteHeight(ppu);
    var limit = Lint.maxSpritesPerLine;
    var lines = new Uint16Array(HEIGHT), i, s, x, y, yy, n;
    var errors = [], offscreen = 0, hidden = 0;

    for (i = 0; i < list.length; i++) {
      s = list[i];
      y = s.y; x = s.x;
      if (typeof x !== 'number' || typeof y !== 'number') { errors.push('#' + i + ' 座標不是數字'); continue; }
      if (x !== Math.floor(x) || y !== Math.floor(y)) {
        errors.push('#' + i + ' 座標非整數（' + x + ',' + y + '）：NES 精靈只能落在整數像素');
        x = Math.floor(x); y = Math.floor(y);
      }
      if (typeof s.tile === 'number' && ((s.tile | 0) !== s.tile || s.tile < 0 || s.tile > 255)) {
        errors.push('#' + i + ' 磁磚索引越界：' + s.tile);
      }
      if (typeof s.pal === 'number' && (s.pal < 0 || s.pal > 3)) {
        errors.push('#' + i + ' 精靈調色盤越界：' + s.pal + '（只有 0..3）');
      }
      if (s.raw && y >= 0xEF) { hidden++; continue; }         // 真機藏精靈的慣例
      if (x <= -8 || x >= 256 || y <= -h || y >= HEIGHT) { offscreen++; continue; }
      for (yy = y; yy < y + h; yy++) if (yy >= 0 && yy < HEIGHT) lines[yy]++;
    }
    if (list.length > 64) errors.push('精靈總數 ' + list.length + ' > 64');

    var over = [], maxLine = 0;
    for (i = 0; i < HEIGHT; i++) {
      n = lines[i];
      if (n > maxLine) maxLine = n;
      if (n > limit) over.push({ line: i, count: n });
    }

    var flickered = ppu.flicker === 'rotate' || !!(ppu.stats && ppu.stats.flickered);
    var res = {
      ok: true, count: list.length, maxLine: maxLine, overLine: over,
      offscreen: offscreen, hidden: hidden, spriteHeight: h,
      flicker: !!flickered, errors: errors
    };
    if (over.length && !flickered) {
      errors.push('有 ' + over.length + ' 條掃描線超過 ' + limit + ' 個精靈（最多 ' + maxLine +
        '），且未開啟 OAM 輪替閃爍');
    }
    res.ok = errors.length === 0;
    if (!res.ok && Lint.strict) fail(errors.join('；'));
    return res;
  }

  function check(ppu, opts) {
    var f = frame(ppu, opts), o;
    try { o = oam(ppu, opts); } catch (e) {
      if (Lint.strict) throw e;
      o = { ok: false, errors: [String(e.message)] };
    }
    return { ok: f.ok && o.ok, frame: f, oam: o };
  }

  function summary(res) {
    if (res && res.frame) res = res.frame;
    if (!res) return 'lint: (無結果)';
    return 'lint ' + (res.ok ? 'PASS' : 'FAIL') + ' — 色數 ' + res.colors + '/' + res.maxColors +
      '、非法像素 ' + res.badPixels + '、超線 ' + (res.overLine ? res.overLine.length : 0) +
      (res.errors && res.errors.length ? '｜' + res.errors.join('；') : '');
  }

  var Lint = {
    strict: false,
    magenta: false,
    maxColors: 25,
    maxSpritesPerLine: 8,
    MAGENTA: MAGENTA,
    VISIBLE: { y0: 8, y1: 232 },  // 研究 01 §3.1：NTSC 電視只看得到中央 256×224
    frame: frame,
    oam: oam,
    check: check,
    summary: summary
  };
  NES.Lint = Lint;
})();
