/*
 * games/cart2/gallery/song.js — 《星塵射擊場》音樂 / 音效（全部原創，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-4 cart2-aim（R6）｜ 依賴：engine/music.js
 * 契約：CT.Gallery.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX }
 *
 * | key            | 曲名     | speed | 小節 | 說明 |
 * |----------------|----------|-------|------|------|
 * | gallery_title  | 靜軌道   | 8     | 4    | 標題；A 小調慢板，p1 長音 / p2 分解和弦 / tri 根音 |
 * | gallery_range  | 光靶演習 | 6     | 8    | 遊玩；D 多利安，p1 切分 / p2 低八度回聲 / tri 走句 / noi 輕鼓 |
 * | gallery_clear  | 合格     | 6     | 1    | 關卡合格 / 結算（不 loop） |
 * | gallery_over   | 散光     | 8     | 1    | GAME OVER（不 loop） |
 * 音效（只搶 p2 / noi）：gallery_shot / hit / bull / miss / tick / lock / wrong / move / ok
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var GA = CT.Gallery = CT.Gallery || {};

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
      'E-5 -   -   -   -   -   A-4 -   C-5 -   -   -   B-4 -   -   -',
      'G-4 -   -   -   A-4 -   B-4 -   E-5 -   -   -   -   -   -   -',
      'F-5 -   -   -   E-5 -   -   -   C-5 -   D-5 -   E-5 -   -   -',
      'D-5 -   -   -   B-4 -   -   -   A-4 -   -   -   =   -   -   -'
    ];
    var C = [['A-3', MIN], ['E-3', SUS], ['F-3', MAJ], ['E-3', MAJ]];
    return song('靜軌道（gallery_title）', 8, M.map(function (m, i) {
      return { p1: mel(m, 'pad', 11, 2), p2: arpeg(C[i][0].replace('-3', '-4'), C[i][1], 7),
               tri: mel(C[i][0].replace('-3', '-2') + ' - - - - - - - ' + C[i][0] + ' - - - - - - -', 'bass', 15, 0), noi: fit([]) };
    }), true);
  }
  function buildRange() {
    var M = [
      'D-5 -   F-5 -   A-5 -   G-5 F-5 -   E-5 -   D-5 -   C-5 -',
      'D-5 -   -   -   A-4 -   C-5 -   D-5 -   -   E-5 F-5 -   -   -',
      'G-5 -   F-5 -   E-5 -   C-5 -   D-5 E-5 -   F-5 -   G-5 -',
      'A-5 -   -   -   G-5 -   E-5 -   D-5 -   -   -   -   -   -   -',
      'F-5 -   A-5 -   C-6 -   B-5 A-5 -   G-5 -   F-5 -   E-5 -',
      'F-5 -   -   -   C-5 -   D-5 -   F-5 -   -   G-5 A-5 -   -   -',
      'B-5 -   A-5 -   G-5 -   E-5 -   F-5 -   G-5 -   A-5 -   C-6 -',
      'D-6 -   -   -   A-5 -   F-5 -   D-5 -   -   -   =   -   -   -'
    ];
    var B = ['D-2 - D-3 - A-2 - D-3 - C-2 - C-3 - A-2 - C-3 -', 'D-2 - D-3 - A-2 - D-3 - G-2 - A-2 - B-2 - C-3 -',
             'G-2 - G-3 - D-3 - G-3 - C-2 - C-3 - G-2 - C-3 -', 'D-2 - D-3 - A-2 - D-3 - A-1 - A-2 - E-2 - A-2 -',
             'F-2 - F-3 - C-3 - F-3 - E-2 - E-3 - B-2 - E-3 -', 'F-2 - F-3 - C-3 - F-3 - G-2 - G-3 - D-3 - G-3 -',
             'G-2 - G-3 - D-3 - G-3 - A-2 - A-3 - E-3 - A-3 -', 'D-2 - D-3 - A-2 - D-3 - D-2 - - - = - - -'];
    return song('光靶演習（gallery_range）', 6, M.map(function (m, i) {
      return { p1: mel(m, 'lead', 11, 2), p2: [null, null].concat(mel(m.replace(/-5/g, '-4').replace(/-6/g, '-5'), 'echo', 7, 1).slice(0, 14)),
               tri: mel(B[i], 'bass', 15, 0), noi: drm('k - h - s - h h k - h - s - h -') };
    }), true);
  }
  function buildClear() {
    return song('合格（gallery_clear）', 6, [{
      p1: mel('D-5 F-5 A-5 D-6 -   A-5 -   D-6 -   -   -   -   =   -   -   -', 'lead', 12, 2),
      p2: mel('A-4 D-5 F-5 A-5 -   F-5 -   A-5 -   -   -   -   =   -   -   -', 'echo', 8, 1),
      tri: mel('D-3 -   -   -   A-2 -   D-3 -   -   -   -   -   =   -   -   -', 'bass', 15, 0),
      noi: drm('k - - - k - k - - - - - - - - -')
    }], false);
  }
  function buildOver() {
    return song('散光（gallery_over）', 8, [{
      p1: mel('A-4 -   G-4 -   E-4 -   D-4 -   C-4 -   -   -   =   -   -   -', 'pad', 11, 2),
      p2: mel('C-4 -   B-3 -   G-3 -   F-3 -   E-3 -   -   -   =   -   -   -', 'echo', 8, 1),
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
  var SFX = {
    gallery_shot: { priority: 2, data: { noi: nz([[4, 2, 12], [7, 2, 8], [10, 2, 4]]) } },
    gallery_hit: { priority: 4, data: { p2: sq([['A-5', 2, 11, 2], ['E-6', 4, 10]]), noi: nz([[3, 2, 10], [6, 3, 5]]) } },
    gallery_bull: { priority: 5, data: { p2: sq([['E-6', 2, 12, 2], ['A-6', 2, 12], ['C#7', 2, 12], ['E-7', 6, 10]]) } },
    gallery_miss: { priority: 3, data: { p2: sq([['C-4', 3, 9, 0], ['A-3', 5, 7]]) } },
    gallery_tick: { priority: 1, data: { p2: sq([['B-6', 1, 7, 2]]) } },
    gallery_lock: { priority: 1, data: { p2: sq([['E-6', 1, 6, 2], ['G#6', 1, 5]]) } },
    gallery_wrong: { priority: 4, data: { p2: sq([['F-4', 4, 11, 0], ['C-4', 6, 10]]) } },
    gallery_move: { priority: 2, data: { p2: sq([['A-5', 2, 8, 2]]) } },
    gallery_ok: { priority: 3, data: { p2: sq([['D-6', 2, 10, 2], ['A-6', 4, 10]]) } }
  };
  var SONGS = { gallery_title: buildTitle(), gallery_range: buildRange(), gallery_clear: buildClear(), gallery_over: buildOver() };

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
  GA.Audio = Audio;
})();
