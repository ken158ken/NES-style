/*
 * games/cart4/cards/song.js — 《星塵翻牌》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：engine/music.js
 * 契約：CT.Cards.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current }
 *
 * | key          | 曲名       | speed | 小節 | 說明 |
 * |--------------|------------|-------|------|------|
 * | cards_title  | 星牌邀請   | 6     | 4    | 標題；F 大調、三拍感的分解和弦（16 row 內 3+3+2 切分） |
 * | cards_play   | 記憶迴廊   | 7     | 4    | 經典 / 限時；E 小調、輕跳音 + 長音和聲（不搶注意力） |
 * | cards_vs     | 對弈星桌   | 5     | 4    | 對 CPU；D 小調快板、低音八度跳 |
 * | cards_win    | 全部翻開   | 6     | 1    | 清盤（不 loop） |
 * | cards_lose   | 下次再翻   | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：cards_move / flip / match / miss / combo / deal / ready / go / peek / ng
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var CA = CT.Cards = CT.Cards || {};

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
  function bassLine(notes, pat) {       // pat：16 字元，x = 該 row 放 notes 依序輪流
    var out = [], k = 0;
    for (var i = 0; i < 16; i++) out.push(pat.charAt(i) === 'x' ? notes[k++ % notes.length] : '-');
    return out.join(' ');
  }

  function buildTitle() {
    var M = [
      'C-5 -   F-5 -   -   A-5 -   -   G-5 -   F-5 -   -   E-5 -   -',
      'D-5 -   G-5 -   -   A#5 -   -   A-5 -   G-5 -   -   F-5 -   -',
      'A-5 -   C-6 -   -   D-6 -   -   C-6 -   A-5 -   -   G-5 -   -',
      'A#5 -   A-5 -   -   G-5 -   -   E-5 -   G-5 -   F-5 -   =   -'
    ];
    var H = [
      'A-4 -   -   C-5 -   -   A-4 -   C-5 -   -   A-4 -   -   C-5 -',
      'A#4 -   -   D-5 -   -   A#4 -   D-5 -   -   A#4 -   -   D-5 -',
      'C-5 -   -   F-5 -   -   C-5 -   E-5 -   -   C-5 -   -   E-5 -',
      'D-5 -   -   C-5 -   -   A#4 -   C-5 -   -   A-4 -   =   -   -'
    ];
    var T = [['F-2', 'C-3'], ['A#2', 'F-2'], ['F-2', 'A-2'], ['C-3', 'F-2']];
    return song('星牌邀請（cards_title）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: mel(H[i], 'pluck', 7, 1),
               tri: mel(bassLine(T[i], 'x--x--x-x--x--x-'), 'bass', 15, 0),
               noi: drm('k - h k - h s - k - h k - h s h') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'E-5 -   G-5 -   B-5 -   -   -   A-5 -   G-5 -   F#5 -   -   -',
      'G-5 -   B-5 -   D-6 -   -   -   C-6 -   B-5 -   A-5 -   -   -',
      'C-6 -   B-5 -   A-5 -   G-5 -   F#5 -   G-5 -   A-5 -   -   -',
      'B-5 -   -   -   F#5 -   -   -   E-5 -   -   -   =   -   -   -'
    ];
    var P = [
      'B-4 -   -   -   -   -   -   -   C-5 -   -   -   -   -   -   -',
      'D-5 -   -   -   -   -   -   -   E-5 -   -   -   -   -   -   -',
      'E-5 -   -   -   -   -   -   -   D-5 -   -   -   -   -   -   -',
      'D#5 -   -   -   -   -   -   -   B-4 -   -   -   =   -   -   -'
    ];
    var B = [['E-2', 'B-2'], ['G-2', 'D-3'], ['A-2', 'D-3'], ['B-2', 'E-2']];
    return song('記憶迴廊（cards_play）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'pluck', 10, 1), p2: mel(P[i], 'pad', 5, 2),
               tri: mel(bassLine(B[i], 'x---x---x---x---'), 'bass', 15, 0),
               noi: drm('h - - - s - - h h - - - s - - -') };
    }), true);
  }
  function buildVs() {
    var M = [
      'D-5 -   F-5 A-5 -   F-5 D-6 -   C-6 -   A-5 -   A#5 A-5 G-5 -',
      'F-5 -   A-5 C-6 -   A-5 F-6 -   E-6 -   C-6 -   D-6 C-6 A#5 -',
      'A#5 -   A-5 G-5 -   F-5 E-5 -   G-5 -   F-5 E-5 -   D-5 C#5 -',
      'D-5 -   E-5 F-5 -   G-5 A-5 -   C#6 -   E-6 -   D-6 -   -   -'
    ];
    var R = ['D-2', 'F-2', 'G-2', 'A-2'];
    return song('對弈星桌（cards_vs）', 5, M.map(function (m, i) {
      var r = R[i], hi = r.replace('-2', '-3');
      return { p1: mel(m, 'lead', 11, 1), p2: [null, null, null].concat(mel(m, 'pluck', 5, 2).slice(0, 13)),
               tri: mel([r, '-', hi, '-', r, hi, '-', r, '-', hi, r, '-', hi, '-', r, hi].join(' '), 'bass', 15, 0),
               noi: drm('k - s h k k s h k - s h k s s s') };
    }), true);
  }
  function buildWin() {
    return song('全部翻開（cards_win）', 6, [{
      p1: mel('C-6 -   A-5 C-6 F-6 -   E-6 -   F-6 -   A-6 -   -   -   =   -', 'lead', 12, 2),
      p2: mel('A-5 -   F-5 A-5 C-6 -   C-6 -   C-6 -   F-6 -   -   -   =   -', 'pluck', 8, 1),
      tri: mel('F-2 -   -   -   A#2 -   C-3 -   F-3 -   -   -   -   -   =   -', 'bass', 15, 0),
      noi: drm('k - h - k - s - k - s - k - - -')
    }], false);
  }
  function buildLose() {
    return song('下次再翻（cards_lose）', 8, [{
      p1: mel('B-4 -   A-4 -   G-4 -   F#4 -   E-4 -   -   -   =   -   -   -', 'lead', 10, 2),
      p2: mel('G-4 -   F#4 -   E-4 -   D#4 -   B-3 -   -   -   =   -   -   -', 'pad', 6, 1),
      tri: mel('E-2 -   -   -   C-2 -   -   -   B-1 -   -   -   =   -   -   -', 'bass', 15, 0),
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
    cards_move: { priority: 1, data: { p2: sq([['F-6', 2, 6, 2]]) } },
    cards_flip: { priority: 2, data: { noi: nz([[4, 2, 9], [7, 2, 6], [10, 2, 3]]) } },
    cards_match: { priority: 4, data: { p2: sq([['C-6', 3, 11, 2], ['E-6', 3, 11], ['G-6', 6, 10]]) } },
    cards_combo: { priority: 5, data: { p2: sq([['G-6', 2, 11, 2], ['C-7', 2, 11], ['E-7', 2, 11], ['G-7', 6, 10]]) } },
    cards_miss: { priority: 3, data: { p2: sq([['E-4', 5, 9, 0], ['C-4', 7, 7]]) } },
    cards_deal: { priority: 1, data: { noi: nz([[2, 1, 6], [6, 1, 3]]) } },
    cards_ready: { priority: 3, data: { p2: sq([['A-5', 6, 9, 2]]) } },
    cards_go: { priority: 4, data: { p2: sq([['A-6', 10, 11, 2]]) } },
    cards_peek: { priority: 3, data: { p2: sq([['D-6', 3, 9, 1], ['A-5', 3, 9], ['D-6', 3, 9], ['A-6', 6, 8]]) } },
    cards_ng: { priority: 3, data: { p2: sq([['C-4', 4, 10, 0], ['B-3', 6, 8]]) } }
  };
  var SONGS = { cards_title: buildTitle(), cards_play: buildPlay(), cards_vs: buildVs(), cards_win: buildWin(), cards_lose: buildLose() };

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
  CA.Audio = Audio;
})();
