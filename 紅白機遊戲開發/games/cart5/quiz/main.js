/*
 * games/cart5/quiz/main.js — 《星塵問答》快問快答 + 心算（合輯卡帶五，id = quiz，全域 CT.Quiz）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-5 cart5-quiz（R9）｜ 依賴：engine/*、games/cart1/registry.js、games/cart5/text.js（CT.Text）、
 *         quiz/{text_bank,text_ui,art,math,song}.js
 * 舊作概念：legacy rapid-fire-quiz / math-challenge / quick-math（只取「限時答題、心算、分級」；題目 / 文字 / 畫面 / 配樂全原創）。
 *
 * 四個模式：
 *   限時連答 TIME ATTACK  60 秒（題目文字還在打字時不計時）；四選一，↑↓ 選 + A 確定；答對 100 + 難度加分 + 速度加分 + 連對加分，
 *                         答錯扣 5 秒；第 1~6 題初級、7~14 題中級、15 題起高級。goal = 本模式一局 ≥ GOAL_SCORE（不開密技、全部分類）。
 *   生存挑戰 SURVIVAL     3 顆心、每題限時 12 秒，答錯 / 超時扣 1 心；每答對 5 題升一級。
 *   對戰電腦 VS CPU       10 題搶答：選項出完後雙方同時作答，先答對得 1 分；答錯的一方本題出局。電腦 3 級（反應 / 正確率）。
 *   心算衝刺 MATH RUSH    60 秒；題目由 math.js 程式產生（8 級）；畫面數字鍵盤（十字鍵一格一格：首延遲 12 幀、之後每 4 幀）
 *                         A 按鍵、B 刪一位、ＯＫ 送出；答對 +1 秒、連對加分、每 5 題升級。
 * 版面（名稱表 32×30；HUD 不貼頂）：第 2 列 HUD（8×8 自有字型）、第 3 列時間條、第 4~13 列題目框（CT.Text 全形字）、
 *   第 15 / 18 / 21 / 24 列四個選項、第 27 列狀態列（8×8）。中文一律走 CT.Text（字形動態上傳、計 VBlank 預算）。
 * 網址：`cart5.html?game=quiz&debug=1[&bot=1][&hum=0..3][&lag=N][&seed=N][&mode=0..3][&cat=-1..5][&acc=0..100]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var QZ = CT.Quiz = CT.Quiz || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var ID = 'quiz';
  var HUD_ROW = 2, BAR_ROW = 3, FB_ROW = 27;
  var QF = { x: 1, y: 4, w: 30, h: 10 }, CAT_ROW = 5, Q_ROW = 7, Q_COL = 3, Q_W = 26;
  var OPT_ROWS = [15, 18, 21, 24], OPT_COL = 5, OPT_W = 24;
  var TA_TIME = 60 * 60, TA_WRONG = 5 * 60, SURV_LIMIT = 12 * 60, SURV_LIVES = 3, VS_LIMIT = 10 * 60, VS_TOTAL = 10;
  var MATH_TIME = 60 * 60, MATH_BONUS = 60, JUDGE_F = 60, READY_F = 90;
  // goal 門檻與電腦強度都依「真人讀題模型」（下方 HUMAN；fix-r9-quiz）量過：test_quiz.py 用同一個模型蒙地卡羅驗證。
  //   限時連答 1200 分：快手 ~97%、一般 ~62%、慢讀 ~22%（原 3000 分：一般 0%）。
  var GOAL_SCORE = 1200;
  // 電腦 3 級：作答時間（選項出完後幾幀，再加難度 × 20）、正確率。一般玩家勝率 新手 ~94% / 普通 ~43% / 高手 ~10%。
  var CPU = [{ min: 240, max: 420, acc: 0.55 }, { min: 210, max: 350, acc: 0.7 }, { min: 200, max: 340, acc: 0.8 }];
  // 真人讀題模型（每題作答時間，從選項出完起算）：
  //   秒 = (orient + (題目字數 + 四選項字數) / cps + think[難度]) × e^N(0, 0.25)；再加游標每格 MOVE_F 幀 + 按 A PRESS_F 幀。
  //   正確率依難度 acc[初/中/高]。0 快手 / 1 一般 / 2 慢讀 / 3 小朋友。機器人（?bot=1&hum=N，預設 0）照這個模型作答。
  var HUMAN = {
    MOVE_F: 17, PRESS_F: 15, SD: 0.25,
    profiles: [
      { name: 'fast', cps: 12, orient: 0.4, think: [0.2, 0.5, 0.9], acc: [0.95, 0.85, 0.70] },
      { name: 'normal', cps: 8, orient: 0.6, think: [0.3, 0.8, 1.3], acc: [0.92, 0.78, 0.60] },
      { name: 'slow', cps: 6, orient: 0.8, think: [0.4, 1.0, 1.6], acc: [0.90, 0.75, 0.55] },
      { name: 'kid', cps: 5, orient: 0.8, think: [0.5, 1.2, 2.0], acc: [0.85, 0.60, 0.40] }
    ]
  };
  var KEYS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['DEL', '0', 'OK']];
  var KEY_ROWS = [14, 17, 20, 23], KEY_COLS = [10, 15, 20];
  var KF = { x: 7, y: 13, w: 18, h: 13 };
  var MF = { x: 1, y: 4, w: 30, h: 8 }, M_PROB_ROW = 6, M_ANS_ROW = 9;
  var MODES_EN = ['TIME ATTACK', 'SURVIVAL', 'VS CPU', 'MATH RUSH'];
  var PAL_BG = [[0x13, 0x23, 0x30], [0x07, 0x28, 0x38], [0x1C, 0x2C, 0x3C], [0x06, 0x16, 0x26]];
  var PAL_SPR = [[0x27, 0x38, 0x30], [0x1A, 0x2A, 0x3A], [0x06, 0x16, 0x26], [0x01, 0x21, 0x31]];
  var PAL_HIDE = [0x0F, 0x0F, 0x0F];

  var A = null, Au = null, U = null, nes0 = null, ppu0 = null, T = null, g = null;
  var shadow = new Array(32 * 30);

  /* ============================== 小工具 ============================== */
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function center(s, w) { s = String(s); var l = Math.max(0, Math.floor((w - s.length) / 2)); return pad(new Array(l + 1).join(' ') + s, w); }
  function rnd() { g.seed = (Math.imul(g.seed, 1103515245) + 12345) & 0x7FFFFFFF; return g.seed / 0x80000000; }
  function brnd() { g.bseed = (Math.imul(g.bseed, 1103515245) + 12345) & 0x7FFFFFFF; return g.bseed / 0x80000000; }
  function sfx(n) { Au.sfx(n); }
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  function startPressed() { return pressed(BTN.START) && !held(BTN.SELECT); }
  function q(k) { return (CT.query && CT.query(k)) || null; }
  function qint(k, lo, hi, d) { var v = parseInt(q(k) || '', 10); return isFinite(v) && v >= lo && v <= hi ? v : d; }
  function seedNow() { var s = qint('seed', 1, 0x7FFFFFFE, 0); return s || ((Date.now() & 0x7FFFFFFF) || 7); }

  // HUD 8×8：只寫有變的格子（名稱表 1 byte / 格）
  function tileOf(c) {
    if (c === '*') return A.t('STAR');
    if (c === '~') return A.t('STAR0');
    if (c === '#') return A.t('HEART');
    if (c === '_') return A.t('HEART0');
    return A.ch(c);
  }
  function put(c, r, t) {
    var i = r * 32 + c;
    if (shadow[i] === t) return;
    shadow[i] = t;
    ppu0.setTile(0, c, r, t);
  }
  function text8(c, r, s) { for (var i = 0; i < s.length; i++) put(c + i, r, tileOf(s.charAt(i))); }
  function line8(r, s) { text8(1, r, pad(s, 30)); }
  function bar(r, frac) {
    var n = Math.max(0, Math.min(224, Math.round(frac * 224)));
    for (var i = 0; i < 28; i++) put(2 + i, r, A.t('BAR' + Math.max(0, Math.min(8, n - i * 8))));
  }
  function attrRows(r16a, r16b, p) { for (var r = r16a; r <= r16b; r++) for (var c = 0; c < 16; c++) ppu0.setAttr(0, c, r, p); }

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'title', game: 0, sel: 0, cat: -1, cpuLv: 1, mLv: 1, frames: 0, blink: 0, seed: 1, bseed: 99, paused: false, t: 0,
      // 題目
      phase: 'idle', qq: null, opts: [], ans: 0, cur: 0, qn: 0, qTime: 0, used: {}, judge: null, lastPick: -1,
      // 共用計分
      score: 0, combo: 0, maxCombo: 0, correct: 0, answered: 0, timeLeft: 0, lives: 0, lv: 1, lvCount: 0,
      // 對戰
      you: 0, cpu: 0, total: VS_TOTAL, youOut: false, cpuOut: false, cpuAt: 0, cpuPick: -1, youPick: -1,
      // 心算
      prob: null, input: '', kr: 1, kc: 1, hold: 0, solved: 0,
      // 結算
      result: null, endT: 0, over: false, cheats: 0, runCheats: 0, goalHit: false, newBest: false,
      bot: { wait: 0, plan: null, rel: 0, q: -1, pageT: 0 }
    };
  }

  /* ============================== 題目挑選 ============================== */
  function levelFor(n) { return n <= 6 ? 1 : (n <= 14 ? 2 : 3); }
  function pickQuestion(lv) {
    var B = QZ.BANK, cand = [], i;
    function scan(fn) { cand = []; for (i = 0; i < B.length; i++) if (!g.used[B[i].id] && (g.cat < 0 || B[i].cat === g.cat) && fn(B[i])) cand.push(B[i]); }
    scan(function (x) { return x.lv === lv; });
    if (!cand.length) scan(function (x) { return Math.abs(x.lv - lv) <= 1; });
    if (!cand.length) scan(function () { return true; });
    if (!cand.length) { g.used = {}; scan(function (x) { return x.lv === lv; }); if (!cand.length) scan(function () { return true; }); }
    var qq = cand[Math.floor(rnd() * cand.length)];
    g.used[qq.id] = 1;
    return qq;
  }
  function shuffleOpts(qq) {
    var idx = [0, 1, 2, 3], i;
    for (i = 3; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    var opts = idx.map(function (k) { return qq.opts[k]; });
    return { opts: opts, ans: idx.indexOf(0) };
  }

  /* ============================== 流程 ============================== */
  function toTitle() {
    g.mode = 'title'; g.paused = false; g.phase = 'idle';
    removeBox();
    redraw();
    Au.stop(); Au.play('quiz_title');
  }
  function toHelp() {
    g.mode = 'help'; g.t = 0;
    redraw();
    sfx('quiz_menu');
  }
  function removeBox() { if (g.box) { T.remove(g.box); g.box = null; } }
  function startRun() {
    removeBox();
    g.seed = seedNow(); g.bseed = (g.seed * 7 + 13) & 0x7FFFFFFF || 5;
    g.game = g.sel; g.paused = false; g.over = false; g.result = null; g.endT = 0; g.runCheats = 0; g.newBest = false;
    g.score = 0; g.combo = 0; g.maxCombo = 0; g.correct = 0; g.answered = 0; g.qn = 0; g.used = {}; g.judge = null;
    g.lv = 1; g.lvCount = 0; g.you = 0; g.cpu = 0; g.total = VS_TOTAL; g.solved = 0;
    g.timeLeft = g.game === 0 ? TA_TIME : (g.game === 3 ? MATH_TIME : 0);
    g.lives = SURV_LIVES;
    if (g.game === 3) { g.lv = g.mLv; g.kr = 1; g.kc = 1; g.input = ''; g.prob = null; }
    g.phase = 'idle'; g.qq = null;
    g.mode = 'ready'; g.t = 0;
    redraw();
    Au.stop(); Au.play(g.game === 3 ? 'quiz_math' : 'quiz_play');
  }
  function setPause(on) {
    if (g.paused === on) return;
    g.paused = on;
    if (on) Au.pause(); else if (!Au.resume()) Au.play(g.game === 3 ? 'quiz_math' : 'quiz_play');
    redraw();
    sfx('quiz_menu');
  }

  /* ---------- 快問快答：出題 / 作答 / 判定 ---------- */
  function clearQuestion() {
    T.clear(Q_COL, CAT_ROW, 12, 2);
    T.clear(Q_COL, Q_ROW, Q_W, 6);
    for (var k = 0; k < 4; k++) T.clear(OPT_COL, OPT_ROWS[k], OPT_W, 2);
    for (var c = 24; c < 29; c++) put(c, CAT_ROW + 1, 0);
  }
  function printQuestion() {
    var qq = g.qq;
    T.print(Q_COL, CAT_ROW, QZ.CATS[qq.cat], { style: { fg: 2 } });
    for (var s = 0; s < 3; s++) put(25 + s, CAT_ROW + 1, A.t(s < qq.lv ? 'STAR' : 'STAR0'));
    T.print(Q_COL, Q_ROW, qq.q, { w: Q_W });
    for (var k = 0; k < 4; k++) T.print(OPT_COL, OPT_ROWS[k], g.opts[k]);
  }
  function nextQuestion() {
    g.qn++;
    var lv = g.game === 0 ? levelFor(g.qn) : (g.game === 1 ? g.lv : vsLevel());
    g.qq = pickQuestion(lv);
    var sh = shuffleOpts(g.qq);
    g.opts = sh.opts; g.ans = sh.ans; g.cur = 0; g.qTime = 0; g.judge = null;
    g.youOut = false; g.cpuOut = false; g.youPick = -1; g.cpuPick = -1;
    g.phase = 'print'; g.t = 0;
    clearQuestion();
    printQuestion();
    if (g.game === 2) planCpu();
  }
  function vsLevel() {
    var r = rnd();
    if (g.cpuLv === 0) return r < 0.6 ? 1 : 2;
    if (g.cpuLv === 1) return r < 0.3 ? 1 : (r < 0.75 ? 2 : 3);
    return r < 0.4 ? 2 : 3;
  }
  function planCpu() {
    var C = CPU[g.cpuLv];
    g.cpuAt = C.min + Math.floor(rnd() * (C.max - C.min + 1)) + (g.qq.lv - 1) * 20;
    g.cpuRight = rnd() < C.acc;
  }
  function wrongOpt(except) {
    var w = [];
    for (var k = 0; k < 4; k++) if (k !== g.ans && except.indexOf(k) < 0) w.push(k);
    return w.length ? w[Math.floor(rnd() * w.length)] : -1;
  }
  function answer(k) {
    if (g.phase !== 'answer' || g.mode !== 'play' || g.paused) return false;
    g.lastPick = k;
    if (g.game === 2) {
      if (g.youOut) return false;
      g.youPick = k;
      if (k === g.ans) { g.you++; judge('you'); }
      else { g.youOut = true; sfx('quiz_ng'); line8(FB_ROW, center('WRONG! WAIT FOR CPU', 30)); if (g.cpuOut) judge('none'); }
      return true;
    }
    g.answered++;
    var ok = k === g.ans;
    if (ok) {
      g.correct++; g.combo++; if (g.combo > g.maxCombo) g.maxCombo = g.combo;
      var gain;
      if (g.game === 0) gain = 100 + (g.qq.lv - 1) * 50 + Math.max(0, 50 - Math.floor(g.qTime / 6)) + 10 * Math.min(10, g.combo - 1);
      else gain = 100 * g.qq.lv + 10 * Math.min(10, g.combo - 1);
      g.score += gain;
      g.judge = { ok: true, pick: k, gain: gain };
      if (g.game === 1 && ++g.lvCount >= 5 && g.lv < 3) { g.lv++; g.lvCount = 0; g.judge.lvUp = true; }
    } else {
      g.combo = 0;
      g.judge = { ok: false, pick: k };
      if (g.game === 0) g.timeLeft = Math.max(0, g.timeLeft - TA_WRONG);
      else g.lives--;
    }
    g.phase = 'judge'; g.t = 0;
    sfx(ok ? (g.judge.lvUp ? 'quiz_lv' : 'quiz_ok') : 'quiz_ng');
    line8(FB_ROW, center(ok ? 'GOOD! +' + g.judge.gain + (g.combo > 1 ? '  COMBO ' + g.combo : '') : (g.game === 0 ? 'MISS!  -5 SEC' : 'MISS!  -1 LIFE'), 30));
    return true;
  }
  function timeoutQuestion() {        // 生存：超時
    g.answered++; g.combo = 0; g.lives--;
    g.judge = { ok: false, pick: -1, timeout: true };
    g.phase = 'judge'; g.t = 0;
    sfx('quiz_ng');
    line8(FB_ROW, center('TIME UP!  -1 LIFE', 30));
  }
  function judge(who) {               // 對戰：本題結束
    g.judge = { who: who };
    g.phase = 'judge'; g.t = 0;
    if (who === 'you') { sfx('quiz_ok'); line8(FB_ROW, center('YOU GOT IT!  +1', 30)); }
    else if (who === 'cpu') { sfx('quiz_lock'); line8(FB_ROW, center('CPU GOT IT!', 30)); }
    else { sfx('quiz_ng'); line8(FB_ROW, center('NO ONE GOT IT', 30)); }
  }
  function cpuAct() {
    if (g.cpuOut || g.phase !== 'answer') return;
    if (g.t < g.cpuAt) return;
    var pick = g.cpuRight ? g.ans : wrongOpt(g.youPick >= 0 ? [g.youPick] : []);
    if (pick < 0) pick = g.ans;
    g.cpuPick = pick;
    if (pick === g.ans) { g.cpu++; judge('cpu'); }
    else {
      g.cpuOut = true; sfx('quiz_lock');
      if (g.youOut) judge('none');
      else line8(FB_ROW, center('CPU MISSED! YOUR TURN', 30));
    }
  }
  function afterJudge() {
    if (g.game === 0) { if (g.timeLeft <= 0) return finish(); }
    else if (g.game === 1) { if (g.lives <= 0) return finish(); }
    else if (g.game === 2) { if (g.qn >= g.total) return finish(); }
    line8(FB_ROW, '');
    nextQuestion();
  }
  function updateQuiz() {
    if (g.phase === 'print') {
      g.t++;
      if (!T.busy()) { g.phase = 'answer'; g.t = 0; if (g.game === 2) line8(FB_ROW, center('CPU IS THINKING...', 30)); }
      return;
    }
    if (g.phase === 'answer') {
      g.t++; g.qTime++;
      if (pressed(BTN.UP)) { g.cur = (g.cur + 3) % 4; sfx('quiz_move'); }
      if (pressed(BTN.DOWN)) { g.cur = (g.cur + 1) % 4; sfx('quiz_move'); }
      if (pressed(BTN.A)) answer(g.cur);
      if (g.phase !== 'answer') return;
      if (g.game === 0) {
        if (--g.timeLeft <= 0) { g.timeLeft = 0; g.combo = 0; g.judge = { ok: false, pick: -1, timeout: true }; g.phase = 'judge'; g.t = 0; sfx('quiz_ng'); line8(FB_ROW, center('TIME UP!', 30)); }
        else if (g.timeLeft <= 300 && g.timeLeft % 60 === 0) sfx('quiz_tick');
      } else if (g.game === 1) {
        if (g.qTime >= SURV_LIMIT) timeoutQuestion();
        else if (SURV_LIMIT - g.qTime <= 180 && (SURV_LIMIT - g.qTime) % 60 === 0) sfx('quiz_tick');
      } else {
        cpuAct();
        if (g.phase === 'answer' && g.qTime >= VS_LIMIT) judge('none');
      }
      return;
    }
    if (g.phase === 'judge') {
      g.t++;
      if (g.t >= JUDGE_F || (g.t >= 20 && pressed(BTN.A))) afterJudge();
    }
  }

  /* ---------- 心算 ---------- */
  function nextProblem() {
    g.prob = QZ.Math.gen(g.lv, rnd);
    g.input = ''; g.judge = null; g.phase = 'answer'; g.t = 0;
    T.clear(MF.x + 1, M_PROB_ROW, MF.w - 2, 2, { force: true });
    T.clear(MF.x + 1, M_ANS_ROW, MF.w - 2, 2, { force: true });
    T.print(probCol(), M_PROB_ROW, g.prob.text);
  }
  function probCol() { return Math.floor((32 - CT.Text.measure(g.prob.text)) / 2); }
  function ansCol() { return 12; }
  function keyAt(r, c) { return KEYS[r][c]; }
  function keyLabel(k) { return k === 'DEL' ? '←' : (k === 'OK' ? 'ＯＫ' : QZ.Math.fw(+k)); }
  function keyW(k) { return CT.Text.measure(keyLabel(k)); }
  function pressKey(k) {
    if (g.phase !== 'answer') return;
    if (k === 'DEL') { delDigit(); return; }
    if (k === 'OK') { submit(); return; }
    if (g.input.length >= 4) { sfx('quiz_ng'); return; }
    if (g.input === '0') { g.input = ''; T.clear(ansCol(), M_ANS_ROW, 2, 2, { force: true }); }
    T.print(ansCol() + g.input.length * 2, M_ANS_ROW, QZ.Math.fw(+k));
    g.input += k;
    sfx('quiz_key');
  }
  function delDigit() {
    if (!g.input.length) return;
    g.input = g.input.substring(0, g.input.length - 1);
    T.clear(ansCol() + g.input.length * 2, M_ANS_ROW, 2, 2, { force: true });
    sfx('quiz_del');
  }
  function submit() {
    if (g.phase !== 'answer' || !g.input.length) { sfx('quiz_ng'); return; }
    var ok = parseInt(g.input, 10) === g.prob.ans;
    g.answered++;
    if (ok) {
      g.correct++; g.solved++; g.combo++; if (g.combo > g.maxCombo) g.maxCombo = g.combo;
      var gain = 10 * g.lv + 5 * Math.min(10, g.combo - 1);
      g.score += gain; g.timeLeft = Math.min(99 * 60, g.timeLeft + MATH_BONUS);
      g.judge = { ok: true, gain: gain };
      if (++g.lvCount >= QZ.Math.PER_LEVEL && g.lv < QZ.Math.LEVELS) { g.lv++; g.lvCount = 0; g.judge.lvUp = true; }
      if (g.lv > CT.load(ID, 'mlv', 1) && g.runCheats === 0) CT.save(ID, 'mlv', g.lv);
      line8(FB_ROW, center('GOOD! +' + gain + (g.judge.lvUp ? '  LEVEL UP!' : (g.combo > 1 ? '  COMBO ' + g.combo : '')), 30));
      sfx(g.judge.lvUp ? 'quiz_lv' : 'quiz_ok');
    } else {
      g.combo = 0;
      g.judge = { ok: false };
      line8(FB_ROW, center('MISS!  ANSWER ' + g.prob.ans, 30));
      sfx('quiz_ng');
    }
    g.phase = 'judge'; g.t = 0;
  }
  function moveKey(dr, dc) {
    var r = g.kr + dr, c = g.kc + dc;
    if (r < 0 || r > 3 || c < 0 || c > 2) return;
    g.kr = r; g.kc = c; sfx('quiz_move');
  }
  function updateMath() {
    // 時間：答題中與判定中都在走（限時模式），只有暫停 / READY 不走
    if (--g.timeLeft <= 0) { g.timeLeft = 0; finish(); return; }
    if (g.timeLeft <= 300 && g.timeLeft % 60 === 0) sfx('quiz_tick');
    // 十字鍵：剛按下立刻走一格；按住首延遲 12 幀、之後每 4 幀
    var d = 0, dirs = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT], i, hit = -1;
    for (i = 0; i < 4; i++) if (pressed(dirs[i])) hit = i;
    if (hit >= 0) { g.hold = 0; d = dirs[hit]; }
    else {
      var h = -1;
      for (i = 0; i < 4; i++) if (held(dirs[i])) h = i;
      if (h >= 0) { g.hold++; if (g.hold >= 12 && (g.hold - 12) % 4 === 0) d = dirs[h]; } else g.hold = 0;
    }
    if (d === BTN.UP) moveKey(-1, 0); else if (d === BTN.DOWN) moveKey(1, 0);
    else if (d === BTN.LEFT) moveKey(0, -1); else if (d === BTN.RIGHT) moveKey(0, 1);
    if (g.phase === 'answer') {
      g.t++;
      if (pressed(BTN.A)) pressKey(keyAt(g.kr, g.kc));
      else if (pressed(BTN.B)) delDigit();
    } else if (g.phase === 'judge') {
      g.t++;
      if (g.t >= (g.judge && g.judge.ok ? 24 : 50)) { line8(FB_ROW, ''); nextProblem(); }
    } else if (g.phase === 'print' || g.phase === 'idle') nextProblem();
  }

  /* ---------- 結算 ---------- */
  function finish() {
    g.mode = 'result'; g.endT = 0; g.paused = false; g.phase = 'idle'; g.newBest = false;
    var r = { lines: [] }, key, win = false;
    if (g.game === 0) {
      r.head = U.result.ta; key = 'best'; g.over = true;
      r.lines = ['SCORE      ' + num(g.score, 6), 'CORRECT    ' + num(g.correct, 2) + '/' + num(g.answered, 2), 'MAX COMBO  ' + num(g.maxCombo, 2)];
      if (g.runCheats === 0 && g.cat < 0 && g.score >= GOAL_SCORE) g.goalHit = true;
      r.lines.push('GOAL       ' + num(GOAL_SCORE, 6) + (g.score >= GOAL_SCORE ? ' OK' : ''));
    } else if (g.game === 1) {
      r.head = U.result.surv; key = 'surv'; g.over = true;
      r.lines = ['SCORE      ' + num(g.score, 6), 'CORRECT    ' + num(g.correct, 3), 'LEVEL      ' + g.lv, 'MAX COMBO  ' + num(g.maxCombo, 2)];
    } else if (g.game === 2) {
      win = g.you > g.cpu;
      r.head = win ? U.result.win : (g.you < g.cpu ? U.result.lose : U.result.draw);
      g.over = g.you < g.cpu;
      r.lines = ['YOU ' + num(g.you, 2) + '  -  ' + num(g.cpu, 2) + ' CPU', 'CPU LEVEL  ' + ['EASY', 'NORMAL', 'HARD'][g.cpuLv]];
      if (win && g.runCheats === 0) { var w = CT.load(ID, 'vsw', 0) + 1; CT.save(ID, 'vsw', w); }
      r.lines.push('WINS       ' + num(CT.load(ID, 'vsw', 0), 3));
      key = null;
    } else {
      r.head = U.result.math; key = 'math'; g.over = true;
      r.lines = ['SCORE      ' + num(g.score, 6), 'SOLVED     ' + num(g.solved, 3) + '/' + num(g.answered, 3), 'LEVEL      ' + g.lv, 'MAX COMBO  ' + num(g.maxCombo, 2)];
    }
    if (key) {
      if (g.runCheats === 0 && g.score > CT.load(ID, key, 0)) { CT.save(ID, key, g.score); g.newBest = true; }
      r.lines.push('BEST       ' + num(CT.load(ID, key, 0), 6));
    }
    g.result = r;
    redraw();
    Au.stop(); Au.play(win || g.newBest ? 'quiz_win' : 'quiz_end');
  }

  /* ============================== update ============================== */
  function update() {
    g.frames++; g.blink++;
    if (g.mode === 'title') return updateTitle();
    if (g.mode === 'help') {
      g.t++;
      if (pressed(BTN.B)) { toTitle(); sfx('quiz_menu'); return; }
      if (g.t > 8 && startPressed()) { startRun(); return; }
      return;
    }
    if (g.mode === 'result') {
      g.endT++;
      if (g.endT > 40) {
        if (pressed(BTN.A) || startPressed()) startRun();
        else if (pressed(BTN.B)) toTitle();
      }
      return;
    }
    if (startPressed()) { setPause(!g.paused); return; }
    if (g.paused) return;
    if (g.mode === 'ready') {
      g.t++;
      if (g.t === 50) { T.clear(10, 8, 12, 2, { force: true }); T.print(13, 8, U.go); sfx('quiz_go'); }
      if (g.t >= READY_F) {
        T.clear(10, 8, 12, 2);
        g.mode = 'play'; g.t = 0;
        line8(FB_ROW, '');
        if (g.game === 3) nextProblem(); else nextQuestion();
      }
      return;
    }
    if (g.game === 3) updateMath(); else updateQuiz();
  }
  function catName(c) { return c < 0 ? U.allCats : QZ.CATS[c]; }
  function optValue() {
    if (g.sel === 2) return U.cpuNames[g.cpuLv];
    if (g.sel === 3) return 'LV' + g.mLv;
    return catName(g.cat);
  }
  function optLabel() { return g.sel === 2 ? U.cpuLabel : (g.sel === 3 ? U.lvLabel : U.catLabel); }
  function refreshTitleOpt() {
    T.clear(8, 21, 16, 2);
    T.print(9, 21, optLabel());
    T.print(15, 21, optValue());
    titleBest();
  }
  function titleBest() {
    var s;
    if (g.sel === 0) s = 'BEST ' + num(CT.load(ID, 'best', 0), 6) + '  GOAL ' + GOAL_SCORE;
    else if (g.sel === 1) s = 'BEST ' + num(CT.load(ID, 'surv', 0), 6);
    else if (g.sel === 2) s = 'WINS ' + num(CT.load(ID, 'vsw', 0), 3);
    else s = 'BEST ' + num(CT.load(ID, 'math', 0), 6) + '  MAX LV' + CT.load(ID, 'mlv', 1);
    line8(24, center(s, 30));
  }
  function updateTitle() {
    var old = g.sel;
    if (pressed(BTN.UP)) g.sel = (g.sel + 3) % 4;
    if (pressed(BTN.DOWN)) g.sel = (g.sel + 1) % 4;
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0), changed = g.sel !== old;
    if (d) {
      if (g.sel === 2) g.cpuLv = (g.cpuLv + d + 3) % 3;
      else if (g.sel === 3) { var mx = Math.max(1, Math.min(8, CT.load(ID, 'mlv', 1))); g.mLv = ((g.mLv - 1 + d + mx) % mx) + 1; }
      else g.cat = ((g.cat + 1 + d + 7) % 7) - 1;
      changed = true;
    }
    if (changed) { refreshTitleOpt(); sfx('quiz_move'); }
    if (pressed(BTN.A) || startPressed()) toHelp();
  }

  /* ============================== 畫面（整片重畫：CT.blank 裡一次寫完） ============================== */
  function redraw() {
    CT.blank(nes0, function () {
      ppu0.fillTiles(0, 0, 0, 32, 30, 0);
      for (var i = 0; i < shadow.length; i++) shadow[i] = 0;
      ppu0.setBackdrop(0x0F);
      for (i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
      ppu0.fillAttr(0, 0, 0, 16, 15, 0);
      T.reset();
      render();
      T.flush();
    });
  }
  function stars(rows) {
    for (var k = 0; k < rows.length; k++) put(rows[k][0], rows[k][1], A.t(k % 3 ? 'DOT' : 'DOT2'));
  }
  function render() {
    if (g.mode === 'title') return renderTitle();
    if (g.mode === 'help') return renderHelp();
    if (g.mode === 'result') return renderResult();
    if (g.paused) return renderPause();
    if (g.game === 3) return renderMath();
    renderQuiz();
  }
  function renderTitle() {
    attrRows(0, 3, 2); attrRows(4, 11, 0); attrRows(12, 14, 1);
    T.frame(8, 2, 16, 6);
    T.print(12, 4, U.title);
    text8(9, 8, center('STARDUST QUIZ', 14));
    T.print(Math.floor((32 - CT.Text.measure(U.sub)) / 2), 9, U.sub);
    for (var k = 0; k < 4; k++) T.print(12, 12 + k * 2, U.modes[k]);
    stars([[2, 3], [29, 5], [4, 12], [27, 13], [3, 19], [28, 20], [6, 26], [25, 1]]);
    T.print(9, 21, optLabel());
    T.print(15, 21, optValue());
    titleBest();
    line8(26, center('A/START: GO   C/* = CHEAT', 30));
    line8(28, center('HOLD START+SELECT: MENU', 30));
  }
  function renderHelp() {
    attrRows(0, 10, 0); attrRows(11, 14, 1);
    g.box = T.box({ x: 1, y: 5, w: 30, h: 17 });
    g.box.say(U.help[g.sel], { name: U.modes[g.sel], onClose: function () { if (g.mode === 'help') startRun(); } });
    line8(23, center('A NEXT   START SKIP   B BACK', 30));
    line8(25, center('START PAUSE    C/* = CHEAT', 30));
    line8(27, center('HOLD START+SELECT: MENU', 30));
  }
  function renderPause() {
    attrRows(0, 11, 0); attrRows(12, 14, 1);
    T.frame(6, 6, 20, 8);
    T.print(13, 9, U.pause);
    line8(17, center('START: RESUME', 30));
    line8(19, center('C/* = CHEAT', 30));
    line8(21, center('HOLD START+SELECT: MENU', 30));
    hud();
  }
  function renderQuiz() {
    attrRows(0, 1, 1); attrRows(2, 12, 0); attrRows(13, 14, 1);
    T.frame(QF.x, QF.y, QF.w, QF.h);
    if (g.mode === 'ready') T.print(13, 8, U.ready);
    if (g.qq && g.mode === 'play') printQuestion();
    hud();
    if (g.mode === 'play' && g.phase === 'judge' && g.judge) {
      if (g.game === 2) line8(FB_ROW, center(g.judge.who === 'you' ? 'YOU GOT IT!  +1' : (g.judge.who === 'cpu' ? 'CPU GOT IT!' : 'NO ONE GOT IT'), 30));
      else line8(FB_ROW, center(g.judge.ok ? 'GOOD! +' + g.judge.gain : 'MISS!', 30));
    } else if (g.mode === 'ready') line8(FB_ROW, center(MODES_EN[g.game], 30));
  }
  function renderMath() {
    attrRows(0, 1, 1); attrRows(2, 12, 0); attrRows(13, 14, 1);
    T.frame(MF.x, MF.y, MF.w, MF.h);
    T.frame(KF.x, KF.y, KF.w, KF.h);
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) T.print(KEY_COLS[c], KEY_ROWS[r], keyLabel(KEYS[r][c]));
    if (g.mode === 'ready') T.print(13, 8, U.ready);
    if (g.prob && g.mode === 'play') {
      T.print(probCol(), M_PROB_ROW, g.prob.text);
      for (var i = 0; i < g.input.length; i++) T.print(ansCol() + i * 2, M_ANS_ROW, QZ.Math.fw(+g.input.charAt(i)));
    }
    hud();
    if (g.mode === 'ready') line8(FB_ROW, center(MODES_EN[3], 30));
  }
  function renderResult() {
    attrRows(0, 0, 0); attrRows(1, 4, 2); attrRows(5, 11, 0); attrRows(12, 14, 1);
    var r = g.result;
    T.frame(4, 3, 24, 6);
    T.print(Math.floor((32 - CT.Text.measure(r.head)) / 2), 5, r.head);
    for (var i = 0; i < r.lines.length; i++) text8(6, 11 + i * 2, pad(r.lines[i], 22));
    if (g.newBest) T.print(Math.floor((32 - CT.Text.measure(U.newBest)) / 2), 21, U.newBest);
    var canCont = g.over;
    line8(24, center('A: AGAIN    B: TITLE', 30));
    line8(26, center(canCont ? 'C/* = CONTINUE' : MODES_EN[g.game], 30));
    line8(28, center('HOLD START+SELECT: MENU', 30));
  }

  // 每幀 HUD（只寫有變的格子）
  function hud() {
    if (g.mode !== 'play' && g.mode !== 'ready') return;
    var s = '', fr = 0;
    if (g.game === 0) { s = 'SCORE ' + num(g.score, 6) + '  COMBO ' + num(g.combo, 2) + '  T ' + num(Math.ceil(g.timeLeft / 60), 2); fr = g.timeLeft / TA_TIME; }
    else if (g.game === 1) {
      var h = ''; for (var i = 0; i < SURV_LIVES; i++) h += i < g.lives ? '#' : '_';
      s = 'SCORE ' + num(g.score, 6) + '  LV' + g.lv + '  ' + h + '  Q' + num(g.qn, 3);
      fr = g.phase === 'answer' ? 1 - g.qTime / SURV_LIMIT : (g.phase === 'print' || g.mode === 'ready' ? 1 : Math.max(0, 1 - g.qTime / SURV_LIMIT));
    } else if (g.game === 2) {
      s = 'YOU ' + num(g.you, 2) + ' - ' + num(g.cpu, 2) + ' CPU   Q' + num(Math.max(1, g.qn), 2) + '/' + num(g.total, 2);
      fr = g.phase === 'answer' ? 1 - g.qTime / VS_LIMIT : (g.mode === 'ready' || g.phase === 'print' ? 1 : Math.max(0, 1 - g.qTime / VS_LIMIT));
    } else { s = 'SCORE ' + num(g.score, 6) + ' LV' + g.lv + ' COMBO ' + num(g.combo, 2) + ' T' + num(Math.ceil(g.timeLeft / 60), 2); fr = Math.min(1, g.timeLeft / MATH_TIME); }
    line8(HUD_ROW, s);
    bar(BAR_ROW, fr);
  }

  function drawSprites() {
    var slot = 0, i;
    function spr(x, y, name, pal) { if (slot < 60) ppu0.sprite(slot++, { x: x, y: y, tile: A.s(name), pal: pal }); }
    if (g.mode === 'title') {
      spr(10 * 8, (12 + g.sel * 2) * 8 + 4, 'CUR', 0);
      if ((g.blink >> 4) & 1) { spr(7 * 8, 21 * 8 + 4, 'CURL', 0); spr(24 * 8, 21 * 8 + 4, 'CUR', 0); }
    } else if (g.mode === 'play' && !g.paused) {
      if (g.game === 3) {
        var kk = keyAt(g.kr, g.kc), kc = KEY_COLS[g.kc], ky = KEY_ROWS[g.kr] * 8 + 4;
        spr((kc - 1) * 8, ky, 'CUR', 0); spr((kc + keyW(kk)) * 8, ky, 'CURL', 0);
        if (g.phase === 'answer' && ((g.frames >> 4) & 1) === 0 && g.input.length < 4) spr((ansCol() + g.input.length * 2) * 8 + 4, M_ANS_ROW * 8 + 9, 'CARET', 0);
        if (g.phase === 'judge' && g.judge) spr(9 * 8, M_ANS_ROW * 8 + 4, g.judge.ok ? 'OK' : 'NG', g.judge.ok ? 1 : 2);
      } else {
        if (g.phase === 'answer' && !(g.game === 2 && g.youOut)) spr(3 * 8, OPT_ROWS[g.cur] * 8 + 4, 'CUR', 0);
        if (g.game === 2) {
          if (g.youPick >= 0 && g.youPick !== g.ans) spr(3 * 8, OPT_ROWS[g.youPick] * 8 + 4, 'NG', 2);
          if (g.cpuPick >= 0) { spr(28 * 8, OPT_ROWS[g.cpuPick] * 8 + 4, 'CPU', 3); if (g.cpuPick !== g.ans) spr(29 * 8, OPT_ROWS[g.cpuPick] * 8 + 4, 'NG', 2); }
          if (g.phase === 'judge') spr(2 * 8, OPT_ROWS[g.ans] * 8 + 4, 'OK', 1);
        } else if (g.phase === 'judge' && g.judge) {
          spr(2 * 8, OPT_ROWS[g.ans] * 8 + 4, 'OK', 1);
          if (!g.judge.ok && g.judge.pick >= 0) spr(3 * 8, OPT_ROWS[g.judge.pick] * 8 + 4, 'NG', 2);
        }
      }
    }
    for (i = slot; i < 62; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：人類節奏，反應延遲 ≥ 12 幀；快問快答用 HUMAN 真人讀題模型（?hum=0..3） ============================== */
  function botLag() { return Math.max(12, qint('lag', 0, 120, 15)); }
  function botHum() { return HUMAN.profiles[qint('hum', 0, 3, 0)]; }
  function botAcc(lv) { var a = qint('acc', 0, 100, -1); return a >= 0 ? a / 100 : botHum().acc[lv - 1]; }
  function humanFrames(p, qq, r) {           // 讀題 + 思考（不含游標 / 按鍵），幀
    var u = r() || 1e-9, v = r(), z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    var sec = (p.orient + (qq.q.length + qq.opts.join('').length) / p.cps + p.think[qq.lv - 1]) * Math.exp(HUMAN.SD * z);
    return Math.round(sec * 60);
  }
  function bot() {
    var b = g.bot;
    if (b.rel > 0) { b.rel--; return 0; }          // 放開（讓下一次按下成為「按下邊緣」）
    if (b.wait > 0) { b.wait--; return 0; }
    var m = botDecide();
    if (m) { b.rel = 3; return m; }
    return 0;
  }
  function botDecide() {
    var b = g.bot, want = qint('mode', 0, 3, 0);
    if (g.mode === 'title') {
      if (g.sel !== want) return g.sel < want ? BTN.DOWN : BTN.UP;
      if (want !== 2 && want !== 3 && g.cat !== -1) return BTN.LEFT;
      b.wait = 20; return BTN.A;
    }
    if (g.mode === 'help') {
      var bs = g.box && g.box.state();
      if (bs && (bs.phase === 'wait' || bs.phase === 'end')) { if (++b.pageT < botLag()) return 0; b.pageT = 0; return BTN.A; }
      b.pageT = 0; return 0;
    }
    if (g.mode === 'result') {
      if (g.goalHit || g.endT < 90) return 0;
      return BTN.A;
    }
    if (g.paused) return BTN.START;
    if (g.mode !== 'play') return 0;
    if (g.game === 3) return botMath();
    if (g.phase === 'judge') { b.plan = null; return 0; }
    if (g.phase !== 'answer' || (g.game === 2 && g.youOut)) return 0;
    if (!b.plan || b.q !== g.qn) {
      // 讀題時間：HUMAN 模型（依題目 + 選項字數），至少反應延遲；正確率依難度（可讀題庫答案，但用正確率模型）
      var read = Math.max(botLag(), humanFrames(botHum(), g.qq, brnd)) + HUMAN.PRESS_F;
      var right = brnd() < botAcc(g.qq.lv), pick = g.ans;
      if (!right) { var w = []; for (var k = 0; k < 4; k++) if (k !== g.ans) w.push(k); pick = w[Math.floor(brnd() * w.length)]; }
      b.plan = { at: read, pick: pick }; b.q = g.qn;
    }
    if (g.t < b.plan.at) return 0;
    if (g.cur !== b.plan.pick) { b.wait = HUMAN.MOVE_F - 4; var dn = (b.plan.pick - g.cur + 4) % 4; return dn <= 2 ? BTN.DOWN : BTN.UP; }
    return BTN.A;
  }
  function botMath() {
    var b = g.bot;
    if (g.phase !== 'answer' || !g.prob) { b.plan = null; return 0; }
    if (!b.plan || b.plan.prob !== g.prob) b.plan = { prob: g.prob, at: botLag() + 10 + g.prob.text.length * 3 + Math.floor(brnd() * 30), s: String(g.prob.ans) };
    if (g.t < b.plan.at) return 0;
    var s = b.plan.s, target = g.input.length < s.length ? s.charAt(g.input.length) : 'OK';
    if (g.input !== s.substring(0, g.input.length)) target = 'DEL';
    var tr = -1, tc = -1;
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) if (KEYS[r][c] === target) { tr = r; tc = c; }
    if (tr < 0) return 0;
    b.wait = 3;
    if (g.kr < tr) return BTN.DOWN; if (g.kr > tr) return BTN.UP;
    if (g.kc < tc) return BTN.RIGHT; if (g.kc > tc) return BTN.LEFT;
    b.wait = 6;
    return BTN.A;
  }

  /* ============================== 密技 ============================== */
  // 遊玩 / 暫停中：限時 +15 秒、生存 +1 心（最多 5）、對戰 +1 分、心算 +15 秒。
  // 結算（失敗）= 原地續關：限時 / 心算 +30 秒、生存補滿 3 心同等級、對戰再加賽 3 題；分數保留。標題 / 說明 / READY 無效。用過那局 goal false。
  function cheat() {
    if (!g) return false;
    if (g.mode === 'result') {
      if (!g.over) return false;
      g.cheats++; g.runCheats++;
      if (g.game === 0 || g.game === 3) g.timeLeft = 30 * 60;
      else if (g.game === 1) g.lives = SURV_LIVES;
      else g.total += 3;
      g.mode = 'play'; g.over = false; g.result = null; g.paused = false; g.judge = null; g.phase = 'idle';
      redraw();
      Au.stop(); Au.play(g.game === 3 ? 'quiz_math' : 'quiz_play');
      if (g.game === 3) nextProblem(); else nextQuestion();
      sfx('quiz_lv');
      return true;
    }
    if (g.mode !== 'play') return false;
    g.cheats++; g.runCheats++;
    if (g.game === 0 || g.game === 3) g.timeLeft += 15 * 60;
    else if (g.game === 1) g.lives = Math.min(5, g.lives + 1);
    else g.you++;
    if (g.paused) setPause(false);
    sfx('quiz_lv');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: ID, order: 3, title: '星塵問答',
    legacy: ['rapid-fire-quiz.html', 'math-challenge.html', 'quick-math.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu;
      A = QZ.Art.make(); Au = QZ.Audio; U = QZ.UI;
      NES.CHR.setPattern(0, A.bg);
      NES.CHR.setPattern(1, A.spr);
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      T = CT.Text.create(nes, { bank: A.bg, fg: 3, bg: 0, frame1: 1, frame2: 2 });
      g = newState();
      g.sel = qint('mode', 0, 3, 0);
      g.cat = qint('cat', -1, 5, -1);
      Au.init(nes);
      redraw();
      Au.play('quiz_title');
    },
    update: function () {
      update();
      if (g.mode === 'play' || g.mode === 'ready') { if (!g.paused) hud(); }
      T.update();
      Au.tick();
    },
    draw: function () { drawSprites(); },
    exit: function () {
      if (g && g.mode === 'play' && g.runCheats === 0) {
        var key = ['best', 'surv', null, 'math'][g.game];
        if (key && g.score > CT.load(ID, key, 0)) CT.save(ID, key, g.score);
      }
      if (T) T.reset();
      Au.stop();
    },
    get backTile() { if (!A) A = QZ.Art.make(); return { tile: A.s('BACK'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      var bs = g.box && g.box.state();
      return {
        mode: g.mode, game: g.game, sel: g.sel, cat: g.cat, cpuLv: g.cpuLv, mLv: g.mLv, paused: g.paused, phase: g.phase, t: g.t,
        q: g.qq ? { id: g.qq.id, cat: g.qq.cat, lv: g.qq.lv, q: g.qq.q } : null, opts: g.opts.slice(), ans: g.ans, cur: g.cur, qn: g.qn, qTime: g.qTime,
        score: g.score, combo: g.combo, maxCombo: g.maxCombo, correct: g.correct, answered: g.answered, timeLeft: g.timeLeft,
        lives: g.lives, lv: g.lv, lvCount: g.lvCount, you: g.you, cpu: g.cpu, total: g.total, youOut: g.youOut, cpuOut: g.cpuOut,
        youPick: g.youPick, cpuPick: g.cpuPick, cpuAt: g.cpuAt, judge: g.judge,
        prob: g.prob ? { text: g.prob.text, ans: g.prob.ans, level: g.prob.level } : null, input: g.input, key: [g.kr, g.kc], solved: g.solved,
        result: g.result, over: g.over, cheats: g.cheats, runCheats: g.runCheats, goal: GAME.goal(), newBest: g.newBest,
        box: bs ? { phase: bs.phase, page: bs.page, pages: bs.pages } : null,
        text: T ? T.stats() : null, missing: CT.Text.missing(), music: Au.current, lastSfx: Au.lastSfx, frames: g.frames, tiles: A.tiles
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goalHit); },
    bestText: function () { return num(CT.load(ID, 'best', 0), 6); }
  };

  QZ.dev = {
    start: function (mode, opt) {
      opt = opt || {};
      g.sel = mode;
      if (opt.cat !== undefined) g.cat = opt.cat;
      if (opt.cpuLv !== undefined) g.cpuLv = opt.cpuLv;
      if (opt.mLv !== undefined) g.mLv = opt.mLv;
      startRun();
      if (opt.skipReady) {
        g.mode = 'play'; g.t = 0;
        T.clear(10, 8, 12, 2);
        if (g.game === 3) nextProblem(); else nextQuestion();
        if (opt.flush) { CT.blank(nes0, function () { T.flush(); }); }
      }
    },
    answer: function (k) { return answer(k); },
    pressKey: function (k) { pressKey(k); },
    submit: submit,
    finish: finish,
    flush: function () { CT.blank(nes0, function () { T.flush(); }); },
    // 統計：電腦 lv 級在 n 次出題中的答對率與平均作答幀（不動遊戲狀態以外的東西）
    cpuSample: function (lvIdx, n, qlv) {
      var keepQ = g.qq, keepLv = g.cpuLv, right = 0, at = 0, mn = 1e9, mx = 0;
      g.cpuLv = lvIdx; g.qq = { lv: qlv || 1 };
      for (var i = 0; i < n; i++) { planCpu(); if (g.cpuRight) right++; at += g.cpuAt; mn = Math.min(mn, g.cpuAt); mx = Math.max(mx, g.cpuAt); }
      g.qq = keepQ; g.cpuLv = keepLv;
      return { acc: right / n, avg: at / n, min: mn, max: mx };
    },
    set: function (k, v) { g[k] = v; },
    get: function (k) { return g[k]; },
    readLine: function (c, r, n) { return T.readLine(c, r, n); },
    T: function () { return T; },
    consts: { GOAL_SCORE: GOAL_SCORE, TA_TIME: TA_TIME, TA_WRONG: TA_WRONG, SURV_LIMIT: SURV_LIMIT, VS_LIMIT: VS_LIMIT, MATH_TIME: MATH_TIME,
      QF: QF, Q_ROW: Q_ROW, Q_COL: Q_COL, Q_W: Q_W, OPT_ROWS: OPT_ROWS, OPT_COL: OPT_COL, OPT_W: OPT_W, CPU: CPU, HUMAN: HUMAN, KEYS: KEYS, POOL: QZ.Art.POOL,
      M_ANS_ROW: M_ANS_ROW, M_PROB_ROW: M_PROB_ROW }
  };

  if (CT.register) CT.register(GAME);
  QZ.GAME = GAME;
})();
