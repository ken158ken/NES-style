/*
 * games/cart3/mines/gen.js — 《星塵探雷》無猜盤面產生器 + 邏輯解題器（純函式，無 DOM / PPU）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 全域只掛 CT.Mines.Gen（node 也可 require 來跑實驗）
 *
 * 盤面表示：W×H 格，索引 i = y*W + x。
 *   mines：Uint8Array（1 = 雷）——只有產生器 / 開格時算數字會看；
 *   view ：Int8Array，玩家看得到的狀態：-1 = 未開、-2 = 插旗、0..8 = 已開的數字。
 *
 * deduce(W, H, view, total, opt) —— 「人看得到什麼就推什麼」的邏輯解題器（機器人、提示、產生驗證共用）：
 *   ① 單點規則：數字 n 的未知鄰格集合 S、還差 k 顆雷 ⇒ k = 0 全安全；k = |S| 全是雷。
 *   ② 兩兩規則：兩個約束 A、B 重疊時，若 k_B − k_A = |B \ A| ⇒ B \ A 全雷、A \ B 全安全（含子集規則）。
 *   ③ 全域規則：剩餘雷數 = 0 ⇒ 所有未知安全；剩餘雷數 = 未知格數 ⇒ 全是雷。
 *   推出來的雷 / 安全格會回饋進下一輪，直到沒有新結論。opt.ignoreFlags = true 時把玩家的旗子當未知（提示用）。
 *   回傳 { safe:[i...], mine:[i...] }（只列「目前仍未開」的格子）。
 *
 * solve(W, H, mines, start) —— 模擬一個只會上面三條規則的玩家，從 start 開第一格（洪水展開 0），
 *   反覆 deduce → 開所有安全格，直到卡住。回傳 { ok, opened, rounds }；ok = 不必猜就全開完 ⇒ 「無猜盤面」。
 *
 * Generator(W, H, n, start, seed) —— 首擊安全（start 周圍 3×3 不放雷 ⇒ 首擊必為 0 打開一片），
 *   一直抽亂數盤直到 solve().ok；`step(maxTries)` 一次只試幾盤（main.js 每幀給時間預算，畫面不卡）。
 *   同一個 seed + start ⇒ 同一張盤（與每幀試幾盤無關：亂數序列只依嘗試次數前進）。
 */
(function (root) {
  'use strict';
  var CT = root.CT = root.CT || {};
  var MI = CT.Mines = CT.Mines || {};

  /* ---------------- 亂數：xorshift32（可重現） ---------------- */
  function Rng(seed) {
    var s = (seed >>> 0) || 0x9E3779B9;
    return {
      next: function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; },
      int: function (n) { return this.next() % n; },
      get seed() { return s; }
    };
  }

  /* ---------------- 鄰格表（每個尺寸算一次） ---------------- */
  var NB_CACHE = {};
  function neighbors(W, H) {
    var key = W + 'x' + H;
    if (NB_CACHE[key]) return NB_CACHE[key];
    var out = [], x, y, dx, dy;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var l = [];
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) l.push(ny * W + nx);
      }
      out.push(l);
    }
    NB_CACHE[key] = out;
    return out;
  }

  function counts(W, H, mines) {
    var nb = neighbors(W, H), n = W * H, c = new Int8Array(n), i, j;
    for (i = 0; i < n; i++) {
      if (mines[i]) { c[i] = 9; continue; }
      var k = 0, l = nb[i];
      for (j = 0; j < l.length; j++) k += mines[l[j]];
      c[i] = k;
    }
    return c;
  }

  // 開一格（含 0 的洪水展開）。view 原地改，回傳新開的格子索引陣列（依 BFS 順序 ⇒ 畫面上是由點擊處擴散）
  function openCell(W, H, mines, num, view, i) {
    var nb = neighbors(W, H), out = [];
    if (view[i] !== -1) return out;
    var q = [i]; view[i] = num[i] === 9 ? 9 : num[i]; out.push(i);
    if (num[i] === 9) return out;
    var h = 0;
    while (h < q.length) {
      var c = q[h++];
      if (view[c] !== 0) continue;
      var l = nb[c];
      for (var j = 0; j < l.length; j++) {
        var t = l[j];
        if (view[t] !== -1) continue;     // 旗子（-2）不自動翻
        view[t] = num[t]; out.push(t);
        if (num[t] === 0) q.push(t);
      }
    }
    return out;
  }

  /* ---------------- 邏輯解題器 ---------------- */
  function deduce(W, H, view, total, opt) {
    opt = opt || {};
    var nb = neighbors(W, H), n = W * H, i, j, k;
    // known：0 = 未知、1 = 推定雷、2 = 推定安全
    var known = new Uint8Array(n);
    var unknownCnt = 0, flagCnt = 0;
    for (i = 0; i < n; i++) {
      var v = view[i];
      if (v === -2) { if (opt.ignoreFlags) unknownCnt++; else { known[i] = 1; flagCnt++; } }
      else if (v === -1) unknownCnt++;
    }
    var safeOut = [], mineOut = [];
    function hiddenAt(c) { var v = view[c]; return v === -1 || (v === -2 && opt.ignoreFlags); }
    function mark(c, kind) {
      if (known[c]) return false;
      known[c] = kind;
      if (kind === 2) safeOut.push(c); else mineOut.push(c);
      return true;
    }
    var changed = true, guard = 0;
    while (changed && guard++ < 64) {
      changed = false;
      // 建約束
      var cons = [], byCell = {};
      for (i = 0; i < n; i++) {
        var vv = view[i];
        if (vv < 0 || vv > 8) continue;
        var l = nb[i], S = [], need = vv;
        for (j = 0; j < l.length; j++) {
          var t = l[j];
          if (!hiddenAt(t) && !(view[t] === -2 && !opt.ignoreFlags)) continue;
          if (known[t] === 1) need--;
          else if (known[t] === 0) S.push(t);
        }
        if (!S.length) continue;
        // ① 單點
        if (need === 0) { for (j = 0; j < S.length; j++) changed = mark(S[j], 2) || changed; continue; }
        if (need === S.length) { for (j = 0; j < S.length; j++) changed = mark(S[j], 1) || changed; continue; }
        var ci = cons.length;
        cons.push({ S: S, k: need });
        for (j = 0; j < S.length; j++) (byCell[S[j]] || (byCell[S[j]] = [])).push(ci);
      }
      if (changed) continue;
      // ② 兩兩
      for (var a = 0; a < cons.length && !changed; a++) {
        var A = cons[a], seen = {};
        for (j = 0; j < A.S.length; j++) {
          var lst = byCell[A.S[j]];
          for (k = 0; k < lst.length; k++) {
            var b = lst[k];
            if (b === a || seen[b]) continue;
            seen[b] = 1;
            var Bc = cons[b], onlyB = [], onlyA = [], x;
            for (x = 0; x < Bc.S.length; x++) if (A.S.indexOf(Bc.S[x]) < 0) onlyB.push(Bc.S[x]);
            for (x = 0; x < A.S.length; x++) if (Bc.S.indexOf(A.S[x]) < 0) onlyA.push(A.S[x]);
            if (Bc.k - A.k === onlyB.length && (onlyB.length || onlyA.length)) {
              for (x = 0; x < onlyB.length; x++) changed = mark(onlyB[x], 1) || changed;
              for (x = 0; x < onlyA.length; x++) changed = mark(onlyA[x], 2) || changed;
            }
          }
        }
      }
      if (changed) continue;
      // ③ 全域
      var left = total - flagCnt - mineOut.length, unk = [];
      for (i = 0; i < n; i++) if (known[i] === 0 && hiddenAt(i)) unk.push(i);
      if (unk.length && (left === 0 || left === unk.length)) {
        for (i = 0; i < unk.length; i++) changed = mark(unk[i], left === 0 ? 2 : 1) || changed;
      }
    }
    return { safe: safeOut, mine: mineOut };
  }

  function solve(W, H, mines, start, total) {
    var n = W * H, num = counts(W, H, mines), view = new Int8Array(n), i;
    if (total === undefined) { total = 0; for (i = 0; i < n; i++) total += mines[i]; }
    view.fill(-1);
    if (mines[start]) return { ok: false, opened: 0, rounds: 0 };
    var opened = openCell(W, H, mines, num, view, start).length, rounds = 0;
    var need = n - total;
    while (opened < need) {
      var d = deduce(W, H, view, total);
      rounds++;
      if (!d.safe.length) break;
      for (i = 0; i < d.safe.length; i++) {
        if (mines[d.safe[i]]) return { ok: false, opened: opened, rounds: rounds, bug: true };   // 解題器出錯（測試抓）
        opened += openCell(W, H, mines, num, view, d.safe[i]).length;
      }
      for (i = 0; i < d.mine.length; i++) view[d.mine[i]] = -2;
    }
    return { ok: opened >= need, opened: opened, rounds: rounds };
  }

  function randomBoard(W, H, total, start, rng) {
    var n = W * H, mines = new Uint8Array(n), cand = [], i;
    var sx = start % W, sy = (start / W) | 0;
    for (i = 0; i < n; i++) {
      var x = i % W, y = (i / W) | 0;
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
      cand.push(i);
    }
    for (i = 0; i < total && i < cand.length; i++) {
      var j = i + rng.int(cand.length - i), t = cand[i]; cand[i] = cand[j]; cand[j] = t;
      mines[cand[i]] = 1;
    }
    return mines;
  }

  function Generator(W, H, total, start, seed) {
    var rng = Rng(seed);
    var self = {
      W: W, H: H, total: total, start: start, seed: seed, tries: 0, done: false, mines: null, rounds: 0,
      step: function (maxTries) {
        for (var t = 0; t < (maxTries || 1) && !self.done; t++) {
          var m = randomBoard(W, H, total, start, rng);
          self.tries++;
          var r = solve(W, H, m, start, total);
          if (r.ok) { self.done = true; self.mines = m; self.rounds = r.rounds; }
        }
        return self.done;
      }
    };
    return self;
  }

  MI.Gen = {
    Rng: Rng, neighbors: neighbors, counts: counts, openCell: openCell,
    deduce: deduce, solve: solve, randomBoard: randomBoard, Generator: Generator
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MI.Gen;
})(typeof window !== 'undefined' ? window : globalThis);
