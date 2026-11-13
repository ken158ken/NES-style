/*
 * games/cart4/reflex/song.js — 《星塵反應 STAR REFLEX》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：engine/music.js
 * 契約：CT.Reflex.Audio = { init, play, stop, pause, resume, sfx, tick, SONGS, SFX }
 *
 * | key           | 曲名       | speed | 說明 |
 * |---------------|------------|-------|------|
 * | reflex_title  | 訊號塔     | 6     | 標題；D 大調、跳音（loop） |
 * | reflex_lab    | 靜音實驗室 | 9     | 測驗中；稀疏長音、不打鼓（不給玩家可預測的節拍去「猜」燈號），loop |
 * | reflex_result | 測定完成   | 7     | 結算（不 loop） |
 * 音效（搶 p2 / noi）：reflex_go（亮燈嗶）/ hit / false（偷跑蜂鳴）/ err / move / ok / tick
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var RX = CT.Reflex = CT.Reflex || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function grid(str) {
    var a = tok(str), o = [], k, j;
    if (a.length === 16) return a;
    k = 16 / a.length;
    for (var i = 0; i < a.length; i++) { o.push(a[i]); for (j = 1; j < k; j++) o.push('-'); }
    return o;
  }
  function N(t) { return /^[A-G][0-9]$/.test(t) ? t.charAt(0) + '-' + t.charAt(1) : t; }
  function mel(str, inst, vol, duty) {
    return grid(str).map(function (t) {
      if (t === '-') return null;
      if (t === '.') return { note: '---' };
      return { note: N(t), inst: inst, vol: vol, duty: duty };
    });
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 12 }, s: { note: 6, inst: 'snare', vol: 11 }, h: { note: 1, inst: 'hat', vol: 6 } };
  function drm(str) { return grid(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; }); }
  function none() { var a = []; for (var i = 0; i < 16; i++) a.push(null); return a; }
  var INST = {
    lead: { vol: [11, 12, 11, 10, 9, 9, 8, 8, 7], volLoop: 8, duty: [2, 1] },
    pluck: { vol: [9, 6, 4, 3, 2, 1, 0], duty: [2] },
    pad: { vol: [3, 5, 6, 7, 7, 6, 6, 5, 5, 4], volLoop: 9, duty: [1] },
    bass: {},
    kick: { vol: [14, 10, 6, 2, 0] },
    snare: { vol: [12, 9, 6, 3, 1, 0] },
    hat: { vol: [5, 2, 0] }
  };
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  // 訊號塔（D 大調）
  var TITLE = song('訊號塔（reflex_title）', 6, [
    ['F#5 A5 D6 A5 F#5 A5 D6 E6', 'D3 - A2 - D3 - A2 -', 'k h s h k h s h'],
    ['G5 B5 D6 B5 G5 B5 E6 D6', 'G2 - D3 - G2 - D3 -', 'k h s h k h s h'],
    ['E5 G5 C#6 G5 E5 A5 C#6 E6', 'A2 - E3 - A2 - E3 -', 'k h s h k h s h'],
    ['D6 - A5 - F#5 - . -', 'D3 - A2 - D2 - . -', 'k h s h k k s s']
  ].map(function (b) { return { p1: mel(b[0], 'lead', 11, 2), p2: none(), tri: mel(b[1], 'bass', 15, 0), noi: drm(b[2]) }; }), true);
  // 靜音實驗室：只有長音和弦 + 低音，沒有鼓
  var LAB = song('靜音實驗室（reflex_lab）', 9, [
    ['A4 - - - - - - - C5 - - - - - - -', 'A2 - - - - - - - - - - - - - - -'],
    ['G4 - - - - - - - B4 - - - - - - -', 'E2 - - - - - - - - - - - - - - -'],
    ['F4 - - - - - - - A4 - - - - - - -', 'F2 - - - - - - - - - - - - - - -'],
    ['E4 - - - - - - - G#4 - - - - - - -', 'E2 - - - - - - - - - - - - - - -']
  ].map(function (b) { return { p1: none(), p2: mel(b[0], 'pad', 6, 1), tri: mel(b[1], 'bass', 15, 0), noi: none() }; }), true);
  var RESULT = song('測定完成（reflex_result）', 7, [
    { p1: mel('D6 F#6 A6 D7 - - . -', 'lead', 11, 2), p2: mel('A5 D6 F#6 A6 - - . -', 'pluck', 8, 1), tri: mel('D3 - A2 - D2 - . -', 'bass', 15, 0), noi: drm('k h s h k - - -') }
  ], false);

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
    reflex_go: { priority: 5, data: { p2: sq([['A-6', 6, 12, 2]]) } },
    reflex_hit: { priority: 4, data: { p2: sq([['E-6', 2, 10, 2], ['B-6', 5, 9]]) } },
    reflex_false: { priority: 6, data: { p2: sq([['C-4', 4, 12, 0], ['C#4', 4, 12, 0], ['C-4', 6, 10, 0]]), noi: nz([[12, 6, 10]]) } },
    reflex_err: { priority: 6, data: { p2: sq([['F-4', 5, 11, 0], ['B-3', 8, 10, 0]]) } },
    reflex_move: { priority: 2, data: { p2: sq([['A-5', 3, 8, 2]]) } },
    reflex_ok: { priority: 4, data: { p2: sq([['D-6', 3, 10, 2], ['A-6', 6, 10]]) } },
    reflex_tick: { priority: 2, data: { noi: nz([[2, 2, 5]]) } }
  };
  var SONGS = { reflex_title: TITLE, reflex_lab: LAB, reflex_result: RESULT };

  function drv(nes) { return (nes && nes.music) || null; }
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
    sfx: function (name) { var d = drv(Audio._nes); if (!d || !SFX[name]) return false; try { d.sfx(name); return true; } catch (e) { return false; } },
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || Audio._paused || !d.pause || !d.state().playing) return false;
      d.pause(); if (d.stopSfx) d.stopSfx(); Audio._paused = { key: Audio.current }; return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused;
      Audio._paused = null;
      if (!d || !p || !d.resume) return false;
      Audio.current = p.key; return d.resume();
    },
    state: function () { var d = drv(Audio._nes); return d ? d.state() : null; },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  RX.Audio = Audio;
})();
