/*
 * games/cart4/color/song.js — 《星塵色感》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-0 cart4-shell+color（R8）｜ 依賴：engine/music.js
 * 契約：CT.Color.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | color_title  | 虹彩序曲 | 6     | 4    | 標題 / 說明；F 大調、分解和弦上行 + 回音 |
 * | color_play   | 墨色快板 | 5     | 4    | 色字干擾 / 調色；D 多利安、四拍低音 |
 * | color_rush   | 色塊衝刺 | 4     | 4    | 色塊衝刺；E 小調、十六分音符 |
 * | color_win    | 完成     | 6     | 1    | 結算（不 loop） |
 * | color_over   | 褪色     | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：color_move / ok / ng / tick / go / level / peek
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CO = CT.Color = CT.Color || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 12 }, s: { note: 6, inst: 'snare', vol: 10 }, h: { note: 1, inst: 'hat', vol: 6 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  var INST = {
    lead: { vol: [12, 11, 10, 9, 8, 7, 7, 6, 6, 5], volLoop: 9, duty: [2, 1] },
    pluck: { vol: [10, 7, 5, 3, 2, 1, 0], duty: [2] },
    pad: { vol: [5, 7, 8, 8, 7, 7, 6, 6], volLoop: 7, duty: [2] },
    bass: {},
    kick: { vol: [14, 10, 6, 3, 0] },
    snare: { vol: [11, 9, 6, 4, 2, 0] },
    hat: { vol: [5, 2, 0] }
  };
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function bassLine(notes) { return notes.join(' '); }

  function buildTitle() {
    var M = [
      'F-5 -   A-5 -   C-6 -   A-5 C-6 F-6 -   -   -   E-6 -   C-6 -',
      'D-6 -   -   C-6 A#5 -   A-5 -   G-5 -   A-5 -   A#5 -   -   -',
      'A-5 -   C-6 -   E-6 -   C-6 E-6 G-6 -   -   -   F-6 -   E-6 -',
      'D-6 -   C-6 -   A#5 -   G-5 -   A-5 -   -   -   =   -   -   -'
    ];
    var E = M.map(function (m) { return m.replace(/([A-G][-#])(\d)/g, function (x, a, o) { return a + (o - 1); }); });
    var R = [['F-2', 'C-3'], ['A#2', 'F-2'], ['A-2', 'E-3'], ['C-3', 'F-2']];
    return song('虹彩序曲（color_title）', 6, M.map(function (m, i) {
      var r = R[i];
      return { p1: mel(m, 'lead', 11, 2), p2: [null, null, null].concat(mel(E[i], 'pluck', 6, 1).slice(0, 13)),
               tri: mel(bassLine([r[0], '-', '-', '-', r[1], '-', '-', '-', r[0], '-', '-', '-', r[1], '-', r[0], '-']), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h k s - h -') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'D-5 -   F-5 G-5 A-5 -   C-6 -   B-5 -   A-5 -   G-5 -   -   -',
      'A-5 -   G-5 F-5 E-5 -   G-5 -   F-5 -   E-5 -   D-5 -   -   -',
      'F-5 -   G-5 A-5 B-5 -   D-6 -   C-6 -   B-5 -   A-5 -   G-5 -',
      'A-5 -   -   G-5 F-5 -   E-5 -   D-5 -   -   -   -   -   -   -'
    ];
    var P = [
      'F-4 -   -   -   A-4 -   -   -   G-4 -   -   -   B-4 -   -   -',
      'C-5 -   -   -   A-4 -   -   -   A-4 -   -   -   F-4 -   -   -',
      'A-4 -   -   -   B-4 -   -   -   E-5 -   -   -   D-5 -   -   -',
      'C#5 -   -   -   A-4 -   -   -   F-4 -   -   -   A-4 -   -   -'
    ];
    var B = [['D-2', 'D-3', 'G-2', 'G-3'], ['A-2', 'A-3', 'D-2', 'D-3'], ['F-2', 'F-3', 'G-2', 'G-3'], ['A-2', 'A-3', 'D-2', 'A-2']];
    return song('墨色快板（color_play）', 5, M.map(function (m, i) {
      var b = B[i];
      return { p1: mel(m, 'lead', 10, 1), p2: mel(P[i], 'pad', 6, 2),
               tri: mel(bassLine([b[0], '-', b[1], '-', b[0], '-', b[1], '-', b[2], '-', b[3], '-', b[2], '-', b[3], '-']), 'bass', 15, 0),
               noi: drm('k - h h s - h - k k h - s - h h') };
    }), true);
  }
  function buildRush() {
    var M = [
      'E-5 G-5 B-5 E-6 D-6 B-5 G-5 B-5 C-6 A-5 E-5 A-5 B-5 G-5 E-5 G-5',
      'F#5 A-5 C-6 F#6 E-6 C-6 A-5 C-6 B-5 G-5 E-5 G-5 F#5 D#5 B-4 D#5',
      'E-5 G-5 B-5 E-6 F#6 E-6 D-6 B-5 C-6 E-6 G-6 E-6 D-6 B-5 G-5 B-5',
      'A-5 C-6 E-6 C-6 B-5 D#6 F#6 D#6 E-6 -   B-5 -   E-5 -   -   -'
    ];
    var R = ['E-2', 'D-2', 'C-2', 'B-1'];
    return song('色塊衝刺（color_rush）', 4, M.map(function (m, i) {
      var r = R[i], hi = r.replace(/(\d)$/, function (d) { return +d + 1; });
      return { p1: mel(m, 'pluck', 10, 1), p2: [null, null].concat(mel(m, 'pluck', 4, 2).slice(0, 14)),
               tri: mel(bassLine([r, '-', hi, '-', r, '-', hi, '-', r, '-', hi, '-', r, hi, r, hi]), 'bass', 15, 0),
               noi: drm('k h s h k h s h k h s h k s s s') };
    }), true);
  }
  function buildWin() {
    return song('完成（color_win）', 6, [{
      p1: mel('C-6 E-6 G-6 -   E-6 G-6 C-7 -   -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('E-5 G-5 C-6 -   G-5 C-6 E-6 -   -   -   -   -   =   -   -   -', 'pluck', 8, 1),
      tri: mel('C-3 -   -   -   G-2 -   C-3 -   -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - s - k - s - k - - - - - - -')
    }], false);
  }
  function buildOver() {
    return song('褪色（color_over）', 8, [{
      p1: mel('A-5 -   F-5 -   D-5 -   C#5 -   D-5 -   -   -   =   -   -   -', 'lead', 10, 2),
      p2: mel('F-4 -   D-4 -   A#3 -   A-3 -   A-3 -   -   -   =   -   -   -', 'pad', 6, 1),
      tri: mel('D-2 -   -   -   A#1 -   -   -   A-1 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    color_move: { priority: 1, data: { p2: sq([['D-6', 2, 7, 2]]) } },
    color_ok: { priority: 3, data: { p2: sq([['E-6', 2, 10, 2], ['B-6', 4, 10]]) } },
    color_ng: { priority: 3, data: { p2: sq([['D#4', 4, 10, 0], ['D-4', 7, 8]]), noi: nz([[9, 3, 7]]) } },
    color_tick: { priority: 2, data: { p2: sq([['A-5', 4, 9, 2]]) } },
    color_go: { priority: 4, data: { p2: sq([['A-6', 10, 12, 2]]) } },
    color_level: { priority: 4, data: { p2: sq([['C-6', 3, 11, 2], ['E-6', 3, 11], ['G-6', 3, 11], ['C-7', 6, 10]]) } },
    color_peek: { priority: 3, data: { p2: sq([['G-6', 2, 8, 1], ['D-6', 2, 8], ['G-6', 4, 7]]) } }
  };
  var SONGS = { color_title: buildTitle(), color_play: buildPlay(), color_rush: buildRush(), color_win: buildWin(), color_over: buildOver() };

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
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; },
    pause: function () { var d = drv(Audio._nes); if (d && d.pause) { try { d.pause(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } },
    resume: function () { var d = drv(Audio._nes); if (d && d.resume) { try { d.resume(); } catch (e) { } } },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  CO.Audio = Audio;
})();
