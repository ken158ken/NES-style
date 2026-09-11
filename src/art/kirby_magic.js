// 魔法系像素圖（Round 5 變身大爆發）— mage 元素法師 / time 時間 / gravity 重力 / clone 分身
// 全部程式手繪；卡比面向右、anchor = bottom；帽子最底列＝帽緣；投射物 / 特效 anchor 見各自註解。
// 本檔自帶一份精簡的卡比組合器（與 art/kirby.js 同演算法，但那邊是 IIFE 私有，無法共用）。
(function () {
  'use strict';
  // ---------- 調色盤 ----------
  const PX = Object.assign({}, KB.PAL.kirby, {
    v: '#a860f0', V: '#6028a8', z: '#d8b0ff',        // 紫（魔力）
    n: '#242450', N: '#12122c',                       // 夜藍 / 近黑（黑洞）
    y: '#ffe040', Y: '#d09010', a: '#fff8c0',         // 金 / 淡黃
    i: '#b8f0ff', I: '#58a8e0', q: '#60d8f8', Q: '#2080b0',  // 冰 / 青
    f: '#ff9028', F: '#e83818',                       // 火
    s: '#c8c8d0', S: '#70707a',                       // 銀（齒輪 / 懷錶）
    t: '#c88850', T: '#805020',                       // 木（法杖）
    g: '#48c048', G: '#207828', j: '#40e0a0', J: '#18a070',
    e: '#f8f8f8', x: '#303030',
  });

  // ---------- 基本工具 ----------
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
  function rot90(rows) {
    const H = rows.length, W = Math.max(...rows.map(r => r.length)), p = rows.map(r => r + '.'.repeat(W - r.length)), out = [];
    for (let y = 0; y < W; y++) { let s = ''; for (let x = 0; x < H; x++) s += p[H - 1 - x][y]; out.push(s); }
    return out;
  }
  const rot180 = r => rot90(rot90(r));
  const rot270 = r => rot90(rot180(r));
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

  // ---------- 卡比零件 ----------
  const EYE = ['.k.', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];
  const EYE_SHUT = ['kkk'];
  const EYE_SQUINT = ['kkk', 'kkk', 'bb.'];
  const EYE_WIDE = ['kkk', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];
  const EYE_SPIRAL = ['kkk', 'kwk', 'kkk'];
  const MOUTH = ['k..k', '.kk.'];
  const MOUTH_O = ['.kk.', 'kmmk', '.kk.'];
  const MOUTH_LINE = ['kk'];
  const MOUTH_OPEN = ['.kkk.', 'kmmmk', 'kmmmk', '.kkk.'];
  const mouthBig = (w, h) => blob(w, h, [ell(0, 0, w, h)], { fill: 'm', edge: 'k', shade: false });
  const CHEEK = ['cc', 'cc'];
  const CHEEK_BIG = ['ccc', 'ccc'];
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
  const S = (name, frames, opts) => KB.sprite(name, PX, frames, opts);
  const wideK = o => kirby(Object.assign({ w: 24, h: 20, ox: 2 }, o));
  const bigK = o => kirby(Object.assign({ w: 28, h: 26, ox: 4, oy: 6 }, o));
  const hugeK = o => kirby(Object.assign({ w: 36, h: 32, ox: 8, oy: 12 }, o));

  // 圓環（魔法陣 / 能量環）：以角度區間畫一圈
  function ring(w, h, cx, cy, r, ch, step, ryk) {
    const out = blank(w, h).map(s => s.split(''));
    const k = ryk === undefined ? 0.45 : ryk;
    for (let a = 0; a < 360; a += (step || 10)) {
      const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r), y = Math.round(cy + Math.sin(a * Math.PI / 180) * r * k);
      if (x >= 0 && y >= 0 && x < w && y < h) out[y][x] = ch;
    }
    return out.map(s => s.join(''));
  }

  // ======================================================================
  //  1. mage 元素法師：尖帽 + 法杖
  // ======================================================================
  const STAFF_U = [
    '..k..',
    '.kyk.',
    'kyayk',
    'kavak',
    'kyayk',
    '.kyk.',
    '..k..',
    '.ktk.',
    '.kTk.',
    '.ktk.',
    '.kTk.',
    '.ktk.',
    '.kTk.',
    '..k..',
  ];
  const STAFF_R = rot90(STAFF_U), STAFF_L = rot270(STAFF_U);

  S('hat_mage', [[
    '....kk..............',
    '...kvvk.............',
    '...kvzvk............',
    '....kvvvk...........',
    '.....kvyvk..........',
    '......kvvvk.........',
    '.......kvvvkk.......',
    '.......kvvvzvk......',
    '......kvvvvvvvk.....',
    '.....kvvyvvvvvvk....',
    '....kvvvvvvvvvvk....',
    '..kkvvvvvvvvvvvkk...',
    '.kaaaaaaaaaaaaaaak..',
    '.kkkkkkkkkkkkkkkkk..',
  ], [
    '....kk..............',
    '...kvzk.............',
    '...kvvvk............',
    '....kvzvk...........',
    '.....kvvvk..........',
    '......kvyvk.........',
    '.......kvvvkk.......',
    '.......kvzvvvk......',
    '......kvvvvvvvk.....',
    '.....kvvvvyvvvvk....',
    '....kvvvvvvvvvvk....',
    '..kkvvvvvvvvvvvkk...',
    '.kaaaaaaaaaaaaaaak..',
    '.kkkkkkkkkkkkkkkkk..',
  ]], { fps: 3 });

  // 法杖姿勢用的大幀：32×24（ox 6 / oy 4）→ 卡比在 x6..26 / y4..24，法杖放得下
  const mageK = o => kirby(Object.assign({ w: 32, h: 24, ox: 6, oy: 4 }, o));
  const tallK = o => kirby(Object.assign({ w: 32, h: 30, ox: 6, oy: 10 }, o));

  // X 火球詠唱 2 幀（法杖高舉 → 前指、杖頭發亮）
  S('kirby_attack_mage', [
    mageK({ arms: [[15, 4, 5], [0, 8, 5]], front: [[STAFF_U, 18, -2]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    mageK({ arms: [[16, 7, 5], [0, 8, 5]], front: [[STAFF_R, 10, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 11], eyeAt: [[8, 5], [13, 5]] }),
  ], { fps: 10 });

  // ↑+X 冰牆：法杖橫掃，冰晶飛散
  S('kirby_attack_mage_wall', [
    mageK({ arms: [[15, 3, 5], [0, 8, 5]], front: [[STAFF_U, 18, -3]], eyes: EYE_WIDE, mouth: MOUTH_O, mouthAt: [9, 12] }),
    mageK({ arms: [[17, 8, 5], [0, 8, 5]], front: [[STAFF_R, 10, 9], [['.kiik.', 'kiiiik', 'kiIIik', '.kiik.'], 24, 4]],
      eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_LINE, mouthAt: [10, 13] }),
  ], { fps: 10 });

  // ↓+X 雷擊召喚：法杖高舉、抬頭（32×30）
  S('kirby_attack_mage_bolt', [
    tallK({ arms: [[16, 0, 5], [0, 8, 5]], front: [[STAFF_U, 16, -10]], eyeAt: [[7, 4], [12, 4]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
    tallK({ arms: [[16, -2, 5], [0, 8, 5]], front: [[STAFF_U, 16, -12]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(6, 5), mouthAt: [9, 11],
      back: [[ring(32, 30, 22, 4, 9, 'q', 14, 0.8), 0, 0]] }),
  ], { fps: 10 });

  // 空中 X 風刃三連：法杖橫揮 + 綠色風弧
  S('kirby_attack_mage_wind', [
    mageK({ arms: [[16, 4, 5], [0, 6, 5]], front: [[STAFF_R, 10, 4]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    mageK({ arms: [[16, 9, 5], [0, 6, 5]], front: [[STAFF_R, 10, 10], [['..gg', '.ggg', 'gggj', '.ggg', '..gg'], 25, 6]],
      eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[0, 15], [12, 15]] }),
  ], { fps: 14 });

  // 蓄力必殺「元素風暴」3 幀（36×32）：法杖高舉、四周元素環
  S('kirby_attack_mage_storm', [
    hugeK({ arms: [[16, 0, 5], [0, 0, 5]], front: [[STAFF_U, 18, -12]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(6, 5), mouthAt: [9, 11],
      back: [[ring(36, 32, 18, 17, 15, 'v', 12, 0.9), 0, 0]] }),
    hugeK({ arms: [[16, -2, 5], [0, -2, 5]], front: [[STAFF_U, 18, -15]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(7, 6), mouthAt: [9, 10],
      back: [[ring(36, 32, 18, 17, 17, 'f', 10, 0.85), 0, 0], [ring(36, 32, 18, 17, 11, 'i', 14, 0.9), 0, 0]] }),
    hugeK({ arms: [[16, -1, 5], [0, -1, 5]], front: [[STAFF_U, 18, -14]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(7, 6), mouthAt: [9, 10],
      back: [[ring(36, 32, 18, 17, 16, 'q', 10, 0.88), 0, 0], [ring(36, 32, 18, 17, 9, 'y', 16, 0.9), 0, 0]] }),
  ], { fps: 12 });

  // 投射物：魔法火球（10×10，center）
  S('proj_magefire', [[
    '...kfk....',
    '..kfFfk...',
    '.kfFaFfk..',
    'kfFaaaFfk.',
    'kFaayaaFk.',
    'kfFaaaFfk.',
    '.kfFaFfk..',
    '..kfFfk...',
    '...kfk....',
    '..........',
  ], [
    '...kFk....',
    '..kFfFk...',
    '.kFfyfFk..',
    'kFfyayfFk.',
    'kfyaaayfk.',
    'kFfyayfFk.',
    '.kFfyfFk..',
    '..kFfFk...',
    '...kFk....',
    '..........',
  ]], { fps: 12, anchor: 'center' });

  // 投射物：風刃（14×10，center）
  S('proj_windblade', [[
    '....kkkk......',
    '..kkggggkk....',
    '.kgjjggggkk...',
    'kgjeejggggk...',
    'kgjeejggggkk..',
    'kgjjggggggkk..',
    '.kggggggkk....',
    '..kkgggkk.....',
    '....kkk.......',
    '..............',
  ], [
    '...kkk........',
    '..kjggkk......',
    '.kjeeggggkk...',
    'kjeeejgggggk..',
    'kjeeejggggggk.',
    'kjeejgggggggk.',
    '.kjggggggggk..',
    '..kkggggkk....',
    '....kkk.......',
    '..............',
  ]], { fps: 14, anchor: 'center' });

  // 冰牆生成特效（16×16，center）
  S('fx_icewall', [[
    '.......kk.......',
    '......kiik......',
    '.....kiIIik.....',
    '....kiIeeIik....',
    '...kiIeeeeIik...',
    '..kiIeeeeeeIik..',
    '.kiIeeeeeeeeIik.',
    'kiIeeeeeeeeeeIik',
    'kiIeeeeeeeeeeIik',
    '.kiIeeeeeeeeIik.',
    '..kiIeeeeeeIik..',
    '...kiIeeeeIik...',
    '....kiIeeIik....',
    '.....kiIIik.....',
    '......kiik......',
    '.......kk.......',
  ]], { fps: 8, loop: false, anchor: 'center' });

  // 魔法陣（16×16，center，4 幀旋轉；VFX.circle 不在時的備援）
  const runeFrames = [];
  for (let i = 0; i < 4; i++) {
    let f = ring(16, 16, 8, 8, 7, 'v', 15);
    f = paste(f, ring(16, 16, 8, 8, 4, 'z', 24), 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k * 90 + i * 22) * Math.PI / 180;
      const x = Math.round(8 + Math.cos(a) * 7), y = Math.round(8 + Math.sin(a) * 3.2);
      f = paste(f, ['y'], x, y);
    }
    runeFrames.push(f);
  }
  S('fx_rune', runeFrames, { fps: 12, anchor: 'center' });

  // ======================================================================
  //  2. time 時間：懷錶帽 + 齒輪光環
  // ======================================================================
  const watchHat = hand => ([
    '........kk..........',
    '.......ksskk........',
    '......ksaaask.......',
    '......sakHkas.......'.replace('H', hand),
    '......ksakask.......',
    '.......ksssk........',
    '..kkkkkkkkkkkkkk....',
    '.kSssssssssssssSk...',
    '.kSsqssqssqssqsSk...',
    '.kSSSSSSSSSSSSSSk...',
    '.kkkkkkkkkkkkkkkk...',
  ]);
  S('hat_time', [watchHat('k'), watchHat('x')], { fps: 4 });

  // X 時停：雙手前推「停！」
  S('kirby_attack_time', [
    wideK({ arms: [[16, 6, 5], [14, 10, 5], [0, 8, 5]], eyes: EYE_WIDE, mouth: MOUTH_O, mouthAt: [9, 12] }),
    wideK({ arms: [[18, 6, 5], [16, 10, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: mouthBig(5, 4), mouthAt: [9, 12],
      back: [[ring(24, 20, 12, 10, 11, 'q', 12, 0.8), 0, 0]] }),
  ], { fps: 10 });

  // 時停中的近身拳
  S('kirby_attack_time_punch', [
    wideK({ arms: [[14, 7, 6], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    wideK({ arms: [[18, 7, 7], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[9, 6], [14, 6]], mouth: MOUTH_OPEN, mouthAt: [10, 11], cheekAt: [[5, 11], [16, 11]] }),
  ], { fps: 14 });

  // ↓+X 慢動作：單手下壓
  S('kirby_attack_time_slow', [
    wideK({ arms: [[16, 4, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    wideK({ arms: [[16, 11, 5], [0, 8, 5]], eyes: EYE_SHUT, eyeAt: [[7, 9], [12, 9]], mouth: MOUTH, mouthAt: [9, 12],
      back: [[ring(24, 20, 12, 11, 10, 'v', 14, 0.75), 0, 0]] }),
  ], { fps: 8 });

  // 空中 X 回溯：身體倒轉、螺旋眼
  S('kirby_attack_time_rewind', [
    wideK({ arms: [[16, 3, 5], [0, 12, 5]], eyes: EYE_SPIRAL, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [9, 12],
      back: [[ring(24, 20, 12, 10, 10, 'q', 14, 0.8), 0, 0]] }),
    wideK({ arms: [[16, 12, 5], [0, 3, 5]], eyes: EYE_SPIRAL, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [9, 12],
      back: [[ring(24, 20, 12, 10, 8, 'i', 14, 0.8), 0, 0]] }),
  ], { fps: 14 });

  // ↑+X 加速：前傾衝刺
  S('kirby_attack_time_haste', [
    wideK({ arms: [[2, 4, 5], [1, 10, 5]], eyeAt: [[9, 6], [14, 6]], mouth: MOUTH_LINE, mouthAt: [11, 13], cheekAt: [[6, 11], [16, 11]], feet: [[13, 15]], feetBack: [[1, 13]] }),
    wideK({ arms: [[2, 6, 5], [1, 12, 5]], eyeAt: [[9, 6], [14, 6]], mouth: MOUTH_OPEN, mouthAt: [10, 12], cheekAt: [[6, 11], [16, 11]], feet: [[4, 15], [11, 15]] }),
  ], { fps: 16 });

  // 齒輪（12×12，center，4 幀轉動）
  const gear0 = [
    '..k..k..k...',
    '.kskkskksk..',
    'kssssssssk..',
    '.ksskkssk...',
    'kskkxxkksk..',
    'kskxxxxksk..',
    'kskxxxxksk..',
    'kskkxxkksk..',
    '.ksskkssk...',
    'kssssssssk..',
    '.kskksksk...',
    '..k..k..k...',
  ];
  S('fx_gear', [gear0, rot90(gear0), rot180(gear0), rot270(gear0)], { fps: 10, anchor: 'center' });

  // ======================================================================
  //  3. gravity 重力：黑洞頭盔 + 紫色能量
  // ======================================================================
  S('hat_gravity', [[
    '........kk..........',
    '.......kvvk.........',
    '......kvzzvk........',
    '......kvzNzvk.......',
    '......kvzzzvk.......',
    '.......kvvvk........',
    '...kkkkkkkkkkkk.....',
    '..knnnnnnnnnnnnk....',
    '..knnvnnnnnvnnnk....',
    '..kNNNNNNNNNNNNk....',
    '..kkkkkkkkkkkkkk....',
  ], [
    '........kk..........',
    '.......kzzk.........',
    '......kzNNzk........',
    '......kzNvNzk.......',
    '......kzNNNzk.......',
    '.......kzzzk........',
    '...kkkkkkkkkkkk.....',
    '..knnnnnnnnnnnnk....',
    '..knnznnnnnznnnk....',
    '..kNNNNNNNNNNNNk....',
    '..kkkkkkkkkkkkkk....',
  ]], { fps: 5 });

  // X 黑洞：單手前推、掌心紫光
  S('kirby_attack_gravity', [
    wideK({ arms: [[15, 6, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
    wideK({ arms: [[18, 6, 6], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[8, 6], [13, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      front: [[['.kvk.', 'kvzvk', 'kzNzk', 'kvzvk', '.kvk.'], 17, 5]] }),
  ], { fps: 10 });

  // ↓+X 反重力：雙掌朝上
  S('kirby_attack_gravity_lift', [
    wideK({ arms: [[16, 5, 5], [0, 5, 5]], eyes: EYE_WIDE, mouth: MOUTH_O, mouthAt: [9, 12] }),
    wideK({ arms: [[16, 1, 5], [0, 1, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: mouthBig(5, 4), mouthAt: [9, 12],
      back: [[ring(24, 20, 12, 5, 11, 'v', 12, 0.7), 0, 0]] }),
  ], { fps: 10 });

  // 空中 X 隕石：指天（28×26）
  S('kirby_attack_gravity_meteor', [
    bigK({ arms: [[16, 1, 5], [0, 8, 5]], eyeAt: [[7, 4], [12, 4]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
    bigK({ arms: [[16, -2, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(6, 5), mouthAt: [9, 11],
      back: [[ring(28, 26, 17, 3, 9, 'f', 14, 0.75), 0, 0]] }),
  ], { fps: 10 });

  // ↑+X 重力翻轉（浮空）：身體浮起、手張開
  S('kirby_attack_gravity_float', [
    wideK({ arms: [[17, 5, 5], [-1, 5, 5]], eyes: EYE_WIDE, mouth: MOUTH_O, mouthAt: [9, 12], feet: [[1, 15], [11, 15]],
      back: [[ring(24, 20, 12, 11, 11, 'z', 14, 0.75), 0, 0]] }),
    wideK({ arms: [[17, 8, 5], [-1, 8, 5]], eyes: EYE_WIDE, mouth: MOUTH_O, mouthAt: [9, 12], dy: -1, feet: [[0, 15], [12, 15]],
      back: [[ring(24, 20, 12, 11, 9, 'v', 14, 0.8), 0, 0]] }),
  ], { fps: 8 });

  // 必殺「奇點」3 幀（36×32）
  S('kirby_attack_gravity_singularity', [
    hugeK({ arms: [[16, 2, 5], [0, 2, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(6, 5), mouthAt: [9, 11],
      back: [[ring(36, 32, 18, 17, 15, 'v', 12, 0.9), 0, 0]] }),
    hugeK({ arms: [[16, 0, 5], [0, 0, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(7, 6), mouthAt: [9, 10],
      back: [[ring(36, 32, 18, 17, 17, 'z', 10, 0.85), 0, 0], [ring(36, 32, 18, 17, 10, 'N', 14, 0.9), 0, 0]] }),
    hugeK({ arms: [[16, 1, 5], [0, 1, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(7, 6), mouthAt: [9, 10],
      back: [[ring(36, 32, 18, 17, 13, 'V', 10, 0.9), 0, 0], [ring(36, 32, 18, 17, 7, 'N', 18, 0.9), 0, 0]] }),
  ], { fps: 12 });

  // 隕石（12×16，bottom）
  S('proj_meteor', [[
    '....kkkk....',
    '...kFFFFk...',
    '..kFfffFk...',
    '.kFfaaafFk..',
    'kFfaayafFk..',
    'kFfaaaafFk..',
    'kFffaafffk..',
    '.kFfffffk...',
    '..kFFFFk....',
    '...kkkk.....',
    '..f....f....',
    '.f..ff..f...',
    '....ff......',
    '............',
    '............',
    '............',
  ], [
    '....kkkk....',
    '...kFfffk...',
    '..kFfaafk...',
    '.kFfayaafk..',
    'kFfaayaafk..',
    'kFfaaaaafk..',
    'kFffaaafffk.',
    '.kFffffffk..',
    '..kFFFFFk...',
    '...kkkk.....',
    '.f...f...f..',
    '..f.ff..f...',
    '...ff.......',
    '............',
    '............',
    '............',
  ]], { fps: 12 });

  // 黑洞（24×24，center，4 幀）
  const holeFrames = [];
  for (let i = 0; i < 4; i++) {
    let f = blank(24, 24);
    f = paste(f, blob(24, 24, [circ(4, 4, 16)], { fill: 'N', edge: 'V', hi: 'v', lo: 'N', shade: false }), 0, 0);
    f = paste(f, blob(24, 24, [circ(8, 8, 8)], { fill: 'x', edge: 'N', shade: false }), 0, 0);
    f = paste(f, ring(24, 24, 12, 12, 11 - i * 0.6, 'v', 18), 0, 0);
    f = paste(f, ring(24, 24, 12, 12, 8 - i * 0.5, 'z', 26), 0, 0);
    holeFrames.push(f);
  }
  S('proj_blackhole', holeFrames, { fps: 14, anchor: 'center' });

  // ======================================================================
  //  4. clone 分身：雙尾裝飾 + 小卡比
  // ======================================================================
  S('hat_clone', [[
    '..kk............kk..',
    '.kyyk..........kyyk.',
    '.kyak..........kyak.',
    '..kykkkkkkkkkkkyk...',
    '..kPppppppppppppk...',
    '..kplpppppppppplk...',
    '..kPPPPPPPPPPPPPk...',
    '..kkkkkkkkkkkkkkk...',
  ], [
    '.kk..............kk.',
    'kyyk............kyyk',
    'kyak............kyak',
    '.kykkkkkkkkkkkkkyk..',
    '..kPppppppppppppk...',
    '..kplpppppppppplk...',
    '..kPPPPPPPPPPPPPk...',
    '..kkkkkkkkkkkkkkk...',
  ]], { fps: 5 });

  // X 全員吐星（22×20）
  const breathK = o => kirby(Object.assign({ w: 22, h: 20, ox: 1, cheekAt: [[4, 10]], feet: [[0, 15], [12, 15]], arms: [[0, 8, 5], [15, 8, 5]] }, o));
  S('kirby_attack_clone', [
    breathK({ eyes: EYE_SQUINT, eyeAt: [[7, 5], [11, 5]], mouth: mouthBig(6, 5), mouthAt: [12, 9] }),
    breathK({ eyes: EYE_SQUINT, eyeAt: [[7, 4], [11, 4]], mouth: mouthBig(7, 6), mouthAt: [12, 8] }),
  ], { fps: 12 });

  // ↓+X 交換位置：抱膝縮成一團
  S('kirby_attack_clone_swap', [
    wideK({ arms: [[14, 10, 5], [2, 10, 5]], eyes: EYE_SHUT, eyeAt: [[7, 9], [12, 9]], mouth: MOUTH_LINE, mouthAt: [10, 13], feet: [[2, 15], [10, 15]] }),
    wideK({ body: [4, 4, 13], arms: [], eyes: EYE_SHUT, eyeAt: [[8, 10], [12, 10]], mouth: MOUTH_LINE, mouthAt: [10, 14], cheekAt: [[6, 12]], feet: [[4, 15], [9, 15]] }),
  ], { fps: 12 });

  // 空中 X 分身墊腳：向上蹬
  S('kirby_attack_clone_step', [
    wideK({ arms: [[16, 2, 5], [0, 2, 5]], eyeAt: [[7, 4], [12, 4]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[2, 15], [10, 15]] }),
    wideK({ arms: [[16, 0, 5], [0, 0, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], mouth: mouthBig(5, 4), mouthAt: [9, 12], feet: [[1, 16], [11, 16]] }),
  ], { fps: 12 });

  // 必殺「百裂分身」3 幀（36×32）
  S('kirby_attack_clone_rush', [
    hugeK({ arms: [[3, 4, 5], [1, 10, 5]], eyes: EYE_SQUINT, eyeAt: [[9, 6], [14, 6]], mouth: MOUTH_OPEN, mouthAt: [10, 12], feet: [[13, 15]], feetBack: [[1, 13]] }),
    hugeK({ arms: [[16, 6, 5], [14, 10, 5]], eyes: EYE_SQUINT, eyeAt: [[9, 6], [14, 6]], mouth: mouthBig(6, 5), mouthAt: [10, 11], feet: [[3, 15], [11, 15]] }),
    hugeK({ arms: [[18, 6, 6], [15, 11, 5]], eyes: EYE_SQUINT, eyeAt: [[10, 6], [15, 6]], mouth: mouthBig(6, 5), mouthAt: [11, 11], feet: [[5, 15], [12, 15]] }),
  ], { fps: 16 });

  // 小卡比分身（12×12，bottom，2 幀）
  const miniBody = blob(12, 11, [circ(1, 0, 10), circ(9, 5, 3), circ(0, 5, 3)], null);
  const mini = feet => {
    let f = paste(blank(12, 12), miniBody, 0, 0);
    f = paste(f, ['k', 'k', 'b'], 4, 3);
    f = paste(f, ['k', 'k', 'b'], 7, 3);
    f = paste(f, ['c'], 2, 6);
    f = paste(f, ['c'], 9, 6);
    f = paste(f, ['kk'], 5, 7);
    for (const [x, y] of feet) f = paste(f, ['krrk', 'kRRk', '.kk.'], x, y);
    return f;
  };
  S('kirby_clone', [mini([[1, 9], [7, 9]]), mini([[2, 9], [6, 9]])], { fps: 6 });

  // 小星（8×8，center）
  S('proj_ministar', [[
    '...k....',
    '..kyk...',
    '.kyayk..',
    'kyaaayk.',
    '.kyayk..',
    '.kykyk..',
    'kk...kk.',
    '........',
  ], [
    '...k....',
    '..kak...',
    '.kaeak..',
    'kaeeeak.',
    '.kaeak..',
    '.kakak..',
    'kk...kk.',
    '........',
  ]], { fps: 10, anchor: 'center' });

  // ======================================================================
  //  能力圖示（24×16）：卡比戴帽 + 右側象徵物
  // ======================================================================
  const KHEAD = [
    '....kkkkkk....',
    '..kkppppppkk..',
    '.kppplppppppk.',
    '.kppwwppwwppk.',
    'kpppkkppkkpppk',
    'kpppkkppkkpppk',
    'kpcpbbppbbpcpk',
    'kpcpppppppppck',
    'kppppmppmpppPk',
    '.kppppmmpppPk.',
    '..kppppppPPk..',
    '....kkkkkk....',
  ];
  const ICON_HAT = {
    mage: [
      '.....kk.........',
      '....kvvk........',
      '....kvzk........',
      '...kvvvvk.......',
      '..kvvyvvvk......',
      '.kvvvvvvvvvk....',
      '.kaaaaaaaaaak...',
    ],
    time: [
      '................',
      '......kkkk......',
      '.....ksaask.....',
      '.....sakwas.....',
      '.....ksaask.....',
      '..kkkkkkkkkkkk..',
      '..kSSSSSSSSSSk..',
    ],
    gravity: [
      '................',
      '......kvvk......',
      '.....kvzNzvk....',
      '......kvvk......',
      '..kkkkkkkkkkkk..',
      '..knnnnnnnnnnk..',
      '..kNNNNNNNNNNk..',
    ],
    clone: [
      '.kk..........kk.',
      'kyyk........kyyk',
      '.kyk........kyk.',
      '..kkkkkkkkkkkk..',
      '..kppppppppppk..',
      '..kplppppppplk..',
      '..kPPPPPPPPPPk..',
    ],
  };
  const ICON_MINI = {
    mage: [
      '.....kk.',
      '....kyak',
      '.....kyk',
      '...kvk..',
      '..kvk...',
      '.kvk....',
      '.kk.....',
      '........',
    ],
    time: [
      '..kkkk..',
      '.kaaaak.',
      'kaakaaak',
      'kaakaaak',
      'kaakkaak',
      'kaaaaaak',
      '.kaaaak.',
      '..kkkk..',
    ],
    gravity: [
      '..kkkk..',
      '.kvvvvk.',
      'kvzNNzvk',
      'kvNNNNvk',
      'kvNNNNvk',
      'kvzNNzvk',
      '.kvvvvk.',
      '..kkkk..',
    ],
    clone: [
      '.kkk.kkk',
      'kpkpkpkp',
      'kpppkppp',
      'kpppkppp',
      '.kkk.kkk',
      '.krk.krk',
      '........',
      '........',
    ],
  };
  for (const key of ['mage', 'time', 'gravity', 'clone']) {
    let icon = blank(24, 16);
    icon = paste(icon, KHEAD, 1, 4);
    icon = paste(icon, ICON_HAT[key], 0, 0);
    icon = paste(icon, ICON_MINI[key], 16, 4);
    S('ui_ability_' + key, [icon]);
    S('ui_ability_' + key + '_mini', [ICON_MINI[key]]);
  }

  // ======================================================================
  //  魔法系敵人
  // ======================================================================
  const PE = Object.assign({}, KB.PAL.enemy, {
    v: '#a860f0', V: '#6028a8', z: '#d8b0ff', n: '#242450', N: '#12122c',
    a: '#fff8c0', q: '#60d8f8', Q: '#2080b0', j: '#40e0a0', x: '#000000',
    h: '#ffc890', u: '#ffe8c8',
  });
  const S2 = (name, frames, opts) => KB.sprite(name, PE, frames, opts);

  // ---- Wizzle 小巫師（14×18）：尖帽 + 斗篷 + 火球 ----
  const WIZ_BASE = [
    '.....kk.......',
    '....kvvk......',
    '...kvzvk......',
    '..kvvvvk......',
    '..kvvvvkk.....',
    '.kvvvvvvvk....',
    'kvvvvvvvvvk...',
    'kkkkkkkkkkk...',
    '.kuuuuuuuk....',
    '.kukxukxuk....',
    '.kuuuuuuuk....',
    '.kuuwwwuuk....',
    '.kkkkkkkkk....',
    '.kVvvvvvVk....',
    'kVvvvvvvvVk...',
    'kVvvvvvvvVk...',
    'kVVVVVVVVVk...',
    '.kk.....kk....',
  ];
  const WIZ_B = paste(WIZ_BASE, ['.kk.....kk....'], 0, 17);
  S2('wizzle_walk', [WIZ_BASE, paste(WIZ_BASE.slice(0, 17).concat(['..kk...kk.....']), [], 0, 0)], { fps: 5 });
  S2('wizzle_attack', [
    paste(WIZ_BASE, ['kfk', 'fFf', 'kfk'], 11, 9),
    paste(WIZ_BASE, ['.kFk.', 'kFafk', 'kfaFk', '.kFk.'], 10, 8),
  ], { fps: 8 });

  // ---- Tik-Tok 時鐘怪（16×16）：座鐘 + 鐘擺 ----
  const CLOCK = hand => ([
    '...kkkkkkkk...',
    '..kssssssssk..',
    '.kskaaaaaaksk.',
    '.ksaaaaaaaask.',
    '.ksaaHHaaaask'.replace('HH', hand) + '.',
    '.ksaaaaaaaask.',
    '.ksaaaaaaaask.',
    '.kskaaaaaaksk.',
    '..kSssssssSk..',
    '..kSkxxxxkSk..',
    '..kSkxwwxkSk..',
    '..kSkxxxxkSk..',
    '..kSSSSSSSSk..',
    '..kkkkkkkkkk..',
    '..kk......kk..',
    '..kk......kk..',
  ]);
  S2('tiktok_walk', [CLOCK('kx'), CLOCK('xk')], { fps: 4 });
  S2('tiktok_attack', [
    paste(CLOCK('kk'), ['q.q', '.q.', 'q.q'], 1, 2),
    paste(CLOCK('xx'), ['.q.', 'q.q', '.q.'], 10, 2),
  ], { fps: 10 });

  // ---- Gravitron 浮球（14×14）：紫色浮游球 + 環 ----
  const GRAV_BALL = r => {
    let f = paste(blank(14, 14), blob(14, 14, [circ(1, 1, 12)], { fill: 'v', edge: 'k', hi: 'z', lo: 'V', shade: true }), 0, 0);
    f = paste(f, ['kNk', 'NxN', 'kNk'], 5, 5);
    f = paste(f, ring(14, 14, 7, 7, r, 'z', 30), 0, 0);
    return f;
  };
  S2('gravitron_walk', [GRAV_BALL(6.5), GRAV_BALL(5.5)], { fps: 6 });
  S2('gravitron_attack', [
    paste(GRAV_BALL(6.8), ['z.....z', '.......', 'z.....z'], 3, 6),
    paste(GRAV_BALL(4.5), ['..v..', 'v...v', '..v..'], 4, 5),
  ], { fps: 12 });

  // ---- Mimi 模仿者（14×15）：模仿卡比外型的小怪（灰紫色） ----
  const MIMI_BODY = blob(14, 13, [circ(1, 0, 12), circ(10, 6, 4), circ(-1, 6, 4)], { fill: 'z', edge: 'k', hi: 'w', lo: 'v', shade: true });
  const mimiF = (feet, eyes) => {
    let f = paste(blank(14, 15), MIMI_BODY, 0, 0);
    f = paste(f, eyes, 4, 3); f = paste(f, eyes, 8, 3);
    f = paste(f, ['kk'], 6, 8);
    for (const [x, y] of feet) f = paste(f, ['kmmk', 'kMMk', '.kk.'], x, y);
    return f;
  };
  S2('mimi_walk', [mimiF([[1, 12], [8, 12]], ['k', 'k', 'w']), mimiF([[2, 12], [7, 12]], ['k', 'k', 'w'])], { fps: 6 });
  S2('mimi_attack', [
    mimiF([[1, 12], [8, 12]], ['k', 'k', 'r']),
    paste(mimiF([[1, 12], [8, 12]], ['k', 'k', 'r']), ['.kk.', 'kmmk', 'kmmk', '.kk.'], 5, 7),
  ], { fps: 10 });
})();
