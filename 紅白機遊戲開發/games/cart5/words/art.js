/*
 * games/cart5/words/art.js — 《星塵字謎 STAR WORDS》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/chr.js、typing/kbd.js（字型 + 鍵盤版面）
 *
 * 背景（words_bg）：
 *   N<碼>        白字（色 3；大寫 / 數字 / 標點 / 星環點符號）
 *   K<碼>        鍵面字（色 1 底 + 色 3 字）、KE<n> 鍵盤框線（kbd.js 依版面切出）
 *   C<字><0..3>  16×16 字格（2×2 磚 = 1 屬性區塊 ⇒ 每格自己的調色盤：一般 / 拉選中 / 已找到 / 提示）：
 *                色 1 = 格面 14×14、色 3 = 2 倍大字（10×14）、四周 1 px 黑縫
 *   EMPTY*       空格面、SLOT* 空槽（虛線框，重組字的答案位置）
 *   框線 / 星點 / 分隔線
 * 精靈（words_spr）：游標四角（鍵盤用 8×8、字格用同一組放在 16×16 四角）、錨點、回饋符號（★ 對位 / ◎ 在字裡 / · 不在）、
 *   閃光、回選單提示 DOT。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var WD = CT.Words = CT.Words || {};
  var CHR = NES.CHR;

  // 星塵探測的鍵盤：三排字母 + 最下排 退格 / 送出
  var KB_SPEC = {
    rows: [{ r: 20, c0: 6, keys: 'qwertyuiop' }, { r: 22, c0: 7, keys: 'asdfghjkl' }, { r: 24, c0: 8, keys: 'zxcvbnm' }],
    specials: [{ id: 'del', label: '<DEL', r: 26, c: 7, w: 4 }, { id: 'go', label: 'GO~', r: 26, c: 19, w: 4 }]
  };
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function rowsToTile(rows) {
    var t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var c = rows[y].charAt(x); t[y * 8 + x] = c === '.' ? 0 : +c; }
    return t;
  }
  function grid16() { var px = []; for (var y = 0; y < 16; y++) { px.push([]); for (var x = 0; x < 16; x++) px[y].push(0); } return px; }
  function slice16(px) {
    var out = [];
    for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  function cellFace(px) { for (var y = 1; y < 15; y++) for (var x = 1; x < 15; x++) px[y][x] = 1; return px; }
  function cellLetter(g) {
    var px = cellFace(grid16()), x, y;
    for (y = 0; y < 7; y++) for (x = 1; x < 6; x++) {
      if (!g || g[y].charAt(x) === '.') continue;
      var X = 3 + (x - 1) * 2, Y = 1 + y * 2;
      px[Y][X] = px[Y][X + 1] = px[Y + 1][X] = px[Y + 1][X + 1] = 3;
    }
    return px;
  }
  function cellSlot() {
    var px = grid16(), i;
    for (i = 2; i < 14; i += 2) { px[1][i] = 2; px[14][i] = 2; px[i][1] = 2; px[i][14] = 2; }
    for (i = 4; i < 12; i++) px[12][i] = 3;
    return px;
  }

  var made = null;
  function build() {
    var K = CT.Typing.Kbd, kb = K.create(KB_SPEC);
    var BG = {}, alias = {}, seen = {};
    function add(name, t) {
      if (typeof t[0] === 'string') t = rowsToTile(t);
      var k = Array.prototype.join.call(t, '');
      if (seen[k]) { alias[name] = seen[k]; return; }
      seen[k] = name; BG[name] = t;
    }
    add('SP', new Uint8Array(64));
    var P = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?\'/()+=*>%<#_~$^@`', i, s;
    for (i = 0; i < P.length; i++) add('N' + P.charCodeAt(i), K.glyphTile(P.charAt(i), 3, 0));
    kb.faceChars().forEach(function (c) { add('K' + c.charCodeAt(0), K.glyphTile(c, 3, 1)); });
    for (s in kb.edgeTiles) if (kb.edgeTiles.hasOwnProperty(s)) add(s, kb.edgeTiles[s]);
    for (i = 0; i < 26; i++) {
      var ch = LETTERS.charAt(i);
      slice16(cellLetter(K.glyph(ch))).forEach(function (t, j) { add('C' + ch + j, t); });
    }
    slice16(cellFace(grid16())).forEach(function (t, j) { add('EMPTY' + j, t); });
    slice16(cellSlot()).forEach(function (t, j) { add('SLOT' + j, t); });
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.2......', '........', '........', '........', '........', '......1.', '........']);
    add('HL', ['........', '........', '........', '22222222', '11111111', '........', '........', '........']);
    add('BOX_TL', ['........', '........', '........', '........', '....2222', '...21111', '...21...', '...21...']);
    add('BOX_TR', ['........', '........', '........', '........', '2222....', '11112...', '...12...', '...12...']);
    add('BOX_BL', ['...21...', '...21...', '...21111', '....2222', '........', '........', '........', '........']);
    add('BOX_BR', ['...12...', '...12...', '11112...', '2222....', '........', '........', '........', '........']);
    add('BOX_T', ['........', '........', '........', '........', '22222222', '11111111', '........', '........']);
    add('BOX_B', ['........', '........', '11111111', '22222222', '........', '........', '........', '........']);
    add('BOX_L', ['...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...']);
    add('BOX_R', ['...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...']);
    add('STRIKE', ['........', '........', '........', '22222222', '........', '........', '........', '........']);

    var SPR = {};
    SPR.SP = new Uint8Array(64);
    for (s in K.CORNERS) if (K.CORNERS.hasOwnProperty(s)) SPR[s] = rowsToTile(K.CORNERS[s]);
    // 回饋符號（每個佔一顆精靈，各用自己的調色盤）
    SPR.SYM_STAR = rowsToTile(['...3....', '...3....', '.33233..', '..3223..', '...32...', '..3..3..', '.3....3.', '........']);
    SPR.SYM_RING = rowsToTile(['..3333..', '.3....3.', '3..22..3', '3.2..2.3', '3.2..2.3', '3..22..3', '.3....3.', '..3333..']);
    SPR.SYM_DOT = rowsToTile(['........', '........', '........', '...33...', '...33...', '........', '........', '........']);
    SPR.ANCHOR = rowsToTile(['33....33', '3......3', '........', '........', '........', '........', '3......3', '33....33']);
    SPR.SPK0 = rowsToTile(['........', '...3....', '...3....', '.33233..', '...3....', '...3....', '........', '........']);
    SPR.SPK1 = rowsToTile(['3.....3.', '.3.2.3..', '..323...', '.32123..', '..323...', '.3.2.3..', '3.....3.', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);

    var bg = CHR.bank('words_bg', BG), spr = CHR.bank('words_spr', SPR);
    function T(n) { n = alias[n] || n; return bg.has(n) ? bg.index(n) : 0; }
    made = {
      bg: bg, spr: spr, kb: kb, t: T, count: Object.keys(BG).length,
      s: function (n) { return spr.index(n); },
      ch: function (c) { if (c === '★') c = '$'; if (c === ' ') return 0; if (c >= 'a' && c <= 'z') c = c.toUpperCase(); return T('N' + c.charCodeAt(0)); },
      key: function (c) { return T('K' + c.charCodeAt(0)); },
      cell: function (ch) { var out = []; for (var j = 0; j < 4; j++) out.push(T(ch ? 'C' + ch.toUpperCase() + j : 'EMPTY' + j)); return out; },
      slot: function () { return [T('SLOT0'), T('SLOT1'), T('SLOT2'), T('SLOT3')]; }
    };
    return made;
  }
  WD.Art = { make: function () { return made || build(); }, KB_SPEC: KB_SPEC };
})();
