/*
 * games/cart1/flyer/main.js — 《星塵飛鳥 STAR SWALLOW》（主角：星燕「琉璃」）（合輯卡帶一 槽 7，id = flyer）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：flyer/art.js、flyer/song.js、engine/shmup.js（NES.SH.Scroller）、
 *         games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/flappy-bird.html（只取「單鍵振翅穿縫」玩法；主角 / 世界 / 障礙全部原創）
 *
 * 主角「琉璃」：頭頂星冠、燕尾分叉的藍色星燕。世界：漂浮在星之群島上空的浮空石柱門。
 * 單鍵：A = 振翅（START 暫停）。每 10 道門換一個場景（調色盤 + 裝飾 + 速度 + 新障礙）：
 *   1 DAWN SEA     晨曦雲海   1.00 px/幀   縫 64   固定柱
 *   2 CRYSTAL CAVE 晶石洞窟   1.25         縫 60   + 移動縫（隔一道）
 *   3 WIND CANYON  風之峽谷   1.50         縫 60   + 上 / 下陣風（預警 40 幀，風紋精靈）
 *   4 AURORA NIGHT 極光夜空   1.63         縫 56   移動縫（全部）+ 陣風
 *   5 STAR GATE    星門       1.75         縫 52   全部 + 強陣風；50 道之後無盡循環
 * 星屑：每 3 道門一顆，收集 5 顆 = 護盾（擋一次碰撞）。獎牌：10 銅 / 20 銀 / 30 金 / 40 晶 / 50 星。
 *
 * 畫面：水平捲動走 NES.SH.Scroller（名稱表逐欄補，一欄 26 磚 + 13 屬性 = 39 byte），
 *       下方 3 列狀態列用 split(208)。移動縫只重寫「有變的柱緣磚」（每道 ≤ 12 byte）。
 * 密技（C / ★）：遊玩中 = 立刻給護盾 + 3 顆星屑；墜落 / GAME OVER = 原地續關（回到剛才那道門前、保留門數，送護盾）；標題無效。機器人 goal：同一局通過 50 道門且未用密技。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var FY = CT.Flyer = CT.Flyer || {};
  var AU = FY.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var COL0 = 40, SPACING = 13, GW = 3;     // 第一道門在世界第 40 欄，間距 13 欄，柱寬 3 欄
  var GROUND_ROW = 24, GROUND_Y = 192;
  var BIRD_SX = 64;                        // 星燕的畫面 x
  var GRAV = 44, FLAP = -760, MAXFALL = 1024;
  var HB = { x: 3, y: 4, w: 10, h: 8 };    // 碰撞框（16×16 精靈內）
  var GOAL_GATES = 50;
  var SPLIT = 208;
  var CONT_AHEAD = (SPACING - GW) * 8 - 12 + HB.x;   // 續關：星燕 x 離下一道門 71 px（上一道門出口後 12 px）
  var SCENES = [
    { name: 'DAWN SEA', speed: 256, gap: 64, move: 0, wind: 0, bd: 0x22, p0: [0x07, 0x17, 0x37], p2: [0x11, 0x21, 0x30], decor: 'cloud', song: 'flyer_sky' },
    { name: 'CRYSTAL CAVE', speed: 320, gap: 60, move: 1, wind: 0, bd: 0x02, p0: [0x01, 0x14, 0x3C], p2: [0x03, 0x13, 0x34], decor: 'crystal', song: 'flyer_sky' },
    { name: 'WIND CANYON', speed: 384, gap: 60, move: 1, wind: 10, bd: 0x27, p0: [0x08, 0x18, 0x38], p2: [0x06, 0x16, 0x36], decor: 'cloud', song: 'flyer_star' },
    { name: 'AURORA NIGHT', speed: 416, gap: 56, move: 2, wind: 12, bd: 0x0C, p0: [0x0C, 0x1B, 0x3B], p2: [0x01, 0x11, 0x2B], decor: 'star', song: 'flyer_star' },
    { name: 'STAR GATE', speed: 448, gap: 52, move: 2, wind: 14, bd: 0x0F, p0: [0x04, 0x15, 0x36], p2: [0x02, 0x12, 0x32], decor: 'star', song: 'flyer_star' }
  ];
  var MEDALS = [
    { n: 10, name: 'BRONZE', pal: [0x07, 0x17, 0x27] }, { n: 20, name: 'SILVER', pal: [0x00, 0x10, 0x30] },
    { n: 30, name: 'GOLD', pal: [0x07, 0x28, 0x38] }, { n: 40, name: 'CRYSTAL', pal: [0x01, 0x21, 0x3C] },
    { n: 50, name: 'STAR', pal: [0x04, 0x25, 0x38] }
  ];
  var PAL_HUD = [0x0F, 0x10, 0x30];
  var PAL_BIRD = [0x01, 0x12, 0x30], PAL_SHIELD = [0x07, 0x28, 0x38];
  var PAL_SPR1 = [0x07, 0x28, 0x30], PAL_SPR2 = [0x00, 0x10, 0x30];

  var art = null, nes0 = null, g = null, scr = null;

  function newState() {
    return {
      mode: 'title', t: 0, runs: 0,
      camX: 0, cam: 0, speed: 256, by: 96 * Q, vy: 0, wing: 0, flapT: 0,
      gates: [], passed: 0, next: 0, scene: 0, stars: 0, starTotal: 0, shield: false, inv: 0,
      wind: 0, windT: 0, windDir: 0, flash: 0, deadT: 0, overT: 0, paused: false,
      cheated: false, cheatReq: false, goalHit: false, seed: 12345, hud: [], sprUsed: 0,
      msg: '', msgT: 0, streaks: [], bot: { t: 0 }, maxGates: 0, continues: 0, medal: -1, readyY: 92
    };
  }

  /* ---------------- 門（決定性亂數） ---------------- */
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function sceneOf(i) { return Math.min(4, (i / 10) | 0); }
  function gateAt(i) {
    while (g.gates.length <= i) {
      var k = g.gates.length, s = sceneOf(k), S = SCENES[s];
      var lo = 24, hi = GROUND_Y - S.gap - 12;
      var prev = k > 0 ? g.gates[k - 1].base : 72;
      var top = lo + (rnd() % (((hi - lo) >> 2) + 1)) * 4;
      if (top > prev + 56) top = prev + 56;
      if (top < prev - 56) top = prev - 56;
      top = Math.max(lo, Math.min(hi, top)) & ~3;
      var moving = S.move === 2 ? (k % 10 !== 0) : (S.move === 1 ? (k % 2 === 1) : false);
      var amp = moving ? (s >= 3 ? 24 : 16) : 0;
      if (moving) top = Math.max(lo + amp, Math.min(hi - amp, top)) & ~3;
      g.gates.push({ i: k, col: COL0 + k * SPACING, base: top, top: top, gap: S.gap, moving: moving, amp: amp,
                     every: 10 - s, phase: (k * 7) % 16, star: (k % 3 === 2), got: false });
    }
    return g.gates[i];
  }
  // 移動縫：三角波，4 px 一步
  function gateTopAt(G, t) {
    if (!G.moving) return G.base;
    var steps = G.amp >> 1;                 // 半振幅 / 4px × 2
    var k = (((t / G.every) | 0) + G.phase) % (steps * 2);
    var off = (k <= steps ? k : steps * 2 - k) * 4 - G.amp;
    return G.base + off;
  }
  function gateOfCol(c) {
    if (c < COL0) return null;
    var k = ((c - COL0) / SPACING) | 0, o = c - COL0 - k * SPACING;
    return o < GW ? { G: gateAt(k), o: o } : null;
  }

  /* ---------------- 磚 ---------------- */
  var KCOL = ['L', 'M', 'R'];
  function pillarTile(G, o, r, top) {
    var y0 = r * 8, bot = top + G.gap, k = KCOL[o];
    if (y0 + 8 <= top) return art.t('P_' + k);
    if (y0 + 8 === top + 4) return art.t('P_T4_' + k);       // 緣在磚上半
    if (y0 + 8 === top) return art.t('P_T8_' + k);
    if (y0 + 4 === top) return art.t('P_T4_' + k);
    if (y0 === bot) return art.t('P_B0_' + k);
    if (y0 + 4 === bot) return art.t('P_B4_' + k);
    if (y0 > bot) return art.t('P_' + k);
    return 0;
  }
  // 修正：上柱下緣落在 y0..y0+7 之間的兩種情形（top = y0+8 → 整格是柱 + 緣在下半；top = y0+4 → 緣在上半）
  function topTile(G, o, r, top) {
    var y0 = r * 8, k = KCOL[o];
    if (top >= y0 + 12) return art.t('P_' + k);
    if (top === y0 + 8) return art.t('P_T8_' + k);
    if (top === y0 + 4) return art.t('P_T4_' + k);
    return -1;
  }
  function botTile(G, o, r, bot) {
    var y0 = r * 8, k = KCOL[o];
    if (bot <= y0 - 4) return art.t('P_' + k);
    if (bot === y0) return art.t('P_B0_' + k);
    if (bot === y0 + 4) return art.t('P_B4_' + k);
    return -1;
  }
  function gateTile(G, o, r, top) {
    var t = topTile(G, o, r, top);
    if (t >= 0) return t;
    t = botTile(G, o, r, top + G.gap);
    return t >= 0 ? t : 0;
  }
  void pillarTile;
  function decorTile(c, r) {
    if (r < 1 || r > 20) return 0;
    var k = c < COL0 ? 0 : (((c - COL0) / SPACING) | 0);
    var d = SCENES[sceneOf(k)].decor;
    var h = ((c * 2654435761) ^ (r * 40503)) >>> 0;
    if (d === 'cloud') {
      if (r > 14) return 0;
      var h0 = (((c - 1) * 2654435761) ^ (r * 40503)) >>> 0;
      if ((h0 % 41) === 0 && !gateOfCol(c - 1)) return art.t('D_CR');
      if ((h % 41) === 0 && !gateOfCol(c + 1)) return art.t('D_CL');
      if ((h % 53) === 5) return art.t('D_CS');
      return 0;
    }
    if (d === 'crystal') return (h % 19) === 3 ? art.t('D_CRY') : ((h % 29) === 7 ? art.t('D_ST2') : 0);
    return (h % 13) === 3 ? art.t('D_ST1') : ((h % 11) === 5 ? art.t('D_ST2') : 0);
  }
  function tileAt(c, r) {
    if (r === GROUND_ROW) return art.t('G_TOP');
    if (r > GROUND_ROW) return art.t(((c + r) & 1) ? 'G_A' : 'G_B');
    var gc = gateOfCol(c);
    if (gc) return gateTile(gc.G, gc.o, r, gc.G.top);
    return decorTile(c, r);
  }
  function attrAt(c16, r16) { return r16 >= 12 ? 2 : 0; }

  // 移動縫：只重寫已經串流進名稱表、且還在畫面附近的門
  function updateMovers() {
    var c0 = (g.cam >> 3) - 4, c1 = scr.next;
    var k0 = Math.max(0, ((c0 - COL0) / SPACING) | 0), k1 = Math.max(0, ((c1 - COL0) / SPACING) | 0) + 1;
    for (var k = k0; k <= k1; k++) {
      var G = gateAt(k);
      if (!G.moving) continue;
      var nt = gateTopAt(G, g.t);
      if (nt === G.top) continue;
      var old = G.top;
      G.top = nt;
      if (G.col >= scr.next || G.col + GW - 1 < c0) continue;
      for (var o = 0; o < GW; o++) {
        var c = G.col + o;
        if (c >= scr.next) continue;
        for (var r = 0; r < GROUND_ROW; r++) {
          var a = gateTile(G, o, r, old), b = gateTile(G, o, r, nt);
          if (a !== b) nes0.ppu.setTile((c >> 5) & 1, c & 31, r, b);
        }
      }
    }
  }

  /* ---------------- 狀態列 ---------------- */
  function hud(row, col, s) {
    var t = art.hud(s), i, k;
    for (i = 0; i < t.length; i++) {
      k = row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      nes0.ppu.setTile(0, col + i, row, t[i]);
    }
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function drawHud() {
    hud(26, 1, 'GATE ' + pad(Math.min(999, g.passed), 3) + '  BEST ' + pad(Math.min(999, CT.load('flyer', 'best', 0)), 3) + '  $' + pad(g.stars, 1) + (g.shield ? '+' : ' '));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.mode === 'ready') line = (g.t & 32) ? 'GET READY!   PRESS A' : 'GET READY!';
    else if (g.msgT > 0) line = g.msg;
    else {
      line = (g.scene + 1) + ' ' + SCENES[g.scene].name;
      if (g.wind) line = padR(line, 17) + 'WIND ' + (g.windDir < 0 ? 'UP' : 'DOWN');
      else if (g.windT > 0) line = padR(line, 17) + ((g.t & 8) ? 'WIND !' : '      ');
    }
    hud(27, 1, padR(line, 30));
  }

  /* ---------------- 畫面切換 ---------------- */
  function setScenePal(s) {
    var S = SCENES[s], ppu = nes0.ppu;
    ppu.setBackdrop(S.bd);
    ppu.setBgPalette(0, S.p0);
    ppu.setBgPalette(1, S.p0);
    ppu.setBgPalette(2, S.p2);
  }
  function text0(col, row, s) {
    var t = art.text(s);
    for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]);
  }
  function enterTitle() {
    g.mode = 'title'; g.t = 0;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr();
      setScenePal(0);
      ppu.setBgPalette(3, [0x01, 0x12, 0x30]);
      for (var c = 2; c < 30; c++) { ppu.setTile(0, c, 3, art.t('FR_H')); ppu.setTile(0, c, 25, art.t('FR_H')); }
      text0(12, 5, 'STARDUST');
      var w = 'SWALLOW';
      for (var i = 0; i < w.length; i++) {
        var t = art.big(w.charAt(i)), x = 9 + i * 2;
        ppu.setTile(0, x, 7, t[0]); ppu.setTile(0, x + 1, 7, t[1]); ppu.setTile(0, x, 8, t[2]); ppu.setTile(0, x + 1, 8, t[3]);
      }
      ppu.fillAttr(0, 4, 3, 8, 2, 0);
      // fix-r5 P3-5：說明每行之間空一列；§6-5：寫出回選單的方法
      text0(4, 13, 'A FLAP WINGS  START PAUSE');
      text0(4, 15, 'NEW SKY + MEDAL EVERY 10');
      text0(4, 17, 'GET 5 $ FOR A SHIELD');
      text0(4, 19, 'HOLD START+SELECT: MENU');
      text0(4, 21, 'BEST ' + pad(CT.load('flyer', 'best', 0), 3) + ' GATES');
      // 地面
      for (c = 0; c < 32; c++) { ppu.setTile(0, c, 26, art.t('G_TOP')); ppu.setTile(0, c, 27, art.t('G_A')); ppu.setTile(0, c, 28, art.t('G_B')); ppu.setTile(0, c, 29, art.t('G_A')); }
      ppu.fillAttr(0, 0, 13, 16, 2, 2);
    });
    AU.play('flyer_sky');
  }
  function startRun() {
    var runs = g.runs + 1, bot = g.bot;
    g = newState();
    g.runs = runs; g.bot = bot;
    g.seed = 12345 + runs * 7919;
    g.mode = 'ready';
    var ppu = nes0.ppu;
    for (var i = 0; i < 4; i++) gateAt(i);
    CT.blank(nes0, function () {
      clearSpr();
      setScenePal(0);
      ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(0, PAL_BIRD);
      scr.reset(0);
      ppu.fillTiles(0, 0, 26, 32, 4, art.t('HB'));
      ppu.fillAttr(0, 0, 13, 16, 2, 3);
      g.hud = [];
      drawHud();
    });
    AU.play('flyer_sky');
  }
  function clearSpr() { var ppu = nes0.ppu; ppu.clearSprites(); g.sprUsed = 0; }

  function medalOf(n) { var m = -1; for (var i = 0; i < MEDALS.length; i++) if (n >= MEDALS[i].n) m = i; return m; }
  function saveBest() {
    if (!g) return false;
    var best = CT.load('flyer', 'best', 0);
    if (g.passed > best) { CT.save('flyer', 'best', g.passed); return true; }
    return false;
  }
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    var best = CT.load('flyer', 'best', 0);
    g.newBest = saveBest();
    var ppu = nes0.ppu, m = medalOf(g.passed);
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr();
      ppu.setBgPalette(3, [0x01, 0x12, 0x30]);
      for (var c = 4; c < 28; c++) { ppu.setTile(0, c, 4, art.t('FR_H')); ppu.setTile(0, c, 23, art.t('FR_H')); }
      // fix-r5 P3-5：結算各行之間空一列
      text0(11, 6, 'GAME OVER');
      text0(8, 9, 'GATES   ' + pad(g.passed, 3) + (g.newBest ? '  NEW!' : ''));
      text0(8, 11, 'BEST    ' + pad(Math.max(best, g.passed), 3));
      text0(8, 13, 'STARS   ' + pad(g.starTotal, 3));
      text0(8, 15, 'SKY     ' + (g.scene + 1) + ' ' + SCENES[g.scene].name);
      text0(8, 17, 'MEDAL');
      text0(20, 17, m >= 0 ? MEDALS[m].name : '-');
      text0(10, 20, 'PUSH START');
      if (m >= 0) ppu.setSprPalette(3, MEDALS[m].pal);
    });
    g.medal = m;
    AU.play('flyer_over');
  }

  /* ---------------- 遊玩 ---------------- */
  function birdBox() { return { x: g.cam + BIRD_SX + HB.x, y: (g.by >> 8) + HB.y, w: HB.w, h: HB.h }; }
  function hitTest() {
    var b = birdBox();
    if (b.y + b.h > GROUND_Y) return true;
    for (var k = Math.max(0, g.next - 1); k <= g.next + 1; k++) {
      var G = gateAt(k), gx = G.col * 8;
      if (b.x + b.w <= gx || b.x >= gx + GW * 8) continue;
      if (b.y < G.top || b.y + b.h > G.top + G.gap) return true;
    }
    return false;
  }
  function flap() { g.vy = FLAP; g.flapT = 12; AU.sfx('flyer_flap'); }

  function updateWind() {
    var S = SCENES[g.scene];
    if (!S.wind) { g.wind = 0; g.windT = 0; return; }
    var cyc = 300, ph = g.t % cyc, n = (g.t / cyc) | 0;
    g.windDir = (n & 1) ? 1 : -1;
    if (ph >= 150 && ph < 190) { g.windT = 190 - ph; g.wind = 0; if (ph === 150) AU.sfx('flyer_wind'); }
    else if (ph >= 190) { g.windT = 0; g.wind = windAt(g.t, g.scene); }
    else { g.windT = 0; g.wind = 0; }
  }

  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused; drawHud();
      if (g.paused) AU.pause(); else AU.resume();     // fix-r5 §6-2：暫停 = BGM 停，恢復接續
    }
    if (g.paused) return;
    g.t++;
    if (g.flapT > 0) g.flapT--;
    if (g.msgT > 0) g.msgT--;
    if (g.inv > 0) g.inv--;
    if (g.flash > 0) g.flash--;
    if (g.mode === 'ready') {
      g.by = (g.readyY * Q) + ((g.t & 32) ? 2 * Q : 0);
      g.vy = 0;
      if (I.pressed(BTN.A)) { g.mode = 'play'; flap(); }
      return;
    }
    if (g.mode === 'dead') {
      g.vy = Math.min(MAXFALL, g.vy + GRAV);
      if ((g.by >> 8) < GROUND_Y - 12) g.by += g.vy;
      if (++g.deadT > 80) enterOver();
      return;
    }
    // 捲動
    g.camX += g.speed;
    g.cam = g.camX >> 8;
    updateMovers();
    scr.update(g.cam);
    updateWind();
    // 星燕
    if (I.pressed(BTN.A)) flap();
    g.vy += GRAV + g.wind;
    if (g.vy > MAXFALL) g.vy = MAXFALL;
    g.by += g.vy;
    if (g.by < 0) { g.by = 0; if (g.vy < 0) g.vy = 0; }
    // 通過
    var G = gateAt(g.next), bx = g.cam + BIRD_SX + HB.x;
    if (bx > G.col * 8 + GW * 8) {
      g.next++; g.passed++;
      AU.sfx('flyer_pass');
      if (g.passed > g.maxGates) g.maxGates = g.passed;
      if (!g.cheated && g.passed >= GOAL_GATES) g.goalHit = true;
      if (g.passed % 10 === 0) {
        var ns = Math.min(4, (g.passed / 10) | 0);
        if (ns !== g.scene || g.passed >= 50) {
          g.scene = ns; g.speed = SCENES[ns].speed; g.flash = 12;
          g.msg = g.passed >= 50 && g.passed % 10 === 0 && ns === 4 && g.passed > 50 ? 'STAR GATE  LOOP ' + ((g.passed / 10) - 4) : 'SKY ' + (ns + 1) + '  ' + SCENES[ns].name;
          g.msgT = 120;
          AU.sfx('flyer_scene');
          if (SCENES[ns].song !== AU.current) AU.play(SCENES[ns].song);
        }
      }
    }
    // 星屑
    for (var k = Math.max(0, g.next - 1); k <= g.next + 1; k++) {
      var H = gateAt(k);
      if (!H.star || H.got) continue;
      var sx = H.col * 8 + 8, sy = H.top + (H.gap >> 1) - 4, b = birdBox();
      if (b.x + b.w > sx && b.x < sx + 8 && b.y + b.h > sy && b.y < sy + 8) {
        H.got = true; g.stars++; g.starTotal++;
        AU.sfx('flyer_star');
        if (g.stars >= 5) { g.stars = 0; if (!g.shield) { g.shield = true; AU.sfx('flyer_shield'); g.msg = 'SHIELD READY!'; g.msgT = 90; } }
      }
    }
    // 碰撞
    if (g.inv === 0 && hitTest()) {
      if (g.shield) {
        g.shield = false; g.inv = 90; AU.sfx('flyer_shield');
        g.msg = 'SHIELD BROKE!'; g.msgT = 90;
        if ((g.by >> 8) + HB.y + HB.h > GROUND_Y) { g.by = (GROUND_Y - 40) * Q; g.vy = FLAP; }
      } else {
        g.mode = 'dead'; g.deadT = 0; g.vy = -512;
        AU.sfx('flyer_hit');
        AU.stop();
      }
    }
  }

  /* ---------------- 繪製 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0;
    function spr(x, y, tile, pal, fh, fv) {
      if (y > 207 || y < -7 || x < -7 || x > 255) return;
      ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv });
    }
    var by = g.by >> 8;
    if (g.mode === 'title') {
      by = 84 + ((g.t >> 3) & 3);
    }
    var visible = !(g.inv > 0 && (g.t & 2));
    var fr = g.mode === 'dead' ? 1 : (g.flapT > 6 ? 2 : (g.flapT > 0 ? 1 : ((g.t >> 3) % 3 === 0 && g.mode !== 'play' ? 0 : (g.vy < 0 ? 0 : 1))));
    if (g.mode === 'title') fr = [0, 1, 2, 1][(g.t >> 3) & 3];
    var bxs = g.mode === 'title' ? 120 : BIRD_SX;
    if (g.mode !== 'over' && visible) {
      var dead = g.mode === 'dead';
      for (var q = 0; q < 4; q++) {
        var tx = q & 1, ty = q >> 1;
        spr(bxs + tx * 8, (dead ? by + (1 - ty) * 8 : by + ty * 8), art.s('BIRD' + fr + '_' + q), 0, false, dead);
      }
    }
    if (g.mode === 'play' || g.mode === 'ready' || g.mode === 'dead') {
      // 星屑
      for (var k = Math.max(0, g.next - 1); k <= g.next + 3; k++) {
        var H = gateAt(k);
        if (!H.star || H.got) continue;
        var sx = H.col * 8 + 8 - g.cam;
        if (sx > -8 && sx < 256) spr(sx, H.top + (H.gap >> 1) - 4, art.s('STAR'), 1);
      }
      // 風紋（固定 6 條水平帶，每帶 ≤ 1 顆 ⇒ 每線 ≤ 1）
      if (g.wind || g.windT > 0) {
        for (var L = 0; L < 6; L++) {
          var y = 20 + L * 28 + ((g.windDir < 0 ? -1 : 1) * ((g.t * (g.wind ? 3 : 1)) % 28)) % 28;
          var x = (L * 97 + g.t * 3) & 255;
          spr(x, y, art.s(g.wind ? 'STREAK' : 'STREAK2'), 2);
        }
      }
    }
    if (g.mode === 'over' && g.medal >= 0) {
      for (q = 0; q < 4; q++) spr(136 + (q & 1) * 8, 132 + (q >> 1) * 8, art.s('MEDAL_' + q), 3);   // 對齊第 17 列 MEDAL
    }
    for (var i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
  }

  // 除錯 / 測試：直接跳到第 n 道門前（等同檢查點：Scroller.reset 只在 CT.blank 內做）
  function jumpTo(n) {
    if (g.mode === 'title' || g.mode === 'over') startRun();
    gateAt(n + 3);
    var s = Math.min(4, (n / 10) | 0);
    g.passed = n; g.next = n; g.scene = s; g.speed = SCENES[s].speed; g.mode = 'play';
    g.cam = gateAt(n).col * 8 - 140; g.camX = g.cam * Q;
    g.by = (gateAt(n).top + (gateAt(n).gap >> 1) - 8) * Q; g.vy = FLAP;
    for (var k = 0; k <= n + 3; k++) gateAt(k).top = gateTopAt(gateAt(k), g.t);
    CT.blank(nes0, function () { setScenePal(s); scr.reset(g.cam); g.hud = []; drawHud(); });
    if (SCENES[s].song !== AU.current) AU.play(SCENES[s].song);
  }

  // 密技續關（fix-r5 §6-1）：墜落中 / GAME OVER 按密技 ⇒ 回到上一道門與剛才那道門之間的 GET READY，
  // 門數 / 星屑 / 場景全保留，另送護盾。整片重畫在 CT.blank 內（結算畫面 → 遊玩畫面）。
  function continueRun() {
    var n = g.next, s = g.scene, ppu = nes0.ppu, k;
    gateAt(n + 3);
    g.mode = 'ready'; g.deadT = 0; g.overT = 0; g.paused = false; g.inv = 0; g.medal = -1;
    g.shield = true; g.cheated = true; g.continues++;
    g.speed = SCENES[s].speed;
    // 星燕放在「上一道門出口後 12 px」= 兩道門之間的空檔（離下一道門 71 px），高度對準下一道門縫中央
    g.cam = Math.max(0, gateAt(n).col * 8 - CONT_AHEAD - BIRD_SX); g.camX = g.cam * Q;
    for (k = 0; k <= n + 3; k++) gateAt(k).top = gateTopAt(gateAt(k), g.t);
    g.readyY = gateAt(n).top + (gateAt(n).gap >> 1) - 8;
    g.by = g.readyY * Q; g.vy = 0; g.flapT = 0; g.wind = 0; g.windT = 0;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      clearSpr();
      setScenePal(s);
      ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(0, PAL_SHIELD);
      scr.reset(g.cam);
      ppu.fillTiles(0, 0, 26, 32, 4, art.t('HB'));
      ppu.fillAttr(0, 0, 13, 16, 2, 3);
      g.hud = [];
      drawHud();
    });
    AU.sfx('flyer_shield');
    AU.play(SCENES[s].song);
  }

  /* ---------------- 機器人 ---------------- */
  function botMask() {
    var B = g.bot;
    B.t++;
    if (g.mode === 'title') return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode === 'over') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode === 'ready') return (B.t % 30 === 10) ? BTN.A : 0;
    if (g.mode !== 'play') return 0;
    // 前瞻搜尋：方案 = 「第 k1 幀（與第 k2 幀）振翅」或「都不振翅」；用與遊戲相同的規則
    // （重力 / 風 / 移動縫 / 捲動）模擬 H 幀。分數 = 存活幀數 × 1000 − 終點離「下一道門縫中心」的距離
    var H = 30, bestS = -1e9, bestK = -1, k1, k2, sc;
    for (k1 = -1; k1 < H; k1++) {
      for (k2 = (k1 < 0 ? -1 : k1 + 8); k2 < H; k2 = (k2 < 0 ? H : k2 + 2)) {
        sc = simulate(k1, k2, H);
        if (sc > bestS) { bestS = sc; bestK = k1; }
        if (k1 < 0) break;
      }
      if (k1 >= 0 && simulate(k1, -1, H) > bestS) { bestS = simulate(k1, -1, H); bestK = k1; }
    }
    return bestK === 0 ? BTN.A : 0;
  }
  function windAt(t, scene) {
    var S = SCENES[scene];
    if (!S.wind) return 0;
    var ph = t % 300, n = (t / 300) | 0;
    return ph >= 190 ? S.wind * ((n & 1) ? 1 : -1) : 0;
  }
  // 模擬一個方案，回傳分數（存活越久越好，同樣活到底則越接近下一道門縫中心越好）
  function simulate(k1, k2, H) {
    var y = g.by, vy = g.vy, t, cx = g.camX, j;
    for (t = 1; t <= H; t++) {
      if (t - 1 === k1 || t - 1 === k2) vy = FLAP;
      vy += GRAV + windAt(g.t + t, g.scene);
      if (vy > MAXFALL) vy = MAXFALL;
      y += vy;
      if (y < 0) { y = 0; if (vy < 0) vy = 0; }
      cx += g.speed;
      var bx = (cx >> 8) + BIRD_SX + HB.x, by = (y >> 8) + HB.y;
      if (by + HB.h > GROUND_Y - 1) return t * 1000;
      for (j = Math.max(0, g.next - 1); j <= g.next + 1; j++) {
        var G = gateAt(j), gx = G.col * 8;
        if (bx + HB.w <= gx || bx >= gx + GW * 8) continue;
        var top = gateTopAt(G, g.t + t);
        if (by < top + 1 || by + HB.h > top + G.gap - 1) return t * 1000;
      }
    }
    // 終點：對準「還沒通過的下一道門」的縫中心（略偏下，因為振翅會往上）
    var bxe = (cx >> 8) + BIRD_SX + HB.x, n = g.next;
    while (gateAt(n).col * 8 + GW * 8 < bxe) n++;
    var Gn = gateAt(n), c = gateTopAt(Gn, g.t + H) + (Gn.gap >> 1) + 4;
    var d = (y >> 8) + HB.y + (HB.h >> 1) - c;
    return (H + 1) * 1000 - (d < 0 ? -d : d) - (k1 >= 0 ? 1 : 0) - (k2 >= 0 ? 1 : 0);
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'flyer', order: 7, title: '星塵飛鳥', legacy: ['flappy-bird.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = FY.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'flyer_bg');
      NES.CHR.setPattern(1, 'flyer_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setSprPalette(0, PAL_BIRD); ppu.setSprPalette(1, PAL_SPR1); ppu.setSprPalette(2, PAL_SPR2); ppu.setSprPalette(3, MEDALS[0].pal);
      ppu.setBgPalette(3, PAL_HUD);
      GAME.backTile = { tile: art.s('STAR'), pal: 1 };   // fix-r5 §6-4：回選單提示用星屑（實心 8×8，不是翅膀半邊）
      AU.init(nes);
      g = newState();
      scr = NES.SH.Scroller(ppu, { nt: 2, cols: 0, tileAt: tileAt, attrAt: attrAt, row0: 0, rows: 26 });
      if (opt && opt.start) startRun(); else enterTitle();
      var jg = CT.query ? parseInt(CT.query('gate') || '', 10) : NaN;
      if (jg >= 0) jumpTo(jg);
    },
    update: function (nes) {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'dead' || g.mode === 'over') continueRun();
        else if (g.mode === 'play' || g.mode === 'ready') { g.shield = true; g.stars = Math.min(4, g.stars + 3); g.cheated = true; g.msg = 'STAR POWER!  SHIELD'; g.msgT = 90; AU.sfx('flyer_shield'); }
      }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) startRun();
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function (nes) {
      var ppu = nes.ppu;
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) text0(11, 23, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.mode !== 'over') {
        ppu.scroll(g.cam & 511, 0, 0);
        ppu.split(SPLIT, { x: 0, y: SPLIT, nt: 0 });
        if (g.flash > 0) ppu.setBackdrop(g.flash > 6 ? 0x30 : SCENES[g.scene].bd);
        if (g.flash === 6) setScenePal(g.scene);
        if (!g.paused) drawHud();
        ppu.setSprPalette(0, g.shield ? PAL_SHIELD : PAL_BIRD);
      }
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, passed: g.passed, scene: g.scene, speed: g.speed, cam: g.cam, by: g.by >> 8, vy: g.vy,
        stars: g.stars, starTotal: g.starTotal, shield: g.shield, wind: g.wind, paused: g.paused,
        goal: g.goalHit && !g.cheated, cheated: g.cheated, continues: g.continues, next: g.next, runs: g.runs, maxGates: g.maxGates,
        scrollPeak: scr ? scr.peak : 0
      };
    },
    exit: function () { saveBest(); AU.stop(); },     // fix-r5 §6-3：中途離開也存最高分
    cheat: function () { if (!g || g.mode === 'title') return false; g.cheatReq = true; return true; },   // 標題無效
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return pad(CT.load('flyer', 'best', 0), 3) + ' GATE'; }
  };
  FY.GOAL_GATES = GOAL_GATES;
  FY.SCENES = SCENES;
  FY.MEDALS = MEDALS;
  FY.dev = {
    g: function () { return g; }, scr: function () { return scr; },
    gateAt: gateAt, gateTopAt: gateTopAt, tileAt: tileAt, gateTile: gateTile, hitTest: hitTest, medalOf: medalOf,
    start: function () { startRun(); },
    jump: function (n) { jumpTo(n); }
  };
  if (CT.register) CT.register(GAME);
})();
