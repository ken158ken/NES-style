/*
 * games/cart3/lines/song.js — 《星塵連線》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：engine/music.js
 * 契約：CT.Lines.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | lines_title  | 星圖     | 8     | 4    | 標題 / 選關；D 多利安，p1 長音旋律 + p2 分解和弦 + tri 根音 |
 * | lines_play   | 織星     | 7     | 8    | 遊玩；G 大調慢板，鼓很輕（益智不吵） |
 * | lines_clear  | 連成了   | 5     | 1    | 過關（不 loop） |
 * 音效（只搶 p2 / noi）：lines_move / pen / step / link / cut / err / undo / hint / ok
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var LN = CT.Lines = CT.Lines || {};

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
  function arp(notes, vol) { return fit(tok(notes).map(function (t) { return t === '-' ? null : { note: t, inst: 'pluck', vol: vol, duty: 2 }; })); }
  var INST = {
    lead: { vol: [10, 11, 11, 10, 10, 9, 9, 8, 8, 8, 7], volLoop: 10, duty: [2, 2, 1] },
    soft: { vol: [8, 9, 9, 8, 8, 7, 7, 6], volLoop: 7, duty: [1] },
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

  function buildTitle() {
    var M = [
      'D-5 -   -   E-5 F-5 -   A-5 -   G-5 -   -   -   E-5 -   -   -',
      'C-5 -   -   D-5 E-5 -   G-5 -   A-5 -   B-5 -   A-5 -   -   -',
      'D-6 -   -   C-6 A-5 -   G-5 -   F-5 -   G-5 -   A-5 -   -   -',
      'G-5 -   F-5 -   E-5 -   C-5 -   D-5 -   -   -   =   -   -   -'
    ];
    var A = ['D-4 F-4 A-4 F-4 D-4 F-4 A-4 F-4 D-4 F-4 A-4 F-4 D-4 F-4 A-4 F-4',
             'C-4 E-4 G-4 E-4 C-4 E-4 G-4 E-4 C-4 E-4 G-4 E-4 C-4 E-4 G-4 E-4',
             'A#3 D-4 F-4 D-4 A#3 D-4 F-4 D-4 G-3 B-3 D-4 B-3 G-3 B-3 D-4 B-3',
             'A-3 C#4 E-4 C#4 A-3 C#4 E-4 C#4 D-4 F-4 A-4 F-4 D-4 -   -   -'];
    var B = ['D-3 - - - - - - - A-2 - - - - - - -', 'C-3 - - - - - - - G-2 - - - - - - -',
             'A#2 - - - - - - - G-2 - - - - - - -', 'A-2 - - - - - - - D-3 - - - = - - -'];
    return song('星圖（lines_title）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 10, 2), p2: arp(A[i], 6), tri: mel(B[i], 'bass', 15, 0), noi: fit([]) };
    }), true);
  }
  function buildPlay() {
    var M = [
      'G-4 -   B-4 -   D-5 -   -   -   C-5 -   B-4 -   A-4 -   -   -',
      'B-4 -   D-5 -   G-5 -   -   -   F#5 -  E-5 -   D-5 -   -   -',
      'E-5 -   D-5 -   C-5 -   B-4 -   A-4 -   B-4 -   C-5 -   -   -',
      'D-5 -   -   -   A-4 -   B-4 -   C-5 -   -   -   -   -   -   -',
      'G-5 -   -   F#5 E-5 -   D-5 -   E-5 -   -   D-5 C-5 -   B-4 -',
      'C-5 -   -   B-4 A-4 -   G-4 -   A-4 -   B-4 -   C-5 -   D-5 -',
      'E-5 -   G-5 -   F#5 -  D-5 -   E-5 -   C-5 -   A-4 -   F#4 -',
      'G-4 -   -   -   D-4 -   -   -   G-4 -   -   -   -   -   -   -'
    ];
    var CH = [['G-3', 'B-3', 'D-4'], ['G-3', 'B-3', 'D-4'], ['C-4', 'E-4', 'G-4'], ['D-4', 'F#4', 'A-4'],
              ['E-3', 'G-3', 'B-3'], ['A-3', 'C-4', 'E-4'], ['C-4', 'E-4', 'G-4'], ['G-3', 'B-3', 'D-4']];
    var BS = ['G-2', 'G-2', 'C-3', 'D-3', 'E-2', 'A-2', 'C-3', 'G-2'];
    return song('織星（lines_play）', 7, M.map(function (m, i) {
      var c = CH[i], a = [c[0], '-', c[1], '-', c[2], '-', c[1], '-', c[0], '-', c[1], '-', c[2], '-', c[1], '-'].join(' ');
      var b = BS[i] + ' - - - ' + BS[i] + ' - - - ' + BS[i] + ' - - - ' + BS[i] + ' - - -';
      return { p1: mel(m, 'soft', 9, 1), p2: arp(a, 5), tri: mel(b, 'bass', 15, 0), noi: drm('k - - - h - - - s - - - h - - -') };
    }), true);
  }
  function buildClear() {
    return song('連成了（lines_clear）', 5, [{
      p1: mel('G-5 B-5 D-6 G-6 -   F#6 -   G-6 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('D-5 G-5 B-5 D-6 -   D-6 -   D-6 -   -   -   -   =   -   -   -', 'soft', 8, 1),
      tri: mel('G-3 -   -   -   D-3 -   -   -   G-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    lines_move: { priority: 1, data: { p2: sq([['A-6', 1, 5]]) } },
    lines_pen: { priority: 2, data: { p2: sq([['E-5', 2, 9], ['A-5', 2, 8]]) } },
    lines_step: { priority: 1, data: { p2: sq([['C-6', 1, 7, 1], ['G-6', 1, 5]]) } },
    lines_link: { priority: 4, data: { p2: sq([['C-6', 2, 11], ['E-6', 2, 11], ['G-6', 2, 10], ['C-7', 5, 9]]) } },
    lines_cut: { priority: 3, data: { noi: nz([[4, 2, 9], [9, 3, 5]]) } },
    lines_err: { priority: 3, data: { p2: sq([['D#4', 3, 10, 0], ['D-4', 5, 8, 0]]) } },
    lines_undo: { priority: 2, data: { p2: sq([['G-5', 2, 8], ['D-5', 3, 7]]) } },
    lines_hint: { priority: 4, data: { p2: sq([['E-6', 2, 9], ['B-5', 2, 9], ['E-6', 2, 9], ['B-6', 6, 8]]) } },
    lines_ok: { priority: 4, data: { p2: sq([['G-5', 2, 10], ['D-6', 4, 10]]) } }
  };
  var SONGS = { lines_title: buildTitle(), lines_play: buildPlay(), lines_clear: buildClear() };

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
      if (Audio.current === key && s.playLoop && d.isPaused && !d.isPaused()) return true;
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
  LN.Audio = Audio;
})();
