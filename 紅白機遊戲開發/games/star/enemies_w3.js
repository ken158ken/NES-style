/*
 * games/star/enemies_w3.js — 《星塵勇者》世界 3「霧沼古樹」的三種新敵
 * ---------------------------------------------------------------------------
 * 擁有者：star-w3 agent（R4 F4-1）｜依賴：games/star/enemies.js（ST.Enemies.register / API）、chr_w3.js
 * 契約：docs/R4_BRIEF.md F4-1、docs/TASKS.md「R4 star W3」
 *
 *   ⑧ leaper 沼蛙     蹲著等 → 每 110 幀朝主角躍一次（39 px 高 / 26 px 遠，落地煞停）。**可踩**
 *                     躍起前 20 幀蹲更低（預警幀）；主角在 176 px 內才會跳。
 *   ⑨ thorn  荊棘藤   原地不動、150 幀一循環：收起 90 幀（**可踩**）/ 伸刺 60 幀（**不可踩**），
 *                     伸刺前 20 幀閃爍預警 ⇒ 研究 04 §2「用節奏而不是用運氣」的敵人。
 *   ⑩ wisp   鬼火     無視地形、慢慢飄向主角（0.3125 px/幀）+ 正弦上下。**不可踩**
 *                     ——暗區（螢火機關）裡的壓力源；速度只有主角跑速的 1/8，一定跑得掉。
 *
 * 全部走 `ST.Enemies.register()`，W1 / W2 的敵人程式一行未動。
 * 精靈磚在 W3 的 CHR 分頁（chr_w3.js）⇒ 磚索引走 `ST.W3.oam16(name)`，不走 ST.World。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var E = ST.Enemies;
  if (!E || !E.register) throw new Error('games/star/enemies_w3.js 需要 games/star/enemies.js（有 register）');
  var FX = NES.FX, SMB = FX.SMB;

  var LEAP_PERIOD = 110;                   // 每 110 幀躍一次
  var LEAP_WARN = 20;                      // 躍起前 20 幀蹲低（預警）
  var LEAP_RANGE = 176;                    // 主角在 176 px 內才跳
  var LEAP_VY = -FX.v88(6, 0);             // −6 px/幀（共用敵人重力 gFall ⇒ 躍高 39 px / 滯空 26 幀）
  var LEAP_VX = FX.v88(1, 0);              // 1 px/幀（⇒ 一跳約 26 px，看得出落點）
  var THORN_PERIOD = 150;                  // 收起 90 / 伸刺 60
  var THORN_OUT = 60;
  var THORN_WARN = 20;
  var WISP_VX = FX.v88(0, 80);             // 0.3125 px/幀（主角跑速 2.5 的 1/8）
  var WISP_AMP = 16;
  var WISP_STEP = 2;                       // 相位速度（一圈 128 幀）

  var tiles = null, tilesBank = null;
  function T() {
    var W = ST.W3;                                  // st_spr_w3 分頁（chr_w3.js）
    if (!W || !W.oam16) return null;
    var bank = W.bank ? W.bank() : null;
    if (tiles && tilesBank === bank) return tiles;
    if (!bank) return null;
    tiles = {
      frog: [[W.oam16('W3_FROG0_L'), W.oam16('W3_FROG0_R')], [W.oam16('W3_FROG1_L'), W.oam16('W3_FROG1_R')]],
      thorn: [[W.oam16('W3_THORN0_L'), W.oam16('W3_THORN0_R')], [W.oam16('W3_THORN1_L'), W.oam16('W3_THORN1_R')]],
      wisp: [W.oam16('W3_WISP0'), W.oam16('W3_WISP1')]
    };
    tilesBank = bank;
    return tiles;
  }

  /* --------------------------------------------------------------- leaper */
  E.register('leaper', {
    w: 14, h: 14, stompable: true, score: 200, pal: 1,
    setup: function (e, opt) {
      e.t2 = opt.phase | 0;
      e.leaping = false;
      FX.aset(e.vx, 0); FX.aset(e.vy, 0);
    },
    step: function (e, g, api) {
      e.t++; e.t2++;
      var h = g && g.hero;
      var u = ((e.t2 % LEAP_PERIOD) + LEAP_PERIOD) % LEAP_PERIOD;
      if (e.onGround && e.leaping) {                  // 落地煞停
        e.leaping = false;
        FX.aset(e.vx, 0);
      }
      if (!e.leaping && u === 0 && h && Math.abs((h.x + 6) - (e.x + 7)) <= LEAP_RANGE) {
        e.dir = (h.x < e.x) ? -1 : 1;
        FX.aset(e.vx, e.dir * LEAP_VX);
        FX.aset(e.vy, LEAP_VY);
        e.leaping = true;
      }
      if (e.leaping) {
        FX.vadd(e.px, e.vx.v);
        e.x = FX.vpx(e.px);
        var lead = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
        if (api.blocked(lead, e.y + 2) || api.blocked(lead, e.y + e.h - 2)) {
          e.dir = -e.dir;
          FX.aset(e.vx, e.dir * LEAP_VX);
          FX.vsetPx(e.px, e.x - e.dir);
          e.x = FX.vpx(e.px);
        }
      }
      api.fall(e);
    },
    art: function (e) {
      var A = T(); if (!A) return [0, 0];
      var u = ((e.t2 % LEAP_PERIOD) + LEAP_PERIOD) % LEAP_PERIOD;
      var f = (e.leaping || u >= LEAP_PERIOD - LEAP_WARN) ? 1 : 0;
      return [A.frog[f][0], A.frog[f][1], e.dir > 0];
    }
  });

  /* ---------------------------------------------------------------- thorn */
  E.register('thorn', {
    w: 14, h: 15, stompable: true, score: 300, pal: 1,
    setup: function (e, opt) {
      e.t2 = opt.phase | 0;
      FX.aset(e.vx, 0);
    },
    step: function (e, g, api) {
      e.t++; e.t2++;
      api.fall(e);
      var u = ((e.t2 % THORN_PERIOD) + THORN_PERIOD) % THORN_PERIOD;
      var out = u >= THORN_PERIOD - THORN_OUT;
      e.stompable = !out;                             // 伸刺中不可踩（每幀讀一次，見 enemies.js collideHero）
      e.out = out;
    },
    art: function (e) {
      var A = T(); if (!A) return [0, 0];
      var u = ((e.t2 % THORN_PERIOD) + THORN_PERIOD) % THORN_PERIOD;
      var warn = (!e.out) && u >= THORN_PERIOD - THORN_OUT - THORN_WARN;
      var f = e.out ? 1 : (warn && (e.t & 2) ? 1 : 0);  // 預警：伸刺前 20 幀閃一下
      return [A.thorn[f][0], A.thorn[f][1], false];
    }
  });

  /* ----------------------------------------------------------------- wisp */
  E.register('wisp', {
    w: 12, h: 12, stompable: false, score: 300, pal: 3,
    setup: function (e, opt) {
      e.baseY = e.y;
      e.phase = opt.phase | 0;
      e.amp = (opt.amp === undefined) ? WISP_AMP : opt.amp | 0;
      FX.aset(e.vx, 0); FX.aset(e.vy, 0);
    },
    step: function (e, g, api) {
      e.t++;
      e.phase = (e.phase + WISP_STEP) & 255;
      var h = g && g.hero;
      var dir = h ? ((h.x + 6 < e.x + 6) ? -1 : 1) : -1;
      e.dir = dir;
      FX.aset(e.vx, dir * WISP_VX);
      FX.vadd(e.px, e.vx.v);
      e.x = FX.vpx(e.px);
      e.y = e.baseY + ((api.sin8(e.phase) * e.amp) >> 8);
      FX.vsetPx(e.py, e.y);
    },
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      oam.add({ x: e.x - 2 - cam, y: e.y - 2, tile: A.wisp[(e.t >> 3) & 1], pal: 3, prio: prio });
      return 1;
    }
  });

  ST.EnemiesW3 = {
    KINDS: ['leaper', 'thorn', 'wisp'],
    CONST: {
      LEAP_PERIOD: LEAP_PERIOD, LEAP_WARN: LEAP_WARN, LEAP_RANGE: LEAP_RANGE,
      LEAP_VY: LEAP_VY, LEAP_VX: LEAP_VX,
      THORN_PERIOD: THORN_PERIOD, THORN_OUT: THORN_OUT, THORN_WARN: THORN_WARN,
      WISP_VX: WISP_VX, WISP_AMP: WISP_AMP, WISP_STEP: WISP_STEP
    }
  };
})();
