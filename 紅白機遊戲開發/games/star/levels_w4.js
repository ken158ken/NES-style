/*
 * games/star/levels_w4.js — 《星塵勇者》世界 4「機械要塞」四關（4-1 ~ 4-4）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w4 agent（R4）｜ 依賴：games/star/levels_w1.js（ST.LevelKit / ST.TILE / ST.Levels.register）
 * 契約：docs/TASKS.md「R4 star W4」、docs/PLAN.md §4 R4 內容 B
 *
 * 主題（與 W1 草原 / 洞窟 / 天空 / 城堡、W2 礦坑 / 熔岩 / 熔爐全部不同）：
 *   4-1 works   輸入樓層   教學：輸送帶 → 齒輪升降台 → 雷射柵欄（各給一次安全示範）
 *   4-2 works   傳送帶迷宮 節奏關：順帶 / 逆帶接力 + 崩塌鋼板 + 無人機
 *   4-3 core    核心反應層 機關關：雷射節奏 + 升降台塔 + 電漿池（LAVA）+ 重裝守衛
 *   4-4 citadel 要塞核心   魔王前哨（守衛走廊）+ 魔王「核心守護者」
 *
 * ── 節奏與難度（研究 04 §1.6 鋸齒曲線、§5.1 難度曲線；同 W2 的慣例）─────
 *   每關「安全區 → 單一新機制 → 機制 + 舊壓力 → 綜合」四段；每關 2 個檢查點。
 *   **每一個機關都有一條純地形的備援路線**——坑 / 電漿帶一律 ≤ 8 欄（全速跑跳 80 px
 *   = 10 欄）、牆高 ≤ 3 列 ⇒ 不靠機關也走得完（友善版），機關是「比較輕鬆 / 拿得到金幣」那條。
 *   **輸送帶一律 ≤ 12 欄**，逆帶時跑速 2.5 − 0.5 = 2.0 px/幀 ⇒ 仍然會前進，不可能卡住。
 *
 * ── 為什麼機關是「資料」不是「硬編碼」──────────────────────────────────
 *   `belts / lasers / lifts` 三張表由 `ST.ObjectsW4` 讀取，位置與開關都是時間（或位置）的
 *   純函式 ⇒ 通關機器人（tools/playthrough_star.py --w4）可以往前推演，測試可以重現。
 *   輸送帶的**外觀**是背景磚 `TILE.BRIDGE`（works 主題覆寫成 BG_BELT），
 *   **物理**是 `belts[]`；兩者欄位一致（test_w4.py ⑤ 會逐段比對）。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var K = ST.LevelKit;
  if (!K || !ST.Levels || !ST.Levels.register) {
    throw new Error('games/star/levels_w4.js 需要 games/star/levels_w1.js（R3 版，有 ST.LevelKit）');
  }
  var T = ST.TILE;

  /* ============================================================ ① 三個新主題 */
  // works：機械工房（鋼板 + 輸送帶 + 電路背景）。從 castle 繼承（石磚 → 鋼板）
  K.addTheme('works', {
    from: 'castle',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_WTOP'; o[T.DIRT] = 'BG_WPLATE';
      o[T.BLOCK] = 'BG_WBLOCK'; o[T.BRICK] = 'BG_WBLOCK';
      o[T.CAVEBG] = 'BG_CIRC';
      o[T.BRIDGE] = 'BG_BELT';                 // 輸送帶的帶面
      o[T.VENT] = 'BG_EMIT';                   // 雷射發射座
      o[T.PLATFORM] = 'BG_CAT'; o[T.PLAT_L] = 'BG_CAT'; o[T.PLAT_R] = 'BG_CAT';
      o[T.GEAR] = 'BG_COG'; o[T.RAIL] = 'BG_DUCT'; o[T.STAL] = 'BG_DUCT';
      o[T.CRYSTAL] = 'BG_RIVET'; o[T.LAMP] = 'BG_MONI';
      o[T.BEAM_T] = 'BG_GIRD_T'; o[T.BEAM_B] = 'BG_GIRD_B';
      o[T.MBG] = 'BG_WIRE'; o[T.FWIN] = 'BG_VALVE';
      return o;
    })(),
    pref: (function () {
      var o = {};
      o[T.BRIDGE] = 3; o[T.VENT] = 3; o[T.GEAR] = 3; o[T.RAIL] = 3;
      o[T.CRYSTAL] = 3; o[T.LAMP] = 3; o[T.MBG] = 1; o[T.FWIN] = 3;
      o[T.BEAM_T] = 1; o[T.BEAM_B] = 1; o[T.CAVEBG] = 1;
      o[T.CRUMBLE] = 3; o[T.ORE] = 1; o[T.SPRING] = 3;
      return o;
    })()
  });
  // core：核心反應層（深藍機身 + 電漿池）。只換地形磚，機關 / 裝飾沿用 works
  K.addTheme('core', {
    from: 'works',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_KTOP'; o[T.DIRT] = 'BG_KWALL';
      o[T.BLOCK] = 'BG_KBLOCK'; o[T.BRICK] = 'BG_KBLOCK';
      return o;
    })()
  });
  // citadel：要塞核心（紫鋼）
  K.addTheme('citadel', {
    from: 'works',
    override: (function () {
      var o = {};
      o[T.GROUND] = 'BG_ZTOP'; o[T.DIRT] = 'BG_ZWALL';
      o[T.BLOCK] = 'BG_ZWALL'; o[T.BRICK] = 'BG_ZWALL';
      return o;
    })()
  });

  /* 輸送帶 / 升降台的小工具：把「物理資料」與「背景磚」一起產生，兩邊不可能對不上 */
  function beltObjs(objs, belts, list) {
    var i, b;
    for (i = 0; i < list.length; i++) {
      b = list[i];
      belts.push({ c: b.c, r: b.r, w: b.w, dir: b.dir });
      objs.push({ t: 'rect', c: b.c, r: b.r, w: b.w, h: 1, k: T.BRIDGE });
    }
    return belts;
  }

  /* ============================================================ ② 4-1 輸入樓層 */
  // 10 畫面 / 320 欄。坑：70–75 / 100–107 / 150–155 / 186–193 / 224–229 / 258–265
  var B41 = [], O41 = [
    // ---- 背景裝飾（全部 _deco / dline，只填空格 ⇒ 不影響可達性）------------
    { t: 'dline', c: 0, r: 8, w: 320, k: T.MBG },
    { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },
    { t: 'deco', c: 16, r: 12, s: 'l' }, { t: 'deco', c: 54, r: 12, s: 'l' },
    { t: 'deco', c: 96, r: 12, s: 'l' }, { t: 'deco', c: 140, r: 11, s: 'l' },
    { t: 'deco', c: 182, r: 12, s: 'l' }, { t: 'deco', c: 228, r: 12, s: 'l' },
    { t: 'deco', c: 276, r: 12, s: 'l' }, { t: 'deco', c: 308, r: 12, s: 'l' },
    { t: 'beam', c: 28, r: 10 }, { t: 'beam', c: 76, r: 10 }, { t: 'beam', c: 122, r: 10 },
    { t: 'beam', c: 178, r: 10 }, { t: 'beam', c: 238, r: 10 }, { t: 'beam', c: 290, r: 10 },
    { t: 'deco', c: 36, r: 22, s: 'g' }, { t: 'deco', c: 84, r: 22, s: 'g' },
    { t: 'deco', c: 162, r: 22, s: 'g' }, { t: 'deco', c: 210, r: 22, s: 'g' },
    { t: 'deco', c: 252, r: 22, s: 'g' }, { t: 'deco', c: 300, r: 22, s: 'g' },
    { t: 'deco', c: 22, r: 9, s: '**' }, { t: 'deco', c: 108, r: 9, s: '**' },
    { t: 'deco', c: 198, r: 9, s: '**' }, { t: 'deco', c: 282, r: 9, s: '**' },
    { t: 'deco', c: 64, r: 13, s: 'w' }, { t: 'deco', c: 148, r: 13, s: 'w' },
    { t: 'deco', c: 244, r: 13, s: 'w' },

    // ---- ① 安全教學區（0–39）：金幣 → ? 磚 → 礦脈硬塊 --------------------
    { t: 'coins', c: 10, r: 20, n: 4 },
    { t: 'row', c: 20, r: 20, s: '?' },
    { t: 'coins', c: 26, r: 18, n: 4 },
    { t: 'row', c: 32, r: 20, s: 'B?B' },

    // ---- ② 輸送帶教學（40–51，順向，站上去更快）-------------------------
    { t: 'coins', c: 42, r: 20, n: 5 },
    { t: 'rect', c: 56, r: 22, w: 2, h: 2, k: T.ORE },
    { t: 'row', c: 60, r: 20, s: '?BB?' },

    // ---- ③ 第一個坑（70–75，6 欄）+ 坑上崩塌鋼板（走得快就過得去）-------
    { t: 'crumble', c: 70, r: 23, w: 6 },
    { t: 'coins', c: 70, r: 21, n: 3 },
    { t: 'row', c: 84, r: 20, s: 'B?B' },

    // ---- ④ 齒輪升降台教學（100–107，8 欄坑；不搭台也跳得過）-------------
    { t: 'plat', c: 92, r: 20, w: 4 },
    { t: 'coins', c: 94, r: 17, n: 3 },
    { t: 'row', c: 112, r: 20, s: 'B?B' },

    // ---- ⑤ 逆向輸送帶（128–135 的兩階台地上）----------------------------
    { t: 'coins', c: 118, r: 20, n: 3 },
    { t: 'plat', c: 138, r: 16, w: 8 },
    { t: 'coins', c: 139, r: 14, n: 4 },
    { t: 'spring', c: 136, r: 22 },

    // ---- ⑥ 雷射柵欄教學（160 / 172 兩道；關掉的時候走過去）--------------
    { t: 'row', c: 160, r: 19, s: 'V' },
    { t: 'row', c: 172, r: 19, s: 'V' },
    { t: 'crumble', c: 150, r: 23, w: 6 },
    { t: 'plat', c: 164, r: 18, w: 6 }, { t: 'coins', c: 165, r: 16, n: 3 },

    // ---- ⑦ 綜合段 --------------------------------------------------------
    { t: 'row', c: 198, r: 20, s: 'B?B' },
    { t: 'plat', c: 206, r: 18, w: 6 }, { t: 'coins', c: 207, r: 16, n: 3 },
    { t: 'rect', c: 218, r: 22, w: 2, h: 2, k: T.ORE },
    { t: 'crumble', c: 224, r: 23, w: 6 },

    // ---- ⑧ 彈簧 → 高台上的無敵星 ---------------------------------------
    { t: 'spring', c: 240, r: 23 },
    { t: 'plat', c: 236, r: 14, w: 10 },
    { t: 'coins', c: 237, r: 12, n: 4 },
    { t: 'row', c: 248, r: 20, s: '?BB?' },
    { t: 'crumble', c: 258, r: 23, w: 8 },
    { t: 'coins', c: 270, r: 20, n: 4 },
    { t: 'row', c: 282, r: 19, s: 'V' },

    // ---- ⑨ 旗桿 ---------------------------------------------------------
    { t: 'pole', c: 300, r: 9 }
  ];
  beltObjs(O41, B41, [
    { c: 40, r: 24, w: 12, dir: 1 },          // 教學：順向帶（把人往前送）
    { c: 128, r: 22, w: 8, dir: -1 }          // 第一次逆向帶（走得慢，但走得過）
  ]);
  var L41 = {
    id: '4-1', world: 4, theme: 'works', music: 'works', cols: 320, groundRow: 24, safeCols: 64,
    floor: '70# 6. 24# 8. 20# 8B 14# 6. 30# 8. 12# 6A 12# 6. 28# 8. 54#',
    ceil: '320#',
    objs: O41,
    start: { x: 32, y: 168 },
    goal: { col: 300, row: 20 },
    checkpoints: [112, 196],
    belts: B41,
    lifts: [
      { c: 98, r: 20, w: 4, axis: 'x', range: 72, period: 240, phase: 0 },   // fix-r4 P3-2：r22→20
      { c: 232, r: 14, w: 4, axis: 'y', range: 56, period: 200, phase: 0 }
    ],
    lasers: [
      { c: 160, r: 23, h: 4, period: 180, on: 54, phase: 0 },
      { c: 172, r: 23, h: 4, period: 180, on: 54, phase: 90 },
      { c: 282, r: 23, h: 4, period: 170, on: 48, phase: 40 }
    ],
    items: [
      { c: 240, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 46, kind: 'roller', dir: -1 },
      { col: 64, kind: 'drone', y: 120, range: 40 },
      { col: 82, kind: 'roller', dir: -1, edge: true },
      { col: 110, kind: 'drone', y: 104, range: 48 },
      { col: 118, kind: 'sentry' },
      { col: 144, kind: 'bouncer' },
      { col: 158, kind: 'drone', y: 112, range: 40 },
      { col: 182, kind: 'guard', dir: -1 },
      { col: 204, kind: 'sentry' },
      { col: 216, kind: 'roller', dir: -1 },
      { col: 244, kind: 'drone', y: 104, range: 48 },
      { col: 252, kind: 'roller', dir: -1, edge: true },
      { col: 272, kind: 'guard', dir: -1 },
      { col: 290, kind: 'sentry' }
    ]
  };

  /* ============================================================ ③ 4-2 傳送帶迷宮 */
  // 10 畫面 / 320 欄；坑：44–49 / 78–85 / 118–125 / 164–169 / 200–207 / 240–245 / 274–281
  var B42 = [], O42 = [
    { t: 'dline', c: 0, r: 9, w: 320, k: T.MBG },
    { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },
    { t: 'deco', c: 20, r: 13, s: 'l' }, { t: 'deco', c: 58, r: 13, s: 'l' },
    { t: 'deco', c: 106, r: 13, s: 'l' }, { t: 'deco', c: 154, r: 13, s: 'l' },
    { t: 'deco', c: 200, r: 13, s: 'l' }, { t: 'deco', c: 250, r: 13, s: 'l' },
    { t: 'deco', c: 294, r: 13, s: 'l' },
    { t: 'beam', c: 32, r: 11 }, { t: 'beam', c: 88, r: 11 }, { t: 'beam', c: 142, r: 11 },
    { t: 'beam', c: 196, r: 11 }, { t: 'beam', c: 262, r: 11 }, { t: 'beam', c: 308, r: 11 },
    { t: 'deco', c: 26, r: 22, s: 'g' }, { t: 'deco', c: 74, r: 22, s: 'g' },
    { t: 'deco', c: 130, r: 20, s: 'g' }, { t: 'deco', c: 180, r: 22, s: 'g' },
    { t: 'deco', c: 232, r: 22, s: 'g' }, { t: 'deco', c: 290, r: 22, s: 'g' },
    { t: 'deco', c: 48, r: 10, s: '**' }, { t: 'deco', c: 120, r: 13, s: '**' },
    { t: 'deco', c: 212, r: 10, s: '**' }, { t: 'deco', c: 278, r: 10, s: '**' },
    { t: 'deco', c: 68, r: 14, s: 'w' }, { t: 'deco', c: 176, r: 14, s: 'w' },
    { t: 'deco', c: 268, r: 14, s: 'w' },

    // ---- ① 起跑 + 第一組崩塌鋼板 ----------------------------------------
    { t: 'coins', c: 12, r: 20, n: 4 },
    { t: 'row', c: 22, r: 20, s: 'B?B' },
    { t: 'crumble', c: 44, r: 23, w: 6 },
    { t: 'coins', c: 44, r: 21, n: 3 },

    // ---- ② 順帶 → 逆帶接力（50–77）--------------------------------------
    { t: 'coins', c: 52, r: 20, n: 4 },
    { t: 'plat', c: 62, r: 19, w: 6 }, { t: 'coins', c: 63, r: 17, n: 3 },

    // ---- ③ 崩塌鋼板連段（78–125）----------------------------------------
    { t: 'crumble', c: 78, r: 23, w: 8 },
    { t: 'coins', c: 78, r: 21, n: 4 },
    { t: 'row', c: 92, r: 20, s: '?BB?' },
    { t: 'crumble', c: 118, r: 23, w: 8 },
    { t: 'coins', c: 118, r: 21, n: 4 },

    // ---- ④ 升降台 + 雷射交錯（126–199）---------------------------------
    { t: 'row', c: 136, r: 19, s: 'V' },
    { t: 'row', c: 148, r: 19, s: 'V' },
    { t: 'plat', c: 140, r: 16, w: 6 }, { t: 'coins', c: 141, r: 14, n: 3 },
    { t: 'spring', c: 156, r: 23 },
    { t: 'plat', c: 152, r: 14, w: 10 }, { t: 'coins', c: 153, r: 12, n: 5 },
    { t: 'crumble', c: 164, r: 23, w: 6 },
    { t: 'row', c: 176, r: 20, s: 'B?B' },
    { t: 'plat', c: 186, r: 18, w: 8 }, { t: 'coins', c: 187, r: 16, n: 4 },

    // ---- ⑤ 綜合段（200–319）--------------------------------------------
    { t: 'rect', c: 220, r: 22, w: 2, h: 2, k: T.ORE },
    { t: 'row', c: 228, r: 20, s: '?BB?' },
    { t: 'spring', c: 250, r: 23 },
    { t: 'plat', c: 246, r: 14, w: 10 }, { t: 'coins', c: 247, r: 12, n: 5 },
    { t: 'crumble', c: 240, r: 23, w: 6 },
    { t: 'plat', c: 262, r: 19, w: 6 }, { t: 'coins', c: 263, r: 17, n: 3 },
    { t: 'crumble', c: 274, r: 23, w: 8 },
    { t: 'row', c: 288, r: 20, s: 'B?B' },
    { t: 'row', c: 296, r: 19, s: 'V' },
    { t: 'pole', c: 302, r: 9 }
  ];
  beltObjs(O42, B42, [
    { c: 50, r: 24, w: 12, dir: 1 },
    { c: 66, r: 24, w: 12, dir: -1 },
    { c: 100, r: 23, w: 8, dir: -1 },         // 'A' 台地（上緣 23）上的逆帶
    { c: 208, r: 24, w: 10, dir: 1 },
    { c: 218, r: 22, w: 8, dir: -1 }          // 'B' 台地（上緣 22）
  ]);
  var L42 = {
    id: '4-2', world: 4, theme: 'works', music: 'works', cols: 320, groundRow: 24, safeCols: 32,
    floor: '44# 6. 28# 8. 14# 8A 10# 8. 38# 6. 30# 8. 10# 8B 14# 6. 28# 8. 38#',
    ceil: '40# 8C 24# 10D 30# 12C 40# 10E 30# 8C 40# 12D 36# 20#',
    objs: O42,
    start: { x: 32, y: 168 },
    goal: { col: 302, row: 20 },
    checkpoints: [100, 212],
    belts: B42,
    lifts: [
      { c: 112, r: 19, w: 4, axis: 'x', range: 64, period: 224, phase: 0 },   // fix-r4 P3-2：r21→19
      { c: 194, r: 19, w: 4, axis: 'x', range: 64, period: 224, phase: 112 }, // fix-r4 P3-2：r21→19
      { c: 234, r: 14, w: 4, axis: 'y', range: 48, period: 180, phase: 0 }
    ],
    lasers: [
      { c: 136, r: 23, h: 4, period: 160, on: 48, phase: 0 },
      { c: 148, r: 23, h: 4, period: 160, on: 48, phase: 80 },
      { c: 296, r: 23, h: 4, period: 170, on: 48, phase: 30 }
    ],
    items: [
      { c: 248, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 24, kind: 'roller', dir: -1 },
      { col: 54, kind: 'drone', y: 112, range: 40 },
      { col: 58, kind: 'roller', dir: -1, edge: true },
      { col: 72, kind: 'bouncer' },
      { col: 90, kind: 'drone', y: 120, range: 48 },
      { col: 108, kind: 'guard', dir: -1 },
      { col: 128, kind: 'sentry' },
      { col: 146, kind: 'drone', y: 104, range: 40 },
      { col: 172, kind: 'roller', dir: -1, edge: true },
      { col: 182, kind: 'guard', dir: -1 },
      { col: 198, kind: 'drone', y: 112, range: 48 },
      { col: 214, kind: 'sentry' },
      { col: 232, kind: 'bouncer' },
      { col: 256, kind: 'drone', y: 104, range: 40 },
      { col: 266, kind: 'guard', dir: -1 },
      { col: 288, kind: 'sentry' }
    ]
  };

  /* ============================================================ ④ 4-3 核心反應層 */
  // 9 畫面 / 288 欄；電漿池 32–37 / 60–67 / 90–95 / 152–157 / 184–191，無底坑 120–127 / 216–221
  var B43 = [], O43 = [
    { t: 'deco', c: 8, r: 11, s: 'mm..m' }, { t: 'deco', c: 52, r: 10, s: 'm.mm' },
    { t: 'deco', c: 96, r: 13, s: 'mm.m' }, { t: 'deco', c: 140, r: 10, s: 'm..mm' },
    { t: 'deco', c: 186, r: 12, s: 'mm.m' }, { t: 'deco', c: 224, r: 10, s: 'm.mm' },
    { t: 'deco', c: 262, r: 13, s: 'mm..m' },
    { t: 'deco', c: 12, r: 12, s: 'l' }, { t: 'deco', c: 70, r: 12, s: 'l' },
    { t: 'deco', c: 134, r: 12, s: 'l' }, { t: 'deco', c: 200, r: 12, s: 'l' },
    { t: 'deco', c: 258, r: 12, s: 'l' },
    { t: 'beam', c: 44, r: 11 }, { t: 'beam', c: 108, r: 11 },
    { t: 'beam', c: 170, r: 11 }, { t: 'beam', c: 240, r: 11 },
    { t: 'deco', c: 20, r: 22, s: 'g' }, { t: 'deco', c: 100, r: 22, s: 'g' },
    { t: 'deco', c: 166, r: 22, s: 'g' }, { t: 'deco', c: 250, r: 22, s: 'g' },
    { t: 'deco', c: 30, r: 9, s: '**' }, { t: 'deco', c: 128, r: 9, s: '**' },
    { t: 'deco', c: 208, r: 9, s: '**' },
    { t: 'deco', c: 78, r: 14, s: 'w' }, { t: 'deco', c: 196, r: 14, s: 'w' },

    // ---- ① 安全區 + 電漿池（都是 6~8 欄，跑跳跨得過）--------------------
    { t: 'coins', c: 10, r: 20, n: 4 },
    { t: 'row', c: 20, r: 20, s: 'B?B' },
    { t: 'plat', c: 32, r: 21, w: 6 },                 // 池上的落腳板（備援路線）
    { t: 'coins', c: 33, r: 19, n: 3 },

    // ---- ② 雷射節奏段（40–89）：三道連續光柵，照節奏穿過 ----------------
    { t: 'row', c: 44, r: 19, s: 'V' },
    { t: 'row', c: 52, r: 19, s: 'V' },
    { t: 'plat', c: 60, r: 21, w: 8 }, { t: 'coins', c: 61, r: 19, n: 4 },
    { t: 'row', c: 72, r: 20, s: '?BB?' },
    { t: 'row', c: 80, r: 19, s: 'V' },
    { t: 'plat', c: 90, r: 21, w: 6 },

    // ---- ③ 垂直升降台塔（96–127）：台子送上去，也能走下面的平台爬 ------
    { t: 'plat', c: 98, r: 20, w: 6 }, { t: 'coins', c: 99, r: 18, n: 3 },
    { t: 'plat', c: 106, r: 16, w: 6 }, { t: 'coins', c: 107, r: 14, n: 3 },
    { t: 'plat', c: 114, r: 20, w: 6 },
    { t: 'plat', c: 120, r: 17, w: 8 }, { t: 'coins', c: 121, r: 15, n: 4 },
    { t: 'spring', c: 130, r: 23 },
    { t: 'plat', c: 128, r: 13, w: 8 }, { t: 'coins', c: 129, r: 11, n: 4 },

    // ---- ④ 電漿 + 崩塌鋼板 + 守衛（150–215）-----------------------------
    { t: 'crumble', c: 144, r: 23, w: 6 },
    { t: 'plat', c: 152, r: 21, w: 6 }, { t: 'coins', c: 153, r: 19, n: 3 },
    { t: 'row', c: 168, r: 20, s: 'B?B' },
    { t: 'row', c: 178, r: 19, s: 'V' },
    { t: 'plat', c: 184, r: 21, w: 8 }, { t: 'coins', c: 185, r: 19, n: 4 },
    { t: 'rect', c: 196, r: 22, w: 2, h: 2, k: T.ORE },

    // ---- ⑤ 綜合段 + 無敵星（200–287）-----------------------------------
    { t: 'spring', c: 206, r: 23 },
    { t: 'plat', c: 202, r: 14, w: 10 }, { t: 'coins', c: 203, r: 12, n: 4 },
    { t: 'crumble', c: 216, r: 23, w: 6 },
    { t: 'plat', c: 228, r: 19, w: 6 }, { t: 'coins', c: 229, r: 17, n: 3 },
    { t: 'row', c: 238, r: 19, s: 'V' },
    { t: 'row', c: 246, r: 20, s: '?BB?' },
    { t: 'coins', c: 256, r: 20, n: 4 },
    { t: 'pole', c: 272, r: 9 }
  ];
  beltObjs(O43, B43, [
    { c: 96, r: 24, w: 8, dir: -1 },
    { c: 192, r: 24, w: 12, dir: 1 },
    { c: 258, r: 24, w: 10, dir: -1 }
  ]);
  var L43 = {
    id: '4-3', world: 4, theme: 'core', music: 'core', cols: 288, groundRow: 24, safeCols: 32,
    floor: '32# 6L 22# 8L 22# 6L 24# 8. 24# 6L 26# 8L 24# 6. 66#',
    ceil: '288#',
    objs: O43,
    start: { x: 32, y: 168 },
    goal: { col: 272, row: 20 },
    checkpoints: [96, 196],
    belts: B43,
    lifts: [
      { c: 102, r: 18, w: 4, axis: 'y', range: 40, period: 200, phase: 0 },   // fix-r4 P3-2：下段 144..184
      { c: 120, r: 10, w: 4, axis: 'y', range: 48, period: 240, phase: 60 },  // fix-r4 P3-2：上段 80..128
      { c: 178, r: 20, w: 4, axis: 'x', range: 64, period: 224, phase: 0 },
      { c: 250, r: 13, w: 4, axis: 'y', range: 56, period: 180, phase: 90 }
    ],
    lasers: [
      { c: 44, r: 23, h: 4, period: 150, on: 48, phase: 0 },
      { c: 52, r: 23, h: 4, period: 150, on: 48, phase: 75 },
      { c: 80, r: 23, h: 5, period: 170, on: 54, phase: 30 },
      { c: 178, r: 23, h: 5, period: 150, on: 48, phase: 0 },
      { c: 238, r: 23, h: 5, period: 160, on: 54, phase: 60 }
    ],
    items: [
      { c: 204, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 42, kind: 'sentry' },
      { col: 54, kind: 'drone', y: 112, range: 40 },
      { col: 70, kind: 'roller', dir: -1, edge: true },
      { col: 98, kind: 'drone', y: 96, range: 48 },
      { col: 112, kind: 'flyer', y: 128, amp: 24 },
      { col: 136, kind: 'guard', dir: -1 },
      { col: 148, kind: 'drone', y: 104, range: 40 },
      { col: 166, kind: 'sentry' },
      { col: 180, kind: 'flyer', y: 120, amp: 24 },
      { col: 194, kind: 'guard', dir: -1 },
      { col: 212, kind: 'drone', y: 112, range: 48 },
      { col: 230, kind: 'roller', dir: -1, edge: true },
      { col: 244, kind: 'sentry' },
      { col: 262, kind: 'drone', y: 104, range: 40 }
    ]
  };

  /* ============================================================ ⑤ 4-4 要塞核心 */
  // 8 畫面 / 256 欄；電漿池 32–39 / 62–67 / 92–99 / 160–167，無底坑 126–131
  // 198–255 是魔王場（實地、無電漿：被打退也不會直接掉進池子）
  var B44 = [], O44 = [
    { t: 'row', c: 12, r: 9, s: 'w.w' }, { t: 'row', c: 46, r: 9, s: 'w.w' },
    { t: 'row', c: 76, r: 9, s: 'w.w' }, { t: 'row', c: 110, r: 9, s: 'w.w' },
    { t: 'row', c: 146, r: 9, s: 'w.w' }, { t: 'row', c: 182, r: 9, s: 'w.w' },
    { t: 'row', c: 214, r: 9, s: 'w.w' },
    { t: 'deco', c: 26, r: 12, s: 'g' }, { t: 'deco', c: 68, r: 12, s: 'g' },
    { t: 'deco', c: 122, r: 12, s: 'g' }, { t: 'deco', c: 170, r: 12, s: 'g' },
    { t: 'deco', c: 226, r: 12, s: 'g' },
    { t: 'deco', c: 40, r: 12, s: 'l' }, { t: 'deco', c: 96, r: 12, s: 'l' },
    { t: 'deco', c: 150, r: 12, s: 'l' }, { t: 'deco', c: 206, r: 12, s: 'l' },
    { t: 'beam', c: 58, r: 11 }, { t: 'beam', c: 134, r: 11 }, { t: 'beam', c: 194, r: 11 },
    { t: 'dline', c: 0, r: 23, w: 256, k: T.RAIL },

    // ---- ① 起跑 + 電漿池（都有落腳板）----------------------------------
    { t: 'coins', c: 10, r: 20, n: 4 },
    { t: 'row', c: 20, r: 20, s: 'B?B' },
    { t: 'plat', c: 32, r: 21, w: 8 }, { t: 'coins', c: 33, r: 19, n: 4 },
    { t: 'plat', c: 62, r: 21, w: 6 }, { t: 'coins', c: 63, r: 19, n: 3 },
    { t: 'row', c: 74, r: 20, s: '?BB?' },
    { t: 'plat', c: 92, r: 21, w: 8 }, { t: 'coins', c: 93, r: 19, n: 4 },

    // ---- ② 重裝守衛走廊（100–160）：只有排氣窗開著的 60 幀踩得死 --------
    { t: 'rect', c: 106, r: 22, w: 2, h: 2, k: T.ORE },
    { t: 'plat', c: 112, r: 19, w: 8 }, { t: 'coins', c: 113, r: 17, n: 4 },
    { t: 'spring', c: 122, r: 23 },
    { t: 'plat', c: 118, r: 14, w: 10 }, { t: 'coins', c: 119, r: 12, n: 5 },
    { t: 'crumble', c: 126, r: 23, w: 6 },
    { t: 'rect', c: 138, r: 22, w: 2, h: 2, k: T.ORE },
    { t: 'plat', c: 144, r: 19, w: 8 }, { t: 'coins', c: 145, r: 17, n: 4 },
    { t: 'row', c: 156, r: 19, s: 'V' },
    { t: 'plat', c: 160, r: 21, w: 8 }, { t: 'coins', c: 161, r: 19, n: 4 },

    // ---- ③ 魔王前哨（168–196）------------------------------------------
    { t: 'row', c: 172, r: 20, s: 'B?B' },
    { t: 'rect', c: 184, r: 20, w: 2, h: 4, k: T.ORE },
    { t: 'row', c: 192, r: 19, s: 'V' },
    { t: 'coins', c: 176, r: 20, n: 4 },

    // ---- ④ 魔王場（198–255）：兩側鋼塊當牆，中間淨空 -------------------
    { t: 'rect', c: 198, r: 20, w: 2, h: 4, k: T.ORE },
    { t: 'coins', c: 206, r: 20, n: 4 },
    { t: 'pole', c: 246, r: 9 }
  ];
  beltObjs(O44, B44, [
    { c: 100, r: 24, w: 6, dir: -1 },
    { c: 148, r: 24, w: 8, dir: 1 }
  ]);
  var L44 = {
    id: '4-4', world: 4, theme: 'citadel', music: 'core', cols: 256, groundRow: 24, safeCols: 32,
    floor: '32# 8L 22# 6L 24# 8L 26# 6. 28# 8L 30# 58#',
    ceil: '256#',
    objs: O44,
    start: { x: 32, y: 168 },
    goal: { col: 246, row: 20 },
    checkpoints: [100, 172],
    bossKind: 'guardian',
    boss: { col: 226, x: 226 * 8, y: 160 },
    belts: B44,
    lifts: [
      { c: 124, r: 20, w: 4, axis: 'x', range: 56, period: 200, phase: 0 },   // fix-r4 P3-2：r22→20
      { c: 210, r: 14, w: 4, axis: 'y', range: 48, period: 180, phase: 0 }
    ],
    lasers: [
      { c: 156, r: 23, h: 5, period: 150, on: 48, phase: 40 },
      { c: 192, r: 23, h: 5, period: 160, on: 48, phase: 80 }
    ],
    items: [
      { c: 120, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 46, kind: 'sentry' },
      { col: 56, kind: 'drone', y: 104, range: 40 },
      { col: 74, kind: 'roller', dir: -1, edge: true },
      { col: 86, kind: 'drone', y: 112, range: 48 },
      { col: 104, kind: 'guard', dir: -1 },
      { col: 116, kind: 'sentry' },
      { col: 134, kind: 'guard', dir: -1 },
      { col: 142, kind: 'drone', y: 104, range: 40 },
      { col: 152, kind: 'roller', dir: -1, edge: true },
      { col: 170, kind: 'guard', dir: -1 },
      { col: 178, kind: 'drone', y: 112, range: 48 },
      { col: 188, kind: 'sentry' }
    ]
  };

  /* ============================================================ ⑥ 註冊 */
  var IDS4 = ['4-1', '4-2', '4-3', '4-4'];
  var DEFS = { '4-1': L41, '4-2': L42, '4-3': L43, '4-4': L44 };
  // `levels_w1.js` 的 Level 只複製 movers / geysers / items（R3 的三張表），
  // W4 的三張新表（belts / lasers / lifts）在 register 之後自己掛上去（複本，不共用物件）。
  function copyList(src) {
    var out = [], i, k, o;
    for (i = 0; i < (src || []).length; i++) {
      o = {};
      for (k in src[i]) if (Object.prototype.hasOwnProperty.call(src[i], k)) o[k] = src[i][k];
      out.push(o);
    }
    return out;
  }
  var i, L;
  for (i = 0; i < IDS4.length; i++) {
    L = ST.Levels.register(DEFS[IDS4[i]]);
    L.belts = copyList(DEFS[IDS4[i]].belts);
    L.lasers = copyList(DEFS[IDS4[i]].lasers);
    L.lifts = copyList(DEFS[IDS4[i]].lifts);
  }
  ST.W4_IDS = IDS4;
  ST.W4_DEFS = DEFS;
})();
