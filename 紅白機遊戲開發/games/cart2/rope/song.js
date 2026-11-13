/*
 * games/cart2/rope/song.js — 《星塵跳繩》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-2 cart2-dodge（R6）｜ 依賴：engine/music.js
 * 契約：CT.Rope.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key         | 曲名     | speed | 小節 | 說明 |
 * |-------------|----------|-------|------|------|
 * | rope_title  | 跳繩歌   | 7     | 4    | 標題；C 大調，六度跳進 |
 * | rope_plaza  | 晨光廣場 | 6     | 8    | 場地 PLAZA；G 大調，附點彈跳 |
 * | rope_moon   | 月面散步 | 7     | 8    | 場地 MOON；E 小調，長音 + 稀疏鼓 |
 * | rope_neon   | 霓虹屋頂 | 5     | 8    | 場地 NEON；A 小調，切分低音 |
 * | rope_over   | 繩子打結 | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：rope_jump / good / perfect / miss / level / swish / move / ok
 * 暫停：engine 的 `NES.Music.pause()/resume()`（R6）優先；沒有就記小節 + `play({from})`。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var RP = CT.Rope = CT.Rope || {};
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
             h: { note: 1, inst: 'hat', vol: 8, duty: 0 }, c: { note: 4, inst: 'clap', vol: 11, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function arp16(root, arp, vol, every) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % every === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i / every | 0) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [12, 13, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [8, 10, 11, 11, 10, 10, 9, 9, 8], volLoop: 8, duty: [1] },
    pluck: { vol: [10, 7, 5, 3, 2, 1, 0], duty: [2] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 1, 0] },
    snare: { vol: [13, 11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [6, 3, 1, 0] },
    clap: { vol: [12, 4, 10, 6, 3, 1, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12], SUS = [0, 5, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }


  // ---- 跳繩歌（標題；C 大調，跳躍感的六度上下）----
  function buildTitle() {
    var M = [
      'C-5 -   A-5 -   G-5 -   E-5 -   F-5 -   D-5 -   E-5 -   -   -',
      'C-5 -   A-5 -   G-5 -   E-5 -   D-5 -   B-4 -   C-5 -   -   -',
      'E-5 -   C-6 -   B-5 -   G-5 -   A-5 -   F-5 -   G-5 -   E-5 -',
      'F-5 -   D-5 -   B-4 -   D-5 -   C-5 -   -   -   =   -   -   -'
    ];
    var C = [['C-3', MAJ], ['G-2', MAJ], ['C-3', MAJ], ['G-2', MAJ]];
    var BL = ['C-2 -   G-2 -   C-3 -   G-2 -   F-2 -   C-3 -   G-2 -   B-1 -',
              'C-2 -   G-2 -   C-3 -   G-2 -   G-2 -   D-3 -   C-2 -   -   -',
              'C-2 -   E-2 -   G-2 -   C-3 -   F-2 -   A-2 -   G-2 -   E-2 -',
              'G-2 -   B-2 -   D-3 -   B-2 -   C-2 -   -   -   =   -   -   -'];
    return song('跳繩歌（rope_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 12, 2), p2: arp16(C[i][0].replace(/\d$/, '4'), C[i][1], 7, 2),
               tri: mel(BL[i], 'bass', 15, 0), noi: drm('k - h - s - h - k - h - s - h h') };
    }), true);
  }
  // ---- 晨光廣場（G 大調，彈跳的附點感）----
  function buildPlaza() {
    var M = [
      'G-5 -   -   D-5 G-5 -   B-5 -   A-5 -   G-5 -   E-5 -   -   -',
      'F#5 -   -   D-5 F#5 -   A-5 -   G-5 -   F#5 -   D-5 -   -   -',
      'E-5 -   -   C-5 E-5 -   G-5 -   C-6 -   B-5 -   A-5 -   G-5 -',
      'A-5 -   -   F#5 D-5 -   E-5 -   F#5 -   A-5 -   G-5 -   -   -',
      'B-5 -   -   G-5 D-5 -   G-5 -   B-5 -   D-6 -   C-6 -   -   -',
      'A-5 -   -   E-5 C-5 -   E-5 -   A-5 -   C-6 -   B-5 -   -   -',
      'C-6 -   B-5 -   A-5 -   G-5 -   F#5 -   E-5 -   D-5 -   F#5 -',
      'G-5 -   -   -   D-5 -   B-4 -   G-4 -   -   -   =   -   -   -'
    ];
    var C = [['G-3', MAJ], ['D-3', MAJ], ['C-3', MAJ], ['D-3', MAJ], ['G-3', MAJ], ['A-2', MIN], ['C-3', MAJ], ['G-3', MAJ]];
    return song('晨光廣場（rope_plaza）', 6, M.map(function (m, i) {
      var r = C[i][0], lo = r.replace(/\d$/, function (d) { return String(+d - 1); });
      return { p1: mel(m, 'lead', 12, 1), p2: arp16(r.replace(/\d$/, '4'), C[i][1], 6, 2),
               tri: mel((lo + ' -   -   -   ' + r + ' -   -   -   ').repeat(2), 'bass', 15, 0), noi: drm('k - h - s - h - k - k - s - h -') };
    }), true);
  }
  // ---- 月面散步（E 小調，慢、空間感）----
  function buildMoon() {
    var M = [
      'E-5 -   -   -   B-5 -   -   -   A-5 -   G-5 -   F#5 -   -   -',
      'G-5 -   -   -   E-5 -   -   -   B-4 -   -   -   -   -   -   -',
      'C-5 -   -   -   G-5 -   -   -   F#5 -   E-5 -   D-5 -   -   -',
      'E-5 -   -   -   F#5 -   G-5 -   A-5 -   -   -   B-5 -   -   -',
      'E-6 -   -   -   D-6 -   B-5 -   A-5 -   -   -   G-5 -   -   -',
      'F#5 -   -   -   A-5 -   -   -   D-5 -   -   -   -   -   -   -',
      'C-5 -   E-5 -   G-5 -   B-5 -   A-5 -   F#5 -   D#5 -   -   -',
      'E-5 -   -   -   B-4 -   -   -   E-5 -   -   -   =   -   -   -'
    ];
    var C = [['E-3', MIN], ['E-3', MIN], ['C-3', MAJ], ['D-3', MAJ], ['E-3', MIN], ['D-3', MAJ], ['C-3', MAJ], ['B-2', MAJ]];
    return song('月面散步（rope_moon）', 7, M.map(function (m, i) {
      var r = C[i][0], lo = r.replace(/\d$/, function (d) { return String(+d - 1); });
      return { p1: mel(m, 'soft', 12, 2), p2: arp16(r.replace(/\d$/, '4'), C[i][1], 5, 1),
               tri: mel(lo + ' -   -   -   -   -   -   -   ' + r + ' -   -   -   -   -   -   -', 'bass', 15, 0), noi: drm('k - - - h - - - s - - - h - - h') };
    }), true);
  }
  // ---- 霓虹屋頂（A 小調，切分律動）----
  function buildNeon() {
    var M = [
      'A-4 -   C-5 A-4 -   E-5 -   A-4 G-5 -   E-5 -   D-5 -   C-5 -',
      'A-4 -   C-5 A-4 -   E-5 -   G-5 -   A-5 -   G-5 E-5 -   -   -',
      'F-4 -   A-4 F-4 -   C-5 -   F-4 E-5 -   C-5 -   B-4 -   A-4 -',
      'G-4 -   B-4 G-4 -   D-5 -   G-5 -   F-5 -   E-5 D-5 -   -   -',
      'A-5 -   -   G-5 -   E-5 -   C-5 -   D-5 E-5 -   G-5 -   -   -',
      'F-5 -   -   E-5 -   C-5 -   A-4 -   B-4 C-5 -   E-5 -   -   -',
      'D-5 -   F-5 -   A-5 -   F-5 -   E-5 -   G#5 -   B-5 -   G#5 -',
      'A-5 -   -   -   E-5 -   -   -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-2', MIN], ['A-2', MIN], ['F-2', MAJ], ['G-2', MAJ], ['A-2', MIN], ['F-2', MAJ], ['D-3', MIN], ['E-3', MAJ]];
    return song('霓虹屋頂（rope_neon）', 5, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'lead', 12, 2), p2: arp16(r.replace(/\d$/, '4'), C[i][1], 6, 2),
               tri: mel((r + ' -   ' + r + ' -   -   ' + r + ' -   ' + r + ' ').repeat(2), 'bass', 15, 0), noi: drm('k - h k s - h - k - h k s h s h') };
    }), true);
  }
  function buildOver() {
    return song('繩子打結（rope_over）', 8, [{
      p1: mel('G-5 -   E-5 -   C-5 -   D-5 -   B-4 -   G-4 -   C-5 -   =   -', 'soft', 12, 2),
      p2: mel('E-4 -   C-4 -   G-3 -   B-3 -   G-3 -   D-3 -   E-3 -   =   -', 'soft', 8, 1),
      tri: mel('C-2 -   -   -   A-1 -   -   -   G-1 -   -   -   C-2 -   =   -', 'bass', 15, 0),
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
    rope_jump: { priority: 2, data: { p2: sq([['C-5', 2, 9, 2], ['G-5', 2, 8], ['C-6', 2, 6]]) } },
    rope_good: { priority: 3, data: { p2: sq([['E-6', 3, 9, 2], ['G-6', 4, 8]]) } },
    rope_perfect: { priority: 4, data: { p2: sq([['C-6', 2, 11, 1], ['E-6', 2, 11], ['G-6', 2, 11], ['C-7', 6, 10]]) } },
    rope_miss: { priority: 7, data: { p2: sq([['D-5', 3, 13, 0], ['A-4', 3, 12], ['D-4', 5, 11], ['A-3', 8, 9]]), noi: nz([[4, 4, 12], [7, 6, 8], [10, 6, 4]]) } },
    rope_level: { priority: 6, data: { p2: sq([['G-5', 4, 12, 2], ['B-5', 4, 12], ['D-6', 4, 12], ['G-6', 10, 11]]) } },
    rope_swish: { priority: 1, data: { noi: nz([[3, 2, 4], [2, 2, 6], [3, 2, 3]]) } },
    rope_move: { priority: 2, data: { p2: sq([['A-5', 3, 9, 2]]) } },
    rope_ok: { priority: 4, data: { p2: sq([['E-6', 3, 11, 2], ['A-6', 6, 11]]) } }
  };
  var SONGS = { rope_title: buildTitle(), rope_plaza: buildPlaza(), rope_moon: buildMoon(), rope_neon: buildNeon(), rope_over: buildOver() };

  function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  function engPause() { return NES.Music && typeof NES.Music.pause === 'function' && typeof NES.Music.resume === 'function'; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; Audio._paused = null;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      Audio._paused = null;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; } }
    },
    // 暫停（§6-2）：音樂停住；resume 接續
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || !Audio.current || Audio._paused) return false;
      if (engPause()) { try { NES.Music.pause(); if (d.stopSfx) d.stopSfx(); Audio._paused = { key: Audio.current, eng: true }; return true; } catch (e) { } }
      var st = null; try { st = d.state ? d.state() : d; } catch (e) { st = d; }
      Audio._paused = { key: Audio.current, from: st && st.playing ? (st.orderIndex || 0) : -1 };
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused, s = p && SONGS[p.key];
      Audio._paused = null;
      if (!d || !s) return false;
      if (p.eng) { try { NES.Music.resume(); Audio.current = p.key; return true; } catch (e) { } }
      if (p.from < 0) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from % s.order.length }); Audio.current = p.key; return true; } catch (e) { return false; }
    },
    playing: function () { var d = drv(Audio._nes); try { return !!(d && (d.state ? d.state().playing : d.playing)); } catch (e) { return false; } },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  RP.Audio = Audio;
})();
