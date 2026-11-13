/*
 * games/cart5/typing/art.js — 《星塵打字 STAR TYPER》CHR（全部原創，程式化點陣）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/chr.js、typing/kbd.js（字型 + 鍵盤版面）、typing/dict.js
 *
 * 背景（typing_bg）：N<碼> 白字（色 3）/ D<碼> 已打過的暗字（色 2，只收句子與小寫用得到的字）/
 *   K<碼> 鍵面字（色 1 底 + 色 3 字）/ KE<n> 鍵盤框線（由 kbd.js 依版面切出）/ 星點 / 分隔線 / 基地 / 標題大字 BIG_*。
 * 精靈（typing_spr）：游標四角、隕石（兩幀火焰）、雷射、爆炸、插入點、回選單提示 DOT。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TY = CT.Typing = CT.Typing || {};
  var CHR = NES.CHR;

  // 鍵盤版面（typing 版：最下排 大小寫 / 空白 / 退格）
  var KB_SPEC = {
    rows: [{ r: 20, c0: 6, keys: 'qwertyuiop' }, { r: 22, c0: 7, keys: 'asdfghjkl' }, { r: 24, c0: 8, keys: 'zxcvbnm,.' }],
    specials: [{ id: 'shift', label: '#aA', r: 26, c: 5, w: 3 }, { id: 'space', label: 'SPACE', r: 26, c: 10, w: 9 }, { id: 'del', label: '<DEL', r: 26, c: 21, w: 4 }]
  };

  function rowsToTile(rows) {
    var t = new Uint8Array(64);
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var c = rows[y].charAt(x); t[y * 8 + x] = c === '.' ? 0 : +c; }
    return t;
  }
  function slice(px) {
    var h = px.length, w = px[0].length, out = [];
    for (var ty = 0; ty < h / 8; ty++) for (var tx = 0; tx < w / 8; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  // 標題大字：8×8 字放大 2 倍 + 右下陰影（色 1），上 3 列亮色 3、其餘色 2
  function bigGlyph(g) {
    var px = [], i, j, dx, dy, X, Y;
    for (j = 0; j < 16; j++) { px.push([]); for (i = 0; i < 16; i++) px[j].push(0); }
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

  var made = null;
  function build() {
    var K = TY.Kbd, D = TY.DICT, kb = K.create(KB_SPEC);
    var BG = {}, alias = {}, seen = {};
    function add(name, t) {
      if (typeof t[0] === 'string') t = rowsToTile(t);
      var k = Array.prototype.join.call(t, '');
      if (seen[k]) { alias[name] = seen[k]; return; }
      seen[k] = name; BG[name] = t;
    }
    add('SP', new Uint8Array(64));
    var P = K.PRINTABLE, i;
    for (i = 0; i < P.length; i++) add('N' + P.charCodeAt(i), K.glyphTile(P.charAt(i), 3, 0));
    var dim = {}, s;
    'abcdefghijklmnopqrstuvwxyz,.\''.split('').forEach(function (c) { dim[c] = 1; });
    D.SENTENCES.forEach(function (tier) { tier.forEach(function (st) { for (var j = 0; j < st.length; j++) dim[st.charAt(j)] = 1; }); });
    for (s in dim) if (dim.hasOwnProperty(s)) add('D' + s.charCodeAt(0), K.glyphTile(s, 2, 0));
    kb.faceChars().forEach(function (c) { add('K' + c.charCodeAt(0), K.glyphTile(c, 3, 1)); });
    for (s in kb.edgeTiles) if (kb.edgeTiles.hasOwnProperty(s)) add(s, kb.edgeTiles[s]);
    add('ST1', ['........', '........', '........', '....1...', '........', '........', '........', '........']);
    add('ST2', ['........', '.2......', '........', '........', '........', '........', '......1.', '........']);
    add('HL', ['........', '........', '........', '22222222', '11111111', '........', '........', '........']);
    // 基地（調色盤 3：暗 / 中 / 亮）：地面帶 + 中央圓頂 + 砲台
    add('GR', ['33333333', '22222222', '21222122', '22212221', '12221222', '22122212', '22222222', '11111111']);
    add('DM_L', ['........', '........', '.....333', '...33222', '..322222', '.3222122', '32221222', '32222222']);
    add('DM_M', ['...33...', '...33...', '33333333', '22222222', '22122122', '22222222', '21222212', '22222222']);
    add('DM_R', ['........', '........', '333.....', '22233...', '222223..', '2212223.', '22212223', '22222223']);
    add('BOX_TL', ['........', '........', '........', '........', '....2222', '...21111', '...21...', '...21...']);
    add('BOX_TR', ['........', '........', '........', '........', '2222....', '11112...', '...12...', '...12...']);
    add('BOX_BL', ['...21...', '...21...', '...21111', '....2222', '........', '........', '........', '........']);
    add('BOX_BR', ['...12...', '...12...', '11112...', '2222....', '........', '........', '........', '........']);
    add('BOX_T', ['........', '........', '........', '........', '22222222', '11111111', '........', '........']);
    add('BOX_B', ['........', '........', '11111111', '22222222', '........', '........', '........', '........']);
    add('BOX_L', ['...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...']);
    add('BOX_R', ['...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...', '...12...']);
    var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {}, MAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};
    'STARYPE'.split('').forEach(function (ch) { slice(bigGlyph(FONT[MAP[ch]])).forEach(function (t, j) { add('BIG_' + ch + j, t); }); });

    var SPR = {};
    SPR.SP = new Uint8Array(64);
    for (s in K.CORNERS) if (K.CORNERS.hasOwnProperty(s)) SPR[s] = rowsToTile(K.CORNERS[s]);
    // 隕石（色 1 暗紅 / 2 橘 / 3 黃）：岩塊 + 往上拖的火焰，兩幀交替
    SPR.MT0 = rowsToTile(['..2.3...', '.2.3.2..', '..3332..', '.122221.', '12212221', '12221121', '.122221.', '..1111..']);
    SPR.MT1 = rowsToTile(['.3..2...', '..32.3..', '.23332..', '.122221.', '12221221', '12122221', '.122221.', '..1111..']);
    SPR.LZ = rowsToTile(['...23...', '...33...', '...23...', '...33...', '...23...', '...33...', '...23...', '...33...']);
    SPR.EX0 = rowsToTile(['........', '..3..3..', '...33...', '.333333.', '...33...', '..3..3..', '........', '........']);
    SPR.EX1 = rowsToTile(['3.....3.', '.2.3.2..', '..2.2...', '.3.1.3..', '..2.2...', '.2.3.2..', '3.....3.', '........']);
    SPR.CR = rowsToTile(['........', '........', '........', '........', '........', '........', '........', '3333333.']);
    SPR.HIT = rowsToTile(['2..3..2.', '.2.3.2..', '..333...', '3333333.', '..333...', '.2.3.2..', '2..3..2.', '........']);
    SPR.DOT = rowsToTile(['...3....', '..333...', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........']);

    var bg = CHR.bank('typing_bg', BG), spr = CHR.bank('typing_spr', SPR);
    function T(n) { n = alias[n] || n; return bg.has(n) ? bg.index(n) : 0; }
    made = {
      bg: bg, spr: spr, kb: kb, t: T, count: Object.keys(BG).length,
      s: function (n) { return spr.index(n); },
      ch: function (c) { if (c === '★') c = '$'; return c === ' ' ? 0 : T('N' + c.charCodeAt(0)); },
      dim: function (c) { return c === ' ' ? 0 : T('D' + c.charCodeAt(0)); },
      key: function (c) { return T('K' + c.charCodeAt(0)); }
    };
    return made;
  }
  TY.Art = { make: function () { return made || build(); }, KB_SPEC: KB_SPEC };
})();
