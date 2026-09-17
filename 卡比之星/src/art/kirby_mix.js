// 混合能力像素圖（Round 6 系統深度）— 12 組混合能力的卡比招式幀 / 帽子 / 投射物 / 圖示
// 規則（與 art/kirby_weapons.js 同一套）：
//   卡比 anchor = bottom（20×20 基準體，較大幀以 ox/oy 置中對齊底部）；
//   帽子 anchor = bottom（畫在 player.y，最後一列貼著頭頂）；
//   投射物 anchor = center；ui_ability_* 24×16、ui_ability_*_mini 8×8。
// 全部原創手繪點陣，沒有任何外部素材。
(function () {
  'use strict';

  // ==========================================================
  //  調色盤（以 KB.PAL.kirby 為底，補上武器 / 元素色）
  // ==========================================================
  const PM = Object.assign({}, KB.PAL.kirby, {
    s: '#d8dce8', S: '#8890a8',   // 金屬亮 / 暗
    z: '#3a3e52', Z: '#22243a',   // 握柄深灰 / 近黑
    v: '#eef2ff', V: '#9aa6c0',   // 刃白 / 刃灰（元素 recolor 的基準色）
    a: '#fff8c0',                 // 亮黃（電 / 高光）
    f: '#ff9028', F: '#e02808',   // 火橘 / 火紅
    i: '#b8f0ff', I: '#3f96d8',   // 冰亮 / 冰暗
    u: '#4878f8', U: '#2040a8',   // 藍 / 深藍
    n: '#48c048', N: '#207828',   // 綠 / 深綠
    t: '#c88850', T: '#805020',   // 木亮 / 木暗
    h: '#b070f0', H: '#6a30a8',   // 紫亮 / 紫暗
    q: '#5460a0', Q: '#2a3050',   // 布亮 / 布暗
    j: '#e83030', J: '#a01818',   // 紅布
    x: '#303030',
  });

  // ==========================================================
  //  點陣工具
  // ==========================================================
  const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
  function paste(base, patch, x, y) {
    const out = base.map(r => r.split(''));
    patch.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]; if (ch === '.' || ch === ' ') continue;
        const yy = y + j, xx = x + i;
        if (yy < 0 || yy >= out.length || xx < 0 || xx >= out[0].length) continue;
        out[yy][xx] = ch;
      }
    });
    return out.map(r => r.join(''));
  }
  function rot90(rows) {   // 順時針 90°
    const H = rows.length, W = Math.max(...rows.map(r => r.length));
    const pad = rows.map(r => r + '.'.repeat(W - r.length)), out = [];
    for (let y = 0; y < W; y++) { let s = ''; for (let x = 0; x < H; x++) s += pad[H - 1 - x][y]; out.push(s); }
    return out;
  }
  const rot180 = rows => rot90(rot90(rows));
  const rot270 = rows => rot90(rot180(rows));
  const recolor = (rows, map) => rows.map(r => r.split('').map(c => map[c] || c).join(''));
  const scaleRows = (rows, s) => rows.flatMap(r => Array(s).fill(r.split('').map(c => c.repeat(s)).join('')));

  const ell = (x, y, w, h) => ({ cx: x + w / 2, cy: y + h / 2, rx: w / 2 - 0.01, ry: h / 2 - 0.01 });
  const circ = (x, y, d) => ell(x, y, d, d);
  function blob(w, h, shapes, cols) {
    cols = Object.assign({ fill: 'p', edge: 'k', hi: 'l', lo: 'P', shade: true }, cols || {});
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h &&
      shapes.some(s => { const u = (x + 0.5 - s.cx) / s.rx, v = (y + 0.5 - s.cy) / s.ry; return u * u + v * v <= 1; });
    const m = shapes[0], rows = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) { r += '.'; continue; }
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { r += cols.edge; continue; }
        let c = cols.fill;
        if (cols.shade) {
          const u = (x + 0.5 - m.cx) / m.rx, v = (y + 0.5 - m.cy) / m.ry;
          const d = Math.sqrt(u * u + v * v), a = Math.atan2(v, u) * 180 / Math.PI;
          if (d > 0.72 && a > 12 && a < 118) c = cols.lo;
          else if (d > 0.88 && ((a >= 118 && a < 150) || (a <= 12 && a > -15))) c = cols.lo;
          else if (d > 0.56 && d < 0.8 && a < -112 && a > -150) c = cols.hi;
        }
        r += c;
      }
      rows.push(r);
    }
    return rows;
  }
  // 斬擊弧（畫在卡比身後）
  function arcLayer(w, h, cx, cy, r, a0, a1, ch) {
    let f = blank(w, h);
    for (let a = a0; a <= a1; a += 2) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 180));
      const y = Math.round(cy + r * Math.sin(a * Math.PI / 180));
      f = paste(f, [ch], x, y);
    }
    return f;
  }
  const slashArc = (w, h, cx, cy, r, a0, a1, c1, c2) =>
    paste(arcLayer(w, h, cx, cy, r, a0, a1, c1 || 'e'), arcLayer(w, h, cx, cy, r - 1, a0, a1, c2 || 'v'), 0, 0);

  // ---------- 卡比零件 ----------
  const EYE = ['.k.', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];
  const EYE_SQUINT = ['kkk', 'kkk', 'bb.'];
  const EYE_SHUT = ['kkk'];
  const MOUTH = ['k..k', '.kk.'];
  const MOUTH_O = ['.kk.', 'kmmk', '.kk.'];
  const MOUTH_LINE = ['kk'];
  const MOUTH_OPEN = ['.kkk.', 'kmmmk', 'kmmmk', '.kkk.'];
  const CHEEK = ['cc', 'cc'];
  const FOOT = ['..kkkk..', '.krrrrk.', 'krrrrrrk', 'kRRRRRRk', '.kkkkkk.'];

  function kirby(o) {
    o = Object.assign({
      w: 20, h: 20, ox: 0, oy: 0, dy: 0,
      body: [2, 1, 16], arms: [[15, 8, 5], [0, 8, 5]],
      eyes: EYE, eyeAt: [[7, 5], [12, 5]],
      mouth: MOUTH, mouthAt: [9, 12],
      cheeks: CHEEK, cheekAt: [[4, 10], [15, 10]],
      feet: [[1, 15], [11, 15]], feetBack: [], foot: FOOT,
      back: [], front: [], cols: null,
    }, o);
    const X = o.ox, Y = o.oy + o.dy;
    let f = blank(o.w, o.h);
    for (const [p, x, y] of o.back) f = paste(f, p, x + X, y + Y);
    for (const [x, y, p] of o.feetBack) f = paste(f, p || o.foot, x + o.ox, y + o.oy);
    const shapes = [circ(o.body[0] + X, o.body[1] + Y, o.body[2])];
    for (const [x, y, d] of o.arms) shapes.push(circ(x + X, y + Y, d));
    f = paste(f, blob(o.w, o.h, shapes, o.cols), 0, 0);
    if (o.cheeks) for (const [x, y] of o.cheekAt) f = paste(f, o.cheeks, x + X, y + Y);
    if (o.eyes) {
      const es = Array.isArray(o.eyes[0]) ? o.eyes : [o.eyes, o.eyes];
      o.eyeAt.forEach(([x, y], i) => { f = paste(f, es[i], x + X, y + Y); });
    }
    if (o.mouth) f = paste(f, o.mouth, o.mouthAt[0] + X, o.mouthAt[1] + Y);
    for (const [x, y, p] of o.feet) f = paste(f, p || o.foot, x + o.ox, y + o.oy);
    for (const [p, x, y] of o.front) f = paste(f, p, x + X, y + Y);
    return f;
  }
  // 較大的畫布（卡比身體固定 20×20，置中對齊底部）
  const mk = (w, h, o) => kirby(Object.assign({ w, h, ox: (w - 20) >> 1, oy: h - 20 }, o));
  const S = (name, frames, opts) => KB.sprite(name, PM, frames, opts);

  // ==========================================================
  //  元素著色表（把武器的 v / V / s / S 換成元素色）
  // ==========================================================
  const EL = {
    fire: { v: 'f', V: 'F', s: 'f', S: 'F', hi: 'a', dk: 'F' },
    ice: { v: 'i', V: 'I', s: 'i', S: 'I', hi: 'e', dk: 'I' },
    spark: { v: 'a', V: 'y', s: 'a', S: 'Y', hi: 'e', dk: 'Y' },
    stone: { v: 'g', V: 'G', s: 'g', S: 'G', hi: 'e', dk: 'd' },
    shadow: { v: 'h', V: 'H', s: 'h', S: 'H', hi: 'e', dk: 'H' },
    star: { v: 'e', V: 'y', s: 'e', S: 'Y', hi: 'w', dk: 'Y' },
  };
  const tint = (rows, el) => recolor(rows, { v: EL[el].v, V: EL[el].V, s: EL[el].s, S: EL[el].S });

  // ==========================================================
  //  武器零件（都畫成「朝上 / 朝右」，用 rot 產生其他方向）
  // ==========================================================
  // 長劍（刃朝上）7×14，握把在 (3, 11)
  const SWORD_U = [
    '...k...', '..kvk..', '.kvvvk.', '.kvvvk.', '.kvvvk.', '.kvVvk.', '.kvvvk.',
    '.kvVvk.', 'kyyyyyk', '..kzk..', '..kzk..', '..kZk..', '..kZk..', '..kkk..',
  ];
  // 太刀（刃朝上，單刃、刀背略厚）7×17，握把在 (3, 14)
  const KATANA_U = [
    '...k...', '..kvk..', '..kvvk.', '.kvvvk.', '.kvvvk.', '.kvvvk.', '.kvVvk.',
    '.kvvvk.', '.kvVvk.', '.kvvvk.', 'kyyyyyk', '..kZk..', '..kZk..', '..kzk..',
    '..kZk..', '..kZk..', '..kkk..',
  ];
  // 大鎚（鎚頭朝上）11×13
  const HAMMER_U = [
    'kkkkkkkkkkk',
    'ksssssssssk',
    'ksSsssssSsk',
    'ksSsssssSsk',
    'ksssssssssk',
    'kkkkkkkkkkk',
    '....ktk....',
    '....ktk....',
    '....ktk....',
    '....ktk....',
    '....ktk....',
    '....kTk....',
    '....kkk....',
  ];
  // 手槍（槍口朝右）10×7
  const GUN_R = [
    '..kkkkkk..',
    '.ksssssssk',
    'kSSssssssk',
    'kSSkkkkssk',
    'kTTk..kssk',
    'kTTk..kkkk',
    '.kk.......',
  ];
  // 迴旋刃（圓盤）9×9
  const DISC = [
    '...kkk...',
    '.kkvvvkk.',
    '.kvvvvvk.',
    'kvvkkkvvk',
    'kvvk.kvvk',
    'kvvkkkvvk',
    '.kvvvvvk.',
    '.kkvvvkk.',
    '...kkk...',
  ];
  // 法杖（杖頭朝上）7×14，握把在 (3, 11)
  const STAFF_U = [
    '...k...', '..kvk..', '.kvvvk.', 'kvveevk', 'kvveevk', '.kvvvk.', '..kvk..',
    '..kzk..', '..kzk..', '..kzk..', '..kzk..', '..kZk..', '..kZk..', '..kkk..',
  ];
  // 機械拳（朝右）9×9
  const FIST_R = [
    '.kkkkkk..',
    'ksssssskk',
    'ksSsssssk',
    'ksSssssZk',
    'ksSssssZk',
    'ksSsssssk',
    'ksssssskk',
    '.kkkkkk..',
    '.........',
  ];
  // 弓（弓臂朝右、弦在左）12×17
  function bowRows(pull) {
    const W = 12, H = 17;
    let f = blank(W, H);
    for (let y = 0; y < H; y++) {
      const t = (y - 8) / 8, x = 5 + Math.round(4 * (1 - t * t));
      f = paste(f, ['k'], x - 1, y);
      f = paste(f, [(y >= 7 && y <= 9) ? 'y' : 'v'], x, y);
      f = paste(f, ['k'], x + 1, y);
    }
    for (let y = 0; y < H; y++) {
      const t = Math.abs(8 - y) / 8, sx = pull ? Math.round(5 * t) : 5;
      f = paste(f, ['e'], sx, y);
    }
    return f;
  }
  const BOW_DRAWN = bowRows(true), BOW_LOOSE = bowRows(false);
  // 龍翼（朝右展開）10×12
  const WING_R = [
    '..kkk.....',
    '.kvvkk....',
    'kvvvvvkk..',
    'kvvvvvvvk.',
    'kvvkvvvvvk',
    'kVvk.kvvvk',
    'kVk...kvvk',
    'kk.....kvk',
    '........kk',
    '..........',
    '..........',
    '..........',
  ];
  const MUZZLE = ['..a..', 'a.f.a', '.faf.', 'a.f.a', '..a..'];

  // ==========================================================
  //  卡比招式幀（每個混合能力：base 3 幀 + ult 2 幀）
  //  武器一律用 {rows, gx, gy}（gx/gy＝握把在圖上的像素座標），
  //  擺放時把握把對到「手的中心」，旋轉時握把座標一起換算 → 不會出現浮空的手或脫手的武器。
  // ==========================================================
  const WP = (rows, gx, gy) => ({ rows, gx, gy });
  const wrot90 = w => { const H = w.rows.length; return WP(rot90(w.rows), H - 1 - w.gy, w.gx); };
  const wrot180 = w => {
    const H = w.rows.length, W = Math.max(...w.rows.map(r => r.length));
    return WP(rot180(w.rows), W - 1 - w.gx, H - 1 - w.gy);
  };
  const wrot270w = w => wrot90(wrot180(w));
  const wtint = (w, el) => WP(tint(w.rows, el), w.gx, w.gy);
  // 放在「手心 (hx, hy)」（body-local 座標，也就是 20×20 卡比基準體的座標）
  const hold = (w, hx, hy) => [w.rows, hx - w.gx, hy - w.gy];

  const W_SWORD = WP(SWORD_U, 3, 11);
  const W_KATANA = WP(KATANA_U, 3, 14);
  const W_HAMMER = WP(HAMMER_U, 5, 10);
  const W_STAFF = WP(STAFF_U, 3, 11);
  const W_DISC = WP(DISC, 4, 4);
  const W_GUN = WP(GUN_R, 1, 4);
  const W_FIST = WP(FIST_R, 0, 4);
  const W_BOWD = WP(BOW_DRAWN, 5, 8);
  const W_BOWL = WP(BOW_LOOSE, 5, 8);

  const CW = 40, CH = 36;           // 招式幀畫布（卡比 20×20 置中對齊底部 → ox 10 / oy 16）
  const mkA = o => mk(CW, CH, o);

  // ── 揮砍型（劍 / 刀 / 鎚 / 盤刃 / 法杖）：舉起 → 揮出（帶弧光） → 收招
  function swingFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el), Wr = wrot90(W), Wd = wrot180(W);
    return [
      mkA({
        arms: [[11, -2, 5], [3, 1, 5]], front: [hold(W, 13, 0)],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 13],
      }),
      mkA({
        dy: -1, arms: [[16, 1, 5], [1, 7, 5]], front: [hold(Wr, 18, 3)],
        eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
        back: [[slashArc(CW, CH, 24, 22, 15, -100, -5, A.hi, A.v), 0, 0]],
      }),
      mkA({
        arms: [[17, 6, 5], [0, 8, 5]], front: [hold(Wd, 19, 8)],
        eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 12], cheekAt: [[5, 11], [15, 11]],
        back: [[slashArc(CW, CH, 23, 26, 15, -60, 40, A.hi, A.v), 0, 0]],
      }),
    ];
  }
  // ── 射擊型（槍 / 弓 / 機械拳）：架式 → 開火（槍口閃焰） → 後座
  function shootFrames(w0, el, o) {
    o = o || {};
    const W = wtint(w0, el), mz = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    const fx = o.mx !== undefined ? o.mx : 9, fy = o.my !== undefined ? o.my : 0;
    return [
      mkA({ arms: [[16, 5, 5], [11, 9, 5]], front: [hold(W, 18, 7)], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
      mkA({
        dy: -1, arms: [[17, 4, 5], [12, 8, 5]], front: [hold(W, 19, 6), [mz, 19 - W.gx + fx, 6 - W.gy + fy]],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      }),
      mkA({ arms: [[15, 6, 5], [10, 10, 5]], front: [hold(W, 17, 8)], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [15, 11]] }),
    ];
  }
  // ── 必殺型：雙手把武器高舉過頭，周身一圈元素光點
  function ultFrames(w0, el, o) {
    o = o || {};
    const A = EL[el], W = wtint(w0, el);
    const halo = (c, dy) => {
      let f = blank(CW, CH);
      for (let a = 0; a < 360; a += 20) {
        const x = Math.round(20 + 16 * Math.cos(a * Math.PI / 180));
        const y = Math.round(24 + dy + 14 * Math.sin(a * Math.PI / 180));
        f = paste(f, [c], x, y);
      }
      return f;
    };
    return [
      mkA({
        arms: [[13, -1, 5], [3, 0, 5]], front: [hold(W, 15, 1)], back: [[halo(A.v, 0), 0, 0]],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      }),
      mkA({
        dy: -2, arms: [[13, -2, 5], [3, -1, 5]], front: [hold(W, 15, 0)], back: [[halo(A.hi, -1), 0, 0]],
        eyes: EYE_SHUT, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 10],
        feet: [[2, 15], [12, 15]],
      }),
    ];
  }

  // ---- 12 組合的招式幀 ----
  S('kirby_attack_flamesword', swingFrames(W_SWORD, 'fire'), { fps: 14 });
  S('kirby_attack_flamesword_ult', ultFrames(W_SWORD, 'fire'), { fps: 10 });
  S('kirby_attack_frostsword', swingFrames(W_SWORD, 'ice'), { fps: 14 });
  S('kirby_attack_frostsword_ult', ultFrames(W_SWORD, 'ice'), { fps: 10 });
  S('kirby_attack_thunderblade', swingFrames(W_KATANA, 'spark'), { fps: 16 });
  S('kirby_attack_thunderblade_ult', ultFrames(W_KATANA, 'spark'), { fps: 12 });
  S('kirby_attack_flamegun', shootFrames(W_GUN, 'fire'), { fps: 14 });
  S('kirby_attack_flamegun_ult', ultFrames(wrot270w(W_GUN), 'fire'), { fps: 10 });
  S('kirby_attack_frostgun', shootFrames(W_GUN, 'ice'), { fps: 14 });
  S('kirby_attack_frostgun_ult', ultFrames(wrot270w(W_GUN), 'ice'), { fps: 10 });
  S('kirby_attack_thunderbow', shootFrames(W_BOWD, 'spark', { mx: 8, my: 6 }), { fps: 14 });
  S('kirby_attack_thunderbow_ult', ultFrames(W_BOWL, 'spark'), { fps: 10 });
  S('kirby_attack_flamehammer', swingFrames(W_HAMMER, 'fire'), { fps: 12 });
  S('kirby_attack_flamehammer_ult', ultFrames(W_HAMMER, 'fire'), { fps: 10 });
  S('kirby_attack_stonehammer', swingFrames(W_HAMMER, 'stone'), { fps: 12 });
  S('kirby_attack_stonehammer_ult', ultFrames(W_HAMMER, 'stone'), { fps: 10 });
  S('kirby_attack_shadowblade', swingFrames(W_DISC, 'shadow'), { fps: 16 });
  S('kirby_attack_shadowblade_ult', ultFrames(W_DISC, 'shadow'), { fps: 12 });
  S('kirby_attack_starmage', swingFrames(W_STAFF, 'star'), { fps: 12 });
  S('kirby_attack_starmage_ult', ultFrames(W_STAFF, 'star'), { fps: 10 });
  S('kirby_attack_thundermech', shootFrames(W_FIST, 'spark', { mx: 8, my: 0 }), { fps: 14 });
  S('kirby_attack_thundermech_ult', ultFrames(W_FIST, 'spark'), { fps: 10 });
  // 冰龍：背後展翼 + 張口吐息（3 幀）
  (function () {
    const Wg = tint(WING_R, 'ice');
    S('kirby_attack_frostdragon', [
      mkA({ back: [[Wg, 2, 12]], arms: [[15, 7, 5], [1, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [10, 12] }),
      mkA({
        dy: -1, back: [[Wg, 1, 10]], arms: [[16, 6, 5], [0, 7, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
        mouth: MOUTH_OPEN, mouthAt: [9, 11], front: [[recolor(MUZZLE, { f: 'i', a: 'e' }), 20, 10]],
      }),
      mkA({
        back: [[Wg, 2, 11]], arms: [[16, 8, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]],
        mouth: MOUTH_OPEN, mouthAt: [9, 12], front: [[recolor(MUZZLE, { f: 'e', a: 'i' }), 24, 11], [recolor(MUZZLE, { f: 'i', a: 'e' }), 19, 12]],
      }),
    ], { fps: 12 });
    // 必殺：雙手托起一顆冰球（8×9 的冰晶團，握點在底部）
    const ICEBALL = ['..kkkk..', '.kvvvvk.', 'kvvvvvvk', 'kvvVVvvk', 'kvVvvVvk', 'kvvvvvvk', '.kvvvvk.', '..kvvk..', '...kk...'];
    S('kirby_attack_frostdragon_ult', ultFrames(WP(ICEBALL, 3, 8), 'ice'), { fps: 10 });
  })();

  // ==========================================================
  //  Round 9：↑+X（上挑）/ ↓+X（下砸）共用 2 幀姿勢
  //  —— 同一套姿勢，武器與元素配色各自不同；特效差異由 abilities_mix.js 的 VFX 負責。
  // ==========================================================
  // ── 上挑型：沉腰蓄勢 → 武器朝天挑起（帶上升弧光）
  function upFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el), Wd = wrot180(W);
    return [
      mkA({
        dy: 2, arms: [[15, 9, 5], [3, 10, 5]], front: [hold(Wd, 17, 12)],
        eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 14], feet: [[0, 15], [12, 15]],
      }),
      mkA({
        dy: -3, arms: [[14, -3, 5], [4, 1, 5]], front: [hold(W, 13, -3)],
        eyes: EYE_SHUT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 10],
        back: [[slashArc(CW, CH, 20, 20, 17, -172, -18, A.hi, A.v), 0, 0]],
        feet: [[3, 15], [11, 15]],
      }),
    ];
  }
  // ── 下砸型：高舉過頂 → 朝腳下插落（帶落地衝擊弧光）
  function dnFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el), Wd = wrot180(W);
    let shock = blank(CW, CH);
    for (let x = 6; x < 34; x += 2) shock = paste(shock, [x % 4 ? A.v : A.hi], x, 34);
    return [
      mkA({
        dy: -2, arms: [[13, -2, 5], [5, -1, 5]], front: [hold(W, 14, -2)],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 13],
      }),
      mkA({
        dy: 2, arms: [[16, 8, 5], [2, 9, 5]], front: [hold(Wd, 18, 12)],
        eyes: EYE_SHUT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12], cheekAt: [[5, 12], [15, 12]],
        back: [[slashArc(CW, CH, 22, 22, 16, -34, 96, A.hi, A.v), 0, 0], [shock, 0, 0]],
        feet: [[0, 15], [12, 15]],
      }),
    ];
  }
  // ── 龍型（沒有武器）：仰天吐息 / 俯衝抓地
  function upBreathFrames(el) {
    const Wg = tint(WING_R, el), m1 = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    return [
      mkA({
        back: [[Wg, 2, 12]], arms: [[15, 6, 5], [1, 7, 5]],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [10, 11],
      }),
      mkA({
        dy: -2, back: [[Wg, 1, 8]], arms: [[16, 3, 5], [0, 4, 5]],
        eyes: EYE_SHUT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 8],
        front: [[m1, 8, -1], [m1, 10, -8]],
      }),
    ];
  }
  function dnBreathFrames(el) {
    const Wg = tint(WING_R, el), m1 = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    return [
      mkA({
        dy: -1, back: [[Wg, 2, 9]], arms: [[16, 4, 5], [0, 5, 5]],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12],
      }),
      mkA({
        dy: 2, back: [[Wg, 2, 13]], arms: [[17, 10, 6], [-1, 11, 6]],
        eyes: EYE_SHUT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12],
        front: [[m1, 14, 16], [m1, 20, 15]], feet: [[0, 15], [12, 15]],
      }),
    ];
  }
  // 12 組合的 ↑X / ↓X 姿勢（武器與 X 招同一把，元素配色相同）
  const MIX_POSE = [
    ['flamesword', W_SWORD, 'fire'], ['frostsword', W_SWORD, 'ice'], ['thunderblade', W_KATANA, 'spark'],
    ['flamegun', wrot270w(W_GUN), 'fire'], ['frostgun', wrot270w(W_GUN), 'ice'], ['thunderbow', W_BOWD, 'spark'],
    ['flamehammer', W_HAMMER, 'fire'], ['stonehammer', W_HAMMER, 'stone'], ['shadowblade', W_DISC, 'shadow'],
    ['starmage', W_STAFF, 'star'], ['thundermech', wrot270w(W_FIST), 'spark'],
  ];
  for (const [k, w, el] of MIX_POSE) {
    S('kirby_attack_' + k + '_up', upFrames(w, el), { fps: 14 });
    S('kirby_attack_' + k + '_dn', dnFrames(w, el), { fps: 14 });
  }
  S('kirby_attack_frostdragon_up', upBreathFrames('ice'), { fps: 12 });
  S('kirby_attack_frostdragon_dn', dnBreathFrames('ice'), { fps: 12 });

  // ==========================================================
  //  帽子：底帽（武器方）＋ 元素冠飾 疊加，並依元素重新上色
  // ==========================================================
  const HAT_HELM = [   // 騎士盔（劍）
    '...kkkkkkkkkk...',
    '..kssssssssssk..',
    '.kssssssssssssk.',
    'kssSssssssssSssk',
    'kSSSSSSSSSSSSSSk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_COWBOY = [ // 牛仔帽（槍）
    '.....kkkkkk.....',
    '....kttttttk....',
    '...kkjjjjjjkk...',
    '.kkTTTTTTTTTTkk.',
    'kttttttttttttttk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_BAND = [   // 工匠頭帶（鎚）
    '..kkkkkkkkkkkk..',
    '.kjjjjjjjjjjjjk.',
    '.kjjeejjjjeejjk.',
    '.kjjjjjjjjjjjjk.',
    '.kkkkkkkkkkkkkk.',
  ];
  const HAT_CAP = [    // 獵人帽（弓）
    '..kkkkkkkkkkkk..',
    '.knnnnnnnnnnnnk.',
    '.knnnNnnnnnnnnk.',
    '.kNNNNNNNNNNNNk.',
    'kyyyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_HOOD = [   // 忍者頭巾（忍）
    '..kkkkkkkkkkkk..',
    '.kqqqqqqqqqqqqk.',
    '.kqQQqqqqqqQqqk.',
    '.kqqqqqqqqqqqqk.',
    '..kkkkkkkkkkkk..',
  ];
  const HAT_WIZ = [    // 尖頂法師帽（法）
    '.......kk.......',
    '......khhk......',
    '......khhk......',
    '.....khhhhk.....',
    '.....khhhhk.....',
    '....khhhhhhk....',
    '...khhhhhhhhk...',
    '..khhhhhhhhhhk..',
    '.khhHHhhhhHHhhk.',
    'kyyyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_HORN = [   // 龍角冠（龍）
    '.k............k.',
    '.kn..........nk.',
    '.knn........nnk.',
    '..knn......nnk..',
    '...knnkkkknnk...',
    '..knnnnnnnnnnk..',
    '.knnNNnnnnNNnnk.',
    '.kkkkkkkkkkkkkk.',
  ];
  const HAT_VISOR = [  // 機甲面罩（機）
    '..kkkkkkkkkkkk..',
    '.kssssssssssssk.',
    '.kSuuuuuuuuuuSk.',
    '.kSuuuuuuuuuuSk.',
    '.kssssssssssssk.',
    '.kkkkkkkkkkkkkk.',
  ];
  const HAT_KNOT = [   // 武士髮髻 + 鉢卷（居合）
    '......kkkk......',
    '.....kZZZZk.....',
    '.....kZzZZk.....',
    '......kZZk......',
    '...kkkkkkkkkk...',
    '..kZZZZZZZZZZk..',
    '.kkkkkkkkkkkkkk.',
    '.keeeeeeeeeeeek.',
    '.keejjeeeejjeek.',
    '.kkkkkkkkkkkkkk.',
  ];
  // 元素冠飾（疊在底帽上方）
  const CREST_FLAME = [
    '....kk....', '...kffk...', '..kfaafk..', '.kfaeeafk.', '.kfaaaafk.', '..kffffk..', '...kkkk...',
  ];
  const CREST_ICE = [
    '....kk....', '...kiik...', '..kieeik..', '.kieeeeik.', '.kiieeiik.', '..kiiiik..', '...kIIk...', '....kk....',
  ];
  const CREST_BOLT = [
    '...kk...', '..kak...', '.kaak...', 'kaaakk..', 'kaaaaak.', '.kkaaak.', '...kaak.', '...kak..', '...kk...',
  ];
  const CREST_ROCK = [
    '..kkkk....', '.kggggkk..', 'kgggggggk.', 'kggGgggggk', 'kGGgGGGGGk', 'kkkkkkkkkk',
  ];
  const CREST_SHADE = [
    '..kk..kk..', '.khk..khk.', '.khk..khk.', '.khhkkhhk.', '..khhhhk..', '..kHHHHk..', '..kkkkkk..',
  ];
  const CREST_STAR = [
    '....kk....', '...kyyk...', '...kyyk...', 'kkkkyykkkk', 'kyyyyyyyyk', '.kyyeeyyk.', '..kyyyyk..', '.kyk..kyk.', '.kk....kk.',
  ];
  const CRESTS = { fire: CREST_FLAME, ice: CREST_ICE, spark: CREST_BOLT, stone: CREST_ROCK, shadow: CREST_SHADE, star: CREST_STAR };

  function makeHat(name, base, crest, el) {
    const W = 22, H = 20;
    const b = recolor(base, { s: EL[el].s, S: EL[el].S });
    const cw = Math.max(...crest.map(r => r.length));
    let f = blank(W, H);
    f = paste(f, b, (W - 16) >> 1, H - base.length);
    f = paste(f, crest, (W - cw) >> 1, H - base.length - crest.length + 1);
    S(name, [f]);
  }

  // ==========================================================
  //  投射物（5 種造型 × 6 種元素，自動上色）
  // ==========================================================
  const PJ_WAVE = [    // 劍氣 / 彈幕弧
    '.....kk.....', '....kvvk....', '...kvvvk....', '..kvvvk.....', '..kvvk......',
    '.kvvk.......', '.kvvk.......', '.kvvk.......', '.kvvk.......', '.kvvk.......',
    '.kvvk.......', '..kvvk......', '..kvvvk.....', '...kvvvk....', '....kvvk....', '.....kk.....',
  ];
  const PJ_ORB = [     // 元素彈 / 砲彈
    '...kkkk...', '..kvvvvk..', '.kvvvvvvk.', 'kvvvvvvvvk', 'kvveevvvvk',
    'kvveevvvvk', 'kvvvvvvvvk', 'kvvvvvvVvk', '.kvvvvVvk.', '..kvVVvk..', '...kkkk...',
  ];
  const PJ_BOLT = [    // 箭 / 飛彈（朝右）
    '........k...', '.kk...kkvk..', 'kvvvvvvvvvvk', '.kk...kkvk..', '........k...',
  ];
  const PJ_SPIKE = [   // 冰柱 / 岩刺（朝上）
    '...kk...', '...kk...', '..kvvk..', '..kvvk..', '..kvvk..', '.kvvvvk.', '.kvvvvk.',
    '.kvvvvk.', 'kvvvvvvk', 'kvvvvvvk', 'kvvVVvvk', 'kvVVVVvk', 'kkkkkkkk',
  ];
  function tornadoRows(h, w) {
    const out = [];
    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1);
      const half = Math.max(1, Math.round(1 + t * (w / 2 - 1))), cx = w >> 1;
      let r = '';
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx);
        if (d > half) r += '.';
        else if (d === half) r += 'k';
        else r += ((x + y * 2) % 5 === 0) ? 'V' : 'v';
      }
      out.push(r);
    }
    return out;
  }
  const PJ_TORNADO_A = tornadoRows(34, 16), PJ_TORNADO_B = tornadoRows(34, 14);
  for (const el of Object.keys(EL)) {
    S('proj_mix_wave_' + el, [tint(PJ_WAVE, el)], { anchor: 'center' });
    S('proj_mix_orb_' + el, [tint(PJ_ORB, el), recolor(tint(PJ_ORB, el), { e: EL[el].hi, V: EL[el].v })], { anchor: 'center', fps: 12 });
    S('proj_mix_bolt_' + el, [tint(PJ_BOLT, el)], { anchor: 'center' });
    S('proj_mix_spike_' + el, [tint(PJ_SPIKE, el)], { anchor: 'center' });
    S('proj_mix_tornado_' + el, [tint(PJ_TORNADO_A, el), tint(PJ_TORNADO_B, el)], { anchor: 'center', fps: 14 });
  }

  // ==========================================================
  //  能力圖示：24×16「兩個成分圖示斜切合成」＋ 8×8 小圖
  // ==========================================================
  const G = {
    fire: ['...kk...', '..kffk..', '..kfak..', '.kffaak.', 'kffaaeak', 'kfaaeeak', '.kffaak.', '..kkkk..'],
    ice: ['...kk...', '..kiik..', '.kieeik.', 'kieeeeik', 'kiieeiik', '.kiiiik.', '..kIIk..', '...kk...'],
    spark: ['...kk...', '..kak...', '.kaak...', 'kaaakk..', 'kaaaaak.', '.kkaaak.', '...kaak.', '...kkk..'],
    stone: ['..kkkk..', '.kggggk.', 'kggggggk', 'kgGggggk', 'kgggGggk', 'kGGgGGGk', '.kGGGGk.', '..kkkk..'],
    beam: ['...ee...', '.e.ee.e.', '..eeee..', 'eeewweee', 'eeewweee', '..eeee..', '.e.ee.e.', '...ee...'],
    cutter: ['..kkk...', '.kvvvk..', 'kvkkkvk.', 'kvk.kvk.', 'kvkkkvk.', '.kvvvk..', '..kkk...', '........'],
    sword: ['...kk...', '..kvvk..', '..kvvk..', '..kvvk..', '.kyyyyk.', '...kzk..', '...kzk..', '...kk...'],
    blade: ['.....kk.', '....kvvk', '...kvvk.', '..kvvk..', '.kvvk...', 'kyyk....', 'kzk.....', 'kk......'],
    gunner: ['.kkkkk..', 'ksssssk.', 'kSssssk.', 'kSkkksk.', 'kTk.kkk.', 'kTk.....', '.k......', '........'],
    bow: ['.....nn.', '..k..nnn', '.ke..knn', 'kyyyyknn', 'kyyyyknn', '.ke..knn', '..k..nnn', '.....nn.'],
    hammer: ['kkkkkkk.', 'ksssssk.', 'ksSsssk.', 'kkkkkkk.', '..ktk...', '..ktk...', '..kTk...', '..kk....'],
    ninja: ['...kk...', '..kvvk..', 'kkkvvkkk', 'kvvvvvvk', 'kvvvvvvk', 'kkkvvkkk', '..kvvk..', '...kk...'],
    mage: ['...kk...', '..khhk..', '..khhk..', '.khhhhk.', 'khhhhhhk', 'khHHhhhk', 'kyyyyyyk', 'kkkkkkkk'],
    dragon: ['..kk....', '.knnk...', 'knnnnkk.', 'knwnnnnk', 'knnnnnnk', 'kNNnnNnk', '.kNNNNk.', '..kkkk..'],
    mech: ['.kkkkkk.', 'ksssssk.', 'ksSsssk.', 'ksSsssk.', 'ksSsssk.', 'ksssssk.', '.kkkkkk.', '........'],
  };
  // 8×8 斜切合成：左上三角 = 成分 A，右下三角 = 成分 B，接縫畫白線
  function miniMix(a, b) {
    const A = G[a], B = G[b], out = [];
    for (let y = 0; y < 8; y++) {
      let r = '';
      for (let x = 0; x < 8; x++) {
        if (x + y === 7) { r += 'e'; continue; }
        r += (x + y < 7 ? A[y][x] : B[y][x]);
      }
      out.push(r);
    }
    return out;
  }
  // 24×16 圖示：暗底上「左上 = 成分 A、右下 = 成分 B」，中間一道元素色斜切亮線
  function iconMix(a, b, el) {
    const W = 24, H = 16, hi = EL[el].v, lo = EL[el].V;
    let f = blank(W, H);
    for (let y = 1; y < H - 1; y++) {
      let r = '';
      for (let x = 1; x < W - 1; x++) r += (x * 0.75 + y < 12 ? 'd' : 'Z');
      f = paste(f, [r], 1, y);
    }
    f = paste(f, ['k'.repeat(W)], 0, 0);
    f = paste(f, ['k'.repeat(W)], 0, H - 1);
    for (let y = 0; y < H; y++) { f = paste(f, ['k'], 0, y); f = paste(f, ['k'], W - 1, y); }
    // 斜切亮線（右上 → 左下），先畫線再蓋圖示，線不會切斷圖形
    for (let y = 1; y < H - 1; y++) {
      const x = Math.round(17 - y * 0.75);
      if (x > 0 && x < W - 1) { f = paste(f, [lo], x - 1, y); f = paste(f, [hi], x, y); }
    }
    f = paste(f, G[a], 2, 1);
    f = paste(f, G[b], 14, 7);
    return f;
  }

  // ==========================================================
  //  對外：依混合能力表產生帽子 / 圖示
  //  KB.MIXART.build(key, {a, b, hat:[底帽名, 冠飾元素]}) 由 abilities_mix.js 呼叫
  // ==========================================================
  const BASE_HATS = {
    sword: HAT_HELM, blade: HAT_KNOT, gunner: HAT_COWBOY, bow: HAT_CAP, hammer: HAT_BAND,
    ninja: HAT_HOOD, mage: HAT_WIZ, dragon: HAT_HORN, mech: HAT_VISOR,
  };
  KB.MIXART = {
    EL, G, BASE_HATS,
    // key：混合能力 key；a：元素成分；b：武器成分；el：視覺元素名（EL 的鍵）
    build(key, a, b, el) {
      makeHat('hat_' + key, BASE_HATS[b] || HAT_HELM, CRESTS[el] || CREST_FLAME, el);
      S('ui_ability_' + key, [iconMix(a, b, el)]);
      S('ui_ability_' + key + '_mini', [miniMix(a, b)]);
    },
  };
})();
