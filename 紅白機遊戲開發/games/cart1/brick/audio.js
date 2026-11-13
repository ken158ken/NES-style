/*
 * games/cart1/brick/audio.js — 《星塵打磚塊》音樂 / 音效（全部原創，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-2 cart1-break ｜ 只依賴 engine/music.js 欄位。
 *
 * | key          | 曲名       | speed | BPM | 調 / 情緒 |
 * |--------------|------------|-------|-----|-----------|
 * | brick_main   | 星艇出擊   | 6     | 150 | G 混合利地安、明亮推進（第 1~9 回合） |
 * | brick_boss   | 蝕核       | 5     | 180 | E 弗里吉安、半音壓迫（第 10 回合） |
 * | brick_start  | 發進       | 6     | 150 | 回合開始號角（不 loop） |
 * | brick_clear  | 回合突破   | 6     | 150 | 上行收束（不 loop） |
 * | brick_over   | 墜落       | 9     | 100 | 下行（不 loop） |
 * | brick_end    | 黎明       | 7     | 129 | 魔王擊破後的結尾曲 |
 * 音效（只搶 p2 / noi）：brick_lose 9 > brick_1up 8 > brick_bossdie 8 > brick_cap 7 > brick_bosshit 6 >
 *   brick_fire 5 > brick_laser 4 > brick_brk 3 > brick_hard 3 > brick_hit 2 > brick_wall 1
 */
(function (global) {
  'use strict';
  var CT = global.CT = global.CT || {};
  var K = CT.Brick = CT.Brick || {};

  function tokens(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }
  function mel(str, inst, vol, duty) {
    var t = tokens(str), out = [], i;
    for (i = 0; i < t.length; i++) {
      if (t[i] === '-') out.push(null);
      else { var r = { note: t[i], inst: inst, vol: vol }; if (duty !== undefined) r.duty = duty; out.push(r); }
    }
    return out;
  }
  var DR = {
    k: { note: 13, inst: 'kick', vol: 14, duty: 0 }, s: { note: 6, inst: 'snare', vol: 12, duty: 0 },
    h: { note: 2, inst: 'hat', vol: 9, duty: 0 }, t: { note: 9, inst: 'tom', vol: 12, duty: 0 }
  };
  function drm(str) { var t = tokens(str), out = [], i; for (i = 0; i < t.length; i++) out.push(DR[t[i]] || null); return out; }
  function arpBar(root, arp, step, vol) {
    var out = [], i;
    for (i = 0; i < 16; i++) out.push(i % step === 0 ? { note: root, inst: 'stab', vol: vol, duty: 1, arp: arp } : null);
    return out;
  }
  var INST = {
    lead: { vol: [14, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 12, duty: [2, 2, 1] },
    soft: { vol: [10, 12, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [1] },
    stab: { vol: [11, 9, 7, 5, 4, 3, 2, 1, 0], duty: [1] },
    bass: {},
    kick: { vol: [15, 13, 9, 5, 2, 0] },
    snare: { vol: [14, 12, 10, 8, 6, 4, 3, 2, 1, 0] },
    hat: { vol: [8, 4, 1, 0] },
    tom: { vol: [13, 11, 9, 7, 5, 3, 1, 0] }
  };
  var MAJ = [0, 4, 7], MIN = [0, 3, 7];
  function song(name, speed, bars, once) {
    var s = { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: !once };
    for (var i = 0; i < bars.length; i++) {
      var o = {};
      for (var ch in bars[i]) {
        if (!Object.prototype.hasOwnProperty.call(bars[i], ch)) continue;
        if (bars[i][ch].length !== 16) throw new Error('brick song ' + name + ' bar ' + i + ' ' + ch + ' 長度 ' + bars[i][ch].length);
        var pat = {}; pat[ch] = bars[i][ch]; s.patterns.push(pat); o[ch] = s.patterns.length - 1;
      }
      s.order.push(o);
    }
    return s;
  }

  /* ---------------- 星艇出擊（G 混合利地安） ---------------- */
  var M_MEL = [
    'G-5 -   D-5 -   G-5 A-5 B-5 -   A-5 -   G-5 -   F-5 -   D-5 -  ',
    'C-5 -   -   D-5 -   F-5 -   -   E-5 -   C-5 -   D-5 -   -   -  ',
    'G-5 -   B-5 -   D-6 -   -   C-6 -   B-5 -   A-5 -   G-5 -   A-5',
    'F-5 -   -   -   G-5 -   A-5 -   -   -   -   -   -   -   -   -  ',
    'D-6 -   C-6 -   B-5 -   C-6 -   D-6 -   -   G-5 -   -   B-5 -  ',
    'C-6 -   B-5 -   A-5 -   B-5 -   C-6 -   -   F-5 -   -   A-5 -  ',
    'B-5 -   A-5 -   G-5 -   F-5 -   G-5 -   A-5 -   B-5 -   D-6 -  ',
    'G-5 -   -   -   -   -   D-5 -   G-5 -   -   -   -   -   -   -  '
  ];
  var M_CH = ['G', 'F', 'G', 'F', 'G', 'F', 'E', 'G'];
  var M_ROOT = { G: ['G-3', MAJ], F: ['F-3', MAJ], E: ['E-3', MIN] };
  var M_BASS = {
    G: 'G-2 -   G-3 -   D-3 -   G-2 -   G-2 -   G-3 -   F-2 -   D-2 -  ',
    F: 'F-2 -   F-3 -   C-3 -   F-2 -   F-2 -   F-3 -   A-2 -   C-3 -  ',
    E: 'E-2 -   E-3 -   B-2 -   E-2 -   E-2 -   E-3 -   D-3 -   B-2 -  '
  };
  function buildMain() {
    var bars = [], i;
    for (i = 0; i < 8; i++) {
      var c = M_ROOT[M_CH[i]];
      bars.push({
        p1: mel(M_MEL[i], 'lead', 13, 2),
        p2: arpBar(c[0], c[1], 2, 7),
        tri: mel(M_BASS[M_CH[i]], 'bass', 15),
        noi: drm(i === 7 ? 'k - h - s - h - k k h - s s s s' : 'k - h - s - h k - k h - s - h h')
      });
    }
    return song('星艇出擊', 6, bars);
  }

  /* ---------------- 蝕核（E 弗里吉安） ---------------- */
  var B_MEL = [
    'E-5 -   F-5 -   E-5 -   B-4 -   E-5 -   G-5 -   F-5 -   E-5 -  ',
    'D-5 -   E-5 -   F-5 -   -   E-5 -   D-5 -   C-5 -   B-4 -   -  ',
    'E-5 -   G-5 -   B-5 -   C-6 -   B-5 -   G-5 -   F-5 -   G-5 -  ',
    'E-5 -   -   -   F-5 -   -   -   E-5 -   -   -   -   -   -   -  '
  ];
  var B_BASS = 'E-2 E-2 E-3 E-2 E-2 E-2 F-2 E-2 E-2 E-2 E-3 E-2 G-2 E-2 F-2 E-2';
  function buildBoss() {
    var bars = [], i;
    for (i = 0; i < 4; i++) {
      bars.push({
        p1: mel(B_MEL[i], 'lead', 13, 1),
        p2: arpBar(i & 1 ? 'F-3' : 'E-3', i & 1 ? MAJ : MIN, 1, 6),
        tri: mel(B_BASS, 'bass', 15),
        noi: drm('k h s h k h s h k h s h k s s s')
      });
    }
    return song('蝕核', 5, bars);
  }
  function jingle(name, speed, p1, p2, tri, noi) {
    return song(name, speed, [{ p1: mel(p1, 'lead', 14, 2), p2: mel(p2, 'soft', 9, 1), tri: mel(tri, 'bass', 15), noi: drm(noi) }], true);
  }
  var SONGS = {
    brick_main: buildMain(),
    brick_boss: buildBoss(),
    brick_start: jingle('發進', 6,
      'D-5 -   G-5 -   B-5 -   D-6 -   C-6 -   A-5 -   B-5 -   -   -  ',
      'B-4 -   D-5 -   G-5 -   B-5 -   A-5 -   F-5 -   G-5 -   -   -  ',
      'G-2 -   -   -   G-2 -   -   -   F-2 -   -   -   G-2 -   -   -  ',
      'k - - - s - - - k - k - s - - -'),
    brick_clear: jingle('回合突破', 6,
      'G-5 -   B-5 -   D-6 -   G-6 -   F-6 -   D-6 -   G-6 -   -   -  ',
      'D-5 -   G-5 -   B-5 -   D-6 -   C-6 -   A-5 -   B-5 -   -   -  ',
      'G-2 -   -   -   D-3 -   -   -   F-2 -   -   -   G-2 -   -   -  ',
      'k - h - s - h - k - k - s s s -'),
    brick_over: jingle('墜落', 9,
      'B-4 -   -   -   A-4 -   -   -   G-4 -   F-4 -   E-4 -   -   -  ',
      'G-4 -   -   -   F-4 -   -   -   E-4 -   D-4 -   B-3 -   -   -  ',
      'E-2 -   -   -   D-2 -   -   -   C-2 -   B-1 -   E-1 -   -   -  ',
      'k - - - - - - - k - - - t - - -'),
    brick_end: song('黎明', 7, [
      { p1: mel('G-5 -   -   A-5 B-5 -   D-6 -   -   -   C-6 -   B-5 -   A-5 -  ', 'soft', 12, 2), p2: arpBar('G-3', MAJ, 4, 6),
        tri: mel('G-2 -   -   -   D-3 -   -   -   G-2 -   -   -   D-3 -   -   -  ', 'bass', 15), noi: drm('k - - - h - - - s - - - h - - -') },
      { p1: mel('C-6 -   -   B-5 A-5 -   G-5 -   -   -   A-5 -   F-5 -   -   -  ', 'soft', 12, 2), p2: arpBar('F-3', MAJ, 4, 6),
        tri: mel('F-2 -   -   -   C-3 -   -   -   F-2 -   -   -   C-3 -   -   -  ', 'bass', 15), noi: drm('k - - - h - - - s - - - h - - -') },
      { p1: mel('E-5 -   -   G-5 B-5 -   -   A-5 G-5 -   -   E-5 D-5 -   -   -  ', 'soft', 12, 2), p2: arpBar('E-3', MIN, 4, 6),
        tri: mel('E-2 -   -   -   B-2 -   -   -   E-2 -   -   -   B-2 -   -   -  ', 'bass', 15), noi: drm('k - - - h - - - s - - - h - - -') },
      { p1: mel('G-5 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  ', 'soft', 12, 2), p2: arpBar('G-3', MAJ, 8, 6),
        tri: mel('G-2 -   -   -   -   -   -   -   G-1 -   -   -   -   -   -   -  ', 'bass', 15), noi: drm('k - - - - - - - s - - - - - - -') }
    ])
  };

  function sq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) for (j = 0; j < list[i][1]; j++) out.push(j === 0 ? { note: list[i][0], vol: list[i][2], duty: list[i][3] === undefined ? 1 : list[i][3], retrigger: true } : {});
    return out;
  }
  function nq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) for (j = 0; j < list[i][1]; j++) out.push(j === 0 ? { note: list[i][0], vol: list[i][2], retrigger: true } : {});
    out.push({ off: true });
    return out;
  }
  function fade(v, n) { var out = [], i; for (i = 0; i < n; i++) out.push({ vol: Math.max(0, v - Math.round(v * i / n)) }); out.push({ off: true }); return out; }
  var PRI = { brick_lose: 9, brick_1up: 8, brick_bossdie: 8, brick_cap: 7, brick_bosshit: 6, brick_fire: 5, brick_laser: 4, brick_brk: 3, brick_hard: 3, brick_hit: 2, brick_wall: 1 };
  var SFX = {
    brick_hit: { data: { p2: sq([['G-5', 3, 10, 2]]).concat(fade(7, 3)) } },
    brick_wall: { data: { p2: sq([['D-5', 2, 7, 2]]).concat(fade(5, 2)) } },
    brick_brk: { data: { p2: sq([['B-5', 2, 10, 1], ['E-6', 3, 9, 1]]).concat(fade(7, 3)) } },
    brick_hard: { data: { p2: sq([['F-6', 2, 10, 0], ['F-6', 2, 6, 0]]).concat(fade(5, 3)) } },
    brick_cap: { data: { p2: sq([['C-6', 3, 12, 1], ['E-6', 3, 12, 1], ['G-6', 3, 12, 1], ['C-7', 5, 13, 1]]).concat(fade(10, 5)) } },
    brick_laser: { data: { p2: sq([['A-6', 2, 9, 0], ['E-6', 2, 8, 0], ['A-5', 2, 6, 0]]).concat(fade(5, 2)) } },
    brick_lose: { data: { p2: sq([['E-5', 4, 12, 2], ['C-5', 4, 11, 2], ['A-4', 4, 10, 2], ['E-4', 8, 10, 2]]).concat(fade(9, 8)),
                          noi: nq([[5, 6, 12], [8, 6, 9], [12, 8, 6]]) } },
    brick_1up: { data: { p2: sq([['G-5', 4, 12, 1], ['B-5', 4, 12, 1], ['D-6', 4, 12, 1], ['G-6', 8, 13, 1]]).concat(fade(10, 6)) } },
    brick_bosshit: { data: { noi: nq([[3, 3, 13], [6, 3, 10], [9, 4, 7]]) } },
    brick_bossdie: { data: { noi: nq([[15, 6, 14], [13, 6, 12], [11, 6, 11], [9, 8, 9], [7, 10, 6]]) } },
    brick_fire: { data: { p2: sq([['C-4', 3, 9, 3], ['G-3', 4, 8, 3]]).concat(fade(6, 3)) } }
  };
  for (var n in SFX) if (Object.prototype.hasOwnProperty.call(SFX, n)) SFX[n].priority = PRI[n];

  var defined = null;
  function drv(nes) { return (nes && nes.music) || (global.NES && global.NES.Music) || null; }
  K.Audio = {
    SONGS: SONGS, SFX: SFX, current: null, lastSfx: null,
    init: function (nes) {
      var d = drv(nes); if (!d || defined === d) return;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      defined = d;
    },
    play: function (nes, key) {
      var d = drv(nes); if (!d || !SONGS[key]) return false;
      try { d.play(SONGS[key], { loop: SONGS[key].playLoop }); K.Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function (nes) { var d = drv(nes); K.Audio.current = null; if (d) { try { d.stop(); } catch (e) { } } },
    sfx: function (nes, name) {
      var d = drv(nes); K.Audio.lastSfx = name;
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    tick: function (nes) { var d = drv(nes); if (d) { try { d.tick(); } catch (e) { } } },
    // R6：暫停 = driver pause（記住 row）、解除 = 從同一 row 接續（engine NES.Music.pause / resume）
    pauseKey: null,
    pause: function (nes) {
      var d = drv(nes), k = K.Audio.current;
      K.Audio.pauseKey = k; K.Audio.current = null;
      if (!d) return;
      try { if (k && d.pause) d.pause(); else d.stop(); } catch (e) { }
    },
    resume: function (nes) {                     // 回 true = 已接續；false = 呼叫端照舊重播
      var d = drv(nes), k = K.Audio.pauseKey;
      K.Audio.pauseKey = null;
      if (!d || !k || !d.isPaused || !d.isPaused()) return false;
      try { d.resume(); K.Audio.current = k; return true; } catch (e) { return false; }
    }
  };
})(typeof window !== 'undefined' ? window : this);
