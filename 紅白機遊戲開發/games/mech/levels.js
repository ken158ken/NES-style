/*
 * games/mech/levels.js — 《星塵機甲》磚語意 + 兩關 × 7 畫面 + 選關表
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 依賴：games/mech/chr_world.js（磚名）
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約 / 關卡」
 *
 * **畫面單位捲動（screen-based）**——研究 `03_洛克人2.md` §③ / §⑧2：
 *   「關卡以『畫面』為單位切換而非連續捲動，大幅簡化 nametable 管理，
 *     也讓敵人生成邏輯變得單純（進畫面才生成）」[推論]
 *   ⇒ 一個房間 = **剛好一張名稱表（32 × 30 磚 = 256 × 240 px）**，相機永遠不動；
 *     只有「換房」那 30~32 幀會捲動，而且**每幀只補 1 欄 / 1 列**（≤ 45 byte，遠低於 160 預算）。
 *
 * 房間連線：`room.next` = 'right' | 'up' | 'down' | null（最後一間）。
 *   往 `next` 的方向走出畫面 ⇒ 下一間；往**上一間的 next 的反方向**走出去 ⇒ 回上一間（可回頭）。
 *
 * 地圖字元：
 *   `.` 空　`#` 地板上緣　`_` 地板填充　`X` 金屬塊　`W` 牆 / 天花板
 *   `H` 梯子　`T` 梯頂（與地板同列）　`^` 尖刺（即死）　`V` 天花板尖刺（即死）
 *   `a` 消失磚群 A　`b` 消失磚群 B　`l` 熔岩（即死）　`D` 魔王門（裝飾）
 *   `p` 管線　`=` 面板　`o` 觀景窗　`r` 欄杆　`g` 背景格網　`i` 冰晶柱（裝飾）　`B` 魔王房地板
 *
 * 關卡清單（選關畫面 8 格，本輪開 2 格、其餘 COMING）：
 * | # | key   | 畫面名        | 房間 | 中繼點 | 頭目 | 新機制 |
 * |---|-------|---------------|------|--------|------|--------|
 * | 1 | frost | FROST PLANT   | 7    | 0 / 5  | FROST | 梯子上行、消失磚（獎勵路線）、尖刺走廊 |
 * | 2 | blaze | BLAZE FURNACE | 7    | 0 / 4 / 5 | BLAZE | **垂直落下換房**、熔岩、滑行隧道、梯子上行 |
 */
(function () {
  'use strict';
  var MG = window.MG = window.MG || {};

  var COLS = 32, ROWS = 30;

  var TILE = {
    EMPTY: 0, GTOP: 1, GND: 2, BLK: 3, WALL: 4, LAD: 5, LADT: 6,
    SPIKE: 7, SPIKED: 8, VAN_A: 9, VAN_B: 10, LAVA: 11, DOOR: 12,
    PIPE: 13, PANEL: 14, WIN: 15, RAIL: 16, GRID: 17, SIG1: 18, BFLOOR: 19
  };
  var CHAR2TILE = {
    '.': TILE.EMPTY, '#': TILE.GTOP, '_': TILE.GND, 'X': TILE.BLK, 'W': TILE.WALL,
    'H': TILE.LAD, 'T': TILE.LADT, '^': TILE.SPIKE, 'V': TILE.SPIKED,
    'a': TILE.VAN_A, 'b': TILE.VAN_B, 'l': TILE.LAVA, 'D': TILE.DOOR,
    'p': TILE.PIPE, '=': TILE.PANEL, 'o': TILE.WIN, 'r': TILE.RAIL,
    'g': TILE.GRID, 'i': TILE.SIG1, 'B': TILE.BFLOOR
  };
  // 磚 → 背景磚名（chr_world.js 的 MG.BG_WORLD）
  var TILE2BG = {};
  TILE2BG[TILE.EMPTY] = 'SP';
  TILE2BG[TILE.GTOP] = 'W_GTOP';
  TILE2BG[TILE.GND] = 'W_GND';
  TILE2BG[TILE.BLK] = 'W_BLK';
  TILE2BG[TILE.WALL] = 'W_WALL';
  TILE2BG[TILE.LAD] = 'W_LAD';
  TILE2BG[TILE.LADT] = 'W_LADT';
  TILE2BG[TILE.SPIKE] = 'W_SPIKE';
  TILE2BG[TILE.SPIKED] = 'W_SPIKED';
  TILE2BG[TILE.VAN_A] = 'W_VAN';
  TILE2BG[TILE.VAN_B] = 'W_VAN';
  TILE2BG[TILE.LAVA] = 'W_SIG2';
  TILE2BG[TILE.DOOR] = 'W_DOOR_L';
  TILE2BG[TILE.PIPE] = 'W_PIPE';
  TILE2BG[TILE.PANEL] = 'W_PANEL';
  TILE2BG[TILE.WIN] = 'W_WIN';
  TILE2BG[TILE.RAIL] = 'W_RAIL';
  TILE2BG[TILE.GRID] = 'W_GRID';
  TILE2BG[TILE.SIG1] = 'W_SIG1';
  TILE2BG[TILE.BFLOOR] = 'W_BFLOOR';

  // 屬性（16×16 調色盤組）：地板 / 牆 = 1、梯子 / 門 / 塊 = 2、危險（尖刺 / 熔岩 / 消失磚）= 3、空 = 1
  function palOf(t) {
    switch (t) {
      case TILE.LAD: case TILE.LADT: case TILE.DOOR: case TILE.BLK: case TILE.PIPE: case TILE.WIN: return 2;
      case TILE.SPIKE: case TILE.SPIKED: case TILE.LAVA: case TILE.VAN_A: case TILE.VAN_B: case TILE.SIG1: return 3;
      case TILE.BFLOOR: return 2;
      default: return 1;
    }
  }

  function solidKind(t) {
    switch (t) {
      case TILE.GTOP: case TILE.GND: case TILE.BLK: case TILE.WALL: case TILE.BFLOOR: return 'solid';
      case TILE.LAD: case TILE.LADT: return 'ladder';
      case TILE.SPIKE: case TILE.SPIKED: case TILE.LAVA: return 'kill';
      case TILE.VAN_A: return 'vanishA';
      case TILE.VAN_B: return 'vanishB';
      default: return 'none';
    }
  }

  /* ---------------- 消失磚（研究 ④⑩ Yoku Block：嚴格週期）----------------
   * 週期 120 幀：出現 72 幀（最後 16 幀閃爍預警）→ 消失 48 幀；B 群相位差 60 幀。
   * 「純節拍型平台是最便宜的高難度內容——但務必先在安全處示範一次」（研究 ⑩⑨）
   * ⇒ 本作把消失磚一律放在**獎勵路線**上，主路線不靠它（友善版，對齊專案既有裁示）。 */
  var VAN_PERIOD = 120, VAN_ON = 72, VAN_WARN = 16;
  function vanishPhase(group, t) { return (((t | 0) + (group === 'B' ? 60 : 0)) % VAN_PERIOD + VAN_PERIOD) % VAN_PERIOD; }
  function vanishOn(group, t) { return vanishPhase(group, t) < VAN_ON; }
  function vanishWarn(group, t) {
    var p = vanishPhase(group, t);
    return p >= VAN_ON - VAN_WARN && p < VAN_ON;
  }

  /* ---------------- 地圖建構（run-length 的列清單）---------------- */
  // entries：字串（1 列）或 [n, 字串]（n 列相同）；總列數必須剛好 30，每列必須剛好 32 字元。
  function rows(entries, where) {
    var out = [], i, e, n, s, j;
    for (i = 0; i < entries.length; i++) {
      e = entries[i];
      if (typeof e === 'string') { n = 1; s = e; }
      else { n = e[0]; s = e[1]; }
      if (s.length !== COLS) throw new Error('mech levels ' + where + '：第 ' + i + ' 項長度 ' + s.length + ' ≠ ' + COLS + '（' + s + '）');
      for (j = 0; j < n; j++) out.push(s);
    }
    if (out.length !== ROWS) throw new Error('mech levels ' + where + '：總列數 ' + out.length + ' ≠ ' + ROWS);
    return out;
  }

  function room(def) {
    var src = rows(def.rows, def.name || '?');
    var map = new Uint8Array(COLS * ROWS), c, r, ch;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        ch = src[r].charAt(c);
        if (CHAR2TILE[ch] === undefined) throw new Error('mech levels ' + def.name + '：不認得的字元 "' + ch + '" @ ' + c + ',' + r);
        map[r * COLS + c] = CHAR2TILE[ch];
      }
    }
    return {
      name: def.name, map: map, next: def.next || null,
      entry: def.entry || { x: 8, y: 168 },
      spawns: def.spawns || [], items: def.items || [],
      checkpoint: !!def.checkpoint, boss: def.boss || null,
      route: def.route || { dir: def.next || 'right' },
      tileAt: function (col, r2) {
        if (col < 0 || col >= COLS || r2 < 0 || r2 >= ROWS) return TILE.EMPTY;
        return map[r2 * COLS + col];
      }
    };
  }

  var W32 = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW';
  var E32 = '................................';
  var G32 = '################################';
  var F32 = '________________________________';

  /* ================================================================ 關卡 1
   * FROST PLANT 冰晶工廠：教學 → 坑 → 梯子上行 → 高台 / 消失磚獎勵 → 尖刺 → 前哨 → 魔王
   * 研究 ⑦②「每關第一個房間都是安全教室」⇒ R0 是完全平坦的地面 + 一隻雜魚。 */
  var L1 = {
    key: 'frost', no: 1, name: 'FROST PLANT', theme: 'frost',
    boss: 'frost', music: 'stage1', start: { room: 0, x: 24, y: 168 },
    rooms: [
      room({
        name: '1-A ENTRY HALL', next: 'right', checkpoint: true,
        entry: { x: 24, y: 168 },
        rows: [[3, W32], '....oo......oo......oo......oo..', [20, E32], G32, [5, F32]],
        spawns: [{ kind: 'walker', c: 22, r: 23 }],
        items: [{ kind: 'pellet', c: 16, r: 22 }]
      }),
      room({
        name: '1-B PIT WALK', next: 'right',
        rows: [[3, W32], [21, E32], '########....########....########',
               [5, '________....________....________']],
        spawns: [{ kind: 'walker', c: 9, r: 23 }, { kind: 'sentry', c: 28, r: 23 }]
      }),
      room({
        name: '1-C LIFT SHAFT', next: 'up', route: { dir: 'up', ladderCol: 3 },
        rows: [[10, '...H............................'],
               '...H....XXXXX...........XXXXX...',
               [5, '...H............................'],
               '...H..XXXXX.........XXXXXX......',
               [7, '...H............................'],
               G32, [5, F32]],
        spawns: [{ kind: 'flyer', c: 12, r: 13 }, { kind: 'flyer', c: 26, r: 19 }],
        items: [{ kind: 'etank', c: 8, r: 15 }]
      }),
      room({
        name: '1-D HIGH LEDGE', next: 'right',
        entry: { x: 22, y: 216, climb: true },
        rows: [[3, W32], [13, E32],
               '........................aaaa....',
               '..........a.....................',
               [2, E32],
               '###T################............',
               [3, '...H............................'],
               '...H############################',
               [5, '...H____________________________']],
        spawns: [{ kind: 'walker', c: 14, r: 19 }, { kind: 'flyer', c: 26, r: 10 }],
        items: [{ kind: 'oneup', c: 26, r: 15 }, { kind: 'wpellet', c: 10, r: 16 }]
      }),
      room({
        name: '1-E SPIKE ROW', next: 'right',
        rows: [[3, W32], [21, E32], '######^^^^######^^^^############', [5, F32]],
        spawns: [{ kind: 'hopper', c: 24, r: 23 }],
        items: [{ kind: 'pbig', c: 13, r: 23 }]
      }),
      room({
        name: '1-F GATE', next: 'right', checkpoint: true,
        rows: [[3, W32], [17, E32], [4, '..............................DD'], G32, [5, F32]],
        spawns: [{ kind: 'sentry', c: 20, r: 23 }],
        items: [{ kind: 'pellet', c: 8, r: 23 }]
      }),
      room({
        name: '1-G BOSS', next: null, boss: 'frost',
        entry: { x: 16, y: 168 },
        rows: [[3, W32], [17, E32], [4, 'DD..............................'],
               'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', [5, F32]]
      })
    ]
  };

  /* ================================================================ 關卡 2
   * BLAZE FURNACE 熔鐵熔爐：教學 → **垂直落下換房** → 落點 → 熔岩 + 消失磚 → 滑行隧道 + 梯子 → 前哨 → 魔王 */
  var L2 = {
    key: 'blaze', no: 2, name: 'BLAZE FURNACE', theme: 'blaze',
    boss: 'blaze', music: 'stage2', start: { room: 0, x: 24, y: 168 },
    rooms: [
      room({
        name: '2-A FURNACE GATE', next: 'right', checkpoint: true,
        entry: { x: 24, y: 168 },
        rows: [[3, W32], '.....pp......pp......pp......pp.', [20, E32],
               '##########llll##########llll####', [5, F32]],
        spawns: [{ kind: 'walker', c: 20, r: 23 }],
        items: [{ kind: 'pellet', c: 6, r: 23 }]
      }),
      room({
        name: '2-B DROP SHAFT', next: 'down', route: { dir: 'down', holeCol: 17 },
        rows: [[3, W32], [15, E32],
               '....XXXX..................XXXXXX',
               [5, E32],
               '################....############',
               [5, '________________....____________']],
        spawns: [{ kind: 'walker', c: 11, r: 23 }, { kind: 'flyer', c: 14, r: 12 }],
        items: [{ kind: 'oneup', c: 28, r: 17 }]
      }),
      room({
        name: '2-C LANDING', next: 'right',
        entry: { x: 128, y: 0, fall: true },
        rows: [E32, [2, 'WWWWWWWWWWWWWWWW....WWWWWWWWWWWW'], [12, E32],
               '............XXXXXXXX............', [8, E32], G32, [5, F32]],
        spawns: [{ kind: 'walker', c: 8, r: 23 }, { kind: 'sentry', c: 26, r: 23 }],
        items: [{ kind: 'pellet', c: 14, r: 14 }]
      }),
      room({
        name: '2-D LAVA RUN', next: 'right',
        // 消失磚平台放在**實心地板上方**（獎勵路線：踩上去拿武器能量），
        // 不架在熔岩上 ⇒ 主路線永遠是「跳過 5 格熔岩」，不吃節拍（友善版，研究 ⑩⑨）
        rows: [[3, W32], [16, E32],
               '.................bbbb...........',
               [4, E32],
               '########lllll###########llll####', [5, F32]],
        spawns: [{ kind: 'hopper', c: 24, r: 23 }],
        items: [{ kind: 'etank', c: 29, r: 23 }, { kind: 'wpellet', c: 18, r: 18 }]
      }),
      room({
        name: '2-E SLIDE TUNNEL', next: 'up', checkpoint: true,
        route: { dir: 'up', ladderCol: 28 },
        rows: [[3, 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWHWWW'],
               [17, '............................H...'],
               [2, '........XXXXXXXX............H...'],
               [2, '............................H...'],
               G32, [5, F32]],
        spawns: [{ kind: 'walker', c: 11, r: 23 }, { kind: 'hopper', c: 21, r: 23 }],
        items: [{ kind: 'oneup', c: 12, r: 23 }]
      }),
      room({
        name: '2-F GATE', next: 'right', checkpoint: true,
        entry: { x: 222, y: 216, climb: true },
        rows: [[3, W32], [17, E32], [4, '..............................DD'],
               '############################T###',
               [5, '____________________________H___']],
        spawns: [{ kind: 'sentry', c: 12, r: 23 }],
        items: [{ kind: 'pellet', c: 6, r: 23 }]
      }),
      room({
        name: '2-G BOSS', next: null, boss: 'blaze',
        entry: { x: 16, y: 168 },
        rows: [[3, W32], [17, E32], [4, 'DD..............................'],
               'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', [5, F32]]
      })
    ]
  };

  /* ================================================================ 選關畫面
   * 研究 ⑦①「選關畫面就是難度選單」：8 格任選。本輪開 2 格，其餘顯示 COMING。 */
  var SELECT = [
    { slot: 0, key: 'frost', label: 'FROST', open: true },
    { slot: 1, key: null, label: 'COMING', open: false },
    { slot: 2, key: null, label: 'COMING', open: false },
    { slot: 3, key: null, label: 'COMING', open: false },
    { slot: 4, key: null, label: 'MECH', open: false },     // 正中央 = 主角肖像（洛克人式版面）
    { slot: 5, key: null, label: 'COMING', open: false },
    { slot: 6, key: null, label: 'COMING', open: false },
    { slot: 7, key: null, label: 'COMING', open: false },
    { slot: 8, key: 'blaze', label: 'BLAZE', open: true }
  ];

  MG.TILE = TILE;
  MG.CHAR2TILE = CHAR2TILE;
  MG.TILE2BG = TILE2BG;
  MG.solidKind = solidKind;
  MG.palOf = palOf;
  MG.LEVELS = { frost: L1, blaze: L2 };
  MG.LEVEL_ORDER = ['frost', 'blaze'];
  MG.SELECT = SELECT;
  MG.Levels = {
    COLS: COLS, ROWS: ROWS,
    VAN_PERIOD: VAN_PERIOD, VAN_ON: VAN_ON, VAN_WARN: VAN_WARN,
    vanishPhase: vanishPhase, vanishOn: vanishOn, vanishWarn: vanishWarn,
    room: room, rows: rows,
    get: function (key) { return MG.LEVELS[key] || null; },
    roomCount: function (key) { var l = MG.LEVELS[key]; return l ? l.rooms.length : 0; }
  };
})();
