/*
 * games/cart2/slash/song.js — 《星塵忍者斬》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-1 cart2-blade（R6）｜ 依賴：engine/music.js（R6 起 driver.pause / resume）
 * 契約：CT.Slash.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | slash_title  | 月下待刃 | 8     | 4    | 標題；D 小調五聲，p1 長音旋律 / p2 分解和弦 / tri 低音 |
 * | slash_stage  | 疾風屋脊 | 6     | 8    | 第 1~5 關；D 小調五聲推進，p1 主旋律 / p2 回音 / tri 跳動低音 / noi 太鼓節奏 |
 * | slash_boss   | 鐵燈籠   | 5     | 4    | 第 6 關魔王；E 小調半音下行動機 |
 * | slash_clear  | 一閃     | 6     | 1    | 過關（不 loop） |
 * | slash_over   | 散華     | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：slash_swing / cut / clang / boom / miss / jump / heal / combo / hit
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var SL = CT.Slash = CT.Slash || {};
  var NES = window.NES = window.NES || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 13, inst: 'kick', vol: 13, duty: 0 }, s: { note: 7, inst: 'snare', vol: 12, duty: 0 },
             h: { note: 2, inst: 'hat', vol: 8, duty: 0 }, t: { note: 10, inst: 'taiko', vol: 14, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function broken(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [12, 13, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2, 2, 1] },
    shaku: { vol: [6, 9, 11, 12, 12, 11, 11, 10, 10, 9], volLoop: 9, duty: [1] },
    pluck: { vol: [10, 7, 5, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 1, 0] },
    taiko: { vol: [15, 13, 11, 8, 6, 4, 2, 0] },
    snare: { vol: [13, 11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [6, 3, 1, 0] }
  };
  var MIN = [0, 3, 7, 12], MAJ = [0, 4, 7, 12], SUS = [0, 5, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  var BASS = {
    D: 'D-2 -   D-3 -   D-2 -   A-2 -   D-2 -   D-3 -   C-3 -   A-2 -',
    F: 'F-2 -   F-3 -   F-2 -   C-3 -   F-2 -   F-3 -   C-3 -   A-2 -',
    C: 'C-2 -   C-3 -   C-2 -   G-2 -   C-2 -   C-3 -   G-2 -   E-2 -',
    G: 'G-2 -   G-3 -   G-2 -   D-3 -   G-2 -   G-3 -   F-3 -   D-3 -',
    A: 'A-1 -   A-2 -   A-1 -   E-2 -   A-1 -   A-2 -   G-2 -   E-2 -',
    E: 'E-2 -   E-3 -   E-2 -   B-2 -   E-2 -   E-3 -   D-3 -   B-2 -',
    Bb: 'A#1 -  A#2 -   A#1 -   F-2 -   A#1 -   A#2 -   F-2 -   D-2 -'
  };

  // ---- 月下待刃（標題）：慢速、尺八風長音 ----
  function buildTitle() {
    var M = [
      'A-4 -   -   -   C-5 -   D-5 -   -   -   -   -   F-5 -   D-5 -',
      'C-5 -   -   -   A-4 -   -   -   G-4 -   A-4 -   -   -   -   -',
      'D-5 -   -   -   F-5 -   G-5 -   -   -   A-5 -   G-5 -   F-5 -',
      'D-5 -   -   -   -   -   -   -   C-5 -   D-5 -   =   -   -   -'
    ];
    var C = [['D-4', MIN], ['F-4', MAJ], ['G-4', SUS], ['D-4', MIN]];
    return song('月下待刃（slash_title）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'shaku', 12, 1), p2: broken(C[i][0], C[i][1], 7),
               tri: mel('D-2 -   -   -   -   -   -   -   A-2 -   -   -   -   -   -   -'.replace(/D-2/, ['D-2', 'F-2', 'G-2', 'D-2'][i]), 'bass', 15, 0),
               noi: drm('t - - - - - - - h - - - - - - -') };
    }), true);
  }
  // ---- 疾風屋脊（關卡） ----
  function buildStage() {
    var M = [
      'D-5 -   F-5 G-5 A-5 -   -   C-6 A-5 -   G-5 -   F-5 G-5 A-5 -',
      'D-6 -   -   C-6 A-5 -   G-5 -   A-5 -   -   -   -   -   -   -',
      'F-5 -   G-5 A-5 C-6 -   -   D-6 C-6 -   A-5 -   G-5 A-5 G-5 F-5',
      'D-5 -   -   -   F-5 -   G-5 -   A-5 -   -   -   =   -   -   -',
      'A-5 -   C-6 -   D-6 -   F-6 -   D-6 -   C-6 -   A-5 -   C-6 -',
      'D-6 -   -   -   C-6 A-5 G-5 -   F-5 -   G-5 -   A-5 -   -   -',
      'G-5 -   A-5 -   C-6 -   A-5 -   G-5 F-5 -   D-5 F-5 -   G-5 -',
      'D-5 -   -   -   -   -   A-4 -   D-5 -   -   -   =   -   -   -'
    ];
    var C = ['D', 'D', 'F', 'D', 'A', 'Bb', 'C', 'D'];
    return song('疾風屋脊（slash_stage）', 6, M.map(function (m, i) {
      var p2 = [null, null, null].concat(mel(m, 'echo', 7, 1).slice(0, 13));
      return { p1: mel(m, 'lead', 12, 2), p2: p2, tri: mel(BASS[C[i]], 'bass', 15, 0),
               noi: drm(i % 4 === 3 ? 't - h t s - h - t t h - s s s s' : 't - h - s - h t t - h - s - h h') };
    }), true);
  }
  // ---- 鐵燈籠（魔王） ----
  function buildBoss() {
    var M = [
      'E-5 -   E-5 D#5 E-5 -   G-5 -   F#5 -   E-5 -   D-5 -   B-4 -',
      'C-5 -   C-5 B-4 C-5 -   E-5 -   D-5 -   C-5 -   B-4 -   -   -',
      'E-5 G-5 B-5 -   A-5 G-5 F#5 -   G-5 F#5 E-5 -   D#5 -   B-4 -',
      'E-5 -   -   -   B-4 -   -   -   E-5 -   F#5 -   G-5 -   A#5 -'
    ];
    var C = ['E', 'C', 'E', 'E'];
    return song('鐵燈籠（slash_boss）', 5, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 13, 1), p2: broken(['E-4', 'C-4', 'G-4', 'B-3'][i], i === 3 ? MAJ : MIN, 7),
               tri: mel(BASS[C[i]], 'bass', 15, 0), noi: drm('t h t h s h t h t t h h s h s s') };
    }), true);
  }
  function buildClear() {
    return song('一閃（slash_clear）', 6, [{
      p1: mel('D-5 F-5 A-5 D-6 -   -   C-6 D-6 -   -   -   -   =   -   -   -', 'lead', 13, 2),
      p2: mel('A-4 D-5 F-5 A-5 -   -   G-5 A-5 -   -   -   -   =   -   -   -', 'echo', 9, 1),
      tri: mel('D-2 -   -   -   -   -   A-2 D-3 -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('t - - - - - t t - - - - - - - -')
    }], false);
  }
  function buildOver() {
    return song('散華（slash_over）', 8, [{
      p1: mel('A-5 -   G-5 -   F-5 -   D-5 -   C-5 -   A-4 -   D-5 =   -   -', 'shaku', 12, 1),
      p2: mel('F-4 -   E-4 -   D-4 -   A-3 -   G-3 -   F-3 -   A-3 =   -   -', 'echo', 9, 1),
      tri: mel('D-2 -   -   -   A#1 -  -   -   C-2 -   -   -   D-2 =   -   -', 'bass', 15, 0),
      noi: drm('t - - - - - - - t - - - - - - -')
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
    slash_swing: { priority: 1, data: { noi: nz([[3, 2, 9], [2, 2, 7], [1, 2, 4]]) } },
    slash_jump: { priority: 1, data: { p2: sq([['A-4', 2, 8, 2], ['D-5', 2, 8], ['A-5', 2, 6]]) } },
    slash_cut: { priority: 3, data: { p2: sq([['A-6', 2, 12, 0], ['D-7', 4, 10]]), noi: nz([[1, 2, 10], [2, 3, 6]]) } },
    slash_combo: { priority: 4, data: { p2: sq([['D-6', 2, 11, 2], ['F-6', 2, 11], ['A-6', 2, 11], ['D-7', 5, 10]]) } },
    slash_clang: { priority: 4, data: { p2: sq([['E-6', 2, 12, 3], ['A#5', 3, 10], ['E-6', 4, 7]]) } },
    slash_boom: { priority: 7, data: { noi: nz([[12, 4, 15], [13, 6, 12], [14, 8, 9], [15, 10, 5]]), p2: sq([['C-3', 4, 12, 0], ['G-2', 8, 9]]) } },
    slash_miss: { priority: 5, data: { p2: sq([['F-4', 4, 11, 1], ['C#4', 4, 10], ['A-3', 8, 8]]) } },
    slash_hit: { priority: 6, data: { p2: sq([['C-5', 3, 13, 0], ['F#4', 3, 12], ['C-4', 6, 10]]), noi: nz([[4, 4, 12], [7, 4, 8]]) } },
    slash_heal: { priority: 5, data: { p2: sq([['D-5', 3, 11, 2], ['A-5', 3, 11], ['D-6', 3, 11], ['F#6', 8, 10]]) } }
  };
  var SONGS = { slash_title: buildTitle(), slash_stage: buildStage(), slash_boss: buildBoss(), slash_clear: buildClear(), slash_over: buildOver() };

  SL.Audio = makeAudio(SONGS, SFX);
  // 共用小型播放器（每款各自一份，命名空間在 CT.<Id>.Audio）
  function makeAudio(SONGS0, SFX0) {
    function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
    var A = {
      SONGS: SONGS0, SFX: SFX0, current: null, _nes: null, paused: false,
      init: function (nes) {
        A._nes = nes; A.paused = false;
        var d = drv(nes);
        if (!d) return false;
        for (var k in SFX0) if (Object.prototype.hasOwnProperty.call(SFX0, k)) { try { d.define(k, SFX0[k]); } catch (e) { } }
        return true;
      },
      play: function (key) {
        var d = drv(A._nes), s = SONGS0[key];
        if (!d || !s) return false;
        A.paused = false;
        try { d.play(s, { loop: s.playLoop }); A.current = key; return true; } catch (e) { return false; }
      },
      stop: function () { var d = drv(A._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } A.current = null; A.paused = false; },
      // 暫停（§6-2）：driver.pause() 記住 row 後靜音；resume() 從同一 row 接續
      pause: function () {
        var d = drv(A._nes);
        if (!d || A.paused) return false;
        A.paused = true;
        try { if (d.pause) d.pause(); else d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
        return true;
      },
      resume: function () {
        var d = drv(A._nes);
        if (!d || !A.paused) return false;
        A.paused = false;
        try {
          if (d.resume && d.resume()) return true;
          if (A.current && SONGS0[A.current]) d.play(SONGS0[A.current], { loop: SONGS0[A.current].playLoop });
        } catch (e) { }
        return true;
      },
      sfx: function (name) {
        var d = drv(A._nes);
        if (!d || !SFX0[name] || A.paused) return false;
        try { d.sfx(name); return true; } catch (e) { try { d.define(name, SFX0[name]); d.sfx(name); return true; } catch (e2) { return false; } }
      },
      tick: function () { var d = drv(A._nes); if (d) { try { d.tick(); } catch (e) { } } }
    };
    return A;
  }
  SL.makeAudio = makeAudio;
})();
