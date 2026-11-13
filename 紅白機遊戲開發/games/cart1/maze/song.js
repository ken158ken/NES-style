/*
 * games/cart1/maze/song.js — 《星塵迷宮》音樂 / 音效（全部原創旋律，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-1 cart1-grid（R5）。只依賴 engine/music.js 的 song / sfx 格式。
 * 曲名 / 音效名一律 `maze_` 前綴（合輯共用一個 driver，避免撞名）。
 *
 * | key          | 用途           | speed | 小節 | 說明 |
 * |--------------|----------------|-------|------|------|
 * | maze_title   | 標題           | 7     | 4    | D 多利安、4 度跳進動機（fix-r5 改寫開頭）+ 長音旋律 |
 * | maze_start   | 開局 READY     | 6     | 2    | 上行號角（不 loop） |
 * | maze_stage   | 遊玩 BGM       | 6     | 8    | Dm–B♭–C–A 進行，p1 跳進旋律 / p2 和弦點 / tri 行走低音 / noi 拍 |
 * | maze_fright  | 能量星期間     | 4     | 2    | 半音搖擺 + 三角波踏板（loop） |
 * | maze_clear   | 過關           | 6     | 2    | 收束（不 loop） |
 * | maze_over    | GAME OVER      | 8     | 2    | 下行終止（不 loop） |
 * 音效（只搶 p2 / noi）：maze_dot 1 < maze_bonus 5 < maze_star 6 < maze_eat 7 < maze_1up 8 < maze_die 9、maze_pause 4
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var Z = CT.Maze = CT.Maze || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }
  // 旋律字串 → row 陣列：'-' = 沿用、'=' = 切音，其餘為音名
  function mel(str, inst, vol, extra) {
    var t = tok(str), out = [], i, k;
    for (i = 0; i < t.length; i++) {
      if (t[i] === '-') { out.push(null); continue; }
      if (t[i] === '=') { out.push({ note: '===' }); continue; }
      var r = { note: t[i], inst: inst, vol: vol };
      if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
      out.push(r);
    }
    return out;
  }
  var DR = {
    k: { note: 13, inst: 'kick', vol: 14 }, s: { note: 6, inst: 'snare', vol: 12 },
    h: { note: 2, inst: 'hat', vol: 9 }, o: { note: 3, inst: 'ohat', vol: 10 }
  };
  function drm(str) {
    var t = tok(str), out = [], i;
    for (i = 0; i < t.length; i++) out.push(DR[t[i]] || null);
    return out;
  }
  // 和弦點：每 step 列一次、帶琶音
  function stab(root, arp, n, step, vol) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push(i % step === 0 ? { note: root, inst: 'stab', vol: vol || 9, arp: arp } : null);
    return out;
  }
  var MIN = [0, 3, 7], MAJ = [0, 4, 7], DOM = [0, 4, 7, 10];

  var INST = {
    lead: { vol: [14, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 12, duty: [2, 2, 1], dutyLoop: 2 },
    soft: { vol: [10, 11, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2] },
    stab: { vol: [12, 10, 8, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    bell: { vol: [15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [0] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 0] },
    snare: { vol: [14, 12, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [7, 4, 1, 0] },
    ohat: { vol: [9, 8, 6, 5, 4, 3, 2, 1, 0] }
  };

  // bars: [{p1, p2, tri, noi}]（每個值 = row 陣列）；同內容的 pattern 自動共用
  function song(name, speed, rows, bars, loopAt, playLoop) {
    var s = { name: name, speed: speed, rows: rows, instruments: INST, patterns: [], order: [], loop: loopAt || 0, playLoop: playLoop !== false };
    var seen = {};
    function pat(track, arr) {
      if (!arr) return undefined;
      if (arr.length !== rows) throw new Error('maze song ' + name + ' ' + track + ' 長度 ' + arr.length + ' ≠ ' + rows);
      var key = track + JSON.stringify(arr);
      if (seen[key] !== undefined) return seen[key];
      var o = {}; o[track] = arr;
      s.patterns.push(o);
      seen[key] = s.patterns.length - 1;
      return seen[key];
    }
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i], e = {};
      ['p1', 'p2', 'tri', 'noi'].forEach(function (tr) { var p = pat(tr, b[tr]); if (p !== undefined) e[tr] = p; });
      s.order.push(e);
    }
    return s;
  }

  /* ------------------------------ maze_stage ------------------------------ */
  var STAGE_MEL = [
    'D-5 -   F-5 -   A-5 -   -   G-5 F-5 -   E-5 -   D-5 -   A-4 -  ',
    'A#4 -   D-5 -   F-5 -   -   E-5 D-5 -   C-5 -   A#4 -   -   -  ',
    'C-5 -   E-5 -   G-5 -   A-5 G-5 E-5 -   C-5 -   E-5 -   G-5 -  ',
    'A-5 -   -   -   G-5 -   E-5 -   C#5 -   -   -   A-4 -   -   -  ',
    'D-5 -   A-5 -   D-6 -   -   C-6 A-5 -   F-5 -   D-5 -   -   -  ',
    'F-5 -   A-5 -   C-6 -   -   A#5 A-5 -   G-5 -   F-5 -   -   -  ',
    'G-5 -   A#5 -   D-6 -   C-6 -   A#5 -   A-5 -   G-5 -   E-5 -  ',
    'A-5 -   G-5 -   F-5 -   E-5 -   C#5 -   E-5 -   A-4 -   -   -  '
  ];
  var STAGE_CH = [['D-4', MIN], ['A#3', MAJ], ['C-4', MAJ], ['A-3', DOM], ['D-4', MIN], ['F-3', MAJ], ['G-3', MIN], ['A-3', DOM]];
  var STAGE_BASS = [
    'D-2 -   D-3 -   A-2 -   D-3 -   D-2 -   D-3 -   A-2 -   C-3 -  ',
    'A#1 -   A#2 -   F-2 -   A#2 -   A#1 -   A#2 -   F-2 -   A-2 -  ',
    'C-2 -   C-3 -   G-2 -   C-3 -   C-2 -   C-3 -   G-2 -   B-2 -  ',
    'A-1 -   A-2 -   E-2 -   A-2 -   A-1 -   G-2 -   E-2 -   C#2 -  ',
    'D-2 -   D-3 -   A-2 -   D-3 -   D-2 -   D-3 -   A-2 -   D-3 -  ',
    'F-1 -   F-2 -   C-2 -   F-2 -   F-1 -   F-2 -   C-2 -   E-2 -  ',
    'G-1 -   G-2 -   D-2 -   G-2 -   G-1 -   G-2 -   A#2 -   G-2 -  ',
    'A-1 -   A-2 -   E-2 -   A-2 -   C#2 -   E-2 -   A-2 -   A-1 -  '
  ];
  var BEAT_A = 'k - h - s - h - k - k h s - h o';
  var BEAT_B = 'k - h - s - h - k h k h s s s s';
  function buildStage() {
    var bars = [], i;
    for (i = 0; i < 8; i++) {
      bars.push({
        p1: mel(STAGE_MEL[i], 'lead', 13), p2: stab(STAGE_CH[i][0], STAGE_CH[i][1], 16, 4, 8),
        tri: mel(STAGE_BASS[i], 'bass', 15), noi: drm(i === 7 ? BEAT_B : BEAT_A)
      });
    }
    return song('星屑巡遊（maze_stage）', 6, 16, bars, 0, true);
  }
  function buildTitle() {
    var M = [
      // fix-r5 P3-11：開頭動機改成「4 度跳上 + 迴音」，不再與 blocks 標題曲同為 D E F A G F E D C A 音階走句
      'A-4 -   D-5 -   -   -   C-5 D-5 F-5 -   -   -   E-5 -   C-5 -  ',
      'G-4 -   C-5 -   -   -   B-4 C-5 E-5 -   -   -   D-5 -   -   -  ',
      'A#4 -   -   -   D-5 -   F-5 -   A#5 -   -   -   A-5 -   G-5 -  ',
      'A-5 -   -   -   -   -   E-5 -   C#5 -   -   -   -   -   -   -  '
    ];
    var CH = [['D-4', MIN], ['C-4', MAJ], ['A#3', MAJ], ['A-3', DOM]];
    var B = ['D-2', 'C-2', 'A#1', 'A-1'], bars = [], i;
    for (i = 0; i < 4; i++) {
      bars.push({
        p1: mel(M[i], 'soft', 11), p2: stab(CH[i][0], CH[i][1], 16, 2, 6),
        tri: mel(B[i] + ' - - - - - - - ' + B[i].replace(/\d$/, function (d) { return String(+d + 1); }) + ' - - - - - - -', 'bass', 15)
      });
    }
    return song('星塵迷宮標題（maze_title）', 7, 16, bars, 0, true);
  }
  function buildStart() {
    return song('出發（maze_start）', 6, 16, [
      { p1: mel('D-5 -   F-5 -   A-5 -   D-6 -   C-6 -   A-5 -   F-5 -   G-5 -  ', 'lead', 13),
        p2: mel('A-4 -   D-5 -   F-5 -   A-5 -   G-5 -   F-5 -   D-5 -   E-5 -  ', 'soft', 8),
        tri: mel('D-2 -   -   -   A-2 -   -   -   F-2 -   -   -   G-2 -   -   -  ', 'bass', 15),
        noi: drm('k - h - s - h - k - h - s - s s') },
      { p1: mel('A-5 -   -   -   C#6 -   -   -   D-6 -   -   -   -   -   =   -  ', 'lead', 14),
        p2: mel('E-5 -   -   -   G-5 -   -   -   F-5 -   -   -   -   -   =   -  ', 'soft', 8),
        tri: mel('A-2 -   -   -   A-1 -   -   -   D-2 -   -   -   -   -   =   -  ', 'bass', 15),
        noi: drm('k - - - k - - - k - - - - - - -') }
    ], 0, false);
  }
  function buildFright() {
    return song('驚逃（maze_fright）', 4, 16, [
      { p1: mel('E-5 F-5 F#5 G-5 G#5 G-5 F#5 F-5 E-5 F-5 F#5 G-5 G#5 G-5 F#5 F-5', 'soft', 9, { vib: { rate: 12, depth: 3, delay: 0 } }),
        tri: mel('E-2 -   -   -   B-2 -   -   -   E-2 -   -   -   B-2 -   -   -  ', 'bass', 15),
        noi: drm('h - h - o - h - h - h - o - h -') },
      { p1: mel('A-5 G#5 G-5 F#5 F-5 F#5 G-5 G#5 A-5 G#5 G-5 F#5 F-5 F#5 G-5 G#5', 'soft', 9, { vib: { rate: 12, depth: 3, delay: 0 } }),
        tri: mel('F-2 -   -   -   C-3 -   -   -   F-2 -   -   -   C-3 -   -   -  ', 'bass', 15),
        noi: drm('h - h - o - h - h - h - o - h -') }
    ], 0, true);
  }
  function buildClear() {
    return song('過關（maze_clear）', 6, 16, [
      { p1: mel('F-5 -   A-5 -   C-6 -   F-6 -   E-6 -   C-6 -   A-5 -   C-6 -  ', 'lead', 13),
        p2: mel('C-5 -   F-5 -   A-5 -   C-6 -   C-6 -   A-5 -   F-5 -   A-5 -  ', 'soft', 8),
        tri: mel('F-2 -   -   -   C-3 -   -   -   A-2 -   -   -   F-2 -   -   -  ', 'bass', 15) },
      { p1: mel('D-6 -   -   -   -   -   -   -   -   -   -   -   =   -   -   -  ', 'bell', 14),
        p2: mel('A-5 -   -   -   -   -   -   -   -   -   -   -   =   -   -   -  ', 'bell', 9),
        tri: mel('D-2 -   -   -   -   -   -   -   -   -   -   -   =   -   -   -  ', 'bass', 15) }
    ], 0, false);
  }
  function buildOver() {
    return song('終了（maze_over）', 8, 16, [
      { p1: mel('A-4 -   -   -   G#4 -   -   -   G-4 -   -   -   F#4 -   -   -  ', 'soft', 11),
        tri: mel('D-2 -   -   -   C#2 -   -   -   C-2 -   -   -   B-1 -   -   -  ', 'bass', 15) },
      { p1: mel('F-4 -   -   -   E-4 -   -   -   D-4 -   -   -   -   -   =   -  ', 'soft', 11),
        tri: mel('A#1 -   -   -   A-1 -   -   -   D-1 -   -   -   -   -   =   -  ', 'bass', 15) }
    ], 0, false);
  }

  /* -------------------------------- 音效 -------------------------------- */
  function sq(list, extra) {     // [[note, frames, vol, duty?]] → 逐幀
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      for (j = 0; j < list[i][1]; j++) {
        var f = j === 0 ? { note: list[i][0], vol: list[i][2], duty: list[i][3] === undefined ? 2 : list[i][3] } : { vol: list[i][2] };
        if (extra && j === 0) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) f[k] = extra[k];
        out.push(f);
      }
    }
    out.push({ off: true });
    return out;
  }
  function nz(list) {           // [[period, frames, vol]]
    var out = [], i, j;
    for (i = 0; i < list.length; i++) for (j = 0; j < list[i][1]; j++) out.push(j === 0 ? { note: list[i][0], vol: list[i][2] } : { vol: list[i][2] });
    out.push({ off: true });
    return out;
  }
  var SFX = {
    maze_dot: { priority: 1, data: { p2: sq([['E-6', 2, 7, 1], ['B-6', 2, 5]]) } },
    maze_dot2: { priority: 1, data: { p2: sq([['G-6', 2, 7, 1], ['D-7', 2, 5]]) } },
    maze_star: { priority: 6, data: { p2: sq([['D-5', 3, 12, 1], ['F#5', 3, 12], ['A-5', 3, 12], ['D-6', 6, 12], ['D-6', 4, 6]]) } },
    maze_eat: { priority: 7, data: { p2: sq([['C-6', 2, 13, 0], ['G-6', 2, 13], ['C-7', 2, 12], ['G-6', 2, 10], ['C-7', 4, 9]]),
                                     noi: nz([[4, 3, 10], [6, 3, 6]]) } },
    maze_bonus: { priority: 5, data: { p2: sq([['A-5', 3, 12, 2], ['C#6', 3, 12], ['E-6', 3, 12], ['A-6', 6, 11]]) } },
    maze_1up: { priority: 8, data: { p2: sq([['E-6', 4, 12, 2], ['E-6', 2, 0], ['E-6', 4, 12], ['A-6', 8, 13]]) } },
    maze_die: { priority: 9, data: { p2: sq([['A-5', 4, 12, 1], ['F-5', 4, 12], ['D-5', 4, 11], ['A#4', 4, 10], ['G-4', 4, 9], ['D-4', 8, 8], ['D-3', 6, 5]]),
                                     noi: nz([[9, 6, 8], [11, 6, 6], [13, 8, 4]]) } },
    maze_pause: { priority: 4, data: { p2: sq([['A-5', 3, 10, 2], ['E-5', 3, 10], ['A-5', 4, 8]]) } }
  };

  Z.SONGS = { maze_title: buildTitle(), maze_start: buildStart(), maze_stage: buildStage(),
              maze_fright: buildFright(), maze_clear: buildClear(), maze_over: buildOver() };
  Z.SFX = SFX;

  /* 包一層：driver 不在（單元測試）就安靜失敗 */
  var drv = function (nes) { return (nes && nes.music) || ((window.NES && NES.Music && NES.Music._default) ? NES.Music : null); };
  // nes.music 是 NES.Music 門面（playing / orderIndex 在 _default driver 上）
  var core = function (nes) { var d = drv(nes); return d && d._default ? d._default : d; };
  Z.Audio = {
    current: null,
    init: function (nes) {
      var d = drv(nes); if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (nes, key) {
      var d = drv(nes), s = Z.SONGS[key];
      if (!d || !s) return false;
      if (Z.Audio.current === key && d.playing) return true;
      try { d.play(s, { loop: s.playLoop }); Z.Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function (nes) {
      var d = drv(nes); Z.Audio.current = null;
      if (!d) return false;
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    sfx: function (nes, name) {
      var d = drv(nes); if (!d || !SFX[name]) return false;
      try { d.sfx(name); Z.Audio.last = name; return true; } catch (e) {
        try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; }
      }
    },
    // fix-r5 §6-2：暫停 = 停 BGM（音效照常），記住目前小節；解除時同一首從該小節接續
    paused: null,
    pause: function (nes) {
      var d = core(nes); if (!d || !Z.Audio.current) return false;
      Z.Audio.paused = { key: Z.Audio.current, from: d.playing ? (d.orderIndex || 0) : 0, was: !!d.playing };
      try { d.stop(); } catch (e) { }
      return true;
    },
    resume: function (nes) {
      var p = Z.Audio.paused, d = core(nes); Z.Audio.paused = null;
      if (!p || !d || !p.was) return false;
      var s = Z.SONGS[p.key]; if (!s) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from }); Z.Audio.current = p.key; return true; } catch (e) { return false; }
    },
    tick: function (nes) { var d = drv(nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
})();
