/*
 * games/cart1/snake/stages.js — 《星塵貪食蟲》場地資料（全部原創配置）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-1 cart1-grid（R5）。純資料。
 * 場地內格 30×22（外圈一圈牆由 main.js 畫）；座標 (x, y) = 內格座標 0..29 × 0..21。
 *   walls   ：[x, y, w, h] 矩形
 *   portals ：[{ k: 'A' | 'B', a: [x, y], b: [x, y] }]  — 頭走進 a 就從 b 往同方向出來（反之亦然）
 *   start   ：玩家蟲的頭與方向（0 上 1 右 2 下 3 左；身體往反方向排）
 *   target  ：本關要吃幾顆星；speed：幾幀走一格；back：底色（每關換底色 = 換氣氛）
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var S = CT.Snake = CT.Snake || {};
  S.FW = 30; S.FH = 22;

  S.STAGES = [
    { name: 'OPEN SKY', target: 8, speed: 8, back: 0x0F, start: [5, 18, 1], walls: [], portals: [] },
    { name: 'TWIN BARS', target: 10, speed: 8, back: 0x01, start: [5, 18, 1],
      walls: [[5, 6, 20, 1], [5, 15, 20, 1]], portals: [] },
    { name: 'FOUR PILLARS', target: 10, speed: 7, back: 0x0C, start: [5, 18, 1],
      walls: [[6, 4, 3, 3], [21, 4, 3, 3], [6, 14, 3, 3], [21, 14, 3, 3]],
      portals: [{ k: 'A', a: [2, 10], b: [27, 10] }] },
    { name: 'CROSSROAD', target: 12, speed: 7, back: 0x08, start: [5, 18, 1],
      walls: [[6, 10, 8, 2], [16, 10, 8, 2], [14, 2, 2, 6], [14, 14, 2, 6]],
      portals: [{ k: 'A', a: [2, 2], b: [27, 19] }] },
    { name: 'SPIRAL', target: 12, speed: 6, back: 0x02, start: [5, 18, 1],
      walls: [[3, 3, 24, 1], [26, 3, 1, 15], [6, 17, 21, 1], [6, 7, 1, 10], [6, 7, 16, 1], [21, 7, 1, 7], [10, 13, 12, 1]],
      portals: [{ k: 'A', a: [14, 10], b: [28, 20] }] },
    { name: 'COMB', target: 14, speed: 6, back: 0x0B, start: [5, 18, 1],
      walls: [[8, 0, 1, 13], [12, 9, 1, 13], [16, 0, 1, 13], [20, 9, 1, 13], [24, 0, 1, 13]],
      portals: [{ k: 'A', a: [4, 2], b: [27, 19] }, { k: 'B', a: [2, 10], b: [28, 15] }] },
    { name: 'RINGS', target: 14, speed: 5, back: 0x07, start: [13, 20, 1],
      walls: [[3, 2, 11, 1], [16, 2, 11, 1], [3, 19, 11, 1], [16, 19, 11, 1], [3, 3, 1, 7], [3, 12, 1, 7], [26, 3, 1, 7], [26, 12, 1, 7],
              [9, 6, 12, 1], [9, 15, 12, 1], [9, 7, 1, 8], [20, 7, 1, 3], [20, 12, 1, 3]],
      portals: [{ k: 'A', a: [14, 10], b: [1, 0] }] },
    { name: 'STAR CORE', target: 16, speed: 5, back: 0x03, start: [5, 18, 1],
      walls: [[13, 8, 4, 6], [9, 10, 4, 2], [17, 10, 4, 2], [14, 4, 2, 4], [14, 14, 2, 4]],
      portals: [{ k: 'A', a: [2, 2], b: [27, 19] }, { k: 'B', a: [27, 2], b: [4, 20] }] }
  ];
  S.ENDLESS = { name: 'ENDLESS', target: 0, speed: 8, back: 0x0F, start: [5, 11, 1], walls: [], portals: [] };
  S.ARENA = { name: 'ARENA', target: 15, speed: 6, back: 0x01, start: [4, 11, 1], cpu: [25, 11, 3],
    walls: [[7, 4, 2, 2], [21, 4, 2, 2], [7, 16, 2, 2], [21, 16, 2, 2], [13, 9, 4, 4]],
    portals: [{ k: 'A', a: [14, 1], b: [15, 20] }] };
  S.START_LEN = 4;
})();
