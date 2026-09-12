// 程序式背景（art-world）
// KB.BG[theme](ctx, camX, camY, t, room)：只畫在 0..256 × 0..192；KB.BG.title / KB.BG.map 為全畫面。
// 遠景以 bg_<theme>_* 精靈條（可平鋪、sheet 可檢視）搭配視差平鋪（camX*0.2 / *0.5），動態元素每幀程序式繪製。
(function () {
  KB.BG = KB.BG || {};
  const W = KB.W, H = KB.H, VH = KB.VIEW_H;
  const X = KB.pix;

  // ---------- 工具 ----------
  // 環繞式畫布（x 超出寬度時回繞 → 水平平鋪無縫）
  function wrapper(g) {
    const w = g[0].length, h = g.length;
    const P = {
      w, h,
      px(x, y, ch) { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < h) g[y][((x % w) + w) % w] = ch; },
      get(x, y) { x = Math.round(x); y = Math.round(y); return (y >= 0 && y < h) ? g[y][((x % w) + w) % w] : '.'; },
      rect(x, y, rw, rh, ch) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) P.px(x + i, y + j, ch); },
      disc(cx, cy, r, ch) { r = Math.round(r); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) P.px(cx + x, cy + y, ch); },
      ellipse(cx, cy, rx, ry, ch) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) P.px(cx + x, cy + y, ch); },
      // 山峰：底 (cx, base)、高 hgt、半寬 hw；左稜線受光色 lit
      peak(cx, base, hgt, hw, ch, lit) {
        for (let x = cx - hw; x <= cx + hw; x++) {
          const top = Math.round(base - hgt * (1 - Math.abs(x - cx) / hw));
          for (let y = top; y < base; y++) P.px(x, y, (lit && x < cx && y - top < 3) ? lit : ch);
        }
      },
      // 圓丘：頂點 (cx, top)、半徑 r；高光 hi
      hill(cx, top, r, ch, hi) {
        P.disc(cx, top + r, r, ch);
        if (hi) { const hr = Math.round(r * 0.55); for (let y = -hr; y <= hr; y++) for (let x = -hr; x <= hr; x++) if (x * x + y * y <= hr * hr && P.get(cx - r * 0.3 + x, top + r * 0.65 + y) === ch) P.px(cx - r * 0.3 + x, top + r * 0.65 + y, hi); }
      },
      // 蓬鬆雲（陰影先畫在下方 2px）
      cloud(cx, cy, s, ch, sh) {
        const parts = [[0, 0, s], [-s, s * 0.35, s * 0.7], [s, s * 0.35, s * 0.75], [s * 0.45, -s * 0.3, s * 0.8], [-s * 0.5, -s * 0.15, s * 0.6], [s * 1.7, s * 0.5, s * 0.5], [-s * 1.7, s * 0.5, s * 0.45]];
        if (sh) for (const [dx, dy, r] of parts) P.disc(cx + dx, cy + dy + 2, r, sh);
        for (const [dx, dy, r] of parts) P.disc(cx + dx, cy + dy, r, ch);
      },
      // 只把 ch 內部、下方 n 列改成 sh（底部陰影）
      shadeBottom(ch, sh, n) { for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (P.get(x, y) === ch) { let k = 1; while (k <= n && P.get(x, y + k) === ch) k++; if (k <= n) P.px(x, y, sh); } },
    };
    return P;
  }
  function strip(name, pal, w, h, fn) { const g = X.grid(w, h); fn(wrapper(g), g); return KB.sprite(name, pal, X.gRows(g), { anchor: 'topleft' }).frames[0].cv; }
  // 水平無限平鋪；ox 為捲動量（右移為正）
  function tileX(ctx, cv, ox, y, alpha) {
    const w = cv.width; let x = -(((Math.round(ox) % w) + w) % w);
    if (alpha !== undefined) { ctx.save(); ctx.globalAlpha = alpha; }
    for (; x < W; x += w) ctx.drawImage(cv, x, Math.round(y));
    if (alpha !== undefined) ctx.restore();
  }
  // 平鋪條上某點的螢幕 x
  const wrapX = (x, ox, w) => (((x - ox) % w) + w) % w;
  function bands(ctx, y0, y1, cols) { const n = cols.length, h = (y1 - y0) / n; for (let i = 0; i < n; i++) KB.rect(ctx, 0, y0 + i * h, W, Math.ceil(h) + 1, cols[i]); }
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function mkStars(n, seed, w, h, y0) { const r = rng(seed), a = []; for (let i = 0; i < n; i++) a.push({ x: Math.floor(r() * w), y: (y0 || 0) + Math.floor(r() * h), ph: r() * 6.28, spd: 1.5 + r() * 2.5, big: r() < 0.2 }); return a; }
  function drawStars(ctx, stars, t, ox, col, dim) {
    for (const s of stars) {
      const v = Math.sin(t * s.spd + s.ph), x = wrapX(s.x, ox, W);
      if (v > 0.1) { KB.rect(ctx, x, s.y, 1, 1, col); if (s.big && v > 0.75) { KB.rect(ctx, x - 1, s.y, 3, 1, col); KB.rect(ctx, x, s.y - 1, 1, 3, col); } }
      else if (dim) KB.rect(ctx, x, s.y, 1, 1, dim);
    }
  }
  const spr = (ctx, name, x, y, o) => KB.drawSpr(ctx, name, x, y, o || {});

  // ============================================================================
  // green 翠綠草原：藍天、白雲、遠山（藍綠）、近山丘（綠色圓弧）
  // ============================================================================
  const GP = { a: '#6cb0c0', b: '#90ccd8', d: '#88d478', e: '#a8e498', w: '#ffffff', W: '#d8e8fc' };
  const gClouds = strip('bg_green_clouds', GP, 256, 40, p => {
    p.cloud(34, 16, 6, 'w', 'W'); p.cloud(112, 10, 7, 'w', 'W'); p.cloud(184, 20, 5, 'w', 'W'); p.cloud(236, 8, 4, 'w', 'W');
  });
  const gMts = strip('bg_green_mountains', GP, 256, 64, p => {
    p.peak(24, 64, 40, 34, 'a', 'b'); p.peak(78, 64, 56, 44, 'a', 'b'); p.peak(132, 64, 34, 30, 'a', 'b'); p.peak(186, 64, 60, 48, 'a', 'b'); p.peak(240, 64, 44, 38, 'a', 'b');
  });
  const gHills = strip('bg_green_hills', GP, 256, 56, p => {
    for (const [cx, r, hh] of [[0, 36, 26], [64, 44, 34], [128, 32, 22], [180, 48, 34], [236, 38, 28]]) p.hill(cx, 56 - hh, r, 'd', 'e');
    p.rect(0, 48, 256, 8, 'd');
  });
  KB.BG.green = function (ctx, camX, camY, t) {
    bands(ctx, 0, VH, ['#4890e8', '#5ca4f0', '#70b8f4', '#84ccf8', '#98dcfc', '#a8e8ff']);
    KB.circle(ctx, 218, 30, 13, '#ffe890'); KB.circle(ctx, 218, 30, 10, '#fff8d0');
    tileX(ctx, gClouds, camX * 0.12 + t * 2.5, 12 - camY * 0.05);
    const my = 104 - camY * 0.2; tileX(ctx, gMts, camX * 0.2, my); KB.rect(ctx, 0, my + 64, W, VH - my - 64 + 2, '#6cb0c0');
    const hy = 138 - camY * 0.4; tileX(ctx, gHills, camX * 0.5, hy); KB.rect(ctx, 0, hy + 56, W, VH - hy - 56 + 2, '#88d478');
  };

  // ============================================================================
  // castle 幽靜古堡：夜空、月亮、遠處城牆與塔的剪影、火把微光
  // ============================================================================
  const CP = { a: '#1c1c44', b: '#282854', c: '#303060', d: '#3a3a6c', e: '#24244c' };
  const cWin = [];   // 亮窗（條座標）
  const cTowers = strip('bg_castle_towers', CP, 256, 96, p => {
    p.rect(0, 62, 256, 34, 'a');
    for (let x = 0; x < 256; x += 8) p.rect(x, 58, 4, 4, 'a');
    for (const [cx, w, top] of [[30, 20, 22], [96, 30, 6], [150, 16, 30], [206, 26, 14], [244, 12, 40]]) {
      const l = cx - w / 2;
      p.rect(l, top, w, 96 - top, 'a');
      p.rect(l - 2, top, w + 4, 3, 'a');
      for (let x = l - 2; x < l + w + 2; x += 4) p.rect(x, top - 3, 2, 3, 'a');
      p.peak(cx, top - 3, Math.round(w * 0.8), Math.round(w / 2), 'a');
      p.rect(cx, top - 3 - Math.round(w * 0.8) - 3, 1, 4, 'a');
      for (let y = top + 10; y < 90; y += 14) { p.rect(cx - 1, y, 3, 5, 'b'); if ((y + cx) % 3 === 0) cWin.push([cx - 1, y + 1]); }
    }
    for (let x = 6; x < 256; x += 24) { p.rect(x, 70, 2, 4, 'b'); if (x % 48 === 6) cWin.push([x, 71]); }
  });
  const cWall = strip('bg_castle_wall', CP, 256, 64, p => {
    p.rect(0, 8, 256, 56, 'c');
    for (let x = 0; x < 256; x += 16) p.rect(x, 0, 8, 8, 'c');
    for (let y = 8; y < 64; y += 8) { p.rect(0, y, 256, 1, 'b'); for (let x = (y / 8) & 1 ? 8 : 0; x < 256; x += 16) p.rect(x, y, 1, 8, 'b'); }
    for (const cx of [64, 192]) { p.rect(cx - 8, 28, 16, 36, 'e'); p.disc(cx, 28, 8, 'e'); p.rect(cx - 6, 30, 12, 34, 'a'); p.disc(cx, 30, 6, 'a'); }
    for (let x = 0; x < 256; x += 16) p.rect(x + 2, 2, 4, 1, 'd');
  });
  const cStars = mkStars(46, 11, 256, 110);
  KB.BG.castle = function (ctx, camX, camY, t) {
    bands(ctx, 0, VH, ['#0c1030', '#121840', '#1a2050', '#22285c', '#2a3068', '#323870']);
    drawStars(ctx, cStars, t, camX * 0.05, '#ffffff', '#7880b0');
    const mx = 204 - camX * 0.04, my = 38 - camY * 0.05;
    KB.circle(ctx, mx, my, 14, '#e8e8c0'); KB.circle(ctx, mx - 1, my - 1, 12, '#fcfce8'); KB.circle(ctx, mx + 4, my - 3, 3, '#e0e0b0'); KB.circle(ctx, mx - 5, my + 5, 2, '#e0e0b0'); KB.circle(ctx, mx + 2, my + 6, 1, '#e0e0b0');
    const ty = 86 - camY * 0.15, ox = camX * 0.2;
    tileX(ctx, cTowers, ox, ty); KB.rect(ctx, 0, ty + 96, W, VH - ty - 96 + 2, '#1c1c44');
    for (const [wx, wy] of cWin) { const x = wrapX(wx, ox, 256); KB.rect(ctx, x, ty + wy, 2, 3, Math.sin(t * 6 + wx) > -0.5 ? '#f8d060' : '#d89840'); }
    const wy = 130 - camY * 0.3, ox2 = camX * 0.5;
    tileX(ctx, cWall, ox2, wy); KB.rect(ctx, 0, wy + 64, W, VH - wy - 64 + 2, '#303060');
    for (const tx of [24, 128, 232]) {
      const x = wrapX(tx, ox2, 256), fl = Math.sin(t * 9 + tx) * 0.05;
      ctx.save(); ctx.globalAlpha = 0.16 + fl; KB.circle(ctx, x + 4, wy + 26, 18, '#ffb040'); ctx.globalAlpha = 0.22 + fl; KB.circle(ctx, x + 4, wy + 26, 9, '#ffe080'); ctx.restore();
      spr(ctx, 'deco_castle_r', x + 4, wy + 42, { t: t + tx, alpha: 0.85 });
    }
  };

  // ============================================================================
  // island 漂浮群島：藍天、海（深淺藍帶 + 白浪隨 t 動）、遠處小島、太陽
  // ============================================================================
  const IP = { w: '#ffffff', W: '#dceafc', g: '#58b870', G: '#3c9858', s: '#f0e0a0', t: '#6c5030', l: '#78d088' };
  const iClouds = strip('bg_island_clouds', IP, 256, 40, p => {
    p.cloud(50, 14, 5, 'w', 'W'); p.cloud(140, 8, 7, 'w', 'W'); p.cloud(214, 18, 4, 'w', 'W');
  });
  const iFar = strip('bg_island_far', IP, 256, 32, p => {
    for (const [cx, r, hh] of [[40, 26, 14], [58, 18, 18], [150, 30, 12], [172, 22, 20], [236, 20, 10]]) { p.hill(cx, 32 - hh, r, 'G'); }
    for (const [cx, r, hh] of [[40, 26, 14], [58, 18, 18], [150, 30, 12], [172, 22, 20], [236, 20, 10]]) { p.hill(cx - 3, 32 - hh + 2, Math.round(r * 0.8), 'g', 'l'); }
    p.shadeBottom('g', 'G', 0);
    for (const [cx, base] of [[62, 14], [176, 12], [44, 20]]) { p.rect(cx, base, 1, 8, 't'); p.rect(cx - 3, base - 1, 7, 1, 'G'); p.rect(cx - 2, base - 2, 5, 1, 'G'); p.rect(cx - 1, base, 3, 1, 'G'); }
    for (let x = 0; x < 256; x++) { let y = 31; while (y > 0 && p.get(x, y) === '.') y--; if (y > 0 && y < 31) { p.px(x, y + 1, 's'); p.px(x, y + 2, 's'); } }
    p.rect(0, 30, 256, 2, '.');
  });
  KB.BG.island = function (ctx, camX, camY, t) {
    const hz = 142 - camY * 0.1;
    bands(ctx, 0, hz, ['#3888e8', '#4c9cf0', '#64b4f4', '#80c8f8', '#98d8fc', '#b0e4ff']);
    KB.circle(ctx, 44, 30, 15, '#ffe890'); KB.circle(ctx, 44, 30, 12, '#fff8d0'); KB.circle(ctx, 44, 30, 8, '#ffffff');
    tileX(ctx, iClouds, camX * 0.15 + t * 3, 14 - camY * 0.05);
    tileX(ctx, iFar, camX * 0.2, hz - 30);
    // 海
    const seaCols = ['#2c78d8', '#3888e0', '#4498e8', '#50a8ec', '#5cb4f0', '#68bcf4'];
    for (let i = 0; i < seaCols.length; i++) KB.rect(ctx, 0, hz + i * 14, W, 14, seaCols[i]);
    KB.rect(ctx, 0, hz + 84, W, VH - hz - 84 + 2, '#70c0f4');
    KB.rect(ctx, 0, hz, W, 1, '#d8f0ff');
    for (let i = 0; i < 9; i++) {
      const y = hz + 4 + i * 9, pf = 0.15 + i * 0.05, sp = 64 + i * 8, len = 6 + i * 1.5;
      const off = wrapX(i * 29 + t * (10 + i * 2), camX * pf, sp);
      ctx.fillStyle = i % 2 ? '#ffffff' : '#c8ecff';
      for (let x = off - sp; x < W; x += sp) ctx.fillRect(Math.round(x), Math.round(y), Math.round(len), 1);
    }
  };

  // ============================================================================
  // cloud 泡泡雲海：淡紫藍漸層、大量圓雲、星星閃爍、一道彩虹
  // ============================================================================
  const LP = { w: '#f8f8ff', W: '#d0d4f8', f: '#e4e4ff', F: '#c4c8f0', r: '#f87878', o: '#f8b070', y: '#f8f090', g: '#88d890', c: '#88b8f8', v: '#b898e8' };
  const lRainbow = strip('bg_cloud_rainbow', LP, 176, 88, p => {
    const cols = ['r', 'o', 'y', 'g', 'c', 'v'];
    for (let y = 0; y < 88; y++) for (let x = 0; x < 176; x++) {
      const dx = x - 87.5, dy = 88 - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 86 && d > 62) { const i = Math.floor((86 - d) / 4); if (i < cols.length) p.px(x, y, cols[i]); }
    }
  });
  const lFar = strip('bg_cloud_far', LP, 256, 80, p => {
    p.cloud(30, 30, 9, 'f', 'F'); p.cloud(100, 50, 11, 'f', 'F'); p.cloud(170, 26, 8, 'f', 'F'); p.cloud(232, 52, 10, 'f', 'F'); p.cloud(70, 70, 8, 'f', 'F'); p.cloud(140, 74, 9, 'f', 'F'); p.cloud(210, 76, 7, 'f', 'F');
  });
  const lNear = strip('bg_cloud_near', LP, 256, 64, p => {
    p.cloud(20, 30, 10, 'w', 'W'); p.cloud(90, 40, 13, 'w', 'W'); p.cloud(160, 28, 9, 'w', 'W'); p.cloud(226, 42, 12, 'w', 'W'); p.cloud(128, 60, 11, 'w', 'W'); p.cloud(50, 62, 9, 'w', 'W'); p.cloud(200, 64, 10, 'w', 'W');
    p.rect(0, 58, 256, 6, 'w');
  });
  // 雲海表面之下的小雲層（垂直房下半屏原本是整片純白，看起來像沒畫完）
  const lDeep = strip('bg_cloud_deep', LP, 256, 40, p => {
    p.cloud(24, 14, 7, 'W', 'c'); p.cloud(96, 22, 9, 'W', 'c'); p.cloud(166, 12, 6, 'W', 'c'); p.cloud(228, 26, 8, 'W', 'c');
    p.cloud(60, 34, 6, 'W', 'c'); p.cloud(134, 36, 7, 'W', 'c'); p.cloud(200, 38, 5, 'W', 'c');
  });
  const lStars = mkStars(28, 23, 256, 90);
  KB.BG.cloud = function (ctx, camX, camY, t) {
    // 漸層永遠填滿整個畫面（camY 再大也不會露出底色）
    bands(ctx, 0, VH, ['#5c5cc0', '#7070cc', '#8484d8', '#9c9ce4', '#b0b0ec', '#c4c4f4', '#d8d8fc']);
    drawStars(ctx, lStars, t, camX * 0.05, '#ffffff', '#a8a8e0');
    // 一道彩虹（每 640px 視差空間出現一次）；垂直房的 camY 很大，y 要夾住否則會整條飄出畫面只剩碎片
    const rx = wrapX(40, camX * 0.1, 640);
    const ry = Math.max(-70, Math.min(VH - 24, Math.round(44 - camY * 0.1)));
    ctx.save(); ctx.globalAlpha = 0.6; ctx.drawImage(lRainbow, Math.round(rx > 400 ? rx - 640 : rx), ry); ctx.restore();
    tileX(ctx, lFar, camX * 0.2 + t * 1.5, Math.max(-72, Math.min(VH, 40 - camY * 0.15)));
    // 雲海表面：往上視差移動，但夾在畫面下半（96 ~ VH-8），避免高塔房下半屏變成一整片空白
    const ny = Math.max(96, Math.min(VH - 8, 118 - camY * 0.35));
    tileX(ctx, lNear, camX * 0.5 + t * 3, ny);
    KB.rect(ctx, 0, ny + 64, W, VH - ny - 64 + 2, '#f8f8ff');
    tileX(ctx, lDeep, camX * 0.8 + t * 5, ny + 66, 0.5);
  };

  // ============================================================================
  // dedede 迪迪迪城：暗紅天空、遠處城堡剪影（塔、旗）、偶爾閃電
  // ============================================================================
  const DP = { a: '#200814', b: '#2c0c1c', c: '#361020', d: '#40142a', r: '#c83050', y: '#f0c040', e: '#4c1830' };
  const dWin = [];
  const dCastle = strip('bg_dedede_castle', DP, 256, 112, p => {
    p.rect(0, 76, 256, 36, 'a');
    for (let x = 0; x < 256; x += 10) p.rect(x, 71, 5, 5, 'a');
    for (const [cx, w, top, flag] of [[36, 22, 30, 1], [92, 36, 12, 0], [128, 16, 44, 1], [176, 28, 24, 0], [232, 20, 36, 1]]) {
      const l = cx - w / 2;
      p.rect(l, top, w, 112 - top, 'a');
      p.rect(l - 2, top, w + 4, 3, 'a');
      for (let x = l - 2; x < l + w + 2; x += 4) p.rect(x, top - 3, 2, 3, 'a');
      p.peak(cx, top - 3, Math.round(w * 0.9), Math.round(w / 2) + 1, 'b');
      p.rect(cx, top - 3 - Math.round(w * 0.9) - 6, 1, 7, 'a');
      if (flag) { const fy = top - 3 - Math.round(w * 0.9) - 6; p.rect(cx + 1, fy, 6, 3, 'r'); p.rect(cx + 1, fy + 3, 4, 1, 'r'); }
      for (let y = top + 12; y < 104; y += 14) { p.rect(cx - 2, y, 4, 6, 'b'); p.rect(cx - 1, y - 1, 2, 1, 'b'); if ((y + cx) % 4 < 2) dWin.push([cx - 2, y + 1]); }
    }
    for (let x = 8; x < 256; x += 20) { p.rect(x, 84, 3, 5, 'b'); if (x % 40 === 8) dWin.push([x, 85]); }
  });
  const dWall = strip('bg_dedede_wall', DP, 256, 48, p => {
    p.rect(0, 8, 256, 40, 'c');
    for (let x = 0; x < 256; x += 16) p.rect(x, 0, 8, 8, 'c');
    for (let y = 8; y < 48; y += 8) { p.rect(0, y, 256, 1, 'b'); for (let x = (y / 8) & 1 ? 8 : 0; x < 256; x += 16) p.rect(x, y, 1, 8, 'b'); }
    for (let x = 0; x < 256; x += 16) p.rect(x + 2, 2, 4, 1, 'd');
    for (const cx of [48, 176]) { p.rect(cx - 2, 20, 4, 14, 'a'); p.disc(cx, 20, 2, 'a'); }
  });
  const dClouds = strip('bg_dedede_clouds', DP, 256, 48, p => {
    p.cloud(40, 20, 9, 'd', 'c'); p.cloud(130, 12, 12, 'd', 'c'); p.cloud(210, 26, 8, 'd', 'c');
  });
  KB.BG.dedede = function (ctx, camX, camY, t) {
    const cyc = 6.3, ph = t % cyc, n = Math.floor(t / cyc);
    const flash = ph < 0.08 ? 1 : (ph > 0.14 && ph < 0.22) ? 0.7 : (ph > 0.3 && ph < 0.34) ? 0.4 : 0;
    bands(ctx, 0, VH, flash ? ['#5c3050', '#6a3858', '#784060', '#864868', '#945070', '#a25878'] : ['#1c0810', '#2a0c18', '#381020', '#461428', '#541830', '#621c38']);
    tileX(ctx, dClouds, camX * 0.08 + t * 1.2, 4 - camY * 0.05);
    const cy = 80 - camY * 0.15, ox = camX * 0.2;
    tileX(ctx, dCastle, ox, cy); KB.rect(ctx, 0, cy + 112, W, VH - cy - 112 + 2, '#200814');
    for (const [wx, wy] of dWin) { const x = wrapX(wx, ox, 256); KB.rect(ctx, x, cy + wy, 3, 4, Math.sin(t * 5 + wx) > -0.6 ? '#f0c040' : '#c08030'); }
    if (flash) {
      const r = rng(n * 7919 + 13);
      const bx = wrapX(40 + r() * 176, ox, 256);
      let x = bx, y = 0; ctx.save(); ctx.globalAlpha = 0.9;
      const ty = cy + 20 + r() * 40;
      for (let s = 0; s < 8 && y < ty; s++) { const nx = x + (r() - 0.5) * 22, ny = y + ty / 7; KB.rect(ctx, Math.min(x, nx), y, Math.abs(nx - x) + 2, 2, '#ffffff'); KB.rect(ctx, nx, y, 2, ny - y + 1, '#fff8e0'); x = nx; y = ny; }
      ctx.restore();
      if (flash > 0.5) { ctx.save(); ctx.globalAlpha = 0.25; KB.rect(ctx, 0, 0, W, VH, '#ffffff'); ctx.restore(); }
    }
    const wy = 144 - camY * 0.3, ox2 = camX * 0.5;
    tileX(ctx, dWall, ox2, wy); KB.rect(ctx, 0, wy + 48, W, VH - wy - 48 + 2, '#361020');
    for (const tx of [48, 176]) {
      const x = wrapX(tx, ox2, 256), fl = Math.sin(t * 8 + tx) * 0.05;
      ctx.save(); ctx.globalAlpha = 0.18 + fl; KB.circle(ctx, x, wy + 24, 16, '#ff9040'); ctx.globalAlpha = 0.22 + fl; KB.circle(ctx, x, wy + 24, 8, '#ffd070'); ctx.restore();
      spr(ctx, 'deco_dedede_t', x, wy + 40, { t: t + tx, alpha: 0.85 });
    }
  };

  // ============================================================================
  // space 星之彼端（W6）：深空星點閃爍、星雲色帶、遠方行星、偶爾流星劃過
  // 垂直房支援：所有層的 y 都夾在畫面內（camY 很大時不會整片露出底色 / 飄出畫面）
  // ============================================================================
  const SP = {
    a: '#2a1a5c', b: '#3c2478', c: '#6a3ca8', d: '#1a1040', e: '#4a2c90',
    n: '#20406c', N: '#2c6090', q: '#8a5ad0', w: '#ffffff', v: '#a862f0', g: '#1e7a90',
  };
  // 星雲色帶（256×96，可平鋪）：柔和的紫 / 青色雲氣
  const spNebula = strip('bg_space_nebula', SP, 256, 96, p => {
    const puffs = [[20, 30, 20, 'a'], [64, 54, 26, 'a'], [118, 26, 22, 'a'], [176, 58, 28, 'a'], [226, 34, 20, 'a'],
      [40, 40, 13, 'b'], [80, 60, 16, 'b'], [130, 34, 14, 'b'], [186, 62, 17, 'b'], [234, 40, 12, 'b'],
      [46, 44, 7, 'c'], [86, 62, 8, 'c'], [134, 38, 7, 'c'], [192, 64, 9, 'c'], [238, 42, 6, 'c'],
      [88, 64, 3, 'q'], [136, 40, 3, 'q'], [194, 66, 4, 'q']];
    for (const [cx, cy, r, ch] of puffs) p.ellipse(cx, cy, r, Math.round(r * 0.55), ch);
    // 鏤空出絲狀質感
    for (let i = 0; i < 260; i++) {
      const x = (i * 97) % 256, y = (i * 53) % 96;
      if ((x * 7 + y * 13) % 5 === 0) p.px(x, y, '.');
    }
  });
  // 遠方的第二層星雲（更暗、更慢）
  const spDust = strip('bg_space_dust', SP, 256, 72, p => {
    for (const [cx, cy, r] of [[34, 24, 16], [110, 46, 20], [196, 20, 18], [244, 50, 14]]) p.ellipse(cx, cy, r, Math.round(r * 0.5), 'd');
    for (const [cx, cy, r] of [[36, 26, 8], [114, 48, 10], [198, 22, 9]]) p.ellipse(cx, cy, r, Math.round(r * 0.5), 'a');
  });
  const spFar = mkStars(80, 77, 256, 176);    // 最遠的星（幾乎不動）
  const spNear = mkStars(34, 131, 256, 168);  // 近一點的星（會視差移動、比較亮）
  KB.BG.space = function (ctx, camX, camY, t) {
    bands(ctx, 0, VH, ['#05041a', '#080622', '#0c0a2c', '#100c36', '#140f40', '#180f36', '#140a26']);
    // 遠景星（視差 0.02，垂直方向只移動一點點 → 垂直房仍然滿版）
    drawStars(ctx, spFar, t, camX * 0.02, '#ffffff', '#404878');
    // 星雲色帶（兩層）
    const dy = Math.max(-40, Math.min(VH - 24, 26 - camY * 0.05));
    tileX(ctx, spDust, camX * 0.06 + t * 0.6, dy, 0.7);
    const ny = Math.max(-56, Math.min(VH - 20, 64 - camY * 0.1));
    tileX(ctx, spNebula, camX * 0.12 + t * 1.2, ny, 0.55);
    // 遠方行星（視差 0.08）：帶光環的紫色巨行星，y 夾在畫面上半
    const px0 = wrapX(70, camX * 0.08, 512), pxs = px0 > 340 ? px0 - 512 : px0;
    const py0 = Math.max(18, Math.min(VH - 34, 54 - camY * 0.08));
    // 光環：先畫後半圈 → 畫行星 → 再補前半圈（才有「環穿過行星後面」的立體感）
    const ringHalf = front => {
      ctx.save(); ctx.globalAlpha = front ? 0.9 : 0.55;
      for (let k = 0; k <= 120; k++) {
        const a = (k / 120) * Math.PI * 2;
        if ((Math.sin(a) > 0) !== front) continue;
        const rx = Math.round(pxs + Math.cos(a) * 38), ry = Math.round(py0 + 6 + Math.sin(a) * 11 - Math.cos(a) * 5);
        KB.rect(ctx, rx, ry, 2, 1, k % 5 === 0 ? '#b8bcf4' : '#66e4ff');
        KB.rect(ctx, rx, ry + 1, 2, 1, '#2c6090');
      }
      ctx.restore();
    };
    ringHalf(false);
    KB.circle(ctx, pxs, py0, 27, '#241348');
    KB.circle(ctx, pxs, py0, 25, '#4a2c90');
    KB.circle(ctx, pxs - 6, py0 - 6, 16, '#6a3ca8');
    KB.circle(ctx, pxs - 9, py0 - 9, 7, '#8a5ad0');
    KB.circle(ctx, pxs + 9, py0 + 7, 6, '#341c66');
    KB.circle(ctx, pxs + 3, py0 - 11, 4, '#341c66');
    ringHalf(true);
    // 第二顆小行星（更近、視差 0.2）
    const sx0 = wrapX(300, camX * 0.2, 640), sxs = sx0 > 430 ? sx0 - 640 : sx0;
    const sy0 = Math.max(12, Math.min(VH - 20, 132 - camY * 0.16));
    KB.circle(ctx, sxs, sy0, 11, '#1e7a90');
    KB.circle(ctx, sxs - 3, sy0 - 3, 6, '#66e4ff');
    KB.circle(ctx, sxs + 4, sy0 + 3, 3, '#124a60');
    // 近景星（視差 0.16，會閃爍）
    drawStars(ctx, spNear, t, camX * 0.16, '#e8f4ff', '#5a64a0');
    // 偶爾的流星：每 2.6 秒一顆，斜向劃過 0.55 秒
    const cyc = 2.6, ph = t % cyc, n = Math.floor(t / cyc);
    if (ph < 0.55) {
      const r = rng(n * 2654435761 + 7);
      const x0 = r() * 300 - 30, y0 = r() * 90, len = 26 + r() * 22, spd = 300 + r() * 160;
      const k = ph / 0.55, a = Math.sin(k * Math.PI);
      const hx = x0 + k * spd, hy = y0 + k * spd * 0.45 - camY * 0.04;
      ctx.save(); ctx.globalAlpha = a;
      for (let i = 0; i < len; i++) {
        const f = 1 - i / len;
        KB.rect(ctx, hx - i, hy - i * 0.45, 1, 1, f > 0.6 ? '#ffffff' : (f > 0.3 ? '#b8bcf4' : '#6a3ca8'));
      }
      KB.rect(ctx, hx, hy - 1, 2, 3, '#ffffff'); KB.rect(ctx, hx - 1, hy, 4, 1, '#ffffff');
      ctx.restore();
    }
  };

  // ============================================================================
  // title 標題：藍天草地雲朵（動態）
  // ============================================================================
  const tStars = mkStars(14, 5, 256, 56);
  KB.BG.title = function (ctx, camX, camY, t) {
    bands(ctx, 0, 150, ['#3c78d8', '#4890e0', '#58a4e8', '#6cb8f0', '#84ccf8', '#98dcfc']);
    drawStars(ctx, tStars, t, 0, '#ffffff');
    KB.circle(ctx, 212, 30, 14, '#ffe070'); KB.circle(ctx, 212, 30, 11, '#fff4b0'); KB.circle(ctx, 212, 30, 7, '#ffffff');
    tileX(ctx, gClouds, t * 4, 18, 0.95);
    tileX(ctx, gClouds, t * 8 + 120, 70, 0.8);
    tileX(ctx, gMts, 0, 92); KB.rect(ctx, 0, 156, W, 40, '#6cb0c0');
    tileX(ctx, gHills, t * 1.5, 104); KB.rect(ctx, 0, 160, W, 40, '#88d478');
    spr(ctx, 'deco_green_t', 34, 147, { flip: false }); spr(ctx, 'deco_green_t', 222, 147, { flip: true });
    spr(ctx, 'deco_green_b', 72, 147); spr(ctx, 'deco_green_b', 190, 147, { flip: true });
    spr(ctx, 'deco_green_f', 100, 147); spr(ctx, 'deco_green_f', 160, 147, { flip: true }); spr(ctx, 'deco_green_m', 12, 147); spr(ctx, 'deco_green_g', 250, 147);
    KB.rect(ctx, 0, 146, W, 5, '#58d048'); KB.rect(ctx, 0, 151, W, 2, '#289028'); KB.rect(ctx, 0, 153, W, 1, '#503018'); KB.rect(ctx, 0, 154, W, H - 154, '#c88850');
    for (let x = 3; x < W; x += 9) KB.rect(ctx, x, 159 + ((x * 7) % 20), 2, 2, '#905828');
    for (let x = 5; x < W; x += 13) { KB.rect(ctx, x, 143, 1, 3, '#98f070'); KB.rect(ctx, x + 3, 144, 1, 2, '#98f070'); KB.rect(ctx, x + 6, 145, 1, 1, '#98f070'); }
  };

  // ============================================================================
  // map 選關地圖：淡色地圖紙質感（靜態，預先繪製一次）
  // ============================================================================
  let mapCv = null;
  function buildMap() {
    const cv = KB.makeCanvas(W, H), c = cv.getContext('2d');
    const nodes = (KB.UI && KB.UI.LAYOUT && KB.UI.LAYOUT.mapNodes) || [[30, 148], [80, 104], [128, 140], [176, 88], [226, 124]];
    KB.rect(c, 0, 0, W, H, '#f0e2c0');
    const r = rng(99);
    for (let i = 0; i < 900; i++) KB.rect(c, Math.floor(r() * W), Math.floor(r() * H), 1, 1, r() < 0.5 ? '#e6d4a8' : '#f6ecd4');
    for (let i = 0; i < 40; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); KB.rect(c, x, y, 2 + Math.floor(r() * 3), 1, '#dccaa0'); }
    for (let x = 0; x < W; x += 32) KB.rect(c, x, 0, 1, H, 'rgba(160,130,80,0.10)');
    for (let y = 0; y < H; y += 32) KB.rect(c, 0, y, W, 1, 'rgba(160,130,80,0.10)');
    // 海面波紋記號
    for (let i = 0; i < 70; i++) { const x = Math.floor(r() * W), y = 24 + Math.floor(r() * 150); KB.rect(c, x, y, 3, 1, '#c8b890'); KB.rect(c, x + 3, y - 1, 2, 1, '#c8b890'); KB.rect(c, x + 5, y, 3, 1, '#c8b890'); }
    // 陸地（節點周圍的圓丘聯集）
    const land = [];
    for (let i = 0; i < nodes.length; i++) { const [x, y] = nodes[i]; land.push([x, y + 4, 34]); land.push([x - 14 + (i & 1) * 28, y + 16, 22]); if (i < nodes.length - 1) { const [nx, ny] = nodes[i + 1]; land.push([(x + nx) / 2, (y + ny) / 2 + 6, 24]); } }
    for (const [x, y, rr] of land) KB.circle(c, x, y, rr + 3, '#a8a878');
    for (const [x, y, rr] of land) KB.circle(c, x, y, rr + 1, '#e8dcb0');
    for (const [x, y, rr] of land) KB.circle(c, x, y, rr - 1, '#cfe0a0');
    for (const [x, y, rr] of land) KB.circle(c, x - rr * 0.25, y - rr * 0.2, rr * 0.5, '#dcecb4');
    // 山、樹記號（避開節點）
    const marks = [[52, 178], [104, 168], [150, 176], [204, 164], [118, 100], [58, 92], [160, 60], [244, 96], [198, 150], [16, 176]];
    for (const [x, y] of marks) {
      if (nodes.some(([nx, ny]) => Math.abs(nx - x) < 22 && Math.abs(ny - y) < 20)) continue;
      KB.rect(c, x - 1, y - 2, 2, 4, '#8a6a40'); KB.circle(c, x, y - 5, 4, '#78a860'); KB.circle(c, x - 1, y - 6, 2, '#98c878');
    }
    for (const [x, y] of [[140, 116], [232, 72], [24, 112]]) {
      if (nodes.some(([nx, ny]) => Math.abs(nx - x) < 24 && Math.abs(ny - y) < 22)) continue;
      for (let i = 0; i < 7; i++) KB.rect(c, x - i, y - 6 + i, i * 2 + 1, 1, i < 2 ? '#e8e8e0' : '#b0a080');
      KB.rect(c, x - 6, y + 1, 13, 1, '#8a7a58');
    }
    // 羅盤（右上）
    const cx = 236, cy = 52;
    KB.circle(c, cx, cy, 11, '#a08050'); KB.circle(c, cx, cy, 10, '#f6ecd4');
    for (let i = 0; i < 9; i++) { KB.rect(c, cx - Math.floor(i / 2), cy - 9 + i, i > 0 ? Math.floor(i / 2) * 2 + 1 : 1, 1, '#c84040'); KB.rect(c, cx - Math.floor(i / 2), cy + 9 - i, i > 0 ? Math.floor(i / 2) * 2 + 1 : 1, 1, '#605040'); }
    for (let i = 0; i < 9; i++) { KB.rect(c, cx - 9 + i, cy - Math.floor(i / 2), 1, i > 0 ? Math.floor(i / 2) * 2 + 1 : 1, '#605040'); KB.rect(c, cx + 9 - i, cy - Math.floor(i / 2), 1, i > 0 ? Math.floor(i / 2) * 2 + 1 : 1, '#605040'); }
    KB.rect(c, cx - 1, cy - 1, 3, 3, '#f6ecd4'); KB.rect(c, cx, cy, 1, 1, '#605040');
    // 邊框（雙線 + 角落）
    KB.rect(c, 2, 2, W - 4, 1, '#a08050'); KB.rect(c, 2, H - 3, W - 4, 1, '#a08050'); KB.rect(c, 2, 2, 1, H - 4, '#a08050'); KB.rect(c, W - 3, 2, 1, H - 4, '#a08050');
    KB.rect(c, 5, 5, W - 10, 1, '#c8a870'); KB.rect(c, 5, H - 6, W - 10, 1, '#c8a870'); KB.rect(c, 5, 5, 1, H - 10, '#c8a870'); KB.rect(c, W - 6, 5, 1, H - 10, '#c8a870');
    return cv;
  }
  KB.BG.map = function (ctx) {
    if (!mapCv) mapCv = buildMap();
    ctx.drawImage(mapCv, 0, 0);
  };
})();
