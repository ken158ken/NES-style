/*
 * games/cart3/party/main.js — 《星塵派對 STAR PARTY》（合輯卡帶三 槽 8，id = party）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-0 cart3-shell+party（R7）｜ 依賴：party/art.js、party/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：guessing-game（終極密碼）+ rock-paper-scissors ⇒ 3 合 1（第三款「星牌高低」原創）。
 *
 * 三個遊戲（標題 ↑↓ 選遊戲、←→ 選難度）：
 *   1 NUMBER CODE 星數密碼：10×10 數字盤（背景名稱表），十字鍵一格一格移游標、A 猜；提示 HIGHER / LOWER，排除的號碼變暗。
 *       EASY（不限次數 + 冷熱提示）/ NORMAL（10 次）/ HARD（7 次 = 二分搜尋最壞情形，保證可解，測試裡跑解題器證明）/
 *       CPU GUESS（你在盤上鎖定一個數、CPU「軌軌」來猜，你用 ↑ 更大 / ↓ 更小 / A 答對回答；說錯會被友善地擋下）。
 *       B = 提示（游標跳到剩餘範圍正中央；HARD 無）。評價：次數 ≤5 ★★★、≤7 ★★、其餘 ★；紀錄 = 最少次數 + 時間。
 *   2 STAR CUP 星塵猜拳大會：星石 / 星帆 / 星剪，晉級制對 3 位個性不同的原創 CPU，每場三戰兩勝（平手重來）。
 *       岩岩 ROCKO 偏愛星石、映映 MIMI 模仿你上一拳、軌軌 ORBIT 依 石→帆→剪 輪轉；習慣強度 EASY 90% / NORMAL 75% / HARD 60%。
 *       畫面右上有對手最近 5 拳的紀錄（可學習）。評價：全程輸掉的回合 0 ★★★、≤2 ★★、其餘 ★；紀錄 = 冠軍次數 / 最少回合。
 *   3 HIGH OR LOW 星牌高低：52 張星牌（1~13 × 星 / 月 / 日 / 彗 四花），猜下一張比現在大或小，翻完一副為止；
 *       EASY 顯示比大 / 比小剩幾張 + 記牌表、NORMAL 只有記牌表、HARD 無提示且同點算錯；命數 3 / 3 / 2。
 *       評價：答對 ≥30 ★★★、≥20 ★★、≥10 ★；紀錄 = 最多答對。
 * 盤面一律走背景名稱表（影子表 + 差異佇列，每幀 ≤ 140 byte）；精靈只給游標、手套、箭頭。
 * 游標：十字鍵按一下一格，按住首延遲 12 幀、之後每 4 幀一格（R7_BRIEF §1-3）。`?seed=` 可重現（亂數只從種子推）。
 * 密技（C / ★）：遊玩中 = 立刻補強（猜數 +3 次 / EASY 透露十位數；猜拳 你 +1 勝；星牌 +1 命）；
 *   GAME OVER = 原地續關（猜數 +3 次、猜拳同一位對手 0:0 重打、星牌補滿命從同一張繼續）；標題 / 結算無效；用過密技那局不存紀錄、goal false。
 * goal = 猜拳大會 NORMAL 以上連勝 3 位（不開密技）。機器人用「學到的習慣」出剋制拳，全程用游標 + A 正常操作。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PA = CT.Party = CT.Party || {};
  var AU = PA.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var GAMES = [
    { key: 'num', name: 'NUMBER CODE', lv: ['EASY', 'NORMAL', 'HARD', 'CPU GUESS'] },
    { key: 'rps', name: 'STAR CUP', lv: ['EASY', 'NORMAL', 'HARD'] },
    { key: 'hl', name: 'HIGH OR LOW', lv: ['EASY', 'NORMAL', 'HARD'] }
  ];
  var NUM_TRIES = [0, 10, 7, 0];
  var HANDS = ['STONE', 'SAIL', 'SNIP'];
  var OPP = [
    { name: 'ROCKO', quote: ['STONE IS THE BEST.', 'I ALWAYS SAY SO!'], pal: [0x07, 0x17, 0x37] },
    { name: 'MIMI', quote: ['I LIKE WHAT YOU LIKED', 'A MOMENT AGO...'], pal: [0x04, 0x24, 0x30] },
    { name: 'ORBIT', quote: ['ROUND AND ROUND', 'AND ROUND I GO!'], pal: [0x01, 0x21, 0x38] }
  ];
  var HABIT = [230, 192, 154];         // 習慣強度（/256）：EASY 90% / NORMAL 75% / HARD 60%
  var HL_LIVES = [3, 3, 2];
  var REP_DELAY = 12, REP_EVERY = 4, FLUSH_LIMIT = 140, MSG_ROW = 27;
  var PAL = {
    bd: 0x0F,
    bg: [[0x13, 0x00, 0x30], [0x13, 0x00, 0x28], [0x16, 0x07, 0x38], [0x1A, 0x2A, 0x30]],
    spr: [[0x15, 0x27, 0x38], [0x11, 0x21, 0x31],   // 玩家手套 = 選單圖示同色（洋紅框 / 金橘 / 淡黃）、CPU 手套藍
           [0x28, 0x38, 0x30], [0x2A, 0x39, 0x30]]
  };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 1, lvl: [1, 1, 1], paused: false, cheatReq: false, run: null, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      seed: 1, runs: 0, overT: 0, goalRun: null, hold: {}, bot: { t: 0, prev: 0, wait: 0 }
    };
  }
  function seedBase() { var s = CT.query ? parseInt(CT.query('seed') || '', 10) : NaN; return isNaN(s) ? 0x2F3A : (s & 0x7fffffff); }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mmss(f) { var s = Math.floor(f / 60); return pad(Math.min(99, Math.floor(s / 60)), 2) + ':' + pad(s % 60, 2); }
  function stars(n) { return ('$$$'.substring(0, n) + '   ').substring(0, 3); }
  function beats(a, b) { return (a - b + 3) % 3 === 1; }

  /* ---------------- 名稱表影子 + 差異佇列 ---------------- */
  // fix-r7-shell（qa-r7 P3-5 HUD 貼頂）：HUD 兩列從第 1 / 2 列（畫面 y = 0）下移到第 2 / 3 列（y = 8 起）；
  // 原本第 3 列的上框線讓給 HUD，改畫在第 1 列（只是裝飾線），左右框從第 2 列起把 HUD 一起框住
  var HUD_ROW = 2;
  function bgTile(c, r) {
    if (r === HUD_ROW - 1) return art.t('BH');
    if (r === 26) return art.t('BHB');
    if (r < HUD_ROW || r > 25) return 0;
    if (c === 0) return art.t('BV');
    if (c === 31) return art.t('BVR');
    if (r < 4) return 0;
    if (g.mode === 'num' || (c > 3 && c < 28)) return 0;   // 星點只撒在左右兩側（數字盤 / 文字區易讀）
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x5a17) >>> 0;
    if (h % 13 === 3) return art.t('ST1');
    if (h % 17 === 7) return art.t('ST2');
    return 0;
  }
  function put(c, r, t) { var k = r * 32 + c; if (g.want[k] === t) return; g.want[k] = t; g.q.push(k); }
  function putA(c16, r16, p) { var k = r16 * 16 + c16; if (g.wantA[k] === p) return; g.wantA[k] = p; g.qa.push(k); }
  function text(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) put(col + i, row, t[i]); }
  function center(row, s) { text(16 - (s.length >> 1), row, s); }
  function clearRow(row, c0, c1) { for (var c = c0; c <= c1; c++) put(c, row, bgTile(c, row)); }
  function flush() {
    var bud = nes0.timing && nes0.timing.budget, ppu = nes0.ppu;
    while (g.qa.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var a = g.qa.shift();
      if (g.haveA[a] !== g.wantA[a]) { ppu.setAttr(0, a & 15, a >> 4, g.wantA[a]); g.haveA[a] = g.wantA[a]; }
    }
    while (g.q.length) {
      if (bud && bud.used >= FLUSH_LIMIT) return;
      var k = g.q.shift();
      if (g.have[k] !== g.want[k]) { ppu.setTile(0, k & 31, k >> 5, g.want[k]); g.have[k] = g.want[k]; }
    }
  }
  function redraw(fn) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      for (var k = 0; k < 960; k++) g.want[k] = 0;
      for (k = 0; k < 240; k++) g.wantA[k] = 0;
      g.q = []; g.qa = [];
      fn();
      for (k = 0; k < 960; k++) ppu.setTile(0, k & 31, k >> 5, g.want[k]);
      for (k = 0; k < 240; k++) ppu.setAttr(0, k & 15, k >> 4, g.wantA[k]);
      g.have.set(g.want); g.haveA.set(g.wantA); g.q = []; g.qa = [];
      ppu.clearSprites(); g.sprUsed = 0;
    });
  }
  function drawField() { for (var r = HUD_ROW - 1; r <= 26; r++) for (var c = 0; c < 32; c++) put(c, r, bgTile(c, r)); }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i), x = col + i * 2;
      if (ch === ' ') continue;
      put(x, row, art.t('BIG_' + ch + '0')); put(x + 1, row, art.t('BIG_' + ch + '1'));
      put(x, row + 1, art.t('BIG_' + ch + '2')); put(x + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }
  function quad(col, row, prefix) {
    put(col, row, art.t(prefix + '0')); put(col + 1, row, art.t(prefix + '1'));
    put(col, row + 1, art.t(prefix + '2')); put(col + 1, row + 1, art.t(prefix + '3'));
  }

  /* ---------------- 游標連發（首延遲 12 幀、之後每 4 幀） ---------------- */
  function rep(btn) {
    var I = NES.Input;
    if (!I.held(btn)) { g.hold[btn] = 0; return false; }
    var h = (g.hold[btn] = (g.hold[btn] || 0) + 1);
    return h === 1 || (h > REP_DELAY && (h - REP_DELAY - 1) % REP_EVERY === 0);
  }
  function dirs() {
    return { u: rep(BTN.UP), d: rep(BTN.DOWN), l: rep(BTN.LEFT), r: rep(BTN.RIGHT) };
  }
  function startPressed() { var I = NES.Input; return I.pressed(BTN.START) && !I.held(BTN.SELECT); }

  /* ---------------- 紀錄 ---------------- */
  function load(k) { return CT.load('party', k, 0) | 0; }
  function save(k, v) { CT.save('party', k, v); }
  function bestLine(m, lv) {
    if (m === 0) {
      if (lv === 3) { var c = load('cpu'); return c ? 'CPU NEEDED ' + pad(c, 2) + ' TRIES' : 'NO RECORD YET'; }
      var b = load('num' + lv);
      return b ? 'BEST ' + pad(Math.floor(b / 1000), 2) + ' TRIES ' + mmss((b % 1000) * 60) : 'NO RECORD YET';
    }
    if (m === 1) { var r = load('rps' + lv); return 'CUPS ' + pad(load('cups'), 3) + (r ? '  BEST ' + pad(r, 2) + ' ROUNDS' : ''); }
    var h = load('hl' + lv);
    return h ? 'BEST ' + pad(h, 2) + ' CORRECT' : 'NO RECORD YET';
  }

  /* ================================================================ 標題 */
  function titleRow(i) { return 9 + i * 2; }
  function titleLine(i) {
    var G = GAMES[i];
    return (i + 1) + ' ' + padR(G.name, 13) + padL(G.lv[g.lvl[i]], 11);
  }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.paused = false;
    redraw(function () {
      nes0.ppu.setBgPalette(3, PAL.bg[3]);
      for (var c = 0; c < 32; c++) { put(c, 1, art.t('BHB')); put(c, 28, art.t('BH')); }
      big(6, 3, 'STAR PARTY');
      center(6, 'THREE GAMES  ONE PARTY');
      for (var i = 0; i < GAMES.length; i++) text(3, titleRow(i), titleLine(i));
      center(15, padR(bestLine(g.sel, g.lvl[g.sel]), 26));
      text(3, 18, 'UP/DOWN GAME  L/R LEVEL');
      text(3, 20, 'A/START PLAY  B HINT');
      text(3, 22, 'HOLD START+SELECT: MENU');
      text(3, 24, 'C/$ = CHEAT');
      for (c = 2; c < 14; c++) { putA(c, 1, 3); putA(c, 2, 3); }
      selAttr(g.sel, 1);
    });
    AU.play('party_title');
  }
  function selAttr(i, p) { var r16 = titleRow(i) >> 1; for (var c = 1; c < 15; c++) putA(c, r16, p); }
  function updateTitle() {
    g.t++;
    var D = dirs(), I = NES.Input;
    var d = D.d || (I.pressed(BTN.SELECT) && !I.held(BTN.START)) ? 1 : (D.u ? -1 : 0);
    if (d) { selAttr(g.sel, 0); g.sel = (g.sel + d + GAMES.length) % GAMES.length; selAttr(g.sel, 1); AU.sfx('party_move'); }
    var l = D.r ? 1 : (D.l ? -1 : 0);
    if (l) { var n = GAMES[g.sel].lv.length; g.lvl[g.sel] = (g.lvl[g.sel] + l + n) % n; text(3, titleRow(g.sel), titleLine(g.sel)); AU.sfx('party_move'); }
    if (d || l) center(15, padR(bestLine(g.sel, g.lvl[g.sel]), 26));
    if (startPressed() || I.pressed(BTN.A)) startGame(g.sel, g.lvl[g.sel]);
  }

  /* ================================================================ 開局 */
  function startGame(m, lv) {
    g.runs++;
    g.seed = (seedBase() * 7 + g.runs * 7919 + m * 101 + lv * 13) & 0x7fffffff;
    for (var i = 0; i < 4; i++) rnd();
    g.paused = false; g.msg = ''; g.msgT = 0; g.t = 0; g.hold = {};
    if (m === 0) startNum(lv);
    else if (m === 1) startRps(lv);
    else startHl(lv);
    AU.sfx('party_ok');
  }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }
  function frame() {
    for (var c = 0; c < 32; c++) put(c, HUD_ROW - 1, art.t('BH'));
    for (c = 0; c < 32; c++) put(c, 26, art.t('BHB'));
    for (var r = HUD_ROW; r <= 25; r++) { put(0, r, art.t('BV')); put(31, r, art.t('BVR')); }
  }

  /* ================================================================ 1 星數密碼 */
  function cellCol(v) { return ((v - 1) % 10) * 3 + 1; }
  function cellRow(v) { return Math.floor((v - 1) / 10) * 2 + 6; }
  function drawCell(v, dim) {
    var s = padL(v, 3), c = cellCol(v), r = cellRow(v);
    if (v === 100) {   // 100 = 「1」+ 擠成一格的「00」⇒ 與 99 之間留一格空白
      put(c, r, 0); put(c + 1, r, dim ? art.t('DG_1') : art.ch('1')); put(c + 2, r, art.t(dim ? 'DH00' : 'H00'));
      return;
    }
    for (var i = 0; i < 3; i++) {
      var ch = s.charAt(i);
      put(c + i, r, ch === ' ' ? 0 : (dim ? art.t('DG_' + ch) : art.ch(ch)));
    }
  }
  function numRange() { var R = g.run; return R.lvl === 3 ? [R.clo, R.chi] : [R.lo, R.hi]; }
  function refreshCells() {
    var rg = numRange();
    for (var v = 1; v <= 100; v++) drawCell(v, v < rg[0] || v > rg[1]);
  }
  function startNum(lv) {
    var R = g.run = { kind: 'num', m: 0, lvl: lv, secret: 1 + rnd() % 100, lo: 1, hi: 100, tries: 0, maxT: NUM_TRIES[lv], cx: 4, cy: 4,
      time: 0, phase: lv === 3 ? 'pick' : 'play', mine: 0, clo: 1, chi: 100, ctries: 0, cg: 0, ccx: 0, ccy: 0, cmove: 0,
      cheated: false, continues: 0, hints: 0, last: 0, saved: false };
    g.mode = 'num';
    redraw(function () { drawField(); for (var v = 1; v <= 100; v++) drawCell(v, false); hudNum(); });
    say(lv === 3 ? 'PICK YOUR SECRET NUMBER, A' : 'GUESS MY NUMBER 1-100!', 120);
    AU.play('party_think');
    return R;
  }
  function temperature(d) { return d <= 3 ? 'BURNING!' : d <= 10 ? 'HOT' : d <= 25 ? 'WARM' : 'COLD'; }
  function numGuess(v) {
    var R = g.run;
    if (v < R.lo || v > R.hi) { AU.sfx('party_ng'); say('ALREADY RULED OUT', 50); return; }
    R.tries++; R.last = v;
    if (v === R.secret) { AU.sfx('party_rwin'); numWin(); return; }
    if (v < R.secret) { R.lo = v + 1; AU.sfx('party_high'); say('HIGHER THAN ' + v + '!' + (R.lvl === 0 ? ' ' + temperature(R.secret - v) : ''), 90); }
    else { R.hi = v - 1; AU.sfx('party_low'); say('LOWER THAN ' + v + '!' + (R.lvl === 0 ? ' ' + temperature(v - R.secret) : ''), 90); }
    refreshCells();
    if (R.maxT && R.tries >= R.maxT) enterOver('THE CODE WAS ' + R.secret);
  }
  function numStars(t) { return t <= 5 ? 3 : (t <= 7 ? 2 : 1); }
  function numWin() {
    var R = g.run, nb = false;
    var score = R.tries * 1000 + Math.min(999, Math.floor(R.time / 60));
    if (!R.cheated) { var old = load('num' + R.lvl); if (!old || score < old) { save('num' + R.lvl, score); nb = true; } }
    R.saved = true;
    enterResult(['CODE CRACKED!', 'THE NUMBER WAS ' + R.secret, '', 'TRIES ' + pad(R.tries, 2) + '   TIME ' + mmss(R.time)], numStars(R.tries), nb);
  }
  // CPU GUESS：軌軌來猜（二分 + 一點個性偏移）
  function cpuNext() {
    var R = g.run, span = R.chi - R.clo, mid = (R.clo + R.chi) >> 1;
    var j = span >= 8 ? (rnd() % (Math.floor(span / 4) + 1)) - Math.floor(span / 8) : 0;
    R.cg = clamp(mid + j, R.clo, R.chi);
    R.ctries++; R.phase = 'cpu'; R.cmove = 0;
    say('ORBIT IS THINKING...', 200);
  }
  function cpuAnswer(kind) {
    var R = g.run, truth = R.mine === R.cg ? 'A' : (R.mine > R.cg ? 'U' : 'D');
    if (kind !== truth) { AU.sfx('party_ng'); say('HMM? CHECK YOUR NUMBER ' + R.mine, 70); return; }
    if (kind === 'A') {
      AU.sfx('party_rwin');
      var nb = false;
      if (!R.cheated && R.ctries > load('cpu')) { save('cpu', R.ctries); nb = true; }
      R.saved = true;
      enterResult(['ORBIT GOT IT!', 'YOUR NUMBER WAS ' + R.mine, '', 'ORBIT NEEDED ' + pad(R.ctries, 2) + ' TRIES'], R.ctries >= 7 ? 3 : (R.ctries >= 6 ? 2 : 1), nb);
      return;
    }
    if (kind === 'U') { R.clo = R.cg + 1; AU.sfx('party_high'); } else { R.chi = R.cg - 1; AU.sfx('party_low'); }
    refreshCells();
    cpuNext();
  }
  function updateNum() {
    var R = g.run, I = NES.Input, D = dirs();
    if (R.phase === 'cpu') {          // CPU 游標一格一格走過去（每 4 幀一格）
      R.cmove++;
      var tx = (R.cg - 1) % 10, ty = Math.floor((R.cg - 1) / 10);
      if (R.cmove % 4 === 0) {
        if (R.ccy !== ty) R.ccy += R.ccy < ty ? 1 : -1;
        else if (R.ccx !== tx) R.ccx += R.ccx < tx ? 1 : -1;
        else { R.phase = 'answer'; AU.sfx('party_chant'); say('IS IT ' + R.cg + '?  UP/DOWN/A', 600); }
      }
      return;
    }
    if (R.phase === 'answer') {
      if (I.pressed(BTN.UP)) cpuAnswer('U');
      else if (I.pressed(BTN.DOWN)) cpuAnswer('D');
      else if (I.pressed(BTN.A)) cpuAnswer('A');
      return;
    }
    R.time++;
    if (D.u && R.cy > 0) { R.cy--; AU.sfx('party_move'); }
    if (D.d && R.cy < 9) { R.cy++; AU.sfx('party_move'); }
    if (D.l && R.cx > 0) { R.cx--; AU.sfx('party_move'); }
    if (D.r && R.cx < 9) { R.cx++; AU.sfx('party_move'); }
    var v = R.cy * 10 + R.cx + 1;
    if (R.phase === 'pick') {
      if (I.pressed(BTN.A)) { R.mine = v; AU.sfx('party_ok'); R.ccx = R.cx; R.ccy = R.cy; cpuNext(); }
      return;
    }
    if (I.pressed(BTN.B)) {
      if (R.lvl >= 2) { AU.sfx('party_ng'); say('NO HINT ON HARD', 50); }
      else { var mid = (R.lo + R.hi) >> 1; R.cx = (mid - 1) % 10; R.cy = Math.floor((mid - 1) / 10); R.hints++; AU.sfx('party_ok'); say('HINT: TRY THE MIDDLE', 50); }
    }
    if (I.pressed(BTN.A)) numGuess(v);
  }
  function hudNum() {
    var R = g.run, rg = numRange();
    text(1, HUD_ROW, padR('NUMBER CODE ' + GAMES[0].lv[R.lvl], 22) + (R.cheated ? '$' : ' ') + padL(mmss(R.time), 7));
    if (R.lvl === 3) text(1, HUD_ROW + 1, padR('RANGE ' + pad(rg[0], 3) + '-' + pad(rg[1], 3) + ' CPU TRY ' + pad(R.ctries, 2) + (R.mine ? ' YOU ' + pad(R.mine, 3) : ''), 30));
    else text(1, HUD_ROW + 1, padR('RANGE ' + pad(rg[0], 3) + '-' + pad(rg[1], 3) + '  TRY ' + pad(R.tries, 2) + (R.maxT ? '/' + pad(R.maxT, 2) : '   '), 30));
  }

  /* ================================================================ 2 星塵猜拳大會 */
  function startRps(lv) {
    g.run = { kind: 'rps', m: 1, lvl: lv, opp: 0, you: 0, cpu: 0, phase: 'vs', pt: 0, cur: 0, yh: 0, ch: 0, yourLast: -1, cpuLast: -1,
      log: [], rounds: 0, lost: 0, cheated: false, continues: 0, saved: false, result: '' };
    g.mode = 'rps';
    enterVs();
  }
  function enterVs() {
    var R = g.run, O = OPP[R.opp];
    R.phase = 'vs'; R.pt = 0;
    redraw(function () {
      drawField();
      center(5, 'STAR CUP  MATCH ' + (R.opp + 1) + ' OF 3');
      portrait(14, 8);
      center(13, 'VS ' + O.name);
      center(16, O.quote[0]);
      center(18, O.quote[1]);
      center(21, 'BEST OF 3 - FIRST TO 2 WINS');
      center(23, 'PUSH A');
      hudRps();
      nes0.ppu.setBgPalette(3, O.pal);
    });
    AU.play('party_cup');
  }
  function portrait(c0, r0) {
    var R = g.run;
    for (var i = 0; i < 16; i++) put(c0 + (i & 3), r0 + (i >> 2), art.t('PR_' + R.opp + '_' + i));
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) putA((c0 >> 1) + a, (r0 >> 1) + b, 3);
  }
  function startMatch() {
    var R = g.run;
    R.you = R.boost ? 1 : 0; R.boost = false; R.cpu = 0; R.yourLast = -1; R.cpuLast = -1; R.log = []; R.cur = 1;
    R.phase = 'choose'; R.pt = 0;
    redraw(function () {
      drawField();
      portrait(14, 4);
      text(2, 5, OPP[R.opp].name);
      text(21, 5, 'LOG');
      for (var k = 0; k < 3; k++) {
        quad(8 + k * 6, 20, 'HB_' + k + '_');
        putA(4 + k * 3, 10, 2);
        text(7 + k * 6, 23, padR(HANDS[k], 5).replace(/ +$/, ''));
      }
      hudRps();
    });
    say('PICK A HAND  LEFT/RIGHT + A', 80);
  }
  function habitHand(R) {
    if (R.opp === 0) return 0;
    if (R.opp === 1) return R.yourLast < 0 ? 1 : R.yourLast;
    return R.cpuLast < 0 ? 1 : (R.cpuLast + 1) % 3;
  }
  function cpuPick(R) {
    var h = habitHand(R);
    return (rnd() & 255) < HABIT[R.lvl] ? h : rnd() % 3;
  }
  function rpsJudge() {
    var R = g.run;
    R.rounds++;
    if (R.yh === R.ch) { R.result = 'draw'; say('DRAW! AGAIN', 70); AU.sfx('party_chant'); }
    else if (beats(R.yh, R.ch)) { R.you++; R.result = 'win'; say(HANDS[R.yh] + ' BEATS ' + HANDS[R.ch] + '! YOU WIN', 70); AU.sfx('party_rwin'); }
    else { R.cpu++; R.lost++; R.result = 'lose'; say(HANDS[R.ch] + ' BEATS ' + HANDS[R.yh] + '... ', 70); AU.sfx('party_rlose'); }
    R.yourLast = R.yh; R.cpuLast = R.ch;
    R.log.push(R.ch); if (R.log.length > 5) R.log.shift();
    for (var i = 0; i < 5; i++) put(21 + i * 2, 7, i < R.log.length ? art.t('LG_' + R.log[i]) : 0);
  }
  function updateRps() {
    var R = g.run, I = NES.Input, D;
    R.pt++;
    if (R.phase === 'vs') { if (R.pt > 20 && (I.pressed(BTN.A) || startPressed())) startMatch(); return; }
    if (R.phase === 'choose') {
      D = dirs();
      if (D.l && R.cur > 0) { R.cur--; AU.sfx('party_move'); }
      if (D.r && R.cur < 2) { R.cur++; AU.sfx('party_move'); }
      if (I.pressed(BTN.A)) { R.yh = R.cur; R.ch = cpuPick(R); R.phase = 'shake'; R.pt = 0; AU.sfx('party_chant'); }
      return;
    }
    if (R.phase === 'shake') {
      if (R.pt === 24 || R.pt === 48) AU.sfx('party_chant');
      if (R.pt >= 72) { R.phase = 'show'; R.pt = 0; AU.sfx('party_reveal'); rpsJudge(); }
      return;
    }
    if (R.phase === 'show' && R.pt >= 80) {
      if (R.you >= 2) {
        R.opp++;
        if (R.opp >= 3) { rpsChampion(); return; }
        AU.play('party_win'); enterVs(); return;
      }
      if (R.cpu >= 2) { enterOver('LOST TO ' + OPP[R.opp].name); return; }
      R.phase = 'choose'; R.pt = 0;
    }
  }
  function rpsStars(lost) { return lost === 0 ? 3 : (lost <= 2 ? 2 : 1); }
  function rpsChampion() {
    var R = g.run, nb = false;
    R.opp = 2;
    if (!R.cheated) {
      save('cups', load('cups') + 1);
      var old = load('rps' + R.lvl);
      if (!old || R.rounds < old) { save('rps' + R.lvl, R.rounds); nb = true; }
      if (R.lvl >= 1 && !g.goalRun) g.goalRun = R;
    }
    R.saved = true; R.champion = true;
    enterResult(['STAR CUP CHAMPION!', 'BEAT ROCKO  MIMI  ORBIT', '', 'ROUNDS ' + pad(R.rounds, 2) + '   LOST ' + pad(R.lost, 2)], rpsStars(R.lost), nb);
  }
  function hudRps() {
    var R = g.run;
    text(1, HUD_ROW, padR('STAR CUP ' + GAMES[1].lv[R.lvl], 20) + (R.cheated ? '$' : ' ') + 'MATCH ' + (Math.min(R.opp, 2) + 1) + '/3');
    text(1, HUD_ROW + 1, padR('YOU ' + R.you + ' - ' + R.cpu + ' ' + OPP[Math.min(R.opp, 2)].name, 20) + 'ROUND ' + pad(R.rounds, 2) + ' ');
  }

  /* ================================================================ 3 星牌高低 */
  function newDeck() {
    var d = [], r, s, i;
    for (s = 0; s < 4; s++) for (r = 1; r <= 13; r++) d.push({ r: r, s: s });
    for (i = d.length - 1; i > 0; i--) { var j = rnd() % (i + 1), t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  function startHl(lv) {
    g.run = { kind: 'hl', m: 2, lvl: lv, deck: newDeck(), pos: 0, lives: HL_LIVES[lv], ok: 0, streak: 0, bestStreak: 0, cur: 0,
      phase: 'choose', pt: 0, cheated: false, continues: 0, saved: false, last: '' };
    g.mode = 'hl';
    redraw(function () { drawField(); hlLayout(); });
    say('HIGHER OR LOWER?  UP/DOWN + A', 90);
    AU.play('party_think');
  }
  var CARD_A = [8, 6], CARD_B = [20, 6];
  function drawCard(c0, r0, card, state) {     // state: 'face' / 'back' / 'edge'
    var c, r;
    for (r = 0; r < 6; r++) for (c = 0; c < 4; c++) put(c0 + c, r0 + r, bgTile(c0 + c, r0 + r));
    if (state === 'edge') {
      put(c0 + 1, r0, art.t('KTL')); put(c0 + 2, r0, art.t('KTR'));
      for (r = 1; r < 5; r++) { put(c0 + 1, r0 + r, art.t('KL')); put(c0 + 2, r0 + r, art.t('KR')); }
      put(c0 + 1, r0 + 5, art.t('KBL')); put(c0 + 2, r0 + 5, art.t('KBR'));
      return;
    }
    put(c0, r0, art.t('KTL')); put(c0 + 1, r0, art.t('KT')); put(c0 + 2, r0, art.t('KT')); put(c0 + 3, r0, art.t('KTR'));
    put(c0, r0 + 5, art.t('KBL')); put(c0 + 1, r0 + 5, art.t('KB')); put(c0 + 2, r0 + 5, art.t('KB')); put(c0 + 3, r0 + 5, art.t('KBR'));
    for (r = 1; r < 5; r++) { put(c0, r0 + r, art.t('KL')); put(c0 + 3, r0 + r, art.t('KR')); }
    if (state === 'back') { for (r = 1; r < 5; r++) { put(c0 + 1, r0 + r, art.t('KBK')); put(c0 + 2, r0 + r, art.t('KBK')); } return; }
    var tens = card.r >= 10 ? art.t('CD_1') : art.t('CD_SP'), ones = art.t('CD_' + (card.r % 10));
    put(c0 + 1, r0 + 1, tens); put(c0 + 2, r0 + 1, ones);
    put(c0 + 1, r0 + 4, tens); put(c0 + 2, r0 + 4, ones);
    quad(c0 + 1, r0 + 2, 'SU_' + card.s + '_');
  }
  function cardAttr(c0, r0) { for (var a = 0; a < 2; a++) for (var b = 0; b < 3; b++) putA((c0 >> 1) + a, (r0 >> 1) + b, 2); }
  function hlLayout() {
    var R = g.run;
    cardAttr(CARD_A[0], CARD_A[1]); cardAttr(CARD_B[0], CARD_B[1]);
    drawCard(CARD_A[0], CARD_A[1], R.deck[R.pos], 'face');
    drawCard(CARD_B[0], CARD_B[1], null, 'back');
    text(9, 13, 'NOW'); text(20, 13, 'NEXT');
    text(13, 15, 'HIGHER'); text(13, 17, 'LOWER');
    center(19, R.lvl === 2 ? 'SAME NUMBER = MISS' : 'SAME NUMBER = SAFE');
    hudHl(); hlHelp();
  }
  function unseen() {
    var R = g.run, cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = R.pos + 1; i < R.deck.length; i++) cnt[R.deck[i].r]++;
    return cnt;
  }
  function hlOdds() {
    var R = g.run, cnt = unseen(), cr = R.deck[R.pos].r, hi = 0, lo = 0;
    for (var r = 1; r <= 13; r++) { if (r > cr) hi += cnt[r]; if (r < cr) lo += cnt[r]; }
    return { hi: hi, lo: lo, same: cnt[cr], cnt: cnt };
  }
  function hlHelp() {
    var R = g.run, o = hlOdds(), r;
    if (R.lvl <= 1) {
      for (r = 1; r <= 13; r++) {
        var c = 1 + r * 2;
        put(c, 21, r >= 10 ? art.ch('1') : 0); put(c, 22, art.ch(String(r % 10))); put(c, 23, art.t('PIP' + o.cnt[r]));
      }
    }
    if (R.lvl === 0) center(25, 'HIGHER ' + pad(o.hi, 2) + '  LOWER ' + pad(o.lo, 2) + '  SAME ' + o.same);
    else if (R.lvl === 2) center(22, 'NO HELP ON HARD');
  }
  function hlPick() {
    var R = g.run;
    R.phase = 'flip'; R.pt = 0;
    drawCard(CARD_B[0], CARD_B[1], null, 'edge');
    AU.sfx('party_flip');
  }
  function hlJudge() {
    var R = g.run, c = R.deck[R.pos], n = R.deck[R.pos + 1];
    if (n.r === c.r && R.lvl < 2) { R.last = 'same'; say('SAME ' + n.r + '! SAFE', 50); AU.sfx('party_chant'); }
    else if (n.r !== c.r && (n.r > c.r) === (R.cur === 0)) {
      R.ok++; R.streak++; if (R.streak > R.bestStreak) R.bestStreak = R.streak; R.last = 'ok';
      say('RIGHT! ' + n.r + (R.cur === 0 ? ' IS HIGHER' : ' IS LOWER') + '  STREAK ' + R.streak, 50); AU.sfx('party_rwin');
    } else { R.lives--; R.streak = 0; R.last = 'miss'; say('MISS! IT WAS ' + n.r, 50); AU.sfx('party_rlose'); }
    R.phase = 'judge'; R.pt = 0;
  }
  function hlNext() {
    var R = g.run;
    R.pos++;
    if (R.lives <= 0) { enterOver('NO LIVES LEFT  CORRECT ' + pad(R.ok, 2)); return; }
    if (R.pos >= R.deck.length - 1) { hlEnd(); return; }
    drawCard(CARD_A[0], CARD_A[1], R.deck[R.pos], 'face');
    drawCard(CARD_B[0], CARD_B[1], null, 'back');
    hlHelp();
    R.phase = 'choose'; R.pt = 0;
  }
  function hlSave() {
    var R = g.run;
    if (!R || R.kind !== 'hl' || R.cheated || R.saved) return false;
    if (R.ok > load('hl' + R.lvl)) { save('hl' + R.lvl, R.ok); return true; }
    return false;
  }
  function hlStars(ok) { return ok >= 30 ? 3 : (ok >= 20 ? 2 : (ok >= 10 ? 1 : 0)); }
  function hlEnd() {
    var R = g.run, nb = hlSave();
    R.saved = true;
    enterResult(['WHOLE DECK DONE!', 'CORRECT ' + pad(R.ok, 2) + '   BEST STREAK ' + pad(R.bestStreak, 2), '', 'LIVES LEFT ' + R.lives], hlStars(R.ok), nb);
  }
  function updateHl() {
    var R = g.run, I = NES.Input;
    R.pt++;
    if (R.phase === 'choose') {
      var D = dirs();
      if ((D.u || D.d) ) { var nc = D.u ? 0 : 1; if (nc !== R.cur) { R.cur = nc; AU.sfx('party_move'); } }
      if (I.pressed(BTN.A)) hlPick();
      return;
    }
    if (R.phase === 'flip') { if (R.pt === 6) { drawCard(CARD_B[0], CARD_B[1], R.deck[R.pos + 1], 'face'); hlJudge(); } return; }
    if (R.phase === 'judge' && R.pt >= 50) hlNext();
  }
  function hudHl() {
    var R = g.run, h = '';
    for (var i = 0; i < 4; i++) h += i < R.lives ? '^' : ' ';
    text(1, HUD_ROW, padR('HIGH OR LOW ' + GAMES[2].lv[R.lvl], 22) + (R.cheated ? '$' : ' ') + ' ' + h);
    text(1, HUD_ROW + 1, padR('CARD ' + pad(R.pos + 1, 2) + '/52  OK ' + pad(R.ok, 2) + '  STREAK ' + pad(R.streak, 2), 30));
  }

  /* ================================================================ 結算 / GAME OVER */
  function enterResult(lines, st, nb) {
    var R = g.run;
    g.mode = 'result'; g.overT = 0;
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 4, art.t('BH')); put(c, 25, art.t('BHB')); }
      for (var i = 0; i < lines.length; i++) if (lines[i]) center(7 + i * 2, lines[i]);
      center(16, 'RATING ' + stars(st));
      if (R.cheated) center(19, 'CHEAT USED - NOT SAVED');
      else if (nb) center(19, 'NEW RECORD!');
      center(22, 'PUSH START');
      for (c = 1; c < 15; c++) putA(c, 3, 1);
      for (c = 5; c < 11; c++) putA(c, 8, 1);
    });
    AU.play('party_win');
  }
  function enterOver(why) {
    var R = g.run;
    if (R.kind === 'hl') { hlSave(); }
    g.mode = 'over'; g.overT = 0; R.why = why;
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('BH')); put(c, 24, art.t('BHB')); }
      center(8, 'GAME OVER');
      center(11, why);
      center(17, 'C/$ = CONTINUE HERE');
      center(19, 'START = TITLE');
      for (c = 5; c < 11; c++) putA(c, 4, 1);
    });
    AU.play('party_lose');
  }

  /* ================================================================ 密技 */
  function doCheat() {
    var R = g.run;
    if (!R) return;
    R.cheated = true;
    if (g.mode === 'over') {
      R.continues++;
      if (R.kind === 'num') { R.maxT = R.tries + 3; g.mode = 'num'; redraw(function () { drawField(); refreshCells(); hudNum(); }); AU.play('party_think'); say('CONTINUE! +3 TRIES', 60); }
      else if (R.kind === 'rps') { g.mode = 'rps'; R.you = 0; R.cpu = 0; enterVs(); say('CONTINUE! REMATCH ' + OPP[R.opp].name, 60); }
      else {
        R.lives = HL_LIVES[R.lvl]; g.mode = 'hl'; R.phase = 'choose'; R.pt = 0;
        if (R.pos >= R.deck.length - 1) { hlEnd(); return; }
        redraw(function () { drawField(); hlLayout(); });
        AU.play('party_think'); say('CONTINUE! LIVES REFILLED', 60);
      }
      return;
    }
    if (R.kind === 'num') {
      if (R.lvl === 3) { R.ctries++; say('STAR BOOST! ORBIT -1 GUESS', 60); }
      else if (R.maxT) { R.maxT += 3; say('STAR BOOST! +3 TRIES', 60); }
      else say('STAR HINT: ' + Math.floor(R.secret / 10) + 'X', 90);
    } else if (R.kind === 'rps') {
      if (R.phase === 'vs') { say('STAR BOOST NEXT MATCH', 60); R.boost = true; }
      else { R.you = Math.min(1, R.you + 1); say('STAR POINT +1', 60); }
    } else { R.lives = Math.min(4, R.lives + 1); say('STAR BOOST! +1 LIFE', 60); }
    AU.sfx('party_ok');
  }

  /* ================================================================ 精靈 */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, R = g.run, q;
    function spr(x, y, tile, pal, fh, fv) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv }); }
    function hand(x, y, k, pal, down) {
      for (var i = 0; i < 4; i++) {
        var tx = i & 1, ty = i >> 1;
        spr(x + tx * 8, y + (down ? 1 - ty : ty) * 8, art.s('H_' + k + '_' + i), pal, false, !!down);
      }
    }
    function box(x, y, w, h, pal) {
      var c = art.s('CUR');
      spr(x - 3, y - 3, c, pal); spr(x + w - 5, y - 3, c, pal, true);
      spr(x - 3, y + h - 4, c, pal, false, true); spr(x + w - 5, y + h - 4, c, pal, true, true);
    }
    var blink = (g.t & 16) === 0;
    if (g.mode === 'title') spr(10, titleRow(g.sel) * 8, art.s('ARW'), 2);
    if (R && g.mode === 'num' && !g.paused) {
      if (R.phase === 'play' || R.phase === 'pick') box(R.cx * 24 + 8, R.cy * 16 + 48, 24, 8, 2);
      if (R.phase === 'cpu' || R.phase === 'answer') {
        if (R.phase === 'cpu' || blink) box(R.ccx * 24 + 8, R.ccy * 16 + 48, 24, 8, 1);
      }
      if (R.mine && blink) spr(cellCol(R.mine) * 8 + 8, cellRow(R.mine) * 8 - 8, art.s('SPK'), 3);
    }
    if (R && g.mode === 'rps' && R.phase !== 'vs' && !g.paused) {
      var bob = 0;
      if (R.phase === 'shake') bob = (R.pt % 24) < 12 ? -6 : 0;
      var shown = R.phase === 'show';
      hand(112, 76 - bob, shown ? R.ch : 0, 1, true);
      hand(112, 124 + bob, shown ? R.yh : 0, 0, false);
      if (R.phase === 'choose') box(64 + R.cur * 48, 160, 16, 16, 2);
      if (R.phase === 'shake') spr(R.pt < 24 ? 72 : (R.pt < 48 ? 104 : 136), 100, art.s('SPK'), 2);
      if (shown && R.result === 'win') { spr(104, 120, art.s('SPK'), 3); spr(136, 132, art.s('SPK'), 3); }
    }
    if (R && g.mode === 'hl' && !g.paused && R.phase === 'choose') spr(88, (R.cur === 0 ? 15 : 17) * 8, art.s('ARW'), 2);
    for (q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }

  /* ================================================================ HUD / 訊息列 */
  function hud() {
    var R = g.run;
    if (!R) return;
    if (g.mode === 'num') hudNum();
    else if (g.mode === 'rps') { hudRps(); if (R.phase === 'shake' || R.phase === 'choose') chantRow(); }
    else if (g.mode === 'hl') hudHl();
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = g.msg;
    else if (g.mode === 'num') line = R.phase === 'pick' ? 'PICK A SECRET NUMBER, A' : (R.phase === 'answer' ? 'UP=HIGHER DOWN=LOWER A=YES' : 'DPAD MOVE  A GUESS  B HINT');
    else if (g.mode === 'rps') line = R.phase === 'vs' ? '' : 'LEFT/RIGHT + A  THROW';
    else line = 'UP/DOWN + A  PICK';
    text(1, MSG_ROW, padR(line, 30));
  }
  function chantRow() {
    var R = g.run, s = '';
    if (R.phase === 'shake') s = R.pt < 24 ? '1 .' : (R.pt < 48 ? '1 . 2 .' : '1 . 2 . STAR!');
    text(9, 14, padR(s, 14));
  }

  /* ================================================================ 主迴圈 */
  function playing() { return g.mode === 'num' || g.mode === 'rps' || g.mode === 'hl'; }
  function updatePlay() {
    if (startPressed() && !(g.mode === 'rps' && g.run.phase === 'vs')) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      g.hold = {};
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (g.mode === 'num') updateNum();
    else if (g.mode === 'rps') updateRps();
    else updateHl();
  }

  /* ================================================================ 機器人（用游標正常操作） */
  function botMask() {
    var B = g.bot;
    B.t++;
    var m = inner();
    if (m && B.prev) m = 0;                 // 每次只按 1 幀就放開
    B.prev = m;
    return m;
    function tap(k) { return (B.t % 3 === 0) ? k : 0; }
    function inner() {
      var R = g.run;
      if (g.mode === 'title') {
        var wm = clamp((parseInt((CT.query && CT.query('pmode')) || '2', 10) || 2) - 1, 0, 2);
        var wl = clamp((parseInt((CT.query && CT.query('plvl')) || '2', 10) || 2) - 1, 0, GAMES[wm].lv.length - 1);
        if (g.t < 30) return 0;
        if (g.sel !== wm) return (B.t % 8 === 0) ? BTN.DOWN : 0;
        if (g.lvl[wm] !== wl) return (B.t % 8 === 0) ? BTN.RIGHT : 0;
        return (B.t % 20 === 0) ? BTN.START : 0;
      }
      if (g.mode === 'over' || g.mode === 'result') return (g.overT > 60 && B.t % 30 === 0) ? BTN.START : 0;
      if (g.paused) return (B.t % 30 === 0) ? BTN.START : 0;
      if (!R) return 0;
      if (g.mode === 'num') {
        if (R.phase === 'answer') { if (B.t % 20) return 0; return R.mine === R.cg ? BTN.A : (R.mine > R.cg ? BTN.UP : BTN.DOWN); }
        if (R.phase === 'cpu') return 0;
        var target = R.phase === 'pick' ? clamp(parseInt((CT.query && CT.query('pnum')) || '73', 10) || 73, 1, 100) : ((R.lo + R.hi) >> 1);
        var tx = (target - 1) % 10, ty = Math.floor((target - 1) / 10);
        if (R.cy !== ty) return tap(R.cy < ty ? BTN.DOWN : BTN.UP);
        if (R.cx !== tx) return tap(R.cx < tx ? BTN.RIGHT : BTN.LEFT);
        return (B.t % 12 === 0) ? BTN.A : 0;
      }
      if (g.mode === 'rps') {
        if (R.phase === 'vs') return (R.pt > 40 && B.t % 10 === 0) ? BTN.A : 0;
        if (R.phase !== 'choose' || R.pt < 10) return 0;
        var want = (habitHand(R) + 1) % 3;     // 剋制對手的習慣拳
        if (R.cur !== want) return tap(R.cur < want ? BTN.RIGHT : BTN.LEFT);
        return (B.t % 6 === 0) ? BTN.A : 0;
      }
      if (g.mode === 'hl') {
        if (R.phase !== 'choose' || R.pt < 10) return 0;
        var o = hlOdds(), wc = o.hi >= o.lo ? 0 : 1;
        if (R.cur !== wc) return tap(wc === 0 ? BTN.UP : BTN.DOWN);
        return (B.t % 6 === 0) ? BTN.A : 0;
      }
      return 0;
    }
  }
  function goalOk() { return !!(g && g.goalRun && !g.goalRun.cheated); }

  /* ================================================================ 註冊 */
  var GAME = {
    id: 'party', order: 8, title: '星塵派對', legacy: ['guessing-game.html', 'rock-paper-scissors.html'],
    init: function (nes) {
      nes0 = nes;
      art = PA.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'party_bg');
      NES.CHR.setPattern(1, 'party_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(PAL.bd);
      for (i = 0; i < 4; i++) { ppu.setBgPalette(i, PAL.bg[i]); ppu.setSprPalette(i, PAL.spr[i]); }
      GAME.backTile = { tile: art.s('DOT'), pal: 3 };
      AU.init(nes);
      g = newState();
      enterTitle();
      var qm = CT.query ? parseInt(CT.query('pmode') || '', 10) : NaN;
      if (qm >= 1 && qm <= 3 && CT.query('direct') === '1') {
        var ql = clamp((parseInt(CT.query('plvl') || '2', 10) || 2) - 1, 0, GAMES[qm - 1].lv.length - 1);
        g.sel = qm - 1; g.lvl[qm - 1] = ql; startGame(qm - 1, ql);
      }
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'over' || g.mode === 'result') {
        g.overT++;
        if (g.overT > 40 && startPressed()) { if (g.mode === 'over' && g.run && g.run.kind === 'hl') hlSave(); enterTitle(); }
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') { if ((g.t & 31) === 0) text(11, 26, (g.t & 32) ? '          ' : 'PUSH START'); }
      else if (playing()) hud();
      flush();
      drawSprites();
    },
    state: function () {
      var R = g.run, r = null;
      if (R) {
        r = { kind: R.kind, lvl: R.lvl, phase: R.phase, cheated: R.cheated, continues: R.continues };
        if (R.kind === 'num') { r.lo = R.lo; r.hi = R.hi; r.tries = R.tries; r.maxT = R.maxT; r.cx = R.cx; r.cy = R.cy; r.mine = R.mine; r.cg = R.cg; r.ctries = R.ctries; r.clo = R.clo; r.chi = R.chi; r.time = R.time; }
        if (R.kind === 'rps') { r.opp = R.opp; r.you = R.you; r.cpu = R.cpu; r.cur = R.cur; r.yh = R.yh; r.ch = R.ch; r.rounds = R.rounds; r.lost = R.lost; r.log = R.log.slice(); r.result = R.result; r.champion = !!R.champion; r.pt = R.pt; }
        if (R.kind === 'hl') { r.pos = R.pos; r.lives = R.lives; r.ok = R.ok; r.streak = R.streak; r.cur = R.cur; r.card = R.deck[R.pos]; r.last = R.last; }
      }
      return { mode: g.mode, sel: g.sel, lvl: g.lvl.slice(), paused: g.paused, t: g.t, queue: g.q.length + g.qa.length, run: r, goal: goalOk(), music: AU.current };
    },
    exit: function () { if (g && g.run && g.run.kind === 'hl' && (playing() || g.mode === 'over')) hlSave(); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || g.mode === 'result' || !g.run) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return 'CUP' + pad(Math.min(999, CT.load('party', 'cups', 0) | 0), 3); }
  };
  PA.GAMES = GAMES;
  PA.OPP = OPP;
  PA.HABIT = HABIT;
  PA.REP = [REP_DELAY, REP_EVERY];
  PA.dev = {
    g: function () { return g; },
    start: function (m, lv) { g.sel = m; g.lvl[m] = lv; startGame(m, lv); },
    title: function () { enterTitle(); },
    beats: beats, habitHand: habitHand, cpuPick: function () { return cpuPick(g.run); }, newDeck: newDeck, odds: hlOdds,
    // 解題器：照遊戲規則（numGuess 同一套高低判定）用二分法猜 secret，回傳次數
    solve: function (secret) {
      var lo = 1, hi = 100, n = 0;
      while (lo <= hi) { var m = (lo + hi) >> 1; n++; if (m === secret) return n; if (m < secret) lo = m + 1; else hi = m - 1; }
      return -1;
    },
    secret: function () { return g.run && g.run.secret; }
  };
  if (CT.register) CT.register(GAME);
})();
