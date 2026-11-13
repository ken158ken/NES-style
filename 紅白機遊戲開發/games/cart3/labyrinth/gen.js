/*
 * games/cart3/labyrinth/gen.js — 《星塵迷宮探索 STARDUST LABYRINTH》樓層產生器 + 驗證器 + 解題器（純資料，無 PPU）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-4 cart3-maze（R7）｜ 依賴：無（CT.Labyrinth.Gen）
 * 舊作概念來源：legacy/ken-ai-webgames/maze-game.html（只取「程序產生迷宮 + 收集物 + 計時 + 逐關變大」玩法）
 *
 * 格子（W×H 皆奇數；房間在 (奇, 奇)，房間之間的連接格「一軸偶數」）：
 *   WALL / FLOOR / KEY 鑰匙 / DOOR 鎖門（任一把鑰匙開一扇，開了就永久打開）/ SWITCH 日月開關（踩上去切換）/
 *   GATE_A 日門（開關 = 1 時開）/ GATE_B 月門（開關 = 0 時開）/ SHIFT0 SHIFT1 潮汐牆（兩組輪流升降，計時）/
 *   EXIT 出口 / SHARD 星屑（收集，星等用）/ LAMP 星燈（照明半徑變大）
 *
 * 產生（固定種子 ⇒ 每層都一樣）：
 *   ① 遞迴回溯挖出完美迷宮（樹）→ ② 起點 = 隨機角落房、出口 = 離起點最遠的房 →
 *   ③ 在「起點→出口」的路徑上挑連接格當關卡點（鎖門 / 日月門；樹上的邊 = 割點，繞不過去）→
 *   ④ 以關卡點切成區（zone 0..n）；只在「同一區內」打通額外迴圈（不會繞過關卡點）→
 *   ⑤ 第 i 個關卡點的鑰匙 / 開關放在 zone i-1 最深的死路 → ⑥ 星屑 / 星燈 / 潮汐牆 →
 *   ⑦ 驗證器全狀態 BFS（格 × 開關 × 已開門 × 已撿鑰匙）：
 *       a. 出口可達；b. **無死局**：任一可達狀態都還能走到出口；c. 任一可達狀態都還能走到每顆星屑（3 星不會被鎖死）。
 *     沒過就換下一個 attempt 種子重來（attempt 也固定 ⇒ 結果可重現）。
 *   潮汐牆在驗證器裡視為可通過（它會週期性打開；遊戲裡「有人站著就延後升起」，不會把人夾住）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var L = CT.Labyrinth = CT.Labyrinth || {};

  var T = { WALL: 0, FLOOR: 1, KEY: 2, DOOR: 3, SWITCH: 4, GATE_A: 5, GATE_B: 6, SHIFT0: 7, SHIFT1: 8, EXIT: 9, SHARD: 10, LAMP: 11 };
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  /* 9 層固定種子（主題 0 星苔洞窟 / 1 餘燼窯 / 2 虛空花園）。r1 / r2 = 明亮 / 微光半徑（px）；fix-r7-maze：最小 32 / 48（F7~F9 原 28 / 24） */
  var FLOORS = [
    { n: 1, name: 'GLOW GROTTO', w: 15, h: 11, doors: 0, gates: 0, shift: 0, shards: 3, loops: 2, lamp: 0, r1: 40, r2: 56, theme: 0, seed: 1101 },
    { n: 2, name: 'ECHO HALL', w: 19, h: 13, doors: 1, gates: 0, shift: 0, shards: 3, loops: 3, lamp: 0, r1: 40, r2: 56, theme: 0, seed: 2202 },
    { n: 3, name: 'TWIN LOCKS', w: 23, h: 15, doors: 1, gates: 1, shift: 0, shards: 4, loops: 4, lamp: 0, r1: 36, r2: 52, theme: 0, seed: 3303 },
    { n: 4, name: 'EMBER STAIR', w: 25, h: 17, doors: 1, gates: 0, shift: 4, shards: 4, loops: 5, lamp: 0, r1: 36, r2: 52, theme: 1, seed: 4404 },
    { n: 5, name: 'SHIFTING KILN', w: 27, h: 19, doors: 1, gates: 1, shift: 6, shards: 4, loops: 6, lamp: 1, r1: 32, r2: 48, theme: 1, seed: 5505 },
    { n: 6, name: 'ASH VAULT', w: 29, h: 21, doors: 2, gates: 1, shift: 6, shards: 5, loops: 7, lamp: 1, r1: 32, r2: 48, theme: 1, seed: 6606 },
    { n: 7, name: 'VOID GARDEN', w: 31, h: 23, doors: 2, gates: 2, shift: 8, shards: 5, loops: 8, lamp: 1, r1: 32, r2: 48, theme: 2, seed: 7707 },
    { n: 8, name: 'STAR SPINE', w: 31, h: 23, doors: 3, gates: 2, shift: 10, shards: 5, loops: 8, lamp: 1, r1: 32, r2: 48, theme: 2, seed: 8808 },
    { n: 9, name: 'HEART OF NIGHT', w: 31, h: 23, doors: 3, gates: 3, shift: 12, shards: 6, loops: 9, lamp: 1, r1: 32, r2: 48, theme: 2, seed: 9909 }
  ];
  // 隨機模式（?seed= / 標題 RANDOM）：用第 7~9 層的參數輪替
  function randomSpec(seed) {
    var b = FLOORS[6 + (seed % 3 + 3) % 3], s = {};
    for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) s[k] = b[k];
    s.n = 0; s.name = 'RANDOM ' + ('00000' + (seed % 100000)).slice(-5); s.seed = seed; s.theme = seed % 3;
    return s;
  }

  /* ---------------- 亂數（xorshift32，種子先雜湊） ---------------- */
  function rng(seed) {
    var s = (Math.imul((seed | 0) ^ 0x5bd1e995, 2654435761) ^ 0x9E3779B9) | 0;
    if (s === 0) s = 1;
    var f = function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    f.i = function (n) { return n > 0 ? f() % n : 0; };
    return f;
  }
  function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = r.i(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- 基本工具 ---------------- */
  function bfs(W, H, src, pass) {
    var N = W * H, dist = new Int16Array(N).fill(-1), par = new Int32Array(N).fill(-1), q = new Int32Array(N), h = 0, t = 0;
    dist[src] = 0; q[t++] = src;
    while (h < t) {
      var c = q[h++], x = c % W, y = (c / W) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx;
        if (dist[n] >= 0 || !pass(n)) continue;
        dist[n] = dist[c] + 1; par[n] = c; q[t++] = n;
      }
    }
    return { dist: dist, par: par };
  }
  function carve(W, H, r) {
    var g = new Uint8Array(W * H), RW = (W - 1) >> 1, RH = (H - 1) >> 1, vis = new Uint8Array(RW * RH), stack = [0];
    vis[0] = 1; g[1 * W + 1] = T.FLOOR;
    while (stack.length) {
      var top = stack[stack.length - 1], rx = top % RW, ry = (top / RW) | 0, opts = [];
      for (var d = 0; d < 4; d++) {
        var nx = rx + DX[d], ny = ry + DY[d];
        if (nx >= 0 && ny >= 0 && nx < RW && ny < RH && !vis[ny * RW + nx]) opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      var dd = opts[r.i(opts.length)], ax = rx + DX[dd], ay = ry + DY[dd];
      vis[ay * RW + ax] = 1;
      g[(2 * ry + 1 + DY[dd]) * W + (2 * rx + 1 + DX[dd])] = T.FLOOR;
      g[(2 * ay + 1) * W + (2 * ax + 1)] = T.FLOOR;
      stack.push(ay * RW + ax);
    }
    return g;
  }
  function isRoom(W, c) { var x = c % W, y = (c / W) | 0; return (x & 1) === 1 && (y & 1) === 1; }
  function nbrs(W, H, c) {
    var x = c % W, y = (c / W) | 0, out = [];
    for (var d = 0; d < 4; d++) { var nx = x + DX[d], ny = y + DY[d]; if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx); }
    return out;
  }

  /* ---------------- 產生一層 ---------------- */
  function build(spec, attempt) {
    var W = spec.w, H = spec.h, N = W * H, r = rng(spec.seed * 131 + attempt * 7919 + 17);
    var g = carve(W, H, r);
    var corners = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]], sc = corners[r.i(4)];
    var start = sc[1] * W + sc[0];
    var b0 = bfs(W, H, start, function (n) { return g[n] !== T.WALL; });
    var exit = -1, best = -1, c;
    for (c = 0; c < N; c++) if (isRoom(W, c) && b0.dist[c] > best) { best = b0.dist[c]; exit = c; }
    var path = [];
    for (c = exit; c >= 0; c = b0.par[c]) path.unshift(c);
    var onPath = new Uint8Array(N);
    path.forEach(function (p) { onPath[p] = 1; });

    // ③ 關卡點（鎖門 / 日月門）
    var nCut = spec.doors + spec.gates, cuts = [], used = new Uint8Array(N);
    var types = [];
    for (var i = 0; i < spec.doors; i++) types.push('D');
    for (i = 0; i < spec.gates; i++) types.push('G');
    shuffle(types, r);
    for (var k = 1; k <= nCut; k++) {
      var target = Math.floor(path.length * k / (nCut + 1)) + r.i(5) - 2, bi = -1, bd = 1e9;
      for (i = 4; i < path.length - 4; i++) {
        if (isRoom(W, path[i])) continue;
        var ok = true;
        for (var j = 0; j < cuts.length; j++) if (Math.abs(cuts[j].pi - i) < 5) ok = false;
        if (!ok) continue;
        if (Math.abs(i - target) < bd) { bd = Math.abs(i - target); bi = i; }
      }
      if (bi < 0) return null;
      cuts.push({ pi: bi, c: path[bi] });
    }
    cuts.sort(function (a, b) { return a.pi - b.pi; });
    var gateN = 0;
    cuts.forEach(function (ct, ci) {
      ct.type = types[ci];
      if (ct.type === 'G') { ct.gate = (gateN++ & 1) ? 'B' : 'A'; }
      used[ct.c] = 1;
    });
    var isCut = new Int8Array(N).fill(-1);
    cuts.forEach(function (ct, ci) { isCut[ct.c] = ci; });

    // ④ 分區
    var zone = new Int8Array(N).fill(-1);
    function label(src, z) {
      var bb = bfs(W, H, src, function (n) { return g[n] !== T.WALL && isCut[n] < 0 && zone[n] < 0; });
      for (var q = 0; q < N; q++) if (bb.dist[q] >= 0) zone[q] = z;
      return bb;
    }
    var zoneEntry = [start], zoneDist = [label(start, 0).dist];
    cuts.forEach(function (ct, ci) {
      var nx = path[ct.pi + 1];
      zoneEntry.push(nx);
      zoneDist.push(label(nx, ci + 1).dist);
    });
    // 迴圈：只打通同一區、兩側都是普通地板的連接牆
    var cand = [];
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      c = y * W + x;
      if (g[c] !== T.WALL || ((x & 1) === (y & 1))) continue;
      var a = (x & 1) ? c - W : c - 1, bcell = (x & 1) ? c + W : c + 1;
      if (g[a] === T.WALL || g[bcell] === T.WALL) continue;
      if (zone[a] < 0 || zone[a] !== zone[bcell]) continue;
      cand.push(c);
    }
    shuffle(cand, r);
    for (i = 0; i < cand.length && i < spec.loops; i++) {
      c = cand[i]; g[c] = T.FLOOR;
      var xx = c % W, a2 = (xx & 1) ? c - W : c - 1;
      zone[c] = zone[a2];
    }
    // 重新算每區從入口起的距離（迴圈會改變）
    for (var z = 0; z <= nCut; z++) {
      zoneDist[z] = bfs(W, H, zoneEntry[z], function (n) { return g[n] !== T.WALL && zone[n] === z; }).dist;
    }

    // 死路
    function degree(cc) { var d = 0; nbrs(W, H, cc).forEach(function (n) { if (g[n] !== T.WALL) d++; }); return d; }
    var dead = [];
    for (c = 0; c < N; c++) if (g[c] === T.FLOOR && c !== start && c !== exit && isCut[c] < 0 && degree(c) === 1) dead.push(c);
    function pick(z, avoidPath) {
      var bc = -1, bdist = -1;
      dead.forEach(function (dc) {
        if (used[dc] || zone[dc] !== z) return;
        if (avoidPath && onPath[dc]) return;
        if (zoneDist[z][dc] > bdist) { bdist = zoneDist[z][dc]; bc = dc; }
      });
      if (bc < 0) {        // 沒有死路就挑該區離入口最遠、不在主路上的房間
        for (var q = 0; q < N; q++) {
          if (used[q] || zone[q] !== z || g[q] !== T.FLOOR || !isRoom(W, q) || q === start || q === exit || onPath[q]) continue;
          if (zoneDist[z][q] > bdist) { bdist = zoneDist[z][q]; bc = q; }
        }
      }
      if (bc >= 0) used[bc] = 1;
      return bc;
    }
    used[start] = 1; used[exit] = 1;
    var keys = [], doors = [], switches = [], gates = [];
    for (var ci2 = 0; ci2 < cuts.length; ci2++) {
      var ct2 = cuts[ci2], item = pick(ci2, true);
      if (item < 0) return null;
      if (ct2.type === 'D') { g[ct2.c] = T.DOOR; doors.push(ct2.c); g[item] = T.KEY; keys.push(item); }
      else { g[ct2.c] = ct2.gate === 'A' ? T.GATE_A : T.GATE_B; gates.push(ct2.c); g[item] = T.SWITCH; switches.push(item); }
    }
    // 星屑：各區輪流挑剩下的死路
    var shards = [], lamp = -1, freeDead = shuffle(dead.filter(function (dc) { return !used[dc]; }), r);
    for (i = 0; i < freeDead.length && shards.length < spec.shards; i++) { used[freeDead[i]] = 1; g[freeDead[i]] = T.SHARD; shards.push(freeDead[i]); }
    if (shards.length < spec.shards) {
      for (c = 0; c < N && shards.length < spec.shards; c++) {
        if (!used[c] && g[c] === T.FLOOR && isRoom(W, c) && !onPath[c]) { used[c] = 1; g[c] = T.SHARD; shards.push(c); }
      }
    }
    if (shards.length < spec.shards) return null;
    if (spec.lamp) {
      for (c = 0; c < N && lamp < 0; c++) if (!used[c] && g[c] === T.FLOOR && isRoom(W, c) && zone[c] === 0 && !onPath[c] && b0.dist[c] > 6) lamp = c;
      if (lamp < 0) for (c = 0; c < N && lamp < 0; c++) if (!used[c] && g[c] === T.FLOOR && isRoom(W, c) && zone[c] <= 1 && c !== start) lamp = c;
      if (lamp >= 0) { used[lamp] = 1; g[lamp] = T.LAMP; }
    }
    // 潮汐牆：普通連接格（兩側地板、不在特殊格旁、離起點 ≥ 3）
    var sc2 = [], shifts = [];
    for (c = 0; c < N; c++) {
      if (g[c] !== T.FLOOR || isRoom(W, c) || used[c] || b0.dist[c] < 3) continue;
      var bad = false;
      nbrs(W, H, c).forEach(function (n) { if (g[n] !== T.WALL && g[n] !== T.FLOOR) bad = true; if (n === start) bad = true; });
      if (!bad) sc2.push(c);
    }
    shuffle(sc2, r);
    for (i = 0; i < sc2.length && shifts.length < spec.shift; i++) {
      var tooClose = false;
      for (j = 0; j < shifts.length; j++) {
        var s0 = shifts[j].c;
        if (Math.abs(s0 % W - sc2[i] % W) + Math.abs(((s0 / W) | 0) - ((sc2[i] / W) | 0)) < 3) tooClose = true;
      }
      if (tooClose) continue;
      var ph = shifts.length & 1;
      g[sc2[i]] = ph ? T.SHIFT1 : T.SHIFT0;
      shifts.push({ c: sc2[i], ph: ph });
      used[sc2[i]] = 1;
    }
    g[exit] = T.EXIT;
    var lv = {
      spec: spec, W: W, H: H, grid: g, start: start, exit: exit, keys: keys, doors: doors, switches: switches, gates: gates,
      shifts: shifts, shards: shards, lamp: lamp, attempt: attempt, pathLen: path.length, cuts: cuts.length
    };
    return lv;
  }

  /* ---------------- 規則（遊戲與驗證器共用）：從狀態 (sw, dm, km) 走進格子 n ---------------- */
  // 回傳 null = 不能走；否則 {sw, dm, km}（走進去之後的狀態）
  function popc(v) { var n = 0; while (v) { n += v & 1; v >>= 1; } return n; }
  function enterRule(lv, n, sw, dm, km, kIdx, dIdx) {
    var t = lv.grid[n];
    if (t === T.WALL) return null;
    if (t === T.GATE_A && sw !== 1) return null;
    if (t === T.GATE_B && sw !== 0) return null;
    if (t === T.DOOR) {
      var di = dIdx[n];
      if (!(dm & (1 << di))) {
        if (popc(km) - popc(dm) <= 0) return null;
        dm |= 1 << di;
      }
    }
    if (t === T.KEY) km |= 1 << kIdx[n];
    if (t === T.SWITCH) sw ^= 1;
    return { sw: sw, dm: dm, km: km };
  }
  function indexMaps(lv) {
    var N = lv.W * lv.H, k = new Int8Array(N).fill(-1), d = new Int8Array(N).fill(-1);
    lv.keys.forEach(function (c, i) { k[c] = i; });
    lv.doors.forEach(function (c, i) { d[c] = i; });
    return { k: k, d: d };
  }

  /* ---------------- 驗證器：全狀態 BFS + 反向可達（無死局） ---------------- */
  function space(lv) {
    var N = lv.W * lv.H, DM = 1 << lv.doors.length, KM = 1 << lv.keys.length;
    return { N: N, DM: DM, KM: KM, S: N * 2 * DM * KM };
  }
  function enc(sp, c, sw, dm, km) { return ((c * 2 + sw) * sp.DM + dm) * sp.KM + km; }
  function dec(sp, s) { var km = s % sp.KM; s = (s - km) / sp.KM; var dm = s % sp.DM; s = (s - dm) / sp.DM; var sw = s & 1; return { c: (s - sw) / 2, sw: sw, dm: dm, km: km }; }
  // 從 s0 起 BFS；回傳 {seen(Int32 dist), par, order(拜訪順序), edges(4 個/狀態)}
  function explore(lv, s0, wantEdges) {
    var sp = space(lv), im = indexMaps(lv), W = lv.W, H = lv.H;
    var dist = new Int32Array(sp.S).fill(-1), par = new Int32Array(sp.S).fill(-1), q = new Int32Array(sp.S), h = 0, t = 0;
    var edges = wantEdges ? new Int32Array(sp.S * 4).fill(-1) : null;
    dist[s0] = 0; q[t++] = s0;
    while (h < t) {
      var s = q[h++], st = dec(sp, s), x = st.c % W, y = (st.c / W) | 0;
      if (lv.grid[st.c] === T.EXIT && s !== s0) continue;           // 到出口就結束這一層（不再往外走）
      for (var d = 0; d < 4; d++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx, e = enterRule(lv, n, st.sw, st.dm, st.km, im.k, im.d);
        if (!e) continue;
        var ns = enc(sp, n, e.sw, e.dm, e.km);
        if (edges) edges[s * 4 + d] = ns;
        if (dist[ns] >= 0) continue;
        dist[ns] = dist[s] + 1; par[ns] = s; q[t++] = ns;
      }
    }
    return { sp: sp, dist: dist, par: par, order: q.subarray(0, t), edges: edges };
  }
  // 反向可達：哪些（已拜訪的）狀態能走到「格子 ∈ targets」
  function canReach(ex, isTarget) {
    var sp = ex.sp, ord = ex.order, n = ord.length, i, d;
    // 反向鄰接（counting sort）
    var cnt = new Int32Array(sp.S + 1);
    for (i = 0; i < n; i++) for (d = 0; d < 4; d++) { var to = ex.edges[ord[i] * 4 + d]; if (to >= 0) cnt[to + 1]++; }
    for (i = 1; i <= sp.S; i++) cnt[i] += cnt[i - 1];
    var radj = new Int32Array(cnt[sp.S]), fillp = cnt.slice(0, sp.S);
    for (i = 0; i < n; i++) for (d = 0; d < 4; d++) { var t2 = ex.edges[ord[i] * 4 + d]; if (t2 >= 0) radj[fillp[t2]++] = ord[i]; }
    var good = new Uint8Array(sp.S), q = new Int32Array(n + 1), h = 0, t = 0;
    for (i = 0; i < n; i++) if (isTarget(dec(sp, ord[i]).c)) { good[ord[i]] = 1; q[t++] = ord[i]; }
    while (h < t) {
      var s = q[h++];
      for (var k = cnt[s]; k < cnt[s + 1]; k++) { var p = radj[k]; if (!good[p]) { good[p] = 1; q[t++] = p; } }
    }
    var bad = 0;
    for (i = 0; i < n; i++) if (!good[ord[i]]) bad++;
    return { bad: bad, good: good };
  }
  function verify(lv) {
    var sp = space(lv), s0 = enc(sp, lv.start, 0, 0, 0), ex = explore(lv, s0, true);
    var steps = -1, i;
    for (i = 0; i < ex.order.length; i++) { var st = dec(sp, ex.order[i]); if (st.c === lv.exit) { steps = ex.dist[ex.order[i]]; break; } }
    var rExit = canReach(ex, function (c) { return c === lv.exit; });
    var shardBad = 0, shardUnreach = 0;
    lv.shards.concat(lv.lamp >= 0 ? [lv.lamp] : []).forEach(function (sc) {
      // 出口狀態本身不算（踏上出口就結束這層；星屑要在那之前撿）
      var rr = canReach(ex, function (c) { return c === sc; });
      var cnt = 0;
      for (var k = 0; k < ex.order.length; k++) { var ss = ex.order[k], c = dec(sp, ss).c; if (c === lv.exit) continue; if (!rr.good[ss]) cnt++; }
      shardBad += cnt;
      if (cnt === ex.order.length) shardUnreach++;
    });
    return {
      ok: steps > 0 && rExit.bad === 0 && shardBad === 0,
      steps: steps, states: ex.order.length, softlock: rExit.bad, shardLock: shardBad, shardUnreach: shardUnreach
    };
  }
  // 解題器：從目前狀態到出口的最短格子序列（第 0 個 = 目前格）
  function solve(lv, c, sw, dm, km, targetCell) {
    var sp = space(lv), s0 = enc(sp, c, sw, dm, km), ex = explore(lv, s0, false), goal = -1, tgt = targetCell === undefined ? lv.exit : targetCell;
    for (var i = 0; i < ex.order.length; i++) if (dec(sp, ex.order[i]).c === tgt) { goal = ex.order[i]; break; }
    if (goal < 0) return null;
    var cells = [];
    for (var s = goal; s >= 0; s = ex.par[s]) cells.unshift(dec(sp, s).c);
    return cells;
  }

  var cache = {};
  function make(spec) {
    var key = spec.seed + ':' + spec.w + 'x' + spec.h + ':' + spec.n;
    if (cache[key]) return cache[key];
    for (var a = 0; a < 80; a++) {
      var lv = build(spec, a);
      if (!lv) continue;
      var v = verify(lv);
      if (!v.ok) continue;
      lv.verify = v;
      // 標準時間：最短步數 × 每格 5.33 幀 × 2.5（探索係數）+ 每個機關 8 秒 + 10 秒
      lv.par = Math.ceil(v.steps * 5.34 * 2.5 / 60) + 8 * (lv.keys.length + lv.switches.length) + 10;
      cache[key] = lv;
      return lv;
    }
    return null;
  }

  L.Gen = {
    T: T, FLOORS: FLOORS, DX: DX, DY: DY,
    rng: rng, build: build, verify: verify, solve: solve, make: make, randomSpec: randomSpec,
    enterRule: enterRule, indexMaps: indexMaps, popc: popc,
    floor: function (n) { return make(FLOORS[n - 1]); },
    random: function (seed) { return make(randomSpec(seed | 0)); }
  };
})();
