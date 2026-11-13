/*
 * games/cart5/words/song.js — 《星塵字謎》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/music.js（寫法同 cart3 sudoku/song.js）
 * 契約：CT.Words.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | words_title  | 字母星座 | 7     | 4    | 標題；E 小調 → G 大調、p2 回音 |
 * | words_think  | 思考星雲 | 9     | 8    | 遊玩中；A 多利安慢板、三角波低音走句 |
 * | words_clear  | 解讀成功 | 6     | 1    | 過關（不 loop） |
 * | words_over   | 訊號中斷 | 9     | 1    | 失敗（不 loop） |
 * 音效（只搶 p2 / noi）：words_move / key / del / bad / good / star / ring / none / found / menu / ok / hint
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var WD = CT.Words = CT.Words || {};

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
  function arpeg(root, arp, vol, every) {
    var out = [], e = every || 2;
    for (var i = 0; i < 16; i++) out.push(i % e === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i / e | 0) % arp.length]] } : null);
    return out;
  }
  function bass(str) { return mel(str, 'bass', 15, 0); }
  var INST = {
    lead: { vol: [12, 12, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [6, 8, 9, 9, 8, 8, 7, 7, 6], volLoop: 8, duty: [1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [4, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [12, 8, 5, 2, 0] },
    snare: { vol: [9, 7, 5, 3, 1, 0] },
    hat: { vol: [4, 2, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12], SUS = [0, 5, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  function buildTitle() {
    var M = [
      'E-5 -   G-5 -   B-5 -   E-6 -   D-6 -   B-5 -   G-5 -   A-5 -',
      'B-5 -   -   -   A-5 -   G-5 -   F#5 -   -   -   E-5 -   -   -',
      'G-5 -   B-5 -   D-6 -   G-6 -   F#6 -  D-6 -   B-5 -   C-6 -',
      'D-6 -   -   -   C-6 -   A-5 -   B-5 -   -   -   =   -   -   -'
    ];
    var C = [['E-3', MIN], ['C-3', MAJ], ['G-3', MAJ], ['D-3', MAJ]];
    var BS = ['E-2 - - - B-2 - - - E-2 - - - B-2 - - -', 'C-2 - - - G-2 - - - A-1 - - - B-1 - - -',
              'G-2 - - - D-3 - - - G-2 - - - D-3 - - -', 'D-2 - - - A-2 - - - G-2 - - - = - - -'];
    return song('字母星座（words_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: [null, null].concat(mel(m, 'echo', 5, 1).slice(0, 14)), tri: bass(BS[i]), noi: drm('k - h - s - h - k - h - s - h h') };
    }), true);
  }
  function buildThink() {
    var M = [
      'A-4 -   -   -   B-4 -   C-5 -   -   -   E-5 -   D-5 -   -   -',
      'C-5 -   -   -   B-4 -   A-4 -   -   -   G-4 -   A-4 -   -   -',
      'F#5 -   -   -   E-5 -   D-5 -   -   -   C-5 -   B-4 -   -   -',
      'A-4 -   -   -   -   -   E-4 -   G-4 -   -   -   A-4 -   -   -',
      'E-5 -   -   -   F#5 -   G-5 -   -   -   A-5 -   G-5 -   -   -',
      'F#5 -   -   -   E-5 -   D-5 -   -   -   B-4 -   C-5 -   -   -',
      'D-5 -   E-5 -   F#5 -   E-5 -   D-5 -   C-5 -   B-4 -   G-4 -',
      'A-4 -   -   -   -   -   -   -   E-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-3', MIN], ['F-3', MAJ], ['D-3', MAJ], ['A-3', MIN], ['C-3', MAJ], ['D-3', MAJ], ['G-3', MAJ], ['A-3', MIN]];
    var R = ['A-2', 'F-2', 'D-2', 'A-2', 'C-3', 'D-2', 'G-2', 'A-2'];
    return song('思考星雲（words_think）', 9, M.map(function (m, i) {
      var r = R[i];
      return { p1: mel(m, 'soft', 10, 1), p2: arpeg(C[i][0], C[i][1], 4, 2), tri: bass([r, '-', '-', '-', '-', '-', '-', '-', r, '-', '-', '-', '-', '-', '-', '-'].join(' ')), noi: drm('h - - - - - - - h - - - h - - -') };
    }), true);
  }
  function buildClear() {
    return song('解讀成功（words_clear）', 6, [{
      p1: mel('E-5 G-5 B-5 E-6 -   B-5 E-6 G-6 -   F#6 G-6 B-6 -   -   =   -', 'lead', 12, 2),
      p2: mel('B-4 E-5 G-5 B-5 -   G-5 B-5 E-6 -   D#6 E-6 F#6 -  -   =   -', 'echo', 8, 1),
      tri: mel('E-2 -   -   -   B-2 -   -   -   B-2 -   -   -   E-2 -   =   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - h - s s s -')
    }], false);
  }
  function buildOver() {
    return song('訊號中斷（words_over）', 9, [{
      p1: mel('B-4 -   A-4 -   G-4 -   F#4 -  E-4 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('G-4 -   F#4 -  E-4 -   D#4 -  B-3 -   -   -   =   -   -   -', 'echo', 7, 1),
      tri: mel('E-2 -   -   -   B-1 -   -   -   E-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    words_move: { priority: 1, data: { p2: sq([['E-6', 1, 4, 2]]) } },
    words_key: { priority: 2, data: { p2: sq([['A-5', 1, 8, 2], ['E-6', 2, 6]]) } },
    words_del: { priority: 2, data: { p2: sq([['G-5', 1, 7, 1], ['D-5', 2, 6]]) } },
    words_bad: { priority: 3, data: { p2: sq([['D#3', 4, 10, 0], ['D-3', 5, 8]]) } },
    words_good: { priority: 3, data: { p2: sq([['C-6', 2, 10, 2], ['E-6', 2, 10], ['G-6', 4, 9]]) } },
    words_star: { priority: 3, data: { p2: sq([['B-6', 3, 10, 2]]) } },
    words_ring: { priority: 3, data: { p2: sq([['E-6', 3, 9, 1]]) } },
    words_none: { priority: 3, data: { p2: sq([['A-4', 3, 7, 0]]) } },
    words_found: { priority: 4, data: { p2: sq([['G-5', 2, 10, 2], ['C-6', 2, 10], ['E-6', 2, 10], ['G-6', 5, 9]]) } },
    words_menu: { priority: 1, data: { p2: sq([['B-5', 2, 8, 2]]) } },
    words_ok: { priority: 4, data: { p2: sq([['D-6', 2, 10, 2], ['A-6', 4, 10]]) } },
    words_hint: { priority: 3, data: { p2: sq([['E-6', 2, 9, 2], ['G#6', 2, 9], ['B-6', 4, 8]]) } }
  };
  var SONGS = { words_title: buildTitle(), words_think: buildThink(), words_clear: buildClear(), words_over: buildOver() };

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
  WD.Audio = Audio;
})();
