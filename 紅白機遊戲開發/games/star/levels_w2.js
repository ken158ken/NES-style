/*
 * games/star/levels_w2.js — 《星塵勇者》世界 2「熔岩礦坑」四關（2-1 ~ 2-4）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w2 agent ｜ 依賴：games/star/levels_w1.js（ST.LevelKit / ST.TILE / ST.Levels.register）
 * 契約：docs/TASKS.md「R3 star W2」、docs/PLAN.md §4 R3 內容 A
 *
 * 主題（與 W1 草原 / 洞窟 / 天空 / 城堡對比）：礦坑 → 熔岩層 → 熔爐要塞。
 *   2-1 mine   礦坑入口   教學：崩塌礦石磚 → 蒸氣彈簧 → 礦車升降板
 *   2-2 mine   崩落礦道   節奏關：崩塌磚連段 + 彈簧接力 + 蝙蝠
 *   2-3 magma  熔岩豎坑   機關關：垂直升降板 + 間歇泉 + 熔岩坑
 *   2-4 forge  熔爐要塞   魔王前哨（護甲礦兵密集）+ 魔王「熔心巨像」
 *
 * ── 節奏與難度（研究 04 §1.6 鋸齒曲線、§5.1 難度曲線）───────────────────
 *   每關「安全區 → 單一新機制 → 機制 + 舊壓力 → 綜合」四段；每關 2 個檢查點。
 *   **每一個機關（升降板 / 崩塌磚 / 彈簧 / 間歇泉）都有一條純地形的備援路線**——
 *   坑寬一律 ≤ 8 欄（全速跑跳 80 px = 10 欄），熔岩坑同理，牆高 ≤ 3 列。
 *   ⇒ 不靠機關也走得完（友善版），機關是「比較輕鬆 / 拿得到金幣」的那條路。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var K = ST.LevelKit;
  if (!K || !ST.Levels || !ST.Levels.register) {
    throw new Error('games/star/levels_w2.js 需要 games/star/levels_w1.js（R3 版，有 ST.LevelKit）');
  }
  var T = ST.TILE;

  /* ============================================================ ① 三個新主題 */
  // mine：礦坑（從洞窟繼承；地表 / 內部 / 硬塊換成礦岩，單向平台沿用木板）
  K.addTheme('mine', {
    from: 'cave',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_MTOP'; o[T.DIRT] = 'BG_MROCK'; o[T.BLOCK] = 'BG_ORE';
      o[T.BRICK] = 'BG_MBRICK'; o[T.CAVEBG] = 'BG_MBG';
      return o;
    })(),
    pref: (function () {
      var o = {};
      o[T.CRUMBLE] = 2; o[T.SPRING] = 3; o[T.ORE] = 1;
      o[T.CRYSTAL] = 3; o[T.LAMP] = 3; o[T.BEAM_T] = 2; o[T.BEAM_B] = 2;
      o[T.RAIL] = 2; o[T.VENT] = 2; o[T.MBG] = 3;
      o[T.COIN] = 3; o[T.QBLOCK] = 3; o[T.USED] = 3;
      return o;
    })()
  });
  // magma：熔岩層（從城堡繼承；熔岩用 bg2、金幣 / 機關用 bg3）
  K.addTheme('magma', {
    from: 'castle',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_XTOP'; o[T.DIRT] = 'BG_XROCK';
      o[T.BLOCK] = 'BG_XROCK'; o[T.BRICK] = 'BG_XROCK'; o[T.CAVEBG] = 'BG_MBG';
      return o;
    })(),
    pref: (function () {
      var o = {};
      o[T.CRUMBLE] = 3; o[T.SPRING] = 3; o[T.ORE] = 1;
      o[T.CRYSTAL] = 3; o[T.LAMP] = 3; o[T.BEAM_T] = 1; o[T.BEAM_B] = 1;
      o[T.VENT] = 2; o[T.MBG] = 1; o[T.RAIL] = 1;
      return o;
    })()
  });
  // forge：熔爐要塞（從城堡繼承；齒輪 / 爐窗用 bg3）
  K.addTheme('forge', {
    from: 'castle',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_FTOP'; o[T.DIRT] = 'BG_FSTONE';
      o[T.BLOCK] = 'BG_FSTONE'; o[T.BRICK] = 'BG_FSTONE';
      return o;
    })(),
    pref: (function () {
      var o = {};
      o[T.CRUMBLE] = 3; o[T.SPRING] = 3; o[T.ORE] = 1;
      o[T.GEAR] = 3; o[T.FWIN] = 3; o[T.BEAM_T] = 1; o[T.BEAM_B] = 1;
      o[T.VENT] = 2; o[T.LAMP] = 3;
      return o;
    })()
  });

  /* ============================================================ ② 2-1 礦坑入口 */
  // 10 畫面 / 320 欄。坑：64–69 / 94–101 / 148–153 / 182–189 / 220–225 / 252–259
  var L21 = {
    id: '2-1', world: 2, theme: 'mine', music: 'mine', cols: 320, groundRow: 24, safeCols: 64,
    floor: '64# 6. 24# 8. 26# 6A 6B 8# 6. 28# 8. 30# 6. 26# 8. 28# 32#',
    ceil: '320#',
    objs: [
      // ---- 背景裝飾（全部走 _deco，只填空格 ⇒ 不影響可達性）----------------
      { t: 'dline', c: 0, r: 8, w: 320, k: T.VEIN },
      { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },
      { t: 'deco', c: 14, r: 12, s: 'l' }, { t: 'deco', c: 46, r: 12, s: 'l' },
      { t: 'deco', c: 88, r: 12, s: 'l' }, { t: 'deco', c: 126, r: 11, s: 'l' },
      { t: 'deco', c: 168, r: 12, s: 'l' }, { t: 'deco', c: 214, r: 12, s: 'l' },
      { t: 'deco', c: 262, r: 12, s: 'l' }, { t: 'deco', c: 302, r: 12, s: 'l' },
      { t: 'beam', c: 26, r: 10 }, { t: 'beam', c: 72, r: 10 }, { t: 'beam', c: 118, r: 10 },
      { t: 'beam', c: 176, r: 10 }, { t: 'beam', c: 236, r: 10 }, { t: 'beam', c: 288, r: 10 },
      { t: 'deco', c: 34, r: 22, s: '*' }, { t: 'deco', c: 80, r: 22, s: '*' },
      { t: 'deco', c: 158, r: 22, s: '*' }, { t: 'deco', c: 204, r: 22, s: '*' },
      { t: 'deco', c: 246, r: 22, s: '*' }, { t: 'deco', c: 296, r: 22, s: '*' },
      { t: 'stal', c: 20, r: 9, w: 2 }, { t: 'stal', c: 100, r: 9, w: 2 },
      { t: 'stal', c: 190, r: 9, w: 2 }, { t: 'stal', c: 270, r: 9, w: 2 },

      // ---- ① 安全教學區（0–63）：金幣 → ? 磚 → 礦脈硬塊 -------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: '?' },
      { t: 'coins', c: 26, r: 18, n: 4 },
      { t: 'row', c: 34, r: 20, s: 'B?B' },
      { t: 'rect', c: 48, r: 22, w: 2, h: 2, k: T.ORE },
      { t: 'coins', c: 52, r: 20, n: 3 },

      // ---- ② 崩塌礦石磚教學（40–63）：踩在**地面上方**，碎了只是掉回地面 --
      { t: 'crumble', c: 40, r: 20, w: 4 },
      { t: 'coins', c: 40, r: 18, n: 4 },
      { t: 'crumble', c: 58, r: 20, w: 4 },
      { t: 'coins', c: 58, r: 18, n: 4 },

      // ---- ③ 第一個坑（64–69，6 欄）+ 坑上崩塌橋（走得快就過得去）--------
      { t: 'crumble', c: 64, r: 23, w: 6 },
      { t: 'coins', c: 64, r: 21, n: 3 },
      { t: 'row', c: 78, r: 20, s: '?BB?' },

      // ---- ④ 升降板教學（94–101，8 欄坑；不搭板子也跳得過）---------------
      { t: 'plat', c: 88, r: 20, w: 4 },
      { t: 'coins', c: 96, r: 17, n: 3 },
      { t: 'row', c: 110, r: 20, s: 'B?B' },
      { t: 'rect', c: 120, r: 22, w: 2, h: 2, k: T.ORE },

      // ---- ⑤ 蒸氣彈簧教學（128–147 的兩階台地）----------------------------
      { t: 'spring', c: 130, r: 22 },
      { t: 'plat', c: 136, r: 15, w: 8 },
      { t: 'coins', c: 137, r: 13, n: 4 },
      { t: 'row', c: 142, r: 19, s: '?' },

      // ---- ⑥ 綜合段 --------------------------------------------------------
      { t: 'crumble', c: 148, r: 23, w: 6 },
      { t: 'plat', c: 160, r: 19, w: 6 }, { t: 'coins', c: 161, r: 17, n: 3 },
      { t: 'row', c: 172, r: 20, s: 'B?B' },
      { t: 'plat', c: 196, r: 18, w: 6 }, { t: 'coins', c: 197, r: 16, n: 3 },
      { t: 'rect', c: 206, r: 22, w: 2, h: 2, k: T.ORE },

      // ---- ⑦ 彈簧 → 高台上的無敵星 ---------------------------------------
      { t: 'spring', c: 212, r: 23 },
      { t: 'plat', c: 208, r: 14, w: 10 },
      { t: 'coins', c: 209, r: 12, n: 4 },

      { t: 'crumble', c: 220, r: 23, w: 6 },
      { t: 'row', c: 234, r: 20, s: '?BB?' },
      { t: 'plat', c: 244, r: 19, w: 6 }, { t: 'coins', c: 245, r: 17, n: 3 },
      { t: 'crumble', c: 252, r: 23, w: 8 },
      { t: 'coins', c: 264, r: 20, n: 4 },
      { t: 'deco', c: 270, r: 23, s: 'V' },

      // ---- ⑧ 旗桿 ---------------------------------------------------------
      { t: 'pole', c: 300, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 300, row: 20 },
    checkpoints: [102, 190],
    // 礦車升降板：水平 1 塊（跨 182–189 的坑）、垂直 1 塊（送到 240 的高台）
    movers: [
      { c: 180, r: 22, w: 4, axis: 'x', range: 72, period: 240, phase: 0 },
      { c: 240, r: 14, w: 4, axis: 'y', range: 56, period: 200, phase: 0 }
    ],
    geysers: [
      { c: 270, r: 23, h: 3, period: 180, on: 54, phase: 0 }
    ],
    items: [
      { c: 212, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 44, kind: 'roller', dir: -1 },
      { col: 76, kind: 'roller', dir: -1, edge: true },
      { col: 106, kind: 'bat', y: 80 },
      { col: 118, kind: 'roller', dir: -1 },
      { col: 144, kind: 'bouncer' },
      { col: 164, kind: 'bat', y: 88 },
      { col: 176, kind: 'roller', dir: -1, edge: true },
      { col: 200, kind: 'spitter' },
      { col: 216, kind: 'roller', dir: -1 },
      { col: 238, kind: 'bat', y: 80 },
      { col: 248, kind: 'roller', dir: -1, edge: true },
      { col: 266, kind: 'bouncer' },
      { col: 284, kind: 'roller', dir: -1 }
    ]
  };

  /* ============================================================ ③ 2-2 崩落礦道 */
  // 10 畫面 / 320 欄；坑：32–37 / 60–67 / 92–99 / 148–155 / 182–189 / 214–219 / 246–253
  var L22 = {
    id: '2-2', world: 2, theme: 'mine', music: 'mine', cols: 320, groundRow: 24, safeCols: 32,
    floor: '32# 6. 22# 8. 24# 8. 20# 6A 6C 8A 8# 8. 26# 8. 24# 6. 26# 8. 30# 36#',
    ceil: '40# 8C 24# 10D 30# 12C 40# 10E 30# 8C 40# 12D 36# 20#',
    objs: [
      { t: 'dline', c: 0, r: 9, w: 320, k: T.VEIN },
      { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },
      { t: 'deco', c: 18, r: 13, s: 'l' }, { t: 'deco', c: 56, r: 13, s: 'l' },
      { t: 'deco', c: 104, r: 13, s: 'l' }, { t: 'deco', c: 152, r: 13, s: 'l' },
      { t: 'deco', c: 198, r: 13, s: 'l' }, { t: 'deco', c: 248, r: 13, s: 'l' },
      { t: 'deco', c: 292, r: 13, s: 'l' },
      { t: 'beam', c: 30, r: 11 }, { t: 'beam', c: 84, r: 11 }, { t: 'beam', c: 140, r: 11 },
      { t: 'beam', c: 196, r: 11 }, { t: 'beam', c: 260, r: 11 }, { t: 'beam', c: 306, r: 11 },
      { t: 'deco', c: 24, r: 22, s: '*' }, { t: 'deco', c: 74, r: 22, s: '*' },
      { t: 'deco', c: 128, r: 20, s: '*' }, { t: 'deco', c: 178, r: 22, s: '*' },
      { t: 'deco', c: 230, r: 22, s: '*' }, { t: 'deco', c: 288, r: 22, s: '*' },
      { t: 'stal', c: 44, r: 10, w: 2 }, { t: 'stal', c: 116, r: 13, w: 2 },
      { t: 'stal', c: 210, r: 10, w: 2 }, { t: 'stal', c: 276, r: 10, w: 2 },

      // ---- ① 起跑 + 第一組崩塌橋 ------------------------------------------
      { t: 'coins', c: 12, r: 20, n: 4 },
      { t: 'row', c: 22, r: 20, s: 'B?B' },
      { t: 'crumble', c: 32, r: 23, w: 6 },
      { t: 'coins', c: 32, r: 21, n: 3 },

      // ---- ② 崩塌磚連段（節奏：跑 → 跳 → 跑）------------------------------
      { t: 'crumble', c: 60, r: 23, w: 8 },
      { t: 'coins', c: 60, r: 21, n: 4 },
      { t: 'plat', c: 46, r: 19, w: 6 }, { t: 'coins', c: 47, r: 17, n: 3 },
      { t: 'crumble', c: 92, r: 23, w: 8 },
      { t: 'coins', c: 92, r: 21, n: 4 },
      { t: 'row', c: 76, r: 20, s: '?BB?' },

      // ---- ③ 彈簧接力（120–139 的階梯台地）--------------------------------
      { t: 'spring', c: 122, r: 22 },
      { t: 'plat', c: 126, r: 14, w: 8 }, { t: 'coins', c: 127, r: 12, n: 4 },
      { t: 'spring', c: 134, r: 20 },
      { t: 'plat', c: 140, r: 16, w: 6 }, { t: 'coins', c: 141, r: 14, n: 3 },

      // ---- ④ 升降板 + 崩塌橋交錯 ------------------------------------------
      { t: 'crumble', c: 148, r: 23, w: 8 },
      { t: 'plat', c: 162, r: 19, w: 6 }, { t: 'coins', c: 163, r: 17, n: 3 },
      { t: 'row', c: 172, r: 20, s: 'B?B' },
      { t: 'crumble', c: 182, r: 23, w: 8 },
      { t: 'plat', c: 196, r: 18, w: 8 }, { t: 'coins', c: 197, r: 16, n: 4 },
      { t: 'rect', c: 206, r: 22, w: 2, h: 2, k: T.ORE },

      // ---- ⑤ 綜合段 --------------------------------------------------------
      { t: 'crumble', c: 214, r: 23, w: 6 },
      { t: 'row', c: 226, r: 20, s: '?BB?' },
      { t: 'spring', c: 238, r: 23 },
      { t: 'plat', c: 234, r: 14, w: 10 }, { t: 'coins', c: 235, r: 12, n: 5 },
      { t: 'crumble', c: 246, r: 23, w: 8 },
      { t: 'plat', c: 262, r: 19, w: 6 }, { t: 'coins', c: 263, r: 17, n: 3 },
      { t: 'row', c: 276, r: 20, s: 'B?B' },
      { t: 'deco', c: 290, r: 23, s: 'V' },
      { t: 'pole', c: 302, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 302, row: 20 },
    checkpoints: [100, 196],
    movers: [
      { c: 156, r: 21, w: 4, axis: 'x', range: 64, period: 224, phase: 0 },
      { c: 190, r: 21, w: 4, axis: 'x', range: 64, period: 224, phase: 112 },
      { c: 268, r: 14, w: 4, axis: 'y', range: 48, period: 180, phase: 0 }
    ],
    geysers: [
      { c: 108, r: 23, h: 3, period: 160, on: 48, phase: 0 },
      { c: 290, r: 23, h: 3, period: 160, on: 48, phase: 80 }
    ],
    items: [
      { c: 236, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 24, kind: 'roller', dir: -1 },
      { col: 44, kind: 'bat', y: 96 },
      { col: 52, kind: 'roller', dir: -1, edge: true },
      { col: 72, kind: 'bouncer' },
      { col: 86, kind: 'bat', y: 104 },
      { col: 104, kind: 'roller', dir: -1 },
      { col: 118, kind: 'spitter' },
      { col: 142, kind: 'bat', y: 88 },
      { col: 160, kind: 'roller', dir: -1, edge: true },
      { col: 176, kind: 'bouncer' },
      { col: 200, kind: 'bat', y: 96 },
      { col: 210, kind: 'roller', dir: -1 },
      { col: 228, kind: 'spitter' },
      { col: 244, kind: 'roller', dir: -1, edge: true },
      { col: 264, kind: 'bat', y: 88 },
      { col: 280, kind: 'roller', dir: -1 }
    ]
  };

  /* ============================================================ ④ 2-3 熔岩豎坑 */
  // 9 畫面 / 288 欄；熔岩坑 32–37 / 58–65 / 88–93 / 150–155 / 182–189，無底坑 118–125 / 214–219
  var L23 = {
    id: '2-3', world: 2, theme: 'magma', music: 'magma', cols: 288, groundRow: 24, safeCols: 32,
    floor: '32# 6L 20# 8L 22# 6L 24# 8. 24# 6L 26# 8L 24# 6. 28# 40#',
    ceil: '288#',
    objs: [
      // 岩漿層背景紋：**不要整列鋪滿**（會被誤認成一條可以站的線），改成散落的短段
      { t: 'deco', c: 8, r: 11, s: 'mm..m' }, { t: 'deco', c: 52, r: 10, s: 'm.mm' },
      { t: 'deco', c: 96, r: 13, s: 'mm.m' }, { t: 'deco', c: 140, r: 10, s: 'm..mm' },
      { t: 'deco', c: 186, r: 12, s: 'mm.m' }, { t: 'deco', c: 224, r: 10, s: 'm.mm' },
      { t: 'deco', c: 262, r: 13, s: 'mm..m' },
      { t: 'deco', c: 12, r: 12, s: 'l' }, { t: 'deco', c: 70, r: 12, s: 'l' },
      { t: 'deco', c: 134, r: 12, s: 'l' }, { t: 'deco', c: 200, r: 12, s: 'l' },
      { t: 'deco', c: 258, r: 12, s: 'l' },
      { t: 'beam', c: 44, r: 11 }, { t: 'beam', c: 108, r: 11 },
      { t: 'beam', c: 170, r: 11 }, { t: 'beam', c: 240, r: 11 },
      { t: 'deco', c: 20, r: 22, s: '*' }, { t: 'deco', c: 100, r: 22, s: '*' },
      { t: 'deco', c: 166, r: 22, s: '*' }, { t: 'deco', c: 250, r: 22, s: '*' },

      // ---- ① 安全區 + 熔岩坑（都是 6~8 欄，跑跳跨得過）--------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: 'B?B' },
      { t: 'plat', c: 32, r: 21, w: 6 },                 // 熔岩上的落腳板（備援路線）
      { t: 'coins', c: 33, r: 19, n: 3 },
      { t: 'deco', c: 40, r: 23, s: 'V' },

      // ---- ② 間歇泉（噴發時不能站在噴口上）-------------------------------
      { t: 'deco', c: 48, r: 23, s: 'V' },
      { t: 'plat', c: 58, r: 21, w: 8 }, { t: 'coins', c: 59, r: 19, n: 4 },
      { t: 'row', c: 70, r: 20, s: '?BB?' },
      { t: 'deco', c: 80, r: 23, s: 'V' },
      { t: 'plat', c: 88, r: 21, w: 6 },

      // ---- ③ 垂直升降板塔（94–125）：板子送上去，也能走下面的平台爬 ------
      { t: 'plat', c: 96, r: 20, w: 6 }, { t: 'coins', c: 97, r: 18, n: 3 },
      { t: 'plat', c: 104, r: 16, w: 6 }, { t: 'coins', c: 105, r: 14, n: 3 },
      { t: 'plat', c: 112, r: 20, w: 6 },
      { t: 'plat', c: 118, r: 17, w: 8 }, { t: 'coins', c: 119, r: 15, n: 4 },
      { t: 'spring', c: 128, r: 23 },
      { t: 'plat', c: 126, r: 13, w: 8 }, { t: 'coins', c: 127, r: 11, n: 4 },

      // ---- ④ 熔岩 + 崩塌磚 -------------------------------------------------
      { t: 'crumble', c: 150, r: 23, w: 6 },
      { t: 'plat', c: 140, r: 19, w: 6 }, { t: 'coins', c: 141, r: 17, n: 3 },
      { t: 'deco', c: 160, r: 23, s: 'V' },
      { t: 'row', c: 168, r: 20, s: 'B?B' },
      { t: 'plat', c: 182, r: 21, w: 8 }, { t: 'coins', c: 183, r: 19, n: 4 },
      { t: 'rect', c: 196, r: 22, w: 2, h: 2, k: T.ORE },

      // ---- ⑤ 綜合段 + 無敵星 ----------------------------------------------
      { t: 'spring', c: 204, r: 23 },
      { t: 'plat', c: 200, r: 14, w: 10 }, { t: 'coins', c: 201, r: 12, n: 4 },
      { t: 'crumble', c: 214, r: 23, w: 6 },
      { t: 'plat', c: 226, r: 19, w: 6 }, { t: 'coins', c: 227, r: 17, n: 3 },
      { t: 'deco', c: 236, r: 23, s: 'V' },
      { t: 'row', c: 244, r: 20, s: '?BB?' },
      { t: 'coins', c: 256, r: 20, n: 4 },
      { t: 'pole', c: 272, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 272, row: 20 },
    checkpoints: [94, 190],
    movers: [
      { c: 100, r: 13, w: 4, axis: 'y', range: 64, period: 200, phase: 0 },
      { c: 118, r: 12, w: 4, axis: 'y', range: 72, period: 240, phase: 60 },
      { c: 176, r: 20, w: 4, axis: 'x', range: 64, period: 224, phase: 0 },
      { c: 248, r: 13, w: 4, axis: 'y', range: 56, period: 180, phase: 90 }
    ],
    geysers: [
      { c: 40, r: 23, h: 3, period: 150, on: 48, phase: 0 },
      { c: 48, r: 23, h: 3, period: 150, on: 48, phase: 75 },
      { c: 80, r: 23, h: 4, period: 170, on: 54, phase: 30 },
      { c: 160, r: 23, h: 4, period: 150, on: 54, phase: 0 },
      { c: 236, r: 23, h: 4, period: 160, on: 54, phase: 60 }
    ],
    items: [
      { c: 202, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 44, kind: 'spitter' },
      { col: 52, kind: 'bat', y: 88 },
      { col: 70, kind: 'roller', dir: -1, edge: true },
      { col: 96, kind: 'bat', y: 80 },
      { col: 110, kind: 'flyer', y: 128, amp: 24 },
      { col: 134, kind: 'armor', dir: -1 },
      { col: 146, kind: 'bat', y: 96 },
      { col: 166, kind: 'spitter' },
      { col: 178, kind: 'flyer', y: 120, amp: 24 },
      { col: 192, kind: 'armor', dir: -1 },
      { col: 212, kind: 'bat', y: 88 },
      { col: 230, kind: 'roller', dir: -1, edge: true },
      { col: 244, kind: 'spitter' },
      { col: 258, kind: 'bat', y: 96 }
    ]
  };

  /* ============================================================ ⑤ 2-4 熔爐要塞 */
  // 8 畫面 / 256 欄；熔岩坑 32–39 / 62–67 / 92–99 / 160–167，無底坑 126–131
  // 198–255 是魔王場（實地、無熔岩：被打退也不會直接掉進熔岩）
  var L24 = {
    id: '2-4', world: 2, theme: 'forge', music: 'forge', cols: 256, groundRow: 24, safeCols: 32,
    floor: '32# 8L 22# 6L 24# 8L 26# 6. 28# 8L 30# 58#',
    ceil: '256#',
    objs: [
      { t: 'row', c: 12, r: 9, s: 'w.w' }, { t: 'row', c: 46, r: 9, s: 'w.w' },
      { t: 'row', c: 76, r: 9, s: 'w.w' }, { t: 'row', c: 110, r: 9, s: 'w.w' },
      { t: 'row', c: 146, r: 9, s: 'w.w' }, { t: 'row', c: 182, r: 9, s: 'w.w' },
      { t: 'row', c: 214, r: 9, s: 'w.w' },
      { t: 'deco', c: 26, r: 12, s: 'g' }, { t: 'deco', c: 68, r: 12, s: 'g' },
      { t: 'deco', c: 122, r: 12, s: 'g' }, { t: 'deco', c: 170, r: 12, s: 'g' },
      { t: 'deco', c: 226, r: 12, s: 'g' },
      { t: 'torch', c: 40, r: 12 }, { t: 'torch', c: 96, r: 12 },
      { t: 'torch', c: 150, r: 12 }, { t: 'torch', c: 206, r: 12 },
      { t: 'beam', c: 58, r: 11 }, { t: 'beam', c: 134, r: 11 }, { t: 'beam', c: 194, r: 11 },

      // ---- ① 起跑 + 熔岩坑（都有落腳板）----------------------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: 'B?B' },
      { t: 'plat', c: 32, r: 21, w: 8 }, { t: 'coins', c: 33, r: 19, n: 4 },
      { t: 'deco', c: 44, r: 23, s: 'V' },
      { t: 'plat', c: 62, r: 21, w: 6 }, { t: 'coins', c: 63, r: 19, n: 3 },
      { t: 'row', c: 74, r: 20, s: '?BB?' },
      { t: 'plat', c: 92, r: 21, w: 8 }, { t: 'coins', c: 93, r: 19, n: 4 },

      // ---- ② 護甲礦兵走廊（100–160）：不可踩，只能繞 / 跳過 / 吃無敵星 ----
      { t: 'rect', c: 106, r: 22, w: 2, h: 2, k: T.ORE },
      { t: 'plat', c: 112, r: 19, w: 8 }, { t: 'coins', c: 113, r: 17, n: 4 },
      { t: 'spring', c: 122, r: 23 },
      { t: 'plat', c: 118, r: 14, w: 10 }, { t: 'coins', c: 119, r: 12, n: 5 },
      { t: 'crumble', c: 126, r: 23, w: 6 },
      { t: 'rect', c: 138, r: 22, w: 2, h: 2, k: T.ORE },
      { t: 'plat', c: 144, r: 19, w: 8 }, { t: 'coins', c: 145, r: 17, n: 4 },
      { t: 'deco', c: 156, r: 23, s: 'V' },
      { t: 'plat', c: 160, r: 21, w: 8 }, { t: 'coins', c: 161, r: 19, n: 4 },

      // ---- ③ 魔王前哨（168–196）------------------------------------------
      { t: 'row', c: 172, r: 20, s: 'B?B' },
      { t: 'rect', c: 184, r: 20, w: 2, h: 4, k: T.ORE },
      { t: 'deco', c: 192, r: 23, s: 'V' },
      { t: 'coins', c: 176, r: 20, n: 4 },

      // ---- ④ 魔王場（198–255）：兩側石塊當牆，中間淨空 --------------------
      { t: 'rect', c: 198, r: 20, w: 2, h: 4, k: T.ORE },
      { t: 'coins', c: 206, r: 20, n: 4 },
      { t: 'pole', c: 246, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 246, row: 20 },
    checkpoints: [100, 172],
    bossKind: 'colossus',
    boss: { col: 226, x: 226 * 8, y: 160 },
    movers: [
      { c: 148, r: 21, w: 4, axis: 'x', range: 56, period: 200, phase: 0 },
      { c: 210, r: 14, w: 4, axis: 'y', range: 48, period: 180, phase: 0 }
    ],
    geysers: [
      { c: 44, r: 23, h: 3, period: 150, on: 48, phase: 0 },
      { c: 156, r: 23, h: 4, period: 150, on: 54, phase: 40 },
      { c: 192, r: 23, h: 4, period: 160, on: 48, phase: 80 }
    ],
    items: [
      { c: 120, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 46, kind: 'spitter' },
      { col: 56, kind: 'bat', y: 88 },
      { col: 74, kind: 'roller', dir: -1, edge: true },
      { col: 86, kind: 'bat', y: 96 },
      { col: 104, kind: 'armor', dir: -1 },
      { col: 116, kind: 'spitter' },
      { col: 134, kind: 'armor', dir: -1 },
      { col: 142, kind: 'bat', y: 88 },
      { col: 152, kind: 'roller', dir: -1, edge: true },
      { col: 170, kind: 'armor', dir: -1 },
      { col: 178, kind: 'bat', y: 96 },
      { col: 188, kind: 'spitter' }
    ]
  };

  /* ============================================================ ⑥ 註冊 */
  var IDS2 = ['2-1', '2-2', '2-3', '2-4'];
  var DEFS = { '2-1': L21, '2-2': L22, '2-3': L23, '2-4': L24 };
  var i;
  for (i = 0; i < IDS2.length; i++) ST.Levels.register(DEFS[IDS2[i]]);
  ST.W2_IDS = IDS2;
  ST.W2_DEFS = DEFS;
})();
