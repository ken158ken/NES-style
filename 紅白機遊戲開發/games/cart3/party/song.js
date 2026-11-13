/*
 * games/cart3/party/song.js — 《星塵派對》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-0 cart3-shell+party（R7）｜ 依賴：engine/music.js
 * 契約：CT.Party.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key          | 曲名     | speed | 小節 | 說明 |
 * |--------------|----------|-------|------|------|
 * | party_title  | 派對開場 | 6     | 4    | 標題；B♭ 大調、切分跳音 + 分解和弦 |
 * | party_think  | 思索時間 | 8     | 4    | 猜數 / 翻牌；D 多利安、慢步低音 |
 * | party_cup    | 星塵杯   | 5     | 4    | 猜拳大會；A 小調快板 |
 * | party_win    | 勝利     | 6     | 1    | 過關 / 冠軍（不 loop） |
 * | party_lose   | 再來一次 | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：party_move / ok / ng / high / low / flip / chant / reveal / rwin / rlose
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PA = CT.Party = CT.Party || {};

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
  var INST = {
    lead: { vol: [12, 11, 10, 9, 8, 7, 7, 6, 6, 5], volLoop: 9, duty: [2, 1] },
    pluck: { vol: [10, 7, 5, 3, 2, 1, 0], duty: [2] },
    pad: { vol: [5, 7, 8, 8, 7, 7, 6, 6], volLoop: 7, duty: [2] },
    bass: {},
    kick: { vol: [14, 10, 6, 3, 0] },
    snare: { vol: [11, 9, 6, 4, 2, 0] },
    hat: { vol: [5, 2, 0] }
  };
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  function buildTitle() {
    var M = [
      'A#4 -   D-5 F-5 -   D-5 A#5 -   A-5 -   G-5 F-5 -   -   D-5 -',
      'D#5 -   G-5 A#5 -   G-5 D#6 -   D-6 -   C-6 A#5 -   -   G-5 -',
      'F-5 -   A-5 C-6 -   A-5 F-6 -   D#6 -   D-6 C-6 -   A-5 -   -',
      'A#5 -   C-6 D-6 -   C-6 A#5 -   F-5 -   G-5 A-5 A#5 -   =   -'
    ];
    var P = [
      'F-4 -   -   F-4 -   -   F-4 -   F-4 -   -   F-4 -   -   F-4 -',
      'G-4 -   -   G-4 -   -   G-4 -   G-4 -   -   G-4 -   -   G-4 -',
      'A-4 -   -   A-4 -   -   A-4 -   C-5 -   -   C-5 -   -   C-5 -',
      'D-5 -   -   D-5 -   -   D-5 -   C-5 -   -   C-5 -   =   -   -'
    ];
    var T = ['A#2', 'D#2', 'F-2', 'A#2'];
    return song('派對開場（party_title）', 6, M.map(function (m, i) {
      var r = T[i];
      return { p1: mel(m, 'lead', 11, 2), p2: mel(P[i], 'pluck', 7, 1),
               tri: mel([r, '-', '-', r, '-', '-', r, '-', r, '-', '-', r, '-', '-', r, '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - h k - h s - k - h k - h s h') };
    }), true);
  }
  function buildThink() {
    var M = [
      'D-5 -   -   -   F-5 -   E-5 -   D-5 -   C-5 -   A-4 -   -   -',
      'B-4 -   -   -   D-5 -   C-5 -   B-4 -   A-4 -   G-4 -   -   -',
      'A-4 -   -   -   C-5 -   D-5 -   E-5 -   F-5 -   G-5 -   -   -',
      'F-5 -   E-5 -   D-5 -   C-5 -   D-5 -   -   -   -   -   -   -'
    ];
    var B = [['D-2', 'A-2', 'D-3', 'A-2'], ['G-2', 'D-3', 'G-2', 'B-2'], ['A-2', 'E-3', 'A-2', 'C-3'], ['D-2', 'A-2', 'C-3', 'A-2']];
    return song('思索時間（party_think）', 8, M.map(function (m, i) {
      var b = B[i];
      return { p1: mel(m, 'lead', 9, 1), p2: mel(m.replace(/([A-G][-#])(\d)/g, function (x, a, o) { return a + (o - 1); }), 'pad', 5, 2),
               tri: mel([b[0], '-', '-', '-', b[1], '-', '-', '-', b[2], '-', '-', '-', b[3], '-', '-', '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - - h - - h - s - - h - - h -') };
    }), true);
  }
  function buildCup() {
    var M = [
      'A-5 -   A-5 C-6 -   A-5 E-6 -   D-6 C-6 B-5 -   A-5 -   E-5 -',
      'F-5 -   F-5 A-5 -   F-5 C-6 -   B-5 A-5 G-5 -   F-5 -   E-5 -',
      'D-5 -   D-5 F-5 -   D-5 A-5 -   G#5 -  B-5 -   D-6 -   E-6 -',
      'C-6 B-5 A-5 -   E-5 -   A-5 -   B-5 -   G#5 -  A-5 -   -   -'
    ];
    var R = ['A-2', 'F-2', 'D-2', 'E-2'];
    return song('星塵杯（party_cup）', 5, M.map(function (m, i) {
      var r = R[i], hi = r.replace('-2', '-3');
      return { p1: mel(m, 'lead', 11, 1), p2: [null, null].concat(mel(m, 'pluck', 6, 2).slice(0, 14)),
               tri: mel([r, '-', hi, '-', r, '-', hi, '-', r, '-', hi, '-', r, '-', hi, '-'].join(' '), 'bass', 15, 0),
               noi: drm('k h s h k h s h k h s h k s k s') };
    }), true);
  }
  function buildWin() {
    return song('勝利（party_win）', 6, [{
      p1: mel('F-5 A-5 C-6 -   A-5 C-6 F-6 -   -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('C-5 F-5 A-5 -   F-5 A-5 C-6 -   -   -   -   -   =   -   -   -', 'pluck', 8, 1),
      tri: mel('F-2 -   -   -   C-3 -   F-3 -   -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - s - k - s - k - - - - - - -')
    }], false);
  }
  function buildLose() {
    return song('再來一次（party_lose）', 8, [{
      p1: mel('E-5 -   D#5 -   D-5 -   C#5 -   C-5 -   -   -   =   -   -   -', 'lead', 10, 2),
      p2: mel('G-4 -   F#4 -   F-4 -   E-4 -   D#4 -   -   -   =   -   -   -', 'pad', 6, 1),
      tri: mel('A-2 -   -   -   G#2 -   -   -   A-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    party_move: { priority: 1, data: { p2: sq([['E-6', 2, 7, 2]]) } },
    party_ok: { priority: 3, data: { p2: sq([['C-6', 2, 10, 2], ['G-6', 4, 10]]) } },
    party_ng: { priority: 3, data: { p2: sq([['C-4', 4, 10, 0], ['B-3', 6, 8]]) } },
    party_high: { priority: 3, data: { p2: sq([['C-5', 3, 10, 2], ['E-5', 3, 10], ['G-5', 3, 10], ['C-6', 5, 9]]) } },
    party_low: { priority: 3, data: { p2: sq([['C-6', 3, 10, 2], ['G-5', 3, 10], ['E-5', 3, 10], ['C-5', 5, 9]]) } },
    party_flip: { priority: 2, data: { noi: nz([[3, 2, 9], [5, 3, 6]]) } },
    party_chant: { priority: 2, data: { p2: sq([['A-5', 5, 10, 2]]) } },
    party_reveal: { priority: 4, data: { p2: sq([['A-6', 8, 12, 2]]), noi: nz([[2, 3, 10], [4, 4, 6]]) } },
    party_rwin: { priority: 5, data: { p2: sq([['G-5', 3, 11, 2], ['C-6', 3, 11], ['E-6', 3, 11], ['G-6', 6, 10]]) } },
    party_rlose: { priority: 5, data: { p2: sq([['A-4', 4, 11, 0], ['F-4', 4, 10], ['D-4', 8, 9]]) } }
  };
  var SONGS = { party_title: buildTitle(), party_think: buildThink(), party_cup: buildCup(), party_win: buildWin(), party_lose: buildLose() };

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
  PA.Audio = Audio;
})();
