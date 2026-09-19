/*
 * games/cruiser/stage1.js — 《星塵巡航艦》關卡 1「小行星帶 → 星際要塞」（CR.stage）
 * ---------------------------------------------------------------------------
 * 擁有者：stage agent ｜ 依賴：engine/{fixed,chr,ppu,shmup}.js
 *                      、games/cruiser/{chr_world,enemies,boss}.js
 * 對外契約（docs/TASKS.md R2）：
 *   CR.stage = { init(ppu), update(g), draw(oam), checkpoint(camX), restart(camX),
 *                enemies, bullets, capsules, camX, speed, length, bossActive, cleared,
 *                solidAt(x, y), clearScreen(), spawnTest(kind, x, y) }
 *
 * 版面：HUD 在**下方 32 線**（main 做 `split(208, …)`）⇒ 遊戲區 = 掃描線 0..207 = 名稱表列 0..25。
 *       欄串流用 `NES.SH.Scroller({row0: 0, rows: 26})`，**絕不碰列 26..29**（ship 的 HUD）。
 *       `ppu.scroll` / `ppu.split` 由 main.js（ship agent）每幀設定，本檔不碰（NES.SH 契約 §15.5）。
 *
 * 地形（12 畫面 = 384 欄 × 26 列，全部原創）：
 *   ① 欄 0..127   小行星帶：星空 + 30 顆可撞小行星（16×16）與碎片，無天花板 / 地板
 *   ② 欄 128..287 要塞入口：天花板 / 地板凸起（3..8 列）、鉚釘牆、管線、壁燈、貼地 / 貼天砲台
 *   ③ 欄 288..383 核心室：等高通道 + 暗紅背板；相機到底後捲動停止、魔王「核心要塞」進場
 *   資料 = **RLE 段表（24 段）+ 決定性 LCG 佈點**，沒有 384×26 的明碼陣列。
 *
 * 手感數字（docs/research/03…/16_宇宙巡航艦_沙羅曼蛇.md §10）：
 *   捲動 **0.5 px/幀**（8.8 = 128）⇒ 全關 2816 px ≈ 5632 幀 ≈ 94 秒；
 *   檢查點 **每 512 px**（camX 0 / 512 / 1024 / 1536 / 2048 / 2560）；
 *   膠囊 vx = −0.5 px/幀、無壽命（只有飛出畫面才回收）；
 *   **每第 16 顆膠囊是藍色清屏膠囊**（由 stage 計數，見 `capsuleSeq`；ship 不必重複計）。
 *
 * VBlank 預算：`Scroller.update()` 每幀 ≤ 39 byte（26 磚 + 13 屬性，每 2 欄一次）；
 *   魔王艦體 36 byte / 雷射 3×22 = 66 byte，都是狀態切換那一幀才寫，皆 < 160。
 *   `restart()` 走 `Scroller.reset()`（2400 byte）＝真機「關閉 rendering 重建畫面」，
 *   所以那段會把 `ppu.budget.mute` 打開、不計入單幀預算。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX, SH = NES.SH;
  if (!FX) throw new Error('games/cruiser/stage1.js 需要 engine/fixed.js');
  if (!SH || !SH.Scroller) throw new Error('games/cruiser/stage1.js 需要 engine/shmup.js（NES.SH）');
  if (!CR.Enemies || !CR.Boss) throw new Error('games/cruiser/stage1.js 需要 enemies.js / boss.js 先載入');

  /* ============================================================ 常數 */
  var COLS = 384, ROWS = 26;              // 遊戲區列 0..25（列 26..29 = HUD）
  var SCREEN_COLS = 32, GAME_H = ROWS * 8;                  // 208
  var CAM_MAX = (COLS - SCREEN_COLS) * 8;                   // 2816
  // QA R2 P3-2：死在魔王戰用一般檢查點（2560）要空捲 440 幀（7.4 秒）才會再遇到魔王；
  // 魔王段另給一個復活點，距離 CAM_MAX 只有 56 px ⇒ 112 幀 ≈ 1.9 秒。main.js 的 respawn() 會用。
  var BOSS_RESPAWN = 2760;
  var CHECKPOINT_STEP = 512;
  var CHECKPOINTS = (function () { var a = [], v = 0; while (v <= CAM_MAX) { a.push(v); v += CHECKPOINT_STEP; } return a; })();
  var SPEED_DEFAULT = FX.v88(0, 128);     // 0.5 px/幀（研究 16 §10）
  var CAP_VX = -FX.v88(0, 128);           // 膠囊往左飄 0.5 px/幀
  var BLUE_EVERY = 16;                    // 每第 16 顆膠囊 = 藍色清屏膠囊
  var MAX_ALIVE_ENEMY = 10;               // 每畫面同時（非魔王）敵 ≤ 10
  var POOL_ENEMY = 24, POOL_BULLET = 40, POOL_CAP = 6, POOL_BOOM = 12;
  var BOOM_FRAMES = 6;
  var PRIO_EBULLET = 2, PRIO_BOOM = 4, PRIO_CAP = 2;
  // 調色盤組：敵彈 = stage 的 2（綠黃）；爆炸 = ship 的 1（紅黃白）；膠囊 紅 = 1 / 藍 = 0（CR.PAL）
  // QA R2 P2-4：敵彈兩幀交替調色盤 ⇒ spr2 色 3 = 淡黃 $38 ／ spr1 色 3 = 白 $30（黃 ⇄ 白閃爍）
  var PAL_EBULLET = 2, PAL_EBULLET_ALT = 1, PAL_BOOM = 1, PAL_CAP_RED = 1, PAL_CAP_BLUE = 0;

  /* ============================================================ 磚種 */
  var KIND_NAMES = [
    'SPACE', 'STARA', 'STARB',
    'ROCKA0', 'ROCKA1', 'ROCKA2', 'ROCKA3',
    'ROCKB0', 'ROCKB1', 'ROCKB2', 'ROCKB3',
    'ROCKC0', 'ROCKC1', 'ROCKC2', 'ROCKC3',
    'DEB0', 'DEB1',
    'FLOOR_TOP', 'CEIL_BOT', 'SOLID', 'WALL', 'WALL2', 'PIPE', 'PIPEH', 'LAMP',
    'BOSSBG', 'GRID', 'HULL', 'HULLR', 'VENT', 'HULLC', 'LWARN', 'LBEAM'
  ];
  var K = {};
  (function () { for (var i = 0; i < KIND_NAMES.length; i++) K[KIND_NAMES[i]] = i; })();

  function bankNameOf(kind) {
    var n = KIND_NAMES[kind];
    var m = /^ROCK([ABC])([0-3])$/.exec(n);
    if (m) return 'W_ROCK' + m[1] + '_r' + (m[2] >> 1) + 'c' + (m[2] & 1);
    return 'W_' + n;
  }
  function isSolidKind(k) { return (k >= K.ROCKA0 && k <= K.DEB1) || (k >= K.FLOOR_TOP && k <= K.LAMP); }

  /* ============================================================ 地形資料（RLE） */
  // [欄數, 天花板列數, 地板列數]，總和 384
  // QA R2 P2-3：原本最窄處只剩 13~16 列（[5,8] / [4,7] / [6,6]），配合瞄準彈容錯趨近 0，
  // 機器人帶滿強化也過不了欄 144~158 / 194~210。
  // 改成 **天花板 + 地板 ≤ 8 列 ⇒ 可用高度永遠 ≥ 18 列（144 px）**；
  // 起伏 / 天地反轉的節奏全部保留，只是落差變緩。
  var TERRAIN = [
    [96, 0, 0], [8, 0, 1], [8, 1, 2], [8, 2, 2], [4, 2, 3], [4, 3, 3],          // ① 小行星帶
    [16, 3, 3], [8, 3, 5], [8, 4, 4], [8, 3, 3], [8, 5, 3], [8, 3, 5],          // ② 要塞入口
    [8, 3, 3], [8, 3, 5], [8, 5, 3], [8, 3, 3], [8, 3, 5], [8, 5, 3],
    [8, 3, 3], [8, 4, 4], [8, 3, 3], [16, 4, 4], [16, 3, 3],
    [96, 3, 3]                                                                   // ③ 核心室
  ];

  var ceilH = new Uint8Array(COLS), floorH = new Uint8Array(COLS);
  var map = new Uint8Array(COLS * ROWS);
  var ATTR_ROWS = 13;                                       // 列 0..25 → row16 0..12
  var attr = new Uint8Array((COLS >> 1) * ATTR_ROWS);

  var seed = 0;
  function srand(s) { seed = s | 0; }
  function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return ((seed >> 13) % n + n) % n; }

  function setK(c, r, k) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r * COLS + c] = k; }
  function kindAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return K.SPACE;
    return map[r * COLS + c];
  }
  function putRock(c, r, type) {
    var b = [K.ROCKA0, K.ROCKB0, K.ROCKC0][type % 3];
    setK(c, r, b); setK(c + 1, r, b + 1); setK(c, r + 1, b + 2); setK(c + 1, r + 1, b + 3);
  }

  function build() {
    var c, r, i, j;
    c = 0;
    for (i = 0; i < TERRAIN.length; i++) {
      for (j = 0; j < TERRAIN[i][0] && c < COLS; j++, c++) { ceilH[c] = TERRAIN[i][1]; floorH[c] = TERRAIN[i][2]; }
    }
    while (c < COLS) { ceilH[c] = ceilH[c - 1]; floorH[c] = floorH[c - 1]; c++; }

    map.fill(K.SPACE);
    for (c = 0; c < COLS; c++) {
      var ch = ceilH[c], fh = floorH[c], bossRoom = (c >= 288);
      for (r = ch; r < ROWS - fh; r++) {
        if (bossRoom) setK(c, r, ((c % 10) === 1 && (r & 1) === 0) ? K.GRID : K.BOSSBG);   // 只留直立支柱，別跟魔王搶視線
        else if (c < 128) {
          if (((c * 7 + r * 13) % 29) === 0) setK(c, r, K.STARA);
          else if (((c * 5 + r * 11) % 37) === 0) setK(c, r, K.STARB);
        }
      }
      for (r = 0; r < ch; r++) {                             // 天花板
        if (r === ch - 1) setK(c, r, K.CEIL_BOT);
        else if (r === 1 && ch >= 3) setK(c, r, K.PIPEH);   // 列 0 被顯示裁掉，管線放列 1
        else setK(c, r, ((c & 3) === 0) ? K.WALL2 : K.SOLID);
      }
      for (r = ROWS - fh; r < ROWS; r++) {                   // 地板
        if (r === ROWS - fh) setK(c, r, K.FLOOR_TOP);
        else if (r === ROWS - 1) setK(c, r, K.WALL);
        else if ((c & 7) === 3) setK(c, r, K.PIPE);
        else setK(c, r, ((c & 3) === 0) ? K.WALL2 : K.SOLID);
      }
      if (ch >= 2 && (c % 12) === 5) setK(c, ch - 1, K.LAMP);   // 壁燈每 12 欄一盞
    }

    // ── 小行星帶佈點（決定性 LCG，每次 build 都一樣）─────────────
    // QA R2 P2-3：欄 100 之後天花板 / 地板已經開始長出來（通道收窄），再放岩石會變成
    //             「牆 + 石頭」雙重夾擊；岩石 / 碎片只鋪到欄 99，欄 100~127 留成純過渡段。
    //             （rnd 仍照原順序抽，所以欄 < 100 的佈點與 R2 完全一樣。）
    var ROCK_MAX_COL = 100;
    srand(0x5A17);
    for (i = 0; i < 18; i++) { var ra = 24 + i * 6, rb = 2 + (rnd(11) << 1), rt = rnd(3); if (ra < ROCK_MAX_COL) putRock(ra, rb, rt); }
    for (i = 0; i < 12; i++) { var rc = 28 + i * 8, rd2 = 2 + (rnd(11) << 1), rt2 = rnd(3); if (rc < ROCK_MAX_COL) putRock(rc, rd2, rt2); }
    for (i = 0; i < 26; i++) {
      var cd = 20 + i * 4 + rnd(3), rd = 1 + rnd(24), kk = kindAt(cd, rd);
      if (cd < ROCK_MAX_COL && (kk === K.SPACE || kk === K.STARA || kk === K.STARB)) setK(cd, rd, rnd(2) ? K.DEB0 : K.DEB1);
    }
    for (c = 0; c < 20; c++) {                               // 出發區淨空
      for (r = 0; r < ROWS; r++) {
        var k0 = kindAt(c, r);
        if (k0 !== K.SPACE && k0 !== K.STARA && k0 !== K.STARB) setK(c, r, K.SPACE);
      }
    }
    buildAttr();
  }

  function buildAttr() {
    var w16 = COLS >> 1, c16, r16, dx, dy;
    attr.fill(3);
    for (r16 = 0; r16 < ATTR_ROWS; r16++) {
      for (c16 = 0; c16 < w16; c16++) {
        var rock = false, struct = false;
        for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
          var k = kindAt(c16 * 2 + dx, r16 * 2 + dy);
          if (k >= K.ROCKA0 && k <= K.DEB1) rock = true;
          else if (k >= K.FLOOR_TOP && k <= K.LAMP) struct = true;
        }
        attr[r16 * w16 + c16] = rock ? 1 : (struct ? 2 : 3);
      }
    }
  }

  /* ============================================================ 狀態 */
  var ppu0 = null, sprBank = null, bgBank = null;
  var TILE = null, S = null;
  var enemies = null, bullets = null, capsules = null, booms = null;
  var scroller = null, spawner = null, table = null;
  var camVec = FX.Vec(0);
  var frames = 0, updates = 0, pendingJump = null, pendingBoss = 0;
  var capsuleSeq = 0;
  var shipPrev = { x: 0, y: 0, has: false }, shipV = { vx: 0, vy: 0 };

  var stage = {
    COLS: COLS, ROWS: ROWS, CAM_MAX: CAM_MAX, GAME_H: GAME_H,
    CHECKPOINTS: CHECKPOINTS.slice(), CHECKPOINT_STEP: CHECKPOINT_STEP, BOSS_RESPAWN: BOSS_RESPAWN,
    BLUE_EVERY: BLUE_EVERY, MAX_ALIVE_ENEMY: MAX_ALIVE_ENEMY,
    length: COLS,
    camX: 0,
    speed: SPEED_DEFAULT,
    bossActive: false,
    cleared: false,
    pendingScore: 0,
    enemies: null, bullets: null, capsules: null, explosions: null,
    K: K, KIND_NAMES: KIND_NAMES
  };

  /* ============================================================ 名稱表資料源 */
  function tileAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return TILE[K.SPACE];
    return TILE[map[row * COLS + col]];
  }
  function attrAt(col16, row16) {
    if (row16 < 0 || row16 >= ATTR_ROWS || col16 < 0 || col16 >= (COLS >> 1)) return 3;
    return attr[row16 * (COLS >> 1) + col16];
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
    if (aliveSmall() >= MAX_ALIVE_ENEMY) return null;
    return enemies.alloc();
  }
  function allocPart() { return enemies.alloc(); }          // 給 boss.js（不受上限管制）
  function freeEnemy(e) { enemies.free(e); }

  function fire(x, y, vx, vy) {
    var b = bullets.alloc();
    if (!b) return null;
    b.big = false; b.bg = false;
    b.x = (x - 2) | 0; b.y = (y - 2) | 0; b.w = 4; b.h = 4;
    FX.vsetPx(b.xs, b.x); FX.vsetPx(b.ys, b.y);
    b.vx = vx | 0; b.vy = vy | 0; b.t = 0;
    return b;
  }
  function bigBullet(x, y, w, h) {                          // 魔王雷射（畫面走背景磚）
    var b = bullets.alloc();
    if (!b) return null;
    b.big = true; b.bg = true;
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

  // 膠囊：每第 16 顆是藍色（清屏）。forceBlue 只給 spawnTest / 除錯用。
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

  // 砲台貼在指定世界欄的地板 / 天花板上
  function spawnTurretAt(col, ceiling) {
    if (col < 0 || col >= COLS) return null;
    var y;
    if (ceiling) {
      if (ceilH[col] < 1) return null;
      y = ceilH[col] * 8 + 2;
    } else {
      if (floorH[col] < 1) return null;
      y = (ROWS - floorH[col]) * 8 - 14;
    }
    return CR.Enemies.spawn('turret', col * 8 - stage.camX, y, { wx: col * 8, ceiling: !!ceiling });
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
      PLATE: q(sprBank, 'W_PLATE'), PLATEX: q(sprBank, 'W_PLATEX'),
      CORE0: q(sprBank, 'W_CORE0'), CORE1: q(sprBank, 'W_CORE1'),
      MUZZ0: pick(['W_MUZZ0']), MUZZ1: pick(['W_MUZZ1']),
      CAP0: pick(['S_CAP0', 'W_CAP0']), CAP1: pick(['S_CAP1', 'W_CAP1']),
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
      onCleared: function () { stage.cleared = true; stage.bossActive = false; }
    };
  }

  function queryJump() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    var camx = parseInt(q.get('camx') || '', 10);
    var bs = parseInt(q.get('boss') || '', 10);
    if (!isNaN(camx)) pendingJump = camx;
    if (!isNaN(bs) && bs >= 1) { pendingJump = CAM_MAX; pendingBoss = bs; }
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

    build();

    enemies = SH.Pool(POOL_ENEMY, function (i) { return CR.Enemies.make(i); });
    bullets = SH.Pool(POOL_BULLET, function (i) {
      return { i: i, x: 0, y: 0, w: 4, h: 4, vx: 0, vy: 0, t: 0, big: false, bg: false, xs: FX.Vec(0), ys: FX.Vec(0) };
    });
    capsules = SH.Pool(POOL_CAP, function (i) {
      return { i: i, x: 0, y: 0, w: 8, h: 8, blue: false, seq: 0, t: 0, xs: FX.Vec(0) };
    });
    booms = SH.Pool(POOL_BOOM, function (i) { return { i: i, x: 0, y: 0, t: 0 }; });
    stage.enemies = enemies; stage.bullets = bullets;
    stage.capsules = capsules; stage.explosions = booms;

    var c = makeCtx();
    CR.Enemies.init(c);
    CR.Boss.init(c);

    table = CR.Enemies.buildTable(stage);
    spawner = SH.Spawner(table);
    scroller = SH.Scroller(ppu, {
      nt: 2, cols: COLS, row0: 0, rows: ROWS,     // 列 26..29 是 HUD，絕不寫
      tileAt: tileAt, attrAt: attrAt
    });

    queryJump();
    restart(0);
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
    CR.Boss.despawn();
    enemies.freeAll(); bullets.freeAll(); capsules.freeAll(); booms.freeAll();
    CR.Enemies.reset();
    stage.bossActive = false;
    stage.cleared = false;
    stage.pendingScore = 0;
    stage.camX = camX;
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
  // **座標是畫面座標**（x 0..255、y 0..207），與 CR 的其他碰撞框一致
  // （main.js 直接把船的畫面矩形四角丟進來）；世界座標版另有 solidAtWorld()。
  function solidAtWorld(wx, y) {
    if (y < 0 || y >= GAME_H) return true;                  // 遊戲區上下邊界 = 牆
    var c = wx >> 3, r = y >> 3;
    if (c < 0 || c >= COLS) return true;
    return isSolidKind(map[r * COLS + c]);
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
      case 'bullet': return fire(x, y, -CR.Enemies.bulletSpeed(), 0);
      case 'capsule': return dropCapsule(x, y, false);
      case 'capsule_blue': return dropCapsule(x, y, true);
      case 'boom': return boom(x, y);
      case 'boss': stage.bossActive = true; return CR.Boss.spawn();
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

  function update(g) {
    frames++; updates++;

    // ?camx= / ?boss= 除錯跳關（等 main 走完 title → play 的初始化再套用）
    if (pendingJump !== null && updates >= 2) {
      var j = pendingJump, bs = pendingBoss;
      pendingJump = null; pendingBoss = 0;
      restart(j);
      if (bs >= 1) { stage.bossActive = true; CR.Boss.spawn(); CR.Boss.force(bs); }
    }

    stepShipVel();

    // ── 相機（魔王區停止捲動）
    if (!stage.bossActive && !stage.cleared && stage.camX < CAM_MAX) {
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
      put(oam, b.x - 2, b.y - 2, bf ? S.SHOT1 : S.SHOT0, bf ? PAL_EBULLET_ALT : PAL_EBULLET, false, PRIO_EBULLET);
    });
    capsules.each(function (c) {                             // 膠囊 prio 2（紅 = 組 2、藍 = 組 3）
      put(oam, c.x, c.y, ((c.t >> 3) & 1) ? S.CAP1 : S.CAP0, c.blue ? PAL_CAP_BLUE : PAL_CAP_RED, false, PRIO_CAP);
    });
  }

  /* ============================================================ 匯出 */
  stage.init = initStage;
  stage.update = update;
  stage.draw = draw;
  stage.checkpoint = checkpoint;
  stage.restart = restart;
  stage.solidAt = solidAt;
  stage.solidAtWorld = solidAtWorld;
  stage.clearScreen = clearScreen;
  stage.spawnTest = spawnTest;
  stage.spawnTurretAt = spawnTurretAt;
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
  stage.info = function () {
    return {
      camX: stage.camX, camCol: stage.camX >> 3, speed: stage.speed,
      enemies: aliveSmall(), bullets: bullets.count, capsules: capsules.count,
      booms: booms.count, capsuleSeq: capsuleSeq,
      bossActive: stage.bossActive, cleared: stage.cleared,
      boss: CR.Boss.state(), events: spawner ? spawner.index : 0,
      score: stage.pendingScore, scrollBytes: scroller ? scroller.bytes : 0,
      rank: CR.Enemies.rank()
    };
  };

  CR.stage = stage;
})();
