/*
 * games/star/main.js — 《星塵勇者》主程式（window.GAME）
 * ---------------------------------------------------------------------------
 * 擁有者：star-hero agent ｜ 依賴：games/star/{chr_hero,hero}.js（自己的）
 *                                   games/star/{chr_world,levels_w1,enemies,boss,song}.js（star-world / star-audio，全部可缺席）
 *                                   engine/*（NES.FX / NES.PPU / NES.SH / NES.Input）
 * 契約：docs/TASKS.md「R2b《星塵勇者》W1 §契約」、docs/ENGINE_API.md §7 / §12 / §15
 *
 * 職責：CHR / 調色盤合併、模式機（title → play → dead → clear → gameover）、
 *       雙向鏡頭 + 名稱表欄串流（`NES.SH.Scroller`，左右都補）、上方 32 線 HUD（只寫有變的格）、
 *       OAM 配置（`NES.SH.OAM`，`ppu.flickerStep = 0` 軟體 sprite cycling）、
 *       關卡互動（金幣 / ? 磚 / BRICK 頂撞 / GOAL）、敵人與魔王的呼叫點、`state()`。
 *
 * 跨模組防禦：star-world（`ST.LEVELS` / `ST.TILE` / `ST.solidKind` / `ST.Enemies` / `ST.Boss` /
 *   `ST.SPR_WORLD` / `ST.BG_WORLD`）與 star-audio（`ST.Audio`）**任一缺席都不會壞**：
 *   缺磚語意 → 用本檔的後備 `ST.TILE` / `ST.solidKind`；缺關卡 → 用內建測試關 `ST.LEVELS['test']`
 *   （20+ 欄平地 + 4 磚牆 + 坑 + 單向平台 + ? 磚 + 金幣 + 尖刺 + 熔岩 + GOAL，供 test_star.py 與機器人驗證）；
 *   缺地形磚 → 用 `ST.BG_FALLBACK`（chr_hero.js）。
 *
 * 網址參數：`?level=1-2`（或 `?level=test`）直接開該關並跳過標題（測試 / 通關機器人用）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var ST = window.ST = window.ST || {};
  var FX = NES.FX, SMB = FX.SMB, SH = NES.SH;
  var BTN = NES.Input.BTN;
  var Hero = ST.Hero;
  if (!Hero) throw new Error('games/star/main.js 需要 games/star/hero.js');
  if (!SH || !SH.Scroller) throw new Error('games/star/main.js 需要 engine/shmup.js（NES.SH）');

  /* ============================== 常數 ============================== */
  var SCREEN_W = 256;
  var ROWS = 30, TOP_ROW = 4;                 // 列 0..3 = HUD（split 上段），列 4..29 = 關卡
  var SPLIT_LINE = TOP_ROW * 8;               // 32
  var CAM_R = 102;                            // 畫面 40%（0.4 × 256 = 102.4）→ 往右推進觸發
  var CAM_L = 64;                             // 畫面 25% → 往左回捲觸發
  var NT_WINDOW = 64;                         // 兩張名稱表 = 64 欄的環形視窗
  var SCROLL_AHEAD = 34;
  var LEVEL_ORDER = ['1-1', '1-2', '1-3', '1-4'];
  var TIME_START = 300;
  var SCORE_STOMP = 100, SCORE_COIN = 200, SCORE_GOAL = 1000, SCORE_PER_TIME = 50;
  var CLEAR_HOLD = 40;                        // 結算完停幾幀再進下一關

  /* ===================== 磚語意（star-world 缺席時的後備） ===================== */
  function ensureTiles() {
    if (!ST.TILE) {
      ST.TILE = {
        EMPTY: 0, GROUND: 1, BRICK: 2, QBLOCK: 3, USED: 4, PLATFORM: 5,
        SPIKE: 6, PIPE: 7, COIN: 8, GOAL: 9, LAVA: 10, SLOPE_L: 11, SLOPE_R: 12
      };
      ST.TILE_FALLBACK = true;
    }
    if (typeof ST.solidKind !== 'function') {
      var T = ST.TILE;
      ST.solidKind = function (t) {
        switch (t) {
          case T.GROUND: case T.BRICK: case T.QBLOCK: case T.USED: case T.PIPE: return 'solid';
          case T.PLATFORM: return 'oneway';
          case T.SPIKE: case T.LAVA: return 'hurt';
          case T.SLOPE_L: return 'slopeL';
          case T.SLOPE_R: return 'slopeR';
          default: return 'none';
        }
      };
      ST.SOLIDKIND_FALLBACK = true;
    }
  }

  // 磚語意 → 後備地形磚名（chr_hero.js 的 ST.BG_FALLBACK）
  function fallbackBgName(t) {
    var T = ST.TILE;
    if (t === T.GROUND) return 'F_GTOP';
    if (t === T.DIRT) return 'F_GND';
    if (t === T.BRICK) return 'F_BRICK';
    if (t === T.QBLOCK) return 'F_QBLOCK';
    if (t === T.USED || t === T.BLOCK) return 'F_USED';
    if (t === T.PLATFORM || t === T.PLAT_L || t === T.PLAT_R) return 'F_PLAT';
    if (t === T.SPIKE) return 'F_SPIKE';
    if (t === T.LAVA) return 'F_LAVA';
    if (t === T.COIN) return 'F_COIN';
    if (t === T.GOAL || t === T.GOAL_TOP || t === T.FLAG) return 'F_GOAL';
    if (t === T.PIPE || t === T.PIPE_TL || t === T.PIPE_TR || t === T.PIPE_BL || t === T.PIPE_BR) return 'F_PIPE';
    if (t === T.SLOPE_L || t === T.SLOPE_R) return 'F_GND';
    return 'SP';
  }

  /* ===================== 內建測試關（star-world 未就緒時用） ===================== */
  // 128 欄 × 30 列 = 4 個畫面寬。決定性、沒有亂數 ⇒ 測試與通關機器人都可重現。
  // 版面：欄 0..44 是完全淨空的助跑道（手感測試要量「靜止 → 全速 → 跳」，頭上不能有東西）；
  //       之後依序是 ? 磚 / 金幣 / 4 磚牆 / 坑 / 單向平台 / 尖刺 / 熔岩 / GOAL。
  var TEST = {
    COLS: 128, GROUND_ROW: 26,
    QBLOCK: [50, 52], BRICK: 51, BLOCK_ROW: 21,
    COINS: [56, 57, 58], COIN_ROW: 24,
    WALL: 64, WALL_ROWS: [22, 25],
    PIT: [70, 72],
    PLAT: [78, 84], PLAT_ROW: 21,
    SPIKE: 90, SPIKE_ROW: 25,
    LAVA: [96, 98],
    GOAL: 110, GOAL_ROWS: [22, 25],
    CHECKPOINTS: [0, 60],
    START_X: 32
  };
  function buildTestLevel() {
    var T = ST.TILE, COLS = TEST.COLS, GROUND_ROW = TEST.GROUND_ROW;
    var DIRT = (T.DIRT === undefined) ? T.GROUND : T.DIRT;
    var BLOCK = (T.BLOCK === undefined) ? T.GROUND : T.BLOCK;
    var map = new Uint8Array(COLS * ROWS);
    function set(c, r, t) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[c * ROWS + r] = t; }
    var c, r;
    for (c = 0; c < COLS; c++) {
      if (c >= TEST.PIT[0] && c <= TEST.PIT[1]) continue;                 // 坑
      if (c >= TEST.LAVA[0] && c <= TEST.LAVA[1]) {                       // 熔岩池
        for (r = GROUND_ROW; r < ROWS; r++) set(c, r, T.LAVA);
        continue;
      }
      set(c, GROUND_ROW, T.GROUND);
      for (r = GROUND_ROW + 1; r < ROWS; r++) set(c, r, DIRT);
    }
    set(TEST.QBLOCK[0], TEST.BLOCK_ROW, T.QBLOCK);
    set(TEST.BRICK, TEST.BLOCK_ROW, T.BRICK);
    set(TEST.QBLOCK[1], TEST.BLOCK_ROW, T.QBLOCK);
    for (c = 0; c < TEST.COINS.length; c++) set(TEST.COINS[c], TEST.COIN_ROW, T.COIN);
    for (r = TEST.WALL_ROWS[0]; r <= TEST.WALL_ROWS[1]; r++) set(TEST.WALL, r, BLOCK);
    for (c = TEST.PLAT[0]; c <= TEST.PLAT[1]; c++) set(c, TEST.PLAT_ROW, T.PLATFORM);
    set(TEST.SPIKE, TEST.SPIKE_ROW, T.SPIKE);
    for (r = TEST.GOAL_ROWS[0]; r <= TEST.GOAL_ROWS[1]; r++) set(TEST.GOAL, r, T.GOAL);

    return {
      name: 'TEST', cols: COLS, theme: 'ground', music: 'ground', time: 300,
      start: { x: TEST.START_X, y: GROUND_ROW * 8 - Hero.H },
      goal: { col: TEST.GOAL, row: TEST.GOAL_ROWS[0] },
      checkpoints: TEST.CHECKPOINTS.slice(),
      spawns: [],
      groundRow: GROUND_ROW,
      layout: TEST,
      tileAt: function (c2, r2) {
        if (c2 < 0 || c2 >= COLS || r2 < 0 || r2 >= ROWS) return T.EMPTY;
        return map[c2 * ROWS + r2];
      },
      setTile: function (c2, r2, t) {
        if (c2 < 0 || c2 >= COLS || r2 < 0 || r2 >= ROWS) return false;
        map[c2 * ROWS + r2] = t;
        return true;
      },
      attrAt: function (c16, r16) {
        if (r16 >= 13) return 1;                  // 泥土 / 熔岩
        if (r16 >= 10 && r16 <= 12) return 2;     // 磚 / 平台 / 尖刺 / GOAL
        return 3;                                  // 天空
      }
    };
  }

  /* ===================== 主題調色盤（star-world 可用 lv.pal 覆寫） ===================== */
  var THEMES = {
    ground: { backdrop: 0x22, bg: [[0x0F, 0x10, 0x30], [0x07, 0x17, 0x27], [0x0F, 0x17, 0x28], [0x09, 0x1A, 0x2A]] },
    cave: { backdrop: 0x0F, bg: [[0x0F, 0x10, 0x30], [0x01, 0x11, 0x21], [0x0F, 0x17, 0x28], [0x00, 0x10, 0x20]] },
    sky: { backdrop: 0x21, bg: [[0x0F, 0x10, 0x30], [0x02, 0x12, 0x22], [0x0F, 0x17, 0x28], [0x10, 0x20, 0x30]] },
    castle: { backdrop: 0x0F, bg: [[0x0F, 0x10, 0x30], [0x06, 0x16, 0x26], [0x0F, 0x17, 0x28], [0x00, 0x10, 0x20]] }
  };
  var SPR_PAL = [
    [0x0F, 0x12, 0x27],   // 0 主角（黑描邊 / 藍戰衣 / 膚色）
    [0x0F, 0x27, 0x28],   // 1 道具 / 粒子（金幣）
    [0x0F, 0x08, 0x38],   // 2 敵人 A
    [0x0F, 0x06, 0x16]    // 3 敵人 B / 魔王
  ];

  /* ============================== 遊戲狀態 ============================== */
  var g = null, nes0 = null, ppu0 = null;
  var bgBank = null, sprBank = null, tileOf = {}, heroTiles = {};

  function newState() {
    return {
      mode: 'title', frames: 0, modeFrames: 0,
      levelId: null, levelIndex: 0, lv: null, cols: 0,
      over: null,                       // 磚覆寫（? 磚頂過 / 金幣撿走）
      hero: null, input: null,
      camX: 0, camMin: 0, scr: null, scrLeft: 0, oam: null,
      time: TIME_START, timeTick: 0,
      checkpoint: 0, clearTally: 0, cleared: false, won: false,
      pops: [], bump: null, bossClear: 0,
      level: null, solidAt: null,
      hud: {}, hudDirty: true,
      startLevel: null, skipTitle: false,
      banner: null, bossMusic: 0,
      lastSfx: null, colWrites: 0
    };
  }

  /* ------------------------------- 關卡查詢 ------------------------------- */
  function tileAt(col, row) {
    if (col < 0 || col >= g.cols || row < 0 || row >= ROWS) return ST.TILE.EMPTY;
    var k = col * 32 + row, o = g.over[k];
    if (o !== undefined) return o;
    var t = g.lv.tileAt(col, row);
    return (t === undefined || t === null) ? ST.TILE.EMPTY : (t | 0);
  }
  // 改一格地形：關卡自己有 setTile（star-world 的 Level）就交給它（屬性會一起更新），
  // 否則記在本檔的覆寫表（內建測試關用）。兩種情況都只重寫那一格名稱表（1 byte）。
  function setTileCode(col, row, t) {
    var lv = g.lv;
    if (lv && typeof lv.setTile === 'function') {
      try { lv.setTile(col, row, t); if (lv.clearDirty) lv.clearDirty(); } catch (e) { g.over[col * 32 + row] = t; }
    } else {
      g.over[col * 32 + row] = t;
    }
    if (ppu0) writeOneTile(col, row);
  }
  function kindAt(col, row) { return ST.solidKind(tileAt(col, row)); }
  function isLava(t) { return t === ST.TILE.LAVA; }
  function attrAt(c16, r16) {
    if (!g.lv.attrAt) return 1;
    var a = g.lv.attrAt(c16, r16);
    return (a === undefined || a === null) ? 1 : (a & 3);
  }

  // 磚索引 → 字元（dev.screenText 用的反查表；第一個對到的字元優先 ⇒ ' ' 對 SP、'*' 對 MUL）
  var charOfTile = null;
  function tileChar(idx) {
    if (!charOfTile) {
      charOfTile = {};
      var ch, n, i;
      for (ch in ST.CHARMAP) {
        if (!Object.prototype.hasOwnProperty.call(ST.CHARMAP, ch)) continue;
        n = ST.CHARMAP[ch];
        if (!bgBank || !bgBank.has(n)) continue;
        i = bgBank.index(n);
        if (charOfTile[i] === undefined) charOfTile[i] = ch;
      }
    }
    var c = charOfTile[idx];
    return c === undefined ? '?' : c;
  }

  function bgIndex(name) {
    var i = tileOf[name];
    if (i !== undefined) return i;
    if (bgBank && bgBank.has(name)) { tileOf[name] = bgBank.index(name); return tileOf[name]; }
    tileOf[name] = 0;                 // 未知磚名 → 空白（磚 0），不讓整個畫面掛掉
    return 0;
  }
  function bgNameFor(t, col, row) {
    var lv = g.lv;
    if (lv && typeof lv.bgName === 'function') return lv.bgName(t, col, row);
    if (lv && typeof lv.tileName === 'function') return lv.tileName(t, col, row);
    if (typeof ST.bgName === 'function') return ST.bgName(t, col, row);
    return fallbackBgName(t);
  }
  // 名稱表要填的磚索引。優先順序：
  //   ① 關卡自己的 `chrAt(col,row)`（star-world 的作法，回傳磚索引或磚名）——但本格被
  //      遊戲改過（? 磚頂成 USED / 金幣被撿走）時跳過，改走磚語意 → 磚名
  //   ② `lv.bgName / lv.tileName / ST.bgName`（磚語意 → 磚名）
  //   ③ 本檔的後備表（`ST.BG_FALLBACK`，內建測試關用）
  function scrTileAt(col, row) {
    var lv = g.lv, ov = g.over[col * 32 + row], v;
    if (ov === undefined && lv && typeof lv.chrAt === 'function') {
      try { v = lv.chrAt(col, row); } catch (e) { v = undefined; }
      if (typeof v === 'number') return v & 255;
      if (typeof v === 'string') return bgIndex(v);
    }
    return bgIndex(bgNameFor(tileAt(col, row), col, row));
  }

  // 單格重寫（? 磚變 USED、金幣被撿走）：1 byte
  function writeOneTile(col, row) {
    if (row < TOP_ROW || row >= ROWS) return;
    var ntc = col & (NT_WINDOW - 1);
    ppu0.setTile((ntc >> 5) & 1, ntc & 31, row, scrTileAt(col, row));
  }

  // 第 col 欄「最底層地面」的站立 y：從關卡底部往上找連續 solid 的頂端
  // （不能從上往下找第一個 solid，否則會站到頭頂的 ? 磚 / 浮台上）
  function groundYAt(col) {
    var r, top = -1;
    for (r = ROWS - 1; r >= TOP_ROW; r--) {
      if (kindAt(col, r) === 'solid') top = r;
      else if (top >= 0) break;
    }
    if (top < 0) return (ROWS - 4) * 8 - Hero.H;
    return top * 8 - Hero.H;
  }

  /* ------------------------------- 關卡載入 ------------------------------- */
  function levelList() {
    var out = [], i;
    for (i = 0; i < LEVEL_ORDER.length; i++) if (ST.LEVELS[LEVEL_ORDER[i]]) out.push(LEVEL_ORDER[i]);
    return out;
  }

  function loadLevel(id, keepStats) {
    var lv = ST.LEVELS[id];
    if (!lv) { id = 'test'; lv = ST.LEVELS.test; }
    g.levelId = id;
    g.lv = lv;
    g.level = lv;                            // star-world 的 ST.Enemies / ST.Boss 讀這個
    g.solidAt = (typeof lv.solidAt === 'function') ? lv.solidAt : null;
    g.cols = lv.cols | 0;
    g.over = {};
    g.time = (lv.time | 0) || TIME_START;
    g.timeTick = 0;
    g.cleared = false;
    g.bossClear = 0;
    g.bossMusic = 0;
    g.pops.length = 0;
    g.bump = null;
    g.checkpoint = -1;                      // −1 = 還沒過檢查點 ⇒ 死亡回關卡起點

    var h = g.hero;
    var sx = (lv.start && lv.start.x) | 0, sy = (lv.start && lv.start.y);
    if (sy === undefined || sy === null) sy = groundYAt(sx >> 3);
    Hero.reset(h, sx, sy, 1);
    if (!keepStats) { /* 分數 / 命 / 金幣跨關保留 */ }

    applyPalettes(ppu0, lv);
    makeScroller();
    g.camX = clampCam(h.x - CAM_R);
    g.camMin = 0;
    hudReset();
    rebuildScreen();
    // 敵人 / 魔王：交給 star-world 自己初始化（出怪表、橋 / 斧頭機關）
    if (ST.Enemies && typeof ST.Enemies.init === 'function') { try { ST.Enemies.init(lv, { solidAt: g.solidAt }); } catch (e) { } }
    if (ST.Boss && typeof ST.Boss.init === 'function') { try { ST.Boss.init(lv); } catch (e) { } }
    g.hudDirty = true;
    audio('play', lv.music || themeOf(lv));
  }

  function themeOf(lv) { return (lv && lv.theme) || 'ground'; }

  function applyPalettes(ppu, lv) {
    var th = THEMES[themeOf(lv)] || THEMES.ground;
    var backdrop = (lv && lv.backdrop !== undefined) ? lv.backdrop : th.backdrop;
    var bg = (lv && lv.bgPal) || th.bg;
    var spr = (lv && lv.sprPal) || SPR_PAL;
    var i;
    if (ST.World && typeof ST.World.applyPalettes === 'function' && !(lv && lv.bgPal)) {
      // star-world 負責 bg/spr 的第 1..3 組與底色；第 0 組（HUD / 主角）永遠由本檔決定
      try { ST.World.applyPalettes(ppu, themeOf(lv)); } catch (e) { ppu.setBackdrop(backdrop); }
      ppu.setBgPalette(0, bg[0] || th.bg[0]);
      ppu.setSprPalette(0, spr[0] || SPR_PAL[0]);
      return;
    }
    ppu.setBackdrop(backdrop);
    for (i = 0; i < 4; i++) {
      ppu.setBgPalette(i, bg[i] || th.bg[i]);
      ppu.setSprPalette(i, spr[i] || SPR_PAL[i]);
    }
  }

  function makeScroller() {
    g.scr = SH.Scroller(ppu0, {
      nt: 2, cols: g.cols, row0: TOP_ROW, rows: ROWS - TOP_ROW, ahead: SCROLL_AHEAD,
      tileAt: scrTileAt, attrAt: attrAt
    });
  }

  // 整片重畫（init / 換關 / 檢查點復活）：2400 byte，等同真機「關 rendering 時重寫名稱表」，
  // 所以暫時把 VBlank 預算計帳靜音（budget.mute，見 ENGINE_API §5）。
  function rebuildScreen() {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    g.scr.reset(g.camX);
    g.scrLeft = g.camX >> 3;
    hudStatic(ppu0);
    hudWrite(ppu0, true);
    if (bud) bud.mute = muted;
  }

  function clampCam(x) {
    var max = g.cols * 8 - SCREEN_W;
    if (max < 0) max = 0;
    if (x > max) x = max;
    if (x < 0) x = 0;
    return x;
  }

  /* ------------------------------- HUD ------------------------------- */
  // 上方 32 線（列 0..3）；只寫「有變的格」⇒ 全部欄位同時變也只有 15 byte。
  var HUD_STATIC = [
    { row: 1, col: 1, text: 'SCORE' },
    { row: 1, col: 10, text: 'COIN' },
    { row: 1, col: 16, text: 'TIME' },
    { row: 1, col: 22, text: 'WORLD' },
    { row: 1, col: 28, text: '^x' },
    { row: 2, col: 10, text: '@x' }
  ];
  var HUD_FIELDS = [
    { key: 'score', row: 2, col: 1, len: 6 },
    { key: 'coins', row: 2, col: 12, len: 2 },
    { key: 'time', row: 2, col: 16, len: 3 },
    { key: 'world', row: 2, col: 22, len: 3 },
    { key: 'lives', row: 1, col: 30, len: 1 }
  ];

  function pad(n, w) {
    var s = String(n);
    if (s.length > w) s = s.slice(-w);
    while (s.length < w) s = '0' + s;
    return s;
  }

  function writeText(ppu, nt, col, row, str) {
    var t = ST.textTiles(bgBank, str), i;
    for (i = 0; i < t.length && col + i < 32; i++) ppu.setTile(nt, col + i, row, t[i]);
  }

  function hudStatic(ppu) {
    var r, i;
    for (r = 0; r < TOP_ROW; r++) ppu.fillTiles(0, 0, r, 32, 1, bgIndex('SP'));
    ppu.fillAttr(0, 0, 0, 16, 2, 0);          // 列 0..3 = 屬性 row16 0..1 → 調色盤 0（HUD）
    for (i = 0; i < HUD_STATIC.length; i++) {
      writeText(ppu, 0, HUD_STATIC[i].col, HUD_STATIC[i].row, HUD_STATIC[i].text);
    }
  }

  function hudReset() { g.hud = {}; }

  function hudValue(key) {
    var h = g.hero;
    switch (key) {
      case 'score': return pad(h.score, 6);
      case 'coins': return pad(h.coins, 2);
      case 'time': return pad(g.time, 3);
      case 'world': return String(g.levelId).slice(0, 3);
      case 'lives': return pad(h.lives < 0 ? 0 : (h.lives > 9 ? 9 : h.lives), 1);
    }
    return '';
  }

  // force = true 時整批重寫（換關 / init）；平常只寫與上一幀不同的字
  function hudWrite(ppu, force) {
    var i, j, f, val, old, n = 0;
    for (i = 0; i < HUD_FIELDS.length; i++) {
      f = HUD_FIELDS[i];
      val = hudValue(f.key);
      old = g.hud[f.key];
      if (!force && old === val) continue;
      var t = ST.textTiles(bgBank, val);
      for (j = 0; j < t.length && j < f.len; j++) {
        if (force || !old || old.charAt(j) !== val.charAt(j)) { ppu.setTile(0, f.col + j, f.row, t[j]); n++; }
      }
      g.hud[f.key] = val;
    }
    return n;
  }

  /* -------------------- 全屏文字（標題 / GAME OVER / 破關）-------------------- */
  // 這些字是「疊在關卡畫面上」的，所以座標一律用**螢幕欄 0..31**，寫入時才換算成
  // 名稱表座標：下段的捲動是 `ppu.split(32, {x: camX % 512, nt: 0})`，世界第 c 欄固定
  // 落在 `c & 63` ⇒ nt `(c>>5)&1` 的第 `c&31` 欄。camX 任意值（含 camX % 512 ≥ 256、
  // 文字跨兩張名稱表）都會被自動分段寫到「目前看得見的那一張」。
  // （qa2-star P1-1：舊版只寫 nt 0 的固定欄，camX 一大就看不到字。）

  var TITLE = [
    { row: 9, col: 9, text: 'STARDUST HERO' },
    { row: 11, col: 11, text: 'WORLD 1' },
    { row: 14, col: 10, text: 'PRESS START' },
    { row: 17, col: 8, text: '$ 2026 ORIGINAL' }
  ];
  var GAMEOVER_LINES = [
    { row: 12, col: 12, text: 'GAME OVER' },
    { row: 16, col: 10, text: 'PRESS START' }
  ];
  // 破完 1-4：多一行分數（進入畫面時才算得出來，所以用函式產生）
  function winLines() {
    return [
      { row: 10, col: 9, text: 'WORLD 1 CLEAR' },
      { row: 13, col: 11, text: 'THANK YOU' },
      { row: 16, col: 10, text: 'SCORE ' + pad(g.hero.score, 6) },
      { row: 19, col: 10, text: 'PRESS START' }
    ];
  }

  // 螢幕欄 sc（0..31）→ {nt, col}；世界欄 = (camX >> 3) + sc
  var NTP = { nt: 0, col: 0 };
  function ntOfScreenCol(sc) {
    var wc = ((g.camX >> 3) + sc) & (NT_WINDOW - 1);
    NTP.nt = (wc >> 5) & 1;
    NTP.col = wc & 31;
    return NTP;
  }

  // 文字所在的 16×16 屬性區塊：paint = true 時塗成調色盤 0（白字），否則還原成關卡的值
  function bannerAttr(ppu, lines, paint) {
    var i, j, t, sc, wc, p, r16;
    for (i = 0; i < lines.length; i++) {
      t = lines[i];
      r16 = t.row >> 1;
      for (j = 0; j < t.text.length; j++) {
        sc = t.col + j;
        if (sc < 0 || sc > 31) continue;
        wc = (g.camX >> 3) + sc;
        p = ntOfScreenCol(sc);
        ppu.setAttr(p.nt, p.col >> 1, r16, paint ? 0 : attrAt(wc >> 1, r16));
      }
    }
  }

  // 畫一組字（疊在關卡上）。整片重畫是模式切換的一次性動作 ⇒ 比照 rebuildScreen 靜音預算計帳。
  function drawBanner(ppu, lines) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    var i, j, t, tiles, sc, p;
    bannerAttr(ppu, lines, true);
    for (i = 0; i < lines.length; i++) {
      t = lines[i];
      tiles = ST.textTiles(bgBank, t.text);
      for (j = 0; j < tiles.length; j++) {
        sc = t.col + j;
        if (sc < 0 || sc > 31) continue;
        p = ntOfScreenCol(sc);
        ppu.setTile(p.nt, p.col, t.row, tiles[j]);
      }
    }
    if (bud) bud.mute = muted;
  }

  // 擦掉（把那幾格換回關卡原本的磚 / 屬性）
  function clearBanner(ppu, lines) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    var i, j, t, sc, wc, p;
    for (i = 0; i < lines.length; i++) {
      t = lines[i];
      for (j = 0; j < t.text.length; j++) {
        sc = t.col + j;
        if (sc < 0 || sc > 31) continue;
        wc = (g.camX >> 3) + sc;
        p = ntOfScreenCol(sc);
        ppu.setTile(p.nt, p.col, t.row, scrTileAt(wc, t.row));
      }
    }
    bannerAttr(ppu, lines, false);
    if (bud) bud.mute = muted;
  }

  function drawTitle(ppu) { drawBanner(ppu, TITLE); }
  function clearTitle(ppu) { clearBanner(ppu, TITLE); }

  /* ------------------------------- 音訊 ------------------------------- */
  function audio(fn, a) {
    if (ST.Audio && typeof ST.Audio[fn] === 'function') {
      try { return ST.Audio[fn](a === undefined ? nes0 : a, nes0); } catch (e) { }
    }
    return null;
  }
  function sfx(name) {
    g.lastSfx = name;
    if (ST.Audio && typeof ST.Audio.sfx === 'function') { try { ST.Audio.sfx(name, nes0); } catch (e) { } }
  }
  function musicTick() {
    if (ST.Audio && typeof ST.Audio.tick === 'function') { try { ST.Audio.tick(nes0); return; } catch (e) { } }
    if (nes0 && nes0.music && typeof nes0.music.tick === 'function') nes0.music.tick();
  }

  /* ------------------------------- 跨模組呼叫 ------------------------------- */

  // 走訪目前活著的敵人（star-world 的列舉方式尚未定案 ⇒ 支援 each / list / pool 三種）
  function eachEnemy(fn) {
    var E = ST.Enemies;
    if (!E) return 0;
    var n = 0;
    function visit(e) { if (e && e.alive !== false) { fn(e); n++; } }
    if (typeof E.each === 'function') { E.each(g, visit); return n; }
    var arr = null;
    if (typeof E.list === 'function') arr = E.list(g);
    else if (E.items) arr = E.items;
    else if (E.pool && E.pool.items) arr = E.pool.items;
    else if (g.enemies && g.enemies.items) arr = g.enemies.items;
    if (arr) { for (var i = 0; i < arr.length; i++) visit(arr[i]); }
    return n;
  }

  /* ------------------------------- 互動磚 ------------------------------- */
  function onTouch(col, row, t) {
    var T = ST.TILE, h = g.hero;
    if (t === T.COIN) {
      if (typeof g.lv.take === 'function') { try { g.lv.take(col, row); } catch (e) { } }
      if (tileAt(col, row) === T.COIN) setTileCode(col, row, T.EMPTY); else writeOneTile(col, row);
      Hero.addCoin(h, ctx, 1);
      h.score += SCORE_COIN;
      g.hudDirty = true;
      sfx('coin');
    } else if (t === T.GOAL && g.mode === 'play') {
      enterClear();
    }
  }

  function onBump(col, row) {
    var T = ST.TILE, h = g.hero, t = tileAt(col, row);
    if (t === T.QBLOCK) {
      if (g.lv && typeof g.lv.hit === 'function') {
        try { g.lv.hit(col, row); } catch (e) { }
        if (tileAt(col, row) === T.QBLOCK) setTileCode(col, row, T.USED);
        else writeOneTile(col, row);
      } else {
        setTileCode(col, row, T.USED);
      }
      Hero.addCoin(h, ctx, 1);
      h.score += SCORE_COIN;
      g.pops.push({ x: col * 8, y: row * 8, t: 0 });
      g.hudDirty = true;
      sfx('coin');
    } else if (t === T.BRICK) {
      g.bump = { col: col, row: row, t: 8 };     // 頂撞震動（畫面上把該格往上挪 2 px 的粒子）
      sfx('bump');
    } else {
      sfx('bump');
    }
  }

  /* ------------------------------- 鏡頭 ------------------------------- */
  function stepCamera() {
    var h = g.hero, want = g.camX;
    var sx = h.x - g.camX;
    if (sx > CAM_R) want = h.x - CAM_R;            // 往右推進 40% 觸發
    else if (sx < CAM_L) want = h.x - CAM_L;       // 往左回捲 25% 觸發
    want = clampCam(want);
    // 名稱表只保留最近 64 欄 ⇒ 回捲不可超過「已寫過的最左欄」
    var minCol = g.scr.next - NT_WINDOW;
    if (minCol < 0) minCol = 0;
    var minX = minCol * 8;
    if (want < minX) want = minX;
    g.camX = want;
    g.camMin = minX;
    // 主角不能被推出畫面左緣（SMB 行為）
    if (h.x < g.camX) { h.x = g.camX; FX.vsetPx(h.px, g.camX); if (h.vxA.v < 0) FX.aset(h.vxA, 0); }
  }

  // 雙向欄串流：右邊交給 NES.SH.Scroller.update()，左邊自己用 Scroller.writeColumn() 補
  function streamColumns() {
    var scr = g.scr, wrote = 0;
    wrote += scr.update(g.camX) > 0 ? 1 : 0;
    if (scr.next - NT_WINDOW > g.scrLeft) g.scrLeft = scr.next - NT_WINDOW;   // 被右邊蓋掉的舊欄
    var want = (g.camX >> 3) - 1;
    if (want < 0) want = 0;
    if (want < g.scrLeft) {
      var c = g.scrLeft - 1;
      scr.writeColumn(c);
      g.scrLeft = c;
      // 寫 c 會蓋掉 c + 64 那一欄 ⇒ 讓 Scroller 之後重寫它
      if (scr.next > c + NT_WINDOW) scr.next = c + NT_WINDOW;
      wrote++;
    }
    g.colWrites += wrote;
    return wrote;
  }

  /* ------------------------------- 模式 ------------------------------- */
  function enterClear() {
    g.mode = 'clear';
    g.modeFrames = 0;
    g.clearTally = 0;
    g.cleared = true;
    g.hero.score += SCORE_GOAL;
    g.hudDirty = true;
    sfx('goal');
    if (g.bossMusic !== 2) audio('play', 'clear');     // 打倒魔王時已經切過 clear，別重頭再播一次
  }

  // 輸光命（won = false）與破完 W1（won = true）共用 gameover 模式，但畫**不同的字**
  function enterGameOver(won) {
    g.won = !!won;
    g.mode = 'gameover';
    g.modeFrames = 0;
    // 鏡頭對齊 8 px：下段 split 的 fine scroll 不為 0 時文字磚會被切半格
    g.camX = clampCam(g.camX & ~7);
    g.banner = won ? winLines() : GAMEOVER_LINES;
    drawBanner(ppu0, g.banner);
    audio('play', won ? 'clear' : 'gameover');
  }

  function enterDead() {
    g.mode = 'dead';
    g.modeFrames = 0;
    audio('play', 'death');
  }

  function respawn() {
    var h = g.hero, lv = g.lv, x, y;
    var col = g.checkpoint | 0;
    if (typeof lv.respawn === 'function') {
      var rp = lv.respawn(col >= 0 ? col : -1);
      x = rp.x | 0; y = rp.y | 0;
    } else if (col > 0) {
      x = col * 8; y = groundYAt(col);
    } else {
      x = (lv.start && lv.start.x) | 0;
      y = (lv.start && lv.start.y !== undefined) ? lv.start.y : groundYAt(x >> 3);
    }
    Hero.reset(h, x, y, 1);
    g.time = (lv.time | 0) || TIME_START;
    g.timeTick = 0;
    g.pops.length = 0;
    g.bump = null;
    g.camX = clampCam(x - CAM_R);
    hudReset();
    rebuildScreen();
    // 檢查點復活：相機左邊的敵人視為已出過，右邊的重新排隊（契約 ENGINE_API §15.8-5）
    if (ST.Enemies && typeof ST.Enemies.seek === 'function') { try { ST.Enemies.seek(g.camX); } catch (e) { } }
    else if (ST.Enemies && typeof ST.Enemies.reset === 'function') { try { ST.Enemies.reset(); } catch (e) { } }
    if (ST.Boss && typeof ST.Boss.reset === 'function') { try { ST.Boss.reset(); } catch (e) { } }
    g.bossMusic = 0;                          // 魔王房復活：重新進房時再切一次 boss 曲
    g.mode = 'play';
    g.modeFrames = 0;
    g.hudDirty = true;
    audio('play', lv.music || themeOf(lv));
  }

  function nextLevel() {
    var list = levelList();
    var i = list.indexOf(g.levelId);
    if (i >= 0 && i + 1 < list.length) {
      loadLevel(list[i + 1], true);
      g.mode = 'play';
      g.modeFrames = 0;
      return true;
    }
    enterGameOver(true);
    return false;
  }

  function updateCheckpoint() {
    var lv = g.lv, col = g.hero.x >> 3, i, cps;
    if (typeof lv.checkpointFor === 'function') {
      var cp = lv.checkpointFor(col);
      if (cp > g.checkpoint) g.checkpoint = cp | 0;
      return;
    }
    cps = lv.checkpoints;
    if (!cps || !cps.length) return;
    for (i = 0; i < cps.length; i++) if ((cps[i] | 0) <= col && (cps[i] | 0) > g.checkpoint) g.checkpoint = cps[i] | 0;
  }

  /* ------------------------------- 碰撞：敵人 / 魔王 ------------------------------- */
  // star-world 的 `ST.Enemies.update(g)` / `ST.Boss.update(g)` **自己做主角碰撞**
  // （條件是 g 帶了 hero 與這幾個 callback），所以本檔只負責「撞到之後怎麼辦」。
  // ST.Enemies 缺席時才退回本檔自己掃一遍（內建測試關沒有敵人，等於 no-op）。
  function onStomp(e) {
    var h = g.hero;
    Hero.stomp(h);
    h.score += (e && e.score) ? (e.score | 0) : SCORE_STOMP;
    g.hudDirty = true;
    sfx('stomp');
  }
  function onHurt(e) {
    Hero.hurt(g.hero, ctx, e ? e.x : undefined);
  }
  function onStar(e) {
    g.hero.score += SCORE_STOMP;
    g.hudDirty = true;
  }
  function onBossDie(how) {
    g.hero.score += 2000;
    g.hudDirty = true;
    sfx('goal');
  }

  var heroBox = { x: 0, y: 0, w: 0, h: 0 };
  function stepEnemyCollisionsFallback() {
    var h = g.hero;
    if (h.state === 'dead') return;
    heroBox.x = h.x; heroBox.y = h.y; heroBox.w = Hero.W; heroBox.h = Hero.boxH(h);
    eachEnemy(function (e) {
      if (h.state === 'dead') return;
      if (!SH.aabb(heroBox, e)) return;
      var stompable = (e.stompable === undefined) ? true : !!e.stompable;
      if (stompable && h.vyA.v > 0 && h.prevFeet <= e.y + 8) {
        if (typeof e.stomp === 'function') e.stomp(g);
        else if (typeof e.hit === 'function') e.hit(1, g);
        else e.alive = false;
        onStomp(e);
      } else {
        onHurt(e);
      }
    });
  }

  /* ------------------------------- 粒子 ------------------------------- */
  function stepPops() {
    var i, p;
    for (i = g.pops.length - 1; i >= 0; i--) {
      p = g.pops[i];
      p.t++;
      p.y -= (p.t < 8) ? 3 : -3;
      if (p.t >= 16) g.pops.splice(i, 1);
    }
    if (g.bump) { g.bump.t--; if (g.bump.t <= 0) g.bump = null; }
  }

  /* ============================== 傳給 hero 的 ctx ============================== */
  var ctx = {
    input: null, cols: 0,
    tileAt: tileAt, kindAt: kindAt, isLava: isLava,
    onTouch: onTouch, onBump: onBump, sfx: sfx
  };

  /* ============================== GAME ============================== */
  var GAME = {
    init: function (nes) {
      nes0 = nes;
      ppu0 = nes.ppu;
      ensureTiles();
      ST.LEVELS = ST.LEVELS || {};
      if (!ST.LEVELS.test) ST.LEVELS.test = buildTestLevel();

      g = newState();
      g.hero = Hero.create();
      g.input = nes.input || NES.Input;
      ctx.input = g.input;
      // star-world 的碰撞 callback（ST.Enemies / ST.Boss 讀 g.hero + 這幾個）
      g.onStomp = onStomp;
      g.onHurt = onHurt;
      g.onStar = onStar;
      g.onDie = onBossDie;
      g.onAxe = function () { sfx('bump'); };

      // ---- CHR：精靈表 1 = 主角(0..127) + 世界(128..255)；背景表 0 = HUD(0..63) + 地形 ----
      var sprObj = {}, bgObj = {}, k;
      for (k in ST.SPR_HERO) if (Object.prototype.hasOwnProperty.call(ST.SPR_HERO, k)) sprObj[k] = ST.SPR_HERO[k];
      if (ST.SPR_WORLD) for (k in ST.SPR_WORLD) if (Object.prototype.hasOwnProperty.call(ST.SPR_WORLD, k)) sprObj[k] = ST.SPR_WORLD[k];
      for (k in ST.BG_HUD) if (Object.prototype.hasOwnProperty.call(ST.BG_HUD, k)) bgObj[k] = ST.BG_HUD[k];
      // 後備地形磚永遠合併（11 磚）：內建測試關與「關卡沒給磚名」時的保底，
      // 有 ST.BG_WORLD 時它們只是沒被用到而已。
      for (k in ST.BG_FALLBACK) if (Object.prototype.hasOwnProperty.call(ST.BG_FALLBACK, k)) bgObj[k] = ST.BG_FALLBACK[k];
      if (ST.BG_WORLD) {
        for (k in ST.BG_WORLD) if (Object.prototype.hasOwnProperty.call(ST.BG_WORLD, k)) bgObj[k] = ST.BG_WORLD[k];
      }
      sprBank = NES.CHR.bank('st_spr', sprObj);
      bgBank = NES.CHR.bank('st_bg', bgObj);
      NES.CHR.setPattern(0, bgBank);
      NES.CHR.setPattern(1, sprBank);
      tileOf = {};
      heroTiles = {};
      var names = Hero.tileNames(), i;
      for (i = 0; i < names.length; i++) {
        if (sprBank.has(names[i])) heroTiles[names[i]] = ST.oam16(sprBank, names[i]);
      }
      ST.sprBank = sprBank; ST.bgBank = bgBank; ST.heroTiles = heroTiles;
      // star-world 的 chr_world.js 要拿到 bank 才能解磚名（契約：main 合併後呼叫 bind）
      if (ST.World && typeof ST.World.bind === 'function') { try { ST.World.bind(bgBank, sprBank); } catch (e) { } }

      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(16);                 // 8×16：主角 16×24
      ppu0.mirroring('v');                 // 水平捲動 ⇒ 左右兩張名稱表不同
      ppu0.flicker = 'rotate';
      ppu0.flickerStep = 0;                // 輪替交給 NES.SH.OAM（ENGINE_API §15.8）
      g.oam = SH.OAM(ppu0, { reserve: 0 });

      // ---- 網址參數 ?level=1-2 / ?level=test ----
      var q = null;
      try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
      var want = q && q.get('level');
      var list = levelList();
      var first = want && (ST.LEVELS[want] ? want : null);
      if (!first) first = list.length ? list[0] : 'test';
      g.startLevel = first;
      g.skipTitle = !!want;

      audio('init', nes);
      loadLevel(first, false);

      if (g.skipTitle) {
        g.mode = 'play';
      } else {
        g.mode = 'title';
        drawTitle(ppu0);
        audio('play', 'title');
      }
      ppu0.scroll(0, 0, 0);
      ppu0.split(SPLIT_LINE, { x: g.camX % 512, y: SPLIT_LINE, nt: 0 });
    },

    update: function (nes) {
      var input = nes.input || NES.Input;
      g.input = input; ctx.input = input; ctx.cols = g.cols;
      g.frames++;
      g.modeFrames++;
      var h = g.hero;

      if (g.mode === 'title') {
        if (input.pressed(BTN.START) || input.pressed(BTN.A)) {
          clearTitle(nes.ppu);
          g.mode = 'play';
          g.modeFrames = 0;
          audio('play', g.lv.music || themeOf(g.lv));
        }
      } else if (g.mode === 'play') {
        Hero.update(h, ctx);
        var worldDidCollide = false;
        if (ST.Enemies && typeof ST.Enemies.update === 'function') { try { ST.Enemies.update(g); worldDidCollide = true; } catch (e) { } }
        if (ST.Boss && typeof ST.Boss.update === 'function') { try { ST.Boss.update(g); worldDidCollide = true; } catch (e) { } }
        if (!worldDidCollide) stepEnemyCollisionsFallback();
        stepPops();
        if (ST.World && typeof ST.World.setAnim === 'function') ST.World.setAnim(g.frames >> 4);
        updateCheckpoint();
        stepCamera();
        streamColumns();
        if (++g.timeTick >= SMB.intervalTimer) {          // 21 幀一跳（SMB framerule）
          g.timeTick = 0;
          if (g.time > 0) { g.time--; g.hudDirty = true; }
          else if (h.state !== 'dead') Hero.kill(h, ctx);
        }
        // 魔王曲（qa2-star P2-1）：進魔王房 → boss、擊破 → clear、離開魔王房 → 回關卡曲
        if (g.lv.boss && ST.Boss) {
          if (g.bossMusic === 1 && ST.Boss.dead) { g.bossMusic = 2; audio('play', 'clear'); }
          else if (g.bossMusic === 0 && ST.Boss.active && !ST.Boss.dead) { g.bossMusic = 1; audio('play', 'boss'); }
          else if (g.bossMusic === 1 && !ST.Boss.active) { g.bossMusic = 0; audio('play', g.lv.music || themeOf(g.lv)); }
        }
        // 魔王關（1-4）沒有旗桿磚：打倒魔王 = 過關（star-world 的 ST.Boss.dead）
        if (g.mode === 'play' && g.lv.boss && ST.Boss && ST.Boss.dead && !g.cleared) {
          if (++g.bossClear >= 60) enterClear();
        }
        if (h.state === 'dead') enterDead();
      } else if (g.mode === 'dead') {
        Hero.update(h, ctx);
        stepCamera();
        if (h.deadDone) {
          h.lives--;
          g.hudDirty = true;
          if (h.lives < 0) enterGameOver(false);
          else respawn();
        }
      } else if (g.mode === 'clear') {
        // 結算：剩餘時間換分（每單位 50 分，每幀最多 10 單位 ⇒ 300 秒約 30 幀）
        if (g.time > 0) {
          var d = g.time > 10 ? 10 : g.time;
          g.time -= d;
          h.score += d * SCORE_PER_TIME;
          g.hudDirty = true;
          g.clearTally += d;
        } else if (g.modeFrames > CLEAR_HOLD) {
          nextLevel();
        }
      } else if (g.mode === 'gameover') {
        // qa2-star P2-5：START 回**標題**（不是直接重開）；標題再按 START 才開始新的一輪
        if (input.pressed(BTN.START)) {
          g.banner = null;
          g.hero.lives = 3; g.hero.score = 0; g.hero.coins = 0;
          g.won = false;
          loadLevel(g.startLevel, false);        // 內含 rebuildScreen ⇒ 字會被整片蓋掉
          g.mode = 'title';
          g.modeFrames = 0;
          drawTitle(nes.ppu);
          audio('play', 'title');
        }
      }
      musicTick();
    },

    draw: function (nes) {
      var ppu = nes.ppu, h = g.hero, i;
      if (g.hudDirty) { hudWrite(ppu, false); g.hudDirty = false; }
      ppu.scroll(0, 0, 0);                                     // 上段（HUD）固定
      ppu.split(SPLIT_LINE, { x: g.camX % 512, y: SPLIT_LINE, nt: 0 });

      var oam = g.oam;
      oam.begin();
      if (g.mode !== 'gameover' && g.mode !== 'title') {
        Hero.draw(h, g, oam, heroTiles, g.camX);
      } else if (g.mode === 'title') {
        Hero.draw(h, g, oam, heroTiles, g.camX);
      }
      // ? 磚頂出的金幣粒子（prio 1）
      for (i = 0; i < g.pops.length; i++) {
        var p = g.pops[i];
        if (heroTiles.H_COIN === undefined) break;
        oam.add({ x: p.x - g.camX, y: p.y, tile: heroTiles.H_COIN, pal: 1, prio: 1 });
      }
      if (ST.Enemies && typeof ST.Enemies.draw === 'function') { try { ST.Enemies.draw(oam, g); } catch (e) { } }
      if (ST.Boss && typeof ST.Boss.draw === 'function') { try { ST.Boss.draw(oam, g); } catch (e) { } }
      oam.end();
    },

    state: function () {
      var h = g.hero, n = 0;
      eachEnemy(function () { n++; });
      return {
        mode: g.mode, level: g.levelId,
        x: h.x, y: h.y, vx: h.vxA.v, vy: h.vyA.v,
        state: h.state, onGround: h.onGround,
        camX: g.camX, lives: h.lives, coins: h.coins, score: h.score,
        time: g.time, enemies: n,
        // --- 以下是測試 / 機器人用的額外欄位（契約的超集）---
        gameFrames: g.frames, modeFrames: g.modeFrames,
        xSub: h.px.sub, ySub: h.py.sub,
        vxPx: FX.velToPx(h.vxA.v), vyPx: FX.velToPx(h.vyA.v),
        facing: h.facing, crouch: h.crouch, inv: h.inv, anim: h.anim,
        hurtTimer: h.hurtTimer, deadTimer: h.deadTimer, dropThru: h.dropThru,
        apexSub: h.jumpApexSub, apexPx: FX.toPx(h.jumpApexSub),
        screenX: h.x - g.camX, camMin: g.camMin,
        cols: g.cols, checkpoint: g.checkpoint, cleared: g.cleared, won: g.won,
        stomps: h.stomps, hits: h.hits, bumps: h.bumps, deaths: h.deaths, oneUps: h.oneUps,
        scrNext: g.scr ? g.scr.next : 0, scrLeft: g.scrLeft, scrBytes: g.scr ? g.scr.bytes : 0,
        lastSfx: g.lastSfx, pops: g.pops.length,
        banner: g.banner ? g.banner.map(function (t) { return t.text; }) : null,
        bossMusic: g.bossMusic
      };
    },

    /* ---- 除錯 / 測試專用（不參與正式遊玩）---- */
    dev: {
      g: function () { return g; },
      hero: function () { return g.hero; },
      warp: function (x, y) {
        Hero.reset(g.hero, x | 0, (y === undefined || y === null) ? groundYAt(x >> 3) : (y | 0), 1);
        g.camX = clampCam((x | 0) - CAM_R);
        rebuildScreen();
        return GAME.state();
      },
      level: function (id) { loadLevel(id, true); g.mode = 'play'; g.modeFrames = 0; return GAME.state(); },
      setTime: function (n) { g.time = n | 0; g.hudDirty = true; },
      setCoins: function (n) { g.hero.coins = n | 0; g.hudDirty = true; },
      setLives: function (n) { g.hero.lives = n | 0; g.hudDirty = true; },
      setScore: function (n) { g.hero.score = n | 0; g.hudDirty = true; },
      kill: function () { Hero.kill(g.hero, ctx); },
      hurt: function (fromX) { return Hero.hurt(g.hero, ctx, fromX); },
      tileAt: tileAt, kindAt: kindAt, groundYAt: groundYAt,
      layout: function () { return (g.lv && g.lv.layout) || null; },
      bgIndexAt: function (col, row) { return scrTileAt(col, row); },
      ntTileAt: function (col, row) {
        var ntc = col & (NT_WINDOW - 1);
        return ppu0.getTile((ntc >> 5) & 1, ntc & 31, row);
      },
      // 讀回「目前畫面上」第 row 列、螢幕第 sc 欄起算 len 格的文字
      // （測試用：驗證 GAME OVER / WORLD 1 CLEAR 真的寫在**可見**的名稱表上）
      screenText: function (row, sc, len) {
        var s2 = '', i, p;
        for (i = 0; i < (len | 0); i++) {
          p = ntOfScreenCol((sc | 0) + i);
          s2 += tileChar(ppu0.getTile(p.nt, p.col, row | 0));
        }
        return s2;
      },
      banner: function () { return g.banner; },
      hudRow: function (row) {
        var s = '', c;
        for (c = 0; c < 32; c++) s += String(ppu0.getTile(0, c, row)) + ',';
        return s;
      },
      // 通關機器人 / 測試用：目前活著的敵人（含魔王）矩形
      enemyList: function () {
        var out = [];
        eachEnemy(function (e) { out.push({ x: e.x | 0, y: e.y | 0, w: e.w | 0, h: e.h | 0, kind: e.kind || '', stompable: (e.stompable === undefined) ? true : !!e.stompable }); });
        if (!(ST.Enemies && ST.Enemies.includeBoss) && ST.Boss && ST.Boss.box) {
          try { var bb = ST.Boss.box(g); if (bb) out.push({ x: bb.x | 0, y: bb.y | 0, w: bb.w | 0, h: bb.h | 0, kind: 'boss' }); } catch (e2) { }
        }
        return out;
      },
      boss: function () {
        if (!ST.Boss) return null;
        return { x: ST.Boss.x | 0, y: ST.Boss.y | 0, w: 32, h: 32, alive: !!ST.Boss.alive, active: !!ST.Boss.active, dead: !!ST.Boss.dead, hp: ST.Boss.hp | 0, phase: ST.Boss.phase };
      },
      tiles: function () { return heroTiles; },
      scroller: function () { return g.scr; }
    }
  };

  ST.GAME = GAME;
  window.GAME = GAME;
})();
