/*
 * games/cart2/gallery/main.js — 《星塵射擊場 STAR RANGE》（合輯卡帶二 槽 6，id = gallery）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-4 cart2-aim（R6）｜ 依賴：gallery/art.js、gallery/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：precision-aim / speed-target-shooter / target-tracking / hand-eye-coordination /
 *   multi-target-coordination / circle-clicker / cursor-chase / visual-tracking-challenge ⇒ 8 合 1 成 6 個模式。
 *
 * 舞台：軌道站外的星光訓練場（黑色太空 + 桁架邊框 + 全像光靶）。沒有草地 / 鴨子 / 獵犬（brief §1-5）。
 * 游標（brief §1-4）：十字鍵移動，按住前 8 幀 1 px/幀、之後 3 px/幀；B 按住 = 精細 1 px；A = 射擊（只認按下邊緣）。
 * 模式（每模式 5 個等級，每級有「合格線 NORM」，沒達到 = GAME OVER；5 級全過 = 結算評價 S/A/B/C/D）：
 *   1 PRECISION 精準靶  每級 5 發，越靠近中心越高分（10/8/6/4/2）；等級：靶變小、限時變短、準星晃動（星風）
 *   2 SPEED     速射    星晶片陸續浮現、會自己淡出；越快打中越高分；等級：數量 / 同時數 / 存活時間
 *   3 TRACK     追蹤    準星持續貼住移動的探測球累積 LOCK；等級：速度 + 突進
 *   4 ORDER     多目標  1..N 編號光靶同時出現，照順序打；打錯扣時間
 *   5 CHASE     追逐    光點會逃離準星、偶爾喘口氣；限時內抓到指定數量
 *   6 EYE       眼力    一顆球先亮起，然後全部混在一起亂跑，停下後打中剛才那顆
 * 每線精靈（設計保證）：準星 16×16 = 每線 2；PRECISION/SPEED/ORDER 只多 1 顆彈著點；TRACK 探測球 16 寬 = 2；
 *   CHASE 光點 + 2 尾巴 = 3；EYE 球 ≤ 6 顆 8×8 ⇒ 每線最多 6 + 2 = 8。靶全部畫在 BG（16 px 對齊屬性格）。
 * VBlank：所有名稱表 / 屬性寫入走佇列，每幀寫到 140 byte 為止（換關 / 換畫面整片重畫在 CT.blank 內）。
 * 密技（C / ★）：遊玩中 = 計時補滿（精準靶本級關閉星風；眼力重新亮出目標）；未達合格線 / GAME OVER = 原地重打本級（分數保留）；
 *   標題 / 結算無效。用過密技的那一局不算 goal。goal = 精準靶 + 速射兩模式都拿到 B 以上評價。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var GA = CT.Gallery = CT.Gallery || {};
  var AU = GA.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var AX0 = 12, AX1 = 243, AY0 = 44, AY1 = 203;          // 準星中心可動範圍（fix-r6：HUD 下移一列，上緣 36 → 44 不蓋 HUD）
  var MSG_ROW = 27, HUD1 = 2, HUD2 = 3;
  var FLUSH_LIMIT = 140;
  var GRADES = ['S', 'A', 'B', 'C', 'D'], GRADE_PCT = [90, 75, 60, 40, 0];
  var MODES = [
    { key: 'PRE', name: 'PRECISION', rule: ['SHOOT NEAR THE CENTER', '10 8 6 4 2 PTS PER RING'], norm: 'NORM 25 PTS OF 50' },
    { key: 'SPD', name: 'SPEED', rule: ['SHOOT CHIPS BEFORE FADE', 'FASTER HIT = MORE PTS'], norm: 'NORM 60% HITS' },
    { key: 'TRK', name: 'TRACK', rule: ['KEEP SIGHT ON THE PROBE', 'LOCK TIME = PTS'], norm: 'NORM LOCK 40%' },
    { key: 'ORD', name: 'ORDER', rule: ['SHOOT 1 2 3.. IN ORDER', 'WRONG ONE = -1 SEC'], norm: 'NORM 2 OF 3 ROUNDS' },
    { key: 'CHS', name: 'CHASE', rule: ['CATCH THE RUNAWAY SPARK', 'IT RESTS NOW AND THEN'], norm: 'NORM ALL SPARKS' },
    { key: 'EYE', name: 'EYE', rule: ['WATCH THE LIT ORB', 'SHOOT IT WHEN THEY STOP'], norm: 'NORM 2 OF 3 CORRECT' }
  ];
  var LV = {
    PRE: [{ size: 32, time: 300, sway: 0 }, { size: 32, time: 240, sway: 2 }, { size: 16, time: 270, sway: 0 }, { size: 16, time: 230, sway: 2 }, { size: 16, time: 210, sway: 2 }],
    SPD: [{ n: 10, conc: 1, life: 210 }, { n: 10, conc: 2, life: 190 }, { n: 12, conc: 2, life: 170 }, { n: 12, conc: 3, life: 160 }, { n: 14, conc: 3, life: 150 }],
    TRK: [{ v: 192, dash: 0 }, { v: 288, dash: 0 }, { v: 384, dash: 1 }, { v: 448, dash: 1 }, { v: 512, dash: 1 }],
    ORD: [{ n: 3, time: 420 }, { n: 4, time: 450 }, { n: 5, time: 480 }, { n: 6, time: 540 }, { n: 7, time: 600 }],
    CHS: [{ v: 256, rest: 50, need: 3 }, { v: 320, rest: 45, need: 3 }, { v: 384, rest: 40, need: 4 }, { v: 448, rest: 36, need: 4 }, { v: 512, rest: 32, need: 5 }],
    EYE: [{ n: 3, v: 256, mv: 150 }, { n: 4, v: 288, mv: 170 }, { n: 5, v: 320, mv: 190 }, { n: 6, v: 352, mv: 210 }, { n: 6, v: 416, mv: 240 }]
  };
  var PRE_SHOTS = 5, TRK_TIME = 600, CHS_TIME = 1200, ROUNDS = 3, EYE_SHOW = 70, EYE_PICK = 300;
  var PAL = {
    bd: 0x0F,
    bg: [[0x01, 0x21, 0x30], [0x14, 0x2C, 0x30], [0x17, 0x2A, 0x30], [0x06, 0x28, 0x38]],
    spr: [[0x16, 0x28, 0x30], [0x00, 0x2C, 0x30], [0x17, 0x28, 0x38], [0x27, 0x38, 0x30]]
  };

  var art = null, nes0 = null, g = null;

  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, paused: false, cheatReq: false,
      cx: 128, cy: 120, hx: 0, hy: 0, ax: 128, ay: 120, noSway: false,
      run: null, sub: null, msg: '', msgT: 0, marker: null, sprUsed: 0,
      want: new Int16Array(32 * 30), have: new Int16Array(32 * 30), wantA: new Int8Array(16 * 15), haveA: new Int8Array(16 * 15),
      q: [], qa: [], seed: 0x2468, goals: { PRE: false, SPD: false }, bot: { t: 0, prevA: false, lastShot: -99, wait: 0 },
      overT: 0, newBest: false, peakQ: 0
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function isqrt(n) { if (n <= 0) return 0; var x = Math.floor(Math.sqrt(n)); while (x * x > n) x--; while ((x + 1) * (x + 1) <= n) x++; return x; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 名稱表 / 屬性：影子 + 佇列（每幀 ≤ FLUSH_LIMIT byte） ---------------- */
  function bgTile(c, r) {
    // fix-r6：HUD 下移一列（第 2、3 列，手機直向不貼頂），上桁架改第 4 列
    if (r === 4 || r === 26) return art.t(r === 4 ? 'GH' : 'GHB');
    if (r < 5 || r > 25) return 0;
    if (c === 0) return art.t('GV');
    if (c === 31) return art.t('GVR');
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x5bd1) >>> 0;
    if (h % 29 === 3) return art.t('ST1');
    if (h % 43 === 7) return art.t('ST2');
    if (h % 97 === 11) return art.t('ST3');
    return 0;
  }
  function put(c, r, t) {
    var k = r * 32 + c;
    if (g.want[k] === t) return;
    g.want[k] = t; g.q.push(k);
  }
  function putA(c16, r16, p) {
    var k = r16 * 16 + c16;
    if (g.wantA[k] === p) return;
    g.wantA[k] = p; g.qa.push(k);
  }
  function text(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) put(col + i, row, t[i]); }
  function restore(col, row, w) { for (var i = 0; i < w; i++) put(col + i, row, bgTile(col + i, row)); }
  function flush() {
    var bud = nes0.timing && nes0.timing.budget, ppu = nes0.ppu;
    if (g.q.length + g.qa.length > g.peakQ) g.peakQ = g.q.length + g.qa.length;
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
  // 整片重畫（在 CT.blank 內）：fn 用 put / putA 畫，畫完直接全部寫入
  function redraw(fn) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      g.q = []; g.qa = [];
      for (var k = 0; k < 960; k++) g.want[k] = 0;
      for (k = 0; k < 240; k++) g.wantA[k] = 0;
      fn();
      for (k = 0; k < 960; k++) ppu.setTile(0, k & 31, k >> 5, g.want[k]);
      for (k = 0; k < 240; k++) ppu.setAttr(0, k & 15, k >> 4, g.wantA[k]);
      g.have.set(g.want); g.haveA.set(g.wantA);
      g.q = []; g.qa = [];
      clearSpr();
    });
  }
  function clearSpr() { nes0.ppu.clearSprites(); g.sprUsed = 0; }
  function drawField() {
    for (var r = 3; r <= 26; r++) for (var c = 0; c < 32; c++) put(c, r, bgTile(c, r));
  }

  /* ---------------- 標題 ---------------- */
  function gradeOf(key) { return CT.load('gallery', 'grade_' + key, 5) | 0; }
  function gradeText(i) { return i >= 0 && i < 5 ? GRADES[i] : '-'; }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (ch === ' ') continue;
      put(col + i * 2, row, art.t('BIG_' + ch + '0')); put(col + i * 2 + 1, row, art.t('BIG_' + ch + '1'));
      put(col + i * 2, row + 1, art.t('BIG_' + ch + '2')); put(col + i * 2 + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }
  function titleRow(i) { return 9 + i * 2; }
  function modeLine(i) { return (i + 1) + ' ' + padR(MODES[i].name, 11) + 'BEST ' + gradeText(gradeOf(MODES[i].key)); }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.sub = null; g.paused = false;
    redraw(function () {
      for (var c = 0; c < 32; c++) { put(c, 1, art.t('GHB')); put(c, 28, art.t('GH')); }
      big(6, 3, 'STAR RANGE');
      text(5, 6, 'ORBITAL TARGET TRAINING');
      for (var i = 0; i < MODES.length; i++) text(6, titleRow(i), modeLine(i));
      text(3, 21, 'DPAD AIM  B FINE  A FIRE');
      text(3, 23, 'HOLD START+SELECT: MENU');
      text(3, 25, 'C/$ = CHEAT  UP/DOWN MODE');
      for (c = 1; c < 15; c++) { putA(c, 1, 3); putA(c, 2, 3); }
      selAttr(g.sel, 3);
    });
    AU.play('gallery_title');
  }
  function selAttr(i, p) { var r16 = titleRow(i) >> 1; for (var c = 3; c < 15; c++) putA(c, r16, p); }

  /* ---------------- 模式 / 等級流程 ---------------- */
  function modeKey() { return MODES[g.run.m].key; }
  function startMode(m, lv) {
    var runs = (g.runsTotal || 0) + 1;
    g.runsTotal = runs;
    g.seed = (0x1357 + runs * 7919 + m * 131) & 0x7fffffff;
    g.run = { m: m, lv: lv || 0, score: 0, lvScores: [], cheated: false, continues: 0 };
    g.cx = 128; g.cy = 120; g.hx = 0; g.hy = 0;
    startLevel();
    AU.play('gallery_range');
  }
  function startLevel() {
    var R = g.run, M = MODES[R.m];
    g.mode = 'intro'; g.t = 0; g.paused = false; g.noSway = false; g.marker = null; g.msg = ''; g.msgT = 0;
    g.sub = { lvScore: 0, time: 0, timeMax: 1 };
    redraw(function () {
      drawField();
      text(9, 11, 'LEVEL ' + (R.lv + 1) + ' OF 5');
      text(16 - (M.rule[0].length >> 1), 13, M.rule[0]);
      text(16 - (M.rule[1].length >> 1), 15, M.rule[1]);
      text(16 - (M.norm.length >> 1), 17, M.norm);
      drawHud(true);
    });
  }
  function clearIntro() { for (var r = 11; r <= 17; r += 2) restore(1, r, 30); }
  function beginPlay() {
    clearIntro();
    g.mode = 'play'; g.t = 0;
    var k = modeKey(), L = LV[k][g.run.lv], s = g.sub;
    s.occ = new Uint8Array(16 * 15);
    if (k === 'PRE') { s.shot = 0; s.tg = null; s.wait = 10; s.timeMax = L.time; s.time = 0; }
    else if (k === 'SPD') { s.list = []; s.spawned = 0; s.hits = 0; s.miss = 0; s.wait = 20; s.n = L.n; s.timeMax = L.n; s.time = L.n; }
    else if (k === 'TRK') { s.timeMax = TRK_TIME; s.time = TRK_TIME; s.lock = 0; s.px = 128 * 256; s.py = 112 * 256; s.wp = null; s.dashT = 0; s.locked = false; }
    else if (k === 'ORD') { s.round = 0; s.clear = 0; s.timeMax = L.time; startRound(); }
    else if (k === 'CHS') { s.timeMax = CHS_TIME; s.time = CHS_TIME; s.got = 0; s.need = L.need; spawnSpark(); }
    else if (k === 'EYE') { s.round = 0; s.correct = 0; startRound(); }
  }
  function levelMax(k, L) {
    if (k === 'PRE') return PRE_SHOTS * 10;
    if (k === 'SPD') return L.n * 100;
    if (k === 'TRK') return TRK_TIME;
    if (k === 'ORD') return ROUNDS * (L.n * 50 + (L.time >> 2));
    if (k === 'CHS') return L.need * 200;
    return ROUNDS * (100 + (EYE_PICK >> 2));
  }
  function runMax(k) { var t = 0; for (var i = 0; i < 5; i++) t += levelMax(k, LV[k][i]); return t; }
  function passed() {
    var k = modeKey(), s = g.sub, L = LV[k][g.run.lv];
    if (k === 'PRE') return s.lvScore >= 25;
    if (k === 'SPD') return s.hits * 10 >= L.n * 6;
    if (k === 'TRK') return s.lock * 10 >= TRK_TIME * 4;
    if (k === 'ORD') return s.clear >= 2;
    if (k === 'CHS') return s.got >= L.need;
    return s.correct >= 2;
  }
  function endLevel() {
    var ok = passed();
    g.mode = 'lvlend'; g.t = 0; g.sub.ok = ok; g.marker = null;
    eraseAll();
    if (ok) { g.run.lvScores[g.run.lv] = g.sub.lvScore; AU.play('gallery_clear'); }
    else { AU.sfx('gallery_wrong'); AU.stop(); }
    text(16 - 7, 13, ok ? 'LEVEL ' + (g.run.lv + 1) + ' CLEAR!' : ' NORM FAILED  ');
    text(16 - 7, 15, 'LEVEL PTS ' + pad(g.sub.lvScore, 4));
  }
  function afterLevel() {
    if (!g.sub.ok) { enterOver(); return; }
    if (g.run.lv >= 4) { enterResult(); return; }
    g.run.lv++;
    startLevel();
    AU.play('gallery_range');
  }
  function eraseAll() {
    var s = g.sub;
    if (!s) return;
    if (s.tg) { eraseBlock(s.tg.c16, s.tg.r16, s.tg.size >> 4); s.tg = null; }
    if (s.list) { s.list.forEach(function (o) { eraseBlock(o.c16, o.r16, 1); }); s.list = []; }
    if (s.discs) { s.discs.forEach(function (o) { if (o.alive || o.burst > 0) eraseBlock(o.c16, o.r16, 1); }); s.discs = []; }
  }
  function saveBest() {
    if (!g || !g.run) return false;
    var best = CT.load('gallery', 'best', 0) | 0;
    if (g.run.score > best) { CT.save('gallery', 'best', g.run.score); return true; }
    return false;
  }
  function enterOver() {
    g.mode = 'over'; g.overT = 0; g.newBest = saveBest();
    var R = g.run;
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('GH')); put(c, 24, art.t('GHB')); }
      text(11, 8, 'GAME OVER');
      text(7, 11, 'MODE   ' + MODES[R.m].name);
      text(7, 13, 'LEVEL  ' + (R.lv + 1) + ' OF 5');
      text(7, 15, 'SCORE  ' + pad(R.score, 6) + (g.newBest ? ' NEW!' : ''));
      text(5, 18, 'C/$ = RETRY THIS LEVEL');
      text(5, 20, 'START = TITLE');
      putA(5, 4, 3); putA(6, 4, 3); putA(7, 4, 3);
    });
    AU.play('gallery_over');
  }
  function enterResult() {
    var R = g.run, k = modeKey(), mx = runMax(k), pct = Math.min(100, Math.floor(R.score * 100 / mx)), gi = 4;
    for (var i = 0; i < 5; i++) if (pct >= GRADE_PCT[i]) { gi = i; break; }
    R.pct = pct; R.grade = gi;
    g.mode = 'result'; g.overT = 0; g.newBest = saveBest();
    var old = gradeOf(k), newGrade = !R.cheated && gi < old;
    if (!R.cheated && gi < old) CT.save('gallery', 'grade_' + k, gi);
    if (!R.cheated && gi <= 2 && (k === 'PRE' || k === 'SPD')) g.goals[k] = true;
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 3, art.t('GH')); put(c, 26, art.t('GHB')); }
      text(8, 5, 'RESULT  ' + MODES[R.m].name);
      for (var j = 0; j < 5; j++) text(8, 8 + j * 2, 'LEVEL ' + (j + 1) + '   ' + pad(R.lvScores[j] || 0, 4));
      text(8, 18, 'TOTAL  ' + pad(R.score, 6) + ' ' + pad(pct, 2) + '%');
      text(8, 21, 'GRADE');
      big(15, 20, GRADES[gi]);
      putA(7, 10, 3); putA(8, 10, 3);
      if (R.cheated) text(19, 21, 'CHEAT');
      else if (newGrade) text(19, 21, 'NEW!');
      text(11, 24, 'PUSH START');
    });
    AU.play('gallery_clear');
  }

  /* ---------------- 靶（BG） ---------------- */
  function drawBlock(c16, r16, w, prefix, pal) {
    var n = w * 2;
    for (var ty = 0; ty < n; ty++) for (var tx = 0; tx < n; tx++) put(c16 * 2 + tx, r16 * 2 + ty, art.t(prefix + (ty * n + tx)));
    for (var y = 0; y < w; y++) for (var x = 0; x < w; x++) { putA(c16 + x, r16 + y, pal); g.sub.occ[(r16 + y) * 16 + c16 + x] = 1; }
  }
  function eraseBlock(c16, r16, w) {
    var n = w * 2;
    for (var ty = 0; ty < n; ty++) for (var tx = 0; tx < n; tx++) put(c16 * 2 + tx, r16 * 2 + ty, bgTile(c16 * 2 + tx, r16 * 2 + ty));
    for (var y = 0; y < w; y++) for (var x = 0; x < w; x++) { putA(c16 + x, r16 + y, 0); if (g.sub.occ) g.sub.occ[(r16 + y) * 16 + c16 + x] = 0; }
  }
  // 找空位（16 px 格；w = 1 或 2 格寬），離準星 ≥ minD px
  function freeSpot(w, minD) {
    for (var tries = 0; tries < 80; tries++) {
      var c16 = 1 + rnd() % (15 - w), r16 = 3 + rnd() % (11 - w), ok = true;
      for (var y = -1; y <= w && ok; y++) for (var x = -1; x <= w && ok; x++) {
        var cc = c16 + x, rr = r16 + y;
        if (cc >= 0 && cc < 16 && rr >= 0 && rr < 15 && g.sub.occ[rr * 16 + cc]) ok = false;
      }
      var cx = c16 * 16 + w * 8, cy = r16 * 16 + w * 8;
      if (ok && (tries > 60 || (cx - g.ax) * (cx - g.ax) + (cy - g.ay) * (cy - g.ay) >= minD * minD)) return { c16: c16, r16: r16 };
    }
    return null;
  }

  /* ---------------- 游標 ---------------- */
  function tri(t, p, amp) { var ph = t % p, v = ph < (p >> 1) ? ph : p - ph; return ((v * 4 * amp) / p | 0) - amp; }
  function swayX() { var L = curSway(); return L ? tri(g.t, 128, L) : 0; }
  function swayY() { var L = curSway(); return L ? tri(g.t + 37, 96, L) : 0; }
  function curSway() { if (!g.run || g.noSway || modeKey() !== 'PRE' || g.mode !== 'play') return 0; return LV.PRE[g.run.lv].sway; }
  function moveCursor() {
    var I = NES.Input, fine = I.held(BTN.B);
    var dx = (I.held(BTN.RIGHT) ? 1 : 0) - (I.held(BTN.LEFT) ? 1 : 0);
    var dy = (I.held(BTN.DOWN) ? 1 : 0) - (I.held(BTN.UP) ? 1 : 0);
    g.hx = dx ? g.hx + 1 : 0; g.hy = dy ? g.hy + 1 : 0;
    var sx = fine ? 1 : (g.hx > 8 ? 3 : 1), sy = fine ? 1 : (g.hy > 8 ? 3 : 1);
    g.cx = clamp(g.cx + dx * sx, AX0, AX1); g.cy = clamp(g.cy + dy * sy, AY0, AY1);
    g.ax = clamp(g.cx + swayX(), AX0, AX1); g.ay = clamp(g.cy + swayY(), AY0, AY1);
  }
  function d2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }

  /* ---------------- 各模式 ---------------- */
  function tickPRE(fire) {
    var s = g.sub, L = LV.PRE[g.run.lv];
    if (!s.tg) {
      if (--s.wait > 0) return;
      if (s.shot >= PRE_SHOTS) { endLevel(); return; }
      var w = L.size >> 4, p = freeSpot(w, 56);
      if (!p) return;
      s.tg = { c16: p.c16, r16: p.r16, size: L.size, cx: p.c16 * 16 + (L.size >> 1), cy: p.r16 * 16 + (L.size >> 1), born: g.t };
      drawBlock(p.c16, p.r16, w, L.size === 32 ? 'TB_' : 'TS_', 1);
      s.time = L.time;
      return;
    }
    s.time--;
    if (fire || s.time <= 0) {
      var pts = fire ? GA.ringScore(s.tg.size, g.ax - s.tg.cx, g.ay - s.tg.cy) : 0;
      s.lvScore += pts; g.run.score += pts; s.shot++;
      s.lastPts = pts;
      if (fire) g.marker = { x: g.ax, y: g.ay, t: 40 };
      AU.sfx(pts >= 10 ? 'gallery_bull' : (pts > 0 ? 'gallery_hit' : 'gallery_miss'));
      say(!fire ? 'TIME UP  0 PTS' : (pts >= 10 ? 'BULLSEYE! 10 PTS' : (pts ? 'HIT  ' + pts + ' PTS' : 'MISS  0 PTS')), 50);
      eraseBlock(s.tg.c16, s.tg.r16, s.tg.size >> 4);
      s.tg = null; s.wait = 40;
    }
  }
  function tickSPD(fire) {
    var s = g.sub, L = LV.SPD[g.run.lv], i, o;
    var live = 0;
    for (i = 0; i < s.list.length; i++) if (s.list[i].alive) live++;
    if (s.spawned < L.n && live < L.conc && --s.wait <= 0) {
      var p = freeSpot(1, 40);
      if (p) {
        o = { c16: p.c16, r16: p.r16, cx: p.c16 * 16 + 8, cy: p.r16 * 16 + 8, life: L.life, alive: true, burst: 0, born: g.t, id: s.spawned };
        s.list.push(o); s.spawned++;
        drawBlock(p.c16, p.r16, 1, 'CH_', 1 + (s.spawned & 1));
      }
      s.wait = 18;
    }
    var hit = null;
    if (fire) {
      for (i = 0; i < s.list.length; i++) { o = s.list[i]; if (o.alive && d2(g.ax, g.ay, o.cx, o.cy) <= 64) { hit = o; break; } }
      if (hit) {
        var pts = 50 + ((50 * hit.life / L.life) | 0);
        s.lvScore += pts; g.run.score += pts; s.hits++;
        hit.alive = false; hit.burst = 12;
        drawBlock(hit.c16, hit.r16, 1, 'BU_', 3);
        AU.sfx('gallery_hit'); say('HIT +' + pts, 30);
      } else {
        s.lvScore = Math.max(0, s.lvScore - 10); g.run.score = Math.max(0, g.run.score - 10);
        AU.sfx('gallery_miss'); say('MISS -10', 30);
      }
      g.marker = { x: g.ax, y: g.ay, t: 20 };
    }
    for (i = s.list.length - 1; i >= 0; i--) {
      o = s.list[i];
      if (o.alive) {
        if (--o.life <= 0) { o.alive = false; s.miss++; eraseBlock(o.c16, o.r16, 1); s.list.splice(i, 1); AU.sfx('gallery_miss'); say('FADED', 30); }
      } else if (o.burst > 0 && --o.burst === 0) { eraseBlock(o.c16, o.r16, 1); s.list.splice(i, 1); }
    }
    s.time = L.n - s.hits - s.miss;
    if (s.spawned >= L.n && !s.list.length) endLevel();
  }
  function tickTRK() {
    var s = g.sub, L = LV.TRK[g.run.lv];
    if (!s.wp || d2(s.px >> 8, s.py >> 8, s.wp.x, s.wp.y) < 36) s.wp = { x: 24 + rnd() % 208, y: 48 + rnd() % 148 };
    var v = L.v;
    if (L.dash) {
      if (g.t % 100 === 60) { s.dashT = 18; s.wp = { x: 24 + rnd() % 208, y: 48 + rnd() % 148 }; }
      if (s.dashT > 0) { s.dashT--; v = v * 2; }
    }
    var dx = s.wp.x * 256 - s.px, dy = s.wp.y * 256 - s.py, dist = isqrt(((dx >> 4) * (dx >> 4)) + ((dy >> 4) * (dy >> 4))) << 4;
    if (dist > 0) { s.vx = (dx * v / dist) | 0; s.vy = (dy * v / dist) | 0; s.px += s.vx; s.py += s.vy; }
    s.px = clamp(s.px, 16 * 256, 239 * 256); s.py = clamp(s.py, 44 * 256, 200 * 256);
    s.locked = d2(g.ax, g.ay, s.px >> 8, s.py >> 8) <= 100;
    if (s.locked) { s.lock++; s.lvScore++; g.run.score++; if ((s.lock & 7) === 0) AU.sfx('gallery_lock'); }
    if (--s.time <= 0) endLevel();
  }
  function startRound() {
    var s = g.sub, k = modeKey(), L = LV[k][g.run.lv];
    s.rwait = 0;
    if (k === 'ORD') {
      s.discs = []; s.next = 1; s.time = L.time; s.timeMax = L.time;
      for (var n = 1; n <= L.n; n++) {
        var p = freeSpot(1, 0);
        if (!p) break;
        var o = { c16: p.c16, r16: p.r16, cx: p.c16 * 16 + 8, cy: p.r16 * 16 + 8, num: n, alive: true, burst: 0 };
        s.discs.push(o); drawBlock(p.c16, p.r16, 1, 'N' + n + '_', 1 + (n & 1));
      }
      s.born = g.t;
    } else {           // EYE
      s.orbs = []; s.phase = 'show'; s.pt = EYE_SHOW; s.time = EYE_SHOW; s.timeMax = EYE_SHOW; s.pick = -1;
      var gap = (200 / L.n) | 0;
      for (var i = 0; i < L.n; i++) s.orbs.push({ x: (28 + i * gap + (gap >> 1)) * 256, y: 116 * 256, vx: 0, vy: 0 });
      s.target = rnd() % L.n;
      s.reveal = 0;
    }
  }
  function endRound(ok, bonus) {
    var s = g.sub;
    if (ok) { s.clear = (s.clear || 0) + (modeKey() === 'ORD' ? 1 : 0); }
    s.lvScore += bonus; g.run.score += bonus;
    s.round++; s.rwait = 45;
  }
  function tickORD(fire) {
    var s = g.sub, i, o;
    if (s.rwait > 0) {
      for (i = 0; i < s.discs.length; i++) { o = s.discs[i]; if (o.burst > 0 && --o.burst === 0) eraseBlock(o.c16, o.r16, 1); }
      if (--s.rwait === 0) { for (i = 0; i < s.discs.length; i++) if (s.discs[i].alive) eraseBlock(s.discs[i].c16, s.discs[i].r16, 1); if (s.round >= ROUNDS) endLevel(); else startRound(); }
      return;
    }
    if (fire) {
      var hit = null;
      for (i = 0; i < s.discs.length; i++) { o = s.discs[i]; if (o.alive && d2(g.ax, g.ay, o.cx, o.cy) <= 64) { hit = o; break; } }
      g.marker = { x: g.ax, y: g.ay, t: 20 };
      if (hit && hit.num === s.next) {
        hit.alive = false; hit.burst = 10; drawBlock(hit.c16, hit.r16, 1, 'BU_', 3);
        s.lvScore += 50; g.run.score += 50; s.next++;
        AU.sfx('gallery_hit');
        if (s.next > s.discs.length) { var b = s.time >> 2; say('ROUND CLEAR +' + b, 45); AU.sfx('gallery_ok'); endRound(true, b); return; }
      } else if (hit) { s.time = Math.max(1, s.time - 60); AU.sfx('gallery_wrong'); say('WRONG! NEXT IS ' + s.next, 45); }
      else AU.sfx('gallery_shot');
    }
    for (i = 0; i < s.discs.length; i++) { o = s.discs[i]; if (o.burst > 0 && --o.burst === 0) eraseBlock(o.c16, o.r16, 1); }
    if (--s.time <= 0) { AU.sfx('gallery_miss'); say('ROUND TIME UP', 45); endRound(false, 0); }
  }
  function spawnSpark() {
    var s = g.sub, best = null, bd = -1;
    for (var k = 0; k < 6; k++) {
      var x = 24 + rnd() % 208, y = 48 + rnd() % 148, d = d2(x, y, g.ax, g.ay);
      if (d > bd) { bd = d; best = { x: x, y: y }; }
    }
    s.sx = best.x * 256; s.sy = best.y * 256; s.rest = 0; s.restIn = 100; s.hist = []; s.wp = null; s.flash = 0;
  }
  function tickCHS(fire) {
    var s = g.sub, L = LV.CHS[g.run.lv];
    if (s.rest > 0) s.rest--;
    else if (--s.restIn <= 0) { s.rest = L.rest; s.restIn = 100 + rnd() % 40; }
    else {
      var x = s.sx >> 8, y = s.sy >> 8, dx, dy, v = L.v, dd = d2(x, y, g.ax, g.ay);
      if (dd < 56 * 56) { dx = x - g.ax; dy = y - g.ay; if (!dx && !dy) dx = 1; }
      else { if (!s.wp || d2(x, y, s.wp.x, s.wp.y) < 36) s.wp = { x: 24 + rnd() % 208, y: 48 + rnd() % 148 }; dx = s.wp.x - x; dy = s.wp.y - y; v = v >> 1; }
      var dist = isqrt(dx * dx + dy * dy) || 1;
      s.sx += (dx * v / dist) | 0; s.sy += (dy * v / dist) | 0;
      s.sx = clamp(s.sx, 16 * 256, 239 * 256); s.sy = clamp(s.sy, 44 * 256, 200 * 256);
    }
    s.hist.unshift({ x: s.sx >> 8, y: s.sy >> 8 }); if (s.hist.length > 9) s.hist.pop();
    if (fire) {
      g.marker = null;
      if (d2(g.ax, g.ay, s.sx >> 8, s.sy >> 8) <= 49) {
        var pts = 100 + Math.min(100, (s.time / 12) | 0);
        s.got++; s.lvScore += pts; g.run.score += pts;
        AU.sfx('gallery_bull'); say('CAUGHT! +' + pts, 45);
        if (s.got >= L.need) { endLevel(); return; }
        spawnSpark();
      } else AU.sfx('gallery_shot');
    }
    if (--s.time <= 0) endLevel();
  }
  function tickEYE(fire) {
    var s = g.sub, L = LV.EYE[g.run.lv], i, o;
    if (s.rwait > 0) { if (--s.rwait === 0) { if (s.round >= ROUNDS) endLevel(); else startRound(); } return; }
    if (s.reveal > 0) s.reveal--;
    s.pt--; s.time = s.pt;
    if (s.phase === 'show') {
      if (s.pt <= 0) { s.phase = 'move'; s.pt = L.mv; s.timeMax = L.mv; s.time = L.mv; dirs(L); }
      return;
    }
    if (s.phase === 'move') {
      if (s.pt % 36 === 0) dirs(L);
      for (i = 0; i < s.orbs.length; i++) {
        o = s.orbs[i]; o.x += o.vx; o.y += o.vy;
        if (o.x < 20 * 256 || o.x > 232 * 256) { o.vx = -o.vx; o.x = clamp(o.x, 20 * 256, 232 * 256); }
        if (o.y < 48 * 256 || o.y > 196 * 256) { o.vy = -o.vy; o.y = clamp(o.y, 48 * 256, 196 * 256); }
      }
      if (s.pt <= 0) { s.phase = 'pick'; s.pt = EYE_PICK; s.timeMax = EYE_PICK; s.time = EYE_PICK; say('WHICH ONE? SHOOT IT', 60); }
      return;
    }
    if (fire) {
      var hit = -1;
      for (i = 0; i < s.orbs.length; i++) { o = s.orbs[i]; if (d2(g.ax, g.ay, (o.x >> 8) + 4, (o.y >> 8) + 4) <= 30) { hit = i; break; } }
      if (hit < 0) { AU.sfx('gallery_shot'); return; }
      s.pick = hit;
      if (hit === s.target) { var b = 100 + (s.pt >> 2); s.correct++; AU.sfx('gallery_bull'); say('CORRECT! +' + b, 45); endRound(true, b); }
      else { AU.sfx('gallery_wrong'); say('WRONG ORB', 45); endRound(false, 0); }
      s.reveal = 45;
      return;
    }
    if (s.pt <= 0) { s.pick = -2; s.reveal = 45; AU.sfx('gallery_miss'); say('TIME UP', 45); endRound(false, 0); }
  }
  function dirs(L) {
    var s = g.sub;
    for (var i = 0; i < s.orbs.length; i++) {
      var a = rnd() & 255, o = s.orbs[i];
      o.vx = (SIN[(a + 64) & 255] * L.v) >> 8; o.vy = (SIN[a] * L.v) >> 8;
    }
  }
  var SIN = (function () { var a = []; for (var i = 0; i < 256; i++) a.push(Math.round(Math.sin(i * Math.PI / 128) * 256)); return a; })();

  /* ---------------- HUD ---------------- */
  function infoText() {
    var k = modeKey(), s = g.sub, L = LV[k][g.run.lv];
    if (g.mode === 'intro') return 'READY';
    if (k === 'PRE') return 'SHOT ' + Math.min(PRE_SHOTS, s.shot + (s.tg ? 1 : 0)) + '/' + PRE_SHOTS;
    if (k === 'SPD') return 'HIT ' + pad(s.hits, 2) + '/' + pad(L.n, 2);
    if (k === 'TRK') return 'LOCK ' + pad(Math.floor(s.lock * 100 / TRK_TIME), 2) + '%';
    if (k === 'ORD') return 'RND ' + Math.min(ROUNDS, s.round + 1) + '/' + ROUNDS;
    if (k === 'CHS') return 'GOT ' + s.got + '/' + L.need;
    return 'RND ' + Math.min(ROUNDS, s.round + 1) + '/' + ROUNDS;
  }
  function drawHud(all) {
    var R = g.run;
    if (!R) return;
    text(1, HUD1, padR(MODES[R.m].name, 10) + 'LV' + (R.lv + 1) + '  SC ' + pad(R.score, 6) + '  ' + (R.cheated ? '$' : ' '));
    var s = g.sub, frac = s && s.timeMax ? clamp(Math.floor((s.time || 0) * 96 / s.timeMax), 0, 96) : 0;
    if (g.mode === 'intro') frac = 96;
    text(1, HUD2, 'TIME');
    for (var i = 0; i < 12; i++) put(6 + i, HUD2, art.t('BAR' + clamp(frac - i * 8, 0, 8)));
    text(19, HUD2, padR(g.mode === 'play' || g.mode === 'intro' ? infoText() : '', 12));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = '  ' + g.msg;
    else if (g.mode === 'intro') line = '  PRESS A TO GO';
    else if (g.mode === 'play' && modeKey() === 'EYE' && s.phase === 'show') line = '  WATCH THE LIT ORB!';
    else line = '  B FINE AIM   A FIRE';
    text(1, MSG_ROW, padR(line, 30));
    void all;
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, s = g.sub, i;
    function spr(x, y, tile, pal) {
      if (y > 231 || y < -7 || x < -7 || x > 255) return;
      ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal });
    }
    function ret(x, y, pal) { for (var q = 0; q < 4; q++) spr(x - 7 + (q & 1) * 8, y - 7 + (q >> 1) * 8, art.s('RET_' + q), pal); }
    if (g.mode === 'title') ret(36, titleRow(g.sel) * 8 + 3, 0);
    if ((g.mode === 'play' || g.mode === 'intro') && s) {
      var k = modeKey();
      if (g.mode === 'play' && k === 'TRK') {
        var fr = (g.t >> 3) & 1, px = (s.px >> 8) - 7, py = (s.py >> 8) - 7;
        for (var q = 0; q < 4; q++) spr(px + (q & 1) * 8, py + (q >> 1) * 8, art.s('PROBE' + fr + '_' + q), s.locked ? 2 : 1);
      }
      if (g.mode === 'play' && k === 'CHS') {
        var resting = s.rest > 0, h = s.hist;
        if (!resting || (g.t & 4)) spr((s.sx >> 8) - 3, (s.sy >> 8) - 3, art.s('SPARK'), resting ? 2 : 3);
        if (!resting && h.length > 4) spr(h[4].x - 3, h[4].y - 3, art.s('TRAIL1'), 3);
        if (!resting && h.length > 8) spr(h[8].x - 3, h[8].y - 3, art.s('TRAIL2'), 3);
      }
      if (g.mode === 'play' && k === 'EYE' && s.orbs && s.rwait >= 0) {
        for (i = 0; i < s.orbs.length; i++) {
          var o = s.orbs[i], lit = (s.phase === 'show' && i === s.target && (g.t & 8)) || (s.reveal > 0 && i === s.target && (g.t & 4)) || (s.cheatShow > 0 && i === s.target && (g.t & 8));
          spr(o.x >> 8, o.y >> 8, art.s('ORB'), lit ? 2 : (s.pick === i ? 3 : 1));
        }
      }
      if (g.marker && g.marker.t > 0) spr(g.marker.x - 3, g.marker.y - 3, art.s('MARK'), 3);
      if (g.mode === 'play') ret(g.ax, g.ay, 0);
    }
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
  }

  /* ---------------- 主迴圈 ---------------- */
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (g.marker && g.marker.t > 0) g.marker.t--;
    if (g.mode === 'intro') {
      if (g.t > 100 || (g.t > 10 && I.pressed(BTN.A))) beginPlay();
      return;
    }
    if (g.mode === 'lvlend') { if (g.t > 100) afterLevel(); return; }
    moveCursor();
    var fire = I.pressed(BTN.A), k = modeKey();
    if (g.sub.cheatShow > 0) g.sub.cheatShow--;
    if (k === 'PRE') tickPRE(fire);
    else if (k === 'SPD') tickSPD(fire);
    else if (k === 'TRK') tickTRK();
    else if (k === 'ORD') tickORD(fire);
    else if (k === 'CHS') tickCHS(fire);
    else tickEYE(fire);
  }
  function doCheat() {
    var m = g.mode, s = g.sub;
    if (m === 'over' || (m === 'lvlend' && s && !s.ok)) {
      g.run.cheated = true; g.run.continues++;
      startLevel();
      AU.play('gallery_range');
      say('RETRY LEVEL ' + (g.run.lv + 1), 60);
      return;
    }
    if (m === 'play' || m === 'intro' || m === 'lvlend') {
      g.run.cheated = true;
      if (s) {
        if (s.timeMax && modeKey() !== 'SPD') s.time = s.timeMax;
        if (modeKey() === 'SPD' && s.list) s.list.forEach(function (o) { if (o.alive) o.life = LV.SPD[g.run.lv].life; });
        if (modeKey() === 'EYE') { if (s.phase === 'pick') s.pt = EYE_PICK; s.cheatShow = 90; }
        if (modeKey() === 'CHS') s.rest = 90;
      }
      g.noSway = true;
      say('STAR SIGHT! TIME FULL', 60);
      AU.sfx('gallery_ok');
    }
  }

  /* ---------------- 機器人（合理節奏：反應延遲 12 幀、射擊間隔 ≥ 6 幀、只按一幀） ---------------- */
  function steer(tx, ty, tol) {
    var dx = tx - g.ax, dy = ty - g.ay, m = 0;
    if (dx > tol) m |= BTN.RIGHT; else if (dx < -tol) m |= BTN.LEFT;
    if (dy > tol) m |= BTN.DOWN; else if (dy < -tol) m |= BTN.UP;
    var far = Math.max(Math.abs(dx), Math.abs(dy));
    // 靠近（≤ 5 px）或高速中快到（≤ 9 px）⇒ 按住 B 精細移動，避免 3 px 衝過頭
    if (m && (far <= 5 || (far <= 9 && (g.hx > 8 || g.hy > 8)))) m |= BTN.B;
    return m;
  }
  function fireOk() { var B = g.bot; return !B.prevA && B.t - B.lastShot >= 6; }
  function botMask() {
    var B = g.bot, m = 0, s = g.sub;
    B.t++;
    var r = botInner();
    m = r || 0;
    if (m & BTN.A) { if (!fireOk()) m &= ~BTN.A; else B.lastShot = B.t; }
    B.prevA = !!(m & BTN.A);
    return m;
    function botInner() {
      if (g.mode === 'title') {
        var want = !g.goals.PRE ? 0 : 1;
        if (g.sel !== want) return (B.t % 10 === 0) ? BTN.DOWN : 0;
        return (B.t % 40 === 20) ? BTN.START : 0;
      }
      if (g.mode === 'over' || g.mode === 'result') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
      if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
      if (g.mode !== 'play') return 0;
      var k = modeKey(), i, o, best, bd;
      if (k === 'PRE') {
        if (!s.tg || g.t - s.tg.born < 12) return 0;
        var w = s.tg.size === 32 ? 2 : 1, jx = ((s.shot * 5 + g.run.lv * 3) % (w * 2 + 1)) - w, jy = ((s.shot * 3 + g.run.lv) % (w * 2 + 1)) - w;
        var tx = s.tg.cx + jx, ty = s.tg.cy + jy, ex = Math.abs(g.ax - tx), ey = Math.abs(g.ay - ty);
        var tol = s.time < 50 ? 2 : 0;
        if (ex <= tol && ey <= tol) return BTN.A;
        return steer(tx, ty, 0);
      }
      if (k === 'SPD') {
        best = null; bd = 1e9;
        for (i = 0; i < s.list.length; i++) {
          o = s.list[i];
          if (!o.alive || g.t - o.born < 12) continue;
          var dd = d2(g.ax, g.ay, o.cx, o.cy) - o.life * 4;
          if (dd < bd) { bd = dd; best = o; }
        }
        if (!best) return 0;
        if (d2(g.ax, g.ay, best.cx, best.cy) <= 9) return BTN.A;
        return steer(best.cx, best.cy, 1);
      }
      if (k === 'TRK') return steer((s.px >> 8) + ((s.vx || 0) * 4 >> 8), (s.py >> 8) + ((s.vy || 0) * 4 >> 8), 1);
      if (k === 'ORD') {
        if (s.rwait > 0 || g.t - s.born < 12) return 0;
        for (i = 0; i < s.discs.length; i++) if (s.discs[i].alive && s.discs[i].num === s.next) {
          o = s.discs[i];
          if (d2(g.ax, g.ay, o.cx, o.cy) <= 9) return BTN.A;
          return steer(o.cx, o.cy, 1);
        }
        return 0;
      }
      if (k === 'CHS') {
        var sx = s.sx >> 8, sy = s.sy >> 8;
        if (d2(g.ax, g.ay, sx, sy) <= 16) return BTN.A;
        return steer(sx, sy, 1);
      }
      if (k === 'EYE') {
        if (s.rwait > 0 || !s.orbs) return 0;
        o = s.orbs[s.target];
        var ox = (o.x >> 8) + 4, oy = (o.y >> 8) + 4;
        if (s.phase === 'pick' && EYE_PICK - s.pt > 12 && d2(g.ax, g.ay, ox, oy) <= 4) return BTN.A;
        return steer(ox, oy, 1);
      }
      return 0;
    }
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'gallery', order: 7, title: '星塵射擊場', legacy: ['precision-aim.html', 'speed-target-shooter.html', 'target-tracking.html',
      'hand-eye-coordination.html', 'multi-target-coordination.html', 'circle-clicker.html', 'cursor-chase.html', 'visual-tracking-challenge.html'],
    init: function (nes) {
      nes0 = nes;
      art = GA.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'gallery_bg');
      NES.CHR.setPattern(1, 'gallery_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(PAL.bd);
      for (i = 0; i < 4; i++) { ppu.setBgPalette(i, PAL.bg[i]); ppu.setSprPalette(i, PAL.spr[i]); }
      GAME.backTile = { tile: art.s('SPARK'), pal: 3 };
      AU.init(nes);
      g = newState();
      enterTitle();
      var qm = CT.query ? parseInt(CT.query('gmode') || '', 10) : NaN;
      if (qm >= 1 && qm <= MODES.length) { g.sel = qm - 1; startMode(qm - 1, clamp((parseInt(CT.query('lv') || '1', 10) || 1) - 1, 0, 4)); }
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        var d = (I.pressed(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START))) ? 1 : (I.pressed(BTN.UP) ? -1 : 0);
        if (d) {
          selAttr(g.sel, 0);
          g.sel = (g.sel + d + MODES.length) % MODES.length;
          selAttr(g.sel, 3);
          AU.sfx('gallery_move');
        }
        if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) { AU.sfx('gallery_ok'); startMode(g.sel, 0); }
      } else if (g.mode === 'over' || g.mode === 'result') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) text(11, 27, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.run && g.mode !== 'over' && g.mode !== 'result') drawHud(false);
      flush();
      drawSprites();
    },
    state: function () {
      var s = g.sub || {};
      return {
        mode: g.mode, sel: g.sel, paused: g.paused, cx: g.cx, cy: g.cy, ax: g.ax, ay: g.ay, hx: g.hx, hy: g.hy,
        run: g.run ? { m: g.run.m, key: MODES[g.run.m].key, lv: g.run.lv, score: g.run.score, cheated: g.run.cheated, grade: g.run.grade, pct: g.run.pct, lvScores: g.run.lvScores.slice(), continues: g.run.continues } : null,
        lvScore: s.lvScore || 0, time: s.time || 0, shot: s.shot, hits: s.hits, lock: s.lock, clear: s.clear, got: s.got, correct: s.correct, round: s.round, phase: s.phase,
        goals: { PRE: g.goals.PRE, SPD: g.goals.SPD }, goal: !!(g.goals.PRE && g.goals.SPD), queue: g.q.length + g.qa.length, peakQ: g.peakQ, sprUsed: g.sprUsed
      };
    },
    exit: function () { saveBest(); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || g.mode === 'result') return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goals.PRE && g.goals.SPD); },
    bestText: function () { return pad(Math.min(999999, CT.load('gallery', 'best', 0) | 0), 6); }
  };
  GA.MODES = MODES;
  GA.LV = LV;
  GA.GRADES = GRADES;
  GA.GRADE_PCT = GRADE_PCT;
  GA.dev = {
    g: function () { return g; }, bgTile: bgTile, runMax: runMax, levelMax: levelMax, tri: tri,
    start: function (m, lv) { startMode(m, lv || 0); }, begin: function () { beginPlay(); }, endLevel: function () { endLevel(); },
    title: function () { enterTitle(); }, result: function () { enterResult(); }, over: function () { enterOver(); }
  };
  if (CT.register) CT.register(GAME);
})();
