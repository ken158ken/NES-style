// 魔王像素圖（art-bosses）
// 規則：全部面向右、anchor = bottom（底部中央 = 實體 cx/bottom）；程式端 dir<0 時自動水平翻轉。
// 本檔在 world.js 之前載入，故自備 grid/disc/ellipse/outline 等程序式畫布工具。
// 調色：以 KB.PAL.enemy 為底再擴充（見下方 P）。'.' 與 ' ' 為透明；未定義字元會在 console 警告並畫成洋紅。
(function () {
  // ---------------------------------------------------------------------------
  // 調色盤
  // ---------------------------------------------------------------------------
  const P = Object.assign({}, KB.PAL.enemy, {
    x: '#000000', n: '#ffe8c8', N: '#e8c090',
    // 樹皮 / 木頭：h 亮、j 中、J 暗、u 最暗
    h: '#c89058', j: '#9a6638', J: '#5c3a1c', u: '#3a2410',
    // 樹葉：v 亮綠、V 最深綠（g / G 來自 enemy）
    v: '#90e858', V: '#164e18',
    // 雲：W 雲陰影、E 雲深陰影、Q 柔和輪廓（深藍灰）
    W: '#d0d4e6', E: '#aeb4cc', Q: '#2c3350',
    // 魅塔騎士：d 身體藍紫、D 身體暗、z 身體亮
    d: '#4050b0', D: '#262c7a', z: '#7484dc',
    // 其他
    a: '#d8f4ff', q: '#1a1e48', X: '#ff8878', A: '#f4c060',
  });
  const pal = ext => (ext ? Object.assign({}, P, ext) : P);

  // ---------------------------------------------------------------------------
  // 畫布工具（字元格）
  // ---------------------------------------------------------------------------
  const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
  const rowsOf = g => g.map(r => r.join(''));
  const W = g => g[0].length, H = g => g.length;
  const inb = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;
  const get = (g, x, y) => (inb(g, x, y) ? g[y][x] : '.');
  const px = (g, x, y, ch) => { if (inb(g, x, y)) g[y][x] = ch; };
  const rect = (g, x, y, w, h, ch) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, ch); };
  const disc = (g, cx, cy, r, ch) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(g, cx + x, cy + y, ch); };
  const ellipse = (g, cx, cy, rx, ry, ch) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) px(g, cx + x, cy + y, ch); };
  const line = (g, x0, y0, x1, y1, ch) => {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (; ;) { px(g, x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  // 多邊形填色（頂點陣列 [[x,y],...]，掃描線）
  const poly = (g, pts, ch) => {
    const ys = pts.map(p => p[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) px(g, x, y, ch);
    }
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; line(g, p[0], p[1], q[0], q[1], ch); });
  };
  // 內側輪廓：非透明且四鄰為透明（或超出）的像素改為 ch；only 限制可被改的字元
  const outline = (g, ch, only) => {
    const h = H(g), w = W(g), src = g.map(r => r.slice());
    const tr = (x, y) => x < 0 || y < 0 || x >= w || y >= h || src[y][x] === '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] === '.') continue; if (only && !only.includes(src[y][x])) continue;
      if (tr(x - 1, y) || tr(x + 1, y) || tr(x, y - 1) || tr(x, y + 1)) g[y][x] = ch;
    }
  };
  // 邊緣打光：字元 from 的像素，若朝 (dx,dy) 方向 dist 格內碰到透明/非 from，改為 to（用於亮部/暗部）
  const rim = (g, from, to, dx, dy, dist) => {
    const src = g.map(r => r.slice());
    for (let y = 0; y < H(g); y++) for (let x = 0; x < W(g); x++) {
      if (src[y][x] !== from) continue;
      for (let d = 1; d <= (dist || 1); d++) {
        const c = get(src, x + dx * d, y + dy * d);
        if (c !== from) { g[y][x] = to; break; }
      }
    }
  };
  // 將 rows（字串陣列）貼到 g；'.' / ' ' 不覆蓋
  const blit = (g, rows, x, y) => { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') px(g, x + i, y + j, r[i]); }); };
  const blitG = (g, src, x, y) => blit(g, rowsOf(src), x, y);
  const flipH = rows => rows.map(r => r.split('').reverse().join(''));
  const replace = (g, from, to) => { for (const r of g) for (let i = 0; i < r.length; i++) if (r[i] === from) r[i] = to; };
  // 檢查：每幀尺寸一致、所有字元都在調色盤內
  function check(name, frames, p) {
    const w = frames[0][0].length, h = frames[0].length, bad = new Set();
    frames.forEach((f, i) => {
      if (f.length !== h || f.some(r => r.length !== w)) console.warn('[art-bosses] 幀尺寸不一致', name, i);
      for (const r of f) for (const ch of r) if (ch !== '.' && ch !== ' ' && !p[ch]) bad.add(ch);
    });
    if (bad.size) console.warn('[art-bosses] 未定義字元', name, [...bad].join(''));
  }
  // 註冊：frames 為 grid 陣列
  function S(name, grids, opts, ext) {
    const p = pal(ext), frames = grids.map(g => (typeof g[0] === 'string' ? g : rowsOf(g)));
    check(name, frames, p);
    return KB.sprite(name, p, frames, Object.assign({ anchor: 'bottom' }, opts || {}));
  }

  // ===========================================================================
  // W1 大樹威斯比（64×96）：棕色樹幹有臉、多層綠色樹冠、露出的樹根
  // ===========================================================================
  const WW = 64, WH = 96;
  // 樹冠：back 層（深綠、較大、偏下）+ front 層（中綠、偏上）+ 高光；各層各自描邊後疊上，形成葉叢層次
  function crownLayer(discs, fill, hi, lo, k) {
    const g = grid(WW, 60);
    for (const [cx, cy, r] of discs) disc(g, cx, cy, r, fill);
    if (hi) rim(g, fill, hi, -1, -1, 2);
    if (lo) rim(g, fill, lo, 1, 1, 2);
    if (k) outline(g, k);
    return g;
  }
  function crown(sway, droop) {
    const g = grid(WW, 60);
    const s = sway || 0, d = droop || 0;
    // 後層：深綠
    blitG(g, crownLayer([[10, 36 + d, 10], [54, 36 + d, 10], [17, 22 + d, 12], [47, 22 + d, 12], [32 + s, 11, 11], [32, 29 + d, 13]], 'G', null, 'V', 'k'), 0, 0);
    // 中層：主綠
    blitG(g, crownLayer([[14 + s, 30 + d, 9], [50 + s, 30 + d, 9], [23 + s, 17, 10], [41 + s, 17, 10], [32, 26 + d, 11]], 'g', 'v', 'G', 'k'), 0, 0);
    // 前層：小葉叢（亮）
    blitG(g, crownLayer([[32 + s, 8, 7], [20 + s, 27 + d, 6], [44 + s, 27 + d, 6]], 'g', 'v', 'G', 'k'), 0, 0);
    // 蘋果（與掉蘋果攻擊呼應）
    const apple = (x, y) => { disc(g, x, y, 2, 'r'); px(g, x + 1, y + 1, 'R'); px(g, x + 2, y, 'R'); px(g, x, y + 2, 'R'); px(g, x - 1, y - 1, 'X'); px(g, x, y - 3, 'J'); outline(g, 'k', 'rRX'); };
    apple(12 + s, 38 + d); apple(46 + s, 20); apple(55 + s, 36 + d); apple(28 + s, 33 + d);
    return g;
  }
  // 樹幹 + 樹根（整張 64×96）
  function trunk() {
    const g = grid(WW, WH);
    // 主幹（略往下加寬）
    for (let y = 24; y < 84; y++) { const wdn = y >= 66 ? Math.floor((y - 66) / 6) : 0; rect(g, 19 - wdn, y, 26 + wdn * 2, 1, 'j'); }
    // 底部外擴 + 樹根瓣
    for (let y = 84; y < WH; y++) { const e = (y - 84); rect(g, 16 - e, y, 32 + e * 2, 1, 'j'); }
    ellipse(g, 9, 91, 9, 4, 'j'); ellipse(g, 55, 91, 9, 4, 'j');
    ellipse(g, 4, 94, 4, 2, 'j'); ellipse(g, 60, 94, 4, 2, 'j');
    // 打光：左亮右暗
    rim(g, 'j', 'h', -1, 0, 3); rim(g, 'j', 'J', 1, 0, 4);
    for (let y = 84; y < WH; y++) for (let x = 0; x < WW; x++) if (g[y][x] === 'j' && x > 34) g[y][x] = 'J';
    rim(g, 'j', 'J', 0, 1, 1);
    // 樹皮紋理：短直線
    const bark = [[26, 30, 6, 'J'], [33, 36, 5, 'J'], [38, 42, 7, 'u'], [25, 70, 6, 'J'], [31, 76, 5, 'J'], [39, 74, 6, 'u'], [22, 48, 4, 'h'], [22, 60, 5, 'h'], [27, 80, 3, 'J'], [36, 64, 4, 'u']];
    for (const [x, y, l, c] of bark) line(g, x, y, x, y + l, c);
    // 根部溝紋
    line(g, 14, 88, 10, 95, 'u'); line(g, 22, 86, 20, 95, 'u'); line(g, 42, 86, 44, 95, 'u'); line(g, 50, 88, 54, 95, 'u');
    // 樹瘤（左下）
    ellipse(g, 24, 77, 3, 2, 'J'); ellipse(g, 24, 77, 2, 1, 'u'); px(g, 23, 76, 'h');
    outline(g, 'k');
    return g;
  }
  // 臉：貼在樹幹上（局部座標，寬 30 高 34，貼於 x=18, y=44），面向右；鼻子突出樹幹右緣
  const EYE_OPEN = ['.kkk.', 'kkkkk', 'kkwkk', 'kkkkk', '.kkk.'];
  const EYE_BLINK = ['.....', '.....', 'kkkkk', '.....', '.....'];
  const EYE_HURT = ['k...k', '.k.k.', '..k..', '.....', '.....'];      // 皺眉
  function face(mode, opts) {
    opts = opts || {};
    const g = grid(30, 40);
    const eye = mode === 'hurt' ? EYE_HURT : (opts.blink ? EYE_BLINK : EYE_OPEN);
    blit(g, eye, 4, 2); blit(g, eye, 13, 2);
    if (mode === 'hurt') { // 眼淚
      blit(g, ['i', 'i', 'I'], 6, 8); blit(g, ['i', 'i', 'I'], 15, 8);
      blit(g, ['.k.', 'kwk', 'kkk'], 3, 4); blit(g, ['.k.', 'kwk', 'kkk'], 12, 4);
    }
    // 鼻子：大而圓、朝右突出
    ellipse(g, 20, 13, 7, 5, 'h'); rim(g, 'h', 'j', 1, 1, 2); rim(g, 'h', 'j', 0, 1, 1); outline(g, 'k', 'hj');
    px(g, 17, 10, 'n'); px(g, 18, 10, 'n');
    // 嘴
    if (mode === 'blow') {
      // 鼓起的臉頰（鼻子下方、嘴後方）：同樹幹色的隆起，只畫下緣輪廓 + 左上高光弧
      const pf = opts.puff || 0, c = grid(30, 40);
      ellipse(c, 11, 26 + pf, 6 + pf, 5 + pf, 'j'); outline(c, 'k');
      const c2 = grid(30, 40); ellipse(c2, 11, 26 + pf, 4 + pf, 3 + pf, 'h'); outline(c2, 'h');
      for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) {
        if (c[y][x] === 'k' && !(y >= 27 + pf || x <= 6)) c[y][x] = '.';          // 只留下緣與左緣輪廓
        if (c2[y][x] === 'h' && y < 26 + pf && x < 12) c[y][x] = 'h';             // 高光弧（左上）
      }
      blitG(g, c, 0, 0);
      // 嘟起的嘴唇：從樹幹右緣往右凸出，尖端有暗色氣孔
      blit(g, [
        '.....kkkk..',
        '...kkhhhhk.',
        '..khhhhhhkk',
        '.khhhhhkuuk',
        '.khjjjjkuuk',
        '..kjjjjjkk.',
        '...kkkkk...',
      ], 17, 20);
    } else if (mode === 'hurt') {
      // 哭嘴：波浪張口
      blit(g, ['..kkkkkkkk..', '.kuuuuuuuuk.', 'kkuuuuuuuukk', '.k.kk..kk.k.'], 8, 22);
    } else {
      // 寬笑（口腔暗色）
      blit(g, ['k..........k', 'kk........kk', '.kkuuuuuukk.', '..kkkkkkkk..'], 7, 21);
    }
    return g;
  }
  function whispy(mode, opts) {
    opts = opts || {};
    const g = trunk();
    blitG(g, face(mode, opts), 18, 47);
    blitG(g, crown(opts.sway || 0, opts.droop || 0), 0, 0);
    return g;
  }
  S('whispy_idle', [whispy('idle'), whispy('idle', { sway: 1 })], { fps: 3 });
  S('whispy_blow', [whispy('blow'), whispy('blow', { sway: -1, puff: 1 })], { fps: 6 });
  S('whispy_hurt', [whispy('hurt', { droop: 2 })], { fps: 1 });
  // 竄出地面的樹根（16×24）：尖頭、帶側枝
  (function () {
    const g = grid(16, 24);
    poly(g, [[8, 0], [11, 6], [12, 12], [13, 23], [3, 23], [4, 12], [5, 6]], 'j');
    poly(g, [[3, 10], [0, 6], [1, 5], [5, 9], [5, 12]], 'j');
    poly(g, [[12, 14], [15, 11], [15, 13], [12, 17]], 'j');
    rim(g, 'j', 'h', -1, 0, 2); rim(g, 'j', 'J', 1, 0, 2);
    line(g, 8, 4, 8, 20, 'J'); line(g, 7, 12, 7, 22, 'u');
    outline(g, 'k');
    S('whispy_root', [g], { fps: 1 });
  })();

  // ===========================================================================
  // W2 洛洛洛（藍）與拉拉拉（粉紅、蝴蝶結）：20×22 圓身小人；proj_box 16×16 木箱
  // ===========================================================================
  // 腳：A 站立 / B 跨步
  const LL_FOOT = ['.kkk.', 'k###k', '.kkk.'];
  function lolo(col, step, opts) {
    opts = opts || {};
    const { body, hi, lo, cap } = col;
    const g = grid(20, 22);
    disc(g, 10, 10, 8, body);
    rect(g, 0, 11, 3, 2, body); rect(g, 17, 11, 3, 2, body);      // 手臂小突起
    rim(g, body, hi, -1, -1, 1); rim(g, body, lo, 1, 1, 2);
    // 帽子／瀏海：頭頂深色圓帽，下緣鋸齒
    for (let y = 2; y <= 6; y++) for (let x = 0; x < 20; x++) if (g[y][x] !== '.' && (y < 6 || ((x + 1) % 4 < 2))) g[y][x] = cap;
    outline(g, 'k');
    // 臉（面向右）
    const eye = (x, y) => { rect(g, x, y, 2, 3, 'k'); px(g, x, y, 'w'); };
    eye(9, 8); eye(14, 8);
    if (opts.lash) { px(g, 8, 7, 'k'); px(g, 16, 7, 'k'); }
    px(g, 11, 13, 'k'); px(g, 12, 14, 'k'); px(g, 13, 14, 'k'); px(g, 14, 13, 'k');   // 微笑
    px(g, 7, 12, opts.blush); px(g, 17, 12, opts.blush);
    // 腳
    const foot = LL_FOOT.map(r => r.replace(/#/g, lo));
    if (step) { blit(g, foot, 2, 19); blit(g, foot, 13, 19); }
    else { blit(g, foot, 4, 19); blit(g, foot, 11, 19); }
    if (opts.bow) blit(g, opts.bow, 10, 0);
    return g;
  }
  const LOLO_COL = { body: 'b', hi: 'i', lo: 'B', cap: 'B' };
  const LALA_COL = { body: 'p', hi: 'Z', lo: 'P', cap: 'P' };
  const BOW = [
    '.kk...kk.',
    'kXrk.krrk',
    'krrrkrrrk',
    '.kRRkRRk.',
    '..kk.kk..',
  ];
  S('lololo_walk', [lolo(LOLO_COL, false, { blush: 'c' }), lolo(LOLO_COL, true, { blush: 'c' })], { fps: 8 });
  S('lalala_walk', [lolo(LALA_COL, false, { blush: 'X', lash: true, bow: BOW }), lolo(LALA_COL, true, { blush: 'X', lash: true, bow: BOW })], { fps: 8 }, { Z: '#ffd0e8' });
  S('proj_box', [[
    'kkkkkkkkkkkkkkkk',
    'khhhhhhhhhhhhhTk',
    'khtttttttttttTTk',
    'khtStttttttSttTk',
    'khtttttttttttTTk',
    'kTTTTTTTTTTTTTTk',
    'khtttttttttttTTk',
    'khttttthhtttttTk',
    'khttttthhtttttTk',
    'khtttttttttttTTk',
    'kTTTTTTTTTTTTTTk',
    'khtttttttttttTTk',
    'khtStttttttSttTk',
    'khtttttttttttTTk',
    'kTTTTTTTTTTTTTTk',
    'kkkkkkkkkkkkkkkk',
  ]], { fps: 1 });

  // ===========================================================================
  // W3 克拉寇（64×40）：蓬鬆白雲 + 中央大眼 + 藍色尖刺
  // ===========================================================================
  const KW = 64, KH = 40;
  // 尖刺：tip 尖端、(bx,by) 底部中心、hw 底部半寬
  function spike(g, tx, ty, bx, by, hw) {
    const dx = bx - tx, dy = by - ty, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const p1 = [Math.round(bx + nx * hw), Math.round(by + ny * hw)], p2 = [Math.round(bx - nx * hw), Math.round(by - ny * hw)];
    const s = grid(W(g), H(g));
    poly(s, [[tx, ty], p1, p2], 'b');
    rim(s, 'b', 'i', -1, -1, 1); rim(s, 'b', 'B', 1, 1, 1);
    outline(s, 'k');
    blitG(g, s, 0, 0);
  }
  function kracko(mode, f) {
    const g = grid(KW, KH), o = f ? 1 : 0;     // o：第二幀的蓬鬆偏移
    // 尖刺（先畫，底部被雲蓋住）
    spike(g, 32, 0, 32, 10, 3);
    spike(g, 13, 4 + o, 21, 13, 3); spike(g, 51, 4 + o, 43, 13, 3);
    spike(g, 0, 17 - o, 11, 24, 3); spike(g, 63, 17 - o, 52, 24, 3);
    spike(g, 2, 37, 12, 31, 3); spike(g, 61, 37, 51, 31, 3);
    // 雲身：底部大橢圓 + 上方及下方圓凸
    const c = grid(KW, KH);
    const bumps = [[32, 18 + o, 11], [20, 21, 9], [44, 21, 9], [12, 28 - o, 7], [52, 28 - o, 7], [16, 34, 5], [32, 33, 6], [48, 34, 5]];
    ellipse(c, 32, 28, 24, 10, 'L');
    for (const [x, y, r] of bumps) disc(c, x, y, r, 'L');
    rim(c, 'L', 'w', -1, -1, 2); rim(c, 'L', 'W', 1, 1, 2); rim(c, 'L', 'E', 0, 1, 1); rim(c, 'L', 'W', 0, 1, 2);
    // 圓凸間的內側弧線（只保留各凸起輪廓的下半段、且不在外輪廓上）→ 蓬鬆感
    const sil = c.map(r => r.slice()); outline(sil, 'k');
    for (const [x, y, r] of bumps.slice(0, 5)) {
      const b = grid(KW, KH); disc(b, x, y, r, 'L'); outline(b, 'k');
      for (let yy = y + 1; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++)
        if (b[yy] && b[yy][xx] === 'k' && sil[yy][xx] !== 'k' && sil[yy][xx] !== '.') c[yy][xx] = (yy > y + r - 2) ? 'W' : 'E';
    }
    outline(c, 'Q');
    if (mode === 'hurt') { replace(c, 'w', 'L'); }
    blitG(g, c, 0, 0);
    // 眼睛
    const ex = 32, ey = 22 + (f && mode !== 'hurt' ? 0 : 0);
    if (mode === 'hurt') {
      // 閉眼：向下彎的眼皮 + 睫毛、汗滴
      blit(g, ['kk............kk', '..kk........kk..', '....kkkkkkkk....', '...k...kk...k...', '..k..........k..'], ex - 8, ey - 2);
      blit(g, ['.i.', 'iii', 'iIi', '.I.'], 44, 12);
    } else {
      const angry = mode === 'attack';
      const e = grid(KW, KH);
      ellipse(e, ex, ey, 9, 8, 'w'); outline(e, 'k');
      disc(e, ex + 1, ey, 5, angry ? 'r' : 'b'); rim(e, angry ? 'r' : 'b', angry ? 'R' : 'B', 1, 1, 2);
      disc(e, ex + 2, ey + (angry ? 0 : 0), 2, 'x'); px(e, ex + 3, ey - 1, 'x');
      px(e, ex - 1, ey - 3, 'w'); px(e, ex, ey - 3, 'w'); px(e, ex - 1, ey - 2, 'w');
      if (angry) { // 怒眉：眼皮壓下
        for (let x = ex - 9; x <= ex + 9; x++) { const d = Math.abs(x - ex); const top = ey - 8 + Math.floor(d * d / 20); for (let y = ey - 8; y <= top + 1; y++) if (e[y] && e[y][x] !== '.') e[y][x] = (y === top + 1) ? 'k' : '.'; }
      }
      blitG(g, e, 0, 0);
    }
    if (mode === 'attack') {
      // 電光：尖刺尖端的黃色閃電折線（兩幀交替位置）
      const zz = (x, y, dir) => { line(g, x, y, x + 2 * dir, y - 2, 'y'); line(g, x + 2 * dir, y - 2, x + 1 * dir, y - 4, 'F'); px(g, x + 3 * dir, y - 5, 'y'); };
      if (!f) { zz(10, 4, -1); zz(56, 6, 1); zz(2, 20, -1); px(g, 33, 1, 'F'); px(g, 30, 2, 'y'); zz(62, 30, 1); }
      else { zz(16, 2, 1); zz(50, 3, -1); zz(62, 20, 1); px(g, 31, 1, 'F'); px(g, 34, 3, 'y'); zz(1, 32, -1); }
    }
    return g;
  }
  S('kracko_idle', [kracko('idle', 0), kracko('idle', 1)], { fps: 3 });
  S('kracko_attack', [kracko('attack', 0), kracko('attack', 1)], { fps: 8 });
  S('kracko_hurt', [kracko('hurt', 0)], { fps: 1 });

  // ===========================================================================
  // W4 魅塔騎士：藍紫圓球騎士、銀色面具（V 形縫）、黃眼、深紫披風、金劍
  // idle/hurt 24×28、attack 48×30、dash 40×28（身體皆置中、底部對齊）
  // ===========================================================================
  const MK_MASK = [
    '....kkkkkk....',
    '..kkLLLsssk...',
    '.kLLssssssSk..',
    'kLLsssssssSSk.',
    'kkkkkkkkkkkkkk',
    'kqyyyqqqqyyyqk',
    'kqqyyqqqqyyyqk',
    'kssqqqkkkqqssk',
    'kSssqqkkkqqsSk',
    '.kSssqqkqqsSk.',
    '..kSsskkkssSk.',
    '...kkkkkkkkk..',
  ];
  const MK_MASK_HURT = MK_MASK.map(r => r.replace(/y/g, 'q'));
  // 劍：從握點 (hx,hy) 朝 (dx,dy) 方向、長 len
  function sword(g, hx, hy, dx, dy, len) {
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const nx = -dy, ny = dx;
    // 護手（金）
    for (let t = -2; t <= 2; t++) px(g, Math.round(hx + nx * t), Math.round(hy + ny * t), 'y');
    for (let t = -2; t <= 2; t++) px(g, Math.round(hx + nx * t + dx * -1), Math.round(hy + ny * t + dy * -1), 'Y');
    // 劍身（亮銀 + 暗邊）
    for (let s = 1; s <= len; s++) {
      const x = hx + dx * s, y = hy + dy * s;
      px(g, Math.round(x), Math.round(y), s > len - 2 ? 'w' : 'L');
      if (s < len - 1) px(g, Math.round(x + nx), Math.round(y + ny), 's');
    }
    // 劍柄
    px(g, Math.round(hx - dx * 2), Math.round(hy - dy * 2), 'Y'); px(g, Math.round(hx - dx * 3), Math.round(hy - dy * 3), 'Y');
    px(g, Math.round(hx - dx * 4), Math.round(hy - dy * 4), 'y');
  }
  // 披風：polygon（深紫）+ 內側亮紫褶線
  function cape(g, pts, folds) {
    const c = grid(W(g), H(g));
    poly(c, pts, 'M');
    for (const [x0, y0, x1, y1] of (folds || [])) line(c, x0, y0, x1, y1, 'm');
    outline(c, 'k');
    blitG(g, c, 0, 0);
  }
  // 身體：中心 (cx,cy)、半徑 9；面具貼於 (cx-7, cy-8)
  function mkBody(g, cx, cy, mask, lean) {
    const b = grid(W(g), H(g));
    disc(b, cx, cy, 9, 'd');
    rim(b, 'd', 'z', -1, -1, 2); rim(b, 'd', 'D', 1, 1, 3);
    // 肩甲
    ellipse(b, cx - 7, cy - 6, 3, 2, 's'); ellipse(b, cx + 7, cy - 6, 3, 2, 's');
    outline(b, 'k');
    blitG(g, b, 0, 0);
    blit(g, mask, cx - 7 + (lean || 0), cy - 8);
    // 肩甲高光
    px(g, cx - 8, cy - 7, 'L'); px(g, cx + 6, cy - 7, 'L');
  }
  function mkFeet(g, cx, bottom, spread) {
    const f = ['.kkkk.', 'kMmMMk', '.kkkk.'];
    blit(g, f, cx - 6 - (spread || 0), bottom - 3); blit(g, f, cx + 1 + (spread || 0), bottom - 3);
  }
  function mkGlove(g, x, y) { blit(g, ['.kk.', 'kwwk', 'kwsk', '.kk.'], x, y); }
  function metaknight(mode, f) {
    const wide = mode === 'attack' ? 48 : mode === 'dash' ? 40 : 24, h = mode === 'attack' ? 30 : 28;
    const g = grid(wide, h), cx = wide >> 1, bottom = h - 1, cy = bottom - 11;
    if (mode === 'idle' || mode === 'hurt') {
      const flut = f ? 1 : 0;
      if (mode === 'hurt') cape(g, [[cx - 5, cy - 7], [cx - 1, cy - 8], [cx - 2, cy + 6], [cx - 6, cy + 9], [cx - 9, cy + 6], [cx - 8, cy]], [[cx - 6, cy - 4, cx - 6, cy + 5]]);
      else cape(g, [[cx - 6, cy - 7], [cx - 1, cy - 8], [cx - 3, cy + 7], [cx - 6, cy + 9 - flut], [cx - 9, cy + 6 + flut], [cx - 11 - flut, cy + 9], [cx - 10, cy]], [[cx - 6, cy - 4, cx - 5, cy + 5], [cx - 9, cy + 1, cx - 9, cy + 5]]);
      mkFeet(g, cx, bottom, 0);
      mkBody(g, cx, cy, mode === 'hurt' ? MK_MASK_HURT : MK_MASK, 0);
      if (mode === 'hurt') {
        // 眼睛「><」
        blit(g, ['y.y', '.y.', 'y.y'], cx - 5, cy - 3); blit(g, ['y.y', '.y.', 'y.y'], cx + 3, cy - 3);
        blit(g, ['.i', 'iI'], cx + 9, cy - 9);
        sword(g, cx + 9, cy + 8, 1, 0.6, 3);         // 劍垂下
        mkGlove(g, cx + 7, cy + 4);
      } else {
        sword(g, cx + 9, cy + 2, 0, -1, 12);          // 舉劍
        mkGlove(g, cx + 7, cy + 2 + flut);
      }
      mkGlove(g, cx - 10, cy + 3);
    } else if (mode === 'dash') {
      // 披風張成翼形（左後方）
      cape(g, [[cx - 4, cy - 6], [cx - 2, cy - 8], [cx - 8, cy - 13], [cx - 16, cy - 12], [cx - 19, cy - 6], [cx - 18, cy + 1], [cx - 15, cy - 1], [cx - 13, cy + 3], [cx - 10, cy + 1], [cx - 8, cy + 5], [cx - 5, cy + 4]],
        [[cx - 7, cy - 6, cx - 15, cy - 9], [cx - 7, cy - 3, cx - 14, cy - 3]]);
      mkFeet(g, cx, bottom, 1);
      mkBody(g, cx, cy, MK_MASK, 1);
      sword(g, cx + 11, cy + 1, 1, 0, 8);
      mkGlove(g, cx + 8, cy - 1);
      // 速度線
      line(g, cx - 19, cy + 8, cx - 12, cy + 8, 'L'); line(g, cx - 17, cy + 11, cx - 11, cy + 11, 'L');
    } else { // attack：3 幀揮劍
      const lean = f === 0 ? -1 : f === 2 ? 1 : 0;
      cape(g, [[cx - 6, cy - 7], [cx - 1, cy - 8], [cx - 3, cy + 7], [cx - 6 - f, cy + 9], [cx - 10 - f, cy + 5], [cx - 13 - f, cy + 9], [cx - 11 - f, cy]], [[cx - 6, cy - 4, cx - 6, cy + 5], [cx - 9 - f, cy + 1, cx - 9 - f, cy + 5]]);
      mkFeet(g, cx, bottom, f === 2 ? 1 : 0);
      mkBody(g, cx + lean, cy, MK_MASK, 0);
      mkGlove(g, cx - 10, cy + 3);
      if (f === 0) { sword(g, cx + 9, cy - 8, -0.7, -1, 8); mkGlove(g, cx + 6, cy - 7); }
      else if (f === 1) {
        sword(g, cx + 11, cy, 1, 0, 14); mkGlove(g, cx + 8, cy - 2);
        // 揮擊殘影（弧線）
        line(g, cx + 12, cy - 9, cx + 20, cy - 4, 'L'); line(g, cx + 14, cy - 12, cx + 22, cy - 6, 'w');
      } else { sword(g, cx + 10, cy + 7, 1, 0.75, 12); mkGlove(g, cx + 7, cy + 4); line(g, cx + 20, cy - 4, cx + 23, cy + 3, 'L'); }
    }
    return g;
  }
  S('metaknight_idle', [metaknight('idle', 0), metaknight('idle', 1)], { fps: 4 });
  S('metaknight_attack', [metaknight('attack', 0), metaknight('attack', 1), metaknight('attack', 2)], { fps: 10, loop: false });
  S('metaknight_dash', [metaknight('dash', 0)], { fps: 1 });
  S('metaknight_hurt', [metaknight('hurt', 0)], { fps: 1 });

  // ===========================================================================
  // W5 迪迪迪大王：大企鵝國王。紅袍（白毛邊、星星腰帶）、紅帽、黃嘴、藍身、大木鎚（紅黃鎚頭）
  // idle/walk/jump/inhale/hurt 56×56；hammer 72×64（身體置中、底部對齊）
  // ===========================================================================
  // 木鎚：握點 (hx,hy)、角度 ang（弧度，0 = 右、-PI/2 = 上）、握柄長 len；鎚頭為旋轉矩形（半長 7、半厚 5），兩端黃、中段紅
  function hammer(g, hx, hy, ang, len) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const t = grid(W(g), H(g));
    for (let s = 0; s <= len; s++) for (let k = -1; k <= 1; k++) px(t, Math.round(hx + dx * s + nx * k), Math.round(hy + dy * s + ny * k), k === 1 ? 'T' : 't');
    const cxh = hx + dx * (len + 5), cyh = hy + dy * (len + 5);
    for (let y = Math.floor(cyh - 14); y <= Math.ceil(cyh + 14); y++) for (let x = Math.floor(cxh - 14); x <= Math.ceil(cxh + 14); x++) {
      const u = (x - cxh) * nx + (y - cyh) * ny, v = (x - cxh) * dx + (y - cyh) * dy;
      if (Math.abs(u) <= 8.5 && Math.abs(v) <= 5) {
        const au = Math.abs(u), cap = au > 4.5;
        let ch = cap ? 'y' : 'r';
        if (v < -3.2) ch = cap ? 'l' : 'X'; else if (v > 3.2) ch = cap ? 'Y' : 'R';
        if (cap && au < 5.5) ch = 'Y';                       // 端帽與紅色中段的分隔帶
        px(t, x, y, ch);
      }
    }
    outline(t, 'k');
    blitG(g, t, 0, 0);
  }
  const DD_STAR = ['..w..', '.www.', 'wwwww', '.www.', 'w.w.w'];
  const DD_EYE_SPIRAL = ['kkkkk', '....k', '.kk.k', '.k..k', '.kkkk'];
  function ddFoot(g, x, y) {
    const t = grid(W(g), H(g));
    ellipse(t, x, y, 6, 2, 'o'); rim(t, 'o', 'O', 1, 1, 1); rim(t, 'o', 'l', -1, -1, 1); outline(t, 'k');
    px(t, x + 3, y - 2, 'k'); px(t, x + 5, y - 1, 'k');
    blitG(g, t, 0, 0);
  }
  function ddMitten(g, x, y) { const t = grid(W(g), H(g)); disc(t, x, y, 3, 'y'); rim(t, 'y', 'Y', 1, 1, 1); px(t, x - 1, y - 1, 'l'); outline(t, 'k'); blitG(g, t, 0, 0); }
  function ddSleeve(g, x, y) { const t = grid(W(g), H(g)); ellipse(t, x, y, 4, 6, 'r'); rim(t, 'r', 'R', 1, 1, 2); rim(t, 'r', 'X', -1, -1, 1); outline(t, 'k'); blitG(g, t, 0, 0); }
  // 袍子（含肚皮、毛邊、腰帶）：cx 中心、bottom 底部 y、squash 壓扁量、flare 下擺外擴
  function ddRobe(g, cx, bottom, squash, flare) {
    const r = grid(W(g), H(g)), by = bottom - 19 + (squash || 0), ry = 16 - (squash || 0);
    ellipse(r, cx, by, 19 + (flare || 0), ry, 'r');
    ellipse(r, cx + 4, by + 2, 11, 12 - (squash || 0), 'w'); ellipse(r, cx + 4, by + 2, 9, 10 - (squash || 0), 'b');
    rim(r, 'r', 'R', 1, 1, 3); rim(r, 'r', 'X', -1, -1, 1);
    line(r, cx - 16, by - 2, cx - 18, by + 9, 'R'); line(r, cx - 12, by + 4, cx - 13, by + 10, 'R'); line(r, cx + 16, by - 2, cx + 18, by + 8, 'R');
    rim(r, 'b', 'B', 1, 1, 2); rim(r, 'b', 'i', -1, -1, 1);
    // 下擺毛邊（波浪上緣）
    for (let y = bottom - 8; y <= bottom - 3; y++) for (let x = 0; x < W(g); x++) if (r[y][x] !== '.' && y >= bottom - 8 + ((x >> 2) & 1)) r[y][x] = 'w';
    for (let x = 0; x < W(g); x++) for (let y = bottom - 5; y <= bottom - 3; y++) if (r[y][x] === 'w' && (r[y + 1][x] === '.' || y === bottom - 3)) r[y][x] = 'L';
    // 腰帶 + 星星扣
    for (let y = by + 6; y <= by + 9; y++) for (let x = 0; x < W(g); x++) if (r[y][x] !== '.') r[y][x] = y === by + 9 ? 'Y' : 'y';
    blit(r, DD_STAR, cx + 2, by + 5);
    outline(r, 'k');
    blitG(g, r, 0, 0);
  }
  function ddCollar(g, cx, y) { const t = grid(W(g), H(g)); ellipse(t, cx, y, 14, 3, 'w'); rim(t, 'w', 'L', 0, 1, 2); outline(t, 'k'); blitG(g, t, 0, 0); }
  // 頭（含帽子、眼睛、眉毛）；hx,hy 頭中心；expr: 'angry' | 'dizzy'；hatTilt 帽子偏移
  function ddHead(g, hx, hy, expr, hatTilt) {
    const t = grid(W(g), H(g));
    disc(t, hx, hy, 11, 'b'); rim(t, 'b', 'i', -1, -1, 2); rim(t, 'b', 'B', 1, 1, 3); outline(t, 'k');
    blitG(g, t, 0, 0);
    // 帽子
    const h = grid(W(g), H(g)), hxx = hx + (hatTilt || 0), hyy = hy - 14 + (hatTilt ? 1 : 0);
    ellipse(h, hxx, hyy, 12, 5, 'r'); rim(h, 'r', 'R', 1, 1, 2); rim(h, 'r', 'X', -1, -1, 1);
    for (let y = hyy + 3; y <= hyy + 5; y++) for (let x = 0; x < W(g); x++) if (h[y][x] !== '.') h[y][x] = y === hyy + 5 ? 'L' : 'w';
    disc(h, hxx + 10, hyy - 4, 2, 'w'); px(h, hxx + 11, hyy - 3, 'L'); line(h, hxx + 7, hyy - 3, hxx + 9, hyy - 3, 'r');
    outline(h, 'k');
    blitG(g, h, 0, 0);
    // 眼睛
    const e = grid(W(g), H(g));
    ellipse(e, hx - 6, hy - 3, 2, 3, 'w'); ellipse(e, hx + 3, hy - 3, 3, 3, 'w'); outline(e, 'k');
    if (expr === 'dizzy') { blit(e, DD_EYE_SPIRAL, hx - 8, hy - 5); blit(e, DD_EYE_SPIRAL, hx + 1, hy - 5); }
    else { rect(e, hx - 5, hy - 4, 2, 3, 'k'); rect(e, hx + 4, hy - 4, 2, 3, 'k'); }
    blitG(g, e, 0, 0);
    if (expr !== 'dizzy') { // 怒眉 \ /
      line(g, hx - 9, hy - 9, hx - 4, hy - 7, 'k'); line(g, hx - 9, hy - 8, hx - 4, hy - 6, 'k');
      line(g, hx, hy - 7, hx + 7, hy - 9, 'k'); line(g, hx, hy - 6, hx + 7, hy - 8, 'k');
    }
  }
  // 鳥嘴：open 0 閉、1/2 張開程度
  function ddBeak(g, hx, hy, open) {
    const t = grid(W(g), H(g));
    if (!open) {
      poly(t, [[hx + 4, hy - 3], [hx + 24, hy + 2], [hx + 6, hy + 5]], 'y');
      poly(t, [[hx + 6, hy + 5], [hx + 22, hy + 4], [hx + 8, hy + 9]], 'Y');
      rim(t, 'y', 'l', -1, -1, 1); outline(t, 'k');
      line(t, hx + 7, hy + 5, hx + 21, hy + 4, 'k');
    } else {
      const o = open;
      poly(t, [[hx + 5, hy - 1], [hx + 22, hy - 5 - o * 2], [hx + 23, hy + 8 + o * 2], [hx + 7, hy + 6]], 'R');
      poly(t, [[hx + 4, hy - 3], [hx + 23, hy - 6 - o * 3], [hx + 8, hy + 3]], 'y');
      poly(t, [[hx + 6, hy + 5], [hx + 23, hy + 9 + o * 3], [hx + 9, hy + 9]], 'Y');
      rim(t, 'y', 'l', -1, -1, 1); outline(t, 'k');
      // 口腔內側描邊
      line(t, hx + 8, hy + 1, hx + 20, hy - 3 - o * 2, 'k'); line(t, hx + 9, hy + 6, hx + 21, hy + 7 + o * 2, 'k');
    }
    blitG(g, t, 0, 0);
  }
  function dedede(mode, f) {
    const big = mode === 'hammer';
    const w = big ? 72 : 56, h = big ? 64 : 56;
    const g = grid(w, h), cx = w >> 1, bottom = h - 1;
    // 姿勢參數
    let bodyDy = 0, headDx = 0, headDy = 0, fl = cx - 11, fr = cx + 7, feetDy = 0, expr = 'angry', beak = 0, squash = 0, flare = 0, hatTilt = 0;
    let backHammer = { ang: -Math.PI / 2, len: 13 }, frontHammer = null, armL = [cx - 18, 33, cx - 19, 41], armR = [cx + 13, 33, cx + 15, 41];
    if (mode === 'idle') { bodyDy = f ? 1 : 0; }
    else if (mode === 'walk') {
      const sw = [[0, 0], [-4, 4], [0, 0], [4, -4]][f];
      fl += sw[0]; fr += sw[1]; bodyDy = (f & 1) ? -1 : 0;
    }
    else if (mode === 'jump') { fl = cx - 8; fr = cx + 4; feetDy = -3; flare = 1; armL = [cx - 18, 30, cx - 20, 25]; armR = [cx + 13, 30, cx + 16, 25]; backHammer = { ang: -1.9, len: 12 }; }
    else if (mode === 'inhale') { headDx = 2; headDy = 1; beak = f ? 2 : 1; armR = [cx + 13, 34, cx + 17, 38]; bodyDy = 0; }
    else if (mode === 'hurt') { expr = 'dizzy'; squash = 3; headDy = 4; headDx = -1; hatTilt = -3; fl = cx - 14; fr = cx + 10; backHammer = { ang: -2.2, len: 12 }; armL = [cx - 19, 36, cx - 21, 43]; armR = [cx + 14, 36, cx + 17, 43]; }
    else if (mode === 'hammer') {
      backHammer = null;
      if (f === 0) { headDx = -2; armR = [cx + 12, 26, cx + 14, 18]; frontHammer = { hx: cx + 14, hy: 18, ang: -2.05, len: 15 }; }
      else if (f === 1) { headDx = 0; headDy = -1; armR = [cx + 14, 26, cx + 17, 18]; frontHammer = { hx: cx + 17, hy: 18, ang: -1.05, len: 13 }; }
      else { headDx = 3; headDy = 3; squash = 1; fl = cx - 14; fr = cx + 9; armR = [cx + 16, 36, cx + 16, 44]; frontHammer = { hx: cx + 16, hy: 44, ang: 0.7, len: 12 }; }
    }
    const by = bottom + bodyDy, hx = cx - 2 + headDx, hy = by - 35 + headDy + squash;
    // 1. 後方袖子 → 2. 背後的鎚子（握柄壓在袖子前）→ 3. 後方手套握住握柄
    ddSleeve(g, armL[0], armL[1] + bodyDy);
    if (backHammer) hammer(g, armL[2], armL[3] + bodyDy - 2, backHammer.ang, backHammer.len);
    ddMitten(g, armL[2], armL[3] + bodyDy);
    // 3. 腳
    ddFoot(g, fl, bottom - 2 + feetDy); ddFoot(g, fr, bottom - 2 + feetDy);
    // 4. 袍子、5. 頭、6. 領子毛邊、7. 嘴、8. 前方手臂
    ddRobe(g, cx, by - 1, squash, flare);
    ddHead(g, hx, hy, expr, hatTilt);
    ddCollar(g, cx, by - 30 + squash);
    ddBeak(g, hx, hy, beak);
    ddSleeve(g, armR[0], armR[1] + bodyDy); ddMitten(g, armR[2], armR[3] + bodyDy);
    // 9. 前方的鎚子 + 特效
    if (frontHammer) hammer(g, frontHammer.hx, frontHammer.hy, frontHammer.ang, frontHammer.len);
    if (mode === 'hammer' && f === 2) {
      const ix = cx + 26, iy = bottom - 6;
      blit(g, ['F', 'F'], ix, iy - 8); blit(g, ['FF'], ix + 5, iy - 5); blit(g, ['F'], ix - 4, iy - 5);
      disc(g, ix - 8, bottom - 1, 2, 'L'); disc(g, ix + 8, bottom - 1, 2, 'L'); disc(g, ix + 2, bottom - 1, 1, 'w');
    }
    if (mode === 'inhale') { // 吸氣風線
      const yy = hy + 1; for (let i = 0; i < 3; i++) line(g, hx + 25 + i * 2, yy - 6 + i * 6 - (f ? 1 : 0), hx + 29 + i * 2, yy - 6 + i * 6 - (f ? 1 : 0), 'a');
    }
    if (mode === 'hurt') { // 暈眩星星
      blit(g, ['.y.', 'yFy', '.y.'], hx - 14, hy - 16); blit(g, ['.y.', 'yFy', '.y.'], hx + 12, hy - 13); blit(g, ['y'], hx + 2, hy - 19);
    }
    return g;
  }
  S('dedede_idle', [dedede('idle', 0), dedede('idle', 1)], { fps: 2 });
  S('dedede_walk', [dedede('walk', 0), dedede('walk', 1), dedede('walk', 2), dedede('walk', 3)], { fps: 7 });
  S('dedede_jump', [dedede('jump', 0)], { fps: 1 });
  S('dedede_hammer', [dedede('hammer', 0), dedede('hammer', 1), dedede('hammer', 2)], { fps: 6, loop: false });
  S('dedede_inhale', [dedede('inhale', 0), dedede('inhale', 1)], { fps: 6 });
  S('dedede_hurt', [dedede('hurt', 0)], { fps: 1 });
})();
