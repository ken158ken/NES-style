/*
 * games/cart3/sudoku/gen.js — 《星塵數獨》題目產生器 + 驗證器 + 邏輯解題器（純邏輯，無 DOM；CT.Sudoku.Gen）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）
 *
 * 盤面：一維陣列（size × size），0 = 空、1..size = 數字。size 9（宮 3×3）或 6（宮寬 3 × 高 2，入門）。
 * 1. fullGrid(size, rnd)：亂數回溯填滿一張合法終盤。
 * 2. countSolutions(grid, size, limit)：位元遮罩 + MRV 回溯數解（數到 limit 就停）⇒ 唯一解驗證器。
 * 3. logic(grid, size, maxTier, opt)：**不猜題**的邏輯解題器，只用這三層技巧：
 *      T1 = 唯一候選（naked single）+ 隱藏唯一（hidden single）
 *      T2 = 區塊排除（pointing / claiming，locked candidates）
 *      T3 = 數對 / 三數組（naked pair / triple）+ 隱藏數對（hidden pair）
 *    回 {solved, tier（實際用到的最高層）, grid, placed, steps}；opt.first = true ⇒ 找到第一個填入就回 {idx, val, tech}。
 *    推理全部是「必然成立」的 ⇒ 能用它解完的盤面一定唯一解（另由 countSolutions 獨立再驗一次）。
 * 4. make(level, seed)：挖空產生器（對稱成對挖）。每挖一對都要「仍唯一解 且 maxTier 內的邏輯解得完」，
 *    否則放回 ⇒ **保證唯一解、保證無需猜題**；難度 = 用到的最高技巧層 + 提示數下限：
 *      intro  6×6  T1  ≥ 14 提示     easy   9×9  T1  ≥ 36 提示     normal 9×9  T1  ≥ 27 提示
 *      hard   9×9  需要 T2（≥ 22）     expert 9×9  需要 T3（≥ 20）
 *    同一 (level, seed) 永遠產生同一題（mulberry32）。
 */
(function (root) {
  'use strict';
  var CT = root.CT = root.CT || {};
  var SU = CT.Sudoku = CT.Sudoku || {};

  var LEVELS = {
    intro: { size: 6, maxTier: 1, minClues: 14, need: 1, label: 'INTRO 6X6' },
    easy: { size: 9, maxTier: 1, minClues: 36, need: 1, label: 'EASY' },
    normal: { size: 9, maxTier: 1, minClues: 27, need: 1, label: 'NORMAL' },
    hard: { size: 9, maxTier: 2, minClues: 22, need: 2, label: 'HARD' },
    expert: { size: 9, maxTier: 3, minClues: 20, need: 3, label: 'EXPERT' }
  };
  var LEVEL_IDS = ['intro', 'easy', 'normal', 'hard', 'expert'];

  /* ---------------- 幾何 ---------------- */
  var GEO = {};
  function geo(size) {
    if (GEO[size]) return GEO[size];
    var bw = 3, bh = size === 9 ? 3 : 2, N = size * size, units = [], r, c, i, k;
    for (r = 0; r < size; r++) { var u = []; for (c = 0; c < size; c++) u.push(r * size + c); units.push(u); }
    for (c = 0; c < size; c++) { var v = []; for (r = 0; r < size; r++) v.push(r * size + c); units.push(v); }
    for (var by = 0; by < size / bh; by++) for (var bx = 0; bx < size / bw; bx++) {
      var b = [];
      for (r = 0; r < bh; r++) for (c = 0; c < bw; c++) b.push((by * bh + r) * size + bx * bw + c);
      units.push(b);
    }
    var row = [], col = [], box = [], peers = [], unitsOf = [];
    for (i = 0; i < N; i++) {
      row.push((i / size) | 0); col.push(i % size);
      box.push(((((i / size) | 0) / bh) | 0) * (size / bw) + (((i % size) / bw) | 0));
    }
    for (i = 0; i < N; i++) {
      var p = {};
      unitsOf.push([row[i], size + col[i], 2 * size + box[i]]);
      for (k = 0; k < 3; k++) units[unitsOf[i][k]].forEach(function (j) { if (j !== i) p[j] = 1; });
      peers.push(Object.keys(p).map(Number));
    }
    var full = (1 << size) - 1;
    return (GEO[size] = { size: size, bw: bw, bh: bh, N: N, units: units, row: row, col: col, box: box, peers: peers, unitsOf: unitsOf, full: full });
  }
  function bitCount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }
  function lowBit(m) { for (var d = 0; d < 16; d++) if (m & (1 << d)) return d; return -1; }

  /* ---------------- 亂數 ---------------- */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = (rnd() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- 回溯（填滿 / 數解） ---------------- */
  function masks(grid, G) {
    var R = new Array(G.size).fill(0), C = new Array(G.size).fill(0), B = new Array(G.size).fill(0), ok = true;
    for (var i = 0; i < G.N; i++) {
      var v = grid[i];
      if (!v) continue;
      var bit = 1 << (v - 1);
      if ((R[G.row[i]] | C[G.col[i]] | B[G.box[i]]) & bit) ok = false;
      R[G.row[i]] |= bit; C[G.col[i]] |= bit; B[G.box[i]] |= bit;
    }
    return { R: R, C: C, B: B, ok: ok };
  }
  function search(grid, G, limit, rnd) {
    var g = grid.slice(), M = masks(g, G), count = 0, sol = null;
    if (!M.ok) return { count: 0, sol: null };
    function rec() {
      var best = -1, bestM = 0, bestN = 99, i;
      for (i = 0; i < G.N; i++) {
        if (g[i]) continue;
        var m = G.full & ~(M.R[G.row[i]] | M.C[G.col[i]] | M.B[G.box[i]]), n = bitCount(m);
        if (n < bestN) { bestN = n; best = i; bestM = m; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!sol) sol = g.slice(); return count >= limit; }
      if (!bestM) return false;
      var ds = [];
      for (var d = 0; d < G.size; d++) if (bestM & (1 << d)) ds.push(d);
      if (rnd) shuffle(ds, rnd);
      for (var k = 0; k < ds.length; k++) {
        var bit = 1 << ds[k], r = G.row[best], c = G.col[best], b = G.box[best];
        g[best] = ds[k] + 1; M.R[r] |= bit; M.C[c] |= bit; M.B[b] |= bit;
        if (rec()) return true;
        g[best] = 0; M.R[r] &= ~bit; M.C[c] &= ~bit; M.B[b] &= ~bit;
      }
      return false;
    }
    rec();
    return { count: count, sol: sol };
  }
  function fullGrid(size, rnd) { return search(new Array(geo(size).N).fill(0), geo(size), 1, rnd).sol; }
  function countSolutions(grid, size, limit) { return search(grid, geo(size), limit || 2, null).count; }
  function solve(grid, size) { return search(grid, geo(size), 1, null).sol; }

  /* ---------------- 邏輯解題器 ---------------- */
  function logic(grid, size, maxTier, opt) {
    opt = opt || {};
    var G = geo(size), g = grid.slice(), cand = new Array(G.N), i, tier = 0, steps = 0, placed = 0;
    for (i = 0; i < G.N; i++) {
      if (g[i]) { cand[i] = 0; continue; }
      var m = G.full;
      for (var k = 0; k < G.peers[i].length; k++) { var v = g[G.peers[i][k]]; if (v) m &= ~(1 << (v - 1)); }
      cand[i] = m;
    }
    function place(idx, d) {
      g[idx] = d + 1; cand[idx] = 0; placed++;
      var ps = G.peers[idx];
      for (var k = 0; k < ps.length; k++) cand[ps[k]] &= ~(1 << d);
    }
    var bad = false;
    function singles() {   // T1：回傳 {idx, d, tech} 或 null
      for (var i = 0; i < G.N; i++) {
        if (g[i]) continue;
        if (!cand[i]) { bad = true; return null; }
        if (bitCount(cand[i]) === 1) return { idx: i, d: lowBit(cand[i]), tech: 'NAKED' };
      }
      for (var u = 0; u < G.units.length; u++) {
        var U = G.units[u];
        for (var d = 0; d < size; d++) {
          var bit = 1 << d, at = -1, n = 0, done = false;
          for (var k = 0; k < U.length; k++) {
            if (g[U[k]] === d + 1) { done = true; break; }
            if (cand[U[k]] & bit) { n++; at = U[k]; }
          }
          if (done) continue;
          if (n === 0) { bad = true; return null; }
          if (n === 1) return { idx: at, d: d, tech: 'HIDDEN' };
        }
      }
      return null;
    }
    function locked() {    // T2：pointing + claiming；有刪就回 true
      var changed = false, u, d, k;
      for (u = 0; u < G.units.length; u++) {
        var U = G.units[u], isBox = u >= 2 * size;
        for (d = 0; d < size; d++) {
          var bit = 1 << d, cells = [];
          for (k = 0; k < U.length; k++) if (cand[U[k]] & bit) cells.push(U[k]);
          if (cells.length < 2) continue;
          var targets = [];
          if (isBox) {
            var r0 = G.row[cells[0]], c0 = G.col[cells[0]], sameR = true, sameC = true;
            for (k = 1; k < cells.length; k++) { if (G.row[cells[k]] !== r0) sameR = false; if (G.col[cells[k]] !== c0) sameC = false; }
            if (sameR) targets.push(G.units[r0]);
            if (sameC) targets.push(G.units[size + c0]);
          } else {
            var b0 = G.box[cells[0]], sameB = true;
            for (k = 1; k < cells.length; k++) if (G.box[cells[k]] !== b0) sameB = false;
            if (sameB) targets.push(G.units[2 * size + b0]);
          }
          for (var t = 0; t < targets.length; t++) {
            var T = targets[t];
            for (k = 0; k < T.length; k++) if (cells.indexOf(T[k]) < 0 && (cand[T[k]] & bit)) { cand[T[k]] &= ~bit; changed = true; }
          }
        }
      }
      return changed;
    }
    function subsets() {   // T3：naked pair / triple + hidden pair
      var changed = false, u, k, j, l;
      for (u = 0; u < G.units.length; u++) {
        var U = G.units[u], open = [];
        for (k = 0; k < U.length; k++) if (!g[U[k]]) open.push(U[k]);
        // naked pair / triple
        for (var sz = 2; sz <= 3; sz++) {
          var combo = function (start, picked, mask) {
            if (picked.length === sz) {
              if (bitCount(mask) !== sz) return;
              for (var q = 0; q < open.length; q++) {
                if (picked.indexOf(open[q]) >= 0) continue;
                if (cand[open[q]] & mask) { cand[open[q]] &= ~mask; changed = true; }
              }
              return;
            }
            for (var s = start; s < open.length; s++) {
              var m2 = mask | cand[open[s]];
              if (bitCount(m2) > sz || bitCount(cand[open[s]]) < 2) continue;
              combo(s + 1, picked.concat([open[s]]), m2);
            }
          };
          combo(0, [], 0);
        }
        // hidden pair
        var where = [];
        for (var d = 0; d < size; d++) { var w = []; for (k = 0; k < open.length; k++) if (cand[open[k]] & (1 << d)) w.push(open[k]); where.push(w); }
        for (j = 0; j < size; j++) for (l = j + 1; l < size; l++) {
          var a = where[j], b = where[l];
          if (a.length !== 2 || b.length !== 2 || a[0] !== b[0] || a[1] !== b[1]) continue;
          var keep = (1 << j) | (1 << l);
          for (k = 0; k < 2; k++) if (cand[a[k]] & ~keep) { cand[a[k]] &= keep; changed = true; }
        }
      }
      return changed;
    }
    for (;;) {
      steps++;
      var s = singles();
      if (bad) return { solved: false, broken: true, tier: tier, grid: g, placed: placed, steps: steps };
      if (s) {
        if (tier < 1) tier = 1;
        if (opt.first) return { idx: s.idx, val: s.d + 1, tech: s.tech, tier: tier };
        place(s.idx, s.d);
        continue;
      }
      var empty = 0;
      for (i = 0; i < G.N; i++) if (!g[i]) empty++;
      if (!empty) break;
      if (maxTier >= 2 && locked()) { if (tier < 2) tier = 2; continue; }
      if (maxTier >= 3 && subsets()) { if (tier < 3) tier = 3; continue; }
      break;
    }
    var solved = true;
    for (i = 0; i < G.N; i++) if (!g[i]) { solved = false; break; }
    if (opt.first) return null;
    return { solved: solved, tier: tier, grid: g, placed: placed, steps: steps };
  }

  /* ---------------- 產生器 ---------------- */
  function clues(p) { var n = 0; for (var i = 0; i < p.length; i++) if (p[i]) n++; return n; }
  function make(level, seed) {
    var L = LEVELS[level] || LEVELS.easy, size = L.size, G = geo(size), rnd = mulberry((seed >>> 0) ^ 0x5EED1234), best = null, tries = 0;
    for (tries = 1; tries <= 200; tries++) {
      var sol = fullGrid(size, rnd), p = sol.slice(), order = [], i;
      for (i = 0; i < G.N; i++) if (i <= G.N - 1 - i) order.push(i);
      shuffle(order, rnd);
      for (var k = 0; k < order.length; k++) {
        var a = order[k], b = G.N - 1 - a, n = clues(p) - (a === b ? 1 : 2);
        if (n < L.minClues) continue;
        var va = p[a], vb = p[b];
        p[a] = 0; p[b] = 0;
        if (countSolutions(p, size, 2) !== 1 || !logic(p, size, L.maxTier).solved) { p[a] = va; p[b] = vb; }
      }
      var grade = logic(p, size, 3).tier;
      var cand = { level: level, size: size, seed: seed >>> 0, givens: p, solution: sol, tier: grade, clues: clues(p), tries: tries };
      if (!best || grade > best.tier) best = cand;
      if (grade >= L.need) return cand;
    }
    return best;
  }

  SU.LEVELS = LEVELS;
  SU.LEVEL_IDS = LEVEL_IDS;
  SU.Gen = {
    geo: geo, mulberry: mulberry, fullGrid: fullGrid, countSolutions: countSolutions, solve: solve,
    logic: logic, make: make, clues: clues,
    // 下一步（機器人 / 提示共用）：從目前盤面用 T1→T3 推出第一個必然的填入
    next: function (grid, size) {
      var r = logic(grid, size, 3, { first: true });
      if (r) return r;
      // T1 卡住時：先用 T2 / T3 刪候選，再找唯一（logic 內部會一路推；這裡退一步回第一個新填入的格）
      var full = logic(grid, size, 3);
      for (var i = 0; i < grid.length; i++) if (!grid[i] && full.grid[i]) return { idx: i, val: full.grid[i], tech: 'LOGIC', tier: full.tier };
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
