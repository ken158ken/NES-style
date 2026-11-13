/*
 * games/cart3/slide/art.js — 《星塵拼圖 STAR SLIDE》CHR bank 規劃
 * ---------------------------------------------------------------------------
 * 擁有者：C7-3 cart3-slide（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）、slide/pics.js
 *
 * **每張圖一個背景 bank**（`slide_pic0..5`，換圖 = 換 CHR bank，像 MMC 的 CHR 切換）：
 *   [0] 全空 → [1..U] 共用 UI（字型、框線、空格花紋；每個 bank 的 UI 索引都一樣）→ [U+1..] 該圖去重 / 合併後的磁磚（≤ 256 − U）。
 * 精靈 bank `slide_spr`：游標四角（一般 / 選取）、旋轉箭頭、閃光、回選單提示點。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SL = CT.Slide = CT.Slide || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  var UI = { Z: new Uint8Array(64) }, FONTN = {};
  var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()^\'';
  for (var i = 0; i < USED.length; i++) {
    var n = CHARMAP[USED.charAt(i)];
    if (n && FONT[n] && !FONTN[n]) { FONTN[n] = 'F_' + n; UI['F_' + n] = FONT[n]; }
  }
  UI.FH = ['........', '........', '........', '33333333', '11111111', '........', '........', '........'];
  UI.FV = ['...31...', '...31...', '...31...', '...31...', '...31...', '...31...', '...31...', '...31...'];
  UI.FC = ['........', '...3....', '..323...', '.32223..', '..323...', '...3....', '........', '........'];
  UI.SLOT = ['1.......', '........', '........', '........', '....1...', '........', '........', '........'];
  UI.LT = ['....3...', '...33...', '..333...', '.3333...', '..333...', '...33...', '....3...', '........'];
  UI.RT = ['..3.....', '..33....', '..333...', '..3333..', '..333...', '..33....', '..3.....', '........'];
  var UI_COUNT = Object.keys(UI).length;
  var PIC_BUDGET = 256 - UI_COUNT;

  var SPR = {
    BLANK: ['........', '........', '........', '........', '........', '........', '........', '........'],
    TL: ['3333....', '3222....', '32......', '32......', '........', '........', '........', '........'],
    TR: ['....3333', '....2223', '......23', '......23', '........', '........', '........', '........'],
    BL: ['........', '........', '........', '........', '32......', '32......', '3222....', '3333....'],
    BR: ['........', '........', '........', '........', '......23', '......23', '....2223', '....3333'],
    STAR: ['...3....', '...3....', '..323...', '3322233.', '..323...', '...3....', '...3....', '........'],
    SPARK: ['........', '...3....', '........', '.3.2.3..', '........', '...3....', '........', '........'],
    ARR: ['...3....', '....3...', '33333...', '....3...', '...3....', '........', '........', '........'],
    ROT: ['..333...', '.3...3..', '3.....3.', '3.....3.', '3...333.', '.3...3..', '..3.....', '........'],
    DOT: ['........', '..33....', '.3333...', '.3333...', '..33....', '........', '........', '........']
  };

  var sprBank = null, picBanks = {};
  function ensureSpr() { if (!sprBank) sprBank = CHR.bank('slide_spr', SPR); return sprBank; }
  function picBank(i) {
    if (picBanks[i]) return picBanks[i];
    var P = SL.Pics.make(i, PIC_BUDGET), obj = {}, k;
    Object.keys(UI).forEach(function (nm) { obj[nm] = UI[nm]; });
    for (k = 0; k < P.tiles.length; k++) obj['P' + k] = P.tiles[k];
    var b = CHR.bank('slide_pic' + i, obj);
    var base = b.index('P0');
    picBanks[i] = { bank: b, pic: P, base: base, name: 'slide_pic' + i };
    return picBanks[i];
  }
  var made = null;
  SL.Art = {
    UI_COUNT: UI_COUNT, PIC_BUDGET: PIC_BUDGET,
    pic: picBank,
    make: function () {
      if (made) return made;
      var b0 = picBank(0).bank, spr = ensureSpr();
      made = {
        spr: spr,
        t: function (nm) { return b0.index(nm); },          // UI 磁磚：每個 bank 索引相同
        s: function (nm) { return spr.index(nm); },
        ch: function (c) {
          if (c === '★') c = '$';
          if (c === ' ') return 0;
          var nm = CHARMAP[c];
          if (nm === undefined && c >= 'a' && c <= 'z') nm = CHARMAP[c.toUpperCase()];
          return (nm && FONTN[nm]) ? b0.index(FONTN[nm]) : 0;
        },
        text: function (s) { var o = []; for (var j = 0; j < s.length; j++) o.push(made.ch(s.charAt(j))); return o; }
      };
      return made;
    }
  };
})();
