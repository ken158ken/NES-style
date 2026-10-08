/*
 * games/mech/enemies.js — 《星塵機甲》雜魚 4 種（原創）
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 依賴：engine/shmup.js（Pool / aim / aabb）、games/mech/weapons.js
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約 / 敵人」
 *
 * 教學意義照 `docs/research/03_經典遊戲深度解析/03_洛克人2.md` ④「敵人設計」：
 * | kind   | 原創名   | 行為 | 對應研究的原型 | HP | 接觸傷害 |
 * |--------|----------|------|----------------|----|----------|
 * | walker | 履帶兵   | 地面爬行 0.5 px/幀、撞牆 / 坑邊轉向 | 基礎雜魚 | 1 | 2 |
 * | sentry | 哨兵砲   | **舉盾（無敵）90 幀 → 放盾 60 幀射 2 發瞄準彈** | ①Sniper Joe 的週期無敵「開窗期」 | 3 | 3 |
 * | flyer  | 浮游眼   | 正弦上下 + 緩慢橫向追蹤，不可踩 | ②Telly 群體雜魚 | 1 | 2 |
 * | hopper | 跳彈獸   | 固定節奏彈跳（路線可預判） | ⑥Springer 幾何預判 | 2 | 3 |
 *
 * 位置用整數 px + 1/16 px 累加器（`ax`/`ay`）⇒ 不用浮點、可重現。
 * **研究 ③：敵人在畫面進入時生成、離開時銷毀** ⇒ 換房一律 `reset()`，由 main 依房間資料重生。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var MG = window.MG = window.MG || {};
  var SH = NES.SH;
  if (!SH || !SH.Pool) throw new Error('games/mech/enemies.js 需要 engine/shmup.js');

  var SUB = 16;

  var KINDS = {
    walker: { w: 14, h: 12, hp: 1, dmg: 2, oy: 4, art: 'E_WALK', speed: 8, score: 100 },
    sentry: { w: 12, h: 24, hp: 3, dmg: 3, oy: 0, art: 'E_SENT', speed: 0, score: 300 },
    flyer: { w: 12, h: 12, hp: 1, dmg: 2, oy: 2, art: 'E_FLY', speed: 12, score: 200 },
    hopper: { w: 12, h: 14, hp: 2, dmg: 3, oy: 2, art: 'E_HOP', speed: 16, score: 200 }
  };

  function mk() {
    return {
      kind: 'walker', x: 0, y: 0, w: 14, h: 12, ax: 0, ay: 0,
      hp: 1, dmg: 2, facing: -1, t: 0, phase: 0, anim: 0, animT: 0,
      vy: 0, onGround: false, invuln: false, home: 0, score: 100, flash: 0
    };
  }

  var E = {
    pool: null,
    KINDS: KINDS,

    init: function () { E.pool = SH.Pool(10, mk); return E; },
    reset: function () { if (E.pool) E.pool.freeAll(); },
    count: function () { return E.pool ? E.pool.count : 0; },
    each: function (fn) { if (E.pool) E.pool.each(fn); },

    spawn: function (kind, col, row) {
      var k = KINDS[kind];
      if (!k || !E.pool) return null;
      var e = E.pool.alloc();
      if (!e) return null;
      e.kind = kind;
      e.w = k.w; e.h = k.h;
      e.hp = k.hp; e.dmg = k.dmg;
      e.score = k.score;
      e.x = col * 8 + ((8 - k.w) >> 1);
      e.y = (row + 1) * 8 - k.h;              // row = 腳所在的那一列
      e.ax = 0; e.ay = 0;
      e.facing = -1; e.t = 0; e.phase = 0; e.anim = 0; e.animT = 0;
      e.vy = 0; e.onGround = false; e.invuln = false; e.flash = 0;
      e.home = e.y;
      return e;
    },

    hit: function (e, dmg, g) {
      if (e.invuln) { if (g && g.sfx) g.sfx('clink'); return false; }
      e.hp -= dmg | 0;
      e.flash = 4;
      if (e.hp <= 0) {
        e.alive = false;
        if (g && g.onEnemyDie) g.onEnemyDie(e);
        return true;
      }
      if (g && g.sfx) g.sfx('ehit');
      return false;
    },

    update: function (g) {
      var h = g.hero;
      E.pool.each(function (e) {
        e.t++;
        if (e.flash > 0) e.flash--;
        if (e.kind === 'walker') stepWalker(e, g);
        else if (e.kind === 'sentry') stepSentry(e, g, h);
        else if (e.kind === 'flyer') stepFlyer(e, g, h);
        else if (e.kind === 'hopper') stepHopper(e, g);
        if (++e.animT >= 8) { e.animT = 0; e.anim ^= 1; }
        if (e.y > 248) e.alive = false;
      });
    },

    draw: function (oam, tiles) {
      var n = 0;
      E.pool.each(function (e) {
        if (e.flash > 0 && (e.flash & 1)) return;          // 被打到閃一下
        var k = KINDS[e.kind], base = k.art + (e.anim & 1) + '_';
        var sx = e.x - ((16 - e.w) >> 1), sy = e.y - k.oy;
        var flip = e.facing > 0, r, c, i, t;
        for (r = 0; r < 2; r++) {
          for (c = 0; c < 2; c++) {
            i = r * 2 + (flip ? 1 - c : c);
            t = tiles[base + i];
            if (t === undefined) continue;
            oam.add({ x: sx + c * 8, y: sy + r * 8, tile: t, pal: 2, flipH: flip, prio: 3 });
            n++;
          }
        }
        // 哨兵砲舉盾：盾疊在身前（省掉一整組姿勢，也讓「無敵相位」看得出來）
        if (e.kind === 'sentry' && e.invuln && tiles.E_SHIELD !== undefined) {
          oam.add({ x: e.x + (e.facing > 0 ? e.w - 2 : -6), y: e.y + 6, tile: tiles.E_SHIELD, pal: 2, flipH: flip, prio: 2 });
          n++;
        }
      });
      return n;
    },

    state: function () {
      var out = [];
      E.pool.each(function (e) {
        out.push({ kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h, hp: e.hp, invuln: e.invuln, dmg: e.dmg });
      });
      return out;
    }
  };

  /* ---------------------------------------------------- walker 履帶兵 */
  function stepWalker(e, g) {
    var k = KINDS.walker;
    e.ax += e.facing * k.speed;
    var dx = e.ax >> 4; e.ax -= dx << 4;
    var nx = e.x + dx;
    var probeC = e.facing > 0 ? (nx + e.w) >> 3 : (nx - 1) >> 3;
    var footRow = (e.y + e.h) >> 3;
    // 撞牆或走到坑邊就轉向（研究 ④ 的「基礎雜魚」行為）
    if (g.solidAt(probeC, (e.y + 4) >> 3) || !g.solidAt(probeC, footRow) || nx < 0 || nx + e.w > 256) {
      e.facing = -e.facing;
    } else {
      e.x = nx;
    }
    // 貼地
    if (!g.solidAt(e.x >> 3, footRow) && !g.solidAt((e.x + e.w - 1) >> 3, footRow)) {
      e.ay += 48;
      var dy = e.ay >> 4; e.ay -= dy << 4;
      e.y += dy;
    } else {
      e.ay = 0;
      e.y = (footRow << 3) - e.h;
    }
  }

  /* ---------------------------------------------------- sentry 哨兵砲 */
  var SENTRY_SHIELD = 90, SENTRY_OPEN = 60, SENTRY_SHOT = 30;
  function stepSentry(e, g, h) {
    if (h) e.facing = (h.x + h.w / 2 < e.x) ? -1 : 1;
    var cyc = e.t % (SENTRY_SHIELD + SENTRY_OPEN);
    e.invuln = cyc < SENTRY_SHIELD;                         // 週期性無敵 = 「開窗期」
    if (!e.invuln) {
      var o = cyc - SENTRY_SHIELD;
      if (o % SENTRY_SHOT === 4 && h) {
        var sp = 2;
        var dx = (h.x + 6) - (e.x + 6), dy = (h.y + 12) - (e.y + 10);
        var ad = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
        if (ad < 1) ad = 1;
        MG.Weapons.efire(e.x + (e.facing > 0 ? e.w : -6), e.y + 8,
                         Math.round(dx * sp / ad) || e.facing * sp, Math.round(dy * sp / ad), 3);
        if (g.sfx) g.sfx('eshot');
      }
    }
  }

  /* ---------------------------------------------------- flyer 浮游眼 */
  function stepFlyer(e, g, h) {
    var k = KINDS.flyer;
    if (h) {
      var dir = (h.x + 6 < e.x) ? -1 : 1;
      e.facing = dir;
      e.ax += dir * k.speed;
      var dx = e.ax >> 4; e.ax -= dx << 4;
      if (!g.solidAt((dx > 0 ? e.x + e.w + dx : e.x + dx) >> 3, (e.y + 6) >> 3)) e.x += dx;
    }
    // 正弦上下（查表：NES.SH.SIN，執行期不用 Math 的三角函數）
    e.y = e.home + ((SH.sin((e.t * 2) & 255) * 20) >> 8);
  }

  /* ---------------------------------------------------- hopper 跳彈獸 */
  var HOP_PERIOD = 48, HOP_VY = -4;
  function stepHopper(e, g) {
    var k = KINDS.hopper;
    // 水平
    e.ax += e.facing * k.speed;
    var dx = e.ax >> 4; e.ax -= dx << 4;
    var nx = e.x + dx;
    var probeC = e.facing > 0 ? (nx + e.w) >> 3 : (nx - 1) >> 3;
    if (g.solidAt(probeC, (e.y + 4) >> 3) || nx < 0 || nx + e.w > 256) e.facing = -e.facing;
    else e.x = nx;
    // 垂直：固定節奏彈跳（路線可預判 ⇒ 研究 ⑥「幾何預判」）
    e.vy += 1;
    if (e.vy > 6) e.vy = 6;
    e.y += e.vy >> 0;
    var footRow = (e.y + e.h) >> 3;
    if (e.vy >= 0 && (g.solidAt(e.x >> 3, footRow) || g.solidAt((e.x + e.w - 1) >> 3, footRow))) {
      e.y = (footRow << 3) - e.h;
      e.vy = 0;
      e.onGround = true;
      if (e.t % HOP_PERIOD < 2) e.vy = HOP_VY;
    } else {
      e.onGround = false;
    }
    if (e.onGround && e.t % HOP_PERIOD === 0) e.vy = HOP_VY;
  }

  MG.Enemies = E;
})();
