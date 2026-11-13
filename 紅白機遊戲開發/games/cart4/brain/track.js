/*
 * games/cart4/brain/track.js — 模式 3 TRACER 時空追蹤（記住物件在星格盤上的移動軌跡，再回答位置）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/core.js、brain/main.js
 *
 * 畫面：HUD 第 1~3 列；左邊星格盤（每格 16×16 = 一個屬性區塊，原點 (2,6) 磚、最大 6×6）、右邊資訊板（回合 / 步數 / 題目 / 箭頭提示框）。
 *   不用 split（盤面不動）；盤面用組 1、資訊板組 2、提示框組 3、HUD 組 0。
 * 一回合：WATCH（看起點 60 幀）→ SHOW（物件一步一步走，右邊顯示 STEP n）→ [BLIND：物件隱形，只在提示框給箭頭]
 *   → ASK（題目：NOW 現在在哪 / START 起點在哪 / STEP n 第 n 步在哪；多物件時指定顏色 + 形狀）
 *   → 十字鍵移動選格框、A 作答；**B = 重看一次**（友善版：扣這題一半分數，不扣心）；限時 10 秒。
 * 8 級 × 3 回合；答錯 / 逾時 = −1 心（3 心，每過一級回 1 心）。物件：金彗星 / 青晶礦 / 粉雙環（顏色 + 形狀雙重區分）。
 * 每線精靈：物件 ≤ 3 個 16×16（同列 ≤ 6）＋選格框 2 ⇒ ≤ 8；ASK 階段物件隱藏。
 * 機器人：只記「SHOW 當下畫面上看得到」的物件位置與提示框箭頭（延遲 L 幀讀），自己算答案；不用重看。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};
  var C = BR.C, AU = BR.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var BC = 2, BRW = 6;                // 盤面原點（磚）
  var ROUNDS = 3, ASK_T = 600, WATCH_T = 60, SLIDE = 8;
  // n 盤面邊長、k 物件數、steps 可見步數、st 每步幀數、blind 盲段箭頭數、one = 箭頭一次只顯示一個、q 題型、sim = 同時移動
  var LV = [
    { n: 4, k: 1, steps: 4, st: 34, blind: 0, one: 0, q: ['NOW'], sim: 0 },
    { n: 4, k: 1, steps: 6, st: 30, blind: 0, one: 0, q: ['NOW', 'START'], sim: 0 },
    { n: 5, k: 1, steps: 6, st: 28, blind: 0, one: 0, q: ['NOW', 'STEP'], sim: 0 },
    { n: 5, k: 2, steps: 4, st: 28, blind: 0, one: 0, q: ['NOW'], sim: 0 },
    { n: 5, k: 1, steps: 4, st: 28, blind: 3, one: 0, q: ['NOW'], sim: 0 },
    { n: 6, k: 2, steps: 5, st: 26, blind: 0, one: 0, q: ['NOW', 'STEP'], sim: 1 },
    { n: 6, k: 3, steps: 4, st: 26, blind: 0, one: 0, q: ['NOW'], sim: 0 },
    { n: 6, k: 1, steps: 5, st: 24, blind: 4, one: 1, q: ['NOW', 'STEP'], sim: 0 }
  ];
  var OBJ = [{ name: 'GOLD STAR', spr: 'COMET_', pal: 0 }, { name: 'AQUA GEM', spr: 'GEM_', pal: 1 }, { name: 'ROSE RING', spr: 'RNG_', pal: 2 }];
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];     // 上 右 下 左
  var DIR_T = ['ARU', 'ARR', 'ARD', 'ARL'];
  var PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x10, 0x30], [0x03, 0x13, 0x23], [0x0C, 0x1C, 0x3C], [0x07, 0x17, 0x38]],
    spr: [[0x17, 0x28, 0x38], [0x0C, 0x2C, 0x3C], [0x14, 0x24, 0x35], [0x00, 0x10, 0x30]]
  };

  var M = {
    hudShift: true,
    key: 'TRACER', name: 'TRACER', short: 'TRACER', sub: 'TRACK TIME AND SPACE', song: 'brain_trace',
    levels: 8, hearts: 3, levelSelect: true, pal: PAL, heartPerLevel: 1,
    finalMsg: 'LEVEL 8 CLEAR! TIME LORD',
    rules: [
      'WATCH THINGS MOVE ON THE',
      'STAR GRID, THEN ANSWER:',
      ' NOW   WHERE IS IT NOW?',
      ' START WHERE DID IT START?',
      ' STEP  WHERE AT STEP N?',
      'CLOAK: ONLY ARROWS SHOW',
      '  WHERE IT GOES.'
    ],
    pad: { d: ['MOVE FRAME'], b: 'REPLAY', a: 'ANSWER' }, goalLine: '3 ROUNDS A LEVEL',
    overWhy: 'OUT OF HEARTS'
  };
  function sub() { return C.g.sub; }
  function P() { return LV[C.clamp(sub().lv, 0, 7)]; }
  function off(n) { return (6 - n) & ~1; }               // 盤面在 6×6 區域內的偏移（磚，偶數 ⇒ 屬性對齊）
  function cellXY(n, cx, cy) { var o = off(n); return { x: (BC + o + cx * 2) * 8, y: (BRW + o + cy * 2) * 8 }; }

  /* ---------------- 背景 ---------------- */
  function drawBoard(n) {
    var o = off(n);
    C.fill(BC - 1, BRW - 1, 14, 14, 0);
    C.frame(BC - 1 + o, BRW - 1 + o, n * 2 + 2, n * 2 + 2);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) C.put4(BC + o + x * 2, BRW + o + y * 2, 'CELL_');
  }
  function panel(row, s) { C.text(17, row, C.padR(s, 13)); }
  function drawCues(s) {
    // 提示框：cols 17..30 rows 19..22（框）+ 箭頭第 20 列
    for (var i = 0; i < 6; i++) {
      var t = 0;
      if (s.cueShow) {
        if (P().one) { if (i === 0 && s.cueCur >= 0) t = C.t(DIR_T[s.cues[s.cueCur]]); }
        else if (i <= s.cueCur) t = C.t(DIR_T[s.cues[i]]);
      }
      C.put(19 + i * 2, 21, t);
    }
  }

  M.enter = function (lv) {
    var p = LV[C.clamp(lv, 0, 7)];
    var s = C.g.sub = { lv: lv, round: 0, phase: 'watch', t: 0, objs: [], hist: [], cues: [], cueCur: -1, cueShow: false,
      cx: 0, cy: 0, rep: 0, replays: 0, okN: 0, ngN: 0, q: null, judgeOk: false, cursorRep: 0, step: 0 };
    C.redraw(function () {
      drawBoard(p.n);
      C.frame(16, 5, 15, 13);
      C.frame(16, 19, 15, 5);
      if (p.blind) C.text(17, 20, 'CLOAK ARROWS');
      else for (var k = 0; k < p.k; k++) C.text(18, 20 + k, OBJ[k].name);
      C.fillA(0, 2, 8, 12, 1);
      C.fillA(8, 2, 8, 7, 2);
      C.fillA(8, 9, 8, 4, 3);
    }, PAL);
    newRound(s);
  };
  M.begin = function () { };

  function newRound(s) {
    var p = P(), n = p.n, i, k;
    s.phase = 'watch'; s.t = 0; s.rep = 0; s.cueCur = -1; s.cueShow = false; s.step = 0; s.q = null;
    // 起點：互不相同
    var used = {};
    s.objs = []; s.hist = [];
    for (k = 0; k < p.k; k++) {
      var c;
      do { c = { x: C.rint(n), y: C.rint(n) }; } while (used[c.x + ',' + c.y]);
      used[c.x + ',' + c.y] = 1;
      s.objs.push({ x: c.x, y: c.y, px: 0, py: 0, from: null, to: null, last: -1, vis: true });
      s.hist.push([{ x: c.x, y: c.y }]);
    }
    // 走法（每步：sim = 全部一起走；否則輪流走一個）
    s.plan = [];
    var cur = s.objs.map(function (o) { return { x: o.x, y: o.y, last: -1 }; });
    var total = p.steps + p.blind;
    for (i = 0; i < total; i++) {
      var movers = p.sim ? cur.map(function (_, j) { return j; }) : [i % p.k];
      var mv = [];
      for (var tries = 0; tries < 40; tries++) {
        mv = [];
        var occ = {};
        cur.forEach(function (o, j) { if (movers.indexOf(j) < 0) occ[o.x + ',' + o.y] = 1; });
        var okAll = true;
        for (var mi = 0; mi < movers.length; mi++) {
          var j = movers[mi], o = cur[j], opts = [];
          for (var d = 0; d < 4; d++) {
            if (o.last >= 0 && d === ((o.last + 2) & 3)) continue;      // 不立刻折返
            var nx = o.x + DIRS[d][0], ny = o.y + DIRS[d][1];
            if (nx < 0 || ny < 0 || nx >= n || ny >= n || occ[nx + ',' + ny]) continue;
            opts.push(d);
          }
          if (!opts.length) { okAll = false; break; }
          var dd = opts[C.rint(opts.length)];
          mv.push({ j: j, d: dd });
          occ[(o.x + DIRS[dd][0]) + ',' + (o.y + DIRS[dd][1])] = 1;
        }
        if (okAll) break;
      }
      mv.forEach(function (q) { var o = cur[q.j]; o.x += DIRS[q.d][0]; o.y += DIRS[q.d][1]; o.last = q.d; });
      s.plan.push(mv);
    }
    s.cues = [];
    for (i = p.steps; i < total; i++) s.cues.push(s.plan[i][0].d);
    // 每個物件每一步之後的位置（STEP 題用全域步數）
    var pos = s.objs.map(function (o) { return { x: o.x, y: o.y }; });
    s.track = [pos.map(function (q) { return { x: q.x, y: q.y }; })];
    for (i = 0; i < total; i++) {
      s.plan[i].forEach(function (q) { pos[q.j].x += DIRS[q.d][0]; pos[q.j].y += DIRS[q.d][1]; });
      s.track.push(pos.map(function (q) { return { x: q.x, y: q.y }; }));
    }
    // 題目
    var type = p.q[C.rint(p.q.length)];
    var who = (p.blind > 0) ? 0 : C.rint(p.k);
    var at = total;
    if (type === 'START') at = 0;
    if (type === 'STEP') at = 1 + C.rint(Math.max(1, p.steps - 1));
    s.q = { type: type, who: who, at: at, ans: s.track[at][who] };
    s.objs.forEach(function (o) { var xy = cellXY(n, o.x, o.y); o.px = xy.x; o.py = xy.y; o.vis = true; });
    panel(6, 'ROUND ' + (s.round + 1) + ' OF ' + ROUNDS);
    panel(8, 'WATCH!');
    panel(10, ''); panel(11, ''); panel(12, ''); panel(14, ''); panel(15, '');
    if (p.blind) C.text(17, 21, '            ');
    s.cx = (n >> 1); s.cy = (n >> 1);
    AU.sfx('brain_tick');
  }
  function startReplay(s) {
    s.rep++; s.replays++;
    var p = P(), n = p.n;
    s.phase = 'watch'; s.t = 0; s.step = 0; s.cueCur = -1; s.cueShow = false;
    s.objs.forEach(function (o, k) { o.x = s.track[0][k].x; o.y = s.track[0][k].y; var xy = cellXY(n, o.x, o.y); o.px = xy.x; o.py = xy.y; o.vis = true; o.from = null; });
    panel(8, 'REPLAY!'); panel(10, ''); panel(11, ''); panel(12, '');
    drawCues(s);
    C.say('REPLAY: HALF POINTS THIS ROUND', 90);
  }
  function askText(s) {
    var q = s.q, p = P(), o = OBJ[q.who];
    panel(8, 'QUESTION');
    var a = p.k > 1 ? 'THE ' + o.name : 'IT';
    if (q.type === 'NOW') { panel(10, 'WHERE IS'); panel(11, a); panel(12, 'NOW?'); }
    else if (q.type === 'START') { panel(10, 'WHERE DID'); panel(11, a); panel(12, 'START?'); }
    else { panel(10, 'WHERE WAS'); panel(11, a); panel(12, 'AT STEP ' + q.at + '?'); }
    panel(14, 'A = ANSWER');
    panel(15, s.rep ? 'NO REPLAY' : 'B = REPLAY');
  }

  /* ---------------- 每幀 ---------------- */
  M.tick = function (I) {
    var s = sub(), p = P(), n = p.n, total = p.steps + p.blind;
    s.t++;
    if (s.phase === 'watch') {
      if (s.t >= WATCH_T) { s.phase = 'show'; s.t = 0; s.step = 0; }
      return 0;
    }
    if (s.phase === 'show') {
      var si = Math.floor((s.t - 1) / p.st), ft = (s.t - 1) % p.st;
      if (si >= total) { s.phase = 'ask'; s.t = 0; s.objs.forEach(function (o) { o.vis = false; }); s.cueShow = !P().one && p.blind > 0; drawCues(s); askText(s); AU.sfx('brain_ok'); return 0; }
      if (ft === 0) {
        s.step = si + 1;
        var blindNow = si >= p.steps;
        if (blindNow && si === p.steps) { s.objs.forEach(function (o) { o.vis = false; }); C.say('CLOAK! FOLLOW THE ARROWS', 90); }
        s.plan[si].forEach(function (q) {
          var o = s.objs[q.j];
          o.from = cellXY(n, o.x, o.y); o.x += DIRS[q.d][0]; o.y += DIRS[q.d][1]; o.to = cellXY(n, o.x, o.y);
        });
        if (blindNow) { s.cueCur = si - p.steps; s.cueShow = true; drawCues(s); AU.sfx('brain_step'); }
        else AU.sfx('brain_step');
        panel(8, blindNow ? 'ARROW ' + (si - p.steps + 1) + ' OF ' + p.blind : 'STEP ' + (si + 1) + ' OF ' + p.steps);
      }
      s.objs.forEach(function (o) {
        if (!o.from) return;
        var f = Math.min(SLIDE, ft + 1);
        o.px = o.from.x + (((o.to.x - o.from.x) * f / SLIDE) | 0);
        o.py = o.from.y + (((o.to.y - o.from.y) * f / SLIDE) | 0);
        if (f >= SLIDE) o.from = null;
      });
      return 0;
    }
    if (s.phase === 'ask') {
      var d = cursorMove(s, I, n);
      if (d) AU.sfx('brain_move');
      if (I.pressed(BTN.B) && !s.rep) { startReplay(s); return 0; }
      if (I.pressed(BTN.A) || s.t >= ASK_T) {
        var ok = I.pressed(BTN.A) && s.cx === s.q.ans.x && s.cy === s.q.ans.y;
        s.judgeOk = ok; s.phase = 'judge'; s.t = 0;
        if (ok) {
          s.okN++;
          var pts = (50 + 25 * s.lv) + Math.floor((ASK_T - s.t) / 10);
          if (s.rep) pts >>= 1;
          C.addScore(pts); AU.sfx('brain_goal');
          panel(8, 'CORRECT!');
        } else {
          s.ngN++;
          C.hurt(I.pressed(BTN.A) ? 'WRONG PLACE!' : 'TIME UP!');
          panel(8, 'IT WAS HERE');
        }
        panel(10, ''); panel(11, ''); panel(12, ''); panel(14, ''); panel(15, '');
      }
      return 0;
    }
    if (s.phase === 'judge') {
      if (C.g.run.hearts <= 0) return 0;
      if (s.t >= 80) {
        s.round++;
        if (s.round >= ROUNDS) return 1;
        newRound(s);
      }
    }
    return 0;
  };
  function cursorMove(s, I, n) {
    var dx = 0, dy = 0;
    var any = I.held(BTN.LEFT) || I.held(BTN.RIGHT) || I.held(BTN.UP) || I.held(BTN.DOWN);
    var edge = I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT) || I.pressed(BTN.UP) || I.pressed(BTN.DOWN);
    if (edge) s.cursorRep = 0; else if (any) s.cursorRep++; else s.cursorRep = 0;
    var fire = edge || (s.cursorRep >= 12 && (s.cursorRep - 12) % 6 === 0);
    if (!fire) return 0;
    if (I.held(BTN.LEFT)) dx = -1; else if (I.held(BTN.RIGHT)) dx = 1;
    if (I.held(BTN.UP)) dy = -1; else if (I.held(BTN.DOWN)) dy = 1;
    var nx = C.clamp(s.cx + dx, 0, n - 1), ny = C.clamp(s.cy + dy, 0, n - 1);
    var moved = nx !== s.cx || ny !== s.cy;
    s.cx = nx; s.cy = ny;
    return moved ? 1 : 0;
  }

  /* ---------------- 繪製 ---------------- */
  M.draw = function () {
    var s = sub(), p = P(), ppu = C.nes.ppu;
    ppu.split(null); ppu.scroll(0, -C.SHIFT);      // 整片下移 8 px：HUD 不貼 y = 0
    if (s.phase === 'watch' || s.phase === 'show') {
      s.objs.forEach(function (o, k) {
        if (!o.vis) return;
        if (s.phase === 'watch' && (s.t & 8) && s.t > 20) return;    // 起點閃爍提示
        C.spr16(o.px, o.py, OBJ[k].spr, OBJ[k].pal);
      });
    }
    if (s.phase === 'ask' || s.phase === 'judge') {
      var xy = cellXY(p.n, s.cx, s.cy);
      if (s.phase === 'ask' || (s.t & 8)) C.spr16(xy.x, xy.y, 'CUR_', 3);
      if (s.phase === 'judge') {
        var a = cellXY(p.n, s.q.ans.x, s.q.ans.y);
        C.spr16(a.x, a.y, OBJ[s.q.who].spr, OBJ[s.q.who].pal);
      }
    }
  };
  M.hud2 = function () {
    var s = sub();
    if (s.phase === 'ask') return 'ANSWER ' + C.timeText(Math.max(0, ASK_T - s.t)) + 'S  OK ' + s.okN + ' NG ' + s.ngN;
    return 'ROUND ' + (s.round + 1) + '/' + ROUNDS + '  OK ' + s.okN + ' NG ' + s.ngN + '      ';
  };
  M.hint = function () {
    var s = sub();
    if (s.phase === 'watch') return 'WATCH THE START!';
    if (s.phase === 'show') return 'REMEMBER THE PATH';
    if (s.phase === 'ask') return 'DPAD MOVE  A ANSWER' + (s.rep ? '' : '  B REPLAY');
    return s.judgeOk ? 'GREAT MEMORY!' : 'KEEP TRYING';
  };
  M.levelTip = function (lv) {
    return ['4X4  ONE STAR', '4X4  LONGER PATH', '5X5  STEP QUESTIONS', '5X5  TWO OBJECTS', '5X5  CLOAK + ARROWS',
            '6X6  TWO MOVE TOGETHER', '6X6  THREE OBJECTS', '6X6  ONE ARROW AT A TIME'][lv] || '';
  };
  M.cheat = function () { var s = sub(); if (s.phase === 'ask') { s.t = 0; s.rep = 0; askText(s); } };
  M.grade = function (R) {
    var s = sub(), rp = s ? s.replays : 0, h = R.hurts;
    if (h === 0 && rp <= 1) return 0;
    if (h <= 1 && rp <= 3) return 1;
    if (h <= 3) return 2;
    if (h <= 5) return 3;
    return 4;
  };
  M.titleOf = function (gi) { return ['TIME LORD', 'STAR NAVIGATOR', 'PATH FINDER', 'SKY WATCHER', 'LOST IN SPACE'][gi]; };
  M.resultLines = function (R) { var s = sub(); return ['MISSES ' + R.hurts + '  REPLAYS ' + s.replays, 'CORRECT ' + s.okN + ' (LAST LEVEL)']; };
  M.overLine = function () { var s = sub(); return 'ROUND  ' + (s.round + 1) + ' OF ' + ROUNDS; };
  M.stateOf = function () {
    var s = sub();
    if (!s) return null;
    return { lv: s.lv, round: s.round, phase: s.phase, t: s.t, step: s.step, cx: s.cx, cy: s.cy, rep: s.rep, replays: s.replays, okN: s.okN, ngN: s.ngN,
      q: s.q ? { type: s.q.type, who: s.q.who, at: s.q.at, ans: s.q.ans } : null, k: s.objs.length, cues: s.cues.slice() };
  };

  /* ---------------- 機器人：記憶只來自畫面（L 幀前） ---------------- */
  M.observe = function () {
    var s = sub(), p = P();
    var o = { phase: s.phase, round: s.round, rep: s.rep, n: p.n, step: s.step, objs: null, cue: null, q: null };
    if (s.phase === 'watch' || s.phase === 'show') {
      o.objs = s.objs.map(function (b) { return b.vis ? { px: b.px, py: b.py, rest: !b.from } : null; });
    }
    if (s.cueShow && s.cueCur >= 0) o.cue = { i: s.cueCur, d: s.cues[s.cueCur] };    // 提示框上目前看得到的箭頭
    if (s.phase === 'ask') o.q = { type: s.q.type, who: s.q.who, at: s.q.at };       // 題目文字（畫面上）
    return o;
  };
  M.bot = function (o, mem, now) {
    var s = sub(), m = 0, prev = mem.prev || 0;
    function tap(b) { if (prev & b) return 0; return b; }
    if (mem.round !== o.round || mem.lv !== s.lv || (o.phase === 'watch' && mem.phase !== 'watch')) {
      mem.lv = s.lv;
      mem.round = o.round; mem.seen = null; mem.cues = []; mem.lastStep = -1; mem.answer = null; mem.atStep = {};
    }
    mem.phase = o.phase;
    var n = o.n, org = off(n);
    function toCell(px, py) { return { x: Math.round((px / 8 - BC - org) / 2), y: Math.round((py / 8 - BRW - org) / 2) }; }
    if (o.objs) {
      if (!mem.seen) mem.seen = o.objs.map(function () { return []; });
      if (!mem.byStep) mem.byStep = {};
      o.objs.forEach(function (b, k) {
        if (!b || !b.rest) return;
        var c = toCell(b.px, b.py), h = mem.seen[k], last = h[h.length - 1];
        if (!last || last.x !== c.x || last.y !== c.y) h.push(c);
      });
      // 全域步數 → 各物件位置（靜止時記）
      if (o.objs.every(function (b) { return !b || b.rest; })) {
        mem.atStep = mem.atStep || {};
        mem.atStep[o.round + ':' + o.step] = o.objs.map(function (b) { return b ? toCell(b.px, b.py) : null; });
      }
    }
    if (o.cue && mem.cues[o.cue.i] === undefined) mem.cues[o.cue.i] = o.cue.d;
    if (o.phase !== 'ask' || !o.q) { mem.prev = 0; return 0; }
    if (!mem.answer) {
      var q = o.q, ans = null;
      if (q.type === 'START') ans = mem.seen && mem.seen[q.who] ? mem.seen[q.who][0] : null;
      else if (q.type === 'STEP') { var st = mem.atStep && mem.atStep[o.round + ':' + q.at]; ans = st ? st[q.who] : null; }
      else {
        var h = mem.seen && mem.seen[q.who];
        ans = h ? { x: h[h.length - 1].x, y: h[h.length - 1].y } : null;
        if (ans) for (var i = 0; i < mem.cues.length; i++) { if (mem.cues[i] === undefined) continue; ans.x += DIRS[mem.cues[i]][0]; ans.y += DIRS[mem.cues[i]][1]; }
      }
      mem.answer = ans || { x: 0, y: 0 };
      mem.waitT = now;
    }
    if (now - mem.waitT < 10) { mem.prev = 0; return 0; }
    var a = mem.answer;
    // fix-r8：「傳出副本」——剛按的方向還沒反映到游標前（≤ 40 幀）以按下去之後的位置思考；游標停穩 6 幀才按 A
    var cx = s.cx, cy = s.cy;
    if (mem.pend) { if ((s.cx === mem.pend.x && s.cy === mem.pend.y) || now - mem.pend.t > 40) { mem.pend = null; mem.still = now; } else { cx = mem.pend.x; cy = mem.pend.y; } }
    var b = 0, nx = cx, ny = cy;
    if (cx < a.x) { b = BTN.RIGHT; nx++; } else if (cx > a.x) { b = BTN.LEFT; nx--; }
    else if (cy < a.y) { b = BTN.DOWN; ny++; } else if (cy > a.y) { b = BTN.UP; ny--; }
    if (b) { if (!mem.pend) { var tb = tap(b); if (tb) { m |= tb; mem.pend = { x: nx, y: ny, t: now }; } } }
    else if (!mem.pend && now - (mem.still || 0) >= 6) m |= tap(BTN.A);
    mem.prev = m;
    return m;
  };

  BR.Modes = BR.Modes || [];
  BR.Modes[2] = M;
  BR.Track = { M: M, LV: LV, OBJ: OBJ, ROUNDS: ROUNDS, ASK_T: ASK_T, cellXY: cellXY };
})();
