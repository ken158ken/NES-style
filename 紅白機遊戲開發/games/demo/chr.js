/*
 * games/demo/chr.js — 測試房「星塵測試室」的 CHR / 調色盤層
 * ---------------------------------------------------------------------------
 * 擁有者：demo agent ｜ 依賴：engine/chr.js（NES.CHR、NES.CHR.DEMO 原創美術）
 *
 * 做兩件事：
 *   ① 背景圖樣表直接用 `NES.CHR.DEMO.bg`（67 磚：8×8 字型 + 地形磚，SKY 固定在索引 0）。
 *   ② 精靈圖樣表用 **`NES.CHR.DEMO.spr16`**（engine/chr.js 附的 8×16 配對版；QA P2-4 / X12
 *      修掉後每個 8×16 遊戲不必再自己 tile16() 重建一次）。`DEMO.spr` 是 8×8 切片，
 *      在 8×16 模式下 PPU 會把「偶數索引 + 下一格」當成上下半塊（engine/ppu.js `_sprLine`），
 *      直接用會取到隔壁磁磚。主角 16×24 = 上半塊 16×16 + 腳 16×8（下半塊留白）。
 *
 * 8×16 模式的 OAM tile 欄語意（engine/ppu.js）：`table = tile & 1`、`tidx = tile & 0xFE`。
 * 本 bank 綁在圖樣表 1，所以 OAM 要填 `index | 1`（`NES.CHR.DEMO.oam16(name)` 已經算好）。
 *
 * 調色盤（全部原創配色，色號皆為 NES 64 色索引，$0D 未使用）：
 *   backdrop $22 天空藍｜bg0 雲 / HUD 白字｜bg1 泥土｜bg2 磚 / 問號磚｜bg3 草地 / 草叢
 *   spr0 主角（黑描邊 / 紅衣 / 膚色）｜spr1 敵人「石頭蟲」（黑 / 深褐 / 米黃 $38 ← 測試用辨識色）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var DEMO = window.DEMO = window.DEMO || {};
  var CHR = NES.CHR;
  if (!CHR || !CHR.DEMO) throw new Error('games/demo/chr.js 需要 engine/chr.js（含 NES.CHR.DEMO）');
  var ART = CHR.DEMO;

  // ---- 8×16 精靈 bank（engine/chr.js 直接附，不再自己重建）-----------------
  var sprBank = ART.spr16;
  var oamTile = ART.oam16;                           // index(name) | 1（圖樣表 1 + 偶數上半塊）

  // ---- 背景磁磚索引（demo_bg bank）---------------------------------------
  var bg = ART.bg;
  var T = {
    SKY: bg.index('SKY'),
    GROUND_TOP: bg.index('GROUND_TOP'),
    GROUND: bg.index('GROUND'),
    BRICK: bg.index('BRICK'),
    QBLOCK: bg.index('QBLOCK'),
    BLOCK: bg.index('BLOCK'),
    CLOUD_L: bg.index('CLOUD_L'),
    CLOUD_R: bg.index('CLOUD_R'),
    BUSH: bg.index('BUSH')
  };

  // ---- 精靈 OAM tile 值 ---------------------------------------------------
  var S = {
    HERO_TOP_L: oamTile('HERO_TOP_L'),
    HERO_TOP_R: oamTile('HERO_TOP_R'),
    HERO_LEG_L: [oamTile('HERO_L0_L'), oamTile('HERO_L1_L'), oamTile('HERO_L2_L')],
    HERO_LEG_R: [oamTile('HERO_L0_R'), oamTile('HERO_L1_R'), oamTile('HERO_L2_R')],
    ENEMY_L: oamTile('ENEMY_L'),
    ENEMY_R: oamTile('ENEMY_R')
  };

  // ---- 調色盤 -------------------------------------------------------------
  var PAL = {
    backdrop: 0x22,                       // 天空藍
    bg: [
      [0x21, 0x11, 0x30],                 // 0：雲（描邊 / 深藍 / 白）+ HUD 白字（色 3）
      [0x07, 0x17, 0x27],                 // 1：泥土（深褐 / 橘褐 / 淺褐）
      [0x0F, 0x17, 0x28],                 // 2：磚 / 問號磚（黑 / 橘褐 / 金）
      [0x09, 0x1A, 0x2A]                  // 3：草地 / 草叢（深綠 / 綠 / 淺綠）
    ],
    spr: [
      [0x0F, 0x16, 0x27],                 // 0：主角（黑描邊 / 紅衣 / 膚色）
      [0x0F, 0x08, 0x38],                 // 1：敵人（黑 / 深褐 / 米黃 $38＝測試辨識色）
      [0x0F, 0x16, 0x30],                 // 2：備用（主角受傷閃白）
      [0x0F, 0x28, 0x30]                  // 3：備用
    ],
    ENEMY_MARK: 0x38                      // 測試用：畫面上只有敵人會出現這個色號
  };

  function applyPalettes(ppu) {
    ppu.setBackdrop(PAL.backdrop);
    for (var i = 0; i < 4; i++) {
      ppu.setBgPalette(i, PAL.bg[i]);
      ppu.setSprPalette(i, PAL.spr[i]);
    }
  }

  DEMO.CHR = {
    bgBank: bg,
    sprBank: sprBank,
    T: T,
    S: S,
    PAL: PAL,
    applyPalettes: applyPalettes,
    hero: { w: 16, h: 24 },
    enemy: { w: 16, h: 16 },
    walk: ART.hero.walk.slice(),          // [0,1,0,2]（研究 05 §4：NES 走路慣例 1→2→1→3）
    text: ART.text,                       // 字串 → demo_bg 磁磚索引
    setPatterns: function () {
      CHR.setPattern(0, bg);              // 背景：字型 + 地形
      CHR.setPattern(1, sprBank);         // 精靈：8×16 配對
    }
  };
})();
