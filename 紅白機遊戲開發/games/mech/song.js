/*
 * games/mech/song.js — 《星塵機甲》音樂 / 音效層（全部原創，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 只依賴 engine/music.js 的欄位（note / inst / vol / arp / vib / duty /
 *   cut / detune / slide / stop，instrument 的 vol|duty|arp|pitch 包絡）。**本檔刻意自帶
 *   建構工具**（不依賴 games/star 的 song.js），這樣 `tools/apu_render.py --game mech`
 *   只載入 `engine/apu.js + engine/music.js + games/mech/song.js` 就能離線渲染。
 *
 * 契約：`MG.Audio = { init(nes), play(key), stop(), sfx(name), tick(nes), has(key) }`
 *
 * 曲目（BPM = 3600 / (speed × 每拍 row 數)，研究 06 §1.7；一律 4 row/拍）
 * | key      | 曲名             | speed | BPM   | 小節 | 情緒 / 配置 |
 * |----------|------------------|-------|-------|------|-------------|
 * | select   | 機甲待命（選關） | 7     | 128.6 | 8    | 期待、冷色；p1 號角動機 / p2 琶音 / tri 八度低音 / noi 穩拍 |
 * | stage1   | 冰晶工廠         | 5     | 180.0 | 16   | 明快推進；p1 16 分旋律 / p2 回音 / tri 行走低音 / noi 機械拍 |
 * | stage2   | 熔鐵熔爐         | 5     | 180.0 | 16   | 壓迫、重；p1 半音動機 / p2 五度墊 / tri 附點低音 / noi 鐵砧 |
 * | boss     | 機兵對峙         | 4     | 225.0 | 16   | 高速；p1 16 分下行 / p2 延遲回音 / tri 踏板 / noi 疾走 |
 * | weapon   | 取得武器         | 6     | 150.0 | 2    | 勝利上行（不 loop） |
 * | clear    | 關卡完成         | 6     | 150.0 | 2.5  | 號角收束（不 loop） |
 * | death    | 機體損毀         | 5     | 180.0 | 1.5  | 半音墜落（不 loop） |
 * | gameover | 全機損失         | 9     | 100.0 | 1.5  | 低沉終止（不 loop） |
 *
 * 音效（只搶 p2 / noi，不碰 p1 主旋律與三角波低音；研究 06 §1.6 優先權表）：
 *   die 9 > bossdie 9 > oneup 8 > etank 7 > item 6 > hurt 5 > charge 5 > wshot 4 >
 *   shot 3 > ehit 3 > eshot 3 > clink 2 > jump 2 > slide 2 > land 1 > warn 4 > fire 4 > door 4
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};
  var MG = global.MG = global.MG || {};

  /* ===================================================================== 工具 */
  function tokens(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }

  function mel(str, inst, vol, duty, extra) {
    var t = tokens(str), out = new Array(t.length), i, k;
    for (i = 0; i < t.length; i++) {
      if (t[i] === '-') { out[i] = null; continue; }
      if (t[i] === '=') { out[i] = { note: '===' }; continue; }
      var r = { note: t[i], inst: inst, vol: vol };
      if (duty !== undefined && duty !== null) r.duty = duty;
      if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
      out[i] = r;
    }
    return out;
  }

  var DRUM = {
    k: { note: 13, inst: 'kick', vol: 15, duty: 0 },
    K: { note: 15, inst: 'kick', vol: 15, duty: 0 },
    s: { note: 6, inst: 'snare', vol: 14, duty: 0 },
    h: { note: 2, inst: 'hat', vol: 11, duty: 0 },
    H: { note: 4, inst: 'hat', vol: 15, duty: 1 },
    t: { note: 9, inst: 'tom', vol: 14, duty: 0 },
    m: { note: 15, inst: 'tom', vol: 15, duty: 0 },
    c: { note: 1, inst: 'crash', vol: 13, duty: 0 }
  };
  function drm(str) {
    var t = tokens(str), out = new Array(t.length), i;
    for (i = 0; i < t.length; i++) {
      var s = t[i];
      if (s === '-') { out[i] = null; continue; }
      var ci = s.indexOf(':'), v = -1;
      if (ci > 0) { v = parseInt(s.substring(ci + 1), 10); s = s.substring(0, ci); }
      var d = DRUM[s];
      if (!d) { out[i] = null; continue; }
      out[i] = (v >= 0) ? { note: d.note, inst: d.inst, vol: v, duty: d.duty } : d;
    }
    return out;
  }
  // 延遲回音（研究 06 §2.2）
  function echoOf(arr, n, patch) {
    var out = new Array(arr.length), i, k;
    for (i = 0; i < arr.length; i++) out[i] = null;
    for (i = 0; i < arr.length; i++) {
      var src = arr[i];
      if (!src || i + n >= arr.length) continue;
      var r = {};
      for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) r[k] = src[k];
      if (patch) for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) r[k] = patch[k];
      out[i + n] = r;
    }
    return out;
  }
  // 和弦琶音短音（每 step 個 row 打一下）
  function stab(root, arp, rowsN, step, inst, vol, duty) {
    var out = new Array(rowsN), i;
    for (i = 0; i < rowsN; i++) {
      out[i] = (i % step === 0)
        ? { note: root, inst: inst || 'stab', vol: vol === undefined ? 11 : vol, duty: duty === undefined ? 1 : duty, arp: arp }
        : null;
    }
    return out;
  }
  function hold(root, arp, rowsN, inst, vol, duty) {
    var out = new Array(rowsN), i;
    for (i = 0; i < rowsN; i++) out[i] = null;
    out[0] = { note: root, inst: inst, vol: vol, duty: duty, arp: arp };
    return out;
  }

  function Builder(name, speed, rowsN, groove) {
    this.s = { name: name, speed: speed, rows: rowsN, loop: 0, instruments: null,
               patterns: [], order: [], groove: groove || null, playLoop: true };
    this.idx = {};
  }
  Builder.prototype.add = function (track, key, arr) {
    if (!arr || arr.length !== this.s.rows) {
      throw new Error('mech song "' + this.s.name + '" 的 ' + track + '|' + key + ' 長度 ' +
                      (arr ? arr.length : 'null') + ' ≠ rows ' + this.s.rows);
    }
    var k = track + '|' + key;
    if (this.idx[k] !== undefined) return this.idx[k];
    var o = {};
    o[track] = arr;
    this.s.patterns.push(o);
    this.idx[k] = this.s.patterns.length - 1;
    return this.idx[k];
  };
  Builder.prototype.bar = function (p1, p2, tri, noi) {
    this.s.order.push({ p1: p1, p2: p2, tri: tri, noi: noi });
    return this;
  };
  Builder.prototype.done = function (inst, loopAt, playLoop) {
    this.s.instruments = inst;
    this.s.loop = loopAt || 0;
    this.s.playLoop = playLoop === undefined ? true : !!playLoop;
    return this.s;
  };

  /* =================================================================== 樂器 */
  var INST = {
    lead: { vol: [15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6], volLoop: 19, duty: [2, 1, 1, 1] },
    lead2: { vol: [14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4], volLoop: 15, duty: [1] },
    echo: { vol: [8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0], duty: [0] },
    stab: { vol: [13, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    pad: { vol: [10, 10, 9, 9, 8, 8, 7, 7], volLoop: 7, duty: [0] },
    organ: { vol: [11, 12, 12, 11, 11, 12, 12, 11], volLoop: 0, duty: [2, 2, 1, 1], dutyLoop: 0 },
    bell: { vol: [15, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [2, 2, 1, 1, 0], dutyLoop: 4 },
    run: { vol: [14, 13, 12, 11, 10], volLoop: 4, duty: [1] },
    bass: {},
    kick: { vol: [15, 14, 11, 7, 3, 0] },
    snare: { vol: [15, 13, 11, 9, 7, 5, 4, 3, 2, 1, 0] },
    hat: { vol: [8, 5, 2, 0] },
    tom: { vol: [14, 12, 10, 8, 6, 4, 3, 2, 1, 0] },
    crash: { vol: [13, 12, 12, 11, 10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }
  };
  var MIN = [0, 3, 7], MAJ = [0, 4, 7], DOM7 = [0, 4, 7, 10], DIM = [0, 3, 6];

  /* ======================================================= 1. select 選關 */
  function buildSelect() {
    var b = new Builder('機甲待命（select）', 7, 16, null);
    var LINE = [
      'A-4 -   -   -   E-5 -   -   -   C-5 -   E-5 -   A-5 -   -   -  ',
      'G-4 -   -   -   D-5 -   -   -   B-4 -   D-5 -   G-5 -   -   -  ',
      'F-4 -   -   -   C-5 -   -   -   A-4 -   C-5 -   F-5 -   -   -  ',
      'E-5 -   D-5 -   C-5 -   B-4 -   A-4 -   -   -   E-4 -   -   -  ',
      'C-5 -   E-5 -   A-5 -   C-6 -   B-5 -   A-5 -   E-5 -   C-5 -  ',
      'D-5 -   F-5 -   A-5 -   D-6 -   C-6 -   A-5 -   F-5 -   D-5 -  ',
      'E-5 -   G-5 -   B-5 -   E-6 -   D-6 -   B-5 -   G-5 -   E-5 -  ',
      'A-5 -   -   -   E-5 -   -   -   C-5 -   -   -   A-4 -   -   -  '
    ];
    var CH = ['Am', 'Em', 'F', 'Am', 'Am', 'Dm', 'Em', 'Am'];
    var ROOT = { Am: 'A-3', Em: 'E-3', F: 'F-3', Dm: 'D-3' };
    var ARP = { Am: MIN, Em: MIN, F: MAJ, Dm: MIN };
    var BASS = {
      Am: 'A-1 -   -   -   E-2 -   -   -   A-1 -   -   -   C-2 -   E-2 -  ',
      Em: 'E-1 -   -   -   B-1 -   -   -   E-1 -   -   -   G-1 -   B-1 -  ',
      F: 'F-1 -   -   -   C-2 -   -   -   F-1 -   -   -   A-1 -   C-2 -  ',
      Dm: 'D-1 -   -   -   A-1 -   -   -   D-1 -   -   -   F-1 -   A-1 -  '
    };
    var p1 = [], i;
    for (i = 0; i < LINE.length; i++) p1.push(b.add('p1', 'm' + i, mel(LINE[i], 'lead', 14, 2)));
    var p2 = {}, tri = {}, k;
    for (i = 0; i < CH.length; i++) {
      k = CH[i];
      if (p2[k] === undefined) {
        p2[k] = b.add('p2', k, stab(ROOT[k], ARP[k], 16, 4, 'stab', 10, 1));
        tri[k] = b.add('tri', k, mel(BASS[k], 'bass', 15, 0));
      }
    }
    var dA = b.add('noi', 'A', drm('k -   -   h   s -   -   h   k -   -   h   s -   h -  '));
    var dB = b.add('noi', 'B', drm('k -   -   h   s -   -   h   k -   k h   s -   s:9 s:12'));
    for (i = 0; i < 8; i++) b.bar(p1[i], p2[CH[i]], tri[CH[i]], i === 7 ? dB : dA);
    return b.done(INST, 0, true);
  }

  /* ====================================================== 2. stage1 冰晶工廠 */
  function buildStage1() {
    var b = new Builder('冰晶工廠（stage1）', 5, 16, null);
    var LINE = [
      'E-5 -   B-4 -   E-5 F#5 G-5 -   F#5 -   E-5 -   B-4 -   D-5 -  ',
      'E-5 -   G-5 -   B-5 -   A-5 -   G-5 -   E-5 -   D-5 -   B-4 -  ',
      'C-5 -   G-4 -   C-5 D-5 E-5 -   D-5 -   C-5 -   G-4 -   B-4 -  ',
      'D-5 -   F#5 -   A-5 -   G-5 -   F#5 -   D-5 -   B-4 -   D-5 -  ',
      'G-5 -   B-5 -   E-6 -   D-6 -   B-5 -   G-5 -   E-5 -   -   -  ',
      'A-5 -   G-5 -   F#5 -   E-5 -   D-5 -   C-5 -   B-4 -   A-4 -  ',
      'B-4 -   D-5 -   F#5 -   A-5 -   G-5 -   F#5 -   E-5 -   D-5 -  ',
      'E-5 -   -   -   B-4 -   -   -   G-4 -   -   -   E-4 -   -   -  '
    ];
    var BASS = [
      'E-2 -   E-2 -   E-2 -   E-3 -   E-2 -   E-2 -   B-1 -   D-2 -  ',
      'E-2 -   E-2 -   G-2 -   G-2 -   B-1 -   B-1 -   D-2 -   D-2 -  ',
      'C-2 -   C-2 -   C-2 -   C-3 -   G-1 -   G-1 -   B-1 -   B-1 -  ',
      'D-2 -   D-2 -   A-1 -   A-1 -   D-2 -   D-2 -   F#2 -   A-2 -  ',
      'G-1 -   G-1 -   G-2 -   G-2 -   E-2 -   E-2 -   E-2 -   -   -  ',
      'A-1 -   A-1 -   D-2 -   D-2 -   G-1 -   G-1 -   C-2 -   C-2 -  ',
      'B-1 -   B-1 -   F#2 -   F#2 -   B-1 -   B-1 -   D-2 -   D-2 -  ',
      'E-2 -   -   -   B-1 -   -   -   E-2 -   -   -   E-1 -   -   -  '
    ];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'lead', 14, 1);
      p1.push(b.add('p1', 'm' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 7, duty: 0 })));
      tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('k h   H h   s h   H h   k h   H h   s h   H h  '));
    var dB = b.add('noi', 'B', drm('k h   H h   s h   H h   k k   H H   s s   t:12 t:14'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ====================================================== 3. stage2 熔鐵熔爐 */
  function buildStage2() {
    var b = new Builder('熔鐵熔爐（stage2）', 5, 16, null);
    var LINE = [
      'C-5 -   C-5 -   D#5 -   D-5 -   C-5 -   G-4 -   G#4 -   A#4 -  ',
      'C-5 -   D#5 -   G-5 -   F-5 -   D#5 -   C-5 -   A#4 -   G-4 -  ',
      'G#4 -   G#4 -   C-5 -   B-4 -   G#4 -   D#4 -   F-4 -   G-4 -  ',
      'A#4 -   D-5 -   F-5 -   D#5 -   D-5 -   A#4 -   G-4 -   F-4 -  ',
      'C-6 -   -   -   G-5 -   D#5 -   C-5 -   -   -   G-4 -   C-5 -  ',
      'D#5 -   G-5 -   A#5 -   G-5 -   F-5 -   D#5 -   D-5 -   C-5 -  ',
      'D-5 -   D#5 -   F-5 -   F#5 -   G-5 -   -   -   F#5 -   F-5 -  ',
      'C-5 -   -   -   G-4 -   -   -   D#4 -   -   -   C-4 -   -   -  '
    ];
    var BASS = [
      'C-2 -   -   C-2 -   -   G-1 -   C-2 -   -   C-2 -   D#2 -   G-2',
      'C-2 -   -   C-2 -   -   G-1 -   A#1 -   -   A#1 -   G-1 -   D-2',
      'G#1 -   -   G#1 -   -   D#2 -   G#1 -   -   G#1 -   C-2 -   D#2',
      'A#1 -   -   A#1 -   -   F-2 -   A#1 -   -   A#1 -   D-2 -   F-2',
      'C-2 -   -   C-2 -   -   G-1 -   C-2 -   -   -   -   C-1 -   -  ',
      'D#2 -   -   D#2 -   -   A#1 -   D#2 -   -   D#2 -   G-2 -   A#2',
      'G-1 -   -   G-1 -   -   D-2 -   G-1 -   -   G-1 -   A#1 -   D-2',
      'C-2 -   -   -   G-1 -   -   -   D#1 -   -   -   C-1 -   -   -  '
    ];
    var CH = [['C-4', MIN], ['C-4', MIN], ['G#3', MAJ], ['A#3', MAJ], ['C-4', MIN], ['D#4', MAJ], ['G-3', MIN], ['C-4', MIN]];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < LINE.length; i++) {
      p1.push(b.add('p1', 'm' + i, mel(LINE[i], 'organ', 14, 2)));
      p2.push(b.add('p2', 'c' + i, hold(CH[i][0], CH[i][1], 16, 'pad', 9, 0)));
      tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('K -   -   -   H -   -   -   K -   -   -   H -   -   -  '));
    var dB = b.add('noi', 'B', drm('K -   -   -   H -   -   -   K -   K -   t -   t:11 t:13'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ========================================================= 4. boss 機兵對峙 */
  function buildBoss() {
    var b = new Builder('機兵對峙（boss）', 4, 16, null);
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
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'run', 14, 1);
      p1.push(b.add('p1', 'r' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 6, duty: 0 })));
      tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('k h   s h   k h   s h   k h   s h   k h   s h  '));
    var dB = b.add('noi', 'B', drm('k h   s h   k h   s h   k k   s s   t:12 t:13 t:14 t:15'));
    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (k === 5 || k === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ================================================= 5~8. 不 loop 的短曲 */
  function buildWeapon() {
    var b = new Builder('取得武器（weapon）', 6, 16, null);
    var l0 = b.add('p1', 'a', mel('C-5 -   E-5 -   G-5 -   C-6 -   E-6 -   G-6 -   C-6 -   -   -  ', 'bell', 15, 2));
    var l1 = b.add('p1', 'b', mel('G-5 -   C-6 -   E-6 -   G-6 -   C-7 -   -   -   -   -   -   -  ', 'bell', 15, 2));
    var h0 = b.add('p2', 'a', stab('C-4', MAJ, 16, 4, 'stab', 11, 1));
    var h1 = b.add('p2', 'b', stab('C-4', MAJ, 16, 2, 'stab', 11, 1));
    var t0 = b.add('tri', 'a', mel('C-2 -   -   -   G-2 -   -   -   C-3 -   -   -   G-2 -   -   -  ', 'bass', 15, 0));
    var t1 = b.add('tri', 'b', mel('C-2 -   -   -   C-3 -   -   -   C-2 -   -   -   -   -   -   -  ', 'bass', 15, 0));
    var d0 = b.add('noi', 'a', drm('c -   -   -   s -   -   -   c -   -   -   s -   s:9 s:12'));
    var d1 = b.add('noi', 'b', drm('c -   -   -   s s   s s   c -   -   -   -   -   -   -  '));
    b.bar(l0, h0, t0, d0);
    b.bar(l1, h1, t1, d1);
    return b.done(INST, 0, false);
  }
  function buildClear() {
    var b = new Builder('關卡完成（clear）', 6, 16, null);
    var l0 = b.add('p1', 'a', mel('G-5 -   G-5 -   G-5 -   D#5 -   F-5 -   G-5 -   -   -   -   -  ', 'bell', 15, 2));
    var l1 = b.add('p1', 'b', mel('A#5 -   -   -   G-5 -   -   -   C-6 -   -   -   -   -   -   -  ', 'bell', 15, 2));
    var h0 = b.add('p2', 'a', hold('C-4', MIN, 16, 'pad', 10, 0));
    var h1 = b.add('p2', 'b', hold('G-3', MAJ, 16, 'pad', 10, 0));
    var t0 = b.add('tri', 'a', mel('C-2 -   -   -   G-1 -   -   -   C-2 -   -   -   D#2 -   G-2 -  ', 'bass', 15, 0));
    var t1 = b.add('tri', 'b', mel('G-1 -   -   -   D-2 -   -   -   G-1 -   -   -   -   -   -   -  ', 'bass', 15, 0));
    var d0 = b.add('noi', 'a', drm('c -   -   -   s -   -   -   k -   -   -   s -   -   -  '));
    var d1 = b.add('noi', 'b', drm('c -   -   -   s s   s:9 s:12 c -   -   -   -   -   -   -  '));
    b.bar(l0, h0, t0, d0);
    b.bar(l1, h1, t1, d1);
    return b.done(INST, 0, false);
  }
  function buildDeath() {
    var b = new Builder('機體損毀（death）', 5, 16, null);
    var l = b.add('p1', 'a', mel('A-5 G#5 G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4 -   -   -  ', 'lead', 14, 1));
    var h = b.add('p2', 'a', mel('A-4 G#4 G-4 F#4 F-4 E-4 D#4 D-4 C#4 C-4 B-3 A#3 A-3 -   -   -  ', 'echo', 10, 0));
    var t = b.add('tri', 'a', mel('A-2 -   G-2 -   F-2 -   E-2 -   D-2 -   C-2 -   A-1 -   -   -  ', 'bass', 15, 0));
    var d = b.add('noi', 'a', drm('K -   -   -   m:9 -   -   -   m:7 -   -   -   m:5 -   -   -  '));
    b.bar(l, h, t, d);
    return b.done(INST, 0, false);
  }
  function buildGameOver() {
    var b = new Builder('全機損失（gameover）', 9, 16, null);
    var l = b.add('p1', 'a', mel('D-4 -   -   -   C-4 -   -   -   A#3 -   -   -   A-3 -   -   -  ', 'organ', 13, 2));
    var h = b.add('p2', 'a', mel('A-3 -   -   -   G-3 -   -   -   F-3 -   -   -   E-3 -   -   -  ', 'pad', 9, 0));
    var t = b.add('tri', 'a', mel('D-2 -   -   -   C-2 -   -   -   A#1 -   -   -   A-1 -   -   -  ', 'bass', 15, 0));
    var d = b.add('noi', 'a', drm('m -   -   -   -   -   -   -   m:9 -   -   -   -   -   -   -  '));
    b.bar(l, h, t, d);
    return b.done(INST, 0, false);
  }

  /* ================================================================== 音效 */
  var PRIORITY = {
    die: 9, bossdie: 9, oneup: 8, etank: 7, item: 6, hurt: 5, charge: 5,
    wshot: 4, warn: 4, fire: 4, door: 4, shot: 3, ehit: 3, eshot: 3,
    clink: 2, jump: 2, slide: 2, land: 1
  };
  function sq(list, keepDuty) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i], note = e[0], n = e[1], vol = e[2], duty = e[3];
      for (j = 0; j < n; j++) {
        out.push(j === 0
          ? { note: note, vol: vol === undefined ? 12 : vol, duty: duty === undefined ? (keepDuty ? undefined : 1) : duty, retrigger: true }
          : {});
      }
    }
    return out;
  }
  function nq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i], note = e[0], n = e[1], vol = e[2];
      for (j = 0; j < n; j++) out.push(j === 0 ? { note: note, vol: vol === undefined ? 10 : vol, retrigger: true } : {});
    }
    return out;
  }
  function fade(v, n) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push({ vol: Math.max(0, v - Math.round(v * i / n)) });
    out.push({ off: true });
    return out;
  }
  function cat(a, b) { return a.concat(b); }

  var SFX = {
    shot: { priority: PRIORITY.shot, data: { p2: cat(sq([['C-6', 2, 11, 0], ['G-5', 2, 9], ['C-5', 2, 7]]), fade(6, 3)) } },
    wshot: { priority: PRIORITY.wshot, data: { p2: cat(sq([['E-6', 2, 12, 1], ['B-5', 2, 10], ['E-5', 3, 8]]), fade(7, 4)) } },
    charge: { priority: PRIORITY.charge, data: { p2: cat(sq([['C-5', 3, 13, 2], ['E-5', 3, 13], ['G-5', 3, 13], ['C-6', 4, 14]]), fade(13, 8)) } },
    jump: { priority: PRIORITY.jump, data: { p2: cat(sq([['E-5', 2, 10, 0], ['A-5', 2, 10], ['C-6', 2, 9]]), fade(8, 3)) } },
    slide: { priority: PRIORITY.slide, data: { noi: cat(nq([[6, 3, 9], [8, 3, 7], [10, 3, 5]]), [{ off: true }]) } },
    land: { priority: PRIORITY.land, data: { noi: cat(nq([[12, 2, 8], [14, 2, 5]]), [{ off: true }]) } },
    ehit: { priority: PRIORITY.ehit, data: { noi: cat(nq([[3, 2, 10], [5, 2, 7], [7, 2, 4]]), [{ off: true }]) } },
    clink: { priority: PRIORITY.clink, data: { p2: cat(sq([['A#6', 2, 10, 1], ['F-6', 2, 7]]), fade(6, 3)) } },
    eshot: { priority: PRIORITY.eshot, data: { p2: cat(sq([['A-4', 2, 9, 1], ['D-4', 3, 7]]), fade(6, 3)) } },
    hurt: { priority: PRIORITY.hurt,
            data: { p2: cat(sq([['A#4', 3, 13, 1], ['F-4', 3, 12], ['C-4', 4, 11]]), fade(10, 5)),
                    noi: cat(nq([[8, 3, 11], [11, 3, 8], [13, 3, 5]]), [{ off: true }]) } },
    item: { priority: PRIORITY.item, data: { p2: cat(sq([['C-6', 3, 12, 1], ['E-6', 3, 12], ['G-6', 4, 13]], true), fade(12, 5)) } },
    etank: { priority: PRIORITY.etank, data: { p2: cat(sq([['G-5', 3, 12, 1], ['C-6', 3, 12], ['E-6', 3, 13], ['G-6', 4, 13]], true), fade(13, 6)) } },
    oneup: { priority: PRIORITY.oneup, data: { p2: cat(sq([['C-6', 4, 13, 1], ['E-6', 4, 13], ['G-6', 4, 14], ['C-7', 6, 14]], true), fade(14, 8)) } },
    warn: { priority: PRIORITY.warn, data: { p2: cat(sq([['A-5', 3, 11, 2], ['A-5', 3, 0], ['A-5', 3, 11]]), fade(9, 4)) } },
    fire: { priority: PRIORITY.fire, data: { noi: cat(nq([[2, 4, 12], [4, 4, 10], [6, 4, 7], [8, 4, 4]]), [{ off: true }]) } },
    door: { priority: PRIORITY.door, data: { noi: cat(nq([[13, 6, 9], [12, 6, 7], [11, 6, 5]]), [{ off: true }]) } },
    die: { priority: PRIORITY.die,
           data: { p2: cat(sq([['A-5', 2, 13, 1], ['E-5', 2, 13], ['C-5', 2, 12], ['A-4', 2, 12], ['E-4', 2, 11], ['C-4', 4, 10]], true), fade(10, 8)),
                   noi: cat(nq([[4, 3, 12], [8, 3, 9], [12, 3, 6], [14, 3, 3]]), [{ off: true }]) } },
    bossdie: { priority: PRIORITY.bossdie,
               data: { noi: cat(nq([[15, 4, 13], [14, 4, 12], [13, 4, 11], [12, 4, 9], [11, 4, 7], [10, 4, 5], [9, 4, 3]]), [{ off: true }]) } }
  };

  /* ================================================================ 曲目表 */
  var SONGS = {
    select: buildSelect(),
    stage1: buildStage1(),
    stage2: buildStage2(),
    boss: buildBoss(),
    weapon: buildWeapon(),
    clear: buildClear(),
    death: buildDeath(),
    gameover: buildGameOver()
  };

  var INFO = {
    select: { bpm: 128.6, bars: 8, mood: '期待、冷色', ch: 'p1 號角 / p2 琶音 / tri 八度低音 / noi 穩拍' },
    stage1: { bpm: 180.0, bars: 16, mood: '明快推進', ch: 'p1 旋律 / p2 延遲回音 / tri 行走低音 / noi 機械拍' },
    stage2: { bpm: 180.0, bars: 16, mood: '壓迫、重', ch: 'p1 風琴半音 / p2 長音墊 / tri 附點低音 / noi 鐵砧' },
    boss: { bpm: 225.0, bars: 16, mood: '高速壓迫', ch: 'p1 16 分下行 / p2 回音 / tri 踏板 / noi 疾走' },
    weapon: { bpm: 150.0, bars: 2, mood: '勝利上行', ch: 'p1 鐘聲 / p2 琶音 / tri 低音 / noi 鈸' },
    clear: { bpm: 150.0, bars: 2, mood: '號角收束', ch: 'p1 鐘聲 / p2 長音 / tri 低音 / noi 鈸' },
    death: { bpm: 180.0, bars: 1, mood: '半音墜落', ch: 'p1 半音下行 / p2 低八度回音 / tri 低音 / noi 悶響' },
    gameover: { bpm: 100.0, bars: 1, mood: '低沉終止', ch: 'p1 風琴 / p2 墊音 / tri 低音 / noi 悶響' }
  };
  (function () {
    var HZ = 60.0988, k;
    for (k in SONGS) {
      if (!Object.prototype.hasOwnProperty.call(SONGS, k)) continue;
      var s = SONGS[k], rowsN = s.order.length * s.rows;
      var sp = s.groove ? (s.groove.reduce(function (a, v) { return a + v; }, 0) / s.groove.length) : s.speed;
      INFO[k] = INFO[k] || {};
      INFO[k].speed = s.speed;
      INFO[k].rows = s.rows;
      INFO[k].order = s.order.length;
      INFO[k].patterns = s.patterns.length;
      INFO[k].frames = Math.round(rowsN * sp);
      INFO[k].seconds = Math.round(rowsN * sp / HZ * 100) / 100;
      INFO[k].loop = s.playLoop;
    }
  })();

  /* ================================================================ 驗證用 */
  function validate() {
    var bad = [], k, i, t, TR = ['p1', 'p2', 'tri', 'noi'];
    var toMidi = (NES.Music && NES.Music.noteToMidi) ? NES.Music.noteToMidi : null;
    for (k in SONGS) {
      if (!Object.prototype.hasOwnProperty.call(SONGS, k)) continue;
      var s = SONGS[k];
      for (i = 0; i < s.patterns.length; i++) {
        for (t = 0; t < TR.length; t++) {
          var arr = s.patterns[i][TR[t]];
          if (!arr) continue;
          if (arr.length !== s.rows) bad.push(k + ' pattern#' + i + ' ' + TR[t] + ' 長度 ' + arr.length + ' ≠ ' + s.rows);
          for (var r = 0; r < arr.length; r++) {
            var row = arr[r];
            if (!row || row.note === undefined || row.note === null) continue;
            if (TR[t] === 'noi') {
              if (row.note !== '===' && (typeof row.note !== 'number' || row.note < 0 || row.note > 15))
                bad.push(k + ' pattern#' + i + ' noi row' + r + ' 週期索引不合法：' + row.note);
            } else if (typeof row.note === 'string' && row.note !== '===' && toMidi) {
              var mv = toMidi(row.note);
              if (mv === null) bad.push(k + ' ' + TR[t] + ' row' + r + ' 音名無法解析：' + row.note);
              else if (mv < 21 || mv > 108) bad.push(k + ' ' + TR[t] + ' row' + r + ' 音高超出鋼琴範圍：' + row.note);
            }
          }
        }
      }
      for (i = 0; i < s.order.length; i++) {
        var e = s.order[i];
        for (t = 0; t < TR.length; t++) {
          var pi = e[TR[t]];
          if (pi === undefined || pi === null) continue;
          if (!s.patterns[pi]) bad.push(k + ' order#' + i + ' ' + TR[t] + ' 指向不存在的 pattern');
          else if (!s.patterns[pi][TR[t]]) bad.push(k + ' order#' + i + ' ' + TR[t] + ' 指到的 pattern 沒有該軌');
        }
      }
    }
    for (k in SFX) {
      if (!Object.prototype.hasOwnProperty.call(SFX, k)) continue;
      if (PRIORITY[k] === undefined) bad.push('音效 ' + k + ' 不在優先權表');
      var d = SFX[k].data, n;
      for (n in d) {
        if (!Object.prototype.hasOwnProperty.call(d, n)) continue;
        if (n !== 'p2' && n !== 'noi') bad.push('音效 ' + k + ' 佔用了 ' + n + '（只允許 p2 / noi）');
        if (d[n].length > 60) bad.push('音效 ' + k + ' 的 ' + n + ' 長度 ' + d[n].length + ' > 60 幀');
        if (!d[n][d[n].length - 1] || !d[n][d[n].length - 1].off) bad.push('音效 ' + k + ' 的 ' + n + ' 沒有以 {off:true} 收尾');
      }
    }
    return bad;
  }

  /* ==================================================================== API */
  function driverOf(nes) {
    var n = nes || Audio._nes;
    if (n && n.music) return n.music;
    if (NES.Music && NES.Music._default) return NES.Music;
    return null;
  }
  var WARNED = {};
  function warnOnce(msg) {
    if (WARNED[msg]) return false;
    WARNED[msg] = true;
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') console.warn(msg);
    return true;
  }

  var Audio = {
    ready: !!(NES.Music),
    SONGS: SONGS, SFX: SFX, INFO: INFO, PRIORITY: PRIORITY,
    KEYS: ['select', 'stage1', 'stage2', 'boss', 'weapon', 'clear', 'death', 'gameover'],
    NAMES: Object.keys(SFX),
    current: null, playing: false, validate: validate,
    _nes: null,
    init: function (nes) {
      if (nes) Audio._nes = nes;
      var d = driverOf(nes);
      if (!d) return false;
      var ok = true, k;
      for (k in SFX) {
        if (!Object.prototype.hasOwnProperty.call(SFX, k)) continue;
        try { d.define(k, SFX[k]); } catch (e) { ok = false; }
      }
      return ok;
    },
    has: function (key) { return !!SONGS[key]; },
    play: function (key, nes) {
      var d = driverOf(nes), s = SONGS[key];
      if (!s) { warnOnce('MG.Audio.play(): 沒有這首曲子 "' + key + '"（可用：' + Audio.KEYS.join(' / ') + '）'); return false; }
      if (!d) return false;
      try {
        d.play(s, { loop: !!s.playLoop });
        Audio.current = key;
        Audio.playing = true;
        return true;
      } catch (e) { return false; }
    },
    stop: function (nes) {
      var d = driverOf(nes);
      if (!d) return false;
      try { d.stop(); if (d.stopSfx) d.stopSfx(); Audio.playing = false; Audio.current = null; return true; }
      catch (e) { return false; }
    },
    sfx: function (name, nes) {
      var d = driverOf(nes);
      if (!SFX[name]) { warnOnce('MG.Audio.sfx(): 沒有這個音效 "' + name + '"'); return false; }
      if (!d) return false;
      try { d.sfx(name); return true; } catch (e) {
        try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; }
      }
    },
    tick: function (nes) {
      var d = driverOf(nes);
      if (!d) return false;
      try {
        d.tick();
        if (Audio.playing && d.playing === false) Audio.playing = false;
        return true;
      } catch (e) { return false; }
    },
    state: function (nes) {
      var d = driverOf(nes);
      if (!d || !d.state) return null;
      try {
        var s = d.state(), owners = {}, i;
        for (i = 0; i < s.channels.length; i++) owners[s.channels[i].name] = s.channels[i].owner || null;
        return { song: Audio.current, playing: s.playing, row: s.row, orderIndex: s.orderIndex, owners: owners };
      } catch (e) { return null; }
    },
    BUILD: { Builder: Builder, mel: mel, drm: drm, echoOf: echoOf, stab: stab, hold: hold,
             INST: INST, MIN: MIN, MAJ: MAJ, DOM7: DOM7, DIM: DIM }
  };

  MG.Audio = Audio;
  MG.SONGS = SONGS;
  MG.SFX = SFX;

  /* `tools/apu_render.py --game mech` 的相容掛點：那支工具只載入
     engine/apu.js + engine/music.js + games/<game>/song.js，並讀 `window.CR.SONGS / CR.SFX`。
     mech 的入口頁不會載入 games/cruiser/*，所以這裡只在 CR 不存在時建立，不會影響巡航艦。 */
  if (!global.CR) global.CR = { SONGS: SONGS, SFX: SFX };
  else { if (!global.CR.SONGS) global.CR.SONGS = SONGS; if (!global.CR.SFX) global.CR.SFX = SFX; }
})(typeof window !== 'undefined' ? window : this);
