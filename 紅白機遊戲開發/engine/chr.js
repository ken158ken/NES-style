// engine/chr.js — NES.CHR：CHR「圖樣表」（pattern table）
// ---------------------------------------------------------------------------
// 規格來源：docs/research/01_硬體規格與限制.md §3.2（磁磚 8×8、2bpp、每磁磚 16 bytes、
//           圖樣表 2 張 × 256 磁磚）、docs/research/05_美術與像素規範.md §2 / §3。
// 契約：docs/TASKS.md「API 契約」之 NES.CHR。
// 形式：classic script、IIFE、零相依（不依賴 palette.js / ppu.js）。
//
// 磁磚文字格式：8 個字串、每個字串 8 個字元，字元只能是 `.` `1` `2` `3`
//   `.` = 色 0（背景層＝底色 backdrop；精靈層＝透明）
//   `1` `2` `3` = 該組子調色盤的 3 個實色
// 解出來是 Uint8Array(64)（row-major，值 0..3），PPU 端再依調色盤上色。
//
// 本檔另含原創 demo 美術 `NES.CHR.DEMO`（8×8 字型 / 地形磚 / 16×24 主角 3 幀 / 16×16 敵人），
// 全部以文字格式手繪、無任何抄襲自現有遊戲的素材。
(function () {
  'use strict';
  var NES = (window.NES = window.NES || {});

  var TW = 8, TH = 8, PIX = 64, MAX_TILES = 256;
  var CODE = { '.': 0, '1': 1, '2': 2, '3': 3 };

  function err(msg) { throw new Error('NES.CHR: ' + msg); }

  function isTile(v) { return (v instanceof Uint8Array) && v.length === PIX; }

  // 允許傳入「8 個字串的陣列」或「用換行分隔的單一字串」
  function normRows(rows, what) {
    if (typeof rows === 'string') {
      rows = rows.split('\n');
      var out = [], i;
      for (i = 0; i < rows.length; i++) {
        var s = rows[i].trim();
        if (s) out.push(s);
      }
      rows = out;
    }
    if (!rows || typeof rows.length !== 'number') err(what + ' 需要 8 個字串（或換行字串）');
    return rows;
  }

  // tile(rows) → Uint8Array(64)
  function tile(rows) {
    rows = normRows(rows, 'tile(rows)');
    if (rows.length !== TH) err('tile 需要 ' + TH + ' 列，收到 ' + rows.length + ' 列');
    var out = new Uint8Array(PIX), y, x, row, ch, c;
    for (y = 0; y < TH; y++) {
      row = rows[y];
      if (typeof row !== 'string') err('tile 第 ' + y + ' 列不是字串');
      if (row.length !== TW) err('tile 第 ' + y + ' 列長度必須是 ' + TW + '，收到 ' + row.length + '（"' + row + '"）');
      for (x = 0; x < TW; x++) {
        ch = row.charAt(x);
        c = CODE[ch];
        if (c === undefined) err('tile 第 ' + y + ' 列第 ' + x + ' 字元 "' + ch + '" 非法（只接受 . 1 2 3）');
        out[y * TW + x] = c;
      }
    }
    return out;
  }

  var BLANK = new Uint8Array(PIX);

  // 把 rows / Uint8Array(64) / tall pair 之外的東西擋掉
  function toTile(v, what) {
    if (isTile(v)) return v;
    return tile(v, what);
  }

  // tile16(top, bottom)：8×16 精靈模式的上下兩塊。
  // 回傳 { tall:true, top, bottom }；放進 bank 時保證落在「偶數索引 + 下一格」，
  // 這正是 PPU 在 8×16 模式的取法（OAM 的 tile 欄填偶數索引 = 上半塊）。
  function tile16(rowsTop, rowsBottom) {
    return { tall: true, top: toTile(rowsTop), bottom: toTile(rowsBottom) };
  }

  // slice(rows[, opt])：把任意 W×H（皆為 8 的倍數）的文字圖切成 8×8 磁磚。
  // 回傳 { tiles:[...], cols, rows }（row-major：idx = r*cols + c）。
  function sliceRaw(rows, what) {
    rows = normRows(rows, what || 'slice(rows)');
    var h = rows.length, i;
    if (h === 0 || h % TH) err('slice 的列數必須是 8 的倍數，收到 ' + h);
    var w = rows[0].length;
    if (w === 0 || w % TW) err('slice 的寬度必須是 8 的倍數，收到 ' + w);
    for (i = 0; i < h; i++) {
      if (typeof rows[i] !== 'string' || rows[i].length !== w) {
        err('slice 第 ' + i + ' 列長度不一致（應為 ' + w + '，收到 ' + (rows[i] ? rows[i].length : 'null') + '）');
      }
    }
    var cols = w / TW, trow = h / TH, tiles = [], r, c, y, sub;
    for (r = 0; r < trow; r++) {
      for (c = 0; c < cols; c++) {
        sub = [];
        for (y = 0; y < TH; y++) sub.push(rows[r * TH + y].substr(c * TW, TW));
        tiles.push(tile(sub));
      }
    }
    return { tiles: tiles, cols: cols, rows: trow };
  }

  function slice(rows) { return sliceRaw(rows).tiles; }

  // sliceNamed(rows, prefix) → { prefix_r0c0: tile, ... }，方便直接餵給 bank()
  function sliceNamed(rows, prefix) {
    var s = sliceRaw(rows, 'sliceNamed(rows)'), o = {}, r, c;
    for (r = 0; r < s.rows; r++) {
      for (c = 0; c < s.cols; c++) o[prefix + '_r' + r + 'c' + c] = s.tiles[r * s.cols + c];
    }
    return o;
  }

  // fromString(big)：一整張 128×128 的文字圖 → 256 個磁磚（16×16 格，row-major，
  // 與 NES pattern table 以 16×16 檢視的排列一致）。
  function fromString(big) {
    var rows = normRows(big, 'fromString(big)');
    if (rows.length !== 128) err('fromString 需要 128 列，收到 ' + rows.length);
    var i;
    for (i = 0; i < 128; i++) {
      if (typeof rows[i] !== 'string' || rows[i].length !== 128) {
        err('fromString 第 ' + i + ' 列長度必須是 128，收到 ' + (rows[i] ? rows[i].length : 'null'));
      }
    }
    return sliceRaw(rows, 'fromString').tiles;
  }

  // ---- bank ---------------------------------------------------------------
  var banks = {};

  // bank(name, obj)：obj 可以是 { tileName: rows|Uint8Array(64)|tile16(...) } 或 rows 陣列。
  // 回傳 { name, tiles, index(name), has(name), count, names }；超過 256 磁磚 → throw。
  function bank(name, obj) {
    if (typeof name !== 'string' || !name) err('bank(name, obj) 的 name 必須是非空字串');
    if (!obj || typeof obj !== 'object') err('bank("' + name + '") 的 obj 必須是物件或陣列');
    var tiles = [], idx = {}, order = [], keys, i, k, v;

    function push(t) {
      if (tiles.length >= MAX_TILES) err('bank "' + name + '" 超過 ' + MAX_TILES + ' 個磁磚上限');
      tiles.push(t);
      return tiles.length - 1;
    }

    if (Object.prototype.toString.call(obj) === '[object Array]') {
      keys = [];
      for (i = 0; i < obj.length; i++) keys.push(String(i));
    } else {
      keys = Object.keys(obj);
    }
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      v = (Object.prototype.toString.call(obj) === '[object Array]') ? obj[Number(k)] : obj[k];
      if (idx[k] !== undefined) err('bank "' + name + '" 磁磚名稱重複：' + k);
      if (v && v.tall === true && v.top && v.bottom) {
        if (tiles.length & 1) push(BLANK.slice ? BLANK.slice(0) : new Uint8Array(PIX)); // 8×16 需偶數對齊
        idx[k] = push(v.top);
        order.push(k);
        push(v.bottom);
        continue;
      }
      idx[k] = push(toTile(v));
      order.push(k);
    }
    if (tiles.length > MAX_TILES) err('bank "' + name + '" 超過 ' + MAX_TILES + ' 個磁磚上限');

    var b = {
      name: name,
      tiles: tiles,
      count: tiles.length,
      names: order,
      index: function (n) {
        var v2 = idx[n];
        if (v2 === undefined) err('bank "' + name + '" 沒有磁磚 "' + n + '"');
        return v2;
      },
      has: function (n) { return idx[n] !== undefined; }
    };
    banks[name] = b;
    return b;
  }

  // ---- pattern table ------------------------------------------------------
  var pattern = [null, null];

  function setPattern(table, bankName) {
    if (table !== 0 && table !== 1) err('setPattern 的 table 只能是 0 或 1，收到 ' + table);
    var b = (bankName && typeof bankName === 'object' && bankName.tiles) ? bankName : banks[bankName];
    if (!b) err('setPattern：找不到 bank "' + bankName + '"');
    pattern[table] = b;
    return b;
  }

  function get(table, i) {
    if (table !== 0 && table !== 1) err('get 的 table 只能是 0 或 1，收到 ' + table);
    var b = pattern[table];
    if (!b) err('get：pattern table ' + table + ' 尚未 setPattern');
    if (typeof i !== 'number' || i !== (i | 0) || i < 0 || i >= MAX_TILES) {
      err('get 的 idx 必須是 0..255 的整數，收到 ' + i);
    }
    var t = b.tiles[i];
    return t || BLANK; // 未定義的磁磚＝空白（真機上是未初始化的 CHR）
  }

  function getBank(name) { return banks[name] || null; }

  function reset() { banks = {}; pattern = [null, null]; }

  var CHR = {
    TILE_W: TW, TILE_H: TH, MAX_TILES: MAX_TILES, BLANK: BLANK,
    tile: tile, tile16: tile16, bank: bank, setPattern: setPattern, get: get,
    fromString: fromString, slice: slice, sliceNamed: sliceNamed,
    getBank: getBank, reset: reset,
    banks: function () { return banks; },
    pattern: function (t) { return pattern[t] || null; }
  };
  NES.CHR = CHR;

  // =========================================================================
  // DEMO：原創文字手繪美術（供 demo 房與測試使用）
  // =========================================================================

  // ---- 8×8 字型：5×7 字身放在 (x=1, y=0)，第 7 列留白當行距 ----------------
  var FONT = {
    'N0'     : ['..333...', '.3...3..', '.3..33..', '.3.3.3..', '.33..3..', '.3...3..', '..333...', '........'],
    'N1'     : ['...3....', '..33....', '...3....', '...3....', '...3....', '...3....', '..333...', '........'],
    'N2'     : ['..333...', '.3...3..', '.....3..', '....3...', '...3....', '..3.....', '.33333..', '........'],
    'N3'     : ['.3333...', '.....3..', '.....3..', '..333...', '.....3..', '.....3..', '.3333...', '........'],
    'N4'     : ['....3...', '...33...', '..3.3...', '.3..3...', '.33333..', '....3...', '....3...', '........'],
    'N5'     : ['.33333..', '.3......', '.3333...', '.....3..', '.....3..', '.3...3..', '..333...', '........'],
    'N6'     : ['...33...', '..3.....', '.3......', '.3333...', '.3...3..', '.3...3..', '..333...', '........'],
    'N7'     : ['.33333..', '.....3..', '....3...', '...3....', '..3.....', '..3.....', '..3.....', '........'],
    'N8'     : ['..333...', '.3...3..', '.3...3..', '..333...', '.3...3..', '.3...3..', '..333...', '........'],
    'N9'     : ['..333...', '.3...3..', '.3...3..', '..3333..', '.....3..', '....3...', '..33....', '........'],
    'A'      : ['..333...', '.3...3..', '.3...3..', '.33333..', '.3...3..', '.3...3..', '.3...3..', '........'],
    'B'      : ['.3333...', '.3...3..', '.3333...', '.3...3..', '.3...3..', '.3...3..', '.3333...', '........'],
    'C'      : ['..333...', '.3...3..', '.3......', '.3......', '.3......', '.3...3..', '..333...', '........'],
    'D'      : ['.333....', '.3..3...', '.3...3..', '.3...3..', '.3...3..', '.3..3...', '.333....', '........'],
    'E'      : ['.33333..', '.3......', '.3......', '.3333...', '.3......', '.3......', '.33333..', '........'],
    'F'      : ['.33333..', '.3......', '.3......', '.3333...', '.3......', '.3......', '.3......', '........'],
    'G'      : ['..333...', '.3...3..', '.3......', '.3.333..', '.3...3..', '.3...3..', '..333...', '........'],
    'H'      : ['.3...3..', '.3...3..', '.3...3..', '.33333..', '.3...3..', '.3...3..', '.3...3..', '........'],
    'I'      : ['..333...', '...3....', '...3....', '...3....', '...3....', '...3....', '..333...', '........'],
    'J'      : ['...333..', '....3...', '....3...', '....3...', '....3...', '.3..3...', '..33....', '........'],
    'K'      : ['.3...3..', '.3..3...', '.3.3....', '.33.....', '.3.3....', '.3..3...', '.3...3..', '........'],
    'L'      : ['.3......', '.3......', '.3......', '.3......', '.3......', '.3......', '.33333..', '........'],
    'M'      : ['.3...3..', '.33.33..', '.3.3.3..', '.3.3.3..', '.3...3..', '.3...3..', '.3...3..', '........'],
    'N'      : ['.3...3..', '.33..3..', '.3.3.3..', '.3.3.3..', '.3..33..', '.3...3..', '.3...3..', '........'],
    'O'      : ['..333...', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '..333...', '........'],
    'P'      : ['.3333...', '.3...3..', '.3...3..', '.3333...', '.3......', '.3......', '.3......', '........'],
    'Q'      : ['..333...', '.3...3..', '.3...3..', '.3...3..', '.3.3.3..', '.3..3...', '..33.3..', '........'],
    'R'      : ['.3333...', '.3...3..', '.3...3..', '.3333...', '.3.3....', '.3..3...', '.3...3..', '........'],
    'S'      : ['..333...', '.3...3..', '.3......', '..333...', '.....3..', '.3...3..', '..333...', '........'],
    'T'      : ['.33333..', '...3....', '...3....', '...3....', '...3....', '...3....', '...3....', '........'],
    'U'      : ['.3...3..', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '..333...', '........'],
    'V'      : ['.3...3..', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '..3.3...', '...3....', '........'],
    'W'      : ['.3...3..', '.3...3..', '.3...3..', '.3.3.3..', '.3.3.3..', '.33.33..', '.3...3..', '........'],
    'X'      : ['.3...3..', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '.3...3..', '........'],
    'Y'      : ['.3...3..', '.3...3..', '..3.3...', '...3....', '...3....', '...3....', '...3....', '........'],
    'Z'      : ['.33333..', '.....3..', '....3...', '...3....', '..3.....', '.3......', '.33333..', '........'],
    'SP'     : ['........', '........', '........', '........', '........', '........', '........', '........'],
    'DOT'    : ['........', '........', '........', '........', '........', '..33....', '..33....', '........'],
    'COMMA'  : ['........', '........', '........', '........', '..33....', '..33....', '..3.....', '........'],
    'COLON'  : ['........', '..33....', '..33....', '........', '..33....', '..33....', '........', '........'],
    'DASH'   : ['........', '........', '........', '.33333..', '........', '........', '........', '........'],
    'EXCL'   : ['...3....', '...3....', '...3....', '...3....', '...3....', '........', '...3....', '........'],
    'QUEST'  : ['..333...', '.3...3..', '.....3..', '...33...', '...3....', '........', '...3....', '........'],
    'APOS'   : ['...3....', '...3....', '........', '........', '........', '........', '........', '........'],
    'SLASH'  : ['.....3..', '....3...', '...3....', '...3....', '..3.....', '.3......', '........', '........'],
    'LPAREN' : ['....3...', '...3....', '..3.....', '..3.....', '..3.....', '...3....', '....3...', '........'],
    'RPAREN' : ['..3.....', '...3....', '....3...', '....3...', '....3...', '...3....', '..3.....', '........'],
    'PLUS'   : ['........', '...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........'],
    'EQ'     : ['........', '........', '.33333..', '........', '.33333..', '........', '........', '........'],
    'MUL'    : ['........', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '........', '........'],
    'ARROW'  : ['........', '...3....', '....3...', '.33333..', '....3...', '...3....', '........', '........'],
    'HEART'  : ['........', '.33.33..', '.33333..', '.33333..', '..333...', '...3....', '........', '........'],
    'COIN'   : ['..333...', '.3.3.3..', '.3.3.3..', '.3.3.3..', '.3.3.3..', '.3.3.3..', '..333...', '........'],
    'PCT'    : ['.33..3..', '.33.3...', '...3....', '..3.33..', '.3..33..', '........', '........', '........'],
    'STAR'   : ['...3....', '..333...', '.33333..', '..333...', '.33.33..', '........', '........', '........'],
  };

  // ---- 地形磚（背景用；色 1 深 / 2 中 / 3 亮）------------------------------
  var TERRAIN = {
    'SKY':        ['........', '........', '........', '........', '........', '........', '........', '........'],
    'GROUND_TOP': ['33333333', '32323232', '22222222', '21222212', '22212221', '12221222', '22122122', '21222212'],
    'GROUND':     ['22222222', '21222212', '22212221', '12221222', '22122122', '21222212', '22212221', '12222122'],
    'BRICK':      ['11111111', '22212221', '22212221', '22212221', '11111111', '21222122', '21222122', '21222122'],
    'QBLOCK':     ['11111111', '13311331', '13133131', '13333131', '13331331', '13333331', '13331331', '11111111'],
    'BLOCK':      ['11111111', '13333331', '13233231', '13333331', '13333331', '13233231', '13333331', '11111111'],
    'CLOUD_L':    ['........', '.....111', '...11333', '..133333', '.1333333', '13333333', '13333333', '.1111111'],
    'CLOUD_R':    ['........', '111.....', '33311...', '333331..', '3333331.', '33333331', '33333331', '1111111.'],
    'BUSH':       ['........', '........', '...11...', '..1221..', '.122221.', '12222221', '12222221', '11111111'],
    'WATER':      ['.11..11.', '12211221', '22222222', '22222222', '21222122', '22222222', '22122212', '22222222'],
    'LADDER':     ['.22..22.', '.222222.', '.22..22.', '.22..22.', '.22..22.', '.222222.', '.22..22.', '.22..22.'],
    'SOLID':      ['11111111', '11111111', '11111111', '11111111', '11111111', '11111111', '11111111', '11111111']
  };

  // ---- 主角《星塵勇者》16×24：上半身 16×16 共用，3 組腳 16×8 輪替 ---------
  // （研究 05 §2「磁磚重用不是風格，是數學」：3 幀走路只多花 4 個磁磚）
  var HERO_TOP = [
    '.....111111.....',
    '....11111111....',
    '...1111111111...',
    '...1133333311...',
    '...1333333331...',
    '...1331331331...',
    '...1333333331...',
    '...1333113331...',
    '...1133333311...',
    '....11111111....',
    '..122222222221..',
    '.12222222222221.',
    '.13222233222231.',
    '.13222233222231.',
    '..132222222231..',
    '..133222222331..'
  ];
  // 幀 0：站立 / 接地（walk cycle 的「1」）
  var HERO_LEGS0 = [
    '...1222222221...',
    '...1111111111...',
    '...1221..1221...',
    '...1221..1221...',
    '...1221..1221...',
    '...1221..1221...',
    '..11111..11111..',
    '..11111..11111..'
  ];
  // 幀 1：大步（walk cycle 的「2」）
  var HERO_LEGS1 = [
    '...1222222221...',
    '...1111111111...',
    '...1221..1221...',
    '..1221....1221..',
    '..1221....1221..',
    '.1221......1221.',
    '11111......11111',
    '11111......11111'
  ];
  // 幀 2：抬腳（walk cycle 的「3」）
  var HERO_LEGS2 = [
    '...1222222221...',
    '...1111111111...',
    '...1221..1221...',
    '...1221..1221...',
    '..1221...1221...',
    '..1221...11111..',
    '.11111..........',
    '.11111..........'
  ];

  // ---- 敵人「石頭蟲」16×16（用兩個 8×16 精靈 → tile16）---------------------
  var ENEMY_ART = [
    '......1111......',
    '....11222211....',
    '...1222222221...',
    '..122222222221..',
    '.12233333333221.',
    '.12331133113321.',
    '.12331133113321.',
    '.12233333333221.',
    '..123333333321..',
    '..122222222221..',
    '..122222222221..',
    '.12222222222221.',
    '.11222222222211.',
    '.11222222222211.',
    '..11.111111.11..',
    '..11..1111..11..'
  ];

  // ---- 組成 bank ----------------------------------------------------------
  function merge() {
    var o = {}, i, k, s;
    for (i = 0; i < arguments.length; i++) {
      s = arguments[i];
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
    }
    return o;
  }

  // 背景表：SKY 放索引 0（真機慣例：0 號磁磚是空白）
  var bgObj = merge(TERRAIN, FONT);
  var bgBank = bank('demo_bg', bgObj);

  // 精靈表：主角上半身 4 磚 + 三組腳各 2 磚 + 敵人 2 個 8×16（4 磚）
  var e = slice(ENEMY_ART); // [r0c0, r0c1, r1c0, r1c1]
  var sprObj = merge(
    sliceNamed(HERO_TOP, 'HERO_TOP'),
    sliceNamed(HERO_LEGS0, 'HERO_LEG0'),
    sliceNamed(HERO_LEGS1, 'HERO_LEG1'),
    sliceNamed(HERO_LEGS2, 'HERO_LEG2'),
    { 'ENEMY_L': tile16(e[0], e[2]), 'ENEMY_R': tile16(e[1], e[3]) }
  );
  var sprBank = bank('demo_spr', sprObj);

  // ---- 8×16 精靈模式專用 bank（QA P2-4 / X12）------------------------------
  // `DEMO.spr` 是 8×8 切片：在 8×16 模式下 PPU 會把「偶數索引 + 下一格」當成上下半塊
  // （engine/ppu.js `_sprLine`：table = tile & 1、tidx = tile & 0xFE），直接用會取到隔壁磁磚。
  // 這裡用 tile16() 把每一塊重新配對好，**OAM 的 tile 欄要填 `index | 1`**（＝圖樣表 1）：
  //     ppu.setPatternTables(0, 1); NES.CHR.setPattern(1, 'demo_spr16');
  //     ppu.spriteMode(16);
  //     ppu.sprite(0, { x: x, y: y, tile: NES.CHR.DEMO.oam16('HERO_TOP_L'), pal: 0 });
  // 主角 16×24 = 上半塊 16×16（2 個 8×16）+ 腳 16×8（2 個 8×16，下半塊留白）。
  var BLANK8 = ['........', '........', '........', '........', '........', '........', '........', '........'];
  var t16 = slice(HERO_TOP);                         // 16×16 → [r0c0, r0c1, r1c0, r1c1]
  var l16 = [slice(HERO_LEGS0), slice(HERO_LEGS1), slice(HERO_LEGS2)];   // 16×8 → [c0, c1]
  var spr16Bank = bank('demo_spr16', {
    HERO_TOP_L: tile16(t16[0], t16[2]),
    HERO_TOP_R: tile16(t16[1], t16[3]),
    HERO_L0_L: tile16(l16[0][0], BLANK8),
    HERO_L0_R: tile16(l16[0][1], BLANK8),
    HERO_L1_L: tile16(l16[1][0], BLANK8),
    HERO_L1_R: tile16(l16[1][1], BLANK8),
    HERO_L2_L: tile16(l16[2][0], BLANK8),
    HERO_L2_R: tile16(l16[2][1], BLANK8),
    ENEMY_L: tile16(e[0], e[2]),
    ENEMY_R: tile16(e[1], e[3])
  });
  // 名稱 → OAM tile 欄的值（已經把「圖樣表 1」的 bit0 加好）
  function oam16(name) { return spr16Bank.index(name) | 1; }

  // ---- 文字 → 磁磚索引 ----------------------------------------------------
  var CHARMAP = {
    ' ': 'SP', '.': 'DOT', ',': 'COMMA', ':': 'COLON', '-': 'DASH', '!': 'EXCL',
    '?': 'QUEST', "'": 'APOS', '/': 'SLASH', '(': 'LPAREN', ')': 'RPAREN',
    '+': 'PLUS', '=': 'EQ', '*': 'MUL', 'x': 'MUL', '>': 'ARROW',
    '^': 'HEART', '@': 'COIN', '%': 'PCT', '$': 'STAR'
  };
  (function () {
    var i;
    for (i = 0; i <= 9; i++) CHARMAP[String(i)] = 'N' + i;
    for (i = 65; i <= 90; i++) CHARMAP[String.fromCharCode(i)] = String.fromCharCode(i);
  })();

  function tileNameFor(ch) {
    var n = CHARMAP[ch];
    if (n === undefined && ch >= 'a' && ch <= 'z') n = CHARMAP[ch.toUpperCase()];
    return n === undefined ? 'SP' : n;
  }

  // text('SCORE 000100') → [磁磚索引...]（demo_bg bank）
  function text(s) {
    var out = [], i;
    s = String(s);
    for (i = 0; i < s.length; i++) out.push(bgBank.index(tileNameFor(s.charAt(i))));
    return out;
  }

  // metasprite 描述（相對座標 + 磁磚名稱），給 demo 房 / 測試用
  function meta(names, cols, x0, y0) {
    var parts = [], i;
    for (i = 0; i < names.length; i++) {
      parts.push({ x: x0 + (i % cols) * 8, y: y0 + ((i / cols) | 0) * 8, tile: names[i] });
    }
    return parts;
  }

  function heroFrame(n) {
    return meta(['HERO_TOP_r0c0', 'HERO_TOP_r0c1', 'HERO_TOP_r1c0', 'HERO_TOP_r1c1',
      'HERO_LEG' + n + '_r0c0', 'HERO_LEG' + n + '_r0c1'], 2, 0, 0);
  }

  CHR.DEMO = {
    FONT: FONT,
    TERRAIN: TERRAIN,
    HERO_TOP: HERO_TOP,
    HERO_LEGS: [HERO_LEGS0, HERO_LEGS1, HERO_LEGS2],
    ENEMY_ART: ENEMY_ART,
    bg: bgBank,
    spr: sprBank,
    spr16: spr16Bank,       // 8×16 配對版（OAM tile 欄請用 oam16(name)）
    oam16: oam16,
    CHARMAP: CHARMAP,
    text: text,
    tileNameFor: tileNameFor,
    hero: {
      w: 16, h: 24, mode: 8,
      frames: [heroFrame(0), heroFrame(1), heroFrame(2)],
      walk: [0, 1, 0, 2],      // 研究 05 §4：NES 走路慣例 1→2→1→3
      framesPerStep: 4          // 約 15fps 的動畫節奏（60/4）
    },
    enemy: {
      w: 16, h: 16, mode: 16,
      parts: [{ x: 0, y: 0, tile: 'ENEMY_L' }, { x: 8, y: 0, tile: 'ENEMY_R' }]
    }
  };
})();
