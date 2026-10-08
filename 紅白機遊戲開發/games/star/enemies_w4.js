/*
 * games/star/enemies_w4.js — 《星塵勇者》世界 4「機械要塞」的三種新敵 + 螺栓彈
 * ---------------------------------------------------------------------------
 * 擁有者：star-w4 agent（R4）｜ 依賴：games/star/enemies.js（ST.Enemies.register / API）、chr_w4.js
 *                                   engine/shmup.js（**NES.SH.OAM.add16** — R4 新增的 16×16 便利 add）
 * 契約：docs/TASKS.md「R4 star W4」
 *
 *   ⑧ drone  巡邏無人機  在生成點附近 ±range px 來回飛（正弦上下浮 ±8 px）。**可踩**
 *   ⑨ guard  重裝守衛    護罩關閉時走路且**不可踩**；每 150 幀打開排氣窗 60 幀（核心外露）
 *                        ⇒ **只有這 60 幀踩得死**。關閉前最後 20 幀閃爍預警（研究 04 §2）
 *                        ＝ W2 護甲礦兵「只能繞路」的第二解法：等時機、照節奏踩
 *   ⑩ sentry 螺栓砲塔    固定不動，每 90 幀朝主角射一發水平螺栓。**可踩**
 *   ⑪ bolt   螺栓彈      直線飛行的一次性投射物（碰到就消失）
 *
 * 全部走 `ST.Enemies.register()`，W1 / W2 的敵人程式一行都沒動；
 * **繪製一律用 `oam.add16()`**（引擎層統一處理 16×16 水平翻轉的左右對調），
 * 所以本檔不必像 R3 的 enemies.js 一樣手寫 `fl ? p[1] : p[0]`。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var E = ST.Enemies;
  if (!E || !E.register) throw new Error('games/star/enemies_w4.js 需要 games/star/enemies.js（有 register）');
  var FX = NES.FX, SMB = FX.SMB;

  var DRN_VX = SMB.enemyFast;              // 0.75 px/幀
  var DRN_RANGE = 48;                      // 巡邏半幅（px）
  var DRN_BOB = 8;                         // 正弦上下 ±8 px
  var GRD_VX = SMB.enemySlow;              // 0.5 px/幀
  var GRD_CLOSED = 150;                    // 護罩關閉 150 幀（不可踩）
  var GRD_OPEN = 60;                       // 排氣窗開啟 60 幀（可踩 = 弱點窗口）
  var GRD_WARN = 20;                       // 開啟前 20 幀閃爍預警
  var SEN_PERIOD = 90;                     // 砲塔射擊週期
  var SEN_RANGE = 168;                     // 主角在 168 px 內才射
  var SEN_TELL = 20;                       // 射擊前 20 幀亮砲口（預警）
  var BOLT_VX = FX.v88(1, 128);            // 1.5 px/幀

  var tiles = null;
  function T() {
    if (tiles) return tiles;
    var W4 = ST.W4;
    if (!W4 || !W4.oam16) return null;
    var probe = W4.oam16('W4_DRN0_L');
    if (!probe) return null;                        // 精靈 bank 還沒建好
    function pair(n) { return [W4.oam16(n + '_L'), W4.oam16(n + '_R')]; }
    tiles = {
      drn: [pair('W4_DRN0'), pair('W4_DRN1')],
      grd: [pair('W4_GRD0'), pair('W4_GRD1')],
      grdO: pair('W4_GRDO'),
      sen: [pair('W4_SEN0'), pair('W4_SEN1')],
      bolt: [W4.oam16('W4_BOLT0'), W4.oam16('W4_BOLT1')]
    };
    return tiles;
  }
  // 16×16：一律走 engine 的 add16（自動處理 flipH 的左右對調）
  function draw16(oam, pair, x, y, pal, prio, flip) {
    return oam.add16({ x: x, y: y, tiles: pair, pal: pal, prio: prio, flipH: !!flip });
  }

  /* ---------------------------------------------------------------- drone */
  E.register('drone', {
    w: 14, h: 12, stompable: true, score: 200, pal: 3,
    setup: function (e, opt) {
      e.baseY = e.y;
      e.homeX = e.x;
      e.range = (opt.range === undefined) ? DRN_RANGE : (opt.range | 0);
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      e.phase = opt.phase || 0;
      FX.aset(e.vx, e.dir * DRN_VX);
      FX.aset(e.vy, 0);
    },
    step: function (e, g, api) {
      e.t++;
      FX.aset(e.vx, e.dir * DRN_VX);
      FX.vadd(e.px, e.vx.v);
      e.x = FX.vpx(e.px);
      var lead = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
      if (api.blocked(lead, e.y + 2) || api.blocked(lead, e.y + e.h - 2)
          || (e.x - e.homeX) > e.range || (e.homeX - e.x) > e.range) {
        e.dir = -e.dir;
        FX.vsetPx(e.px, e.x - e.dir);
        e.x = FX.vpx(e.px);
      }
      e.phase = (e.phase + 3) & 255;
      e.y = e.baseY + ((api.sin8(e.phase) * DRN_BOB) >> 8);
      FX.vsetPx(e.py, e.y);
    },
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      return draw16(oam, A.drn[(e.t >> 2) & 1], e.x - 1 - cam, e.y - 2, 3, prio, e.dir > 0);
    }
  });

  /* ---------------------------------------------------------------- guard */
  E.register('guard', {
    w: 14, h: 15, stompable: false, score: 400, pal: 1,
    setup: function (e, opt) {
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      e.edge = opt.edge === undefined ? true : !!opt.edge;
      e.t2 = (opt.phase | 0) || 0;
      e.open = false;
      e.stompable = false;
      FX.aset(e.vx, e.dir * GRD_VX);
    },
    step: function (e, g, api) {
      e.t++; e.t2++;
      var cyc = GRD_CLOSED + GRD_OPEN;
      var u = e.t2 % cyc;
      e.open = u >= GRD_CLOSED;
      e.stompable = e.open;                       // 弱點窗口：只有開著才踩得死
      if (e.open) { FX.aset(e.vx, 0); api.fall(e); return; }   // 開著時站定（讓玩家對得準）
      FX.aset(e.vx, e.dir * GRD_VX);
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
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      var cyc = GRD_CLOSED + GRD_OPEN, u = e.t2 % cyc;
      var pair, pal = 1;
      if (e.open) { pair = A.grdO; pal = 2; }                      // 核心外露（紅）
      else if (u >= GRD_CLOSED - GRD_WARN) pair = A.grd[(e.t >> 1) & 1];   // 預警：快閃
      else pair = A.grd[(e.t >> 3) & 1];
      return draw16(oam, pair, e.x - 1 - cam, e.y - 1, pal, prio, e.dir > 0);
    }
  });

  /* --------------------------------------------------------------- sentry */
  E.register('sentry', {
    w: 14, h: 15, stompable: true, score: 300, pal: 3,
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
      if ((e.t2 % SEN_PERIOD) !== 0) return;
      if (Math.abs(dx) > SEN_RANGE) return;
      var b = api.spawn('bolt', e.x + (e.dir > 0 ? 12 : 0), e.y + 4, { dir: e.dir });
      if (b && g && g.sfx) g.sfx('bump');
    },
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      var f = ((e.t2 % SEN_PERIOD) > SEN_PERIOD - SEN_TELL) ? 1 : 0;
      return draw16(oam, A.sen[f], e.x - 1 - cam, e.y - 1, 3, prio, e.dir > 0);
    }
  });

  /* ----------------------------------------------------------------- bolt */
  E.register('bolt', {
    w: 8, h: 6, stompable: false, score: 0, fragile: true, pal: 2,
    setup: function (e, opt) {
      e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
      FX.aset(e.vx, e.dir * BOLT_VX);
      FX.aset(e.vy, 0);
    },
    step: function (e, g, api) {
      e.t++;
      FX.vadd(e.px, e.vx.v);
      e.x = FX.vpx(e.px);
      if (api.blocked(e.x + (e.dir > 0 ? e.w : -1), e.y + 3)) e.alive = false;
    },
    draw: function (e, oam, cam, prio) {
      var A = T(); if (!A) return 0;
      oam.add({ x: e.x - cam, y: e.y - 5, tile: A.bolt[(e.t >> 2) & 1], pal: 2, prio: prio });
      return 1;
    }
  });

  ST.EnemiesW4 = {
    KINDS: ['drone', 'guard', 'sentry', 'bolt'],
    CONST: {
      DRN_VX: DRN_VX, DRN_RANGE: DRN_RANGE, DRN_BOB: DRN_BOB,
      GRD_VX: GRD_VX, GRD_CLOSED: GRD_CLOSED, GRD_OPEN: GRD_OPEN, GRD_WARN: GRD_WARN,
      SEN_PERIOD: SEN_PERIOD, SEN_RANGE: SEN_RANGE, SEN_TELL: SEN_TELL, BOLT_VX: BOLT_VX
    }
  };
})();
