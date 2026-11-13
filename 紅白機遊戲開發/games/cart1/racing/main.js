/*
 * games/cart1/racing/main.js — 《星塵賽車》（合輯槽 6，id = racing，全域只用 CT.Racing）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-4 cart1-strategy agent（R5）｜ 依賴：racing/{chr,tracks,song}.js、engine/*、games/cart1/registry.js
 *
 * 視角：**俯視縱向捲軸**（不是偽 3D）。理由：engine/ppu.js 的 split 每幀只有「一個」分割點
 * （ENGINE_API §7，`_split` 單一物件），沒有逐掃描線捲動 / HBlank IRQ 鏈，偽 3D 的「每條線不同
 * x 位移」做不出來；engine 不准改 ⇒ 依 brief 改走俯視捲軸（PROGRESS 偏離節有寫）。
 *
 * 畫面結構
 *   - 名稱表 0 = 賽道環（30 列 × 8 px = 240 px）。**垂直鏡像 'v'** 下，y 捲動在 240 處繞回同一張表
 *     （ppu.js `_bgLine`：'v' 時實體表只看左右）⇒ 一張表就是一條無限縱向捲軸。往前開 = 往上捲，
 *     每幀最多露出 1 列 ⇒ 寫 32 磚 + 16 屬性 = 48 byte（< 160 預算）。
 *   - 名稱表 1 第 26~28 列 = HUD；`split(208, {y:208, nt:1})` 把畫面下方 24 線切到 HUD（只寫有變的字）。
 *   - 精靈 = 只有車（8×16 模式，16×16 = 2 顆）。**每線 ≤ 8 的設計保證**：同一條掃描線最多 4 台車
 *     （enforceBands：第 5 台要擠進同一帶時，物理上被擋在後面＝讓車），6 台 × 2 顆不會超過 8。
 *   - 道具（油漬 / 角錐 / 落石 / 加速板 / 氮氣罐 / 沙地 / 冰面）全是背景磚，吃掉氮氣罐 = 改 1 個磚。
 *
 * 流程：title → howto → intro（賽道介紹）→ race（倒數 3-2-1 → 3 圈 → 終點）→ result →
 *       前 3 名 = 下一條賽道 / 第 4 名以後 = 用接關重跑（3 次）→ 三條都前 3 = champ（大獎賽冠軍）→ title
 * 操作：A 油門 / B 氮氣 / ↓ 煞車 / ←→ 轉向 / START 暫停
 * 密技 cheat()（brief §6-1）：比賽中 = 氮氣補滿 9 + 立刻 2 秒超級加速；失敗結算（第 4 名以後的結果畫面 / GAME OVER）
 *   = **原地續關**：立刻重跑同一條賽道（大獎賽積分保留、這場的點數不計、接關補回 3）；標題 / 說明 / 介紹畫面無效。
 *   用過密技的那一場大獎賽 goal() 一律 false（從標題重開才歸零）。
 * 暫停 = BGM 停、解除暫停接續播；exit() 也存最高分；backTile = 8×16 精靈表裡的實心星鑽（回選單提示用）
 * 網址：`?game=racing&track=1..3`（直接開某條賽道，測試用）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var R = CT.Racing = CT.Racing || {};
  var BTN = NES.Input.BTN;
  var Art = R.Art, Audio = R.Audio;

  /* ============================== 常數 ============================== */
  var RING = 30, SPLIT = 208, PY = 160;          // 玩家車中心固定在螢幕 y = 160
  var TOP = 896, BOOST_TOP = 1280, GRASS_TOP = 400, CURB_TOP = 760, SAND_TOP = 520;
  var STEER = 300, MAX_BAND = 4, HIDE_Y = 192;
  var CAR_HW = 6, CAR_HH = 7;
  var POINTS = [9, 6, 4, 3, 2, 1];
  var NAMES = ['YOU', 'NOVA', 'ORBIT', 'COMET', 'PULSAR', 'QUASAR'];
  var CONTINUES = 3;
  var COUNT_FRAMES = 180;

  var nes0 = null, ppu = null, g = null;

  function mod(a, n) { a %= n; return a < 0 ? a + n : a; }
  function fl8(v) { return Math.floor(v / 256); }      // 8.8 → 整數 px（負數也對）
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }

  function newGame() {
    return {
      mode: 'title', t: 0, frames: 0, ti: 0, tb: null, track: null,
      cars: [], player: null, raceT: 0, phase: 'count', finishT: 0, order: [],
      points: 0, continues: CONTINUES, cleared: [false, false, false], placeLog: [],
      paused: false, rowTop: 0, hud: null, hudCur: null, collected: {},
      bandPushes: 0, maxBandCars: 0, cheats: 0, champion: false, lastPlace: 0,
      crashCool: 0, resultSel: 0, maxRowBytes: 0
    };
  }

  /* ============================== 畫面工具 ============================== */
  function put(nt, col, row, str, hud) {
    var t = Art.text(str, hud), i;
    for (i = 0; i < t.length && col + i < 32; i++) ppu.setTile(nt, col + i, row, t[i]);
  }
  function center(nt, row, str) { put(nt, Math.max(0, (32 - str.length) >> 1), row, str); }
  function frame(nt, c0, r0, w, h) {
    var c, r, B = Art.bg;
    for (c = c0 + 1; c < c0 + w - 1; c++) { ppu.setTile(nt, c, r0, B('FR_H')); ppu.setTile(nt, c, r0 + h - 1, B('FR_H')); }
    for (r = r0 + 1; r < r0 + h - 1; r++) { ppu.setTile(nt, c0, r, B('FR_V')); ppu.setTile(nt, c0 + w - 1, r, B('FR_V')); }
    ppu.setTile(nt, c0, r0, B('FR_TL')); ppu.setTile(nt, c0 + w - 1, r0, B('FR_TR'));
    ppu.setTile(nt, c0, r0 + h - 1, B('FR_BL')); ppu.setTile(nt, c0 + w - 1, r0 + h - 1, B('FR_BR'));
  }
  function logo(col, row) {                // 「星塵賽車」16×16 字 ×4
    Art.glyphNames.forEach(function (n, i) {
      var c = col + i * 3;
      ppu.setTile(0, c, row, Art.bg('G_' + n + '_0')); ppu.setTile(0, c + 1, row, Art.bg('G_' + n + '_1'));
      ppu.setTile(0, c, row + 1, Art.bg('G_' + n + '_2')); ppu.setTile(0, c + 1, row + 1, Art.bg('G_' + n + '_3'));
    });
  }
  function clearScreen() {
    ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, Art.bg('SP')); ppu.fillTiles(1, 0, 0, 32, 30, Art.bg('SP'));
    ppu.fillAttr(0, 0, 0, 16, 15, 0); ppu.fillAttr(1, 0, 0, 16, 15, 0);
    hideSprites(0);
  }
  function screenPalettes() {
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [0x00, 0x0F, 0x30]);
    ppu.setBgPalette(1, [0x00, 0x16, 0x28]);
    ppu.setBgPalette(2, [0x00, 0x16, 0x30]);
    ppu.setBgPalette(3, [0x00, 0x28, 0x30]);
    ppu.setSprPalette(0, [0x0F, 0x28, 0x21]);
    ppu.setSprPalette(1, [0x0F, 0x12, 0x21]);
    ppu.setSprPalette(2, [0x0F, 0x14, 0x21]);
    ppu.setSprPalette(3, [0x0F, 0x16, 0x21]);
  }
  function racePalettes(t) {
    ppu.setBackdrop(t.backdrop);
    ppu.setBgPalette(0, [0x00, 0x0F, 0x30]);
    ppu.setBgPalette(1, [0x00, 0x16, 0x30]);
    ppu.setBgPalette(2, t.deco.slice(0, 3));
    ppu.setBgPalette(3, [0x00, 0x28, 0x30]);
    ppu.setSprPalette(0, [0x0F, 0x28, 0x21]);
    ppu.setSprPalette(1, [0x0F, 0x12, 0x21]);
    ppu.setSprPalette(2, [0x0F, 0x14, 0x21]);
    ppu.setSprPalette(3, [0x0F, 0x16, 0x21]);
  }
  var hiddenFrom = 64;
  function hideSprites(from) {
    for (var i = from; i < 64; i++) ppu.sprite(i, { x: 0, y: 240, tile: 1, pal: 0 });
    hiddenFrom = from;
  }

  /* ============================== 各畫面 ============================== */
  function enter(mode) {
    g.mode = mode; g.t = 0;
    CT.blank(nes0, function () {
      clearScreen(); screenPalettes();
      if (mode === 'title') drawTitle();
      else if (mode === 'howto') drawHowto();
      else if (mode === 'intro') drawIntro();
      else if (mode === 'result') drawResult();
      else if (mode === 'champ') drawChamp();
      else if (mode === 'over') drawOver();
      else if (mode === 'race') startRace();
    });
    if (mode === 'title') Audio.play('title');
    else if (mode === 'race') Audio.stop();
  }
  function drawTitle() {
    frame(0, 1, 2, 30, 25);
    logo(10, 5);
    ppu.fillAttr(0, 5, 2, 6, 2, 1);
    center(0, 9, 'STARDUST RACER');
    // 裝飾路面條：路肩 / 柏油 / 方格旗
    var c;
    for (c = 3; c < 29; c++) {
      ppu.setTile(0, c, 12, Art.bg((c & 1) ? 'CURB_A' : 'CURB_B'));
      ppu.setTile(0, c, 13, Art.bg('ROAD')); ppu.setTile(0, c, 14, Art.bg((c & 3) < 2 ? 'DASH' : 'ROAD'));
      ppu.setTile(0, c, 15, Art.bg('ROAD'));
      ppu.setTile(0, c, 16, Art.bg((c & 1) ? 'CURB_B' : 'CURB_A'));
    }
    ppu.setTile(0, 24, 13, Art.bg('CHECK_A')); ppu.setTile(0, 24, 14, Art.bg('CHECK_B')); ppu.setTile(0, 24, 15, Art.bg('CHECK_A'));
    ppu.fillAttr(0, 1, 6, 14, 3, 2);
    center(0, 22, 'BEST ' + pad(CT.load('racing', 'best', 0), 2) + ' PTS');
    center(0, 24, '3 TRACKS  X  3 LAPS');
  }
  function drawHowto() {
    frame(0, 1, 2, 30, 25);
    center(0, 4, 'HOW TO DRIVE');
    // 行距：每行之間空一列（qa-r5 P3-5）
    put(0, 5, 6, 'A  GAS      B  NITRO');
    put(0, 5, 8, 'DOWN BRAKE  L R STEER');
    put(0, 5, 10, 'START    PAUSE');
    put(0, 5, 12, 'C/$      CHEAT');
    put(0, 3, 14, 'HOLD START+SELECT: MENU');
    put(0, 5, 16, '  NITRO CAN  +1 NITRO');
    put(0, 5, 18, '  BOOST PAD  SPEED UP');
    put(0, 5, 20, '  OIL        SPIN OUT');
    put(0, 5, 22, '  CONE       SLOW DOWN');
    ppu.setTile(0, 5, 16, Art.bg('NITRO')); ppu.setTile(0, 5, 18, Art.bg('BOOST'));
    ppu.setTile(0, 5, 20, Art.bg('OIL')); ppu.setTile(0, 5, 22, Art.bg('CONE'));
    ppu.setAttr(0, 2, 8, 3); ppu.setAttr(0, 2, 9, 3); ppu.setAttr(0, 2, 10, 0); ppu.setAttr(0, 2, 11, 2);
    center(0, 24, 'FINISH TOP 3 TO ADVANCE');
  }
  function drawIntro() {
    var t = R.TRACKS[g.ti];
    frame(0, 1, 2, 30, 25);
    center(0, 5, 'TRACK ' + (g.ti + 1) + ' OF 3');
    center(0, 8, t.name);
    center(0, 11, t.laps + ' LAPS   6 CARS');
    center(0, 13, t.grip === 'ice' ? 'ICY ROAD  STEER EARLY' : (t.patch === 'sand' ? 'SAND SLOWS YOU DOWN' : 'GOOD LUCK ROOKIE'));
    center(0, 17, 'POINTS ' + pad(g.points, 2) + '   CONTINUE ' + g.continues);
    center(0, 22, 'PUSH START');
  }
  function drawResult() {
    frame(0, 1, 2, 30, 25);
    center(0, 4, 'RACE RESULT');
    var i;
    for (i = 0; i < g.order.length; i++) {
      var c = g.order[i];
      put(0, 6, 7 + i * 2, ordinal(i + 1) + '  ' + (NAMES[c.idx] + '       ').substr(0, 7) + '  +' + POINTS[i]);
      if (c.isPlayer) ppu.setTile(0, 4, 7 + i * 2, Art.bg('STAR'));
    }
    var p = g.lastPlace;
    if (p <= 3) center(0, 21, g.ti >= 2 ? 'ALL TRACKS CLEAR' : 'QUALIFIED  NEXT TRACK');
    else if (g.continues > 0) center(0, 21, 'TOP 3 NEEDED  RETRY ' + g.continues);
    else center(0, 21, 'NO CONTINUE LEFT');
    center(0, 23, 'TOTAL ' + pad(g.points, 2) + ' PTS');
    if (p > 3) center(0, 25, 'C/$ CHEAT = RETRY NOW');
  }
  function drawChamp() {
    frame(0, 1, 2, 30, 25);
    logo(10, 5); ppu.fillAttr(0, 5, 2, 6, 2, 1);
    center(0, 10, 'GRAND PRIX CHAMPION');
    center(0, 13, 'TOTAL ' + pad(g.points, 2) + ' PTS');
    var b = CT.load('racing', 'best', 0);
    center(0, 15, 'BEST  ' + pad(b, 2) + ' PTS');
    center(0, 20, 'THANK YOU FOR RACING');
    center(0, 23, 'PUSH START');
  }
  function drawOver() {
    frame(0, 1, 2, 30, 25);
    center(0, 10, 'GAME OVER');
    center(0, 13, 'TOTAL ' + pad(g.points, 2) + ' PTS');
    center(0, 18, 'C/$ CHEAT = RETRY TRACK');
    center(0, 21, 'PUSH START');
  }
  function pad(n, w) { var s = String(n | 0); while (s.length < w) s = '0' + s; return s; }
  function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }

  // 標題畫面：兩台車在裝飾路面上追逐（4 顆精靈，同一條線最多 4 顆）
  function titleCars() {
    var x1 = 24 + (g.t * 2) % 196, x2 = 24 + (g.t * 2 + 96) % 196, i = 0;
    [[x1, 1], [x2, 0]].forEach(function (c) {
      var x = c[0];
      if (x > 212) { ppu.sprite(i++, { x: 0, y: 240, tile: 1, pal: 0 }); ppu.sprite(i++, { x: 0, y: 240, tile: 1, pal: 0 }); return; }
      ppu.sprite(i++, { x: x, y: 104 + c[1] * 4, tile: Art.spr('CAR_RT_L'), pal: c[1] ? 3 : 0 });
      ppu.sprite(i++, { x: Math.min(248, x + 8), y: 104 + c[1] * 4, tile: Art.spr('CAR_RT_R'), pal: c[1] ? 3 : 0 });
    });
  }

  /* ============================== 賽道串流 ============================== */
  function slotOf(K) { return mod(-K - 1, RING); }
  function lapOfRow(K) { return Math.floor(K / g.tb.N); }
  var DECO_T = ['BUSH', 'STONE', 'TUFT', 'TUFT'];
  function hash(k, c) { var h = (k * 73856093) ^ (c * 19349663) ^ (g.ti * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; }
  // 回傳 [磚名, 調色盤, 優先級]
  function cellAt(K, col) {
    var tb = g.tb, k = mod(K, tb.N), L = tb.L[k], Rr = tb.R[k];
    if (col >= L && col <= Rr) {
      var its = tb.byRow[k];
      if (its) {
        for (var i = 0; i < its.length; i++) {
          var it = its[i];
          if (col >= it.col && col < it.col + it.w) {
            if (it.type === 'nitro' && g.collected[it.id] === lapOfRow(K)) break;
            return ITEM_CELL[it.type];
          }
        }
      }
      if (k === 0) return ((col + (K & 1)) & 1) ? CELL_CHA : CELL_CHB;
      if (col === ((L + Rr + 1) >> 1) && !(k & 1)) return CELL_DASH;
      return CELL_ROAD;
    }
    if (col === L - 1 || col === Rr + 1) return (K & 1) ? CELL_CURA : CELL_CURB;
    if (col <= L - 4 || col >= Rr + 4) {
      var h = hash(k, col) % 23;
      if (h < 4) return DECO_CELL[h];
    }
    return CELL_SP;
  }
  var CELL_SP = ['SP', 0, 0], CELL_ROAD = ['ROAD', 0, 0], CELL_DASH = ['DASH', 0, 0];
  var CELL_CHA = ['CHECK_A', 0, 0], CELL_CHB = ['CHECK_B', 0, 0];
  var CELL_CURA = ['CURB_A', 1, 2], CELL_CURB = ['CURB_B', 1, 2];
  var DECO_CELL = DECO_T.map(function (n) { return [n, 2, 1]; });
  var ITEM_CELL = {
    oil: ['OIL', 0, 3], cone: ['CONE', 1, 3], rock: ['ROCK', 2, 3], boost: ['BOOST', 3, 3],
    nitro: ['NITRO', 3, 3], patch: ['PATCH', 0, 0]
  };
  var rowCache = new Array(32);
  function writeRow(K) {
    var slot = slotOf(K), col, n = 0;
    for (col = 0; col < 32; col++) { ppu.setTile(0, col, slot, Art.bg(cellAt(K, col)[0])); n++; }
    // 屬性：與同一 16×16 區塊的另一列一起決定（槽位偶數 ↔ K 與 K-1 同區塊）
    var Ka = (slot & 1) ? K + 1 : K, Kb = Ka - 1, c16;
    for (c16 = 0; c16 < 16; c16++) {
      var best = 0, bp = 0, cells = [cellAt(Ka, c16 * 2), cellAt(Ka, c16 * 2 + 1), cellAt(Kb, c16 * 2), cellAt(Kb, c16 * 2 + 1)];
      for (var j = 0; j < 4; j++) if (cells[j][2] > bp) { bp = cells[j][2]; best = cells[j][1]; }
      ppu.setAttr(0, c16, slot >> 1, best); n++;
    }
    return n;
  }
  function needTop() { return Math.floor((fl8(g.player.d) + PY) / 8) + 1; }
  function streamRows() {
    var want = needTop(), n = 0, w = 0;
    while (g.rowTop < want && w < 2) { g.rowTop++; n += writeRow(g.rowTop); w++; }
    if (n > g.maxRowBytes) g.maxRowBytes = n;
  }
  function fullTrack() {
    var top = needTop(), K;
    for (K = top - RING + 1; K <= top; K++) writeRow(K);
    g.rowTop = top;
  }
  function scrollNow() {
    ppu.scroll(0, mod(-fl8(g.player.d) - PY - 1, 240));
    ppu.split(SPLIT, { x: 0, y: SPLIT, nt: 1 });
  }

  /* ============================== 比賽 ============================== */
  function makeCar(idx, x, d, top) {
    return { idx: idx, isPlayer: idx === 0, x: x * 256, d: d * 256, s: 0, vx: 0, top: top, lane: 0,
             spin: 0, crash: 0, boost: 0, finished: false, fin: 0, hitCool: 0, laneT: 0, sy: 0, vis: false,
             pal: idx === 0 ? 0 : 1 + ((idx - 1) % 3) };
  }
  function startRace() {
    var t = R.TRACKS[g.ti];
    g.track = t; g.tb = R.buildTrack(t);
    g.collected = {}; g.raceT = 0; g.phase = 'count'; g.finishT = 0; g.paused = false;
    g.cars = []; g.nitro = Math.max(g.nitro | 0, 2); g.nitro = 2;
    var tb = g.tb, k0 = tb.N - 2, cx = ((tb.L[k0] + tb.R[k0] + 1) * 8) >> 1;
    // 起跑格：兩欄 × 三排，玩家在最後一排（從後面追）
    var slots = [[-14, -66], [14, -42], [-14, -42], [14, -18], [-14, -18], [14, -66]];
    var i;
    for (i = 0; i < 6; i++) {
      var top = i === 0 ? TOP : t.rivals[i - 1];
      var c = makeCar(i, cx + slots[i][0], slots[i][1], top);
      c.lane = slots[i][0];
      g.cars.push(c);
    }
    g.player = g.cars[0];
    racePalettes(t);
    fullTrack();
    scrollNow();
    g.hud = []; g.hudCur = [];
    for (i = 0; i < 96; i++) { g.hud.push(0); g.hudCur.push(-1); }
    ppu.fillTiles(1, 0, 25, 32, 5, Art.bg('H_FULL'));
    ppu.fillAttr(1, 0, 12, 16, 3, 0);
    for (i = 0; i < 32; i++) ppu.setTile(1, i, 26, Art.bg('H_BAR'));
    hudCompose(); hudFlush(999);
    drawCars();
  }

  function surface(c) {
    var tb = g.tb, px = fl8(c.x), dpx = fl8(c.d), k = mod(Math.floor(dpx / 8), tb.N), col = px >> 3;
    var L = tb.L[k], Rr = tb.R[k];
    if (col < L - 1 || col > Rr + 1) return 'grass';
    if (col === L - 1 || col === Rr + 1) return 'curb';
    var its = tb.byRow[k];
    if (its) for (var i = 0; i < its.length; i++) if (its[i].type === 'patch' && its[i].col === col) return g.track.patch;
    return 'road';
  }
  function topFor(c, surf) {
    var top = c.boost > 0 ? BOOST_TOP : c.top;
    if (surf === 'grass') top = Math.min(top, GRASS_TOP);
    else if (surf === 'curb') top = Math.min(top, CURB_TOP);
    else if (surf === 'sand') top = Math.min(top, SAND_TOP);
    return top;
  }
  function physics(c, gas, brake, steer) {
    var surf = surface(c), top = topFor(c, surf);
    if (c.spin > 0) { c.spin--; c.s -= 8; gas = false; steer = 0; }
    if (c.crash > 0) { c.crash--; gas = false; steer = 0; }
    if (c.boost > 0) c.boost--;
    if (c.s > top) c.s -= (c.s - top > 200) ? 24 : 10;
    else if (gas) c.s = Math.min(top, c.s + (c.s < 512 ? 12 : (c.boost > 0 ? 14 : 6)));
    else c.s -= 3;
    if (brake) c.s -= 20;
    if (c.s < 0) c.s = 0;
    var ice = g.track.grip === 'ice', grip = surf === 'ice' ? 8 : (ice ? 28 : 80);
    var target = steer * Math.floor(STEER * Math.min(c.s, 600) / 600);
    if (c.vx < target) c.vx = Math.min(target, c.vx + grip); else if (c.vx > target) c.vx = Math.max(target, c.vx - grip);
    c.x += c.vx;
    if (c.x < 10 * 256) { c.x = 10 * 256; c.vx = 0; }
    if (c.x > 246 * 256) { c.x = 246 * 256; c.vx = 0; }
    c.d += c.s;
    if (c.hitCool > 0) c.hitCool--;
    items(c);
  }
  function items(c) {
    var tb = g.tb, dpx = fl8(c.d), px = fl8(c.x);
    var r0 = Math.floor((dpx - CAR_HH) / 8), r1 = Math.floor((dpx + CAR_HH) / 8), K;
    for (K = r0; K <= r1; K++) {
      var its = tb.byRow[mod(K, tb.N)];
      if (!its) continue;
      for (var i = 0; i < its.length; i++) {
        var it = its[i], x0 = it.col * 8, x1 = x0 + it.w * 8;
        if (px + CAR_HW <= x0 || px - CAR_HW >= x1) continue;
        var key = it.id * 16 + (lapOfRow(K) & 15);
        if (it.type === 'patch') continue;
        if (it.type === 'nitro') {
          if (!c.isPlayer || g.collected[it.id] === lapOfRow(K)) continue;
          g.collected[it.id] = lapOfRow(K);
          g.nitro = Math.min(9, g.nitro + 1);
          var slot = slotOf(K);
          ppu.setTile(0, it.col, slot, Art.bg(cellAt(K, it.col)[0]));
          Audio.sfx('racing_item');
          continue;
        }
        if (c.hitCool > 0 && c.lastHit === key) continue;
        c.lastHit = key; c.hitCool = 30;
        if (it.type === 'boost') {
          c.boost = Math.max(c.boost, 50); if (c.s < 1100) c.s = 1100;
          if (c.isPlayer) Audio.sfx('racing_boost');
        } else if (it.type === 'oil') {
          if (c.spin <= 0) { c.spin = 40; c.s = (c.s * 3) >> 2; if (c.isPlayer) Audio.sfx('racing_spin'); }
        } else if (it.solid) {
          c.s = (c.s / 3) | 0; c.crash = 12;
          c.vx = (px < (x0 + x1) / 2 ? -1 : 1) * 200;
          if (c.isPlayer) Audio.sfx('racing_crash');
        }
      }
    }
  }
  function relPx(a, b) {                   // a 相對 b 的前後距離（px，取一圈內最近）
    var lap = g.tb.lapPx, d = fl8(a.d) - fl8(b.d);
    return mod(d + (lap >> 1), lap) - (lap >> 1);
  }
  function hazardAt(K0, K1, xpx, half) {
    var tb = g.tb, K;
    for (K = K0; K <= K1; K++) {
      var its = tb.byRow[mod(K, tb.N)];
      if (!its) continue;
      for (var i = 0; i < its.length; i++) {
        var it = its[i];
        if (!(it.solid || it.type === 'oil' || (it.type === 'patch' && g.track.patch !== 'none'))) continue;
        var x0 = it.col * 8, x1 = x0 + it.w * 8;
        if (xpx + half > x0 && xpx - half < x1) return true;
      }
    }
    return false;
  }
  // 共用駕駛判斷（對手 AI 與 ?bot=1 自動駕駛都用這支）：回傳 {steer, lane 目標 x}
  var LANES = [0, -16, 16, -30, 30, -42, 42];
  function plan(c, look, wantNitroCan) {
    var tb = g.tb, dpx = fl8(c.d), k = Math.floor(dpx / 8);
    var Ka = k + look, ka = mod(Ka, tb.N), L = tb.L[ka], Rr = tb.R[ka];
    var mid = ((L + Rr + 1) * 8) >> 1, half = ((Rr - L + 1) * 8 >> 1) - 10;
    var best = null, bestCost = 1e9, i;
    var px = fl8(c.x);
    for (i = 0; i < LANES.length; i++) {
      var tx = clamp(mid + c.lane + LANES[i], mid - half, mid + half);
      var cost = Math.abs(LANES[i]) + Math.abs(tx - px) * 0.3;
      // 走廊模擬：橫移速度約每列 2 px（冰上更慢），逐列推算車的 x，撞到危險就重罰
      var rate = g.track.grip === 'ice' ? 2 : 3, K2;
      for (K2 = k - 1; K2 <= k + look + 4; K2++) {
        var step = rate * (K2 - k + 1), xx = px + clamp(tx - px, -step, step);
        if (hazardAt(K2, K2, xx, 9)) { cost += 500 - (K2 - k) * 8; break; }
      }
      if (c.planTx !== undefined && Math.abs(tx - c.planTx) <= 6) cost -= 50;   // 遲滯：別一直換主意
      for (var j = 0; j < g.cars.length; j++) {
        var o = g.cars[j]; if (o === c) continue;
        var rel = relPx(o, c);
        if (rel > 0 && rel < 40 && Math.abs(fl8(o.x) - tx) < 16 && o.s <= c.s + 40) cost += 120;
      }
      if (wantNitroCan) {
        var its, K;
        for (K = k + 2; K <= k + look + 6; K++) {
          its = tb.byRow[mod(K, tb.N)];
          if (!its) continue;
          for (var q = 0; q < its.length; q++) {
            var it = its[q];
            if ((it.type === 'nitro' && g.collected[it.id] !== lapOfRow(K)) || it.type === 'boost') {
              if (Math.abs(it.col * 8 + 4 * it.w - tx) < 10) cost -= 90;
            }
          }
        }
      }
      if (cost < bestCost) { bestCost = cost; best = tx; }
    }
    c.planTx = best;
    var dx = best - px;
    var lead = c.vx * (g.track.grip === 'ice' ? 24 : 6) / 256;
    var e = dx - lead, steer = 0;
    if (e > 3) steer = 1; else if (e < -3) steer = -1;
    return { steer: steer, tx: best };
  }
  function rivalAI(c) {
    var top = c.top, rel = relPx(c, g.player);
    if (!g.player.finished) {
      if (rel > 480) top -= 60; else if (rel < -360) top += 50;
    }
    var p = plan(c, 6, false);
    var save = c.top; c.top = top;
    physics(c, true, false, p.steer);
    c.top = save;
  }
  function collide() {
    var cs = g.cars, i, j;
    for (i = 0; i < cs.length; i++) for (j = i + 1; j < cs.length; j++) {
      var a = cs[i], b = cs[j];
      var dd = relPx(b, a), dx = fl8(b.x) - fl8(a.x);
      if (Math.abs(dx) >= 13 || Math.abs(dd) >= 15) continue;
      if (Math.abs(dd) * 13 >= Math.abs(dx) * 15) {            // 追撞：後車被擋
        var front = dd > 0 ? b : a, rear = dd > 0 ? a : b;
        rear.s = Math.min(rear.s, (front.s * 7) >> 3);
        rear.d = front.d - 15 * 256;
        if ((rear.isPlayer || front.isPlayer) && g.crashCool <= 0) { Audio.sfx('racing_crash'); g.crashCool = 30; }
      } else {                                                  // 側撞：左右推開
        var push = ((13 - Math.abs(dx)) >> 1) + 1, sgn = dx >= 0 ? 1 : -1;
        a.x -= sgn * push * 256; b.x += sgn * push * 256;
        var t = a.vx; a.vx = b.vx; b.vx = t;
      }
    }
  }
  // 每條掃描線最多 MAX_BAND 台車（= 8 顆精靈）：第 5 台物理上被擋在後面
  var band = new Uint8Array(240);
  function enforceBands() {
    band.fill(0);
    var p = g.player, list = [], i, y, c;
    for (i = 0; i < g.cars.length; i++) {
      c = g.cars[i];
      c.sy = PY - relPx(c, p) - 8;
      c.vis = c.sy >= 0 && c.sy <= HIDE_Y;
      if (c.vis) list.push(c);
    }
    list.sort(function (a, b) { return a.isPlayer ? -1 : b.isPlayer ? 1 : a.sy - b.sy; });
    var maxB = 0;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      var shift = 0;
      while (shift < 80 && !fits(c.sy + shift)) shift++;
      if (shift > 0) {
        c.d -= shift * 256; c.sy += shift; if (c.s > p.s) c.s = p.s; g.bandPushes++;
        c.vis = c.sy <= HIDE_Y;
        if (!c.vis) continue;
      }
      for (y = c.sy; y < c.sy + 16 && y < 240; y++) { band[y]++; if (band[y] > maxB) maxB = band[y]; }
    }
    if (maxB > g.maxBandCars) g.maxBandCars = maxB;
  }
  function fits(y0) {
    for (var y = Math.max(0, y0); y < y0 + 16 && y < 240; y++) if (band[y] >= MAX_BAND) return false;
    return true;
  }
  function drawCars() {
    var i, slot = 0;
    for (i = 0; i < g.cars.length; i++) {
      var c = g.cars[i];
      if (!c.vis) continue;
      var x = fl8(c.x) - 8, y = c.sy, dir = c.spin > 0 ? (c.spin >> 2) & 3 : 0;
      var L = 'CAR_UP_L', Rn = 'CAR_UP_R', fh = false, fv = false;
      if (dir === 1) { L = 'CAR_RT_L'; Rn = 'CAR_RT_R'; }
      else if (dir === 2) { fv = true; }
      else if (dir === 3) { L = 'CAR_RT_R'; Rn = 'CAR_RT_L'; fh = true; }
      if (x < 0) x = 0; if (x > 240) x = 240;
      ppu.sprite(slot++, { x: x, y: y, tile: Art.spr(L), pal: c.pal, flipH: fh, flipV: fv });
      ppu.sprite(slot++, { x: x + 8, y: y, tile: Art.spr(Rn), pal: c.pal, flipH: fh, flipV: fv });
    }
    for (i = slot; i < hiddenFrom; i++) ppu.sprite(i, { x: 0, y: 240, tile: 1, pal: 0 });
    hiddenFrom = slot;
  }
  function placeOf(c) {
    var ahead = 0;
    for (var i = 0; i < g.cars.length; i++) {
      var o = g.cars[i]; if (o === c) continue;
      if (o.finished && (!c.finished || o.fin < c.fin)) ahead++;
      else if (!o.finished && !c.finished && o.d > c.d) ahead++;
    }
    return ahead + 1;
  }
  function lapOf(c) { return clamp(Math.floor(fl8(c.d) / g.tb.lapPx) + 1, 1, g.track.laps); }
  var finSeq = 0;
  function checkFinish(c) {
    if (c.finished) return;
    var lapsDone = Math.floor(fl8(c.d) / g.tb.lapPx);
    if (c.isPlayer && lapsDone > (c.lapsDone | 0) && lapsDone < g.track.laps && lapsDone > 0) Audio.sfx('racing_lap');
    c.lapsDone = Math.max(c.lapsDone | 0, lapsDone);
    if (lapsDone >= g.track.laps) { c.finished = true; c.fin = ++finSeq; }
  }
  function playerInput() {
    var gas = held(BTN.A), brake = held(BTN.DOWN), steer = 0;
    if (held(BTN.LEFT)) steer = -1; else if (held(BTN.RIGHT)) steer = 1;
    if (pressed(BTN.B) && g.nitro > 0 && g.player.boost < 10 && g.player.spin <= 0) {
      g.nitro--; g.player.boost = 100; Audio.sfx('racing_nitro');
    }
    return { gas: gas, brake: brake, steer: steer };
  }
  function updateRace() {
    var p = g.player, i;
    if (pressed(BTN.START) && !held(BTN.SELECT)) { setPause(!g.paused); hudCompose(); hudFlush(40); return; }
    if (g.paused) return;
    g.raceT++;
    if (g.crashCool > 0) g.crashCool--;
    if (g.phase === 'count') {
      if (g.raceT === 1 || g.raceT === 61 || g.raceT === 121) Audio.sfx('racing_beep');
      if (g.raceT >= COUNT_FRAMES) { g.phase = 'run'; g.raceT = 0; Audio.sfx('racing_go'); Audio.play('race'); }
    } else {
      if (p.finished) {
        var a = plan(p, 6, false);
        physics(p, true, false, a.steer);
      } else {
        var inp = playerInput();
        physics(p, inp.gas, inp.brake, inp.steer);
      }
      for (i = 1; i < g.cars.length; i++) rivalAI(g.cars[i]);
      collide();
      for (i = 0; i < g.cars.length; i++) checkFinish(g.cars[i]);
      if (p.finished) {
        if (g.phase !== 'finish') {
          g.phase = 'finish'; g.finishT = 0; g.lastPlace = placeOf(p);
          Audio.play(g.lastPlace <= 3 ? 'win' : 'lose');
        }
        if (++g.finishT >= 150) { endRace(); return; }
      }
    }
    enforceBands();
    streamRows();
    // 加速中車身閃白
    if (p.boost > 0) { if ((p.boost & 3) === 0) ppu.setSprPalette(0, (p.boost & 4) ? [0x0F, 0x30, 0x21] : [0x0F, 0x28, 0x21]); }
    else if (g.boostPal) ppu.setSprPalette(0, [0x0F, 0x28, 0x21]);
    g.boostPal = p.boost > 0;
    hudCompose(); hudFlush(40);
  }
  // 暫停 = BGM 停（qa-r5 P3-1）；解除暫停接續播同一首（倒數中本來就沒音樂）
  function setPause(on) {
    if (on === g.paused) return;
    g.paused = on;
    if (on) { g.pauseSong = Audio.current; Audio.stop(); }
    else if (g.pauseSong) { Audio.play(g.pauseSong); g.pauseSong = null; }
  }
  function endRace() {
    var cs = g.cars.slice();
    cs.sort(function (a, b) { return placeOf(a) - placeOf(b); });
    g.order = cs;
    var pl = g.lastPlace = placeOf(g.player);
    g.points += POINTS[pl - 1];
    g.placeLog.push({ track: g.ti, place: pl });
    if (pl <= 3) g.cleared[g.ti] = true;
    enter('result');
  }

  /* ============================== HUD ============================== */
  function hudSet(row, col, str) {
    var t = Art.text(str, true), i;
    for (i = 0; i < t.length && col + i < 32; i++) g.hud[row * 32 + col + i] = t[i];
  }
  function hudCompose() {
    var i, p = g.player, sp = Art.bg('H_FULL');
    for (i = 32; i < 96; i++) g.hud[i] = sp;
    for (i = 0; i < 32; i++) g.hud[i] = Art.bg('H_BAR');
    var lap = lapOf(p);
    hudSet(1, 1, 'LAP ' + lap + '/' + g.track.laps);
    hudSet(1, 10, 'POS ' + placeOf(p) + '/6');
    g.hud[32 + 19] = Art.bg('H_NIT');
    hudSet(1, 21, 'X' + g.nitro);
    var f = g.phase === 'count' ? 0 : g.raceT, cs = Math.floor((f % 60) * 100 / 60), s = Math.floor(f / 60);
    hudSet(2, 1, Math.floor(s / 60) + ':' + pad(s % 60, 2) + '.' + pad(cs, 2));
    // 進度條：10 格
    var prog = clamp(Math.floor(fl8(p.d) * 10 / (g.tb.lapPx * g.track.laps)), 0, 10);
    for (i = 0; i < 10; i++) g.hud[64 + 11 + i] = Art.bg(i < prog ? 'H_PROG1' : 'H_PROG0');
    g.hud[64 + 22] = Art.bg('H_CAR');
    if (g.paused) hudSet(2, 24, 'PAUSE');
    else if (g.phase === 'count') hudSet(2, 24, 'READY' ), hudSet(1, 25, '  ' + (3 - Math.floor(g.raceT / 60)) + ' ');
    else if (g.phase === 'finish') hudSet(2, 24, ordinal(g.lastPlace) + '!');
    else hudSet(2, 24, pad(Math.floor(p.s * 100 / 256 / 3.5) + 60, 3) + 'KM');
  }
  function hudFlush(maxN) {
    var i, n = 0;
    for (i = 0; i < 96 && n < maxN; i++) {
      if (g.hud[i] !== g.hudCur[i]) { ppu.setTile(1, i & 31, 26 + (i >> 5), g.hud[i]); g.hudCur[i] = g.hud[i]; n++; }
    }
    return n;
  }

  /* ============================== 自動駕駛（?bot=1） ============================== */
  var botLast = 0;
  function bot() {
    if (!g) return 0;
    var m = 0;
    if (g.mode !== 'race') {
      botLast = botLast ? 0 : 1;
      if (!botLast) return 0;
      if (g.t < 20) return 0;
      return g.mode === 'result' ? BTN.A : BTN.START;
    }
    if (g.phase === 'count' || g.player.finished || g.paused) return BTN.A;
    var p = g.player;
    var a = plan(p, g.track.grip === 'ice' ? 12 : 6, true);
    m |= BTN.A;
    if (a.steer < 0) m |= BTN.LEFT; else if (a.steer > 0) m |= BTN.RIGHT;
    // 氮氣：前方 24 列內沒有危險、路直、不是正在加速 ⇒ 開
    var tb = g.tb, k = Math.floor(fl8(p.d) / 8), straight = true, j;
    var c0 = tb.L[mod(k, tb.N)] + tb.R[mod(k, tb.N)];
    for (j = 4; j <= 28; j += 4) if (Math.abs(tb.L[mod(k + j, tb.N)] + tb.R[mod(k + j, tb.N)] - c0) > 2) straight = false;
    if (g.nitro > 0 && p.boost <= 0 && p.spin <= 0 && p.crash <= 0 && (straight || g.nitro > 2) && !hazardAt(k + 1, k + 16, fl8(p.x), 12) && !(g.raceT & 1)) m |= BTN.B;
    return m;
  }

  /* ============================== 註冊 ============================== */
  var game = {
    id: 'racing', order: 6, title: '星塵賽車', legacy: ['racing.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu = nes.ppu;
      Art.build();
      NES.CHR.setPattern(0, 'racing_bg');
      NES.CHR.setPattern(1, 'racing_spr16');
      ppu.setPatternTables(0, 1);
      ppu.spriteMode(16);
      ppu.flicker = 'none';
      Audio.init(nes);
      g = newGame(); finSeq = 0; hiddenFrom = 64;
      var tq = parseInt(CT.query && CT.query('track') || '0', 10);
      if (tq >= 1 && tq <= 3 && CT.query('game') === 'racing') { g.ti = tq - 1; enter('race'); return; }
      enter('title');
    },
    exit: function () { if (g) saveBest(); Audio.stop(); },
    update: function (nes) {
      if (!g) return;
      g.frames++; g.t++;
      Audio.tick();
      var st = pressed(BTN.START) && !held(BTN.SELECT), a = pressed(BTN.A);
      switch (g.mode) {
        case 'title':
          if ((g.t % 32) === 0) center(0, 19, '          ');
          else if ((g.t % 32) === 16) center(0, 19, 'PUSH START');
          titleCars();
          if (st && g.t > 10) { g.points = 0; g.continues = CONTINUES; g.cleared = [false, false, false]; g.placeLog = []; g.ti = 0; g.champion = false; g.cheats = 0; Audio.sfx('racing_move'); enter('howto'); }
          break;
        case 'howto':
          if ((st || a) && g.t > 10) { Audio.sfx('racing_move'); enter('intro'); }
          break;
        case 'intro':
          if ((st || a) && g.t > 10) enter('race');
          break;
        case 'race':
          updateRace();
          break;
        case 'result':
          if ((st || a) && g.t > 30) {
            if (g.lastPlace <= 3) {
              if (g.ti >= 2) { g.champion = true; saveBest(); Audio.play('win'); enter('champ'); }
              else { g.ti++; enter('intro'); }
            } else if (g.continues > 0) { g.continues--; g.points -= POINTS[g.lastPlace - 1]; enter('intro'); }
            else { saveBest(); enter('over'); }
          }
          break;
        case 'champ':
        case 'over':
          if (st && g.t > 60) enter('title');
          break;
      }
    },
    draw: function () {
      if (!g) return;
      if (g.mode === 'race') { scrollNow(); drawCars(); }
    },
    state: function () {
      if (!g) return null;
      var p = g.player;
      return {
        mode: g.mode, phase: g.phase, track: g.ti, t: g.t, points: g.points, continues: g.continues,
        cleared: g.cleared.filter(Boolean).length, placeLog: g.placeLog, champion: g.champion,
        nitro: g.nitro | 0, paused: g.paused, raceT: g.raceT, cheats: g.cheats, retries: g.retries | 0,
        lap: p && g.tb ? lapOf(p) : 0, place: p && g.tb ? placeOf(p) : 0,
        x: p ? fl8(p.x) : 0, d: p ? fl8(p.d) : 0, s: p ? p.s : 0, boost: p ? p.boost : 0, spin: p ? p.spin : 0,
        maxBandCars: g.maxBandCars, bandPushes: g.bandPushes, maxRowBytes: g.maxRowBytes,
        music: Audio.current, lastSfx: Audio.last
      };
    },
    cheat: function () {
      if (!g) return false;
      if (g.mode === 'race' && g.player) {                      // 比賽中 = 立刻補強
        g.cheats++;
        g.nitro = 9; g.player.boost = 120; g.player.spin = 0; g.player.crash = 0;
        Audio.sfx('racing_item');
        return true;
      }
      if ((g.mode === 'result' && g.lastPlace > 3) || g.mode === 'over') {   // 失敗結算 = 原地續關
        g.cheats++;
        g.points = Math.max(0, g.points - POINTS[g.lastPlace - 1]);      // 這場不計、之前的大獎賽積分保留
        g.continues = CONTINUES; g.retries = (g.retries | 0) + 1;
        Audio.sfx('racing_item');
        enter('race');
        return true;
      }
      return false;                                              // 標題 / 說明 / 介紹 / 過關結算：無效
    },
    bot: bot,
    goal: function () { return !!(g && g.champion && g.cleared.every(Boolean) && g.cheats === 0); },
    get backTile() { return { tile: Art.spr('BACK'), pal: 0 }; },   // 8×16：上下兩塊 = 一顆實心星鑽（qa-r5 P3-9）
    bestText: function () { return 'PTS ' + pad(CT.load('racing', 'best', 0), 2); }
  };
  function saveBest() {
    var b = CT.load('racing', 'best', 0);
    if (g.points > b) CT.save('racing', 'best', g.points);
  }
  // 測試鉤子
  R.dev = {
    g: function () { return g; },
    warp: function (dpx) { g.player.d = dpx * 256; CT.blank(nes0, function () { fullTrack(); }); },
    setTrack: function (i) { g.ti = i; },
    cellAt: function (K, c) { return cellAt(K, c); },
    plan: function () { return plan(g.player, 6, true); },
    enter: function (m) { enter(m); },
    finishNow: function (place) {           // 直接以第 place 名結束（測流程用）
      g.lastPlace = place; g.order = g.cars.slice(); g.points += POINTS[place - 1];
      g.placeLog.push({ track: g.ti, place: place }); if (place <= 3) g.cleared[g.ti] = true; enter('result');
    }
  };
  R.game = game;
  CT.register(game);
})();
