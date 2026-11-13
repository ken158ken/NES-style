/*
 * games/cart4/brain/tilt.js — 模式 4 TILT 重力感應（十字鍵傾斜星盤，星珠以定點數物理滾到星門）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/core.js、brain/main.js
 *
 * 畫面：HUD 第 1~3 列固定；split(32) 以下 = 星盤 16×12 個 16×16 金屬塊（名稱表列 4..27；**每塊 = 一個屬性區塊**：
 *   地板 / 洞 / 起點 / 星屑 = 組 1、牆 = 組 2、星門 / 冰 / 輸送帶 = 組 3）。傾斜時星盤用 split 的捲動值往傾斜方向位移
 *   ±2 px（假透視；名稱表 1 與第 28~29 列鋪牆磚，位移露出的邊也是牆）。HUD 右邊的水平儀氣泡 = 目前傾斜量。
 * 物理（全部整數，位置 / 速度單位 1/256 px，NES.FX 8.8 慣例）：
 *   傾斜 tx, ty ∈ [−12, 12]：按住方向每幀往 ±12 走 1、放開每幀回 0 走 1（盤子有慣性，不是瞬間）
 *   加速度 a = tilt × 3（滿傾斜 36/256 px/幀²）；摩擦 v −= v × F / 256（地板 F = 14、冰 F = 2）；|v| ≤ 900
 *   輸送帶：每幀 +20 往箭頭方向；撞牆：該軸速度 × −110/256（反彈 0.43）；
 *   每幀拆成 ≤ 2 px 的子步，逐軸檢查 6×6 碰撞盒四角（不會穿牆）
 *   洞 / 星門：球心進入該塊半徑 9 px 內被吸向中心（16/256），≤ 5 px 落入（洞 = −1 心、回起點；星門 = 過關）
 * 8 張原創星盤（FIRST ROLL / TWO WELLS / ZIGZAG / ICE LAKE / CONVEYOR / BRIDGE / SPIRAL / GAUNTLET），每張限時；
 *   時間到 = −1 心並回起點重新計時（友善版：不直接結束）；5 心，每過一張回 1 心。
 * 每線精靈：星珠 1 + 水平儀氣泡 1（HUD 列）⇒ ≤ 2。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};
  var C = BR.C, AU = BR.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var W = 16, H = 12, ROW0 = 4, TOP = 32;
  var TMAX = 12, GRAV = 3, F_FLOOR = 14, F_ICE = 2, VMAX = 900, BOUNCE = 110, CONV = 20, PULL = 16, R = 3;
  var BOARDS = [
    { name: 'FIRST ROLL', time: 60, rows: [
      '################',
      '#S.............#',
      '#..............#',
      '#..*...####....#',
      '#......#.......#',
      '#......#...*...#',
      '#####..#.......#',
      '#......#..######',
      '#...*..#.......#',
      '#......#......G#',
      '#..............#',
      '################'] },
    { name: 'TWO WELLS', time: 60, rows: [
      '################',
      '#S......o......#',
      '#..............#',
      '#..........o...#',
      '#...####.......#',
      '#......#...*...#',
      '#..o...#.......#',
      '#......#####...#',
      '#.*........#...#',
      '#..........#.o.#',
      '#.....o....#..G#',
      '################'] },
    { name: 'ZIGZAG', time: 70, rows: [
      '################',
      '#S...#.........#',
      '#....#....o....#',
      '#....#.........#',
      '#....#..####...#',
      '#.*..#..#..*...#',
      '#....#..#......#',
      '#.......#..#####',
      '#..o....#......#',
      '#####...#..o...#',
      '#*......#.....G#',
      '################'] },
    { name: 'ICE LAKE', time: 70, rows: [
      '################',
      '#S.....~~~~....#',
      '#....~~~~~~~...#',
      '#...~~~~*~~~~..#',
      '#o..~~~~~~~~..o#',
      '#...~~~~~~~~...#',
      '#....~~~~~~....#',
      '####..~~~~..####',
      '#*............*#',
      '#..o........o..#',
      '#......GG......#',
      '################'] },
    { name: 'CONVEYOR', time: 80, rows: [
      '################',
      '#S...>>>>>>>...#',
      '#..........v...#',
      '#..o.......v.*.#',
      '#..........v...#',
      '#..<<<<<<<<<...#',
      '#..^...........#',
      '#..^...####....#',
      '#..^..o#..#..o.#',
      '#.*^...#G.#....#',
      '#......#..<<<..#',
      '################'] },
    { name: 'BRIDGE', time: 80, rows: [
      '################',
      '#S.....o.......#',
      '#..............#',
      '#oooo......oooo#',
      '#*...........*.#',
      '#..oooo..oooo..#',
      '#..............#',
      '#oo..........oo#',
      '#...oo....oo...#',
      '#..............#',
      '#o.....GG.....o#',
      '################'] },
    { name: 'SPIRAL', time: 90, rows: [
      '################',
      '#S.............#',
      '#.............*#',
      '#..#########...#',
      '#..#.......#...#',
      '#..#.o...o.#...#',
      '#..#...GG..#...#',
      '#..#.......#...#',
      '#..####..###.o.#',
      '#*.............#',
      '#....o.........#',
      '################'] },
    { name: 'GAUNTLET', time: 90, rows: [
      '################',
      '#S..o....o.....#',
      '#..............#',
      '#..~~~~..>>>...#',
      '#o.~~*~.....o..#',
      '#..~~~~........#',
      '#......####..o.#',
      '#..o..........*#',
      '#.......^^.....#',
      '#.o..o..^^..o..#',
      '#*......^^...G.#',
      '################'] }
  ];
  var MT = { '#': 'WALL', '.': 'FLOOR', 'o': 'HOLE', 'G': 'GOAL', 'S': 'START', '*': 'STAR', '~': 'ICE', '^': 'AU', 'v': 'AD', '<': 'AL', '>': 'AR' };
  var MT_PAL = { WALL: 2, FLOOR: 1, HOLE: 1, START: 1, STAR: 1, GOAL: 3, ICE: 3, AU: 3, AD: 3, AL: 3, AR: 3 };
  var CONV_DIR = { '^': [0, -1], 'v': [0, 1], '<': [-1, 0], '>': [1, 0] };
  var PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x10, 0x30], [0x1B, 0x0B, 0x3B], [0x08, 0x18, 0x28], [0x11, 0x21, 0x31]],
    spr: [[0x06, 0x16, 0x36], [0x0A, 0x2A, 0x3A], [0x00, 0x10, 0x30], [0x00, 0x10, 0x30]]
  };

  var M = {
    hudShift: true, ways: 8,
    key: 'TILT', name: 'TILT ROLL', short: 'TILT', sub: 'GRAVITY SENSE', song: 'brain_tilt',
    levels: 8, hearts: 5, levelSelect: true, pal: PAL, heartPerLevel: 1,
    finalMsg: 'BOARD 8 CLEAR! GRAVITY MASTER',
    rules: [
      'DPAD TILTS THE STAR BOARD.',
      'THE BALL ROLLS AND KEEPS',
      'ITS SPEED: TILT BACK TO',
      'BRAKE. ROLL INTO THE GATE.',
      'BLACK HOLES EAT THE BALL.',
      'ICE SLIPS, ARROWS PUSH.'
    ],
    pad: { d: ['TILT', 'DIAG OK'], b: '-', a: '-' }, goalLine: 'DUST +100  FAST = BONUS',
    overWhy: 'OUT OF HEARTS'
  };
  function sub() { return C.g.sub; }
  function board() { return BOARDS[C.clamp(sub().lv, 0, 7)]; }
  function cellAt(s, mx, my) { if (mx < 0 || my < 0 || mx >= W || my >= H) return '#'; return s.grid[my][mx]; }
  function solidPx(s, x, y) { return cellAt(s, x >> 4, y >> 4) === '#'; }

  function drawCell(s, mx, my) {
    var ch = s.grid[my][mx], nm = MT[ch] || 'FLOOR';
    C.put4(mx * 2, ROW0 + my * 2, 'MT_' + nm + '_');
    C.putA(mx, (ROW0 >> 1) + my, MT_PAL[nm]);
  }
  M.enter = function (lv) {
    var b = BOARDS[C.clamp(lv, 0, 7)];
    var s = C.g.sub = { lv: lv, t: 0, grid: b.rows.map(function (r) { return r.split(''); }), tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0,
      sx: 1, sy: 1, fall: 0, sink: 0, stars: 0, falls: 0, timeouts: 0, bumps: 0, timeLeft: C.sec(b.time), done: false, peakV: 0 };
    for (var my = 0; my < H; my++) for (var mx = 0; mx < W; mx++) if (s.grid[my][mx] === 'S') { s.sx = mx; s.sy = my; }
    respawn(s);
    C.redraw(function () {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) drawCell(s, x, y);
      C.fill(0, 28, 32, 2, C.t('MT_WALL_0'));
      C.fillA(0, 14, 16, 1, 2);
      C.text(23, 2, 'TILT');
    }, PAL, C.t('MT_WALL_0'));
    C.say('BOARD ' + (lv + 1) + ': ' + b.name, 120);
  };
  M.begin = function () { };
  function respawn(s) {
    s.x = (s.sx * 16 + 8) * 256; s.y = (s.sy * 16 + 8) * 256; s.vx = 0; s.vy = 0; s.tx = 0; s.ty = 0; s.fall = 0; s.sink = 0;
  }

  /* ---------------- 物理 ---------------- */
  function approach(v, to) { return v < to ? v + 1 : (v > to ? v - 1 : v); }
  function fric(v, f) { var d = (v * f) >> 8; if (d === 0 && v !== 0) d = v > 0 ? 1 : -1; return v - d; }
  function moveAxis(s, axis, dv, bumpFn) {
    // dv：本子步位移（1/256 px）；碰到牆 ⇒ 停在原地、該軸反彈
    var nx = axis === 0 ? s.x + dv : s.x, ny = axis === 1 ? s.y + dv : s.y;
    var px = nx >> 8, py = ny >> 8;
    if (solidPx(s, px - R, py - R) || solidPx(s, px + R, py - R) || solidPx(s, px - R, py + R) || solidPx(s, px + R, py + R)) {
      if (axis === 0) { if (bumpFn) bumpFn(s, s.vx); s.vx = -((s.vx * BOUNCE) >> 8); }
      else { if (bumpFn) bumpFn(s, s.vy); s.vy = -((s.vy * BOUNCE) >> 8); }
      return false;
    }
    s.x = nx; s.y = ny;
    return true;
  }
  function bump(s) { s.bumps++; AU.sfx('brain_bump'); }
  // 一幀物理（tick 與機器人的內部模型共用）：st = {x, y, vx, vy, tx, ty, grid}；wx / wy = 想要的傾斜（−12 / 0 / 12）
  // 回傳 null / 'star' / 'hole' / 'goal'（並把 st.ev = {mx, my}）；bumpFn 撞牆時呼叫（可省略）
  function phys(st, wx, wy, bumpFn) {
    var i;
    st.tx = approach(st.tx, wx); st.ty = approach(st.ty, wy);
    var cx = st.x >> 8, cy = st.y >> 8, mx = cx >> 4, my = cy >> 4, ch = cellAt(st, mx, my);
    st.vx += st.tx * GRAV; st.vy += st.ty * GRAV;
    if (CONV_DIR[ch]) { st.vx += CONV_DIR[ch][0] * CONV; st.vy += CONV_DIR[ch][1] * CONV; }
    // 洞 / 星門的吸力
    var dx = mx * 16 + 8 - cx, dy = my * 16 + 8 - cy, d2 = dx * dx + dy * dy;
    if ((ch === 'o' || ch === 'G') && d2 <= 81) {
      st.vx += dx > 0 ? PULL : (dx < 0 ? -PULL : 0);
      st.vy += dy > 0 ? PULL : (dy < 0 ? -PULL : 0);
    }
    var f = ch === '~' ? F_ICE : F_FLOOR;
    st.vx = C.clamp(fric(st.vx, f), -VMAX, VMAX); st.vy = C.clamp(fric(st.vy, f), -VMAX, VMAX);
    var sp = Math.max(Math.abs(st.vx), Math.abs(st.vy));
    var n = Math.max(1, Math.ceil(sp / 512));
    var vx0 = st.vx, vy0 = st.vy;
    for (i = 0; i < n; i++) {
      moveAxis(st, 0, ((vx0 * (i + 1)) / n | 0) - ((vx0 * i) / n | 0), bumpFn);
      moveAxis(st, 1, ((vy0 * (i + 1)) / n | 0) - ((vy0 * i) / n | 0), bumpFn);
    }
    cx = st.x >> 8; cy = st.y >> 8; mx = cx >> 4; my = cy >> 4; ch = cellAt(st, mx, my);
    dx = mx * 16 + 8 - cx; dy = my * 16 + 8 - cy; d2 = dx * dx + dy * dy;
    st.ev = { mx: mx, my: my };
    if (ch === '*' && d2 <= 49) return 'star';
    if (ch === 'o' && d2 <= 25) return 'hole';
    if (ch === 'G' && d2 <= 25) return 'goal';
    return null;
  }
  M.tick = function (I) {
    var s = sub(), b = board();
    s.t++;
    if (s.sink > 0) { if (++s.sink > 30) return 1; return 0; }
    if (s.fall > 0) {
      if (++s.fall > 30) { respawn(s); C.say('BACK TO START', 60); }
      return 0;
    }
    if (--s.timeLeft <= 0) {
      s.timeouts++; C.hurt('TIME UP! BACK TO START');
      s.timeLeft = C.sec(b.time); respawn(s);
      return 0;
    }
    // 傾斜（盤子慣性）
    var wx = I.held(BTN.LEFT) ? -TMAX : (I.held(BTN.RIGHT) ? TMAX : 0);
    var wy = I.held(BTN.UP) ? -TMAX : (I.held(BTN.DOWN) ? TMAX : 0);
    var ev = phys(s, wx, wy, function (st, v) { if (Math.abs(v) > 200) bump(s); });
    var sp = Math.max(Math.abs(s.vx), Math.abs(s.vy));
    if (sp > s.peakV) s.peakV = sp;
    var mx = s.ev.mx, my = s.ev.my;
    if (ev === 'star') {
      s.grid[my][mx] = '.'; drawCell(s, mx, my); s.stars++; C.addScore(100); AU.sfx('brain_pick');
    } else if (ev === 'hole') {
      s.fall = 1; s.falls++; s.x = (mx * 16 + 8) * 256; s.y = (my * 16 + 8) * 256; s.vx = 0; s.vy = 0;
      AU.sfx('brain_fall'); C.hurt('FELL INTO A BLACK HOLE!');
    } else if (ev === 'goal') {
      s.sink = 1; s.x = (mx * 16 + 8) * 256; s.y = (my * 16 + 8) * 256; s.vx = 0; s.vy = 0;
      var secs = Math.floor(s.timeLeft / 60);
      C.addScore(200 + secs * 5 + (s.lv + 1) * 20);
      AU.sfx('brain_goal');
      C.say('STAR GATE! TIME BONUS ' + (secs * 5), 100);
    }
    return 0;
  };

  /* ---------------- 繪製 ---------------- */
  function offs(s) { return { x: -((s.tx / 6) | 0), y: -((s.ty / 6) | 0) }; }
  M.draw = function () {
    var s = sub(), ppu = C.nes.ppu, o = offs(s);
    ppu.scroll(0, -C.SHIFT);                       // HUD 名稱表列 1~3 顯示在畫面列 2~4
    ppu.split(TOP + C.SHIFT, { x: (o.x + 512) & 511, y: TOP + o.y, nt: 0 });
    var bx = (s.x >> 8) - 4 - o.x, by = (s.y >> 8) - 4 + TOP - o.y;
    var tile = 'BALL';
    if (s.fall > 0) tile = s.fall < 10 ? 'BALL1' : (s.fall < 20 ? 'BALL2' : null);
    if (s.sink > 0) tile = s.sink < 10 ? 'BALL1' : (s.sink < 20 ? 'BALL2' : null);
    if (tile) C.spr(bx, by, C.s(tile), 0);
    // 水平儀：HUD 第 2 列 27~30 欄的框內，氣泡隨傾斜位移（x ±12 → ±6 px，y ±12 → ±3 px）
    C.spr(28 * 8 + ((s.tx / 2) | 0), 2 * 8 + ((s.ty / 4) | 0), C.s('BUB'), 1);
  };
  M.hud2 = function () {
    var s = sub();
    C.text(1, 2, 'TIME ' + C.pad(Math.ceil(s.timeLeft / C.HZ), 2) + ' DUST ' + s.stars + '/' + starsTotal(s) + '  ');
    C.text(23, 2, 'TILT');
    C.put(27, 2, C.t('FR_L')); C.put(30, 2, C.t('FR_R')); C.put(28, 2, 0); C.put(29, 2, 0);
    return null;
  };
  function starsTotal(s) { var b = BOARDS[s.lv], n = 0; b.rows.forEach(function (r) { for (var i = 0; i < r.length; i++) if (r.charAt(i) === '*') n++; }); return n; }
  M.hint = function () { return 'BOARD ' + (sub().lv + 1) + ' ' + board().name; };
  M.levelTip = function (lv) {
    return ['NO HOLES: LEARN THE ROLL', 'A FEW BLACK HOLES', 'TIGHT TURNS', 'SLIPPY ICE', 'ARROW BELTS PUSH', 'HOLE BRIDGE', 'SPIRAL INTO THE GATE', 'EVERYTHING AT ONCE'][lv] || '';
  };
  M.idle = function () { };
  M.cheat = function () { var s = sub(); s.timeLeft = C.sec(board().time); s.vx = 0; s.vy = 0; };
  M.grade = function (R) { var h = R.hurts; return h === 0 ? 0 : h <= 2 ? 1 : h <= 5 ? 2 : h <= 8 ? 3 : 4; };
  M.titleOf = function (gi) { return ['GRAVITY MASTER', 'SMOOTH ROLLER', 'STEADY HANDS', 'WOBBLY', 'BUTTERFINGERS'][gi]; };
  M.resultLines = function (R) { return ['BALLS LOST ' + R.hurts, 'BOARDS 8 OF 8']; };
  M.overLine = function () { var s = sub(); return 'BOARD  ' + board().name; void s; };
  M.stateOf = function () {
    var s = sub();
    if (!s) return null;
    return { lv: s.lv, t: s.t, x: s.x, y: s.y, vx: s.vx, vy: s.vy, tx: s.tx, ty: s.ty, fall: s.fall, sink: s.sink, stars: s.stars, falls: s.falls,
      timeouts: s.timeouts, bumps: s.bumps, timeLeft: s.timeLeft, peakV: s.peakV, cell: [(s.x >> 12), (s.y >> 12)] };
  };

  /* ---------------- 機器人：看 L 幀前的球（位置 + 速度），自己預測、Dijkstra 找路、比例控制傾斜 ---------------- */
  M.observe = function () { var s = sub(); return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, tx: s.tx, ty: s.ty, fall: s.fall, sink: s.sink, lv: s.lv }; };
  function plan(s, fx, fy) {
    var INF = 1e9, dist = [], prev = [], i, x, y;
    for (i = 0; i < W * H; i++) { dist.push(INF); prev.push(-1); }
    function danger(mx, my) {
      var c = 0;
      for (var yy = -1; yy <= 1; yy++) for (var xx = -1; xx <= 1; xx++) if (cellAt(s, mx + xx, my + yy) === 'o') c += (xx && yy) ? 3 : 6;
      if (cellAt(s, mx, my) === '~') c += 2;
      if (CONV_DIR[cellAt(s, mx, my)]) c += 3;
      return c;
    }
    var start = fy * W + fx, open = [start];
    dist[start] = 0;
    while (open.length) {
      var bi = 0;
      for (i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      var cur = open.splice(bi, 1)[0];
      x = cur % W; y = (cur / W) | 0;
      if (cellAt(s, x, y) === 'G') {
        var path = [];
        while (cur >= 0) { path.unshift(cur); cur = prev[cur]; }
        return path.map(function (k) { return { x: k % W, y: (k / W) | 0 }; });
      }
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = x + nb[k][0], ny = y + nb[k][1], ch = cellAt(s, nx, ny);
        if (ch === '#' || ch === 'o') continue;
        var nd = dist[cur] + 4 + danger(nx, ny);
        var ni = ny * W + nx;
        if (nd < dist[ni]) { if (dist[ni] === INF) open.push(ni); dist[ni] = nd; prev[ni] = cur; }
      }
    }
    return null;
  }
  function segSafe(s, x0, y0, x1, y1) {
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 3));
    for (var i = 0; i <= steps; i++) {
      var x = x0 + ((x1 - x0) * i / steps), y = y0 + ((y1 - y0) * i / steps);
      for (var oy = -5; oy <= 5; oy += 5) for (var ox = -5; ox <= 5; ox += 5) {
        var ch = cellAt(s, (x + ox) >> 4, (y + oy) >> 4);
        if (ch === '#' || ch === 'o') return false;
      }
    }
    return true;
  }
  function holeNear(s, x, y) {   // 與最近洞中心的距離²（px）
    var mx = x >> 4, my = y >> 4, best = 1e9;
    for (var yy = -1; yy <= 1; yy++) for (var xx = -1; xx <= 1; xx++) {
      if (cellAt(s, mx + xx, my + yy) !== 'o') continue;
      var dx = (mx + xx) * 16 + 8 - x, dy = (my + yy) * 16 + 8 - y, d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best;
  }
  var DIR9 = [];
  [-TMAX, 0, TMAX].forEach(function (a) { [-TMAX, 0, TMAX].forEach(function (b) { DIR9.push([a, b]); }); });
  // 機器人＝「人類的內部模型」：L 幀前看到的球 + 自己這 L 幀按過的鍵 ⇒ 推算現在；
  //   再對 9 個傾斜方向 × 兩種按法（按 8 幀放開 / 一直按）各模擬 28 幀，挑離路徑目標最近、又不靠近洞的那個。
  M.bot = function (o, mem) {
    var s = sub(), lag = C.g.bot.lag, i;
    mem.outs = mem.outs || [];
    if (o.fall || o.sink) { mem.path = null; mem.outs = []; return 0; }
    var est = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, tx: o.tx, ty: o.ty, grid: s.grid };
    var outs = lag > 0 ? mem.outs.slice(-lag) : [];
    for (i = 0; i < outs.length; i++) { if (phys(est, outs[i][0], outs[i][1]) === 'hole') break; }
    var px = est.x >> 8, py = est.y >> 8;
    var mx = C.clamp(px >> 4, 0, W - 1), my = C.clamp(py >> 4, 0, H - 1);
    if (cellAt(s, mx, my) === '#' || cellAt(s, mx, my) === 'o') { mx = o.x >> 12; my = o.y >> 12; }
    if (!mem.path || mem.lv !== o.lv || mem.at !== mx + ',' + my) { mem.path = plan(s, mx, my); mem.lv = o.lv; mem.at = mx + ',' + my; }
    var path = mem.path, choice = [0, 0];
    if (path && path.length) {
      var tgt = path[Math.min(1, path.length - 1)];
      for (var k = Math.min(4, path.length - 1); k >= 1; k--) {
        var c = path[k];
        if (segSafe(s, px, py, c.x * 16 + 8, c.y * 16 + 8)) { tgt = c; break; }
      }
      var tx = tgt.x * 16 + 8, ty = tgt.y * 16 + 8, best = 1e18;
      for (var d = 0; d < DIR9.length; d++) for (var hold = 0; hold < 2; hold++) {
        var sim = { x: est.x, y: est.y, vx: est.vx, vy: est.vy, tx: est.tx, ty: est.ty, grid: s.grid }, cost = 0, minH = 1e9;
        for (var f = 0; f < 28; f++) {
          var on = hold === 1 || f < 8;
          var ev = phys(sim, on ? DIR9[d][0] : 0, on ? DIR9[d][1] : 0);
          if (ev === 'hole') { cost += 1e9 - f * 1e6; break; }
          if (ev === 'goal') { cost -= 1e6; break; }
          var hn = holeNear(s, sim.x >> 8, sim.y >> 8);
          if (hn < minH) minH = hn;
        }
        var ex = (sim.x >> 8) - tx, ey = (sim.y >> 8) - ty;
        cost += Math.sqrt(ex * ex + ey * ey) * 4 + Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy) / 40;
        if (minH < 144) cost += (144 - minH) * 3;
        if (cost < best) { best = cost; choice = DIR9[d]; }
      }
    }
    mem.outs.push([choice[0], choice[1]]);
    if (mem.outs.length > 64) mem.outs.shift();
    var m = 0;
    if (choice[0] < 0) m |= BTN.LEFT; else if (choice[0] > 0) m |= BTN.RIGHT;
    if (choice[1] < 0) m |= BTN.UP; else if (choice[1] > 0) m |= BTN.DOWN;
    return m;
  };

  BR.Modes = BR.Modes || [];
  BR.Modes[3] = M;
  BR.Tilt = { M: M, BOARDS: BOARDS, phys: phys, K: { TMAX: TMAX, GRAV: GRAV, F_FLOOR: F_FLOOR, F_ICE: F_ICE, VMAX: VMAX, BOUNCE: BOUNCE, CONV: CONV, PULL: PULL, R: R } };
})();
