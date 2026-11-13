/*
 * games/cart2/laser/song.js — 《星塵雷射防衛》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-1 cart2-blade（R6）｜ 依賴：engine/music.js（R6 driver.pause / resume）
 * 契約：CT.Laser.Audio = { init, play, stop, pause, resume, sfx, tick, SONGS, SFX }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | laser_title  | 夜哨     | 7     | 4    | 標題；A 小調，p1 長音 / p2 琶音 / tri 持續低音 |
 * | laser_wave   | 稜鏡防線 | 6     | 8    | 第 1~8 波；A 小調 → F → G → E 的推進，p2 八分琶音、noi 進行鼓 |
 * | laser_boss   | 彗眼     | 5     | 4    | 第 9 波魔王；C# 小調，增四度不安動機 |
 * | laser_clear  | 守住了   | 6     | 1    | 過波（不 loop） |
 * | laser_over   | 熄燈     | 8     | 1    | GAME OVER（不 loop） |
 * 音效：laser_zap / charge / blast / pop / boom / hit / heat / repair / warn
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var LZ = CT.Laser = CT.Laser || {};
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
  var DR = { k: { note: 12, inst: 'kick', vol: 13, duty: 0 }, s: { note: 6, inst: 'snare', vol: 12, duty: 0 },
             h: { note: 1, inst: 'hat', vol: 7, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function arp8(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push({ note: root, inst: 'pluck', vol: vol, duty: 1, arp: [arp[i % arp.length]] });
    return out;
  }
  var INST = {
    lead: { vol: [13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2] },
    pad: { vol: [5, 7, 9, 10, 10, 10, 9, 9, 9, 8], volLoop: 9, duty: [1] },
    pluck: { vol: [8, 6, 4, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 1, 0] },
    snare: { vol: [13, 11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [6, 3, 1, 0] }
  };
  var MIN = [0, 3, 7, 12, 7, 3], MAJ = [0, 4, 7, 12, 7, 4];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function pedal(n) { return n + ' -   -   -   ' + n + ' -   -   -   ' + n + ' -   -   -   ' + n + ' -   -   -'; }
  function walk(a, b) { return a + ' -   ' + a + ' -   ' + b + ' -   ' + a + ' -   ' + a + ' -   ' + b + ' -   ' + a + ' -   ' + b + ' -'; }

  function buildTitle() {
    var M = [
      'E-5 -   -   -   -   -   A-5 -   -   -   G-5 -   E-5 -   -   -',
      'F-5 -   -   -   -   -   E-5 -   D-5 -   -   -   -   -   -   -',
      'C-5 -   -   -   D-5 -   E-5 -   -   -   G-5 -   F-5 -   E-5 -',
      'E-5 -   -   -   -   -   -   -   B-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-3', MIN, 'A-1'], ['F-3', MAJ, 'F-1'], ['C-4', MAJ, 'C-2'], ['E-3', MAJ, 'E-1']];
    return song('夜哨（laser_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'pad', 12, 1), p2: arp8(C[i][0], C[i][1], 6), tri: mel(pedal(C[i][2]), 'bass', 15, 0), noi: drm('k - - - - - - - k - - - - - h -') };
    }), true);
  }
  function buildWave() {
    var M = [
      'A-4 -   C-5 E-5 -   A-5 -   G-5 E-5 -   D-5 -   E-5 -   -   -',
      'A-4 -   C-5 E-5 -   B-5 -   A-5 G-5 -   E-5 -   G-5 -   -   -',
      'F-5 -   -   E-5 F-5 -   A-5 -   C-6 -   A-5 -   F-5 -   E-5 -',
      'G-5 -   -   F-5 G-5 -   B-5 -   D-6 -   B-5 -   G-5 -   -   -',
      'E-5 -   A-5 -   C-6 -   B-5 A-5 -   G-5 -   A-5 -   E-5 -   -',
      'F-5 -   A-5 -   D-6 -   C-6 A-5 -   G-5 -   F-5 -   D-5 -   -',
      'E-5 -   G#5 -  B-5 -   D-6 -   C-6 -   B-5 -   G#5 -  E-5 -',
      'A-5 -   -   -   E-5 -   -   -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-3', MIN, 'A-1', 'E-2'], ['A-3', MIN, 'A-1', 'E-2'], ['F-3', MAJ, 'F-1', 'C-2'], ['G-3', MAJ, 'G-1', 'D-2'],
             ['A-3', MIN, 'A-1', 'E-2'], ['D-3', MIN, 'D-2', 'A-1'], ['E-3', MAJ, 'E-1', 'B-1'], ['A-3', MIN, 'A-1', 'E-2']];
    return song('稜鏡防線（laser_wave）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 12, 2), p2: arp8(C[i][0], C[i][1], 6), tri: mel(walk(C[i][2], C[i][3]), 'bass', 15, 0),
               noi: drm(i % 4 === 3 ? 'k h s h k h s h k k s h s s s s' : 'k h s h k h s h k h s h k h s h') };
    }), true);
  }
  function buildBoss() {
    var M = [
      'C#5 -   G-5 -   C#5 -   G-5 -   F#5 -   E-5 -   D#5 -   C#5 -',
      'B-4 -   F-5 -   B-4 -   F-5 -   E-5 -   D#5 -   C#5 -   B-4 -',
      'C#5 E-5 G#5 -   C#6 -   B-5 -   A-5 -   G#5 -   F#5 -   G-5 -',
      'G#5 -   -   -   D-5 -   -   -   G#5 -   A-5 -   B-5 -   D-6 -'
    ];
    var C = [['C#3', MIN, 'C#2', 'G-1'], ['B-2', MIN, 'B-1', 'F-1'], ['A-2', MAJ, 'A-1', 'E-2'], ['G#2', MAJ, 'G#1', 'D-2']];
    return song('彗眼（laser_boss）', 5, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 13, 1), p2: arp8(C[i][0], C[i][1], 6), tri: mel(walk(C[i][2], C[i][3]), 'bass', 15, 0),
               noi: drm('k h k h s h k h k k s h s h s s') };
    }), true);
  }
  function buildClear() {
    return song('守住了（laser_clear）', 6, [{
      p1: mel('E-5 A-5 C-6 E-6 -   -   D-6 E-6 -   -   -   -   =   -   -   -', 'lead', 13, 2),
      p2: mel('C-5 E-5 A-5 C-6 -   -   B-5 C-6 -   -   -   -   =   -   -   -', 'pad', 9, 1),
      tri: mel('A-2 -   -   -   -   -   E-2 A-2 -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - - - s s - - - - - - - -')
    }], false);
  }
  function buildOver() {
    return song('熄燈（laser_over）', 8, [{
      p1: mel('E-5 -   C-5 -   A-4 -   G#4 -   A-4 -   E-4 -   A-3 =   -   -', 'pad', 12, 1),
      p2: mel('C-4 -   A-3 -   F-3 -   E-3 -   E-3 -   C-3 -   E-3 =   -   -', 'pluck', 9, 1),
      tri: mel('A-1 -   -   -   F-1 -   -   -   E-1 -   -   -   A-1 =   -   -', 'bass', 15, 0),
      noi: drm('k - - - - - - - k - - - - - - -')
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
    laser_zap: { priority: 2, data: { p2: sq([['C-7', 1, 12, 2], ['G-6', 1, 11], ['C-6', 1, 9], ['G-5', 2, 6]]) } },
    laser_charge: { priority: 1, data: { p2: sq([['C-5', 2, 6, 2], ['E-5', 2, 7], ['G-5', 2, 8], ['C-6', 2, 8]]) } },
    laser_blast: { priority: 4, data: { p2: sq([['C-6', 2, 13, 0], ['C-5', 2, 12], ['G-4', 3, 10], ['C-4', 5, 7]]), noi: nz([[2, 3, 12], [4, 4, 8]]) } },
    laser_pop: { priority: 3, data: { noi: nz([[5, 2, 11], [8, 3, 7], [10, 3, 3]]) } },
    laser_boom: { priority: 5, data: { noi: nz([[11, 4, 15], [12, 6, 11], [13, 8, 7], [14, 8, 3]]) } },
    laser_hit: { priority: 7, data: { p2: sq([['F-4', 4, 13, 0], ['C-4', 4, 12], ['F#3', 10, 10]]), noi: nz([[12, 6, 14], [14, 10, 8]]) } },
    laser_heat: { priority: 6, data: { p2: sq([['A-5', 4, 11, 3], ['F-5', 4, 11], ['A-5', 4, 11], ['F-5', 6, 9]]) } },
    laser_repair: { priority: 5, data: { p2: sq([['E-5', 3, 11, 2], ['A-5', 3, 11], ['C#6', 3, 11], ['E-6', 8, 10]]) } },
    laser_warn: { priority: 4, data: { p2: sq([['A-5', 3, 10, 1], ['-', 3, 0], ['A-5', 3, 10]]) } }
  };
  SFX.laser_warn.data.p2 = sq([['A-5', 3, 10, 1], ['E-5', 3, 8], ['A-5', 4, 10]]);
  var SONGS = { laser_title: buildTitle(), laser_wave: buildWave(), laser_boss: buildBoss(), laser_clear: buildClear(), laser_over: buildOver() };
  LZ.Audio = makeAudio(SONGS, SFX);
  // 共用小型播放器（laser 自帶一份，不依賴 slash 檔：apu_render / 單獨載入也能用）
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
})();
