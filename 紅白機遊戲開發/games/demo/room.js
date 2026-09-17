/*
 * games/demo/room.js — 測試房的關卡資料 / 名稱表寫入 / 狀態列 / 標題畫面
 * ---------------------------------------------------------------------------
 * 擁有者：demo agent ｜ 依賴：games/demo/chr.js、engine/ppu.js
 *
 * 關卡：256 磁磚欄 × 30 列 = 2048×240 px ＝ **8 個畫面寬**（任務要求 ≥ 4）。
 * 名稱表只有 2 張（512 px）→ 用 **垂直鏡像 'v'**（左右兩張不同），
 * 相機前進時把「畫面右緣再往右 2 欄」的那一欄寫進 `欄 & 63` 的位置
 * （＝真機的「邊捲邊補欄」，每幀只寫 1 欄 26 byte + 屬性，遠低於 VBlank 160 byte 預算）。
 *
 * 版面（列 = 8 px）：
 *   列 0–3   狀態列（`ppu.split(32, ...)` 之前的區段，捲動固定 x=0）
 *   列 4–25  天空 / 雲 / 草叢 / 浮空磚
 *   列 24–25 敵人房的高台（比地面高 16 px，讓敵人分成兩條掃描線帶）
 *   列 26–29 地面
 *
 * 屬性表以 16×16 為單位（`setAttr`）：0 天空 / 雲 / 字、1 泥土、2 磚 / 問號磚、3 草。
 */
(function () {
  'use strict';
  var DEMO = window.DEMO = window.DEMO || {};
  var C = DEMO.CHR;

  var COLS = 256, ROWS = 30;
  var W_PX = COLS * 8;                 // 2048
  var STATUS_ROWS = 4;                 // 列 0–3 給狀態列
  var TOP_ROW = STATUS_ROWS;           // 關卡從列 4 開始
  var GROUND_ROW = 26;                 // 地面頂端（y = 208）
  var GROUND_Y = GROUND_ROW * 8;       // 208
  var LEDGE_ROW = 24;                  // 高台頂端（y = 192）
  var LEDGE_C0 = 241, LEDGE_C1 = 255;  // 高台欄範圍（x 1928–2047）
  var BLOCK_ROW = 20;                  // 浮空磚列（y = 160）

  // 磁磚種類代碼
  var K = { SKY: 0, GTOP: 1, GND: 2, BRICK: 3, QBLOCK: 4, BLOCK: 5, CLOUD_L: 6, CLOUD_R: 7, BUSH: 8 };
  var SOLID = [false, true, true, true, true, true, false, false, false];
  var TILE_OF = null;                  // 種類 → demo_bg 磁磚索引（init 時填）

  var map = new Uint8Array(ROWS * COLS);
  var attr = new Uint8Array(16 * (COLS / 2));   // [row16 * (COLS/2) + col16]，row16 0..14

  function set(c, r, k) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map[r * COLS + c] = k; }
  function kindAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return K.SKY;
    return map[r * COLS + c];
  }

  function inLedge(c) { return c >= LEDGE_C0 && c <= LEDGE_C1; }

  // ---- 產生關卡（決定性，沒有亂數）---------------------------------------
  function build() {
    map.fill(K.SKY);
    var c, r;
    for (c = 0; c < COLS; c++) {
      // 地面（沒有坑，讓自動測試可重現）
      set(c, GROUND_ROW, K.GTOP);
      for (r = GROUND_ROW + 1; r < ROWS; r++) set(c, r, K.GND);

      // 敵人房高台（列 24–25）
      if (inLedge(c)) { set(c, LEDGE_ROW, K.GTOP); set(c, LEDGE_ROW + 1, K.GND); }

      // 雲（只放列 6–7，避開標題文字區）
      if (c % 16 === 3) { set(c, 6, K.CLOUD_L); set(c + 1, 6, K.CLOUD_R); }
      if (c % 16 === 11) { set(c, 7, K.CLOUD_L); set(c + 1, 7, K.CLOUD_R); }

      // 草叢（貼著地面，不擋路）
      if (c % 13 === 6 && !inLedge(c)) set(c, GROUND_ROW - 1, K.BUSH);
    }

    // 浮空磚組（x ≥ 720，避開手感測試用的空曠起跑區）
    var groups = [90, 104, 118, 150, 168];
    for (var g = 0; g < groups.length; g++) {
      var c0 = groups[g];
      set(c0, BLOCK_ROW, K.QBLOCK);
      set(c0 + 1, BLOCK_ROW, K.BRICK);
      set(c0 + 2, BLOCK_ROW, K.QBLOCK);
      set(c0 + 3, BLOCK_ROW, K.BRICK);
      if (g % 2 === 1) { set(c0 + 1, BLOCK_ROW - 4, K.BLOCK); set(c0 + 2, BLOCK_ROW - 4, K.BLOCK); }
    }

    buildAttr();
    return map;
  }

  // 16×16 屬性區塊：掃 2×2 磁磚決定調色盤組
  function buildAttr() {
    attr.fill(0);
    var cols16 = COLS / 2;
    for (var r16 = 0; r16 < 15; r16++) {
      for (var c16 = 0; c16 < cols16; c16++) {
        var pal = 0, hasBlock = false, hasBush = false, hasGround = false;
        for (var dy = 0; dy < 2; dy++) {
          for (var dx = 0; dx < 2; dx++) {
            var k = kindAt(c16 * 2 + dx, r16 * 2 + dy);
            if (k === K.BRICK || k === K.QBLOCK || k === K.BLOCK) hasBlock = true;
            else if (k === K.BUSH) hasBush = true;
            else if (k === K.GTOP || k === K.GND) hasGround = true;
          }
        }
        if (hasBlock) pal = 2;
        else if (hasBush) pal = 3;
        else if (hasGround) pal = (r16 >= 13) ? 1 : 3;   // 列 26 以下＝泥土，其餘（高台）＝草地
        attr[r16 * cols16 + c16] = pal;
      }
    }
  }

  // ---- 名稱表寫入 ---------------------------------------------------------
  function tileIndex(k) { return TILE_OF[k]; }

  // 把世界第 c 欄寫進名稱表（欄 & 63 → nt 0/1 的第 col 欄；'v' 鏡像＝左右兩張不同）
  function writeColumn(ppu, c) {
    var ntc = c & 63, nt = (ntc >> 5) & 1, col = ntc & 31, r;
    for (r = TOP_ROW; r < ROWS; r++) ppu.setTile(nt, col, r, tileIndex(kindAt(c, r)));
    if ((col & 1) === 0) {
      var c16 = col >> 1, w16 = COLS / 2, src = (c >> 1) % w16;
      for (var r16 = 2; r16 <= 14; r16++) ppu.setAttr(nt, c16, r16, attr[r16 * w16 + src]);
    }
  }

  // ---- 狀態列（列 0–3，只在 nt0；split 之前的區段永遠 x=0）----------------
  function writeText(ppu, nt, col, row, str) {
    var t = C.text(str);
    for (var i = 0; i < t.length && col + i < 32; i++) ppu.setTile(nt, col + i, row, t[i]);
  }

  function drawHudStatic(ppu) {
    var r;
    for (r = 0; r < STATUS_ROWS; r++) {
      ppu.fillTiles(0, 0, r, 32, 1, C.T.SKY);
      ppu.fillTiles(1, 0, r, 32, 1, C.T.SKY);
    }
    ppu.setAttr(0, 0, 0, 0); ppu.fillAttr(0, 0, 0, 16, 2, 0);   // 列 0–3 用調色盤 0（白字）
    ppu.fillAttr(1, 0, 0, 16, 2, 0);
    writeText(ppu, 0, 2, 1, 'SCORE');
    writeText(ppu, 0, 12, 1, 'WORLD');
    writeText(ppu, 0, 22, 1, 'TIME');
  }

  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }

  function drawHudValues(ppu, score, time, world) {
    writeText(ppu, 0, 2, 2, pad(score, 6));
    writeText(ppu, 0, 13, 2, world);
    writeText(ppu, 0, 23, 2, pad(time, 3));
  }

  // ---- 標題畫面（寫在關卡區的列 10–18，開始遊戲後把欄重畫回來）------------
  var TITLE = [
    { row: 10, col: 9, text: 'STARDUST HERO' },
    { row: 12, col: 9, text: 'DEMO ROOM  R1' },
    { row: 15, col: 10, text: 'PRESS START' },
    { row: 18, col: 8, text: '$ 2026 ORIGINAL' }
  ];

  function drawTitle(ppu) {
    for (var i = 0; i < TITLE.length; i++) writeText(ppu, 0, TITLE[i].col, TITLE[i].row, TITLE[i].text);
  }

  // 清標題：只把標題那幾行的字改回天空磚（列 10/12/15/18 在關卡裡本來就是純天空）。
  // 舊版是重寫 32 整欄 = 832+ byte，一個 VBlank 根本搬不完（timing.budget 會判超支）；
  // 現在 4 行 × 字串長度 = 52 byte，穩穩落在 160 byte 預算內。
  function clearTitle(ppu) {
    for (var i = 0; i < TITLE.length; i++) {
      var t = TITLE[i];
      ppu.fillTiles(0, t.col, t.row, Math.min(t.text.length, 32 - t.col), 1, C.T.SKY);
    }
  }

  // ---- 碰撞查詢（世界像素座標）-------------------------------------------
  function solidAtPx(x, y) {
    if (x < 0) return true;                       // 關卡左牆
    if (x >= W_PX) return true;                   // 關卡右牆
    var c = x >> 3, r = y >> 3;
    if (r < 0) return false;                      // 天空（不擋頭）
    if (r >= ROWS) return true;
    return SOLID[kindAt(c, r)];
  }

  // ---- 敵人配置（12 隻在敵人房同掃描線帶 + 2 隻踩敵測試用）----------------
  // band 0 = 站地面（y=192，掃描線 192–207）／band 1 = 站高台（y=176，掃描線 176–191）
  function enemySpawns() {
    var list = [], i;
    // 踩敵測試用的兩隻（關卡前段，彼此相隔遠）
    var lone = [600, 664];
    for (i = 0; i < lone.length; i++) {
      list.push({ x: lone[i], y: GROUND_Y - 16, band: 0, min: lone[i], max: lone[i] + 10, dir: 1 });
    }
    // 敵人房：兩帶各 6 隻，間距 19 px（> 16 + 巡邏 3）⇒ 彼此永不重疊，方便逐隻驗證
    var bandA = [1796, 1815, 1834, 1853, 1872, 1891];   // 站地面：y=192，掃描線 192–207
    for (i = 0; i < bandA.length; i++) {
      list.push({ x: bandA[i], y: GROUND_Y - 16, band: 0, min: bandA[i], max: bandA[i] + 3, dir: (i & 1) ? 1 : -1 });
    }
    var bandB = [1930, 1949, 1968, 1987, 2006, 2025];   // 站高台：y=176，掃描線 176–191
    for (i = 0; i < bandB.length; i++) {
      list.push({ x: bandB[i], y: LEDGE_ROW * 8 - 16, band: 1, min: bandB[i], max: bandB[i] + 3, dir: (i & 1) ? -1 : 1 });
    }
    return list;
  }

  DEMO.Room = {
    COLS: COLS, ROWS: ROWS, W_PX: W_PX, TOP_ROW: TOP_ROW,
    STATUS_ROWS: STATUS_ROWS, SPLIT_LINE: STATUS_ROWS * 8,
    GROUND_ROW: GROUND_ROW, GROUND_Y: GROUND_Y, LEDGE_ROW: LEDGE_ROW,
    K: K,
    START_X: 32, START_Y: GROUND_Y - 24,
    CAM_MAX: W_PX - 256,
    init: function () {
      TILE_OF = [C.T.SKY, C.T.GROUND_TOP, C.T.GROUND, C.T.BRICK, C.T.QBLOCK, C.T.BLOCK,
        C.T.CLOUD_L, C.T.CLOUD_R, C.T.BUSH];
      build();
    },
    kindAt: kindAt, solidAtPx: solidAtPx,
    writeColumn: writeColumn, writeText: writeText,
    drawHudStatic: drawHudStatic, drawHudValues: drawHudValues,
    drawTitle: drawTitle, clearTitle: clearTitle,
    enemySpawns: enemySpawns
  };
})();
