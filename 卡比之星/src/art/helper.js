// 夥伴像素圖（Round 6 系統深度）—— 小一號的卡比，淡藍身體 + 黃腳，16×16
// 作法與 art/kirby.js 相同：橢圓聯集 → 1px 輪廓 → 高光 / 陰影，再貼上眼、嘴、腮紅、腳。
// 註冊：helper_idle(2) / helper_walk(4) / helper_jump(1) / helper_attack(2) / helper_hurt(1)
//       另外 ui_helper_face(8×8)：HUD 用的小夥伴臉。
// 帽子沿用各能力的 hat_<key>（20~22px，繪製端以 scale 0.78 縮小，見 src/helper.js 的 draw）。
(function () {
  'use strict';

  // 淡藍主體 + 黃色腳（與卡比的粉紅 / 紅腳明確區分）
  const PAL = {
    p: '#a8d8f8', P: '#5c9cd8', l: '#e0f4ff',      // 身體 / 陰影 / 高光
    k: '#1c2c48', w: '#ffffff', b: '#5060c0',      // 輪廓 / 眼白 / 眼睛藍
    c: '#ffd8a0', m: '#2a4870',                    // 腮紅 / 嘴內
    y: '#f8d040', Y: '#c08810',                    // 腳（黃）
    e: '#f0f8ff',
  };

  // ---------- 基本工具（與 art/kirby.js 同一套作法，本檔自帶一份，不跨檔相依） ----------
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
          if (d > 0.68 && a > 12 && a < 120) c = cols.lo;
          else if (d > 0.55 && d < 0.82 && a < -110 && a > -155) c = cols.hi;
        }
        r += c;
      }
      rows.push(r);
    }
    return rows;
  }

  // ---------- 零件（面向右） ----------
  const EYE = ['.k', 'kk', 'kk', 'bb'];       // 2×4 標準眼
  const EYE_SHUT = ['kk'];                    // 閉眼
  const EYE_X = ['k.k', '.k.', 'k.k'];        // 受傷
  const EYE_SQ = ['kk', 'kk', 'b.'];          // 瞇眼（攻擊）
  const MOUTH = ['k..k', '.kk.'];             // 微笑
  const MOUTH_O = ['.kk.', 'kmmk', '.kk.'];   // 張嘴（攻擊 / 受傷）
  const CHEEK = ['cc'];
  const FOOT = ['.kkk.', 'kyyyk', 'kYYYk', '.kkk.'];   // 5×4 黃腳

  // ---------- 組合器（16×16，身體 13px 圓） ----------
  function helper(o) {
    o = Object.assign({
      w: 16, h: 16, ox: 0, oy: 0, dy: 0,
      body: [1, 1, 13], arms: [[12, 6, 4], [0, 6, 4]],
      eyes: EYE, eyeAt: [[5, 4], [9, 4]],
      mouth: MOUTH, mouthAt: [6, 9],
      cheeks: CHEEK, cheekAt: [[3, 8], [11, 8]],
      feet: [[0, 12], [7, 12]], feetBack: [], foot: FOOT,
      back: [], front: [],
    }, o);
    const X = o.ox, Y = o.oy + o.dy;
    let f = blank(o.w, o.h);
    for (const [pt, x, y] of o.back) f = paste(f, pt, x + X, y + Y);
    for (const [x, y, pt] of o.feetBack) f = paste(f, pt || o.foot, x + o.ox, y + o.oy);
    const shapes = [circ(o.body[0] + X, o.body[1] + Y, o.body[2])];
    for (const [x, y, d] of o.arms) shapes.push(circ(x + X, y + Y, d));
    f = paste(f, blob(o.w, o.h, shapes), 0, 0);
    if (o.cheeks) for (const [x, y] of o.cheekAt) f = paste(f, o.cheeks, x + X, y + Y);
    if (o.eyes) {
      const es = Array.isArray(o.eyes[0]) ? o.eyes : [o.eyes, o.eyes];
      o.eyeAt.forEach(([x, y], i) => { f = paste(f, es[i], x + X, y + Y); });
    }
    if (o.mouth) f = paste(f, o.mouth, o.mouthAt[0] + X, o.mouthAt[1] + Y);
    for (const [x, y, pt] of o.feet) f = paste(f, pt || o.foot, x + o.ox, y + o.oy);
    for (const [pt, x, y] of o.front) f = paste(f, pt, x + X, y + Y);
    return f;
  }
  const S = (name, frames, opts) => KB.sprite(name, PAL, frames, opts);

  // 站立 2 幀（幀 1 眨眼）
  S('helper_idle', [
    helper({}),
    helper({ eyes: EYE_SHUT, eyeAt: [[5, 7], [9, 7]] }),
  ], { fps: 2 });

  // 走路 4 幀：腳前後交替、身體 1px 起伏
  S('helper_walk', [
    helper({ feet: [[8, 12]], feetBack: [[0, 11]] }),
    helper({ dy: -1, feet: [[1, 12], [7, 12]] }),
    helper({ feet: [[0, 12]], feetBack: [[8, 11]] }),
    helper({ dy: -1, feet: [[1, 12], [7, 12]] }),
  ], { fps: 8 });

  // 跳躍 / 漂浮：雙手舉起、腳併攏
  S('helper_jump', [helper({ arms: [[12, 2, 4], [0, 2, 4]], feet: [[1, 12], [7, 12]], mouth: MOUTH_O, mouthAt: [6, 9] })]);

  // 攻擊 2 幀：身體前傾、雙手往前、張嘴（幀 1 再前傾 1px）
  const atkBase = { eyes: EYE_SQ, eyeAt: [[6, 5], [10, 5]], mouth: MOUTH_O, mouthAt: [7, 9], cheekAt: [[4, 9], [12, 9]] };
  S('helper_attack', [
    helper(Object.assign({}, atkBase, { arms: [[11, 4, 5], [1, 8, 4]], feet: [[0, 12], [8, 12]] })),
    helper(Object.assign({}, atkBase, { dy: -1, arms: [[11, 6, 5], [2, 9, 4]], feet: [[1, 12], [8, 12]] })),
  ], { fps: 12 });

  // 受傷：X 眼、張嘴、手往下
  S('helper_hurt', [helper({
    eyes: EYE_X, eyeAt: [[4, 5], [9, 5]], mouth: MOUTH_O, mouthAt: [6, 9],
    arms: [[12, 9, 4], [0, 9, 4]], feet: [[0, 12], [8, 12]],
  })]);

  // ---------- 指令圖示（Round 7 helper2：8×8，錨點 center，畫在夥伴頭上與 HUD） ----------
  // 跟隨＝綠色前進三角、待命＝藍色盾牌、突擊＝紅柄小劍；都有 1px 深色描邊，1× 畫面也看得出來。
  const MPAL = {
    k: '#101828',                      // 描邊
    G: '#70e070', g: '#38a038',        // 跟隨（綠）
    B: '#60c0ff', b: '#2878c0',        // 待命（藍）
    R: '#ff6050', r: '#a02820',        // 突擊（紅）
    w: '#ffffff', l: '#d0d8e8',        // 劍刃
  };
  KB.sprite('ui_helper_mode_follow', MPAL, [[
    '.kk.....',
    '.kGk....',
    '.kGGk...',
    '.kGGGk..',
    '.kGGgk..',
    '.kGgk...',
    '.kgk....',
    '.kk.....',
  ]], { anchor: 'center' });
  KB.sprite('ui_helper_mode_stay', MPAL, [[
    '.kkkkkk.',
    '.kBBBBk.',
    '.kBBBBk.',
    '.kBBbbk.',
    '.kBbbbk.',
    '..kbbk..',
    '...kk...',
    '........',
  ]], { anchor: 'center' });
  KB.sprite('ui_helper_mode_assault', MPAL, [[
    '....k...',
    '...kwk..',
    '...kwk..',
    '...kwk..',
    '..kRRRk.',
    '...klk..',
    '...krk..',
    '....k...',
  ]], { anchor: 'center' });

  // ---------- HUD 小臉（8×8，錨點 center） ----------
  KB.sprite('ui_helper_face', PAL, [(function () {
    let f = blob(8, 8, [circ(0, 0, 8)]);
    f = paste(f, ['k'], 2, 3); f = paste(f, ['k'], 5, 3);
    f = paste(f, ['b'], 2, 4); f = paste(f, ['b'], 5, 4);
    f = paste(f, ['kk'], 3, 6);
    f = paste(f, ['c'], 1, 5); f = paste(f, ['c'], 6, 5);
    return f;
  })()], { anchor: 'center' });
})();
