/*
 * games/cart4/brain/song.js — 《星塵腦力》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：engine/music.js
 * 契約：CT.Brain.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key          | 曲名       | speed | 小節 | 說明 |
 * |--------------|------------|-------|------|------|
 * | brain_title  | 思緒星雲   | 8     | 4    | 標題；E 小調，p1 長音 / p2 分解和弦 / tri 根音 |
 * | brain_twin   | 左右對稱   | 6     | 4    | 雙手同步；p1 與 p2 互相應答（左右聲部），noi 碎拍 |
 * | brain_juggle | 四方運轉   | 6     | 4    | 多工；B♭ 混合利底亞，tri 跑動低音 + noi 持續 |
 * | brain_trace  | 軌跡殘影   | 8     | 4    | 時空追蹤；全音音階的懸疑感，p2 回聲 |
 * | brain_tilt   | 滾動星珠   | 7     | 4    | 重力感應；F 大調輕快 |
 * | brain_clear  | 合格       | 6     | 1    | 關卡合格（不 loop） |
 * | brain_over   | 思緒中斷   | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：brain_move / ok / ng / hit / pick / sort / pump / zap / bump / fall / goal / step / tick / alarm
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 12 }, s: { note: 6, inst: 'snare', vol: 9 }, h: { note: 1, inst: 'hat', vol: 5 } };
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
    stac: { vol: [11, 8, 4, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [14, 10, 6, 3, 0] },
    snare: { vol: [12, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [5, 2, 0] }
  };
  var MIN = [0, 3, 7, 12], MAJ = [0, 4, 7, 12], SUS = [0, 5, 7, 12], WT = [0, 4, 8, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function low(m) { return m.replace(/-5/g, '-4').replace(/-6/g, '-5'); }

  function buildTitle() {
    var M = [
      'B-4 -   -   -   E-5 -   -   G-5 F#5 -   -   -   E-5 -   -   -',
      'D-5 -   -   -   B-4 -   -   -   A-4 -   B-4 -   -   -   -   -',
      'C-5 -   -   -   E-5 -   G-5 -   A-5 -   -   -   G-5 -   -   -',
      'F#5 -   -   -   D#5 -   -   -   E-5 -   -   -   =   -   -   -'
    ];
    var C = [['E-3', MIN], ['G-3', MAJ], ['C-3', MAJ], ['B-2', MAJ]];
    return song('思緒星雲（brain_title）', 8, M.map(function (m, i) {
      return {
        p1: mel(m, 'pad', 11, 2), p2: arpeg(C[i][0].replace('-3', '-4').replace('-2', '-3'), C[i][1], 7),
        tri: mel(C[i][0].replace('-3', '-2').replace('B-2', 'B-1') + ' - - - - - - - ' + C[i][0] + ' - - - - - - -', 'bass', 15, 0), noi: fit([])
      };
    }), true);
  }
  function buildTwin() {
    // 問（p1，左手）答（p2，右手）：p1 在前半小節、p2 在後半小節
    var Q = [
      'A-5 -   C-6 -   E-6 -   D-6 C-6 -   -   -   -   -   -   -   -',
      'G-5 -   B-5 -   D-6 -   C-6 B-5 -   -   -   -   -   -   -   -',
      'F-5 -   A-5 -   C-6 -   B-5 A-5 -   -   -   -   -   -   -   -',
      'E-5 -   G#5 -   B-5 -   A-5 -   -   -   -   -   -   -   -   -'
    ];
    var A = [
      '-   -   -   -   -   -   -   -   E-5 -   D-5 C-5 -   B-4 A-4 -',
      '-   -   -   -   -   -   -   -   D-5 -   C-5 B-4 -   A-4 G-4 -',
      '-   -   -   -   -   -   -   -   C-5 -   B-4 A-4 -   G-4 F-4 -',
      '-   -   -   -   -   -   -   -   B-4 -   D-5 E-5 -   =   -   -'
    ];
    var B = ['A-2 - A-3 - A-2 - A-3 - G-2 - G-3 - G-2 - G-3 -', 'G-2 - G-3 - G-2 - G-3 - F-2 - F-3 - F-2 - F-3 -',
             'F-2 - F-3 - F-2 - F-3 - E-2 - E-3 - E-2 - E-3 -', 'E-2 - E-3 - E-2 - E-3 - E-2 - G#2 - B-2 - E-3 -'];
    return song('左右對稱（brain_twin）', 6, Q.map(function (q, i) {
      return { p1: mel(q, 'stac', 11, 2), p2: mel(A[i], 'stac', 9, 1), tri: mel(B[i], 'bass', 15, 0), noi: drm('k - h h s - h - k h - h s - h h') };
    }), true);
  }
  function buildJuggle() {
    var M = [
      'A#4 -   D-5 -   F-5 -   G#5 -   G-5 -   F-5 -   D-5 -   -   -',
      'C-5 -   D#5 -   G-5 -   A#5 -   G#5 -   G-5 -   D#5 -   -   -',
      'D-5 -   F-5 -   A#5 -   C-6 -   A#5 G#5 G-5 -   F-5 -   -   -',
      'G#5 -   G-5 -   F-5 -   D#5 -   D-5 -   C-5 -   A#4 -   =   -'
    ];
    var B = ['A#1 - A#2 - F-2 - A#2 - G#1 - G#2 - D#2 - G#2 -', 'C-2 - C-3 - G-2 - C-3 - D#2 - D#3 - A#2 - D#3 -',
             'D-2 - D-3 - A-2 - D-3 - F-2 - F-3 - C-3 - F-3 -', 'G#1 - G#2 - D#2 - G#2 - F-2 - F-3 - A#1 - A#2 -'];
    return song('四方運轉（brain_juggle）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 10, 2), p2: [null, null, null].concat(mel(low(m), 'echo', 6, 1).slice(0, 13)), tri: mel(B[i], 'bass', 15, 0), noi: drm('k h h h s h h h k h k h s h h h') };
    }), true);
  }
  function buildTrace() {
    var M = [
      'C-5 -   -   -   E-5 -   -   -   G#5 -   -   -   F#5 -   -   -',
      'D-5 -   -   -   F#5 -   -   -   A#5 -   -   -   G#5 -   -   -',
      'E-5 -   -   -   C-5 -   -   -   D-5 -   -   -   A#4 -   -   -',
      'C-5 -   -   -   D-5 -   E-5 -   F#5 -   -   -   =   -   -   -'
    ];
    var C = [['C-4', WT], ['D-4', WT], ['E-4', WT], ['C-4', WT]];
    return song('軌跡殘影（brain_trace）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'pad', 10, 2), p2: arpeg(C[i][0], C[i][1], 6), tri: mel(C[i][0].replace('-4', '-2') + ' - - - - - - - - - - - ' + C[i][0].replace('-4', '-3') + ' - - -', 'bass', 15, 0), noi: drm('h - - - - - - - h - - - - - h -') };
    }), true);
  }
  function buildTilt() {
    var M = [
      'F-5 -   A-5 C-6 -   A-5 F-5 -   G-5 -   A-5 -   F-5 -   -   -',
      'D-5 -   F-5 A-5 -   F-5 D-5 -   E-5 -   G-5 -   C-5 -   -   -',
      'A#4 -   D-5 F-5 -   D-5 A#4 -   C-5 -   E-5 -   G-5 -   -   -',
      'A-5 -   G-5 -   F-5 -   E-5 -   F-5 -   -   -   =   -   -   -'
    ];
    var C = [['F-3', MAJ], ['D-3', MIN], ['A#2', MAJ], ['C-3', SUS]];
    return song('滾動星珠（brain_tilt）', 7, M.map(function (m, i) {
      return {
        p1: mel(m, 'lead', 10, 1), p2: arpeg(C[i][0].replace('-3', '-4').replace('-2', '-3'), C[i][1], 6),
        tri: mel(C[i][0].replace('-3', '-2').replace('A#2', 'A#1') + ' - - - ' + C[i][0] + ' - - - ' + C[i][0].replace('-3', '-2').replace('A#2', 'A#1') + ' - - - ' + C[i][0] + ' - - -', 'bass', 15, 0),
        noi: drm('k - h - s - h - k - h - s - h h')
      };
    }), true);
  }
  function buildClear() {
    return song('合格（brain_clear）', 6, [{
      p1: mel('E-5 G-5 B-5 E-6 -   B-5 -   E-6 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('B-4 E-5 G-5 B-5 -   G-5 -   B-5 -   -   -   -   =   -   -   -', 'echo', 8, 1),
      tri: mel('E-3 -   -   -   B-2 -   E-3 -   -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - k - k - - - - - - - - -')
    }], false);
  }
  function buildOver() {
    return song('思緒中斷（brain_over）', 8, [{
      p1: mel('B-4 -   A-4 -   F#4 -   E-4 -   D#4 -   -   -   =   -   -   -', 'pad', 11, 2),
      p2: mel('D-4 -   C-4 -   A-3 -   G-3 -   F#3 -   -   -   =   -   -   -', 'echo', 8, 1),
      tri: mel('B-2 -   -   -   G-2 -   -   -   B-1 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    brain_move: { priority: 2, data: { p2: sq([['A-5', 2, 8, 2]]) } },
    brain_ok: { priority: 3, data: { p2: sq([['E-6', 2, 10, 2], ['B-6', 4, 10]]) } },
    brain_ng: { priority: 4, data: { p2: sq([['F-4', 4, 11, 0], ['C-4', 6, 10]]) } },
    brain_hit: { priority: 5, data: { p2: sq([['C-4', 2, 12, 0], ['G-3', 4, 10]]), noi: nz([[3, 3, 13], [6, 4, 9], [9, 4, 5]]) } },
    brain_pick: { priority: 3, data: { p2: sq([['B-6', 2, 10, 2], ['E-7', 4, 9]]) } },
    brain_sort: { priority: 2, data: { p2: sq([['G-5', 1, 9, 1], ['D-6', 3, 9]]) } },
    brain_pump: { priority: 1, data: { noi: nz([[11, 2, 8], [13, 2, 4]]) } },
    brain_zap: { priority: 3, data: { p2: sq([['C-7', 1, 11, 0], ['G-6', 1, 10], ['C-6', 2, 9], ['G-5', 3, 7]]), noi: nz([[2, 3, 9]]) } },
    brain_bump: { priority: 1, data: { noi: nz([[9, 2, 7]]) } },
    brain_fall: { priority: 4, data: { p2: sq([['C-6', 2, 10, 2], ['A-5', 2, 9], ['F-5', 2, 8], ['D-5', 2, 7], ['A-4', 4, 6]]) } },
    brain_goal: { priority: 5, data: { p2: sq([['C-6', 2, 11, 2], ['E-6', 2, 11], ['G-6', 2, 11], ['C-7', 6, 10]]) } },
    brain_step: { priority: 1, data: { p2: sq([['E-6', 1, 6, 2]]) } },
    brain_tick: { priority: 1, data: { p2: sq([['B-6', 1, 6, 2]]) } },
    brain_alarm: { priority: 4, data: { p2: sq([['A-5', 3, 11, 2], ['E-5', 3, 11], ['A-5', 3, 11], ['E-5', 3, 11]]) } }
  };
  var SONGS = {
    brain_title: buildTitle(), brain_twin: buildTwin(), brain_juggle: buildJuggle(), brain_trace: buildTrace(),
    brain_tilt: buildTilt(), brain_clear: buildClear(), brain_over: buildOver()
  };

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
    pause: function () { var d = drv(Audio._nes); if (d && d.pause) { try { d.pause(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } },
    resume: function () { var d = drv(Audio._nes); if (d && d.resume) { try { d.resume(); } catch (e) { } } },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  BR.Audio = Audio;
})();
