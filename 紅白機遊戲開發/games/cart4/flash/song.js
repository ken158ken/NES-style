/*
 * games/cart4/flash/song.js — 《星塵閃記》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：engine/music.js
 * 契約：CT.Flash.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current }
 *
 * | key          | 曲名       | speed | 小節 | 說明 |
 * |--------------|------------|-------|------|------|
 * | flash_title  | 閃光序曲   | 6     | 4    | 標題；A 大調、上行琶音 + 頂端長音 |
 * | flash_play   | 腦內星圖   | 8     | 4    | 圖案 / 找差異；C 利底安（#F）、稀疏鐘聲 |
 * | flash_seq    | 心跳節拍   | 8     | 2    | 序列模式：**只用三角波 + 雜訊**，把方波讓給格子音高 |
 * | flash_race   | 追星賽     | 4     | 4    | 與 CPU 競速；G 小調十六分音符 |
 * | flash_win    | 記住了！   | 6     | 1    | 通關（不 loop） |
 * | flash_lose   | 忘光光     | 8     | 1    | GAME OVER（不 loop） |
 * 音效：flash_move / mark / ok / bad / level / ready / go / replay / win，
 *   格子音 flash_t0..15（大調五聲音階 C D E G A 往上排兩個半八度，每格一個音高；序列模式的「聽」提示，畫面同時亮格）
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var FL = CT.Flash = CT.Flash || {};

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
    bell: { vol: [11, 8, 6, 5, 4, 3, 2, 2, 1, 1, 0], duty: [1] },
    pluck: { vol: [10, 7, 5, 3, 2, 1, 0], duty: [2] },
    pad: { vol: [4, 6, 7, 7, 6, 6, 5, 5], volLoop: 7, duty: [2] },
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
  var EMPTY = function () { return fit([]); };

  function buildTitle() {
    var M = [
      'A-4 C#5 E-5 A-5 -   -   G#5 -   F#5 -   E-5 -   -   -   C#5 -',
      'D-5 F#5 A-5 D-6 -   -   C#6 -   B-5 -   A-5 -   -   -   F#5 -',
      'E-5 G#5 B-5 E-6 -   -   D-6 -   C#6 -   B-5 -   A-5 -   G#5 -',
      'A-5 -   E-5 -   C#6 -   B-5 -   A-5 -   -   -   =   -   -   -'
    ];
    var P = [
      'E-4 -   -   -   E-4 -   -   -   C#4 -   -   -   C#4 -   -   -',
      'F#4 -   -   -   F#4 -   -   -   D-4 -   -   -   D-4 -   -   -',
      'G#4 -   -   -   G#4 -   -   -   E-4 -   -   -   E-4 -   -   -',
      'C#5 -   -   -   B-4 -   -   -   A-4 -   -   -   =   -   -   -'
    ];
    var B = ['A-2', 'D-2', 'E-2', 'A-2'];
    return song('閃光序曲（flash_title）', 6, M.map(function (m, i) {
      var r = B[i], hi = r.replace('-2', '-3');
      return { p1: mel(m, 'lead', 11, 2), p2: mel(P[i], 'pad', 6, 2),
               tri: mel([r, '-', hi, '-', r, '-', hi, '-', r, '-', hi, '-', r, '-', hi, '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - h - s - h - k - h k s - h h') };
    }), true);
  }
  function buildPlay() {
    var M = [
      'G-5 -   -   -   -   -   F#5 -   -   -   E-5 -   -   -   -   -',
      'C-6 -   -   -   -   -   B-5 -   -   -   G-5 -   -   -   -   -',
      'A-5 -   -   -   F#5 -   -   -   D-5 -   -   -   E-5 -   -   -',
      'G-5 -   -   -   -   -   -   -   =   -   -   -   -   -   -   -'
    ];
    var B = ['C-3', 'A-2', 'D-3', 'C-3'];
    return song('腦內星圖（flash_play）', 8, M.map(function (m, i) {
      var r = B[i];
      return { p1: mel(m, 'bell', 9, 1), p2: EMPTY(),
               tri: mel([r, '-', '-', '-', '-', '-', r, '-', '-', '-', '-', '-', r, '-', '-', '-'].join(' '), 'bass', 15, 0),
               noi: drm('h - - - - - h - - - s - - - - -') };
    }), true);
  }
  function buildSeq() {
    var T = [['A-2', 'E-2'], ['F-2', 'G-2']];
    return song('心跳節拍（flash_seq）', 8, T.map(function (t) {
      return { p1: EMPTY(), p2: EMPTY(),
               tri: mel([t[0], '-', '-', '-', '-', '-', '-', '-', t[1], '-', '-', '-', '-', '-', '-', '-'].join(' '), 'bass', 15, 0),
               noi: drm('k - - - h - - - k - k - h - - -') };
    }), true);
  }
  function buildRace() {
    var M = [
      'G-5 A#5 D-6 A#5 G-5 A#5 D-6 F-6 D#6 D-6 C-6 A#5 A-5 C-6 D-6 -',
      'D#5 G-5 A#5 G-5 D#5 G-5 C-6 D#6 D-6 C-6 A#5 A-5 G-5 A-5 A#5 -',
      'F-5 A-5 C-6 A-5 F-5 A-5 D-6 F-6 E-6 D-6 C-6 A#5 A-5 G-5 F-5 -',
      'D-5 F#5 A-5 C-6 A-5 F#5 D-5 F#5 A-5 -   D-6 -   F#6 -   =   -'
    ];
    var B = ['G-2', 'D#2', 'F-2', 'D-2'];
    return song('追星賽（flash_race）', 4, M.map(function (m, i) {
      var r = B[i], hi = r.replace('-2', '-3');
      return { p1: mel(m, 'pluck', 10, 1), p2: [null, null].concat(mel(m, 'pluck', 5, 2).slice(0, 14)),
               tri: mel([r, hi, r, hi, r, hi, r, hi, r, hi, r, hi, r, hi, r, hi].join(' '), 'bass', 15, 0),
               noi: drm('k h s h k h s h k h s h k h s s') };
    }), true);
  }
  function buildWin() {
    return song('記住了！（flash_win）', 6, [{
      p1: mel('E-5 A-5 C#6 E-6 -   C#6 E-6 A-6 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('C#5 E-5 A-5 C#6 -   A-5 C#6 E-6 -   -   -   -   =   -   -   -', 'pluck', 8, 1),
      tri: mel('A-2 -   -   -   E-3 -   -   -   A-3 -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - h - s - h - k - - - - - - -')
    }], false);
  }
  function buildLose() {
    return song('忘光光（flash_lose）', 8, [{
      p1: mel('A-5 -   E-5 -   C-5 -   A-4 -   G#4 -   -   -   =   -   -   -', 'lead', 10, 2),
      p2: mel('E-5 -   C-5 -   A-4 -   E-4 -   E-4 -   -   -   =   -   -   -', 'pad', 6, 1),
      tri: mel('A-2 -   -   -   F-2 -   -   -   E-2 -   -   -   =   -   -   -', 'bass', 15, 0),
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
  // 格子音：C 大調五聲 C D E G A，從 C4 往上 16 個音
  var PENTA = ['C', 'D', 'E', 'G', 'A'];
  var TONES = [];
  for (var i = 0; i < 16; i++) TONES.push(PENTA[i % 5] + '-' + (4 + Math.floor(i / 5)));
  var SFX = {
    flash_move: { priority: 1, data: { p2: sq([['E-6', 2, 6, 2]]) } },
    flash_mark: { priority: 2, data: { p2: sq([['B-5', 3, 9, 2]]) } },
    flash_ok: { priority: 4, data: { p2: sq([['E-6', 3, 11, 2], ['A-6', 6, 10]]) } },
    flash_bad: { priority: 5, data: { p2: sq([['D#4', 6, 11, 0], ['D-4', 10, 9]]), noi: nz([[12, 6, 8]]) } },
    flash_level: { priority: 5, data: { p2: sq([['A-5', 3, 11, 2], ['C#6', 3, 11], ['E-6', 3, 11], ['A-6', 8, 10]]) } },
    flash_ready: { priority: 3, data: { p2: sq([['E-5', 6, 9, 2]]) } },
    flash_go: { priority: 4, data: { p2: sq([['E-6', 10, 11, 2]]) } },
    flash_replay: { priority: 3, data: { p2: sq([['G-5', 3, 9, 1], ['D-5', 3, 9], ['G-5', 6, 8]]) } },
    flash_win: { priority: 5, data: { p2: sq([['G-6', 3, 11, 2], ['B-6', 3, 11], ['D-7', 8, 10]]) } }
  };
  TONES.forEach(function (n, k) { SFX['flash_t' + k] = { priority: 4, data: { p2: sq([[n, 14, 11, 2]]) } }; });
  var SONGS = { flash_title: buildTitle(), flash_play: buildPlay(), flash_seq: buildSeq(), flash_race: buildRace(), flash_win: buildWin(), flash_lose: buildLose() };

  function drv(nes) { return (nes && nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, TONES: TONES, current: null, _nes: null,
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
  FL.Audio = Audio;
})();
