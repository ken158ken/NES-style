/*
 * games/mech/main.js — 《星塵機甲》主程式（window.GAME，全域 MG）
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent
 * 依賴：games/mech/{chr_mech,chr_world,song,weapons,hero,enemies,bosses,levels}.js、engine/*
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約」、docs/ENGINE_API.md §7 / §12 / §15 / §16
 *
 * 職責
 *   ① CHR / 調色盤合併（精靈 8×8 模式；主角 16×24 = 6 顆精靈）
 *   ② 模式機：select（選關 8 格）→ ready → play →（paused 武器選單 / dead / weaponget / gameover）
 *   ③ **畫面單位換房**：一個房間 = 一張名稱表；換房時「每幀補 1 欄 / 1 列」地捲過去
 *      （研究 03_洛克人2 §⑧2；≤ 48 byte/幀，遠低於 160 預算），水平用 `mirroring('v')`、
 *      垂直用 `mirroring('h')`，**engine 一行未改**
 *   ④ HUD = 精靈（研究 ⑧4 / 洛克人的血條就是精靈）：OAM 前 24 槽保留給
 *      LIFE 7 格 + 武器能量 7 格 + 魔王血條 7 格 ⇒ 永遠不閃爍
 *   ⑤ 武器選單 = 暫停時整個畫面重繪成選單（研究 ⑧3：「遊戲暫停 = PPU 可自由寫入」的空檔
 *      ⇒ 這一幀的 VBlank 計帳 mute，解除暫停再整片重畫房間）
 *   ⑥ 一鍵密技（C 鍵 / ★密技 / `nes-cheat`）與 START 暫停，行為對齊另外兩款
 *
 * 網址參數：`?stage=frost|blaze`（跳過選關直接開關）、`?room=3`（直接到第 n 間房）、
 *           `?boss=1`（直接進魔王房並給弱點武器）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var MG = window.MG = window.MG || {};
  var FX = NES.FX, SH = NES.SH;
  var BTN = NES.Input.BTN;
  var Hero = MG.Hero, Wp = MG.Weapons, En = MG.Enemies, Bs = MG.Bosses, Lv = MG.Levels;
  if (!Hero) throw new Error('games/mech/main.js 需要 games/mech/hero.js');
  if (!SH || !SH.OAM) throw new Error('games/mech/main.js 需要 engine/shmup.js（NES.SH）');
  if (!Lv) throw new Error('games/mech/main.js 需要 games/mech/levels.js');

  /* ============================== 常數 ============================== */
  var COLS = 32, ROWS = 30;
  var HUD_RESERVE = 24;                  // OAM 0..23 = HUD（不進 SH.OAM 的輪替）
  var TRANS_H = 32, TRANS_V = 30;        // 換房幀數（8 px/幀）
  var READY_FRAMES = 90;
  var CHEAT_COOL = 30;
  var CHEAT_LIVES = 9, CHEAT_INV = 1200;
  var CONTINUE_LIVES = 3;
  var TANK_MAX = 4;                      // 研究 ⑥：E 罐最多 4 個
  var BOSS_SPAWN_DELAY = 36;
  var WEAPON_HOLD = 240;                 // 取得武器畫面停留幀數
  var ITEM_W = 16, ITEM_H = 12;

  var ITEMS = {
    pellet: { tiles: ['M_PELLET'], w: 8, h: 8, pal: 1, sfx: 'item' },
    pbig: { tiles: ['M_PBIG_L', 'M_PBIG_R'], w: 16, h: 8, pal: 1, sfx: 'item' },
    wpellet: { tiles: ['M_PELLET'], w: 8, h: 8, pal: 3, sfx: 'item' },
    etank: { tiles: ['M_ETANK_L', 'M_ETANK_R'], w: 16, h: 8, pal: 1, sfx: 'etank' },
    oneup: { tiles: ['M_1UP_L', 'M_1UP_R'], w: 16, h: 8, pal: 1, sfx: 'oneup' }
  };

  var nes0 = null, ppu0 = null, g = null, sprBank = null, bgBank = null, tiles = null;

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'select', modeFrames: 0, frames: 0,
      sel: 0, cleared: {}, levelKey: null, lv: null,
      roomIndex: 0, room: null, nt: 0,
      trans: null, hero: null, boss: null, bossT: 0,
      items: [], oam: null, input: null,
      vanState: { A: -1, B: -1 }, vanCells: [],
      menuSel: 0, paused: false,
      cheats: 0, cheatReq: false, cheatCool: 0, cheatInv: false, lastCheat: 'none',
      continues: 0, secrets: 0,
      lastSfx: null, music: null,
      deaths: 0, roomVisits: 0, transCount: 0, weaponGot: null,
      doorT: 0, hudCache: null
    };
  }

  /* --------------------------- 磚 / 房間查詢 --------------------------- */
  function tileAt(col, row) {
    if (!g.room) return 0;
    return g.room.tileAt(col, row);
  }
  function kindAt(col, row) {
    var k = MG.solidKind(tileAt(col, row));
    if (k === 'vanishA') return Lv.vanishOn('A', g.frames) ? 'solid' : 'none';
    if (k === 'vanishB') return Lv.vanishOn('B', g.frames) ? 'solid' : 'none';
    return k;
  }
  function solidAt(col, row) { return kindAt(col, row) === 'solid'; }

  /* 屬性表是 16×16 一格（4 個磚共用一組調色盤，研究 05 §1 的硬限制）⇒
     取這 4 個磚裡「最該被看見」的那一組（危險 3 > 機構 2 > 結構 1），
     不然單獨一塊尖刺 / 消失磚會被旁邊的空白洗成地形色。 */
  function attrAt(c16, r16) {
    var c = c16 * 2, r = r16 * 2;
    var p = MG.palOf(tileAt(c, r));
    var i, cand = [MG.palOf(tileAt(c + 1, r)), MG.palOf(tileAt(c, r + 1)), MG.palOf(tileAt(c + 1, r + 1))];
    for (i = 0; i < cand.length; i++) if (cand[i] > p) p = cand[i];
    return p;
  }

  function bgIndex(name) {
    if (!bgBank) return 0;
    return bgBank.has(name) ? bgBank.index(name) : bgBank.index('SP');
  }
  function bgNameFor(t) {
    if (t === MG.TILE.VAN_A || t === MG.TILE.VAN_B) {
      var grp = (t === MG.TILE.VAN_A) ? 'A' : 'B';
      if (!Lv.vanishOn(grp, g.frames)) return 'SP';
      return Lv.vanishWarn(grp, g.frames) ? 'W_VANW' : 'W_VAN';
    }
    if (t === MG.TILE.DOOR) return 'W_DOOR_L';
    return MG.TILE2BG[t] || 'SP';
  }
  function bgTileOf(col, row) {
    var t = tileAt(col, row);
    var name = bgNameFor(t);
    // 門的右半用另一張磚（左右對稱）
    if (t === MG.TILE.DOOR && (col & 1) === 1) name = 'W_DOOR_R';
    return bgIndex(name);
  }

  /* --------------------------- 名稱表寫入 --------------------------- */
  function writeCol(nt, col) {
    var r, n = 0;
    for (r = 0; r < ROWS; r++) { ppu0.setTile(nt, col, r, bgTileOf(col, r)); n++; }
    if ((col & 1) === 0) {
      var c16 = col >> 1, r16;
      for (r16 = 0; r16 < 15; r16++) {
        ppu0.setAttr(nt, c16, r16, attrAt(c16, r16));
        n++;
      }
    }
    return n;
  }
  function writeRow(nt, row) {
    var c, n = 0;
    for (c = 0; c < COLS; c++) { ppu0.setTile(nt, c, row, bgTileOf(c, row)); n++; }
    if ((row & 1) === 0) {
      var r16 = row >> 1, c16;
      for (c16 = 0; c16 < 16; c16++) { ppu0.setAttr(nt, c16, r16, attrAt(c16, r16)); n++; }
    }
    return n;
  }
  // 整片重畫（init / 換關 / 復活 / 解除暫停）：1080 byte，等同真機「關 rendering 時重寫名稱表」
  function writeRoom(nt) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    var c, r;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) ppu0.setTile(nt, c, r, bgTileOf(c, r));
    for (r = 0; r < 15; r++) for (c = 0; c < 16; c++) ppu0.setAttr(nt, c, r, attrAt(c, r));
    if (bud) bud.mute = muted;
    rescanVanish();
  }

  // 消失磚：只在「出現 / 預警 / 消失」切換的那一幀重寫那幾格（每格 1 byte）
  function rescanVanish() {
    var c, r, t, list = [];
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        t = tileAt(c, r);
        if (t === MG.TILE.VAN_A || t === MG.TILE.VAN_B) list.push({ c: c, r: r, g: t === MG.TILE.VAN_A ? 'A' : 'B' });
      }
    }
    g.vanCells = list;
    g.vanState.A = -1;
    g.vanState.B = -1;
  }
  function stepVanish() {
    var grp, i, cur, cell;
    for (grp in g.vanState) {
      if (!Object.prototype.hasOwnProperty.call(g.vanState, grp)) continue;
      cur = Lv.vanishOn(grp, g.frames) ? (Lv.vanishWarn(grp, g.frames) ? 1 : 2) : 0;
      if (cur === g.vanState[grp]) continue;
      g.vanState[grp] = cur;
      for (i = 0; i < g.vanCells.length; i++) {
        cell = g.vanCells[i];
        if (cell.g !== grp) continue;
        ppu0.setTile(g.nt, cell.c, cell.r, bgTileOf(cell.c, cell.r));
      }
    }
  }

  function writeText(nt, col, row, str) {
    var t = MG.textTiles(bgBank, str), i;
    for (i = 0; i < t.length && col + i < COLS; i++) ppu0.setTile(nt, col + i, row, t[i]);
  }
  function fillPanel(nt, col, row, w, h, pal) {
    ppu0.fillTiles(nt, col, row, w, h, bgIndex('P_IN'));
    var c16, r16;
    for (r16 = row >> 1; r16 <= (row + h - 1) >> 1; r16++) {
      for (c16 = col >> 1; c16 <= (col + w - 1) >> 1; c16++) {
        if (r16 < 15 && c16 < 16) ppu0.setAttr(nt, c16, r16, pal === undefined ? 0 : pal);
      }
    }
  }

  /* --------------------------- 調色盤 --------------------------- */
  // bg 0 / spr 0（主角）/ spr 1（彈 / 道具）永遠固定 ⇒ 不管哪一關，主角與 HUD 的顏色都一樣
  var BG0 = [0x01, 0x16, 0x30];      // 深藍 / 橘 / 白：面板底 + 字（字型用色 3 ⇒ 白字）
  var SPR0 = [0x02, 0x21, 0x30];
  var SPR1 = [0x16, 0x27, 0x30];
  function applyPalettes(theme) {
    var th = (MG.THEMES && MG.THEMES[theme]) || null;
    ppu0.setBackdrop(th ? th.backdrop : 0x0F);
    ppu0.setBgPalette(0, BG0);
    ppu0.setBgPalette(1, th ? th.bg[1] : [0x21, 0x11, 0x01]);
    ppu0.setBgPalette(2, th ? th.bg[2] : [0x3C, 0x2C, 0x1C]);
    ppu0.setBgPalette(3, th ? th.bg[3] : [0x30, 0x20, 0x10]);
    ppu0.setSprPalette(0, SPR0);
    ppu0.setSprPalette(1, SPR1);
    ppu0.setSprPalette(2, th ? th.spr2 : [0x16, 0x27, 0x30]);
    ppu0.setSprPalette(3, th ? th.spr3 : [0x11, 0x21, 0x31]);
  }

  /* --------------------------- 音訊 --------------------------- */
  function audio(fn, a) {
    if (MG.Audio && typeof MG.Audio[fn] === 'function') {
      try { return MG.Audio[fn](a === undefined ? nes0 : a, nes0); } catch (e) { }
    }
    return null;
  }
  function play(key) {
    g.music = key;
    if (MG.Audio && MG.Audio.has && !MG.Audio.has(key)) key = 'stage1';
    audio('play', key);
  }
  function sfx(name) {
    g.lastSfx = name;
    if (MG.Audio && typeof MG.Audio.sfx === 'function') { try { MG.Audio.sfx(name, nes0); } catch (e) { } }
  }
  function musicTick() {
    if (MG.Audio && typeof MG.Audio.tick === 'function') { try { MG.Audio.tick(nes0); return; } catch (e) { } }
    if (nes0 && nes0.music && typeof nes0.music.tick === 'function') nes0.music.tick();
  }

  /* --------------------------- 主角的 ctx --------------------------- */
  var ctx = {
    cols: COLS, rows: ROWS, input: null, hero: null,
    kindAt: kindAt, tileAt: tileAt, solidAt: solidAt,
    sfx: sfx,
    fire: function (h, lvl) { return Wp.fire(h, lvl, ctx); },
    canCharge: function () { return Wp.canCharge(); },
    canFire: function () { return Wp.canFire(); },
    onLand: function () { },
    onTouch: function () { },
    noSpike: function () { return g.cheatInv && g.hero.inv > 0; },
    onEnemyDie: function (e) { sfx('ehit'); void e; },
    onShotHitWall: function () { }
  };

  /* ============================== 選關畫面 ============================== */
  /* 研究 ⑦①「選關畫面就是難度選單」：3×3 共 9 格（中央是主角肖像），本輪開 2 格。 */
  var CELL_X = [2, 12, 22], CELL_Y = [8, 15, 22], CELL_W = 8, CELL_H = 5;
  function drawSelect() {
    var bud = nes0.timing && nes0.timing.budget, muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    // 選關畫面自己的一組調色盤（0 = 開放 / 1 = 未開放 / 2 = 已通關 / 3 = 標題裝飾）
    ppu0.setBackdrop(0x0F);
    ppu0.setBgPalette(0, BG0);
    ppu0.setBgPalette(1, [0x0C, 0x1C, 0x2C]);
    ppu0.setBgPalette(2, [0x06, 0x16, 0x37]);
    ppu0.setBgPalette(3, [0x02, 0x12, 0x32]);
    ppu0.setSprPalette(0, SPR0);
    ppu0.setSprPalette(1, SPR1);
    ppu0.setSprPalette(2, [0x16, 0x27, 0x30]);
    ppu0.setSprPalette(3, [0x11, 0x21, 0x31]);
    ppu0.fillTiles(0, 0, 0, 32, 30, bgIndex('SP'));
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    writeText(0, 9, 2, 'STARDUST MECH');
    writeText(0, 10, 4, 'SELECT STAGE');
    var i, s, cx, cy;
    for (i = 0; i < 9; i++) {
      s = MG.SELECT[i];
      cx = CELL_X[i % 3]; cy = CELL_Y[(i / 3) | 0];
      drawCell(cx, cy, s);
    }
    writeText(0, 4, 28, 'START SELECT   C CHEAT');
    if (bud) bud.mute = muted;
    paintCursor();
  }
  function drawCell(cx, cy, s) {
    var r, c;
    // 外框
    for (c = 0; c < CELL_W; c++) {
      ppu0.setTile(0, cx + c, cy, bgIndex(c === 0 ? 'P_TL' : (c === CELL_W - 1 ? 'P_TR' : 'P_H')));
      ppu0.setTile(0, cx + c, cy + CELL_H - 1, bgIndex(c === 0 ? 'P_BL' : (c === CELL_W - 1 ? 'P_BR' : 'P_HB')));
    }
    for (r = 1; r < CELL_H - 1; r++) {
      ppu0.setTile(0, cx, cy + r, bgIndex('P_VL'));
      ppu0.setTile(0, cx + CELL_W - 1, cy + r, bgIndex('P_VR'));
      for (c = 1; c < CELL_W - 1; c++) ppu0.setTile(0, cx + c, cy + r, bgIndex('P_IN'));
    }
    var pal = s.open ? (g.cleared[s.key] ? 2 : 0) : 1;
    var r16, c16;
    for (r16 = cy >> 1; r16 <= (cy + CELL_H - 1) >> 1; r16++) {
      for (c16 = cx >> 1; c16 <= (cx + CELL_W - 1) >> 1; c16++) {
        if (r16 < 15 && c16 < 16) ppu0.setAttr(0, c16, r16, pal);
      }
    }
    if (s.label === 'MECH') {
      ppu0.setTile(0, cx + 3, cy + 2, bgIndex('P_MECH'));
      ppu0.setTile(0, cx + 4, cy + 2, bgIndex('P_MECH'));
      return;
    }
    if (!s.open) {
      ppu0.setTile(0, cx + 3, cy + 1, bgIndex('P_LOCK'));
      writeText(0, cx + 1, cy + 3, 'COMING');
      return;
    }
    writeText(0, cx + 1, cy + 1, s.label);
    writeText(0, cx + 1, cy + 3, g.cleared[s.key] ? 'CLEAR!' : 'OPEN');
  }
  function paintCursor() {
    var i, s, cx, cy;
    for (i = 0; i < 9; i++) {
      s = MG.SELECT[i];
      cx = CELL_X[i % 3]; cy = CELL_Y[(i / 3) | 0];
      ppu0.setTile(0, cx + CELL_W - 2, cy + 1, bgIndex(i === g.sel ? 'P_CUR' : 'P_IN'));
      void s;
    }
  }
  function moveSel(dx, dy) {
    var c = g.sel % 3, r = (g.sel / 3) | 0;
    c = (c + dx + 3) % 3; r = (r + dy + 3) % 3;
    g.sel = r * 3 + c;
    paintCursor();
    sfx('clink');
  }

  /* ============================== 武器選單（暫停） ============================== */
  function barText(v, max) {
    var n = Math.round(v * 7 / max), s = '', i;
    if (n < 0) n = 0;
    if (n > 7) n = 7;
    for (i = 0; i < 7; i++) s += (i < n ? '#' : ' ');
    return s;
  }
  function drawMenu() {
    var bud = nes0.timing && nes0.timing.budget, muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;                        // 研究 ⑧3：暫停 = PPU 可自由寫入的空檔
    ppu0.fillTiles(0, 0, 0, 32, 30, bgIndex('SP'));
    ppu0.fillAttr(0, 0, 0, 16, 15, 0);
    writeText(0, 11, 2, 'WEAPONS');
    var list = Wp.list(), i, row;
    for (i = 0; i < list.length; i++) {
      row = 6 + i * 3;
      if (!list[i].unlocked) {
        writeText(0, 6, row, '---------- LOCKED');
        continue;
      }
      writeText(0, 4, row, (i === g.menuSel ? '>' : ' ') + ' ' + list[i].name);
      writeText(0, 20, row, '(' + barText(list[i].infinite ? Wp.ENERGY_MAX : list[i].energy, Wp.ENERGY_MAX) + ')');
    }
    writeText(0, 4, 18, 'LIFE   (' + barText(g.hero.life, Hero.LIFE_MAX) + ')');
    writeText(0, 4, 20, 'E-TANK x' + g.hero.tanks + '   B = USE');
    writeText(0, 4, 23, 'LIVES  x' + g.hero.lives);
    writeText(0, 4, 26, 'START = RESUME');
    writeText(0, 4, 27, 'UP DOWN = CHANGE');
    if (bud) bud.mute = muted;
  }
  function pauseGame() {
    g.paused = true;
    var l = Wp.unlockedList(), i = l.indexOf(Wp.cur);
    g.menuSel = MG.Weapons.ORDER.indexOf(Wp.cur);
    if (g.menuSel < 0) g.menuSel = 0;
    void i;
    drawMenu();
    sfx('door');
  }
  function unpauseGame() {
    g.paused = false;
    writeRoom(g.nt);
    restAlign();
  }
  function menuMove(d) {
    var ord = MG.Weapons.ORDER, n = ord.length, i = g.menuSel, k = 0;
    do { i = (i + d + n) % n; k++; } while (!Wp.unlocked[ord[i]] && k <= n);
    g.menuSel = i;
    Wp.select(ord[i]);
    drawMenu();
    sfx('clink');
  }
  function useTank() {
    if (g.hero.tanks <= 0 || g.hero.life >= Hero.LIFE_MAX) return false;
    g.hero.tanks--;
    Hero.heal(g.hero, Hero.LIFE_MAX);
    sfx('etank');
    drawMenu();
    return true;
  }

  /* ============================== 房間 / 換房 ============================== */
  function restAlign() {
    ppu0.mirroring('v');
    ppu0.scroll(g.nt * 256, 0, 0);
    ppu0.split(null);
  }

  function spawnRoomActors() {
    En.reset();
    Wp.resetShots();
    g.items = [];
    var i, s, it, def;
    for (i = 0; i < g.room.spawns.length; i++) {
      s = g.room.spawns[i];
      En.spawn(s.kind, s.c, s.r);
    }
    for (i = 0; i < g.room.items.length; i++) {
      it = g.room.items[i];
      def = ITEMS[it.kind] || ITEMS.pellet;
      g.items.push({ kind: it.kind, x: it.c * 8, y: it.r * 8, w: def.w, h: def.h, alive: true });
    }
    g.boss = null;
    g.bossT = 0;
    if (g.room.boss && Bs) g.bossT = 0;
  }

  function enterRoom(idx, pos) {
    g.roomIndex = idx;
    g.room = g.lv.rooms[idx];
    g.roomVisits++;
    writeRoom(g.nt);
    restAlign();
    spawnRoomActors();
    if (pos) {
      Hero.reset(g.hero, pos.x, pos.y, pos.facing === undefined ? 1 : pos.facing);
      if (pos.climb) { Hero.grabLadder(g.hero, ctx, (pos.x + 6) >> 3); Hero.sync(g.hero); }
    }
    if (g.room.boss) { play('boss'); }
    else if (g.music !== g.lv.music) play(g.lv.music);
  }

  function opposite(d) {
    return d === 'right' ? 'left' : (d === 'left' ? 'right' : (d === 'up' ? 'down' : 'up'));
  }
  function targetRoom(dir) {
    var i = g.roomIndex;
    if (g.lv.rooms[i].next === dir) return i + 1;
    if (i > 0 && opposite(g.lv.rooms[i - 1].next) === dir) return i - 1;
    return -1;
  }

  function startTrans(dir) {
    var to = targetRoom(dir);
    if (to < 0 || !g.lv.rooms[to]) return false;
    var vertical = (dir === 'up' || dir === 'down');
    g.trans = {
      dir: dir, to: to, from: g.roomIndex, t: 0,
      len: vertical ? TRANS_V : TRANS_H,
      nt0: g.nt, nt1: 1 - g.nt, vertical: vertical,
      heroX: g.hero.x, heroY: g.hero.y
    };
    g.transCount++;
    // 先把「目標房」切成現役，才能用同一組 tileAt 寫入新表
    g.roomIndex = to;
    g.room = g.lv.rooms[to];
    g.nt = g.trans.nt1;
    ppu0.mirroring(vertical ? 'h' : 'v');
    En.reset();
    Wp.resetShots();
    sfx('door');
    return true;
  }

  function stepTrans() {
    var tr = g.trans, t = tr.t;
    // ① 先補一欄 / 一列（≤ 48 byte）；最後一幀（t === len）只捲動、沒有新欄要補
    if (tr.dir === 'right') { if (t < COLS) writeCol(tr.nt1, t); }
    else if (tr.dir === 'left') { if (t < COLS) writeCol(tr.nt1, COLS - 1 - t); }
    else if (tr.dir === 'down') { if (t < ROWS) writeRow(tr.nt1, t); }
    else { if (t < ROWS) writeRow(tr.nt1, ROWS - 1 - t); }
    // ② 捲動
    var x, y;
    if (tr.vertical) {
      y = tr.nt0 * 240 + (tr.dir === 'down' ? 8 * t : -8 * t);
      y = ((y % 480) + 480) % 480;
      ppu0.scroll(0, y, 0);
    } else {
      x = tr.nt0 * 256 + (tr.dir === 'right' ? 8 * t : -8 * t);
      x = ((x % 512) + 512) % 512;
      ppu0.scroll(x, 0, 0);
    }
    // ③ 主角跟著走進新畫面（洛克人的換頁演出：人往前走、畫面整頁推過去）
    var h0 = g.hero, k = tr.t / tr.len;
    if (k > 1) k = 1;
    if (tr.dir === 'right') FX.vsetPx(h0.px, Math.round(tr.heroX * (1 - k)));
    else if (tr.dir === 'left') FX.vsetPx(h0.px, Math.round(tr.heroX + (256 - h0.w - tr.heroX) * k));
    else if (tr.dir === 'down') FX.vsetPx(h0.py, Math.round(tr.heroY * (1 - k)));
    else FX.vsetPx(h0.py, Math.round(tr.heroY + (240 - Hero.H - tr.heroY) * k));
    if ((tr.t & 7) === 0) h0.anim = (h0.anim + 1) & 3;
    Hero.sync(h0);

    tr.t++;
    if (tr.t > tr.len) {
      // ③ 落地：主角移到新房的對應邊
      var h = g.hero;
      if (tr.dir === 'right') FX.vsetPx(h.px, 0);
      else if (tr.dir === 'left') FX.vsetPx(h.px, 256 - h.w);
      else if (tr.dir === 'down') FX.vsetPx(h.py, 0);
      else FX.vsetPx(h.py, 240 - Hero.H);
      Hero.sync(h);
      g.trans = null;
      restAlign();
      spawnRoomActors();
      rescanVanish();
      if (g.room.boss) play('boss');
    }
  }

  /* ============================== 關卡流程 ============================== */
  function startLevel(key, roomIdx) {
    g.levelKey = key;
    g.lv = Lv.get(key);
    if (!g.lv) return false;
    g.nt = 0;
    applyPalettes(g.lv.theme);
    Wp.refill();
    var i = roomIdx === undefined ? g.lv.start.room : roomIdx;
    var r = g.lv.rooms[i];
    g.checkpoint = { room: i, x: r.entry.x, y: r.entry.y, climb: !!r.entry.climb };
    enterRoom(i, { x: r.entry.x, y: r.entry.y, climb: r.entry.climb });
    g.hero.life = Hero.LIFE_MAX;
    g.mode = 'ready';
    g.modeFrames = 0;
    writeText(g.nt, 13, 13, 'READY');
    play(r.boss ? 'boss' : g.lv.music);
    return true;
  }

  function updateCheckpoint() {
    if (!g.room.checkpoint) return;
    if (g.checkpoint && g.checkpoint.room === g.roomIndex) return;
    g.checkpoint = { room: g.roomIndex, x: g.room.entry.x, y: g.room.entry.y, climb: !!g.room.entry.climb };
  }

  function respawn() {
    var cp = g.checkpoint || { room: 0, x: 24, y: 168 };
    g.nt = 0;
    Wp.refill();
    Wp.select('buster');
    g.hero.life = Hero.LIFE_MAX;
    enterRoom(cp.room, { x: cp.x, y: cp.y, climb: cp.climb });
    g.mode = 'ready';
    g.modeFrames = 0;
    writeText(g.nt, 13, 13, 'READY');
    play(g.lv.rooms[cp.room].boss ? 'boss' : g.lv.music);
  }

  function enterDead() {
    g.mode = 'dead';
    g.modeFrames = 0;
    g.deaths++;
    play('death');
  }

  function enterGameOver() {
    g.mode = 'gameover';
    g.modeFrames = 0;
    var bud = nes0.timing && nes0.timing.budget, muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    ppu0.fillTiles(g.nt, 0, 0, 32, 30, bgIndex('SP'));
    ppu0.fillAttr(g.nt, 0, 0, 16, 15, 0);
    writeText(g.nt, 11, 12, 'GAME OVER');
    writeText(g.nt, 6, 16, 'START = STAGE SELECT');
    writeText(g.nt, 5, 18, 'SELECT OR C = CONTINUE');
    if (bud) bud.mute = muted;
    restAlign();
    play('gameover');
  }

  function enterWeaponGet() {
    var key = g.boss ? g.boss.def.weapon : null;
    if (key) Wp.unlock(key);
    g.weaponGot = key;
    g.cleared[g.levelKey] = true;
    g.mode = 'weaponget';
    g.modeFrames = 0;
    var bud = nes0.timing && nes0.timing.budget, muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    ppu0.fillTiles(g.nt, 0, 0, 32, 30, bgIndex('SP'));
    ppu0.fillAttr(g.nt, 0, 0, 16, 15, 0);
    writeText(g.nt, 10, 10, 'STAGE CLEAR');
    writeText(g.nt, 7, 14, 'YOU GOT');
    writeText(g.nt, 7, 16, Wp.DEFS[key] ? Wp.DEFS[key].name : 'NEW POWER');
    writeText(g.nt, 6, 22, 'START = STAGE SELECT');
    if (bud) bud.mute = muted;
    restAlign();
    play('weapon');
  }

  function backToSelect() {
    g.mode = 'select';
    g.modeFrames = 0;
    g.boss = null;
    g.trans = null;
    g.nt = 0;
    En.reset();
    Wp.resetShots();
    g.items = [];
    var all = true, i;
    for (i = 0; i < MG.LEVEL_ORDER.length; i++) if (!g.cleared[MG.LEVEL_ORDER[i]]) all = false;
    drawSelect();
    if (all) writeText(0, 6, 26, 'ALL STAGE CLEAR!');
    restAlign();
    play('select');
  }

  /* ============================== 一鍵密技 ============================== */
  function applyCheat() {
    var h = g.hero, i, k;
    g.secrets++;
    h.lives = CHEAT_LIVES;
    h.life = Hero.LIFE_MAX;
    h.tanks = TANK_MAX;
    h.inv = CHEAT_INV;
    g.cheatInv = true;
    for (i = 0; i < MG.Weapons.ORDER.length; i++) { k = MG.Weapons.ORDER[i]; Wp.unlock(k); }
    Wp.refill();
    sfx('etank');
    return true;
  }
  function doCheat() {
    if (g.cheatCool > 0) return false;
    if (g.mode === 'play' || g.mode === 'ready') {
      g.cheatCool = CHEAT_COOL;
      g.cheats++; g.lastCheat = 'secret';
      applyCheat();
      if (g.paused) drawMenu();
      return true;
    }
    if (g.mode === 'gameover') {
      g.cheatCool = CHEAT_COOL;
      g.cheats++; g.continues++; g.lastCheat = 'continue';
      continueGame();
      return true;
    }
    g.lastCheat = 'none';
    return false;
  }
  function continueGame() {
    g.hero.lives = CONTINUE_LIVES;
    respawn();
  }
  function requestCheat() { g.cheatReq = true; return true; }
  MG.cheat = requestCheat;

  (function bindCheat() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('nes-cheat', function () { requestCheat(); }, false);
    window.addEventListener('keydown', function (e) {
      if (!e || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      var code = e.code || '';
      var isC = (code === 'KeyC') || (!code && (e.keyCode === 67 || String(e.key || '').toLowerCase() === 'c'));
      if (!isC) return;
      var ev = null;
      try { ev = new window.CustomEvent('nes-cheat', { detail: { source: 'key' } }); }
      catch (e2) {
        try { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('nes-cheat', false, false, { source: 'key' }); }
        catch (e3) { ev = null; }
      }
      if (ev) window.dispatchEvent(ev); else requestCheat();
    }, false);
  })();

  /* ============================== 碰撞 ============================== */
  function box(o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }
  function heroBox(h) { return { x: h.x, y: h.y, w: h.w, h: Hero.boxH(h) }; }

  function stepCollisions() {
    var h = g.hero;
    if (h.state === 'dead') return;
    var hb = heroBox(h);
    // 自機彈 × 雜魚
    Wp.shots.each(function (s) {
      var sb = box(s);
      En.each(function (e) {
        if (!s.alive || !e.alive) return;
        if (!SH.aabb(sb, box(e))) return;
        En.hit(e, s.dmg, ctx);
        if (s.kind !== 'frost' || s.lvl > 0) s.alive = false;    // 冰棱彈可貫穿（弱點武器的特色）
      });
      if (s.alive && g.boss && g.boss.active && !g.boss.dead) {
        if (SH.aabb(sb, Bs.box(g.boss))) {
          Bs.hit(g.boss, Wp.damageTo(g.boss.key, s), ctx);
          s.alive = false;
        }
      }
    });
    // 雜魚 × 主角
    En.each(function (e) {
      if (SH.aabb(hb, box(e))) Hero.hurt(h, ctx, e.dmg, e.x + (e.w >> 1));
    });
    // 敵彈 × 主角
    Wp.eshots.each(function (s) {
      if (SH.aabb(hb, box(s))) { Hero.hurt(h, ctx, s.dmg, s.x); s.alive = false; }
    });
    // 魔王本體 × 主角
    if (g.boss && g.boss.active && !g.boss.dead) {
      if (SH.aabb(hb, Bs.box(g.boss))) Hero.hurt(h, ctx, g.boss.def.contact, g.boss.x + (g.boss.w >> 1));
    }
    // 道具
    var i, it, def;
    for (i = 0; i < g.items.length; i++) {
      it = g.items[i];
      if (!it.alive) continue;
      if (!SH.aabb(hb, { x: it.x, y: it.y, w: it.w, h: it.h })) continue;
      def = ITEMS[it.kind] || ITEMS.pellet;
      it.alive = false;
      if (it.kind === 'pellet') Hero.heal(h, 4);
      else if (it.kind === 'pbig') Hero.heal(h, 10);
      else if (it.kind === 'wpellet') {
        var k = Wp.cur === 'buster' ? 'frost' : Wp.cur;
        Wp.energy[k] = Math.min(Wp.ENERGY_MAX, Wp.energy[k] + 8);
      } else if (it.kind === 'etank') { if (h.tanks < TANK_MAX) h.tanks++; }
      else if (it.kind === 'oneup') h.lives++;
      sfx(def.sfx);
    }
  }

  /* ============================== HUD（精靈，OAM 0..23） ============================== */
  function barTile(v, max, cell) {
    // cell 0 = 最下面一格；每格 4 單位（max 28 = 7 格）
    var per = max / 7, lo = cell * per, f = v - lo;
    var step = f <= 0 ? 0 : (f >= per ? 4 : Math.ceil(f * 4 / per));
    if (step > 4) step = 4;
    return tiles['M_BAR' + step];
  }
  function hudSprites() {
    var slot = 0, i, t;
    function put(x, y, tile, pal) {
      if (slot >= HUD_RESERVE) return;
      ppu0.sprite(slot++, { x: x, y: y, tile: tile, pal: pal, prio: 0 });
    }
    var h = g.hero;
    if (!g.paused && (g.mode === 'play' || g.mode === 'ready' || g.mode === 'dead')) {
      for (i = 0; i < 7; i++) {
        t = barTile(h.life, Hero.LIFE_MAX, 6 - i);
        if (t !== undefined) put(8, 16 + i * 8, t, 0);
      }
      if (Wp.cur !== 'buster') {
        for (i = 0; i < 7; i++) {
          t = barTile(Wp.energy[Wp.cur], Wp.ENERGY_MAX, 6 - i);
          if (t !== undefined) put(24, 16 + i * 8, t, 3);
        }
      }
      if (g.boss && g.boss.active && !g.boss.dead) {
        for (i = 0; i < 7; i++) {
          t = barTile(g.boss.hp, g.boss.maxHp, 6 - i);
          if (t !== undefined) put(232, 16 + i * 8, t, 1);
        }
      }
    }
    while (slot < HUD_RESERVE) ppu0.sprite(slot++, { x: 0, y: 240, tile: 0, pal: 0 });
  }

  /* ============================== 道具繪製 ============================== */
  function drawItems(oam) {
    var i, it, def, j, n = 0;
    for (i = 0; i < g.items.length; i++) {
      it = g.items[i];
      if (!it.alive) continue;
      def = ITEMS[it.kind] || ITEMS.pellet;
      for (j = 0; j < def.tiles.length; j++) {
        var t = tiles[def.tiles[j]];
        if (t === undefined) continue;
        oam.add({ x: it.x + j * 8, y: it.y, tile: t, pal: def.pal, prio: 1 });
        n++;
      }
    }
    return n;
  }

  /* ============================== GAME 物件 ============================== */
  var GAME = {
    init: function (nes) {
      nes0 = nes;
      ppu0 = nes.ppu;
      g = newState();
      g.hero = Hero.create();
      g.input = nes.input || NES.Input;
      ctx.input = g.input;
      ctx.hero = g.hero;

      // ---- CHR：精靈表 1 = 主角(0..127) + 世界(128..255)；背景表 0 = 字型 / 面板 + 地形 ----
      var sprObj = {}, bgObj = {}, k;
      for (k in MG.SPR_MECH) if (Object.prototype.hasOwnProperty.call(MG.SPR_MECH, k)) sprObj[k] = MG.SPR_MECH[k];
      if (MG.SPR_WORLD) for (k in MG.SPR_WORLD) if (Object.prototype.hasOwnProperty.call(MG.SPR_WORLD, k)) sprObj[k] = MG.SPR_WORLD[k];
      for (k in MG.BG_FONT) if (Object.prototype.hasOwnProperty.call(MG.BG_FONT, k)) bgObj[k] = MG.BG_FONT[k];
      if (MG.BG_WORLD) for (k in MG.BG_WORLD) if (Object.prototype.hasOwnProperty.call(MG.BG_WORLD, k)) bgObj[k] = MG.BG_WORLD[k];
      sprBank = NES.CHR.bank('mg_spr', sprObj);
      bgBank = NES.CHR.bank('mg_bg', bgObj);
      NES.CHR.setPattern(0, bgBank);
      NES.CHR.setPattern(1, sprBank);
      tiles = {};
      var names = Hero.tileNames().concat(Object.keys(MG.SPR_WORLD || {})), i;
      for (i = 0; i < names.length; i++) if (sprBank.has(names[i])) tiles[names[i]] = sprBank.index(names[i]);
      MG.sprBank = sprBank; MG.bgBank = bgBank; MG.tiles = tiles;

      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);                  // 8×8：主角 16×24 = 6 顆精靈、血條一格一磚
      ppu0.mirroring('v');
      ppu0.flicker = 'rotate';
      ppu0.flickerStep = 0;                // 輪替交給 NES.SH.OAM（ENGINE_API §15.8）
      g.oam = SH.OAM(ppu0, { reserve: HUD_RESERVE });

      Wp.init();
      En.init();
      audio('init', nes);

      // ---- 網址參數 ----
      var q = null;
      try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
      var stage = q && q.get('stage');
      var roomQ = q && q.get('room');
      var bossQ = q && q.get('boss');
      if (stage && Lv.get(stage)) {
        if (bossQ === '1') {
          // 除錯入口：直接進魔王房並給弱點武器（研究 ⑤ 的剋制環驗證用）
          Wp.unlock(stage === 'frost' ? 'blaze' : 'frost');
          startLevel(stage, Lv.get(stage).rooms.length - 1);
          Wp.select(stage === 'frost' ? 'blaze' : 'frost');
        } else {
          startLevel(stage, roomQ === null ? undefined : (parseInt(roomQ, 10) || 0));
        }
      } else {
        backToSelect();
      }
    },

    update: function (nes) {
      var input = nes.input || NES.Input;
      g.input = input; ctx.input = input;
      g.frames++;
      g.modeFrames++;
      var h = g.hero;

      if (g.cheatCool > 0) g.cheatCool--;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.cheatInv && h.inv <= 0) g.cheatInv = false;

      if (g.mode === 'select') {
        if (input.pressed(BTN.LEFT)) moveSel(-1, 0);
        else if (input.pressed(BTN.RIGHT)) moveSel(1, 0);
        else if (input.pressed(BTN.UP)) moveSel(0, -1);
        else if (input.pressed(BTN.DOWN)) moveSel(0, 1);
        else if (input.pressed(BTN.START) || input.pressed(BTN.A)) {
          var s = MG.SELECT[g.sel];
          if (s && s.open && s.key) { h.lives = 3; h.tanks = 0; startLevel(s.key); }
          else sfx('clink');
        }
      } else if (g.mode === 'ready') {
        if (g.modeFrames >= READY_FRAMES) {
          writeRoom(g.nt);
          g.mode = 'play';
          g.modeFrames = 0;
        }
      } else if (g.mode === 'weaponget') {
        if (input.pressed(BTN.START) || input.pressed(BTN.A) || g.modeFrames > WEAPON_HOLD) backToSelect();
      } else if (g.mode === 'gameover') {
        if (input.pressed(BTN.SELECT)) continueGame();
        else if (input.pressed(BTN.START)) backToSelect();
      } else if (g.mode === 'dead') {
        Hero.update(h, ctx);
        if (h.deadDone) {
          h.lives--;
          if (h.lives < 0) enterGameOver();
          else respawn();
        }
      } else if (g.mode === 'play' && g.paused) {
        if (input.pressed(BTN.UP)) menuMove(-1);
        else if (input.pressed(BTN.DOWN) || input.pressed(BTN.SELECT)) menuMove(1);
        else if (input.pressed(BTN.B)) useTank();
        else if (input.pressed(BTN.START)) unpauseGame();
      } else if (g.mode === 'play' && g.trans) {
        stepTrans();
      } else if (g.mode === 'play') {
        if (input.pressed(BTN.START)) { pauseGame(); musicTick(); return; }
        stepVanish();
        Hero.update(h, ctx);
        Wp.update(ctx);
        En.update(ctx);
        // 魔王房：進房後 36 幀登場
        if (g.room.boss && !g.boss) {
          if (++g.bossT >= BOSS_SPAWN_DELAY) g.boss = Bs.create(g.room.boss);
        }
        if (g.boss) Bs.update(g.boss, ctx);
        stepCollisions();
        updateCheckpoint();

        // 換房 / 邊界
        if (h.state !== 'dead' && !g.trans) {
          if (h.x + h.w > 256) { if (!startTrans('right')) { FX.vsetPx(h.px, 256 - h.w); Hero.sync(h); } }
          else if (h.x < 0) { if (!startTrans('left')) { FX.vsetPx(h.px, 0); Hero.sync(h); } }
          else if (h.climbing && h.y <= 0) { if (!startTrans('up')) { FX.vsetPx(h.py, 0); Hero.sync(h); } }
          else if (h.y > 240) { if (!startTrans('down')) Hero.kill(h, ctx); }
        }
        if (g.boss && g.boss.dead && g.boss.deadT > 90) enterWeaponGet();
        if (h.state === 'dead') enterDead();
      }
      musicTick();
    },

    draw: function (nes) {
      var ppu = nes.ppu, h = g.hero;
      hudSprites();
      var oam = g.oam;
      oam.begin();
      if (!g.paused && (g.mode === 'play' || g.mode === 'ready' || g.mode === 'dead')) {
        if (!g.trans) {
          drawItems(oam);
          En.draw(oam, tiles);
          if (g.boss) Bs.draw(g.boss, oam, tiles);
          Wp.draw(oam, tiles);
        }
        Hero.draw(h, ctx, oam, tiles);
      }
      oam.end();
      void ppu;
    },

    state: function () {
      var h = g.hero;
      return {
        mode: g.mode, modeFrames: g.modeFrames, frames: g.frames,
        level: g.levelKey, room: g.roomIndex, roomName: g.room ? g.room.name : null,
        rooms: g.lv ? g.lv.rooms.length : 0, nt: g.nt,
        trans: g.trans ? { dir: g.trans.dir, t: g.trans.t, len: g.trans.len, to: g.trans.to } : null,
        sel: g.sel, cleared: JSON.parse(JSON.stringify(g.cleared)),
        paused: g.paused, menuSel: g.menuSel,
        x: h.x, y: h.y, vx: h.vx, vy: h.vy, vxPx: h.vx / 256, vyPx: h.vy / 256,
        state: h.state, facing: h.facing, onGround: h.onGround, climbing: h.climbing,
        sliding: h.sliding, inv: h.inv, life: h.life, lives: h.lives, tanks: h.tanks,
        shootT: h.shootT, chargeT: h.chargeT, charging: h.charging,
        ySub: h.py.sub, apexSub: h.apexSub, jumpStartSub: h.jumpStartSub,
        shots: h.shots, jumps: h.jumps, slides: h.slides, climbs: h.climbs, hits: h.hits,
        deaths: g.deaths, transCount: g.transCount, roomVisits: g.roomVisits,
        weapon: Wp.cur, energy: JSON.parse(JSON.stringify(Wp.energy)),
        unlocked: JSON.parse(JSON.stringify(Wp.unlocked)),
        enemies: En.count(), items: g.items.filter(function (i) { return i.alive; }).length,
        boss: Bs.state(g.boss), weaponGot: g.weaponGot,
        cheats: g.cheats, continues: g.continues, secrets: g.secrets, lastCheat: g.lastCheat,
        lastSfx: g.lastSfx, music: g.music,
        checkpoint: g.checkpoint ? { room: g.checkpoint.room, x: g.checkpoint.x, y: g.checkpoint.y } : null,
        vanA: Lv.vanishOn('A', g.frames), vanB: Lv.vanishOn('B', g.frames),
        vanWarnA: Lv.vanishWarn('A', g.frames)
      };
    }
  };

  /* ---------------------- 除錯 / 測試 / 機器人的鉤子 ---------------------- */
  GAME.dev = {
    g: function () { return g; },
    hero: function () { return g.hero; },
    ctx: function () { return ctx; },
    kindAt: kindAt,
    tileAt: tileAt,
    solidAt: solidAt,
    // 不吃消失磚相位的「原始」語意（'vanishA' / 'vanishB' 原樣回傳）：
    // 通關機器人用這個做路徑規劃 ⇒ **永遠不把消失磚算進落腳點**，
    // 也就驗證了「主路線不靠消失磚」這條友善版設計（研究 ⑩⑨）。
    rawKind: function (col, row) { return MG.solidKind(tileAt(col, row)); },
    room: function () { return g.room; },
    route: function () {
      if (!g.room) return null;
      var r = g.room.route || { dir: g.room.next || 'right' };
      return { dir: r.dir, ladderCol: r.ladderCol === undefined ? -1 : r.ladderCol,
               holeCol: r.holeCol === undefined ? -1 : r.holeCol,
               boss: g.room.boss || null, last: g.roomIndex === (g.lv ? g.lv.rooms.length - 1 : 0) };
    },
    roomIndex: function () { return g.roomIndex; },
    warp: function (x, y) { Hero.reset(g.hero, x, y, g.hero.facing); return GAME.state(); },
    gotoRoom: function (i) {
      var r = g.lv.rooms[i];
      if (!r) return null;
      g.nt = 0;
      enterRoom(i, { x: r.entry.x, y: r.entry.y, climb: r.entry.climb });
      g.mode = 'play';
      g.modeFrames = 0;
      return GAME.state();
    },
    level: function (key, room) { startLevel(key, room); g.mode = 'play'; return GAME.state(); },
    setLives: function (n) { g.hero.lives = n | 0; },
    setLife: function (n) { g.hero.life = n | 0; },
    setTanks: function (n) { g.hero.tanks = n | 0; },
    unlock: function (k) { return Wp.unlock(k); },
    setWeapon: function (k) { return Wp.select(k); },
    weapons: function () { return Wp.state(); },
    weaponList: function () { return Wp.list(); },
    enemies: function () { return En.state(); },
    clearEnemies: function () { En.reset(); return 0; },   // 測試用：把這間房的雜魚清掉（手感 / 換房測量不被干擾）
    eshots: function () {
      var out = [];
      Wp.eshots.each(function (s) { out.push({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, dmg: s.dmg }); });
      return out;
    },
    shots: function () {
      var out = [];
      Wp.shots.each(function (s) { out.push({ x: s.x, y: s.y, vx: s.vx, kind: s.kind, dmg: s.dmg, lvl: s.lvl }); });
      return out;
    },
    boss: function () { return Bs.state(g.boss); },
    bossObj: function () { return g.boss; },
    items: function () { return g.items.map(function (i) { return { kind: i.kind, x: i.x, y: i.y, alive: i.alive }; }); },
    select: function (n) { g.sel = n | 0; paintCursor(); return g.sel; },
    pause: function () { if (g.mode === 'play' && !g.paused) pauseGame(); return g.paused; },
    unpause: function () { if (g.paused) unpauseGame(); return g.paused; },
    menu: function () { return { sel: g.menuSel, paused: g.paused, list: Wp.list() }; },
    cheat: requestCheat,
    tiles: function () { return tiles; },
    bgIndex: bgIndex,
    ntTileAt: function (col, row, nt) { return ppu0.getTile(nt === undefined ? g.nt : nt, col, row); },
    screenText: function (row, col, len) {
      var s = '', i, t, names = bgBank.names, nt = g.nt;
      for (i = 0; i < len; i++) {
        t = ppu0.getTile(nt, col + i, row);
        var nm = names[t] || 'SP';
        if (nm === 'SP') s += ' ';
        else if (nm.charAt(0) === 'N' && nm.length === 2) s += nm.charAt(1);
        else if (nm.length === 1) s += nm;
        else if (nm === 'DASH') s += '-';
        else if (nm === 'EXCL') s += '!';
        else if (nm === 'P_IN') s += '#';
        else if (nm === 'MUL') s += 'x';
        else s += '?';
      }
      return s;
    },
    vanish: function (grp) { return { on: Lv.vanishOn(grp, g.frames), warn: Lv.vanishWarn(grp, g.frames), phase: Lv.vanishPhase(grp, g.frames) }; },
    frames: function () { return g.frames; },
    budget: function () { return nes0.timing.budget.report(); }
  };

  MG.GAME = GAME;
  window.GAME = GAME;
})();
