// 第七世界「夢幻迴廊」美術（Round 7 world7 agent）
// ============================================================================
// 主題 dream：粉紫 / 金 / 深藍的夢境色系（雲朵石 + 星屑邊）。
//   磁磚 tile_dream_{top,topL,topR,fill,left,right,bottom,platform,slopeL,slopeR}（10 種）
//   裝飾層字元（KB.DECO_CHARS.dream = 'cdrsmg'）：
//     c 時鐘(18×28)  d 飄浮門框(22×32)  r 星星燈(14×26, 2幀, 暗房光源)
//     s 小星星(12×12, 2幀)  m 記憶碎片(16×14)  g 夢草叢(16×10, 可燃)
//   ※ game.js drawDark 對非 dedede 主題的發光裝飾字元是 'r' → 星星燈正好當光源。
//   ※ tilemap.js BURN_DECO 沒有列 dream → 預設 'gf'，所以 'g' 夢草叢會燒。
// 新敵人：dreameater（食夢獸，吞投射物再吐回）/ nightlight（夢燈，暗房移動光源）
// 魔王：nightmarecore 夢魘之核（三階段：核心 32×32 / 夢魘騎士 24×32 / 終焉之翼 64×48）
// 本檔在 world.js / world6.js 之後載入，直接用 KB.pix 的畫布工具。
// ============================================================================
(function () {
  'use strict';
  const X = KB.pix;
  const { mk, px, rect, disc, ellipse, line, outline, ring } = X;
  // 在 const.js 的 PAL.dream 上再擴充美術用色
  const P = Object.assign(KB.PAL.dream, {
    n: '#4e3486',   // 雲石內縫
    q: '#d8c0ff',   // 反光
    j: '#ff7ab4',   // 夢粉亮
    J: '#ffe9a0',   // 金亮
    t: '#7a4ec0',   // 夢紫中
    T: '#3c2072',   // 夢紫暗
    a: '#ffffff',
    h: '#20f0c8',   // 時鐘指針青
    o: '#f8a860',   // 木框橘
    O: '#a8642c',
  });

  // ---------- 小工具 ----------
  function chk(name, frames) {
    for (const fr of (typeof frames[0] === 'string' ? [frames] : frames))
      if (fr.length !== 16 || fr.some(r => r.length !== 16)) console.error('[world7] tile size', name, fr.length, fr.map(r => r.length).join(','));
  }
  const tile = (name, rows) => { chk(name, rows); KB.sprite(name, P, rows, { anchor: 'topleft' }); };
  const deco = (name, frames, opts) => KB.sprite(name, P, frames, Object.assign({ anchor: 'bottom' }, opts || {}));
  const S7 = (name, frames, opts) => KB.sprite(name, P, frames, Object.assign({ anchor: 'bottom' }, opts || {}));
  const setCol = (rows, x, ch, y0, y1) => rows.map((r, y) => (y >= (y0 || 0) && y <= (y1 === undefined ? 15 : y1)) ? r.substring(0, x) + ch + r.substring(x + 1) : r);
  const setRow = (rows, y, str) => rows.map((r, i) => i === y ? str : r);
  const mirror = rows => rows.map(r => r.split('').reverse().join(''));
  // 45° 斜坡：dir 'L' → /（右下實心）；'R' → \（左下實心）
  function slope(fill, depth, dir) {
    const out = [];
    for (let y = 0; y < 16; y++) {
      let s = '';
      for (let x = 0; x < 16; x++) {
        const d = dir === 'L' ? x + y - 15 : y - x;
        s += d < 0 ? '.' : (d < depth.length ? depth[d] : fill[y][x]);
      }
      out.push(s);
    }
    return out;
  }
  // 外描邊（outline 是內描邊）
  function rimOut(g, ch) {
    const h = g.length, w = g[0].length, src = g.map(r => r.slice());
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y][x] !== '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] !== '.') continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) g[y][x] = ch;
    }
  }

  // ============================================================================
  // 磁磚：雲朵石（蓬鬆的粉紫色石塊）+ 星屑邊（金色）
  // ============================================================================
  const fill = mk(16, 16, g => {
    rect(g, 0, 0, 16, 16, 'm');
    // 雲朵狀塊面：左上受光、右下陰影
    disc(g, 4, 4, 4, 'l'); disc(g, 11, 3, 3, 'l');
    disc(g, 12, 12, 4, 'M'); disc(g, 3, 12, 3, 'M');
    disc(g, 8, 8, 2, 'l');
    // 內縫（雲石之間的分界）
    line(g, 0, 7, 15, 7, 'n'); line(g, 7, 8, 7, 15, 'n');
    // 邊框
    rect(g, 0, 0, 16, 1, 'M'); rect(g, 0, 0, 1, 16, 'M');
    rect(g, 0, 15, 16, 1, 'd'); rect(g, 15, 0, 1, 16, 'd');
    // 星屑（金）
    px(g, 5, 10, 'y'); px(g, 12, 5, 'y'); px(g, 9, 13, 'Y'); px(g, 2, 5, 'e');
  });
  // 表層：金色星屑邊（上緣一排閃爍星點 + 高光）
  const top = [
    'y.y...y....y..y.',
    'LLLLLLLLLLLLLLLL',
    'llqllllllqllllll',
  ].concat(fill.slice(3));
  const E = { lk: 'k', ls: 'd', from: 3 };
  tile('tile_dream_top', top);
  tile('tile_dream_topL', setCol(setCol(top, 0, E.lk, E.from), 1, E.ls, E.from));
  tile('tile_dream_topR', mirror(setCol(setCol(mirror(top), 0, E.lk, E.from), 1, E.ls, E.from)));
  tile('tile_dream_fill', fill);
  tile('tile_dream_left', setCol(setCol(fill, 0, 'k'), 1, 'd'));
  tile('tile_dream_right', setCol(setCol(fill, 15, 'k'), 14, 'd'));
  tile('tile_dream_bottom', setRow(setRow(fill, 15, 'k'.repeat(16)), 14, 'd'.repeat(16)));
  // 單向平台：飄浮的雲石板，上緣金色星屑、下緣粉色輝光
  tile('tile_dream_platform', [
    '.y...y....y...y.',
    'LLLLLLLLLLLLLLLL',
    'lqllllllllllllql',
    'mmmmmmmmmmmmmmmm',
    'MMMMnMMMMMnMMMMM',
    'dddddddddddddddd',
    '.PP..PP..PP..PP.',
  ].concat(Array.from({ length: 9 }, () => '................')));
  const dep = ['y', 'L', 'l', 'm', 'm', 'M', 'd'];
  tile('tile_dream_slopeL', slope(fill, dep, 'L'));
  tile('tile_dream_slopeR', slope(fill, dep, 'R'));

  // ============================================================================
  // 裝飾
  // ============================================================================
  // c 時鐘 18×28：落地擺鐘（金框圓面 + 指針 + 鐘擺）
  deco('deco_dream_c', [mk(18, 28, g => {
    rect(g, 2, 4, 14, 24, 'T');          // 鐘身
    rect(g, 3, 5, 12, 22, 't');
    rect(g, 4, 26, 10, 2, 'T');
    // 頂冠
    rect(g, 1, 2, 16, 3, 'Y'); rect(g, 2, 2, 14, 1, 'y'); px(g, 9, 0, 'y'); px(g, 8, 1, 'y'); px(g, 10, 1, 'y');
    // 錶面
    disc(g, 9, 11, 6, 'Y'); disc(g, 9, 11, 5, 'e'); disc(g, 9, 11, 4, 'w');
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; px(g, Math.round(9 + Math.cos(a) * 4), Math.round(11 + Math.sin(a) * 4), 'Y'); }
    line(g, 9, 11, 9, 8, 'k'); line(g, 9, 11, 12, 12, 'h');
    px(g, 9, 11, 'k');
    // 鐘擺
    rect(g, 8, 18, 2, 6, 'Y'); disc(g, 9, 24, 2, 'y');
    outline(g, 'k', ['t', 'T', 'Y']);
  })]);

  // d 飄浮門框 22×32：懸空的門框，框內是流動的夢境漩渦
  deco('deco_dream_d', [mk(22, 32, g => {
    // 框內漩渦
    for (let y = 5; y < 30; y++) for (let x = 4; x < 18; x++) {
      const dx = x - 11, dy = y - 17;
      const d = Math.sqrt(dx * dx + dy * dy * 0.7);
      const a = Math.atan2(dy, dx) * 2 + d * 0.6;
      px(g, x, y, ((Math.sin(a) > 0.2) ? 'T' : (Math.sin(a) > -0.4 ? 't' : 'V')));
    }
    // 門框
    rect(g, 1, 2, 20, 3, 'O'); rect(g, 2, 2, 18, 1, 'o');
    rect(g, 1, 2, 3, 30, 'O'); rect(g, 2, 3, 1, 28, 'o');
    rect(g, 18, 2, 3, 30, 'O'); rect(g, 19, 3, 1, 28, 'O');
    rect(g, 1, 29, 20, 3, 'O'); rect(g, 2, 31, 18, 1, 'O');
    // 框上的金飾
    px(g, 10, 0, 'y'); px(g, 9, 1, 'y'); px(g, 11, 1, 'y');
    px(g, 3, 6, 'y'); px(g, 18, 6, 'y'); px(g, 3, 27, 'y'); px(g, 18, 27, 'y');
    outline(g, 'k', ['o', 'O']);
  })]);

  // r 星星燈 14×26（2 幀，暗房光源）：燈柱上的金色星形提燈
  const lamp = ph => mk(14, 26, g => {
    rect(g, 5, 12, 4, 12, 'S'); rect(g, 6, 12, 1, 12, 's');
    rect(g, 3, 24, 8, 2, 'S'); rect(g, 4, 24, 6, 1, 's');
    // 星形提燈（五芒星）
    const R = 6 + ph;
    for (let i = 0; i < 10; i++) {
      const r0 = i % 2 ? 2.6 : R, a0 = -Math.PI / 2 + i * Math.PI / 5;
      const r1 = (i + 1) % 2 ? 2.6 : R, a1 = -Math.PI / 2 + (i + 1) * Math.PI / 5;
      line(g, Math.round(7 + Math.cos(a0) * r0), Math.round(8 + Math.sin(a0) * r0),
        Math.round(7 + Math.cos(a1) * r1), Math.round(8 + Math.sin(a1) * r1), 'y');
    }
    disc(g, 7, 8, 3, 'J'); disc(g, 7, 8, 2, 'w');
    outline(g, 'Y', ['y']);
    for (const [x, y] of [[1, 3], [12, 5], [2, 11], [11, 12]]) px(g, x, y, (x + y + Math.round(ph * 2)) % 2 ? 'e' : 'y');
    outline(g, 'k', ['S', 's']);
  });
  deco('deco_dream_r', [lamp(0), lamp(1)], { fps: 4 });

  // s 小星星 12×12（2 幀）：四芒星（粉金）
  const star4 = big => mk(12, 12, g => {
    for (let i = 0; i < 6; i++) {
      const w = big ? [5, 4, 3, 2, 1, 1][i] : [4, 3, 2, 1, 1, 0][i];
      for (let d = -w; d <= w; d++) { px(g, 6 + d, 6 - i, i < 2 ? 'w' : 'y'); px(g, 6 + d, 5 + i, i < 2 ? 'w' : 'y'); }
    }
    for (let i = 0; i < 6; i++) {
      const w = big ? [5, 4, 3, 2, 1, 1][i] : [4, 3, 2, 1, 1, 0][i];
      for (let d = -w; d <= w; d++) { px(g, 6 - i, 6 + d, i < 2 ? 'w' : 'y'); px(g, 5 + i, 6 + d, i < 2 ? 'w' : 'y'); }
    }
    outline(g, 'p', ['y']);
  });
  deco('deco_dream_s', [star4(true), star4(false)], { fps: 3 });

  // m 記憶碎片 16×14：斜插在地上的鏡片，鏡面映著過往的風景
  deco('deco_dream_m', [mk(16, 14, g => {
    const poly = [[3, 13], [1, 6], [6, 0], [13, 3], [14, 10], [8, 13]];
    for (let y = 0; y < 14; y++) {
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) px(g, x, y, y < 7 ? 'c' : 'C');
    }
    // 鏡中的風景（小山丘 + 星）
    rect(g, 4, 9, 8, 4, 'V'); px(g, 6, 8, 'V'); px(g, 9, 8, 'V');
    px(g, 5, 3, 'w'); px(g, 10, 5, 'e');
    for (let i = 0; i < 6; i++) px(g, 4 + i, 9 - i, 'L');
    outline(g, 'k');
  })]);

  // g 夢草叢 16×10（可燃）：星屑草
  deco('deco_dream_g', [mk(16, 10, g => {
    for (const [x, h, ch] of [[2, 5, 't'], [4, 7, 'v'], [6, 9, 'p'], [8, 8, 'v'], [10, 6, 't'], [12, 8, 'p'], [14, 5, 'v']]) {
      for (let i = 0; i < h; i++) px(g, x + (i > h - 3 ? 1 : 0), 9 - i, ch);
    }
    outline(g, 'k');
    px(g, 6, 0, 'y'); px(g, 12, 1, 'y'); px(g, 4, 2, 'e');
  })]);

  KB.DECO_CHARS = KB.DECO_CHARS || {};
  KB.DECO_CHARS.dream = 'cdrsmg';

  // ============================================================================
  // 新敵人像素圖
  // ============================================================================
  // dreameater 食夢獸 18×16：圓滾滾的紫色貘 —— 長鼻子（右）+ 大嘴 + 背上的夢紋
  const eater = (step, open) => mk(18, 16, g => {
    // 腳
    for (const fx of (step ? [4, 12] : [5, 11])) { rect(g, fx, 13, 3, 3, 'V'); px(g, fx, 15, 'T'); }
    // 身體
    ellipse(g, 8, 8, 7, 6, 't');
    // 受光 / 陰影
    for (let y = 0; y < 16; y++) for (let x = 0; x < 18; x++) {
      if (g[y][x] !== 't') continue;
      const dx = x - 5, dy = y - 5;
      if (dx * dx + dy * dy < 14) g[y][x] = 'v';
      if (x > 10 && y > 9) g[y][x] = 'T';
    }
    // 背上的夢紋（三顆星點）
    for (let i = 0; i < 3; i++) px(g, 5 + i * 3, 2 + (i % 2), 'p');
    // 長鼻子（往右前方伸）
    rect(g, 14, 6, 4, 2, open ? 'v' : 't'); rect(g, 16, 8, 2, 2, open ? 'v' : 't');
    px(g, 17, 5, open ? 'v' : 't');
    // 嘴（張開時是吸東西的大洞 + 上下兩排牙）
    if (open) {
      ellipse(g, 11, 10, 5, 4, 'k');
      ellipse(g, 11, 11, 4, 2, 'P');
      for (const tx of [8, 10, 12, 14]) { px(g, tx, 7, 'w'); px(g, tx, 8, 'w'); }
      for (const tx of [9, 11, 13]) px(g, tx, 13, 'w');
    } else {
      rect(g, 9, 11, 6, 1, 'k'); px(g, 15, 10, 'k');
    }
    // 眼睛
    rect(g, 5, 4, 3, 4, 'w'); rect(g, 6, 5, 2, 2, 'k');
    rect(g, 10, 4, 3, 4, 'w'); rect(g, 11, 5, 2, 2, 'k');
    outline(g, 'k', ['t', 'v', 'T', 'V', 'p']);
  });
  KB.sprite('dreameater_walk', P, [eater(false, false), eater(true, false)], { fps: 5, anchor: 'bottom' });
  KB.sprite('dreameater_attack', P, [eater(false, true), eater(true, true)], { fps: 8, anchor: 'bottom' });

  // nightlight 夢燈 14×18：飄浮的提燈精靈（燈罩 + 小火光 + 兩隻小手）
  const nlight = (ph, off) => mk(14, 18, g => {
    // 提把
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; px(g, Math.round(7 + Math.cos(a) * 4), Math.round(4 + Math.sin(a) * 3), 'Y'); }
    // 燈罩
    rect(g, 2, 4, 10, 2, 'Y'); rect(g, 3, 4, 8, 1, 'y');
    rect(g, 3, 6, 8, 8, off ? 'S' : 'J');
    if (!off) { disc(g, 7, 10, 3, 'w'); disc(g, 7, 11, 2, 'a'); }
    else { disc(g, 7, 10, 2, 's'); }
    rect(g, 2, 14, 10, 2, 'Y'); rect(g, 3, 15, 8, 1, 'Y');
    // 玻璃格線
    px(g, 5, 7, 'Y'); px(g, 5, 12, 'Y'); px(g, 9, 7, 'Y'); px(g, 9, 12, 'Y');
    // 眼睛（燈罩上）
    px(g, 5, 9 + (ph ? 1 : 0), 'k'); px(g, 9, 9 + (ph ? 1 : 0), 'k');
    // 小手
    ellipse(g, 1, 10 + (ph ? 1 : 0), 1, 1, 'p'); ellipse(g, 12, 10 - (ph ? 1 : 0), 1, 1, 'p');
    // 下方的光滴
    if (!off) { px(g, 7, 17, 'J'); px(g, 6, 16, 'y'); px(g, 8, 16, 'y'); }
    outline(g, 'k', ['Y', 'S', 's']);
  });
  KB.sprite('nightlight_fly', P, [nlight(false, false), nlight(true, false)], { fps: 5, anchor: 'bottom' });
  KB.sprite('nightlight_attack', P, [nlight(true, false), nlight(false, false)], { fps: 12, anchor: 'bottom' });
  KB.sprite('nightlight_off', P, [nlight(false, true), nlight(true, true)], { fps: 4, anchor: 'bottom' });

  // 夢之開關（KB.ITEMS.dreamswitch）16×16，3 幀：0 未輪到（暗）/ 1 輪到它（金色發光）/ 2 已按下（沉下去）
  const dsw = st => mk(16, 16, g => {
    // 底座
    rect(g, 1, st === 2 ? 8 : 6, 14, st === 2 ? 8 : 10, 'M');
    rect(g, 2, st === 2 ? 9 : 7, 12, 1, 'l');
    rect(g, 1, 14, 14, 2, 'd');
    // 星形寶石
    const cy = st === 2 ? 11 : 9;
    const col = st === 0 ? 'S' : st === 1 ? 'y' : 'c';
    const hi = st === 0 ? 's' : st === 1 ? 'J' : 'w';
    for (let i = 0; i < 4; i++) {
      const w = [4, 3, 2, 1][i];
      for (let d = -w; d <= w; d++) { px(g, 8 + d, cy - i, i < 1 ? hi : col); px(g, 8 + d, cy + i, i < 1 ? hi : col); }
    }
    for (let i = 0; i < 4; i++) {
      const w = [4, 3, 2, 1][i];
      for (let d = -w; d <= w; d++) { px(g, 8 - i, cy + d, i < 1 ? hi : col); px(g, 8 + i, cy + d, i < 1 ? hi : col); }
    }
    if (st === 1) { px(g, 5, cy - 3, 'w'); px(g, 11, cy + 3, 'w'); }
    outline(g, 'k', ['M', 'l', 'd']);
    outline(g, 'Y', [col]);
  });
  KB.sprite('item_dreamswitch', P, [dsw(0), dsw(1), dsw(2)], { fps: 3, anchor: 'bottom' });

  // ============================================================================
  // 魔王：夢魘之核（三階段）
  // ============================================================================
  const NM = Object.assign({}, P, {
    k: '#0a0620', b: '#241a6e', B: '#150e44', h: '#573aa8', H: '#7a52d8',
    w: '#ffffff', e: '#e8d8ff', r: '#ff4a86', R: '#a81c50', v: '#b672f0', c: '#7ce4ff', y: '#ffd85c',
    L: '#c8a8ff', Q: '#ffeeff', g: '#20f0c8',
  });
  const NS = (n, f, o) => KB.sprite(n, NM, f, Object.assign({ anchor: 'bottom' }, o || {}));

  // ---- 一階段：核心（32×32 懸浮球體）----
  function core(o) {
    o = o || {};
    const g = X.grid(32, 32);
    const by = o.by || 0;
    disc(g, 16, 16 + by, 14, 'b');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (g[y][x] !== 'b') continue;
      const dx = x - 11, dy = y - (11 + by);
      if (dx * dx + dy * dy < 40) g[y][x] = 'h';
      if (x - 16 > 5 && y - (16 + by) > 4) g[y][x] = 'B';
    }
    // 表面的夢紋（旋轉的環）
    const sp = o.spin || 0;
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2 + sp;
      px(g, Math.round(16 + Math.cos(a) * 11), Math.round(16 + by + Math.sin(a) * 5), i % 4 < 2 ? 'v' : 'H');
    }
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2 - sp * 0.7;
      px(g, Math.round(16 + Math.cos(a) * 5), Math.round(16 + by + Math.sin(a) * 11), i % 5 < 2 ? 'c' : 'h');
    }
    // 中央的眼
    const open = o.open !== false;
    if (open) {
      ellipse(g, 16, 16 + by, 8, 5, 'w');
      ellipse(g, 16, 16 + by, 7, 4, o.rage ? 'r' : 'y');
      ellipse(g, 16 + (o.look || 0), 16 + by, 3, 4, 'k');
      ellipse(g, 16 + (o.look || 0), 15 + by, 1, 2, 'w');
    } else {
      rect(g, 9, 16 + by, 14, 2, 'k'); rect(g, 10, 15 + by, 12, 1, 'H');
    }
    outline(g, 'k', ['b', 'B', 'h']);
    rimOut(g, 'L');
    return X.gRows(g);
  }
  NS('nightmarecore_idle', [core({ spin: 0 }), core({ spin: 0.5, by: 1 })], { fps: 4 });
  NS('nightmarecore_attack', [core({ spin: 1.0, rage: true, look: -1 }), core({ spin: 1.5, rage: true, look: 1 })], { fps: 8 });
  NS('nightmarecore_hurt', [core({ spin: 2.0, open: false, by: 1 })], { fps: 1 });
  NS('nightmarecore_bare', [core({ spin: 0.2, rage: true, by: -1 }), core({ spin: 0.9, rage: true, by: 0 })], { fps: 6 });

  // 護盾碎片 12×12：帶金邊的紫色菱形
  const shard = crack => mk(12, 12, g => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (Math.abs(x - 5.5) / 5.5 + Math.abs(y - 5.5) / 5.5 <= 1) px(g, x, y, x + y < 11 ? 'H' : 'h');
    }
    if (crack) { line(g, 5, 1, 7, 10, 'k'); line(g, 2, 6, 9, 4, 'k'); }
    outline(g, 'y');
    px(g, 4, 4, 'w');
  });
  KB.sprite('nm_shard', NM, [shard(false), shard(true)], { fps: 6, anchor: 'center' });

  // ---- 二階段：夢魘騎士（24×32 披風劍士）----
  function knight(o) {
    o = o || {};
    const g = X.grid(24, 32);
    const by = o.by || 0;
    const top = 10 + by;
    // 披風（梯形，下擺帶鋸齒）
    for (let y = top; y <= 30; y++) {
      const k = (y - top) / (30 - top);
      const w = Math.round(3 + k * 6) + (o.open ? Math.round(k * 4) : 0);
      for (let x = 10 - w; x <= 11 + w; x++) px(g, x, y, x < 10 ? 'h' : 'b');
    }
    for (let x = 0; x < 24; x++) { const cut = 30 - ((x * 7) % 3); for (let y = cut + 1; y < 32; y++) px(g, x, y, '.'); }
    // 腳
    ellipse(g, 7, 31, 2, 1, 'B'); ellipse(g, 14, 31, 2, 1, 'B');
    // 兜帽（尖頭）
    for (let y = by + 1; y <= by + 5; y++) { const w = y - by; for (let x = 10 - w; x <= 11 + w; x++) px(g, x, y, x < 10 ? 'h' : 'B'); }
    ellipse(g, 10, by + 8, 6, 5, 'B');
    ellipse(g, 8, by + 7, 3, 3, 'h');
    // 帽緣下的黑暗 + 發光雙眼
    ellipse(g, 10, by + 9, 4, 3, 'k');
    for (const ex of [8, 12]) { px(g, ex, by + 8, o.rage ? 'r' : 'y'); px(g, ex, by + 9, o.rage ? 'r' : 'y'); px(g, ex + (ex < 10 ? -1 : 1), by + 9, 'w'); }
    // 肩甲
    ellipse(g, 3, top + 3, 3, 2, 'H'); ellipse(g, 18, top + 3, 3, 2, 'H');
    px(g, 3, top + 1, 'y'); px(g, 18, top + 1, 'y');
    // 劍（右手，斜向右上；swingY 決定劈砍的高度）
    if (o.sword !== false) {
      const sy = (o.swingY !== undefined ? o.swingY : 15) + by;
      rect(g, 17, sy, 2, 4, 'H');                       // 握把
      rect(g, 16, sy - 1, 4, 1, 'y');                   // 護手
      for (let i = 0; i < 15; i++) {                    // 劍身
        const bx = 17 + Math.round(i * 0.28), byy = sy - 2 - i;
        px(g, bx, byy, i > 12 ? 'w' : 'e');
        px(g, bx + 1, byy, i > 12 ? 'e' : 'L');
      }
      if (o.rage) for (let i = 0; i < 15; i += 2) px(g, 17 + Math.round(i * 0.28) + 2, sy - 2 - i, 'v');
    }
    outline(g, 'k', ['b', 'B', 'h', 'H']);
    rimOut(g, 'L');
    return X.gRows(g);
  }
  NS('nightknight_idle', [knight({}), knight({ by: 1 })], { fps: 4 });
  NS('nightknight_attack', [knight({ rage: true, swingY: 8 }), knight({ rage: true, swingY: 15 }), knight({ rage: true, swingY: 21 })], { fps: 12, loop: false });
  NS('nightknight_cape', [knight({ open: true }), knight({ open: true, by: 1, rage: true })], { fps: 6 });
  NS('nightknight_hurt', [knight({ by: 1, sword: false })], { fps: 1 });

  // ---- 三階段：終焉之翼（64×48 巨大翅膀）----
  function wings(o) {
    o = o || {};
    const g = X.grid(64, 48);
    const sp = o.spread === undefined ? 1 : o.spread;   // 0 收攏 ~ 1 全張
    const drawWing = (dir) => {
      const cx = 32;
      for (let k = 0; k < 5; k++) {                      // 5 根羽骨
        const ang = (-0.85 + k * 0.34) * (0.35 + sp * 0.65);
        const len = (30 - k * 2) * (0.45 + sp * 0.55);
        for (let i = 0; i < len; i++) {
          const x = Math.round(cx + dir * (6 + i * Math.cos(ang)));
          const y = Math.round(20 + i * Math.sin(ang) + (o.flap || 0) * (i / len) * (k - 2));
          for (let t = 0; t < 4 - Math.floor(i / 12); t++) px(g, x, y + t, i > len - 4 ? 'y' : (i % 7 < 3 ? 'b' : 'B'));
        }
      }
      // 翼膜
      for (let y = 10; y < 44; y++) for (let i = 0; i < 26; i++) {
        const x = cx + dir * (6 + i);
        if (g[y] && g[y][x] === '.' && g[y - 1] && g[y - 1][x] !== '.' && g[Math.min(47, y + 3)] && g[Math.min(47, y + 3)][x] !== '.') px(g, x, y, 'B');
      }
    };
    drawWing(1); drawWing(-1);
    // 中央的核心（小一號的球體 + 眼）
    disc(g, 32, 20, 9, 'h');
    disc(g, 30, 18, 5, 'H');
    ellipse(g, 32, 20, 6, 4, 'w'); ellipse(g, 32, 20, 5, 3, o.rage === false ? 'y' : 'r');
    ellipse(g, 32 + (o.look || 0), 20, 2, 3, 'k'); px(g, 32 + (o.look || 0), 19, 'w');
    // 核心下方的長袍殘影
    for (let y = 28; y < 46; y++) { const w = Math.max(0, 8 - Math.floor((y - 28) / 3)); for (let x = 32 - w; x <= 32 + w; x++) if ((x + y) % 5) px(g, x, y, y > 38 ? 'B' : 'b'); }
    outline(g, 'k', ['b', 'B', 'h', 'H']);
    rimOut(g, 'L');
    return X.gRows(g);
  }
  NS('nmwing_idle', [wings({ flap: 0 }), wings({ flap: 1.2 })], { fps: 4 });
  NS('nmwing_attack', [wings({ flap: -1.4, look: -1 }), wings({ flap: 1.6, look: 1 })], { fps: 8 });
  NS('nmwing_dive', [wings({ spread: 0.35, flap: 0 }), wings({ spread: 0.2, flap: 0.6 })], { fps: 8 });
  NS('nmwing_hurt', [wings({ spread: 0.6, flap: 2, rage: false })], { fps: 1 });

  // ============================================================================
  // 投射物
  // ============================================================================
  // 夢彈（扇形彈幕）10×10
  KB.sprite('proj_dreambullet', NM, [mk(10, 10, g => {
    disc(g, 5, 5, 4, 'v'); disc(g, 4, 4, 2, 'L'); px(g, 3, 3, 'w');
    outline(g, 'k');
  }), mk(10, 10, g => {
    disc(g, 5, 5, 4, 'H'); disc(g, 5, 5, 2, 'v'); px(g, 6, 6, 'B');
    outline(g, 'k');
  })], { fps: 12, anchor: 'center' });

  // 羽毛（全畫面羽毛雨）10×16
  KB.sprite('proj_feather', NM, [mk(10, 16, g => {
    for (let y = 1; y < 15; y++) { const w = Math.round(3.4 * Math.sin((y - 1) / 14 * Math.PI)); for (let x = 5 - w; x <= 5 + w; x++) px(g, x, y, x < 5 ? 'h' : 'b'); }
    line(g, 5, 0, 5, 15, 'L'); px(g, 5, 0, 'y'); px(g, 5, 15, 'y');
    outline(g, 'k');
  }), mk(10, 16, g => {
    for (let y = 1; y < 15; y++) { const w = Math.round(3.0 * Math.sin((y - 1) / 14 * Math.PI)); for (let x = 4 - w; x <= 4 + w; x++) px(g, x, y, x < 4 ? 'H' : 'h'); }
    line(g, 4, 0, 4, 15, 'e'); px(g, 4, 0, 'y');
    outline(g, 'k');
  })], { fps: 8, anchor: 'center' });

  // 夢魘騎士的劍氣 18×10
  KB.sprite('proj_nightslash', NM, [mk(18, 10, g => {
    for (let x = 0; x < 18; x++) { const h = Math.round(4 * Math.sin(x / 17 * Math.PI)) + 1; for (let y = 5 - h; y <= 4 + h; y++) px(g, x, y, x > 9 ? 'v' : 'H'); }
    outline(g, 'y');
  }), mk(18, 10, g => {
    for (let x = 0; x < 18; x++) { const h = Math.round(3 * Math.sin(x / 17 * Math.PI)) + 1; for (let y = 5 - h; y <= 4 + h; y++) px(g, x, y, x > 9 ? 'e' : 'v'); }
    outline(g, 'y');
  })], { fps: 12, anchor: 'center' });

  // 食夢獸吐回的夢泡（被吞掉的投射物）12×12
  KB.sprite('proj_dreamspit', NM, [mk(12, 12, g => {
    ring(g, 6, 6, 5, 'c'); disc(g, 6, 6, 4, 'v'); disc(g, 5, 5, 2, 'L'); px(g, 4, 4, 'w');
    outline(g, 'k', ['v']);
  }), mk(12, 12, g => {
    ring(g, 6, 6, 5, 'L'); disc(g, 6, 6, 4, 'H'); disc(g, 7, 7, 2, 'v');
    outline(g, 'k', ['H']);
  })], { fps: 10, anchor: 'center' });

  void ellipse; void ring;
})();
