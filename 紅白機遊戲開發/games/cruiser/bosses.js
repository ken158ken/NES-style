/*
 * games/cruiser/bosses.js — 《星塵巡航艦》R3 擴關：關卡 2..6 的五隻魔王
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-stages agent（R3）｜ 依賴：engine/{fixed,shmup}.js、
 *         games/cruiser/{chr_world,enemies,boss}.js（boss.js 建立 `CR.Bosses` 登記處）
 *
 * 設計：關卡 1 的「核心要塞」（boss.js）是手寫的；本檔把它的骨架抽成**一台參數化魔王機**
 *   `makeBoss(cfg)`，五隻新魔王各只是一份設定（外殼板座標 / 核心數 / 攻擊表 / 艦體形變圖）。
 *   介面與 boss.js 完全相同（stage_runtime 只認介面）：
 *     init(ctx) / spawn() / update() / draw(oam, frame) / despawn() / active()
 *     / state() / force(phase) / raw() / totalHp()，常數 LASER_OFF / TOTAL_HP / NAME / key。
 *
 * 共同結構（沿用研究 16 §6-2 的 Big Core 三段式）：
 *   phase 0 進場（右緣滑入 60 幀）
 *   phase 1 外殼板（沒有外殼板的魔王直接跳 phase 2）
 *   phase 2 核心開合（開 = 可打 / 合 = 無敵），開啟瞬間放一次主攻擊
 *   phase 3 核心剩血 <= phase3At：攻擊表換成「狂化版」（更多彈 / 雷射 / 放小怪）
 *   phase 4 大爆炸 -> cleared（最終魔王多一段 phase 5「脫出倒數」）
 *
 * 精靈預算：每條掃描線最多 4 顆魔王精靈（上排板 / 中排核心 / 下排板），與關卡 1 同規格。
 * VBlank：艦體 6x6 = 36 byte、雷射 3 列 x 22 欄 = 66 byte，都只在狀態切換那一幀寫。
 * 角度依 NES.SH：0 = 右、64 = 下、128 = 左、192 = 上。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX, SH = NES.SH;
  if (!FX) throw new Error('games/cruiser/bosses.js 需要 engine/fixed.js');
  if (!SH || !SH.vel) throw new Error('games/cruiser/bosses.js 需要 engine/shmup.js（NES.SH）');
  CR.Bosses = CR.Bosses || {};

  var ENTER_FRAMES = 60;
  var START_X = 256;
  var DEATH_FRAMES = 90;
  var GAME_H = 208;

  /* ====================================================== 參數化魔王機 */
  function makeBoss(cfg) {
    var HOME_X = cfg.homeX === undefined ? 176 : cfg.homeX;
    var HOME_Y = cfg.homeY === undefined ? 72 : cfg.homeY;
    var ENTER_V = -FX.v88(1, 85);
    var OPEN_FRAMES = cfg.openFrames || 60, SHUT_FRAMES = cfg.shutFrames || 90;
    var WARN_FRAMES = 30, BEAM_FRAMES = 60, COOL_FRAMES = 60;
    var LASER_OFF = cfg.laserOff || [8, 24, 40];
    var PLATES = cfg.plates || [];
    var CORES = cfg.cores || [];
    var PLATE_HP = cfg.plateHp || 4;
    var PLATE_SCORE = cfg.plateScore || 600;
    var CORE_SCORE = cfg.coreScore || 6000;
    var RING_SPEED = cfg.ringSpeed || FX.v88(1, 32);
    var AIM_SPEED = cfg.aimSpeed || FX.v88(2, 0);
    var RING_N = cfg.ringN || 8;
    var FIRE_P = cfg.firePeriod || 100;
    var ESCAPE_FRAMES = cfg.escape || 0;
    var TOTAL_HP = PLATES.length * PLATE_HP;
    for (var ci = 0; ci < CORES.length; ci++) TOTAL_HP += CORES[ci].hp;

    var ctx = null, B = null;
    var tv = { vx: 0, vy: 0, a: 0 };

    function fresh() {
      var cores = [], i;
      for (i = 0; i < CORES.length; i++) cores.push({ e: null, hp: CORES[i].hp, def: CORES[i] });
      return {
        active: false, dead: false, phase: 0, t: 0,
        x: START_X, y: HOME_Y, xs: FX.Vec(START_X), hullPhase: 0,
        plates: new Array(PLATES.length), platesLeft: 0,
        cores: cores, coreOpen: false, coreT: SHUT_FRAMES,
        fireT: FIRE_P, atkI: 0,
        laserState: 'idle', laserT: 0, laserRows: [-1, -1, -1], laserBullets: [null, null, null],
        deathT: 0, escapeT: 0
      };
    }
    function coreHpSum() {
      var s = 0, i;
      for (i = 0; i < B.cores.length; i++) if (B.cores[i].hp > 0) s += B.cores[i].hp;
      return s;
    }
    function totalHp() {
      var s = 0, i;
      for (i = 0; i < B.plates.length; i++) if (B.plates[i]) s += B.plates[i].hp;
      if (B.phase >= 2) s += coreHpSum();
      else for (i = 0; i < CORES.length; i++) s += CORES[i].hp;
      return s;
    }

    /* ------------------------------------------------------------ 部位 */
    function makePlate(i) {
      var e = ctx.allocPart();
      if (!e) return null;
      e.kind = 'bplate'; e.boss = true; e.small = false;
      e.size = 16; e.pal = 3; e.invuln = false; e.link = null; e.splits = 0;
      e.hp = PLATE_HP; e.score = PLATE_SCORE; e.w = 16; e.h = 16;
      e.slot = i; e.flash = 0;
      e.x = B.x + PLATES[i][0]; e.y = B.y + PLATES[i][1];
      e.onHit = function (dmg) {
        if (B.phase === 0) { e.flash = 2; return false; }   // 進場中無敵（不然艦體會停在畫面外）
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
        e.x = B.x + PLATES[e.slot][0]; e.y = B.y + PLATES[e.slot][1];
        if (e.flash > 0) e.flash--;
      };
      e.customDraw = function (o, oam) {
        var S = ctx.S;
        var tiles = (o.hp <= (PLATE_HP >> 1)) ? S.PLATEX : S.PLATE;
        CR.Enemies.draw16(oam, tiles, o.x, o.y, (o.flash > 0 && (o.flash & 1)) ? 2 : 3, false, 3);
      };
      e.alive = true;
      return e;
    }

    function makeCore(k) {
      var slot = B.cores[k], d = slot.def;
      var e = ctx.allocPart();
      if (!e) return null;
      e.kind = 'bcore'; e.boss = true; e.small = false;
      e.size = 16; e.pal = 2; e.invuln = false; e.link = null; e.splits = 0;
      e.hp = slot.hp; e.score = CORE_SCORE; e.w = 16; e.h = 16;
      e.slot = k; e.flash = 0;
      e.x = B.x + d.dx; e.y = B.y + d.dy;
      e.onHit = function (dmg) {
        if (!B.coreOpen) return false;                    // 合上 = 無敵
        slot.hp -= dmg; e.hp = slot.hp; e.flash = 4;
        if (B.phase === 2 && coreHpSum() <= (cfg.phase3At || 4)) toPhase3();
        if (slot.hp <= 0) { e.kill(); return true; }
        return false;
      };
      e.onKill = function () {
        if (!e.alive) return;
        e.alive = false;
        slot.hp = 0; slot.e = null;
        ctx.boom(e.x + 8, e.y + 8);
        ctx.addScore(CORE_SCORE);
        ctx.freeEnemy(e);
        if (coreHpSum() <= 0) toDeath();
      };
      e.customStep = function () {
        e.x = B.x + d.dx; e.y = B.y + d.dy;
        if (e.flash > 0) e.flash--;
      };
      e.customDraw = function (o, oam, frame) {
        var S = ctx.S, set = S[d.tiles] || S.CORE0, set1 = S[d.tiles1] || S.CORE1;
        var pal = B.coreOpen ? 2 : 3;
        if (o.flash > 0 && (o.flash & 1)) pal = (pal === 2) ? 3 : 2;
        CR.Enemies.draw16(oam, B.coreOpen ? set : set1, o.x, o.y, pal, false, 3);
      };
      e.alive = true;
      slot.e = e;
      return e;
    }

    /* ------------------------------------------------------ 攻擊表 */
    function ring(n, sp) {
      var cx = B.x + (cfg.w >> 1), cy = B.y + (cfg.h >> 1), i, b;
      n = n || RING_N;
      for (i = 0; i < n; i++) {
        SH.vel(((i * 256 / n) | 0) & 255, sp || RING_SPEED, tv);
        b = ctx.fire(cx, cy, tv.vx, tv.vy);
        if (b) b.ring = true;
      }
    }
    function aimed() {
      var sh = ctx.ship();
      if (!sh || sh.alive === false) return;
      var mx = B.x - 4, my = B.y + (cfg.h >> 1);
      SH.aim(mx, my, sh.x + (sh.w >> 1), sh.y + (sh.h >> 1), AIM_SPEED, tv);
      ctx.fire(mx, my, tv.vx, tv.vy);
    }
    function fanShot() {                                   // 5 發扇形（往左）
      var mx = B.x - 4, my = B.y + (cfg.h >> 1), i;
      for (i = -2; i <= 2; i++) {
        SH.vel((128 + i * 10) & 255, AIM_SPEED, tv);
        ctx.fire(mx, my, tv.vx, tv.vy);
      }
    }
    function sprout(kind) {                                // 放小怪（追蹤導彈 / 分裂體 / 卵）
      var y = B.y + 8 + ((B.t * 37) & 31);
      return CR.Enemies.spawn(kind, B.x - 12, SH.clamp(y, 8, GAME_H - 24), {});
    }
    var ATTACKS = {
      aim: aimed,
      fan: fanShot,
      ring: function () { ring(RING_N); },
      ring12: function () { ring(12); },
      homing: function () { sprout('homing'); },
      split: function () { sprout('split'); },
      egg: function () { sprout('egg'); }
    };
    function runAttack(list) {
      if (!list || !list.length) return;
      var name = list[B.atkI % list.length];
      B.atkI++;
      var f = ATTACKS[name];
      if (f) f();
    }

    /* ---------------------------------------------------- 雷射（背景磚） */
    function laserCols() { return B.x >> 3; }
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
      for (var i = 0; i < 3; i++) B.laserBullets[i] = ctx.bigBullet(0, B.y + LASER_OFF[i] + 1, B.x, 6);
    }

    /* ---------------------------------------------------- 艦體背景 */
    function drawHull(phase) {
      var m = cfg.hull[phase] || cfg.hull[1];
      var c0 = B.x >> 3, r0 = B.y >> 3, r, c;
      for (r = 0; r < m.length; r++) for (c = 0; c < m[r].length; c++) ctx.bgWrite(c0 + c, r0 + r, m[r][c]);
      B.hullPhase = phase;
    }
    function eraseHull() {
      if (!B.hullPhase) return;
      var m = cfg.hull[B.hullPhase] || cfg.hull[1];
      var c0 = B.x >> 3, r0 = B.y >> 3, r, c;
      for (r = 0; r < m.length; r++) for (c = 0; c < m[r].length; c++) ctx.bgRestore(c0 + c, r0 + r);
      B.hullPhase = 0;
    }

    /* ---------------------------------------------------- 階段切換 */
    function toPhase2() {
      B.phase = 2; B.t = 0;
      B.coreOpen = false; B.coreT = SHUT_FRAMES;
      for (var i = 0; i < B.cores.length; i++) if (!B.cores[i].e && B.cores[i].hp > 0) makeCore(i);
      drawHull(2);
    }
    function toPhase3() {
      B.phase = 3;
      B.coreOpen = true; B.coreT = OPEN_FRAMES;
      if (cfg.laser) { B.laserState = 'warn'; B.laserT = WARN_FRAMES; }
      drawHull(3);
      runAttack(cfg.attacks && cfg.attacks.p3);
    }
    function clearBullets() {
      var pool = ctx.stage && ctx.stage.bullets, j;
      if (pool && pool.items) {
        for (j = 0; j < pool.items.length; j++) if (pool.items[j].alive) ctx.freeBullet(pool.items[j]);
      }
    }
    function toDeath() {
      B.phase = 4; B.deathT = DEATH_FRAMES;
      clearLaser();
      clearBullets();                                      // fix3：打贏了不要死在勝利動畫裡
      for (var i = 0; i < B.plates.length; i++) {
        var p = B.plates[i];
        if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
        B.plates[i] = null;
      }
      B.platesLeft = 0;
    }

    /* ---------------------------------------------------- 主迴圈 */
    function spawn() {
      B = fresh();
      B.active = true; B.phase = 0;
      B.x = START_X; FX.vsetPx(B.xs, START_X); B.y = HOME_Y;
      var i;
      for (i = 0; i < PLATES.length; i++) B.plates[i] = makePlate(i);
      B.platesLeft = 0;
      for (i = 0; i < PLATES.length; i++) if (B.plates[i]) B.platesLeft++;
      return B;
    }

    function update() {
      if (!B || !B.active) return;
      B.t++;
      if (B.phase === 0) {                                 // 進場
        FX.vadd(B.xs, ENTER_V);
        B.x = FX.vpx(B.xs);
        if (B.t >= ENTER_FRAMES || B.x <= HOME_X) {
          B.x = HOME_X; FX.vsetPx(B.xs, HOME_X); B.t = 0; B.fireT = FIRE_P;
          if (B.platesLeft > 0) { B.phase = 1; drawHull(1); }
          else { drawHull(1); toPhase2(); }                // 沒有外殼板的魔王直接進核心戰
        }
        return;
      }
      if (B.phase === 1) {
        if (--B.fireT <= 0) { B.fireT = FIRE_P; runAttack(cfg.attacks && cfg.attacks.p1); }
        return;
      }
      if (B.phase === 2) {
        if (--B.coreT <= 0) {
          B.coreOpen = !B.coreOpen;
          B.coreT = B.coreOpen ? OPEN_FRAMES : SHUT_FRAMES;
          if (B.coreOpen) runAttack(cfg.attacks && cfg.attacks.p2);
        }
        if (--B.fireT <= 0) { B.fireT = FIRE_P + 40; aimed(); }
        return;
      }
      if (B.phase === 3) {
        if (--B.coreT <= 0) {
          B.coreOpen = !B.coreOpen;
          B.coreT = B.coreOpen ? OPEN_FRAMES : SHUT_FRAMES;
        }
        if (cfg.laser) {
          if (--B.laserT <= 0) {
            if (B.laserState === 'warn') {
              B.laserState = 'beam'; B.laserT = BEAM_FRAMES; paintLaser('LBEAM'); armLaser();
            } else if (B.laserState === 'beam') {
              B.laserState = 'cool'; B.laserT = COOL_FRAMES; clearLaser();
              runAttack(cfg.attacks && cfg.attacks.p3);
            } else {
              B.laserState = 'warn'; B.laserT = WARN_FRAMES;
            }
          } else if (B.laserState === 'warn' && B.laserRows[0] < 0) {
            paintLaser('LWARN');
          }
        } else if (--B.fireT <= 0) {
          B.fireT = (cfg.p3Period || 70);
          runAttack(cfg.attacks && cfg.attacks.p3);
        }
        return;
      }
      if (B.phase === 4) {                                 // 死亡大爆炸
        if ((B.deathT % 6) === 0) {
          var k = (B.deathT * 37) & 255;
          ctx.boom(B.x + 4 + ((k * 40) >> 8), B.y + 4 + ((((k * 7) & 255) * 40) >> 8));
        }
        if (--B.deathT <= 0) {
          eraseHull();
          if (ESCAPE_FRAMES > 0) {                         // 最終魔王：脫出倒數
            B.phase = 5; B.escapeT = ESCAPE_FRAMES;
            if (ctx.stage) ctx.stage.escapeT = ESCAPE_FRAMES;
            return;
          }
          B.active = false; B.dead = true;
          ctx.onCleared();
        }
        return;
      }
      if (B.phase === 5) {                                 // 脫出倒數（母艦崩解，玩家要活下來）
        if ((B.escapeT % 10) === 0) {
          var q = (B.escapeT * 53) & 255;
          ctx.boom(((q * 256) >> 8), ((((q * 11) & 255) * (GAME_H - 16)) >> 8));
        }
        B.escapeT--;
        if (ctx.stage) ctx.stage.escapeT = B.escapeT;
        if (B.escapeT <= 0) {
          if (ctx.stage) ctx.stage.escapeT = 0;
          clearBullets();
          B.active = false; B.dead = true;
          ctx.onCleared();
        }
        return;
      }
    }

    function draw(oam, frame) {
      if (!B || !B.active) return;
      var S = ctx.S, i;
      if (!cfg.laser) return;
      var charging = (B.phase === 3 && (B.laserState === 'warn' || B.laserState === 'beam'));
      for (i = 0; i < 3; i++) {
        CR.Enemies.put(oam, B.x - 8, B.y + LASER_OFF[i] - 4,
          (charging && ((frame >> 2) & 1)) ? S.MUZZ1 : S.MUZZ0, 3, false, 3);
      }
    }

    function despawn() {
      if (!B) return;
      clearLaser();
      eraseHull();
      var i;
      for (i = 0; i < B.plates.length; i++) {
        var p = B.plates[i];
        if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
        B.plates[i] = null;
      }
      for (i = 0; i < B.cores.length; i++) {
        var c = B.cores[i].e;
        if (c && c.alive) { c.alive = false; ctx.freeEnemy(c); }
        B.cores[i].e = null;
      }
      if (ctx.stage) ctx.stage.escapeT = 0;
      B.active = false;
    }

    return {
      key: cfg.key, NAME: cfg.name,
      W: cfg.w, H: cfg.h, HOME_X: HOME_X, HOME_Y: HOME_Y,
      PLATE_HP: PLATE_HP, TOTAL_HP: TOTAL_HP, ENTER_FRAMES: ENTER_FRAMES,
      OPEN_FRAMES: OPEN_FRAMES, SHUT_FRAMES: SHUT_FRAMES, DEATH_FRAMES: DEATH_FRAMES,
      ESCAPE_FRAMES: ESCAPE_FRAMES, RING_N: RING_N, LASER_OFF: LASER_OFF,
      HULL_MAPS: cfg.hull, hasLaser: !!cfg.laser,
      init: function (c) { ctx = c; B = null; },
      spawn: spawn, update: update, draw: draw, despawn: despawn,
      active: function () { return !!(B && B.active); },
      raw: function () { return B; },
      totalHp: function () { return B ? totalHp() : 0; },
      force: function (phase) {
        if (!B || !B.active) return null;
        if (phase >= 1 && B.phase === 0) {
          B.x = HOME_X; FX.vsetPx(B.xs, HOME_X); B.t = 0;
          if (B.platesLeft > 0) { B.phase = 1; drawHull(1); } else { drawHull(1); toPhase2(); }
        }
        if (phase >= 2 && B.phase === 1) {
          for (var i = 0; i < B.plates.length; i++) {
            var p = B.plates[i];
            if (p && p.alive) { p.alive = false; ctx.freeEnemy(p); }
            B.plates[i] = null;
          }
          B.platesLeft = 0;
          toPhase2();
        }
        if (phase >= 3 && B.phase === 2) {
          var left = cfg.phase3At || 4, j;
          for (j = 0; j < B.cores.length; j++) {
            B.cores[j].hp = Math.max(1, (left / B.cores.length) | 0);
            if (B.cores[j].e) B.cores[j].e.hp = B.cores[j].hp;
          }
          toPhase3();
        }
        return B;
      },
      state: function () {
        if (!B) return { active: false, phase: -1 };
        var hp = [], i, chp = [];
        for (i = 0; i < B.plates.length; i++) hp.push(B.plates[i] ? B.plates[i].hp : 0);
        for (i = 0; i < B.cores.length; i++) chp.push(B.cores[i].hp);
        return {
          active: B.active, dead: B.dead, phase: B.phase, t: B.t, x: B.x, y: B.y,
          plateHp: hp, platesLeft: B.platesLeft,
          coreHp: coreHpSum(), coreHps: chp, coreOpen: B.coreOpen, coreT: B.coreT,
          laser: B.laserState, laserT: B.laserT, deathT: B.deathT, escapeT: B.escapeT,
          hullPhase: B.hullPhase, totalHp: totalHp(), key: cfg.key, name: cfg.name
        };
      }
    };
  }

  /* ====================================================== 五隻魔王的設定 */
  // 艦體 6x6 背景磚配置（名字必須是 stage_runtime 的磚種名 KIND_NAMES 之一）
  function hullOf(a, b, c, d) {                            // 產生「外框 a / 內層 b / 核心座 c / 角 d」
    return [
      [d, a, b, b, a, d],
      [a, b, c, c, b, a],
      [b, c, a, a, c, b],
      [b, c, a, a, c, b],
      [a, b, c, c, b, a],
      [d, a, b, b, a, d]
    ];
  }

  // ── 關卡 2 魔王「巨眼要塞」EYE FORTRESS ──────────────────────────────────
  CR.Bosses.eye = makeBoss({
    key: 'eye', name: 'EYE FORTRESS', w: 48, h: 48,
    plates: [[0, 0], [0, 32]], plateHp: 5,
    cores: [{ dx: 16, dy: 16, hp: 10, tiles: 'EYE0', tiles1: 'EYE1' }],
    phase3At: 4, firePeriod: 96, p3Period: 60,
    // 第 2 關是「第一次遇到魔王變招」的關 => p3 不放追蹤導彈（機器人實測：無強化時必死）
    attacks: { p1: ['aim'], p2: ['ring', 'aim'], p3: ['fan', 'ring', 'aim'] },
    hull: {
      1: hullOf('HULL', 'HULLR', 'VENT', 'HULLC'),
      2: hullOf('HULLR', 'VENT', 'ROCKW', 'GRID'),
      3: hullOf('GRID', 'ROCKW', 'VENT', 'GRID')
    }
  });

  // ── 關卡 3 魔王「雙頭石像」TWIN MOAI（沒有外殼板，兩顆頭都要打掉）────────
  CR.Bosses.twin = makeBoss({
    key: 'twin', name: 'TWIN MOAI', w: 48, h: 48,
    plates: [], cores: [
      { dx: 16, dy: 0, hp: 10, tiles: 'MOAI1', tiles1: 'MOAI0' },
      { dx: 16, dy: 32, hp: 10, tiles: 'MOAI1', tiles1: 'MOAI0' }
    ],
    phase3At: 8, openFrames: 70, shutFrames: 70, firePeriod: 110, p3Period: 56,
    ringN: 10,
    attacks: { p2: ['ring', 'fan'], p3: ['ring12', 'fan', 'aim'] },
    hull: {
      1: hullOf('STONE', 'SLAB', 'STONE', 'SLAB'),
      2: hullOf('SLAB', 'STONE', 'GRID', 'SLAB'),
      3: hullOf('GRID', 'STONE', 'SLAB', 'GRID')
    }
  });

  // ── 關卡 4 魔王「鏡像雙核」MIRROR CORE（上下對稱、分裂體）────────────────
  CR.Bosses.mirror = makeBoss({
    key: 'mirror', name: 'MIRROR CORE', w: 48, h: 48,
    plates: [[32, 0], [32, 32]], plateHp: 5,
    cores: [
      { dx: 8, dy: 4, hp: 7, tiles: 'CORE0', tiles1: 'CORE1' },
      { dx: 8, dy: 28, hp: 7, tiles: 'CORE0', tiles1: 'CORE1' }
    ],
    phase3At: 6, openFrames: 54, shutFrames: 80, firePeriod: 88, p3Period: 54,
    attacks: { p1: ['aim', 'split'], p2: ['ring', 'aim'], p3: ['fan', 'split', 'ring12'] },
    hull: {
      1: hullOf('HULL', 'HULLC', 'VENT', 'HULLR'),
      2: hullOf('HULLC', 'VENT', 'GRID', 'HULLR'),
      3: hullOf('GRID', 'VENT', 'GRID', 'HULLC')
    }
  });

  // ── 關卡 5 魔王「生物核心」BIO CORE（四片肉膜 + 會孵卵）──────────────────
  CR.Bosses.bio = makeBoss({
    key: 'bio', name: 'BIO CORE', w: 48, h: 48,
    plates: [[0, 0], [32, 0], [0, 32], [32, 32]], plateHp: 4,
    cores: [{ dx: 16, dy: 16, hp: 10, tiles: 'EYE0', tiles1: 'EYE1' }],
    // 機器人實測：ring12 + p3Period 50 會讓畫面同時有 20 顆彈 => 無強化復活等於死局。
    // 放慢到 72 幀 / 8 顆，開合改成「開 60 / 合 64」（露出時間變長 = 打得完）。
    phase3At: 4, openFrames: 60, shutFrames: 64, firePeriod: 84, p3Period: 72,
    ringN: 8,
    attacks: { p1: ['aim', 'egg'], p2: ['ring', 'homing'], p3: ['ring', 'fan', 'homing'] },
    hull: {
      1: hullOf('FLESH', 'VEIN', 'FLESH', 'VEIN'),
      2: hullOf('VEIN', 'FLESH', 'GRID', 'FLESH'),
      3: hullOf('GRID', 'VEIN', 'FLESH', 'GRID')
    }
  });

  // ── 關卡 6 最終魔王「母艦中樞」MOTHER BRAIN（外殼 -> 核心 -> 脫出倒數）──
  CR.Bosses.brain = makeBoss({
    key: 'brain', name: 'MOTHER BRAIN', w: 48, h: 48,
    plates: [[0, 0], [32, 0], [0, 32], [32, 32]], plateHp: 6,
    cores: [{ dx: 16, dy: 16, hp: 16, tiles: 'BRAIN0', tiles1: 'BRAIN1' }],
    phase3At: 6, openFrames: 60, shutFrames: 70, firePeriod: 76,
    ringN: 12, laser: true, escape: 300,
    coreScore: 20000,
    attacks: { p1: ['aim', 'fan'], p2: ['ring', 'aim', 'homing'], p3: ['ring12', 'fan', 'homing'] },
    hull: {
      1: hullOf('HULL', 'CIRC', 'HULLR', 'HULLC'),
      2: hullOf('CIRC', 'HULLR', 'CORE2', 'GRID'),
      3: hullOf('GRID', 'CORE2', 'CIRC', 'GRID')
    }
  });

  CR.Bosses.make = makeBoss;
})();
