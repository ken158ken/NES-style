/*
 * games/cart5/paint/song.js — 《星塵畫室》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-1 cart5-paint（R9）｜ 依賴：engine/music.js
 * 契約：CT.Paint.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current }
 *
 * | key         | 曲名       | speed | 小節 | 說明 |
 * |-------------|------------|-------|------|------|
 * | paint_title | 畫架       | 8     | 4    | 標題；G 大調，三拍子搖擺，p2 分解和弦 |
 * | paint_draw  | 午後畫室   | 9     | 8    | 自由畫 / 著色本；D 大調慢板，鼓只有輕輕的 hat |
 * | paint_rush  | 速寫時間   | 6     | 4    | 臨摹 / 快畫；E 小調，八分音符推進 |
 * | paint_done  | 完成       | 5     | 1    | 完成 / 結算（不 loop） |
 * 音效（只搶 p2 / noi）：paint_ui / paint_pick / paint_dot / paint_fill / paint_stamp / paint_undo / paint_ok / paint_ng / paint_tick / paint_guess
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var P = CT.Paint = CT.Paint || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 10 }, s: { note: 6, inst: 'snare', vol: 7 }, h: { note: 1, inst: 'hat', vol: 4 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  var INST = {
    lead: { vol: [10, 11, 11, 10, 10, 9, 9, 8, 8, 8, 7], volLoop: 10, duty: [2, 2, 1] },
    soft: { vol: [7, 8, 8, 7, 7, 6, 6, 5], volLoop: 7, duty: [1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    bass: {},
    kick: { vol: [12, 8, 4, 2, 0] },
    snare: { vol: [9, 7, 5, 3, 1, 0] },
    hat: { vol: [4, 2, 0] }
  };
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function arpOf(ch, pat) { return fit(tok(pat).map(function (t) { return t === '-' ? null : { note: ch[+t], inst: 'pluck', vol: 5, duty: 2 }; })); }

  function buildTitle() {
    var M = [
      'G-4 -   B-4 D-5 -   G-5 -   F#5 E-5 -   D-5 -   B-4 -   -   -',
      'C-5 -   E-5 G-5 -   E-5 -   D-5 C-5 -   B-4 -   A-4 -   -   -',
      'A-4 -   C-5 E-5 -   A-5 -   G-5 F#5 -   E-5 -   D-5 -   E-5 -',
      'F#5 -   D-5 -   A-4 -   B-4 C-5 D-5 -   -   -   =   -   -   -'
    ];
    var CH = [['G-3', 'B-3', 'D-4'], ['C-4', 'E-4', 'G-4'], ['A-3', 'C-4', 'E-4'], ['D-4', 'F#4', 'A-4']];
    var BS = ['G-2', 'C-3', 'A-2', 'D-3'];
    return song('畫架（paint_title）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 10, 2), p2: arpOf(CH[i], '0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1'),
               tri: mel(BS[i] + ' - - - - - ' + BS[i] + ' - - - - - ' + BS[i] + ' - - -', 'bass', 15, 0), noi: fit([]) };
    }), true);
  }
  function buildDraw() {
    var M = [
      'D-5 -   -   -   F#5 -   A-5 -   G-5 -   F#5 -   E-5 -   -   -',
      'F#5 -   -   -   D-5 -   B-4 -   C#5 -   D-5 -   E-5 -   -   -',
      'G-5 -   -   -   B-5 -   A-5 -   G-5 -   F#5 -   G-5 -   A-5 -',
      'F#5 -   -   -   -   -   E-5 -   D-5 -   -   -   -   -   -   -',
      'B-4 -   -   -   D-5 -   F#5 -   E-5 -   D-5 -   C#5 -   -   -',
      'D-5 -   -   -   E-5 -   F#5 -   G-5 -   A-5 -   B-5 -   -   -',
      'A-5 -   -   -   F#5 -   D-5 -   E-5 -   G-5 -   F#5 -   E-5 -',
      'D-5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -'
    ];
    var CH = [['D-4', 'F#4', 'A-4'], ['B-3', 'D-4', 'F#4'], ['G-3', 'B-3', 'D-4'], ['A-3', 'C#4', 'E-4'],
              ['B-3', 'D-4', 'F#4'], ['G-3', 'B-3', 'D-4'], ['E-3', 'G-3', 'B-3'], ['A-3', 'C#4', 'E-4']];
    var BS = ['D-2', 'B-1', 'G-1', 'A-1', 'B-1', 'G-1', 'E-2', 'A-1'];
    return song('午後畫室（paint_draw）', 9, M.map(function (m, i) {
      return { p1: mel(m, 'soft', 8, 1), p2: arpOf(CH[i], '0 - 1 - 2 - 1 - 0 - 1 - 2 - 1 -'),
               tri: mel(BS[i] + ' - - - - - - - ' + BS[i] + ' - - - - - - -', 'bass', 15, 0), noi: drm('- - h - - - h - - - h - - - h -') };
    }), true);
  }
  function buildRush() {
    var M = [
      'E-5 -   G-5 E-5 B-5 -   A-5 G-5 F#5 -   G-5 -   E-5 -   D-5 -',
      'E-5 -   G-5 E-5 B-5 -   C-6 B-5 A-5 -   G-5 -   F#5 -   -   -',
      'C-5 -   E-5 C-5 G-5 -   F#5 E-5 D-5 -   F#5 -   A-5 -   G-5 -',
      'F#5 -   E-5 -   D#5 -   F#5 -   B-4 -   -   -   E-5 -   -   -'
    ];
    var BS = [['E-2', 'E-3'], ['E-2', 'E-3'], ['C-2', 'C-3'], ['B-1', 'B-2']];
    return song('速寫時間（paint_rush）', 6, M.map(function (m, i) {
      var b = BS[i], bl = [b[0], b[1], b[0], b[1], b[0], b[1], b[0], b[1], b[0], b[1], b[0], b[1], b[0], b[1], b[0], b[1]].join(' ');
      return { p1: mel(m, 'lead', 9, 2), p2: fit([]), tri: mel(bl, 'bass', 15, 0), noi: drm('k - h - s - h - k - h k s - h -') };
    }), true);
  }
  function buildDone() {
    return song('完成（paint_done）', 5, [{
      p1: mel('G-5 B-5 D-6 G-6 -   F#6 -   G-6 -   -   -   =   -   -   -   -', 'lead', 12, 2),
      p2: mel('B-4 D-5 G-5 B-5 -   A-5 -   B-5 -   -   -   =   -   -   -   -', 'soft', 8, 1),
      tri: mel('G-2 -   -   -   D-3 -   -   -   G-2 -   -   =   -   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - s - - - k - - - - - - -')
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
    paint_ui: { priority: 1, data: { p2: sq([['A-6', 1, 5]]) } },
    paint_pick: { priority: 2, data: { p2: sq([['E-6', 2, 8], ['B-6', 2, 7]]) } },
    paint_dot: { priority: 1, data: { noi: nz([[3, 1, 3]]) } },
    paint_fill: { priority: 3, data: { noi: nz([[9, 2, 6], [11, 3, 5], [13, 4, 3]]), p2: sq([['C-5', 2, 7], ['G-5', 2, 6], ['C-6', 3, 5]]) } },
    paint_stamp: { priority: 2, data: { p2: sq([['G-5', 2, 8, 1], ['D-6', 3, 7, 1]]) } },
    paint_undo: { priority: 2, data: { p2: sq([['D-6', 2, 8], ['A-5', 3, 7]]) } },
    paint_ok: { priority: 4, data: { p2: sq([['C-6', 3, 10], ['E-6', 3, 10], ['G-6', 6, 9]]) } },
    paint_ng: { priority: 3, data: { p2: sq([['D#4', 4, 9, 0], ['C-4', 6, 7, 0]]) } },
    paint_tick: { priority: 2, data: { p2: sq([['A-5', 2, 7, 0]]) } },
    paint_guess: { priority: 3, data: { p2: sq([['F-5', 2, 8], ['A-5', 2, 8], ['C-6', 2, 8]]) } }
  };
  var SONGS = { paint_title: buildTitle(), paint_draw: buildDraw(), paint_rush: buildRush(), paint_done: buildDone() };

  function drv(nes) { return (nes && nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null,
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
      if (Audio.current === key && s.playLoop) return true;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; },
    pause: function () { var d = drv(Audio._nes); if (d && d.pause) { try { d.pause(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } },
    resume: function () { var d = drv(Audio._nes); if (d && d.resume) { try { d.resume(); } catch (e) { } } },
    paused: function () { var d = drv(Audio._nes); return !!(d && d.isPaused && d.isPaused()); },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  P.Audio = Audio;
})();
