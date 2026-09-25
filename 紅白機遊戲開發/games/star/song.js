/*
 * games/star/song.js — 《星塵勇者》W1 音樂 / 音效層（star-audio）
 * ---------------------------------------------------------------------------
 * 擁有者：star-audio ｜ 只依賴 engine/music.js 的「R1 既有」欄位：
 *   note / inst / vol / arp / vib / duty / cut / stop、instrument 的 vol|duty|arp|pitch 包絡、
 *   sfx 幀的 note / vol / duty / retrigger / off。
 *   ★ 刻意不使用 R2 audio agent 新加的 slide / detune（那個檔同時在改），
 *     所以所有滑音 / 失諧都用「逐幀列音」與「第二方波延遲」土法做到。
 *
 * 契約（docs/TASKS.md「R2b《星塵勇者》W1」）：
 *   ST.Audio = { init(nes), play(key), stop(), sfx(name), tick(nes) }
 *   - star-hero 的 main.js：init 在 game.init()、tick(nes) 在 update() 末尾各呼叫一次；
 *     過關 play('clear')、死亡 play('death')、GAME OVER play('gameover')、
 *     關卡開始 play(level.music)（'ground' | 'cave' | 'sky' | 'castle'）、魔王 play('boss')、
 *     吃到無敵星 play('invincible')（8 秒 loop，結束後自己 play 回原曲）。
 *   - 所有函式都吞例外並回傳 boolean，音樂壞掉不能拖垮遊戲迴圈。
 *
 * 曲目（全部原創；BPM = 3600 / (speed × 每拍 row 數)，研究 06 §1.7）：
 *   title       speed 6 → 150.0 BPM，16 row/小節，8 小節 loop（fix2-star 補，qa2-star P2-2）
 *   ground      speed 5 + groove [5,6] → 每 row 平均 5.5 幀 = 163.6 BPM，16 row/小節，32 小節 loop
 *   cave        speed 9 → 100.0 BPM，16 row/小節，16 小節 loop
 *   sky         speed 4，24 row/小節（每拍 6 row = 三連音格）→ 150.0 BPM，16 小節 loop
 *   castle      speed 10 → 90.0 BPM，16 row/小節，16 小節 loop
 *   boss        speed 4 → 225.0 BPM，16 row/小節，16 小節 loop
 *   invincible  speed 3 → 300.0 BPM，16 row/小節，10 小節 = 7.99 s loop
 *   clear       speed 6 × 30 row = 180 幀 ≈ 3.00 s（不 loop）
 *   death       speed 5 × 18 row =  90 幀 ≈ 1.50 s（不 loop）
 *   gameover    speed 9 × 20 row = 180 幀 ≈ 3.00 s（不 loop）
 *
 * 音效（搶 p2 / noi，不碰 p1 主旋律，也不碰三角波低音；研究 06 §1.6）：
 *   death 9 > goal 8 > oneup 7 > powerup 6 > hurt 5 > coin 4 > stomp 3 > jump 2 > bump 1
 *
 * ★ 為什麼 ground 要 groove：驅動的 speed 是整數幀，16 row/小節時只做得出 180（speed 5）
 *   或 150（speed 6）BPM。這裡在 tick() 裡每個 row 交替 5 / 6 幀（FamiTracker 的 groove），
 *   平均 5.5 幀 = 163.6 BPM ≈ 需求的 165 BPM；因為 8 分音符 = 2 row = 固定 11 幀，
 *   實際只有 16 分反拍被挪後半幀，聽起來是很輕的 shuffle，不是搖擺。
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};
  var ST = global.ST = global.ST || {};

  /* ===================================================================== 工具 */

  function tokens(s) {
    return String(s).split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  // 旋律 / 低音：'C-5 - E-5 = ...'（'-' = 沿用、'=' = 切音）→ row 陣列
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

  // 雜訊鼓：k 大鼓 / K 更低的大鼓 / s 小鼓 / h 閉合 hat / H 金屬 hat（LFSR 短模式）/
  //         t 中鼓 / m 低鳴（悶響）/ c 鈸；可加 ':音量'（例：s:9）
  var DRUM = {
    k: { note: 13, inst: 'kick', vol: 15, duty: 0 },
    K: { note: 15, inst: 'kick', vol: 15, duty: 0 },
    s: { note: 6, inst: 'snare', vol: 14, duty: 0 },
    h: { note: 2, inst: 'hat', vol: 12, duty: 0 },
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
      if (s === '=') { out[i] = { note: '===' }; continue; }
      var c = s.indexOf(':'), v = -1;
      if (c > 0) { v = parseInt(s.substring(c + 1), 10); s = s.substring(0, c); }
      var d = DRUM[s];
      if (!d) { out[i] = null; continue; }
      out[i] = (v >= 0) ? { note: d.note, inst: d.inst, vol: v, duty: d.duty } : d;
    }
    return out;
  }

  // 第二方波延遲回音：把一軌往後挪 n 個 row、換樂器 / 音量 / 占空比（研究 06 §2.2）
  function echoOf(rowsArr, n, patch) {
    var out = new Array(rowsArr.length), i, k;
    for (i = 0; i < rowsArr.length; i++) out[i] = null;
    for (i = 0; i < rowsArr.length; i++) {
      var src = rowsArr[i];
      if (!src || i + n >= rowsArr.length) continue;
      var r = {};
      for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) r[k] = src[k];
      if (patch) for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) r[k] = patch[k];
      out[i + n] = r;
    }
    return out;
  }

  // 方波 2 和聲琶音：每 step 個 row 打一下根音（arp 造出和弦，研究 06 §2.1）
  function stab(root, arp, rows, step, inst, vol, duty) {
    var out = new Array(rows), i;
    for (i = 0; i < rows; i++) {
      out[i] = (i % step === 0)
        ? { note: root, inst: inst || 'stab', vol: vol === undefined ? 11 : vol, duty: duty === undefined ? 1 : duty, arp: arp }
        : null;
    }
    return out;
  }

  // 整小節長音（pad / organ）
  function hold(root, arp, rows, inst, vol, duty) {
    var out = new Array(rows), i;
    for (i = 0; i < rows; i++) out[i] = null;
    out[0] = { note: root, inst: inst, vol: vol, duty: duty, arp: arp };
    return out;
  }

  /* --------------------------------------------------------------- 曲子建構 */

  function Builder(name, speed, rows, groove) {
    this.s = {
      name: name, speed: speed, rows: rows, loop: 0,
      instruments: null, patterns: [], order: [],
      groove: groove || null, playLoop: true
    };
    this.idx = {};
  }
  // 同一個 key 只存一份 pattern（order table 重用，研究 06 §2.8）
  Builder.prototype.add = function (track, key, rowsArr) {
    var k = track + '|' + key;
    if (this.idx[k] !== undefined) return this.idx[k];
    var o = {};
    o[track] = rowsArr;
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
  /* 全部原創包絡；vol 與 row 音量相乘後除 15，duty 包絡 = 研究 06 §2.5 的「濾波器掃描」 */

  var INST = {
    // 主旋律：音頭 50% → 身體 25%，慢慢衰減後持平（長音不會突然消失）
    lead: { vol: [15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6], volLoop: 19, duty: [2, 1, 1, 1] },
    // 高音副旋律（天空 / 無敵）：細一點、衰減快
    lead2: { vol: [14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4], volLoop: 15, duty: [1] },
    // 回音軌：音量 1/3、12.5% 占空比（研究 06 §2.2）
    echo: { vol: [8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0], duty: [0] },
    // 和聲琶音的短促「彈跳」音（跳躍感的來源）
    stab: { vol: [13, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
    // 長音墊底
    pad: { vol: [10, 10, 9, 9, 8, 8, 7, 7], volLoop: 7, duty: [0] },
    // 城堡風琴：音量微顫 + 占空比顫動（研究 06 §2.3 表情）
    organ: { vol: [11, 12, 12, 11, 11, 12, 12, 11], volLoop: 0, duty: [2, 2, 1, 1], dutyLoop: 0 },
    // 過關鐘聲：亮 → 細
    bell: { vol: [15, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [2, 2, 1, 1, 0], dutyLoop: 4 },
    // 快速跑動音（魔王 / 無敵的 16 分音）
    run: { vol: [14, 13, 12, 11, 10], volLoop: 4, duty: [1] },
    bass: {},
    kick: { vol: [15, 14, 11, 7, 3, 0] },
    snare: { vol: [15, 13, 11, 9, 7, 5, 4, 3, 2, 1, 0] },
    hat: { vol: [8, 5, 2, 0] },
    tom: { vol: [14, 12, 10, 8, 6, 4, 3, 2, 1, 0] },
    crash: { vol: [13, 12, 12, 11, 10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }
  };

  var MIN = [0, 3, 7], MAJ = [0, 4, 7], DOM7 = [0, 4, 7, 10], DIM = [0, 3, 6];

  /* ============================================================ 1. ground */
  /* 《草原的風》C 大調、163.6 BPM、32 小節（A A2 B A3）。
     配方：p1 主旋律 + p2 8 分琶音彈跳 + 三角波八度跳躍低音 + 雜訊鼓（研究 06 §2.1 / §2.6 / §2.7）。 */

  function buildGround() {
    var b = new Builder('星塵草原（ground）', 5, 16, [5, 6]);

    var MELODY = [
      'G-4 -   C-5 -   E-5 F-5 G-5 -   -   -   E-5 -   C-5 -   D-5 -  ',   // 0  C
      'E-5 -   D-5 -   B-4 -   D-5 -   G-5 -   -   -   F#5 -   D-5 -  ',   // 1  G
      'C-5 -   E-5 -   A-5 -   G-5 -   E-5 -   C-5 -   A-4 -   -   -  ',   // 2  Am
      'F-5 -   E-5 -   C-5 D-5 E-5 -   F-5 -   -   -   A-4 -   C-5 -  ',   // 3  F
      'E-5 -   G-5 -   C-6 -   B-5 -   G-5 -   E-5 -   G-5 -   -   -  ',   // 4  C
      'D-5 -   G-5 -   B-5 -   A-5 -   G-5 -   D-5 -   B-4 -   D-5 -  ',   // 5  G
      'A-5 -   G-5 -   F-5 -   E-5 -   D-5 -   C-5 -   A-4 -   C-5 -  ',   // 6  F
      'C-5 -   -   -   -   -   -   -   E-5 -   -   -   G-5 -   -   -  ',   // 7  C
      'A-5 -   -   -   G-5 -   E-5 -   A-5 -   B-5 -   C-6 -   -   -  ',   // 8  Am（B 段）
      'C-6 -   A-5 -   F-5 -   A-5 -   C-6 -   -   -   A-5 -   G-5 -  ',   // 9  F
      'E-5 -   G-5 -   C-6 -   E-6 -   D-6 -   C-6 -   G-5 -   E-5 -  ',   // 10 C
      'D-6 -   B-5 -   G-5 -   B-5 -   D-6 -   -   -   F#5 -   A-5 -  ',   // 11 G
      'A-5 -   C-6 -   E-6 -   C-6 -   A-5 -   G-5 -   E-5 -   -   -  ',   // 12 Am
      'F-5 -   A-5 -   C-6 -   A-5 -   F-5 -   E-5 -   D-5 -   C-5 -  ',   // 13 F
      'D-5 -   F#5 -   A-5 -   B-5 -   D-6 -   B-5 -   A-5 -   F#5 -  ',   // 14 G
      'G-5 -   -   -   B-5 -   -   -   D-6 -   F-6 -   -   -   -   -  ',   // 15 G7（回 A 段）
      'C-6 -   B-5 -   A-5 -   G-5 -   E-5 -   G-5 -   C-6 -   -   -  '    // 16 收尾小節
    ];
    var m = [], i;
    for (i = 0; i < MELODY.length; i++) m.push(b.add('p1', 'm' + i, mel(MELODY[i], 'lead', 15, 1)));

    // 和弦（p2 琶音彈跳 + 三角波低音）
    var CH = {
      C: { p2: b.add('p2', 'C', stab('C-4', MAJ, 16, 2)), tri: b.add('tri', 'C', mel('C-2 -   C-3 -   C-2 -   C-3 -   C-2 -   C-3 -   E-2 -   G-2 -  ', 'bass', 15, 0)) },
      G: { p2: b.add('p2', 'G', stab('G-3', MAJ, 16, 2)), tri: b.add('tri', 'G', mel('G-2 -   G-3 -   G-2 -   G-3 -   G-2 -   G-3 -   B-2 -   D-3 -  ', 'bass', 15, 0)) },
      Am: { p2: b.add('p2', 'Am', stab('A-3', MIN, 16, 2)), tri: b.add('tri', 'Am', mel('A-2 -   A-3 -   A-2 -   A-3 -   A-2 -   A-3 -   C-3 -   E-3 -  ', 'bass', 15, 0)) },
      F: { p2: b.add('p2', 'F', stab('F-3', MAJ, 16, 2)), tri: b.add('tri', 'F', mel('F-2 -   F-3 -   F-2 -   F-3 -   F-2 -   F-3 -   A-2 -   C-3 -  ', 'bass', 15, 0)) },
      G7: { p2: b.add('p2', 'G7', stab('G-3', DOM7, 16, 2)), tri: b.add('tri', 'G7', mel('G-2 -   G-3 -   G-2 -   G-3 -   F-3 -   D-3 -   B-2 -   G-2 -  ', 'bass', 15, 0)) }
    };

    var dA = b.add('noi', 'A', drm('k -   h -   s -   h -   k -   h -   s -   h -  '));
    var dB = b.add('noi', 'B', drm('k -   h -   s -   h -   k -   k h   s -   h -  '));
    var dF = b.add('noi', 'F', drm('k -   h -   s -   h -   s:6 s:7 s:8 s:9 s:11 s:12 s:14 s:15'));

    var A = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C'];
    var Bs = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'G7'];
    for (i = 0; i < 8; i++) b.bar(m[i], CH[A[i]].p2, CH[A[i]].tri, i === 7 ? dB : dA);          // A
    for (i = 0; i < 8; i++) b.bar(m[i], CH[A[i]].p2, CH[A[i]].tri, i === 7 ? dF : dB);          // A2
    for (i = 0; i < 8; i++) b.bar(m[8 + i], CH[Bs[i]].p2, CH[Bs[i]].tri, i === 7 ? dF : dA);    // B
    for (i = 0; i < 8; i++) b.bar(i === 7 ? m[16] : m[i], CH[A[i]].p2, CH[A[i]].tri, i === 7 ? dF : dB); // A3
    return b.done(INST, 0, true);
  }

  /* ============================================================== 2. cave */
  /* 《地底回聲》A 自然小調、100 BPM、16 小節。低音為主、旋律稀疏，
     p2 = p1 延後 3 row 的回音（研究 06 §2.2），鼓幾乎不出現、只有水滴般的悶響。 */

  function buildCave() {
    var b = new Builder('地底回聲（cave）', 9, 16, null);

    var LINE = [
      'A-4 -   -   -   -   -   -   -   C-5 -   -   -   -   -   -   -  ',
      'B-4 -   -   -   -   -   -   -   -   -   -   -   E-4 -   -   -  ',
      'E-5 -   -   -   -   -   -   -   D-5 -   -   -   -   -   -   -  ',
      'C-5 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  ',
      'F-4 -   -   -   -   -   -   -   A-4 -   -   -   -   -   -   -  ',
      'G-4 -   -   -   -   -   -   -   -   -   -   -   B-4 -   -   -  ',
      'D-5 -   -   -   -   -   -   -   C-5 -   -   -   -   -   -   -  ',
      'A-4 -   -   -   -   -   -   -   -   -   -   -   E-4 -   -   -  '
    ];
    var p1 = [], p2 = [], i;
    for (i = 0; i < LINE.length; i++) {
      var line = mel(LINE[i], 'lead', 13, 0, { vib: { rate: 4, depth: 3, delay: 14 } });
      p1.push(b.add('p1', 'c' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 3, { inst: 'echo', vol: 7, duty: 0, vib: null })));
    }

    var BASS = [
      'A-2 -   -   -   -   -   -   -   E-2 -   -   -   -   -   -   -  ',
      'A-2 -   -   -   -   -   -   -   G-2 -   -   -   -   -   -   -  ',
      'E-2 -   -   -   -   -   -   -   B-2 -   -   -   -   -   -   -  ',
      'F-2 -   -   -   -   -   -   -   C-3 -   -   -   -   -   -   -  ',
      'D-2 -   -   -   -   -   -   -   A-2 -   -   -   -   -   -   -  ',
      'G-2 -   -   -   -   -   -   -   D-3 -   -   -   -   -   -   -  ',
      'F-2 -   -   -   -   -   -   -   E-2 -   -   -   -   -   -   -  ',
      'A-2 -   -   -   -   -   -   -   E-2 -   -   -   -   -   -   -  '
    ];
    var tri = [];
    for (i = 0; i < BASS.length; i++) tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));

    var dOff = b.add('noi', 'off', drm('-   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  '));
    var dDrip = b.add('noi', 'drip', drm('-   -   -   -   -   -   -   -   -   -   -   -   m:7 -   -   -  '));

    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (i % 4 === 3) ? dDrip : dOff);
    }
    return b.done(INST, 0, true);
  }

  /* =============================================================== 3. sky */
  /* 《雲上的階梯》C 大調、150 BPM、24 row/小節（每拍 6 row → 2 row = 一個三連音）、16 小節。
     p1 全是 8 分三連音的琶音跑動，p2 長音和弦，三角波四分音低音，鼓輕。 */

  function buildSky() {
    var b = new Builder('雲上的階梯（sky）', 4, 24, null);

    var RUN = [
      'C-5 -   E-5 -   G-5 -   C-6 -   E-6 -   C-6 -   G-5 -   E-5 -   C-5 -   E-5 -   G-5 -   C-6 -  ',  // C
      'A-4 -   C-5 -   E-5 -   A-5 -   C-6 -   A-5 -   E-5 -   C-5 -   A-4 -   C-5 -   E-5 -   A-5 -  ',  // Am
      'F-4 -   A-4 -   C-5 -   F-5 -   A-5 -   F-5 -   C-5 -   A-4 -   F-4 -   A-4 -   C-5 -   F-5 -  ',  // F
      'G-4 -   B-4 -   D-5 -   G-5 -   B-5 -   G-5 -   D-5 -   B-4 -   G-4 -   B-4 -   D-5 -   G-5 -  ',  // G
      'E-5 -   G-5 -   C-6 -   E-6 -   G-6 -   E-6 -   C-6 -   G-5 -   E-5 -   G-5 -   C-6 -   E-6 -  ',  // C
      'A-5 -   C-6 -   E-6 -   C-6 -   A-5 -   G-5 -   E-5 -   C-5 -   A-4 -   C-5 -   E-5 -   A-5 -  ',  // Am
      'A-5 -   C-6 -   F-6 -   C-6 -   A-5 -   F-5 -   C-5 -   A-4 -   F-4 -   A-4 -   C-5 -   F-5 -  ',  // F
      'D-5 -   G-5 -   B-5 -   D-6 -   G-6 -   D-6 -   B-5 -   G-5 -   D-5 -   B-4 -   G-4 -   D-5 -  '   // G
    ];
    var CHORD = [['C-4', MAJ], ['A-3', MIN], ['F-3', MAJ], ['G-3', MAJ], ['C-4', MAJ], ['A-3', MIN], ['F-3', MAJ], ['G-3', MAJ]];
    var BASS = [
      'C-3 -   -   -   -   -   G-2 -   -   -   -   -   C-3 -   -   -   -   -   E-3 -   -   -   -   -  ',
      'A-2 -   -   -   -   -   E-3 -   -   -   -   -   A-2 -   -   -   -   -   C-3 -   -   -   -   -  ',
      'F-2 -   -   -   -   -   C-3 -   -   -   -   -   F-2 -   -   -   -   -   A-2 -   -   -   -   -  ',
      'G-2 -   -   -   -   -   D-3 -   -   -   -   -   G-2 -   -   -   -   -   B-2 -   -   -   -   -  ',
      'C-3 -   -   -   -   -   G-2 -   -   -   -   -   C-3 -   -   -   -   -   E-3 -   -   -   -   -  ',
      'A-2 -   -   -   -   -   E-3 -   -   -   -   -   A-2 -   -   -   -   -   C-3 -   -   -   -   -  ',
      'F-2 -   -   -   -   -   C-3 -   -   -   -   -   F-2 -   -   -   -   -   A-2 -   -   -   -   -  ',
      'G-2 -   -   -   -   -   D-3 -   -   -   -   -   G-2 -   -   -   -   -   D-3 -   -   -   -   -  '
    ];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < 8; i++) {
      p1.push(b.add('p1', 's' + i, mel(RUN[i], 'lead2', 14, 1)));
      p2.push(b.add('p2', 'h' + i, hold(CHORD[i][0], CHORD[i][1], 24, 'pad', 9, 0)));
      tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('k -   -   -   -   -   h -   -   -   -   -   s -   -   -   -   -   h -   -   -   -   -  '));
    var dB = b.add('noi', 'B', drm('k -   -   -   -   -   h -   -   h -   -   s -   -   -   -   -   h -   h -   h -  '));

    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (i % 4 === 3) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 4. castle */
  /* 《鐵鎚王的城》D 小調、90 BPM、16 小節。半音級進的旋律 + 減和弦風琴 + 半音下行低音，
     鼓只有每小節頭的低鳴（研究 06 §2.7「極簡」）。 */

  function buildCastle() {
    var b = new Builder('鐵鎚王的城（castle）', 10, 16, null);

    var LINE = [
      'D-4 -   -   -   E-4 -   -   -   F-4 -   -   -   F#4 -   -   -  ',
      'G-4 -   -   -   -   -   -   -   F#4 -   -   -   F-4 -   -   -  ',
      'E-4 -   -   -   D#4 -   -   -   D-4 -   -   -   -   -   -   -  ',
      'A-4 -   -   -   G#4 -   -   -   G-4 -   -   -   F#4 -   -   -  ',
      'F-4 -   -   -   E-4 -   -   -   D#4 -   -   -   D-4 -   -   -  ',
      'C#4 -   -   -   D-4 -   -   -   E-4 -   -   -   F-4 -   -   -  ',
      'G-4 -   -   -   A-4 -   -   -   A#4 -   -   -   A-4 -   -   -  ',
      'D-4 -   -   -   -   -   -   -   C#4 -   -   -   D-4 -   -   -  '
    ];
    var ORGAN = [['D-3', DIM], ['G-3', MIN], ['A-3', DIM], ['D-3', MIN],
                 ['A#2', MAJ], ['A-3', DIM], ['D-3', MIN], ['A-3', DOM7]];
    var BASS = [
      'D-3 -   -   -   -   -   -   -   C#3 -   -   -   -   -   -   -  ',
      'C-3 -   -   -   -   -   -   -   B-2 -   -   -   -   -   -   -  ',
      'A#2 -   -   -   -   -   -   -   A-2 -   -   -   -   -   -   -  ',
      'G#2 -   -   -   -   -   -   -   G-2 -   -   -   -   -   -   -  ',
      'F#2 -   -   -   -   -   -   -   F-2 -   -   -   -   -   -   -  ',
      'E-2 -   -   -   -   -   -   -   D#2 -   -   -   -   -   -   -  ',
      'D-2 -   -   -   -   -   -   -   A-2 -   -   -   -   -   -   -  ',
      'A-2 -   -   -   -   -   -   -   A-1 -   -   -   -   -   -   -  '
    ];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < 8; i++) {
      p1.push(b.add('p1', 'k' + i, mel(LINE[i], 'organ', 14, 2, { vib: { rate: 3, depth: 4, delay: 20 } })));
      p2.push(b.add('p2', 'o' + i, hold(ORGAN[i][0], ORGAN[i][1], 16, 'organ', 8, 0)));
      tri.push(b.add('tri', 'b' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('m:13 -   -   -   -   -   -   -   s:7 -   -   -   -   -   -   -  '));
    var dB = b.add('noi', 'B', drm('m:13 -   -   -   -   -   -   -   s:7 -   -   -   t:9 -   t:11 -  '));

    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (i % 8 === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================== 5. boss */
  /* 《鐵鎚落下》A 小調、225 BPM、16 小節。動機 = 16 分下行音群，p2 延後 2 row 的低八度回音，
     三角波 8 分踏板，雜訊 16 分疾走（研究 06 §2.7「疾走」）。 */

  function buildBoss() {
    var b = new Builder('鐵鎚落下（boss）', 4, 16, null);

    var LINE = [
      'A-5 G-5 F-5 E-5 D-5 -   -   -   A-5 G-5 F-5 E-5 D-5 -   -   -  ',
      'G-5 F-5 E-5 D-5 C-5 -   -   -   G-5 F-5 E-5 D-5 C-5 -   -   -  ',
      'F-5 E-5 D-5 C-5 B-4 -   -   -   F-5 E-5 D-5 C-5 B-4 -   -   -  ',
      'E-5 D#5 D-5 C#5 C-5 B-4 A#4 A-4 -   -   -   -   -   -   -   -  ',
      'A-5 -   E-5 -   A-5 -   E-5 -   A#5 -   F-5 -   A#5 -   F-5 -  ',
      'A-5 -   E-5 -   A-5 -   E-5 -   G#5 -   E-5 -   G#5 -   E-5 -  ',
      'A-5 G-5 F-5 E-5 D-5 C-5 B-4 A-4 G-4 -   -   -   -   -   -   -  ',
      'A-4 -   -   -   E-5 -   -   -   A-5 -   -   -   -   -   -   -  '
    ];
    var BASS = [
      'A-2 -   A-3 -   A-2 -   A-3 -   A-2 -   A-3 -   A-2 -   A-3 -  ',
      'G-2 -   G-3 -   G-2 -   G-3 -   G-2 -   G-3 -   G-2 -   G-3 -  ',
      'F-2 -   F-3 -   F-2 -   F-3 -   F-2 -   F-3 -   F-2 -   F-3 -  ',
      'E-2 -   E-3 -   E-2 -   E-3 -   E-2 -   E-3 -   E-2 -   E-3 -  ',
      'A-2 -   A-3 -   A-2 -   A-3 -   A#2 -   A#3 -   A#2 -   A#3 -  ',
      'A-2 -   A-3 -   A-2 -   A-3 -   E-2 -   E-3 -   E-2 -   E-3 -  ',
      'A-2 -   A-2 -   G-2 -   G-2 -   F-2 -   F-2 -   E-2 -   E-2 -  ',
      'A-2 -   -   -   E-2 -   -   -   A-2 -   -   -   -   -   -   -  '
    ];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < 8; i++) {
      var line = mel(LINE[i], 'run', 15, 1);
      p1.push(b.add('p1', 'b' + i, line));
      p2.push(b.add('p2', 'e' + i, echoOf(line, 2, { inst: 'echo', vol: 9, duty: 0 })));
      tri.push(b.add('tri', 't' + i, mel(BASS[i], 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('k h   h h   s h   h h   k h   h h   s h   h h  '));
    var dB = b.add('noi', 'B', drm('k h   h h   s h   h h   k k   s s   s:9 s:11 s:13 s:15'));

    for (i = 0; i < 16; i++) {
      var k = i % 8;
      b.bar(p1[k], p2[k], tri[k], (i % 8 === 7) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ======================================================== 6. invincible */
  /* 《星光疾走》300 BPM、16 row/小節（48 幀 = 0.8 s）、10 小節 = 7.99 s loop。
     大三和弦琶音每半音往上推（C → C# → D → D# → E），最急促的一首。 */

  function buildInvincible() {
    var b = new Builder('星光疾走（invincible）', 3, 16, null);

    var RUN = [
      'C-5 E-5 G-5 C-6 E-6 C-6 G-5 E-5 C-5 E-5 G-5 C-6 E-6 C-6 G-5 E-5',
      'C#5 F-5 G#5 C#6 F-6 C#6 G#5 F-5 C#5 F-5 G#5 C#6 F-6 C#6 G#5 F-5',
      'D-5 F#5 A-5 D-6 F#6 D-6 A-5 F#5 D-5 F#5 A-5 D-6 F#6 D-6 A-5 F#5',
      'D#5 G-5 A#5 D#6 G-6 D#6 A#5 G-5 D#5 G-5 A#5 D#6 G-6 D#6 A#5 G-5',
      'E-5 G#5 B-5 E-6 G#6 E-6 B-5 G#5 E-5 G#5 B-5 E-6 G#6 E-6 B-5 G#5'
    ];
    var ROOT = ['C-4', 'C#4', 'D-4', 'D#4', 'E-4'];
    var BASS = ['C-2', 'C#2', 'D-2', 'D#2', 'E-2'];
    var p1 = [], p2 = [], tri = [], i;
    for (i = 0; i < 5; i++) {
      p1.push(b.add('p1', 'i' + i, mel(RUN[i], 'lead2', 14, 1)));
      p2.push(b.add('p2', 'a' + i, stab(ROOT[i], MAJ, 16, 4, 'stab', 10, 0)));
      tri.push(b.add('tri', 'b' + i, mel(
        BASS[i] + ' -   ' + BASS[i] + ' -   ' + BASS[i] + ' -   ' + BASS[i] + ' -   ' +
        BASS[i] + ' -   ' + BASS[i] + ' -   ' + BASS[i] + ' -   ' + BASS[i] + ' -  ', 'bass', 15, 0)));
    }
    var dA = b.add('noi', 'A', drm('k -   h -   k -   h -   k -   h -   k -   h -  '));
    var dB = b.add('noi', 'B', drm('k -   h -   s -   h -   k -   h -   s -   h h  '));

    for (i = 0; i < 10; i++) {
      var k = i % 5;
      b.bar(p1[k], p2[k], tri[k], (i % 5 === 4) ? dB : dA);
    }
    return b.done(INST, 0, true);
  }

  /* ============================================================ 7. title */
  /* 《星塵序曲》C 大調、150 BPM（speed 6 × 16 row/小節）、**8 小節 loop** = 768 幀 ≈ 12.77 s。
     標題畫面專用的短曲：和聲進行 C – Am – F – G – C – Em – F – G7，
     前 4 小節是「四分音長音號角」（讓玩家讀完標題），後 4 小節轉成 8 分音的下行答句，
     最後一小節用 G7 的掛留把耳朵帶回開頭（研究 06 §2.8 order table 重用：8 小節只用 22 個 pattern）。
     p1 lead 號角 / p2 8 分琶音 stab / tri 八度跳躍低音 / noi 基本鼓 + 段末過門。 */

  function buildTitle() {
    var b = new Builder('星塵序曲（title）', 6, 16, null);

    var MELODY = [
      'E-5 -   -   -   G-5 -   -   -   C-6 -   -   -   G-5 -   -   -  ',   // 0  C
      'A-5 -   -   -   E-5 -   -   -   C-5 -   -   -   E-5 -   -   -  ',   // 1  Am
      'F-5 -   -   -   A-5 -   -   -   C-6 -   -   -   A-5 -   -   -  ',   // 2  F
      'G-5 -   -   -   B-5 -   -   -   D-6 -   -   -   B-5 -   -   -  ',   // 3  G
      'C-6 -   B-5 -   G-5 -   E-5 -   G-5 -   -   -   -   -   -   -  ',   // 4  C
      'E-5 -   G-5 -   B-5 -   G-5 -   E-5 -   -   -   -   -   -   -  ',   // 5  Em
      'F-5 -   A-5 -   C-6 -   A-5 -   F-5 -   -   -   -   -   -   -  ',   // 6  F
      'D-6 -   -   -   B-5 -   G-5 -   D-5 -   -   -   =   -   -   -  '    // 7  G7（掛留 → 回開頭）
    ];
    var ROOT = ['C-4', 'A-3', 'F-3', 'G-3', 'C-4', 'E-3', 'F-3', 'G-3'];
    var ARP = [MAJ, MIN, MAJ, MAJ, MAJ, MIN, MAJ, DOM7];
    var BASS = ['C-2', 'A-1', 'F-1', 'G-1', 'C-2', 'E-1', 'F-1', 'G-1'];
    var BASH = ['C-3', 'A-2', 'F-2', 'G-2', 'C-3', 'E-2', 'F-2', 'G-2'];

    // 三角波八度跳躍低音（研究 06 §2.6）：低 → 高 → 低 → 高，一小節 4 次
    function oct(lo, hi) {
      var s = '', i;
      for (i = 0; i < 4; i++) s += lo + ' -   ' + hi + ' -   ';
      return s;
    }

    var dA = b.add('noi', 'A', drm('k -   h -   s -   h -   k -   h -   s -   h -  '));
    var dB = b.add('noi', 'B', drm('k -   h -   s -   h -   k -   s -   s s   s h  '));

    var i;
    for (i = 0; i < 8; i++) {
      b.bar(
        b.add('p1', 'm' + i, mel(MELODY[i], 'lead', 14, 2)),
        b.add('p2', 'a' + i, stab(ROOT[i], ARP[i], 16, 2, 'stab', 10, 1)),
        b.add('tri', 'b' + i, mel(oct(BASS[i], BASH[i]), 'bass', 15, 0)),
        (i === 3 || i === 7) ? dB : dA
      );
    }
    return b.done(INST, 0, true);
  }

  /* ========================================== 7~9. clear / death / gameover */

  function buildClear() {                       // 180 幀 ≈ 3.00 s，不 loop
    var b = new Builder('過關（clear）', 6, 30, null);
    b.bar(
      b.add('p1', 'a', mel('C-5 -   E-5 -   G-5 -   C-6 -   -   -   G-5 -   C-6 -   -   -   E-6 -   -   -   D-6 -   C-6 -   -   -   -   -   -   -  ', 'bell', 15, 1)),
      b.add('p2', 'a', mel('G-4 -   C-5 -   E-5 -   G-5 -   -   -   E-5 -   G-5 -   -   -   C-6 -   -   -   B-5 -   G-5 -   -   -   -   -   -   -  ', 'stab', 12, 0)),
      b.add('tri', 'a', mel('C-3 -   -   -   -   -   C-3 -   -   -   G-2 -   C-3 -   -   -   C-3 -   -   -   G-2 -   C-3 -   -   -   -   -   -   -  ', 'bass', 15, 0)),
      b.add('noi', 'a', drm('c:12 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   s:10 -   s:12 -   s:14 -   -   -   -   -   -   -   -   -  '))
    );
    return b.done(INST, 0, false);
  }

  function buildDeath() {                       // 90 幀 ≈ 1.50 s，不 loop
    var b = new Builder('死亡（death）', 5, 18, null);
    b.bar(
      b.add('p1', 'a', mel('G-5 -   F#5 -   F-5 -   E-5 -   D#5 -   D-5 -   C#5 -   C-5 -   -   -  ', 'lead', 14, 2)),
      b.add('p2', 'a', mel('C-5 -   B-4 -   A#4 -   A-4 -   G#4 -   G-4 -   F#4 -   F-4 -   -   -  ', 'echo', 12, 0)),
      b.add('tri', 'a', mel('C-3 -   -   -   -   -   A-2 -   -   -   -   -   F-2 -   -   -   -   -  ', 'bass', 15, 0)),
      b.add('noi', 'a', drm('m:12 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -  '))
    );
    return b.done(INST, 0, false);
  }

  function buildGameOver() {                    // 180 幀 ≈ 3.00 s，不 loop
    var b = new Builder('遊戲結束（gameover）', 9, 20, null);
    b.bar(
      b.add('p1', 'a', mel('A-4 -   -   -   G-4 -   -   -   F-4 -   -   -   E-4 -   -   -   -   -   -   -  ', 'organ', 14, 2, { vib: { rate: 4, depth: 4, delay: 16 } })),
      b.add('p2', 'a', mel('C-4 -   -   -   B-3 -   -   -   A-3 -   -   -   G#3 -   -   -   -   -   -   -  ', 'organ', 9, 0)),
      b.add('tri', 'a', mel('A-2 -   -   -   -   -   -   -   F-2 -   -   -   -   -   -   -   E-2 -   -   -  ', 'bass', 15, 0)),
      b.add('noi', 'a', drm('m:10 -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   m:8 -   -   -  '))
    );
    return b.done(INST, 0, false);
  }

  /* =================================================================== 音效 */
  /* 全部原創。只搶 p2（方波 2）與 noi（雜訊）：p1 主旋律與三角波低音永遠不被打斷
     （研究 06 §1.6：三角波一斷整首會空掉）。上行 = 正面、下行 = 負面（§4.3）。 */

  // [音名, 幀數, 音量, 占空比] → 音效幀陣列；retrig = 每個音重觸發（打點感）
  function sq(list, retrig) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i], f = { note: e[0] };
      if (e[2] !== undefined && e[2] !== null) f.vol = e[2];
      if (e[3] !== undefined && e[3] !== null) f.duty = e[3];
      if (retrig) f.retrigger = true;
      out.push(f);
      for (j = 1; j < (e[1] || 1); j++) out.push(null);
    }
    return out;
  }
  // [雜訊週期索引, 幀數, 音量, LFSR 模式]
  function nq(list) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i], f = { note: e[0] };
      if (e[2] !== undefined && e[2] !== null) f.vol = e[2];
      if (e[3] !== undefined && e[3] !== null) f.duty = e[3];
      out.push(f);
      for (j = 1; j < (e[1] || 1); j++) out.push(null);
    }
    return out;
  }
  function fade(v0, n) {                    // 線性衰減尾巴 + 結束
    var out = [], i;
    for (i = 1; i <= n; i++) out.push({ vol: Math.max(0, Math.round(v0 * (1 - i / n))) });
    out.push({ off: true });
    return out;
  }
  function cat(a, b2) { return a.concat(b2); }

  var PRIORITY = {
    death: 9, goal: 8, oneup: 7, powerup: 6, hurt: 5, coin: 4, stomp: 3, jump: 2, bump: 1
  };

  var SFX = {
    // jump：方波 25% → 12.5% 的兩個八度上滑，12 幀（研究 06 §4.2「跳躍」）
    jump: {
      priority: PRIORITY.jump,
      data: {
        p2: cat(sq([['D-5', 1, 13, 1], ['G-5', 1], ['A#5', 1], ['D-6', 1], ['F-6', 1, 12, 0], ['G-6', 1, 11]]),
                fade(11, 6))
      }
    },
    // stomp：踩敵 = 雜訊短擊（由高到低）＋ 方波下滑的「重量」
    stomp: {
      priority: PRIORITY.stomp,
      data: {
        noi: cat(nq([[8, 1, 13, 0], [10, 1, 11], [12, 1, 8], [13, 1, 5], [14, 1, 2]]), [{ off: true }]),
        p2: cat(sq([['A-4', 1, 11, 2], ['F-4', 1], ['D-4', 1], ['A-3', 1, 8]]), fade(8, 4))
      }
    },
    // coin：兩音上跳（E-6 → B-6，上行五度），第二音長衰減
    coin: {
      priority: PRIORITY.coin,
      data: {
        p2: cat(sq([['E-6', 3, 12, 1], ['B-6', 7, 13, 1]], true), fade(13, 11))
      }
    },
    // powerup：大三和弦上行琶音（兩個八度），每音 2 幀
    powerup: {
      priority: PRIORITY.powerup,
      data: {
        p2: cat(sq([['C-5', 2, 12, 1], ['E-5', 2], ['G-5', 2], ['C-6', 2],
                    ['E-6', 2], ['G-6', 2], ['C-6', 2], ['E-6', 2], ['G-6', 2, 11]], true), fade(11, 8))
      }
    },
    // hurt：方波 50% 半音下滑 13 音 + 一記雜訊（下行 = 負面）
    hurt: {
      priority: PRIORITY.hurt,
      data: {
        p2: cat(sq([['G-5', 1, 13, 2], ['F#5', 1], ['F-5', 1], ['E-5', 1], ['D#5', 1], ['D-5', 1],
                    ['C#5', 1], ['C-5', 1], ['B-4', 1, 11], ['A#4', 1], ['A-4', 1], ['G#4', 1, 9], ['G-4', 2]]),
                fade(9, 6)),
        noi: cat(nq([[6, 1, 8, 0], [8, 1, 5], [10, 1, 2]]), [{ off: true }])
      }
    },
    // bump：撞頭的悶響——雜訊最低的兩段週期、4 幀就收（不搶三角波，見檔頭）
    bump: {
      priority: PRIORITY.bump,
      data: {
        noi: cat(nq([[14, 1, 9, 0], [15, 1, 6], [15, 1, 3], [15, 1, 1]]), [{ off: true }])
      }
    },
    // goal：旗桿滑下——C 大調音階從 G-6 一路下行 15 音（每音 2 幀），最後收在 G-4
    goal: {
      priority: PRIORITY.goal,
      data: {
        p2: cat(sq([['G-6', 2, 13, 1], ['F-6', 2], ['E-6', 2], ['D-6', 2], ['C-6', 2], ['B-5', 2], ['A-5', 2],
                    ['G-5', 2], ['F-5', 2], ['E-5', 2], ['D-5', 2], ['C-5', 2], ['B-4', 2], ['A-4', 2], ['G-4', 4, 12]]),
                fade(12, 6))
      }
    },
    // oneup：上行三音（+ 一個收尾的八度），每音 5 幀
    oneup: {
      priority: PRIORITY.oneup,
      data: {
        p2: cat(sq([['G-5', 5, 12, 1], ['C-6', 5, 12], ['E-6', 5, 13], ['G-6', 6, 13]], true), fade(13, 8))
      }
    },
    // death：死亡的短音效版（完整的 1.5 秒 jingle 請用 play('death')）
    death: {
      priority: PRIORITY.death,
      data: {
        p2: cat(sq([['A-5', 2, 13, 1], ['E-5', 2], ['C-5', 2], ['A-4', 2], ['E-4', 2], ['C-4', 4, 12]], true),
                fade(12, 8)),
        noi: cat(nq([[4, 2, 10, 1], [8, 2, 8], [12, 2, 5], [14, 2, 2]]), [{ off: true }])
      }
    }
  };

  /* ================================================================ 曲目表 */

  var SONGS = {
    title: buildTitle(),
    ground: buildGround(),
    cave: buildCave(),
    sky: buildSky(),
    castle: buildCastle(),
    boss: buildBoss(),
    invincible: buildInvincible(),
    clear: buildClear(),
    death: buildDeath(),
    gameover: buildGameOver()
  };

  // 給 PROGRESS / 測試 / 離線渲染用的曲目資訊（BPM 由 speed 反算，groove 取平均）
  var INFO = {
    title:      { bpm: 150.0, rowsPerBeat: 4, bars: 8, mood: '明亮號角、期待', ch: 'p1 號角旋律 / p2 8 分琶音 / tri 八度低音 / noi 鼓 + 過門' },
    ground:     { bpm: 163.6, rowsPerBeat: 4, bars: 32, mood: '明亮跳躍', ch: 'p1 旋律 / p2 琶音 / tri 八度低音 / noi 鼓' },
    cave:       { bpm: 100.0, rowsPerBeat: 4, bars: 16, mood: '低沉稀疏、回音', ch: 'p1 稀疏旋律 / p2 延遲回音 / tri 半音符低音 / noi 悶響水滴' },
    sky:        { bpm: 150.0, rowsPerBeat: 6, bars: 16, mood: '輕快高音三連音', ch: 'p1 三連音琶音 / p2 長音和弦 / tri 四分低音 / noi 輕鼓' },
    castle:     { bpm: 90.0,  rowsPerBeat: 4, bars: 16, mood: '緊張半音、慢', ch: 'p1 半音風琴 / p2 減和弦長音 / tri 半音下行低音 / noi 低鳴' },
    boss:       { bpm: 225.0, rowsPerBeat: 4, bars: 16, mood: '快速下行動機', ch: 'p1 16 分下行 / p2 延遲回音 / tri 8 分踏板 / noi 疾走 16 分' },
    invincible: { bpm: 300.0, rowsPerBeat: 4, bars: 10, mood: '急促上行、無敵', ch: 'p1 半音推進琶音 / p2 和弦 / tri 8 分低音 / noi 16 分' },
    clear:      { bpm: 150.0, rowsPerBeat: 4, bars: 1.875, mood: '勝利號角', ch: 'p1 鐘聲 / p2 和聲 / tri 低音 / noi 鈸 + 滾奏' },
    death:      { bpm: 180.0, rowsPerBeat: 4, bars: 1.125, mood: '半音墜落', ch: 'p1 半音下行 / p2 低八度 / tri 下行低音 / noi 悶響' },
    gameover:   { bpm: 100.0, rowsPerBeat: 4, bars: 1.25, mood: '低沉終止', ch: 'p1 風琴 / p2 內聲部 / tri 低音 / noi 低鳴' }
  };
  (function () {                          // 補上實際長度（幀 / 秒），避免手寫算錯
    var HZ = 60.0988, k;
    for (k in SONGS) {
      if (!Object.prototype.hasOwnProperty.call(SONGS, k)) continue;
      var s = SONGS[k], rows = 0, i;
      for (i = 0; i < s.order.length; i++) rows += s.rows;
      var sp = s.groove ? (s.groove.reduce(function (a, v) { return a + v; }, 0) / s.groove.length) : s.speed;
      INFO[k] = INFO[k] || {};
      INFO[k].speed = s.speed;
      INFO[k].groove = s.groove;
      INFO[k].rows = s.rows;
      INFO[k].order = s.order.length;
      INFO[k].patterns = s.patterns.length;
      INFO[k].frames = Math.round(rows * sp);
      INFO[k].seconds = Math.round(rows * sp / HZ * 100) / 100;
      INFO[k].loop = s.playLoop;
    }
  })();

  /* ================================================================ 驗證用 */
  /* 不在載入時跑（遊戲不能因為音樂資料出錯而黑畫面）；tools / 測試腳本呼叫 ST.Audio.validate()。 */

  function validate() {
    var bad = [], k, i, t, TR = ['p1', 'p2', 'tri', 'noi', 'dmc'];
    var toMidi = (NES.Music && NES.Music.noteToMidi) ? NES.Music.noteToMidi : null;
    for (k in SONGS) {
      if (!Object.prototype.hasOwnProperty.call(SONGS, k)) continue;
      var s = SONGS[k];
      for (i = 0; i < s.patterns.length; i++) {
        for (t = 0; t < TR.length; t++) {
          var arr = s.patterns[i][TR[t]];
          if (!arr) continue;
          if (arr.length !== s.rows) bad.push(k + ' pattern#' + i + ' ' + TR[t] + ' 長度 ' + arr.length + ' ≠ rows ' + s.rows);
          for (var r = 0; r < arr.length; r++) {
            var row = arr[r];
            if (!row || row.note === undefined || row.note === null) continue;
            if (TR[t] === 'noi') {
              if (row.note !== '===' && (typeof row.note !== 'number' || row.note < 0 || row.note > 15))
                bad.push(k + ' pattern#' + i + ' noi row' + r + ' 週期索引不合法：' + row.note);
            } else if (typeof row.note === 'string' && row.note !== '===' && row.note !== '---' && toMidi) {
              var mv = toMidi(row.note);
              if (mv === null) bad.push(k + ' pattern#' + i + ' ' + TR[t] + ' row' + r + ' 音名無法解析：' + row.note);
              else if (mv < 21 || mv > 108) bad.push(k + ' pattern#' + i + ' ' + TR[t] + ' row' + r + ' 音高超出鋼琴範圍：' + row.note);
            }
          }
        }
      }
      for (i = 0; i < s.order.length; i++) {
        var e = s.order[i];
        for (t = 0; t < TR.length; t++) {
          var pi = e[TR[t]];
          if (pi === undefined || pi === null) continue;
          if (!s.patterns[pi]) bad.push(k + ' order#' + i + ' ' + TR[t] + ' 指向不存在的 pattern ' + pi);
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
        if (d[n].length > 60) bad.push('音效 ' + k + ' 的 ' + n + ' 長度 ' + d[n].length + ' 幀 > 60');
        if (!d[n][d[n].length - 1] || !d[n][d[n].length - 1].off) bad.push('音效 ' + k + ' 的 ' + n + ' 沒有以 {off:true} 收尾');
      }
    }
    return bad;
  }

  /* ================================================================== API */

  function driverOf(nes) {
    var n = nes || Audio._nes;
    if (n && n.music) return n.music;
    if (NES.Music && NES.Music._default) return NES.Music;
    return null;
  }

  // 未知 key / 未知音效只 warn 一次（每個名字一次），不要每幀洗版
  var WARNED = {};
  function warnOnce(msg) {
    if (WARNED[msg]) return false;
    WARNED[msg] = true;
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') console.warn(msg);
    return true;
  }

  var Audio = {
    ready: !!(NES.Music),
    SONGS: SONGS,
    SFX: SFX,
    INFO: INFO,
    PRIORITY: PRIORITY,
    KEYS: ['title', 'ground', 'cave', 'sky', 'castle', 'boss', 'invincible', 'clear', 'death', 'gameover'],
    NAMES: ['jump', 'stomp', 'coin', 'powerup', 'hurt', 'bump', 'goal', 'oneup', 'death'],
    current: null,
    playing: false,
    validate: validate,

    _nes: null,
    _groove: null,
    _gi: 0,

    // 註冊全部音效（冪等）；nes 會被記住，之後 play / sfx 可以不傳
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

    // play('ground' | 'cave' | ... )；jingle（clear / death / gameover）自動不 loop
    play: function (key, nes) {
      var d = driverOf(nes), s = SONGS[key];
      // 未知曲名以前是「靜默失敗」（qa2-star P2-2 就是這樣漏掉 title 的）⇒ 一律 warn 一次
      if (!s) { warnOnce('ST.Audio.play(): 沒有這首曲子 "' + key + '"（可用：' + Audio.KEYS.join(' / ') + '）'); return false; }
      if (!d) return false;
      try {
        d.play(s, { loop: !!s.playLoop });
        Audio.current = key;
        Audio.playing = true;
        Audio._groove = s.groove || null;
        Audio._gi = 0;
        return true;
      } catch (e) { return false; }
    },

    stop: function (nes) {
      var d = driverOf(nes);
      if (!d) return false;
      try {
        d.stop();
        if (d.stopSfx) d.stopSfx();
        Audio.playing = false;
        Audio.current = null;
        Audio._groove = null;
        return true;
      } catch (e) { return false; }
    },

    // sfx('jump' | 'coin' | ...)：優先權寫在 SFX 定義裡，搶 p2 / noi
    sfx: function (name, nes) {
      var d = driverOf(nes);
      if (!SFX[name]) { warnOnce('ST.Audio.sfx(): 沒有這個音效 "' + name + '"（可用：' + Audio.NAMES.join(' / ') + '）'); return false; }
      if (!d) return false;
      try { d.sfx(name); return true; } catch (e) {
        try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; }
      }
    },

    // 每幀一次，由 star-hero 的 update() 末尾呼叫
    tick: function (nes) {
      var d = driverOf(nes);
      if (!d) return false;
      try {
        var g = Audio._groove;
        // groove：每個 row 開頭換一次 speed（5 / 6 交替 → 平均 5.5 幀 = 163.6 BPM）
        if (g && d.playing && d.rowFrame === 0) {
          d.speed = g[Audio._gi % g.length];
          Audio._gi++;
        }
        d.tick();
        if (Audio.playing && d.playing === false) { Audio.playing = false; }   // jingle 播完
        return true;
      } catch (e) { return false; }
    },

    // 測試 / 除錯用：哪一軌被誰佔著
    state: function (nes) {
      var d = driverOf(nes);
      if (!d || !d.state) return null;
      try {
        var s = d.state(), owners = {}, i;
        for (i = 0; i < s.channels.length; i++) owners[s.channels[i].name] = s.channels[i].owner || null;
        return {
          song: Audio.current, playing: s.playing, row: s.row, orderIndex: s.orderIndex, speed: s.speed,
          sfx: s.sfx.map(function (x) { return x.name; }), owners: owners,
          p1: s.channels[0], p2: s.channels[1], tri: s.channels[2], noi: s.channels[3]
        };
      } catch (e) { return null; }
    }
  };

  /* ============================================ R3 star-w2：曲目可外掛
   * `games/star/song_w2.js` 用同一套工具寫世界 2 的曲，再 register 進來。
   * play(key) 的行為不變（未知 key 仍然 warn + 回 false）；main.js 會在切曲前先
   * 用 `ST.Audio.has(key)` 判斷，缺鍵就退回既有曲目（契約同 cruiser）。 */
  Audio.BUILD = {
    Builder: Builder, mel: mel, drm: drm, echoOf: echoOf, stab: stab, hold: hold,
    INST: INST, MIN: MIN, MAJ: MAJ, DOM7: DOM7, DIM: DIM
  };
  Audio.has = function (key) { return !!SONGS[key]; };
  Audio.register = function (key, song, info) {
    var HZ = 60.0988, rows = 0, i;
    SONGS[key] = song;
    if (Audio.KEYS.indexOf(key) < 0) Audio.KEYS.push(key);
    for (i = 0; i < song.order.length; i++) rows += song.rows;
    var sp = song.groove ? (song.groove.reduce(function (a, v) { return a + v; }, 0) / song.groove.length) : song.speed;
    INFO[key] = info || {};
    INFO[key].speed = song.speed;
    INFO[key].groove = song.groove;
    INFO[key].rows = song.rows;
    INFO[key].order = song.order.length;
    INFO[key].patterns = song.patterns.length;
    INFO[key].frames = Math.round(rows * sp);
    INFO[key].seconds = Math.round(rows * sp / HZ * 100) / 100;
    INFO[key].loop = song.playLoop;
    return song;
  };

  ST.Audio = Audio;

})(typeof window !== 'undefined' ? window : this);
