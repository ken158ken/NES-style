/*
 * games/cart4/cards/main.js — 《星塵翻牌 STAR CARDS》（合輯卡帶四 槽 1，id = cards）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：cards/art.js、cards/song.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：memory-card / card-memory / memory-match / memory-matching ⇒ 一款三模式。
 *
 * 規則：牌面朝下洗好發牌，一次翻兩張，同圖 = 配對成功留在桌上（連續配對 = 連對加分 ×1 ×2 ×3 …），不同 = 翻回去。
 *   盤面 5 種：4×3 / 4×4 / 5×4 / 6×4 / 6×5（6~15 對），18 種原創牌面圖抽出所需對數。
 *   1 CLASSIC 經典：步數上限內翻完（翻兩張 = 1 步）；上限 16 / 24 / 30 / 36 / 45，評價看步數（≤ 1.5n ★★★、≤ 2n ★★）。
 *   2 TIME ATTACK 限時：40 / 60 / 80 / 100 / 130 秒，配對成功 +2 秒，剩餘時間換分。
 *   3 VS PIPPO 對 CPU：6×5 盤（15 對 ⇒ 不會平手），你先翻；配對成功可以再翻、失敗換人。
 *       CPU「噗波 PIPPO」只記得**畫面上翻開過的牌**，記憶力 4 級可調：
 *       DOZY 記 2 張 / 每次想起 60%、NORMAL 5 張 / 80%、SHARP 10 張 / 94%、PERFECT 全記 / 100%。
 * 開局：發牌動畫（每 3 幀一張）+ READY 3·2·1（90 幀）才可以操作。翻牌動畫 5 格（牌背 → 半寬 → 側邊 → 半寬白面 → 牌面，每格 3 幀）。
 * B = 偷看（友善版，經典 / 限時每盤 1 次）：全部未配對的牌亮 60 幀，經典扣 4 步上限 / 限時扣 8 秒；VS 沒有。
 * 游標：十字鍵一格，按住首延遲 12 幀之後每 4 幀一格。`?seed=` 可重現。
 * 密技（C / ★）：遊玩中 = 經典 +5 步 / 限時 +20 秒 / VS 讓 PIPPO 全部忘光；GAME OVER = 原地續關（經典步數上限 = 已用 +10、
 *   限時補 30 秒，盤面照舊；VS 同記憶力重發一局）；標題 / 結算無效；用過密技那局不存紀錄、goal false。
 * goal = 經典 4×4 在 24 步內翻完（不開密技）。
 * 機器人（?bot=1，&lag=N 反應延遲幀數，預設 12）：**只看名稱表**（ppu.getTile 讀牌面圖那格的磁磚 → 認圖），
 *   記住看過的牌；不讀 run.cards 的隱藏牌面。十字鍵每 6 幀按一下、A 前停一拍。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CA = CT.Cards = CT.Cards || {};
  var AU = CA.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var SIZES = [[4, 3], [4, 4], [5, 4], [6, 4], [6, 5]];
  var SIZE_NAMES = ['4X3', '4X4', '5X4', '6X4', '6X5'];
  var LIMIT = [16, 24, 30, 36, 45];
  var TIME_S = [40, 60, 80, 100, 130];
  var MEM = [
    { name: 'DOZY', cap: 2, p: 154 },
    { name: 'NORMAL', cap: 5, p: 205 },
    { name: 'SHARP', cap: 10, p: 241 },
    { name: 'PERFECT', cap: 30, p: 256 }
  ];
  var GAMES = [
    { key: 'classic', name: 'CLASSIC', lv: SIZE_NAMES },
    { key: 'time', name: 'TIME ATTACK', lv: SIZE_NAMES },
    { key: 'vs', name: 'VS PIPPO', lv: MEM.map(function (m) { return m.name; }) }
  ];
  var STG = ['back', 'backhalf', 'edge', 'facehalf', 'face'];
  var FLIP_STEP = 3, DEAL_EVERY = 3, READY_F = 90, PEEK_F = 60, MATCH_WAIT = 18, MISS_WAIT = 42, TIME_BONUS = 120;
  var CPU_THINK = 30, CPU_STEP = 7, CPU_PRESS = 10;
  var REP_DELAY = 12, REP_EVERY = 4, FLUSH_LIMIT = 140, MSG_ROW = 27;
  var PAL = {
    bd: 0x0F,
    // 0 牌背 / UI：靛藍底、金紋、白；1 暖色面、2 冷色面、3 綠色面（深描邊 / 主色 / 白底）
    bg: [[0x02, 0x28, 0x30], [0x07, 0x27, 0x30], [0x01, 0x21, 0x30], [0x09, 0x2A, 0x30]],
    spr: [[0x30, 0x28, 0x16], [0x30, 0x24, 0x14], [0x30, 0x38, 0x28], [0x28, 0x38, 0x30]]
  };

  var art = null, nes0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, sel: 0, lvl: [1, 1, 1], paused: false, cheatReq: false, run: null, msg: '', msgT: 0, sprUsed: 0,
      want: new Int16Array(960), have: new Int16Array(960), wantA: new Int8Array(240), haveA: new Int8Array(240), q: [], qa: [],
      seed: 1, runs: 0, overT: 0, goalRun: null, hold: {}, bot: null, spark: []
    };
  }
  function seedBase() { var s = CT.query ? parseInt(CT.query('seed') || '', 10) : NaN; return isNaN(s) ? 0x5C4D : (s & 0x7fffffff); }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function stars(n) { return ('$$$'.substring(0, n) + '   ').substring(0, 3); }
  function secs(f) { return Math.ceil(f / 60); }

  /* ---------------- 名稱表影子 + 差異佇列（每幀 ≤ 140 byte） ---------------- */
  function bgTile(c, r) {
    if (r === 3) return art.t('BH');
    if (r === 25) return art.t('BHB');
    if (r < 4 || r > 24) return 0;
    if (c === 0) return art.t('BV');
    if (c === 31) return art.t('BVR');
    if (c > 3 && c < 28) return 0;
    var h = ((c * 2654435761) ^ (r * 40503) ^ 0x3c51) >>> 0;
    if (h % 11 === 3) return art.t('ST1');
    if (h % 13 === 7) return art.t('ST2');
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
  function drawField() { for (var r = 3; r <= 25; r++) for (var c = 0; c < 32; c++) put(c, r, bgTile(c, r)); }
  function big(col, row, word) {
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i), x = col + i * 2;
      if (ch === ' ') continue;
      put(x, row, art.t('BIG_' + ch + '0')); put(x + 1, row, art.t('BIG_' + ch + '1'));
      put(x, row + 1, art.t('BIG_' + ch + '2')); put(x + 1, row + 1, art.t('BIG_' + ch + '3'));
    }
  }

  /* ---------------- 游標連發 ---------------- */
  function rep(btn) {
    var I = NES.Input;
    if (!I.held(btn)) { g.hold[btn] = 0; return false; }
    var h = (g.hold[btn] = (g.hold[btn] || 0) + 1);
    return h === 1 || (h > REP_DELAY && (h - REP_DELAY - 1) % REP_EVERY === 0);
  }
  function dirs() { return { u: rep(BTN.UP), d: rep(BTN.DOWN), l: rep(BTN.LEFT), r: rep(BTN.RIGHT) }; }
  function startPressed() { var I = NES.Input; return I.pressed(BTN.START) && !I.held(BTN.SELECT); }

  /* ---------------- 紀錄 ---------------- */
  function load(k) { return CT.load('cards', k, 0) | 0; }
  function save(k, v) { CT.save('cards', k, v); }
  function saveBest(score) { if (score > load('best')) { save('best', score); return true; } return false; }
  function bestLine(m, lv) {
    if (m === 0) { var mv = load('mv' + lv); return mv ? 'BEST ' + pad(mv, 2) + ' MOVES  LIMIT ' + LIMIT[lv] : 'LIMIT ' + LIMIT[lv] + ' MOVES'; }
    if (m === 1) { var ts = load('tm' + lv); return ts ? 'BEST ' + pad(ts, 3) + 'S LEFT  LIMIT ' + TIME_S[lv] + 'S' : 'TIME LIMIT ' + TIME_S[lv] + 'S'; }
    return 'WINS ' + pad(load('vs' + lv), 3) + '  PIPPO REMEMBERS ' + MEM[lv].cap;
  }

  /* ================================================================ 標題 */
  function titleRow(i) { return 9 + i * 2; }
  function titleLine(i) { return (i + 1) + ' ' + padR(GAMES[i].name, 13) + padL(GAMES[i].lv[g.lvl[i]], 10); }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.run = null; g.paused = false; g.spark = [];
    redraw(function () {
      for (var c = 0; c < 32; c++) { put(c, 1, art.t('BHB')); put(c, 28, art.t('BH')); }
      big(6, 3, 'STAR CARDS');
      center(6, 'FLIP TWO  FIND THE PAIRS');
      for (var i = 0; i < GAMES.length; i++) text(3, titleRow(i), titleLine(i));
      center(15, padR(bestLine(g.sel, g.lvl[g.sel]), 28));
      text(3, 18, 'UP/DOWN MODE  L/R SIZE/CPU');
      text(3, 20, 'A FLIP  B PEEK  START PAUSE');
      text(3, 22, 'HOLD START+SELECT: MENU');
      text(3, 24, 'C/$ = CHEAT');
      selAttr(g.sel, 0);
    });
    AU.play('cards_title');
  }
  function selAttr() { }
  function updateTitle() {
    g.t++;
    var D = dirs(), I = NES.Input;
    var d = D.d || (I.pressed(BTN.SELECT) && !I.held(BTN.START)) ? 1 : (D.u ? -1 : 0);
    if (d) { g.sel = (g.sel + d + GAMES.length) % GAMES.length; AU.sfx('cards_move'); }
    var l = D.r ? 1 : (D.l ? -1 : 0);
    if (l) { var n = GAMES[g.sel].lv.length; g.lvl[g.sel] = (g.lvl[g.sel] + l + n) % n; text(3, titleRow(g.sel), titleLine(g.sel)); AU.sfx('cards_move'); }
    if (d || l) center(15, padR(bestLine(g.sel, g.lvl[g.sel]), 28));
    if (startPressed() || I.pressed(BTN.A)) startGame(g.sel, g.lvl[g.sel]);
  }

  /* ================================================================ 開局 / 發牌 */
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd() % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function dealFaces(pairs) {
    var pool = [], i;
    for (i = 0; i < art.NFACE; i++) pool.push(i);
    shuffle(pool);
    var d = [];
    for (i = 0; i < pairs; i++) { d.push(pool[i]); d.push(pool[i]); }
    return shuffle(d);
  }
  function startGame(m, lv) {
    g.runs++;
    g.seed = (seedBase() * 7 + g.runs * 7919 + m * 101 + lv * 13) & 0x7fffffff;
    for (var i = 0; i < 4; i++) rnd();
    var sz = m === 2 ? 4 : lv;
    var W = SIZES[sz][0], H = SIZES[sz][1];
    var R = g.run = {
      kind: GAMES[m].key, m: m, lvl: lv, sz: sz, W: W, H: H, n: W * H / 2, cards: [], anims: [], open: [],
      cx: 0, cy: 0, kx: W - 1, ky: 0, moves: 0, limit: LIMIT[sz], timeF: TIME_S[sz] * 60, timeMax: TIME_S[sz] * 60,
      score: 0, combo: 0, maxCombo: 0, matched: 0, phase: 'deal', pt: 0, dealt: 0, turn: 'p', pp: 0, cp: 0,
      mem: [], cpu: { stage: 0, t: 0, target: -1 }, peekUsed: false, cheated: false, continues: 0, saved: false, result: '', misses: 0
    };
    dealFaces(R.n).forEach(function (f) { R.cards.push({ f: f, st: 'down', vis: 'empty' }); });
    g.mode = 'play'; g.paused = false; g.msg = ''; g.msgT = 0; g.t = 0; g.hold = {}; g.spark = [];
    redraw(function () { drawField(); hud(); });
    AU.play(R.kind === 'vs' ? 'cards_vs' : 'cards_play');
    AU.sfx('cards_go');
    return R;
  }
  function cardRC(i) { var R = g.run, x = i % R.W, y = (i / R.W) | 0; return [16 - 2 * R.W + 4 * x, 14 - 2 * R.H + 4 * y]; }
  function facePal(f) { return 1 + ((f / 6) | 0); }
  function drawCard(i, kind) {
    var R = g.run, p = cardRC(i), c0 = p[0], r0 = p[1], f = R.cards[i].f, cx, cy, t;
    R.cards[i].vis = kind;
    for (cy = 0; cy < 4; cy++) for (cx = 0; cx < 4; cx++) {
      var k = cy * 4 + cx;
      if (kind === 'empty') t = bgTile(c0 + cx, r0 + cy);
      else if (kind === 'back') t = art.t('BK' + k);
      else if (kind === 'backhalf' || kind === 'edge' || kind === 'facehalf') {
        t = (cx === 0 || cx === 3) ? 0 : art.t((kind === 'backhalf' ? 'HB' : kind === 'edge' ? 'ED' : 'HF') + (cy * 2 + cx - 1));
      } else {
        var inner = cx >= 1 && cx <= 2 && cy >= 1 && cy <= 2;
        t = inner ? art.t('FC_' + f + '_' + ((cy - 1) * 2 + cx - 1)) : art.t((kind === 'matched' ? 'MF' : 'FR') + k);
      }
      put(c0 + cx, r0 + cy, t);
    }
    var pal = (kind === 'face' || kind === 'facehalf' || kind === 'matched') ? facePal(f) : 0;
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) putA((c0 >> 1) + a, (r0 >> 1) + b, pal);
  }
  function restingKind(c) { return c.st === 'done' ? 'matched' : (c.st === 'up' ? 'face' : 'back'); }
  function drawBoard() { var R = g.run; for (var i = 0; i < R.cards.length; i++) drawCard(i, R.phase === 'deal' && i >= R.dealt ? 'empty' : restingKind(R.cards[i])); }

  /* ================================================================ 翻牌動畫 */
  function animating(i) { var A = g.run.anims; for (var k = 0; k < A.length; k++) if (A[k].i === i) return true; return false; }
  function flip(i, up) {
    var R = g.run;
    R.anims = R.anims.filter(function (a) { return a.i !== i; });
    R.anims.push({ i: i, up: up, s: up ? 0 : 4, t: 0 });
    R.cards[i].st = up ? 'up' : 'down';
    AU.sfx('cards_flip');
  }
  function tickAnims() {
    var R = g.run, keep = [];
    for (var k = 0; k < R.anims.length; k++) {
      var a = R.anims[k];
      if (++a.t < FLIP_STEP) { keep.push(a); continue; }
      a.t = 0; a.s += a.up ? 1 : -1;
      if (a.s < 0 || a.s > 4) { if (a.up) seen(a.i); continue; }
      drawCard(a.i, STG[a.s]);
      if (a.up && a.s === 4) { seen(a.i); continue; }
      if (!a.up && a.s === 0) continue;
      keep.push(a);
    }
    R.anims = keep;
  }
  // 一張牌完整翻到正面 ⇒ 畫面上看得到 ⇒ CPU 記住（只記「看過的」）
  function seen(i) {
    var R = g.run;
    if (R.kind !== 'vs') return;
    R.mem = R.mem.filter(function (e) { return e.i !== i; });
    R.mem.push({ i: i, f: R.cards[i].f });
    var cap = MEM[R.lvl].cap;
    while (R.mem.length > cap) R.mem.shift();
  }

  /* ================================================================ 遊玩 */
  function say(s, t) { g.msg = s; g.msgT = t || 60; }
  function myTurn() { var R = g.run; return R.kind !== 'vs' || R.turn === 'p'; }
  function tryFlip(i) {
    var R = g.run, c = R.cards[i];
    if (c.st !== 'down' || animating(i) || R.open.length >= 2) { AU.sfx('cards_ng'); return false; }
    flip(i, true);
    R.open.push(i);
    if (R.open.length === 2) { R.phase = 'look'; R.pt = 0; if (R.kind !== 'vs' || R.turn === 'p') R.moves++; }
    return true;
  }
  function resolve() {
    var R = g.run, a = R.open[0], b = R.open[1];
    R.open = [];
    if (R.cards[a].f === R.cards[b].f) {
      R.cards[a].st = 'done'; R.cards[b].st = 'done';
      drawCard(a, 'matched'); drawCard(b, 'matched');
      R.matched++; R.combo++; if (R.combo > R.maxCombo) R.maxCombo = R.combo;
      R.mem = R.mem.filter(function (e) { return e.i !== a && e.i !== b; });
      if (R.kind === 'vs') { if (R.turn === 'p') { R.pp++; R.score += 100; } else R.cp++; }
      else R.score += 100 * R.combo;
      if (R.kind === 'time') R.timeF = Math.min(R.timeF + TIME_BONUS, 5999 * 60);
      g.spark = [{ i: a, t: 20 }, { i: b, t: 20 }];
      AU.sfx(R.combo >= 2 ? 'cards_combo' : 'cards_match');
      if (R.kind === 'vs') say((R.turn === 'p' ? 'YOU' : 'PIPPO') + ' GOT A PAIR! AGAIN', 60);
      else say(R.combo >= 2 ? 'COMBO X' + R.combo + '!  +' + (100 * R.combo) : 'PAIR! +100', 50);
      if (R.matched >= R.n) { R.phase = 'clear'; R.pt = 0; return; }
      R.phase = R.kind === 'vs' && R.turn === 'c' ? 'cpu' : 'pick'; R.pt = 0;
      if (R.phase === 'cpu') R.cpu = { stage: 0, t: 0, target: -1 };
      return;
    }
    R.combo = 0; R.misses++;
    flip(a, false); flip(b, false);
    AU.sfx('cards_miss');
    if (R.kind === 'classic' && R.moves >= R.limit) { R.phase = 'wait'; R.pt = 0; R.after = 'over'; return; }
    if (R.kind === 'vs') {
      R.turn = R.turn === 'p' ? 'c' : 'p';
      say(R.turn === 'c' ? "PIPPO'S TURN" : 'YOUR TURN', 60);
      R.phase = R.turn === 'c' ? 'cpu' : 'pick'; R.pt = 0;
      R.cpu = { stage: 0, t: 0, target: -1 };
      return;
    }
    R.phase = 'pick'; R.pt = 0;
  }
  function cursorMove(D) {
    var R = g.run, moved = false;
    if (D.u && R.cy > 0) { R.cy--; moved = true; }
    if (D.d && R.cy < R.H - 1) { R.cy++; moved = true; }
    if (D.l && R.cx > 0) { R.cx--; moved = true; }
    if (D.r && R.cx < R.W - 1) { R.cx++; moved = true; }
    if (moved) AU.sfx('cards_move');
  }
  function startPeek() {
    var R = g.run;
    if (R.kind === 'vs' || R.peekUsed || R.open.length || R.anims.length) { AU.sfx('cards_ng'); say(R.kind === 'vs' ? 'NO PEEKING VS PIPPO!' : (R.peekUsed ? 'PEEK USED THIS BOARD' : 'WAIT...'), 50); return; }
    R.peekUsed = true; R.phase = 'peek'; R.pt = 0;
    if (R.kind === 'classic') { R.limit = Math.max(R.moves + 1, R.limit - 4); say('PEEK!  LIMIT -4', PEEK_F); }
    else { R.timeF = Math.max(60, R.timeF - 8 * 60); say('PEEK!  TIME -8S', PEEK_F); }
    for (var i = 0; i < R.cards.length; i++) if (R.cards[i].st === 'down') drawCard(i, 'face');
    AU.sfx('cards_peek');
  }
  function updateRun() {
    var R = g.run, I = NES.Input;
    R.pt++;
    tickAnims();
    for (var s = 0; s < g.spark.length; s++) g.spark[s].t--;
    g.spark = g.spark.filter(function (x) { return x.t > 0; });
    if (R.phase === 'deal') {
      if (R.pt % DEAL_EVERY === 0 && R.dealt < R.cards.length) { drawCard(R.dealt, 'back'); R.dealt++; if (R.dealt % 2) AU.sfx('cards_deal'); }
      if (R.dealt >= R.cards.length && R.pt > R.cards.length * DEAL_EVERY + 6) { R.phase = 'ready'; R.pt = 0; AU.sfx('cards_ready'); }
      return;
    }
    if (R.phase === 'ready') {
      if (R.pt === 30 || R.pt === 60) AU.sfx('cards_ready');
      if (R.pt >= READY_F) { R.phase = 'pick'; R.pt = 0; AU.sfx('cards_go'); say(R.kind === 'vs' ? 'YOUR TURN  GO!' : 'GO!', 40); }
      return;
    }
    if (R.kind === 'time' && (R.phase === 'pick' || R.phase === 'look')) {
      if (--R.timeF <= 0) {
        R.timeF = 0;
        R.open.forEach(function (i) { if (R.cards[i].st === 'up') flip(i, false); });
        R.open = [];
        enterOver('TIME UP!  PAIRS ' + R.matched + '/' + R.n);
        return;
      }
    }
    if (R.phase === 'peek') {
      if (R.pt >= PEEK_F) { for (var i = 0; i < R.cards.length; i++) if (R.cards[i].st === 'down') drawCard(i, 'back'); R.phase = 'pick'; R.pt = 0; }
      return;
    }
    if (R.phase === 'pick') {
      if (!myTurn()) return;
      cursorMove(dirs());
      if (I.pressed(BTN.A)) tryFlip(R.cy * R.W + R.cx);
      else if (I.pressed(BTN.B)) startPeek();
      return;
    }
    if (R.phase === 'look') {
      if (R.anims.length) { if (myTurn()) cursorMove(dirs()); return; }
      var same = R.cards[R.open[0]].f === R.cards[R.open[1]].f;
      if (myTurn()) cursorMove(dirs());
      var skip = !same && myTurn() && R.pt > 12 && I.pressed(BTN.A);
      if (R.pt >= (same ? MATCH_WAIT : MISS_WAIT) || skip) resolve();
      return;
    }
    if (R.phase === 'wait') { if (!R.anims.length && R.pt > 20) enterOver('OUT OF MOVES  PAIRS ' + R.matched + '/' + R.n); return; }
    if (R.phase === 'cpu') { updateCpu(); return; }
    if (R.phase === 'clear') { if (R.pt >= 40) finish(); }
  }

  /* ================================================================ CPU 噗波 */
  function cpuChoose() {
    var R = g.run, M = MEM[R.lvl], recall = [], i, k;
    for (k = 0; k < R.mem.length; k++) {
      var e = R.mem[k];
      if (R.cards[e.i].st !== 'down' || R.open.indexOf(e.i) >= 0) continue;
      if (M.p >= 256 || (rnd() & 255) < M.p) recall.push(e);
    }
    var known = {}; recall.forEach(function (e) { known[e.i] = true; });
    if (R.open.length === 1) {
      var of = R.cards[R.open[0]].f;                       // 剛翻開的牌（畫面上看得到）
      for (k = 0; k < recall.length; k++) if (recall[k].f === of && recall[k].i !== R.open[0]) return recall[k].i;
    } else {
      for (k = 0; k < recall.length; k++) for (var j = k + 1; j < recall.length; j++)
        if (recall[k].f === recall[j].f) return recall[k].i;
    }
    var unk = [], any = [];
    for (i = 0; i < R.cards.length; i++) {
      if (R.cards[i].st !== 'down' || animating(i) || R.open.indexOf(i) >= 0) continue;
      any.push(i); if (!known[i]) unk.push(i);
    }
    var pool = unk.length ? unk : any;
    return pool.length ? pool[rnd() % pool.length] : -1;
  }
  function updateCpu() {
    var R = g.run, C = R.cpu;
    C.t++;
    if (C.stage === 0) {                     // 想一下
      if (C.t < CPU_THINK || R.anims.length) return;
      C.target = cpuChoose(); C.stage = 1; C.t = 0;
      if (C.target < 0) { R.phase = 'clear'; return; }
      return;
    }
    if (C.stage === 1) {                     // 游標一格一格走過去
      var tx = C.target % R.W, ty = (C.target / R.W) | 0;
      if (C.t % CPU_STEP) return;
      if (R.ky !== ty) { R.ky += R.ky < ty ? 1 : -1; AU.sfx('cards_move'); return; }
      if (R.kx !== tx) { R.kx += R.kx < tx ? 1 : -1; AU.sfx('cards_move'); return; }
      C.stage = 2; C.t = 0;
      return;
    }
    if (C.stage === 2 && C.t >= CPU_PRESS) {
      R.phase = 'cpu';
      tryFlip(C.target);
      if (R.open.length === 2) return;         // tryFlip 已切到 look
      C.stage = 3; C.t = 0;
      return;
    }
    if (C.stage === 3) {                     // 等第一張翻到正面看清楚，再想第二張
      if (R.anims.length) return;
      if (C.t < 16) return;
      C.target = cpuChoose(); C.stage = 1; C.t = 0;
    }
  }

  /* ================================================================ 結算 / GAME OVER */
  function finish() {
    var R = g.run, nb = false, lines, st;
    if (R.kind === 'classic') {
      R.score += Math.max(0, R.limit - R.moves) * 50;
      st = R.moves <= Math.ceil(R.n * 1.5) ? 3 : (R.moves <= R.n * 2 ? 2 : 1);
      if (!R.cheated) {
        var mv = load('mv' + R.sz); if (!mv || R.moves < mv) { save('mv' + R.sz, R.moves); nb = true; }
        if (R.sz === 1 && R.moves <= LIMIT[1] && !g.goalRun) g.goalRun = R;
      }
      lines = ['ALL PAIRS FOUND!', 'MOVES ' + pad(R.moves, 2) + ' / ' + R.limit + '   BEST COMBO ' + R.maxCombo, '', 'SCORE ' + pad(R.score, 6)];
    } else if (R.kind === 'time') {
      var left = secs(R.timeF);
      R.score += left * 20;
      st = R.timeF * 2 >= R.timeMax ? 3 : (R.timeF * 4 >= R.timeMax ? 2 : 1);
      if (!R.cheated) { if (left > load('tm' + R.sz)) { save('tm' + R.sz, left); nb = true; } }
      lines = ['BEAT THE CLOCK!', 'TIME LEFT ' + pad(left, 3) + 'S   BEST COMBO ' + R.maxCombo, '', 'SCORE ' + pad(R.score, 6)];
    } else {
      if (R.pp < R.cp) { enterOver('PIPPO WINS ' + R.cp + ' TO ' + R.pp); return; }
      st = R.pp - R.cp >= 5 ? 3 : (R.pp - R.cp >= 3 ? 2 : 1);
      if (!R.cheated) { save('vs' + R.lvl, load('vs' + R.lvl) + 1); }
      R.result = 'win';
      lines = ['YOU BEAT PIPPO!', 'PAIRS  YOU ' + pad(R.pp, 2) + ' - ' + pad(R.cp, 2) + ' PIPPO', '', 'MEMORY ' + MEM[R.lvl].name + '   SCORE ' + pad(R.score, 4)];
    }
    if (!R.cheated && saveBest(R.score)) nb = true;
    R.saved = true; R.cleared = true;
    enterResult(lines, st, nb);
  }
  function enterResult(lines, st, nb) {
    var R = g.run;
    g.mode = 'result'; g.overT = 0; g.spark = [];
    redraw(function () {
      for (var c = 2; c < 30; c++) { put(c, 4, art.t('BH')); put(c, 25, art.t('BHB')); }
      for (var i = 0; i < lines.length; i++) if (lines[i]) center(7 + i * 2, lines[i]);
      center(16, 'RATING ' + stars(st));
      if (R.cheated) center(19, 'CHEAT USED - NOT SAVED');
      else if (nb) center(19, 'NEW RECORD!');
      center(22, R.kind !== 'vs' && R.sz < 4 ? 'A NEXT SIZE  START TITLE' : 'PUSH START');
    });
    AU.play('cards_win');
  }
  function enterOver(why) {
    var R = g.run;
    if (!R.cheated) saveBest(R.score);
    g.mode = 'over'; g.overT = 0; R.why = why; g.spark = [];
    redraw(function () {
      for (var c = 4; c < 28; c++) { put(c, 5, art.t('BH')); put(c, 24, art.t('BHB')); }
      center(8, 'GAME OVER');
      center(11, why);
      center(14, 'SCORE ' + pad(R.score, 6));
      center(17, 'C/$ = CONTINUE HERE');
      center(19, 'START = TITLE');
    });
    AU.play('cards_lose');
  }
  function resumeBoard(msg) {
    var R = g.run;
    g.mode = 'play'; R.phase = 'pick'; R.pt = 0; R.anims = []; R.open = [];
    for (var i = 0; i < R.cards.length; i++) if (R.cards[i].st === 'up') R.cards[i].st = 'down';
    redraw(function () { drawField(); drawBoard(); hud(); });
    AU.play(R.kind === 'vs' ? 'cards_vs' : 'cards_play');
    say(msg, 70);
  }

  /* ================================================================ 密技 */
  function doCheat() {
    var R = g.run;
    if (!R) return;
    R.cheated = true;
    if (g.mode === 'over') {
      R.continues++;
      if (R.kind === 'classic') { R.limit = R.moves + 10; resumeBoard('CONTINUE! +10 MOVES'); }
      else if (R.kind === 'time') { R.timeF = 30 * 60; resumeBoard('CONTINUE! +30 SECONDS'); }
      else {
        var keep = R.continues, sc = R.score;
        startGame(2, R.lvl);
        g.run.cheated = true; g.run.continues = keep; g.run.score = sc;
        say('CONTINUE! REMATCH PIPPO', 70);
      }
      return;
    }
    if (R.kind === 'classic') { R.limit += 5; say('STAR BOOST! +5 MOVES', 60); }
    else if (R.kind === 'time') { R.timeF += 20 * 60; say('STAR BOOST! +20 SECONDS', 60); }
    else { R.mem = []; say('STAR BOOST! PIPPO FORGOT ALL', 60); }
    AU.sfx('cards_peek');
  }

  /* ================================================================ 精靈 / HUD */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, R = g.run, q;
    function spr(x, y, tile, pal, fh, fv) { if (y > 231 || y < -7) return; ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv }); }
    function box(c0, r0, pal) {
      var x = c0 * 8, y = r0 * 8, c = art.s('CUR');
      spr(x - 1, y - 1, c, pal); spr(x + 25, y - 1, c, pal, true);
      spr(x - 1, y + 25, c, pal, false, true); spr(x + 25, y + 25, c, pal, true, true);
    }
    var blink = (g.t & 8) === 0;
    if (g.mode === 'title') spr(10, titleRow(g.sel) * 8, art.s('ARW'), 0);
    if (R && g.mode === 'play' && !g.paused && R.phase !== 'deal') {
      var p;
      if (R.kind === 'vs' && R.turn === 'c' && (R.phase === 'cpu' || R.phase === 'look')) { p = cardRC(R.ky * R.W + R.kx); box(p[0], p[1], 1); }
      else if (R.phase !== 'ready' || blink) { p = cardRC(R.cy * R.W + R.cx); box(p[0], p[1], 0); }
      for (var s = 0; s < g.spark.length; s++) {
        var sp = cardRC(g.spark[s].i), w = (g.spark[s].t >> 2) & 1;
        spr(sp[0] * 8 + 4 + w * 16, sp[1] * 8 + 4, art.s('SPK'), 2);
      }
    }
    for (q = n; q < g.sprUsed; q++) ppu.sprite(q, null);
    g.sprUsed = n;
  }
  function hud() {
    var R = g.run;
    if (!R) return;
    var top, sub, cs = R.cheated ? '$' : ' ';
    if (R.kind === 'classic') { top = padR('CLASSIC ' + SIZE_NAMES[R.sz], 16) + 'MOVES ' + pad(R.moves, 2) + '/' + pad(R.limit, 2); }
    else if (R.kind === 'time') { var sl = secs(R.timeF); top = padR('TIME ATTACK ' + SIZE_NAMES[R.sz], 20) + 'TIME ' + pad(sl, 3); }
    else { top = padR('YOU ' + pad(R.pp, 2) + '  PIPPO ' + pad(R.cp, 2), 21) + padL(MEM[R.lvl].name, 8); }
    sub = 'SCORE ' + pad(R.score, 6) + '  COMBO X' + pad(R.combo, 1) + '  ' + 'PAIR ' + pad(R.matched, 2);
    text(1, 1, padR(top, 29) + cs);
    text(1, 2, padR(sub, 30));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (R.phase === 'deal') line = 'DEALING...';
    else if (R.phase === 'ready') line = 'READY  ' + (3 - Math.floor(R.pt / 30)) + '...';
    else if (g.msgT > 0) line = g.msg;
    else if (R.kind === 'vs' && R.turn === 'c') line = 'PIPPO IS THINKING...';
    else if (R.kind === 'time' && R.timeF < 600 && (g.t & 16)) line = 'HURRY!';
    else line = R.kind === 'vs' ? 'YOUR TURN  DPAD + A FLIP' : 'DPAD + A FLIP  B PEEK' + (R.peekUsed ? ' USED' : ' X1');
    text(1, MSG_ROW, padR(line, 30));
  }

  /* ================================================================ 主迴圈 */
  function updatePlay() {
    var R = g.run;
    if (startPressed() && R.phase !== 'deal') {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      g.hold = {};
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    updateRun();
  }

  /* ================================================================ 機器人：只讀畫面（名稱表）+ 記住看過的 */
  function botLag() { var v = parseInt((CT.query && CT.query('lag')) || '', 10); return isNaN(v) ? 12 : clamp(v, 0, 120); }
  function botEye(B) {
    // 從 PPU 名稱表讀每張牌「牌面圖左上那格」與「框左上那格」：認得圖 = 記住；框是配對成功框 = 已完成
    var R = g.run, ppu = nes0.ppu, mf = art.t('MF0'), fr = art.t('FR0');
    B.up = [];
    for (var i = 0; i < R.W * R.H; i++) {
      var p = cardRC(i), tf = ppu.getTile(0, p[0] + 1, p[1] + 1), tb = ppu.getTile(0, p[0], p[1]);
      var f = art.faceOf[tf];
      if (f !== undefined) B.mem[i] = f;
      if (tb === mf) B.done[i] = true;
      else if (tb === fr && f !== undefined) B.up.push(i);
    }
  }
  function botTarget(B) {
    var R = g.run, N = R.W * R.H, i, j, here = R.cy * R.W + R.cx;
    var free = function (k) { return !B.done[k] && B.up.indexOf(k) < 0; };
    function nearestUnknown(except) {
      var best = -1, bd = 1e9;
      for (var k = 0; k < N; k++) {
        if (!free(k) || B.mem[k] !== undefined || k === except) continue;
        var d = Math.abs((k % R.W) - R.cx) + Math.abs(((k / R.W) | 0) - R.cy);
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) for (k = 0; k < N; k++) if (free(k) && k !== except) return k;
      return best;
    }
    if (B.up.length === 1) {
      var f = B.mem[B.up[0]];
      for (i = 0; i < N; i++) if (i !== B.up[0] && free(i) && B.mem[i] === f) return i;
      return nearestUnknown(B.up[0]);
    }
    for (i = 0; i < N; i++) if (free(i) && B.mem[i] !== undefined)
      for (j = i + 1; j < N; j++) if (free(j) && B.mem[j] === B.mem[i]) return i;
    void here;
    return nearestUnknown(-1);
  }
  function botMask() {
    var B = g.bot;
    if (!B) B = g.bot = { t: 0, prev: 0, last: 0, react: 0, key: '', mem: {}, done: {}, up: [], lag: botLag() };
    B.t++;
    var m = inner();
    if (m && B.prev) m = 0;
    B.prev = m;
    if (m) B.last = B.t;
    return m;
    function inner() {
      var R = g.run;
      if (g.mode === 'title') {
        var wm = clamp((parseInt((CT.query && CT.query('pmode')) || '1', 10) || 1) - 1, 0, 2);
        var wl = clamp((parseInt((CT.query && CT.query('plvl')) || '2', 10) || 2) - 1, 0, GAMES[wm].lv.length - 1);
        B.mem = {}; B.done = {};
        if (g.t < 30) return 0;
        if (g.sel !== wm) return (B.t % 8 === 0) ? BTN.DOWN : 0;
        if (g.lvl[wm] !== wl) return (B.t % 8 === 0) ? BTN.RIGHT : 0;
        return (B.t % 20 === 0) ? BTN.START : 0;
      }
      if (g.mode === 'over' || g.mode === 'result') { B.mem = {}; B.done = {}; return (g.overT > 60 && B.t % 30 === 0) ? BTN.START : 0; }
      if (g.paused) return (B.t % 30 === 0) ? BTN.START : 0;
      if (!R) return 0;
      if (R.phase === 'deal') { B.mem = {}; B.done = {}; }
      botEye(B);
      var k = R.phase + ':' + (R.turn || '') + ':' + B.up.length;
      if (k !== B.key) { B.key = k; B.react = B.lag; }       // 畫面狀態一變 ⇒ 重新反應
      if (R.phase !== 'pick' || !myTurn()) return 0;
      if (B.up.length === 1 && B.mem[B.up[0]] === undefined) return 0;
      if (B.react > 0) { B.react--; return 0; }
      var tgt = botTarget(B);
      if (tgt < 0) return 0;
      var tx = tgt % R.W, ty = (tgt / R.W) | 0;
      if (B.t - B.last < 6) return 0;
      if (R.cy !== ty) return R.cy < ty ? BTN.DOWN : BTN.UP;
      if (R.cx !== tx) return R.cx < tx ? BTN.RIGHT : BTN.LEFT;
      return BTN.A;
    }
  }
  function goalOk() { return !!(g && g.goalRun && !g.goalRun.cheated); }

  /* ================================================================ 註冊 */
  var GAME = {
    id: 'cards', order: 1, title: '星塵翻牌', legacy: ['memory-card.html', 'card-memory.html', 'memory-match.html', 'memory-matching.html'],
    init: function (nes) {
      nes0 = nes;
      art = CA.Art.make();
      var ppu = nes.ppu, i;
      NES.CHR.setPattern(0, 'cards_bg');
      NES.CHR.setPattern(1, 'cards_spr');
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
        if (g.overT > 40) {
          var R = g.run;
          if (g.mode === 'result' && I.pressed(BTN.A) && R && R.kind !== 'vs' && R.sz < 4) { g.lvl[R.m] = R.sz + 1; startGame(R.m, R.sz + 1); }
          else if (startPressed()) enterTitle();
        }
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') { if ((g.t & 31) === 0) text(11, 26, (g.t & 32) ? '          ' : 'PUSH START'); }
      else if (g.mode === 'play') hud();
      flush();
      drawSprites();
    },
    state: function () {
      var R = g.run, r = null;
      if (R) {
        r = { kind: R.kind, lvl: R.lvl, sz: R.sz, W: R.W, H: R.H, n: R.n, phase: R.phase, pt: R.pt, cx: R.cx, cy: R.cy, kx: R.kx, ky: R.ky,
          moves: R.moves, limit: R.limit, timeF: R.timeF, score: R.score, combo: R.combo, maxCombo: R.maxCombo, matched: R.matched,
          turn: R.turn, pp: R.pp, cp: R.cp, open: R.open.slice(), anims: R.anims.length, mem: R.mem.length, peekUsed: R.peekUsed,
          cheated: R.cheated, continues: R.continues, cleared: !!R.cleared, misses: R.misses,
          st: R.cards.map(function (c) { return c.st; }), vis: R.cards.map(function (c) { return c.vis; }) };
      }
      return { mode: g.mode, sel: g.sel, lvl: g.lvl.slice(), paused: g.paused, t: g.t, queue: g.q.length + g.qa.length, run: r, goal: goalOk(), music: AU.current };
    },
    exit: function () { if (g && g.run && !g.run.cheated && (g.mode === 'play' || g.mode === 'over')) saveBest(g.run.score); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || g.mode === 'result' || !g.run) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return pad(Math.min(999999, load('best')), 6); }
  };
  CA.GAMES = GAMES; CA.SIZES = SIZES; CA.LIMIT = LIMIT; CA.TIME_S = TIME_S; CA.MEM = MEM;
  CA.K = { FLIP_STEP: FLIP_STEP, DEAL_EVERY: DEAL_EVERY, READY_F: READY_F, PEEK_F: PEEK_F, REP: [REP_DELAY, REP_EVERY] };
  CA.dev = {
    g: function () { return g; },
    start: function (m, lv) { g.sel = m; g.lvl[m] = lv; return startGame(m, lv); },
    title: function () { enterTitle(); },
    // 測試用：跳過發牌 + READY
    skipIntro: function () { var R = g.run; while (R.dealt < R.cards.length) { drawCard(R.dealt, 'back'); R.dealt++; } R.phase = 'pick'; R.pt = 0; },
    faces: function () { return g.run.cards.map(function (c) { return c.f; }); },
    cardRC: function (i) { return cardRC(i); },
    cpuChoose: function () { return cpuChoose(); },
    tryFlip: function (i) { return tryFlip(i); }
  };
  if (CT.register) CT.register(GAME);
})();
