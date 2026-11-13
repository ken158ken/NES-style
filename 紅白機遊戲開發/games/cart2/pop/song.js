/*
 * games/cart2/pop/song.js — 《星塵泡泡》音樂 / 音效（全部原創旋律，只走 2A03）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-3 cart2-pop（R6）｜ 依賴：engine/music.js（R6 起有 pause / resume；沒有就退回 stop + from 小節）
 * 契約：CT.Pop.Audio = { init(nes), play(key), stop(), pause(), resume(), sfx(name), tick(), SONGS, SFX, current }
 *
 * | key        | 曲名       | speed | 小節 | 說明 |
 * |------------|------------|-------|------|------|
 * | pop_title  | 泡泡華爾滋 | 6     | 8    | 標題 + 戳泡泡；D 大調 3/4 感（每小節 12 row 一句 + 4 row 呼吸），p1 圓滑旋律 / p2 三度和聲 / tri 根音 |
 * | pop_rush   | 槌子進行曲 | 5     | 8    | 氣球射擊 + 打地鼠；G 小調 → B♭ 大調，p1 斷奏 / p2 反拍 / noi 進行鼓 |
 * | pop_over   | 時間到     | 7     | 1    | 結算（不 loop） |
 * 音效（只搶 p2 / noi）：pop_pop / chain / ice / shot / burst / bad / whack / whiff / stun / level / move
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var PO = CT.Pop = CT.Pop || {};
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

  // ---- 泡泡華爾滋（D 大調；「浮起來 → 破掉」的上行 + 跳下動機，原創）----
  function buildTitle() {
    var M = [
      'D-5 -   E-5 -   F#5 -   A-5 -   -   -   D-6 -   -   -   -   -',
      'C#6 -   B-5 -   A-5 -   G-5 -   -   -   E-5 -   -   -   -   -',
      'G-5 -   A-5 -   B-5 -   D-6 -   -   -   B-5 -   -   -   -   -',
      'A-5 -   G-5 -   F#5 -   E-5 -   -   -   =   -   -   -   -   -',
      'F#5 -   G-5 -   A-5 -   F#6 -   -   -   E-6 -   D-6 -   -   -',
      'E-6 -   D-6 -   C#6 -   B-5 -   -   -   A-5 -   -   -   -   -',
      'B-5 -   C#6 -   D-6 -   B-5 -   -   -   G-5 -   E-5 -   -   -',
      'D-5 -   -   -   A-4 -   -   -   D-5 -   -   -   =   -   -   -'
    ];
    var H = ['F#4', 'E-4', 'G-4', 'C#4', 'A-4', 'G-4', 'G-4', 'F#4'];
    var BL = ['D-2', 'A-2', 'G-2', 'A-2', 'D-2', 'A-2', 'G-2', 'D-2'];
    return song('泡泡華爾滋（pop_title）', 6, M.map(function (m, i) {
      var h = H[i];
      return { p1: mel(m, 'lead', 12, 2),
               p2: mel(h + ' -   -   -   ' + h + ' -   -   -   ' + h + ' -   -   -   -   -   -   -', 'stab', 7, 1),
               tri: mel(BL[i] + ' -   -   -   ' + BL[i].replace('-2', '-3') + ' -   -   -   ' + BL[i] + ' -   -   -   -   -   -   -', 'bass', 15, 0),
               noi: drm('k - - - h - - - h - - - - - h -') };
    }), true);
  }
  // ---- 槌子進行曲（G 小調；四分音符斷奏「咚 咚 咚 敲」，原創）----
  function buildRush() {
    var M = [
      'G-4 -   G-4 -   A#4 -   D-5 -   C-5 -   A#4 -   A-4 -   -   -',
      'G-4 -   G-4 -   A#4 -   D-5 -   F-5 -   -   -   D-5 -   -   -',
      'D#5 -   D#5 -   D-5 -   C-5 -   A#4 -   C-5 -   D-5 -   -   -',
      'C-5 -   A-4 -   F#4 -   A-4 -   G-4 -   -   -   =   -   -   -',
      'A#4 -   D-5 -   F-5 -   A#5 -   A-5 -   F-5 -   D-5 -   F-5 -',
      'G-5 -   F-5 -   D#5 -   D-5 -   C-5 -   D-5 -   D#5 -   -   -',
      'D-5 -   F#5 -   A-5 -   D-6 -   C-6 -   A-5 -   F#5 -   A-5 -',
      'G-5 -   -   -   D-5 -   -   -   G-4 -   -   -   =   -   -   -'
    ];
    var BL = ['G-2', 'G-2', 'D#2', 'D-2', 'A#1', 'D#2', 'D-2', 'G-2'];
    return song('槌子進行曲（pop_rush）', 5, M.map(function (m, i) {
      var b = BL[i], o = b.replace('-2', '-3').replace('-1', '-2').replace('#2', '#3').replace('#1', '#2');
      return { p1: mel(m, 'hop', 12, 2),
               p2: offbeat(o.replace('-3', '-4').replace('#3', '#4').replace('-2', '-3').replace('#2', '#3'), i === 4 || i === 6 ? MAJ : MIN, 7),
               tri: mel(b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -   ' + b + ' -   ' + o + ' -', 'bass', 15, 0),
               noi: drm('k - h - s - h - k - k - s - h s') };
    }), true);
  }
  function buildOver() {
    return song('時間到（pop_over）', 7, [{
      p1: mel('A-5 -   F#5 -   D-5 -   E-5 -   C#5 -   D-5 -   -   =   -', 'lead', 12, 2),
      p2: mel('F#4 -   D-4 -   A-3 -   G-3 -   E-3 -   F#3 -   -   =   -', 'echo', 9, 1),
      tri: mel('D-2 -   -   -   G-2 -   -   -   A-2 -   -   -   D-2 -   =   -', 'bass', 15, 0),
      noi: drm('k - - - - - - - k - - - s - - -')
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
    pop_pop: { priority: 3, data: { p2: sq([['G-6', 1, 10, 2], ['C-7', 2, 9]]), noi: nz([[1, 2, 7]]) } },
    pop_chain: { priority: 4, data: { p2: sq([['E-6', 2, 11, 2], ['A-6', 2, 11], ['C#7', 4, 10]]) } },
    pop_ice: { priority: 3, data: { p2: sq([['B-6', 1, 9, 0], ['F#6', 3, 8]]), noi: nz([[0, 2, 9]]) } },
    pop_shot: { priority: 2, data: { noi: nz([[3, 2, 11], [6, 3, 6]]) } },
    pop_burst: { priority: 4, data: { p2: sq([['C-6', 1, 11, 2], ['G-5', 2, 10]]), noi: nz([[2, 3, 12], [5, 4, 7]]) } },
    pop_bad: { priority: 7, data: { p2: sq([['D#4', 4, 13, 0], ['D-4', 4, 12], ['C#4', 8, 10]]) } },
    pop_whack: { priority: 4, data: { p2: sq([['C-5', 1, 12, 2], ['G-5', 3, 11]]), noi: nz([[4, 2, 13], [7, 3, 8]]) } },
    pop_whiff: { priority: 2, data: { noi: nz([[9, 2, 6], [11, 3, 3]]) } },
    pop_stun: { priority: 6, data: { p2: sq([['A-5', 3, 11, 1], ['E-5', 3, 11], ['A-5', 3, 11], ['E-5', 6, 9]]) } },
    pop_level: { priority: 6, data: { p2: sq([['D-6', 3, 12, 2], ['F#6', 3, 12], ['A-6', 3, 12], ['D-7', 8, 11]]) } },
    pop_move: { priority: 1, data: { p2: sq([['A-5', 1, 6, 2]]) } }
  };
  var SONGS = { pop_title: buildTitle(), pop_rush: buildRush(), pop_over: buildOver() };

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
  PO.Audio = Audio;
})();
