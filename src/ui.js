// UI：標題畫面 / 選關地圖 / HUD / 魔王血條 / 暫停 / Game Over / 結局
// 所有精靈皆先以 KB.has 檢查；缺圖時改用本檔註冊的 uifb_* 備援圖或純繪圖，畫面本身就要完整好看。
// 版面常數集中在 KB.UI.LAYOUT，美術 / game.js 可依此對齊。
// 文字：ASCII 走 8×8 點陣字；中文一律 12px / 16px 細明體（有內嵌點陣，轉像素後仍清晰；8~10px 中文不可讀）。
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
    mapNodes: [[30, 148], [80, 104], [128, 140], [176, 88], [226, 124]],
  };
  const C = { navy: '#101828', panel: '#182038', border: '#f0f0f8', yellow: '#ffe040', pink: '#ffb0d0', grey: '#98a8c0', dark: '#202838', cyan: '#80e0ff' };
  const pad7 = n => String(Math.max(0, Math.floor(n || 0))).padStart(7, '0');
  const has = n => !!(KB.SPR && KB.SPR[n]);
  const pick = (a, b) => (has(a) ? a : b);
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };
  const clearedOf = id => !!(KB.save && KB.save.cleared && KB.save.cleared[id]);

  // ---------- 文字工具 ----------
  // 中文字型：細明體系列在 12 / 16px 有內嵌點陣，轉像素後最清楚；缺字型時退回正黑體 / 蘋方 / Noto。
  const ZH = '"MingLiU","PMingLiU","SimSun","NSimSun","MS Gothic","Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif';
  UI.zhFont = s => s + 'px ' + ZH;
  const bitmapOK = s => String(s).split('').every(ch => KB.FONT[ch] || ch === ' ');
  function zhOpts(str, o) {
    o = o || {};
    if (o.font) return o;
    const size = o.size || 8;
    if (size === 8 && bitmapOK(str)) return o;          // 純 ASCII → 點陣字
    const s = size < 11 ? 12 : size;                      // 中文最小 12px
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
  // 與 KB.text 同介面；含中文時自動套用細明體並將字級提升到 ≥12；12px 時英數混排點陣字
  function T(ctx, str, x, y, o) {
    o = zhOpts(str, o);
    if (o.size !== 12 || !o.font || o.nomix) return KB.text(ctx, str, x, y, o);
    const rs = runs(str); if (!isMixed(rs)) return KB.text(ctx, str, x, y, o);
    const ws = rs.map(r => runWidth(r, o)), total = ws.reduce((a, b) => a + b, 0);
    let sx = Math.round(x); if (o.align === 'center') sx = Math.round(x - total / 2); else if (o.align === 'right') sx = Math.round(x - total);
    rs.forEach((r, i) => {
      if (r.bm) KB.text(ctx, r.s, sx, y + 3, { color: o.color, outline: o.outline, shadow: o.shadow });
      else KB.text(ctx, r.s, sx, y, { color: o.color, size: o.size, font: o.font, outline: o.outline, shadow: o.shadow });
      sx += ws[i];
    });
    return total;
  }
  function TW(str, o) {
    o = zhOpts(str, o);
    if (o.size !== 12 || !o.font || o.nomix) return KB.textWidth(str, o);
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
  reg('uifb_node', [
    '....kkkkkkkk....', '..kkhhhhhhhhkk..', '.khhhgggggggggk.', 'khhgggggggggggGk', 'khggggggggggggGk', 'kggggggggggggGGk',
    'kgggggggggggGGGk', 'kGgggggggggGGGGk', 'kGGggggggGGGGGGk', '.kGGGGGGGGGGGGk.', '..kkGGGGGGGGkk..', '....kkkkkkkk....']);
  const NODE_COL = {
    green: ['#58d048', '#289028', '#98f070'], castle: ['#9098b0', '#585878', '#c8ccd8'], island: ['#f0d880', '#c09848', '#fff4c0'],
    cloud: ['#a0c8f8', '#6888d8', '#e8f0ff'], dedede: ['#d84848', '#902020', '#f09090'], locked: ['#606870', '#383c48', '#808890'],
  };
  for (const k in NODE_COL) { const [g, G, h] = NODE_COL[k]; if (!KB.SPR['uifb_node_' + k]) KB.spriteRecolor('uifb_node', 'uifb_node_' + k, { '#58d048': g, '#289028': G, '#98f070': h }); }
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
    KB.rect(ctx, 88, VH - 26, 80, 18, 'rgba(0,0,0,0.65)');
    T(ctx, muted ? '靜音：開' : '靜音：關', 128, VH - 24, { color: muted ? C.yellow : '#fff', align: 'center', size: 12 });
  }
  // M 鍵靜音由 audio.js 切換（KB.audio.toggleMute）；UI 層只負責顯示提示（避免重複切換而互相抵銷）
  window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && KB.audio) UI.muteToast = 90; });

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
  function drawHelp(ctx) {
    KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.62)');
    panel(ctx, 6, 6, 244, 188);
    T(ctx, '操作說明', 128, 11, { color: C.yellow, align: 'center', size: 16, outline: '#402000' });
    KB.rect(ctx, 20, 31, 216, 1, '#405070');
    const rows = (KB.input && KB.input.HELP) || [];
    let y = 36;
    // 兩欄空間有限：整列用細明體（nomix），避免點陣英數把欄位撐爆
    for (const [k, d] of rows) { T(ctx, k, 14, y, { color: C.cyan, size: 12, nomix: true }); T(ctx, d, 104, y, { color: '#fff', size: 12, nomix: true }); y += 18; }
    T(ctx, 'M：靜音　　SELECT：返回', 128, 172, { color: C.grey, align: 'center', size: 12 });
  }

  class TitleScene {
    constructor() {
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null; this.help = false;
      this.clouds = mkClouds(5, 11, 14, 80); this.stars = mkStars(12, 5, 0, 0, W, 60);
    }
    enter() { KB.session = { lives: KB.START_LIVES, score: 0 }; music('title'); }
    update(dt) {
      this.t += dt; this.frame++;
      if (stepFade(this)) return;
      const inp = KB.input;
      if (inp.pressed('select')) { this.help = !this.help; sfx('menu'); return; }
      if (inp.pressed('start') || inp.pressed('jump')) {
        if (this.help) { this.help = false; sfx('menu'); return; }
        sfx('select');
        let idx = KB.LEVELS.findIndex(l => !clearedOf(l.id));
        if (idx < 0) idx = KB.LEVELS.length - 1;
        leave(this, () => KB.setScene(new StageSelectScene(Math.max(0, idx))));
      }
    }
    draw(ctx) {
      const t = this.t, f = this.frame;
      if (KB.BG && KB.BG.title) KB.BG.title(ctx, 0, 0, t); else drawTitleBg(ctx, this);
      if (!sprAt(ctx, 'ui_title_logo', 128, 46, 'c')) drawLogoFallback(ctx, 128, 46, t);
      // 卡比在草地上跳動
      const groundY = 147, bounce = Math.abs(Math.sin(t * 3.4)) * 12;
      KB.rect(ctx, 128 - 7 + Math.round(bounce / 6), groundY - 1, 14 - Math.round(bounce / 3), 2, 'rgba(0,40,0,0.35)');
      drawKirby(ctx, 'ui_title_kirby', 128, groundY - Math.round(bounce), { t, squash: bounce < 1.2 });
      if ((f % 60) < 42 && !this.help) KB.text(ctx, 'PRESS START', 128, 164, { color: '#fff', align: 'center', outline: '#203040', spacing: 1 });
      // 底部資訊列
      KB.rect(ctx, 0, 184, W, H - 184, C.navy); KB.rect(ctx, 0, 184, W, 1, '#405070');
      T(ctx, '同人作品　按 M 靜音' + (KB.audio && KB.audio.muted ? '（已靜音）' : ''), 128, 187, { color: '#c8d4e4', align: 'center', size: 12 });
      T(ctx, 'SELECT：操作說明　　Z / ENTER：開始', 128, 204, { color: '#7c8ca8', align: 'center', size: 12 });
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
      const ok = this.canEnter(i), theme = this.themeOf(i), cleared = this.cleared(i);
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
      if (cleared) { if (!sprAt(ctx, 'ui_map_flag', x + 9, y + 2, 'b')) sprAt(ctx, 'uifb_star', x + 9, y - 7, 'c'); }
    }
    draw(ctx) {
      const f = this.frame, nodes = this.nodes;
      if (KB.BG && KB.BG.map) KB.BG.map(ctx, 0, 0, this.t); else drawMapBg(ctx, this);
      // 路徑（虛線）
      for (let i = 0; i < this.paths.length; i++) {
        const ok = this.canEnter(i + 1);
        dottedPath(ctx, this.paths[i], ok ? '#fff8e8' : 'rgba(20,30,50,0.45)', 6, ok ? (f >> 1) : 0);
      }
      // 節點與標籤
      for (let i = 0; i < nodes.length; i++) {
        const [x, y] = nodes[i], ok = this.canEnter(i);
        this.drawNode(ctx, i, x, y);
        const label = 'W' + (i + 1), name = this.nameOf(i);
        const lw = KB.textWidth(label), nw = TW(name, { size: 12 }), tw = lw + 4 + nw;
        const sx = Math.max(3, Math.min(W - 3 - tw, Math.round(x - tw / 2)));
        const col = ok ? '#fff' : '#b0b8c8';
        KB.text(ctx, label, sx, y - 27, { color: ok ? C.yellow : col, outline: C.dark });
        T(ctx, name, sx + lw + 4, y - 30, { color: col, size: 12, outline: C.dark });
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
      T(ctx, '選擇關卡', 8, 15, { color: C.yellow, size: 12, outline: C.dark });
      const ses = KB.session || { lives: KB.START_LIVES, score: 0 };
      sprAt(ctx, pick('ui_kirby_face', 'uifb_face'), 216, 3, 'tl');
      KB.text(ctx, 'x' + Math.max(0, ses.lives | 0), 250, 7, { color: '#fff', align: 'right', outline: C.dark });
      KB.text(ctx, 'SCORE ' + pad7(ses.score), 250, 22, { color: '#fff', align: 'right', outline: C.dark });
      // 下方資訊面板
      panel(ctx, 8, 174, 240, 44);
      const i = this.cur, ok = this.canEnter(i);
      KB.text(ctx, 'W' + (i + 1), 16, 183, { color: C.yellow });
      T(ctx, this.nameOf(i), 38, 178, { color: '#fff', size: 16, outline: C.navy });
      if (!this.exists(i)) T(ctx, '製作中…', 240, 181, { color: C.grey, align: 'right', size: 12 });
      else if (!ok) { sprAt(ctx, pick('ui_lock', 'uifb_lock'), 194, 183, 'tl'); T(ctx, '未解鎖', 240, 181, { color: C.grey, align: 'right', size: 12 }); }
      else if (this.cleared(i)) { sprAt(ctx, 'uifb_star', 196, 187, 'c'); KB.text(ctx, 'CLEAR', 240, 183, { color: C.yellow, align: 'right' }); }
      else T(ctx, '出發！', 240, 181, { color: C.cyan, align: 'right', size: 12 });
      T(ctx, '←→ 移動　Z 進入　SELECT 回標題', 128, 200, { color: C.grey, align: 'center', size: 12 });
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
    T(ctx, cn, L.nameX, L.rowB, { color: flashName ? '#fff' : '#ffc8dc', size: 12 });
    // 中：血量
    const maxHp = p ? p.maxHp : KB.MAX_HP, hp = p ? Math.max(0, p.hp) : 0;
    const hurting = p && p.state !== 'dead' && p.invuln > KB.PHYS.invulnFrames - 30;
    for (let i = 0; i < maxHp; i++) {
      let full = i < hp; const o = {};
      if (hurting && i === hp && ((f >> 2) & 1)) { full = true; o.tint = '#fff'; }
      if (full && hp === 1 && i === 0 && ((f >> 3) & 1)) o.tint = '#fff';
      sprAt(ctx, full ? pick('ui_hp_full', 'uifb_hp_full') : pick('ui_hp_empty', 'uifb_hp_empty'), L.hpX + i * L.hpGap, L.hpY, 'tl', o);
    }
    // 右：上列分數、下列生命（卡比臉 + xN）
    KB.text(ctx, 'SCORE ' + pad7(game.score), L.right, L.rowA, { color: '#fff' , align: 'right' });
    sprAt(ctx, pick('ui_kirby_face', 'uifb_face'), L.faceX, L.faceY, 'tl');
    KB.text(ctx, 'x' + Math.max(0, game.lives | 0), L.right, L.livesY, { color: '#fff', align: 'right' });
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
      T(ctx, opts[i], 104, y, { color: sel ? C.yellow : '#fff', size: 12, outline: C.navy });
    }
    T(ctx, '↑↓ 選擇　Z 確認', 128, 121, { color: C.grey, align: 'center', size: 12 });
  };

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
        if (this.sel === 0) { const idx = this.levelIdx; leave(this, () => { KB.session = { lives: KB.START_LIVES, score: 0 }; KB.setScene(new StageSelectScene(idx)); }); }
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
        T(ctx, opts[i], 106, y, { color: sel ? C.yellow : '#fff', size: 12, outline: '#202030' });
      }
      T(ctx, '回到地圖：生命與分數重置', 128, 196, { color: '#687090', align: 'center', size: 12 });
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
        { s: '感謝遊玩', size: 12, color: '#fff', y: 38 },
        { s: '本作為同人致敬作品', size: 12, color: '#c8d8f0', y: 56 },
        { s: '所有美術與音樂皆為原創', size: 12, color: '#c8d8f0', y: 70 },
        { s: 'FINAL SCORE ' + pad7(this.score), size: 8, color: '#fff', y: 90 },
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
