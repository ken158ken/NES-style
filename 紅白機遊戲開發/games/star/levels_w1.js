/*
 * games/star/levels_w1.js — 《星塵勇者》世界 1 的四關地圖 + 磚語意
 * ---------------------------------------------------------------------------
 * 擁有者：star-world agent ｜ 依賴：engine/chr.js（間接，透過 ST.World）、engine/shmup.js（選用）
 * 契約：docs/TASKS.md「R2b §契約 關卡」
 *
 *   ST.TILE            磚語意碼（**不是** CHR 索引；同一個語意在四個主題長得不一樣）
 *   ST.solidKind(t)    → 'solid' | 'oneway' | 'hurt' | 'none' | 'slopeL' | 'slopeR'（O(1) 查表）
 *   ST.LEVELS['1-1'..'1-4']
 *       { id, cols, rows, theme, music, groundRow, safeCols,
 *         tileAt(col,row) → 語意碼（O(1)）,
 *         chrAt(col,row)  → PPU 磚索引（給 NES.SH.Scroller；需先 ST.World.bind），
 *         attrAt(c16,r16) → 調色盤組 0..3,
 *         solidAt(x,y) / kindAt(x,y)   世界像素座標的碰撞查詢,
 *         setTile(col,row,code)        執行期改地形（? 磚頂出、橋斷）,
 *         start:{x,y}, goal:{col,row}, checkpoints:[col], spawns:[{col,kind,x,y,...}],
 *         boss:{col,x,y} | null, axe:{col,row,x,y} | null, coins, enemies }
 *
 * ── 地圖資料格式 ──────────────────────────────────────────────────────────
 *   `floor` / `ceil`：**RLE 字串**（`<次數><字元>`，空白忽略），一個字元 = 一欄。
 *   `objs`：**物件表**，依序疊加（後面的蓋前面的）。兩者都是純資料，沒有亂數，可重現。
 *
 * ── 版面（列 = 8 px，共 30 列）─────────────────────────────────────────────
 *   列 0–3    HUD（`ppu.split(32)` 之前的固定區，star-hero 負責）
 *   列 4–23   遊戲空間（天空 / 洞頂 / 浮台）
 *   列 24–29  基準地面（groundRow = 24 ⇒ 地面上緣 y = 192）
 *
 * ── 設計依據 ──────────────────────────────────────────────────────────────
 *   研究 03/01 ⑦「1-1 四步教學」：安全展示 → 誘導（? 磚）→ 變奏（第一個坑是安全的）→ 結論（管子遞增）
 *   研究 04 §1.2 安全教學區、§1.5 檢查點、§1.6 節奏曲線（鋸齒狀緊張—放鬆）、§5.1 難度曲線
 *   跳躍能力（engine/fixed.js NES.FX.SMB）：靜止長按 = 64 px（4 格）、全速 = 80 px（5 格）
 *   ⇒ 牆高上限 8 列（64 px）、坑寬上限 10 欄（80 px）；本檔四關實測見 test_w1.py。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};

  var ROWS = 30;              // 名稱表 30 列
  var HUD_ROWS = 4;           // 列 0–3 給 HUD
  var TOP_ROW = HUD_ROWS;

  // ============================================================ ① 磚語意
  var TILE = {
    EMPTY: 0,
    GROUND: 1,        // 地表上緣（草地 / 岩頂 / 雲台面 / 石磚頂）
    DIRT: 2,          // 地表內部
    BRICK: 3,
    QBLOCK: 4,
    USED: 5,
    BLOCK: 6,         // 硬磚 / 岩塊 / 石塊
    PLATFORM: 7,      // 單向平台（中段）
    PLAT_L: 8,        // 單向平台左端
    PLAT_R: 9,        // 單向平台右端
    SPIKE: 10,
    LAVA: 11,
    PIPE_TL: 12, PIPE_TR: 13, PIPE_BL: 14, PIPE_BR: 15,
    COIN: 16,
    GOAL: 17,         // 旗桿桿身（碰到 = 過關）
    GOAL_TOP: 18,
    FLAG: 19,
    AXE: 20,          // 城堡斧頭機關
    BRIDGE: 21,
    CHAIN: 22,
    CLOUD_L: 23, CLOUD_R: 24,
    BUSH: 25,
    HILL_L: 26, HILL_M: 27, HILL_R: 28,
    TREE_T: 29, TREE_B: 30,
    STAR_S: 31, STAR_B: 32,
    STAL: 33,         // 鐘乳石
    CAVEBG: 34,       // 洞窟背景岩紋
    WINDOW: 35,
    SLOPE_L: 36, SLOPE_R: 37,
    // fix2-star（qa2-star P2-3）背景裝飾補強用的新磚（全部 kind = 'none'）
    TORCH: 38,        // 城堡火把（火焰，2 幀動畫）
    TORCH_B: 39,      // 火把壁座
    CSEA_T: 40,       // 天空關「雲海 / 遠山剪影帶」上緣
    CSEA_B: 41,       // 雲海剪影帶內部
    STAR_T: 42,       // 第三種（最小）星點
    VEIN: 43          // 洞窟頂板下的岩層紋
  };
  var TILE_COUNT = 44;
  ST.TILE = TILE;
  ST.TILE_COUNT = TILE_COUNT;

  // 語意 → 碰撞種類（O(1) 陣列查表）
  var KIND = new Array(TILE_COUNT);
  (function () {
    var i;
    for (i = 0; i < TILE_COUNT; i++) KIND[i] = 'none';
    var solid = [TILE.GROUND, TILE.DIRT, TILE.BRICK, TILE.QBLOCK, TILE.USED, TILE.BLOCK,
      TILE.PIPE_TL, TILE.PIPE_TR, TILE.PIPE_BL, TILE.PIPE_BR, TILE.BRIDGE];
    var oneway = [TILE.PLATFORM, TILE.PLAT_L, TILE.PLAT_R];
    var hurt = [TILE.SPIKE, TILE.LAVA];
    for (i = 0; i < solid.length; i++) KIND[solid[i]] = 'solid';
    for (i = 0; i < oneway.length; i++) KIND[oneway[i]] = 'oneway';
    for (i = 0; i < hurt.length; i++) KIND[hurt[i]] = 'hurt';
    KIND[TILE.SLOPE_L] = 'slopeL';
    KIND[TILE.SLOPE_R] = 'slopeR';
  })();
  ST.TILE_KIND = KIND;

  function solidKind(t) {
    return (t >= 0 && t < TILE_COUNT) ? KIND[t] : 'none';
  }
  ST.solidKind = solidKind;
  ST.isSolid = function (t) { return solidKind(t) === 'solid'; };
  ST.isBlocking = function (t) { var k = solidKind(t); return k === 'solid' || k === 'slopeL' || k === 'slopeR'; };
  ST.isHurt = function (t) { return solidKind(t) === 'hurt'; };

  // ============================================================ ② 主題美術對應
  // 語意碼 → ST.BG_WORLD 的磚名（BASE 是草原；其他主題只列差異）
  var BASE_NAME = new Array(TILE_COUNT);
  (function () {
    var m = {};
    m[TILE.EMPTY] = 'BG_EMPTY';
    m[TILE.GROUND] = 'BG_GTOP'; m[TILE.DIRT] = 'BG_DIRT';
    m[TILE.BRICK] = 'BG_BRICK'; m[TILE.QBLOCK] = 'BG_QBLOCK'; m[TILE.USED] = 'BG_USED';
    m[TILE.BLOCK] = 'BG_BLOCK';
    m[TILE.PLATFORM] = 'BG_PLANK'; m[TILE.PLAT_L] = 'BG_PLANK'; m[TILE.PLAT_R] = 'BG_PLANK';
    m[TILE.SPIKE] = 'BG_SPIKE'; m[TILE.LAVA] = 'BG_LAVA0';
    m[TILE.PIPE_TL] = 'BG_PIPE_TL'; m[TILE.PIPE_TR] = 'BG_PIPE_TR';
    m[TILE.PIPE_BL] = 'BG_PIPE_BL'; m[TILE.PIPE_BR] = 'BG_PIPE_BR';
    m[TILE.COIN] = 'BG_COIN';
    m[TILE.GOAL] = 'BG_POLE'; m[TILE.GOAL_TOP] = 'BG_POLE_TOP'; m[TILE.FLAG] = 'BG_FLAG';
    m[TILE.AXE] = 'BG_AXE'; m[TILE.BRIDGE] = 'BG_BRIDGE'; m[TILE.CHAIN] = 'BG_CHAIN';
    m[TILE.CLOUD_L] = 'BG_CLOUD_L'; m[TILE.CLOUD_R] = 'BG_CLOUD_R'; m[TILE.BUSH] = 'BG_BUSH';
    m[TILE.HILL_L] = 'BG_HILL_L'; m[TILE.HILL_M] = 'BG_HILL_M'; m[TILE.HILL_R] = 'BG_HILL_R';
    m[TILE.TREE_T] = 'BG_TREE_T'; m[TILE.TREE_B] = 'BG_TREE_B';
    m[TILE.STAR_S] = 'BG_STAR_S'; m[TILE.STAR_B] = 'BG_STAR_B';
    m[TILE.STAL] = 'BG_STAL'; m[TILE.CAVEBG] = 'BG_CAVEBG'; m[TILE.WINDOW] = 'BG_WINDOW';
    m[TILE.TORCH] = 'BG_TORCH0'; m[TILE.TORCH_B] = 'BG_TORCH_B';
    m[TILE.CSEA_T] = 'BG_CSEA_T'; m[TILE.CSEA_B] = 'BG_CSEA_B';
    m[TILE.STAR_T] = 'BG_STAR_T'; m[TILE.VEIN] = 'BG_VEIN';
    m[TILE.SLOPE_L] = 'BG_SLOPE_L'; m[TILE.SLOPE_R] = 'BG_SLOPE_R';
    var i;
    for (i = 0; i < TILE_COUNT; i++) BASE_NAME[i] = m[i] || 'BG_EMPTY';
  })();

  var THEME_OVERRIDE = {
    ground: {},
    cave: (function () {
      var o = {};
      o[TILE.GROUND] = 'BG_ROCKTOP'; o[TILE.DIRT] = 'BG_ROCK'; o[TILE.BLOCK] = 'BG_ROCK';
      return o;
    })(),
    sky: (function () {
      var o = {};
      o[TILE.GROUND] = 'BG_CTOP_M'; o[TILE.DIRT] = 'BG_CBOT'; o[TILE.BLOCK] = 'BG_CTOP_M';
      o[TILE.PLATFORM] = 'BG_CTOP_M'; o[TILE.PLAT_L] = 'BG_CTOP_L'; o[TILE.PLAT_R] = 'BG_CTOP_R';
      return o;
    })(),
    castle: (function () {
      var o = {};
      o[TILE.GROUND] = 'BG_STONE_T'; o[TILE.DIRT] = 'BG_STONE';
      o[TILE.BLOCK] = 'BG_STONE'; o[TILE.BRICK] = 'BG_STONE';
      return o;
    })()
  };

  function themeName(theme, code) {
    var ov = THEME_OVERRIDE[theme];
    return (ov && ov[code]) || BASE_NAME[code];
  }

  // ---- 屬性（16×16 調色盤組）：優先權 + 各主題偏好 -------------------------
  var PRI = new Uint8Array(TILE_COUNT);
  var PREF = { ground: new Uint8Array(TILE_COUNT), cave: new Uint8Array(TILE_COUNT), sky: new Uint8Array(TILE_COUNT), castle: new Uint8Array(TILE_COUNT) };
  (function () {
    function set(codes, pri, g, c, s, k) {
      for (var i = 0; i < codes.length; i++) {
        PRI[codes[i]] = pri;
        PREF.ground[codes[i]] = g; PREF.cave[codes[i]] = c; PREF.sky[codes[i]] = s; PREF.castle[codes[i]] = k;
      }
    }
    set([TILE.EMPTY], 0, 3, 3, 3, 3);
    set([TILE.CLOUD_L, TILE.CLOUD_R, TILE.BUSH, TILE.HILL_L, TILE.HILL_M, TILE.HILL_R,
      TILE.TREE_T, TILE.TREE_B, TILE.STAR_S, TILE.STAR_B, TILE.STAL, TILE.CAVEBG,
      TILE.STAR_T, TILE.CSEA_T, TILE.CSEA_B, TILE.TORCH, TILE.TORCH_B], 1, 3, 3, 3, 3);
    set([TILE.WINDOW], 1, 1, 1, 1, 1);
    set([TILE.VEIN], 1, 1, 1, 1, 1);
    set([TILE.GROUND, TILE.DIRT, TILE.SLOPE_L, TILE.SLOPE_R], 2, 1, 1, 1, 1);
    set([TILE.BLOCK], 2, 2, 1, 1, 1);
    set([TILE.PLATFORM, TILE.PLAT_L, TILE.PLAT_R], 3, 2, 2, 1, 3);
    set([TILE.SPIKE], 4, 1, 1, 1, 1);
    set([TILE.PIPE_TL, TILE.PIPE_TR, TILE.PIPE_BL, TILE.PIPE_BR], 4, 3, 3, 3, 3);
    set([TILE.GOAL, TILE.GOAL_TOP, TILE.FLAG], 4, 3, 3, 3, 3);
    set([TILE.AXE, TILE.BRIDGE, TILE.CHAIN], 4, 3, 3, 3, 3);
    set([TILE.BRICK, TILE.QBLOCK, TILE.USED, TILE.COIN], 5, 2, 2, 2, 2);
    set([TILE.LAVA], 5, 2, 2, 2, 2);
    // 城堡：BRICK 就是石磚（bg1）；金幣 / ? 磚改用 bg3（褐 / 米黃），
    // 不然會跟 bg2 的熔岩共用調色盤變成「紅色金幣」。
    PREF.castle[TILE.BRICK] = 1;
    PREF.castle[TILE.COIN] = 3;
    PREF.castle[TILE.QBLOCK] = 3;
    PREF.castle[TILE.USED] = 3;
  })();

  // ============================================================ ③ RLE / 物件表
  function rle(s, cols, what) {
    var out = new Uint8Array(cols), i = 0, n = 0, j, ch, k;
    for (j = 0; j < s.length; j++) {
      ch = s.charAt(j);
      if (ch === ' ' || ch === '\n' || ch === '\t') continue;
      if (ch >= '0' && ch <= '9') { n = n * 10 + (ch.charCodeAt(0) - 48); continue; }
      k = n || 1; n = 0;
      while (k-- > 0) { if (i < cols) out[i] = ch.charCodeAt(0); i++; }
    }
    if (i !== cols) throw new Error('levels_w1: ' + (what || 'RLE') + ' 展開長度 ' + i + ' ≠ cols ' + cols);
    return out;
  }
  ST.rle = rle;

  // floor 字元 → 地面上緣相對 groundRow 的位移（null = 沒有地面）
  var FLOOR_DY = {
    '#': 0, 'A': -1, 'B': -2, 'C': -3, 'D': -4, 'E': -5, 'F': -6, 'G': -7, 'H': -8,
    'a': 1, 'b': 2, 'c': 3, 'd': 4
  };
  // 特殊：'.' 坑（無底）｜'L' 熔岩坑｜'S' 地面 + 表面尖刺｜'R' 橋（下有熔岩）

  // ceil 字元 → 天花板厚度（自列 4 起算幾列）
  var CEIL_H = { '.': 0, '#': 4, 'A': 5, 'B': 6, 'C': 7, 'D': 8, 'E': 9, 'F': 10, 'G': 11, 'H': 12 };

  // objs 的 'row' 型態字元
  var ROW_CHAR = {
    '.': -1, '~': TILE.EMPTY, 'B': TILE.BRICK, '?': TILE.QBLOCK, 'U': TILE.USED,
    '#': TILE.BLOCK, 'o': TILE.COIN, '=': TILE.PLATFORM, 's': TILE.SPIKE, 'C': TILE.CHAIN,
    'W': TILE.WINDOW, 'G': TILE.GROUND, 'D': TILE.DIRT, 'L': TILE.LAVA, 'v': TILE.CAVEBG,
    'F': TILE.TORCH, 'f': TILE.TORCH_B, 'x': TILE.VEIN, '^': TILE.CSEA_T, '_': TILE.CSEA_B
  };

  // ============================================================ ④ Level
  function Level(def) {
    var self = this;
    var cols = def.cols;
    if (cols % 2) throw new Error('levels_w1: ' + def.id + ' cols 必須是偶數');
    this.id = def.id;
    this.cols = cols;
    this.rows = ROWS;
    this.topRow = TOP_ROW;
    this.theme = def.theme;
    this.music = def.music || def.theme;
    this.groundRow = def.groundRow;
    this.groundY = def.groundRow * 8;
    this.safeCols = def.safeCols;
    this.widthPx = cols * 8;
    this.def = def;

    var map = new Uint8Array(ROWS * cols);
    var cols16 = cols >> 1, rows16 = ROWS >> 1;
    var attr = new Uint8Array(rows16 * cols16);
    this.map = map;
    this.attr = attr;
    this.cols16 = cols16;
    this.rows16 = rows16;

    // ---- O(1) 查詢 -------------------------------------------------------
    this.tileAt = function (c, r) {
      if (c < 0 || c >= cols || r < 0 || r >= ROWS) return TILE.EMPTY;
      return map[r * cols + c];
    };
    this.attrAt = function (c16, r16) {
      if (c16 < 0 || c16 >= cols16 || r16 < 0 || r16 >= rows16) return 0;
      return attr[r16 * cols16 + c16];
    };
    // 地形碰撞（世界像素）：關卡左右是牆、底下是坑（讓主角掉出畫面）
    this.kindAt = function (x, y) {
      if (x < 0 || x >= self.widthPx) return 'solid';
      if (y < 0) return 'none';
      if (y >= ROWS * 8) return 'none';
      return KIND[map[(y >> 3) * cols + (x >> 3)]];
    };
    this.solidAt = function (x, y) { return self.kindAt(x, y) === 'solid'; };
    this.tileAtPx = function (x, y) {
      if (x < 0 || x >= self.widthPx || y < 0 || y >= ROWS * 8) return TILE.EMPTY;
      return map[(y >> 3) * cols + (x >> 3)];
    };

    // ---- 建圖 ------------------------------------------------------------
    this._set = function (c, r, k) {
      if (c < 0 || c >= cols || r < TOP_ROW || r >= ROWS) return;
      map[r * cols + c] = k;
    };
    // 背景裝飾專用：**只填空格**。fix2-star 把裝飾密度拉高（qa2-star P2-3）之後，
    // 這道保險確保任何一朵雲 / 一叢灌木都不可能蓋掉地形 ⇒ 可達性 BFS 與坑寬測試完全不變。
    this._deco = function (c, r, k) {
      if (c < 0 || c >= cols || r < TOP_ROW || r >= ROWS) return false;
      if (map[r * cols + c] !== TILE.EMPTY) return false;
      map[r * cols + c] = k;
      return true;
    };
    build(this, def);
    buildAttr(this);

    // ---- 執行期改地形（? 磚頂出 / 橋斷 / 打碎磚）-------------------------
    this.dirtyCols = [];
    this.setTile = function (c, r, k) {
      if (c < 0 || c >= cols || r < 0 || r >= ROWS) return false;
      if (map[r * cols + c] === k) return false;
      map[r * cols + c] = k;
      blockAttr(self, c >> 1, r >> 1);
      if (self.dirtyCols.indexOf(c) < 0) self.dirtyCols.push(c);
      if (typeof self.onTileChange === 'function') self.onTileChange(c, r, k);
      return true;
    };
    this.onTileChange = null;
    this.clearDirty = function () { self.dirtyCols.length = 0; };

    // ---- 美術索引（需要 ST.World.bind 之後才有值）------------------------
    var lut = new Uint16Array(TILE_COUNT);
    var lavaAlt = 0, coinIdx = 0, torchAlt = 0;
    this.rebind = function () {
      var W = ST.World, i;
      if (!W || !W.bound) { for (i = 0; i < TILE_COUNT; i++) lut[i] = 0; return false; }
      for (i = 0; i < TILE_COUNT; i++) lut[i] = W.bgIndex(themeName(self.theme, i));
      lavaAlt = W.bgIndex('BG_LAVA1');
      torchAlt = W.bgIndex('BG_TORCH1');
      coinIdx = lut[TILE.COIN];
      return true;
    };
    this.rebind();
    this.chrAt = function (c, r) {
      var t = (c < 0 || c >= cols || r < 0 || r >= ROWS) ? TILE.EMPTY : map[r * cols + c];
      if (ST.World && ST.World.anim) {
        if (t === TILE.LAVA) return lavaAlt;
        if (t === TILE.TORCH) return torchAlt;
      }
      return lut[t];
    };

    // ---- 關卡元資料 ------------------------------------------------------
    this.start = def.start;
    this.goal = def.goal;
    this.checkpoints = def.checkpoints.slice();
    this.spawns = def.spawns.map(function (s) {
      var o = {}, k;
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
      if (o.x === undefined) o.x = o.col * 8;
      if (o.y === undefined) o.y = self.surfaceY(o.col) - 16;
      return o;
    });
    this.boss = def.boss || null;
    this.axe = def.axe || null;
    if (this.boss && this.boss.x === undefined) { this.boss.x = this.boss.col * 8; }
    if (this.axe && this.axe.x === undefined) { this.axe.x = this.axe.col * 8; this.axe.y = this.axe.row * 8; }
    this.coins = count(map, TILE.COIN);
    this.enemies = this.spawns.length;
  }

  // 第 c 欄最上面的可站立面（回傳列號；找不到回 ROWS）。
  // `from` 預設列 14 —— 洞窟 / 城堡的天花板最深到列 15，從列 4 找會找到天花板。
  Level.prototype.surfaceRow = function (c, from) {
    var r, k;
    for (r = (from === undefined ? 14 : from); r < ROWS; r++) {
      k = KIND[this.tileAt(c, r)];
      if (k === 'solid' || k === 'oneway') return r;
    }
    return ROWS;
  };
  Level.prototype.surfaceY = function (c, from) { return this.surfaceRow(c, from) * 8; };
  Level.prototype.checkpointFor = function (col) {
    var best = -1, i;
    for (i = 0; i < this.checkpoints.length; i++) if (this.checkpoints[i] <= col) best = this.checkpoints[i];
    return best;
  };
  Level.prototype.respawn = function (col) {
    var cp = this.checkpointFor(col);
    if (cp < 0) return { x: this.start.x, y: this.start.y, col: this.start.x >> 3 };
    return { x: cp * 8, y: this.surfaceY(cp) - 24, col: cp };
  };

  function count(map, k) {
    var n = 0, i;
    for (i = 0; i < map.length; i++) if (map[i] === k) n++;
    return n;
  }

  // ---- 地形產生 ----------------------------------------------------------
  function build(L, def) {
    var cols = L.cols, G = def.groundRow, c, r, ch, dy;
    var floor = rle(def.floor, cols, def.id + '.floor');
    var ceil = def.ceil ? rle(def.ceil, cols, def.id + '.ceil') : null;

    for (c = 0; c < cols; c++) {
      ch = String.fromCharCode(floor[c]);
      if (ch === '.') {
        /* 無底坑：什麼都不放 */
      } else if (ch === 'L') {
        // 熔岩坑：熔岩面貼著地板高度下一列（坑欄一律偶數對齊 ⇒ 屬性區塊不會跟地面混色）
        for (r = G + 1; r < ROWS; r++) L._set(c, r, TILE.LAVA);
      } else if (ch === 'R') {
        // 橋（列 G）+ 下方熔岩：列 G+1 **必須留空**，否則 16×16 屬性區塊會被熔岩（優先權較高）搶走，
        // 橋就會被畫成熔岩的顏色。
        L._set(c, G, TILE.BRIDGE);
        for (r = G + 2; r < ROWS; r++) L._set(c, r, TILE.LAVA);
      } else if (ch === 'S') {
        L._set(c, G - 1, TILE.SPIKE);
        L._set(c, G, TILE.GROUND);
        for (r = G + 1; r < ROWS; r++) L._set(c, r, TILE.DIRT);
      } else {
        dy = FLOOR_DY[ch];
        if (dy === undefined) throw new Error('levels_w1: ' + def.id + ' floor 未知字元 "' + ch + '"');
        var top = G + dy;
        L._set(c, top, TILE.GROUND);
        for (r = top + 1; r < ROWS; r++) L._set(c, r, TILE.DIRT);
      }
      if (ceil) {
        var h = CEIL_H[String.fromCharCode(ceil[c])];
        if (h === undefined) throw new Error('levels_w1: ' + def.id + ' ceil 未知字元');
        for (r = TOP_ROW; r < TOP_ROW + h; r++) L._set(c, r, TILE.DIRT);
        if (h > 0) L._set(c, TOP_ROW + h - 1, TILE.DIRT);
      }
    }
    applyObjs(L, def.objs || [], G);
  }

  var STAR_KIND = null;      // 星點 3 種大小（Level 建構前 TILE 已就緒）
  function applyObjs(L, objs, G) {
    if (!STAR_KIND) STAR_KIND = [TILE.STAR_B, TILE.STAR_S, TILE.STAR_T];
    var i, o, x, y, n;
    for (i = 0; i < objs.length; i++) {
      o = objs[i];
      switch (o.t) {
        case 'rect':
          for (y = 0; y < o.h; y++) for (x = 0; x < o.w; x++) L._set(o.c + x, o.r + y, o.k);
          break;
        case 'row':
          for (x = 0; x < o.s.length; x++) {
            var k = ROW_CHAR[o.s.charAt(x)];
            if (k === undefined) throw new Error('levels_w1: row 未知字元 "' + o.s.charAt(x) + '"');
            if (k >= 0) L._set(o.c + x, o.r, k);
          }
          break;
        case 'coins':
          n = o.n || 1;
          for (x = 0; x < n; x++) L._set(o.c + x * (o.step || 2), o.r, TILE.COIN);
          break;
        case 'plat':                                   // 單向平台（左右端有帽）
          for (x = 0; x < o.w; x++) {
            L._set(o.c + x, o.r, x === 0 ? TILE.PLAT_L : (x === o.w - 1 ? TILE.PLAT_R : TILE.PLATFORM));
          }
          if (o.under) for (x = 0; x < o.w; x++) L._set(o.c + x, o.r + 1, TILE.DIRT);
          break;
        case 'pipe':                                   // 2 欄寬、高 h 列，立在地面上
          for (y = 0; y < o.h; y++) {
            var rr = G - o.h + y;
            L._set(o.c, rr, y === 0 ? TILE.PIPE_TL : TILE.PIPE_BL);
            L._set(o.c + 1, rr, y === 0 ? TILE.PIPE_TR : TILE.PIPE_BR);
          }
          break;
        case 'cloud':
          L._deco(o.c, o.r, TILE.CLOUD_L); L._deco(o.c + 1, o.r, TILE.CLOUD_R);
          break;
        case 'hill':
          L._deco(o.c, o.r, TILE.HILL_L); L._deco(o.c + 1, o.r, TILE.HILL_M); L._deco(o.c + 2, o.r, TILE.HILL_R);
          break;
        case 'tree':
          L._deco(o.c, o.r, TILE.TREE_T); L._deco(o.c, o.r + 1, TILE.TREE_B);
          break;
        case 'bush':
          for (x = 0; x < (o.w || 1); x++) L._deco(o.c + x, o.r, TILE.BUSH);
          break;
        case 'stars':                                  // 3 種大小輪流（大 / 小 / 極小）
          for (x = 0; x < o.n; x++) {
            L._deco(o.c + x * (o.step || 7), o.r + (x % 3), STAR_KIND[x % 3]);
          }
          break;
        case 'stal':
          for (x = 0; x < (o.w || 1); x++) L._deco(o.c + x, o.r, TILE.STAL);
          break;
        case 'torch':                                  // 火把：上火焰（動畫）+ 下壁座
          L._deco(o.c, o.r, TILE.TORCH); L._deco(o.c, o.r + 1, TILE.TORCH_B);
          break;
        case 'csea':                                   // 雲海 / 遠山剪影帶（上緣 + 內部）
          for (x = 0; x < o.w; x++) {
            L._deco(o.c + x, o.r, TILE.CSEA_T);
            for (y = 1; y < (o.h || 2); y++) L._deco(o.c + x, o.r + y, TILE.CSEA_B);
          }
          break;
        case 'vein':                                   // 洞窟頂板下的岩層紋
          for (x = 0; x < o.w; x++) L._deco(o.c + x, o.r, TILE.VEIN);
          break;
        case 'pole':                                   // 旗桿（碰到 = 過關）；o.b = 桿底（不含）
          L._set(o.c, o.r, TILE.GOAL_TOP);
          for (y = o.r + 1; y < (o.b === undefined ? G : o.b); y++) L._set(o.c, y, TILE.GOAL);
          L._set(o.c + 1, o.r + 1, TILE.FLAG);
          break;
        case 'axe':
          L._set(o.c, o.r, TILE.AXE);
          break;
        case 'tile':
          L._set(o.c, o.r, o.k);
          break;
        default:
          throw new Error('levels_w1: 未知物件 "' + o.t + '"');
      }
    }
  }

  // ---- 屬性表 ------------------------------------------------------------
  function blockAttr(L, c16, r16) {
    var pref = PREF[L.theme] || PREF.ground;
    var bestPri = -1, best = pref[TILE.EMPTY], dx, dy, t, p;
    for (dy = 0; dy < 2; dy++) {
      for (dx = 0; dx < 2; dx++) {
        t = L.tileAt(c16 * 2 + dx, r16 * 2 + dy);
        p = PRI[t];
        if (p > bestPri) { bestPri = p; best = pref[t]; }
      }
    }
    L.attr[r16 * L.cols16 + c16] = best;
    return best;
  }
  function buildAttr(L) {
    var c16, r16;
    for (r16 = 0; r16 < L.rows16; r16++) {
      for (c16 = 0; c16 < L.cols16; c16++) {
        if (r16 < (TOP_ROW >> 1)) { L.attr[r16 * L.cols16 + c16] = 0; continue; }   // HUD 區交給 star-hero
        blockAttr(L, c16, r16);
      }
    }
  }

  // ============================================================ ⑤ 四關資料
  // ── 1-1 草原教學（12 畫面 / 384 欄）────────────────────────────────────
  // 節奏：①0–95 安全教學區（空地 → ? 磚 → 金幣 → 矮管）②96–157 第一隻敵人 + **安全跳**（淺溝，
  //       掉下去不會死）→ 第一個真坑 ③158–255 坑 + 階梯 + 浮台（檢查點 ×2）④256–343 綜合
  //       ⑤344–383 大階梯 + 旗桿。研究 03/01 ⑦ 的四步教學逐條對應。
  var L11 = {
    id: '1-1', theme: 'ground', music: 'ground', cols: 384, groundRow: 24, safeCols: 96,
    floor: '96# 14# 6b 8# 7. 27# 8. 14# 4A 4B 8# 8. 16# 6. 14# 9. 15# 4A 4B 4C 4B 4A 8# 9. 19# 2A 2B 2C 2D 2E 2F 2G 2H 48#',
    objs: [
      // 背景裝飾（fix2-star 依 qa2-star P2-3 的數字補密：雲 16 / 山 10 / 灌木 12 / 樹 10，
      // 全部走 `_deco`（只填空格）⇒ 不可能蓋到地形，可達性測試不受影響）
      // 山 10 座（列 22，3 欄寬，全部落在 top = 24 的平地段）
      { t: 'hill', c: 6, r: 22 }, { t: 'hill', c: 44, r: 22 }, { t: 'hill', c: 92, r: 22 },
      { t: 'hill', c: 118, r: 22 }, { t: 'hill', c: 168, r: 22 }, { t: 'hill', c: 192, r: 22 },
      { t: 'hill', c: 228, r: 22 }, { t: 'hill', c: 252, r: 22 }, { t: 'hill', c: 300, r: 22 },
      { t: 'hill', c: 312, r: 22 },
      // 樹 10 棵（列 22–23）
      { t: 'tree', c: 28, r: 22 }, { t: 'tree', c: 70, r: 22 }, { t: 'tree', c: 106, r: 22 },
      { t: 'tree', c: 146, r: 22 }, { t: 'tree', c: 176, r: 22 }, { t: 'tree', c: 216, r: 22 },
      { t: 'tree', c: 258, r: 22 }, { t: 'tree', c: 288, r: 22 }, { t: 'tree', c: 344, r: 22 },
      { t: 'tree', c: 366, r: 22 },
      // 灌木 12 叢（列 23）
      { t: 'bush', c: 16, r: 23, w: 2 }, { t: 'bush', c: 36, r: 23, w: 2 }, { t: 'bush', c: 58, r: 23, w: 2 },
      { t: 'bush', c: 80, r: 23, w: 2 }, { t: 'bush', c: 104, r: 23, w: 2 }, { t: 'bush', c: 134, r: 23, w: 2 },
      { t: 'bush', c: 190, r: 23, w: 2 }, { t: 'bush', c: 208, r: 23, w: 2 }, { t: 'bush', c: 256, r: 23, w: 2 },
      { t: 'bush', c: 286, r: 23, w: 2 }, { t: 'bush', c: 310, r: 23, w: 2 }, { t: 'bush', c: 336, r: 23, w: 2 },
      // 雲 16 朵，**分兩條高度帶**（高雲列 5 × 7、中雲列 8 × 9）—— 舊版全擠在列 6/7，上半屏整片空白
      { t: 'cloud', c: 10, r: 5 }, { t: 'cloud', c: 62, r: 5 }, { t: 'cloud', c: 120, r: 5 },
      { t: 'cloud', c: 186, r: 5 }, { t: 'cloud', c: 258, r: 5 }, { t: 'cloud', c: 330, r: 5 },
      { t: 'cloud', c: 372, r: 5 },
      { t: 'cloud', c: 26, r: 8 }, { t: 'cloud', c: 74, r: 8 }, { t: 'cloud', c: 108, r: 8 },
      { t: 'cloud', c: 140, r: 8 }, { t: 'cloud', c: 196, r: 8 }, { t: 'cloud', c: 240, r: 8 },
      { t: 'cloud', c: 286, r: 8 }, { t: 'cloud', c: 318, r: 8 }, { t: 'cloud', c: 358, r: 8 },
      // ① 安全教學區：金幣拱形把視線帶到第一個 ? 磚（研究 04 §1.2「視覺引導」）
      { t: 'coins', c: 8, r: 20, n: 4 },
      { t: 'row', c: 20, r: 20, s: '?' },                       // 第一個 ? 磚（強制遭遇）
      { t: 'coins', c: 26, r: 18, n: 4 },
      { t: 'row', c: 36, r: 20, s: 'B?B?' },
      { t: 'coins', c: 44, r: 20, n: 4 },
      { t: 'row', c: 56, r: 20, s: '?' },                       // 星塵道具（無敵 8 秒）
      { t: 'pipe', c: 64, h: 2 },                               // 管子高度遞增 2 → 3 → 4
      { t: 'row', c: 76, r: 20, s: '?BB?' },
      { t: 'coins', c: 86, r: 19, n: 4 },
      // ② 安全跳 + 第一個真坑
      { t: 'coins', c: 110, r: 24, n: 3 },                      // 淺溝裡的金幣（獎勵敢跳下去）
      { t: 'coins', c: 125, r: 19, n: 3 },
      { t: 'row', c: 136, r: 20, s: 'B?B' },
      { t: 'coins', c: 159, r: 18, n: 3 },
      { t: 'pipe', c: 172, h: 3 },
      // ③ 中段
      { t: 'row', c: 152, r: 16, s: 'BBBB' },
      { t: 'plat', c: 198, r: 18, w: 6 },
      { t: 'coins', c: 197, r: 15, n: 3 },
      { t: 'row', c: 206, r: 20, s: '?BUB?' },
      { t: 'coins', c: 221, r: 20, n: 2 },
      { t: 'pipe', c: 232, h: 4 },
      { t: 'plat', c: 242, r: 18, w: 6 },
      { t: 'coins', c: 241, r: 15, n: 4 },
      { t: 'row', c: 252, r: 18, s: 'B?B' },
      // ④ 綜合段
      { t: 'coins', c: 293, r: 18, n: 4 },
      { t: 'row', c: 306, r: 20, s: '?BB?BB' },
      { t: 'pipe', c: 310, h: 2 },
      // ⑤ 旗桿（大階梯之後）
      { t: 'pole', c: 350, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 350, row: 20 },
    checkpoints: [134, 256],
    spawns: [
      { col: 104, kind: 'roller', dir: -1 },
      { col: 145, kind: 'roller', dir: -1, edge: true },
      { col: 176, kind: 'bouncer' },
      { col: 212, kind: 'roller', dir: -1 },
      { col: 232, kind: 'flyer', y: 136, amp: 24 },
      { col: 258, kind: 'roller', dir: -1, edge: true },
      { col: 308, kind: 'roller', dir: -1 }
    ]
  };

  // ── 1-2 洞窟（10 畫面 / 320 欄）─────────────────────────────────────────
  // 新壓力：尖刺（碰到受傷）、上下兩層（單向木板）、狹窄天花板；隱藏金幣房在 288–302。
  var L12 = {
    id: '1-2', theme: 'cave', music: 'cave', cols: 320, groundRow: 24, safeCols: 32,
    floor: '40# 6b 14# 4S 12# 6. 10# 4S 8# 8. 12# 6S 14# 8. 16# 4S 10# 9. 17# 6S 10# 10. 14# 4S 12# 8. 48#',
    ceil: '60# 8C 20# 10D 30# 12C 40# 10E 30# 8C 40# 12D 40#',
    objs: [
      // 鐘乳石 / 岩紋裝飾
      { t: 'stal', c: 12, r: 8, w: 2 }, { t: 'stal', c: 30, r: 8, w: 1 }, { t: 'stal', c: 48, r: 8, w: 2 },
      { t: 'stal', c: 72, r: 11, w: 2 }, { t: 'stal', c: 96, r: 8, w: 1 }, { t: 'stal', c: 118, r: 12, w: 2 },
      { t: 'stal', c: 150, r: 8, w: 2 }, { t: 'stal', c: 182, r: 11, w: 1 }, { t: 'stal', c: 214, r: 13, w: 2 },
      { t: 'stal', c: 250, r: 8, w: 2 }, { t: 'stal', c: 276, r: 11, w: 1 }, { t: 'stal', c: 306, r: 8, w: 2 },
      { t: 'row', c: 20, r: 14, s: 'vv..vv' }, { t: 'row', c: 130, r: 16, s: 'v..v..v' },
      { t: 'row', c: 236, r: 15, s: 'vv..vv' },
      // 頂板下的岩層紋（qa2-star P2-3）：整列鋪過去，`_deco` 會自動跳過天花板較厚的區段
      { t: 'vein', c: 0, r: 8, w: 320 },
      // 上層路線（單向木板）＋ 金幣
      { t: 'plat', c: 48, r: 16, w: 6 }, { t: 'coins', c: 49, r: 14, n: 3 },
      { t: 'plat', c: 62, r: 18, w: 6 },
      { t: 'plat', c: 78, r: 16, w: 8 }, { t: 'coins', c: 79, r: 14, n: 4 },
      { t: 'plat', c: 106, r: 16, w: 8 }, { t: 'coins', c: 107, r: 14, n: 4 },
      { t: 'plat', c: 136, r: 17, w: 6 }, { t: 'plat', c: 146, r: 15, w: 6 }, { t: 'coins', c: 147, r: 13, n: 3 },
      { t: 'plat', c: 186, r: 17, w: 8 }, { t: 'coins', c: 187, r: 15, n: 4 },
      { t: 'plat', c: 226, r: 16, w: 10 }, { t: 'coins', c: 227, r: 14, n: 4 },
      { t: 'plat', c: 266, r: 17, w: 6 }, { t: 'coins', c: 267, r: 15, n: 3 },
      { t: 'row', c: 100, r: 20, s: 'B?B' }, { t: 'row', c: 200, r: 19, s: '?BB?' },
      { t: 'coins', c: 40, r: 22, n: 3 }, { t: 'coins', c: 170, r: 21, n: 3 },
      // 隱藏金幣房（岩層裡挖空，從下方 295–296 的豎井進入）
      { t: 'rect', c: 288, r: 8, w: 15, h: 6, k: TILE.DIRT },
      { t: 'rect', c: 290, r: 9, w: 11, h: 3, k: TILE.EMPTY },
      { t: 'rect', c: 295, r: 12, w: 2, h: 2, k: TILE.EMPTY },
      { t: 'coins', c: 291, r: 10, n: 5 },
      { t: 'plat', c: 288, r: 18, w: 8 }, { t: 'plat', c: 293, r: 15, w: 5 },
      // 旗桿
      { t: 'pole', c: 312, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 312, row: 20 },
    checkpoints: [96, 205],
    spawns: [
      { col: 50, kind: 'roller', dir: -1 },
      { col: 86, kind: 'roller', dir: -1, edge: true },
      { col: 118, kind: 'roller', dir: -1 },
      { col: 138, kind: 'bouncer' },
      { col: 156, kind: 'roller', dir: -1, edge: true },
      { col: 196, kind: 'roller', dir: -1 },
      { col: 218, kind: 'bouncer' },
      { col: 240, kind: 'roller', dir: -1, edge: true },
      { col: 258, kind: 'flyer', y: 130, amp: 24 },
      { col: 276, kind: 'roller', dir: -1 }
    ]
  };

  // ── 1-3 天空（12 畫面 / 384 欄）─────────────────────────────────────────
  // 新壓力：沒有地面（掉下去就死）、浮台間距 ≤ 4 格（32–48 px）、飛行敵不可踩。
  var L13 = (function () {
    var plats = [
      [100, 22, 8], [114, 20, 6], [126, 22, 8], [140, 18, 6], [152, 20, 8], [166, 22, 6],
      [178, 19, 8], [192, 17, 6], [204, 20, 8], [218, 22, 6], [230, 19, 8], [244, 16, 6],
      [256, 19, 8], [270, 21, 6], [282, 18, 8], [296, 15, 6], [308, 18, 8], [322, 21, 6],
      [334, 18, 10], [350, 21, 14]
    ];
    var objs = [
      // 星點 50 顆、**3 種大小**輪流（大 / 小 / 極小；列偏移 0/1/2 讓它不是一直線）
      { t: 'stars', c: 6, r: 6, n: 17, step: 11 },
      { t: 'stars', c: 4, r: 11, n: 17, step: 13 },
      { t: 'stars', c: 200, r: 7, n: 17, step: 11 },
      // 雲 12 朵（qa2-star P2-3：天空關的雲是「假地板」的視覺暗示，也讓玩家看得出速度）
      { t: 'cloud', c: 16, r: 7 }, { t: 'cloud', c: 52, r: 10 }, { t: 'cloud', c: 84, r: 6 },
      { t: 'cloud', c: 112, r: 12 }, { t: 'cloud', c: 146, r: 8 }, { t: 'cloud', c: 178, r: 11 },
      { t: 'cloud', c: 210, r: 6 }, { t: 'cloud', c: 238, r: 9 }, { t: 'cloud', c: 268, r: 12 },
      { t: 'cloud', c: 300, r: 7 }, { t: 'cloud', c: 332, r: 10 }, { t: 'cloud', c: 364, r: 6 },
      // 「雲海 / 遠山剪影帶」（qa2-star P2-3 要的地平線）：用暗色 1 畫成剪影 ⇒ 是遠景不是地板。
      // 放在**列 24–25**（浮台最低到列 22 ⇒ 屬性區塊 r16 12 完全不跟浮台的 r16 11 打架；
      // 放在 qa 建議的列 20–21 會跟列 20/21 的浮台共用屬性區塊，剪影會被染成純黑），
      // 而且正好接續前 96 欄實地的地平線高度（groundRow 24）。
      { t: 'csea', c: 96, r: 24, w: 288, h: 2 },
      { t: 'coins', c: 12, r: 21, n: 4 }, { t: 'coins', c: 40, r: 20, n: 4 },
      { t: 'coins', c: 70, r: 21, n: 4 }, { t: 'row', c: 56, r: 19, s: 'B?B' }
    ], i, p;
    for (i = 0; i < plats.length; i++) {
      p = plats[i];
      objs.push({ t: 'plat', c: p[0], r: p[1], w: p[2] });
      objs.push({ t: 'coins', c: p[0] + 1, r: p[1] - 2, n: (p[2] >= 8 ? 3 : 2) });
    }
    objs.push({ t: 'pole', c: 356, r: 7, b: 21 });
    return {
      id: '1-3', theme: 'sky', music: 'sky', cols: 384, groundRow: 24, safeCols: 32,
      floor: '96# 288.',
      objs: objs,
      start: { x: 32, y: 168 },
      goal: { col: 356, row: 18 },
      checkpoints: [194, 298],
      spawns: [
        { col: 106, kind: 'flyer', y: 120, amp: 24 },
        { col: 118, kind: 'bouncer', y: 144 },
        { col: 130, kind: 'flyer', y: 136, amp: 24 },
        { col: 158, kind: 'flyer', y: 112, amp: 24 },
        { col: 180, kind: 'bouncer', y: 136 },
        { col: 186, kind: 'flyer', y: 128, amp: 24 },
        { col: 214, kind: 'flyer', y: 144, amp: 24 },
        { col: 234, kind: 'bouncer', y: 136 },
        { col: 242, kind: 'flyer', y: 104, amp: 24 },
        { col: 272, kind: 'flyer', y: 128, amp: 24 },
        { col: 300, kind: 'flyer', y: 96, amp: 24 },
        { col: 312, kind: 'bouncer', y: 128 },
        { col: 330, kind: 'flyer', y: 120, amp: 24 }
      ]
    };
  })();

  // ── 1-4 城堡（8 畫面 / 256 欄）──────────────────────────────────────────
  // 新壓力：熔岩坑（碰到即死）、無底坑、密集敵人；盡頭是魔王房（橋 + 斧頭）。
  var L14 = {
    id: '1-4', theme: 'castle', music: 'castle', cols: 256, groundRow: 24, safeCols: 32,
    // 熔岩坑一律偶數欄對齊（屬性區塊不混色）；R2b fix：機器人死亡最集中的兩處
    // （原 76–83 / 200–207，各 8 欄）縮成 6 欄，並把坑前的助跑距離拉長到 ≥ 9 欄。
    floor: '32# 8L 16# 6L 16# 6L 20# 8L 12# 6. 16# 8L 22# 8L 16# 6L 6# 32R 12#',
    ceil: '256#',
    objs: [
      // 城堡裝飾：窗 + 鎖鏈
      // 窗 16 扇（8 組 W.W）+ 每 2 畫面一支火把（8 畫面 ⇒ 4 支，2 幀火焰動畫）
      { t: 'row', c: 10, r: 9, s: 'W.W' }, { t: 'row', c: 44, r: 9, s: 'W.W' },
      { t: 'row', c: 64, r: 9, s: 'W.W' }, { t: 'row', c: 92, r: 9, s: 'W.W' },
      { t: 'row', c: 112, r: 9, s: 'W.W' }, { t: 'row', c: 136, r: 9, s: 'W.W' },
      { t: 'row', c: 186, r: 9, s: 'W.W' }, { t: 'row', c: 204, r: 9, s: 'W.W' },
      { t: 'torch', c: 30, r: 12 }, { t: 'torch', c: 94, r: 12 },
      { t: 'torch', c: 158, r: 12 }, { t: 'torch', c: 214, r: 12 },
      { t: 'row', c: 24, r: 8, s: 'C' }, { t: 'row', c: 24, r: 9, s: 'C' }, { t: 'row', c: 24, r: 10, s: 'C' },
      { t: 'row', c: 70, r: 8, s: 'C' }, { t: 'row', c: 70, r: 9, s: 'C' }, { t: 'row', c: 70, r: 10, s: 'C' },
      { t: 'row', c: 120, r: 8, s: 'C' }, { t: 'row', c: 120, r: 9, s: 'C' }, { t: 'row', c: 120, r: 10, s: 'C' },
      { t: 'row', c: 168, r: 8, s: 'C' }, { t: 'row', c: 168, r: 9, s: 'C' }, { t: 'row', c: 168, r: 10, s: 'C' },
      { t: 'row', c: 220, r: 8, s: 'C' }, { t: 'row', c: 220, r: 9, s: 'C' }, { t: 'row', c: 220, r: 10, s: 'C' },
      // 熔岩上的落腳石（單向）
      { t: 'plat', c: 34, r: 22, w: 4 }, { t: 'plat', c: 79, r: 22, w: 4 },
      { t: 'plat', c: 148, r: 22, w: 4 }, { t: 'plat', c: 201, r: 22, w: 4 },
      // 石塊障礙（高 4 列 = 32 px，可跳過）
      { t: 'rect', c: 96, r: 20, w: 2, h: 4, k: TILE.BLOCK },
      { t: 'rect', c: 164, r: 20, w: 2, h: 4, k: TILE.BLOCK },
      // 金幣
      { t: 'coins', c: 12, r: 20, n: 4 }, { t: 'coins', c: 42, r: 20, n: 4 },
      { t: 'coins', c: 64, r: 19, n: 4 }, { t: 'coins', c: 88, r: 20, n: 4 },
      { t: 'coins', c: 114, r: 19, n: 4 }, { t: 'coins', c: 132, r: 20, n: 4 },
      { t: 'coins', c: 156, r: 19, n: 4 }, { t: 'coins', c: 186, r: 20, n: 4 },
      { t: 'row', c: 60, r: 20, s: 'B?B' }, { t: 'row', c: 140, r: 19, s: '?B?' },
      // 魔王房：橋（floor 的 'R'）之後的**實地**上放斧頭（col 246）——
      // 放在橋上的話 breakBridge() 會拆掉主角腳下那一欄，碰斧頭 = 必掉熔岩。
      { t: 'axe', c: 246, r: 23 },
      // 過關旗桿（踩頭 3 次 / 斧頭 / 碰旗桿三條路都會 clear）
      { t: 'pole', c: 248, r: 9 }
    ],
    start: { x: 32, y: 168 },
    goal: { col: 248, row: 20 },
    checkpoints: [92, 190],
    boss: { col: 226, x: 226 * 8, y: 160 },
    axe: { col: 246, row: 23 },
    // 敵人不放在熔岩坑前 8 欄內：彈跳球會把助跑速度吃掉 ⇒ 跑跳距離不足 = 掉熔岩
    // （R2b fix 前 col 72 的彈跳球就緊貼 76–83 的坑，機器人 18 死有 17 死在那）。
    spawns: [
      { col: 44, kind: 'roller', dir: -1 },
      { col: 50, kind: 'bouncer' },
      { col: 64, kind: 'roller', dir: -1, edge: true },
      { col: 90, kind: 'roller', dir: -1 },
      { col: 98, kind: 'roller', dir: -1, edge: true },
      { col: 108, kind: 'flyer', y: 136, amp: 24 },
      { col: 116, kind: 'roller', dir: -1 },
      { col: 136, kind: 'roller', dir: -1, edge: true },
      { col: 142, kind: 'bouncer' },
      { col: 160, kind: 'roller', dir: -1 },
      { col: 168, kind: 'roller', dir: -1, edge: true },
      { col: 180, kind: 'flyer', y: 128, amp: 24 },
      { col: 186, kind: 'bouncer' },
      { col: 190, kind: 'roller', dir: -1, edge: true }
    ]
  };

  var LEVELS = {};
  var IDS = ['1-1', '1-2', '1-3', '1-4'];
  LEVELS['1-1'] = new Level(L11);
  LEVELS['1-2'] = new Level(L12);
  LEVELS['1-3'] = new Level(L13);
  LEVELS['1-4'] = new Level(L14);
  ST.LEVELS = LEVELS;
  ST.LEVEL_IDS = IDS;

  ST.Levels = {
    ids: IDS,
    get: function (id) { return LEVELS[id] || null; },
    next: function (id) { var i = IDS.indexOf(id); return (i >= 0 && i + 1 < IDS.length) ? IDS[i + 1] : null; },
    rebind: function () {                       // ST.World.bind() 之後自動被呼叫
      var i, ok = true;
      for (i = 0; i < IDS.length; i++) ok = LEVELS[IDS[i]].rebind() && ok;
      return ok;
    },
    themeName: themeName,
    ROWS: ROWS, TOP_ROW: TOP_ROW, SPLIT_LINE: TOP_ROW * 8
  };

  // ============================================================ ⑥ 捲動串流
  // NES.SH.Scroller 的薄包裝（HUD 在上方 4 列 ⇒ row0:4 / rows:26 = 39 byte/欄）。
  // engine/shmup.js 不在時退回自己寫的等價版本（測試 / 早期整合用）。
  ST.Scroll = {
    create: function (ppu, level, opts) {
      opts = opts || {};
      var cfg = {
        nt: 2, cols: level.cols, row0: TOP_ROW, rows: ROWS - TOP_ROW,
        tileAt: level.chrAt, attrAt: level.attrAt
      };
      var k;
      for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) cfg[k] = opts[k];
      if (window.NES && NES.SH && NES.SH.Scroller) return NES.SH.Scroller(ppu, cfg);
      return fallbackScroller(ppu, cfg);
    }
  };

  function fallbackScroller(ppu, cfg) {
    var next = 0, ahead = cfg.ahead || 34;
    function writeColumn(c) {
      var ntc = c & 63, nt = (ntc >> 5) & 1, col = ntc & 31, r, n = 0;
      for (r = cfg.row0; r < cfg.row0 + cfg.rows; r++) { ppu.setTile(nt, col, r, cfg.tileAt(c, r)); n++; }
      if ((col & 1) === 0) {
        var c16 = col >> 1, r16;
        for (r16 = cfg.row0 >> 1; r16 < 15; r16++) { ppu.setAttr(nt, c16, r16, cfg.attrAt(c >> 1, r16)); n++; }
      }
      return n;
    }
    return {
      reset: function (camX) {
        ppu.mirroring('v');
        var c0 = (camX >> 3) - 2, c, n = 0;
        if (c0 < 0) c0 = 0;
        for (c = c0; c < c0 + 64; c++) n += writeColumn(c);
        next = c0 + 64;
        return n;
      },
      update: function (camX) {
        var want = (camX >> 3) + ahead, n = 0;
        if (next <= want && (!cfg.cols || next < cfg.cols)) { n = writeColumn(next); next++; }
        this.bytes = n;
        return n;
      },
      writeColumn: writeColumn,
      bytes: 0,
      get next() { return next; }
    };
  }
})();
