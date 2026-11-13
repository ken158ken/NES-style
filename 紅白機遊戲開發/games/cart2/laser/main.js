/*
 * games/cart2/laser/main.js — 《星塵雷射防衛 PRISM GUARD》（合輯卡帶二 槽 2，id = laser）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-1 cart2-blade（R6）｜ 依賴：laser/art.js、laser/song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/laser-defense.html（只取「瞄準點擊打掉落下物保護基地」玩法；
 *   設施 / 敵人 / 魔王 / 曲子全部原創；準星是菱形光環、三座設施造型高度各異，不是一排城市 + 交叉準星）
 *
 * 操作（手把化，brief §1-4）：十字鍵移動準星（按住前 8 幀 1 px/幀、之後 3 px/幀；按住 B = 精細 1 px），
 *   A 按下 = 瞬發雷射（半徑 10）；A 按住 ≥ 20 幀 = 充能，放開 = 稜鏡爆（半徑 16~32，貫穿範圍內全部）。
 *   每發累積熱量，熱量 100 = 過熱 90 幀不能射（熱量條在 HUD）。START = 暫停。
 * 設施（各 3 HP，全毀 3 座 = GAME OVER）：左丘「星花溫室」、中谷「通訊塔」、右崖「晶核爐」；地面正中「稜鏡砲」是光源（不會被打）。
 * 敵人：ROCK 小隕石、BIG 大隕石（2 HP，打碎裂成兩顆小的）、SPLIT 分裂彈（飛到半空裂成 3 顆種子分攻三座設施）、
 *   DRONE 閃避機（準星靠近就橫移閃開，飛到設施上方丟飛鏢 DART；用稜鏡爆抓它）、
 *   第 9 波魔王「彗眼 COMET EYE」：4 顆眼莢各 4 HP，左右巡航、下隕石雨，眼莢全滅即勝。
 * 波次：1~8 波數量 / 速度 / 種類遞增，第 9 波魔王；每守住一波：剩餘 HP 獎勵 + 修復最殘破的一座 1 HP。
 *
 * 每線 ≤ 8 精靈（設計保證）：準星 16 寬 = 2；敵人以「欄數」記帳（ROCK / SEED / DART 1、BIG / DRONE 2、
 *   SPLIT 預留 3、DRONE 另預留飛鏢 1；爆炸沿用自己的欄）——出怪器保證同屏欄數 ≤ 5（魔王 4 + 1）⇒ 2 + 5 = 7；
 *   光束點每 12 px 一顆（同線 ≤ 1）+ 命中閃光為裝飾，走逐線配額器最後畫（stat.dropFx），主體被擋記 stat.dropMain（恆 0）。
 * VBlank：設施損傷 / 瓦礫一次 ≤ 20 byte、HUD 只寫有變的磚；整片重畫（標題 / 開局 / 結算）在 CT.blank 內。
 * 密技（C / ★）：遊玩中 = 三座設施全修好（含重建）+ 散熱；GAME OVER = 原地續關（同一波重來、保留分數、設施全修）；
 *   標題 / 結局無效；用過密技 goal() 一律 false。goal = 同一局守過 5 波且未用密技。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var LZ = CT.Laser = CT.Laser || {};
  var AU = LZ.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var GOAL_WAVES = 5, COL_CAP = 5;
  var R_ZAP = 10, CHARGE_MIN = 20, CHARGE_MAX = 60, HEAT_ZAP = 14, HEAT_BLAST = 30, HEAT_MAX = 400, HEAT_DECAY = 3, OVERHEAT_T = 90;
  var ZAP_CD = 6;
  var EMIT = { x: 136, y: 190 };
  var RET_MIN_Y = 40, RET_MAX_Y = 196;
  // 三座設施（背景磚矩形 + 碰撞框）
  var FAC = [
    { name: 'GREENHOUSE', col: 3, row: 19, w: 4, h: 3, pre: 'H', box: { x: 26, y: 154, w: 28, h: 22 } },
    { name: 'ANTENNA', col: 12, row: 21, w: 2, h: 5, pre: 'A', box: { x: 97, y: 170, w: 14, h: 38 } },
    { name: 'REACTOR', col: 25, row: 17, w: 4, h: 3, pre: 'R', box: { x: 204, y: 138, w: 26, h: 22 } }
  ];
  var WAVES = [
    { n: 10, every: 72, spd: 130, mix: { ROCK: 100 } },
    { n: 12, every: 58, spd: 165, mix: { ROCK: 78, BIG: 22 } },
    { n: 14, every: 54, spd: 180, mix: { ROCK: 58, BIG: 22, SPLIT: 20 } },
    { n: 15, every: 50, spd: 195, mix: { ROCK: 50, BIG: 16, SPLIT: 18, DRONE: 16 } },
    { n: 16, every: 46, spd: 210, mix: { ROCK: 46, BIG: 18, SPLIT: 20, DRONE: 16 } },
    { n: 18, every: 42, spd: 225, mix: { ROCK: 42, BIG: 20, SPLIT: 20, DRONE: 18 } },
    { n: 20, every: 38, spd: 240, mix: { ROCK: 38, BIG: 22, SPLIT: 22, DRONE: 18 } },
    { n: 22, every: 34, spd: 255, mix: { ROCK: 36, BIG: 22, SPLIT: 22, DRONE: 20 } },
    { n: 0, every: 54, spd: 230, mix: { ROCK: 100 }, boss: true }
  ];
  var COLS = { ROCK: 1, SEED: 1, DART: 1, BIG: 2, SPLIT: 3, DRONE: 3 };
  var RAD = { ROCK: 4, SEED: 4, DART: 4, BIG: 7, SPLIT: 4, DRONE: 7 };
  var PTS = { ROCK: 25, SEED: 25, DART: 10, BIG: 50, SPLIT: 75, DRONE: 150 };
  var POD_HP = 6;
  var PODX = [4, 12, 20, 27];
  var PAL_HUD = [0x0F, 0x27, 0x30];
  var PAL_SKY = [0x01, 0x12, 0x30], PAL_TERR = [0x0F, 0x07, 0x2A], PAL_FAC = [0x01, 0x21, 0x38];
  var PAL_RET = [0x16, 0x2A, 0x30], PAL_ROCK = [0x07, 0x17, 0x27], PAL_FOE = [0x04, 0x24, 0x30], PAL_FX = [0x11, 0x2C, 0x30];

  var art = null, nes0 = null, g = null;

  function newState() {
    return {
      mode: 'title', t: 0, modeT: 0, runs: 0, paused: false,
      wave: 0, score: 0, cleared: 0, spawned: 0, spawnT: 60, seed: 777,
      rx: 128, ry: 112, holdT: 0, heat: 0, over: 0, charge: 0, aHeld: false, cd: 0,
      foes: [], beam: null, hp: [3, 3, 3], drawnHp: [3, 3, 3], dirty: [],
      boss: null, msg: '', msgT: 0, hud: [], banner: false, flash: 0,
      cheated: false, cheatReq: false, continues: 0, goalHit: false, newBest: false, sprUsed: 0,
      stat: { dropMain: 0, dropFx: 0, kills: 0, shots: 0, blasts: 0, hits: 0, overheats: 0, maxCols: 0, maxLine: 0 }, bot: { t: 0 }
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s.substring(s.length - w); }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function isqrt(n) { return Math.floor(Math.sqrt(Math.max(0, n))); }

  /* ============================================================ 背景 */
  function text0(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]); }
  function groundRow(c) {               // 每欄地表列：左丘 22、中谷 26、右崖 20（含斜坡）
    if (c <= 9) return 22;
    if (c === 10) return 24;
    if (c >= 11 && c <= 19) return 26;
    if (c === 20) return 24;
    if (c === 21) return 22;
    return 20;
  }
  function hash(c, r) { return (((c + 11) * 2654435761) ^ ((r + 5) * 40503)) >>> 0; }
  function facTile(i, c, r) {           // 設施矩形內的磚（依 HP：3-2 完好 / 1 損傷 / 0 瓦礫）
    var F = FAC[i], hp = g.hp[i], dx = c - F.col, dy = r - F.row;
    if (hp <= 0) {
      if (dy !== F.h - 1) return 0;
      return art.t(['RUB_A', 'RUB_B', 'RUB_C', 'RUB_B'][dx & 3]);
    }
    return art.t(F.pre + (hp >= 2 ? 'S' : 'D') + dy + dx);
  }
  function inFac(c, r) {
    for (var i = 0; i < 3; i++) { var F = FAC[i]; if (c >= F.col && c < F.col + F.w && r >= F.row && r < F.row + F.h) return i; }
    return -1;
  }
  function tileAt(c, r) {
    if (r <= 3) return art.t('SOLID1');
    if (r === 4) return art.t('FR_H');
    var fi = inFac(c, r);
    if (fi >= 0) return facTile(fi, c, r);
    if (c >= 16 && c <= 17 && r >= 24 && r <= 25) return art.t('PR' + (r - 24) + (c - 16));
    var gr = groundRow(c);
    if (r === gr) {
      var gl = groundRow(c - 1), grr = groundRow(c + 1);
      void gl; void grr;
      return art.t('GR_TOP');
    }
    if (r > gr) return r >= 28 ? art.t('GR_DEEP') : art.t(((c + r) & 1) ? 'GR_A' : 'GR_B');
    // 斜坡：比鄰欄高一列的地方放斜坡磚
    if (r === gr - 1 && c > 0 && groundRow(c - 1) < gr) return art.t('GR_DN');
    if (r === gr - 1 && c < 31 && groundRow(c + 1) < gr) return art.t('GR_UP');
    var h = hash(c, r) % 41;
    if (r < 18) return h === 3 ? art.t('ST1') : (h === 9 || h === 21) ? art.t('ST2') : h === 30 ? art.t('ST3') : (h === 15 && r < 12 ? art.t('NEB_A') : (h === 27 && r < 12 ? art.t('NEB_B') : 0));
    return 0;
  }
  function attrAt(bc, br) {             // 16×16 區塊：HUD 3 / 設施與稜鏡砲 2 / 地形 1 / 天空 0
    if (br <= 1) return 3;
    var c, r, k;
    for (k = 0; k < 4; k++) { c = bc * 2 + (k & 1); r = br * 2 + (k >> 1); if (inFac(c, r) >= 0) return 2; }
    if (bc === 8 && br === 12) return 2;
    for (k = 0; k < 4; k++) { c = bc * 2 + (k & 1); r = br * 2 + (k >> 1); if (r >= groundRow(c) - 1) return 1; }
    return 0;
  }
  function drawField() {
    var ppu = nes0.ppu, c, r;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, PAL_SKY); ppu.setBgPalette(1, PAL_TERR); ppu.setBgPalette(2, PAL_FAC); ppu.setBgPalette(3, PAL_HUD);
    for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) ppu.setTile(0, c, r, tileAt(c, r));
    for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) ppu.setAttr(0, c, r, attrAt(c, r));
    g.drawnHp = g.hp.slice(); g.hud = []; g.dirty = []; g.bn = {};
  }
  // 設施 HP 變了 ⇒ 排進佇列，每幀最多重畫一座（≤ 20 byte）
  function refreshFac() {
    for (var i = 0; i < 3; i++) {
      var a = g.drawnHp[i], b = g.hp[i];
      var ka = a <= 0 ? 0 : a >= 2 ? 2 : 1, kb = b <= 0 ? 0 : b >= 2 ? 2 : 1;
      if (ka === kb) { g.drawnHp[i] = b; continue; }
      var F = FAC[i];
      for (var r = F.row; r < F.row + F.h; r++) for (var c = F.col; c < F.col + F.w; c++) nes0.ppu.setTile(0, c, r, facTile(i, c, r));
      g.drawnHp[i] = b;
      return;
    }
  }
  function screenFrame() {
    var ppu = nes0.ppu, c;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(3, [0x01, 0x21, 0x30]);
    ppu.setBgPalette(0, [0x04, 0x24, 0x38]);
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
  function meter(row, col, v, max, n) {      // n 格量表（MTR0..3）
    var f = Math.round(v * n * 2 / max), i, k, tile;
    for (i = 0; i < n; i++) {
      tile = f >= (i + 1) * 2 ? (g.over ? 'MTR3' : 'MTR2') : f === i * 2 + 1 ? 'MTR1' : 'MTR0';
      if (row === 2 && col > 20) tile = f >= (i + 1) * 2 ? 'MTR3' : f === i * 2 + 1 ? 'MTR1' : 'MTR0';
      tile = art.t(tile);
      k = row * 32 + col + i;
      if (g.hud[k] === tile) continue;
      g.hud[k] = tile; nes0.ppu.setTile(0, col + i, row, tile);
    }
  }
  function drawHud() {
    var W = WAVES[g.wave];
    hudPut(1, 1, 'SCORE ' + pad(g.score, 6) + '  WAVE ' + (g.wave + 1) + '/' + WAVES.length + '  ' + (W.boss && g.boss ? 'EYES ' + podsLeft() : 'LEFT ' + pad(Math.max(0, W.n - g.spawned + aliveFoes()), 2)));
    hudPut(2, 1, 'HEAT');
    meter(2, 6, g.heat, HEAT_MAX, 8);
    hudPut(2, 15, ' CHARGE');
    meter(2, 23, Math.max(0, g.charge - 0), CHARGE_MAX, 6);
    var l3;
    if (g.paused) l3 = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.over > 0) l3 = (g.t & 8) ? 'OVERHEAT! COOLING...' : '';
    else if (g.msgT > 0) l3 = g.msg;
    else l3 = '';
    hudPut(3, 1, padR(l3, 30));
  }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }
  // 字幕（第 10 / 12 列）：只寫跟目前名稱表不同的磚（換字幕一次 ≤ 56 byte）
  function bannerRow(row, s) {
    var t = s ? art.text(s) : [], c0 = 16 - (t.length >> 1), c, want, k;
    if (!g.bn) g.bn = {};
    for (c = 2; c < 30; c++) {
      want = (c >= c0 && c < c0 + t.length) ? t[c - c0] : tileAt(c, row);
      k = row * 32 + c;
      if (g.bn[k] === undefined) g.bn[k] = tileAt(c, row);
      if (g.bn[k] === want) continue;
      g.bn[k] = want; nes0.ppu.setTile(0, c, row, want);
    }
  }
  function banner(l1, l2) { bannerRow(10, l1); bannerRow(12, l2); g.banner = true; }
  function unbanner() { if (!g.banner) return; bannerRow(10, ''); bannerRow(12, ''); g.banner = false; }

  /* ============================================================ 畫面切換 */
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function enterTitle() {
    g.mode = 'title'; g.t = 0;
    CT.blank(nes0, function () {
      screenFrame();
      var words = ['PRISM', 'GUARD'], x, i, w;
      for (w = 0; w < 2; w++) {
        x = w === 0 ? 5 : 17;
        for (i = 0; i < words[w].length; i++) {
          var t = art.big(words[w].charAt(i));
          nes0.ppu.setTile(0, x, 5, t[0]); nes0.ppu.setTile(0, x + 1, 5, t[1]); nes0.ppu.setTile(0, x, 6, t[2]); nes0.ppu.setTile(0, x + 1, 6, t[3]);
          x += 2;
        }
      }
      nes0.ppu.fillAttr(0, 0, 2, 16, 2, 0);
      text0(8, 8, 'STARDUST LASER DEFENSE');
      text0(3, 11, 'D-PAD AIM  B HOLD = FINE');
      text0(3, 13, 'A ZAP  HOLD+RELEASE A=BLAST');
      text0(3, 15, 'MIND THE HEAT - IT LOCKS');
      text0(3, 17, 'GUARD 3 SITES FOR 9 WAVES');
      text0(3, 19, 'HOLD START+SELECT: MENU');
      text0(3, 21, 'C/* = CHEAT  START = PAUSE');
      text0(3, 23, 'BEST ' + pad(CT.load('laser', 'best', 0), 6));
    });
    AU.play('laser_title');
  }
  function startRun() {
    var runs = g.runs + 1, bot = g.bot;
    g = newState();
    g.runs = runs; g.bot = bot; g.seed = 777 + runs * 7919;
    var jw = CT.query ? parseInt(CT.query('wave') || '', 10) : NaN;
    beginWave(jw >= 1 && jw <= WAVES.length ? jw - 1 : 0, true);
  }
  function beginWave(w, redraw) {
    g.wave = w; g.mode = 'intro'; g.modeT = 0; g.spawned = 0; g.spawnT = 40; g.foes = []; g.beam = null; g.paused = false;
    g.charge = 0; g.aHeld = false;
    g.boss = WAVES[w].boss ? { x: 112, y: -24, dir: 1, st: 'enter', t: 0, pods: [POD_HP, POD_HP, POD_HP, POD_HP], flash: 0 } : null;
    var W = WAVES[w];
    if (redraw) CT.blank(nes0, function () { clearSpr(); drawField(); banner('WAVE ' + (w + 1), W.boss ? 'THE COMET EYE APPROACHES' : W.n + ' INCOMING'); drawHud(); });
    else banner('WAVE ' + (w + 1), W.boss ? 'THE COMET EYE APPROACHES' : W.n + ' INCOMING');
    AU.play(W.boss ? 'laser_boss' : 'laser_wave');
  }
  function saveBest() {
    if (!g) return false;
    var best = CT.load('laser', 'best', 0);
    if (g.score > best) { CT.save('laser', 'best', g.score); return true; }
    return false;
  }
  function enterOver() {
    g.mode = 'over'; g.modeT = 0;
    var best = CT.load('laser', 'best', 0);
    g.newBest = saveBest();
    CT.blank(nes0, function () {
      screenFrame();
      text0(11, 6, 'GAME OVER');
      text0(7, 9, 'ALL THREE SITES FELL.');
      text0(8, 12, 'SCORE   ' + pad(g.score, 6) + (g.newBest ? ' NEW!' : ''));
      text0(8, 14, 'BEST    ' + pad(Math.max(best, g.score), 6));
      text0(8, 16, 'WAVE    ' + (g.wave + 1));
      text0(5, 19, 'C/* = CONTINUE THIS WAVE');
      text0(11, 22, 'PUSH START');
    });
    AU.play('laser_over');
  }
  function enterEnding() {
    g.mode = 'ending'; g.modeT = 0;
    g.newBest = saveBest();
    CT.blank(nes0, function () {
      screenFrame();
      text0(9, 6, 'SKY DEFENDED!');
      text0(4, 9, 'THE COMET EYE IS SHATTERED');
      text0(4, 11, 'AND THE NIGHT IS QUIET.');
      text0(8, 14, 'SCORE   ' + pad(g.score, 6) + (g.newBest ? ' NEW!' : ''));
      text0(8, 16, 'SITES   ' + (g.hp[0] + g.hp[1] + g.hp[2]) + '/9 HP');
      text0(8, 18, 'CONTINUES ' + g.continues);
      text0(11, 22, 'PUSH START');
    });
    AU.play('laser_clear');
  }
  function continueRun() {
    g.cheated = true; g.continues++;
    g.hp = [3, 3, 3]; g.heat = 0; g.over = 0;
    g.score = g.score;
    beginWave(g.wave, true);
    g.modeT = 30;
  }

  /* ============================================================ 敵人 */
  function aliveFoes() { var n = 0; for (var i = 0; i < g.foes.length; i++) if (g.foes[i].st === 'fly' && g.foes[i].wave) n++; return n; }
  function usedCols() {
    var n = g.boss ? 4 : 0;
    for (var i = 0; i < g.foes.length; i++) n += g.foes[i].cols;
    return n;
  }
  function liveFac() { var a = []; for (var i = 0; i < 3; i++) if (g.hp[i] > 0) a.push(i); return a; }
  function aimAt(f, tx, ty, spd) {
    var dx = (tx << 8) - f.x, dy = (ty << 8) - f.y, d = isqrt((dx >> 4) * (dx >> 4) + (dy >> 4) * (dy >> 4)) << 4;
    if (d < 1) d = 1;
    f.vx = Math.round(dx * spd / d); f.vy = Math.round(dy * spd / d);
    if (f.vy < 32) f.vy = 32;
  }
  function targetPoint(fi) { var B = FAC[fi].box; return { x: B.x + (B.w >> 1), y: B.y + 4 }; }
  function makeFoe(k, x, y, fi, spd, wave) {
    var f = { k: k, x: x << 8, y: y << 8, vx: 0, vy: 0, hp: k === 'BIG' ? 2 : 1, st: 'fly', t: 0, fi: fi, cols: COLS[k], wave: wave,
              splitY: 88 + rnd() % 40, dodge: 0, dcd: 0, dart: false, dir: 1 };
    if (k === 'DRONE') { f.y = (56 + rnd() % 40) << 8; f.dir = x < 128 ? 1 : -1; f.x = (x < 128 ? 4 : 236) << 8; f.vx = f.dir * (spd + 64); f.vy = 0; }
    else { var tp = targetPoint(fi); aimAt(f, tp.x, tp.y, spd); }
    g.foes.push(f);
    var c = usedCols(); if (c > g.stat.maxCols) g.stat.maxCols = c;
    return f;
  }
  function pickKind(W) {
    var tot = 0, k, r;
    for (k in W.mix) tot += W.mix[k];
    r = rnd() % tot;
    for (k in W.mix) { if (r < W.mix[k]) return k; r -= W.mix[k]; }
    return 'ROCK';
  }
  function spawn() {
    var W = WAVES[g.wave];
    if (W.boss) return;
    if (g.spawned >= W.n) return;
    if (--g.spawnT > 0) return;
    var k = pickKind(W), lf = liveFac();
    if (!lf.length) return;
    if (usedCols() + COLS[k] > COL_CAP) { k = 'ROCK'; if (usedCols() + 1 > COL_CAP) { g.spawnT = 4; return; } }
    var fi = lf[rnd() % lf.length], x = 16 + rnd() % 224;
    makeFoe(k, x, 32, fi, W.spd + (k === 'BIG' ? -24 : 0), true);
    g.spawned++;
    g.spawnT = W.every + (rnd() % 20) - 10;
  }
  function boxOf(f) { var r = RAD[f.k], cx = (f.x >> 8) + (f.k === 'BIG' || f.k === 'DRONE' ? 8 : 4), cy = (f.y >> 8) + (f.k === 'BIG' ? 8 : 4); return { cx: cx, cy: cy, r: r }; }
  function facHitBy(f) {
    var b = boxOf(f), i, B;
    for (i = 0; i < 3; i++) {
      if (g.hp[i] <= 0) continue;
      B = FAC[i].box;
      if (b.cx + b.r > B.x && b.cx - b.r < B.x + B.w && b.cy + b.r > B.y && b.cy - b.r < B.y + B.h) return i;
    }
    return -1;
  }
  function damageFac(i) {
    g.hp[i]--; g.flash = 6; g.stat.hits++;
    AU.sfx('laser_hit');
    say(FAC[i].name + (g.hp[i] <= 0 ? ' DESTROYED!' : ' HIT! HP ' + g.hp[i]), 80);
  }
  function explode(f, small) { f.st = 'boom'; f.t = 0; f.vx = 0; f.vy = 0; f.small = small; }
  function updateFoes() {
    var i, f, W = WAVES[g.wave];
    for (i = g.foes.length - 1; i >= 0; i--) {
      f = g.foes[i]; f.t++;
      if (f.st === 'boom') { if (f.t > 16) g.foes.splice(i, 1); continue; }
      if (f.k === 'DRONE') {
        if (f.dcd > 0) f.dcd--;
        if (f.dodge > 0) { f.dodge--; f.x += f.ddir * 3 * Q; }
        else {
          var c = boxOf(f), dx = g.rx - c.cx, dy = g.ry - c.cy;
          if (f.dcd === 0 && dx * dx + dy * dy < 30 * 30 && g.mode === 'play') { f.dodge = 14; f.dcd = 70; f.ddir = dx > 0 ? -1 : 1; AU.sfx('laser_warn'); }
          f.x += f.vx;
          f.y = f.y + (((f.t >> 5) & 1) ? 32 : -32);
        }
        var fx = f.x >> 8;
        if (fx < 2) { f.x = 2 << 8; f.vx = Math.abs(f.vx); }
        if (fx > 238) { f.x = 238 << 8; f.vx = -Math.abs(f.vx); }
        if (!f.dart) {
          for (var j = 0; j < 3; j++) {
            if (g.hp[j] <= 0) continue;
            var B = FAC[j].box;
            if (Math.abs(fx + 8 - (B.x + (B.w >> 1))) < 4) {
              f.dart = true; f.cols = 2;           // 預留的飛鏢欄轉給飛鏢
              var d = makeFoe('DART', fx + 4, (f.y >> 8) + 8, j, 0, false); d.cols = 1; d.vx = 0; d.vy = 320; d.from = f;
              break;
            }
          }
        }
        if (f.t > 60 * 20) { g.foes.splice(i, 1); continue; }    // 保險：飛太久自行離場
        continue;
      }
      f.x += f.vx; f.y += f.vy;
      if (f.k === 'SPLIT' && (f.y >> 8) >= f.splitY) {
        // 裂成 3 顆種子：預留的 3 欄轉給種子
        var lf = liveFac(), b0 = boxOf(f);
        g.foes.splice(i, 1);                 // 先移除自己（3 欄）再生種子 ⇒ 帳面欄數不會瞬間超過
        for (var s = 0; s < 3; s++) {
          var tf = lf.length ? lf[s % lf.length] : 1;
          var sd = makeFoe('SEED', b0.cx - 4 + (s - 1) * 6, b0.cy - 4, tf, WAVES[g.wave].spd + 24, false);
          sd.cols = 1;
        }
        AU.sfx('laser_pop');
        continue;
      }
      var hit = facHitBy(f);
      if (hit >= 0) { damageFac(hit); explode(f, f.k !== 'BIG'); continue; }
      var cx = (f.x >> 8) + 4;
      if ((f.y >> 8) + 8 >= groundRow(Math.max(0, Math.min(31, cx >> 3))) * 8 || (f.y >> 8) > 220) { explode(f, true); AU.sfx('laser_pop'); continue; }
    }
    void W;
  }
  function killFoe(f, bonusMul) {
    g.stat.kills++;
    g.score = Math.min(999999, g.score + PTS[f.k] * (bonusMul || 1));
    if (f.k === 'BIG' && f.hp <= 0) {
      // 大隕石碎成兩顆小的（沿用自己的 2 欄）
      var b = boxOf(f), lf = liveFac(), sp = WAVES[g.wave].spd;
      g.foes.splice(g.foes.indexOf(f), 1);
      for (var s = 0; s < 2; s++) {
        var r = makeFoe('ROCK', b.cx - 4 + (s ? 5 : -5), b.cy - 4, lf.length ? lf[(s + rnd()) % lf.length] : 0, sp, false);
        r.cols = 1;
      }
      AU.sfx('laser_pop');
      return;
    }
    if (f.k === 'DRONE') f.cols = 3;
    explode(f, f.k !== 'BIG' && f.k !== 'DRONE');
    if (f.k === 'DRONE' || f.k === 'BIG') f.cols = 2;
    AU.sfx('laser_boom');
  }
  // 雷射命中判定（圓 vs 敵人圓）；回傳打到幾個
  function fireAt(cx, cy, r, pierce) {
    var i, f, n = 0, b;
    for (i = g.foes.length - 1; i >= 0; i--) {
      f = g.foes[i];
      if (!f || f.st !== 'fly') continue;
      b = boxOf(f);
      var dx = b.cx - cx, dy = b.cy - cy, rr = r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      f.hp--;
      n++;
      if (f.hp <= 0) killFoe(f, pierce && n > 1 ? n : 1);
      else { AU.sfx('laser_pop'); }
      if (!pierce) break;
    }
    if (g.boss) n += hitBoss(cx, cy, r, pierce);
    return n;
  }
  function addHeat(h) {
    g.heat += h * 4;
    if (g.heat >= HEAT_MAX) { g.heat = HEAT_MAX; g.over = OVERHEAT_T; g.charge = 0; g.stat.overheats++; AU.sfx('laser_heat'); }
  }
  function shoot(r, pierce) {
    g.beam = { x: g.rx, y: g.ry, t: 6, r: r };
    var n = fireAt(g.rx, g.ry, r, pierce);
    if (pierce) { g.stat.blasts++; AU.sfx('laser_blast'); addHeat(HEAT_BLAST); if (n >= 2) say('PRISM BLAST x' + n + '!', 50); }
    else { g.stat.shots++; AU.sfx('laser_zap'); addHeat(HEAT_ZAP); }
    return n;
  }

  /* ============================================================ 魔王 */
  function podsLeft() { var n = 0; if (!g.boss) return 0; for (var i = 0; i < 4; i++) if (g.boss.pods[i] > 0) n++; return n; }
  function hitBoss(cx, cy, r, pierce) {
    var b = g.boss, n = 0, i;
    if (!b || b.st !== 'fight') return 0;
    for (i = 0; i < 4; i++) {
      if (b.pods[i] <= 0) continue;
      var px = b.x + PODX[i], py = b.y + 10, dx = px - cx, dy = py - cy, rr = r + 4;
      if (dx * dx + dy * dy > rr * rr) continue;
      b.pods[i]--; b.flash = 8; n++;
      g.score = Math.min(999999, g.score + 100);
      if (b.pods[i] === 0) { g.score += 1000; say('EYE POD DOWN! ' + podsLeft() + ' LEFT', 70); AU.sfx('laser_boom'); }
      else AU.sfx('laser_pop');
      if (!pierce) break;
    }
    if (podsLeft() === 0) { b.st = 'die'; b.t = 0; g.score += 5000; AU.stop(); }
    return n;
  }
  function updateBoss() {
    var b = g.boss;
    if (!b) return;
    b.t++;
    if (b.flash > 0) b.flash--;
    if (b.st === 'enter') { b.y++; if (b.y >= 40) { b.y = 40; b.st = 'fight'; b.t = 0; } return; }
    if (b.st === 'die') {
      if (b.t >= 120) { g.boss = null; waveClear(); }
      return;
    }
    var left = podsLeft(), sp = left <= 2 ? 2 : 1;
    b.x += b.dir * sp;
    if (b.x < 8) { b.x = 8; b.dir = 1; }
    if (b.x > 216) { b.x = 216; b.dir = -1; }
    b.y = 40 + ((b.t >> 3) % 8 < 4 ? (b.t >> 3) % 4 : 4 - (b.t >> 3) % 4) * 2;
    var every = left <= 1 ? 30 : left <= 2 ? 40 : 54;
    if (b.t % every === 0 && usedCols() + 1 <= COL_CAP) {
      var lf = liveFac();
      if (lf.length) {
        var f = makeFoe('ROCK', b.x + 12, b.y + 24, lf[rnd() % lf.length], WAVES[g.wave].spd + (4 - left) * 16, false);
        f.cols = 1;
      }
    }
  }

  /* ============================================================ 準星 / 射擊 */
  function updateAim() {
    var I = NES.Input, dx = 0, dy = 0;
    if (I.held(BTN.LEFT)) dx = -1; else if (I.held(BTN.RIGHT)) dx = 1;
    if (I.held(BTN.UP)) dy = -1; else if (I.held(BTN.DOWN)) dy = 1;
    if (dx || dy) g.holdT++; else g.holdT = 0;
    var sp = I.held(BTN.B) ? 1 : (g.holdT <= 8 ? 1 : 3);
    g.rx = Math.max(8, Math.min(248, g.rx + dx * sp));
    g.ry = Math.max(RET_MIN_Y, Math.min(RET_MAX_Y, g.ry + dy * sp));
    if (g.cd > 0) g.cd--;
    if (g.over > 0) {
      g.over--; g.heat = Math.max(0, g.heat - Math.ceil(HEAT_MAX / OVERHEAT_T));
      g.charge = 0; g.aHeld = false;
      if (g.over === 0) g.heat = 0;
      return;
    }
    if (g.heat > 0 && !g.aHeld) g.heat = Math.max(0, g.heat - HEAT_DECAY);
    if (I.pressed(BTN.A)) {
      g.aHeld = true; g.charge = 0;
      if (g.cd === 0) { shoot(R_ZAP, false); g.cd = ZAP_CD; }
    } else if (g.aHeld && I.held(BTN.A)) {
      if (g.charge < CHARGE_MAX) { g.charge++; if (g.charge === CHARGE_MIN || g.charge === CHARGE_MAX) AU.sfx('laser_charge'); }
    }
    if (g.aHeld && !I.held(BTN.A)) {
      g.aHeld = false;
      if (g.charge >= CHARGE_MIN && g.over === 0) shoot(blastR(g.charge), true);
      g.charge = 0;
    }
  }
  function blastR(c) { return 12 + Math.floor(Math.min(CHARGE_MAX, c) / 3); }   // 20 幀 = 18 px … 60 幀 = 32 px

  /* ============================================================ 流程 */
  function waveClear() {
    g.mode = 'clear'; g.modeT = 0; g.cleared++;
    if (!g.cheated && g.cleared >= GOAL_WAVES) g.goalHit = true;
    var hpSum = g.hp[0] + g.hp[1] + g.hp[2], bonus = hpSum * 100;
    g.score = Math.min(999999, g.score + bonus);
    // 修復最殘破（但還活著）的一座
    var wi = -1;
    for (var i = 0; i < 3; i++) if (g.hp[i] > 0 && g.hp[i] < 3 && (wi < 0 || g.hp[i] < g.hp[wi])) wi = i;
    if (wi >= 0) { g.hp[wi]++; AU.sfx('laser_repair'); }
    banner('WAVE ' + (g.wave + 1) + ' CLEAR!', 'BONUS ' + bonus + (wi >= 0 ? '  ' + FAC[wi].name + ' +1' : ''));
    AU.play('laser_clear');
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
    if (g.beam && --g.beam.t <= 0) g.beam = null;
    refreshFac();
    if (g.mode === 'intro') {
      updateAim();
      updateBoss();
      if (g.modeT >= 100) { g.mode = 'play'; g.modeT = 0; unbanner(); }
      return;
    }
    if (g.mode === 'clear') {
      updateFoes();
      if (g.modeT >= 150) {
        if (g.wave + 1 >= WAVES.length) enterEnding();
        else beginWave(g.wave + 1, false);
      }
      return;
    }
    if (g.mode === 'down') {
      updateFoes();
      if (g.modeT >= 90) enterOver();
      return;
    }
    spawn();
    updateAim();
    updateFoes();
    updateBoss();
    if (g.hp[0] <= 0 && g.hp[1] <= 0 && g.hp[2] <= 0) { g.mode = 'down'; g.modeT = 0; AU.stop(); saveBest(); return; }
    var W = WAVES[g.wave];
    if (!W.boss && g.spawned >= W.n && aliveFoes() === 0 && g.foes.length === 0) waveClear();
  }

  /* ============================================================ 繪製 */
  var lineCnt = new Uint8Array(240), oamN = 0;
  function spr(x, y, tile, pal, o, cosmetic) {
    if (y >= 232 || y <= -8 || x <= -8 || x >= 256) return false;
    var y0 = Math.max(0, y), y1 = Math.min(239, y + 7), yy;
    if (oamN >= 62) { if (cosmetic) g.stat.dropFx++; else g.stat.dropMain++; return false; }
    for (yy = y0; yy <= y1; yy++) if (lineCnt[yy] >= 8) { if (cosmetic) g.stat.dropFx++; else g.stat.dropMain++; return false; }
    for (yy = y0; yy <= y1; yy++) lineCnt[yy]++;
    nes0.ppu.sprite(oamN++, { x: x & 255, y: y, tile: tile, pal: pal, flipH: !!(o && o.h), flipV: !!(o && o.v) });
    return true;
  }
  function quad(x, y, name, pal, cosmetic) {
    var q = art.q(name);
    spr(x, y, q[0], pal, null, cosmetic); spr(x + 8, y, q[1], pal, null, cosmetic);
    spr(x, y + 8, q[2], pal, null, cosmetic); spr(x + 8, y + 8, q[3], pal, null, cosmetic);
  }
  var FOE_PAL = { ROCK: 1, BIG: 1, SEED: 2, SPLIT: 2, DRONE: 2, DART: 2 };
  function drawFoe(f) {
    var x = f.x >> 8, y = f.y >> 8;
    if (f.st === 'boom') {
      if (f.small) spr(x, y, art.s('BOOM8'), 3);
      else quad(x, y, 'BOOM', 3);
      return;
    }
    if (f.k === 'BIG') { quad(x, y, 'BIG', 1); return; }
    if (f.k === 'DRONE') {
      var fl = f.vx < 0;
      spr(x, y, art.s(fl ? 'DRONE_R' : 'DRONE_L'), 2, { h: fl }); spr(x + 8, y, art.s(fl ? 'DRONE_L' : 'DRONE_R'), 2, { h: fl });
      return;
    }
    var name = f.k === 'ROCK' ? (((f.t >> 3) & 1) ? 'ROCK2' : 'ROCK') : f.k;
    spr(x, y, art.s(name), FOE_PAL[f.k]);
  }
  function drawBoss(b) {
    if (!b) return;
    if (b.st === 'die' && (b.t & 4)) return;
    for (var ty = 0; ty < 3; ty++) {
      var y = b.y + ty * 8;
      if (y < 0) continue;
      for (var tx = 0; tx < 4; tx++) {
        var name = 'CM' + ty + tx;
        if (ty === 1 && b.pods[tx] <= 0) name = 'CX1' + tx;
        spr(b.x + tx * 8, y, art.s(name), (b.flash & 2) ? 3 : 1);
      }
    }
  }
  function drawSprites() {
    lineCnt.fill(0); oamN = 0;
    var i, m = g.mode;
    if (m === 'title') {
      quad(120, 76 + ((g.t >> 4) & 1), ((g.t >> 3) & 1) ? 'RETC' : 'RET', 0);
      spr(40, 72, art.s('ROCK'), 1); spr(208, 80, art.s('SPLIT'), 2);
    } else if (m === 'intro' || m === 'play' || m === 'clear' || m === 'down') {
      // 準星（2/線）
      if (m !== 'down') quad(g.rx - 8, g.ry - 8, g.charge >= CHARGE_MIN && ((g.t >> 2) & 1) ? 'RETC' : 'RET', g.over ? 3 : 0);
      drawBoss(g.boss);
      for (i = 0; i < g.foes.length; i++) drawFoe(g.foes[i]);
      // 光束（裝飾）：從稜鏡砲到準星，每 12 px 縱向一顆 ⇒ 同線 ≤ 1
      if (g.beam) {
        var bx = g.beam.x, by = g.beam.y, dy = EMIT.y - by, n = Math.floor(Math.abs(dy) / 12);
        for (i = 1; i < n; i++) {
          var yy = EMIT.y - Math.round(dy * i / n), xx = EMIT.x + Math.round((bx - EMIT.x) * i / n);
          spr(xx - 4, yy - 4, art.s('BEAM'), 0, null, true);
        }
        spr(bx - 4, by - 4, art.s('ZAP'), 0, null, true);
      }
    }
    for (i = 0; i < 240; i++) if (lineCnt[i] > g.stat.maxLine) g.stat.maxLine = lineCnt[i];
    for (i = oamN; i < g.sprUsed; i++) nes0.ppu.sprite(i, null);
    g.sprUsed = oamN;
  }

  /* ============================================================ 機器人 */
  // 每幀：挑「最快撞到設施」的敵人（閃避機 / 魔王眼莢次之），預測準星到達時它的位置，移過去；
  // 進入射程就按 A（只用按下邊緣）；閃避機 / 魔王用充能爆（按住 A 移過去、到了放開）；熱量高就先等散熱。
  function etaOf(f) {
    if (f.k === 'DRONE') return f.dart ? 400 : 260;
    var B = FAC[f.fi] ? FAC[f.fi].box : { y: 180 };
    var dy = B.y - (f.y >> 8);
    return f.vy > 0 ? Math.max(0, (dy * 256) / f.vy) : 300;
  }
  function botMask() {
    var B = g.bot, m = g.mode;
    B.t++;
    if (m === 'title') return (B.t % 40 === 20) ? BTN.START : 0;
    if (m === 'over' || m === 'ending') return (g.modeT > 90 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (m !== 'play' && m !== 'intro') return 0;
    var tgt = null, best = 1e9, i, f, tx = 128, ty = 110, wantBlast = false;
    for (i = 0; i < g.foes.length; i++) {
      f = g.foes[i];
      if (f.st !== 'fly') continue;
      var e = etaOf(f);
      if ((f.y >> 8) < RET_MIN_Y - 4) e += 200;
      if (e < best) { best = e; tgt = f; }
    }
    var b = g.boss;
    if (b && b.st === 'fight' && (!tgt || best > 70)) {
      for (i = 0; i < 4; i++) if (b.pods[i] > 0) { tx = b.x + PODX[i] + b.dir * 6; ty = b.y + 10; wantBlast = true; tgt = null; break; }
    } else if (tgt) {
      var dist = Math.abs(boxOf(tgt).cx - g.rx) + Math.abs(boxOf(tgt).cy - g.ry);
      var k = Math.min(40, Math.round(dist / 3));
      var c = boxOf(tgt);
      tx = c.cx + Math.round(tgt.vx * k / 256); ty = c.cy + Math.round(tgt.vy * k / 256);
      if (tgt.k === 'DRONE') { wantBlast = true; tx = c.cx + Math.round(tgt.vx * 6 / 256); ty = c.cy; }
    }
    ty = Math.max(RET_MIN_Y, Math.min(RET_MAX_Y, ty));
    var mask = 0, dx = tx - g.rx, dy = ty - g.ry;
    var tol = g.holdT > 8 ? 3 : 1;
    if (dx > tol) mask |= BTN.RIGHT; else if (dx < -tol) mask |= BTN.LEFT;
    if (dy > tol) mask |= BTN.DOWN; else if (dy < -tol) mask |= BTN.UP;
    if (m !== 'play' || g.over > 0) { B.charging = false; return mask; }
    var d2 = dx * dx + dy * dy;
    // 充能爆：按住 A 跟上去，充到 40 幀以上且在半徑內就放開
    if (wantBlast) {
      if (!B.charging) {
        if (g.heat < HEAT_MAX - HEAT_BLAST * 4 - HEAT_ZAP * 4 - 8 && d2 < 70 * 70) { B.charging = true; return mask | BTN.A; }
        return mask;
      }
      var r = blastR(g.charge) - 3;
      if (g.charge >= 40 && d2 <= r * r) { B.charging = false; return mask; }   // 放開 = 發射
      if (!g.aHeld) { B.charging = false; return mask; }
      return mask | BTN.A;
    }
    if (B.charging) { B.charging = false; return mask; }
    if (tgt && g.cd === 0 && !g.aHeld && !B.lastA) {
      var c2 = boxOf(tgt), nx = c2.cx + Math.round(tgt.vx / 256), ny = c2.cy + Math.round(tgt.vy / 256);
      var ex = nx - (g.rx + (mask & BTN.RIGHT ? 1 : mask & BTN.LEFT ? -1 : 0)), ey = ny - (g.ry + (mask & BTN.DOWN ? 1 : mask & BTN.UP ? -1 : 0));
      var rr = R_ZAP + c2.r - 2;
      var urgent = best < 60;
      if (ex * ex + ey * ey <= rr * rr && (g.heat < HEAT_MAX - 90 || urgent)) { B.lastA = true; return mask | BTN.A; }
    }
    B.lastA = false;
    return mask;
  }

  /* ============================================================ 註冊 */
  var GAME = {
    id: 'laser', order: 2, title: '星塵雷射防衛', legacy: ['laser-defense.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = LZ.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'laser_bg');
      NES.CHR.setPattern(1, 'laser_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setSprPalette(0, PAL_RET); ppu.setSprPalette(1, PAL_ROCK); ppu.setSprPalette(2, PAL_FOE); ppu.setSprPalette(3, PAL_FX);
      ppu.setBgPalette(3, PAL_HUD);
      GAME.backTile = { tile: art.s('BACK'), pal: 0 };     // §6-4：回選單提示用星（實心 8×8）
      AU.init(nes);
      g = newState();
      if ((opt && opt.start) || (CT.query && CT.query('wave'))) startRun(); else enterTitle();
    },
    update: function (nes) {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'over' || g.mode === 'down') continueRun();
        else if (g.mode === 'play' || g.mode === 'intro' || g.mode === 'clear') {
          g.cheated = true; g.hp = [3, 3, 3]; g.heat = 0; g.over = 0;
          say('STAR POWER! SITES REBUILT', 90); AU.sfx('laser_repair');
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
        ppu.setBackdrop(g.flash > 0 ? 0x06 : 0x0F);
      }
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, wave: g.wave, score: g.score, hp: g.hp.slice(), cleared: g.cleared, paused: g.paused,
        rx: g.rx, ry: g.ry, heat: g.heat, over: g.over, charge: g.charge, foes: g.foes.length, cols: usedCols(),
        spawned: g.spawned, boss: g.boss ? { st: g.boss.st, pods: g.boss.pods.slice(), x: g.boss.x, y: g.boss.y } : null,
        cheated: g.cheated, continues: g.continues, goal: g.goalHit && !g.cheated, stat: g.stat
      };
    },
    exit: function () { saveBest(); AU.stop(); },
    cheat: function () {
      if (!g || g.mode === 'title' || g.mode === 'ending') return false;
      g.cheatReq = true; return true;
    },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return pad(CT.load('laser', 'best', 0), 6); }
  };
  LZ.WAVES = WAVES; LZ.FAC = FAC; LZ.COLS = COLS; LZ.COL_CAP = COL_CAP; LZ.GOAL_WAVES = GOAL_WAVES;
  LZ.dev = {
    g: function () { return g; }, tileAt: tileAt, attrAt: attrAt, usedCols: usedCols, blastR: blastR,
    start: function () { startRun(); }, wave: function (w) { if (g.mode === 'title') startRun(); beginWave(w, true); },
    play: function () { g.mode = 'play'; g.modeT = 0; unbanner(); },
    foe: function (k, x, y, fi, spd) { return makeFoe(k, x, y, fi === undefined ? 1 : fi, spd || 160, true); },
    fireAt: fireAt
  };
  if (CT.register) CT.register(GAME);
})();
