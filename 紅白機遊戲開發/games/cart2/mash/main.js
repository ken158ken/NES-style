/*
 * games/cart2/mash/main.js — 《星塵連打 STAR MASH》（合輯卡帶二 槽 8，id = mash）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-4 cart2-aim（R6）｜ 依賴：mash/art.js、mash/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：click-speed / speed-clicker / finger-frenzy / combo-storm ⇒ 4 合 1 成 4 個模式。
 *
 * 主角「星鈕」：被連打的星塵大按鈕（與 cart2 選單圖示同造型）。
 * **只認按下邊緣**（NES.Input.pressed；按住不放 / 鍵盤自動重複都不算，brief §1-4）。
 * 模式：
 *   1 RAPID 10   10 秒連打測定：A / B 每次按下都算；顯示每秒次數與稱號（STARDUST → SUPERNOVA 8 階）
 *   2 A/B SWITCH 交替連打 10 秒：A、B 輪流才算一步，同一鍵連按 = 絆倒（8 幀不能動）；星塵跑者跑向終點旗
 *   3 COMMAND    指令連段：畫面出現 ↑↓←→AB 序列，限時內照順序輸入；成功 = 連段 +1，5 連段長度 +1（3 → 8 鍵），
 *                限時隨連段縮短；按錯 / 超時 = 失誤（連段歸零），3 次失誤 GAME OVER
 *   4 ENDURANCE  耐力 60 秒：最近 1 秒的按下次數要維持在節拍帶裡（每 10 秒換一次帶）；在帶內的時間比 = 評價
 * 密技（C / ★）：遊玩中 = 補 3 秒（COMMAND：失誤次數補回 + 本串限時補滿）；COMMAND GAME OVER = 原地續關（分數 / 最大連段保留）；
 *   標題 / 結算無效；用過密技的那一局不存紀錄、goal false。goal = COMMAND 一局 ≥ 30 連段。
 * 機器人：合理節奏——RAPID 每 5 幀按一次（12 次/秒）、SWITCH A/B 每 5 幀輪流、COMMAND 反應 14 幀 + 每鍵間隔 7 幀、
 *   ENDURANCE 依節拍帶中央換算間隔；每次只按 1 幀（絕不每幀狂按）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MA = CT.Mash = CT.Mash || {};
  var AU = MA.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var MODES = [
    { key: 'RAP', name: 'RAPID 10', desc: ['TAP A OR B AS FAST', 'AS YOU CAN FOR 10 SEC'] },
    { key: 'ALT', name: 'A/B SWITCH', desc: ['TAP A B A B .. IN TURN', 'SAME KEY TWICE = TRIP'] },
    { key: 'CMD', name: 'COMMAND', desc: ['INPUT THE KEYS SHOWN', 'MISS -5 COMBO  3 MISS OVER'] },
    { key: 'END', name: 'ENDURANCE', desc: ['KEEP YOUR TAP SPEED', 'IN THE BAND FOR 60 SEC'] }
  ];
  var TITLES = [[0, 'STARDUST'], [30, 'PEBBLE'], [45, 'COMET'], [60, 'METEOR'], [75, 'NOVA'], [90, 'PULSAR'], [110, 'QUASAR'], [130, 'SUPERNOVA']];
  var GRADES = ['S', 'A', 'B', 'C', 'D'], END_PCT = [85, 70, 50, 30, 0];
  var BANDS = [[4, 6], [6, 8], [3, 5], [7, 9], [5, 7], [8, 10]];
  var KEYS = ['U', 'D', 'L', 'R', 'A', 'B'];
  var KEYBTN = { U: BTN.UP, D: BTN.DOWN, L: BTN.LEFT, R: BTN.RIGHT, A: BTN.A, B: BTN.B };
  var T_RAP = 600, T_END = 3600, BAND_LEN = 600, BAND_GRACE = 60, TRIP = 8, CMD_GOAL = 30, LIVES = 3;
  var MSG_ROW = 27, HUD1 = 2, HUD2 = 3, FLUSH_LIMIT = 140, MISS_PENALTY = 5;
  var PAL = {
    bd: 0x0F,
    bg: [[0x01, 0x21, 0x30], [0x02, 0x12, 0x30], [0x09, 0x1A, 0x30], [0x07, 0x27, 0x38]],
    spr: [[0x06, 0x16, 0x30], [0x01, 0x21, 0x30], [0x07, 0x28, 0x38], [0x16, 0x27, 0x38]]
  };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, paused: false, cheatReq: false, run: null, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      seed: 0x3579, overT: 0, goalRun: null, bot: { t: 0, prev: 0, last: -99, alt: 0 }, presses: 0, edges: 0
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 名稱表佇列（同 gallery：每幀 ≤ 140 byte） ---------------- */
  function bgTile(c, r) {
    // fix-r6：HUD 下移一列（第 2、3 列，手機直向不貼頂），上桁架改第 4 列
    if (r === 4 || r === 26) return art.t(r === 4 ? 'GH' : 'GHB');
    if (r < 5 || r > 25) return 0;
    if (c === 0) return art.t('GV');
    if (c === 31) return art.t('GVR');
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x1f3d) >>> 0;
    if (h % 31 === 3) return art.t('ST1');
    if (h % 47 === 7) return art.t('ST2');
    return 0;
  }
  function put(c, r, t) { var k = r * 32 + c; if (g.want[k] === t) return; g.want[k] = t; g.q.push(k); }
  function putA(c16, r16, p) { var k = r16 * 16 + c16; if (g.wantA[k] === p) return; g.wantA[k] = p; g.qa.push(k); }
  function text(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) put(col + i, row, t[i]); }
  function center(row, s) { text(16 - (s.length >> 1), row, s); }
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
  function drawField() { for (var r = 3; r <= 26; r++) for (var c = 0; c < 32; c++) put(c, r, bgTile(c, r)); }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i), x = col + i * 2;
      if (ch === ' ') { put(x, row, 0); put(x + 1, row, 0); put(x, row + 1, 0); put(x + 1, row + 1, 0); continue; }
      put(x, row, art.t('BIG_' + ch + '0')); put(x + 1, row, art.t('BIG_' + ch + '1'));
      put(x, row + 1, art.t('BIG_' + ch + '2')); put(x + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }

  /* ---------------- 紀錄 ---------------- */
  var SAVE_KEY = { RAP: 'best', ALT: 'alt', CMD: 'combo', END: 'end' };
  function bestOf(k) { return CT.load('mash', SAVE_KEY[k], 0) | 0; }
  function bestLine(k) {
    var b = bestOf(k);
    if (k === 'END') return b ? pad(b, 3) + '%' : '---';
    return b ? pad(b, 3) : '---';
  }
  function titleOf(n) { var t = TITLES[0][1]; for (var i = 0; i < TITLES.length; i++) if (n >= TITLES[i][0]) t = TITLES[i][1]; return t; }
  function runValue() {
    var R = g.run;
    if (!R) return 0;
    if (R.key === 'RAP' || R.key === 'ALT') return R.count;
    if (R.key === 'CMD') return R.maxCombo;
    return Math.floor(R.inBand * 100 / Math.max(1, R.judged || 1));
  }
  function saveRun() {
    var R = g.run;
    if (!R || R.cheated || R.saved) return false;
    var v = runValue(), k = R.key;
    if (k === 'END' && R.judged < T_END - 6 * BAND_GRACE) return false;   // 耐力：跑完才算
    if (v > bestOf(k)) { CT.save('mash', SAVE_KEY[k], v); return true; }
    return false;
  }

  /* ---------------- 標題 ---------------- */
  function titleRow(i) { return 10 + i * 2; }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.paused = false;
    redraw(function () {
      for (var c = 0; c < 32; c++) { put(c, 1, art.t('GHB')); put(c, 28, art.t('GH')); }
      big(7, 3, 'STAR MASH');
      center(6, 'FINGER POWER LAB');
      text(9, 8, 'MODE         BEST');
      for (var i = 0; i < MODES.length; i++) text(6, titleRow(i), (i + 1) + ' ' + padR(MODES[i].name, 11) + bestLine(MODES[i].key));
      text(4, 19, 'ONLY A NEW PRESS COUNTS');
      text(4, 21, 'HOLD START+SELECT: MENU');
      text(4, 23, 'C/$ = CHEAT  UP/DOWN MODE');
      for (c = 1; c < 15; c++) { putA(c, 1, 3); putA(c, 2, 3); }
      selAttr(g.sel, 3);
    });
    AU.play('mash_title');
  }
  function selAttr(i, p) { var r16 = titleRow(i) >> 1; for (var c = 3; c < 15; c++) putA(c, r16, p); }

  /* ---------------- 開始 / 結束 ---------------- */
  function startMode(m) {
    var k = MODES[m].key;
    g.runs = (g.runs || 0) + 1;
    g.seed = (0x2468 + g.runs * 7919 + m * 97) & 0x7fffffff;
    g.run = { m: m, key: k, count: 0, time: 0, timeMax: 1, cheated: false, hist: [], lastKey: 0, trip: 0, trips: 0,
              combo: 0, maxCombo: 0, score: 0, lives: LIVES, seq: null, pos: 0, gap: 0, seqT: 0, seqMax: 1, seqAge: 0, flash: -1,
              inBand: 0, judged: 0, band: 0, rate: 0, continues: 0, pressT: 0, saved: false };
    g.mode = 'ready'; g.t = 0; g.paused = false; g.msg = ''; g.msgT = 0;
    var R = g.run;
    if (k === 'RAP' || k === 'ALT') { R.time = T_RAP; R.timeMax = T_RAP; }
    if (k === 'END') { R.time = T_END; R.timeMax = T_END; }
    if (k === 'CMD') { R.time = 1; R.timeMax = 1; }
    redraw(function () {
      drawField();
      layout();
      center(14, MODES[m].desc[0]);
      center(16, MODES[m].desc[1]);
      hud();
    });
    AU.stop();
  }
  function clearReadyText() { for (var r = 14; r <= 18; r += 2) for (var c = 1; c < 31; c++) put(c, r, bgTile(c, r)); }
  function layout() {
    var k = g.run.key, c;
    if (k === 'RAP' || k === 'ALT') {
      text(13, 11, k === 'RAP' ? 'TAPS' : 'STEPS');
      for (var r = 5; r <= 24; r++) put(2, r, art.t('VB0'));
    }
    if (k === 'ALT') {
      for (c = 1; c < 31; c++) put(c, 23, art.t('TRK'));
      put(28, 22, art.t('FLAG'));
    }
    if (k === 'CMD') { text(13, 10, 'COMBO'); }
    if (k === 'END') {
      text(8, 15, '1  4   8   12  16 /S');
    }
  }
  function beginPlay() {
    clearReadyText();
    g.mode = 'play'; g.t = 0;
    var R = g.run;
    if (R.key === 'CMD') newSeq();
    if (R.key === 'END') drawBand();
    AU.play('mash_go');
  }
  function enterResult() {
    var R = g.run;
    g.mode = 'result'; g.overT = 0;
    var nb = saveRun(); R.saved = true;
    var k = R.key, v = runValue();
    if (k === 'END') { var gi = 4; for (var i = 0; i < 5; i++) if (v >= END_PCT[i]) { gi = i; break; } R.grade = gi; }
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 3, art.t('GH')); put(c, 26, art.t('GHB')); }
      center(5, 'RESULT  ' + MODES[R.m].name);
      if (k === 'RAP' || k === 'ALT') {
        big(13, 8, pad(R.count, 3));
        center(11, k === 'RAP' ? 'TAPS IN 10 SEC' : 'STEPS IN 10 SEC');
        center(13, 'SPEED ' + pad(Math.floor(R.count / 10), 2) + '.' + (R.count % 10) + ' /S');
        if (k === 'ALT') center(15, 'TRIPS ' + pad(R.trips, 2));
        center(17, 'RANK ' + titleOf(R.count));
        putA(4, 8, 3); putA(5, 8, 3); putA(6, 8, 3); putA(7, 8, 3); putA(8, 8, 3); putA(9, 8, 3); putA(10, 8, 3); putA(11, 8, 3);
      } else {
        big(13, 8, pad(v, 3));
        center(11, 'TIME IN BAND %');
        center(14, 'GRADE');
        big(15, 16, GRADES[R.grade]);
        for (var a = 6; a < 10; a++) putA(a, 8, 3);
      }
      if (R.cheated) center(20, 'CHEAT USED - NOT SAVED');
      else if (nb) center(20, 'NEW BEST!');
      center(23, 'PUSH START');
    });
    AU.play('mash_result');
  }
  function enterOver() {
    var R = g.run;
    g.mode = 'over'; g.overT = 0;
    var nb = saveRun();
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('GH')); put(c, 24, art.t('GHB')); }
      center(8, 'GAME OVER');
      text(8, 11, 'MAX COMBO  ' + pad(R.maxCombo, 3) + (nb ? ' NEW!' : ''));
      text(8, 13, 'SCORE   ' + pad(R.score, 6));
      text(8, 15, 'BEST    ' + pad(bestOf('CMD'), 3));
      center(18, 'C/$ = CONTINUE HERE');
      center(20, 'START = TITLE');
      for (c = 5; c < 11; c++) putA(c, 4, 3);
    });
    AU.play('mash_over');
  }

  /* ---------------- 輸入：只認按下邊緣 ---------------- */
  function rateNow() {
    var h = g.run.hist, n = 0;
    for (var i = h.length - 1; i >= 0 && g.t - h[i] < 60; i--) n++;
    return n;
  }
  function addPress() { var R = g.run; R.hist.push(g.t); if (R.hist.length > 40) R.hist.shift(); R.pressT = 6; g.edges++; }
  function playRAP(I) {
    var R = g.run;
    if (I.pressed(BTN.A)) { R.count++; addPress(); AU.sfx('mash_tap'); }
    if (I.pressed(BTN.B)) { R.count++; addPress(); AU.sfx('mash_tap'); }
    if (--R.time <= 0) enterResult();
  }
  function playALT(I) {
    var R = g.run, keys = [];
    if (I.pressed(BTN.A)) keys.push(1);
    if (I.pressed(BTN.B)) keys.push(2);
    if (R.trip > 0) R.trip--;
    for (var i = 0; i < keys.length; i++) {
      if (R.trip > 0) break;
      if (keys[i] === R.lastKey) { R.trip = TRIP; R.trips++; AU.sfx('mash_stumble'); say('TRIP! SWITCH KEYS', 40); break; }
      R.lastKey = keys[i]; R.count++; addPress(); AU.sfx('mash_alt');
    }
    if (--R.time <= 0) enterResult();
  }
  function seqLen() { return Math.min(8, 3 + Math.floor(g.run.combo / 5)); }
  function seqTime(len) { return Math.max(len * 14 + 50, len * 30 + 120 - g.run.combo * 4); }
  function iconCol(i, len) { return ((16 - len) >> 1) + i; }
  function newSeq() {
    var R = g.run, len = seqLen(), i;
    if (R.seq) for (i = 0; i < R.seq.length; i++) drawIcon(iconCol(i, R.seq.length), null, 0);
    R.seq = [];
    for (i = 0; i < len; i++) {
      var k = KEYS[rnd() % 6];
      if (i >= 2 && k === R.seq[i - 1] && k === R.seq[i - 2]) k = KEYS[(KEYS.indexOf(k) + 1 + rnd() % 5) % 6];
      R.seq.push(k);
    }
    R.pos = 0; R.seqMax = seqTime(len); R.seqT = R.seqMax; R.seqAge = 0; R.flash = -1;
    for (i = 0; i < len; i++) drawIcon(iconCol(i, len), R.seq[i], 1);
  }
  function drawIcon(c16, k, pal) {
    var c = c16 * 2, r = 12;
    if (!k) { put(c, r, bgTile(c, r)); put(c + 1, r, bgTile(c + 1, r)); put(c, r + 1, bgTile(c, r + 1)); put(c + 1, r + 1, bgTile(c + 1, r + 1)); putA(c16, 6, 0); return; }
    put(c, r, art.t('IC_' + k + '_0')); put(c + 1, r, art.t('IC_' + k + '_1'));
    put(c, r + 1, art.t('IC_' + k + '_2')); put(c + 1, r + 1, art.t('IC_' + k + '_3'));
    putA(c16, 6, pal);
  }
  function cmdMiss(why) {
    var R = g.run;
    R.lives--; R.combo = Math.max(0, R.combo - MISS_PENALTY); R.gap = 40;   // fix-r6：失誤扣 5 連段（友善版，不歸零）
    if (R.pos < R.seq.length) putA(iconCol(R.pos, R.seq.length), 6, 3);
    AU.sfx('mash_miss'); say(why, 40);
  }
  function playCMD(I) {
    var R = g.run;
    if (R.gap > 0) {
      if (--R.gap === 0) { if (R.lives <= 0) { enterOver(); return; } newSeq(); }
      return;
    }
    R.seqAge++;
    var got = [], i;
    for (i = 0; i < KEYS.length; i++) if (I.pressed(KEYBTN[KEYS[i]])) got.push(KEYS[i]);
    if (got.length) {
      var want = R.seq[R.pos];
      if (got.indexOf(want) >= 0) {          // 同幀多鍵（觸控斜按）：只要含正確那鍵就收，友善版
        putA(iconCol(R.pos, R.seq.length), 6, 2);
        R.pos++; addPress(); AU.sfx('mash_key');
        if (R.pos >= R.seq.length) {
          R.combo++; if (R.combo > R.maxCombo) R.maxCombo = R.combo;
          var pts = R.seq.length * 10 * (1 + Math.floor(R.combo / 10));
          R.score += pts;
          if (!R.cheated && R.maxCombo >= CMD_GOAL && !g.goalRun) g.goalRun = R;
          if (R.combo % 5 === 0 && seqLen() <= 8 && R.combo / 5 <= 5) { AU.sfx('mash_lv'); say('LEVEL UP! ' + seqLen() + ' KEYS', 50); }
          else { AU.sfx('mash_ok'); say('COMBO ' + R.combo + '  +' + pts, 30); }
          R.gap = 16;
        }
      } else cmdMiss('MISS! WANTED ' + ({ U: 'UP', D: 'DOWN', L: 'LEFT', R: 'RIGHT', A: 'A', B: 'B' })[want]);
      return;
    }
    if (--R.seqT <= 0) cmdMiss('TOO SLOW!');
  }
  function drawBand() {
    var R = g.run, b = BANDS[R.band % BANDS.length];
    for (var i = 0; i < 16; i++) put(8 + i, 13, (i + 1 >= b[0] && i + 1 <= b[1]) ? art.t('BAND') : art.t('TICK'));
  }
  function playEND(I) {
    var R = g.run;
    if (I.pressed(BTN.A)) { addPress(); AU.sfx('mash_tap'); }
    if (I.pressed(BTN.B)) { addPress(); AU.sfx('mash_tap'); }
    var el = T_END - R.time, nb = Math.floor(el / BAND_LEN);
    if (nb !== R.band && nb < BANDS.length) { R.band = nb; drawBand(); AU.sfx('mash_lv'); say('NEW BAND ' + BANDS[nb][0] + '-' + BANDS[nb][1] + ' /S', 50); }
    R.rate = rateNow();
    var b = BANDS[R.band % BANDS.length];
    R.inNow = R.rate >= b[0] && R.rate <= b[1];
    if (el % BAND_LEN >= BAND_GRACE) { R.judged++; if (R.inNow) R.inBand++; }
    if (--R.time <= 0) enterResult();
  }

  /* ---------------- HUD ---------------- */
  function say(s, t) { g.msg = s; g.msgT = t || 40; }
  function hud() {
    var R = g.run;
    if (!R) return;
    var k = R.key, info;
    if (k === 'CMD') info = 'SC ' + pad(R.score, 6) + ' ^' + Math.max(0, R.lives);
    else if (k === 'END') info = 'IN BAND ' + pad(Math.floor(R.inBand * 100 / Math.max(1, R.judged)), 3) + '%';
    else info = (k === 'RAP' ? 'TAPS ' : 'STEPS ') + pad(R.count, 3);
    text(1, HUD1, padR(MODES[R.m].name, 12) + padR(info, 16) + (R.cheated ? '$' : ' '));
    var cur = k === 'CMD' ? (R.seq && R.gap === 0 ? R.seqT : 0) : R.time, mx = k === 'CMD' ? R.seqMax : R.timeMax;
    if (g.mode === 'ready') { cur = 1; mx = 1; }
    var frac = clamp(Math.floor(cur * 96 / Math.max(1, mx)), 0, 96);
    text(1, HUD2, k === 'CMD' ? 'KEYS' : 'TIME');
    for (var i = 0; i < 12; i++) put(6 + i, HUD2, art.t('BAR' + clamp(frac - i * 8, 0, 8)));
    text(19, HUD2, k === 'CMD' ? 'MAX ' + pad(R.maxCombo, 3) + '   ' : padR(pad(Math.floor(R.time / 60), 2) + ' SEC', 12));
    if (g.mode === 'play' || g.mode === 'ready') {
      if (k === 'RAP' || k === 'ALT') {
        big(13, 7, pad(R.count, 3));
        var px = Math.min(160, k === 'RAP' ? R.count : R.count + (R.count >> 1));
        for (var r = 0; r < 20; r++) put(2, 24 - r, art.t('VB' + clamp(px - r * 8, 0, 8)));
        text(10, 13, 'NOW ' + pad(rateNow(), 2) + ' /S');
      }
      if (k === 'CMD' && g.mode === 'play') {
        big(13, 7, pad(R.combo, 3));
        text(9, 16, 'MISS LEFT ' + (R.lives >= 3 ? '^^^' : (R.lives === 2 ? '^^ ' : (R.lives === 1 ? '^  ' : '   '))));
        text(9, 18, 'LEVEL ' + (seqLen() - 2) + '  ' + seqLen() + ' KEYS');
      }
      if (k === 'END' && g.mode === 'play') {
        var bb = BANDS[R.band % BANDS.length], rr = R.rate | 0;
        text(8, 6, 'BAND ' + bb[0] + '-' + bb[1] + ' /S   NOW ' + pad(rr, 2));
        for (i = 0; i < 16; i++) put(8 + i, 14, art.t('BAR' + clamp(rr * 8 - i * 8, 0, 8)));
        text(8, 21, 'IN BAND ' + pad(Math.floor(R.inBand * 100 / Math.max(1, R.judged)), 3) + '%');
      }
    }
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = '  ' + g.msg;
    else if (g.mode === 'ready') line = '  GET READY... ' + (3 - Math.floor(g.t / 40));
    else if (k === 'CMD') line = '  DPAD + A B  IN ORDER';
    else if (k === 'ALT') line = '  A B A B ...';
    else line = '  A / B  TAP TAP TAP!';
    text(1, MSG_ROW, padR(line, 30));
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, R = g.run, q;
    function spr(x, y, tile, pal, fh) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh }); }
    function sixteen(x, y, name, pal) { for (var i = 0; i < 4; i++) spr(x + (i & 1) * 8, y + (i >> 1) * 8, art.s(name + i), pal); }
    if (g.mode === 'title') sixteen(28, titleRow(g.sel) * 8 - 5, 'BTN' + ((g.t >> 4) & 1) + '_', 0);
    if (R && (g.mode === 'play' || g.mode === 'ready')) {
      var down = R.pressT > 0;
      if (R.key === 'RAP') {
        sixteen(120, 140, 'BTN' + (down ? 1 : 0) + '_', 0);
        if (down) { spr(108, 140, art.s('HIT'), 2); spr(140, 140, art.s('HIT'), 2, true); }
      } else if (R.key === 'ALT') {
        var x = 16 + Math.min(200, R.count * 2);
        sixteen(x, 168, 'RUN' + (R.trip > 0 ? 0 : (R.count & 1)) + '_', R.trip > 0 ? 3 : 1);
        sixteen(120, 120, 'BTN' + (down ? 1 : 0) + '_', R.lastKey === 2 ? 1 : 0);
      } else if (R.key === 'END') {
        sixteen(120, 84, 'LAMP' + (R.inNow && (g.t & 8) ? 1 : 0) + '_', R.inNow ? 2 : 1);
        sixteen(120, 140, 'BTN' + (down ? 1 : 0) + '_', 0);
      }
    }
    if (R && g.mode === 'result' && R.key === 'RAP') {
      var ry = 200 - Math.min(150, (g.overT * 2 < R.count ? g.overT * 2 : R.count));
      sixteen(224, clamp(ry, 40, 200), 'ROCKET_', 3);
    }
    for (q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }

  /* ---------------- 主迴圈 ---------------- */
  function updatePlay() {
    var I = NES.Input, R = g.run;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (R.pressT > 0) R.pressT--;
    if (g.mode === 'ready') {
      if (g.t % 40 === 0 && g.t < 120) AU.sfx('mash_count');
      if (g.t >= 120) { AU.sfx('mash_go_sfx'); say('GO!', 30); beginPlay(); }
      return;
    }
    if (R.key === 'RAP') playRAP(I);
    else if (R.key === 'ALT') playALT(I);
    else if (R.key === 'CMD') playCMD(I);
    else playEND(I);
  }
  function doCheat() {
    var R = g.run;
    if (!R) return;
    R.cheated = true;
    if (g.mode === 'over') {
      R.continues++; R.lives = LIVES; R.combo = 0;
      g.mode = 'play'; g.paused = false;
      redraw(function () { drawField(); layout(); R.seq = null; newSeq(); hud(); });
      AU.play('mash_go'); say('CONTINUE! MISS LEFT 3', 50);
      return;
    }
    if (R.key === 'CMD') { R.lives = LIVES; if (R.seq) R.seqT = R.seqMax; }
    else R.time = Math.min(R.timeMax + 180, R.time + 180);
    say('STAR BOOST!', 40);
    AU.sfx('mash_lv');
  }

  /* ---------------- 機器人 ---------------- */
  function botMask() {
    var B = g.bot, R = g.run;
    B.t++;
    var m = inner();
    if (m && B.prev) m = 0;                 // 絕不連續兩幀按著（每次按 1 幀就放開）
    B.prev = m;
    return m;
    function inner() {
      if (g.mode === 'title') {
        var want = 2;
        if (CT.query && CT.query('mmode')) want = clamp((parseInt(CT.query('mmode'), 10) || 3) - 1, 0, 3);
        if (g.sel !== want) return (B.t % 10 === 0) ? BTN.DOWN : 0;
        return (B.t % 40 === 20) ? BTN.START : 0;
      }
      if (g.mode === 'over' || g.mode === 'result') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
      if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
      if (g.mode !== 'play' || !R) return 0;
      if (R.key === 'RAP') return (B.t % 5 === 0) ? BTN.A : 0;
      if (R.key === 'ALT') { if (B.t % 5) return 0; B.alt ^= 1; return B.alt ? BTN.A : BTN.B; }
      if (R.key === 'END') {
        var b = BANDS[R.band % BANDS.length], iv = Math.round(120 / (b[0] + b[1]));
        return (g.t % iv === 0) ? BTN.A : 0;
      }
      if (R.gap > 0 || R.seqAge < 14 || B.t - B.last < 7) return 0;
      B.last = B.t;
      return KEYBTN[R.seq[R.pos]];
    }
  }

  // 用過密技的那一局一律不算（達標後才用密技也撤銷）
  function goalOk() { return !!(g && g.goalRun && !g.goalRun.cheated); }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'mash', order: 8, title: '星塵連打', legacy: ['click-speed.html', 'speed-clicker.html', 'finger-frenzy.html', 'combo-storm.html'],
    init: function (nes) {
      nes0 = nes;
      art = MA.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'mash_bg');
      NES.CHR.setPattern(1, 'mash_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(PAL.bd);
      for (i = 0; i < 4; i++) { ppu.setBgPalette(i, PAL.bg[i]); ppu.setSprPalette(i, PAL.spr[i]); }
      GAME.backTile = { tile: art.s('DOT'), pal: 2 };
      AU.init(nes);
      g = newState();
      enterTitle();
      var qm = CT.query ? parseInt(CT.query('mmode') || '', 10) : NaN;
      if (qm >= 1 && qm <= MODES.length && CT.query('direct') === '1') { g.sel = qm - 1; startMode(qm - 1); }
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        var d = (I.pressed(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START))) ? 1 : (I.pressed(BTN.UP) ? -1 : 0);
        if (d) { selAttr(g.sel, 0); g.sel = (g.sel + d + MODES.length) % MODES.length; selAttr(g.sel, 3); AU.sfx('mash_move'); }
        if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) startMode(g.sel);
      } else if (g.mode === 'over' || g.mode === 'result') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') { if ((g.t & 31) === 0) text(11, 26, (g.t & 32) ? '          ' : 'PUSH START'); }
      else if (g.mode === 'play' || g.mode === 'ready') hud();
      flush();
      drawSprites();
    },
    state: function () {
      var R = g.run;
      return {
        mode: g.mode, sel: g.sel, paused: g.paused, t: g.t, edges: g.edges, queue: g.q.length + g.qa.length,
        run: R ? { key: R.key, count: R.count, time: R.time, combo: R.combo, maxCombo: R.maxCombo, lives: R.lives, score: R.score,
                   pos: R.pos, seq: R.seq ? R.seq.join('') : '', seqT: R.seqT, gap: R.gap, trips: R.trips, trip: R.trip,
                   rate: R.rate, band: R.band, inBand: R.inBand, judged: R.judged, grade: R.grade, cheated: R.cheated, continues: R.continues } : null,
        goal: goalOk()
      };
    },
    exit: function () { if (g && g.run && (g.mode === 'play' || g.mode === 'result' || g.mode === 'over')) saveRun(); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || g.mode === 'result' || !g.run) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return pad(Math.min(999, CT.load('mash', 'best', 0) | 0), 3) + 'HIT'; }
  };
  MA.MODES = MODES;
  MA.TITLES = TITLES;
  MA.BANDS = BANDS;
  MA.CMD_GOAL = CMD_GOAL;
  MA.dev = {
    g: function () { return g; }, start: function (m) { startMode(m); }, begin: function () { beginPlay(); },
    seqTime: function (len, combo) { var c = g.run.combo; g.run.combo = combo; var v = seqTime(len); g.run.combo = c; return v; },
    titleOf: titleOf, title: function () { enterTitle(); }, result: function () { enterResult(); }, bgTile: bgTile
  };
  if (CT.register) CT.register(GAME);
})();
