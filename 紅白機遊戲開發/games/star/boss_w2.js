/*
 * games/star/boss_w2.js — 《星塵勇者》世界 2 魔王「熔心巨像」（2-4 熔爐要塞盡頭）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w2 agent ｜ 依賴：engine/fixed.js、chr_w2.js、levels_w1.js（ST.TILE / Level）
 * 契約：docs/TASKS.md「R3 star W2」＋ 研究 04 §3（模式循環 / 預警幀 / 弱點窗口 / 階段升級）
 *
 * 32×32、五格血、**三階段**（研究 04 §3.2「階段式魔王：同一套招，節奏與招數逐段加碼」）：
 *   phase 1（HP 5–4）：walk → jump → slam（落地兩道衝擊波）→ rest(60，弱點窗口)
 *   phase 2（HP 3–2）：walk 變快 → jump → slam → **spit**（3 顆火球）→ rest(42)
 *   phase 3（HP 1）  ：walk 最快 → jump → slam（衝擊波 ×2 速度）→ spit(4 顆) → rest(30)
 * 打法：踩頭 5 次（每次擊退 + 無敵 50 幀 + 階段重新開始）。
 * 死亡 → `ST.BossW2.dead = true`（main 進 clear）。
 *
 * ── main.js 的用法（與 ST.Boss 同介面）────────────────────────────────────
 *   ST.BossW2.init(level); ST.BossW2.update(g); ST.BossW2.draw(oam); ST.BossW2.dead
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/boss_w2.js 需要 engine/fixed.js');
  var SMB = FX.SMB;

  var W = 28, H = 30;
  var MAX_HP = 5;
  var INV_FRAMES = 50;
  var KNOCKBACK = 14;
  var JUMP_VY = -FX.v88(5, 0);
  var GRAV = SMB.jump[0].gFall;
  var MAXFALL = FX.v88(4, 0);
  var WORLD_BOTTOM = 30 * 8 + 64;
  var ACTIVATE_AHEAD = 48;

  // 依階段（1..3）的參數表 —— 研究 04 §3.2：同一套招、節奏加碼
  var PHASE = [
    null,
    { walk: SMB.enemySlow, walkFrames: 84, rest: 60, spit: 0, waveVx: FX.v88(1, 128), slam: 30 },
    { walk: SMB.enemyFast, walkFrames: 70, rest: 42, spit: 3, waveVx: FX.v88(2, 0), slam: 26 },
    { walk: FX.v88(1, 0), walkFrames: 56, rest: 30, spit: 4, waveVx: FX.v88(2, 128), slam: 22 }
  ];
  var SPIT_GAP = 20;
  var SHOT_N = 8;
  var SHOT_VY = -FX.v88(3, 0);
  var SHOT_G = SMB.jump[0].gHold;          // acc 單位（0.125 px/幀²），不是 v88

  function newShot() {
    var s = {
      alive: false, kind: 'fire', stompable: false, wave: false,
      x: 0, y: 0, w: 8, h: 10,
      px: FX.Vec(0), py: FX.Vec(0), vx: FX.Acc(0), vy: FX.Acc(0), t: 0
    };
    s.hit = function () { s.alive = false; return true; };
    return s;
  }
  function makePool(n, f) {
    if (NES.SH && NES.SH.Pool) return NES.SH.Pool(n, f);
    var items = [], i;
    for (i = 0; i < n; i++) { items.push(f(i)); items[i].alive = false; }
    return {
      items: items, size: n, count: 0,
      alloc: function () { for (var j = 0; j < n; j++) if (!items[j].alive) { items[j].alive = true; this.count++; return items[j]; } return null; },
      free: function (o) { if (o && o.alive) { o.alive = false; this.count--; return true; } return false; },
      each: function (fn) { for (var j = 0; j < n; j++) if (items[j].alive) { fn(items[j], j); if (!items[j].alive) this.count--; } },
      freeAll: function () { for (var j = 0; j < n; j++) items[j].alive = false; this.count = 0; }
    };
  }

  var shots = makePool(SHOT_N, newShot);
  var level = null, tiles = null, camXCache = 0;
  var px = FX.Vec(0), py = FX.Vec(0), vx = FX.Acc(0), vy = FX.Acc(0);

  function ensureTiles() {
    if (tiles) return tiles;
    var Wd = ST.World;
    if (!Wd || !Wd.bound) return null;
    function quad(p) {
      return [
        [Wd.oam16(p + '_C0T'), Wd.oam16(p + '_C1T'), Wd.oam16(p + '_C2T'), Wd.oam16(p + '_C3T')],
        [Wd.oam16(p + '_C0B'), Wd.oam16(p + '_C1B'), Wd.oam16(p + '_C2B'), Wd.oam16(p + '_C3B')]
      ];
    }
    tiles = {
      stand: quad('W2_COL_ST'), jump: quad('W2_COL_JP'),
      wave: [Wd.oam16('W2_WAVE0'), Wd.oam16('W2_WAVE1')],
      fire: [Wd.oam16('W2_FIRE0'), Wd.oam16('W2_FIRE1')]
    };
    return tiles;
  }

  function kindAt(x, y) { return level ? level.kindAt(x, y) : 'none'; }
  function solid(x, y) { return kindAt(x, y) === 'solid'; }
  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function phaseOf() {
    if (Boss.hp <= 1) return 3;
    if (Boss.hp <= 3) return 2;
    return 1;
  }

  var Boss = {
    active: false, dead: false, alive: false, stompable: true, kind: 'boss',
    hp: MAX_HP, x: 0, y: 0, w: W, h: H,
    phase: 'idle', stage: 1,
    facing: -1, inv: 0, t: 0, shots: 0, frame: 0,
    hammers: shots,                       // 名字沿用 ST.Boss 的契約（main / enemies 列舉投射物用）
    MAX_HP: MAX_HP, spawnX: -1, spawnY: 0,

    init: function (lv) {
      level = lv || null;
      Boss.reset();
      if (!level || !level.boss) { Boss.spawnX = -1; return Boss; }
      Boss.spawnX = level.boss.x;
      Boss.spawnY = level.boss.y;
      return Boss;
    },

    reset: function () {
      shots.freeAll();
      Boss.active = false; Boss.dead = false; Boss.alive = false;
      Boss.hp = MAX_HP; Boss.phase = 'idle'; Boss.stage = 1; Boss.facing = -1;
      Boss.inv = 0; Boss.t = 0; Boss.shots = 0; Boss.frame = 0;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    box: function () { return Boss.active && Boss.alive ? { x: Boss.x, y: Boss.y, w: W, h: H } : null; },
    hit: function () { return Boss.stomp(); },

    spawn: function (x, y) {
      FX.vsetPx(px, x); FX.vsetPx(py, y);
      Boss.x = x | 0; Boss.y = y | 0;
      Boss.active = true; Boss.alive = true; Boss.dead = false;
      Boss.hp = MAX_HP; Boss.phase = 'walk'; Boss.stage = 1;
      Boss.t = 0; Boss.shots = 0; Boss.inv = 0;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    stomp: function () {
      if (!Boss.active || Boss.dead || Boss.inv > 0 || Boss.phase === 'falling') return false;
      Boss.hp--;
      Boss.inv = INV_FRAMES;
      FX.vsetPx(px, Boss.x + Boss.facing * -KNOCKBACK);
      Boss.x = FX.vpx(px);
      if (Boss.hp <= 0) { Boss.die(); return true; }
      Boss.stage = phaseOf();
      Boss.phase = 'rest'; Boss.t = 0;
      shots.freeAll();                    // 被踩 ⇒ 場面清乾淨（弱點窗口要看得清楚）
      return true;
    },

    die: function () {
      if (Boss.dead || Boss.phase === 'falling') return false;
      Boss.hp = 0;
      Boss.phase = 'falling';
      Boss.t = 0;
      Boss.inv = 0;
      shots.freeAll();
      FX.aset(vy, -FX.v88(2, 0));
      FX.aset(vx, 0);
      Boss.alive = false;
      return true;
    },

    shoot: function (targetX, kind) {
      var s = shots.alloc();
      if (!s) return null;
      var sx, sy;
      if (kind === 'wave') {
        sx = Boss.x + (Boss.facing < 0 ? -6 : Boss.w + 2);
        sy = Boss.y + Boss.h - 10;
        s.wave = true;
        FX.aset(s.vx, (kind === 'wave' ? 1 : 1) * 0);
      } else {
        sx = Boss.x + (Boss.facing < 0 ? -4 : Boss.w - 4);
        sy = Boss.y + 4;
        s.wave = false;
      }
      FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
      s.x = sx; s.y = sy; s.t = 0;
      if (s.wave) {
        s.w = 8; s.h = 10;
        FX.aset(s.vy, 0);
      } else {
        s.w = 8; s.h = 8;
        var dir = (targetX === undefined) ? Boss.facing : (targetX < Boss.x ? -1 : 1);
        FX.aset(s.vx, dir * FX.v88(1, 128));
        FX.aset(s.vy, SHOT_VY);
      }
      return s;
    },

    slamWaves: function () {
      var P = PHASE[Boss.stage], i, dirs = [-1, 1], s;
      for (i = 0; i < 2; i++) {
        s = shots.alloc();
        if (!s) continue;
        var sx = Boss.x + (dirs[i] < 0 ? -8 : Boss.w);
        var sy = Boss.y + Boss.h - 10;
        FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
        s.x = sx; s.y = sy; s.t = 0; s.wave = true; s.w = 8; s.h = 10;
        FX.aset(s.vx, dirs[i] * P.waveVx);
        FX.aset(s.vy, 0);
      }
      return true;
    },

    update: function (g) {
      g = g || {};
      Boss.frame++;
      var camX = (g.camX === undefined) ? camXCache : g.camX;
      camXCache = camX;
      if (g.level && g.level !== level) level = g.level;
      var hero = g.hero || null;

      if (!Boss.active && !Boss.dead && Boss.phase === 'idle' && Boss.spawnX >= 0
          && camX + 256 + ACTIVATE_AHEAD >= Boss.spawnX) {
        Boss.spawn(Boss.spawnX, Boss.spawnY);
      }
      if (!Boss.active) return Boss.phase;

      if (Boss.inv > 0) Boss.inv--;
      Boss.t++;
      var P = PHASE[Boss.stage] || PHASE[1];

      if (Boss.phase === 'falling') {
        FX.aadd(vy, GRAV);
        FX.vadd(py, vy.v);
        Boss.y = FX.vpx(py);
        if (Boss.y > WORLD_BOTTOM) {
          Boss.active = false; Boss.alive = false; Boss.dead = true; Boss.phase = 'dead';
          if (g.onDie) g.onDie('fall');
        }
        stepShots(g);
        return Boss.phase;
      }

      if (hero) Boss.facing = (hero.x < Boss.x) ? -1 : 1;

      switch (Boss.phase) {
        case 'walk':
          FX.aset(vx, Boss.facing * P.walk);
          FX.vadd(px, vx.v);
          Boss.x = FX.vpx(px);
          if (solid(Boss.facing < 0 ? Boss.x - 1 : Boss.x + Boss.w, Boss.y + 8)) {
            FX.vsetPx(px, Boss.x - Boss.facing);
            Boss.x = FX.vpx(px);
          }
          landed();
          if (Boss.t >= P.walkFrames) { Boss.phase = 'jump'; Boss.t = 0; FX.aset(vy, JUMP_VY); }
          break;
        case 'jump':
          FX.aset(vx, Boss.facing * (P.walk >> 1));
          FX.vadd(px, vx.v);
          Boss.x = FX.vpx(px);
          if (landed()) {
            Boss.phase = 'slam'; Boss.t = 0;
            Boss.slamWaves();
            if (g.onSlam) g.onSlam();
            if (g.sfx) g.sfx('bump');
          }
          break;
        case 'slam':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= P.slam) {
            if (P.spit > 0) { Boss.phase = 'spit'; Boss.t = 0; Boss.shots = 0; }
            else { Boss.phase = 'rest'; Boss.t = 0; }
          }
          break;
        case 'spit':
          FX.aset(vx, 0);
          landed();
          if (Boss.shots < P.spit && (Boss.t - 1) % SPIT_GAP === 0) {
            Boss.shoot(hero ? hero.x : undefined, 'fire');
            Boss.shots++;
          }
          if (Boss.shots >= P.spit && Boss.t >= P.spit * SPIT_GAP) { Boss.phase = 'rest'; Boss.t = 0; }
          break;
        case 'rest':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= P.rest) { Boss.phase = 'walk'; Boss.t = 0; }
          break;
        default:
          break;
      }

      stepShots(g);

      if (hero && (g.onStomp || g.onHurt)) {
        var hb = { x: hero.x, y: hero.y, w: hero.w || 12, h: hero.h || 22 };
        if (aabb(hb, Boss)) {
          var falling = (hero.vy === undefined) ? true : (hero.vy > 0);
          var footIn = (hb.y + hb.h) - Boss.y <= 12;
          if (falling && footIn) {
            if (Boss.inv <= 0) { Boss.stomp(); if (g.onStomp) g.onStomp(Boss); }
          } else if (!(hero.inv > 0)) {
            if (hero.star) { /* 無敵星撞不死魔王，只是不受傷 */ }
            else if (g.onHurt) g.onHurt(Boss);
          }
        }
        shots.each(function (s) {
          if (!aabb(hb, s)) return;
          if (hero.star) { s.alive = false; return; }
          s.alive = false;
          if (!(hero.inv > 0) && g.onHurt) g.onHurt(s);
        });
      }
      return Boss.phase;
    },

    draw: function (oam) {
      if (!oam || !oam.add) return 0;
      var T = ensureTiles();
      if (!T) return 0;
      var n = 0, cam = camXCache, i;
      if (Boss.active) {
        if (!(Boss.inv > 0 && (Boss.frame & 4))) {
          var art = (Boss.phase === 'jump' || Boss.phase === 'falling' || Boss.phase === 'slam') ? T.jump : T.stand;
          var bx = Boss.x - 2 - cam, by = Boss.y - 2;
          var flip = Boss.facing > 0;
          for (i = 0; i < 4; i++) {
            var col = flip ? (3 - i) : i;
            oam.add({ x: bx + i * 8, y: by, tile: art[0][col], pal: 2, prio: 3, flipH: flip });
            oam.add({ x: bx + i * 8, y: by + 16, tile: art[1][col], pal: 2, prio: 3, flipH: flip });
            n += 2;
          }
        }
      }
      shots.each(function (s) {
        var t = s.wave ? T.wave[(s.t >> 2) & 1] : T.fire[(s.t >> 2) & 1];
        oam.add({ x: s.x - cam, y: s.y, tile: t, pal: 2, prio: 2 });
        n++;
      });
      return n;
    },

    state: function () {
      var list = [];
      shots.each(function (s) { list.push({ x: s.x, y: s.y, wave: s.wave, vx: s.vx.v, vy: s.vy.v }); });
      return {
        active: Boss.active, dead: Boss.dead, hp: Boss.hp, phase: Boss.phase, stage: Boss.stage,
        x: Boss.x, y: Boss.y, inv: Boss.inv, t: Boss.t, facing: Boss.facing, shots: list
      };
    },

    CONST: {
      W: W, H: H, MAX_HP: MAX_HP, INV_FRAMES: INV_FRAMES, KNOCKBACK: KNOCKBACK,
      JUMP_VY: JUMP_VY, PHASE: PHASE, SPIT_GAP: SPIT_GAP, SHOT_N: SHOT_N
    }
  };

  function landed() {
    FX.aadd(vy, GRAV);
    if (vy.v > MAXFALL) FX.aset(vy, MAXFALL);
    var prevBottom = Boss.y + Boss.h;
    FX.vadd(py, vy.v);
    var ny = FX.vpx(py), foot = ny + Boss.h, on = false;
    if (vy.v >= 0) {
      var k1 = kindAt(Boss.x + 4, foot), k2 = kindAt(Boss.x + Boss.w - 4, foot);
      var hit1 = k1 === 'solid' || (k1 === 'oneway' && prevBottom <= ((foot >> 3) << 3));
      var hit2 = k2 === 'solid' || (k2 === 'oneway' && prevBottom <= ((foot >> 3) << 3));
      if (hit1 || hit2) {
        ny = ((foot >> 3) << 3) - Boss.h;
        FX.vsetPx(py, ny); FX.aset(vy, 0); on = true;
      }
    }
    Boss.y = ny;
    if (!on && Boss.y > 30 * 8 - Boss.h - 8 && Boss.phase !== 'falling') Boss.die();
    return on;
  }

  function stepShots(g) {
    shots.each(function (s) {
      s.t++;
      if (s.wave) {
        FX.vadd(s.px, s.vx.v);
        s.x = FX.vpx(s.px);
        // 衝擊波貼著地面走：腳下沒地板 / 前方有牆就消失
        var below = kindAt(s.x + 4, s.y + s.h + 2);
        if (below !== 'solid' && below !== 'oneway') s.alive = false;
        else if (solid(s.vx.v < 0 ? s.x - 1 : s.x + s.w, s.y + 4)) s.alive = false;
      } else {
        FX.aadd(s.vy, SHOT_G);
        FX.vadd(s.px, s.vx.v);
        FX.vadd(s.py, s.vy.v);
        s.x = FX.vpx(s.px); s.y = FX.vpx(s.py);
        if (solid(s.x + 4, s.y + s.h)) s.alive = false;
      }
      if (s.y > WORLD_BOTTOM || s.x < camXCache - 40 || s.x > camXCache + 296) s.alive = false;
    });
  }

  ST.BossW2 = Boss;
})();
