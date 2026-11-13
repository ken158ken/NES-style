/*
 * games/cart1/snake/main.js — 《星塵貪食蟲》（合輯槽 5，id = snake；舊作 snake.html / snake-game.html 只取「格子移動 + 長度成長」概念）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-1 cart1-grid（R5）。依賴 engine/*、games/cart1/registry.js、snake/{chr,stages,song}.js。
 *
 * 三模式
 *   ENDLESS 經典無盡：空場地，每吃 5 顆加速一級（8 → 3 幀 / 格），撞到就結束，比最高分
 *   STAGES  關卡制：8 關（障礙 / 傳送門 / 每關換底色），吃滿目標數過關，3 條命
 *   VS CPU  對戰電腦蟲：競技場搶星，先吃滿 10 顆或對手撞毀者贏一局，三戰兩勝；電腦蟲逐局變聰明
 * 共通：星屑 +1 節、每 5 顆冒出限時星鑽（+3 節、+50 分）、傳送門（頭走進 A 從 A' 同方向出來，出口被擋就自動轉彎）、
 *   START 暫停、十字鍵 / 觸控搖桿轉向（可預先排 2 個轉向）、一鍵密技 = +1 命 + 慢動作 10 秒。
 *
 * 硬限制：蟲 / 星 / 牆全是背景磚（影子名稱表比對才寫），每步 ≤ 8 byte；精靈只有選單游標 1 顆。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT;
  if (!CT || !CT.register) throw new Error('snake/main.js 需要 games/cart1/registry.js');
  var S = CT.Snake = CT.Snake || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var FW = S.FW, FH = S.FH, FX0 = 1, FY0 = 5;      // 內格 (0,0) 在名稱表 (1,5)
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var DIRBTN = [BTN.UP, BTN.RIGHT, BTN.DOWN, BTN.LEFT];
  var EMPTY = 0, WALL = 1, PORTAL = 2, FOOD = 3, GEM = 4, PL = 5, CPU = 6;
  var MODES = ['ENDLESS', 'STAGES', 'VS CPU'];
  var START_LIVES = 3;
  var READY_F = 70, CRASH_F = 80, CLEAR_F = 130, OVER_F = 200, ROUND_F = 140;
  var GEM_EVERY = 5, GEM_F = 420, SLOW_F = 600, VS_TARGET = 10;

  var nes0 = null, ppu = null, bgB = null, spB = null, g = null, shadow = null;

  /* ============================== 工具 ============================== */
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function rev(d) { return (d + 2) & 3; }
  function idx(x, y) { return y * FW + x; }
  function inF(x, y) { return x >= 0 && y >= 0 && x < FW && y < FH; }
  function put(col, row, tile) {
    var i = row * 32 + col;
    if (shadow[i] === tile) return;
    shadow[i] = tile;
    ppu.setTile(0, col, row, tile);
  }
  function T(n) { return bgB.index(n); }
  function text(col, row, str) { for (var i = 0; i < str.length; i++) put(col + i, row, T(S.fontName(str.charAt(i)))); }
  function num(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s.slice(-w); }
  function pad(s, w) { while (s.length < w) s += ' '; return s.slice(0, w); }

  /* ============================== 調色盤 / CHR ============================== */
  var FIELD = [0x2A, 0x27, 0x30];        // 色 1 玩家綠 / 色 2 電腦橘 / 色 3 白
  function setPals(back) {
    ppu.setBackdrop(back === undefined ? 0x0F : back);
    ppu.setBgPalette(0, FIELD);
    ppu.setBgPalette(1, [0x21, 0x27, 0x30]);   // HUD
    ppu.setBgPalette(2, [0x1A, 0x0A, 0x3A]);   // 標題大字（綠色立體磚）
    ppu.setBgPalette(3, [0x16, 0x26, 0x30]);
    ppu.setSprPalette(0, FIELD);
    ppu.setSprPalette(1, [0x16, 0x27, 0x30]);
    ppu.setSprPalette(2, [0x12, 0x22, 0x30]);
    ppu.setSprPalette(3, [0x00, 0x10, 0x30]);
  }
  function buildChr() {
    bgB = NES.CHR.bank('snake_bg', S.BG_TILES);
    spB = NES.CHR.bank('snake_spr', S.SPR_TILES);
    NES.CHR.setPattern(0, bgB);
    NES.CHR.setPattern(1, spB);
    ppu.setPatternTables(0, 1);
    ppu.spriteMode(8);
    ppu.flicker = 'none';
  }
  function clearAll(back) {
    shadow = new Int16Array(32 * 30);
    ppu.fillTiles(0, 0, 0, 32, 30, 0);
    ppu.fillAttr(0, 0, 0, 16, 15, 0);
    ppu.clearSprites();
    setPals(back);
  }

  /* ============================== 場地 ============================== */
  function loadField(def) {
    g.def = def;
    g.occ = new Int8Array(FW * FH);
    g.portal = {};                       // idx → 對應出口 [x, y]
    var i, x, y;
    for (i = 0; i < def.walls.length; i++) {
      var w = def.walls[i];
      for (y = w[1]; y < w[1] + w[3]; y++) for (x = w[0]; x < w[0] + w[2]; x++) if (inF(x, y)) g.occ[idx(x, y)] = WALL;
    }
    for (i = 0; i < def.portals.length; i++) {
      var p = def.portals[i];
      g.occ[idx(p.a[0], p.a[1])] = PORTAL; g.occ[idx(p.b[0], p.b[1])] = PORTAL;
      g.portal[idx(p.a[0], p.a[1])] = { to: p.b, k: p.k };
      g.portal[idx(p.b[0], p.b[1])] = { to: p.a, k: p.k };
    }
    g.food = null; g.gem = null;
  }
  function newSnake(who, st) {
    var s = { who: who, code: who === 'P' ? PL : CPU, cells: [], dir: st[2], queue: [], grow: 0, alive: true, eaten: 0, warps: 0 };
    for (var i = 0; i < S.START_LEN; i++) s.cells.push([st[0] - DX[st[2]] * i, st[1] - DY[st[2]] * i]);
    for (i = 0; i < s.cells.length; i++) g.occ[idx(s.cells[i][0], s.cells[i][1])] = s.code;
    return s;
  }
  function cellTile(x, y) {
    var o = g.occ[idx(x, y)];
    if (o === WALL) return T('WALL');
    if (o === FOOD) return T(((g.frames >> 4) & 1) ? 'FOOD2' : 'FOOD');
    if (o === GEM) return (g.gem && g.gem.t < 120 && ((g.gem.t >> 3) & 1)) ? 0 : T('GEM');
    if (o === PORTAL) { var p = g.portal[idx(x, y)]; return T('P' + p.k + ((g.frames >> 4) & 1)); }
    if (o === PL || o === CPU) return snakeTile(o === PL ? g.pl : g.cpu, x, y);
    return 0;
  }
  function snakeTile(s, x, y) {
    if (!s) return 0;
    var c = s.cells, n = c.length, i, w = s.who;
    if (c[0][0] === x && c[0][1] === y) return T(w + '_H' + s.dir);
    if (c[n - 1][0] === x && c[n - 1][1] === y) return T(w + '_T' + tailDir(s));
    return T(w + (((x + y) & 1) ? '_BA' : '_BB'));
  }
  function tailDir(s) {
    var c = s.cells, n = c.length, t = c[n - 1], p = c[n - 2], i;
    for (i = 0; i < 4; i++) if (t[0] + DX[i] === p[0] && t[1] + DY[i] === p[1]) return i;
    return s.dir;                        // 傳送門兩端不相鄰
  }
  function drawCell(x, y) { put(FX0 + x, FY0 + y, cellTile(x, y)); }
  function drawFieldFull() {
    clearAll(g.def.back);
    var x, y;
    for (x = 0; x < 32; x++) { put(x, 4, T('WALL')); put(x, 27, T('WALL')); }
    for (y = 4; y < 28; y++) { put(0, y, T('WALL')); put(31, y, T('WALL')); }
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) drawCell(x, y);
    ppu.fillAttr(0, 0, 0, 16, 2, 1);    // HUD 列 0..3 = 屬性 1
    g.hud = {};
    drawHud();
  }

  /* ============================== HUD ============================== */
  function drawHud() {
    var h = g.hud;
    if (h.static !== g.mode2) {
      h.static = g.mode2;
      text(1, 1, 'SCORE'); text(20, 1, 'BEST');
    }
    if (h.score !== g.score) { h.score = g.score; text(7, 1, num(g.score, 6)); }
    if (h.best !== g.best) { h.best = g.best; text(25, 1, num(g.best, 6)); }
    var l2, l3;
    if (g.mode2 === 0) {
      l2 = pad('ENDLESS  SPEED ' + (speedLevel() + 1), 30);
      l3 = pad('LENGTH ' + num(g.pl ? g.pl.cells.length : 0, 3) + (g.slowT > 0 ? '  SLOW' : ''), 30);
    } else if (g.mode2 === 1) {
      l2 = pad('STAGE ' + (g.stage + 1) + ' ' + g.def.name, 30);
      l3 = pad('STAR ' + num(g.pl ? g.pl.eaten : 0, 2) + '/' + num(g.def.target, 2) + '  LIFE ' + g.lives + (g.slowT > 0 ? ' SLOW' : ''), 30);
    } else {
      l2 = pad('ROUND ' + g.round + '   WINS ' + g.winsP + ' - ' + g.winsC, 30);
      l3 = pad('YOU ' + num(g.pl ? g.pl.eaten : 0, 2) + '  CPU ' + num(g.cpu ? g.cpu.eaten : 0, 2) + '  TO ' + VS_TARGET + (g.slowT > 0 ? ' SLOW' : ''), 30);
    }
    if (h.l2 !== l2) { h.l2 = l2; text(1, 2, l2); }
    if (h.l3 !== l3) { h.l3 = l3; text(1, 3, l3); }
  }
  // 場地中央訊息（覆蓋 1 列；清除時照格子重畫）
  function fieldMsg(str, row) {
    row = row === undefined ? 10 : row;
    var x, key = 'msgOn' + row;
    if (g[key]) for (x = 0; x < FW; x++) drawCell(x, row);
    g[key] = !!str;
    if (!str) return;
    var col = Math.floor((FW - str.length) / 2);
    for (x = 0; x < str.length; x++) put(FX0 + col + x, FY0 + row, str.charAt(x) === ' ' ? 0 : T(S.fontName(str.charAt(x))));
  }

  /* ============================== 標題 ============================== */
  function drawTitle() {
    clearAll(0x0F);
    var B = 'WORM', i, x, y;
    text(10, 3, '- STARDUST -');
    for (i = 0; i < 4; i++) {
      var rows = S.GLYPH[B.charAt(i)].split(',');
      for (y = 0; y < 7; y++) for (x = 0; x < 5; x++) if (rows[y].charAt(x) === '1') put(4 + i * 6 + x, 5 + y, T('BLK'));
    }
    ppu.fillAttr(0, 2, 2, 12, 4, 2);
    for (i = 0; i < 3; i++) text(10, 15 + i * 2, MODES[i]);
    text(19, 15, num(CT.load('snake', 'endless', 0), 6));
    text(19, 17, 'ST ' + CT.load('snake', 'stage', 0) + '/8');
    text(19, 19, 'WIN ' + num(CT.load('snake', 'vs', 0), 2));
    // fix-r5 P3-5：段落間空一列；P3-6：C/★
    text(4, 22, 'UP DOWN  CHOOSE MODE');
    text(4, 24, 'START    GO   C/★ CHEAT');
    text(4, 26, 'BEST ' + num(g.best, 6));
  }

  /* ============================== 流程 ============================== */
  function enter(m, f) { g.mode = m; g.modeT = f || 0; }
  function startMode(m) {
    g.mode2 = m; g.score = 0; g.lives = START_LIVES; g.stage = 0; g.clearsRun = 0; g.round = 1; g.winsP = 0; g.winsC = 0;
    g.slowT = 0;
    startField();
  }
  function startField() {
    var def = g.mode2 === 0 ? S.ENDLESS : g.mode2 === 1 ? S.STAGES[g.stage] : S.ARENA;
    loadField(def);
    g.pl = newSnake('P', def.start);
    g.cpu = g.mode2 === 2 ? newSnake('C', def.cpu) : null;
    g.foods = 0; g.moveT = 0; g.cpuT = 0;
    spawnFood();
    CT.blank(nes0, drawFieldFull);
    enter('ready', READY_F);
    fieldMsg(g.mode2 === 1 ? 'STAGE ' + (g.stage + 1) : g.mode2 === 2 ? 'ROUND ' + g.round : 'READY');
    S.Audio.play(nes0, g.mode2 === 2 ? 'snake_vs' : 'snake_play');
  }
  function spawnFood() {
    var tries, x, y;
    for (tries = 0; tries < 400; tries++) {
      x = rnd() % FW; y = rnd() % FH;
      if (g.occ[idx(x, y)] !== EMPTY) continue;
      if (nearHead(x, y, 2)) continue;
      g.occ[idx(x, y)] = FOOD; g.food = [x, y];
      return true;
    }
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) if (g.occ[idx(x, y)] === EMPTY) { g.occ[idx(x, y)] = FOOD; g.food = [x, y]; return true; }
    g.food = null;
    return false;
  }
  function spawnGem() {
    for (var tries = 0; tries < 200; tries++) {
      var x = rnd() % FW, y = rnd() % FH;
      if (g.occ[idx(x, y)] !== EMPTY || nearHead(x, y, 3)) continue;
      g.occ[idx(x, y)] = GEM; g.gem = { x: x, y: y, t: GEM_F };
      drawCell(x, y);
      return;
    }
  }
  function nearHead(x, y, r) {
    var a = [g.pl, g.cpu], i;
    for (i = 0; i < 2; i++) if (a[i]) { var h = a[i].cells[0]; if (Math.abs(h[0] - x) + Math.abs(h[1] - y) <= r) return true; }
    return false;
  }
  function speedLevel() { return g.mode2 === 0 ? Math.min(5, Math.floor(g.foods / 5)) : 0; }
  function interval() {
    var base = g.def.speed - speedLevel();
    if (g.mode2 === 2) base = S.ARENA.speed - (g.round - 1);
    return Math.max(3, base) + (g.slowT > 0 ? 3 : 0);
  }

  /* ---------- 移動（含傳送門） ---------- */
  // 從 (x,y) 往 d 走一步 → {x, y, d, warp} ；出界回 null（= 撞牆）
  function stepCell(x, y, d) {
    var nx = x + DX[d], ny = y + DY[d];
    if (!inF(nx, ny)) return null;
    var p = g.portal[idx(nx, ny)];
    if (!p) return { x: nx, y: ny, d: d, warp: false };
    var tries = [d, (d + 1) & 3, (d + 3) & 3], i;
    for (i = 0; i < 3; i++) {
      var qx = p.to[0] + DX[tries[i]], qy = p.to[1] + DY[tries[i]];
      if (inF(qx, qy) && g.occ[idx(qx, qy)] !== WALL && g.occ[idx(qx, qy)] !== PORTAL) return { x: qx, y: qy, d: tries[i], warp: true };
    }
    return null;
  }
  function blockedFor(s, x, y) {
    var o = g.occ[idx(x, y)];
    if (o === WALL || o === PORTAL) return true;
    if (o === PL || o === CPU) {
      var t = s.cells[s.cells.length - 1];
      if (o === s.code && t[0] === x && t[1] === y && s.grow === 0) return false;   // 自己的尾巴會讓開
      return true;
    }
    return false;
  }
  function wantDir(s) {
    while (s.queue.length) {
      var d = s.queue.shift();
      if (d !== s.dir && d !== rev(s.dir)) return d;
    }
    if (s.held >= 0 && s.held !== rev(s.dir)) return s.held;
    return s.dir;
  }
  // 兩條蟲同時決定下一格 → 判定 → 再一起移動
  function tickSnakes() {
    var list = [g.pl], i;
    if (g.cpu) list.push(g.cpu);
    var plans = [];
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      var d = s === g.cpu ? (g.cpuForce >= 0 ? g.cpuForce : aiDir(g.cpu, g.pl, g.round)) : wantDir(s);
      var nx = stepCell(s.cells[0][0], s.cells[0][1], d);
      plans.push({ s: s, n: nx, crash: !nx || blockedFor(s, nx.x, nx.y) });
    }
    if (plans.length === 2 && plans[0].n && plans[1].n && plans[0].n.x === plans[1].n.x && plans[0].n.y === plans[1].n.y) {
      plans[0].crash = plans[1].crash = true;    // 正面對撞
    }
    for (i = 0; i < plans.length; i++) if (plans[i].crash) { plans[i].s.alive = false; plans[i].s.crashAt = plans[i].n ? [plans[i].n.x, plans[i].n.y] : null; }
    for (i = 0; i < plans.length; i++) if (!plans[i].crash) advance(plans[i].s, plans[i].n);
    var dead = plans.filter(function (p) { return p.crash; });
    if (dead.length) onCrash(dead.map(function (p) { return p.s; }));
  }
  function advance(s, n) {
    var oldHead = s.cells[0], o = g.occ[idx(n.x, n.y)];
    s.dir = n.d;
    if (n.warp) { s.warps++; S.Audio.sfx(nes0, 'snake_warp'); }
    var ateFood = o === FOOD, ateGem = o === GEM;
    // 尾巴先走（沒在長的話）
    if (s.grow > 0) s.grow--;
    else {
      var t = s.cells.pop();
      if (!(t[0] === n.x && t[1] === n.y)) { g.occ[idx(t[0], t[1])] = EMPTY; drawCell(t[0], t[1]); }
    }
    s.cells.unshift([n.x, n.y]);
    g.occ[idx(n.x, n.y)] = s.code;
    drawCell(n.x, n.y);
    drawCell(oldHead[0], oldHead[1]);
    var tl = s.cells[s.cells.length - 1];
    drawCell(tl[0], tl[1]);
    if (ateFood) {
      s.grow += 1; s.eaten++; g.foods++;
      if (s === g.pl) { addScore(10 * (1 + speedLevel()) + (g.mode2 === 1 ? 5 * g.stage : 0)); S.Audio.sfx(nes0, 'snake_eat'); }
      else S.Audio.sfx(nes0, 'snake_cpu');
      spawnFood(); drawCell(g.food[0], g.food[1]);
      if (g.foods % GEM_EVERY === 0 && !g.gem) spawnGem();
    }
    if (ateGem) {
      s.grow += 3; g.gem = null;
      if (s === g.pl) { addScore(50); S.Audio.sfx(nes0, 'snake_gem'); if (g.mode2 === 1) s.eaten++; }
    }
  }
  function addScore(n) { g.score += n; if (g.score > g.best) { g.best = g.score; } }

  function onCrash(dead) {
    var i;
    for (i = 0; i < dead.length; i++) {
      var c = dead[i].crashAt || dead[i].cells[0];
      if (inF(c[0], c[1])) put(FX0 + c[0], FY0 + c[1], T('CRASH'));
    }
    S.Audio.stop(nes0);
    S.Audio.sfx(nes0, 'snake_crash');
    g.deaths += (dead.indexOf(g.pl) >= 0) ? 1 : 0;
    g.lastDead = dead.map(function (s) { return s.who; }).join('');
    enter('crash', CRASH_F);
  }
  function saveBests() {
    CT.save('snake', 'best', Math.max(CT.load('snake', 'best', 0), g.best));
    if (g.mode2 === 0) CT.save('snake', 'endless', Math.max(CT.load('snake', 'endless', 0), g.score));
  }

  /* ============================== 電腦蟲 AI / 機器人共用的規劃 ============================== */
  // BFS（含傳送門）找最近的星 / 星鑽；吃到後若還能走到自己的尾巴（或可走面積 ≥ 身長）才採用，否則求生（選可走面積最大的方向）
  function bfs(s, x0, y0, d0) {
    var N = FW * FH, dist = new Int16Array(N), first = new Int8Array(N), prev = new Int32Array(N), q = new Int32Array(N), qh = 0, qt = 0, i;
    for (i = 0; i < N; i++) { dist[i] = -1; prev[i] = -1; }
    var k0 = idx(x0, y0);
    dist[k0] = 0; first[k0] = -1; q[qt++] = k0;
    var hdir = new Int8Array(N); hdir[k0] = d0;
    while (qh < qt) {
      var k = q[qh++], x = k % FW, y = (k / FW) | 0;
      for (i = 0; i < 4; i++) {
        if (k === k0 && i === rev(d0)) continue;
        var n = stepCell(x, y, i);
        if (!n) continue;
        var nk = idx(n.x, n.y);
        if (dist[nk] >= 0 || blockedFor(s, n.x, n.y)) continue;
        dist[nk] = dist[k] + 1; first[nk] = k === k0 ? i : first[k]; prev[nk] = k; hdir[nk] = n.d;
        q[qt++] = nk;
      }
    }
    return { dist: dist, first: first, prev: prev };
  }
  function floodArea(block, x0, y0, limit) {
    var N = FW * FH, seen = new Uint8Array(N), q = new Int32Array(N), qh = 0, qt = 0, c = 0, i;
    var k0 = idx(x0, y0);
    seen[k0] = 1; q[qt++] = k0;
    while (qh < qt && c < limit) {
      var k = q[qh++], x = k % FW, y = (k / FW) | 0; c++;
      for (i = 0; i < 4; i++) {
        var n = stepCell(x, y, i);
        if (!n) continue;
        var nk = idx(n.x, n.y);
        if (seen[nk] || block[nk]) continue;
        seen[nk] = 1; q[qt++] = nk;
      }
    }
    return c;
  }
  function baseBlock(except) {
    var N = FW * FH, b = new Uint8Array(N), i;
    for (i = 0; i < N; i++) { var o = g.occ[i]; if (o === WALL || o === PORTAL || o === PL || o === CPU) b[i] = 1; }
    if (except) b[idx(except[0], except[1])] = 0;
    return b;
  }
  // 沿路徑吃到目標後的虛擬蟲身 → 從新頭能不能走到新尾巴 / 面積夠不夠
  function safeAfter(s, r, goal) {
    var path = [], k = goal;
    while (k >= 0 && r.prev[k] >= 0) { path.push(k); k = r.prev[k]; }
    var len = s.cells.length + s.grow + 1;
    var body = path.slice(0);            // path[0] = 目標（新頭）
    for (var i = 0; i < s.cells.length && body.length < len; i++) body.push(idx(s.cells[i][0], s.cells[i][1]));
    var b = baseBlock(null), j;
    for (j = 0; j < s.cells.length; j++) b[idx(s.cells[j][0], s.cells[j][1])] = 0;
    for (j = 0; j < body.length; j++) b[body[j]] = 1;
    var tail = body[body.length - 1];
    b[tail] = 0;
    var hx = goal % FW, hy = (goal / FW) | 0;
    b[goal] = 0;
    var area = floodArea(b, hx, hy, len + 8);
    if (area >= len + 2) return true;
    // 走得到尾巴也算安全
    var seen = new Uint8Array(FW * FH), q = [goal]; seen[goal] = 1;
    while (q.length) {
      var kk = q.shift(), x = kk % FW, y = (kk / FW) | 0;
      if (kk === tail) return true;
      for (var d = 0; d < 4; d++) {
        var n = stepCell(x, y, d); if (!n) continue;
        var nk = idx(n.x, n.y);
        if (seen[nk] || (b[nk] && nk !== tail)) continue;
        seen[nk] = 1; q.push(nk);
      }
    }
    return false;
  }
  function planDir(s, other, sloppy) {
    var h = s.cells[0], r = bfs(s, h[0], h[1], s.dir), i;
    var goals = [];
    if (g.gem) goals.push(idx(g.gem.x, g.gem.y));
    if (g.food) goals.push(idx(g.food[0], g.food[1]));
    goals.sort(function (a, b) { return (r.dist[a] < 0 ? 9999 : r.dist[a]) - (r.dist[b] < 0 ? 9999 : r.dist[b]); });
    for (i = 0; i < goals.length; i++) {
      var gk = goals[i];
      if (r.dist[gk] < 0) continue;
      // 對手比我先到就不搶（避免正面對撞）
      if (other && other.alive) {
        var oh = other.cells[0], od = Math.abs(oh[0] - gk % FW) + Math.abs(oh[1] - ((gk / FW) | 0));
        if (od <= 1 && r.dist[gk] <= 2) continue;
      }
      if (sloppy || safeAfter(s, r, gk)) return r.first[gk];
    }
    // 求生：每個可走方向的面積，取最大（同分偏好直走）
    var best = -1, bv = -1;
    for (i = 0; i < 4; i++) {
      if (i === rev(s.dir)) continue;
      var n = stepCell(h[0], h[1], i);
      if (!n || blockedFor(s, n.x, n.y)) continue;
      var b = baseBlock(s.cells[s.cells.length - 1]);
      b[idx(h[0], h[1])] = 1;
      var a = floodArea(b, n.x, n.y, 400) * 4 + (i === s.dir ? 1 : 0);
      if (other && other.alive) { var oh2 = other.cells[0]; if (Math.abs(oh2[0] - n.x) + Math.abs(oh2[1] - n.y) <= 1) a -= 200; }
      if (a > bv) { bv = a; best = i; }
    }
    return best >= 0 ? best : s.dir;
  }
  function aiDir(s, other, round) {
    // 電腦蟲：第 1 局 18% 機率偷懶（只看最短路、不檢查安全）、第 2 局 8%、第 3 局 2%
    var lazy = [18, 8, 2][Math.min(2, round - 1)];
    return planDir(s, other, (rnd() % 100) < lazy);
  }

  /* ============================== update ============================== */
  function readInput() {
    var I = NES.Input, s = g.pl, i;
    if (!s) return;
    for (i = 0; i < 4; i++) if (I.pressed(DIRBTN[i])) {
      var last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      if (i !== last && i !== rev(last) && s.queue.length < 2) s.queue.push(i);
    }
    s.held = -1;
    for (i = 0; i < 4; i++) if (I.held(DIRBTN[i])) { s.held = i; if (i !== s.dir) break; }
  }
  function update(nes) {
    S.Audio.tick(nes);
    g.frames++;
    if (g.cheatReq) { g.cheatReq = false; doCheat(); }
    var I = NES.Input;
    if (g.mode === 'title') { titleUpdate(I); return; }
    if ((g.mode === 'play') && I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      fieldMsg(g.paused ? 'PAUSE' : '');
      fieldMsg(g.paused ? 'HOLD START+SELECT: MENU' : '', 12);     // §6-5
      if (g.paused) S.Audio.pause(nes0); else S.Audio.resume(nes0);  // §6-2
      S.Audio.sfx(nes0, 'snake_pause');
      return;
    }
    if (g.paused) return;
    if (g.modeT > 0) g.modeT--;
    // 星 / 傳送門動畫（每 16 幀換一次 = 星 1 byte + 門 ≤ 4 byte）
    if ((g.frames & 15) === 0) animate();
    switch (g.mode) {
      case 'ready':
        readInput();
        if (g.modeT <= 0) { fieldMsg(''); enter('play'); }
        break;
      case 'play':
        g.playFrames++;
        if (g.slowT > 0) g.slowT--;
        readInput();
        if (g.gem && --g.gem.t <= 0) { g.occ[idx(g.gem.x, g.gem.y)] = EMPTY; drawCell(g.gem.x, g.gem.y); g.gem = null; }
        else if (g.gem && g.gem.t < 120 && (g.gem.t & 7) === 0) drawCell(g.gem.x, g.gem.y);
        if (++g.moveT >= interval()) { g.moveT = 0; tickSnakes(); }
        if (g.mode !== 'play') break;
        if (g.mode2 === 1 && g.pl.eaten >= g.def.target) {
          g.clearsRun++; g.stageClears++;
          CT.save('snake', 'stage', Math.max(CT.load('snake', 'stage', 0), g.stage + 1));
          enter('clear', CLEAR_F);
          fieldMsg(g.stage + 1 >= S.STAGES.length ? 'ALL CLEAR!' : 'STAGE CLEAR!');
          S.Audio.play(nes0, 'snake_clear');
        } else if (g.mode2 === 2 && (g.pl.eaten >= VS_TARGET || g.cpu.eaten >= VS_TARGET)) {
          roundEnd(g.pl.eaten >= VS_TARGET ? 'P' : 'C');
        }
        break;
      case 'crash':
        if (g.modeT <= 0) afterCrash();
        break;
      case 'clear':
        if (g.modeT <= 0) {
          saveBests();
          if (g.stage + 1 >= S.STAGES.length) { toTitle(); break; }
          g.stage++;
          startField();
        }
        break;
      case 'round':
        if (g.modeT <= 0) {
          if (g.winsP >= 2 || g.winsC >= 2) {
            if (g.winsP >= 2) CT.save('snake', 'vs', CT.load('snake', 'vs', 0) + 1);
            saveBests();
            enter('over', OVER_F);
            fieldMsg(g.winsP >= 2 ? 'YOU WIN THE MATCH' : 'CPU WINS THE MATCH');
            S.Audio.play(nes0, g.winsP >= 2 ? 'snake_clear' : 'snake_over');
          } else { g.round++; startField(); }
        }
        break;
      case 'over':
        if (g.modeT <= 0) toTitle();
        break;
    }
    drawHud();
  }
  function afterCrash() {
    if (g.mode2 === 0) {
      saveBests();
      enter('over', OVER_F); fieldMsg('GAME OVER'); S.Audio.play(nes0, 'snake_over');
    } else if (g.mode2 === 1) {
      g.lives--;
      if (g.lives <= 0) { saveBests(); enter('over', OVER_F); fieldMsg('GAME OVER'); S.Audio.play(nes0, 'snake_over'); }
      else startField();
    } else {
      var d = g.lastDead;
      if (d === 'PC' || d === 'CP') { fieldMsg('DRAW'); enter('round', ROUND_F); }   // 雙雙撞毀 = 重打這局
      else roundEnd(d === 'P' ? 'C' : 'P');
    }
  }
  function roundEnd(winner) {
    if (winner === 'P') { g.winsP++; addScore(200); } else g.winsC++;
    enter('round', ROUND_F);
    fieldMsg(winner === 'P' ? 'YOU WIN ROUND ' + g.round : 'CPU WINS ROUND ' + g.round);
    S.Audio.play(nes0, winner === 'P' ? 'snake_clear' : 'snake_over');
  }
  function animate() {
    if (!g.occ) return;
    if (g.food) drawCell(g.food[0], g.food[1]);
    var k;
    for (k in g.portal) if (Object.prototype.hasOwnProperty.call(g.portal, k)) drawCell(k % FW, (k / FW) | 0);
  }
  function titleUpdate(I) {
    var n = MODES.length;
    if (I.pressed(BTN.DOWN) || I.pressed(BTN.SELECT) && !I.held(BTN.START)) { g.sel = (g.sel + 1) % n; S.Audio.sfx(nes0, 'snake_menu'); }
    if (I.pressed(BTN.UP)) { g.sel = (g.sel + n - 1) % n; S.Audio.sfx(nes0, 'snake_menu'); }
    if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) { S.Audio.sfx(nes0, 'snake_ok'); startMode(g.sel); }
  }
  function toTitle() {
    enter('title'); g.paused = false; g.pl = null; g.cpu = null; g.occ = null;
    CT.blank(nes0, drawTitle);
    S.Audio.play(nes0, 'snake_title');
  }

  /* ============================== 密技 ============================== */
  function doCheat() {
    if (!g || g.mode === 'title') return false;
    if (g.mode === 'over') {
      // §6-1 原地續關：回到剛才那一關 / 那一局，保留分數與進度；命數回開局值
      if (g.mode2 === 2 && g.winsP >= 2) return false;          // 已經贏下整場：不是失敗畫面
      g.cheats++;
      g.lives = START_LIVES;
      if (g.mode2 === 2) g.winsC = Math.min(g.winsC, 1);         // 撤銷剛才輸掉的那一局，同一局重打
      g.paused = false;
      startField();
      return true;
    }
    g.cheats++;
    g.lives = Math.min(9, g.lives + 1);
    g.slowT = SLOW_F;
    return true;
  }

  /* ============================== draw ============================== */
  function draw() {
    if (g.mode === 'title') {
      var y = (15 + g.sel * 2) * 8, f = (g.frames >> 3) & 1;
      ppu.sprite(0, { x: 8 * 8 - (f ? 1 : 0), y: y, tile: spB.index('CURSOR'), pal: 0 });
      ppu.sprite(1, { x: 7 * 8 - (f ? 1 : 0) - 2, y: y, tile: spB.index('CURSOR2'), pal: 0 });
      return;
    }
    ppu.sprite(0, null); ppu.sprite(1, null);
  }

  /* ============================== 機器人 ============================== */
  function bot() {
    if (!g) return null;
    if (g.mode === 'title') {
      if (g.sel !== 1) return (g.frames & 7) === 0 ? BTN.DOWN : null;
      return (g.frames & 7) === 4 ? BTN.START : null;
    }
    if ((g.mode !== 'play' && g.mode !== 'ready') || g.paused || !g.pl) return null;
    var d = planDir(g.pl, g.cpu, false);
    return DIRBTN[d];
  }

  /* ============================== 註冊 ============================== */
  function newState() {
    return {
      mode: 'title', modeT: 0, frames: 0, playFrames: 0, sel: 0, mode2: 1, seed: 5150713, paused: false,
      score: 0, best: CT.load('snake', 'best', 0), lives: 3, stage: 0, clearsRun: 0, stageClears: 0,
      round: 1, winsP: 0, winsC: 0, deaths: 0, cheats: 0, slowT: 0, cheatReq: false,
      cpuForce: -1, def: S.ENDLESS, occ: null, pl: null, cpu: null, food: null, gem: null, hud: {}, foods: 0
    };
  }
  var game = {
    id: 'snake', order: 5, title: '星塵貪食蟲', legacy: ['snake.html', 'snake-game.html'],
    init: function (nes) {
      nes0 = nes; ppu = nes.ppu;
      g = newState();
      buildChr();
      S.Audio.init(nes);
      drawTitle();
      enter('title');
      var m = CT.query('mode'), st = parseInt(CT.query('stage') || '0', 10);
      if (m === 'endless' || m === 'stages' || m === 'vs' || st > 0) {
        startMode(m === 'endless' ? 0 : m === 'vs' ? 2 : 1);
        if (st > 0 && g.mode2 === 1) { g.stage = Math.min(S.STAGES.length, st) - 1; startField(); }
      } else S.Audio.play(nes0, 'snake_title');
    },
    update: update,
    draw: function () { draw(); },
    exit: function () { if (g && g.mode !== 'title') saveBests(); S.Audio.stop(nes0); },   // §6-3
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, sMode: MODES[g.mode2], paused: g.paused, sel: g.sel, stage: g.stage + 1, stageName: g.def.name,
        score: g.score, best: g.best, lives: g.lives, clears: g.clearsRun, stageClears: g.stageClears, deaths: g.deaths, cheats: g.cheats,
        length: g.pl ? g.pl.cells.length : 0, eaten: g.pl ? g.pl.eaten : 0, target: g.def.target, interval: g.occ ? interval() : 0,
        dir: g.pl ? g.pl.dir : -1, head: g.pl ? g.pl.cells[0] : null, food: g.food, gem: g.gem ? [g.gem.x, g.gem.y] : null,
        cpu: g.cpu ? { length: g.cpu.cells.length, eaten: g.cpu.eaten, head: g.cpu.cells[0], alive: g.cpu.alive } : null,
        round: g.round, winsP: g.winsP, winsC: g.winsC, slowT: g.slowT, frames: g.frames, playFrames: g.playFrames,
        warps: g.pl ? g.pl.warps : 0, song: S.Audio.current
      };
    },
    cheat: function () {
      // §6-1：遊玩中 = 補命 + 慢動作；GAME OVER（輸掉）= 原地續關；標題無效（P3-7）
      if (!g || g.mode === 'title') return false;
      if (g.mode === 'over' && g.mode2 === 2 && g.winsP >= 2) return false;
      g.cheatReq = true;
      return true;
    },
    get backTile() { return { tile: spB ? spB.index('BACK') : Object.keys(S.SPR_TILES).indexOf('BACK'), pal: 0 }; },   // §6-4
    bot: bot,
    goal: function () { return !!g && g.mode2 === 1 && g.clearsRun >= 3 && g.cheats === 0; },
    bestText: function () { return num(Math.min(999999, CT.load('snake', 'best', 0)), 6); }   // R6 §1-6：右對齊 6 字元（超過封頂）
  };
  CT.register(game);

  /* 測試鉤子（test_snake.py 用） */
  S.dev = {
    g: function () { return g; },
    occ: function (x, y) { return g.occ ? g.occ[idx(x, y)] : -1; },
    placeFood: function (x, y) {
      if (g.food) { g.occ[idx(g.food[0], g.food[1])] = EMPTY; drawCell(g.food[0], g.food[1]); }
      g.occ[idx(x, y)] = FOOD; g.food = [x, y]; drawCell(x, y); return g.food;
    },
    stepCell: function (x, y, d) { return stepCell(x, y, d); },
    plan: function () { return planDir(g.pl, g.cpu, false); },
    cpuDir: function (d) { g.cpuForce = d; return d; },
    setEaten: function (n) { g.pl.eaten = n; return n; },
    stage: function (n) { g.stage = n - 1; startField(); return g.def.name; },
    shadowAt: function (c, r) { return shadow[r * 32 + c]; },
    // 名稱表某一列解回字串（非字型磚 = '?'、空白 = ' '）——測試讀畫面字樣用
    rowText: function (r, c0, c1) {
      var out = '', names = bgB.names, c;
      for (c = c0 || 0; c < (c1 === undefined ? 32 : c1); c++) {
        var t = shadow[r * 32 + c], nm = t >= 0 ? names[t] : '';
        out += t === 0 ? ' ' : (nm && nm.indexOf('F_') === 0) ? nm.slice(2) : '?';
      }
      return out;
    },
    spr: function () { return spB; },
    bg: function () { return bgB; },
    MODES: MODES, VS_TARGET: VS_TARGET
  };
})();
