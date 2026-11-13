/*
 * games/cart3/gomoku/ai.js — 《星塵五子棋》思考引擎（五子棋 15×15 + 井字 3×3 / 4×4；純函式，無 DOM / PPU）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 全域只掛 CT.Gomoku.AI（node 也可 require 跑對戰實驗）
 *
 * 五子棋評估：「五格窗」法——棋盤上每一個連續 5 格（4 方向，共 572 個窗）只要裡面只有一方的子，
 *   就依子數給分 V[k]；局面分 = 黑方總分 − 白方總分。落子 / 收子時只更新經過該點的 ≤ 20 個窗（增量，O(20)）。
 * 威脅：窗內 4 子 + 1 空 = 「四」（下一手成五）。搜尋時：能成五就直接下；對方有四就只考慮擋點。
 * 候選手：離現有棋子 ≤ 2 格的空點，依「進攻得分 + 防守得分」排序取前 K 手。
 * 三級 CPU（level 0..2）：
 *   EASY   = 不搜尋，候選前 5 手隨機挑（防守權重打折，偶爾漏擋三）
 *   NORMAL = 2 層 α-β（自己一手 + 對手一手），K = 10，必勝 / 必擋，根節點分數加 0..59 隨機（棋路有變化）
 *   HARD   = 6 層 α-β，根 K = 14、內層 K = 8，必勝 / 必擋（最壞約 90 ms ⇒ 分 ~18 幀）
 *   GUIDE  = 4 層（提示 / 機器人用，不是 CPU 等級）
 * **分幀思考**：搜尋寫成 generator，每 8 個節點 yield 一次；main.js 每幀只跑到時間預算（預設 5 ms）就停，
 *   下一幀接著跑 ⇒ 畫面永不卡住。結果只跟搜尋本身有關（同 seed 同盤面 ⇒ 同一手），與分幾幀跑完無關。
 *
 * 井字（N = 3 / 4，連 N 子勝）：3×3 = 完整 negamax（必不敗）；4×4 = α-β 深度 6 + 線評估（同樣分幀）。
 */
(function (root) {
  'use strict';
  var CT = root.CT = root.CT || {};
  var GO = CT.Gomoku = CT.Gomoku || {};

  function Rng(seed) {
    var s = (seed >>> 0) || 0x2545F491;
    return {
      next: function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; },
      int: function (n) { return this.next() % n; }
    };
  }

  /* ============================== 五子棋 ============================== */
  var N = 15, NN = N * N;
  var V = [0, 2, 24, 300, 4000, 2000000];
  var WIN_SCORE = 1000000;
  var WIN_CELLS = [], CELL_WINS = [];
  (function () {
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]], x, y, d, k, c;
    for (c = 0; c < NN; c++) CELL_WINS.push([]);
    for (d = 0; d < 4; d++) for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var ex = x + dirs[d][0] * 4, ey = y + dirs[d][1] * 4;
      if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
      var cells = [];
      for (k = 0; k < 5; k++) cells.push((y + dirs[d][1] * k) * N + x + dirs[d][0] * k);
      var id = WIN_CELLS.length;
      WIN_CELLS.push(cells);
      for (k = 0; k < 5; k++) CELL_WINS[cells[k]].push(id);
    }
  })();
  var NW = WIN_CELLS.length;

  function State(board) {
    var s = { b: new Int8Array(NN), cnt: [null, new Int8Array(NW), new Int8Array(NW)], sum: [0, 0, 0], moves: 0, won: 0 };
    if (board) for (var i = 0; i < NN; i++) if (board[i]) make(s, i, board[i]);
    return s;
  }
  function winVal(s, w, color) {
    var o = 3 - color;
    return s.cnt[o][w] ? 0 : V[s.cnt[color][w]];
  }
  function make(s, c, color) {
    var ws = CELL_WINS[c], o = 3 - color, i;
    for (i = 0; i < ws.length; i++) {
      var w = ws[i], mine = s.cnt[color][w], his = s.cnt[o][w];
      if (!his) s.sum[color] += V[mine + 1] - V[mine];
      else if (!mine) s.sum[o] -= V[his];            // 我方第一子進窗 ⇒ 對方這窗作廢
      s.cnt[color][w] = mine + 1;
      if (mine + 1 === 5 && !his) s.won = color;
    }
    s.b[c] = color; s.moves++;
  }
  function unmake(s, c, color) {
    var ws = CELL_WINS[c], o = 3 - color, i;
    for (i = 0; i < ws.length; i++) {
      var w = ws[i], mine = s.cnt[color][w] - 1, his = s.cnt[o][w];
      s.cnt[color][w] = mine;
      if (!his) s.sum[color] -= V[mine + 1] - V[mine];
      else if (!mine) s.sum[o] += V[his];
    }
    s.b[c] = 0; s.moves--; s.won = 0;
  }
  // 一點對 color 的價值：進攻（自己窗子數 +1）+ 防守（毀掉對方的窗）
  function gain(s, c, color, defW) {
    var ws = CELL_WINS[c], o = 3 - color, att = 0, def = 0, i;
    for (i = 0; i < ws.length; i++) {
      var w = ws[i], mine = s.cnt[color][w], his = s.cnt[o][w];
      if (!his) att += V[mine + 1] - V[mine];
      if (!mine && his) def += V[his + 1] - V[his];
    }
    return att + def * defW;
  }
  // 能直接成五的點（color 下）/ 對方的成五點（color 要擋）
  function fivePoints(s, color) {
    var out = [], seen = {}, w, k, o = 3 - color;
    for (w = 0; w < NW; w++) {
      if (s.cnt[color][w] !== 4 || s.cnt[o][w]) continue;
      var cs = WIN_CELLS[w];
      for (k = 0; k < 5; k++) if (!s.b[cs[k]] && !seen[cs[k]]) { seen[cs[k]] = 1; out.push(cs[k]); }
    }
    return out;
  }
  function candidates(s, color, K, defW) {
    var near = new Uint8Array(NN), i, x, y, dx, dy, list = [];
    if (!s.moves) return [7 * N + 7];
    for (i = 0; i < NN; i++) {
      if (!s.b[i]) continue;
      x = i % N; y = (i / N) | 0;
      for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        if (Math.abs(dx) === 2 && Math.abs(dy) === 1 || Math.abs(dx) === 1 && Math.abs(dy) === 2) continue;
        near[ny * N + nx] = 1;
      }
    }
    for (i = 0; i < NN; i++) if (near[i] && !s.b[i]) list.push({ c: i, v: gain(s, i, color, defW) });
    list.sort(function (a, b) { return b.v - a.v || a.c - b.c; });
    if (list.length > K) list.length = K;
    return list.map(function (e) { return e.c; });
  }
  function evalFor(s, color) { return s.sum[color] * 1.2 - s.sum[3 - color]; }

  var LEVELS = [
    { name: 'EASY', depth: 0, rootK: 5, K: 5, defW: 0.55, noise: 5 },
    { name: 'NORMAL', depth: 2, rootK: 10, K: 8, defW: 0.9, noise: 60 },
    { name: 'HARD', depth: 6, rootK: 14, K: 8, defW: 1.0, noise: 0 },
    { name: 'GUIDE', depth: 4, rootK: 14, K: 9, defW: 1.0, noise: 0 }     // 提示 / 機器人用（不是 CPU 等級）
  ];

  // negamax α-β（generator：每 8 節點 yield 一次；內層節點要排序候選手，比較貴）
  function* negamax(s, depth, alpha, beta, color, job) {
    if ((++job.nodes & 7) === 0) yield 0;
    if (s.won) return s.won === color ? WIN_SCORE + depth : -WIN_SCORE - depth;
    if (s.moves >= NN) return 0;
    if (depth === 0) return evalFor(s, color);
    var mine = fivePoints(s, color);
    if (mine.length) return WIN_SCORE + depth;
    var his = fivePoints(s, 3 - color);
    var moves = his.length ? his : candidates(s, color, job.lv.K, job.lv.defW);
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      make(s, moves[i], color);
      var v = -(yield* negamax(s, depth - 1, -beta, -alpha, 3 - color, job));
      unmake(s, moves[i], color);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function* rootSearch(job) {
    var s = job.s, color = job.color, lv = job.lv, rng = job.rng;
    var mine = fivePoints(s, color);
    if (mine.length) { job.move = mine[0]; job.why = 'win'; return; }
    var his = fivePoints(s, 3 - color);
    if (lv.depth === 0) {
      if (his.length && rng.int(100) < 85) { job.move = his[0]; job.why = 'block'; return; }
      var cs = candidates(s, color, lv.rootK, lv.defW);
      job.move = cs[rng.int(Math.min(cs.length, lv.noise))]; job.why = 'easy';
      return;
    }
    var moves = his.length ? his : candidates(s, color, lv.rootK, lv.defW);
    if (moves.length === 1) { job.move = moves[0]; job.why = his.length ? 'block' : 'only'; return; }
    var best = -Infinity, bestMove = moves[0], alpha = -Infinity, beta = Infinity;
    for (var i = 0; i < moves.length; i++) {
      make(s, moves[i], color);
      var v = -(yield* negamax(s, lv.depth - 1, -beta, -alpha, 3 - color, job));
      unmake(s, moves[i], color);
      if (lv.noise && Math.abs(v) < WIN_SCORE / 2) v += rng.int(lv.noise);   // NORMAL：同級手之間隨機（棋路有變化）
      job.scores.push([moves[i], v]);
      if (v > best) { best = v; bestMove = moves[i]; }
      if (v > alpha) alpha = v;
    }
    job.move = bestMove; job.best = best; job.why = his.length ? 'block' : 'search';
  }

  // 啟動一次思考：board = Int8Array(225)（0 空 / 1 太陽（先手）/ 2 月亮），回傳 job；job.run(ms) 每幀呼叫
  function think(board, color, level, seed) {
    var job = {
      s: State(board), color: color, lv: LEVELS[level] || LEVELS[1], rng: Rng(seed), nodes: 0, frames: 0,
      move: -1, done: false, why: '', scores: [], best: 0, maxMs: 0, totalMs: 0
    };
    var it = rootSearch(job);
    job.run = function (ms, nowFn) {
      if (job.done) return true;
      var t0 = nowFn(), r;
      job.frames++;
      do { r = it.next(); } while (!r.done && nowFn() - t0 < ms);
      var dt = nowFn() - t0;
      job.maxMs = Math.max(job.maxMs, dt); job.totalMs += dt;
      if (r.done) job.done = true;
      return job.done;
    };
    job.finish = function () { var r; do { r = it.next(); } while (!r.done); job.done = true; return job.move; };
    return job;
  }
  // 五子勝負判定（≥ 5 連即勝；回傳連線的格子陣列或 null）
  function fiveAt(board, c) {
    var color = board[c];
    if (!color) return null;
    var x0 = c % N, y0 = (c / N) | 0, dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var line = [c], k, x, y;
      for (k = 1; ; k++) { x = x0 + dirs[d][0] * k; y = y0 + dirs[d][1] * k; if (x < 0 || y < 0 || x >= N || y >= N || board[y * N + x] !== color) break; line.push(y * N + x); }
      for (k = 1; ; k++) { x = x0 - dirs[d][0] * k; y = y0 - dirs[d][1] * k; if (x < 0 || y < 0 || x >= N || y >= N || board[y * N + x] !== color) break; line.push(y * N + x); }
      if (line.length >= 5) return line;
    }
    return null;
  }

  /* ============================== 井字（N×N，連 N 子） ============================== */
  var TLINES = {};
  function tttLines(n) {
    if (TLINES[n]) return TLINES[n];
    var L = [], i, j;
    for (i = 0; i < n; i++) { var r = [], c = []; for (j = 0; j < n; j++) { r.push(i * n + j); c.push(j * n + i); } L.push(r, c); }
    var d1 = [], d2 = [];
    for (i = 0; i < n; i++) { d1.push(i * n + i); d2.push(i * n + n - 1 - i); }
    L.push(d1, d2);
    TLINES[n] = L;
    return L;
  }
  function tttWinner(b, n) {
    var L = tttLines(n), i, j;
    for (i = 0; i < L.length; i++) {
      var v = b[L[i][0]];
      if (!v) continue;
      for (j = 1; j < n; j++) if (b[L[i][j]] !== v) break;
      if (j === n) return { color: v, line: L[i] };
    }
    for (i = 0; i < n * n; i++) if (!b[i]) return null;
    return { color: 0, line: null };
  }
  function tttEval(b, n, color) {
    var L = tttLines(n), s = 0, i, j;
    for (i = 0; i < L.length; i++) {
      var m = 0, o = 0;
      for (j = 0; j < n; j++) { var v = b[L[i][j]]; if (v === color) m++; else if (v) o++; }
      if (m && !o) s += m * m; else if (o && !m) s -= o * o;
    }
    return s;
  }
  function* tttNega(b, n, depth, alpha, beta, color, job) {
    if ((++job.nodes & 63) === 0) yield 0;
    var w = tttWinner(b, n);
    if (w) return w.color === 0 ? 0 : (w.color === color ? 1000 + depth : -1000 - depth);
    if (depth === 0) return tttEval(b, n, color);
    var key = job.memo ? (b.join('') + color + depth) : null;
    if (key && job.memo[key] !== undefined) return job.memo[key];
    var best = -Infinity, a0 = alpha;
    for (var i = 0; i < n * n; i++) {
      if (b[i]) continue;
      b[i] = color;
      var v = -(yield* tttNega(b, n, depth - 1, -beta, -alpha, 3 - color, job));
      b[i] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (key && best > a0 && best < beta) job.memo[key] = best;
    return best;
  }
  function* tttRoot(job) {
    var b = job.b, n = job.n, color = job.color, rng = job.rng, i, empties = [];
    for (i = 0; i < n * n; i++) if (!b[i]) empties.push(i);
    function findLine(c) {   // 能連成 n 的點
      var L = tttLines(n);
      for (var k = 0; k < L.length; k++) {
        var cnt = 0, hole = -1;
        for (var j = 0; j < n; j++) { var v = b[L[k][j]]; if (v === c) cnt++; else if (!v) hole = L[k][j]; }
        if (cnt === n - 1 && hole >= 0) return hole;
      }
      return -1;
    }
    var win = findLine(color), block = findLine(3 - color);
    if (job.level === 0) {
      if (win >= 0 && rng.int(100) < 60) { job.move = win; return; }
      if (block >= 0 && rng.int(100) < 50) { job.move = block; return; }
      job.move = empties[rng.int(empties.length)]; return;
    }
    if (win >= 0) { job.move = win; return; }
    if (block >= 0) { job.move = block; return; }
    if (job.level === 1) {
      if (rng.int(100) < 30) { job.move = empties[rng.int(empties.length)]; return; }
      var bestE = -Infinity;
      for (i = 0; i < empties.length; i++) {
        b[empties[i]] = color; var e = tttEval(b, n, color) + rng.int(3); b[empties[i]] = 0;
        if (e > bestE) { bestE = e; job.move = empties[i]; }
      }
      return;
    }
    var depth = n === 3 ? 9 : 6, best = -Infinity, alpha = -Infinity;
    job.memo = {};
    // 中心 / 角優先（同分時取先找到的）
    empties.sort(function (a, c) { return centerRank(a, n) - centerRank(c, n); });
    for (i = 0; i < empties.length; i++) {
      b[empties[i]] = color;
      var v = -(yield* tttNega(b, n, depth - 1, -Infinity, -alpha, 3 - color, job));
      b[empties[i]] = 0;
      if (v > best) { best = v; job.move = empties[i]; }
      if (v > alpha) alpha = v;
    }
  }
  function centerRank(i, n) { var x = i % n, y = (i / n) | 0, c = (n - 1) / 2; return Math.abs(x - c) + Math.abs(y - c); }
  function thinkTTT(board, n, color, level, seed) {
    var job = { b: Array.prototype.slice.call(board), n: n, color: color, level: level, rng: Rng(seed), nodes: 0, frames: 0, move: -1, done: false, maxMs: 0, totalMs: 0 };
    var it = tttRoot(job);
    job.run = function (ms, nowFn) {
      if (job.done) return true;
      var t0 = nowFn(), r;
      job.frames++;
      do { r = it.next(); } while (!r.done && nowFn() - t0 < ms);
      var dt = nowFn() - t0;
      job.maxMs = Math.max(job.maxMs, dt); job.totalMs += dt;
      if (r.done) job.done = true;
      return job.done;
    };
    job.finish = function () { var r; do { r = it.next(); } while (!r.done); job.done = true; return job.move; };
    return job;
  }

  GO.AI = {
    N: N, LEVELS: LEVELS, Rng: Rng, State: State, make: make, unmake: unmake, candidates: candidates, fivePoints: fivePoints,
    think: think, fiveAt: fiveAt, WIN_COUNT: NW,
    tttLines: tttLines, tttWinner: tttWinner, thinkTTT: thinkTTT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GO.AI;
})(typeof window !== 'undefined' ? window : globalThis);
