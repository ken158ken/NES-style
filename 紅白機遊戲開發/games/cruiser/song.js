/*
 * games/cruiser/song.js — 《星塵巡航艦》音樂 / 音效層（R2 audio agent）
 * ---------------------------------------------------------------------------
 * 擁有者：audio agent ｜ 依賴：engine/music.js（NES.Music）；沒載到也不會 throw（全部容錯）
 * 全部原創：旋律 / 和聲 / 鼓組 / 音效都是本專案自寫，只借鑑 NES 編曲技法（研究 06 §2 / §4）。
 *
 * ============================ 對外介面（TASKS R2 契約 CR.Audio） ============================
 *   CR.Audio.init(nes)          — 綁 driver、註冊全部音效（冪等）
 *   CR.Audio.play(key)          — key 見下面曲目表（CR.Audio.KEYS 是完整清單）：
 *                                 'title' | 'stage1'~'stage6' | 'boss' | 'boss_final' |
 *                                 'clear' / 'stageclear' | 'ending' | 'gameover' | 'extend'
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
 * ============================ 曲目表（R2 六首 + R3 八鍵）============================
 *   key         調性 / 素材         speed rows/小節 小節  BPM    loop 聲道                   長度
 *   title       E 小調                8     16       8   112.5  是   p1 p2(琶音) tri noi     17.0 s
 *   stage1      E 小調                6     16      16   150    是   p1 p2(回音4) tri noi    25.6 s
 *   boss        E 小調 / 半音下行      5     16       8   180    是   p1 p2(琶音) tri noi     10.7 s
 *   clear       E 大調                5     16       3   180    否   p1 p2 tri noi            4.0 s
 *   gameover    E 小調                6    16+14     2   150    否   p1 p2 tri noi            3.0 s
 *   extend      C 大調                3     20       1   300    否   p1 p2 tri                1.0 s
 *   ─── R3（6 關擴充，cruiser-song agent；同樣全部原創）────────────────────────────
 *   stage2      D 小調 / 弗里吉亞      5     16      20   180    是   p1 p2(琶音) tri noi     26.6 s
 *   stage3      A 小調五聲            6     16      16   150    是   p1 p2(回音6) tri noi    25.6 s
 *   stage4      G 小調 3/4 拍          6     12      24   150    是   p1 p2(和弦) tri noi     28.7 s
 *   stage5      C 小調 / 三全音        6     16      16   150    是   p1 p2(失諧回音3) tri noi 25.6 s
 *   stage6      C 大調→C 小調         5     16      20   180    是   p1 p2(琶音) tri noi     26.6 s
 *   boss_final  A 小調 / 減七          4     16      16   225    是   p1+p2 交錯 tri noi      17.0 s
 *   ending      C 大調                7     16      13   128.6  否   p1 p2(和弦) tri noi     24.2 s
 *   stageclear  = clear 的別名（關卡過場號角沿用既有的 4 秒號角，stages agent 兩個鍵都能叫）
 *   （BPM = 3600 / (speed × 4)，一小節 16 row = 4 拍；stage4 是 3/4 拍，一小節 12 row = 3 拍）
 *   長度 = 小節 × rows × speed ÷ 60.0988 幀（NTSC）。
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

  /* ---------------- R3（cruiser-song agent）新增的資料工具 ---------------- */

  var BAR3 = 12;                      // 3/4 拍的一小節（3 拍 × 4 格 16 分音符）

  // flat() 的一般化：每小節 per 個 token（stage4 的 3/4 拍用 12）
  function flatN(barStrings, per) {
    var out = [];
    for (var b = 0; b < barStrings.length; b++) {
      var t = barStrings[b].split(/\s+/).filter(function (s) { return s.length; });
      if (t.length !== per) throw new Error('小節 ' + (b + 1) + ' 應該有 ' + per + ' 個 token，實際 ' + t.length);
      for (var i = 0; i < per; i++) out.push(t[i] === '.' ? null : t[i]);
    }
    return out;
  }

  // 音名 ↔ MIDI（本檔自足，不依賴 engine/music.js 有沒有載到）
  var NAMES12 = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  var SEMI12 = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midiOf(n) {
    var s = String(n).toUpperCase(), b = SEMI12[s.charAt(0)];
    if (b === undefined) throw new Error('音名解析失敗：' + n);
    var i = 1, acc = 0;
    if (s.charAt(1) === '#') { acc = 1; i = 2; } else if (s.charAt(1) === '-') { i = 2; }
    var oct = parseInt(s.substring(i), 10);
    if (isNaN(oct)) throw new Error('音名解析失敗：' + n);
    return (oct + 1) * 12 + b + acc;
  }
  function nameOf(m) { return NAMES12[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function tr(note, semi) { return nameOf(midiOf(note) + semi); }

  // 低音型：style 的每個 token = 一個 row
  //   R 根音 / O 高八度 / L 低八度 / 2 大二度 / 3 小三度 / 4 四度 / 5 五度 / 6 小六度 / 7 小七度
  //   b 低半音 / # 高半音 / . 休止
  var BASS_STEP = { R: 0, O: 12, L: -12, '2': 2, '3': 3, '4': 5, '5': 7, '6': 8, '7': 10, 'b': -1, '#': 1 };
  function bassBar(root, style) {
    var t = style.split(/\s+/).filter(function (s) { return s.length; });
    var out = new Array(t.length);
    for (var i = 0; i < t.length; i++) {
      if (t[i] === '.') { out[i] = null; continue; }
      var d = BASS_STEP[t[i]];
      if (d === undefined) throw new Error('低音型未知符號：' + t[i]);
      out[i] = { note: tr(root, d), inst: 'bass' };
    }
    return out;
  }
  // roots 逐小節；styles 可以是單一字串（每小節同型）或「逐小節」陣列
  function bassBars(roots, styles) {
    var out = [];
    for (var i = 0; i < roots.length; i++) {
      out.push(bassBar(roots[i], typeof styles === 'string' ? styles : styles[i]));
    }
    return out;
  }

  // 琶音和弦墊：一小節切成 segs.length 段，每段一個 [根音, 琶音偏移表]
  function arpPad(len, segs, opt) {
    opt = opt || {};
    var m = {}, step = len / segs.length;
    for (var i = 0; i < segs.length; i++) {
      m[Math.round(i * step)] = {
        note: segs[i][0], arp: segs[i][1], inst: opt.inst || 'pad',
        vol: opt.vol === undefined ? 10 : opt.vol, duty: opt.duty === undefined ? 0 : opt.duty
      };
    }
    return map(len, m);
  }
  function arpBars(chords, len, opt) {          // chords 逐小節：[[根音,琶音], ...]
    var out = [];
    for (var i = 0; i < chords.length; i++) out.push(arpPad(len, chords[i], opt));
    return out;
  }
  function ch2(a, b) { return b ? [a, b] : [a, a]; }   // 一小節兩段（省略第二段 = 同和弦）

  // 雙方波交錯（hocket）：偶數 row 給第一軌、奇數 row 給第二軌（boss_final 用）
  function hocket(notes) {
    var a = new Array(notes.length), b = new Array(notes.length);
    for (var i = 0; i < notes.length; i++) {
      a[i] = (i % 2 === 0) ? notes[i] : null;
      b[i] = (i % 2 === 0) ? null : notes[i];
    }
    return [a, b];
  }

  // 逐小節改寫音量（ending 的漸弱用）；fn(barIndex) 回傳 vol，回傳 null = 該小節不改
  function volBars(bars, fn) {
    for (var b = 0; b < bars.length; b++) {
      var v = fn(b);
      if (v === null || v === undefined) continue;
      for (var i = 0; i < bars[b].length; i++) {
        if (bars[b][i] && bars[b][i].vol !== undefined) bars[b][i].vol = v;
      }
    }
    return bars;
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
    rumble: { vol: [10, 11, 12, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], volLoop: 15 },

    /* ---- R3 新增 ---- */
    // 熔岩：50%↔25% 交替的粗管樂，起音硬、尾巴短（急促感）
    lava: { vol: [15, 15, 14, 14, 13, 12, 11, 10, 9, 8], volLoop: 9, duty: [2, 2, 1, 1], dutyLoop: 0 },
    // 石像：慢起音 + 長尾，像洞窟裡的回響
    stone: { vol: [10, 12, 13, 13, 12, 11, 10, 9, 9, 8, 7, 6, 5, 4, 3, 2], volLoop: 15, duty: [1] },
    // 華爾滋：鐘琴感（12.5% 為主），每拍自己衰減
    waltz: { vol: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4], volLoop: 11, duty: [1, 1, 0, 0], dutyLoop: 0 },
    // 生物：音量與占空比都在循環起伏 = 一直在「呼吸」的管風琴
    organ: { vol: [9, 11, 12, 12, 11, 10, 10, 11, 12, 11, 10, 9], volLoop: 0, duty: [1, 1, 1, 2, 2, 2], dutyLoop: 0 },
    // 最終要塞 / 最終魔王：占空比每幀跳，鋸齒般的警報聲
    siren: { vol: [15, 15, 14, 14, 13, 13, 12], volLoop: 6, duty: [3, 2, 1, 0, 1, 2], dutyLoop: 0 }
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

  /* ---- R3 新增的鼓型（研究 06 §2.7 的 pattern 表）---- */
  // 火山：雙大鼓 + 16 beat（「疾走」型加一顆搶拍大鼓）
  var DRUM_LAVA = map(BAR, {
    0: K(15), 2: H(5), 3: K(12), 4: S(13), 6: H(5),
    8: K(15), 10: K(12), 11: H(5), 12: S(13), 14: H(5), 15: S(8)
  });
  var DRUM_LAVA_F = map(BAR, {                // 每 4 小節的過門
    0: K(15), 2: H(5), 4: S(13), 6: K(12), 8: S(11), 9: S(12), 10: S(12),
    11: S(13), 12: S(13), 13: S(14), 14: S(14), 15: CY(15)
  });
  // 巨石：極簡（`k-------s-------` 的變體），低頻 rumble 當回響
  var DRUM_STONE = map(BAR, { 0: { note: 14, inst: 'rumble', vol: 8, duty: 0 }, 8: K(11), 12: H(3) });
  var DRUM_STONE_F = map(BAR, {
    0: { note: 14, inst: 'rumble', vol: 8, duty: 0 }, 8: K(11), 12: S(9), 14: S(11)
  });
  // 逆向世界：3/4 拍「蓬–恰–恰」，重音刻意放在第 2 拍（倒過來的華爾滋）
  var DRUM_W = map(BAR3, { 0: H(4), 4: K(14), 8: H(5) });
  var DRUM_W_F = map(BAR3, { 0: H(4), 4: K(14), 6: S(10), 8: S(12), 10: S(14) });
  // 生物洞窟：每 2 row 一擊，週期 / 音量跟著 8 步正弦起伏 = 一呼一吸
  function breathBar(lo, hi, phase) {
    var m = {};
    for (var i = 0; i < BAR; i += 2) {
      var k = 0.5 + 0.5 * Math.sin((i / 2 + (phase || 0)) * Math.PI / 4);
      m[i] = { note: lo + Math.round((hi - lo) * k), inst: 'hat', vol: 3 + Math.round(6 * k), duty: 0 };
    }
    m[0] = K(13);
    m[8] = { note: 10, inst: 'kick', vol: 11, duty: 0 };
    return map(BAR, m);
  }

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

  /* ######################################################################## */
  /* ##############  R3（6 關擴充）新增曲目 — cruiser-song agent  ############ */
  /* ######################################################################## */

  var DOM7 = [0, 4, 7, 10], SUS4 = [0, 5, 7], MAJ6 = [0, 4, 9], MIN3b5 = [0, 3, 6];

  /* ==================================================== ⑦ stage2「熔岩星」 */
  /* D 小調（弗里吉亞 ♭2 色彩：E♭ / B♭ 的半音壓迫）、180 BPM、20 小節 = 26.6 s 循環。
     火山 = ①tri 低音重拍（每拍兩下 + 八度跳），②p1 半音下行的 16 分音符崩落（第 9 / 11 小節），
     ③p2 減七 / 屬七琶音，④noi 雙大鼓 16 beat。記憶點 = 第 1 小節的 D–F–E–D#–D 半音回繞。 */

  var ST2_LEAD = flat([
    'D-5 .   D-5 .   F-5 .   E-5 D#5 D-5 .   C-5 .   A#4 .   A-4 .  ',   //  1 Dm ★動機
    'A-4 .   C-5 .   D-5 .   .   .   E-5 .   F-5 .   E-5 D#5 D-5 .  ',   //  2 Dm
    'A#4 .   A#4 .   A-4 .   G#4 .   G-4 .   F-4 .   E-4 .   D-4 .  ',   //  3 B♭ 半音下行
    'E-4 .   G-4 .   A#4 .   D-5 .   C#5 .   D-5 .   E-5 .   F-5 .  ',   //  4 A7
    'D-5 D-5 .   D-5 .   F-5 .   E-5 .   D-5 .   C-5 D-5 .   E-5 .  ',   //  5 Dm 動機變奏
    'F-5 .   E-5 .   D-5 .   C-5 .   A#4 .   A-4 .   G-4 .   F-4 .  ',   //  6 Dm
    'A#4 .   A#4 .   A-4 .   G#4 .   G-4 .   F#4 .   F-4 .   E-4 .  ',   //  7 B♭
    'D-4 .   .   .   D-5 .   .   .   C#5 .   D-5 .   .   .   .   .  ',   //  8 A7
    'A-5 G#5 G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4 G#4 G-4 F#4',   //  9 Dm ★熔岩崩落
    'F-4 .   A-4 .   C-5 .   F-5 .   E-5 .   D-5 .   C-5 .   A#4 .  ',   // 10 F
    'G-5 F#5 F-5 E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4 G#4 G-4 F#4 F-4 E-4',   // 11 Gm 崩落（低五度）
    'A-4 .   C-5 .   E-5 .   A-5 .   .   .   G-5 .   E-5 .   C#5 .  ',   // 12 A7
    'D-5 .   F-5 .   A-5 .   D-6 .   .   .   C-6 .   A-5 .   F-5 .  ',   // 13 Dm B 段
    'E-5 .   G-5 .   A#5 .   E-6 .   .   .   D-6 .   A#5 .   G-5 .  ',   // 14 C7
    'F-5 .   A-5 .   C-6 .   F-6 .   E-6 .   D-6 .   C-6 .   A#5 .  ',   // 15 F
    'A-5 .   G-5 .   F-5 .   E-5 .   D-5 .   C#5 .   D-5 .   E-5 .  ',   // 16 A7
    'D-5 .   D-5 .   F-5 .   E-5 D#5 D-5 .   C-5 .   A#4 .   A-4 .  ',   // 17 Dm ★動機再現
    'A-4 .   C-5 .   D-5 .   .   .   E-5 .   F-5 .   E-5 D#5 D-5 .  ',   // 18 Dm
    'A#4 .   A#4 .   A-4 .   G#4 .   G-4 .   F-4 .   E-4 .   D-4 .  ',   // 19 B♭
    'E-4 .   G-4 .   A#4 .   D-5 .   E-5 .   F-5 .   E-5 D#5 D-5 C#5'    // 20 A7 →回 1
  ]);

  var ST2_HEAVY = 'R .  R .  R .  O .  R .  R .  O .  R O';   // 重拍：每拍踩兩下
  var ST2_TURN = 'R .  O .  R .  O .  5 .  O .  R .  b .';   // 4 小節一次的半音轉接
  var ST2_ROOTS = ['D-2', 'D-2', 'A#2', 'A-2', 'D-2', 'D-2', 'A#2', 'A-2',
    'D-2', 'F-2', 'G-2', 'A-2', 'D-2', 'C-3', 'F-2', 'A-2', 'D-2', 'D-2', 'A#2', 'A-2'];
  var ST2_BASS = (function () {
    var out = [];
    for (var i = 0; i < ST2_ROOTS.length; i++) out.push(bassBar(ST2_ROOTS[i], (i % 4 === 3) ? ST2_TURN : ST2_HEAVY));
    return out;
  })();

  var Dm4 = ['D-4', MIN3], Bb3 = ['A#3', MAJ3], A3x = ['A-3', DOM7], A3o = ['A-3', DIM7];
  var F3M = ['F-3', MAJ3], G3m = ['G-3', MIN3], C4x = ['C-4', DOM7];
  var ST2_CH = [ch2(Dm4), ch2(Dm4), ch2(Bb3), ch2(A3x, A3o), ch2(Dm4), ch2(Dm4), ch2(Bb3), ch2(A3x, A3o),
    ch2(Dm4), ch2(F3M), ch2(G3m), ch2(A3x, A3o), ch2(Dm4), ch2(C4x), ch2(F3M), ch2(A3x, A3o),
    ch2(Dm4), ch2(Dm4), ch2(Bb3), ch2(A3x, A3o)];

  var STAGE2 = (function () {
    var drums = [];
    for (var i = 0; i < 20; i++) drums.push((i % 4 === 3) ? DRUM_LAVA_F : DRUM_LAVA);
    var t = assemble({
      p1: slice(rows(ST2_LEAD, { inst: 'lava', vol: 15, duty: 2 }), BAR),
      p2: arpBars(ST2_CH, BAR, { inst: 'pad', vol: 9, duty: 0 }),
      tri: ST2_BASS,
      noi: drums
    }, 20);
    return {
      name: '星塵巡航艦 STAGE 2「熔岩星」', speed: 5, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ================================================== ⑧ stage3「巨石迷宮」 */
  /* A 小調五聲音階（A C D E G，完全不用半音 → 神祕）、150 BPM、16 小節 = 25.6 s 循環。
     回音是本曲的主角：p2 = 主旋律延後 6 row（1.5 拍）、音量 -4 級、detune +6，
     在稀疏的旋律之間形成「石壁回聲」。tri 只踩根音與五度的空心五度，noi 極簡（`k-------s-------`）。 */

  var ST3_LEAD = flat([
    'A-4 .   .   .   C-5 .   .   .   D-5 .   .   .   E-5 .   .   .  ',   //  1 Am ★五聲上行
    'G-5 .   .   .   E-5 .   .   .   D-5 .   .   .   .   .   .   .  ',   //  2 Am
    'C-5 .   .   .   D-5 .   .   .   E-5 .   .   .   G-5 .   .   .  ',   //  3 F
    'A-5 .   .   .   .   .   .   .   E-5 .   .   .   .   .   .   .  ',   //  4 C
    'D-5 .   .   .   E-5 .   .   .   G-5 .   .   .   A-5 .   .   .  ',   //  5 Dm
    'C-6 .   .   .   A-5 .   .   .   G-5 .   .   .   E-5 .   .   .  ',   //  6 Am
    'D-5 .   .   .   C-5 .   .   .   A-4 .   .   .   .   .   .   .  ',   //  7 F
    'E-5 .   .   .   .   .   .   .   D-5 .   .   .   C-5 .   .   .  ',   //  8 Em
    'A-4 .   C-5 .   D-5 .   .   .   C-5 .   A-4 .   .   .   G-4 .  ',   //  9 Am B 段（密一點）
    'A-4 .   .   .   .   .   .   .   D-5 .   .   .   E-5 .   .   .  ',   // 10 Dm
    'G-5 .   E-5 .   D-5 .   C-5 .   D-5 .   .   .   .   .   .   .  ',   // 11 G
    'E-5 .   .   .   G-5 .   .   .   A-5 .   .   .   C-6 .   .   .  ',   // 12 C
    'D-6 .   .   .   C-6 .   .   .   A-5 .   .   .   G-5 .   .   .  ',   // 13 Am 最高點
    'E-5 .   .   .   D-5 .   .   .   C-5 .   .   .   .   .   .   .  ',   // 14 F
    'A-4 .   .   .   G-4 .   .   .   E-4 .   .   .   G-4 .   .   .  ',   // 15 Em
    'A-4 .   .   .   .   .   .   .   C-5 .   .   .   E-5 .   .   .  '    // 16 Am →回 1
  ]);

  var ST3_ECHO_DELAY = 6;             // 1.5 拍
  var ST3_STONE = 'R .  .  .  .  .  .  .  5 .  .  .  .  .  .  .';
  var ST3_STONE2 = 'R .  .  .  .  .  .  .  O .  .  .  .  .  .  .';
  var ST3_ROOTS = ['A-2', 'A-2', 'F-2', 'C-3', 'D-3', 'A-2', 'F-2', 'E-2',
    'A-2', 'D-3', 'G-2', 'C-3', 'A-2', 'F-2', 'E-2', 'A-2'];
  var ST3_BASS = (function () {
    var out = [];
    for (var i = 0; i < ST3_ROOTS.length; i++) out.push(bassBar(ST3_ROOTS[i], (i % 2) ? ST3_STONE2 : ST3_STONE));
    return out;
  })();

  var STAGE3 = (function () {
    var drums = [];
    for (var i = 0; i < 16; i++) drums.push((i % 8 === 7) ? DRUM_STONE_F : DRUM_STONE);
    var t = assemble({
      p1: slice(rows(ST3_LEAD, { inst: 'stone', vol: 14, duty: 1 }), BAR),
      p2: slice(rows(echo(ST3_LEAD, ST3_ECHO_DELAY, true), { inst: 'echo', vol: 10, duty: 0, detune: 6 }), BAR),
      tri: ST3_BASS,
      noi: drums
    }, 16);
    return {
      name: '星塵巡航艦 STAGE 3「巨石迷宮」', speed: 6, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ================================================== ⑨ stage4「逆向世界」 */
  /* G 小調、3/4 拍（一小節 12 row）、150 BPM、24 小節 = 28.7 s 循環。
     「倒立」= 把華爾滋倒過來寫：和弦墊踩第 1 拍、低音踩第 2 / 3 拍（正常華爾滋剛好相反），
     大鼓也移到第 2 拍。旋律一律是上行琶音（G–B♭–D–G…），切分音落在每拍的後半格。 */

  var ST4_LEAD = flatN([
    'G-4 .   A#4 .   D-5 .   G-5 .   .   .   D-5 .  ',   //  1 Gm ★上行琶音動機
    'A#5 .   .   .   A-5 .   G-5 .   .   .   .   .  ',   //  2 Gm
    'D-5 .   F-5 .   A#5 .   D-6 .   .   .   A#5 .  ',   //  3 B♭
    'A-5 .   .   .   G-5 .   .   .   .   .   F-5 .  ',   //  4 Gm
    'D#5 .   G-5 .   A#5 .   D#6 .   .   .   A#5 .  ',   //  5 Cm(E♭)
    'D-6 .   .   .   C-6 .   A#5 .   .   .   A-5 .  ',   //  6 B♭
    'C-5 .   D#5 .   G-5 .   C-6 .   .   .   G-5 .  ',   //  7 Cm
    'A#5 .   .   .   A-5 .   .   .   .   .   .   .  ',   //  8 B♭
    'G-5 .   .   .   A#5 .   .   .   D-6 .   .   .  ',   //  9 Gm B 段（長音上行）
    'F-6 .   .   .   D-6 .   A#5 .   .   .   G-5 .  ',   // 10 B♭
    'C-6 .   .   .   D-6 .   .   .   D#6 .   .   .  ',   // 11 Cm
    'D-6 .   .   .   C-6 .   A#5 .   .   .   G-5 .  ',   // 12 Gm
    'D-5 .   G-5 .   A#5 .   D-6 .   .   .   A#5 .  ',   // 13 Gm
    'C-6 .   .   .   A#5 .   A-5 .   .   .   G-5 .  ',   // 14 B♭
    'D#5 .   G-5 .   C-6 .   D#6 .   .   .   C-6 .  ',   // 15 Cm
    'D-6 .   .   .   C-6 .   .   .   A#5 .   A-5 .  ',   // 16 Gm
    'G-4 .   A#4 .   D-5 .   G-5 .   .   .   D-5 .  ',   // 17 Gm ★動機再現
    'A#5 .   .   .   A-5 .   G-5 .   .   .   .   .  ',   // 18 Gm
    'D-5 .   F-5 .   A#5 .   D-6 .   .   .   A#5 .  ',   // 19 B♭
    'A-5 .   .   .   G-5 .   .   .   .   .   F-5 .  ',   // 20 Gm
    'D#5 .   G-5 .   A#5 .   D#6 .   .   .   A#5 .  ',   // 21 Cm
    'D-6 .   .   .   C-6 .   A#5 .   .   .   A-5 .  ',   // 22 B♭
    'C-5 .   D#5 .   G-5 .   A#5 .   A-5 .   G-5 .  ',   // 23 Cm
    'D-5 .   F#5 .   A-5 .   D-6 .   .   .   .   .  '    // 24 D7 →回 1
  ], BAR3);

  var ST4_INV = '.  .  .  .  R .  .  .  5 .  .  .';    // 倒立華爾滋：低音在第 2 / 3 拍
  var ST4_INV2 = '.  .  .  .  O .  .  .  R .  .  .';
  var ST4_ROOTS = ['G-2', 'G-2', 'A#2', 'G-2', 'C-3', 'A#2', 'C-3', 'A#2',
    'G-2', 'A#2', 'C-3', 'G-2', 'G-2', 'A#2', 'C-3', 'G-2',
    'G-2', 'G-2', 'A#2', 'G-2', 'C-3', 'A#2', 'C-3', 'D-3'];
  var ST4_BASS = (function () {
    var out = [];
    for (var i = 0; i < ST4_ROOTS.length; i++) out.push(bassBar(ST4_ROOTS[i], (i % 2) ? ST4_INV2 : ST4_INV));
    return out;
  })();

  var Gm3 = ['G-3', MIN3], Bb3M = ['A#3', MAJ3], Cm4 = ['C-4', MIN3], D4x = ['D-4', DOM7];
  var ST4_CH = [Gm3, Gm3, Bb3M, Gm3, Cm4, Bb3M, Cm4, Bb3M,
    Gm3, Bb3M, Cm4, Gm3, Gm3, Bb3M, Cm4, Gm3,
    Gm3, Gm3, Bb3M, Gm3, Cm4, Bb3M, Cm4, D4x].map(function (c) { return [c]; });

  var STAGE4 = (function () {
    var drums = [];
    for (var i = 0; i < 24; i++) drums.push((i % 8 === 7) ? DRUM_W_F : DRUM_W);
    var t = assemble({
      p1: slice(rows(ST4_LEAD, { inst: 'waltz', vol: 15, duty: 1 }), BAR3),
      p2: arpBars(ST4_CH, BAR3, { inst: 'pad', vol: 10, duty: 0 }),
      tri: ST4_BASS,
      noi: drums
    }, 24);
    return {
      name: '星塵巡航艦 STAGE 4「逆向世界」', speed: 6, rows: BAR3, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ================================================== ⑩ stage5「生物洞窟」 */
  /* C 小調 + 三全音（C–F♯）與半音鄰音，150 BPM、16 小節 = 25.6 s 循環。
     不協和的來源有三層：①旋律的 ♭5 / 半音滑行，②p2 = 主旋律延後 3 row 且 detune +10
     （約 -70 音分，刻意失諧成「濕黏的回聲」），③tri 半音爬行的低音。
     noi 不是鼓組而是「呼吸」：每 2 row 一擊、週期與音量跟著 8 步正弦起伏（觸手蠕動）。 */

  var ST5_LEAD = flat([
    'C-5 .   D#5 .   F#5 .   .   .   F-5 .   D#5 .   C-5 .   B-4 .  ',   //  1 Cm(♭5) ★動機
    'C-5 .   .   .   F#4 .   .   .   G-4 .   F#4 .   F-4 .   .   .  ',   //  2 三全音下潛
    'G#4 .   B-4 .   D-5 .   F-5 .   .   .   E-5 .   D#5 .   C#5 .  ',   //  3 G#dim
    'C-5 .   .   .   .   .   C#5 .   C-5 .   B-4 .   A#4 .   .   .  ',   //  4 Cm 半音鄰音
    'D#5 .   F#5 .   A-5 .   C-6 .   .   .   A-5 .   F#5 .   D#5 .  ',   //  5 減七琶音
    'D-5 .   F-5 .   G#5 .   B-5 .   .   .   G#5 .   F-5 .   D-5 .  ',   //  6 減七琶音（低半音）
    'C-5 .   C#5 .   C-5 .   B-4 .   A#4 .   A-4 .   G#4 .   G-4 .  ',   //  7 半音爬下
    'F#4 .   .   .   G-4 .   .   .   F#4 .   F-4 .   E-4 .   .   .  ',   //  8 F#／G 擠壓
    'C-5 .   .   .   D#5 .   .   .   F-5 .   F#5 .   G-5 .   .   .  ',   //  9 Cm B 段
    'G#5 .   .   .   G-5 .   F#5 .   F-5 .   .   .   D#5 .   .   .  ',   // 10 A♭
    'A#4 .   C#5 .   E-5 .   G-5 .   .   .   E-5 .   C#5 .   A#4 .  ',   // 11 減七
    'B-4 .   D-5 .   F-5 .   G#5 .   .   .   F-5 .   D-5 .   B-4 .  ',   // 12 Bdim
    'C-5 .   D#5 .   F#5 .   C-6 .   .   .   A#5 .   G#5 .   F#5 .  ',   // 13 Cm 最高點
    'F-5 .   .   .   D#5 .   .   .   C#5 .   C-5 .   .   .   B-4 .  ',   // 14 Fm
    'C-5 .   B-4 .   A#4 .   A-4 .   G#4 .   G-4 .   F#4 .   F-4 .  ',   // 15 全半音下行
    'E-4 .   .   .   F-4 .   .   .   F#4 .   .   .   G-4 G#4 A-4 A#4'    // 16 半音爬回 →回 1
  ]);

  var ST5_CREEP = 'R .  R .  b .  b .  R .  R .  5 .  4 .';
  var ST5_CREEP2 = 'R .  .  .  #  .  R .  R .  .  .  b .  .  .';
  var ST5_ROOTS = ['C-3', 'C-3', 'G#2', 'C-3', 'D#3', 'D-3', 'C-3', 'F#2',
    'C-3', 'G#2', 'A#2', 'B-2', 'C-3', 'F-3', 'C-3', 'E-2'];
  var ST5_BASS = (function () {
    var out = [];
    for (var i = 0; i < ST5_ROOTS.length; i++) out.push(bassBar(ST5_ROOTS[i], (i % 4 === 3) ? ST5_CREEP2 : ST5_CREEP));
    return out;
  })();

  var STAGE5 = (function () {
    var breath = [];
    for (var i = 0; i < 16; i++) breath.push(breathBar(4, 13, i % 2 ? 4 : 0));
    var t = assemble({
      p1: slice(rows(ST5_LEAD, { inst: 'organ', vol: 14, duty: 1 }), BAR),
      p2: slice(rows(echo(ST5_LEAD, 3, true), { inst: 'echo', vol: 9, duty: 0, detune: 10 }), BAR),
      tri: ST5_BASS,
      noi: breath
    }, 16);
    return {
      name: '星塵巡航艦 STAGE 5「生物洞窟」', speed: 6, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ================================================ ⑪ stage6「敵母艦要塞」 */
  /* C 大調（1-8 小節）→ 同主音 C 小調（9-20 小節），180 BPM、20 小節 = 26.6 s 循環。
     全曲 p1 幾乎都是連續 16 分音符的和弦琶音跑句（「最終要塞」的機械感），
     轉小調的那一刻（第 9 小節）E→E♭ 是全曲的記憶點。tri 八度衝刺低音、noi 16 beat。 */

  var ST6_LEAD = flat([
    'C-5 E-5 G-5 C-6 G-5 E-5 C-5 E-5 G-5 C-6 E-6 C-6 G-5 E-5 C-5 G-4',   //  1 C
    'A-4 C-5 E-5 A-5 E-5 C-5 A-4 C-5 E-5 A-5 C-6 A-5 E-5 C-5 A-4 E-4',   //  2 Am
    'F-4 A-4 C-5 F-5 C-5 A-4 F-4 A-4 C-5 F-5 A-5 F-5 C-5 A-4 F-4 C-4',   //  3 F
    'G-4 B-4 D-5 G-5 D-5 B-4 G-4 B-4 D-5 G-5 B-5 G-5 D-5 B-4 G-4 D-4',   //  4 G
    'C-5 E-5 G-5 C-6 G-5 E-5 C-5 E-5 G-5 C-6 E-6 C-6 G-5 E-5 C-5 G-4',   //  5 C
    'A-4 C-5 E-5 A-5 E-5 C-5 A-4 C-5 E-5 A-5 C-6 A-5 E-5 C-5 A-4 E-4',   //  6 Am
    'F-4 A-4 C-5 F-5 A-5 C-6 F-6 C-6 A-5 F-5 C-5 A-4 F-4 C-4 A-3 F-3',   //  7 F 全音域掃射
    'G-4 B-4 D-5 G-5 B-5 D-6 G-6 D-6 B-5 G-5 D-5 B-4 G-4 D-4 B-3 G-3',   //  8 G
    'C-5 D#5 G-5 C-6 G-5 D#5 C-5 D#5 G-5 C-6 D#6 C-6 G-5 D#5 C-5 G-4',   //  9 Cm ★轉小調
    'G#4 C-5 D#5 G#5 D#5 C-5 G#4 C-5 D#5 G#5 C-6 G#5 D#5 C-5 G#4 D#4',   // 10 A♭
    'F-4 G#4 C-5 F-5 C-5 G#4 F-4 G#4 C-5 F-5 G#5 F-5 C-5 G#4 F-4 C-4',   // 11 Fm
    'G-4 B-4 D-5 G-5 D-5 B-4 G-4 B-4 D-5 G-5 B-5 G-5 D-5 B-4 G-4 D-4',   // 12 G7
    'C-5 D#5 G-5 C-6 G-5 D#5 C-5 D#5 G-5 C-6 D#6 C-6 G-5 D#5 C-5 G-4',   // 13 Cm
    'G#4 C-5 D#5 G#5 D#5 C-5 G#4 C-5 D#5 G#5 C-6 G#5 D#5 C-5 G#4 D#4',   // 14 A♭
    'D#5 G-5 A#5 D#6 A#5 G-5 D#5 G-5 A#5 D#6 G-6 D#6 A#5 G-5 D#5 A#4',   // 15 E♭ 最高點
    'D-5 F-5 G#5 B-5 G#5 F-5 D-5 F-5 G#5 B-5 D-6 B-5 G#5 F-5 D-5 B-4',   // 16 Ddim7
    'C-5 D#5 G-5 C-6 D#6 G-6 C-6 G-5 D#5 C-5 G-4 D#4 C-4 G-3 D#3 C-3',   // 17 Cm 全音域下墜
    'G-4 B-4 D-5 G-5 B-5 D-6 G-6 D-6 B-5 G-5 D-5 B-4 G-4 D-4 B-3 G-3',   // 18 G
    'G#4 C-5 D#5 G#5 C-6 D#6 G#6 D#6 C-6 G#5 D#5 C-5 G#4 D#4 C-4 G#3',   // 19 A♭
    'G-4 B-4 D-5 F-5 G-5 B-5 D-6 F-6 D-6 B-5 G-5 F-5 D-5 B-4 G-4 F-4'    // 20 G7 →回 1
  ]);

  var ST6_RUN = 'R .  O .  R .  O .  R .  O .  R .  5 .';
  var ST6_RUN2 = 'R .  O .  R O  R .  O .  R .  5 .  4 .';
  var ST6_ROOTS = ['C-3', 'A-2', 'F-2', 'G-2', 'C-3', 'A-2', 'F-2', 'G-2',
    'C-3', 'G#2', 'F-2', 'G-2', 'C-3', 'G#2', 'D#3', 'D-3', 'C-3', 'G-2', 'G#2', 'G-2'];
  var ST6_BASS = (function () {
    var out = [];
    for (var i = 0; i < ST6_ROOTS.length; i++) out.push(bassBar(ST6_ROOTS[i], (i % 4 === 3) ? ST6_RUN2 : ST6_RUN));
    return out;
  })();

  var C4M = ['C-4', MAJ3], A3m = ['A-3', MIN3], F3Mj = ['F-3', MAJ3], G3x = ['G-3', DOM7];
  var C4m = ['C-4', MIN3], Ab3 = ['G#3', MAJ3], F3m = ['F-3', MIN3], Eb4 = ['D#4', MAJ3], D4o = ['D-4', DIM7];
  var ST6_CH = [ch2(C4M), ch2(A3m), ch2(F3Mj), ch2(G3x), ch2(C4M), ch2(A3m), ch2(F3Mj), ch2(G3x),
    ch2(C4m), ch2(Ab3), ch2(F3m), ch2(G3x), ch2(C4m), ch2(Ab3), ch2(Eb4), ch2(D4o),
    ch2(C4m), ch2(G3x), ch2(Ab3), ch2(G3x)];

  var STAGE6 = (function () {
    var drums = [];
    for (var i = 0; i < 20; i++) drums.push((i % 4 === 3) ? DRUM_F : DRUM_16);
    var t = assemble({
      p1: slice(rows(ST6_LEAD, { inst: 'siren', vol: 15, duty: 2 }), BAR),
      p2: arpBars(ST6_CH, BAR, { inst: 'pad', vol: 9, duty: 0 }),
      tri: ST6_BASS,
      noi: drums
    }, 20);
    return {
      name: '星塵巡航艦 STAGE 6「敵母艦要塞」', speed: 5, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ================================================ ⑫ boss_final「最終魔王」 */
  /* A 小調 + 減七，225 BPM（speed 4，比既有 boss 的 180 再快一檔）、16 小節 = 17.0 s 循環。
     雙方波交錯（hocket）：同一條 16 分音符跑句，偶數 row 走 p1、奇數 row 走 p2，
     兩軌用不同樂器 / 占空比 → 聽起來是兩把琴互相追打。tri 八度衝刺、noi 全程 16 beat。
     ※ 因為旋律被拆成兩軌，音效搶走 p2 時旋律仍留下骨架（研究 06 §8.2 第 10 條）。 */

  var BF_LINE = flat([
    'A-5 E-5 A-5 C-6 A-5 E-5 A-5 B-5 C-6 B-5 A-5 G#5 A-5 E-5 C-5 E-5',   //  1 Am ★動機
    'F-5 C-5 F-5 A-5 F-5 C-5 F-5 G-5 A-5 G-5 F-5 E-5 F-5 C-5 A-4 C-5',   //  2 F
    'D-5 A-4 D-5 F-5 D-5 A-4 D-5 E-5 F-5 E-5 D-5 C#5 D-5 A-4 F-4 A-4',   //  3 Dm
    'E-5 B-4 E-5 G#5 B-5 G#5 E-5 B-4 E-5 G#5 B-5 D-6 C-6 B-5 A#5 A-5',   //  4 E7
    'A-5 E-5 A-5 C-6 A-5 E-5 A-5 B-5 C-6 B-5 A-5 G#5 A-5 E-5 C-5 E-5',   //  5 Am
    'F-5 C-5 F-5 A-5 F-5 C-5 F-5 G-5 A-5 G-5 F-5 E-5 F-5 C-5 A-4 C-5',   //  6 F
    'D#5 A-4 D#5 F#5 A-5 F#5 D#5 A-4 D#5 F#5 A-5 C-6 A-5 F#5 D#5 C-5',   //  7 減七
    'E-5 G#5 B-5 E-6 D-6 B-5 G#5 E-5 B-4 G#4 E-4 G#4 B-4 E-5 G#5 B-5',   //  8 E7
    'A-4 C-5 E-5 A-5 C-6 A-5 E-5 C-5 A-4 C-5 E-5 A-5 C-6 E-6 C-6 A-5',   //  9 Am B 段
    'G#4 C-5 D#5 G#5 C-6 G#5 D#5 C-5 G#4 C-5 D#5 G#5 C-6 D#6 C-6 G#5',   // 10 A♭（半音錯位）
    'F-4 A-4 C-5 F-5 A-5 F-5 C-5 A-4 F#4 A#4 C#5 F#5 A#5 F#5 C#5 A#4',   // 11 F → F#
    'E-4 G#4 B-4 E-5 G#5 B-5 E-6 B-5 G#5 E-5 B-4 G#4 E-4 B-3 G#3 E-3',   // 12 E7
    'A-5 E-5 A-5 C-6 A-5 E-5 A-5 B-5 C-6 B-5 A-5 G#5 A-5 E-5 C-5 E-5',   // 13 Am ★再現
    'F-5 C-5 F-5 A-5 F-5 C-5 F-5 G-5 A-5 G-5 F-5 E-5 F-5 C-5 A-4 C-5',   // 14 F
    'D#5 A-4 D#5 F#5 A-5 F#5 D#5 A-4 D#5 F#5 A-5 C-6 A-5 F#5 D#5 C-5',   // 15 減七
    'E-5 F-5 F#5 G-5 G#5 A-5 A#5 B-5 C-6 C#6 D-6 D#6 E-6 D-6 C-6 B-5'    // 16 半音衝刺 →回 1
  ]);

  var BF_FAST = 'R .  O .  R .  O .  R .  O .  R .  5 .';
  var BF_FAST2 = 'R O  R .  O .  R O  R .  O .  5 .  b .';
  var BF_ROOTS = ['A-2', 'F-2', 'D-3', 'E-3', 'A-2', 'F-2', 'D#3', 'E-3',
    'A-2', 'G#2', 'F-2', 'E-2', 'A-2', 'F-2', 'D#3', 'E-3'];
  var BF_BASS = (function () {
    var out = [];
    for (var i = 0; i < BF_ROOTS.length; i++) out.push(bassBar(BF_ROOTS[i], (i % 4 === 3) ? BF_FAST2 : BF_FAST));
    return out;
  })();

  var BOSS_FINAL = (function () {
    var h = hocket(BF_LINE);
    var drums = [];
    for (var i = 0; i < 16; i++) drums.push((i % 4 === 3) ? DRUM_F : DRUM_16);
    var t = assemble({
      p1: slice(rows(h[0], { inst: 'horn', vol: 15, duty: 2 }), BAR),
      p2: slice(rows(h[1], { inst: 'siren', vol: 13, duty: 0, detune: 2 }), BAR),
      tri: BF_BASS,
      noi: drums
    }, 16);
    return {
      name: '星塵巡航艦 FINAL BOSS「母艦核心」', speed: 4, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  /* ====================================================== ⑬ ending「凱旋」 */
  /* C 大調、128.6 BPM（speed 7）、13 小節 = 24.2 s，**不循環**。
     1 小節前奏號角 → 8 小節主題 → 4 小節尾奏；第 11 小節起 p1 / p2 逐小節降音量（15→11→8→5）
     且低音與鼓退場，做出「畫面淡出」的收尾。 */

  var EN_LEAD = flat([
    'C-5 .   E-5 .   G-5 .   C-6 .   .   .   G-5 .   C-6 .   .   .  ',   //  1 C 前奏號角
    'E-6 .   .   .   D-6 .   C-6 .   .   .   G-5 .   .   .   .   .  ',   //  2 C ★主題
    'A-5 .   .   .   C-6 .   .   .   G-5 .   E-5 .   .   .   .   .  ',   //  3 Am
    'F-5 .   A-5 .   C-6 .   F-6 .   .   .   E-6 .   D-6 .   C-6 .  ',   //  4 F
    'G-5 .   B-5 .   D-6 .   G-6 .   .   .   D-6 .   B-5 .   G-5 .  ',   //  5 G
    'C-6 .   .   .   B-5 .   A-5 .   G-5 .   E-5 .   G-5 .   C-6 .  ',   //  6 C
    'A-5 .   .   .   G-5 .   E-5 .   D-5 .   .   .   E-5 .   G-5 .  ',   //  7 Am
    'F-5 .   A-5 .   C-6 .   A-5 .   G-5 .   F-5 .   E-5 .   D-5 .  ',   //  8 F
    'C-6 .   .   .   .   .   G-5 .   E-5 .   G-5 .   C-6 .   .   .  ',   //  9 C
    'E-6 .   .   .   D-6 .   .   .   C-6 .   .   .   .   .   .   .  ',   // 10 G→C 最高點
    'G-5 .   .   .   E-5 .   .   .   C-5 .   .   .   .   .   .   .  ',   // 11 C 漸弱開始
    'E-5 .   .   .   G-5 .   .   .   C-6 .   .   .   .   .   .   .  ',   // 12 C
    'C-6 .   .   .   .   .   .   .   .   .   .   .   .   .   .   .  '    // 13 C 長音收尾
  ]);

  var EN_MARCH = 'R .  O .  5 .  O .  R .  O .  5 .  O .';
  var EN_HOLD = 'R .  .  .  .  .  .  .  O .  .  .  .  .  .  .';
  var EN_ROOTS = ['C-3', 'C-3', 'A-2', 'F-2', 'G-2', 'C-3', 'A-2', 'F-2', 'C-3', 'G-2', 'C-3'];
  var EN_BASS = (function () {
    var out = [];
    for (var i = 0; i < EN_ROOTS.length; i++) out.push(bassBar(EN_ROOTS[i], i >= 9 ? EN_HOLD : EN_MARCH));
    return out;                                     // 只有前 11 小節有低音，之後留白
  })();

  var C4Mj = ['C-4', MAJ3], A3mn = ['A-3', MIN3], F3Mj2 = ['F-3', MAJ3], G3Mj = ['G-3', MAJ3];
  var EN_CH = [ch2(C4Mj), ch2(C4Mj), ch2(A3mn), ch2(F3Mj2), ch2(G3Mj), ch2(C4Mj), ch2(A3mn), ch2(F3Mj2),
    ch2(C4Mj), ch2(G3Mj, C4Mj), ch2(C4Mj), ch2(C4Mj), ch2(C4Mj)];

  var ENDING = (function () {
    var lead = volBars(slice(rows(EN_LEAD, { inst: 'fanfare', vol: 15, duty: 2 }), BAR),
      function (b) { return b < 10 ? null : [11, 8, 5][b - 10]; });
    var pad = volBars(arpBars(EN_CH, BAR, { inst: 'pad', vol: 11, duty: 0 }),
      function (b) { return b < 10 ? null : [8, 6, 4][b - 10]; });
    var drums = [
      map(BAR, { 0: CY(13), 8: S(10), 12: S(11) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12), 14: S(13) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12) }),
      map(BAR, { 0: K(14), 4: S(12), 8: K(14), 12: S(12) }),
      map(BAR, { 0: K(14), 4: S(12), 8: S(12), 10: S(13), 12: S(13), 14: S(14) }),
      map(BAR, { 0: CY(14), 8: K(13) }),
      map(BAR, { 0: CY(13), 8: S(9), 10: S(10), 12: S(11), 14: S(12) })
    ];                                              // 第 11 小節起沒有鼓
    var t = assemble({ p1: lead, p2: pad, tri: EN_BASS, noi: drums }, 13);
    return {
      name: '星塵巡航艦 ENDING「凱旋」', speed: 7, rows: BAR, loop: 0,
      instruments: INST, patterns: t.patterns, order: t.order
    };
  })();

  var SONGS = {
    title: TITLE, stage1: STAGE1, boss: BOSS, clear: CLEAR, gameover: GAMEOVER, extend: EXTEND,
    // R3：6 關擴充
    stage2: STAGE2, stage3: STAGE3, stage4: STAGE4, stage5: STAGE5, stage6: STAGE6,
    boss_final: BOSS_FINAL, ending: ENDING,
    stageclear: CLEAR              // 別名：關卡過場號角就是既有的 clear（4.0 s 夠用，不另外寫一首）
  };
  var LOOPED = {
    title: true, stage1: true, boss: true, clear: false, gameover: false, extend: false,
    stage2: true, stage3: true, stage4: true, stage5: true, stage6: true,
    boss_final: true, ending: false, stageclear: false
  };

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
    KEYS: Object.keys(SONGS),          // 曲目清單（stages agent / 測試用）
    LOOPED: LOOPED,                    // 每首要不要循環
    ECHO_DELAY: ST1_ECHO_DELAY,
    ECHO_DELAY3: ST3_ECHO_DELAY,
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
          loop: Audio.current ? !!LOOPED[Audio.current] : null, keys: Audio.KEYS,
          sfx: st.sfx.map(function (x) { return x.name; }), owners: owners
        };
      } catch (e) { return null; }
    }
  };

  CR.Audio = Audio;
  CR.SONGS = SONGS;
  CR.SFX = SFX;
})();
