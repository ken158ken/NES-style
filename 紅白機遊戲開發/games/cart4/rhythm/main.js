/*
 * games/cart4/rhythm/main.js — 《星塵節奏 STAR BEAT》（合輯卡帶四 槽 5，id = rhythm）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：rhythm/{song,chart,art}.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/rhythm-game / rhythm-tap / piano-tiles / sound-wave-rush / beat-samurai（只取
 *   「跟著拍點按鍵、判定分級、連擊、評價」與「節拍上斬擊來襲物」的玩法；曲子 / 譜面 / 外觀 / 角色全部原創）
 *
 * ★ 同步：譜面時間只看 APU driver —— songFrame = rowsPlayed × speed + rowFrame − 1（= 這一幀發聲的是全曲第幾幀），
 *   每顆音符的時間 = row × speed（chart.js 從曲子的 p1 / noi onset 推出）。不讀 Date.now / performance.now；
 *   暫停（driver.pause）時 rowsPlayed 不動 ⇒ 譜面也一起停；曲子結束（loop:false 自己 stop）後才改用每幀 +1 收尾。
 * ★ 判定窗口（幀，|按下那幀的 songFrame − 音符幀|）：PERFECT ≤ 2、GREAT ≤ 5、GOOD ≤ 8，過了 8 幀沒按 = MISS。
 *   空按（該軌前後 16 幀內沒有音符）能量 −1、不斷連擊；提早 9~16 幀的按鍵不判定也不扣（狂按會把能量按光）。
 * 模式：CROSS 星十字（十字鍵 4 軌）/ DUO 雙星（B ← / A →，十字鍵左右也可）/ ORBIT 繞行（單鍵 A 或 B）/ BLADE 節拍武士（← 或 B 斬左、→ 或 A 斬右）。
 * 難度 EASY / NORMAL / HARD（密度 / 飛行時間 / 失誤扣能量）；SIGHT：FULL / FADE（音符飛到一半就隱形）/ EAR（看不到音符，
 *   每顆音符前一拍有該軌音高的預告音 —— 「只靠聲音」的進階模式）。四軌命中音各自音高（C6 / E6 / G6 / C7）。
 * 評價：ACC =（PERFECT×100 + GREAT×70 + GOOD×40）/ 音符數；S ≥ 95、A ≥ 85、B ≥ 70、C ≥ 55、其餘 D；能量歸零 = FAILED（F）。
 * goal = CROSS 模式 NORMAL 難度，前 3 首（STAR LINE / COMET PARADE / NEBULA FUNK）都拿到 B 以上，且整個過程沒用密技。
 * 密技（C / ★）：遊玩中 = 能量補滿；能量耗盡（FAILED 畫面）= 原地續關（driver.resume 從同一 row 接續、能量 60）；
 *   失敗後的結算畫面 = 同一首從頭重來；標題無效。用過密技 ⇒ 本次開機 goal() 一律 false。
 * 每線 8 精靈：左右臂共用一條水平帶，chart.js 保證同時在畫面上的 ← / → 音符 ≤ 6；BLADE 每條高度 ≤ 3 隻；
 *   另有逐線配額器（命中火花最低優先，排不下就這幀不畫）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var RH = CT.Rhythm = CT.Rhythm || {};
  var AU = RH.Audio, CH = RH.Chart;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var MODES = CH.MODES, DIFFS = CH.DIFFS, WIN = CH.WIN, LATE = CH.LATE;
  var MODE_DESC = { CROSS: '4 GATES', DUO: 'B + A', ORBIT: '1 BUTTON', BLADE: 'SAMURAI' };
  var SIGHTS = ['FULL', 'FADE', 'EAR'];
  var SIGHT_DESC = ['SEE ALL', 'VANISH', 'LISTEN'];
  var RANKS = ['S', 'A', 'B', 'C', 'D', 'F'];
  var RANK_MIN = [95, 85, 70, 55, 0];
  var GOAL_SONGS = 3, GOAL_RANK = 2;        // 前 3 首、B（索引 2）以上
  var ARM = 72, BLADE_D = 96;
  var GATE = [{ x: 128, y: 100 }, { x: 128, y: 164 }, { x: 100, y: 128 }, { x: 164, y: 128 }];
  var GATE_BLK = [[8, 6], [8, 10], [6, 8], [10, 8]];
  var ENERGY0 = 60;
  var SIN = (function () { var t = [], i; for (i = 0; i < 256; i++) t.push(Math.round(Math.sin(i * Math.PI / 128) * 256)); return t; })();

  var PAL_BG0 = [0x11, 0x01, 0x31], PAL_GATE = [0x00, 0x10, 0x30], PAL_CORE = [0x04, 0x14, 0x24], PAL_CORE_HI = [0x14, 0x24, 0x30], PAL_HUD = [0x11, 0x27, 0x30];
  var PAL_LANE = [[0x0C, 0x2C, 0x30], [0x09, 0x2A, 0x30], [0x07, 0x27, 0x38], [0x05, 0x25, 0x35]];
  var PAL_ZAN = [0x0F, 0x11, 0x3C], PAL_IMP = [0x0F, 0x16, 0x37], PAL_WISP = [0x0F, 0x13, 0x33], PAL_FX = [0x28, 0x38, 0x30];
  var PAL_GROUND = [0x0C, 0x1C, 0x2C], PAL_PLANET = [0x03, 0x13, 0x23];

  var art = null, nes0 = null, g = null, sess = null;

  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function bestFmt(n) { return pad(Math.min(999999, n), 6); }
  function ms(f) { return Math.round(f * 1000 / 60.0988); }
  function hash(a, b) { var h = (a * 2654435761 ^ (b + 0x9E3779B9) * 40503) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return h >>> 0; }

  function newSess() { return { cheated: false, clr: {}, runs: 0, bot: { t: 0, lag: 12, jit: 3 } }; }
  function newState() {
    return {
      mode: 'title', row: 0, msel: 0, song: 0, diff: 1, sight: 0, t: 0, paused: false,
      chart: null, notes: [], head: 0, s: -1, sp: 6, T: 72, ended: false, post: 0,
      score: 0, combo: 0, maxCombo: 0, cnt: [0, 0, 0, 0], energy: ENERGY0, judge: '', judgeT: 0, dt: 0, cheated: false,
      fx: [], gateT: [0, 0, 0, 0], beat: -1, zanT: 0, zanSide: 1, zanH: 0, hurtT: 0, overT: 0, cdShown: '',
      hud: {}, base: {}, sprUsed: 0, maxLine: 0, hidden: 0, failed: false, rank: -1, acc: 0, newBest: false, cued: 0, fails: 0, continues: 0
    };
  }

  /* ============================== BG 工具 ============================== */
  function put(row, col, tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var c = col + i; if (c < 0 || c > 31) continue;
      var k = row * 32 + c;
      if (g.hud[k] === tiles[i]) continue;
      g.hud[k] = tiles[i];
      nes0.ppu.setTile(0, c, row, tiles[i]);
    }
  }
  function txt(row, col, s) { put(row, col, art.text(s)); }
  function dim(row, col, s) { put(row, col, art.dim(s)); }
  function base(c, r, name) { var t = art.t(name); g.base[r * 32 + c] = t; g.hud[r * 32 + c] = t; nes0.ppu.setTile(0, c, r, t); }
  function restoreRow(row) {
    var out = [];
    for (var c = 0; c < 32; c++) out.push(g.base[row * 32 + c] || 0);
    put(row, 0, out);
  }
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function starField(skip) {
    for (var r = 1; r < 29; r++) for (var c = 0; c < 32; c++) {
      if (skip && skip(c, r)) continue;
      var h = ((c * 2654435761) ^ (r * 40503)) >>> 0;
      if (h % 23 === 5) base(c, r, 'ST1'); else if (h % 41 === 9) base(c, r, 'ST2'); else if (h % 37 === 2) base(c, r, 'ST3');
    }
  }

  /* ============================== 標題 ============================== */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr();
      g.hud = {}; g.base = {};
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_BG0); ppu.setBgPalette(1, PAL_GATE); ppu.setBgPalette(2, PAL_CORE_HI); ppu.setBgPalette(3, PAL_HUD);
      for (var i = 0; i < 4; i++) ppu.setSprPalette(i, PAL_LANE[i]);
      var w = 'STAR BEAT';
      for (var k = 0; k < w.length; k++) {
        if (w.charAt(k) === ' ') continue;
        var t = art.big(w.charAt(k)), x = 7 + k * 2;
        ppu.setTile(0, x, 3, t[0]); ppu.setTile(0, x + 1, 3, t[1]); ppu.setTile(0, x, 4, t[2]); ppu.setTile(0, x + 1, 4, t[3]);
      }
      ppu.fillAttr(0, 0, 1, 16, 2, 2);
      for (var c = 2; c < 30; c++) { ppu.setTile(0, c, 1, art.t('FR_H')); ppu.setTile(0, c, 27, art.t('FR_H')); }
      txt(6, 9, 'STARDUST RHYTHM');
      txt(21, 4, 'START PAUSE   C/★ = CHEAT');
      txt(23, 4, 'HOLD START+SELECT: MENU');
      titleRows();
    });
    AU.play('rhythm_title');
  }
  function bestKey(m, s, d) { return MODES[m] + '_' + s + '_' + d; }
  function titleRows() {
    var M = MODES[g.msel], T = RH.TRACKS[g.song];
    txt(9, 3, (g.row === 0 ? '>' : ' ') + ' MODE   ' + padR(M, 7) + padR(MODE_DESC[M], 10));
    txt(11, 3, (g.row === 1 ? '>' : ' ') + ' SONG   ' + (g.song + 1) + ' ' + padR(T.title, 15));
    txt(13, 3, (g.row === 2 ? '>' : ' ') + ' LEVEL  ' + padR(DIFFS[g.diff].id, 7) + padR(T.bpm + 'BPM', 10));
    txt(15, 3, (g.row === 3 ? '>' : ' ') + ' SIGHT  ' + padR(SIGHTS[g.sight], 7) + padR(SIGHT_DESC[g.sight], 10));
    var k = bestKey(g.msel, g.song, g.diff), bs = CT.load('rhythm', 'sc_' + k, 0), br = CT.load('rhythm', 'rk_' + k, -1);
    txt(17, 4, 'BEST ' + bestFmt(bs) + '   RANK ' + (br >= 0 ? RANKS[br] : '-'));
    var map = { CROSS: '↑ ↓ ← → = 4 STAR GATES', DUO: 'Ⓑ = LEFT GATE  Ⓐ = RIGHT', ORBIT: 'Ⓐ OR Ⓑ = TAP ON A MARK', BLADE: '←/Ⓑ CUT LEFT  →/Ⓐ RIGHT' }[M];
    txt(19, 4, padR(map, 25));
  }

  /* ============================== 開局 / 舞台 ============================== */
  function startRun(keepCheat) {
    var keep = { row: g.row, msel: g.msel, song: g.song, diff: g.diff, sight: g.sight };
    var wasCheat = keepCheat ? g.cheated : false;
    g = newState();
    for (var k in keep) g[k] = keep[k];
    g.cheated = wasCheat;
    sess.runs++;
    g.mode = 'play';
    var M = MODES[g.msel];
    g.chart = CH.get(g.song, M, g.diff);
    g.notes = g.chart.notes.map(function (n) { return { t: n.t, row: n.row, lane: n.lane, h: n.h, id: n.id, st: 0, d: 0, fxT: 0 }; });
    g.sp = g.chart.speed; g.T = g.chart.T;
    g.barF = 16 * g.sp;
    g.endS = g.chart.endRow * g.sp;
    buildStage();
    AU.play(RH.TRACKS[g.song].key);
  }
  function buildStage() {
    var ppu = nes0.ppu, M = MODES[g.msel];
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      g.hud = {}; g.base = {};
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_BG0); ppu.setBgPalette(1, PAL_GATE); ppu.setBgPalette(2, PAL_CORE); ppu.setBgPalette(3, PAL_HUD);
      var c, r, i;
      if (M === 'BLADE') {
        ppu.setBgPalette(1, PAL_PLANET); ppu.setBgPalette(2, PAL_GROUND);
        ppu.setSprPalette(0, PAL_ZAN); ppu.setSprPalette(1, PAL_IMP); ppu.setSprPalette(2, PAL_WISP); ppu.setSprPalette(3, PAL_FX);
        starField(function (cc, rr) { return rr < 5 || rr >= 23 || (cc >= 22 && cc < 26 && rr >= 7 && rr < 11); });
        for (i = 0; i < 16; i++) base(22 + (i & 3), 7 + (i >> 2), 'PLN_' + i);
        ppu.fillAttr(0, 11, 3, 2, 2, 1);
        for (c = 0; c < 32; c++) { base(c, 23, 'GR_T'); for (r = 24; r < 30; r++) base(c, r, ((c + r) & 1) ? 'GR_A' : 'GR_B'); }
        ppu.fillAttr(0, 0, 11, 16, 4, 2);
        ppu.fillAttr(0, 0, 0, 16, 3, 3);
        for (c = 0; c < 32; c++) base(c, 5, 'FR_H');
      } else {
        for (i = 0; i < 4; i++) ppu.setSprPalette(i, PAL_LANE[i]);
        var quad = function (cc, rr) { return (cc < 12 || cc >= 20) && (rr < 12 || rr >= 20); };
        starField(function (cc, rr) { return (cc >= 12 && cc < 20) || (rr >= 12 && rr < 20) ? false : false; });
        if (M === 'ORBIT') {
          RH.Art.ORB_MAP.forEach(function (o) { base(o.c, o.r, o.name); });
          for (i = 0; i < 4; i++) base(16 + (i & 1), 16 + (i >> 1), 'CORE_' + i);
          ppu.setAttr(0, 8, 8, 2);
          // 星門旁的按鍵圖（說明對照：CROSS = 十字鍵方向、DUO = B / A）
          if (vert) { base(18, 12, 'K_U'); base(18, 21, 'K_D'); base(12, 18, 'K_L'); base(21, 18, 'K_R'); }
          else { base(12, 18, 'K_B'); base(21, 18, 'K_A'); }
        } else {
          var vert = M === 'CROSS';
          if (vert) for (r = 2; r < 29; r++) { if (r >= 12 && r < 22) continue; base(16, r, 'RV_L'); base(17, r, 'RV_R'); }
          for (c = 2; c < 30; c++) { if (c >= 12 && c < 22) continue; base(c, 16, 'RH_T'); base(c, 17, 'RH_B'); }
          for (var L = 0; L < 4; L++) {
            if (!vert && L < 2) continue;
            var bx = GATE_BLK[L][0], by = GATE_BLK[L][1];
            for (i = 0; i < 4; i++) base(bx * 2 + (i & 1), by * 2 + (i >> 1), 'GATE_' + i);
            ppu.setAttr(0, bx, by, 1);
          }
          for (i = 0; i < 4; i++) base(16 + (i & 1), 16 + (i >> 1), 'CORE_' + i);
          ppu.setAttr(0, 8, 8, 2);
          // 星門旁的按鍵圖（說明對照：CROSS = 十字鍵方向、DUO = B / A）
          if (vert) { base(18, 12, 'K_U'); base(18, 21, 'K_D'); base(12, 18, 'K_L'); base(21, 18, 'K_R'); }
          else { base(12, 18, 'K_B'); base(21, 18, 'K_A'); }
        }
        // 四角面板
        for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) if (quad(c * 2, r * 2)) ppu.setAttr(0, c, r, 3);
        void quad;
      }
      drawHud(true);
    });
  }

  /* ============================== HUD ============================== */
  function gauge() { var out = [], e = g.energy; for (var i = 0; i < 10; i++) { var v = e - i * 10; out.push(art.t(v >= 10 ? 'GA2' : (v >= 5 ? 'GA1' : 'GA0'))); } out.push(art.t('GAE')); return out; }
  function accNow() { var j = g.cnt[0] + g.cnt[1] + g.cnt[2] + g.cnt[3]; return j ? Math.floor((g.cnt[0] * 100 + g.cnt[1] * 70 + g.cnt[2] * 40) / j) : 100; }
  function countdown() {
    var ci = RH.TRACKS[g.song].countIn, bar = Math.floor(g.s / g.barF), beat = Math.floor((g.s % g.barF) / (4 * g.sp));
    if (g.s < 0 || bar >= ci) return '';
    if (bar < ci - 1) return 'READY';
    return ['3', '2', '1', 'GO!'][beat];
  }
  function msgLine() {
    if (g.paused) return 'PAUSE  HOLD START+SELECT: MENU';
    if (g.mode === 'fail') return 'ENERGY OUT!  C/★ = CONTINUE';
    return '';
  }
  function drawHud() {
    var M = MODES[g.msel], T = RH.TRACKS[g.song], j = g.judgeT > 0 ? g.judge : '', cd = countdown();
    var bar = Math.max(0, Math.min(T.bars, Math.floor(Math.max(0, g.s) / g.barF) + 1));
    var dt = g.judgeT > 0 && g.judge !== 'MISS' && g.dt ? (g.dt < 0 ? 'EARLY ' + (-g.dt) + 'F' : 'LATE ' + g.dt + 'F') : '';
    if (M === 'BLADE') {
      txt(1, 1, padR(T.title, 13) + padR(DIFFS[g.diff].id, 7) + 'BAR ' + pad(bar, 2) + '/' + pad(T.bars, 2));
      txt(2, 1, 'SCORE ' + pad(g.score, 6) + '  COMBO ' + pad(g.combo, 3) + '      ');
      put(3, 1, gauge());
      txt(3, 13, padR(cd || j, 8) + padR(dt, 9));
      var ml = msgLine();
      if (ml) txt(4, 1, padR(ml, 30)); else txt(4, 1, padR('', 30));
      return;
    }
    txt(2, 0, padR(T.title, 12));
    dim(4, 1, 'SCORE'); txt(5, 1, pad(g.score, 6));
    dim(7, 1, 'COMBO'); txt(8, 1, pad(g.combo, 3) + '  ');
    dim(10, 1, padR(M + ' ' + DIFFS[g.diff].id.charAt(0) + ' ' + SIGHTS[g.sight], 12));
    dim(2, 20, 'ENERGY'); put(3, 20, gauge());
    dim(5, 20, 'ACC'); txt(6, 20, padR(accNow() + '%', 5));
    dim(8, 20, 'BAR'); txt(9, 20, pad(bar, 2) + '/' + pad(T.bars, 2));
    txt(21, 1, padR(cd || j, 8));
    dim(23, 1, padR(dt, 9));
    dim(21, 20, 'PERF ' + pad(g.cnt[0], 3)); dim(22, 20, 'GRT  ' + pad(g.cnt[1], 3));
    dim(23, 20, 'GOOD ' + pad(g.cnt[2], 3)); dim(24, 20, 'MISS ' + pad(g.cnt[3], 3));
    var m2 = msgLine();
    if (m2) { if (!g.msgOn) { g.msgOn = true; } txt(27, 1, padR(m2, 30)); }
    else if (g.msgOn) { g.msgOn = false; restoreRow(27); }
  }

  /* ============================== 時間 / 判定 ============================== */
  // 這一幀發聲的是全曲第幾幀（driver 的 row / tick）；曲子結束後每幀 +1
  function advanceClock() {
    var st = AU.state();
    if (st && st.playing) { g.s = st.rowsPlayed * g.sp + st.rowFrame - 1; g.ended = false; }
    else if (st && st.paused) { /* 凍結 */ }
    else { g.ended = true; g.s++; }
  }
  function laneMask(I) {
    var M = MODES[g.msel], p = function (b) { return I.pressed(b); }, out = [false, false, false, false];
    if (M === 'CROSS') { out[0] = p(BTN.UP); out[1] = p(BTN.DOWN); out[2] = p(BTN.LEFT); out[3] = p(BTN.RIGHT); }
    else if (M === 'DUO' || M === 'BLADE') { out[2] = p(BTN.B) || p(BTN.LEFT); out[3] = p(BTN.A) || p(BTN.RIGHT); }
    else out[0] = p(BTN.A) || p(BTN.B);
    return out;
  }
  function grade(d) { var a = Math.abs(d); return a <= WIN.PERFECT ? 0 : (a <= WIN.GREAT ? 1 : (a <= WIN.GOOD ? 2 : 3)); }
  var JNAME = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
  function applyJudge(n, q, d) {
    n.st = q < 3 ? 1 : 2; n.d = d; n.fxT = 14;
    g.cnt[q]++; g.judge = JNAME[q]; g.judgeT = 40; g.dt = q < 3 ? d : 0;
    var D = DIFFS[g.diff];
    if (q < 3) {
      g.combo++; if (g.combo > g.maxCombo) g.maxCombo = g.combo;
      g.score += [300, 200, 100][q] + Math.min(100, g.combo * 2);
      g.energy = Math.min(100, g.energy + [2, 1, 0][q]);
      g.gateT[n.lane] = 6;
      AU.sfx('rhythm_hit' + n.lane);
      if (MODES[g.msel] === 'BLADE') { g.zanT = 10; g.zanSide = n.lane === 2 ? 0 : 1; g.zanH = n.h; AU.sfx('rhythm_slash'); }
      if (g.fx.length < 4) g.fx.push({ n: n, t: 12 });
    } else {
      g.combo = 0;
      g.energy = Math.max(0, g.energy - D.drain);
      AU.sfx('rhythm_miss');
      if (MODES[g.msel] === 'BLADE') g.hurtT = 12;
    }
  }
  function judgeFrame() {
    var I = NES.Input, want = laneMask(I), s = g.s, i, n;
    for (var L = 0; L < 4; L++) {
      if (!want[L]) continue;
      var hit = false, near = false;
      for (i = g.head; i < g.notes.length; i++) {
        n = g.notes[i];
        if (n.t - s > 16) break;
        if (n.st || n.lane !== L) continue;
        near = true;
        if (n.t - s <= LATE && s - n.t <= LATE) { applyJudge(n, grade(s - n.t), s - n.t); hit = true; break; }
      }
      // 空按（這一軌前後 16 幀內都沒有音符）：能量 −1、不斷連擊 ⇒ 狂按會把能量按光
      if (!hit && !near) { g.energy = Math.max(0, g.energy - 1); g.empty = (g.empty || 0) + 1; }
      if (MODES[g.msel] === 'BLADE' && g.zanT <= 0) { g.zanT = 6; g.zanSide = L === 2 ? 0 : 1; }
    }
    for (i = g.head; i < g.notes.length; i++) {
      n = g.notes[i];
      if (n.t - s > LATE) break;
      if (!n.st && s - n.t > LATE) applyJudge(n, 3, s - n.t);
    }
    while (g.head < g.notes.length && g.notes[g.head].st && s - g.notes[g.head].t > LATE + 16) g.head++;
  }
  function earCues() {
    if (g.sight !== 2) return;
    var lead = 4 * g.sp;
    for (var i = g.head; i < g.notes.length; i++) {
      var n = g.notes[i];
      if (n.t - lead > g.s) break;
      if (n.t - lead === g.s) { AU.sfx('rhythm_cue' + n.lane); g.cued++; }
    }
  }

  /* ============================== 遊玩 ============================== */
  function setPause(p) {
    g.paused = p;
    if (p) AU.pause(); else AU.resume();
    drawHud();
  }
  function updatePlay() {
    var I = NES.Input;
    if (g.mode === 'play' && I.pressed(BTN.START) && !I.held(BTN.SELECT)) setPause(!g.paused);
    if (g.paused) { AU.tick(); return; }
    if (g.mode === 'fail') {
      AU.tick(); g.overT++;
      if (g.overT > 30 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) { AU.stop(); enterResult(); }
      return;
    }
    AU.tick();
    advanceClock();
    if (g.judgeT > 0) g.judgeT--;
    for (var L = 0; L < 4; L++) if (g.gateT[L] > 0) g.gateT[L]--;
    if (g.zanT > 0) g.zanT--;
    if (g.hurtT > 0) g.hurtT--;
    g.fx = g.fx.filter(function (f) { return --f.t > 0; });
    var cd = countdown();
    if (cd !== g.cdShown) { g.cdShown = cd; if (cd) AU.sfx(cd === 'GO!' ? 'rhythm_go' : (cd === 'READY' ? '' : 'rhythm_ready')); }
    judgeFrame();
    earCues();
    if (g.energy <= 0 && !g.failed) { enterFail(); return; }
    var last = g.notes.length ? g.notes[g.notes.length - 1].t : 0;
    if (g.head >= g.notes.length || g.notes.every(function (n) { return n.st; })) {
      if (g.ended && g.s > Math.max(last, g.endS) + 20) enterResult();
    }
  }
  function enterFail() {
    g.failed = true; g.mode = 'fail'; g.overT = 0; g.fails++;
    AU.pause();
    AU.sfx('rhythm_fail');
    drawHud();
  }
  function continueRun() {         // §6-1 原地續關：從同一 row 接續
    g.mode = 'play'; g.failed = false; g.energy = 60; g.cheated = true; g.continues++;
    sess.cheated = true;
    AU.resume();
    drawHud();
  }

  /* ============================== 結算 ============================== */
  function rankOf(acc) { for (var i = 0; i < RANK_MIN.length; i++) if (acc >= RANK_MIN[i]) return i; return 4; }
  function enterResult() {
    var N = g.notes.length || 1;
    g.acc = Math.floor((g.cnt[0] * 100 + g.cnt[1] * 70 + g.cnt[2] * 40) / N);
    g.rank = g.failed ? 5 : rankOf(g.acc);
    g.mode = 'result'; g.overT = 0;
    var k = bestKey(g.msel, g.song, g.diff);
    g.newBest = false;
    if (!g.cheated) {
      if (g.score > CT.load('rhythm', 'sc_' + k, 0)) { CT.save('rhythm', 'sc_' + k, g.score); g.newBest = true; }
      var pr = CT.load('rhythm', 'rk_' + k, -1);
      if (g.rank < 5 && (pr < 0 || g.rank < pr)) CT.save('rhythm', 'rk_' + k, g.rank);
      if (g.score > CT.load('rhythm', 'best', 0)) CT.save('rhythm', 'best', g.score);
      var ck = MODES[g.msel] + g.diff;
      sess.clr[ck] = sess.clr[ck] || {};
      if (sess.clr[ck][g.song] === undefined || g.rank < sess.clr[ck][g.song]) sess.clr[ck][g.song] = g.rank;
    }
    var ppu = nes0.ppu, T = RH.TRACKS[g.song];
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0);
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 3);
      clearSpr();
      g.hud = {}; g.base = {};
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(2, PAL_CORE_HI); ppu.setBgPalette(3, PAL_HUD);
      for (var c = 3; c < 29; c++) { ppu.setTile(0, c, 2, art.t('FR_H')); ppu.setTile(0, c, 26, art.t('FR_H')); }
      txt(4, 5, g.failed ? 'STAGE FAILED' : 'STAGE CLEAR');
      txt(6, 5, T.title + '  ' + DIFFS[g.diff].id);
      dim(7, 5, MODES[g.msel] + ' ' + SIGHTS[g.sight] + (g.cheated ? '  CHEAT' : ''));
      txt(9, 5, 'PERFECT  ' + pad(g.cnt[0], 3));
      txt(10, 5, 'GREAT    ' + pad(g.cnt[1], 3));
      txt(11, 5, 'GOOD     ' + pad(g.cnt[2], 3));
      txt(12, 5, 'MISS     ' + pad(g.cnt[3] + (g.notes.length - g.cnt[0] - g.cnt[1] - g.cnt[2] - g.cnt[3]), 3));
      txt(14, 5, 'MAX COMBO ' + pad(g.maxCombo, 3));
      txt(16, 5, 'ACCURACY  ' + pad(g.acc, 3) + '%');
      txt(18, 5, 'SCORE  ' + pad(g.score, 6) + (g.newBest ? '  NEW!' : ''));
      var rt = art.big(RANKS[g.rank]);
      dim(9, 22, 'RANK');
      ppu.setTile(0, 22, 11, rt[0]); ppu.setTile(0, 23, 11, rt[1]); ppu.setTile(0, 22, 12, rt[2]); ppu.setTile(0, 23, 12, rt[3]);
      ppu.fillAttr(0, 11, 5, 1, 2, 2);
      txt(21, 5, 'START TITLE   A RETRY');
      if (g.failed) txt(23, 5, 'C/★ = TRY THIS SONG AGAIN');
    });
    AU.play(g.failed ? 'rhythm_fail' : 'rhythm_clear');
  }

  /* ============================== 精靈 ============================== */
  var lines = new Uint8Array(256);
  function room(y, h, need) { for (var l = Math.max(0, y); l < y + h && l < 240; l++) if (lines[l] + need > 8) return false; return true; }
  function take(y, h, n) { for (var l = Math.max(0, y); l < y + h && l < 240; l++) lines[l] += n; }
  function visible(n) {
    var dt = n.t - g.s;
    if (n.st === 1) return false;
    if (n.st === 2 && n.fxT <= 0) return false;
    if (g.sight === 2) return false;
    if (g.sight === 1 && dt < (g.T * 45 / 100 | 0)) return false;
    return true;
  }
  function notePos(n) {
    var dist = ((n.t - g.s) * ARM / g.T) | 0, L = n.lane, G = GATE[L];
    if (L === 0) return { x: G.x, y: G.y - dist };
    if (L === 1) return { x: G.x, y: G.y + dist };
    if (L === 2) return { x: G.x - dist, y: G.y };
    return { x: G.x + dist, y: G.y };
  }
  function orbitPos(t) {
    var a = (((t % g.barF) + g.barF) % g.barF) * 256 / g.barF | 0, C = RH.Art.ORB_C;
    return { x: C.x + ((C.r * SIN[a & 255]) >> 8), y: C.y - ((C.r * SIN[(a + 64) & 255]) >> 8) };
  }
  function bladePos(n) {
    var dist = ((n.t - g.s) * BLADE_D / g.T) | 0;
    return { x: n.lane === 2 ? 110 - dist : 146 + dist, y: n.h ? 144 : 168 };
  }
  function drawSprites() {
    var ppu = nes0.ppu, list = [], i, n, p, M = MODES[g.msel];
    lines.fill(0);
    function add(x, y, tile, pal, fh, fv) { list.push({ x: x, y: y, tile: tile, pal: pal, flipH: !!fh, flipV: !!fv }); }
    if (g.mode === 'title') {
      for (i = 0; i < 2; i++) {
        var yy = 28 + ((SIN[(g.t * 2 + i * 128) & 255] * 4) >> 8), xx = i ? 216 : 24;
        add(xx, yy, art.s('NH_0'), i ? 3 : 2); add(xx, yy + 8, art.s('NH_1'), i ? 3 : 2);
        add(xx + (i ? -16 : 12), yy + 2, art.s('NV_0'), i); add(xx + (i ? -8 : 20), yy + 2, art.s('NV_1'), i);
      }
    } else if (g.mode === 'play' || g.mode === 'fail') {
      if (M === 'BLADE') {
        var zy = 152, zx = 128, cutF = g.zanT > 0, fl = cutF && g.zanSide === 0, fr = cutF ? 'CUT' : 'IDLE';
        take(zy, 32, 2);
        for (i = 0; i < 8; i++) {
          var col = i & 1; if (fl) col ^= 1;
          add(zx + col * 8, zy + (i >> 1) * 8, art.s('ZAN_' + fr + '_' + i), g.hurtT > 0 && (g.hurtT & 2) ? 3 : 0, fl);
        }
        if (cutF) {
          var by = g.zanH ? 144 : 168;
          if (room(by, 16, 1)) { take(by, 16, 1); add(fl ? zx - 8 : zx + 16, by, art.s('BLADE_0'), 0, fl); add(fl ? zx - 8 : zx + 16, by + 8, art.s('BLADE_1'), 0, fl); }
        }
        for (i = g.head; i < g.notes.length; i++) {
          n = g.notes[i];
          if (n.t - g.s > g.T) break;
          if (!visible(n)) continue;
          p = bladePos(n);
          if (n.st === 2) { if (room(p.y + 4, 8, 1)) { take(p.y + 4, 8, 1); add(p.x + 4, p.y + 4, art.s('MK_X'), 3); } continue; }
          if (!room(p.y, 16, 2)) { g.hidden++; continue; }
          take(p.y, 16, 2);
          var nm = n.h ? 'WISP_' : 'IMP_', flp = n.lane === 3, wob = ((g.s >> 3) & 1) && n.h;
          for (var q = 0; q < 4; q++) { var cc = q & 1; if (flp) cc ^= 1; add(p.x + cc * 8, p.y + (q >> 1) * 8 - (wob ? 1 : 0), art.s(nm + q), n.h ? 2 : 1, flp); }
        }
        for (i = 0; i < g.fx.length; i++) {
          var f = g.fx[i], bp = bladePos(f.n), fy = bp.y + 4 - (12 - f.t);
          if (!room(fy, 8, 1)) continue;
          take(fy, 8, 1); add(bp.x + 4, fy, art.s(f.t > 6 ? 'SPARK' : 'TWINK'), 3);
        }
      } else if (M === 'ORBIT') {
        var sp = orbitPos(g.s), sx = sp.x - 8, sy = sp.y - 8;
        take(sy, 16, 2);
        for (i = 0; i < 4; i++) add(sx + (i & 1) * 8, sy + (i >> 1) * 8, art.s('SAT_' + i), 0);
        var look = g.barF - 12;
        for (i = g.head; i < g.notes.length; i++) {
          n = g.notes[i];
          var dt = n.t - g.s;
          if (dt > look) break;
          if (n.st === 1 || (n.st === 2 && n.fxT <= 0)) continue;
          if (g.sight === 2 || (g.sight === 1 && dt < (look >> 1) && n.st === 0)) continue;
          p = orbitPos(n.t);
          if (!room(p.y - 4, 8, 1)) { g.hidden++; continue; }
          take(p.y - 4, 8, 1);
          add(p.x - 4, p.y - 4, art.s(n.st === 2 ? 'MK_X' : (dt < 4 * g.sp ? 'MK_B' : 'MK_S')), n.st === 2 ? 1 : (dt < 4 * g.sp ? 3 : 2));
        }
        for (i = 0; i < g.fx.length; i++) {
          var fp = orbitPos(g.fx[i].n.t), fyy = fp.y - 4 - (12 - g.fx[i].t);
          if (!room(fyy, 8, 1)) continue;
          take(fyy, 8, 1); add(fp.x - 4, fyy, art.s(g.fx[i].t > 6 ? 'SPARK' : 'TWINK'), 3);
        }
      } else {
        for (i = g.head; i < g.notes.length; i++) {
          n = g.notes[i];
          if (n.t - g.s > g.T) break;
          if (!visible(n)) continue;
          p = notePos(n);
          var pal = n.lane;
          if (n.lane < 2) {
            if (p.y > 236 || p.y < 0) continue;
            if (!room(p.y, 8, 2)) { g.hidden++; continue; }
            take(p.y, 8, 2);
            add(p.x, p.y, art.s(n.st === 2 ? 'BLANK' : 'NV_0'), pal); add(p.x + 8, p.y, art.s(n.st === 2 ? 'BLANK' : 'NV_1'), pal);
            if (n.st === 2) list[list.length - 2].tile = art.s('MK_X');
          } else {
            if (!room(p.y, 16, 1)) { g.hidden++; continue; }
            take(p.y, 16, 1);
            if (n.st === 2) { add(p.x, p.y + 4, art.s('MK_X'), pal); continue; }
            add(p.x, p.y, art.s('NH_0'), pal); add(p.x, p.y + 8, art.s('NH_1'), pal);
          }
        }
        for (i = 0; i < g.fx.length; i++) {
          var G = GATE[g.fx[i].n.lane], k = 12 - g.fx[i].t, L2 = g.fx[i].n.lane;
          var ox = L2 === 2 ? -k : (L2 === 3 ? k + 4 : 4), oy = L2 === 0 ? -k : (L2 === 1 ? k : 4);
          var yy2 = G.y + oy - (L2 >= 2 ? 0 : 0);
          if (!room(yy2, 8, 1)) continue;
          take(yy2, 8, 1); add(G.x + ox, yy2, art.s(g.fx[i].t > 6 ? 'SPARK' : 'TWINK'), L2);
        }
      }
    }
    var cnt = 0;
    for (i = 0; i < list.length && cnt < 62; i++) ppu.sprite(cnt++, list[i]);
    for (i = cnt; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = cnt;
    var m = 0;
    for (i = 0; i < 240; i++) if (lines[i] > m) m = lines[i];
    if (m > g.maxLine) g.maxLine = m;
    for (i = 0; i < g.notes.length && i < g.head + 40; i++) if (g.notes[i].st === 2 && g.notes[i].fxT > 0) g.notes[i].fxT--;
  }
  function drawBgFx() {
    var ppu = nes0.ppu, M = MODES[g.msel];
    if (M === 'BLADE') return;
    var beat = g.s >= 0 ? Math.floor(g.s / (4 * g.sp)) : -1, on = g.s >= 0 && (g.s % (4 * g.sp)) < 6;
    if (on !== g.coreOn) { g.coreOn = on; ppu.setBgPalette(2, on ? PAL_CORE_HI : PAL_CORE); }
    void beat;
    if (M === 'ORBIT') return;
    for (var L = 0; L < 4; L++) {
      if (M === 'DUO' && L < 2) continue;
      var lit = g.gateT[L] > 0 ? 2 : 1;
      if (g.gateLit === undefined) g.gateLit = [1, 1, 1, 1];
      if (g.gateLit[L] !== lit) { g.gateLit[L] = lit; ppu.setAttr(0, GATE_BLK[L][0], GATE_BLK[L][1], lit); }
    }
  }

  /* ============================== 機器人（人類模型） ============================== */
  // 看得到的音符才會反應：音符出現在畫面上（飛行起點 t − T）之後至少 lag 幀；按下時機 = 音符幀 + 誤差（±jit 幀，
  // 每顆音符由雜湊決定，可重現）。只讀畫面上看得到的東西（音符位置 = 時間），不讀隱藏狀態；EAR 模式用預告音那一拍。
  function botMask() {
    var B = sess.bot;
    B.t++;
    if (g.mode === 'title') {
      var tgt = botTarget();
      if (!tgt || B.t % 8) return 0;
      var cur = [g.msel, g.song, g.diff, g.sight], want = [tgt.msel, tgt.song, tgt.diff, tgt.sight], r = -1;
      for (var k = 0; k < 4; k++) if (cur[k] !== want[k]) { r = k; break; }
      if (r < 0) return g.t > 30 ? BTN.START : 0;
      return g.row !== r ? BTN.DOWN : BTN.RIGHT;
    }
    if (g.mode === 'result') return (g.overT > 60 && B.t % 30 === 0) ? BTN.START : 0;
    if (g.mode === 'fail') return (g.overT > 40 && B.t % 30 === 0) ? BTN.START : 0;
    if (g.paused || g.mode !== 'play') return 0;
    var M = MODES[g.msel], mask = 0, next = g.s + 1;
    for (var i = g.head; i < g.notes.length; i++) {
      var n = g.notes[i];
      if (n.t - next > LATE + B.jit) break;
      if (n.st) continue;
      var seen = g.sight === 2 ? n.t - 4 * g.sp : n.t - (M === 'ORBIT' ? g.barF - 12 : g.T);
      if (next - seen < B.lag) continue;
      var e = B.jit ? (hash(n.id, sess.runs) % (2 * B.jit + 1)) - B.jit : 0;
      if (next !== n.t + e) continue;
      if (M === 'CROSS') mask |= [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT][n.lane];
      else if (M === 'DUO') mask |= n.lane === 2 ? BTN.B : BTN.A;
      else if (M === 'BLADE') mask |= n.lane === 2 ? BTN.LEFT : BTN.RIGHT;
      else mask |= BTN.A;
    }
    return mask;
  }
  function botTarget() {
    var ck = 'CROSS1', c = sess.clr[ck] || {};
    for (var s = 0; s < GOAL_SONGS; s++) if (c[s] === undefined || c[s] > GOAL_RANK) return { msel: 0, song: s, diff: 1, sight: 0 };
    return null;
  }
  function goalOk() {
    if (sess.cheated) return false;
    var c = sess.clr.CROSS1 || {};
    for (var s = 0; s < GOAL_SONGS; s++) if (c[s] === undefined || c[s] > GOAL_RANK) return false;
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'rhythm', order: 5, title: '星塵節奏', legacy: ['rhythm-game.html', 'rhythm-tap.html', 'piano-tiles.html', 'sound-wave-rush.html', 'beat-samurai.html'],
    init: function (nes) {
      nes0 = nes;
      art = RH.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'rhythm_bg');
      NES.CHR.setPattern(1, 'rhythm_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: art.s('BACK'), pal: 2 };
      AU.init(nes);
      if (!sess) sess = newSess();
      var lag = CT.query ? parseInt(CT.query('lag'), 10) : NaN, jit = CT.query ? parseInt(CT.query('jit'), 10) : NaN;
      if (!isNaN(lag)) sess.bot.lag = lag;
      if (!isNaN(jit)) sess.bot.jit = jit;
      g = newState();
      var qm = CT.query ? CT.query('rmode') : null;
      if (qm) {
        var mi = MODES.indexOf(qm.toUpperCase());
        g.msel = mi < 0 ? 0 : mi;
        g.song = Math.max(0, Math.min(5, (parseInt(CT.query('song'), 10) || 1) - 1));
        g.diff = Math.max(0, Math.min(2, isNaN(parseInt(CT.query('diff'), 10)) ? 1 : parseInt(CT.query('diff'), 10)));
        g.sight = Math.max(0, Math.min(2, parseInt(CT.query('sight'), 10) || 0));
        startRun();
      } else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'fail') continueRun();
        else if (g.mode === 'play') { g.cheated = true; sess.cheated = true; g.energy = 100; g.judge = 'STAR UP!'; g.judgeT = 60; AU.sfx('rhythm_ok'); }
        else if (g.mode === 'result' && g.failed) { sess.cheated = true; startRun(true); g.cheated = true; g.continues++; }
      }
      if (g.mode === 'title') {
        g.t++;
        var ch = false;
        if (I.pressed(BTN.UP)) { g.row = (g.row + 3) % 4; ch = true; }
        else if (I.pressed(BTN.DOWN)) { g.row = (g.row + 1) % 4; ch = true; }
        else if (I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT)) {
          var d = I.pressed(BTN.LEFT) ? -1 : 1;
          if (g.row === 0) g.msel = (g.msel + 4 + d) % 4;
          else if (g.row === 1) g.song = (g.song + 6 + d) % 6;
          else if (g.row === 2) g.diff = (g.diff + 3 + d) % 3;
          else g.sight = (g.sight + 3 + d) % 3;
          ch = true;
        }
        if (ch) { titleRows(); AU.sfx('rhythm_move'); }
        else if ((I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) { AU.sfx('rhythm_ok'); startRun(); }
        AU.tick();
      } else if (g.mode === 'result') {
        g.overT++;
        if (g.overT > 30 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
        else if (g.overT > 30 && I.pressed(BTN.A)) startRun();
        AU.tick();
      } else updatePlay();
    },
    draw: function () {
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) txt(25, 11, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.mode === 'play' || g.mode === 'fail') {
        drawHud();
        drawBgFx();
      }
      drawSprites();
    },
    state: function () {
      var st = AU.state();
      return {
        mode: g.mode, game: MODES[g.msel], song: g.song, songKey: RH.TRACKS[g.song].key, diff: DIFFS[g.diff].id, sight: SIGHTS[g.sight], row: g.row,
        s: g.s, speed: g.sp, T: g.T, notes: g.notes.length, head: g.head,
        perfect: g.cnt[0], great: g.cnt[1], good: g.cnt[2], miss: g.cnt[3], combo: g.combo, maxCombo: g.maxCombo, score: g.score,
        energy: g.energy, acc: g.mode === 'result' ? g.acc : accNow(), rank: g.rank >= 0 ? RANKS[g.rank] : '', failed: g.failed, paused: g.paused,
        musicRow: st ? st.rowsPlayed : -1, musicPlaying: !!(st && st.playing), musicPaused: !!(st && st.paused), cued: g.cued,
        cheated: g.cheated, sessCheated: sess.cheated, continues: g.continues, clr: JSON.parse(JSON.stringify(sess.clr)),
        maxLine: g.maxLine, hidden: g.hidden, runs: sess.runs, lag: sess.bot.lag, jit: sess.bot.jit, goal: goalOk()
      };
    },
    exit: function () { if (g && g.mode === 'play' && g.score > CT.load('rhythm', 'best', 0) && !g.cheated) CT.save('rhythm', 'best', g.score); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title' || (g.mode === 'result' && !g.failed)) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { return bestFmt(CT.load('rhythm', 'best', 0)); }
  };
  RH.MODES = MODES; RH.RANKS = RANKS; RH.RANK_MIN = RANK_MIN;
  RH.dev = {
    g: function () { return g; }, sess: function () { return sess; },
    start: function (mode, song, diff, sight) { g.msel = Math.max(0, MODES.indexOf(mode || 'CROSS')); g.song = song || 0; g.diff = diff === undefined ? 1 : diff; g.sight = sight || 0; startRun(); },
    grade: grade, rankOf: rankOf, notePos: notePos, orbitPos: orbitPos, bladePos: bladePos, ms: ms, bestFmt: bestFmt,
    result: function () { enterResult(); }, resetSess: function () { sess = newSess(); }, setBot: function (lag, jit) { sess.bot.lag = lag; sess.bot.jit = jit; }
  };
  if (CT.register) CT.register(GAME);
})();
