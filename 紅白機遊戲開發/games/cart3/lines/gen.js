/*
 * games/cart3/lines/gen.js — 《星塵連線 STAR LINK》關卡模型 + 解題器 + 產生器（純函式，瀏覽器 / node 共用）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：無（不碰 PPU / APU）
 *
 * 規則（原創變體，與「同色點相連 + 填滿盤面」類商業作品的差異 = 兩種自創機關）：
 *   1. 每種顏色有 2 顆星珠（端點），用線把同色星珠連起來；線只走上下左右、不能分岔、不能交叉；
 *   2. 盤面每一格都要有線經過（填滿）；
 *   3. 【星橋 BRIDGE】橋格必須被「一條橫線 + 一條直線」各直直穿過一次（兩條線在這格立體交叉、不能轉彎）；
 *   4. 【星門 GATE】一對星門（兩格）算同一個節點：線從其中一扇門進去、一定從另一扇門出來（出門方向自選），
 *      兩扇門都算被填滿；星門不能當端點。
 *   5. 【星鏡 MIRROR】（fix-r7 新增的自創機關）格子裡有一面斜放的鏡子（/ 或 \），線碰到鏡子一定反彈 90°：
 *      「/」只准左↔上、右↔下，「\」只准上↔右、左↔下；鏡格只能被一條線經過（也要填滿）、不能當端點。
 *      ⇒ 和「隨便轉彎」不同，鏡子的朝向決定了線從哪一側進、就一定從哪一側出。
 *
 * 圖模型：每格一個節點；橋格拆成 H 節點（只接左右）+ V 節點（只接上下）；一對星門共用一個節點
 *   （第二扇門那格的節點 = 死節點，度數 0）。端點度數 1、死節點 0、其餘 2。星門節點額外要求「A 側 1 條 + B 側 1 條」；
 *   星鏡節點額外要求「成對的兩條邊同開同關」（/：左上一對、右下一對；\：上右一對、左下一對）。
 *
 * 解題器 solve(level, limit)：邊變數（未定 / 關 / 開）回溯 + 傳播（度數、星門兩側、顏色一致、禁止成環、
 *   每色兩端點可達），回傳 { count, sol:[第一組解：每色格子序列], nodes }。count 數到 limit（預設 2）就停 ⇒ 唯一解驗證。
 * 產生器 generate(spec, seed)：亂數長路徑分割（不自鄰：同一條線不准有非相鄰順序的兩格貼在一起 ⇒ 無 2×2 同色塊）
 *   → 調色盤分組（過同一座橋的兩色必須同組）→ 解題器數解 == 1 才收；同一 seed 永遠得到同一關。
 */
(function (root) {
  'use strict';
  var CT = root.CT = root.CT || {};
  var LN = CT.Lines = CT.Lines || {};

  /* ---------------- 亂數（可重現） ---------------- */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {          // xorshift32 → [0,1)
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------------- 圖 ---------------- */
  // level = { w, h, ends:[[x1,y1,x2,y2],...], bridges:[[x,y]], gates:[[x1,y1,x2,y2]], mirrors:[[x,y,t]]（t 1 = /、2 = \） }
  // 鏡子的成對邊（方向 0 上 1 右 2 下 3 左）
  var MIR_PAIRS = { 1: [[3, 0], [1, 2]], 2: [[0, 1], [3, 2]] };
  function mirPartner(t, side) {
    var P = MIR_PAIRS[t];
    for (var q = 0; q < 2; q++) { if (P[q][0] === side) return P[q][1]; if (P[q][1] === side) return P[q][0]; }
    return -1;
  }
  function build(L) {
    var w = L.w, h = L.h, N = w * h, i, k;
    var bridges = L.bridges || [], gates = L.gates || [], mirrors = L.mirrors || [];
    var bIdx = new Int16Array(N).fill(-1), gMap = new Int16Array(N).fill(-1), gTwin = new Int16Array(N).fill(-1);
    for (k = 0; k < bridges.length; k++) bIdx[bridges[k][1] * w + bridges[k][0]] = k;
    for (k = 0; k < gates.length; k++) {
      var g1 = gates[k][1] * w + gates[k][0], g2 = gates[k][3] * w + gates[k][2];
      gMap[g1] = g1; gMap[g2] = g1; gTwin[g1] = g2; gTwin[g2] = g1;
    }
    var nn = N + bridges.length;
    function nodeFor(c, horiz) {
      if (bIdx[c] >= 0) return horiz ? c : N + bIdx[c];
      if (gMap[c] >= 0) return gMap[c];
      return c;
    }
    var deg = new Int8Array(nn).fill(2), color = new Int8Array(nn), isGate = new Uint8Array(nn);
    for (k = 0; k < gates.length; k++) { deg[gates[k][3] * w + gates[k][2]] = 0; isGate[gates[k][1] * w + gates[k][0]] = 1; }
    var ends = L.ends;
    for (k = 0; k < ends.length; k++) {
      var e1 = ends[k][1] * w + ends[k][0], e2 = ends[k][3] * w + ends[k][2];
      deg[e1] = 1; deg[e2] = 1; color[e1] = k + 1; color[e2] = k + 1;
    }
    var ea = [], eb = [], eca = [], ecb = [], eside = [];   // eside：碰到星門節點那端是 A 側(1) / B 側(2)，否則 0
    function addEdge(c1, c2, horiz) {
      var a = nodeFor(c1, horiz), b = nodeFor(c2, horiz);
      if (a === b) return;
      ea.push(a); eb.push(b); eca.push(c1); ecb.push(c2);
      var s = 0;
      if (isGate[a]) s = (c1 === a) ? 1 : 2;
      else if (isGate[b]) s = (c2 === b) ? 1 : 2;
      eside.push(s);
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      i = y * w + x;
      if (x + 1 < w) addEdge(i, i + 1, true);
      if (y + 1 < h) addEdge(i, i + w, false);
    }
    var ne = ea.length, adj = [];
    for (i = 0; i < nn; i++) adj.push([]);
    for (k = 0; k < ne; k++) { adj[ea[k]].push(k); adj[eb[k]].push(k); }
    // 星鏡：mir[節點] = 1 (/) / 2 (\)；mirE[節點] = [上, 右, 下, 左] 的邊（沒有 = -1）
    var mir = new Int8Array(nn), mirE = {};
    for (k = 0; k < mirrors.length; k++) {
      var mc = mirrors[k][1] * w + mirrors[k][0];
      mir[mc] = mirrors[k][2] || 1;
      var E4 = [-1, -1, -1, -1];
      for (var j = 0; j < adj[mc].length; j++) {
        var ee = adj[mc][j], oc = ea[ee] === mc ? ecb[ee] : eca[ee], d = oc - mc;
        E4[d === -w ? 0 : d === 1 ? 1 : d === w ? 2 : 3] = ee;
      }
      mirE[mc] = E4;
    }
    return { w: w, h: h, N: N, nn: nn, ne: ne, ea: ea, eb: eb, eca: eca, ecb: ecb, eside: eside, adj: adj,
             deg: deg, color: color, isGate: isGate, bIdx: bIdx, gMap: gMap, gTwin: gTwin, nodeFor: nodeFor, ncol: ends.length, L: L,
             mir: mir, mirE: mirE };
  }

  /* ---------------- 解題器 ---------------- */
  function solve(L, limit, maxNodes) {
    limit = limit || 2;
    maxNodes = maxNodes || 2000000;
    var G = build(L), ne = G.ne, nn = G.nn, ea = G.ea, eb = G.eb, adj = G.adj, deg = G.deg, eside = G.eside, isGate = G.isGate, mir = G.mir;
    var es = new Int8Array(ne).fill(-1), col = new Int8Array(G.color);
    var trail = [];               // 正數 = 邊 index+1（復原成 -1）；負數 = -(節點+1)（顏色復原成 0）
    var queue = [], inq = new Uint8Array(nn);
    var count = 0, first = null, visited = 0, aborted = false;

    function other(e, v) { return ea[e] === v ? eb[e] : ea[e]; }
    function push(v) { if (!inq[v]) { inq[v] = 1; queue.push(v); } }
    // 從 v 沿著「開」的邊走到鏈的另一端（不經過 skip 邊）
    function chainEnd(v, skipE) {
      var prevE = skipE, cur = v, guard = 0;
      for (;;) {
        var nx = -1, L2 = adj[cur];
        for (var j = 0; j < L2.length; j++) { var e = L2[j]; if (e !== prevE && es[e] === 1) { nx = e; break; } }
        if (nx < 0) return cur;
        cur = other(nx, cur); prevE = nx;
        if (++guard > nn + 2) return -1;
      }
    }
    function setE(e, val) {
      if (es[e] === val) return true;
      if (es[e] !== -1) return false;
      if (val === 1) {
        var a = ea[e], b = eb[e];
        if (col[a] && col[b] && col[a] !== col[b]) return false;
        if (chainEnd(a, -1) === chainEnd(b, -1)) {
          // a、b 已在同一條鏈上 ⇒ 成環（除非兩端都是孤立的同一點，不可能）
          return false;
        }
      }
      es[e] = val; trail.push(e + 1);
      push(ea[e]); push(eb[e]);
      return true;
    }
    function setC(v, c) {
      if (col[v] === c) return true;
      if (col[v] && col[v] !== c) return false;
      col[v] = c; trail.push(-(v + 1)); push(v);
      return true;
    }
    function undo(mark) {
      while (trail.length > mark) {
        var t = trail.pop();
        if (t > 0) es[t - 1] = -1; else col[-t - 1] = 0;
      }
    }
    function nodeOk(v) {
      var L2 = adj[v], on = 0, unk = 0, j, e;
      for (j = 0; j < L2.length; j++) { e = L2[j]; if (es[e] === 1) on++; else if (es[e] === -1) unk++; }
      var d = deg[v];
      if (on > d || on + unk < d) return false;
      if (unk) {
        if (on === d) { for (j = 0; j < L2.length; j++) { e = L2[j]; if (es[e] === -1 && !setE(e, 0)) return false; } }
        else if (on + unk === d) { for (j = 0; j < L2.length; j++) { e = L2[j]; if (es[e] === -1 && !setE(e, 1)) return false; } }
      }
      if (isGate[v]) {
        for (var side = 1; side <= 2; side++) {
          var so = 0, su = 0, last = -1;
          for (j = 0; j < L2.length; j++) {
            e = L2[j]; if (eside[e] !== side) continue;
            if (es[e] === 1) so++; else if (es[e] === -1) { su++; last = e; }
          }
          if (so > 1 || so + su < 1) return false;
          if (so === 1 && su) { for (j = 0; j < L2.length; j++) { e = L2[j]; if (eside[e] === side && es[e] === -1 && !setE(e, 0)) return false; } }
          else if (so === 0 && su === 1 && !setE(last, 1)) return false;
        }
      }
      if (mir[v]) {
        // 星鏡：成對的兩條邊同開同關（缺邊的那一對 ⇒ 另一條也關）
        var MP = MIR_PAIRS[mir[v]], E4 = G.mirE[v];
        for (var q = 0; q < 2; q++) {
          var e1 = E4[MP[q][0]], e2 = E4[MP[q][1]];
          if (e1 < 0 || e2 < 0) { if (e1 >= 0 && !setE(e1, 0)) return false; if (e2 >= 0 && !setE(e2, 0)) return false; continue; }
          var s1 = es[e1], s2 = es[e2];
          if (s1 !== -1 && s2 !== -1) { if (s1 !== s2) return false; }
          else if (s1 !== -1) { if (!setE(e2, s1)) return false; }
          else if (s2 !== -1) { if (!setE(e1, s2)) return false; }
        }
      }
      // 顏色
      for (j = 0; j < L2.length; j++) {
        e = L2[j]; var u = other(e, v);
        if (es[e] === 1) {
          if (col[v] && !setC(u, col[v])) return false;
          if (col[u] && !setC(v, col[u])) return false;
        } else if (es[e] === -1 && col[v] && col[u] && col[v] !== col[u]) {
          if (!setE(e, 0)) return false;
        }
      }
      return true;
    }
    function propagate() {
      while (queue.length) {
        var v = queue.pop(); inq[v] = 0;
        if (!nodeOk(v)) { while (queue.length) inq[queue.pop()] = 0; return false; }
      }
      return true;
    }
    // 每色兩端點可達（經由「同色或未定色」節點與非關閉邊）
    var seen = new Int32Array(nn), stamp = 0, bfsQ = new Int32Array(nn);
    var endA = [], endB = [];
    for (var k = 0; k < G.ncol; k++) {
      var E = L.ends[k];
      endA.push(E[1] * G.w + E[0]); endB.push(E[3] * G.w + E[2]);
    }
    function reachOk() {
      for (var k2 = 0; k2 < endA.length; k2++) {
        var c = k2 + 1, s = endA[k2], t = endB[k2];
        stamp++;
        var qh = 0, qt = 0; bfsQ[qt++] = s; seen[s] = stamp;
        var found = false;
        while (qh < qt && !found) {
          var v = bfsQ[qh++], L2 = adj[v];
          for (var j = 0; j < L2.length; j++) {
            var e = L2[j]; if (es[e] === 0) continue;
            var u = other(e, v);
            if (seen[u] === stamp) continue;
            if (col[u] && col[u] !== c) continue;
            if (u === t) { found = true; break; }
            seen[u] = stamp; bfsQ[qt++] = u;
          }
        }
        if (!found) return false;
      }
      // 未定色、還沒被任何色碰到的節點：至少要能被某一色碰到（否則填不滿）——用一次多源 BFS
      stamp++;
      var qh2 = 0, qt2 = 0;
      for (var v2 = 0; v2 < nn; v2++) if (col[v2] && deg[v2]) { seen[v2] = stamp; bfsQ[qt2++] = v2; }
      while (qh2 < qt2) {
        var v3 = bfsQ[qh2++], L3 = adj[v3];
        for (var j3 = 0; j3 < L3.length; j3++) {
          var e3 = L3[j3]; if (es[e3] === 0) continue;
          var u3 = other(e3, v3); if (seen[u3] === stamp) continue;
          seen[u3] = stamp; bfsQ[qt2++] = u3;
        }
      }
      for (v2 = 0; v2 < nn; v2++) if (deg[v2] && seen[v2] !== stamp) return false;
      return true;
    }
    function pick() {
      // 先挑「已上色且度數未滿」的節點中未定邊最少者（從線頭延伸），否則任一未定邊
      var best = -1, bestU = 99;
      for (var v = 0; v < nn; v++) {
        if (!deg[v]) continue;
        var L2 = adj[v], on = 0, unk = 0, fe = -1;
        for (var j = 0; j < L2.length; j++) { var e = L2[j]; if (es[e] === 1) on++; else if (es[e] === -1) { unk++; if (fe < 0) fe = e; } }
        if (!unk || on >= deg[v]) continue;
        var score = unk + (col[v] ? 0 : 4);
        if (score < bestU) { bestU = score; best = fe; if (score <= 2) break; }
      }
      return best;
    }
    function record() {
      // 由邊狀態還原每色的格子序列
      var paths = [];
      for (var k3 = 0; k3 < endA.length; k3++) {
        var cells = [], v = endA[k3], prevE = -1, guard = 0;
        cellsOfStep(-1, v, cells);
        for (;;) {
          var L2 = adj[v], nx = -1;
          for (var j = 0; j < L2.length; j++) { var e = L2[j]; if (e !== prevE && es[e] === 1) { nx = e; break; } }
          if (nx < 0) break;
          var u = other(nx, v);
          // 進入 u 的那格 = 這條邊在 u 那端的格子
          var cu = (ea[nx] === u) ? G.eca[nx] : G.ecb[nx];
          var cv = (ea[nx] === v) ? G.eca[nx] : G.ecb[nx];
          if (cells[cells.length - 1] !== cv) cells.push(cv);     // 從星門的另一扇門出來
          cells.push(cu);
          prevE = nx; v = u;
          if (++guard > nn + 4) break;
        }
        paths.push(cells);
      }
      return paths;
    }
    function cellsOfStep(_, v, cells) { cells.push(v < G.N ? v : -1); }
    function rec() {
      if (aborted) return;
      if (++visited > maxNodes) { aborted = true; return; }
      var e = pick();
      if (e < 0) {
        // 全部定案：檢查度數都滿足
        for (var v = 0; v < nn; v++) {
          if (!deg[v]) continue;
          var on = 0, L2 = adj[v];
          for (var j = 0; j < L2.length; j++) if (es[L2[j]] === 1) on++;
          if (on !== deg[v]) return;
        }
        count++;
        if (!first) first = record();
        return;
      }
      for (var val = 1; val >= 0; val--) {
        var mark = trail.length;
        if (setE(e, val) && propagate() && reachOk()) rec();
        else { while (queue.length) inq[queue.pop()] = 0; }
        undo(mark);
        if (count >= limit || aborted) return;
      }
    }
    for (var v0 = 0; v0 < nn; v0++) push(v0);
    if (propagate() && reachOk()) rec();
    return { count: count, sol: first, nodes: visited, aborted: aborted };
  }

  /* ---------------- 產生器 ---------------- */
  // spec = { w, h, bridges: n, gates: n, minLen, maxLen, maxColors }
  var PAL_GROUPS = 4, PER_PAL = 2, MAX_COLORS = PAL_GROUPS * PER_PAL;

  function tryPartition(spec, R) {
    var w = spec.w, h = spec.h, N = w * h, i, k;
    function rnd(n) { return Math.floor(R() * n); }
    // 放機關
    var bridges = [], gates = [], special = new Uint8Array(N);
    function interior(c) { var x = c % w, y = (c / w) | 0; return x > 0 && y > 0 && x < w - 1 && y < h - 1; }
    function farFromSpecial(c, d) {
      var x = c % w, y = (c / w) | 0;
      for (var j = 0; j < N; j++) if (special[j]) { var dx = Math.abs(j % w - x), dy = Math.abs(((j / w) | 0) - y); if (dx + dy < d) return false; }
      return true;
    }
    var tries = 0;
    while (bridges.length < (spec.bridges || 0) && tries++ < 200) {
      var c = rnd(N);
      if (!interior(c) || special[c] || !farFromSpecial(c, 2)) continue;
      special[c] = 1; bridges.push([c % w, (c / w) | 0]);
    }
    tries = 0;
    while (gates.length < (spec.gates || 0) && tries++ < 400) {
      var c1 = rnd(N), c2 = rnd(N);
      if (c1 === c2 || special[c1] || special[c2]) continue;
      var dx = Math.abs(c1 % w - c2 % w), dy = Math.abs(((c1 / w) | 0) - ((c2 / w) | 0));
      if (dx + dy < 3 || !farFromSpecial(c1, 2) || !farFromSpecial(c2, 2)) continue;
      special[c1] = 2; special[c2] = 2; gates.push([c1 % w, (c1 / w) | 0, c2 % w, (c2 / w) | 0]);
    }
    var mirrors = [];
    tries = 0;
    while (mirrors.length < (spec.mirrors || 0) && tries++ < 300) {
      var mc = rnd(N);
      if (!interior(mc) || special[mc] || !farFromSpecial(mc, 2)) continue;
      special[mc] = 3; mirrors.push([mc % w, (mc / w) | 0, 1 + rnd(2)]);
    }
    if (bridges.length < (spec.bridges || 0) || gates.length < (spec.gates || 0) || mirrors.length < (spec.mirrors || 0)) return null;
    var Ltmp = { w: w, h: h, ends: [], bridges: bridges, gates: gates, mirrors: mirrors };
    var G = build(Ltmp), nn = G.nn;
    var owner = new Int16Array(nn).fill(-1);       // 節點屬於哪條路徑
    var cellOwner = [];                             // 每格的擁有者集合（橋格 2 個）
    for (i = 0; i < N; i++) cellOwner.push([]);
    var paths = [];                                 // 每條 = 節點序列
    var pathCells = [];                             // 每條 = 格子序列（星門兩格都列）
    function sideAt(e, v) {                         // 邊 e 在節點 v（一般格 / 鏡格）那端是哪一側：0 上 1 右 2 下 3 左
      var c = cellAt(e, v), o = G.ea[e] === v ? G.ecb[e] : G.eca[e], d = o - c;
      return d === -w ? 0 : d === 1 ? 1 : d === w ? 2 : 3;
    }
    function mirExit(v, eIn) {                      // 從 eIn 進入鏡格 v ⇒ 唯一能出去的邊（沒有 = -1）
      var ps = mirPartner(G.mir[v], sideAt(eIn, v));
      return ps < 0 ? -1 : G.mirE[v][ps];
    }
    function nbrs(v, enterSide, enterE) {           // v 的鄰邊（星門：只能走另一側；星鏡：只能走成對的那一側）
      if (G.mir[v] && enterE >= 0) { var mx = mirExit(v, enterE); return mx >= 0 ? [mx] : []; }
      var out = [], L2 = G.adj[v];
      for (var j = 0; j < L2.length; j++) {
        var e = L2[j];
        if (G.isGate[v] && enterSide && G.eside[e] === enterSide) continue;
        out.push(e);
      }
      return out;
    }
    function cellAt(e, v) { return G.ea[e] === v ? G.eca[e] : G.ecb[e]; }
    function adjCells(c) { var x = c % w, y = (c / w) | 0, o = []; if (x > 0) o.push(c - 1); if (x < w - 1) o.push(c + 1); if (y > 0) o.push(c - w); if (y < h - 1) o.push(c + w); return o; }
    // 不自鄰：新格 nc 加進路徑 p（目前尾格 tail）時，nc 的鄰格除了 tail 以外不得屬於 p
    function selfAdj(p, nc, tailCells) {
      if (special[nc]) return false;               // 機關格不檢查
      var A = adjCells(nc);
      for (var j = 0; j < A.length; j++) {
        var a = A[j]; if (tailCells.indexOf(a) >= 0) continue;
        if (special[a]) continue;
        if (cellOwner[a].indexOf(p) >= 0) return true;
      }
      return false;
    }
    var uncovered = 0;
    for (i = 0; i < nn; i++) if (G.deg[i]) uncovered++;
    var minLen = spec.minLen || 3, maxLen = spec.maxLen || 12, guard = 0;
    while (uncovered > 0 && guard++ < 400) {
      // 起點：未覆蓋且可用鄰居最少的節點（不能是橋 / 星門）
      var best = -1, bestN = 99;
      for (i = 0; i < nn; i++) {
        if (!G.deg[i] || owner[i] >= 0 || i >= N || special[i]) continue;
        var cnt = 0, L2 = G.adj[i];
        for (k = 0; k < L2.length; k++) if (owner[G.ea[L2[k]] === i ? G.eb[L2[k]] : G.ea[L2[k]]] < 0) cnt++;
        var sc = cnt * 10 + rnd(10);
        if (sc < bestN) { bestN = sc; best = i; }
      }
      if (best < 0) return null;                    // 只剩機關沒覆蓋 ⇒ 失敗
      var p = paths.length, nodes = [best], cells = [best];
      owner[best] = p; cellOwner[best].push(p); uncovered--;
      var target = minLen + rnd(maxLen - minLen + 1), v = best, enterSide = 0, enterE = -1;
      for (;;) {
        if (nodes.length >= target && !G.isGate[v] && !G.mir[v] && !(v >= N || G.bIdx[v] >= 0)) break;
        var opts = nbrs(v, enterSide, enterE), cand = [];
        for (k = 0; k < opts.length; k++) {
          var e = opts[k], u = G.ea[e] === v ? G.eb[e] : G.ea[e];
          if (owner[u] >= 0 || !G.deg[u]) continue;
          if (G.mir[u]) {                           // 走進鏡格：反彈出去的那格要還空著
            var mx2 = mirExit(u, e);
            if (mx2 < 0) continue;
            var w2 = G.ea[mx2] === u ? G.eb[mx2] : G.ea[mx2];
            if (w2 === v || owner[w2] >= 0 || !G.deg[w2]) continue;
          }
          var cu = cellAt(e, u), cv = cellAt(e, v);
          var tailCells = [cells[cells.length - 1], cv];
          if (selfAdj(p, cu, tailCells)) continue;
          // 橋：H/V 節點本身只接直向，自動直行
          var free = 0, L3 = G.adj[u];
          for (var j = 0; j < L3.length; j++) { var uu = G.ea[L3[j]] === u ? G.eb[L3[j]] : G.ea[L3[j]]; if (owner[uu] < 0 && uu !== v) free++; }
          cand.push({ e: e, u: u, cu: cu, cv: cv, s: free * 4 + rnd(6) });
        }
        if (!cand.length) break;
        cand.sort(function (a, b) { return a.s - b.s; });
        var ch = cand[R() < 0.75 ? 0 : rnd(cand.length)];
        if (cells[cells.length - 1] !== ch.cv) cells.push(ch.cv);
        cells.push(ch.cu);
        nodes.push(ch.u);
        owner[ch.u] = p; uncovered--;
        cellOwner[ch.cu].push(p); if (ch.cv !== cells[cells.length - 2] || true) { if (cellOwner[ch.cv].indexOf(p) < 0) cellOwner[ch.cv].push(p); }
        enterSide = G.isGate[ch.u] ? G.eside[ch.e] : 0;
        enterE = ch.e;
        v = ch.u;
      }
      // 終點不得是機關
      if (G.isGate[v] || G.mir[v] || v >= N || G.bIdx[v] >= 0) return null;
      if (nodes.length < minLen) {
        // 太短：嘗試接到相鄰路徑的端點（兩條合併）
        var merged = false;
        for (var end = 0; end < 2 && !merged; end++) {
          var me = end === 0 ? nodes[0] : nodes[nodes.length - 1];
          var L4 = G.adj[me];
          for (k = 0; k < L4.length && !merged; k++) {
            var e4 = L4[k], u4 = G.ea[e4] === me ? G.eb[e4] : G.ea[e4];
            var q = owner[u4]; if (q < 0 || q === p || !paths[q]) continue;
            var qn = paths[q];
            if (qn[0] !== u4 && qn[qn.length - 1] !== u4) continue;
            // 合併：q 的序列 + p 的序列（方向對齊）
            var qcells = pathCells[q].slice(), pc = cells.slice(), pn = nodes.slice(), qq = qn.slice();
            if (qq[qq.length - 1] !== u4) { qq.reverse(); qcells.reverse(); }
            if (pn[0] !== me) { pn.reverse(); pc.reverse(); }
            var allCells = qcells.concat(pc);
            // 合併後也要不自鄰
            var okm = true;
            for (var a1 = 0; a1 < allCells.length && okm; a1++) {
              if (special[allCells[a1]]) continue;
              var A1 = adjCells(allCells[a1]);
              for (var a2 = 0; a2 < A1.length; a2++) {
                var idx = allCells.indexOf(A1[a2]);
                if (idx >= 0 && Math.abs(idx - a1) > 1 && !special[A1[a2]]) { okm = false; break; }
              }
            }
            if (!okm) continue;
            paths[q] = qq.concat(pn); pathCells[q] = allCells;
            for (var z = 0; z < pn.length; z++) owner[pn[z]] = q;
            for (z = 0; z < pc.length; z++) { var co = cellOwner[pc[z]], ix = co.indexOf(p); if (ix >= 0) co[ix] = q; }
            merged = true;
          }
        }
        if (!merged) return null;
        paths.push(null); pathCells.push(null);
      } else { paths.push(nodes); pathCells.push(cells); }
    }
    if (uncovered > 0) return null;
    var P = [], PC = [];
    for (k = 0; k < paths.length; k++) if (paths[k]) { P.push(paths[k]); PC.push(pathCells[k]); }
    if (P.length > Math.min(MAX_COLORS, spec.maxColors || MAX_COLORS) || P.length < 2) return null;
    // 星門一定要被用到：星門節點的兩側都要有邊（度數 2 ⇒ 生成時已保證走另一側）；端點不得在機關
    // 調色盤分組：過同一座橋的兩條線同組
    var cross = [];
    for (k = 0; k < bridges.length; k++) {
      var bc = bridges[k][1] * w + bridges[k][0];
      var ow = cellOwner[bc];
      if (ow.length !== 2) return null;
      var pa = -1, pb = -1;
      for (var t2 = 0; t2 < P.length; t2++) { if (PC[t2].indexOf(bc) >= 0) { if (pa < 0) pa = t2; else pb = t2; } }
      if (pb >= 0) cross.push([pa, pb]);
    }
    var group = assignGroups(P.length, cross, R);
    if (!group) return null;
    return { w: w, h: h, bridges: bridges, gates: gates, mirrors: mirrors, paths: PC, group: group };
  }
  // 把 n 條線分到 4 組 × 2 色；cross 的兩條必須同組
  function assignGroups(n, cross, R) {
    var gid = [], i, slots = [];
    for (i = 0; i < n; i++) gid.push(-1);
    for (i = 0; i < PAL_GROUPS; i++) slots.push(0);
    for (i = 0; i < cross.length; i++) {
      var a = cross[i][0], b = cross[i][1];
      if (gid[a] >= 0 || gid[b] >= 0) {
        if (gid[a] >= 0 && gid[b] >= 0 && gid[a] === gid[b]) continue;
        return null;
      }
      var g = -1;
      for (var j = 0; j < PAL_GROUPS; j++) if (slots[j] === 0) { g = j; break; }
      if (g < 0) return null;
      gid[a] = g; gid[b] = g; slots[g] = 2;
    }
    var order = [];
    for (i = 0; i < n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) { var r = Math.floor(R() * (i + 1)), t = order[i]; order[i] = order[r]; order[r] = t; }
    for (var o = 0; o < n; o++) {
      i = order[o];
      if (gid[i] >= 0) continue;
      var best = -1;
      for (var k = 0; k < PAL_GROUPS; k++) if (slots[k] < PER_PAL && (best < 0 || slots[k] < slots[best])) best = k;
      if (best < 0) return null;
      gid[i] = best; slots[best]++;
    }
    // 組內第幾色
    var used = [0, 0, 0, 0], color = [];
    for (i = 0; i < n; i++) { color.push(gid[i] * PER_PAL + used[gid[i]]); used[gid[i]]++; }
    return color;
  }

  function toLevel(part) {
    // 依顏色編號排序（顏色 = 調色盤組 × 2 + 組內序）
    var n = part.paths.length, w = part.w, byColor = [], i;
    for (i = 0; i < n; i++) byColor.push({ c: part.group[i], cells: part.paths[i] });
    byColor.sort(function (a, b) { return a.c - b.c; });
    var ends = [], colors = [];
    for (i = 0; i < n; i++) {
      var cs = byColor[i].cells, a = cs[0], b = cs[cs.length - 1];
      ends.push([a % w, (a / w) | 0, b % w, (b / w) | 0]);
      colors.push(byColor[i].c);
    }
    var L = { w: part.w, h: part.h, ends: ends, colors: colors, bridges: part.bridges, gates: part.gates };
    if (part.mirrors && part.mirrors.length) L.mirrors = part.mirrors;
    return L;
  }

  function generate(spec, seed, maxTries) {
    var R = rng(seed), tries = 0;
    maxTries = maxTries || 3000;
    while (tries++ < maxTries) {
      var part = tryPartition(spec, R);
      if (!part) continue;
      var L = toLevel(part);
      var r = solve(L, 2, 400000);
      if (r.count === 1 && !r.aborted) { L.seed = seed; L.tries = tries; return L; }
    }
    return null;
  }

  /* ---------------- 關卡字串（levels.js 用）：'WxH|ends|colors|bridges|gates[|mirrors]' ---------------- */
  function encode(L) {
    function flat(a) { return a.map(function (q) { return q.join(','); }).join(';'); }
    var s = L.w + 'x' + L.h + '|' + flat(L.ends) + '|' + L.colors.join(',') + '|' + flat(L.bridges || []) + '|' + flat(L.gates || []);
    if (L.mirrors && L.mirrors.length) s += '|' + flat(L.mirrors);
    return s;
  }
  function decode(s) {
    var p = s.split('|'), wh = p[0].split('x');
    function arr(t) { return t ? t.split(';').map(function (q) { return q.split(',').map(Number); }) : []; }
    return { w: +wh[0], h: +wh[1], ends: arr(p[1]), colors: p[2] ? p[2].split(',').map(Number) : [], bridges: arr(p[3]), gates: arr(p[4]), mirrors: arr(p[5]) };
  }

  LN.Gen = { rng: rng, build: build, MIR_PAIRS: MIR_PAIRS, mirPartner: mirPartner, solve: solve, generate: generate, encode: encode, decode: decode,
             assignGroups: assignGroups, PAL_GROUPS: PAL_GROUPS, PER_PAL: PER_PAL, MAX_COLORS: MAX_COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = LN.Gen;
})(typeof window !== 'undefined' ? window : globalThis);
