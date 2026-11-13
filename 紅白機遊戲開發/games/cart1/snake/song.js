/*
 * games/cart1/snake/song.js — 《星塵貪食蟲》音樂 / 音效（全部原創旋律，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-1 cart1-grid（R5）。曲名 / 音效名一律 `snake_` 前綴。
 *
 * | key          | 用途          | speed | 小節 | 說明 |
 * |--------------|---------------|-------|------|------|
 * | snake_title  | 標題 / 選單   | 8     | 4    | G 大調、三角波行走低音 + 方波和弦點 |
 * | snake_play   | 經典 / 關卡   | 6     | 8    | G–Em–C–D 進行、p1 切分旋律（蟲在爬的「一伸一縮」節奏） |
 * | snake_vs     | 對戰電腦蟲    | 5     | 4    | E 小調、較急、雙方波對答 |
 * | snake_clear  | 過關          | 6     | 2    | 上行琶音（不 loop） |
 * | snake_over   | GAME OVER     | 8     | 2    | 下行（不 loop） |
 * 音效（p2 / noi）：snake_eat 3、snake_gem 5、snake_warp 4、snake_crash 9、snake_menu 2、snake_ok 4、snake_pause 4、snake_cpu 3
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var S = CT.Snake = CT.Snake || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }
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
  var DR = { k: { note: 12, inst: 'kick', vol: 14 }, s: { note: 7, inst: 'snare', vol: 12 }, h: { note: 1, inst: 'hat', vol: 8 } };
  function drm(str) { return tok(str).map(function (t) { return DR[t] || null; }); }
  function stab(root, arp, n, step, vol) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push(i % step === 0 ? { note: root, inst: 'stab', vol: vol || 8, arp: arp } : null);
    return out;
  }
  var MIN = [0, 3, 7], MAJ = [0, 4, 7];
  var INST = {
    lead: { vol: [13, 14, 13, 12, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [1, 2], dutyLoop: 1 },
    soft: { vol: [10, 10, 9, 9, 8, 8, 7], volLoop: 6, duty: [2] },
    stab: { vol: [11, 9, 7, 5, 3, 2, 1, 0], duty: [0] },
    bass: {},
    kick: { vol: [15, 11, 7, 3, 0] }, snare: { vol: [13, 11, 8, 6, 4, 2, 0] }, hat: { vol: [6, 3, 0] }
  };
  function song(name, speed, rows, bars, playLoop) {
    var s = { name: name, speed: speed, rows: rows, instruments: INST, patterns: [], order: [], loop: 0, playLoop: playLoop !== false };
    var seen = {};
    function pat(tr, arr) {
      if (!arr) return undefined;
      if (arr.length !== rows) throw new Error('snake song ' + name + ' ' + tr + ' 長度 ' + arr.length + ' ≠ ' + rows);
      var key = tr + JSON.stringify(arr);
      if (seen[key] === undefined) { var o = {}; o[tr] = arr; s.patterns.push(o); seen[key] = s.patterns.length - 1; }
      return seen[key];
    }
    bars.forEach(function (b) {
      var e = {};
      ['p1', 'p2', 'tri', 'noi'].forEach(function (tr) { var p = pat(tr, b[tr]); if (p !== undefined) e[tr] = p; });
      s.order.push(e);
    });
    return s;
  }

  var PLAY_MEL = [
    'G-5 -   B-5 G-5 -   D-5 -   E-5 G-5 -   A-5 -   B-5 -   -   -  ',
    'E-5 -   G-5 E-5 -   B-4 -   D-5 E-5 -   G-5 -   F#5 -   -   -  ',
    'C-5 -   E-5 C-5 -   G-4 -   A-4 C-5 -   E-5 -   D-5 -   C-5 -  ',
    'D-5 -   F#5 -   A-5 -   F#5 -   D-5 -   E-5 -   F#5 -   -   -  ',
    'B-5 -   D-6 B-5 -   G-5 -   A-5 B-5 -   D-6 -   E-6 -   D-6 -  ',
    'G-5 -   B-5 G-5 -   E-5 -   F#5 G-5 -   B-5 -   A-5 -   -   -  ',
    'E-5 -   G-5 E-5 -   C-5 -   D-5 E-5 -   A-5 -   G-5 -   E-5 -  ',
    'F#5 -   -   A-5 -   -   D-5 -   E-5 -   F#5 -   G-5 -   -   -  '
  ];
  var PLAY_CH = [['G-3', MAJ], ['E-3', MIN], ['C-3', MAJ], ['D-3', MAJ], ['G-3', MAJ], ['E-3', MIN], ['C-3', MAJ], ['D-3', MAJ]];
  var PLAY_BASS = ['G-2', 'E-2', 'C-2', 'D-2', 'G-2', 'E-2', 'C-2', 'D-2'];
  function walk(root) {          // 行走低音：根 – 五 – 八 – 五
    var n = { 'G-2': ['G-2', 'D-3', 'G-3', 'D-3'], 'E-2': ['E-2', 'B-2', 'E-3', 'B-2'], 'C-2': ['C-2', 'G-2', 'C-3', 'G-2'],
              'D-2': ['D-2', 'A-2', 'D-3', 'A-2'], 'A-2': ['A-1', 'E-2', 'A-2', 'E-2'], 'B-2': ['B-1', 'F#2', 'B-2', 'F#2'] }[root];
    return mel(n[0] + ' - - - ' + n[1] + ' - - - ' + n[2] + ' - - - ' + n[3] + ' - - -', 'bass', 15);
  }
  function buildPlay() {
    var bars = [], i;
    for (i = 0; i < 8; i++) bars.push({ p1: mel(PLAY_MEL[i], 'lead', 12), p2: stab(PLAY_CH[i][0], PLAY_CH[i][1], 16, 2, 7),
      tri: walk(PLAY_BASS[i]), noi: drm(i % 4 === 3 ? 'k - h - s - h - k - k - s s s h' : 'k - h - s - h - k - h - s - h h') });
    return song('爬行（snake_play）', 6, 16, bars, true);
  }
  function buildTitle() {
    // fix-r5 P3-11：開頭動機改成「E D E G 鄰音繞 + 下行 6 度」，不再與 flyer 標題曲同為 D G B A G 分解和弦
    var M = ['E-5 -   D-5 E-5 G-5 -   -   -   E-5 -   C-5 -   D-5 -   -   -  ',
             'E-5 -   -   C-5 -   -   G-4 -   A-4 -   C-5 -   B-4 -   -   -  ',
             'B-4 -   -   D-5 -   -   G-5 -   A-5 -   B-5 -   C-6 -   -   -  ',
             'B-5 -   A-5 -   G-5 -   F#5 -   G-5 -   -   -   -   -   -   -  '];
    var CH = [['G-3', MAJ], ['C-3', MAJ], ['G-3', MAJ], ['D-3', MAJ]], B = ['G-2', 'C-2', 'G-2', 'D-2'], bars = [];
    for (var i = 0; i < 4; i++) bars.push({ p1: mel(M[i], 'soft', 11), p2: stab(CH[i][0], CH[i][1], 16, 4, 6), tri: walk(B[i]) });
    return song('星塵貪食蟲標題（snake_title）', 8, 16, bars, true);
  }
  function buildVs() {
    var A = ['E-5 -   G-5 -   B-5 -   E-6 -   D-6 -   B-5 -   G-5 -   A-5 -  ',
             'C-6 -   B-5 -   A-5 -   G-5 -   F#5 -   G-5 -   A-5 -   B-5 -  ',
             'E-5 -   G-5 -   B-5 -   E-6 -   F#6 -   E-6 -   D-6 -   B-5 -  ',
             'C-6 -   -   B-5 -   -   A-5 -   B-5 -   -   -   E-5 -   -   -  '];
    var R = ['-   -   -   -   -   -   -   -   B-4 -   G-4 -   E-4 -   F#4 -  ',
             '-   -   -   -   -   -   -   -   D-5 -   E-5 -   F#5 -   G-5 -  ',
             '-   -   -   -   -   -   -   -   B-4 -   D-5 -   E-5 -   F#5 -  ',
             'A-4 -   -   G-4 -   -   F#4 -   G-4 -   -   -   B-4 -   -   -  '];
    var B = ['E-2', 'C-2', 'E-2', 'B-2'], bars = [];
    for (var i = 0; i < 4; i++) bars.push({ p1: mel(A[i], 'lead', 12), p2: mel(R[i], 'soft', 8), tri: walk(B[i] === 'E-2' ? 'E-2' : B[i]),
      noi: drm('k h h h s h h h k h k h s h s h') });
    return song('對決（snake_vs）', 5, 16, bars, true);
  }
  function buildClear() {
    return song('過關（snake_clear）', 6, 16, [
      { p1: mel('G-5 -   B-5 -   D-6 -   G-6 -   F#6 -   D-6 -   E-6 -   F#6 -  ', 'lead', 13), tri: walk('G-2') },
      { p1: mel('G-6 -   -   -   -   -   -   -   -   -   -   -   =   -   -   -  ', 'lead', 13),
        tri: mel('G-2 -   -   -   -   -   -   -   -   -   -   -   =   -   -   -  ', 'bass', 15) }
    ], false);
  }
  function buildOver() {
    return song('結束（snake_over）', 8, 16, [
      { p1: mel('B-4 -   -   -   A#4 -   -   -   A-4 -   -   -   G#4 -   -   -  ', 'soft', 11),
        tri: mel('E-2 -   -   -   D#2 -   -   -   D-2 -   -   -   C#2 -   -   -  ', 'bass', 15) },
      { p1: mel('G-4 -   -   -   F#4 -   -   -   E-4 -   -   -   -   -   =   -  ', 'soft', 11),
        tri: mel('C-2 -   -   -   B-1 -   -   -   E-1 -   -   -   -   -   =   -  ', 'bass', 15) }
    ], false);
  }

  function sq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) for (j = 0; j < list[i][1]; j++)
      out.push(j === 0 ? { note: list[i][0], vol: list[i][2], duty: list[i][3] === undefined ? 1 : list[i][3] } : { vol: list[i][2] });
    out.push({ off: true });
    return out;
  }
  function nz(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) for (j = 0; j < list[i][1]; j++) out.push(j === 0 ? { note: list[i][0], vol: list[i][2] } : { vol: list[i][2] });
    out.push({ off: true });
    return out;
  }
  var SFX = {
    snake_eat: { priority: 3, data: { p2: sq([['B-5', 2, 11, 2], ['E-6', 2, 11], ['G#6', 3, 9]]) } },
    snake_gem: { priority: 5, data: { p2: sq([['E-6', 3, 12, 2], ['G#6', 3, 12], ['B-6', 3, 12], ['E-7', 6, 11]]) } },
    snake_warp: { priority: 4, data: { p2: sq([['C-5', 2, 10, 0], ['G-5', 2, 10], ['C-6', 2, 9], ['G-6', 2, 8], ['C-7', 2, 6]]) } },
    snake_crash: { priority: 9, data: { p2: sq([['F-4', 4, 13, 1], ['C#4', 4, 12], ['A-3', 6, 11], ['F-3', 10, 8]]),
                                        noi: nz([[10, 4, 13], [12, 6, 10], [14, 10, 6]]) } },
    snake_menu: { priority: 2, data: { p2: sq([['A-5', 2, 9, 2], ['E-6', 2, 7]]) } },
    snake_ok: { priority: 4, data: { p2: sq([['D-6', 3, 11, 2], ['A-6', 6, 11]]) } },
    snake_pause: { priority: 4, data: { p2: sq([['G-5', 3, 10, 2], ['D-5', 3, 10], ['G-5', 4, 8]]) } },
    snake_cpu: { priority: 3, data: { p2: sq([['F-5', 2, 10, 0], ['C-5', 3, 9]]) } }
  };

  S.SONGS = { snake_title: buildTitle(), snake_play: buildPlay(), snake_vs: buildVs(), snake_clear: buildClear(), snake_over: buildOver() };
  S.SFX = SFX;

  var drv = function (nes) { return (nes && nes.music) || ((window.NES && NES.Music && NES.Music._default) ? NES.Music : null); };
  // nes.music 是 NES.Music 門面（playing / orderIndex 在 _default driver 上）
  var core = function (nes) { var d = drv(nes); return d && d._default ? d._default : d; };
  S.Audio = {
    current: null,
    init: function (nes) {
      var d = drv(nes); if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (nes, key) {
      var d = drv(nes), s = S.SONGS[key];
      if (!d || !s) return false;
      if (S.Audio.current === key && d.playing) return true;
      try { d.play(s, { loop: s.playLoop }); S.Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function (nes) {
      var d = drv(nes); S.Audio.current = null;
      if (!d) return false;
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    sfx: function (nes, name) {
      var d = drv(nes); if (!d || !SFX[name]) return false;
      try { d.sfx(name); S.Audio.last = name; return true; } catch (e) {
        try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; }
      }
    },
    // fix-r5 §6-2 → fix-r6 P3-8：暫停 = engine NES.Music.pause()（停 BGM、音效照常、記住 row）；
    //   解除 = resume() 從同一 row 同一幀接續（與 blocks / brick / racing / tower 一致）。舊引擎沒有 pause ⇒ 退回記小節重播。
    paused: null,
    pause: function (nes) {
      var d = core(nes); if (!d || !S.Audio.current) return false;
      if (d.pause && d.isPaused) {
        S.Audio.paused = { key: S.Audio.current, engine: true, was: !!d.playing };
        try { d.pause(); } catch (e) { }
        return true;
      }
      S.Audio.paused = { key: S.Audio.current, from: d.playing ? (d.orderIndex || 0) : 0, was: !!d.playing };
      try { d.stop(); } catch (e) { }
      return true;
    },
    resume: function (nes) {
      var p = S.Audio.paused, d = core(nes); S.Audio.paused = null;
      if (!p || !d || !p.was) return false;
      if (p.engine) {
        if (!d.isPaused()) return false;            // 暫停期間 play / stop 過 ⇒ 快照作廢
        try { d.resume(); S.Audio.current = p.key; return true; } catch (e) { return false; }
      }
      var s = S.SONGS[p.key]; if (!s) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from }); S.Audio.current = p.key; return true; } catch (e) { return false; }
    },
    tick: function (nes) { var d = drv(nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
})();
