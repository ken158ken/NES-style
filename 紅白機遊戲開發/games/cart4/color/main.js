/*
 * games/cart4/color/main.js — 《星塵色感 HUE SENSE》（合輯卡帶四 槽 8，id = color）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-0 cart4-shell+color（R8）｜ 依賴：color/art.js、color/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：color-match（調色配對）+ color-rush（快速判斷顏色）⇒ 3 模式。
 *
 * 色鍵（固定對應，說明頁與遊玩畫面都畫成手把對照圖；每色另有形狀 ⇒ 色弱可靠形狀分）：
 *   ↑ 紅● $16 / → 藍■ $12 / ↓ 綠▲ $2A / ← 黃★ $28 / B 粉◆ $24 / A 白✚ $30
 * 三個模式（標題 ↑↓ 選、A / START 開始；SHAPE ASSIST 列 ←→ 切換；B = 說明頁）：
 *   1 INK OR WORD 色字干擾：畫面中央大字寫著色名（RED…），字本身用另一種墨色。按「墨色」對應的鍵。
 *       5 級 × 8 題 = 40 題：LV1 4 色 180 幀 / LV2 4 色 150 幀 / LV3 6 色（加 B / A）150 幀 / LV4 6 色 120 幀 + 字位置跳動 /
 *       LV5 6 色 120 幀 + 規則切換（INK = 按墨色、WORD = 按字義）。命 5 顆（答錯 / 逾時 -1）。
 *       得分 = 50 + 速度分 ⌊50 × 剩餘幀 / 限時⌋ + 連對 min(combo,10) × 5；評價 S ≥ 5000 / A ≥ 4000 / B ≥ 3000。
 *       字是先「藏起來」寫進名稱表（第 3 組 BG 調色盤全黑），寫完那一幀才換上墨色並開始計時 ⇒ 反應時間從看得到那幀起算。
 *   2 COLOR RUSH 色塊衝刺：60.0 秒（3606 幀）內連答兩題型——SAME?（A 相同 / B 不同）與 BRIGHTER?（← / → 哪邊比較亮，
 *       亮度 = NES 色碼的列 $0x~$3x）。答錯扣 3 秒（180 幀）。每答對 6 題難度 +1（色相差從 4 格縮到 1 格、亮度差 2 → 1 列）。
 *   3 HUE MIXER 調色：10 回合，用 ←→ 轉色相（12 格循環）、↑↓ 調亮度（4 列），A 決定，去配左邊的目標色。
 *       每回合 600 幀；第 6 回合起是「記憶回合」：目標只亮 120 幀就蓋住，B = 再看一次（60 幀，扣 150 分，每回合 1 次）。
 *       得分 = max(0, 1000 − 250 × 色相差 − 300 × 亮度差) + 時間分（≤ 100）。
 *   SHAPE ASSIST（色弱輔助，預設 OFF）：色字題目兩側顯示墨色的形狀標記；色塊衝刺在色塊下顯示色碼；調色顯示目標色相編號。
 * 時間一律以幀計（60.0988 Hz），反應時間顯示換算成 ms（幀 × 1000 / 60.0988）。
 * 密技（C / ★）：遊玩中 = 立刻補強（色字 +2 命且本題計時重來 / 衝刺 +10 秒 / 調色 公開本回合目標色碼 + 計時重來）；
 *   色字 GAME OVER = 原地續關（同一題、命補滿、分數保留）；標題 / 說明 / 結算無效；用過密技那局不存紀錄、goal false。
 * goal = INK OR WORD 一局結束（40 題或 GAME OVER）時分數 ≥ GOAL_SCORE（3000），未用密技。
 * 機器人：預設反應延遲 18 幀（`&lag=N` 可調），從「畫面上的」BG 調色盤讀墨色 / 色塊顏色，題目字與規則讀畫面上顯示的那一份。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CO = CT.Color = CT.Color || {};
  var AU = CO.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var HZ = 60.0988;
  var COLORS = [
    { name: 'RED', c: 0x16, key: BTN.UP, btn: 'UP', sw: [8, 12], pal: 1 },
    { name: 'BLUE', c: 0x12, key: BTN.RIGHT, btn: 'RIGHT', sw: [12, 16], pal: 1 },
    { name: 'GREEN', c: 0x2A, key: BTN.DOWN, btn: 'DOWN', sw: [8, 20], pal: 1 },
    { name: 'YELLOW', c: 0x28, key: BTN.LEFT, btn: 'LEFT', sw: [4, 16], pal: 2 },
    { name: 'PINK', c: 0x24, key: BTN.B, btn: 'B', sw: [20, 16], pal: 2 },
    { name: 'WHITE', c: 0x30, key: BTN.A, btn: 'A', sw: [26, 16], pal: 2 }
  ];
  var MODES = [
    { key: 'ink', name: 'INK OR WORD', sub: 'PRESS THE INK, NOT THE WORD' },
    { key: 'rush', name: 'COLOR RUSH', sub: 'SAME? BRIGHTER? 60 SECONDS' },
    { key: 'mix', name: 'HUE MIXER', sub: 'DIAL IN THE TARGET COLOR' }
  ];
  // 色字干擾 5 級：[色數, 限時幀, 一致題比例 /256, 字跳動, 規則切換]
  var INK_LV = [[4, 180, 77, false, false], [4, 150, 64, false, false], [6, 150, 51, false, false], [6, 120, 51, true, false], [6, 120, 51, true, true]];
  var INK_PER_LV = 8, INK_LIVES = 5, GOAL_SCORE = 3000;
  var RUSH_TIME = 3606, RUSH_PENALTY = 180, RUSH_BONUS_CHEAT = 600;
  var MIX_ROUNDS = 10, MIX_TIME = 600, MIX_SHOW = 120, MIX_PEEK = 60, MIX_PEEK_COST = 150, MIX_MEM_FROM = 5;
  var RATE = { ink: [5000, 4000, 3000], rush: [15000, 10000, 6000], mix: [9500, 8000, 6000] };
  var REP_DELAY = 12, REP_EVERY = 6, FLUSH_LIMIT = 140, MSG_ROW = 27, WORD_ROW = 7, BAR_ROW = 10, BAR_COL = 8;
  var HIDE = [0x0F, 0x0F, 0x0F];
  var PAL = {
    bd: 0x0F,
    bg: [[0x15, 0x10, 0x30],                 // HUD / 外框（玫瑰紅框 / 灰 / 白）
         [0x16, 0x12, 0x2A],                 // 紅 / 藍 / 綠
         [0x28, 0x24, 0x30],                 // 黃 / 粉 / 白
         [0x04, 0x24, 0x34]],                // 標題大字（粉紅）；遊玩中 = 題目墨色 / 色塊
    spr: [[0x15, 0x27, 0x30],                // 游標 / 箭頭
          [0x30, 0x00, 0x30],                // 形狀標記（色 3 = 墨色，遊玩中改寫）
          [0x28, 0x38, 0x30],                // 閃光
          [0x15, 0x25, 0x30]]                // backTile
  };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, assist: !!CT.load('color', 'assist', 0), paused: false, cheatReq: false, run: null,
      msg: '', msgT: 0, sprUsed: 0, back: 'title',
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      seed: 1, runs: 0, overT: 0, goalRun: null, hold: {}, bot: { t: 0, seen: -1, at: 0, hold: 0, mask: 0, mem: -1, memRound: -1 }
    };
  }
  function seedBase() { var s = CT.query ? parseInt(CT.query('seed') || '', 10) : NaN; return isNaN(s) ? 0x1C0B : (s & 0x7fffffff); }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ms(f) { return Math.round(f * 1000 / HZ); }
  function secText(f) { var d = Math.max(0, Math.floor(f * 10 / HZ)); return pad(Math.floor(d / 10), 2) + '.' + (d % 10); }
  function hueOf(c) { return c & 15; }
  function rowOf(c) { return c >> 4; }
  function hueDist(a, b) { var d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); }
  function mkColor(h, r) { return (r << 4) | (((h - 1) % 12 + 12) % 12 + 1); }
  function rating(kind, s) { var t = RATE[kind]; return s >= t[0] ? 'S' : (s >= t[1] ? 'A' : (s >= t[2] ? 'B' : 'C')); }
  function colorIndex(c) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].c === c) return i; return -1; }

  /* ---------------- 名稱表影子 + 差異佇列 ---------------- */
  function bgTile(c, r) {
    if (r < 4 || r > 25) return 0;
    if (c > 2 && c < 29) return 0;
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x3c19) >>> 0;
    if (h % 11 === 3) return art.t('ST1');
    if (h % 13 === 7) return art.t('ST2');
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
  function queueEmpty() { return g.q.length === 0 && g.qa.length === 0; }
  function redraw(fn) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      for (var k = 0; k < 960; k++) g.want[k] = 0;
      for (k = 0; k < 240; k++) g.wantA[k] = 0;
      g.q = []; g.qa = [];
      for (var i = 0; i < 4; i++) ppu.setBgPalette(i, PAL.bg[i]);
      fn();
      for (k = 0; k < 960; k++) ppu.setTile(0, k & 31, k >> 5, g.want[k]);
      for (k = 0; k < 240; k++) ppu.setAttr(0, k & 15, k >> 4, g.wantA[k]);
      g.have.set(g.want); g.haveA.set(g.wantA); g.q = []; g.qa = [];
      ppu.clearSprites(); g.sprUsed = 0;
    });
  }
  function frame() {
    // fix-r8-shell（qa-r8 P3-2）：HUD 改第 2~3 列（不貼 y = 0）⇒ 框頂下移到第 4 列、框內從第 5 列起
    for (var c = 0; c < 32; c++) { put(c, 4, art.t('BH')); put(c, 26, art.t('BHB')); }
    for (var r = 5; r <= 25; r++) { put(0, r, art.t('BV')); put(31, r, art.t('BVR')); }
    for (r = 5; r <= 25; r++) for (c = 1; c < 31; c++) put(c, r, bgTile(c, r));
  }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i), x = col + i * 2;
      if (ch === ' ') { put(x, row, 0); put(x + 1, row, 0); put(x, row + 1, 0); put(x + 1, row + 1, 0); continue; }
      put(x, row, art.t('BIG_' + ch + '0')); put(x + 1, row, art.t('BIG_' + ch + '1'));
      put(x, row + 1, art.t('BIG_' + ch + '2')); put(x + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }
  function quad(col, row, prefix) {
    put(col, row, art.t(prefix + '0')); put(col + 1, row, art.t(prefix + '1'));
    put(col, row + 1, art.t(prefix + '2')); put(col + 1, row + 1, art.t(prefix + '3'));
  }
  function setPal(i, cols) { nes0.ppu.setBgPalette(i, cols); }

  /* ---------------- 色鍵對照圖（手把配置：十字鍵 4 色 + B / A 2 色） ---------------- */
  function legend(n) {
    for (var i = 0; i < COLORS.length; i++) {
      var C = COLORS[i], c0 = C.sw[0], r0 = C.sw[1], on = i < n;
      var lab = on ? C.name : '--';
      if (on) quad(c0, r0, 'SH_' + i + '_');
      else { put(c0, r0, 0); put(c0 + 1, r0, 0); put(c0, r0 + 1, 0); put(c0 + 1, r0 + 1, 0); }   // 4 色關：B / A 未啟用（只留 -- 標籤）
      putA(c0 >> 1, r0 >> 1, on ? C.pal : 0);
      clearRow(r0 + 2, c0 - 2, c0 + 3);
      text(c0 + 1 - (lab.length >> 1), r0 + 2, lab);
    }
    text(20, 14, ' B'); text(26, 14, ' A');
    text(3, 12, 'DPAD');
  }

  /* ---------------- 游標連發 ---------------- */
  function rep(btn) {
    var I = NES.Input;
    if (!I.held(btn)) { g.hold[btn] = 0; return false; }
    var h = (g.hold[btn] = (g.hold[btn] || 0) + 1);
    return h === 1 || (h > REP_DELAY && (h - REP_DELAY - 1) % REP_EVERY === 0);
  }
  function startPressed() { var I = NES.Input; return I.pressed(BTN.START) && !I.held(BTN.SELECT); }

  /* ---------------- 紀錄 ---------------- */
  function load(k) { return CT.load('color', k, 0) | 0; }
  function save(k, v) { CT.save('color', k, v); }
  function bestLine(m) {
    var b = load(MODES[m].key);
    return b ? 'BEST ' + pad(b, 6) + '  ' + rating(MODES[m].key, b) : 'NO RECORD YET';
  }
  function saveBest(R) {
    if (!R || R.cheated || R.saved) return false;
    R.saved = true;
    if (R.score > load(R.kind)) { save(R.kind, R.score); return true; }
    return false;
  }

  /* ================================================================ 標題 / 說明 */
  function titleRow(i) { return 8 + i * 2; }
  function titleLine(i) {
    if (i === 3) return 'SHAPE ASSIST ' + (g.assist ? ' ON' : 'OFF');
    return (i + 1) + ' ' + padR(MODES[i].name, 12);
  }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.paused = false;
    redraw(function () {
      // fix-r8-shell（qa-r8 P3-2）：拿掉第 1 列（y = 0）的頂框，大字標題從第 2 列（y = 8）起；底框保留
      for (var c = 0; c < 32; c++) put(c, 28, art.t('BH'));
      big(7, 2, 'HUE SENSE');
      for (c = 3; c < 13; c++) putA(c, 1, 3);
      // 標題兩側：四種色鍵形狀（紅● 藍■ | 黃★ 粉◆）
      [[2, 0], [4, 1], [26, 3], [28, 4]].forEach(function (e) { quad(e[0], 2, 'SH_' + e[1] + '_'); putA(e[0] >> 1, 1, COLORS[e[1]].pal); });
      center(5, 'STARDUST COLOR SENSE');
      for (var i = 0; i < 4; i++) text(6, titleRow(i), titleLine(i));
      titleInfo();
      text(3, 20, 'UP/DOWN SELECT  A/START PLAY');
      text(3, 22, 'B HOW TO PLAY  L/R ASSIST');
      text(3, 24, 'HOLD START+SELECT: MENU');
      text(3, 26, 'C/$ = CHEAT');
    });
    // 標題大字 / 形狀用固定色（第 3 組 = 粉紅）
    AU.play('color_title');
  }
  function titleInfo() {
    var s = g.sel < 3 ? MODES[g.sel].sub : (g.assist ? 'SHAPES SHOW THE INK COLOR' : 'COLOR ONLY (HARDER)');
    center(16, padR('', 28));
    center(16, s);
    center(18, padR('', 28));
    if (g.sel < 3) center(18, bestLine(g.sel));
  }
  function updateTitle() {
    g.t++;
    var I = NES.Input, d = rep(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START)) ? 1 : (rep(BTN.UP) ? -1 : 0);
    if (d) { g.sel = (g.sel + d + 4) % 4; AU.sfx('color_move'); titleInfo(); }
    if (g.sel === 3 && (I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT) || I.pressed(BTN.A))) {
      g.assist = !g.assist; save('assist', g.assist ? 1 : 0); text(6, titleRow(3), titleLine(3)); titleInfo(); AU.sfx('color_move');
      return;
    }
    if (I.pressed(BTN.B)) { enterHelp(); return; }
    if (g.sel < 3 && (startPressed() || I.pressed(BTN.A))) startGame(g.sel);
  }
  function enterHelp() {
    g.mode = 'help'; g.t = 0;
    redraw(function () {
      center(2, 'HOW TO PLAY');          // fix-r8-shell（qa-r8 P3-2）：從第 2 列起，不貼 y = 0
      text(2, 4, 'INK OR WORD: PRESS THE BUTTON');
      text(2, 6, 'OF THE INK COLOR, NOT THE WORD');
      text(2, 8, 'LV3+ ADDS PINK = B, WHITE = A.');
      text(2, 10, 'EVERY COLOR HAS ITS OWN SHAPE.');
      legend(6);
      text(1, 24, 'RUSH: A=SAME B=DIFF L/R=BRIGHT');
      text(1, 26, 'MIXER: L/R HUE U/D LIGHT A SET');
      text(1, 28, 'B PEEK (-150)   B/START = BACK');
    });
  }
  function updateHelp() {
    g.t++;
    var I = NES.Input;
    if (g.t > 10 && (I.pressed(BTN.B) || startPressed())) enterTitle();
  }

  /* ================================================================ 開局 */
  function startGame(m) {
    g.runs++;
    g.seed = (seedBase() * 7 + g.runs * 7919 + m * 101) & 0x7fffffff;
    for (var i = 0; i < 4; i++) rnd();
    g.paused = false; g.msg = ''; g.msgT = 0; g.t = 0; g.hold = {};
    var R = g.run = { kind: MODES[m].key, m: m, score: 0, combo: 0, maxCombo: 0, ok: 0, miss: 0, cheated: false, continues: 0, saved: false,
      phase: 'ready', pt: 0, qid: 0, rts: [], bestRt: 0, assistUsed: g.assist };
    g.mode = R.kind;
    if (R.kind === 'ink') { R.qi = 0; R.lives = INK_LIVES; R.lv = 0; R.cur = null; }
    else if (R.kind === 'rush') { R.time = RUSH_TIME; R.cur = null; }
    else { R.round = 0; R.cur = null; }
    layout();
    AU.play(R.kind === 'rush' ? 'color_rush' : 'color_play');
    AU.sfx('color_ok');
    return R;
  }
  function layout() {
    var R = g.run;
    redraw(function () {
      frame();
      if (R.kind === 'ink') { legend(INK_LV[R.lv][0]); for (var c = 1; c < 15; c++) { putA(c, 3, 3); putA(c, 4, 3); } drawBar(0, 1); }   // fix-r8-shell：大字改第 7~8 列（跨屬性列 3 / 4）；不含第 0 / 15 屬性欄 ⇒ 左右框不被染色
      else drawBlocks();
      hud();
    });
    if (R.kind === 'ink') setPal(3, HIDE);
    else { setPal(2, HIDE); setPal(3, HIDE); }
  }
  function say(s, t) { g.msg = s; g.msgT = t || 60; }

  /* ================================================================ 1 色字干擾 */
  function inkLevel(qi) { return Math.min(INK_LV.length - 1, Math.floor(qi / INK_PER_LV)); }
  function inkNewQ() {
    var R = g.run, L = INK_LV[R.lv], n = L[0];
    var word = rnd() % n, ink;
    if ((rnd() & 255) < L[2]) ink = word;
    else { ink = rnd() % (n - 1); if (ink >= word) ink++; }
    var rule = L[4] ? ((rnd() & 1) ? 'WORD' : 'INK') : 'INK';
    var name = COLORS[word].name, col = 16 - name.length;
    if (L[3]) col = clamp(col + (rnd() % 9) - 4, 2, 30 - name.length * 2);
    R.qid++;
    R.cur = { id: R.qid, word: word, ink: ink, rule: rule, col: col, len: name.length, t: 0, limit: L[1], ans: rule === 'INK' ? ink : word };
    setPal(3, HIDE);
    for (var c = 1; c <= 30; c++) { put(c, WORD_ROW, 0); put(c, WORD_ROW + 1, 0); }
    big(col, WORD_ROW, name);
    clearRow(5, 1, 30);
    center(5, rule === 'INK' ? 'PRESS THE INK COLOR' : 'PRESS WHAT THE WORD SAYS');
    R.phase = 'draw'; R.pt = 0;
  }
  function inkReveal() {
    var R = g.run, Q = R.cur, ink = COLORS[Q.ink].c;
    setPal(3, [0x00, ink, ink]);
    nes0.ppu.setSprPalette(1, [0x30, 0x00, ink]);
    R.phase = 'ask'; R.pt = 0; Q.t = 0;
  }
  function inkAnswer(i) {
    var R = g.run, Q = R.cur, rt = Q.t;
    if (i === Q.ans) {
      var pts = 50 + Math.floor(50 * Math.max(0, Q.limit - rt) / Q.limit) + Math.min(R.combo, 10) * 5;
      R.score += pts; R.combo++; R.ok++; if (R.combo > R.maxCombo) R.maxCombo = R.combo;
      R.rts.push(rt); if (!R.bestRt || rt < R.bestRt) R.bestRt = rt;
      Q.res = 'ok'; Q.pts = pts; Q.rt = rt;
      AU.sfx('color_ok'); say('OK! ' + ms(rt) + 'MS  +' + pts, 40);
      R.phase = 'fb'; R.pt = 0; R.fbLen = 30;
    } else inkMiss(i < 0 ? 'TIME UP!' : 'MISS!');
  }
  function inkMiss(why) {
    var R = g.run, Q = R.cur;
    R.lives--; R.combo = 0; R.miss++;
    Q.res = 'miss';
    AU.sfx('color_ng'); say(why + ' IT WAS ' + COLORS[Q.ans].name + ' (' + COLORS[Q.ans].btn + ')', 70);
    R.phase = 'fb'; R.pt = 0; R.fbLen = 60;
  }
  function inkNext() {
    var R = g.run;
    R.qi++;
    if (R.lives <= 0) { enterOver('OUT OF LIVES  SCORE ' + pad(R.score, 6)); return; }
    if (R.qi >= INK_LV.length * INK_PER_LV) { finish(); return; }
    var lv = inkLevel(R.qi);
    if (lv !== R.lv) {
      R.lv = lv; R.phase = 'intro'; R.pt = 0;
      setPal(3, HIDE);
      for (var c = 1; c <= 30; c++) { put(c, WORD_ROW, 0); put(c, WORD_ROW + 1, 0); }
      legend(INK_LV[lv][0]);
      clearRow(5, 1, 30);
      center(5, 'LEVEL ' + (lv + 1) + (lv === 2 ? '  B AND A JOIN IN!' : lv === 3 ? '  THE WORD MOVES!' : lv === 4 ? '  WATCH THE RULE!' : ''));
      AU.sfx('color_level');
      return;
    }
    inkNewQ();
  }
  function updateInk() {
    var R = g.run, I = NES.Input, i;
    R.pt++;
    if (R.phase === 'ready') {
      if (R.pt === 1) { clearRow(5, 1, 30); center(5, 'LEVEL ' + (R.lv + 1) + '  READY'); }
      if (R.pt % 40 === 1 && R.pt < 160) { clearRow(24, 1, 30); center(24, R.pt < 121 ? String(3 - Math.floor(R.pt / 40)) : 'GO!'); AU.sfx(R.pt < 121 ? 'color_tick' : 'color_go'); }
      if (R.pt >= 160) { clearRow(24, 1, 30); inkNewQ(); }
      return;
    }
    if (R.phase === 'intro') { if (R.pt >= 90) inkNewQ(); return; }
    if (R.phase === 'draw') { if (queueEmpty()) inkReveal(); return; }
    if (R.phase === 'ask') {
      var Q = R.cur, n = INK_LV[R.lv][0];
      for (i = 0; i < n; i++) if (I.pressed(COLORS[i].key)) { inkAnswer(i); return; }
      Q.t++;
      if (Q.t >= Q.limit) inkAnswer(-1);
      return;
    }
    if (R.phase === 'fb' && R.pt >= R.fbLen) inkNext();
  }
  function drawBar(rem, lim) {
    var px = lim ? Math.round(128 * rem / lim) : 0;
    for (var i = 0; i < 16; i++) put(BAR_COL + i, BAR_ROW, art.t('TB' + clamp(px - i * 8, 0, 8)));
  }

  /* ================================================================ 2 色塊衝刺 */
  function drawBlocks() {
    for (var r = 8; r < 16; r++) for (var c = 0; c < 8; c++) { put(4 + c, r, art.t('SOL3')); put(20 + c, r, art.t('SOL3')); }
    for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) { putA(2 + a, 4 + b, 2); putA(10 + a, 4 + b, 3); }
    if (g.run.kind === 'mix') { text(5, 17, 'TARGET'); text(21, 17, ' YOURS'); for (var h = 0; h < 12; h++) put(19 + h, 18, art.ch(h === 0 || h === 11 ? '+' : '-')); }
  }
  function rushDiff() { return Math.min(5, Math.floor(g.run.ok / 6)); }
  function rushNewQ() {
    var R = g.run, d = rushDiff(), type = (rnd() & 1) ? 'same' : 'bright', h = 1 + rnd() % 12, r = rnd() % 4, L, Rc, ans;
    if (type === 'same') {
      L = mkColor(h, r);
      if (rnd() & 1) { Rc = L; ans = 'same'; }
      else {
        ans = 'diff';
        if (d < 3 || (rnd() & 1)) { var hd = [4, 3, 2, 1, 1, 1][d]; Rc = mkColor(h + ((rnd() & 1) ? hd : -hd), r); }
        else Rc = mkColor(h, r === 3 ? 2 : (r === 0 ? 1 : r + ((rnd() & 1) ? 1 : -1)));
      }
    } else {
      var gap = d < 2 ? 2 : 1, r1 = rnd() % (4 - gap), r2 = r1 + gap;
      if (gap === 1 && d >= 4 && r1 + 2 <= 3 && (rnd() & 1)) r2 = r1 + 1;
      var h2 = d < 2 ? h : h + 2 + rnd() % 4;
      if (rnd() & 1) { L = mkColor(h, r2); Rc = mkColor(h2, r1); ans = 'left'; }
      else { L = mkColor(h, r1); Rc = mkColor(h2, r2); ans = 'right'; }
    }
    R.qid++;
    R.cur = { id: R.qid, type: type, L: L, R: Rc, ans: ans, t: 0 };
    setPal(2, [L, L, L]); setPal(3, [Rc, Rc, Rc]);
    clearRow(5, 1, 30); center(5, type === 'same' ? 'SAME COLOR?' : 'WHICH IS BRIGHTER?');
    clearRow(20, 1, 30); center(20, type === 'same' ? 'A = SAME    B = DIFFERENT' : 'LEFT  OR  RIGHT');
    assistCodes();
    R.phase = 'ask'; R.pt = 0;
  }
  function assistCodes() {
    var R = g.run, Q = R.cur;
    clearRow(17, 1, 30);
    if (R.kind === 'rush') {
      if (g.assist && Q) { text(5, 17, 'H' + pad(hueOf(Q.L), 2) + ' L' + rowOf(Q.L)); text(21, 17, 'H' + pad(hueOf(Q.R), 2) + ' L' + rowOf(Q.R)); }
      return;
    }
    text(5, 17, (g.assist || (Q && Q.reveal)) && Q ? 'H' + pad(Q.th, 2) + (Q.reveal ? ' L' + Q.tl : '') : 'TARGET');
    text(20, 17, Q ? 'H' + pad(Q.h, 2) + ' L' + Q.l + ' ' : ' YOURS ');
  }
  function rushAnswer(a) {
    var R = g.run, Q = R.cur;
    if (a === Q.ans) {
      var pts = 100 + Math.min(R.combo, 20) * 10;
      R.score += pts; R.combo++; R.ok++; if (R.combo > R.maxCombo) R.maxCombo = R.combo;
      R.rts.push(Q.t); if (!R.bestRt || Q.t < R.bestRt) R.bestRt = Q.t;
      Q.res = 'ok'; AU.sfx('color_ok'); say('OK! ' + ms(Q.t) + 'MS  +' + pts, 30);
      R.phase = 'fb'; R.pt = 0; R.fbLen = 16;
    } else {
      R.combo = 0; R.miss++; R.time = Math.max(0, R.time - RUSH_PENALTY);
      Q.res = 'miss'; AU.sfx('color_ng'); say('MISS! -3.0 SEC', 40);
      R.phase = 'fb'; R.pt = 0; R.fbLen = 36;
    }
  }
  function updateRush() {
    var R = g.run, I = NES.Input;
    R.pt++;
    if (R.phase === 'ready') {
      if (R.pt === 1) { clearRow(5, 1, 30); center(5, 'COLOR RUSH  READY'); }
      if (R.pt % 40 === 1 && R.pt < 160) { clearRow(20, 1, 30); center(20, R.pt < 121 ? String(3 - Math.floor(R.pt / 40)) : 'GO!'); AU.sfx(R.pt < 121 ? 'color_tick' : 'color_go'); }
      if (R.pt >= 160) rushNewQ();
      return;
    }
    R.time--;
    if (R.time <= 0) { R.time = 0; finish(); return; }
    if (R.phase === 'ask') {
      var Q = R.cur;
      Q.t++;
      if (Q.type === 'same') { if (I.pressed(BTN.A)) rushAnswer('same'); else if (I.pressed(BTN.B)) rushAnswer('diff'); }
      else { if (I.pressed(BTN.LEFT)) rushAnswer('left'); else if (I.pressed(BTN.RIGHT)) rushAnswer('right'); }
      return;
    }
    if (R.phase === 'fb' && R.pt >= R.fbLen) rushNewQ();
  }

  /* ================================================================ 3 調色 */
  function mixNewRound() {
    var R = g.run, th = 1 + rnd() % 12, tl = rnd() % 4;
    R.qid++;
    R.cur = { id: R.qid, th: th, tl: tl, h: mkColor(th + 6, 0) & 15, l: (tl + 2) % 4, t: 0, mem: R.round >= MIX_MEM_FROM, covered: false, peeked: false, peekT: 0, reveal: false };
    mixPal();
    clearRow(5, 1, 30); center(5, 'ROUND ' + (R.round + 1) + '/' + MIX_ROUNDS + (R.cur.mem ? '  MEMORIZE!' : ''));
    clearRow(20, 1, 30); center(20, 'L/R HUE  U/D LIGHT  A SET');
    assistCodes();
    R.phase = 'ask'; R.pt = 0;
  }
  function targetColor(Q) { return mkColor(Q.th, Q.tl); }
  function mixPal() {
    var Q = g.run.cur, tc = targetColor(Q), yc = mkColor(Q.h, Q.l);
    var cover = Q.covered && Q.peekT <= 0 && g.run.phase === 'ask';
    setPal(2, cover ? [0x00, 0x00, 0x10] : [tc, tc, tc]);
    setPal(3, [yc, yc, yc]);
  }
  function setCover(on) {
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) put(7 + a, 11 + b, on ? art.t('QM_' + (b * 2 + a)) : art.t('SOL3'));
  }
  function mixScore(Q) {
    var hd = hueDist(Q.h, Q.th), ld = Math.abs(Q.l - Q.tl), base = Math.max(0, 1000 - 250 * hd - 300 * ld);
    return { hd: hd, ld: ld, base: base, bonus: base > 0 ? Math.min(100, Math.floor(Math.max(0, MIX_TIME - Q.t) / 6)) : 0 };
  }
  function mixSubmit() {
    var R = g.run, Q = R.cur, s = mixScore(Q), pts = s.base + s.bonus - (Q.peeked ? MIX_PEEK_COST : 0);
    pts = Math.max(0, pts);
    R.score += pts; Q.pts = pts; Q.res = s.base >= 1000 ? 'perfect' : (s.base > 0 ? 'ok' : 'miss');
    if (s.base >= 1000) { R.ok++; R.combo++; } else { R.combo = 0; if (!s.base) R.miss++; }
    if (R.combo > R.maxCombo) R.maxCombo = R.combo;
    R.phase = 'fb'; R.pt = 0; R.fbLen = 90;
    Q.covered = false; setCover(false); Q.reveal = true; mixPal(); assistCodes();
    AU.sfx(s.base >= 1000 ? 'color_level' : (s.base > 0 ? 'color_ok' : 'color_ng'));
    say((s.base >= 1000 ? 'PERFECT! ' : (s.hd ? 'HUE OFF ' + s.hd + ' ' : 'HUE OK ') + (s.ld ? 'LIGHT OFF ' + s.ld : 'LIGHT OK ')) + ' +' + pts, 90);
  }
  function updateMix() {
    var R = g.run, I = NES.Input;
    R.pt++;
    if (R.phase === 'ready') {
      if (R.pt === 1) { clearRow(5, 1, 30); center(5, 'HUE MIXER  READY'); }
      if (R.pt % 40 === 1 && R.pt < 160) { clearRow(20, 1, 30); center(20, R.pt < 121 ? String(3 - Math.floor(R.pt / 40)) : 'GO!'); AU.sfx(R.pt < 121 ? 'color_tick' : 'color_go'); }
      if (R.pt >= 160) mixNewRound();
      return;
    }
    if (R.phase === 'ask') {
      var Q = R.cur, ch = false;
      Q.t++;
      if (Q.mem && !Q.covered && Q.t >= MIX_SHOW) { Q.covered = true; setCover(true); mixPal(); clearRow(5, 1, 30); center(5, 'ROUND ' + (R.round + 1) + '/' + MIX_ROUNDS + '  B = PEEK'); }
      if (Q.peekT > 0 && --Q.peekT === 0) mixPal();
      if (Q.covered && !Q.peeked && I.pressed(BTN.B)) { Q.peeked = true; Q.peekT = MIX_PEEK; mixPal(); AU.sfx('color_peek'); say('PEEK -' + MIX_PEEK_COST, 40); }
      if (rep(BTN.LEFT)) { Q.h = Q.h === 1 ? 12 : Q.h - 1; ch = true; }
      if (rep(BTN.RIGHT)) { Q.h = Q.h === 12 ? 1 : Q.h + 1; ch = true; }
      if (rep(BTN.UP) && Q.l < 3) { Q.l++; ch = true; }
      if (rep(BTN.DOWN) && Q.l > 0) { Q.l--; ch = true; }
      if (ch) { mixPal(); assistCodes(); AU.sfx('color_move'); }
      if (I.pressed(BTN.A) || Q.t >= MIX_TIME) mixSubmit();
      return;
    }
    if (R.phase === 'fb' && R.pt >= R.fbLen) {
      R.round++;
      if (R.round >= MIX_ROUNDS) { finish(); return; }
      mixNewRound();
    }
  }

  /* ================================================================ HUD */
  function hud() {
    var R = g.run;
    if (!R) return;
    var star = R.cheated ? '$' : ' ';
    if (R.kind === 'ink') {
      var h = '';
      for (var i = 0; i < INK_LIVES; i++) h += i < R.lives ? '^' : ' ';
      text(1, 2, padR('INK OR WORD LV' + (R.lv + 1), 18) + star + 'SC ' + pad(R.score, 6) + ' ');
      text(1, 3, padR('Q ' + pad(Math.min(R.qi + 1, 40), 2) + '/40  ' + h + '  COMBO ' + pad(R.combo, 2), 30));
      var Q = R.cur;
      if (Q && R.phase === 'ask') drawBar(Q.limit - Q.t, Q.limit);
      else if (R.phase !== 'fb') drawBar(0, 1);
    } else if (R.kind === 'rush') {
      text(1, 2, padR('COLOR RUSH', 18) + star + 'SC ' + pad(R.score, 6) + ' ');
      text(1, 3, padR('TIME ' + secText(R.time) + '  OK ' + pad(R.ok, 3) + '  COMBO ' + pad(R.combo, 2), 30));
    } else {
      text(1, 2, padR('HUE MIXER', 18) + star + 'SC ' + pad(R.score, 6) + ' ');
      var Qm = R.cur;
      text(1, 3, padR('ROUND ' + pad(Math.min(R.round + 1, MIX_ROUNDS), 2) + '/' + MIX_ROUNDS + '  TIME ' + (Qm && R.phase === 'ask' ? secText(MIX_TIME - Qm.t) : secText(MIX_TIME)), 30));
    }
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = g.msg;
    else if (R.kind === 'ink') line = R.cur && R.cur.rule === 'WORD' ? 'RULE: WORD  (WHAT IT SAYS)' : 'RULE: INK  (THE COLOR)';
    else if (R.kind === 'rush') line = 'START PAUSE  WRONG = -3 SEC';
    else line = R.cur && R.cur.covered && !R.cur.peeked ? 'B PEEK AGAIN (-' + MIX_PEEK_COST + ')' : 'MATCH THE TARGET COLOR';
    text(1, MSG_ROW, padR(line, 30));
  }

  /* ================================================================ 結算 / GAME OVER */
  function avgRt(R) { if (!R.rts.length) return 0; var s = 0; for (var i = 0; i < R.rts.length; i++) s += R.rts[i]; return s / R.rts.length; }
  function checkGoal(R) { if (R.kind === 'ink' && !R.cheated && R.score >= GOAL_SCORE && !g.goalRun) g.goalRun = R; }
  function finish() {
    var R = g.run, nb = saveBest(R), lines;
    checkGoal(R);
    if (R.kind === 'ink') lines = ['40 QUESTIONS CLEAR!', 'SCORE ' + pad(R.score, 6), 'CORRECT ' + pad(R.ok, 2) + '/40  MAX COMBO ' + pad(R.maxCombo, 2), 'AVG ' + ms(avgRt(R)) + 'MS  BEST ' + ms(R.bestRt) + 'MS'];
    else if (R.kind === 'rush') lines = ['TIME UP!', 'SCORE ' + pad(R.score, 6), 'CORRECT ' + pad(R.ok, 3) + '  MISS ' + pad(R.miss, 2), 'AVG ' + ms(avgRt(R)) + 'MS  MAX COMBO ' + pad(R.maxCombo, 2)];
    else lines = ['MIXER COMPLETE!', 'SCORE ' + pad(R.score, 6), 'PERFECT ' + pad(R.ok, 2) + '/' + MIX_ROUNDS, ''];
    enterResult(lines, rating(R.kind, R.score), nb);
  }
  function enterResult(lines, rk, nb) {
    var R = g.run;
    g.mode = 'result'; g.overT = 0; R.phase = 'done';
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 4, art.t('BH')); put(c, 25, art.t('BHB')); }
      for (var i = 0; i < lines.length; i++) if (lines[i]) center(7 + i * 2, lines[i]);
      center(16, 'RATING ' + rk);
      if (R.cheated) center(19, 'CHEAT USED - NOT SAVED');
      else if (nb) center(19, 'NEW RECORD!');
      center(22, 'PUSH START');
    });
    AU.play('color_win');
  }
  function enterOver(why) {
    var R = g.run;
    saveBest(R); checkGoal(R);
    g.mode = 'over'; g.overT = 0; R.why = why; R.phase = 'over';
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('BH')); put(c, 24, art.t('BHB')); }
      center(8, 'GAME OVER');
      center(11, why);
      center(14, 'REACHED Q ' + pad(R.qi, 2) + '/40');
      center(17, 'C/$ = CONTINUE HERE');
      center(19, 'START = TITLE');
    });
    AU.play('color_over');
  }

  /* ================================================================ 密技 */
  function doCheat() {
    var R = g.run;
    if (!R) return;
    R.cheated = true;
    if (g.mode === 'over') {      // 原地續關：同一題、命補滿、分數保留
      R.continues++; R.lives = INK_LIVES; R.saved = false; R.qi = Math.max(0, R.qi - 1);
      g.mode = 'ink'; R.phase = 'ready'; R.pt = 0;
      layout(); AU.play('color_play'); say('CONTINUE! LIVES REFILLED', 60);
      return;
    }
    if (R.kind === 'ink') {
      R.lives = Math.min(INK_LIVES, R.lives + 2);
      if (R.cur && R.phase === 'ask') R.cur.t = 0;
      say('STAR BOOST! +2 LIVES', 60);
    } else if (R.kind === 'rush') { R.time += RUSH_BONUS_CHEAT; say('STAR BOOST! +10 SEC', 60); }
    else if (R.cur) { R.cur.reveal = true; R.cur.t = 0; assistCodes(); say('STAR HINT: H' + pad(R.cur.th, 2) + ' L' + R.cur.tl, 90); }
    AU.sfx('color_ok');
  }

  /* ================================================================ 精靈 */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, R = g.run;
    function spr(x, y, tile, pal, fh, fv) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv }); }
    function mark(x, y, k) { for (var i = 0; i < 4; i++) spr(x + (i & 1) * 8, y + (i >> 1) * 8, art.s('MK_' + k + '_' + i), 1); }
    if (g.mode === 'title') spr(28, titleRow(g.sel) * 8, art.s('ARW'), 0);
    if (R && g.mode === 'ink' && !g.paused && R.cur) {
      var Q = R.cur;
      if (g.assist && (R.phase === 'ask' || R.phase === 'fb')) {
        mark(Q.col * 8 - 20, WORD_ROW * 8, Q.ink);
        mark((Q.col + Q.len * 2) * 8 + 4, WORD_ROW * 8, Q.ink);
      }
      if (R.phase === 'fb') {
        var sw = COLORS[Q.ans].sw;
        if (Q.res === 'miss') { if ((R.pt & 8) === 0) spr(sw[0] * 8 - 10, sw[1] * 8 + 4, art.s('ARW'), 0); }
        else { spr(sw[0] * 8 + 4, sw[1] * 8 - 6, art.s('SPK'), 2); spr(sw[0] * 8 + 12, sw[1] * 8 + 12, art.s('SPK'), 2); }
      }
    }
    if (R && g.mode === 'rush' && !g.paused && R.cur && R.phase === 'fb' && R.cur.res === 'ok') {
      var side = R.cur.ans === 'right' ? 20 : (R.cur.ans === 'left' ? 4 : 12);
      spr(side * 8 + 28, 56, art.s('SPK'), 2);
    }
    if (R && g.mode === 'mix' && !g.paused && R.cur && R.phase === 'ask') {
      // 刻度指針：色相 12 格（第 18 列刻度 19~30 欄），指針在第 19 列
      spr((19 + R.cur.h - 1) * 8, 19 * 8, art.s('TICK'), 0);
    }
    for (var q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }

  /* ================================================================ 主迴圈 */
  function playing() { return g.mode === 'ink' || g.mode === 'rush' || g.mode === 'mix'; }
  function setPaused(p) {
    var R = g.run;
    g.paused = p;
    if (p) {
      AU.pause();
      g.savedPal = [nes0.ppu.getBgPalette(2).slice(1), nes0.ppu.getBgPalette(3).slice(1)];
      if (R.kind === 'ink') setPal(3, HIDE); else { setPal(2, HIDE); setPal(3, HIDE); }   // 暫停時藏題目（不能偷看）
    } else {
      AU.resume();
      if (g.savedPal) { if (R.kind !== 'ink') setPal(2, g.savedPal[0]); setPal(3, g.savedPal[1]); }
    }
    g.hold = {};
  }
  function updatePlay() {
    if (startPressed()) setPaused(!g.paused);
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (g.mode === 'ink') updateInk();
    else if (g.mode === 'rush') updateRush();
    else updateMix();
  }

  /* ================================================================ 機器人（反應延遲 lag 幀；只讀畫面上的東西） */
  function botLag() { var v = CT.query ? parseInt(CT.query('lag') || '', 10) : NaN; return isNaN(v) ? 18 : clamp(v, 0, 600); }
  function botMask() {
    var B = g.bot;
    B.t++;
    if (B.hold > 0) { B.hold--; return B.mask; }
    var m = inner();
    if (m) { B.mask = m; B.hold = 2; }        // 人類按鍵約 3 幀
    return m;
    function tap(k) { return (B.t % 6 === 0) ? k : 0; }
    function inner() {
      var R = g.run, ppu = nes0.ppu;
      if (g.mode === 'title') {
        var wm = clamp((parseInt((CT.query && CT.query('pmode')) || '1', 10) || 1) - 1, 0, 2);
        if (g.t < 30) return 0;
        if (g.sel !== wm) return (B.t % 10 === 0) ? BTN.DOWN : 0;
        return (B.t % 20 === 0) ? BTN.START : 0;
      }
      if (g.mode === 'help') return (g.t > 30 && B.t % 20 === 0) ? BTN.B : 0;
      if (g.mode === 'over' || g.mode === 'result') return (g.overT > 90 && B.t % 30 === 0) ? BTN.START : 0;
      if (g.paused) return (B.t % 30 === 0) ? BTN.START : 0;
      if (!R || !R.cur || R.phase !== 'ask') return 0;
      var Q = R.cur;
      if (B.seen !== Q.id) { B.seen = Q.id; B.at = B.t + botLag(); }
      if (R.kind === 'ink') {
        if (B.t < B.at) return 0;
        var ink = colorIndex(ppu.getBgPalette(3)[3]);          // 畫面上的墨色
        if (ink < 0) return 0;
        var ans = Q.rule === 'INK' ? ink : Q.word;             // 規則 / 字 = 畫面上寫的那一份
        return COLORS[ans].key;
      }
      if (R.kind === 'rush') {
        if (B.t < B.at) return 0;
        var L = ppu.getBgPalette(2)[3], Rc = ppu.getBgPalette(3)[3];
        if (Q.type === 'same') return L === Rc ? BTN.A : BTN.B;
        return rowOf(L) > rowOf(Rc) ? BTN.LEFT : BTN.RIGHT;
      }
      // 調色：目標亮著的時候記住（記憶回合也只在展示的 120 幀內讀），再一格一格轉過去
      var tp = ppu.getBgPalette(2)[3];
      if (!(Q.covered && Q.peekT <= 0) && tp !== 0x10) { B.mem = tp; B.memRound = Q.id; }
      if (B.memRound !== Q.id || B.t < B.at) return 0;
      var th = hueOf(B.mem), tl = rowOf(B.mem);
      if (Q.h !== th) { var fw = (th - Q.h + 12) % 12; return tap(fw <= 6 ? BTN.RIGHT : BTN.LEFT); }
      if (Q.l !== tl) return tap(Q.l < tl ? BTN.UP : BTN.DOWN);
      return (B.t % 12 === 0) ? BTN.A : 0;
    }
  }
  function goalOk() { return !!(g && g.goalRun && !g.goalRun.cheated); }

  /* ================================================================ 註冊 */
  var GAME = {
    id: 'color', order: 8, title: '星塵色感', legacy: ['color-match.html', 'color-rush.html'],
    init: function (nes) {
      nes0 = nes;
      art = CO.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'color_bg');
      NES.CHR.setPattern(1, 'color_spr');
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
      if (qm >= 1 && qm <= 3 && CT.query('direct') === '1') { g.sel = qm - 1; startGame(qm - 1); }
    },
    update: function () {
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'help') updateHelp();
      else if (g.mode === 'over' || g.mode === 'result') {
        g.overT++;
        if (g.overT > 40 && startPressed()) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (playing()) hud();
      flush();
      drawSprites();
    },
    state: function () {
      var R = g.run, r = null;
      if (R) {
        r = { kind: R.kind, phase: R.phase, pt: R.pt, score: R.score, combo: R.combo, maxCombo: R.maxCombo, ok: R.ok, miss: R.miss,
              cheated: R.cheated, continues: R.continues, qid: R.qid, avgRt: avgRt(R), bestRt: R.bestRt, rts: R.rts.slice() };
        if (R.kind === 'ink') { r.qi = R.qi; r.lv = R.lv; r.lives = R.lives; }
        if (R.kind === 'rush') r.time = R.time;
        if (R.kind === 'mix') r.round = R.round;
        if (R.cur) { r.cur = {}; for (var k in R.cur) if (Object.prototype.hasOwnProperty.call(R.cur, k)) r.cur[k] = R.cur[k]; }
      }
      return { mode: g.mode, sel: g.sel, assist: g.assist, paused: g.paused, t: g.t, queue: g.q.length + g.qa.length, run: r, goal: goalOk(), music: AU.current };
    },
    exit: function () { if (g && g.run && (playing() || g.mode === 'over')) saveBest(g.run); AU.stop(); },
    cheat: function () { if (!g || !g.run || !(playing() || g.mode === 'over')) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return pad(Math.min(999999, CT.load('color', 'ink', 0) | 0), 6); }
  };
  CO.COLORS = COLORS;
  CO.MODES = MODES;
  CO.INK_LV = INK_LV;
  CO.K = { HZ: HZ, GOAL_SCORE: GOAL_SCORE, INK_PER_LV: INK_PER_LV, INK_LIVES: INK_LIVES, RUSH_TIME: RUSH_TIME, RUSH_PENALTY: RUSH_PENALTY,
    MIX_ROUNDS: MIX_ROUNDS, MIX_TIME: MIX_TIME, MIX_SHOW: MIX_SHOW, MIX_PEEK_COST: MIX_PEEK_COST, MIX_MEM_FROM: MIX_MEM_FROM, RATE: RATE };
  CO.dev = {
    g: function () { return g; },
    start: function (m) { g.sel = m; return startGame(m); },
    title: function () { enterTitle(); },
    help: function () { enterHelp(); },
    newInk: function () { inkNewQ(); }, newRush: function () { rushNewQ(); },
    ms: ms, hueDist: hueDist, mkColor: mkColor, rating: rating, mixScore: mixScore,
    // 測試用：把下一題換成指定的字 / 墨色 / 規則（只在 draw 階段之前呼叫）
    forceInk: function (word, ink, rule) {
      var R = g.run, Q = R.cur, name = COLORS[word].name;
      Q.word = word; Q.ink = ink; Q.rule = rule || 'INK'; Q.ans = Q.rule === 'INK' ? ink : word; Q.len = name.length;
      big(Q.col, WORD_ROW, padR(name, 6));
      if (R.phase === 'ask') inkReveal();
    }
  };
  if (CT.register) CT.register(GAME);
})();
