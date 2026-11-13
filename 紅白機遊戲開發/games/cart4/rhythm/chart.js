/*
 * games/cart4/rhythm/chart.js — 《星塵節奏》譜面產生器 + 驗證器（純資料，不碰 PPU / APU）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-3 cart4-beat（R8）｜ 依賴：rhythm/song.js（CT.Rhythm.Audio.SONGS / TRACKS）
 *
 * 同步原則：音符的時間 = 「全曲第幾個 row」× speed（幀）。row 直接取自曲子 pattern 裡 p1 旋律的
 *   note-on 與 noi 的大鼓 / 小鼓，所以每顆音符一定對到一個聽得到的音；遊玩時的「現在幾幀」也只從
 *   driver 的 rowsPlayed / rowFrame 算（main.js songFrame），不讀任何實際時鐘。
 *
 * 模式（lane：0 ↑ / 1 ↓ / 2 ← / 3 →）：
 *   CROSS 星十字：四軌。旋律往上跳 ≥ 3 半音 → ↑、往下 ≥ 3 → ↓、其他 ← / → 交替。
 *   DUO   雙星：只用 ← / →（B / A）。往上 → A、往下 → B、同音附近交替。
 *   ORBIT 繞行：單鍵，全部 lane 0。
 *   BLADE 節拍武士：lane 2 = 左來、3 = 右來；h = 0 低 / 1 高（兩條高度各自限 3 隻同時在畫面上）。
 * 難度：grid（音符只放在幾 row 一格的位置：4 = 每拍、2 = 八分、1 = 十六分）、gap（相鄰音符最少幀數）、T（音符飛行幀數）。
 * 精靈配額（每線 ≤ 8 的保證來源）：CROSS / DUO 左右兩臂共用同一條水平帶，任何時刻同時在畫面上的 ← / → 音符 ≤ 6
 *   （每顆 8×16 = 每線 1 個，留 2 個給命中火花）；BLADE 每條高度 ≤ 3 隻（每隻 16 寬 = 2 個 + 主角 2 個）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var RH = CT.Rhythm = CT.Rhythm || {};

  var MODES = ['CROSS', 'DUO', 'ORBIT', 'BLADE'];
  // win = [PERFECT, GREAT, GOOD]（幀，|按下 − 音符| ≤ 值）。fix-r8（qa-r8 P2-1）：σ 5 幀的新手模型用真人濾鏡實測後放寬；
  //   NORMAL 3 / 6 / 10、EASY 再寬一級 4 / 8 / 12、HARD 維持原本 2 / 5 / 8（熟手挑戰）。drain = MISS 扣能量。
  var DIFFS = [
    { id: 'EASY', grid: 4, gap: 26, T: 96, bladeT: 96, drain: 3, win: [4, 8, 12] },
    { id: 'NORMAL', grid: 2, gap: 11, T: 72, bladeT: 76, drain: 4, win: [3, 6, 10] },
    { id: 'HARD', grid: 1, gap: 7, T: 56, bladeT: 60, drain: 7, win: [2, 5, 8] }
  ];
  function winOf(diff) { var w = DIFFS[diff].win; return { PERFECT: w[0], GREAT: w[1], GOOD: w[2] }; }
  function lateOf(diff) { return DIFFS[diff].win[2]; }   // GOOD 窗口 ＝ 音符過了判定點還留在畫面上的幀數
  var WIN = winOf(1);           // NORMAL（goal 難度）的窗口，給測試 / 說明用
  var LATE = lateOf(1);
  var LATE_MAX = 12;            // 所有難度中最寬的 GOOD 窗口（精靈配額計算用上限）
  var LR_MAX = 6, BLADE_ROW_MAX = 3;

  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midiOf(n) {
    if (typeof n === 'number') return n;
    if (typeof n !== 'string') return null;
    var s = n.toUpperCase(), b = SEMI[s.charAt(0)];
    if (b === undefined) return null;
    var i = 1, acc = 0;
    if (s.charAt(1) === '#') { acc = 1; i = 2; } else if (s.charAt(1) === 'B') { acc = -1; i = 2; } else if (s.charAt(1) === '-') i = 2;
    var o = parseInt(s.substring(i), 10);
    return isNaN(o) ? null : (o + 1) * 12 + b + acc;
  }

  // 曲子 → onset 表 [{row, midi|null, drum:'kick'|'snare'|null, harm: p2 和聲有 note-on}]（row = 全曲 row 索引 = rowsPlayed）
  function onsets(song) {
    var out = [], oi, r;
    for (oi = 0; oi < song.order.length; oi++) {
      var pat = song.patterns[song.order[oi]];
      for (r = 0; r < 16; r++) {
        var p = pat.p1 && pat.p1[r], d = pat.noi && pat.noi[r], q = pat.p2 && pat.p2[r], m = null, dr = null, h2 = false;
        if (p && p.note !== undefined && p.note !== '---' && p.note !== '===') m = midiOf(p.note);
        if (d && (d.inst === 'kick' || d.inst === 'snare')) dr = d.inst;
        if (q && q.note !== undefined && q.note !== '---' && q.inst !== 'click') h2 = true;
        if (m !== null || dr || h2) out.push({ row: oi * 16 + r, midi: m, drum: dr, harm: h2 });
      }
    }
    return out;
  }

  function build(trackIdx, mode, diff) {
    var tr = RH.TRACKS[trackIdx], song = RH.Audio.SONGS[tr.key], D = DIFFS[diff], sp = tr.speed;
    var T = mode === 'BLADE' ? D.bladeT : D.T, first = tr.countIn * 16, LATE = D.win[2];   // 畫面以「玩家感知時間」s − OFFSET 繪製 ⇒ 在畫面上的時間長度不受 OFFSET 影響
    var on = onsets(song), notes = [], lastT = -999, pm = null, tog = 0, side = 0, hTog = [0, 0];
    function lrCount(t) { var n = 0; for (var i = notes.length - 1; i >= 0 && notes[i].t > t - (T + LATE); i--) if (notes[i].lane >= 2) n++; return n; }
    function laneOk(lane, t, minF) { for (var i = notes.length - 1; i >= 0 && notes[i].t > t - minF; i--) if (notes[i].lane === lane) return false; return true; }
    function rowCount(h, t) { var n = 0; for (var i = notes.length - 1; i >= 0 && notes[i].t > t - (T + LATE + 12); i--) if (notes[i].h === h) n++; return n; }
    var sameLaneF = Math.ceil(10 * T / 72);
    for (var k = 0; k < on.length; k++) {
      var o = on[k];
      if (o.row < first) continue;
      if (o.row % D.grid) continue;
      if (o.midi === null && !o.drum && diff < 2) continue;     // 和聲（p2）onset 只有 HARD 採用
      var t = o.row * sp;
      if (t - lastT < D.gap) { if (o.midi !== null) pm = o.midi; continue; }
      var dir = 0;
      if (o.midi !== null && pm !== null) dir = o.midi - pm >= 3 ? 1 : (o.midi - pm <= -3 ? -1 : 0);
      if (o.midi !== null) pm = o.midi;
      var n = { t: t, row: o.row, lane: 0, h: 0, midi: o.midi, drum: o.drum };
      if (mode === 'CROSS') {
        var want = dir > 0 ? 0 : (dir < 0 ? 1 : (2 + (tog ^= 1)));
        var nl = notes.length;
        if (want < 2 && nl >= 2 && notes[nl - 1].lane === want && notes[nl - 2].lane === want) want = 2 + (tog ^= 1);   // 同一軌連 3 顆 ⇒ 改左右
        var cand = want >= 2 ? [want, want ^ 1, 0, 1] : [want, 2 + (tog ^ 1), 3 - (tog ^ 1), want ^ 1];
        var got = -1;
        for (var c = 0; c < cand.length; c++) {
          var L = cand[c];
          if (L >= 2 && lrCount(t) >= LR_MAX) continue;
          if (!laneOk(L, t, sameLaneF)) continue;
          got = L; break;
        }
        if (got < 0) continue;
        n.lane = got;
      } else if (mode === 'DUO') {
        if (lrCount(t) >= LR_MAX) continue;
        var w2 = dir > 0 ? 3 : (dir < 0 ? 2 : (2 + (tog ^= 1)));
        if (!laneOk(w2, t, sameLaneF)) w2 ^= 1;
        if (!laneOk(w2, t, sameLaneF)) continue;
        n.lane = w2;
      } else if (mode === 'ORBIT') {
        n.lane = 0;
      } else {   // BLADE
        side = dir > 0 ? 1 : (dir < 0 ? 0 : side ^ 1);
        n.lane = 2 + side;
        var h = hTog[side]; hTog[side] ^= 1;
        if (rowCount(h, t) >= BLADE_ROW_MAX) h ^= 1;
        if (rowCount(h, t) >= BLADE_ROW_MAX) continue;
        n.h = h;
      }
      notes.push(n); lastT = t;
    }
    notes.forEach(function (x, i) { x.id = i; });
    return { track: trackIdx, mode: mode, diff: diff, speed: sp, T: T, notes: notes, endRow: song.order.length * 16 };
  }

  var cache = {};
  function get(trackIdx, mode, diff) {
    var k = trackIdx + '_' + mode + '_' + diff;
    if (!cache[k]) cache[k] = build(trackIdx, mode, diff);
    return cache[k];
  }

  // 驗證：全部 onset 對得上、間距、配額。回傳 {ok, problems[], n, maxLR, maxRow}
  function validate(ch) {
    var tr = RH.TRACKS[ch.track], song = RH.Audio.SONGS[tr.key], on = onsets(song), rows = {}, probs = [], D = DIFFS[ch.diff], LATE = D.win[2];
    on.forEach(function (o) { rows[o.row] = 1; });
    var maxLR = 0, maxRow = 0;
    ch.notes.forEach(function (n, i) {
      if (!rows[n.row]) probs.push('row ' + n.row + ' 沒有對應的音');
      if (n.t !== n.row * ch.speed) probs.push('t != row*speed @' + i);
      if (n.row < tr.countIn * 16) probs.push('數拍小節有音符 @' + i);
      if (i && n.t - ch.notes[i - 1].t < D.gap) probs.push('間距 < gap @' + i);
      var lr = 0, r = 0;
      for (var j = i; j >= 0 && ch.notes[j].t > n.t - (ch.T + LATE); j--) {
        if (ch.notes[j].lane >= 2) lr++;
        if (ch.mode === 'BLADE' && ch.notes[j].h === n.h) r++;
      }
      if (ch.mode === 'CROSS' || ch.mode === 'DUO') maxLR = Math.max(maxLR, lr);
      if (ch.mode === 'BLADE') maxRow = Math.max(maxRow, r);
    });
    if (maxLR > LR_MAX) probs.push('左右臂同時 ' + maxLR + ' > ' + LR_MAX);
    if (maxRow > BLADE_ROW_MAX) probs.push('同高度同時 ' + maxRow + ' > ' + BLADE_ROW_MAX);
    return { ok: !probs.length, problems: probs.slice(0, 5), n: ch.notes.length, maxLR: maxLR, maxRow: maxRow };
  }

  RH.Chart = { MODES: MODES, DIFFS: DIFFS, WIN: WIN, LATE: LATE, LATE_MAX: LATE_MAX, winOf: winOf, lateOf: lateOf, LR_MAX: LR_MAX, BLADE_ROW_MAX: BLADE_ROW_MAX,
    onsets: onsets, build: build, get: get, validate: validate, midiOf: midiOf };
})();
