/*
 * games/cart5/words/gen.js — 《星塵字謎》題目產生 / 判定（純邏輯，`CT.Words.Gen`）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：typing/dict.js（CT.Typing.DICT）
 *
 *   rng(seed)             可重現的亂數（LCG）
 *   probe(answer, guess)  探測回饋：每個位置 2 = 對位（★）/ 1 = 在字裡別的位置（◎）/ 0 = 不在（·）；重複字母依答案剩餘數量判定
 *   hunt(level, seed)     找字盤 10×10：EASY 6 字（→ ↓）/ NORMAL 8 字（+ ↘ ↗）/ HARD 10 字（8 方向含倒寫）；
 *                         填字後驗證「每個題目字在盤面上恰好出現一次（8 方向都算）」，否則換種子重來
 *   count(grid, word)     盤面上某字出現幾次（8 方向）
 *   scramble(word, rng)   打亂字母，保證與原字不同、也不是字表裡的其他字
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var WD = CT.Words = CT.Words || {};
  var N = 10;
  var DIRS8 = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
  var HUNT = [
    { name: 'EASY', words: 6, dirs: [[1, 0], [0, 1]] },
    { name: 'NORMAL', words: 8, dirs: [[1, 0], [0, 1], [1, 1], [1, -1]] },
    { name: 'HARD', words: 10, dirs: DIRS8 }
  ];
  // 填空字母（英文字母大致頻率，讓盤面看起來像真的字盤）
  var FILL = 'EEEEEEAAAAARRRRIIIIOOOOTTTTNNNNSSSSLLLCCCUUUDDDPPMMHHGGBBFYWKVXZJQ';

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF; return s / 0x80000000; };
  }
  function probe(answer, guess) {
    answer = answer.toLowerCase(); guess = guess.toLowerCase();
    var res = [0, 0, 0, 0, 0], left = {}, i;
    for (i = 0; i < 5; i++) {
      if (guess.charAt(i) === answer.charAt(i)) res[i] = 2;
      else left[answer.charAt(i)] = (left[answer.charAt(i)] || 0) + 1;
    }
    for (i = 0; i < 5; i++) {
      if (res[i] === 2) continue;
      var c = guess.charAt(i);
      if (left[c] > 0) { res[i] = 1; left[c]--; }
    }
    return res;
  }
  function count(grid, word) {
    word = word.toUpperCase();
    var n = 0, x, y, d, k;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) for (d = 0; d < 8; d++) {
      var dx = DIRS8[d][0], dy = DIRS8[d][1], ok = true;
      for (k = 0; k < word.length; k++) {
        var X = x + dx * k, Y = y + dy * k;
        if (X < 0 || Y < 0 || X >= N || Y >= N || grid[Y * N + X] !== word.charAt(k)) { ok = false; break; }
      }
      if (ok) n++;
    }
    return n;
  }
  function tryHunt(level, R) {
    var L = HUNT[level], D = CT.Typing.DICT, themes = D.THEMES;
    var theme = themes[Math.floor(R() * themes.length)];
    var pool = theme.words.filter(function (w) { return w.length >= 3 && w.length <= 8; }), pick = [];
    while (pick.length < L.words && pool.length) pick.push(pool.splice(Math.floor(R() * pool.length), 1)[0].toUpperCase());
    if (pick.length < L.words) return null;
    pick.sort(function (a, b) { return b.length - a.length; });
    var grid = new Array(N * N).fill(''), place = [], i, t;
    for (i = 0; i < pick.length; i++) {
      var w = pick[i], done = false;
      for (t = 0; t < 200 && !done; t++) {
        var dir = L.dirs[Math.floor(R() * L.dirs.length)], dx = dir[0], dy = dir[1];
        var x0 = Math.floor(R() * N), y0 = Math.floor(R() * N), x1 = x0 + dx * (w.length - 1), y1 = y0 + dy * (w.length - 1);
        if (x1 < 0 || x1 >= N || y1 < 0 || y1 >= N) continue;
        var ok = true, k;
        for (k = 0; k < w.length; k++) { var c = grid[(y0 + dy * k) * N + x0 + dx * k]; if (c && c !== w.charAt(k)) { ok = false; break; } }
        if (!ok) continue;
        for (k = 0; k < w.length; k++) grid[(y0 + dy * k) * N + x0 + dx * k] = w.charAt(k);
        place.push({ w: w, x: x0, y: y0, dx: dx, dy: dy });
        done = true;
      }
      if (!done) return null;
    }
    for (i = 0; i < N * N; i++) if (!grid[i]) grid[i] = FILL.charAt(Math.floor(R() * FILL.length));
    for (i = 0; i < pick.length; i++) if (count(grid, pick[i]) !== 1) return null;
    var order = place.slice().sort(function (a, b) { return a.w < b.w ? -1 : 1; });
    return { level: level, theme: theme.name, grid: grid, words: order.map(function (p) { return p.w; }), place: order };
  }
  function hunt(level, seed) {
    var R = rng(seed);
    for (var a = 0; a < 400; a++) { var h = tryHunt(level, R); if (h) { h.seed = seed; h.tries = a + 1; return h; } }
    throw new Error('hunt: 產生失敗');
  }
  function scramble(word, R) {
    var D = CT.Typing.DICT, all = {}, w = word.toLowerCase(), i, t;
    D.ALL.forEach(function (x) { all[x] = 1; });
    for (t = 0; t < 50; t++) {
      var a = w.split('');
      for (i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
      var s = a.join('');
      if (s !== w && !all[s]) return s.toUpperCase();
    }
    return w.split('').reverse().join('').toUpperCase();
  }
  WD.Gen = { rng: rng, probe: probe, hunt: hunt, count: count, scramble: scramble, HUNT: HUNT, N: N, DIRS8: DIRS8 };
})();
