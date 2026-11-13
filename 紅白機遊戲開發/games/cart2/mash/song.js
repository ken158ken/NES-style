/*
 * games/cart2/mash/song.js — 《星塵連打》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-4 cart2-aim（R6）｜ 依賴：engine/music.js
 * 契約：CT.Mash.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key         | 曲名     | speed | 小節 | 說明 |
 * |-------------|----------|-------|------|------|
 * | mash_title  | 指尖待機 | 7     | 4    | 標題；F 大調輕快，p1 跳音 / p2 分解和弦 / tri 根音 / noi 輕鼓 |
 * | mash_go     | 星鈕狂熱 | 4     | 8    | 測定中；C 小調快板 16 分音推進 |
 * | mash_result | 計測完了 | 6     | 1    | 結算（不 loop） |
 * | mash_over   | 斷連     | 8     | 1    | 指令連段 GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：mash_tap / alt / stumble / ok / miss / count / go / move / lv
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MA = CT.Mash = CT.Mash || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 12 }, s: { note: 6, inst: 'snare', vol: 10 }, h: { note: 1, inst: 'hat', vol: 6 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  function arpeg(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 2, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [12, 13, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2, 2, 1] },
    pad: { vol: [6, 8, 9, 9, 9, 8, 8, 8, 7], volLoop: 8, duty: [2] },
    pluck: { vol: [9, 7, 5, 3, 2, 1, 0], duty: [2] },
    echo: { vol: [5, 5, 4, 4, 3, 3, 2, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [14, 10, 6, 3, 0] },
    snare: { vol: [12, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [5, 2, 0] }
  };
  var MIN = [0, 3, 7, 12], MAJ = [0, 4, 7, 12], SUS = [0, 5, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  function buildTitle() {
    var M = [
      'F-5 -   A-5 F-5 C-6 -   A-5 -   G-5 -   A-5 -   F-5 -   -   -',
      'D-5 -   F-5 D-5 A-5 -   G-5 -   E-5 -   G-5 -   C-6 -   -   -',
      'B-4 -   D-5 F-5 B-5 -   A-5 G-5 A-5 -   F-5 -   D-5 -   -   -',
      'C-5 -   E-5 G-5 C-6 -   B-5 -   G-5 -   E-5 -   F-5 -   =   -'
    ];
    var C = [['F-3', MAJ], ['D-3', MIN], ['A#2', MAJ], ['C-3', MAJ]];
    return song('指尖待機（mash_title）', 7, M.map(function (m, i) {
      var r = C[i][0];
      return { p1: mel(m, 'lead', 11, 1), p2: arpeg(r.replace('-3', '-4').replace('#2', '#3'), C[i][1], 7),
               tri: mel(r.replace('-3', '-2').replace('#2', '#1') + ' - - - ' + r + ' - - - ' + r.replace('-3', '-2').replace('#2', '#1') + ' - - - ' + r + ' - - -', 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h - s - h h') };
    }), true);
  }
  function buildGo() {
    var M = [
      'C-5 D#5 G-5 C-6 G-5 D#5 C-5 D#5 G-5 C-6 D-6 C-6 A#5 G-5 F-5 G-5',
      'G#4 C-5 D#5 G#5 D#5 C-5 G#4 C-5 D#5 G#5 A#5 G#5 G-5 D#5 D-5 D#5',
      'F-4 G#4 C-5 F-5 C-5 G#4 F-4 G#4 C-5 F-5 G-5 F-5 D#5 C-5 B-4 C-5',
      'G-4 B-4 D-5 G-5 D-5 B-4 G-4 B-4 D-5 F-5 G-5 F-5 D-5 B-4 G-4 B-4',
      'C-5 G-5 C-6 G-5 D#6 C-6 G-5 C-6 D-6 A#5 F-5 A#5 D-6 F-6 D-6 A#5',
      'G#5 D#5 C-5 D#5 G#5 C-6 D#6 C-6 G-5 D-5 B-4 D-5 G-5 B-5 D-6 B-5',
      'C-6 -   G-5 -   D#5 -   G-5 -   F-5 -   G#5 -   G-5 -   F-5 -',
      'D#5 -   D-5 -   B-4 -   D-5 -   G-5 -   -   -   G-4 -   -   -'
    ];
    var B = ['C-2', 'G#1', 'F-1', 'G-1', 'C-2', 'G#1', 'F-1', 'G-1'];
    return song('星鈕狂熱（mash_go）', 4, M.map(function (m, i) {
      var r = B[i], r2 = r.replace('-1', '-2').replace('#1', '#2').replace('-2', '-3');
      if (r === 'C-2') r2 = 'C-3';
      return { p1: mel(m, 'lead', 10, 1), p2: [null, null, null].concat(mel(m, 'echo', 6, 2).slice(0, 13)),
               tri: mel([r, '-', r2, '-', r, '-', r2, '-', r, '-', r2, '-', r, '-', r2, '-'].join(' '), 'bass', 15, 0),
               noi: drm('k h s h k h s h k h s h k s s s') };
    }), true);
  }
  function buildResult() {
    return song('計測完了（mash_result）', 6, [{
      p1: mel('C-5 E-5 G-5 C-6 -   G-5 -   C-6 E-6 -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('G-4 C-5 E-5 G-5 -   E-5 -   G-5 C-6 -   -   -   =   -   -   -', 'echo', 8, 1),
      tri: mel('C-3 -   -   -   G-2 -   -   -   C-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - s - - - k - k - - - - -')
    }], false);
  }
  function buildOver() {
    return song('斷連（mash_over）', 8, [{
      p1: mel('G-4 -   F-4 -   D#4 -   D-4 -   C-4 -   -   -   =   -   -   -', 'pad', 11, 2),
      p2: mel('D#4 -   D-4 -   C-4 -   B-3 -   G-3 -   -   -   =   -   -   -', 'echo', 8, 1),
      tri: mel('C-3 -   -   -   G#2 -   -   -   G-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    mash_tap: { priority: 1, data: { noi: nz([[5, 1, 10], [8, 2, 5]]) } },
    mash_alt: { priority: 1, data: { p2: sq([['E-6', 1, 8, 2], ['B-6', 1, 6]]) } },
    mash_stumble: { priority: 3, data: { p2: sq([['D-4', 3, 10, 0], ['C#4', 4, 8]]) } },
    mash_ok: { priority: 4, data: { p2: sq([['G-5', 2, 11, 2], ['C-6', 2, 11], ['E-6', 2, 11], ['G-6', 5, 10]]) } },
    mash_miss: { priority: 5, data: { p2: sq([['A-4', 4, 12, 0], ['E-4', 4, 11], ['A-3', 8, 9]]), noi: nz([[2, 4, 10], [6, 6, 6]]) } },
    mash_count: { priority: 3, data: { p2: sq([['A-5', 6, 10, 2]]) } },
    mash_go_sfx: { priority: 4, data: { p2: sq([['A-6', 12, 12, 2]]) } },
    mash_move: { priority: 2, data: { p2: sq([['C-6', 2, 8, 2]]) } },
    mash_key: { priority: 1, data: { p2: sq([['C-7', 1, 7, 2]]) } },
    mash_lv: { priority: 4, data: { p2: sq([['C-6', 3, 11, 2], ['F-6', 3, 11], ['A-6', 3, 11], ['C-7', 6, 10]]) } }
  };
  var SONGS = { mash_title: buildTitle(), mash_go: buildGo(), mash_result: buildResult(), mash_over: buildOver() };

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
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; },
    // 暫停（§6-2）：R6 起 engine 有 pause / resume（從同一 row 接續）
    pause: function () { var d = drv(Audio._nes); if (d && d.pause) { try { d.pause(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } },
    resume: function () { var d = drv(Audio._nes); if (d && d.resume) { try { d.resume(); } catch (e) { } } },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  MA.Audio = Audio;
})();
