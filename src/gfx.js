// 精靈註冊、繪製、文字 —— 全部程序式像素圖，不載入外部檔案
(function () {
  KB.SPR = {};            // name -> { frames:[{cv,w,h,ax,ay}], fps, loop, n }
  KB.missing = new Set();
  KB.SPR_ORDER = [];      // 註冊順序（sheet 用）

  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }
  // 需要 getImageData 的離屏畫布（文字遮罩 / 調色）—— 標記 willReadFrequently，
  // 讓瀏覽器改用 CPU backing store（快很多，也不會噴 Canvas2D 警告）。
  function readCtx(cv) { return cv.getContext('2d', { willReadFrequently: true }); }
  KB.makeCanvas = makeCanvas;

  function hexToRGBA(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 4) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length === 8) return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }

  // 將字串列陣列轉為 canvas
  function compileFrame(rows, pal) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    const cache = {};
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        let col = cache[ch];
        if (col === undefined) {
          const hex = pal[ch];
          col = cache[ch] = hex ? hexToRGBA(hex) : [255, 0, 255, 255];
        }
        const i = (y * w + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return { cv, w, h };
  }

  /**
   * 註冊精靈。
   * frames: 陣列的陣列（多幀）或字串陣列（單幀）。
   * opts: { fps, loop, anchor:'bottom'|'center'|'topleft'|[ax,ay], pal }
   */
  KB.sprite = function (name, pal, frames, opts) {
    opts = opts || {};
    if (typeof frames[0] === 'string') frames = [frames];
    const fr = frames.map(rows => {
      const f = compileFrame(rows, pal || {});
      const a = opts.anchor || 'bottom';
      if (Array.isArray(a)) { f.ax = a[0]; f.ay = a[1]; }
      else if (a === 'center') { f.ax = Math.floor(f.w / 2); f.ay = Math.floor(f.h / 2); }
      else if (a === 'topleft') { f.ax = 0; f.ay = 0; }
      else { f.ax = Math.floor(f.w / 2); f.ay = f.h; }
      return f;
    });
    if (!KB.SPR[name]) KB.SPR_ORDER.push(name);
    KB.SPR[name] = { frames: fr, fps: opts.fps || 6, loop: opts.loop !== false, n: fr.length, w: fr[0].w, h: fr[0].h };
    return KB.SPR[name];
  };

  // 以既有精靈產生調色後的複本（例如敵人變色）
  KB.spriteRecolor = function (name, newName, map) {
    const s = KB.SPR[name]; if (!s) return null;
    const fr = s.frames.map(f => {
      const cv = makeCanvas(f.w, f.h), ctx = cv.getContext('2d');
      ctx.drawImage(f.cv, 0, 0);
      const img = ctx.getImageData(0, 0, f.w, f.h), d = img.data;
      const pairs = Object.keys(map).map(k => [hexToRGBA(k), hexToRGBA(map[k])]);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        for (const [a, b] of pairs) if (d[i] === a[0] && d[i + 1] === a[1] && d[i + 2] === a[2]) { d[i] = b[0]; d[i + 1] = b[1]; d[i + 2] = b[2]; break; }
      }
      ctx.putImageData(img, 0, 0);
      return { cv, w: f.w, h: f.h, ax: f.ax, ay: f.ay };
    });
    if (!KB.SPR[newName]) KB.SPR_ORDER.push(newName);
    KB.SPR[newName] = { frames: fr, fps: s.fps, loop: s.loop, n: fr.length, w: s.w, h: s.h };
    return KB.SPR[newName];
  };

  KB.has = name => !!KB.SPR[name];

  const missingCv = {};
  function missingSprite(name) {
    if (!KB.missing.has(name)) { KB.missing.add(name); if (KB.DEBUG || true) console.warn('[missing sprite]', name); }
    if (!missingCv[name]) {
      const cv = makeCanvas(16, 16), c = cv.getContext('2d');
      c.fillStyle = '#ff00ff'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#000'; c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#ff00ff'; c.font = '10px monospace'; c.fillText(name[0].toUpperCase(), 4, 12);
      missingCv[name] = { frames: [{ cv, w: 16, h: 16, ax: 8, ay: 16 }], fps: 1, loop: true, n: 1, w: 16, h: 16 };
    }
    return missingCv[name];
  }

  KB.frameIndex = function (s, opts) {
    if (opts.frame !== undefined) return ((opts.frame % s.n) + s.n) % s.n;
    const t = opts.t || 0;
    const i = Math.floor(t * (opts.fps || s.fps));
    return s.loop ? i % s.n : Math.min(i, s.n - 1);
  };

  // 白色閃爍用暫存
  const tintCache = new Map();
  function tinted(f, color) {
    const key = color;
    let m = tintCache.get(f); if (!m) { m = {}; tintCache.set(f, m); }
    if (m[key]) return m[key];
    const cv = makeCanvas(f.w, f.h), c = cv.getContext('2d');
    c.drawImage(f.cv, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = color; c.fillRect(0, 0, f.w, f.h);
    return (m[key] = cv);
  }

  /**
   * 在 ctx 以螢幕座標繪製精靈。x,y 為錨點位置。
   * opts: { flip, frame, t, fps, alpha, tint('#fff'), scaleX, scaleY, rot(弧度) , flipY }
   */
  KB.drawSpr = function (ctx, name, x, y, opts) {
    opts = opts || {};
    const s = KB.SPR[name] || missingSprite(name);
    const f = s.frames[KB.frameIndex(s, opts)];
    const img = opts.tint ? tinted(f, opts.tint) : f.cv;
    x = Math.round(x); y = Math.round(y);
    const flip = !!opts.flip, flipY = !!opts.flipY;
    const needT = flip || flipY || opts.alpha !== undefined || opts.rot || opts.scaleX || opts.scaleY;
    if (!needT) { ctx.drawImage(img, x - f.ax, y - f.ay); return; }
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.scale((flip ? -1 : 1) * (opts.scaleX || 1), (flipY ? -1 : 1) * (opts.scaleY || 1));
    ctx.drawImage(img, -f.ax, -f.ay);
    ctx.restore();
  };

  KB.sprSize = function (name) { const s = KB.SPR[name]; return s ? { w: s.w, h: s.h, n: s.n } : { w: 16, h: 16, n: 1 }; };

  // ---------- 文字 ----------
  // 8×8 點陣字：由 art 註冊 KB.FONT[ch] = ['........', ...]（'#' 或任何非 '.' 為實心）
  KB.FONT = KB.FONT || {};
  const glyphCache = {};
  function glyph(ch, color) {
    const key = ch + color;
    if (glyphCache[key]) return glyphCache[key];
    const rows = KB.FONT[ch]; if (!rows) return null;
    const pal = { '#': color, '1': color, 'x': color, 'w': color, 'k': color };
    // 任意非透明字元皆填色
    const norm = rows.map(r => r.replace(/[^. ]/g, '#'));
    const f = compileFrame(norm, pal);
    return (glyphCache[key] = f);
  }

  // ---------- 中文 → 像素 ----------
  // 主路徑：內嵌的**像素中文字型**（見下方「像素字型」），以原生字級繪製 + alpha 二值化 ⇒
  //         筆畫多的字（繼 / 續 / 圖 / 鐵 / 鎚 / 醒 / 競 / 績）在 12px 也是乾淨的實心像素。
  // 退路（字型載入失敗 / 還沒載完的頭幾幀）：系統黑體以 N 倍字級（預設 4 倍＝48px）渲染到離屏畫布，
  //         再以「區塊平均覆蓋率」縮回目標字級並二值化（覆蓋率 ≥ 41% 即填滿）。筆畫粗細一致但較糊。
  KB.ZH_FONT = '"Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei","微軟正黑體","PingFang TC","Heiti TC","Hiragino Sans GB","Droid Sans Fallback","WenQuanYi Zen Hei",sans-serif';
  KB.defaultFont = size => size + 'px ' + KB.ZH_FONT;
  // scale：超取樣倍率（字級 ×N 渲染）；cover：區塊覆蓋率門檻 0~255（越低筆畫越粗，105 ≈ 41%）；
  // boldFrom：此字級以上改用粗體（標題）。改參數後呼叫 KB.clearTextCache()。
  // alpha：像素字型路徑的二值化門檻；pixelMap：字級 → 像素字型對應（見下方「像素字型」段）。
  KB.TEXT_CFG = {
    scale: 4, cover: 105, boldFrom: 16,       // ← 舊路徑（像素字型載入失敗時的退路）
    alpha: 128,                                // 像素字型二值化門檻（0~255）
    // 字級對應表：[要求字級上限, KB.FONTS 的 key, 實際繪製的 px]
    // 由小到大依序比對；字型缺字（子集沒收的字）會自動退回 px12（見 planHasAll）。
    pixelMap: [[13, 'px12', 12], [999, 'px16', 16]],
    // 中英混排：false = 整段都用像素字型（拉丁字也用，畫面只有一種西文字體，視覺一致）
    // true  = 中文用像素字型、英數用 8×8 點陣字（舊行為）。size===8 的純 ASCII 一律走 8×8，不受此旗標影響。
    mixBitmap: false,
    // font2：16px Unifont 是「方正細」的等寬點陣，深色底上比 12px 縫合字細 ⇒ 這個字級以上
    // 在 pixelMask 裡多畫一次 +1px 水平位移（假粗體），筆畫變成 2px 實心，標題份量才夠。
    // 設成 999 可關閉；改完要呼叫 KB.clearTextCache()。
    boldFrom16: 16,
  };

  // ---------- 像素字型 ----------
  // fusion12 = 縫合像素字體 12px 比例寬（SIL OFL 1.1；繁中，19,214 個 CJK 漢字，UPM 1200）
  // unifont16= GNU Unifont 16.0.04 子集（OFL 1.1 / GPLv2+font exception 雙授權；16×16 全形點陣，
  //            只裁出本遊戲用得到的 1,777 個字 ⇒ 56 KB。字集由 tools/font_subset.py 掃 src/**/*.js 產生）
  // 兩者都是「點陣外框字」：以原生字級（12 / 16px）繪製時 Canvas 不做任何抗鋸齒，
  // 直接就是對齊格點的實心像素 —— 不需要超取樣 + 覆蓋率二值化，筆畫多的字也不會糊。
  KB.FONTS = { px12: 'FusionPixel12', px16: 'Unifont16', ready: false, failed: false, loaded: {}, zh: {} };
  KB.FONT_SRC = KB.FONT_SRC || { px12: 'assets/fonts/fusion12-zh_hant.woff2', px16: 'assets/fonts/unifont16-subset.woff2' };
  // px16 是「只收遊戲用字」的子集 ⇒ 執行期若出現清單外的字（例如新加的文案還沒重跑 font_subset.py），
  // 該字會變成豆腐 / 空白。KB.FONT_CHARS16 是 tools/font_subset.py 產生、tools/build.py 內嵌的字元清單
  // （dist 才有；index.html 直接跑時為 null），用來快速判斷；兩種情況都會再做一次「逐字實繪比對」。
  KB.FONT_CHARS16 = KB.FONT_CHARS16 || null;
  // dist 單檔版：tools/build.py 會在 gfx.js 之前塞入
  //   KB.FONT_DATA = { px12: 'data:font/woff2;base64,…', px16: '…' }
  // 有 KB.FONT_DATA 就優先用它（雙擊 dist/卡比之星.html 也有像素字型）。
  // 需要中文字型才畫得出來的字（CJK 漢字 / 注音 / 全形標點 / 假名）
  const ZH_RE = /[\u2e80-\u9fff\u3000-\u30ff\u3105-\u312f\u31a0-\u31bf\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;

  function fontSpec(family, px) { return px + 'px "' + family + '"'; }

  // 這個字族在這個字級畫得出漢字嗎？（畫「國」跟一個不存在的字族比對像素）
  function familyHasZh(family, px) {
    try {
      const cv = makeCanvas(px * 2, px * 2), c = readCtx(cv);
      const shot = fam => {
        c.clearRect(0, 0, cv.width, cv.height);
        c.font = fontSpec(fam, px); c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
        c.fillText('國', 0, px * 1.5);
        return c.getImageData(0, 0, cv.width, cv.height).data.join(',');
      };
      return shot(family) !== shot('__kb_no_such_font__');
    } catch (e) { return false; }
  }

  // ---------- 缺字偵測（font2）----------
  // px16 是子集字型，清單外的字會變成豆腐（.notdef）或掉到系統字。畫之前先逐字檢查：
  //   ① 這個字畫出來 === 同字族畫 U+E000（保證不存在）⇒ 是 .notdef 豆腐
  //   ② 這個字畫出來 === 用不存在的字族畫（＝系統字）⇒ 瀏覽器根本沒用到這個字族
  // 任一成立就算「缺字」，整串退回 px12（絕不讓豆腐上畫面）。結果按「字族|字級|字」快取。
  const charCache = Object.create(null);
  function familyHasChar(family, px, ch) {
    const k = family + '|' + px + '|' + ch;
    const hit = charCache[k]; if (hit !== undefined) return hit;
    let ok = false;
    try {
      const cv = makeCanvas(px * 2 + 4, px * 2), c = readCtx(cv);
      const shot = (fam, s) => {
        c.clearRect(0, 0, cv.width, cv.height);
        c.font = fontSpec(fam, px); c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
        c.fillText(s, 1, px * 1.4);
        return c.getImageData(0, 0, cv.width, cv.height).data.join(',');
      };
      const mine = shot(family, ch);
      ok = mine !== shot(family, '')                     // 整片空白（字型沒有這個字形）
        && mine !== shot(family, '\uE000')              // 與 .notdef 相同（豆腐方框）
        && mine !== shot('__kb_no_such_font__', ch);     // 與系統字相同（瀏覽器已 fallback）
    } catch (e) { ok = false; }
    return (charCache[k] = ok);
  }
  // 整串都畫得出來嗎？（空白不算；px12 是全字庫，只在 px16 這種子集字型上做逐字檢查）
  function planHasAll(plan, str) {
    if (plan.key !== 'px16') return true;
    const list = KB.FONT_CHARS16;
    for (const ch of String(str)) {
      if (ch === ' ' || ch === '　' || ch === '\n') continue;
      if (list && list.indexOf(ch) < 0) return false;     // build 產生的字集清單：先快篩
      if (!familyHasChar(plan.family, plan.px, ch)) return false;
    }
    return true;
  }
  KB.fontHasAll = planHasAll;

  KB.loadPixelFonts = function () {
    if (!window.FontFace || !document.fonts) { KB.FONTS.failed = true; return Promise.resolve(KB.FONTS); }
    const data = KB.FONT_DATA || {};
    const keys = Object.keys(KB.FONT_SRC);
    const jobs = keys.map(k => {
      const url = data[k] || KB.FONT_SRC[k];
      if (!url) return Promise.resolve(null);
      let ff;
      try { ff = new FontFace(KB.FONTS[k], 'url(' + url + ')'); } catch (e) { return Promise.resolve(null); }
      return ff.load().then(f => { document.fonts.add(f); return k; }, () => null);
    });
    return Promise.all(jobs).then(res => {
      for (const k of res) if (k) KB.FONTS.loaded[k] = true;
      for (const m of KB.TEXT_CFG.pixelMap) {
        const k = m[1];
        KB.FONTS.zh[k] = !!KB.FONTS.loaded[k] && familyHasZh(KB.FONTS[k], m[2]);
      }
      KB.FONTS.ready = !!KB.FONTS.loaded.px12;      // px12 是唯一有完整繁中的字型
      KB.FONTS.failed = !KB.FONTS.ready;
      KB.clearTextCache();
      return KB.FONTS;
    });
  };

  // 依要求字級挑像素字型；字型沒載好、畫不出漢字、或子集缺了字串裡任何一個字 ⇒ 整串退回 px12；
  // px12 也沒有 → 回傳 null（走舊的超取樣路徑）。
  function pixelPlan(str, size) {
    if (!KB.FONTS.ready) return null;
    const map = KB.TEXT_CFG.pixelMap || [];
    let key = 'px12', px = 12;
    for (const m of map) if (size <= m[0]) { key = m[1]; px = m[2]; break; }
    const needZh = ZH_RE.test(str);
    let plan = { family: KB.FONTS[key], px, key };
    // px16 子集缺字 → 退回 px12（避免豆腐）；px12 是全字庫，只檢查漢字覆蓋
    if (!KB.FONTS.loaded[key] || (needZh && !KB.FONTS.zh[key]) || !planHasAll(plan, str)) {
      key = 'px12'; px = 12; plan = { family: KB.FONTS[key], px, key };
    }
    if (!KB.FONTS.loaded[key] || (needZh && !KB.FONTS.zh[key])) return null;
    return plan;
  }
  KB.pixelPlan = pixelPlan;

  // 字型度量（每個字族 / 字級量一次）：ink 上緣固定落在 y+TOP，與舊路徑的視覺位置一致
  const INK_TOP = 2;
  const metCache = {};
  function pixelMetrics(family, px) {
    const k = family + '|' + px;
    if (metCache[k]) return metCache[k];
    const cv = makeCanvas(8, 8), c = cv.getContext('2d');
    c.font = fontSpec(family, px); c.textBaseline = 'alphabetic';
    let asc = Math.round(px * 5 / 6), desc = Math.max(1, Math.round(px / 6));
    try {
      const m = c.measureText('國H');
      if (m.actualBoundingBoxAscent) asc = Math.ceil(m.actualBoundingBoxAscent);
      const m2 = c.measureText('gpy，。');
      if (m2.actualBoundingBoxDescent > 0) desc = Math.ceil(m2.actualBoundingBoxDescent);
    } catch (e) { }
    return (metCache[k] = { asc, desc, base: INK_TOP + asc, h: INK_TOP + asc + desc + 1 });
  }

  // 像素字型遮罩：原生字級直接繪製 + alpha 二值化（不縮放）
  // font2：字級 ≥ KB.TEXT_CFG.boldFrom16 時做「假粗體」—— 同一串字再畫一次、水平 +1px，
  //        Unifont 16px 的 1px 細筆畫變成 2px，標題在深色底上才有份量（12px 縫合字不受影響）。
  function pixelMask(str, plan) {
    const met = pixelMetrics(plan.family, plan.px), font = fontSpec(plan.family, plan.px);
    const bold = plan.px >= (KB.TEXT_CFG.boldFrom16 || 999);
    const tmp = makeCanvas(4, 4), tc = tmp.getContext('2d');
    tc.font = font;
    const adv = Math.max(1, Math.ceil(tc.measureText(str).width));
    const w = adv + 2 + (bold ? 1 : 0), h = met.h;       // +2：少數字形會超出 advance
    const cv = makeCanvas(w, h), c = readCtx(cv);
    c.font = font; c.textBaseline = 'alphabetic'; c.fillStyle = '#ffffff';
    c.fillText(str, 0, met.base);
    if (bold) c.fillText(str, 1, met.base);
    const img = c.getImageData(0, 0, w, h), d = img.data, A = KB.TEXT_CFG.alpha;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= A) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255; }
      else d[i + 3] = 0;
    }
    c.putImageData(img, 0, 0);
    return { cv, w: adv + (bold ? 1 : 0), h };            // w 回傳 advance（排版用；假粗體多 1px）
  }

  function scaleFont(font, size, S) {
    const big = (size * S) + 'px';
    let done = false;
    let r = font.replace(/(\d*\.?\d+)px/, () => { done = true; return big; });
    if (!done) r = big + ' ' + KB.ZH_FONT;
    if (size >= KB.TEXT_CFG.boldFrom && !/bold|[5-9]00/.test(r)) r = 'bold ' + r;
    return r;
  }

  const maskCache = new Map();
  // 產生白色遮罩（已二值化）；同一串字不同顏色共用，避免重複超取樣
  // 像素字型就緒 → 原生字級直繪；否則走舊的「系統黑體 ×N 超取樣 + 覆蓋率二值化」。
  function textMask(str, font, size) {
    const plan = pixelPlan(str, size);
    const key = str + '|' + (plan ? 'px' + plan.px + '@' + plan.family : font) + '|' + size;
    let m = maskCache.get(key); if (m) return m;
    if (plan) {
      m = pixelMask(str, plan);
      if (maskCache.size > 300) maskCache.clear();
      maskCache.set(key, m);
      return m;
    }
    const cfg = KB.TEXT_CFG, S = Math.max(1, cfg.scale | 0);
    const bigFont = scaleFont(font, size, S);
    const tmp = makeCanvas(4, 4), tc = tmp.getContext('2d');
    tc.font = bigFont;
    const wB = Math.max(S, Math.ceil(tc.measureText(str).width)) + 2 * S, hB = Math.ceil(size * S * 1.45) + 2 * S;
    const big = makeCanvas(wB, hB), bc = readCtx(big);
    bc.font = bigFont; bc.textBaseline = 'top'; bc.fillStyle = '#ffffff'; bc.fillText(str, S, S);
    const src = bc.getImageData(0, 0, wB, hB).data;
    const w = Math.ceil(wB / S), h = Math.ceil(hB / S);
    const cv = makeCanvas(w, h), c = cv.getContext('2d');
    const img = c.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let j = 0; j < S; j++) {
          const sy = y * S + j; if (sy >= hB) break;
          for (let i = 0; i < S; i++) {
            const sx = x * S + i; if (sx >= wB) break;
            sum += src[(sy * wB + sx) * 4 + 3]; n++;
          }
        }
        if (n && sum / n >= cfg.cover) {
          const k = (y * w + x) * 4; d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = 255;
        }
      }
    }
    c.putImageData(img, 0, 0);
    m = { cv, w, h };
    if (maskCache.size > 300) maskCache.clear();
    maskCache.set(key, m);
    return m;
  }

  const textCache = new Map();
  function renderTextCanvas(str, font, color, size) {
    const key = str + '|' + font + '|' + color + '|' + size;
    if (textCache.has(key)) return textCache.get(key);
    const m = textMask(str, font, size);
    const cw = m.cv.width, ch = m.cv.height;
    const cv = makeCanvas(cw, ch), c = cv.getContext('2d');
    c.drawImage(m.cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, cw, ch);
    const r = { cv, w: m.w, h: m.h };                 // w = 排版寬度（可能 < 畫布寬）
    if (textCache.size > 400) textCache.clear();
    textCache.set(key, r);
    return r;
  }
  KB.clearTextCache = function () { textCache.clear(); maskCache.clear(); };

  /**
   * 畫文字。ASCII 有點陣字時用點陣，否則（含中文）用系統字轉像素。
   * opts: { color:'#fff', align:'left'|'center'|'right', size:8, outline:'#000', shadow:'#000', font, spacing }
   */
  KB.text = function (ctx, str, x, y, opts) {
    opts = opts || {};
    const color = opts.color || '#ffffff', align = opts.align || 'left', size = opts.size || 8;
    str = String(str);
    x = Math.round(x); y = Math.round(y);
    const spacing = opts.spacing !== undefined ? opts.spacing : 0;
    // 判斷是否全為點陣字可用字元
    const allBitmap = size === 8 && str.split('').every(ch => KB.FONT[ch] || ch === ' ');
    if (allBitmap) {
      const w = str.length * (8 + spacing) - spacing;
      let sx = x; if (align === 'center') sx = x - Math.floor(w / 2); else if (align === 'right') sx = x - w;
      const draw = (dx, dy, col) => {
        let cx = sx + dx;
        for (const ch of str) {
          if (ch !== ' ') { const g = glyph(ch, col); if (g) ctx.drawImage(g.cv, cx, y + dy); }
          cx += 8 + spacing;
        }
      };
      if (opts.outline) { for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) draw(ox, oy, opts.outline); }
      if (opts.shadow) draw(1, 1, opts.shadow);
      draw(0, 0, color);
      return w;
    }
    const font = opts.font || KB.defaultFont(size);
    const r = renderTextCanvas(str, font, color, size);
    let sx = x; if (align === 'center') sx = x - Math.floor(r.w / 2); else if (align === 'right') sx = x - r.w;
    if (opts.outline) {
      const o = renderTextCanvas(str, font, opts.outline, size);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(o.cv, sx + ox, y + oy);
    }
    if (opts.shadow) { const o = renderTextCanvas(str, font, opts.shadow, size); ctx.drawImage(o.cv, sx + 1, y + 1); }
    ctx.drawImage(r.cv, sx, y);
    return r.w;
  };

  KB.textWidth = function (str, opts) {
    opts = opts || {}; const size = opts.size || 8;
    const allBitmap = size === 8 && String(str).split('').every(ch => KB.FONT[ch] || ch === ' ');
    if (allBitmap) return String(str).length * 8;
    const font = opts.font || KB.defaultFont(size);
    return renderTextCanvas(String(str), font, opts.color || '#fff', size).w;
  };

  // 啟動就開始載入像素字型（file:// 與 http 都可）。完成前的頭幾幀會走舊的超取樣路徑，
  // 載好後 clearTextCache() 會讓所有文字自動改用像素字型重畫。
  try { KB.loadPixelFonts(); } catch (e) { KB.FONTS.failed = true; }

  // 簡單像素矩形 / 圓
  KB.rect = function (ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  KB.circle = function (ctx, cx, cy, r, color) {
    ctx.fillStyle = color; cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); }
  };

  // 世界座標繪圖包裝（GameScene 產生）
  KB.G = class G {
    constructor(ctx, cam) { this.ctx = ctx; this.cam = cam; }
    spr(name, x, y, opts) { KB.drawSpr(this.ctx, name, x - this.cam.x, y - this.cam.y, opts); }
    rect(x, y, w, h, color) { KB.rect(this.ctx, x - this.cam.x, y - this.cam.y, w, h, color); }
    circle(cx, cy, r, color) { KB.circle(this.ctx, cx - this.cam.x, cy - this.cam.y, r, color); }
    text(str, x, y, opts) { KB.text(this.ctx, str, x - this.cam.x, y - this.cam.y, opts); }
    line(x1, y1, x2, y2, color, w) {
      const c = this.ctx; c.strokeStyle = color; c.lineWidth = w || 1; c.beginPath();
      c.moveTo(Math.round(x1 - this.cam.x) + 0.5, Math.round(y1 - this.cam.y) + 0.5); c.lineTo(Math.round(x2 - this.cam.x) + 0.5, Math.round(y2 - this.cam.y) + 0.5); c.stroke();
    }
  };
})();
