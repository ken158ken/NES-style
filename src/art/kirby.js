// 卡比像素圖（art-kirby）—— 全部原創手繪 / 程序組合，面向右，anchor bottom
// 作法：以「橢圓遮罩聯集 → 1px 深藍輪廓 → 高光/陰影」產生圓滾滾身體，再貼上手繪的眼、嘴、腮紅、腳、武器。
(function () {
  const P = KB.PAL.kirby;
  // 擴充調色盤（武器 / 帽子 / 石頭高光）。基本字元沿用 KB.PAL.kirby。
  const PX = Object.assign({}, P, {
    f: '#ff9028', F: '#e83818',      // 橘 / 深橘（火焰）
    v: '#b8f0c8', V: '#309850',      // 劍身淡綠 / 劍緣綠
    n: '#48c048', N: '#207828',      // 綠 / 深綠（帽）
    u: '#4878f8', U: '#2040a8',      // 藍 / 深藍（帽）
    i: '#b8f0ff', I: '#58a8e0',      // 冰
    s: '#c8c8d0', S: '#70707a',      // 鐵
    t: '#c88850', T: '#805020',      // 木頭
    a: '#fff8c0',                    // 淡黃
    h: '#c8c8d0',                    // 石頭高光
    x: '#303030',
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
  function rot90(rows) {  // 順時針 90°
    const H = rows.length, W = rows[0].length, out = [];
    for (let y = 0; y < W; y++) { let s = ''; for (let x = 0; x < H; x++) s += rows[H - 1 - x][y]; out.push(s); }
    return out;
  }
  const rot180 = rows => rot90(rot90(rows));
  const rot270 = rows => rot90(rot180(rows));
  const recolor = (rows, map) => rows.map(r => r.split('').map(c => map[c] || c).join(''));
  const shift = (rows, w, h, dx, dy) => paste(blank(w, h), rows, dx, dy);

  // 橢圓：左上 (x,y)、寬 w、高 h
  const ell = (x, y, w, h) => ({ cx: x + w / 2, cy: y + h / 2, rx: w / 2 - 0.01, ry: h / 2 - 0.01 });
  const circ = (x, y, d) => ell(x, y, d, d);
  // 橢圓聯集 → 上色：edge 輪廓、fill 主色、hi 高光、lo 陰影（依第一個橢圓計算光影）
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

  // ---------- 零件（面向右） ----------
  const EYE = ['.k.', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];          // 3×6 標準眼
  const EYE_HALF = ['kkk', 'kkk', 'bbb', '.b.'];                  // 半閉（含物）
  const EYE_SHUT = ['kkk'];                                        // 閉眼
  const EYE_HAPPY = ['k.k', '.k.'];                                // ^ 開心（倒 v 形）
  const EYE_HAPPY2 = ['.k.', 'k.k'];                               // ^ 形
  const EYE_X = ['k.k', '.k.', 'k.k'];                             // X
  const EYE_GT = ['k..', '.kk', 'k..'];                            // >
  const EYE_LT = ['..k', 'kk.', '..k'];                            // <
  const EYE_SQUINT = ['kkk', 'kkk', 'bb.'];                        // 用力瞇眼
  const MOUTH = ['k..k', '.kk.'];                                  // 微笑
  const MOUTH_O = ['.kk.', 'kmmk', '.kk.'];                        // 小 o
  const MOUTH_LINE = ['kk'];                                       // 抿嘴
  const MOUTH_WIDE = ['k.....k', '.kkkkk.'];                       // 含物閉嘴
  const MOUTH_OPEN = ['.kkk.', 'kmmmk', 'kmmmk', '.kkk.'];         // 張嘴（小）
  const mouthBig = (w, h) => blob(w, h, [ell(0, 0, w, h)], { fill: 'm', edge: 'k', shade: false });
  const CHEEK = ['cc', 'cc'];
  const CHEEK_BIG = ['ccc', 'ccc'];
  const FOOT = [                                                    // 8×5 腳（正面）
    '..kkkk..',
    '.krrrrk.',
    'krrrrrrk',
    'kRRRRRRk',
    '.kkkkkk.',
  ];
  const FOOT_SIDE = rot90(FOOT);                                    // 5×8（腳朝側面 / 游泳）

  // ---------- 組合器 ----------
  // 標準 20×20 卡比：body [x,y,d]、arms [[x,y,d]...]（與身體聯集）、feet [[x,y]]（前景）、feetBack（背景）
  // ox/oy 為整體位移（放進較大幀用）；dy 為身體/臉上下起伏（腳不動）
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

  // ============================================================
  //  基本動作（20×20）
  // ============================================================
  // 站立：幀1 眨眼
  S('kirby_idle', [
    kirby({}),
    kirby({ eyes: EYE_SHUT, eyeAt: [[7, 9], [12, 9]] }),
  ], { fps: 2 });

  // 走路 4 幀：腳前後交替、身體 1px 起伏
  S('kirby_walk', [
    kirby({ feet: [[12, 15]], feetBack: [[0, 14]] }),
    kirby({ dy: -1, feet: [[2, 15], [10, 15]] }),
    kirby({ feet: [[0, 15]], feetBack: [[12, 14]] }),
    kirby({ dy: -1, feet: [[2, 15], [10, 15]] }),
  ], { fps: 8 });

  // 跑步：身體前傾（臉往右下）、雙手往後、步幅大
  const runBase = { eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]], arms: [[0, 5, 5], [0, 10, 5]] };
  S('kirby_run', [
    kirby(Object.assign({}, runBase, { feet: [[12, 15]], feetBack: [[0, 13]] })),
    kirby(Object.assign({}, runBase, { dy: -1, feet: [[3, 15], [9, 15]] })),
    kirby(Object.assign({}, runBase, { feet: [[0, 15]], feetBack: [[12, 13]] })),
    kirby(Object.assign({}, runBase, { dy: -1, feet: [[2, 15], [10, 15]] })),
  ], { fps: 12 });

  // 跳躍：雙手舉起、腳併攏
  S('kirby_jump', [kirby({ arms: [[16, 3, 4], [0, 3, 4]], feet: [[2, 15], [10, 15]] })]);
  // 下落：手張開、腳張開、嘴微張
  S('kirby_fall', [kirby({ arms: [[15, 6, 5], [0, 6, 5]], feet: [[0, 15], [12, 15]], mouth: MOUTH_O, mouthAt: [9, 12] })]);
  // 翻滾 4 幀：整隻旋轉（球置中，手縮起）
  const flipBase = kirby({ body: [2, 2, 16], arms: [], eyeAt: [[7, 6], [12, 6]], mouthAt: [9, 13], cheekAt: [[4, 11], [15, 11]], feet: [[2, 15], [10, 15]] });
  S('kirby_flip', [flipBase, rot90(flipBase), rot180(flipBase), rot270(flipBase)], { fps: 12 });

  // ============================================================
  //  漂浮 / 吸入 / 含物（24×24）
  // ============================================================
  // 漂浮體：20px 大圓、臉頰鼓起、嘴鼓成小圓
  const floatK = o => kirby(Object.assign({
    w: 24, h: 24, body: [2, 2, 20], arms: [[19, 9, 5], [0, 9, 5]],
    eyeAt: [[9, 7], [14, 7]], cheeks: CHEEK_BIG, cheekAt: [[5, 12], [18, 12]],
    mouth: MOUTH_O, mouthAt: [12, 14], feet: [[4, 19], [13, 19]],
  }, o));
  // 含物體：22px 大圓、眼睛半閉、嘴抿成寬線
  const fullK = o => kirby(Object.assign({
    w: 24, h: 24, body: [1, 1, 22], arms: [[19, 10, 5], [0, 10, 5]],
    eyes: EYE_HALF, eyeAt: [[9, 8], [14, 8]], cheeks: CHEEK_BIG, cheekAt: [[5, 11], [18, 11]],
    mouth: MOUTH_WIDE, mouthAt: [9, 14], feet: [[3, 19], [13, 19]],
  }, o));
  // 標準體放進 24×24 幀（底部對齊、水平置中）
  const stdK = o => kirby(Object.assign({ w: 24, h: 24, ox: 2, oy: 4 }, o));

  // 漂浮 4 幀：一次拍動（手上 → 平 → 下 → 平）
  S('kirby_float', [
    floatK({ arms: [[20, 3, 4], [0, 3, 4]] }),
    floatK({ arms: [[19, 8, 5], [0, 8, 5]] }),
    floatK({ arms: [[18, 14, 5], [1, 14, 5]] }),
    floatK({ arms: [[19, 8, 5], [0, 8, 5]] }),
  ], { fps: 5 });

  // 吸入 2 幀：嘴巴大張成黑色橢圓、眼睛擠上去、腳張開（22×20，身體略前傾）
  const inhaleBase = { w: 22, h: 20, ox: 1, eyeAt: [[7, 4], [11, 4]], cheekAt: [[4, 10]], feet: [[0, 15], [12, 15]], arms: [[0, 8, 5], [15, 8, 5]] };
  S('kirby_inhale', [
    kirby(Object.assign({}, inhaleBase, { mouth: mouthBig(7, 5), mouthAt: [12, 9] })),
    kirby(Object.assign({}, inhaleBase, { mouth: mouthBig(9, 6), mouthAt: [12, 8], eyeAt: [[7, 3], [11, 3]] })),
  ], { fps: 8 });

  // 含物站立 2 幀（幀1 眼睛閉緊）
  S('kirby_full_idle', [
    fullK({}),
    fullK({ eyes: EYE_SHUT, eyeAt: [[9, 10], [14, 10]] }),
  ], { fps: 2 });
  // 含物走路 4 幀
  S('kirby_full_walk', [
    fullK({ feet: [[14, 19]], feetBack: [[2, 18]] }),
    fullK({ dy: -1, feet: [[4, 19], [12, 19]] }),
    fullK({ feet: [[2, 19]], feetBack: [[14, 18]] }),
    fullK({ dy: -1, feet: [[4, 19], [12, 19]] }),
  ], { fps: 8 });
  // 含物跳躍
  S('kirby_full_jump', [fullK({ arms: [[19, 4, 5], [0, 4, 5]], feet: [[4, 19], [12, 19]] })]);

  // 吐出 2 幀：大身體張大嘴 → 恢復原狀張嘴
  S('kirby_spit', [
    fullK({ eyes: EYE_SQUINT, eyeAt: [[8, 7], [12, 7]], cheekAt: [[5, 11]], mouth: mouthBig(9, 7), mouthAt: [13, 11] }),
    stdK({ mouth: MOUTH_OPEN, mouthAt: [10, 11], cheekAt: [[4, 10]] }),
  ], { fps: 10 });
  // 吞下 2 幀：閉眼閉嘴 → 恢復、開心
  S('kirby_swallow', [
    fullK({ eyes: EYE_SHUT, eyeAt: [[9, 10], [14, 10]], mouth: MOUTH_LINE, mouthAt: [12, 15] }),
    stdK({ eyes: EYE_HAPPY2, eyeAt: [[7, 8], [12, 8]] }),
  ], { fps: 10 });
  // 漂浮吐氣 2 幀：大身體張嘴 → 恢復原狀
  S('kirby_exhale', [
    floatK({ mouth: mouthBig(5, 4), mouthAt: [14, 13], arms: [[19, 8, 5], [0, 8, 5]] }),
    stdK({ mouth: MOUTH_O, mouthAt: [9, 12], arms: [[15, 6, 5], [0, 6, 5]] }),
  ], { fps: 10 });

  // ============================================================
  //  滑鏟 / 蹲下 / 受傷 / 死亡 / 游泳 / 爬梯 / 進門 / 跳舞 / 石頭
  // ============================================================
  const EYE_SHORT = ['.k.', 'wkk', 'kkk', 'bbb'];                 // 3×4 壓扁的眼
  // 滑鏟 24×12：壓扁向前伸、腳在後
  (function () {
    let f = blank(24, 12);
    f = paste(f, FOOT, 0, 7); f = paste(f, FOOT, 1, 3);
    f = paste(f, blob(24, 12, [ell(5, 2, 18, 10), circ(20, 3, 4)]), 0, 0);
    f = paste(f, CHEEK, 9, 7); f = paste(f, CHEEK, 20, 7);
    f = paste(f, EYE_SHORT, 12, 4); f = paste(f, EYE_SHORT, 16, 4);
    f = paste(f, MOUTH, 14, 8);
    S('kirby_slide', [f]);
  })();
  // 蹲下 20×13：寬 20 高 11 的橢圓，腳從兩側露出
  (function () {
    let f = blank(20, 13);
    f = paste(f, blob(20, 13, [ell(0, 0, 20, 11)]), 0, 0);
    f = paste(f, CHEEK, 3, 6); f = paste(f, CHEEK, 15, 6);
    f = paste(f, EYE_SHORT, 7, 3); f = paste(f, EYE_SHORT, 12, 3);
    f = paste(f, MOUTH, 9, 8);
    f = paste(f, FOOT, 1, 8); f = paste(f, FOOT, 11, 8);
    S('kirby_crouch', [f]);
  })();
  // 受傷：> < 眼、張嘴、手舉起、腳張開
  S('kirby_hurt', [kirby({ eyes: [EYE_GT, EYE_LT], eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 11], arms: [[15, 4, 5], [0, 4, 5]], feet: [[0, 15], [12, 15]] })]);
  // 死亡 4 幀：X 眼、張嘴、整隻旋轉
  const deadBase = kirby({ body: [2, 2, 16], arms: [], eyes: EYE_X, eyeAt: [[7, 7], [12, 7]], mouth: MOUTH_OPEN, mouthAt: [9, 11], cheekAt: [[4, 11], [15, 11]], feet: [[2, 15], [10, 15]] });
  S('kirby_dead', [deadBase, rot90(deadBase), rot180(deadBase), rot270(deadBase)], { fps: 8 });
  // 游泳 2 幀（24×20）：橫躺、腳在後踢水、前手划水
  const swimK = o => kirby(Object.assign({
    w: 24, h: 20, ox: 4, oy: 1, mouth: MOUTH_O, mouthAt: [9, 12], feet: [],
  }, o));
  S('kirby_swim', [
    swimK({ feetBack: [[-4, 7], [-3, 11]], arms: [[14, 2, 5], [16, 0, 4], [-1, 9, 5]] }),
    swimK({ feetBack: [[-3, 7], [-4, 11]], arms: [[15, 9, 5], [17, 11, 4], [-1, 9, 5]] }),
  ], { fps: 4 });
  // 爬梯 2 幀：背影、雙手交替往上抓
  const backK = o => kirby(Object.assign({ eyes: null, mouth: null, cheeks: null }, o));
  S('kirby_climb', [
    backK({ arms: [[0, 2, 5], [15, 5, 5]], feet: [[1, 15], [11, 13]] }),
    backK({ arms: [[0, 5, 5], [15, 2, 5]], feet: [[1, 13], [11, 15]] }),
  ], { fps: 6 });
  // 水中吸入 2 幀（24×20）：橫躺 + 大張嘴（嘴前方是吸力範圍）
  S('kirby_swim_inhale', [
    swimK({ mouth: mouthBig(7, 5), mouthAt: [10, 11], eyeAt: [[6, 4], [10, 4]], cheekAt: [[3, 10]],
      feetBack: [[-4, 7], [-3, 11]], arms: [[14, 2, 5], [16, 1, 4], [-1, 9, 5]] }),
    swimK({ mouth: mouthBig(9, 6), mouthAt: [10, 10], eyeAt: [[6, 3], [10, 3]], cheekAt: [[3, 10]],
      feetBack: [[-3, 7], [-4, 11]], arms: [[15, 8, 5], [17, 10, 4], [-1, 9, 5]] }),
  ], { fps: 8 });
  // 爬梯上 / 下端過渡（1 幀，背影把身體撐上去）
  S('kirby_climb_top', [backK({ dy: -1, arms: [[0, 1, 5], [15, 1, 5]], feet: [[2, 16], [10, 16]] })]);
  // 騎傳送星 2 幀：坐姿（雙手舉高、雙腳往前伸、開心眼）；星星由 player.js 另外畫在下方
  const rideK = o => kirby(Object.assign({
    arms: [[15, 3, 5], [0, 5, 5]], eyes: EYE_HAPPY2, eyeAt: [[7, 6], [12, 6]],
    mouth: MOUTH_O, mouthAt: [9, 12], cheekAt: [[4, 10], [15, 10]],
    feet: [[12, 14], [7, 16]],
  }, o));
  S('kirby_ride', [rideK({}), rideK({ dy: -1 })], { fps: 6 });
  // 進門 2 幀：背影走進去
  S('kirby_door', [
    backK({ feet: [[0, 15], [12, 15]] }),
    backK({ dy: -1, feet: [[2, 15], [10, 15]] }),
  ], { fps: 6 });
  // 過關跳舞 6 幀（24×24）：舉手 → 放下 → 跳起 → 轉身 → 跳起 → 落地
  S('kirby_dance', [
    stdK({ arms: [[15, 2, 5], [0, 2, 5]], eyes: EYE_HAPPY2, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[0, 15], [12, 15]] }),
    stdK({ arms: [[15, 9, 5], [0, 9, 5]], feet: [[2, 15], [10, 15]] }),
    stdK({ dy: -3, arms: [[15, 2, 5], [0, 2, 5]], eyes: EYE_HAPPY2, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[3, 12], [9, 12]] }),
    stdK({ eyes: null, mouth: null, cheeks: null, arms: [[15, 6, 5], [0, 6, 5]], feet: [[1, 15], [11, 15]] }),
    stdK({ dy: -3, arms: [[15, 2, 5], [0, 2, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[3, 12], [9, 12]] }),
    stdK({ arms: [[15, 10, 5], [0, 10, 5]], eyes: EYE_HAPPY2, eyeAt: [[7, 8], [12, 8]], mouth: MOUTH_OPEN, mouthAt: [9, 11], feet: [[0, 15], [12, 15]] }),
  ], { fps: 6 });
  // 石頭形態：3 種外觀，abilities.js 每次變身隨機把 KB.SPR.kirby_stone 指向其中一個
  // 1. 岩石：灰色石像（保留卡比輪廓，眼睛也是石頭）
  const STONE_ROCK = recolor(kirby({}), { p: 'g', P: 'G', l: 'h', k: 'd', r: 'G', R: 'd', w: 'h', b: 'G', c: 'g', m: 'd' });
  S('kirby_stone', [STONE_ROCK]);
  S('kirby_stone_1', [STONE_ROCK]);
  // 2. 石像：沙岩雕像 + 方形底座（閉眼、抿嘴、無腳）
  const SAND = { '1': '#d8c4a0', '2': '#a08858', '3': '#5a4830' };
  const PEDESTAL = [
    '.3333333333333333.',
    '.3222222222222223.',
    '.3211111111111123.',
    '.3333333333333333.',
  ];
  const STONE_STATUE = paste(
    recolor(kirby({ eyes: EYE_SHUT, eyeAt: [[7, 9], [12, 9]], mouth: MOUTH_LINE, mouthAt: [9, 13], cheeks: null, feet: [] }),
      { p: '1', P: '2', l: 'w', k: '3', w: 'w', b: '2', c: '1', m: '3', r: '2', R: '3' }),
    PEDESTAL, 1, 16);
  KB.sprite('kirby_stone_2', Object.assign({}, PX, SAND), [STONE_STATUE]);
  // 3. 鐵塊：鉚釘鐵方塊（20×20，底部對齊）
  const IRON = [
    '.kkkkkkkkkkkkkkkk.',
    'kwwwsssssssssssssk',
    'kwssssssssssssssSk',
    'kssssssssssssssSSk',
    'ksssskksssskksssSk',
    'ksssskksssskksssSk',
    'ksssssssssssssssSk',
    'ksssskkkkkkkkssSSk',
    'ksssssssssssssssSk',
    'kSssssssssssssssSk',
    'kSSsssssssssssSSSk',
    'kSSSssssssssSSSSSk',
    'kSSSSSSSSSSSSSSSSk',
    'kSSSSSSSSSSSSSSSSk',
    'kSSSSSSSSSSSSSSSSk',
    '.kkkkkkkkkkkkkkkk.',
  ];
  S('kirby_stone_3', [paste(blank(20, 20), IRON, 1, 4)]);

  // ============================================================
  //  攻擊姿勢（不含帽子）
  // ============================================================
  // 弧線圖層（劍光）
  function arcLayer(w, h, cx, cy, r, a0, a1, ch) {
    let f = blank(w, h);
    for (let a = a0; a <= a1; a += 2) {
      const x = Math.round(cx + r * Math.cos(a * Math.PI / 180)), y = Math.round(cy + r * Math.sin(a * Math.PI / 180));
      f = paste(f, [ch], x, y);
    }
    return f;
  }
  // 劍（尖端朝上）6×13：淡綠劍身 v、綠劍緣 V、黃護手 y、木柄 t
  const SWORD_U = [
    '..kk..',
    '.kvvk.',
    '.kvVk.',
    '.kvVk.',
    '.kvVk.',
    '.kvVk.',
    '.kvVk.',
    '.kvVk.',
    'kyyyyk',
    '.kttk.',
    '.kttk.',
    '.kTTk.',
    '.kkkk.',
  ];
  const SWORD_L = rot270(SWORD_U), SWORD_R = rot90(SWORD_U), SWORD_D = rot180(SWORD_U);
  // 36×28 幀：標準體放在 (10,9)（水平置中，底部對齊）
  const bigK = o => kirby(Object.assign({ w: 36, h: 28, ox: 8, oy: 8 }, o));
  // 揮劍 3 幀：舉劍（劍在頭後方水平）→ 向前橫掃（白色劍光）→ 收劍向下
  S('kirby_attack_sword', [
    bigK({ arms: [[8, -3, 5], [0, 8, 5]], front: [[SWORD_L, -1, -5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]] }),
    bigK({ arms: [[16, 6, 5], [0, 8, 5]], front: [[SWORD_R, 15, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
      back: [[paste(arcLayer(36, 28, 24, 16, 12, -95, -8, 'w'), arcLayer(36, 28, 24, 16, 11, -95, -8, 'e'), 0, 0), -8, -8]] }),
    bigK({ arms: [[16, 8, 5], [0, 8, 5]], front: [[SWORD_D, 19, 7]], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]] }),
  ], { fps: 10 });

  // 鐵鎚（頭朝上）10×16：木色 t/T、鐵灰 s/S
  const HAMMER_U = [
    '.kkkkkkkk.',
    'kssttttssk',
    'kssttttssk',
    'ksstttTssk',
    'kSSTTTTSSk',
    '.kkkkkkkk.',
    '....ktk...',
    '....ktk...',
    '....ktk...',
    '....ktk...',
    '....ktk...',
    '....ktk...',
    '....kTk...',
    '....kTk...',
    '....kTk...',
    '....kkk...',
  ];
  const HAMMER_L = rot270(HAMMER_U), HAMMER_R = rot90(HAMMER_U), HAMMER_D = rot180(HAMMER_U);
  // 掄鎚 3 幀：鎚子拉到身後上方 → 舉過頭頂向前 → 砸向前方地面
  S('kirby_attack_hammer', [
    bigK({ arms: [[7, -3, 5], [0, 8, 5]], back: [[HAMMER_L, -8, -8]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]] }),
    bigK({ arms: [[8, -3, 5], [0, 8, 5]], back: [[HAMMER_R, 8, -8]], mouth: MOUTH_OPEN, mouthAt: [9, 11] }),
    bigK({ arms: [[16, 4, 5], [0, 8, 5]], front: [[HAMMER_D, 16, 4]], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]], eyes: EYE_SQUINT }),
  ], { fps: 7 });

  // 噴火 2 幀（22×20）：張大嘴、眼睛瞇起
  const breathK = o => kirby(Object.assign({ w: 22, h: 20, ox: 1, cheekAt: [[4, 10]], feet: [[0, 15], [12, 15]], arms: [[0, 8, 5], [15, 8, 5]] }, o));
  S('kirby_attack_fire', [
    breathK({ eyes: EYE_HALF, eyeAt: [[7, 5], [11, 5]], mouth: mouthBig(6, 5), mouthAt: [12, 9] }),
    breathK({ eyes: EYE_HALF, eyeAt: [[7, 4], [11, 4]], mouth: mouthBig(7, 6), mouthAt: [12, 8] }),
  ], { fps: 10 });
  // 噴冰 2 幀：嘴噘成小圓、臉頰鼓起
  S('kirby_attack_ice', [
    breathK({ eyeAt: [[7, 4], [12, 4]], cheeks: CHEEK_BIG, cheekAt: [[3, 10], [14, 10]], mouth: MOUTH_O, mouthAt: [13, 10] }),
    breathK({ eyeAt: [[7, 4], [12, 4]], cheeks: CHEEK_BIG, cheekAt: [[3, 10], [14, 10]], mouth: mouthBig(5, 4), mouthAt: [13, 10] }),
  ], { fps: 12 });
  // 光束 2 幀（24×20）：手舉起 → 手向前伸直
  const wideK = o => kirby(Object.assign({ w: 24, h: 20, ox: 2 }, o));
  S('kirby_attack_beam', [
    wideK({ arms: [[14, 3, 5], [16, 1, 4], [0, 8, 5]] }),
    wideK({ arms: [[15, 8, 5], [17, 8, 5], [0, 8, 5]], mouth: MOUTH_LINE, mouthAt: [10, 12] }),
  ], { fps: 10 });
  // 刀刃 2 幀：手往後舉 → 甩手向前
  S('kirby_attack_cutter', [
    wideK({ arms: [[15, 2, 5], [0, 8, 5]] }),
    wideK({ arms: [[15, 9, 5], [18, 10, 4], [0, 8, 5]], eyeAt: [[8, 6], [13, 6]], mouthAt: [10, 13], cheekAt: [[5, 11], [14, 11]] }),
  ], { fps: 10 });
  // 電擊 2 幀：雙手張開（平舉 → 斜舉），用力表情
  S('kirby_attack_spark', [
    wideK({ arms: [[16, 8, 5], [-1, 8, 5]], mouth: MOUTH_O, mouthAt: [9, 12] }),
    wideK({ arms: [[15, 3, 5], [0, 3, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [9, 12] }),
  ], { fps: 12 });

  // ============================================================
  //  進階招式姿勢（abilities.js 以 def.anim 切換）
  // ============================================================
  // 短劍 / 短鎚（旋轉招式用，避免幀太大）
  const SWORD_S_U = SWORD_U.slice(0, 2).concat(SWORD_U.slice(5));      // 6×10
  const SWORD_S_R = rot90(SWORD_S_U), SWORD_S_L = rot270(SWORD_S_U), SWORD_S_D = rot180(SWORD_S_U);
  const HAMMER_S_U = HAMMER_U.slice(0, 6).concat(HAMMER_U.slice(12));  // 10×10
  const HAMMER_S_R = rot90(HAMMER_S_U), HAMMER_S_L = rot270(HAMMER_S_U), HAMMER_S_D = rot180(HAMMER_S_U);

  // ---- 劍：空中迴旋斬（4 幀，劍繞身一圈；40×28，身體置中偏下）----
  const spinK = o => kirby(Object.assign({
    w: 40, h: 28, ox: 10, oy: 8, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
    mouth: MOUTH_LINE, mouthAt: [9, 13], cheekAt: [[4, 10], [15, 10]],
    arms: [[15, 6, 5], [0, 6, 5]], feet: [[2, 15], [10, 15]],
  }, o));
  S('kirby_attack_sword_spin', [
    spinK({ front: [[SWORD_S_R, 19, 5]], back: [[arcLayer(40, 28, 20, 20, 15, -60, 20, 'e'), -10, -8]] }),
    spinK({ front: [[SWORD_S_D, 20, 9]], back: [[arcLayer(40, 28, 20, 20, 15, 20, 100, 'e'), -10, -8]] }),
    spinK({ front: [[SWORD_S_L, -9, 5]], back: [[arcLayer(40, 28, 20, 20, 15, 160, 240, 'e'), -10, -8]] }),
    spinK({ front: [[SWORD_S_U, 12, -8]], back: [[arcLayer(40, 28, 20, 20, 15, 240, 300, 'e'), -10, -8]] }),
  ], { fps: 14 });

  // ---- 劍：上挑斬（2 幀，抬頭、劍由下往上挑；24×26）----
  const upK = o => kirby(Object.assign({
    w: 24, h: 26, ox: 2, oy: 6, eyeAt: [[7, 4], [12, 4]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
    cheekAt: [[4, 10], [15, 10]], arms: [[16, 5, 5], [0, 8, 5]], feet: [[1, 15], [11, 15]],
  }, o));
  S('kirby_attack_sword_up', [
    upK({ front: [[SWORD_S_R, 15, 10]] }),
    upK({ front: [[SWORD_U, 13, -6]], arms: [[16, 0, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]],
      back: [[arcLayer(24, 26, 17, 16, 11, -150, -20, 'w'), -2, -6]] }),
  ], { fps: 10, loop: false });

  // ---- 鐵鎚：大迴旋（4 幀，鎚子繞身；44×32）----
  const hspinK = o => kirby(Object.assign({
    w: 44, h: 32, ox: 12, oy: 12, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
    mouth: MOUTH_OPEN, mouthAt: [9, 11], cheekAt: [[4, 10], [15, 10]],
    arms: [[15, 6, 5], [0, 6, 5]], feet: [[2, 15], [10, 15]],
  }, o));
  S('kirby_attack_hammer_spin', [
    hspinK({ front: [[HAMMER_S_R, 19, 5]] }),
    hspinK({ front: [[HAMMER_S_D, 21, 10]] }),
    hspinK({ front: [[HAMMER_S_L, -10, 5]] }),
    hspinK({ front: [[HAMMER_S_U, 5, -10]] }),
  ], { fps: 12 });

  // ---- 鐵鎚：空中落地震（2 幀，鎚頭朝下俯衝）----
  const dropK = o => kirby(Object.assign({
    w: 34, h: 22, ox: 7, oy: 2, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
    cheekAt: [[4, 10], [15, 10]], arms: [[15, 9, 5], [0, 9, 5]], feet: [[1, 15], [11, 15]],
  }, o));
  S('kirby_attack_hammer_drop', [
    dropK({ front: [[HAMMER_D, 17, 3]] }),
    dropK({ dy: -1, front: [[HAMMER_D, 18, 5]], back: [[arcLayer(34, 22, 27, 14, 9, 200, 340, 'w'), -7, -2]] }),
  ], { fps: 8 });

  // ---- 火焰：火焰衝刺（2 幀，卡比裹在火球裡）----
  const fireAura = k => blob(24, 22, [ell(0, 1, 24, 20), circ(0, 3 + k, 8), circ(2, 10 - k, 7)], { fill: 'f', edge: 'F', hi: 'y', lo: 'F', shade: false });
  const dashK = o => kirby(Object.assign({
    w: 24, h: 22, ox: 2, oy: 2, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_OPEN, mouthAt: [9, 11],
    cheeks: null, arms: [[15, 7, 5], [0, 7, 5]], feet: [[2, 15], [10, 15]],
  }, o));
  S('kirby_attack_fire_dash', [
    dashK({ back: [[fireAura(0), -2, -2]] }),
    dashK({ dy: -1, back: [[fireAura(3), -2, -2]] }),
  ], { fps: 12 });

  // ---- 火焰：空中火焰旋轉（4 幀，火環繞身）----
  const fireRing = a => {
    let f = blank(26, 26);
    for (let i = 0; i < 6; i++) {
      const t = a + i * 60, x = Math.round(13 + Math.cos(t * Math.PI / 180) * 11) - 1, y = Math.round(13 + Math.sin(t * Math.PI / 180) * 11) - 1;
      f = paste(f, ['kfk', 'fyf', 'kfk'], x, y);
    }
    return f;
  };
  const fspinK = o => kirby(Object.assign({
    w: 26, h: 26, ox: 3, oy: 6, body: [2, 1, 16], arms: [], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
    mouth: MOUTH_OPEN, mouthAt: [9, 11], cheekAt: [[4, 10], [15, 10]], feet: [[2, 15], [10, 15]],
  }, o));
  S('kirby_attack_fire_spin', [
    fspinK({ back: [[fireRing(0), -3, -6]] }),
    fspinK({ back: [[fireRing(30), -3, -6]] }),
    fspinK({ back: [[fireRing(60), -3, -6]] }),
    fspinK({ back: [[fireRing(90), -3, -6]] }),
  ], { fps: 14 });

  // ---- 冰凍：冰塊踢（2 幀，蹲身踢腿）----
  const kickK = o => kirby(Object.assign({
    w: 26, h: 20, ox: 2, oy: 1, body: [2, 2, 15], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]],
    mouth: MOUTH_OPEN, mouthAt: [9, 11], cheekAt: [[4, 10], [15, 10]], arms: [[0, 6, 5], [14, 3, 5]],
    feet: [[0, 15]], foot: FOOT,
  }, o));
  S('kirby_attack_ice_kick', [
    kickK({ front: [[FOOT_SIDE, 16, 11]] }),
    kickK({ front: [[FOOT_SIDE, 20, 8]], back: [[arcLayer(26, 20, 14, 16, 9, -60, 20, 'i'), -2, -1]] }),
  ], { fps: 10, loop: false });

  // ---- 冰凍：空中冰晶散射（2 幀，冰晶向外飛）----
  const CRYSTAL = ['.k.', 'kik', 'kIk', '.k.'];
  const iceBurst = r => {
    let f = blank(28, 26);
    for (let i = 0; i < 5; i++) {
      const a = -150 + i * 60;
      f = paste(f, CRYSTAL, Math.round(13 + Math.cos(a * Math.PI / 180) * r), Math.round(12 + Math.sin(a * Math.PI / 180) * r));
    }
    return f;
  };
  const iburstK = o => kirby(Object.assign({
    w: 28, h: 26, ox: 4, oy: 6, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: mouthBig(5, 4), mouthAt: [9, 11],
    cheeks: CHEEK_BIG, cheekAt: [[3, 10], [15, 10]], arms: [[16, 4, 5], [-1, 4, 5]], feet: [[1, 15], [11, 15]],
  }, o));
  S('kirby_attack_ice_burst', [
    iburstK({ front: [[iceBurst(7), -4, -6]] }),
    iburstK({ front: [[iceBurst(11), -4, -6]] }),
  ], { fps: 10 });

  // ---- 光束：蓄力（2 幀，雙手合抱光球）----
  const lightBall = d => blob(d, d, [circ(0, 0, d)], { fill: 'y', edge: 'Y', hi: 'w', lo: 'Y', shade: false });
  const chargeK = o => kirby(Object.assign({
    w: 26, h: 22, ox: 3, oy: 2, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_LINE, mouthAt: [9, 12],
    arms: [[15, 8, 5], [17, 6, 5], [0, 8, 5]], feet: [[1, 15], [11, 15]],
  }, o));
  S('kirby_attack_beam_charge', [
    chargeK({ front: [[lightBall(7), 16, 6]] }),
    chargeK({ dy: -1, front: [[lightBall(9), 15, 5]], back: [[arcLayer(26, 22, 22, 12, 8, -170, 170, 'w'), -3, -2]] }),
  ], { fps: 8 });

  // ---- 光束：捕捉光束（2 幀，單手前伸放出光環）----
  const RING0 = ['.kk.', 'kaak', 'kaak', '.kk.'];
  const RING1 = ['.kkk.', 'kaaak', 'ka.ak', 'kaaak', '.kkk.'];
  S('kirby_attack_beam_capture', [
    wideK({ arms: [[15, 8, 5], [18, 8, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], front: [[RING0, 20, 8]] }),
    wideK({ arms: [[15, 8, 5], [19, 8, 4], [0, 8, 5]], mouth: MOUTH_O, mouthAt: [9, 12], front: [[RING1, 20, 7]] }),
  ], { fps: 10 });

  // ---- 刀刃：上拋刃（2 幀，手往上甩）----
  S('kirby_attack_cutter_up', [
    upK({ arms: [[16, 6, 5], [0, 8, 5]], mouth: MOUTH_LINE, mouthAt: [9, 12] }),
    upK({ arms: [[15, 0, 5], [17, -2, 4], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]],
      back: [[arcLayer(24, 26, 16, 16, 12, -160, -30, 'w'), -2, -6]] }),
  ], { fps: 10, loop: false });

  // ---- 刀刃：下劈（2 幀，手高舉後往下劈）----
  const BLADE_V = ['.kk.', 'kwwk', 'kwek', 'kwek', 'kwek', '.kk.'];
  S('kirby_attack_cutter_chop', [
    wideK({ arms: [[15, 1, 5], [0, 8, 5]], eyes: EYE_SQUINT, eyeAt: [[7, 5], [12, 5]], front: [[BLADE_V, 17, -1]] }),
    wideK({ arms: [[16, 10, 5], [0, 8, 5]], mouth: MOUTH_OPEN, mouthAt: [9, 11], front: [[BLADE_V, 19, 12]],
      back: [[arcLayer(24, 20, 18, 8, 11, -60, 70, 'w'), -2, 0]] }),
  ], { fps: 10, loop: false });

  // ---- 電擊：電擊波（2 幀，雙手張開放出大電場）----
  const BOLT = ['..k.', '.kyk', 'kyk.', '.yk.', 'ky..'];
  const boltRing = r => {
    let f = blank(32, 28);
    for (let i = 0; i < 6; i++) {
      const a = -170 + i * 58;
      f = paste(f, BOLT, Math.round(15 + Math.cos(a * Math.PI / 180) * r), Math.round(13 + Math.sin(a * Math.PI / 180) * r));
    }
    return f;
  };
  const burstK = o => kirby(Object.assign({
    w: 32, h: 28, ox: 6, oy: 8, eyes: EYE_SQUINT, eyeAt: [[7, 6], [12, 6]], mouth: MOUTH_O, mouthAt: [9, 12],
    arms: [[16, 4, 5], [-1, 4, 5]], feet: [[1, 15], [11, 15]],
  }, o));
  S('kirby_attack_spark_burst', [
    burstK({ front: [[boltRing(8), -6, -8]] }),
    burstK({ front: [[boltRing(12), -6, -8]], arms: [[16, 8, 5], [-1, 8, 5]] }),
  ], { fps: 12 });

  // ============================================================
  //  帽子（anchor bottom，最底列＝帽緣，程式畫在頭頂）
  // ============================================================
  // 火焰王冠 2 幀（20×12）：紅色頭帶 + 跳動的橘黃火焰
  S('hat_fire', [[
    '.........k..........',
    '........kyk.........',
    '....k...kyk....k....',
    '...kyk.kyfyk..kyk...',
    '...kyfkkfffkkkfyk...',
    '..kyffkfffffkfffyk..',
    '..kffffFfffffFffffk.',
    '.kfffFFFfffffFFffffk',
    '.kFFFFFFFFFFFFFFFFFk',
    '.kRrrrrrrrrrrrrrrrRk',
    '.krrrrrrrrrrrrrrrrrk',
    '.kkkkkkkkkkkkkkkkkk.',
  ], [
    '....................',
    '...k.....k......k...',
    '..kyk...kyk....kyk..',
    '..kyk..kyfyk..kyfk..',
    '..kyfkkkfffkkkfffk..',
    '..kffffkfffffkfffyk.',
    '.kfffFFffFfffffffffk',
    '.kffFFFFFFFFFFFFfffk',
    '.kFFFFFFFFFFFFFFFFFk',
    '.kRrrrrrrrrrrrrrrrRk',
    '.krrrrrrrrrrrrrrrrrk',
    '.kkkkkkkkkkkkkkkkkk.',
  ]], { fps: 6 });
  // 劍士尖帽（20×12）：綠色尖帽往後垂、淡黃帽緣
  S('hat_sword', [[
    '..kk................',
    '.knnk...............',
    '.knnnk..............',
    '..knnnkk............',
    '...knnnnkkkkkk......',
    '....kknnnnnnnnkkk...',
    '.....kknnnnnnnnnnkk.',
    '...kkkknnnnnnnnnnnnk',
    '..kNnnnnnnnnnnnnnnnk',
    '.kNNnnnnnnnnnnnnnnNk',
    '.kaaaaaaaaaaaaaaaaak',
    '.kkkkkkkkkkkkkkkkkk.',
  ]]);
  // 光束小丑帽（22×12）：黃紅雙角、白色絨球
  S('hat_beam', [[
    'kk..................kk',
    'kwwk..............kwwk',
    'kwwkk............kkwwk',
    '.kkryk..........kyrkk.',
    '..kryyk........kyyrk..',
    '...kryykkkkkkkkyyrk...',
    '....krryyyyyyyyrrk....',
    '....kryyyyrryyyyrk....',
    '...kyyyyrryyrryyyyk...',
    '..kyyyrryyyyyyrryyyk..',
    '.kkrrrrrrrrrrrrrrrrkk.',
    '.kkkkkkkkkkkkkkkkkkkk.',
  ]]);
  // 刀刃帽（20×12）：黃色頭盔 + 頂上向前彎的鋼刃、綠色帽緣
  S('hat_cutter', [[
    '.........kkkkkkk....',
    '.......kkssssssssk..',
    '......kswwwwwwsssk..',
    '.....kswwssssssSk...',
    '....kssSkkkkkkkk....',
    '...kkkyyyyyykk......',
    '..kyyyyyyyyyyyyk....',
    '.kyayyyyyyyyyyyyk...',
    '.kyayyyyyyyyyyyyyk..',
    '.kYyyyyyyyyyyyyyYk..',
    '.kNnnnnnnnnnnnnnNk..',
    '.kkkkkkkkkkkkkkkkk..',
  ]]);
  // 電擊冠冕 2 幀（20×8）：黃色鋸齒王冠 + 閃爍白色電光
  S('hat_spark', [[
    '..kk....kk....kk....',
    '..kyk..kyyk..kyk....',
    '.kkyykkkyyykkkyykk..',
    '.kyyyykyywyykyyyyk..',
    '.kywyyyyyyyyyyyyyk..',
    '.kYyyyyyyyyyywyyYk..',
    '.kYYyyyyyyyyyyyYYk..',
    '.kkkkkkkkkkkkkkkkk..',
  ], [
    '..kk....kk....kk....',
    '..kyk..kwyk..kyk....',
    '.kkyykkkyyykkkywkk..',
    '.kyyyykyyyyykyyyyk..',
    '.kyyyyyyyywyyyyyyk..',
    '.kYyyywyyyyyyyyyYk..',
    '.kYYyyyyyyyyyyyYYk..',
    '.kkkkkkkkkkkkkkkkk..',
  ]], { fps: 8 });
  // 冰晶王冠（20×11）：淺藍冰晶 + 白色高光
  S('hat_ice', [[
    '....k.....k.........',
    '...kwk...kwk....k...',
    '...kiik..kiik..kwk..',
    '..kwiik.kiiiik.kiik.',
    '..kiiIkkkwiiIkkiiIk.',
    '.kiiiIiikiiiIikiiIIk',
    '.kwiiIIiiiiIIiiiIIIk',
    '.kiiiIIIiiIIIIiIIIIk',
    '.kiiiiiiiiiiiiiiiiik',
    '.kIIIIIIIIIIIIIIIIIk',
    '.kkkkkkkkkkkkkkkkkk.',
  ]]);
  // 鐵鎚頭巾（22×8）：藍色頭帶、白色圓點、後方打結垂帶
  S('hat_hammer', [[
    '.kk...................',
    'kuuk..................',
    'kuuuk.kkkkkkkkkkkkkkk.',
    '.kuuukuuuwuuuuwuuuuuk.',
    '.kkuuukuuuuuuuuuuuuuk.',
    'kuuukkkuwuuuuwuuuuwuk.',
    'kuuk..kUUUUUUUUUUUUUk.',
    '.kk...kkkkkkkkkkkkkkk.',
  ]]);
})();
