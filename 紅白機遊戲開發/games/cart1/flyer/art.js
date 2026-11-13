/*
 * games/cart1/flyer/art.js — 《星塵飛燕 STAR SWALLOW》CHR（全部原創手繪 / 程式化）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：engine/chr.js（NES.CHR，字身沿用原創 DEMO.FONT）
 *
 * 主角「琉璃」：一隻頭頂星冠、燕尾分叉的藍色星燕（16×16，3 個振翅影格）。
 * 障礙：浮空石柱（上下一對，中間留縫；柱緣 4 px 精度 ⇒ 移動縫每步 4 px）。
 * 背景磚（flyer_bg）：
 *   P_L/M/R            柱身三欄（左右有描邊）
 *   P_T8/T4 _L/M/R     上柱下緣（緣在磚底 / 磚中）     P_B0/B4 _L/M/R  下柱上緣（緣在磚頂 / 磚中）
 *   G_TOP / G_A / G_B  地面（草緣 / 土兩種）
 *   D_*                裝飾：雲（左右兩半 + 小雲）、晶石、星點
 *   F_*                字型（透明底，標題用）、H_*  字型（實心底，狀態列用）、HB 狀態列底、BIG_* 標題大字
 * 精靈（flyer_spr）：BIRD{0,1,2}_{0..3}（16×16 = 4 磚）、STAR、STREAK、SHIELD、MEDAL_{0..3}
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var FY = CT.Flyer = CT.Flyer || {};
  var CHR = NES.CHR;

  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = { ' ': 'SP', '-': 'DASH', '!': 'EXCL', '/': 'SLASH', '+': 'PLUS', 'x': 'MUL', ':': 'COLON', '$': 'STAR', '.': 'DOT' };
  (function () {
    var i;
    for (i = 0; i <= 9; i++) CHARMAP[String(i)] = 'N' + i;
    for (i = 65; i <= 90; i++) CHARMAP[String.fromCharCode(i)] = String.fromCharCode(i);
  })();
  var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-!/+x:$.';

  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  function fill(c) { var r = '', i; for (i = 0; i < 8; i++) r += c; var o = []; for (i = 0; i < 8; i++) o.push(r); return o; }

  /* ---------------- 柱 ---------------- */
  // 浮空石柱：磚石紋（1 = 灰縫 / 描邊，2 = 石面，3 = 亮面），縫口是參差的岩牙（不是管口）
  var BODY = {
    L: ['13332133', '12222122', '12222122', '11111111', '13213333', '12212222', '12212222', '11111111'],
    M: ['33321333', '22221222', '22221222', '11111111', '33133332', '22122221', '22122221', '11111111'],
    R: ['33213331', '22212221', '22212221', '11111111', '33332131', '22221221', '22221221', '11111111']
  };
  function edgeCol(k, rows) {               // 左右描邊（只在非透明處）
    return rows.map(function (r) {
      if (k === 'L' && r.charAt(0) !== '.') return '1' + r.substring(1);
      if (k === 'R' && r.charAt(7) !== '.') return r.substring(0, 7) + '1';
      return r;
    });
  }
  var LIP = {   // 上柱下緣（岩牙朝下）/ 下柱上緣（岩牙朝上），每欄錯開
    TL: ['12212221', '1.2121.1', '.1..12..', '....1...'], TM: ['22122212', '12.12.21', '.1..1..1', '....1...'], TR: ['21222121', '1.212.21', '..21..1.', '..1.....'],
    BL: ['...1....', '..31..3.', '13.133.1', '13313333'], BM: ['....1...', '.3..31..', '313.13.3', '33133133'], BR: ['.....1..', '.3..13..', '13.31331', '33331331']
  };
  var BG = { SP: E8() };
  ['L', 'M', 'R'].forEach(function (k) {
    var b = BODY[k], lt = edgeCol(k, LIP['T' + k]), lb = edgeCol(k, LIP['B' + k]);
    BG['P_' + k] = b;
    BG['P_T8_' + k] = b.slice(0, 4).concat(lt);
    BG['P_T4_' + k] = lt.concat(['........', '........', '........', '........']);
    BG['P_B0_' + k] = lb.concat(b.slice(4));
    BG['P_B4_' + k] = ['........', '........', '........', '........'].concat(lb);
  });
  // 地面
  // 地面 = 下方的「海」（場景調色盤決定是雲海 / 晶湖 / 沙河 / 夜海 / 星河）：浪頭 + 兩種水紋
  BG.G_TOP = ['........', '..33....', '.3223..3', '32222332', '22222222', '22122222', '22222212', '21222222'];
  BG.G_A = ['22222222', '22222122', '21222222', '22222222', '22223322', '22222222', '12222222', '22222221'];
  BG.G_B = ['22222222', '22122222', '22222222', '23322222', '22222222', '22222122', '22222222', '22222222'];
  // 裝飾（只用色 1 / 3 ⇒ 換景時調色盤一換就換氣氛）
  BG.D_CL = ['........', '....333.', '..333333', '.3333333', '33333333', '13333333', '.1111111', '........'];
  BG.D_CR = ['........', '.33.....', '3333....', '333333..', '3333333.', '33333331', '1111111.', '........'];
  BG.D_CS = ['........', '........', '...33...', '.333333.', '33333331', '.111111.', '........', '........'];
  BG.D_CRY = ['....3...', '...313..', '...313..', '..31113.', '..31113.', '...313..', '....3...', '........'];
  BG.D_ST1 = ['........', '........', '...3....', '..313...', '...3....', '........', '........', '........'];
  BG.D_ST2 = ['........', '.....1..', '........', '........', '.3......', '........', '........', '........'];
  BG.HB = fill('1');
  // 標題框
  BG.FR_H = ['........', '........', '........', '33333333', '22222222', '........', '........', '........'];
  BG.FR_V = ['...32...', '...32...', '...32...', '...32...', '...32...', '...32...', '...32...', '...32...'];
  // 字型（透明底 F_ / 實心底 H_）
  (function () {
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)], g = FONT[n];
      if (!g) continue;
      BG['F_' + n] = g;
      BG['H_' + n] = g.map(function (r) { return r.replace(/\./g, '1'); });
    }
  })();
  // 標題大字（2 倍放大 + 陰影）
  function bigLetter(ch) {
    var g = FONT[CHARMAP[ch]], px = [], i, j, x, y;
    for (y = 0; y < 16; y++) { px.push([]); for (x = 0; x < 16; x++) px[y].push(0); }
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (!g || g[j].charAt(i) === '.') continue;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        X = i * 2 + dx - 1; Y = j * 2 + dy;
        if (Y + 1 < 16 && X + 1 < 16 && X + 1 >= 0 && px[Y + 1][X + 1] === 0) px[Y + 1][X + 1] = 1;
        if (X >= 0) px[Y][X] = j < 3 ? 3 : 2;
      }
    }
    var X, Y, out = [];
    for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
      var rows = [];
      for (y = 0; y < 8; y++) { var s = ''; for (x = 0; x < 8; x++) s += '.123'.charAt(px[ty * 8 + y][tx * 8 + x]); rows.push(s); }
      out.push(rows);
    }
    return out;
  }
  var BIG = 'SWALOW';
  BIG.split('').forEach(function (ch) {
    if (BG['BIG_' + ch + '0']) return;
    var t = bigLetter(ch);
    for (var q = 0; q < 4; q++) BG['BIG_' + ch + q] = t[q];
  });

  /* ---------------- 精靈 ---------------- */
  // 星燕（面向右）：1 = 深藍描邊 / 眼，2 = 藍身，3 = 白腹 / 星冠
  var BIRD_BASE = [
    '................',
    '...........3....',
    '..........131...',
    '.........12221..',
    '........1222211.',
    '11......12222231',
    '121....122223311',
    '.1221.12222333..',
    '..12212222333331',
    '...122222333331.',
    '..1211222233311.',
    '.121..11111111..',
    '.11.............',
    '................',
    '................',
    '................'
  ];
  var WING = [
    [ // 上揚
      '.....11.........', '.....121........', '......121.......', '......1221......', '.......1221.....'
    ],
    [ // 平
      null, null, null, null, null, null, null, '......11111.....', '.....1222221....'
    ],
    [ // 下壓
      null, null, null, null, null, null, null, null, null, null,
      '.......1221.....', '......1221......', '.....1221.......', '.....111........'
    ]
  ];
  function compose(base, over, y0) {
    var out = base.slice(), i, j;
    for (i = 0; i < over.length; i++) {
      if (!over[i]) continue;
      var r = out[i + (y0 || 0)].split('');
      for (j = 0; j < 16; j++) if (over[i].charAt(j) !== '.' && over[i].charAt(j) !== '') r[j] = over[i].charAt(j);
      out[i + (y0 || 0)] = r.join('');
    }
    return out;
  }
  function quad(rows) {
    var out = [], tx, ty, y;
    for (ty = 0; ty < 2; ty++) for (tx = 0; tx < 2; tx++) {
      var t = [];
      for (y = 0; y < 8; y++) t.push(rows[ty * 8 + y].substring(tx * 8, tx * 8 + 8));
      out.push(t);
    }
    return out;
  }
  var MEDAL = [
    '.....111111.....',
    '...1122222211...',
    '..122233332221..',
    '.12233.33.33221.',
    '.1233..33..3321.',
    '123333.33.333321',
    '1233..........21',
    '12333.....33..21',
    '123333...3333321',
    '12233.3..3.3332.',
    '.1223.33.33.321.',
    '.1222.......221.',
    '..122222222221..',
    '...1122222211...',
    '.....111111.....',
    '................'
  ];
  var SPR = {
    BLANK: E8(),
    STAR: ['...1....', '..131...', '1133311.', '.13331..', '..333...', '.131.31.', '.1...1..', '........'],
    STREAK: ['........', '........', '........', '1122233.', '........', '........', '........', '........'],
    STREAK2: ['........', '........', '.11223..', '........', '........', '........', '........', '........'],
    SHIELD: ['..1111..', '.1....1.', '1......1', '1......1', '1......1', '1......1', '.1....1.', '..1111..']
  };
  var b, q;
  for (b = 0; b < 3; b++) {
    var rows = compose(BIRD_BASE, WING[b], 0);
    q = quad(rows);
    for (var k = 0; k < 4; k++) SPR['BIRD' + b + '_' + k] = q[k];
  }
  q = quad(MEDAL);
  for (k = 0; k < 4; k++) SPR['MEDAL_' + k] = q[k];

  var ART = null;
  function make() {
    if (ART) return ART;
    var bg = CHR.bank('flyer_bg', BG), spr = CHR.bank('flyer_spr', SPR);
    function tiles(prefix, s) {
      var out = [], i, n;
      s = String(s);
      for (i = 0; i < s.length; i++) {
        n = CHARMAP[s.charAt(i)];
        if (n === undefined && s.charAt(i) >= 'a' && s.charAt(i) <= 'z') n = CHARMAP[s.charAt(i).toUpperCase()];
        if (prefix === 'H_') out.push(n && BG['H_' + n] ? bg.index('H_' + n) : bg.index('HB'));
        else out.push(n && BG['F_' + n] ? bg.index('F_' + n) : 0);
      }
      return out;
    }
    ART = {
      bg: bg, spr: spr,
      t: function (name) { return bg.index(name); },
      s: function (name) { return spr.index(name); },
      text: function (s) { return tiles('F_', s); },
      hud: function (s) { return tiles('H_', s); },
      big: function (ch) { return [0, 1, 2, 3].map(function (q2) { return bg.index('BIG_' + ch + q2); }); }
    };
    return ART;
  }
  FY.Art = { make: make, BG: BG, SPR: SPR };
})();
