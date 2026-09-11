// UI：標題畫面 / 選關地圖 / HUD / 魔王血條 / 暫停 / Game Over / 結局
// 所有精靈皆先以 KB.has 檢查；缺圖時改用本檔註冊的 uifb_* 備援圖或純繪圖，畫面本身就要完整好看。
// 版面常數集中在 KB.UI.LAYOUT，美術 / game.js 可依此對齊。
// 文字：ASCII 走 8×8 點陣字；中文一律 12px / 16px 黑體（gfx.js 超取樣轉像素；8~10px 中文不可讀）。
//       其他檔案可用 KB.UI.text / KB.UI.textWidth / KB.UI.bigText 取得相同效果。
(function () {
  'use strict';
  const W = KB.W, H = KB.H, VH = KB.VIEW_H, HUD_Y = KB.HUD_Y;
  const UI = KB.UI = KB.UI || {};
  UI.unlockAll = !!KB.DEBUG;      // ?debug=1 → 全關解鎖（執行期可改 KB.UI.unlockAll=false 測試鎖定畫面）
  UI.muteToast = 0;
  UI.LAYOUT = {
    // HUD（y 192~224）：左 能力圖示+名稱 / 中 HP、魔王血條 / 右 上列分數、下列生命
    hud: { iconX: 4, iconY: 200, nameX: 32, rowA: 197, rowB: 207, hpX: 84, hpY: 197, hpGap: 9, right: 251, faceX: 217, faceY: 206, livesY: 210 },
    bossBar: { cx: 111, y: 208, w: 90, h: 10 },     // 置中於 HP 列正下方；ui_boss_bar 90×10（內框 2px）
    mapNodes: [[30, 142], [80, 100], [128, 134], [176, 84], [226, 118]],
  };
  const C = { navy: '#101828', panel: '#182038', border: '#f0f0f8', yellow: '#ffe040', pink: '#ffb0d0', grey: '#98a8c0', dark: '#202838', cyan: '#80e0ff' };
  const pad7 = n => String(Math.max(0, Math.floor(n || 0))).padStart(7, '0');
  const has = n => !!(KB.SPR && KB.SPR[n]);
  const pick = (a, b) => (has(a) ? a : b);
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };
  const clearedOf = id => !!(KB.save && KB.save.cleared && KB.save.cleared[id]);

  // ---------- 文字工具 ----------
  // 中文字型：一律用黑體（筆畫等寬），由 gfx.js 以 3 倍字級超取樣後二值化成像素字，
  // 不依賴細明體的內嵌點陣 → Windows / Linux / Mac 結果一致。
  const ZH = KB.ZH_FONT;
  UI.zhFont = s => s + 'px ' + ZH;
  const bitmapOK = s => String(s).split('').every(ch => KB.FONT[ch] || ch === ' ');
  // 中文可讀性：QA 實測 12px 高筆畫字（繼 / 續 / 圖 / 開）仍糊，選單文字一律 ≥ MS（14px）
  UI.MS = 14;         // 選單 / 標籤標準中文字級
  UI.MS_SMALL = 12;   // 空間真的不夠時的下限（例如兩欄說明表的右欄）
  function zhOpts(str, o) {
    o = o || {};
    if (o.font) return o;
    const size = o.size || 8;
    if (size === 8 && bitmapOK(str)) return o;          // 純 ASCII → 點陣字
    const s = size < 12 ? 12 : size;                      // 中文最小 12px
    return Object.assign({}, o, { size: s, font: UI.zhFont(s) });
  }
  // 12px 混排：英數（點陣字可用者）用 8×8 點陣字、其餘用細明體，逐段繪製
  function runs(str) {
    const out = []; let cur = null;
    for (const ch of String(str)) {
      const bm = !!KB.FONT[ch] || ch === ' ';
      if (cur && (cur.bm === bm || ch === ' ')) cur.s += ch; else { cur = { bm, s: ch }; out.push(cur); }
    }
    return out;
  }
  const isMixed = rs => rs.some(r => r.bm && r.s.trim()) && rs.some(r => !r.bm);
  function runWidth(r, o) { return r.bm ? r.s.length * 8 : KB.textWidth(r.s, { size: o.size, font: o.font }); }
  // 混排：12~16px 中文旁的英數改用 8×8 點陣字（更銳利也更省寬度）；bmDY 讓點陣字對齊中文的視覺中線
  const canMix = o => !!o.font && !o.nomix && o.size >= 12 && o.size <= 16;
  const bmDY = size => Math.round(size / 4);
  // 與 KB.text 同介面；含中文時自動套用黑體並把字級提升到 ≥12
  function T(ctx, str, x, y, o) {
    o = zhOpts(str, o);
    if (!canMix(o)) return KB.text(ctx, str, x, y, o);
    const rs = runs(str); if (!isMixed(rs)) return KB.text(ctx, str, x, y, o);
    const ws = rs.map(r => runWidth(r, o)), total = ws.reduce((a, b) => a + b, 0), dy = bmDY(o.size);
    let sx = Math.round(x); if (o.align === 'center') sx = Math.round(x - total / 2); else if (o.align === 'right') sx = Math.round(x - total);
    rs.forEach((r, i) => {
      if (r.bm) KB.text(ctx, r.s, sx, y + dy, { color: o.color, outline: o.outline, shadow: o.shadow });
      else KB.text(ctx, r.s, sx, y, { color: o.color, size: o.size, font: o.font, outline: o.outline, shadow: o.shadow });
      sx += ws[i];
    });
    return total;
  }
  function TW(str, o) {
    o = zhOpts(str, o);
    if (!canMix(o)) return KB.textWidth(str, o);
    const rs = runs(str); if (!isMixed(rs)) return KB.textWidth(str, o);
    return rs.reduce((a, r) => a + runWidth(r, o), 0);
  }
  UI.text = T; UI.textWidth = TW;
  // 放大的點陣字（標題用）：以 8×8 點陣字繪到暫存畫布再整數倍放大，維持像素風
  const bigCache = new Map();
  function bigText(ctx, str, x, y, scale, o) {
    o = o || {}; scale = scale || 2;
    const color = o.color || '#fff', outline = o.outline || '', shadow = o.shadow || '';
    const key = [str, color, outline, shadow, scale, o.spacing | 0].join('|');
    let cv = bigCache.get(key);
    if (!cv) {
      const w = KB.textWidth(str) + 2 + (o.spacing | 0) * Math.max(0, str.length - 1), h = 10;
      const src = KB.makeCanvas(w, h), sc = src.getContext('2d');
      KB.text(sc, str, 1, 1, { color, outline: outline || undefined, shadow: shadow || undefined, spacing: o.spacing | 0 });
      cv = KB.makeCanvas(w * scale, h * scale);
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0, w * scale, h * scale);
      bigCache.set(key, cv);
    }
    const tw = cv.width - 2 * scale;
    let sx = x; if (o.align === 'center') sx = x - (tw >> 1); else if (o.align === 'right') sx = x - tw;
    ctx.drawImage(cv, Math.round(sx) - scale, Math.round(y) - scale);
    return tw;
  }
  UI.bigText = bigText;

  // ---------- 備援精靈（缺圖時使用；art 提供正式 ui_* 後自動改用） ----------
  const FP = {
    k: '#181c28', w: '#ffffff', y: '#f8d040', l: '#fff8a0', Y: '#d09010', d: '#384050', D: '#242a36', s: '#a0a8b8',
    p: '#ffb0d0', P: '#e07aa8', c: '#f27090', m: '#a02040', b: '#5060c0', g: '#58d048', G: '#289028', h: '#98f070',
  };
  function reg(name, rows, opts) { if (!KB.SPR[name]) KB.sprite(name, FP, rows, Object.assign({ anchor: 'topleft' }, opts || {})); }
  reg('uifb_hp_full', ['.kkkkkk.', 'kllyyyyk', 'klyyyyyk', 'kyyyyyyk', 'kyyyyyyk', 'kyyyyyYk', 'kyyyyYYk', '.kkkkkk.']);
  reg('uifb_hp_empty', ['.kkkkkk.', 'kddddddk', 'kdDDDDDk', 'kdDDDDDk', 'kdDDDDDk', 'kdDDDDDk', 'kDDDDDDk', '.kkkkkk.']);
  reg('uifb_face', ['..kkkk..', '.kppppk.', 'kpkppkpk', 'kpbppbpk', 'kppppppk', 'kcppppck', '.kpmmpk.', '..kkkk..']);
  reg('uifb_cursor', ['kk.....', 'kwk....', 'kwwk...', 'kwwwk..', 'kwwk...', 'kwk....', 'kk.....']);
  reg('uifb_star', ['....k....', '...kyk...', '...kyk...', 'kkkkykkkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '.kyykyyk.', 'kkk...kkk']);
  reg('uifb_lock', ['..kkk..', '.ksssk.', '.ks.sk.', 'kkkkkkk', 'kyyyyyk', 'kyykyyk', 'kyyyyyk', 'kkkkkkk']);
  // 收集星（選關節點下方的 ★ x/3）：實心＝已拿、空心＝未拿
  reg('uifb_ministar', ['..k..', '.kyk.', 'kyyyk', 'kykyk', 'k.k.k']);
  reg('uifb_ministar_off', ['..k..', '.ksk.', 'ksssk', 'ksksk', 'k.k.k']);
  // 通關旗（節點右上角）
  reg('uifb_flag', ['k......', 'kcccck.', 'kccccck', 'kcccck.', 'k......', 'k......', 'kk.....']);
  reg('uifb_node', [
    '....kkkkkkkk....', '..kkhhhhhhhhkk..', '.khhhgggggggggk.', 'khhgggggggggggGk', 'khggggggggggggGk', 'kggggggggggggGGk',
    'kgggggggggggGGGk', 'kGgggggggggGGGGk', 'kGGggggggGGGGGGk', '.kGGGGGGGGGGGGk.', '..kkGGGGGGGGkk..', '....kkkkkkkk....']);
  const NODE_COL = {
    green: ['#58d048', '#289028', '#98f070'], castle: ['#9098b0', '#585878', '#c8ccd8'], island: ['#f0d880', '#c09848', '#fff4c0'],
    cloud: ['#a0c8f8', '#6888d8', '#e8f0ff'], dedede: ['#d84848', '#902020', '#f09090'], locked: ['#606870', '#383c48', '#808890'],
  };
  for (const k in NODE_COL) { const [g, G, h] = NODE_COL[k]; if (!KB.SPR['uifb_node_' + k]) KB.spriteRecolor('uifb_node', 'uifb_node_' + k, { '#58d048': g, '#289028': G, '#98f070': h }); }
  // 收集星：levels-bosses agent 會設定 KB.save.stars[levelId] = [bool, bool, bool]
  UI.STAR_MAX = 3;
  function starsOf(id) { const a = KB.save && KB.save.stars ? KB.save.stars[id] : null; return Array.isArray(a) ? a : []; }
  function starCount(id) { return starsOf(id).filter(Boolean).length; }
  UI.starCount = starCount;
  // 節點下方：★★☆ + 數字（回傳畫出的寬度）
  function drawStarRow(ctx, x, y, id, opts) {
    opts = opts || {};
    const got = starCount(id), n = UI.STAR_MAX, gap = 6;
    const w = n * gap - 1 + (opts.count === false ? 0 : 19);
    let sx = Math.round(opts.left ? x : x - w / 2);
    if (opts.plate !== false) KB.rect(ctx, sx - 2, y - 1, w + 4, 8, 'rgba(8,14,28,0.6)');
    for (let i = 0; i < n; i++) sprAt(ctx, i < got ? 'uifb_ministar' : 'uifb_ministar_off', sx + i * gap, y + 1, 'tl');
    if (opts.count !== false) KB.text(ctx, got + '/' + n, sx + n * gap + 3, y, { color: got >= n ? C.yellow : '#e8eef8' });
    return w;
  }
  UI.drawStarRow = drawStarRow;

  const ICON_COL = { fire: '#f86030', sword: '#40b860', beam: '#f8d030', cutter: '#e8e0c0', spark: '#58c8f8', stone: '#909098', ice: '#88e0ff', hammer: '#c07840' };

  // ---------- 共用繪圖工具 ----------
  // 不管美術設定的 anchor，以指定對齊方式繪製：'tl' 左上、'c' 置中、'b' 底部中央
  function sprAt(ctx, name, x, y, mode, opts) {
    const s = KB.SPR[name]; if (!s) return false;
    const f = s.frames[0]; let dx = 0, dy = 0;
    if (mode === 'tl') { dx = f.ax; dy = f.ay; }
    else if (mode === 'c') { dx = f.ax - (f.w >> 1); dy = f.ay - (f.h >> 1); }
    else { dx = f.ax - (f.w >> 1); dy = f.ay - f.h; }
    KB.drawSpr(ctx, name, x + dx, y + dy, opts || {});
    return true;
  }
  function bands(ctx, y0, y1, cols) { const n = cols.length, h = (y1 - y0) / n; for (let i = 0; i < n; i++) KB.rect(ctx, 0, y0 + i * h, W, Math.ceil(h), cols[i]); }
  function panel(ctx, x, y, w, h, fill, border) {
    fill = fill || C.panel; border = border || C.border;
    KB.rect(ctx, x + 1, y, w - 2, h, border); KB.rect(ctx, x, y + 1, w, h - 2, border);
    KB.rect(ctx, x + 2, y + 1, w - 4, h - 2, fill); KB.rect(ctx, x + 1, y + 2, w - 2, h - 4, fill);
    KB.rect(ctx, x + 2, y + 1, w - 4, 1, 'rgba(255,255,255,0.18)');
  }
  function rng(seed) { let s = (seed | 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  function mkClouds(n, seed, y0, y1) { const r = rng(seed); const a = []; for (let i = 0; i < n; i++) a.push({ x: r() * (W + 60), y: y0 + r() * (y1 - y0), w: 22 + Math.floor(r() * 20), spd: 0.12 + r() * 0.2 }); return a; }
  function drawClouds(ctx, clouds, frame) {
    for (const c of clouds) {
      const x = Math.round(((c.x + frame * c.spd) % (W + 60)) - 30), y = Math.round(c.y), w = c.w;
      KB.rect(ctx, x, y + 4, w, 6, '#ffffff'); KB.rect(ctx, x + 4, y + 1, w - 8, 3, '#ffffff'); KB.rect(ctx, x + (w >> 2), y - 2, w >> 1, 3, '#ffffff');
      KB.rect(ctx, x + 2, y + 10, w - 4, 1, '#d0e4f8');
    }
  }
  function mkStars(n, seed, x0, y0, w, h) { const r = rng(seed); const a = []; for (let i = 0; i < n; i++) a.push({ x: x0 + Math.floor(r() * w), y: y0 + Math.floor(r() * h), ph: r() * 6.28, spd: 1.5 + r() * 2.5, big: r() < 0.25 }); return a; }
  function drawStars(ctx, stars, t) {
    for (const s of stars) {
      const b = 0.55 + 0.45 * Math.sin(t * s.spd + s.ph); ctx.globalAlpha = Math.max(0.15, b);
      KB.rect(ctx, s.x, s.y, 1, 1, '#ffffff');
      if (s.big && b > 0.6) { KB.rect(ctx, s.x - 1, s.y, 3, 1, '#c8e0ff'); KB.rect(ctx, s.x, s.y - 1, 1, 3, '#c8e0ff'); }
    }
    ctx.globalAlpha = 1;
  }
  // 沿折線畫虛線（KB.rect 2×2 點），phase 讓點點前進
  function dottedPath(ctx, pts, color, gap, phase) {
    let acc = gap - (phase % gap);
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1][0], y0 = pts[i - 1][1], dx = pts[i][0] - x0, dy = pts[i][1] - y0, len = Math.hypot(dx, dy);
      for (let s = 0; s < len; s += 1) { if (acc >= gap) { KB.rect(ctx, x0 + dx * s / len - 1, y0 + dy * s / len - 1, 2, 2, color); acc = 0; } acc += 1; }
    }
  }
  function cursor(ctx, x, y, frame) { sprAt(ctx, pick('ui_cursor', 'uifb_cursor'), x + ((frame >> 3) & 1), y, 'tl', { t: frame / 60 }); }
  // 卡比（UI 用）：優先指定精靈 → kirby_idle → 純繪圖
  function drawKirby(ctx, name, x, y, o) {
    o = o || {}; const opts = { t: o.t || 0, flip: !!o.flip };
    if (o.squash) { opts.scaleX = 1.15; opts.scaleY = 0.85; }
    if (o.tint) opts.tint = o.tint;
    if (name && has(name)) { sprAt(ctx, name, x, y, 'b', opts); return; }
    if (has('kirby_idle')) { opts.frame = o.frame !== undefined ? o.frame : 0; sprAt(ctx, 'kirby_idle', x, y, 'b', opts); return; }
    KB.circle(ctx, x, y - 8, 8, '#202848'); KB.circle(ctx, x, y - 8, 7, C.pink);
    KB.rect(ctx, x - 8, y - 3, 6, 3, '#e8305c'); KB.rect(ctx, x + 2, y - 3, 6, 3, '#e8305c');
    KB.rect(ctx, x - 3, y - 12, 2, 4, '#202848'); KB.rect(ctx, x + 1, y - 12, 2, 4, '#202848');
    KB.rect(ctx, x - 6, y - 7, 2, 1, '#f27090'); KB.rect(ctx, x + 4, y - 7, 2, 1, '#f27090');
  }
  // 場景淡入 / 淡出（leave 於全黑後執行 cb）
  function stepFade(sc) {
    if (sc.leaving) { sc.fade = Math.min(1, sc.fade + 0.07); if (sc.fade >= 1) { const cb = sc.leaving; sc.leaving = null; cb(); } return true; }
    if (sc.fade > 0) sc.fade = Math.max(0, sc.fade - 0.05);
    return false;
  }
  function leave(sc, cb) { if (!sc.leaving) sc.leaving = cb; }
  function drawFade(ctx, sc) { if (sc.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + sc.fade.toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); } }
  function drawMuteToast(ctx) {
    if (UI.muteToast <= 0) return; UI.muteToast--;
    const muted = !!(KB.audio && KB.audio.muted);
    KB.rect(ctx, 86, VH - 28, 84, 21, 'rgba(0,0,0,0.72)');
    T(ctx, muted ? '靜音：開' : '靜音：關', 128, VH - 25, { color: muted ? C.yellow : '#fff', align: 'center', size: UI.MS });
  }
  // M 鍵靜音由 audio.js 切換（KB.audio.toggleMute）；UI 層只負責顯示提示（避免重複切換而互相抵銷）
  window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && KB.audio) UI.muteToast = 90; });

  // 供 menu.js（暫停選單 / 標題選單 / 能力圖鑑 / 設定）共用的繪圖工具
  UI.C = C; UI.panel = panel; UI.cursor = cursor; UI.sprAt = sprAt; UI.drawKirby = drawKirby;
  UI.has = has; UI.pick = pick; UI.sfx = sfx; UI.music = music; UI.bands = bands;
  UI.stepFade = stepFade; UI.leave = leave; UI.drawFade = drawFade;
  UI.mkStars = mkStars; UI.drawStars = drawStars; UI.mkClouds = mkClouds; UI.drawClouds = drawClouds;
  UI.drawMuteToast = drawMuteToast; UI.pad7 = pad7;
  // 重設 KB.session：預設保留 extra 旗標（player2 的 Extra 模式；傳第 3 參數可明確指定）
  UI.newSession = function (lives, score, extra) {
    const old = KB.session || {};
    const s2 = { lives: lives === undefined ? KB.START_LIVES : lives, score: score || 0 };
    s2.extra = extra !== undefined ? !!extra : !!old.extra;
    KB.session = s2; return s2;
  };

  // ---------- 標題畫面 ----------
  function drawTitleBg(ctx, sc) {
    bands(ctx, 0, 150, ['#3c78d8', '#4c90e4', '#60a8ec', '#78c0f4', '#90d4f8']);
    drawStars(ctx, sc.stars, sc.t);
    KB.circle(ctx, 212, 30, 13, '#ffe878'); KB.circle(ctx, 212, 30, 10, '#fff8c0');
    drawClouds(ctx, sc.clouds, sc.frame);
    KB.circle(ctx, 24, 158, 40, '#a8e0a0'); KB.circle(ctx, 112, 162, 52, '#a8e0a0'); KB.circle(ctx, 214, 160, 44, '#a8e0a0');
    KB.circle(ctx, 70, 164, 30, '#88d088'); KB.circle(ctx, 170, 166, 36, '#88d088');
    KB.rect(ctx, 0, 146, W, 5, '#58d048'); KB.rect(ctx, 0, 151, W, 2, '#289028'); KB.rect(ctx, 0, 153, W, 31, '#c88850');
    for (let x = 3; x < W; x += 9) KB.rect(ctx, x, 158 + ((x * 7) % 20), 2, 2, '#905828');
    for (let x = 6; x < W; x += 23) { KB.rect(ctx, x, 143, 1, 3, '#78e060'); KB.rect(ctx, x + 3, 144, 1, 2, '#78e060'); }
  }
  function drawLogoFallback(ctx, cx, cy, t) {
    const bob = Math.round(Math.sin(t * 2) * 2);
    sprAt(ctx, 'uifb_star', cx - 70, cy - 6 + bob, 'c'); sprAt(ctx, 'uifb_star', cx + 70, cy - 6 - bob, 'c');
    bigText(ctx, 'KIRBY', cx, cy - 20, 3, { color: C.pink, outline: '#8c2050', shadow: '#e07aa8', align: 'center' });
    bigText(ctx, 'STAR', cx + 30, cy + 6, 2, { color: C.yellow, outline: '#8c5000', align: 'center' });
    KB.rect(ctx, cx - 34, cy + 22, 68, 13, '#e83060'); KB.rect(ctx, cx - 36, cy + 23, 72, 11, '#e83060');
    KB.text(ctx, 'FAN GAME', cx, cy + 25, { color: '#fff', align: 'center' });
  }
  // 單行塞進 maxw：先照原字級，放不下就降到 12px，再放不下才截斷補「…」
  function fit(ctx, str, x, y, maxw, o) {
    let s = String(str);
    o = o || {};
    if (TW(s, o) <= maxw) return T(ctx, s, x, y, o);
    if ((o.size || 8) > 12) {
      const o2 = Object.assign({}, o, { size: 12, font: undefined });
      if (TW(s, o2) <= maxw) return T(ctx, s, x, y, o2);
      o = o2;
    }
    while (s.length > 1 && TW(s + '…', o) > maxw) s = s.slice(0, -1);
    return T(ctx, s + '…', x, y, o);
  }
  UI.fitText = fit;
  // 中文逐字斷行（無空白也能斷）；超過 maxLines 時最後一行補「…」
  UI.wrapLines = function (str, maxw, o, maxLines) {
    o = o || {}; maxLines = Math.max(1, maxLines || 2);
    const chars = Array.from(String(str)), out = [];
    let cur = '';
    for (let i = 0; i < chars.length; i++) {
      const t = cur + chars[i];
      if (cur && TW(t, o) > maxw) {
        if (out.length === maxLines - 1) {          // 已經是最後一行 → 截斷補「…」
          let last = cur;
          while (last.length > 1 && TW(last + '…', o) > maxw) last = last.slice(0, -1);
          out.push(last + '…');
          return out;
        }
        out.push(cur); cur = chars[i];
      } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };
  // 量測 fit() 實際會用的寬度（不繪製）
  UI.fitWidth = function (str, maxw, o) {
    o = o || {}; const w = TW(str, o);
    if (w <= maxw) return w;
    if ((o.size || 8) > 12) { const w2 = TW(str, Object.assign({}, o, { size: 12, font: undefined })); if (w2 <= maxw) return w2; }
    return maxw;
  };
  // 操作說明（標題畫面 / 暫停子頁共用）；列數由 input.js 的 HELP 決定，自動調整行距並截斷過長說明
  // 第 2 頁：進階提示（input.js 的 HELP 已滿 8 列，這裡補 player2 要求的進階操作）
  UI.HELP2 = [
    ['水中 X', '水中也能吸入（減半）'],
    ['梯子上 X', '在梯子上吐氣星攻擊'],
    ['↓ + 跳', '單向平台上＝穿下去'],
    ['跳（連按）', '漂浮；X 吐氣結束'],
    ['滑鏟中 跳', '滑鏟可用跳躍取消'],
    ['受傷時', '能力星噴出，可撿回'],
    ['能力台座', '碰到即可重複取得能力'],
    ['傳送星', '碰到後自動飛往另一處'],
  ];
  UI.helpPage = 0;
  UI.HELP_PAGES = 2;
  // 說明頁的左右翻頁（TitleScene / PauseMenu / TitleMenu 顯示說明時每幀呼叫）
  UI.helpUpdate = function () {
    const inp = KB.input;
    if (inp.pressed('right') || inp.pressed('left')) { UI.helpPage = (UI.helpPage + 1) % UI.HELP_PAGES; sfx('menu'); }
  };
  UI.openHelp = function () { UI.helpPage = 0; };
  function drawHelp(ctx, opts) {
    opts = opts || {};
    KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.62)');
    panel(ctx, 6, 6, 244, 188);
    const page = opts.page !== undefined ? (opts.page | 0) : (UI.helpPage | 0);
    T(ctx, '操作說明', 128, 10, { color: C.yellow, align: 'center', size: 16, outline: '#402000' });
    KB.text(ctx, (page + 1) + '/' + UI.HELP_PAGES, 240, 16, { color: C.grey, align: 'right' });
    KB.rect(ctx, 20, 30, 216, 1, '#405070');
    const rows = page === 1 ? UI.HELP2 : ((KB.input && KB.input.HELP) || []);
    const top = 35, bottom = 170, n = Math.max(1, rows.length);
    const gap = Math.max(11, Math.min(18, Math.floor((bottom - top) / n)));
    let y = top + Math.max(0, Math.floor((bottom - top - gap * n) / 2));
    // 兩欄：左欄按鍵（x 12，寬 78）、右欄說明（x 94，寬 152）
    // 同一欄用同一字級（14px 放不下才整欄降 12px），避免每列字級不同看起來參差
    const KW = 88, DW = 146;
    const allFit = (i, w, o) => rows.every(r => TW(r[i], o) <= w);
    const kSize = allFit(0, KW, { size: UI.MS, nomix: true }) ? UI.MS : UI.MS_SMALL;
    const dSize = allFit(1, DW, { size: UI.MS }) ? UI.MS : UI.MS_SMALL;
    for (const [k, d] of rows) {
      fit(ctx, k, 12, y, KW, { color: C.cyan, size: kSize, nomix: true });
      fit(ctx, d, 100, y, DW, { color: '#fff', size: dSize });
      y += gap;
    }
    fit(ctx, '←→ 換頁　　' + (opts.hint || 'M：靜音　　SELECT：返回'), 128, 173, 238, { color: C.grey, align: 'center', size: UI.MS });
  }
  UI.drawHelp = drawHelp;

  class TitleScene {
    constructor() {
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null; this.help = false;
      this.menu = null;
      this.clouds = mkClouds(5, 11, 14, 80); this.stars = mkStars(12, 5, 0, 0, W, 60);
    }
    enter() { UI.newSession(KB.START_LIVES, 0); music('title'); }
    // 從標題進入遊戲：cont=true → 接續（第一個未通關的世界）；否則從 W1 開始
    startGame(cont, extra) {
      let idx = 0;
      if (cont) { idx = KB.LEVELS.findIndex(l => !clearedOf(l.id)); if (idx < 0) idx = KB.LEVELS.length - 1; }
      UI.newSession(KB.START_LIVES, 0, cont ? undefined : !!extra);
      leave(this, () => KB.setScene(new StageSelectScene(Math.max(0, idx))));
    }
    update(dt) {
      this.t += dt; this.frame++;
      if (stepFade(this)) return;
      const inp = KB.input;
      // 按 START 後交給標題選單（menu.js 的 KB.TitleMenu）；沒有 menu.js 時維持舊行為
      if (this.menu) { this.menu.update(this); return; }
      if (inp.pressed('select')) { this.help = !this.help; if (this.help) UI.openHelp(); sfx('menu'); return; }
      if (this.help) { UI.helpUpdate(); }
      if (inp.pressed('start') || inp.pressed('jump')) {
        if (this.help) { this.help = false; sfx('menu'); return; }
        sfx('select');
        if (KB.TitleMenu) { this.menu = new KB.TitleMenu(this); return; }
        this.startGame(true);
      }
    }
    draw(ctx) {
      const t = this.t, f = this.frame;
      if (KB.BG && KB.BG.title) KB.BG.title(ctx, 0, 0, t); else drawTitleBg(ctx, this);
      if (!sprAt(ctx, 'ui_title_logo', 128, 46, 'c')) drawLogoFallback(ctx, 128, 46, t);
      // 卡比在草地上跳動（選單開啟時讓到左邊，不被選單蓋住）
      const groundY = 147, bounce = Math.abs(Math.sin(t * 3.4)) * 12, kx = this.menu ? 56 : 128;
      KB.rect(ctx, kx - 7 + Math.round(bounce / 6), groundY - 1, 14 - Math.round(bounce / 3), 2, 'rgba(0,40,0,0.35)');
      drawKirby(ctx, 'ui_title_kirby', kx, groundY - Math.round(bounce), { t, squash: bounce < 1.2 });
      if ((f % 60) < 42 && !this.help && !this.menu) KB.text(ctx, 'PRESS START', 128, 164, { color: '#fff', align: 'center', outline: '#203040', spacing: 1 });
      // 底部資訊列
      KB.rect(ctx, 0, 184, W, H - 184, C.navy); KB.rect(ctx, 0, 184, W, 1, '#405070');
      fit(ctx, '同人作品　按 M 靜音' + (KB.audio && KB.audio.muted ? '（已靜音）' : ''), 128, 186, 250, { color: '#c8d4e4', align: 'center', size: UI.MS });
      if (!this.menu) fit(ctx, 'SELECT：操作說明　　Z / ENTER：開始', 128, 204, 250, { color: '#7c8ca8', align: 'center', size: UI.MS });
      if (this.menu) this.menu.draw(ctx, this);
      if (this.help) drawHelp(ctx);
      drawMuteToast(ctx); drawFade(ctx, this);
    }
  }
  KB.TitleScene = TitleScene;

  // ---------- 選關地圖 ----------
  function buildPaths(nodes) {
    const paths = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, ay] = nodes[i], [bx, by] = nodes[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, off = (i & 1) ? -18 : 18;
      const cx = mx + nx * off, cy = my + ny * off, pts = [];
      for (let k = 0; k <= 40; k++) { const u = k / 40, v = 1 - u; pts.push([v * v * ax + 2 * v * u * cx + u * u * bx, v * v * ay + 2 * v * u * cy + u * u * by]); }
      paths.push(pts);
    }
    return paths;
  }
  function drawMapBg(ctx, sc) {
    bands(ctx, 0, 72, ['#3c78d8', '#54a0e8', '#78c4f4']);
    KB.circle(ctx, 30, 84, 26, '#9cd0ec'); KB.circle(ctx, 110, 86, 36, '#9cd0ec'); KB.circle(ctx, 200, 82, 30, '#9cd0ec'); KB.circle(ctx, 252, 88, 24, '#9cd0ec');
    drawClouds(ctx, sc.clouds, sc.frame);
    KB.rect(ctx, 0, 72, W, 104, '#3070d0'); KB.rect(ctx, 0, 72, W, 2, '#78c4f4');
    for (let i = 0; i < 26; i++) { const x = (i * 37 + (sc.frame >> 2)) % (W + 20) - 10, y = 80 + (i * 53) % 92; KB.rect(ctx, x, y, 6, 1, '#88b8f0'); }
    const land = [[58, 132, 60], [140, 118, 58], [204, 122, 50], [96, 152, 40], [232, 152, 34]];
    for (const [x, y, r] of land) KB.circle(ctx, x, y, r + 4, '#f0d880');
    for (const [x, y, r] of land) KB.circle(ctx, x, y, r, '#58c048');
    for (const [x, y, r] of land) KB.circle(ctx, x - (r >> 2), y - (r >> 2), r >> 1, '#78d860');
    for (const [x, y] of [[14, 122], [64, 168], [118, 168], [250, 148], [206, 154], [100, 84], [160, 70]]) {
      KB.rect(ctx, x - 1, y - 3, 2, 5, '#805020'); KB.circle(ctx, x, y - 6, 5, '#289028'); KB.circle(ctx, x - 1, y - 7, 3, '#40a840');
    }
  }
  class StageSelectScene {
    constructor(index) {
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.nodes = UI.LAYOUT.mapNodes; this.paths = buildPaths(this.nodes);
      let i = Math.max(0, Math.min(this.nodes.length - 1, index | 0));
      while (i > 0 && !this.canEnter(i)) i--;
      this.cur = i; this.target = -1; this.moveT = 0; this.bump = 0; this.bumpDir = 0; this.facing = 1;
      this.clouds = mkClouds(4, 7, 6, 44);
    }
    level(i) { return KB.LEVELS[i] || null; }
    exists(i) { return !!KB.LEVELS[i]; }
    unlocked(i) { if (UI.unlockAll || i === 0) return true; const prev = KB.LEVELS[i - 1]; return !!(prev && clearedOf(prev.id)); }
    cleared(i) { const l = KB.LEVELS[i]; return !!(l && clearedOf(l.id)); }
    canEnter(i) { return this.exists(i) && this.unlocked(i); }
    themeOf(i) { const l = this.level(i); return (l && l.theme) || KB.THEMES[i] || 'green'; }
    nameOf(i) { const l = this.level(i); return (l && l.name) || KB.THEME_NAMES[this.themeOf(i)] || ('WORLD ' + (i + 1)); }
    enter() { KB.session = KB.session || { lives: KB.START_LIVES, score: 0 }; music('select'); }
    update(dt) {
      this.t += dt; this.frame++;
      if (stepFade(this)) return;
      if (this.bump > 0) this.bump--;
      const inp = KB.input;
      if (this.target >= 0) {
        this.moveT += 1 / 26;
        if (this.moveT >= 1) { this.cur = this.target; this.target = -1; this.moveT = 0; sfx('menu'); }
        return;
      }
      const dir = inp.pressed('right') ? 1 : inp.pressed('left') ? -1 : 0;
      if (dir) {
        const n = this.cur + dir; this.facing = dir;
        if (n >= 0 && n < this.nodes.length && this.canEnter(n)) { this.target = n; this.moveT = 0; sfx('menu'); }
        else { this.bump = 10; this.bumpDir = dir; }
      }
      if (inp.pressed('jump') || inp.pressed('start')) {
        if (this.canEnter(this.cur)) { sfx('select'); const id = this.level(this.cur).id; leave(this, () => KB.setScene(new KB.GameScene(id))); }
        else { this.bump = 10; this.bumpDir = 0; }
      }
      if (inp.pressed('select')) { sfx('menu'); leave(this, () => KB.setScene(new TitleScene())); }
    }
    kirbyPos() {
      if (this.target < 0) return this.nodes[this.cur];
      const seg = Math.min(this.cur, this.target), pts = this.paths[seg];
      const u = (this.cur < this.target ? this.moveT : 1 - this.moveT) * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(u)), f = u - k;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
    }
    drawNode(ctx, i, x, y) {
      const ok = this.canEnter(i), theme = this.themeOf(i), cleared = this.cleared(i), lv = this.level(i);
      KB.rect(ctx, x - 7, y + 5, 14, 2, 'rgba(0,40,0,0.3)');
      if (!ok) {
        // 鎖定 / 尚未製作：灰色節點 + 鎖
        if (!sprAt(ctx, 'ui_map_node', x, y, 'c', { frame: 0 })) sprAt(ctx, 'uifb_node_locked', x, y, 'c');
        sprAt(ctx, pick('ui_lock', 'uifb_lock'), x, y - 1, 'c');
        return;
      }
      // 可進入：主題色節點（缺圖時用 ui_map_node）
      if (has('uifb_node_' + theme)) sprAt(ctx, 'uifb_node_' + theme, x, y, 'c');
      else sprAt(ctx, pick('ui_map_node', 'uifb_node'), x, y, 'c', { frame: 0 });
      // 已通關：插旗
      if (cleared) { if (!sprAt(ctx, 'ui_map_flag', x + 10, y + 3, 'b')) sprAt(ctx, 'uifb_flag', x + 8, y - 9, 'tl'); }
      // 節點下方：收集星 ★ x/3（levels-bosses 提供 KB.save.stars[levelId]）
      if (lv) drawStarRow(ctx, x, y + 9, lv.id, { count: false });
    }
    draw(ctx) {
      const f = this.frame, nodes = this.nodes;
      if (KB.BG && KB.BG.map) KB.BG.map(ctx, 0, 0, this.t); else drawMapBg(ctx, this);
      // 路徑（虛線）
      for (let i = 0; i < this.paths.length; i++) {
        const ok = this.canEnter(i + 1);
        dottedPath(ctx, this.paths[i], ok ? '#fff8e8' : 'rgba(20,30,50,0.45)', 6, ok ? (f >> 1) : 0);
      }
      // 節點與標籤（標籤加深色底板，比描邊乾淨，12px 中文才不會糊成一團）
      for (let i = 0; i < nodes.length; i++) {
        const [x, y] = nodes[i], ok = this.canEnter(i);
        this.drawNode(ctx, i, x, y);
        const label = 'W' + (i + 1), name = this.nameOf(i);
        const lw = KB.textWidth(label), nw = TW(name, { size: UI.MS }), tw = lw + 4 + nw;
        const sx = Math.max(8, Math.min(W - 8 - tw, Math.round(x - tw / 2)));
        const col = ok ? '#fff' : '#b0b8c8';
        KB.rect(ctx, sx - 2, y - 33, tw + 4, 18, 'rgba(8,14,28,0.7)');
        KB.text(ctx, label, sx, y - 28, { color: ok ? C.yellow : col });
        T(ctx, name, sx + lw + 4, y - 32, { color: col, size: UI.MS });
      }
      // 卡比
      const [kx, ky] = this.kirbyPos();
      let hop = 0, bx = 0;
      if (this.target >= 0) hop = Math.abs(Math.sin(this.moveT * Math.PI * 4)) * 3;
      if (this.bump > 0) { bx = this.bumpDir * (this.bump > 5 ? 2 : 1); hop = this.bump > 5 ? 2 : 0; }
      KB.rect(ctx, kx - 6, ky + 2, 12, 2, 'rgba(0,30,0,0.35)');
      drawKirby(ctx, 'ui_map_kirby', Math.round(kx + bx), Math.round(ky + 3 - hop), { t: this.t, flip: this.facing < 0 });
      // 上方：標題 / 生命 / 分數
      KB.text(ctx, 'STAGE SELECT', 8, 5, { color: '#fff', outline: C.dark, spacing: 1 });
      KB.rect(ctx, 6, 14, TW('選擇關卡', { size: UI.MS }) + 4, 17, 'rgba(8,14,28,0.6)'); T(ctx, '選擇關卡', 8, 15, { color: C.yellow, size: UI.MS });
      const ses = KB.session || { lives: KB.START_LIVES, score: 0 };
      sprAt(ctx, pick('ui_kirby_face', 'uifb_face'), 216, 3, 'tl');
      KB.text(ctx, 'x' + Math.max(0, ses.lives | 0), 250, 7, { color: '#fff', align: 'right', outline: C.dark });
      KB.text(ctx, 'SCORE ' + pad7(ses.score), 250, 22, { color: '#fff', align: 'right', outline: C.dark });
      // 下方資訊面板：第 1 列 關卡名 / 第 2 列 收集星 + 狀態 / 第 3 列 操作提示
      panel(ctx, 8, 158, 240, 60);
      const i = this.cur, ok = this.canEnter(i), lv = this.level(i);
      KB.text(ctx, 'W' + (i + 1), 16, 167, { color: C.yellow });
      T(ctx, this.nameOf(i), 38, 162, { color: '#fff', size: 16 });
      if (!this.exists(i)) T(ctx, '製作中…', 240, 164, { color: C.grey, align: 'right', size: UI.MS });
      else if (!ok) { sprAt(ctx, pick('ui_lock', 'uifb_lock'), 188, 166, 'tl'); T(ctx, '未解鎖', 240, 164, { color: C.grey, align: 'right', size: UI.MS }); }
      else if (this.cleared(i)) { sprAt(ctx, 'uifb_flag', 196, 164, 'tl'); KB.text(ctx, 'CLEAR', 240, 167, { color: C.yellow, align: 'right' }); }
      else T(ctx, '出發！', 240, 164, { color: C.cyan, align: 'right', size: UI.MS });
      // 第 2 列：收集星（本關）
      if (lv) { T(ctx, '收集星', 16, 180, { color: '#c8d8f0', size: UI.MS }); drawStarRow(ctx, 64, 184, lv.id, { plate: false, left: true }); }
      // 最佳分數（結算畫面寫入 KB.save.best[levelId]）
      if (lv) {
        const best = (KB.save && KB.save.best && KB.save.best[lv.id]) | 0;
        KB.text(ctx, 'BEST', 130, 181, { color: '#98a8c0' });
        KB.text(ctx, pad7(best), 240, 181, { color: best > 0 ? C.yellow : '#5c6884', align: 'right' });
      }
      fit(ctx, '←→ 移動　Z 進入　SELECT 回標題', 128, 197, 234, { color: C.grey, align: 'center', size: UI.MS });
      drawMuteToast(ctx); drawFade(ctx, this);
    }
  }
  KB.StageSelectScene = StageSelectScene;

  // ---------- HUD ----------
  function drawAbilityIconFallback(ctx, x, y, key, hud) {
    const col = key ? (ICON_COL[key] || '#f8a0c8') : '#303848';
    KB.rect(ctx, x, y, 24, 16, '#181c28'); KB.rect(ctx, x + 1, y + 1, 22, 14, col);
    ctx.globalAlpha = 0.35; KB.rect(ctx, x + 1, y + 1, 22, 1, '#fff'); KB.rect(ctx, x + 1, y + 1, 1, 14, '#fff'); ctx.globalAlpha = 0.3;
    KB.rect(ctx, x + 1, y + 14, 22, 1, '#000'); KB.rect(ctx, x + 22, y + 1, 1, 14, '#000'); ctx.globalAlpha = 1;
    if (key) KB.text(ctx, hud.charAt(0), x + 12, y + 4, { color: '#fff', align: 'center', outline: '#181c28' });
    else sprAt(ctx, pick('ui_kirby_face', 'uifb_face'), x + 12, y + 8, 'c');
  }
  KB.drawHUD = function (ctx, game) {
    const L = UI.LAYOUT.hud, p = game.player, f = game.frame || 0;
    KB.rect(ctx, 0, HUD_Y, W, H - HUD_Y, '#000'); KB.rect(ctx, 0, HUD_Y, W, 1, '#384058');
    // 左：能力圖示 + 名稱
    const key = p && p.ability, def = key && KB.ABILITIES ? KB.ABILITIES[key] : null;
    const iconName = key ? ((def && def.icon) || ('ui_ability_' + key)) : 'ui_ability_none';
    const hud = key ? ((def && def.hudName) || KB.ABILITY_HUD[key] || String(key).toUpperCase()) : 'NORMAL';
    const cn = key ? ((def && def.name) || KB.ABILITY_NAMES[key] || '') : '普通';
    if (!sprAt(ctx, iconName, L.iconX, L.iconY, 'tl')) drawAbilityIconFallback(ctx, L.iconX, L.iconY, key, hud);
    if (game.abilityFlash > 0) {
      // 剛取得能力：圖示外框黃白閃爍 + 名稱閃爍
      const on = (game.abilityFlash >> 2) & 1, c = on ? '#fff' : C.yellow, x = L.iconX - 2, y = L.iconY - 2;
      KB.rect(ctx, x, y, 28, 1, c); KB.rect(ctx, x, y + 19, 28, 1, c); KB.rect(ctx, x, y, 1, 20, c); KB.rect(ctx, x + 27, y, 1, 20, c);
      if (on) { ctx.globalAlpha = 0.4; KB.rect(ctx, L.iconX, L.iconY, 24, 16, '#fff'); ctx.globalAlpha = 1; }
    }
    const flashName = game.abilityFlash > 0 && ((game.abilityFlash >> 2) & 1);
    KB.text(ctx, hud, L.nameX, L.rowA, { color: flashName ? C.yellow : '#fff' });
    // 中文能力名：14px（12px 時「鐵鎚」這種密集字會糊）
    T(ctx, cn, L.nameX, L.rowB, { color: flashName ? '#fff' : '#ffc8dc', size: UI.MS });
    // 中：血量
    const maxHp = p ? p.maxHp : KB.MAX_HP, hp = p ? Math.max(0, p.hp) : 0;
    const hurting = p && p.state !== 'dead' && p.invuln > KB.PHYS.invulnFrames - 30;
    // 低血量警示：HP ≤ 1 時每 90 幀一聲（audio agent 提供 sfx('lowhp')）
    if (p && p.state !== 'dead' && hp > 0 && hp <= 1 && f % 90 === 0) sfx('lowhp');
    for (let i = 0; i < maxHp; i++) {
      let full = i < hp; const o = {};
      if (hurting && i === hp && ((f >> 2) & 1)) { full = true; o.tint = '#fff'; }
      if (full && hp === 1 && i === 0 && ((f >> 3) & 1)) o.tint = '#fff';
      sprAt(ctx, full ? pick('ui_hp_full', 'uifb_hp_full') : pick('ui_hp_empty', 'uifb_hp_empty'), L.hpX + i * L.hpGap, L.hpY, 'tl', o);
    }
    // 右：上列分數、下列生命（卡比臉 + xN）
    if (game.arena) {
      // 競技場：上列 ARENA n/5、下列計時，右下角換成剩餘番茄數
      const a = game.arena, n = Math.min(a.order.length, (a.idx | 0) + (a.phase === 'rest' ? 2 : 1));
      KB.text(ctx, 'ARENA ' + n + '/' + a.order.length, L.right, L.rowA, { color: C.yellow, align: 'right' });
      KB.text(ctx, mmss((a.base | 0) + (game.timeAlive | 0)), 210, L.rowB, { color: C.cyan, align: 'right' });   // 魔王血條佔 x 66~156，計時靠右放
      if (!sprAt(ctx, 'item_tomato', L.faceX + 7, L.faceY + 15, 'b')) KB.rect(ctx, L.faceX + 2, L.faceY + 4, 10, 10, '#e83030');
      KB.text(ctx, 'x' + Math.max(0, a.tomatoes | 0), L.right, L.livesY, { color: '#fff', align: 'right' });
    } else {
      KB.text(ctx, 'SCORE ' + pad7(game.score), L.right, L.rowA, { color: '#fff', align: 'right' });
      sprAt(ctx, pick('ui_kirby_face', 'uifb_face'), L.faceX, L.faceY, 'tl');
      KB.text(ctx, 'x' + Math.max(0, game.lives | 0), L.right, L.livesY, { color: '#fff', align: 'right' });
    }
    drawMuteToast(ctx);
  };

  // ---------- 魔王血條（HUD 中央、卡比血量正下方） ----------
  KB.drawBossBar = function (ctx, boss) {
    const L = UI.LAYOUT.bossBar, max = Math.max(1, boss.maxHp || 1), hp = Math.max(0, Math.min(max, boss.hp));
    if (boss._barShown === undefined) { boss._barShown = hp; boss._barLastHp = hp; boss._barHold = 0; }
    if (hp < boss._barLastHp) boss._barHold = 20;
    if (hp > boss._barShown) boss._barShown = hp;
    boss._barLastHp = hp;
    if (boss._barShown > hp) { if (boss._barHold > 0) boss._barHold--; else boss._barShown = Math.max(hp, boss._barShown - max / 45); }
    let bw = L.w, bh = L.h, inset = 2;
    const useSpr = has('ui_boss_bar');
    if (useSpr) { const s = KB.SPR.ui_boss_bar; bw = s.w; bh = s.h; inset = s.inset || 2; }
    else { bw = 60; bh = 8; inset = 1; }
    const bx = Math.round(L.cx - bw / 2), by = L.y;
    if (useSpr) sprAt(ctx, 'ui_boss_bar', bx, by, 'tl');
    else { KB.rect(ctx, bx, by, bw, bh, '#f0f0f0'); KB.rect(ctx, bx + 1, by + 1, bw - 2, bh - 2, '#202028'); }
    const iw = bw - inset * 2, ih = bh - inset * 2;
    const wShown = Math.round(iw * boss._barShown / max), wHp = Math.round(iw * hp / max);
    if (wShown > wHp) KB.rect(ctx, bx + inset + wHp, by + inset, wShown - wHp, ih, '#ffffff');
    if (wHp > 0) {
      const low = hp / max <= 0.25 && ((KB.frameCount >> 3) & 1);
      KB.rect(ctx, bx + inset, by + inset, wHp, ih, low ? '#ff7070' : '#e83030');
      KB.rect(ctx, bx + inset, by + inset, wHp, 1, '#ff9898');
      if (ih > 2) KB.rect(ctx, bx + inset, by + inset + ih - 1, wHp, 1, '#a01818');
    }
  };

  // ---------- 暫停 ----------
  KB.drawPause = function (ctx, game) {
    KB.rect(ctx, 0, 0, W, VH, 'rgba(0,0,0,0.55)');
    panel(ctx, 64, 50, 128, 92);
    bigText(ctx, 'PAUSE', 128, 58, 2, { color: C.yellow, outline: '#402000', align: 'center' });
    KB.rect(ctx, 78, 78, 100, 1, '#405070');
    const opts = ['繼續', '回到地圖'];
    for (let i = 0; i < opts.length; i++) {
      const y = 84 + i * 17, sel = game.pauseSel === i;
      if (sel) cursor(ctx, 90, y + 2, game.frame || 0);
      T(ctx, opts[i], 104, y, { color: sel ? C.yellow : '#fff', size: UI.MS });
    }
    T(ctx, '↑↓ 選擇　Z 確認', 128, 121, { color: C.grey, align: 'center', size: 12 });
  };

  // ---------- 關卡開場橫幅（WORLD n + 關名）----------
  // 進入關卡第一房時滑入 → 停 90 幀 → 滑出；純繪製，完全不阻擋操作。
  const BANNER = { slideIn: 20, hold: 90, slideOut: 20, dist: 320 };
  const bn = { game: null, start: -1e9 };
  UI.resetLevelBanner = function () { bn.game = null; bn.start = -1e9; };
  UI.drawLevelBanner = function (ctx, game) {
    if (bn.game !== game) {
      bn.game = game;
      // 以 game.frame 計時（截圖工具只在最後 render 一次，用畫面次數計時會不準）
      const ok = game.roomIdx === 0 && !game.arena && !(game.room && game.room.secret);
      bn.start = ok ? 0 : -1e9;
      // 開場音：audio2 指定用 sfx('select')（music('w_intro') 會蓋掉關卡曲，不使用）
      if (ok) sfx('select');
    }
    if (game.paused || game.clearT >= 0) return;
    const age = (game.frame || 0) - bn.start, span = BANNER.slideIn + BANNER.hold + BANNER.slideOut;
    if (age < 0 || age > span) return;
    let off = 0;
    if (age < BANNER.slideIn) { const u = age / BANNER.slideIn; off = -BANNER.dist * Math.pow(1 - u, 3); }
    else if (age > BANNER.slideIn + BANNER.hold) { const u = (age - BANNER.slideIn - BANNER.hold) / BANNER.slideOut; off = BANNER.dist * u * u * u; }
    const x = Math.round(23 + off);
    const n = Math.max(0, KB.LEVELS.indexOf(game.level)) + 1, name = (game.level && game.level.name) || '';
    panel(ctx, x, 32, 210, 48, 'rgba(10,16,34,0.88)');
    bigText(ctx, 'WORLD ' + n, x + 105, 37, 2, { color: C.yellow, outline: '#603000', shadow: '#a06000', align: 'center', spacing: 1 });
    KB.rect(ctx, x + 12, 57, 186, 1, '#405070');
    fit(ctx, name, x + 105, 60, 190, { color: '#fff', align: 'center', size: 16 });
  };

  // ---------- 過關結算（KB.ResultScene）----------
  // 過關舞蹈結束（game.clearT === 220）後由 game.js 切換過來；結束時呼叫 game.gotoNext()。
  const STAR_BONUS = 1000, HP_BONUS = 100;
  function mmss(frames) {
    const s = Math.max(0, Math.floor((frames || 0) / 60));
    return String(Math.floor(s / 60) % 100).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  UI.mmss = mmss;

  class ResultScene {
    constructor(game) {
      this.game = game || null;
      const g = this.game;
      this.levelId = (g && g.levelId) || (KB.LEVELS[0] && KB.LEVELS[0].id) || 'w1';
      this.levelIdx = g && g.level ? Math.max(0, KB.LEVELS.indexOf(g.level)) : 0;
      this.levelName = (g && g.level && g.level.name) || '';
      const score = g ? Math.max(0, g.score | 0) : 0;
      const hp = g && g.player ? Math.max(0, g.player.hp | 0) : 0;
      const sc = starCount(this.levelId);
      this.rows = [
        { label: 'SCORE', bm: true, val: score, fmt: pad7, color: '#fff' },
        { label: 'TIME', bm: true, val: g ? Math.max(0, g.timeAlive | 0) : 0, fmt: mmss, color: '#fff' },
        { label: '擊敗敵人', val: g ? Math.max(0, g.kills | 0) : 0, fmt: n => 'x' + n, color: '#fff' },
        { label: '大星星 ★' + sc + '/' + UI.STAR_MAX, val: sc * STAR_BONUS, fmt: n => '+' + n, color: C.yellow },
        { label: 'HP 獎勵 ' + hp + '×' + HP_BONUS, val: hp * HP_BONUS, fmt: n => '+' + n, color: C.yellow },
      ];
      this.total = score + sc * STAR_BONUS + hp * HP_BONUS;
      this.prevBest = (KB.save && KB.save.best && KB.save.best[this.levelId]) | 0;
      this.newBest = this.total > this.prevBest;
      this.cur = this.rows.map(() => 0); this.curTotal = 0;
      this.i = 0; this.hold = 0; this.tick = 0; this.done = false; this.saved = false;
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.stars = mkStars(36, 33, 0, 0, W, H);
      this.conf = [];
      for (let i = 0; i < 24; i++) this.conf.push({ x: Math.random() * W, y: Math.random() * H, vy: 0.25 + Math.random() * 0.5, ph: Math.random() * 6.28, c: ['#ffe040', '#ffb0d0', '#80e0ff', '#a0f0a0'][i & 3] });
    }
    enter() { music(KB.audio && KB.audio.SONGS && KB.audio.SONGS.result ? 'result' : 'clear'); }
    finish() {
      if (this.done) return;
      this.done = true;
      if (!this.saved) {
        this.saved = true;
        try {
          if (KB.save) {
            KB.save.best = KB.save.best || {};
            KB.save.best[this.levelId] = Math.max(this.prevBest, this.total);
            KB.saveGame && KB.saveGame();
          }
        } catch (e) { }
        if (this.newBest) sfx('bigstar');
      }
    }
    finishAll() {
      for (let i = 0; i < this.rows.length; i++) this.cur[i] = this.rows[i].val;
      this.i = this.rows.length; this.curTotal = this.total;
      sfx('count_end'); this.finish();
    }
    exitScene() {
      const g = this.game, idx = this.levelIdx;
      leave(this, () => {
        if (g && g.gotoNext) g.gotoNext();
        else KB.setScene(new StageSelectScene(Math.min(KB.LEVELS.length - 1, idx + 1)));
      });
    }
    update(dt) {
      this.t += dt; this.frame++;
      for (const q of this.conf) { q.y += q.vy; q.x += Math.sin(this.t * 2 + q.ph) * 0.3; if (q.y > H) { q.y = -4; q.x = Math.random() * W; } }
      if (stepFade(this)) return;
      const inp = KB.input;
      if (inp.pressed('jump') || inp.pressed('start') || inp.pressed('attack')) {
        if (!this.done) { this.finishAll(); return; }
        if (this.frame > 8) { sfx('select'); this.exitScene(); return; }
      }
      if (this.done || this.frame < 26) return;
      if (this.hold > 0) { this.hold--; return; }
      if (this.i < this.rows.length) {
        const r = this.rows[this.i], tgt = r.val;
        if (tgt <= 0) { this.i++; this.hold = 6; sfx('count_end'); return; }
        this.cur[this.i] = Math.min(tgt, this.cur[this.i] + Math.max(1, tgt * 0.03));
        if ((++this.tick) % 4 === 0) sfx('count');
        if (this.cur[this.i] >= tgt) { this.cur[this.i] = tgt; this.i++; this.hold = 10; sfx('count_end'); }
        return;
      }
      if (this.curTotal < this.total) {
        this.curTotal = Math.min(this.total, this.curTotal + Math.max(1, this.total * 0.03));
        if ((++this.tick) % 4 === 0) sfx('count');
        if (this.curTotal >= this.total) { this.curTotal = this.total; sfx('count_end'); this.finish(); }
        return;
      }
      this.finish();
    }
    draw(ctx) {
      const f = this.frame, ms = UI.MS;
      bands(ctx, 0, H, ['#0c1430', '#141c48', '#1a2458', '#202c68']);
      drawStars(ctx, this.stars, this.t);
      for (const q of this.conf) KB.rect(ctx, Math.round(q.x), Math.round(q.y), 2, 3, q.c);
      bigText(ctx, 'STAGE CLEAR', 128, 2, 2, { color: C.yellow, outline: '#603000', shadow: '#a06000', align: 'center', spacing: 1 });
      KB.text(ctx, 'W' + (this.levelIdx + 1), 10, 29, { color: C.cyan, outline: C.dark });
      fit(ctx, this.levelName, 32, 24, 214, { color: '#fff', size: 16 });
      panel(ctx, 8, 40, 240, 150);
      // 逐項：已開始滾動的才顯示
      for (let i = 0; i < this.rows.length; i++) {
        const r = this.rows[i], y = 48 + i * 18;
        if (i > this.i) continue;
        if (r.bm) KB.text(ctx, r.label, 18, y + 3, { color: '#c8d8f0' });
        else fit(ctx, r.label, 18, y, 140, { color: '#c8d8f0', size: ms });
        KB.text(ctx, r.fmt(Math.floor(this.cur[i])), 238, y + 3, { color: r.color, align: 'right' });
      }
      KB.rect(ctx, 16, 138, 224, 1, '#405070');
      if (this.i >= this.rows.length) {
        KB.text(ctx, 'TOTAL', 18, 148, { color: C.yellow, outline: '#402000' });
        bigText(ctx, pad7(Math.floor(this.curTotal)), 238, 142, 2, { color: '#fff', outline: '#203050', align: 'right' });
      }
      if (this.done) {
        KB.text(ctx, 'BEST', 18, 170, { color: '#98a8c0' });
        KB.text(ctx, pad7(Math.max(this.prevBest, this.total)), 238, 170, { color: this.newBest ? C.pink : '#c8d8f0', align: 'right' });
        if (this.newBest && ((f >> 3) & 1)) KB.text(ctx, 'NEW!', 60, 170, { color: C.yellow });
        if ((f % 60) < 42) fit(ctx, 'Z / ENTER：繼續', 128, 196, 240, { color: '#fff', align: 'center', size: ms });
      } else fit(ctx, 'Z / ENTER：跳過', 128, 196, 240, { color: C.grey, align: 'center', size: ms });
      drawMuteToast(ctx); drawFade(ctx, this);
    }
  }
  KB.ResultScene = ResultScene;

  // ---------- Game Over ----------
  class GameOverScene {
    constructor(game) {
      this.game = game || null;
      this.score = game ? game.score : (KB.session ? KB.session.score : 0);
      this.levelIdx = game && game.level ? Math.max(0, KB.LEVELS.indexOf(game.level)) : 0;
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null; this.sel = 0;
    }
    enter() { music('gameover'); }
    update(dt) {
      this.t += dt; this.frame++;
      if (stepFade(this)) return;
      if (this.frame < 20) return;
      const inp = KB.input;
      if (inp.pressed('up') || inp.pressed('down')) { this.sel ^= 1; sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('start')) {
        sfx('select');
        if (this.sel === 0) { const idx = this.levelIdx; leave(this, () => { UI.newSession(KB.START_LIVES, 0); KB.setScene(new StageSelectScene(idx)); }); }
        else leave(this, () => KB.setScene(new TitleScene()));
      }
    }
    draw(ctx) {
      const f = this.frame;
      KB.rect(ctx, 0, 0, W, H, '#000');
      KB.circle(ctx, 128, 110, 40, '#0c0c18'); KB.circle(ctx, 128, 110, 28, '#141424');
      bigText(ctx, 'GAME OVER', 128, 30, 2, { color: '#f04040', outline: '#400000', shadow: '#901818', align: 'center', spacing: 1 });
      // 哭泣的卡比
      const ky = 120 + ((f >> 4) & 1);
      if (has('kirby_hurt')) sprAt(ctx, 'kirby_hurt', 128, ky, 'b', {}); else drawKirby(ctx, null, 128, ky, {});
      for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) {
        const y = ky - 12 + ((f * 1.5 + j * 8 + k * 4) % 24), x = 128 + (k ? 4 : -6) + (k ? j : -j);
        KB.rect(ctx, x, y, 2, 3, '#60c0ff');
      }
      KB.text(ctx, 'SCORE ' + pad7(this.score), 128, 134, { color: '#fff', align: 'center' });
      const opts = ['回到地圖', '回到標題'];
      for (let i = 0; i < 2; i++) {
        const y = 154 + i * 18, sel = this.sel === i;
        if (sel) cursor(ctx, 92, y + 2, f);
        T(ctx, opts[i], 106, y, { color: sel ? C.yellow : '#fff', size: UI.MS });
      }
      fit(ctx, '回到地圖：生命與分數重置', 128, 195, 244, { color: '#8890a8', align: 'center', size: UI.MS });
      drawMuteToast(ctx); drawFade(ctx, this);
    }
  }
  KB.GameOverScene = GameOverScene;

  // ---------- 結局 ----------
  class EndingScene {
    constructor(game) {
      this.game = game || null;
      this.score = game ? game.score : (KB.session ? KB.session.score : 0);
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.lines = [
        { s: '和平回到了普普星！', size: 16, color: C.yellow, y: 12 },
        { s: '感謝遊玩', size: 16, color: '#fff', y: 38 },
        { s: '本作為同人致敬作品', size: 14, color: '#c8d8f0', y: 60 },
        { s: '所有美術與音樂皆為原創', size: 14, color: '#c8d8f0', y: 76 },
        { s: 'FINAL SCORE ' + pad7(this.score), size: 8, color: '#fff', y: 96 },
      ];
      this.gapUnits = 8; this.reveal = 0;
      this.total = this.lines.reduce((a, l) => a + l.s.length + this.gapUnits, 0);
      this.stars = mkStars(48, 21, 0, 0, W, 130); this.sparks = [];
    }
    enter() { music('ending'); try { if (KB.save) { KB.save.ending = true; KB.saveGame && KB.saveGame(); } } catch (e) { } }
    get done() { return this.reveal >= this.total; }
    update(dt) {
      this.t += dt; this.frame++;
      if (stepFade(this)) return;
      if (this.frame > 40 && !this.done) this.reveal += 1 / 3;
      if (this.frame % 6 === 0) this.sparks.push({ x: 128 + (Math.random() - 0.5) * 70, y: 148 - Math.random() * 40, vy: -0.3 - Math.random() * 0.4, life: 40 + Math.random() * 20, c: ['#fff', '#ffe040', '#ffb0d0', '#80e0ff'][Math.floor(Math.random() * 4)] });
      for (const s of this.sparks) { s.y += s.vy; s.life--; }
      this.sparks = this.sparks.filter(s => s.life > 0);
      const inp = KB.input;
      if (inp.pressed('start') || inp.pressed('jump')) {
        if (!this.done) { this.reveal = this.total; sfx('menu'); }
        else if (this.frame > 60) { sfx('select'); leave(this, () => KB.setScene(new TitleScene())); }
      }
    }
    draw(ctx) {
      const t = this.t, f = this.frame;
      bands(ctx, 0, 150, ['#0c1430', '#141c48', '#1c2860', '#243878', '#2c4890']);
      drawStars(ctx, this.stars, t);
      KB.circle(ctx, 214, 30, 11, '#fff8d0'); KB.circle(ctx, 210, 28, 3, '#e8e0b0'); KB.circle(ctx, 218, 34, 2, '#e8e0b0');
      KB.circle(ctx, 30, 160, 44, '#1c4830'); KB.circle(ctx, 120, 166, 56, '#1c4830'); KB.circle(ctx, 220, 162, 46, '#1c4830');
      KB.rect(ctx, 0, 146, W, 4, '#3a8848'); KB.rect(ctx, 0, 150, W, 74, '#2a6838'); KB.rect(ctx, 0, 176, W, 48, '#204c2c');
      for (let x = 4; x < W; x += 17) { const c = (x / 17 | 0) % 3; KB.rect(ctx, x, 142 + (x % 5), 1, 4, '#58a860'); KB.rect(ctx, x - 1, 141 + (x % 5), 3, 2, c === 0 ? '#ffd0e0' : c === 1 ? '#ffe878' : '#a0d8ff'); }
      // 火花
      for (const s of this.sparks) { ctx.globalAlpha = Math.min(1, s.life / 20); KB.rect(ctx, s.x, s.y, 2, 2, s.c); }
      ctx.globalAlpha = 1;
      // 跳舞的卡比
      const gy = 148;
      if (has('kirby_dance')) sprAt(ctx, 'kirby_dance', 128, gy, 'b', { t, fps: 6 });
      else { const hop = Math.abs(Math.sin(f / 10)) * 8; drawKirby(ctx, null, 128, gy - Math.round(hop), { flip: ((f / 20) | 0) & 1, squash: hop < 1 }); }
      // 逐行文字
      let acc = 0;
      for (const l of this.lines) {
        const n = Math.max(0, Math.min(l.s.length, Math.floor(this.reveal - acc)));
        if (n > 0) T(ctx, l.s.slice(0, n), 128, l.y, { color: l.color, align: 'center', size: l.size, outline: '#101830' });
        acc += l.s.length + this.gapUnits;
      }
      if (this.done) {
        bigText(ctx, 'THE END', 128, 108, 2, { color: '#fff', outline: '#101830', align: 'center', spacing: 1 });
        if ((f % 60) < 42) KB.text(ctx, 'PRESS START', 128, 200, { color: '#fff', align: 'center', outline: '#102018', spacing: 1 });
      }
      drawMuteToast(ctx); drawFade(ctx, this);
    }
  }
  KB.EndingScene = EndingScene;
})();
