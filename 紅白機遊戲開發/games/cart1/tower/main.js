/*
 * games/cart1/tower/main.js — 《星塵塔防》（合輯槽 8，id = tower，全域只用 CT.Tower）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-4 cart1-strategy agent（R5）｜ 依賴：tower/{chr,maps,song}.js、engine/*、games/cart1/registry.js
 *
 * 畫面：第 1 列 = 上方 HUD（波次 / 金錢 / 生命 / 快轉）；第 2~25 列 = 16×12 格地圖（每格 = 一個屬性區塊）；
 *       第 26~28 列 = 下方面板（選的塔 / 游標資訊 / 下一波倒數）。
 * 游標 = **屬性表換色**（游標格與射程範圍切到 pal3 高亮組，每次 1 byte）⇒ 不佔任何精靈。
 * 精靈只給敵人 / 子彈 / 火花：
 *   - 敵人排隊（maps.js GAP = 24 px）⇒ 每線敵人數有設計上界（三張圖 6 / 6 / 5，魔王 +1）；
 *   - 子彈 / 火花 / 煙走「逐線配額器」：該幀那幾條線還有空位才畫，起點每幀輪替（遊戲自己做，
 *     PPU 層面永遠 ≤ 8，`ppu.flicker = 'none'`）；畫不下的次數記在 state().fxSkipped。
 * 背景寫入走佇列（每幀上限 120 byte，剩下的下一幀補）⇒ VBlank 160 byte 預算永不超支。
 *
 * 操作：十字鍵移游標（按住連發）／A 蓋塔 · 升級／B 換塔種（在塔上按住 = 賣掉，退 60%）／
 *       SELECT 準備時 = 立刻開波、開打後 = 快轉 ×2 切換／START 暫停
 * 流程：title → howto → select（3 張圖，前一張守完才解鎖）→ play（10 波）→ clear / over
 * 密技 cheat()（brief §6-1）：遊玩中 = +300 金、生命 +10（上限 30）；失守畫面 = **原地續關**：從失守那一波重打
 *   （塔 / 金錢 / 分數回到該波開打那一刻、生命補回 20）；標題 / 說明 / 選圖 / 通關畫面無效。
 *   用過密技的那一張圖不算 goal（goal = 第 1 張圖「沒用密技」守完 10 波）。
 * 失守後一般流程也能 A = RETRY WAVE（qa-r5 P3-3 友善版：快照同上、生命 = max(10, 開波時生命)），START = 回標題。
 * 暫停 = BGM 停、解除暫停接續播；exit() 也存最高分；backTile = 精靈表裡的實心方塊（回選單提示用）
 * 網址：`?game=tower&map=1..3`（直接開某張圖，測試用）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var T = CT.Tower = CT.Tower || {};
  var BTN = NES.Input.BTN;
  var Art = T.Art, Audio = T.Audio;

  var GAP = T.GAP, MAP_Y = 16, WAVES_N = 10, PREP = 360, LIVES = 20;
  var MAX_EN = 40, MAX_BUL = 16, MAX_FX = 16, BG_CAP = 120, SELL_HOLD = 40;
  var nes0 = null, ppu = null, g = null;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  function released(b) { return NES.Input.released(b); }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }

  function newGame() {
    return {
      mode: 'title', t: 0, frames: 0, mi: 0, map: null, cells: null, towers: [],
      en: [], bul: [], fx: [], wave: 0, phase: 'prep', prepT: PREP, spawn: [], spawnIdx: 0, spawnCd: 0,
      money: 0, lives: LIVES, score: 0, fast: false, paused: false,
      cur: { c: 7, r: 5 }, sel: 0, bHold: 0, rep: 0, hiBlocks: [], blink: 0,
      q: [], hud: [], hudCur: [], sprPrev: 0, mapsCleared: [false, false, false], selRow: 0,
      kills: 0, leaks: 0, fxSkipped: 0, enemyHidden: 0, maxEnemyLine: 0, maxLineAll: 0,
      bgPeak: 0, cheats: 0, lastWaveCleared: 0, enemyId: 0, bot: null,
      snap: null, resume: null, retries: 0, clean: [false, false, false], pauseSong: null
    };
  }

  /* ============================== 背景寫入佇列 ============================== */
  function qTile(nt, c, r, t) { g.q.push(0, nt, c, r, t); }
  function qAttr(nt, c16, r16, p) { g.q.push(1, nt, c16, r16, p); }
  function flushQ(cap) {
    var n = 0, i = 0, q = g.q;
    while (i < q.length && n < cap) {
      if (q[i] === 0) ppu.setTile(q[i + 1], q[i + 2], q[i + 3], q[i + 4]);
      else ppu.setAttr(q[i + 1], q[i + 2], q[i + 3], q[i + 4]);
      i += 5; n++;
    }
    if (i > 0) g.q.splice(0, i);
    if (n > g.bgPeak) g.bgPeak = n;
    return n;
  }
  function putNow(col, row, str) {
    var t = Art.text(str), i;
    for (i = 0; i < t.length && col + i < 32; i++) ppu.setTile(0, col + i, row, t[i]);
  }
  function center(row, str) { putNow(Math.max(0, (32 - str.length) >> 1), row, str); }
  function frame(c0, r0, w, h) {
    var c, r, B = Art.bg;
    for (c = c0 + 1; c < c0 + w - 1; c++) { ppu.setTile(0, c, r0, B('FR_H')); ppu.setTile(0, c, r0 + h - 1, B('FR_H')); }
    for (r = r0 + 1; r < r0 + h - 1; r++) { ppu.setTile(0, c0, r, B('FR_V')); ppu.setTile(0, c0 + w - 1, r, B('FR_V')); }
    ppu.setTile(0, c0, r0, B('FR_TL')); ppu.setTile(0, c0 + w - 1, r0, B('FR_TR'));
    ppu.setTile(0, c0, r0 + h - 1, B('FR_BL')); ppu.setTile(0, c0 + w - 1, r0 + h - 1, B('FR_BR'));
  }
  function meta(c2, r2, name) {          // 16×16 背景物件（name_0..3）立刻寫
    ppu.setTile(0, c2, r2, Art.bg(name + '_0')); ppu.setTile(0, c2 + 1, r2, Art.bg(name + '_1'));
    ppu.setTile(0, c2, r2 + 1, Art.bg(name + '_2')); ppu.setTile(0, c2 + 1, r2 + 1, Art.bg(name + '_3'));
  }
  function hideAll() { for (var i = 0; i < 64; i++) ppu.sprite(i, { x: 0, y: 240, tile: 0, pal: 0 }); g.sprPrev = 0; }

  /* ============================== 調色盤 ============================== */
  function screenPal() {
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [0x1A, 0x27, 0x30]);
    ppu.setBgPalette(1, [0x09, 0x1A, 0x00]);
    ppu.setBgPalette(2, [0x00, 0x21, 0x28]);
    ppu.setBgPalette(3, [0x16, 0x06, 0x28]);
    sprPal();
  }
  function sprPal() {
    ppu.setSprPalette(0, [0x30, 0x28, 0x16]);
    ppu.setSprPalette(1, [0x0F, 0x14, 0x34]);
    ppu.setSprPalette(2, [0x0F, 0x17, 0x2A]);
    ppu.setSprPalette(3, [0x0F, 0x11, 0x3C]);
  }
  function mapPal(m) {
    var p = m.pal;
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [p.grass, p.path, 0x30]);
    ppu.setBgPalette(1, [p.dark, p.grass, p.rock]);
    ppu.setBgPalette(2, [0x00, 0x21, 0x28]);
    ppu.setBgPalette(3, [p.hiGrass, p.hiPath, 0x30]);
    sprPal();
  }

  /* ============================== 畫面切換 ============================== */
  function enter(mode) {
    g.mode = mode; g.t = 0; g.q.length = 0;
    CT.blank(nes0, function () {
      ppu.split(null); ppu.scroll(0, 0); ppu.mirroring('v');
      ppu.fillTiles(0, 0, 0, 32, 30, Art.bg('SP')); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      hideAll();
      if (mode === 'play') { startMap(); return; }
      screenPal();
      if (mode === 'title') drawTitle();
      else if (mode === 'howto') drawHowto();
      else if (mode === 'select') drawSelect();
      else if (mode === 'clear') drawClear();
      else if (mode === 'over') drawOver();
    });
    if (mode === 'title' || mode === 'select') { if (Audio.current !== 'title') Audio.play('title'); }
    else if (mode === 'play') Audio.play('battle');
    else if (mode === 'clear') Audio.play('clear');
    else if (mode === 'over') Audio.play('over');
  }
  function logo(col, row) {
    Art.glyphNames.forEach(function (n, i) { meta(col + i * 3, row, 'G_' + n); });
  }
  function drawTitle() {
    frame(1, 2, 30, 25);
    logo(10, 5); ppu.fillAttr(0, 5, 2, 6, 2, 3);
    center(9, 'STARDUST TOWER');
    // 裝飾：三種塔 + 星核
    var names = ['N3', 'F3', 'T3'];
    names.forEach(function (n, i) {
      var c = 8 + i * 4;
      ppu.setTile(0, c, 12, Art.bg('TOP_' + n + '_0')); ppu.setTile(0, c + 1, 12, Art.bg('TOP_' + n + '_1'));
      ppu.setTile(0, c, 13, Art.bg('BASE_B3_0')); ppu.setTile(0, c + 1, 13, Art.bg('BASE_B3_1'));
    });
    meta(20, 12, 'CORE');
    ppu.fillAttr(0, 4, 6, 7, 1, 2);
    center(22, 'BEST SCORE ' + pad(CT.load('tower', 'best', 0), 6));
    center(24, '3 MAPS  X  10 WAVES');
  }
  function drawHowto() {
    frame(1, 2, 30, 25);
    center(4, 'HOW TO DEFEND');
    // 行距：每行之間空一列（qa-r5 P3-5）
    putNow(4, 6, 'PAD     MOVE CURSOR');
    putNow(4, 8, 'A       BUILD / UPGRADE');
    putNow(4, 10, 'B CHANGE    HOLD B SELL');
    putNow(4, 12, 'SELECT  START WAVE/FAST');
    putNow(4, 14, 'START PAUSE   C/$ CHEAT');
    var rows = [['N1', 'NEEDLE   SHOOTS ONE'], ['F1', 'FROST    SLOWS ALL'], ['T1', 'THUNDER  HITS ALL NEAR']];
    rows.forEach(function (x, i) {
      var r = 16 + i * 2;
      ppu.setTile(0, 4, r, Art.bg('TOP_' + x[0] + '_0')); ppu.setTile(0, 5, r, Art.bg('TOP_' + x[0] + '_1'));
      ppu.setTile(0, 4, r + 1, Art.bg('BASE_B1_0')); ppu.setTile(0, 5, r + 1, Art.bg('BASE_B1_1'));
      ppu.setAttr(0, 2, r >> 1, 2);
      putNow(8, r, x[1]);
    });
    putNow(4, 22, 'EACH TOWER HAS 3 LEVELS');
    center(24, 'HOLD START+SELECT: MENU');
  }
  function unlocked() { return clamp(CT.load('tower', 'unlock', 1) | 0, 1, 3); }
  function drawSelect() {
    frame(1, 2, 30, 25);
    center(4, 'SELECT MAP');
    var u = unlocked();
    T.MAPS.forEach(function (m, i) {
      var r = 8 + i * 4;
      putNow(8, r, (i + 1) + '  ' + m.name);
      if (i >= u) ppu.setTile(0, 6, r, Art.bg('LOCK'));
      else if (g.mapsCleared[i] || CT.load('tower', 'clear' + i, 0)) putNow(24, r, '$');
    });
    center(22, 'A  START');
    selArrow();
  }
  function selArrow() {
    for (var i = 0; i < 3; i++) qTile(0, 5, 8 + i * 4, Art.bg(i === g.selRow ? 'ARROW' : (i >= unlocked() ? 'LOCK' : 'SP')));
    if (unlocked() <= g.selRow) qTile(0, 5, 8 + g.selRow * 4, Art.bg('ARROW'));
  }
  function drawClear() {
    frame(1, 2, 30, 25);
    logo(10, 5); ppu.fillAttr(0, 5, 2, 6, 2, 3);
    center(10, g.map.name);
    center(12, 'ALL 10 WAVES CLEAR');
    center(15, 'LIVES ' + pad(g.lives, 2) + '   KILLS ' + pad(g.kills, 3));
    center(17, 'SCORE ' + pad(g.score, 6));
    center(20, g.mi < 2 ? 'NEXT MAP UNLOCKED' : 'ALL MAPS DEFENDED');
    center(23, 'PUSH START');
  }
  function drawOver() {
    frame(1, 2, 30, 25);
    center(9, 'THE STAR CORE');
    center(11, 'HAS FALLEN');
    center(14, 'WAVE ' + pad(g.wave, 2) + '   SCORE ' + pad(g.score, 6));
    if (g.snap) {
      putNow(6, 18, 'A      RETRY WAVE ' + pad(g.snap.wave, 2));
      putNow(6, 20, 'START  TITLE');
      putNow(6, 22, 'C/$    RETRY + 20 LIVES');
    } else center(20, 'PUSH START');
  }

  /* ============================== 地圖 ============================== */
  function cellCh(c, r) { return g.cells[r][c]; }
  function towerAt(c, r) {
    for (var i = 0; i < g.towers.length; i++) if (g.towers[i].c === c && g.towers[i].r === r) return g.towers[i];
    return null;
  }
  function natPal(c, r) {
    if (towerAt(c, r)) return 2;
    var ch = cellCh(c, r);
    if (ch === 'T' || ch === 'R') return 1;
    if (ch === 'S' || ch === 'C') return 2;
    return 0;
  }
  function cellTiles(c, r) {             // [左上, 右上, 左下, 右下]
    var t = towerAt(c, r), ch = cellCh(c, r), B = Art.bg;
    if (t) {
      var k = { needle: 'N', frost: 'F', thunder: 'T' }[t.type] + (t.lv + 1);
      return [B('TOP_' + k + '_0'), B('TOP_' + k + '_1'), B('BASE_B' + (t.lv + 1) + '_0'), B('BASE_B' + (t.lv + 1) + '_1')];
    }
    if (ch === '#') return [B('PATH'), B('PATH_B'), B('PATH_B'), B('PATH')];
    var nm = { S: 'GATE', C: 'CORE', T: 'TREE', R: 'ROCK' }[ch];
    if (nm) return [B(nm + '_0'), B(nm + '_1'), B(nm + '_2'), B(nm + '_3')];
    return [B('GRASS_A'), B('GRASS_B'), B('GRASS_B'), B('GRASS_A')];
  }
  function drawCellNow(c, r) {
    var t = cellTiles(c, r), x = c * 2, y = 2 + r * 2;
    ppu.setTile(0, x, y, t[0]); ppu.setTile(0, x + 1, y, t[1]); ppu.setTile(0, x, y + 1, t[2]); ppu.setTile(0, x + 1, y + 1, t[3]);
    ppu.setAttr(0, c, 1 + r, natPal(c, r));
  }
  function queueCell(c, r) {
    var t = cellTiles(c, r), x = c * 2, y = 2 + r * 2;
    qTile(0, x, y, t[0]); qTile(0, x + 1, y, t[1]); qTile(0, x, y + 1, t[2]); qTile(0, x + 1, y + 1, t[3]);
  }
  function startMap() {
    var m = T.MAPS[g.mi], rs = g.resume;
    g.map = m; g.path = T.buildPath(m); g.waves = T.wavesFor(g.mi);
    g.cells = m.grid.map(function (row) { return row.split(''); });
    g.towers = []; g.en = []; g.bul = []; g.fx = [];
    g.wave = 1; g.phase = 'prep'; g.prepT = PREP; g.spawn = []; g.spawnIdx = 0; g.spawnCd = 0;
    g.money = m.money; g.lives = LIVES; g.score = 0; g.kills = 0; g.leaks = 0; g.fast = false; g.paused = false;
    g.cur = { c: 7, r: 5 }; g.hiBlocks = []; g.blink = 0; g.pauseSong = null;
    if (rs) {                              // 重打本波：回到該波開打那一刻（塔 / 金錢 / 分數），重新給準備時間
      g.towers = rs.towers.map(function (t) { var o = {}; for (var k in t) o[k] = t[k]; o.cd = 10; return o; });
      g.wave = rs.wave; g.money = rs.money; g.score = rs.score; g.kills = rs.kills; g.leaks = rs.leaks; g.lives = rs.lives;
      g.resume = null;
    } else { g.cheats = 0; g.retries = 0; g.snap = null; }
    mapPal(m);
    var c, r;
    for (r = 0; r < 12; r++) for (c = 0; c < 16; c++) drawCellNow(c, r);
    g.hud = []; g.hudCur = [];
    for (c = 0; c < 128; c++) { g.hud.push(Art.bg('SP')); g.hudCur.push(-1); }
    hudCompose(); hudFlush(999);
    ppu.setAttr(0, 1, 13, 2);              // 下方面板的塔圖示 = pal2
    updateHighlight(true);
    flushQ(9999);
    if (g.bot) g.bot = null;
  }

  /* ============================== 游標 / 射程高亮（屬性表） ============================== */
  function rangeOfCursor() {
    var t = towerAt(g.cur.c, g.cur.r);
    if (t) return T.TOWERS[t.type].lv[t.lv].range;
    if (buildable(g.cur.c, g.cur.r)) return T.TOWERS[T.TOWER_ORDER[g.sel]].lv[0].range;
    return 0;
  }
  function updateHighlight(force) {
    var want = [], c, r, rng = rangeOfCursor(), cx = g.cur.c * 16 + 8, cy = g.cur.r * 16 + 8;
    if (rng > 0) {
      for (r = 0; r < 12; r++) for (c = 0; c < 16; c++) {
        var dx = c * 16 + 8 - cx, dy = r * 16 + 8 - cy;
        if (dx * dx + dy * dy <= rng * rng && !(c === g.cur.c && r === g.cur.r)) want.push(r * 16 + c);
      }
    }
    var old = g.hiBlocks, i, set = {};
    for (i = 0; i < want.length; i++) set[want[i]] = 1;
    for (i = 0; i < old.length; i++) if (!set[old[i]] || force) qAttr(0, old[i] & 15, 1 + (old[i] >> 4), natPal(old[i] & 15, old[i] >> 4));
    var had = {};
    for (i = 0; i < old.length; i++) had[old[i]] = 1;
    for (i = 0; i < want.length; i++) if (!had[want[i]] || force) qAttr(0, want[i] & 15, 1 + (want[i] >> 4), 3);
    g.hiBlocks = want;
  }
  function blinkCursor() {
    var on = ((g.frames >> 3) & 1) === 0;
    qAttr(0, g.cur.c, 1 + g.cur.r, on ? 3 : natPal(g.cur.c, g.cur.r));
  }
  function moveCursor(dc, dr) {
    var oc = g.cur.c, or = g.cur.r;
    var nc = clamp(oc + dc, 0, 15), nr = clamp(or + dr, 0, 11);
    if (nc === oc && nr === or) return;
    qAttr(0, oc, 1 + or, natPal(oc, or));
    g.cur.c = nc; g.cur.r = nr;
    updateHighlight(false);
    qAttr(0, nc, 1 + nr, 3);
    Audio.sfx('tower_move');
  }
  function buildable(c, r) { return cellCh(c, r) === '.' && !towerAt(c, r); }

  /* ============================== 建造 / 升級 / 販賣 ============================== */
  function actA() {
    var t = towerAt(g.cur.c, g.cur.r);
    if (t) {
      if (t.lv >= 2) { Audio.sfx('tower_error'); return false; }
      var up = T.TOWERS[t.type].lv[t.lv + 1].up;
      if (g.money < up) { Audio.sfx('tower_error'); return false; }
      g.money -= up; t.invest += up; t.lv++;
      queueCell(t.c, t.r); updateHighlight(true); Audio.sfx('tower_upgrade');
      return true;
    }
    if (!buildable(g.cur.c, g.cur.r)) { Audio.sfx('tower_error'); return false; }
    var type = T.TOWER_ORDER[g.sel], def = T.TOWERS[type];
    if (g.money < def.cost) { Audio.sfx('tower_error'); return false; }
    g.money -= def.cost;
    g.towers.push({ type: type, lv: 0, c: g.cur.c, r: g.cur.r, x: g.cur.c * 16 + 8, y: MAP_Y + g.cur.r * 16 + 8, cd: 10, invest: def.cost, shots: 0 });
    queueCell(g.cur.c, g.cur.r); updateHighlight(true); Audio.sfx('tower_build');
    return true;
  }
  function sell() {
    var t = towerAt(g.cur.c, g.cur.r);
    if (!t) return false;
    g.money += Math.floor(t.invest * 6 / 10);
    g.towers.splice(g.towers.indexOf(t), 1);
    queueCell(t.c, t.r); updateHighlight(true); Audio.sfx('tower_sell');
    return true;
  }

  /* ============================== 波次 / 敵人 ============================== */
  function startWave() {
    var w = g.waves[g.wave - 1], list = [], i, j;
    for (i = 0; i < w.length; i++) for (j = 0; j < w[i][1]; j++) list.push([w[i][0], w[i][2]]);
    g.spawn = list; g.spawnIdx = 0; g.spawnCd = 0; g.phase = 'run';
    // 快照（重打本波用）：開打那一刻的塔 / 金錢 / 分數 / 生命
    g.snap = { wave: g.wave, money: g.money, score: g.score, kills: g.kills, leaks: g.leaks, lives: g.lives,
      towers: g.towers.map(function (t) { return { type: t.type, lv: t.lv, c: t.c, r: t.r, x: t.x, y: t.y, cd: 10, invest: t.invest, shots: t.shots }; }) };
    Audio.sfx('tower_wave');
  }
  function hpScale() { return g.map.hp * (1 + 0.45 * (g.wave - 1)); }
  function spawnOne(type) {
    if (g.en.length >= MAX_EN) return false;
    var last = g.en[g.en.length - 1];
    if (last && last.s < GAP * 256) return false;            // 出怪口要先空出 GAP
    var d = T.ENEMIES[type], hp = Math.max(1, Math.round(d.hp * hpScale()));
    var e = { id: ++g.enemyId, type: type, d: d, hp: hp, max: hp, s: 0, x: 0, y: 0, slowT: 0, slowF: 256, healCd: 45, hitT: 0 };
    T.posAt(g.map, 0, e);
    g.en.push(e);
    return true;
  }
  function damage(e, dmg) {
    if (e.hp <= 0) return;
    e.hp -= Math.max(1, dmg - e.d.armor);
    e.hitT = 4;
    if (e.hp <= 0) {
      g.money += e.d.reward; g.score += e.d.reward * 10; g.kills++;
      addFx(e.x, e.y, 'puff', 12);
      Audio.sfx('tower_pop');
    }
  }
  function addFx(x, y, kind, t) {
    if (g.fx.length >= MAX_FX) g.fx.shift();
    g.fx.push({ x: x, y: y, kind: kind, t: t });
  }
  function simStep() {
    var i, j, e;
    if (g.phase === 'prep') {
      if (--g.prepT <= 0) startWave();
      return;
    }
    // 出怪
    if (g.spawnIdx < g.spawn.length) {
      if (g.spawnCd > 0) g.spawnCd--;
      else if (spawnOne(g.spawn[g.spawnIdx][0])) { g.spawnCd = g.spawn[g.spawnIdx][1]; g.spawnIdx++; }
    }
    // 移動（排隊：不能貼近前一隻 GAP 以內）
    var end = g.path.len * 256, ahead = null;
    for (i = 0; i < g.en.length; i++) {
      e = g.en[i];
      if (e.hp <= 0) continue;
      var sp = e.d.sp;
      if (e.slowT > 0) { e.slowT--; sp = (sp * e.slowF) >> 8; }
      var ns = e.s + sp;
      if (ahead && ns > ahead.s - GAP * 256) ns = Math.max(e.s, ahead.s - GAP * 256);
      e.s = ns;
      if (e.hitT > 0) e.hitT--;
      T.posAt(g.map, e.s >> 8, e);
      if (e.s >= end) {
        e.hp = 0; e.leaked = true;
        g.lives -= e.d.lives; g.leaks++;
        Audio.sfx('tower_leak');
        continue;
      }
      if (e.d.heal && --e.healCd <= 0) {
        e.healCd = 45;
        for (j = 0; j < g.en.length; j++) {
          var o = g.en[j];
          if (o === e || o.hp <= 0) continue;
          var dx = o.x - e.x, dy = o.y - e.y;
          if (dx * dx + dy * dy <= 28 * 28) o.hp = Math.min(o.max, o.hp + e.d.heal);
        }
      }
      ahead = e;
    }
    // 塔
    for (i = 0; i < g.towers.length; i++) towerStep(g.towers[i]);
    // 子彈
    for (i = 0; i < g.bul.length; i++) {
      var b = g.bul[i], tg = b.target;
      if (!tg || tg.hp <= 0) { tg = b.target = nearest(b.x >> 8, b.y >> 8, 24); }
      if (!tg || --b.life <= 0) { b.dead = true; continue; }
      var bx = b.x >> 8, by = b.y >> 8, ddx = tg.x - bx, ddy = tg.y - by, ad = Math.abs(ddx) + Math.abs(ddy);
      if (ad <= 4) { damage(tg, b.dmg); addFx(tg.x, tg.y, 'spark', 4); b.dead = true; continue; }
      b.x += Math.round(ddx * 768 / ad); b.y += Math.round(ddy * 768 / ad);
    }
    g.bul = g.bul.filter(function (b) { return !b.dead; });
    // 收屍
    for (i = g.en.length - 1; i >= 0; i--) if (g.en[i].hp <= 0) g.en.splice(i, 1);
    for (i = g.fx.length - 1; i >= 0; i--) if (--g.fx[i].t <= 0) g.fx.splice(i, 1);
    if (g.lives <= 0) { g.lives = 0; gameOver(); return; }
    // 波次結束
    if (g.spawnIdx >= g.spawn.length && g.en.length === 0) {
      g.money += 15 + 3 * g.wave; g.score += 100 * g.wave; g.lastWaveCleared = g.wave;
      if (g.wave >= WAVES_N) { mapClear(); return; }
      g.wave++; g.phase = 'prep'; g.prepT = PREP;
    }
  }
  function nearest(x, y, r) {
    var best = null, bd = r * r;
    for (var i = 0; i < g.en.length; i++) {
      var e = g.en[i]; if (e.hp <= 0) continue;
      var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }
  function towerStep(t) {
    if (t.cd > 0) { t.cd--; return; }
    var L = T.TOWERS[t.type].lv[t.lv], r2 = L.range * L.range, i, e, hit = 0, best = null;
    for (i = 0; i < g.en.length; i++) {
      e = g.en[i]; if (e.hp <= 0) continue;
      var dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      if (t.type === 'needle') { if (!best || e.s > best.s) best = e; }
      else if (t.type === 'frost') { e.slowT = 70; e.slowF = L.slow; damage(e, L.dmg); hit++; }
      else { damage(e, L.dmg); addFx(e.x, e.y - 2, 'spark', 6); hit++; }
    }
    if (t.type === 'needle') {
      if (!best) return;
      if (g.bul.length >= MAX_BUL) return;
      g.bul.push({ x: t.x << 8, y: (t.y - 4) << 8, target: best, dmg: L.dmg, life: 90 });
      t.shots++;
      Audio.sfx('tower_shot');
    } else {
      if (!hit) return;
      t.shots++;
      Audio.sfx(t.type === 'frost' ? 'tower_freeze' : 'tower_zap');
      if (t.type === 'thunder') addFx(t.x, t.y - 4, 'spark', 6);
    }
    t.cd = L.rate;
  }
  function mapClear() {
    g.mapsCleared[g.mi] = true;
    if (g.cheats === 0) g.clean[g.mi] = true;
    g.score += g.lives * 200;
    CT.save('tower', 'clear' + g.mi, 1);
    if (unlocked() < g.mi + 2 && g.mi < 2) CT.save('tower', 'unlock', g.mi + 2);
    saveBest();
    enter('clear');
  }
  function gameOver() { saveBest(); enter('over'); }
  // 從失守那一波重打（full = 密技：生命補回 20；一般 RETRY：生命 = max(10, 開波時生命)）
  function retryWave(full) {
    var sn = g.snap;
    if (!sn) return false;
    g.resume = { wave: sn.wave, money: sn.money, score: sn.score, kills: sn.kills, leaks: sn.leaks, towers: sn.towers,
      lives: full ? LIVES : Math.max(10, sn.lives) };
    g.retries++;
    enter('play');
    return true;
  }
  function setPause(on) {                    // 暫停 = BGM 停（qa-r5 P3-1），解除暫停接續播
    if (on === g.paused) return;
    g.paused = on;
    if (on) { g.pauseSong = Audio.current; Audio.pause(); }                   // R6：driver pause（記住 row）
    else if (g.pauseSong) { if (!Audio.resume()) Audio.play(g.pauseSong); g.pauseSong = null; }
  }
  function saveBest() { if (g.score > CT.load('tower', 'best', 0)) CT.save('tower', 'best', g.score); }

  /* ============================== HUD ============================== */
  function hudSet(row, col, str) {           // row 0 = 第 1 列；1..3 = 第 26..28 列
    var t = Art.text(str), i;
    for (i = 0; i < t.length && col + i < 32; i++) g.hud[row * 32 + col + i] = t[i];
  }
  function hudCompose() {
    var i, sp = Art.bg('SP');
    for (i = 0; i < 128; i++) g.hud[i] = sp;
    hudSet(0, 1, 'W' + pad(g.wave, 2) + '/10');
    hudSet(0, 9, '@' + pad(g.money, 4));
    hudSet(0, 16, '^' + pad(g.lives, 2));
    hudSet(0, 21, g.paused ? 'PAUSE' : (g.fast ? 'FAST>>' : ''));
    var type = T.TOWER_ORDER[g.sel], def = T.TOWERS[type], k = { needle: 'N', frost: 'F', thunder: 'T' }[type];
    g.hud[32 + 2] = Art.bg('TOP_' + k + '1_0'); g.hud[32 + 3] = Art.bg('TOP_' + k + '1_1');
    g.hud[64 + 2] = Art.bg('BASE_B1_0'); g.hud[64 + 3] = Art.bg('BASE_B1_1');
    hudSet(1, 5, (def.name + '   ').substr(0, 7) + ' @' + def.cost);
    var t = towerAt(g.cur.c, g.cur.r);
    if (t) {
      var L = T.TOWERS[t.type].lv;
      hudSet(1, 18, T.TOWERS[t.type].name.substr(0, 6) + ' LV' + (t.lv + 1));
      hudSet(2, 5, t.lv < 2 ? 'A:UP @' + L[t.lv + 1].up : 'MAX LEVEL');
      hudSet(2, 18, 'HOLD B:SELL');
    } else {
      hudSet(2, 5, buildable(g.cur.c, g.cur.r) ? 'A:BUILD  B:TYPE' : 'B:TYPE');
    }
    if (g.phase === 'prep') hudSet(3, 5, 'NEXT WAVE ' + pad(Math.ceil(g.prepT / 60), 2) + '  SELECT:GO');
    else hudSet(3, 5, 'ENEMY ' + pad(g.en.length + g.spawn.length - g.spawnIdx, 2) + '  SELECT:FAST');
  }
  function hudFlush(maxN) {
    var i, n = 0;
    for (i = 0; i < 128 && n < maxN; i++) {
      if (g.hud[i] !== g.hudCur[i]) {
        var row = i < 32 ? 1 : 25 + (i >> 5);
        ppu.setTile(0, i & 31, row, g.hud[i]); g.hudCur[i] = g.hud[i]; n++;
      }
    }
    return n;
  }

  /* ============================== 精靈：逐線配額器 ============================== */
  var lines = new Uint8Array(240);
  function room(y, h, need) {
    for (var l = Math.max(0, y); l < y + h && l < 240; l++) if (lines[l] + need > 8) return false;
    return true;
  }
  function take(y, h, n) { for (var l = Math.max(0, y); l < y + h && l < 240; l++) { lines[l] += n; } }
  function drawSprites() {
    lines.fill(0);
    var slot = 0, i, e, an = (g.frames >> 3) & 1;
    // ① 敵人（設計上界保證放得下；若真的放不下就記 enemyHidden，測試要求 0）
    for (i = 0; i < g.en.length && slot < 62; i++) {
      e = g.en[i];
      var pal = e.slowT > 0 ? 3 : e.d.pal;
      if (e.hitT > 0 && (e.hitT & 2)) pal = 0;
      if (e.d.boss) {
        var by = e.y - 4;
        if (!room(by, 8, 2)) { g.enemyHidden++; continue; }
        take(by, 8, 2);
        ppu.sprite(slot++, { x: e.x - 8, y: by, tile: Art.spr('BOSS_' + (an ? 'B' : 'A') + '_0'), pal: pal });
        ppu.sprite(slot++, { x: e.x, y: by, tile: Art.spr('BOSS_' + (an ? 'B' : 'A') + '_1'), pal: pal });
      } else {
        var ey = e.y - 4;
        if (!room(ey, 8, 1)) { g.enemyHidden++; continue; }
        take(ey, 8, 1);
        ppu.sprite(slot++, { x: e.x - 4, y: ey, tile: Art.spr(e.d.art + (an ? '_B' : '_A')), pal: pal });
      }
    }
    var enemyMax = 0;
    for (i = 0; i < 240; i++) if (lines[i] > enemyMax) enemyMax = lines[i];
    if (enemyMax > g.maxEnemyLine) g.maxEnemyLine = enemyMax;
    // ② 子彈 + 火花（起點每幀輪替；沒空位就這幀不畫）
    var extra = [], n;
    for (i = 0; i < g.bul.length; i++) extra.push([g.bul[i].x >> 8, g.bul[i].y >> 8, 'BULLET']);
    for (i = 0; i < g.fx.length; i++) {
      var f = g.fx[i];
      extra.push([f.x, f.y, f.kind === 'puff' ? (f.t > 6 ? 'PUFF1' : 'PUFF2') : 'SPARK']);
    }
    n = extra.length;
    var start = n ? g.frames % n : 0;
    for (i = 0; i < n && slot < 64; i++) {
      var x = extra[(start + i) % n], sy = x[1] - 4;
      if (!room(sy, 8, 1)) { g.fxSkipped++; continue; }
      take(sy, 8, 1);
      ppu.sprite(slot++, { x: clamp(x[0] - 4, 0, 248), y: clamp(sy, 0, 239), tile: Art.spr(x[2]), pal: 0 });
    }
    for (i = slot; i < g.sprPrev; i++) ppu.sprite(i, { x: 0, y: 240, tile: 0, pal: 0 });
    g.sprPrev = slot;
    var m = 0;
    for (i = 0; i < 240; i++) if (lines[i] > m) m = lines[i];
    if (m > g.maxLineAll) g.maxLineAll = m;
  }

  /* ============================== 遊玩更新 ============================== */
  function updatePlay() {
    if (pressed(BTN.START) && !held(BTN.SELECT)) { setPause(!g.paused); Audio.sfx('tower_move'); }
    if (g.paused) { hudCompose(); hudFlush(40); flushQ(BG_CAP); return; }
    // 十字鍵（按住連發）
    var dc = 0, dr = 0;
    if (held(BTN.LEFT)) dc = -1; else if (held(BTN.RIGHT)) dc = 1;
    if (held(BTN.UP)) dr = -1; else if (held(BTN.DOWN)) dr = 1;
    if (dc || dr) {
      if (g.rep === 0 || (g.rep >= 14 && (g.rep - 14) % 5 === 0)) moveCursor(dc, dr);
      g.rep++;
    } else g.rep = 0;
    if (pressed(BTN.A)) actA();
    if (held(BTN.B)) {
      g.bHold++;
      if (g.bHold === SELL_HOLD && towerAt(g.cur.c, g.cur.r)) sell();
    } else {
      if (g.bHold > 0 && g.bHold < 16) { g.sel = (g.sel + 1) % 3; updateHighlight(true); Audio.sfx('tower_move'); }
      g.bHold = 0;
    }
    if (pressed(BTN.SELECT) && !held(BTN.START)) {
      if (g.phase === 'prep') g.prepT = 1; else g.fast = !g.fast;
    }
    var steps = g.fast ? 2 : 1;
    for (var s = 0; s < steps && g.mode === 'play'; s++) simStep();
    if (g.mode !== 'play') return;
    blinkCursor();
    hudCompose();
    var used = flushQ(BG_CAP);
    hudFlush(Math.max(0, BG_CAP + 20 - used));
  }

  /* ============================== 自動駕駛（?bot=1） ============================== */
  // 每張圖事先算好「蓋在哪」：每個可蓋格的覆蓋度 = 射程內的路徑取樣點數（越靠近彎道越多）
  function coverage(c, r, range) {
    var x = c * 16 + 8, y = MAP_Y + r * 16 + 8, n = 0, s, o = {};
    for (s = 0; s <= g.path.len; s += 4) {
      T.posAt(g.map, s, o);
      var dx = o.x - x, dy = o.y - y;
      if (dx * dx + dy * dy <= range * range) n++;
    }
    return n;
  }
  function botPlan() {
    var spots = [], c, r;
    for (r = 0; r < 12; r++) for (c = 0; c < 16; c++) if (cellCh(c, r) === '.') spots.push({ c: c, r: r, n: coverage(c, r, 46), m: coverage(c, r, 30) });
    var byN = spots.slice().sort(function (a, b) { return b.n - a.n; });
    var byM = spots.slice().sort(function (a, b) { return b.m - a.m; });
    var used = {}, plan = [];
    function pick(list) { for (var i = 0; i < list.length; i++) { var k = list[i].c + ',' + list[i].r; if (!used[k]) { used[k] = 1; return list[i]; } } return null; }
    var n1 = pick(byN), n2 = pick(byN), t1 = pick(byM), f1 = pick(byN), n3 = pick(byN), t2 = pick(byM), n4 = pick(byN), t3 = pick(byM);
    plan.push(['build', 'needle', n1], ['build', 'needle', n2], ['build', 'thunder', t1], ['up', n1], ['build', 'frost', f1],
      ['up', n2], ['build', 'needle', n3], ['up', t1], ['up', n1], ['build', 'thunder', t2], ['up', n2], ['up', f1],
      ['build', 'needle', n4], ['up', t1], ['up', n3], ['up', t2], ['build', 'thunder', t3], ['up', n4], ['up', n3], ['up', t2], ['up', n4], ['up', t3], ['up', f1], ['up', t3]);
    return plan.filter(function (a) { return a[a.length - 1]; });
  }
  function botCost(a) {
    if (a[0] === 'build') return T.TOWERS[a[1]].cost;
    var t = towerAt(a[1].c, a[1].r);
    if (!t) return -1;                                  // 還沒蓋 ⇒ 跳過
    if (t.lv >= 2) return -1;
    return T.TOWERS[t.type].lv[t.lv + 1].up;
  }
  var botTog = 0;
  function bot() {
    if (!g) return 0;
    botTog ^= 1;
    if (g.mode !== 'play') {
      if (!botTog || g.t < 20) return 0;
      if (g.mode === 'select') { if (g.selRow !== 0) return BTN.UP; return BTN.A; }
      return BTN.START;
    }
    if (g.paused) return botTog ? BTN.START : 0;
    if (!g.bot) g.bot = { plan: botPlan(), i: 0 };
    var B = g.bot;
    while (B.i < B.plan.length && botCost(B.plan[B.i]) < 0) B.i++;
    var a = B.plan[B.i];
    if (a && g.money >= botCost(a)) {
      var tgt = a[0] === 'build' ? a[2] : a[1];
      if (g.cur.c !== tgt.c || g.cur.r !== tgt.r) {
        if (!botTog) return 0;
        var m = 0;
        if (g.cur.c < tgt.c) m |= BTN.RIGHT; else if (g.cur.c > tgt.c) m |= BTN.LEFT;
        else if (g.cur.r < tgt.r) m |= BTN.DOWN; else if (g.cur.r > tgt.r) m |= BTN.UP;
        return m;
      }
      if (a[0] === 'build' && T.TOWER_ORDER[g.sel] !== a[1]) {
        if (g.bHold > 0) return 0;          // 放開 = 換種類
        return botTog ? BTN.B : 0;
      }
      if (!botTog) return 0;
      B.i++;
      return BTN.A;
    }
    if (!botTog) return 0;
    if (g.phase === 'prep' && g.prepT > 2) return BTN.SELECT;
    if (g.phase === 'run' && !g.fast) return BTN.SELECT;
    return 0;
  }

  /* ============================== 註冊 ============================== */
  var game = {
    id: 'tower', order: 8, title: '星塵塔防', legacy: ['tower-defense.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu = nes.ppu;
      Art.build();
      NES.CHR.setPattern(0, 'tower_bg');
      NES.CHR.setPattern(1, 'tower_spr');
      ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flicker = 'none';
      Audio.init(nes);
      g = newGame();
      var mq = parseInt(CT.query && CT.query('map') || '0', 10);
      if (mq >= 1 && mq <= 3 && CT.query('game') === 'tower') { g.mi = mq - 1; enter('play'); return; }
      enter('title');
    },
    exit: function () { if (g) saveBest(); Audio.stop(); },
    update: function () {
      if (!g) return;
      g.frames++; g.t++;
      Audio.tick();
      var st = pressed(BTN.START) && !held(BTN.SELECT), a = pressed(BTN.A);
      switch (g.mode) {
        case 'title':
          if ((g.t % 32) === 0) center(19, '          ');
          else if ((g.t % 32) === 16) center(19, 'PUSH START');
          if (st && g.t > 10) { Audio.sfx('tower_move'); enter('howto'); }
          break;
        case 'howto':
          if ((st || a) && g.t > 10) { Audio.sfx('tower_move'); g.selRow = Math.min(g.selRow, unlocked() - 1); enter('select'); }
          break;
        case 'select':
          if (pressed(BTN.UP) && g.selRow > 0) { g.selRow--; selArrow(); Audio.sfx('tower_move'); }
          if (pressed(BTN.DOWN) && g.selRow < 2) { g.selRow++; selArrow(); Audio.sfx('tower_move'); }
          if ((st || a) && g.t > 10) {
            if (g.selRow < unlocked()) { g.mi = g.selRow; enter('play'); }
            else Audio.sfx('tower_error');
          }
          flushQ(BG_CAP);
          break;
        case 'play':
          updatePlay();
          break;
        case 'clear':
          if (st && g.t > 60) { g.selRow = Math.min(g.mi + 1, 2); enter('select'); }
          break;
        case 'over':
          if (a && g.t > 60 && g.snap) { Audio.sfx('tower_move'); retryWave(false); }
          else if (st && g.t > 60) enter('title');
          break;
      }
    },
    draw: function () {
      if (!g) return;
      if (g.mode === 'play') drawSprites();
    },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, map: g.mi, wave: g.wave, phase: g.phase, prepT: g.prepT, money: g.money, lives: g.lives,
        score: g.score, fast: g.fast, paused: g.paused, cursor: { c: g.cur.c, r: g.cur.r }, sel: T.TOWER_ORDER[g.sel],
        towers: g.towers.map(function (t) { return [t.type, t.lv, t.c, t.r]; }), enemies: g.en.length,
        bullets: g.bul.length, fx: g.fx.length, kills: g.kills, leaks: g.leaks, mapsCleared: g.mapsCleared.slice(),
        maxEnemyLine: g.maxEnemyLine, maxLineAll: g.maxLineAll, enemyHidden: g.enemyHidden, fxSkipped: g.fxSkipped,
        bgPeak: g.bgPeak, queue: g.q.length / 5, music: Audio.current, lastSfx: Audio.last, lastWaveCleared: g.lastWaveCleared,
        cheats: g.cheats, retries: g.retries, retryWave: g.snap ? g.snap.wave : 0
      };
    },
    cheat: function () {
      if (!g) return false;
      if (g.mode === 'play') {                                   // 遊玩中 = 立刻補強
        g.cheats++;
        g.money += 300; g.lives = Math.min(30, g.lives + 10);
        Audio.sfx('tower_upgrade');
        return true;
      }
      if (g.mode === 'over' && g.snap) {                         // 失守 = 原地續關（同一波、生命補滿）
        g.cheats++;
        Audio.sfx('tower_upgrade');
        return retryWave(true);
      }
      return false;                                              // 標題 / 說明 / 選圖 / 通關：無效
    },
    bot: bot,
    goal: function () { return !!(g && g.clean[0]); },
    get backTile() { return { tile: Art.spr('BACK'), pal: 0 }; },   // 8×8 實心方塊（qa-r5 P3-9）
    bestText: function () { return pad(Math.min(999999, CT.load('tower', 'best', 0) | 0), 6); }   // R6 §1-6：右對齊 6 字元
  };
  T.dev = {
    g: function () { return g; },
    enter: function (m) { enter(m); },
    setMoney: function (v) { g.money = v; },
    cursor: function (c, r) { g.cur.c = c; g.cur.r = r; updateHighlight(true); },
    select: function (i) { g.sel = i; },
    build: function () { return actA(); },
    sell: function () { return sell(); },
    spawn: function (type) { return spawnOne(type); },
    sim: function (n) { for (var i = 0; i < n; i++) simStep(); },
    startWave: function (w) { if (w) g.wave = w; startWave(); },
    retry: function (full) { return retryWave(!!full); },
    plan: function () { return botPlan(); }
  };
  T.game = game;
  CT.register(game);
})();
