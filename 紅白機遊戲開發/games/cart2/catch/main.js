/*
 * games/cart2/catch/main.js — 《星塵接球 STAR CATCH》（合輯卡帶二 槽 5，id = catch）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-3 cart2-pop（R6）｜ 依賴：catch/art.js、catch/song.js、catch/levels.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/ball-catch.html、bouncing-ball.html、ball-bounce.html（只取「接落下物 / 頂球不落地 /
 *   控制彈跳球往上跳」三種玩法；主角、物件、關卡、配色、音樂全部原創）
 *
 * 主角：拾星機器人「波羅 BOLO」。三個模式（標題 ↑↓ 選）：
 *   CATCH STARS  接星：左右移動星籃接落下的星星（金星高分、心 = 補命、時鐘 = 慢動作），避開虛空海膽；
 *                漏接 5 顆或接到海膽 = 扣 1 命；每接滿 10+2×LV 顆升級（落速 / 密度 / 之字落下），9 級後無盡。
 *   KEEP IT UP   頂球：托盤把彗星球一直頂著不落地。打擊點決定反彈角度；連續時間 12s 起起風、24s 第 2 顆、40s 強風、
 *                60s 第 3 顆、90s 重力增加。掉一顆 = 扣 1 命、連續時間歸零。**goal = 連續 60 秒不掉（未用密技）**。
 *   BOUNCE TOWER 彈跳：操作自動彈跳的星球「噗噗」左右移動、落地時按住 A = 高跳，6 張原創關卡跳上星門；
 *                彈簧 / 星刺 / 碎晶（第二次踩就碎）/ 苔墊（低彈、不能高跳）。
 * 控制：←→ 移動、B 按住 = 衝刺（接星 / 頂球）、A = 高跳（彈跳）、START 暫停、長按 START+SELECT 回選單。
 * 每線精靈（設計上限）：主角 = 星籃 / 托盤 3 顆 + 身體 2 顆；接星的落下物「依落下距離」生成、全部同速 ⇒ 任一掃描線最多
 *   碰到 1 顆落下物 + 1 顆火花 ⇒ ≤ 5；頂球最多 3 顆球 ⇒ ≤ 6；彈跳只有球 + 火花 ⇒ ≤ 3。機器人逐幀量測見 test_catch.py。
 * 密技（C / ★）：遊玩中 = 接星補 2 命並清除海膽、頂球補滿命數、彈跳補 3 命；GAME OVER = 原地續關（同一級 / 同一關，
 *   分數保留、命數補回開局值）；標題無效。用過密技那一局 goal 一律 false。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CA = CT.Catch = CT.Catch || {};
  var AU = CA.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var MODES = ['catch', 'keep', 'bounce'];
  var MODE_NAME = { catch: 'CATCH STARS', keep: 'KEEP IT UP', bounce: 'BOUNCE TOWER' };
  var GOAL_KEEP = 3600;                    // 60 秒（60 幀 / 秒）
  var FIELD_X0 = 8, FIELD_X1 = 248;        // 左右牆內側
  var CEIL = 32;                           // 上框下緣
  var PY = 192;                            // 主角身體頂（16×16）；星籃 / 托盤在 PY-8
  var SURF = PY - 6;                       // 托盤 / 星籃表面 y
  var FLOOR_Y = 208;

  // 接星
  var C_NEED = function (lv) { return 10 + lv * 2; };
  var C_FALL = function (lv) { return 256 + Math.min(lv, 12) * 48; };
  var C_GAP = function (lv) { return Math.max(14, 44 - lv * 4); };
  var C_SPEED = 640, C_DASH = 896, C_LIVES = 3, C_MISS = 5;
  // 頂球
  var K_G = 22, K_HIT = 1270, K_VXMAX = 640, K_LIVES = 3;
  var K_PHASES = [
    // hit = 擊球初速：與重力配對成同樣的頂點高度（≈141 px，不撞天花板），重力小 ⇒ 滯空長
    { t: 0, balls: 1, wind: 0, g: 22, hit: 1270, name: 'WARM UP' },
    { t: 720, balls: 1, wind: 5, g: 22, hit: 1270, name: 'BREEZE' },
    { t: 1440, balls: 2, wind: 5, g: 22, hit: 1270, name: 'TWIN COMETS' },
    { t: 2400, balls: 2, wind: 8, g: 22, hit: 1270, name: 'STAR GALE' },
    // fix-r6 P2-1：三球階段放慢（重力 16 ⇒ 滯空 ≈134 幀，原 115）；HEAVY SKY 18
    { t: 3600, balls: 3, wind: 8, g: 16, hit: 1075, name: 'TRIPLE STAR' },
    { t: 5400, balls: 3, wind: 9, g: 18, hit: 1140, name: 'HEAVY SKY' }
  ];
  var K_ADD_CD = 150;                      // 多球時掉了一顆 ⇒ 150 幀內不補新球
  // 彈跳
  var B_G = 46, B_MAXF = 1280, B_ACC = 40, B_DEC = 24, B_MAXV = 448;
  var V_NORM = 870, V_SUPER = 1229, V_SPRING = 1638, V_SOFT = 720, B_LIVES = 5;

  var PAL = {
    bd: 0x0F,
    bg0: [0x00, 0x10, 0x30], bg1: [0x0B, 0x1C, 0x3C], bg2: [0x04, 0x14, 0x24], floor: [0x01, 0x03, 0x13], bg3: [0x06, 0x16, 0x28],
    s0: [0x07, 0x27, 0x30], s1: [0x07, 0x28, 0x38], s2: [0x16, 0x05, 0x25], s3: [0x01, 0x21, 0x30]
  };

  var art = null, nes0 = null, g = null;

  function newState() {
    return {
      mode: 'title', sel: 1, sub: 'keep', t: 0, paused: false, hud: {}, sprUsed: 0,
      score: 0, lives: 3, cheated: false, cheatReq: false, goalHit: false, overT: 0, msg: '', msgT: 0,
      seed: 7, continues: 0, runs: 0,
      // 接星
      px: 116 * Q, lv: 1, caught: 0, miss: 0, items: [], acc: 0, slow: 0, dizzy: 0, fx: [], combo: 0, lvT: 0,
      // 頂球
      balls: [], streak: 0, bestStreak: 0, hits: 0, phase: 0, wind: 0, windWarn: 0, net: 0, dropT: 0, addCd: 0, lost: 0, pend: null,
      // 彈跳
      level: 0, ball: null, map: null, cracked: {}, gems: 0, deadT: 0, clearT: 0, levelsCleared: 0, land: null, bt: 0,
      bot: { t: 0, plan: null, step: 0, ft: 0, expect: null, replans: 0 }
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }

  /* ---------------- 文字 / HUD ---------------- */
  function text0(col, row, s) {
    var t = art.text(s);
    for (var i = 0; i < t.length && col + i < 32; i++) nes0.ppu.setTile(0, col + i, row, t[i]);
  }
  function hud(row, col, s) {          // 只寫有變的格
    var t = art.text(s), i, k;
    for (i = 0; i < t.length && col + i < 32; i++) {
      k = row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      nes0.ppu.setTile(0, col + i, row, t[i]);
    }
  }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function secs(f) { var d = Math.floor(f / 6); return Math.floor(d / 10) + '.' + (d % 10); }
  function sec3(f) { var s = secs(f); while (s.length < 4) s = '0' + s; return s; }   // 00.0

  // 標題大字（3×5 方塊字，每格 = 1 磚）
  var BIG = { C: '111,100,100,100,111', A: '010,101,111,101,101', T: '111,010,010,010,010', H: '101,101,111,101,101' };
  function bigWord(word, col, row) {
    for (var i = 0; i < word.length; i++) {
      var rows = BIG[word.charAt(i)].split(',');
      for (var y = 0; y < 5; y++) for (var x = 0; x < 3; x++) {
        if (rows[y].charAt(x) === '1') nes0.ppu.setTile(0, col + i * 4 + x, row + y, art.t('BLK'));
      }
    }
  }
  function frame(full) {
    var ppu = nes0.ppu, c, r;
    for (c = 0; c < 32; c++) ppu.setTile(0, c, 3, art.t('FR_T'));
    for (r = 4; r < (full ? 28 : 26); r++) { ppu.setTile(0, 0, r, art.t('FR_L')); ppu.setTile(0, 31, r, art.t('FR_R')); }
    ppu.setTile(0, 0, 3, art.t('FR_C')); ppu.setTile(0, 31, 3, art.t('FR_C'));
    // 框 + HUD 一律用平台那組（青）：平台貼牆時 16×16 屬性區塊不會把框染成別的顏色
    ppu.fillAttr(0, 0, 0, 16, 2, 1);
    ppu.fillAttr(0, 0, 2, 1, full ? 12 : 11, 1); ppu.fillAttr(0, 15, 2, 1, full ? 12 : 11, 1);
  }
  function deco() {                    // 星點（色 3，屬性 0 區）
    for (var i = 0; i < 26; i++) {
      var c = 2 + ((i * 37 + 5) % 28), r = 5 + ((i * 53 + 3) % 19);
      if (nes0.ppu.getTile(0, c, r) === 0) nes0.ppu.setTile(0, c, r, art.t(i % 3 === 0 ? 'D2' : (i % 3 === 1 ? 'D1' : 'D3')));
    }
  }
  function setPals() {
    var ppu = nes0.ppu;
    ppu.setBackdrop(PAL.bd);
    ppu.setBgPalette(0, PAL.bg0); ppu.setBgPalette(1, PAL.bg1); ppu.setBgPalette(2, PAL.bg2); ppu.setBgPalette(3, PAL.bg3);
    ppu.setSprPalette(0, PAL.s0); ppu.setSprPalette(1, PAL.s1); ppu.setSprPalette(2, PAL.s2); ppu.setSprPalette(3, PAL.s3);
  }
  function clearScreen() {
    var ppu = nes0.ppu;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
    ppu.clearSprites(); g.sprUsed = 0; g.hud = {};
  }

  /* ---------------- 最高分 ---------------- */
  function bestOf(m) { return CT.load('catch', 'best_' + m, 0); }
  function saveBest() {
    if (!g) return;
    var v = g.sub === 'keep' ? Math.max(g.bestStreak, g.streak) : (g.sub === 'bounce' ? g.score : g.score);
    if (g.mode === 'title') return;
    if (v > bestOf(g.sub)) CT.save('catch', 'best_' + g.sub, v);
    if (g.sub === 'keep' && v > CT.load('catch', 'best', 0)) CT.save('catch', 'best', v);
  }

  /* ---------------- 標題 ---------------- */
  var DESC = {
    catch: ['CATCH STARS. DODGE URCHINS', 'LEFT RIGHT MOVE   B DASH'],
    keep: ['KEEP THE COMETS UP 60 SEC', 'LEFT RIGHT MOVE   B DASH'],
    bounce: ['HOP UP TO THE STAR GATE', 'HOLD A ON LANDING: HIGH HOP']
  };
  function bestLine(m) {
    if (m === 'keep') return 'BEST ' + sec3(bestOf('keep')) + 'S';
    return 'BEST ' + pad(bestOf(m), 6);
  }
  function drawMenu() {
    for (var i = 0; i < 3; i++) {
      var m = MODES[i];
      hud(14 + i * 2, 3, (g.sel === i ? '>' : ' ') + ' ' + padR(MODE_NAME[m], 13) + padR(bestLine(m), 12));
    }
    hud(21, 3, padR(DESC[MODES[g.sel]][0], 27));
    hud(23, 3, padR(DESC[MODES[g.sel]][1], 27));
  }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals();
      frame(true);
      for (var c = 0; c < 32; c++) ppu.setTile(0, c, 28, art.t('FR_T'));
      ppu.fillAttr(0, 0, 14, 16, 1, 1);
      text0(12, 5, 'STARDUST');
      bigWord('CATCH', 6, 7);
      ppu.fillAttr(0, 1, 2, 14, 4, 3);           // 標題字黃色（左右框不吃這組）
      // §6-5 / §6-6：說明段落之間空一列
      text0(3, 25, 'START GO  C/* = CHEAT');   // P3-5：只有 START GO 會閃
      text0(4, 27, 'HOLD START+SELECT: MENU');
      g.hud = {};
      drawMenu();
    });
    AU.play('catch_title');
  }

  /* ---------------- 開局 ---------------- */
  function startMode(m) {
    var keepBot = g.bot, runs = g.runs + 1, sel = g.sel;
    g = newState(); g.bot = keepBot; g.runs = runs; g.sel = sel; g.sub = m; g.mode = 'play';
    g.seed = 101 + runs * 977;
    g.bot.plan = null;
    if (m === 'catch') { g.lives = C_LIVES; buildField(); AU.play('catch_title'); }
    else if (m === 'keep') { g.lives = K_LIVES; buildField(); serve(116); AU.play('catch_keep'); }
    else { g.lives = B_LIVES; loadLevel(0); AU.play('catch_keep'); }
  }
  function buildField() {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals();
      frame(false);
      deco();
      for (var c = 0; c < 32; c++) { ppu.setTile(0, c, 26, art.t('FLOOR')); ppu.setTile(0, c, 27, art.t('SOIL')); ppu.setTile(0, c, 28, art.t('SOIL')); }
      ppu.fillAttr(0, 0, 13, 16, 2, 2);
      ppu.setBgPalette(2, PAL.floor);            // 地面：暗紫月砂（彈跳模式的 bg2 是星門紫）
      drawHud();
    });
  }

  /* ---------------- HUD ---------------- */
  function lifeStr(n) { var s = ''; for (var i = 0; i < Math.min(5, n); i++) s += '#'; return padR(s, 5); }
  function drawHud() {
    var l1, l2;
    if (g.sub === 'catch') {
      l1 = 'SCORE ' + pad(g.score, 6) + '  LV ' + g.lv + '  ' + lifeStr(g.lives);
      l2 = 'MISS ' + g.miss + '/' + C_MISS + '  STARS ' + pad(g.caught, 2) + '/' + pad(C_NEED(g.lv), 2) + (g.slow ? '  SLOW' : '      ');
    } else if (g.sub === 'keep') {
      l1 = 'KEEP ' + sec3(g.streak) + 'S  BEST ' + sec3(Math.max(g.bestStreak, bestOf('keep'))) + 'S ' + lifeStr(g.lives);
      var w = g.wind > 0 ? 'WIND >>' : (g.wind < 0 ? 'WIND <<' : (g.windWarn > 0 && (g.t & 8) ? 'WIND !' : ''));
      l2 = 'HIT ' + pad(g.hits, 4) + '  ' + padR(K_PHASES[g.phase].name, 12) + padR(w, 7);
    } else {
      var L = CA.LEVELS[g.level];
      l1 = 'STAGE ' + (g.level + 1) + ' ' + padR(L.name, 13) + ' ' + lifeStr(g.lives);
      l2 = 'SCORE ' + pad(g.score, 6) + '  GEM ' + pad(g.gems, 2) + '  TIME ' + pad(Math.floor(g.bt / 60), 3);
    }
    if (g.paused) l2 = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) l2 = g.msg;
    hud(1, 1, padR(l1, 30));
    hud(2, 1, padR(l2, 30));
  }
  function say(s, t) { g.msg = s; g.msgT = t || 90; }

  /* ================= 接星 ================= */
  function catchSpawn() {
    var lv = g.lv, r = rnd() % 100, type = 'STAR';
    var bad = Math.min(36, 12 + lv * 3);
    if (r < bad) type = 'URCHIN';
    else if (r < bad + 7) type = 'GOLD';
    else if (r < bad + 9 && g.lives < 5) type = 'HEART';
    else if (r < bad + 12 && lv >= 2) type = 'CLOCK';
    var x = 12 + (rnd() % 28) * 8;
    var zig = lv >= 3 && (rnd() % 100) < Math.min(50, lv * 7) ? ((rnd() & 1) ? 96 : -96) : 0;
    g.items.push({ type: type, x: x * Q, y: (CEIL - 8) * Q, vx: zig });
  }
  function fx(x, y, tile, pal, t) { g.fx.push({ x: x, y: y, tile: tile, pal: pal, t: t || 16 }); if (g.fx.length > 4) g.fx.shift(); }
  function loseLife(why) {
    g.lives--; g.miss = 0; g.combo = 0;
    AU.sfx('catch_bad');
    if (g.lives <= 0) { enterOver(); return true; }
    say(why, 80);
    return false;
  }
  function updateCatch() {
    var I = NES.Input, sp = I.held(BTN.B) ? C_DASH : C_SPEED;
    if (g.dizzy > 0) g.dizzy--;
    else {
      if (I.held(BTN.LEFT)) g.px -= sp;
      if (I.held(BTN.RIGHT)) g.px += sp;
    }
    g.px = Math.max(FIELD_X0 * Q, Math.min((FIELD_X1 - 24) * Q, g.px));
    if (g.slow > 0) g.slow--;
    var fall = C_FALL(g.lv);
    if (g.slow) fall >>= 1;
    g.acc += fall;
    if (g.acc >= C_GAP(g.lv) * Q) { g.acc -= C_GAP(g.lv) * Q; if ((rnd() % 100) < 70) catchSpawn(); }
    var bx = g.px >> 8, i;
    for (i = g.items.length - 1; i >= 0; i--) {
      var it = g.items[i];
      it.y += fall;
      if (it.vx) { it.x += it.vx; if (it.x < 12 * Q || it.x > 236 * Q) it.vx = -it.vx; }
      var x = it.x >> 8, y = it.y >> 8;
      // 星籃開口：y+6 落在 SURF-2..SURF+5、x 中心在籃內
      var cx = x + 4;
      var inBasket = cx >= bx + 1 && cx <= bx + 23 && y + 6 >= SURF - 2 && y + 6 <= SURF + 6;
      var hitBody = it.type === 'URCHIN' && cx >= bx + 2 && cx <= bx + 22 && y + 6 >= SURF - 2 && y < PY + 14;
      if (inBasket || hitBody) {
        g.items.splice(i, 1);
        if (it.type === 'URCHIN') {
          g.dizzy = 45; fx(x, y, art.s('POOF'), 3, 20);
          if (loseLife('OUCH! URCHIN')) return;
          continue;
        }
        g.combo++;
        if (it.type === 'STAR') { g.score += 10 * g.lv; g.caught++; AU.sfx('catch_get'); }
        else if (it.type === 'GOLD') { g.score += 50 * g.lv; g.caught += 2; AU.sfx('catch_gold'); }
        else if (it.type === 'HEART') { g.lives = Math.min(5, g.lives + 1); g.score += 20; AU.sfx('catch_gold'); say('LIFE UP!', 60); }
        else if (it.type === 'CLOCK') { g.slow = 300; g.score += 20; AU.sfx('catch_gold'); say('SLOW TIME!', 60); }
        if (g.combo % 10 === 0) { g.score += 100 * g.lv; say('COMBO ' + g.combo + '  +' + (100 * g.lv), 60); }
        fx(x, SURF - 10, art.s('SPARK'), 1, 12);
        if (g.caught >= C_NEED(g.lv)) {
          g.lv++; g.caught = 0; AU.sfx('catch_level');
          say('LEVEL ' + g.lv + (g.lv >= 3 ? '  ZIGZAG!' : '  FASTER!'), 120);
        }
        continue;
      }
      if (y > FLOOR_Y - 4) {
        g.items.splice(i, 1);
        if (it.type === 'STAR' || it.type === 'GOLD') {
          g.miss++; g.combo = 0; AU.sfx('catch_miss');
          fx(x, FLOOR_Y - 8, art.s('POOF'), 1, 12);
          if (g.miss >= C_MISS) { if (loseLife('TOO MANY MISSES')) return; }
        }
      }
    }
  }

  /* ================= 頂球 ================= */
  function serve(x) {
    g.balls = [{ x: (x | 0) * Q, y: (CEIL + 16) * Q, vx: 0, vy: 0 }];
    g.phase = 0; g.pend = null;
  }
  function phaseOf(t) { var p = 0; for (var i = 0; i < K_PHASES.length; i++) if (t >= K_PHASES[i].t) p = i; return p; }
  function windAt(t, ph) {
    var P = K_PHASES[ph];
    if (!P.wind) return 0;
    var c = t % 300;
    if (c < 120) return 0;
    var n = ((t / 300) | 0) % 4;
    return [1, -1, -1, 1][n] * P.wind;
  }
  function kbStep(b, wind, grav) {      // 單顆球一幀（bot 前瞻也用）
    b.vy += grav;
    b.vx += wind;
    if (b.vx > K_VXMAX) b.vx = K_VXMAX; if (b.vx < -K_VXMAX) b.vx = -K_VXMAX;
    b.x += b.vx; b.y += b.vy;
    if (b.x < FIELD_X0 * Q) { b.x = FIELD_X0 * Q; b.vx = -b.vx; }
    if (b.x > (FIELD_X1 - 8) * Q) { b.x = (FIELD_X1 - 8) * Q; b.vx = -b.vx; }
    if (b.y < CEIL * Q) { b.y = CEIL * Q; if (b.vy < 0) b.vy = -b.vy >> 1; }
  }
  function kLand(b0, grav) {             // 不計風：幾幀後落到托盤高度
    var b = { x: b0.x, y: b0.y, vx: b0.vx, vy: b0.vy }, k;
    for (k = 1; k < 400; k++) {
      var pb = (b.y >> 8) + 8;
      kbStep(b, 0, grav);
      if (b.vy > 0 && pb <= SURF && (b.y >> 8) + 8 >= SURF) break;
    }
    return k;
  }
  function spawnDelay(grav) {            // 新球從天花板靜止落下：選投放延遲 d，使落地時間與其他球的落地（含下一輪）間距最大
    var T = kLand({ x: 0, y: (SURF - 8) * Q, vx: 0, vy: -K_PHASES[g.phase].hit }, grav);
    var F = kLand({ x: 0, y: CEIL * Q, vx: 0, vy: 0 }, grav);
    var L = g.balls.map(function (q) { return kLand(q, grav); }), best = 0, bestGap = -1, d, i;
    for (d = 0; d <= Math.max(0, T - F); d += 2) {
      var gap = 999;
      for (i = 0; i < L.length; i++) {
        var x = Math.abs(((d + F - L[i]) % T + T) % T);
        gap = Math.min(gap, x, T - x);
      }
      if (gap > bestGap) { bestGap = gap; best = d; }
    }
    return Math.max(1, best);
  }
  function updateKeep() {
    var I = NES.Input, sp = I.held(BTN.B) ? C_DASH : C_SPEED;
    if (g.dropT > 0) {
      if (--g.dropT === 0) serve((g.px >> 8) + 8);
      return;
    }
    if (I.held(BTN.LEFT)) g.px -= sp;
    if (I.held(BTN.RIGHT)) g.px += sp;
    g.px = Math.max(FIELD_X0 * Q, Math.min((FIELD_X1 - 24) * Q, g.px));
    g.streak++;
    if (!g.cheated && g.streak >= GOAL_KEEP && !g.goalHit) { g.goalHit = true; say('60 SEC! STAR KEEPER!', 150); AU.sfx('catch_clear'); }
    if (g.streak > g.bestStreak) g.bestStreak = g.streak;
    var ph = phaseOf(g.streak);
    if (ph !== g.phase) { g.phase = ph; say('NOW: ' + K_PHASES[ph].name, 100); AU.sfx('catch_level'); }
    var P = K_PHASES[g.phase];
    var w = windAt(g.streak, g.phase);
    g.windWarn = (P.wind && (g.streak % 300) >= 60 && (g.streak % 300) < 120) ? 1 : 0;
    g.wind = w;
    if (g.net > 0) g.net--;
    if (g.addCd > 0) g.addCd--;
    if (g.pend && --g.pend.t <= 0) {
      g.balls.push({ x: g.pend.x * Q, y: CEIL * Q, vx: 0, vy: 0 });
      g.pend = null;
      say('NEW COMET!', 60);
    }
    var bx = g.px >> 8, i;
    for (i = 0; i < g.balls.length; i++) {
      var b = g.balls[i], pb = (b.y >> 8) + 8;
      kbStep(b, w, P.g);
      var nb = (b.y >> 8) + 8, cx = (b.x >> 8) + 4;
      if (b.vy > 0 && pb <= SURF && nb >= SURF && cx >= bx - 2 && cx <= bx + 26) {
        b.y = (SURF - 8) * Q;
        b.vy = -P.hit;
        b.vx = (cx - (bx + 12)) * 22;
        g.hits++; g.score += 10 * g.balls.length;
        AU.sfx('catch_bounce');
        fx(cx - 4, SURF - 10, art.s('SPARK'), 1, 8);
        // 新球：連續時間到了該加球、而且剛頂起一顆 ⇒ 從上方落下（與這顆錯開約半個週期）
        // fix-r6 P2-1：延後投放，讓新球的落地時間落在其他球落地時間之間最大的空檔（不再和既有的球同拍）
        if (g.balls.length + (g.pend ? 1 : 0) < P.balls && g.addCd === 0) {
          var nx = cx < 128 ? 168 + (rnd() % 40) : 40 + (rnd() % 40);
          g.pend = { t: spawnDelay(P.g), x: nx };
        }
      }
      if (g.net > 0 && nb >= FLOOR_Y && b.vy > 0) { b.y = (FLOOR_Y - 8) * Q; b.vy = -P.hit; AU.sfx('catch_spring'); }
      if ((b.y >> 8) > FLOOR_Y + 4 && g.balls.length > 1) {
        // fix-r6 P2-1 友善版：多球時掉一顆 ⇒ 只移除那顆（不扣命、連續時間不歸零），稍後再補
        g.balls.splice(i, 1); i--;
        g.lost++; g.addCd = K_ADD_CD;
        AU.sfx('catch_miss');
        fx(cx - 4, FLOOR_Y - 8, art.s('POOF'), 3, 20);
        say('COMET LOST!  KEEP GOING', 60);
        continue;
      }
      if ((b.y >> 8) > FLOOR_Y + 4) {
        // 最後一顆也掉了 ⇒ 失誤
        g.lives--;
        AU.sfx('catch_miss');
        fx(cx - 4, FLOOR_Y - 8, art.s('POOF'), 3, 20);
        if (g.streak > g.bestStreak) g.bestStreak = g.streak;
        saveBest();
        g.streak = 0; g.phase = 0; g.balls = []; g.wind = 0; g.pend = null;
        if (g.lives <= 0) { enterOver(); return; }
        say('DROPPED!  ' + g.lives + ' LEFT', 60);
        g.dropT = 60;
        return;
      }
    }
  }

  /* ================= 彈跳 ================= */
  function tileCh(map, c, r) {
    if (c < 1 || c > 30 || r < 3 || r > 27) return '.';
    return map[r][c];
  }
  function buildMap(L) {
    var map = [], r, c;
    for (r = 0; r < 30; r++) { map.push([]); for (c = 0; c < 32; c++) map[r].push('.'); }
    L.p.forEach(function (p) { for (c = p[1]; c <= p[2]; c++) map[p[0]][c] = p[3]; });
    L.gems.forEach(function (q) { if (map[q[1]][q[0]] === '.') map[q[1]][q[0]] = '*'; });
    return map;
  }
  var CH_TILE = { '=': 'PL_M', '^': 'SPRING', 'x': 'SPIKE', '~': 'CRUMB', '_': 'ICE', '*': 'GEM', 'c': 'CRACK' };
  function chTile(map, c, r) {
    var ch = map[r][c];
    if (ch === '.') return 0;
    if (ch === '=') {
      var l = map[r][c - 1] === '=' || map[r][c - 1] === '^', rr = map[r][c + 1] === '=' || map[r][c + 1] === '^';
      return art.t(!l ? 'PL_L' : (!rr ? 'PL_R' : 'PL_M'));
    }
    return art.t(CH_TILE[ch]);
  }
  function landable(ch) { return ch === '=' || ch === '^' || ch === '~' || ch === '_' || ch === 'c'; }
  function loadLevel(n) {
    g.level = n; g.cracked = {}; g.bt = 0; g.clearT = 0; g.deadT = 0;
    var L = CA.LEVELS[n], ppu = nes0.ppu;
    g.map = buildMap(L);
    CT.blank(nes0, function () {
      clearScreen(); setPals();
      frame(true);
      deco();
      var r, c;
      for (r = 4; r < 28; r++) for (c = 1; c <= 30; c++) {
        if (g.map[r][c] !== '.') { ppu.setTile(0, c, r, chTile(g.map, c, r)); ppu.setAttr(0, c >> 1, r >> 1, 1); }
      }
      var G = L.G;
      for (var q = 0; q < 4; q++) ppu.setTile(0, G[0] + (q & 1), G[1] + (q >> 1), art.t('GO' + q));
      ppu.setAttr(0, G[0] >> 1, G[1] >> 1, 2);
      drawHud();
    });
    spawnBall();
  }
  function spawnBall() {
    var S = CA.LEVELS[g.level].S;
    g.ball = { x: S[0] * 8 * Q, y: (S[1] * 8 - 40) * Q, vx: 0, vy: 0, squash: 0 };
    g.land = null;
  }
  // 純物理一幀：b = {x,y,vx,vy}，mask = 按鍵，map / cracked 依關卡。回傳事件（不改 PPU；遊戲 / 解題器共用）
  function bStep(b, mask, map, G) {
    var ev = null;
    if (mask & BTN.LEFT) { b.vx -= B_ACC; if (b.vx < -B_MAXV) b.vx = -B_MAXV; }
    else if (mask & BTN.RIGHT) { b.vx += B_ACC; if (b.vx > B_MAXV) b.vx = B_MAXV; }
    else if (b.vx > 0) b.vx = Math.max(0, b.vx - B_DEC);
    else if (b.vx < 0) b.vx = Math.min(0, b.vx + B_DEC);
    b.x += b.vx;
    if (b.x < FIELD_X0 * Q) { b.x = FIELD_X0 * Q; b.vx = 0; }
    if (b.x > (FIELD_X1 - 8) * Q) { b.x = (FIELD_X1 - 8) * Q; b.vx = 0; }
    b.vy += B_G; if (b.vy > B_MAXF) b.vy = B_MAXF;
    var pb = (b.y >> 8) + 8;
    b.y += b.vy;
    if (b.y < CEIL * Q) { b.y = CEIL * Q; if (b.vy < 0) b.vy = 0; }
    var x = b.x >> 8, y = b.y >> 8, nb = y + 8;
    if (b.vy > 0) {
      var r0 = (pb + 7) >> 3, r1 = nb >> 3;
      for (var r = r0; r <= r1; r++) {
        var top = r * 8;
        if (pb > top || nb < top) continue;
        var c0 = (x + 1) >> 3, c1 = (x + 6) >> 3, a = tileCh(map, c0, r), d = tileCh(map, c1, r);
        var hitA = landable(a), hitD = landable(d);
        if (!hitA && !hitD) continue;
        // 龜裂的碎晶：再踩一次就碎、球穿過去
        if ((a === 'c' || !hitA) && (d === 'c' || !hitD)) { ev = { shatter: true, cols: [hitA ? c0 : -1, hitD ? c1 : -1], row: r }; continue; }
        var ch = (a === '^' || d === '^') ? '^' : ((a === '_' || d === '_') ? '_' : ((hitA && a !== 'c') ? a : d));
        b.y = (top - 8) * Q;
        var hi = (mask & BTN.A) && (ch === '=' || ch === '~');
        b.vy = ch === '^' ? -V_SPRING : (ch === '_' ? -V_SOFT : (hi ? -V_SUPER : -V_NORM));
        ev = { land: ch, hi: !!hi, row: r, cols: [hitA ? c0 : -1, hitD ? c1 : -1] };
        y = b.y >> 8;
        break;
      }
    }
    // 星刺：碰到磚的下 5 px
    var bx0 = x + 1, bx1 = x + 6, by0 = y + 1, by1 = y + 7;
    for (var cc = bx0 >> 3; cc <= bx1 >> 3; cc++) for (var rr = by0 >> 3; rr <= by1 >> 3; rr++) {
      if (tileCh(map, cc, rr) === 'x' && by1 >= rr * 8 + 3) return { die: 'spike' };
      if (tileCh(map, cc, rr) === '*') { ev = ev || {}; ev.gem = ev.gem || []; ev.gem.push([cc, rr]); }
    }
    if (y > 232) return { die: 'fall' };
    var gx = G[0] * 8, gy = G[1] * 8, cxb = x + 4, cyb = y + 4;
    if (cxb >= gx && cxb < gx + 16 && cyb >= gy && cyb < gy + 16) { ev = ev || {}; ev.goal = true; }
    return ev;
  }
  function setMapTile(c, r, ch) {
    g.map[r][c] = ch;
    nes0.ppu.setTile(0, c, r, ch === '.' ? 0 : chTile(g.map, c, r));
  }
  function updateBounce() {
    var I = NES.Input, b = g.ball;
    if (g.clearT > 0) {
      if (--g.clearT === 0) {
        if (g.level + 1 >= CA.LEVELS.length) { g.allClear = true; enterOver(); }
        else loadLevel(g.level + 1);
      }
      return;
    }
    if (g.deadT > 0) {
      if (--g.deadT === 0) {
        g.lives--;
        if (g.lives <= 0) { enterOver(); return; }
        restoreCrumbs(); spawnBall();
      }
      return;
    }
    g.bt++;
    if (b.squash > 0) b.squash--;
    var ev = bStep(b, I.mask(), g.map, CA.LEVELS[g.level].G);
    g.land = null;
    if (!ev) return;
    if (ev.die) {
      g.deadT = 50; AU.sfx('catch_pop'); fx(b.x >> 8, Math.min(208, b.y >> 8), art.s('POOF'), 3, 30);
      say(ev.die === 'spike' ? 'OUCH! STAR SPIKES' : 'FELL DOWN!', 50);
      return;
    }
    if (ev.gem) ev.gem.forEach(function (q) { if (g.map[q[1]][q[0]] === '*') { setMapTile(q[0], q[1], '.'); g.gems++; g.score += 100; AU.sfx('catch_gold'); } });
    if (ev.shatter) {
      ev.cols.forEach(function (c) { if (c >= 0 && g.map[ev.row][c] === 'c') { setMapTile(c, ev.row, '.'); g.cracked[c + ',' + ev.row] = 1; } });
      AU.sfx('catch_hit');
    }
    if (ev.land) {
      g.land = ev; b.squash = 6;
      AU.sfx(ev.land === '^' ? 'catch_spring' : (ev.hi ? 'catch_spring' : 'catch_bounce'));
      ev.cols.forEach(function (c) { if (c >= 0 && g.map[ev.row][c] === '~') setMapTile(c, ev.row, 'c'); });
    }
    if (ev.goal) {
      g.clearT = 90; g.levelsCleared = Math.max(g.levelsCleared, g.level + 1);
      var bonus = Math.max(0, 3000 - g.bt * 2);
      g.score += 1000 + bonus;
      AU.sfx('catch_clear');
      say('CLEAR!  BONUS ' + (1000 + bonus), 90);
    }
  }
  function restoreCrumbs() {
    var L = CA.LEVELS[g.level], ppu = nes0.ppu;
    L.p.forEach(function (p) {
      if (p[3] !== '~') return;
      for (var c = p[1]; c <= p[2]; c++) if (g.map[p[0]][c] !== '~') { g.map[p[0]][c] = '~'; ppu.setTile(0, c, p[0], art.t('CRUMB')); }
    });
    g.cracked = {};
  }

  /* ---------------- 結束 / 續關 ---------------- */
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    saveBest();
    var nb = g.sub === 'keep' ? g.bestStreak >= bestOf('keep') && g.bestStreak > 0 : g.score >= bestOf(g.sub) && g.score > 0;
    CT.blank(nes0, function () {
      clearScreen(); setPals();
      frame(true);
      for (var c = 0; c < 32; c++) nes0.ppu.setTile(0, c, 28, art.t('FR_T'));
      nes0.ppu.fillAttr(0, 0, 14, 16, 1, 1);
      text0(g.allClear ? 10 : 11, 6, g.allClear ? 'ALL CLEAR!' : 'GAME OVER');
      text0(6, 9, MODE_NAME[g.sub]);
      if (g.sub === 'keep') {
        text0(6, 11, 'BEST KEEP  ' + sec3(g.bestStreak) + 'S' + (nb ? '  NEW!' : ''));
        text0(6, 13, 'HITS       ' + pad(g.hits, 4));
        text0(6, 15, 'RECORD     ' + sec3(bestOf('keep')) + 'S');
      } else if (g.sub === 'catch') {
        text0(6, 11, 'SCORE      ' + pad(g.score, 6) + (nb ? ' NEW!' : ''));
        text0(6, 13, 'LEVEL      ' + g.lv);
        text0(6, 15, 'RECORD     ' + pad(bestOf('catch'), 6));
      } else {
        text0(6, 11, 'SCORE      ' + pad(g.score, 6) + (nb ? ' NEW!' : ''));
        text0(6, 13, 'STAGE      ' + (g.level + 1) + ' / ' + CA.LEVELS.length);
        text0(6, 15, 'GEMS       ' + pad(g.gems, 2));
      }
      text0(6, 19, 'START  TITLE');
      if (!g.allClear) text0(6, 21, 'C/*    CONTINUE HERE');
      nes0.ppu.fillAttr(0, 1, 3, 14, 1, 3);
    });
    AU.play('catch_over');
  }
  function continueHere() {
    g.cheated = true; g.continues++; g.mode = 'play'; g.paused = false; g.msgT = 0;
    if (g.sub === 'catch') {
      g.lives = C_LIVES; g.miss = 0; g.items = []; g.dizzy = 0; buildField(); AU.play('catch_title');
      say('CONTINUE!  LEVEL ' + g.lv, 90);
    } else if (g.sub === 'keep') {
      g.lives = K_LIVES; g.streak = 0; buildField(); serve((g.px >> 8) + 8); AU.play('catch_keep');
      say('CONTINUE!', 90);
    } else {
      g.lives = B_LIVES; var keep = g.score; loadLevel(g.level); g.score = keep; AU.play('catch_keep');
      say('CONTINUE!  STAGE ' + (g.level + 1), 90);
    }
    AU.sfx('catch_level');
  }
  function doCheat() {
    if (g.mode === 'over') { if (!g.allClear) continueHere(); return; }
    if (g.mode !== 'play') return;
    g.cheated = true;
    if (g.sub === 'catch') {
      g.lives = Math.min(5, g.lives + 2); g.miss = 0;
      g.items = g.items.filter(function (it) { return it.type !== 'URCHIN'; });
      say('STAR POWER! +2 LIFE', 90);
    } else if (g.sub === 'keep') { g.lives = K_LIVES; g.net = 600; say('STAR NET 10 SEC!', 90); }
    else { g.lives = Math.min(9, g.lives + 3); say('STAR POWER! +3 LIFE', 90); }
    AU.sfx('catch_level');
  }

  /* ---------------- 主迴圈 ---------------- */
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      drawHud();
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    for (var i = g.fx.length - 1; i >= 0; i--) if (--g.fx[i].t <= 0) g.fx.splice(i, 1);
    if (g.sub === 'catch') updateCatch();
    else if (g.sub === 'keep') updateKeep();
    else updateBounce();
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0;
    function spr(x, y, tile, pal, fh, fv) {
      if (n >= 64 || y > 231 || y < -7 || x < -7 || x > 255) return;
      ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv });
    }
    var i;
    if (g.mode === 'title') {
      // 標題：波羅在大字左邊扛星籃，星星一直落進籃子
      drawBolo(spr, 12, 80 + ((g.t >> 4) & 1), 'BASK', (g.t >> 3) & 1, false);
      spr(20, 32 + ((g.t >> 1) % 40), art.s('STAR'), 1);
    } else if (g.mode === 'play') {
      if (g.sub === 'catch' || g.sub === 'keep') {
        var blink = g.sub === 'keep' && g.dropT > 0 && (g.t & 4);
        if (!blink) drawBolo(spr, g.px >> 8, PY, g.sub === 'catch' ? 'BASK' : 'TRAY', ((g.px >> 10) & 1), g.dizzy > 0 && (g.t & 2));
        if (g.sub === 'catch') {
          for (i = 0; i < g.items.length; i++) {
            var it = g.items[i];
            spr(it.x >> 8, it.y >> 8, art.s(it.type), it.type === 'URCHIN' || it.type === 'HEART' ? 2 : (it.type === 'CLOCK' ? 3 : 1));
          }
        } else {
          for (i = 0; i < g.balls.length; i++) spr(g.balls[i].x >> 8, g.balls[i].y >> 8, art.s('BALL'), 3);
          if (g.net > 0 && (g.t & 1)) { /* 星網用背景提示（HUD）；不額外佔精靈 */ }
        }
      } else if (g.ball && g.deadT === 0) {
        var b = g.ball, f = b.squash > 2 ? 'PUFF1' : (b.vy < -600 ? 'PUFF2' : 'PUFF0');
        spr(b.x >> 8, b.y >> 8, art.s(f), 3, b.vx < 0);
      }
      for (i = 0; i < g.fx.length; i++) spr(g.fx[i].x, g.fx[i].y, g.fx[i].tile, g.fx[i].pal);
    }
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
  }
  function drawBolo(spr, x, y, top, fr, dizzy) {
    var k = dizzy ? 'X' : (fr ? 'B' : 'A');
    spr(x, y - 8, art.s(top + '_L'), 0); spr(x + 8, y - 8, art.s(top + '_M'), 0); spr(x + 16, y - 8, art.s(top + '_R'), 0);
    spr(x + 4, y, art.s('BOLO_' + k + '0'), 0); spr(x + 12, y, art.s('BOLO_' + k + '1'), 0);
    spr(x + 4, y + 8, art.s('BOLO_' + k + '2'), 0); spr(x + 12, y + 8, art.s('BOLO_' + k + '3'), 0);
  }

  /* ================= 機器人 ================= */
  function botMask() {
    var B = g.bot, want = (CT.query && CT.query('mode')) || 'keep';
    B.t++;
    if (g.mode === 'title') {
      var idx = MODES.indexOf(want); if (idx < 0) idx = 1;
      if (g.sel !== idx) return (B.t % 8 === 4) ? (g.sel < idx ? BTN.DOWN : BTN.UP) : 0;
      return (B.t % 30 === 15) ? BTN.START : 0;
    }
    if (g.mode === 'over') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.sub === 'keep') return botKeep();
    if (g.sub === 'catch') return botCatch();
    return botBounce();
  }
  function moveTo(target, cur, fast) {
    var d = target - cur, m = 0;
    if (d > 2) m = BTN.RIGHT; else if (d < -2) m = BTN.LEFT;
    if (fast && (d > 12 || d < -12)) m |= BTN.B;
    return m;
  }
  function botKeep() {
    // &lag=N：人類反應延遲模型——看到的是 N 幀前的球（自己托盤位置即時知道）
    var B = g.bot;
    if (B.lag == null) B.lag = Math.max(0, parseInt((CT.query && CT.query('lag')) || '0', 10) || 0);
    var lag = B.lag;
    if (!B.hist) B.hist = [];
    B.hist.push({ streak: g.streak, balls: g.balls.map(function (q) { return { x: q.x, y: q.y, vx: q.vx, vy: q.vy }; }) });
    if (B.hist.length > lag + 1) B.hist.shift();
    if (g.dropT > 0) { B.hist = []; return 0; }
    var snap = B.hist[0];
    if (!snap.balls.length) return 0;
    var sph = phaseOf(snap.streak), P = K_PHASES[sph], best = null, i, k;
    for (i = 0; i < snap.balls.length; i++) {
      var b = { x: snap.balls[i].x, y: snap.balls[i].y, vx: snap.balls[i].vx, vy: snap.balls[i].vy };
      for (k = 1; k < 400; k++) {
        var pb = (b.y >> 8) + 8;
        kbStep(b, windAt(snap.streak + k, sph), P.g);
        var nb = (b.y >> 8) + 8;
        if (b.vy > 0 && pb <= SURF && nb >= SURF) break;
      }
      var lx = (b.x >> 8) + 4;
      if (k <= lag) continue;            // 延遲畫面裡「已經落到托盤」的球 ⇒ 已處理過、還看不到新軌跡
      if (!best || k < best.k) best = { k: k, x: lx };
    }
    if (!best) return 0;
    // 打點略偏外側 ⇒ 球被推回中央
    var off = Math.max(-9, Math.min(9, ((best.x - 128) / 7) | 0));
    var target = best.x - 12 + off;
    // 下一顆還很久 ⇒ 先回中間待命
    if (best.k - lag > 70 && snap.balls.length === 1) target = (target * 3 + 116) >> 2;
    return moveTo(target, g.px >> 8, true);
  }
  function botCatch() {
    var bx = g.px >> 8, fall = C_FALL(g.lv) >> (g.slow ? 1 : 0), best = null, i;
    for (i = 0; i < g.items.length; i++) {
      var it = g.items[i];
      if (it.type === 'URCHIN') continue;
      var t = ((SURF - 6) - (it.y >> 8)) * Q / fall;
      if (t < 0) continue;
      var x = (it.x >> 8) + (it.vx ? ((it.vx * t) >> 8) : 0);
      x = Math.max(12, Math.min(236, x));
      var reach = Math.abs(x - 8 - bx) <= t * 3.5 + 8;
      if (!reach) continue;
      var sc = t - (it.type === 'GOLD' ? 30 : 0);
      if (!best || sc < best.sc) best = { sc: sc, x: x };
    }
    var target = best ? best.x - 8 : 116;
    // 避開海膽：預測落點在星籃範圍 ⇒ 換邊
    for (i = 0; i < g.items.length; i++) {
      var u = g.items[i];
      if (u.type !== 'URCHIN') continue;
      var tu = ((SURF - 6) - (u.y >> 8)) * Q / fall;
      if (tu < 0 || tu > 30) continue;
      var ux = (u.x >> 8) + 4;
      if (ux >= target - 4 && ux <= target + 28) target = ux < 128 ? ux + 12 : ux - 36;
      if (ux >= bx - 4 && ux <= bx + 28 && tu < 14) target = ux < bx + 12 ? ux + 12 : ux - 36;
    }
    return moveTo(Math.max(8, Math.min(224, target)), bx, true);
  }
  function botBounce() {
    var B = g.bot;
    if (g.clearT > 0 || g.deadT > 0 || !g.ball) { B.plan = null; return 0; }
    if (g.land) {
      // 剛落地：計畫不存在或與預期不符 ⇒ 從目前狀態重新解題
      var b = g.ball, e = B.expect;
      if (!B.plan || !e || e.x !== b.x || e.y !== b.y || e.vx !== b.vx || e.vy !== b.vy) {
        B.plan = solveFrom({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }, g.map, g.level); B.step = 0; B.replans++;
      } else B.step++;
      B.ft = 0;
      B.expect = B.plan && B.plan[B.step] ? B.plan[B.step].end : null;
    }
    var p = B.plan && B.plan[B.step];
    if (!p) return 0;
    var m = 0;
    if (p.d && B.ft < p.h) m |= p.d < 0 ? BTN.LEFT : BTN.RIGHT;
    if (p.a) m |= BTN.A;
    B.ft++;
    return m;
  }
  // 解題器：BFS（每一跳 = 一個「方向 d 按住 h 幀後放開、下次落地是否按住 A」的方案），與遊戲同一個 bStep
  var POL = (function () {
    var out = [], d, h, a;
    for (a = 0; a < 2; a++) {
      out.push({ d: 0, h: 0, a: a });
      for (d = -1; d <= 1; d += 2) [6, 12, 20, 30, 44, 999].forEach(function (hh) { out.push({ d: d, h: hh, a: a }); });
    }
    return out;
  })();
  function cloneMap(map) { return map.map(function (r) { return r.slice(); }); }
  // 貪婪最佳優先：落點越高（row 越小）越先展開（桶佇列），同 row 依先來後到 ⇒ 幾百個節點內就爬到星門
  function solveFrom(start, map0, level, maxNodes) {
    var G = CA.LEVELS[level].G, seen = {}, buckets = [], nodes = 0, r0;
    function push(nd, row) { (buckets[row] = buckets[row] || []).push(nd); }
    function pop() {
      for (var r = 0; r < buckets.length; r++) if (buckets[r] && buckets[r].length) return buckets[r].shift();
      return null;
    }
    push({ s: start, map: map0, path: [] }, ((start.y >> 8) + 8) >> 3);
    maxNodes = maxNodes || 4000;
    var nd;
    while ((nd = pop()) && nodes < maxNodes) {
      nodes++;
      for (var pi = 0; pi < POL.length; pi++) {
        var P = POL[pi], b = { x: nd.s.x, y: nd.s.y, vx: nd.s.vx, vy: nd.s.vy }, map = nd.map, own = false, res = null, row = 0;
        for (var f = 0; f < 360; f++) {
          var m = (P.d && f < P.h ? (P.d < 0 ? BTN.LEFT : BTN.RIGHT) : 0) | (P.a ? BTN.A : 0);
          var ev = bStep(b, m, map, G);
          if (!ev) continue;
          if (ev.die) { res = null; break; }
          if (ev.goal) { res = 'goal'; break; }
          if (ev.shatter) {
            if (!own) { map = cloneMap(map); own = true; }
            ev.cols.forEach(function (c) { if (c >= 0 && map[ev.row][c] === 'c') map[ev.row][c] = '.'; });
          }
          if (ev.land) {
            if (!own) { map = cloneMap(map); own = true; }
            ev.cols.forEach(function (c) { if (c >= 0 && map[ev.row][c] === '~') map[ev.row][c] = 'c'; });
            res = 'land'; row = ev.row; break;
          }
        }
        if (!res) continue;
        var step = { d: P.d, h: P.h, a: P.a, end: { x: b.x, y: b.y, vx: b.vx, vy: b.vy } };
        if (res === 'goal') { CA.dev.lastNodes = nodes; return nd.path.concat([step]); }
        var cr = '';
        if (own) for (r0 = 4; r0 < 28; r0++) for (var c = 1; c <= 30; c++) if (map[r0][c] === 'c' || (map0[r0][c] === '~' && map[r0][c] === '.')) cr += c + ':' + r0 + map[r0][c];
        var key = (b.x >> 10) + ',' + row + ',' + (b.vx >> 7) + ',' + b.vy + '|' + cr;
        if (seen[key]) continue;
        seen[key] = 1;
        push({ s: step.end, map: map, path: nd.path.concat([step]) }, row);
      }
    }
    CA.dev.lastNodes = nodes;
    return null;
  }
  // 從關卡開頭（出生落下 → 第一次落地）解題：給測試驗證 6 關都能通關
  function solveLevel(n) {
    var L = CA.LEVELS[n], map = buildMap(L), S = L.S, b = { x: S[0] * 8 * Q, y: (S[1] * 8 - 40) * Q, vx: 0, vy: 0 }, ev = null;
    for (var f = 0; f < 200; f++) { ev = bStep(b, 0, map, L.G); if (ev && (ev.land || ev.die)) break; }
    if (!ev || !ev.land) return null;
    if (ev.land === '~') ev.cols.forEach(function (c) { if (c >= 0) map[ev.row][c] = 'c'; });
    return solveFrom({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }, map, n, 8000);
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'catch', order: 5, title: '星塵接球', legacy: ['ball-catch.html', 'bouncing-ball.html', 'ball-bounce.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = CA.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'catch_bg');
      NES.CHR.setPattern(1, 'catch_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      AU.init(nes);
      g = newState();
      GAME.backTile = { tile: art.s('SOLID'), pal: 1 };     // §6-4：實心星塊
      var qm = CT.query ? CT.query('mode') : null, qi = MODES.indexOf(qm);
      if (qi >= 0) g.sel = qi;
      enterTitle();
      var lv = CT.query ? parseInt(CT.query('stage') || '', 10) : NaN;
      if (lv >= 1 && lv <= CA.LEVELS.length) { startMode('bounce'); loadLevel(lv - 1); }
    },
    update: function (nes) {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.UP)) { g.sel = (g.sel + 2) % 3; drawMenu(); AU.sfx('catch_hit'); }
        if (I.pressed(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START))) { g.sel = (g.sel + 1) % 3; drawMenu(); AU.sfx('catch_hit'); }
        if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) startMode(MODES[g.sel]);
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'play' && !g.paused) drawHud();
      if (g.mode === 'title' && (g.t & 31) === 0) hud(25, 3, (g.t & 32) ? '        ' : 'START GO');
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, sub: g.sub, sel: g.sel, paused: g.paused, score: g.score, lives: g.lives,
        lv: g.lv, caught: g.caught, miss: g.miss, items: g.items.length,
        streak: g.streak, bestStreak: g.bestStreak, balls: g.balls.length, phase: g.phase, wind: g.wind, hits: g.hits,
        level: g.level, gems: g.gems, levelsCleared: g.levelsCleared, allClear: !!g.allClear,
        lost: g.lost, addCd: g.addCd,
        cheated: g.cheated, continues: g.continues, goal: !!(g.goalHit && !g.cheated), replans: g.bot.replans
      };
    },
    exit: function () { saveBest(); AU.stop(); },           // §6-3
    cheat: function () { if (!g || g.mode === 'title') return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () {                                   // §1-6：右對齊 6 字元（頂球最佳連續秒數）
      var s = secs(CT.load('catch', 'best', 0)) + 'S';
      while (s.length < 6) s = ' ' + s;
      return s;
    }
  };
  CA.GOAL_KEEP = GOAL_KEEP;
  CA.K_PHASES = K_PHASES;
  CA.dev = {
    g: function () { return g; },
    start: function (m) { startMode(m); },
    load: function (n) { loadLevel(n); },
    bStep: bStep, buildMap: buildMap, solveLevel: solveLevel, phaseOf: phaseOf,
    consts: { V_NORM: V_NORM, V_SUPER: V_SUPER, V_SPRING: V_SPRING, V_SOFT: V_SOFT, SURF: SURF, PY: PY }
  };
  if (CT.register) CT.register(GAME);
})();
