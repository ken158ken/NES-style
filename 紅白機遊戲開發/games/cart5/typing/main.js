/*
 * games/cart5/typing/main.js — 《星塵打字 STAR TYPER》（合輯卡帶五，id = typing，全域 CT.Typing）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/*、games/cart1/registry.js、typing/{dict,kbd,art,song}.js
 * 舊作概念：legacy speed-typing / speed-typing-challenge / typing-challenge / typing-speed（只取「打字速度、WPM、正確率、
 *           分級、限時」；字表 / 句子 / 畫面 / 配樂全原創）。
 *
 * 三個模式：
 *   METEOR RAIN  單字落下：隕石帶著單字往基地掉，打第一個字母就「鎖定」最低的那顆，打完整個字 = 雷射擊落。
 *                10 級（字長 3 → 8、落速 / 出現間隔遞增），每級擊落指定字數升級；5 面護盾，掉到基地 −1。
 *   SENTENCE RUN 句子計時：3 級 × 8 句原創句子，一回合 3 句；第一個鍵開始計時；WPM（5 字元 = 1 字）、正確率、評價。
 *                CASE：EASY 不分大小寫（預設，手把友善）/ EXACT 要按 SELECT 或 aA 鍵切大寫。
 *   TIME ATTACK  限時挑戰：60 秒、一次一個字、每打完一字 +1 秒；每 5 字升一階（字長 3 → 8），連擊加分。
 * 輸入：畫面 QWERTY 鍵盤（十字鍵一格一格：首延遲 12 幀、之後每 4 幀）+ A 打字、B 退格 / 解除鎖定、SELECT 換大小寫；
 *       桌機實體鍵盤可直接打（kbd.js Phys；Esc = 暫停）。下一個要打的鍵會亮金色（友善提示）。
 * 網址：`cart5.html?game=typing&debug=1[&bot=1][&lag=N][&seed=N][&mode=0..2][&lv=1..10]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TY = CT.Typing = CT.Typing || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var ID = 'typing';
  var FIELD_TOP = 4, FIELD_BOT = 15, IMPACT_ROW = 16, INPUT_ROW = 18;
  var SHIELDS = 5, READY_F = 120, BANNER_F = 90;
  // 單字落下 10 級：字長 / 每下降 1 列的幀數 / 出現間隔 / 同屏上限 / 升級字數
  var LEVELS = [
    null,
    { lens: [3], step: 64, spawn: 300, max: 2, quota: 6 },
    { lens: [3, 4], step: 60, spawn: 290, max: 2, quota: 7 },
    { lens: [4], step: 56, spawn: 280, max: 2, quota: 8 },
    { lens: [4, 5], step: 52, spawn: 270, max: 2, quota: 8 },
    { lens: [5], step: 48, spawn: 260, max: 2, quota: 9 },
    { lens: [5, 6], step: 44, spawn: 250, max: 3, quota: 9 },
    { lens: [6], step: 40, spawn: 240, max: 3, quota: 10 },
    { lens: [6, 7], step: 36, spawn: 230, max: 3, quota: 10 },
    { lens: [7, 8], step: 32, spawn: 220, max: 3, quota: 11 },
    { lens: [5, 6, 7, 8], step: 28, spawn: 200, max: 4, quota: 12 }
  ];
  var MODES = ['METEOR RAIN', 'SENTENCE RUN', 'TIME ATTACK'];
  var TA_TIME = 60 * 60, TA_BONUS = 60;
  // 評價門檻（WPM, ACC%）：手把 / 實體鍵盤分開
  var RANK_PAD = [[18, 97, 'S'], [13, 93, 'A'], [9, 88, 'B'], [5, 0, 'C']];
  var RANK_KEY = [[60, 97, 'S'], [45, 93, 'A'], [30, 88, 'B'], [15, 0, 'C']];
  var PAL_BG = [[0x0C, 0x1C, 0x30], [0x0C, 0x1C, 0x30], [0x0C, 0x1C, 0x28], [0x07, 0x17, 0x27]];
  var PAL_SPR = [[0x30, 0x28, 0x30], [0x06, 0x27, 0x38], [0x21, 0x31, 0x30], [0x28, 0x38, 0x30]];

  var A = null, Au = null, KB = null, S = null, Phys = null;
  var nes0 = null, ppu0 = null, g = null;

  /* ============================== 小工具 ============================== */
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function center(s, w) { s = String(s); var l = Math.floor((w - s.length) / 2); return pad(new Array(l + 1).join(' ') + s, w); }
  function mmss(f) { var sec = Math.max(0, Math.floor(f / 60)); return num(Math.min(99, Math.floor(sec / 60)), 2) + ':' + num(sec % 60, 2); }
  function rnd() { g.seed = (Math.imul(g.seed, 1103515245) + 12345) & 0x7FFFFFFF; return g.seed / 0x80000000; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function sfx(n) { Au.sfx(n); }
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  function text(c, r, s) { S.text(c, r, s, A.ch); }
  function dimText(c, r, s) { S.text(c, r, s, A.dim); }
  function starAt(c, r) { var h = Math.imul(c * 73856093 ^ r * 19349663, 2654435761) >>> 0; h = (h >>> 13) % 23; return h === 0 ? A.t('ST1') : (h === 1 ? A.t('ST2') : 0); }
  function wpmOf(chars, frames) { return frames > 0 ? Math.round(chars * 60 * 60.0988 / 5 / frames) : 0; }

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'title', game: 0, frames: 0, blink: 0, seed: 1, paused: false,
      sel: 0, startLv: 1, sLv: 1, caseExact: false, upper: false,
      cur: 'g', rep: new TY.Kbd.Repeat(), t: 0,
      // meteor
      lv: 1, score: 0, shields: SHIELDS, words: [], lock: -1, lvCount: 0, spawnT: 0, banner: 0, killed: 0, misses: 0, combo: 0,
      recent: [], fx: [], flash: 0, maxLv: 1, lastHitT: 0,
      // sentence
      sent: [], sIdx: 0, sPos: 0, sTime: 0, sRun: false, sChars: 0, sMiss: 0, sDone: 0, sMsg: 0,
      // time attack
      taT: 0, taWord: '', taNext: '', taPos: 0, taDone: 0, taScore: 0,
      // result
      result: null, endT: 0, over: false, cheats: 0, runCheats: 0, goalHit: false, keyUsed: 0, newBest: false,
      bot: { hist: [], tap: new TY.Kbd.Tapper(4, 4), wait: 0 }
    };
  }

  /* ============================== 流程 ============================== */
  function seedNow() {
    var q = parseInt((CT.query && CT.query('seed')) || '', 10);
    return (isFinite(q) && q > 0) ? q : ((Date.now() & 0x7FFFFFFF) || 7);
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false;
    Phys.setActive(false);
    refreshScreen();
    Au.stop(); Au.play('typing_title');
  }
  function toHelp() { g.mode = 'help'; g.t = 0; refreshScreen(); sfx('typing_ok'); }
  function startRun() {
    g.seed = seedNow();
    g.game = g.sel;
    g.paused = false; g.over = false; g.result = null; g.endT = 0; g.cheats = 0; g.runCheats = 0; g.keyUsed = Phys.used; g.newBest = false;
    g.upper = false; g.cur = 'g'; g.rep.reset();
    g.words = []; g.lock = -1; g.fx = []; g.flash = 0; g.recent = [];
    g.score = 0; g.killed = 0; g.misses = 0; g.combo = 0; g.banner = 0;
    if (g.game === 0) {
      g.lv = g.startLv; g.maxLv = g.lv; g.shields = SHIELDS; g.lvCount = 0; g.spawnT = LEVELS[g.lv].spawn - 60;
    } else if (g.game === 1) {
      var pool = TY.DICT.SENTENCES[g.sLv - 1].slice(), out = [];
      while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      g.sent = out; g.sIdx = 0; g.sPos = 0; g.sTime = 0; g.sRun = false; g.sChars = 0; g.sMiss = 0; g.sDone = 0; g.sMsg = 0;
    } else {
      g.taT = TA_TIME; g.taDone = 0; g.taScore = 0; g.taPos = 0;
      g.taWord = taPick(); g.taNext = taPick();
    }
    g.mode = 'ready'; g.t = 0;
    refreshScreen();
    Au.stop(); Au.play(g.game === 0 ? 'typing_meteor' : 'typing_calm');
    Phys.setActive(true, ID);
  }
  function refreshScreen() { CT.blank(nes0, function () { S.reset(); blankAll(); render(); S.flush(ppu0, true); }); }
  function blankAll() {
    ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    ppu0.setBackdrop(0x0F);
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  function typingActive() { return (g.mode === 'play' || g.mode === 'ready') && !g.paused; }
  function setPause(on) {
    if (g.paused === on) return;
    g.paused = on;
    if (on) Au.pause(); else if (!Au.resume()) Au.play(g.game === 0 ? 'typing_meteor' : 'typing_calm');
    Phys.setActive(typingActive(), ID);
    sfx('typing_menu');
  }

  /* ---------- 單字落下 ---------- */
  function spawnWord() {
    var L = LEVELS[g.lv], pool = TY.DICT.pool(L.lens), firsts = {}, i, w = null, tries = 0;
    for (i = 0; i < g.words.length; i++) firsts[g.words[i].t.charAt(0)] = 1;
    while (tries++ < 60) {
      var c = pick(pool);
      if (firsts[c.charAt(0)] || g.recent.indexOf(c) >= 0) continue;
      w = c; break;
    }
    if (!w) return false;
    g.recent.push(w); if (g.recent.length > 12) g.recent.shift();
    var col = 2 + Math.floor(rnd() * (29 - w.length));
    g.words.push({ t: w, col: col, row: FIELD_TOP, typed: 0, timer: 0 });
    return true;
  }
  function lowestStarting(ch) {
    var best = -1, i;
    for (i = 0; i < g.words.length; i++) {
      var w = g.words[i];
      if (w.t.charAt(0) !== ch) continue;
      if (best < 0 || w.row > g.words[best].row || (w.row === g.words[best].row && w.timer > g.words[best].timer)) best = i;
    }
    return best;
  }
  function meteorChar(ch) {
    ch = ch.toLowerCase();
    if (ch < 'a' || ch > 'z') { miss(); return; }
    if (g.lock < 0) {
      var i = lowestStarting(ch);
      if (i < 0) { miss(); return; }
      g.lock = i; g.words[i].typed = 1; sfx('typing_key');
    } else {
      var w = g.words[g.lock];
      if (w.t.charAt(w.typed) !== ch) { miss(); return; }
      w.typed++; sfx('typing_key');
    }
    var lw = g.words[g.lock];
    if (lw.typed >= lw.t.length) destroy(g.lock);
  }
  function miss() { g.misses++; g.combo = 0; sfx('typing_miss'); }
  function destroy(i) {
    var w = g.words[i];
    g.combo++;
    g.score += w.t.length * 10 * g.lv + Math.min(20, g.combo) * 5;
    g.killed++; g.lvCount++;
    g.fx.push({ kind: 'zap', x: (w.col + (w.t.length >> 1)) * 8, y: w.row * 8, t: 14 });
    g.words.splice(i, 1);
    g.lock = -1;
    sfx('typing_zap');
    if (g.lvCount >= LEVELS[g.lv].quota) levelUp();
  }
  function levelUp() {
    if (g.lv >= 10) { finish(true); return; }
    g.lv++; g.lvCount = 0; g.banner = BANNER_F; g.spawnT = 0;
    if (g.lv > g.maxLv) g.maxLv = g.lv;
    if (g.runCheats === 0 && g.startLv === 1 && g.lv >= 5) g.goalHit = true;
    if (g.lv > CT.load(ID, 'lv', 1)) CT.save(ID, 'lv', g.lv);
    sfx('typing_lv');
  }
  function updateMeteor() {
    var L = LEVELS[g.lv], i;
    if (g.banner > 0) g.banner--;
    else {
      g.spawnT++;
      if ((g.spawnT >= L.spawn && g.words.length < L.max) || (g.words.length === 0 && g.spawnT >= 45)) { if (spawnWord()) g.spawnT = 0; }
    }
    for (i = g.words.length - 1; i >= 0; i--) {
      var w = g.words[i];
      if (++w.timer >= L.step) {
        w.timer = 0; w.row++;
        if (w.row >= IMPACT_ROW) {
          g.fx.push({ kind: 'hit', x: (w.col + (w.t.length >> 1)) * 8, y: IMPACT_ROW * 8 - 4, t: 20 });
          g.words.splice(i, 1);
          if (g.lock === i) g.lock = -1; else if (g.lock > i) g.lock--;
          g.shields--; g.combo = 0; g.flash = 8; g.lastHitT = g.frames;
          sfx('typing_hit');
          if (g.shields <= 0) { finish(false); return; }
        }
      }
    }
  }

  /* ---------- 句子計時 ---------- */
  function curSentence() { return g.sent[g.sIdx] || ''; }
  function caseEq(a, b) { return g.caseExact ? a === b : a.toLowerCase() === b.toLowerCase(); }
  function sentenceChar(ch) {
    if (g.sMsg > 0) return;
    var s = curSentence(), want = s.charAt(g.sPos);
    if (!g.sRun) g.sRun = true;
    if (ch === '\b') { sfx('typing_del'); return; }
    if (caseEq(ch, want)) {
      g.sPos++; g.sChars++; sfx('typing_key');
      if (g.sPos >= s.length) {
        g.sDone++;
        if (g.sIdx >= g.sent.length - 1) { finish(true); return; }
        g.sMsg = 70; sfx('typing_ok');
      }
    } else { g.sMiss++; sfx('typing_miss'); }
  }
  function updateSentence() {
    if (g.sMsg > 0) { if (--g.sMsg === 0) { g.sIdx++; g.sPos = 0; } return; }
    if (g.sRun) g.sTime++;
  }

  /* ---------- 限時挑戰 ---------- */
  function taPick() {
    var tier = Math.min(4, Math.floor(g.taDone / 5)), pool = TY.DICT.T[tier], w, tries = 0;
    do { w = pick(pool); } while ((w === g.taWord || w === g.taNext || g.recent.indexOf(w) >= 0) && tries++ < 30);
    g.recent.push(w); if (g.recent.length > 12) g.recent.shift();
    return w;
  }
  function taChar(ch) {
    if (ch === '\b') { sfx('typing_del'); return; }
    if (ch.toLowerCase() === g.taWord.charAt(g.taPos)) {
      g.taPos++; sfx('typing_key');
      if (g.taPos >= g.taWord.length) {
        g.combo++; g.taDone++;
        g.taScore += g.taWord.length * 10 + Math.min(20, g.combo) * 5;
        g.taT += TA_BONUS; g.taPos = 0;
        g.taWord = g.taNext; g.taNext = taPick();
        g.fx.push({ kind: 'plus', t: 40 });
        sfx('typing_zap');
      }
    } else { g.misses++; g.combo = 0; sfx('typing_miss'); }
  }

  /* ---------- 結算 ---------- */
  function rankOf(wpm, acc, key) {
    var T = key ? RANK_KEY : RANK_PAD;
    for (var i = 0; i < T.length; i++) if (wpm >= T[i][0] && acc >= T[i][1]) return T[i][2];
    return 'D';
  }
  function finish(clear) {
    g.mode = 'result'; g.endT = 0; g.over = !clear; g.paused = false; g.lock = -1;
    Phys.setActive(false);
    var key = Phys.used > g.keyUsed, r = { clear: clear, key: key };
    if (g.game === 0) {
      r.title = clear ? 'ALL CLEAR!' : 'BASE DOWN';
      r.lines = ['LEVEL ' + num(g.lv, 2) + '   SCORE ' + num(g.score, 6), 'WORDS ' + num(g.killed, 3) + '   MISS ' + num(g.misses, 3)];
      if (g.runCheats === 0) saveBest(g.score);
      r.best = 'BEST ' + num(CT.load(ID, 'best', 0), 6);
    } else if (g.game === 1) {
      var acc = g.sChars + g.sMiss > 0 ? Math.floor(g.sChars * 100 / (g.sChars + g.sMiss)) : 100, wpm = wpmOf(g.sChars, g.sTime);
      r.wpm = wpm; r.acc = acc; r.rank = rankOf(wpm, acc, key);
      r.title = key ? 'FINISH! KEY' : 'FINISH! PAD';
      r.lines = ['TIME ' + mmss(g.sTime) + '   WPM ' + num(wpm, 3), 'ACC ' + num(acc, 3) + '%   MISS ' + num(g.sMiss, 3)];
      var bk = key ? 'wpm_key' : 'wpm_pad';
      if (g.runCheats === 0 && wpm > CT.load(ID, bk, 0)) { CT.save(ID, bk, wpm); g.newBest = true; }
      r.best = (key ? 'KEYBOARD' : 'PAD') + ' BEST ' + num(CT.load(ID, bk, 0), 3) + ' WPM';
    } else {
      r.title = 'TIME UP!';
      r.lines = ['WORDS ' + num(g.taDone, 3) + '   SCORE ' + num(g.taScore, 6), 'MISS ' + num(g.misses, 3)];
      if (g.runCheats === 0 && g.taScore > CT.load(ID, 'ta', 0)) { CT.save(ID, 'ta', g.taScore); g.newBest = true; }
      r.best = 'BEST ' + num(CT.load(ID, 'ta', 0), 6);
    }
    g.result = r;
    Au.stop(); Au.play(clear || g.game !== 0 ? 'typing_clear' : 'typing_over');
  }
  function saveBest(sc) {
    if (sc > CT.load(ID, 'best', 0)) { CT.save(ID, 'best', sc); g.newBest = true; }
  }

  /* ============================== 輸入 ============================== */
  function keyChar(k) {
    if (k.ch) { var c = k.ch; if (g.upper && c >= 'a' && c <= 'z') c = c.toUpperCase(); return c; }
    if (k.id === 'space') return ' ';
    if (k.id === 'del') return '\b';
    return null;
  }
  function toggleCase() { g.upper = !g.upper; sfx('typing_case'); }
  function feed(ch) {
    if (g.mode !== 'play') return;
    if (g.game === 0) { if (ch === '\b') { if (g.lock >= 0) { g.words[g.lock].typed = 0; g.lock = -1; sfx('typing_del'); } return; } if (ch === ' ') return; meteorChar(ch); }
    else if (g.game === 1) sentenceChar(ch);
    else { if (ch === ' ') return; taChar(ch); }
  }
  function updateInput() {
    var d = g.rep.step();
    if (d) { var nk = KB.move(KB.byId[g.cur], d); if (nk) { g.cur = nk.id; sfx('typing_move'); } }
    if (pressed(BTN.SELECT) && !held(BTN.START)) toggleCase();
    if (pressed(BTN.B)) feed('\b');
    if (pressed(BTN.A)) {
      var k = KB.byId[g.cur];
      if (k.id === 'shift') toggleCase();
      else { var c = keyChar(k); if (c !== null) feed(c); }
    }
  }
  function physInput() {
    Phys.tick();
    var q = Phys.drain(), i;
    for (i = 0; i < q.length; i++) {
      var c = q[i];
      if (c === '\x1b') { if (g.mode === 'play') setPause(!g.paused); continue; }
      if (c === '\n') continue;
      if (g.mode === 'play' && !g.paused) feed(c);
    }
  }

  /* ============================== update ============================== */
  function update() {
    g.frames++; g.blink++;
    if (g.flash > 0) g.flash--;
    for (var i = g.fx.length - 1; i >= 0; i--) if (--g.fx[i].t <= 0) g.fx.splice(i, 1);
    if (g.mode === 'title') return updateTitle();
    if (g.mode === 'help') {
      g.t++;
      if (g.t > 10 && (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT)))) startRun();
      else if (pressed(BTN.B)) { g.mode = 'title'; refreshScreen(); sfx('typing_menu'); }
      return;
    }
    if (g.mode === 'result') {
      g.endT++;
      if (g.endT > 40) {
        if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) { if (g.over) toTitle(); else startRun(); }
        else if (pressed(BTN.B)) toTitle();
      }
      return;
    }
    physInput();
    if (pressed(BTN.START) && !held(BTN.SELECT) && g.mode === 'play') setPause(!g.paused);
    if (g.paused) return;
    if (g.mode === 'ready') {
      updateInput();
      if (++g.t >= READY_F) { g.mode = 'play'; g.t = 0; }
      return;
    }
    updateInput();
    if (g.mode !== 'play') return;
    if (g.game === 0) updateMeteor();
    else if (g.game === 1) updateSentence();
    else { if (--g.taT <= 0) { g.taT = 0; finish(true); } }
  }
  function updateTitle() {
    if (pressed(BTN.UP)) { g.sel = (g.sel + 2) % 3; sfx('typing_menu'); }
    if (pressed(BTN.DOWN)) { g.sel = (g.sel + 1) % 3; sfx('typing_menu'); }
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0);
    if (d) {
      if (g.sel === 0) { var mx = Math.max(1, Math.min(10, CT.load(ID, 'lv', 1))); g.startLv = ((g.startLv - 1 + d + mx) % mx) + 1; }
      else if (g.sel === 1) g.sLv = ((g.sLv - 1 + d + 3) % 3) + 1;
      sfx('typing_menu');
    }
    if (pressed(BTN.SELECT) && !held(BTN.START) && g.sel === 1) { g.caseExact = !g.caseExact; sfx('typing_menu'); }
    if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) toHelp();
  }

  /* ============================== 畫面 ============================== */
  function render() {
    if (g.mode === 'title') return renderTitle();
    if (g.mode === 'help') return renderHelp();
    renderPlay();
  }
  function bigText(c, r, s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      for (var j = 0; j < 4; j++) S.put(c + i * 2 + (j & 1), r + (j >> 1), A.t('BIG_' + ch + j));
    }
  }
  function box(c0, r0, c1, r1) {
    var c, r;
    S.put(c0, r0, A.t('BOX_TL')); S.put(c1, r0, A.t('BOX_TR')); S.put(c0, r1, A.t('BOX_BL')); S.put(c1, r1, A.t('BOX_BR'));
    for (c = c0 + 1; c < c1; c++) { S.put(c, r0, A.t('BOX_T')); S.put(c, r1, A.t('BOX_B')); }
    for (r = r0 + 1; r < r1; r++) { S.put(c0, r, A.t('BOX_L')); S.put(c1, r, A.t('BOX_R')); }
  }
  function clearRows(r0, r1, stars) {
    for (var r = r0; r <= r1; r++) for (var c = 0; c < 32; c++) S.put(c, r, stars ? starAt(c, r) : 0);
  }
  function attrRows(by0, by1, p) { for (var by = by0; by <= by1; by++) for (var bx = 0; bx < 16; bx++) S.putA(bx, by, p); }

  function renderTitle() {
    clearRows(0, 29, true);
    attrRows(0, 14, 0);
    bigText(6, 3, 'STAR TYPER');
    attrRows(1, 2, 2);
    text(5, 6, 'TYPE THE STARDUST AWAY');
    for (var i = 0; i < 3; i++) {
      S.put(7, 9 + i * 2, g.sel === i ? A.ch('>') : 0);
      text(9, 9 + i * 2, MODES[i]);
    }
    var o1 = '', o2 = '', best = '';
    if (g.sel === 0) { o1 = '< START LV ' + num(g.startLv, 2) + ' >'; o2 = '10 LEVELS  5 SHIELDS'; best = 'BEST ' + num(CT.load(ID, 'best', 0), 6) + '  MAX LV ' + num(CT.load(ID, 'lv', 1), 2); }
    else if (g.sel === 1) { o1 = '< LEVEL ' + g.sLv + ' >'; o2 = 'SELECT: CASE ' + (g.caseExact ? 'EXACT' : 'EASY '); best = 'BEST WPM PAD ' + num(CT.load(ID, 'wpm_pad', 0), 3) + ' KEY ' + num(CT.load(ID, 'wpm_key', 0), 3); }
    else { o1 = '60 SEC  +1 SEC PER WORD'; o2 = 'WORDS GROW LONGER'; best = 'BEST ' + num(CT.load(ID, 'ta', 0), 6); }
    text(2, 16, center(o1, 28)); text(2, 18, center(o2, 28)); text(2, 20, center(best, 28));
    attrRows(10, 10, 2);
    text(2, 23, center('A/START: GO   C/$ = CHEAT', 28));
    text(2, 25, center('HOLD START+SELECT: MENU', 28));
    text(2, 27, (g.blink >> 5) & 1 ? center('PC: TYPE ON YOUR KEYBOARD', 28) : center('PUSH START', 28));
  }
  var HELP = [
    ['METEOR RAIN', ['WORDS FALL TOWARD THE BASE.', 'TYPE A WORD TO BLAST IT.', 'THE FIRST LETTER LOCKS ON', 'TO THE LOWEST MATCHING WORD.']],
    ['SENTENCE RUN', ['TYPE 3 SENTENCES. THE CLOCK', 'STARTS ON YOUR FIRST KEY.', 'WPM = 5 LETTERS PER WORD.', 'A WRONG KEY COUNTS AS MISS.']],
    ['TIME ATTACK', ['60 SECONDS ON THE CLOCK.', 'EACH WORD GIVES +1 SECOND.', 'EVERY 5 WORDS THEY GROW.', 'NO MISS = COMBO BONUS.']]
  ];
  function renderHelp() {
    clearRows(0, 29, false);
    attrRows(0, 14, 0);
    attrRows(1, 1, 2);
    var H = HELP[g.sel];
    text(2, 3, center(H[0], 28));
    for (var i = 0; i < H[1].length; i++) text(2, 5 + i * 2, pad(H[1][i], 28));
    text(2, 14, 'D-PAD MOVE    A TYPE KEY');
    text(2, 16, 'B ' + pad(g.sel === 0 ? 'UNLOCK' : 'BACKSPACE', 12) + 'SELECT aA');
    text(2, 18, 'START PAUSE   C/$ = CHEAT');
    text(2, 20, 'PC: JUST TYPE  ESC PAUSE');
    text(2, 22, 'PC CHEAT: PAUSE, THEN C');
    text(2, 24, 'HOLD START+SELECT: MENU');
    attrRows(13, 13, 2);
    text(2, 27, center('A START    B BACK', 28));
  }

  function hintChar() {
    if (g.mode !== 'play' || g.paused) return null;
    if (g.game === 0) return g.lock >= 0 ? g.words[g.lock].t.charAt(g.words[g.lock].typed) : null;
    if (g.game === 1) return g.sMsg > 0 ? null : curSentence().charAt(g.sPos);
    return g.taWord.charAt(g.taPos);
  }
  function hintKey() {
    var ch = hintChar();
    if (ch === null || ch === '') return null;
    if (ch === ' ') return 'space';
    var lo = ch.toLowerCase();
    if (g.game === 1 && g.caseExact && /[A-Za-z]/.test(ch) && (ch !== lo) !== g.upper) return 'shift';
    return KB.byId[lo] ? lo : null;
  }
  function renderKeyboard() {
    KB.paint(S.put, A.key, A.t, g.upper);
    attrRows(9, 9, 0);
    attrRows(10, 13, 1);
    var hk = hintKey();
    if (hk) { var k = KB.byId[hk]; for (var t = 0; t < k.w; t++) S.putA((k.c + t) >> 1, k.r >> 1, 2); }
    text(2, 28, pad(g.game === 0 ? 'B UNLOCK  SEL aA  START PAUSE' : 'B DEL  SEL aA  START PAUSE', 29));
  }
  function renderPlay() {
    attrRows(0, 7, 0); attrRows(8, 8, 3);
    clearRows(0, 1, false);
    clearRows(3, 3, false);
    for (var c = 0; c < 32; c++) S.put(c, 3, A.t('HL'));
    if (g.game === 0) renderMeteor();
    else if (g.game === 1) renderSentence();
    else renderTA();
    // 基地
    for (c = 0; c < 32; c++) { S.put(c, IMPACT_ROW, g.game === 0 ? 0 : 0); S.put(c, IMPACT_ROW + 1, A.t('GR')); }
    if (g.game === 0) { S.put(14, IMPACT_ROW, A.t('DM_L')); S.put(15, IMPACT_ROW, A.t('DM_M')); S.put(16, IMPACT_ROW, A.t('DM_M')); S.put(17, IMPACT_ROW, A.t('DM_R')); }
    // 輸入列
    if (g.game === 0) {
      text(2, INPUT_ROW, '> ');
      if (g.lock >= 0) {
        var w = g.words[g.lock];
        for (var i = 0; i < 12; i++) {
          var ch = w.t.charAt(i);
          S.put(4 + i, INPUT_ROW, !ch ? 0 : (i < w.typed ? A.dim(ch) : A.ch(ch)));
        }
      } else text(4, INPUT_ROW, pad('', 12));
    } else {
      text(2, INPUT_ROW, pad(g.game === 1 ? 'CASE ' + (g.caseExact ? 'EXACT' : 'EASY') : 'TYPE THE WORD', 16));
    }
    text(18, INPUT_ROW, pad('', 7));
    text(26, INPUT_ROW, g.upper ? 'ABC' : 'abc');
    renderKeyboard();
    if (g.paused) renderPause();
    else if (g.mode === 'result') renderResult();
    else if (g.mode === 'ready') {
      var n = 3 - Math.floor(g.t * 3 / READY_F);
      text(2, 9, center('READY', 28)); text(2, 11, center(String(Math.max(1, n)), 28));
    }
  }
  function renderMeteor() {
    text(2, 2, 'LV' + num(g.lv, 2));
    text(7, 2, 'SCORE ' + num(g.score, 6));
    var sh = '';
    for (var i = 0; i < SHIELDS; i++) sh += i < g.shields ? '^' : '-';
    text(21, 2, 'SH ' + sh);
    clearRows(FIELD_TOP, FIELD_BOT, true);
    for (i = 0; i < g.words.length; i++) {
      var w = g.words[i];
      for (var j = 0; j < w.t.length; j++) S.put(w.col + j, w.row, j < w.typed ? A.dim(w.t.charAt(j)) : A.ch(w.t.charAt(j)));
    }
    if (g.banner > 0 && g.mode === 'play') text(2, 9, center('LEVEL ' + num(g.lv, 2), 28));
    else if (g.mode === 'play' && g.words.length === 0 && g.killed === 0 && g.misses === 0) text(2, 9, center('INCOMING!', 28));
  }
  // 句子換行：每行 ≤ 27 字元（行尾空白算在那一行），回傳 [{s, p}]（p = 該行第一個字元在句子中的位置）
  function wrapLines(s) {
    var out = [], p = 0;
    while (p < s.length) {
      var end = Math.min(s.length, p + 27);
      if (end < s.length) { var sp = s.lastIndexOf(' ', end - 1); if (sp > p) end = sp + 1; }
      out.push({ s: s.substring(p, end), p: p });
      p = end;
    }
    return out;
  }
  function renderSentence() {
    text(2, 2, 'SENTENCE ' + Math.min(3, g.sIdx + 1) + '/3  LV' + g.sLv);
    text(21, 2, 'TIME ' + mmss(g.sTime));
    clearRows(FIELD_TOP, FIELD_BOT, false);
    box(1, 4, 30, 12);
    var L = wrapLines(curSentence()), i, j;
    for (i = 0; i < L.length && i < 3; i++) {
      for (j = 0; j < L[i].s.length; j++) {
        var p = L[i].p + j, ch = L[i].s.charAt(j);
        S.put(3 + j, 6 + i * 2, p < g.sPos ? A.dim(ch) : A.ch(ch));
      }
    }
    var acc = g.sChars + g.sMiss > 0 ? Math.floor(g.sChars * 100 / (g.sChars + g.sMiss)) : 100;
    text(2, 14, 'WPM ' + (g.sTime >= 60 ? num(wpmOf(g.sChars, g.sTime), 3) : '---') + '  ACC ' + num(acc, 3) + '%  MISS ' + num(g.sMiss, 2));
    if (g.sMsg > 0) text(9, 12, ' NICE! NEXT ');
  }
  function caretPos() {
    if (g.game === 1) {
      var L = wrapLines(curSentence());
      for (var i = 0; i < L.length; i++) if (g.sPos < L[i].p + L[i].s.length || i === L.length - 1) return { x: (3 + Math.min(L[i].s.length, g.sPos - L[i].p)) * 8, y: (6 + i * 2) * 8 + 1 };
    }
    if (g.game === 2) return { x: (Math.floor((32 - g.taWord.length) / 2) + g.taPos) * 8, y: 9 * 8 + 1 };
    if (g.game === 0 && g.lock >= 0) { var w = g.words[g.lock]; return { x: (w.col + w.typed) * 8, y: w.row * 8 + 1 }; }
    return null;
  }
  function renderTA() {
    text(2, 2, 'TIME ' + num(Math.ceil(g.taT / 60), 2));
    text(11, 2, 'SCORE ' + num(g.taScore, 6));
    text(25, 2, 'W' + num(g.taDone, 3));
    clearRows(FIELD_TOP, FIELD_BOT, true);
    var w = g.taWord, c0 = Math.floor((32 - w.length) / 2), i;
    box(c0 - 2, 7, c0 + w.length + 1, 11);
    for (i = c0 - 1; i <= c0 + w.length; i++) { S.put(i, 8, 0); S.put(i, 9, 0); S.put(i, 10, 0); }
    for (i = 0; i < w.length; i++) S.put(c0 + i, 9, i < g.taPos ? A.dim(w.charAt(i)) : A.ch(w.charAt(i)));
    text(2, 13, center('NEXT  ' + g.taNext, 28));
    text(2, 15, center('COMBO ' + num(g.combo, 2) + '   TIER ' + (Math.min(4, Math.floor(g.taDone / 5)) + 1), 28));
    var plus = false;
    for (i = 0; i < g.fx.length; i++) if (g.fx[i].kind === 'plus') plus = true;
    if (plus) text(22, 5, '+1 SEC');
  }
  function renderPause() {
    clearRows(FIELD_TOP, FIELD_BOT, false);
    box(3, 5, 28, 14);
    text(4, 7, center('PAUSE', 24));
    text(4, 9, center('HOLD START+SELECT: MENU', 24));
    text(4, 11, center('C/$ = CHEAT', 24));
    text(4, 13, center('START OR ESC: RESUME', 24));
  }
  function renderResult() {
    var r = g.result;
    clearRows(FIELD_TOP, FIELD_BOT, false);
    box(1, 4, 30, 15);
    text(2, 5, center(r.rank ? r.title + '  RANK ' + r.rank : r.title, 28));
    text(2, 7, center(r.lines[0], 28));
    text(2, 9, center(r.lines[1], 28));
    text(2, 11, center(r.best + (g.newBest ? ' NEW!' : ''), 28));
    text(2, 13, center(g.over ? 'C/$ CONTINUE LV' + num(g.lv, 2) + '  A TITLE' : 'A AGAIN    B TITLE', 28));
  }

  function drawSprites() {
    var slot = 0, i;
    function spr(x, y, name, pal, fh) { if (slot < 60) ppu0.sprite(slot++, { x: x, y: y, tile: A.s(name), pal: pal, flipH: !!fh }); }
    var inPlay = g.mode === 'play' || g.mode === 'ready';
    if (inPlay && !g.paused) {
      if (g.game === 0) {
        for (i = 0; i < g.words.length; i++) {
          var w = g.words[i];
          spr((w.col - 1) * 8, w.row * 8, ((g.frames >> 3) + i) & 1 ? 'MT1' : 'MT0', 1);
        }
      }
      var cp = caretPos();
      if (cp && ((g.frames >> 4) & 1) === 0) spr(cp.x, cp.y, 'CR', 3);
      var k = KB.byId[g.cur], cs = KB.corners(k), names = ['CTL', 'CTR', 'CBL', 'CBR'];
      for (i = 0; i < 4; i++) spr(cs[i][0], cs[i][1], names[i], 0);
      for (i = 0; i < g.fx.length; i++) {
        var f = g.fx[i];
        if (f.kind === 'zap') {
          // 雷射：基地圓頂 → 目標，每 8 線一顆（每線 1）
          var x0 = 124, y0 = IMPACT_ROW * 8 - 8, n = Math.max(1, Math.floor((y0 - f.y) / 8));
          if (f.t > 6) for (var j = 0; j < n; j++) spr(x0 + Math.round((f.x - x0) * (j + 1) / (n + 1)), y0 - (j + 1) * 8, 'LZ', 2);
          spr(f.x - 8, f.y, f.t & 2 ? 'EX1' : 'EX0', 1); spr(f.x + 4, f.y, f.t & 2 ? 'EX0' : 'EX1', 2);
        } else if (f.kind === 'hit') { spr(f.x - 4, f.y, f.t & 4 ? 'HIT' : 'EX1', 1); }
      }
    }
    for (i = slot; i < 62; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：只讀畫面上的字 + 人類節奏（反應延遲 lag 幀、每鍵按 4 放 4） ============================== */
  function observe() {
    var out = [];
    if (g.mode === 'play' && g.game === 0) for (var i = 0; i < g.words.length; i++) out.push({ t: g.words[i].t, row: g.words[i].row });
    var b = g.bot;
    b.hist.push(out);
    if (b.hist.length > 64) b.hist.shift();
  }
  function botLag() { var q = parseInt((CT.query && CT.query('lag')) || '', 10); return isFinite(q) && q >= 0 ? Math.min(60, q) : 15; }
  function bot() {
    var b = g.bot;
    observe();
    if (b.tap.busy()) return b.tap.tick();
    if (b.wait > 0) { b.wait--; return 0; }
    var m = botDecide();
    if (m) { b.tap.tap(m); return b.tap.tick(); }
    return 0;
  }
  function stepToward(id) {
    var p = KB.path(g.cur, id);
    return p.length ? p[0] : BTN.A;
  }
  function botDecide() {
    var b = g.bot;
    if (g.mode === 'title') {
      if (g.sel !== 0) return BTN.UP;
      if (g.startLv !== 1) return BTN.LEFT;
      b.wait = 20; return BTN.A;
    }
    if (g.mode === 'help') { if (g.t < 40) return 0; b.wait = 10; return BTN.A; }
    if (g.mode === 'result') { if (g.endT < 60) return 0; return BTN.A; }
    if (g.paused) return BTN.START;
    if (g.mode !== 'play' || g.game !== 0) return 0;
    if (g.upper) return BTN.SELECT;
    var lag = botLag(), snap = b.hist[Math.max(0, b.hist.length - 1 - lag)] || [];
    var target = null;
    if (g.lock >= 0) { var w = g.words[g.lock]; target = w.t.charAt(w.typed); }
    else {
      var best = null;
      for (var i = 0; i < snap.length; i++) {
        var still = false;
        for (var j = 0; j < g.words.length; j++) if (g.words[j].t === snap[i].t) still = true;
        if (still && (!best || snap[i].row > best.row)) best = snap[i];
      }
      if (best) target = best.t.charAt(0);
    }
    if (!target) return 0;
    return stepToward(target);
  }

  /* ============================== 密技 ============================== */
  // 遊玩 / 暫停中：METEOR = 全部擊落 + 護盾補滿；SENTENCE = 自動打完目前這個字；TIME = +15 秒。
  // METEOR 結算（基地失守）= 原地續關：同一級、護盾補滿、分數保留。標題 / 說明 / 倒數無效。用過那局 goal false。
  function cheat() {
    if (!g) return false;
    if (g.mode === 'result') {
      if (!g.over || g.game !== 0) return false;
      g.cheats++; g.runCheats++;
      g.mode = 'play'; g.over = false; g.result = null; g.shields = SHIELDS; g.words = []; g.lock = -1; g.spawnT = 0; g.banner = BANNER_F;
      refreshScreen();
      Au.stop(); Au.play('typing_meteor');
      Phys.setActive(true, ID);
      sfx('typing_lv');
      return true;
    }
    if (g.mode !== 'play') return false;
    g.cheats++; g.runCheats++;
    if (g.game === 0) {
      while (g.words.length) { g.lock = 0; g.words[0].typed = g.words[0].t.length; destroy(0); if (g.mode !== 'play') break; }
      g.shields = SHIELDS;
    } else if (g.game === 1) {
      var s = curSentence();
      while (g.sPos < s.length && s.charAt(g.sPos) !== ' ' && g.mode === 'play' && g.sMsg === 0) sentenceChar(s.charAt(g.sPos));
      if (g.mode === 'play' && g.sMsg === 0 && s.charAt(g.sPos) === ' ') sentenceChar(' ');
    } else g.taT += 15 * 60;
    if (g.paused) setPause(false);
    sfx('typing_lv');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: ID, order: 5, title: '星塵打字',
    legacy: ['speed-typing.html', 'speed-typing-challenge.html', 'typing-challenge.html', 'typing-speed.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = TY.Art.make(); Au = TY.Audio; KB = A.kb; Phys = TY.Kbd.Phys;
      S = TY.Kbd.Shadow(140); S.nes = nes;
      NES.CHR.setPattern(0, 'typing_bg');
      NES.CHR.setPattern(1, 'typing_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10); if (mq >= 0 && mq <= 2) g.sel = mq;
      var lq = parseInt(q('lv') || '', 10); if (lq >= 1 && lq <= 10) { g.startLv = lq; }
      CT.blank(nes, function () { S.reset(); blankAll(); render(); S.flush(ppu0, true); });
      Au.play('typing_title');
    },
    update: function (nes) { update(); Au.tick(); },
    draw: function (nes) {
      render();
      if (g.flash > 0) ppu0.setBackdrop(g.flash & 2 ? 0x16 : 0x0F); else ppu0.setBackdrop(0x0F);
      S.flush(ppu0, false);
      drawSprites();
    },
    exit: function (nes) {
      Phys.setActive(false);
      if (g && g.game === 0 && (g.mode === 'play' || g.mode === 'ready') && g.runCheats === 0) saveBest(g.score);
      Au.stop();
    },
    get backTile() { if (!A) A = TY.Art.make(); return { tile: A.s('DOT'), pal: 3 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, game: g.game, sel: g.sel, paused: g.paused, startLv: g.startLv, sLv: g.sLv, caseExact: g.caseExact, upper: g.upper,
        cur: g.cur, lv: g.lv, maxLv: g.maxLv, score: g.score, shields: g.shields, killed: g.killed, misses: g.misses, combo: g.combo,
        lvCount: g.lvCount, banner: g.banner, lock: g.lock,
        words: g.words.map(function (w) { return { t: w.t, col: w.col, row: w.row, typed: w.typed }; }),
        sent: g.sent.slice(), sIdx: g.sIdx, sPos: g.sPos, sTime: g.sTime, sChars: g.sChars, sMiss: g.sMiss, sMsg: g.sMsg,
        taT: g.taT, taWord: g.taWord, taNext: g.taNext, taPos: g.taPos, taDone: g.taDone, taScore: g.taScore,
        result: g.result, over: g.over, cheats: g.cheats, runCheats: g.runCheats, goal: GAME.goal(), hint: hintKey(),
        music: Au.current, lastSfx: Au.lastSfx, queue: S.pending(), ntPeak: S.peak, frames: g.frames, t: g.t,
        phys: { active: Phys.active, remapped: Phys.remapped, used: Phys.used }, tiles: A.count
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goalHit); },
    bestText: function () { return num(CT.load(ID, 'best', 0), 6); }
  };

  TY.dev = {
    start: function (mode, opt) {
      opt = opt || {};
      g.sel = mode; if (opt.lv) g.startLv = opt.lv; if (opt.sLv) g.sLv = opt.sLv; if (opt.exact !== undefined) g.caseExact = !!opt.exact;
      startRun();
      if (opt.skipReady) { g.mode = 'play'; g.t = 0; }
    },
    feed: function (ch) { feed(ch); },
    spawn: function (w, col, row) { g.words.push({ t: w, col: col || 4, row: row || FIELD_TOP, typed: 0, timer: 0 }); },
    clearWords: function () { g.words = []; g.lock = -1; },
    set: function (k, v) { g[k] = v; },
    get: function (k) { return g[k]; },
    finish: finish, levelUp: levelUp, wrapLines: wrapLines, wpmOf: wpmOf, rankOf: rankOf,
    consts: { LEVELS: LEVELS, FIELD_TOP: FIELD_TOP, IMPACT_ROW: IMPACT_ROW, SHIELDS: SHIELDS, READY_F: READY_F, TA_TIME: TA_TIME, TA_BONUS: TA_BONUS, RANK_PAD: RANK_PAD, RANK_KEY: RANK_KEY },
    kb: function () { return KB; }
  };

  if (CT.register) CT.register(GAME);
  TY.GAME = GAME;
})();
