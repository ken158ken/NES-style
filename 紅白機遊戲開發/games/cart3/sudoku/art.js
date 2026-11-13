/*
 * games/cart3/sudoku/art.js — 《星塵數獨 STAR SUDOKU》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-1 cart3-number（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 盤面一格 = 2×2 磚（16×16，剛好一個屬性區塊 ⇒ 每格自己的調色盤：宮的深淺交錯 / 同數字高亮 / 錯誤紅底）。
 *   格子底 = 色 1（15×15），右 / 下 1 px = 色 0（黑格線）；提示數字 = 色 3（白）、玩家填的 = 色 2（黃）。
 * 背景磚（sudoku_bg）：
 *   D{0,1}{d}_{0..3}  數字 d（0 = 題目提示字、1 = 玩家字），8×8 字身放大 2 倍置中
 *   EC_{0..3}         空格
 *   NA_{m}(m=0..15) / NB_{m}(0..3) / NC_{m}(0..3) / ND_{m}(0..1)  筆記小點（3×3 九宮位置 = 1..9，像手機鍵盤）：
 *                     左上磚管 1 2 4 5、右上 3 6、左下 7 8、右下 9 ⇒ 26 磚涵蓋全部 512 種組合
 *   PX_{0..3} / PQ_{0..3}  選字列的「清除」「提示」鍵；框 FR_*、星點、箭頭、大字 BIG_*、星等 SR0/SR1
 * 精靈（sudoku_spr）：游標四角 CTL/CTR/CBL/CBR、閃光 SPK0/SPK1、回選單提示 DOT。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SU = CT.Sudoku = CT.Sudoku || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function canvas(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(0); } return a; }
  function slice(px) {
    var h = px.length, w = px[0].length, out = [];
    for (var ty = 0; ty < h / 8; ty++) for (var tx = 0; tx < w / 8; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  function rowsToTile(rows) {
    var t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var c = rows[y].charAt(x); t[y * 8 + x] = c === '.' ? 0 : +c; }
    return t;
  }
  function cellBase() {      // 16×16：色 1 底 + 右 / 下黑線
    var px = canvas(16, 16);
    for (var y = 0; y < 15; y++) for (var x = 0; x < 15; x++) px[y][x] = 1;
    return px;
  }
  function digitCell(glyph, color) {
    var px = cellBase(), x, y, dx, dy;
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      if (!glyph || glyph[y].charAt(x) === '.') continue;
      for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
        var X = x * 2 + dx + 1, Y = y * 2 + dy + 1;
        if (X < 15 && Y < 15) px[Y][X] = color;
      }
    }
    return px;
  }
  // 筆記小點：九宮位置 (k-1)%3 欄、(k-1)/3 列，點 = 2×2，左上角在 (2 + 4c, 2 + 4r)
  function noteCell(mask) {
    var px = cellBase();
    for (var k = 1; k <= 9; k++) {
      if (!(mask & (1 << (k - 1)))) continue;
      var c = (k - 1) % 3, r = ((k - 1) / 3) | 0, x0 = 2 + 4 * c, y0 = 2 + 4 * r;
      px[y0][x0] = 2; px[y0][x0 + 1] = 2; px[y0 + 1][x0] = 2; px[y0 + 1][x0 + 1] = 2;
    }
    return px;
  }
  function bigGlyph(g) {
    var px = canvas(16, 16), i, j, dx, dy, X, Y;
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (!g || g[j].charAt(i) === '.') continue;
      for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
        X = i * 2 + dx - 1; Y = j * 2 + dy;
        if (Y + 1 < 16 && X + 1 < 16 && X + 1 >= 0 && px[Y + 1][X + 1] === 0) px[Y + 1][X + 1] = 1;
        if (X >= 0) px[Y][X] = j < 3 ? 3 : 2;
      }
    }
    return px;
  }

  // 筆記磚的「象限 → 管哪些數字」：回傳該象限的遮罩編號（給 main.js 用）
  var QUAD = [[1, 2, 4, 5], [3, 6], [7, 8], [9]];
  function quadMask(notes, q) {
    var m = 0, L = QUAD[q];
    for (var i = 0; i < L.length; i++) if (notes & (1 << (L[i] - 1))) m |= 1 << i;
    return m;
  }

  var made = null;
  function build() {
    var BG = {}, alias = {}, seen = {};
    function key(t) { return Array.prototype.join.call(t, ''); }
    function add(name, t) {
      if (typeof t[0] === 'string') t = rowsToTile(t);
      var k = key(t);
      if (seen[k]) { alias[name] = seen[k]; return; }
      seen[k] = name; BG[name] = t;
    }
    add('SP', new Uint8Array(64));
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n]) add('F_' + n, FONT[n]);
    }
    var d, s;
    for (s = 0; s < 2; s++) for (d = 1; d <= 9; d++) slice(digitCell(FONT['N' + d], s ? 2 : 3)).forEach(function (t, j) { add('D' + s + d + '_' + j, t); });
    slice(cellBase()).forEach(function (t, j) { add('EC_' + j, t); });
    slice(digitCell(FONT.X, 2)).forEach(function (t, j) { add('PX_' + j, t); });
    slice(digitCell(FONT.QUEST, 3)).forEach(function (t, j) { add('PQ_' + j, t); });
    // 筆記：四個象限各自窮舉
    var q, m;
    for (q = 0; q < 4; q++) {
      for (m = 0; m < (1 << QUAD[q].length); m++) {
        var notes = 0;
        for (var b = 0; b < QUAD[q].length; b++) if (m & (1 << b)) notes |= 1 << (QUAD[q][b] - 1);
        add('N' + 'ABCD'.charAt(q) + m, slice(noteCell(notes))[q]);
      }
    }
    add('FR_TL', ['........', '........', '........', '........', '........', '........', '......33', '......31']);
    add('FR_TR', ['........', '........', '........', '........', '........', '........', '33......', '13......']);
    add('FR_BL', ['......31', '......33', '........', '........', '........', '........', '........', '........']);
    add('FR_BR', ['13......', '33......', '........', '........', '........', '........', '........', '........']);
    add('FR_T', ['........', '........', '........', '........', '........', '........', '33333333', '11111111']);
    add('FR_B', ['11111111', '33333333', '........', '........', '........', '........', '........', '........']);
    add('FR_L', ['......31', '......31', '......31', '......31', '......31', '......31', '......31', '......31']);
    add('FR_R', ['13......', '13......', '13......', '13......', '13......', '13......', '13......', '13......']);
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.3......', '........', '........', '........', '........', '......1.', '........']);
    add('AL', ['........', '....3...', '...33...', '..333...', '...33...', '....3...', '........', '........']);
    add('AR', ['........', '..3.....', '..33....', '..333...', '..33....', '..3.....', '........', '........']);
    add('SR1', ['...3....', '...3....', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    add('SR0', ['...1....', '...1....', '1111111.', '.1...1..', '..1.1...', '.11.11..', '.1...1..', '........']);
    'SUDOK'.split('').forEach(function (ch) { slice(bigGlyph(FONT[CHARMAP[ch]])).forEach(function (t, j) { add('BIG_' + ch + j, t); }); });

    var SPR = {};
    SPR.SP = rowsToTile(['........', '........', '........', '........', '........', '........', '........', '........']);
    SPR.CTL = rowsToTile(['333333..', '322222..', '32......', '32......', '32......', '........', '........', '........']);
    SPR.CTR = rowsToTile(['..333333', '..222223', '......23', '......23', '......23', '........', '........', '........']);
    SPR.CBL = rowsToTile(['........', '........', '........', '32......', '32......', '32......', '322222..', '333333..']);
    SPR.CBR = rowsToTile(['........', '........', '........', '......23', '......23', '......23', '..222223', '..333333']);
    SPR.SPK0 = rowsToTile(['........', '...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........']);
    SPR.SPK1 = rowsToTile(['3.....3.', '.3.3.3..', '..323...', '.32123..', '..323...', '.3.3.3..', '3.....3.', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);

    var bg = CHR.bank('sudoku_bg', BG), spr = CHR.bank('sudoku_spr', SPR);
    function T(n) { return bg.index(alias[n] || n); }
    made = {
      bg: bg, spr: spr, alias: alias, t: T,
      s: function (n) { return spr.index(n); },
      ch: function (c) {
        if (c === '★') c = '$';
        if (c === ' ') return 0;
        var n = CHARMAP[c];
        if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
        if (!n) return 0;
        var nm = 'F_' + n;
        return (bg.has(nm) || alias[nm]) ? T(nm) : 0;
      },
      // 一格的 4 磚：kind = {v, given} / {notes} / 空
      cellTiles: function (v, given, notes) {
        var out = [], j;
        if (v) { for (j = 0; j < 4; j++) out.push(T('D' + (given ? 0 : 1) + v + '_' + j)); return out; }
        if (notes) { for (j = 0; j < 4; j++) out.push(T('N' + 'ABCD'.charAt(j) + quadMask(notes, j))); return out; }
        for (j = 0; j < 4; j++) out.push(T('EC_' + j));
        return out;
      }
    };
    return made;
  }
  SU.Art = { make: function () { return made || build(); }, QUAD: QUAD, quadMask: quadMask };
})();
