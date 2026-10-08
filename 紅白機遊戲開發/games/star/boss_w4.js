/*
 * games/star/boss_w4.js — 《星塵勇者》世界 4 魔王「核心守護者」（4-4 要塞核心盡頭）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w4 agent（R4）｜ 依賴：engine/fixed.js、engine/shmup.js（Pool / OAM.add16）、chr_w4.js
 * 契約：docs/TASKS.md「R4 star W4」＋ 研究 04 §3（模式循環 / 預警幀 / 弱點窗口 / 階段升級）
 *
 * 32×32、五格血、**三階段**（介面與 ST.Boss / ST.BossW2 完全相同 ⇒ main.js 只要認 bossKind）：
 *   stage 1（HP 5–4）：walk → jump → slam（落地放兩顆**滾動齒輪**沿地面跑）→ rest(60) 弱點窗口
 *   stage 2（HP 3–2）：走得快 → jump → slam → **volley**（3 發水平螺栓）→ rest(42)
 *   stage 3（HP 1）  ：最快 → jump → slam（齒輪更快）→ volley(4 發) → rest(30)
 * 打法：踩頭 5 次（每次擊退 + 無敵 50 幀 + 回到 rest 重新循環）。
 * 死亡 → `ST.BossW4.dead = true`（main 進 clear）。
 *
 * 繪製：上半身兩組姿勢（W4_GD_ST / W4_GD_JP），**下半身共用 W4_GD_ST 的 `_B`**（省 8 磚），
 *       投射物用 `oam.add16` 的同一條路（齒輪 / 螺栓都是 8×16 單塊，所以用 add）。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/boss_w4.js 需要 engine/fixed.js');
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

  // 階段參數表（研究 04 §3.2：同一套招、節奏加碼）
  var PHASE = [
    null,
    { walk: SMB.enemySlow, walkFrames: 84, rest: 60, volley: 0, gearVx: FX.v88(1, 128), slam: 30 },
    { walk: SMB.enemyFast, walkFrames: 70, rest: 42, volley: 3, gearVx: FX.v88(2, 0), slam: 26 },
    { walk: FX.v88(1, 0), walkFrames: 56, rest: 30, volley: 4, gearVx: FX.v88(2, 128), slam: 22 }
  ];
  var VOLLEY_GAP = 18;
  var SHOT_N = 8;
  var BOLT_VX = FX.v88(2, 0);

  function newShot() {
    var s = {
      alive: false, kind: 'bolt', stompable: false, gear: false,
      x: 0, y: 0, w: 8, h: 8,
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
    var W4 = ST.W4;
    if (!W4 || !W4.oam16) return null;
    if (!W4.oam16('W4_GD_ST_C0T')) return null;
    function row(p, half) {
      return [W4.oam16(p + '_C0' + half), W4.oam16(p + '_C1' + half),
        W4.oam16(p + '_C2' + half), W4.oam16(p + '_C3' + half)];
    }
    tiles = {
      standT: row('W4_GD_ST', 'T'), jumpT: row('W4_GD_JP', 'T'),
      botB: row('W4_GD_ST', 'B'),                      // 下半身兩組姿勢共用
      gear: [W4.oam16('W4_GEAR0'), W4.oam16('W4_GEAR1')],
      bolt: [W4.oam16('W4_BOLT0'), W4.oam16('W4_BOLT1')]
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
    hammers: shots,                       // 契約沿用 ST.Boss（main / enemies 列舉投射物用）
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

    /** 砸地：兩顆滾動齒輪沿地面往左右跑（研究 04 §3「砸地 → 地面波」）。 */
    slamGears: function () {
      var P = PHASE[Boss.stage], i, dirs = [-1, 1], s, sx, sy;
      for (i = 0; i < 2; i++) {
        s = shots.alloc();
        if (!s) continue;
        sx = Boss.x + (dirs[i] < 0 ? -8 : Boss.w);
        sy = Boss.y + Boss.h - 10;
        FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
        s.x = sx; s.y = sy; s.t = 0; s.gear = true; s.w = 8; s.h = 10;
        FX.aset(s.vx, dirs[i] * P.gearVx);
        FX.aset(s.vy, 0);
      }
      return true;
    },

    /** 齊射：水平螺栓（主角高度），一次一發。 */
    shoot: function (targetY) {
      var s = shots.alloc();
      if (!s) return null;
      var sx = Boss.x + (Boss.facing < 0 ? -6 : Boss.w - 2);
      var sy = (targetY === undefined || targetY === null) ? (Boss.y + 10) : (targetY | 0);
      FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
      s.x = sx; s.y = sy; s.t = 0; s.gear = false; s.w = 8; s.h = 6;
      FX.aset(s.vx, Boss.facing * BOLT_VX);
      FX.aset(s.vy, 0);
      return s;
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
            Boss.slamGears();
            if (g.onSlam) g.onSlam();
            if (g.sfx) g.sfx('bump');
          }
          break;
        case 'slam':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= P.slam) {
            if (P.volley > 0) { Boss.phase = 'volley'; Boss.t = 0; Boss.shots = 0; }
            else { Boss.phase = 'rest'; Boss.t = 0; }
          }
          break;
        case 'volley':
          FX.aset(vx, 0);
          landed();
          if (Boss.shots < P.volley && (Boss.t - 1) % VOLLEY_GAP === 0) {
            // fix-r4（qa-r4 P3-2）：整排螺栓都打在主角那一條線上 ⇒ 魔王本體 4 + 主角 2 + 螺栓 4
            // = 每線 10 顆精靈。改成**兩條高低車道**（差 16 px = 剛好一個精靈高）：
            // 每條線最多 2 發 ⇒ 4 + 2 + 2 = 8，而且兩條車道都還在主角身體（22 px）內 ⇒ 威脅不變。
            Boss.shoot(hero ? (hero.y + ((Boss.shots & 1) ? 16 : 0)) : undefined);
            Boss.shots++;
          }
          if (Boss.shots >= P.volley && Boss.t >= P.volley * VOLLEY_GAP) { Boss.phase = 'rest'; Boss.t = 0; }
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
          var up = (Boss.phase === 'jump' || Boss.phase === 'falling' || Boss.phase === 'slam');
          var top = up ? T.jumpT : T.standT;
          var bx = Boss.x - 2 - cam, by = Boss.y - 2;
          var flip = Boss.facing > 0;
          for (i = 0; i < 4; i++) {
            var col = flip ? (3 - i) : i;
            oam.add({ x: bx + i * 8, y: by, tile: top[col], pal: 2, prio: 3, flipH: flip });
            oam.add({ x: bx + i * 8, y: by + 16, tile: T.botB[col], pal: 2, prio: 3, flipH: flip });
            n += 2;
          }
        }
      }
      shots.each(function (s) {
        var t = s.gear ? T.gear[(s.t >> 2) & 1] : T.bolt[(s.t >> 2) & 1];
        oam.add({ x: s.x - cam, y: s.y - (s.gear ? 0 : 5), tile: t, pal: s.gear ? 3 : 2, prio: 2 });
        n++;
      });
      return n;
    },

    state: function () {
      var list = [];
      shots.each(function (s) { list.push({ x: s.x, y: s.y, gear: s.gear, vx: s.vx.v, vy: s.vy.v }); });
      return {
        active: Boss.active, dead: Boss.dead, hp: Boss.hp, phase: Boss.phase, stage: Boss.stage,
        x: Boss.x, y: Boss.y, inv: Boss.inv, t: Boss.t, facing: Boss.facing, shots: list
      };
    },

    CONST: {
      W: W, H: H, MAX_HP: MAX_HP, INV_FRAMES: INV_FRAMES, KNOCKBACK: KNOCKBACK,
      JUMP_VY: JUMP_VY, PHASE: PHASE, VOLLEY_GAP: VOLLEY_GAP, SHOT_N: SHOT_N, BOLT_VX: BOLT_VX
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
      FX.vadd(s.px, s.vx.v);
      s.x = FX.vpx(s.px);
      if (s.gear) {
        // 滾動齒輪貼著地面走：腳下沒地板 / 前方有牆就消失
        var below = kindAt(s.x + 4, s.y + s.h + 2);
        if (below !== 'solid' && below !== 'oneway') s.alive = false;
        else if (solid(s.vx.v < 0 ? s.x - 1 : s.x + s.w, s.y + 4)) s.alive = false;
      } else {
        if (solid(s.vx.v < 0 ? s.x - 1 : s.x + s.w, s.y + 3)) s.alive = false;
      }
      if (s.y > WORLD_BOTTOM || s.x < camXCache - 40 || s.x > camXCache + 296) s.alive = false;
    });
  }

  ST.BossW4 = Boss;
})();
