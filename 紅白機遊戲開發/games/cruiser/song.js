/*
 * games/cruiser/song.js — 《星塵巡航艦》音樂 / 音效層（R2 audio agent）
 * ---------------------------------------------------------------------------
 * 擁有者：audio agent ｜ 依賴：engine/music.js（NES.Music）；沒載到也不會 throw（全部容錯）
 * 全部原創：旋律 / 和聲 / 鼓組 / 音效都是本專案自寫，只借鑑 NES 編曲技法（研究 06 §2 / §4）。
 *
 * ============================ 對外介面（TASKS R2 契約 CR.Audio） ============================
 *   CR.Audio.init(nes)          — 綁 driver、註冊全部音效（冪等）
 *   CR.Audio.play(key)          — key: 'title' | 'stage1' | 'boss' | 'clear' | 'gameover' | 'extend'
 *   CR.Audio.stop()             — 停止音樂（音效不受影響；要一起停用 stopAll()）
 *   CR.Audio.sfx(name, opt)     — name 見 CR.Audio.PRIORITY；opt 轉給 driver.sfx（可覆寫 channels / priority）
 *   CR.Audio.tick(nes)          — **每幀呼叫一次，放在 game.update() 的最後**
 *   （容錯：以上每個函式的第一個參數都可以傳 nes，例如 play(nes,'stage1') 也接受）
 *   CR.Audio.state(nes)         — 測試用快照；CR.SONGS / CR.SFX — 原始資料（tools/apu_render.py 用）
 *
 * ============================ 聲道分配（硬規則） ============================
 *   p1  主旋律              ← 音效**不搶**（只有 'die' 例外）
 *   p2  回音軌 / 和聲琶音   ← 音效主要佔用軌
 *   tri 低音                ← 音效**不搶**（只有 'die' 例外）
 *   noi 鼓組                ← 打擊類音效佔用軌
 *   dmc 未使用（R2 不放取樣，卡帶預算留給圖）
 *   ※ 契約原文的 explode =「雜訊長 + 三角波下滑」，為了遵守「不搶三角波」，
 *     下滑的低頻軀幹改走 p2（音色等價、不會切斷低音線）。要原汁原味可以自己覆寫：
 *     CR.Audio.sfx('explode', {channels:['noi','tri']})。
 *
 * ============================ 曲目表 ============================
 *   key       speed  rows/小節  小節  BPM      loop  聲道                長度
 *   title       8      16        8    112.5    是    p1 p2(arp) tri noi   ~8.5 s
 *   stage1      6      16       16    150      是    p1 p2(回音) tri noi  25.6 s
 *   boss        5      16        8    180      是    p1 p2(arp) tri noi   10.7 s
 *   clear       5      16        3    180      否    p1 p2 tri noi        4.0 s
 *   gameover    6     16+14      2    150      否    p1 p2 tri noi        3.0 s
 *   extend      3      20        1    300      否    p1 p2 tri            1.0 s
 *   （BPM = 3600 / (speed × 4)，一小節 16 row = 4 拍）
 *
 * ============================ 用到的新效果欄（engine/music.js 本輪新增）============================
 *   detune : 固定週期偏移 → stage1 / title / clear 的回音軌 +3、gameover 的哀嘆軌 +5
 *   slide  : 每幀週期 ±n → shot / missile / explode / die / gameover 的滑音
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var M = NES.Music || null;

  /* ===================================================================== 工具 */

  var BAR = 16;                       // 一小節 16 row（4 拍 × 16 分音符）

  // '.' = 沒有事件；其餘 = 音名。回傳攤平的音名陣列（每個元素 = 1 row）
  function flat(barStrings) {
    var out = [];
    for (var b = 0; b < barStrings.length; b++) {
      var t = barStrings[b].split(/\s+/).filter(function (s) { return s.length; });
      if (t.length !== BAR) throw new Error('小節 ' + (b + 1) + ' 應該有 ' + BAR + ' 個 token，實際 ' + t.length);
      for (var i = 0; i < BAR; i++) out.push(t[i] === '.' ? null : t[i]);
    }
    return out;
  }

  // 攤平陣列 → row 物件陣列；每個有音的 row 都帶上樂器 / 音量 / 占空比 / detune（driver 是持續狀態，重寫無害）
  function rows(notes, opt) {
    opt = opt || {};
    var out = new Array(notes.length);
    for (var i = 0; i < notes.length; i++) {
      if (!notes[i]) { out[i] = null; continue; }
      var r = { note: notes[i] };
      if (opt.inst !== undefined) r.inst = opt.inst;
      if (opt.vol !== undefined) r.vol = opt.vol;
      if (opt.duty !== undefined) r.duty = opt.duty;
      if (opt.detune !== undefined) r.detune = opt.detune;
      if (opt.arp !== undefined) r.arp = opt.arp;
      if (opt.slide !== undefined) r.slide = opt.slide;
      if (opt.cut !== undefined) r.cut = opt.cut;
      out[i] = r;
    }
    return out;
  }

  // 回音軌：把主旋律延後 delay 個 row（wrap = 循環曲要接回開頭，讓 loop 點不斷句）
  function echo(notes, delay, wrap) {
    var L = notes.length, out = new Array(L);
    for (var i = 0; i < L; i++) {
      var j = i - delay;
      out[i] = (j >= 0) ? notes[j] : (wrap ? notes[(j % L + L) % L] : null);
    }
    return out;
  }

  // 攤平 row 陣列 → 每 n 個切一段（= 一個 pattern 的一軌）
  function slice(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  // 由 {rowIndex: row} 產生固定長度的一軌
  function map(len, m) {
    var a = new Array(len);
    for (var i = 0; i < len; i++) a[i] = m[i] || null;
    return a;
  }

  // 把各軌的 pattern 陣列組成 song.patterns + order
  function assemble(tracks, nPat) {
    var pats = [], order = [];
    for (var i = 0; i < nPat; i++) {
      var p = {};
      for (var k in tracks) {
        if (!Object.prototype.hasOwnProperty.call(tracks, k)) continue;
        if (tracks[k][i]) p[k] = tracks[k][i];
      }
      pats.push(p); order.push(i);
    }
    return { patterns: pats, order: order };
  }

  /* ================================================================ 共用樂器 */
  // 音量 / 占空比 / 音高包絡都是每幀一格（研究 06 §2.5）
  var INST = {
    // 主旋律：25% 方波，起音亮、持續衰減一點點
    lead: { vol: [15, 15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10], volLoop: 12, duty: [1, 1, 1, 2], dutyLoop: 3 },
    // 回音：12.5% 細方波，起音就比較小、衰得快（配合 row 音量 -2 級）
    echo: { vol: [7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1], volLoop: 12, duty: [0] },
    // 和聲琶音墊
    pad: { vol: [10, 10, 9, 9, 8, 8, 7, 7, 6], volLoop: 8, duty: [0] },
    // 魔王的失真號角：占空比每 2 幀跳一次，聽起來像鋸齒
    horn: { vol: [15, 15, 14, 14, 13, 13, 12], volLoop: 6, duty: [2, 2, 1, 1, 0, 0, 3, 3], dutyLoop: 0 },
    // 過關號角：長音不衰
    fanfare: { vol: [15, 15, 15, 15, 15, 14], volLoop: 5, duty: [2, 2, 1, 1], dutyLoop: 0 },
    bass: {},                     // 三角波沒有音量，樂器只是佔位
    kick: { vol: [15, 14, 11, 8, 5, 3, 1, 0], volLoop: 7 },
    snare: { vol: [15, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0], volLoop: 11 },
    hat: { vol: [7, 4, 2, 1, 0], volLoop: 4 },
    crash: { vol: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], volLoop: 15 },
    rumble: { vol: [10, 11, 12, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], volLoop: 15 }
  };

  // 雜訊軌的「鼓」= 週期索引（0 最高、15 最低）
  function K(v) { return { note: 12, inst: 'kick', vol: v === undefined ? 14 : v, duty: 0 }; }
  function S(v) { return { note: 6, inst: 'snare', vol: v === undefined ? 12 : v, duty: 0 }; }
  function H(v) { return { note: 2, inst: 'hat', vol: v === undefined ? 6 : v, duty: 0 }; }
  function CY(v) { return { note: 1, inst: 'crash', vol: v === undefined ? 12 : v, duty: 0 }; }

  var DRUM_A = map(BAR, { 0: K(), 2: H(), 4: S(), 6: H(), 8: K(), 10: H(), 12: S(), 14: H() });
  var DRUM_B = map(BAR, { 0: K(), 2: H(), 4: S(), 6: K(13), 8: K(), 10: H(), 12: S(), 14: H(5) });
  var DRUM_F = map(BAR, { 0: K(), 2: H(), 4: S(), 6: H(), 8: K(), 10: S(9), 12: S(11), 13: S(12), 14: S(13), 15: S(15) });
  var DRUM_16 = map(BAR, {                    // 魔王：16 beat
    0: K(), 1: H(4), 2: H(5), 3: H(4), 4: S(), 5: H(4), 6: K(12), 7: H(4),
    8: K(), 9: H(4), 10: H(5), 11: H(4), 12: S(), 13: H(4), 14: S(9), 15: H(5)
  });

  /* ============================================================= ① stage1 */
  /* E 小調、150 BPM、16 小節循環。記憶點 = 第 1 小節的上行動機 E-G-B-E（之後在 7 / 13 小節換位再現）。
     p1 主旋律 25% ／ p2 = 主旋律延後 4 row（1 拍）、音量 -2 級、detune +3（微失諧回音，研究 06 §2.2）
     ／ 三角波八度跳躍低音 ／ 雜訊 16 beat 鼓。 */

  var ST1_LEAD = flat([
    'E-4 .   G-4 .   B-4 .   E-5 .   .   .   D-5 .   B-4 .   G-4 .  ',   //  1 Em  ★上行動機
    'A-4 .   B-4 .   E-5 .   .   .   .   .   .   .   .   .   .   .  ',   //  2 Em
    'C-5 .   E-5 .   G-5 .   E-5 .   .   .   D-5 .   C-5 .   B-4 .  ',   //  3 C
    'D-5 .   F#5 .   A-5 .   F#5 .   .   .   .   .   .   .   .   .  ',   //  4 D
    'E-5 .   G-5 .   B-5 .   G-5 .   .   .   E-5 .   D-5 .   B-4 .  ',   //  5 Em
    'C-5 .   D-5 .   E-5 .   G-5 .   .   .   .   .   E-5 .   D-5 .  ',   //  6 C
    'A-4 .   C-5 .   E-5 .   A-5 .   .   .   G-5 .   E-5 .   C-5 .  ',   //  7 Am ★動機換位
    'B-4 .   D#5 .   F#5 .   B-5 .   .   .   A-5 .   F#5 .   D#5 .  ',   //  8 B
    'A-5 .   .   .   G-5 .   .   .   E-5 .   .   .   D-5 .   E-5 .  ',   //  9 Am B 段
    'F-5 .   .   .   E-5 .   .   .   C-5 .   .   .   A-4 .   C-5 .  ',   // 10 F
    'G-5 .   .   .   E-5 .   .   .   C-5 .   .   .   D-5 .   E-5 .  ',   // 11 C
    'D-5 .   .   .   B-4 .   .   .   G-4 .   .   .   B-4 .   D-5 .  ',   // 12 G
    'A-4 .   C-5 .   E-5 .   A-5 .   G-5 .   E-5 .   C-5 .   A-4 .  ',   // 13 Am ★動機再現
    'F-5 .   .   .   E-5 .   .   .   D-5 .   C-5 .   A-4 .   C-5 .  ',   // 14 F
    'D-5 .   F#5 .   A-5 .   D-6 .   .   .   C-6 .   A-5 .   F#5 .  ',   // 15 D
    'B-5 .   .   .   A-5 .   .   .   F#5 .   .   .   D#5 .   B-4 .  '    // 16 B  →回 1
  ]);

  var ST1_BASS = flat([
    'E-2 .   E-3 .   E-2 .   E-3 .   E-2 .   E-3 .   B-2 .   D-3 .  ',
    'E-2 .   E-3 .   E-2 .   E-3 .   E-2 .   E-3 .   G-2 .   B-2 .  ',
    'C-3 .   C-4 .   C-3 .   C-4 .   C-3 .   C-4 .   G-3 .   E-3 .  ',
    'D-3 .   D-4 .   D-3 .   D-4 .   D-3 .   D-4 .   A-3 .   F#3 .  ',
    'E-2 .   E-3 .   E-2 .   E-3 .   E-2 .   E-3 .   B-2 .   D-3 .  ',
    'C-3 .   C-4 .   C-3 .   C-4 .   C-3 .   C-4 .   G-3 .   E-3 .  ',
    'A-2 .   A-3 .   A-2 .   A-3 .   A-2 .   A-3 .   E-3 .   C-3 .  ',
    'B-2 .   B-3 .   B-2 .   B-3 .   B-2 .   B-3 .   F#3 .   D#3 .  ',
    'A-2 .   A-3 .   A-2 .   A-3 .   A-2 .   A-3 .   E-3 .   G-3 .  ',
    'F-2 .   F-3 .   F-2 .   F-3 .   F-2 .   F-3 .   C-3 .   A-2 .  ',
    'C-3 .   C-4 .   C-3 .   C-4 .   C-3 .   C-4 .   G-3 .   E-3 .  ',
    'G-2 .   G-3 .   G-2 .   G-3 .   G-2 .   G-3 .   D-3 .   B-2 .  ',
    'A-2 .   A-3 .   A-2 .   A-3 .   A-2 .   A-3 .   E-3 .   G-3 .  ',
    'F-2 .   F-3 .   F-2 .   F-3 .   F-2 .   F-3 .   C-3 .   A-2 .  ',
    'D-3 .   D-4 .   D-3 .   D-4 .   D-3 .   D-4 .   A-3 .   F#3 .  ',
    'B-2 .   B-3 .   B-2 .   B-3 .   B-2 .   B-3 .   F#3 .   D#3 .  '
  ]);

  var ST1_DRUM = [];
  for (var _b = 0; _b < 16; _b++) {
    ST1_DRUM.push((_b === 7 || _b === 15) ? DRUM_F : ((_b % 4 === 3) ? DRUM_B : DRUM_A));
  }

  var ST1_ECHO_DELAY = 4;             // 1 拍
  var STAGE1 = (function () {
    var t = assemble({
      p1: slice(rows(ST1_LEAD, { inst: 'lead', vol: 15, duty: 1 }), BAR),
      p2: slice(rows(echo(ST1_LEAD, ST1_ECHO_DELAY, true), { inst: 'echo', vol: 13, duty: 0, detune: 3 }), BAR),
      tri: slice(rows(ST1_BASS, { inst: 'bass' }), BAR),
      noi: ST1_DRUM
    }, 16);
    return {
      name: '星塵巡航艦 STAGE 1「小行星帶」', speed: 6, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ============================================================== ② title */
  /* 112.5 BPM、8 小節、寬廣的太空感：長音主旋律 + 琶音和弦墊 + 半音下行的低音。 */

  var TI_LEAD = flat([
    'E-5 .   .   .   .   .   B-4 .   .   .   E-5 .   .   .   .   .  ',
    'G-5 .   .   .   .   .   F#5 .   .   .   E-5 .   .   .   .   .  ',
    'D-5 .   .   .   .   .   A-4 .   .   .   D-5 .   .   .   .   .  ',
    'F#5 .   .   .   .   .   E-5 .   .   .   D-5 .   .   .   .   .  ',
    'C-5 .   .   .   .   .   G-4 .   .   .   C-5 .   .   .   .   .  ',
    'E-5 .   .   .   .   .   D-5 .   .   .   C-5 .   .   .   .   .  ',
    'B-4 .   .   .   D-5 .   .   .   F#5 .   .   .   A-5 .   .   .  ',
    'B-5 .   .   .   .   .   .   .   .   .   .   .   .   .   .   .  '
  ]);
  var TI_BASS = flat([
    'E-2 .   .   .   E-3 .   .   .   E-2 .   .   .   B-2 .   .   .  ',
    'E-2 .   .   .   E-3 .   .   .   C-3 .   .   .   B-2 .   .   .  ',
    'D-3 .   .   .   D-4 .   .   .   A-2 .   .   .   D-3 .   .   .  ',
    'D-3 .   .   .   A-3 .   .   .   D-3 .   .   .   F#3 .   .   .  ',
    'C-3 .   .   .   C-4 .   .   .   G-2 .   .   .   C-3 .   .   .  ',
    'C-3 .   .   .   G-3 .   .   .   C-3 .   .   .   E-3 .   .   .  ',
    'B-2 .   .   .   B-3 .   .   .   F#3 .   .   .   B-2 .   .   .  ',
    'E-2 .   .   .   E-3 .   .   .   B-2 .   .   .   E-3 .   .   .  '
  ]);
  var MIN3 = [0, 3, 7], MAJ3 = [0, 4, 7];
  function padBar(note, arp) {
    return map(BAR, { 0: { note: note, inst: 'pad', vol: 11, duty: 0, arp: arp } });
  }
  var TI_PAD = [
    padBar('E-3', MIN3), padBar('E-3', MIN3), padBar('D-3', MAJ3), padBar('D-3', MAJ3),
    padBar('C-3', MAJ3), padBar('C-3', MAJ3), padBar('B-2', MAJ3), padBar('E-3', MIN3)
  ];
  var TI_DRUM = [
    map(BAR, { 0: CY(9) }), map(BAR, { 0: K(11), 8: H(5) }),
    map(BAR, { 0: CY(9) }), map(BAR, { 0: K(11), 8: H(5) }),
    map(BAR, { 0: CY(9) }), map(BAR, { 0: K(11), 8: H(5) }),
    map(BAR, { 0: K(12), 4: S(9), 8: K(12), 12: S(9) }),
    map(BAR, { 0: CY(13), 8: S(10), 10: S(11), 12: S(12), 14: S(14) })
  ];
  var TITLE = (function () {
    var t = assemble({
      p1: slice(rows(TI_LEAD, { inst: 'lead', vol: 15, duty: 2 }), BAR),
      p2: TI_PAD,
      tri: slice(rows(TI_BASS, { inst: 'bass' }), BAR),
      noi: TI_DRUM
    }, 8);
    return {
      name: '星塵巡航艦 TITLE', speed: 8, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* =============================================================== ③ boss */
  /* 180 BPM、8 小節。緊張感來源：p1 的半音下行 16 分音符、p2 的減七快速琶音、tri 的半音走音低音。 */

  var BO_LEAD = flat([
    'C-6 B-5 A#5 A-5 G#5 G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4',
    'A-4 .   .   .   A-4 .   A#4 .   B-4 .   C-5 .   C#5 .   D-5 .  ',
    'D#5 D-5 C#5 C-5 B-4 A#4 A-4 G#4 G-4 F#4 F-4 E-4 D#4 D-4 C#4 C-4',
    'C-4 .   .   .   E-4 .   G-4 .   A#4 .   C-5 .   D#5 .   F#5 .  ',
    'C-6 B-5 A#5 A-5 G#5 G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4',
    'A-4 .   .   .   A-4 .   A#4 .   B-4 .   C-5 .   C#5 .   D-5 .  ',
    'G#5 G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4 G#4 G-4 F#4 F-4',
    'E-4 .   .   .   E-4 .   .   .   E-4 .   E-4 .   E-4 .   E-4 .  '
  ]);
  var BO_BASS = flat([
    'E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .  ',
    'A-2 .   A-2 .   A#2 .   A#2 .   B-2 .   B-2 .   C-3 .   C#3 .  ',
    'D-3 .   D-3 .   C#3 .   C#3 .   C-3 .   C-3 .   B-2 .   A#2 .  ',
    'A-2 .   A-2 .   A-2 .   A-2 .   A-2 .   A-2 .   A-2 .   A-2 .  ',
    'E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .   E-2 .  ',
    'A-2 .   A-2 .   A#2 .   A#2 .   B-2 .   B-2 .   C-3 .   C#3 .  ',
    'G#2 .   G#2 .   G-2 .   G-2 .   F#2 .   F#2 .   F-2 .   E-2 .  ',
    'E-2 .   .   .   E-2 .   .   .   E-2 .   E-2 .   E-2 .   E-2 .  '
  ]);
  var DIM7 = [0, 3, 6, 9], MIN7 = [0, 3, 7, 10];
  function arpBar(a, b) {                     // 一小節兩個半拍琶音（row 0 / row 8）
    return map(BAR, {
      0: { note: a[0], inst: 'horn', vol: 9, duty: 0, arp: a[1] },
      8: { note: b[0], inst: 'horn', vol: 9, duty: 0, arp: b[1] }
    });
  }
  var BO_ARP = [
    arpBar(['E-4', MIN7], ['E-4', MIN7]), arpBar(['A-3', DIM7], ['B-3', DIM7]),
    arpBar(['D-4', DIM7], ['C-4', DIM7]), arpBar(['A-3', MIN7], ['A-3', MIN7]),
    arpBar(['E-4', MIN7], ['E-4', MIN7]), arpBar(['A-3', DIM7], ['C#4', DIM7]),
    arpBar(['G#3', DIM7], ['F#3', DIM7]), arpBar(['E-4', DIM7], ['E-4', DIM7])
  ];
  var BO_DRUM = [DRUM_16, DRUM_16, DRUM_16, DRUM_F, DRUM_16, DRUM_16, DRUM_16, DRUM_F];
  var BOSS = (function () {
    var t = assemble({
      p1: slice(rows(BO_LEAD, { inst: 'horn', vol: 15, duty: 2 }), BAR),
      p2: BO_ARP,
      tri: slice(rows(BO_BASS, { inst: 'bass' }), BAR),
      noi: BO_DRUM
    }, 8);
    return {
      name: '星塵巡航艦 BOSS「核心要塞」', speed: 5, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ============================================================== ④ clear */
  /* 過關 jingle：3 小節 × 16 row × speed 5 = 240 幀 ≈ 4.0 秒，不循環。上行號角 + 大三和弦琶音。 */

  var CL_LEAD = flat([
    'E-5 .   G-5 .   B-5 .   E-6 .   .   .   B-5 .   E-6 .   .   .  ',
    'G-6 .   .   .   F#6 .   .   .   E-6 .   .   .   .   .   .   .  ',
    'B-5 .   E-6 .   G-6 .   B-6 .   .   .   .   .   .   .   .   .  '
  ]);
  var CL_BASS = flat([
    'E-3 .   E-2 .   E-3 .   E-2 .   B-2 .   B-3 .   E-3 .   E-2 .  ',
    'C-3 .   C-4 .   D-3 .   D-4 .   E-3 .   E-4 .   E-3 .   B-2 .  ',
    'E-2 .   E-3 .   B-2 .   E-3 .   E-2 .   .   .   .   .   .   .  '
  ]);
  var CL_DRUM = [
    map(BAR, { 0: CY(14), 4: K(13), 8: S(12), 12: K(13) }),
    map(BAR, { 0: S(12), 4: S(12), 8: S(13), 12: S(14) }),
    map(BAR, { 0: CY(15), 4: S(11), 6: S(12), 8: S(13), 10: S(14), 12: CY(15) })
  ];
  var CLEAR = (function () {
    var t = assemble({
      p1: slice(rows(CL_LEAD, { inst: 'fanfare', vol: 15, duty: 2 }), BAR),
      // 回音軌：延後 2 row、-2 級音量、detune +3
      p2: slice(rows(echo(CL_LEAD, 2, false), { inst: 'echo', vol: 13, duty: 0, detune: 3 }), BAR),
      tri: slice(rows(CL_BASS, { inst: 'bass' }), BAR),
      noi: CL_DRUM
    }, 3);
    return {
      name: '星塵巡航艦 STAGE CLEAR', speed: 5, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* =========================================================== ⑤ gameover */
  /* (16 + 14) row × speed 6 = 180 幀 = 3.0 秒，不循環。半音下行 + 最後一個和弦整軌下滑。 */

  var GO_LEAD_A = flat(['E-5 .   .   .   D#5 .   .   .   D-5 .   .   .   C#5 .   .   .  ']);
  var GO_BASS_A = flat(['E-3 .   .   .   D#3 .   .   .   D-3 .   .   .   C#3 .   .   .  ']);
  var GO_LEAD_B = [{ note: 'C-5' }, null, null, null, { note: 'B-4' }, null, null, null,
  { note: 'A-4', slide: 6 }, null, null, null, null, null];                 // 最後一音邊響邊下滑
  var GO_BASS_B = [{ note: 'C-3' }, null, null, null, { note: 'B-2' }, null, null, null,
  { note: 'A-2', slide: 4 }, null, null, null, null, null];
  var GO_ECHO_B = [null, null, { note: 'C-5' }, null, null, null, { note: 'B-4' }, null,
    null, null, { note: 'A-4', slide: 6 }, null, null, null];
  var GAMEOVER = (function () {
    var leadA = rows(GO_LEAD_A, { inst: 'lead', vol: 13, duty: 2 });
    var echoA = rows(echo(GO_LEAD_A, 2, false), { inst: 'echo', vol: 11, duty: 0, detune: 5 });
    var bassA = rows(GO_BASS_A, { inst: 'bass' });
    function deco(arr, opt) {                        // 手寫 row 補上樂器 / 音量欄
      return arr.map(function (r) {
        if (!r) return null;
        var o = { note: r.note };
        for (var k in opt) o[k] = opt[k];
        if (r.slide !== undefined) o.slide = r.slide;
        return o;
      });
    }
    return {
      name: '星塵巡航艦 GAME OVER', speed: 6, rows: BAR, loop: 0, instruments: INST,
      patterns: [
        { p1: leadA, p2: echoA, tri: bassA, noi: map(BAR, { 0: CY(11), 8: { note: 14, inst: 'rumble', vol: 7, duty: 0 } }) },
        {
          p1: deco(GO_LEAD_B, { inst: 'lead', vol: 13, duty: 2 }),
          p2: deco(GO_ECHO_B, { inst: 'echo', vol: 11, duty: 0, detune: 5 }),
          tri: deco(GO_BASS_B, { inst: 'bass' }),
          noi: map(14, { 0: { note: 14, inst: 'rumble', vol: 8, duty: 0 }, 8: { note: 15, inst: 'rumble', vol: 6, duty: 0 } })
        }
      ],
      order: [0, 1]
    };
  })();

  /* ============================================================= ⑥ extend */
  /* 1-UP：20 row × speed 3 = 60 幀 = 1.0 秒，不循環。大三和弦上行琶音 + 回音。 */

  var EX_LEAD = ['C-5', 'E-5', 'G-5', 'C-6', 'E-6', 'G-6', 'C-7', null, null, null,
    'G-6', null, 'C-7', null, null, null, null, null, null, null];
  var EX_BASS = ['C-3', null, null, null, 'C-4', null, null, null, 'G-3', null, null, null,
    'C-4', null, null, null, null, null, null, null];
  var EXTEND = {
    name: '星塵巡航艦 1-UP', speed: 3, rows: 20, loop: 0, instruments: INST,
    patterns: [{
      p1: rows(EX_LEAD, { inst: 'fanfare', vol: 15, duty: 1 }),
      p2: rows(echo(EX_LEAD, 1, false), { inst: 'echo', vol: 13, duty: 0, detune: 4 }),
      tri: rows(EX_BASS, { inst: 'bass' })
    }],
    order: [0]
  };

  var SONGS = { title: TITLE, stage1: STAGE1, boss: BOSS, clear: CLEAR, gameover: GAMEOVER, extend: EXTEND };
  var LOOPED = { title: true, stage1: true, boss: true, clear: false, gameover: false, extend: false };

  /* ================================================================= 音效 */
  /* 優先權（數字大者搶得走小者佔用的聲道）：
       die 15 > explode 8 > powerup 7 = extend 7 > laser 6 > capsule 5 > missile 4 > hit 3 > shot 2
     聲道：除了 die，一律只用 p2 / noi，主旋律 p1 與低音 tri 不受干擾。 */

  var SFX = {
    // 自機彈：短方波下滑（duty 12.5%、6 幀、slide +16/幀）
    shot: {
      priority: 2, channels: ['p2'],
      data: {
        p2: [{ duty: 0, vol: 9, note: 'C-6', slide: 16 }, { vol: 8 }, { vol: 7 }, { vol: 5 }, { vol: 3 }, { vol: 1 }, { off: true }]
      }
    },
    // 雷射：持續高頻，占空比每幀輪替 0/2/1 做出鋸齒感（研究 06 §2.5）
    laser: {
      priority: 6, channels: ['p2'],
      data: {
        p2: [
          { duty: 0, vol: 12, note: 'A-6' }, { duty: 2 }, { duty: 1 }, { duty: 0, vol: 11 },
          { duty: 2 }, { duty: 1 }, { duty: 0, vol: 10 }, { duty: 2, vol: 9 },
          { duty: 1, vol: 8 }, { duty: 0, vol: 7 }, { duty: 2, vol: 6 }, { duty: 1, vol: 5 },
          { duty: 0, vol: 4 }, { duty: 2, vol: 3 }, { vol: 2 }, { vol: 1 }, { off: true }
        ]
      }
    },
    // 飛彈：低頻 50% 方波快速上滑（發射推力感）
    missile: {
      priority: 4, channels: ['p2'],
      data: {
        p2: [{ duty: 2, vol: 10, note: 'E-3', slide: -26 }, { vol: 10 }, { vol: 9 }, { vol: 9 },
        { vol: 8 }, { vol: 7 }, { vol: 6 }, { vol: 4 }, { vol: 2 }, { off: true }]
      }
    },
    // 命中：雜訊短促一擊
    hit: {
      priority: 3, channels: ['noi'],
      data: { noi: [{ duty: 1, vol: 11, note: 5 }, { vol: 8, note: 6 }, { vol: 5, note: 7 }, { vol: 2, note: 8 }, { off: true }] }
    },
    // 爆炸：雜訊長模式由高到低 + p2 低頻下滑（契約寫三角波，改走 p2 以免切斷低音線）
    explode: {
      priority: 8, channels: ['noi', 'p2'],
      data: {
        noi: [{ duty: 0, vol: 15, note: 3 }, { note: 4 }, { vol: 14, note: 5 }, { note: 6 }, { vol: 13, note: 7 },
        { note: 8 }, { vol: 11, note: 9 }, { note: 10 }, { vol: 9, note: 11 }, { note: 11 },
        { vol: 7, note: 12 }, { note: 12 }, { vol: 5, note: 13 }, { note: 13 }, { vol: 3, note: 14 },
        { note: 14 }, { vol: 2, note: 15 }, { vol: 1 }, { off: true }],
        p2: [{ duty: 2, vol: 11, note: 'A-3', slide: 34 }, { vol: 10 }, { vol: 10 }, { vol: 9 }, { vol: 9 },
        { vol: 8 }, { vol: 7 }, { vol: 6 }, { vol: 5 }, { vol: 4 }, { vol: 3 }, { vol: 2 }, { vol: 1 }, { off: true }]
      }
    },
    // 撿膠囊：兩音上行的清脆「叮」
    capsule: {
      priority: 5, channels: ['p2'],
      data: {
        p2: [{ duty: 0, vol: 11, note: 'E-6' }, null, null, { note: 'B-6', vol: 11, retrigger: true },
          null, null, null, { vol: 9 }, { vol: 7 }, { vol: 5 }, { vol: 3 }, { vol: 1 }, { off: true }]
      }
    },
    // 強化啟動：上行大三和弦琶音（研究 06 §4「1-Up / 完成 jingle = 上行琶音」）
    powerup: {
      priority: 7, channels: ['p2'],
      data: {
        p2: [{ duty: 1, vol: 12, note: 'C-5' }, { note: 'E-5', retrigger: true }, { note: 'G-5', retrigger: true },
        { note: 'C-6', retrigger: true }, { note: 'E-6', retrigger: true }, { note: 'G-6', retrigger: true },
        { note: 'C-7', retrigger: true }, { vol: 11 }, { vol: 10 }, { vol: 8 }, { vol: 6 }, { vol: 4 },
        { vol: 2 }, { off: true }]
      }
    },
    // 1-UP 音效版（不想中斷音樂時用；完整 jingle 用 play('extend')）
    extend: {
      priority: 7, channels: ['p2'],
      data: {
        p2: [{ duty: 1, vol: 12, note: 'C-6' }, null, { note: 'E-6', retrigger: true }, null,
        { note: 'G-6', retrigger: true }, null, { note: 'C-7', retrigger: true }, null, null,
        { note: 'G-6', retrigger: true }, null, { note: 'C-7', retrigger: true }, null, null,
        { vol: 9 }, { vol: 6 }, { vol: 3 }, { off: true }]
      }
    },
    // 自機被擊墜：唯一會搶下 p1 / tri 的音效（研究 06 §4「death：通常停止音樂再播」）
    die: {
      priority: 15, channels: ['p1', 'p2', 'tri', 'noi'],
      data: {
        p1: [{ duty: 2, vol: 14, note: 'A-5', slide: 9 }].concat(fade(14, 34)).concat([{ off: true }]),
        p2: [{ duty: 1, vol: 12, note: 'A-4', slide: 5, detune: 4 }].concat(fade(12, 34)).concat([{ off: true }]),
        tri: [{ note: 'A-3', slide: 7 }].concat(hold(34)).concat([{ off: true }]),
        noi: [{ duty: 0, vol: 13, note: 4 }, { note: 5 }, { vol: 12, note: 6 }, { note: 7 }, { vol: 10, note: 8 },
        { note: 9 }, { vol: 8, note: 10 }, { note: 11 }, { vol: 6, note: 12 }, { note: 13 },
        { vol: 4, note: 14 }, { vol: 2, note: 15 }, { off: true }]
      }
    }
  };

  function fade(from, n) {                 // n 幀內由 from 線性衰減到 0
    var a = [];
    for (var i = 1; i <= n; i++) a.push({ vol: Math.max(0, Math.round(from * (1 - i / n))) });
    return a;
  }
  function hold(n) { var a = []; for (var i = 0; i < n; i++) a.push(null); return a; }

  var PRIORITY = {};
  for (var _n in SFX) if (Object.prototype.hasOwnProperty.call(SFX, _n)) PRIORITY[_n] = SFX[_n].priority;

  /* ================================================================== API */

  function driverOf(nes) {
    if (nes && nes.music) return nes.music;
    if (NES.Music && NES.Music._default) return NES.Music;
    return null;
  }

  // 容錯：init/play/stop/sfx/tick 的第一個參數可以是 nes、也可以直接是真正的參數
  function split(a, b) {
    if (a && typeof a === 'object' && (a.music || a.apu || a.ppu)) return { nes: a, arg: b };
    return { nes: null, arg: a };
  }

  var Audio = {
    ready: !!(M && M.create),
    SONGS: SONGS,
    SFX: SFX,
    PRIORITY: PRIORITY,
    ECHO_DELAY: ST1_ECHO_DELAY,
    current: null,
    playing: false,
    _d: null,

    init: function (nes) {
      var d = driverOf(nes);
      if (!d) return false;
      Audio._d = d;
      for (var n in SFX) {
        if (!Object.prototype.hasOwnProperty.call(SFX, n)) continue;
        try { d.define(n, SFX[n]); } catch (e) { /* driver 不支援就算了，不能拖垮 boot */ }
      }
      return true;
    },

    driver: function (nes) { return driverOf(nes) || Audio._d; },

    // play('stage1') 或 play(nes, 'stage1')
    play: function (a, b) {
      var s = split(a, b), d = Audio.driver(s.nes), key = s.arg;
      var song = SONGS[key];
      if (!d || !song) return false;
      try {
        d.play(song, { loop: !!LOOPED[key] });
        Audio.current = key; Audio.playing = true;
        return true;
      } catch (e) { return false; }
    },

    stop: function (a) {
      var d = Audio.driver(split(a, null).nes);
      if (!d) return false;
      try { d.stop(); Audio.playing = false; Audio.current = null; return true; } catch (e) { return false; }
    },

    stopAll: function (a) {
      var d = Audio.driver(split(a, null).nes);
      if (!d) return false;
      try { d.stopSfx(); } catch (e) { /* ignore */ }
      return Audio.stop(a);
    },

    // sfx('shot') 或 sfx(nes, 'shot')；opt 直接轉給 driver.sfx
    sfx: function (a, b, c) {
      var s = split(a, b), d = Audio.driver(s.nes), name = s.arg;
      var opt = (s.nes ? c : b) || undefined;
      if (!d || !SFX[name]) return false;
      // 'die' 依 NES 慣例先停音樂（它會搶走全部五軌，留著音樂只會在音效結束後亂跳）
      if (name === 'die') { try { d.stop(); Audio.playing = false; } catch (e) { /* ignore */ } }
      try { d.sfx(name, opt); return true; } catch (e) { return false; }
    },

    // ★ 放在 game.update() 的最後一行
    tick: function (a) {
      var d = Audio.driver(split(a, null).nes);
      if (!d) return;
      try { d.tick(); } catch (e) { /* 音樂出錯不能拖垮遊戲迴圈 */ }
    },

    state: function (a) {
      var d = Audio.driver(split(a, null).nes);
      if (!d || !d.state) return null;
      try {
        var st = d.state();
        var owners = {};
        for (var i = 0; i < st.channels.length; i++) owners[st.channels[i].name] = st.channels[i].owner || null;
        return {
          song: Audio.current, playing: st.playing, orderIndex: st.orderIndex, row: st.row,
          sfx: st.sfx.map(function (x) { return x.name; }), owners: owners
        };
      } catch (e) { return null; }
    }
  };

  CR.Audio = Audio;
  CR.SONGS = SONGS;
  CR.SFX = SFX;
})();
