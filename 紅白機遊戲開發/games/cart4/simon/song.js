/*
 * games/cart4/simon/song.js — 《星塵跟我做 STAR ECHO》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/music.js
 * 契約：CT.Simon.Audio = { init(nes), play(key), stop(), pause(), resume(), isPaused(), sfx(name), tone(k, len), tick(),
 *                          SONGS, SFX, KEYS, current, lastSfx, lastTone }
 *
 * **聲道分工（鍵音和 BGM 共存的作法）**：
 *   - 遊玩中的 BGM（simon_play）**只用三角波 + 雜訊**（低音 + 輕刷），p1 / p2 完全空著；
 *   - 8 個鍵音一律走 **p1**（priority 6），系統音效（GOOD / MISS / 選單）走 **p2**（MISS 另帶一下雜訊）；
 *   ⇒ 鍵音永遠不會被 BGM 蓋掉，也不會去搶 BGM 的聲道（BGM 在展示 / 輸入期間持續不斷）。
 *   - 標題曲 / 過關小號（simon_clear）/ 結束曲才用到 p1 / p2，那些時段沒有鍵音。
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | simon_title  | 星語呼喚 | 7     | 4    | 標題；A 大調，p1 旋律 / p2 分解和弦 / tri / noi |
 * | simon_play   | 靜夜脈動 | 8     | 4    | 遊玩；**只有 tri + noi**（A–F#m–D–E 低音 + 輕刷） |
 * | simon_clear  | 迴響成就 | 5     | 1    | 經典到 15 步的小號（不 loop） |
 * | simon_over   | 星光散去 | 9     | 1    | GAME OVER（不 loop） |
 *
 * 8 個鍵音（音高 + 音色都不同；音高順序 下 < 左 < 右 < 上，第二組 = 按住 B）：
 *   k0 ↑ 星   A5  占空比 12.5%、撥弦式衰減（亮、細）
 *   k1 → 月   E5  占空比 25%、延遲顫音（柔）
 *   k2 ↓ 行星 A4  占空比 50%、平穩（空心、低）
 *   k3 ← 彗星 C#5 25% / 50% 交替（嗡嗡聲）+ 尾端下滑（彗尾）
 *   k4..k7 = B + ↑→↓←：G#5 / F#5 / B4 / D5，音色同方向那一組，再疊 **八度快速琶音**（閃爍感）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SM = CT.Simon = CT.Simon || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a) { while (a.length < 16) a.push(null); return a.slice(0, 16); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 9 }, s: { note: 6, inst: 'snare', vol: 6 }, h: { note: 1, inst: 'hat', vol: 4 }, t: { note: 3, inst: 'hat', vol: 3 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  function arpeg(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 1, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [12, 12, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 9, duty: [2, 2, 1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [1] },
    soft: { vol: [7, 8, 8, 7, 7, 6, 6, 5], volLoop: 7, duty: [2] },
    bass: {},
    kick: { vol: [11, 7, 4, 1, 0] },
    snare: { vol: [8, 6, 4, 2, 0] },
    hat: { vol: [4, 2, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  function buildTitle() {
    // 原創：先「呼喚」（上行 A–C#–E 後停在 F#），再「回應」（下行回 A）——呼應「跟我做」的一問一答
    var M = [
      'E-5 -   A-5 -   C#6 -   B-5 -   A-5 -   -   -   E-5 -   F#5 -   -   -',
      'G#5 -   F#5 -   E-5 -   F#5 -   A-5 -   -   -   -   -   -   -   -   -',
      'D-6 -   C#6 -   B-5 -   A-5 -   F#5 -   -   -   A-5 -   B-5 -   -   -',
      'C#6 -   B-5 -   G#5 -   B-5 -   A-5 -   -   -   =   -   -   -   -   -'
    ];
    var C = [['A-4', MAJ, 'A-2', 'E-3'], ['E-4', MAJ, 'E-2', 'B-2'], ['D-4', MAJ, 'D-3', 'F#2'], ['E-4', MAJ, 'E-2', 'A-2']];
    return song('星語呼喚（simon_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: arpeg(C[i][0], C[i][1], 6),
               tri: mel([C[i][2], '-', '-', '-', C[i][3], '-', '-', '-', C[i][2], '-', '-', '-', C[i][3], '-', '-', '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h h s - h -') };
    }), true);
  }
  function buildPlay() {
    // 只有 tri + noi：A – F#m – D – E 的低音行進，留給鍵音整片高音域
    var B = [
      'A-2 -   -   E-3 -   -   A-2 -   -   -   E-3 -   C#3 -   -   -',
      'F#2 -   -   C#3 -   -   F#2 -   -   -   C#3 -   A-2 -   -   -',
      'D-2 -   -   A-2 -   -   D-3 -   -   -   A-2 -   F#2 -   -   -',
      'E-2 -   -   B-2 -   -   E-3 -   -   -   B-2 -   G#2 -   -   -'
    ];
    return song('靜夜脈動（simon_play）', 8, B.map(function (b) {
      return { tri: mel(b, 'bass', 15, 0), noi: drm('t - h - t - h - t - h - t - h h') };
    }), true);
  }
  function buildClear() {
    return song('迴響成就（simon_clear）', 5, [{
      p1: mel('A-5 C#6 E-6 A-6 -   E-6 A-6 C#7 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('E-5 A-5 C#6 E-6 -   C#6 E-6 A-6 -   -   -   -   =   -   -   -', 'soft', 8, 1),
      tri: mel('A-2 -   -   -   E-3 -   -   -   A-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - s s s - - -')
    }], false);
  }
  function buildOver() {
    return song('星光散去（simon_over）', 9, [{
      p1: mel('C#6 -   B-5 -   A-5 -   F#5 -   E-5 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('A-5 -   F#5 -   E-5 -   D-5 -   C#5 -   -   -   =   -   -   -', 'soft', 6, 1),
      tri: mel('F#2 -   -   -   D-2 -   -   -   A-2 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: fit([])
    }], false);
  }

  /* ---------------- 8 個鍵音（p1） ---------------- */
  // KEYS[k] = {note, midi, duty, kind}；k = 方向（0 ↑ 1 → 2 ↓ 3 ←）+ 4 × 組別（B 按住 = 1）
  var KEYS = [
    { note: 'A-5', midi: 81, duty: 0, kind: 'pluck' },
    { note: 'E-5', midi: 76, duty: 1, kind: 'vib' },
    { note: 'A-4', midi: 69, duty: 2, kind: 'flat' },
    { note: 'C#5', midi: 73, duty: 1, kind: 'buzz' },
    { note: 'G#5', midi: 80, duty: 0, kind: 'pluck', shimmer: true },
    { note: 'F#5', midi: 78, duty: 1, kind: 'vib', shimmer: true },
    { note: 'B-4', midi: 71, duty: 2, kind: 'flat', shimmer: true },
    { note: 'D-5', midi: 74, duty: 1, kind: 'buzz', shimmer: true }
  ];
  var VIB = [0, 1, 2, 1, 0, -1, -2, -1];
  function midiName(m) { var N = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']; return N[m % 12] + (Math.floor(m / 12) - 1); }
  // 鍵音的逐幀資料（len 幀；最後 4 幀收尾）
  function toneFrames(k, len) {
    var K = KEYS[k], out = [], i;
    len = Math.max(6, len | 0);
    for (i = 0; i < len; i++) {
      var tail = len - i, v, duty = K.duty, f = {};
      if (K.kind === 'pluck') v = Math.max(5, 13 - (i >> 1));
      else if (K.kind === 'vib') v = 11;
      else if (K.kind === 'flat') v = 12;
      else v = 11;
      if (tail <= 4) v = Math.max(1, Math.round(v * tail / 5));
      if (i === 0) v = Math.min(15, v + 2);
      if (K.kind === 'buzz') duty = ((i >> 1) & 1) ? 2 : 1;
      var midi = K.midi;
      if (K.shimmer && ((i >> 1) & 1)) midi += 12;
      f.vol = v; f.duty = duty;
      if (i === 0 || K.shimmer) f.note = midiName(midi);
      if (i === 0) f.retrigger = true;
      if (K.kind === 'vib' && i >= 5) f.detune = VIB[(i - 5) & 7];
      if (K.kind === 'buzz' && tail === 6) f.slide = 3;           // 彗尾：最後 6 幀往下滑
      out.push(f);
    }
    out.push({ off: true });
    return out;
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
    simon_good: { priority: 3, data: { p2: sq([['E-5', 3, 9, 1], ['A-5', 3, 9], ['C#6', 3, 9], ['E-6', 6, 8]]) } },
    simon_miss: { priority: 4, data: { p2: sq([['D#4', 6, 10, 2], ['A-3', 14, 9]]), noi: nz([[13, 4, 8], [14, 6, 5]]) } },
    simon_menu: { priority: 1, data: { p2: sq([['E-6', 2, 7, 1]]) } },
    simon_ok: { priority: 3, data: { p2: sq([['A-5', 2, 9, 1], ['E-6', 5, 9]]) } },
    simon_tick: { priority: 2, data: { p2: sq([['A-5', 2, 6, 0]]) } },
    simon_go: { priority: 2, data: { p2: sq([['A-6', 6, 8, 0]]) } },
    simon_replay: { priority: 3, data: { p2: sq([['E-6', 2, 8, 1], ['C#6', 2, 8], ['A-5', 4, 7]]) } }
  };
  for (var k = 0; k < 8; k++) SFX['simon_k' + k] = { priority: 6, data: { p1: toneFrames(k, 24) } };
  var SONGS = { simon_title: buildTitle(), simon_play: buildPlay(), simon_clear: buildClear(), simon_over: buildOver() };

  function drv() { return (Audio._nes && Audio._nes.music) || null; }
  var defined = {};
  var Audio = {
    SONGS: SONGS, SFX: SFX, KEYS: KEYS, current: null, lastSfx: null, lastTone: -1, toneCount: 0, _nes: null,
    toneFrames: toneFrames,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; defined = {};
      var d = drv();
      if (!d) return false;
      for (var key in SFX) if (Object.prototype.hasOwnProperty.call(SFX, key)) { try { d.define(key, SFX[key]); defined[key] = 1; } catch (e) { } }
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
    // 鍵音：長度跟著亮燈時間（展示越快音越短）；同一 (鍵, 長度) 只 define 一次
    tone: function (k, len) {
      var d = drv(), name = 'simon_k' + k + '_' + (len | 0);
      Audio.lastTone = k; Audio.toneCount++;
      if (!d) return false;
      try {
        if (!defined[name]) { d.define(name, { priority: 6, data: { p1: toneFrames(k, len) } }); defined[name] = 1; }
        d.sfx(name); return true;
      } catch (e) { return false; }
    },
    tick: function () { var d = drv(); if (d) { try { d.tick(); } catch (e) { } } }
  };
  SM.Audio = Audio;
})();
