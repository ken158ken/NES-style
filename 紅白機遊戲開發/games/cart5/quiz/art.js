/*
 * games/cart5/quiz/art.js — 《星塵問答》CHR（原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-5 cart5-quiz（R9）｜ 依賴：engine/chr.js、games/cart5/glyphs.js（借 CT.GLYPHS.ascii 的原創 8×8 半形字做 HUD 字型）、
 *         games/cart5/text.js（CT.Text.reserve：框線 12 磚 + 字形池）。
 *
 * 背景 quiz_bg：SP 空白 / F<碼> HUD 8×8 字（色 3）/ BAR0..8 時間條（色 2 填滿、色 1 外框）/ STAR 難度星 / STAR0 空星 /
 *               HEART / HEART0 生命 / DOT 星點 / TX_* 文字系統（框線 + 字形池 POOL 磚）。
 * 精靈 quiz_spr：CUR 游標 ▶ / CURL ◀ / OK 圓圈 / NG 叉叉 / CPU 電腦標記 / CARET 輸入插入點 / BACK 回選單提示。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var QZ = CT.Quiz = CT.Quiz || {};

  var HUD_CHARS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:/-+!.=?%';
  var POOL = 176;

  function rowsToTile(rows) {
    var t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var c = rows[y].charAt(x); t[y * 8 + x] = c === '.' ? 0 : +c; }
    return t;
  }
  function glyphTile(ch, fg) {
    var G = (CT.GLYPHS && CT.GLYPHS.ascii) || {}, h = G[ch] || '0000000000000000', t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) {
      var b = parseInt(h.substr(y * 2, 2), 16) | 0;
      for (var x = 0; x < 8; x++) t[y * 8 + x] = (b >> (7 - x)) & 1 ? fg : 0;
    }
    return t;
  }
  function barTile(n) {          // n = 0..8 填滿欄數
    var rows = [];
    for (var y = 0; y < 8; y++) {
      var r = '';
      for (var x = 0; x < 8; x++) {
        if (y === 1 || y === 6) r += '1';
        else if (y >= 2 && y <= 5) r += x < n ? '2' : '.';
        else r += '.';
      }
      rows.push(r);
    }
    return rowsToTile(rows);
  }

  var made = null;
  function build() {
    var BG = {}, i;
    BG.SP = new Uint8Array(64);
    for (i = 1; i < HUD_CHARS.length; i++) BG['F' + HUD_CHARS.charCodeAt(i)] = glyphTile(HUD_CHARS.charAt(i), 3);
    for (i = 0; i <= 8; i++) BG['BAR' + i] = barTile(i);
    BG.STAR = rowsToTile(['...3....', '...3....', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    BG.STAR0 = rowsToTile(['...1....', '...1....', '111.111.', '.1...1..', '..1.1...', '.11.11..', '.1...1..', '........']);
    BG.HEART = rowsToTile(['........', '.22.22..', '2332222.', '2322222.', '.22222..', '..222...', '...2....', '........']);
    BG.HEART0 = rowsToTile(['........', '.11.11..', '1..1..1.', '1.....1.', '.1...1..', '..1.1...', '...1....', '........']);
    BG.DOT = rowsToTile(['........', '........', '........', '...1....', '........', '........', '........', '........']);
    BG.DOT2 = rowsToTile(['........', '..2.....', '.232....', '..2.....', '........', '........', '........', '........']);
    BG.LARR = rowsToTile(['....2...', '...22...', '..222...', '.2222...', '..222...', '...22...', '....2...', '........']);
    BG.RARR = rowsToTile(['..2.....', '..22....', '..222...', '..2222..', '..222...', '..22....', '..2.....', '........']);
    var own = Object.keys(BG).length;
    CT.Text.reserve(BG, POOL);
    var bg = NES.CHR.bank('quiz_bg', BG);

    var SPR = {};
    SPR.SP = new Uint8Array(64);
    SPR.CUR = rowsToTile(['.3......', '.33.....', '.323....', '.3223...', '.323....', '.33.....', '.3......', '........']);
    SPR.CURL = rowsToTile(['......3.', '.....33.', '....323.', '...3223.', '....323.', '.....33.', '......3.', '........']);
    SPR.OK = rowsToTile(['..3333..', '.32..23.', '32....23', '3......3', '3......3', '32....23', '.32..23.', '..3333..']);
    SPR.NG = rowsToTile(['33....33', '333..333', '.333333.', '..3333..', '..3333..', '.333333.', '333..333', '33....33']);
    SPR.CPU = rowsToTile(['.333333.', '31111113', '31311313', '31111113', '31333313', '31111113', '.333333.', '..3..3..']);
    SPR.CARET = rowsToTile(['........', '........', '........', '........', '........', '........', '33333333', '33333333']);
    SPR.BACK = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    var spr = NES.CHR.bank('quiz_spr', SPR);

    made = {
      bg: bg, spr: spr, own: own, pool: POOL, tiles: own + CT.Text.reserve.frameTiles + POOL,
      t: function (n) { return bg.has(n) ? bg.index(n) : 0; },
      s: function (n) { return spr.index(n); },
      ch: function (c) { c = String(c).toUpperCase(); return c === ' ' ? 0 : (bg.has('F' + c.charCodeAt(0)) ? bg.index('F' + c.charCodeAt(0)) : 0); },
      HUD_CHARS: HUD_CHARS
    };
    return made;
  }
  QZ.Art = { make: function () { return made || build(); }, POOL: POOL, HUD_CHARS: HUD_CHARS };
})();
