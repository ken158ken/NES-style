// 精靈註冊、繪製、文字 —— 全部程序式像素圖，不載入外部檔案
(function () {
  KB.SPR = {};            // name -> { frames:[{cv,w,h,ax,ay}], fps, loop, n }
  KB.missing = new Set();
  KB.SPR_ORDER = [];      // 註冊順序（sheet 用）

  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }
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

  // ---------- 中文（系統字型）→ 像素 ----------
  // 舊作法（1 倍字級 + alpha>110 門檻）在沒有細明體內嵌點陣的機器（Linux / Mac）上，
  // 12px 中文的筆畫 alpha 不足而被整條砍掉 → 只剩斷斷續續的細線。
  // 新作法：以 N 倍字級（預設 4 倍＝48px）渲染到離屏畫布，再以「區塊平均覆蓋率」縮回目標字級並二值化
  //（覆蓋率 ≥ 41% 即填滿）—— 筆畫一律至少 1px 實心且粗細一致，不依賴任何字型的內嵌點陣，
  // 因此 Windows / Linux / Mac 結果一致。字型一律用黑體（筆畫等寬，縮小後最清楚）。
  KB.ZH_FONT = '"Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei","微軟正黑體","PingFang TC","Heiti TC","Hiragino Sans GB","Droid Sans Fallback","WenQuanYi Zen Hei",sans-serif';
  KB.defaultFont = size => size + 'px ' + KB.ZH_FONT;
  // scale：超取樣倍率（字級 ×N 渲染）；cover：區塊覆蓋率門檻 0~255（越低筆畫越粗，105 ≈ 41%）；
  // boldFrom：此字級以上改用粗體（標題）。改參數後呼叫 KB.clearTextCache()。
  KB.TEXT_CFG = { scale: 4, cover: 105, boldFrom: 16 };

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
  function textMask(str, font, size) {
    const key = str + '|' + font + '|' + size;
    let m = maskCache.get(key); if (m) return m;
    const cfg = KB.TEXT_CFG, S = Math.max(1, cfg.scale | 0);
    const bigFont = scaleFont(font, size, S);
    const tmp = makeCanvas(4, 4), tc = tmp.getContext('2d');
    tc.font = bigFont;
    const wB = Math.max(S, Math.ceil(tc.measureText(str).width)) + 2 * S, hB = Math.ceil(size * S * 1.45) + 2 * S;
    const big = makeCanvas(wB, hB), bc = big.getContext('2d');
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
    const cv = makeCanvas(m.w, m.h), c = cv.getContext('2d');
    c.drawImage(m.cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, m.w, m.h);
    const r = { cv, w: m.w, h: m.h };
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
