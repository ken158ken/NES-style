/*
 * games/cart3/gomoku/art.js — 《星塵五子棋》CHR（全部原創；程式化產生）
 * ---------------------------------------------------------------------------
 * 擁有者：C7-2 cart3-board（R7）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * 外觀主題：「星圖棋盤」——黑底藍色星座線當棋盤（星位 = 亮星點），兩方棋子是
 *   **太陽石**（金色、帶白色光點，先手）與 **月亮石**（白色、帶藍色坑紋，後手）。不是黑白圍棋子。
 * 背景（gomoku_bg）：
 *   8×8 交叉點（線在第 3 列 / 第 3 行）：X_C、四邊 X_T/X_B/X_L/X_R、四角 X_TL/TR/BL/BR、星位 X_H
 *   棋子 S{1|2}{r}{d}[H]：1 太陽 / 2 月亮、r = 右側接線、d = 下方接線、H = 勝利連線高亮版
 *   井字大棋子：T{1|2}{L|S}[H]_0..15 / _0..8（L = 32×32 給 3×3 盤、S = 24×24 給 4×4 盤）、格線 GL_V / GL_H / GL_X
 *   面板：ICON1 / ICON2（16×16）、外框 FR_*、星點、箭頭、字型 F_*
 * 精靈（gomoku_spr）：游標框 CUR0 / CUR1、最後一手記號 LAST、提示框 HINT、井字大游標角 TC、思考中星 THINK0..3、BACK
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var GO = CT.Gomoku = CT.Gomoku || {};
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
  function addBig(dst, name, px) {
    var n = px.length / 8, k = 0;
    for (var ty = 0; ty < n; ty++) for (var tx = 0; tx < n; tx++) dst[name + '_' + (k++)] = rowsOf(px, tx * 8, ty * 8);
  }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }

  /* ---------------- 交叉點 ---------------- */
  function cross(up, down, left, right, hoshi) {
    var p = grid(8, 8), i;
    for (i = 0; i < 8; i++) {
      if ((i <= 3 && left) || (i >= 3 && right)) p[3][i] = 1;
      if ((i <= 3 && up) || (i >= 3 && down)) p[i][3] = 1;
    }
    if (hoshi) { p[2][3] = 3; p[3][2] = 3; p[3][4] = 3; p[4][3] = 3; p[3][3] = 3; p[2][2] = 1; p[2][4] = 1; p[4][2] = 1; p[4][4] = 1; }
    return p;
  }
  // 棋子 7×7（中心 3,3）
  var DISC = ['..xxx..', '.xxxxx.', 'xxxxxxx', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..'];
  function stone(color, stubR, stubD, hi) {
    var p = grid(8, 8), x, y;
    for (y = 0; y < 7; y++) for (x = 0; x < 7; x++) {
      if (DISC[y].charAt(x) !== 'x') continue;
      var edge = (x === 0 || y === 0 || x === 6 || y === 6 || DISC[y].charAt(x - 1) !== 'x' || DISC[y].charAt(x + 1) !== 'x' ||
                  (DISC[y - 1] || '').charAt(x) !== 'x' || (DISC[y + 1] || '').charAt(x) !== 'x');
      if (color === 1) p[y][x] = (hi && edge) ? 3 : 2;              // 太陽石：金
      else p[y][x] = (hi ? (edge ? 2 : 3) : (edge ? 1 : 3));        // 月亮石：白、藍邊
    }
    if (color === 1) { p[1][2] = 3; p[2][1] = 3; p[2][2] = 3; }    // 光點
    else { p[2][4] = 1; p[4][2] = 1; p[4][3] = 1; }                // 坑紋
    if (stubR) p[3][7] = 1;
    if (stubD) p[7][3] = 1;
    return p;
  }

  /* ---------------- 井字大棋子 ---------------- */
  function bigMark(kind, size, hi) {
    var p = grid(size, size), x, y, c = (size - 1) / 2;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      var dx = x - c, dy = y - c, r = Math.sqrt(dx * dx + dy * dy);
      if (hi && x > 0 && y > 0 && x < size - 1 && y < size - 1) p[y][x] = 1;
      if (kind === 1) {
        var core = size * 0.24, ang = Math.atan2(dy, dx), ray = Math.abs(Math.cos(ang * 4));
        if (r <= core) p[y][x] = (dx < -1 && dy < -1 && r > core * 0.35 && r < core * 0.7) ? 3 : 2;
        else if (r <= size * 0.45 && r > core + 1.5 && ray > 0.86) p[y][x] = 2;
      } else {
        var R = size * 0.40, ox = c + size * 0.17, oy = c - size * 0.12;
        var r2 = Math.sqrt((x - ox) * (x - ox) + (y - oy) * (y - oy));
        if (r <= R && r2 > R * 0.78) p[y][x] = (r > R - 1.3 || (r2 > R * 0.78 && r2 < R * 0.78 + 1.2)) ? (hi ? 2 : 1) : 3;
        if (r <= R && r2 > R * 0.78 && Math.abs(dx + size * 0.18) < 1.2 && Math.abs(dy - size * 0.12) < 1.2) p[y][x] = 1;
      }
    }
    return p;
  }

  var SMALL = {
    FR_TL: ['........', '.2222222', '.2111111', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....'],
    FR_TR: ['........', '2222222.', '1111112.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.'],
    FR_BL: ['.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.2111111', '.2222222', '........'],
    FR_BR: ['.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '1111112.', '2222222.', '........'],
    FR_T: ['........', '22222222', '11111111', '........', '........', '........', '........', '........'],
    FR_B: ['........', '........', '........', '........', '........', '11111111', '22222222', '........'],
    FR_L: ['.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....', '.21.....'],
    FR_R: ['.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.', '.....12.'],
    ST1: ['........', '........', '........', '....3...', '........', '........', '........', '........'],
    ST2: ['........', '...2....', '..232...', '...2....', '........', '........', '........', '........'],
    ARROW: ['.3......', '.33.....', '.333....', '.3333...', '.333....', '.33.....', '.3......', '........'],
    LARR: ['....3...', '...33...', '..333...', '.3333...', '..333...', '...33...', '....3...', '........'],
    RARR: ['..3.....', '..33....', '..333...', '..3333..', '..333...', '..33....', '..3.....', '........'],
    GL_V: ['...11...', '...11...', '...11...', '...11...', '...11...', '...11...', '...11...', '...11...'],
    GL_H: ['........', '........', '........', '11111111', '11111111', '........', '........', '........'],
    GL_X: ['...11...', '...11...', '...11...', '11111111', '11111111', '...11...', '...11...', '...11...']
  };

  var built = null;
  GO.Art = {
    make: function () {
      if (built) return built;
      var bg = { SP: E8() }, k;
      for (k in FONT) if (Object.prototype.hasOwnProperty.call(FONT, k)) bg['F_' + k] = FONT[k];
      for (k in SMALL) if (Object.prototype.hasOwnProperty.call(SMALL, k)) bg[k] = SMALL[k];
      bg.X_C = rowsOf(cross(1, 1, 1, 1), 0, 0); bg.X_H = rowsOf(cross(1, 1, 1, 1, 1), 0, 0);
      bg.X_T = rowsOf(cross(0, 1, 1, 1), 0, 0); bg.X_B = rowsOf(cross(1, 0, 1, 1), 0, 0);
      bg.X_L = rowsOf(cross(1, 1, 0, 1), 0, 0); bg.X_R = rowsOf(cross(1, 1, 1, 0), 0, 0);
      bg.X_TL = rowsOf(cross(0, 1, 0, 1), 0, 0); bg.X_TR = rowsOf(cross(0, 1, 1, 0), 0, 0);
      bg.X_BL = rowsOf(cross(1, 0, 0, 1), 0, 0); bg.X_BR = rowsOf(cross(1, 0, 1, 0), 0, 0);
      for (var c = 1; c <= 2; c++) for (var r = 0; r <= 1; r++) for (var d = 0; d <= 1; d++) {
        bg['S' + c + r + d] = rowsOf(stone(c, r, d, false), 0, 0);
        bg['S' + c + r + d + 'H'] = rowsOf(stone(c, r, d, true), 0, 0);
      }
      [1, 2].forEach(function (m) {
        addBig(bg, 'T' + m + 'L', bigMark(m, 32, false)); addBig(bg, 'T' + m + 'LH', bigMark(m, 32, true));
        addBig(bg, 'T' + m + 'S', bigMark(m, 24, false)); addBig(bg, 'T' + m + 'SH', bigMark(m, 24, true));
      });
      addBig(bg, 'ICON1', bigMark(1, 16, false)); addBig(bg, 'ICON2', bigMark(2, 16, false));

      var spr = { SP: E8() };
      spr.CUR0 = ['33....33', '3......3', '........', '........', '........', '........', '3......3', '33....33'];
      spr.CUR1 = ['333..333', '3......3', '3......3', '........', '........', '3......3', '3......3', '333..333'];
      spr.LAST = ['........', '........', '...3....', '..333...', '...3....', '........', '........', '........'];
      spr.HINT = ['.3.3.3..', '3.....3.', '.......3', '3.......', '.......3', '3.......', '.3.....3', '..3.3.3.'];
      spr.TC = ['3333....', '3333....', '33......', '33......', '........', '........', '........', '........'];
      spr.THINK0 = ['...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........', '........'];
      spr.THINK1 = ['........', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '........', '........'];
      spr.BACK = ['.333333.', '33333333', '33333333', '33333333', '33333333', '33333333', '33333333', '.333333.'];

      var bgBank = CHR.bank('gomoku_bg', bg), sprBank = CHR.bank('gomoku_spr', spr);
      built = {
        bg: bgBank, spr: sprBank,
        t: function (name) { return bgBank.index(name); },
        s: function (name) { return sprBank.index(name); },
        ch: function (ch) {
          if (ch === '★') ch = '$';
          if (ch === ' ') return bgBank.index('SP');
          if (ch === '<') return bgBank.index('LARR');
          if (ch === '>') return bgBank.index('RARR');
          var n = CHARMAP[ch];
          if (n === undefined && ch >= 'a' && ch <= 'z') n = CHARMAP[ch.toUpperCase()];
          return (n && bgBank.has('F_' + n)) ? bgBank.index('F_' + n) : bgBank.index('SP');
        }
      };
      return built;
    }
  };
})();
