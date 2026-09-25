/*
 * games/star/song_w2.js — 《星塵勇者》世界 2 的四首原創曲（mine / magma / forge / boss2）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w2 agent ｜ 依賴：games/star/song.js（ST.Audio.BUILD / register）
 * 契約：docs/TASKS.md「R3 star W2」；`ST.Audio.play(key)` 缺鍵時 main.js 自動退回既有曲。
 *
 * | key    | 曲名           | 調 / BPM        | 小節 | 情緒 | 聲道配置 |
 * |--------|----------------|-----------------|------|------|----------|
 * | mine   | 深坑的鎬聲     | D 小調 / 120    | 16   | 沉穩、一步一步往下走 | p1 旋律 / p2 五度墊音 / tri 行走低音 / noi 鎬子敲擊（金屬 hat） |
 * | magma  | 熔岩的心跳     | E 小調 / 150    | 16   | 壓迫、脈動 | p1 半音推進 / p2 回音 / tri 8 分踏板 / noi 心跳大鼓 |
 * | forge  | 熔爐進行曲     | C 小調 / 108    | 16   | 沉重進行曲 | p1 號角動機 / p2 減和弦長音 / tri 附點低音 / noi 鐵砧 |
 * | boss2  | 熔心巨像       | D 小調 / 200    | 16   | 快速、壓迫 | p1 16 分下行 / p2 延遲回音 / tri 踏板 / noi 疾走 |
 *
 * 全部用 song.js 的同一組樂器包絡（INST），只走 2A03 五聲道。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var A = ST.Audio;
  if (!A || !A.BUILD || !A.register) throw new Error('games/star/song_w2.js 需要 games/star/song.js（R3 版）');
  var B = A.BUILD;
  var Builder = B.Builder, mel = B.mel, drm = B.drm, echoOf = B.echoOf, stab = B.stab, hold = B.hold;
  var INST = B.INST, MIN = B.MIN, MAJ = B.MAJ, DOM7 = B.DOM7, DIM = B.DIM;

  /* ============================================================ 1. mine */
  function buildMine() {
    var b = new Builder('深坑的鎬聲（mine）', 7, 16, null);
    var LINE = [
      'D-4 -   -   -   F-4 -   A-4 -   D-5 -   -   -   A-4 -   F-4 -  ',   // Dm
      'A-3 -   -   -   C-4 -   E-4 -   A-4 -   -   -   G-4 -   E-4 -  ',   // Am
      'A#3 -   -   -   D-4 -   F-4 -   A#4 -   -   -   A-4 -   F-4 -  ',   // B♭
      'C-4 -   -   -   E-4 -   G-4 -   C-5 -   -   -   A#4 -   G-4 -  ',   // C
      'D-5 -   C-5 -   A#4 -   A-4 -   G-4 -   F-4 -   E-4 -   D-4 -  ',   // Dm（下行）
      'F-4 -   -   -   A-4 -   C-5 -   F-5 -   -   -   C-5 -   A-4 -  ',   // F
      'G-4 -   -   -   A#4 -   D-5 -   G-5 -   F-5 -   D-5 -   A#4 -  ',   // Gm
      'A-4 -   -   -   C-5 -   E-5 -   A-5 -   -   -   -   -   -   -  '    // A
    ];
    var p1 = [], i;
    for (i = 0; i < LINE.length; i++) p1.push(b.add('p1', 'm' + i, mel(LINE[i], 'lead', 14, 2)));

    var CH = {
      Dm: { p2: b.add('p2', 'Dm', stab('D-4', MIN, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'Dm', mel('D-2 -   -   -   A-2 -   -   -   D-2 -   -   -   F-2 -   A-2 -  ', 'bass', 15, 0)) },
      Am: { p2: b.add('p2', 'Am', stab('A-3', MIN, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'Am', mel('A-1 -   -   -   E-2 -   -   -   A-1 -   -   -   C-2 -   E-2 -  ', 'bass', 15, 0)) },
      Bb: { p2: b.add('p2', 'Bb', stab('A#3', MAJ, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'Bb', mel('A#1 -   -   -   F-2 -   -   -   A#1 -   -   -   D-2 -   F-2 -  ', 'bass', 15, 0)) },
      C: { p2: b.add('p2', 'C', stab('C-4', MAJ, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'C', mel('C-2 -   -   -   G-2 -   -   -   C-2 -   -   -   E-2 -   G-2 -  ', 'bass', 15, 0)) },
      F: { p2: b.add('p2', 'F', stab('F-3', MAJ, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'F', mel('F-1 -   -   -   C-2 -   -   -   F-1 -   -   -   A-1 -   C-2 -  ', 'bass', 15, 0)) },
      Gm: { p2: b.add('p2', 'Gm', stab('G-3', MIN, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'Gm', mel('G-1 -   -   -   D-2 -   -   -   G-1 -   -   -   A#1 -   D-2 -  ', 'bass', 15, 0)) },
      A: { p2: b.add('p2', 'A', stab('A-3', MAJ, 16, 4, 'pad', 9, 0)), tri: b.add('tri', 'A', mel('A-1 -   -   -   E-2 -   -   -   A-1 -   -   -   C#2 -   E-2 -  ', 'bass', 15, 0)) }
    };
    // 鎬子敲擊：金屬 hat（LFSR 短模式）打在反拍，大鼓穩住每一拍
    var dA = b.add('noi', 'A', drm('k -   -   H   s -   -   H   k -   -   H   s -   H -  '));
    var dB = b.add('noi', 'B', drm('k -   -   H   s -   -   H   k -   k -   s -   s:9 s:12'));
    var order = ['Dm', 'Am', 'Bb', 'C', 'Dm', 'F', 'Gm', 'A'];
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], CH[order[k]].p2, CH[order[k]].tri, (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 2. magma */
  function buildMagma() {
    var b = new Builder('熔岩的心跳（magma）', 6, 16, null);
    var LINE = [
      'E-4 -   F-4 -   E-4 -   D#4 -   E-4 -   G-4 -   B-4 -   -   -  ',
      'E-4 -   F-4 -   E-4 -   D#4 -   E-4 -   B-4 -   E-5 -   -   -  ',
      'A-4 -   A#4 -   A-4 -   G#4 -   A-4 -   C-5 -   E-5 -   -   -  ',
      'B-4 -   C-5 -   B-4 -   A#4 -   B-4 -   D-5 -   F#5 -   -   -  ',
      'E-5 -   D-5 -   C-5 -   B-4 -   A-4 -   G-4 -   F#4 -   E-4 -  ',
      'C-5 -   B-4 -   A-4 -   G-4 -   F#4 -   E-4 -   D-4 -   C-4 -  ',
      'G-4 -   G#4 -   A-4 -   A#4 -   B-4 -   C-5 -   C#5 -   D-5 -  ',
      'E-5 -   -   -   B-4 -   -   -   G-4 -   -   -   E-4 -   -   -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'lead', 14, 1);
      p1.push(b.add('p1', 'g' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 7, duty: 0 })));
    }
    var BASS = [
      'E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -  ',
      'E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   D-2 -   C-2 -  ',
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -  ',
      'B-1 -   B-1 -   B-1 -   B-1 -   B-1 -   B-1 -   F#2 -   D-2 -  ',
      'E-2 -   E-2 -   D-2 -   D-2 -   C-2 -   C-2 -   B-1 -   B-1 -  ',
      'C-2 -   C-2 -   B-1 -   B-1 -   A-1 -   A-1 -   G-1 -   G-1 -  ',
      'G-1 -   G-1 -   A-1 -   A-1 -   B-1 -   B-1 -   D-2 -   D-2 -  ',
      'E-2 -   -   -   E-2 -   -   -   E-2 -   E-2 -   E-2 -   E-2 -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    // 心跳：咚—咚…（兩下一組），間奏補小鼓
    var dA = b.add('noi', 'A', drm('K -   K:10 -   -   -   -   -   K -   K:10 -   -   -   -   -  '));
    var dB = b.add('noi', 'B', drm('K -   K:10 -   -   -   s -   K -   K:10 -   s -   s:9 s:12'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 3 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 3. forge */
  function buildForge() {
    var b = new Builder('熔爐進行曲（forge）', 8, 16, null);
    var LINE = [
      'C-4 -   -   -   C-4 -   D#4 -   G-4 -   -   -   D#4 -   C-4 -  ',
      'G-3 -   -   -   G-3 -   A#3 -   D-4 -   -   -   C-4 -   A#3 -  ',
      'G#3 -   -   -   G#3 -   C-4 -   D#4 -   -   -   C-4 -   G#3 -  ',
      'A#3 -   -   -   A#3 -   D-4 -   F-4 -   -   -   D#4 -   D-4 -  ',
      'C-5 -   -   -   G-4 -   D#4 -   C-4 -   -   -   G-3 -   C-4 -  ',
      'D#4 -   -   -   G-4 -   A#4 -   D#5 -   -   -   A#4 -   G-4 -  ',
      'D-4 -   D#4 -   F-4 -   F#4 -   G-4 -   -   -   F#4 -   F-4 -  ',
      'C-4 -   -   -   -   -   -   -   G-3 -   -   -   C-4 -   -   -  '
    ];
    var p1 = [], i;
    for (i = 0; i < LINE.length; i++) p1.push(b.add('p1', 'f' + i, mel(LINE[i], 'organ', 14, 2)));
    var CH = {
      Cm: { p2: b.add('p2', 'Cm', hold('C-4', MIN, 16, 'pad', 9, 0)), tri: b.add('tri', 'Cm', mel('C-2 -   -   C-2 -   -   G-1 -   C-2 -   -   C-2 -   D#2 -   G-2', 'bass', 15, 0)) },
      Gm: { p2: b.add('p2', 'Gm', hold('G-3', MIN, 16, 'pad', 9, 0)), tri: b.add('tri', 'Gm', mel('G-1 -   -   G-1 -   -   D-2 -   G-1 -   -   G-1 -   A#1 -   D-2', 'bass', 15, 0)) },
      Ab: { p2: b.add('p2', 'Ab', hold('G#3', MAJ, 16, 'pad', 9, 0)), tri: b.add('tri', 'Ab', mel('G#1 -   -   G#1 -   -   D#2 -   G#1 -   -   G#1 -   C-2 -   D#2', 'bass', 15, 0)) },
      Bb: { p2: b.add('p2', 'Bb', hold('A#3', MAJ, 16, 'pad', 9, 0)), tri: b.add('tri', 'Bb', mel('A#1 -   -   A#1 -   -   F-2 -   A#1 -   -   A#1 -   D-2 -   F-2', 'bass', 15, 0)) },
      Ddim: { p2: b.add('p2', 'Ddim', hold('D-4', DIM, 16, 'pad', 9, 0)), tri: b.add('tri', 'Ddim', mel('D-2 -   -   D-2 -   -   G#1 -   D-2 -   -   D-2 -   F-2 -   G#2', 'bass', 15, 0)) }
    };
    // 鐵砧：大鼓 + 金屬 hat 打在正拍（進行曲）
    var dA = b.add('noi', 'A', drm('K -   -   -   H -   -   -   K -   -   -   H -   -   -  '));
    var dB = b.add('noi', 'B', drm('K -   -   -   H -   -   -   K -   K -   t -   t:11 t:13'));
    var order = ['Cm', 'Gm', 'Ab', 'Bb', 'Cm', 'Ab', 'Ddim', 'Gm'];
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], CH[order[k]].p2, CH[order[k]].tri, (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 4. boss2 */
  function buildBoss2() {
    var b = new Builder('熔心巨像（boss2）', 4, 16, null);
    var LINE = [
      'D-5 C-5 A#4 A-4 G-4 F-4 E-4 D-4 D-5 C-5 A#4 A-4 G-4 F-4 E-4 D-4',
      'F-5 E-5 D-5 C-5 A#4 A-4 G-4 F-4 F-5 E-5 D-5 C-5 A#4 A-4 G-4 F-4',
      'A#4 C-5 D-5 F-5 A#5 A-5 G-5 F-5 D-5 C-5 A#4 A-4 G-4 F-4 D-4 C-4',
      'A-4 A#4 C-5 D-5 E-5 F-5 G-5 A-5 A#5 A-5 G-5 F-5 E-5 D-5 C-5 A#4',
      'D-5 -   D-5 -   C-5 -   C-5 -   A#4 -   A#4 -   A-4 -   A-4 -  ',
      'G-4 -   G-4 -   F-4 -   F-4 -   E-4 -   E-4 -   D-4 -   D-4 -  ',
      'D-5 D-5 D-5 -   F-5 F-5 F-5 -   A-5 A-5 A-5 -   D-6 -   -   -  ',
      'C-6 A#5 A-5 G-5 F-5 E-5 D-5 C-5 A#4 A-4 G-4 F-4 E-4 D-4 C-4 A#3'
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'run', 14, 1);
      p1.push(b.add('p1', 'r' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 6, duty: 0 })));
    }
    var BASS = [
      'D-2 -   D-2 -   D-2 -   D-2 -   D-2 -   D-2 -   D-2 -   D-2 -  ',
      'F-2 -   F-2 -   F-2 -   F-2 -   F-2 -   F-2 -   F-2 -   F-2 -  ',
      'A#1 -   A#1 -   A#1 -   A#1 -   A-1 -   A-1 -   A-1 -   A-1 -  ',
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -  ',
      'D-2 -   D-2 -   C-2 -   C-2 -   A#1 -   A#1 -   A-1 -   A-1 -  ',
      'G-1 -   G-1 -   F-1 -   F-1 -   E-1 -   E-1 -   D-1 -   D-1 -  ',
      'D-2 D-2 D-2 -   F-2 F-2 F-2 -   A-2 A-2 A-2 -   D-2 -   -   -  ',
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -  '
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

  A.register('mine', buildMine(), {
    bpm: 128.6, rowsPerBeat: 4, bars: 16, mood: '沉穩、一步一步往下走',
    ch: 'p1 旋律 / p2 五度墊音 / tri 行走低音 / noi 鎬子金屬敲擊'
  });
  A.register('magma', buildMagma(), {
    bpm: 150.0, rowsPerBeat: 4, bars: 16, mood: '壓迫、脈動',
    ch: 'p1 半音推進 / p2 延遲回音 / tri 8 分踏板 / noi 心跳大鼓'
  });
  A.register('forge', buildForge(), {
    bpm: 112.5, rowsPerBeat: 4, bars: 16, mood: '沉重進行曲',
    ch: 'p1 風琴號角 / p2 減和弦長音 / tri 附點低音 / noi 鐵砧'
  });
  A.register('boss2', buildBoss2(), {
    bpm: 225.0, rowsPerBeat: 4, bars: 16, mood: '快速、壓迫（魔王）',
    ch: 'p1 16 分下行 / p2 延遲回音 / tri 踏板 / noi 疾走 16 分'
  });

  ST.W2_SONGS = ['mine', 'magma', 'forge', 'boss2'];
})();
