// 第六世界「星之彼端」美術（Round 6 world6 agent）
// ============================================================================
// 主題 space：紫藍色金屬 + 星光邊。磁磚 tile_space_{top,topL,topR,fill,left,right,bottom,platform,slopeL,slopeR}
// 裝飾層字元（KB.DECO_CHARS.space = 'cprsgm'）：
//   c 水晶(14×26)  p 星球模型(24×30)  r 傳送環(20×26, 2幀, 暗房光源)  s 星辰(12×12, 2幀)  g 晶簇(16×12)  m 隕石(20×14)
//   ※ game.js drawDark 對非 dedede 主題的發光裝飾字元是 'r' → 空間站的傳送環正好當光源。
// 新敵人：meteorite（隕石）/ starling（星靈）/ voidling（虛空）
// 魔王：shadowkirby（暗影卡比，24×24）+ shadowclone（影分身，18×18）
// 本檔在 world.js / backgrounds.js 之後載入，直接用 KB.pix 的畫布工具。
// ============================================================================
(function () {
  'use strict';
  const X = KB.pix;
  const { mk, px, rect, disc, ellipse, line, outline, blit, ring, clear } = X;
  const PAL = KB.PAL;
  // 在 const.js 的 PAL.space 上再擴充美術用色
  const P = Object.assign(PAL.space, {
    n: '#2a2c58',   // 面板內縫
    q: '#9aa0e8',   // 金屬反光
    j: '#ff8040',   // 隕石火焰
    J: '#ffd060',   // 火焰亮
    g: '#60f0c0',   // 螢光綠青
    G: '#1e9a78',
    a: '#ffffff',
    t: '#6a3ca8',   // 星雲紫中
    T: '#3c1c68',
  });

  // ---------- 小工具 ----------
  function chk(name, frames) {
    for (const fr of (typeof frames[0] === 'string' ? [frames] : frames))
      if (fr.length !== 16 || fr.some(r => r.length !== 16)) console.error('[world6] tile size', name, fr.length, fr.map(r => r.length).join(','));
  }
  const tile = (name, rows) => { chk(name, rows); KB.sprite(name, P, rows, { anchor: 'topleft' }); };
  const deco = (name, frames, opts) => KB.sprite(name, P, frames, Object.assign({ anchor: 'bottom' }, opts || {}));
  const setCol = (rows, x, ch, y0, y1) => rows.map((r, y) => (y >= (y0 || 0) && y <= (y1 === undefined ? 15 : y1)) ? r.substring(0, x) + ch + r.substring(x + 1) : r);
  const setRow = (rows, y, str) => rows.map((r, i) => i === y ? str : r);
  const mirror = rows => rows.map(r => r.split('').reverse().join(''));
  const patch = (rows, list) => { const g = rows.map(r => r.split('')); for (const [x, y, ch] of list) if (g[y] && g[y][x] !== undefined) g[y][x] = ch; return g.map(r => r.join('')); };
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

  // ============================================================================
  // 磁磚
  // ============================================================================
  // 內裝甲板：深紫藍金屬、面板縫、鉚釘與微弱的迴路線
  const fill = mk(16, 16, g => {
    rect(g, 0, 0, 16, 16, 'm');
    rect(g, 0, 0, 16, 1, 'M'); rect(g, 0, 0, 1, 16, 'M');
    rect(g, 0, 15, 16, 1, 'd'); rect(g, 15, 0, 1, 16, 'd');
    rect(g, 7, 1, 1, 14, 'n'); rect(g, 1, 7, 14, 1, 'n');
    for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) { px(g, x, y, 'q'); px(g, x + 1, y, 'M'); px(g, x, y + 1, 'M'); }
    // 迴路：兩段淡青色細線
    line(g, 2, 5, 5, 5, 'C'); line(g, 5, 5, 5, 2, 'C'); px(g, 5, 2, 'c');
    line(g, 10, 13, 13, 13, 'C'); line(g, 13, 13, 13, 10, 'C'); px(g, 13, 10, 'c');
  });
  // 表層：星光邊（青白高光 + 閃點）
  const top = [
    'cwccccwcccccwccc',
    'LLLLLLLLLLLLLLLL',
    'lllmlllllmllllml',
  ].concat(fill.slice(3));
  const E = { lk: 'k', ls: 'd', rk: 'k', rs: 'd', bk: 'k', bs: 'd', from: 3 };
  tile('tile_space_top', top);
  tile('tile_space_topL', setCol(setCol(top, 0, E.lk, E.from), 1, E.ls, E.from));
  tile('tile_space_topR', mirror(setCol(setCol(mirror(top), 0, E.lk, E.from), 1, E.ls, E.from)));
  tile('tile_space_fill', fill);
  tile('tile_space_left', setCol(setCol(fill, 0, E.lk), 1, E.ls));
  tile('tile_space_right', setCol(setCol(fill, 15, E.rk), 14, E.rs));
  tile('tile_space_bottom', setRow(setRow(fill, 15, 'k'.repeat(16)), 14, 'd'.repeat(16)));
  // 單向平台：懸浮金屬板，上緣星光、下緣青色輝光
  tile('tile_space_platform', [
    '.c...c....c...c.',
    'LLLLLLLLLLLLLLLL',
    'lqllllllllllllql',
    'mmmmmmmmmmmmmmmm',
    'MMMMnMMMMMnMMMMM',
    'dddddddddddddddd',
    '.CC..CC..CC..CC.',
  ].concat(Array.from({ length: 9 }, () => '................')));
  const dep = ['c', 'L', 'l', 'm', 'm', 'M', 'd'];
  tile('tile_space_slopeL', slope(fill, dep, 'L'));
  tile('tile_space_slopeR', slope(fill, dep, 'R'));

  // ============================================================================
  // 裝飾
  // ============================================================================
  // c 水晶 14×26：雙柱六角晶體，內部漸層 + 星光點
  deco('deco_space_c', [mk(14, 26, g => {
    const crystal = (cx, top, bot, hw, col, hi) => {
      for (let y = top; y <= bot; y++) {
        const tip = Math.min(4, y - top), tip2 = Math.min(3, bot - y);
        const w = Math.max(1, Math.round(hw * Math.min(1, tip / 3.2) * Math.min(1, (tip2 + 1) / 2.2)));
        for (let x = cx - w; x <= cx + w; x++) px(g, x, y, x < cx ? hi : col);
      }
    };
    crystal(4, 6, 25, 3, 'v', 't');
    crystal(9, 1, 25, 4, 'c', 'e');
    outline(g, 'k');
    for (const [x, y] of [[9, 5], [10, 12], [4, 11], [8, 19]]) px(g, x, y, 'w');
    rect(g, 1, 24, 12, 2, 'M'); rect(g, 2, 24, 10, 1, 'l'); outline(g, 'k', ['M', 'l']);
  })]);

  // p 星球模型 24×30：環狀行星懸在支架上
  deco('deco_space_p', [mk(24, 30, g => {
    rect(g, 10, 20, 4, 9, 's'); rect(g, 11, 20, 1, 9, 'q');
    rect(g, 7, 28, 10, 2, 'S'); rect(g, 8, 28, 8, 1, 's');
    disc(g, 12, 12, 9, 'v');
    for (let y = 3; y <= 21; y++) for (let x = 3; x <= 21; x++) {
      if (g[y][x] !== 'v') continue;
      const dx = x - 12, dy = y - 12;
      if (dx * dx + dy * dy > 52) g[y][x] = 'V';
      else if (dx < -2 && dy < 0) g[y][x] = 't';
    }
    // 行星表面斑紋
    for (const [x, y, r] of [[9, 9, 2], [15, 14, 2], [11, 16, 1]]) disc(g, x, y, r, 'p');
    // 光環
    for (let x = 0; x < 24; x++) {
      const yy = 15 - Math.round((x - 12) * 0.28);
      const inside = (x - 12) * (x - 12) + (yy - 12) * (yy - 12) <= 84;
      px(g, x, yy, inside ? 'L' : 'c');
      px(g, x, yy + 1, inside ? 'l' : 'C');
    }
    outline(g, 'k', ['v', 'V', 't', 's', 'S', 'q']);
  })]);

  // r 傳送環 20×26（2 幀，暗房光源）：立在底座上的發光圓環
  const warpRing = ph => mk(20, 26, g => {
    rect(g, 4, 22, 12, 4, 'M'); rect(g, 5, 22, 10, 1, 'l'); rect(g, 3, 25, 14, 1, 'd');
    rect(g, 9, 16, 2, 7, 's');
    for (let r = 8; r >= 6; r--) ring(g, 10, 11, r, r === 7 ? 'c' : 'C');
    ring(g, 10, 11, 5, 'v');
    // 環內的能量點（兩幀交錯）
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + ph;
      px(g, Math.round(10 + Math.cos(a) * 7), Math.round(11 + Math.sin(a) * 7), i % 2 ? 'w' : 'e');
    }
    for (let y = 5; y <= 17; y++) for (let x = 4; x <= 16; x++) {
      const dx = x - 10, dy = y - 11; const d = dx * dx + dy * dy;
      if (d < 25 && g[y][x] === '.') px(g, x, y, ((x + y + Math.round(ph * 3)) % 5 === 0) ? 't' : 'T');
    }
    outline(g, 'k', ['M', 's', 'l']);
  });
  deco('deco_space_r', [warpRing(0), warpRing(0.4)], { fps: 6 });

  // s 星辰 12×12（2 幀）：四芒星
  const star4 = big => mk(12, 12, g => {
    for (let i = 0; i < 6; i++) {
      const w = big ? [5, 4, 3, 2, 1, 1][i] : [4, 3, 2, 1, 1, 0][i];
      for (let d = -w; d <= w; d++) { px(g, 6 + d, 6 - i, i < 2 ? 'w' : 'y'); px(g, 6 + d, 5 + i, i < 2 ? 'w' : 'y'); }
    }
    for (let i = 0; i < 6; i++) {
      const w = big ? [5, 4, 3, 2, 1, 1][i] : [4, 3, 2, 1, 1, 0][i];
      for (let d = -w; d <= w; d++) { px(g, 6 - i, 6 + d, i < 2 ? 'w' : 'y'); px(g, 5 + i, 6 + d, i < 2 ? 'w' : 'y'); }
    }
    outline(g, 'o', ['y']);
  });
  deco('deco_space_s', [star4(true), star4(false)], { fps: 3 });

  // g 晶簇 16×12
  deco('deco_space_g', [mk(16, 12, g => {
    const shard = (cx, top, hw, col) => { for (let y = top; y < 12; y++) { const w = Math.max(0, Math.round(hw * Math.min(1, (y - top) / 2.4))); for (let x = cx - w; x <= cx + w; x++) px(g, x, y, col); } };
    shard(3, 5, 2, 'v'); shard(8, 2, 3, 'c'); shard(13, 6, 2, 'g');
    outline(g, 'k');
    px(g, 8, 4, 'w'); px(g, 3, 8, 'e'); px(g, 13, 9, 'a');
  })]);

  // m 隕石 20×14
  deco('deco_space_m', [mk(20, 14, g => {
    ellipse(g, 9, 9, 9, 5, 'S'); ellipse(g, 8, 8, 7, 4, 's');
    for (const [x, y, r] of [[5, 8, 2], [13, 10, 1], [9, 6, 1]]) disc(g, x, y, r, 'S');
    outline(g, 'k');
    px(g, 4, 6, 'q'); px(g, 5, 6, 'q');
  })]);

  KB.DECO_CHARS = KB.DECO_CHARS || {};
  KB.DECO_CHARS.space = 'cprsgm';

  // ============================================================================
  // 新敵人像素圖
  // ============================================================================
  // meteorite 隕石 16×16（滾落）：燒紅的岩石球 + 火尾
  const meteor = (spin, hot) => mk(16, 16, g => {
    disc(g, 8, 8, 6, hot ? 'j' : 'S');
    disc(g, 6, 6, 4, hot ? 'J' : 's');
    for (let i = 0; i < 3; i++) {
      const a = spin + i * 2.1;
      disc(g, Math.round(8 + Math.cos(a) * 3), Math.round(8 + Math.sin(a) * 3), 1, hot ? 'o' : 'S');
    }
    outline(g, 'k');
    // 火尾（左上）
    for (const [x, y] of [[1, 3], [2, 2], [3, 4], [0, 5]]) px(g, x, y, 'j');
    for (const [x, y] of [[2, 3], [3, 3]]) px(g, x, y, 'J');
  });
  KB.sprite('meteorite_walk', P, [meteor(0, false), meteor(1.05, false)], { fps: 10, anchor: 'bottom' });
  KB.sprite('meteorite_attack', P, [meteor(2.1, true), meteor(3.15, true)], { fps: 14, anchor: 'bottom' });

  // starling 星靈 14×14：五芒星身體 + 大眼睛
  const starling = (ph, angry) => mk(14, 14, g => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 2.6 : 6.4 + ph, a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([7 + Math.cos(a) * r, 7 + Math.sin(a) * r]);
    }
    // 掃描線填五芒星
    for (let y = 0; y < 14; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) px(g, x, y, 'y');
    }
    for (let y = 0; y < 14; y++) for (let x = 0; x < 7; x++) if (g[y][x] === 'y') g[y][x] = 'J';
    outline(g, 'o', ['y', 'J']);
    // 眼睛
    px(g, 5, 6, 'k'); px(g, 5, 7, 'k'); px(g, 8, 6, 'k'); px(g, 8, 7, 'k');
    px(g, 5, 6, angry ? 'r' : 'k'); px(g, 8, 6, angry ? 'r' : 'k');
    px(g, 6, 9, 'o'); px(g, 7, 9, 'o');
  });
  KB.sprite('starling_fly', P, [starling(0, false), starling(0.7, false)], { fps: 5, anchor: 'bottom' });
  KB.sprite('starling_attack', P, [starling(0.4, true), starling(1.1, true)], { fps: 8, anchor: 'bottom' });

  // voidling 虛空 14×16：黑紫色幽影 + 白眼
  const voidling = (wob, open) => mk(14, 16, g => {
    disc(g, 7, 7, 6, 'T');
    ellipse(g, 7, 11, 6, 4, 'T');
    // 下擺鋸齒
    for (let x = 1; x < 13; x++) { const h = 15 - ((x + wob) % 3); for (let y = h; y < 16; y++) px(g, x, y, '.'); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 14; x++) if (g[y][x] === 'T' && x < 6 && y < 9) g[y][x] = 't';
    outline(g, 'k');
    // 白眼
    rect(g, 4, 6, 2, open ? 3 : 2, 'w'); rect(g, 8, 6, 2, open ? 3 : 2, 'w');
    if (open) { px(g, 5, 7, 'v'); px(g, 9, 7, 'v'); }
    for (const [x, y] of [[2, 3], [11, 4]]) px(g, x, y, 'v');
  });
  KB.sprite('voidling_walk', P, [voidling(0, false), voidling(1, false)], { fps: 5, anchor: 'bottom' });
  KB.sprite('voidling_attack', P, [voidling(0, true), voidling(2, true)], { fps: 8, anchor: 'bottom' });

  // mirrordee 鏡子瓦豆（中魔王）24×26：銀框立鏡的身體，鏡面映著一團暗影
  const mirrordee = (step, cast) => mk(24, 26, g => {
    // 腳
    for (const fx of (step ? [5, 16] : [4, 17])) { ellipse(g, fx, 24, 3, 2, 'o'); }
    // 鏡框（橢圓）
    ellipse(g, 11, 12, 10, 11, 's');
    ellipse(g, 11, 12, 8, 9, 'S');
    ellipse(g, 11, 12, 7, 8, cast ? 'v' : 'l');
    // 鏡面裡的暗影
    ellipse(g, 11, 12, 5, 6, cast ? 'V' : 'M');
    disc(g, 11, 10, 3, cast ? 'v' : 'T');
    // 高光斜線
    for (let i = 0; i < 9; i++) { px(g, 6 + i, 16 - i, 'w'); px(g, 7 + i, 16 - i, 'L'); }
    // 眼睛（鏡框上緣的兩點）
    px(g, 8, 6, 'k'); px(g, 8, 7, 'k'); px(g, 14, 6, 'k'); px(g, 14, 7, 'k');
    px(g, 8, 6, cast ? 'c' : 'k'); px(g, 14, 6, cast ? 'c' : 'k');
    // 手臂
    ellipse(g, 21, 14 + (step ? 1 : 0), 2, 2, 'o');
    ellipse(g, 1, 14 - (step ? 1 : 0), 2, 2, 'o');
    outline(g, 'k', ['s', 'S', 'o']);
    // 鏡框裝飾
    px(g, 11, 1, 'y'); px(g, 10, 2, 'y'); px(g, 12, 2, 'y');
  });
  KB.sprite('mirrordee_walk', P, [mirrordee(false, false), mirrordee(true, false)], { fps: 5, anchor: 'bottom' });
  KB.sprite('mirrordee_attack', P, [mirrordee(false, true), mirrordee(true, true)], { fps: 8, anchor: 'bottom' });

  // starling 的星彈 10×10
  KB.sprite('proj_starshot', P, [mk(10, 10, g => {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 - Math.PI / 2; line(g, 5, 5, Math.round(5 + Math.cos(a) * 4), Math.round(5 + Math.sin(a) * 4), 'y'); }
    disc(g, 5, 5, 2, 'w'); outline(g, 'o', ['y']);
  }), mk(10, 10, g => {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 - Math.PI / 4; line(g, 5, 5, Math.round(5 + Math.cos(a) * 4), Math.round(5 + Math.sin(a) * 4), 'y'); }
    disc(g, 5, 5, 2, 'w'); outline(g, 'o', ['y']);
  })], { fps: 14, anchor: 'center' });

  // ============================================================================
  // 魔王：暗影卡比
  // ============================================================================
  const SK = Object.assign({}, P, {
    k: '#080410', b: '#2c1a4a', B: '#180c2a', h: '#503080', H: '#6a44a4',
    w: '#ffffff', e: '#d8c8ff', r: '#5e1848', R: '#38102c', v: '#a862f0', c: '#66e4ff', y: '#ffe878',
    L: '#b090ff',   // R6-P2-04：1px 淡紫描邊（space 背景下拉開對比）
    Q: '#c8a8ff',   // R6-P2-04：身體高光點
  });
  // 外描邊：透明且四鄰有實心像素 → 塗成 ch（outline() 是內描邊，這個是外面再加一圈）
  function rimOut(g, ch) {
    const h = g.length, w = g[0].length, src = g.map(r => r.slice());
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y][x] !== '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] !== '.') continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) g[y][x] = ch;
    }
  }
  // 24×24 的卡比剪影（黑紫色、白眼）
  function shadow(o) {
    o = o || {};
    const g = X.grid(24, 24);
    const by = o.by || 0;                      // 身體上下偏移
    disc(g, 12, 11 + by, 9, 'b');
    // 左上受光
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (g[y][x] !== 'b') continue;
      const dx = x - 9, dy = y - (8 + by);
      if (dx * dx + dy * dy < 22) g[y][x] = 'h';
      if (x - 12 > 3 && y - (11 + by) > 2) g[y][x] = 'B';
    }
    // 手臂
    if (o.arms !== false) {
      ellipse(g, o.armF !== undefined ? o.armF : 20, 13 + by, 3, 2, 'b');
      ellipse(g, 3, 13 + by, 3, 2, 'B');
    }
    // 腳
    const fb = o.feet || [[7, 20], [16, 20]];
    for (const [fx, fy] of fb) ellipse(g, fx, fy + by, 4, 2, 'r');
    for (const [fx, fy] of fb) ellipse(g, fx - 1, fy - 1 + by, 2, 1, 'R');
    outline(g, 'k');
    // R6-P2-04：黑描邊外再加 1px 淡紫描邊，讓黑紫身體在紫色星雲背景前有輪廓
    rimOut(g, 'L');
    // R6-P2-04：身體 2 個高光點（左上受光側）
    px(g, 7, 6 + by, 'Q'); px(g, 9, 4 + by, 'Q');
    // 白眼（發亮）：外圈整圈純白 + 中間瞳孔，1× 也看得出眼形
    const ey = (o.eyeY !== undefined ? o.eyeY : 8) + by;
    const shut = !!o.shut;
    for (const ex of [9, 15]) {
      if (shut) { rect(g, ex, ey + 2, 3, 1, 'w'); continue; }
      rect(g, ex, ey, 3, 5, 'w');                      // 外圈白
      rect(g, ex + 1, ey + 1, 1, 3, o.glare ? 'v' : 'e');   // 瞳孔
    }
    // 嘴
    if (o.mouth === 'open') { ellipse(g, 12, ey + 7, 3, 2, 'R'); px(g, 12, ey + 6, 'r'); }
    else if (o.mouth === 'wide') { ellipse(g, 12, ey + 8, 5, 4, 'R'); ellipse(g, 12, ey + 9, 3, 2, 'r'); }
    else rect(g, 11, ey + 7, 2, 1, 'k');
    return X.gRows(g);
  }
  const S6 = (n, f, o) => KB.sprite(n, SK, f, Object.assign({ anchor: 'bottom' }, o || {}));
  S6('shadowkirby_idle', [shadow({ glare: true }), shadow({ by: 1, glare: true })], { fps: 3 });
  S6('shadowkirby_attack', [
    shadow({ armF: 21, mouth: 'open', glare: true }),
    shadow({ armF: 23, mouth: 'open', eyeY: 7, glare: true }),
    shadow({ armF: 19, mouth: 'wide', eyeY: 7, glare: true }),
  ], { fps: 12, loop: false });
  S6('shadowkirby_inhale', [shadow({ mouth: 'wide', armF: 18 }), shadow({ mouth: 'wide', armF: 18, by: 1 })], { fps: 8 });
  S6('shadowkirby_hurt', [shadow({ shut: true, mouth: 'open', by: 1, armF: 18 })], { fps: 1 });
  S6('shadowkirby_float', [shadow({ by: -1, mouth: 'open', glare: true }), shadow({ by: -2, mouth: 'open', glare: true })], { fps: 6 });

  // 影分身 18×18（較小、半透明感由程式端 alpha 控制）
  function clone(o) {
    o = o || {};
    const g = X.grid(18, 18);
    disc(g, 9, 8 + (o.by || 0), 7, 'B');
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { if (g[y][x] !== 'B') continue; const dx = x - 6, dy = y - 5; if (dx * dx + dy * dy < 14) g[y][x] = 'h'; }
    ellipse(g, 5, 15, 3, 2, 'R'); ellipse(g, 12, 15, 3, 2, 'R');
    outline(g, 'k');
    for (const ex of [6, 11]) { rect(g, ex, 6, 2, 4, 'w'); }
    rect(g, 8, 12, 2, 1, 'k');
    return X.gRows(g);
  }
  S6('shadowclone_idle', [clone({}), clone({ by: 1 })], { fps: 4 });

  // 影子招式的投射物
  KB.sprite('proj_shadowball', SK, [mk(12, 12, g => {
    disc(g, 6, 6, 5, 'v'); disc(g, 5, 5, 3, 'h'); disc(g, 4, 4, 1, 'e');
    outline(g, 'k');
  }), mk(12, 12, g => {
    disc(g, 6, 6, 5, 'h'); disc(g, 5, 5, 3, 'v'); disc(g, 7, 7, 1, 'B');
    outline(g, 'k');
  })], { fps: 12, anchor: 'center' });

  KB.sprite('proj_shadowblade', SK, [mk(16, 10, g => {
    for (let x = 0; x < 16; x++) { const h = Math.round(4 * Math.sin(x / 15 * Math.PI)) + 1; for (let y = 5 - h; y <= 4 + h; y++) px(g, x, y, x > 8 ? 'v' : 'h'); }
    outline(g, 'k');
  }), mk(16, 10, g => {
    for (let x = 0; x < 16; x++) { const h = Math.round(3 * Math.sin(x / 15 * Math.PI)) + 1; for (let y = 5 - h; y <= 4 + h; y++) px(g, x, y, x > 8 ? 'e' : 'v'); }
    outline(g, 'k');
  })], { fps: 12, anchor: 'center' });

  KB.sprite('proj_shadowstar', SK, [mk(12, 12, g => {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; line(g, 6, 6, Math.round(6 + Math.cos(a) * 5), Math.round(6 + Math.sin(a) * 5), 'v'); }
    disc(g, 6, 6, 3, 'h'); disc(g, 5, 5, 1, 'w'); outline(g, 'k');
  }), mk(12, 12, g => {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(g, 6, 6, Math.round(6 + Math.cos(a) * 5), Math.round(6 + Math.sin(a) * 5), 'v'); }
    disc(g, 6, 6, 3, 'h'); disc(g, 5, 5, 1, 'w'); outline(g, 'k');
  })], { fps: 14, anchor: 'center' });

  // 暗星雨的隕石（魔王二階段必殺）
  KB.sprite('proj_darkmeteor', SK, [mk(14, 18, g => {
    disc(g, 7, 12, 5, 'B'); disc(g, 6, 11, 3, 'h');
    for (const [x, y] of [[7, 3], [6, 5], [8, 5], [7, 6]]) px(g, x, y, 'v');
    rect(g, 6, 1, 2, 5, 'v'); px(g, 7, 0, 'e');
    outline(g, 'k');
  }), mk(14, 18, g => {
    disc(g, 7, 12, 5, 'h'); disc(g, 6, 11, 3, 'v');
    rect(g, 6, 0, 2, 6, 'e'); px(g, 5, 3, 'v'); px(g, 8, 4, 'v');
    outline(g, 'k');
  })], { fps: 12, anchor: 'center' });
  void clear; void blit; void ellipse; void line;
})();
