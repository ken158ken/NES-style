/*
 * games/cart2/rope/main.js — 《星塵跳繩 STAR ROPE》（合輯卡帶二 槽 4，id = rope）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-2 cart2-dodge（R6）｜ 依賴：rope/art.js、rope/song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/jump-rope.html（只取「繩子轉到腳下時跳、連跳 / 完美時機」玩法；
 *   角色 / 搖繩機器人 / 場地 / 假動作 / 雙繩規則 / 曲子全部原創）
 *
 * 側視：雙子搖繩機器人「庫魯 / 魯魯」（BG）轉動星珠繩（精靈），繩子以 3D 方式投影：
 *   y(x) = 握把高 + 弧形(x) ×（R·cosθ + T·sinθ），θ = 0 在腳下、90° 在前、180° 在頭頂、270° 在後；
 *   sinθ > 0（前方）的繩珠畫在跳繩者前面，否則畫在後面。
 * 判定：繩子每次轉過腳下（θ 越過 0）時檢查跳繩者的離地高度：≥ 4 px = 過；≥ 頂點 70% = PERFECT。
 * 模式（標題 ↑↓ 選列、←→ 改值）：
 *   NORMAL 一般：A 或 B 跳。每 10 下升一級：繩速加快、LV2 起每圈速度浮動、LV3 起假動作
 *          （HOLD 頭頂停住 / DIP 下來到一半又退回 / RUSH 半圈突然加速）。goal = 連跳 100 下。
 *   DOUBLE 雙繩：金繩 / 藍繩相差半圈交替轉過腳下；A = 抬左腳小跳（過金繩）、B = 抬右腳小跳（過藍繩）、
 *          A+B 同時 = 雙腳大跳（兩條都算）。
 * 角色（3）：TICO 提可（均衡）／ BOBO 波波（跳得高、慢）／ LUMI 露米（小跳、快）。
 * 場地（3）：PLAZA 晨光廣場（標準）／ MOON 月面基地（重力 0.75、繩慢、假動作多）／ NEON 霓虹屋頂（繩快、速度浮動大）。
 * 3 顆心：失誤扣 1、連跳歸零、繩子從頭頂慢慢重新轉起。
 * 預備（fix-r6 P2-2）：開局 / 絆倒重來 / 續關，繩子先停住 120 幀（HUD 倒數 3 2 1 → JUMP!），這段時間不判定。
 * 每線 8 精靈：跳繩者（16 寬 = 每線 2）最優先，再來前方繩珠、後方繩珠、火花；排不下的繩珠這幀不畫並記 hid（下幀優先）。
 *   單繩 6 顆 + 跳繩者 2 = 8；雙繩每條 5 顆，只有兩條繩在畫面上交叉的幾幀會輪替。
 * VBlank：HUD 只寫有變的字；曲柄每 90° 換影格 = 8 byte。
 * 密技（C / ★）：遊玩中 = 心補滿 + 繩速放慢 10 秒；GAME OVER = 原地續關（分數 / 總跳數 / 等級保留、心補滿、繩子從頭頂重來）；
 *   標題無效；用過密技那局 goal() = false。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var RP = CT.Rope = CT.Rope || {};
  var AU = RP.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256, FULL = 65536, HALF = 32768;
  var GROUND = 176, HANDY = 136, LX = 64, RX = 192, CX = 128, RR = 40, TT = 14;
  var GOAL_COMBO = 100;
  var READY_FRAMES = 120;          // P2-2（fix-r6）：開局 / 絆倒重來 / 續關，繩子先停住 120 幀倒數「3 2 1 JUMP!」才開始轉
  var LIVES0 = 3;
  var CHARS = [
    { id: 'TICO', desc: 'EVEN JUMP', v0: 1024, g: 69, pal: [0x07, 0x27, 0x30] },
    { id: 'BOBO', desc: 'HIGH JUMP', v0: 1126, g: 64, pal: [0x00, 0x10, 0x3C] },
    { id: 'LUMI', desc: 'QUICK HOP', v0: 922, g: 77, pal: [0x04, 0x34, 0x30] }
  ];
  var VENUES = [
    { id: 'PLAZA', desc: 'CLASSIC', grav: 4, baseP: 96, minP: 50, vary: 8, fm: 4, song: 'rope_plaza', bd: 0x21,
      p0: [0x1A, 0x31, 0x30], p1: [0x00, 0x10, 0x27], p2: [0x07, 0x17, 0x27] },
    { id: 'MOON', desc: 'LOW GRAVITY', grav: 3, baseP: 104, minP: 56, vary: 8, fm: 6, song: 'rope_moon', bd: 0x0F,
      p0: [0x01, 0x21, 0x2A], p1: [0x01, 0x11, 0x38], p2: [0x00, 0x10, 0x20] },
    { id: 'NEON', desc: 'WILD SPEED', grav: 4, baseP: 90, minP: 46, vary: 16, fm: 4, song: 'rope_neon', bd: 0x01,
      p0: [0x0F, 0x13, 0x38], p1: [0x04, 0x14, 0x3C], p2: [0x0F, 0x00, 0x14] }
  ];
  var MODES = ['NORMAL', 'DOUBLE'];
  var PAL_HUD = [0x0F, 0x16, 0x30], PAL_A = [0x07, 0x28, 0x38], PAL_B = [0x01, 0x21, 0x31], PAL_FX = [0x00, 0x10, 0x30];
  var PAL_T0 = [0x02, 0x22, 0x30], PAL_T1 = [0x0F, 0x16, 0x38], PAL_T2 = [0x0F, 0x00, 0x10];

  var art = null, nes0 = null, g = null;
  var SIN = (function () { var t = [], i; for (i = 0; i < 256; i++) t.push(Math.round(Math.sin(i * Math.PI / 128) * 256)); return t; })();
  function sn(th) { return SIN[(th >> 8) & 255]; }
  function cs(th) { return SIN[((th >> 8) + 64) & 255]; }

  // 繩珠 x 與弧形（Q8）
  function beadSet(n) {
    var out = [];
    for (var k = 0; k < n; k++) {
      var x = LX + (((RX - LX) * (k + 1)) / (n + 1) | 0), u = ((x - CX) * 256 / 64) | 0;
      out.push({ x: x, s: 256 - ((u * u) >> 8) });
    }
    return out;
  }
  var BEADS1 = beadSet(6), BEADS2 = beadSet(5);

  function newRope(seed) { return { th: 0, w: 0, tw: 0, st: 'run', stT: 0, feint: null, fired: false, seed: seed, lvl: 1, venue: 0, slowT: 0, dbl: false }; }
  function newState() {
    return {
      mode: 'title', row: 0, msel: 0, who: 0, venue: 0, t: 0, ft: 0, paused: false,
      game: 'NORMAL', h: 0, vh: 0, air: false, foot: '', apex: 0, buf: 0, bufFoot: '',
      rope: newRope(1), jumps: 0, combo: 0, bestCombo: 0, score: 0, lives: LIVES0, lvl: 1,
      perfects: 0, goods: 0, misses: 0, tripT: 0, overT: 0, judge: '', judgeT: 0, msg: '', msgT: 0,
      cheated: false, cheatReq: false, cheats: 0, continues: 0, goalHit: false, newBest: false,
      hud: {}, sprUsed: 0, hid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hidMax: 0, hidden: 0, maxLine: 0,
      crank: -1, fx: [], feints: 0, bot: { t: 0 }, runs: 0, seed: 777
    };
  }
  function rnd(r) { r.seed = (r.seed * 1103515245 + 12345) & 0x7fffffff; return r.seed >> 8; }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function bestFmt(n) { return pad(Math.min(999, n), 3) + 'HIT'; }   // §1-6：6 字元，選單與標題共用
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }

  /* ============================== 繩子控制器（遊戲與機器人預測共用，純資料） ============================== */
  function periodOf(r) {
    var V = VENUES[r.venue], P = Math.max(V.minP, V.baseP - (r.lvl - 1) * 4);
    if (r.dbl) P += 22;                          // 雙繩：半圈就要跳一次，整體放慢
    if (r.slowT > 0) P += 30;
    return P;
  }
  function planNext(r) {
    var V = VENUES[r.venue], P = periodOf(r);
    if (r.lvl >= 2) P += (rnd(r) % (V.vary * 2 + 1)) - V.vary;
    r.tw = (FULL / P) | 0;
    r.feint = null; r.fired = false;
    if (r.lvl >= 3) {
      var pct = Math.min(45, ((r.lvl - 2) * 5 + 10) * V.fm / 4);
      if (rnd(r) % 100 < pct) {
        var k = rnd(r) % 3;
        r.feint = k === 0 ? { type: 'hold', at: 30000, len: 20 + rnd(r) % 24 } :
                  (k === 1 ? { type: 'dip', at: 54000, len: 16 + rnd(r) % 8 } : { type: 'rush', at: 12000, len: 0 });
      }
    }
  }
  // 推進一幀；回傳 {a: 金繩越過腳下, b: 藍繩越過腳下}
  function stepRope(r) {
    var res = { a: false, b: false }, old = r.th;
    if (r.slowT > 0) r.slowT--;
    if (r.st === 'stop') return res;
    if (r.st === 'ready') { if (--r.stT <= 0) { r.st = 'run'; r.w = 0; } return res; }   // 倒數中：停住、不判定
    if (r.st === 'hold') { if (--r.stT <= 0) { r.st = 'run'; r.w = 0; } return res; }
    if (r.st === 'dip') {
      r.th -= r.dipW;
      if (--r.stT <= 0) { r.st = 'run'; r.w = 0; }
      return res;
    }
    var ease = 24;
    if (r.w < r.tw) r.w = Math.min(r.tw, r.w + ease); else if (r.w > r.tw) r.w = Math.max(r.tw, r.w - (ease >> 1));
    var nt = old + r.w;
    if (r.feint && !r.fired && old < r.feint.at && nt >= r.feint.at) {
      r.fired = true; r.nf = (r.nf || 0) + 1;
      if (r.feint.type === 'hold') { r.th = r.feint.at; r.st = 'hold'; r.stT = r.feint.len; return res; }
      if (r.feint.type === 'dip') { r.th = r.feint.at; r.st = 'dip'; r.stT = r.feint.len; r.dipW = (r.w * 3) >> 2; return res; }
      if (r.feint.type === 'rush') r.w = (r.tw * 7) >> 2;
    }
    if (nt >= FULL) { nt -= FULL; res.a = true; }
    if (old < HALF && nt >= HALF) res.b = true;
    r.th = nt;
    return res;
  }
  function cloneRope(r) { var c = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) c[k] = r[k]; if (r.feint) c.feint = { type: r.feint.type, at: r.feint.at, len: r.feint.len }; return c; }
  // 從目前狀態算「再幾幀會有繩子越過腳下」（1 = 下一幀）；which = 'a' / 'b'
  function framesToCross(maxF) {
    var c = cloneRope(g.rope);
    for (var f = 1; f <= maxF; f++) {
      var res = stepRope(c);
      if (res.a) return { f: f, which: 'a' };
      if (g.game === 'DOUBLE' && res.b) return { f: f, which: 'b' };
    }
    return { f: -1, which: '' };
  }

  /* ============================== BG 工具 ============================== */
  function text0(col, row, s) { var t = art.text(s); for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]); }
  function put(row, col, tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var k = row * 32 + col + i;
      if (g.hud[k] === tiles[i]) continue;
      g.hud[k] = tiles[i];
      nes0.ppu.setTile(0, col + i, row, tiles[i]);
    }
  }
  function txt(row, col, s) { put(row, col, art.text(s)); }
  function hudTxt(row, col, s) { put(row, col, art.hud(s)); }

  /* ============================== 標題（設定畫面） ============================== */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 2);
      clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_T0); ppu.setBgPalette(1, PAL_T1); ppu.setBgPalette(2, PAL_T2); ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(1, PAL_A); ppu.setSprPalette(2, PAL_B); ppu.setSprPalette(3, PAL_FX);
      for (var c = 2; c < 30; c++) { ppu.setTile(0, c, 2, art.t('FR_H')); ppu.setTile(0, c, 27, art.t('FR_H')); }
      text0(12, 4, 'STARDUST');
      var w = 'ROPE';
      for (var i = 0; i < w.length; i++) {
        var t = art.big(w.charAt(i)), x = 12 + i * 2;
        ppu.setTile(0, x, 6, t[0]); ppu.setTile(0, x + 1, 6, t[1]); ppu.setTile(0, x, 7, t[2]); ppu.setTile(0, x + 1, 7, t[3]);
      }
      ppu.fillAttr(0, 0, 2, 16, 2, 0);
      // §6-6：段落之間空一列
      text0(4, 17, 'A/B JUMP  DOUBLE: A=L B=R');
      text0(4, 19, 'START PAUSE   C/★ = CHEAT');
      text0(4, 21, 'HOLD START+SELECT: MENU');
      g.hud = {};
    });
    titleRows(true);
    AU.play('rope_title');
  }
  function titleRows(full) {
    var ppu = nes0.ppu, C = CHARS[g.who], V = VENUES[g.venue];
    txt(10, 3, (g.row === 0 ? '>' : ' ') + ' MODE    ' + padR(MODES[g.msel], 7) + padR(g.msel ? 'TWO ROPES' : 'ONE ROPE', 11));
    txt(12, 3, (g.row === 1 ? '>' : ' ') + ' RUNNER  ' + padR(C.id, 7) + padR(C.desc, 11));
    txt(14, 3, (g.row === 2 ? '>' : ' ') + ' STAGE   ' + padR(V.id, 7) + padR(V.desc, 11));
    var put2 = function () { for (var r = 0; r < 3; r++) ppu.fillAttr(0, 0, 5 + r, 16, 1, g.row === r ? 1 : 2); };
    if (full) CT.blank(nes0, put2); else put2();
    var best = g.msel ? CT.load('rope', 'bestD', 0) : CT.load('rope', 'best', 0);
    txt(23, 4, 'BEST ' + bestFmt(best));                 // P3-7：與選單 bestText() 同格式
    ppu.setSprPalette(0, C.pal);
  }

  /* ============================== 開局 / 場地 ============================== */
  function startRun() {
    var keep = { runs: g.runs + 1, bot: g.bot, row: g.row, msel: g.msel, who: g.who, venue: g.venue };
    g = newState();
    for (var k in keep) g[k] = keep[k];
    g.game = MODES[g.msel];
    g.mode = 'play';
    g.rope = newRope(4242 + g.runs * 7919);
    g.rope.venue = g.venue; g.rope.dbl = g.game === 'DOUBLE'; g.rope.lvl = 1;
    g.bestPrev = g.game === 'DOUBLE' ? CT.load('rope', 'bestD', 0) : CT.load('rope', 'best', 0);
    restartRope('READY');
    buildStage();
    AU.play(VENUES[g.venue].song);
  }
  function stageTile(c, r) {
    var v = g.venue, h = ((c * 2654435761) ^ (r * 40503)) >>> 0;
    if (r >= 22) {
      if (r === 22) return 'GR_T';
      if (v === 0) return 'BR_A';
      if (v === 1 && (h % 11) === 3 && r > 23) return 'GR_C0';
      return ((c + r) & 1) ? 'GR_A' : 'GR_B';
    }
    if (r < 4) return null;
    if (v === 0) {
      if (r === 13) return ['HL_D', 'HL_U', 'HL_U', 'HL_E'][c & 3];
      if (r === 14 || r === 15) return 'FILL1';
      var cl = [[4, 5], [19, 7], [11, 4], [26, 9]];
      for (var i = 0; i < cl.length; i++) if (r === cl[i][1] && c >= cl[i][0] && c < cl[i][0] + 3) return ['CL_L', 'CL_M', 'CL_R'][c - cl[i][0]];
      return null;
    }
    if (v === 1) {
      if (r <= 6 && r >= 5 && c >= 22 && c <= 23) return 'PL_' + ((r - 5) * 2 + (c - 22));
      if (r < 16) return (h % 13) === 3 ? 'ST1' : ((h % 29) === 7 ? 'ST2' : null);
      return null;
    }
    if (r >= 5 && r <= 6 && c >= 5 && c <= 6) return 'MO_' + ((r - 5) * 2 + (c - 5));
    var top = 9 + ((c * 5 + (c >> 2) * 3) % 5);
    if (r >= top && r <= 15) return r === top ? 'BD_T' : (r === 15 ? 'BD_F' : (((c + r) % 3) ? 'BD_A' : 'BD_B'));
    if (r < top) return (h % 17) === 3 ? 'ST1' : null;
    return null;
  }
  function buildStage() {
    var ppu = nes0.ppu, V = VENUES[g.venue];
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      ppu.setBackdrop(V.bd);
      ppu.setBgPalette(0, V.p0); ppu.setBgPalette(1, V.p1); ppu.setBgPalette(2, V.p2); ppu.setBgPalette(3, PAL_HUD);
      ppu.setSprPalette(0, CHARS[g.who].pal); ppu.setSprPalette(1, PAL_A); ppu.setSprPalette(2, PAL_B); ppu.setSprPalette(3, PAL_FX);
      var c, r, t;
      for (r = 0; r < 30; r++) for (c = 0; c < 32; c++) { t = stageTile(c, r); if (t) ppu.setTile(0, c, r, art.t(t)); }
      ppu.fillTiles(0, 0, 0, 32, 4, art.t('HB'));
      // 搖繩機器人：身體 2×4（左 cols 6-7 / 右 cols 24-25，rows 18-21）+ 曲柄 2×2（左 cols 7-8 / 右 cols 23-24，rows 16-17）
      for (var i = 0; i < 8; i++) {
        ppu.setTile(0, 6 + (i & 1), 18 + (i >> 1), art.t('KL_' + i));
        ppu.setTile(0, 24 + (i & 1), 18 + (i >> 1), art.t('KR_' + i));
      }
      ppu.fillAttr(0, 0, 0, 16, 2, 3);
      ppu.fillAttr(0, 0, 11, 16, 4, 2);
      [[3, 8], [4, 8], [3, 9], [3, 10], [11, 8], [12, 8], [12, 9], [12, 10]].forEach(function (a) { ppu.setAttr(0, a[0], a[1], 1); });
      g.crank = -1;
      drawCrank();
      g.hud = {};
      drawHud();
    });
  }
  function crankFrame() { return (((g.rope.th + 8192) & 0xFFFF) >> 14) & 3; }
  function drawCrank() {
    var f = crankFrame(), ppu = nes0.ppu;
    if (f === g.crank) return;
    g.crank = f;
    for (var i = 0; i < 4; i++) {
      ppu.setTile(0, 7 + (i & 1), 16 + (i >> 1), art.t('CK' + f + '_' + i));
      ppu.setTile(0, 23 + (i & 1), 16 + (i >> 1), art.t('CK' + f + '_' + i));
    }
  }

  /* ============================== HUD ============================== */
  function hearts(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '♥' : ' '; return s; }
  function drawHud() {
    hudTxt(1, 1, padR('JUMPS ' + pad(g.combo, 3) + '  BEST ' + pad(Math.max(g.bestCombo, g.bestPrev || 0), 3) + '  ' + hearts(g.lives), 30));
    var line;
    if (g.paused) line = 'PAUSE HOLD START+SELECT: MENU';
    else if (g.mode === 'trip' && g.lives <= 0) line = 'OH NO!  C/★ = CONTINUE';
    else if (g.rope.st === 'ready') line = g.readyTag + '   ' + (((g.rope.stT - 1) / 40 | 0) + 1) + '...';
    else if (g.msgT > 0) line = g.msg;
    else line = 'SCORE ' + pad(g.score, 6) + '  LV ' + padR(g.lvl, 2) + ' ' + (g.judgeT > 0 ? g.judge : '');
    hudTxt(2, 1, padR(line, 30));
  }

  /* ============================== 跳躍 / 判定 ============================== */
  function grav() { var C = CHARS[g.who], V = VENUES[g.venue]; return (C.g * V.grav) >> 2; }
  function jump(foot) {
    var C = CHARS[g.who], v0 = C.v0;
    if (g.game === 'DOUBLE' && foot !== 'LR') v0 = (v0 * 170) >> 8;     // 單腳小跳
    g.vh = v0; g.h = 0; g.air = true; g.foot = foot;
    g.apex = ((v0 * v0) / (2 * grav())) | 0;                          // Q8
    AU.sfx('rope_jump');
  }
  function readJump(I) {
    if (g.game === 'NORMAL') return (I.pressed(BTN.A) || I.pressed(BTN.B)) ? 'LR' : '';
    var a = I.pressed(BTN.A), b = I.pressed(BTN.B);
    if (a && (b || I.held(BTN.B))) return 'LR';
    if (b && I.held(BTN.A)) return 'LR';
    return a ? 'L' : (b ? 'R' : '');
  }
  function judge(which) {
    var need = which === 'a' ? 'L' : 'R';
    var ok = g.air && g.h >= 4 * Q && (g.game === 'NORMAL' || g.foot.indexOf(need) >= 0);
    if (ok) {
      var perfect = g.h * 10 >= g.apex * 7;
      g.combo++; g.jumps++;
      if (g.combo > g.bestCombo) g.bestCombo = g.combo;
      var mult = 1 + Math.min(4, (g.combo / 10) | 0);
      g.score += (perfect ? 3 : 1) * mult;
      if (perfect) { g.perfects++; g.judge = 'PERFECT!'; AU.sfx('rope_perfect'); addFx(); } else { g.goods++; g.judge = 'GOOD'; AU.sfx('rope_good'); }
      g.judgeT = 40;
      if (!g.cheated && g.game === 'NORMAL' && g.combo >= GOAL_COMBO) g.goalHit = true;
      var L = Math.min(30, 1 + ((g.jumps / 10) | 0));
      if (L !== g.lvl) { g.lvl = L; g.rope.lvl = L; g.msg = 'LEVEL ' + L + (L === 2 ? '  SPEED SHIFT' : (L === 3 ? '  WATCH FOR FAKES' : '  FASTER!')); g.msgT = 80; AU.sfx('rope_level'); }
      if (g.combo % 25 === 0) { g.msg = g.combo + ' IN A ROW!'; g.msgT = 80; }
      return true;
    }
    // 失誤
    g.misses++; g.lives--; g.combo = 0; g.judge = 'MISS'; g.judgeT = 60;
    g.mode = 'trip'; g.tripT = 70; g.air = false; g.h = 0; g.vh = 0; g.foot = '';
    g.rope.st = 'stop'; g.rope.th = which === 'a' ? 0 : HALF;
    AU.sfx('rope_miss');
    return false;
  }
  function addFx() { g.fx.push({ x: CX - 12, y: GROUND - 10, t: 24 }); g.fx.push({ x: CX + 4, y: GROUND - 14, t: 24 }); if (g.fx.length > 4) g.fx.splice(0, g.fx.length - 4); }
  // P2-2：繩子停在頭頂（雙繩：金繩在前、藍繩在後，都離腳下 90°）倒數 READY_FRAMES 幀，倒數結束才從靜止慢慢轉起
  function restartRope(tag) {
    var r = g.rope;
    r.st = 'ready'; r.stT = READY_FRAMES; r.w = 0; r.lvl = g.lvl;
    r.th = g.game === 'DOUBLE' ? 16384 : HALF;
    planNext(r);
    g.readyTag = tag || 'READY'; g.cdShown = 0;
  }

  /* ============================== 遊玩更新 ============================== */
  function setPause(p) { g.paused = p; if (p) AU.pause(); else AU.resume(); drawHud(); }
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) setPause(!g.paused);
    if (g.paused) return;
    g.ft++;
    if (g.msgT > 0) g.msgT--;
    if (g.judgeT > 0) g.judgeT--;
    g.fx = g.fx.filter(function (f) { f.y--; return --f.t > 0; });
    if (g.mode === 'trip') {
      if (--g.tripT <= 0) {
        if (g.lives <= 0) { enterOver(); return; }
        g.mode = 'play'; restartRope('TRY AGAIN!'); g.msgT = 0;
      }
      return;
    }
    g.t++;
    // ① 輸入（落地前 6 幀內按下 = 緩衝，落地立刻跳）
    var want = readJump(I);
    if (want) { if (!g.air) jump(want); else { g.buf = 6; g.bufFoot = want; } }
    else if (g.buf > 0) g.buf--;
    // ② 物理
    if (g.air) {
      g.h += g.vh; g.vh -= grav();
      if (g.h <= 0) {
        g.h = 0; g.vh = 0; g.air = false; g.foot = '';
        if (g.buf > 0) { jump(g.bufFoot); g.buf = 0; }
      }
    }
    // ③ 繩子
    var wasReady = g.rope.st === 'ready';
    var res = stepRope(g.rope);
    if (wasReady) {
      var cd = g.rope.st === 'ready' ? ((g.rope.stT - 1) / 40 | 0) + 1 : 0;
      if (cd !== g.cdShown) { g.cdShown = cd; AU.sfx(cd ? 'rope_move' : 'rope_ok'); }
      if (!cd) { g.msg = 'JUMP!'; g.msgT = 40; }
    }
    if (res.a || res.b) AU.sfx('rope_swish');
    // ④ 判定
    if (res.a) { if (judge('a')) planNext(g.rope); }
    if (res.b && g.game === 'DOUBLE' && g.mode === 'play') judge('b');
  }

  function saveBest() {
    if (!g || g.mode === 'title') return false;
    var nb = false, key = g.game === 'DOUBLE' ? 'bestD' : 'best';
    if (g.bestCombo > CT.load('rope', key, 0)) { CT.save('rope', key, g.bestCombo); nb = true; }
    if (g.score > CT.load('rope', 'score', 0)) CT.save('rope', 'score', g.score);
    return nb;
  }
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    g.newBest = saveBest();
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0);
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      clearSpr();
      ppu.setBackdrop(0x0F);
      ppu.setBgPalette(0, PAL_T0); ppu.setBgPalette(1, PAL_T1); ppu.setBgPalette(2, PAL_T2);
      for (var c = 4; c < 28; c++) { ppu.setTile(0, c, 4, art.t('FR_H')); ppu.setTile(0, c, 25, art.t('FR_H')); }
      text0(11, 6, 'GAME OVER');
      text0(8, 9, g.game + '  ' + VENUES[g.venue].id + (g.newBest ? '  NEW!' : ''));
      text0(8, 11, 'BEST COMBO  ' + pad(g.bestCombo, 3));
      text0(8, 13, 'JUMPS       ' + pad(g.jumps, 3));
      text0(8, 15, 'PERFECT     ' + pad(g.perfects, 3));
      text0(8, 17, 'SCORE    ' + pad(g.score, 6));
      text0(6, 21, 'START  TITLE');
      text0(6, 23, 'C/★    CONTINUE HERE');
      ppu.fillAttr(0, 0, 3, 16, 1, 1);
      ppu.fillAttr(0, 0, 11, 16, 1, 2);
      g.hud = {};
    });
    AU.play('rope_over');
  }
  // §6-1 密技原地續關
  function continueRun() {
    g.mode = 'play'; g.overT = 0; g.tripT = 0; g.paused = false;
    g.lives = LIVES0; g.combo = 0; g.cheated = true; g.continues++;
    g.air = false; g.h = 0; g.vh = 0; g.foot = ''; g.buf = 0;
    restartRope('CONTINUE! LV ' + g.lvl);
    buildStage();
    g.msgT = 0;
    AU.sfx('rope_level');
    AU.play(VENUES[g.venue].song);
  }

  /* ============================== 精靈：逐線配額器 ============================== */
  var lines = new Uint8Array(240);
  function room(y, h, need) { for (var l = Math.max(0, y); l < y + h && l < 240; l++) if (lines[l] + need > 8) return false; return true; }
  function take(y, h, n) { for (var l = Math.max(0, y); l < y + h && l < 240; l++) lines[l] += n; }
  function clearSpr() { nes0.ppu.clearSprites(); if (g) g.sprUsed = 0; }
  function ropeBeads(which) {
    var r = g.rope, th = which === 'a' ? r.th : ((r.th + HALF) & 0xFFFF);
    var amp = (RR * cs(th) + TT * sn(th)) >> 8, B = g.game === 'DOUBLE' ? BEADS2 : BEADS1, out = [];
    for (var k = 0; k < B.length; k++) out.push({ x: B[k].x, y: HANDY + ((B[k].s * amp) >> 8), front: sn(th) > 0, near: Math.abs(th - (th > HALF ? FULL : 0)) < 6000 });
    return out;
  }
  function jumperTiles() {
    var C = CHARS[g.who].id, fr;
    if (g.mode === 'trip') fr = 'TRIP';
    else if (g.mode === 'title') fr = ((g.t >> 4) & 1) ? 'AIR' : 'STAND';
    else if (!g.air) fr = 'STAND';
    else if (g.game === 'DOUBLE' && g.foot !== 'LR') fr = g.foot === 'L' ? 'FOOTL' : 'FOOTR';
    else fr = 'AIR';
    return [0, 1, 2, 3, 4, 5].map(function (i) { return art.s(C + '_' + fr + '_' + i); });
  }
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, i;
    lines.fill(0);
    var list = [];        // 依顯示順序：{x,y,tile,pal}
    if (g.mode === 'title') {
      var ty = 40 - (((g.t >> 4) & 1) ? 6 : 0), jt = jumperTiles();
      for (i = 0; i < 6; i++) list.push({ x: 188 + (i & 1) * 8, y: ty + (i >> 1) * 8, tile: jt[i], pal: 0 });
      take(ty, 24, 2);
    } else if (g.mode === 'play' || g.mode === 'trip') {
      var jy = GROUND - 24 - (g.h >> 8), jtl = jumperTiles();
      take(jy, 24, 2);                                      // ① 跳繩者（最優先）
      var ropes = [['a', ropeBeads('a'), 1]];
      if (g.game === 'DOUBLE') ropes.push(['b', ropeBeads('b'), 2]);
      var front = [], back = [], hidBase = 0;
      ropes.sort(function (p, q2) { return (q2[1][0].front ? 1 : 0) - (p[1][0].front ? 1 : 0); });   // 前方那條先排
      for (var ri = 0; ri < ropes.length; ri++) {
        var bs = ropes[ri][1], base = ropes[ri][0] === 'a' ? 0 : 6;
        // 藏過的繩珠優先
        var ord = bs.map(function (b, k) { return k; }).sort(function (p, q2) { return g.hid[base + q2] - g.hid[base + p]; });
        for (var oi = 0; oi < ord.length; oi++) {
          var k2 = ord[oi], b = bs[k2], by = b.y - 4;
          if (room(by, 8, 1)) {
            take(by, 8, 1); g.hid[base + k2] = 0;
            (b.front ? front : back).push({ x: b.x - 4, y: by, tile: art.s(b.near ? 'BEADF' : 'BEAD'), pal: ropes[ri][2] });
          } else {
            g.hid[base + k2]++; g.hidden++;
            if (g.hid[base + k2] > g.hidMax) g.hidMax = g.hid[base + k2];
          }
        }
        void hidBase;
      }
      list = list.concat(front);
      for (i = 0; i < 6; i++) list.push({ x: CX - 8 + (i & 1) * 8, y: jy + (i >> 1) * 8, tile: jtl[i], pal: 0 });
      list = list.concat(back);
      for (i = 0; i < g.fx.length; i++) {               // ④ 火花（最低）
        var f = g.fx[i];
        if (!room(f.y, 8, 1)) continue;
        take(f.y, 8, 1);
        list.push({ x: f.x, y: f.y, tile: art.s(f.t > 12 ? 'SPARK' : 'TWINK'), pal: 3 });
      }
    }
    for (i = 0; i < list.length && n < 62; i++) ppu.sprite(n++, list[i]);
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
    var m = 0;
    for (i = 0; i < 240; i++) if (lines[i] > m) m = lines[i];
    if (m > g.maxLine) g.maxLine = m;
  }

  /* ============================== 機器人 ============================== */
  // 用與遊戲相同的繩子控制器預測下一次越過腳下的幀數，讓「繩子到腳下時剛好在頂點」
  function botMask() {
    var B = g.bot;
    B.t++;
    if (g.mode === 'title') {
      if (g.row !== 0) return (B.t % 20 === 10) ? BTN.UP : 0;
      if (g.msel !== 0) return (B.t % 20 === 10) ? BTN.LEFT : 0;
      return (B.t % 40 === 20) ? BTN.START : 0;
    }
    if (g.mode === 'over') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode !== 'play' || g.air) return 0;
    var nx = framesToCross(240);
    if (nx.f < 0) return 0;
    var C = CHARS[g.who], v0 = C.v0, gr = grav();
    if (g.game === 'DOUBLE') v0 = (v0 * 170) >> 8;
    var peak = Math.round(v0 / gr);               // 頂點在第幾幀
    // 按鍵在下一幀生效：跳起後第 f 幀越過腳下 ⇒ 要 f == peak
    if (nx.f === peak || (nx.f < peak && nx.f >= 3)) {
      if (g.game === 'NORMAL') return BTN.A;
      return nx.which === 'a' ? BTN.A : BTN.B;
    }
    return 0;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'rope', order: 4, title: '星塵跳繩', legacy: ['jump-rope.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = RP.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'rope_bg');
      NES.CHR.setPattern(1, 'rope_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: art.s('BACK'), pal: 1 };      // §6-4：實心金星（8×8）
      AU.init(nes);
      g = newState();
      var qm = CT.query ? CT.query('rmode') : null, qw = CT.query ? CT.query('who') : null, qv = CT.query ? CT.query('venue') : null;
      if (qw) g.who = Math.max(0, Math.min(2, parseInt(qw, 10) || 0));
      if (qv) g.venue = Math.max(0, Math.min(2, parseInt(qv, 10) || 0));
      if (qm === 'normal' || qm === 'double') { g.msel = qm === 'double' ? 1 : 0; startRun(); }
      else enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) {
        g.cheatReq = false;
        if (g.mode === 'over' || (g.mode === 'trip' && g.lives <= 0)) continueRun();
        else if (g.mode === 'play' || g.mode === 'trip') {
          g.cheated = true; g.lives = LIVES0; g.rope.slowT = 600; g.msg = 'STAR POWER! SLOW ROPE'; g.msgT = 80; AU.sfx('rope_level');
        }
      }
      if (g.mode === 'title') {
        g.t++;
        var ch = false;
        if (I.pressed(BTN.UP)) { g.row = (g.row + 2) % 3; ch = true; }
        else if (I.pressed(BTN.DOWN)) { g.row = (g.row + 1) % 3; ch = true; }
        else if (I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT)) {
          var d = I.pressed(BTN.LEFT) ? -1 : 1;
          if (g.row === 0) g.msel ^= 1; else if (g.row === 1) g.who = (g.who + 3 + d) % 3; else g.venue = (g.venue + 3 + d) % 3;
          ch = true;
        }
        if (ch) { titleRows(false); AU.sfx('rope_move'); }
        else if ((I.pressed(BTN.START) || I.pressed(BTN.A)) && !I.held(BTN.SELECT)) { AU.sfx('rope_ok'); startRun(); }
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'title') {
        if ((g.t & 31) === 0) txt(25, 11, (g.t & 32) ? '          ' : 'PUSH START');
      } else if (g.mode === 'play' || g.mode === 'trip') {
        if (!g.paused) drawHud();
        drawCrank();
      }
      drawSprites();
    },
    state: function () {
      var r = g.rope;
      return {
        mode: g.mode, game: g.game, row: g.row, who: CHARS[g.who].id, venue: VENUES[g.venue].id, t: g.t,
        combo: g.combo, bestCombo: g.bestCombo, jumps: g.jumps, score: g.score, lives: g.lives, lvl: g.lvl,
        perfects: g.perfects, goods: g.goods, misses: g.misses, feints: r.nf || 0, paused: g.paused,
        h: g.h >> 8, air: g.air, foot: g.foot, th: r.th, w: r.w, ropeSt: r.st, period: r.tw ? Math.round(FULL / r.tw) : 0,
        hidMax: g.hidMax, hidden: g.hidden, maxLine: g.maxLine, cheated: g.cheated, cheats: g.cheats, continues: g.continues,
        goal: !!(g.goalHit && !g.cheated)
      };
    },
    exit: function () { saveBest(); AU.stop(); },            // §6-3
    cheat: function () { if (!g || g.mode === 'title') return false; g.cheatReq = true; g.cheats++; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return bestFmt(CT.load('rope', 'best', 0)); }   // §1-6：6 字元
  };
  RP.CHARS = CHARS; RP.VENUES = VENUES; RP.GOAL_COMBO = GOAL_COMBO;
  RP.dev = {
    g: function () { return g; },
    start: function (mode, who, venue) { g.msel = mode === 'DOUBLE' ? 1 : 0; g.who = who || 0; g.venue = venue || 0; startRun(); },
    newRope: newRope, stepRope: stepRope, planNext: planNext, cloneRope: cloneRope, framesToCross: function (n) { return framesToCross(n || 240); },
    ropeBeads: ropeBeads, bestFmt: bestFmt, READY_FRAMES: READY_FRAMES, jump: jump, grav: grav, over: function () { enterOver(); }, judge: judge, periodOf: periodOf
  };
  if (CT.register) CT.register(GAME);
})();
