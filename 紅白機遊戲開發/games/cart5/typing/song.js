/*
 * games/cart5/typing/song.js — 《星塵打字》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/music.js（寫法同 cart3 sudoku/song.js）
 * 契約：CT.Typing.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tick(), SONGS, SFX, current, lastSfx }
 *
 * | key            | 曲名     | speed | 小節 | 說明 |
 * |----------------|----------|-------|------|------|
 * | typing_title   | 流星鍵盤 | 6     | 4    | 標題；G 大調、p2 分解和弦像打字聲 |
 * | typing_meteor  | 隕石雨   | 5     | 8    | 單字落下；D 小調、三角波八度跳低音 |
 * | typing_calm    | 夜讀書房 | 8     | 4    | 句子計時 / 限時挑戰；F 大調慢板 |
 * | typing_clear   | 全數擊落 | 6     | 1    | 結算（不 loop） |
 * | typing_over    | 基地失守 | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：typing_move / key / miss / zap / boom / hit / lv / ok / menu / case / del
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var TY = CT.Typing = CT.Typing || {};

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
      'G-5 -   B-5 D-6 -   B-5 C-6 -   A-5 -   F#5 -   D-5 -   -   -',
      'E-5 -   G-5 B-5 -   G-5 A-5 -   B-5 -   -   -   A-5 -   G-5 -',
      'C-6 -   B-5 A-5 -   G-5 A-5 -   E-5 -   F#5 G-5 A-5 -   -   -',
      'D-6 -   C-6 B-5 -   A-5 B-5 -   G-5 -   -   -   =   -   -   -'
    ];
    var C = [['G-3', MAJ], ['E-3', MIN], ['C-3', MAJ], ['D-3', SUS]];
    var BS = ['G-2 - - - G-2 - D-2 - G-2 - - - D-3 - - -', 'E-2 - - - E-2 - B-2 - E-2 - - - B-2 - - -',
              'C-3 - - - C-3 - G-2 - A-2 - - - A-2 - - -', 'D-2 - - - D-2 - A-2 - G-2 - - - = - - -'];
    return song('流星鍵盤（typing_title）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: arpeg(C[i][0], C[i][1], 6, 1), tri: bass(BS[i]), noi: drm('k - h h s - h - k - h h s - h h') };
    }), true);
  }
  function buildMeteor() {
    var M = [
      'D-5 -   -   F-5 -   A-5 -   -   G-5 -   F-5 -   E-5 -   D-5 -',
      'C-5 -   -   E-5 -   G-5 -   -   F-5 -   E-5 -   C-5 -   -   -',
      'A#4 -   -   D-5 -   F-5 -   -   E-5 -   D-5 -   A#4 -  C-5 -',
      'A-4 -   -   C#5 -   E-5 -   -   A-5 -   -   -   G-5 -   E-5 -',
      'D-6 -   -   C-6 -   A-5 -   -   F-5 -   G-5 -   A-5 -   -   -',
      'C-6 -   -   A#5 -   G-5 -   -   E-5 -   F-5 -   G-5 -   -   -',
      'A#5 -   A-5 -   G-5 -   F-5 -   E-5 -   F-5 -   G-5 -   A-5 -',
      'D-5 -   -   -   A-4 -   D-5 -   -   -   -   -   =   -   -   -'
    ];
    var R = ['D-2', 'C-2', 'A#1', 'A-1', 'D-2', 'C-2', 'A#1', 'D-2'];
    var CH = [['D-3', MIN], ['C-3', MAJ], ['A#2', MAJ], ['A-2', MAJ], ['D-3', MIN], ['C-3', MAJ], ['A#2', MAJ], ['D-3', MIN]];
    return song('隕石雨（typing_meteor）', 5, M.map(function (m, i) {
      var r = R[i], o = r.replace(/\d$/, function (d) { return String(+d + 1); });
      return { p1: mel(m, 'lead', 11, 2), p2: (i & 1) ? arpeg(CH[i][0], CH[i][1], 5, 2) : [null, null, null].concat(mel(m, 'echo', 5, 1).slice(0, 13)),
               tri: bass([r, '-', o, '-', r, '-', o, '-', r, '-', o, '-', r, '-', o, '-'].join(' ')), noi: drm('k - h - s - h k k - h - s - h h') };
    }), true);
  }
  function buildCalm() {
    var M = [
      'F-5 -   -   -   A-5 -   C-6 -   -   -   A-5 -   G-5 -   -   -',
      'E-5 -   -   -   G-5 -   C-6 -   -   -   A#5 -   A-5 -   -   -',
      'D-5 -   -   -   F-5 -   A-5 -   -   -   G-5 -   F-5 -   E-5 -',
      'F-5 -   -   -   -   -   C-5 -   F-5 -   -   -   =   -   -   -'
    ];
    var C = [['F-3', MAJ], ['C-3', MAJ], ['D-3', MIN], ['F-3', MAJ]];
    var BS = ['F-2 - - - - - - - C-3 - - - - - - -', 'C-2 - - - - - - - G-2 - - - - - - -',
              'D-2 - - - - - - - A-2 - - - - - - -', 'F-2 - - - C-2 - - - F-2 - - - = - - -'];
    return song('夜讀書房（typing_calm）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'soft', 10, 1), p2: arpeg(C[i][0], C[i][1], 4, 2), tri: bass(BS[i]), noi: drm('h - - - - - - - h - - - - - h -') };
    }), true);
  }
  function buildClear() {
    return song('全數擊落（typing_clear）', 6, [{
      p1: mel('G-5 B-5 D-6 G-6 -   D-6 G-6 B-6 -   A-6 B-6 D-7 -   -   =   -', 'lead', 12, 2),
      p2: mel('D-5 G-5 B-5 D-6 -   B-5 D-6 G-6 -   F#6 G-6 A-6 -   -   =   -', 'echo', 8, 1),
      tri: mel('G-2 -   -   -   D-3 -   -   -   D-3 -   -   -   G-2 -   =   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - h - s s s -')
    }], false);
  }
  function buildOver() {
    return song('基地失守（typing_over）', 8, [{
      p1: mel('A-5 -   G-5 -   F-5 -   E-5 -   D-5 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('F-5 -   E-5 -   D-5 -   C#5 -  A-4 -   -   -   =   -   -   -', 'echo', 7, 1),
      tri: mel('D-2 -   -   -   A-1 -   -   -   D-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    typing_move: { priority: 1, data: { p2: sq([['E-6', 1, 4, 2]]) } },
    typing_key: { priority: 2, data: { noi: nz([[3, 1, 8], [9, 2, 4]]) } },
    typing_miss: { priority: 3, data: { p2: sq([['D#3', 4, 10, 0], ['D-3', 5, 8]]) } },
    typing_zap: { priority: 3, data: { p2: sq([['C-7', 1, 10, 0], ['G-6', 1, 9], ['E-6', 1, 8], ['C-6', 1, 7], ['G-5', 2, 6]]) } },
    typing_boom: { priority: 4, data: { noi: nz([[12, 3, 12], [13, 4, 9], [14, 6, 6], [15, 6, 3]]) } },
    typing_hit: { priority: 5, data: { noi: nz([[14, 6, 13], [15, 10, 8]]), p2: sq([['A-2', 6, 10, 0], ['F-2', 8, 8]]) } },
    typing_lv: { priority: 4, data: { p2: sq([['G-5', 3, 10, 2], ['B-5', 3, 10], ['D-6', 3, 10], ['G-6', 6, 9]]) } },
    typing_ok: { priority: 4, data: { p2: sq([['D-6', 2, 10, 2], ['A-6', 4, 10]]) } },
    typing_menu: { priority: 1, data: { p2: sq([['B-5', 2, 8, 2]]) } },
    typing_case: { priority: 2, data: { p2: sq([['C-6', 1, 7, 1], ['F-6', 2, 7]]) } },
    typing_del: { priority: 2, data: { p2: sq([['G-5', 1, 7, 1], ['D-5', 2, 6]]) } }
  };
  var SONGS = { typing_title: buildTitle(), typing_meteor: buildMeteor(), typing_calm: buildCalm(), typing_clear: buildClear(), typing_over: buildOver() };

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
  TY.Audio = Audio;
})();
