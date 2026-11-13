/*
 * games/cart3/labyrinth/song.js — 《星塵迷宮探索》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-4 cart3-maze（R7）｜ 依賴：engine/music.js
 * 契約：CT.Labyrinth.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key               | 曲名       | speed | 小節 | 說明 |
 * |-------------------|------------|-------|------|------|
 * | labyrinth_title   | 燈下的入口 | 7     | 4    | 標題；D 多利安，上行四度動機 |
 * | labyrinth_cave    | 星苔洞窟   | 8     | 8    | 主題 0（1~3 層）；A 小調，水滴般的 p2 分解和弦 |
 * | labyrinth_kiln    | 餘燼窯     | 7     | 8    | 主題 1（4~6 層）；E 弗里幾亞，三角波脈動低音 |
 * | labyrinth_void    | 虛空花園   | 8     | 8    | 主題 2（7~9 層 / 隨機）；F# 小調，長音 + 稀疏鼓 |
 * | labyrinth_clear   | 點燈       | 6     | 2    | 樓層通過（不 loop） |
 * | labyrinth_end     | 迷宮點亮了 | 7     | 4    | 九層全破的結局 |
 * 音效（只搶 p2 / noi）：labyrinth_key / door / locked / switch / shift / shard / lamp / exit / map / ping / move / ok
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var L = CT.Labyrinth = CT.Labyrinth || {};
  var NES = window.NES = window.NES || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 12, duty: 0 }, s: { note: 6, inst: 'snare', vol: 10, duty: 0 },
             h: { note: 1, inst: 'hat', vol: 6, duty: 0 }, t: { note: 9, inst: 'tick', vol: 8, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function arp(root, chord, vol, every, inst) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % every === 0 ? { note: root, inst: inst || 'drip', vol: vol, duty: 1, arp: [chord[(i / every | 0) % chord.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [11, 12, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [6, 8, 10, 10, 9, 9, 8, 8, 7], volLoop: 8, duty: [1] },
    drip: { vol: [9, 6, 4, 2, 1, 0], duty: [1] },
    bell: { vol: [12, 9, 7, 6, 5, 4, 3, 2, 1, 0], duty: [0] },
    bass: {},
    kick: { vol: [13, 10, 6, 3, 0] },
    snare: { vol: [11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [5, 3, 1, 0] },
    tick: { vol: [7, 2, 0] }
  };
  var MIN = [0, 3, 7, 12], MAJ = [0, 4, 7, 12], SUS2 = [0, 2, 7, 12], M7 = [0, 3, 7, 10];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function lo(n) { return n.replace(/\d$/, function (d) { return String(+d - 1); }); }
  function o4(n) { return n.replace(/\d$/, '4'); }

  // ---- 燈下的入口（標題；D 多利安）----
  function buildTitle() {
    var M = [
      'D-5 -   -   G-5 -   -   A-5 -   C-6 -   B-5 -   A-5 -   -   -',
      'G-5 -   -   F-5 -   E-5 -   -   D-5 -   -   -   A-4 -   -   -',
      'D-5 -   -   G-5 -   -   A-5 -   D-6 -   C-6 -   A-5 -   B-5 -',
      'C-6 -   A-5 -   G-5 -   E-5 -   D-5 -   -   -   =   -   -   -'
    ];
    var C = [['D-3', MIN], ['G-2', MAJ], ['D-3', MIN], ['C-3', MAJ]];
    return song('燈下的入口（labyrinth_title）', 7, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'lead', 11, 2), p2: arp(o4(r), C[i][1], 6, 2),
               tri: mel(lo(r) + ' -   -   -   -   -   ' + r + ' -   -   -   -   -   ' + lo(r) + ' -   -   -', 'bass', 15, 0),
               noi: drm('k - - - h - - - s - - - h - - h') };
    }), true);
  }
  // ---- 星苔洞窟（A 小調，滴水分解和弦）----
  function buildCave() {
    var M = [
      'E-5 -   -   -   -   -   C-5 -   D-5 -   E-5 -   -   -   -   -',
      'G-5 -   -   -   F-5 -   E-5 -   D-5 -   -   -   -   -   -   -',
      'C-5 -   -   -   -   -   A-4 -   B-4 -   C-5 -   -   -   E-5 -',
      'D-5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -',
      'A-5 -   -   -   G-5 -   -   -   E-5 -   -   -   F-5 -   -   -',
      'E-5 -   -   -   D-5 -   C-5 -   B-4 -   -   -   -   -   -   -',
      'C-5 -   D-5 -   E-5 -   -   -   A-5 -   -   -   G#5 -   -   -',
      'A-5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -'
    ];
    var C = [['A-2', MIN], ['G-2', MAJ], ['F-2', MAJ], ['G-2', SUS2], ['A-2', MIN], ['E-2', MIN], ['F-2', MAJ], ['E-2', MAJ]];
    return song('星苔洞窟（labyrinth_cave）', 8, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'soft', 11, 2), p2: arp(o4(r), C[i][1], 5, 1),
               tri: mel(r + ' -   -   -   -   -   -   -   ' + r + ' -   -   -   -   -   -   -', 'bass', 15, 0),
               noi: drm('t - - - - - - - t - - - - - h -') };
    }), true);
  }
  // ---- 餘燼窯（E 弗里幾亞，脈動）----
  function buildKiln() {
    var M = [
      'E-5 -   F-5 -   E-5 -   -   -   B-4 -   C-5 -   B-4 -   -   -',
      'E-5 -   F-5 -   G-5 -   -   -   F-5 -   E-5 -   D-5 -   -   -',
      'C-5 -   D-5 -   E-5 -   -   -   G-5 -   F-5 -   E-5 -   -   -',
      'F-5 -   -   -   E-5 -   -   -   D-5 -   -   -   E-5 -   -   -',
      'B-5 -   -   A-5 G-5 -   -   -   F-5 -   G-5 -   A-5 -   -   -',
      'G-5 -   -   F-5 E-5 -   -   -   D-5 -   E-5 -   F-5 -   -   -',
      'E-5 -   G-5 -   B-5 -   -   -   C-6 -   B-5 -   A-5 -   G-5 -',
      'F-5 -   -   -   E-5 -   -   -   -   -   -   -   =   -   -   -'
    ];
    var C = [['E-2', MIN], ['E-2', MIN], ['C-2', MAJ], ['D-2', MAJ], ['E-2', M7], ['C-2', MAJ], ['A-2', MIN], ['F-2', MAJ]];
    return song('餘燼窯（labyrinth_kiln）', 7, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'lead', 10, 1), p2: arp(o4(r), C[i][1], 5, 4, 'bell'),
               tri: mel((r + ' -   ' + r + ' =   ').repeat(4), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - k - s - h h') };
    }), true);
  }
  // ---- 虛空花園（F# 小調，長音）----
  function buildVoid() {
    var M = [
      'F#5 -   -   -   -   -   -   -   C#6 -   -   -   -   -   -   -',
      'B-5 -   -   -   A-5 -   -   -   G#5 -   -   -   -   -   -   -',
      'A-5 -   -   -   -   -   F#5 -   E-5 -   -   -   F#5 -   -   -',
      'C#5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -',
      'D-5 -   -   -   F#5 -   -   -   A-5 -   -   -   C#6 -   -   -',
      'B-5 -   -   -   -   -   A-5 -   F#5 -   -   -   -   -   -   -',
      'G#5 -   -   -   A-5 -   -   -   B-5 -   -   -   C#6 -   -   -',
      'F#5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -'
    ];
    var C = [['F#2', MIN], ['B-2', MIN], ['D-3', MAJ], ['C#3', MAJ], ['D-3', MAJ], ['B-2', MIN], ['E-3', MAJ], ['F#2', MIN]];
    return song('虛空花園（labyrinth_void）', 8, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'soft', 10, 2), p2: arp(o4(r), C[i][1], 4, 2),
               tri: mel(lo(r) + ' -   -   -   -   -   -   -   -   -   -   -   ' + r + ' -   -   -', 'bass', 15, 0),
               noi: drm('k - - - - - - - - - - - t - - -') };
    }), true);
  }
  function buildClear() {
    return song('點燈（labyrinth_clear）', 6, [
      { p1: mel('A-4 -   C#5 -   E-5 -   A-5 -   -   -   G#5 -   A-5 -   B-5 -', 'lead', 12, 2),
        p2: mel('E-4 -   A-4 -   C#5 -   E-5 -   -   -   E-5 -   F#5 -   G#5 -', 'soft', 8, 1),
        tri: mel('A-2 -   -   -   E-2 -   -   -   A-2 -   -   -   E-2 -   -   -', 'bass', 15, 0),
        noi: drm('k - - - s - - - k - k - s - - -') },
      { p1: mel('C#6 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -', 'lead', 12, 2),
        p2: mel('A-5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -', 'soft', 8, 1),
        tri: mel('A-2 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -', 'bass', 15, 0),
        noi: drm('k - - - - - - - - - - - - - - -') }
    ], false);
  }
  function buildEnd() {
    var M = [
      'C-5 -   E-5 -   G-5 -   C-6 -   B-5 -   G-5 -   A-5 -   -   -',
      'F-5 -   A-5 -   C-6 -   -   -   B-5 -   A-5 -   G-5 -   -   -',
      'E-5 -   G-5 -   C-6 -   E-6 -   D-6 -   C-6 -   A-5 -   B-5 -',
      'C-6 -   -   -   G-5 -   -   -   C-5 -   -   -   =   -   -   -'
    ];
    var C = [['C-3', MAJ], ['F-2', MAJ], ['A-2', MIN], ['G-2', MAJ]];
    return song('迷宮點亮了（labyrinth_end）', 7, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'lead', 11, 2), p2: arp(o4(r), C[i][1], 6, 2),
               tri: mel((lo(r) + ' -   -   -   ' + r + ' -   -   -   ').repeat(2), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h - s - h -') };
    }), true);
  }

  function sq(list) {
    var out = [];
    list.forEach(function (e) { for (var j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], duty: e[3] === undefined ? 1 : e[3], retrigger: true } : {}); });
    out.push({ off: true });
    return out;
  }
  function nz(list) {
    var out = [];
    list.forEach(function (e) { for (var j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], retrigger: true } : {}); });
    out.push({ off: true });
    return out;
  }
  var SFX = {
    labyrinth_key: { priority: 4, data: { p2: sq([['E-6', 3, 11, 2], ['B-6', 3, 11], ['E-7', 6, 9]]) } },
    labyrinth_door: { priority: 5, data: { p2: sq([['C-4', 3, 12, 0], ['G-4', 3, 11], ['C-5', 6, 10]]), noi: nz([[9, 3, 10], [12, 6, 6]]) } },
    labyrinth_locked: { priority: 3, data: { p2: sq([['D-4', 4, 11, 0], ['C#4', 6, 9]]) } },
    labyrinth_switch: { priority: 5, data: { p2: sq([['A-5', 2, 11, 1], ['E-5', 2, 11], ['A-6', 6, 10]]), noi: nz([[5, 2, 8]]) } },
    labyrinth_shift: { priority: 2, data: { noi: nz([[13, 4, 9], [14, 6, 7], [15, 8, 4]]) } },
    labyrinth_shard: { priority: 4, data: { p2: sq([['B-6', 2, 10, 2], ['F#6', 2, 9], ['B-6', 2, 9], ['D#7', 6, 8]]) } },
    labyrinth_lamp: { priority: 5, data: { p2: sq([['G-5', 3, 11, 2], ['B-5', 3, 11], ['D-6', 3, 11], ['G-6', 8, 10]]) } },
    labyrinth_exit: { priority: 6, data: { p2: sq([['C-6', 3, 12, 2], ['G-5', 3, 11], ['C-6', 3, 11], ['G-6', 10, 10]]), noi: nz([[3, 6, 6], [2, 8, 3]]) } },
    labyrinth_map: { priority: 3, data: { p2: sq([['D-6', 2, 9, 2], ['A-6', 4, 8]]) } },
    labyrinth_ping: { priority: 4, data: { p2: sq([['A-6', 2, 11, 0], ['A-6', 2, 0], ['A-6', 2, 8], ['A-6', 2, 0], ['A-6', 4, 5]]) } },
    labyrinth_move: { priority: 2, data: { p2: sq([['G-5', 3, 9, 2]]) } },
    labyrinth_ok: { priority: 4, data: { p2: sq([['D-6', 3, 11, 2], ['A-6', 6, 11]]) } }
  };
  var SONGS = { labyrinth_title: buildTitle(), labyrinth_cave: buildCave(), labyrinth_kiln: buildKiln(), labyrinth_void: buildVoid(),
                labyrinth_clear: buildClear(), labyrinth_end: buildEnd() };

  function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, pauseKey: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; Audio.pauseKey = null;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      Audio.pauseKey = null;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio.pauseKey = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    // §6-2：暫停 = engine pause（記 row）、解除 = 同一 row 接續
    pause: function () {
      var d = drv(Audio._nes), k = Audio.current;
      if (!d || !k) return false;
      Audio.pauseKey = k; Audio.current = null;
      try { if (d.pause) d.pause(); else d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), k = Audio.pauseKey;
      Audio.pauseKey = null;
      if (!d || !k) return false;
      try { if (d.isPaused && d.isPaused()) { d.resume(); Audio.current = k; return true; } } catch (e) { }
      return Audio.play(k);
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  L.Audio = Audio;
})();
