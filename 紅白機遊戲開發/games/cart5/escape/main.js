/*
 * games/cart5/escape/main.js — 《星塵密室》點選式密室逃脫（合輯卡帶五 槽 2，id = escape，全域 CT.Escape）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-4 cart5-escape（R9）｜ 依賴：engine/*、registry.js、cart5/text.js（CT.Text）、escape/{text_rooms,text_ui,logic,art,song}.js
 * 舊作概念：legacy escape-room（只取「點選調查 / 拿物品 / 密碼鎖」玩法；房間、謎題、文字、美術、音樂全部原創）。
 *
 * 畫面（32×30 格）：第 2~3 列 HUD（房名 / 朝向 / 剩餘時間）｜第 4~19 列房間畫面 256×128（每面牆一個 bank）｜
 *   第 20~21 列物品欄（7 格 16×16 圖示）｜第 22~28 列訊息框（CT.Text，2 行 × 13 字，打字機）。
 * 操作：十字鍵游標（按住加速：前 8 幀 1 px、之後 3 px；按住 B = 1 px 微調）、A 調查 / 使用 / 拿起物品、
 *   B 放下物品 / 離開特寫、SELECT 三段提示、START 暫停；左右箭頭（或把游標推到邊上 20 幀）轉身。
 * 機關特寫：dial 撥盤鎖 / lights 九燈 / rings 太陽系儀 / pipes 管線（光路）/ look 望遠鏡；十字鍵一格一格（首延遲 12 幀、之後每 4 幀）。
 * §6：密技（C / ★）= 直接解開目前卡住的環節（特寫中 = 解開這個機關）；時間到畫面 = 原地續關；標題 / 說明無效；用過 goal() = false。
 * 網址：`cart5.html?game=escape&debug=1[&bot=1][&room=1..3]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var E = CT.Escape = CT.Escape || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var DPAD = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;

  var ID = 'escape';
  var DIRS = ['N', 'E', 'S', 'W'];
  var VROW = 4, BAR_ROW = 20, SLOTS = 7;
  var BOX = { x: 1, y: 22, w: 30, h: 7 };
  var HINT_COST = 30 * 60;                    // 每段提示：評價時間 +30 秒
  var EDGE_F = 20, POOL_MIN = 64;              // 字形池 = 256 − 本畫面已用磁磚（fix-r9 P1-1：不再設上限 120）
  var SPR_PAL = [[0x0F, 0x30, 0x28], [0x28, 0x30, 0x28], [0x0F, 0x28, 0x30], [0x30, 0x30, 0x30]];
  var TEXT_PALS = [[0x02, 0x12, 0x30], [0x02, 0x07, 0x17], [0x02, 0x16, 0x28], [0x02, 0x1A, 0x21]];

  var A = null, L = null, Au = null, TX = null, R = null;
  var nes0 = null, ppu0 = null, T = null, box = null, menu = null, spr = null, bank = null;
  var g = null;

  /* ============================================================ 小工具 */
  function pressed(b) { return NES.Input.pressed(b); }
  function held(b) { return NES.Input.held(b); }
  function sfx(n) { Au.sfx(n); }
  function room() { return R[g.room]; }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s; }
  function mmss(f) { var s = Math.max(0, Math.ceil(f / 60)); return num(Math.floor(s / 60), 2) + ':' + num(s % 60, 2); }
  function itemName(id) { var it = room().items[id]; return it ? it.n : id; }
  function rectPx(h) { return { x: h.r[0] * 8, y: (VROW + h.r[1]) * 8, w: h.r[2] * 8, h: h.r[3] * 8 }; }
  function slotPx(k) { return { x: 12 + k * 32, y: BAR_ROW * 8, w: 24, h: 16 }; }
  function inR(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  function budgetLeft() { var b = ppu0 && ppu0.budget; return b && b.left ? b.left() : 999; }
  function digitsTiles() {
    var G = (CT.GLYPHS && CT.GLYPHS.ascii) || {}, out = {};
    '0123456789:'.split('').forEach(function (ch, i) {
      var h = G[ch] || '0000000000000000', rows = [];
      for (var y = 0; y < 8; y++) {
        var v = parseInt(h.substr(y * 2, 2), 16) | 0, r = '';
        for (var x = 0; x < 8; x++) r += (v >> (7 - x)) & 1 ? '3' : '.';
        rows.push(r);
      }
      out[ch === ':' ? 'DC' : 'D' + ch] = rows;
    });
    return out;
  }

  /* ============================================================ 畫面組裝（CT.blank 裡：bank + 名稱表 + 屬性 + CT.Text） */
  // parts: [{cv, col, row}]；extras {名字: 16×16 畫布}；icons [物品]；回傳 {cells: [[part cells]], ext {名字: {cells, attr}}, ico {id: {cells, attr}}}
  function build(pals, parts, extras, icons) {
    var ts = new A.TileSet(), comp = [], ext = {}, ico = {};
    parts.forEach(function (p) { comp.push(A.compose(p.cv, pals, ts)); });
    Object.keys(extras || {}).forEach(function (k) { ext[k] = A.compose(extras[k], pals, ts); });
    (icons || []).forEach(function (id) { ico[id] = A.compose(A.icon(id), pals, ts); });
    var obj = { Z: ['........', '........', '........', '........', '........', '........', '........', '........'] };
    for (var i = 0; i < ts.list.length; i++) obj['V' + i] = ts.rows(i);
    var dg = digitsTiles(); for (var k in dg) obj[k] = dg[k];
    var used = 1 + ts.list.length + 11 + CT.Text.reserve.frameTiles;
    var pool = 256 - used;                     // 這個畫面剩多少就全給字形池（撥盤特寫約 200 磚）
    if (pool < POOL_MIN) throw new Error('escape: 畫面磁磚太多（' + ts.list.length + '），字形池只剩 ' + pool);
    CT.Text.reserve(obj, pool);
    bank = NES.CHR.bank('escape_bg', obj);
    NES.CHR.setPattern(0, bank);
    NES.CHR.setPattern(1, spr);
    ppu0.setPatternTables(0, 1);
    ppu0.setBackdrop(0x0F);
    for (i = 0; i < 4; i++) { ppu0.setBgPalette(i, pals[i]); ppu0.setSprPalette(i, SPR_PAL[i]); }
    ppu0.fillTiles(0, 0, 0, 32, 30, 0);
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    ppu0.clearSprites();
    parts.forEach(function (p, j) { blit(comp[j], p.col, p.row); });
    g.stat = { tiles: ts.list.length, pool: pool, approx: comp.reduce(function (s, c) { return s + c.approx; }, 0) };
    T = CT.Text.create(nes0, { bank: bank, input: false });
    box = null; menu = null;
    return { comp: comp, ext: ext, ico: ico };
  }
  function idxOf(name) { return bank.index(name); }
  function blit(c, col, row) {
    for (var r = 0; r < c.rows; r++) for (var q = 0; q < c.cols; q++) ppu0.setTile(0, col + q, row + r, idxOf(c.cells[r * c.cols + q]));
    for (var by = 0; by < c.bh; by++) for (var bx = 0; bx < c.bw; bx++) ppu0.setAttr(0, (col >> 1) + bx, (row >> 1) + by, c.attr[by * c.bw + bx]);
  }
  // 自己的寫入佇列（T.update 之前消化；每幀 ≤ 32 byte 且預算夠才寫）
  var WQ = [];
  function qCell(c, col, row) {           // 16×16 的 composed 小圖 → 4 格 + 1 屬性
    for (var r = 0; r < 2; r++) for (var q = 0; q < 2; q++) WQ.push({ c: col + q, r: row + r, t: idxOf(c.cells[r * 2 + q]) });
    WQ.push({ a: 1, c: col >> 1, r: row >> 1, p: c.attr[0] });
  }
  function pumpWQ() {
    var n = 0;
    while (WQ.length && n < 32 && budgetLeft() > 48) {
      var w = WQ.shift();
      if (w.a) ppu0.setAttr(0, w.c, w.r, w.p); else ppu0.setTile(0, w.c, w.r, w.t);
      n++;
    }
  }
  function textAttr(col, row, w, h, p) {
    for (var r = row >> 1; r <= (row + h - 1) >> 1; r++) for (var c = col >> 1; c <= (col + w - 1) >> 1; c++) ppu0.setAttr(0, c, r, p);
  }

  /* ============================================================ 各畫面 */
  function artState() {
    var pz = g.pz || {};
    return { f: g.st.f, inv: g.st.inv, lights: pz.lights && pz.lights.s, rings: pz.rings && pz.rings.s };
  }
  function drawHud() {
    textAttr(0, 2, 32, 2, 0);
    T.print(1, 2, g.paused ? TX.pause : room().name);
    T.print(11, 2, g.paused ? TX.resume : (g.puz ? TX.leave : TX.dirFull[g.dir]));
    g.timeShown = '';
    drawTime(true);
  }
  function drawTime(now) {
    var s = mmss(Math.max(0, room().limit - g.time));
    if (s === g.timeShown) return;
    for (var i = 0; i < 5; i++) {
      if (g.timeShown && g.timeShown.charAt(i) === s.charAt(i)) continue;
      var t = idxOf(s.charAt(i) === ':' ? 'DC' : 'D' + s.charAt(i));
      if (now) ppu0.setTile(0, 25 + i, 3, t); else WQ.push({ c: 25 + i, r: 3, t: t });
    }
    g.timeShown = s;
  }
  function drawBar(now) {
    for (var k = 0; k < SLOTS; k++) {
      var id = g.st.inv[k], col = 2 + k * 4, c = id && g.ico[id];
      if (c) {
        if (now) { blit(c, col, BAR_ROW); }
        else qCell(c, col, BAR_ROW);
      }
    }
  }
  function newBox() {
    box = T.box({ x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h, input: false, pal: 0 });
    T.frame(BOX.x, BOX.y, BOX.w, BOX.h, { pal: 0 });
    box.drawn = true;
    g.idleKey = null;
  }
  function screenRoom() {
    CT.blank(nes0, function () {
      var r = room(), b;
      if (g.puz) {
        var cu = A.closeup(r, g.puz.p, artState());
        b = build(r.pals, [{ cv: cu.cv, col: 0, row: VROW }], cu.extra, g.st.inv);
        g.ext = b.ext;
      } else {
        b = build(r.pals, [{ cv: A.view(r, DIRS[g.dir], artState()), col: 0, row: VROW }], null, g.st.inv);
      }
      g.ico = b.ico;
      drawHud(); drawBar(true);
      newBox();
      if (g.puz) drawPuz(true);
      T.flush();
    });
    WQ.length = 0;
    g.idleKey = null;
  }
  // 純文字畫面（標題 / 說明 / 故事 / 結算 / 時間到 / 選房）
  function screenText(kind) {
    CT.blank(nes0, function () {
      var parts = [];
      if (kind === 'title') parts.push({ cv: A.title(), col: 0, row: 4 });
      if (kind === 'story' || kind === 'end') parts.push({ cv: A.story(kind), col: 0, row: 1 });
      if (kind === 'result' && g.result) parts.push({ cv: A.rankBadge(g.result.rank), col: 8, row: 14 });   // 評價 32×32 大字
      build(TEXT_PALS, parts, null, []);
      g.ico = {};
    });
    WQ.length = 0;
  }

  /* ============================================================ 訊息 */
  // say(text, then, name)：對話框打字機；A 加速 / 翻頁；關閉後呼叫 then
  function say(text, then, name, auto) {
    if (!box) newBox();
    g.talk = true; g.talkT = 0; g.autoClose = !!auto;
    box.say(text, { name: name || null, onClose: function () { g.talk = false; g.idleKey = null; if (then) then(); } });
  }
  function updateTalk() {
    g.talkT++;
    var ph = box.state().phase;
    if (pressed(BTN.A) && g.talkT > 2) { box.next(); if (ph === 'wait' || ph === 'end') sfx('escape_menu'); }
  }
  function idleText(force) {
    if (!box || g.talk) return;
    var L1 = '', L2 = '';
    var hv = g.hover;
    if (hv && hv.t === 'hot') L1 = hv.h.n;
    else if (hv && hv.t === 'turn') L1 = hv.d < 0 ? TX.turnL : TX.turnR;
    else if (hv && hv.t === 'slot') { L1 = itemName(hv.id); L2 = room().items[hv.id].d; }
    if (!L2) L2 = g.sel ? TX.holding + itemName(g.sel) : TX.look;
    if (g.puz) { L1 = g.puz.p.t; L2 = g.puz.p.help; }
    var key = L1 + '|' + L2;
    if (key === g.idleKey && !force) return;
    g.idleKey = key;
    T.clear(BOX.x + 1, BOX.y + 1, BOX.w - 2, BOX.h - 2);
    if (g.puz) { T.print(BOX.x + 2, BOX.y + 1, L2, { w: BOX.w - 4 }); return; }
    if (L1) T.print(BOX.x + 2, BOX.y + 1, L1);
    T.print(BOX.x + 2, BOX.y + 3, L2);
  }

  /* ============================================================ 房間流程 */
  function newRun() { return { f: {}, inv: [] }; }
  function startRoom(i) {
    g.mode = 'room'; g.room = i; g.st = L.newState(); g.dir = 0; g.sel = null; g.time = 0; g.hints = 0; g.hintStage = {};
    g.runCheats = 0; g.puz = null; g.pz = {}; g.cx = 124; g.cy = 100; g.hover = null; g.paused = false; g.talk = false;
    g.edgeF = 0; g.holdF = 0; g.bHold = 0; g.bMoved = false;
    var r = room();
    Object.keys(r.puz).forEach(function (k) {
      var p = r.puz[k];
      if (p.kind === 'dial') g.pz[k] = { vals: Array.from(p.start), sel: 0 };
      else if (p.kind === 'lights') { g.pz[k] = { s: p.start.slice(), sel: 4 }; g.pz.lights = g.pz[k]; }
      else if (p.kind === 'rings') { g.pz[k] = { s: p.start.slice(), sel: 0 }; g.pz.rings = g.pz[k]; }
      else if (p.kind === 'pipes') g.pz[k] = { cells: L.Pipes.parse(p), sel: p.inRow * p.w };
    });
    screenRoom();
    Au.stop(); Au.play(i === 2 ? 'escape_dome' : 'escape_room');
    say(r.intro + (i === 0 ? '\f' + TX.tutRoom : ''));
  }
  function changed(before) { return L.key(g.st) !== before; }
  function afterGain(got, then) {
    if (got && got.length && !g.tutItem) { g.tutItem = true; say(TX.tutItem, then); return; }
    if (then) then();
  }
  function interact(h) {
    var before = L.key(g.st), item = g.sel;
    var r = L.click(room(), g.st, h.id, item);
    if (!r) return;
    if (r.none) {
      sfx(item ? 'escape_bad' : 'escape_click');
      say(item ? itemName(item) + '：' + TX.noUse + '。' : (r.s || TX.look));
      return;
    }
    var res = L.apply(g.st, r.d);
    if (item) g.sel = null;
    var stChanged = changed(before);
    if (res.got.length) sfx('escape_pick'); else if (stChanged) sfx(item ? 'escape_use' : 'escape_click'); else sfx('escape_click');
    if (res.opened) {
      var p = room().puz[res.opened];
      if (r.s) { screenRoom(); say(r.s, function () { openPuz(res.opened); }); }
      else openPuz(res.opened);
      return;
    }
    if (stChanged) screenRoom();
    say(r.s || TX.look, function () { afterGain(res.got, function () { if (res.won) roomClear(); }); });
  }
  function combine(a, b) {
    var c = L.combo(room(), a, b);
    g.sel = null;
    if (!c || !L.cond(g.st, c.c)) { sfx('escape_bad'); say(TX.noCombo); return; }
    var res = L.apply(g.st, c.d);
    sfx('escape_combo');
    screenRoom();
    say(c.s, function () { afterGain(res.got); });
  }
  function turn(d) {
    g.dir = (g.dir + d + 4) % 4; g.edgeF = 0;
    sfx('escape_turn');
    screenRoom();
  }

  /* ============================================================ 提示 / 密技 */
  function hint() {
    var r = room(), k = L.step(r, g.st);
    if (k >= r.steps.length) return;
    var stg = g.hintStage[k] | 0;
    if (stg >= 3) { sfx('escape_bad'); say(TX.hintHead + ' 3/3：' + r.steps[k].h[2] + '\f' + TX.hintNone); return; }
    g.hintStage[k] = stg + 1; g.hints++;
    sfx('escape_hint');
    say(TX.hintHead + ' ' + (stg + 1) + '/3：' + r.steps[k].h[stg] + TX.hintCost);
  }
  function cheat() {
    if (!g) return false;
    if (g.mode === 'timeup') {                      // 原地續關：時間補滿、進度保留
      g.cheats++; g.runCheats++; g.time = 0; g.mode = 'room';
      screenRoom(); Au.stop(); Au.play(g.room === 2 ? 'escape_dome' : 'escape_room');
      sfx('escape_hint'); say(TX.cheatResume);
      return true;
    }
    if (g.mode !== 'room' || g.talk) return false;
    g.cheats++; g.runCheats++;
    if (g.paused) setPause(false);
    if (g.puz) {                                     // 特寫中：直接解開這個機關
      var p = g.puz;
      if (p.kind === 'look') { exitPuz(); return true; }
      solvedPuz(true);
      return true;
    }
    var r = room(), k = L.step(r, g.st);
    if (k >= r.steps.length) return false;
    var stg = g.hintStage[k] | 0;
    var res = L.apply(g.st, r.steps[k].cheat);
    sfx('escape_unlock');
    screenRoom();
    say(TX.cheatSolve + '\f' + r.steps[k].h[2], function () { afterGain(res.got, function () { if (res.won) roomClear(); }); });
    void stg;
    return true;
  }

  /* ============================================================ 機關特寫 */
  function openPuz(id) {
    var p = room().puz[id];
    g.puz = { id: id, p: p, kind: p.kind, t: 0, hold: 0, lastDir: 0, okT: 0 };
    sfx('escape_open');
    screenRoom();
    if (p.kind === 'look') say(p.s, function () { exitPuz(); });
    else say(p.help, function () { g.idleKey = null; }, null, true);
  }
  function exitPuz() {
    g.puz = null;
    screenRoom();
  }
  function solvedPuz(byCheat) {
    var p = g.puz.p, res = L.apply(g.st, p.d);
    sfx('escape_unlock');
    g.puz = null;
    screenRoom();
    say((byCheat ? TX.cheatSolve + '\f' : '') + p.s, function () { afterGain(res.got, function () { if (res.won) roomClear(); }); });
  }
  function dialCh(c) { var i = '0123456789'.indexOf(c); return i >= 0 ? TX.fullDigits.charAt(i) : c; }
  function dialGeom(p) { var x0 = 16 - Math.floor((p.n * 5 - 1) / 2); return { x0: x0, y: 9 }; }
  function lampPos(i) { return { col: 10 + (i % 3) * 4, row: VROW + 2 + ((i / 3) | 0) * 4 }; }
  function slotPos(ring, k) { return { col: 8 + k * 2, row: VROW + 2 + ring * 4 }; }
  function pipePos(p, i) { var G = A.pipeGeom(p); return { col: (G.gx >> 3) + (i % p.w) * 2, row: VROW + (G.gy >> 3) + ((i / p.w) | 0) * 2 }; }
  function drawPuz(now) {
    var P = g.puz, p = P.p, st = g.pz[P.id];
    if (P.kind === 'dial') {
      var G = dialGeom(p);
      textAttr(G.x0, G.y, p.n * 5, 4, 0); textAttr(2, VROW + 1, 28, 2, 0);
      T.print(16 - Math.floor(CT.Text.measure(p.t) / 2), VROW + 1, p.t);
      for (var i = 0; i < p.n; i++) { T.frame(G.x0 + i * 5, G.y, 4, 4, { fill: true }); T.print(G.x0 + i * 5 + 1, G.y + 1, dialCh(st.vals[i])); }
    } else if (P.kind === 'lights') {
      if (now) st.shown = [];
      for (var j = 0; j < 9; j++) {
        var lp = lampPos(j), lk = st.s[j] ? 'on' : 'off';
        if (!now && st.shown[j] === lk) continue;
        st.shown[j] = lk;
        if (now) blit(g.ext[lk], lp.col, lp.row); else qCell(g.ext[lk], lp.col, lp.row);
      }
    } else if (P.kind === 'rings') {
      for (var rg = 0; rg < p.n; rg++) {
        if (now && rg === 0) st.shown = {};
        for (var k = 0; k < p.m; k++) {
          var sp = slotPos(rg, k), rk = st.s[rg] === k ? 'p' + rg : 'e0';
          if (!now && st.shown[rg * 16 + k] === rk) continue;
          st.shown[rg * 16 + k] = rk;
          if (now) blit(g.ext[rk], sp.col, sp.row); else qCell(g.ext[rk], sp.col, sp.row);
        }
        if (now) { textAttr(2, VROW + 2 + rg * 4, 6, 2, 0); T.print(3, VROW + 2 + rg * 4, TX.ringNames[rg]); }
      }
      if (now) { textAttr(0, VROW + 13, 32, 2, 0); for (var b = 0; b < 3; b++) T.print(3 + b * 9, VROW + 13, TX.ringBtns[b]); }
    } else if (P.kind === 'pipes') {
      var fl = L.Pipes.flow(p, st.cells), lit = {};
      fl.lit.forEach(function (q) { lit[q] = 1; });
      st.lit = lit; st.ok = fl.ok;
      for (var n = 0; n < st.cells.length; n++) {
        var cel = st.cells[n], pp = pipePos(p, n), key = cel.t + cel.r + (lit[n] ? 'l' : 'u');
        if (now && n === 0) st.shown = [];
        if (!now && st.shown && st.shown[n] === key) continue;
        (st.shown = st.shown || [])[n] = key;
        if (now) blit(g.ext[key], pp.col, pp.row); else qCell(g.ext[key], pp.col, pp.row);
      }
    }
  }
  function puzDir() {                     // 十字鍵一格一格：首延遲 12 幀、之後每 4 幀
    var P = g.puz, d = 0;
    var dirs = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT];
    for (var i = 0; i < 4; i++) if (pressed(dirs[i])) { P.hold = 0; P.lastDir = dirs[i]; return dirs[i]; }
    if (P.lastDir && held(P.lastDir)) { P.hold++; if (P.hold >= 12 && (P.hold - 12) % 4 === 0) return P.lastDir; }
    else P.hold = 0;
    return d;
  }
  function updatePuz() {
    var P = g.puz, p = P.p, st = g.pz[P.id];
    P.t++;
    if (P.kind === 'look') { if (pressed(BTN.B)) exitPuz(); return; }
    if (P.okT) { if (--P.okT === 0) solvedPuz(false); return; }
    if (pressed(BTN.B)) { sfx('escape_menu'); exitPuz(); return; }
    var d = puzDir();
    if (P.kind === 'dial') {
      var C = Array.from(p.chars), G = dialGeom(p);
      if (d === BTN.LEFT) { st.sel = (st.sel + p.n - 1) % p.n; sfx('escape_move'); }
      else if (d === BTN.RIGHT) { st.sel = (st.sel + 1) % p.n; sfx('escape_move'); }
      else if (d === BTN.UP || d === BTN.DOWN) {
        var ci = C.indexOf(st.vals[st.sel]);
        ci = (ci + (d === BTN.UP ? 1 : C.length - 1)) % C.length;
        st.vals[st.sel] = C[ci];
        T.clear(G.x0 + st.sel * 5 + 1, G.y + 1, 2, 2); T.print(G.x0 + st.sel * 5 + 1, G.y + 1, dialCh(C[ci]));
        sfx('escape_click');
      }
      if (pressed(BTN.A)) {
        if (L.Dial.check(p, st.vals)) { P.okT = 30; sfx('escape_unlock'); }
        else { sfx('escape_bad'); say(TX.wrong); }
      }
    } else if (P.kind === 'lights') {
      var x = st.sel % 3, y = (st.sel / 3) | 0;
      if (d === BTN.LEFT && x > 0) st.sel--; else if (d === BTN.RIGHT && x < 2) st.sel++;
      else if (d === BTN.UP && y > 0) st.sel -= 3; else if (d === BTN.DOWN && y < 2) st.sel += 3;
      if (d) sfx('escape_move');
      if (pressed(BTN.A)) {
        L.Lights.press(p, st.s, st.sel); sfx('escape_click'); drawPuz(false);
        if (L.Lights.done(st.s)) P.okT = 40;
      }
    } else if (P.kind === 'rings') {
      if (d === BTN.LEFT) { st.sel = (st.sel + 2) % 3; sfx('escape_move'); }
      else if (d === BTN.RIGHT) { st.sel = (st.sel + 1) % 3; sfx('escape_move'); }
      if (pressed(BTN.A)) {
        L.Rings.press(p, st.s, st.sel); sfx('escape_click'); drawPuz(false);
        if (L.Rings.done(st.s)) P.okT = 40;
      }
    } else if (P.kind === 'pipes') {
      var px = st.sel % p.w, py = (st.sel / p.w) | 0;
      if (d === BTN.LEFT && px > 0) st.sel--; else if (d === BTN.RIGHT && px < p.w - 1) st.sel++;
      else if (d === BTN.UP && py > 0) st.sel -= p.w; else if (d === BTN.DOWN && py < p.h - 1) st.sel += p.w;
      if (d) sfx('escape_move');
      if (pressed(BTN.A)) {
        var c = st.cells[st.sel];
        c.r = (c.r + 1) % L.Pipes.mod(c.t); sfx('escape_click'); drawPuz(false);
        if (st.ok) P.okT = 50;
      }
    }
  }

  /* ============================================================ 探索（游標） */
  function hoverAt(x, y) {
    if (y >= BAR_ROW * 8 && y < BAR_ROW * 8 + 16) {
      for (var k = 0; k < SLOTS; k++) if (g.st.inv[k] && inR(x, y, slotPx(k))) return { t: 'slot', k: k, id: g.st.inv[k] };
      return null;
    }
    if (y < VROW * 8 || y >= BAR_ROW * 8) return null;
    if (y >= 72 && y < 120) { if (x < 14) return { t: 'turn', d: -1 }; if (x >= 242) return { t: 'turn', d: 1 }; }
    var r = room(), dir = DIRS[g.dir];
    for (var i = r.hot.length - 1; i >= 0; i--) {
      var h = r.hot[i];
      if (h.v !== dir || !L.visible(r, g.st, h)) continue;
      if (inR(x, y, rectPx(h))) return { t: 'hot', h: h };
    }
    return null;
  }
  function moveCursor() {
    var m = 0;
    if (held(BTN.LEFT)) m |= BTN.LEFT; if (held(BTN.RIGHT)) m |= BTN.RIGHT;
    if (held(BTN.UP)) m |= BTN.UP; if (held(BTN.DOWN)) m |= BTN.DOWN;
    if (!m) { g.holdF = 0; g.edgeF = 0; return; }
    g.holdF++;
    var sp = held(BTN.B) ? 1 : (g.holdF > 8 ? 3 : 1);
    if (held(BTN.B)) g.bMoved = true;
    var ox = g.cx;
    if (m & BTN.LEFT) g.cx -= sp; if (m & BTN.RIGHT) g.cx += sp;
    if (m & BTN.UP) g.cy -= sp; if (m & BTN.DOWN) g.cy += sp;
    g.cx = Math.max(0, Math.min(252, g.cx)); g.cy = Math.max(VROW * 8, Math.min(BAR_ROW * 8 + 14, g.cy));
    // 推到左右邊緣持續 20 幀 = 轉身（房間畫面範圍內）
    if (g.cy < BAR_ROW * 8 && ((m & BTN.LEFT && ox === 0 && g.cx === 0) || (m & BTN.RIGHT && ox === 252 && g.cx === 252))) {
      if (++g.edgeF >= EDGE_F) { turn(m & BTN.LEFT ? -1 : 1); g.cx = m & BTN.LEFT ? 236 : 16; }
    } else g.edgeF = 0;
  }
  function updateExplore() {
    moveCursor();
    g.hover = hoverAt(g.cx, g.cy);
    // B：點一下 = 放下物品；按住 + 十字鍵 = 微調
    if (held(BTN.B)) g.bHold++;
    else {
      if (g.bHold > 0 && g.bHold < 20 && !g.bMoved && g.sel) { g.sel = null; sfx('escape_menu'); }
      g.bHold = 0; g.bMoved = false;
    }
    if (pressed(BTN.SELECT)) { hint(); return; }
    if (pressed(BTN.A)) {
      var hv = g.hover;
      if (!hv) { sfx('escape_move'); return; }
      if (hv.t === 'turn') { turn(hv.d); return; }
      if (hv.t === 'slot') {
        if (!g.sel) { g.sel = hv.id; sfx('escape_use'); }
        else if (g.sel === hv.id) { g.sel = null; sfx('escape_menu'); }
        else combine(g.sel, hv.id);
        g.idleKey = null;
        return;
      }
      interact(hv.h);
    }
  }

  /* ============================================================ 結算 */
  function rankOf(eff, par) {
    if (eff <= par) return 'S';
    if (eff <= par * 1.5) return 'A';
    if (eff <= par * 2.5) return 'B';
    return 'C';
  }
  function roomClear() {
    var r = room(), eff = g.time + g.hints * HINT_COST, rk = g.hints === 0 && eff <= r.par ? 'S' : rankOf(eff, r.par);
    if (rk === 'S' && g.hints > 0) rk = 'A';
    g.mode = 'result'; g.puz = null; g.sel = null;
    var best = CT.load(ID, 'best' + g.room, null), nb = false;
    if (!g.runCheats) {
      if (!best || eff < best.t) { CT.save(ID, 'best' + g.room, { t: eff, r: rk }); nb = true; }
      if (CT.load(ID, 'clear', 0) < g.room + 1) CT.save(ID, 'clear', g.room + 1);
      if (g.room === 0) g.goalHit = true;
    }
    g.result = { room: g.room, time: g.time, hints: g.hints, eff: eff, rank: rk, newBest: nb, cheated: g.runCheats > 0 };
    Au.stop(); Au.play('escape_clear');
    screenText('result');
    var R0 = g.result, y = 5;
    T.frame(2, 4, 28, 17, { fill: false });          // 不填底、不改屬性：保留評價徽章（pal 2）
    T.print(4, y, TX.roomNames[R0.room]);
    T.print(4, y + 2, TX.clearTitle);
    T.print(4, y + 5, TX.timeLabel + '  ' + mmss(R0.time));
    T.print(4, y + 7, TX.hintLabel + '  ' + R0.hints + ' ' + TX.times + (R0.hints ? '（+' + mmss(R0.hints * HINT_COST) + '）' : ''));
    T.print(4, y + 10, TX.rankLabel);
    T.print(13, y + 10, TX.rankWords[rk]);
    T.print(4, y + 13, R0.cheated ? TX.cheated : (nb ? TX.newBest : TX.best + '  ' + mmss(best.t) + '  ' + TX.rankBig[best.r]));
    T.print(4, 22, R0.room < 2 ? TX.nextRoom : TX.lastRoom);
    g.t = 0;
  }
  function timeUp() {
    g.mode = 'timeup'; g.puz = null; g.talk = false;
    Au.stop(); Au.play('escape_over');
    screenText('timeup');
    T.frame(4, 8, 24, 12, { pal: 0 });
    T.print(6, 10, TX.roomNames[g.room]);
    T.print(6, 13, TX.timeUp);
    T.print(6, 16, TX.timeUpHelp);
    T.print(6, 22, TX.timeUpCheat);
    g.t = 0;
  }

  /* ============================================================ 標題 / 說明 / 選房 / 故事 */
  function toTitle() {
    g.mode = 'title'; g.paused = false; g.talk = false; g.puz = null;
    screenText('title');
    textAttr(0, 2, 32, 2, 2);
    T.print(12, 2, TX.title);
    menu = T.menu({ x: 9, y: 20, items: TX.menu, cancel: false, pal: 0, input: true, onMove: function () { sfx('escape_move'); }, onChoose: titleChoose });
    menu.open();
    T.flush();
    Au.stop(); Au.play('escape_title');
    g.t = 0;
  }
  function titleChoose(k) {
    sfx('escape_menu');
    if (k === 0) story('intro', function () { startRoom(0); });
    else if (k === 1) toSelect();
    else toHelp();
  }
  function toHelp() {
    g.mode = 'help'; screenText('help');
    textAttr(0, 0, 32, 30, 0);
    T.print(12, 2, TX.menu[2]);
    box = T.box({ x: 1, y: 5, w: 30, h: 22, input: false, pal: 0 });
    say(TX.help, function () { toTitle(); });
  }
  function toSelect() {
    g.mode = 'select'; screenText('select');
    textAttr(0, 0, 32, 30, 0);
    T.print(12, 4, TX.selectTitle);
    var n = CT.load(ID, 'clear', 0), items = TX.roomNames.map(function (s, i) { return i <= n ? s : TX.locked; });
    menu = T.menu({ x: 6, y: 8, items: items, pal: 0, input: true, onMove: function () { sfx('escape_move'); }, onChoose: function (k) {
      if (k < 0) { sfx('escape_menu'); toTitle(); return; }
      if (k > n) { sfx('escape_bad'); menu.phase = 'open'; return; }
      sfx('escape_menu'); startRoom(k);
    } });
    menu.open();
    T.print(6, 18, TX.back);
    for (var i = 0; i < 3; i++) {
      var b = CT.load(ID, 'best' + i, null);
      T.print(22, 9 + i * 2, b ? TX.rankBig[b.r] + ' ' + mmss(b.t) : '');
    }
  }
  // 故事：一段段 [名字, 文字]
  function story(key, then) {
    g.mode = 'story';
    var segs = key === 'intro' ? [[TX.keeper, TX.intro]] : (key === 'end' ? TX.ending : [[TX.keeper, TX.between[key]]]);
    screenText(key === 'end' ? 'end' : 'story');
    textAttr(0, 16, 32, 14, 0);
    box = T.box({ x: 1, y: 20, w: 30, h: 8, input: false, pal: 0 });
    Au.stop(); Au.play('escape_title');
    var i = 0;
    (function next() {
      if (i >= segs.length) { then(); return; }
      var s = segs[i++];
      say(s[1], next, s[0]);
    })();
  }

  /* ============================================================ 暫停 */
  // fix-r9：磁磚多的牆面字形池只有 ~90 磚。沒在對話 ⇒ 清掉訊息框（解除暫停後 idleText 重畫），HUD 換成「暫停中 / START 繼續」、
  //   物品欄位置印「長按 START+SELECT：回選單」；對話中 ⇒ 對話框已依「池 − 框外用字」分好頁，不再新增任何字，只用精靈畫暫停記號。
  function setPause(on) {
    if (g.paused === on) return;
    g.paused = on;
    if (on) Au.pause(); else Au.resume();
    sfx('escape_menu');
    if (on) g.pauseText = !g.talk;
    if (!g.pauseText) return;
    T.clear(1, 2, 20, 2);
    T.print(1, 2, on ? TX.pause : room().name);
    T.print(11, 2, on ? TX.resume : (g.puz ? TX.leave : TX.dirFull[g.dir]));
    T.clear(0, BAR_ROW, 32, 2);
    if (on) {
      T.clear(BOX.x + 1, BOX.y + 1, BOX.w - 2, BOX.h - 2); g.idleKey = null;
      T.print(4, BAR_ROW, TX.pauseHelp[1]);
      T.print(BOX.x + 2, BOX.y + 1, TX.pauseHelp[0]);
    } else T.call(function () { T.release(0, BAR_ROW, 32, 2); drawBar(false); });
  }

  /* ============================================================ 精靈 */
  function drawSprites() {
    var i;
    for (i = 0; i < 16; i++) ppu0.sprite(i, null);
    var S = function (n) { return spr.index(n); };
    if (g.mode !== 'room') return;
    if (g.paused) {                                  // 暫停記號（兩條直槓，在剩餘時間左邊）
      ppu0.sprite(0, { x: 184, y: 24, tile: S('S_PAUSE'), pal: 0 });
      return;
    }
    var blink = (g.frames >> 4) & 1;
    if (g.puz) {
      var P = g.puz, p = P.p, st = g.pz[P.id];
      if (g.talk || P.kind === 'look') return;
      var bx = -1, by = -1, bw = 16, bh = 16;
      if (P.kind === 'dial') {
        var G = dialGeom(p), cx = (G.x0 + st.sel * 5) * 8 + 12;
        ppu0.sprite(0, { x: cx, y: G.y * 8 - 9, tile: S('S_UP'), pal: 2 });
        ppu0.sprite(1, { x: cx, y: (G.y + 4) * 8 + 1, tile: S('S_DOWN'), pal: 2 });
        return;
      }
      if (P.kind === 'lights') { var lp = lampPos(st.sel); bx = lp.col * 8; by = lp.row * 8; }
      else if (P.kind === 'pipes') { var pp = pipePos(p, st.sel); bx = pp.col * 8; by = pp.row * 8; }
      else if (P.kind === 'rings') { ppu0.sprite(0, { x: (3 + st.sel * 9) * 8 - 9, y: (VROW + 13) * 8 + 4, tile: S('S_RIGHT'), pal: 2 }); return; }
      if (bx >= 0 && blink) {
        ppu0.sprite(0, { x: bx - 3, y: by - 3, tile: S('S_TL'), pal: 1 }); ppu0.sprite(1, { x: bx + bw - 5, y: by - 3, tile: S('S_TR'), pal: 1 });
        ppu0.sprite(2, { x: bx - 3, y: by + bh - 5, tile: S('S_BL'), pal: 1 }); ppu0.sprite(3, { x: bx + bw - 5, y: by + bh - 5, tile: S('S_BR'), pal: 1 });
      }
      return;
    }
    // 轉身箭頭
    var hv = g.hover;
    ppu0.sprite(4, { x: 3, y: 92, tile: S('S_LEFT'), pal: (hv && hv.t === 'turn' && hv.d < 0 && blink) ? 0 : 2 });
    ppu0.sprite(5, { x: 245, y: 92, tile: S('S_RIGHT'), pal: (hv && hv.t === 'turn' && hv.d > 0 && blink) ? 0 : 2 });
    // 拿著的物品：物品欄四角
    if (g.sel) {
      var k = g.st.inv.indexOf(g.sel);
      if (k >= 0 && (blink || g.talk)) {
        var sx = 16 + k * 32, sy = BAR_ROW * 8;
        ppu0.sprite(6, { x: sx - 3, y: sy - 2, tile: S('S_TL'), pal: 1 }); ppu0.sprite(7, { x: sx + 11, y: sy - 2, tile: S('S_TR'), pal: 1 });
        ppu0.sprite(8, { x: sx - 3, y: sy + 10, tile: S('S_BL'), pal: 1 }); ppu0.sprite(9, { x: sx + 11, y: sy + 10, tile: S('S_BR'), pal: 1 });
      }
    }
    if (g.talk) return;
    // 游標（放大鏡 = 可調查；手 = 拿著物品）
    var t = g.sel ? 'S_HAND' : (hv && hv.t !== 'turn' ? 'S_LOOK' : 'S_ARROW'), off = t === 'S_ARROW' ? 0 : 3;
    ppu0.sprite(0, { x: g.cx - off, y: g.cy - off, tile: S(t), pal: 0 });
  }

  /* ============================================================ 主迴圈 */
  function update() {
    g.frames++; g.t++;
    pumpWQ();
    if (g.mode === 'title' || g.mode === 'select') { /* menu 由 T.update 讀手把 */ }
    else if (g.mode === 'help' || g.mode === 'story') { if (g.talk) updateTalk(); }
    else if (g.mode === 'result') {
      if (g.t > 30 && pressed(BTN.A)) {
        sfx('escape_menu');
        var nx = g.room + 1;
        if (nx < 3) story(g.room, function () { startRoom(nx); });
        else story('end', function () { toTitle(); });
      } else if (g.t > 30 && pressed(BTN.B)) toTitle();
    } else if (g.mode === 'timeup') {
      if (g.t > 30 && pressed(BTN.A)) startRoom(g.room);
      else if (g.t > 30 && pressed(BTN.B)) toTitle();
    } else if (g.mode === 'room') {
      if (pressed(BTN.START) && !(held(BTN.SELECT))) { setPause(!g.paused); }
      else if (!g.paused) {
        g.time++;
        if (g.time >= room().limit) { timeUp(); T.update(); return; }
        if (g.time % 60 === 0) drawTime(false);
        if (g.talk) updateTalk();
        else if (g.puz) updatePuz();
        else updateExplore();
        if (g.mode === 'room' && !g.talk) idleText(false);
        // 特寫：說明打完就收起 ■（文字留著）
        if (g.puz && g.talk && g.autoClose && box && box.state().phase === 'end') box.next();
      }
    }
    if (T) T.update();
  }

  /* ============================================================ 機器人（照解題路線用游標操作；反應延遲 ≥ 12 幀） */
  function botMove(tx, ty) {
    var dx = tx - g.cx, dy = ty - g.cy, m = 0, fine = Math.abs(dx) <= 6 && Math.abs(dy) <= 6;
    if (dx > 1) m |= BTN.RIGHT; else if (dx < -1) m |= BTN.LEFT;
    if (dy > 1) m |= BTN.DOWN; else if (dy < -1) m |= BTN.UP;
    if (m && fine) m |= BTN.B;                    // 靠近了：按住 B 微調（1 px）
    return m;
  }
  function botPress(mask) { g.bot.seq = [mask, 0]; g.bot.wait = 0; g.bot.after = 13; return 0; }
  // 熱點上「真的會點到它」的點（被後面的熱點蓋住的地方不算），取最靠近中心的
  function center(h) {
    var r = rectPx(h), cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1), best = null, bd = 1e9;
    for (var y = r.y + 2; y < r.y + r.h - 1; y += 4) for (var x = r.x + 2; x < r.x + r.w - 1; x += 4) {
      var hv = hoverAt(x, y);
      if (!hv || hv.t !== 'hot' || hv.h !== h) continue;
      var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd) { bd = d; best = { x: x, y: y }; }
    }
    return best || { x: cx, y: cy };
  }
  function botGoClick(x, y) {
    var m = botMove(x, y);
    if (m) { g.bot.arrive = 0; return m; }
    if (++g.bot.arrive < 12) return 0;             // 對準後停一下（人類反應）
    g.bot.arrive = 0;
    return botPress(BTN.A);
  }
  function botExplore() {
    var r = room(), plan = L.solve(r, g.st);
    if (!plan || !plan.length) return 0;
    var a = plan[0];
    if (a.t === 'combo') {
      if (g.sel && g.sel !== a.a) return botPress(BTN.B);
      if (!g.sel) { var k = g.st.inv.indexOf(a.a), s = slotPx(k); return botGoClick(s.x + 12, s.y + 8); }
      var k2 = g.st.inv.indexOf(a.b), s2 = slotPx(k2); return botGoClick(s2.x + 12, s2.y + 8);
    }
    var h = L.hot(r, a.h);
    if (h.v !== DIRS[g.dir]) {
      var want = DIRS.indexOf(h.v), d = (want - g.dir + 4) % 4;
      return d === 3 ? botGoClick(6, 96) : botGoClick(249, 96);
    }
    if ((a.i || null) !== (g.sel || null)) {
      if (g.sel) return botPress(BTN.B);
      var k3 = g.st.inv.indexOf(a.i), s3 = slotPx(k3); return botGoClick(s3.x + 12, s3.y + 8);
    }
    var c = center(h);
    return botGoClick(c.x, c.y);
  }
  function botPuz() {
    var P = g.puz, p = P.p, st = g.pz[P.id];
    if (P.okT) return 0;
    if (P.kind === 'look') return botPress(BTN.B);
    var dirTo = function (cur, tgt, w) {
      var cx = cur % w, cy = (cur / w) | 0, tx = tgt % w, ty = (tgt / w) | 0;
      if (tx > cx) return BTN.RIGHT; if (tx < cx) return BTN.LEFT; if (ty > cy) return BTN.DOWN; if (ty < cy) return BTN.UP; return 0;
    };
    if (P.kind === 'dial') {
      var pl = L.Dial.plan(p, st.vals, st.sel), k = pl[0];
      return botPress({ U: BTN.UP, D: BTN.DOWN, L: BTN.LEFT, R: BTN.RIGHT, A: BTN.A }[k]);
    }
    if (P.kind === 'lights') {
      var sol = L.Lights.solve(p, st.s);
      if (!sol || !sol.length) return 0;
      var m = dirTo(st.sel, sol[0], 3);
      return botPress(m || BTN.A);
    }
    if (P.kind === 'rings') {
      var cnt = L.Rings.solve(p, st.s);
      if (!cnt) return 0;
      for (var b = 0; b < cnt.length; b++) if (cnt[b]) {
        if (st.sel !== b) return botPress(b > st.sel ? BTN.RIGHT : BTN.LEFT);
        return botPress(BTN.A);
      }
      return 0;
    }
    if (P.kind === 'pipes') {
      var pk = L.Pipes.solve(p, st.cells);
      if (!pk) return 0;
      for (var i in pk) {
        if (st.cells[i].r === pk[i]) continue;
        var m2 = dirTo(st.sel, +i, p.w);
        return botPress(m2 || BTN.A);
      }
    }
    return 0;
  }
  function bot() {
    var b = g.bot;
    if (b.seq.length) return b.seq.shift();
    if (b.after > 0) { b.after--; return 0; }
    if (b.wait > 0) { b.wait--; return 0; }
    if (g.mode === 'title') {
      if (!menu || menu.state().phase !== 'open') return 0;
      if (menu.state().sel !== 0) return botPress(BTN.UP);
      b.wait = 14; return botPress(BTN.A);
    }
    if (g.talk) {
      var ph = box && box.state().phase;
      if (ph === 'wait' || ph === 'end') { if (++b.read < 14) return 0; b.read = 0; return botPress(BTN.A); }
      return 0;
    }
    if (g.mode === 'result') { if (g.t < 40) return 0; return botPress(BTN.A); }
    if (g.mode === 'timeup') { if (g.t < 40) return 0; return botPress(BTN.A); }
    if (g.mode !== 'room' || g.paused) return 0;
    if (T && T.busy()) return 0;
    if (g.puz) return botPuz();
    return botExplore();
  }

  /* ============================================================ 註冊 */
  var GAME = {
    id: ID, order: 2, title: '星塵密室', legacy: ['escape-room.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu;
      A = E.Art; L = E.Logic; Au = E.Audio; TX = E.TXT; R = E.ROOMS;
      spr = A.sprBank();
      ppu0.spriteMode(8); ppu0.flicker = 'none';
      g = {
        mode: 'title', frames: 0, t: 0, room: 0, st: L.newState(), dir: 0, sel: null, time: 0, hints: 0, hintStage: {},
        cheats: 0, runCheats: 0, goalHit: false, tutItem: false, paused: false, talk: false, puz: null, pz: {},
        cx: 124, cy: 100, hover: null, result: null, stat: null, ico: {}, ext: {},
        bot: { seq: [], wait: 0, after: 0, arrive: 0, read: 0 }
      };
      Au.init(nes);
      var rq = parseInt((CT.query && CT.query('room')) || '', 10);
      if (rq >= 1 && rq <= 3) startRoom(rq - 1);
      else toTitle();
    },
    update: function () { update(); Au.tick(); },
    draw: function () { if (g) drawSprites(); },
    exit: function () {
      Au.stop();
      if (g && g.mode === 'result' && !g.runCheats) CT.save(ID, 'last', g.room);
    },
    get backTile() { if (!spr) spr = E.Art.sprBank(); return { tile: spr.index('S_DOT'), pal: 3 }; },
    state: function () {
      if (!g) return null;
      var bs = box && box.state();
      return {
        mode: g.mode, room: g.room, dir: DIRS[g.dir], flags: Object.keys(g.st.f).sort(), inv: g.st.inv.slice(), sel: g.sel,
        cx: g.cx, cy: g.cy, hover: g.hover ? (g.hover.t === 'hot' ? g.hover.h.id : g.hover.t + (g.hover.id || g.hover.d)) : null,
        talk: g.talk, box: bs ? { phase: bs.phase, page: bs.page, pages: bs.pages, lines: bs.lines } : null,
        puz: g.puz ? { id: g.puz.id, kind: g.puz.kind, st: JSON.parse(JSON.stringify(g.pz[g.puz.id] || {})) } : null,
        time: g.time, limit: R[g.room].limit, hints: g.hints, step: L.step(R[g.room], g.st), paused: g.paused,
        cheats: g.cheats, runCheats: g.runCheats, result: g.result, goal: GAME.goal(), stat: g.stat,
        music: Au.current, lastSfx: Au.lastSfx, text: T ? T.stats() : null, menu: menu ? menu.state() : null, wq: WQ.length
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goalHit); },
    // 選單：通關幾間 + 第一室最佳評價（右對齊 6 字元，例如 ` 2/3 A`）
    bestText: function () {
      var n = CT.load(ID, 'clear', 0), b = CT.load(ID, 'best0', null), s = n + '/3' + (b ? ' ' + b.r : '');
      while (s.length < 6) s = ' ' + s;
      return s;
    }
  };

  E.dev = {
    start: function (i) { startRoom(i); },
    g: function () { return g; },
    set: function (k, v) { g[k] = v; },
    flags: function (acts) { L.apply(g.st, acts); screenRoom(); },
    open: function (id) { openPuz(id); },
    face: function (d) { g.dir = d; screenRoom(); },
    title: function () { toTitle(); },
    timeUp: function () { g.time = R[g.room].limit - 1; },
    hoverAt: function (x, y) { return hoverAt(x, y); },
    hotPoint: function (id) { return center(L.hot(room(), id)); },
    // 撥盤特寫：每格數字左上角的名稱表位置 + 依狀態「應該」顯示的字（測試讀 PPU 對照）
    dialCells: function () {
      if (!g.puz || g.puz.kind !== 'dial') return null;
      var p = g.puz.p, st = g.pz[g.puz.id], G = dialGeom(p), out = [];
      for (var i = 0; i < p.n; i++) out.push({ col: G.x0 + i * 5 + 1, row: G.y + 1, ch: dialCh(st.vals[i]) });
      return out;
    },
    screen: function (kind) { if (kind === 'help') toHelp(); else if (kind === 'select') toSelect(); else if (kind === 'title') toTitle(); else if (kind === 'timeup') timeUp(); else if (kind === 'story') story('intro', function () {}); else if (kind === 'end') story('end', function () {}); else if (kind === 'between0' || kind === 'between1') story(+kind.slice(-1), function () {}); else if (kind === 'result') roomClear(); },
    pause: function (on) { setPause(on); },
    consts: { VROW: VROW, BAR_ROW: BAR_ROW, BOX: BOX, HINT_COST: HINT_COST, SLOTS: SLOTS }
  };
  void newRun;
  if (CT.register) CT.register(GAME);
  E.GAME = GAME;
})();
