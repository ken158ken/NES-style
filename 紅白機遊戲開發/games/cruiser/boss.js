/*
 * games/cruiser/boss.js — 《星塵巡航艦》關卡 1 魔王「核心要塞」（CORE FORTRESS）
 * ---------------------------------------------------------------------------
 * 擁有者：stage agent ｜ 依賴：engine/{fixed,shmup}.js、games/cruiser/{chr_world,enemies}.js
 * 由 stage1.js 驅動（stage 提供物件池、敵彈、爆炸、背景寫入）。
 *
 * 48×48 的艦體用「**背景磚 6×6**（核心室捲動停止 ⇒ 名稱表就是畫布）」畫，
 * 只有可打擊 / 會動的部位用精靈：外殼板 4 片（各 4 顆 8×8）、核心（4 顆）、雷射砲口（3 顆）。
 * ⇒ 每條掃描線最多 4 顆魔王精靈（上排兩片板 / 中排核心 / 下排兩片板），
 *   留足空間給船、自機彈、敵彈，不會一進魔王戰就整片閃爍。
 *
 * 血量（總控依研究 16 §10 調整）：**總血量 24** = 外殼板 4 片 × 4 + 核心 8。
 * 三階段 + **每掉一階段換一張艦體形變圖**（HULL_MAPS[1] → [2] → [3]，同一組背景磚重排）：
 *   進場   從畫面右緣滑入 60 幀（只有精靈會動；落位那一幀一次寫入 36 byte 艦體）
 *   階段 1 外殼板 4 片各 hp 4；**只有板子可被打中**（核心尚未配置）
 *   階段 2 核心露出 hp 8；週期開合：開 60 幀（可打）/ 合 90 幀（無敵）；開啟瞬間放環形 8 彈
 *   階段 3 核心 hp ≤ 3：三連雷射（3 條橫線用背景磚拼、預告 30 幀 → 射 60 幀 → 冷卻 60 幀）
 *          + 每輪環形 8 彈
 *   死亡   大爆炸 90 幀 → `CR.stage.cleared = true`
 *
 * 雷射的碰撞：3 條線各是 `CR.stage.bullets` 裡的一顆「大子彈」（w = 砲口到畫面左緣、h = 6），
 * main.js 既有的「敵彈 × 船」判定直接生效，不必為魔王加特例；畫面則走背景磚，不吃精靈。
 * 角度依 `NES.SH`：0 = 右、64 = 下、128 = 左、192 = 上。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX, SH = NES.SH;
  if (!FX) throw new Error('games/cruiser/boss.js 需要 engine/fixed.js');
  if (!SH || !SH.vel) throw new Error('games/cruiser/boss.js 需要 engine/shmup.js（NES.SH）');

  var W = 48, H = 48;
  var HOME_X = 176, HOME_Y = 72;          // 落位座標（8 對齊：col 22、row 9）
  var START_X = 256;
  var ENTER_FRAMES = 60;
  var ENTER_V = -FX.v88(1, 85);           // (256-176)/60 ≈ 1.333 px/幀

  var PLATE_HP = 4, CORE_HP = 8, PHASE3_HP = 3;     // 總血量 4×4 + 8 = 24
  var PLATE_SCORE = 500, CORE_SCORE = 5000;
  var OPEN_FRAMES = 60, SHUT_FRAMES = 90;
  var WARN_FRAMES = 30, BEAM_FRAMES = 60, COOL_FRAMES = 60;
  var DEATH_FRAMES = 90;
  var RING_N = 8;
  var RING_SPEED = FX.v88(1, 32);         // 1.125 px/幀
  var AIM_SPEED = FX.v88(2, 0);           // 2.0 px/幀（研究 16 §10 敵彈基礎速度）
  var P1_FIRE = 100;

  var PLATE_OFF = [[0, 0], [32, 0], [0, 32], [32, 32]];   // 四角
  var CORE_OFF = [16, 16];                                 // 正中
  var LASER_OFF = [8, 24, 40];                             // 三條雷射的相對 y（對齊磚列）

  // 艦體 6×6 背景磚配置：每個階段一張（形變）。名稱由 stage 解析成磚索引。
  var HULL_MAPS = {
    1: [                                     // 階段 1：完整裝甲
      ['HULLC', 'HULL', 'HULLR', 'HULLR', 'HULL', 'HULLC'],
      ['HULL', 'HULL', 'VENT', 'VENT', 'HULL', 'HULL'],
      ['HULLR', 'VENT', 'HULL', 'HULL', 'VENT', 'HULLR'],
      ['HULLR', 'VENT', 'HULL', 'HULL', 'VENT', 'HULLR'],
      ['HULL', 'HULL', 'VENT', 'VENT', 'HULL', 'HULL'],
      ['HULLC', 'HULL', 'HULLR', 'HULLR', 'HULL', 'HULLC']
    ],
    2: [                                     // 階段 2：外殼脫落、散熱柵大開
      ['GRID', 'VENT', 'HULLC', 'HULLC', 'VENT', 'GRID'],
      ['VENT', 'HULLR', 'VENT', 'VENT', 'HULLR', 'VENT'],
      ['HULLC', 'VENT', 'HULL', 'HULL', 'VENT', 'HULLC'],
      ['HULLC', 'VENT', 'HULL', 'HULL', 'VENT', 'HULLC'],
      ['VENT', 'HULLR', 'VENT', 'VENT', 'HULLR', 'VENT'],
      ['GRID', 'VENT', 'HULLC', 'HULLC', 'VENT', 'GRID']
    ],
    3: [                                     // 階段 3：結構崩壞、只剩骨架與核心座
      ['GRID', 'GRID', 'VENT', 'VENT', 'GRID', 'GRID'],
      ['GRID', 'HULLC', 'HULLR', 'HULLR', 'HULLC', 'GRID'],
      ['VENT', 'HULLR', 'HULL', 'HULL', 'HULLR', 'VENT'],
      ['VENT', 'HULLR', 'HULL', 'HULL', 'HULLR', 'VENT'],
      ['GRID', 'HULLC', 'HULLR', 'HULLR', 'HULLC', 'GRID'],
      ['GRID', 'GRID', 'VENT', 'VENT', 'GRID', 'GRID']
    ]
  };

  var ctx = null;
  var B = null;

  function fresh() {
    return {
      active: false, dead: false,
      phase: 0,                        // 0 進場 / 1 外殼 / 2 核心 / 3 三連雷射 / 4 死亡
      t: 0, x: START_X, y: HOME_Y, xs: FX.Vec(START_X),
      hullPhase: 0,
      plates: [null, null, null, null], platesLeft: 0,
      core: null, coreHp: CORE_HP, coreOpen: false, coreT: SHUT_FRAMES,
      fireT: P1_FIRE,
      laserState: 'idle', laserT: 0, laserRows: [-1, -1, -1], laserBullets: [null, null, null],
      deathT: 0
    };
  }

  function totalHp() {
    var s = 0, i;
    for (i = 0; i < 4; i++) if (B.plates[i]) s += B.plates[i].hp;
    if (B.phase >= 2) s += (B.coreHp > 0 ? B.coreHp : 0);
    else s += CORE_HP;
    return s;
  }

  /* ---------------------------------------------------------- 部位 */
  function makePlate(i) {
    var e = ctx.allocPart();
    if (!e) return null;
    e.kind = 'bplate'; e.boss = true; e.small = false;
    e.size = 16; e.pal = 3;
    e.hp = PLATE_HP; e.score = PLATE_SCORE;
    e.w = 16; e.h = 16;
    e.x = B.x + PLATE_OFF[i][0]; e.y = B.y + PLATE_OFF[i][1];
    e.slot = i; e.flash = 0;
    e.onHit = function (dmg) {
      e.hp -= dmg; e.flash = 4;
      if (e.hp <= 0) { e.kill(); return true; }
      return false;
    };
    e.onKill = function () {
      if (!e.alive) return;
      e.alive = false;
      ctx.boom(e.x + 8, e.y + 8);
      ctx.addScore(PLATE_SCORE);
      B.plates[e.slot] = null;
      B.platesLeft--;
      ctx.freeEnemy(e);
      if (B.platesLeft <= 0) toPhase2();
    };
    e.customStep = function () {
      e.x = B.x + PLATE_OFF[e.slot][0]; e.y = B.y + PLATE_OFF[e.slot][1];
      if (e.flash > 0) e.flash--;
    };
    e.customDraw = function (o, oam) { drawPlate(o, oam); };
    e.alive = true;
    return e;
  }

  function makeCore() {
    var e = ctx.allocPart();
    if (!e) return null;
    e.kind = 'bcore'; e.boss = true; e.small = false;
    e.size = 16; e.pal = 2;
    e.hp = CORE_HP; e.score = CORE_SCORE;
    e.w = 16; e.h = 16;
    e.x = B.x + CORE_OFF[0]; e.y = B.y + CORE_OFF[1];
    e.flash = 0;
    e.onHit = function (dmg) {
      if (!B.coreOpen) return false;                       // 合上 = 無敵
      B.coreHp -= dmg; e.hp = B.coreHp; e.flash = 4;
      if (B.coreHp <= PHASE3_HP && B.phase === 2) toPhase3();
      if (B.coreHp <= 0) { e.kill(); return true; }
      return false;
    };
    e.onKill = function () {
      if (!e.alive) return;
      e.alive = false;
      ctx.freeEnemy(e);
      ctx.addScore(CORE_SCORE);
      toDeath();
    };
    e.customStep = function () {
      e.x = B.x + CORE_OFF[0]; e.y = B.y + CORE_OFF[1];
      if (e.flash > 0) e.flash--;
    };
    e.customDraw = function (o, oam, frame) { drawCore(o, oam, frame); };
    e.alive = true;
    return e;
  }

  /* ---------------------------------------------------------- 階段切換 */
  function toPhase2() {
    B.phase = 2; B.t = 0;
    B.coreHp = CORE_HP;
    B.coreOpen = false; B.coreT = SHUT_FRAMES;
    B.core = makeCore();
    drawHull(2);                                           // 形變圖 ②
  }
  function toPhase3() {
    B.phase = 3;
    B.laserState = 'warn'; B.laserT = WARN_FRAMES;
    B.coreOpen = true; B.coreT = OPEN_FRAMES;
    drawHull(3);                                           // 形變圖 ③
    ring();
  }
  function toDeath() {
    B.phase = 4;
    B.deathT = DEATH_FRAMES;
    clearLaser();
    for (var i = 0; i < 4; i++) {
      var p = B.plates[i];
      if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
      B.plates[i] = null;
    }
    B.platesLeft = 0;
  }

  /* ---------------------------------------------------------- 攻擊 */
  var tv = { vx: 0, vy: 0, a: 0 };
  function ring() {
    var cx = B.x + 24, cy = B.y + 24, i;
    for (i = 0; i < RING_N; i++) {
      SH.vel(((i * 256 / RING_N) | 0) & 255, RING_SPEED, tv);
      ctx.fire(cx, cy, tv.vx, tv.vy);
    }
  }
  function aimedShot() {
    var sh = ctx.ship();
    if (!sh || sh.alive === false) return;
    var mx = B.x - 4, my = B.y + 24;
    SH.aim(mx, my, sh.x + (sh.w >> 1), sh.y + (sh.h >> 1), AIM_SPEED, tv);
    ctx.fire(mx, my, tv.vx, tv.vy);
  }

  /* ---------------------------------------------------------- 雷射（背景磚） */
  function laserCols() { return B.x >> 3; }               // 螢幕欄 0 .. bossCol-1

  function paintLaser(tileName) {
    var cols = laserCols(), i, c;
    for (i = 0; i < 3; i++) {
      var r = (B.y + LASER_OFF[i]) >> 3;
      B.laserRows[i] = r;
      for (c = 0; c < cols; c++) ctx.bgWrite(c, r, tileName);
    }
  }
  function clearLaser() {
    var cols = laserCols(), i, c;
    for (i = 0; i < 3; i++) {
      var r = B.laserRows[i];
      if (r >= 0) { for (c = 0; c < cols; c++) ctx.bgRestore(c, r); B.laserRows[i] = -1; }
      var b = B.laserBullets[i];
      if (b) { ctx.freeBullet(b); B.laserBullets[i] = null; }
    }
  }
  function armLaser() {
    for (var i = 0; i < 3; i++) {
      B.laserBullets[i] = ctx.bigBullet(0, B.y + LASER_OFF[i] + 1, B.x, 6);
    }
  }

  /* ---------------------------------------------------------- 艦體背景（形變） */
  function drawHull(phase) {
    var m = HULL_MAPS[phase] || HULL_MAPS[1];
    var c0 = B.x >> 3, r0 = B.y >> 3, r, c;
    for (r = 0; r < 6; r++) for (c = 0; c < 6; c++) ctx.bgWrite(c0 + c, r0 + r, m[r][c]);
    B.hullPhase = phase;
  }
  function eraseHull() {
    if (!B.hullPhase) return;
    var c0 = B.x >> 3, r0 = B.y >> 3, r, c;
    for (r = 0; r < 6; r++) for (c = 0; c < 6; c++) ctx.bgRestore(c0 + c, r0 + r);
    B.hullPhase = 0;
  }

  /* ---------------------------------------------------------- 精靈繪製 */
  var PRIO_BOSS = 3;
  function drawPlate(e, oam) {
    var S = ctx.S;
    var tiles = (e.hp <= (PLATE_HP >> 1)) ? S.PLATEX : S.PLATE;      // 半血 → 龜裂形變
    var pal = (e.flash > 0 && (e.flash & 1)) ? 2 : 3;
    CR.Enemies.draw16(oam, tiles, e.x, e.y, pal, false, PRIO_BOSS);
  }
  function drawCore(e, oam, frame) {
    var S = ctx.S;
    var open = B.coreOpen;
    var tiles = open ? S.CORE0 : S.CORE1;
    var pal = open ? 2 : 3;
    if (e.flash > 0 && (e.flash & 1)) pal = (pal === 2) ? 3 : 2;
    CR.Enemies.draw16(oam, tiles, e.x, e.y, pal, false, PRIO_BOSS);
  }

  /* ---------------------------------------------------------- 主迴圈 */
  function spawn() {
    B = fresh();
    B.active = true; B.phase = 0;
    B.x = START_X; FX.vsetPx(B.xs, START_X); B.y = HOME_Y;
    var i;
    for (i = 0; i < 4; i++) B.plates[i] = makePlate(i);
    B.platesLeft = 0;
    for (i = 0; i < 4; i++) if (B.plates[i]) B.platesLeft++;
    return B;
  }

  function update() {
    if (!B || !B.active) return;
    B.t++;

    if (B.phase === 0) {                                     // ── 進場
      FX.vadd(B.xs, ENTER_V);
      B.x = FX.vpx(B.xs);
      if (B.t >= ENTER_FRAMES || B.x <= HOME_X) {
        B.x = HOME_X; FX.vsetPx(B.xs, HOME_X);
        B.phase = 1; B.t = 0; B.fireT = P1_FIRE;
        drawHull(1);
      }
      return;
    }
    if (B.phase === 1) {                                     // ── 階段 1：外殼板
      if (--B.fireT <= 0) { B.fireT = P1_FIRE; aimedShot(); }
      return;
    }
    if (B.phase === 2) {                                     // ── 階段 2：核心開合
      if (--B.coreT <= 0) {
        B.coreOpen = !B.coreOpen;
        B.coreT = B.coreOpen ? OPEN_FRAMES : SHUT_FRAMES;
        if (B.coreOpen) ring();
      }
      if (--B.fireT <= 0) { B.fireT = P1_FIRE + 40; aimedShot(); }
      return;
    }
    if (B.phase === 3) {                                     // ── 階段 3：三連雷射 + 環形彈
      if (--B.coreT <= 0) {
        B.coreOpen = !B.coreOpen;
        B.coreT = B.coreOpen ? OPEN_FRAMES : SHUT_FRAMES;
      }
      if (--B.laserT <= 0) {
        if (B.laserState === 'warn') {
          B.laserState = 'beam'; B.laserT = BEAM_FRAMES;
          paintLaser('LBEAM'); armLaser();
        } else if (B.laserState === 'beam') {
          B.laserState = 'cool'; B.laserT = COOL_FRAMES;
          clearLaser(); ring();
        } else {
          B.laserState = 'warn'; B.laserT = WARN_FRAMES;
        }
      } else if (B.laserState === 'warn' && B.laserRows[0] < 0) {
        paintLaser('LWARN');                                 // 預告線（30 幀）
      }
      return;
    }
    if (B.phase === 4) {                                     // ── 死亡大爆炸
      if ((B.deathT % 6) === 0) {
        var k = (B.deathT * 37) & 255;
        ctx.boom(B.x + 4 + ((k * 40) >> 8), B.y + 4 + ((((k * 7) & 255) * 40) >> 8));
      }
      if (--B.deathT <= 0) {
        eraseHull();
        B.active = false; B.dead = true;
        ctx.onCleared();
      }
      return;
    }
  }

  function draw(oam, frame) {
    if (!B || !B.active) return;
    var S = ctx.S, i;
    var charging = (B.phase === 3 && (B.laserState === 'warn' || B.laserState === 'beam'));
    for (i = 0; i < 3; i++) {
      CR.Enemies.put(oam, B.x - 8, B.y + LASER_OFF[i] - 4,
        (charging && ((frame >> 2) & 1)) ? S.MUZZ1 : S.MUZZ0, 3, false, PRIO_BOSS);
    }
  }

  function despawn() {
    if (!B) return;
    clearLaser();
    eraseHull();
    var i;
    for (i = 0; i < 4; i++) {
      var p = B.plates[i];
      if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
      B.plates[i] = null;
    }
    if (B.core && B.core.alive) { B.core.alive = false; ctx.freeEnemy(B.core); }
    B.core = null;
    B.active = false;
  }

  /* ---------------------------------------------------------- 匯出 */
  CR.Boss = {
    W: W, H: H, HOME_X: HOME_X, HOME_Y: HOME_Y,
    PLATE_HP: PLATE_HP, CORE_HP: CORE_HP, PHASE3_HP: PHASE3_HP, TOTAL_HP: PLATE_HP * 4 + CORE_HP,
    OPEN_FRAMES: OPEN_FRAMES, SHUT_FRAMES: SHUT_FRAMES,
    WARN_FRAMES: WARN_FRAMES, BEAM_FRAMES: BEAM_FRAMES, COOL_FRAMES: COOL_FRAMES,
    ENTER_FRAMES: ENTER_FRAMES, DEATH_FRAMES: DEATH_FRAMES, RING_N: RING_N,
    HULL_MAPS: HULL_MAPS, LASER_OFF: LASER_OFF,
    init: function (c) { ctx = c; B = null; },
    spawn: spawn, update: update, draw: draw, despawn: despawn,
    active: function () { return !!(B && B.active); },
    raw: function () { return B; },
    totalHp: function () { return B ? totalHp() : 0; },
    // 除錯 / 測試：直接跳到某個階段（?boss=1|2|3 與 test_stage1.py 用）
    force: function (phase) {
      if (!B || !B.active) return null;
      if (phase >= 1 && B.phase === 0) {
        B.x = HOME_X; FX.vsetPx(B.xs, HOME_X); B.phase = 1; B.t = 0; drawHull(1);
      }
      if (phase >= 2 && B.phase === 1) {
        for (var i = 0; i < 4; i++) {
          var p = B.plates[i];
          if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
          B.plates[i] = null;
        }
        B.platesLeft = 0;
        toPhase2();
      }
      if (phase >= 3 && B.phase === 2) {
        B.coreHp = PHASE3_HP;
        if (B.core) B.core.hp = PHASE3_HP;
        toPhase3();
      }
      return B;
    },
    state: function () {
      if (!B) return { active: false, phase: -1 };
      var hp = [], i;
      for (i = 0; i < 4; i++) hp.push(B.plates[i] ? B.plates[i].hp : 0);
      return {
        active: B.active, dead: B.dead, phase: B.phase, t: B.t, x: B.x, y: B.y,
        plateHp: hp, platesLeft: B.platesLeft,
        coreHp: B.coreHp, coreOpen: B.coreOpen, coreT: B.coreT,
        laser: B.laserState, laserT: B.laserT, deathT: B.deathT,
        hullPhase: B.hullPhase, totalHp: totalHp()
      };
    }
  };
})();
