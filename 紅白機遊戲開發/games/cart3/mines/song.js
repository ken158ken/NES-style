/*
 * games/cart3/mines/song.js — 《星塵探雷》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/music.js
 * 契約：CT.Mines.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key         | 曲名     | speed | 小節 | 說明 |
 * |-------------|----------|-------|------|------|
 * | mines_title | 礦脈序曲 | 7     | 4    | 標題；D 多利安，p1 長音旋律 / p2 分解和弦 / tri 根音 / noi 輕刷 |
 * | mines_play  | 星圖漫步 | 8     | 8    | 遊玩；E 小調慢步，留白多、不搶注意力（益智曲） |
 * | mines_win   | 掃描完成 | 6     | 1    | 清盤（不 loop） |
 * | mines_lose  | 星塵爆散 | 7     | 1    | 踩雷（不 loop） |
 * 音效（只搶 p2 / noi）：mines_move / open / flood / flag / unflag / chord / boom / undo / hint / menu / ok / scan / star
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var MI = CT.Mines = CT.Mines || {};

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
      'A-4 -   -   D-5 -   -   E-5 -   F-5 -   E-5 -   C-5 -   -   -',
      'G-4 -   -   C-5 -   -   D-5 -   E-5 -   G-5 -   A-5 -   -   -',
      'A#4 -   -   F-5 -   -   E-5 -   D-5 -   C-5 -   A-4 -   -   -',
      'B-4 -   C-5 -   D-5 -   E-5 -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['D-3', MIN, 'D-2', 'A-2'], ['C-3', MAJ, 'C-2', 'G-2'], ['A#2', MAJ, 'A#1', 'F-2'], ['A-2', SUS, 'A-1', 'E-2']];
    return song('礦脈序曲（mines_title）', 7, M.map(function (m, i) {
      var c = C[i];
      return { p1: mel(m, 'lead', 10, 1), p2: arpeg(c[0].replace('-3', '-4').replace('#2', '#3').replace('-2', '-3'), c[1], 6),
               tri: mel(bassLine(c[2], c[3]), 'bass', 15, 0), noi: drm('k - h - - - h - s - h - - - h h') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'E-5 -   -   -   G-5 -   F#5 -   E-5 -   B-4 -   -   -   -   -',
      'C-5 -   -   -   D-5 -   E-5 -   G-5 -   F#5 -   -   -   -   -',
      'A-4 -   -   -   C-5 -   B-4 -   A-4 -   E-4 -   -   -   -   -',
      'F#4 -   G-4 -   A-4 -   B-4 -   D#5 -   -   -   =   -   -   -',
      'G-5 -   -   -   F#5 -   E-5 -   D-5 -   E-5 -   -   -   -   -',
      'C-5 -   -   -   E-5 -   G-5 -   B-5 -   A-5 -   -   -   -   -',
      'A-5 -   G-5 -   F#5 -   E-5 -   D-5 -   C-5 -   B-4 -   -   -',
      'C-5 -   B-4 -   A-4 -   F#4 -   E-4 -   -   -   =   -   -   -'
    ];
    var C = [['E-3', MIN, 'E-2', 'B-1'], ['C-3', MAJ, 'C-2', 'G-1'], ['A-2', MIN, 'A-1', 'E-2'], ['B-2', MAJ, 'B-1', 'F#2'],
             ['E-3', MIN, 'E-2', 'B-1'], ['C-3', MAJ, 'C-2', 'G-1'], ['D-3', MAJ, 'D-2', 'A-1'], ['B-2', SUS, 'B-1', 'F#2']];
    return song('星圖漫步（mines_play）', 8, M.map(function (m, i) {
      var c = C[i];
      return { p1: mel(m, 'soft', 9, 2), p2: arpeg(c[0].replace('-3', '-4').replace('-2', '-3'), c[1], 5),
               tri: mel(bassLine(c[2], c[3]), 'bass', 15, 0), noi: drm('h - - - h - - - h - - - h - h -') };
    }), true);
  }
  function buildWin() {
    return song('掃描完成（mines_win）', 6, [{
      p1: mel('D-5 F#5 A-5 D-6 -   A-5 D-6 E-6 F#6 -   -   -   =   -   -   -', 'lead', 11, 2),
      p2: mel('A-4 D-5 F#5 A-5 -   F#5 A-5 C#6 D-6 -   -   -   =   -   -   -', 'bell', 8, 1),
      tri: mel('D-3 -   -   -   A-2 -   -   -   D-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - - - - - - -')
    }], false);
  }
  function buildLose() {
    return song('星塵爆散（mines_lose）', 7, [{
      p1: mel('E-5 -   D#5 -   D-5 -   C#5 -   C-5 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('B-4 -   A#4 -   A-4 -   G#4 -   G-4 -   -   -   =   -   -   -', 'bell', 7, 1),
      tri: mel('E-2 -   -   -   D#2 -   -   -   C-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    mines_move: { priority: 1, data: { p2: sq([['A-6', 1, 5, 2]]) } },
    mines_open: { priority: 2, data: { p2: sq([['E-6', 1, 9, 2], ['B-6', 2, 7]]), noi: nz([[9, 2, 5]]) } },
    mines_flood: { priority: 2, data: { p2: sq([['C-6', 1, 8, 2], ['E-6', 1, 8], ['G-6', 1, 8], ['C-7', 3, 7]]) } },
    mines_flag: { priority: 2, data: { p2: sq([['G-5', 2, 10, 1], ['D-6', 3, 9]]) } },
    mines_unflag: { priority: 2, data: { p2: sq([['D-6', 2, 9, 1], ['G-5', 3, 7]]) } },
    mines_chord: { priority: 2, data: { p2: sq([['F-6', 1, 9, 2], ['A-6', 1, 9], ['F-6', 1, 8], ['C-7', 3, 7]]) } },
    mines_boom: { priority: 6, data: { noi: nz([[13, 4, 15], [14, 6, 12], [15, 10, 9], [15, 12, 5]]), p2: sq([['C-3', 6, 12, 0], ['A#2', 10, 9]]) } },
    mines_undo: { priority: 3, data: { p2: sq([['C-6', 2, 9, 2], ['G-5', 2, 9], ['E-5', 4, 8]]) } },
    mines_hint: { priority: 3, data: { p2: sq([['E-6', 2, 9, 2], ['G#6', 2, 9], ['B-6', 5, 8]]) } },
    mines_menu: { priority: 1, data: { p2: sq([['C-6', 2, 7, 2]]) } },
    mines_ok: { priority: 3, data: { p2: sq([['G-5', 2, 10, 2], ['D-6', 2, 10], ['G-6', 4, 9]]) } },
    mines_scan: { priority: 1, data: { p2: sq([['B-5', 1, 5, 0], ['E-6', 1, 5]]) } },
    mines_star: { priority: 4, data: { p2: sq([['A-6', 2, 10, 2], ['E-7', 4, 9]]) } }
  };
  var SONGS = { mines_title: buildTitle(), mines_play: buildPlay(), mines_win: buildWin(), mines_lose: buildLose() };

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
  MI.Audio = Audio;
})();
