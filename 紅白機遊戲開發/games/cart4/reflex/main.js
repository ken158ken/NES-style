/*
 * games/cart4/reflex/main.js — 《星塵反應 STAR REFLEX》（合輯卡帶四 槽 6，id = reflex）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：reflex/{song,art}.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/reaction-time / reflex-test / reflex-tester / color-reaction / direction-challenge
 *   （只取「隨機延遲後亮燈按鍵、偷跑判定、選擇 / 顏色 / 方向衝突反應、平均 / 最佳 / 稱號」玩法；場景 / 規則細節 / 曲子原創）
 *
 * ★ 時間一律以幀計：亮燈那一幀 = stimF（update 內先讀鍵、再推進燈號 ⇒ 同一幀不可能按到），反應 = 按下那幀 − stimF；
 *   畫面換算 ms = 幀 × 1000 / 60.0988。延遲用遊戲內 LCG 亂數（以幀計），不讀實際時鐘。
 * 模式：
 *   SIMPLE 單純反應（5 次）：燈變紅 = 等，隨機 60~210 幀後變綠 + 嗶，按 Ⓐ（或 Ⓑ）。亮燈前按 = 偷跑（FALSE START）；
 *          亮燈後 < 6 幀（100 ms，人類不可能）也算偷跑（ANTICIPATION）。偷跑該次重來、計數。90 幀沒按 = SLOW（以 90 計入平均）。
 *   CHOICE 選擇反應（10 次）：四個訊號艙其中一個亮，按對應方向；按錯 = ERROR。
 *   COLOR  顏色反應（12 次 = 7 個目標 + 5 個干擾）：只在燈是「目標色」時按 Ⓐ（顏色另有形狀標記，色弱可玩）；
 *          干擾色按了 = ERROR、目標 60 幀沒按 = MISS、干擾色忍住 = 正確。
 *   ARROW  方向挑戰（15 次三級）：大箭頭出現，按「箭頭指的方向」。1~5 次在中央；6~10 次出現在上下左右（位置與方向衝突）；
 *          11~15 次另有「空心紅箭頭」= 按相反方向。
 * 稱號（平均幀）：≤ 12 PULSAR、≤ 15 COMET、≤ 18 METEOR、≤ 21 ROCKET、≤ 26 SATELLITE、其餘 MOONWALKER。
 * goal = SIMPLE 5 次平均 ≤ 20 幀（333 ms）且 0 偷跑、本次開機沒用過密技（門檻以機器人反應延遲 18 幀設計）。
 * 密技（C / ★）：測驗中 = 偷跑次數歸零、本次重來；結算畫面 = 原地續關（刪掉最差的一次、回去補測那一次）；標題無效。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var RX = CT.Reflex = CT.Reflex || {};
  var AU = RX.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var MODES = ['SIMPLE', 'CHOICE', 'COLOR', 'ARROW'];
  var CFG = {
    SIMPLE: { n: 5, d0: 60, d1: 210, to: 90, desc: '5 TRIES', l1: 'Ⓐ WHEN THE LAMP TURNS GREEN', l2: 'PRESS EARLY = FALSE START' },
    CHOICE: { n: 10, d0: 40, d1: 120, to: 90, desc: '10 TRIES', l1: 'PRESS THE LIT DIRECTION', l2: 'WRONG DIRECTION = ERROR' },
    COLOR: { n: 12, d0: 40, d1: 110, to: 60, nogo: 45, desc: '12 TRIES', l1: 'Ⓐ ONLY ON THE TARGET COLOR', l2: 'COLORS ALSO HAVE SHAPES' },
    ARROW: { n: 15, d0: 30, d1: 90, to: 75, desc: '15 TRIES', l1: 'PRESS WHERE THE ARROW POINTS', l2: 'HOLLOW RED = OPPOSITE WAY' }
  };
  var COLORS = [
    { id: 'GREEN', c: 0x2A, sh: 0 }, { id: 'BLUE', c: 0x12, sh: 1 }, { id: 'YELLOW', c: 0x28, sh: 2 },
    { id: 'RED', c: 0x16, sh: 3 }, { id: 'VIOLET', c: 0x24, sh: 4 }
  ];
  var SHAPE_CH = ['●', '■', '▲', '✕', '◆'];
  var DIRS = ['U', 'D', 'L', 'R'], DIR_BTN = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT], OPP = [1, 0, 3, 2];
  var TITLES = [[12, 'PULSAR'], [15, 'COMET'], [18, 'METEOR'], [21, 'ROCKET'], [26, 'SATELLITE'], [9999, 'MOONWALKER']];
  var GOAL_AVG = 20, ANTICIP = 6;
  var POD = [[14, 4], [14, 18], [6, 10], [22, 10]];          // 四個艙的左上磚
  var ARW_POS = [{ x: 112, y: 32 }, { x: 112, y: 128 }, { x: 40, y: 80 }, { x: 184, y: 80 }], ARW_C = { x: 112, y: 80 };
  var PAL_BG0 = [0x01, 0x11, 0x21], PAL_POD = [0x10, 0x00, 0x3D], PAL_LIT = [0x30, 0x28, 0x0F], PAL_HUD = [0x01, 0x27, 0x30];
  var LAMP_IDLE = [0x10, 0x00, 0x10], LAMP_WAIT = [0x10, 0x06, 0x16], LAMP_GO = [0x30, 0x2A, 0x30];

  var art = null, nes0 = null, g = null, sess = null;
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function ms(f) { return Math.round(f * 1000 / 60.0988); }
  function bestFmt(f) { return f > 0 ? padL(Math.min(999, ms(f)) + 'MS', 6) : ' ---MS'; }
  function titleOf(avg) { for (var i = 0; i < TITLES.length; i++) if (avg <= TITLES[i][0]) return TITLES[i][1]; return TITLES[TITLES.length - 1][1]; }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }

  function newSess() { return { cheated: false, goal: false, runs: 0, done: {}, bot: { t: 0, lag: 18, seenId: -1, seenT: 0 } }; }
  function newState() {
    return {
      mode: 'title', msel: 0, t: 0, ft: 0, paused: false, ph: 'intro', phT: 0, seed: 12345,
      trials: [], falses: 0, errors: 0, cur: 0, waitT: 0, stimF: 0, stim: null, stimId: 0, msg: '', msgT: 0, last: -1,
      seq: [], target: 0, cheated: false, continues: 0, hud: {}, sprUsed: 0, maxLine: 0, overT: 0, avg: 0, best: 0, newBest: false
    };
  }

  /* ============================== BG 工具 ============================== */
  function put(row, col, tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var c = col + i; if (c < 0 || c > 31) continue;
      var k = row * 32 + c;
      if (g.hud[k] === tiles[i]) continue;
      g.hud[k] = tiles[i];
      nes0.ppu.setTile(0, c, row, tiles[i]);
    }
  }
  function txt(row, col, s) { put(row, col, art.text(s)); }
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function stars() {
    for (var r = 1; r < 29; r++) for (var c = 0; c < 32; c++) {
      var h = ((c * 2654435761) ^ (r * 40503)) >>> 0;
      if (h % 29 === 5) nes0.ppu.setTile(0, c, r, art.t('ST1')); else if (h % 53 === 9) nes0.ppu.setTile(0, c, r, art.t('ST2'));
    }
  }

  function sprPals() {
    var ppu = nes0.ppu;
    ppu.setSprPalette(0, [0x01, 0x21, 0x30]); ppu.setSprPalette(1, [0x06, 0x16, 0x26]); ppu.setSprPalette(2, [0x28, 0x38, 0x30]); ppu.setSprPalette(3, [0x0A, 0x2A, 0x30]);
  }
  /* ============================== 標題 ============================== */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr(); g.hud = {};
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_BG0); ppu.setBgPalette(1, PAL_POD); ppu.setBgPalette(2, LAMP_GO); ppu.setBgPalette(3, PAL_HUD);
      sprPals();
      var w = 'STAR REFLEX';
      for (var k = 0; k < w.length; k++) {
        if (w.charAt(k) === ' ') continue;
        var t = art.big(w.charAt(k)), x = 5 + k * 2;
        ppu.setTile(0, x, 3, t[0]); ppu.setTile(0, x + 1, 3, t[1]); ppu.setTile(0, x, 4, t[2]); ppu.setTile(0, x + 1, 4, t[3]);
      }
      ppu.fillAttr(0, 0, 1, 16, 2, 2);
      for (var c = 2; c < 30; c++) { ppu.setTile(0, c, 1, art.t('FR_H')); ppu.setTile(0, c, 25, art.t('FR_H')); }
      txt(6, 6, 'STARDUST REACTION LAB');
      txt(19, 4, 'START PAUSE   C/★ = CHEAT');
      txt(21, 4, 'HOLD START+SELECT: MENU');
      titleRows();
    });
    AU.play('reflex_title');
  }
  function titleRows() {
    var M = MODES[g.msel], C = CFG[M], b = CT.load('reflex', 'avg_' + M, 0);
    txt(9, 3, '> MODE  ' + padR(M, 8) + padR(C.desc, 10));
    txt(11, 3, padR(C.l1, 28));
    txt(13, 3, padR(C.l2, 28));
    txt(15, 3, padR('BEST AVG ' + (b ? ms(b) + 'MS  ' + titleOf(b) : '---'), 28));
    txt(17, 3, padR(M === 'SIMPLE' ? 'GOAL: AVG 333MS OR LESS' : (M === 'CHOICE' ? 'KEYS: ↑ ↓ ← →' : (M === 'COLOR' ? 'KEYS: Ⓐ  HOLD STILL ON OTHERS' : 'KEYS: ↑ ↓ ← →')), 28));
  }

  /* ============================== 開局 ============================== */
  function startRun() {
    var keep = { msel: g.msel };
    g = newState();
    g.msel = keep.msel;
    sess.runs++;
    g.seed = (sess.runs * 7919 + (g.msel + 1) * 104729 + sess.bot.t * 31) & 0x7fffffff || 1;
    if (CT.query && CT.query('seed')) g.seed = parseInt(CT.query('seed'), 10) || 1;
    g.mode = 'play'; g.ph = 'intro'; g.phT = 0;
    var M = MODES[g.msel];
    if (M === 'COLOR') {
      g.target = rnd() % COLORS.length;
      var s = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
      for (var i = s.length - 1; i > 0; i--) { var j = rnd() % (i + 1), tt = s[i]; s[i] = s[j]; s[j] = tt; }
      g.seq = s;
    }
    buildStage();
    AU.play('reflex_lab');
  }
  function buildStage() {
    var ppu = nes0.ppu, M = MODES[g.msel];
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr(); g.hud = {};
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_BG0); ppu.setBgPalette(1, PAL_POD); ppu.setBgPalette(2, LAMP_IDLE); ppu.setBgPalette(3, PAL_HUD);
      sprPals();
      stars();
      var i, r, c;
      if (M === 'SIMPLE' || M === 'COLOR') {
        for (r = 0; r < 6; r++) for (c = 0; c < 6; c++) ppu.setTile(0, 13 + c, 10 + r, art.t('LP_' + (r * 6 + c)));
        setMark('NONE');
        ppu.fillAttr(0, 6, 5, 4, 3, 2);
      } else if (M === 'CHOICE') {
        for (var p = 0; p < 4; p++) {
          for (i = 0; i < 16; i++) ppu.setTile(0, POD[p][0] + (i & 3), POD[p][1] + (i >> 2), art.t('POD_' + i));
          for (i = 0; i < 4; i++) ppu.setTile(0, POD[p][0] + 1 + (i & 1), POD[p][1] + 1 + (i >> 1), art.t('PA_' + DIRS[p] + '_' + i));
          ppu.fillAttr(0, POD[p][0] >> 1, POD[p][1] >> 1, 2, 2, 1);
        }
        for (i = 0; i < 4; i++) ppu.setTile(0, 15 + (i & 1), 11 + (i >> 1), art.t('HUB_' + i));
        ppu.fillAttr(0, 7, 5, 2, 2, 1);
        ppu.setBgPalette(2, PAL_LIT);
      }
      for (c = 0; c < 32; c++) { if (M === 'SIMPLE' || M === 'COLOR') ppu.setTile(0, c, 4, art.t('FR_H')); ppu.setTile(0, c, 22, art.t('FR_H')); }
      ppu.fillAttr(0, 0, 0, 16, 2, 3);
      ppu.fillAttr(0, 0, 11, 16, 4, 3);
      g.lit = -1; g.lampKey = '';
      drawHud();
    });
  }
  function setMark(nm) {
    var ppu = nes0.ppu;
    if (g.markNm === nm) return;
    g.markNm = nm;
    for (var i = 0; i < 4; i++) ppu.setTile(0, 15 + (i & 1), 12 + (i >> 1), art.t('MK_' + nm + '_' + i));
  }
  function setLamp(key, pal) { if (g.lampKey === key) return; g.lampKey = key; nes0.ppu.setBgPalette(2, pal); }
  function setLit(p) {
    if (g.lit === p) return;
    if (g.lit >= 0) nes0.ppu.fillAttr(0, POD[g.lit][0] >> 1, POD[g.lit][1] >> 1, 2, 2, 1);
    g.lit = p;
    if (p >= 0) nes0.ppu.fillAttr(0, POD[p][0] >> 1, POD[p][1] >> 1, 2, 2, 2);
  }

  /* ============================== HUD ============================== */
  function stats() {
    var okR = [], errs = 0, misses = 0, rej = 0;
    g.trials.forEach(function (t) {
      if (t.res === 'ok' || t.res === 'slow') okR.push(t.rt);
      else if (t.res === 'err') errs++;
      else if (t.res === 'miss') misses++;
      else if (t.res === 'rej') rej++;
    });
    var sum = 0; okR.forEach(function (v) { sum += v; });
    return { n: okR.length, avg: okR.length ? Math.round(sum / okR.length) : 0, best: okR.length ? Math.min.apply(null, okR) : 0, errs: errs, misses: misses, rej: rej };
  }
  function drawHud() {
    var M = MODES[g.msel], C = CFG[M], S = stats();
    txt(1, 1, padR(M + ' TEST', 14) + 'TRY ' + pad(Math.min(C.n, g.trials.length + (g.ph === 'intro' ? 0 : 1)), 2) + '/' + pad(C.n, 2) + '   ');
    var ins = M === 'COLOR' ? 'Ⓐ ONLY ON ' + SHAPE_CH[COLORS[g.target].sh] + ' ' + COLORS[g.target].id : C.l1;
    txt(2, 1, padR(ins, 30));
    txt(3, 1, padR(M === 'ARROW' && g.trials.length >= 10 ? 'HOLLOW RED = OPPOSITE' : (M === 'ARROW' && g.trials.length >= 5 ? 'IGNORE WHERE IT IS' : ''), 22) + 'FALSE ' + g.falses + ' ');
    var st;
    if (g.paused) st = 'PAUSE';
    else if (g.ph === 'intro') st = 'PRESS Ⓐ TO START';
    else if (g.ph === 'wait') st = M === 'SIMPLE' ? 'WAIT...' : 'GET READY...';
    else if (g.ph === 'stim') st = M === 'COLOR' ? '?' : 'GO!';
    else st = g.msg;
    txt(23, 1, padR(st, 30));
    txt(25, 1, padR('AVG ' + (S.n ? padL(ms(S.avg), 3) + 'MS' : '---  ') + '  BEST ' + (S.n ? padL(ms(S.best), 3) + 'MS' : '---  ') + '  ERR ' + (S.errs + S.misses), 30));
    if (g.paused) txt(27, 1, padR('HOLD START+SELECT: MENU', 30));
    else {
      var last = g.trials.slice(-5).map(function (t) { return t.res === 'ok' || t.res === 'slow' ? padL(ms(t.rt), 3) : (t.res === 'rej' ? 'OK ' : (t.res === 'err' ? 'ERR' : 'MIS')); });
      txt(27, 1, padR('LAST ' + last.join(' '), 30));
    }
  }

  /* ============================== 測驗流程 ============================== */
  function relevant(I) {
    var M = MODES[g.msel];
    if (M === 'SIMPLE' || M === 'COLOR') return (I.pressed(BTN.A) || I.pressed(BTN.B)) ? 1 : 0;
    for (var d = 0; d < 4; d++) if (I.pressed(DIR_BTN[d])) return 1 << d;
    return 0;
  }
  function newWait() {
    var C = CFG[MODES[g.msel]];
    g.ph = 'wait'; g.waitT = C.d0 + rnd() % (C.d1 - C.d0 + 1); g.stim = null;
    var M = MODES[g.msel];
    if (M === 'SIMPLE') { setLamp('wait', LAMP_WAIT); setMark('NONE'); }
    if (M === 'COLOR') { setLamp('idle', LAMP_IDLE); setMark('NONE'); }
    if (M === 'CHOICE') setLit(-1);
  }
  function showStim() {
    var M = MODES[g.msel], k = g.trials.length;
    g.ph = 'stim'; g.stimF = g.ft; g.stimId++;
    if (M === 'SIMPLE') { g.stim = { go: 1 }; setLamp('go', LAMP_GO); setMark('STAR'); AU.sfx('reflex_go'); }
    else if (M === 'CHOICE') { var p = rnd() % 4; g.stim = { dir: p }; setLit(p); AU.sfx('reflex_tick'); }
    else if (M === 'COLOR') {
      var go = g.seq[k], col = go ? g.target : (g.target + 1 + rnd() % (COLORS.length - 1)) % COLORS.length;
      g.stim = { go: go, color: col };
      setLamp('c' + col, [0x10, COLORS[col].c, 0x0F]); setMark(art ? RX.Art.SHAPES[COLORS[col].sh] : 'NONE');
      AU.sfx('reflex_tick');
    } else {
      var dir = rnd() % 4, lvl = k < 5 ? 1 : (k < 10 ? 2 : 3), pos = -1, hol = lvl === 3 && rnd() % 100 < 45, rr = rnd() % 10;
      // 第 2 級起：50% 出現在反方向那一側、40% 出現在其他側、10% 同側（位置與方向衝突是常態）
      if (lvl >= 2) pos = rr < 5 ? OPP[dir] : (rr < 9 ? (dir < 2 ? 2 : 0) + (rnd() & 1) : dir);
      g.stim = { dir: dir, pos: pos, hollow: hol, want: hol ? OPP[dir] : dir, lvl: lvl };
      AU.sfx('reflex_tick');
    }
  }
  function record(res, rt, msg, sfx) {
    g.trials.push({ res: res, rt: rt });
    g.ph = 'fb'; g.phT = 50; g.msg = msg; AU.sfx(sfx);
    if (MODES[g.msel] === 'CHOICE') setLit(-1);
  }
  function falseStart(msg) {
    g.falses++;
    g.ph = 'fb'; g.phT = 60; g.msg = msg; AU.sfx('reflex_false');
    var M = MODES[g.msel];
    if (M === 'SIMPLE' || M === 'COLOR') { setLamp('idle', LAMP_IDLE); setMark('NONE'); }
    if (M === 'CHOICE') setLit(-1);
    g.stim = null;
  }
  function updateTest() {
    var I = NES.Input, M = MODES[g.msel], C = CFG[M];
    g.ft++;
    if (g.ph === 'intro') {
      g.phT++;
      if (g.phT > 10 && (I.pressed(BTN.A) || I.pressed(BTN.B))) { AU.sfx('reflex_ok'); newWait(); }
      return;
    }
    if (g.ph === 'fb') {
      if (--g.phT <= 0) {
        if (g.trials.length >= C.n) { enterResult(); return; }
        newWait();
      }
      return;
    }
    var k = relevant(I);
    if (g.ph === 'wait') {
      if (k) { falseStart('FALSE START!  TRY AGAIN'); return; }
      if (--g.waitT <= 0) showStim();
      return;
    }
    // stim
    var rt = g.ft - g.stimF, s = g.stim;
    if (k) {
      if (M === 'SIMPLE') {
        if (rt < ANTICIP) falseStart('TOO SOON! ' + ms(rt) + 'MS');
        else record('ok', rt, ms(rt) + ' MS  ' + titleOf(rt), 'reflex_hit');
      } else if (M === 'CHOICE' || M === 'ARROW') {
        var want = M === 'CHOICE' ? s.dir : s.want;
        if (k === (1 << want)) { if (rt < ANTICIP) falseStart('TOO SOON!'); else record('ok', rt, ms(rt) + ' MS', 'reflex_hit'); }
        else record('err', rt, 'WRONG WAY!', 'reflex_err');
      } else {
        if (s.go) { if (rt < ANTICIP) falseStart('TOO SOON!'); else record('ok', rt, ms(rt) + ' MS', 'reflex_hit'); }
        else record('err', rt, 'NOT THAT COLOR!', 'reflex_err');
      }
      return;
    }
    var to = M === 'COLOR' && !s.go ? C.nogo : C.to;
    if (rt >= to) {
      if (M === 'COLOR') { if (s.go) record('miss', to, 'MISSED IT!', 'reflex_err'); else record('rej', 0, 'GOOD HOLD!', 'reflex_ok'); setLamp('idle', LAMP_IDLE); setMark('NONE'); }
      else record('slow', to, 'TOO SLOW', 'reflex_err');
    }
  }
  function setPause(p) {
    g.paused = p;
    if (p) {
      AU.pause();
      if (g.ph === 'wait' || g.ph === 'stim') g.resumeRedo = true;
    } else {
      AU.resume();
      if (g.resumeRedo) { g.resumeRedo = false; newWait(); }
    }
    drawHud();
  }

  /* ============================== 結算 ============================== */
  function enterResult() {
    var M = MODES[g.msel], S = stats();
    g.mode = 'result'; g.overT = 0; g.avg = S.avg; g.best = S.best;
    g.newBest = false;
    if (!g.cheated && S.n) {
      var pb = CT.load('reflex', 'avg_' + M, 0);
      if (!pb || S.avg < pb) { CT.save('reflex', 'avg_' + M, S.avg); g.newBest = true; }
      if (M === 'SIMPLE' && g.falses === 0 && S.n === CFG.SIMPLE.n && S.avg <= GOAL_AVG && !sess.cheated) sess.goal = true;
      sess.done[M] = { avg: S.avg, falses: g.falses, errs: S.errs + S.misses };
    }
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0);
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr(); g.hud = {};
      ppu.setBgPalette(3, PAL_HUD);
      for (var c = 3; c < 29; c++) { ppu.setTile(0, c, 2, art.t('FR_H')); ppu.setTile(0, c, 26, art.t('FR_H')); }
      txt(4, 4, M + ' TEST  RESULT' + (g.cheated ? '  CHEAT' : ''));
      g.trials.forEach(function (t, i) {
        var col = 4 + (i / 5 | 0) * 9, row = 6 + (i % 5);
        txt(row, col, pad(i + 1, 2) + ' ' + (t.res === 'ok' || t.res === 'slow' ? padL(ms(t.rt), 3) + (t.res === 'slow' ? 'S' : ' ') : (t.res === 'rej' ? 'OK  ' : (t.res === 'err' ? 'ERR ' : 'MISS'))));
      });
      txt(12, 4, 'AVERAGE   ' + (S.n ? padL(ms(S.avg), 3) + ' MS  (' + S.avg + 'F)' : '---'));
      txt(14, 4, 'BEST      ' + (S.n ? padL(ms(S.best), 3) + ' MS' : '---'));
      txt(16, 4, 'FALSE ' + g.falses + '   ERRORS ' + (S.errs + S.misses));
      txt(18, 4, 'TITLE  ' + (S.n ? titleOf(S.avg) : '---') + (g.newBest ? '  NEW BEST!' : ''));
      if (M === 'SIMPLE') txt(20, 4, (sess.goal && !g.cheated ? 'GOAL CLEAR!  ' : 'GOAL: AVG 333MS 0 FALSE'));
      txt(22, 4, 'START TITLE   A AGAIN');
      txt(24, 4, 'C/★ = REDO THE WORST TRY');
    });
    AU.play('reflex_result');
  }
  // §6-1 原地續關：刪掉最差的一次，回去補測
  function continueRun() {
    var worst = -1, wv = -1;
    g.trials.forEach(function (t, i) { var v = t.res === 'err' || t.res === 'miss' ? 9999 : (t.res === 'rej' ? -1 : t.rt); if (v > wv) { wv = v; worst = i; } });
    if (worst >= 0) g.trials.splice(worst, 1);
    g.cheated = true; sess.cheated = true; g.continues++;
    g.mode = 'play'; g.paused = false;
    buildStage();
    AU.play('reflex_lab');
    newWait();
  }

  /* ============================== 精靈 ============================== */
  function drawSprites() {
    var ppu = nes0.ppu, list = [], i;
    if (g.mode === 'play' && MODES[g.msel] === 'ARROW' && g.ph === 'stim' && g.stim && !g.paused) {
      var s = g.stim, p = s.pos < 0 ? ARW_C : ARW_POS[s.pos], vert = s.dir < 2, pre = (s.hollow ? 'O' : 'A') + (vert ? 'U' : 'R') + '_';
      var fv = s.dir === 1, fh = s.dir === 2;
      for (i = 0; i < 16; i++) {
        var cx = i & 3, cy = i >> 2;
        if (fh) cx = 3 - cx; if (fv) cy = 3 - cy;
        list.push({ x: p.x + cx * 8, y: p.y + cy * 8, tile: art.s(pre + i), pal: s.hollow ? 1 : 0, flipH: fh, flipV: fv });
      }
    }
    if (g.mode === 'title') {
      var ty = 52 + ((g.t >> 4) & 1);
      list.push({ x: 24, y: ty, tile: art.s('SPARK'), pal: 2 }); list.push({ x: 224, y: ty, tile: art.s('SPARK'), pal: 3 });
    }
    for (i = 0; i < list.length && i < 62; i++) ppu.sprite(i, list[i]);
    for (var j = list.length; j < g.sprUsed; j++) ppu.sprite(j, null);
    g.sprUsed = list.length;
    var ml = list.length >= 16 ? 4 : (list.length ? 1 : 0);
    if (ml > g.maxLine) g.maxLine = ml;
  }

  /* ============================== 機器人（人類反應延遲） ============================== */
  // 只看畫面上當下看得到的刺激（燈色 / 亮的艙 / 箭頭方向與實心空心），看到之後等 lag 幀才按；等待期間不碰按鍵。
  function botMask() {
    var B = sess.bot;
    B.t++;
    if (g.mode === 'title') {
      if (g.msel !== 0) return B.t % 10 ? 0 : BTN.LEFT;
      return (g.t > 30 && B.t % 20 === 0) ? BTN.START : 0;
    }
    if (g.mode === 'result') return (!sess.goal && g.overT > 90 && B.t % 30 === 0) ? BTN.START : 0;
    if (g.paused) return 0;
    if (g.ph === 'intro') return (g.phT > 20 && B.t % 10 === 0) ? BTN.A : 0;
    if (g.ph !== 'stim' || !g.stim) return 0;
    if (B.seenId !== g.stimId) { B.seenId = g.stimId; B.seenT = B.t; }
    if (B.t - B.seenT < B.lag - 1) return 0;
    var M = MODES[g.msel], s = g.stim;
    if (M === 'SIMPLE') return BTN.A;
    if (M === 'COLOR') return s.go ? BTN.A : 0;
    if (M === 'CHOICE') return DIR_BTN[s.dir];
    return DIR_BTN[s.hollow ? OPP[s.dir] : s.dir];
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'reflex', order: 6, title: '星塵反應', legacy: ['reaction-time.html', 'reflex-test.html', 'reflex-tester.html', 'color-reaction.html', 'direction-challenge.html'],
    init: function (nes) {
      nes0 = nes;
      art = RX.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'reflex_bg');
      NES.CHR.setPattern(1, 'reflex_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: art.s('BACK'), pal: 2 };
      AU.init(nes);
      if (!sess) sess = newSess();
      var lag = CT.query ? parseInt(CT.query('lag'), 10) : NaN;
      if (!isNaN(lag)) sess.bot.lag = lag;
      g = newState();
      var qm = CT.query ? CT.query('xmode') : null;
      if (qm && MODES.indexOf(qm.toUpperCase()) >= 0) { g.msel = MODES.indexOf(qm.toUpperCase()); startRun(); }
      else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'result') continueRun();
        else if (g.mode === 'play') { g.cheated = true; sess.cheated = true; g.falses = 0; g.continues++; g.msg = 'STAR HELP! FALSE = 0'; if (g.ph === 'wait' || g.ph === 'stim' || g.ph === 'fb') newWait(); AU.sfx('reflex_ok'); }
      }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.LEFT) || I.pressed(BTN.UP)) { g.msel = (g.msel + 3) % 4; titleRows(); AU.sfx('reflex_move'); }
        else if (I.pressed(BTN.RIGHT) || I.pressed(BTN.DOWN)) { g.msel = (g.msel + 1) % 4; titleRows(); AU.sfx('reflex_move'); }
        else if ((I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) { AU.sfx('reflex_ok'); startRun(); }
      } else if (g.mode === 'result') {
        g.overT++;
        if (g.overT > 30 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
        else if (g.overT > 30 && I.pressed(BTN.A)) startRun();
      } else {
        if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) setPause(!g.paused);
        if (!g.paused) updateTest();
      }
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') { if ((g.t & 31) === 0) txt(23, 11, (g.t & 32) ? '          ' : 'PUSH START'); }
      else if (g.mode === 'play') drawHud();
      drawSprites();
    },
    state: function () {
      var S = g.mode === 'title' ? { n: 0, avg: 0, best: 0, errs: 0, misses: 0, rej: 0 } : stats();
      return {
        mode: g.mode, game: MODES[g.msel], ph: g.ph, paused: g.paused, ft: g.ft, stimF: g.stimF, stimId: g.stimId, stim: g.stim,
        trials: g.trials.map(function (t) { return [t.res, t.rt]; }), n: S.n, avg: S.avg, best: S.best, avgMs: ms(S.avg), errs: S.errs, misses: S.misses, rej: S.rej,
        falses: g.falses, target: g.mode === 'title' ? '' : COLORS[g.target].id, lit: g.lit, cheated: g.cheated, sessCheated: sess.cheated, continues: g.continues,
        musicPaused: !!(AU.state() && AU.state().paused), lag: sess.bot.lag, maxLine: g.maxLine, title: S.n ? titleOf(S.avg) : '', goal: GAME.goal()
      };
    },
    exit: function () {
      if (g && g.mode === 'play' && !g.cheated) {
        var S = stats(), M = MODES[g.msel], pb = CT.load('reflex', 'avg_' + M, 0);
        if (S.n >= CFG[M].n && (!pb || S.avg < pb)) CT.save('reflex', 'avg_' + M, S.avg);
      }
      AU.stop();
    },
    cheat: function () { if (!g || g.mode === 'title' || (g.mode === 'play' && g.ph === 'intro')) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(sess && sess.goal && !sess.cheated); },
    bestText: function () { return bestFmt(CT.load('reflex', 'avg_SIMPLE', 0)); }
  };
  RX.MODES = MODES; RX.CFG = CFG; RX.COLORS = COLORS; RX.GOAL_AVG = GOAL_AVG; RX.ANTICIP = ANTICIP;
  RX.dev = {
    g: function () { return g; }, sess: function () { return sess; },
    start: function (mode) { g.msel = Math.max(0, MODES.indexOf(mode || 'SIMPLE')); startRun(); },
    ms: ms, titleOf: titleOf, bestFmt: bestFmt, resetSess: function () { sess = newSess(); }, setLag: function (l) { sess.bot.lag = l; }
  };
  if (CT.register) CT.register(GAME);
})();
