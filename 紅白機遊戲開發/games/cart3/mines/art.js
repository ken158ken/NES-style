/*
 * games/cart3/mines/art.js — 《星塵探雷》CHR（全部原創；程式化產生 + 少量手繪）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 外觀主題：「星岩礦脈」——未開的格子是紫色星岩結晶（有切面與一顆黃色星光），
 *   開過的格子是深空星圖（虛線格網），數字放大 2×；雷是紅色「星塵雷」（尖刺光球）；
 *   旗子是插在星岩上的「探測信標」（天線 + 三角信號旗）。**不用灰色凸起方塊 / 笑臉按鈕**。
 *
 * 每格 16×16 = 2×2 磁磚（一格一個屬性區塊 ⇒ 數字可以每格換色）：
 *   背景（mines_bg）：<名>_0..3（左上、右上、左下、右下）
 *     ROCKa / ROCKb（未開，兩種切面交錯）、FLAG（信標）、FLOOR（已開 0）、
 *     D{n}c3 / D{n}c2（數字 1..8，色 3 / 色 2 兩種版本 ⇒ 配合 3 組調色盤 = 6 種數字色）、
 *     MINE（雷）、BOOM（踩到的雷）、WRONG（插錯旗）、VEIL（暫停時蓋住盤面）
 *   8×8：字型 F_*、外框 FR_*、標題結晶 CHIP、星點 ST1/ST2、HUD 圖示 IC_MINE / IC_CLK / IC_FLAG、
 *        星等 STAR_ON / STAR_OFF、面板底 PANEL
 * 精靈（mines_spr）：游標角括號 CUR0 / CUR1（兩幀呼吸）、提示框 HINT、小探測機 PROBE_0..3（標題）、BACK
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var MI = CT.Mines = CT.Mines || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function grid(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(0); } return a; }
  function rowsOf(px, x0, y0) {
    var out = [];
    for (var y = 0; y < 8; y++) {
      var s = '';
      for (var x = 0; x < 8; x++) { var v = px[y0 + y][x0 + x]; s += v ? String(v) : '.'; }
      out.push(s);
    }
    return out;
  }
  function add16(dst, name, px) {
    dst[name + '_0'] = rowsOf(px, 0, 0); dst[name + '_1'] = rowsOf(px, 8, 0);
    dst[name + '_2'] = rowsOf(px, 0, 8); dst[name + '_3'] = rowsOf(px, 8, 8);
  }
  function fromRows(rows) { return rows.map(function (r) { return r.split('').map(function (c) { return c === '.' ? 0 : +c; }); }); }

  /* ---------------- 16×16 格子 ---------------- */
  // 星岩：色 1 本體、色 2 左上切面高光 + 結晶裂紋、色 3 一顆星光；右 / 下兩像素留黑 = 陰影縫
  function rock(variant) {
    var p = grid(16, 16), x, y;
    for (y = 0; y < 14; y++) for (x = 0; x < 14; x++) {
      if ((x === 0 || x === 13) && (y === 0 || y === 13)) continue;
      p[y][x] = (y === 0 || x === 0) ? 2 : 1;
    }
    // 結晶切面（色 2 斜線）
    var cracks = variant ? [[3, 9], [4, 8], [5, 7], [6, 7], [7, 6], [8, 5], [9, 5], [10, 4]]
                         : [[2, 4], [3, 5], [4, 6], [5, 6], [6, 7], [9, 10], [10, 11], [11, 11]];
    cracks.forEach(function (c) { p[c[1]][c[0]] = 2; });
    // 星光（色 3 十字 3×3）
    var sx = variant ? 10 : 4, sy = variant ? 9 : 10;
    p[sy][sx] = 3; p[sy - 1][sx] = 3; p[sy + 1][sx] = 3; p[sy][sx - 1] = 3; p[sy][sx + 1] = 3;
    return p;
  }
  function flag() {
    var p = rock(0), y, x;
    // 清掉星光再畫信標
    for (y = 8; y < 13; y++) for (x = 2; x < 7; x++) if (p[y][x] === 3) p[y][x] = 1;
    for (y = 3; y <= 11; y++) p[y][6] = 3;                     // 天線桿
    var flagRows = ['3333.', '33333', '3333.', '33...'];      // 三角信號旗
    for (y = 0; y < flagRows.length; y++) for (x = 0; x < 5; x++) if (flagRows[y].charAt(x) === '3') p[3 + y][7 + x] = 3;
    p[2][6] = 3; p[2][5] = 2; p[2][7] = 2;                      // 頂端閃光
    for (x = 3; x <= 9; x++) p[12][x] = 2;                      // 底座
    p[11][4] = 2; p[11][8] = 2;
    return p;
  }
  function floor() {
    var p = grid(16, 16), i;
    for (i = 0; i < 16; i += 2) { p[0][i] = 1; p[i][0] = 1; }
    return p;
  }
  function digit(n, col) {
    var p = floor(), g = FONT['N' + n], x, y;
    if (!g) return p;
    for (y = 0; y < 7; y++) for (x = 0; x < 8; x++) {
      if (g[y].charAt(x) !== '3') continue;
      var X = 1 + x * 2, Y = 1 + y * 2;
      p[Y][X] = col; p[Y][X + 1] = col; p[Y + 1][X] = col; p[Y + 1][X + 1] = col;
    }
    return p;
  }
  function mine(boom) {
    var p = boom ? grid(16, 16) : floor(), x, y;
    if (boom) {
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var d = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
        if (d <= 56) p[y][x] = 3;
      }
    }
    // 8 方向尖刺
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    dirs.forEach(function (d) {
      for (var r = 4; r <= (d[0] && d[1] ? 5 : 6); r++) {
        var X = Math.max(0, Math.min(15, Math.floor(7.5 + d[0] * r))), Y = Math.max(0, Math.min(15, Math.floor(7.5 + d[1] * r)));
        p[Y][X] = boom ? 2 : 3;
      }
    });
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      var dd = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
      if (dd <= 13) p[y][x] = 2;
    }
    p[6][6] = boom ? 1 : 3; p[6][7] = boom ? 1 : 3; p[7][6] = boom ? 1 : 3;   // 核心高光
    return p;
  }
  function wrong() {
    var p = rock(1), i;
    for (i = 3; i <= 10; i++) { p[i][i] = 3; p[i][13 - i] = 3; p[i][i + 1] = 3; p[i][14 - i] = 3; }
    return p;
  }
  function veil() {
    var p = grid(16, 16), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (((x + y) & 3) === 0) p[y][x] = 1;
    return p;
  }

  /* ---------------- 8×8 ---------------- */
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  var SMALL = {
    // 外框：色 1 紫、色 2 淺紫、色 3 黃（星岩礦脈的邊）
    FR_TL: ['........', '.2222222', '.2111111', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....'],
    FR_TR: ['........', '2222222.', '1111112.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.'],
    FR_BL: ['.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.2111111', '.2222222', '........'],
    FR_BR: ['.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '1111112.', '2222222.', '........'],
    FR_T: ['........', '22222222', '11111111', '........', '........', '........', '........', '........'],
    FR_B: ['........', '........', '........', '........', '........', '11111111', '22222222', '........'],
    FR_L: ['.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....'],
    FR_R: ['.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.'],
    FR_GEM: ['...3....', '..323...', '.32123..', '3211123.', '.32123..', '..323...', '...3....', '........'],
    CHIP: ['.222222.', '2211111.', '2111111.', '2112111.', '2111211.', '2111111.', '.111111.', '........'],
    CHIP3: ['.222222.', '2211111.', '2113111.', '2133311.', '2113111.', '2111111.', '.111111.', '........'],
    ST1: ['........', '........', '........', '....3...', '........', '........', '........', '........'],
    ST2: ['........', '...2....', '..232...', '...2....', '........', '........', '........', '........'],
    IC_MINE: ['...3....', '.3.2.3..', '..222...', '3222223.', '..222...', '.3.2.3..', '...3....', '........'],
    IC_CLK: ['..333...', '.3.3.3..', '3..3..3.', '3..333.3', '3.....3.', '.3...3..', '..333...', '........'],
    IC_FLAG: ['..3333..', '..33333.', '..3333..', '..3.....', '..3.....', '..3.....', '.2222...', '........'],
    STAR_ON: ['...3....', '...3....', '3333333.', '.33333..', '..333...', '.33.33..', '.3...3..', '........'],
    STAR_OFF: ['...1....', '..1.1...', '11...11.', '.1...1..', '..1.1...', '.1.1.1..', '.1...1..', '........'],
    PANEL: E8(),
    LARR: ['....3...', '...33...', '..333...', '.3333...', '..333...', '...33...', '....3...', '........'],
    RARR: ['..3.....', '..33....', '..333...', '..3333..', '..333...', '..33....', '..3.....', '........'],
    ARROW: ['.3......', '.33.....', '.333....', '.3333...', '.333....', '.33.....', '.3......', '........']
  };

  var SPR16 = {
    PROBE: [
      '.......33.......',
      '.......22.......',
      '.......22.......',
      '....33333333....',
      '...3222222223...',
      '..322113311223..',
      '..321133331123..',
      '..321133331123..',
      '..322113311223..',
      '...3222222223...',
      '....33333333....',
      '...22......22...',
      '..22........22..',
      '.22..........22.',
      '.3............3.',
      '................'
    ]
  };

  var built = null;
  MI.Art = {
    make: function () {
      if (built) return built;
      var bg = { SP: E8() }, k;
      for (k in FONT) if (Object.prototype.hasOwnProperty.call(FONT, k)) bg['F_' + k] = FONT[k];
      for (k in SMALL) if (Object.prototype.hasOwnProperty.call(SMALL, k)) bg[k] = SMALL[k];
      add16(bg, 'ROCKa', rock(0)); add16(bg, 'ROCKb', rock(1)); add16(bg, 'FLAG', flag());
      add16(bg, 'FLOOR', floor());
      for (var n = 1; n <= 8; n++) { add16(bg, 'D' + n + 'c3', digit(n, 3)); add16(bg, 'D' + n + 'c2', digit(n, 2)); }
      add16(bg, 'MINE', mine(false)); add16(bg, 'BOOM', mine(true)); add16(bg, 'WRONG', wrong()); add16(bg, 'VEIL', veil());

      var spr = { SP: E8() };
      spr.CUR0 = ['33333...', '32222...', '32......', '32......', '32......', '........', '........', '........'];
      spr.CUR1 = ['........', '.3333...', '.322....', '.32.....', '.3......', '........', '........', '........'];
      spr.HINT = ['33.33.33', '3......3', '........', '3......3', '3......3', '........', '3......3', '33.33.33'];
      spr.BACK = ['.333333.', '33333333', '33333333', '33333333', '33333333', '33333333', '33333333', '.333333.'];
      add16(spr, 'PROBE', fromRows(SPR16.PROBE));

      var bgBank = CHR.bank('mines_bg', bg), sprBank = CHR.bank('mines_spr', spr);
      built = {
        bg: bgBank, spr: sprBank,
        t: function (name) { return bgBank.index(name); },
        s: function (name) { return sprBank.index(name); },
        cell: function (name) { return [bgBank.index(name + '_0'), bgBank.index(name + '_1'), bgBank.index(name + '_2'), bgBank.index(name + '_3')]; },
        ch: function (c) {
          if (c === '★') c = '$';
          if (c === ' ') return bgBank.index('SP');
          if (c === '<') return bgBank.index('LARR');
          if (c === '>') return bgBank.index('RARR');
          var n = CHARMAP[c];
          if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
          return (n && bgBank.has('F_' + n)) ? bgBank.index('F_' + n) : bgBank.index('SP');
        }
      };
      return built;
    }
  };
})();
