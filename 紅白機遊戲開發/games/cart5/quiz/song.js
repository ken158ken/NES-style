/*
 * games/cart5/quiz/song.js — 《星塵問答》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-5 cart5-quiz（R9）｜ 依賴：engine/music.js（寫法同 typing/song.js）
 * 契約：CT.Quiz.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key        | 曲名     | speed | 小節 | 說明 |
 * |------------|----------|-------|------|------|
 * | quiz_title | 星塵學堂 | 7     | 4    | 標題 / 說明；C 大調，跳音主旋律 + 分解和弦 |
 * | quiz_play  | 搶答時刻 | 5     | 8    | 快問快答三模式；A 小調，八分音符低音推進 |
 * | quiz_math  | 星算盤   | 6     | 4    | 心算衝刺；D 大調，方波 2 打點像算盤珠 |
 * | quiz_end   | 計分板   | 7     | 1    | 結算（不 loop） |
 * | quiz_win   | 冠軍星   | 6     | 1    | 對戰獲勝 / 新紀錄（不 loop） |
 * 音效（只搶 p2 / noi）：quiz_move / ok / ng / tick / lock / key / menu / lv / go / del
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var QZ = CT.Quiz = CT.Quiz || {};

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
    lead: { vol: [12, 11, 10, 9, 9, 8, 8, 7], volLoop: 7, duty: [2, 2, 1] },
    stac: { vol: [11, 8, 5, 3, 1, 0], duty: [1] },
    soft: { vol: [6, 8, 9, 9, 8, 7, 7, 6], volLoop: 7, duty: [2] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
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
      'C-5 -   E-5 G-5 -   E-5 A-5 -   G-5 -   E-5 -   D-5 -   C-5 -',
      'D-5 -   F-5 A-5 -   F-5 B-5 -   A-5 -   -   -   G-5 -   -   -',
      'E-5 -   G-5 C-6 -   B-5 A-5 -   G-5 -   F-5 E-5 D-5 -   E-5 -',
      'F-5 -   D-5 B-4 -   D-5 G-5 -   C-5 -   -   -   =   -   -   -'
    ];
    var C = [['C-3', MAJ], ['D-3', MIN], ['A-2', MIN], ['G-2', SUS]];
    var BS = ['C-2 - - - G-2 - - - C-2 - - - G-2 - E-2 -', 'D-2 - - - A-2 - - - D-2 - - - A-2 - F-2 -',
              'A-1 - - - E-2 - - - A-1 - - - E-2 - C-2 -', 'G-1 - - - D-2 - - - G-1 - - - = - - -'];
    return song('星塵學堂（quiz_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'stac', 11, 1), p2: arpeg(C[i][0], C[i][1], 5, 2), tri: bass(BS[i]), noi: drm('k - h - s - h - k - h k s - h -') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'A-5 -   -   C-6 -   B-5 A-5 -   E-5 -   -   -   G-5 -   A-5 -',
      'F-5 -   -   A-5 -   G-5 F-5 -   E-5 -   -   -   D-5 -   E-5 -',
      'C-6 -   -   B-5 -   A-5 G-5 -   A-5 -   B-5 -   C-6 -   D-6 -',
      'E-6 -   -   -   D-6 -   B-5 -   G#5 -  -   -   B-5 -   -   -',
      'A-5 -   C-6 -   E-6 -   C-6 -   D-6 -   B-5 -   G-5 -   B-5 -',
      'C-6 -   A-5 -   F-5 -   A-5 -   G-5 -   E-5 -   C-5 -   E-5 -',
      'F-5 -   G-5 -   A-5 -   B-5 -   C-6 -   B-5 -   A-5 -   G#5 -',
      'A-5 -   -   -   E-5 -   A-4 -   -   -   -   -   =   -   -   -'
    ];
    var R = ['A-1', 'F-1', 'C-2', 'E-1', 'A-1', 'F-1', 'D-2', 'A-1'];
    var CH = [['A-2', MIN], ['F-2', MAJ], ['C-3', MAJ], ['E-2', MAJ], ['A-2', MIN], ['F-2', MAJ], ['D-3', MIN], ['A-2', MIN]];
    return song('搶答時刻（quiz_play）', 5, M.map(function (m, i) {
      var r = R[i], o = r.replace(/\d$/, function (d) { return String(+d + 1); });
      return { p1: mel(m, 'lead', 10, 2), p2: (i & 1) ? arpeg(CH[i][0], CH[i][1], 4, 2) : [null, null].concat(mel(m, 'echo', 4, 1).slice(0, 14)),
               tri: bass([r, '-', r, o, r, '-', r, o, r, '-', r, o, r, '-', o, '-'].join(' ')), noi: drm('k - h - s - h h k - h - s - h s') };
    }), true);
  }
  function buildMath() {
    var M = [
      'D-5 -   F#5 -   A-5 -   F#5 -   D-6 -   A-5 -   F#5 -   A-5 -',
      'B-4 -   D-5 -   G-5 -   D-5 -   B-5 -   A-5 -   G-5 -   F#5 -',
      'E-5 -   G-5 -   C#6 -   B-5 -   A-5 -   G-5 -   F#5 -   E-5 -',
      'D-5 -   E-5 -   F#5 -   A-5 -   D-6 -   -   -   =   -   -   -'
    ];
    var C = [['D-3', MAJ], ['G-2', MAJ], ['A-2', MAJ], ['D-3', MAJ]];
    var BS = ['D-2 - A-2 - D-2 - A-2 - D-2 - A-2 - D-2 - A-2 -', 'G-1 - D-2 - G-1 - D-2 - G-1 - D-2 - G-1 - D-2 -',
              'A-1 - E-2 - A-1 - E-2 - A-1 - E-2 - A-1 - C#2 -', 'D-2 - A-2 - D-2 - A-2 - D-2 - - - = - - -'];
    return song('星算盤（quiz_math）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'soft', 10, 2), p2: arpeg(C[i][0], C[i][1], 5, 1), tri: bass(BS[i]), noi: drm('h - h - s - h - h - h - s - h h') };
    }), true);
  }
  function buildEnd() {
    return song('計分板（quiz_end）', 7, [{
      p1: mel('C-6 -   G-5 -   E-5 -   G-5 -   C-6 -   D-6 -   C-6 -   =   -', 'lead', 11, 2),
      p2: mel('E-5 -   C-5 -   G-4 -   C-5 -   E-5 -   F-5 -   E-5 -   =   -', 'echo', 7, 1),
      tri: mel('C-2 -   -   -   G-1 -   -   -   C-2 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - s - - - k - - - s - - -')
    }], false);
  }
  function buildWin() {
    return song('冠軍星（quiz_win）', 6, [{
      p1: mel('G-5 C-6 E-6 G-6 -   E-6 G-6 C-7 -   -   B-6 C-7 -   -   =   -', 'lead', 12, 2),
      p2: mel('E-5 G-5 C-6 E-6 -   C-6 E-6 G-6 -   -   G-6 G-6 -   -   =   -', 'echo', 8, 1),
      tri: mel('C-2 -   -   -   G-2 -   -   -   C-3 -   -   -   C-2 -   =   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - h - s s s -')
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
    quiz_move: { priority: 1, data: { p2: sq([['A-5', 1, 6, 2]]) } },
    quiz_menu: { priority: 1, data: { p2: sq([['E-6', 2, 8, 2]]) } },
    quiz_ok: { priority: 4, data: { p2: sq([['C-6', 3, 10, 2], ['E-6', 3, 10], ['G-6', 3, 10], ['C-7', 8, 9]]) } },
    quiz_ng: { priority: 4, data: { p2: sq([['D#4', 6, 10, 0], ['C-4', 6, 9], ['G#3', 10, 8]]) } },
    quiz_tick: { priority: 2, data: { noi: nz([[2, 1, 7], [6, 1, 3]]) } },
    quiz_lock: { priority: 3, data: { p2: sq([['B-5', 2, 10, 1], ['B-6', 4, 9]]), noi: nz([[4, 2, 6]]) } },
    quiz_key: { priority: 2, data: { p2: sq([['G-6', 1, 7, 1], ['D-7', 1, 5]]) } },
    quiz_del: { priority: 2, data: { p2: sq([['D-5', 1, 7, 1], ['A-4', 2, 6]]) } },
    quiz_lv: { priority: 4, data: { p2: sq([['G-5', 3, 10, 2], ['B-5', 3, 10], ['D-6', 3, 10], ['G-6', 6, 9]]) } },
    quiz_go: { priority: 4, data: { p2: sq([['C-6', 4, 10, 2], ['C-7', 8, 10]]), noi: nz([[3, 3, 8]]) } }
  };
  var SONGS = { quiz_title: buildTitle(), quiz_play: buildPlay(), quiz_math: buildMath(), quiz_end: buildEnd(), quiz_win: buildWin() };

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
  QZ.Audio = Audio;
})();
