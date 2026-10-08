/*
 * games/star/song_w3.js — 《星塵勇者》世界 3 的四首原創曲（swamp / grove / hollow / boss3）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w3 agent（R4 F4-1）｜依賴：games/star/song.js（ST.Audio.BUILD / register）
 * 契約：docs/R4_BRIEF.md F4-1；`ST.Audio.play(key)` 缺鍵時 main.js 自動退回既有曲。
 *
 * | key    | 曲名           | 調 / BPM     | 小節 | 情緒 | 聲道配置 |
 * |--------|----------------|--------------|------|------|----------|
 * | swamp  | 霧沼的呼吸     | A 小調 / 112 | 16   | 潮濕、留白多 | p1 疏朗旋律 / p2 延遲回音 / tri 長踏板 / noi 水滴 hat |
 * | grove  | 古樹的年輪     | D 多利安 / 129 | 16 | 行進、往上爬 | p1 旋律 / p2 和弦琶音 / tri 行走低音 / noi 木質鼓 |
 * | hollow | 樹心的低語     | E 小調 / 90  | 16   | 空洞、不安 | p1 單音長句 / p2 五度長音 / tri 半音下行低音 / noi 極疏低鳴 |
 * | boss3  | 樹心魔         | A 小調 / 180 | 16   | 壓迫、纏繞 | p1 16 分纏繞句 / p2 回音 / tri 踏板 / noi 疾走 |
 *
 * 魔王房要用 `boss3`：main.js 的 `bossSong()` 插入一行「world 3 ⇒ boss3」（與 F4-2 的 boss4 同樣式）。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var A = ST.Audio;
  if (!A || !A.BUILD || !A.register) throw new Error('games/star/song_w3.js 需要 games/star/song.js（有 BUILD）');
  var B = A.BUILD;
  var Builder = B.Builder, mel = B.mel, drm = B.drm, echoOf = B.echoOf, stab = B.stab, hold = B.hold;
  var INST = B.INST, MIN = B.MIN, MAJ = B.MAJ, DIM = B.DIM;

  /* ============================================================ 1. swamp */
  function buildSwamp() {
    var b = new Builder('霧沼的呼吸（swamp）', 8, 16, null);
    var LINE = [
      'A-4 -   -   C-5 -   -   B-4 -   A-4 -   -   -   E-4 -   -   -  ',
      'C-5 -   -   E-5 -   -   D-5 -   C-5 -   -   -   A-4 -   -   -  ',
      'F-4 -   A-4 -   C-5 -   -   -   A-4 -   F-4 -   -   -   -   -  ',
      'G-4 -   B-4 -   D-5 -   -   -   B-4 -   G-4 -   -   -   -   -  ',
      'A-4 -   C-5 -   E-5 -   C-5 -   B-4 -   A-4 -   G-4 -   E-4 -  ',
      'D-5 -   -   F-5 -   -   E-5 -   D-5 -   A-4 -   -   -   -   -  ',
      'E-5 -   D-5 -   C-5 -   B-4 -   G#4 -   B-4 -   E-5 -   -   -  ',
      'A-4 -   -   -   E-4 -   -   -   A-3 -   -   -   -   -   -   -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'lead', 13, 2);
      p1.push(b.add('p1', 'm' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 3, { inst: 'echo', vol: 7, duty: 0 })));
    }
    var BASS = [
      'A-2 -   -   -   -   -   -   -   A-2 -   -   -   E-2 -   -   -  ',
      'A-2 -   -   -   -   -   -   -   C-3 -   -   -   E-2 -   -   -  ',
      'F-2 -   -   -   -   -   -   -   C-3 -   -   -   A-2 -   -   -  ',
      'G-2 -   -   -   -   -   -   -   D-3 -   -   -   B-2 -   -   -  ',
      'A-2 -   -   -   E-2 -   -   -   A-2 -   -   -   C-3 -   -   -  ',
      'D-2 -   -   -   A-2 -   -   -   D-3 -   -   -   A-2 -   -   -  ',
      'E-2 -   -   -   B-2 -   -   -   E-3 -   -   -   G#2 -   -   -  ',
      'A-2 -   -   -   E-2 -   -   -   A-1 -   -   -   -   -   -   -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    // 水滴：hat 打在反拍的奇數位，大鼓只在每小節第一拍
    var dA = b.add('noi', 'A', drm('k -   -   h   -   -   h -   k -   -   -   -   h   -   -  '));
    var dB = b.add('noi', 'B', drm('k -   -   h   -   h -   -   k -   -   h   s:9 -   h -  '));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 3 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 2. grove */
  function buildGrove() {
    var b = new Builder('古樹的年輪（grove）', 7, 16, null);
    var LINE = [
      'D-4 -   F-4 -   A-4 -   D-5 -   C-5 -   A-4 -   F-4 -   A-4 -  ',
      'D-5 -   C-5 -   A-4 -   F-4 -   G-4 -   A-4 -   D-5 -   -   -  ',
      'F-4 -   A-4 -   C-5 -   F-5 -   E-5 -   C-5 -   A-4 -   C-5 -  ',
      'C-5 -   E-5 -   G-5 -   E-5 -   C-5 -   G-4 -   E-4 -   G-4 -  ',
      'D-5 -   -   F-5 -   E-5 -   D-5 -   C-5 -   A-4 -   F-4 -   -  ',
      'A#4 -   D-5 -   F-5 -   D-5 -   A#4 -   F-4 -   D-4 -   F-4 -  ',
      'A-4 -   C#5 -   E-5 -   A-5 -   G-5 -   E-5 -   C#5 -   E-5 -  ',
      'D-5 -   A-4 -   F-4 -   D-4 -   -   -   -   -   D-4 -   -   -  '
    ];
    var p1 = [], i;
    for (i = 0; i < LINE.length; i++) p1.push(b.add('p1', 'm' + i, mel(LINE[i], 'lead', 14, 2)));
    var CH = {
      Dm: { p2: b.add('p2', 'Dm', stab('D-4', MIN, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Dm', mel('D-2 -   A-2 -   D-2 -   F-2 -   D-2 -   A-2 -   D-2 -   A-2 -  ', 'bass', 15, 0)) },
      F: { p2: b.add('p2', 'F', stab('F-3', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'F', mel('F-1 -   C-2 -   F-1 -   A-1 -   F-1 -   C-2 -   F-1 -   C-2 -  ', 'bass', 15, 0)) },
      C: { p2: b.add('p2', 'C', stab('C-4', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'C', mel('C-2 -   G-2 -   C-2 -   E-2 -   C-2 -   G-2 -   C-2 -   G-2 -  ', 'bass', 15, 0)) },
      Bb: { p2: b.add('p2', 'Bb', stab('A#3', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Bb', mel('A#1 -   F-2 -   A#1 -   D-2 -   A#1 -   F-2 -   A#1 -   F-2 -  ', 'bass', 15, 0)) },
      A: { p2: b.add('p2', 'A', stab('A-3', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'A', mel('A-1 -   E-2 -   A-1 -   C#2 -   A-1 -   E-2 -   A-1 -   E-2 -  ', 'bass', 15, 0)) }
    };
    // 木質鼓：中鼓 + 閉合 hat（像敲樹幹）
    var dA = b.add('noi', 'A', drm('t -   h -   s -   h -   t -   h -   s -   h -  '));
    var dB = b.add('noi', 'B', drm('t -   h -   s -   h -   t t   s -   t:11 t:12 t:13 t:14'));
    var order = ['Dm', 'Dm', 'F', 'C', 'Dm', 'Bb', 'A', 'Dm'];
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], CH[order[k]].p2, CH[order[k]].tri, (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 3. hollow */
  function buildHollow() {
    var b = new Builder('樹心的低語（hollow）', 10, 16, null);
    var LINE = [
      'E-4 -   -   -   -   -   G-4 -   -   -   -   -   B-4 -   -   -  ',
      'A-4 -   -   -   -   -   G-4 -   -   -   F#4 -   E-4 -   -   -  ',
      'D-4 -   -   -   -   -   F-4 -   -   -   -   -   A-4 -   -   -  ',
      'G-4 -   -   -   F#4 -   -   -   F-4 -   -   -   E-4 -   -   -  ',
      'B-4 -   -   -   -   -   A-4 -   -   -   -   -   G-4 -   -   -  ',
      'C-5 -   -   -   -   -   B-4 -   -   -   A#4 -   A-4 -   -   -  ',
      'G#4 -   -   -   B-4 -   -   -   E-5 -   -   -   -   -   -   -  ',
      'E-4 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'organ', 11, 1);
      p1.push(b.add('p1', 'm' + i, line));
      p2.push(b.add('p2', 'h' + i, hold(['E-3', 'A-3', 'D-3', 'G-3', 'E-3', 'C-4', 'G#3', 'E-3'][i],
        (i === 5 || i === 3) ? MAJ : (i === 6 ? DIM : MIN), 16, 'pad', 8, 0)));
    }
    var BASS = [
      'E-1 -   -   -   -   -   -   -   E-1 -   -   -   -   -   -   -  ',
      'A-1 -   -   -   -   -   -   -   G#1 -   -   -   -   -   -   -  ',
      'D-1 -   -   -   -   -   -   -   D-1 -   -   -   -   -   -   -  ',
      'G-1 -   -   -   F#1 -   -   -   F-1 -   -   -   E-1 -   -   -  ',
      'E-1 -   -   -   -   -   -   -   E-1 -   -   -   -   -   -   -  ',
      'C-2 -   -   -   -   -   -   -   B-1 -   -   -   -   -   -   -  ',
      'G#1 -   -   -   -   -   -   -   B-1 -   -   -   -   -   -   -  ',
      'E-1 -   -   -   -   -   -   -   E-1 -   -   -   -   -   -   -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    var dA = b.add('noi', 'A', drm('m -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  '));
    var dB = b.add('noi', 'B', drm('m -   -   -   -   -   -   -   m:11 -   -   -   -   -   h -  '));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 4. boss3 */
  function buildBoss3() {
    var b = new Builder('樹心魔（boss3）', 5, 16, null);
    var LINE = [
      'A-4 C-5 E-5 C-5 A-4 C-5 E-5 C-5 A-4 C-5 E-5 G-5 E-5 C-5 A-4 C-5',
      'A-4 B-4 C-5 D-5 E-5 D-5 C-5 B-4 A-4 B-4 C-5 D-5 E-5 F-5 E-5 D-5',
      'F-4 A-4 C-5 A-4 F-4 A-4 C-5 A-4 F-4 G-4 A-4 B-4 C-5 D-5 C-5 A-4',
      'G-4 B-4 D-5 B-4 G-4 B-4 D-5 B-4 G-4 A-4 B-4 C-5 D-5 E-5 D-5 B-4',
      'A-5 G-5 F-5 E-5 D-5 C-5 B-4 A-4 A-5 G-5 F-5 E-5 D-5 C-5 B-4 A-4',
      'D-5 F-5 A-5 F-5 D-5 F-5 A-5 F-5 D-5 E-5 F-5 G-5 A-5 G-5 F-5 E-5',
      'E-5 G#5 B-5 G#5 E-5 G#5 B-5 G#5 E-5 F-5 G#5 A-5 B-5 A-5 G#5 F-5',
      'A-5 -   E-5 -   C-5 -   A-4 -   E-4 -   A-4 -   C-5 -   E-5 -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'run', 14, 1);
      p1.push(b.add('p1', 'r' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 7, duty: 0 })));
    }
    var BASS = [
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -  ',
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   G-1 -   F-1 -  ',
      'F-1 -   F-1 -   F-1 -   F-1 -   F-1 -   F-1 -   F-1 -   F-1 -  ',
      'G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -  ',
      'A-1 -   A-1 -   G-1 -   G-1 -   F-1 -   F-1 -   E-1 -   E-1 -  ',
      'D-1 -   D-1 -   D-1 -   D-1 -   D-1 -   D-1 -   D-1 -   D-1 -  ',
      'E-1 -   E-1 -   E-1 -   E-1 -   E-1 -   E-1 -   E-1 -   E-1 -  ',
      'A-1 A-1 A-1 -   E-1 E-1 E-1 -   A-1 -   -   -   A-1 -   -   -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    var dA = b.add('noi', 'A', drm('k h   s h   k h   s h   k h   s h   k h   s h  '));
    var dB = b.add('noi', 'B', drm('k h   s h   k h   s h   k k   s s   t:12 t:13 t:14 t:15'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 5 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  A.register('swamp', buildSwamp(), {
    bpm: 112.5, rowsPerBeat: 4, bars: 16, mood: '潮濕、留白多',
    ch: 'p1 疏朗旋律 / p2 延遲回音 / tri 長踏板 / noi 水滴 hat'
  });
  A.register('grove', buildGrove(), {
    bpm: 128.6, rowsPerBeat: 4, bars: 16, mood: '行進、往上爬',
    ch: 'p1 旋律 / p2 和弦琶音 / tri 行走低音 / noi 木質中鼓'
  });
  A.register('hollow', buildHollow(), {
    bpm: 90.0, rowsPerBeat: 4, bars: 16, mood: '空洞、不安',
    ch: 'p1 風琴長句 / p2 五度長音 / tri 半音下行低音 / noi 極疏低鳴'
  });
  A.register('boss3', buildBoss3(), {
    bpm: 180.0, rowsPerBeat: 4, bars: 16, mood: '壓迫、纏繞（魔王）',
    ch: 'p1 16 分纏繞句 / p2 延遲回音 / tri 踏板 / noi 疾走 16 分'
  });

  ST.W3_SONGS = ['swamp', 'grove', 'hollow', 'boss3'];

})();
