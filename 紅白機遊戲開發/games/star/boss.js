/*
 * games/star/boss.js — 《星塵勇者》W1 魔王「鐵鎚王」（1-4 城堡盡頭的橋上）
 * ---------------------------------------------------------------------------
 * 擁有者：star-world agent ｜ 依賴：engine/fixed.js（NES.FX）、chr_world.js、levels_w1.js
 * 契約：docs/TASKS.md「R2b §契約 魔王」＋ 研究 04 §3（模式循環 / 預警幀 / 弱點窗口 / 競技場）
 *
 *   32×32、站在橋上。行為循環（研究 04 §3.1 Pattern Loop）：
 *       walk（走近主角，最多 90 幀）→ jump（vy = −5 px/幀）→ throw（3 顆錘子、間隔 20 幀）
 *       → rest（40 幀，**弱點窗口**）→ 回到 walk
 *   打倒方式二選一：
 *       ① 踩頭 3 次（每次擊退 + 無敵 60 幀，研究 04 §3.3）
 *       ② 主角碰到橋尾的斧頭 → 橋斷、魔王掉進熔岩（研究 03/01 ⑤ 的兩種解法）
 *   死亡 → `ST.Boss.dead = true`（main 進 clear）。
 *
 * ── main.js 的用法 ────────────────────────────────────────────────────────
 *   ST.Boss.init(level);                       // 進 1-4 時
 *   ST.Boss.update({ hero, camX, level, onStomp, onHurt, onAxe, onDie });
 *   ST.Boss.draw(oam);                         // 魔王 prio 3、錘子 prio 2
 *   if (ST.Boss.dead) → STAGE CLEAR
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/boss.js 需要 engine/fixed.js');
  var SMB = FX.SMB;

  var W = 28, H = 30;                      // 碰撞框（精靈 32×32，四周各留一點）
  var SPD_WALK = SMB.enemySlow;            // 0.5 px/幀
  var JUMP_VY = -FX.v88(5, 0);             // 跳 vy = −5 px/幀
  var GRAV = SMB.jump[0].gFall;
  var MAXFALL = FX.v88(4, 0);
  var MAX_HP = 3;
  var INV_FRAMES = 60;                     // 踩到後無敵 60 幀
  var KNOCKBACK = 16;                      // 擊退 16 px
  var WALK_FRAMES = 90;
  var THROW_GAP = 20;                      // 3 顆錘子間隔 20 幀
  var THROW_N = 3;
  var REST_FRAMES = 40;
  var HAMMER_N = 6;
  var HAM_VX = FX.v88(1, 128);             // 1.5 px/幀（朝主角）
  var HAM_VY = -FX.v88(4, 0);
  var HAM_GRAV = FX.v88(0, 64);            // 0.25 px/幀²
  var WORLD_BOTTOM = 30 * 8 + 64;
  var ACTIVATE_AHEAD = 48;                 // 相機右緣再往右 48 px 就啟動

  function newHammer() {
    var h = {
      alive: false, kind: 'hammer', stompable: false,
      x: 0, y: 0, w: 8, h: 12, px: FX.Vec(0), py: FX.Vec(0), vx: FX.Acc(0), vy: FX.Acc(0), t: 0
    };
    h.hit = function () { h.alive = false; return true; };
    return h;
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

  var hammers = makePool(HAMMER_N, newHammer);
  var level = null, tiles = null, camXCache = 0, bridgeCols = null, lastHero = null;

  // 主角腳下的欄（拆橋時要留著，否則碰到斧頭就等於踩空掉熔岩）
  function keepColOf(hero) {
    if (!hero) return null;
    return ((hero.x + ((hero.w || 12) >> 1)) >> 3);
  }

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
      stand: quad('W_BOSS_ST'), jump: quad('W_BOSS_JP'),
      throw0: quad('W_BOSS_T0'), throw1: quad('W_BOSS_T1'),
      ham: [Wd.oam16('W_HAM0'), Wd.oam16('W_HAM1')]
    };
    return tiles;
  }

  function kindAt(x, y) { return level ? level.kindAt(x, y) : 'none'; }
  function solid(x, y) { return kindAt(x, y) === 'solid'; }

  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  var Boss = {
    // 契約欄位
    active: false, dead: false, alive: false, stompable: true, kind: 'boss',
    hp: MAX_HP, x: 0, y: 0, w: W, h: H,
    phase: 'idle',                          // idle | walk | jump | throw | rest | falling | dead
    facing: -1, inv: 0, t: 0, throws: 0, frame: 0,
    axe: null, bridgeBroken: false, keptCol: -99,
    hammers: hammers,
    MAX_HP: MAX_HP,

    init: function (lv, opts) {
      opts = opts || {};
      level = lv || null;
      Boss.reset();
      if (!level || !level.boss) { Boss.spawnX = -1; return Boss; }
      Boss.spawnX = level.boss.x;
      Boss.spawnY = level.boss.y;
      // 橋的欄位（斧頭機關要整排拆掉）
      bridgeCols = [];
      var c, r, T = ST.TILE;
      for (c = 0; c < level.cols; c++) {
        for (r = 0; r < level.rows; r++) {
          if (level.tileAt(c, r) === T.BRIDGE) { bridgeCols.push(c * level.rows + r); break; }
        }
      }
      if (level.axe) {
        Boss.axe = { x: level.axe.col * 8, y: level.axe.row * 8, w: 8, h: 8, taken: false, col: level.axe.col, row: level.axe.row };
      }
      return Boss;
    },

    reset: function () {
      hammers.freeAll();
      Boss.active = false; Boss.dead = false; Boss.alive = false;
      Boss.hp = MAX_HP; Boss.phase = 'idle'; Boss.facing = -1;
      Boss.inv = 0; Boss.t = 0; Boss.throws = 0; Boss.frame = 0;
      Boss.bridgeBroken = false;
      if (Boss.axe) Boss.axe.taken = false;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    // 給 main.js 的通用碰撞 / 除錯用
    box: function () { return Boss.active && Boss.alive ? { x: Boss.x, y: Boss.y, w: W, h: H } : null; },
    hit: function () { return Boss.stomp(); },

    // 手動放置（測試 / 其他關重用）
    spawn: function (x, y) {
      FX.vsetPx(px, x); FX.vsetPx(py, y);
      Boss.x = x | 0; Boss.y = y | 0;
      Boss.active = true; Boss.alive = true; Boss.dead = false;
      Boss.hp = MAX_HP; Boss.phase = 'walk'; Boss.t = 0; Boss.throws = 0; Boss.inv = 0;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    // 踩頭：擊退 + 無敵 60 幀；第 3 次 → 死
    stomp: function () {
      if (!Boss.active || Boss.dead || Boss.inv > 0 || Boss.phase === 'falling') return false;
      Boss.hp--;
      Boss.inv = INV_FRAMES;
      FX.vsetPx(px, Boss.x + Boss.facing * -KNOCKBACK);   // 往「背對主角」的方向退
      Boss.x = FX.vpx(px);
      if (Boss.hp <= 0) { Boss.die(); return true; }
      Boss.phase = 'rest'; Boss.t = 0;
      return true;
    },

    // 斧頭：橋斷 → 魔王掉落
    // hitAxe(hero)：拆橋時**保留主角腳下那幾欄**（hero 省略時看 update() 記下的最後位置）。
    // 斧頭本身已經移到橋外的實地（1-4 col 246），這裡是第二道保險：
    // 萬一以後有人把斧頭放回橋上，也不會「碰到斧頭 = 掉熔岩」。
    hitAxe: function (hero) {
      if (!Boss.axe || Boss.axe.taken) return false;
      Boss.axe.taken = true;
      Boss.breakBridge(keepColOf(hero || lastHero));
      Boss.die();
      return true;
    },

    breakBridge: function (keepCol) {
      if (Boss.bridgeBroken || !level || !bridgeCols) return false;
      var i, id, c, r, keep = (keepCol === undefined || keepCol === null) ? -99 : (keepCol | 0);
      for (i = 0; i < bridgeCols.length; i++) {
        id = bridgeCols[i]; c = (id / level.rows) | 0; r = id % level.rows;
        if (c >= keep - 1 && c <= keep + 1) continue;      // 主角站的那一欄與左右各一欄留著
        level.setTile(c, r, ST.TILE.EMPTY);
      }
      if (Boss.axe && !(Boss.axe.col >= keep - 1 && Boss.axe.col <= keep + 1)) {
        level.setTile(Boss.axe.col, Boss.axe.row, ST.TILE.EMPTY);
      }
      Boss.bridgeBroken = true;
      Boss.keptCol = keep;
      return true;
    },

    die: function () {
      if (Boss.dead || Boss.phase === 'falling') return false;
      if (!Boss.active) {            // 還沒現身就被斧頭解決 ⇒ 直接就位再墜落
        FX.vsetPx(px, Boss.spawnX); FX.vsetPx(py, Boss.spawnY);
        Boss.x = Boss.spawnX | 0; Boss.y = Boss.spawnY | 0;
        Boss.active = true; Boss.alive = true;
      }
      Boss.hp = 0;
      Boss.phase = 'falling';
      Boss.t = 0;
      Boss.inv = 0;
      hammers.freeAll();
      FX.aset(vy, -FX.v88(2, 0));
      FX.aset(vx, 0);
      Boss.alive = false;               // 墜落中不再吃碰撞（仍然會畫）
      return true;
    },

    throwHammer: function (targetX) {
      var h = hammers.alloc();
      if (!h) return null;
      var sx = Boss.x + (Boss.facing < 0 ? -4 : Boss.w - 4), sy = Boss.y - 6;
      FX.vsetPx(h.px, sx); FX.vsetPx(h.py, sy);
      h.x = sx; h.y = sy; h.t = 0;
      var dir = (targetX === undefined) ? Boss.facing : (targetX < Boss.x ? -1 : 1);
      FX.aset(h.vx, dir * HAM_VX);
      FX.aset(h.vy, HAM_VY);
      return h;
    },

    update: function (g) {
      g = g || {};
      Boss.frame++;
      var camX = (g.camX === undefined) ? camXCache : g.camX;
      camXCache = camX;
      if (g.level && g.level !== level) level = g.level;
      var hero = g.hero || null;
      if (hero) lastHero = hero;

      // ---- 斧頭（就算魔王還沒啟動也能碰）--------------------------------
      if (Boss.axe && !Boss.axe.taken && hero && aabb({ x: hero.x, y: hero.y, w: hero.w || 12, h: hero.h || 22 }, Boss.axe)) {
        Boss.hitAxe(hero);
        if (g.onAxe) g.onAxe();
        if (g.onDie) g.onDie('axe');
      }

      // ---- 啟動 -----------------------------------------------------------
      if (!Boss.active && !Boss.dead && Boss.phase === 'idle' && Boss.spawnX >= 0
          && camX + 256 + ACTIVATE_AHEAD >= Boss.spawnX) {
        Boss.spawn(Boss.spawnX, Boss.spawnY);
      }
      if (!Boss.active) return Boss.phase;

      if (Boss.inv > 0) Boss.inv--;
      Boss.t++;

      // ---- 狀態機 ---------------------------------------------------------
      if (Boss.phase === 'falling') {
        FX.aadd(vy, GRAV);
        FX.vadd(py, vy.v);
        Boss.y = FX.vpx(py);
        if (Boss.y > WORLD_BOTTOM) {
          Boss.active = false; Boss.alive = false; Boss.dead = true; Boss.phase = 'dead';
          if (g.onDie) g.onDie('fall');
        }
        stepHammers(g);
        return Boss.phase;
      }

      if (hero) Boss.facing = (hero.x < Boss.x) ? -1 : 1;

      switch (Boss.phase) {
        case 'walk':
          FX.aset(vx, Boss.facing * SPD_WALK);
          FX.vadd(px, vx.v);
          Boss.x = FX.vpx(px);
          if (solid(Boss.facing < 0 ? Boss.x - 1 : Boss.x + Boss.w, Boss.y + 8)) {
            FX.vsetPx(px, Boss.x - Boss.facing);
            Boss.x = FX.vpx(px);
          }
          if (Boss.t >= WALK_FRAMES) { Boss.phase = 'jump'; Boss.t = 0; FX.aset(vy, JUMP_VY); }
          break;
        case 'jump':
          FX.aset(vx, Boss.facing * (SPD_WALK >> 1));
          FX.vadd(px, vx.v);
          Boss.x = FX.vpx(px);
          if (landed()) { Boss.phase = 'throw'; Boss.t = 0; Boss.throws = 0; }
          break;
        case 'throw':
          FX.aset(vx, 0);
          if (Boss.throws < THROW_N && (Boss.t - 1) % THROW_GAP === 0) {
            Boss.throwHammer(hero ? hero.x : undefined);
            Boss.throws++;
          }
          if (Boss.throws >= THROW_N && Boss.t >= (THROW_N - 1) * THROW_GAP + THROW_GAP) {
            Boss.phase = 'rest'; Boss.t = 0;
          }
          landed();
          break;
        case 'rest':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= REST_FRAMES) { Boss.phase = 'walk'; Boss.t = 0; }
          break;
        default:
          break;
      }

      stepHammers(g);

      // ---- 主角碰撞（有 callback 才做）------------------------------------
      if (hero && (g.onStomp || g.onHurt)) {
        var hb = { x: hero.x, y: hero.y, w: hero.w || 12, h: hero.h || 22 };
        if (aabb(hb, Boss)) {
          var falling = (hero.vy === undefined) ? true : (hero.vy > 0);
          var footIn = (hb.y + hb.h) - Boss.y <= 12;
          if (falling && footIn) {
            if (Boss.inv <= 0) { Boss.stomp(); if (g.onStomp) g.onStomp(Boss); }
          } else if (!(hero.inv > 0)) {
            if (hero.star || hero.invincible) { /* 無敵星塵撞不死魔王，只是不受傷 */ }
            else if (g.onHurt) g.onHurt(Boss);
          }
        }
        hammers.each(function (h) {
          if (!aabb(hb, h)) return;
          h.alive = false;
          if (!(hero.inv > 0) && !(hero.star || hero.invincible) && g.onHurt) g.onHurt(h);
        });
      }
      if (Boss.dead && g.onDie && Boss.phase === 'dead') { /* 已回報 */ }
      return Boss.phase;
    },

    draw: function (oam) {
      if (!oam || !oam.add) return 0;
      var T = ensureTiles();
      if (!T) return 0;
      var n = 0, cam = camXCache, i;
      if (Boss.active) {
        // 無敵閃爍：每 4 幀跳一幀不畫（研究 04 §3.3 弱點窗口的可讀性）
        if (!(Boss.inv > 0 && (Boss.frame & 4))) {
          var art = T.stand;
          if (Boss.phase === 'jump' || Boss.phase === 'falling') art = T.jump;
          else if (Boss.phase === 'throw') art = (Boss.t % (THROW_GAP * 2) < THROW_GAP) ? T.throw1 : T.throw0;
          var bx = Boss.x - 2 - cam, by = Boss.y - 2;
          var flip = Boss.facing > 0;
          for (i = 0; i < 4; i++) {
            var col = flip ? (3 - i) : i;
            oam.add({ x: bx + i * 8, y: by, tile: art[0][col], pal: 3, prio: 3, flipH: flip });
            oam.add({ x: bx + i * 8, y: by + 16, tile: art[1][col], pal: 3, prio: 3, flipH: flip });
            n += 2;
          }
        }
      }
      hammers.each(function (h) {
        oam.add({ x: h.x - cam, y: h.y, tile: T.ham[(h.t >> 2) & 1], pal: 3, prio: 2 });
        n++;
      });
      return n;
    },

    state: function () {
      var hs = [];
      hammers.each(function (h) { hs.push({ x: h.x, y: h.y, vx: h.vx.v, vy: h.vy.v }); });
      return {
        active: Boss.active, dead: Boss.dead, hp: Boss.hp, phase: Boss.phase,
        x: Boss.x, y: Boss.y, inv: Boss.inv, t: Boss.t, throws: Boss.throws,
        facing: Boss.facing, bridgeBroken: Boss.bridgeBroken,
        axe: Boss.axe ? { x: Boss.axe.x, y: Boss.axe.y, taken: Boss.axe.taken } : null,
        hammers: hs
      };
    },

    CONST: {
      W: W, H: H, MAX_HP: MAX_HP, INV_FRAMES: INV_FRAMES, KNOCKBACK: KNOCKBACK,
      WALK_FRAMES: WALK_FRAMES, THROW_GAP: THROW_GAP, THROW_N: THROW_N,
      REST_FRAMES: REST_FRAMES, JUMP_VY: JUMP_VY, SPD_WALK: SPD_WALK, HAMMER_N: HAMMER_N
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
    // 橋斷了（或掉出橋外）→ 魔王跟著掉
    if (!on && Boss.y > 30 * 8 - Boss.h - 8 && Boss.phase !== 'falling') Boss.die();
    return on;
  }

  function stepHammers(g) {
    hammers.each(function (h) {
      h.t++;
      FX.aadd(h.vy, HAM_GRAV);
      FX.vadd(h.px, h.vx.v);
      FX.vadd(h.py, h.vy.v);
      h.x = FX.vpx(h.px); h.y = FX.vpx(h.py);
      if (h.y > WORLD_BOTTOM || h.x < camXCache - 32 || h.x > camXCache + 288) h.alive = false;
    });
  }

  ST.Boss = Boss;
})();
