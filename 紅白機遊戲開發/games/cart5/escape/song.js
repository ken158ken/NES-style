/*
 * games/cart5/escape/song.js — 《星塵密室》音樂 / 音效（R9 C9-4 cart5-escape；全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 契約：CT.Escape.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key           | 曲名       | speed | 小節 | 說明 |
 * |---------------|------------|-------|------|------|
 * | escape_title  | 鎖孔裡的星 | 8     | 4    | 標題 / 故事；D 小調，p2 延遲回音、三角波半音下行 |
 * | escape_room   | 安靜的推理 | 10    | 8    | 第一、二室；G 多利安、撥弦分解和弦 + 稀疏鼓點 |
 * | escape_dome   | 穹頂之下   | 9     | 8    | 第三室；E♭ 利地安的漂浮感、高音鈴 |
 * | escape_clear  | 門開了     | 6     | 1    | 脫出（不 loop） |
 * | escape_over   | 沙漏見底   | 9     | 1    | 時間到（不 loop） |
 * 音效（只搶 p2 / noi）：escape_move / pick / use / bad / combo / turn / click / unlock / hint / open / tick / menu
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var E = CT.Escape = CT.Escape || {};

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
  function arpeg(root, arp, vol, every) {
    var out = [], e = every || 2;
    for (var i = 0; i < 16; i++) out.push(i % e === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i / e | 0) % arp.length]] } : null);
    return out;
  }
  function bass(str) { return mel(str, 'bass', 15, 0); }
  var INST = {
    lead: { vol: [10, 11, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [5, 7, 8, 8, 8, 7, 7, 6, 6], volLoop: 8, duty: [1] },
    bell: { vol: [11, 8, 6, 5, 4, 3, 2, 1, 0], duty: [3] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [4, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [11, 7, 4, 1, 0] },
    snare: { vol: [8, 6, 4, 2, 0] },
    hat: { vol: [4, 2, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12], SUS = [0, 5, 7, 12], M7 = [0, 4, 7, 11];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  // 標題「鎖孔裡的星」：D 小調，旋律在五度間打轉後往下找主音；三角波 D-C-B♭-A 半音下行
  function buildTitle() {
    var M = [
      'D-5 -   A-5 -   -   -   G-5 F-5 E-5 -   F-5 -   -   -   -   -',
      'D-5 -   A-5 -   -   -   C-6 A#5 A-5 -   -   -   G-5 -   -   -',
      'F-5 -   E-5 -   D-5 -   E-5 -   F-5 -   A-5 -   G-5 -   -   -',
      'E-5 -   C#5 -   -   -   D-5 -   -   -   -   -   =   -   -   -'
    ];
    var BS = ['D-2 - - - - - - - D-2 - - - - - - -', 'C-2 - - - - - - - C-2 - - - - - - -',
              'A#1 - - - - - - - A#1 - - - - - - -', 'A-1 - - - - - - - D-2 - - - = - - -'];
    return song('鎖孔裡的星（escape_title）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 10, 2), p2: [null, null, null].concat(mel(m, 'echo', 4, 1).slice(0, 13)), tri: bass(BS[i]), noi: drm('h - - - - - - - h - - - - - h -') };
    }), true);
  }
  // 遊玩「安靜的推理」：G 多利安（自然 E），p2 撥弦分解和弦、旋律留很多空拍讓人思考
  function buildRoom() {
    var M = [
      'G-4 -   -   -   A#4 -   C-5 -   D-5 -   -   -   -   -   -   -',
      'F-5 -   E-5 -   D-5 -   C-5 -   A#4 -   -   -   A-4 -   -   -',
      'G-4 -   -   -   A#4 -   D-5 -   G-5 -   -   -   F-5 -   -   -',
      'E-5 -   -   -   D-5 -   -   -   C-5 -   -   -   -   -   -   -',
      'A#4 -   -   -   C-5 -   D-5 -   F-5 -   -   -   E-5 -   D-5 -',
      'C-5 -   -   -   A#4 -   A-4 -   G-4 -   -   -   -   -   -   -',
      'D-5 -   E-5 -   F-5 -   -   -   E-5 -   C-5 -   -   -   A-4 -',
      'G-4 -   -   -   -   -   -   -   D-4 -   -   -   =   -   -   -'
    ];
    var C = [['G-3', MIN], ['F-3', MAJ], ['G-3', MIN], ['C-3', MAJ], ['A#2', MAJ], ['C-3', MAJ], ['D-3', SUS], ['G-3', MIN]];
    var R = ['G-2', 'F-2', 'G-2', 'C-3', 'A#1', 'C-2', 'D-2', 'G-2'];
    return song('安靜的推理（escape_room）', 10, M.map(function (m, i) {
      return { p1: mel(m, 'soft', 10, 1), p2: arpeg(C[i][0], C[i][1], 4, 2), tri: bass([R[i], '-', '-', '-', '-', '-', '-', '-', R[i], '-', '-', '-', '-', '-', '-', '-'].join(' ')), noi: drm('h - - - - - - - h - - - - - - -') };
    }), true);
  }
  // 第三室「穹頂之下」：E♭ 利地安（升四級 A），鈴聲音色、低音長音
  function buildDome() {
    var M = [
      'D#5 -   G-5 -   A#5 -   -   -   A-5 -   -   -   G-5 -   -   -',
      'F-5 -   -   -   D#5 -   -   -   A#4 -   -   -   -   -   -   -',
      'G-5 -   A#5 -   D-6 -   -   -   C-6 -   A-5 -   -   -   -   -',
      'A#5 -   -   -   G-5 -   -   -   F-5 -   -   -   -   -   -   -',
      'C-6 -   -   -   A#5 -   A-5 -   G-5 -   -   -   F-5 -   G-5 -',
      'A-5 -   -   -   -   -   -   -   F-5 -   -   -   D-5 -   -   -',
      'D#5 -   F-5 -   G-5 -   A-5 -   A#5 -   -   -   D-6 -   -   -',
      'D#6 -   -   -   -   -   -   -   A#5 -   -   -   =   -   -   -'
    ];
    var C = [['D#3', MAJ], ['F-3', MAJ], ['G-3', MIN], ['D#3', M7], ['A-2', MIN], ['F-3', MAJ], ['C-3', MIN], ['D#3', MAJ]];
    var R = ['D#2', 'F-2', 'G-2', 'D#2', 'A-1', 'F-2', 'C-2', 'D#2'];
    return song('穹頂之下（escape_dome）', 9, M.map(function (m, i) {
      return { p1: mel(m, 'bell', 9, 3), p2: arpeg(C[i][0], C[i][1], 3, 4), tri: bass([R[i], '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'].join(' ')), noi: drm('- - - - - - - - h - - - - - - -') };
    }), true);
  }
  function buildClear() {
    return song('門開了（escape_clear）', 6, [{
      p1: mel('G-5 -   B-5 D-6 -   G-6 -   F#6 -   G-6 A-6 -   B-6 -   =   -', 'lead', 12, 2),
      p2: mel('D-5 -   G-5 B-5 -   D-6 -   C-6 -   D-6 F#6 -  G-6 -   =   -', 'echo', 8, 1),
      tri: mel('G-2 -   -   -   D-3 -   -   -   C-3 -   D-3 -   G-2 -   =   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - h - s s s -')
    }], false);
  }
  function buildOver() {
    return song('沙漏見底（escape_over）', 9, [{
      p1: mel('A-4 -   G#4 -  G-4 -   F#4 -  F-4 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('E-4 -   D#4 -  D-4 -   C#4 -  C-4 -   -   -   =   -   -   -', 'echo', 7, 1),
      tri: mel('D-2 -   -   -   C#2 -   -   -   C-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    escape_move: { priority: 1, data: { p2: sq([['E-6', 1, 4, 2]]) } },
    escape_menu: { priority: 1, data: { p2: sq([['A-5', 2, 7, 2]]) } },
    escape_pick: { priority: 3, data: { p2: sq([['C-6', 2, 10, 2], ['G-6', 2, 10], ['C-7', 4, 8]]) } },
    escape_use: { priority: 3, data: { p2: sq([['G-5', 2, 9, 1], ['D-6', 3, 9]]) } },
    escape_bad: { priority: 3, data: { p2: sq([['C-3', 4, 10, 0], ['B-2', 6, 8]]) } },
    escape_combo: { priority: 4, data: { p2: sq([['E-5', 2, 10, 2], ['G#5', 2, 10], ['B-5', 2, 10], ['E-6', 5, 9]]) } },
    escape_turn: { priority: 2, data: { noi: nz([[9, 2, 6], [7, 3, 4]]) } },
    escape_click: { priority: 2, data: { p2: sq([['A-6', 1, 9, 1], ['E-6', 1, 6]]) } },
    escape_unlock: { priority: 4, data: { noi: nz([[4, 2, 10]]), p2: sq([['D-6', 3, 10, 2], ['A-6', 3, 10], ['D-7', 6, 9]]) } },
    escape_hint: { priority: 3, data: { p2: sq([['B-5', 2, 8, 2], ['E-6', 2, 8], ['B-6', 4, 7]]) } },
    escape_open: { priority: 3, data: { noi: nz([[11, 3, 8], [13, 4, 6]]) } },
    escape_tick: { priority: 1, data: { noi: nz([[2, 1, 5]]) } }
  };
  var SONGS = { escape_title: buildTitle(), escape_room: buildRoom(), escape_dome: buildDome(), escape_clear: buildClear(), escape_over: buildOver() };

  function drv() { return (Audio._nes && Audio._nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, lastSfx: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; Audio._paused = null;
      var d = drv();
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(), s = SONGS[key];
      if (!d || !s) return false;
      if (Audio.current === key && !(d.isPaused && d.isPaused())) return true;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; Audio._paused = null; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    // 暫停：記下曲名再 pause（ENGINE_API §10 標準寫法）
    pause: function () {
      var d = drv(); Audio._paused = Audio.current; Audio.current = null;
      if (d && d.pause) { try { d.pause(); } catch (e) { } } else if (d) { try { d.stop(); } catch (e) { } }
    },
    resume: function () {
      var d = drv(), k = Audio._paused; Audio._paused = null;
      if (d && d.isPaused && d.isPaused()) { try { d.resume(); Audio.current = k; return true; } catch (e) { } }
      if (k) return Audio.play(k);
      return false;
    },
    isPaused: function () { var d = drv(); return !!(d && d.isPaused && d.isPaused()); },
    sfx: function (name) {
      var d = drv();
      Audio.lastSfx = name;
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(); if (d) { try { d.tick(); } catch (e) { } } }
  };
  E.Audio = Audio;
})();
