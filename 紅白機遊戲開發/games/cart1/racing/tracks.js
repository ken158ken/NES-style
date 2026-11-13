/*
 * games/cart1/racing/tracks.js — 《星塵賽車》三條原創賽道（純資料 + 建表）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-4 cart1-strategy agent（R5）
 *
 * 賽道 = 一圈 N 列（每列 8 px，往「前」= 往畫面上方）。每列記路面左右欄 L[k]..R[k]（含），
 * 路肩在 L-1 / R+1。分段 segs = [列數, 目標中心欄, 半寬]，段內線性內插，邊緣每列最多移 1 欄
 * （test_racing 驗證，含一圈頭尾接縫）。
 * 道具 items = [列, 距路左緣的欄, 種類]；種類：
 *   cone 角錐 / rock 落石（撞到減速）、oil 油漬（打滑旋轉）、boost 加速板、nitro 氮氣罐（+1）、
 *   patch 地表補丁（赤砂 = 沙地減速；冰晶 = 冰面打滑）
 * 版面限制（屬性區塊 16×16）：道具欄必須在 [L+2, R-2]，build() 會夾限。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var R = CT.Racing = CT.Racing || {};

  var TRACKS = [
    {
      id: 'meadow', name: 'STAR RING MEADOW', short: 'MEADOW', laps: 3,
      backdrop: 0x2A, deco: [0x00, 0x09, 0x1A], grip: 'normal', patch: 'none',
      // 對手極速（8.8，玩家極速 896）
      rivals: [820, 840, 860, 880, 900],
      segs: [
        [24, 16, 7], [40, 13, 7], [24, 13, 7], [48, 19, 7], [32, 19, 7], [36, 15, 7],
        [24, 15, 6], [40, 20, 6], [30, 20, 6], [40, 13, 6], [24, 13, 7], [36, 17, 7],
        [32, 16, 7], [30, 16, 7]
      ],
      items: [
        [60, 4, 'nitro'], [96, 9, 'boost'], [140, 3, 'cone'], [150, 9, 'cone'],
        [200, 6, 'nitro'], [236, 3, 'boost'], [270, 8, 'cone'], [300, 4, 'oil'],
        [340, 8, 'nitro'], [380, 5, 'boost'], [410, 2, 'cone'], [418, 9, 'cone'],
        [440, 6, 'nitro']
      ]
    },
    {
      id: 'canyon', name: 'RED SAND CANYON', short: 'CANYON', laps: 3,
      backdrop: 0x27, deco: [0x00, 0x07, 0x17], grip: 'normal', patch: 'sand',
      rivals: [850, 870, 890, 905, 920],
      segs: [
        [20, 16, 6], [30, 11, 6], [20, 11, 6], [36, 21, 6], [20, 21, 5], [30, 14, 5],
        [16, 14, 5], [28, 20, 5], [22, 20, 6], [36, 12, 6], [20, 12, 6], [24, 17, 6],
        [34, 22, 6], [24, 22, 6], [36, 15, 6], [28, 16, 6], [22, 16, 6]
      ],
      items: [
        [44, 3, 'rock'], [52, 8, 'patch'], [70, 5, 'nitro'], [100, 2, 'patch'], [104, 6, 'patch'],
        [130, 4, 'boost'], [160, 2, 'rock'], [168, 7, 'rock'], [200, 4, 'oil'], [236, 6, 'nitro'],
        [262, 3, 'patch'], [266, 7, 'patch'], [300, 5, 'boost'], [330, 2, 'oil'], [338, 8, 'rock'],
        [372, 5, 'nitro'], [400, 3, 'rock'], [410, 8, 'patch'], [424, 5, 'boost'], [438, 4, 'nitro']
      ]
    },
    {
      id: 'glacier', name: 'CRYSTAL ICE ROAD', short: 'GLACIER', laps: 3,
      backdrop: 0x31, deco: [0x00, 0x0C, 0x21], grip: 'ice', patch: 'ice',
      rivals: [868, 884, 900, 914, 930],
      segs: [
        [20, 16, 6], [26, 12, 6], [18, 12, 6], [26, 18, 6], [18, 18, 5], [24, 13, 5],
        [16, 13, 5], [24, 19, 5], [20, 19, 6], [32, 11, 6], [16, 11, 6], [32, 19, 6],
        [16, 19, 6], [26, 14, 6], [20, 14, 5], [22, 19, 5], [22, 19, 6], [26, 16, 6],
        [30, 16, 6]
      ],
      items: [
        [40, 5, 'nitro'], [64, 2, 'patch'], [68, 7, 'patch'], [96, 4, 'oil'], [120, 6, 'boost'],
        [150, 3, 'cone'], [156, 7, 'cone'], [186, 4, 'patch'], [214, 6, 'nitro'], [246, 2, 'oil'],
        [252, 8, 'oil'], [280, 5, 'boost'], [312, 3, 'patch'], [318, 7, 'patch'], [346, 4, 'cone'],
        [376, 6, 'nitro'], [404, 2, 'patch'], [410, 7, 'oil'], [426, 4, 'boost']
      ]
    }
  ];

  var SOLID = { cone: 1, rock: 1 };

  // 建表：中心 / 半寬逐列內插 → L / R；道具依列建索引
  function build(t) {
    if (t._built) return t._built;
    var cs = [], hs = [], i, j;
    var c0 = t.segs[t.segs.length - 1][1], h0 = t.segs[t.segs.length - 1][2];
    for (i = 0; i < t.segs.length; i++) {
      var n = t.segs[i][0], c1 = t.segs[i][1], h1 = t.segs[i][2];
      for (j = 1; j <= n; j++) {
        cs.push(c0 + Math.round((c1 - c0) * j / n));
        hs.push(h0 + Math.round((h1 - h0) * j / n));
      }
      c0 = c1; h0 = h1;
    }
    var N = cs.length, L = new Int8Array(N), Rr = new Int8Array(N);
    for (i = 0; i < N; i++) { L[i] = cs[i] - hs[i]; Rr[i] = cs[i] + hs[i] - 1; }
    var items = [], byRow = {};
    for (i = 0; i < t.items.length; i++) {
      var it = t.items[i], row = it[0] % N;
      var col = L[row] + it[1];
      if (col < L[row] + 2) col = L[row] + 2;
      var maxc = Rr[row] - 2 - (it[2] === 'boost' ? 1 : 0);
      if (col > maxc) col = maxc;
      var o = { id: i, row: row, col: col, type: it[2], solid: !!SOLID[it[2]], w: it[2] === 'boost' ? 2 : 1 };
      items.push(o);
      (byRow[row] = byRow[row] || []).push(o);
    }
    var b = { N: N, L: L, R: Rr, items: items, byRow: byRow, lapPx: N * 8 };
    t._built = b;
    return b;
  }

  R.TRACKS = TRACKS;
  R.buildTrack = build;
})();
