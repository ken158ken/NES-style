/*
 * games/star/song_w4.js — 《星塵勇者》世界 4 的三首原創曲（works / core / boss4）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w4 agent（R4）｜ 依賴：games/star/song.js（ST.Audio.BUILD / register）
 * 契約：docs/TASKS.md「R4 star W4」；`ST.Audio.play(key)` 缺鍵時 main.js 自動退回既有曲。
 *
 * | key   | 曲名           | 調 / BPM        | 小節 | 情緒 | 聲道配置 |
 * |-------|----------------|-----------------|------|------|----------|
 * | works | 機械工房       | G 小調 / 128.6  | 16   | 規律、齒輪咬合 | p1 斷奏動機 / p2 琶音 stab / tri 行走低音 / noi 衝壓機 + 金屬 hat |
 * | core  | 核心反應層     | E 小調 / 150    | 16   | 緊迫、脈動上行 | p1 半音上行 / p2 延遲回音 / tri 8 分踏板 / noi 快速 16 分 |
 * | boss4 | 核心守護者     | C 小調 / 225    | 16   | 壓迫、重裝 | p1 16 分下行 / p2 回音 / tri 踏板 / noi 疾走 + 過門 |
 *
 * 全部用 song.js 的同一組樂器包絡（INST），只走 2A03 五聲道。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var A = ST.Audio;
  if (!A || !A.BUILD || !A.register) throw new Error('games/star/song_w4.js 需要 games/star/song.js（R3 版）');
  var B = A.BUILD;
  var Builder = B.Builder, mel = B.mel, drm = B.drm, echoOf = B.echoOf, stab = B.stab, hold = B.hold;
  var INST = B.INST, MIN = B.MIN, MAJ = B.MAJ, DIM = B.DIM;

  /* ============================================================ 1. works */
  function buildWorks() {
    var b = new Builder('機械工房（works）', 7, 16, null);
    var LINE = [
      'G-4 -   -   -   A#4 -   D-5 -   G-5 -   -   -   D-5 -   A#4 -  ',   // Gm
      'D-4 -   -   -   F-4 -   A-4 -   D-5 -   -   -   C-5 -   A-4 -  ',   // Dm
      'D#4 -   -   -   G-4 -   A#4 -   D#5 -   -   -   D-5 -   A#4 -  ',   // E♭
      'F-4 -   -   -   A-4 -   C-5 -   F-5 -   -   -   D#5 -   C-5 -  ',   // F
      'G-5 -   F-5 -   D#5 -   D-5 -   C-5 -   A#4 -   A-4 -   G-4 -  ',   // Gm（下行）
      'C-5 -   -   -   D#5 -   G-5 -   C-6 -   -   -   G-5 -   D#5 -  ',   // Cm
      'D-5 -   -   -   F#5 -   A-5 -   D-6 -   C-6 -   A-5 -   F#5 -  ',   // D
      'G-5 -   -   -   D-5 -   A#4 -   G-4 -   -   -   -   -   -   -  '    // Gm（收）
    ];
    var p1 = [], i;
    for (i = 0; i < LINE.length; i++) p1.push(b.add('p1', 'w' + i, mel(LINE[i], 'lead', 14, 2)));

    var CH = {
      Gm: { p2: b.add('p2', 'Gm', stab('G-3', MIN, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Gm', mel('G-1 -   -   -   D-2 -   -   -   G-1 -   -   -   A#1 -   D-2 -  ', 'bass', 15, 0)) },
      Dm: { p2: b.add('p2', 'Dm', stab('D-4', MIN, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Dm', mel('D-2 -   -   -   A-2 -   -   -   D-2 -   -   -   F-2 -   A-2 -  ', 'bass', 15, 0)) },
      Eb: { p2: b.add('p2', 'Eb', stab('D#4', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Eb', mel('D#2 -   -   -   A#2 -   -   -   D#2 -   -   -   G-2 -   A#2 -  ', 'bass', 15, 0)) },
      F: { p2: b.add('p2', 'F', stab('F-3', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'F', mel('F-1 -   -   -   C-2 -   -   -   F-1 -   -   -   A-1 -   C-2 -  ', 'bass', 15, 0)) },
      Cm: { p2: b.add('p2', 'Cm', stab('C-4', MIN, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'Cm', mel('C-2 -   -   -   G-2 -   -   -   C-2 -   -   -   D#2 -   G-2 -  ', 'bass', 15, 0)) },
      D: { p2: b.add('p2', 'D', stab('D-4', MAJ, 16, 4, 'stab', 10, 1)), tri: b.add('tri', 'D', mel('D-2 -   -   -   A-2 -   -   -   D-2 -   -   -   F#2 -   A-2 -  ', 'bass', 15, 0)) }
    };
    // 衝壓機：大鼓打正拍、金屬 hat（LFSR 短模式）打反拍 ⇒ 齒輪咬合的規律感
    var dA = b.add('noi', 'A', drm('K -   H -   s -   H -   K -   H -   s -   H H  '));
    var dB = b.add('noi', 'B', drm('K -   H -   s -   H -   K K   s -   t:11 -   t:13 t:15'));
    var order = ['Gm', 'Dm', 'Eb', 'F', 'Gm', 'Cm', 'D', 'Gm'];
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], CH[order[k]].p2, CH[order[k]].tri, (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 2. core */
  function buildCore() {
    var b = new Builder('核心反應層（core）', 6, 16, null);
    var LINE = [
      'E-4 -   F#4 -   G-4 -   A-4 -   B-4 -   A-4 -   G-4 -   F#4 -  ',
      'E-4 -   F#4 -   G-4 -   B-4 -   E-5 -   D-5 -   B-4 -   G-4 -  ',
      'A-4 -   B-4 -   C-5 -   D-5 -   E-5 -   D-5 -   C-5 -   B-4 -  ',
      'B-4 -   C#5 -   D-5 -   E-5 -   F#5 -   E-5 -   D-5 -   C#5 -  ',
      'E-5 -   D-5 -   C-5 -   B-4 -   A-4 -   G-4 -   F#4 -   E-4 -  ',
      'C-5 -   B-4 -   A-4 -   G-4 -   F#4 -   G-4 -   A-4 -   B-4 -  ',
      'G-4 -   A-4 -   A#4 -   B-4 -   C-5 -   C#5 -   D-5 -   D#5 -  ',
      'E-5 -   -   -   B-4 -   -   -   G-4 -   E-4 -   B-3 -   E-4 -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'lead2', 14, 1);
      p1.push(b.add('p1', 'c' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 7, duty: 0 })));
    }
    var BASS = [
      'E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -  ',
      'E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   E-2 -   D-2 -   B-1 -  ',
      'A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   A-1 -   C-2 -   E-2 -  ',
      'B-1 -   B-1 -   B-1 -   B-1 -   B-1 -   B-1 -   F#2 -   A-1 -  ',
      'E-2 -   E-2 -   C-2 -   C-2 -   A-1 -   A-1 -   G-1 -   G-1 -  ',
      'C-2 -   C-2 -   B-1 -   B-1 -   A-1 -   A-1 -   G-1 -   G-1 -  ',
      'G-1 -   G-1 -   A-1 -   A-1 -   B-1 -   B-1 -   D-2 -   D-2 -  ',
      'E-2 -   -   -   E-2 -   -   -   E-2 -   E-2 -   B-1 -   E-2 -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    var dA = b.add('noi', 'A', drm('k h   h h   s h   h h   k h   h h   s h   h h  '));
    var dB = b.add('noi', 'B', drm('k h   h h   s h   h h   k k   s s   s:9 s:11 s:13 s:15'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 3 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 3. boss4 */
  function buildBoss4() {
    var b = new Builder('核心守護者（boss4）', 4, 16, null);
    var LINE = [
      'C-5 A#4 G#4 G-4 F-4 D#4 D-4 C-4 C-5 A#4 G#4 G-4 F-4 D#4 D-4 C-4',
      'D#5 D-5 C-5 A#4 G#4 G-4 F-4 D#4 D#5 D-5 C-5 A#4 G#4 G-4 F-4 D#4',
      'G#4 A#4 C-5 D#5 G#5 G-5 F-5 D#5 C-5 A#4 G#4 G-4 F-4 D#4 C-4 A#3',
      'G-4 G#4 A#4 C-5 D-5 D#5 F-5 G-5 G#5 G-5 F-5 D#5 D-5 C-5 A#4 G#4',
      'C-5 -   C-5 -   A#4 -   A#4 -   G#4 -   G#4 -   G-4 -   G-4 -  ',
      'F-4 -   F-4 -   D#4 -   D#4 -   D-4 -   D-4 -   C-4 -   C-4 -  ',
      'C-5 C-5 C-5 -   D#5 D#5 D#5 -   G-5 G-5 G-5 -   C-6 -   -   -  ',
      'A#5 G#5 G-5 F-5 D#5 D-5 C-5 A#4 G#4 G-4 F-4 D#4 D-4 C-4 A#3 G#3'
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'run', 14, 1);
      p1.push(b.add('p1', 'g' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 6, duty: 0 })));
    }
    var BASS = [
      'C-2 -   C-2 -   C-2 -   C-2 -   C-2 -   C-2 -   C-2 -   C-2 -  ',
      'D#2 -   D#2 -   D#2 -   D#2 -   D#2 -   D#2 -   D#2 -   D#2 -  ',
      'G#1 -   G#1 -   G#1 -   G#1 -   G-1 -   G-1 -   G-1 -   G-1 -  ',
      'G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -  ',
      'C-2 -   C-2 -   A#1 -   A#1 -   G#1 -   G#1 -   G-1 -   G-1 -  ',
      'F-1 -   F-1 -   D#1 -   D#1 -   D-1 -   D-1 -   C-1 -   C-1 -  ',
      'C-2 C-2 C-2 -   D#2 D#2 D#2 -   G-2 G-2 G-2 -   C-2 -   -   -  ',
      'G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -   G-1 -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    var dA = b.add('noi', 'A', drm('K h   s h   K h   s h   K h   s h   K h   s h  '));
    var dB = b.add('noi', 'B', drm('K h   s h   K h   s h   K K   s s   t:12 t:13 t:14 t:15'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 5 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  A.register('works', buildWorks(), {
    bpm: 128.6, rowsPerBeat: 4, bars: 16, mood: '規律、齒輪咬合',
    ch: 'p1 斷奏動機 / p2 琶音 stab / tri 行走低音 / noi 衝壓機 + 金屬 hat'
  });
  A.register('core', buildCore(), {
    bpm: 150.0, rowsPerBeat: 4, bars: 16, mood: '緊迫、脈動上行',
    ch: 'p1 半音上行 / p2 延遲回音 / tri 8 分踏板 / noi 快速 16 分'
  });
  A.register('boss4', buildBoss4(), {
    bpm: 225.0, rowsPerBeat: 4, bars: 16, mood: '壓迫、重裝（魔王）',
    ch: 'p1 16 分下行 / p2 延遲回音 / tri 踏板 / noi 疾走 + 過門'
  });

  ST.W4_SONGS = ['works', 'core', 'boss4'];
})();
