/*
 * games/star/objects_w3.js — 《星塵勇者》世界 3 的「關卡機關」（ST.Objects 擴充）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w3 agent（R4 F4-1）｜依賴：engine/fixed.js、chr_w3.js、objects_w2.js、hero.js
 * 契約：docs/R4_BRIEF.md F4-1、docs/TASKS.md「R4 star W3」
 *
 * 四種新機關**全部寫在關卡資料裡**（`ST.LEVELS['3-x'].vines / caps / spores / glooms`），
 * 本檔只負責推進與碰撞，沒有任何一關的座標被硬編碼。做法是**包住 W2 的 ST.Objects**
 * （`init/reset/seek/update/draw/state/moverTops/hazardHit` 各接一層），
 * 所以 `games/star/objects_w2.js` 一行未改、W1 / W2 行為完全不變。
 *
 *   ① vine   藤蔓鞦韆  `{c, r, len, range, period, phase}`
 *            擺角是**時間的純函式**（三角波 + 拋物線補償 y）⇒ 可預測、可重現。
 *            按住 ↑ 抓住（主角碰到藤蔓下段才算）、按 A 放開 ⇒ 以 −4.5 px/幀彈出（≈81 px 高）
 *            並帶走藤蔓當下的水平速度；放開後 20 幀內是「藤蔓衝撞」判定（= 魔王第二打法）。
 *   ② cap    會縮的樹菇 `{c, r, w, period, phase, on}`
 *            單向平台，只在 `(t+phase) % period < on` 的時段存在；消失前 20 幀縮小預警。
 *            **也掛進 `ST.Objects.moverTops(t)`** ⇒ 通關機器人的兩步推演自動知道它何時在。
 *   ③ spore  孢子雲    `{c, r, axis:'x'|'y', range, period, phase}`
 *            會移動的危險（16×16）；**掛進 `ST.Objects.hazardHit(...)`** ⇒ 機器人會閃。
 *   ④ gloom  螢火暗區  `{c0, c1, flies}`
 *            主角走進欄區間 → 整組調色盤換成暗版（真機只是 1 次調色盤寫入），
 *            螢火繞著主角轉當照明。純視覺，不影響地形 / 可達性。
 *
 * ── 另外：W3 的精靈 CHR 分頁 ──────────────────────────────────────────────
 *   磚索引走 `ST.W3.oam16(name)`（st_spr_w3 分頁，見 chr_w3.js）；圖樣表的切換由 main.js
 *   既有的 `ST.SprBanks.apply(level)` 負責（F4-2 插的那一行，W3 / W4 共用）。
 *
 * ── 給通關機器人 / 測試的純函式（都在 ST.Objects 上，main.js 的 dev API 自動吃到）──
 *   ST.Objects.moverTops(t)                W2 升降板 + W3 樹菇（當下存在的）
 *   ST.Objects.hazardHit(x, y, w, h, t)    W2 火柱 + W3 孢子雲
 *   ST.ObjectsW3.vineTip(i, t) / capBox(i, t) / capOn(i, t) / sporeBox(i, t)
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/objects_w3.js 需要 engine/fixed.js');
  var base = ST.Objects;
  if (!base || !base.init) throw new Error('games/star/objects_w3.js 需要 games/star/objects_w2.js（ST.Objects）');

  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ------------------------------------------------------------- 常數 */
  var CAP_WARN = 20;                  // 樹菇消失前 20 幀縮小（研究 04 §2 的「預警幀」）
  var CAP_PERIOD = 180, CAP_ON = 120; // 預設：120 幀在 / 60 幀不在
  var VINE_PERIOD = 160, VINE_RANGE = 40, VINE_LEN = 48;
  var VINE_VY = -FX.v88(4, 128);      // 放手 −4.5 px/幀（LAUNCH_SEG 小重力 ⇒ 約 81 px 高）
  var VINE_GRAB = 14;                 // 抓取判定半徑（px；握把是 16×16 的 2× 圖示）
  var VINE_STRIKE = 20;               // 放手後 20 幀內算「藤蔓衝撞」
  var SPORE_W = 16, SPORE_H = 16;
  var GLOOM_FLIES = 3, GLOOM_R = 22, GLOOM_PERIOD = 96;

  var level = null, world = 0, theme = 'swamp';
  var vines = [], caps = [], spores = [], glooms = [];
  var dark = false, tiles = null, tilesBank = null, camXCache = 0;

  function tri(t, period) {
    var half = period >> 1;
    var u = ((t % period) + period) % period;
    return u < half ? u : (period - u);
  }
  // 三角波 → −1..+1（8.8 定點：回傳 −256..+256）
  function swing(t, period) {
    var half = period >> 1;
    return (((tri(t, period) * 512) / half) | 0) - 256;
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function sin8(a) {
    var API = ST.Enemies && ST.Enemies.API;
    if (API && API.sin8) return API.sin8(a);
    return Math.round(Math.sin((a & 255) * Math.PI / 128) * 256);
  }

  /* ---------------------------------------------- ① 藤蔓（時間的純函式） */
  function vineTip(i, t) {
    var v = vines[i];
    if (!v) return null;
    var s = swing(t + v.phase, v.period);             // −256..256
    var dx = (v.range * s) >> 8;
    // 擺到兩端時尖端會抬高：y = len − dx²/(2·len)（拋物線近似，整數運算）
    var dy = v.len - ((dx * dx) / (2 * v.len) | 0);
    return { x: v.px + dx, y: v.py + dy, dx: dx, dy: dy, px: v.px, py: v.py, len: v.len };
  }
  function vineVX(i, t) {                              // 尖端的水平速度（px/幀，8.8）
    var a = vineTip(i, t), b = vineTip(i, t - 1);
    if (!a || !b) return 0;
    return (a.x - b.x) * 256;
  }

  /* ---------------------------------------------- ② 會縮的樹菇（純函式） */
  function capPhase(i, t) {
    var c = caps[i];
    if (!c) return -1;
    var u = (((t + c.phase) % c.period) + c.period) % c.period;
    return u;
  }
  function capOn(i, t) {
    var c = caps[i], u = capPhase(i, t);
    return u >= 0 && u < c.on;
  }
  function capWarn(i, t) {
    var c = caps[i], u = capPhase(i, t);
    return u >= 0 && u < c.on && u >= c.on - CAP_WARN;
  }
  function capBox(i, t) {
    var c = caps[i];
    if (!c) return null;
    return { x: c.c * 8, y: c.r * 8, w: c.w * 8, h: 8 };
  }

  /* ---------------------------------------------- ③ 孢子雲（純函式） */
  function sporeBox(i, t) {
    var s = spores[i];
    if (!s) return null;
    var half = s.period >> 1;
    var d = ((tri(t + s.phase, s.period) * s.range) / half) | 0;
    if (s.axis === 'y') return { x: s.c * 8, y: s.r * 8 + d, w: SPORE_W, h: SPORE_H };
    return { x: s.c * 8 + d, y: s.r * 8, w: SPORE_W, h: SPORE_H };
  }

  /* ---------------------------------------------- ④ 暗區（調色盤） */
  function ppu() {
    return (NES.instance && NES.instance.ppu) || null;
  }
  function inGloom(h) {
    if (!h) return false;
    var col = (h.x + 6) >> 3, i;
    for (i = 0; i < glooms.length; i++) if (col >= glooms[i].c0 && col <= glooms[i].c1) return glooms[i];
    return null;
  }
  function applyPal(p) {
    var u = ppu(), i;
    if (!u || !p) return false;
    u.setBackdrop(p.backdrop);
    for (i = 0; i < 3; i++) {
      u.setBgPalette(i + 1, p.bg[i]);
      u.setSprPalette(i + 1, p.spr[i]);
    }
    return true;
  }
  function setDark(on) {
    if (on === dark) return false;
    var D = ST.PAL_W3_DARK && ST.PAL_W3_DARK[theme];
    if (on) {
      if (!applyPal(D)) return false;
      dark = true;
    } else {
      if (ST.World && ST.World.applyPalettes && ppu()) ST.World.applyPalettes(ppu(), theme);
      else applyPal(ST.PAL_WORLD && ST.PAL_WORLD[theme]);
      dark = false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ CHR */
  function ensureTiles() {
    // 世界 3 的精靈在 st_spr_w3 分頁（chr_w3.js）⇒ 磚索引走 ST.W3.oam16，不走 ST.World
    var W = ST.W3;
    if (!W || !W.oam16) return null;
    var bank = W.bank ? W.bank() : null;
    if (tiles && tilesBank === bank) return tiles;
    if (!bank) return null;
    tiles = {
      vine: W.oam16('W3_VINE'),
      knot: [W.oam16('W3_VKNOT_L'), W.oam16('W3_VKNOT_R')],   // 2×（16×16）握把
      capL: W.oam16('W3_CAP_L'), capM: W.oam16('W3_CAP_M'), capR: W.oam16('W3_CAP_R'),
      capS: W.oam16('W3_CAP_S'), fly: W.oam16('W3_FLY'),
      spore: [[W.oam16('W3_SPORE0_L'), W.oam16('W3_SPORE0_R')], [W.oam16('W3_SPORE1_L'), W.oam16('W3_SPORE1_R')]]
    };
    tilesBank = bank;
    return tiles;
  }

  /* ------------------------------------------------------------------ init */
  function initW3(lv) {
    level = lv || null;
    vines = []; caps = []; spores = []; glooms = [];
    dark = false;
    tiles = null; tilesBank = null;
    W3.frame = 0; W3.grabs = 0; W3.strikes = 0;
    world = (lv && lv.world) | 0;
    theme = (lv && lv.theme) || 'swamp';
    // 精靈 CHR 分頁由 main.js 既有的 `ST.SprBanks.apply(lv)` 處理（chr_w3.js 已 register(3)）
    if (ST.BossW3 && world !== 3) { try { ST.BossW3.reset(); } catch (e) { } }
    if (!level) return;
    var src, i, m;
    src = level.vines || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      vines.push({
        px: (m.x === undefined ? m.c * 8 + 4 : m.x) | 0,
        py: (m.y === undefined ? m.r * 8 : m.y) | 0,
        len: (m.len | 0) || VINE_LEN,
        range: (m.range | 0) || VINE_RANGE,
        period: (m.period | 0) || VINE_PERIOD,
        phase: m.phase | 0, c: m.c, r: m.r
      });
    }
    src = level.caps || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      caps.push({
        c: m.c | 0, r: m.r | 0, w: (m.w | 0) || 3,
        period: (m.period | 0) || CAP_PERIOD, on: (m.on | 0) || CAP_ON, phase: m.phase | 0
      });
    }
    src = level.spores || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      spores.push({
        c: m.c | 0, r: m.r | 0, axis: m.axis === 'y' ? 'y' : 'x',
        range: (m.range | 0) || 48, period: (m.period | 0) || 200, phase: m.phase | 0
      });
    }
    src = level.glooms || [];
    for (i = 0; i < src.length; i++) {
      m = src[i];
      glooms.push({ c0: m.c0 | 0, c1: m.c1 | 0, flies: (m.flies === undefined ? GLOOM_FLIES : m.flies | 0) });
    }
  }

  /* ---------------------------------------------------------------- update */
  function updateW3(g) {
    g = g || {};
    W3.frame = base.frame;                           // 與 W2 機關同一個時鐘
    var t = W3.frame;
    if (g.camX !== undefined) camXCache = g.camX;
    var h = g.hero || null;
    if (!h || h.state === 'dead') {
      if (h) { h.onVine = null; h.onCap = null; }
      if (dark) setDark(false);
      return W3;
    }
    if (!vines.length) h.onVine = null;
    var hh = (h.h === undefined) ? 22 : h.h;
    var hb = { x: h.x, y: h.y, w: h.w || 12, h: hh };

    if (h.vineStrike > 0) h.vineStrike--;       // 先倒數，放手那一幀才拿得到完整的 20 幀窗口
    stepVine(h, hb, hh, t, g);
    if (!h.onVine && h.onVine !== 0) rideCap(h, hb, hh, t, g);
    stepSpore(h, hb, t, g);
    stepGloom(h);
    return W3;
  }

  // ---- ① 藤蔓鞦韆 -------------------------------------------------------
  function stepVine(h, hb, hh, t, g) {
    var input = g.input || NES.Input, i, tip;
    var up = !!(input && input.held && input.held(BTN.UP));
    var aPress = !!(input && input.pressed && input.pressed(BTN.A));
    var down = !!(input && input.held && input.held(BTN.DOWN));
    if (h.onVine !== undefined && h.onVine !== null) {
      i = h.onVine;
      tip = vineTip(i, t);
      if (!tip || aPress || down) {                  // 放手
        h.onVine = null;
        if (tip && aPress) {
          if (ST.Hero && ST.Hero.launch) ST.Hero.launch(h, VINE_VY);
          else FX.aset(h.vyA, VINE_VY);
          var vx = vineVX(i, t);
          if (vx) {
            var cap = FX.SMB.maxRun;
            if (vx > cap) vx = cap; else if (vx < -cap) vx = -cap;
            FX.aset(h.vxA, vx);
          }
          h.vineStrike = VINE_STRIKE;
          W3.strikes++;
          if (g.sfx) g.sfx('jump');
        }
        return false;
      }
      // 吊在尖端：位置 = 純函式 ⇒ 完全可重現
      FX.vsetPx(h.px, tip.x - 6);
      FX.vsetPx(h.py, tip.y + 4);
      FX.aset(h.vyA, 0);
      h.x = FX.floorPx(h.px.sub);
      h.y = FX.floorPx(h.py.sub);
      h.onGround = false;
      h.prevFeet = h.y + hh;
      return true;
    }
    if (!up) return false;                            // 只有按住 ↑ 才會抓（機器人不會誤抓）
    for (i = 0; i < vines.length; i++) {
      tip = vineTip(i, t);
      if (!tip) continue;
      var gx = tip.x - VINE_GRAB, gy = tip.y - VINE_GRAB;
      if (!aabb(hb, { x: gx, y: gy, w: VINE_GRAB * 2, h: VINE_GRAB * 2 + 8 })) continue;
      h.onVine = i;
      h.vineStrike = 0;
      W3.grabs++;
      if (g.sfx) g.sfx('coin');
      return true;
    }
    return false;
  }

  // ---- ② 會縮的樹菇（單向平台；不設 h.onMover ⇒ 上面可以正常跑）--------
  function rideCap(h, hb, hh, t, g) {
    var i, box, feet = h.y + hh, prev;
    for (i = 0; i < caps.length; i++) {
      if (!capOn(i, t)) continue;
      box = capBox(i, t);
      if (h.x + hb.w <= box.x || h.x >= box.x + box.w) continue;
      if (h.vy < 0) continue;
      prev = (h.prevFeet === undefined) ? feet : h.prevFeet;
      if (prev > box.y + 3) continue;                 // 上一幀腳已經在平台下面 ⇒ 穿過
      if (feet < box.y - 1 || feet > box.y + 10) continue;
      FX.vsetPx(h.py, box.y - hh);
      FX.aset(h.vyA, 0);
      h.y = FX.floorPx(h.py.sub);
      h.onGround = true;
      h.prevFeet = h.y + hh;
      h.onCap = i;
      if (g && g.onCap) g.onCap(i);
      return true;
    }
    h.onCap = null;
    return false;
  }

  // ---- ③ 孢子雲（會移動的危險）-----------------------------------------
  function stepSpore(h, hb, t, g) {
    var i, box;
    for (i = 0; i < spores.length; i++) {
      box = sporeBox(i, t);
      if (!aabb(hb, box)) continue;
      if (h.star > 0) return false;
      if (ST.Hero && ST.Hero.hurt) ST.Hero.hurt(h, g, box.x);
      return true;
    }
    return false;
  }

  // ---- ④ 螢火暗區 -------------------------------------------------------
  function stepGloom(h) {
    var z = inGloom(h);
    W3.gloom = z ? 1 : 0;
    if (glooms.length) setDark(!!z);
    return !!z;
  }

  /* ------------------------------------------------------------------ draw */
  function drawW3(oam, g) {
    if (!oam || !oam.add) return 0;
    var A = ensureTiles();
    if (!A) return 0;
    var t = W3.frame, cam = (g && g.camX !== undefined) ? g.camX : camXCache;
    var n = 0, i, j, box, tip, h = g && g.hero;

    // 藤蔓：繩段（每 8 px 一節）+ 尖端葉結
    for (i = 0; i < vines.length; i++) {
      tip = vineTip(i, t);
      if (!tip) continue;
      if (tip.x + 8 < cam - 16 || tip.x - 8 > cam + 272) continue;
      var segs = (tip.len >> 4);
      for (j = 0; j < segs; j++) {
        var u = (j + 1) / (segs + 1);
        var sx = tip.px + ((tip.dx * u) | 0), sy = tip.py + ((tip.dy * u) | 0);
        oam.add({ x: sx - 4 - cam, y: sy - 8, tile: A.vine, pal: 1, prio: 2 });
        n++;
      }
      // 握把 16×16（使用者回饋：可互動物件一律 2×）。R4 的 NES.SH.OAM.add16 幫忙處理左右兩塊
      if (oam.add16) n += oam.add16({ x: tip.x - 8 - cam, y: tip.y - 4, tiles: A.knot, pal: 1, prio: 2 }) | 0;
      else {
        oam.add({ x: tip.x - 8 - cam, y: tip.y - 4, tile: A.knot[0], pal: 1, prio: 2 });
        oam.add({ x: tip.x - cam, y: tip.y - 4, tile: A.knot[1], pal: 1, prio: 2 });
        n += 2;
      }
    }
    // 樹菇平台
    for (i = 0; i < caps.length; i++) {
      if (!capOn(i, t)) continue;
      box = capBox(i, t);
      if (box.x + box.w < cam - 16 || box.x > cam + 272) continue;
      var warn = capWarn(i, t), cw = box.w >> 3;
      if (warn && (t & 2)) {
        for (j = 0; j < cw; j++) { oam.add({ x: box.x + j * 8 - cam, y: box.y, tile: A.capS, pal: 1, prio: 2 }); n++; }
      } else {
        for (j = 0; j < cw; j++) {
          var art = (j === 0) ? A.capL : (j === cw - 1 ? A.capR : A.capM);
          oam.add({ x: box.x + j * 8 - cam, y: box.y, tile: art, pal: 1, prio: 2 });
          n++;
        }
      }
    }
    // 孢子雲
    for (i = 0; i < spores.length; i++) {
      box = sporeBox(i, t);
      if (box.x + box.w < cam - 16 || box.x > cam + 272) continue;
      var pair = A.spore[(t >> 3) & 1];
      if (oam.add16) n += oam.add16({ x: box.x - cam, y: box.y, tiles: pair, pal: 3, prio: 2 }) | 0;
      else {
        oam.add({ x: box.x - cam, y: box.y, tile: pair[0], pal: 3, prio: 2 });
        oam.add({ x: box.x + 8 - cam, y: box.y, tile: pair[1], pal: 3, prio: 2 });
        n += 2;
      }
    }
    // 螢火：繞著主角轉（照明）
    if (dark && h) {
      var z = inGloom(h), k = z ? z.flies : 0;
      for (i = 0; i < k; i++) {
        var a = ((t * 256 / GLOOM_PERIOD) | 0) + i * (256 / k | 0);
        var fx = h.x + 6 + ((sin8(a) * GLOOM_R) >> 8);
        var fy = h.y + 10 + ((sin8(a + 64) * (GLOOM_R >> 1)) >> 8);
        oam.add({ x: fx - 4 - cam, y: fy - 8, tile: A.fly, pal: 2, prio: 2 });
        n++;
      }
    }
    return n;
  }

  /* ------------------------------------------------- W3 的對外（純函式） */
  var W3 = {
    frame: 0, grabs: 0, strikes: 0, gloom: 0,
    CAP_WARN: CAP_WARN, VINE_VY: VINE_VY, VINE_STRIKE: VINE_STRIKE, VINE_GRAB: VINE_GRAB,
    SPORE_W: SPORE_W, SPORE_H: SPORE_H, GLOOM_R: GLOOM_R,
    vineTip: vineTip, vineVX: vineVX,
    capOn: capOn, capWarn: capWarn, capBox: capBox, capPhase: capPhase,
    sporeBox: sporeBox, inGloom: inGloom,
    dark: function () { return dark; },
    count: function () { return { vines: vines.length, caps: caps.length, spores: spores.length, glooms: glooms.length }; },
    state: function () {
      var t = W3.frame, i, out = { frame: t, dark: dark, gloom: W3.gloom, vines: [], caps: [], spores: [], glooms: glooms.length };
      for (i = 0; i < vines.length; i++) out.vines.push(vineTip(i, t));
      for (i = 0; i < caps.length; i++) out.caps.push({ c: caps[i].c, r: caps[i].r, w: caps[i].w, on: capOn(i, t), warn: capWarn(i, t) });
      for (i = 0; i < spores.length; i++) out.spores.push(sporeBox(i, t));
      return out;
    }
  };
  ST.ObjectsW3 = W3;

  /* ============================================================ 包住 ST.Objects
   * 既有 8 支 API 各接一層：先跑 W2 的原邏輯，再跑 W3 的。
   * 這就是 R3「留給後續」裡寫的 `ST.Objects` 擴充點用法（不改 objects_w2.js）。 */
  var bInit = base.init, bReset = base.reset, bSeek = base.seek, bUpdate = base.update;
  var bDraw = base.draw, bState = base.state, bMover = base.moverTops, bHazard = base.hazardHit;

  base.init = function (lv, opts) {
    var r = bInit(lv, opts);
    initW3(lv);
    return r;
  };
  base.reset = function () {
    var r = bReset();
    dark = false;
    W3.frame = 0; W3.grabs = 0; W3.strikes = 0;
    return r;
  };
  base.seek = function (camX) {
    var r = bSeek(camX);
    setDark(false);
    if (ST.GAME && ST.GAME.dev && ST.GAME.dev.hero) {
      var h = ST.GAME.dev.hero();
      if (h) { h.onVine = null; h.onCap = null; h.vineStrike = 0; }
    }
    return r;
  };
  base.update = function (g) {
    var r = bUpdate(g);
    updateW3(g);
    return r;
  };
  base.draw = function (oam, g) {
    var n = bDraw(oam, g) | 0;
    return n + drawW3(oam, g);
  };
  base.state = function () {
    var s = bState();
    if (s) s.w3 = W3.state();
    return s;
  };
  // 樹菇也是「可以站的平台」⇒ 併進 moverTops，通關機器人的推演自動吃到
  base.moverTops = function (t) {
    var out = bMover(t), i, b;
    for (i = 0; i < caps.length; i++) {
      if (!capOn(i, t)) continue;
      b = capBox(i, t);
      out.push({ x0: b.x, x1: b.x + b.w, top: b.y, axis: 'cap' });
    }
    return out;
  };
  // 孢子雲也是危險 ⇒ 併進 hazardHit
  base.hazardHit = function (x, y, w, h, t) {
    if (bHazard(x, y, w, h, t)) return true;
    var i, b, a = { x: x, y: y, w: w, h: h };
    for (i = 0; i < spores.length; i++) {
      b = sporeBox(i, t);
      if (aabb(a, b)) return true;
    }
    return false;
  };
})();
