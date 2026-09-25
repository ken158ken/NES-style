/*
 * games/star/enemies_w2.js — 《星塵勇者》世界 2「熔岩礦坑」的三種新敵 + 火球
 * ---------------------------------------------------------------------------
 * 擁有者：star-w2 agent ｜ 依賴：games/star/enemies.js（ST.Enemies.register / API）、chr_w2.js
 * 契約：docs/TASKS.md「R3 star W2」
 *
 *   ④ bat     礦坑蝙蝠   倒掛天花板，主角進入 72 px 內才醒 → 俯衝到主角高度後平飛。**可踩**
 *              （研究 03/04 惡魔城「蝙蝠」：靜止 → 觸發 → 一次性軌跡，可讀、可預判）
 *   ⑤ armor   護甲礦兵   走路 0.5 px/幀、坑邊會轉向；頭上整排尖刺 ⇒ **不可踩**
 *              （研究 04 §2「必須用別的手段處理的敵人」：逼玩家繞路或吃無敵星）
 *   ⑥ spitter 岩漿噴吐者 固定不動，每 100 幀朝主角吐一顆拋物線火球。**可踩**
 *   ⑦ fire    火球       一次性投射物（碰到就消失），重力 0.25 px/幀²
 *
 * 全部走 `ST.Enemies.register()`，W1 的三種敵人一行都沒動。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var E = ST.Enemies;
  if (!E || !E.register) throw new Error('games/star/enemies_w2.js 需要 games/star/enemies.js（R3 版，有 register）');
  var FX = NES.FX, SMB = FX.SMB;

  var BAT_WAKE = 72;                       // 主角進入 72 px 才醒（預警距離）
  var BAT_VX = SMB.enemyFast;              // 0.75 px/幀
  var BAT_VY = FX.v88(0, 192);             // 0.75 px/幀 俯衝
  var BAT_FLUT = 6;                        // 平飛後上下拍翅 ±6 px
  var ARM_VX = SMB.enemySlow;              // 0.5 px/幀
  var SPIT_PERIOD = 100;                   // 每 100 幀吐一顆
  var SPIT_RANGE = 152;                    // 主角在 152 px 內才吐
  var FIRE_VX = FX.v88(1, 64);             // 1.25 px/幀
  var FIRE_VY = -FX.v88(3, 0);             // 起飛 −3 px/幀
  // 重力是 **acc 單位**（1/16 vel/幀；SMB 的 gHold = 0x20 * 16 = 512 = 0.125 px/幀²）——
  // 不是 v88。用 v88(0,64) 會變成 0.0156 px/幀²（幾乎不落地）。
  var FIRE_G = FX.SMB.jump[0].gHold;       // 0.125 px/幀² ⇒ 拋物線約 48 幀 / 60 px

  var tiles = null;
  function T() {
    if (tiles) return tiles;
    var W = ST.World;
    if (!W || !W.bound) return null;
    tiles = {
      bat: [[W.oam16('W2_BAT0_L'), W.oam16('W2_BAT0_R')], [W.oam16('W2_BAT1_L'), W.oam16('W2_BAT1_R')]],
      arm: [[W.oam16('W2_ARM0_L'), W.oam16('W2_ARM0_R')], [W.oam16('W2_ARM1_L'), W.oam16('W2_ARM1_R')]],
      spit: [[W.oam16('W2_SPIT0_L'), W.oam16('W2_SPIT0_R')], [W.oam16('W2_SPIT1_L'), W.oam16('W2_SPIT1_R')]],
      fire: [W.oam16('W2_FIRE0'), W.oam16('W2_FIRE1')]
    };
    return tiles;
  }

  /* ------------------------------------------------------------------ bat */
  E.register('bat', {
    w: 14, h: 12, stompable: true, score: 200, pal: 3,
    setup: function (e, opt) {
      e.baseY = e.y;
      e.awake = false;
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      e.phase = opt.phase || 0;
      FX.aset(e.vx, 0); FX.aset(e.vy, 0);
    },
    step: function (e, g, api) {
      e.t++;
      var h = g && g.hero;
      if (!e.awake) {
        if (h && Math.abs((h.x + 6) - (e.x + 7)) <= BAT_WAKE) {
          e.awake = true;
          e.dir = (h.x < e.x) ? -1 : 1;
          e.targetY = h.y + 2;
          FX.aset(e.vx, e.dir * BAT_VX);
          FX.aset(e.vy, BAT_VY);
        }
        return;
      }
      FX.vadd(e.px, e.vx.v);
      e.x = FX.vpx(e.px);
      if (e.y < e.targetY) {
        FX.vadd(e.py, e.vy.v);
        e.y = FX.vpx(e.py);
      } else {
        e.phase = (e.phase + 4) & 255;
        e.y = e.targetY + ((api.sin8(e.phase) * BAT_FLUT) >> 8);
        FX.vsetPx(e.py, e.y);
      }
    },
    art: function (e) {
      var A = T(); if (!A) return [0, 0];
      var f = e.awake ? ((e.t >> 2) & 1) : 0;
      return [A.bat[f][0], A.bat[f][1], e.dir > 0];
    }
  });

  /* ---------------------------------------------------------------- armor */
  E.register('armor', {
    w: 14, h: 15, stompable: false, score: 300, pal: 3,
    setup: function (e, opt) {
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      e.edge = opt.edge === undefined ? true : !!opt.edge;   // 預設坑邊不掉（不會自己走進熔岩）
      FX.aset(e.vx, e.dir * ARM_VX);
    },
    step: function (e, g, api) {
      e.t++;
      FX.aset(e.vx, e.dir * ARM_VX);
      FX.vadd(e.px, e.vx.v);
      e.x = FX.vpx(e.px);
      var lead = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
      if (api.blocked(lead, e.y + 2) || api.blocked(lead, e.y + e.h - 2)) {
        e.dir = -e.dir;
        FX.vsetPx(e.px, e.x - e.dir);
        e.x = FX.vpx(e.px);
      } else if (e.edge && e.onGround) {
        var foot = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
        if (!api.floorAt(foot, e.y + e.h + 1, e.y + e.h)) e.dir = -e.dir;
      }
      api.fall(e);
    },
    art: function (e) {
      var A = T(); if (!A) return [0, 0];
      var f = (e.t >> 3) & 1;
      return [A.arm[f][0], A.arm[f][1], e.dir > 0];
    }
  });

  /* -------------------------------------------------------------- spitter */
  E.register('spitter', {
    w: 14, h: 14, stompable: true, score: 200, pal: 2,
    setup: function (e, opt) {
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      e.t2 = opt.phase | 0;
      FX.aset(e.vx, 0);
    },
    step: function (e, g, api) {
      e.t++; e.t2++;
      api.fall(e);
      var h = g && g.hero;
      if (!h) return;
      var dx = (h.x + 6) - (e.x + 7);
      e.dir = dx < 0 ? -1 : 1;
      if ((e.t2 % SPIT_PERIOD) !== 0) return;
      if (Math.abs(dx) > SPIT_RANGE) return;
      var f = api.spawn('fire', e.x + 3, e.y - 6, { dir: e.dir });
      if (f && g && g.sfx) g.sfx('bump');
    },
    art: function (e) {
      var A = T(); if (!A) return [0, 0];
      var f = ((e.t2 % SPIT_PERIOD) > SPIT_PERIOD - 20) ? 1 : 0;   // 吐之前 20 幀張口（預警）
      return [A.spit[f][0], A.spit[f][1], e.dir > 0];
    }
  });

  /* ----------------------------------------------------------------- fire */
  E.register('fire', {
    w: 8, h: 8, stompable: false, score: 0, fragile: true, pal: 2,
    setup: function (e, opt) {
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      FX.aset(e.vx, e.dir * FIRE_VX);
      FX.aset(e.vy, FIRE_VY);
    },
    step: function (e, g, api) {
      e.t++;
      FX.aadd(e.vy, FIRE_G);
      FX.vadd(e.px, e.vx.v);
      FX.vadd(e.py, e.vy.v);
      e.x = FX.vpx(e.px); e.y = FX.vpx(e.py);
      if (api.blocked(e.x + 4, e.y + 7) || api.blocked(e.x + 4, e.y)) e.alive = false;
    },
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      oam.add({ x: e.x - cam, y: e.y - 4, tile: A.fire[(e.t >> 2) & 1], pal: 2, prio: prio });
      return 1;
    }
  });

  ST.EnemiesW2 = {
    KINDS: ['bat', 'armor', 'spitter', 'fire'],
    CONST: {
      BAT_WAKE: BAT_WAKE, BAT_VX: BAT_VX, BAT_VY: BAT_VY, BAT_FLUT: BAT_FLUT,
      ARM_VX: ARM_VX, SPIT_PERIOD: SPIT_PERIOD, SPIT_RANGE: SPIT_RANGE,
      FIRE_VX: FIRE_VX, FIRE_VY: FIRE_VY, FIRE_G: FIRE_G
    }
  };
})();
