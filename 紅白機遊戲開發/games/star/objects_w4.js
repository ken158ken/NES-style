/*
 * games/star/objects_w4.js — 《星塵勇者》世界 4「機械要塞」的三個新機關（ST.ObjectsW4）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w4 agent（R4）｜ 依賴：engine/fixed.js（NES.FX）、chr_w4.js、levels_w1.js（ST.TILE）
 * 契約：docs/TASKS.md「R4 star W4」
 *
 * 三個機關**全部寫在關卡資料裡**（`ST.LEVELS['4-x'].belts / lasers / lifts`），本檔只負責
 * 推進與碰撞，沒有任何一關的座標被硬編碼；而且**位置與開關都是「時間（或位置）的純函式」**
 * ⇒ 通關機器人（tools/playthrough_star.py）可以往前推演。
 *
 *   ① belt  輸送帶    `{c, r, w, dir}`     站在第 r 列的帶面上 → 每幀被帶著走 ±0.5 px
 *                      （位置的純函式；撞牆不推。履帶本體是背景磚 TILE.BRIDGE → BG_BELT）
 *   ② laser 雷射柵欄  `{c, r, h, period, on, phase}`  週期開關的垂直光柵（開啟前 24 幀閃預警）
 *                      碰到 = 受傷；無敵星期間無效。形狀 / 介面與 W2 的間歇泉同一套，
 *                      所以 `hazardHit(x,y,w,h,t)` 可以直接餵給機器人的模擬器。
 *   ③ lift  齒輪升降台 `{c, r, w, axis:'x'|'y', range, period, phase}`
 *                      三角波純函式、單向平台語意、站上去被水平帶著走（同 W2 的礦車板，
 *                      但這裡是齒輪驅動的鋼板，CHR 是 W4 自己的 `W4_LIFT`）。
 *
 * ── main.js 的用法（與 ST.Objects 同介面；main.js 只插入四行呼叫）────────
 *   ST.ObjectsW4.init(level, { setTile: fn });  ST.ObjectsW4.seek(camX);
 *   ST.ObjectsW4.update(g);   ST.ObjectsW4.draw(oam, g);
 *
 * ── 給通關機器人 / 測試的純函式 API ──────────────────────────────────────
 *   now() / liftTops(t) / hazardHit(x,y,w,h,t) / convAt(x, row) / beltAt(x, row)
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/objects_w4.js 需要 engine/fixed.js');

  var BELT_V = FX.v88(0, 128);     // 輸送帶 0.5 px/幀（跑速 2.5 ⇒ 逆帶仍前進 2.0）
  var LASER_WARN = 24;             // 開啟前 24 幀預警（研究 04 §2「預警幀」）
  var LASER_SCORE = 0;

  var level = null, setTileFn = null;
  var belts = [], lasers = [], lifts = [];
  var tiles = null, camXCache = 0;

  /* ------------------------------------------------ 三角波（時間 → 位移，純函式） */
  function tri(t, period) {
    var half = period >> 1;
    var u = ((t % period) + period) % period;
    return u < half ? u : (period - u);
  }
  function liftPos(m, t) {
    var half = m.period >> 1;
    var d = ((tri(t + m.phase, m.period) * m.range) / half) | 0;
    if (m.axis === 'y') return { x: m.x0, y: m.y0 + d };
    return { x: m.x0 + d, y: m.y0 };
  }
  function liftBox(m, t) {
    var p = liftPos(m, t);
    return { x: p.x, y: p.y, w: m.w * 8, h: 8 };
  }
  function laserOn(ls, t) {
    var u = (((t + ls.phase) % ls.period) + ls.period) % ls.period;
    return u < ls.on;
  }
  function laserWarm(ls, t) {
    var u = (((t + ls.phase) % ls.period) + ls.period) % ls.period;
    return u >= ls.period - LASER_WARN;
  }
  function laserBox(ls) {
    return { x: ls.c * 8 + 1, y: (ls.r - ls.h + 1) * 8, w: 6, h: ls.h * 8 };
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /* ------------------------------------------------------------------ CHR */
  function ensureTiles() {
    if (tiles) return tiles;
    var W4 = ST.W4;
    if (!W4 || !W4.oam16) return null;
    var lift = W4.oam16('W4_LIFT');
    if (!lift) return null;                      // bank 還沒建好（CHR 未就緒）
    tiles = { lift: lift, laser: [W4.oam16('W4_LAS0'), W4.oam16('W4_LAS1')] };
    return tiles;
  }

  /* ------------------------------------------------------------------ init */
  function init(lv, opts) {
    opts = opts || {};
    level = lv || null;
    setTileFn = opts.setTile || null;
    tiles = null;
    Objects.frame = 0;
    Objects.pushed = 0; Objects.zaps = 0; Objects.rides = 0;
    belts = []; lasers = []; lifts = [];
    if (!level) return Objects;
    var i, m, src;
    src = level.belts || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      belts.push({ c: m.c | 0, r: m.r | 0, w: (m.w | 0) || 1, dir: (m.dir < 0 ? -1 : 1) });
    }
    src = level.lasers || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      lasers.push({
        c: m.c | 0, r: m.r | 0, h: (m.h | 0) || 4,
        period: (m.period | 0) || 150, on: (m.on | 0) || 48, phase: m.phase | 0
      });
    }
    src = level.lifts || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      lifts.push({
        x0: (m.x === undefined ? m.c * 8 : m.x) | 0,
        y0: (m.y === undefined ? m.r * 8 : m.y) | 0,
        w: m.w || 4, axis: m.axis === 'y' ? 'y' : 'x',
        range: m.range | 0, period: (m.period | 0) || 128, phase: m.phase | 0,
        c: m.c, r: m.r
      });
    }
    return Objects;
  }
  function reset() { Objects.frame = 0; return Objects; }
  function seek() { return Objects; }

  /* ---------------------------------------------------------------- update */
  function update(g) {
    g = g || {};
    Objects.frame++;
    var t = Objects.frame;
    var h = g.hero || null;
    if (g.camX !== undefined) camXCache = g.camX;
    if (g.level && g.level !== level) level = g.level;
    if (!h || h.state === 'dead') return Objects;

    var hh = (h.h === undefined) ? 22 : h.h;
    var hb = { x: h.x, y: h.y, w: h.w || 12, h: hh };

    ride(h, hb, hh, t, g);
    stepBelt(h, hh, g);
    stepLaser(h, hb, t, g);
    return Objects;
  }

  // ---- ③ 齒輪升降台：只從上方擋，站上去被帶著走（契約同 W2 的 mover）----
  function ride(h, hb, hh, t, g) {
    var i, m, now, prev, feet = h.y + hh, top, ptop, dx;
    for (i = 0; i < lifts.length; i++) {
      m = lifts[i];
      now = liftBox(m, t);
      prev = liftBox(m, t - 1);
      top = now.y; ptop = prev.y;
      if (h.x + hb.w <= now.x || h.x >= now.x + now.w) continue;
      if (h.vy < 0) continue;
      if (h.prevFeet > ptop + 3) continue;
      if (feet < top - 1 || feet > top + 10) continue;
      FX.vsetPx(h.py, top - hh);
      FX.aset(h.vyA, 0);
      h.onGround = true;
      h.onMover = m;
      dx = now.x - prev.x;
      if (dx) {
        FX.vadd(h.px, dx * 256);
        h.x = FX.floorPx(h.px.sub);
        if (h.x < 0) { h.x = 0; FX.vsetPx(h.px, 0); }
      }
      h.y = FX.floorPx(h.py.sub);
      h.prevFeet = h.y + hh;
      Objects.rides++;
      if (g && g.onRide) g.onRide(m);
      return true;
    }
    return false;
  }

  // ---- ① 輸送帶：腳下那一列是帶面就被帶著走 -----------------------------
  function beltAt(x, row) {
    var i, b, c = x >> 3;
    for (i = 0; i < belts.length; i++) {
      b = belts[i];
      if (b.r !== row) continue;
      if (c < b.c || c >= b.c + b.w) continue;
      return b.dir;
    }
    return 0;
  }
  function convAt(x, row) { return beltAt(x, row) * BELT_V; }

  function stepBelt(h, hh, g) {
    if (!h.onGround || h.onMover) return 0;
    var w = h.w || 12, row = (h.y + hh) >> 3;
    var dir = beltAt(h.x + 2, row) || beltAt(h.x + w - 3, row);
    if (!dir) return 0;
    // 撞牆就不推（避免被帶進牆裡卡住）
    var lead = (dir > 0) ? (h.x + w) : (h.x - 1);
    if (level && level.kindAt && level.kindAt(lead, h.y + 4) === 'solid') return 0;
    if (level && level.kindAt && level.kindAt(lead, h.y + hh - 4) === 'solid') return 0;
    FX.vadd(h.px, dir * BELT_V);
    h.x = FX.floorPx(h.px.sub);
    if (h.x < 0) { h.x = 0; FX.vsetPx(h.px, 0); }
    Objects.pushed++;
    return dir;
  }

  // ---- ② 雷射柵欄 -------------------------------------------------------
  function stepLaser(h, hb, t, g) {
    var i, ls, box;
    for (i = 0; i < lasers.length; i++) {
      ls = lasers[i];
      if (!laserOn(ls, t)) continue;
      box = laserBox(ls);
      if (!aabb(hb, box)) continue;
      if (h.star > 0) return false;                 // 無敵星：光柵無效
      Objects.zaps++;
      if (ST.Hero && ST.Hero.hurt) ST.Hero.hurt(h, g, box.x);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ draw */
  function draw(oam, g) {
    if (!oam || !oam.add) return 0;
    var A = ensureTiles();
    if (!A) return 0;
    var t = Objects.frame, cam = (g && g.camX !== undefined) ? g.camX : camXCache;
    var n = 0, i, j, m, box, ls, x;
    for (i = 0; i < lifts.length; i++) {
      m = lifts[i];
      box = liftBox(m, t);
      if (box.x + box.w < cam - 16 || box.x > cam + 272) continue;
      for (j = 0; j < m.w; j++) {
        oam.add({ x: box.x + j * 8 - cam, y: box.y, tile: A.lift, pal: 3, prio: 2 });
        n++;
      }
    }
    for (i = 0; i < lasers.length; i++) {
      ls = lasers[i];
      var on = laserOn(ls, t), warm = laserWarm(ls, t);
      if (!on && !warm) continue;
      x = ls.c * 8;
      if (x + 8 < cam - 16 || x > cam + 272) continue;
      var art = A.laser[(t >> 2) & 1];
      if (on) {
        for (j = 0; j < ls.h; j += 2) {
          oam.add({ x: x - cam, y: (ls.r - ls.h + 1 + j) * 8, tile: art, pal: 2, prio: 2 });
          n++;
        }
      } else {
        // 預警：只在發射口閃一小節
        oam.add({ x: x - cam, y: (ls.r - ls.h + 1) * 8, tile: art, pal: 1, prio: 2 });
        n++;
      }
    }
    return n;
  }

  /* ------------------------------------------- 給機器人 / 測試的純函式 API */
  function liftTops(t) {
    var out = [], i, b;
    for (i = 0; i < lifts.length; i++) {
      b = liftBox(lifts[i], t);
      out.push({ x0: b.x, x1: b.x + b.w, top: b.y, axis: lifts[i].axis });
    }
    return out;
  }
  function hazardHit(x, y, w, h, t) {
    var i, ls, box, a = { x: x, y: y, w: w, h: h };
    for (i = 0; i < lasers.length; i++) {
      ls = lasers[i];
      if (!laserOn(ls, t)) continue;
      box = laserBox(ls);
      if (aabb(a, box)) return true;
    }
    return false;
  }

  var Objects = {
    frame: 0, pushed: 0, zaps: 0, rides: 0,
    BELT_V: BELT_V, LASER_WARN: LASER_WARN, LASER_SCORE: LASER_SCORE,
    init: init, reset: reset, seek: seek, update: update, draw: draw,
    now: function () { return Objects.frame; },
    liftTops: liftTops, hazardHit: hazardHit, convAt: convAt, beltAt: beltAt,
    liftBox: liftBox, laserOn: laserOn, laserWarm: laserWarm, laserBox: laserBox,
    count: function () { return { belts: belts.length, lasers: lasers.length, lifts: lifts.length }; },
    state: function () {
      var t = Objects.frame, i, out = { frame: t, lifts: [], lasers: [], belts: [] };
      for (i = 0; i < lifts.length; i++) out.lifts.push(liftBox(lifts[i], t));
      for (i = 0; i < lasers.length; i++) out.lasers.push({ c: lasers[i].c, on: laserOn(lasers[i], t), warm: laserWarm(lasers[i], t) });
      for (i = 0; i < belts.length; i++) out.belts.push({ c: belts[i].c, r: belts[i].r, w: belts[i].w, dir: belts[i].dir });
      return out;
    }
  };

  ST.ObjectsW4 = Objects;
})();
