/*
 * games/star/levels_w3.js — 《星塵勇者》世界 3「霧沼古樹」四關（3-1 ~ 3-4）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w3 agent（R4 F4-1）｜依賴：levels_w1.js（ST.LevelKit / ST.TILE / ST.Levels.register）
 * 契約：docs/R4_BRIEF.md F4-1、docs/TASKS.md「R4 star W3」
 *
 * 主題（與 W1 草原 / 洞窟 / 天空 / 城堡、W2 礦坑 / 熔岩 / 熔爐都不撞）：
 *   3-1 swamp  毒沼淺灘   開闊沼澤（有天空 / 霧帶 / 遠樹剪影）教學：樹菇 → 孢子雲 → 藤蔓
 *   3-2 swamp  霧中蘆葦道 節奏關 + **螢火暗區**（走進去整組調色盤變暗、螢火繞著主角照明）
 *   3-3 grove  古樹迴廊   樹幹內部：藤蔓鞦韆接力 + 樹菇連段（垂直取向）
 *   3-4 hollow 樹心空洞   魔王前哨（荊棘藤走廊）+ 魔王「樹心魔」（踩樹心 / 藤蔓衝撞兩條打法）
 *
 * ── 節奏與難度（研究 04 §1.6 鋸齒曲線、§5.1 難度曲線）────────────────────
 *   每關「安全區 → 單一新機制 → 機制 + 舊壓力 → 綜合」四段；每關 2 個檢查點。
 *   **每一個機關（樹菇 / 藤蔓 / 孢子雲 / 暗區）都有一條純地形的備援路線**——
 *   毒水坑與無底坑一律 ≤ 8 欄（全速跑跳 80 px = 10 欄）、牆高 ≤ 3 列、
 *   **樹菇與藤蔓一律架在實地上方**（掉下來只是掉回地面，不會死）⇒ 機關是「輕鬆 / 拿得到金幣」那條。
 *
 * ── 刻意不用的既有機關 ──────────────────────────────────────────────────
 *   升降板 movers / 間歇泉 geysers / 蒸氣彈簧 SPRING：前兩者的精靈在 W2 的 CHR 分頁
 *   （W3 用自己的分頁，見 chr_w3.js），彈簧的第二幀磚名（BG_SPRING1）是全域的、不能換皮。
 *   崩塌磚 CRUMBLE 則沿用（換皮成「朽木」），因為它只改名稱表、沒有精靈。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var K = ST.LevelKit;
  if (!K || !ST.Levels || !ST.Levels.register) {
    throw new Error('games/star/levels_w3.js 需要 games/star/levels_w1.js（有 ST.LevelKit）');
  }
  var T = ST.TILE;

  /* ============================================================ ① 三個新主題 */
  // 沼澤 / 樹幹 / 樹心共用的「換皮表」：機關與裝飾磚一次寫好
  function common(o) {
    o[T.PLATFORM] = 'BG_LEAF_M'; o[T.PLAT_L] = 'BG_LEAF_L'; o[T.PLAT_R] = 'BG_LEAF_R';
    o[T.SPIKE] = 'BG_THORNB'; o[T.BUSH] = 'BG_REED';
    o[T.BEAM_T] = 'BG_VT'; o[T.BEAM_B] = 'BG_VB';
    o[T.CRYSTAL] = 'BG_MUSH'; o[T.LAMP] = 'BG_GLOWM';
    o[T.RAIL] = 'BG_ROOTD'; o[T.STAL] = 'BG_HANGR'; o[T.VEIN] = 'BG_BARKV';
    o[T.TREE_T] = 'BG_TRUNK_T'; o[T.TREE_B] = 'BG_TRUNK_B';
    o[T.HILL_L] = 'BG_FTREE_L'; o[T.HILL_M] = 'BG_FTREE_M'; o[T.HILL_R] = 'BG_FTREE_R';
    o[T.CSEA_T] = 'BG_MIST_T'; o[T.CSEA_B] = 'BG_MIST_B';
    o[T.CRUMBLE] = 'BG_ROTW'; o[T.MBG] = 'BG_FOGD';
    return o;
  }
  // 調色盤偏好（16×16 屬性區塊）：毒水走 bg2、金幣 / 機關 / 菇走 bg3、地形與剪影走 bg1
  function pref() {
    var o = {};
    o[T.LAVA] = 2;                                   // 毒水（沿用 LAVA 語意與兩幀動畫，換成綠紫調色盤）
    o[T.COIN] = 3; o[T.QBLOCK] = 3; o[T.USED] = 3;
    o[T.BRICK] = 1; o[T.CRUMBLE] = 1;
    o[T.PLATFORM] = 3; o[T.PLAT_L] = 3; o[T.PLAT_R] = 3;
    o[T.SPIKE] = 1; o[T.CRYSTAL] = 3; o[T.LAMP] = 3;
    o[T.BEAM_T] = 1; o[T.BEAM_B] = 1; o[T.VEIN] = 1; o[T.STAL] = 1; o[T.RAIL] = 1;
    o[T.BUSH] = 1;
    // 遠景（巨樹 / 遠樹剪影 / 霧帶 / 遠霧）走 bg2 的色 1 = 暗紫 ⇒ 與前景地形分層
    o[T.TREE_T] = 2; o[T.TREE_B] = 2;
    o[T.HILL_L] = 2; o[T.HILL_M] = 2; o[T.HILL_R] = 2;
    o[T.CSEA_T] = 2; o[T.CSEA_B] = 2; o[T.MBG] = 2; o[T.CAVEBG] = 1;
    o[T.GEAR] = 3; o[T.FWIN] = 3;
    return o;
  }

  K.addTheme('swamp', {
    from: 'cave',
    override: (function () {
      var o = common({});
      o[T.GROUND] = 'BG_SWTOP'; o[T.DIRT] = 'BG_SWMUD';
      o[T.BLOCK] = 'BG_SWLOG'; o[T.BRICK] = 'BG_SWPLANK'; o[T.CAVEBG] = 'BG_SWBG';
      return o;
    })(),
    pref: pref()
  });
  K.addTheme('grove', {
    from: 'cave',
    override: (function () {
      var o = common({});
      o[T.GROUND] = 'BG_GRTOP'; o[T.DIRT] = 'BG_GRWOOD';
      o[T.BLOCK] = 'BG_KNOT'; o[T.BRICK] = 'BG_SWPLANK'; o[T.CAVEBG] = 'BG_GRBG';
      return o;
    })(),
    pref: pref()
  });
  K.addTheme('hollow', {
    from: 'castle',
    override: (function () {
      var o = common({});
      o[T.GROUND] = 'BG_HOTOP'; o[T.DIRT] = 'BG_HOWOOD';
      o[T.BLOCK] = 'BG_KNOT'; o[T.BRICK] = 'BG_SWPLANK'; o[T.CAVEBG] = 'BG_GRBG';
      o[T.FWIN] = 'BG_HEART'; o[T.GEAR] = 'BG_RING';
      return o;
    })(),
    pref: pref()
  });

  /* ============================================================ ② 3-1 毒沼淺灘 */
  // 10 畫面 / 320 欄；毒水坑 64–69 / 94–101 / 148–153 / 182–189 / 220–225 / 252–259
  // 開闊天空（ceil 0 列）：霧帶 + 遠樹剪影 + 巨樹樹幹
  var L31 = {
    id: '3-1', world: 3, theme: 'swamp', music: 'swamp', cols: 320, groundRow: 24, safeCols: 64,
    floor: '64# 6L 24# 8L 26# 6A 6B 8# 6L 28# 8L 30# 6L 26# 8L 28# 32#',
    ceil: '320.',
    objs: [
      // ---- 背景（全部走 deco / dline / csea ⇒ 只填空格，不影響可達性）------
      { t: 'csea', c: 0, r: 11, w: 320, h: 1 },
      { t: 'hill', c: 10, r: 12 }, { t: 'hill', c: 40, r: 12 }, { t: 'hill', c: 78, r: 12 },
      { t: 'hill', c: 120, r: 12 }, { t: 'hill', c: 166, r: 12 }, { t: 'hill', c: 200, r: 12 },
      { t: 'hill', c: 252, r: 12 }, { t: 'hill', c: 296, r: 12 },
      { t: 'tree', c: 24, r: 11 }, { t: 'tree', c: 25, r: 11 },
      { t: 'tree', c: 96, r: 11 }, { t: 'tree', c: 97, r: 11 },
      { t: 'tree', c: 176, r: 11 }, { t: 'tree', c: 177, r: 11 },
      { t: 'tree', c: 264, r: 11 }, { t: 'tree', c: 265, r: 11 },
      { t: 'dline', c: 0, r: 9, w: 320, k: T.MBG },
      { t: 'bush', c: 16, r: 23, w: 3 }, { t: 'bush', c: 58, r: 23, w: 2 },
      { t: 'bush', c: 108, r: 23, w: 3 }, { t: 'bush', c: 160, r: 23, w: 2 },
      { t: 'bush', c: 212, r: 23, w: 3 }, { t: 'bush', c: 268, r: 23, w: 2 },
      { t: 'deco', c: 32, r: 23, s: '*' }, { t: 'deco', c: 86, r: 23, s: '*' },
      { t: 'deco', c: 144, r: 23, s: '*' }, { t: 'deco', c: 198, r: 23, s: '*' },
      { t: 'deco', c: 246, r: 23, s: '*' }, { t: 'deco', c: 300, r: 23, s: '*' },
      { t: 'deco', c: 20, r: 20, s: 'l' }, { t: 'deco', c: 72, r: 20, s: 'l' },
      { t: 'deco', c: 130, r: 18, s: 'l' }, { t: 'deco', c: 190, r: 20, s: 'l' },
      { t: 'deco', c: 240, r: 20, s: 'l' }, { t: 'deco', c: 290, r: 20, s: 'l' },
      { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },

      // ---- ① 安全教學區（0–63）：金幣 → ? 磚 → 倒木 ----------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: '?' },
      { t: 'coins', c: 26, r: 18, n: 4 },
      { t: 'row', c: 34, r: 20, s: 'B?B' },
      { t: 'rect', c: 46, r: 22, w: 2, h: 2, k: T.BLOCK },

      // ---- ② 樹菇教學（40–60，架在實地上方：掉下來只是掉回地面）----------
      { t: 'coins', c: 40, r: 17, n: 3 },
      { t: 'coins', c: 52, r: 14, n: 3 },
      { t: 'plat', c: 56, r: 16, w: 6 },

      // ---- ③ 第一個毒水坑（64–69，6 欄）+ 朽木橋 -------------------------
      { t: 'crumble', c: 64, r: 23, w: 6 },
      { t: 'coins', c: 64, r: 21, n: 3 },
      { t: 'row', c: 78, r: 20, s: '?BB?' },

      // ---- ④ 8 欄坑（94–101）：上面有落葉平台（備援：直接跑跳也過得去）--
      { t: 'plat', c: 88, r: 20, w: 4 },
      { t: 'coins', c: 96, r: 17, n: 3 },
      { t: 'row', c: 110, r: 20, s: 'B?B' },
      { t: 'rect', c: 120, r: 22, w: 2, h: 2, k: T.BLOCK },

      // ---- ⑤ 孢子雲教學（106–126，開闊段，閃得過）-----------------------
      { t: 'coins', c: 114, r: 15, n: 4 },

      // ---- ⑥ 藤蔓教學（128–147 的兩階台地 → 高台金幣）-------------------
      { t: 'plat', c: 136, r: 15, w: 8 },
      { t: 'coins', c: 137, r: 13, n: 4 },
      { t: 'row', c: 142, r: 19, s: '?' },

      // ---- ⑦ 綜合段 ------------------------------------------------------
      { t: 'crumble', c: 148, r: 23, w: 6 },
      { t: 'plat', c: 160, r: 19, w: 6 }, { t: 'coins', c: 161, r: 17, n: 3 },
      { t: 'row', c: 172, r: 20, s: 'B?B' },
      { t: 'plat', c: 196, r: 18, w: 6 }, { t: 'coins', c: 197, r: 16, n: 3 },
      { t: 'rect', c: 206, r: 22, w: 2, h: 2, k: T.BLOCK },

      // ---- ⑧ 藤蔓 → 高台上的無敵星 --------------------------------------
      { t: 'plat', c: 208, r: 14, w: 10 },
      { t: 'coins', c: 209, r: 12, n: 4 },

      { t: 'crumble', c: 220, r: 23, w: 6 },
      { t: 'row', c: 234, r: 20, s: '?BB?' },
      { t: 'plat', c: 244, r: 19, w: 6 }, { t: 'coins', c: 245, r: 17, n: 3 },
      { t: 'crumble', c: 252, r: 23, w: 8 },
      { t: 'coins', c: 264, r: 20, n: 4 },
      { t: 'plat', c: 276, r: 18, w: 6 }, { t: 'coins', c: 277, r: 16, n: 3 },

      // ---- ⑨ 旗桿 --------------------------------------------------------
      { t: 'pole', c: 300, r: 12 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 300, row: 20 },
    checkpoints: [102, 190],
    // 會縮的樹菇（三座，全部在實地上方；period 192 = 在 128 幀 / 不在 64 幀）
    caps: [
      { c: 44, r: 19, w: 3, period: 192, on: 128, phase: 0 },
      { c: 48, r: 16, w: 3, period: 192, on: 128, phase: 64 },
      { c: 124, r: 17, w: 4, period: 192, on: 128, phase: 0 }
    ],
    // 藤蔓鞦韆（兩條；按 ↑ 抓、按 A 放手）
    vines: [
      { c: 132, r: 9, len: 48, range: 40, period: 160, phase: 0 },
      { c: 212, r: 9, len: 56, range: 40, period: 160, phase: 0 }
    ],
    // 孢子雲（會移動的危險；都在開闊段，蹲著 / 繞路都閃得過）
    spores: [
      { c: 112, r: 19, axis: 'x', range: 48, period: 240, phase: 0 },
      { c: 230, r: 18, axis: 'y', range: 40, period: 240, phase: 60 }
    ],
    items: [
      { c: 212, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 44, kind: 'roller', dir: -1 },
      { col: 76, kind: 'leaper' },
      { col: 106, kind: 'roller', dir: -1, edge: true },
      { col: 118, kind: 'thorn' },
      { col: 144, kind: 'leaper' },
      { col: 158, kind: 'bouncer' },
      { col: 176, kind: 'roller', dir: -1, edge: true },
      { col: 196, kind: 'thorn' },
      { col: 212, kind: 'leaper' },
      { col: 238, kind: 'wisp', y: 120 },
      { col: 248, kind: 'roller', dir: -1, edge: true },
      { col: 268, kind: 'leaper' },
      { col: 288, kind: 'roller', dir: -1 }
    ]
  };

  /* ============================================================ ③ 3-2 霧中蘆葦道 */
  // 10 畫面 / 320 欄；毒水坑 32–37 / 60–67 / 92–97 / 138–145 / 172–179 / 204–209 / 236–243
  // 118–131 是「下沉的低地」（掉下去不會死，走得回來）；140–230 是螢火暗區
  var L32 = {
    id: '3-2', world: 3, theme: 'swamp', music: 'swamp', cols: 320, groundRow: 24, safeCols: 32,
    floor: '32# 6L 22# 8L 24# 6L 20# 6a 8b 6# 8L 26# 8L 24# 6L 26# 8L 30# 46#',
    ceil: '320.',
    objs: [
      { t: 'csea', c: 0, r: 11, w: 320, h: 1 },
      { t: 'hill', c: 8, r: 12 }, { t: 'hill', c: 48, r: 12 }, { t: 'hill', c: 92, r: 12 },
      { t: 'hill', c: 136, r: 12 }, { t: 'hill', c: 182, r: 12 }, { t: 'hill', c: 228, r: 12 },
      { t: 'hill', c: 272, r: 12 }, { t: 'hill', c: 308, r: 12 },
      { t: 'tree', c: 44, r: 11 }, { t: 'tree', c: 45, r: 11 },
      { t: 'tree', c: 148, r: 11 }, { t: 'tree', c: 149, r: 11 },
      { t: 'tree', c: 252, r: 11 }, { t: 'tree', c: 253, r: 11 },
      { t: 'dline', c: 0, r: 9, w: 320, k: T.MBG },
      { t: 'dline', c: 140, r: 10, w: 92, k: T.MBG },
      { t: 'bush', c: 12, r: 23, w: 3 }, { t: 'bush', c: 74, r: 23, w: 3 },
      { t: 'bush', c: 150, r: 23, w: 2 }, { t: 'bush', c: 190, r: 23, w: 3 },
      { t: 'bush', c: 252, r: 23, w: 2 }, { t: 'bush', c: 300, r: 23, w: 3 },
      { t: 'deco', c: 24, r: 23, s: '*' }, { t: 'deco', c: 80, r: 23, s: '*' },
      { t: 'deco', c: 160, r: 23, s: '*' }, { t: 'deco', c: 196, r: 23, s: '*' },
      { t: 'deco', c: 224, r: 23, s: '*' }, { t: 'deco', c: 290, r: 23, s: '*' },
      { t: 'deco', c: 144, r: 20, s: 'l' }, { t: 'deco', c: 170, r: 20, s: 'l' },
      { t: 'deco', c: 200, r: 20, s: 'l' }, { t: 'deco', c: 228, r: 20, s: 'l' },
      { t: 'dline', c: 0, r: 23, w: 320, k: T.RAIL },

      // ---- ① 起跑 + 朽木橋 ----------------------------------------------
      { t: 'coins', c: 12, r: 20, n: 4 },
      { t: 'row', c: 22, r: 20, s: 'B?B' },
      { t: 'crumble', c: 32, r: 23, w: 6 },
      { t: 'coins', c: 32, r: 21, n: 3 },

      // ---- ② 樹菇連段（46–58，架在實地上）------------------------------
      { t: 'coins', c: 46, r: 17, n: 3 },
      { t: 'coins', c: 54, r: 14, n: 3 },
      { t: 'plat', c: 50, r: 19, w: 4 },

      { t: 'crumble', c: 60, r: 23, w: 8 },
      { t: 'coins', c: 60, r: 21, n: 4 },
      { t: 'row', c: 76, r: 20, s: '?BB?' },

      // ---- ③ 低地（118–131）：掉下來不會死，爬 2 列就回來 ---------------
      { t: 'coins', c: 100, r: 20, n: 4 },
      { t: 'plat', c: 108, r: 18, w: 6 }, { t: 'coins', c: 109, r: 16, n: 3 },
      { t: 'coins', c: 120, r: 22, n: 4 },
      { t: 'rect', c: 128, r: 24, w: 2, h: 2, k: T.BLOCK },

      // ---- ④ 暗區（140–230）：螢火照明；藤蔓 + 樹菇 + 鬼火 --------------
      { t: 'crumble', c: 138, r: 23, w: 8 },
      { t: 'plat', c: 152, r: 19, w: 6 }, { t: 'coins', c: 153, r: 17, n: 3 },
      { t: 'row', c: 162, r: 20, s: 'B?B' },
      { t: 'crumble', c: 172, r: 23, w: 8 },
      { t: 'plat', c: 186, r: 18, w: 8 }, { t: 'coins', c: 187, r: 16, n: 4 },
      { t: 'rect', c: 198, r: 22, w: 2, h: 2, k: T.BLOCK },
      { t: 'plat', c: 212, r: 14, w: 10 },
      { t: 'coins', c: 213, r: 12, n: 5 },
      { t: 'crumble', c: 204, r: 23, w: 6 },

      // ---- ⑤ 出暗區 + 綜合段 --------------------------------------------
      { t: 'row', c: 226, r: 20, s: '?BB?' },
      { t: 'crumble', c: 236, r: 23, w: 8 },
      { t: 'plat', c: 252, r: 19, w: 6 }, { t: 'coins', c: 253, r: 17, n: 3 },
      { t: 'row', c: 266, r: 20, s: 'B?B' },
      { t: 'coins', c: 278, r: 20, n: 4 },
      { t: 'plat', c: 286, r: 18, w: 6 }, { t: 'coins', c: 287, r: 16, n: 3 },
      { t: 'pole', c: 304, r: 12 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 304, row: 20 },
    checkpoints: [100, 196],
    caps: [
      { c: 44, r: 19, w: 3, period: 192, on: 128, phase: 0 },
      { c: 52, r: 16, w: 3, period: 192, on: 128, phase: 64 },
      { c: 146, r: 17, w: 4, period: 192, on: 128, phase: 0 },
      { c: 196, r: 19, w: 4, period: 192, on: 128, phase: 96 }   // fix-r4 P3-2：r16→19（讓開兩條藤蔓結的掃描線）
    ],
    vines: [
      { c: 182, r: 9, len: 48, range: 40, period: 160, phase: 0 },
      { c: 216, r: 9, len: 56, range: 36, period: 160, phase: 80 }
    ],
    spores: [
      { c: 86, r: 19, axis: 'x', range: 48, period: 240, phase: 0 },
      { c: 166, r: 18, axis: 'y', range: 40, period: 240, phase: 0 },
      { c: 246, r: 19, axis: 'x', range: 56, period: 240, phase: 120 }
    ],
    // 螢火暗區（純視覺：調色盤換暗版 + 螢火繞著主角）
    glooms: [
      { c0: 150, c1: 172, flies: 2 }   // fix-r4 P3-2：暗區縮到兩座 w=4 樹菇與藤蔓之間、螢火 3→2
      // （螢火永遠繞著主角 ⇒ 一定跟主角同掃描線；暗區與 4 格樹菇 / 藤蔓結重疊時每線就爆 10）
    ],
    items: [
      { c: 216, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 24, kind: 'roller', dir: -1 },
      { col: 48, kind: 'leaper' },
      { col: 70, kind: 'roller', dir: -1, edge: true },
      { col: 86, kind: 'thorn' },
      { col: 104, kind: 'leaper' },
      { col: 122, kind: 'bouncer' },
      { col: 150, kind: 'wisp', y: 112 },
      { col: 164, kind: 'leaper' },
      { col: 178, kind: 'thorn' },
      { col: 192, kind: 'wisp', y: 128 },
      { col: 208, kind: 'leaper' },
      { col: 222, kind: 'roller', dir: -1, edge: true },
      { col: 234, kind: 'thorn' },
      { col: 258, kind: 'leaper' },
      { col: 272, kind: 'wisp', y: 120 },
      { col: 294, kind: 'roller', dir: -1 }
    ]
  };

  /* ============================================================ ④ 3-3 古樹迴廊 */
  // 9 畫面 / 288 欄；樹幹內部（有天花板）；無底坑 32–37 / 60–67 / 92–97 / 124–131 /
  // 154–159 / 188–195 / 220–225
  var L33 = {
    id: '3-3', world: 3, theme: 'grove', music: 'grove', cols: 288, groundRow: 24, safeCols: 32,
    floor: '32# 6. 22# 8. 24# 6. 26# 8. 22# 6. 28# 8. 24# 6. 26# 36#',
    ceil: '48# 10C 30# 12D 36# 10C 40# 12D 44# 46#',
    objs: [
      { t: 'dline', c: 0, r: 9, w: 288, k: T.VEIN },
      { t: 'dline', c: 0, r: 23, w: 288, k: T.RAIL },
      { t: 'stal', c: 20, r: 10, w: 2 }, { t: 'stal', c: 74, r: 10, w: 2 },
      { t: 'stal', c: 128, r: 13, w: 2 }, { t: 'stal', c: 182, r: 10, w: 2 },
      { t: 'stal', c: 240, r: 10, w: 2 },
      { t: 'beam', c: 28, r: 11 }, { t: 'beam', c: 84, r: 11 }, { t: 'beam', c: 140, r: 11 },
      { t: 'beam', c: 196, r: 11 }, { t: 'beam', c: 252, r: 11 },
      { t: 'deco', c: 16, r: 12, s: 'l' }, { t: 'deco', c: 66, r: 12, s: 'l' },
      { t: 'deco', c: 116, r: 12, s: 'l' }, { t: 'deco', c: 168, r: 12, s: 'l' },
      { t: 'deco', c: 222, r: 12, s: 'l' }, { t: 'deco', c: 270, r: 12, s: 'l' },
      { t: 'deco', c: 24, r: 23, s: '*' }, { t: 'deco', c: 78, r: 23, s: '*' },
      { t: 'deco', c: 136, r: 23, s: '*' }, { t: 'deco', c: 200, r: 23, s: '*' },
      { t: 'deco', c: 262, r: 23, s: '*' },
      { t: 'dline', c: 0, r: 14, w: 288, k: T.CAVEBG },

      // ---- ① 安全區 + 第一個洞（32–37）---------------------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: 'B?B' },
      { t: 'plat', c: 32, r: 21, w: 6 },
      { t: 'coins', c: 33, r: 19, n: 3 },

      // ---- ② 藤蔓接力（44–90）：兩條藤蔓 + 中間落腳平台 -----------------
      { t: 'plat', c: 44, r: 19, w: 6 }, { t: 'coins', c: 45, r: 17, n: 3 },
      { t: 'plat', c: 56, r: 16, w: 8 }, { t: 'coins', c: 57, r: 14, n: 4 },
      { t: 'row', c: 70, r: 20, s: '?BB?' },
      { t: 'plat', c: 80, r: 18, w: 6 }, { t: 'coins', c: 81, r: 16, n: 3 },
      { t: 'plat', c: 92, r: 21, w: 6 },

      // ---- ③ 樹菇連段（100–132）----------------------------------------
      { t: 'coins', c: 100, r: 18, n: 3 },
      { t: 'coins', c: 110, r: 15, n: 3 },
      { t: 'plat', c: 114, r: 17, w: 6 },
      { t: 'coins', c: 122, r: 20, n: 3 },
      { t: 'plat', c: 124, r: 21, w: 8 },

      // ---- ④ 朽木 + 洞 --------------------------------------------------
      { t: 'crumble', c: 154, r: 23, w: 6 },
      { t: 'plat', c: 144, r: 19, w: 6 }, { t: 'coins', c: 145, r: 17, n: 3 },
      { t: 'row', c: 166, r: 20, s: 'B?B' },
      { t: 'plat', c: 176, r: 18, w: 8 }, { t: 'coins', c: 177, r: 16, n: 4 },
      { t: 'plat', c: 188, r: 21, w: 8 },
      { t: 'rect', c: 200, r: 22, w: 2, h: 2, k: T.BLOCK },

      // ---- ⑤ 綜合段 + 無敵星 -------------------------------------------
      { t: 'plat', c: 206, r: 14, w: 10 }, { t: 'coins', c: 207, r: 12, n: 4 },
      { t: 'plat', c: 220, r: 21, w: 6 },
      { t: 'plat', c: 232, r: 19, w: 6 }, { t: 'coins', c: 233, r: 17, n: 3 },
      { t: 'row', c: 244, r: 20, s: '?BB?' },
      { t: 'coins', c: 256, r: 20, n: 4 },
      { t: 'plat', c: 264, r: 18, w: 6 }, { t: 'coins', c: 265, r: 16, n: 3 },
      { t: 'pole', c: 278, r: 12 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 278, row: 20 },
    checkpoints: [100, 180],
    caps: [
      { c: 102, r: 20, w: 3, period: 192, on: 128, phase: 0 },
      { c: 106, r: 17, w: 3, period: 192, on: 128, phase: 64 },
      { c: 118, r: 18, w: 3, period: 192, on: 128, phase: 32 },  // fix-r4 P3-2：r20→18
      { c: 212, r: 19, w: 4, period: 192, on: 128, phase: 0 },   // fix-r4 P3-2：r17→19（讓開藤蔓結那幾條線）
      { c: 240, r: 16, w: 4, period: 192, on: 128, phase: 96 }
    ],
    vines: [
      { c: 50, r: 10, len: 48, range: 36, period: 160, phase: 0 },
      { c: 76, r: 10, len: 56, range: 40, period: 160, phase: 80 },
      { c: 210, r: 10, len: 48, range: 36, period: 160, phase: 40 }
    ],
    spores: [
      { c: 70, r: 18, axis: 'y', range: 40, period: 240, phase: 0 },
      { c: 140, r: 19, axis: 'x', range: 48, period: 240, phase: 60 },
      { c: 198, r: 18, axis: 'y', range: 48, period: 240, phase: 120 },
      { c: 252, r: 19, axis: 'x', range: 40, period: 240, phase: 0 }
    ],
    items: [
      { c: 208, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 46, kind: 'leaper' },
      { col: 58, kind: 'wisp', y: 112 },
      { col: 72, kind: 'roller', dir: -1, edge: true },
      { col: 84, kind: 'thorn' },
      { col: 100, kind: 'leaper' },
      { col: 114, kind: 'bouncer' },
      { col: 134, kind: 'thorn' },
      { col: 146, kind: 'leaper' },
      { col: 168, kind: 'wisp', y: 96 },     // fix-r4 P3-2：y128→96（別跟樹菇 / 藤蔓結同線）
      { col: 178, kind: 'roller', dir: -1, edge: true },
      { col: 202, kind: 'thorn' },
      { col: 230, kind: 'leaper' },
      { col: 244, kind: 'wisp', y: 120 },
      { col: 262, kind: 'roller', dir: -1 }
    ]
  };

  /* ============================================================ ⑤ 3-4 樹心空洞 */
  // 8 畫面 / 256 欄；毒水坑 32–39 / 62–67 / 92–99 / 160–167，無底坑 126–131
  // 198–255 是魔王場（實地、無毒水：被打退也不會直接掉下去）
  var L34 = {
    id: '3-4', world: 3, theme: 'hollow', music: 'hollow', cols: 256, groundRow: 24, safeCols: 32,
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
      { t: 'deco', c: 40, r: 20, s: 'l' }, { t: 'deco', c: 96, r: 20, s: 'l' },
      { t: 'deco', c: 150, r: 20, s: 'l' }, { t: 'deco', c: 206, r: 20, s: 'l' },
      { t: 'beam', c: 58, r: 11 }, { t: 'beam', c: 134, r: 11 }, { t: 'beam', c: 194, r: 11 },
      { t: 'dline', c: 0, r: 14, w: 256, k: T.CAVEBG },
      { t: 'deco', c: 34, r: 23, s: '*' }, { t: 'deco', c: 104, r: 23, s: '*' },
      { t: 'deco', c: 176, r: 23, s: '*' }, { t: 'deco', c: 240, r: 23, s: '*' },

      // ---- ① 起跑 + 毒水坑（都有落葉平台）------------------------------
      { t: 'coins', c: 10, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: 'B?B' },
      { t: 'plat', c: 32, r: 21, w: 8 }, { t: 'coins', c: 33, r: 19, n: 4 },
      { t: 'plat', c: 62, r: 21, w: 6 }, { t: 'coins', c: 63, r: 19, n: 3 },
      { t: 'row', c: 74, r: 20, s: '?BB?' },
      { t: 'plat', c: 92, r: 21, w: 8 }, { t: 'coins', c: 93, r: 19, n: 4 },

      // ---- ② 荊棘藤走廊（100–160）：伸刺時不可踩，等它收起或繞上去 ------
      { t: 'rect', c: 106, r: 22, w: 2, h: 2, k: T.BLOCK },
      { t: 'plat', c: 112, r: 19, w: 8 }, { t: 'coins', c: 113, r: 17, n: 4 },
      { t: 'plat', c: 118, r: 14, w: 10 }, { t: 'coins', c: 119, r: 12, n: 5 },
      { t: 'crumble', c: 126, r: 23, w: 6 },
      { t: 'rect', c: 138, r: 22, w: 2, h: 2, k: T.BLOCK },
      { t: 'plat', c: 144, r: 19, w: 8 }, { t: 'coins', c: 145, r: 17, n: 4 },
      { t: 'plat', c: 160, r: 21, w: 8 }, { t: 'coins', c: 161, r: 19, n: 4 },

      // ---- ③ 魔王前哨（168–196）----------------------------------------
      { t: 'row', c: 172, r: 20, s: 'B?B' },
      { t: 'rect', c: 184, r: 20, w: 2, h: 4, k: T.BLOCK },
      { t: 'coins', c: 176, r: 20, n: 4 },

      // ---- ④ 魔王場（198–255）：兩側樹瘤當牆，中間淨空，盡頭旗桿 -------
      { t: 'rect', c: 198, r: 20, w: 2, h: 4, k: T.BLOCK },
      { t: 'coins', c: 208, r: 20, n: 4 },
      { t: 'deco', c: 236, r: 20, s: 'w' },
      { t: 'pole', c: 246, r: 12 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 246, row: 20 },
    checkpoints: [100, 172],
    bossKind: 'treelord',
    boss: { col: 226, x: 226 * 8, y: 160 },
    caps: [
      { c: 108, r: 17, w: 4, period: 192, on: 128, phase: 0 },
      { c: 140, r: 17, w: 4, period: 192, on: 128, phase: 96 }
    ],
    // 魔王房的兩條藤蔓 = 魔王第二打法（藤蔓衝撞一次 2 格血）
    vines: [
      { c: 120, r: 9, len: 48, range: 36, period: 160, phase: 0 },
      { c: 206, r: 10, len: 56, range: 40, period: 160, phase: 0 },
      { c: 232, r: 10, len: 56, range: 40, period: 160, phase: 80 }
    ],
    spores: [
      { c: 46, r: 18, axis: 'x', range: 40, period: 240, phase: 0 },   // 離毒水坑（62–67）的助跑段遠一點
      { c: 152, r: 18, axis: 'y', range: 40, period: 240, phase: 60 },
      { c: 190, r: 19, axis: 'x', range: 32, period: 240, phase: 120 }
    ],
    items: [
      { c: 120, r: 12, kind: 'star' }
    ],
    spawns: [
      { col: 22, kind: 'roller', dir: -1 },
      { col: 46, kind: 'leaper' },
      { col: 56, kind: 'wisp', y: 112 },
      { col: 74, kind: 'roller', dir: -1, edge: true },
      { col: 86, kind: 'leaper' },
      { col: 104, kind: 'thorn' },
      { col: 116, kind: 'wisp', y: 128 },
      { col: 134, kind: 'thorn' },
      { col: 162, kind: 'leaper' },        // fix-r4 P3-2：142→162（同屏地面敵 3→2）
      { col: 152, kind: 'roller', dir: -1, edge: true },
      { col: 170, kind: 'thorn' },
      { col: 178, kind: 'wisp', y: 120 },
      { col: 188, kind: 'leaper' }
    ]
  };

  /* ============================================================ ⑥ 註冊 */
  var IDS3 = ['3-1', '3-2', '3-3', '3-4'];
  var DEFS = { '3-1': L31, '3-2': L32, '3-3': L33, '3-4': L34 };
  function copyOf(o) { var out = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k]; return out; }
  function carry(L, def, key) {
    var src = def[key] || [], out = [], i;
    for (i = 0; i < src.length; i++) out.push(copyOf(src[i]));
    L[key] = out;
    return out;
  }
  var i, L, def;
  for (i = 0; i < IDS3.length; i++) {
    def = DEFS[IDS3[i]];
    L = ST.Levels.register(def);
    // levels_w1.js 的 Level 只搬 movers / geysers / items（R3 的契約），
    // W3 的四種機關自己掛到 Level 上（objects_w3.js / test_w3.py 讀 level.caps…）
    carry(L, def, 'caps'); carry(L, def, 'vines'); carry(L, def, 'spores'); carry(L, def, 'glooms');
  }
  ST.W3_IDS = IDS3;
  ST.W3_DEFS = DEFS;
})();
