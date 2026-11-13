/*
 * games/cart1/blocks/main.js — 《星塵方塊》（合輯槽 2，id = blocks，全域 CT.Blocks）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-2 cart1-break ｜ 依賴：engine/*、games/cart1/registry.js、blocks/{art,audio}.js
 * 舊作概念：legacy tetris.html / tetris-game.html（只取「落塊消行 + 預覽 + 暫存 + 影子 + 升級」概念；
 *           程式 / 文案 / 配色 / 配樂一律重寫，名稱、旋律全原創）。手感參考研究 03/13 ④⑪。
 *
 * 畫面（研究 05「背景 = 名稱表、會動的 = 精靈」）
 *   - 10×20 盤面、暫存框、下一塊 ×3、HUD 全在**背景名稱表**；只有「當前塊 4 格 + 影子 4 格」是精靈
 *     ⇒ 任一掃描線最多 4 + 4 = 8 顆，永不超線。
 *   - 名稱表寫入走「影子名稱表 + 差異佇列」：每幀只把 want ≠ have 的格子寫進 PPU，
 *     **每幀上限 140 byte**（VBlank 160 扣掉調色盤 / 餘裕）⇒ 消行後整片盤面下移（≤ 200 格）
 *     自動分 2 幀寫完，overFrames 恆為 0。只有換畫面（標題 ↔ 遊戲）才在 CT.blank 裡整片重畫。
 *   - 調色盤：背景第 1 組 = 方塊三色（每級換色，3 + 3 byte）；七種方塊分 A / B / C 三款圖樣。
 *
 * 操作：←→ 移動（DAS 首延遲 12 / 重複 4 幀）、↓ 軟降、↑ 硬降、A 右旋 / B 左旋（簡易踢牆）、
 *       SELECT 暫存（每塊一次）、START 暫停。START+SELECT 長按 = 回選單（registry 處理，不佔用）。
 * 模式：馬拉松（起始等級 1~10，每 10 行升級，150 行完走）/ 挑戰（底部垃圾行定時上升，
 *       每 10 行一階段、5 階段 50 行過關）。
 * 網址：`?game=blocks&debug=1[&bot=1][&mode=challenge][&level=N][&seed=N]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var B = CT.Blocks = CT.Blocks || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var W = 10, H = 20, HID = 2, ROWS = H + HID;
  var FX = 12, FY = 6;                         // 盤面左上（磚座標；偶數對齊屬性 16×16）
  var NT_LIMIT = 140;                          // 每幀名稱表寫入上限（byte）
  var DAS_FIRST = 12, DAS_REP = 4;
  var LOCK_DELAY = 30, LOCK_RESETS = 15;
  var ARE = 8, CLEAR_FRAMES = 24;
  var SOFT_RATE = 2;
  var TITLE_ROW = 10;                          // 標題選單第一列（MODE）
  var MARATHON_END = 150, CHALLENGE_END = 50, GOAL_LINES = 40;
  var GRAVITY = [50, 44, 38, 33, 28, 24, 20, 16, 13, 10, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1];
  var RISE = [720, 620, 540, 460, 400];
  var LINE_PTS = [0, 100, 300, 500, 800];
  var LV_PAL = [
    [0x12, 0x27, 0x30], [0x16, 0x2A, 0x30], [0x14, 0x28, 0x30], [0x19, 0x26, 0x30], [0x13, 0x2C, 0x30],
    [0x17, 0x22, 0x30], [0x1A, 0x24, 0x30], [0x15, 0x2B, 0x30], [0x18, 0x21, 0x30], [0x06, 0x29, 0x30]
  ];
  var PAL_FRAME = [0x01, 0x21, 0x30], PAL_LABEL = [0x07, 0x17, 0x28], PAL_POP = [0x04, 0x14, 0x25];
  var SPR_GHOST = [0x00, 0x10, 0x30], SPR_CURSOR = [0x06, 0x16, 0x38];

  // 方塊：旋轉 0 的格子（盒子邊長 n），其他三個方向用「盒內右旋」算出來
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var SHAPE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]], st: 3 },
    O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]], st: 1 },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]], st: 2 },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]], st: 1 },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]], st: 2 },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]], st: 3 },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]], st: 1 }
  };
  var ROT = {};
  (function () {
    for (var t in SHAPE) {
      var s = SHAPE[t], r, cur = s.c, out = [];
      for (r = 0; r < 4; r++) {
        out.push(cur);
        var nx = [];
        for (var i = 0; i < cur.length; i++) nx.push([s.n - 1 - cur[i][1], cur[i][0]]);
        cur = nx;
      }
      ROT[t] = out;
    }
  })();
  var KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];
  var STYLE_TILE = ['SP', 'BK_A', 'BK_B', 'BK_C', 'BK_G'];

  /* ============================== 影子名稱表 ============================== */
  var want = new Uint8Array(960), have = new Uint8Array(960), dirty = new Uint8Array(960);
  var queue = [], qi = 0, ntWrites = 0;
  function put(c, r, t) {
    var i = r * 32 + c;
    want[i] = t;
    if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function text(c, r, s) { s = String(s); for (var i = 0; i < s.length; i++) put(c + i, r, B.charTile(s.charAt(i))); }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function flush(ppu, unlimited) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
    while (qi < queue.length) {
      if (!unlimited && base + n >= NT_LIMIT) break;
      var i = queue[qi++];
      dirty[i] = 0;
      if (want[i] !== have[i]) { ppu.setTile(0, i & 31, i >> 5, want[i]); have[i] = want[i]; n++; }
    }
    if (qi >= queue.length) { queue.length = 0; qi = 0; }
    ntWrites = n;
    return n;
  }
  function ntReset() { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; }

  /* ============================== 亂數（16-bit xorshift，可重現） ============================== */
  var rs = 0x5EED;
  function rnd() { rs ^= (rs << 7) & 0xFFFF; rs ^= rs >> 9; rs ^= (rs << 8) & 0xFFFF; rs &= 0xFFFF; if (!rs) rs = 0x1234; return rs; }
  function rndN(n) { return rnd() % n; }

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, sel: 0, menuMode: 0, menuLevel: 1, menuMusic: 0,
      gameMode: 'marathon', startLevel: 1,
      field: new Uint8Array(ROWS * W), sub: 'fall', subT: 0,
      cur: null, bag: [], next: [], hold: null, holdUsed: false,
      grav: 0, lockT: 0, lockN: 0, das: 0, dasDir: 0, soft: 0,
      score: 0, lines: 0, level: 1, combo: -1, lastClear: 0, clearRows: [], popT: 0, popText: '',
      riseT: 0, riseHole: 0, paused: false, result: null, goal: false, best: 0,
      cheats: 0, flashT: 0, pieces: 0, danger: false, palLevel: -1, ghostY: 0,
      bot: { id: -1, rot: 0, x: 0, t: 0 }, stats: { singles: 0, doubles: 0, triples: 0, novas: 0, rises: 0 }
    };
  }

  /* ============================== 盤面 ============================== */
  function cell(x, y) { if (x < 0 || x >= W || y >= ROWS) return 9; if (y < 0) return 0; return g.field[y * W + x]; }
  function fits(t, rot, px, py, field) {
    var c = ROT[t][rot & 3], i;
    for (i = 0; i < 4; i++) {
      var x = px + c[i][0], y = py + c[i][1];
      if (x < 0 || x >= W || y >= ROWS) return false;
      if (y >= 0 && (field || g.field)[y * W + x]) return false;
    }
    return true;
  }
  function dropY(t, rot, px, py, field) { while (fits(t, rot, px, py + 1, field)) py++; return py; }
  function stackTop() { for (var y = 0; y < ROWS; y++) for (var x = 0; x < W; x++) if (g.field[y * W + x]) return y; return ROWS; }

  function refillBag() {
    var b = TYPES.slice(), i;
    for (i = b.length - 1; i > 0; i--) { var j = rndN(i + 1), t = b[i]; b[i] = b[j]; b[j] = t; }
    g.bag = g.bag.concat(b);
  }
  function takeNext() {
    while (g.next.length < 4) { if (!g.bag.length) refillBag(); g.next.push(g.bag.shift()); }
    var t = g.next.shift();
    if (!g.bag.length) refillBag();
    g.next.push(g.bag.shift());
    return t;
  }
  function spawn(t) {
    var p = { t: t, rot: 0, x: t === 'O' ? 4 : 3, y: 1, id: g.pieces++ };
    g.cur = p; g.grav = 0; g.lockT = 0; g.lockN = 0; g.soft = 0;
    if (!fits(p.t, p.rot, p.x, p.y)) {
      if (fits(p.t, p.rot, p.x, p.y - 1)) p.y--;
      else { topOut(); return false; }
    }
    g.sub = 'fall';
    return true;
  }
  function gravityFrames() {
    var lv = g.gameMode === 'challenge' ? Math.min(20, g.level * 2 + 1) : g.level;
    return GRAVITY[Math.max(0, Math.min(GRAVITY.length - 1, lv - 1))];
  }
  function tryMove(dx, dy) {
    var p = g.cur;
    if (!fits(p.t, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    if (dx && g.lockT > 0 && g.lockN < LOCK_RESETS) { g.lockT = 0; g.lockN++; }
    return true;
  }
  function tryRotate(dir) {
    var p = g.cur, nr = (p.rot + dir + 4) & 3, i;
    if (p.t === 'O') return false;
    for (i = 0; i < KICKS.length; i++) {
      var dx = KICKS[i][0], dy = KICKS[i][1];
      if (fits(p.t, nr, p.x + dx, p.y + dy)) {
        p.x += dx; p.y += dy; p.rot = nr;
        if (g.lockT > 0 && g.lockN < LOCK_RESETS) { g.lockT = 0; g.lockN++; }
        return true;
      }
    }
    return false;
  }
  function lockPiece() {
    var p = g.cur, c = ROT[p.t][p.rot], i, st = SHAPE[p.t].st, above = true;
    for (i = 0; i < 4; i++) {
      var y = p.y + c[i][1];
      if (y >= 0) g.field[y * W + p.x + c[i][0]] = st;
      if (y >= HID) above = false;
    }
    g.cur = null; g.holdUsed = false;
    sfx('blocks_lock');
    if (above) { topOut(); return; }       // 整塊鎖在看不見的上方 ⇒ 堆滿
    // 消行判定
    var rows = [], y2, x;
    for (y2 = 0; y2 < ROWS; y2++) {
      var full = true;
      for (x = 0; x < W; x++) if (!g.field[y2 * W + x]) { full = false; break; }
      if (full) rows.push(y2);
    }
    if (rows.length) {
      g.clearRows = rows; g.sub = 'clear'; g.subT = 0;
      scoreLines(rows.length);
    } else {
      g.combo = -1; g.sub = 'are'; g.subT = 0;
    }
  }
  function scoreLines(n) {
    g.combo++;
    var lv = g.level;
    addScore(LINE_PTS[n] * lv + (g.combo > 0 ? 50 * g.combo * lv : 0));
    var names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'NOVA!'];
    g.popText = names[n]; g.popT = 90;
    if (n === 4) { g.stats.novas++; g.flashT = 12; sfx('blocks_quad'); }
    else { sfx('blocks_line'); g.stats[['', 'singles', 'doubles', 'triples'][n]]++; }
    g.lastClear = n;
  }
  function addScore(v) { g.score = Math.min(9999999, g.score + v); }
  function collapse() {
    var rows = g.clearRows, f = g.field, nf = new Uint8Array(ROWS * W), dst = ROWS - 1, y, x, k = 0;
    var gone = {};
    for (k = 0; k < rows.length; k++) gone[rows[k]] = 1;
    for (y = ROWS - 1; y >= 0; y--) {
      if (gone[y]) continue;
      for (x = 0; x < W; x++) nf[dst * W + x] = f[y * W + x];
      dst--;
    }
    g.field = nf;
    var before = g.level;
    g.lines += rows.length;
    g.clearRows = [];
    updateLevel();
    if (g.level !== before) sfx('blocks_lvl');
    if (g.gameMode === 'marathon' && g.lines >= GOAL_LINES) g.goal = true;
    var end = g.gameMode === 'marathon' ? MARATHON_END : CHALLENGE_END;
    if (g.lines >= end) { finish('clear'); return; }
    g.sub = 'are'; g.subT = 0;
  }
  function updateLevel() {
    if (g.gameMode === 'marathon') g.level = Math.min(20, Math.max(g.startLevel, g.startLevel + Math.floor(g.lines / 10)));
    else g.level = Math.min(5, 1 + Math.floor(g.lines / 10));
  }
  function riseGarbage() {
    var f = g.field, x, y;
    for (x = 0; x < W; x++) if (f[x]) { topOut(); return; }     // 最上一列有東西被推出界
    for (y = 0; y < ROWS - 1; y++) for (x = 0; x < W; x++) f[y * W + x] = f[(y + 1) * W + x];
    if (rndN(10) >= 7) g.riseHole = rndN(W);
    for (x = 0; x < W; x++) f[(ROWS - 1) * W + x] = (x === g.riseHole) ? 0 : 4;
    if (g.cur && !fits(g.cur.t, g.cur.rot, g.cur.x, g.cur.y)) {
      if (fits(g.cur.t, g.cur.rot, g.cur.x, g.cur.y - 1)) g.cur.y--;
    }
    g.stats.rises++;
    sfx('blocks_rise');
  }
  function topOut() { g.cur = null; finish('over'); }
  function finish(kind) {
    g.result = kind; g.sub = kind === 'clear' ? 'done' : 'over'; g.subT = 0; g.cur = null;
    var key = g.gameMode === 'marathon' ? 'best' : 'bestc';
    if (g.score > CT.load('blocks', key, 0)) CT.save('blocks', key, g.score);
    B.Audio.stop(nes0);
    if (kind === 'clear') B.Audio.play(nes0, 'blocks_clear');
    else { B.Audio.play(nes0, 'blocks_over'); sfx('blocks_over'); }
  }
  function sfx(n) { B.Audio.sfx(nes0, n); }

  /* ============================== 遊戲流程 ============================== */
  function startGame() {
    g.gameMode = g.menuMode === 1 ? 'challenge' : 'marathon';
    g.startLevel = g.gameMode === 'marathon' ? g.menuLevel : 1;
    g.field = new Uint8Array(ROWS * W);
    g.bag = []; g.next = []; g.hold = null; g.holdUsed = false;
    g.score = 0; g.lines = 0; g.combo = -1; g.result = null; g.paused = false; g.pieces = 0;
    g.goal = false; g.cheats = 0; g.popT = 0; g.flashT = 0; g.danger = false; g.palLevel = -1;
    g.stats = { singles: 0, doubles: 0, triples: 0, novas: 0, rises: 0 };
    var seedQ = parseInt(CT.query && CT.query('seed') || '', 10);
    rs = (isFinite(seedQ) && seedQ > 0) ? (seedQ & 0xFFFF) : ((g.frames * 2654435761) & 0xFFFF) || 0x5EED;
    updateLevel();
    g.riseHole = rndN(W);
    if (g.gameMode === 'challenge') { for (var i = 0; i < 4; i++) riseGarbage(); g.stats.rises = 0; }
    g.riseT = 0;
    g.mode = 'play';
    CT.blank(nes0, function () { drawPlayScreen(); });
    g.best = CT.load('blocks', g.gameMode === 'marathon' ? 'best' : 'bestc', 0);
    playMusic();
    while (g.next.length < 4) { if (!g.bag.length) refillBag(); g.next.push(g.bag.shift()); }
    g.cur = null; g.sub = 'are'; g.subT = ARE - 30;   // 開局留半秒
  }
  function playMusic() {
    var m = g.menuMusic;
    if (m === 2) { B.Audio.stop(nes0); return; }
    var key = m === 1 ? 'blocks_b' : (g.danger ? 'blocks_fast' : 'blocks_a');
    B.Audio.play(nes0, key);
  }
  function toTitle() {
    g.mode = 'title'; g.result = null; g.cur = null; g.paused = false;
    CT.blank(nes0, function () { drawTitleScreen(); });
    B.Audio.stop(nes0);
    B.Audio.play(nes0, 'blocks_b');
  }

  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }

  function updateTitle() {
    var up = pressed(BTN.UP), dn = pressed(BTN.DOWN), lf = pressed(BTN.LEFT), rt = pressed(BTN.RIGHT);
    if (up) { g.sel = (g.sel + 2) % 3; sfx('blocks_menu'); }
    if (dn) { g.sel = (g.sel + 1) % 3; sfx('blocks_menu'); }
    if (lf || rt) {
      var d = rt ? 1 : -1;
      if (g.sel === 0) g.menuMode = (g.menuMode + 1) & 1;
      else if (g.sel === 1) g.menuLevel = ((g.menuLevel - 1 + d + 10) % 10) + 1;
      else g.menuMusic = (g.menuMusic + d + 3) % 3;
      sfx('blocks_menu');
    }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('blocks_ok'); startGame(); }
  }

  function updatePlay() {
    // START 暫停（SELECT 同時按著 = registry 的回選單組合，不處理）
    if (pressed(BTN.START) && !held(BTN.SELECT) && g.sub !== 'over' && g.sub !== 'done') {
      g.paused = !g.paused;
      if (g.paused) B.Audio.pause(nes0); else if (!B.Audio.resume(nes0)) playMusic();   // R6：從同一 row 接續
      sfx('blocks_ok');
    }
    if (g.paused) return;
    if (g.popT > 0) g.popT--;
    if (g.flashT > 0) g.flashT--;

    if (g.sub === 'over' || g.sub === 'done') {
      g.subT++;
      if (g.subT > 90 && (pressed(BTN.START) || pressed(BTN.A)) && !held(BTN.SELECT)) toTitle();
      return;
    }

    // 挑戰：垃圾行上升計時（消行演出期間暫停）
    if (g.gameMode === 'challenge' && g.sub !== 'clear') {
      g.riseT++;
      if (g.riseT >= RISE[g.level - 1]) { g.riseT = 0; riseGarbage(); if (g.result) return; }
    }

    // 危險區音樂（堆到前 6 列）＝音樂即 UI
    var top = stackTop(), danger = g.danger ? top < HID + 8 : top < HID + 6;
    if (danger !== g.danger) { g.danger = danger; if (g.menuMusic === 0) { B.Audio.current = null; playMusic(); } }

    if (g.sub === 'clear') {
      if (++g.subT >= CLEAR_FRAMES) collapse();
      return;
    }
    if (g.sub === 'are') {
      // ARE 期間仍收 DAS 充能（研究 13：先按住方向，生成即滑動）
      dasCharge();
      if (++g.subT >= ARE) spawn(takeNext());
      return;
    }
    if (!g.cur) return;
    var p = g.cur;

    if (pressed(BTN.SELECT) && !held(BTN.START) && !g.holdUsed) { doHold(); return; }
    if (pressed(BTN.A)) { if (tryRotate(1)) sfx('blocks_rot'); }
    if (pressed(BTN.B)) { if (tryRotate(-1)) sfx('blocks_rot'); }

    // 左右 + DAS
    var dir = held(BTN.LEFT) ? -1 : (held(BTN.RIGHT) ? 1 : 0);
    if (held(BTN.LEFT) && held(BTN.RIGHT)) dir = 0;
    if (dir !== g.dasDir) { g.dasDir = dir; g.das = 0; if (dir && tryMove(dir, 0)) sfx('blocks_move'); }
    else if (dir) {
      g.das++;
      if (g.das >= DAS_FIRST) { g.das = DAS_FIRST - DAS_REP; if (tryMove(dir, 0)) sfx('blocks_move'); }
    }

    // 硬降：只認「UP 剛按下、而且沒按住左右」（fix-r5 P3-4：手機十字鍵往上偏 25° 會變 UP+左右，
    // 不能因此誤砸；engine/touch.js 不改，在本遊戲輸入層擋）
    if (pressed(BTN.UP) && !held(BTN.LEFT) && !held(BTN.RIGHT)) {
      var ny = dropY(p.t, p.rot, p.x, p.y);
      addScore((ny - p.y) * 2);
      p.y = ny; sfx('blocks_drop'); lockPiece(); return;
    }
    // 重力 / 軟降
    var gf = gravityFrames(), fall = false;
    if (held(BTN.DOWN) && !held(BTN.LEFT) && !held(BTN.RIGHT)) {
      if (++g.soft >= Math.min(SOFT_RATE, gf)) { g.soft = 0; if (tryMove(0, 1)) { addScore(1); g.grav = 0; } else fall = true; }
    } else g.soft = 0;
    if (++g.grav >= gf) { g.grav = 0; if (!tryMove(0, 1)) fall = true; }
    // 鎖定延遲
    if (!fits(p.t, p.rot, p.x, p.y + 1)) {
      g.lockT++;
      if (g.lockT >= LOCK_DELAY || (fall && g.lockN >= LOCK_RESETS)) lockPiece();
    } else if (g.lockT > 0) g.lockT = 0;
  }
  function dasCharge() {
    var dir = held(BTN.LEFT) ? -1 : (held(BTN.RIGHT) ? 1 : 0);
    if (dir !== g.dasDir) { g.dasDir = dir; g.das = 0; }
    else if (dir && g.das < DAS_FIRST - 1) g.das++;
  }
  function doHold() {
    var t = g.cur.t;
    g.cur = null;
    if (g.hold) { var h = g.hold; g.hold = t; spawn(h); }
    else { g.hold = t; spawn(takeNext()); }
    g.holdUsed = true;
    sfx('blocks_hold');
  }

  /* ============================== 畫面 ============================== */
  function box(c0, r0, c1, r1) {
    var c, r;
    put(c0, r0, B.T('FR_TL')); put(c1, r0, B.T('FR_TR')); put(c0, r1, B.T('FR_BL')); put(c1, r1, B.T('FR_BR'));
    for (c = c0 + 1; c < c1; c++) { put(c, r0, B.T('FR_T')); put(c, r1, B.T('FR_B')); }
    for (r = r0 + 1; r < r1; r++) { put(c0, r, B.T('FR_L')); put(c1, r, B.T('FR_R')); }
  }
  function stars(seed, count, avoid) {
    var s = seed, i;
    for (i = 0; i < count; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (avoid && avoid(c, r)) continue;
      put(c, r, B.T((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
  }
  function setPalettes(lvPal) {
    ppu0.setBackdrop(0x0F);
    ppu0.setBgPalette(0, PAL_FRAME);
    ppu0.setBgPalette(1, lvPal);
    ppu0.setBgPalette(2, PAL_LABEL);
    ppu0.setBgPalette(3, PAL_POP);
    ppu0.setSprPalette(0, lvPal);
    ppu0.setSprPalette(1, SPR_GHOST);
    ppu0.setSprPalette(2, SPR_CURSOR);
    ppu0.setSprPalette(3, PAL_POP);
  }
  function drawTitleScreen() {
    ntReset();
    for (var i = 0; i < 960; i++) dirty[i] = 0;
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes(LV_PAL[0]);
    stars(7, 70, function (c, r) { return (r >= 2 && r <= 8) || (r >= 9 && r <= 28 && c >= 3 && c <= 28); });
    text(12, 2, 'STARDUST');
    var word = 'BLOCKS', c0 = 1, k, x, y;
    for (k = 0; k < word.length; k++) {
      var gl = B.LOGO[word.charAt(k)], tile = B.T(['BK_A', 'BK_B', 'BK_C'][k % 3]);
      for (y = 0; y < 5; y++) for (x = 0; x < 4; x++) if (gl[y].charAt(x) === '#') put(c0 + k * 5 + x, 3 + y, tile);
    }
    ppu0.fillAttr(0, 0, 1, 16, 3, 1);                  // 大字列 2..7 → 方塊色
    box(3, 9, 28, 28);
    ppu0.fillAttr(0, 2, 5, 3, 3, 2);                   // 選單標籤（MODE / LEVEL / MUSIC）黃字
    // 說明文字一律隔一列（fix-r5 P3-5：8×8 字上下筆畫不黏在一起）
    text(5, TITLE_ROW, 'MODE'); text(5, TITLE_ROW + 2, 'LEVEL'); text(5, TITLE_ROW + 4, 'MUSIC');
    text(5, 16, 'A/B ROTATE  UP DROP');
    text(5, 18, 'DOWN SOFT  SELECT HOLD');
    text(5, 20, 'START PAUSE  C/$ CHEAT');
    text(5, 22, 'HOLD START+SELECT:MENU');
    text(11, 24, 'PUSH START');
    flush(ppu0, true);
    drawTitleValues();
    flush(ppu0, true);
  }
  function drawTitleValues() {
    text(12, TITLE_ROW, g.menuMode ? 'CHALLENGE' : 'MARATHON ');
    text(12, TITLE_ROW + 2, g.menuMode ? '--' : num(g.menuLevel, 2));
    text(12, TITLE_ROW + 4, ['A STARFALL', 'B MOONWALK', 'OFF       '][g.menuMusic]);
    var best = CT.load('blocks', g.menuMode ? 'bestc' : 'best', 0);
    text(10, 26, 'BEST ' + num(best, 7));
  }
  function drawPlayScreen() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes(LV_PAL[(g.level - 1) % LV_PAL.length]);
    g.palLevel = g.level;
    stars(3, 40, function (c, r) { return r >= 4 && r <= 27; });
    text(8, 2, 'STARDUST  BLOCKS');
    box(FX - 1, FY - 1, FX + W, FY + H);
    box(1, FY - 1, 10, FY + H);
    box(23, FY - 1, 30, FY + H);
    // 屬性：盤面 / 暫存 / 下一塊 = 第 1 組；標籤 = 第 2 組；提示 = 第 3 組
    ppu0.fillAttr(0, FX >> 1, FY >> 1, W >> 1, H >> 1, 1);
    ppu0.fillAttr(0, 2, 4, 2, 1, 1);
    ppu0.fillAttr(0, 12, 4, 2, 1, 1); ppu0.fillAttr(0, 12, 6, 2, 1, 1); ppu0.fillAttr(0, 12, 8, 2, 1, 1);
    var lab = [3, 5, 7, 9, 11], i;
    for (i = 0; i < lab.length; i++) ppu0.fillAttr(0, 1, lab[i], 4, 1, 2);
    ppu0.fillAttr(0, 12, 3, 3, 1, 2); ppu0.fillAttr(0, 12, 10, 3, 1, 2);
    ppu0.fillAttr(0, 12, 12, 3, 1, 3);
    text(3, 7, 'HOLD'); text(24, 7, 'NEXT');
    text(2, 11, 'SCORE'); text(2, 15, 'LEVEL'); text(2, 19, 'LINES');
    text(2, 23, g.gameMode === 'marathon' ? 'GOAL' : 'RISE');
    text(24, 21, 'BEST');
    renderPlay();
    flush(ppu0, true);
  }

  function cellTile(y, x) {
    var v = g.field[y * W + x];
    if (g.sub === 'clear') {
      for (var k = 0; k < g.clearRows.length; k++) if (g.clearRows[k] === y) {
        var t = g.subT;
        if (t < 12) return B.T(((t / 3) | 0) & 1 ? 'BK_D' : 'BK_F');
        var step = ((t - 12) >> 1);                      // 0..5：由中間往兩側抹掉
        if (x >= 4 - step && x <= 5 + step) return B.T('SP');
        return B.T('BK_D');
      }
    }
    return B.T(STYLE_TILE[v] || 'SP');
  }
  function preview(c0, r0, t) {
    var x, y, i;
    for (y = 0; y < 2; y++) for (x = 0; x < 4; x++) put(c0 + x, r0 + y, 0);
    if (!t) return;
    var cs = ROT[t][0], st = B.T(STYLE_TILE[SHAPE[t].st]);
    var oy = t === 'I' ? -1 : 0, ox = (t === 'O') ? 1 : 0;
    for (i = 0; i < 4; i++) put(c0 + ox + cs[i][0], r0 + oy + cs[i][1], st);
  }
  function renderPlay() {
    var x, y;
    var over = g.sub === 'over' || g.sub === 'done';
    var curtain = over ? Math.min(H, (g.subT >> 1)) : 0;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var t;
        if (g.paused) t = 0;
        else if (over && y >= H - curtain) t = B.T(g.result === 'clear' ? 'BK_C' : 'BK_G');
        else t = cellTile(y + HID, x);
        put(FX + x, FY + y, t);
      }
    }
    if (g.paused) text(FX + 2, FY + 9, 'PAUSE');
    if (over && curtain >= H) {
      text(FX, FY + 7, '          ');
      text(FX + 1, FY + 8, g.result === 'clear' ? 'COMPLETE' : 'GAME OVER');
      text(FX, FY + 9, '          ');
      text(FX, FY + 11, '          ');
      text(FX, FY + 12, 'PUSH START');
      text(FX, FY + 13, '          ');
    }
    preview(4, 8, g.paused ? null : g.hold);
    for (var i = 0; i < 3; i++) preview(24, 8 + i * 4, g.paused ? null : g.next[i]);
    text(2, 12, num(g.score, 7));
    text(2, 16, num(g.level, 2));
    text(2, 20, num(g.lines, 3));
    if (g.gameMode === 'marathon') text(2, 24, g.lines >= GOAL_LINES ? 'CLEAR!' : num(GOAL_LINES - g.lines, 3) + '   ');
    else {
      var n = Math.floor((RISE[g.level - 1] - g.riseT) * 6 / RISE[g.level - 1]);
      for (x = 0; x < 6; x++) put(2 + x, 24, B.T(x < n ? 'BAR1' : 'BAR0'));
    }
    text(24, 22, num(Math.max(g.best, g.score), 6));
    var pop = g.popT > 0 ? g.popText : '';
    text(24, 24, (pop + '      ').substring(0, 6));
    text(24, 25, (g.popT > 0 && g.combo > 0) ? ('COMBO' + Math.min(9, g.combo)) : '      ');
  }

  function drawSprites() {
    var i, slot = 0;
    if (g.mode === 'title') {
      ppu0.sprite(8, { x: 3 * 8, y: (TITLE_ROW + g.sel * 2) * 8, tile: B.S('CURSOR'), pal: 2 });
      for (i = 0; i < 8; i++) ppu0.sprite(i, null);
      return;
    }
    ppu0.sprite(8, null);
    var p = g.cur;
    if (!p || g.paused) { for (i = 0; i < 8; i++) ppu0.sprite(i, null); return; }
    var cs = ROT[p.t][p.rot], tile = B.S(STYLE_TILE[SHAPE[p.t].st]);
    var gy = dropY(p.t, p.rot, p.x, p.y);
    g.ghostY = gy;
    var occ = {};
    for (i = 0; i < 4; i++) {
      var y = p.y + cs[i][1], x = p.x + cs[i][0];
      occ[x + ',' + y] = 1;
      if (y < HID) { ppu0.sprite(slot++, null); continue; }
      ppu0.sprite(slot++, { x: (FX + x) * 8, y: (FY + y - HID) * 8, tile: tile, pal: 0 });
    }
    for (i = 0; i < 4; i++) {
      var yy = gy + cs[i][1], xx = p.x + cs[i][0];
      if (gy === p.y || yy < HID || occ[xx + ',' + yy]) { ppu0.sprite(slot++, null); continue; }
      ppu0.sprite(slot++, { x: (FX + xx) * 8, y: (FY + yy - HID) * 8, tile: B.S('GHOST'), pal: 1 });
    }
  }

  /* ============================== 機器人（?bot=1） ============================== */
  // 每塊生成時窮舉「旋轉 × 落點」，用經典四特徵評分（總高度 / 洞 / 起伏 / 消行）選一個，
  // 然後一幀一個邊緣（按、放）把方塊轉好、移好、↑ 硬降。不開密技、不看未來塊。
  function evalField(f) {
    var x, y, agg = 0, holes = 0, bump = 0, hs = [], lines = 0;
    for (y = 0; y < ROWS; y++) { var full = true; for (x = 0; x < W; x++) if (!f[y * W + x]) { full = false; break; } if (full) lines++; }
    for (x = 0; x < W; x++) {
      var h = 0, seen = false;
      for (y = 0; y < ROWS; y++) {
        if (f[y * W + x]) { if (!seen) { h = ROWS - y; seen = true; } }
        else if (seen) holes++;
      }
      hs.push(h); agg += h;
    }
    for (x = 0; x < W - 1; x++) bump += Math.abs(hs[x] - hs[x + 1]);
    return -0.51 * agg + 0.76 * lines - 0.36 * holes * 2 - 0.18 * bump;
  }
  function botPlan(p) {
    var best = -1e9, plan = { rot: 0, x: p.x }, r, x;
    for (r = 0; r < 4; r++) {
      for (x = -2; x < W; x++) {
        if (!fits(p.t, r, x, 0) && !fits(p.t, r, x, 1)) continue;
        var y0 = fits(p.t, r, x, 1) ? 1 : 0;
        var y = dropY(p.t, r, x, y0);
        var f = new Uint8Array(g.field), c = ROT[p.t][r], i, bad = false;
        for (i = 0; i < 4; i++) { var yy = y + c[i][1]; if (yy < HID) bad = true; if (yy >= 0) f[yy * W + x + c[i][0]] = 1; }
        var s = evalField(f) - (bad ? 1000 : 0);
        if (s > best) { best = s; plan = { rot: r, x: x }; }
      }
    }
    return plan;
  }
  function bot() {
    var b = g.bot;
    b.t++;
    if (g.mode === 'title') return (b.t & 15) === 0 ? BTN.START : 0;
    if (g.sub === 'over' || g.sub === 'done') return (g.subT > 100 && !g.goal && (b.t & 15) === 0) ? BTN.START : 0;
    if (g.paused) return (b.t & 15) === 0 ? BTN.START : 0;
    var p = g.cur;
    if (!p || g.sub !== 'fall') return 0;
    if (b.id !== p.id) { var pl = botPlan(p); b.id = p.id; b.rot = pl.rot; b.x = pl.x; b.tries = 0; }
    if (b.t & 1) return 0;                       // 放開一幀，製造下一個「按下」邊緣
    if (++b.tries > 40) return BTN.UP;
    if (p.rot !== b.rot) return ((b.rot - p.rot + 4) & 3) === 3 ? BTN.B : BTN.A;
    if (p.x < b.x) return BTN.RIGHT;
    if (p.x > b.x) return BTN.LEFT;
    return BTN.UP;
  }

  /* ============================== 密技 ============================== */
  // 一鍵密技「星塵炸彈」：盤面最底下 4 列直接蒸發（不算行數、不加分），堆高立刻降 4 列；
  // 挑戰模式另把垃圾上升計時歸零。不限次數。
  // GAME OVER 時按密技 = **原地續關**（fix-r5 §6-1）：底下 CONT_ROWS 列蒸發、分數 / 行數 / 等級 / 暫存 / 預覽全保留，
  // 立刻接著出下一塊；完走（done）與標題畫面無效。用過密技的那一局 goal() 一律 false。
  var BOMB_ROWS = 4, CONT_ROWS = 8;
  function bomb(n) {
    var f = g.field, nf = new Uint8Array(ROWS * W), y, x;
    for (y = n; y < ROWS; y++) for (x = 0; x < W; x++) nf[y * W + x] = f[(y - n) * W + x];
    g.field = nf; g.riseT = 0;
  }
  function cheat() {
    if (!g || g.mode !== 'play' || g.sub === 'done') return false;
    if (g.sub === 'over') {
      bomb(CONT_ROWS);
      g.result = null; g.cur = null; g.paused = false; g.holdUsed = false; g.combo = -1;
      g.sub = 'are'; g.subT = ARE - 30; g.danger = false;
      g.cheats++; g.flashT = 8;
      B.Audio.stop(nes0); playMusic();
      sfx('blocks_quad');
      return true;
    }
    if (g.sub === 'clear') { g.clearRows = []; g.sub = 'are'; g.subT = 0; }
    bomb(BOMB_ROWS); g.cheats++;
    sfx('blocks_quad'); g.flashT = 8;
    return true;
  }
  function saveBest() {
    if (!g || g.mode !== 'play') return;
    var key = g.gameMode === 'marathon' ? 'best' : 'bestc';
    if (g.score > CT.load('blocks', key, 0)) CT.save('blocks', key, g.score);
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'blocks', order: 2, title: '星塵方塊', legacy: ['tetris.html', 'tetris-game.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      B.buildChr();
      NES.CHR.setPattern(0, B.bgBank);
      NES.CHR.setPattern(1, B.sprBank);
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      B.Audio.init(nes);
      var q = CT.query || function () { return null; };
      if (q('mode') === 'challenge') g.menuMode = 1;
      var lq = parseInt(q('level') || '', 10);
      if (lq >= 1 && lq <= 10) g.menuLevel = lq;
      drawTitleScreen();
      B.Audio.play(nes, 'blocks_b');
      if (q('autostart') === '1') startGame();
    },
    update: function (nes) {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else updatePlay();
      B.Audio.tick(nes);
    },
    draw: function (nes) {
      if (g.mode === 'title') drawTitleValues();
      else {
        var want2 = (g.level - 1) % LV_PAL.length;
        if (g.palLevel !== g.level) { ppu0.setBgPalette(1, LV_PAL[want2]); ppu0.setSprPalette(0, LV_PAL[want2]); g.palLevel = g.level; }
        var bd = g.flashT > 0 && (g.flashT & 2) ? 0x01 : 0x0F;
        if (bd !== g.backdrop) { ppu0.setBackdrop(bd); g.backdrop = bd; }
        renderPlay();
      }
      flush(ppu0, false);
      drawSprites();
    },
    exit: function (nes) { saveBest(); B.Audio.stop(nes); },   // 中途回選單也存最高分（fix-r5 P3-2）
    // 回選單收攏提示用的精靈（fix-r5 §6-4）：精靈表裡的實心方塊、第 2 組（橘黃）調色盤
    get backTile() { B.buildChr(); return { tile: B.S('BK_F'), pal: 2 }; },
    state: function () {
      if (!g) return null;
      var p = g.cur;
      return {
        mode: g.mode, sub: g.sub, gameMode: g.gameMode, level: g.level, lines: g.lines, score: g.score,
        piece: p ? { t: p.t, x: p.x, y: p.y, rot: p.rot, id: p.id } : null, ghostY: g.ghostY,
        next: g.next.slice(0, 3), hold: g.hold, holdUsed: g.holdUsed, paused: g.paused, result: g.result,
        goal: g.goal, cheats: g.cheats, pieces: g.pieces, combo: g.combo, stackTop: stackTop(),
        riseT: g.riseT, danger: g.danger, music: B.Audio.current, lastSfx: B.Audio.lastSfx,
        stats: g.stats, sel: g.sel, menu: [g.menuMode, g.menuLevel, g.menuMusic],
        queue: queue.length - qi, ntWrites: ntWrites, frames: g.frames
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    bestText: function () { return num(Math.min(999999, CT.load('blocks', 'best', 0)), 6); }   // R6 §1-6：右對齊 6 字元
  };

  // 測試鉤子（只讀寫本遊戲狀態，不碰 engine）
  B.dev = {
    field: function () {
      var out = [], y, x;
      for (y = 0; y < ROWS; y++) { var s = ''; for (x = 0; x < W; x++) s += g.field[y * W + x] ? String(g.field[y * W + x]) : '.'; out.push(s); }
      return out;
    },
    setField: function (rows) {   // rows：由下往上對齊的字串陣列（'.' 空、其他 = 款 1）
      g.field = new Uint8Array(ROWS * W);
      for (var i = 0; i < rows.length; i++) {
        var y = ROWS - rows.length + i;
        for (var x = 0; x < W; x++) { var ch = rows[i].charAt(x); if (ch && ch !== '.') g.field[y * W + x] = (ch >= '1' && ch <= '4') ? +ch : 1; }
      }
    },
    setPiece: function (t, x, y, rot) { g.cur = { t: t, rot: rot || 0, x: x === undefined ? 3 : x, y: y === undefined ? 1 : y, id: g.pieces++ }; g.sub = 'fall'; g.lockT = 0; g.grav = 0; },
    setLines: function (n) { g.lines = n; updateLevel(); },
    fits: function (t, r, x, y) { return fits(t, r, x, y); },
    rot: ROT, consts: { W: W, H: H, HID: HID, FX: FX, FY: FY, DAS_FIRST: DAS_FIRST, DAS_REP: DAS_REP, LOCK_DELAY: LOCK_DELAY, GRAVITY: GRAVITY, RISE: RISE, NT_LIMIT: NT_LIMIT, GOAL_LINES: GOAL_LINES, LINE_PTS: LINE_PTS },
    rise: function () { riseGarbage(); },
    start: function (mode, level) { g.menuMode = mode === 'challenge' ? 1 : 0; g.menuLevel = level || 1; startGame(); },
    gravity: function () { return gravityFrames(); },
    holdGravity: function (on) { g.grav = on ? -100000 : 0; }
  };

  if (CT.register) CT.register(GAME);
  B.GAME = GAME;
})();
