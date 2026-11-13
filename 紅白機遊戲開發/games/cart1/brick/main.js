/*
 * games/cart1/brick/main.js — 《星塵打磚塊》（合輯槽 3，id = brick，全域 CT.Brick）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-2 cart1-break ｜ 依賴：engine/*（含 shmup.js 的 NES.SH.vel / aim 整數三角）、
 *        games/cart1/registry.js、brick/{art,levels,audio}.js
 * 舊作概念：legacy breakout.html（只取「拍子接球打磚、硬磚多下、逐關加磚」概念；程式 / 配色 / 關卡全新）。
 *
 * 畫面
 *   - 磚 = 背景名稱表（16×8 = 兩磚；一磚寬恰好一個屬性格 ⇒ 每欄每兩列一組調色盤，levels.js 有規則）；
 *     打掉磚只寫 2 byte，走「影子名稱表 + 差異佇列」，每幀上限 140 byte（overFrames 恆 0）。
 *   - 精靈：星艇 4 顆（加長 6 顆）+ 球 ≤ 3 + 膠囊 1 + 雷射 ≤ 4 + 魔王火球 ≤ 2。
 *     **每線 ≤ 8 靠規則保證**（不靠輪替）：加長 / 雷射 / 吸附 / 多球互斥（新膠囊取代舊能力）、
 *     多球期間不掉膠囊、第 10 回合不掉「加長 / 多球」⇒ 最壞一線：加長 6 + 球 1 + 膠囊 1 = 8、
 *     多球 3 + 星艇 4 = 7、魔王：星艇 4 + 球 1 + 火球 2 + 膠囊 1 = 8。另有逐線計數保險（超過就丟最低優先）。
 * 物理：球位置 1/256 px 整數、速度 8.8，用 NES.SH.vel(角度 0..255, 速率) 查表；每幀分段（每段 ≤ 2 px）
 *       先 x 後 y 檢查碰撞，不穿磚。拍子 8 區角度表（研究 04 §6「輸入 → 可預期的反應」）。
 * 操作：←→ 移動（按住 B = 慢速微調）、A 發球 / 雷射、START 暫停。
 * 能量星珠（7 種，圓珠 + 圖示，fix-r5 P2-2 不用字母）：WING 展翼加長、TRIO 三球、BEAM 雷射、TIME 減速、
 *   GRAB 吸附、LIFE 加命、WALL 底部防護欄（擋一次）。
 * 網址：`?game=brick&debug=1[&bot=1][&round=N]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var K = CT.Brick = CT.Brick || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var SH = NES.SH;

  /* ============================== 常數 ============================== */
  var GW = 14, GH = 14, GX = 16, GY = 48, CW = 16, CH = 8;
  var LEFT = 16, RIGHT = 240, TOP = 32, PY = 200, LOST_Y = 232, GUARD_Y = 218, GUARD_ROW = 27;
  var NT_LIMIT = 140;
  var PADDLE_V = 3, PADDLE_SLOW = 1;
  var SPEED_MIN = 0x180, SPEED_MAX = 0x380;
  var ZONES = [164, 171, 178, 185, 199, 206, 213, 220];
  var MAX_BALLS = 3, MAX_BEAMS = 4, MAX_FIRE = 2;
  var DROP_PCT = 22, LASER_COOL = 14, CATCH_HOLD = 150, READY_AUTO = 180;
  var BOSS_HP = 24;
  var START_LIVES = 3, EXTRA_AT = [20000, 60000, 120000];
  var SCORE_OF = { a: 50, b: 60, c: 70, d: 80, e: 90, f: 100, H: 50 };
  var CAP_W = { WING: 18, TRIO: 16, BEAM: 16, TIME: 18, GRAB: 12, LIFE: 6, WALL: 14 };
  var PAL0 = [0x01, 0x11, 0x30];
  var SPR_PAL = [[0x00, 0x2C, 0x38], [0x00, 0x10, 0x30], [0x06, 0x16, 0x30], [0x06, 0x27, 0x38]];
  var GOAL_ROUNDS = 5;
  var TITLE_ROW = 11;                          // 標題「START SECTOR」列

  /* ============================== 影子名稱表 ============================== */
  var want = new Uint8Array(960), have = new Uint8Array(960), dirty = new Uint8Array(960);
  var queue = [], qi = 0, ntWrites = 0;
  function put(c, r, t) {
    var i = r * 32 + c;
    want[i] = t;
    if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function text(c, r, s) { s = String(s); for (var i = 0; i < s.length; i++) put(c + i, r, K.charTile(s.charAt(i))); }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function flush(unlimited) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
    while (qi < queue.length) {
      if (!unlimited && base + n >= NT_LIMIT) break;
      var i = queue[qi++];
      dirty[i] = 0;
      if (want[i] !== have[i]) { ppu0.setTile(0, i & 31, i >> 5, want[i]); have[i] = want[i]; n++; }
    }
    if (qi >= queue.length) { queue.length = 0; qi = 0; }
    ntWrites = n;
  }
  function ntReset() { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; }

  var rs = 0xACE1;
  function rnd() { rs ^= (rs << 7) & 0xFFFF; rs ^= rs >> 9; rs ^= (rs << 8) & 0xFFFF; rs &= 0xFFFF; if (!rs) rs = 0x1234; return rs; }

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', t: 0, frames: 0, startRound: 1, maxRound: CT.load('brick', 'round', 1),
      round: 1, rd: null, grid: new Int8Array(GW * GH), kind: [], pal: new Uint8Array(GW * GH), left: 0,
      px: 112, pw: 32, power: '', balls: [], beams: [], fire: [], cap: { on: false, x: 0, y: 0, t: 'WING' },
      speed: SPEED_MIN, hits: 0, stuck: null, catchT: 0, laserCool: 0, guard: false,
      score: 0, best: CT.load('brick', 'best', 0), lives: START_LIVES, extraIdx: 0,
      paused: false, cleared: 0, continues: 0, cheats: 0, goal: false,
      boss: null, flash: 0, msg: '', lostT: 0, lastBrickT: 0,
      bot: { t: 0, aim: 0, aimIdx: 0, hits: -1, pick: 0, aimSet: false }, stat: { bricks: 0, caps: 0, lost: 0, maxBalls: 1, maxBeams: 0, dropLine: 0 }
    };
  }
  function sfx(n) { K.Audio.sfx(nes0, n); }

  /* ============================== 回合載入 ============================== */
  function cellIdx(c, r) { return r * GW + c; }
  function loadRound(n) {
    var rd = K.ROUNDS[n - 1];
    g.round = n; g.rd = rd;
    g.grid = new Int8Array(GW * GH); g.kind = []; g.pal = new Uint8Array(GW * GH); g.left = 0;
    var r, c, hardHits = n >= 6 ? 3 : 2;
    for (r = 0; r < GH; r++) for (c = 0; c < GW; c++) g.kind.push('.');
    for (r = 0; r < rd.rows.length; r++) {
      for (c = 0; c < GW; c++) {
        var ch = rd.rows[r].charAt(c), gr = rd.top + r;
        if (!ch || ch === '.') continue;
        var i = cellIdx(c, gr);
        g.kind[i] = ch;
        g.grid[i] = ch === 'X' ? 127 : (ch === 'H' ? hardHits : 1);
        if (ch !== 'X') g.left++;
      }
    }
    // 調色盤：每個屬性格（1 欄 × 2 列）取格內第一個彩色磚的組別，H / X 跟著用
    for (c = 0; c < GW; c++) {
      for (r = 0; r < GH; r += 2) {
        var p = 1, k;
        for (k = 0; k < 2; k++) {
          var kk = g.kind[cellIdx(c, r + k)];
          if (kk === 'a' || kk === 'b') { p = 1; break; }
          if (kk === 'c' || kk === 'd') { p = 2; break; }
          if (kk === 'e' || kk === 'f') { p = 3; break; }
        }
        g.pal[cellIdx(c, r)] = p; g.pal[cellIdx(c, r + 1)] = p;
      }
    }
    g.boss = rd.boss ? { hp: BOSS_HP, inv: 0, eye: 'C', fireT: 120, mouth: 0, dieT: 0, hits: 0 } : null;
    g.beams = []; g.fire = []; g.cap.on = false; g.guard = false;
    g.speed = Math.min(SPEED_MAX, 0x1C0 + (n - 1) * 0x10);
    g.hits = 0; g.power = ''; g.pw = 32;
    if (n > g.maxRound) { g.maxRound = n; CT.save('brick', 'round', n); }
    CT.blank(nes0, function () { drawRoundScreen(); });
    resetServe();
    g.mode = 'ready'; g.t = 0;
    K.Audio.play(nes0, 'brick_start');
  }
  function resetServe() {
    g.px = 112; g.balls = []; g.beams = []; g.fire = [];
    var b = newBall(g.px + 14, PY - 4, 180 + 12, g.speed);
    g.balls.push(b);
    g.stuck = { ball: b, off: 14 }; g.catchT = 0;
  }
  function newBall(xpx, ypx, a, s) {
    var b = { x: xpx << 8, y: ypx << 8, a: a & 255, s: s, vx: 0, vy: 0 };
    setVel(b);
    return b;
  }
  var tmpV = { vx: 0, vy: 0, a: 0 };
  function setVel(b) { SH.vel(b.a, b.s, tmpV); b.vx = tmpV.vx; b.vy = tmpV.vy; }

  /* ============================== 畫面 ============================== */
  function setPalettes() {
    ppu0.setBackdrop(0x0F);
    ppu0.setBgPalette(0, PAL0);
    var p = g.rd ? g.rd.pal : K.ROUNDS[0].pal;
    ppu0.setBgPalette(1, p[0]); ppu0.setBgPalette(2, p[1]); ppu0.setBgPalette(3, p[2]);
    for (var i = 0; i < 4; i++) ppu0.setSprPalette(i, SPR_PAL[i]);
  }
  function brickTiles(i) {
    var k = g.kind[i], hp = g.grid[i];
    if (!hp) return [0, 0];
    if (k === 'X') return [K.T('X_L'), K.T('X_R')];
    if (k === 'H') {
      var full = (g.round >= 6 ? 3 : 2);
      return hp >= full ? [K.T('H_L'), K.T('H_R')] : [K.T('HC_L'), K.T('HC_R')];
    }
    return (k === 'a' || k === 'c' || k === 'e') ? [K.T('A_L'), K.T('A_R')] : [K.T('B_L'), K.T('B_R')];
  }
  function putBrick(c, r) {
    var t = brickTiles(cellIdx(c, r));
    put(2 + c * 2, 6 + r, t[0]); put(3 + c * 2, 6 + r, t[1]);
  }
  function walls() {
    var r, c;
    put(1, 3, K.T('WTL')); put(30, 3, K.T('WTR'));
    for (c = 2; c < 30; c++) put(c, 3, K.T('WT'));
    for (r = 4; r < 29; r++) { put(1, r, K.T('WL')); put(30, r, K.T('WR')); }
  }
  function bossTiles() {
    var bx = 10, by = 6, c, r, b = g.boss;
    if (!b) return;
    if (b.dead) { for (r = 0; r < 8; r++) for (c = 0; c < 12; c++) put(bx + c, by + r, 0); return; }
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 12; c++) {
        var n;
        if (r === 0) n = c === 0 ? 'K_TL' : (c === 11 ? 'K_TR' : 'K_T');
        else if (r === 7) n = c === 0 ? 'K_BL' : (c === 11 ? 'K_BR' : 'K_B');
        else if (c === 0) n = r === 1 ? 'K_TL' : (r === 6 ? 'K_BL' : 'K_L');
        else if (c === 11) n = r === 1 ? 'K_TR' : (r === 6 ? 'K_BR' : 'K_R');
        else n = ((c + r) % 4 === 0) ? 'K_F2' : 'K_F';
        if (r === 0 && (c === 0 || c === 11)) n = 'SP';
        if (r === 7 && (c === 0 || c === 11)) n = 'SP';
        put(bx + c, by + r, K.T(n));
      }
    }
    // 雙眼（2×2）在 (3,2) / (7,2)，嘴在第 5 列 3..8
    var e = b.inv > 0 ? 'X' : b.eye, q;
    for (q = 0; q < 4; q++) {
      put(bx + 3 + (q & 1), by + 2 + (q >> 1), K.T('K_E' + e + q));
      put(bx + 7 + (q & 1), by + 2 + (q >> 1), K.T('K_E' + e + q));
    }
    for (c = 3; c <= 8; c++) put(bx + c, by + 5, K.T(b.mouth ? 'K_M1' : 'K_M0'));
  }
  function drawRoundScreen() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    setPalettes();
    walls();
    var c, r;
    for (r = 0; r < GH; r += 2) for (c = 0; c < GW; c++) ppu0.setAttr(0, 1 + c, 3 + (r >> 1), g.pal[cellIdx(c, r)]);
    if (g.boss) ppu0.fillAttr(0, 5, 3, 6, 4, 3);
    for (r = 0; r < GH; r++) for (c = 0; c < GW; c++) putBrick(c, r);
    bossTiles();
    hud();
    flush(true);
  }
  function hud() {
    text(2, 1, 'SCORE ' + num(g.score, 6));
    text(15, 1, 'HI ' + num(Math.max(g.best, g.score), 6));
    text(25, 1, 'SEC' + num(g.round, 2));
    var i;
    for (i = 0; i < 8; i++) put(2 + i, 2, i < g.lives - 1 ? K.T('LIFE') : 0);
    text(18, 2, g.power ? 'ORB ' + g.power : '        ');
    text(26, 2, g.boss && !g.boss.dead ? 'HP' + num(g.boss.hp, 2) : '    ');
    for (i = 2; i < 30; i++) put(i, GUARD_ROW, g.guard ? K.T('GUARD') : 0);
    var m = g.paused ? 'PAUSE' : g.msg;
    var line1 = '', line2 = '';
    if (m) { var parts = m.split('|'); line1 = parts[0]; line2 = parts[1] || ''; }
    centered(22, line1, 16); centered(23, line2, 16);
  }
  function centered(row, s, w) {
    var pad = Math.floor((w - s.length) / 2), out = '', i;
    for (i = 0; i < w; i++) out += (i >= pad && i - pad < s.length) ? s.charAt(i - pad) : ' ';
    text(16 - (w >> 1), row, out);
  }
  function drawTitleScreen() {
    ntReset();
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    g.rd = K.ROUNDS[0];
    setPalettes();
    var s = 11, i;
    for (i = 0; i < 60; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (r >= 2 && r <= 28 && c >= 2 && c <= 29) continue;
      put(c, r, K.T((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
    text(12, 2, 'STARDUST');
    var word = 'BRICK', L = {
      B: ['###.', '#..#', '###.', '#..#', '###.'], R: ['###.', '#..#', '###.', '#.#.', '#..#'],
      I: ['###.', '.#..', '.#..', '.#..', '###.'], C: ['.###', '#...', '#...', '#...', '.###'],
      K: ['#..#', '#.#.', '##..', '#.#.', '#..#']
    }, k, x, y;
    for (k = 0; k < word.length; k++) {
      var gl = L[word.charAt(k)];
      for (y = 0; y < 5; y++) for (x = 0; x < 4; x++) if (gl[y].charAt(x) === '#') put(4 + k * 5 + x, 4 + y, K.T((x & 1) ? 'A_R' : 'A_L'));
    }
    ppu0.fillAttr(0, 2, 2, 5, 3, 1);                   // B R（大字列 4..8）
    ppu0.fillAttr(0, 7, 2, 2, 3, 2);                   // I
    ppu0.fillAttr(0, 9, 2, 3, 3, 3);                   // C
    ppu0.fillAttr(0, 12, 2, 2, 3, 1);                  // K
    // 說明文字隔一列（fix-r5 P3-5）；星珠是圖示（精靈）+ 本作自訂名稱
    text(5, TITLE_ROW, 'START SECTOR');
    text(4, 13, 'LEFT/RIGHT MOVE  B SLOW');
    text(4, 15, 'A LAUNCH/BEAM  START PAUSE');
    text(4, 17, 'C/$ CHEAT  GAME OVER TOO');
    text(4, 19, 'HOLD START+SELECT:MENU');
    text(7, 21, 'WING    TRIO    BEAM');
    text(7, 23, 'TIME    GRAB    LIFE');
    text(7, 25, 'WALL    PUSH START');
    flush(true);
    titleValues();
    flush(true);
  }
  function titleValues() {
    text(18, TITLE_ROW, '- ' + num(g.startRound, 2) + ' +');
    text(4, 27, 'BEST ' + num(g.best, 6) + '  MAX SEC' + num(g.maxRound, 2));
  }

  /* ============================== 遊戲流程 ============================== */
  function startGame(round) {
    g.score = 0; g.lives = START_LIVES; g.extraIdx = 0; g.cleared = 0; g.goal = false; g.paused = false;
    g.continues = 0; g.cheats = 0;
    rs = 0xACE1 ^ (round * 77);
    loadRound(round);
  }
  function toTitle() {
    g.mode = 'title'; g.paused = false; g.msg = '';
    CT.blank(nes0, function () { drawTitleScreen(); });
    K.Audio.stop(nes0);
    K.Audio.play(nes0, 'brick_end');
  }
  function addScore(v) {
    g.score = Math.min(999999, g.score + v);
    if (g.extraIdx < EXTRA_AT.length && g.score >= EXTRA_AT[g.extraIdx]) { g.extraIdx++; g.lives = Math.min(9, g.lives + 1); sfx('brick_1up'); }
  }
  function setPower(p) {
    g.power = p;
    g.pw = p === 'WING' ? 48 : 32;
    if (g.px + g.pw > RIGHT) g.px = RIGHT - g.pw;
    if (p !== 'GRAB' && g.stuck && g.mode === 'play') release();
  }
  function release() {
    if (!g.stuck) return;
    var b = g.stuck.ball;
    var zone = Math.max(0, Math.min(7, ((g.stuck.off + 2) * 8 / g.pw) | 0));
    b.a = ZONES[zone]; setVel(b);
    g.stuck = null;
    sfx('brick_hit');
  }
  function brickHit(c, r, laser) {
    if (c < 0 || c >= GW || r < 0 || r >= GH) return false;
    var i = cellIdx(c, r), hp = g.grid[i];
    if (!hp) return false;
    var k = g.kind[i];
    if (k === 'X') { sfx('brick_hard'); return true; }
    hp--; g.grid[i] = hp;
    if (hp > 0) { sfx('brick_hard'); putBrick(c, r); return true; }
    g.left--; g.stat.bricks++; g.lastBrickT = g.frames;
    addScore(k === 'H' ? SCORE_OF.H * g.round : SCORE_OF[k]);
    putBrick(c, r);
    sfx('brick_brk');
    maybeDrop(GX + c * CW + 4, GY + r * CH);
    if (g.left <= 0 && !g.boss) roundClear();
    void laser;
    return true;
  }
  function maybeDrop(x, y) {
    if (g.cap.on || g.balls.length > 1 || g.mode !== 'play') return;
    if ((rnd() % 100) >= DROP_PCT) return;
    var pool = [], k, tot = 0;
    for (k in CAP_W) {
      if (!Object.prototype.hasOwnProperty.call(CAP_W, k)) continue;
      if (k === g.power) continue;
      if (g.boss && (k === 'WING' || k === 'TRIO')) continue;
      if (k === 'WALL' && g.guard) continue;
      pool.push(k); tot += CAP_W[k];
    }
    var v = rnd() % tot;
    for (k = 0; k < pool.length; k++) { v -= CAP_W[pool[k]]; if (v < 0) break; }
    g.cap.on = true; g.cap.x = x; g.cap.y = y; g.cap.t = pool[Math.min(k, pool.length - 1)];
  }
  function takeCap(t) {
    g.stat.caps++;
    addScore(1000);
    sfx('brick_cap');
    if (t === 'WING' || t === 'BEAM' || t === 'GRAB') setPower(t);
    else if (t === 'TRIO') {
      setPower('');
      var src = g.balls[0];
      if (src && g.balls.length < MAX_BALLS) {
        var spd = src.s, ax = src.x >> 8, ay = src.y >> 8, aa = src.a;
        g.balls = [src, newBall(ax, ay, aa + 20, spd), newBall(ax, ay, aa - 20, spd)];
        for (var i = 1; i < 3; i++) { var b = g.balls[i]; if (b.vy >= 0) { b.a = (256 - b.a) & 255; setVel(b); } }
      }
    } else if (t === 'TIME') {
      g.speed = SPEED_MIN; g.hits = 0;
      for (var j = 0; j < g.balls.length; j++) { g.balls[j].s = SPEED_MIN; setVel(g.balls[j]); }
    } else if (t === 'LIFE') { g.lives = Math.min(9, g.lives + 1); sfx('brick_1up'); }
    else if (t === 'WALL') g.guard = true;
  }
  function roundClear() {
    g.mode = 'clear'; g.t = 0; g.cleared++;
    if (g.cleared >= GOAL_ROUNDS) g.goal = true;
    g.balls = []; g.beams = []; g.fire = []; g.cap.on = false; g.stuck = null;
    g.msg = 'SECTOR ' + num(g.round, 2) + '|BREACHED';
    K.Audio.stop(nes0); K.Audio.play(nes0, 'brick_clear');
  }
  function loseLife() {
    g.mode = 'dead'; g.t = 0; g.stat.lost++;
    g.balls = []; g.beams = []; g.fire = []; g.cap.on = false; g.stuck = null; g.power = ''; g.pw = 32;
    K.Audio.stop(nes0); sfx('brick_lose');
  }
  function saveBest() { if (g.score > g.best) { g.best = g.score; CT.save('brick', 'best', g.score); } }

  /* ============================== 球物理 ============================== */
  function solidAt(x, y) {
    // 回傳 0 = 空、1 = 磚（已處理傷害）、2 = 牆 / 魔王
    if (g.boss && !g.boss.dead && x >= 80 && x < 176 && y >= 48 && y < 112) return 3;
    if (x < GX || x >= GX + GW * CW || y < GY || y >= GY + GH * CH) return 0;
    var c = (x - GX) >> 4, r = (y - GY) >> 3;
    return g.grid[cellIdx(c, r)] ? 1 : 0;
  }
  function hitAt(x, y) {
    var s = solidAt(x, y);
    if (s === 1) { brickHit((x - GX) >> 4, (y - GY) >> 3); return true; }
    if (s === 3) { bossHit(1); return true; }
    return false;
  }
  function bossHit(dmg) {
    var b = g.boss;
    if (b.dieT) return;
    if (b.inv > 0) { sfx('brick_hard'); return; }
    b.hp -= dmg; b.inv = 24; b.hits++;
    addScore(100);
    sfx('brick_bosshit');
    g.flash = 6;
    if (b.hp <= 0) { b.hp = 0; b.dieT = 1; g.balls = []; g.fire = []; g.beams = []; g.stuck = null; addScore(10000); sfx('brick_bossdie'); K.Audio.stop(nes0); }
  }
  function speedUp() {
    g.hits++;
    if (g.hits % 6 === 0 && g.speed < SPEED_MAX) {
      g.speed = Math.min(SPEED_MAX, g.speed + 8);
      for (var i = 0; i < g.balls.length; i++) { g.balls[i].s = g.speed; setVel(g.balls[i]); }
    }
  }
  function moveBall(b) {
    var steps = 1 + (Math.max(Math.abs(b.vx), Math.abs(b.vy)) >> 9), i;
    for (i = 0; i < steps; i++) {
      var dx = ((b.vx * (i + 1) / steps) | 0) - ((b.vx * i / steps) | 0);
      var dy = ((b.vy * (i + 1) / steps) | 0) - ((b.vy * i / steps) | 0);
      // ---- x ----
      var nx = b.x + dx, px = nx >> 8, py = b.y >> 8;
      if (px < LEFT) { b.x = LEFT << 8; reflectX(b, 1); sfx('brick_wall'); }
      else if (px + 4 > RIGHT) { b.x = (RIGHT - 4) << 8; reflectX(b, -1); sfx('brick_wall'); }
      else {
        var ex = dx > 0 ? px + 3 : px;
        if (dx !== 0 && (hitAt(ex, py) || hitAt(ex, py + 3))) reflectX(b, dx > 0 ? -1 : 1);
        else b.x = nx;
      }
      if (g.mode !== 'play' || !g.balls.length || (g.boss && g.boss.dieT)) return;
      // ---- y ----
      var ny = b.y + dy;
      px = b.x >> 8; py = ny >> 8;
      if (py < TOP) { b.y = TOP << 8; reflectY(b, 1); sfx('brick_wall'); continue; }
      var ey = dy > 0 ? py + 3 : py;
      if (dy !== 0 && (hitAt(px, ey) || hitAt(px + 3, ey))) { reflectY(b, dy > 0 ? -1 : 1); }
      else {
        var oldBottom = (b.y >> 8) + 4;
        b.y = ny;
        if (dy > 0 && oldBottom <= PY && py + 4 > PY && px + 4 > g.px && px < g.px + g.pw) { paddleBounce(b); return; }
        if (dy > 0 && g.guard && oldBottom <= GUARD_Y && py + 4 > GUARD_Y) {
          b.y = (GUARD_Y - 4) << 8; reflectY(b, -1); g.guard = false; sfx('brick_hard');
        }
      }
      if (g.mode !== 'play') return;
    }
  }
  function reflectX(b, wantSign) {
    // wantSign：反射後 vx 的方向（+1 右 / -1 左）
    if ((wantSign > 0 && b.vx < 0) || (wantSign < 0 && b.vx > 0)) { b.a = (128 - b.a) & 255; setVel(b); }
  }
  function reflectY(b, wantSign) {
    if ((wantSign > 0 && b.vy < 0) || (wantSign < 0 && b.vy > 0)) { b.a = (256 - b.a) & 255; setVel(b); }
  }
  function paddleBounce(b) {
    var bx = (b.x >> 8) + 2;
    var zone = Math.max(0, Math.min(7, ((bx - g.px) * 8 / g.pw) | 0));
    b.y = (PY - 4) << 8;
    b.a = ZONES[zone]; setVel(b);
    speedUp();
    sfx('brick_hit');
    if (g.power === 'GRAB' && !g.stuck) { g.stuck = { ball: b, off: Math.max(0, Math.min(g.pw - 4, (b.x >> 8) - g.px)) }; g.catchT = 0; }
  }

  /* ============================== 更新 ============================== */
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }

  function movePaddle() {
    var v = held(BTN.B) ? PADDLE_SLOW : PADDLE_V;
    if (held(BTN.LEFT)) g.px -= v;
    if (held(BTN.RIGHT)) g.px += v;
    if (g.px < LEFT) g.px = LEFT;
    if (g.px + g.pw > RIGHT) g.px = RIGHT - g.pw;
    if (g.stuck) { var b = g.stuck.ball; b.x = (g.px + g.stuck.off) << 8; b.y = (PY - 4) << 8; }
  }
  function updatePlay() {
    var i;
    movePaddle();
    if (g.stuck) {
      if (pressed(BTN.A) || (g.mode === 'play' && ++g.catchT > CATCH_HOLD)) { release(); g.laserCool = LASER_COOL; }
    } else if (g.power === 'BEAM' && pressed(BTN.A) && g.laserCool <= 0 && g.beams.length <= MAX_BEAMS - 2) {
      g.beams.push({ x: g.px + 2, y: PY - 8 }, { x: g.px + g.pw - 10, y: PY - 8 });
      g.laserCool = LASER_COOL; sfx('brick_laser');
    }
    if (g.laserCool > 0) g.laserCool--;
    // 球
    for (i = 0; i < g.balls.length; i++) {
      var b = g.balls[i];
      if (g.stuck && g.stuck.ball === b) continue;
      moveBall(b);
      if (g.mode !== 'play') return;
    }
    for (i = g.balls.length - 1; i >= 0; i--) if ((g.balls[i].y >> 8) >= LOST_Y) g.balls.splice(i, 1);
    if (g.stat.maxBalls < g.balls.length) g.stat.maxBalls = g.balls.length;
    if (!g.balls.length && !(g.boss && g.boss.dieT)) { loseLife(); return; }
    // 雷射
    for (i = g.beams.length - 1; i >= 0; i--) {
      var bm = g.beams[i];
      bm.y -= 6;
      var hit = bm.y < TOP || hitAt(bm.x + 3, bm.y) || hitAt(bm.x + 4, bm.y);
      if (hit) g.beams.splice(i, 1);
      if (g.mode !== 'play') return;
    }
    if (g.stat.maxBeams < g.beams.length) g.stat.maxBeams = g.beams.length;
    // 膠囊
    if (g.cap.on) {
      g.cap.y += 1;
      if (g.cap.y + 6 >= PY && g.cap.y <= PY + 6 && g.cap.x + 8 > g.px && g.cap.x < g.px + g.pw) { g.cap.on = false; takeCap(g.cap.t); }
      else if (g.cap.y >= LOST_Y) g.cap.on = false;
    }
    // 魔王
    if (g.boss) updateBoss();
  }
  function updateBoss() {
    var b = g.boss, i;
    if (b.dieT) {
      b.dieT++;
      if (b.dieT === 60) b.dead = true;
      if (b.dieT >= 150) { g.mode = 'ending'; g.t = 0; g.cleared++; if (g.cleared >= GOAL_ROUNDS) g.goal = true; saveBest(); g.msg = 'ECLIPSE BROKEN|DAWN RETURNS'; K.Audio.play(nes0, 'brick_end'); }
      return;
    }
    if (b.inv > 0) b.inv--;
    var pc = g.px + (g.pw >> 1);
    b.eye = pc < 112 ? 'L' : (pc > 144 ? 'R' : 'C');
    if (b.mouth > 0) b.mouth--;
    if (--b.fireT <= 0) {
      var phase2 = b.hp <= BOSS_HP / 2;
      b.fireT = phase2 ? 80 : 110;
      var shots = phase2 ? 2 : 1;
      for (i = 0; i < shots && g.fire.length < MAX_FIRE; i++) {
        var v = SH.aim(124, 104, pc - 4 + (shots > 1 ? (i ? 24 : -24) : 0), PY, 0x170);
        g.fire.push({ x: 124 << 8, y: 104 << 8, vx: v.vx, vy: v.vy });
      }
      b.mouth = 20; sfx('brick_fire');
    }
    for (i = g.fire.length - 1; i >= 0; i--) {
      var f = g.fire[i];
      f.x += f.vx; f.y += f.vy;
      var fx = f.x >> 8, fy = f.y >> 8;
      if (fy + 6 >= PY && fy <= PY + 5 && fx + 6 > g.px && fx + 2 < g.px + g.pw) { loseLife(); return; }
      if (fy >= LOST_Y || fx < LEFT - 8 || fx > RIGHT) g.fire.splice(i, 1);
    }
  }

  function update() {
    var st = pressed(BTN.START) && !held(BTN.SELECT);
    if (g.mode === 'title') {
      if (pressed(BTN.LEFT)) { g.startRound = g.startRound > 1 ? g.startRound - 1 : g.maxRound; sfx('brick_wall'); }
      if (pressed(BTN.RIGHT)) { g.startRound = g.startRound < g.maxRound ? g.startRound + 1 : 1; sfx('brick_wall'); }
      if (st || pressed(BTN.A)) { sfx('brick_cap'); startGame(g.startRound); }
      return;
    }
    if (st && (g.mode === 'play' || g.mode === 'ready')) {
      g.paused = !g.paused;
      if (g.paused) K.Audio.pause(nes0); else if (!K.Audio.resume(nes0)) K.Audio.play(nes0, g.boss ? 'brick_boss' : 'brick_main');   // R6：同一 row 接續
      return;
    }
    if (g.paused) return;
    g.t++;
    if (g.flash > 0) g.flash--;
    if (g.mode === 'ready') {
      g.msg = 'SECTOR ' + num(g.round, 2) + '|' + (g.boss ? K.ROUNDS[g.round - 1].name : 'ENGAGE');
      movePaddle();
      if (g.t >= 60 && (pressed(BTN.A) || g.t >= READY_AUTO)) {
        g.mode = 'play'; g.msg = ''; release();
        K.Audio.play(nes0, g.boss ? 'brick_boss' : 'brick_main');
      }
      return;
    }
    if (g.mode === 'play') { updatePlay(); return; }
    if (g.mode === 'dead') {
      if (g.t >= 90) {
        g.lives--;
        if (g.lives <= 0) { g.mode = 'over'; g.t = 0; saveBest(); g.msg = 'GAME OVER|A RETRY  B END'; K.Audio.play(nes0, 'brick_over'); }
        else { resetServe(); g.mode = 'ready'; g.t = 30; }
      }
      return;
    }
    if (g.mode === 'clear') {
      if (g.t >= 150) {
        if (g.round < K.ROUNDS.length) loadRound(g.round + 1);
        else { g.mode = 'ending'; g.t = 0; }
      }
      return;
    }
    if (g.mode === 'over') {
      if (g.t > 60 && (pressed(BTN.A) || st)) {
        g.continues++; g.score = 0; g.lives = START_LIVES; g.extraIdx = 0; g.msg = '';
        loadRound(g.round);
      } else if (g.t > 60 && pressed(BTN.B)) toTitle();
      return;
    }
    if (g.mode === 'ending') {
      if (g.t > 120 && (st || pressed(BTN.A))) toTitle();
    }
  }

  /* ============================== 精靈 ============================== */
  var lineCnt = new Uint8Array(240);
  var oamN = 0;
  function spr(x, y, tile, pal) {
    // 逐線計數保險：這顆會讓任一掃描線超過 8 個就不畫（規則上不會發生；記在 stat.dropLine）
    var yy, y0 = Math.max(0, y), y1 = Math.min(239, y + 7);
    if (oamN >= 64 || y >= 240 || y < -8) return;
    for (yy = y0; yy <= y1; yy++) if (lineCnt[yy] >= 8) { g.stat.dropLine++; return; }
    for (yy = y0; yy <= y1; yy++) lineCnt[yy]++;
    ppu0.sprite(oamN++, { x: x, y: y, tile: tile, pal: pal });
  }
  function drawSprites() {
    lineCnt.fill(0); oamN = 0;
    var i;
    if (g.mode === 'title') {
      var caps = ['WING', 'TRIO', 'BEAM', 'TIME', 'GRAB', 'LIFE', 'WALL'];
      for (i = 0; i < caps.length; i++) {
        var col = i % 3, row = (i / 3) | 0;
        spr(44 + col * 64, (21 + row * 2) * 8, K.S('CAP_' + caps[i]), 2);
      }
    } else if (!g.paused) {
      var showPaddle = g.mode === 'play' || g.mode === 'ready' || g.mode === 'clear' || (g.mode === 'dead' && (g.t & 4) && g.t < 60);
      if (showPaddle) {
        var n = g.pw >> 3, laser = g.power === 'BEAM';
        for (i = 0; i < n; i++) {
          var nm = i === 0 ? (laser ? 'P_LG' : 'P_L') : (i === n - 1 ? (laser ? 'P_RG' : 'P_R') : ((i === (n >> 1) || i === (n >> 1) - 1) ? 'P_C' : 'P_M'));
          spr(g.px + i * 8, PY, K.S(nm), 0);
        }
      }
      for (i = 0; i < g.balls.length; i++) spr(g.balls[i].x >> 8, g.balls[i].y >> 8, K.S('BALL'), 1);
      if (g.cap.on) spr(g.cap.x, g.cap.y, K.S('CAP_' + g.cap.t), 2);
      for (i = 0; i < g.beams.length; i++) spr(g.beams[i].x, g.beams[i].y, K.S('BEAM'), 3);
      for (i = 0; i < g.fire.length; i++) spr(g.fire[i].x >> 8, g.fire[i].y >> 8, K.S('FIRE'), 3);
    }
    for (i = oamN; i < 20; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人 ============================== */
  var AIMS = [0, -6, 6, -11, 11, -3, 3, -14, 14];
  function predictX(b) {
    var x = (b.x >> 8), y = (b.y >> 8), vx = b.vx, vy = b.vy;
    if (vy <= 0) return x;
    var t = ((PY - 4 - y) << 8) / vy, lx = (x << 8) + vx * t, lo = LEFT << 8, hi = (RIGHT - 4) << 8, span = hi - lo;
    var u = (lx - lo) % (2 * span); if (u < 0) u += 2 * span;
    lx = u > span ? 2 * span - u : u;
    return (lx + lo) >> 8;
  }
  function fold(x) {
    var lo = LEFT, span = RIGHT - 4 - LEFT, u = (x - lo) % (2 * span);
    if (u < 0) u += 2 * span;
    return lo + (u > span ? 2 * span - u : u);
  }
  // 選一個目標磚（最低的一排，同排取離落點最近；久沒打到磚就輪流換目標），
  // 再從 8 區角度表挑「打過去最接近目標」的那一區 ⇒ 回傳拍子中心相對落點的偏移
  function aimFor(landX, stale) {
    var best = -1, bestKey = 1e9, i, n = 0, list = [];
    for (i = 0; i < GW * GH; i++) if (g.grid[i] && g.kind[i] !== 'X') list.push(i);
    if (g.boss && !g.boss.dead) list.push(-1);
    if (!list.length) return 0;
    if (stale) best = list[(g.bot.pick++) % list.length];
    else {
      for (i = 0; i < list.length; i++) {
        var id = list[i];
        if (id < 0) continue;
        var cx = GX + (id % GW) * CW + 8, row = (id / GW) | 0;
        var key = (GH - row) * 1000 + Math.abs(cx - landX);
        if (key < bestKey) { bestKey = key; best = id; }
        n++;
      }
      if (best < 0) best = -1;
    }
    var tx = best < 0 ? 128 : GX + (best % GW) * CW + 8, ty = best < 0 ? 112 : GY + ((best / GW) | 0) * CH + 4;
    var bz = 4, be = 1e9, z;
    for (z = 0; z < 8; z++) {
      var vx = SH.cos(ZONES[z]), vy = SH.sin(ZONES[z]);
      var t = (ty - (PY - 4)) / vy, x = fold(landX + vx * t);
      var e = Math.abs(x - tx);
      if (e < be) { be = e; bz = z; }
    }
    return Math.round((bz + 0.5) * g.pw / 8 - g.pw / 2);
  }
  function bot() {
    var bb = g.bot; bb.t++;
    if (g.mode === 'title') return (bb.t & 15) === 0 ? BTN.START : 0;
    if (g.mode === 'over') return (bb.t & 15) === 0 ? BTN.A : 0;
    if (g.mode === 'ending') return 0;
    if (g.paused) return (bb.t & 15) === 0 ? BTN.START : 0;
    if (g.mode !== 'play' && g.mode !== 'ready') return 0;
    // 每次拍到球換一個瞄準偏移，避免永遠同一條路線；太久沒打到磚就加大偏移
    var stale = g.frames - g.lastBrickT > 600;
    if (bb.hits !== g.hits) { bb.hits = g.hits; bb.aimIdx = (bb.aimIdx + 1) % AIMS.length; bb.aimSet = false; }
    var lim = (g.pw >> 1) - 3, aim = bb.aim;
    var target = -1, best = null, i;
    for (i = 0; i < g.balls.length; i++) {
      var b = g.balls[i];
      if (g.stuck && g.stuck.ball === b) continue;
      if (b.vy > 0 && (!best || b.y > best.y)) best = b;
    }
    if (best) {
      var tFrames = ((PY - 4 - (best.y >> 8)) << 8) / best.vy;
      var land = predictX(best) + 2;
      if (!bb.aimSet && tFrames < 40) {
        bb.aim = aimFor(land, stale);
        // 卡在固定軌道時（久沒打到磚）加一點亂數偏移，跳出週期路線
        if (stale) { bb.seed = (Math.imul(bb.seed || 7, 1103515245) + 12345) & 0x7FFFFFFF; bb.aim += ((bb.seed >> 16) % (2 * lim + 1)) - lim; }
        bb.aimSet = true;
      }
      aim = bb.aimSet ? bb.aim : 0;
      if (aim > lim) aim = lim; else if (aim < -lim) aim = -lim;
      target = land - aim;
      if (g.cap.on && g.cap.y > 140 && tFrames > 60) target = g.cap.x + 4;
    } else if (g.cap.on && g.cap.y > 100) target = g.cap.x + 4;
    else if (g.balls.length) target = (g.balls[0].x >> 8) + 2 - aim;
    var mask = 0, center = g.px + (g.pw >> 1);
    // 魔王火球：預測落點壓到拍子、而且比球先到 ⇒ 先閃
    var ballT = best ? ((PY - 4 - (best.y >> 8)) << 8) / best.vy : 1e9;
    for (i = 0; i < g.fire.length; i++) {
      var f = g.fire[i];
      if (f.vy <= 0) continue;
      var ft = ((PY - (f.y >> 8)) << 8) / f.vy, fx = ((f.x + f.vx * ft) >> 8) + 4;
      if (ft < 70 && ft + 12 < ballT && Math.abs(fx - center) < (g.pw >> 1) + 10) {
        target = fx < 128 ? fx + (g.pw >> 1) + 16 : fx - (g.pw >> 1) - 16;
      }
    }
    if (target >= 0) {
      var d = target - center;
      if (d > 2) mask |= BTN.RIGHT; else if (d < -2) mask |= BTN.LEFT;
    }
    if ((g.stuck || g.power === 'BEAM') && (bb.t & 1) === 0) {
      if (!g.stuck || g.mode === 'ready' || Math.abs(target - center) <= 2 || bb.t % 40 === 0) mask |= BTN.A;
    }
    return mask;
  }

  /* ============================== 密技 ============================== */
  // 「補給艦」：命 +1（上限 9）+ 底部防護欄；挑魔王時順便讓魔王 3 秒不開火。不限次數。
  // GAME OVER 時按密技 = **原地續關**（fix-r5 §6-1）：同一回合、磚陣 / 魔王血量 / 分數全保留，
  // 命數補回開局值 + 防護欄，直接回到 READY（不算 continues、不扣分）。標題 / 結尾無效。
  function cheat() {
    if (!g || g.mode === 'title' || g.mode === 'ending') return false;
    if (g.mode === 'over') {
      g.lives = START_LIVES; g.guard = true; g.cheats++; g.msg = ''; g.paused = false;
      if (g.boss) g.boss.fireT = Math.max(g.boss.fireT, 180);
      resetServe(); g.mode = 'ready'; g.t = 30;
      K.Audio.stop(nes0); K.Audio.play(nes0, 'brick_start');
      sfx('brick_1up');
      return true;
    }
    g.lives = Math.min(9, g.lives + 1); g.guard = true; g.cheats++;
    if (g.boss) g.boss.fireT = Math.max(g.boss.fireT, 180);
    sfx('brick_1up');
    return true;
  }

  var GAME = {
    id: 'brick', order: 3, title: '星塵打磚塊', legacy: ['breakout.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu;
      K.buildChr();
      NES.CHR.setPattern(0, K.bgBank);
      NES.CHR.setPattern(1, K.sprBank);
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState();
      K.Audio.init(nes);
      var rq = parseInt((CT.query && CT.query('round')) || '', 10);
      drawTitleScreen();
      K.Audio.play(nes, 'brick_end');
      if (rq >= 1 && rq <= K.ROUNDS.length) { g.startRound = rq; startGame(rq); }
    },
    update: function (nes) {
      g.frames++;
      update();
      K.Audio.tick(nes);
    },
    draw: function () {
      if (g.mode === 'title') titleValues();
      else {
        hud();
        if (g.boss) {
          bossTiles();
          var fl = g.flash > 0 && (g.flash & 2);
          if (fl !== g.flashOn) { ppu0.setBgPalette(3, fl ? [0x30, 0x30, 0x30] : g.rd.pal[2]); g.flashOn = fl; }
        }
      }
      flush(false);
      drawSprites();
    },
    exit: function (nes) { if (g && g.mode !== 'title') saveBest(); K.Audio.stop(nes); },   // 中途回選單也存最高分（fix-r5 P3-2）
    // 回選單收攏提示用的精靈（fix-r5 §6-4）：精靈表裡的小星、第 1 組（白）調色盤
    get backTile() { K.buildChr(); return { tile: K.S('BACK'), pal: 1 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, round: g.round, score: g.score, lives: g.lives, left: g.left, power: g.power, pw: g.pw, px: g.px,
        balls: g.balls.map(function (b) { return { x: b.x >> 8, y: b.y >> 8, a: b.a, s: b.s, vx: b.vx, vy: b.vy }; }),
        stuck: !!g.stuck, beams: g.beams.length, fire: g.fire.length, cap: g.cap.on ? { t: g.cap.t, x: g.cap.x, y: g.cap.y } : null,
        guard: g.guard, speed: g.speed, hits: g.hits, cleared: g.cleared, continues: g.continues, goal: g.goal,
        boss: g.boss ? { hp: g.boss.hp, dead: !!g.boss.dead, inv: g.boss.inv } : null, paused: g.paused, msg: g.msg,
        cheats: g.cheats, stat: g.stat, music: K.Audio.current, lastSfx: K.Audio.lastSfx, queue: queue.length - qi,
        ntWrites: ntWrites, frames: g.frames, startRound: g.startRound, maxRound: g.maxRound
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    bestText: function () { return num(Math.min(999999, CT.load('brick', 'best', 0)), 6); }   // R6 §1-6：右對齊 6 字元（超過封頂）
  };

  K.dev = {
    takeCap: function (t) { takeCap(t); },
    clearAll: function () { for (var i = 0; i < GW * GH; i++) if (g.grid[i] && g.kind[i] !== 'X') { g.grid[i] = 1; brickHit(i % GW, (i / GW) | 0); } },
    leaveOne: function () {
      var keep = -1, i;
      for (i = GW * GH - 1; i >= 0; i--) if (g.grid[i] && g.kind[i] !== 'X') { if (keep < 0) { keep = i; continue; } g.grid[i] = 0; g.left--; putBrick(i % GW, (i / GW) | 0); }
      return keep;
    },
    hitBrick: function (c, r) { return brickHit(c, r); },
    setBall: function (x, y, a, s) { g.stuck = null; g.balls = [newBall(x, y, a, s || g.speed)]; },
    setPaddle: function (x) { g.px = x; },
    launch: function () { if (g.mode === 'ready') { g.mode = 'play'; g.msg = ''; } release(); },
    bossHit: function (n) { for (var i = 0; i < n; i++) { if (g.boss) { g.boss.inv = 0; bossHit(1); } } },
    grid: function () { var out = [], r, c; for (r = 0; r < GH; r++) { var s = ''; for (c = 0; c < GW; c++) s += g.grid[cellIdx(c, r)] ? g.kind[cellIdx(c, r)] : '.'; out.push(s); } return out; },
    palOf: function (c, r) { return g.pal[cellIdx(c, r)]; },
    consts: { GW: GW, GH: GH, GX: GX, GY: GY, PY: PY, LEFT: LEFT, RIGHT: RIGHT, TOP: TOP, ZONES: ZONES, SPEED_MIN: SPEED_MIN, SPEED_MAX: SPEED_MAX, BOSS_HP: BOSS_HP, NT_LIMIT: NT_LIMIT },
    lose: function () { g.balls = []; },
    spawnCap: function (t, x, y) { g.cap.on = true; g.cap.t = t; g.cap.x = x; g.cap.y = y; },
    fireNow: function () { if (g.boss) g.boss.fireT = 1; }
  };

  if (CT.register) CT.register(GAME);
  K.GAME = GAME;
})();
