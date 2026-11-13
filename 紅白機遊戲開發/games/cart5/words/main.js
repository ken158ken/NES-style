/*
 * games/cart5/words/main.js — 《星塵字謎 STAR WORDS》（合輯卡帶五，id = words，全域 CT.Words）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/*、registry.js、typing/{dict,kbd}.js、words/{art,gen,song}.js
 * 舊作概念：legacy word-guess / word-scramble / word-search（只取「猜字、重組、找字盤」玩法；字表 / 畫面 / 配樂全原創）。
 *
 * 三個模式：
 *   STAR PROBE   星塵探測（5 字母猜字，原創回饋表現）：7 次探測；每個字母**下方**出現探測符號——
 *                ★ 金星 = 字母對、位置也對 / ◎ 青環 = 字裡有、在別的位置 / · 灰點 = 字裡沒有。字格本身**不上色**；
 *                畫面鍵盤只標「不在字裡（字變灰）」與「在字裡（字變金）」兩種。SELECT = 星塵掃描（每回合 1 次，透露一格）。
 *   STAR SHUFFLE 重組字：10 個字（4 → 7 字母），每字 40 秒；十字鍵在字盤上選字母、A 放進答案、B 拿回；
 *                湊出原字或字表裡的另一個同字母單字都算對；3 條命；SELECT = 提示（從頭給對一個字母）。
 *   WORD HUNT    找字盤：10×10 星格，EASY 6 字（→ ↓）/ NORMAL 8 字（+ 斜向）/ HARD 10 字（8 方向含倒寫）；
 *                游標拉選：A 按住拖到字尾放開，或 A 點起點、移過去再按 A；B 取消；SELECT = 提示（字首閃爍）。
 * 輸入：畫面鍵盤 / 字盤游標（十字鍵一格一格：首延遲 12 幀、之後每 4 幀）；桌機實體鍵盤可直打字母、Backspace、Enter。
 * 網址：`cart5.html?game=words&debug=1[&bot=1][&lag=N][&seed=N][&mode=0..2][&hlv=0..2]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var WD = CT.Words = CT.Words || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var ID = 'words';
  var MODES = ['STAR PROBE', 'STAR SHUFFLE', 'WORD HUNT'];
  var MAXP = 7, SH_WORDS = 10, SH_TIME = 40 * 60, SH_LIVES = 3, READY_F = 90;
  var SH_LENS = [4, 4, 4, 5, 5, 5, 6, 6, 7, 7];
  var GRID_C = 2, GRID_R = 4, LIST_C = 23;
  var PAL_KEYS = [[0x01, 0x11, 0x30], [0x01, 0x11, 0x00], [0x01, 0x11, 0x28], [0x01, 0x11, 0x2C]];
  var PAL_GRID = [[0x02, 0x12, 0x30], [0x27, 0x17, 0x0F], [0x15, 0x05, 0x30], [0x02, 0x12, 0x00]];
  var PAL_SPR = [[0x30, 0x28, 0x30], [0x27, 0x38, 0x28], [0x21, 0x2C, 0x21], [0x00, 0x10, 0x00]];
  // 找字盤評價：秒數門檻（S / A / B，其餘 C）× 等級
  var HUNT_PAR = [[90, 150, 240], [150, 240, 360], [240, 360, 540]];

  var A = null, Au = null, KB = null, S = null, Phys = null, Gen = null;
  var nes0 = null, ppu0 = null, g = null;

  /* ============================== 小工具 ============================== */
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function center(s, w) { s = String(s); var l = Math.max(0, Math.floor((w - s.length) / 2)); return pad(new Array(l + 1).join(' ') + s, w); }
  function mmss(f) { var sec = Math.max(0, Math.floor(f / 60)); return num(Math.min(99, Math.floor(sec / 60)), 2) + ':' + num(sec % 60, 2); }
  function sfx(n) { Au.sfx(n); }
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  function text(c, r, s) { S.text(c, r, s, A.ch); }
  function starAt(c, r) { var h = Math.imul(c * 73856093 ^ r * 19349663, 2654435761) >>> 0; h = (h >>> 13) % 23; return h === 0 ? A.t('ST1') : (h === 1 ? A.t('ST2') : 0); }
  function clearRows(r0, r1, stars) { for (var r = r0; r <= r1; r++) for (var c = 0; c < 32; c++) S.put(c, r, stars ? starAt(c, r) : 0); }
  function attrRows(by0, by1, p) { for (var by = by0; by <= by1; by++) for (var bx = 0; bx < 16; bx++) S.putA(bx, by, p); }
  function cell(c, r, tiles, pal) {
    S.put(c, r, tiles[0]); S.put(c + 1, r, tiles[1]); S.put(c, r + 1, tiles[2]); S.put(c + 1, r + 1, tiles[3]);
    if (pal !== undefined) S.putA(c >> 1, r >> 1, pal);
  }
  function box(c0, r0, c1, r1) {
    var c, r;
    S.put(c0, r0, A.t('BOX_TL')); S.put(c1, r0, A.t('BOX_TR')); S.put(c0, r1, A.t('BOX_BL')); S.put(c1, r1, A.t('BOX_BR'));
    for (c = c0 + 1; c < c1; c++) { S.put(c, r0, A.t('BOX_T')); S.put(c, r1, A.t('BOX_B')); }
    for (r = r0 + 1; r < r1; r++) { S.put(c0, r, A.t('BOX_L')); S.put(c1, r, A.t('BOX_R')); for (c = c0 + 1; c < c1; c++) S.put(c, r, 0); }
  }
  function seedNow() {
    var q = parseInt((CT.query && CT.query('seed')) || '', 10);
    return (isFinite(q) && q > 0) ? q + g.rounds * 7919 : ((Date.now() & 0x7FFFFFFF) || 7);
  }

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'title', game: 0, sel: 0, hLv: 0, frames: 0, blink: 0, t: 0, paused: false, rounds: 0,
      cheats: 0, runCheats: 0, goalHit: false, result: null, endT: 0, over: false, newBest: false, msg: '', msgT: 0,
      rep: new CT.Typing.Kbd.Repeat(), cur: 'g', R: Math.random,
      // probe
      answer: '', probes: [], typed: '', keyState: {}, reveal: 0, scan: -1, maxP: MAXP, streak: 0, pScore: 0,
      // shuffle
      shWords: [], shIdx: 0, tray: [], ans: [], tc: 0, shT: 0, lives: SH_LIVES, shScore: 0, shHints: 0, shWait: 0, shShow: '',
      // hunt
      hunt: null, found: {}, cx: 0, cy: 0, selA: null, hTime: 0, hHints: 0, flashW: '', flashT: 0, hm: { m: 0, t: 0 },
      bot: { tap: new CT.Typing.Kbd.Tapper(4, 4), wait: 0, plan: null }
    };
  }

  /* ============================== 流程 ============================== */
  function refreshScreen() { CT.blank(nes0, function () { S.reset(); blankAll(); render(); S.flush(ppu0, true); }); }
  function blankAll() {
    ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    ppu0.setBackdrop(0x0F);
    var P = (g.mode !== 'title' && g.mode !== 'help' && g.game === 0) ? PAL_KEYS : PAL_GRID;
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, P[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false;
    Phys.release();
    refreshScreen();
    Au.stop(); Au.play('words_title');
  }
  function startRun() {
    g.game = g.sel; g.paused = false; g.result = null; g.over = false; g.endT = 0; g.msg = ''; g.msgT = 0; g.newBest = false;
    g.runCheats = 0; g.rep.reset();
    if (g.game === 0) newProbe();
    else if (g.game === 1) newShuffle();
    else newHunt();
    refreshScreen();
    Au.stop(); Au.play('words_think');
    Phys.setActive(g.game !== 2, ID);
  }
  function setPause(on) {
    if (g.paused === on) return;
    g.paused = on;
    if (on) Au.pause(); else if (!Au.resume()) Au.play('words_think');
    Phys.setActive(!on && g.mode === 'play' && g.game !== 2, ID);
    sfx('words_menu');
  }
  function finish(clear, r) {
    g.mode = 'result'; g.endT = 0; g.over = !clear; g.result = r; g.selA = null;
    Phys.release();
    Au.stop(); Au.play(clear ? 'words_clear' : 'words_over');
  }

  /* ---------- 星塵探測 ---------- */
  function newProbe() {
    var R = Gen.rng(seedNow()), pool = CT.Typing.DICT.PROBE;
    g.answer = pool[Math.floor(R() * pool.length)].toUpperCase();
    g.probes = []; g.typed = ''; g.keyState = {}; g.reveal = 0; g.scan = -1; g.maxP = MAXP; g.cur = 'g';
    g.mode = 'play'; g.rounds++;
  }
  function probeChar(ch) {
    if (g.reveal > 0) return;
    if (ch === '\b') { if (g.typed.length) { g.typed = g.typed.slice(0, -1); sfx('words_del'); } return; }
    if (ch === '\n') { submitProbe(); return; }
    ch = ch.toUpperCase();
    if (ch < 'A' || ch > 'Z') return;
    if (g.typed.length >= 5) { sfx('words_bad'); return; }
    g.typed += ch; sfx('words_key');
  }
  function submitProbe() {
    if (g.typed.length < 5) { g.msg = 'NEED 5 LETTERS'; g.msgT = 60; sfx('words_bad'); return; }
    var res = Gen.probe(g.answer, g.typed);
    g.probes.push({ w: g.typed, r: res });
    for (var i = 0; i < 5; i++) {
      var c = g.typed.charAt(i).toLowerCase();
      if (res[i] > 0) g.keyState[c] = 2; else if (!g.keyState[c]) g.keyState[c] = 1;
    }
    g.typed = ''; g.reveal = 5 * 10;
  }
  function updateProbe() {
    if (g.reveal > 0) {
      var before = g.reveal; g.reveal--;
      if (before % 10 === 0) {
        var p = g.probes[g.probes.length - 1], k = 5 - before / 10, v = p.r[k];
        sfx(v === 2 ? 'words_star' : (v === 1 ? 'words_ring' : 'words_none'));
      }
      if (g.reveal === 0) afterProbe();
    }
  }
  function afterProbe() {
    var p = g.probes[g.probes.length - 1];
    if (p.r.join('') === '22222') {
      g.streak++;
      var sc = (g.maxP + 1 - g.probes.length) * 100 - (g.scan >= 0 ? 50 : 0);
      g.pScore += Math.max(50, sc);
      if (g.runCheats === 0) {
        if (g.streak > CT.load(ID, 'streak', 0)) { CT.save(ID, 'streak', g.streak); g.newBest = true; }
        CT.save(ID, 'wins', CT.load(ID, 'wins', 0) + 1);
      }
      finish(true, { title: 'SIGNAL DECODED!', lines: ['WORD ' + g.answer + '   PROBES ' + g.probes.length + '/' + g.maxP, 'STREAK ' + num(g.streak, 2) + '   BEST ' + num(CT.load(ID, 'streak', 0), 2)] });
    } else if (g.probes.length >= g.maxP) {
      g.streak = 0;
      finish(false, { title: 'SIGNAL LOST', lines: ['THE WORD WAS ' + g.answer, 'C/$: 2 MORE PROBES'] });
    }
  }
  function doScan() {
    if (g.scan >= 0 || g.reveal > 0) { sfx('words_bad'); return; }
    var known = {}, i, cand = [];
    g.probes.forEach(function (p) { for (var k = 0; k < 5; k++) if (p.r[k] === 2) known[k] = 1; });
    for (i = 0; i < 5; i++) if (!known[i]) cand.push(i);
    if (!cand.length) { sfx('words_bad'); return; }
    g.scan = cand[(g.frames * 7) % cand.length];
    sfx('words_hint');
  }

  /* ---------- 重組字 ---------- */
  function newShuffle() {
    var R = Gen.rng(seedNow()), D = CT.Typing.DICT, used = {};
    g.shWords = SH_LENS.map(function (n) {
      var pool = D.pool([n]).filter(function (w) { return !used[w]; }), w = pool[Math.floor(R() * pool.length)];
      used[w] = 1; return w.toUpperCase();
    });
    g.R = R;
    g.shIdx = 0; g.lives = SH_LIVES; g.shScore = 0; g.shHints = 0;
    loadShuffle();
    g.mode = 'ready'; g.t = 0; g.rounds++;
  }
  function loadShuffle() {
    var s = Gen.scramble(g.shWords[g.shIdx], g.R);
    g.tray = s.split('').map(function (c) { return { ch: c, used: false }; });
    g.ans = []; g.tc = 0; g.shT = SH_TIME; g.shWait = 0; g.shShow = ''; g.shHintN = 0; g.shOk = false;
  }
  function ansWord() { return g.ans.map(function (i) { return g.tray[i].ch; }).join(''); }
  function pickTray(i) {
    if (i < 0 || i >= g.tray.length || g.tray[i].used || g.shWait) { sfx('words_bad'); return; }
    g.tray[i].used = true; g.ans.push(i); sfx('words_key');
    for (var k = 1; k <= g.tray.length; k++) { var j = (i + k) % g.tray.length; if (!g.tray[j].used) { g.tc = j; break; } }
    if (g.ans.length === g.tray.length) checkShuffle();
  }
  function undoTray() {
    if (!g.ans.length || g.shWait) return;
    if (g.ans.length <= g.shHintN) { sfx('words_bad'); return; }
    var i = g.ans.pop(); g.tray[i].used = false; g.tc = i; sfx('words_del');
  }
  function shuffleChar(ch) {
    if (g.shWait) return;
    if (ch === '\b') { undoTray(); return; }
    ch = ch.toUpperCase();
    for (var i = 0; i < g.tray.length; i++) if (!g.tray[i].used && g.tray[i].ch === ch) { pickTray(i); return; }
    if (ch >= 'A' && ch <= 'Z') sfx('words_bad');
  }
  function isAnagramWord(w) {
    var want = g.shWords[g.shIdx];
    if (w === want) return true;
    if (w.split('').sort().join('') !== want.split('').sort().join('')) return false;
    return CT.Typing.DICT.ALL.indexOf(w.toLowerCase()) >= 0;
  }
  function checkShuffle() {
    var w = ansWord();
    if (isAnagramWord(w)) {
      var bonus = Math.floor(g.shT / 60);
      g.shScore += w.length * 20 + bonus * 2 - g.shHintN * 15;
      g.shWait = 60; g.shShow = 'GREAT!  +' + (w.length * 20 + bonus * 2 - g.shHintN * 15); sfx('words_found');
      g.shOk = true;
    } else {
      g.msg = 'NOT QUITE - TRY AGAIN'; g.msgT = 60; sfx('words_bad');
      while (g.ans.length > g.shHintN) { var i = g.ans.pop(); g.tray[i].used = false; }
      for (var k = 0; k < g.tray.length; k++) if (!g.tray[k].used) { g.tc = k; break; }
    }
  }
  function shuffleHint() {
    if (g.shWait) return;
    var want = g.shWords[g.shIdx];
    if (g.shHintN >= want.length - 1) { sfx('words_bad'); return; }
    // 拿回所有字，從頭依正解放 shHintN + 1 個
    g.ans.forEach(function (i) { g.tray[i].used = false; }); g.ans = [];
    g.shHintN++; g.shHints++;
    for (var p = 0; p < g.shHintN; p++) {
      for (var i = 0; i < g.tray.length; i++) if (!g.tray[i].used && g.tray[i].ch === want.charAt(p)) { g.tray[i].used = true; g.ans.push(i); break; }
    }
    for (var k = 0; k < g.tray.length; k++) if (!g.tray[k].used) { g.tc = k; break; }
    sfx('words_hint');
  }
  function updateShuffle() {
    if (g.shWait > 0) {
      if (--g.shWait === 0) {
        if (!g.shOk && g.lives <= 0) { finish(false, { title: 'OUT OF LIVES', lines: ['WORDS ' + num(g.shIdx, 2) + '/10   SCORE ' + num(g.shScore, 6), 'C/$: CONTINUE HERE'] }); return; }
        g.shIdx++;
        if (g.shIdx >= SH_WORDS) {
          if (g.runCheats === 0 && g.shScore > CT.load(ID, 'shuffle', 0)) { CT.save(ID, 'shuffle', g.shScore); g.newBest = true; }
          finish(true, { title: 'ALL WORDS SOLVED!', lines: ['SCORE ' + num(g.shScore, 6) + '   HINTS ' + num(g.shHints, 2), 'BEST ' + num(CT.load(ID, 'shuffle', 0), 6)] });
          return;
        }
        loadShuffle();
      }
      return;
    }
    if (--g.shT <= 0) {
      g.lives--; g.shOk = false; g.shWait = 90; g.shShow = 'TIME! ' + g.shWords[g.shIdx];
      sfx('words_bad');
    }
  }

  /* ---------- 找字盤 ---------- */
  function newHunt() {
    g.hunt = Gen.hunt(g.hLv, seedNow());
    g.found = {}; g.cx = 0; g.cy = 0; g.selA = null; g.hTime = 0; g.hHints = 0; g.flashW = ''; g.flashT = 0; g.hm = { m: 0, t: 0 };
    g.mode = 'play'; g.rounds++;
  }
  function huntLine(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
    var n = Math.max(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx), sy = Math.sign(dy), out = [];
    for (var k = 0; k <= n; k++) out.push([ax + sx * k, ay + sy * k]);
    return out;
  }
  function huntConfirm() {
    var line = huntLine(g.selA.x, g.selA.y, g.cx, g.cy);
    g.selA = null;
    if (!line || line.length < 2) { sfx('words_bad'); return; }
    var s = line.map(function (p) { return g.hunt.grid[p[1] * 10 + p[0]]; }).join(''), r = s.split('').reverse().join('');
    var hit = null;
    g.hunt.words.forEach(function (w) { if (!g.found[w] && (w === s || w === r)) hit = w; });
    if (!hit) { g.msg = 'NOT ON THE LIST'; g.msgT = 50; sfx('words_bad'); return; }
    g.found[hit] = line;
    g.msg = hit + ' FOUND!'; g.msgT = 60; sfx('words_found');
    if (Object.keys(g.found).length >= g.hunt.words.length) huntDone();
  }
  function huntDone() {
    var sec = Math.floor(g.hTime / 60), P = HUNT_PAR[g.hLv], rank = 'C';
    if (g.hHints === 0 && sec <= P[0]) rank = 'S'; else if (g.hHints <= 1 && sec <= P[1]) rank = 'A'; else if (sec <= P[2]) rank = 'B';
    if (g.runCheats === 0) {
      g.goalHit = true;
      var bk = 'hunt' + g.hLv, b = CT.load(ID, bk, 0);
      if (!b || sec < b) { CT.save(ID, bk, Math.max(1, sec)); g.newBest = true; }
    }
    var best = CT.load(ID, 'hunt' + g.hLv, 0);
    finish(true, { title: 'BOARD CLEAR!  RANK ' + rank, rank: rank, lines: ['TIME ' + mmss(g.hTime) + '   HINTS ' + num(g.hHints, 2), 'BEST ' + (best ? mmss(best * 60) : '--:--')] });
  }
  function huntMove() {
    var I = NES.Input, m = I.mask() & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT), h = g.hm, go = false;
    if (!m) { h.m = 0; h.t = 0; return; }
    if (m !== h.m) { h.m = m; h.t = 0; go = true; }
    else { h.t++; if (h.t >= CT.Typing.Kbd.REP_FIRST && (h.t - CT.Typing.Kbd.REP_FIRST) % CT.Typing.Kbd.REP_NEXT === 0) go = true; }
    if (!go) return;
    var dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.DOWN ? 1 : 0) - (m & BTN.UP ? 1 : 0);
    var nx = Math.max(0, Math.min(9, g.cx + dx)), ny = Math.max(0, Math.min(9, g.cy + dy));
    if (nx !== g.cx || ny !== g.cy) { g.cx = nx; g.cy = ny; sfx('words_move'); if (g.selA) g.selA.moved = true; }
  }
  function updateHunt() {
    g.hTime++;
    if (g.flashT > 0) g.flashT--;
    huntMove();
    if (pressed(BTN.A)) {
      if (!g.selA) { g.selA = { x: g.cx, y: g.cy, moved: false }; sfx('words_key'); }
      else if (g.selA.x !== g.cx || g.selA.y !== g.cy) huntConfirm();
      else { g.selA = null; sfx('words_del'); }
    } else if (NES.Input.released(BTN.A) && g.selA && g.selA.moved && (g.selA.x !== g.cx || g.selA.y !== g.cy)) huntConfirm();
    if (pressed(BTN.B) && g.selA) { g.selA = null; sfx('words_del'); }
    if (pressed(BTN.SELECT) && !held(BTN.START)) {
      var left = g.hunt.words.filter(function (w) { return !g.found[w]; });
      if (left.length) { g.flashW = left[0]; g.flashT = 150; g.hHints++; sfx('words_hint'); }
    }
  }

  /* ============================== 輸入（探測 / 重組共用） ============================== */
  function touchDev() { return !!(NES.Touch && NES.Touch.available); }
  function feed(ch) {
    if (g.mode !== 'play' || g.paused) return;
    if (g.game === 0) probeChar(ch); else if (g.game === 1) shuffleChar(ch);
  }
  function physInput() {
    Phys.tick();
    var q = Phys.drain();
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (c === '\x1b') { if (g.mode === 'play') setPause(!g.paused); continue; }
      if (c === ' ' || c === ',' || c === '.' || c === "'") continue;
      if (c === '\n' && g.game !== 0) continue;
      feed(c);
    }
  }
  // fix-r9-type P3-6：觸控直接點——探測 = 點鍵盤的鍵；重組 = 點上排字母拿、點下排答案退回
  function tapInput() {
    var q = CT.Typing.Kbd.Tap.drain();
    for (var i = 0; i < q.length; i++) {
      var x = q[i].x, y = q[i].y;
      if (g.game === 0) {
        var k = KB.hit(x, y);
        if (!k) continue;
        g.cur = k.id; g.rep.reset();
        if (k.id === 'del') feed('\b'); else if (k.id === 'go') feed('\n'); else if (k.ch) feed(k.ch);
      } else if (g.game === 1 && g.mode === 'play' && !g.paused) {
        var n = g.tray.length, c0 = Math.max(2, (16 - n) & ~1), ti = Math.floor((x - c0 * 8) / 16);
        if (ti < 0 || ti >= n) continue;
        if (y >= 8 * 8 - 4 && y < 10 * 8 + 4) { g.tc = ti; pickTray(ti); }
        else if (y >= 12 * 8 - 4 && y < 14 * 8 + 4) undoTray();
      }
    }
  }
  function updateProbeInput() {
    tapInput();
    var d = g.rep.step();
    if (d) { var nk = KB.move(KB.byId[g.cur], d); if (nk) { g.cur = nk.id; sfx('words_move'); } }
    if (pressed(BTN.B)) feed('\b');
    if (pressed(BTN.SELECT) && !held(BTN.START)) doScan();
    if (pressed(BTN.A)) {
      var k = KB.byId[g.cur];
      if (k.id === 'del') feed('\b'); else if (k.id === 'go') feed('\n'); else if (k.ch) feed(k.ch);
    }
  }
  function updateShuffleInput() {
    tapInput();
    var d = g.rep.step(), n = g.tray.length;
    if (d === BTN.LEFT) { g.tc = (g.tc + n - 1) % n; sfx('words_move'); }
    if (d === BTN.RIGHT) { g.tc = (g.tc + 1) % n; sfx('words_move'); }
    if (pressed(BTN.A)) pickTray(g.tc);
    if (pressed(BTN.B)) undoTray();
    if (pressed(BTN.SELECT) && !held(BTN.START)) shuffleHint();
  }

  /* ============================== update ============================== */
  function update() {
    g.frames++; g.blink++;
    if (g.msgT > 0) g.msgT--;
    if (g.mode === 'title') return updateTitle();
    if (g.mode === 'help') {
      g.t++;
      if (g.t > 10 && (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT)))) { sfx('words_ok'); startRun(); }
      else if (pressed(BTN.B)) { g.mode = 'title'; refreshScreen(); sfx('words_menu'); }
      return;
    }
    if (g.mode === 'result') {
      g.endT++;
      if (g.endT > 40) {
        if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) startRun();
        else if (pressed(BTN.B)) toTitle();
      }
      return;
    }
    physInput();
    if (pressed(BTN.START) && !held(BTN.SELECT) && g.mode === 'play') setPause(!g.paused);
    if (g.paused) return;
    if (g.mode === 'ready') { if (++g.t >= READY_F) { g.mode = 'play'; g.t = 0; } return; }
    if (g.game === 0) { updateProbeInput(); updateProbe(); }
    else if (g.game === 1) { if (!g.shWait) updateShuffleInput(); else CT.Typing.Kbd.Tap.drain(); updateShuffle(); }
    else updateHunt();
  }
  function updateTitle() {
    if (pressed(BTN.UP)) { g.sel = (g.sel + 2) % 3; sfx('words_menu'); }
    if (pressed(BTN.DOWN)) { g.sel = (g.sel + 1) % 3; sfx('words_menu'); }
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0);
    if (d && g.sel === 2) { g.hLv = (g.hLv + d + 3) % 3; sfx('words_menu'); }
    if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) { g.mode = 'help'; g.t = 0; refreshScreen(); sfx('words_ok'); }
  }

  /* ============================== 畫面 ============================== */
  function render() {
    if (g.mode === 'title') return renderTitle();
    if (g.mode === 'help') return renderHelp();
    if (g.game === 0) renderProbe(); else if (g.game === 1) renderShuffle(); else renderHunt();
    if (g.paused) renderPause();
    else if (g.mode === 'result') renderResult();
  }
  function renderTitle() {
    clearRows(0, 29, true); attrRows(0, 14, 0);
    var T = 'STAR WORDS';
    for (var i = 0; i < T.length; i++) if (T.charAt(i) !== ' ') cell(6 + i * 2, 4, A.cell(T.charAt(i)), i < 4 ? 1 : 2);
    text(2, 7, center('SOLVE THE STARLIGHT LETTERS', 28));
    for (i = 0; i < 3; i++) { S.put(8, 10 + i * 2, g.sel === i ? A.ch('>') : 0); text(10, 10 + i * 2, pad(MODES[i], 14)); }
    var o = '', b = '';
    if (g.sel === 0) { o = 'GUESS A 5-LETTER WORD'; b = 'BEST STREAK ' + num(CT.load(ID, 'streak', 0), 2) + '  WINS ' + num(CT.load(ID, 'wins', 0), 3); }
    else if (g.sel === 1) { o = '10 WORDS  3 LIVES'; b = 'BEST ' + num(CT.load(ID, 'shuffle', 0), 6); }
    else { o = '< ' + Gen.HUNT[g.hLv].name + ' >  ' + Gen.HUNT[g.hLv].words + ' WORDS'; var t = CT.load(ID, 'hunt' + g.hLv, 0); b = 'BEST ' + (t ? mmss(t * 60) : '--:--'); }
    text(2, 17, center(o, 28)); text(2, 19, center(b, 28));
    text(2, 22, center('A/START: GO   C/$ = CHEAT', 28));
    text(2, 24, center('HOLD START+SELECT: MENU', 28));
    text(2, 26, (g.blink >> 5) & 1 ? center(touchDev() ? 'PHONE: TAP THE KEYS' : 'PC: TYPE ON YOUR KEYBOARD', 28) : center('PUSH START', 28));
  }
  var HELP = [
    ['STAR PROBE', ['FIND THE HIDDEN 5-LETTER', 'WORD IN 7 PROBES.', 'TYPE 5 LETTERS, THEN GO.']],
    ['STAR SHUFFLE', ['PUT THE MIXED LETTERS BACK', 'IN ORDER. 40 SEC PER WORD.', 'ANOTHER REAL WORD COUNTS!']],
    ['WORD HUNT', ['FIND EVERY WORD ON THE LIST', 'IN THE 10X10 STAR GRID.', 'WORDS RUN IN STRAIGHT LINES.']]
  ];
  var HELP_KEYS = [
    [[17, 'D-PAD MOVE  A TYPE  B DEL'], [19, 'SELECT SCAN: SHOWS 1 LETTER'], [21, 'C/$ = CHEAT  PC: PAUSE + C'], [23, 'PC KEYBOARD: JUST TYPE']],
    [[12, 'LEFT RIGHT MOVE   A PICK'], [14, 'B TAKE BACK  SELECT HINT'], [16, 'NO TIME LEFT = LOSE A LIFE'], [19, 'C/$ = CHEAT  PC: PAUSE + C'], [21, 'PC KEYBOARD: JUST TYPE']],
    [[12, 'HOLD A ON THE FIRST LETTER,'], [14, 'MOVE TO THE LAST, LET GO.'], [16, 'OR TAP A AT BOTH ENDS.'], [19, 'B CANCEL     SELECT HINT'], [21, 'START PAUSE  C/$ = CHEAT']]
  ];
  function renderHelp() {
    clearRows(0, 29, false); attrRows(0, 14, 0);
    var H = HELP[g.sel], i;
    text(2, 3, center(H[0], 28));
    for (i = 0; i < 3; i++) text(2, 5 + i * 2, pad(H[1][i], 28));
    if (g.sel === 0) {
      text(4, 11, 'RIGHT LETTER, RIGHT SPOT');
      text(4, 13, 'IN THE WORD, OTHER SPOT');
      text(4, 15, 'NOT IN THE WORD');
    }
    HELP_KEYS[g.sel].forEach(function (L) {
      var t = L[1];
      if (touchDev() && t === 'PC KEYBOARD: JUST TYPE') t = g.sel === 0 ? 'PHONE: TAP A KEY TO TYPE IT' : 'PHONE: TAP A LETTER TO PICK';   // P3-6
      text(2, L[0], t);
    });
    text(2, 25, center('HOLD START+SELECT: MENU', 28));
    text(2, 27, center('A START    B BACK', 28));
  }

  function renderProbe() {
    attrRows(0, 14, 0);
    clearRows(0, 1, false);
    text(2, 2, 'PROBE ' + Math.min(g.maxP, g.probes.length + (g.mode === 'play' && g.reveal === 0 ? 1 : 0)) + '/' + g.maxP + ' ');
    text(14, 2, 'STREAK ' + num(g.streak, 2) + ' SC ' + num(g.pScore, 4));
    for (var c = 0; c < 32; c++) S.put(c, 3, A.t('HL'));
    clearRows(4, 17, false);
    var i, k, top = 4, gap = 2;
    var vis0 = Math.max(0, g.probes.length + 1 - 7);   // 續關多出的探測：只顯示最後 7 列
    for (i = 0; i < 7; i++) {
      var pi = vis0 + i, row = top + i * gap;
      if (pi >= g.maxP) break;
      text(7, row, String((pi + 1) % 10));
      var w = pi < g.probes.length ? g.probes[pi].w : (pi === g.probes.length && g.mode === 'play' ? g.typed : '');
      for (k = 0; k < 5; k++) {
        var ch = w.charAt(k);
        S.put(11 + k * 2, row, ch ? A.ch(ch) : (pi === g.probes.length ? A.ch('-') : A.ch('`')));
      }
    }
    text(25, 6, 'SPOT'); text(25, 8, 'IN'); text(25, 10, 'NONE');
    if (g.scan >= 0) { text(23, 13, 'SCAN'); text(23, 14, '#' + (g.scan + 1) + ' = ' + g.answer.charAt(g.scan)); }
    else { text(23, 13, 'SEL'); text(23, 14, 'SCAN'); }
    // 訊息列
    var m = g.msgT > 0 ? g.msg : (g.typed.length === 5 ? 'PRESS GO' : '');
    text(2, 18, pad(m, 28));
    // 鍵盤
    KB.paint(S.put, A.key, A.t, true);
    attrRows(9, 9, 0);
    for (var by = 10; by <= 13; by++) for (var bx = 0; bx < 16; bx++) S.putA(bx, by, 0);
    KB.keys.forEach(function (kk) { if (kk.ch && g.keyState[kk.ch]) S.putA(kk.c >> 1, kk.r >> 1, g.keyState[kk.ch] === 1 ? 1 : 2); });
    text(2, 28, pad('B DEL  SEL SCAN  START PAUSE', 29));
  }
  function renderShuffle() {
    attrRows(0, 14, 0);
    clearRows(0, 1, false);
    text(2, 2, 'WORD ' + num(Math.min(SH_WORDS, g.shIdx + 1), 2) + '/' + SH_WORDS);
    text(14, 2, 'TIME ' + num(Math.ceil(g.shT / 60), 2));
    var lv = ''; for (var i = 0; i < SH_LIVES; i++) lv += i < g.lives ? '^' : '-';
    text(25, 2, lv);
    for (var c = 0; c < 32; c++) S.put(c, 3, A.t('HL'));
    clearRows(4, 27, true);
    text(2, 5, center('SCORE ' + num(g.shScore, 6), 28));
    var n = g.tray.length, c0 = (16 - n) & ~1;
    if (c0 < 2) c0 = 2;
    text(2, 7, center('MIXED', 28));
    for (i = 0; i < n; i++) {
      var t = g.tray[i];
      cell(c0 + i * 2, 8, t.used ? A.slot() : A.cell(t.ch), t.used ? 0 : (i === g.tc && !g.shWait ? 1 : 0));
    }
    text(2, 11, center('ANSWER', 28));
    var full = g.shWait > 0 && g.shOk;
    for (i = 0; i < n; i++) {
      var a = g.ans[i];
      var ch = a !== undefined ? g.tray[a].ch : (g.shWait && !g.shOk ? g.shWords[g.shIdx].charAt(i) : '');
      cell(c0 + i * 2, 12, ch ? A.cell(ch) : A.slot(), full ? 2 : (i < g.shHintN ? 2 : (g.shWait && !g.shOk ? 1 : 0)));
    }
    var m = g.shWait ? g.shShow : (g.msgT > 0 ? g.msg : (g.mode === 'ready' ? 'READY ' + (3 - Math.floor(g.t * 3 / READY_F)) : ''));
    text(2, 15, center(m, 28));
    text(2, 18, center('LEFT RIGHT MOVE   A PICK', 28));
    text(2, 20, center('B TAKE BACK   SELECT HINT', 28));
    text(2, 22, center(touchDev() ? 'TAP: TOP PICKS  BOTTOM UNDO' : 'PC: TYPE THE LETTERS', 28));
    text(2, 24, center('START PAUSE   C/$ = CHEAT', 28));
  }
  function renderHunt() {
    var H = g.hunt, i, x, y;
    clearRows(0, 3, false);
    text(2, 2, pad(Gen.HUNT[g.hLv].name + ' ' + H.theme, 13));
    text(15, 2, pad('FOUND ' + Object.keys(g.found).length + '/' + H.words.length, 11));
    text(27, 2, mmss(g.hTime));
    attrRows(0, 1, 0);
    var hl = {}, line = g.selA ? huntLine(g.selA.x, g.selA.y, g.cx, g.cy) : null;
    if (g.selA && !line) line = [[g.selA.x, g.selA.y]];
    var fd = {};
    for (var w in g.found) if (g.found.hasOwnProperty(w)) g.found[w].forEach(function (p) { fd[p[0] + ',' + p[1]] = 1; });
    if (line) line.forEach(function (p) { hl[p[0] + ',' + p[1]] = 1; });
    var flash = null;
    if (g.flashT > 0 && g.flashW) H.place.forEach(function (p) { if (p.w === g.flashW) flash = p.x + ',' + p.y; });
    for (y = 0; y < 10; y++) for (x = 0; x < 10; x++) {
      var k = x + ',' + y, pal = hl[k] ? 1 : (fd[k] ? 2 : 0);
      if (flash === k && (g.flashT >> 3) & 1) pal = 1;
      cell(GRID_C + x * 2, GRID_R + y * 2, A.cell(g.paused ? '' : H.grid[y * 10 + x]), g.paused ? 0 : pal);
    }
    for (i = 0; i < 10; i++) {
      var r = 4 + i * 2, word = H.words[i] || '';
      text(22, r, ' ' + pad(word, 9));
      for (x = 11; x < 16; x++) S.putA(x, r >> 1, word && g.found[word] ? 3 : 0);
    }
    for (y = 24; y <= 28; y++) for (x = 0; x < 32; x++) S.put(x, y, 0);
    attrRows(12, 14, 0);
    var m = g.msgT > 0 ? g.msg : (g.selA ? 'MOVE TO THE LAST LETTER' : 'A ON THE FIRST LETTER');
    text(2, 25, center(m, 28));
    text(2, 27, center('B CANCEL   SELECT HINT', 28));
  }
  // 暫停 / 結算框都放在偶數列起訖（字格 2×2 磚不會被切一半）
  function renderPause() {
    box(1, 8, 30, 17);
    text(2, 10, center('PAUSE', 28));
    text(2, 12, center('HOLD START+SELECT: MENU', 28));
    text(2, 14, center('C/$ = CHEAT', 28));
    text(2, 16, center('START OR ESC: RESUME', 28));
    for (var by = 4; by <= 8; by++) for (var bx = 0; bx < 16; bx++) S.putA(bx, by, 0);
  }
  function renderResult() {
    var r = g.result;
    box(1, 6, 30, 17);
    text(2, 8, center(r.title, 28));
    text(2, 10, center(r.lines[0], 28));
    text(2, 12, center(r.lines[1], 28));
    text(2, 14, center(g.newBest ? 'NEW RECORD!' : '', 28));
    text(2, 16, center(g.over ? 'C/$ CONTINUE  A NEW  B TITLE' : 'A NEXT    B TITLE', 28));
    for (var by = 3; by <= 8; by++) for (var bx = 0; bx < 16; bx++) S.putA(bx, by, 0);
  }

  function drawSprites() {
    var slot = 0, i, k;
    function spr(x, y, name, pal) { if (slot < 60) ppu0.sprite(slot++, { x: x, y: y, tile: A.s(name), pal: pal }); }
    var names = ['CTL', 'CTR', 'CBL', 'CBR'];
    if (g.mode === 'help' && g.sel === 0) {
      spr(16, 11 * 8, 'SYM_STAR', 1); spr(16, 13 * 8, 'SYM_RING', 2); spr(16, 15 * 8, 'SYM_DOT', 3);
    }
    if ((g.mode === 'play' || g.mode === 'ready' || g.mode === 'result') && !g.paused) {
      if (g.game === 0) {
        if (g.mode !== 'result') { spr(23 * 8, 6 * 8, 'SYM_STAR', 1); spr(23 * 8, 8 * 8, 'SYM_RING', 2); spr(23 * 8, 10 * 8, 'SYM_DOT', 3); }
        var vis0 = Math.max(0, g.probes.length + 1 - 7);
        if (g.mode === 'result') vis0 = Math.max(0, g.probes.length - 7);
        for (i = 0; i < 7; i++) {
          var pi = vis0 + i, p = g.probes[pi];
          if (!p) break;
          var last = pi === g.probes.length - 1, shown = last && g.reveal > 0 ? 5 - Math.ceil(g.reveal / 10) : 5;
          for (k = 0; k < shown; k++) {
            var v = p.r[k];
            if (g.mode === 'result' && (i * 2 + 5) >= 6 && (i * 2 + 5) <= 17) continue;
            spr((11 + k * 2) * 8, (4 + i * 2) * 8 + 8, v === 2 ? 'SYM_STAR' : (v === 1 ? 'SYM_RING' : 'SYM_DOT'), v === 2 ? 1 : (v === 1 ? 2 : 3));
          }
        }
        if (g.mode === 'play') { var cs = KB.corners(KB.byId[g.cur]); for (i = 0; i < 4; i++) spr(cs[i][0], cs[i][1], names[i], 0); }
      } else if (g.game === 1 && g.mode === 'play' && !g.shWait && g.tray.length) {
        var n = g.tray.length, c0 = Math.max(2, (16 - n) & ~1), x = (c0 + g.tc * 2) * 8, y = 8 * 8;
        spr(x - 3, y - 3, 'CTL', 0); spr(x + 11, y - 3, 'CTR', 0); spr(x - 3, y + 11, 'CBL', 0); spr(x + 11, y + 11, 'CBR', 0);
      } else if (g.game === 2 && g.mode === 'play') {
        var hx = (GRID_C + g.cx * 2) * 8, hy = (GRID_R + g.cy * 2) * 8;
        spr(hx - 3, hy - 3, 'CTL', 0); spr(hx + 11, hy - 3, 'CTR', 0); spr(hx - 3, hy + 11, 'CBL', 0); spr(hx + 11, hy + 11, 'CBR', 0);
      }
    }
    for (i = slot; i < 62; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：找字盤——只讀畫面上的字母與題目，自己找，游標一格一格走（人類節奏） ============================== */
  function botLag() { var q = parseInt((CT.query && CT.query('lag')) || '', 10); return isFinite(q) && q >= 0 ? Math.min(60, q) : 15; }
  function botFind(word) {
    var G = g.hunt.grid, D = Gen.DIRS8, x, y, d, k;
    for (y = 0; y < 10; y++) for (x = 0; x < 10; x++) for (d = 0; d < 8; d++) {
      var ok = true;
      for (k = 0; k < word.length; k++) {
        var X = x + D[d][0] * k, Y = y + D[d][1] * k;
        if (X < 0 || Y < 0 || X > 9 || Y > 9 || G[Y * 10 + X] !== word.charAt(k)) { ok = false; break; }
      }
      if (ok) return { x: x, y: y, ex: x + D[d][0] * (word.length - 1), ey: y + D[d][1] * (word.length - 1) };
    }
    return null;
  }
  function towards(tx, ty) {
    var m = 0;
    if (tx > g.cx) m |= BTN.RIGHT; else if (tx < g.cx) m |= BTN.LEFT;
    if (ty > g.cy) m |= BTN.DOWN; else if (ty < g.cy) m |= BTN.UP;
    return m;
  }
  function bot() {
    var b = g.bot;
    if (b.tap.busy()) return b.tap.tick();
    if (b.wait > 0) { b.wait--; return 0; }
    var m = botDecide();
    if (m) { b.tap.tap(m); return b.tap.tick(); }
    return 0;
  }
  function botDecide() {
    var b = g.bot;
    if (g.mode === 'title') {
      if (g.sel !== 2) return BTN.DOWN;
      if (g.hLv !== 0) return BTN.LEFT;
      b.wait = 20; return BTN.A;
    }
    if (g.mode === 'help') { if (g.t < 40) return 0; b.wait = botLag(); return BTN.A; }
    if (g.mode === 'result') { if (g.endT < 60) return 0; return BTN.B; }
    if (g.paused) return BTN.START;
    if (g.mode !== 'play' || g.game !== 2) return 0;
    if (!b.plan) {
      var left = g.hunt.words.filter(function (w) { return !g.found[w]; });
      if (!left.length) return 0;
      var f = botFind(left[0]);
      if (!f) return 0;
      // 人類節奏：在 10×10 字盤裡「找到」一個字要時間（反應 lag + 掃視 90 幀 + 每字母 10 幀）
      b.plan = f; b.wait = botLag() + 90 + left[0].length * 10;
      return 0;
    }
    var p = b.plan;
    if (!g.selA) {
      var m = towards(p.x, p.y);
      if (m) return m;
      return BTN.A;
    }
    var m2 = towards(p.ex, p.ey);
    if (m2) return m2;
    b.plan = null;
    return BTN.A;
  }

  /* ============================== 密技 ============================== */
  // 遊玩 / 暫停中：PROBE = 掃描再充能 + 多 2 次探測；SHUFFLE = 時間補滿 + 命 +1；HUNT = 直接找出一個字。
  // 失敗結算（PROBE 用完 / SHUFFLE 沒命）= 原地續關（同一題 +2 次探測 / 同一字命補滿）。標題 / 說明 / 過關結算無效。
  function cheat() {
    if (!g) return false;
    if (g.mode === 'result') {
      if (!g.over) return false;
      g.cheats++; g.runCheats++;
      g.mode = 'play'; g.over = false; g.result = null;
      if (g.game === 0) { g.maxP += 2; }
      else if (g.game === 1) { g.lives = SH_LIVES; g.shIdx++; if (g.shIdx >= SH_WORDS) g.shIdx = SH_WORDS - 1; loadShuffle(); }
      refreshScreen();
      Au.stop(); Au.play('words_think');
      Phys.setActive(g.game !== 2, ID);
      sfx('words_hint');
      return true;
    }
    if (g.mode !== 'play') return false;
    g.cheats++; g.runCheats++;
    if (g.game === 0) { g.scan = -1; g.maxP += 2; doScan(); }
    else if (g.game === 1) { g.shT = SH_TIME; g.lives = Math.min(SH_LIVES + 2, g.lives + 1); }
    else {
      var left = g.hunt.words.filter(function (w) { return !g.found[w]; });
      if (left.length) {
        var p = g.hunt.place.filter(function (q) { return q.w === left[0]; })[0], line = [];
        for (var k = 0; k < p.w.length; k++) line.push([p.x + p.dx * k, p.y + p.dy * k]);
        g.found[left[0]] = line; g.msg = left[0] + ' FOUND!'; g.msgT = 60;
        if (Object.keys(g.found).length >= g.hunt.words.length) huntDone();
      }
    }
    if (g.paused) setPause(false);
    sfx('words_hint');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: ID, order: 4, title: '星塵字謎', legacy: ['word-guess.html', 'word-scramble.html', 'word-search.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = WD.Art.make(); Au = WD.Audio; KB = A.kb; Phys = CT.Typing.Kbd.Phys; Gen = WD.Gen;
      S = CT.Typing.Kbd.Shadow(140); S.nes = nes;
      NES.CHR.setPattern(0, 'words_bg');
      NES.CHR.setPattern(1, 'words_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10); if (mq >= 0 && mq <= 2) g.sel = mq;
      var hq = parseInt(q('hlv') || '', 10); if (hq >= 0 && hq <= 2) g.hLv = hq;
      refreshScreen();
      Au.play('words_title');
    },
    update: function (nes) { update(); Au.tick(); },
    draw: function (nes) { render(); S.flush(ppu0, false); drawSprites(); },
    exit: function (nes) {
      Phys.release();
      if (g && g.game === 1 && g.mode === 'play' && g.runCheats === 0 && g.shScore > CT.load(ID, 'shuffle', 0)) CT.save(ID, 'shuffle', g.shScore);
      Au.stop();
    },
    get backTile() { if (!A) A = WD.Art.make(); return { tile: A.s('DOT'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, game: g.game, sel: g.sel, hLv: g.hLv, paused: g.paused, t: g.t, frames: g.frames, cur: g.cur,
        answer: g.answer, probes: g.probes.map(function (p) { return { w: p.w, r: p.r.slice() }; }), typed: g.typed, keyState: g.keyState,
        reveal: g.reveal, scan: g.scan, maxP: g.maxP, streak: g.streak, pScore: g.pScore,
        shWords: g.shWords.slice(), shIdx: g.shIdx, tray: g.tray.map(function (t) { return t.ch + (t.used ? '*' : ''); }), ans: ansWord(), tc: g.tc,
        shT: g.shT, lives: g.lives, shScore: g.shScore, shHints: g.shHints, shWait: g.shWait,
        hunt: g.hunt ? { theme: g.hunt.theme, words: g.hunt.words.slice(), grid: g.hunt.grid.join(''), level: g.hunt.level } : null,
        found: Object.keys(g.found), cx: g.cx, cy: g.cy, selA: g.selA, hTime: g.hTime, hHints: g.hHints,
        result: g.result, over: g.over, cheats: g.cheats, runCheats: g.runCheats, goal: GAME.goal(), msg: g.msgT > 0 ? g.msg : '',
        music: Au.current, lastSfx: Au.lastSfx, queue: S.pending(), ntPeak: S.peak, tiles: A.count,
        phys: { active: Phys.active, remapped: Phys.remapped, used: Phys.used }
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goalHit); },
    // 選單：探測最佳連勝（右對齊 6 字元，例如 `STK 03`）
    bestText: function () { return 'STK ' + num(CT.load(ID, 'streak', 0), 2); }
  };

  WD.dev = {
    start: function (mode, opt) {
      opt = opt || {};
      g.sel = mode; if (opt.hLv !== undefined) g.hLv = opt.hLv;
      var s0 = CT.query;
      if (opt.seed) CT.query = function (k) { return k === 'seed' ? String(opt.seed) : (s0 ? s0(k) : null); };
      try { startRun(); } finally { CT.query = s0; }
      if (opt.skipReady && g.mode === 'ready') { g.mode = 'play'; g.t = 0; }
      if (opt.answer) g.answer = opt.answer.toUpperCase();
    },
    feed: function (ch) { feed(ch); },
    set: function (k, v) { g[k] = v; },
    get: function (k) { return g[k]; },
    place: function () { return g.hunt ? g.hunt.place.slice() : null; },
    finish: finish,
    consts: { MAXP: MAXP, SH_WORDS: SH_WORDS, SH_TIME: SH_TIME, SH_LIVES: SH_LIVES, GRID_C: GRID_C, GRID_R: GRID_R, HUNT_PAR: HUNT_PAR },
    kb: function () { return KB; }
  };

  if (CT.register) CT.register(GAME);
  WD.GAME = GAME;
})();
