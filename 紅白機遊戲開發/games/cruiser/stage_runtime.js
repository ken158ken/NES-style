/*
 * games/cruiser/stage_runtime.js — 《星塵巡航艦》R3：通用關卡執行層（CR.stage）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-stages agent（R3）｜ 依賴：engine/{fixed,chr,ppu,shmup}.js
 *                      、games/cruiser/{chr_world,enemies,boss,bosses,stages}.js
 *
 * R2 的 `stage1.js` 把「關卡 1 的資料」與「關卡的執行邏輯」寫在同一支；R3 擴到 6 關後
 * 拆成 **資料（stages.js / CR.STAGES）+ 執行（本檔）**，介面與 R2 契約完全相同，只多兩個：
 *   CR.stage.load(n)   切到第 n 關（1..6）：換地形 / 調色盤 / 出怪表 / 魔王 / 難度參數
 *   CR.stage.index     目前關卡編號
 * 其餘 `{ init, update, draw, checkpoint, restart, enemies, bullets, capsules, camX, speed,
 *   length, bossActive, cleared, solidAt, clearScreen, spawnTest, takeScore, redraw, … }`
 * 一字未改（`test_stage1.py` 的 174 項驗收就是靠這個介面）。
 *
 * 版面：HUD 在**下方 32 線**（main 做 `split(208, …)`）=> 遊戲區 = 掃描線 0..207 = 名稱表列 0..25。
 *       欄串流用 `NES.SH.Scroller({row0: 0, rows: 26})`，**絕不碰列 26..29**（ship 的 HUD）。
 *       `ppu.scroll` / `ppu.split` 由 main.js 每幀設定，本檔不碰（NES.SH 契約 §15.5）。
 *
 * 手感數字（docs/research/03…/16_宇宙巡航艦_沙羅曼蛇.md §10）：
 *   捲動 **0.5 px/幀**（8.8 = 128；關卡 4 的減速段 0.25）；檢查點 **每 512 px**；
 *   膠囊 vx = -0.5 px/幀、無壽命；**每第 16 顆膠囊是藍色清屏膠囊**。
 *   魔王復活點 = `CAM_MAX - 56`（死在魔王戰只要空捲 112 幀 ≈ 1.9 秒）。
 *
 * VBlank 預算：`Scroller.update()` 每幀 <= 39 byte（26 磚 + 13 屬性，每 2 欄一次）；
 *   魔王艦體 36 byte / 雷射 3x22 = 66 byte，都是狀態切換那一幀才寫，皆 < 160。
 *   `restart()` / `load()` 走 `Scroller.reset()`（2400 byte）＝真機「關閉 rendering 重建畫面」，
 *   所以那段會把 `ppu.budget.mute` 打開、不計入單幀預算。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX, SH = NES.SH;
  if (!FX) throw new Error('games/cruiser/stage_runtime.js 需要 engine/fixed.js');
  if (!SH || !SH.Scroller) throw new Error('games/cruiser/stage_runtime.js 需要 engine/shmup.js（NES.SH）');
  if (!CR.Enemies || !CR.Boss) throw new Error('games/cruiser/stage_runtime.js 需要 enemies.js / boss.js 先載入');
  if (!CR.STAGES) throw new Error('games/cruiser/stage_runtime.js 需要 stages.js 先載入');

  /* ============================================================ 常數 */
  var ROWS = 26;                          // 遊戲區列 0..25（列 26..29 = HUD）
  var MAX_COLS = 448;                     // 池 / 陣列一次配足（六關最長 416 欄）
  var SCREEN_COLS = 32, GAME_H = ROWS * 8;                  // 208
  var CHECKPOINT_STEP = 512;
  var BOSS_RESPAWN_BACK = 56;
  var SPEED_DEFAULT = FX.v88(0, 128);     // 0.5 px/幀（研究 16 §10）
  var CAP_VX = -FX.v88(0, 128);           // 膠囊往左飄 0.5 px/幀
  var BLUE_EVERY = 16;                    // 每第 16 顆膠囊 = 藍色清屏膠囊
  var POOL_ENEMY = 28, POOL_BULLET = 48, POOL_CAP = 6, POOL_BOOM = 12;
  var BOOM_FRAMES = 6;
  var PRIO_EBULLET = 2, PRIO_BOOM = 4, PRIO_CAP = 2;
  var PAL_EBULLET = 2, PAL_EBULLET_ALT = 1, PAL_BOOM = 1, PAL_CAP_RED = 1, PAL_CAP_BLUE = 0;
  var STAGE_COUNT = CR.STAGE_COUNT || 6;

  /* ============================================================ 磚種 */
  // **前 33 個一字不改**（關卡 1 的既有驗收：test_stage1.py 用 `CR.stage.K.SPACE` 等等），
  // R3 的主題磚一律往後接。solid / attr 改成明碼表（不再用索引區間判斷）。
  var KIND_NAMES = [
    'SPACE', 'STARA', 'STARB',
    'ROCKA0', 'ROCKA1', 'ROCKA2', 'ROCKA3',
    'ROCKB0', 'ROCKB1', 'ROCKB2', 'ROCKB3',
    'ROCKC0', 'ROCKC1', 'ROCKC2', 'ROCKC3',
    'DEB0', 'DEB1',
    'FLOOR_TOP', 'CEIL_BOT', 'SOLID', 'WALL', 'WALL2', 'PIPE', 'PIPEH', 'LAMP',
    'BOSSBG', 'GRID', 'HULL', 'HULLR', 'VENT', 'HULLC', 'LWARN', 'LBEAM',
    // ---- R3 主題磚 ----
    'LAVA', 'LAVA2', 'ROCKW', 'STONE', 'SLAB', 'FLESH', 'VEIN', 'CIRC', 'CORE2'
  ];
  var K = {};
  (function () { for (var i = 0; i < KIND_NAMES.length; i++) K[KIND_NAMES[i]] = i; })();

  // 會擋船 / 讓飛彈滾地的磚（背景裝飾與魔王艦體不算）
  var SOLID_NAMES = ['ROCKA0', 'ROCKA1', 'ROCKA2', 'ROCKA3', 'ROCKB0', 'ROCKB1', 'ROCKB2', 'ROCKB3',
    'ROCKC0', 'ROCKC1', 'ROCKC2', 'ROCKC3', 'DEB0', 'DEB1',
    'FLOOR_TOP', 'CEIL_BOT', 'SOLID', 'WALL', 'WALL2', 'PIPE', 'PIPEH', 'LAMP',
    'LAVA', 'LAVA2', 'ROCKW', 'STONE', 'SLAB', 'FLESH', 'VEIN', 'CIRC'];
  var SOLID = new Uint8Array(KIND_NAMES.length);
  (function () { for (var i = 0; i < SOLID_NAMES.length; i++) SOLID[K[SOLID_NAMES[i]]] = 1; })();
  // 屬性組：隕石 / 碎片 = 1、結構 = 2、其餘（星空 / 魔王背板）= 3
  var ATTR_OF = new Uint8Array(KIND_NAMES.length);
  (function () {
    var i;
    for (i = 0; i < KIND_NAMES.length; i++) ATTR_OF[i] = 3;
    for (i = K.ROCKA0; i <= K.DEB1; i++) ATTR_OF[i] = 1;
    for (i = K.FLOOR_TOP; i <= K.LAMP; i++) ATTR_OF[i] = 2;
    ATTR_OF[K.LAVA] = 1; ATTR_OF[K.LAVA2] = 1;              // 熔岩用「隕石組」（bg1 = 暖色）
    ATTR_OF[K.ROCKW] = 2; ATTR_OF[K.STONE] = 2; ATTR_OF[K.SLAB] = 2;
    ATTR_OF[K.FLESH] = 2; ATTR_OF[K.VEIN] = 1; ATTR_OF[K.CIRC] = 2;
    ATTR_OF[K.CORE2] = 3;
  })();

  function bankNameOf(kind) {
    var n = KIND_NAMES[kind];
    var m = /^ROCK([ABC])([0-3])$/.exec(n);
    if (m) return 'W_ROCK' + m[1] + '_r' + (m[2] >> 1) + 'c' + (m[2] & 1);
    return 'W_' + n;
  }
  function isSolidKind(k) { return !!SOLID[k]; }

  /* ============================================================ 每關狀態 */
  var def = null;                         // 目前關卡定義（CR.STAGES[n]）
  var COLS = 384, CAM_MAX = 2816;
  var CHECKPOINTS = [];
  var ceilH = new Uint8Array(MAX_COLS), floorH = new Uint8Array(MAX_COLS);
  var map = new Uint8Array(MAX_COLS * ROWS);
  var ATTR_ROWS = 13;                                       // 列 0..25 → row16 0..12
  var attr = new Uint8Array((MAX_COLS >> 1) * ATTR_ROWS);
  var ROLE = null;                                          // 角色 → 磚種（本關）

  function setK(c, r, k) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r * MAX_COLS + c] = k; }
  function kindAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return K.SPACE;
    return map[r * MAX_COLS + c];
  }
  function putRock(c, r, type) {
    var b = [K.ROCKA0, K.ROCKB0, K.ROCKC0][type % 3];
    setK(c, r, b); setK(c + 1, r, b + 1); setK(c, r + 1, b + 2); setK(c + 1, r + 1, b + 3);
  }

  function build() {
    var c, r, i, j, T = def.terrain, bossCol = def.bossCol0;
    c = 0;
    for (i = 0; i < T.length; i++) {
      for (j = 0; j < T[i][0] && c < COLS; j++, c++) { ceilH[c] = T[i][1]; floorH[c] = T[i][2]; }
    }
    while (c < COLS) { ceilH[c] = ceilH[c - 1]; floorH[c] = floorH[c - 1]; c++; }

    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) map[r * MAX_COLS + c] = K.SPACE;
    for (c = 0; c < COLS; c++) {
      var ch = ceilH[c], fh = floorH[c], bossRoom = (c >= bossCol);
      for (r = ch; r < ROWS - fh; r++) {
        if (bossRoom) setK(c, r, ((c % 10) === 1 && (r & 1) === 0) ? ROLE.grid : ROLE.bossBg);
        else if (ceilH[c] === 0 && floorH[c] === 0) {       // 空戰段 = 星空點
          if (((c * 7 + r * 13) % 29) === 0) setK(c, r, ROLE.star1);
          else if (((c * 5 + r * 11) % 37) === 0) setK(c, r, ROLE.star2);
        }
      }
      for (r = 0; r < ch; r++) {                             // 天花板
        if (r === ch - 1) setK(c, r, ROLE.ceilBot);
        else if (r === 1 && ch >= 3) setK(c, r, ROLE.pipeH); // 列 0 被顯示裁掉，管線放列 1
        else setK(c, r, ((c & 3) === 0) ? ROLE.wall2 : ROLE.fill);
      }
      for (r = ROWS - fh; r < ROWS; r++) {                   // 地板
        if (r === ROWS - fh) setK(c, r, ROLE.floorTop);
        else if (r === ROWS - 1) setK(c, r, ROLE.wall);
        else if ((c & 7) === 3) setK(c, r, ROLE.pipe);
        else setK(c, r, ((c & 3) === 0) ? ROLE.wall2 : ROLE.fill);
      }
      if (ch >= 2 && (c % 12) === 5) setK(c, ch - 1, ROLE.lamp);   // 壁燈每 12 欄一盞
    }
    var rocks = def.bigRocks || [];
    for (i = 0; i < rocks.length; i++) putRock(rocks[i][0], rocks[i][1], i % 3);
    buildAttr();
  }

  function buildAttr() {
    var w16 = MAX_COLS >> 1, c16, r16, dx, dy, cols16 = COLS >> 1;
    attr.fill(3);
    for (r16 = 0; r16 < ATTR_ROWS; r16++) {
      for (c16 = 0; c16 < cols16; c16++) {
        var a = 3;
        for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
          var g = ATTR_OF[kindAt(c16 * 2 + dx, r16 * 2 + dy)];
          if (g !== 3 && (a === 3 || g < a)) a = g;
        }
        attr[r16 * w16 + c16] = a;
      }
    }
  }

  /* ============================================================ 狀態 */
  var ppu0 = null, sprBank = null, bgBank = null;
  var TILE = null, S = null;
  var enemies = null, bullets = null, capsules = null, booms = null;
  var scroller = null, spawner = null, table = null;
  var camVec = FX.Vec(0);
  var frames = 0, updates = 0, pendingJump = null, pendingBoss = 0, pendingStage = 0;
  var capsuleSeq = 0;
  var shipPrev = { x: 0, y: 0, has: false }, shipV = { vx: 0, vy: 0 };
  var api = null;                                            // stages.js 的出怪小工具

  var stage = {
    COLS: COLS, ROWS: ROWS, CAM_MAX: CAM_MAX, GAME_H: GAME_H,
    CHECKPOINTS: [], CHECKPOINT_STEP: CHECKPOINT_STEP, BOSS_RESPAWN: 0,
    AIR_COLS: 192, BELT_COL0: 192, BELT_COL1: 247, FORT_COL0: 248, BOSS_COL0: 320,
    BIG_ROCKS: [],
    BLUE_EVERY: BLUE_EVERY, MAX_ALIVE_ENEMY: 10,
    length: COLS,
    camX: 0,
    speed: SPEED_DEFAULT,
    bossActive: false,
    cleared: false,
    pendingScore: 0,
    escapeT: 0,                       // R3：最終魔王的「脫出倒數」（0 = 沒有）
    index: 1, key: 'belt', name: 'ASTEROID BELT', music: 'stage1', bossKey: 'core',
    count: STAGE_COUNT, loop: 0, minFree: 18,
    enemies: null, bullets: null, capsules: null, explosions: null,
    K: K, KIND_NAMES: KIND_NAMES, SOLID: SOLID
  };

  /* ============================================================ 名稱表資料源 */
  function tileAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return TILE[K.SPACE];
    return TILE[map[row * MAX_COLS + col]];
  }
  function attrAt(col16, row16) {
    if (row16 < 0 || row16 >= ATTR_ROWS || col16 < 0 || col16 >= (COLS >> 1)) return 3;
    return attr[row16 * (MAX_COLS >> 1) + col16];
  }
  function muteBudget(ppu, fn) {
    var b = ppu && ppu.budget, old = b ? b.mute : false;
    if (b) b.mute = true;
    try { fn(); } finally { if (b) b.mute = old; }
  }

  /* ============================================================ 生成 / 回收 */
  function aliveSmall() {
    var n = 0, i, it = enemies.items;
    for (i = 0; i < it.length; i++) if (it[i].alive && !it[i].boss) n++;
    return n;
  }
  function allocEnemy() {                                   // 給 enemies.js（受同屏上限管制）
    if (aliveSmall() >= stage.MAX_ALIVE_ENEMY) return null;
    return enemies.alloc();
  }
  function allocPart() { return enemies.alloc(); }          // 給 boss.js（不受上限管制）
  function freeEnemy(e) { enemies.free(e); }

  function fire(x, y, vx, vy) {
    var b = bullets.alloc();
    if (!b) return null;
    b.big = false; b.bg = false; b.ring = false;
    b.x = (x - 2) | 0; b.y = (y - 2) | 0; b.w = 4; b.h = 4;
    FX.vsetPx(b.xs, b.x); FX.vsetPx(b.ys, b.y);
    b.vx = vx | 0; b.vy = vy | 0; b.t = 0;
    return b;
  }
  function bigBullet(x, y, w, h) {                          // 魔王雷射（畫面走背景磚）
    var b = bullets.alloc();
    if (!b) return null;
    b.big = true; b.bg = true; b.ring = false;
    b.x = x | 0; b.y = y | 0; b.w = w | 0; b.h = h | 0;
    b.vx = 0; b.vy = 0; b.t = 0;
    FX.vsetPx(b.xs, b.x); FX.vsetPx(b.ys, b.y);
    return b;
  }
  function freeBullet(b) { bullets.free(b); }

  function boom(x, y) {
    var e = booms.alloc();
    if (!e) return null;
    e.x = (x - 4) | 0; e.y = (y - 4) | 0; e.t = 0;
    return e;
  }

  function dropCapsule(x, y, forceBlue) {
    var c = capsules.alloc();
    if (!c) return null;
    capsuleSeq++;
    c.blue = !!forceBlue || (capsuleSeq % BLUE_EVERY === 0);
    c.seq = capsuleSeq; c.t = 0;
    c.x = x | 0; c.y = y | 0; c.w = 8; c.h = 8;
    FX.vsetPx(c.xs, c.x);
    return c;
  }

  function addScore(n) { stage.pendingScore += n | 0; }
  function shipRef() { return CR.ship || { x: 48, y: 96, w: 12, h: 6, alive: true }; }
  function shipVel() { return shipV; }                      // 1/16 px/幀（rank 3 預判射擊用）

  // 砲台 / 爬行砲 / 觸手 / 火山彈貼在指定世界欄的地板 / 天花板上
  function spawnAtSurface(col, ceiling, kind, opt) {
    if (col < 0 || col >= COLS) return null;
    kind = kind || 'turret';
    opt = opt || {};
    var o = {}, kk;
    for (kk in opt) if (opt.hasOwnProperty(kk)) o[kk] = opt[kk];
    o.wx = col * 8; o.ceiling = !!ceiling;
    var ch = ceilH[col], fh = floorH[col], y;
    if (kind === 'turret') {                                // 關卡 1 的既有語意：沒地形就不生成
      if (ceiling) { if (ch < 1) return null; y = ch * 8 + 2; }
      else { if (fh < 1) return null; y = (ROWS - fh) * 8 - 14; }
    } else if (kind === 'tent') {
      y = ceiling ? (ch * 8) : (GAME_H - fh * 8);           // 附著點（伸縮由 enemies.js 算）
    } else if (kind === 'lava') {
      y = GAME_H - fh * 8 - 8;
    } else {                                                // crawl / 其他貼面敵人
      y = ceiling ? (ch * 8) : (GAME_H - fh * 8 - 8);
    }
    return CR.Enemies.spawn(kind, col * 8 - stage.camX, y, o);
  }
  function spawnTurretAt(col, ceiling) { return spawnAtSurface(col, ceiling, 'turret'); }
  function spawnMoaiAt(col, ceiling) {
    if (col < 0 || col >= COLS) return null;
    var y = ceiling ? (ceilH[col] * 8) : (GAME_H - floorH[col] * 8 - 16);
    return CR.Enemies.spawnMoai(col * 8 - stage.camX, y, { wx: col * 8, ceiling: !!ceiling });
  }

  /* ============================================================ 魔王背景寫入 */
  function bgWrite(col, row, name) {
    if (col < 0 || col >= SCREEN_COLS + 2 || row < 0 || row >= ROWS) return;
    var wc = (stage.camX >> 3) + col, ntc = wc & 63;
    ppu0.setTile((ntc >> 5) & 1, ntc & 31, row, TILE[K[name]]);
  }
  function bgRestore(col, row) {
    if (col < 0 || col >= SCREEN_COLS + 2 || row < 0 || row >= ROWS) return;
    var wc = (stage.camX >> 3) + col, ntc = wc & 63;
    ppu0.setTile((ntc >> 5) & 1, ntc & 31, row, tileAt(wc, row));
  }

  /* ============================================================ init */
  function mergeObj(dst) {
    for (var a = 1; a < arguments.length; a++) {
      var src = arguments[a];
      if (!src) continue;
      for (var k in src) if (src.hasOwnProperty(k)) dst[k] = src[k];
    }
    return dst;
  }

  function resolveTiles() {
    var i;
    TILE = new Uint8Array(KIND_NAMES.length);
    for (i = 0; i < KIND_NAMES.length; i++) {
      var n = bankNameOf(i);
      if (!bgBank.has(n)) throw new Error('背景 bank 缺磚 ' + n + '（chr_world.js / main.js 的合併？）');
      TILE[i] = bgBank.index(n);
    }
    var q = CR.CHR_WORLD.quad;
    function pick(list) {
      for (var j = 0; j < list.length; j++) if (sprBank.has(list[j])) return sprBank.index(list[j]);
      throw new Error('精靈 bank 缺磚 ' + list.join(' / '));
    }
    S = {
      BEE0: pick(['W_BEE0']), BEE1: pick(['W_BEE1']),
      SHOT0: pick(['W_SHOT0']), SHOT1: pick(['W_SHOT1']),
      TUR0: q(sprBank, 'W_TUR0'), TUR1: q(sprBank, 'W_TUR1'),
      ZIG0: q(sprBank, 'W_ZIG0'), ZIG1: q(sprBank, 'W_ZIG1'),
      TANK0: q(sprBank, 'W_TANK0'), TANK1: q(sprBank, 'W_TANK1'),
      MROCK0: pick(['W_MROCK0']), MROCK1: pick(['W_MROCK1']),
      PLATE: q(sprBank, 'W_PLATE'), PLATEX: q(sprBank, 'W_PLATEX'),
      CORE0: q(sprBank, 'W_CORE0'), CORE1: q(sprBank, 'W_CORE1'),
      MUZZ0: pick(['W_MUZZ0']), MUZZ1: pick(['W_MUZZ1']),
      CAP0: pick(['S_CAP0', 'W_CAP0']), CAP1: pick(['S_CAP1', 'W_CAP1']),
      // ---- R3 擴關 ----
      LAVA0: pick(['W_LAVA0']), LAVA1: pick(['W_LAVA1']),
      CRAWL0: pick(['W_CRAWL0']), CRAWL1: pick(['W_CRAWL1']),
      MOAI0: q(sprBank, 'W_MOAI0'), MOAI1: q(sprBank, 'W_MOAI1'),
      RING0: pick(['W_RING0']), RING1: pick(['W_RING1']),
      SPLIT0: q(sprBank, 'W_SPLIT0'),
      HOMING0: pick(['W_HOMING0']), HOMING1: pick(['W_HOMING1']),
      TENT0: pick(['W_TENT0']), TENT1: pick(['W_TENT1']), TENTT: pick(['W_TENTT']),
      EGG0: pick(['W_EGG0']), EGG1: pick(['W_EGG1']),
      BRICK0: q(sprBank, 'W_BRICK0'), TUR4: q(sprBank, 'W_TUR4'),
      EYE0: q(sprBank, 'W_EYE0'), EYE1: q(sprBank, 'W_EYE1'),
      BRAIN0: q(sprBank, 'W_BRAIN0'), BRAIN1: q(sprBank, 'W_BRAIN1'),
      // 爆炸優先用 ship 的 S_EXPL（契約），缺席才退回自帶的 W_EXPL
      EXPL: [pick(['S_EXPL0', 'W_EXPL0']), pick(['S_EXPL1', 'W_EXPL1']),
        pick(['S_EXPL2', 'W_EXPL2']), pick(['S_EXPL3', 'W_EXPL3'])]
    };
  }

  function makeCtx() {
    return {
      stage: stage, ppu: ppu0, S: S,
      allocEnemy: allocEnemy, allocPart: allocPart, freeEnemy: freeEnemy,
      fire: fire, bigBullet: bigBullet, freeBullet: freeBullet,
      boom: boom, dropCapsule: dropCapsule, addScore: addScore,
      ship: shipRef, shipVel: shipVel,
      bgWrite: bgWrite, bgRestore: bgRestore,
      onCleared: function () { stage.cleared = true; stage.bossActive = false; stage.escapeT = 0; }
    };
  }

  function queryJump() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    var camx = parseInt(q.get('camx') || '', 10);
    var bs = parseInt(q.get('boss') || '', 10);
    var sg = parseInt(q.get('stage') || '', 10);
    if (!isNaN(sg) && sg >= 1 && sg <= STAGE_COUNT) pendingStage = sg;
    if (!isNaN(camx)) pendingJump = camx;
    if (!isNaN(bs) && bs >= 1) { pendingJump = -1; pendingBoss = bs; }    // -1 = 該關的 CAM_MAX
  }

  /* ============================================================ load（換關） */
  // 難度曲線：每關的基礎值在 stages.js 的 params；第二輪起再乘倍率（研究 §7-5 loop）
  var LOOP_BULLET_STEP = 24, LOOP_PERIOD_STEP = 10;
  function scaledParams(p, loop) {
    var o = {}, k;
    for (k in p) if (p.hasOwnProperty(k)) o[k] = p[k];
    if (loop > 0) {
      o.bulletScale = Math.min(460, o.bulletScale + loop * LOOP_BULLET_STEP);
      o.period = Math.max(48, o.period - loop * LOOP_PERIOD_STEP);
      o.easyPeriod = Math.max(56, o.easyPeriod - loop * LOOP_PERIOD_STEP);
      o.maxAlive = Math.min(16, o.maxAlive + loop);
    }
    return o;
  }

  function load(n, opt) {
    n = SH.clamp(n | 0, 1, STAGE_COUNT);
    opt = opt || {};
    def = CR.STAGES[n];
    COLS = def.cols;
    CAM_MAX = (COLS - SCREEN_COLS) * 8;
    CHECKPOINTS = [];
    for (var v = 0; v <= CAM_MAX; v += CHECKPOINT_STEP) CHECKPOINTS.push(v);

    // 角色 → 磚種索引
    ROLE = {};
    for (var r in def.tiles) if (def.tiles.hasOwnProperty(r)) ROLE[r] = K[def.tiles[r]];

    stage.index = n; stage.key = def.key; stage.name = def.name;
    stage.music = def.music; stage.bossKey = def.boss;
    stage.COLS = COLS; stage.CAM_MAX = CAM_MAX; stage.length = COLS;
    stage.CHECKPOINTS = CHECKPOINTS.slice();
    stage.BOSS_RESPAWN = CAM_MAX - BOSS_RESPAWN_BACK;
    stage.BOSS_COL0 = def.bossCol0;
    stage.minFree = def.minFree;
    stage.BIG_ROCKS = def.bigRocks || [];
    var m = def.marks || {};
    stage.AIR_COLS = (m.AIR_COLS === undefined) ? (def.airEnd + 34) : m.AIR_COLS;
    stage.BELT_COL0 = (m.BELT_COL0 === undefined) ? def.bossCol0 : m.BELT_COL0;
    stage.BELT_COL1 = (m.BELT_COL1 === undefined) ? def.bossCol0 : m.BELT_COL1;
    stage.FORT_COL0 = (m.FORT_COL0 === undefined) ? def.bossCol0 : m.FORT_COL0;

    var P = scaledParams(def.params, stage.loop);
    CR.Enemies.setParams(P);
    stage.MAX_ALIVE_ENEMY = P.maxAlive;
    stage.params = P;

    // 魔王：換成本關的實作（介面相同）
    if (CR.Boss && typeof CR.Boss.despawn === 'function') CR.Boss.despawn();
    var nb = (CR.Bosses && CR.Bosses[def.boss]) || CR.Bosses.core;
    CR.Boss = nb;

    if (ppu0) {
      muteBudget(ppu0, function () { CR.CHR_WORLD.applyStagePalette(ppu0, n); });
      build();
      api = CR.StageData.makeApi(stage);
      // 關卡 1 用 enemies.js 的 buildTable（fix3 驗收過的那一份），其餘走 stages.js 的共用骨架
      table = def.waves ? def.waves(stage, api, def) : CR.StageData.buildWaves(stage, api, def);
      spawner = SH.Spawner(table);
      scroller = SH.Scroller(ppu0, {
        nt: 2, cols: COLS, row0: 0, rows: ROWS,             // 列 26..29 是 HUD，絕不寫
        tileAt: tileAt, attrAt: attrAt
      });
      restart(opt.camX || 0);
    }
    return stage;
  }

  function initStage(ppu) {
    ppu0 = ppu;
    // 跨檔約定（ship）：遊戲區 = 名稱表列 0..CR.PLAY_ROWS-1，列 26..29 是 HUD
    if (CR.PLAY_ROWS && CR.PLAY_ROWS !== ROWS) {
      throw new Error('CR.PLAY_ROWS(' + CR.PLAY_ROWS + ') 與 stage 的遊戲區列數(' + ROWS + ') 不一致');
    }
    sprBank = NES.CHR.getBank('cr_spr');
    bgBank = NES.CHR.getBank('cr_bg');
    if (!sprBank) {              // main.js（ship agent）缺席時的保底：自己建 bank
      sprBank = NES.CHR.bank('cr_spr', mergeObj({}, CR.SPR_SHIP, CR.SPR_WORLD));
      NES.CHR.setPattern(1, sprBank);
    }
    if (!bgBank) {
      bgBank = NES.CHR.bank('cr_bg', mergeObj({}, CR.BG_SHIP || CR.BG_HUD, CR.BG_WORLD));
      NES.CHR.setPattern(0, bgBank);
    }
    resolveTiles();
    CR.CHR_WORLD.applyPalettes(ppu, !CR.SPR_SHIP);
    ppu.flickerStep = 0;          // NES.SH.OAM 自己做軟體 sprite cycling（§15.8-1）

    enemies = SH.Pool(POOL_ENEMY, function (i) { return CR.Enemies.make(i); });
    bullets = SH.Pool(POOL_BULLET, function (i) {
      return {
        i: i, x: 0, y: 0, w: 4, h: 4, vx: 0, vy: 0, t: 0,
        big: false, bg: false, ring: false, xs: FX.Vec(0), ys: FX.Vec(0)
      };
    });
    capsules = SH.Pool(POOL_CAP, function (i) {
      return { i: i, x: 0, y: 0, w: 8, h: 8, blue: false, seq: 0, t: 0, xs: FX.Vec(0) };
    });
    booms = SH.Pool(POOL_BOOM, function (i) { return { i: i, x: 0, y: 0, t: 0 }; });
    stage.enemies = enemies; stage.bullets = bullets;
    stage.capsules = capsules; stage.explosions = booms;

    var c = makeCtx();
    CR.Enemies.init(c);
    for (var bk in CR.Bosses) {                             // 六隻魔王共用同一組 ctx
      if (!CR.Bosses.hasOwnProperty(bk)) continue;
      if (CR.Bosses[bk] && typeof CR.Bosses[bk].init === 'function') CR.Bosses[bk].init(c);
    }

    queryJump();
    load(pendingStage || 1);
    return stage;
  }

  /* ============================================================ restart / checkpoint */
  function checkpoint(camX) {
    var best = CHECKPOINTS[0], i;
    for (i = 0; i < CHECKPOINTS.length; i++) if (CHECKPOINTS[i] <= camX) best = CHECKPOINTS[i];
    return best;
  }

  // 相機瞬移 = Pool.freeAll + Scroller.reset + Spawner.seek（NES.SH §15.8-5）
  function restart(camX) {
    camX = SH.clamp(camX | 0, 0, CAM_MAX);
    if (CR.Boss && CR.Boss.despawn) CR.Boss.despawn();
    enemies.freeAll(); bullets.freeAll(); capsules.freeAll(); booms.freeAll();
    CR.Enemies.reset();
    stage.bossActive = false;
    stage.cleared = false;
    stage.escapeT = 0;
    stage.pendingScore = 0;
    stage.camX = camX;
    stage.speed = SPEED_DEFAULT;
    FX.vsetPx(camVec, camX);
    muteBudget(ppu0, function () { scroller.reset(camX); });
    spawner.seek(camX >> 3);
    return stage;
  }

  /* ============================================================ clearScreen（藍膠囊） */
  function clearScreen() {
    var n = { bullets: 0, enemies: 0, score: 0 }, i, it;
    it = bullets.items;
    for (i = 0; i < it.length; i++) if (it[i].alive) { freeBullet(it[i]); n.bullets++; }
    it = enemies.items;
    for (i = 0; i < it.length; i++) {
      var e = it[i];
      if (e.alive && e.small && !e.boss) { n.score += e.score; e.kill(); n.enemies++; }
    }
    return n;
  }

  /* ============================================================ solidAt */
  function solidAtWorld(wx, y) {
    if (y < 0 || y >= GAME_H) return true;                  // 遊戲區上下邊界 = 牆
    var c = wx >> 3, r = y >> 3;
    if (c < 0 || c >= COLS) return true;
    return isSolidKind(map[r * MAX_COLS + c]);
  }
  function solidAt(x, y) { return solidAtWorld((stage.camX + (x | 0)) | 0, y | 0); }

  /* ============================================================ spawnTest */
  function spawnTest(kind, x, y) {
    x = x | 0; y = y | 0;
    switch (kind) {
      case 'fan': return CR.Enemies.spawnFan(x, y);
      case 'turret': return CR.Enemies.spawn('turret', x, y, { wx: stage.camX + x });
      case 'turret_ceil': return CR.Enemies.spawn('turret', x, y, { wx: stage.camX + x, ceiling: true });
      case 'zig': return CR.Enemies.spawn('zig', x, y, {});
      case 'tank': return CR.Enemies.spawn('tank', x, y, {});
      case 'rock': return CR.Enemies.spawn('rock', x, y, {});
      case 'bullet': return fire(x, y, -CR.Enemies.bulletSpeed(), 0);
      case 'capsule': return dropCapsule(x, y, false);
      case 'capsule_blue': return dropCapsule(x, y, true);
      case 'boom': return boom(x, y);
      case 'boss': stage.bossActive = true; return CR.Boss.spawn();
      // ---- R3 擴關的新敵人（測試 / 除錯用）----
      case 'lava': case 'crawl': case 'split': case 'homing': case 'egg':
      case 'brick': case 'turret4': case 'tent':
        return CR.Enemies.spawn(kind, x, y, { wx: stage.camX + x });
      case 'moai': return CR.Enemies.spawnMoai(x, y, { wx: stage.camX + x });
      default: throw new Error('CR.stage.spawnTest：未知種類 ' + kind);
    }
  }

  /* ============================================================ update */
  function stepShipVel() {
    var sh = CR.ship;
    if (!sh) { shipV.vx = 0; shipV.vy = 0; shipPrev.has = false; return; }
    if (shipPrev.has) { shipV.vx = (sh.x - shipPrev.x) * 16; shipV.vy = (sh.y - shipPrev.y) * 16; }
    shipPrev.x = sh.x; shipPrev.y = sh.y; shipPrev.has = true;
  }

  function stepBullet(b) {
    if (b.big) { b.t++; return; }                           // 雷射：位置固定，生死由 boss 管
    FX.vadd(b.xs, b.vx); FX.vadd(b.ys, b.vy);
    b.x = FX.vpx(b.xs); b.y = FX.vpx(b.ys);
    b.t++;
    if (b.x < -8 || b.x > 264 || b.y < -8 || b.y > GAME_H + 8) b.alive = false;
  }
  function stepCapsule(c) {
    FX.vadd(c.xs, CAP_VX);
    c.x = FX.vpx(c.xs);
    c.t++;                                                   // 無壽命：只有飛出畫面才回收
    if (c.x < -8) c.alive = false;
  }
  function stepBoom(e) { e.t++; if (e.t >= BOOM_FRAMES * 4) e.alive = false; }

  // R3：減速 / 加速段（關卡 4 的「倒立世界」）
  function speedFor(camCol) {
    var z = def.speedZones, i;
    if (z) for (i = 0; i < z.length; i++) if (camCol >= z[i][0] && camCol < z[i][1]) return z[i][2];
    return SPEED_DEFAULT;
  }

  function update(g) {
    frames++; updates++;

    // ?stage= / ?camx= / ?boss= 除錯跳關（等 main 走完 title → play 的初始化再套用）
    if ((pendingJump !== null || pendingStage) && updates >= 2) {
      var j = pendingJump, bs = pendingBoss, sg = pendingStage;
      pendingJump = null; pendingBoss = 0; pendingStage = 0;
      if (sg && sg !== stage.index) load(sg);
      if (j !== null) restart(j < 0 ? CAM_MAX : j);
      if (bs >= 1) { stage.bossActive = true; CR.Boss.spawn(); CR.Boss.force(bs); }
    }

    stepShipVel();

    // ── 相機（魔王區停止捲動）
    if (!stage.bossActive && !stage.cleared && stage.camX < CAM_MAX) {
      stage.speed = speedFor(stage.camX >> 3);
      FX.vadd(camVec, stage.speed);
      stage.camX = FX.vpx(camVec);
      if (stage.camX >= CAM_MAX) { stage.camX = CAM_MAX; FX.vsetPx(camVec, CAM_MAX); }
    }
    scroller.update(stage.camX);
    spawner.update(stage.camX >> 3, stage);

    enemies.each(CR.Enemies.step);
    bullets.each(stepBullet);
    capsules.each(stepCapsule);
    booms.each(stepBoom);

    if (!stage.bossActive && !stage.cleared && stage.camX >= CAM_MAX) {
      stage.bossActive = true;
      CR.Boss.spawn();
    }
    if (stage.bossActive) {
      CR.Boss.update();
      if (!CR.Boss.active()) stage.bossActive = false;
    }
    return stage;
  }

  /* ============================================================ draw */
  function draw(oam) {
    if (!oam) return;
    var f = frames, put = CR.Enemies.put;

    booms.each(function (e) {                                // 爆炸 prio 4
      var fr = (e.t / BOOM_FRAMES) | 0;
      put(oam, e.x, e.y, S.EXPL[fr > 3 ? 3 : fr], PAL_BOOM, false, PRIO_BOOM);
    });
    enemies.each(function (e) { CR.Enemies.draw(e, oam, f); });   // 敵 / 魔王部位 prio 3
    if (stage.bossActive) CR.Boss.draw(oam, f);
    bullets.each(function (b) {                              // 敵彈 prio 2
      if (b.bg) return;
      var bf = (f >> 2) & 1;
      var t = b.ring ? (bf ? S.RING1 : S.RING0) : (bf ? S.SHOT1 : S.SHOT0);
      put(oam, b.x - 2, b.y - 2, t, bf ? PAL_EBULLET_ALT : PAL_EBULLET, false, PRIO_EBULLET);
    });
    capsules.each(function (c) {                             // 膠囊 prio 2（紅 = 組 1、藍 = 組 0）
      put(oam, c.x, c.y, ((c.t >> 3) & 1) ? S.CAP1 : S.CAP0, c.blue ? PAL_CAP_BLUE : PAL_CAP_RED, false, PRIO_CAP);
    });
  }

  /* ============================================================ 匯出 */
  stage.init = initStage;
  stage.update = update;
  stage.draw = draw;
  stage.checkpoint = checkpoint;
  stage.restart = restart;
  stage.load = load;
  stage.setLoop = function (n) { stage.loop = Math.max(0, n | 0); return stage.loop; };
  stage.redraw = function () {
    muteBudget(ppu0, function () { scroller.reset(stage.camX); });
    return stage;
  };
  stage.solidAt = solidAt;
  stage.solidAtWorld = solidAtWorld;
  stage.clearScreen = clearScreen;
  stage.spawnTest = spawnTest;
  stage.spawnTurretAt = spawnTurretAt;
  stage.spawnAtSurface = spawnAtSurface;
  stage.spawnMoaiAt = spawnMoaiAt;
  stage.tileAt = tileAt;
  stage.attrAt = attrAt;
  stage.kindAt = kindAt;
  stage.tileIndex = function (name) { return TILE[K[name]]; };
  stage.ceilAt = function (c) { return ceilH[c] | 0; };
  stage.floorAt = function (c) { return floorH[c] | 0; };
  stage.takeScore = function () { var s = stage.pendingScore; stage.pendingScore = 0; return s; };
  stage.aliveEnemies = aliveSmall;
  stage.aliveBullets = function () { return bullets.count; };
  stage.aliveCapsules = function () { return capsules.count; };
  stage.capsuleSeq = function () { return capsuleSeq; };
  stage.mkOam = function (ppu, opt) { return SH.OAM(ppu, opt); };
  stage.scroller = function () { return scroller; };
  stage.spawner = function () { return spawner; };
  stage.spawnTable = function () { return table; };
  stage.frames = function () { return frames; };
  stage.scrollX = function () { return stage.camX % 512; };
  stage.def = function () { return def; };
  stage.info = function () {
    return {
      camX: stage.camX, camCol: stage.camX >> 3, speed: stage.speed,
      stage: stage.index, name: stage.name, loop: stage.loop, bossKey: stage.bossKey,
      enemies: aliveSmall(), bullets: bullets.count, capsules: capsules.count,
      booms: booms.count, capsuleSeq: capsuleSeq,
      bossActive: stage.bossActive, cleared: stage.cleared, escapeT: stage.escapeT,
      boss: CR.Boss.state(), events: spawner ? spawner.index : 0,
      score: stage.pendingScore, scrollBytes: scroller ? scroller.bytes : 0,
      rank: CR.Enemies.rank()
    };
  };

  CR.stage = stage;
})();
