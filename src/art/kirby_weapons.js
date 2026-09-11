// 武器系卡比 / 帽子 / 投射物 / 圖示 / 敵人像素圖（Round 5 變身大爆發）
// 規則：卡比 anchor = bottom（20×20 基準體，較大幀以 ox/oy 置中對齊底部）；
//       帽子 anchor = bottom（畫在 player.y，所以最後一列貼著頭頂）；
//       投射物 anchor = bottom（會旋轉者用 center）；敵人 anchor = bottom；ui_ability_* 24×16。
(function () {
  'use strict';

  // ==========================================================
  //  調色盤
  // ==========================================================
  // 卡比 / 武器（以 KB.PAL.kirby 為底）
  const PW = Object.assign({}, KB.PAL.kirby, {
    s: '#d8dce8', S: '#8890a8',   // 金屬亮 / 暗
    z: '#3a3e52', Z: '#22243a',   // 槍身深灰 / 近黑
    t: '#c88850', T: '#805020',   // 木亮 / 木暗
    a: '#fff8c0',                 // 亮黃（火花 / 高光）
    f: '#ff9028', F: '#e83818',   // 橘 / 紅橘
    n: '#48c048', N: '#207828',   // 綠 / 深綠
    u: '#4878f8', U: '#2040a8',   // 藍 / 深藍
    q: '#5460a0', Q: '#2a3050',   // 忍者布亮 / 暗
    h: '#b070f0', H: '#6a30a8',   // 紫亮 / 紫暗
    v: '#eef2ff', V: '#9aa6c0',   // 刀身白 / 刀身灰
    j: '#e83030', J: '#a01818',   // 紅布
    i: '#b8f0ff',                 // 淡冰藍
    e: '#f8f8f8',                 // 白
    x: '#303030',
  });
  // 敵人（以 KB.PAL.enemy 為底）
  const PE = Object.assign({}, KB.PAL.enemy, {
    n: '#ffe8c8', N: '#e8c090',   // 米色臉
    h: '#ffc890', x: '#000000',
    d: '#404048', D: '#202028',
    q: '#5460a0', Q: '#2a3050',   // 忍者布
    v: '#eef2ff', V: '#9aa6c0',   // 刀 / 金屬亮
    z: '#3a3e52', Z: '#22243a',
    j: '#8a5a34', J: '#553218',   // 木
    a: '#fff8c0',
    u: '#c8c8d0', U: '#70707a',
  });

  // ==========================================================
  //  基本工具（與 art/kirby.js 同一套作法）
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
  const flipH = rows => rows.map(r => r.split('').reverse().join(''));
  function rot90(rows) {   // 順時針 90°
    const H = rows.length, W = Math.max(...rows.map(r => r.length)), pad = rows.map(r => r + '.'.repeat(W - r.length)), out = [];
    for (let y = 0; y < W; y++) { let s = ''; for (let x = 0; x < H; x++) s += pad[H - 1 - x][y]; out.push(s); }
    return out;
  }
  const rot180 = rows => rot90(rot90(rows));
  const rot270 = rows => rot90(rot180(rows));
  const recolor = (rows, map) => rows.map(r => r.split('').map(c => map[c] || c).join(''));
  const scaleRows = (rows, s) => rows.flatMap(r => Array(s).fill(r.split('').map(c => c.repeat(s)).join('')));
  const cat = (...parts) => [].concat(...parts);

  const ell = (x, y, w, h) => ({ cx: x + w / 2, cy: y + h / 2, rx: w / 2 - 0.01, ry: h / 2 - 0.01 });
  const circ = (x, y, d) => ell(x, y, d, d);
  function blob(w, h, shapes, cols) {
    cols = Object.assign({ fill: 'p', edge: 'k', hi: 'l', lo: 'P', shade: true }, cols || {});
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && shapes.some(s => { const u = (x + 0.5 - s.cx) / s.rx, v = (y + 0.5 - s.cy) / s.ry; return u * u + v * v <= 1; });
    const m = shapes[0], rows = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) { r += '.'; continue; }
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { r += cols.edge; continue; }
        let c = cols.fill;
        if (cols.shade) {
          const u = (x + 0.5 - m.cx) / m.rx, v = (y + 0.5 - m.cy) / m.ry, d = Math.sqrt(u * u + v * v), a = Math.atan2(v, u) * 180 / Math.PI;
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
  // 弧線（劍光 / 槍口軌跡）
  function arcLayer(w, h, cx, cy, r, a0, a1, ch) {
    let f = blank(w, h);
    for (let a = a0; a <= a1; a += 2) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 180)), y = Math.round(cy + r * Math.sin(a * Math.PI / 180));
      f = paste(f, [ch], x, y);
    }
    return f;
  }

  // ---------- 卡比零件 ----------
  const EYE = ['.k.', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];
  const EYE_SHUT = ['kkk'];
  const EYE_SQUINT = ['kkk', 'kkk', 'bb.'];
  const EYE_HAPPY2 = ['.k.', 'k.k'];
  const EYE_GT = ['k..', '.kk', 'k..'];
  const EYE_LT = ['..k', 'kk.', '..k'];
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
  const S = (name, frames, opts) => KB.sprite(name, PW, frames, opts);
  const SE = (name, frames, opts) => KB.sprite(name, PE, frames, opts);

  // ==========================================================
  //  武器零件
  // ==========================================================
  // 手槍（槍口朝右）10×7
  const PISTOL = [
    '..kkkkk...',
    '.ksssssk..',
    'kSSsssssk.',
    'kSSkkksskk',
    'kTTk..kssk',
    'kTTk..kkkk',
    '.kk.......',
  ];
  const PISTOL_U = rot270(PISTOL), PISTOL_D = rot90(PISTOL);
  // 霰彈槍（槍口朝右）16×7
  const SHOTGUN = [
    '....kkkkkkkkkkk.',
    '...ksssssssssssk',
    '..kSsssssssssssk',
    '.kTkkkkkkkkkkkk.',
    'kTTk............',
    'kTTk............',
    '.kk.............',
  ];
  // 大太刀（刀尖朝上）5×17
  const KATANA_U = [
    '..k..', '.kvk.', '.kvk.', '.kvk.', '.kvk.', '.kvk.', '.kvk.', '.kvk.',
    '.kvk.', '.kVk.', 'kyyyk', '.kZk.', '.kZk.', '.kzk.', '.kZk.', '.kZk.', '.kkk.',
  ];
  const KATANA_R = rot90(KATANA_U), KATANA_L = rot270(KATANA_U), KATANA_D = rot180(KATANA_U);
  // 短刀（旋轉招用）5×11
  const KATANA_S_U = KATANA_U.slice(0, 2).concat(KATANA_U.slice(8));
  const KATANA_S_R = rot90(KATANA_S_U), KATANA_S_D = rot180(KATANA_S_U);
  // 弓（拉滿 / 放鬆）：弓臂向右鼓出、弦在左 12×17
  function bowRows(pull) {
    const W = 12, H = 17;
    let f = blank(W, H);
    for (let y = 0; y < H; y++) {
      const t = (y - 8) / 8, xo = Math.round(4 * (1 - t * t)), x = 5 + xo;
      f = paste(f, ['k'], x - 1, y);
      f = paste(f, [(y >= 7 && y <= 9) ? 'y' : 'n'], x, y);
      f = paste(f, ['k'], x + 1, y);
    }
    for (let y = 0; y < H; y++) {
      const t = Math.abs(8 - y) / 8, sx = pull ? Math.round(5 * t) : 5;
      f = paste(f, ['e'], sx, y);
    }
    return f;
  }
  const BOW_DRAWN = bowRows(true), BOW_LOOSE = bowRows(false);

  // ==========================================================
  //  卡比招式姿勢
  // ==========================================================
  const gunK = o => kirby(Object.assign({ w: 30, h: 20, ox: 4 }, o));
  const tallK = o => kirby(Object.assign({ w: 30, h: 30, ox: 5, oy: 10 }, o));
  const airK = o => kirby(Object.assign({ w: 30, h: 22, ox: 4, oy: 2 }, o));
  const shotK = o => kirby(Object.assign({ w: 34, h: 22, ox: 5, oy: 2 }, o));
  const wideK = o => kirby(Object.assign({ w: 24, h: 20, ox: 2 }, o));
  const bigK = o => kirby(Object.assign({ w: 36, h: 28, ox: 8, oy: 8 }, o));
  const hugeK = o => kirby(Object.assign({ w: 44, h: 30, ox: 12, oy: 10 }, o));

  // ---------- GUNNER 槍手 ----------
  // X 連射：雙槍平舉（上槍 / 下槍），第 2 幀後座抬高 + 槍口火花
  const MUZZLE = ['..a..', 'a.f.a', '.faf.', 'a.f.a', '..a..'];
  S('kirby_attack_gunner', [
    gunK({ arms: [[14, 5, 5], [13, 10, 5]], front: [[PISTOL, 16, 3], [PISTOL, 15, 9]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    gunK({ dy: -1, arms: [[14, 4, 5], [13, 9, 5]], front: [[PISTOL, 16, 1], [PISTOL, 15, 8], [MUZZLE, 25, 1], [MUZZLE, 24, 8]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 14 });
  // ↑+X 對空三連
  S('kirby_attack_gunner_up', [
    tallK({ arms: [[15, 3, 5], [2, 5, 5]], front: [[PISTOL_U, 15, -5], [PISTOL_U, 1, -2]], eyeAt: [[7, 4], [12, 4]], mouth: MOUTH_O, mouthAt: [9, 11] }),
    tallK({ dy: -1, arms: [[15, 2, 5], [2, 4, 5]], front: [[PISTOL_U, 15, -6], [PISTOL_U, 1, -3], [MUZZLE, 14, -10], [MUZZLE, 0, -7]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 14 });
  // 空中 X 朝下掃射
  S('kirby_attack_gunner_air', [
    airK({ arms: [[16, 9, 5], [0, 9, 5]], feet: [[1, 15], [11, 15]], front: [[PISTOL_D, 17, 9], [PISTOL_D, -1, 9]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    airK({ dy: -1, arms: [[16, 8, 5], [0, 8, 5]], feet: [[1, 15], [11, 15]], front: [[PISTOL_D, 17, 8], [PISTOL_D, -1, 8], [MUZZLE, 16, 16], [MUZZLE, -2, 16]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 14 });
  // ↓+X 霰彈：雙手扛霰彈槍、身體後仰
  S('kirby_attack_gunner_shot', [
    shotK({ arms: [[14, 7, 5], [10, 9, 5]], front: [[SHOTGUN, 11, 5]], eyes: EYE_SQUINT, eyeAt: [[6, 6], [11, 6]], mouth: MOUTH_LINE, mouthAt: [9, 12] }),
    shotK({ dy: -1, arms: [[14, 6, 5], [10, 8, 5]], front: [[SHOTGUN, 12, 4], [MUZZLE, 26, 3], [MUZZLE, 25, 6]], eyes: EYE_SQUINT, eyeAt: [[6, 6], [11, 6]], mouth: MOUTH_OPEN, mouthAt: [8, 11], feet: [[0, 15], [11, 15]] }),
  ], { fps: 12 });
  // 必殺 子彈時間：雙槍張開、身體騰空
  S('kirby_attack_gunner_time', [
    tallK({ arms: [[16, 4, 5], [0, 10, 5]], feet: [[1, 15], [11, 15]], front: [[PISTOL_U, 16, -4], [PISTOL, 0, 11]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    tallK({ arms: [[16, 10, 5], [0, 4, 5]], feet: [[1, 15], [11, 15]], front: [[PISTOL, 16, 11], [PISTOL_U, 0, -4], [MUZZLE, 15, -8], [MUZZLE, 10, 12]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 12 });

  // ---------- NINJA 忍者 ----------
  const SHURIKEN = [
    '....k....', '...kvk...', '...kvk...', 'kkkkvkkkk',
    'kvvvkvvvk', 'kkkkvkkkk', '...kvk...', '...kvk...', '....k....',
  ];
  const SHURIKEN_S = ['..k..', '.kvk.', 'kkvkk', 'kvkvk', 'kkvkk', '.kvk.', '..k..'];
  // X 手裡剎：後拉 → 甩出 → 收手
  S('kirby_attack_ninja', [
    wideK({ arms: [[13, 3, 5], [0, 8, 5]], front: [[SHURIKEN_S, 12, 0]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    wideK({ arms: [[16, 7, 5], [0, 8, 5]], front: [[SHURIKEN_S, 19, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11], eyeAt: [[8, 6], [13, 6]] }),
    wideK({ arms: [[15, 9, 5], [0, 8, 5]], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]] }),
  ], { fps: 14 });
  // 空中 X 飛踢：身體斜前傾、雙腳併攏朝斜下
  S('kirby_attack_ninja_kick', [
    wideK({ body: [2, 0, 16], arms: [[0, 2, 5], [1, 6, 5]], feet: [[14, 14], [16, 11]], eyes: EYE_SQUINT, eyeAt: [[8, 5], [13, 5]], mouth: MOUTH_OPEN, mouthAt: [10, 10], cheekAt: [[5, 10], [15, 10]] }),
    wideK({ body: [2, 1, 16], arms: [[0, 3, 5], [1, 7, 5]], feet: [[15, 15], [17, 12]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [10, 11], cheekAt: [[5, 11], [15, 11]] }),
  ], { fps: 12 });
  // ↓+X 替身術：結印蹲姿
  const SEAL = ['.kk.', 'khhk', 'khhk', '.kk.'];
  S('kirby_attack_ninja_warp', [
    kirby({ arms: [[9, 6, 5], [6, 6, 5]], eyes: EYE_SHUT, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_LINE, mouthAt: [9, 12], front: [[SEAL, 8, 3]] }),
    kirby({ dy: -1, arms: [[9, 5, 5], [6, 5, 5]], eyes: EYE_SHUT, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_LINE, mouthAt: [9, 12], front: [[SEAL, 8, 2], [['hh'], 3, 4], [['hh'], 16, 4]] }),
  ], { fps: 12 });
  // 必殺 影分身斬：前衝、手裡劍握在手上拉出殘影
  const KUNAI_R = ['....kkk', '.kkkvvk', 'kZZkvkk', '.kkkkk.'];
  S('kirby_attack_ninja_clone', [
    wideK({ body: [1, 2, 16], arms: [[16, 8, 5], [0, 5, 5]], feet: [[1, 15], [9, 15]], front: [[KUNAI_R, 17, 7]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    wideK({ body: [1, 1, 16], arms: [[17, 6, 5], [0, 4, 5]], feet: [[2, 15], [10, 15]], front: [[KUNAI_R, 19, 4]], eyes: EYE_SQUINT, eyeAt: [[8, 5], [13, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 10] }),
  ], { fps: 14 });

  // ---------- BLADE 居合 ----------
  const slashArc = (w, h, cx, cy, r, a0, a1) => paste(arcLayer(w, h, cx, cy, r, a0, a1, 'e'), arcLayer(w, h, cx, cy, r - 1, a0, a1, 'v'), 0, 0);
  // 第一段：橫斬（由上往前）
  S('kirby_attack_blade', [
    bigK({ arms: [[8, -4, 5], [0, 8, 5]], front: [[KATANA_L, -2, -4]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]] }),
    bigK({ arms: [[16, 6, 5], [0, 8, 5]], front: [[KATANA_R, 15, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      back: [[slashArc(36, 28, 24, 16, 13, -95, -5), -8, -8]] }),
  ], { fps: 12 });
  // 第二段：逆袈裟（由下往上）
  S('kirby_attack_blade2', [
    bigK({ arms: [[16, 12, 5], [0, 8, 5]], front: [[KATANA_R, 15, 11]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]] }),
    bigK({ arms: [[15, 1, 5], [0, 8, 5]], front: [[KATANA_U, 20, -4]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      back: [[slashArc(36, 28, 22, 20, 14, -80, 10), -8, -8]] }),
  ], { fps: 12 });
  // 第三段：大上段斬（由頭頂劈下）
  S('kirby_attack_blade3', [
    bigK({ arms: [[9, -3, 5], [3, -2, 5]], front: [[KATANA_U, 13, -13]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 13] }),
    bigK({ arms: [[16, 8, 5], [10, 6, 5]], front: [[KATANA_D, 19, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      back: [[slashArc(36, 28, 18, 10, 14, -100, 60), -8, -8]] }),
  ], { fps: 10 });
  // 居合蓄力：壓低重心、左手按鞘
  const SHEATH_R = ['kkkkkkkkkkk', 'kZZZZZZZZZk', 'kzZZZZZZZZk', 'kkkkkkkkkkk'];
  S('kirby_attack_blade_charge', [
    wideK({ arms: [[13, 9, 5], [8, 10, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13], front: [[SHEATH_R, 7, 12]] }),
    wideK({ dy: -1, arms: [[13, 8, 5], [8, 9, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13], front: [[SHEATH_R, 7, 11], [['aa'], 18, 12]] }),
  ], { fps: 8 });
  // 居合一閃：拔刀完成、刀身橫貫畫面
  S('kirby_attack_blade_iai', [
    hugeK({ arms: [[16, 8, 5], [0, 8, 5]], front: [[KATANA_R, 17, 6]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13] }),
    hugeK({ arms: [[17, 8, 5], [0, 8, 5]], front: [[KATANA_R, 18, 6]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 12],
      back: [[paste(blank(44, 30), Array(2).fill('e'.repeat(44)), 0, 17), -12, -10]] }),
  ], { fps: 10 });
  // 空中 X 落下斬：刀尖朝下俯衝
  S('kirby_attack_blade_fall', [
    wideK({ arms: [[10, 3, 5], [6, 4, 5]], feet: [[2, 15], [10, 15]], front: [[KATANA_D, 13, 3]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 10] }),
    wideK({ dy: 1, arms: [[10, 3, 5], [6, 4, 5]], feet: [[2, 15], [10, 15]], front: [[KATANA_D, 13, 4]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 10] }),
  ], { fps: 12 });
  // ↑+X 上撩斬
  S('kirby_attack_blade_up', [
    bigK({ arms: [[16, 12, 5], [0, 8, 5]], front: [[KATANA_R, 16, 12]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]] }),
    bigK({ arms: [[14, 0, 5], [0, 8, 5]], front: [[KATANA_U, 17, -10]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      back: [[slashArc(36, 28, 20, 20, 16, -95, -20), -8, -8]] }),
  ], { fps: 12 });

  // ---------- BOW 弓 ----------
  const ARROW_ON = ['.kk....kvk.', 'kttttttkvvvk', '.kk....kvk.'];
  const ARROW_ON_HOT = ['.ka....kek.', 'kaaaaaakeeek', '.ka....kek.'];
  const bowK = o => kirby(Object.assign({ w: 32, h: 24, ox: 5, oy: 4 }, o));
  // X 射箭：拉弦 → 放箭 → 收弓
  S('kirby_attack_bow', [
    bowK({ arms: [[14, 7, 5], [5, 8, 5]], front: [[BOW_DRAWN, 12, -1], [ARROW_ON, 4, 7]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    bowK({ arms: [[14, 7, 5], [10, 8, 5]], front: [[BOW_LOOSE, 12, -1], [ARROW_ON, 12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 11], eyeAt: [[8, 6], [13, 6]] }),
    bowK({ arms: [[14, 8, 5], [1, 8, 5]], front: [[BOW_LOOSE, 12, 0]], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]] }),
  ], { fps: 12 });
  // 蓄力貫穿箭：弓身發光、拉到極限
  S('kirby_attack_bow_charge', [
    bowK({ arms: [[14, 7, 5], [4, 8, 5]], front: [[BOW_DRAWN, 12, -1], [ARROW_ON_HOT, 3, 7]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    bowK({ dy: -1, arms: [[14, 6, 5], [4, 7, 5]], front: [[recolor(BOW_DRAWN, { n: 'a', y: 'e' }), 12, -2], [recolor(ARROW_ON_HOT, { a: 'e' }), 3, 6]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 10 });
  // 空中 X 箭雨：弓橫過來朝下
  const BOW_DOWN = rot90(BOW_LOOSE), BOW_DOWN_D = rot90(BOW_DRAWN);
  S('kirby_attack_bow_rain', [
    bowK({ arms: [[10, 11, 5], [4, 11, 5]], feet: [[0, 15], [12, 15]], front: [[BOW_DOWN_D, 2, 10]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    bowK({ arms: [[10, 11, 5], [4, 11, 5]], feet: [[0, 15], [12, 15]], front: [[BOW_DOWN, 2, 10]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 12 });
  // ↓+X 陷阱箭：蹲下埋箭
  const TRAP_MINI = ['.k..k.', 'kvk.kv', '.kttk.', '..kk..'];
  S('kirby_attack_bow_trap', [
    kirby({ arms: [[11, 11, 5], [5, 11, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13], front: [[TRAP_MINI, 13, 11]] }),
    kirby({ dy: 1, arms: [[12, 12, 5], [5, 12, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_LINE, mouthAt: [10, 13], front: [[TRAP_MINI, 15, 12]] }),
  ], { fps: 10 });
  // 必殺 流星箭：整個人後仰拉滿、弓身全白
  S('kirby_attack_bow_meteor', [
    bowK({ arms: [[14, 6, 5], [2, 8, 5]], front: [[recolor(BOW_DRAWN, { n: 'a' }), 12, -2], [ARROW_ON_HOT, 1, 7]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
    bowK({ dy: -1, arms: [[14, 5, 5], [2, 7, 5]], front: [[recolor(BOW_DRAWN, { n: 'e', y: 'e' }), 12, -3], [recolor(ARROW_ON_HOT, { a: 'e' }), 1, 6]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
  ], { fps: 10 });

  // ==========================================================
  //  帽子（anchor bottom：最後一列貼著 player.y）
  // ==========================================================
  // 牛仔帽 20×8
  S('hat_gunner', [[
    '.......kkkkkk.......',
    '......kttttttk......',
    '......kttTtttk......',
    '.....kkjjjjjjkk.....',
    '...kkTTTTTTTTTTkk...',
    '..kttttttttttttttk..',
    '.kTTTTTTTTTTTTTTTTk.',
    '..kkkkkkkkkkkkkkkk..',
  ]]);
  // 忍者頭巾 + 飄動尾巾 22×10（2 幀）
  const BAND = ['kkkkkkkkkkkkk', 'kqqqqqqqqqqqk', 'kqQQqqqqqQqqk', 'kqqqqqqqqqqqk', 'kkkkkkkkkkkkk'];
  const TAIL_A = ['.kkk.', 'kqqqk', 'kQQqk', '.kkk.'];
  const TAIL_B = ['.kk..', 'kqqk.', 'kQqk.', '.kkk.', '..kk.'];
  S('hat_ninja', [
    paste(paste(blank(22, 10), BAND, 7, 5), TAIL_A, 3, 5),
    paste(paste(blank(22, 10), BAND, 7, 5), TAIL_B, 3, 2),
  ], { fps: 6 });
  // 武士髮髻 + 白鉢卷 20×11
  const TOPKNOT = ['..kk..', '.kZZk.', 'kZzZZk', 'kZZZZk', '.kZZk.', '..kk..'];
  const HAIR = ['..kkkkkkkk..', '.kZZZZZZZZk.', 'kZZzZZZZZZZk'];
  const HACHI = ['kkkkkkkkkkkkkk', 'keeeeeeeeeeeek', 'keejjeeeejjeek', 'keeeeeeeeeeeek', 'kkkkkkkkkkkkkk'];
  S('hat_blade', [paste(paste(paste(blank(20, 11), TOPKNOT, 7, 0), HAIR, 4, 4), HACHI, 3, 6)]);
  // 羽毛帽 20×10
  const FEATHER = ['....k', '...ka', '..kna', '.knak', 'knak.', 'kak..', 'kk...'];
  const CAP = ['..kkkkkkkkkkkk..', '.knnnnnnnnnnnnk.', '.knnnNnnnnnnnnk.', '.kNNNNNNNNNNNNk.', 'kyyyyyyyyyyyyyyk', 'kkkkkkkkkkkkkkkk'];
  S('hat_bow', [paste(paste(blank(20, 11), FEATHER, 1, 0), CAP, 2, 5)]);

  // ==========================================================
  //  投射物 / 特效
  // ==========================================================
  S('proj_bullet', [['.yyyy.', 'yaeeaY', '.yyyy.']], { anchor: 'center' });
  S('proj_pellet', [['.yy.', 'yaeY', '.yy.']], { anchor: 'center' });
  S('proj_shuriken', [SHURIKEN], { anchor: 'center' });
  const ARROW = [
    '........k...',
    'knk....kvk..',
    'knkttttkvvvk',
    'knk....kvk..',
    '........k...',
  ];
  S('proj_arrow', [ARROW], { anchor: 'center' });
  S('proj_arrow_big', [[
    '..........k....',
    'knk.....kkvk...',
    'knkttttttkvvvvk',
    'knk.....kkvk...',
    '..........k....',
  ]], { anchor: 'center' });
  S('proj_arrow_meteor', [
    recolor(scaleRows(ARROW, 2), { t: 'y', v: 'a', n: 'f', k: 'F' }),
    recolor(scaleRows(ARROW, 2), { t: 'a', v: 'e', n: 'y', k: 'f' }),
  ], { anchor: 'center', fps: 12 });
  S('proj_arrowtrap', [[
    '..k....k..',
    '..kv..vk..',
    '...kvvk...',
    '..kvvvvk..',
    '.kttttttk.',
    '.kTTTTTTk.',
    '..kkkkkk..',
  ], [
    '..k....k..',
    '..ka..ak..',
    '...kaak...',
    '..kaaaak..',
    '.kyyyyyyk.',
    '.kYYYYYYk.',
    '..kkkkkk..',
  ]], { fps: 6 });
  // 替身木頭
  S('fx_ninjalog', [[
    '..kkkkkkkk..',
    '.kTtttttttk.',
    'kTttTtttttTk',
    'kTtttttTtttk',
    'kTttTttttttk',
    'kTtttttttTtk',
    'kTttTtttttTk',
    'kTtttttTtttk',
    'kTttttttttTk',
    'kTtTttttttTk',
    'kTtttttTtttk',
    '.kTttttttTk.',
    '..kkkkkkkk..',
  ]], { anchor: 'center' });
  // 槍口火花 3 幀
  S('fx_muzzle', [
    ['..a..', '.afa.', 'afFfa', '.afa.', '..a..'],
    ['.....', '..a..', '.aFa.', '..a..', '.....'],
    ['.....', '.....', '..a..', '.....', '.....'],
  ], { anchor: 'center', fps: 20, loop: false });

  // ==========================================================
  //  能力圖示（24×16）與能力星小圖（8×8）
  // ==========================================================
  const PI = Object.assign({}, KB.PAL.ui, {
    n: '#202848', l: '#ffd8e8', h: '#f27090', i: '#5060c0', f: '#e8305c', F: '#a81c48',
    t: '#c88850', T: '#805020', a: '#fff8c0', v: '#eef2ff', V: '#9aa6c0', q: '#5460a0', Q: '#2a3050',
    z: '#3a3e52', Z: '#22243a', j: '#e83030', J: '#a01818', u: '#48c048', U: '#207828', e: '#f8f8f8',
  });
  const KHEAD = [
    '....nnnnnn....',
    '..nnppppppnn..',
    '.nppplppppppn.',
    '.nppwwppwwppn.',
    'npppnnppnnpppn',
    'npppnnppnnpppn',
    'nphpiippiiphpn',
    'nphpppppppphpn',
    'nppppmppmpppPn',
    '.nppppmmpppPn.',
    '..nppppppPPn..',
    '....nnnnnn....',
  ];
  const ICON_HATS = {
    gunner: [
      '................',
      '................',
      '.....nttttttn...',
      '.....nttTtttn...',
      '....nnjjjjjjnn..',
      '..nnTTTTTTTTTTn.',
      '.ntttttttttttttn',
      '.nTTTTTTTTTTTTTn',
    ],
    ninja: [
      '................',
      '................',
      '................',
      '.nnn.nnnnnnnnnn.',
      'nqqqnqqqqqqqqqqn',
      'nQQqnqQQqqqQqqqn',
      '.nnn.nqqqqqqqqqn',
      '.....nnnnnnnnnn.',
    ],
    blade: [
      '......nZZn......',
      '.....nZzZZn.....',
      '...nnZZZZZZnn...',
      '..nZZZZZZZZZZn..',
      '.nnnnnnnnnnnnnn.',
      '.neeeeeeeeeeeen.',
      '.neejjeeeejjeen.',
      '.nnnnnnnnnnnnnn.',
    ],
    bow: [
      '...n............',
      '..na............',
      '.nua.nnnnnnnnnn.',
      'nuan.nuuuuuuuuun',
      'nan.nuuuUuuuuuun',
      'nn..nUUUUUUUUUUn',
      '....nyyyyyyyyyyn',
      '....nnnnnnnnnnn.',
    ],
  };
  const ICON_MINI = {
    gunner: [
      '.nnnnn..',
      'nvvvvvn.',
      'nVvvvvnn',
      'nVnnnvvn',
      'nTn.nnnn',
      'nTn.....',
      '.n......',
      '........',
    ],
    ninja: [
      '...n....',
      '..nvn...',
      '..nvn...',
      'nnnvnnn.',
      'nvvnvvn.',
      'nnnvnnn.',
      '..nvn...',
      '...n....',
    ],
    blade: [
      '.....nn.',
      '....nvn.',
      '...nvn..',
      '..nvn...',
      '.nvn....',
      'nyyn....',
      'nZn.....',
      'nn......',
    ],
    bow: [
      '...nnn..',
      '..nuun..',
      '.ne.nun.',
      'ne..nun.',
      'n...nun.',
      'ne..nun.',
      '.ne.nun.',
      '..nuunn.',
    ],
  };
  const SUI = (name, frames) => KB.sprite(name, PI, frames, {});
  for (const key of ['gunner', 'ninja', 'blade', 'bow']) {
    let icon = blank(24, 16);
    icon = paste(icon, KHEAD, 1, 4);
    icon = paste(icon, ICON_HATS[key], 0, 0);
    icon = paste(icon, ICON_MINI[key], 16, 4);
    SUI('ui_ability_' + key, [icon]);
    SUI('ui_ability_' + key + '_mini', [ICON_MINI[key]]);
  }

  // ==========================================================
  //  敵人
  // ==========================================================
  const FEET_A = ['..krrrkkkkkkrrrk', '.krrrrk...krrrrk', '.kRRRRk...kRRRRk', '..kkkk.....kkkk.'];
  const FEET_B = ['...krrkkkkkkrrrk', '..krrrk...krrrrk', '...kkk.....kkkk.'];
  const FEET_D = ['.krrrkkkkkkrrk..', 'krrrrk...krrrk..', '.kkkk.....kkk...'];
  const BOOT_A = ['..kdddkkkkkdddk.', '.kddddk...kddddk', '.kDDDDk...kDDDDk', '..kkkk.....kkkk.'];
  const BOOT_B = ['...kddkkkkkdddk.', '..kdddk...kddddk', '...kkk.....kkkk.'];
  const BOOT_D = ['.kdddkkkkkddk...', 'kddddk...kdddk..', '.kkkk.....kkk...'];

  // ---- Pistolo 手槍海盜（gunner）----
  const PIS_BODY = [
    '.....kkkkkk.....',
    '...kkrrrrrrkk...',
    '..krrrrrrrrrrk..',
    '..krrkkkkkkrrk..',
    '.knnnnnnnnnnnnk.',
    '.knnkwnnnnkwnnk.',
    '.knnkxnnnnkxnnk.',
    '.knnnnnnnnnnnnk.',
    '.knnnnkkkknnnnk.',
    '..kbbbbbbbbbbk..',
    '..kbbbwwwwbbbk..',
    '..kBBBBBBBBBBk..',
    '...kkBBBBBBkk...',
  ];
  const E_PISTOL = ['.kuuuk..', 'kUuuuuk.', 'kUkkkuuk', 'kjjk.kkk', '.kk.....'];
  SE('pistolo_walk', [cat(PIS_BODY, BOOT_A), cat(PIS_BODY, BOOT_B), cat(PIS_BODY, BOOT_A), cat(PIS_BODY, BOOT_D)], { fps: 6 });
  SE('pistolo_attack', [
    paste(cat(PIS_BODY, BOOT_A), E_PISTOL, 11, 7),
    paste(paste(cat(PIS_BODY, BOOT_A), E_PISTOL, 12, 7), ['.a.', 'aFa', '.a.'], 19, 8),
  ], { fps: 8 });

  // ---- Kage Dee 影忍（ninja）----
  const KAGE_BODY = [
    '.....kkkkkk.....',
    '...kkqqqqqqkk...',
    '..kqqqqqqqqqqk..',
    '..kqqQQQQQQqqk..',
    '.kQQQQQQQQQQQQk.',
    '.kQQkwwQQwwkQQk.',
    '.kQQkwcQQwckQQk.',
    '.kQQQQQQQQQQQQk.',
    '.kqqqqqqqqqqqqk.',
    '..kqqqqqqqqqqk..',
    '..kqqjjjjjjqqk..',
    '..kQQQQQQQQQQk..',
    '...kkQQQQQQkk...',
  ];
  const KAGE_BOOT_A = ['..kQQQkkkkkQQQk.', '.kQQQQk...kQQQQk', '.kkkkk.....kkkk.'];
  const KAGE_BOOT_B = ['...kQQkkkkkQQQk.', '..kQQQk...kQQQQk', '...kkk.....kkkk.'];
  SE('kagedee_walk', [cat(KAGE_BODY, KAGE_BOOT_A), cat(KAGE_BODY, KAGE_BOOT_B)], { fps: 6 });
  SE('kagedee_attack', [
    paste(cat(KAGE_BODY, KAGE_BOOT_A), ['..v..', '.vvv.', 'vv.vv', '.vvv.', '..v..'], 1, 6),
    paste(cat(KAGE_BODY, KAGE_BOOT_A), ['..v..', '.vvv.', 'vv.vv', '.vvv.', '..v..'], 12, 5),
  ], { fps: 8 });

  // ---- Ronin Dee 浪人（blade）----
  const RONIN_BODY = [
    '.....kkkkkk.....',
    '...kkZZZZZZkk...',
    '..kZZZZZZZZZZk..',
    '..kZZkkkkkkZZk..',
    '.knnnnnnnnnnnnk.',
    '.knnkkwnnwkknnk.',
    '.knnkxwnnxwknnk.',
    '.knnnnnnnnnnnnk.',
    '.knnnnkkkknnnnk.',
    '..kmmmmmmmmmmk..',
    '..kmmmeeeemmmk..',
    '..kMMMMMMMMMMk..',
    '...kkMMMMMMkk...',
  ];
  const RONIN_CROUCH = [
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkZZZZZZkk...',
    '..kZZZZZZZZZZk..',
    '.knnnnnnnnnnnnk.',
    '.knnkkwnnwkknnk.',
    '.knnnnnnnnnnnnk.',
    '..kmmmmmmmmmmk..',
    '..kmmmeeeemmmk..',
    '..kMMMMMMMMMMk..',
    '.kkMMMMMMMMMMkk.',
  ];
  const E_KATANA_R = ['..............', 'kvvvvvvvvvvvvk', 'kVVVVVVVVVVVVk', '..............'];
  SE('ronin_walk', [cat(RONIN_BODY, BOOT_A), cat(RONIN_BODY, BOOT_B), cat(RONIN_BODY, BOOT_A), cat(RONIN_BODY, BOOT_D)], { fps: 5 });
  SE('ronin_attack', [
    paste(cat(RONIN_CROUCH, ['..kddkkkkkkddk..', '.kddddk..kddddk.', '..kkkk....kkkk..', '................']), ['ky', 'ky'], 1, 9),
    paste(cat(RONIN_BODY, BOOT_A), E_KATANA_R, 2, 8),
  ], { fps: 6 });

  // ---- Archer Waddle 弓箭手（bow）----
  const ARC_BODY = [
    '.....kkkkkk.....',
    '...kkooooookk...',
    '..kohhoooooook..',
    '..khoooonnnnnk..',
    '.koooooonnnnnnk.',
    '.koooonkknnkknk.',
    '.koooonkknnkknk.',
    '.koooonnnnnnnnkk',
    '.kooooonnnnnnook',
    '..kggggggggggkk.',
    '..kgggwwwwgggk..',
    '..kGGGGGGGGGGk..',
    '...kkGGGGGGkk...',
  ];
  const ARC_HAT = ['....k...........', '...ka...........', '..kga..kkkkkkk..', '.kgak.kgggggggk.', '.kak.kGGGGGGGGGk', '.kk..kkkkkkkkkkk'];
  const E_BOW = ['.kkk.', 'kggk.', 'k.ek.', 'k.ek.', 'k.ek.', 'kggk.', '.kkk.'];
  const E_BOW_D = ['.kkk.', 'kggk.', 'ke.k.', 'e..k.', 'ke.k.', 'kggk.', '.kkk.'];
  SE('archerwaddle_walk', [
    paste(cat(ARC_BODY, FEET_A), ARC_HAT, 0, 0),
    paste(cat(ARC_BODY, FEET_B), ARC_HAT, 0, 0),
    paste(cat(ARC_BODY, FEET_A), ARC_HAT, 0, 0),
    paste(cat(ARC_BODY, FEET_D), ARC_HAT, 0, 0),
  ], { fps: 6 });
  SE('archerwaddle_attack', [
    paste(paste(cat(ARC_BODY, FEET_A), ARC_HAT, 0, 0), E_BOW_D, 11, 4),
    paste(paste(cat(ARC_BODY, FEET_A), ARC_HAT, 0, 0), E_BOW, 11, 4),
  ], { fps: 8 });
})();
