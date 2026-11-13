/*
 * games/cart1/maze/main.js — 《星塵迷宮》（合輯槽 1，id = maze；舊作 pacman.html 只取「迷宮吃點 + 追兵」玩法概念）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-1 cart1-grid（R5）。依賴 engine/*、games/cart1/registry.js、maze/{chr,maps,song}.js。
 * 契約：docs/R5_BRIEF.md §2（CT.register）、docs/ENGINE_API.md §7 / §10 / §12。
 *
 * 玩法：操縱小彗 Pip 吃光迷宮裡的星屑過關；四顆能量星讓追兵受驚可吃；四張原創迷宮循環、
 *   每關加速（maps.js Z.LEVELS）、左右隧道（追兵在隧道減速）、每關兩次獎勵道具、10000 分加命。
 * 追兵個性（全部自訂；fix-r5 重新命名 / 配色：紫 = 追擊、萊姆綠 = 包抄、金 = 巡邏、白 = 亂走）：
 *   刺棘 VEX    — 追擊：沿迷宮最短路（BFS 距離圖）直撲主角
 *   苔莢 MOSS   — 包抄：預判主角「沿目前方向走到的下一個路口」，搶先到那裡堵
 *   環星 ORBIT  — 巡邏：繞自己的象限巡航（每關換象限），主角進入 8 格內才轉為追擊
 *   碎晶 SHARD  — 亂走：每個路口一半機率朝主角、一半亂選
 *   另有「散開 / 追擊」波次（每關表格不同），切換時追兵掉頭。
 * fix-r5（docs/QA_REPORT.md # R5 qa-r5 / R5_BRIEF §6）：
 *   P1-1 視覺身分重做（星岩牆 / 十字星屑 / 力場星巢 / 火箭主角 / 開局 LIFT OFF! 在上方橫幅 / 過關彩虹掃牆 /
 *        標題追兵一排 + 輪播說明）；§6-1 GAME OVER 按密技 = 原地續關（命數回 3、保留分數與已吃星屑）；
 *   §6-2 暫停 = BGM 停、解除從同一小節接續；§6-3 exit 存最高分；§6-4 backTile；§6-5 暫停畫面寫 HOLD START+SELECT: MENU。
 *
 * 硬限制的作法
 *   - 每線 ≤ 8 精靈：所有角色都是單顆 8×8 精靈，OAM 固定配置 0 主角 / 1..4 追兵 / 5 獎勵 / 6..7 分數牌，
 *     全畫面最多 8 顆 ⇒ 任何掃描線都 ≤ 8（不是靠輪替；ppu.flicker = 'none'）。
 *   - VBlank ≤ 160 byte：背景寫入一律走 put()（影子名稱表比對，沒變就不寫）；整片重畫只在
 *     init / 換關 / 回標題時，包在 CT.blank（= 關 rendering）。
 *   - 位置 / 速度：整數像素 + 8.8 定點累加器（speed 單位 1/256 px/幀）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT;
  if (!CT || !CT.register) throw new Error('maze/main.js 需要 games/cart1/registry.js');
  var Z = CT.Maze = CT.Maze || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var W = Z.MAP_W, H = Z.MAP_H;
  var OX = 2, OY = 3;                    // 迷宮在名稱表的左上角（格）
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var DIRBTN = [BTN.UP, BTN.RIGHT, BTN.DOWN, BTN.LEFT];
  var NAMES = ['VEX', 'MOSS', 'ORBIT', 'SHARD'];
  var CH_PAL = [1, 1, 2, 2];
  var HOME = [[25, -2], [1, -2], [25, 24], [1, 24]];   // 散開時的目標角落（刻意在迷宮外，讓追兵繞角）
  var START_LIVES = 3;
  var READY_FIRST = 150, READY_AGAIN = 100, DIE_FRAMES = 110, CLEAR_FRAMES = 140, OVER_FRAMES = 200;
  var EAT_FREEZE = 36, POP_FRAMES = 60, EXTRA_AT = 10000;
  var SPR_HERO = 0, SPR_CH = 1, SPR_BONUS = 5, SPR_POP = 6;

  var nes0 = null, ppu = null, bgB = null, spB = null, T = null, S = null;
  var g = null;
  var shadow = null;                     // 影子名稱表（只寫有變的格）

  /* ============================== 小工具 ============================== */
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }
  function rev(d) { return (d + 2) & 3; }
  function wrapX(tx) { return ((tx % W) + W) % W; }
  function cell(tx, ty) {
    if (ty < 0 || ty >= H) return '#';
    return g.grid[ty][wrapX(tx)];
  }
  function heroOpen(tx, ty) { var c = cell(tx, ty); return c !== '#' && c !== '-' && c !== 'G'; }
  function aligned(a) { return (((a.x % 8) + 8) % 8) === 0 && (a.y % 8) === 0; }
  function tileOf(a) { return [wrapX(Math.floor((a.x + 4) / 8)), Math.floor((a.y + 4) / 8)]; }
  function key(tx, ty) { return ty * W + wrapX(tx); }

  function put(col, row, tile) {
    var i = row * 32 + col;
    if (shadow[i] === tile) return;
    shadow[i] = tile;
    ppu.setTile(0, col, row, tile);
  }
  function text(col, row, str) {
    for (var i = 0; i < str.length; i++) put(col + i, row, bgB.index(Z.fontName(str.charAt(i))));
  }
  function num(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s.slice(-w); }

  /* ============================== 調色盤 ============================== */
  // pal 0 主角火箭（紅窗 / 橘焰 / 白身）、pal 1 VEX 紫 + MOSS 萊姆綠、pal 2 ORBIT 暗金 + SHARD 白（刻面 / 環 = 淡黃）、pal 3 受驚灰
  var SPR_PALS = [[0x16, 0x27, 0x30], [0x13, 0x2A, 0x30], [0x18, 0x30, 0x38], [0x00, 0x10, 0x30]];
  var SCARE_BLINK = [0x30, 0x10, 0x13];
  // 過關演出：牆色依序掃過一圈星色（不閃白），每 10 幀換一格
  var CLEAR_SWEEP = [[0x14, 0x24], [0x16, 0x26], [0x17, 0x28], [0x18, 0x38], [0x1A, 0x2A], [0x1B, 0x2B], [0x15, 0x25]];
  function mapPal(sweep) {
    var m = Z.MAPS[g.mapIndex];
    if (sweep >= 0) { var c = CLEAR_SWEEP[sweep % CLEAR_SWEEP.length]; return [c[0], c[1], m.wall[2]]; }
    return [m.wall[0], m.wall[1], m.wall[2]];
  }
  function setPals(title) {
    ppu.setBackdrop(0x0F);
    if (title) {
      ppu.setBgPalette(0, [0x04, 0x24, 0x30]);
      ppu.setBgPalette(1, [0x14, 0x04, 0x34]);
      ppu.setBgPalette(2, [0x12, 0x02, 0x3C]);
      ppu.setBgPalette(3, [0x28, 0x18, 0x38]);
    } else {
      ppu.setBgPalette(0, mapPal(-1));
      ppu.setBgPalette(1, [0x16, 0x06, 0x37]);
      ppu.setBgPalette(2, [0x12, 0x02, 0x3C]);
      ppu.setBgPalette(3, [0x28, 0x18, 0x38]);
    }
    for (var i = 0; i < 4; i++) ppu.setSprPalette(i, SPR_PALS[i]);
  }

  /* ============================== CHR ============================== */
  function buildChr() {
    bgB = NES.CHR.bank('maze_bg', Z.BG_TILES);
    spB = NES.CHR.bank('maze_spr', Z.SPR_TILES);
    NES.CHR.setPattern(0, bgB);
    NES.CHR.setPattern(1, spB);
    ppu.setPatternTables(0, 1);
    ppu.spriteMode(8);
    ppu.flicker = 'none';                // 從設計上 ≤ 8 顆，不需要輪替
    T = {};
    var n = spB.names, i;
    for (i = 0; i < n.length; i++) T[n[i]] = spB.index(n[i]);
  }

  /* ============================== 整片重畫 ============================== */
  function clearAll() {
    shadow = new Int16Array(32 * 30);
    for (var i = 0; i < shadow.length; i++) shadow[i] = -1;
    ppu.fillTiles(0, 0, 0, 32, 30, 0);
    for (i = 0; i < shadow.length; i++) shadow[i] = 0;
    ppu.fillAttr(0, 0, 0, 16, 15, 0);
    ppu.clearSprites();
  }
  function wallMask(tx, ty) {
    var m = 0, i;
    for (i = 0; i < 4; i++) {
      var nx = tx + DX[i], ny = ty + DY[i];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      var c = g.grid[ny][nx];
      if (c === '#' || c === '-') m |= (1 << i);
    }
    return m;
  }
  // 星巢範圍（四張共用骨架：x 10..16、y 10..14）：巢牆畫成虛線力場、巢內鋪星砂
  function inNest(tx, ty) { return tx >= 10 && tx <= 16 && ty >= 10 && ty <= 14; }
  function nestMask(tx, ty) {
    var m = 0;
    for (var i = 0; i < 4; i++) {
      var nx = tx + DX[i], ny = ty + DY[i];
      if (!inNest(nx, ny)) continue;
      var c = g.grid[ny][nx];
      if (c === '#' || c === '-') m |= (1 << i);
    }
    return m;
  }
  function cellTile(tx, ty) {
    var c = g.grid[ty][tx];
    if (c === '#' && inNest(tx, ty)) return bgB.index('NW' + nestMask(tx, ty));
    if (c === '#') return bgB.index('W' + wallMask(tx, ty));
    if (c === 'G') return bgB.index('NEST');
    if (c === '-') return bgB.index('DOOR');
    if (c === '.') return bgB.index('DOT');
    if (c === 'o') return bgB.index('STAR');
    return 0;
  }
  function drawMazeFull() {
    clearAll();
    setPals(false);
    var x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) put(OX + x, OY + y, cellTile(x, y));
    drawHudStatic();
    g.hudCache = {};
    drawHud();
  }
  function drawHudStatic() {
    text(2, 1, 'SCORE');
    text(22, 1, 'BEST');
  }
  function drawHud() {
    var c = g.hudCache;
    if (c.score !== g.score) { c.score = g.score; text(2, 2, num(g.score, 6)); }
    if (c.best !== g.best) { c.best = g.best; text(22, 2, num(g.best, 6)); }
    if (c.name !== g.mapIndex) { c.name = g.mapIndex; var nm = Z.MAPS[g.mapIndex].name; while (nm.length < 11) nm = (nm.length & 1) ? nm + ' ' : ' ' + nm; text(10, 2, nm); }
    if (c.lives !== g.lives) {
      c.lives = g.lives;
      for (var i = 0; i < 6; i++) put(2 + i, 26, i < g.lives ? bgB.index('LIFE') : 0);
    }
    if (c.level !== g.level) { c.level = g.level; text(22, 26, 'LV ' + num(g.level, 2)); }
  }
  function msg(str) {          // 上方橫幅訊息（LIFT OFF! / PAUSE / GAME OVER；SCORE 與 BEST 中間）
    var s = str;
    while (s.length < 12) s = (s.length & 1) ? s + ' ' : ' ' + s;
    text(10, 1, s);
  }
  var MENU_HINT = 'HOLD START+SELECT: MENU';
  function hint(on) {          // 底列：暫停時提示回選單的方法（§6-5）
    var s = on ? MENU_HINT : '';
    while (s.length < 26) s += ' ';
    text(3, 27, s);
  }

  /* ============================== 標題 ============================== */
  var BIG = 'MAZE';
  var ROSTER_X = [6, 12, 18, 24];                 // 標題：四隻追兵一排（格），名字寫在正下方
  var ROSTER_INFO = ['VEX   HUNTS YOU DOWN', 'MOSS  CUTS YOU OFF', 'ORBIT GUARDS A CORNER', 'SHARD ROAMS AT RANDOM'];
  function drawTitle() {
    clearAll();
    setPals(true);
    var x, y, i, blk = bgB.index('BLK');
    text(10, 3, '- STARDUST -');
    for (i = 0; i < BIG.length; i++) {
      var rows = Z.GLYPH[BIG.charAt(i)].split(',');
      for (y = 0; y < 7; y++) for (x = 0; x < 5; x++) if (rows[y].charAt(x) === '1') put(4 + i * 6 + x, 5 + y, blk);
    }
    ppu.fillAttr(0, 2, 2, 12, 4, 1);    // 大字 = 紫色立體磚（屬性 1）
    text(8, 14, 'EAT ALL STARDUST');
    for (i = 0; i < 4; i++) { var nm = NAMES[i]; text(ROSTER_X[i] - ((nm.length - 1) >> 1), 18, nm); }
    text(4, 25, 'BEST ' + num(g.best, 6));
    text(3, 27, 'STAR = POWER   C/★ = CHEAT');
    g.titleBlink = 0; g.rosterShown = -1;
  }
  function titleSprites() {
    var f = (g.frames >> 4) & 1;
    for (var i = 0; i < 4; i++) ppu.sprite(SPR_CH + i, { x: ROSTER_X[i] * 8, y: 16 * 8, tile: T[NAMES[i] + f], pal: CH_PAL[i] });
    ppu.sprite(SPR_HERO, { x: 40 + ((g.frames >> 1) % 176), y: 12 * 8 + 4, tile: T['PR' + f], pal: 0 });
    // 輪播說明：每 96 幀換一隻，箭頭精靈指著正在介紹的那隻
    var k = ((g.frames / 96) | 0) & 3;
    ppu.sprite(5, { x: ROSTER_X[k] * 8, y: 17 * 8 + 1 + ((g.frames >> 3) & 1), tile: T.BACK, pal: 0 });
    for (i = 6; i < 8; i++) ppu.sprite(i, null);
    if (g.rosterShown !== k) {
      g.rosterShown = k;
      var s = ROSTER_INFO[k];
      while (s.length < 22) s = (s.length & 1) ? s + ' ' : ' ' + s;
      text(5, 20, s);
    }
  }

  /* ============================== 關卡 ============================== */
  function newRun() {
    g.score = 0; g.lives = START_LIVES; g.level = 1; g.clears = 0; g.extraGiven = false;
    loadLevel(1);
  }
  function loadLevel(n) {
    g.level = n;
    g.mapIndex = (n - 1) % Z.MAPS.length;
    g.lv = Z.level(n);
    g.grid = Z.MAPS[g.mapIndex].rows.map(function (r) { return r.split(''); });
    g.dots = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (g.grid[y][x] === '.' || g.grid[y][x] === 'o') g.dots++;
    g.dotsTotal = g.dots;
    g.eaten = 0;
    g.bonusShown = 0;
    CT.blank(nes0, drawMazeFull);
    resetActors();
    enter('ready', g.level === 1 && g.clears === 0 ? READY_FIRST : READY_AGAIN);
    Z.Audio.play(nes0, 'maze_start');
  }
  function resetActors() {
    var s = Z.START;
    g.hero = { x: s[0] * 8, y: s[1] * 8, dir: 3, want: 3, acc: 0, moving: false, anim: 0 };
    g.chasers = [];
    for (var i = 0; i < 4; i++) {
      var sl = Z.PEN.slots[i];
      g.chasers.push({
        id: i, name: NAMES[i], x: sl[0] * 8, y: sl[1] * 8, dir: i === 0 ? 3 : 0, acc: 0,
        state: i === 0 ? 'out' : 'pen', fright: false, release: g.lv.release[i], anim: 0, wp: 0
      });
    }
    g.frightT = 0; g.combo = 0; g.freeze = 0;
    g.phase = 0; g.phaseT = g.lv.scatter[0];
    g.bonus = null; g.pop = null;
    g.bfs = null; g.bfsKey = -1;
  }
  function enter(mode, frames) { g.mode = mode; g.modeT = frames || 0; g.readyShown = false; }

  /* ============================== 主角 ============================== */
  function heroSpeed() { return g.lv.hero; }
  function inputDir() {
    var I = NES.Input, i;
    // 最後按下的方向優先；其次按住中的
    for (i = 0; i < 4; i++) if (I.pressed(DIRBTN[i])) { g.lastPress = i; }
    if (g.lastPress >= 0 && I.held(DIRBTN[g.lastPress])) return g.lastPress;
    for (i = 0; i < 4; i++) if (I.held(DIRBTN[i])) return i;
    return -1;
  }
  function heroStep(h) {
    if (aligned(h)) {
      var t = tileOf(h);
      eatAt(t[0], t[1]);
      if (h.want >= 0 && heroOpen(t[0] + DX[h.want], t[1] + DY[h.want])) h.dir = h.want;
      if (!heroOpen(t[0] + DX[h.dir], t[1] + DY[h.dir])) { h.moving = false; return false; }
    } else if (h.want === rev(h.dir)) {
      h.dir = h.want;
    }
    h.x += DX[h.dir]; h.y += DY[h.dir];
    if (h.x <= -8) h.x += W * 8;
    if (h.x >= W * 8) h.x -= W * 8;
    h.moving = true;
    return true;
  }
  function moveHero() {
    var h = g.hero;
    var d = inputDir();
    if (d >= 0) h.want = d;
    h.acc += heroSpeed();
    var n = h.acc >> 8; h.acc &= 255;
    for (var i = 0; i < n; i++) if (!heroStep(h)) { h.acc = 0; break; }
    if (h.moving) h.anim++;
  }
  function eatAt(tx, ty) {
    var c = cell(tx, ty);
    if (c !== '.' && c !== 'o') return;
    g.grid[ty][tx] = ' ';
    put(OX + tx, OY + ty, 0);
    g.dots--; g.eaten++; g.botEatF = g.playFrames;
    if (c === '.') { addScore(10); Z.Audio.sfx(nes0, (g.eaten & 1) ? 'maze_dot' : 'maze_dot2'); }
    else { addScore(50); startFright(); Z.Audio.sfx(nes0, 'maze_star'); }
    if (g.bonusShown < Z.BONUS_AT.length && g.eaten >= Z.BONUS_AT[g.bonusShown]) {
      g.bonusShown++;
      var b = Z.BONUS[Math.min(Z.BONUS.length - 1, g.level - 1)];
      g.bonus = { tile: b.tile, score: b.score, t: Z.BONUS_FRAMES };
    }
  }
  function addScore(n) {
    g.score += n;
    if (!g.extraGiven && g.score >= EXTRA_AT) { g.extraGiven = true; g.lives = Math.min(9, g.lives + 1); Z.Audio.sfx(nes0, 'maze_1up'); }
    if (g.score > g.best) g.best = g.score;
  }
  function startFright() {
    g.frightT = g.lv.fright; g.combo = 0;
    for (var i = 0; i < 4; i++) {
      var c = g.chasers[i];
      if (c.state === 'eyes' || c.state === 'enter') continue;
      c.fright = g.frightT > 0;
      if (c.state === 'out') c.dir = rev(c.dir);
    }
    if (g.frightT > 0) Z.Audio.play(nes0, 'maze_fright');
  }

  /* ============================== 追兵 ============================== */
  function chaserOpen(tx, ty) { var c = cell(tx, ty); return c !== '#' && c !== '-' && c !== 'G'; }
  function bfsFrom(tx, ty) {
    var k0 = key(tx, ty);
    if (g.bfsKey === k0 && g.bfs) return g.bfs;
    var d = new Int16Array(W * H), q = new Int16Array(W * H), qh = 0, qt = 0, i;
    for (i = 0; i < d.length; i++) d[i] = 9999;
    d[k0] = 0; q[qt++] = k0;
    while (qh < qt) {
      var k = q[qh++], x = k % W, y = (k / W) | 0;
      for (i = 0; i < 4; i++) {
        var nx = wrapX(x + DX[i]), ny = y + DY[i];
        if (ny < 0 || ny >= H || !chaserOpen(nx, ny)) continue;
        var nk = ny * W + nx;
        if (d[nk] > d[k] + 1) { d[nk] = d[k] + 1; q[qt++] = nk; }
      }
    }
    g.bfs = d; g.bfsKey = k0;
    return d;
  }
  function junction(tx, ty) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (chaserOpen(tx + DX[i], ty + DY[i])) n++;
    return n >= 3;
  }
  var QUAD = [[[1, 1], [11, 1], [11, 7], [1, 7]], [[25, 1], [25, 7], [15, 7], [15, 1]],
              [[25, 21], [15, 21], [15, 15], [25, 15]], [[1, 21], [1, 15], [11, 15], [11, 21]]];
  function chaseTarget(c) {
    var ht = tileOf(g.hero), h = g.hero;
    if (g.phase % 2 === 0 && g.phase < g.lv.scatter.length) return HOME[c.id];   // 散開波
    if (c.id === 1) {
      // 霧鏡：沿主角方向走到下一個路口
      var x = ht[0], y = ht[1], s;
      for (s = 0; s < 10; s++) {
        if (!heroOpen(x + DX[h.dir], y + DY[h.dir])) break;
        x = wrapX(x + DX[h.dir]); y += DY[h.dir];
        if (s >= 1 && junction(x, y)) break;
      }
      return [x, y];
    }
    if (c.id === 2) {
      var ct = tileOf(c), q = QUAD[(g.level - 1) & 3];
      var md = Math.abs(ct[0] - ht[0]) + Math.abs(ct[1] - ht[1]);
      if (md <= 8) return ht;
      var wp = q[c.wp & 3];
      if (Math.abs(ct[0] - wp[0]) + Math.abs(ct[1] - wp[1]) <= 2) { c.wp++; wp = q[c.wp & 3]; }
      return wp;
    }
    return ht;
  }
  function chooseDir(c) {
    var t = tileOf(c), tx = t[0], ty = t[1], opts = [], i;
    for (i = 0; i < 4; i++) {
      if (i === rev(c.dir)) continue;
      if (chaserOpen(tx + DX[i], ty + DY[i])) opts.push(i);
    }
    if (!opts.length) return rev(c.dir);
    if (opts.length === 1) return opts[0];
    if (c.state === 'eyes') return greedy(opts, tx, ty, Z.PEN.exit);
    if (c.fright) return opts[rnd() % opts.length];
    var scatter = g.phase % 2 === 0 && g.phase < g.lv.scatter.length;
    if (c.id === 0 && !scatter) {
      var ht = tileOf(g.hero), d = bfsFrom(ht[0], ht[1]), best = opts[0], bv = 1e9;
      for (i = 0; i < opts.length; i++) {
        var v = d[key(tx + DX[opts[i]], ty + DY[opts[i]])];
        if (v < bv) { bv = v; best = opts[i]; }
      }
      return best;
    }
    if (c.id === 3 && !scatter && (rnd() & 1)) return opts[rnd() % opts.length];
    return greedy(opts, tx, ty, chaseTarget(c));
  }
  function greedy(opts, tx, ty, tg) {
    var best = opts[0], bv = 1e9;
    for (var i = 0; i < opts.length; i++) {
      var nx = tx + DX[opts[i]], ny = ty + DY[opts[i]];
      var dx = nx - tg[0], dy = ny - tg[1], v = dx * dx + dy * dy;
      if (v < bv) { bv = v; best = opts[i]; }
    }
    return best;
  }
  function chaserSpeed(c) {
    if (c.state === 'eyes' || c.state === 'enter') return 560;
    if (c.state === 'pen') return 96;
    if (c.state === 'leave') return 128;
    var t = tileOf(c);
    if (t[1] === Z.TUNNEL_ROW && (t[0] <= 4 || t[0] >= W - 5)) return g.lv.tunnel;
    if (c.fright) return 150;
    return g.lv.chase + (g.dots <= 20 ? 24 : 0);
  }
  function chaserStep(c) {
    var ex = Z.PEN.exit[0] * 8, ey = Z.PEN.exit[1] * 8;
    if (c.state === 'pen') {
      var base = Z.PEN.slots[c.id][1] * 8;
      c.y += (c.dir === 0) ? -1 : 1;
      if (c.y <= base - 3) c.dir = 2;
      if (c.y >= base + 3) c.dir = 0;
      return;
    }
    if (c.state === 'leave') {
      if (c.x !== ex) { c.x += c.x < ex ? 1 : -1; return; }
      if (c.y > ey) { c.y--; return; }
      c.state = 'out'; c.dir = (rnd() & 1) ? 1 : 3;
      return;
    }
    if (c.state === 'enter') {
      if (c.y < 12 * 8) { c.y++; return; }
      c.state = 'leave'; c.fright = false;
      return;
    }
    if (aligned(c)) {
      var t = tileOf(c);
      if (c.state === 'eyes' && t[0] === Z.PEN.exit[0] && t[1] === Z.PEN.exit[1]) { c.state = 'enter'; return; }
      c.dir = chooseDir(c);
      if (!chaserOpen(t[0] + DX[c.dir], t[1] + DY[c.dir])) return;
    }
    c.x += DX[c.dir]; c.y += DY[c.dir];
    if (c.x <= -8) c.x += W * 8;
    if (c.x >= W * 8) c.x -= W * 8;
  }
  function moveChasers() {
    for (var i = 0; i < 4; i++) {
      var c = g.chasers[i];
      if (c.state === 'pen') {
        if (c.release > 0) c.release--;
        else { c.state = 'leave'; }
      }
      c.acc += chaserSpeed(c);
      var n = c.acc >> 8; c.acc &= 255;
      for (var k = 0; k < n; k++) chaserStep(c);
      c.anim++;
    }
  }
  function tickPhase() {
    if (g.frightT > 0) return;           // 受驚期間波次計時暫停
    if (g.phase >= g.lv.scatter.length) return;
    if (--g.phaseT > 0) return;
    g.phase++;
    if (g.phase < g.lv.scatter.length) g.phaseT = g.lv.scatter[g.phase];
    for (var i = 0; i < 4; i++) if (g.chasers[i].state === 'out' && !g.chasers[i].fright) g.chasers[i].dir = rev(g.chasers[i].dir);
  }
  function tickFright() {
    if (g.frightT <= 0) return;
    if (--g.frightT === 0) {
      for (var i = 0; i < 4; i++) g.chasers[i].fright = false;
      Z.Audio.play(nes0, 'maze_stage');
    }
  }
  function collide() {
    var h = g.hero;
    for (var i = 0; i < 4; i++) {
      var c = g.chasers[i];
      if (c.state !== 'out' && c.state !== 'leave') continue;
      var dx = Math.abs(c.x - h.x), dy = Math.abs(c.y - h.y);
      if (dx > W * 4) dx = W * 8 - dx;          // 隧道環繞距離
      if (dx >= 6 || dy >= 6) continue;
      if (c.fright) {
        var pts = 200 << Math.min(3, g.combo);
        g.combo++;
        addScore(pts);
        c.state = 'eyes'; c.fright = false;
        g.freeze = EAT_FREEZE;
        g.pop = { x: c.x - 4, y: c.y, score: String(pts), t: POP_FRAMES, hideHero: true };
        Z.Audio.sfx(nes0, 'maze_eat');
        return;
      }
      if (g.god) continue;
      die();
      return;
    }
    if (g.bonus) {
      var bx = Z.BONUS_TILE[0] * 8, by = Z.BONUS_TILE[1] * 8;
      if (Math.abs(bx - h.x) < 6 && Math.abs(by - h.y) < 6) {
        addScore(g.bonus.score);
        g.pop = { x: bx - 4, y: by, score: String(g.bonus.score), t: POP_FRAMES, hideHero: false };
        g.bonus = null;
        g.bonusGot = (g.bonusGot || 0) + 1;
        Z.Audio.sfx(nes0, 'maze_bonus');
      }
    }
  }
  function die() {
    g.deaths++;
    if (CT.botOn) {
      (g.deathLog = g.deathLog || []).push({ f: g.playFrames, lv: g.level, hero: tileOf(g.hero), hx: g.hero.x, hy: g.hero.y, dir: g.hero.dir, info: g.botInfo,
        ch: g.chasers.map(function (c) { return [c.name, c.state, c.x, c.y, c.dir]; }) });
    }
    enter('dying', DIE_FRAMES);
    g.bonus = null; g.pop = null;
    Z.Audio.stop(nes0);
    Z.Audio.sfx(nes0, 'maze_die');
  }

  /* ============================== 一鍵密技 ============================== */
  function doCheat() {
    if (!g) return false;
    if (g.mode === 'over') {
      // §6-1 原地續關：同一關、保留分數與已吃掉的星屑，命數回到開局值
      g.cheats++;
      g.lives = START_LIVES;
      g.paused = false;
      msg(''); hint(false);
      ppu.setBgPalette(0, mapPal(-1));
      resetActors();
      enter('ready', READY_AGAIN);
      Z.Audio.play(nes0, 'maze_start');
      return true;
    }
    if (g.mode !== 'play' && g.mode !== 'ready' && g.mode !== 'dying') return false;
    g.cheats++;
    g.lives = Math.min(9, g.lives + 1);
    if (g.mode === 'play') { g.frightT = 0; startFright(); }
    return true;
  }
  function saveBest() {
    var b = Math.max(g.best, g.score);
    if (b > CT.load('maze', 'best', 0)) CT.save('maze', 'best', b);
  }

  /* ============================== update ============================== */
  function update(nes) {
    Z.Audio.tick(nes);
    g.frames++;
    if (g.cheatReq) { g.cheatReq = false; doCheat(); }
    var I = NES.Input;
    if (g.mode === 'title') {
      if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) { Z.Audio.stop(nes0); newRun(); }
      return;
    }
    if (g.mode === 'play' && I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      msg(g.paused ? 'PAUSE' : '');
      hint(g.paused);
      if (g.paused) Z.Audio.pause(nes0); else Z.Audio.resume(nes0);
      Z.Audio.sfx(nes0, 'maze_pause');
      return;
    }
    if (g.paused) return;
    if (g.modeT > 0) g.modeT--;
    switch (g.mode) {
      case 'ready':
        if (!g.readyShown) { g.readyShown = true; msg('LIFT OFF!'); }
        if (g.modeT <= 0) { msg(''); enter('play'); Z.Audio.play(nes0, 'maze_stage'); }
        break;
      case 'play':
        g.playFrames++;
        if (g.freeze > 0) { g.freeze--; break; }
        moveHero();
        moveChasers();
        tickPhase();
        tickFright();
        collide();
        if (g.mode !== 'play') break;
        if (g.bonus && --g.bonus.t <= 0) g.bonus = null;
        if (g.dots <= 0) {
          enter('clear', CLEAR_FRAMES);
          g.clears++;
          g.pop = null; g.bonus = null;
          Z.Audio.play(nes0, 'maze_clear');
        }
        break;
      case 'dying':
        if (g.modeT <= 0) {
          g.lives--;
          if (g.lives < 0) {
            g.lives = 0;
            enter('over', OVER_FRAMES);
            msg('GAME OVER');
            saveBest();
            Z.Audio.play(nes0, 'maze_over');
          } else {
            resetActors();
            enter('ready', READY_AGAIN);
            Z.Audio.play(nes0, 'maze_start');
          }
        }
        break;
      case 'clear':
        // 牆色彩虹掃過（每 10 幀換一次調色盤 = 3 byte；最後 20 幀回原色）
        if (g.modeT % 10 === 0) ppu.setBgPalette(0, mapPal(g.modeT > 20 ? ((CLEAR_FRAMES - g.modeT) / 10) | 0 : -1));
        if (g.modeT === CLEAR_FRAMES - 30) msg('SECTOR CLEAR');
        if (g.modeT <= 0) {
          saveBest();
          loadLevel(g.level + 1);
        }
        break;
      case 'over':
        if (g.modeT <= 0) toTitle();
        break;
    }
    if (g.pop && --g.pop.t <= 0) g.pop = null;
  }
  function toTitle() {
    saveBest();
    enter('title');
    g.paused = false;
    CT.blank(nes0, drawTitle);
    Z.Audio.play(nes0, 'maze_title');
  }

  /* ============================== draw ============================== */
  function sprAt(i, x, y, tile, pal, fh, fv) {
    if (x < 0 || x > (W - 1) * 8) { ppu.sprite(i, null); return; }
    ppu.sprite(i, { x: OX * 8 + x, y: OY * 8 + y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv });
  }
  function draw() {
    if (g.mode === 'title') {
      titleSprites();
      var on = ((g.frames >> 5) & 1) === 0;
      text(11, 22, on ? 'PUSH START' : '          ');
      return;
    }
    drawHud();
    // 能量星閃爍（每 12 幀；每顆 1 byte）
    var starOn = ((g.frames / 12) | 0) & 1, x, y;
    if (g.frames % 12 === 0 && g.mode !== 'title') {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (g.grid[y][x] === 'o') put(OX + x, OY + y, bgB.index(starOn || g.mode !== 'play' ? 'STAR' : 'STAR2'));
    }
    var h = g.hero, f = (h.anim >> 3) & 1;
    // 主角
    if (g.mode === 'dying') {
      var k = DIE_FRAMES - g.modeT, df = Math.min(3, (k / 20) | 0);
      if (k < 20) sprAt(SPR_HERO, h.x, h.y, T['PR' + f], 0, h.dir === 3, false);
      else if (k < 100) sprAt(SPR_HERO, h.x, h.y, T['PX' + df], 0);
      else ppu.sprite(SPR_HERO, null);
    } else if (g.pop && g.pop.hideHero && g.freeze > 0) {
      ppu.sprite(SPR_HERO, null);
    } else {
      var vert = h.dir === 0 || h.dir === 2;
      sprAt(SPR_HERO, h.x, h.y, T[(vert ? 'PD' : 'PR') + f], 0, h.dir === 3, h.dir === 0);
    }
    // 追兵
    var hideCh = g.mode === 'dying' && (DIE_FRAMES - g.modeT) >= 20 || g.mode === 'clear';
    var blink = g.frightT > 0 && g.frightT < 120 && ((g.frightT >> 3) & 1);
    ppu.setSprPalette(3, blink ? SCARE_BLINK : SPR_PALS[3]);
    for (var i = 0; i < 4; i++) {
      var c = g.chasers[i], cf = (c.anim >> 3) & 1;
      if (hideCh) { ppu.sprite(SPR_CH + i, null); continue; }
      if (c.state === 'eyes' || c.state === 'enter') sprAt(SPR_CH + i, c.x, c.y, T.CORE, 3);
      else if (c.fright) sprAt(SPR_CH + i, c.x, c.y, T['SCARE' + cf], 3);
      else sprAt(SPR_CH + i, c.x, c.y, T[NAMES[i] + cf], CH_PAL[i], c.dir === 3);
    }
    // 獎勵
    if (g.bonus && g.mode === 'play') sprAt(SPR_BONUS, Z.BONUS_TILE[0] * 8, Z.BONUS_TILE[1] * 8, T[g.bonus.tile], 0);
    else ppu.sprite(SPR_BONUS, null);
    // 分數牌
    if (g.pop) {
      var nm = 'N' + g.pop.score;
      sprAt(SPR_POP, g.pop.x, g.pop.y, T[nm + 'L'], 0);
      sprAt(SPR_POP + 1, g.pop.x + 8, g.pop.y, T[nm + 'R'], 0);
    } else { ppu.sprite(SPR_POP, null); ppu.sprite(SPR_POP + 1, null); }
  }

  /* ============================== 機器人（?bot=1） ============================== */
  // 每個決策點：多源 BFS 算「追兵最快幾步到」→ 只走「我比追兵早 ≥ 2 步到」的安全格，找最近的
  // 獵物（受驚追兵）/ 能量星（被逼近時）/ 星屑；找不到就往追兵最遠的方向逃。
  function threatMap() {
    // 每隻追兵各跑一次 BFS：第一步不能掉頭（追兵只在路口轉向、不回頭）⇒ 跟在追兵身後是安全的
    var d = new Int16Array(W * H), one = new Int16Array(W * H), q = new Int16Array(W * H), i, j;
    for (i = 0; i < d.length; i++) d[i] = 9999;
    for (j = 0; j < 4; j++) {
      var c = g.chasers[j], t, noBack = -1;
      if (c.state === 'out' && (!c.fright || g.frightT < 90)) { t = tileOf(c); noBack = rev(c.dir); }
      else if (c.state === 'leave' || (c.state === 'pen' && c.release < 40) || c.state === 'enter') t = Z.PEN.exit;
      else continue;
      for (i = 0; i < one.length; i++) one[i] = 9999;
      var qh = 0, qt = 0, k0 = key(t[0], t[1]);
      one[k0] = 0; q[qt++] = k0;
      while (qh < qt) {
        var kk = q[qh++], x = kk % W, y = (kk / W) | 0;
        for (i = 0; i < 4; i++) {
          if (kk === k0 && i === noBack) continue;
          var nx = wrapX(x + DX[i]), ny = y + DY[i];
          if (ny < 0 || ny >= H || !chaserOpen(nx, ny)) continue;
          var nk = ny * W + nx;
          if (one[nk] > one[kk] + 1) { one[nk] = one[kk] + 1; q[qt++] = nk; }
        }
      }
      for (i = 0; i < d.length; i++) if (one[i] < d[i]) d[i] = one[i];
    }
    return d;
  }
  function botSearch(sx, sy, cd, prey, margin) {
    var dist = new Int16Array(W * H), first = new Int8Array(W * H), q = new Int16Array(W * H), qh = 0, qt = 0, i;
    for (i = 0; i < dist.length; i++) dist[i] = -1;
    var k0 = key(sx, sy);
    dist[k0] = 0; first[k0] = -1; q[qt++] = k0;
    var r = { dot: -1, star: -1, prey: -1, safe: -1, safeV: -1e9, dist: dist, first: first };
    var framesPerTile = Math.ceil(8 * 256 / heroSpeed());
    var ratio = heroSpeed() / (g.lv.chase + (g.dots <= 20 ? 24 : 0));
    while (qh < qt) {
      var k = q[qh++], x = k % W, y = (k / W) | 0, cc = g.grid[y][x];
      if (k !== k0) {
        if (prey[k] && r.prey < 0 && dist[k] * framesPerTile < g.frightT - 30) r.prey = k;
        if (cc === 'o' && r.star < 0) r.star = k;
        if ((cc === '.' || cc === 'o') && r.dot < 0) r.dot = k;
        var sv = Math.min(cd[k] - dist[k], 12) * 8 - dist[k];
        if (sv > r.safeV) { r.safeV = sv; r.safe = k; }
      }
      for (i = 0; i < 4; i++) {
        var nx = wrapX(x + DX[i]), ny = y + DY[i];
        if (ny < 0 || ny >= H || !heroOpen(nx, ny)) continue;
        var nk = ny * W + nx;
        if (dist[nk] >= 0) continue;
        var nd = dist[k] + 1;
        if (cd[nk] * ratio - nd < margin && !prey[nk]) continue;     // 追兵會先到 / 同時到 ⇒ 不走（換算成主角的格數）
        dist[nk] = nd; first[nk] = (k === k0) ? i : first[k];
        q[qt++] = nk;
      }
    }
    return r;
  }
  function botPlan() {
    var h = g.hero, t = tileOf(h), sx = t[0], sy = t[1], i;
    var cd = threatMap();
    if (!aligned(h) && h.moving) {
      // 半路上：預設從「前方那格」規劃；前方那格太危險就從「身後那格」規劃（= 立刻掉頭）
      var ax = wrapX(Math.floor(h.x / 8) + (DX[h.dir] > 0 ? 1 : 0)), ay = Math.floor(h.y / 8) + (DY[h.dir] > 0 ? 1 : 0);
      var bx = wrapX(ax - DX[h.dir]), by = ay - DY[h.dir];
      if (cd[key(ax, ay)] <= 1 && cd[key(bx, by)] > cd[key(ax, ay)]) { sx = bx; sy = by; }
      else { sx = ax; sy = ay; }
    }
    var near = cd[key(t[0], t[1])];
    var prey = {};
    for (i = 0; i < 4; i++) {
      var c = g.chasers[i];
      if (c.state === 'out' && c.fright && g.frightT > 60) { var ct = tileOf(c); prey[key(ct[0], ct[1])] = 1; }
    }
    var stale = g.playFrames - (g.botEatF || 0) > 900;
    var want = near <= 7 && g.frightT === 0;
    var r = null, goal = -1, m;
    var margins = stale ? [2, 1] : [3, 2];
    for (m = 0; m < margins.length && goal < 0; m++) {
      r = botSearch(sx, sy, cd, prey, margins[m]);
      goal = r.prey >= 0 ? r.prey : (want && r.star >= 0) ? r.star : r.dot;
      if (goal >= 0 && r.first[goal] < 0) goal = -1;
    }
    if (goal < 0) {
      // 安全範圍內沒有星屑：朝最近的星屑走「一步」，只要那一步本身夠安全（每格都重新評估）
      var r2 = botSearch(sx, sy, cd, prey, -999), g2 = r2.dot;
      if (g2 >= 0 && r2.first[g2] >= 0) {
        var fd = r2.first[g2], fk = key(sx + DX[fd], sy + DY[fd]);
        if (cd[fk] >= 3) { r = r2; goal = g2; }
      }
    }
    if (goal < 0 && r && r.safe >= 0 && r.first[r.safe] >= 0) goal = r.safe;
    g.botInfo = { near: near, goal: goal, from: [sx, sy] };
    if (goal >= 0) return r.first[goal];
    var bd = -1, bv = -1;
    for (i = 0; i < 4; i++) {
      var ex = wrapX(sx + DX[i]), ey = sy + DY[i];
      if (ey < 0 || ey >= H || !heroOpen(ex, ey)) continue;
      var v = cd[key(ex, ey)] * 4 + (i === h.dir ? 1 : 0);
      if (v > bv) { bv = v; bd = i; }
    }
    return bd;
  }
  function bot() {
    if (!g) return null;
    if (g.mode === 'title') return (g.frames % 10) === 0 ? BTN.START : null;
    if (g.mode !== 'play' || g.paused) return null;
    var d = botPlan();
    return d >= 0 ? DIRBTN[d] : null;
  }

  /* ============================== 註冊 ============================== */
  function newState() {
    return {
      mode: 'title', modeT: 0, frames: 0, playFrames: 0, paused: false, seed: 20261113,
      score: 0, best: CT.load('maze', 'best', 0), lives: 3, level: 1, clears: 0, deaths: 0, cheats: 0,
      mapIndex: 0, lv: Z.level(1), grid: null, dots: 0, hero: null, chasers: [], hudCache: {},
      lastPress: -1, cheatReq: false, god: false
    };
  }
  var game = {
    id: 'maze', order: 1, title: '星塵迷宮', legacy: ['pacman.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu = nes.ppu;
      g = newState();
      buildChr();
      Z.Audio.init(nes);
      var lv = parseInt(CT.query('level') || '0', 10);
      drawTitle();
      enter('title');
      if (lv > 0) { newRun(); loadLevel(lv); } else Z.Audio.play(nes0, 'maze_title');
    },
    update: update,
    draw: function () { draw(); },
    exit: function () { if (g) saveBest(); Z.Audio.stop(nes0); },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, paused: g.paused, level: g.level, map: g.mapIndex, mapName: Z.MAPS[g.mapIndex].name,
        score: g.score, best: g.best, lives: g.lives, dots: g.dots, dotsTotal: g.dotsTotal, clears: g.clears,
        deaths: g.deaths, cheats: g.cheats, frightT: g.frightT, phase: g.phase, frames: g.frames, playFrames: g.playFrames,
        hero: g.hero ? { x: g.hero.x, y: g.hero.y, t: tileOf(g.hero), dir: g.hero.dir } : null,
        chasers: g.chasers.map(function (c) { return { name: c.name, state: c.state, fright: c.fright, x: c.x, y: c.y, t: tileOf(c), dir: c.dir }; }),
        bonus: g.bonus ? g.bonus.tile : null, bonusGot: g.bonusGot || 0, song: Z.Audio.current
      };
    },
    cheat: function () {
      // §6-1：遊玩中 = 補強；GAME OVER = 原地續關；標題 / 說明畫面無效（P3-7）
      if (!g || (g.mode !== 'play' && g.mode !== 'ready' && g.mode !== 'dying' && g.mode !== 'over')) return false;
      g.cheatReq = true;
      return true;
    },
    // §6-4：回選單提示用自己的實心小星（8×8 模式、pal 0 白）
    get backTile() { return { tile: spB ? spB.index('BACK') : Object.keys(Z.SPR_TILES).indexOf('BACK'), pal: 0 }; },
    bot: bot,
    goal: function () { return !!g && g.clears >= 3 && g.cheats === 0; },
    bestText: function () { return num(Math.min(999999, CT.load('maze', 'best', 0)), 6); }   // R6 §1-6：右對齊 6 字元（超過封頂）
  };
  CT.register(game);

  /* 測試鉤子（test_maze.py 用；遊戲本身不呼叫） */
  Z.dev = {
    g: function () { return g; },
    god: function (on) { g.god = on !== false; return g.god; },
    eatAllBut: function (n) {
      var left = 0, y, x;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var c = g.grid[y][x];
        if (c !== '.' && c !== 'o') continue;
        if (left < n) { left++; continue; }
        g.grid[y][x] = ' '; put(OX + x, OY + y, 0); g.dots--; g.eaten++;
      }
      return g.dots;
    },
    warp: function (tx, ty) { g.hero.x = tx * 8; g.hero.y = ty * 8; g.hero.acc = 0; return tileOf(g.hero); },
    chaser: function (i, tx, ty, state) {
      var c = g.chasers[i]; c.x = tx * 8; c.y = ty * 8; c.acc = 0; if (state) c.state = state; return tileOf(c);
    },
    park: function () {         // 追兵全關回巢（量手感用）
      for (var i = 0; i < 4; i++) { var c = g.chasers[i], s = Z.PEN.slots[Math.max(1, i)]; c.state = 'pen'; c.release = 99999; c.x = s[0] * 8; c.y = s[1] * 8; }
    },
    fright: function () { startFright(); return g.frightT; },
    chooseDir: function (i) { return chooseDir(g.chasers[i]); },
    target: function (i) { return chaseTarget(g.chasers[i]); },
    setPhase: function (p) { g.phase = p; g.phaseT = 99999; },
    plan: function () { return botPlan(); },
    threat: function () { return Array.from(threatMap()); },
    level: function (n) { loadLevel(n); return g.level; },
    wallMask: wallMask, cell: function (x, y) { return cell(x, y); },
    shadowAt: function (c, r) { return shadow[r * 32 + c]; },
    bg: function () { return bgB; }, spr: function () { return spB; },
    // 把名稱表某一列（影子）解回字串（非字型磚 = '?'、空白 = ' '）——測試讀畫面字樣用
    rowText: function (r, c0, c1) {
      var out = '', names = bgB.names, c;
      for (c = c0 || 0; c < (c1 === undefined ? 32 : c1); c++) {
        var t = shadow[r * 32 + c], nm = t >= 0 ? names[t] : '';
        out += t === 0 ? ' ' : (nm && nm.indexOf('F_') === 0) ? nm.slice(2) : '?';
      }
      return out;
    },
    CLEAR_SWEEP: CLEAR_SWEEP, SPR_PALS: SPR_PALS, NAMES: NAMES
  };
})();
