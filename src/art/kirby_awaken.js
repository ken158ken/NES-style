// 覺醒像素圖（Round 7 覺醒與挑戰）
// 提供兩個精靈給 player.js 的覺醒外觀疊加：
//   fx_awaken_aura   32×32 ×3 幀，金色脈動光環（anchor: center → 畫在卡比中心 p.cx / p.cy）
//   hat_awaken_crown 20×9  ×2 幀，覺醒冠冕（anchor: bottom → 畫在帽子上方，最後一列貼著給定的 y）
// 規則同其他 art 檔：純程式像素、原創圖案、不使用任何外部素材。
(function () {
  'use strict';
  const KB = window.KB;
  if (!KB || !KB.sprite) return;

  // 金色調色盤（w 最亮 → Y 最暗；k 黑描邊）
  const PAL = {
    w: '#fffce0',   // 高光白金
    y: '#ffe040',   // 金
    g: '#ffa000',   // 深金
    Y: '#c06800',   // 暗金（描邊內側）
    k: '#3a2400',   // 深褐描邊
    e: '#ffffff',
  };

  // ==========================================================
  //  fx_awaken_aura：3 幀脈動光環（火焰狀波紋的圓環）
  // ==========================================================
  const AW = 32, AH = 32, ACX = 15.5, ACY = 15.5;
  function auraFrame(f) {
    const rows = [];
    const puls = [0, 0.9, 1.7][f];              // 每幀外擴一點
    for (let y = 0; y < AH; y++) {
      let s = '';
      for (let x = 0; x < AW; x++) {
        const dx = x - ACX, dy = (y - ACY) * 1.06;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = Math.atan2(dy, dx);
        const wob = Math.sin(a * 6 + f * 2.1) * 1.2 + Math.sin(a * 3 - f * 1.3) * 0.7;
        const r = 13.3 + puls + wob;
        let ch = '.';
        if (d > r - 2.4 && d < r + 0.9) {
          if (d > r - 0.3) ch = 'Y';            // 外緣暗金
          else if (d > r - 1.2) ch = 'g';
          else ch = 'y';
        }
        // 內側火星閃點
        if (ch === '.' && d > r - 4.6 && d <= r - 2.4 && ((x * 3 + y * 5 + f * 7) % 13 === 0)) ch = 'w';
        // 四個方位的長光芒
        const spike = Math.abs(Math.sin(a * 2 + f * 0.5));
        if (ch === '.' && spike > 0.985 && d < r + 3.6 && d > r) ch = 'y';
        s += ch;
      }
      rows.push(s);
    }
    return rows;
  }
  KB.sprite('fx_awaken_aura', PAL, [auraFrame(0), auraFrame(1), auraFrame(2)], { anchor: 'center', fps: 12 });

  // ==========================================================
  //  hat_awaken_crown：覺醒冠冕（3 尖角 + 寶石，2 幀＝寶石閃爍）
  // ==========================================================
  function crown(lit) {
    const j = lit ? 'e' : 'w';                  // 寶石高光
    return [
      '..k.......k.......k.',
      '.kwk.....kwk.....kwk',
      '.kyk.....kyk.....kyk',
      '.kyk..k..kyk..k..kyk',
      'kkykkkykkkykkkykkkyk',
      'kyyyyy' + j + 'yyyyy' + j + 'yyyyyyk',
      'kyyyyyyyyyyyyyyyyyyk',
      'kYgYgYgYgYgYgYgYgYYk',
      'kkkkkkkkkkkkkkkkkkkk',
    ];
  }
  KB.sprite('hat_awaken_crown', PAL, [crown(false), crown(true)], { anchor: 'bottom', fps: 6 });
})();

// =============================================================================
//  Round 8「awaken-mix」新增：混合能力覺醒招用的美術
//    kirby_awaken_cast  24×24 ×2 幀，金色覺醒詠唱姿勢（anchor: center，由招式用 KB.fx 疊在卡比身上）
//    fx_awk_<mixkey>    24×24 ×2 幀 ×24 張，每招專屬的「覺醒印記」（兩個成分的圖騰疊合，anchor: center）
//  一樣是純程式像素、原創圖案，沒有任何外部素材。
// =============================================================================
(function () {
  'use strict';
  const KB = window.KB;
  if (!KB || !KB.sprite) return;

  // ==========================================================
  //  1. kirby_awaken_cast：詠唱姿勢（雙手上舉、閉眼、金色釉光）
  //     24×24，anchor center → KB.fx('kirby_awaken_cast', p.cx, p.cy, {alpha: .82})
  // ==========================================================
  const CAST_PAL = {
    y: '#ffe040',   // 金（主體）
    w: '#fffce0',   // 高光
    g: '#ff9800',   // 深金陰影
    k: '#3a2400',   // 描邊
    e: '#ffffff',   // 火花
    r: '#ff7050',   // 腮紅
  };
  const CW = 24, CH = 24;
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
  /** 圓形聯集 → 描邊 + 內部光影（左上亮、右下暗） */
  function blobRows(w, h, circles) {
    const inside = (x, y) => circles.some(c => {
      const u = (x + 0.5 - c[0]) / c[2], v = (y + 0.5 - c[1]) / c[2];
      return u * u + v * v <= 1;
    });
    const rows = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) { r += '.'; continue; }
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { r += 'k'; continue; }
        const m = circles[0];
        const u = (x + 0.5 - m[0]) / m[2], v = (y + 0.5 - m[1]) / m[2], d = Math.sqrt(u * u + v * v);
        if (d > 0.62 && u + v > 0.5) r += 'g';
        else if (d < 0.66 && u + v < -0.5) r += 'w';
        else r += 'y';
      }
      rows.push(r);
    }
    return rows;
  }
  const EYE_UP = ['k.k', '.k.'];            // 用力閉眼（^ ^）
  const MOUTH_O = ['kk', 'kk'];             // 張嘴喊招
  function castFrame(f) {
    // 身體 15px 大圓（略向上浮），雙手高舉（f 差 1px），雙腳併攏
    const lift = f ? 1 : 0;
    let rows = blank(CW, CH);
    rows = paste(rows, blobRows(CW, CH, [
      [11.5, 13 - lift, 7.6],                 // 身體
      [3.4, 5.2 - lift * 1.5, 3.0],           // 左手（高舉，與身體分離）
      [19.6, 5.2 - lift * 1.5, 3.0],          // 右手（高舉，與身體分離）
      [7.5, 20, 3.0], [15.5, 20, 3.0],        // 雙腳
    ]), 0, 0);
    rows = paste(rows, EYE_UP, 7, 11 - lift);
    rows = paste(rows, EYE_UP, 14, 11 - lift);
    rows = paste(rows, MOUTH_O, 11, 14 - lift);
    rows = paste(rows, ['r', 'r'], 5, 14 - lift);
    rows = paste(rows, ['r', 'r'], 18, 14 - lift);
    // 頭頂與雙手的金色火花
    const spk = f ? [[11, 1], [3, 2], [20, 2]] : [[11, 0], [2, 3], [21, 3]];
    for (const [x, y] of spk) rows = paste(rows, ['.e.', 'eee', '.e.'], x - 1, y);
    return rows;
  }
  KB.sprite('kirby_awaken_cast', CAST_PAL, [castFrame(0), castFrame(1)], { anchor: 'center', fps: 8 });

  // ==========================================================
  //  2. fx_awk_<mixkey>：24 張覺醒印記
  //     每張 = 主成分圖騰（元素 A 色）＋ 副成分圖騰（元素 B 色）疊合，2 幀（脈動 / 火花位移）
  // ==========================================================
  const ELC = {
    fire: ['#fff0a0', '#ff8020', '#c03000'],
    ice: ['#e8fbff', '#78d8ff', '#2060b0'],
    spark: ['#fffce0', '#ffe040', '#c08000'],
    stone: ['#e8e0d0', '#a89078', '#5a4838'],
    shadow: ['#e0c8ff', '#9060e0', '#3a1860'],
    star: ['#ffffff', '#ffe880', '#c07820'],
    voidc: ['#d0b0ff', '#7030c0', '#280a4a'],
    time: ['#f0f4ff', '#a0b8e8', '#404870'],
    steel: ['#e8f0ff', '#90a8c8', '#404860'],
    light: ['#ffffff', '#a0e0ff', '#2060a0'],
  };
  const R = 11.5;                                  // 24×24 的中心
  const near = (v, t, w) => Math.abs(v - t) < w;
  /** 圖騰：(dx, dy, d, a, f) → 是否填色（座標以中心為原點，dy 往下為正） */
  const MOTIF = {
    // 向上竄的火舌
    flame: (dx, dy, d, a, f) => {
      if (dy >= 10 || dy <= -11) return false;
      const w = 8.2 * Math.pow((10 - dy) / 21, 0.8) + Math.sin(dy * 0.85 + f * 2.3) * 1.5;
      const ax = Math.abs(dx);
      return ax < w && (ax > w - 3 || dy > 4);      // 外緣火舌 + 底部實心
    },
    // 六芒冰晶
    frost: (dx, dy, d, a, f) => d < 11 && (d < 2.6 || (Math.abs(Math.sin(a * 3 + f * 0.25)) > 0.965 && d > 2)),
    // 直落的鋸齒閃電（含分支）
    bolt: (dx, dy, d, a, f) => Math.abs(dy) < 11 &&
      (near(dx, Math.sin(dy * 0.8 + f * 1.6) * 3.4, 1.7) || (dy > 0 && near(dx, dy * 0.55 - 2 + f, 1.2))),
    // 交叉的長斬擊
    blade: (dx, dy, d, a, f) => d < 11.4 &&
      (Math.abs(dx * 0.64 - dy * 0.77) < 1.6 || Math.abs(dx * 0.77 + dy * 0.64) < 1.2 - f * 0.3),
    // 新月斬弧
    arc: (dx, dy, d, a, f) => near(d, 8.6 + f * 0.7, 1.7) && a > -2.5 && a < 0.3,
    // 環狀奇點（外環 + 黑心）
    orb: (dx, dy, d, a, f) => d < 10 - f && d > 4.2 - f * 0.6,
    // 五芒星
    star5: (dx, dy, d, a, f) => d < 4.6 + 6.2 * Math.abs(Math.cos(2.5 * (a + 1.57) + f * 0.12)),
    // 地裂橫帶
    quake: (dx, dy, d, a, f) => Math.abs(dx) < 11.4 && near(dy, 2.4 + Math.sin(dx * 0.72 + f * 1.1) * 2.6, 1.9),
    // 齒輪
    gear: (dx, dy, d, a, f) => d < 11 && d > 4.4 &&
      (near(d, 7.4, 1.8) || (Math.abs(Math.cos(a * 6 + f * 0.3)) > 0.86 && d > 6)),
    // 疊三層的箭頭
    chev: (dx, dy, d, a, f) => Math.abs(dx) < 9.5 &&
      [-7, -0.5, 6].some(k => near(dy, k + Math.abs(dx) * 0.8 - f * 0.8, 1.4)),
    // 放射狀砲口
    muzzle: (dx, dy, d, a, f) => d < 3.4 || (d < 11 && Math.abs(Math.sin(a * 3 + f * 0.45)) > 0.9),
    // 螺旋
    spiral: (dx, dy, d, a, f) => d < 11 && d > 1.6 && Math.abs(Math.sin((a + d * 0.52 + f * 0.5) * 1.5)) > 0.93,
    // 四角手裡劍
    shuri: (dx, dy, d, a, f) => d < 10.4 * Math.pow(Math.abs(Math.cos(2 * (a + 0.4 + f * 0.3))), 1.4) + 1.4,
    // 時鐘（外環 + 兩根指針）
    clock: (dx, dy, d, a, f) => near(d, 9.2, 1.4) ||
      (d < 6.6 && Math.abs(dx * Math.sin(-1.1 + f * 0.4) - dy * Math.cos(-1.1 + f * 0.4)) < 1.1) ||
      (d < 8.6 && Math.abs(dx * Math.sin(0.6) - dy * Math.cos(0.6)) < 1.1),
    // 光柱
    pillar: (dx, dy, d, a, f) => Math.abs(dx) < 4.2 - Math.abs(dy) * 0.06 + f * 0.5 && Math.abs(dy) < 11.6,
    // 雙翼
    wing: (dx, dy, d, a, f) => near(d, 8.8 - f * 0.6, 2.0) && Math.abs(dy + 1) < 7.4 && Math.abs(dx) > 2.4,
    // 鎚頭（方頭 + 握柄）
    maul: (dx, dy, d, a, f) => (Math.abs(dx) < 7.2 && Math.abs(dy + 4 - f) < 3.6) ||
      (Math.abs(dx) < 1.6 && dy > -2 - f && dy < 10),
    // 山稜
    mount: (dx, dy, d, a, f) => dy > -2.2 && dy < 10.4 &&
      Math.abs(dx) < (dy + 3.2) * 0.92 - Math.abs(Math.sin(dx * 1.7 + f)) * 0.9,
  };
  /** 產生一張覺醒印記：主圖騰 mA（元素 cA）＋ 副圖騰 mB（元素 cB） */
  function mkFx(name, mA, cA, mB, cB) {
    const S = 24;
    const pal = {
      '1': ELC[cA][0], '2': ELC[cA][1], '3': ELC[cA][2],
      '4': ELC[cB][0], '5': ELC[cB][1], '6': ELC[cB][2],
      e: '#ffffff', k: '#2a1830',
    };
    const A0 = MOTIF[mA], B0 = MOTIF[mB];
    const frames = [];
    for (let f = 0; f < 2; f++) {
      const g = [];
      for (let y = 0; y < S; y++) {
        const row = [];
        for (let x = 0; x < S; x++) {
          const dx = x - R, dy = y - R, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
          let ch = '.';
          // 主成分圖騰先鋪底，副成分圖騰疊在上面（副圖騰都是細線條，才不會被底色吃掉）
          if (A0(dx, dy, d, a, f)) ch = d > 8.2 ? '3' : (d > 4 ? '2' : '1');
          if (B0(dx, dy, d, a, f)) ch = d > 7.5 ? '6' : (d > 3.6 ? '5' : '4');
          if (ch !== '.' && (x * 5 + y * 3 + f * 11) % 29 === 0) ch = 'e';   // 白色火花
          row.push(ch);
        }
        g.push(row);
      }
      // 外描邊（空白但四鄰有色 → k）
      const out = g.map(r => r.slice());
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (g[y][x] !== '.') continue;
        const n = (g[y - 1] && g[y - 1][x]) || '.', s = (g[y + 1] && g[y + 1][x]) || '.';
        const w = g[y][x - 1] || '.', e = g[y][x + 1] || '.';
        if (n !== '.' || s !== '.' || w !== '.' || e !== '.') out[y][x] = 'k';
      }
      frames.push(out.map(r => r.join('')));
    }
    KB.sprite(name, pal, frames, { anchor: 'center', fps: 10 });
  }

  // 24 組混合能力各一張（圖騰配對 = 兩個成分的特色）
  const SIGILS = [
    ['flamesword', 'flame', 'fire', 'blade', 'star'],
    ['frostsword', 'frost', 'ice', 'blade', 'light'],
    ['thunderblade', 'bolt', 'spark', 'blade', 'light'],
    ['flamegun', 'flame', 'fire', 'muzzle', 'star'],
    ['frostgun', 'frost', 'ice', 'muzzle', 'light'],
    ['thunderbow', 'bolt', 'spark', 'chev', 'star'],
    ['flamehammer', 'flame', 'fire', 'maul', 'stone'],
    ['stonehammer', 'mount', 'stone', 'maul', 'steel'],
    ['shadowblade', 'shuri', 'shadow', 'arc', 'voidc'],
    ['starmage', 'star5', 'star', 'muzzle', 'light'],
    ['frostdragon', 'frost', 'ice', 'wing', 'light'],
    ['thundermech', 'bolt', 'spark', 'gear', 'steel'],
    ['flamebow', 'flame', 'fire', 'chev', 'star'],
    ['frosthammer', 'frost', 'ice', 'maul', 'steel'],
    ['thundersword', 'bolt', 'spark', 'arc', 'star'],
    ['flameninja', 'flame', 'fire', 'shuri', 'shadow'],
    ['frostninja', 'frost', 'ice', 'shuri', 'shadow'],
    ['thundergun', 'bolt', 'spark', 'muzzle', 'steel'],
    ['stonegiant', 'mount', 'stone', 'quake', 'steel'],
    ['flamedragon', 'orb', 'fire', 'wing', 'star'],
    ['thunderdragon', 'bolt', 'spark', 'wing', 'light'],
    ['timebeam', 'clock', 'time', 'pillar', 'light'],
    ['gravityblade', 'orb', 'voidc', 'spiral', 'shadow'],
    ['hammermech', 'maul', 'steel', 'gear', 'fire'],
  ];
  for (const [key, mA, cA, mB, cB] of SIGILS) mkFx('fx_awk_' + key, mA, cA, mB, cB);
  KB.AWAKEN_SIGILS = SIGILS.map(s => s[0]);
})();
