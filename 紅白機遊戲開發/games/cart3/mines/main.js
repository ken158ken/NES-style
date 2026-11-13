/*
 * games/cart3/mines/main.js — 《星塵探雷 STAR MINES》（cart3 槽 3，id = mines，全域 CT.Mines）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/*、games/cart1/registry.js、mines/{gen,art,song}.js
 * 舊作概念：legacy minesweeper.html（只取「開格 / 插旗 / 數字提示 / 三難度」玩法；程式、文案、外觀全部重做）。
 *
 * 友善版重點
 *   - **保證無猜盤面**：第一下按下去才產生盤面（首擊 3×3 無雷 ⇒ 必打開一片），產生器反覆抽盤，
 *     直到 gen.js 的邏輯解題器（單點 / 兩兩 / 全域三條規則）能從首擊一路解完；每幀限 4 ms（分幀抽盤，畫面不卡）。
 *   - 復原：SELECT 退回上一步（踩雷後也能退）；暫停選單有 HINT（指出一格推得出的安全格 / 插錯的旗）。
 *   - 和弦開格：在數字上按 A，周圍旗數 = 數字 ⇒ 一次開完其餘鄰格。
 * 難度：EASY 10×10 / 12、NORMAL 12×11 / 24、HARD 14×12 / 40、CUSTOM（寬 6~14 偶數、高 6~12、雷 3~25%）。
 *   每格 16×16（2×2 磁磚 = 一個屬性區塊 ⇒ 數字每格換色）；寬只取偶數是為了盤面左上對齊屬性格。
 * 畫面：盤面 / HUD / 視窗全在背景名稱表，寫入走「影子表 + 差異佇列」（每幀 ≤ 140 byte，含屬性）；
 *   精靈只有游標角括號 4 顆（每線 2 顆）+ 提示框 4 顆 + 標題探測機 4 顆。
 * 評價：計時 + 三星（時間 ≤ 標準且沒用提示 / 復原 = ★3）；每難度最佳時間、目前連勝。
 * 網址：`cart3.html?game=mines&debug=1[&bot=1][&mode=0..3][&seed=N][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MI = CT.Mines = CT.Mines || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var Gen = MI.Gen;

  /* ============================== 常數 ============================== */
  var MODES = [
    { name: 'EASY', w: 10, h: 10, m: 12, par: 45 },
    { name: 'NORMAL', w: 12, h: 11, m: 24, par: 120 },
    { name: 'HARD', w: 14, h: 12, m: 40, par: 240 },
    { name: 'CUSTOM', w: 8, h: 8, m: 10, par: 0 }
  ];
  var NT_LIMIT = 140, REP_FIRST = 12, REP_NEXT = 4, GEN_MS = 4, GEN_MAX_TRIES = 400, HIST_MAX = 60;
  var PAL_BG = [
    [0x13, 0x23, 0x38],      // 0：星岩 / 外框 / HUD 文字
    [0x01, 0x1C, 0x21],      // 1：星圖 + 數字 1 / 4 / 7
    [0x01, 0x28, 0x2A],      // 2：數字 2 / 6
    [0x01, 0x16, 0x26]       // 3：數字 3 / 5 / 8、雷
  ];
  var PAL_SPR = [[0x30, 0x38, 0x28], [0x2A, 0x3A, 0x30], [0x11, 0x21, 0x31], [0x27, 0x37, 0x30]];
  var DIGIT = [null, ['D1c3', 1], ['D2c3', 2], ['D3c3', 3], ['D4c2', 1], ['D5c2', 3], ['D6c2', 2], ['D7c3', 1], ['D8c3', 3]];
  var TITLE_ROWS = [11, 13, 15, 17];

  /* ============================== 影子名稱表 + 屬性（差異佇列） ============================== */
  var want = new Uint8Array(960 + 240), have = new Uint8Array(960 + 240), dirty = new Uint8Array(960 + 240);
  var queue = [], qi = 0, ntWrites = 0;
  function put(c, r, t) {
    if (c < 0 || c > 31 || r < 0 || r > 29) return;
    var i = r * 32 + c;
    want[i] = t;
    if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function putAttr(bc, br, p) {
    if (bc < 0 || bc > 15 || br < 0 || br > 14) return;
    var i = 960 + br * 16 + bc;
    want[i] = p;
    if (have[i] !== p && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function text(c, r, s) { s = String(s); for (var i = 0; i < s.length; i++) put(c + i, r, A.ch(s.charAt(i))); }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function flush(unlimited) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
    while (qi < queue.length) {
      if (!unlimited && base + n >= NT_LIMIT) break;
      var i = queue[qi++];
      dirty[i] = 0;
      if (want[i] !== have[i]) {
        if (i < 960) ppu0.setTile(0, i & 31, i >> 5, want[i]);
        else { var k = i - 960; ppu0.setAttr(0, k & 15, k >> 4, want[i]); }
        have[i] = want[i]; n++;
      }
    }
    if (qi >= queue.length) { queue.length = 0; qi = 0; }
    ntWrites = n;
    return n;
  }
  function ntReset() { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; }

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, A = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, sel: 0, modeIdx: 0, cw: 8, chh: 8, cm: 10,
      W: 10, H: 10, M: 12, ox: 6, oy: 6, view: null, mines: null, num: null, cx: 0, cy: 0,
      sub: 'ready', timer: 0, hints: 0, undos: 0, hist: [], gen: null, genFrames: 0, boardNo: 0, baseSeed: 1,
      boomAt: -1, shown: null, deadT: 0, resultT: 0, stars: 0, newBest: false,
      paused: false, pauseSel: 0, msg: '', msgT: 0, hintCell: -1, hintT: 0,
      boardCheated: false, boardDied: false, streak: 0, sessStreak: 0, wins: 0, losses: 0,
      goal: false, cheats: 0, flashT: 0, rep: { key: 0, t: 0 }, backdrop: 0x0F,
      bot: { t: 0, tx: -1, ty: -1, act: 'A' }
    };
  }
  function modeCfg() {
    var m = MODES[g.modeIdx];
    if (g.modeIdx === 3) return { name: 'CUSTOM', w: g.cw, h: g.chh, m: g.cm, par: Math.round((g.cw * g.chh - g.cm) * 0.6) };
    return m;
  }
  function maxMines(w, h) { return Math.max(3, Math.min(Math.floor(w * h / 4), w * h - 9)); }

  /* ============================== 輸入：一格一格（按住：首延遲 12、之後每 4 幀） ============================== */
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  function dirStep() {
    var dx = held(BTN.LEFT) ? -1 : (held(BTN.RIGHT) ? 1 : 0), dy = held(BTN.UP) ? -1 : (held(BTN.DOWN) ? 1 : 0);
    var key = dx || dy ? ((dx + 2) * 4 + dy + 2) : 0, r = g.rep;
    if (key !== r.key) { r.key = key; r.t = 0; return key ? [dx, dy] : null; }
    if (!key) return null;
    r.t++;
    if (r.t >= REP_FIRST && (r.t - REP_FIRST) % REP_NEXT === 0) return [dx, dy];
    return null;
  }

  /* ============================== 盤面操作 ============================== */
  function idx(x, y) { return y * g.W + x; }
  function countIf(fn) { var n = 0; for (var i = 0; i < g.W * g.H; i++) if (fn(g.view[i], i)) n++; return n; }
  function flags() { return countIf(function (v) { return v === -2; }); }
  function openedCount() { return countIf(function (v) { return v >= 0 && v <= 8; }); }
  function snapshot() {
    g.hist.push(new Int8Array(g.view));
    if (g.hist.length > HIST_MAX) g.hist.shift();
  }
  function newBoard(keepStreakCheck) {
    var c = modeCfg();
    if (keepStreakCheck && g.sub === 'live') breakStreak();       // 中途放棄 = 連勝中斷
    g.W = c.w; g.H = c.h; g.M = c.m;
    g.ox = (16 - g.W) & ~1; if (g.ox < 2) g.ox = 2;
    g.oy = 4 + 2 * ((12 - g.H) >> 1);
    g.view = new Int8Array(g.W * g.H); g.view.fill(-1);
    g.mines = null; g.num = null; g.shown = new Uint8Array(g.W * g.H);
    g.cx = g.W >> 1; g.cy = g.H >> 1;
    g.sub = 'ready'; g.timer = 0; g.hints = 0; g.undos = 0; g.hist = []; g.gen = null; g.genFrames = 0;
    g.boomAt = -1; g.deadT = 0; g.resultT = 0; g.stars = 0; g.newBest = false; g.paused = false;
    g.hintCell = -1; g.hintT = 0; g.boardCheated = false; g.boardDied = false; g.msg = ''; g.msgT = 0;
    g.boardNo++;
  }
  function startGame() {
    g.mode = 'play';
    newBoard(false);
    g.streak = CT.load('mines', 'streak' + g.modeIdx, 0);
    CT.blank(nes0, function () { drawPlayScreen(); });
    MI.Audio.stop(); MI.Audio.play('mines_play');
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false;
    CT.blank(nes0, function () { drawTitleScreen(); });
    MI.Audio.stop(); MI.Audio.play('mines_title');
  }
  function boardSeed() { return ((g.baseSeed * 2654435761) ^ (g.boardNo * 7919) ^ (g.modeIdx << 20)) >>> 0; }
  function beginGen() {
    g.gen = Gen.Generator(g.W, g.H, g.M, idx(g.cx, g.cy), boardSeed());
    g.sub = 'gen'; g.genFrames = 0;
    stepGen();
  }
  function stepGen() {
    var t0 = now();
    g.genFrames++;
    while (!g.gen.done) {
      g.gen.step(1);
      if (g.gen.tries % 8 === 0 && (now() - t0 > GEN_MS || g.gen.tries >= GEN_MAX_TRIES * g.genFrames)) break;
    }
    if (g.gen.done) {
      g.mines = g.gen.mines; g.num = Gen.counts(g.W, g.H, g.mines);
      g.sub = 'live'; g.timer = 0;
      reveal(idx(g.cx, g.cy), true);
    } else if (g.genFrames % 6 === 0) sfx('mines_scan');
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function reveal(i, first) {
    if (g.view[i] !== -1) return 0;
    if (!first) snapshot();
    var opened = Gen.openCell(g.W, g.H, g.mines, g.num, g.view, i);
    if (g.view[i] === 9) { die(i); return opened.length; }
    sfx(opened.length > 1 ? 'mines_flood' : 'mines_open');
    checkWin();
    return opened.length;
  }
  function chord(i) {
    var v = g.view[i], nb = Gen.neighbors(g.W, g.H)[i], f = 0, hid = [], j;
    if (v < 1 || v > 8) return false;
    for (j = 0; j < nb.length; j++) { if (g.view[nb[j]] === -2) f++; else if (g.view[nb[j]] === -1) hid.push(nb[j]); }
    if (f !== v || !hid.length) { sfx('mines_menu'); return false; }
    snapshot();
    var boom = -1;
    for (j = 0; j < hid.length; j++) {
      Gen.openCell(g.W, g.H, g.mines, g.num, g.view, hid[j]);
      if (g.view[hid[j]] === 9 && boom < 0) boom = hid[j];
    }
    if (boom >= 0) { die(boom); return true; }
    sfx('mines_chord');
    checkWin();
    return true;
  }
  function toggleFlag(i) {
    var v = g.view[i];
    if (v === -1) { snapshot(); g.view[i] = -2; sfx('mines_flag'); return true; }
    if (v === -2) { snapshot(); g.view[i] = -1; sfx('mines_unflag'); return true; }
    return false;
  }
  function die(i) {
    g.sub = 'dead'; g.boomAt = i; g.deadT = 0; g.losses++;
    g.shown = new Uint8Array(g.W * g.H);
    breakStreak();
    sfx('mines_boom');
    MI.Audio.stop(); MI.Audio.play('mines_lose');
    g.flashT = 10;
    setMsg('BOOM!  SELECT:UNDO  A:NEW', 9999);
  }
  function breakStreak() {
    g.streak = 0; g.sessStreak = 0;
    CT.save('mines', 'streak' + g.modeIdx, 0);
  }
  function checkWin() {
    var need = g.W * g.H - g.M;
    if (openedCount() < need) return false;
    for (var i = 0; i < g.W * g.H; i++) if (g.view[i] === -1) g.view[i] = -2;   // 剩下的雷自動插旗
    g.sub = 'won'; g.resultT = 0; g.wins++;
    var sec = Math.floor(g.timer / 60), c = modeCfg();
    var clean = !g.boardCheated && !g.boardDied;
    g.stars = (sec <= c.par && !g.hints && !g.undos) ? 3 : ((sec <= c.par * 2 && g.hints + g.undos <= 1) ? 2 : 1);
    if (!clean) g.stars = 1;
    g.newBest = false;
    if (!g.boardCheated && g.modeIdx < 3) {
      var b = CT.load('mines', 'best' + g.modeIdx, 0);
      if (!b || g.timer < b) { CT.save('mines', 'best' + g.modeIdx, g.timer); g.newBest = true; }
    }
    if (clean) {
      g.streak++; CT.save('mines', 'streak' + g.modeIdx, g.streak);
      if (g.modeIdx === 0) { g.sessStreak++; if (g.sessStreak >= 3 && g.cheats === 0) g.goal = true; }
    } else { g.streak = 0; g.sessStreak = 0; CT.save('mines', 'streak' + g.modeIdx, 0); }
    MI.Audio.stop(); MI.Audio.play('mines_win');
    setMsg('', 0);
    return true;
  }
  function undo() {
    if (!g.hist.length) { sfx('mines_menu'); setMsg('NOTHING TO UNDO', 90); return false; }
    var wasDead = g.sub === 'dead';
    g.view = g.hist.pop();
    g.undos++;
    if (wasDead) {
      g.sub = 'live'; g.boardDied = true; g.boomAt = -1; g.shown = new Uint8Array(g.W * g.H);
      MI.Audio.stop(); MI.Audio.play('mines_play');
    }
    setMsg(wasDead ? 'REWOUND!  CAREFUL NOW' : 'UNDO', 90);
    sfx('mines_undo');
    return true;
  }
  function hint() {
    var i, best = -1, bd = 1e9;
    // ① 插錯的旗（看答案：提示是「系統」給的，不是玩家推的）
    for (i = 0; i < g.W * g.H; i++) if (g.view[i] === -2 && !g.mines[i]) { best = i; break; }
    if (best >= 0) { setHint(best, 'HINT: THIS FLAG IS WRONG'); return true; }
    // ② 推得出的安全格（把旗子當未知再推一次，保證提示本身也是「邏輯可得」的）
    var d = Gen.deduce(g.W, g.H, g.view, g.M, { ignoreFlags: true });
    for (i = 0; i < d.safe.length; i++) {
      var c = d.safe[i];
      if (g.view[c] !== -1) continue;
      var dist = Math.abs(c % g.W - g.cx) + Math.abs(((c / g.W) | 0) - g.cy);
      if (dist < bd) { bd = dist; best = c; }
    }
    if (best >= 0) { setHint(best, 'HINT: THIS CELL IS SAFE'); return true; }
    for (i = 0; i < d.mine.length; i++) if (g.view[d.mine[i]] === -1) { setHint(d.mine[i], 'HINT: FLAG THIS ONE'); return true; }
    setMsg('NO HINT NEEDED', 90);
    return false;
  }
  function setHint(i, m) {
    g.hints++; g.hintCell = i; g.hintT = 150;
    g.cx = i % g.W; g.cy = (i / g.W) | 0;
    setMsg(m, 150); sfx('mines_hint');
  }
  function setMsg(m, t) { g.msg = m; g.msgT = t; }
  function sfx(n) { MI.Audio.sfx(n); }

  /* ============================== 更新 ============================== */
  function updateTitle() {
    var c3 = g.modeIdx === 3, rowsN = c3 ? 4 : 1;
    if (pressed(BTN.UP)) { g.sel = (g.sel + rowsN - 1) % rowsN; sfx('mines_menu'); }
    if (pressed(BTN.DOWN)) { g.sel = (g.sel + 1) % rowsN; sfx('mines_menu'); }
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0);
    if (d) {
      if (g.sel === 0) { g.modeIdx = (g.modeIdx + d + 4) % 4; if (g.modeIdx !== 3) g.sel = 0; }
      else if (g.sel === 1) g.cw = Math.max(6, Math.min(14, g.cw + d * 2));
      else if (g.sel === 2) g.chh = Math.max(6, Math.min(12, g.chh + d));
      else g.cm = g.cm + d;
      g.cm = Math.max(3, Math.min(maxMines(g.cw, g.chh), g.cm));
      sfx('mines_menu');
    }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('mines_ok'); startGame(); }
  }
  function updatePlay() {
    if (g.msgT > 0 && g.msgT < 9999) g.msgT--;
    if (g.hintT > 0) { g.hintT--; if (!g.hintT) g.hintCell = -1; }
    if (g.flashT > 0) g.flashT--;
    // START：暫停選單（SELECT 同時按著 = 回選單組合，不處理）
    if (pressed(BTN.START) && !held(BTN.SELECT)) {
      if (g.sub === 'won') { if (g.resultT > 20) { toTitle(); } return; }
      if (g.sub === 'dead') { toTitle(); return; }
      g.paused = !g.paused; g.pauseSel = 0;
      if (g.paused) { MI.Audio.pause(); setMsg('HOLD START+SELECT: MENU', 9999); }
      else { MI.Audio.resume(); setMsg('', 0); }
      sfx('mines_menu');
      return;
    }
    if (g.paused) { updatePause(); return; }
    if (g.sub === 'gen') { stepGen(); return; }
    if (g.sub === 'won') {
      g.resultT++;
      if (g.resultT === 40) sfx('mines_star');
      if (g.resultT > 40 && pressed(BTN.A)) { newBoard(false); sfx('mines_ok'); MI.Audio.stop(); MI.Audio.play('mines_play'); }
      return;
    }
    if (g.sub === 'dead') {
      g.deadT++;
      if (g.deadT % 3 === 0) revealNextMine();
      if (pressed(BTN.SELECT) && !held(BTN.START)) { undo(); return; }
      if (g.deadT > 20 && pressed(BTN.A)) { newBoard(false); setMsg('', 0); MI.Audio.stop(); MI.Audio.play('mines_play'); }
      return;
    }
    if (g.sub === 'live') g.timer = Math.min(g.timer + 1, 99 * 3600 + 59 * 60);
    var mv = dirStep();
    if (mv) {
      var nx = Math.max(0, Math.min(g.W - 1, g.cx + mv[0])), ny = Math.max(0, Math.min(g.H - 1, g.cy + mv[1]));
      if (nx !== g.cx || ny !== g.cy) { g.cx = nx; g.cy = ny; sfx('mines_move'); }
    }
    var i = idx(g.cx, g.cy);
    if (g.sub === 'ready') {
      if (pressed(BTN.A)) beginGen();
      return;
    }
    if (pressed(BTN.A)) {
      if (g.view[i] === -1) reveal(i, false);
      else if (g.view[i] >= 1 && g.view[i] <= 8) chord(i);
      else sfx('mines_menu');
    } else if (pressed(BTN.B)) toggleFlag(i);
    else if (pressed(BTN.SELECT) && !held(BTN.START)) undo();
  }
  var PAUSE_ITEMS = ['RESUME', 'HINT', 'UNDO', 'NEW BOARD', 'TITLE'];
  function updatePause() {
    if (pressed(BTN.UP)) { g.pauseSel = (g.pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; sfx('mines_menu'); }
    if (pressed(BTN.DOWN)) { g.pauseSel = (g.pauseSel + 1) % PAUSE_ITEMS.length; sfx('mines_menu'); }
    if (pressed(BTN.B)) { unpause(); return; }
    if (!pressed(BTN.A)) return;
    var it = PAUSE_ITEMS[g.pauseSel];
    unpause();
    if (it === 'HINT') { if (g.sub === 'live') hint(); else setMsg('OPEN A CELL FIRST', 90); }
    else if (it === 'UNDO') undo();
    else if (it === 'NEW BOARD') { newBoard(true); sfx('mines_ok'); }
    else if (it === 'TITLE') { if (g.sub === 'live') breakStreak(); toTitle(); }
  }
  function unpause() { g.paused = false; MI.Audio.resume(); setMsg('', 0); }
  function revealNextMine() {
    // 由爆點往外，一次揭一顆（雷 / 插錯的旗）
    var best = -1, bd = 1e9, bx = g.boomAt % g.W, by = (g.boomAt / g.W) | 0;
    for (var i = 0; i < g.W * g.H; i++) {
      if (g.shown[i] || i === g.boomAt) continue;
      var isMine = g.mines[i] && g.view[i] === -1, isWrong = g.view[i] === -2 && !g.mines[i];
      if (!isMine && !isWrong) continue;
      var d = Math.max(Math.abs(i % g.W - bx), Math.abs(((i / g.W) | 0) - by));
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) g.shown[best] = 1;
  }

  /* ============================== 畫面 ============================== */
  function box(c0, r0, c1, r1) {
    var c, r;
    put(c0, r0, A.t('FR_TL')); put(c1, r0, A.t('FR_TR')); put(c0, r1, A.t('FR_BL')); put(c1, r1, A.t('FR_BR'));
    for (c = c0 + 1; c < c1; c++) { put(c, r0, A.t('FR_T')); put(c, r1, A.t('FR_B')); }
    for (r = r0 + 1; r < r1; r++) { put(c0, r, A.t('FR_L')); put(c1, r, A.t('FR_R')); }
  }
  function fillBox(c0, r0, c1, r1) {
    var c, r, sp = A.t('SP');
    for (r = r0 + 1; r < r1; r++) for (c = c0 + 1; c < c1; c++) put(c, r, sp);
    for (r = r0 >> 1; r <= r1 >> 1; r++) for (c = c0 >> 1; c <= c1 >> 1; c++) putAttr(c, r, 0);
    box(c0, r0, c1, r1);
  }
  function stars(seed, count, avoid) {
    var s = seed, i;
    for (i = 0; i < count; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (avoid && avoid(c, r)) continue;
      put(c, r, A.t((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
  }
  function setPalettes() {
    ppu0.setBackdrop(0x0F); g.backdrop = 0x0F;
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  var LOGO = {
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
    E: ['####', '#...', '###.', '#...', '####'],
    S: ['.###', '#...', '.##.', '...#', '###.']
  };
  function drawTitleScreen() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes();
    var sp = A.t('SP'), r, c;
    for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) put(c, r, sp);
    stars(11, 60, function (c2, r2) { return r2 >= 2 && r2 <= 28 && c2 >= 2 && c2 <= 29; });
    text(12, 2, 'STARDUST');
    var word = 'MINES', x0 = 4, k, x, y;
    for (k = 0; k < word.length; k++) {
      var gl = LOGO[word.charAt(k)];
      for (y = 0; y < 5; y++) for (x = 0; x < gl[y].length; x++) if (gl[y].charAt(x) === '#') put(x0 + x, 3 + y, A.t((x + y + k) % 4 ? 'CHIP' : 'CHIP3'));
      x0 += gl[0].length + 1;
    }
    text(4, 9, 'LOGIC ONLY - NO GUESSING');
    box(1, 10, 30, 28);
    text(3, 21, 'A OPEN  B FLAG  SELECT UNDO');
    text(3, 23, 'START PAUSE/HINT  C/$ CHEAT');
    text(3, 25, 'HOLD START+SELECT: MENU');
    flush(true);
    drawTitleValues();
    flush(true);
  }
  function fmtTime(frames) {
    if (!frames) return '--:--';
    var s = Math.floor(frames / 60);
    return num(Math.min(99, Math.floor(s / 60)), 2) + ':' + num(s % 60, 2);
  }
  function drawTitleValues() {
    var c = modeCfg(), cus = g.modeIdx === 3, i;
    var labels = ['MODE', 'WIDTH', 'HEIGHT', 'MINES'];
    var vals = ['< ' + pad(c.name, 6) + ' >', (cus ? '< ' : '  ') + num(c.w, 2) + (cus ? ' >' : '  '),
                (cus ? '< ' : '  ') + num(c.h, 2) + (cus ? ' >' : '  '), (cus ? '< ' : '  ') + num(c.m, 2) + (cus ? ' >' : '  ')];
    for (i = 0; i < 4; i++) {
      put(3, TITLE_ROWS[i], (g.sel === i) ? A.t('ARROW') : A.t('SP'));
      text(5, TITLE_ROWS[i], pad(labels[i], 7));
      text(13, TITLE_ROWS[i], pad(vals[i], 12));
    }
    var best = g.modeIdx < 3 ? CT.load('mines', 'best' + g.modeIdx, 0) : 0;
    var st = g.modeIdx < 3 ? CT.load('mines', 'streak' + g.modeIdx, 0) : 0;
    text(5, 19, g.modeIdx < 3 ? ('BEST ' + fmtTime(best) + '  STREAK ' + num(st, 2)) : pad('NO RECORDS IN CUSTOM', 24));
    text(11, 27, (g.frames >> 4) & 1 ? 'PUSH START' : '          ');
  }
  function drawPlayScreen() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes();
    var sp = A.t('SP'), r, c;
    for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) put(c, r, sp);
    for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) putAttr(c, r, 0);
    var ox = g.ox, oy = g.oy, W2 = g.W * 2, H2 = g.H * 2;
    stars(5, 50, function (c2, r2) { return r2 <= 2 || (c2 >= ox - 1 && c2 <= ox + W2 && r2 >= oy - 1 && r2 <= oy + H2); });
    box(ox - 1, oy - 1, ox + W2, oy + H2);
    put(ox - 1, oy - 1, A.t('FR_GEM')); put(ox + W2, oy - 1, A.t('FR_GEM'));
    put(1, 1, A.t('IC_MINE')); put(23, 1, A.t('IC_CLK'));
    render();
    flush(true);
  }
  function cellLook(i) {
    var v = g.view[i], x = i % g.W, y = (i / g.W) | 0;
    if (g.paused) return ['VEIL', 0];
    if (v === -1) {
      if (g.sub === 'dead' && g.shown[i] && g.mines[i]) return ['MINE', 3];
      return [((x + y) & 1) ? 'ROCKb' : 'ROCKa', 0];
    }
    if (v === -2) { if (g.sub === 'dead' && g.shown[i]) return ['WRONG', 3]; return ['FLAG', 0]; }
    if (v === 9) return ['BOOM', 3];
    if (v === 0) return ['FLOOR', 1];
    return DIGIT[v];
  }
  var cellCache = {};
  function cellTiles(name) { return cellCache[name] || (cellCache[name] = A.cell(name)); }
  function renderBoard() {
    var x, y;
    for (y = 0; y < g.H; y++) for (x = 0; x < g.W; x++) {
      var look = cellLook(y * g.W + x), t = cellTiles(look[0]), c = g.ox + x * 2, r = g.oy + y * 2;
      put(c, r, t[0]); put(c + 1, r, t[1]); put(c, r + 1, t[2]); put(c + 1, r + 1, t[3]);
      putAttr((g.ox >> 1) + x, (g.oy >> 1) + y, look[1]);
    }
  }
  function renderHUD() {
    var left = g.M - flags();
    text(2, 1, (left < 0 ? '-' : ' ') + num(Math.abs(left), 2));
    var c = modeCfg();
    text(8, 1, pad(c.name + ' ' + c.w + 'X' + c.h, 13));
    var t = g.sub === 'ready' || g.sub === 'gen' ? 0 : g.timer;
    var s = Math.floor(t / 60);
    text(25, 1, num(Math.min(99, Math.floor(s / 60)), 2) + ':' + num(s % 60, 2));
    var line;
    if (g.msgT > 0 && g.msg) line = g.msg;
    else if (g.sub === 'ready') line = 'PICK A START CELL: PUSH A';
    else if (g.sub === 'gen') line = (g.genFrames > 2) ? 'SCANNING STAR FIELD' + '...'.substring(0, (g.genFrames >> 3) % 4) : '';
    else line = 'STREAK ' + num(g.streak, 2) + '  HINT ' + g.hints + '  UNDO ' + Math.min(99, g.undos);
    text(1, 2, pad(line, 30));
    var bottom = g.oy + g.H * 2 + 1;
    if (bottom <= 28) text(2, 28, pad(g.paused ? '' : 'A OPEN B FLAG SELECT UNDO', 28));
  }
  function renderOverlay() {
    if (g.paused) {
      fillBox(8, 8, 23, 21);
      text(13, 9, 'PAUSED');
      for (var i = 0; i < PAUSE_ITEMS.length; i++) {
        put(10, 11 + i * 2, g.pauseSel === i ? A.t('ARROW') : A.t('SP'));
        text(12, 11 + i * 2, PAUSE_ITEMS[i]);
      }
      return;
    }
    if (g.sub === 'won' && g.resultT >= 30) {
      fillBox(6, 8, 25, 21);
      text(9, 9, 'SCAN COMPLETE!');
      text(9, 11, 'TIME   ' + fmtTime(Math.max(1, g.timer)));
      var sn = g.resultT < 40 ? 0 : Math.min(g.stars, ((g.resultT - 40) >> 3) + 1);
      for (var k = 0; k < 3; k++) put(13 + k * 2, 13, A.t(k < sn ? 'STAR_ON' : 'STAR_OFF'));
      var best = g.modeIdx < 3 ? CT.load('mines', 'best' + g.modeIdx, 0) : 0;
      text(9, 15, g.modeIdx < 3 ? ('BEST   ' + fmtTime(best)) : 'CUSTOM BOARD   ');
      text(9, 16, g.newBest && (g.resultT >> 4) & 1 ? ' NEW RECORD!' : '            ');
      text(9, 17, 'STREAK ' + num(g.streak, 2));
      text(7, 19, 'A:NEXT START:TITLE');
    }
  }
  function render() { renderBoard(); renderHUD(); renderOverlay(); }

  function drawSprites() {
    var i;
    if (g.mode === 'title') {
      var bob = ((g.frames >> 4) & 1);
      var px = 184, py = 6 + bob;
      ppu0.sprite(8, { x: px, y: py, tile: A.s('PROBE_0'), pal: 2 }); ppu0.sprite(9, { x: px + 8, y: py, tile: A.s('PROBE_1'), pal: 2 });
      ppu0.sprite(10, { x: px, y: py + 8, tile: A.s('PROBE_2'), pal: 2 }); ppu0.sprite(11, { x: px + 8, y: py + 8, tile: A.s('PROBE_3'), pal: 2 });
      for (i = 0; i < 8; i++) ppu0.sprite(i, null);
      return;
    }
    for (i = 8; i < 12; i++) ppu0.sprite(i, null);
    var showCur = !g.paused && (g.sub === 'ready' || g.sub === 'live' || g.sub === 'gen' || g.sub === 'dead');
    if (!showCur) { for (i = 0; i < 8; i++) ppu0.sprite(i, null); return; }
    var x0 = (g.ox + g.cx * 2) * 8, y0 = (g.oy + g.cy * 2) * 8;
    var t = A.s(((g.frames >> 4) & 1) ? 'CUR1' : 'CUR0'), pal = g.sub === 'dead' ? 3 : 0;
    ppu0.sprite(0, { x: x0 - 1, y: y0 - 1, tile: t, pal: pal });
    ppu0.sprite(1, { x: x0 + 9, y: y0 - 1, tile: t, pal: pal, flipH: true });
    ppu0.sprite(2, { x: x0 - 1, y: y0 + 9, tile: t, pal: pal, flipV: true });
    ppu0.sprite(3, { x: x0 + 9, y: y0 + 9, tile: t, pal: pal, flipH: true, flipV: true });
    if (g.hintCell >= 0 && (g.hintT >> 3) & 1) {
      var hx = (g.ox + (g.hintCell % g.W) * 2) * 8, hy = (g.oy + ((g.hintCell / g.W) | 0) * 2) * 8;
      ppu0.sprite(4, { x: hx, y: hy, tile: A.s('HINT'), pal: 1 }); ppu0.sprite(5, { x: hx + 8, y: hy, tile: A.s('HINT'), pal: 1, flipH: true });
      ppu0.sprite(6, { x: hx, y: hy + 8, tile: A.s('HINT'), pal: 1, flipV: true }); ppu0.sprite(7, { x: hx + 8, y: hy + 8, tile: A.s('HINT'), pal: 1, flipH: true, flipV: true });
    } else for (i = 4; i < 8; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）：只看畫面上看得到的 view，用解題器推 ============================== */
  function botTarget() {
    var b = g.bot;
    if (b.tx >= 0) {
      var ti = idx(b.tx, b.ty);
      if (b.act === 'A' && g.view[ti] === -1) return;
      if (b.act === 'B' && g.view[ti] === -1) return;
    }
    var d = Gen.deduce(g.W, g.H, g.view, g.M), best = -1, bd = 1e9, i, act = 'A';
    for (i = 0; i < d.safe.length; i++) {
      var c = d.safe[i];
      if (g.view[c] !== -1) continue;
      var dist = Math.abs(c % g.W - g.cx) + Math.abs(((c / g.W) | 0) - g.cy);
      if (dist < bd) { bd = dist; best = c; }
    }
    if (best < 0) {
      // 推不出安全格（無猜盤面不會發生）⇒ 插旗推得出的雷，再不行就猜最遠離數字的格子
      for (i = 0; i < d.mine.length; i++) if (g.view[d.mine[i]] === -1) { best = d.mine[i]; act = 'B'; break; }
      if (best < 0) for (i = 0; i < g.W * g.H; i++) if (g.view[i] === -1) { best = i; b.guesses = (b.guesses || 0) + 1; break; }
    }
    b.act = act;
    b.tx = best < 0 ? -1 : best % g.W; b.ty = best < 0 ? -1 : (best / g.W) | 0;
  }
  function bot() {
    var b = g.bot;
    b.t++;
    if (g.mode === 'title') {
      if (b.t & 7) return 0;
      if (g.sel !== 0) return BTN.UP;
      if (g.modeIdx !== 0) return BTN.LEFT;
      return BTN.START;
    }
    if (g.paused) return (b.t & 15) === 0 ? BTN.START : 0;
    if (g.sub === 'gen') return 0;
    if (g.sub === 'won') return (g.resultT > 50 && !g.goal && (b.t & 15) === 0) ? BTN.A : 0;
    if (g.sub === 'dead') return (g.deadT > 30 && (b.t & 15) === 0) ? BTN.A : 0;
    if (b.t & 1) return 0;                    // 放開一幀 ⇒ 每次都是新的「按下」邊緣（一格一格走）
    var tx, ty, act = 'A';
    if (g.sub === 'ready') { tx = g.W >> 1; ty = g.H >> 1; }
    else { botTarget(); tx = b.tx; ty = b.ty; act = b.act; if (tx < 0) return 0; }
    if (g.cx < tx) return BTN.RIGHT;
    if (g.cx > tx) return BTN.LEFT;
    if (g.cy < ty) return BTN.DOWN;
    if (g.cy > ty) return BTN.UP;
    b.tx = -1;
    return act === 'B' ? BTN.B : BTN.A;
  }

  /* ============================== 密技 ============================== */
  // 遊玩中：一口氣開完「目前推得出來的所有安全格」並把推得出的雷插旗（不算提示）。
  // 踩雷後：原地續關（§6-1）= 退回踩雷前一步繼續；用過密技那盤不算連勝、goal() 一律 false。
  function cheat() {
    if (!g || g.mode !== 'play' || g.paused) return false;
    if (g.sub === 'dead') {
      if (!g.hist.length) return false;
      g.cheats++; g.boardCheated = true; g.undos--;
      undo();
      setMsg('STARDUST REWIND!', 90);
      return true;
    }
    if (g.sub !== 'live') return false;
    var d = Gen.deduce(g.W, g.H, g.view, g.M, { ignoreFlags: true }), i, n = 0;
    snapshot();
    for (i = 0; i < d.mine.length; i++) if (g.view[d.mine[i]] === -1) { g.view[d.mine[i]] = -2; n++; }
    for (i = 0; i < d.safe.length; i++) if (g.view[d.safe[i]] === -1) { Gen.openCell(g.W, g.H, g.mines, g.num, g.view, d.safe[i]); n++; }
    if (!n) { g.hist.pop(); return false; }
    g.cheats++; g.boardCheated = true;
    sfx('mines_chord'); setMsg('STARDUST SCAN!', 90);
    checkWin();
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'mines', order: 3, title: '星塵探雷', legacy: ['minesweeper.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu;
      A = MI.Art.make(); cellCache = {};
      NES.CHR.setPattern(0, A.bg);
      NES.CHR.setPattern(1, A.spr);
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      MI.Audio.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10);
      if (mq >= 0 && mq <= 3) g.modeIdx = mq;
      var sq = parseInt(q('seed') || '', 10);
      g.baseSeed = (isFinite(sq) && sq > 0) ? sq : ((Date.now() & 0xFFFFFF) | 1);
      drawTitleScreen();
      MI.Audio.play('mines_title');
      if (q('autostart') === '1') startGame();
    },
    update: function () {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else updatePlay();
      MI.Audio.tick();
    },
    draw: function () {
      if (g.mode === 'title') drawTitleValues();
      else {
        render();
        var bd = g.flashT > 0 && (g.flashT & 2) ? 0x16 : 0x0F;
        if (bd !== g.backdrop) { ppu0.setBackdrop(bd); g.backdrop = bd; }
      }
      flush(false);
      drawSprites();
    },
    exit: function () { MI.Audio.stop(); },
    get backTile() { MI.Art.make(); return { tile: MI.Art.make().s('BACK'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, sub: g.sub, modeIdx: g.modeIdx, sel: g.sel, W: g.W, H: g.H, M: g.M, cx: g.cx, cy: g.cy,
        opened: g.view ? openedCount() : 0, flags: g.view ? flags() : 0, timer: g.timer, hints: g.hints, undos: g.undos,
        streak: g.streak, sessStreak: g.sessStreak, wins: g.wins, losses: g.losses, stars: g.stars, paused: g.paused,
        pauseSel: g.pauseSel, goal: g.goal, cheats: g.cheats, boardCheated: g.boardCheated, boardDied: g.boardDied,
        genTries: g.gen ? g.gen.tries : 0, genFrames: g.genFrames, boardNo: g.boardNo, hist: g.hist.length,
        msg: g.msgT > 0 ? g.msg : '', hintCell: g.hintCell, guesses: g.bot.guesses || 0,
        music: MI.Audio.current, lastSfx: MI.Audio.lastSfx, queue: queue.length - qi, ntWrites: ntWrites, frames: g.frames
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    // R6 §1-6：右對齊 6 字元；最高難度有紀錄者優先，前綴難度字母（E / N / H）
    bestText: function () {
      for (var m = 2; m >= 0; m--) {
        var b = CT.load('mines', 'best' + m, 0);
        if (b) return 'ENH'.charAt(m) + fmtTime(b);
      }
      return ' --:--';
    }
  };

  // 測試鉤子（只讀寫本遊戲狀態）
  MI.dev = {
    g: function () { return g; },
    start: function (modeIdx) { if (modeIdx !== undefined) g.modeIdx = modeIdx; startGame(); },
    custom: function (w, h, m) { g.modeIdx = 3; g.cw = w; g.chh = h; g.cm = m; },
    cursor: function (x, y) { g.cx = x; g.cy = y; },
    // 直接指定雷位（測試用；跳過產生器）：rows = ['..*.', ...]，首擊 (sx, sy)
    setBoard: function (rows, sx, sy) {
      var H = rows.length, W = rows[0].length, i, x, y;
      g.W = W; g.H = H; g.M = 0;
      g.mines = new Uint8Array(W * H);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (rows[y].charAt(x) === '*') { g.mines[y * W + x] = 1; g.M++; }
      g.num = Gen.counts(W, H, g.mines);
      g.view = new Int8Array(W * H); g.view.fill(-1);
      g.shown = new Uint8Array(W * H); g.hist = [];
      g.ox = (16 - W) & ~1; if (g.ox < 2) g.ox = 2; g.oy = 4 + 2 * ((12 - H) >> 1);
      g.sub = 'live'; g.cx = sx; g.cy = sy; g.timer = 0;
      CT.blank(nes0, function () { drawPlayScreen(); });
      if (sx !== undefined) { i = sy * W + sx; reveal(i, true); }
    },
    view: function () { return Array.prototype.slice.call(g.view); },
    mines: function () { return g.mines ? Array.prototype.slice.call(g.mines) : null; },
    deduce: function (ignore) { return Gen.deduce(g.W, g.H, g.view, g.M, { ignoreFlags: !!ignore }); },
    modes: MODES, consts: { NT_LIMIT: NT_LIMIT, REP_FIRST: REP_FIRST, REP_NEXT: REP_NEXT, GEN_MS: GEN_MS },
    hint: function () { return hint(); },
    fmtTime: fmtTime
  };
  MI.MODES = MODES;

  if (CT.register) CT.register(GAME);
  MI.GAME = GAME;
})();
