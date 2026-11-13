/*
 * games/cart4/tune/song.js — 《星塵旋律 STAR MELODY》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/music.js
 * 契約：CT.Tune.Audio = { init, play(key), playSong(song), stop, pause, resume, isPaused, sfx(name), key(k), tick,
 *                         phrase(events, U, opt), SONGS, SFX, SCALE, current, lastSfx, lastKey, keyCount }
 *
 * 題目旋律 = **每題當場產生的一首小曲**（`phrase()`；main.js 用規則產生原創旋律：級進為主、起在 DO/MI/SO、收在主音），
 *   p1 = 旋律（鐘琴音色）、tri = 主音持續低音、noi = 前置 4 下拍點 + 每拍輕點；speed = 1 單位（八分音符）幾幀。
 *   畫面上的亮鍵 / 時間軸一律由 **driver 的 row / rowFrame** 推回「現在響的是第幾個音」（不用 Date.now）。
 * **聲道分工**：輸入時的節拍器 BGM（tune_beat）**只用 tri + noi**；8 個琴鍵音走 **p1**（與題目旋律同音色），
 *   系統音效（對 / 錯 / 選單）走 **p2** ⇒ 玩家彈奏時鍵音與節拍器同時響、不搶聲道。
 *
 * | key        | 曲名     | speed | 說明 |
 * |------------|----------|-------|------|
 * | tune_title | 星之鐘   | 7     | 標題；C 大調，鐘琴旋律 + 分解和弦 + 低音 + 輕鼓 |
 * | tune_beat  | 節拍星   | 12    | 輸入時的節拍器（只有 tri + noi；main.js 依關卡改 speed 另建） |
 * | tune_clear | 升階     | 5     | 過級小號（不 loop） |
 * | tune_over  | 餘音     | 9     | GAME OVER（不 loop） |
 * | tune_demo  | 示範句   | 12    | `phrase()` 產生的範例題（給 apu_render 離線驗證題目格式） |
 * 鍵盤 8 音：C5 D5 E5 F5 G5 A5 B5 C6（DO RE MI FA SO LA TI DO）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TN = CT.Tune = CT.Tune || {};

  var SCALE = [72, 74, 76, 77, 79, 81, 83, 84];
  var NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  function nm(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  function fit(a, n) { n = n || 16; while (a.length < n) a.push(null); return a.slice(0, n); }
  function mel(str, inst, vol, duty) {
    return fit(tok(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      return { note: t, inst: inst, vol: vol, duty: duty };
    }));
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 9 }, s: { note: 6, inst: 'snare', vol: 6 }, h: { note: 1, inst: 'hat', vol: 4 }, c: { note: 2, inst: 'click', vol: 8 }, t: { note: 1, inst: 'click', vol: 4 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; })); }
  function arpeg(root, arp, vol) {
    var out = [];
    for (var i = 0; i < 16; i++) out.push(i % 2 === 0 ? { note: root, inst: 'pluck', vol: vol, duty: 1, arp: [arp[(i >> 1) % arp.length]] } : null);
    return out;
  }
  var BELL_VOL = [13, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 6, 5];
  var INST = {
    bell: { vol: BELL_VOL, volLoop: 12, duty: [2] },
    lead: { vol: [12, 12, 11, 10, 10, 9, 9, 8], volLoop: 7, duty: [2, 2, 1] },
    pluck: { vol: [8, 6, 4, 3, 2, 1, 0], duty: [1] },
    soft: { vol: [7, 8, 8, 7, 7, 6, 6, 5], volLoop: 7, duty: [2] },
    bass: {},
    kick: { vol: [11, 7, 4, 1, 0] },
    snare: { vol: [8, 6, 4, 2, 0] },
    hat: { vol: [4, 2, 0] },
    click: { vol: [9, 4, 1, 0] }
  };
  var MAJ = [0, 4, 7, 12], MIN = [0, 3, 7, 12];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }
  function buildTitle() {
    // 原創：鐘琴式的上行分解和弦，第二句往下回答
    var M = [
      'C-6 -   G-5 -   E-5 -   G-5 -   A-5 -   -   -   G-5 -   E-5 -   -   -',
      'F-5 -   A-5 -   C-6 -   D-6 -   B-5 -   -   -   G-5 -   -   -   -   -',
      'E-6 -   D-6 -   C-6 -   A-5 -   F-5 -   -   -   A-5 -   G-5 -   -   -',
      'D-5 -   F-5 -   B-5 -   D-6 -   C-6 -   -   -   =   -   -   -   -   -'
    ];
    var C = [['C-4', MAJ, 'C-3', 'G-2'], ['F-4', MAJ, 'F-2', 'C-3'], ['A-4', MIN, 'A-2', 'E-2'], ['G-4', MAJ, 'G-2', 'C-3']];
    return song('星之鐘（tune_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'bell', 11, 2), p2: arpeg(C[i][0], C[i][1], 6),
               tri: mel([C[i][2], '-', '-', '-', C[i][3], '-', '-', '-', C[i][2], '-', '-', '-', C[i][3], '-', '-', '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h h s - h -') };
    }), true);
  }
  function beatSong(speed) {
    // 節拍器：每 2 單位（一拍）一下，第 1 拍重；三角波只在小節頭點一下主音（不壓住鍵音音域）
    var b = { tri: mel('C-3 -   =   -   -   -   -   -   G-2 -   =   -   -   -   -   -', 'bass', 15, 0),
              noi: drm('c - t - t - t - c - t - t - t -') };
    var s = song('節拍星（tune_beat）', speed, [b], true);
    return s;
  }
  function buildClear() {
    return song('升階（tune_clear）', 5, [{
      p1: mel('C-6 E-6 G-6 C-7 -   G-6 C-7 E-7 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('G-5 C-6 E-6 G-6 -   E-6 G-6 C-7 -   -   -   -   =   -   -   -', 'soft', 8, 1),
      tri: mel('C-3 -   -   -   G-2 -   -   -   C-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - s s s - - -')
    }], false);
  }
  function buildOver() {
    return song('餘音（tune_over）', 9, [{
      p1: mel('E-6 -   D-6 -   B-5 -   G-5 -   C-6 -   -   -   =   -   -   -', 'soft', 10, 2),
      p2: mel('C-6 -   B-5 -   G-5 -   F-5 -   E-5 -   -   -   =   -   -   -', 'soft', 6, 1),
      tri: mel('A-2 -   -   -   G-2 -   -   -   C-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: fit([])
    }], false);
  }

  /* ---------------- 題目曲：events = [{row, midi, dur}]（row / dur 以「單位」= 1 row 計），U = 每單位幾幀 ----------------
   * opt.countIn：前置 4 下拍點（每 2 row 一下）、旋律從 row 8 起（events 的 row 已經含這個偏移）
   * opt.drone：三角波主音持續（C3），從 opt.droneFrom 到 opt.droneTo
   * 每個音的最後 2 幀切音（重複同一個音聽得出兩下）。 */
  function phrase(events, U, opt) {
    opt = opt || {};
    var last = 0, i;
    events.forEach(function (e) { last = Math.max(last, e.row + e.dur); });
    var rows = last + (opt.tail === undefined ? 3 : opt.tail);
    var p1 = [], tri = [], noi = [];
    for (i = 0; i < rows; i++) { p1.push(null); tri.push(null); noi.push(null); }
    events.forEach(function (e) {
      p1[e.row] = { note: nm(e.midi), inst: 'bell', vol: 12, duty: 2, cut: Math.max(4, e.dur * U - 2) };
    });
    if (opt.countIn) for (i = 0; i < 8; i += 2) noi[i] = { note: i === 0 ? 2 : 1, inst: 'click', vol: i === 0 ? 9 : 6, duty: 0 };
    if (opt.beat) for (i = opt.beatFrom || 0; i < last; i += 2) if (!noi[i]) noi[i] = { note: 1, inst: 'click', vol: 3, duty: 0 };
    if (opt.drone) { tri[opt.droneFrom || 0] = { note: 'C-3', inst: 'bass', vol: 15 }; if ((opt.droneTo || last) < rows) tri[opt.droneTo || last] = { note: '===' }; }
    return { name: opt.name || 'tune_phrase', speed: U, rows: rows, loop: 0, instruments: INST,
             patterns: [{ p1: p1, tri: tri, noi: noi }], order: [0], playLoop: false, events: events };
  }

  /* ---------------- 8 個琴鍵音（p1，與題目旋律同一個鐘琴音色） ---------------- */
  function keyFrames(midi, len) {
    var out = [];
    for (var i = 0; i < len; i++) {
      var v = BELL_VOL[Math.min(i, BELL_VOL.length - 1)];
      if (len - i <= 3) v = Math.max(1, v - (4 - (len - i)) * 2);
      var f = { vol: v, duty: 2 };
      if (i === 0) { f.note = nm(midi); f.retrigger = true; }
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
    tune_good: { priority: 3, data: { p2: sq([['G-5', 3, 8, 1], ['C-6', 3, 8], ['E-6', 6, 8]]) } },
    tune_perfect: { priority: 3, data: { p2: sq([['C-6', 2, 9, 1], ['E-6', 2, 9], ['G-6', 2, 9], ['C-7', 8, 8]]) } },
    tune_miss: { priority: 4, data: { p2: sq([['F#4', 6, 10, 2], ['C-4', 14, 9]]), noi: nz([[13, 4, 7], [14, 6, 4]]) } },
    tune_menu: { priority: 1, data: { p2: sq([['G-6', 2, 7, 1]]) } },
    tune_ok: { priority: 3, data: { p2: sq([['C-6', 2, 9, 1], ['G-6', 5, 9]]) } },
    tune_tick: { priority: 2, data: { noi: nz([[2, 3, 8]]) } },
    tune_move: { priority: 1, data: { p2: sq([['E-6', 1, 6, 0]]) } },
    tune_again: { priority: 3, data: { p2: sq([['G-6', 2, 8, 1], ['E-6', 2, 8], ['C-6', 4, 7]]) } }
  };
  for (var k = 0; k < 8; k++) SFX['tune_k' + k] = { priority: 6, data: { p1: keyFrames(SCALE[k], 20) } };
  var DEMO = phrase([{ row: 8, midi: 72, dur: 2 }, { row: 10, midi: 76, dur: 2 }, { row: 12, midi: 79, dur: 1 }, { row: 13, midi: 77, dur: 1 },
                     { row: 14, midi: 76, dur: 2 }, { row: 16, midi: 74, dur: 2 }, { row: 18, midi: 72, dur: 4 }], 12,
                    { countIn: true, drone: true, droneFrom: 8, name: '示範句（tune_demo）' });
  DEMO.playLoop = true;
  var SONGS = { tune_title: buildTitle(), tune_beat: beatSong(12), tune_clear: buildClear(), tune_over: buildOver(), tune_demo: DEMO };

  function drv() { return (Audio._nes && Audio._nes.music) || null; }
  var defined = {};
  var Audio = {
    SONGS: SONGS, SFX: SFX, SCALE: SCALE, current: null, lastSfx: null, lastKey: -1, keyCount: 0, _nes: null,
    phrase: phrase, beatSong: beatSong, keyFrames: keyFrames, noteName: nm,
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
    // 動態曲（題目 / 依關卡速度的節拍器）：key 給畫面 / 測試辨識
    playSong: function (s, key) {
      var d = drv();
      Audio.current = key || s.name;
      if (!d) return false;
      try { if (d.stopSfx) d.stopSfx(); d.play(s, { loop: !!s.playLoop }); return true; } catch (e) { return false; }
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
    // 單音（p1）：琴鍵 k（0..7）或任意 midi（{midi, len}，聽音辨高低 / 示範用）
    key: function (k, len) {
      var d = drv(), name = 'tune_k' + k + (len ? '_' + len : '');
      Audio.lastKey = k; Audio.keyCount++;
      if (!d) return false;
      try {
        if (!defined[name]) { d.define(name, { priority: 6, data: { p1: keyFrames(SCALE[k], len || 20) } }); defined[name] = 1; }
        d.sfx(name); return true;
      } catch (e) { return false; }
    },
    // NES.Music 是門面（api），曲子位置在它背後的預設 driver（_default）上；直接讀欄位，不每幀建 state() 物件
    playing: function () { var d = drv(); d = d && (d._default || d); return !!(d && d.playing); },
    pos: function () { var d = drv(); d = d && (d._default || d); return d ? { row: d.row, rowFrame: d.rowFrame, order: d.orderIndex, playing: !!d.playing, speed: d.speed } : null; },
    tick: function () { var d = drv(); if (d) { try { d.tick(); } catch (e) { } } }
  };
  TN.Audio = Audio;
})();
