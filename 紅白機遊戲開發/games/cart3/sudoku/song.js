/*
 * games/cart3/sudoku/song.js — 《星塵數獨》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）｜ 依賴：engine/music.js（寫法同 merge/song.js）
 * 契約：CT.Sudoku.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key           | 曲名     | speed | 小節 | 說明 |
 * |---------------|----------|-------|------|------|
 * | sudoku_title  | 星格序曲 | 7     | 4    | 標題；C 大調 |
 * | sudoku_play   | 星格冥想 | 9     | 8    | 解題中；A 小調慢板（和聲小調的 G# 收尾），p2 隔小節換回音 |
 * | sudoku_clear  | 解開了   | 6     | 1    | 解完（不 loop） |
 * | sudoku_over   | 迷途     | 9     | 1    | STRICT 模式錯 3 次（不 loop） |
 * 音效（只搶 p2 / noi）：sudoku_move / open / set / note / erase / error / undo / hint / bump / unit / menu / ok
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SU = CT.Sudoku = CT.Sudoku || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 11 }, s: { note: 6, inst: 'snare', vol: 8 }, h: { note: 1, inst: 'hat', vol: 5 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  function arpeg(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  function bass(r1, r2) { return mel([r1, '-', '-', '-', r2, '-', '-', '-', r1, '-', '-', '-', r2, '-', '-', '-'].join(' '), 'bass', 15, 0); }
  var INST = {
    lead: { vol: [11, 12, 12, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 10, duty: [2, 2, 1] },
    soft: { vol: [6, 8, 9, 9, 8, 8, 7, 7, 6], volLoop: 8, duty: [1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [4, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [12, 8, 5, 2, 0] },
    snare: { vol: [9, 7, 5, 3, 1, 0] },
    hat: { vol: [4, 2, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  function buildTitle() {
    var M = [
      'E-5 -   G-5 -   C-6 -   B-5 -   A-5 -   G-5 -   E-5 -   -   -',
      'F-5 -   A-5 -   C-6 -   A-5 -   G-5 -   -   -   D-5 -   -   -',
      'E-5 -   G-5 -   B-5 -   D-6 -   C-6 -   B-5 -   A-5 -   -   -',
      'G-5 -   F-5 -   E-5 -   D-5 -   C-5 -   -   -   =   -   -   -'
    ];
    var C = [['C-4', MAJ, 'C-2', 'G-2'], ['F-3', MAJ, 'F-2', 'C-3'], ['A-3', MIN, 'A-2', 'E-2'], ['G-3', MAJ, 'G-2', 'D-3']];
    return song('星格序曲（sudoku_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: arpeg(C[i][0], C[i][1], 6), tri: bass(C[i][2], C[i][3]), noi: drm('k - h - h - h - s - h - h - h -') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'A-4 -   -   -   C-5 -   E-5 -   -   -   D-5 -   C-5 -   -   -',
      'B-4 -   -   -   D-5 -   G-5 -   -   -   F-5 -   E-5 -   -   -',
      'C-5 -   -   -   E-5 -   A-5 -   -   -   G-5 -   F-5 -   E-5 -',
      'E-5 -   -   -   -   -   D-5 -   E-5 -   -   -   -   -   -   -',
      'A-5 -   -   -   G-5 -   E-5 -   -   -   C-5 -   D-5 -   E-5 -',
      'F-5 -   -   -   E-5 -   D-5 -   -   -   C-5 -   B-4 -   C-5 -',
      'D-5 -   E-5 -   F-5 -   G#5 -  A-5 -   G#5 -  F-5 -   E-5 -',
      'A-4 -   -   -   -   -   E-4 -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-3', MIN, 'A-2', 'E-2'], ['G-3', MAJ, 'G-2', 'D-2'], ['F-3', MAJ, 'F-2', 'C-3'], ['E-3', MAJ, 'E-2', 'B-2'],
             ['A-3', MIN, 'A-2', 'E-2'], ['D-3', MIN, 'D-2', 'A-2'], ['E-3', MAJ, 'E-2', 'B-2'], ['A-3', MIN, 'A-2', 'E-2']];
    return song('星格冥想（sudoku_play）', 9, M.map(function (m, i) {
      return { p1: mel(m, 'soft', 10, 1), p2: (i & 1) ? [null, null, null].concat(mel(m, 'echo', 5, 2).slice(0, 13)) : arpeg(C[i][0], C[i][1], 5),
               tri: bass(C[i][2], C[i][3]), noi: drm('h - - - - - - - h - - - - - h -') };
    }), true);
  }
  function buildClear() {
    return song('解開了（sudoku_clear）', 6, [{
      p1: mel('C-5 E-5 G-5 C-6 -   G-5 C-6 E-6 -   D-6 E-6 G-6 -   -   =   -', 'lead', 12, 2),
      p2: mel('G-4 C-5 E-5 G-5 -   E-5 G-5 C-6 -   B-5 C-6 D-6 -   -   =   -', 'echo', 8, 1),
      tri: mel('C-3 -   -   -   G-2 -   -   -   G-2 -   -   -   C-3 -   =   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - h - s s s -')
    }], false);
  }
  function buildOver() {
    return song('迷途（sudoku_over）', 9, [{
      p1: mel('E-5 -   D-5 -   C-5 -   B-4 -   A-4 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('C-5 -   B-4 -   A-4 -   G#4 -  E-4 -   -   -   =   -   -   -', 'echo', 7, 1),
      tri: mel('A-2 -   -   -   E-2 -   -   -   A-2 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: fit([])
    }], false);
  }

  function sq(list) {
    var out = [];
    list.forEach(function (e) { for (var j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], duty: e[3] === undefined ? 2 : e[3], retrigger: true } : {}); });
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
    sudoku_move: { priority: 1, data: { p2: sq([['A-6', 1, 5, 2]]) } },
    sudoku_open: { priority: 2, data: { p2: sq([['E-5', 2, 8, 2], ['B-5', 2, 7]]) } },
    sudoku_set: { priority: 2, data: { p2: sq([['C-6', 2, 10, 2], ['G-6', 3, 8]]) } },
    sudoku_note: { priority: 2, data: { p2: sq([['G-6', 1, 7, 1], ['C-7', 2, 5]]) } },
    sudoku_erase: { priority: 2, data: { noi: nz([[4, 2, 7], [7, 3, 4]]) } },
    sudoku_error: { priority: 4, data: { p2: sq([['C#4', 4, 11, 0], ['C-4', 6, 9]]) } },
    sudoku_undo: { priority: 3, data: { p2: sq([['G-5', 2, 9, 1], ['D-5', 2, 9], ['G-4', 3, 8]]) } },
    sudoku_hint: { priority: 3, data: { p2: sq([['E-6', 2, 9, 2], ['G#6', 2, 9], ['B-6', 4, 8]]) } },
    sudoku_bump: { priority: 1, data: { p2: sq([['C-3', 3, 8, 0]]) } },
    sudoku_unit: { priority: 3, data: { p2: sq([['C-6', 2, 10, 2], ['E-6', 2, 10], ['G-6', 2, 10], ['C-7', 4, 9]]) } },
    sudoku_menu: { priority: 1, data: { p2: sq([['B-5', 2, 8, 2]]) } },
    sudoku_ok: { priority: 4, data: { p2: sq([['G-5', 2, 10, 2], ['D-6', 4, 10]]) } }
  };
  var SONGS = { sudoku_title: buildTitle(), sudoku_play: buildPlay(), sudoku_clear: buildClear(), sudoku_over: buildOver() };

  function drv() { return (Audio._nes && Audio._nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, lastSfx: null, _nes: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null;
      var d = drv();
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(), s = SONGS[key];
      if (!d || !s) return false;
      if (Audio.current === key && !(d.isPaused && d.isPaused())) return true;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; },
    pause: function () { var d = drv(); if (d && d.pause) { try { d.pause(); } catch (e) { } } else if (d) { try { d.stop(); } catch (e) { } } },
    resume: function () { var d = drv(); if (d && d.isPaused && d.isPaused()) { try { return d.resume(); } catch (e) { } } return false; },
    isPaused: function () { var d = drv(); return !!(d && d.isPaused && d.isPaused()); },
    sfx: function (name) {
      var d = drv();
      Audio.lastSfx = name;
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(); if (d) { try { d.tick(); } catch (e) { } } }
  };
  SU.Audio = Audio;
})();
