/*
 * games/cart3/slide/solver.js — 《星塵拼圖》打亂 + 可解判定 + 解題器（純函式，瀏覽器 / node 共用）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：無
 *
 * 盤面 arr[pos] = 片號（片號 = 正解位置，row-major）；滑塊模式片號 n²-1 = 空格。
 * - 滑塊可解判定：排列奇偶（把空格當一片）== 空格離右下角的曼哈頓距離奇偶（每步 = 與空格交換一次）。
 * - 滑塊解題器（分段 BFS）：第 0..n-3 列逐片放（每列最後兩片一起放）→ 最後兩列逐行兩片一起放 → 右下 2×2 三片一起放；
 *   每段 BFS 的狀態 = (空格, 本段追蹤片的位置)，已放好的格子凍結。輸出「要推的那片所在位置」序列。
 * - 旋轉（2×2 窗格順 / 逆時針轉）解題器：同樣分段 BFS（狀態 = 追蹤片位置，凍結格所在的窗格不准用），
 *   最後兩列整段 BFS（n=4：8 片 ≤ 8! 狀態；n=3：6 片 ≤ 6!）。輸出 {r, c, cw} 序列。
 * - 換位：循環分解，最少交換次數 = n² − 循環數。
 */
(function (root) {
  'use strict';
  var CT = root.CT = root.CT || {};
  var SL = CT.Slide = CT.Slide || {};

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function permParity(arr) {
    var seen = new Uint8Array(arr.length), par = 0;
    for (var i = 0; i < arr.length; i++) {
      if (seen[i]) continue;
      var len = 0, j = i;
      while (!seen[j]) { seen[j] = 1; j = arr[j]; len++; }
      par ^= (len - 1) & 1;
    }
    return par;
  }
  function solvedArr(arr) { for (var i = 0; i < arr.length; i++) if (arr[i] !== i) return false; return true; }
  function slideSolvable(arr, n) {
    var b = arr.indexOf(n * n - 1), br = (b / n) | 0, bc = b % n;
    return permParity(arr) === (((n - 1 - br) + (n - 1 - bc)) & 1);
  }
  function misplaced(arr) { var m = 0; for (var i = 0; i < arr.length; i++) if (arr[i] !== i) m++; return m; }
  function shuffled(N, R) {
    var a = []; for (var i = 0; i < N; i++) a.push(i);
    for (i = N - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function scrambleSlide(n, seed) {
    var R = rng(seed), N = n * n;
    for (;;) {
      var a = shuffled(N, R);
      if (!slideSolvable(a, n)) {
        // 交換兩片非空格 ⇒ 奇偶翻轉 ⇒ 必可解
        var p = -1, q = -1;
        for (var i = 0; i < N; i++) if (a[i] !== N - 1) { if (p < 0) p = i; else { q = i; break; } }
        var t = a[p]; a[p] = a[q]; a[q] = t;
      }
      if (misplaced(a) >= Math.ceil(N * 0.6)) return a;
    }
  }
  function scrambleSwap(n, seed) {
    var R = rng(seed), N = n * n;
    for (;;) { var a = shuffled(N, R); if (misplaced(a) >= Math.ceil(N * 0.7)) return a; }
  }
  function windowCells(n, r, c) { return [r * n + c, r * n + c + 1, (r + 1) * n + c + 1, (r + 1) * n + c]; }   // TL TR BR BL（順時針）
  function rotate(arr, n, r, c, cw) {
    var w = windowCells(n, r, c), v = w.map(function (p) { return arr[p]; });
    for (var k = 0; k < 4; k++) arr[w[(k + (cw ? 1 : 3)) % 4]] = v[k];
    return arr;
  }
  function scrambleRotate(n, seed, moves) {
    var R = rng(seed), a, N = n * n, hist;
    for (;;) {
      a = []; for (var i = 0; i < N; i++) a.push(i);
      hist = []; var last = null;
      for (var m = 0; m < moves; m++) {
        var r = Math.floor(R() * (n - 1)), c = Math.floor(R() * (n - 1)), cw = R() < 0.5;
        if (last && last.r === r && last.c === c && last.cw !== cw) { m--; continue; }
        rotate(a, n, r, c, cw); hist.push({ r: r, c: c, cw: cw }); last = { r: r, c: c, cw: cw };
      }
      if (misplaced(a) >= Math.ceil(N * 0.5)) return { arr: a, moves: hist };
    }
  }

  /* ---------------- 滑塊：分段 BFS ---------------- */
  function slidePhases(n) {
    var P = [], r, c;
    for (r = 0; r < n - 2; r++) {
      for (c = 0; c < n - 2; c++) P.push([r * n + c]);
      P.push([r * n + n - 2, r * n + n - 1]);
    }
    for (c = 0; c < n - 2; c++) P.push([(n - 2) * n + c, (n - 1) * n + c]);
    P.push([(n - 2) * n + n - 2, (n - 2) * n + n - 1, (n - 1) * n + n - 2]);
    return P;
  }
  function solveSlide(arr0, n) {
    var arr = arr0.slice(), N = n * n, BL = N - 1, fixed = new Uint8Array(N), out = [];
    if (!slideSolvable(arr, n)) return null;
    var phases = slidePhases(n);
    for (var ph = 0; ph < phases.length; ph++) {
      var T = phases[ph], k = T.length;
      var start = [arr.indexOf(BL)];
      for (var j = 0; j < k; j++) start.push(arr.indexOf(T[j]));
      var enc = function (s) { var v = 0; for (var q = 0; q < s.length; q++) v = v * N + s[q]; return v; };
      var done = function (s) { for (var q = 0; q < k; q++) if (s[q + 1] !== T[q]) return false; return true; };
      if (done(start)) { for (j = 0; j < k; j++) fixed[T[j]] = 1; continue; }
      var prev = new Map(), queue = [start], found = null;
      prev.set(enc(start), null);
      for (var qi = 0; qi < queue.length && !found; qi++) {
        var s = queue[qi], b = s[0], br = (b / n) | 0, bc = b % n;
        var nbs = [];
        if (br > 0) nbs.push(b - n); if (br < n - 1) nbs.push(b + n); if (bc > 0) nbs.push(b - 1); if (bc < n - 1) nbs.push(b + 1);
        for (var x = 0; x < nbs.length; x++) {
          var nb = nbs[x]; if (fixed[nb]) continue;
          var t = s.slice(); t[0] = nb;
          for (var y = 1; y <= k; y++) if (t[y] === nb) t[y] = b;
          var e = enc(t); if (prev.has(e)) continue;
          prev.set(e, { from: enc(s), mv: nb, st: s });
          if (done(t)) { found = t; break; }
          queue.push(t);
        }
      }
      if (!found) return null;
      var seq = [], cur = enc(found);
      while (prev.get(cur)) { var p = prev.get(cur); seq.push(p.mv); cur = p.from; }
      seq.reverse();
      for (j = 0; j < seq.length; j++) {
        var bpos = arr.indexOf(BL), m = seq[j];
        arr[bpos] = arr[m]; arr[m] = BL; out.push(m);
      }
      for (j = 0; j < k; j++) fixed[T[j]] = 1;
    }
    return solvedArr(arr) ? out : null;
  }
  // 滑塊：推「位置 m」那片進空格
  function slideMove(arr, n, m) {
    var b = arr.indexOf(n * n - 1), br = (b / n) | 0, bc = b % n, mr = (m / n) | 0, mc = m % n;
    if (Math.abs(br - mr) + Math.abs(bc - mc) !== 1) return false;
    arr[b] = arr[m]; arr[m] = n * n - 1; return true;
  }

  /* ---------------- 旋轉：分段 BFS ---------------- */
  function rotatePhases(n) {
    var P = [], r, c;
    // 3×3：兩個窗格在最後兩列只生成 120 種排列（不是 6! = 720）⇒ 改成「放好左上角後，其餘 8 片整段 BFS」（3 個窗格 = 8! 全可達）
    if (n === 3) return [[0], [1, 2, 3, 4, 5, 6, 7, 8]];
    for (r = 0; r < n - 2; r++) {
      for (c = 0; c < n - 2; c++) P.push([r * n + c]);
      P.push([r * n + n - 2, r * n + n - 1]);
    }
    var last = []; for (r = n - 2; r < n; r++) for (c = 0; c < n; c++) last.push(r * n + c);
    P.push(last);
    return P;
  }
  function solveRotate(arr0, n) {
    var arr = arr0.slice(), N = n * n, fixed = new Uint8Array(N), out = [];
    var phases = rotatePhases(n);
    for (var ph = 0; ph < phases.length; ph++) {
      var T = phases[ph], k = T.length;
      var wins = [];
      for (var r = 0; r < n - 1; r++) for (var c = 0; c < n - 1; c++) {
        var w = windowCells(n, r, c);
        if (w.some(function (p) { return fixed[p]; })) continue;
        for (var d = 0; d < 2; d++) {
          var map = new Int8Array(N); for (var i = 0; i < N; i++) map[i] = i;
          for (var q = 0; q < 4; q++) map[w[q]] = w[(q + (d ? 3 : 1)) % 4];
          wins.push({ r: r, c: c, cw: !d, map: map });
        }
      }
      var start = []; for (var j = 0; j < k; j++) start.push(arr.indexOf(T[j]));
      var enc = function (s) { var v = 0; for (var q2 = 0; q2 < s.length; q2++) v = v * N + s[q2]; return v; };
      var done = function (s) { for (var q3 = 0; q3 < k; q3++) if (s[q3] !== T[q3]) return false; return true; };
      if (!done(start)) {
        var prev = new Map(), queue = [start], found = null;
        prev.set(enc(start), null);
        for (var qi = 0; qi < queue.length && !found; qi++) {
          var s = queue[qi];
          for (var x = 0; x < wins.length; x++) {
            var W = wins[x], t = new Array(k);
            for (var y = 0; y < k; y++) t[y] = W.map[s[y]];
            var e = enc(t); if (prev.has(e)) continue;
            prev.set(e, { from: enc(s), mv: x });
            if (done(t)) { found = t; break; }
            queue.push(t);
          }
        }
        if (!found) return null;
        var seq = [], cur = enc(found);
        while (prev.get(cur)) { var p = prev.get(cur); seq.push(wins[p.mv]); cur = p.from; }
        seq.reverse();
        for (j = 0; j < seq.length; j++) { rotate(arr, n, seq[j].r, seq[j].c, seq[j].cw); out.push({ r: seq[j].r, c: seq[j].c, cw: seq[j].cw }); }
      }
      for (j = 0; j < k; j++) fixed[T[j]] = 1;
    }
    return solvedArr(arr) ? out : null;
  }

  /* ---------------- 換位 ---------------- */
  function solveSwap(arr0) {
    var arr = arr0.slice(), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === i) continue;
      var j = arr.indexOf(i);
      out.push([i, j]); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return out;
  }
  function swapPar(arr) {
    var seen = new Uint8Array(arr.length), cyc = 0;
    for (var i = 0; i < arr.length; i++) { if (seen[i]) continue; cyc++; var j = i; while (!seen[j]) { seen[j] = 1; j = arr[j]; } }
    return arr.length - cyc;
  }

  /* ---------------- 內容等價（相同圖面的片可互換） ---------------- */
  // cls[片號] = 與該片圖面（16 磁磚 + 4 屬性）完全相同的最小片號；完成判定 = 每格放的片與該格「同類」
  function solvedEq(arr, cls) {
    if (!cls) return solvedArr(arr);
    for (var i = 0; i < arr.length; i++) if (cls[arr[i]] !== cls[i]) return false;
    return true;
  }
  // 依內容重新編號：已經「同類到位」的片改標成該格的號碼，其餘同類片依序分配剩下的號碼 ⇒ 之後照一般解題器解。
  // slideN > 0（滑塊）：重新編號若改變奇偶（不可解），就把同類兩片的號碼對調（同類片外觀相同，對調不影響畫面）。
  function canon(arr, cls, slideN) {
    if (!cls) return arr.slice();
    var N = arr.length, out = new Array(N), used = new Uint8Array(N), p, q;
    for (p = 0; p < N; p++) if (cls[arr[p]] === cls[p]) { out[p] = p; used[p] = 1; }
    for (p = 0; p < N; p++) {
      if (out[p] !== undefined) continue;
      var c = cls[arr[p]];
      for (q = 0; q < N; q++) if (!used[q] && cls[q] === c) break;
      out[p] = q; used[q] = 1;
    }
    if (slideN && !slideSolvable(out, slideN)) {
      var blank = N - 1, best = null;
      for (p = 0; p < N && !best; p++) for (q = p + 1; q < N; q++) {
        if (out[p] === blank || out[q] === blank || cls[out[p]] !== cls[out[q]]) continue;
        if (out[p] !== p && out[q] !== q) { best = [p, q]; break; }
        if (!best) best = [p, q];
      }
      if (best) { var t = out[best[0]]; out[best[0]] = out[best[1]]; out[best[1]] = t; }
    }
    return out;
  }
  // 片像素陣列 → cls：兩片「不同的像素 ≤ tol」就算同一類（併查集，取最小片號當代表）；skip = 不參與合併的片號（滑塊的空格）
  function classes(pix, tol, skip) {
    var n = pix.length, par = [], i, j;
    for (i = 0; i < n; i++) par.push(i);
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      if (i === skip || j === skip) continue;
      var a = pix[i], b = pix[j], d = 0;
      for (var k = 0; k < a.length && d <= tol; k++) if (a[k] !== b[k]) d++;
      if (d <= tol) { var ri = find(i), rj = find(j); if (ri !== rj) { if (ri < rj) par[rj] = ri; else par[ri] = rj; } }
    }
    var cls = []; for (i = 0; i < n; i++) cls.push(find(i));
    return cls;
  }

  SL.Solve = {
    solvedEq: solvedEq, canon: canon, classes: classes,
    rng: rng, permParity: permParity, solved: solvedArr, slideSolvable: slideSolvable, misplaced: misplaced,
    scrambleSlide: scrambleSlide, scrambleSwap: scrambleSwap, scrambleRotate: scrambleRotate,
    rotate: rotate, windowCells: windowCells, slideMove: slideMove,
    slide: solveSlide, rotateSolve: solveRotate, swap: solveSwap, swapPar: swapPar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SL.Solve;
})(typeof window !== 'undefined' ? window : globalThis);
