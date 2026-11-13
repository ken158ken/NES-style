/*
 * games/cart2/slash/main.js — 《星塵忍者斬 STAR BLADE》（主角：小忍者「星丸」）（合輯卡帶二 槽 1，id = slash）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-1 cart2-blade（R6）｜ 依賴：slash/art.js、slash/song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/ninja-slice.html（只取「東西拋上來、斬開、別碰炸彈、連斬」玩法；
 *   主角 / 拋出物 / 場景 / 魔王 / 曲子全部原創——拋出物是星礦、機械蟲、符咒、硬殼晶球、雷核、御守，沒有水果）
 *
 * 操作：←→ 移動、B 跳、A 斬（方向決定招式）：
 *   A（或 A+←→）= 橫斬（面向方向前方一大片）   A+↑ = 昇空斬（往上躍起，頭上一大片）
 *   A+↓ = 下劈（空中：向下急墜劈；地上：貼地橫掃前後）       START = 暫停
 * 規則：從地裡拋上來的東西掉回地面前斬掉，漏掉一個扣 1 心；斬到雷核扣 1 心（不斬它就沒事）；
 *   硬殼要斬兩次（第一刀裂開並彈起）；御守 = 回 1 心。連斬（120 幀內接下一刀）倍率 ×1~×10；一刀斬多個有額外獎勵。
 * 關卡（每關斬滿配額過關，過關回 2 心）：
 *   1 BAMBOO DUSK  竹林暮色    配額 12  同屏 2  星礦 / 機械蟲
 *   2 MOON BRIDGE  月橋        配額 16  同屏 2  + 符咒、雷核
 *   3 CRYSTAL MINE 晶礦坑      配額 20  同屏 3  + 硬殼、御守
 *   4 STORM ROOF   風暴屋脊    配額 24  同屏 3  重力更大、側風
 *   5 STAR GATE    星門        配額 28  同屏 3  齊射（一次兩個）、雷核更多
 *   6 IRON LANTERN 魔王鐵燈籠  HP 12：左右巡航、投雷核（落地爆炸，要躲）、放機械蟲、俯衝開眼（斬眼睛才有傷害）
 *
 * 每線 ≤ 8 精靈（設計保證）：主角 16 寬 = 2；拋出物（含斬開的兩半、爆炸）每個 16 寬 = 2，同屏上限 3 ⇒ 2 + 6 = 8；
 *   魔王關：魔王 32 寬 = 4 + 主角 2 + 拋出物上限 1（2）= 8。斬擊弧光 / 火花是裝飾，走逐線配額器排在最後，
 *   滿了就不畫（stat.dropFx）；主體被擋的次數記在 stat.dropMain（設計上恆為 0，測試與機器人逐幀量）。
 *   遊戲精靈全在 y ≥ 32（HUD 下方）⇒ 回選單提示（OAM 62/63，y16）那一帶只有提示自己。
 * VBlank：換關 / 標題 / 結算整片重畫一律在 CT.blank 內；平時只寫 HUD 有變的磚（≤ 60 byte）+ 開場字幕（≤ 52 byte）。
 * 密技（C / ★）：遊玩中 = 心補滿 + 場上雷核全消；GAME OVER = 原地續關（同一關、保留分數與已斬數、心補滿）；
 *   標題 / 結局無效；用過密技的那一局 goal() 一律 false。goal = 同一局連過 3 關且未用密技。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SL = CT.Slash = CT.Slash || {};
  var AU = SL.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var GROUND = 176;                  // 主角站地時的上緣 y（16 高 ⇒ 腳底 191；地面磚 row 24 = y192）
  var LAUNCH_Y = 208, MISS_Y = 214;  // 拋出點（地面下）/ 掉回這條線以下 = 漏掉
  var TOP_Y = 40;                    // 拋物線頂點下限（HUD 下方）
  var PG = 64, JUMP_V = -1536, RISE_V = -1300, DIVE_V = 1536, PMAXFALL = 1536;
  var SPEED = 2;
  var MAX_HEARTS = 5, COMBO_T = 120, GOAL_STAGES = 3;
  var SW = {                         // 招式：總長 / 有效幀
    H: { dur: 14, a0: 1, a1: 7 },
    U: { dur: 18, a0: 1, a1: 13 },
    D: { dur: 16, a0: 1, a1: 11 }
  };
  var PTS = { ORE: 10, BEETLE: 20, TALI: 30, SHELL: 50, CHARM: 0, SPARKB: 20 };
  var STAGES = [
    { name: 'BAMBOO DUSK', quota: 12, alive: 2, every: 84, grav: 22, apex: [72, 124], wind: 0, salvo: 0,
      mix: { ORE: 65, BEETLE: 35 }, decor: 'bamboo', bd: 0x01, p0: [0x17, 0x28, 0x38], p1: [0x0C, 0x1A, 0x2A], p2: [0x07, 0x17, 0x27] },
    { name: 'MOON BRIDGE', quota: 16, alive: 2, every: 72, grav: 24, apex: [64, 120], wind: 0, salvo: 0,
      mix: { ORE: 40, BEETLE: 28, TALI: 18, BOMB: 14 }, decor: 'bridge', bd: 0x0C, p0: [0x00, 0x2C, 0x30], p1: [0x0F, 0x06, 0x16], p2: [0x08, 0x18, 0x28] },
    { name: 'CRYSTAL MINE', quota: 20, alive: 3, every: 62, grav: 26, apex: [60, 116], wind: 0, salvo: 0,
      mix: { ORE: 30, BEETLE: 22, TALI: 14, SHELL: 16, BOMB: 18 }, decor: 'crystal', bd: 0x0F, p0: [0x03, 0x13, 0x33], p1: [0x02, 0x1C, 0x3C], p2: [0x00, 0x10, 0x2D] },
    { name: 'STORM ROOF', quota: 24, alive: 3, every: 54, grav: 30, apex: [56, 112], wind: 1, salvo: 0,
      mix: { ORE: 26, BEETLE: 22, TALI: 14, SHELL: 16, BOMB: 22 }, decor: 'roof', bd: 0x2D, p0: [0x00, 0x10, 0x30], p1: [0x0F, 0x03, 0x13], p2: [0x0F, 0x00, 0x10] },
    { name: 'STAR GATE', quota: 28, alive: 3, every: 48, grav: 34, apex: [52, 108], wind: 0, salvo: 1,
      mix: { ORE: 24, BEETLE: 20, TALI: 14, SHELL: 16, BOMB: 26 }, decor: 'gate', bd: 0x03, p0: [0x14, 0x24, 0x38], p1: [0x0F, 0x15, 0x35], p2: [0x0F, 0x04, 0x14] },
    { name: 'IRON LANTERN', quota: 0, alive: 1, every: 0, grav: 26, apex: [80, 120], wind: 0, salvo: 0, boss: true,
      mix: { BEETLE: 100 }, decor: 'castle', bd: 0x0F, p0: [0x05, 0x16, 0x27], p1: [0x0F, 0x05, 0x15], p2: [0x00, 0x05, 0x15] }
  ];
  var BOSS_HP = 12;
  var PAL_HUD = [0x0F, 0x27, 0x30];   // 色 1 = 黑底帶、3 = 白字
  var PAL_NINJA = [0x01, 0x13, 0x27], PAL_FX = [0x11, 0x21, 0x30], PAL_GOLD = [0x07, 0x28, 0x38], PAL_RED = [0x05, 0x16, 0x37];
  var PAL_OF = { ORE: 2, BEETLE: 1, TALI: 3, SHELL: 1, BOMB: 3, CHARM: 3, SPARKB: 2 };
  var TILE_OF = { ORE: 'ORE', BEETLE: 'BEETLE', TALI: 'TALI0', SHELL: 'SHELL', BOMB: 'BOMB', CHARM: 'CHARM', SPARKB: 'BEETLE' };

  var art = null, nes0 = null, g = null;

  function newState() {
    return {
      mode: 'title', t: 0, runs: 0, paused: false,
      stage: 0, score: 0, hearts: MAX_HEARTS, combo: 0, comboT: 0, maxCombo: 0, sliced: 0, cleared: 0,
      px: 120, py: GROUND * Q, vy: 0, face: 1, ground: true, walkT: 0, hurtT: 0, inv: 0,
      sw: null, swId: 0, swQueue: null, objs: [], spawnT: 60, seed: 4242, spawned: 0,
      boss: null, fx: [], bn: {}, flash: 0, msg: '', msgT: 0, hud: [], banner: false, modeT: 0,
      cheated: false, cheatReq: false, continues: 0, goalHit: false, newBest: false, sprUsed: 0,
      stat: { dropMain: 0, dropFx: 0, cuts: 0, misses: 0, bombs: 0, multi: 0, maxLine: 0 }, bot: { t: 0 }
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s.substring(s.length - w); }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function isqrt(n) { return Math.floor(Math.sqrt(Math.max(0, n))); }

  /* ============================================================ 背景 */
  function text0(col, row, s) {
    var t = art.text(s);
    for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]);
  }
  function hash(c, r) { return (((c + 7) * 2654435761) ^ ((r + 3) * 40503)) >>> 0; }
  function skyTile(c, r) {           // 第 5..15 列：星空 + 月
    var S = STAGES[g.stage];
    if (S.decor !== 'crystal' && c >= 22 && c < 26 && r >= 6 && r < 10) return art.t('MOON' + (r - 6) + (c - 22));
    var h = hash(c, r) % 37;
    return h === 3 ? art.t('ST1') : (h === 11 || h === 23) ? art.t('ST2') : h === 17 ? art.t('ST3') : 0;
  }
  function ridgeH(c) { var x = c + g.stage * 5; return 2 + ((((x * 3) % 7) + ((x * 5) % 11)) >> 2) % 4; }
  function silTile(c, r) {           // 第 16..23 列：遠山稜線 + 各關剪影
    var S = STAGES[g.stage], d = S.decor;
    if (d === 'bamboo' && (c % 4 === 1)) {
      if (r === 16 + (c % 3)) return art.t('LEAF');
      if (r > 16 + (c % 3)) return art.t((r + c) % 3 === 0 ? 'BAMBOO_L' : 'BAMBOO');
    }
    if (d === 'bridge') {
      if (r === 20) return art.t('RAIL');
      if (r > 20 && c % 8 === 3) return art.t('POST');
      if (r === 21 && c % 8 === 4) return art.t('ARCH_L');
      if (r === 21 && c % 8 === 2) return art.t('ARCH_R');
    }
    if (d === 'crystal') {
      var hc = hash(c, 99) % 5;
      if (r === 23 && hc < 3) return art.t(hc === 0 ? 'CRY_A' : 'CRY_B');
      if (r === 22 && hc === 0) return art.t('CRY_A');
    }
    if (d === 'roof' || d === 'castle') {
      var b = (c % 10), top = d === 'castle' ? 18 : 19;
      if (b >= 2 && b <= 7) {
        if (r === top) return art.t(b === 2 ? 'EAVE_L' : b === 7 ? 'EAVE_R' : 'EAVE_M');
        if (r > top) return art.t((b === 4 || b === 5) && r === top + 2 ? 'WIN' : 'WALL');
      }
    }
    if (d === 'gate') {
      var gc = c % 12;
      if (gc >= 5 && gc <= 6 && r >= 17 && r <= 18) return art.t('RING_' + 'ABCD'.charAt((gc - 5) + (r - 17) * 2));
    }
    var h = ridgeH(c), top0 = 24 - h;
    if (r < top0) return 0;
    if (r === top0) {
      var hl = ridgeH(c - 1), hr = ridgeH(c + 1);
      if (hl < h && hr < h) return art.t('RG_TOP');
      if (hl < h) return art.t('RG_UP');
      if (hr < h) return art.t('RG_DN');
    }
    return art.t('SOLID1');
  }
  function groundTile(c, r) { return r === 24 ? art.t('TILE_TOP') : art.t(((c + r) & 1) ? 'TILE_A' : 'TILE_B'); }
  function stageTile(c, r) {
    if (r <= 3) return art.t('SOLID1');
    if (r === 4) return art.t('FR_H');
    if (r <= 15) return skyTile(c, r);
    if (r <= 23) return silTile(c, r);
    return groundTile(c, r);
  }
  function setStagePal(s) {
    var S = STAGES[s], ppu = nes0.ppu;
    ppu.setBackdrop(S.bd);
    ppu.setBgPalette(0, S.p0); ppu.setBgPalette(1, S.p1); ppu.setBgPalette(2, S.p2); ppu.setBgPalette(3, PAL_HUD);
  }
  function drawStageBG() {
    var ppu = nes0.ppu, c, r;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    setStagePal(g.stage);
    for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) ppu.setTile(0, c, r, stageTile(c, r));
    ppu.fillAttr(0, 0, 0, 16, 2, 3);
    ppu.fillAttr(0, 0, 2, 16, 6, 0);
    ppu.fillAttr(0, 0, 8, 16, 4, 1);
    ppu.fillAttr(0, 0, 12, 16, 3, 2);
    g.hud = []; g.bn = {};
  }
  function screenFrame() {           // 標題 / 結算 / 結局共用底
    var ppu = nes0.ppu, c;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(3, [0x01, 0x27, 0x30]);
    ppu.setBgPalette(0, [0x11, 0x27, 0x37]);
    for (c = 2; c < 30; c++) { ppu.setTile(0, c, 3, art.t('FR_H')); ppu.setTile(0, c, 27, art.t('FR_H')); }
    clearSpr();
  }

  /* ============================================================ HUD */
  function hudPut(row, col, s) {
    var t = art.hud(s), i, k;
    for (i = 0; i < t.length; i++) {
      k = row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      nes0.ppu.setTile(0, col + i, row, t[i]);
    }
  }
  function heartsStr() { var s = '', i; for (i = 0; i < MAX_HEARTS; i++) s += i < g.hearts ? '<' : ' '; return s; }
  function drawHud() {
    hudPut(1, 1, 'SCORE ' + pad(g.score, 6) + '  STAGE ' + (g.stage + 1) + '  ' + heartsStr());
    var S = STAGES[g.stage], l2;
    if (S.boss) {
      var b = g.boss, n = b ? Math.ceil(b.hp * 10 / BOSS_HP) : 0, bar = '';
      for (var i = 0; i < 10; i++) bar += i < n ? '=' : '.';
      l2 = 'COMBO x' + pad(Math.min(99, g.combo), 2) + '  LANTERN ' + bar;
    } else l2 = 'COMBO x' + pad(Math.min(99, g.combo), 2) + '     SLICE ' + pad(Math.min(99, g.sliced), 2) + '/' + pad(S.quota, 2);
    hudPut(2, 1, padR(l2, 30));
    var l3;
    if (g.paused) l3 = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) l3 = g.msg;
    else l3 = '';
    hudPut(3, 1, padR(l3, 30));
  }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }
  // 開場字幕（第 11 / 13 列）；收掉時把星空磚寫回去
  // 只寫跟目前名稱表不同的磚（g.bn 快取；drawStageBG 時清空）
  function bannerRow(row, s) {
    var t = s ? art.text(s) : [], c0 = 16 - (t.length >> 1), c, want, k;
    for (c = 2; c < 30; c++) {
      want = (c >= c0 && c < c0 + t.length) ? t[c - c0] : skyTile(c, row);
      k = row * 32 + c;
      if (g.bn[k] === undefined) g.bn[k] = skyTile(c, row);
      if (g.bn[k] === want) continue;
      g.bn[k] = want; nes0.ppu.setTile(0, c, row, want);
    }
  }
  function banner(l1, l2) { bannerRow(11, l1); bannerRow(13, l2); g.banner = true; }
  function unbanner() { if (!g.banner) return; bannerRow(11, ''); bannerRow(13, ''); g.banner = false; }

  /* ============================================================ 畫面切換 */
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function enterTitle() {
    g.mode = 'title'; g.t = 0;
    CT.blank(nes0, function () {
      screenFrame();
      var w = 'STAR BLADE', x = 6, i;
      for (i = 0; i < w.length; i++) {
        if (w.charAt(i) !== ' ') {
          var t = art.big(w.charAt(i));
          nes0.ppu.setTile(0, x, 5, t[0]); nes0.ppu.setTile(0, x + 1, 5, t[1]); nes0.ppu.setTile(0, x, 6, t[2]); nes0.ppu.setTile(0, x + 1, 6, t[3]);
        }
        x += 2;
      }
      nes0.ppu.fillAttr(0, 0, 2, 16, 2, 0);
      text0(9, 8, 'STARDUST NINJA');
      // §6-6：段落之間空一列
      text0(3, 11, 'LEFT/RIGHT MOVE   B JUMP');
      text0(3, 13, 'A SLASH +UP RISE +DOWN CLEAVE');
      text0(3, 15, 'CUT ORE, BUGS, CHARMS IN AIR');
      text0(3, 17, 'NEVER CUT BOMBS  SHELL=2 CUTS');
      text0(3, 19, 'HOLD START+SELECT: MENU');
      text0(3, 21, 'C/* = CHEAT   START = PAUSE');
      text0(3, 23, 'BEST ' + pad(CT.load('slash', 'best', 0), 6));
    });
    AU.play('slash_title');
  }
  function startRun() {
    var runs = g.runs + 1, bot = g.bot;
    g = newState();
    g.runs = runs; g.bot = bot; g.seed = 4242 + runs * 7919;
    var js = CT.query ? parseInt(CT.query('stage') || '', 10) : NaN;
    beginStage(js >= 1 && js <= STAGES.length ? js - 1 : 0);
  }
  function beginStage(s) {
    g.stage = s; g.mode = 'intro'; g.modeT = 0; g.sliced = g.sliced || 0;
    g.objs = []; g.fx = []; g.sw = null; g.swQueue = null; g.hurtT = 0; g.inv = 0;
    g.px = 120; g.py = GROUND * Q; g.vy = 0; g.ground = true; g.spawnT = 50; g.paused = false;
    g.boss = STAGES[s].boss ? { x: 112, y: -32, hp: BOSS_HP, st: 'enter', t: 0, dir: 1, flash: 0, atk: 0, hitSw: -1 } : null;
    CT.blank(nes0, function () {
      clearSpr();
      drawStageBG();
      var S = STAGES[s];
      banner('STAGE ' + (s + 1) + '  ' + S.name, S.boss ? 'STRIKE ITS EYE!' : 'SLICE ' + S.quota);
      drawHud();
    });
    AU.play(STAGES[s].boss ? 'slash_boss' : 'slash_stage');
  }
  function saveBest() {
    if (!g) return false;
    var best = CT.load('slash', 'best', 0);
    if (g.score > best) { CT.save('slash', 'best', g.score); return true; }
    return false;
  }
  function enterOver() {
    g.mode = 'over'; g.modeT = 0;
    var best = CT.load('slash', 'best', 0);
    g.newBest = saveBest();
    CT.blank(nes0, function () {
      screenFrame();
      text0(11, 6, 'GAME OVER');
      text0(8, 9, 'SCORE   ' + pad(g.score, 6) + (g.newBest ? ' NEW!' : ''));
      text0(8, 11, 'BEST    ' + pad(Math.max(best, g.score), 6));
      text0(8, 13, 'STAGE   ' + (g.stage + 1) + ' ' + STAGES[g.stage].name);
      text0(8, 15, 'COMBO   ' + pad(g.maxCombo, 2));
      text0(5, 19, 'C/* = CONTINUE THIS STAGE');
      text0(11, 22, 'PUSH START');
    });
    AU.play('slash_over');
  }
  function enterEnding() {
    g.mode = 'ending'; g.modeT = 0;
    g.newBest = saveBest();
    CT.blank(nes0, function () {
      screenFrame();
      text0(8, 6, 'ALL STAGES CLEAR!');
      text0(5, 9, 'THE IRON LANTERN FELL AND');
      text0(5, 11, 'THE STARDUST SKY IS CALM.');
      text0(8, 14, 'SCORE   ' + pad(g.score, 6) + (g.newBest ? ' NEW!' : ''));
      text0(8, 16, 'COMBO   ' + pad(g.maxCombo, 2));
      text0(8, 18, 'CONTINUES ' + g.continues);
      text0(11, 22, 'PUSH START');
    });
    AU.play('slash_clear');
  }
  // 密技續關（§6-1）：GAME OVER / 倒下中 ⇒ 回同一關、保留分數與已斬數、心補滿
  function continueRun() {
    var s = g.stage, keep = g.sliced;
    g.hearts = MAX_HEARTS; g.cheated = true; g.continues++; g.combo = 0; g.comboT = 0;
    beginStage(s);
    g.sliced = keep;
    g.modeT = 40;          // 開場字幕縮短
    drawHudSafe();
  }
  function drawHudSafe() { CT.blank(nes0, function () { drawHud(); }); }

  /* ============================================================ 拋出物 */
  function pickType(S) {
    var tot = 0, k, r;
    var bombs = 0, i;
    for (i = 0; i < g.objs.length; i++) if (g.objs[i].k === 'BOMB' && g.objs[i].st === 'fly') bombs++;
    if (g.stage >= 2 && g.hearts < MAX_HEARTS && rnd() % 100 < 6) return 'CHARM';
    for (k in S.mix) tot += S.mix[k];
    for (;;) {
      r = rnd() % tot;
      for (k in S.mix) { if (r < S.mix[k]) break; r -= S.mix[k]; }
      if (k === 'BOMB' && bombs >= (S.salvo ? 2 : 1)) continue;
      return k;
    }
  }
  function launch(k, x, apex, tx) {
    var S = STAGES[g.stage], gr = k === 'TALI' ? (S.grav >> 1) : S.grav;
    var h = LAUNCH_Y - Math.max(TOP_Y, apex);
    var vy = -isqrt(2 * gr * h * Q);
    var T = Math.max(1, ((-2 * vy) / gr) | 0);
    var vx = Math.round(((tx - x) * Q) / T);
    if (vx > Q) vx = Q; if (vx < -Q) vx = -Q;
    var o = { k: k, x: x * Q, y: LAUNCH_Y * Q, vx: vx, vy: vy, gr: gr, hp: k === 'SHELL' ? 2 : 1, st: 'fly', t: 0,
              hitSw: -1, wob: (rnd() & 63), cut: 0 };
    g.objs.push(o); g.spawned++;
    return o;
  }
  function spawn() {
    var S = STAGES[g.stage];
    if (S.boss) return;
    if (g.sliced >= S.quota) return;
    if (--g.spawnT > 0) return;
    var n = 1 + (S.salvo && rnd() % 3 === 0 ? 1 : 0);
    for (var i = 0; i < n && g.objs.length < S.alive; i++) {
      var k = pickType(S), x = 24 + rnd() % 192, apex = S.apex[0] + rnd() % (S.apex[1] - S.apex[0] + 1);
      var tx = 24 + rnd() % 192;
      launch(k, x, apex, tx);
    }
    g.spawnT = S.every + (rnd() % 24) - 12;
  }
  // 物件一幀（update 與機器人預測共用，純函式：輸入 {x,y,vx,vy,gr,k,wob,t} 輸出下一幀）
  function stepObj(o, t) {
    var S = STAGES[g.stage], wx = 0;
    if (o.k === 'BEETLE' || o.k === 'SPARKB') { var ph = (o.wob + t) & 63; wx = ph < 32 ? 64 : -64; }
    if (S.wind) wx += (((g.t + t) >> 7) & 1) ? 40 : -40;
    var vy = o.vy + o.gr;
    if (o.k === 'TALI' && vy > 640) vy = 640;
    var x = o.x + o.vx + wx, vx = o.vx;
    if (x < 8 * Q && vx + wx < 0) { vx = -vx; x = 8 * Q; }
    if (x > 232 * Q && vx + wx > 0) { vx = -vx; x = 232 * Q; }
    return { x: x, y: o.y + vy, vx: vx, vy: vy };
  }
  function objBox(o) { return { x: (o.x >> 8) + 2, y: (o.y >> 8) + 2, w: 12, h: 12 }; }
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  function addScore(n) { g.score = Math.min(999999, g.score + n); }
  function hitObj(o, swId) {
    o.hitSw = swId;
    if (o.k === 'BOMB') {
      o.st = 'boom'; o.t = 0; o.vx = 0; o.vy = 0;
      g.stat.bombs++;
      hurt('BOMB! -1');
      AU.sfx('slash_boom');
      return 0;
    }
    if (o.k === 'SHELL' && o.hp > 1) {
      o.hp--; o.vy = Math.min(o.vy, -900); o.vx = -o.vx;
      addScore(10);
      AU.sfx('slash_clang');
      fx(o.x >> 8, o.y >> 8, 'SPARK2', 10);
      return 0;
    }
    o.st = 'cut'; o.t = 0; o.cut = 0;
    if (o.k === 'CHARM') {
      g.hearts = Math.min(MAX_HEARTS, g.hearts + 1);
      AU.sfx('slash_heal'); say('CHARM! +1 HEART', 60);
      return 1;
    }
    g.combo++; g.comboT = COMBO_T;
    if (g.combo > g.maxCombo) g.maxCombo = g.combo;
    addScore(PTS[o.k] * Math.min(10, g.combo));
    if (o.k !== 'SPARKB') g.sliced++;
    g.stat.cuts++;
    AU.sfx(g.combo >= 5 && g.combo % 5 === 0 ? 'slash_combo' : 'slash_cut');
    return 1;
  }
  function hurt(msg) {
    if (g.inv > 0) return;
    g.hearts--; g.combo = 0; g.comboT = 0; g.hurtT = 36; g.inv = 50;
    say(msg, 70);
    AU.sfx('slash_hit');
    g.flash = 6;
  }
  function missObj(o) {
    if (o.k === 'BOMB' || o.k === 'CHARM' || o.k === 'SPARKB') return;
    g.stat.misses++;
    g.hearts--; g.combo = 0; g.comboT = 0;
    say('MISSED! -1', 60);
    AU.sfx('slash_miss');
  }
  function updateObjs() {
    var i, o, n;
    for (i = g.objs.length - 1; i >= 0; i--) {
      o = g.objs[i]; o.t++;
      if (o.st === 'fly') {
        n = stepObj(o, 0);
        o.x = n.x; o.y = n.y; o.vx = n.vx; o.vy = n.vy;
        if (o.vy > 0 && (o.y >> 8) > MISS_Y) { g.objs.splice(i, 1); missObj(o); continue; }
        if (o.k === 'BOMB' && g.boss && o.vy > 0 && (o.y >> 8) >= GROUND) {   // 魔王投下的雷核落地爆炸
          o.st = 'boom'; o.t = 0; o.vy = 0; o.y = GROUND * Q; AU.sfx('slash_boom');
          if (Math.abs((o.x >> 8) - g.px) < 22 && (g.py >> 8) > GROUND - 20) hurt('BLAST! -1');
        }
      } else if (o.st === 'cut') {
        o.cut += 2; o.y += 128 + o.t * 12;
        if (o.t > 24) g.objs.splice(i, 1);
      } else if (o.st === 'boom') {
        if (o.t > 20) g.objs.splice(i, 1);
      }
    }
  }

  /* ============================================================ 主角 / 斬擊 */
  function hitbox(type, px, py, face, ground) {
    if (type === 'H') return face > 0 ? { x: px + 8, y: py - 12, w: 40, h: 36 } : { x: px - 32, y: py - 12, w: 40, h: 36 };
    if (type === 'U') return { x: px - 12, y: py - 42, w: 40, h: 48 };
    if (ground) return { x: px - 28, y: py - 8, w: 72, h: 26 };
    return { x: px - 16, y: py + 4, w: 48, h: 38 };
  }
  function startSwing(type) {
    g.sw = { type: type, t: 0, id: ++g.swId, ground: g.ground, hits: 0 };
    if (type === 'U') { g.vy = RISE_V; g.ground = false; }
    if (type === 'D' && !g.ground) g.vy = DIVE_V;
    AU.sfx('slash_swing');
  }
  function updatePlayer() {
    var I = NES.Input, mv = 0;
    if (g.hurtT > 0) g.hurtT--;
    if (g.inv > 0) g.inv--;
    var can = g.hurtT === 0 && g.mode === 'play';
    if (can) {
      if (I.held(BTN.LEFT)) mv = -1; else if (I.held(BTN.RIGHT)) mv = 1;
      if (mv) { g.face = mv; g.px += mv * SPEED; g.walkT++; }
      if (g.px < 4) g.px = 4; if (g.px > 236) g.px = 236;
      if (I.pressed(BTN.B) && g.ground) { g.vy = JUMP_V; g.ground = false; AU.sfx('slash_jump'); }
      if (I.pressed(BTN.A)) {
        var type = I.held(BTN.UP) ? 'U' : I.held(BTN.DOWN) ? 'D' : 'H';
        if (!g.sw) startSwing(type);
        else if (g.sw.t >= SW[g.sw.type].dur - 5) g.swQueue = type;
      }
    }
    // 重力
    if (!g.ground) {
      g.vy += PG; if (g.vy > PMAXFALL) g.vy = PMAXFALL;
      g.py += g.vy;
      if ((g.py >> 8) >= GROUND) { g.py = GROUND * Q; g.vy = 0; g.ground = true; }
    }
    if (g.sw) {
      var d = SW[g.sw.type];
      g.sw.t++;
      if (g.sw.t >= d.a0 && g.sw.t <= d.a1) {
        var hb = hitbox(g.sw.type, g.px, g.py >> 8, g.face, g.ground), n = 0, i, o;
        for (i = 0; i < g.objs.length; i++) {
          o = g.objs[i];
          if (o.st !== 'fly' || o.hitSw === g.sw.id) continue;
          if (overlap(hb, objBox(o))) n += hitObj(o, g.sw.id);
        }
        if (g.boss) hitBoss(hb, g.sw.id);
        if (n > 0) {
          g.sw.hits += n;
          if (g.sw.hits >= 2) {
            g.stat.multi++;
            addScore(50 * (g.sw.hits - 1));
            say(g.sw.hits >= 3 ? 'TRIPLE CUT! +' + (50 * (g.sw.hits - 1)) : 'DOUBLE CUT! +50', 60);
          }
        }
      }
      if (g.sw.t >= d.dur) {
        g.sw = null;
        if (g.swQueue && g.hurtT === 0) { var q = g.swQueue; g.swQueue = null; startSwing(q); }
      }
    }
    if (g.comboT > 0 && --g.comboT === 0) g.combo = 0;
  }

  /* ============================================================ 魔王 */
  function coreBox(b) { return { x: b.x + 8, y: b.y + 10, w: 16, h: 14 }; }
  function bodyBox(b) { return { x: b.x + 2, y: b.y + 2, w: 28, h: 28 }; }
  function hitBoss(hb, swId) {
    var b = g.boss;
    if (!b || b.st === 'die' || b.st === 'enter' || b.hitSw === swId) return;
    if (b.st === 'open' && overlap(hb, coreBox(b))) {
      b.hitSw = swId; b.hp--; b.flash = 10;
      addScore(100 * Math.max(1, Math.min(10, ++g.combo))); g.comboT = COMBO_T;
      if (g.combo > g.maxCombo) g.maxCombo = g.combo;
      AU.sfx('slash_cut');
      fx(b.x + 12, b.y + 12, 'SPARK2', 12);
      if (b.hp <= 0) { b.st = 'die'; b.t = 0; addScore(5000); say('THE LANTERN BREAKS!', 120); AU.stop(); AU.sfx('slash_boom'); }
      else if (b.hp % 4 === 0) { b.st = 'rise'; b.t = 0; }      // 被斬幾刀就縮回去
    } else if (b.clangSw !== swId && overlap(hb, bodyBox(b))) {
      b.clangSw = swId;                 // 打到外殼只響一聲；同一刀之後碰到眼睛仍算數
      AU.sfx('slash_clang');
      fx(b.x + 12, b.y + 20, 'SPARK', 8);
    }
  }
  function updateBoss() {
    var b = g.boss;
    if (!b) return;
    b.t++;
    if (b.flash > 0) b.flash--;
    var busy = g.objs.length >= STAGES[g.stage].alive;
    if (b.st === 'enter') {
      b.y++;
      if (b.y >= 40) { b.y = 40; b.st = 'hover'; b.t = 0; }
    } else if (b.st === 'hover') {
      b.x += b.dir * (b.hp <= 6 ? 2 : 1);
      if (b.x < 16) { b.x = 16; b.dir = 1; }
      if (b.x > 208) { b.x = 208; b.dir = -1; }
      b.y = 40 + (((b.t >> 4) & 1) ? 1 : 0);
      if (b.t >= (b.hp <= 6 ? 110 : 140)) {
        var a = b.atk++ % 4;
        b.t = 0;
        if (a === 1 || a === 3) { b.st = 'dive'; }
        else if (!busy) {
          if (a === 0) { var o = launch('BOMB', b.x + 8, 999, b.x + 8); o.y = (b.y + 24) * Q; o.vy = 0; o.vx = 0; AU.sfx('slash_swing'); }
          else { launch('SPARKB', 24 + rnd() % 192, 70 + rnd() % 40, 24 + rnd() % 192); }
        }
      }
    } else if (b.st === 'dive') {
      b.y += 2;
      var tx = Math.max(16, Math.min(208, g.px - 8));
      if (b.x < tx) b.x++; else if (b.x > tx) b.x--;
      if (b.y >= 100) { b.y = 100; b.st = 'open'; b.t = 0; }
    } else if (b.st === 'open') {
      if (b.t >= 120) { b.st = 'rise'; b.t = 0; }
    } else if (b.st === 'rise') {
      b.y -= 1;
      if (b.y <= 40) { b.y = 40; b.st = 'hover'; b.t = 0; }
    } else if (b.st === 'die') {
      if (b.t % 8 === 0) { fx(b.x + (rnd() % 24), b.y + (rnd() % 24), 'SPARK2', 8); AU.sfx('slash_boom'); }
      if (b.t >= 120) { g.boss = null; stageClear(); }
    }
  }

  /* ============================================================ 效果 */
  function fx(x, y, tile, t) { if (g.fx.length < 8) g.fx.push({ x: x, y: y, tile: tile, t: t }); }
  function updateFx() { for (var i = g.fx.length - 1; i >= 0; i--) if (--g.fx[i].t <= 0) g.fx.splice(i, 1); }

  /* ============================================================ 流程 */
  function stageClear() {
    g.mode = 'clear'; g.modeT = 0; g.cleared++;
    if (!g.cheated && g.cleared >= GOAL_STAGES) g.goalHit = true;
    var bonus = g.hearts * 200;
    addScore(bonus);
    g.hearts = Math.min(MAX_HEARTS, g.hearts + 2);
    for (var i = 0; i < g.objs.length; i++) if (g.objs[i].st === 'fly') { g.objs[i].st = g.objs[i].k === 'BOMB' ? 'boom' : 'cut'; g.objs[i].t = 0; }
    banner('STAGE ' + (g.stage + 1) + ' CLEAR!', 'HEART BONUS ' + bonus);
    AU.play('slash_clear');
  }
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT) && (g.mode === 'play' || g.mode === 'intro')) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
    }
    if (g.paused) return;
    g.t++; g.modeT++;
    if (g.msgT > 0) g.msgT--;
    if (g.flash > 0) g.flash--;
    if (g.mode === 'intro') {
      updatePlayer();
      if (g.modeT >= 100) { g.mode = 'play'; g.modeT = 0; unbanner(); }
      return;
    }
    if (g.mode === 'clear') {
      updateObjs(); updateFx();
      if (g.modeT >= 150) {
        if (g.stage + 1 >= STAGES.length) enterEnding();
        else { g.sliced = 0; beginStage(g.stage + 1); }
      }
      return;
    }
    if (g.mode === 'down') {
      updateObjs(); updateFx();
      if (g.modeT >= 70) enterOver();
      return;
    }
    // play
    spawn();
    updatePlayer();
    updateObjs();
    updateBoss();
    updateFx();
    if (g.hearts <= 0) { g.hearts = 0; g.mode = 'down'; g.modeT = 0; g.sw = null; AU.stop(); AU.sfx('slash_hit'); saveBest(); return; }
    var S = STAGES[g.stage];
    if (!S.boss && g.sliced >= S.quota) stageClear();
  }

  /* ============================================================ 繪製（逐線配額器） */
  var lineCnt = new Uint8Array(240), oamN = 0;
  function spr(x, y, tile, pal, o, cosmetic) {
    if (y >= 232 || y <= -8 || x <= -8 || x >= 256) return false;
    var y0 = Math.max(0, y), y1 = Math.min(239, y + 7), yy;
    if (oamN >= 62) { if (cosmetic) g.stat.dropFx++; else g.stat.dropMain++; return false; }
    for (yy = y0; yy <= y1; yy++) if (lineCnt[yy] >= 8) { if (cosmetic) g.stat.dropFx++; else g.stat.dropMain++; return false; }
    for (yy = y0; yy <= y1; yy++) lineCnt[yy]++;
    nes0.ppu.sprite(oamN++, { x: x & 255, y: y, tile: tile, pal: pal, flipH: !!(o && o.h), flipV: !!(o && o.v), behind: !!(o && o.b) });
    return true;
  }
  function quad(x, y, name, pal, fh, opt) {
    var q = art.q(name), b = opt && opt.b;
    if (fh) { spr(x, y, q[1], pal, { h: 1, b: b }); spr(x + 8, y, q[0], pal, { h: 1, b: b }); spr(x, y + 8, q[3], pal, { h: 1, b: b }); spr(x + 8, y + 8, q[2], pal, { h: 1, b: b }); }
    else { spr(x, y, q[0], pal, { b: b }); spr(x + 8, y, q[1], pal, { b: b }); spr(x, y + 8, q[2], pal, { b: b }); spr(x + 8, y + 8, q[3], pal, { b: b }); }
  }
  function ninjaFrame() {
    if (g.mode === 'down' || g.hurtT > 0) return 'NHURT';
    if (g.sw) return g.sw.type === 'H' ? 'NSLASH' : g.sw.type === 'U' ? 'NRISE' : 'NCLEAVE';
    if (!g.ground) return 'NJUMP';
    var I = NES.Input;
    if (g.mode === 'play' && (I.held(BTN.LEFT) || I.held(BTN.RIGHT))) return ((g.walkT >> 3) & 1) ? 'NRUN1' : 'NRUN2';
    return 'NSTAND';
  }
  function drawObj(o) {
    var x = o.x >> 8, y = o.y >> 8, pal = PAL_OF[o.k], name = TILE_OF[o.k], b = y >= 186;
    if (o.k === 'TALI') name = ((o.t >> 4) & 1) ? 'TALI1' : 'TALI0';
    if (o.k === 'SHELL' && o.hp === 1) name = 'CRACK';
    if (o.st === 'boom') { quad(x, y, 'BOOM', 3, (o.t >> 2) & 1); return; }
    if (o.st === 'cut') {
      var q = art.q(name), d = o.cut;
      spr(x - d, y, q[0], pal, { b: b }); spr(x + 8 + d, y - (d >> 1), q[1], pal, { b: b });
      spr(x - d, y + 8, q[2], pal, { b: b }); spr(x + 8 + d, y + 8 - (d >> 1), q[3], pal, { b: b });
      return;
    }
    quad(x, y, name, pal, o.k === 'BEETLE' && o.vx < 0, { b: b });
  }
  function drawBoss(b) {
    if (!b) return;
    if (b.st === 'die' && (b.t & 4)) return;
    var mid = b.st === 'open' ? 'LO' : 'LS', ty, tx, name, pal;
    for (ty = 0; ty < 4; ty++) {
      var y = b.y + ty * 8;
      if (y < 0) continue;
      for (tx = 0; tx < 4; tx++) {
        if (ty === 0) name = 'LT0' + tx; else if (ty === 3) name = 'LB0' + tx; else name = mid + (ty - 1) + tx;
        pal = (b.flash & 2) ? 1 : (b.st === 'open' && ty >= 1 && ty <= 2 && tx >= 1 && tx <= 2 ? 2 : 3);
        spr(b.x + tx * 8, y, art.s(name), pal);
      }
    }
  }
  function drawSprites() {
    lineCnt.fill(0); oamN = 0;
    var i, m = g.mode;
    if (m === 'title') {
      quad(40, 58, ((g.t >> 4) & 1) ? 'NSLASH' : 'NSTAND', 0, false);
      quad(192, 58 + (((g.t >> 3) & 3) === 0 ? 1 : 0), 'ORE', 2, false);
      quad(212, 58, 'BOMB', 3, false);
    } else if (m === 'intro' || m === 'play' || m === 'clear' || m === 'down') {
      // 主角（2/線）
      var vis = !(g.inv > 0 && (g.t & 2)) || m === 'down';
      var py = g.py >> 8;
      if (vis) quad(g.px, py, ninjaFrame(), 0, g.face < 0);
      // 魔王（4/線）
      drawBoss(g.boss);
      // 拋出物（每個 2/線，同屏上限 3 / 魔王關 1）
      for (i = 0; i < g.objs.length; i++) drawObj(g.objs[i]);
      // 斬擊弧光（裝飾：配額器排最後）
      if (g.sw) {
        var d = SW[g.sw.type];
        if (g.sw.t >= d.a0 && g.sw.t <= d.a1 + 2) {
          var hb = hitbox(g.sw.type, g.px, py, g.face, g.sw.ground), q, ax, ay;
          var nm = g.sw.type === 'H' ? 'ARC_H' : g.sw.type === 'U' ? 'ARC_U' : 'ARC_D';
          q = art.q(nm);
          if (g.sw.type === 'H') { ax = g.face > 0 ? g.px + 16 : g.px - 16; ay = py; }
          else if (g.sw.type === 'U') { ax = g.px; ay = py - 16; }
          else if (g.sw.ground) { ax = g.px + g.face * 16; ay = py + 2; }
          else { ax = g.px; ay = py + 14; }
          void hb;
          var fh = g.sw.type === 'H' && g.face < 0;
          spr(ax + (fh ? 8 : 0), ay, q[0], 1, { h: fh }, true); spr(ax + (fh ? 0 : 8), ay, q[1], 1, { h: fh }, true);
          spr(ax + (fh ? 8 : 0), ay + 8, q[2], 1, { h: fh }, true); spr(ax + (fh ? 0 : 8), ay + 8, q[3], 1, { h: fh }, true);
        }
      }
      for (i = 0; i < g.fx.length; i++) spr(g.fx[i].x, g.fx[i].y, art.s(g.fx[i].tile), 1, null, true);
    }
    for (i = 0; i < 240; i++) if (lineCnt[i] > g.stat.maxLine) g.stat.maxLine = lineCnt[i];
    for (i = oamN; i < g.sprUsed; i++) nes0.ppu.sprite(i, null);
    g.sprUsed = oamN;
  }

  /* ============================================================ 機器人 */
  // 預測物件 k 幀後的位置（與 updateObjs 同一套 stepObj）
  function predict(o, k) {
    var s = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, gr: o.gr, k: o.k, wob: o.wob }, i, n;
    for (i = 0; i < k; i++) { n = stepObj(s, i); s.x = n.x; s.y = n.y; s.vx = n.vx; s.vy = n.vy; }
    return s;
  }
  function framesToY(o, yLine) {     // 下墜段到達 yLine 還要幾幀（已在線下 = 0）
    var s = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, gr: o.gr, k: o.k, wob: o.wob }, i, n;
    for (i = 0; i < 240; i++) {
      if (s.vy > 0 && (s.y >> 8) >= yLine) return i;
      n = stepObj(s, i); s.x = n.x; s.y = n.y; s.vx = n.vx; s.vy = n.vy;
    }
    return 240;
  }
  // 模擬某招式能斬到哪些物件（主角 / 物件逐幀前進，含昇空斬的上升）
  function simSwing(type, face) {
    var px = g.px, py = g.py, vy = g.vy, ground = g.ground, d = SW[type], t, i, hit = 0, bomb = 0, boss = 0, sw0 = ground;
    if (type === 'U') { vy = RISE_V; ground = false; }
    if (type === 'D' && !ground) vy = DIVE_V;
    var seen = [];
    for (t = 1; t <= d.a1; t++) {
      if (!ground) { vy += PG; if (vy > PMAXFALL) vy = PMAXFALL; py += vy; if ((py >> 8) >= GROUND) { py = GROUND * Q; vy = 0; ground = true; } }
      if (t < d.a0) continue;
      var hb = hitbox(type, px, py >> 8, face, type === 'D' ? sw0 : ground);
      var pad2 = { x: hb.x - 6, y: hb.y - 6, w: hb.w + 12, h: hb.h + 12 };
      for (i = 0; i < g.objs.length; i++) {
        var o = g.objs[i];
        if (o.st !== 'fly' || seen[i]) continue;
        var p = predict(o, t);
        var bx = objBox(p);
        if (o.k === 'BOMB') { if (overlap(pad2, bx)) { bomb++; seen[i] = 1; } }
        else if (overlap(hb, bx)) { hit += (o.k === 'SHELL' && o.hp > 1) ? 0.6 : 1; seen[i] = 1; }
      }
      if (g.boss && g.boss.st === 'open' && overlap(hb, coreBox(g.boss))) boss = 1;
    }
    return { hit: hit, bomb: bomb, boss: boss };
  }
  function botMask() {
    var B = g.bot, m = g.mode;
    B.t++;
    if (m === 'title') return (B.t % 40 === 20) ? BTN.START : 0;
    if (m === 'over' || m === 'ending') return (g.modeT > 90 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (m !== 'play' && m !== 'intro') return 0;
    var mask = 0, i, o, tgt = null, best = 1e9;
    // 目標：最快掉出畫面的可斬物件
    for (i = 0; i < g.objs.length; i++) {
      o = g.objs[i];
      if (o.st !== 'fly' || o.k === 'BOMB') continue;
      var f = framesToY(o, 150);
      if (f < best) { best = f; tgt = o; }
    }
    var want = 120;
    if (tgt) { var p = predict(tgt, Math.max(0, Math.min(60, best))); want = (p.x >> 8); }
    // 魔王
    var b = g.boss;
    if (b && (b.st === 'open' || b.st === 'dive')) { want = b.x + 8; }
    // 躲落下的雷核（魔王關）
    for (i = 0; i < g.objs.length; i++) {
      o = g.objs[i];
      if (o.k !== 'BOMB' || o.st !== 'fly' || !g.boss) continue;
      var bx = o.x >> 8;
      if (Math.abs(bx - g.px) < 40) want = bx < 120 ? bx + 56 : bx - 56;
    }
    var dx = want - g.px;
    if (dx > 2) mask |= BTN.RIGHT; else if (dx < -2) mask |= BTN.LEFT;
    if (m !== 'play' || g.sw || g.hurtT > 0) return mask;
    // 出招：比較三招（橫斬朝目標方向）
    var faceT = tgt ? ((tgt.x >> 8) + 8 >= g.px + 8 ? 1 : -1) : g.face;
    var opts = [['H', faceT], ['U', g.face], ['D', faceT]], bestO = null, bestS = 0;
    for (i = 0; i < opts.length; i++) {
      var r = simSwing(opts[i][0], opts[i][1]);
      if (r.bomb) continue;
      var sc = r.hit + r.boss * 2 - (opts[i][0] === 'U' ? 0.1 : 0);
      if (sc > bestS + 0.01) { bestS = sc; bestO = opts[i]; }
    }
    if (bestO && bestS >= 0.5) {
      mask = BTN.A | (bestO[0] === 'U' ? BTN.UP : bestO[0] === 'D' ? BTN.DOWN : 0) | (bestO[1] > 0 ? BTN.RIGHT : BTN.LEFT);
      if (bestO[0] !== 'H') mask &= ~(BTN.LEFT | BTN.RIGHT) | (dx > 2 ? BTN.RIGHT : dx < -2 ? BTN.LEFT : 0);
      if (B.lastA) { B.lastA = false; return mask & ~BTN.A; }   // A 需要「按下邊緣」：上一幀按過就先放
      B.lastA = true;
      return mask;
    }
    B.lastA = false;
    return mask;
  }

  /* ============================================================ 註冊 */
  var GAME = {
    id: 'slash', order: 1, title: '星塵忍者斬', legacy: ['ninja-slice.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = SL.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'slash_bg');
      NES.CHR.setPattern(1, 'slash_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setSprPalette(0, PAL_NINJA); ppu.setSprPalette(1, PAL_FX); ppu.setSprPalette(2, PAL_GOLD); ppu.setSprPalette(3, PAL_RED);
      ppu.setBgPalette(3, PAL_HUD);
      GAME.backTile = { tile: art.s('BACK'), pal: 2 };     // §6-4：回選單提示用金色星（實心 8×8）
      AU.init(nes);
      g = newState();
      if ((opt && opt.start) || (CT.query && CT.query('stage'))) startRun(); else enterTitle();
    },
    update: function (nes) {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'over' || g.mode === 'down') continueRun();
        else if (g.mode === 'play' || g.mode === 'intro' || g.mode === 'clear') {
          g.hearts = MAX_HEARTS; g.cheated = true;
          for (var i = 0; i < g.objs.length; i++) if (g.objs[i].k === 'BOMB' && g.objs[i].st === 'fly') { g.objs[i].st = 'cut'; g.objs[i].t = 0; }
          say('STAR POWER! HEARTS FULL', 90); AU.sfx('slash_heal');
        }
      }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) startRun();
      } else if (g.mode === 'over' || g.mode === 'ending') {
        g.modeT++; g.t++;
        if (g.modeT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function (nes) {
      var ppu = nes.ppu;
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) text0(11, 25, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.mode !== 'over' && g.mode !== 'ending') {
        drawHud();
        ppu.setBackdrop(g.flash > 0 ? 0x16 : STAGES[g.stage].bd);
      }
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, stage: g.stage, score: g.score, hearts: g.hearts, combo: g.combo, maxCombo: g.maxCombo,
        sliced: g.sliced, quota: STAGES[g.stage].quota, objs: g.objs.length, cleared: g.cleared, paused: g.paused,
        px: g.px, py: g.py >> 8, ground: g.ground, sw: g.sw ? g.sw.type : null,
        boss: g.boss ? { hp: g.boss.hp, st: g.boss.st, x: g.boss.x, y: g.boss.y } : null,
        cheated: g.cheated, continues: g.continues, goal: g.goalHit && !g.cheated, stat: g.stat
      };
    },
    exit: function () { saveBest(); AU.stop(); },                    // §6-3
    cheat: function () {                                              // 標題 / 結局無效
      if (!g || g.mode === 'title' || g.mode === 'ending') return false;
      g.cheatReq = true; return true;
    },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return pad(CT.load('slash', 'best', 0), 6); }
  };
  SL.STAGES = STAGES;
  SL.SW = SW;
  SL.GOAL_STAGES = GOAL_STAGES;
  SL.dev = {
    g: function () { return g; }, launch: function (k, x, apex, tx) { return launch(k, x, apex, tx === undefined ? x : tx); },
    hitbox: hitbox, stepObj: stepObj, predict: predict, objBox: objBox, overlap: overlap,
    start: function () { startRun(); }, stage: function (s) { if (g.mode === 'title') startRun(); g.sliced = 0; beginStage(s); },
    play: function () { g.mode = 'play'; g.modeT = 0; unbanner(); },
    lineBound: function () {                // 設計上界：主角 2 + 魔王 4（魔王關）+ 拋出物 2 × 同屏上限
      return STAGES.map(function (S) { return 2 + (S.boss ? 4 : 0) + 2 * S.alive; });
    }
  };
  if (CT.register) CT.register(GAME);
})();
