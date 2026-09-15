// 混合第二批像素圖（Round 7 覺醒與挑戰）— 12 組混合能力的卡比招式幀 / 帽子 / 投射物 / 圖示
// ---------------------------------------------------------------------------
// 規則與 art/kirby_mix.js 同一套（但**不共用**模組內部函式，本檔自帶一份點陣工具，
// 只透過 KB.MIXART.G / BASE_HATS 借用第一批已經畫好的「成分圖示 / 底帽」，新成分自己補）：
//   卡比 anchor = bottom（20×20 基準體，較大幀以 ox/oy 置中對齊底部）；
//   帽子 anchor = bottom（畫在 player.y，最後一列貼著頭頂）；
//   投射物 anchor = center；ui_ability_* 24×16、ui_ability_*_mini 8×8。
// 對外：KB.MIXART2.build(key, a, b, el) 由 abilities_mix2.js 呼叫。
// 全部原創手繪點陣，沒有任何外部素材。
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  // ==========================================================
  //  調色盤（KB.PAL.kirby 為底，補武器色與第二批的新元素色）
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
    // ---- Round 7 新元素 ----
    C: '#c0a8ff', D: '#6a4ab0',   // 時光亮紫 / 暗紫
    L: '#40ffd0',                 // 時光流沙青（高光）
    M: '#7a30d8', W: '#2a1040',   // 重力紫 / 重力暗
    B: '#101024',                 // 奇點黑
    O: '#ff9850', A: '#ffd8a0',   // 機甲橘 / 機甲亮橘
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
  const recolor = (rows, map) => rows.map(r => r.split('').map(c => map[c] || c).join(''));

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
    time: { v: 'C', V: 'D', s: 'C', S: 'D', hi: 'L', dk: 'D' },
    void: { v: 'M', V: 'W', s: 'M', S: 'W', hi: 'C', dk: 'B' },
    steel: { v: 'O', V: 'T', s: 's', S: 'S', hi: 'A', dk: 'S' },
  };
  const tint = (rows, el) => recolor(rows, { v: EL[el].v, V: EL[el].V, s: EL[el].s, S: EL[el].S });

  // ==========================================================
  //  武器零件（一律畫成「朝上 / 朝右」，用 rot 產生其他方向）
  //  與第一批完全不同的造型：複合弓 / 帶刺戰鎚 / 闊劍 / 苦無 / 長槍管卡賓
  //  / 岩巨拳 / 沙漏 / 重力球 / 活塞鎚。
  // ==========================================================
  // 複合弓（弓臂朝右、弦在左，上下滑輪）11×19，握把在 (4, 9)
  function bow2Rows(pull) {
    const W = 11, H = 19;
    let f = blank(W, H);
    for (let y = 2; y < H - 2; y++) {
      const t = (y - 9) / 7, x = 4 + Math.round(4 * (1 - t * t));
      f = paste(f, ['k'], x - 1, y);
      f = paste(f, [(y >= 8 && y <= 10) ? 'z' : 'v'], x, y);
      f = paste(f, ['k'], x + 1, y);
    }
    // 上下滑輪
    f = paste(f, ['kk', 'sk'], 6, 1);
    f = paste(f, ['sk', 'kk'], 6, H - 3);
    for (let y = 1; y < H - 1; y++) {
      const t = Math.abs(9 - y) / 8, sx = pull ? Math.round(4 * t) : 4;
      f = paste(f, ['e'], sx, y);
    }
    if (pull) f = paste(f, ['kvvvvk'], 1, 9);   // 搭在弦上的箭
    return f;
  }
  // 帶刺戰鎚（鎚頭朝上）13×15，握把在 (6, 12)
  const MAUL_U = [
    '..kkkkkkkkk..',
    '.kvvvvvvvvvk.',
    'kvvVvvvvvVvvk',
    'kvVVvvvvvVVvk',
    'kvvVvvvvvVvvk',
    '.kvvvvvvvvvk.',
    '..kkkkkkkkk..',
    '.....ktk.....',
    '.....ktk.....',
    '.....ktk.....',
    '.....ktk.....',
    '.....ktk.....',
    '.....kTk.....',
    '.....kTk.....',
    '.....kkk.....',
  ];
  // 闊劍（刃朝上，寬刃 + 十字護手）9×16，握把在 (4, 13)
  const BROAD_U = [
    '....k....',
    '...kvk...',
    '..kvvvk..',
    '.kvvvvvk.',
    '.kvvVvvk.',
    '.kvvvvvk.',
    '.kvvVvvk.',
    '.kvvvvvk.',
    '.kvvVvvk.',
    '.kvvvvvk.',
    'kyyyyyyyk',
    'kyyyyyyyk',
    '...kzk...',
    '...kzk...',
    '...kZk...',
    '...kkk...',
  ];
  // 苦無（刃朝上）5×13，握把在 (2, 10)
  const KUNAI_U = [
    '..k..',
    '.kvk.',
    'kvvvk',
    'kvvvk',
    'kvVvk',
    'kvvvk',
    'kkzkk',
    '.kzk.',
    '.kzk.',
    '.kZk.',
    '.kZk.',
    'kkZkk',
    '.kk..',
  ];
  // 卡賓槍（槍口朝右，長槍管 + 槍托）15×8，握把在 (5, 5)
  const CARBINE_R = [
    '....kkkkkkkkkk.',
    '...kssssssssssk',
    'kkksSssssssssSk',
    'kTTksskkkkkkkkk',
    'kTTkksk........',
    'kTTkkkk........',
    '.kTTk..........',
    '..kk...........',
  ];
  // 岩巨拳（朝右）12×12
  const ROCKFIST_R = [
    '...kkkkkk...',
    '..kvvvvvvk..',
    '.kvvVvvvvvk.',
    'kvvvvvvvvvvk',
    'kvVvvvvvvvVk',
    'kvvvvVVvvvvk',
    'kvvvvVVvvvvk',
    'kvVvvvvvvvVk',
    'kvvvvvvvvvvk',
    '.kvvvvvvvvk.',
    '..kvvVvvvk..',
    '...kkkkkk...',
  ];
  // 沙漏（立著）9×13，握把在 (4, 11)
  const GLASS_U = [
    'kkkkkkkkk',
    'kSSSSSSSk',
    '.kvvvvvk.',
    '..kvvvk..',
    '...kvk...',
    '...kLk...',
    '...kvk...',
    '..kvvvk..',
    '.kvvvvvk.',
    'kvvvvvvvk',
    'kSSSSSSSk',
    'kkkkkkkkk',
    '...kkk...',
  ];
  // 重力球（懸浮的環中球）11×11，握把在 (5, 10)
  const GORB = [
    '...kkkkk...',
    '.kk.....kk.',
    'k..kkkkk..k',
    'k.kvvvvvk.k',
    '..kvvBvvk..',
    '..kvBBBvk..',
    '..kvvBvvk..',
    'k.kvvvvvk.k',
    'k..kkkkk..k',
    '.kk.....kk.',
    '...kkkkk...',
  ];
  // 活塞鎚（鎚頭朝上）11×16，握把在 (5, 13)
  const PISTON_U = [
    'kkkkkkkkkkk',
    'ksssssssssk',
    'ksSsvvvsSsk',
    'ksSsvvvsSsk',
    'ksssssssssk',
    'kkkkkkkkkkk',
    '...kkkkk...',
    '...kSSSk...',
    '....ksk....',
    '....ksk....',
    '....ksk....',
    '...kSSSk...',
    '....kzk....',
    '....kzk....',
    '....kZk....',
    '....kkk....',
  ];
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
  //  卡比招式幀（每組 3 幀 base + 2 幀 ult）
  //  武器用 {rows, gx, gy}（gx/gy＝握把在圖上的像素座標），旋轉時握把一起換算。
  // ==========================================================
  const WP = (rows, gx, gy) => ({ rows, gx, gy });
  const wrot90 = w => { const H = w.rows.length; return WP(rot90(w.rows), H - 1 - w.gy, w.gx); };
  const wrot180 = w => {
    const H = w.rows.length, W = Math.max(...w.rows.map(r => r.length));
    return WP(rot180(w.rows), W - 1 - w.gx, H - 1 - w.gy);
  };
  const wrot270w = w => wrot90(wrot180(w));
  const wtint = (w, el) => WP(tint(w.rows, el), w.gx, w.gy);
  const hold = (w, hx, hy) => [w.rows, hx - w.gx, hy - w.gy];

  const W_BOW2D = WP(bow2Rows(true), 4, 9);
  const W_BOW2L = WP(bow2Rows(false), 4, 9);
  const W_MAUL = WP(MAUL_U, 6, 12);
  const W_BROAD = WP(BROAD_U, 4, 13);
  const W_KUNAI = WP(KUNAI_U, 2, 10);
  const W_CARBINE = WP(CARBINE_R, 5, 5);
  const W_ROCKFIST = WP(ROCKFIST_R, 0, 5);
  const W_GLASS = WP(GLASS_U, 4, 11);
  const W_GORB = WP(GORB, 5, 10);
  const W_PISTON = WP(PISTON_U, 5, 13);

  const CW = 40, CH = 36;           // 招式幀畫布（卡比 20×20 置中對齊底部 → ox 10 / oy 16）
  const mkA = o => mk(CW, CH, o);

  // ── 揮砍型（第二批用「過頂劈砍」：後仰蓄勢 → 正面劈下 → 低位收招）
  function chopFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el);
    const Wb = wrot270w(W);                      // 後仰：武器朝後上
    const Wd = wrot180(W);                       // 劈下：武器朝下
    return [
      mkA({
        dy: -1, arms: [[3, -1, 5], [12, 3, 5]], back: [hold(Wb, 5, 1)],
        eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_LINE, mouthAt: [10, 13],
      }),
      mkA({
        arms: [[14, -2, 5], [5, 2, 5]], front: [hold(W, 16, 0)],
        eyes: EYE_SQUINT, eyeAt: [[8, 5], [13, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
        back: [[slashArc(CW, CH, 22, 16, 14, -150, -30, A.hi, A.v), 0, 0]],
      }),
      mkA({
        arms: [[17, 7, 5], [1, 9, 5]], front: [hold(Wd, 20, 10)],
        eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 12], cheekAt: [[5, 11], [15, 11]],
        back: [[slashArc(CW, CH, 22, 20, 16, -40, 70, A.hi, A.v), 0, 0]],
      }),
    ];
  }
  // ── 射擊型（第二批用「單膝壓低 → 開火 → 大後座」）
  function fireFrames(w0, el, o) {
    o = o || {};
    const W = wtint(w0, el), mz = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    const fx = o.mx !== undefined ? o.mx : 13, fy = o.my !== undefined ? o.my : 1;
    return [
      mkA({
        dy: 1, arms: [[16, 7, 5], [10, 10, 5]], front: [hold(W, 18, 9)],
        eyes: EYE_SQUINT, eyeAt: [[8, 7], [13, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13], feet: [[0, 15], [12, 15]],
      }),
      mkA({
        dy: -1, arms: [[18, 5, 5], [12, 8, 5]], front: [hold(W, 20, 7), [mz, 20 - W.gx + fx, 7 - W.gy + fy]],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      }),
      mkA({
        arms: [[13, 7, 5], [8, 10, 5]], front: [hold(W, 15, 9)],
        eyeAt: [[6, 6], [11, 6]], mouth: MOUTH_O, mouthAt: [10, 12], cheekAt: [[4, 11], [14, 11]],
      }),
    ];
  }
  // ── 必殺型（第二批用「下蹲聚力 → 騰空張開」）
  function burstFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el);
    const halo = (c, r, dy) => {
      let f = blank(CW, CH);
      for (let a = 0; a < 360; a += 15) {
        const x = Math.round(20 + r * Math.cos(a * Math.PI / 180));
        const y = Math.round(24 + dy + (r - 3) * Math.sin(a * Math.PI / 180));
        f = paste(f, [c], x, y);
      }
      return f;
    };
    return [
      mkA({
        dy: 2, arms: [[14, 5, 5], [2, 6, 5]], front: [hold(W, 16, 6)], back: [[halo(A.v, 13, 2), 0, 0]],
        eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12], feet: [[0, 15], [12, 15]],
      }),
      mkA({
        dy: -3, arms: [[15, -3, 5], [1, -2, 5]], front: [hold(W, 17, -1)],
        back: [[halo(A.hi, 17, -2), 0, 0], [halo(A.v, 11, -2), 0, 0]],
        eyes: EYE_SHUT, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 10],
        feet: [[3, 15], [11, 15]],
      }),
    ];
  }
  // ── 吐息型（龍：背後展翼 + 張口，3 幀）
  function breathFrames(el, hue) {
    const Wg = tint(WING_R, el);
    const m1 = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    const m2 = recolor(MUZZLE, { f: EL[el].hi, a: EL[el].v });
    return [
      mkA({ back: [[Wg, 2, 12]], arms: [[15, 7, 5], [1, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [10, 12] }),
      mkA({
        dy: -1, back: [[Wg, 1, 9]], arms: [[16, 6, 5], [0, 7, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
        mouth: MOUTH_OPEN, mouthAt: [9, 11], front: [[m1, 20, 10]],
      }),
      mkA({
        back: [[Wg, 2, 10]], arms: [[16, 8, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]],
        mouth: MOUTH_OPEN, mouthAt: [9, 12], front: [[m2, 25, 11], [m1, 19, 12]],
      }),
    ];
  }
  // ── 巨人型（岩巨人：放大的拳頭 + 踏步，3 幀）
  function titanFrames(el) {
    const F = WP(tint(ROCKFIST_R, el), 0, 5), Fl = wrot180(F);
    return [
      mkA({
        dy: -1, arms: [[16, 6, 6], [0, 7, 6]], front: [hold(F, 20, 8)], back: [hold(Fl, 1, 10)],
        eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: MOUTH_LINE, mouthAt: [10, 13],
      }),
      mkA({
        arms: [[18, 8, 6], [1, 5, 6]], front: [hold(F, 23, 10)], back: [hold(Fl, 0, 7)],
        eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      }),
      mkA({
        dy: 1, arms: [[15, 10, 6], [2, 8, 6]], front: [hold(F, 19, 13)], back: [hold(Fl, 1, 10)],
        eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 12], cheekAt: [[5, 11], [15, 11]],
        feet: [[0, 15], [12, 15]],
      }),
    ];
  }

  // ---- 12 組合的招式幀 ----
  S('kirby_attack_flamebow', fireFrames(W_BOW2D, 'fire', { mx: 2, my: 9 }), { fps: 14 });
  S('kirby_attack_flamebow_ult', burstFrames(W_BOW2L, 'fire'), { fps: 10 });
  S('kirby_attack_frosthammer', chopFrames(W_MAUL, 'ice'), { fps: 12 });
  S('kirby_attack_frosthammer_ult', burstFrames(W_MAUL, 'ice'), { fps: 10 });
  S('kirby_attack_thundersword', chopFrames(W_BROAD, 'spark'), { fps: 16 });
  S('kirby_attack_thundersword_ult', burstFrames(W_BROAD, 'spark'), { fps: 12 });
  S('kirby_attack_flameninja', chopFrames(W_KUNAI, 'fire'), { fps: 16 });
  S('kirby_attack_flameninja_ult', burstFrames(W_KUNAI, 'fire'), { fps: 12 });
  S('kirby_attack_frostninja', chopFrames(W_KUNAI, 'ice'), { fps: 16 });
  S('kirby_attack_frostninja_ult', burstFrames(W_KUNAI, 'ice'), { fps: 12 });
  S('kirby_attack_thundergun', fireFrames(W_CARBINE, 'spark'), { fps: 14 });
  S('kirby_attack_thundergun_ult', burstFrames(wrot270w(W_CARBINE), 'spark'), { fps: 10 });
  S('kirby_attack_stonegiant', titanFrames('stone'), { fps: 12 });
  S('kirby_attack_stonegiant_ult', burstFrames(W_ROCKFIST, 'stone'), { fps: 10 });
  S('kirby_attack_flamedragon', breathFrames('fire'), { fps: 12 });
  S('kirby_attack_flamedragon_ult', burstFrames(WP(tint(WING_R, 'fire'), 0, 6), 'fire'), { fps: 10 });
  S('kirby_attack_thunderdragon', breathFrames('spark'), { fps: 12 });
  S('kirby_attack_thunderdragon_ult', burstFrames(WP(tint(WING_R, 'spark'), 0, 6), 'spark'), { fps: 10 });
  S('kirby_attack_timebeam', fireFrames(W_GLASS, 'time', { mx: 4, my: -2 }), { fps: 12 });
  S('kirby_attack_timebeam_ult', burstFrames(W_GLASS, 'time'), { fps: 10 });
  S('kirby_attack_gravityblade', chopFrames(W_GORB, 'void'), { fps: 14 });
  S('kirby_attack_gravityblade_ult', burstFrames(W_GORB, 'void'), { fps: 10 });
  S('kirby_attack_hammermech', chopFrames(W_PISTON, 'steel'), { fps: 12 });
  S('kirby_attack_hammermech_ult', burstFrames(W_PISTON, 'steel'), { fps: 10 });

  // ==========================================================
  //  Round 9：↑+X（上挑）/ ↓+X（下砸）共用 2 幀姿勢
  //  —— 第二批刻意跟第一批不同：上挑是「弓步前傾刺天」、下砸是「屈膝縱身壓落」。
  // ==========================================================
  function upFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el), Wb = wrot270w(W);
    return [
      mkA({
        dy: 1, arms: [[3, 8, 5], [12, 10, 5]], back: [hold(Wb, 4, 9)],
        eyes: EYE_SQUINT, eyeAt: [[8, 7], [13, 7]], mouth: MOUTH_LINE, mouthAt: [10, 14], feet: [[0, 15], [12, 15]],
      }),
      mkA({
        dy: -4, arms: [[15, -2, 5], [5, 2, 5]], front: [hold(W, 14, -4)],
        eyes: EYE_SHUT, eyeAt: [[8, 7], [13, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 10],
        back: [[slashArc(CW, CH, 21, 18, 18, -166, -14, A.hi, A.v), 0, 0]],
        feet: [[4, 15], [10, 15]],
      }),
    ];
  }
  function dnFrames(w0, el) {
    const A = EL[el], W = wtint(w0, el), Wd = wrot180(W);
    let shock = blank(CW, CH);
    for (let x = 4; x < 36; x += 2) shock = paste(shock, [x % 4 ? A.v : A.hi], x, 33);
    for (let x = 10; x < 30; x += 4) shock = paste(shock, [A.hi], x, 31);
    return [
      mkA({
        dy: -3, arms: [[12, -3, 5], [6, -2, 5]], front: [hold(W, 13, -3)],
        eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [10, 12], feet: [[3, 15], [11, 15]],
      }),
      mkA({
        dy: 3, arms: [[16, 9, 6], [1, 10, 6]], front: [hold(Wd, 18, 13)],
        eyes: EYE_SHUT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12], cheekAt: [[4, 12], [15, 12]],
        back: [[slashArc(CW, CH, 20, 24, 17, -20, 110, A.hi, A.v), 0, 0], [shock, 0, 0]],
        feet: [[0, 15], [12, 15]],
      }),
    ];
  }
  // 龍型（炎龍 / 雷龍）：仰天吐息 / 俯身抓地
  function upBreathFrames(el) {
    const Wg = tint(WING_R, el), m1 = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    return [
      mkA({ back: [[Wg, 2, 12]], arms: [[15, 6, 5], [1, 7, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [10, 11] }),
      mkA({
        dy: -3, back: [[Wg, 1, 7]], arms: [[16, 2, 5], [0, 3, 5]],
        eyes: EYE_SHUT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 8],
        front: [[m1, 8, -2], [m1, 11, -10]],
      }),
    ];
  }
  function dnBreathFrames(el) {
    const Wg = tint(WING_R, el), m1 = recolor(MUZZLE, { f: EL[el].v, a: EL[el].hi });
    return [
      mkA({ dy: -1, back: [[Wg, 2, 8]], arms: [[16, 4, 5], [0, 5, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
      mkA({
        dy: 3, back: [[Wg, 2, 14]], arms: [[17, 11, 6], [-1, 12, 6]],
        eyes: EYE_SHUT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12],
        front: [[m1, 13, 17], [m1, 21, 16]], feet: [[0, 15], [12, 15]],
      }),
    ];
  }
  const MIX2_POSE = [
    ['flamebow', W_BOW2D, 'fire'], ['frosthammer', W_MAUL, 'ice'], ['thundersword', W_BROAD, 'spark'],
    ['flameninja', W_KUNAI, 'fire'], ['frostninja', W_KUNAI, 'ice'], ['thundergun', wrot270w(W_CARBINE), 'spark'],
    ['stonegiant', wrot270w(W_ROCKFIST), 'stone'], ['timebeam', W_GLASS, 'time'],
    ['gravityblade', W_GORB, 'void'], ['hammermech', W_PISTON, 'steel'],
  ];
  for (const [k, w, el] of MIX2_POSE) {
    S('kirby_attack_' + k + '_up', upFrames(w, el), { fps: 14 });
    S('kirby_attack_' + k + '_dn', dnFrames(w, el), { fps: 14 });
  }
  S('kirby_attack_flamedragon_up', upBreathFrames('fire'), { fps: 12 });
  S('kirby_attack_flamedragon_dn', dnBreathFrames('fire'), { fps: 12 });
  S('kirby_attack_thunderdragon_up', upBreathFrames('spark'), { fps: 12 });
  S('kirby_attack_thunderdragon_dn', dnBreathFrames('spark'), { fps: 12 });

  // ==========================================================
  //  帽子：底帽（武器方）＋ 第二批專屬元素冠飾，依元素重新上色
  // ==========================================================
  const HAT_TITAN = [   // 岩冠（巨大化）
    'kkk..kkkk..kkk..',
    'kggk.kggk.kggk..',
    'kgggkgggkkggggk.',
    'kggggggggggggggk',
    'kgGGgggGGgggGGgk',
    'kGGGGGGGGGGGGGGk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_CLOCK = [   // 時計冠（時間）
    '......kkkk......',
    '.....kCCCCk.....',
    '....kCCDDCCk....',
    '...kCCDLLDCCk...',
    '..kCCCDLLDCCCk..',
    '.kCCCCCCCCCCCCk.',
    'kDDDDDDDDDDDDDDk',
    'kkkkkkkkkkkkkkkk',
  ];
  const HAT_RING = [    // 重力環冠（重力）
    '..kkk......kkk..',
    '.kMMk......kMMk.',
    '.kMk........kMk.',
    '.kMk..kkkk..kMk.',
    '.kMMkkMMMMkkMMk.',
    '..kMMMMMMMMMMk..',
    '...kWWMMMMWWk...',
    '....kkkkkkkk....',
  ];
  // 第二批專屬冠飾（與第一批的火焰 / 冰晶 / 雷電 / 岩石造型刻意不同）
  const CREST2 = {
    fire: [   // 雙叉火舌
      '..kk..kk..', '.kffkkffk.', 'kfaakkaafk', 'kfaekkeafk',
      '.kfaaaafk.', '..kffffk..', '...kkkk...',
    ],
    ice: [    // 六角霜花
      '...k..k...', '..kik.kik.', '.kiekekeik', 'kiieeeeeik', '.kiieeeiik',
      '..kiiiiik.', '...kIIIk..', '....kk....',
    ],
    spark: [  // 三叉電戟
      '.k..kk..k.', 'kak.kak.ka', 'kaakkaakka', '.kaaaaaak.', '..kaaaak..',
      '...kaak...', '...kaak...', '....kk....',
    ],
    stone: [  // 峰岩三尖
      '....kk....', '...kggk...', '..kgggk.k.', '.kgggggkgk', 'kgggGggggk',
      'kGGgGGGGGk', 'kkkkkkkkkk',
    ],
    time: [   // 沙漏冠
      '.kkkkkkkk.', '.kCCCCCCk.', '..kCCCCk..', '...kLLk...', '..kCCCCk..',
      '.kCCCCCCk.', '.kDDDDDDk.', '..kkkkkk..',
    ],
    void: [   // 奇點漩渦
      '..kkkkkk..', '.kMMMMMMk.', 'kMMkBBkMMk', 'kMkBBBBkMk', 'kMMkBBkMMk',
      '.kMMMMMMk.', '..kkkkkk..',
    ],
    steel: [  // 排氣管
      '.kk..kk..kk.', 'kOOkkOOkkOOk', 'kOAkkOAkkOAk', 'kOOkkOOkkOOk',
      'kssssssssssk', 'kSSSSSSSSSSk', 'kkkkkkkkkkkk',
    ],
  };

  // 借用第一批已經畫好的底帽（沒有 mix 檔時退回本檔的三頂新帽）
  const BASE1 = (KB.MIXART && KB.MIXART.BASE_HATS) || {};
  const BASE_HATS = Object.assign({}, BASE1, { giant: HAT_TITAN, time: HAT_CLOCK, gravity: HAT_RING });

  function makeHat(name, base, crest, el) {
    const W = 22, H = 22;
    const b = recolor(base, { s: EL[el].s, S: EL[el].S });
    const bw = Math.max(...base.map(r => r.length));
    const cw = Math.max(...crest.map(r => r.length));
    let f = blank(W, H);
    f = paste(f, b, (W - bw) >> 1, H - base.length);
    f = paste(f, crest, (W - cw) >> 1, H - base.length - crest.length + 1);
    S(name, [f]);
  }

  // ==========================================================
  //  投射物（6 種造型 × 7 種元素，自動上色）
  // ==========================================================
  const PJ_ARROW = [   // 箭 / 火箭箭（朝右）
    '.........k..',
    '.k.....kkvk.',
    'kek..kkvvvvk',
    'kekkvvvvvvvk',
    'kek..kkvvvvk',
    '.k.....kkvk.',
    '.........k..',
  ];
  const PJ_ORB = [     // 元素球
    '..kkkk..',
    '.kvvvvk.',
    'kvveevvk',
    'kveeevvk',
    'kvveevvk',
    'kvvvvVvk',
    '.kvvVVk.',
    '..kkkk..',
  ];
  const PJ_SHARD = [   // 柱 / 刺（朝上）
    '...kk...',
    '..kvk...',
    '..kvvk..',
    '.kvvvk..',
    '.kvvvvk.',
    'kvvvvvk.',
    'kvvVvvk.',
    'kvVVvvvk',
    'kvVVVvvk',
    'kvvVVvvk',
    'kkkkkkkk',
  ];
  const PJ_STAR = [    // 手裡劍 / 四角星刃
    '...kk...',
    '...kk...',
    '..kvvk..',
    'kkkvvkkk',
    'kvvvvvvk',
    'kkkvvkkk',
    '..kvvk..',
    '...kk...',
  ];
  const PJ_RING = [    // 軌道刃環
    '...kkkk...',
    '.kkvvvvkk.',
    '.kvvkkvvk.',
    'kvvk..kvvk',
    'kvk....kvk',
    'kvk....kvk',
    'kvvk..kvvk',
    '.kvvkkvvk.',
    '.kkvvvvkk.',
    '...kkkk...',
  ];
  const PJ_ROCKET = [  // 飛彈 / 砲彈（朝右）
    '.....kkkk...',
    'kkkkvvvvvvk.',
    'kVVvvvvvvvvk',
    'kkkkvvvvvvk.',
    '.....kkkk...',
  ];
  const SHAPES = { arrow: PJ_ARROW, orb: PJ_ORB, shard: PJ_SHARD, star: PJ_STAR, ring: PJ_RING, rocket: PJ_ROCKET };
  for (const el of Object.keys(EL)) {
    for (const nm of Object.keys(SHAPES)) {
      const base = tint(SHAPES[nm], el);
      const alt = recolor(base, { e: EL[el].hi, V: EL[el].v });
      S('proj_mix2_' + nm + '_' + el, [base, alt], { anchor: 'center', fps: 12 });
    }
  }

  // ==========================================================
  //  能力圖示：24×16「兩個成分圖示斜切合成」＋ 8×8 小圖
  //  （第二批的斜切方向與第一批相反：左下 = A、右上 = B）
  // ==========================================================
  const G = Object.assign({}, (KB.MIXART && KB.MIXART.G) || {}, {
    giant: ['kk....kk', 'kgk..kgk', 'kggkkggk', 'kgggggggk', 'kgGggGgk', 'kGGgggGk', '.kGGGGk.', '..kkkk..'],
    time: ['.kkkkkk.', '.kCCCCk.', '..kCCk..', '...kLk..', '..kCCk..', '.kCCCCk.', '.kDDDDk.', '.kkkkkk.'],
    gravity: ['..kkkk..', '.kMMMMk.', 'kMkBBkMk', 'kMkBBkMk', 'kMkBBkMk', 'kMkBBkMk', '.kMMMMk.', '..kkkk..'],
  });
  const GFALL = ['..kkkk..', '.kvvvvk.', 'kvvVVvvk', 'kvVvvVvk', 'kvVvvVvk', 'kvvVVvvk', '.kvvvvk.', '..kkkk..'];
  const gly = k => G[k] || GFALL;

  // 8×8 斜切合成：左下三角 = 成分 A，右上三角 = 成分 B，接縫畫元素亮線
  function miniMix(a, b, el) {
    const A = gly(a), B = gly(b), hi = EL[el].v, out = [];
    for (let y = 0; y < 8; y++) {
      let r = '';
      for (let x = 0; x < 8; x++) {
        if (x === y) { r += hi; continue; }
        r += (x < y ? A[y][x] : B[y][x]);
      }
      out.push(r);
    }
    return out;
  }
  // 24×16 圖示：暗底上「左下 = 成分 A、右上 = 成分 B」，中間一道元素色斜切亮線（左上 → 右下）
  function iconMix(a, b, el) {
    const W = 24, H = 16, hi = EL[el].v, lo = EL[el].V;
    let f = blank(W, H);
    for (let y = 1; y < H - 1; y++) {
      let r = '';
      for (let x = 1; x < W - 1; x++) r += (x * 0.75 - y < 6 ? 'Z' : 'd');
      f = paste(f, [r], 1, y);
    }
    f = paste(f, ['k'.repeat(W)], 0, 0);
    f = paste(f, ['k'.repeat(W)], 0, H - 1);
    for (let y = 0; y < H; y++) { f = paste(f, ['k'], 0, y); f = paste(f, ['k'], W - 1, y); }
    // 斜切亮線（左上 → 右下），先畫線再蓋圖示
    for (let y = 1; y < H - 1; y++) {
      const x = Math.round(8 + y * 0.75);
      if (x > 0 && x < W - 1) { f = paste(f, [lo], x + 1, y); f = paste(f, [hi], x, y); }
    }
    f = paste(f, gly(a), 2, 7);
    f = paste(f, gly(b), 14, 1);
    return f;
  }

  // ==========================================================
  //  對外：KB.MIXART2.build(key, a, b, el)（abilities_mix2.js 呼叫）
  // ==========================================================
  KB.MIXART2 = {
    EL, G, BASE_HATS, CREST2, SHAPES,
    build(key, a, b, el) {
      makeHat('hat_' + key, BASE_HATS[b] || HAT_TITAN, CREST2[el] || CREST2.fire, el);
      S('ui_ability_' + key, [iconMix(a, b, el)]);
      S('ui_ability_' + key + '_mini', [miniMix(a, b, el)]);
    },
  };
})();
