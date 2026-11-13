/*
 * games/cart5/escape/logic.js — 《星塵密室》謎題規則引擎 + 解題器（R9 C9-4 cart5-escape）
 * ---------------------------------------------------------------------------
 * 純邏輯（不碰 PPU）：讀 text_rooms.js 的宣告式資料。
 *   CT.Escape.Logic = {
 *     newState(room) → {f:{旗標}, inv:[物品…]}, cond(st, c), apply(st, acts) → {opened, won},
 *     click(room, st, hotId, item) → {rule, d, s} | null, combo(room, a, b), visible(room, st, hot),
 *     step(room, st) → 目前卡住的環節索引, actions(room, st) → 抽象動作清單, solve(room, st) → 最短動作路徑,
 *     Dial / Lights / Rings / Pipes：各機關的規則與解法（機器人用；測試另有 Python 獨立實作）
 *   }
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var E = CT.Escape = CT.Escape || {};

  /* ============================================================ 狀態 / 條件 / 動作 */
  function newState() { return { f: {}, inv: [] }; }
  function clone(st) { var f = {}, k; for (k in st.f) if (st.f[k]) f[k] = 1; return { f: f, inv: st.inv.slice() }; }
  function has(st, x) { return st.inv.indexOf(x) >= 0; }
  function flag(st, k) {
    if (k.indexOf('has_') === 0) return has(st, k.substring(4));
    return !!st.f[k];
  }
  function cond(st, c) {
    if (!c) return true;
    var parts = String(c).split('&');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var neg = p.charAt(0) === '!';
      var v = flag(st, neg ? p.substring(1) : p);
      if (neg ? v : !v) return false;
    }
    return true;
  }
  // 套用動作；回傳 {opened: 機關 id 或 null, won: bool, got: [新物品]}
  function apply(st, acts) {
    var out = { opened: null, won: false, got: [] };
    (acts || []).forEach(function (a) {
      var i = a.indexOf(':'), op = i < 0 ? a : a.substring(0, i), arg = i < 0 ? '' : a.substring(i + 1);
      if (op === 'set') st.f[arg] = 1;
      else if (op === 'clr') delete st.f[arg];
      else if (op === 'get') { if (!has(st, arg)) { st.inv.push(arg); out.got.push(arg); } st.f['got_' + arg] = 1; }
      else if (op === 'lose') { var k = st.inv.indexOf(arg); if (k >= 0) st.inv.splice(k, 1); }
      else if (op === 'open') out.opened = arg;
      else if (op === 'win') { st.f.won = 1; out.won = true; }
    });
    return out;
  }
  function visible(room, st, h) { return !h.show || cond(st, h.show); }
  function hot(room, id) { for (var i = 0; i < room.hot.length; i++) if (room.hot[i].id === id) return room.hot[i]; return null; }
  // 點一個熱點（item = 手上的物品 id 或 null）→ 第一條符合的規則
  function click(room, st, hotId, item) {
    var h = hot(room, hotId);
    if (!h || !visible(room, st, h)) return null;
    var rs = h.rules || [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if ((r.i || null) !== (item || null)) continue;
      if (!cond(st, r.c)) continue;
      return { rule: r, d: r.d || [], s: r.s || null };
    }
    return { rule: null, d: [], s: item ? null : (h.l || null), none: true };
  }
  function combo(room, a, b) {
    var cs = room.combos || [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) return c;
    }
    return null;
  }
  // 目前卡住的環節（第一個 done 不成立的）
  function step(room, st) {
    for (var i = 0; i < room.steps.length; i++) if (!cond(st, room.steps[i].done)) return i;
    return room.steps.length;
  }
  function key(st) {
    var f = Object.keys(st.f).filter(function (k) { return st.f[k]; }).sort().join(',');
    return f + '|' + st.inv.slice().sort().join(',');
  }

  /* ============================================================ 抽象動作 / 解題器（BFS） */
  // 一個動作：{t:'hot', h, i} 或 {t:'combo', a, b}；開機關 = 直接套用機關的解開動作（機關本身可解另外驗證）
  function actions(room, st) {
    var out = [];
    room.hot.forEach(function (h) {
      if (!visible(room, st, h)) return;
      [null].concat(st.inv).forEach(function (it) {
        var r = click(room, st, h.id, it);
        if (!r || !r.rule || !r.d.length) return;
        // 撥盤鎖：要先看過線索才「推得出」答案（know）
        var op = r.d.filter(function (a) { return a.indexOf('open:') === 0; })[0];
        if (op) { var pz = room.puz[op.substring(5)]; if (pz && pz.know && !cond(st, pz.know)) return; }
        out.push({ t: 'hot', h: h.id, i: it, v: h.v });
      });
    });
    for (var x = 0; x < st.inv.length; x++) for (var y = x + 1; y < st.inv.length; y++) {
      var c = combo(room, st.inv[x], st.inv[y]);
      if (c && cond(st, c.c)) out.push({ t: 'combo', a: st.inv[x], b: st.inv[y] });
    }
    return out;
  }
  function doAction(room, st, a) {
    var s2 = clone(st), r;
    if (a.t === 'combo') { r = apply(s2, combo(room, a.a, a.b).d); }
    else {
      r = apply(s2, click(room, s2, a.h, a.i).d);
      if (r.opened && room.puz[r.opened] && room.puz[r.opened].kind !== 'look') {
        var r2 = apply(s2, room.puz[r.opened].d);
        r.won = r.won || r2.won;
      }
    }
    return s2;
  }
  // 最短路徑（從 st 到 won）；回傳動作陣列或 null
  function solve(room, st) {
    st = st || newState();
    var k0 = key(st), prev = {}, seen = {}, q = [st], qa = [];
    seen[k0] = 1;
    while (q.length) {
      var cur = q.shift(), ck = key(cur);
      if (cur.f.won) {
        var path = [], k = ck;
        while (prev[k]) { path.unshift(prev[k].a); k = prev[k].k; }
        return path;
      }
      var acts = actions(room, cur);
      for (var i = 0; i < acts.length; i++) {
        var nx = doAction(room, cur, acts[i]), nk = key(nx);
        if (seen[nk]) continue;
        // 沒有改變狀態的動作（例如重看線索）不算
        if (nk === ck) continue;
        seen[nk] = 1; prev[nk] = { k: ck, a: acts[i] }; q.push(nx);
      }
    }
    return null;
  }
  // 全狀態空間：{states, winnable 全部可達狀態都能到 won, dead[]}
  function explore(room) {
    var st = newState(), all = {}, edges = {}, q = [st], k0 = key(st);
    all[k0] = st;
    while (q.length) {
      var cur = q.shift(), ck = key(cur);
      edges[ck] = [];
      if (cur.f.won) continue;
      actions(room, cur).forEach(function (a) {
        var nx = doAction(room, cur, a), nk = key(nx);
        if (nk === ck) return;
        edges[ck].push(nk);
        if (!all[nk]) { all[nk] = nx; q.push(nx); }
      });
    }
    var good = {}, changed = true, ks = Object.keys(all);
    ks.forEach(function (k) { if (all[k].f.won) good[k] = 1; });
    while (changed) {
      changed = false;
      ks.forEach(function (k) {
        if (good[k]) return;
        if (edges[k].some(function (n) { return good[n]; })) { good[k] = 1; changed = true; }
      });
    }
    var dead = ks.filter(function (k) { return !good[k]; });
    return { states: ks.length, dead: dead, winnable: dead.length === 0 };
  }

  /* ============================================================ 機關：撥盤鎖 */
  var Dial = {
    chars: function (p) { return Array.from ? Array.from(p.chars) : p.chars.split(''); },
    check: function (p, vals) { return vals.join('') === p.ans; },
    // 從 cur（字元陣列）走到答案的按鍵序列（↑ = 下一個字、↓ = 上一個字、→ 換位、A 確認）
    plan: function (p, cur, sel) {
      var C = Dial.chars(p), ans = Array.from ? Array.from(p.ans) : p.ans.split(''), out = [], s = sel | 0;
      for (var i = 0; i < p.n; i++) {
        var a = C.indexOf(cur[i]), b = C.indexOf(ans[i]);
        if (a === b) continue;
        while (s < i) { out.push('R'); s++; }
        while (s > i) { out.push('L'); s--; }
        var up = (b - a + C.length) % C.length, dn = (a - b + C.length) % C.length;
        for (var k = 0; k < Math.min(up, dn); k++) out.push(up <= dn ? 'U' : 'D');
      }
      out.push('A');
      return out;
    }
  };

  /* ============================================================ 機關：九燈開關（按一顆 = 自己 + 上下左右切換） */
  var Lights = {
    press: function (p, s, i) {
      var w = p.w, h = p.h, x = i % w, y = (i / w) | 0;
      s[i] ^= 1;
      if (x > 0) s[i - 1] ^= 1; if (x < w - 1) s[i + 1] ^= 1;
      if (y > 0) s[i - w] ^= 1; if (y < h - 1) s[i + w] ^= 1;
      return s;
    },
    done: function (s) { for (var i = 0; i < s.length; i++) if (!s[i]) return false; return true; },
    // 最少按法（暴力 2^(w·h)，9 燈 = 512）
    solve: function (p, s) {
      var n = p.w * p.h, best = null;
      for (var m = 0; m < (1 << n); m++) {
        var t = s.slice(), cnt = 0, i;
        for (i = 0; i < n; i++) if (m & (1 << i)) { Lights.press(p, t, i); cnt++; }
        if (Lights.done(t) && (!best || cnt < best.length)) { best = []; for (i = 0; i < n; i++) if (m & (1 << i)) best.push(i); }
      }
      return best;
    }
  };

  /* ============================================================ 機關：太陽系儀（按鈕同時轉兩圈 +1） */
  var Rings = {
    press: function (p, s, b) { p.btn[b].forEach(function (r) { s[r] = (s[r] + 1) % p.m; }); return s; },
    done: function (s) { for (var i = 0; i < s.length; i++) if (s[i]) return false; return true; },
    solve: function (p, s) {          // 每顆按鈕 0..m-1 次，找總次數最少的組合
      var best = null, nb = p.btn.length, tot = Math.pow(p.m, nb);
      for (var c = 0; c < tot; c++) {
        var cnt = [], x = c, sum = 0, t = s.slice(), b, k;
        for (b = 0; b < nb; b++) { cnt.push(x % p.m); x = (x / p.m) | 0; sum += cnt[b]; }
        if (best && sum >= best.sum) continue;
        for (b = 0; b < nb; b++) for (k = 0; k < cnt[b]; k++) Rings.press(p, t, b);
        if (Rings.done(t)) best = { cnt: cnt, sum: sum };
      }
      return best ? best.cnt : null;
    }
  };

  /* ============================================================ 機關：管線 / 光路（I 直管 2 向、L 彎管 4 向） */
  // 方位 0 上 1 右 2 下 3 左
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var Pipes = {
    parse: function (p) { return p.cells.map(function (c) { return { t: c.charAt(0), r: +c.charAt(1) }; }); },
    mod: function (t) { return t === 'I' ? 2 : 4; },
    open: function (t, r) {          // 開口方位陣列
      if (t === 'I') return r % 2 === 0 ? [1, 3] : [0, 2];
      return [[0, 1], [1, 2], [2, 3], [3, 0]][r % 4];
    },
    // 水流：從 (0,inRow) 左側進入，沿開口走；回傳 {lit:[格索引…], ok 是否從 (w-1,outRow) 右側出去}
    flow: function (p, cells) {
      var x = 0, y = p.inRow, from = 3, lit = [], seen = {};
      while (x >= 0 && y >= 0 && x < p.w && y < p.h) {
        var i = y * p.w + x, c = cells[i], op = Pipes.open(c.t, c.r);
        if (op.indexOf(from) < 0 || seen[i]) break;
        seen[i] = 1; lit.push(i);
        var to = op[0] === from ? op[1] : op[0];
        if (x === p.w - 1 && y === p.outRow && to === 1) return { lit: lit, ok: true };
        x += DX[to]; y += DY[to]; from = (to + 2) % 4;
      }
      return { lit: lit, ok: false };
    },
    // 找一組讓水通的轉法（DFS，每格最多走一次）；回傳 {格索引: 目標方向}
    solve: function (p, cells) {
      var used = {}, pick = {};
      function dfs(x, y, from) {
        if (x < 0 || y < 0 || x >= p.w || y >= p.h) return false;
        var i = y * p.w + x;
        if (used[i]) return false;
        var c = cells[i], m = Pipes.mod(c.t);
        for (var k = 0; k < m; k++) {
          var r = (c.r + k) % m, op = Pipes.open(c.t, r);
          if (op.indexOf(from) < 0) continue;
          var to = op[0] === from ? op[1] : op[0];
          used[i] = 1; pick[i] = r;
          if (x === p.w - 1 && y === p.outRow && to === 1) return true;
          if (dfs(x + DX[to], y + DY[to], (to + 2) % 4)) return true;
          delete used[i]; delete pick[i];
        }
        return false;
      }
      return dfs(0, p.inRow, 3) ? pick : null;
    }
  };

  E.Logic = {
    newState: newState, clone: clone, cond: cond, apply: apply, visible: visible, hot: hot, click: click, combo: combo,
    step: step, key: key, actions: actions, doAction: doAction, solve: solve, explore: explore,
    Dial: Dial, Lights: Lights, Rings: Rings, Pipes: Pipes
  };
})();
