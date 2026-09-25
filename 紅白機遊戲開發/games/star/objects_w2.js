/*
 * games/star/objects_w2.js — 《星塵勇者》世界 2 的「關卡機關」（ST.Objects）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w2 agent ｜ 依賴：engine/fixed.js（NES.FX）、chr_w2.js、levels_w1.js（ST.TILE）
 * 契約：docs/TASKS.md「R3 star W2」
 *
 * 四種機關**全部寫在關卡資料裡**（`ST.LEVELS['2-x'].movers / geysers / items` 與磚語意
 * `TILE.CRUMBLE` / `TILE.SPRING`），本檔只負責推進與碰撞，沒有任何一關的座標被硬編碼。
 *
 *   ① mover   礦車升降板  `{c, r, w, axis:'x'|'y', range, period, phase}`
 *              位置是**時間的純函式**（三角波）⇒ 可預測、可重現，通關機器人能往前推演。
 *              單向平台語意：只從上方擋，下方可穿過；站上去會被水平帶著走。
 *   ② crumble 崩塌礦石磚  磚語意 `TILE.CRUMBLE`：踩住 HOLD 幀後碎掉，BACK 幀後復原。
 *   ③ spring  蒸氣彈簧    磚語意 `TILE.SPRING`：站上去立刻彈飛（按住 A 彈更高）。
 *   ④ geyser  熔岩間歇泉  `{c, r, h, period, on, phase}`：週期性噴火柱，也是時間的純函式。
 *   ⑤ item    星塵（無敵星）`{c, r, kind:'star'}`：吃到 → `hero.star` 旗標（熔岩 / 尖刺 / 坑
 *              都不再致命，撞到敵人直接打倒），順便收掉 R2c fix5「一鍵無敵擋不住熔岩」。
 *
 * ── main.js 的用法 ────────────────────────────────────────────────────────
 *   ST.Objects.init(level, { setTile: fn });    // 換關
 *   ST.Objects.seek(camX);                      // 檢查點復活
 *   ST.Objects.update(g);                       // 每幀（Hero.update 之後）
 *   ST.Objects.draw(oam, g);
 *
 * ── 給通關機器人的純函式（tools/playthrough_star.py）────────────────────
 *   ST.Objects.now()            目前絕對幀
 *   ST.Objects.moverTops(t)     第 t 幀所有升降板的 {x0, x1, top}
 *   ST.Objects.hazardHit(x, y, w, h, t)   第 t 幀 (x,y,w,h) 是否碰到火柱
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/objects_w2.js 需要 engine/fixed.js');
  var SMB = FX.SMB;

  var CRUMBLE_HOLD = 36;       // 踩住 36 幀（0.6 s）才碎 —— 跑過去（2.5 px/幀）完全來得及
  var CRUMBLE_SHAKE = 12;      // 最後 12 幀開始抖（視覺預警，研究 04 §2 的「預警幀」）
  var CRUMBLE_BACK = 240;      // 碎掉 4 秒後復原
  // 彈簧初速 −5 px/幀 ＋ Hero.LAUNCH_SEG 的 0.125 px/幀² ⇒ 彈高 100 px（12.5 格），
  // 比全速跑跳（80 px）高一截，一眼看得出「這是機關不是跳躍」。
  var SPRING_VY = -FX.v88(5, 0);
  var STAR_FRAMES = 480;       // 無敵星 8 秒（與 song.js 的 invincible 約 8 s 對齊）
  var ITEM_BOB = 32;           // 道具上下浮動週期
  var GEYSER_WARN = 24;        // 噴發前 24 幀的預警（只畫，不傷人）

  var level = null, setTileFn = null;
  var movers = [], geysers = [], items = [];
  var crumbles = {};           // key = col*32+row → {c, r, t, broken, back}
  var broken = [];             // 待復原清單
  var tiles = null, camXCache = 0;

  function T() { return ST.TILE; }

  /* ------------------------------------------------ 三角波（時間 → 位移，純函式） */
  function tri(t, period) {
    var half = period >> 1;
    var u = ((t % period) + period) % period;
    return u < half ? u : (period - u);
  }
  function moverPos(m, t) {
    var half = m.period >> 1;
    var d = ((tri(t + m.phase, m.period) * m.range) / half) | 0;
    if (m.axis === 'y') return { x: m.x0, y: m.y0 + d };
    return { x: m.x0 + d, y: m.y0 };
  }
  function moverBox(m, t) {
    var p = moverPos(m, t);
    return { x: p.x, y: p.y, w: m.w * 8, h: 8 };
  }
  function geyserOn(gy, t) {
    var u = (((t + gy.phase) % gy.period) + gy.period) % gy.period;
    return u < gy.on;
  }
  function geyserWarm(gy, t) {
    var u = (((t + gy.phase) % gy.period) + gy.period) % gy.period;
    return u >= gy.period - GEYSER_WARN;
  }
  function geyserBox(gy) {
    return { x: gy.c * 8, y: (gy.r - gy.h + 1) * 8, w: 8, h: gy.h * 8 };
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /* ------------------------------------------------------------------ CHR */
  function ensureTiles() {
    if (tiles) return tiles;
    var W = ST.World;
    if (!W || !W.bound) return null;
    tiles = {
      lift: W.oam16('W2_LIFT_M'),
      flame: [W.oam16('W2_FLAME0'), W.oam16('W2_FLAME1')],
      star: [[W.oam16('W_STAR0_L'), W.oam16('W_STAR0_R')], [W.oam16('W_STAR1_L'), W.oam16('W_STAR1_R')]]
    };
    return tiles;
  }

  /* ------------------------------------------------------------------ init */
  function init(lv, opts) {
    opts = opts || {};
    level = lv || null;
    setTileFn = opts.setTile || null;
    tiles = null;
    Objects.frame = 0;
    movers = []; geysers = []; items = [];
    crumbles = {}; broken = [];
    if (!level) return Objects;
    var i, m, src;
    src = level.movers || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      movers.push({
        x0: (m.x === undefined ? m.c * 8 : m.x) | 0,
        y0: (m.y === undefined ? m.r * 8 : m.y) | 0,
        w: m.w || 4, axis: m.axis === 'y' ? 'y' : 'x',
        range: m.range | 0, period: (m.period | 0) || 128, phase: m.phase | 0,
        c: m.c, r: m.r
      });
    }
    src = level.geysers || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      geysers.push({
        c: m.c | 0, r: m.r | 0, h: (m.h | 0) || 3,
        period: (m.period | 0) || 150, on: (m.on | 0) || 60, phase: m.phase | 0
      });
    }
    src = level.items || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      items.push({ c: m.c | 0, r: m.r | 0, kind: m.kind || 'star', taken: false, x: m.c * 8, y: m.r * 8 });
    }
    return Objects;
  }

  function reset() {
    var i;
    restoreAll();
    crumbles = {}; broken = [];
    for (i = 0; i < items.length; i++) items[i].taken = false;
    Objects.frame = 0;
    return Objects;
  }
  function seek(camX) {
    restoreAll();
    crumbles = {}; broken = [];
    var i;
    for (i = 0; i < items.length; i++) if (items[i].x >= camX) items[i].taken = false;
    return Objects;
  }
  function restoreAll() {
    var i, b;
    for (i = 0; i < broken.length; i++) {
      b = broken[i];
      if (setTileFn) setTileFn(b.c, b.r, T().CRUMBLE);
    }
    broken.length = 0;
  }

  /* ---------------------------------------------------------------- update */
  function update(g) {
    g = g || {};
    Objects.frame++;
    var t = Objects.frame;
    var h = g.hero || null;
    if (g.camX !== undefined) camXCache = g.camX;
    if (g.level && g.level !== level) level = g.level;

    stepBroken(t);
    if (!h || h.state === 'dead') return Objects;

    var hh = (h.h === undefined) ? 22 : h.h;
    var hb = { x: h.x, y: h.y, w: h.w || 12, h: hh };

    ride(h, hb, hh, t, g);
    stepCrumble(h, hh, t, g);
    stepSpring(h, hh, g);
    stepGeyser(h, hb, t, g);
    stepItems(h, hb, t, g);
    return Objects;
  }

  // ---- ① 升降板：只從上方擋，站上去被帶著走 -----------------------------
  function ride(h, hb, hh, t, g) {
    var i, m, now, prev, feet = h.y + hh, top, ptop;
    h.onMover = null;
    for (i = 0; i < movers.length; i++) {
      m = movers[i];
      now = moverBox(m, t);
      prev = moverBox(m, t - 1);
      top = now.y; ptop = prev.y;
      if (h.x + hb.w <= now.x || h.x >= now.x + now.w) continue;      // 水平沒重疊
      if (h.vy < 0) continue;                                          // 上升中一律穿過
      if (h.prevFeet > ptop + 3) continue;                             // 上一幀腳已經在板子下面
      if (feet < top - 1 || feet > top + 10) continue;                 // 不在落腳範圍
      FX.vsetPx(h.py, top - hh);
      FX.aset(h.vyA, 0);
      h.onGround = true;
      h.onMover = m;
      // 水平帶動（垂直板 dx = 0）
      var dx = now.x - prev.x;
      if (dx) {
        FX.vadd(h.px, dx * 256);
        h.x = FX.floorPx(h.px.sub);
        if (h.x < 0) { h.x = 0; FX.vsetPx(h.px, 0); }
      }
      h.y = FX.floorPx(h.py.sub);
      h.prevFeet = h.y + hh;
      if (g && g.onRide) g.onRide(m);
      return true;
    }
    return false;
  }

  // ---- ② 崩塌礦石磚 -----------------------------------------------------
  function stepCrumble(h, hh, t, g) {
    var frow = (h.y + hh) >> 3, c, key, st;
    var c0 = h.x >> 3, c1 = (h.x + (h.w || 12) - 1) >> 3;
    var touched = {};
    if (h.onGround && !h.onMover) {
      for (c = c0; c <= c1; c++) {
        if (!level || level.tileAt(c, frow) !== T().CRUMBLE) continue;
        key = c * 32 + frow;
        touched[key] = 1;
        st = crumbles[key];
        if (!st) st = crumbles[key] = { c: c, r: frow, t: 0 };
        st.t++;
        if (st.t >= CRUMBLE_HOLD) {
          if (setTileFn) setTileFn(c, frow, T().EMPTY);
          broken.push({ c: c, r: frow, at: t + CRUMBLE_BACK });
          delete crumbles[key];
          if (g && g.sfx) g.sfx('bump');
        }
      }
    }
    for (key in crumbles) {                      // 離開的磚慢慢回復（不是瞬間歸零）
      if (touched[key]) continue;
      st = crumbles[key];
      st.t -= 2;
      if (st.t <= 0) delete crumbles[key];
    }
  }
  function stepBroken(t) {
    var i, b;
    for (i = broken.length - 1; i >= 0; i--) {
      b = broken[i];
      if (t < b.at) continue;
      if (setTileFn) setTileFn(b.c, b.r, T().CRUMBLE);
      broken.splice(i, 1);
    }
  }

  // ---- ③ 蒸氣彈簧 -------------------------------------------------------
  function stepSpring(h, hh, g) {
    if (!h.onGround || h.onMover || !level) return false;
    var frow = (h.y + hh) >> 3;
    var c0 = h.x >> 3, c1 = (h.x + (h.w || 12) - 1) >> 3, c;
    for (c = c0; c <= c1; c++) {
      if (level.tileAt(c, frow) !== T().SPRING) continue;
      if (ST.Hero && ST.Hero.launch) ST.Hero.launch(h, SPRING_VY);
      else { SMB.jumpStart(h.jumpS, FX.abs(h.vxA.v), h.py.sub); FX.aset(h.vyA, SPRING_VY); }
      h.onGround = false;
      Objects.springs++;
      if (g && g.sfx) g.sfx('jump');
      return true;
    }
    return false;
  }

  // ---- ④ 熔岩間歇泉 -----------------------------------------------------
  function stepGeyser(h, hb, t, g) {
    var i, gy, box;
    for (i = 0; i < geysers.length; i++) {
      gy = geysers[i];
      if (!geyserOn(gy, t)) continue;
      box = geyserBox(gy);
      if (!aabb(hb, box)) continue;
      if (h.star > 0) return false;                 // 無敵星：火柱無效
      if (ST.Hero && ST.Hero.hurt) ST.Hero.hurt(h, g, box.x);
      return true;
    }
    return false;
  }

  // ---- ⑤ 道具（星塵） ---------------------------------------------------
  function stepItems(h, hb, t, g) {
    var i, it, box;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.taken) continue;
      box = { x: it.x, y: it.y + bob(t), w: 16, h: 16 };
      if (!aabb(hb, box)) continue;
      it.taken = true;
      Objects.picked++;
      if (g && g.onItem) g.onItem(it);
      return true;
    }
    return false;
  }
  function bob(t) { return ((tri(t, ITEM_BOB) * 4) / (ITEM_BOB >> 1)) | 0; }

  /* ------------------------------------------------------------------ draw */
  function draw(oam, g) {
    if (!oam || !oam.add) return 0;
    var A = ensureTiles();
    if (!A) return 0;
    var t = Objects.frame, cam = (g && g.camX !== undefined) ? g.camX : camXCache;
    var n = 0, i, j, m, box, gy, it;
    for (i = 0; i < movers.length; i++) {
      m = movers[i];
      box = moverBox(m, t);
      if (box.x + box.w < cam - 16 || box.x > cam + 272) continue;
      for (j = 0; j < m.w; j++) {
        oam.add({ x: box.x + j * 8 - cam, y: box.y, tile: A.lift, pal: 3, prio: 2 });
        n++;
      }
    }
    for (i = 0; i < geysers.length; i++) {
      gy = geysers[i];
      var on = geyserOn(gy, t), warm = geyserWarm(gy, t);
      if (!on && !warm) continue;
      var x = gy.c * 8;
      if (x + 8 < cam - 16 || x > cam + 272) continue;
      var rows = on ? gy.h : 1;                       // 預警只冒一小節
      var art = A.flame[(t >> 2) & 1];
      for (j = 0; j < rows; j += 2) {
        oam.add({ x: x - cam, y: (gy.r - j) * 8 - 8, tile: art, pal: 2, prio: 2 });
        n++;
      }
    }
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.taken) continue;
      if (it.x + 16 < cam - 16 || it.x > cam + 272) continue;
      var pair = A.star[(t >> 3) & 1], y = it.y + bob(t);
      oam.add({ x: it.x - cam, y: y, tile: pair[0], pal: 1, prio: 2 });
      oam.add({ x: it.x + 8 - cam, y: y, tile: pair[1], pal: 1, prio: 2 });
      n += 2;
    }
    return n;
  }

  /* ------------------------------------------- 給機器人 / 測試的純函式 API */
  function moverTops(t) {
    var out = [], i, b;
    for (i = 0; i < movers.length; i++) {
      b = moverBox(movers[i], t);
      out.push({ x0: b.x, x1: b.x + b.w, top: b.y, axis: movers[i].axis });
    }
    return out;
  }
  function hazardHit(x, y, w, h, t) {
    var i, gy, box, a = { x: x, y: y, w: w, h: h };
    for (i = 0; i < geysers.length; i++) {
      gy = geysers[i];
      if (!geyserOn(gy, t)) continue;
      box = geyserBox(gy);
      if (aabb(a, box)) return true;
    }
    return false;
  }

  var Objects = {
    frame: 0, springs: 0, picked: 0,
    CRUMBLE_HOLD: CRUMBLE_HOLD, CRUMBLE_SHAKE: CRUMBLE_SHAKE, CRUMBLE_BACK: CRUMBLE_BACK,
    SPRING_VY: SPRING_VY, STAR_FRAMES: STAR_FRAMES, GEYSER_WARN: GEYSER_WARN,
    init: init, reset: reset, seek: seek, update: update, draw: draw,
    now: function () { return Objects.frame; },
    moverTops: moverTops, hazardHit: hazardHit,
    moverBox: moverBox, geyserOn: geyserOn, geyserBox: geyserBox,
    count: function () { return { movers: movers.length, geysers: geysers.length, items: items.length }; },
    state: function () {
      var t = Objects.frame, i, out = { frame: t, movers: [], geysers: [], items: [], broken: broken.length, crumbling: 0 };
      for (i = 0; i < movers.length; i++) out.movers.push(moverBox(movers[i], t));
      for (i = 0; i < geysers.length; i++) out.geysers.push({ c: geysers[i].c, on: geyserOn(geysers[i], t) });
      for (i = 0; i < items.length; i++) out.items.push({ c: items[i].c, r: items[i].r, kind: items[i].kind, taken: items[i].taken });
      for (i in crumbles) out.crumbling++;
      return out;
    },
    // 崩塌磚的視覺抖動（main.js 的 draw 不需要，留給測試 / 之後的粒子）
    crumbleTimer: function (c, r) { var s = crumbles[c * 32 + r]; return s ? s.t : 0; }
  };

  ST.Objects = Objects;
})();
