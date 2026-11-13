/*
 * games/cart1/tower/maps.js — 《星塵塔防》三張原創地圖 × 10 波 + 塔 / 敵人數值表 + 每線精靈上界驗證
 * ---------------------------------------------------------------------------
 * 擁有者：C5-4 cart1-strategy agent（R5）
 *
 * 地圖 16 × 12 格（每格 16×16）：'.' 可蓋塔、'#' 路、'S' 出怪口、'C' 星核、'T' 樹、'R' 岩（不能蓋）。
 * 路徑由 S 沿 '#' 走到 C（唯一一條，buildPath 自動求）。
 *
 * ★ 每線 ≤ 8 精靈的「設計保證」★
 *   敵人一律 8×8（魔王 16×8 = 同一條線多 1 顆）。敵人在路上**排隊**：與前一隻的路徑距離永遠 ≥ GAP(24 px)
 *   （快的追上慢的就跟在後面），出怪口也要前一隻走開 GAP 才放下一隻。
 *   ⇒ 對每條掃描線 l，「能同時蓋到 l 的敵人數」= 路徑上 y 落在 [l-3, l+4] 的弧長集合裡、
 *      兩兩相距 ≥ GAP 的最多點數（一維區間 + 最小間距 ⇒ 貪婪法取得最大值）。
 *   bound(map) 就是這個最大值；test_tower 驗證三張圖都 ≤ 6 ⇒ 加上魔王的 +1 也 ≤ 7，
 *   剩下的 ≥ 1 顆給子彈 / 火花（main.js 的逐線配額器只在線上還有空位時才畫，不靠 PPU 輪替）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var T = CT.Tower = CT.Tower || {};

  var GAP = 24;

  var MAPS = [
    {
      id: 'meadow', name: 'GREEN GATE', hp: 1.0, money: 100,
      pal: { grass: 0x1A, path: 0x27, dark: 0x09, rock: 0x00, hiGrass: 0x2A, hiPath: 0x37 },
      grid: [
        '..S.............',
        '..#..####...T...',
        '..#..#..#.......',
        '..#..#..#.......',
        'T.#..#..#.......',
        '..#..#..#.......',
        '..#..#..#..####.',
        '..#..#..####..#.',
        '..####........#.',
        '...T..........#.',
        '......C########.',
        '..........R.....']
    },
    {
      id: 'mesa', name: 'RED MESA', hp: 1.6, money: 120,
      pal: { grass: 0x17, path: 0x37, dark: 0x07, rock: 0x00, hiGrass: 0x27, hiPath: 0x30 },
      grid: [
        '.........R......',
        'S####...T.......',
        '....#...........',
        '....#...#####...',
        '..T.#...#...#...',
        '....#####...#...',
        '............#.T.',
        '..#######...#...',
        '..#.....#...#...',
        '..#.....#####...',
        '..#......R......',
        '..C......T......']
    },
    {
      id: 'frost', name: 'FROST FIELD', hp: 2.2, money: 140,
      pal: { grass: 0x21, path: 0x31, dark: 0x01, rock: 0x00, hiGrass: 0x2C, hiPath: 0x30 },
      grid: [
        '.......S........',
        '.......#........',
        '..######..T.....',
        '..#.............',
        '..#..#####......',
        '..#..#...#..T...',
        '..####...#......',
        '.........####...',
        '..T.........#...',
        '..C####.....#...',
        '......#.....#...',
        '......#######...']
    }
  ];

  // 敵人：hp / 速度(8.8 px/幀) / 護甲 / 賞金 / 漏掉扣命
  var ENEMIES = {
    mite: { hp: 10, sp: 150, armor: 0, reward: 3, lives: 1, art: 'MITE', pal: 1 },
    moth: { hp: 6, sp: 300, armor: 0, reward: 4, lives: 1, art: 'MOTH', pal: 1 },
    beetle: { hp: 30, sp: 100, armor: 2, reward: 7, lives: 1, art: 'BEETLE', pal: 2 },
    healer: { hp: 18, sp: 120, armor: 0, reward: 6, lives: 1, art: 'HEALER', pal: 2, heal: 2 },
    boss: { hp: 260, sp: 80, armor: 3, reward: 60, lives: 5, art: 'BOSS', pal: 2, boss: true }
  };
  // 塔：三種 × 三級（Lv1 = 蓋，Lv2 / Lv3 = 升級花費 up）
  var TOWERS = {
    needle: { name: 'NEEDLE', cost: 30, kind: 'shot',
      lv: [{ range: 40, dmg: 3, rate: 20, up: 0 }, { range: 46, dmg: 5, rate: 16, up: 35 }, { range: 54, dmg: 8, rate: 12, up: 55 }] },
    frost: { name: 'FROST', cost: 45, kind: 'slow',
      lv: [{ range: 36, dmg: 1, rate: 50, slow: 128, up: 0 }, { range: 44, dmg: 2, rate: 45, slow: 100, up: 35 }, { range: 52, dmg: 4, rate: 40, slow: 80, up: 55 }] },
    thunder: { name: 'THUNDER', cost: 70, kind: 'area',
      lv: [{ range: 30, dmg: 8, rate: 70, up: 0 }, { range: 36, dmg: 14, rate: 60, up: 50 }, { range: 42, dmg: 24, rate: 50, up: 80 }] }
  };
  var TOWER_ORDER = ['needle', 'frost', 'thunder'];

  // 波次：[種類, 數量, 間隔幀]；地圖 2 / 3 在同一表上加量（見 wavesFor）
  var WAVES = [
    [['mite', 8, 50]],
    [['mite', 12, 40]],
    [['moth', 8, 30], ['mite', 6, 40]],
    [['beetle', 5, 70], ['mite', 8, 36]],
    [['healer', 3, 60], ['mite', 10, 34]],
    [['moth', 14, 26]],
    [['beetle', 7, 60], ['healer', 4, 50]],
    [['mite', 12, 30], ['moth', 10, 26]],
    [['beetle', 9, 50], ['healer', 5, 44], ['moth', 6, 26]],
    [['mite', 8, 34], ['boss', 1, 60], ['beetle', 5, 50]]
  ];
  function wavesFor(mi) {
    var extra = [0, 2, 4][mi];
    return WAVES.map(function (w, wi) {
      return w.map(function (grp) { return [grp[0], grp[0] === 'boss' ? 1 : grp[1] + Math.floor(extra * (wi + 2) / 4), grp[2]]; });
    });
  }

  /* ---------------- 路徑 ---------------- */
  function cellAt(m, c, r) { return (r >= 0 && r < 12 && c >= 0 && c < 16) ? m.grid[r].charAt(c) : 'X'; }
  function buildPath(m) {
    if (m._path) return m._path;
    var s = null, c, r;
    for (r = 0; r < 12; r++) for (c = 0; c < 16; c++) if (cellAt(m, c, r) === 'S') s = [c, r];
    var cells = [s], seen = {}, cur = s;
    seen[s[0] + ',' + s[1]] = 1;
    while (true) {
      var nx = null, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var a = cur[0] + D[i][0], b = cur[1] + D[i][1], ch = cellAt(m, a, b);
        if ((ch === '#' || ch === 'C') && !seen[a + ',' + b]) { nx = [a, b]; break; }
      }
      if (!nx) break;
      seen[nx[0] + ',' + nx[1]] = 1; cells.push(nx); cur = nx;
      if (cellAt(m, nx[0], nx[1]) === 'C') break;
    }
    // 中心點（螢幕 px）：x = c*16+8、y = 16 + r*16 + 8
    var pts = cells.map(function (q) { return [q[0] * 16 + 8, 16 + q[1] * 16 + 8]; });
    m._path = { cells: cells, pts: pts, len: (pts.length - 1) * 16, endsAtCore: cellAt(m, cur[0], cur[1]) === 'C' };
    return m._path;
  }
  // 弧長 s(px，整數) → 螢幕中心點
  function posAt(m, s, out) {
    var p = buildPath(m), i = Math.floor(s / 16), f = s - i * 16;
    if (i >= p.pts.length - 1) { i = p.pts.length - 2; f = 16; }
    if (i < 0) { i = 0; f = 0; }
    var a = p.pts[i], b = p.pts[i + 1];
    out = out || {};
    out.x = a[0] + ((b[0] - a[0]) * f >> 4);
    out.y = a[1] + ((b[1] - a[1]) * f >> 4);
    return out;
  }
  // 每線敵人上界（見檔頭）
  function bound(m) {
    var p = buildPath(m), n = p.len, l, s, best = 0, bestLine = -1, ys = [], o = {};
    for (s = 0; s <= n; s++) { posAt(m, s, o); ys.push(o.y); }
    for (l = 16; l < 208; l++) {
      var last = -1e9, cnt = 0;
      for (s = 0; s <= n; s++) {
        var y0 = ys[s] - 4;                    // 8×8 精靈的頂
        if (l >= y0 && l < y0 + 8 && s - last >= GAP) { cnt++; last = s; }
      }
      if (cnt > best) { best = cnt; bestLine = l; }
    }
    return { max: best, line: bestLine };
  }

  T.GAP = GAP;
  T.MAPS = MAPS;
  T.ENEMIES = ENEMIES;
  T.TOWERS = TOWERS;
  T.TOWER_ORDER = TOWER_ORDER;
  T.wavesFor = wavesFor;
  T.buildPath = buildPath;
  T.posAt = posAt;
  T.bound = bound;
  T.cellAt = cellAt;
})();
