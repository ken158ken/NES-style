/*
 * games/cart1/pinball/song.js — 《星塵彈珠台》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：engine/music.js（格式見其檔頭）
 * 契約：CT.Pinball.Audio = { init(nes), play(key), stop(), sfx(name), tick(), SONGS, SFX }
 *
 * | key            | 曲名           | speed | 小節 | 說明 |
 * |----------------|----------------|-------|------|------|
 * | pinball_title  | 燈塔的夜       | 8     | 4    | 標題；p1 慢旋律 / p2 分解和弦 / tri 低音 |
 * | pinball_play   | 星雲迴旋       | 6     | 8    | 遊玩；D 大調搖擺；p1 主旋律 / p2 反拍和弦 / tri 行走低音 / noi 鼓 |
 * | pinball_over   | 最後一顆星     | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：pinball_bump / sling / flip / lane / drop / hole / drain / launch / mission / save
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var PB = CT.Pinball = CT.Pinball || {};
  var NES = window.NES = window.NES || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function mel(str, inst, vol, duty) {
    return tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    });
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 14, duty: 0 }, s: { note: 6, inst: 'snare', vol: 13, duty: 0 },
             h: { note: 2, inst: 'hat', vol: 9, duty: 0 } };
  function drm(str) { return tok(str).map(function (t) { return DR[t] || null; }); }
  function arpRow(root, arp, n, step, vol) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i % step === step >> 1 ? { note: root, inst: 'stab', vol: vol, duty: 1, arp: arp } : null);
    return out;
  }
  var INST = {
    lead: { vol: [14, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 11, duty: [2, 2, 1] },
    soft: { vol: [11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5], volLoop: 12, duty: [1] },
    stab: { vol: [10, 8, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 13, 9, 5, 2, 0] },
    snare: { vol: [14, 12, 10, 8, 6, 4, 2, 0] },
    hat: { vol: [7, 4, 1, 0] }
  };
  var MAJ = [0, 4, 7], MIN = [0, 3, 7];

  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) {
      var i = s.patterns.length;
      s.patterns.push({ p1: b.p1, p2: b.p2, tri: b.tri, noi: b.noi });
      s.order.push(i);
    });
    return s;
  }

  // ---- 遊玩曲「星雲迴旋」：D 大調，I–vi–IV–V 變化（通用和弦進行；旋律原創） ----
  var PLAY_MEL = [
    'F#5 -   A-5 -   D-6 -   A-5 -   B-5 -   A-5 F#5 -   E-5 -   ',
    'D-5 -   F#5 -   B-5 -   -   -   A-5 -   F#5 -   D-5 -   -   ',
    'G-5 -   B-5 -   D-6 -   C#6 -   B-5 -   G-5 -   E-5 -   G-5 ',
    'A-5 -   -   -   E-5 -   C#5 -   E-5 -   A-5 -   C#6 -   -   ',
    'D-6 -   C#6 -   B-5 -   A-5 -   F#5 -   A-5 -   D-6 -   F#6 ',
    'E-6 -   D-6 -   B-5 -   F#5 -   G-5 -   B-5 -   -   -   -   ',
    'G-5 A-5 B-5 -   G-5 -   E-5 -   A-5 B-5 C#6 -   A-5 -   E-5 ',
    'D-6 -   -   -   A-5 -   F#5 -   D-5 -   -   -   =   -   -   '
  ];
  var PLAY_CH = [['D-3', MAJ], ['B-2', MIN], ['G-2', MAJ], ['A-2', MAJ], ['D-3', MAJ], ['B-2', MIN], ['G-2', MAJ], ['D-3', MAJ]];
  var BASSL = {
    'D-3': 'D-2 -   -   -   A-2 -   -   -   D-2 -   F#2 -   A-2 -   -   -   ',
    'B-2': 'B-1 -   -   -   F#2 -   -   -   B-1 -   D-2 -   F#2 -   -   -   ',
    'G-2': 'G-1 -   -   -   D-2 -   -   -   G-1 -   B-1 -   D-2 -   -   -   ',
    'A-2': 'A-1 -   -   -   E-2 -   -   -   A-1 -   C#2 -   E-2 -   -   -   '
  };
  var DRUMS = 'k - h - s - h - k - k h s - h h';
  function buildPlay() {
    var bars = PLAY_MEL.map(function (m, i) {
      var ch = PLAY_CH[i];
      return { p1: mel(m + ' -', 'lead', 13, 2), p2: arpRow(ch[0].replace('-2', '-4').replace('-3', '-4'), ch[1], 16, 4, 9),
               tri: mel(BASSL[ch[0]], 'bass', 15, 0), noi: drm(DRUMS) };
    });
    return song('星雲迴旋（pinball_play）', 6, bars, true);
  }
  function buildTitle() {
    var M = [
      'A-4 -   -   -   D-5 -   -   -   F#5 -   -   -   E-5 -   D-5 -   ',
      'B-4 -   -   -   -   -   D-5 -   G-5 -   -   -   F#5 -   E-5 -   ',
      'C#5 -   -   -   E-5 -   A-5 -   G-5 -   F#5 -   E-5 -   C#5 -   ',
      'D-5 -   -   -   -   -   -   -   A-4 -   -   -   -   -   -   -   '
    ];
    var C = [['D-3', MAJ], ['G-2', MAJ], ['A-2', MAJ], ['D-3', MAJ]];
    var bars = M.map(function (m, i) {
      var c = C[i];
      var p2 = [], j, n = ['0', '1', '2', '1'];
      for (j = 0; j < 16; j++) p2.push(j % 2 === 0 ? { note: c[0].replace('-2', '-4').replace('-3', '-4'), inst: 'stab', vol: 7, duty: 0, arp: [c[1][+n[(j >> 1) & 3]]] } : null);
      return { p1: mel(m, 'soft', 12, 1), p2: p2, tri: mel(BASSL[c[0]], 'bass', 15, 0), noi: drm('k - - - - - - - h - - - - - - -') };
    });
    return song('燈塔的夜（pinball_title）', 8, bars, true);
  }
  function buildOver() {
    return song('最後一顆星（pinball_over）', 8, [{
      p1: mel('A-5 -   F#5 -   D-5 -   B-4 -   G-4 -   A-4 -   D-4 -   =   -   ', 'lead', 12, 1),
      p2: mel('F#4 -   D-4 -   B-3 -   G-3 -   E-3 -   C#4 -   A-3 -   =   -   ', 'soft', 8, 0),
      tri: mel('D-2 -   -   -   G-1 -   -   -   A-1 -   -   -   D-2 -   =   -   ', 'bass', 15, 0),
      noi: drm('k - - - - - - - k - - - s - - -')
    }], false);
  }

  /* ---------------- 音效 ---------------- */
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
    pinball_bump: { priority: 3, data: { p2: sq([['C-6', 2, 12, 2], ['G-6', 2, 11], ['C-7', 2, 8]]) } },
    pinball_sling: { priority: 3, data: { noi: nz([[4, 2, 12], [7, 2, 8], [10, 2, 4]]) } },
    pinball_flip: { priority: 1, data: { noi: nz([[12, 2, 7], [14, 1, 3]]) } },
    pinball_lane: { priority: 4, data: { p2: sq([['E-6', 3, 11, 1], ['A-6', 4, 10]]) } },
    pinball_drop: { priority: 4, data: { p2: sq([['A-4', 2, 12, 0], ['E-4', 2, 10], ['A-3', 3, 8]]), noi: nz([[9, 3, 9]]) } },
    pinball_hole: { priority: 5, data: { p2: sq([['D-5', 3, 12, 2], ['F#5', 3, 12], ['A-5', 3, 12], ['D-6', 6, 12]]) } },
    pinball_drain: { priority: 6, data: { p2: sq([['A-4', 4, 12, 1], ['F-4', 4, 11], ['D-4', 4, 10], ['A-3', 8, 9]]) } },
    pinball_launch: { priority: 4, data: { noi: nz([[13, 3, 12], [11, 3, 10], [9, 3, 8], [7, 3, 6], [5, 3, 3]]) } },
    pinball_mission: { priority: 7, data: { p2: sq([['D-6', 4, 13, 2], ['F#6', 4, 13], ['A-6', 4, 13], ['D-7', 10, 13]]) } },
    pinball_save: { priority: 6, data: { p2: sq([['A-5', 3, 12, 1], ['D-6', 3, 12], ['A-5', 3, 12], ['D-6', 6, 12]]) } }
  };
  var SONGS = { pinball_title: buildTitle(), pinball_play: buildPlay(), pinball_over: buildOver() };

  var defined = false;
  function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      defined = true;
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { if (!defined) Audio.init(Audio._nes); d.sfx(name); return true; } catch (e) { return false; }
    },
    // 暫停（fix-r5 §6-2 → fix-r6 P3-8）：engine NES.Music.pause() 記住 row 並靜音；resume() 從同一 row 同一幀接續
    //   （與 blocks / brick / racing / tower 一致）。driver 沒有 pause（舊引擎）時退回「記小節 → stop → 從小節開頭重播」。
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || !Audio.current || Audio._paused) return false;
      if (d.pause && d.isPaused) {
        Audio._paused = { key: Audio.current, engine: true };
        try { d.pause(); } catch (e) { }
        return true;
      }
      var st = null; try { st = d.state ? d.state() : d; } catch (e) { st = d; }
      Audio._paused = { key: Audio.current, from: st && st.playing ? (st.orderIndex || 0) : -1 };
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused, s = p && SONGS[p.key];
      Audio._paused = null;
      if (!d || !p) return false;
      if (p.engine) {
        if (!d.isPaused()) return false;            // 暫停期間有人 play / stop ⇒ 快照作廢，不復活
        try { d.resume(); Audio.current = p.key; return true; } catch (e) { return false; }
      }
      if (!s || p.from < 0) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from % s.order.length }); Audio.current = p.key; return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  PB.Audio = Audio;
})();
