/*
 * games/cart2/dodge/main.js — 《星塵躲避 STAR DODGE》（合輯卡帶二 槽 3，id = dodge）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-2 cart2-dodge（R6）｜ 依賴：dodge/art.js、dodge/song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/dodge-ball.html、dodge-master.html（只取「躲 + 存活計時 + 道具」玩法；
 *   角色 / 投手 / 彈幕型態 / 場地 / 曲子全部原創）
 *
 * 主角「諾娃 NOVA」八方向走位。兩種模式（標題 ↑↓ 選）：
 *   COURT   躲避球場：場邊牆上的「砲蟹 CRABOT」（BG 磚）走位 → 蓄力（眼睛發亮 30 幀）→ 投球。
 *           B = 衝刺（12 幀無敵、冷卻 50 幀）。每 10 秒升一級：投手 2→6 隻、球速提高、新球種
 *           （LV2 反彈球 / LV3 快速球 / LV4 弧線球 / LV5 分裂球 / LV6 連投）。道具：護盾 / 減速 / 補心 / 雙倍分。
 *   BARRAGE 彈幕大師：上方「星核 CORE」放彈幕，6 種原創型態每 10 秒輪替：
 *           1 WHIRL 渦星（單臂螺旋）2 BLOOM 花環（環狀綻放）3 FAN 瞄準扇（5 向瞄準 + 散彈）
 *           4 RAIN 星雨（上方落下）5 TWIN 雙渦（左右鏡像螺旋）6 CROSS 交叉（左右牆橫向車道 + 瞄準）
 *           60 秒後 LOOP：型態重播 + 加速 + 疊加渦星；第 n 輪出彈間隔 ×0.85ⁿ（≥0.6）、彈速 +8%/輪（≤ +40%）。B = 精細移動（1 px/幀、顯示判定點），A = 星爆（每命 2 發清彈）。
 *           擦彈（子彈擦過 12 px 內沒中）+10 分。
 * 每線 8 精靈（硬限制）：精靈全部走「逐線配額器」——主角最優先，子彈依「上一幀被藏幾次」排序（藏過的優先），
 *   同分再按每幀輪替的起點 ⇒ 任何一顆子彈最多連續被藏 1~2 幀（機器人全程量 `hidMax`）。
 *   另外從設計上壓密度：彈數上限（BARRAGE 48 / COURT 20）、CROSS 車道間距 11 px > 8、生成點避開 HUD 帶。
 * VBlank：HUD 只寫有變的字；砲蟹走位 / 換影格走 BG 佇列（每幀 ≤ 48 byte）；星核發光 = 每 8 幀改 1 組調色盤。
 * 密技（C / ★）：遊玩中 = 補 1 命 + 清彈（BARRAGE 另補星爆）；倒下 / GAME OVER = 原地續關（時間 / 等級 / 分數保留、命補滿）；
 *   標題無效；用過密技那局 goal() = false。goal：BARRAGE 同一局存活 60 秒且沒用密技。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var DG = CT.Dodge = CT.Dodge || {};
  var AU = DG.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var LEVEL_FRAMES = 600;          // 每 10 秒升一級
  var GOAL_FRAMES = 3600;          // BARRAGE 存活 60 秒
  var MAXB = { court: 20, barrage: 48 };
  var LIVES0 = 3, BOMBS0 = 2;
  var PATTERNS = ['WHIRL', 'BLOOM', 'FAN', 'RAIN', 'TWIN', 'CROSS'];
  // 場地（中心座標的活動範圍）
  var COURT = { x0: 32, x1: 224, y0: 48, y1: 208 };         // 內場像素範圍（cols 4..27, rows 6..25）
  var ARENA = { x0: 16, x1: 240, y0: 32, y1: 216 };         // 彈幕場（cols 2..29, rows 4..26）
  var CORE = { x: 128, y: 48 };

  // 調色盤
  var PAL = {
    hud: [0x0F, 0x16, 0x30],
    courtFloor: [0x09, 0x19, 0x30], crab: [0x0C, 0x1C, 0x38], wall: [0x0F, 0x00, 0x10],
    space: [0x01, 0x12, 0x30], core: [[0x04, 0x14, 0x38], [0x05, 0x15, 0x38], [0x06, 0x26, 0x38], [0x05, 0x25, 0x30]],
    hero: [0x02, 0x21, 0x30], heroHit: [0x06, 0x26, 0x30], red: [0x06, 0x16, 0x37], cyan: [0x0C, 0x2C, 0x30], gold: [0x07, 0x28, 0x30],
    title0: [0x02, 0x22, 0x30], title1: [0x0F, 0x16, 0x38], title2: [0x0F, 0x00, 0x10]
  };

  var art = null, nes0 = null, g = null;
  var SIN = (function () { var t = [], i; for (i = 0; i < 256; i++) t.push(Math.round(Math.sin(i * Math.PI / 128) * 256)); return t; })();
  function sn(a) { return SIN[a & 255]; }
  function cs(a) { return SIN[(a + 64) & 255]; }

  function newState() {
    return {
      mode: 'title', sel: 1, game: 'barrage', t: 0, ft: 0, lvl: 1, paused: false,
      hx: 128 * Q, hy: 180 * Q, face: 0, walk: 0, lives: LIVES0, bombs: BOMBS0, inv: 0, hitT: 0,
      dashT: 0, dashCD: 0, dvx: 0, dvy: 0, focus: false, shield: false, slowT: 0, x2T: 0,
      score: 0, graze: 0, dodges: 0, b: [], fx: [], items: [], crabs: [], bgQ: [],
      pat: { a: 0, k: 0, lane: 0 }, msg: '', msgT: 0, deadT: 0, overT: 0,
      cheated: false, cheatReq: false, goalHit: false, cheats: 0, continues: 0, seed: 20261113,
      hud: {}, sprUsed: 0, hidMax: 0, hidden: 0, drawn: 0, maxLine: 0, hits: 0, newBest: false,
      bot: { t: 0 }, runs: 0, bestT: 0
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function secs(fr) { var d = Math.floor(fr / 6); return pad(Math.floor(d / 10), 3) + '.' + (d % 10); }
  // §1-6 / P3-7：BARRAGE 最久存活 → 右對齊 6 字元（"  0.0S" / " 45.5S"），選單與標題共用
  function bestFmt(fr) { var d = Math.floor(fr / 6), t = Math.floor(d / 10) + '.' + (d % 10) + 'S'; while (t.length < 6) t = ' ' + t; return t.substring(t.length - 6); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ============================== BG 工具 ============================== */
  function text0(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]); }
  function hud(row, col, s) {
    var t = art.text(s), i, k;
    for (i = 0; i < t.length; i++) {
      k = row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      nes0.ppu.setTile(0, col + i, row, t[i]);
    }
  }
  function flushQ(cap) {
    var ppu = nes0.ppu, n = 0;
    while (g.bgQ.length && n < cap) {
      var w = g.bgQ.shift();
      if (w[0] === 'a') ppu.setAttr(0, w[1], w[2], w[3]); else ppu.setTile(0, w[1], w[2], w[3]);
      n++;
    }
    return n;
  }

  /* ============================== 標題 ============================== */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL.title0); ppu.setBgPalette(1, PAL.title1); ppu.setBgPalette(2, PAL.title2); ppu.setBgPalette(3, PAL.hud);
      ppu.setSprPalette(0, PAL.hero); ppu.setSprPalette(1, PAL.red); ppu.setSprPalette(2, PAL.cyan); ppu.setSprPalette(3, PAL.gold);
      for (var c = 2; c < 30; c++) { ppu.setTile(0, c, 2, art.t('FR_H')); ppu.setTile(0, c, 27, art.t('FR_H')); }
      text0(12, 4, 'STARDUST');
      var w = 'DODGE';
      for (var i = 0; i < w.length; i++) {
        var t = art.big(w.charAt(i)), x = 11 + i * 2;
        ppu.setTile(0, x, 6, t[0]); ppu.setTile(0, x + 1, 6, t[1]); ppu.setTile(0, x, 7, t[2]); ppu.setTile(0, x + 1, 7, t[3]);
      }
      // §6-6：段落之間空一列
      text0(8, 10, 'COURT    BALL GAME');
      text0(8, 12, 'BARRAGE  STAR STORM');
      text0(4, 21, 'START PAUSE   C/★ = CHEAT');
      text0(4, 23, 'HOLD START+SELECT: MENU');
      g.hud = {};
    });
    titleSel(true);
    AU.play('dodge_title');
  }
  function titleSel(full) {
    var ppu = nes0.ppu, s = g.sel;
    hud(10, 6, s === 0 ? '>' : ' ');
    hud(12, 6, s === 1 ? '>' : ' ');
    var put = function () {
      ppu.fillAttr(0, 0, 5, 16, 1, s === 0 ? 1 : 2);
      ppu.fillAttr(0, 0, 6, 16, 1, s === 1 ? 1 : 2);
    };
    if (full) CT.blank(nes0, put); else put();
    hud(17, 4, padR(s === 0 ? 'B DASH   DODGE THE BALLS' : 'B FOCUS  A STAR BURST', 26));
    hud(19, 4, padR(s === 0 ? 'NEW BALL EVERY 10 SEC' : 'GRAZE = BONUS  NEW STORM/10S', 28));
    var bc = CT.load('dodge', 'court', 0), bb = CT.load('dodge', 'best', 0);
    hud(25, 4, padR('BEST ' + (s === 0 ? pad(bc, 6) : bestFmt(bb)), 12));   // P3-7：與選單 bestText() 同格式
  }

  /* ============================== 開局 / 畫面 ============================== */
  function startRun(which) {
    var runs = g.runs + 1, bot = g.bot, sel = g.sel;
    g = newState();
    g.runs = runs; g.bot = bot; g.sel = sel;
    g.game = which || (sel === 0 ? 'court' : 'barrage');
    g.seed = 20261113 + runs * 7919;
    g.mode = 'play';
    g.hx = 128 * Q; g.hy = (g.game === 'court' ? 128 : 184) * Q;
    if (g.game === 'court') { addCrab(); addCrab(); }
    buildPlayScreen();
    g.msg = g.game === 'court' ? 'LV 1  READY!' : 'LV 1  ' + PATTERNS[0]; g.msgT = 90;
    AU.play(g.game === 'court' ? 'dodge_court' : 'dodge_barrage');
  }
  function courtTile(c, r) {
    if (r === 15 && (c === 15 || c === 16)) return art.t('LN_C');
    if (r === 15) return art.t('LN_H');
    if (c === 4 || c === 27) return art.t(((c + r) & 1) ? 'FL_B' : 'FL_A');
    return art.t(((c + r) & 1) ? 'FL_B' : 'FL_A');
  }
  function wallTile(c, r) { return art.t(((c + r) & 1) ? 'WL_B' : 'WL_A'); }
  function buildPlayScreen() {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(3, PAL.hud);
      ppu.setSprPalette(0, PAL.hero); ppu.setSprPalette(1, PAL.red); ppu.setSprPalette(2, PAL.cyan); ppu.setSprPalette(3, PAL.gold);
      var c, r;
      if (g.game === 'court') {
        ppu.setBgPalette(0, PAL.courtFloor); ppu.setBgPalette(1, PAL.crab); ppu.setBgPalette(2, PAL.wall);
        for (r = 4; r < 28; r++) for (c = 2; c < 30; c++) {
          var wall = r < 6 || r > 25 || c < 4 || c > 27;
          ppu.setTile(0, c, r, wall ? wallTile(c, r) : courtTile(c, r));
        }
        ppu.fillAttr(0, 1, 2, 14, 12, 2);
        ppu.fillAttr(0, 2, 3, 12, 10, 0);
        g.bgQ = [];
        for (var i = 0; i < g.crabs.length; i++) { g.crabs[i].drawnSlot = -1; g.crabs[i].drawnF = -1; crabDraw(g.crabs[i], true); }
      } else {
        ppu.setBgPalette(0, PAL.space); ppu.setBgPalette(1, PAL.core[0]); ppu.setBgPalette(2, PAL.space);
        for (r = 4; r < 27; r++) for (c = 2; c < 30; c++) {
          var h = ((c * 2654435761) ^ (r * 40503)) >>> 0;
          var t = (h % 17) === 3 ? 'SP1' : ((h % 23) === 5 ? 'SP3' : ((h % 61) === 7 ? 'SP2' : null));
          if (t) ppu.setTile(0, c, r, art.t(t));
        }
        for (c = 2; c < 30; c++) { ppu.setTile(0, c, 3, art.t('FR_H')); ppu.setTile(0, c, 27, art.t('FR_H')); }
        for (r = 4; r < 27; r++) { ppu.setTile(0, 1, r, art.t('FR_V')); ppu.setTile(0, 30, r, art.t('FR_V')); }
        ppu.setTile(0, 1, 3, art.t('FR_TL')); ppu.setTile(0, 30, 3, art.t('FR_TR'));
        ppu.setTile(0, 1, 27, art.t('FR_BL')); ppu.setTile(0, 30, 27, art.t('FR_BR'));
        for (r = 0; r < 4; r++) for (c = 0; c < 4; c++) ppu.setTile(0, 14 + c, 4 + r, art.t('CORE_' + (r * 4 + c)));
        ppu.fillAttr(0, 7, 2, 2, 2, 1);
      }
      ppu.fillAttr(0, 0, 0, 16, 2, 3);
      ppu.fillAttr(0, 0, 0, 16, 1, 3);
      g.hud = {};
      drawHud();
    });
  }
  function flushNow() { while (g.bgQ.length) flushQ(9999); }

  /* ============================== HUD ============================== */
  function hearts(n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '♥' : ' '; return s; }
  function drawHud() {
    if (g.game === 'court') {
      hud(1, 2, 'SCORE ' + pad(g.score, 6) + '  LV ' + padR(g.lvl, 2) + ' ' + hearts(g.lives));
    } else {
      hud(1, 2, 'TIME ' + secs(g.t) + 'S  LV ' + padR(g.lvl, 2) + ' ' + padR(PATTERNS[(g.lvl - 1) % 6], 6) + (g.lvl > 6 ? '+' : ' '));
    }
    var line;
    if (g.paused) line = 'PAUSE HOLD START+SELECT: MENU';
    else if (g.msgT > 0 && (g.mode === 'play')) line = g.msg;
    else if (g.mode === 'dead') line = 'OUCH!  C/★ = CONTINUE';
    else if (g.game === 'court') {
      line = 'TIME ' + secs(g.t) + 'S  ' + (g.dashCD > 0 ? 'DASH ..' : 'DASH OK') +
        (g.shield ? ' SH' : '') + (g.slowT > 0 ? ' SLOW' : '') + (g.x2T > 0 ? ' X2' : '');
    } else {
      var bm = ''; for (var i = 0; i < 3; i++) bm += i < g.bombs ? '★' : ' ';
      line = 'SCORE ' + pad(g.score, 6) + ' GRZ ' + pad(g.graze, 4) + ' ' + hearts(g.lives).substring(0, 3) + bm;
    }
    hud(2, 2, padR(line, 29));
  }

  /* ============================== 砲蟹（BG 投手） ============================== */
  function slotsOf(side) { return side < 2 ? 12 : 10; }
  function crabPos(side, slot) {
    if (side === 0) return { c: 4 + slot * 2, r: 4 };
    if (side === 1) return { c: 4 + slot * 2, r: 26 };
    if (side === 2) return { c: 2, r: 6 + slot * 2 };
    return { c: 28, r: 6 + slot * 2 };
  }
  function crabTaken(side, slot, self) {
    for (var i = 0; i < g.crabs.length; i++) {
      var k = g.crabs[i];
      if (k === self || k.side !== side) continue;
      if (Math.abs(k.slot - slot) < 2 || Math.abs(k.to - slot) < 2) return true;
    }
    return false;
  }
  function addCrab() {
    var side = g.crabs.length % 4, n = slotsOf(side), slot = rnd() % n, tries = 0;
    while (crabTaken(side, slot, null) && tries++ < 20) slot = rnd() % n;
    var k = { side: side, slot: slot, to: slot, st: 'rest', t: 30 + (rnd() % 40), f: 0, drawnF: -1, drawnSlot: -1, shots: 0 };
    g.crabs.push(k);
    crabDraw(k, false);
    return k;
  }
  function crabDraw(k, now) {
    var q = g.bgQ, p, i;
    if (k.drawnSlot >= 0 && k.drawnSlot !== k.slot) {
      p = crabPos(k.side, k.drawnSlot);
      for (i = 0; i < 4; i++) q.push(['t', p.c + (i & 1), p.r + (i >> 1), wallTile(p.c + (i & 1), p.r + (i >> 1))]);
      q.push(['a', p.c >> 1, p.r >> 1, 2]);
      k.drawnF = -1;
    }
    if (k.drawnSlot !== k.slot || k.drawnF !== k.f) {
      p = crabPos(k.side, k.slot);
      for (i = 0; i < 4; i++) q.push(['t', p.c + (i & 1), p.r + (i >> 1), art.t('CB' + k.f + '_' + i)]);
      if (k.drawnSlot !== k.slot) q.push(['a', p.c >> 1, p.r >> 1, 1]);
      k.drawnSlot = k.slot; k.drawnF = k.f;
    }
    if (now) flushNow();
  }
  function crabOrigin(k) {
    var p = crabPos(k.side, k.slot), x = p.c * 8 + 8, y = p.r * 8 + 8;
    if (k.side === 0) y = COURT.y0 + 4; else if (k.side === 1) y = COURT.y1 - 4;
    else if (k.side === 2) x = COURT.x0 + 4; else x = COURT.x1 - 4;
    return { x: x, y: y };
  }
  function courtParams() {
    var L = g.lvl;
    return {
      crabs: Math.min(8, L + 1), rest: Math.max(16, 80 - L * 8), speed: Math.min(800, 360 + L * 36),
      bounce: L >= 2, fast: L >= 3, curve: L >= 4, split: L >= 5, dbl: L >= 6
    };
  }
  function updateCrabs() {
    var P = courtParams(), i;
    while (g.crabs.length < P.crabs) addCrab();
    for (i = 0; i < g.crabs.length; i++) {
      var k = g.crabs[i];
      k.t--;
      if (k.st === 'rest' && k.t <= 0) {
        var n = slotsOf(k.side), to = k.slot, tries = 0;
        do { to = clamp(k.slot + ((rnd() % 7) - 3), 0, n - 1); } while ((to === k.slot || crabTaken(k.side, to, k)) && tries++ < 12);
        if (crabTaken(k.side, to, k)) to = k.slot;
        k.to = to; k.st = 'move'; k.t = 10;
      } else if (k.st === 'move' && k.t <= 0) {
        if (k.slot !== k.to) { k.slot += k.to > k.slot ? 1 : -1; crabDraw(k); k.t = 10; }
        else { k.st = 'aim'; k.t = 30; k.f = 1; crabDraw(k); }
      } else if (k.st === 'aim' && k.t <= 0) {
        throwBall(k, P);
        k.st = 'throw'; k.t = 12; k.f = 2; crabDraw(k);
        k.shots = (P.dbl && k.shots === 0 && (rnd() & 1)) ? 1 : 0;
      } else if (k.st === 'throw' && k.t <= 0) {
        if (k.shots === 1) { k.shots = 2; k.st = 'aim'; k.t = 14; k.f = 1; crabDraw(k); }
        else { k.shots = 0; k.st = 'rest'; k.t = P.rest + (rnd() % 30); k.f = 0; crabDraw(k); }
      }
    }
  }
  function aimAngle(x, y, tx, ty) {
    var dx = tx - x, dy = ty - y, best = 0, bv = -1e9;
    for (var a = 0; a < 256; a++) { var v = cs(a) * dx + sn(a) * dy; if (v > bv) { bv = v; best = a; } }
    return best;
  }
  function throwBall(k, P) {
    var o = crabOrigin(k), hx = g.hx >> 8, hy = g.hy >> 8;
    var a = aimAngle(o.x, o.y, hx, hy), sp = P.speed, kind = 'n', r = rnd() % 10;
    if (P.split && r < 2) kind = 's';
    else if (P.curve && r < 4) kind = 'c';
    else if (P.fast && r < 6) kind = 'f';
    else if (P.bounce && r < 8) kind = 'b';
    if (kind === 'f') sp = (sp * 3) >> 1;
    if (kind === 'c') a = (a + ((rnd() & 1) ? 14 : -14)) & 255;
    var b = spawn(o.x, o.y, a, sp, kind === 'f' ? 'BALL_F' : 'BALL', kind === 'b' ? 3 : (kind === 'c' || kind === 'f' ? 2 : 1));
    if (!b) return;
    b.kind = kind; b.bounce = kind === 'b' ? 2 : 0; b.curve = kind === 'c' ? (a & 1 ? 2 : -2) : 0;
    if (kind === 'c') b.curve = ((aimAngle(o.x, o.y, hx, hy) - a) & 255) < 128 ? 2 : -2;
    b.splitT = kind === 's' ? 40 : 0; b.r = 3;
    AU.sfx('dodge_throw');
  }

  /* ============================== 子彈 ============================== */
  function spawn(x, y, a, sp, kind, pal) {
    if (g.b.length >= MAXB[g.game]) return null;
    var b = { x: x * Q, y: y * Q, vx: (cs(a) * sp) >> 8, vy: (sn(a) * sp) >> 8, k: kind, pal: pal, hid: 0, gz: false, life: 0,
              kind: 'n', bounce: 0, curve: 0, splitT: 0, r: 2, near: false };
    g.b.push(b);
    return b;
  }
  function spawnV(x, y, vx, vy, kind, pal) {
    if (g.b.length >= MAXB[g.game]) return null;
    var b = { x: x * Q, y: y * Q, vx: vx, vy: vy, k: kind, pal: pal, hid: 0, gz: false, life: 0, kind: 'n', bounce: 0, curve: 0, splitT: 0, r: 2, near: false };
    g.b.push(b);
    return b;
  }
  // 一顆子彈前進一幀（遊戲與機器人預測共用）；回傳 false = 該刪
  function stepBullet(b, slow) {
    var vx = b.vx, vy = b.vy;
    if (b.curve) { var nvx = vx - ((vy * b.curve) >> 8) * 2, nvy = vy + ((vx * b.curve) >> 8) * 2; b.vx = vx = nvx; b.vy = vy = nvy; }
    if (slow) { vx >>= 1; vy >>= 1; }
    b.x += vx; b.y += vy; b.life++;
    var x = b.x >> 8, y = b.y >> 8;
    if (g.game === 'court') {
      var F = COURT;
      if (x < F.x0 + 3 || x > F.x1 - 3 || y < F.y0 + 3 || y > F.y1 - 3) {
        if (b.bounce > 0) {
          b.bounce--;
          if (x < F.x0 + 3 || x > F.x1 - 3) { b.vx = -b.vx; b.x = clamp(x, F.x0 + 3, F.x1 - 3) * Q; }
          if (y < F.y0 + 3 || y > F.y1 - 3) { b.vy = -b.vy; b.y = clamp(y, F.y0 + 3, F.y1 - 3) * Q; }
          return true;
        }
        return false;
      }
      return true;
    }
    return !(x < 10 || x > 246 || y < 30 || y > 222);
  }
  function updateBullets() {
    var out = [], i, b, slow = g.slowT > 0, spl = [];
    for (i = 0; i < g.b.length; i++) {
      b = g.b[i];
      if (!stepBullet(b, slow)) continue;
      if (b.splitT > 0 && --b.splitT === 0) { spl.push(b); continue; }
      out.push(b);
    }
    g.b = out;
    for (i = 0; i < spl.length; i++) {
      b = spl[i];
      var a = aimAngle(0, 0, b.vx, b.vy), sp = 300;
      for (var d = -1; d <= 1; d++) { var n = spawn(b.x >> 8, b.y >> 8, (a + d * 20) & 255, sp, 'B_ORB', 1); if (n) n.r = 2; }
    }
  }

  /* ============================== 彈幕型態 ============================== */
  // P3-2（fix-r6）：LOOP 第 n 輪（n = (LV-1)/6，LV7~12 = 第 1 輪…）出彈間隔 × 0.85ⁿ（下限 0.6）、彈速每輪 +8%（上限 +40%）。
  //   前 60 秒（n = 0）兩個倍率都是 1，數值與 R6 原版逐幀一致。彈數上限 MAXB.barrage 48 與逐線配額器不變。
  var LOOP_IV = [256, 218, 185, 157, 154];          // Q8：0.85ⁿ，n ≥ 4 固定 0.6
  var LOOP_SP_STEP = 20, LOOP_SP_MAXN = 5;           // Q8：每輪 +20/256 ≈ +8%，最多 5 輪（+39%）
  function loopRound(L) { return Math.max(0, ((L - 1) / 6) | 0); }
  function loopIv(L) { var n = loopRound(L); return LOOP_IV[Math.min(n, LOOP_IV.length - 1)]; }
  function loopSp(L) { return 256 + Math.min(loopRound(L), LOOP_SP_MAXN) * LOOP_SP_STEP; }
  function patternTick() {
    var L = g.lvl, p = (L - 1) % 6, loop = L > 6, ph = g.t % LEVEL_FRAMES, P = g.pat;
    var sm = (Math.min(448, 256 + (L - 1) * 20) * loopSp(L)) >> 8, IM = loopIv(L);
    if (ph < 40) return;                           // 換型態前 40 幀不出新彈（喘息）
    var hx = g.hx >> 8, hy = g.hy >> 8, i, a, n;
    var ex = CORE.x, ey = CORE.y;
    function sp(v) { return (v * sm) >> 8; }
    // 第 n 輪的出彈節拍：平均間隔 = base × IM/256 幀（可為小數，整數相位累加）；IM = 256 時 ⇔ g.t % base === off（與原版逐幀一致）
    function ev(base, off) { var P = base * IM, t1 = (g.t - (off || 0)) * 256; return Math.floor(t1 / P) !== Math.floor((t1 - 256) / P); }
    function fromCore(a2, v, kind, pal) { return spawn(ex + (cs(a2) * 14 >> 8), ey + (sn(a2) * 14 >> 8), a2, sp(v), kind, pal); }
    if (p === 0 || loop && p !== 4 && ev(9)) {
      if (p === 0 ? ev(4) : true) {
        P.a = (P.a + 9) & 255;
        fromCore(P.a, 320, 'B_ORB', 1);
        if (L >= 7 && p === 0) fromCore((P.a + 128) & 255, 320, 'B_ORB', 2);
      }
    }
    if (p === 1 && ev(loop ? 36 : 42)) {
      n = loop ? 16 : 14; P.k++;
      for (i = 0; i < n; i++) fromCore(((i * 256 / n) | 0) + ((P.k & 1) ? (128 / n) | 0 : 0), 256, 'B_STAR', 2);
    }
    if (p === 2) {
      if (ev(loop ? 28 : 34)) {
        a = aimAngle(ex, ey, hx, hy);
        for (i = -2; i <= 2; i++) fromCore((a + i * 8) & 255, 400, 'B_DIA', 1);
      }
      if (ev(30, 15)) fromCore(32 + (rnd() % 64), 220, 'B_ORB', 2);
    }
    if (p === 3) {
      if (ev(loop ? 4 : 6)) {
        var x = 24 + (rnd() % 208), vy = sp(230 + (rnd() % 150)), vx = ((rnd() % 3) - 1) * 48;
        spawnV(x, 36, vx, vy, 'B_RICE', 2);
      }
      if (ev(90, 45)) { a = aimAngle(ex, ey, hx, hy); for (i = -1; i <= 1; i++) fromCore((a + i * 10) & 255, 360, 'B_DIA', 1); }
    }
    if (p === 4 && ev(loop ? 4 : 5)) {
      P.a = (P.a + 7) & 255;
      fromCore(P.a, 300, 'B_ORB', 1);
      fromCore((128 - P.a) & 255, 300, 'B_ORB', 2);
    }
    if (p === 5) {
      if (ev(loop ? 16 : 18)) {
        P.lane = (P.lane + 5) % 12;
        var y1 = 80 + 11 * P.lane, y2 = 80 + 11 * ((P.lane + 6) % 12);
        spawnV(12, y1, sp(320), 0, 'B_DIA', 2);
        spawnV(244, y2, -sp(320), 0, 'B_DIA', 2);
      }
      if (ev(45, 20)) { a = aimAngle(ex, ey, hx, hy); fromCore(a, 360, 'B_ORB', 1); }
    }
  }

  /* ============================== 主角 ============================== */
  function bounds() { return g.game === 'court' ? { x0: COURT.x0 + 7, x1: COURT.x1 - 7, y0: COURT.y0 + 7, y1: COURT.y1 - 7 } : { x0: ARENA.x0 + 6, x1: ARENA.x1 - 6, y0: ARENA.y0 + 8, y1: ARENA.y1 - 7 }; }
  function hitBox() { return g.game === 'court' ? { w: 5, h: 6 } : { w: 1, h: 1 }; }
  function collides(hx, hy, b) {
    var H = hitBox(), r = g.game === 'court' ? 3 : 2;
    var dx = (b.x >> 8) - hx, dy = (b.y >> 8) - hy;
    return dx <= H.w + r && dx >= -(H.w + r) && dy <= H.h + r && dy >= -(H.h + r);
  }
  function moveHero(I) {
    var dx = 0, dy = 0;
    if (I.held(BTN.LEFT)) dx = -1; else if (I.held(BTN.RIGHT)) dx = 1;
    if (I.held(BTN.UP)) dy = -1; else if (I.held(BTN.DOWN)) dy = 1;
    var sp;
    if (g.game === 'court') {
      if (I.pressed(BTN.B) && g.dashCD === 0 && g.dashT === 0) {
        var ddx = dx, ddy = dy;
        if (!ddx && !ddy) ddy = -1;
        g.dashT = 12; g.dashCD = 62; g.dvx = ddx; g.dvy = ddy; AU.sfx('dodge_dash');
      }
      if (g.dashT > 0) { dx = g.dvx; dy = g.dvy; sp = 896; }
      else sp = 512;
    } else {
      g.focus = I.held(BTN.B);
      sp = g.focus ? 256 : 512;
    }
    if (dx && dy) sp = (sp * 181) >> 8;
    var B = bounds();
    g.hx = clamp(g.hx + dx * sp, B.x0 * Q, B.x1 * Q);
    g.hy = clamp(g.hy + dy * sp, B.y0 * Q, B.y1 * Q);
    if (dx || dy) { g.walk++; if (dx) g.face = dx; }
  }
  function hurt() {
    if (g.shield) { g.shield = false; g.inv = 60; AU.sfx('dodge_item'); g.msg = 'SHIELD BROKE!'; g.msgT = 60; return; }
    g.lives--; g.hits++; g.inv = 120; g.hitT = 20;
    AU.sfx('dodge_hit');
    addFx(g.hx >> 8, g.hy >> 8, 'pop');
    clearNear(44);
    if (g.lives <= 0) { g.lives = 0; g.mode = 'dead'; g.deadT = 0; AU.stop(); }
  }
  function clearNear(r) {
    var hx = g.hx >> 8, hy = g.hy >> 8;
    g.b = g.b.filter(function (b) { var dx = (b.x >> 8) - hx, dy = (b.y >> 8) - hy; return dx * dx + dy * dy > r * r; });
  }
  function addFx(x, y, k) { if (g.fx.length < 6) g.fx.push({ x: x, y: y, k: k, t: k === 'pop' ? 20 : 10 }); }

  function checkHits() {
    var hx = g.hx >> 8, hy = g.hy >> 8, i, b;
    var inv = g.inv > 0 || g.dashT > 0;
    for (i = 0; i < g.b.length; i++) {
      b = g.b[i];
      var dx = (b.x >> 8) - hx, dy = (b.y >> 8) - hy;
      if (!inv && collides(hx, hy, b)) { hurt(); return; }
      if (g.game === 'barrage') {
        if (!b.gz && dx < 12 && dx > -12 && dy < 12 && dy > -12) {
          b.gz = true; g.graze++; g.score += 10; AU.sfx('dodge_graze');
          addFx(hx + (dx >> 1), hy + (dy >> 1), 'spark');
        }
      } else if (!b.near && dx < 16 && dx > -16 && dy < 16 && dy > -16) {
        b.near = true;
        if (!inv) { g.dodges++; g.score += g.x2T > 0 ? 10 : 5; }
      }
    }
  }
  function updateItems() {
    if (g.game !== 'court') return;
    if (g.t % 720 === 400 && g.items.length < 1) {
      var kinds = ['IT_SHIELD', 'IT_SLOW', 'IT_HEART', 'IT_X2'];
      g.items.push({ k: kinds[rnd() % 4], x: COURT.x0 + 24 + (rnd() % (COURT.x1 - COURT.x0 - 48)), y: COURT.y0 + 24 + (rnd() % (COURT.y1 - COURT.y0 - 48)), t: 360 });
    }
    var hx = g.hx >> 8, hy = g.hy >> 8;
    g.items = g.items.filter(function (it) {
      if (--it.t <= 0) return false;
      if (Math.abs(it.x - hx) < 10 && Math.abs(it.y - hy) < 10) {
        AU.sfx('dodge_item'); g.score += 100;
        if (it.k === 'IT_SHIELD') { g.shield = true; g.msg = 'SHIELD!'; }
        else if (it.k === 'IT_SLOW') { g.slowT = 300; g.msg = 'SLOW BALLS!'; }
        else if (it.k === 'IT_HEART') { g.lives = Math.min(5, g.lives + 1); g.msg = 'HEART +1'; }
        else { g.x2T = 600; g.msg = 'DOUBLE SCORE!'; }
        g.msgT = 60;
        return false;
      }
      return true;
    });
  }

  /* ============================== 遊玩更新 ============================== */
  function setPause(p) {
    g.paused = p;
    if (p) AU.pause(); else AU.resume();
    drawHud();
  }
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) setPause(!g.paused);
    if (g.paused) return;
    g.ft++;
    if (g.mode === 'dead') {
      if (++g.deadT > 70) enterOver();
      fxTick();
      return;
    }
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (g.inv > 0) g.inv--;
    if (g.hitT > 0) g.hitT--;
    if (g.dashT > 0) g.dashT--;
    if (g.dashCD > 0) g.dashCD--;
    if (g.slowT > 0) g.slowT--;
    if (g.x2T > 0) g.x2T--;
    // 升級
    var L = 1 + ((g.t / LEVEL_FRAMES) | 0);
    if (L !== g.lvl) {
      g.lvl = L; AU.sfx('dodge_level');
      g.score += 100 * L;
      g.msg = 'LV ' + L + '  ' + (g.game === 'court' ? courtNews(L) : PATTERNS[(L - 1) % 6] + (L > 6 ? ' LOOP' : '')); g.msgT = 100;
    }
    if (g.game === 'barrage' && g.t % 6 === 0) g.score += 1;
    if (g.game === 'court' && g.t % 6 === 0) g.score += g.x2T > 0 ? 2 : 1;
    if (!g.cheated && g.game === 'barrage' && g.t >= GOAL_FRAMES) g.goalHit = true;
    moveHero(I);
    if (g.game === 'barrage' && I.pressed(BTN.A) && g.bombs > 0) {
      g.bombs--; g.b = []; g.inv = Math.max(g.inv, 60); AU.sfx('dodge_bomb'); g.msg = 'STAR BURST!'; g.msgT = 50;
      addFx(g.hx >> 8, g.hy >> 8, 'pop');
    }
    if (g.game === 'court') { updateCrabs(); updateItems(); } else patternTick();
    updateBullets();
    checkHits();
    fxTick();
  }
  function courtNews(L) { return ['', '', 'BOUNCE BALL', 'FAST BALL', 'CURVE BALL', 'SPLIT BALL', 'DOUBLE THROW'][L] || 'FASTER!'; }
  function fxTick() { g.fx = g.fx.filter(function (f) { return --f.t > 0; }); }

  function saveBest() {
    if (!g || g.mode === 'title') return false;
    var nb = false;
    if (g.game === 'barrage') {
      var b = CT.load('dodge', 'best', 0);
      if (g.t > b) { CT.save('dodge', 'best', g.t); nb = true; }
      var bs = CT.load('dodge', 'barScore', 0);
      if (g.score > bs) CT.save('dodge', 'barScore', g.score);
    } else {
      var c = CT.load('dodge', 'court', 0);
      if (g.score > c) { CT.save('dodge', 'court', g.score); nb = true; }
    }
    return nb;
  }
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    g.newBest = saveBest();
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0);
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL.title0); ppu.setBgPalette(1, PAL.title1); ppu.setBgPalette(2, PAL.title2);
      for (var c = 4; c < 28; c++) { ppu.setTile(0, c, 4, art.t('FR_H')); ppu.setTile(0, c, 25, art.t('FR_H')); }
      text0(11, 6, 'GAME OVER');
      text0(8, 9, (g.game === 'court' ? 'COURT' : 'BARRAGE') + (g.newBest ? '   NEW BEST!' : ''));
      text0(8, 11, 'TIME   ' + secs(g.t) + 'S');
      text0(8, 13, 'SCORE  ' + pad(g.score, 6));
      text0(8, 15, g.game === 'court' ? 'DODGES ' + pad(g.dodges, 4) : 'GRAZE  ' + pad(g.graze, 4));
      text0(8, 17, 'LEVEL  ' + g.lvl);
      text0(6, 21, 'START  TITLE');
      text0(6, 23, 'C/★    CONTINUE HERE');
      ppu.fillAttr(0, 0, 3, 16, 1, 1);
      ppu.fillAttr(0, 0, 11, 16, 1, 2);
      g.hud = {};
    });
    AU.play('dodge_over');
  }
  // §6-1 密技原地續關：時間 / 等級 / 分數 / 擦彈保留，命與星爆補滿，清彈 + 無敵
  function continueRun() {
    g.mode = 'play'; g.deadT = 0; g.overT = 0; g.paused = false;
    g.lives = LIVES0; g.bombs = BOMBS0; g.inv = 150; g.b = []; g.fx = [];
    g.cheated = true; g.continues++;
    var B = bounds();
    g.hx = clamp(g.hx, B.x0 * Q, B.x1 * Q); g.hy = clamp(g.hy, B.y0 * Q, B.y1 * Q);
    buildPlayScreen();
    g.msg = 'CONTINUE!  LV ' + g.lvl; g.msgT = 90;
    AU.sfx('dodge_item');
    AU.play(g.game === 'court' ? 'dodge_court' : 'dodge_barrage');
  }

  /* ============================== 精靈：逐線配額器 ============================== */
  var lines = new Uint8Array(240);
  function room(y, need) {
    for (var l = Math.max(0, y); l < y + 8 && l < 240; l++) if (lines[l] + need > 8) return false;
    return true;
  }
  function take(y, n) { for (var l = Math.max(0, y); l < y + 8 && l < 240; l++) lines[l] += n; }
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, i;
    lines.fill(0);
    function put(x, y, tile, pal, fh) {
      if (n >= 62 || y > 231 || y < -7) return false;
      ppu.sprite(n++, { x: clamp(x, 0, 255), y: y, tile: tile, pal: pal, flipH: !!fh });
      return true;
    }
    var mode = g.mode;
    if (mode === 'title') {
      var ty = 108 + ((g.t >> 4) & 1);
      var f0 = (g.t >> 4) & 1;
      if (room(ty, 2) && room(ty + 8, 2)) {
        for (var q = 0; q < 4; q++) put(120 + (q & 1) * 8, ty + (q >> 1) * 8, art.s('NOVA' + f0 + '_' + q), 0);
        take(ty, 2); take(ty + 8, 2);
      }
      // 示範子彈（環繞）
      for (i = 0; i < 6; i++) {
        var a = (g.t * 2 + i * 43) & 255, bx = 124 + (cs(a) * 40 >> 8), by = 112 + (sn(a) * 9 >> 8);
        if (room(by, 1)) { take(by, 1); put(bx, by, art.s(i & 1 ? 'B_STAR' : 'B_ORB'), 1 + (i & 1)); }
      }
    } else if (mode === 'play' || mode === 'dead') {
      var hx = g.hx >> 8, hy = g.hy >> 8, vis = !(g.inv > 0 && (g.ft & 4)) || mode === 'dead';
      // ① 主角（16×16 = 每線 2）
      if (vis) {
        var fr = g.hitT > 0 || mode === 'dead' ? 'NOVAH_' : (g.dashT > 0 ? 'NOVA2_' : 'NOVA' + ((g.walk >> 3) & 1) + '_');
        var fh = g.face < 0;
        take(hy - 8, 2); take(hy, 2);
        for (q = 0; q < 4; q++) {
          var qx = (q & 1) ^ (fh ? 1 : 0);
          put(hx - 8 + qx * 8, hy - 8 + (q >> 1) * 8, art.s(fr + q), 0, fh);
        }
        if (g.game === 'barrage' && g.focus && mode === 'play' && room(hy - 4, 1)) { take(hy - 4, 1); put(hx - 4, hy - 4, art.s('DOT'), 3); }
        if (g.shield && room(hy - 4, 1)) { take(hy - 4, 1); put(hx - 4, hy - 16, art.s('RING'), 3); }
      }
      // ② 道具
      for (i = 0; i < g.items.length; i++) {
        var it = g.items[i];
        if (it.t < 90 && (g.ft & 4)) continue;
        if (room(it.y - 4, 1)) { take(it.y - 4, 1); put(it.x - 4, it.y - 4, art.s(it.k), 3); }
      }
      // ③ 子彈：藏過的優先，同分按每幀輪替起點
      var nb = g.b.length, order = [], start = nb ? g.ft % nb : 0;
      for (i = 0; i < nb; i++) order.push(i);
      order.sort(function (p1, p2) {
        var d = g.b[p2].hid - g.b[p1].hid;
        if (d) return d;
        return ((p1 - start + nb) % nb) - ((p2 - start + nb) % nb);
      });
      for (i = 0; i < nb; i++) {
        var b = g.b[order[i]], sx = (b.x >> 8) - 4, sy = (b.y >> 8) - 4;
        if (room(sy, 1) && n < 62) {
          take(sy, 1); put(sx, sy, art.s(b.k), b.pal);
          b.hid = 0; g.drawn++;
        } else {
          b.hid++; g.hidden++;
          if (b.hid > g.hidMax) g.hidMax = b.hid;
        }
      }
      // ④ 特效（最低優先）
      for (i = 0; i < g.fx.length; i++) {
        var f = g.fx[i], fy = f.y - 4;
        if (!room(fy, 1)) continue;
        take(fy, 1);
        put(f.x - 4, fy, art.s(f.k === 'pop' ? (f.t > 10 ? 'POP0' : 'POP1') : 'SPARK'), f.k === 'pop' ? 1 : 3);
      }
    }
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
    var m = 0;
    for (i = 0; i < 240; i++) if (lines[i] > m) m = lines[i];
    if (m > g.maxLine) g.maxLine = m;
  }

  /* ============================== 機器人 ============================== */
  var DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function botMask() {
    var B = g.bot;
    B.t++;
    if (g.mode === 'title') {
      if (g.sel !== 1) return (B.t % 20 === 10) ? BTN.DOWN : 0;
      return (B.t % 40 === 20) ? BTN.START : 0;
    }
    if (g.mode === 'over') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode !== 'play') return 0;
    return plan();
  }
  // 預測 H 幀子彈位置（與遊戲同一個 stepBullet），對 9 方向 × 2 速度（COURT：× 一般 / 衝刺）各自模擬
  function plan() {
    var H = g.game === 'court' ? 22 : 18, nb = g.b.length, t, i;
    var fut = [], cur = g.b.map(function (b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, curve: b.curve, bounce: b.bounce, life: b.life, r: b.r }; });
    var saved = g.b;
    for (t = 0; t < H; t++) {
      var row = new Int16Array(nb * 2);
      for (i = 0; i < nb; i++) {
        var c = cur[i];
        if (c.dead) { row[i * 2] = -999; continue; }
        if (!stepBullet(c, g.slowT > 0)) { c.dead = true; row[i * 2] = -999; continue; }
        row[i * 2] = c.x >> 8; row[i * 2 + 1] = c.y >> 8;
      }
      fut.push(row);
    }
    g.b = saved;
    var Bd = bounds(), best = -1e12, bestM = 0;
    var homeX = 128, homeY = g.game === 'court' ? 128 : 176;
    if (g.items.length) { homeX = g.items[0].x; homeY = g.items[0].y; }
    var H2 = hitBox(), rr = g.game === 'court' ? 3 : 2, mw = H2.w + rr + 2, mh = H2.h + rr + 2;
    var modes = g.game === 'court' ? [0, 1] : [0, 1];
    for (var mi = 0; mi < modes.length; mi++) {
      var md = modes[mi];
      if (g.game === 'court' && md === 1 && (g.dashCD > 0 || g.dashT > 0)) continue;
      for (var d = 0; d < 9; d++) {
        var dx = DIRS[d][0], dy = DIRS[d][1];
        if (g.game === 'court' && md === 1 && !dx && !dy) continue;
        var x = g.hx, y = g.hy, score = 0, hitAt = -1, dashT = g.dashT, inv = g.inv;
        for (t = 0; t < H; t++) {
          var sp;
          if (g.game === 'court') {
            if (md === 1 && t === 0) dashT = 12;
            if (dashT > 0) { sp = 896; dashT--; } else sp = 512;
          } else sp = md === 1 ? 256 : 512;
          if (dx && dy) sp = (sp * 181) >> 8;
          x = clamp(x + dx * sp, Bd.x0 * Q, Bd.x1 * Q); y = clamp(y + dy * sp, Bd.y0 * Q, Bd.y1 * Q);
          var px = x >> 8, py = y >> 8, row2 = fut[t], danger = 0;
          var invT = (inv - t - 1 > 0) || (g.game === 'court' && dashT > 0);
          for (i = 0; i < nb; i++) {
            var bx = row2[i * 2];
            if (bx === -999) continue;
            var ddx = bx - px, ddy = row2[i * 2 + 1] - py;
            if (ddx < 0) ddx = -ddx; if (ddy < 0) ddy = -ddy;
            if (ddx <= mw && ddy <= mh && !invT) { hitAt = t; break; }
            if (ddx < 24 && ddy < 24) danger += (24 - ddx) * (24 - ddy);
          }
          if (hitAt >= 0) break;
          score -= danger * (H - t) / H;
        }
        if (hitAt >= 0) score = -1e9 + hitAt * 1e6;
        var px2 = x >> 8, py2 = y >> 8;
        score -= (Math.abs(px2 - homeX) + Math.abs(py2 - homeY)) * 6;
        var edge = Math.min(px2 - Bd.x0, Bd.x1 - px2, py2 - Bd.y0, Bd.y1 - py2);
        if (edge < 16) score -= (16 - edge) * 60;
        if (md === 1) score -= g.game === 'court' ? 3000 : 400;
        if (d === g.bot.last) score += 50;
        if (score > best) { best = score; bestM = d + md * 9; }
      }
    }
    g.bot.last = bestM % 9;
    var dd = DIRS[bestM % 9], m = 0;
    if (dd[0] > 0) m |= BTN.RIGHT; else if (dd[0] < 0) m |= BTN.LEFT;
    if (dd[1] > 0) m |= BTN.DOWN; else if (dd[1] < 0) m |= BTN.UP;
    if (bestM >= 9) {
      if (g.game === 'court') { if (!(NES.Input.held(BTN.B))) m |= BTN.B; }
      else m |= BTN.B;
    }
    return m;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'dodge', order: 3, title: '星塵躲避', legacy: ['dodge-ball.html', 'dodge-master.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = DG.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'dodge_bg');
      NES.CHR.setPattern(1, 'dodge_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: art.s('BACK'), pal: 3 };     // §6-4：回選單提示 = 實心金星（8×8）
      AU.init(nes);
      g = newState();
      var qm = CT.query ? CT.query('dmode') : null;
      if (qm === 'court' || qm === 'barrage') {
        g.sel = qm === 'court' ? 0 : 1;
        startRun(qm);
        var qt = parseInt(CT.query('t') || '', 10);
        if (qt > 0) { g.t = qt; g.lvl = 1 + ((qt / LEVEL_FRAMES) | 0); }
      } else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'dead' || g.mode === 'over') continueRun();
        else if (g.mode === 'play') {
          g.cheated = true;
          g.lives = Math.min(5, g.lives + 1); g.b = []; g.inv = Math.max(g.inv, 60);
          if (g.game === 'barrage') g.bombs = Math.min(3, g.bombs + 1); else g.shield = true;
          g.msg = 'STAR POWER!'; g.msgT = 60; AU.sfx('dodge_item');
        }
      }
      if (g.mode === 'title') {
        g.t++;
        if ((I.pressed(BTN.UP) || I.pressed(BTN.DOWN)) && !I.held(BTN.START)) { g.sel ^= 1; titleSel(false); AU.sfx('dodge_move'); }
        else if ((I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) { AU.sfx('dodge_ok'); startRun(); }
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function (nes) {
      var ppu = nes.ppu;
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) hud(25, 18, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.mode === 'play' || g.mode === 'dead') {
        if (!g.paused) drawHud();
        if (g.game === 'court') flushQ(48);
        else if ((g.ft & 7) === 0) ppu.setBgPalette(1, PAL.core[(g.ft >> 3) & 3]);
        ppu.setSprPalette(0, g.hitT > 0 ? PAL.heroHit : PAL.hero);
      }
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, game: g.game, sel: g.sel, t: g.t, lvl: g.lvl, lives: g.lives, bombs: g.bombs, score: g.score,
        graze: g.graze, dodges: g.dodges, bullets: g.b.length, crabs: g.crabs.length, paused: g.paused,
        hx: g.hx >> 8, hy: g.hy >> 8, hits: g.hits, cheated: g.cheated, cheats: g.cheats, continues: g.continues,
        hidMax: g.hidMax, hidden: g.hidden, drawn: g.drawn, maxLine: g.maxLine, goal: !!(g.goalHit && !g.cheated),
        pattern: PATTERNS[(g.lvl - 1) % 6], dashT: g.dashT, shield: g.shield
      };
    },
    exit: function () { saveBest(); AU.stop(); },             // §6-3
    cheat: function () {
      if (!g || g.mode === 'title') return false;                // §6-1：標題無效
      g.cheatReq = true; g.cheats++; return true;
    },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return bestFmt(CT.load('dodge', 'best', 0)); }   // §1-6：右對齊 6 字元（BARRAGE 最久存活）
  };
  DG.PATTERNS = PATTERNS;
  DG.GOAL_FRAMES = GOAL_FRAMES;
  DG.MAXB = MAXB;
  DG.dev = {
    g: function () { return g; },
    start: function (m) { g.sel = m === 'court' ? 0 : 1; startRun(m); },
    setTime: function (fr) { g.t = fr; g.lvl = 1 + ((fr / LEVEL_FRAMES) | 0); },
    spawn: spawn, spawnV: spawnV, stepBullet: stepBullet, collides: collides, aimAngle: aimAngle,
    crabPos: crabPos, courtTile: courtTile, wallTile: wallTile, over: function () { enterOver(); },
    hurt: function () { hurt(); }, courtParams: courtParams, secs: secs,
    loopRound: loopRound, loopIv: loopIv, loopSp: loopSp, bestFmt: bestFmt
  };
  if (CT.register) CT.register(GAME);
})();
