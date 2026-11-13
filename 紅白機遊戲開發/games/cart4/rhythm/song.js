/*
 * games/cart4/rhythm/song.js — 《星塵節奏 STAR BEAT》音樂 / 音效（全部原創，只走 2A03 五聲道）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：engine/music.js
 * 契約：CT.Rhythm.Audio = { init, play, stop, pause, resume, sfx, tick, SONGS, SFX }；CT.Rhythm.TRACKS = 6 首可玩曲目的資料。
 *
 * 每首可玩曲目 = 2 小節數拍（count-in，譜面不放音符）+ 曲式 A B A C（各 4 小節）+ 1 小節收尾，loop:false。
 * 全部 pattern 都是 16 row = 1 小節（4/4，每拍 4 row），所以「全曲第 r 個 row」= rowsPlayed，
 * 譜面（chart.js）直接從這裡的 p1 旋律 / noi 大鼓小鼓 onset 推出 ⇒ 音符與音樂 row 一對一同步。
 *
 * | key        | 曲名           | speed | BPM   | 調   | 風格 |
 * |------------|----------------|-------|-------|------|------|
 * | rhythm_s1  | STAR LINE      | 7     | 128.6 | C    | 輕快 8 分音符、教學曲 |
 * | rhythm_s2  | COMET PARADE   | 6     | 150   | G    | 進行曲、C 段 16 分 |
 * | rhythm_s3  | NEBULA FUNK    | 6     | 150   | Dm   | 切分放克 |
 * | rhythm_s4  | AURORA DREAM   | 8     | 112.5 | F    | 慢板、長音 |
 * | rhythm_s5  | MOON ROCK      | 5     | 180   | Em   | 搖滾 8 分推進 |
 * | rhythm_s6  | SUPERNOVA      | 5     | 180   | Am   | 琶音 16 分、最難 |
 * | rhythm_title | 星圖序曲     | 7     |       | C    | 標題（loop） |
 * | rhythm_clear | 過關         | 7     |       |      | 結算（不 loop） |
 * | rhythm_fail  | 能量耗盡     | 8     |       |      | 失敗（不 loop） |
 * 音效（搶 p2 / noi）：rhythm_hit0..3（四軌各自音高 C6 / E6 / G6 / C7，可分辨）、rhythm_cue0..3（只靠聽覺模式的預告音）、
 *   rhythm_miss / slash / move / ok / ready / go / fail
 * fix-r8：rhythm_cue0..3 改走 p1、vol 13、8 幀、四種輪廓（上行 / 下行 / 低音單擊 / 高音雙擊）；rhythm_tick（EAR 命中音，雜訊）；
 *   rhythm_click / click_hi（校正與聲音檢查的節拍器）；rhythm_sN_ear = 旋律音量減半的 EAR 版（row 與原曲相同）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var RH = CT.Rhythm = CT.Rhythm || {};
  var NES = window.NES = window.NES || {};

  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t; }); }
  // 4 / 8 / 16 個 token 的小節 → 16 row（4 = 四分、8 = 八分、16 = 十六分）
  function grid(str) {
    var a = tok(str), o = [], k, j;
    if (a.length === 16) return a;
    if (a.length !== 8 && a.length !== 4) throw new Error('rhythm 小節要 4 / 8 / 16 個 token：' + str);
    k = 16 / a.length;
    for (var i = 0; i < a.length; i++) { o.push(a[i]); for (j = 1; j < k; j++) o.push('-'); }
    return o;
  }
  function N(t) { return /^[A-G][0-9]$/.test(t) ? t.charAt(0) + '-' + t.charAt(1) : t; }
  function mel(str, inst, vol, duty) {
    return grid(str).map(function (t) {
      if (t === '-') return null;
      if (t === '.') return { note: '---' };
      return { note: N(t), inst: inst, vol: vol, duty: duty };
    });
  }
  var PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function chord(sym) {
    var m = /^([A-G][#b]?)(m?)$/.exec(sym);
    if (!m) throw new Error('rhythm 和弦：' + sym);
    var r = PC[m[1]];
    return { root: r, tones: [0, m[2] ? 3 : 4, 7] };
  }
  function empty() { var a = []; for (var i = 0; i < 16; i++) a.push(null); return a; }

  // ---- 低音（三角波；midi 36 = C2） ----
  function bass(sym, style, speed) {
    var c = chord(sym), R = 36 + c.root, F = R + 7, O = R + 12, a = empty();
    function at(i, n, len) { a[i] = { note: n, inst: 'bass', cut: Math.max(2, len * speed - 2) }; }
    if (style === 'eighth') { for (var i = 0; i < 16; i += 2) at(i, (i & 2) ? O : R, 2); }
    else if (style === 'walk') { at(0, R, 4); at(4, F, 4); at(8, O, 4); at(12, F, 4); }
    else if (style === 'half') { at(0, R, 6); at(6, O, 2); at(8, F, 6); at(14, O, 2); }
    else if (style === 'sync') { at(0, R, 3); at(3, O, 2); at(6, R, 2); at(8, F, 3); at(11, R, 2); at(14, O, 2); }
    else if (style === 'drive') { for (var j = 0; j < 16; j += 2) at(j, j === 14 ? F : R, 2); }
    else if (style === 'long') { at(0, R, 8); at(8, F, 8); }
    return a;
  }
  // ---- 和聲（p2；C4 = 60 附近） ----
  function harm(sym, style) {
    var c = chord(sym), base = 60 + c.root, a = empty();
    if (base > 66) base -= 12;
    var t3 = base + c.tones[1], t5 = base + c.tones[2];
    if (style === 'arp') { var seq = [base, t3, t5, base + 12]; for (var i = 0; i < 16; i += 2) a[i] = { note: seq[(i >> 1) & 3], inst: 'pluck', vol: 6, duty: 2 }; }
    else if (style === 'pad') { a[0] = { note: t3, inst: 'pad', vol: 5, duty: 1 }; a[8] = { note: t5, inst: 'pad', vol: 5, duty: 1 }; }
    else if (style === 'stab') { [2, 6, 10, 14].forEach(function (k) { a[k] = { note: t3 + 12, inst: 'pluck', vol: 6, duty: 1 }; }); }
    else if (style === 'arp3') { var s3 = [t5, t3, base, t3]; for (var j = 0; j < 16; j += 2) a[j] = { note: s3[(j >> 1) & 3] + 12, inst: 'pluck', vol: 5, duty: 0 }; }
    return a;
  }
  var DR = { k: { note: 12, inst: 'kick', vol: 13, duty: 0 }, s: { note: 6, inst: 'snare', vol: 12, duty: 0 },
             h: { note: 1, inst: 'hat', vol: 7, duty: 0 }, o: { note: 2, inst: 'open', vol: 7, duty: 0 }, x: { note: 3, inst: 'crash', vol: 12, duty: 0 } };
  var DRUMS = {
    basic: 'k - h - s - h - k - h - s - h h',
    disco: 'k - o - s - o - k - o - s - o h',
    funk: 'k - h k s - h - - k h - s - h k',
    rock: 'k - h - s - h - k k h - s - h -',
    soft: 'k - - - h - - - s - - - h - - -',
    drive: 'k h h h s h h h k h k h s h h h',
    march: 'k - h - s - h s k - h - s s s -',
    count: 'h - - - h - - - h - - - h - - -',
    count2: 'h - - - h - - - h - - - s - s -',
    end: 'x - - - - - - - - - - - - - - -'
  };
  function drm(name) { return grid(DRUMS[name] || name).map(function (t) { return DR[t] ? { note: DR[t].note, inst: DR[t].inst, vol: DR[t].vol, duty: 0 } : null; }); }

  var INST = {
    lead: { vol: [12, 13, 12, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2, 2, 1] },
    lead2: { vol: [13, 12, 10, 9, 8, 8, 7, 7, 6], volLoop: 8, duty: [1] },
    soft: { vol: [7, 9, 10, 11, 11, 10, 10, 9, 9, 8], volLoop: 9, duty: [2] },
    pluck: { vol: [10, 7, 5, 3, 2, 1, 0], duty: [2] },
    pad: { vol: [5, 7, 8, 8, 7, 7, 6, 6, 5], volLoop: 8, duty: [1] },
    click: { vol: [12, 6, 2, 0] },
    bass: {},
    kick: { vol: [15, 12, 8, 4, 1, 0] },
    snare: { vol: [13, 11, 9, 7, 5, 3, 1, 0] },
    hat: { vol: [6, 3, 1, 0] },
    open: { vol: [7, 6, 5, 4, 3, 2, 1, 0] },
    crash: { vol: [12, 11, 10, 9, 8, 7, 6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0] }
  };

  // 數拍小節：p2 每拍一聲短拍（第 1 拍高八度），noi 輕擊
  function countBar(n, speed) {
    var p2 = empty();
    for (var b = 0; b < 4; b++) p2[b * 4] = { note: b === 0 ? 'G-6' : 'C-6', inst: 'click', vol: 9, duty: 2, cut: Math.min(4, speed) };
    return { p1: empty(), p2: p2, tri: empty(), noi: drm(n === 0 ? 'count' : 'count2') };
  }

  /* 可玩曲目定義：mel.A/B/C 各 4 小節旋律、chords 各 4 個和弦；style = {bass, harm, drum, drumC, lead, duty} */
  var DEFS = [
    { key: 'rhythm_s1', title: 'STAR LINE', zh: '起跑星線', speed: 7, style: { bass: 'walk', harm: 'arp', drum: 'basic', drumC: 'disco', lead: 'lead', duty: 2 },
      chords: { A: ['C', 'G', 'Am', 'F'], B: ['F', 'G', 'Em', 'Am'], C: ['Dm', 'G', 'C', 'C'] },
      mel: {
        A: ['E5 - G5 - C6 - G5 -', 'D5 - G5 - B5 - A5 G5', 'A5 - E5 - C5 - E5 A5', 'G5 - F5 E5 F5 - . -'],
        B: ['A5 - A5 G5 F5 - A5 -', 'B5 - D6 - B5 - G5 -', 'G5 - E5 - B4 - E5 G5', 'A5 - - - C6 - B5 -'],
        C: ['F5 - A5 - D6 - A5 -', 'G5 - B5 - D6 C6 B5 G5', 'E5 G5 C6 - E6 - D6 C6', 'C6 - - - . - - -']
      }, end: 'C' },
    { key: 'rhythm_s2', title: 'COMET PARADE', zh: '彗星遊行', speed: 6, style: { bass: 'half', harm: 'stab', drum: 'march', drumC: 'basic', lead: 'lead2', duty: 1 },
      chords: { A: ['G', 'Em', 'C', 'D'], B: ['C', 'D', 'Bm', 'Em'], C: ['Am', 'D', 'G', 'G'] },
      mel: {
        A: ['B5 - D6 B5 G5 - D5 -', 'E5 G5 B5 - G5 - E5 -', 'C6 - E6 C6 G5 - E5 G5', 'F#5 - A5 - D6 - - -'],
        B: ['E6 - D6 C6 B5 - C6 -', 'D6 - C6 B5 A5 - F#5 -', 'F#5 - B5 - D6 - B5 -', 'G5 - E5 - B5 - - -'],
        C: ['A5 - C6 - E6 - C6 A5 - - E5 - A5 - C6 -', 'D6 - C6 - A5 - F#5 - D5 - F#5 - A5 - C6 -', 'B5 - - - D6 - - - G6 - - - D6 - B5 -', 'G5 - - - - - - - . - - - - - - -']
      }, end: 'G' },
    { key: 'rhythm_s3', title: 'NEBULA FUNK', zh: '星雲放克', speed: 6, style: { bass: 'sync', harm: 'stab', drum: 'funk', drumC: 'funk', lead: 'lead', duty: 1 },
      chords: { A: ['Dm', 'G', 'Dm', 'G'], B: ['Bb', 'C', 'Am', 'Dm'], C: ['Gm', 'A', 'Dm', 'Dm'] },
      mel: {
        A: ['D5 - . F5 - . A5 - . . C6 - A5 - . .', 'B5 - . A5 - . G5 - . D5 - . G5 - A5 -', 'D6 - . C6 - . A5 - . F5 - . A5 - . .', 'G5 - B5 - D6 - . . B5 - . A5 - G5 - -'],
        B: ['F5 - - - D5 - F5 - Bb5 - - - A5 - G5 -', 'E5 - - - C5 - E5 - G5 - - - F5 - E5 -', 'A5 - . E5 - . A5 - . C6 - . B5 - A5 -', 'D6 - - - - - - - A5 - - - F5 - - -'],
        C: ['G5 - Bb5 - D6 - Bb5 - G5 - D5 - G5 - Bb5 -', 'A5 - C#6 - E6 - C#6 - A5 - E5 - C#5 - E5 -', 'F5 - A5 - D6 - F6 - E6 - D6 - C6 - A5 -', 'D6 - - - . . . . D5 - . . . . . .']
      }, end: 'Dm' },
    { key: 'rhythm_s4', title: 'AURORA DREAM', zh: '極光之夢', speed: 8, style: { bass: 'long', harm: 'arp', drum: 'soft', drumC: 'basic', lead: 'soft', duty: 2 },
      chords: { A: ['F', 'C', 'Dm', 'Bb'], B: ['Gm', 'C', 'Am', 'Dm'], C: ['Bb', 'C', 'F', 'F'] },
      mel: {
        A: ['A5 - - - C6 - A5 -', 'G5 - - - E5 - C5 -', 'F5 - A5 - D6 - - C6', 'D6 - - - Bb5 - - -'],
        B: ['Bb5 - - A5 G5 - D5 -', 'E5 - G5 - C6 - - -', 'C6 - - B5 A5 - E5 -', 'F5 - - - A5 - - -'],
        C: ['D6 - - C6 Bb5 - F5 -', 'E5 - G5 - Bb5 - G5 -', 'A5 - C6 - F6 - - -', 'F5 - - - . - - -']
      }, end: 'F' },
    { key: 'rhythm_s5', title: 'MOON ROCK', zh: '月岩搖滾', speed: 5, style: { bass: 'eighth', harm: 'pad', drum: 'rock', drumC: 'drive', lead: 'lead', duty: 2 },
      chords: { A: ['Em', 'C', 'G', 'D'], B: ['Am', 'Em', 'C', 'D'], C: ['Em', 'D', 'C', 'B'] },
      mel: {
        A: ['E5 - E5 G5 - B5 - G5', 'C6 - B5 - G5 - E5 -', 'D5 - G5 - B5 - D6 -', 'C6 - B5 A5 F#5 - - -'],
        B: ['A5 - C6 - E6 - C6 -', 'B5 - G5 - E5 - G5 -', 'G5 - E6 - D6 - C6 -', 'D6 - A5 - F#5 - D5 -'],
        C: ['E5 G5 B5 E6 - - B5 - G5 - E5 - G5 - B5 -', 'D5 F#5 A5 D6 - - A5 - F#5 - D5 - F#5 - A5 -', 'C5 E5 G5 C6 - - G5 - E5 - C5 - E5 - G5 -', 'B4 - D#5 - F#5 - B5 - - - - - . - - -']
      }, end: 'Em' },
    { key: 'rhythm_s6', title: 'SUPERNOVA', zh: '超新星', speed: 5, style: { bass: 'drive', harm: 'arp3', drum: 'drive', drumC: 'rock', lead: 'lead2', duty: 2 },
      chords: { A: ['Am', 'F', 'G', 'Em'], B: ['F', 'G', 'Am', 'Am'], C: ['Dm', 'E', 'Am', 'E'] },
      mel: {
        A: ['A5 - C6 - E6 - A5 - C6 - E6 - A6 - E6 -', 'F5 - A5 - C6 - F5 - A5 - C6 - F6 - C6 -', 'G5 - B5 - D6 - G5 - B5 - D6 - G6 - D6 -', 'E6 - - - D6 - - - B5 - - - G5 - - -'],
        B: ['A5 - C6 - F6 - E6 -', 'D6 - B5 - G5 - D6 -', 'C6 - E6 - A6 - G6 -', 'E6 - - - A5 - - -'],
        C: ['D6 - F6 - A6 - F6 - D6 - A5 - F5 - A5 -', 'E6 - G#6 - B6 - G#6 - E6 - B5 - G#5 - B5 -', 'A6 - E6 - C6 - A5 - E6 - C6 - A5 - E5 -', 'E5 - - - G#5 - - - B5 - - - E6 - - -']
      }, end: 'Am' }
  ];
  var FORM = ['A', 'B', 'A', 'C'];
  var COUNT_IN = 2;

  function sectionBar(def, sec, i) {
    var st = def.style, sym = def.chords[sec][i];
    return {
      p1: mel(def.mel[sec][i], st.lead, 12, st.duty),
      p2: harm(sym, st.harm),
      tri: bass(sym, st.bass, def.speed),
      noi: drm(sec === 'C' ? st.drumC : st.drum)
    };
  }
  function endBar(def) {
    var c = chord(def.end), R = 60 + c.root;
    if (R > 66) R -= 12;
    var p1 = empty(), p2 = empty(), tri = empty();
    p1[0] = { note: R + 12, inst: def.style.lead, vol: 11, duty: def.style.duty, cut: def.speed * 12 };
    p2[0] = { note: R + c.tones[1], inst: 'pad', vol: 6, duty: 1, cut: def.speed * 12 };
    tri[0] = { note: 36 + c.root, inst: 'bass', cut: def.speed * 12 };
    return { p1: p1, p2: p2, tri: tri, noi: drm('end') };
  }
  function buildTrack(def) {
    var s = { name: def.title + '（' + def.key + '）', speed: def.speed, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: false };
    for (var c = 0; c < COUNT_IN; c++) { s.order.push(s.patterns.length); s.patterns.push(countBar(c, def.speed)); }
    FORM.forEach(function (sec) { for (var i = 0; i < 4; i++) { s.order.push(s.patterns.length); s.patterns.push(sectionBar(def, sec, i)); } });
    s.order.push(s.patterns.length); s.patterns.push(endBar(def));
    return s;
  }
  function buildTitle() {
    var def = { speed: 7, style: { bass: 'walk', harm: 'arp3', drum: 'soft', drumC: 'basic', lead: 'soft', duty: 2 },
      chords: { A: ['C', 'Am', 'F', 'G'], B: ['F', 'G', 'Em', 'Am'] },
      mel: { A: ['G5 - E5 - C6 - - -', 'A5 - C6 - E6 - D6 C6', 'A5 - - - F5 - A5 -', 'G5 - B5 - D6 - - -'],
             B: ['C6 - A5 - F5 - A5 C6', 'D6 - B5 - G5 - B5 D6', 'E6 - - - B5 - G5 -', 'A5 - - - - - . -'] } };
    var s = { name: '星圖序曲（rhythm_title）', speed: 7, rows: 16, loop: 0, instruments: INST, patterns: [], order: [], playLoop: true };
    ['A', 'B'].forEach(function (sec) { for (var i = 0; i < 4; i++) { s.order.push(s.patterns.length); s.patterns.push(sectionBar(def, sec, i)); } });
    return s;
  }
  function jingle(name, speed, p1s, p2s, tris, drum) {
    return { name: name, speed: speed, rows: 16, loop: 0, instruments: INST, playLoop: false, order: [0],
      patterns: [{ p1: mel(p1s, 'lead', 12, 2), p2: mel(p2s, 'pad', 7, 1), tri: mel(tris, 'bass', 15, 0), noi: drm(drum) }] };
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
  // 四軌音高（↑ C6 / ↓ E6 / ← G6 / → C7）：彼此相差三度以上，聽得出是哪一軌
  var LANE_NOTE = ['C-6', 'E-6', 'G-6', 'C-7'];
  var SFX = {
    rhythm_miss: { priority: 3, data: { noi: nz([[13, 3, 9], [14, 4, 5]]) } },
    rhythm_slash: { priority: 2, data: { noi: nz([[1, 2, 8], [3, 2, 6], [5, 2, 3]]) } },
    rhythm_move: { priority: 2, data: { p2: sq([['A-5', 3, 8, 2]]) } },
    rhythm_ok: { priority: 4, data: { p2: sq([['E-6', 3, 10, 2], ['A-6', 6, 10]]) } },
    rhythm_ready: { priority: 4, data: { p2: sq([['C-6', 4, 9, 2]]) } },
    rhythm_go: { priority: 4, data: { p2: sq([['C-6', 2, 10, 2], ['G-6', 2, 10], ['C-7', 5, 10]]) } },
    rhythm_fail: { priority: 6, data: { p2: sq([['E-5', 5, 11, 0], ['C-5', 5, 10], ['A-4', 10, 9]]) } }
  };
  LANE_NOTE.forEach(function (n, i) {
    SFX['rhythm_hit' + i] = { priority: 2, data: { p2: sq([[n, 2, 7, 2], [n, 2, 4, 2]]) } };
  });
  // ---- EAR（只靠聲音）預告音 —— fix-r8 qa-r8 P2-2 ----
  // 走 p1（EAR 時旋律在 p1 且音量減半；預告音搶 p1 的那 8 幀旋律讓位 ⇒ 不會被旋律蓋掉），音量 13、長 8 幀，
  // 四軌靠「輪廓 + 音色」分辨，不必有絕對音感：↑ 上行琶音（50%）、↓ 下行琶音（50%）、← 低音單擊（12.5% 嗡聲）、→ 高音雙擊（25%）。
  // EAR 模式的命中音改成無音高的雜訊短擊 rhythm_tick ⇒ 不會和預告音混淆（舊版預告音和命中音同音高同聲道）。
  function frames(notes, vols, duty) {
    var out = [];
    for (var j = 0; j < vols.length; j++) {
      var f = { vol: vols[j], duty: duty };
      if (j === 0 || notes[j] !== notes[j - 1]) { f.note = notes[j]; f.retrigger = j === 0; }
      out.push(f);
    }
    out.push({ off: true });
    return out;
  }
  var CUE_DEF = [
    { name: 'RISE', notes: ['G-3', 'B-3', 'D-4', 'G-4', 'B-4', 'D-5', 'G-5', 'G-5'], vols: [13, 13, 13, 13, 13, 12, 11, 8], duty: 2 },
    { name: 'FALL', notes: ['G-5', 'D-5', 'B-4', 'G-4', 'D-4', 'B-3', 'G-3', 'G-3'], vols: [13, 13, 13, 13, 13, 12, 11, 8], duty: 2 },
    { name: 'LOW', notes: ['C-4', 'C-4', 'C-4', 'C-4', 'C-4', 'C-4', 'C-4', 'C-4'], vols: [14, 13, 12, 11, 10, 9, 7, 5], duty: 0 },
    { name: 'DOUBLE', notes: ['E-5', 'E-5', 'E-5', 'E-5', 'E-5', 'E-5', 'E-5', 'E-5'], vols: [13, 13, 13, 0, 0, 13, 13, 10], duty: 1 }
  ];
  CUE_DEF.forEach(function (c, i) { SFX['rhythm_cue' + i] = { priority: 3, data: { p1: frames(c.notes, c.vols, c.duty) } }; });
  SFX.rhythm_tick = { priority: 2, data: { noi: nz([[2, 2, 10], [3, 2, 5]]) } };
  // 校正 / 聲音檢查用的節拍器（p2，短而清楚）
  SFX.rhythm_click = { priority: 4, data: { p2: sq([['A-5', 2, 13, 2], ['A-5', 2, 6, 2]]) } };
  SFX.rhythm_click_hi = { priority: 4, data: { p2: sq([['A-6', 2, 13, 2], ['A-6', 2, 6, 2]]) } };

  var SONGS = {}, TRACKS = [];
  DEFS.forEach(function (d) {
    SONGS[d.key] = buildTrack(d);
    TRACKS.push({ key: d.key, title: d.title, zh: d.zh, speed: d.speed, bpm: Math.round(36000 / (d.speed * 4)) / 10, bars: SONGS[d.key].order.length, countIn: COUNT_IN });
  });
  // EAR 版：同一首曲子（row / speed 完全相同 ⇒ 譜面同步不變），p1 旋律音量減半，讓預告音（vol 13）明顯站在前面
  function earCopy(song) {
    var s = JSON.parse(JSON.stringify(song));
    s.name = song.name.replace('）', '・EAR）');
    s.patterns.forEach(function (pt) { (pt.p1 || []).forEach(function (r) { if (r && r.vol !== undefined) r.vol = Math.max(3, Math.round(r.vol / 2)); }); });
    return s;
  }
  TRACKS.forEach(function (t) { SONGS[t.key + '_ear'] = earCopy(SONGS[t.key]); t.earKey = t.key + '_ear'; });
  SONGS.rhythm_title = buildTitle();
  SONGS.rhythm_clear = jingle('過關（rhythm_clear）', 7, 'C6 E6 G6 C7 - - . -', 'E5 G5 C6 E6 - - . -', 'C3 - G2 - C2 - . -', 'k - h - s - h - x - - - - - - -');
  SONGS.rhythm_fail = jingle('能量耗盡（rhythm_fail）', 8, 'G5 - E5 - C5 - . -', 'E4 - C4 - G3 - . -', 'C2 - - - G1 - . -', 'k - - - - - - - k - - - - - - -');

  function drv(nes) { return (nes && nes.music) || null; }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, _nes: null, _paused: null,
    init: function (nes) {
      Audio._nes = nes; Audio.current = null; Audio._paused = null;
      var d = drv(nes);
      if (!d) return false;
      for (var k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { d.define(k, SFX[k]); } catch (e) { } }
      return true;
    },
    play: function (key) {
      var d = drv(Audio._nes), s = SONGS[key];
      if (!d || !s) return false;
      Audio._paused = null;
      try { d.play(s, { loop: s.playLoop }); Audio.current = key; return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(Audio._nes); if (d) { try { d.stop(); if (d.stopSfx) d.stopSfx(); } catch (e) { } } Audio.current = null; Audio._paused = null; },
    sfx: function (name) {
      var d = drv(Audio._nes);
      if (!d || !SFX[name]) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },
    // §6-2 暫停：engine pause()（記住 row / rowFrame）⇒ 譜面時間（= driver row）也一起凍結
    pause: function () {
      var d = drv(Audio._nes);
      if (!d || Audio._paused || !d.pause) return false;
      var st = d.state();
      if (!st.playing) return false;
      d.pause(); if (d.stopSfx) d.stopSfx();
      Audio._paused = { key: Audio.current };
      return true;
    },
    resume: function () {
      var d = drv(Audio._nes), p = Audio._paused;
      Audio._paused = null;
      if (!d || !p || !d.resume) return false;
      var r = d.resume(); Audio.current = p.key;
      return r;
    },
    isPaused: function () { var d = drv(Audio._nes); return !!(d && d.isPaused && d.isPaused()); },
    state: function () { var d = drv(Audio._nes); return d ? d.state() : null; },
    tick: function () { var d = drv(Audio._nes); if (d) { try { d.tick(); } catch (e) { } } }
  };
  RH.Audio = Audio;
  RH.TRACKS = TRACKS;
  RH.COUNT_IN = COUNT_IN;
  RH.LANE_NOTE = LANE_NOTE;
  RH.CUE_DEF = CUE_DEF;
})();
