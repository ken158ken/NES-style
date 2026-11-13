/*
 * games/cart2/dodge/song.js — 《星塵躲避》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-2 cart2-dodge（R6）｜ 依賴：engine/music.js
 * 契約：CT.Dodge.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key            | 曲名     | speed | 小節 | 說明 |
 * |----------------|----------|-------|------|------|
 * | dodge_title    | 星屑集合 | 7     | 4    | 標題；A 多利安，p1 階梯旋律 / p2 分解和弦 / tri 走句低音 |
 * | dodge_court    | 場邊快板 | 6     | 8    | 躲避球場；F 大調，切分 + 拍手鼓 |
 * | dodge_barrage  | 星核脈動 | 5     | 8    | 彈幕大師；D 小調，十六分音符 p2 琶音 + 八度低音 |
 * | dodge_over     | 光點熄滅 | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：dodge_throw / hit / graze / dash / item / level / bomb / move / ok
 * 暫停：engine 有 `pause()/resume()`（C6-0 插入）就用它（從暫停的 row 接續）；沒有就記小節 + `play({from})`。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var DG = CT.Dodge = CT.Dodge || {};
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

  // ---- 星屑集合（A 多利安；旋律原創：三度階梯往上 + 回落）----
  function buildTitle() {
    var M = [
      'A-4 -   C-5 -   E-5 -   D-5 C-5 D-5 -   F#5 -   E-5 -   -   -',
      'G-4 -   B-4 -   D-5 -   C-5 B-4 C-5 -   E-5 -   D-5 -   -   -',
      'A-4 -   C-5 -   E-5 -   A-5 -   G-5 -   F#5 -   E-5 D-5 E-5 -',
      'C-5 -   B-4 -   A-4 -   G-4 -   B-4 -   A-4 -   -   -   =   -'
    ];
    var C = [['A-3', MIN], ['G-3', MAJ], ['A-3', MIN], ['D-3', MAJ]];
    var BL = ['A-2 -   E-2 -   A-2 -   B-2 -   C-3 -   B-2 -   A-2 -   E-2 -',
              'G-2 -   D-2 -   G-2 -   A-2 -   B-2 -   A-2 -   G-2 -   D-2 -',
              'A-2 -   E-2 -   A-2 -   C-3 -   E-3 -   D-3 -   C-3 -   B-2 -',
              'D-2 -   A-2 -   D-3 -   A-2 -   E-2 -   B-2 -   E-2 -   -   -'];
    return song('星屑集合（dodge_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 12, 2), p2: arp16(C[i][0].replace('-3', '-4'), C[i][1], 7, 2),
               tri: mel(BL[i], 'bass', 15, 0), noi: drm('k - h - s - h - k - h k s - h -') };
    }), true);
  }
  // ---- 場邊快板（F 大調）----
  function buildCourt() {
    var M = [
      'F-5 -   F-5 A-5 -   C-6 -   A-5 G-5 -   F-5 -   G-5 -   -   -',
      'E-5 -   E-5 G-5 -   C-6 -   G-5 F-5 -   E-5 -   D-5 -   -   -',
      'D-5 -   F-5 -   A-5 -   D-6 C-6 -   A-5 -   F-5 -   G-5 -',
      'A-5 -   G-5 -   F-5 -   E-5 -   G-5 -   -   -   C-5 -   -   -',
      'A#4 -   D-5 -   F-5 A#5 -   A-5 G-5 -   F-5 -   D-5 -   -   -',
      'A-4 -   C-5 -   F-5 A-5 -   G-5 F-5 -   E-5 -   C-5 -   -   -',
      'G-4 -   A#4 -   D-5 -   G-5 F-5 -   E-5 -   D-5 -   C-5 -',
      'F-5 -   -   -   C-5 -   A-4 -   F-4 -   -   -   =   -   -   -'
    ];
    var C = [['F-3', MAJ], ['C-3', MAJ], ['D-3', MIN], ['C-3', SUS], ['A#2', MAJ], ['F-3', MAJ], ['G-3', MIN], ['F-3', MAJ]];
    var BL = { 'F-3': 'F-2 -   F-2 -   C-3 -   F-2 -   F-2 -   A-2 -   C-3 -   A-2 -',
               'C-3': 'C-2 -   C-2 -   G-2 -   C-2 -   C-2 -   E-2 -   G-2 -   E-2 -',
               'D-3': 'D-2 -   D-2 -   A-2 -   D-2 -   D-2 -   F-2 -   A-2 -   F-2 -',
               'A#2': 'A#1 -   A#1 -   F-2 -   A#1 -   A#1 -   D-2 -   F-2 -   D-2 -',
               'G-3': 'G-2 -   G-2 -   D-2 -   G-2 -   G-2 -   A#2 -   D-3 -   A#2 -' };
    return song('場邊快板（dodge_court）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 12, 1), p2: arp16(C[i][0].replace('-3', '-4').replace('-2', '-4'), C[i][1], 6, 2),
               tri: mel(BL[C[i][0]], 'bass', 15, 0), noi: drm('k - h - c - h k k - h - c - h h') };
    }), true);
  }
  // ---- 星核脈動（D 小調；p2 十六分琶音、tri 八度）----
  function buildBarrage() {
    var M = [
      'D-5 -   -   E-5 F-5 -   A-5 -   G-5 -   F-5 -   E-5 -   C-5 -',
      'D-5 -   -   -   A-4 -   -   -   C-5 -   D-5 -   -   -   -   -',
      'A#4 -   -   C-5 D-5 -   F-5 -   E-5 -   D-5 -   C-5 -   A-4 -',
      'C-5 -   -   -   G-4 -   -   -   A-4 -   C-5 -   E-5 -   -   -',
      'F-5 -   -   G-5 A-5 -   D-6 -   C-6 -   A-5 -   G-5 -   F-5 -',
      'E-5 -   -   -   C-5 -   -   -   G-5 -   E-5 -   C#5 -   -   -',
      'D-5 -   F-5 -   A-5 -   F-5 -   A#5 -   A-5 -   G-5 -   E-5 -',
      'D-5 -   -   -   A-4 -   -   -   D-5 -   -   -   =   -   -   -'
    ];
    var C = [['D-3', MIN], ['D-3', MIN], ['A#2', MAJ], ['C-3', MAJ], ['F-3', MAJ], ['C-3', MAJ], ['G-3', MIN], ['A-2', MAJ]];
    var BL = {};
    C.forEach(function (c) {
      var r = c[0], lo = r.replace(/\d$/, function (d) { return String(+d - 1); });
      BL[r] = (lo + ' -   ' + r + ' -   ').repeat(4);
    });
    return song('星核脈動（dodge_barrage）', 5, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 12, 2), p2: arp16(C[i][0].replace(/\d$/, '4'), C[i][1], 5, 1),
               tri: mel(BL[C[i][0]], 'bass', 15, 0), noi: drm('k h h h s h k h k h h k s h s h') };
    }), true);
  }
  function buildOver() {
    return song('光點熄滅（dodge_over）', 8, [{
      p1: mel('A-5 -   E-5 -   C-5 -   A-4 -   G-4 -   B-4 -   A-4 -   =   -', 'soft', 12, 2),
      p2: mel('E-4 -   C-4 -   A-3 -   E-3 -   D-3 -   G#3 -   A-3 -   =   -', 'soft', 8, 1),
      tri: mel('A-2 -   -   -   F-2 -   -   -   E-2 -   -   -   A-1 -   =   -', 'bass', 15, 0),
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
    dodge_throw: { priority: 2, data: { noi: nz([[5, 2, 9], [7, 2, 6], [9, 2, 3]]) } },
    dodge_hit: { priority: 7, data: { p2: sq([['E-5', 3, 13, 0], ['A#4', 3, 12], ['E-4', 4, 11], ['A#3', 8, 9]]), noi: nz([[2, 4, 13], [5, 4, 10], [8, 6, 6]]) } },
    dodge_graze: { priority: 1, data: { p2: sq([['C-7', 2, 6, 2], ['G-7', 2, 4]]) } },
    dodge_dash: { priority: 3, data: { noi: nz([[1, 2, 10], [2, 2, 8], [3, 2, 6], [4, 2, 4]]) } },
    dodge_item: { priority: 5, data: { p2: sq([['C-6', 2, 11, 1], ['E-6', 2, 11], ['G-6', 2, 11], ['C-7', 5, 10]]) } },
    dodge_level: { priority: 6, data: { p2: sq([['A-5', 4, 12, 2], ['C#6', 4, 12], ['E-6', 4, 12], ['A-6', 10, 11]]) } },
    dodge_bomb: { priority: 6, data: { p2: sq([['C-4', 3, 13, 2], ['G-4', 3, 13], ['C-5', 3, 12], ['G-5', 3, 11], ['C-6', 8, 10]]), noi: nz([[0, 6, 14], [2, 8, 10], [5, 10, 6]]) } },
    dodge_move: { priority: 2, data: { p2: sq([['A-5', 3, 9, 2]]) } },
    dodge_ok: { priority: 4, data: { p2: sq([['E-6', 3, 11, 2], ['A-6', 6, 11]]) } }
  };
  var SONGS = { dodge_title: buildTitle(), dodge_court: buildCourt(), dodge_barrage: buildBarrage(), dodge_over: buildOver() };

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
  DG.Audio = Audio;
})();
