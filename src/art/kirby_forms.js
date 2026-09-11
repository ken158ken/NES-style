// 變身系像素圖（Round 5 變身大爆發）—— giant / dragon / mech / ghost
// 規則：卡比 anchor = bottom、面向右；敵人 anchor = bottom；投射物 anchor = bottom；UI 圖示 anchor = bottom。
// 作法：以程序式網格（disc / ell / lineC / outline）畫出主體，再用 stamp() 貼上手排的臉部零件，
//       40px 以下的圖手排容易對不齊，這樣比較好維護（沿用 art/enemies.js 的 Rollarmor 作法）。
(function () {
  'use strict';

  // ---------- 調色盤 ----------
  const PF = Object.assign({}, KB.PAL.kirby, {
    // 金屬（機甲）
    g: '#9aa4b4', G: '#5c6676', L: '#dce4f0', d: '#333b48', D: '#1a1f28',
    // 金 / 能量
    y: '#ffe040', Y: '#c09000', i: '#78e8ff', I: '#1888c8',
    // 火 / 龍
    f: '#ff9028', F: '#e83818', t: '#d04848', T: '#8a2424', n: '#ffdca8', N: '#c89860',
    // 幽靈
    e: '#f4f6ff', E: '#c4ccec', q: '#7d86b4',
    // 植物（敵人 Bigbloom）
    v: '#58c848', V: '#2a7828', j: '#ff7ab0', J: '#c8447c', a: '#fff0a0',
    // 其他
    u: '#4878f8', U: '#2040a8', s: '#a8a8b0', S: '#585860', x: '#202028', o: '#ffffff',
  });
  const S = (name, frames, opts) => KB.sprite(name, PF, frames, opts || {});

  // ---------- 網格工具 ----------
  const G = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
  const RS = g => g.map(r => r.join(''));
  const inb = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;
  const px = (g, x, y, c) => { if (inb(g, x, y)) g[y][x] = c; };
  const only = (g, x, y, c) => { if (inb(g, x, y) && g[y][x] !== '.') g[y][x] = c; };   // 只覆蓋已有像素
  const box = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
  const ell = (g, cx, cy, rx, ry, c) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx + 0.4) + (y * y) / (ry * ry + 0.4) <= 1) px(g, cx + x, cy + y, c);
  };
  const disc = (g, cx, cy, r, c) => ell(g, cx, cy, r, r, c);
  const lineC = (g, x0, y0, x1, y1, c, mask) => {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (; ;) {
      (mask ? only : px)(g, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  /** 三角形填色（用於翅膀 / 花瓣 / 尾鰭） */
  const tri = (g, a, b, c, col) => {
    const minY = Math.max(0, Math.min(a[1], b[1], c[1])), maxY = Math.min(g.length - 1, Math.max(a[1], b[1], c[1]));
    const minX = Math.max(0, Math.min(a[0], b[0], c[0])), maxX = Math.min(g[0].length - 1, Math.max(a[0], b[0], c[0]));
    const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(neg && pos)) px(g, x, y, col);
    }
  };
  /** 整張圖描 1px 輪廓（跳過 skip 裡的顏色，例如不想被描的高光） */
  const outline = (g, c) => {
    const h = g.length, w = g[0].length, src = g.map(r => r.slice());
    const tr = (x, y) => x < 0 || y < 0 || x >= w || y >= h || src[y][x] === '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] === '.' || src[y][x] === c) continue;
      if (tr(x - 1, y) || tr(x + 1, y) || tr(x, y - 1) || tr(x, y + 1)) g[y][x] = c;
    }
  };
  /** 貼上字串圖樣（'.' / ' ' 視為透明） */
  const stamp = (g, pat, x, y) => {
    pat.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && ch !== ' ') px(g, x + i, y + j, ch); } });
  };
  /** 左上亮 / 右下暗的球面打光：把 base 色依對角線位置換成 hi / lo */
  const shade = (g, cx, cy, base, hi, lo) => {
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== base) continue;
      const u = (x - cx) + (y - cy);
      if (u > 4) g[y][x] = lo; else if (u < -5) g[y][x] = hi;
    }
  };

  // ---------- 卡比零件 ----------
  const EYE = ['.k.', 'wkk', 'kkk', 'kkk', 'bbb', '.b.'];
  const EYE_SHUT = ['kkk'];
  const EYE_ANGRY = ['kk.', 'kkk', 'kkk', 'bbb'];             // 壓低眉毛的怒眼
  const MOUTH = ['k..k', '.kk.'];
  const MOUTH_FANG = ['kmmmk', 'kmwmk', '.kkk.'];             // 張嘴露牙
  const MOUTH_O = ['.kk.', 'kmmk', '.kk.'];
  const CHEEK = ['cc', 'cc'];
  const FOOT = ['.kkkk.', 'krrrrk', 'kRRRRk', '.kkkk.'];      // 6×4 紅腳

  /** 粉紅身體球（含打光與輪廓） */
  function ball(g, cx, cy, r) {
    disc(g, cx, cy, r, 'p');
    shade(g, cx - r * 0.35, cy - r * 0.35, 'p', 'l', 'P');
    outline(g, 'k');
  }

  // ======================================================================
  //  1) GIANT 巨大化 —— 本體沿用既有卡比精靈（player.js 以 form.scale=2 放大），
  //     只另外畫一頂「巨人角冠」：金角 + 暗紅頭帶，放大後仍清楚。
  // ======================================================================
  (function giantHat() {
    const g = G(20, 11);
    // 頭帶
    box(g, 1, 7, 18, 3, 'R');
    box(g, 1, 8, 18, 1, 'r');
    for (let i = 2; i < 18; i += 4) { px(g, i, 8, 'y'); px(g, i + 1, 8, 'Y'); }
    // 兩支金角（左小右大，面向右）
    tri(g, [3, 7], [1, 0], [6, 7], 'y');
    tri(g, [13, 7], [18, 0], [16, 7], 'y');
    shade(g, 6, 4, 'y', 'a', 'Y');
    // 中央寶石
    disc(g, 9, 5, 2, 'F');
    px(g, 9, 4, 'f');
    outline(g, 'k');
    S('hat_giant', [RS(g)]);
  })();

  // ======================================================================
  //  2) DRAGON 龍化 —— 28×24，粉紅身體 + 紅色蝠翼 + 金角 + 尖刺長尾
  // ======================================================================
  function dragonFrame(o) {
    o = o || {};
    const wing = o.wing === undefined ? 0 : o.wing;   // 0 收 / 1 上展 / 2 下拍
    const g = G(28, 24);
    const dy = o.dy || 0;
    // --- 蝠翼（畫在身體之前，位於背側 = 左方）：根部 → 翼尖 → 翼底的實心膜 + 骨架 ---
    const WG = { 0: { tip: [3, 3], bot: [4, 17] }, 1: { tip: [1, 0], bot: [2, 12] }, 2: { tip: [1, 11], bot: [5, 22] } }[wing];
    const root = [12, 10 + dy];
    tri(g, root, WG.tip, WG.bot, 't');
    // 翼膜分節：從根部拉三根骨架到翼緣
    for (let i = 0; i <= 3; i++) {
      const ex = Math.round(WG.tip[0] + (WG.bot[0] - WG.tip[0]) * i / 3);
      const ey = Math.round(WG.tip[1] + (WG.bot[1] - WG.tip[1]) * i / 3);
      lineC(g, root[0], root[1], ex, ey, 'T', true);
      px(g, ex, ey, 'T');
    }
    lineC(g, root[0], root[1], WG.tip[0], WG.tip[1], 'T');
    lineC(g, WG.tip[0], WG.tip[1], WG.bot[0], WG.bot[1], 'T');
    // --- 尾巴（背側下方，2px 粗 + 箭形尾鰭）---
    const ty = o.tailUp ? 15 : 19;
    for (const off of [0, 1]) { lineC(g, 10, 19 + off, 4, ty + off, 'P'); lineC(g, 4, ty + off, 1, ty - 4 + off, 'P'); }
    tri(g, [1, ty - 3], [0, ty - 9], [5, ty - 5], 'F');
    tri(g, [1, ty - 3], [5, ty - 5], [4, ty], 'F');
    // --- 身體 ---
    ball(g, 14, 13 + dy, 8);
    // 腹部鱗片
    for (let i = 0; i < 3; i++) { only(g, 13 + i * 2, 19 + dy, 'n'); only(g, 14 + i * 2, 20 + dy, 'n'); }
    // --- 背鰭（3 片紅刺）---
    tri(g, [9, 11 + dy], [6, 6 + dy], [11, 7 + dy], 'F');
    tri(g, [7, 15 + dy], [3, 12 + dy], [9, 11 + dy], 'F');
    // --- 角（金色，往後上，3px 底）---
    tri(g, [11, 8 + dy], [8, 0 + dy], [14, 5 + dy], 'y');
    tri(g, [16, 6 + dy], [14, -1 + dy], [19, 4 + dy], 'y');
    shade(g, 10, 3 + dy, 'y', 'a', 'Y');
    outline(g, 'k');
    // --- 臉 ---
    stamp(g, o.angry ? EYE_ANGRY : EYE, 16, 9 + dy);
    stamp(g, o.angry ? EYE_ANGRY : EYE, 20, 9 + dy);
    stamp(g, CHEEK, 13, 15 + dy);
    stamp(g, o.mouth || MOUTH, 18, 16 + dy);
    // --- 腳 ---
    const f = o.feet || [[10, 20], [17, 20]];
    for (const [fx, fy] of f) stamp(g, FOOT, fx, fy);
    // --- 額外（火焰口）---
    if (o.fire) {
      stamp(g, ['.ff.', 'fFFf', 'fFyFf', '.ff.'], 23, 15 + dy);
      px(g, 27, 17 + dy, 'f');
    }
    return RS(g);
  }
  S('kirby_dragon_idle', [dragonFrame({ wing: 0 }), dragonFrame({ wing: 0, dy: -1, tailUp: true })], { fps: 3 });
  S('kirby_dragon_walk', [
    dragonFrame({ wing: 0, feet: [[8, 20], [18, 20]] }),
    dragonFrame({ wing: 0, dy: -1, feet: [[11, 20], [16, 20]], tailUp: true }),
  ], { fps: 7 });
  S('kirby_dragon_fly', [dragonFrame({ wing: 1, dy: -1, tailUp: true }), dragonFrame({ wing: 2 })], { fps: 8 });
  S('kirby_dragon_attack', [
    dragonFrame({ wing: 2, angry: true, mouth: MOUTH_FANG, feet: [[10, 20], [17, 20]] }),
    dragonFrame({ wing: 1, angry: true, mouth: MOUTH_FANG, fire: true, dy: -1 }),
  ], { fps: 10 });

  // ======================================================================
  //  3) MECH 機甲 —— 26×24，鋼灰裝甲 + 面罩 + 肩甲 + 背部噴射背包
  // ======================================================================
  function mechFrame(o) {
    o = o || {};
    const g = G(26, 24);
    const dy = o.dy || 0;
    // --- 背包 + 噴射 ---
    box(g, 2, 9 + dy, 5, 9, 'G');
    box(g, 2, 9 + dy, 5, 2, 'g');
    px(g, 3, 11 + dy, 'y'); px(g, 5, 11 + dy, 'y');
    box(g, 2, 18 + dy, 5, 2, 'D');
    if (o.jet) { box(g, 2, 20 + dy, 2, 4, 'i'); box(g, 4, 20 + dy, 3, 3, 'i'); box(g, 3, 20 + dy, 2, 2, 'o'); }
    // --- 身體（鋼殼）---
    disc(g, 14, 13 + dy, 8, 'g');
    shade(g, 11, 10 + dy, 'g', 'L', 'G');
    // 胸甲 + 動力爐
    ell(g, 14, 16 + dy, 6, 4, 'L');
    disc(g, 14, 16 + dy, 3, 'I'); disc(g, 14, 16 + dy, 2, 'i'); px(g, 13, 15 + dy, 'o');
    // 面罩
    box(g, 9, 8 + dy, 12, 5, 'd');
    box(g, 10, 10 + dy, 10, 2, o.eye || 'i');
    if (o.eye !== 'y') { px(g, 11, 10 + dy, 'o'); }
    // 頭頂天線
    lineC(g, 12, 6 + dy, 12, 2 + dy, 'G'); px(g, 12, 1 + dy, 'r');
    // 肩甲
    ell(g, 8, 9 + dy, 3, 3, 'g'); ell(g, 20, 9 + dy, 3, 3, 'g');
    only(g, 8, 8 + dy, 'L'); only(g, 20, 8 + dy, 'L');
    // 手臂（前臂朝向右）：punch 時整隻拳頭往前伸出
    if (o.punch) { box(g, 20, 11 + dy, 6, 7, 'g'); box(g, 23, 11 + dy, 3, 7, 'L'); box(g, 24, 13 + dy, 2, 3, 'y'); }
    else { ell(g, 21, 14 + dy, 3, 4, 'g'); }
    outline(g, 'k');
    // --- 腳（鋼靴，8×5）---
    const f = o.feet || [[8, 19], [16, 19]];
    for (const [fx, fy] of f) stamp(g, ['.kkkkkk.', 'kLGGGGGk', 'kGGGGGGk', 'kDDDDDDk', '.kkkkkk.'], fx, fy);
    return RS(g);
  }
  S('kirby_mech_idle', [mechFrame({}), mechFrame({ dy: -1, eye: 'y' })], { fps: 3 });
  S('kirby_mech_walk', [
    mechFrame({ feet: [[6, 19], [17, 19]], jet: true }),
    mechFrame({ dy: -1, feet: [[9, 19], [15, 19]] }),
  ], { fps: 7 });
  S('kirby_mech_jump', [mechFrame({ jet: true, feet: [[9, 19], [15, 19]] })]);
  S('kirby_mech_attack', [
    mechFrame({ eye: 'y', feet: [[8, 19], [16, 19]] }),
    mechFrame({ eye: 'y', punch: true, dy: -1, jet: true }),
  ], { fps: 10 });

  // ======================================================================
  //  4) GHOST 幽靈 —— 24×22，半透明白色被單造型（繪製端 alpha 0.6）
  // ======================================================================
  function ghostFrame(o) {
    o = o || {};
    const g = G(24, 22);
    const dy = o.dy || 0, ph = o.phase || 0;           // 波浪相位
    // 被單主體：上半圓 + 往下擴張的裙襬
    disc(g, 12, 10 + dy, 8, 'e');
    for (let y = 10 + dy; y < 19 + dy; y++) {
      const half = 8 + Math.round((y - (10 + dy)) * 0.25);
      for (let x = 12 - half; x <= 12 + half; x++) px(g, x, y, 'e');
    }
    // 裙襬三個波浪
    for (let x = 2; x <= 22; x++) {
      const w = Math.round(2.2 * Math.sin((x + ph * 3) * 0.72));
      for (let y = 19 + dy; y <= 19 + dy + 2 + w; y++) px(g, x, y, 'e');
    }
    // 陰影（右下）
    shade(g, 9, 7 + dy, 'e', 'o', 'E');
    // 小手（兩側凸起）
    ell(g, 3, 12 + dy, 2, 3, 'e'); ell(g, 21, 12 + dy, 2, 3, 'e');
    outline(g, 'q');
    // 臉：黑色空洞眼 + 嘴
    const eye = o.wail ? ['qq', 'kk', 'kk'] : ['.k.', 'kkk', 'kkk'];
    stamp(g, eye, 10, 7 + dy);
    stamp(g, eye, 15, 7 + dy);
    if (o.wail) stamp(g, ['.kkk.', 'kkkkk', 'kkkkk', '.kkk.'], 11, 12 + dy);
    else stamp(g, ['.kk.', 'k..k'], 12, 13 + dy);
    return RS(g);
  }
  S('kirby_ghost_idle', [ghostFrame({ phase: 0 }), ghostFrame({ phase: 1, dy: -1 })], { fps: 4 });
  S('kirby_ghost_walk', [ghostFrame({ phase: 1 }), ghostFrame({ phase: 2, dy: -1 })], { fps: 6 });
  S('kirby_ghost_attack', [ghostFrame({ phase: 0, wail: true }), ghostFrame({ phase: 2, wail: true, dy: -2 })], { fps: 10 });

  // ======================================================================
  //  5) 投射物
  // ======================================================================
  // 火箭拳 14×12
  (function () {
    const g = G(14, 12);
    box(g, 4, 2, 9, 8, 'g'); shade(g, 6, 4, 'g', 'L', 'G');
    box(g, 4, 4, 2, 5, 'G');
    for (let i = 0; i < 3; i++) { px(g, 11, 3 + i * 3, 'D'); px(g, 12, 3 + i * 3, 'D'); }
    px(g, 6, 3, 'y'); px(g, 7, 3, 'Y');
    box(g, 0, 4, 4, 4, 'f'); box(g, 0, 5, 2, 2, 'F');
    outline(g, 'k');
    S('proj_rocketfist', [RS(g)]);
  })();
  // 飛彈 16×9
  (function () {
    const g = G(16, 9);
    ell(g, 10, 4, 5, 3, 'L'); box(g, 4, 2, 7, 5, 'g');
    tri(g, [13, 1], [16, 4], [13, 7], 'r');
    tri(g, [4, 2], [1, 0], [4, 4], 'G'); tri(g, [4, 5], [1, 8], [4, 7], 'G');
    px(g, 8, 3, 'y'); px(g, 9, 3, 'Y');
    box(g, 0, 3, 3, 3, 'f'); px(g, 0, 4, 'F');
    outline(g, 'k');
    S('proj_missile', [RS(g)]);
  })();
  // 龍炎彈 20×20（2 幀旋轉火球）
  (function () {
    const mk = ph => {
      const g = G(20, 20);
      disc(g, 10, 10, 8, 'F'); disc(g, 10, 10, 6, 'f'); disc(g, 10, 10, 3, 'y'); disc(g, 9, 9, 1, 'o');
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + ph;
        lineC(g, Math.round(10 + Math.cos(a) * 7), Math.round(10 + Math.sin(a) * 7),
          Math.round(10 + Math.cos(a) * 10), Math.round(10 + Math.sin(a) * 10), 'f');
      }
      outline(g, 'k');
      return RS(g);
    };
    S('proj_dragonball', [mk(0), mk(0.5)], { fps: 12 });
  })();
  // 龍息小火（敵人 Drako 也用）10×10
  (function () {
    const g = G(10, 10);
    ell(g, 5, 5, 4, 4, 'F'); ell(g, 5, 5, 3, 3, 'f'); disc(g, 4, 4, 1, 'y');
    outline(g, 'k');
    S('proj_drakofire', [RS(g)]);
  })();
  // Bolt 雷射彈 12×6
  (function () {
    const g = G(12, 6);
    box(g, 0, 2, 12, 2, 'i'); box(g, 2, 1, 8, 4, 'i'); box(g, 4, 2, 4, 2, 'o');
    outline(g, 'I');
    S('proj_boltbeam', [RS(g)]);
  })();

  // ======================================================================
  //  6) 敵人
  // ======================================================================
  // --- Bigbloom 巨大花（吞下 → giant）26×28 ---
  function bloomFrame(o) {
    o = o || {};
    const g = G(26, 28);
    const open = o.open ? 1 : 0, dy = o.dy || 0;
    // 莖
    box(g, 11, 15 + dy, 4, 9, 'V'); box(g, 12, 15 + dy, 2, 9, 'v');
    // 葉手
    tri(g, [11, 18 + dy], [2, 15 + dy], [10, 22 + dy], 'v');
    tri(g, [15, 18 + dy], [24, 15 + dy], [16, 22 + dy], 'v');
    lineC(g, 10, 19 + dy, 3, 17 + dy, 'V', true); lineC(g, 16, 19 + dy, 23, 17 + dy, 'V', true);
    // 花瓣（6 片，open 時張開）
    const R = open ? 11 : 9;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - Math.PI / 2 + (open ? 0.25 : 0);
      const cx = Math.round(13 + Math.cos(a) * (R - 4)), cy = Math.round(9 + dy + Math.sin(a) * (R - 4));
      ell(g, cx, cy, open ? 5 : 4, open ? 4 : 4, i & 1 ? 'j' : 'J');
    }
    // 花心
    disc(g, 13, 9 + dy, 6, 'a'); shade(g, 11, 7 + dy, 'a', 'o', 'Y');
    outline(g, 'k');
    // 臉
    stamp(g, ['.k.', 'kkk', 'bb.'], 10, 6 + dy);
    stamp(g, ['.k.', 'kkk', '.bb'], 15, 6 + dy);
    if (open) stamp(g, ['.kkkk.', 'kmmmmk', 'kmoomk', '.kkkk.'], 10, 10 + dy);
    else stamp(g, ['k..k', '.kk.'], 11, 11 + dy);
    // 根腳
    const f = o.feet || [[8, 24], [15, 24]];
    for (const [fx, fy] of f) stamp(g, ['.kkk.', 'kVVVk', '.kkk.'], fx, fy);
    return RS(g);
  }
  S('bigbloom_walk', [bloomFrame({}), bloomFrame({ dy: -1, feet: [[6, 24], [16, 24]] })], { fps: 4 });
  S('bigbloom_attack', [bloomFrame({ open: true }), bloomFrame({ open: true, dy: -2 })], { fps: 8 });

  // --- Drako 小龍（會飛 + 噴小火，吞下 → dragon）22×18 ---
  function drakoFrame(o) {
    o = o || {};
    const g = G(22, 18);
    const wy = o.wingUp ? 0 : 6, dy = o.dy || 0;
    const root = [11, 9 + dy];
    tri(g, root, [1, wy], [4, wy + 10], 't');
    lineC(g, root[0], root[1], 1, wy, 'T'); lineC(g, 1, wy, 4, wy + 10, 'T');
    lineC(g, root[0], root[1], 2, wy + 5, 'T', true);
    // 尾巴（2px 粗 + 三角尾鰭）
    for (const off of [0, 1]) lineC(g, 8, 13 + dy + off, 2, 15 + dy + off, 'V');
    tri(g, [3, 15 + dy], [0, 11 + dy], [4, 16 + dy], 'v');
    // 身體
    ell(g, 11, 10 + dy, 6, 5, 'v'); shade(g, 9, 8 + dy, 'v', 'a', 'V');
    // 頭
    disc(g, 15, 7 + dy, 4, 'v');
    box(g, 17, 7 + dy, 5, 3, 'v');     // 吻部
    // 角
    lineC(g, 14, 3 + dy, 12, 0 + dy, 'y');
    outline(g, 'k');
    stamp(g, ['kk', 'yy'], 15, 5 + dy);
    if (o.open) { stamp(g, ['kkk', 'mmk', 'kkk'], 19, 8 + dy); }
    // 腹鱗
    for (let i = 0; i < 3; i++) only(g, 9 + i * 2, 14 + dy, 'a');
    return RS(g);
  }
  S('drako_fly', [drakoFrame({ wingUp: true, dy: -1 }), drakoFrame({})], { fps: 8 });
  S('drako_attack', [drakoFrame({ open: true }), drakoFrame({ open: true, wingUp: true, dy: -1 })], { fps: 8 });

  // --- Bolt 機器兵（射雷射，吞下 → mech）18×20 ---
  function boltFrame(o) {
    o = o || {};
    const g = G(18, 20);
    const dy = o.dy || 0;
    // 腿
    const f = o.feet || [[3, 16], [10, 16]];
    for (const [fx, fy] of f) { box(g, fx, fy, 5, 4, 'G'); box(g, fx, fy + 2, 5, 2, 'D'); }
    // 軀幹
    box(g, 3, 9 + dy, 12, 8, 'g'); shade(g, 5, 10 + dy, 'g', 'L', 'G');
    box(g, 5, 11 + dy, 8, 4, 'd');
    px(g, 6, 12 + dy, o.fire ? 'r' : 'v'); px(g, 8, 12 + dy, 'y'); px(g, 10, 12 + dy, 'i');
    // 頭
    box(g, 4, 2 + dy, 10, 7, 'g'); shade(g, 6, 3 + dy, 'g', 'L', 'G');
    box(g, 5, 4 + dy, 8, 3, 'd');
    box(g, o.fire ? 8 : 9, 5 + dy, o.fire ? 5 : 3, 1, o.fire ? 'o' : 'r');
    lineC(g, 12, 2 + dy, 15, 0 + dy, 'G'); px(g, 16, 0 + dy, 'r');
    // 手臂 / 砲口
    if (o.fire) { box(g, 15, 10 + dy, 3, 4, 'd'); box(g, 17, 11 + dy, 1, 2, 'i'); }
    else box(g, 15, 10 + dy, 2, 5, 'G');
    outline(g, 'k');
    return RS(g);
  }
  S('bolt_walk', [boltFrame({}), boltFrame({ dy: -1, feet: [[2, 16], [11, 16]] })], { fps: 5 });
  S('bolt_attack', [boltFrame({ fire: true }), boltFrame({ fire: true, dy: -1 })], { fps: 8 });

  // --- Boo Dee 幽靈迪（會穿牆追，吞下 → ghost）18×18 ---
  function booFrame(o) {
    o = o || {};
    const g = G(18, 18);
    const dy = o.dy || 0, ph = o.phase || 0;
    disc(g, 9, 8 + dy, 7, 'e');
    for (let y = 8 + dy; y < 14 + dy; y++) for (let x = 2; x <= 16; x++) px(g, x, y, 'e');
    for (let x = 2; x <= 16; x++) {
      const w = Math.round(1.8 * Math.sin((x + ph * 3) * 0.8));
      for (let y = 14 + dy; y <= 15 + dy + w + 1; y++) px(g, x, y, 'e');
    }
    ell(g, 1, 9 + dy, 1, 2, 'e'); ell(g, 17, 9 + dy, 1, 2, 'e');
    shade(g, 7, 6 + dy, 'e', 'o', 'E');
    outline(g, 'q');
    // 迪迪風的臉（大眼 + 腮紅）
    stamp(g, o.angry ? ['kk.', 'kkk', 'kkk'] : ['.k.', 'kkk', 'kkk'], 5, 5 + dy);
    stamp(g, o.angry ? ['.kk', 'kkk', 'kkk'] : ['.k.', 'kkk', 'kkk'], 10, 5 + dy);
    stamp(g, ['EE'], 3, 10 + dy); stamp(g, ['EE'], 13, 10 + dy);
    if (o.angry) stamp(g, ['.kkk.', 'kmmmk', '.kkk.'], 6, 10 + dy);
    else stamp(g, ['k..k', '.kk.'], 7, 11 + dy);
    return RS(g);
  }
  S('boodee_float', [booFrame({ phase: 0 }), booFrame({ phase: 1, dy: -1 })], { fps: 5 });
  S('boodee_attack', [booFrame({ phase: 1, angry: true }), booFrame({ phase: 2, angry: true, dy: -1 })], { fps: 8 });

  // ======================================================================
  //  7) UI 能力圖示（24×16）與能力星小圖（8×8）
  //     格式與 art/items_ui.js 相同：左邊卡比頭 + 帽子，右邊 8×8 小圖示。
  // ======================================================================
  const MINI = {
    giant: [
      '..kkkk..',
      '.kppppk.',
      'kpkppkpk',
      'kppppppk',
      'kpkkkkpk',
      '.kppppk.',
      '.k.kk.k.',
      '..k..k..',
    ],
    dragon: [
      'k.....k.',
      'kt...tk.',
      'kttkttk.',
      'ktppptkk',
      '.kpwppnk',
      '.kpppkk.',
      '..kkkk..',
      '...kk...',
    ],
    mech: [
      '.kkkkkk.',
      'kLggggLk',
      'kdddddkk',
      'kdiiidk.',
      'kgggggk.',
      'kgiyigk.',
      'kkgggkk.',
      '.kk.kk..',
    ],
    ghost: [
      '..kkkk..',
      '.keeeek.',
      'keekeeek',
      'kekkkeek',
      'keeeeeek',
      'keeeeeek',
      'kekekeke',
      '.k.k.k..',
    ],
  };
  // 簡化版卡比頭（14×12），與 items_ui 的 KHEAD 視覺一致
  function head() {
    const g = G(14, 12);
    ball(g, 6, 6, 6);
    stamp(g, ['.k.', 'wkk', 'kkk', 'bbb'], 4, 3);
    stamp(g, ['.k.', 'wkk', 'kkk', 'bbb'], 8, 3);
    stamp(g, CHEEK, 2, 8); stamp(g, CHEEK, 10, 8);
    stamp(g, MOUTH, 5, 8);
    return g;
  }
  const HAT_MARK = {
    giant: ['..y..y..', '.kyykyy.', 'kRRRRRRk', '.kkkkkk.'],
    dragon: ['y......y', '.ykkkky.', 'kttttttk', '.kkkkkk.'],
    mech: ['...r....', '..kdk...', 'kdddddk.', 'kiiiiiik'],
    ghost: ['..kkkk..', '.keeeek.', 'keeeeeek', '.k.k.k..'],
  };
  for (const key of ['giant', 'dragon', 'mech', 'ghost']) {
    const g = G(24, 16);
    const h = head();
    h.forEach((row, j) => row.forEach((c, i) => { if (c !== '.') px(g, i + 1, j + 4, c); }));
    stamp(g, HAT_MARK[key], 3, 0);
    stamp(g, MINI[key], 16, 4);
    S('ui_ability_' + key, [RS(g)]);
    S('ui_ability_' + key + '_mini', [MINI[key]]);
  }
})();
