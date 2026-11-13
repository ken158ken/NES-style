/*
 * games/cart3/gomoku/song.js — 《星塵五子棋》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/music.js
 * 契約：CT.Gomoku.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | gomoku_title | 星盤邀約 | 8     | 4    | 標題；G 大調五聲，p1 旋律 / p2 分解和弦 / tri 根音 |
 * | gomoku_play  | 對弈靜夜 | 9     | 8    | 對局；A 小調慢板，留白多（思考用） |
 * | gomoku_win   | 五星連珠 | 6     | 1    | 勝利（不 loop） |
 * | gomoku_lose  | 月落     | 8     | 1    | 落敗 / 和局（不 loop） |
 * 音效（只搶 p2 / noi）：gomoku_move / place / cpu / undo / hint / menu / ok / threat / think
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var GO = CT.Gomoku = CT.Gomoku || {};

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
  var INST = {
    lead: { vol: [10, 11, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [6, 8, 9, 9, 8, 8, 7, 7, 6], volLoop: 8, duty: [1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    bell: { vol: [9, 7, 6, 5, 4, 3, 2, 2, 1, 0], duty: [0] },
    bass: {},
    kick: { vol: [12, 8, 5, 2, 0] },
    snare: { vol: [10, 7, 5, 3, 1, 0] },
    hat: { vol: [4, 2, 0] }
  };
  var MIN = [0, 3, 7, 10], MAJ = [0, 4, 7, 11], SUS = [0, 5, 7, 10];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function bassLine(r, r2) { return [r, '-', '-', '-', r2, '-', '-', '-', r, '-', '-', '-', r2, '-', r, '-'].join(' '); }

  function buildTitle() {
    var M = [
      'G-5 -   A-5 -   B-5 -   D-6 -   B-5 -   A-5 -   G-5 -   -   -',
      'E-5 -   G-5 -   A-5 -   B-5 -   A-5 -   -   -   E-5 -   -   -',
      'C-5 -   E-5 -   G-5 -   A-5 -   G-5 -   E-5 -   D-5 -   -   -',
      'D-5 -   E-5 -   G-5 -   A-5 -   G-5 -   -   -   =   -   -   -'
    ];
    var C = [['G-3', MAJ, 'G-2', 'D-2'], ['E-3', MIN, 'E-2', 'B-1'], ['C-3', MAJ, 'C-2', 'G-1'], ['D-3', SUS, 'D-2', 'A-1']];
    return song('星盤邀約（gomoku_title）', 8, M.map(function (m, i) {
      var c = C[i];
      return { p1: mel(m, 'lead', 10, 2), p2: arpeg(c[0].replace('-3', '-4'), c[1], 6),
               tri: mel(bassLine(c[2], c[3]), 'bass', 15, 0), noi: drm('k - - - h - - - s - - - h - - -') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'A-4 -   -   -   E-5 -   -   -   D-5 -   C-5 -   B-4 -   -   -',
      'C-5 -   -   -   G-5 -   -   -   F-5 -   E-5 -   D-5 -   -   -',
      'F-4 -   -   -   C-5 -   -   -   A-4 -   B-4 -   C-5 -   -   -',
      'E-5 -   -   -   D-5 -   B-4 -   G#4 -   -   -   =   -   -   -',
      'A-4 -   C-5 -   E-5 -   -   -   A-5 -   G-5 -   E-5 -   -   -',
      'F-5 -   -   -   E-5 -   D-5 -   C-5 -   D-5 -   -   -   -   -',
      'D-5 -   C-5 -   B-4 -   A-4 -   G-4 -   A-4 -   B-4 -   -   -',
      'C-5 -   B-4 -   A-4 -   G#4 -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-2', MIN, 'A-1', 'E-2'], ['C-3', MAJ, 'C-2', 'G-1'], ['F-2', MAJ, 'F-1', 'C-2'], ['E-2', MAJ, 'E-1', 'B-1'],
             ['A-2', MIN, 'A-1', 'E-2'], ['D-3', MIN, 'D-2', 'A-1'], ['G-2', MAJ, 'G-1', 'D-2'], ['E-2', SUS, 'E-1', 'B-1']];
    return song('對弈靜夜（gomoku_play）', 9, M.map(function (m, i) {
      var c = C[i];
      return { p1: mel(m, 'soft', 9, 2), p2: arpeg(c[0].replace('-2', '-3').replace('-3', '-4'), c[1], 5),
               tri: mel(bassLine(c[2], c[3]), 'bass', 15, 0), noi: drm('h - - - - - - - h - - - - - - -') };
    }), true);
  }
  function buildWin() {
    return song('五星連珠（gomoku_win）', 6, [{
      p1: mel('G-5 B-5 D-6 G-6 -   D-6 G-6 A-6 B-6 -   -   -   =   -   -   -', 'lead', 11, 2),
      p2: mel('D-5 G-5 B-5 D-6 -   B-5 D-6 F#6 G-6 -   -   -   =   -   -   -', 'bell', 8, 1),
      tri: mel('G-2 -   -   -   D-2 -   -   -   G-2 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - - - - - - -')
    }], false);
  }
  function buildLose() {
    return song('月落（gomoku_lose）', 8, [{
      p1: mel('A-5 -   G-5 -   E-5 -   D-5 -   C-5 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('E-5 -   D-5 -   C-5 -   A-4 -   A-4 -   -   -   =   -   -   -', 'bell', 7, 1),
      tri: mel('A-2 -   -   -   F-2 -   -   -   E-2 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: fit([])
    }], false);
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
    gomoku_move: { priority: 1, data: { p2: sq([['G-6', 1, 5, 2]]) } },
    gomoku_place: { priority: 2, data: { p2: sq([['D-6', 1, 10, 2], ['A-5', 3, 7]]), noi: nz([[10, 2, 7]]) } },
    gomoku_cpu: { priority: 2, data: { p2: sq([['A-5', 1, 9, 1], ['E-5', 3, 7]]), noi: nz([[11, 2, 6]]) } },
    gomoku_undo: { priority: 3, data: { p2: sq([['C-6', 2, 9, 2], ['G-5', 2, 9], ['E-5', 4, 8]]) } },
    gomoku_hint: { priority: 3, data: { p2: sq([['E-6', 2, 9, 2], ['G#6', 2, 9], ['B-6', 5, 8]]) } },
    gomoku_menu: { priority: 1, data: { p2: sq([['C-6', 2, 7, 2]]) } },
    gomoku_ok: { priority: 3, data: { p2: sq([['G-5', 2, 10, 2], ['D-6', 2, 10], ['G-6', 4, 9]]) } },
    gomoku_threat: { priority: 4, data: { p2: sq([['B-5', 3, 10, 0], ['B-5', 2, 0], ['B-5', 3, 10, 0]]) } },
    gomoku_think: { priority: 1, data: { p2: sq([['E-6', 1, 4, 2]]) } }
  };
  var SONGS = { gomoku_title: buildTitle(), gomoku_play: buildPlay(), gomoku_win: buildWin(), gomoku_lose: buildLose() };

  function drv(nes) { return (nes && nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, lastSfx: null, _nes: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; },
    pause: function () { var d = drv(Audio._nes); if (d && d.pause) { try { d.pause(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } },
    resume: function () { var d = drv(Audio._nes); if (d && d.resume) { try { d.resume(); } catch (e) { } } },
    sfx: function (name) {
      var d = drv(Audio._nes);
      Audio.lastSfx = name;
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  GO.Audio = Audio;
})();
