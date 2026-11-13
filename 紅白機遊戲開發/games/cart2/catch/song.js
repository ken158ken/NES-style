/*
 * games/cart2/catch/song.js — 《星塵接球》音樂 / 音效（全部原創旋律，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-3 cart2-pop（R6）｜ 依賴：engine/music.js（R6 起有 pause / resume；沒有就退回 stop + from 小節）
 * 契約：CT.Catch.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current }
 *
 * | key          | 曲名       | speed | 小節 | 說明 |
 * |--------------|------------|-------|------|------|
 * | catch_title  | 拾星小調   | 7     | 8    | 標題 + 接星模式；F 大調，p1 三拍跳音旋律 / p2 反拍和弦 / tri 行進低音 |
 * | catch_keep   | 不落地     | 6     | 8    | 頂球 + 彈跳模式；A 小調 → C 大調，p1 上行琶音動機 / p2 回音 / noi 輕快鼓 |
 * | catch_over   | 落地了     | 8     | 1    | GAME OVER / 結算（不 loop） |
 * 音效（只搶 p2 / noi）：catch_get / gold / bad / miss / bounce / hit / level / spring / pop / clear
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var CA = CT.Catch = CT.Catch || {};
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
  var DR = { k: { note: 12, inst: 'kick', vol: 13, duty: 0 }, s: { note: 6, inst: 'snare', vol: 11, duty: 0 },
             h: { note: 1, inst: 'hat', vol: 7, duty: 0 } };
  function drm(str) { return fit(tok(str).map(function (t) { return DR[t] || null; })); }
  function offbeat(root, arp, vol) {        // 反拍和弦：每 4 row 的第 2、4 拍
    var out = [];
    for (var i = 0; i < 16; i++) out.push((i % 4 === 2) ? { note: root, inst: 'stab', vol: vol, duty: 2, arp: [arp[(i >> 2) % arp.length]] } : null);
    return out;
  }
  var INST = {
    lead: { vol: [12, 12, 11, 10, 9, 9, 8, 8, 7], volLoop: 8, duty: [2] },
    hop: { vol: [13, 10, 8, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    stab: { vol: [8, 6, 4, 2, 1, 0], duty: [2] },
    echo: { vol: [6, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 11, 7, 3, 0] },
    snare: { vol: [12, 10, 8, 6, 4, 2, 0] },
    hat: { vol: [5, 3, 1, 0] }
  };
  var MAJ = [0, 4, 7], MIN = [0, 3, 7];
  function song(name, speed, bars, loop) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: loop };
    bars.forEach(function (b) { s.order.push(s.patterns.length); s.patterns.push(b); });
    return s;
  }

  // ---- 拾星小調（F 大調；三連跳音的「撿起來」動機，原創）----
  function buildTitle() {
    var M = [
      'C-5 -   C-5 F-5 -   A-5 -   -   G-5 -   F-5 -   E-5 -   C-5 -',
      'D-5 -   D-5 G-5 -   A#5 -   -   A-5 -   G-5 -   F-5 -   -   -',
      'C-5 -   C-5 F-5 -   A-5 -   -   C-6 -   A-5 -   F-5 -   A-5 -',
      'G-5 -   -   -   E-5 -   F-5 -   G-5 -   -   -   =   -   -   -',
      'A-5 -   A-5 C-6 -   A-5 -   F-5 A#5 -   A-5 -   G-5 -   F-5 -',
      'G-5 -   G-5 A#5 -   G-5 -   E-5 A-5 -   G-5 -   F-5 -   E-5 -',
      'F-5 -   A-5 -   C-6 -   D-6 -   C-6 -   A#5 -   A-5 -   G-5 -',
      'F-5 -   -   -   C-5 -   -   -   F-5 -   -   -   =   -   -   -'
    ];
    var C = [['F-3', MAJ], ['G-3', MIN], ['F-3', MAJ], ['C-3', MAJ], ['F-3', MAJ], ['C-3', MAJ], ['A#2', MAJ], ['F-3', MAJ]];
    var BL = {
      'F-3': 'F-2 -   -   -   C-3 -   -   -   F-2 -   -   -   A-2 -   -   -',
      'G-3': 'G-2 -   -   -   D-3 -   -   -   G-2 -   -   -   A#2 -   -   -',
      'C-3': 'C-2 -   -   -   G-2 -   -   -   C-2 -   -   -   E-2 -   -   -',
      'A#2': 'A#1 -   -   -   F-2 -   -   -   A#1 -   -   -   D-2 -   -   -'
    };
    return song('拾星小調（catch_title）', 7, M.map(function (m, i) {
      return { p1: mel(m, 'hop', 12, 1), p2: offbeat(C[i][0].replace('-3', '-4').replace('-2', '-3'), C[i][1], 8),
               tri: mel(BL[C[i][0]], 'bass', 15, 0), noi: drm('k - h - s - h - k - h - s - h h') };
    }), true);
  }
  // ---- 不落地（A 小調；上行琶音「再頂一次」動機，原創）----
  function buildKeep() {
    var M = [
      'A-4 C-5 E-5 -   A-5 -   G-5 E-5 -   D-5 -   E-5 -   -   -   -',
      'F-4 A-4 C-5 -   F-5 -   E-5 C-5 -   B-4 -   C-5 -   -   -   -',
      'G-4 B-4 D-5 -   G-5 -   F-5 D-5 -   C-5 -   D-5 -   E-5 -   G-5',
      'E-5 -   -   -   -   -   D-5 -   C-5 -   B-4 -   =   -   -   -',
      'C-5 E-5 G-5 -   C-6 -   B-5 G-5 -   A-5 -   G-5 -   -   E-5 -',
      'F-5 -   E-5 -   D-5 -   C-5 -   D-5 -   E-5 -   F-5 -   G-5 -',
      'A-5 -   G-5 -   E-5 -   C-5 -   D-5 -   -   E-5 -   C-5 -   -',
      'A-4 -   -   -   E-5 -   -   -   A-5 -   -   -   =   -   -   -'
    ];
    var BL = ['A-2', 'F-2', 'G-2', 'E-2', 'C-2', 'F-2', 'G-2', 'A-2'];
    return song('不落地（catch_keep）', 6, M.map(function (m, i) {
      var b = BL[i], o = b.replace('-2', '-3');
      return { p1: mel(m, 'lead', 12, 2), p2: [null, null].concat(mel(m, 'echo', 7, 1).slice(0, 14)),
               tri: mel(b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -', 'bass', 15, 0),
               noi: drm('k - h h s - h - k h h - s - h s') };
    }), true);
  }
  function buildOver() {
    return song('落地了（catch_over）', 8, [{
      p1: mel('E-5 -   C-5 -   A-4 -   B-4 -   G#4 -   A-4 -   -   =   -', 'lead', 12, 2),
      p2: mel('C-4 -   A-3 -   E-3 -   E-3 -   D-3 -   C-3 -   -   =   -', 'echo', 9, 1),
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
    catch_get: { priority: 3, data: { p2: sq([['A-5', 2, 10, 2], ['E-6', 4, 10]]) } },
    catch_gold: { priority: 4, data: { p2: sq([['C-6', 2, 11, 2], ['E-6', 2, 11], ['G-6', 2, 11], ['C-7', 6, 10]]) } },
    catch_bad: { priority: 7, data: { p2: sq([['D-4', 3, 13, 0], ['A-3', 3, 12], ['D-3', 8, 10]]), noi: nz([[4, 4, 12], [8, 6, 8]]) } },
    catch_miss: { priority: 5, data: { p2: sq([['E-5', 3, 10, 1], ['C-5', 3, 9], ['A-4', 6, 8]]) } },
    catch_bounce: { priority: 2, data: { p2: sq([['G-4', 1, 10, 2], ['D-5', 3, 9]]) } },
    catch_hit: { priority: 2, data: { noi: nz([[5, 2, 10], [7, 2, 6]]) } },
    catch_level: { priority: 6, data: { p2: sq([['F-5', 3, 12, 2], ['A-5', 3, 12], ['C-6', 3, 12], ['F-6', 8, 11]]) } },
    catch_spring: { priority: 4, data: { p2: sq([['C-5', 1, 11, 2], ['G-5', 1, 11], ['C-6', 1, 11], ['G-6', 4, 10]]) } },
    catch_pop: { priority: 7, data: { p2: sq([['C-6', 2, 12, 0], ['F#5', 2, 11], ['C-5', 3, 10], ['F#4', 6, 8]]), noi: nz([[2, 4, 12], [5, 8, 8]]) } },
    catch_clear: { priority: 6, data: { p2: sq([['C-6', 4, 12, 2], ['G-5', 4, 12], ['C-6', 4, 12], ['E-6', 4, 12], ['G-6', 10, 11]]) } }
  };
  var SONGS = { catch_title: buildTitle(), catch_keep: buildKeep(), catch_over: buildOver() };

  function drv(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; Audio._paused = null;
      var d = drv(nes);
      if (!d) return false;
      for (var key in SFX) if (Object.prototype.hasOwnProperty.call(SFX, key)) { try { d.define(key, SFX[key]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      var st = null; try { st = d.state ? d.state() : null; } catch (e) { st = null; }
      if (Audio.current === key && !Audio._paused && st && st.playing) return true;
      Audio._paused = null;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name] || Audio._paused) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    // 暫停（§6-2）：engine R6 有 pause/resume 就用（同一 row 接續）；沒有就記小節、stop、resume 時 from 該小節
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || !Audio.current || Audio._paused) return false;
      if (typeof d.pause === 'function' && typeof d.resume === 'function') {
        try { if (d.stopSfx) d.stopSfx(); d.pause(); Audio._paused = { key: Audio.current, engine: true }; return true; } catch (e) { }
      }
      var st = null; try { st = d.state ? d.state() : d; } catch (e) { st = d; }
      Audio._paused = { key: Audio.current, from: st && st.playing ? (st.orderIndex || 0) : -1 };
      try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { }
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused, s = p && SONGS[p.key];
      Audio._paused = null;
      if (!d || !s) return false;
      if (p.engine) { try { d.resume(); return true; } catch (e) { return false; } }
      if (p.from < 0) return false;
      try { d.play(s, { loop: s.playLoop, from: p.from % s.order.length }); Audio.current = p.key; return true; } catch (e) { return false; }
    },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  CA.Audio = Audio;
})();
