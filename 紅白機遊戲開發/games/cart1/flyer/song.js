/*
 * games/cart1/flyer/song.js — 《星塵飛燕》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：engine/music.js
 * 契約：CT.Flyer.Audio = { init(nes), play(key), stop(), sfx(name), tick(), SONGS, SFX }
 *
 * | key         | 曲名       | speed | 小節 | 說明 |
 * |-------------|------------|-------|------|------|
 * | flyer_sky   | 晨風       | 7     | 8    | 標題 + 場景 1~2；G 大調，p1 跳進旋律 / p2 分解和弦 / tri 低音 / noi 輕鼓 |
 * | flyer_star  | 星之航道   | 5     | 8    | 場景 3~5；E 小調推進，p1 切分旋律 / p2 回音 / tri 八度低音 / noi 疾走鼓 |
 * | flyer_over  | 羽落       | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：flyer_flap / pass / star / hit / shield / scene / wind
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var FY = CT.Flyer = CT.Flyer || {};
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
             h: { note: 1, inst: 'hat', vol: 8, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function broken(root, arp, vol) {        // 分解和弦：每 2 row 一音
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 10, duty: [2, 1] },
    flute: { vol: [9, 11, 12, 12, 11, 11, 10, 10, 9, 9], volLoop: 9, duty: [2] },
    pluck: { vol: [9, 7, 5, 4, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 1, 0] },
    snare: { vol: [13, 11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [6, 3, 1, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  // ---- 晨風（G 大調；旋律原創）----
  function buildSky() {
    var M = [
      'G-5 -   -   F#5 E-5 -   D-5 -   B-4 -   D-5 -   G-5 -   -   -',   // fix-r5：開頭改成由上往下的滑翔動機（原本與 snake 標題雷同）
      'E-5 -   -   D-5 C-5 -   E-5 -   G-5 -   E-5 -   D-5 -   -   -',
      'B-4 -   D-5 -   G-5 -   A-5 B-5 -   D-6 -   B-5 -   A-5 -',
      'A-5 -   -   -   F#5 -   D-5 -   E-5 -   F#5 -   A-5 -   -   -',
      'G-5 -   B-5 -   D-6 -   -   C-6 B-5 -   G-5 -   A-5 -   -   -',
      'E-5 -   G-5 -   C-6 -   -   B-5 A-5 -   E-5 -   G-5 -   -   -',
      'F#5 -   A-5 -   D-6 -   C-6 -   B-5 -   A-5 -   F#5 -   E-5 -',
      'G-5 -   -   -   D-5 -   B-4 -   G-4 -   -   -   =   -   -   -'
    ];
    var C = [['G-3', MAJ], ['C-3', MAJ], ['G-3', MAJ], ['D-3', MAJ], ['G-3', MAJ], ['C-3', MAJ], ['D-3', MAJ], ['G-3', MAJ]];
    var BL = { 'G-3': 'G-2 -   -   -   D-2 -   -   -   G-2 -   B-2 -   D-3 -   -   -',
               'C-3': 'C-2 -   -   -   G-2 -   -   -   C-2 -   E-2 -   G-2 -   -   -',
               'D-3': 'D-2 -   -   -   A-2 -   -   -   D-2 -   F#2 -   A-2 -   -   -' };
    return song('晨風（flyer_sky）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'flute', 12, 2), p2: broken(C[i][0].replace('-3', '-4'), C[i][1], 8),
               tri: mel(BL[C[i][0]], 'bass', 15, 0), noi: drm('k - h - h - h - s - h - h - h h') };
    }), true);
  }
  // ---- 星之航道（E 小調）----
  function buildStar() {
    var M = [
      'E-5 -   B-4 E-5 -   G-5 -   B-5 -   A-5 G-5 -   F#5 -   G-5 -',
      'E-5 -   -   -   B-4 -   D-5 -   E-5 -   -   -   -   -   -   -',
      'C-5 -   G-4 C-5 -   E-5 -   G-5 -   F#5 E-5 -   D-5 -   E-5 -',
      'D-5 -   -   -   A-4 -   B-4 -   D-5 -   -   -   F#5 -   -   -',
      'G-5 -   E-5 G-5 -   B-5 -   E-6 -   D-6 B-5 -   A-5 -   B-5 -',
      'G-5 -   -   -   E-5 -   G-5 -   A-5 -   -   -   B-5 -   -   -',
      'C-6 -   B-5 A-5 -   G-5 -   F#5 -   G-5 A-5 -   B-5 -   D#5 -',
      'E-5 -   -   -   B-4 -   -   -   E-5 -   -   -   =   -   -   -'
    ];
    var C = [['E-3', MIN], ['E-3', MIN], ['C-3', MAJ], ['D-3', MAJ], ['E-3', MIN], ['E-3', MIN], ['C-3', MAJ], ['B-2', MAJ]];
    var BL = { 'E-3': 'E-2 -   E-3 -   E-2 -   E-3 -   E-2 -   E-3 -   E-2 -   E-3 -',
               'C-3': 'C-2 -   C-3 -   C-2 -   C-3 -   C-2 -   C-3 -   C-2 -   C-3 -',
               'D-3': 'D-2 -   D-3 -   D-2 -   D-3 -   D-2 -   D-3 -   D-2 -   D-3 -',
               'B-2': 'B-1 -   B-2 -   B-1 -   B-2 -   B-1 -   B-2 -   D#2 -   F#2 -' };
    return song('星之航道（flyer_star）', 5, M.map(function (m, i) {
      var p1 = mel(m, 'lead', 12, 1);
      var p2 = [null, null, null].concat(mel(m, 'echo', 7, 1).slice(0, 13));
      return { p1: p1, p2: p2, tri: mel(BL[C[i][0]], 'bass', 15, 0), noi: drm('k h h h s h k h k h h h s h s s') };
    }), true);
  }
  function buildOver() {
    return song('羽落（flyer_over）', 8, [{
      p1: mel('B-5 -   G-5 -   E-5 -   D-5 -   C-5 -   B-4 -   G-4 -   =   -', 'flute', 12, 2),
      p2: mel('G-4 -   E-4 -   C-4 -   B-3 -   A-3 -   G-3 -   D-4 -   =   -', 'echo', 9, 1),
      tri: mel('G-2 -   -   -   C-2 -   -   -   D-2 -   -   -   G-1 -   =   -', 'bass', 15, 0),
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
    flyer_flap: { priority: 1, data: { noi: nz([[9, 2, 8], [7, 2, 5], [6, 1, 2]]) } },
    flyer_pass: { priority: 3, data: { p2: sq([['B-5', 3, 10, 2], ['E-6', 5, 11]]) } },
    flyer_star: { priority: 4, data: { p2: sq([['E-6', 2, 11, 1], ['G#6', 2, 11], ['B-6', 2, 11], ['E-7', 5, 10]]) } },
    flyer_hit: { priority: 7, data: { p2: sq([['C-5', 3, 13, 0], ['F#4', 3, 12], ['C-4', 4, 11], ['F#3', 8, 9]]), noi: nz([[3, 4, 13], [6, 4, 10], [9, 6, 6]]) } },
    flyer_shield: { priority: 6, data: { p2: sq([['G-5', 3, 12, 2], ['B-5', 3, 12], ['D-6', 3, 12], ['G-6', 6, 12]]) } },
    flyer_scene: { priority: 6, data: { p2: sq([['D-6', 4, 12, 2], ['G-6', 4, 12], ['B-6', 4, 12], ['D-7', 10, 11]]) } },
    flyer_wind: { priority: 2, data: { noi: nz([[2, 6, 6], [1, 6, 8], [2, 6, 6], [3, 6, 4], [4, 6, 2]]) } }
  };
  var SONGS = { flyer_sky: buildSky(), flyer_star: buildStar(), flyer_over: buildOver() };

  function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      if (Audio.current === key && !Audio._paused && (d.state ? d.state().playing : d.playing)) return true;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; } }
    },
    // 暫停（fix-r5 §6-2）：記下目前小節後停 driver；resume 從同一小節接續播放
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || !Audio.current || Audio._paused) return false;
      var st = null; try { st = d.state ? d.state() : d; } catch (e) { st = d; }   // nes.music 是包裝 API：位置要從 state() 讀
      Audio._paused = { key: Audio.current, from: st && st.playing ? (st.orderIndex || 0) : -1 };
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused, s = p && SONGS[p.key];
      Audio._paused = null;
      if (!d || !s || p.from < 0) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from % s.order.length }); Audio.current = p.key; return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  FY.Audio = Audio;
})();
