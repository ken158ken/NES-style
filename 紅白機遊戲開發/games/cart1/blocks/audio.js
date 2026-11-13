/*
 * games/cart1/blocks/audio.js — 《星塵方塊》音樂 / 音效（全部原創，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-2 cart1-break ｜ 只依賴 engine/music.js 欄位；**不用任何既有落塊遊戲配樂或民謠旋律**
 * （研究 09 §7.3：主旋律自寫、通用和弦進行可共用）。
 *
 * 曲目（每拍 4 row；BPM = 3600 / (speed × 4)）
 * | key           | 曲名         | speed | BPM   | 調 / 情緒 |
 * |---------------|--------------|-------|-------|-----------|
 * | blocks_a      | 星屑瀑布     | 6     | 150   | F 大調、切分上行，明快（遊戲 A） |
 * | blocks_b      | 月面散步     | 8     | 112.5 | D 多利安、慢搖擺（遊戲 B / 標題） |
 * | blocks_fast   | 星屑瀑布·急  | 5     | 180   | 同 A、場面堆高（≥ 15 列）時切換＝音樂即 UI（研究 13 ⑩） |
 * | blocks_over   | 落幕         | 9     | 100   | 下行收束（不 loop） |
 * | blocks_clear  | 完走         | 6     | 150   | 上行號角（不 loop） |
 *
 * 音效（只搶 p2 / noi，主旋律 p1 與三角波低音不被打斷）：
 *   blocks_over 9 > blocks_quad 8 > blocks_lvl 7 > blocks_line 6 > blocks_rise 5 > blocks_hold 4 >
 *   blocks_drop 4 > blocks_lock 3 > blocks_ok 3 > blocks_rot 2 > blocks_move 1 > blocks_menu 1
 */
(function (global) {
  'use strict';
  var CT = global.CT = global.CT || {};
  var B = CT.Blocks = CT.Blocks || {};

  function tokens(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }
  function mel(str, inst, vol, duty) {
    var t = tokens(str), out = [], i;
    for (i = 0; i < t.length; i++) {
      if (t[i] === '-') out.push(null);
      else if (t[i] === '=') out.push({ note: '===' });
      else { var r = { note: t[i], inst: inst, vol: vol }; if (duty !== undefined) r.duty = duty; out.push(r); }
    }
    return out;
  }
  var DR = {
    k: { note: 13, inst: 'kick', vol: 14, duty: 0 }, s: { note: 6, inst: 'snare', vol: 12, duty: 0 },
    h: { note: 2, inst: 'hat', vol: 9, duty: 0 }, o: { note: 3, inst: 'ohat', vol: 9, duty: 0 },
    t: { note: 9, inst: 'tom', vol: 12, duty: 0 }
  };
  function drm(str) {
    var t = tokens(str), out = [], i;
    for (i = 0; i < t.length; i++) out.push(DR[t[i]] || null);
    return out;
  }
  function arpBar(root, arp, n, step, vol) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push(i % step === 0 ? { note: root, inst: 'stab', vol: vol, duty: 1, arp: arp } : null);
    return out;
  }
  function echo(arr, d, vol) {
    var out = [], i, k;
    for (i = 0; i < arr.length; i++) out.push(null);
    for (i = 0; i + d < arr.length; i++) {
      var s = arr[i]; if (!s || !s.inst) continue;
      var r = {}; for (k in s) r[k] = s[k];
      r.inst = 'echo'; r.vol = vol; r.duty = 0; out[i + d] = r;
    }
    return out;
  }

  var INST = {
    lead: { vol: [14, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 12, duty: [2, 2, 1] },
    soft: { vol: [10, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 11, duty: [1], },
    echo: { vol: [7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 1, 0], duty: [0] },
    stab: { vol: [11, 9, 7, 5, 4, 3, 2, 1, 0], duty: [1] },
    pad: { vol: [7, 8, 8, 8, 7, 7, 7, 6], volLoop: 7, duty: [2] },
    bass: {},
    kick: { vol: [15, 13, 9, 5, 2, 0] },
    snare: { vol: [14, 12, 10, 8, 6, 4, 3, 2, 1, 0] },
    hat: { vol: [8, 4, 1, 0] },
    ohat: { vol: [8, 7, 6, 5, 4, 3, 2, 1, 0] },
    tom: { vol: [13, 11, 9, 7, 5, 3, 1, 0] }
  };
  var MAJ = [0, 4, 7], MIN = [0, 3, 7], MIN7 = [0, 3, 7, 10];

  function song(name, speed, bars, opt) {
    // bars: [{p1, p2, tri, noi}]（每軌 16 row 的陣列）→ engine/music.js 的 song 物件
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [] };
    var i, ch;
    for (i = 0; i < bars.length; i++) {
      var o = {};
      for (ch in bars[i]) {
        if (!Object.prototype.hasOwnProperty.call(bars[i], ch)) continue;
        var arr = bars[i][ch];
        if (arr.length !== 16) throw new Error('blocks song ' + name + ' bar ' + i + ' ' + ch + ' 長度 ' + arr.length);
        var pat = {}; pat[ch] = arr; s.patterns.push(pat); o[ch] = s.patterns.length - 1;
      }
      s.order.push(o);
    }
    s.playLoop = !(opt && opt.once);
    return s;
  }

  /* ---------------- 星屑瀑布（F 大調） ---------------- */
  var A_MEL = [
    'C-5 -   F-5 -   A-5 -   -   G-5 -   F-5 -   -   D-5 -   C-5 -  ',
    'D-5 -   F-5 -   A#5 -   -   A-5 -   G-5 -   -   -   -   -   -  ',
    'E-5 -   G-5 -   C-6 -   -   A#5 -   A-5 -   G-5 -   E-5 -   C-5',
    'F-5 -   -   -   A-5 -   C-6 -   D-6 -   C-6 -   A-5 -   -   -  ',
    'D-6 -   -   C-6 -   A#5 -   A-5 -   -   G-5 -   F-5 -   G-5 -  ',
    'A-5 -   -   G-5 -   F-5 -   E-5 -   -   C-5 -   D-5 -   E-5 -  ',
    'F-5 -   A-5 C-6 -   A-5 F-5 -   G-5 -   A#5 D-6 -   A#5 G-5 -  ',
    'A-5 -   -   -   G-5 -   -   -   F-5 -   -   -   -   -   -   -  '
  ];
  var A_CH = [['F-3', MAJ], ['G-3', MIN], ['C-3', MAJ], ['F-3', MAJ], ['A#2', MAJ], ['A-2', MIN], ['C-3', MAJ], ['F-3', MAJ]];
  var A_BASS = {
    'F-3': 'F-2 -   F-3 -   C-3 -   F-3 -   F-2 -   F-3 -   A-2 -   C-3 -  ',
    'G-3': 'G-2 -   G-3 -   D-3 -   G-3 -   G-2 -   A#2 -   D-3 -   G-2 -  ',
    'C-3': 'C-2 -   C-3 -   G-2 -   C-3 -   C-2 -   E-2 -   G-2 -   A#2 -  ',
    'A#2': 'A#1 -   A#2 -   F-2 -   A#2 -   A#1 -   D-2 -   F-2 -   A-2 -  ',
    'A-2': 'A-1 -   A-2 -   E-2 -   A-2 -   A-1 -   C-2 -   E-2 -   G-2 -  '
  };
  var A_DR = ['k - h - s - h k - k h - s - h h', 'k - h - s - h - k - h k s - o -'];
  function buildA(speed, name) {
    var bars = [], i;
    for (i = 0; i < 8; i++) {
      var m = mel(A_MEL[i], 'lead', 13, 2);
      bars.push({
        p1: m,
        p2: (i & 1) ? echo(m, 3, 6) : arpBar(A_CH[i][0], A_CH[i][1], 16, 2, 8),
        tri: mel(A_BASS[A_CH[i][0]], 'bass', 15),
        noi: drm(A_DR[i === 7 ? 1 : 0])
      });
    }
    return song(name, speed, bars);
  }

  /* ---------------- 月面散步（D 多利安） ---------------- */
  var B_MEL = [
    'D-5 -   -   E-5 F-5 -   A-5 -   -   -   G-5 -   F-5 -   E-5 -  ',
    'D-5 -   -   -   C-5 -   A-4 -   -   -   -   -   -   -   -   -  ',
    'F-5 -   -   G-5 A-5 -   C-6 -   -   -   B-5 -   A-5 -   G-5 -  ',
    'A-5 -   -   -   G-5 -   E-5 -   -   -   -   -   -   -   -   -  ',
    'D-6 -   -   C-6 A-5 -   -   G-5 F-5 -   -   E-5 D-5 -   -   -  ',
    'E-5 -   F-5 -   G-5 -   A-5 -   B-5 -   A-5 -   G-5 -   E-5 -  ',
    'F-5 -   -   E-5 D-5 -   -   C-5 D-5 -   -   E-5 F-5 -   A-5 -  ',
    'D-5 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  '
  ];
  var B_CH = [['D-3', MIN7], ['A-2', MIN], ['F-3', MAJ], ['C-3', MAJ], ['D-3', MIN7], ['G-2', MAJ], ['C-3', MAJ], ['D-3', MIN7]];
  var B_BASS = {
    'D-3': 'D-2 -   -   -   A-2 -   -   D-2 -   -   C-3 -   A-2 -   -   -  ',
    'A-2': 'A-1 -   -   -   E-2 -   -   A-1 -   -   G-2 -   E-2 -   -   -  ',
    'F-3': 'F-2 -   -   -   C-3 -   -   F-2 -   -   E-3 -   C-3 -   -   -  ',
    'C-3': 'C-2 -   -   -   G-2 -   -   C-2 -   -   A#2 -   G-2 -   -   -  ',
    'G-2': 'G-1 -   -   -   D-2 -   -   G-1 -   -   F-2 -   D-2 -   -   -  '
  };
  function buildB() {
    var bars = [], i;
    for (i = 0; i < 8; i++) {
      bars.push({
        p1: mel(B_MEL[i], 'soft', 12, 1),
        p2: [{ note: B_CH[i][0].replace(/(\d)$/, function (d) { return String(+d + 1); }), inst: 'pad', vol: 7, duty: 2, arp: B_CH[i][1] },
             null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        tri: mel(B_BASS[B_CH[i][0]], 'bass', 15),
        noi: drm(i === 7 ? 'k - - h - - h - t - - t - - h -' : 'k - - h - - h - s - - h - - h -')
      });
    }
    return song('月面散步', 8, bars);
  }

  /* ---------------- 短曲（不 loop） ---------------- */
  function buildOver() {
    return song('落幕', 9, [{
      p1: mel('A-4 -   -   -   G-4 -   -   -   F-4 -   E-4 -   D-4 -   -   -  ', 'lead', 12, 2),
      p2: mel('F-4 -   -   -   E-4 -   -   -   D-4 -   C#4 -   A-3 -   -   -  ', 'soft', 8, 1),
      tri: mel('D-2 -   -   -   C-2 -   -   -   A#1 -   A-1 -   D-1 -   -   -  ', 'bass', 15),
      noi: drm('k - - - - - - - k - - - t - - -')
    }], { once: true });
  }
  function buildClear() {
    return song('完走', 6, [{
      p1: mel('C-5 -   F-5 -   A-5 -   C-6 -   A#5 -   D-6 -   F-6 -   -   -  ', 'lead', 14, 2),
      p2: mel('A-4 -   C-5 -   F-5 -   A-5 -   F-5 -   A#5 -   D-6 -   -   -  ', 'soft', 9, 1),
      tri: mel('F-2 -   -   -   F-3 -   -   -   A#2 -   -   -   F-2 -   -   -  ', 'bass', 15),
      noi: drm('k - h - s - h - k - k - s - s s')
    }], { once: true });
  }

  /* ---------------- 音效 ---------------- */
  function sq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      for (j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], duty: e[3] === undefined ? 1 : e[3], retrigger: true } : {});
    }
    return out;
  }
  function nq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      for (j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], retrigger: true } : {});
    }
    out.push({ off: true });
    return out;
  }
  function fade(v, n) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push({ vol: Math.max(0, v - Math.round(v * i / n)) });
    out.push({ off: true });
    return out;
  }
  var PRI = {
    blocks_over: 9, blocks_quad: 8, blocks_lvl: 7, blocks_line: 6, blocks_rise: 5, blocks_hold: 4,
    blocks_drop: 4, blocks_lock: 3, blocks_ok: 3, blocks_rot: 2, blocks_move: 1, blocks_menu: 1
  };
  var SFX = {
    blocks_move: { data: { p2: sq([['E-6', 2, 7, 2]]).concat(fade(5, 2)) } },
    blocks_rot: { data: { p2: sq([['A-5', 2, 8, 2], ['D-6', 2, 8, 2]]).concat(fade(6, 2)) } },
    blocks_lock: { data: { noi: nq([[11, 2, 10], [13, 3, 6]]) } },
    blocks_drop: { data: { noi: nq([[7, 2, 13], [10, 3, 10], [13, 4, 6]]) } },
    blocks_hold: { data: { p2: sq([['G-5', 3, 9, 1], ['C-6', 3, 9, 1], ['G-5', 3, 7, 1]]).concat(fade(6, 3)) } },
    blocks_line: { data: { p2: sq([['C-6', 3, 11, 2], ['E-6', 3, 11, 2], ['G-6', 3, 12, 2], ['C-7', 5, 12, 2]]).concat(fade(10, 6)) } },
    blocks_quad: { data: { p2: sq([['F-5', 3, 12, 2], ['A-5', 3, 12, 2], ['C-6', 3, 12, 2], ['F-6', 3, 13, 2], ['A-6', 3, 13, 2], ['C-7', 8, 14, 2]]).concat(fade(12, 8)),
                           noi: nq([[3, 4, 12], [5, 4, 9], [8, 6, 6]]) } },
    blocks_lvl: { data: { p2: sq([['C-6', 4, 12, 1], ['G-6', 4, 12, 1], ['C-6', 4, 12, 1], ['G-6', 6, 13, 1]]).concat(fade(10, 6)) } },
    blocks_rise: { data: { noi: nq([[14, 4, 9], [12, 4, 10], [10, 4, 11], [8, 4, 9]]) } },
    blocks_over: { data: { p2: sq([['A-5', 4, 12, 2], ['E-5', 4, 11, 2], ['C-5', 4, 10, 2], ['A-4', 8, 10, 2]]).concat(fade(9, 8)),
                           noi: nq([[4, 4, 12], [8, 6, 9], [12, 8, 6]]) } },
    blocks_ok: { data: { p2: sq([['C-6', 3, 11, 1], ['G-6', 5, 12, 1]]).concat(fade(9, 4)) } },
    blocks_menu: { data: { p2: sq([['A-6', 2, 8, 1]]).concat(fade(6, 2)) } }
  };
  var k;
  for (k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) SFX[k].priority = PRI[k];

  var SONGS = {
    blocks_a: buildA(6, '星屑瀑布'),
    blocks_fast: buildA(5, '星屑瀑布·急'),
    blocks_b: buildB(),
    blocks_over: buildOver(),
    blocks_clear: buildClear()
  };

  /* ---------------- 播放介面 ---------------- */
  var defined = null;
  function drv(nes) { return (nes && nes.music) || (global.NES && global.NES.Music) || null; }
  B.Audio = {
    SONGS: SONGS, SFX: SFX, current: null, lastSfx: null,
    init: function (nes) {
      var d = drv(nes); if (!d || defined === d) return;
      for (var n in SFX) if (Object.prototype.hasOwnProperty.call(SFX, n)) { try { d.define(n, SFX[n]); } catch (e) { } }
      defined = d;
    },
    play: function (nes, key) {
      var d = drv(nes); if (!d || !SONGS[key]) return false;
      if (B.Audio.current === key) return true;
      try { d.play(SONGS[key], { loop: SONGS[key].playLoop }); B.Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function (nes) {
      var d = drv(nes); B.Audio.current = null;
      if (d) { try { d.stop(); } catch (e) { } }
    },
    sfx: function (nes, name) {
      var d = drv(nes); B.Audio.lastSfx = name;
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function (nes) { var d = drv(nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
})(typeof window !== 'undefined' ? window : this);
