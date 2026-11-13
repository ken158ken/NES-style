/*
 * games/cart3/labyrinth/main.js — 《星塵迷宮探索 STARDUST LABYRINTH》（合輯卡帶三 槽 7，id = labyrinth）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-4 cart3-maze（R7）｜ 依賴：labyrinth/{gen,art,song}.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/maze-game.html（只取「程序迷宮 + 收集物 + 計時 + 逐關變大」；其餘全部原創）
 *
 * 與卡帶一《星塵迷宮》（吃點 + 追兵）完全不同：這款是**探索型**——俯視、手持頭燈的探險者「露明」只照得亮身邊，
 *   其餘一片漆黑；找鑰匙開鎖門、踩日月開關切換日門 / 月門、閃過兩組輪流升降的潮汐牆，找到星門出口。
 *   9 層固定種子程序迷宮（gen.js，驗證器證明每層可達出口、無死局）+ 隨機模式（?seed= 可重現）。
 *
 * 畫面 / 硬限制的作法
 *   - 盤面一律是背景名稱表（每格 8×8 一塊）；精靈只有露明 + 羅盤箭頭 + 閃光（每線 ≤ 3）。
 *   - **視野 = 屬性表**：每個 16×16 屬性區依「到露明的距離」選 BG 調色盤 2（明亮）/ 1（微光）/ 0（全黑 $0F×3）；
 *     同一塊磁磚在三組調色盤下就是亮 / 暗 / 看不見。露明每移動 16 px 才有一圈屬性改變（實測每幀 ≤ 20 byte）。
 *     頭燈閃爍 = 每 8~12 幀換一次明亮調色盤的一色（3 byte）。
 *     fix-r7-maze：走過記憶——探索過的區塊（g.kb）離開頭燈後維持微光組 1、沒去過的才是 0（只換寫入的值，位元組量不增加）；
 *     狀態列在第 2 / 3 列（不貼 y = 0）；新機關第一次出現的樓層開場先出說明卡（mode 'intro'，CT.save seen 位元；?hint=0 跳過）。
 *   - **小地圖（SELECT）= 第二張名稱表**：探索到的格子邊走邊寫進 nt1（一塊磁磚 = 2×2 格，16 種四分格 + 物件標記），
 *     按 SELECT 只是把捲動基底切到 nt1 ⇒ 開地圖 0 byte。
 *   - 所有名稱表 / 屬性寫入走影子表 + 差異佇列（屬性 → nt0 → nt1 的順序），每幀 ≤ 140 byte；
 *     整片重畫（換層 / 結算 / 標題）包在 CT.blank。
 *   - 位置：整數像素；速度 1 / 2 px 交替（平均 1.5 px/幀，一格 5.33 幀）。
 * 操作：十字鍵移動（按住連續走、轉角可預先按）、B = 羅盤（指向出口 1.5 秒，每層 3 次）、SELECT = 小地圖、START = 暫停
 *   （暫停中 B = 重來這一層）。密技（C / ★）：遊玩中 = 地圖全開 + 頭燈全亮 20 秒 + 1 把萬用鑰匙；標題 / 結算無效；用過那局 goal() = false。
 * 星等：★ 到出口、★ 時間 ≤ 標準時間（par）、★ 星屑全收。goal = 冒險模式從第 1 層起連過 3 層（不開密技）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var L = CT.Labyrinth = CT.Labyrinth || {};
  var Gen = L.Gen, AU = L.Audio, T = Gen.T;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var DX = Gen.DX, DY = Gen.DY, DIRBTN = [BTN.UP, BTN.RIGHT, BTN.DOWN, BTN.LEFT];

  var NT_LIMIT = 140, GOAL_FLOORS = 3, SHIFT_P = 150, SHIFT_WARN = 36, COMPASS_N = 3;
  var THEMES = [
    { id: 'MOSS', lit: [0x0A, 0x1B, 0x3B], lit2: [0x0A, 0x1C, 0x3B], dim: [0x0F, 0x0B, 0x1B], song: 'labyrinth_cave' },
    { id: 'EMBER', lit: [0x07, 0x17, 0x38], lit2: [0x07, 0x16, 0x38], dim: [0x0F, 0x07, 0x17], song: 'labyrinth_kiln' },
    { id: 'VOID', lit: [0x02, 0x13, 0x34], lit2: [0x02, 0x14, 0x34], dim: [0x0F, 0x03, 0x13], song: 'labyrinth_void' }
  ];
  var PAL_DARK = [0x0F, 0x0F, 0x0F], PAL_HUD = [0x10, 0x28, 0x30];
  var PAL_T0 = [0x00, 0x10, 0x30], PAL_T1 = [0x0B, 0x1A, 0x3A], PAL_T2 = [0x00, 0x28, 0x38];
  var SPR_P = [0x07, 0x21, 0x38], SPR_FX = [0x28, 0x38, 0x30];

  var art = null, nes0 = null, g = null;

  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function mmss(frames) { var s = Math.floor(frames / 60), m = Math.min(99, Math.floor(s / 60)); return pad(m, 2) + ':' + pad(m >= 99 ? 59 : s % 60, 2); }

  /* ============================== 影子表 + 差異佇列 ============================== */
  var wantT = [new Uint8Array(960), new Uint8Array(960)], haveT = [new Uint8Array(960), new Uint8Array(960)];
  var dirtyT = [new Uint8Array(960), new Uint8Array(960)], qT = [[], []];
  var wantA = new Uint8Array(240), haveA = new Uint8Array(240), dirtyA = new Uint8Array(240), qA = [];
  var wstat = { last: 0, peak: 0, attrPeak: 0, backlogPeak: 0 };
  function put(nt, c, r, t) {
    if (c < 0 || c > 31 || r < 0 || r > 29) return;
    var i = r * 32 + c;
    wantT[nt][i] = t;
    if (haveT[nt][i] !== t && !dirtyT[nt][i]) { dirtyT[nt][i] = 1; qT[nt].push(i); }
  }
  function putA(bx, by, p) {
    var i = by * 16 + bx;
    wantA[i] = p;
    if (haveA[i] !== p && !dirtyA[i]) { dirtyA[i] = 1; qA.push(i); }
  }
  function text(nt, c, r, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) put(nt, c + i, r, t[i]); }
  function flush() {
    var ppu = nes0.ppu, bud = nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0, na = 0, i, k;
    var backlog = qA.length + qT[0].length + qT[1].length;
    if (backlog > wstat.backlogPeak) wstat.backlogPeak = backlog;
    for (k = 0; k < qA.length; k++) {
      if (base + n >= NT_LIMIT) break;
      i = qA[k]; dirtyA[i] = 0;
      if (wantA[i] !== haveA[i]) { ppu.setAttr(0, i & 15, i >> 4, wantA[i]); haveA[i] = wantA[i]; n++; na++; }
    }
    qA.splice(0, k);
    for (var nt = 0; nt < 2; nt++) {
      var q = qT[nt];
      for (k = 0; k < q.length; k++) {
        if (base + n >= NT_LIMIT) break;
        i = q[k]; dirtyT[nt][i] = 0;
        if (wantT[nt][i] !== haveT[nt][i]) { ppu.setTile(nt, i & 31, i >> 5, wantT[nt][i]); haveT[nt][i] = wantT[nt][i]; n++; }
      }
      q.splice(0, k);
    }
    wstat.last = n;
    if (n > wstat.peak) wstat.peak = n;
    if (na > wstat.attrPeak) wstat.attrPeak = na;
    return n;
  }
  function resetShadow() {
    for (var nt = 0; nt < 2; nt++) { wantT[nt].fill(0); haveT[nt].fill(0); dirtyT[nt].fill(0); qT[nt].length = 0; }
    wantA.fill(0); haveA.fill(0); dirtyA.fill(0); qA.length = 0;
  }
  // 整片：在 CT.blank 內把影子表直接寫進 PPU（rendering 關閉 = 不計預算）
  function syncAll() {
    var ppu = nes0.ppu, i, nt;
    for (nt = 0; nt < 2; nt++) {
      for (i = 0; i < 960; i++) { ppu.setTile(nt, i & 31, i >> 5, wantT[nt][i]); haveT[nt][i] = wantT[nt][i]; dirtyT[nt][i] = 0; }
      qT[nt].length = 0;
    }
    for (i = 0; i < 240; i++) { ppu.setAttr(0, i & 15, i >> 4, wantA[i]); haveA[i] = wantA[i]; dirtyA[i] = 0; }
    qA.length = 0;
    ppu.fillAttr(1, 0, 0, 16, 15, 3);
  }

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'title', t: 0, row: 0, selFloor: 1, seed: 12345, paused: false, map: false,
      run: null, lv: null, im: null, W: 0, H: 0, OX: 0, OY: 0,
      sw: 0, dm: 0, km: 0, got: null, known: null, kb: null, introT: 0, intro: null, shiftSt: null, shiftPend: null,
      p: { cx: 0, cy: 0, x: 0, y: 0, moving: false, dir: 2, face: 2, tx: 0, ty: 0, step: 0 },
      lastDir: -1, ft: 0, r1: 40, r2: 56, boostT: 0, lampOn: false, compass: COMPASS_N, compT: 0, compDir: 0,
      spark: null, msg: '', msgT: 0, clearT: 0, flick: 0, flickT: 0, lightKey: '', shards: 0, exitAnim: 0,
      cheated: false, cheats: 0, cheatReq: false, floorsCleared: 0, goalHit: false, endT: 0, result: null,
      bumps: 0, lockMsgT: 0, maxLine: 0, sprUsed: 0, bot: { t: 0, plan: null, pi: 0, replans: 0, waits: 0 }, history: []
    };
  }
  function reach() { return Math.max(1, Math.min(9, CT.load('labyrinth', 'reach', 1) | 0)); }
  function floorRec(n) { return CT.load('labyrinth', 'f' + n, null); }

  /* ============================== 標題 ============================== */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false; g.map = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      resetShadow(); clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_T0); ppu.setBgPalette(1, PAL_T1); ppu.setBgPalette(2, PAL_T2); ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(0, SPR_P); ppu.setSprPalette(1, SPR_FX);
      var c, r;
      for (c = 1; c < 31; c++) { put(0, c, 2, art.t('FR_H')); put(0, c, 27, art.t('FR_H')); }
      // 星空點綴
      [[3, 4], [27, 5], [5, 8], [25, 8], [29, 3], [2, 6]].forEach(function (d, i) { put(0, d[0], d[1], art.t(i & 1 ? 'DOT2' : 'DOT1')); });
      text(0, 12, 4, 'STARDUST');
      var w = 'LABYRINTH';
      for (var i = 0; i < w.length; i++) {
        var tt = art.big(w.charAt(i)), x = 7 + i * 2;
        put(0, x, 6, tt[0]); put(0, x + 1, 6, tt[1]); put(0, x, 7, tt[2]); put(0, x + 1, 7, tt[3]);
      }
      text(0, 4, 18, 'ARROWS MOVE   B COMPASS');
      text(0, 4, 20, 'SELECT MAP    START PAUSE');
      text(0, 4, 22, 'C/★ = CHEAT');
      text(0, 4, 24, 'HOLD START+SELECT: MENU');
      for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) wantA[r * 16 + c] = 0;
      for (c = 0; c < 16; c++) { wantA[3 * 16 + c] = 1; }
      titleRows();
      syncAll();
    });
    AU.play('labyrinth_title');
  }
  function starStr(s) { var o = ''; for (var i = 0; i < 3; i++) o += i < s ? '✶' : '☆'; return o; }
  function titleRows() {
    var rc = floorRec(g.selFloor);
    text(0, 3, 11, padR((g.row === 0 ? '>' : ' ') + ' ADVENTURE     F1-F9', 27));
    text(0, 3, 13, padR((g.row === 1 ? '>' : ' ') + ' FLOOR SELECT  F' + g.selFloor + ' ' + (rc ? starStr(rc.s) + ' ' + mmss(rc.t) : '---'), 27));
    text(0, 3, 15, padR((g.row === 2 ? '>' : ' ') + ' RANDOM SEED   ' + pad(g.seed % 100000, 5), 27));
    for (var r = 0; r < 3; r++) for (var c = 0; c < 16; c++) putA(c, 5 + r, g.row === r ? 2 : 0);
    var best = CT.load('labyrinth', 'best', 0) | 0;
    text(0, 4, 26, best > 0 ? 'BEST 9 FLOORS ' + mmss(best * 60) : 'FLOORS CLEARED ' + pad(reach() - 1, 1) + '/9  ');
  }

  /* ============================== 開局 / 樓層 ============================== */
  function startRun(kind, n, seed) {
    var keep = { bot: g.bot, row: g.row, selFloor: g.selFloor, seed: g.seed, noHint: g.noHint };
    g = newState();
    for (var k in keep) g[k] = keep[k];
    g.run = { kind: kind, floor: n || 1, seed: seed || g.seed, total: 0, cleared: 0, cheated: false, startFloor: n || 1 };
    g.bot.plan = null;
    startFloor();
  }
  function curLevel() {
    var run = g.run;
    return run.kind === 'rand' ? Gen.random(run.seed) : Gen.floor(run.floor);
  }
  function startFloor() {
    var lv = curLevel();
    g.lv = lv; g.im = Gen.indexMaps(lv);
    g.W = lv.W; g.H = lv.H; g.OX = (31 - lv.W) >> 1; g.OY = 4 + ((23 - lv.H) >> 1);
    var N = lv.W * lv.H;
    g.sw = 0; g.dm = 0; g.km = 0; g.got = new Uint8Array(N); g.known = new Uint8Array(N); g.kb = new Uint8Array(240);
    g.shiftSt = new Uint8Array(N); g.shiftPend = new Uint8Array(N);
    lv.shifts.forEach(function (s) { g.shiftSt[s.c] = s.ph === 0 ? 2 : 0; });
    var sx = lv.start % lv.W, sy = (lv.start / lv.W) | 0;
    g.p = { cx: sx, cy: sy, x: (g.OX + sx) * 8, y: (g.OY + sy) * 8, moving: false, dir: 2, face: 2, tx: sx, ty: sy, step: 0 };
    g.ft = 0; g.r1 = lv.spec.r1; g.r2 = lv.spec.r2; g.boostT = 0; g.lampOn = false; g.compass = COMPASS_N; g.compT = 0;
    g.spark = null; g.shards = 0; g.mode = 'play'; g.paused = false; g.map = false; g.clearT = 0; g.lightKey = '';
    g.bot.plan = null;
    g.msg = (lv.spec.n ? 'FLOOR ' + lv.spec.n + '  ' : '') + lv.spec.name; g.msgT = 150;
    AU.play(THEMES[lv.spec.theme].song);
    var need = g.noHint ? [] : introList(lv);
    if (need.length) enterIntro(need); else drawFloor();
  }

  /* ============== fix-r7-maze P3-3：新機關第一次出現 ⇒ 開場說明卡（畫面示意 + 兩行字，A 開始；存檔只播一次） ============== */
  var HINTS = [
    { bit: 1, has: function () { return true; }, icons: ['EXIT', 'SHARD'], l1: 'FIND THE STAR GATE', l2: 'SHARDS GIVE A STAR' },
    { bit: 2, has: function (lv) { return lv.doors.length > 0; }, icons: ['KEY', 'DOOR', 'DOOR_O'], l1: 'A KEY OPENS A DOOR', l2: 'ONE KEY PER DOOR' },
    { bit: 4, has: function (lv) { return lv.gates.length > 0; }, icons: ['SW_S', 'GA_O', 'GB_C'], l1: 'STEP ON ☼/☾ SWITCH', l2: 'SUN/MOON GATES SWAP' },
    { bit: 8, has: function (lv) { return lv.shifts.length > 0; }, icons: ['SH_O', 'SH_W', 'SH_C'], l1: 'TIDE WALLS RISE AND', l2: 'FALL. HALF = WARNING' },
    { bit: 16, has: function (lv) { return lv.lamp >= 0; }, icons: ['LAMP'], l1: 'STAR LAMP WIDENS', l2: 'YOUR HEADLAMP' }
  ];
  function seenMask() { return CT.load('labyrinth', 'seen', 0) | 0; }
  function introList(lv) { var seen = seenMask(); return HINTS.filter(function (h) { return !(seen & h.bit) && h.has(lv); }); }
  function enterIntro(list) {
    g.mode = 'intro'; g.introT = 0; g.intro = list;
    var ppu = nes0.ppu, th = theme(), lv = g.lv;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      resetShadow(); clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_DARK); ppu.setBgPalette(1, th.dim); ppu.setBgPalette(2, th.lit); ppu.setBgPalette(3, PAL_HUD);
      wantA.fill(3);
      text(0, 2, 2, padR((lv.spec.n ? 'F' + lv.spec.n + ' ' : '') + lv.spec.name, 23) + (list.length > 1 || list[0].bit !== 1 ? ' NEW!' : ' TIPS'));
      list.forEach(function (h, i) {
        var r = 4 + i * 5;                                     // 每項 5 列：字在 r / r+2，示意磁磚在中間那列（明亮組 2），項與項之間空兩列
        h.icons.forEach(function (n, j) { put(0, 2 + j * 2, r + 1, art.t(n)); });
        for (var bx = 1; bx <= 4; bx++) wantA[((r + 1) >> 1) * 16 + bx] = 2;
        text(0, 11, r, h.l1); text(0, 11, r + 2, h.l2);
      });
      text(0, 2, 28, 'A: START');
      syncAll();
    });
  }
  function closeIntro() {
    var m = seenMask();
    g.intro.forEach(function (h) { m |= h.bit; });
    CT.save('labyrinth', 'seen', m);
    g.intro = null; g.mode = 'play';
    drawFloor();
  }
  function theme() { return THEMES[g.lv.spec.theme]; }
  function idx(x, y) { return y * g.W + x; }
  function hash(c) { return ((c * 2654435761) >>> 0) >>> 29; }
  function cellTile(c) {
    var lv = g.lv, t = lv.grid[c], W = g.W;
    switch (t) {
      case T.WALL:
        var below = c + W;
        return (below < W * g.H && lv.grid[below] !== T.WALL) ? art.t('WF') : art.t('WL');
      case T.KEY: return g.got[c] ? floorTile(c) : art.t('KEY');
      case T.DOOR: return (g.dm & (1 << g.im.d[c])) ? art.t('DOOR_O') : art.t('DOOR');
      case T.SWITCH: return art.t(g.sw === 1 ? 'SW_S' : 'SW_M');
      case T.GATE_A: return art.t(g.sw === 1 ? 'GA_O' : 'GA_C');
      case T.GATE_B: return art.t(g.sw === 0 ? 'GB_O' : 'GB_C');
      case T.SHIFT0: case T.SHIFT1: return art.t(['SH_O', 'SH_W', 'SH_C'][g.shiftSt[c]]);
      case T.EXIT: return art.t(g.exitAnim ? 'EXIT2' : 'EXIT');
      case T.SHARD: return g.got[c] ? floorTile(c) : art.t('SHARD');
      case T.LAMP: return g.got[c] ? floorTile(c) : art.t('LAMP');
      default: return floorTile(c);
    }
  }
  function floorTile(c) { return art.t(hash(c) === 3 ? 'FL1' : 'FL0'); }
  function refreshCell(c) {
    put(0, g.OX + c % g.W, g.OY + ((c / g.W) | 0), cellTile(c));
    mapDirty(c);
  }
  function drawFloor() {
    var ppu = nes0.ppu, lv = g.lv, th = theme();
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
      resetShadow(); clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_DARK); ppu.setBgPalette(1, th.dim); ppu.setBgPalette(2, th.lit); ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(0, SPR_P); ppu.setSprPalette(1, SPR_FX);
      for (var y = 0; y < g.H; y++) for (var x = 0; x < g.W; x++) put(0, g.OX + x, g.OY + y, cellTile(idx(x, y)));
      // fix-r7-maze P3-5：狀態列下移一列（第 2 / 3 列，不貼 y = 0）；原第 3 列的外框線讓給狀態列
      var c;
      wantA.fill(0);
      for (c = 0; c < 16; c++) { wantA[c] = 3; wantA[16 + c] = 3; wantA[14 * 16 + c] = 3; }
      drawHud(true);
      drawMapFrame();
      light(true);
      syncAll();
    });
  }
  function drawMapFrame() {
    var mw = (g.W + 1) >> 1, mh = (g.H + 1) >> 1, c, r;
    g.MX0 = (32 - mw) >> 1; g.MY0 = 7 + ((13 - mh) >> 1);
    text(1, 2, 2, padR('MAP  ' + (g.lv.spec.n ? 'F' + g.lv.spec.n + ' ' : '') + g.lv.spec.name, 28));
    for (c = 1; c < 31; c++) { put(1, c, 4, art.t('FR_H')); put(1, c, 21, art.t('FR_H')); }
    for (r = 0; r < mh; r++) for (c = 0; c < mw; c++) put(1, g.MX0 + c, g.MY0 + r, art.t('MQ0'));
    // 圖例
    put(1, 3, 23, art.t('MK_EXIT')); text(1, 5, 23, 'EXIT');
    put(1, 11, 23, art.t('MK_KEY')); text(1, 13, 23, 'KEY');
    put(1, 18, 23, art.t('MK_DOOR')); text(1, 20, 23, 'DOOR');
    put(1, 3, 25, art.t('MK_SW')); text(1, 5, 25, 'SWITCH');
    put(1, 13, 25, art.t('MK_SHARD')); text(1, 15, 25, 'SHARD');
    put(1, 22, 25, art.t('MK_LAMP')); text(1, 24, 25, 'LAMP');
    text(1, 6, 27, 'SELECT / B: CLOSE');
  }
  function mapDirty(c) {
    if (!g.known || !g.known[c]) return;
    var x = c % g.W, y = (c / g.W) | 0, mx = x >> 1, my = y >> 1;
    put(1, g.MX0 + mx, g.MY0 + my, mapTile(mx, my));
  }
  function mapTile(mx, my) {
    var best = 99, mk = null, mask = 0, lv = g.lv;
    for (var q = 0; q < 4; q++) {
      var x = mx * 2 + (q & 1), y = my * 2 + (q >> 1);
      if (x >= g.W || y >= g.H) continue;
      var c = idx(x, y);
      if (!g.known[c]) continue;
      var t = lv.grid[c], pri = 99, name = null;
      if (t === T.EXIT) { pri = 0; name = 'MK_EXIT'; }
      else if (t === T.KEY && !g.got[c]) { pri = 1; name = 'MK_KEY'; }
      else if (t === T.DOOR && !(g.dm & (1 << g.im.d[c]))) { pri = 2; name = 'MK_DOOR'; }
      else if (t === T.SWITCH) { pri = 3; name = 'MK_SW'; }
      else if (t === T.SHARD && !g.got[c]) { pri = 4; name = 'MK_SHARD'; }
      else if (t === T.LAMP && !g.got[c]) { pri = 5; name = 'MK_LAMP'; }
      if (pri < best) { best = pri; mk = name; }
      if (t !== T.WALL) mask |= 1 << q;
    }
    return art.t(mk || ('MQ' + mask));
  }

  /* ============================== HUD ============================== */
  function keysHeld() { return Gen.popc(g.km) - Gen.popc(g.dm); }
  function drawHud(full) {
    var lv = g.lv;
    if (g.paused) {
      text(0, 1, 2, padR('PAUSED', 30));
      text(0, 1, 3, padR('B: RETRY FLOOR   START: RESUME', 30));
      text(0, 0, 28, padR(' HOLD START+SELECT: MENU', 32));
      return;
    }
    var name = (lv.spec.n ? 'F' + lv.spec.n + ' ' : '') + lv.spec.name;
    text(0, 1, 2, padR(name, 19) + '⚿' + keysHeld() + '  ✦' + g.shards + '/' + lv.shards.length + '  ');
    text(0, 1, 3, 'TIME ' + mmss(g.ft) + ' PAR ' + mmss(lv.par * 60) + '  ◎' + g.compass + ' ' + (lv.switches.length ? (g.sw ? '☼' : '☾') : ' ') + ' ');
    var line = g.msgT > 0 ? g.msg : 'SELECT MAP   B COMPASS';
    text(0, 0, 28, ' ' + padR(line, 31));
  }

  /* ============================== 視野（屬性表）+ 探索記錄 ============================== */
  function light(force) {
    var p = g.p, pcx = p.x + 4, pcy = p.y + 4, r1 = g.r1, r2 = g.r2;
    if (g.boostT > 0) { r1 = 72; r2 = 104; }
    var key = pcx + ',' + pcy + ',' + r1 + ',' + r2;
    if (!force && key === g.lightKey) return;
    g.lightKey = key;
    var R1 = r1 * r1, R2 = r2 * r2;
    for (var by = 2; by <= 13; by++) {
      for (var bx = 0; bx < 16; bx++) {
        var dx = bx * 16 + 8 - pcx, dy = by * 16 + 8 - pcy, d = dx * dx + dy * dy;
        // fix-r7-maze P2-3：走過記憶——已探索的區塊離開頭燈後維持微光組 1（不降回 0），只有沒去過的才全黑
        var pal = d <= R1 ? 2 : (d <= R2 ? 1 : (g.kb[by * 16 + bx] ? 1 : 0));
        putA(bx, by, pal);
        if (pal) markBlock(bx, by);
      }
    }
  }
  function markBlock(bx, by) {
    for (var q = 0; q < 4; q++) {
      var cx = bx * 2 + (q & 1) - g.OX, cy = by * 2 + (q >> 1) - g.OY;
      if (cx < 0 || cy < 0 || cx >= g.W || cy >= g.H) continue;
      g.kb[by * 16 + bx] = 1;                                  // 這塊有迷宮格 ⇒ 記成「去過」
      var c = idx(cx, cy);
      if (!g.known[c]) { g.known[c] = 1; mapDirty(c); }
    }
  }

  /* ============================== 移動 / 機關 ============================== */
  function occupied(c) { var p = g.p; return c === idx(p.cx, p.cy) || (p.moving && c === idx(p.tx, p.ty)); }
  function shiftClosed(c) { var t = g.lv.grid[c]; return (t === T.SHIFT0 || t === T.SHIFT1) && g.shiftSt[c] === 2; }
  // 試著從目前格往 d 走：回傳 true = 開始移動（鎖門在這一刻打開）
  function tryMove(d) {
    var p = g.p, nx = p.cx + DX[d], ny = p.cy + DY[d];
    if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return false;
    var n = idx(nx, ny), t = g.lv.grid[n];
    if (shiftClosed(n)) return false;
    var e = Gen.enterRule(g.lv, n, g.sw, g.dm, g.km, g.im.k, g.im.d);
    if (!e) {
      if ((t === T.DOOR || t === T.GATE_A || t === T.GATE_B) && g.lockMsgT <= 0) {
        g.msg = t === T.DOOR ? 'LOCKED. FIND A KEY' : (t === T.GATE_A ? 'SUN GATE IS SHUT' : 'MOON GATE IS SHUT');
        g.msgT = 90; g.lockMsgT = 40; g.bumps++; AU.sfx('labyrinth_locked');
      }
      return false;
    }
    if (t === T.DOOR && e.dm !== g.dm) { g.dm = e.dm; refreshCell(n); AU.sfx('labyrinth_door'); g.msg = 'THE DOOR OPENS'; g.msgT = 60; }
    p.moving = true; p.dir = d; p.face = d; p.tx = nx; p.ty = ny;
    return true;
  }
  function arrive() {
    var p = g.p, c = idx(p.tx, p.ty), t = g.lv.grid[c], prev = idx(p.cx, p.cy);
    p.cx = p.tx; p.cy = p.ty; p.moving = false;
    g.history.push(c); if (g.history.length > 64) g.history.shift();
    if (g.shiftPend[prev]) settleShift(prev);
    var e = Gen.enterRule(g.lv, c, g.sw, g.dm, g.km, g.im.k, g.im.d);
    if (t === T.KEY && !g.got[c]) { g.got[c] = 1; g.km = e.km; refreshCell(c); AU.sfx('labyrinth_key'); g.msg = 'GOT A KEY'; g.msgT = 60; sparkAt(c); }
    else if (t === T.SWITCH) {
      g.sw = e.sw; refreshCell(c);
      g.lv.gates.forEach(refreshCell);
      AU.sfx('labyrinth_switch'); g.msg = g.sw ? 'SUN GATES OPEN' : 'MOON GATES OPEN'; g.msgT = 70;
    } else if (t === T.SHARD && !g.got[c]) { g.got[c] = 1; g.shards++; refreshCell(c); AU.sfx('labyrinth_shard'); sparkAt(c); if (g.shards === g.lv.shards.length) { g.msg = 'ALL SHARDS FOUND!'; g.msgT = 80; } }
    else if (t === T.LAMP && !g.got[c]) { g.got[c] = 1; g.r1 += 16; g.r2 += 16; g.lampOn = true; refreshCell(c); AU.sfx('labyrinth_lamp'); g.msg = 'STAR LAMP! WIDER LIGHT'; g.msgT = 80; sparkAt(c); }
    else if (t === T.EXIT) { floorClear(); return true; }
    return false;
  }
  function sparkAt(c) { g.spark = { x: (g.OX + c % g.W) * 8, y: (g.OY + ((c / g.W) | 0)) * 8 - 4, t: 20 }; }
  function heldDirs(I) { var o = []; for (var d = 0; d < 4; d++) if (I.held(DIRBTN[d])) o.push(d); return o; }
  function wantDir(I) {
    for (var d = 0; d < 4; d++) if (I.pressed(DIRBTN[d])) g.lastDir = d;
    var hs = heldDirs(I);
    if (!hs.length) return [];
    // 優先：最後按下的方向 → 其他按住的方向
    var order = [];
    if (hs.indexOf(g.lastDir) >= 0) order.push(g.lastDir);
    hs.forEach(function (d) { if (order.indexOf(d) < 0) order.push(d); });
    return order;
  }
  function movePlayer(I) {
    var p = g.p, order = wantDir(I), i;
    if (p.moving) {
      // 反向可以立刻掉頭
      if (order.length && order[0] === ((p.dir + 2) & 3)) {
        var ox = p.cx, oy = p.cy; p.cx = p.tx; p.cy = p.ty; p.tx = ox; p.ty = oy; p.dir = (p.dir + 2) & 3; p.face = p.dir;
      }
      var sp = (g.t & 1) ? 2 : 1, tx = (g.OX + p.tx) * 8, ty = (g.OY + p.ty) * 8;
      p.x += Math.max(-sp, Math.min(sp, tx - p.x)); p.y += Math.max(-sp, Math.min(sp, ty - p.y));
      p.step += sp;
      if (p.x === tx && p.y === ty) {
        if (arrive()) return;
        order = wantDir(I);
        for (i = 0; i < order.length; i++) if (tryMove(order[i])) break;
        if (!p.moving && order.length) p.face = order[0];
      }
      return;
    }
    for (i = 0; i < order.length; i++) if (tryMove(order[i])) return;
    if (order.length) p.face = order[0];
  }
  function settleShift(c) {
    g.shiftPend[c] = 0;
    if (!occupied(c)) { g.shiftSt[c] = 2; refreshCell(c); } else g.shiftPend[c] = 1;
  }
  function updateShifts() {
    var lv = g.lv;
    if (!lv.shifts.length) return;
    var ph = ((g.ft / SHIFT_P) | 0) & 1, into = g.ft % SHIFT_P, next = ph ^ 1, toggled = false, near = false;
    var pc = g.p.x + 4, pcy = g.p.y + 4;
    lv.shifts.forEach(function (s) {
      var c = s.c, st = g.shiftSt[c], want;
      if (s.ph === ph) want = 2; else want = (into >= SHIFT_P - SHIFT_WARN) ? 1 : 0;
      if (s.ph === next && into >= SHIFT_P - SHIFT_WARN) want = 1;
      if (want === 2 && st !== 2) {
        if (occupied(c)) { g.shiftPend[c] = 1; if (st !== 1) { g.shiftSt[c] = 1; refreshCell(c); } return; }
        g.shiftPend[c] = 0; toggled = true;
      } else if (want !== 2) g.shiftPend[c] = 0;
      if (want !== st) {
        g.shiftSt[c] = want; refreshCell(c);
        var dx = (g.OX + c % g.W) * 8 + 4 - pc, dy = (g.OY + ((c / g.W) | 0)) * 8 + 4 - pcy;
        if (want === 2 && dx * dx + dy * dy <= g.r2 * g.r2) near = true;
      }
    });
    if (toggled && near) AU.sfx('labyrinth_shift');
  }

  /* ============================== 遊玩更新 ============================== */
  function setPause(on) {
    g.paused = on;
    if (on) AU.pause(); else AU.resume();
    drawHud(true);
  }
  function setMap(on) {
    g.map = on;
    nes0.ppu.scroll(0, 0, on ? 1 : 0);
    AU.sfx('labyrinth_map');
  }
  function updatePlay() {
    var I = NES.Input;
    if (g.map) {
      if ((I.pressed(BTN.SELECT) && !I.held(BTN.START)) || I.pressed(BTN.B)) setMap(false);
      return;
    }
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) { setPause(!g.paused); return; }
    if (g.paused) {
      if (I.pressed(BTN.B)) { g.paused = false; AU.stop(); g.history.push(-1); startFloor(); g.msg = 'RETRY  ' + g.lv.spec.name; g.msgT = 90; }
      return;
    }
    if (I.pressed(BTN.SELECT) && !I.held(BTN.START)) { setMap(true); return; }
    g.ft++;
    if (g.msgT > 0) { g.msgT--; if (g.msgT === 0) drawHud(true); }
    if (g.lockMsgT > 0) g.lockMsgT--;
    if (g.boostT > 0) { g.boostT--; if (g.boostT === 0) g.lightKey = ''; }
    if (g.compT > 0) g.compT--;
    if (g.spark && --g.spark.t <= 0) g.spark = null;
    if (I.pressed(BTN.B)) compassPing();
    updateShifts();
    movePlayer(I);
    if (g.mode !== 'play') return;
    if ((g.ft & 15) === 0) { g.exitAnim ^= 1; refreshExit(); }
    if (++g.flickT >= 8 + (g.ft >> 3) % 5) { g.flickT = 0; g.flick ^= 1; nes0.ppu.setBgPalette(2, g.flick ? theme().lit2 : theme().lit); }
    light(false);
    if ((g.ft % 60) === 0 || g.msgT > 0) drawHud(false);
  }
  function refreshExit() { var c = g.lv.exit; put(0, g.OX + c % g.W, g.OY + ((c / g.W) | 0), cellTile(c)); }
  function compassPing() {
    if (g.compass <= 0) { g.msg = 'COMPASS IS EMPTY'; g.msgT = 50; AU.sfx('labyrinth_locked'); return; }
    g.compass--; g.compT = 90;
    var ex = g.lv.exit, dx = ex % g.W - g.p.cx, dy = ((ex / g.W) | 0) - g.p.cy;
    var ang = Math.atan2(dy, dx), oct = (Math.round(ang / (Math.PI / 4)) + 8) % 8;   // 0 = 東、2 = 南
    g.compDir = oct;
    g.msg = 'THE NEEDLE POINTS ' + ['EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'NORTH', 'NORTHEAST'][oct];
    g.msgT = 90;
    AU.sfx('labyrinth_ping');
  }

  /* ============================== 通關 / 結算 / 結局 ============================== */
  function floorClear() {
    var lv = g.lv, run = g.run;
    g.mode = 'clearing'; g.clearT = 0;
    AU.stop(); AU.sfx('labyrinth_exit');
    var stars = 1 + (g.ft <= lv.par * 60 ? 1 : 0) + (g.shards >= lv.shards.length ? 1 : 0);
    var res = { n: lv.spec.n, name: lv.spec.name, t: g.ft, par: lv.par, shards: g.shards, total: lv.shards.length, stars: stars, newBest: false };
    run.total += g.ft; run.cleared++;
    if (!g.cheated) g.floorsCleared++;
    if (run.kind !== 'rand' && lv.spec.n) {
      var rc = floorRec(lv.spec.n) || { t: 0, s: 0 };
      if (!rc.t || g.ft < rc.t) { rc.t = g.ft; res.newBest = true; }
      rc.s = Math.max(rc.s | 0, stars);
      CT.save('labyrinth', 'f' + lv.spec.n, rc);
      res.best = rc;
      if (lv.spec.n + 1 > reach()) CT.save('labyrinth', 'reach', Math.min(9, lv.spec.n + 1));
    }
    if (run.kind === 'adv' && run.startFloor === 1 && !g.cheated && run.cleared >= GOAL_FLOORS) g.goalHit = true;
    g.result = res;
  }
  function enterResult() {
    g.mode = 'clear'; g.clearT = 0;
    var ppu = nes0.ppu, r = g.result, run = g.run;
    CT.blank(nes0, function () {
      ppu.scroll(0, 0, 0); resetShadow(); clearSpr();
      ppu.setBgPalette(0, PAL_T0); ppu.setBgPalette(1, PAL_T1); ppu.setBgPalette(2, PAL_T2); ppu.setBgPalette(3, PAL_HUD);
      for (var c = 3; c < 29; c++) { put(0, c, 3, art.t('FR_H')); put(0, c, 26, art.t('FR_H')); }
      text(0, 6, 5, (r.n ? 'FLOOR ' + r.n + '  ' : '') + 'CLEAR!');
      text(0, 6, 7, r.name);
      text(0, 6, 10, 'TIME     ' + mmss(r.t) + (r.newBest ? '  NEW!' : ''));
      text(0, 6, 12, 'PAR      ' + mmss(r.par * 60));
      text(0, 6, 14, 'SHARDS   ' + r.shards + '/' + r.total);
      var st = art.text(starStr(r.stars));
      for (var i = 0; i < 3; i++) put(0, 13 + i * 2, 17, st[i]);
      if (r.best) text(0, 6, 20, 'BEST     ' + mmss(r.best.t) + '  ' + starStr(r.best.s));
      if (run.kind === 'adv') text(0, 6, 22, 'TOTAL    ' + mmss(run.total));
      var last = run.kind !== 'rand' && (run.kind === 'one' || r.n >= 9);
      text(0, 6, 24, last ? 'A: FINISH' : 'A: NEXT   START: TITLE');   // fix-r7-maze P3-4：原 28 字超出 32 欄
      wantA.fill(0);
      for (c = 0; c < 16; c++) { wantA[2 * 16 + c] = 1; wantA[8 * 16 + c] = 3; }
      syncAll();
    });
    AU.play('labyrinth_clear');
  }
  function nextFromResult() {
    var run = g.run, r = g.result;
    if (run.kind === 'rand') { run.seed++; g.seed = run.seed; run.floor++; startFloor(); return; }
    if (run.kind === 'one') { enterTitle(); return; }
    if (r.n >= 9) { enterEnd(); return; }
    run.floor++; startFloor();
  }
  function enterEnd() {
    g.mode = 'end'; g.endT = 0;
    var run = g.run, secs = Math.floor(run.total / 60), ppu = nes0.ppu, nb = false;
    if (!run.cheated && !g.cheated && run.startFloor === 1) {
      var best = CT.load('labyrinth', 'best', 0) | 0;
      if (!best || secs < best) { CT.save('labyrinth', 'best', secs); nb = true; }
    }
    CT.blank(nes0, function () {
      ppu.scroll(0, 0, 0); resetShadow(); clearSpr();
      ppu.setBgPalette(0, PAL_T0); ppu.setBgPalette(1, PAL_T1); ppu.setBgPalette(2, PAL_T2);
      for (var c = 3; c < 29; c++) { put(0, c, 4, art.t('FR_H')); put(0, c, 25, art.t('FR_H')); }
      text(0, 6, 7, 'THE LABYRINTH IS LIT');
      text(0, 6, 10, 'ALL 9 FLOORS EXPLORED');
      text(0, 6, 14, 'TOTAL TIME  ' + mmss(run.total) + (nb ? ' NEW!' : ''));
      var stars = 0;
      for (var n = 1; n <= 9; n++) { var rc = floorRec(n); stars += rc ? rc.s | 0 : 0; }
      text(0, 6, 17, 'STARS       ' + pad(stars, 2) + '/27');
      text(0, 6, 21, 'THANK YOU, LUMEN!');
      text(0, 6, 23, 'START: TITLE');
      wantA.fill(0);
      for (c = 0; c < 16; c++) wantA[3 * 16 + c] = 1;
      syncAll();
    });
    AU.play('labyrinth_end');
  }

  /* ============================== 精靈 ============================== */
  var lines = new Uint8Array(240);
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function drawSprites() {
    var ppu = nes0.ppu, list = [], p = g.p, i;
    if (g.mode === 'play' || g.mode === 'clearing') {
      if (g.map) {
        if ((g.t >> 3) & 1) list.push({ x: g.MX0 * 8 + p.cx * 4, y: g.MY0 * 8 + p.cy * 4, tile: art.s('MAPDOT'), pal: 1 });
      } else {
        var fr = ((p.step >> 2) & 1), name, flip = false;
        if (p.face === 0) name = 'P_U' + fr; else if (p.face === 2) name = 'P_D' + fr; else { name = 'P_S' + fr; flip = p.face === 3; }
        if (g.mode === 'clearing') { name = ['P_D0', 'P_S0', 'P_U0', 'P_S0'][(g.clearT >> 2) & 3]; flip = ((g.clearT >> 2) & 3) === 3; }
        list.push({ x: p.x, y: p.y, tile: art.s(name), pal: 0, flipH: flip });
        if (g.compT > 0 && ((g.compT >> 2) & 1)) {
          var o = g.compDir, ax = [1, 1, 0, -1, -1, -1, 0, 1][o], ay = [0, 1, 1, 1, 0, -1, -1, -1][o];
          var tile = (o & 1) ? 'ARR_NE' : (o === 0 || o === 4 ? 'ARR_E' : 'ARR_N');
          var fh = (o === 4 || o === 3 || o === 5), fv = (o === 2 || o === 1 || o === 3);
          list.push({ x: p.x + ax * 11, y: p.y + ay * 11, tile: art.s(tile), pal: 1, flipH: fh, flipV: fv });
        }
        if (g.spark) list.push({ x: g.spark.x, y: g.spark.y - (20 - g.spark.t) / 2 | 0, tile: art.s(g.spark.t > 10 ? 'SPARK' : 'TWINK'), pal: 1 });
        if (g.mode === 'clearing') list.push({ x: p.x + (((g.clearT >> 1) & 1) ? -6 : 6), y: p.y - 8 - (g.clearT >> 2), tile: art.s('SPARK'), pal: 1 });
      }
    }
    lines.fill(0);
    var n = 0;
    for (i = 0; i < list.length && n < 60; i++) {
      var s = list[i];
      if (s.y < -7 || s.y >= 240) continue;
      for (var l = Math.max(0, s.y); l < s.y + 8 && l < 240; l++) lines[l]++;
      ppu.sprite(n++, s);
    }
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
    var m = 0;
    for (i = 0; i < 240; i++) if (lines[i] > m) m = lines[i];
    if (m > g.maxLine) g.maxLine = m;
  }

  /* ============================== 機器人（解題器 + 尋路操作十字鍵） ============================== */
  function dirTo(a, b) { var W = g.W, d = b - a; return d === -W ? 0 : (d === 1 ? 1 : (d === W ? 2 : (d === -1 ? 3 : -1))); }
  function botMask() {
    var B = g.bot;
    B.t++;
    if (g.mode === 'title') {
      if (g.row !== 0) return (B.t % 16 === 8) ? BTN.UP : 0;
      return (B.t % 40 === 20) ? BTN.START : 0;
    }
    if (g.mode === 'intro') return (g.introT > 30 && B.t % 20 === 10) ? BTN.A : 0;
    if (g.mode === 'clear') return (g.clearT > 70 && B.t % 30 === 15) ? BTN.A : 0;
    if (g.mode === 'end') return (g.endT > 90 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode !== 'play') return 0;
    if (g.map) return (B.t % 20 === 10) ? BTN.SELECT : 0;
    if (g.paused) return (B.t % 20 === 10) ? BTN.START : 0;
    var p = g.p, cur = idx(p.cx, p.cy);
    if (B.plan) {                                       // 沿計畫前進：目前格在計畫裡（從 pi 往後找）就跟上，否則重新規劃
      var at = B.plan.indexOf(cur, B.pi);
      if (at < 0 || at > B.pi + 1) B.plan = null; else B.pi = at;
    }
    if (!B.plan) {
      B.plan = Gen.solve(g.lv, cur, g.sw, g.dm, g.km & ((1 << g.lv.keys.length) - 1)); B.pi = 0; B.replans++;
      if (!B.plan) return 0;
    }
    var k = B.pi;                                       // 下一個「要決定方向」的格
    if (p.moving) {
      k = B.plan.indexOf(idx(p.tx, p.ty), B.pi);
      if (k < 0) { B.plan = null; return 0; }
      var nxt = B.plan[k + 1];
      if (nxt === undefined) return 0;
      var d1 = dirTo(B.plan[k], nxt);
      if (d1 === ((p.dir + 2) & 3)) return 0;           // 走進死路撿東西再回頭：不在移動中按反方向（免得半路掉頭）
      if (shiftClosed(nxt)) return 0;
      return DIRBTN[d1];
    }
    var n2 = B.plan[k + 1];
    if (n2 === undefined) return 0;
    if (shiftClosed(n2)) { B.waits++; return 0; }
    var d2 = dirTo(cur, n2);
    return d2 >= 0 ? DIRBTN[d2] : 0;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'labyrinth', order: 7, title: '星塵迷宮探索', legacy: ['maze-game.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = L.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'labyrinth_bg');
      NES.CHR.setPattern(1, 'labyrinth_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: art.s('BACK'), pal: 1 };       // §6-4：實心金星（8×8）
      AU.init(nes);
      g = newState();
      g.noHint = !!(CT.query && CT.query('hint') === '0');    // 測試 / 量測用：?hint=0 跳過說明卡
      var qs = CT.query ? CT.query('seed') : null, qf = CT.query ? CT.query('floor') : null;
      if (qs) g.seed = Math.max(1, parseInt(qs, 10) || 1);
      if (qf) { var fn = Math.max(1, Math.min(9, parseInt(qf, 10) || 1)); g.selFloor = fn; startRun('one', fn); }
      else if (qs) startRun('rand', 1, g.seed);
      else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      g.t++;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'play') {
          g.cheated = true; if (g.run) g.run.cheated = true;
          g.boostT = 1200; g.lightKey = '';
          g.km |= 1 << (8 + (g.cheats & 7));               // 萬用鑰匙（虛擬位元，不會和真鑰匙撞）
          for (var c = 0; c < g.known.length; c++) if (!g.known[c]) { g.known[c] = 1; mapDirty(c); }
          for (var bb = 2 * 16; bb < 14 * 16; bb++) markBlock(bb & 15, bb >> 4);   // 走過記憶也全開（頭燈收回後整張圖保持微光）
          g.msg = 'STAR SIGHT! MAP + LIGHT + KEY'; g.msgT = 90; AU.sfx('labyrinth_lamp');
        }
      }
      if (g.mode === 'title') {
        var ch = false;
        if (I.pressed(BTN.UP)) { g.row = (g.row + 2) % 3; ch = true; }
        else if (I.pressed(BTN.DOWN)) { g.row = (g.row + 1) % 3; ch = true; }
        else if (I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT)) {
          var d = I.pressed(BTN.LEFT) ? -1 : 1;
          if (g.row === 1) { var R = reach(); g.selFloor = ((g.selFloor - 1 + d + R) % R) + 1; ch = true; }
          else if (g.row === 2) { g.seed = ((g.seed - 1 + d + 99999) % 99999) + 1; ch = true; }
        } else if (I.pressed(BTN.B) && g.row === 2) { g.seed = 1 + ((g.t * 7919 + g.seed * 31) % 99999); ch = true; }
        if (ch) { titleRows(); AU.sfx('labyrinth_move'); }
        else if ((I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) {
          AU.sfx('labyrinth_ok');
          if (g.row === 0) startRun('adv', 1); else if (g.row === 1) startRun('one', g.selFloor); else startRun('rand', 1, g.seed);
        }
      } else if (g.mode === 'intro') {
        if (++g.introT > 20 && (I.pressed(BTN.A) || I.pressed(BTN.START)) && !I.held(BTN.SELECT)) { AU.sfx('labyrinth_ok'); closeIntro(); }
      } else if (g.mode === 'play') updatePlay();
      else if (g.mode === 'clearing') { if (++g.clearT >= 60) enterResult(); }
      else if (g.mode === 'clear') {
        g.clearT++;
        if (g.clearT > 30 && I.pressed(BTN.A)) nextFromResult();
        else if (g.clearT > 30 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) { saveProgress(); enterTitle(); }
      } else if (g.mode === 'end') {
        g.endT++;
        if (g.endT > 60 && (I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) enterTitle();
      }
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title' && (g.t & 31) === 0) text(0, 11, 9, (g.t & 32) ? '          ' : 'PUSH START');
      if (g.mode === 'play' && g.paused && (g.t & 63) === 0) { /* 暫停畫面靜止 */ }
      flush();
      drawSprites();
    },
    state: function () {
      var lv = g.lv, p = g.p;
      return {
        mode: g.mode, row: g.row, paused: g.paused, map: g.map, t: g.t, ft: g.ft,
        floor: g.run ? g.run.floor : 0, kind: g.run ? g.run.kind : null, name: lv ? lv.spec.name : '',
        W: g.W, H: g.H, cx: p.cx, cy: p.cy, px: p.x, py: p.y, moving: p.moving,
        keys: lv ? keysHeld() : 0, sw: g.sw, dm: g.dm, km: g.km, shards: g.shards, shardTotal: lv ? lv.shards.length : 0,
        r1: g.r1, r2: g.r2, boost: g.boostT, compass: g.compass, cleared: g.run ? g.run.cleared : 0, floorsCleared: g.floorsCleared,
        result: g.result, cheated: g.cheated, cheats: g.cheats, maxLine: g.maxLine, writes: wstat.last, writePeak: wstat.peak,
        attrPeak: wstat.attrPeak, backlogPeak: wstat.backlogPeak, queue: qA.length + qT[0].length + qT[1].length,
        intro: g.intro ? g.intro.map(function (h) { return h.bit; }) : null, seen: seenMask(), kb: g.kb ? g.kb.reduce(function (a, b) { return a + b; }, 0) : 0,
        bot: { replans: g.bot.replans, waits: g.bot.waits }, goal: !!(g.goalHit && !g.cheated)
      };
    },
    exit: function () { saveProgress(); AU.stop(); },        // §6-3
    cheat: function () { if (!g || g.mode !== 'play') return false; g.cheatReq = true; g.cheats++; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () {                                   // §1-5：右對齊 6 字元
      var b = CT.load('labyrinth', 'best', 0) | 0;
      if (b > 0) return ' ' + mmss(b * 60);
      return 'FLR ' + pad(reach() - 1, 2);
    }
  };
  function saveProgress() {
    if (!g || !g.lv || !g.run) return;
    // 中途離開：已破的層在 floorClear 就存了；這裡只確保 reach 不倒退（純防呆）
    var r = CT.load('labyrinth', 'reach', 1) | 0;
    if (r < 1) CT.save('labyrinth', 'reach', 1);
  }
  L.THEMES = THEMES; L.GOAL_FLOORS = GOAL_FLOORS; L.SHIFT_P = SHIFT_P;
  L.dev = {
    g: function () { return g; },
    start: function (kind, n, seed) { startRun(kind || 'one', n || 1, seed); },
    shadow: function () { return { wantA: wantA, haveA: haveA, wantT: wantT, haveT: haveT }; },
    mapTile: function (mx, my) { return mapTile(mx, my); },
    tryMove: tryMove, light: light, refreshCell: refreshCell, compassPing: compassPing,
    clear: function () { floorClear(); },
    wstat: wstat, flush: flush
  };
  if (CT.register) CT.register(GAME);
})();
