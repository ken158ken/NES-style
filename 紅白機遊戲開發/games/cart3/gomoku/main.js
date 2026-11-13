/*
 * games/cart3/gomoku/main.js — 《星塵五子棋 STAR GOMOKU》（cart3 槽 4，id = gomoku，全域 CT.Gomoku）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/*、games/cart1/registry.js、gomoku/{ai,art,song}.js
 * 舊作概念：legacy gomoku.html + tic-tac-toe.html（只取「15 路五子棋對電腦 / 雙人、悔棋」與「井字對電腦」玩法；
 *           程式、AI、文案、外觀全部重做）。
 *
 * 內容
 *   - 五子棋 15×15（先連成 5 子以上者勝；太陽石先手）：對 CPU 三級（EASY / NORMAL / HARD，見 ai.js）或雙人同機。
 *   - 井字 3×3（連 3）/ 4×4（連 4）：對 CPU 三級或雙人。
 *   - 悔棋（SELECT：對 CPU 時退回自己上一手；輸了也能退）、提示（暫停選單 HINT：用 4 層搜尋建議一手）。
 * 畫面：棋盤 / 面板 / 訊息全在背景名稱表（影子表 + 差異佇列，每幀 ≤ 140 byte）；
 *   五子棋每個交叉點 = 1 磁磚（15×15 = 120×120 px，右側面板放雙方資訊 / 手數 / 時間）；
 *   精靈只有：游標 1 顆（井字 4 顆角）、最後一手記號 1、提示框 1、思考中星 1 ⇒ 每線 ≤ 4。
 * CPU 思考**分幀**：每幀最多 5 ms（ai.js 的 generator），思考中畫面照常動（游標可移、星星旋轉）。
 * 網址：`cart3.html?game=gomoku&debug=1[&bot=1][&g=0..2][&vs=0..3][&first=0|1][&seed=N][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var GO = CT.Gomoku = CT.Gomoku || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var AI = GO.AI;

  /* ============================== 常數 ============================== */
  var GAMES = [
    { name: 'GOMOKU 15', kind: 'g', n: 15 },
    { name: 'TIC-TAC 3X3', kind: 't', n: 3 },
    { name: 'TIC-TAC 4X4', kind: 't', n: 4 }
  ];
  var VS = ['CPU EASY', 'CPU NORMAL', 'CPU HARD', '2 PLAYERS'];
  var FIRST = ['YOU (SUN)', 'CPU (SUN)'];
  var NT_LIMIT = 140, REP_FIRST = 12, REP_NEXT = 4, THINK_MS = 5, MIN_THINK = 24;
  var PAL_BG = [[0x12, 0x28, 0x37], [0x12, 0x28, 0x30], [0x1C, 0x2C, 0x3C], [0x16, 0x26, 0x36]];
  var PAL_SPR = [[0x1C, 0x2C, 0x3C], [0x16, 0x16, 0x16], [0x2A, 0x2A, 0x3A], [0x28, 0x38, 0x30]];
  var HOSHI = { 48: 1, 56: 1, 168: 1, 176: 1, 112: 1 };       // (3,3) (11,3) (3,11) (11,11) (7,7)
  var TITLE_ROWS = [11, 13, 15];
  var PAUSE_ITEMS = ['RESUME', 'HINT', 'UNDO', 'NEW GAME', 'TITLE'];

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
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, A = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, sel: 0, gameIdx: 0, vsIdx: 1, firstIdx: 0,
      kind: 'g', n: 15, board: null, hist: [], turn: 1, human: 1, twoP: false, cx: 7, cy: 7,
      sub: 'turn', job: null, thinkT: 0, result: null, timer: 0, undos: 0, hints: 0,
      hintJob: null, hintCell: -1, hintT: 0, paused: false, pauseSel: 0, msg: '', msgT: 0, msgPal: 0,
      gameCheated: false, cheats: 0, goal: false, skipCpu: false, gameNo: 0, baseSeed: 1,
      maxThinkMs: 0, thinkFrames: 0, lastThinkFrames: 0, wins: 0, losses: 0, draws: 0, overT: 0,
      rep: { key: 0, t: 0 }, bot: { t: 0, job: null, ply: -1, target: -1, maxMs: 0, games: 0 }
    };
  }
  function isHuman(color) { return g.twoP || color === g.human; }
  function cpuLevel() { return Math.min(2, g.vsIdx); }

  /* ============================== 輸入 ============================== */
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

  /* ============================== 對局 ============================== */
  function startGame() {
    var gm = GAMES[g.gameIdx];
    g.mode = 'play'; g.kind = gm.kind; g.n = gm.n;
    g.board = new Int8Array(g.n * g.n); g.hist = []; g.turn = 1;
    g.twoP = g.vsIdx === 3; g.human = g.firstIdx === 0 ? 1 : 2;
    g.cx = g.n >> 1; g.cy = g.n >> 1;
    g.job = null; g.hintJob = null; g.hintCell = -1; g.hintT = 0; g.result = null; g.timer = 0; g.undos = 0; g.hints = 0;
    g.paused = false; g.gameCheated = false; g.skipCpu = false; g.msg = ''; g.msgT = 0; g.overT = 0;
    g.gameNo++;
    CT.blank(nes0, function () { drawPlayScreen(); });
    GO.Audio.stop(); GO.Audio.play('gomoku_play');
    nextTurn();
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false; g.job = null; g.hintJob = null;
    CT.blank(nes0, function () { drawTitleScreen(); });
    GO.Audio.stop(); GO.Audio.play('gomoku_title');
  }
  function nextTurn() {
    g.turn = (g.hist.length % 2 === 0) ? 1 : 2;
    if (isHuman(g.turn)) { g.sub = 'turn'; return; }
    if (g.skipCpu) {               // 密技：CPU 這手跳過（記 -1，悔棋時一起退）
      g.skipCpu = false; g.hist.push(-1); setMsg('STARDUST WIND! CPU PASSES', 120, 2);
      g.turn = (g.hist.length % 2 === 0) ? 1 : 2; g.sub = 'turn';
      return;
    }
    var seed = ((g.baseSeed * 2654435761) ^ (g.gameNo * 40503) ^ (g.hist.length * 9973)) >>> 0;
    g.job = g.kind === 'g' ? AI.think(g.board, g.turn, cpuLevel(), seed) : AI.thinkTTT(g.board, g.n, g.turn, cpuLevel(), seed);
    g.sub = 'think'; g.thinkT = 0; g.thinkFrames = 0;
  }
  function stepThink() {
    g.thinkT++;
    var j = g.job;
    if (!j.done) { j.run(THINK_MS, now); g.thinkFrames++; g.maxThinkMs = Math.max(g.maxThinkMs, j.maxMs); }
    if ((g.thinkT & 15) === 0) sfx('gomoku_think');
    if (j.done && g.thinkT >= MIN_THINK) {
      g.lastThinkFrames = g.thinkFrames;
      var m = j.move;
      g.job = null;
      if (m < 0 || g.board[m]) { for (m = 0; m < g.board.length && g.board[m]; m++); }   // 保險：不該發生
      place(m);
    }
  }
  function place(c) {
    var color = g.turn;
    g.board[c] = color; g.hist.push(c);
    sfx(isHuman(color) ? 'gomoku_place' : 'gomoku_cpu');
    var line = null, full = true, i;
    if (g.kind === 'g') line = AI.fiveAt(g.board, c);
    else { var w = AI.tttWinner(g.board, g.n); if (w && w.color) line = w.line; }
    for (i = 0; i < g.board.length; i++) if (!g.board[i]) { full = false; break; }
    if (line) { endGame(color, line); return; }
    if (full) { endGame(0, null); return; }
    // 五子棋：剛下的人形成「四」（下一手成五）⇒ 提醒
    if (g.kind === 'g' && !g.twoP && !isHuman(color)) {
      var st = AI.State(g.board);
      if (AI.fivePoints(st, color).length) { setMsg('CAREFUL: CPU HAS FOUR!', 120, 3); sfx('gomoku_threat'); }
    }
    g.hintCell = -1;
    nextTurn();
  }
  function endGame(winner, line) {
    g.sub = 'over'; g.result = { winner: winner, line: line }; g.overT = 0; g.job = null;
    GO.Audio.stop();
    if (!winner) { g.draws++; setMsg('DRAW!  A:NEW GAME', 9999, 0); GO.Audio.play('gomoku_lose'); return; }
    if (g.twoP) { setMsg((winner === 1 ? 'SUN' : 'MOON') + ' WINS!  A:NEW GAME', 9999, 2); GO.Audio.play('gomoku_win'); return; }
    if (winner === g.human) {
      g.wins++;
      setMsg('YOU WIN!  A:NEW GAME', 9999, 2);
      GO.Audio.play('gomoku_win');
      if (!g.gameCheated) {
        var key = 'w' + g.gameIdx + '_' + g.vsIdx;
        CT.save('gomoku', key, CT.load('gomoku', key, 0) + 1);
        if (g.kind === 'g' && g.vsIdx === 1 && g.cheats === 0) g.goal = true;
      }
    } else {
      g.losses++;
      setMsg('CPU WINS  SELECT:UNDO', 9999, 3);
      GO.Audio.play('gomoku_lose');
    }
  }
  function undo() {
    if (!g.hist.length || (!g.twoP && !g.hist.some(function (m, k) { return isHumanPly(k); }))) {
      setMsg('NOTHING TO UNDO', 90, 0); sfx('gomoku_menu'); return false;
    }
    g.job = null; g.hintJob = null; g.hintCell = -1;
    if (g.twoP) popMove();
    else {
      // 退到「輪到自己」：先退掉 CPU 的手，再退掉自己上一手
      while (g.hist.length && !isHumanPly(g.hist.length - 1)) popMove();
      if (g.hist.length) popMove();
    }
    g.undos++;
    if (g.sub === 'over') { GO.Audio.stop(); GO.Audio.play('gomoku_play'); }
    g.result = null; setMsg('UNDO', 60, 0);
    sfx('gomoku_undo');
    nextTurn();
    return true;
  }
  function isHumanPly(k) { return isHuman((k % 2 === 0) ? 1 : 2); }
  function popMove() {
    var m = g.hist.pop();
    if (m >= 0) { g.board[m] = 0; g.cx = m % g.n; g.cy = (m / g.n) | 0; }
  }
  function startHint() {
    if (g.sub !== 'turn') { setMsg('WAIT FOR YOUR TURN', 90, 0); return; }
    var seed = (g.baseSeed ^ (g.hist.length * 31)) >>> 0;
    g.hintJob = g.kind === 'g' ? AI.think(g.board, g.turn, 3, seed) : AI.thinkTTT(g.board, g.n, g.turn, 2, seed);
    setMsg('READING THE STARS...', 9999, 2);
  }
  function stepHint() {
    var j = g.hintJob;
    j.run(THINK_MS, now); g.maxThinkMs = Math.max(g.maxThinkMs, j.maxMs);
    if (!j.done) return;
    g.hintJob = null;
    if (j.move >= 0) {
      g.hints++; g.hintCell = j.move; g.hintT = 180;
      g.cx = j.move % g.n; g.cy = (j.move / g.n) | 0;
      setMsg('HINT: TRY HERE', 150, 2); sfx('gomoku_hint');
    }
  }
  function setMsg(m, t, pal) { g.msg = m; g.msgT = t; g.msgPal = pal || 0; }
  function sfx(n) { GO.Audio.sfx(n); }

  /* ============================== 更新 ============================== */
  function updateTitle() {
    var rowsN = g.vsIdx === 3 ? 2 : 3;
    if (g.sel >= rowsN) g.sel = 0;
    if (pressed(BTN.UP)) { g.sel = (g.sel + rowsN - 1) % rowsN; sfx('gomoku_menu'); }
    if (pressed(BTN.DOWN)) { g.sel = (g.sel + 1) % rowsN; sfx('gomoku_menu'); }
    var d = pressed(BTN.RIGHT) ? 1 : (pressed(BTN.LEFT) ? -1 : 0);
    if (d) {
      if (g.sel === 0) g.gameIdx = (g.gameIdx + d + GAMES.length) % GAMES.length;
      else if (g.sel === 1) g.vsIdx = (g.vsIdx + d + VS.length) % VS.length;
      else g.firstIdx ^= 1;
      sfx('gomoku_menu');
    }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('gomoku_ok'); startGame(); }
  }
  function updatePlay() {
    if (g.msgT > 0 && g.msgT < 9999) g.msgT--;
    if (g.hintT > 0) { g.hintT--; if (!g.hintT) g.hintCell = -1; }
    if (pressed(BTN.START) && !held(BTN.SELECT)) {
      if (g.sub === 'over') { toTitle(); return; }
      g.paused = !g.paused; g.pauseSel = 0;
      if (g.paused) { GO.Audio.pause(); setMsg('HOLD START+SELECT: MENU', 9999, 0); }
      else { GO.Audio.resume(); setMsg('', 0, 0); }
      sfx('gomoku_menu');
      return;
    }
    if (g.paused) { updatePause(); return; }
    if (g.sub === 'over') {
      g.overT++;
      if (pressed(BTN.SELECT) && !held(BTN.START)) { undo(); return; }
      if (g.overT > 30 && pressed(BTN.A)) { sfx('gomoku_ok'); startGame(); }
      return;
    }
    g.timer = Math.min(g.timer + 1, 99 * 3600);
    if (g.hintJob) stepHint();
    var mv = dirStep();
    if (mv) {
      var nx = Math.max(0, Math.min(g.n - 1, g.cx + mv[0])), ny = Math.max(0, Math.min(g.n - 1, g.cy + mv[1]));
      if (nx !== g.cx || ny !== g.cy) { g.cx = nx; g.cy = ny; sfx('gomoku_move'); }
    }
    if (pressed(BTN.SELECT) && !held(BTN.START)) { undo(); return; }
    if (g.sub === 'think') { stepThink(); return; }
    if (pressed(BTN.A)) {
      var c = g.cy * g.n + g.cx;
      if (!g.board[c]) { g.hintJob = null; place(c); }
      else sfx('gomoku_menu');
    } else if (pressed(BTN.B)) {
      // B：游標跳到最後一手（找回對手剛下的位置）
      for (var k = g.hist.length - 1; k >= 0; k--) if (g.hist[k] >= 0) { g.cx = g.hist[k] % g.n; g.cy = (g.hist[k] / g.n) | 0; sfx('gomoku_move'); break; }
    }
  }
  function updatePause() {
    if (pressed(BTN.UP)) { g.pauseSel = (g.pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; sfx('gomoku_menu'); }
    if (pressed(BTN.DOWN)) { g.pauseSel = (g.pauseSel + 1) % PAUSE_ITEMS.length; sfx('gomoku_menu'); }
    if (pressed(BTN.B)) { unpause(); return; }
    if (!pressed(BTN.A)) return;
    var it = PAUSE_ITEMS[g.pauseSel];
    unpause();
    if (it === 'HINT') startHint();
    else if (it === 'UNDO') undo();
    else if (it === 'NEW GAME') { sfx('gomoku_ok'); startGame(); }
    else if (it === 'TITLE') toTitle();
  }
  function unpause() { g.paused = false; GO.Audio.resume(); setMsg('', 0, 0); }

  /* ============================== 畫面 ============================== */
  function geo() {
    if (g.kind === 'g') return { bx: 2, by: 6, k: 1, s: 1, w: 15 };
    if (g.n === 3) return { bx: 2, by: 7, k: 4, s: 5, w: 14 };
    return { bx: 2, by: 6, k: 3, s: 4, w: 15 };
  }
  function box(c0, r0, c1, r1) {
    var c, r;
    put(c0, r0, A.t('FR_TL')); put(c1, r0, A.t('FR_TR')); put(c0, r1, A.t('FR_BL')); put(c1, r1, A.t('FR_BR'));
    for (c = c0 + 1; c < c1; c++) { put(c, r0, A.t('FR_T')); put(c, r1, A.t('FR_B')); }
    for (r = r0 + 1; r < r1; r++) { put(c0, r, A.t('FR_L')); put(c1, r, A.t('FR_R')); }
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
    ppu0.setBackdrop(0x0F);
    for (var i = 0; i < 4; i++) { ppu0.setBgPalette(i, PAL_BG[i]); ppu0.setSprPalette(i, PAL_SPR[i]); }
  }
  function clearAll() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes();
    var sp = A.t('SP'), r, c;
    for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) put(c, r, sp);
    for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) putAttr(c, r, 0);
  }
  var LOGO = {
    G: ['.###', '#...', '#.##', '#..#', '.###'],
    O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
    U: ['#..#', '#..#', '#..#', '#..#', '.##.']
  };
  function drawTitleScreen() {
    clearAll();
    stars(23, 60, function (c, r) { return r >= 2 && r <= 28 && c >= 1 && c <= 30; });
    text(12, 1, 'STARDUST');
    var word = 'GOMOKU', x0 = 1, k, x, y;
    for (k = 0; k < word.length; k++) {
      var gl = LOGO[word.charAt(k)];
      for (y = 0; y < 5; y++) for (x = 0; x < gl[y].length; x++) if (gl[y].charAt(x) === '#') put(x0 + x, 3 + y, A.t(k & 1 ? 'S211' : 'S111'));
      x0 += gl[0].length + 1;
    }
    for (x = 0; x < 16; x++) { putAttr(x, 1, 1); putAttr(x, 2, 1); putAttr(x, 3, 1); }
    text(4, 9, 'FIVE STARS IN A ROW WINS');
    box(1, 10, 30, 28);
    text(3, 19, 'A PLACE B LAST SELECT UNDO');
    text(3, 21, 'START MENU/HINT  C/$ CHEAT');
    text(3, 23, 'HOLD START+SELECT: MENU');
    flush(true);
    drawTitleValues();
    flush(true);
  }
  function drawTitleValues() {
    var labels = ['GAME', 'VS', 'FIRST'], vals = [GAMES[g.gameIdx].name, VS[g.vsIdx], g.vsIdx === 3 ? 'SUN = P1' : FIRST[g.firstIdx]], i;
    for (i = 0; i < 3; i++) {
      put(3, TITLE_ROWS[i], g.sel === i ? A.t('ARROW') : A.t('SP'));
      text(5, TITLE_ROWS[i], pad(labels[i], 6));
      text(11, TITLE_ROWS[i], (i === 2 && g.vsIdx === 3) ? pad('  ' + vals[i], 17) : pad('< ' + vals[i] + ' >', 17));
    }
    var w = [0, 1, 2].map(function (v) { return num(CT.load('gomoku', 'w' + g.gameIdx + '_' + v, 0), 2); });
    text(5, 17, 'WINS  E' + w[0] + '  N' + w[1] + '  H' + w[2]);
    text(11, 26, (g.frames >> 4) & 1 ? 'PUSH START' : '          ');
  }
  function drawPlayScreen() {
    clearAll();
    var G = geo();
    stars(9, 50, function (c, r) { return r <= 3 || (c <= G.bx + G.w + 1) || r >= 22 || (c >= 18 && r >= 4 && r <= 21); });
    text(1, 2, 'STARDUST ' + (g.kind === 'g' ? 'GOMOKU' : 'TIC-TAC ' + g.n + 'X' + g.n));
    box(G.bx - 1, G.by - 1, G.bx + G.w, G.by + G.w);
    put(20, 6, A.t('ICON1_0')); put(21, 6, A.t('ICON1_1')); put(20, 7, A.t('ICON1_2')); put(21, 7, A.t('ICON1_3'));
    put(20, 10, A.t('ICON2_0')); put(21, 10, A.t('ICON2_1')); put(20, 11, A.t('ICON2_2')); put(21, 11, A.t('ICON2_3'));
    render();
    flush(true);
  }
  function stoneTile(color, x, y, hi) {
    return A.t('S' + color + (x < g.n - 1 ? 1 : 0) + (y < g.n - 1 ? 1 : 0) + (hi ? 'H' : ''));
  }
  function crossTile(x, y) {
    var n = g.n, i = y * n + x;
    if (HOSHI[i]) return A.t('X_H');
    var t = y === 0, b = y === n - 1, l = x === 0, r = x === n - 1;
    if (t && l) return A.t('X_TL'); if (t && r) return A.t('X_TR');
    if (b && l) return A.t('X_BL'); if (b && r) return A.t('X_BR');
    if (t) return A.t('X_T'); if (b) return A.t('X_B'); if (l) return A.t('X_L'); if (r) return A.t('X_R');
    return A.t('X_C');
  }
  function winSet() {
    var s = {};
    if (g.sub === 'over' && g.result && g.result.line && ((g.overT >> 3) & 1) === 0) g.result.line.forEach(function (c) { s[c] = 1; });
    return s;
  }
  function renderBoard() {
    var G = geo(), x, y, hi = winSet();
    for (y = (G.by >> 1); y <= ((G.by + G.w - 1) >> 1); y++) for (x = (G.bx >> 1); x <= ((G.bx + G.w - 1) >> 1); x++) putAttr(x, y, 1);
    if (g.kind === 'g') {
      for (y = 0; y < 15; y++) for (x = 0; x < 15; x++) {
        var v = g.board[y * 15 + x];
        put(G.bx + x, G.by + y, v ? stoneTile(v, x, y, hi[y * 15 + x]) : crossTile(x, y));
      }
      return;
    }
    // 井字：格線 + 大棋子
    var n = g.n, k = G.k, sz = n === 3 ? 'L' : 'S', i, j;
    for (i = 1; i < n; i++) {
      var lc = G.bx + i * G.s - 1;
      for (j = 0; j < G.w; j++) { put(lc, G.by + j, A.t('GL_V')); put(G.bx + j, G.by + lc - G.bx, A.t('GL_H')); }
    }
    for (i = 1; i < n; i++) for (j = 1; j < n; j++) put(G.bx + i * G.s - 1, G.by + j * G.s - 1, A.t('GL_X'));
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      var c = y * n + x, vv = g.board[c], t = 0;
      for (j = 0; j < k; j++) for (i = 0; i < k; i++) {
        if (vv) t = A.t('T' + vv + sz + (hi[c] ? 'H' : '') + '_' + (j * k + i));
        else t = A.t('SP');
        put(G.bx + x * G.s + i, G.by + y * G.s + j, t);
      }
    }
  }
  function fmtTime(f) { var s = Math.floor(f / 60); return num(Math.min(99, Math.floor(s / 60)), 2) + ':' + num(s % 60, 2); }
  function renderPanel() {
    var names = g.twoP ? ['P1', 'P2'] : (g.human === 1 ? ['YOU', 'CPU'] : ['CPU', 'YOU']);
    text(23, 6, pad(names[0], 4)); text(23, 7, 'SUN ');
    text(23, 10, pad(names[1], 4)); text(23, 11, 'MOON');
    var over = g.sub === 'over';
    put(19, 6, !over && g.turn === 1 ? A.t('ARROW') : A.t('SP'));
    put(19, 10, !over && g.turn === 2 ? A.t('ARROW') : A.t('SP'));
    for (var r = 3; r <= 5; r++) putAttr(10, r, 1);
    var moves = 0; for (var k = 0; k < g.hist.length; k++) if (g.hist[k] >= 0) moves++;
    text(19, 14, 'MOVE ' + num(moves, 3));
    text(19, 16, 'TIME ' + fmtTime(g.timer));
    text(19, 18, pad(g.twoP ? 'LV 2P' : 'LV ' + VS[g.vsIdx].substring(4), 11));
    text(19, 20, 'UNDO ' + num(Math.min(99, g.undos), 2));
    var line;
    if (g.msgT > 0 && g.msg) line = g.msg;
    else if (g.sub === 'think') line = 'CPU IS THINKING' + '...'.substring(0, (g.thinkT >> 3) % 4);
    else line = (g.twoP ? (g.turn === 1 ? 'SUN' : 'MOON') : 'YOUR') + ' TURN  AT ' + coord();
    text(1, 23, pad(line, 30));
    var mp = (g.msgT > 0 && g.msg) ? g.msgPal : 0;
    for (var c = 0; c < 16; c++) putAttr(c, 11, mp);
    text(1, 25, 'A PLACE SELECT UNDO START MENU');
    text(1, 27, g.paused ? pad('', 30) : pad('B: JUMP TO LAST MOVE', 30));
  }
  function coord() {
    if (g.kind !== 'g') return String.fromCharCode(65 + g.cx) + (g.cy + 1) + ' ';
    return String.fromCharCode(65 + g.cx) + num(g.n - g.cy, 2);
  }
  function renderPause() {
    if (!g.paused) return;
    var c0 = 4, r0 = 8, c1 = 15, r1 = 20, c, r;
    for (r = r0 + 1; r < r1; r++) for (c = c0 + 1; c < c1; c++) put(c, r, A.t('SP'));
    for (r = r0 >> 1; r <= r1 >> 1; r++) for (c = c0 >> 1; c <= c1 >> 1; c++) putAttr(c, r, 0);
    box(c0, r0, c1, r1);
    text(7, 9, 'PAUSED');
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      put(6, 11 + i * 2, g.pauseSel === i ? A.t('ARROW') : A.t('SP'));
      text(7, 11 + i * 2, pad(PAUSE_ITEMS[i], 8));
    }
  }
  function render() { renderBoard(); renderPanel(); renderPause(); }

  function drawSprites() {
    var i;
    for (i = 0; i < 8; i++) ppu0.sprite(i, null);
    if (g.mode === 'title' || g.paused) return;
    var G = geo(), last = -1;
    for (i = g.hist.length - 1; i >= 0; i--) if (g.hist[i] >= 0) { last = g.hist[i]; break; }
    if (g.kind === 'g') {
      if (g.sub !== 'over') ppu0.sprite(0, { x: (G.bx + g.cx) * 8, y: (G.by + g.cy) * 8, tile: A.s(((g.frames >> 4) & 1) ? 'CUR1' : 'CUR0'), pal: 0 });
      if (last >= 0) ppu0.sprite(1, { x: (G.bx + last % 15) * 8, y: (G.by + ((last / 15) | 0)) * 8, tile: A.s('LAST'), pal: 1 });
      if (g.hintCell >= 0 && (g.hintT >> 3) & 1) ppu0.sprite(2, { x: (G.bx + g.hintCell % 15) * 8, y: (G.by + ((g.hintCell / 15) | 0)) * 8, tile: A.s('HINT'), pal: 2 });
    } else if (g.sub !== 'over') {
      var px = (G.bx + g.cx * G.s) * 8, py = (G.by + g.cy * G.s) * 8, sz = G.k * 8, t = A.s('TC');
      var pal = (g.hintCell === g.cy * g.n + g.cx && g.hintT > 0) ? 2 : 0, o = ((g.frames >> 4) & 1);
      ppu0.sprite(0, { x: px - 2 + o, y: py - 2 + o, tile: t, pal: pal });
      ppu0.sprite(1, { x: px + sz - 6 - o, y: py - 2 + o, tile: t, pal: pal, flipH: true });
      ppu0.sprite(2, { x: px - 2 + o, y: py + sz - 6 - o, tile: t, pal: pal, flipV: true });
      ppu0.sprite(3, { x: px + sz - 6 - o, y: py + sz - 6 - o, tile: t, pal: pal, flipH: true, flipV: true });
    }
    if (g.sub === 'think' || g.hintJob) {
      var who = g.hintJob ? g.turn : g.turn;
      ppu0.sprite(4, { x: 30 * 8, y: (who === 1 ? 6 : 10) * 8 + 4, tile: A.s((g.frames >> 3) & 1 ? 'THINK1' : 'THINK0'), pal: 3 });
    }
  }

  /* ============================== 機器人（?bot=1）：自己用 HARD 搜尋想一手，再用十字鍵一格一格走過去按 A ============================== */
  function bot() {
    var b = g.bot;
    b.t++;
    if (g.mode === 'title') {
      if (b.t & 7) return 0;
      if (g.sel === 0) return g.gameIdx !== 0 ? BTN.LEFT : BTN.DOWN;
      if (g.sel === 1) return g.vsIdx !== 1 ? (g.vsIdx > 1 ? BTN.LEFT : BTN.RIGHT) : BTN.DOWN;
      if (g.firstIdx !== 0) return BTN.LEFT;
      return BTN.START;
    }
    if (g.paused) return (b.t & 15) === 0 ? BTN.START : 0;
    if (g.sub === 'over') { if (!g.goal && g.overT > 60 && (b.t & 15) === 0) { b.games++; return BTN.A; } return 0; }
    if (g.sub !== 'turn') return 0;
    if (b.ply !== g.hist.length || !b.job && b.target < 0) {
      b.ply = g.hist.length; b.target = -1;
      var seed = (0xB07 ^ (g.gameNo * 77) ^ (g.hist.length * 131)) >>> 0;
      b.job = g.kind === 'g' ? AI.think(g.board, g.turn, 2, seed) : AI.thinkTTT(g.board, g.n, g.turn, 2, seed);
    }
    if (b.job) {
      b.job.run(THINK_MS, now); b.maxMs = Math.max(b.maxMs, b.job.maxMs);
      if (!b.job.done) return 0;
      b.target = b.job.move; b.job = null;
    }
    if (b.t & 1) return 0;
    var tx = b.target % g.n, ty = (b.target / g.n) | 0;
    if (g.cx < tx) return BTN.RIGHT;
    if (g.cx > tx) return BTN.LEFT;
    if (g.cy < ty) return BTN.DOWN;
    if (g.cy > ty) return BTN.UP;
    return BTN.A;
  }

  /* ============================== 密技 ============================== */
  // 對局中：CPU 下一手跳過（思考中按 = 立刻打斷，輪回自己）；輸了：原地續關（退回 CPU 致勝手 + 自己上一手）。
  // 雙人 / 標題 / 暫停 / 贏了：無效。用過密技的那局不算勝場、goal() 一律 false。
  function cheat() {
    if (!g || g.mode !== 'play' || g.paused || g.twoP) return false;
    if (g.sub === 'over') {
      if (!g.result || g.result.winner === g.human) return false;      // 贏了不必續關
      g.cheats++; g.gameCheated = true; g.undos--;
      undo();
      setMsg('STARDUST REWIND! GO ON', 120, 2);
      return true;
    }
    g.cheats++; g.gameCheated = true;
    if (g.sub === 'think') { g.job = null; g.skipCpu = true; nextTurn(); return true; }
    g.skipCpu = true; setMsg('STARDUST WIND READY', 90, 2); sfx('gomoku_hint');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'gomoku', order: 4, title: '星塵五子棋', legacy: ['gomoku.html', 'tic-tac-toe.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu;
      A = GO.Art.make();
      NES.CHR.setPattern(0, A.bg);
      NES.CHR.setPattern(1, A.spr);
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      GO.Audio.init(nes);
      var q = CT.query || function () { return null; };
      var gq = parseInt(q('g') || '', 10), vq = parseInt(q('vs') || '', 10), fq = parseInt(q('first') || '', 10);
      if (gq >= 0 && gq <= 2) g.gameIdx = gq;
      if (vq >= 0 && vq <= 3) g.vsIdx = vq;
      if (fq === 0 || fq === 1) g.firstIdx = fq;
      var sq = parseInt(q('seed') || '', 10);
      g.baseSeed = (isFinite(sq) && sq > 0) ? sq : ((Date.now() & 0xFFFFFF) | 1);
      drawTitleScreen();
      GO.Audio.play('gomoku_title');
      if (q('autostart') === '1') startGame();
    },
    update: function () {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else updatePlay();
      GO.Audio.tick();
    },
    draw: function () {
      if (g.mode === 'title') drawTitleValues();
      else render();
      flush(false);
      drawSprites();
    },
    exit: function () { g && (g.job = null); GO.Audio.stop(); },
    get backTile() { return { tile: GO.Art.make().s('BACK'), pal: 3 }; },
    state: function () {
      if (!g) return null;
      var stones = 0;
      if (g.board) for (var i = 0; i < g.board.length; i++) if (g.board[i]) stones++;
      return {
        mode: g.mode, sub: g.sub, kind: g.kind, n: g.n, gameIdx: g.gameIdx, vsIdx: g.vsIdx, firstIdx: g.firstIdx, sel: g.sel,
        turn: g.turn, human: g.human, twoP: g.twoP, cx: g.cx, cy: g.cy, hist: g.hist.slice(), stones: stones,
        result: g.result ? { winner: g.result.winner, line: g.result.line } : null, timer: g.timer, undos: g.undos, hints: g.hints,
        paused: g.paused, pauseSel: g.pauseSel, thinking: !!g.job, hinting: !!g.hintJob, hintCell: g.hintCell,
        maxThinkMs: g.maxThinkMs, lastThinkFrames: g.lastThinkFrames, botMaxMs: g.bot.maxMs, botGames: g.bot.games,
        wins: g.wins, losses: g.losses, draws: g.draws, goal: g.goal, cheats: g.cheats, gameCheated: g.gameCheated, skipCpu: g.skipCpu,
        msg: g.msgT > 0 ? g.msg : '', music: GO.Audio.current, lastSfx: GO.Audio.lastSfx,
        queue: queue.length - qi, ntWrites: ntWrites, frames: g.frames
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    // R6 §1-6：右對齊 6 字元：五子棋最高擊敗等級字母 + 勝場 2 位 + WIN（例 N03WIN）；沒有 = 000WIN
    bestText: function () {
      for (var v = 2; v >= 0; v--) {
        var w = CT.load('gomoku', 'w0_' + v, 0);
        if (w) return 'ENH'.charAt(v) + num(Math.min(99, w), 2) + 'WIN';
      }
      return '000WIN';
    }
  };

  GO.dev = {
    g: function () { return g; },
    start: function (gameIdx, vsIdx, firstIdx) {
      if (gameIdx !== undefined) g.gameIdx = gameIdx;
      if (vsIdx !== undefined) g.vsIdx = vsIdx;
      if (firstIdx !== undefined) g.firstIdx = firstIdx;
      startGame();
    },
    // 直接擺子（測試用）：moves = [格索引...]，依先後手輪流；不觸發 CPU
    setup: function (moves) {
      g.board.fill(0); g.hist = []; g.result = null; g.job = null;
      for (var i = 0; i < moves.length; i++) { if (moves[i] >= 0) g.board[moves[i]] = (i % 2 === 0) ? 1 : 2; g.hist.push(moves[i]); }
      g.sub = 'turn'; g.turn = (g.hist.length % 2 === 0) ? 1 : 2;
    },
    think: function () { nextTurn(); },
    cursor: function (x, y) { g.cx = x; g.cy = y; },
    GAMES: GAMES, VS: VS, consts: { NT_LIMIT: NT_LIMIT, REP_FIRST: REP_FIRST, REP_NEXT: REP_NEXT, THINK_MS: THINK_MS, MIN_THINK: MIN_THINK }
  };

  if (CT.register) CT.register(GAME);
  GO.GAME = GAME;
})();
