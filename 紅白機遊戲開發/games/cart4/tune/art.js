/*
 * games/cart4/tune/art.js — 《星塵旋律 STAR MELODY》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 鍵盤不是鋼琴黑白鍵：是一排從星軌上垂下的 8 根「星鐘管」（風鈴 / 鐘琴管，越低音越長），管底掛一顆小星；
 * 每根 16 px 寬 = 1 個屬性區塊寬 ⇒ 亮燈 = 把那根管子的屬性區塊改成「亮」調色盤（每次 5 byte）。
 * 背景磚（tune_bg）：字型 F_*、管子 KT_L/R（頂）KB_L/R（身）KE_L/R（底 + 星）、星軌 RAIL、
 *   時間軸 NH（音頭）NL（延音線）NX（錯）NQ（?）DOT8（節奏點）、小箭頭 AU/AD/AL/AR、大字 BIG_*、星點 ST1/ST2、愛心用字型 ^。
 * 精靈（tune_spr）：NOTE ♪（亮鍵上方飄起）、MK1/MK2 聽音辨高低的兩顆音標、CUR 游標、DOT 回選單提示。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TN = CT.Tune = CT.Tune || {};
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
  // 管子 16×8 的一段：kind 'top'（掛環 + 管口）/ 'body'（圓管：1 邊 2 身 3 高光）/ 'end'（管底收圓 + 小星）
  function tube(kind) {
    var px = canvas(16, 8), x, y;
    for (y = 0; y < 8; y++) for (x = 0; x < 16; x++) {
      var inTube = x >= 2 && x <= 13, c = 0;
      if (kind === 'top') {
        if (y <= 2) { if ((x === 7 || x === 8) && y <= 2) c = 1; }       // 吊繩
        else if (y === 3) { if (x >= 3 && x <= 12) c = 1; }               // 管口
        else if (inTube) c = (x === 2 || x === 13) ? 1 : (x === 4 || x === 5 ? 3 : 2);
        if (y === 4 && inTube && x > 2 && x < 13) c = 3;                  // 管口反光
      } else if (kind === 'body') {
        if (inTube) c = (x === 2 || x === 13) ? 1 : (x === 4 || x === 5 ? 3 : 2);
      } else {
        if (y <= 2 && inTube) c = (x === 2 || x === 13) ? 1 : (x === 4 || x === 5 ? 3 : 2);
        else if (y === 3 && x >= 3 && x <= 12) c = 1;
        // 小星（管底掛飾）
        var sx = x - 7.5, sy = y - 6;
        if (y >= 4 && Math.abs(sx) + Math.abs(sy) * 1.6 <= 2.6) c = 3;
      }
      px[y][x] = c;
    }
    return px;
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
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()\'^';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n]) add('F_' + n, FONT[n]);
    }
    ['top', 'body', 'end'].forEach(function (k, j) {
      var t = slice(tube(k)), nmm = ['KT', 'KB', 'KE'][j];
      add(nmm + '_L', t[0]); add(nmm + '_R', t[1]);
    });
    add('RAIL', ['........', '........', '........', '11111111', '22222222', '11111111', '........', '........']);
    add('NH', ['........', '..222...', '.23332..', '.23332..', '.23332..', '..222...', '........', '........']);
    add('NL', ['........', '........', '........', '22222222', '22222222', '........', '........', '........']);
    add('NX', ['........', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '........', '........']);
    add('NQ', ['........', '..111...', '.1...1..', '....1...', '...1....', '........', '...1....', '........']);
    add('DOT8', ['........', '........', '...3....', '..333...', '...3....', '........', '........', '........']);
    add('GRID', ['........', '........', '........', '........', '1.......', '........', '........', '........']);
    add('AU', ['...3....', '..333...', '.33333..', '...3....', '...3....', '...3....', '........', '........']);
    add('AD', ['...3....', '...3....', '...3....', '.33333..', '..333...', '...3....', '........', '........']);
    add('AL', ['........', '..3.....', '.33.....', '3333333.', '.33.....', '..3.....', '........', '........']);
    add('AR', ['........', '....3...', '....33..', '3333333.', '....33..', '....3...', '........', '........']);
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.3......', '........', '........', '........', '........', '......1.', '........']);
    add('BAR', ['........', '........', '33333333', '3......3', '3......3', '33333333', '........', '........']);
    add('BARF', ['........', '........', '33333333', '33333333', '33333333', '33333333', '........', '........']);
    'MELODYSTAR'.split('').forEach(function (ch) { slice(bigGlyph(FONT[CHARMAP[ch]])).forEach(function (t, jj) { add('BIG_' + ch + jj, t); }); });

    var SPR = {};
    SPR.SP = new Uint8Array(64);
    SPR.NOTE = rowsToTile(['....33..', '....3.3.', '....3..3', '....3...', '..333...', '.3333...', '.333....', '........']);
    SPR.MK1 = rowsToTile(['........', '.3333...', '322223..', '321123..', '322223..', '.3333...', '........', '........']);
    SPR.MK2 = rowsToTile(['...3....', '..323...', '.32123..', '3211123.', '.32123..', '..323...', '...3....', '........']);
    SPR.CUR = rowsToTile(['...3....', '..333...', '.33333..', '3333333.', '........', '........', '........', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);
    SPR.LINE = rowsToTile(['........', '........', '........', '22222222', '........', '........', '........', '........']);

    var bg = CHR.bank('tune_bg', BG), spr = CHR.bank('tune_spr', SPR);
    function T(nmm) { var a = alias[nmm] || nmm; return bg.index(a); }
    made = {
      bg: bg, spr: spr, alias: alias, t: T,
      s: function (nmm) { return spr.index(nmm); },
      ch: function (c) {
        if (c === '★') c = '$';
        if (c === ' ') return 0;
        var nn = CHARMAP[c];
        if (nn === undefined && c >= 'a' && c <= 'z') nn = CHARMAP[c.toUpperCase()];
        if (!nn) return 0;
        var nmm = 'F_' + nn;
        return (bg.has(nmm) || alias[nmm]) ? T(nmm) : 0;
      }
    };
    return made;
  }
  TN.Art = { make: function () { return made || build(); } };
})();
