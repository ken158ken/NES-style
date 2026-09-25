/*
 * games/cruiser/stages.js — 《星塵巡航艦》R3：六關的**資料定義**（CR.STAGES）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-stages agent（R3）｜ 依賴：engine/{fixed,shmup}.js、games/cruiser/enemies.js
 * 執行邏輯全部在 `stage_runtime.js`（CR.stage）；本檔**只有資料**：
 *   地形 RLE / 主題磚對應 / 調色盤編號 / 難度參數 / 出怪表 / 魔王 key / 音樂 key。
 *
 * 一份關卡定義 = {
 *   index, key, name, music, boss,        // boss = CR.Bosses 的 key
 *   cols,                                 // 世界欄數（camMax = (cols - 32) * 8）
 *   minFree,                              // 通道最窄下限（列）；terrain 的 ceil + floor <= 26 - minFree
 *   terrain: [[欄數, 天花板列數, 地板列數], …]   // 總和 = cols
 *   tiles: { bg, star1, star2, ceilBot, floorTop, wall, wall2, fill, pipe, pipeH, lamp, bossBg, grid }
 *   bigRocks: [[欄, 列], …]               // 16x16 大隕石（地形）
 *   bossCol0,                             // 魔王室起始欄（相機到底後魔王進場）
 *   speedZones: [[欄0, 欄1, 速度 8.8], …]  // 減速 / 加速段（關卡 4 的「倒立世界」用）
 *   params: { bulletScale, period, easyPeriod, easyCol0, easyCol1, maxAlive },
 *   waves(stage, A): [{col, fn, gun}]     // A = 本檔的出怪小工具（見 makeApi）
 * }
 *
 * ── 難度曲線（一張表，不要散在程式裡）──────────────────────────────────────
 * | 關 | 敵彈倍率 | 砲台週期 | 同屏上限 | 通道下限 | 長度 px |
 * |---|---|---|---|---|---|
 * | 1 | 1.00 | 90（要塞段 130） | 10 | 18 列 | 2816 |
 * | 2 | 1.05 | 120 | 11 | 18 列 | 2560 |
 * | 3 | 1.10 | 112 | 12 | 18 列 | 2816 |
 * | 4 | 1.15 | 104 | 12 | 17 列 | 2688 |
 * | 5 | 1.20 |  96 | 13 | 17 列 | 2944 |
 * | 6 | 1.30 |  88 | 14 | 16 列 | 3072 |
 * 第二輪（loop）再由 runtime 乘 LOOP_SCALE（彈速 +8% / 週期 -8% 每輪，各有上下限）。
 *
 * ── 檢查點安全規則（fix2 訂的，六關通用；runtime 會**自動過濾**違規事件）──
 *   ① 每個檢查點之後 22 欄內不放「固定砲」（turret / turret4 / crawl / moai）
 *   ② 每個檢查點之後 14 欄內至少一隻**紅色單體**（1 發必掉膠囊）＝ 死亡後的回血路徑
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/cruiser/stages.js 需要 engine/fixed.js');
  if (!CR.Enemies) throw new Error('games/cruiser/stages.js 需要 enemies.js 先載入');

  var E = CR.Enemies;
  var SPEED_DEFAULT = FX.v88(0, 128);          // 0.5 px/幀（研究 16 §10）
  var SPEED_SLOW = FX.v88(0, 64);              // 0.25 px/幀（關卡 4 的減速段）
  var GUN_KINDS = { turret: 1, turret4: 1, crawl: 1, moai: 1 };

  /* ==================================================== 出怪小工具（六關共用） */
  // 所有 fn 的簽章都是 Spawner 的 `fn(ctx, col, entry)`（ctx = stage）。
  // 標了 `.gun = true` 的會被檢查點安全規則過濾。
  function makeApi(stage) {
    function gun(f) { f.gun = true; return f; }
    var A = {
      // ---- 舊敵人（關卡 1 已驗收的手感）----
      fan: function (y, n) { return function () { E.spawnFan(272, y, n ? { n: n } : undefined); }; },
      zig: function (y, dir, red) {
        return function () { E.spawn('zig', 268, y, { dir: dir, drop: red ? 1 : 0 }); };
      },
      redzig: function (y) { return A.zig(y, 1, true); },
      zigs: function (list, redIdx) {
        if (redIdx === undefined) redIdx = -1;
        return function () {
          for (var i = 0; i < list.length; i++) {
            E.spawn('zig', 268 + i * 10, list[i], { dir: (i & 1) ? -1 : 1, drop: (i === redIdx) ? 1 : 0 });
          }
        };
      },
      tank: function (y, red) { return function () { E.spawn('tank', 268, y, red ? { drop: 1 } : {}); }; },
      rocks: function (list) {
        return function () { for (var i = 0; i < list.length; i++) E.spawn('rock', 268 + i * 12, list[i], {}); };
      },
      turret: function (ceiling) {
        return gun(function (c, col) { stage.spawnAtSurface(col + 34, ceiling, 'turret'); });
      },
      // ---- R3 新敵人 ----
      lava: function (dx) {                       // 火山彈（噴發口貼地板，持續噴）
        return function (c, col) { stage.spawnAtSurface(col + 34 + (dx || 0), false, 'lava'); };
      },
      lavas: function (offs) {
        return function (c, col) {
          for (var i = 0; i < offs.length; i++) stage.spawnAtSurface(col + 34 + offs[i], false, 'lava');
        };
      },
      crawl: function (ceiling) {
        return gun(function (c, col) { stage.spawnAtSurface(col + 34, ceiling, 'crawl'); });
      },
      moai: function (ceiling) {                  // 石像：本體無敵，只有嘴可打
        return gun(function (c, col) { stage.spawnMoaiAt(col + 34, ceiling); });
      },
      splits: function (list) {
        return function () { for (var i = 0; i < list.length; i++) E.spawn('split', 268 + i * 14, list[i], {}); };
      },
      homings: function (list) {
        return function () { for (var i = 0; i < list.length; i++) E.spawn('homing', 270 + i * 10, list[i], {}); };
      },
      tent: function (ceiling, opt) {
        return function (c, col) { stage.spawnAtSurface(col + 34, ceiling, 'tent', opt || {}); };
      },
      eggs: function (list) {
        return function (c, col) {
          for (var i = 0; i < list.length; i++) {
            E.spawn('egg', 268, list[i], { wx: (col + 34) * 8 });
          }
        };
      },
      // 可破壞岩壁：在同一欄疊 n 塊 16x16，rows 是「留下來的缺口列」以外的位置
      bricks: function (rows) {
        return function (c, col) {
          for (var i = 0; i < rows.length; i++) {
            E.spawn('brick', 268, rows[i] * 8, { wx: (col + 34) * 8 });
          }
        };
      },
      turret4: function (y) {
        return gun(function (c, col) { E.spawn('turret4', 268, y, { wx: (col + 34) * 8 }); });
      }
    };
    return A;
  }

  /* ==================================================== 出怪表產生器（共用骨架） */
  // ① 空戰段（研究 §7-1）：純補給，**零固定砲**；fan 編隊 + 紅色單體交替
  // ② 主題段：由各關的 theme(at, A, stage) 自己排
  // ③ 每個檢查點 +4 欄補一隻紅色單體（安全規則②）
  // ④ 魔王前補給 + 呼吸區
  function buildWaves(stage, A, def) {
    var T = [], i, c, k = 0;
    function at(col, fn) {
      col = col | 0;
      if (col < 0 || col >= stage.COLS) return;
      T.push({ col: col, fn: fn, gun: !!fn.gun });
    }
    var airEnd = def.airEnd;
    for (c = 10; c < airEnd; c += 7) {
      if (k & 1) at(c, A.redzig(56 + ((k * 23) % 88)));       // 紅色單體（必掉膠囊）
      else at(c, A.fan(56 + ((k * 31) % 80)));                // fan 編隊（全滅掉膠囊）
      k++;
    }
    def.theme(at, A, stage, def);
    for (i = 0; i < stage.CHECKPOINTS.length; i++) {
      var K = stage.CHECKPOINTS[i] >> 3;
      if (K > 0 && K + 4 < def.bossCol0 + 10) at(K + 4, A.redzig(64 + ((i * 29) % 80)));
    }
    at(def.bossCol0 + 6, A.fan(96));                          // 魔王前最後補給（必掉）
    // 安全規則①：檢查點之後 22 欄內不放固定砲 —— 直接濾掉，讓規則永遠成立
    T = T.filter(function (e) {
      if (!e.gun) return true;
      for (var j = 0; j < stage.CHECKPOINTS.length; j++) {
        var kk = stage.CHECKPOINTS[j] >> 3;
        if (e.col >= kk && e.col < kk + 22) return false;
      }
      return true;
    });
    T.sort(function (a, b) { return a.col - b.col; });
    return T;
  }

  /* ==================================================== 主題磚對應（只換調色盤的關共用同一套） */
  var TIL_SPACE = {
    bg: 'SPACE', star1: 'STARA', star2: 'STARB',
    ceilBot: 'CEIL_BOT', floorTop: 'FLOOR_TOP', wall: 'WALL', wall2: 'WALL2',
    fill: 'SOLID', pipe: 'PIPE', pipeH: 'PIPEH', lamp: 'LAMP',
    bossBg: 'BOSSBG', grid: 'GRID'
  };
  function tiles(over) {
    var o = {}, k;
    for (k in TIL_SPACE) if (TIL_SPACE.hasOwnProperty(k)) o[k] = TIL_SPACE[k];
    for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    return o;
  }

  /* ==================================================== 關卡 1（原封不動） */
  // fix3 三段式（空戰段 / 小行星帶 / 星際要塞 / 核心室）是機器人 0 死通關的回歸基準，
  // 地形 RLE、大隕石表、出怪表全部**原樣搬過來**，一個數字都沒有改。
  var S1 = {
    index: 1, key: 'belt', name: 'ASTEROID BELT', music: 'stage1', boss: 'core',
    cols: 384, minFree: 18, bossCol0: 320,
    terrain: [
      [192, 0, 0],
      [56, 0, 0],
      [8, 0, 1], [8, 1, 2], [8, 2, 3],
      [8, 3, 3], [8, 3, 5], [8, 5, 3], [8, 3, 3], [8, 4, 4], [8, 3, 3],
      [64, 3, 3]
    ],
    tiles: tiles(null),
    bigRocks: [
      [196, 2], [202, 22], [208, 0], [214, 24],
      [220, 2], [220, 22], [226, 24], [232, 0],
      [238, 22], [238, 2], [244, 24]
    ],
    marks: { AIR_COLS: 192, BELT_COL0: 192, BELT_COL1: 247, FORT_COL0: 248, BOSS_COL0: 320 },
    params: { bulletScale: 256, period: 90, easyPeriod: 130, easyCol0: 248, easyCol1: 383, maxAlive: 10 },
    speedZones: null,
    // 關卡 1 的出怪表是 enemies.js 的 buildTable（fix3 驗收過的那一份），不走 buildWaves
    waves: function (stage) { return E.buildTable(stage); }
  };

  /* ==================================================== 關卡 2：火山星 */
  var S2 = {
    index: 2, key: 'volcano', name: 'VOLCANO', music: 'stage2', boss: 'eye',
    cols: 352, minFree: 18, bossCol0: 288, airEnd: 96,
    terrain: [
      [96, 0, 0],                                             // 空戰段（火山星軌道）
      [16, 0, 2], [16, 1, 3], [16, 2, 4], [16, 3, 5],         // 降落：地面隆起
      [12, 4, 4], [12, 2, 6], [12, 5, 3], [12, 3, 5],
      [12, 4, 4], [12, 2, 6], [12, 5, 3], [12, 3, 5],         // 熔岩原（起伏劇烈，和 <= 8 列）
      [16, 3, 3], [16, 2, 4],                                 // 進魔王室
      [64, 3, 3]
    ],
    tiles: tiles({ floorTop: 'LAVA', fill: 'ROCKW', pipe: 'LAVA2', wall: 'ROCKW' }),
    bigRocks: [],
    params: { bulletScale: 269, period: 120, easyPeriod: 120, easyCol0: -1, easyCol1: -1, maxAlive: 11 },
    speedZones: null,
    theme: function (at, A) {
      // 主題：噴發的火山彈（不可破壞）+ 貼牆爬行砲 + 之字機
      var c;
      for (c = 100; c < 280; c += 14) at(c, A.lavas((c % 28 === 0) ? [0, 10] : [4]));
      for (c = 104; c < 276; c += 18) at(c, A.crawl((c % 36 === 0)));
      at(110, A.zigs([64, 128]));
      at(122, A.fan(80));
      at(134, A.tank(96));
      at(152, A.zigs([56, 104, 144], 1));
      at(160, A.turret(false));
      at(168, A.fan(120));
      at(176, A.turret(true));
      at(186, A.tank(72, true));
      at(196, A.fan(64));
      at(206, A.zigs([72, 136]));
      at(218, A.turret(false));
      at(226, A.fan(112));
      at(234, A.tank(128));
      at(244, A.zigs([48, 96, 140], 2));
      at(252, A.turret(true));
      at(262, A.fan(88));
      at(272, A.redzig(104));
    }
  };

  /* ==================================================== 關卡 3：石陣 / 巨石迷宮 */
  var S3 = {
    index: 3, key: 'stone', name: 'STONEHENGE', music: 'stage3', boss: 'twin',
    cols: 384, minFree: 18, bossCol0: 320, airEnd: 88,
    terrain: [
      [88, 0, 0],
      [12, 2, 2], [12, 2, 2], [12, 4, 2], [12, 2, 4],
      [12, 3, 3], [12, 1, 5], [12, 5, 1], [12, 3, 3],         // 石陣走廊
      [8, 4, 4], [8, 4, 4], [8, 4, 4], [8, 4, 4],
      [8, 3, 5], [8, 5, 3], [8, 4, 4], [8, 2, 6],             // 狹窄通道
      [24, 2, 2], [24, 3, 3], [24, 2, 2],                     // 石像大廳
      [64, 3, 3]
    ],
    tiles: tiles({ fill: 'STONE', wall: 'STONE', wall2: 'SLAB', pipe: 'STONE', pipeH: 'SLAB' }),
    bigRocks: [],
    params: { bulletScale: 282, period: 112, easyPeriod: 112, easyCol0: -1, easyCol1: -1, maxAlive: 12 },
    speedZones: null,
    theme: function (at, A) {
      // 主題：可破壞岩壁（打掉才有路）+ 莫艾風石像（只有嘴可打、吐環狀彈）
      // 岩壁一欄 3 塊 16x16，**永遠留兩個 16 px 的缺口**（列 6~7 與 列 16~17），
      // 所以「不打也過得去」，打掉只是更快 —— 友善版（PROGRESS：使用者要友善）。
      at(94, A.bricks([2, 10, 20]));
      at(106, A.fan(96));
      at(114, A.bricks([0, 12, 22]));
      at(124, A.zigs([64, 128]));
      at(132, A.bricks([2, 10, 20]));
      at(140, A.fan(72));
      at(150, A.moai(false));
      at(158, A.zigs([56, 112], 0));
      at(166, A.moai(true));
      at(174, A.bricks([0, 12, 22]));
      at(182, A.fan(120));
      at(190, A.tank(96));
      at(200, A.bricks([2, 10, 20]));
      at(210, A.moai(false));
      at(218, A.zigs([48, 96, 144], 1));
      at(226, A.fan(64));
      at(234, A.moai(true));
      at(242, A.bricks([0, 12, 22]));
      at(250, A.tank(112, true));
      at(258, A.fan(104));
      at(266, A.moai(false));
      at(276, A.zigs([72, 136]));
      at(284, A.moai(true));
      at(292, A.fan(88));
      at(300, A.redzig(112));
      at(310, A.zigs([64, 120]));
    }
  };

  /* ==================================================== 關卡 4：倒立世界 */
  var S4 = {
    index: 4, key: 'invert', name: 'INVERTED WORLD', music: 'stage4', boss: 'mirror',
    cols: 368, minFree: 17, bossCol0: 304, airEnd: 80,
    terrain: [
      [80, 0, 0],
      [16, 5, 1], [16, 6, 1], [16, 7, 2], [16, 6, 1], [16, 5, 2], [16, 7, 1],   // 天地顛倒（天花板為主）
      [16, 4, 4], [16, 3, 5], [16, 5, 3], [16, 4, 4],                            // 中段：減速區
      [16, 1, 6], [16, 2, 7], [16, 1, 7], [16, 2, 6],                            // 上下鏡像（地板為主）
      [64, 3, 3]
    ],
    tiles: tiles({ fill: 'ROCKW', floorTop: 'LAVA', pipe: 'LAVA2', wall: 'ROCKW' }),
    bigRocks: [],
    // 中段（欄 176..240）捲動 0.5 -> 0.25 px/幀 ＝ 研究 §7-2「倒立火山」的替代做法：
    // `NES.SH.Scroller` 只能往前串流（不能反向捲動，見 ENGINE_API §15.5），
    // 所以用「上下鏡像地形 + 減速段」表現天地顛倒，不改 engine。
    speedZones: [[176, 240, SPEED_SLOW]],
    params: { bulletScale: 294, period: 104, easyPeriod: 104, easyCol0: -1, easyCol1: -1, maxAlive: 12 },
    theme: function (at, A) {
      // 主題：分裂體（打掉分成 2 隻）+ 追蹤導彈
      var c;
      at(86, A.splits([64, 128]));
      at(96, A.fan(88));
      for (c = 104; c < 172; c += 12) at(c, (c % 24 === 0) ? A.splits([56, 120]) : A.homings([72, 136]));
      at(110, A.turret(true));
      at(126, A.turret(true));
      at(142, A.crawl(true));
      at(158, A.turret(true));
      at(168, A.tank(96, true));
      // 減速區（欄 176..240）：敵人變密，但捲動慢 => 有時間反應
      at(178, A.splits([48, 104, 152]));
      at(188, A.homings([64, 128]));
      at(196, A.fan(80));
      at(204, A.splits([72, 136]));
      at(212, A.homings([56, 112, 160]));
      at(222, A.turret(false));
      at(230, A.fan(112));
      at(238, A.splits([64, 128]));
      // 鏡像段（地板為主）
      at(248, A.crawl(false));
      at(256, A.homings([72, 128]));
      at(264, A.turret(false));
      at(272, A.fan(72));
      at(280, A.splits([56, 120]));
      at(288, A.tank(104));
      at(296, A.redzig(96));
    }
  };

  /* ==================================================== 關卡 5：生物洞窟 */
  var S5 = {
    index: 5, key: 'bio', name: 'BIO CAVERN', music: 'stage5', boss: 'bio',
    cols: 400, minFree: 17, bossCol0: 336, airEnd: 80,
    terrain: [
      [80, 0, 0],
      [16, 3, 3], [16, 4, 4], [16, 2, 5], [16, 5, 2],
      [16, 4, 4], [16, 3, 5], [16, 5, 3], [16, 4, 4],          // 洞窟
      [16, 2, 2], [16, 3, 3], [16, 4, 4], [16, 2, 6],
      [16, 6, 2], [16, 3, 3],                                  // 卵室
      [32, 3, 3],
      [64, 3, 3]
    ],
    tiles: tiles({ fill: 'FLESH', wall: 'FLESH', wall2: 'VEIN', pipe: 'VEIN', pipeH: 'VEIN' }),
    bigRocks: [],
    params: { bulletScale: 307, period: 96, easyPeriod: 96, easyCol0: -1, easyCol1: -1, maxAlive: 13 },
    speedZones: null,
    theme: function (at, A) {
      // 主題：會伸縮的觸手（用敵人物件做，不是磚）+ 孵化卵
      var c;
      for (c = 88; c < 330; c += 16) at(c, A.tent((c % 32 === 0), { min: 24, amp: 48 }));
      for (c = 96; c < 330; c += 24) at(c, A.eggs([64, 128]));
      at(100, A.fan(96));
      at(116, A.zigs([56, 120]));
      at(132, A.crawl(false));
      at(148, A.fan(72));
      at(164, A.homings([80, 140]));
      at(180, A.tank(96, true));
      at(196, A.fan(112));
      at(214, A.crawl(true));
      at(224, A.splits([64, 128]));
      at(240, A.fan(88));
      at(254, A.homings([72, 136]));
      at(268, A.tank(120));
      at(284, A.fan(64));
      at(298, A.zigs([48, 96, 144], 2));
      at(312, A.crawl(false));
      at(326, A.redzig(104));
    }
  };

  /* ==================================================== 關卡 6：敵母艦最終要塞 */
  var S6 = {
    index: 6, key: 'mother', name: 'MOTHER SHIP', music: 'stage6', boss: 'brain',
    cols: 416, minFree: 16, bossCol0: 352, airEnd: 72,
    terrain: [
      [72, 0, 0],
      [16, 4, 4], [16, 5, 5], [16, 4, 6], [16, 6, 4], [16, 5, 5], [16, 4, 4],   // 高速彈幕走廊
      [12, 5, 5], [12, 3, 7], [12, 7, 3], [12, 5, 5],
      [12, 4, 6], [12, 6, 4], [12, 5, 5], [12, 5, 5],                            // 四方砲台陣
      [16, 4, 4], [16, 3, 3], [16, 4, 4], [16, 3, 3], [24, 3, 3],
      [64, 3, 3]
    ],
    tiles: tiles({ wall2: 'CIRC', pipeH: 'CIRC', bossBg: 'CORE2' }),
    bigRocks: [],
    params: { bulletScale: 333, period: 88, easyPeriod: 88, easyCol0: -1, easyCol1: -1, maxAlive: 14 },
    speedZones: null,
    theme: function (at, A) {
      // 主題：四方砲台 + 高速彈幕走廊（全種類混編 = 最終關）
      var c;
      for (c = 80; c < 344; c += 20) at(c, A.turret4(48 + ((c * 7) % 112)));
      for (c = 90; c < 344; c += 20) at(c, A.turret((c % 40 === 0)));
      at(96, A.fan(96));
      at(108, A.splits([64, 128]));
      at(120, A.homings([72, 136]));
      at(132, A.fan(72));
      at(144, A.tank(96, true));
      at(156, A.zigs([48, 96, 144], 0));
      at(170, A.crawl(false));
      at(182, A.fan(120));
      at(194, A.splits([56, 112, 160]));
      at(206, A.homings([64, 128]));
      at(218, A.crawl(true));
      at(230, A.fan(88));
      at(242, A.tank(112));
      at(254, A.splits([72, 136]));
      at(266, A.zigs([56, 104, 152], 1));
      at(278, A.homings([80, 140]));
      at(290, A.fan(64));
      at(302, A.tank(96));
      at(314, A.splits([64, 128]));
      at(326, A.fan(104));
      at(338, A.redzig(96));
    }
  };

  /* ==================================================== 匯出 */
  var LIST = [null, S1, S2, S3, S4, S5, S6];
  CR.STAGES = LIST;
  CR.STAGE_COUNT = 6;
  CR.StageData = {
    SPEED_DEFAULT: SPEED_DEFAULT, SPEED_SLOW: SPEED_SLOW,
    GUN_KINDS: GUN_KINDS,
    makeApi: makeApi,
    buildWaves: buildWaves,
    get: function (n) { return LIST[n] || LIST[1]; },
    count: 6
  };
})();
