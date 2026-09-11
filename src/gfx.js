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

  const textCache = new Map();
  function renderTextCanvas(str, font, color, size) {
    const key = str + '|' + font + '|' + color + '|' + size;
    if (textCache.has(key)) return textCache.get(key);
    const tmp = makeCanvas(4, 4), tc = tmp.getContext('2d');
    tc.font = font;
    const w = Math.ceil(tc.measureText(str).width) + 2, h = Math.ceil(size * 1.4) + 2;
    const cv = makeCanvas(w, h), c = cv.getContext('2d');
    c.font = font; c.textBaseline = 'top'; c.fillStyle = color; c.fillText(str, 1, 1);
    // 去除反鋸齒 → 純像素
    const img = c.getImageData(0, 0, w, h), d = img.data, col = hexToRGBA(color);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 110) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
      else d[i + 3] = 0;
    }
    c.putImageData(img, 0, 0);
    const r = { cv, w, h };
    if (textCache.size > 400) textCache.clear();
    textCache.set(key, r);
    return r;
  }

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
    const font = opts.font || ('bold ' + size + 'px "Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif');
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
    const font = opts.font || ('bold ' + size + 'px "Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif');
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
