/*
 * games/cart5/paint/art.js — 《星塵畫室 STAR PAINT》CHR 規劃（合輯卡帶五 槽 6，id = paint）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-1 cart5-paint（R9）｜ 依賴：engine/chr.js（NES.CHR.DEMO.FONT 8×8 英文字）
 *
 * 兩個背景 bank：
 *   paint_ui  — 標題 / 說明 / 選單畫面（固定）：空白 + 實心 1~3 + 全字型 + 2× 標題字 + 圖示 + 框線。
 *   paint_cv  — 畫布畫面（**像 CHR-RAM**）：[0..3] 實心 0~3、[4..U-1] 釘住的 UI 磁磚（字 / 框 / 工具圖示），
 *               [U..255] 是畫布用的動態磁磚池（core.js 的 Disp 依內容配置、參考計數、VBlank 計帳上傳）。
 * 精靈 bank paint_spr：游標十字（熱點 3,3）、面板指標（熱點 0,0）、預覽點、錨點、工具底線、色票標記、選單箭頭、筆刷裝飾、回選單提示點。
 * 契約：CT.Paint.Art = { ui(), cv(), spr(), text(bankInfo, str) → 磁磚陣列, ICONS, TOOL_ORDER }
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var P = CT.Paint = CT.Paint || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function solid(v) { var r = '', s = String(v); for (var i = 0; i < 8; i++) r += s; var a = []; for (var j = 0; j < 8; j++) a.push(r); return a; }

  // 自訂字：方向箭頭 / 進度條 / 星
  var EXTRA = {
    X_AL: ['....3...', '...33...', '..333...', '.3333...', '..333...', '...33...', '....3...', '........'],
    X_AR: ['..3.....', '..33....', '..333...', '..3333..', '..333...', '..33....', '..3.....', '........'],
    X_AU: ['........', '...3....', '..333...', '.33333..', '3333333.', '........', '........', '........'],
    X_AD: ['........', '3333333.', '.33333..', '..333...', '...3....', '........', '........', '........'],
    X_BF: ['33333333', '3......3', '3.3333.3', '3.3333.3', '3.3333.3', '3.3333.3', '3......3', '33333333'],
    X_BE: ['33333333', '3......3', '3......3', '3......3', '3......3', '3......3', '3......3', '33333333'],
    X_ST: ['...3....', '...3....', '..333...', '3333333.', '.33333..', '.33.33..', '.3...3..', '........']
  };
  // 字元 → 磁磚名（DEMO 字型 + 自訂）
  var CMAP = { '<': 'X_AL', '>': 'X_AR', '{': 'X_AU', '}': 'X_AD', '#': 'X_BF', '_': 'X_BE', '*': 'X_ST' };
  function nameOf(ch) {
    if (CMAP[ch]) return CMAP[ch];
    var n = CHARMAP[ch];
    if (n === undefined && ch >= 'a' && ch <= 'z') n = CHARMAP[ch.toUpperCase()];
    return n === undefined ? 'SP' : n;
  }
  function glyph(n) { return EXTRA[n] || FONT[n]; }

  // 畫布畫面要用到的字（其餘不進 paint_cv，省磁磚給畫布）
  var CV_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/%!?<>{}#_*+=()';
  var UI_CHARS = CV_CHARS + ",'$";

  // ---- 工具圖示（8×8，墨色 3）----
  var ICONS = {
    I_PEN: ['......33', '.....3.3', '....3.3.', '...3.3..', '..3.3...', '.333....', '.33.....', '3.......'],
    I_ERASE: ['........', '....333.', '...3..33', '..3..3.3', '.33333.3', '.3...33.', '.33333..', '........'],
    I_FILL: ['...3....', '..3.3...', '.3...3..', '3.....3.', '.3...333', '..3.3.33', '...3..33', '.......3'],
    I_LINE: ['........', '......3.', '.....3..', '....3...', '...3....', '..3.....', '.3......', '........'],
    I_RECT: ['........', '.333333.', '.3....3.', '.3....3.', '.3....3.', '.3....3.', '.333333.', '........'],
    I_BOX: ['........', '.333333.', '.333333.', '.333333.', '.333333.', '.333333.', '.333333.', '........'],
    I_OVAL: ['........', '..3333..', '.3....3.', '3......3', '3......3', '.3....3.', '..3333..', '........'],
    I_SIZE: ['........', '........', '.....333', '.....333', '..33.333', '3.33.333', '........', '........'],
    I_UNDO: ['........', '..3.....', '.33333..', '333...3.', '.33....3', '..3....3', '......3.', '...333..'],
    I_REDO: ['........', '.....3..', '..33333.', '.3...333', '3....33.', '3....3..', '.3......', '..333...']
  };
  var TOOL_ORDER = ['pen', 'erase', 'fill', 'line', 'rect', 'box', 'oval', 'size', 'undo', 'redo'];
  var TOOL_ICON = { pen: 'I_PEN', erase: 'I_ERASE', fill: 'I_FILL', line: 'I_LINE', rect: 'I_RECT', box: 'I_BOX', oval: 'I_OVAL',
                    size: 'I_SIZE', undo: 'I_UNDO', redo: 'I_REDO' };
  // 畫布外框（線在靠畫布那一側；墨色 3）
  var FRAME = {
    F_L: ['.......3', '.......3', '.......3', '.......3', '.......3', '.......3', '.......3', '.......3'],
    F_R: ['3.......', '3.......', '3.......', '3.......', '3.......', '3.......', '3.......', '3.......'],
    F_T: ['........', '........', '........', '........', '........', '........', '........', '33333333'],
    F_B: ['33333333', '........', '........', '........', '........', '........', '........', '........'],
    F_TL: ['........', '........', '........', '........', '........', '........', '........', '.......3'],
    F_TR: ['........', '........', '........', '........', '........', '........', '........', '3.......'],
    F_BL: ['.......3', '........', '........', '........', '........', '........', '........', '........'],
    F_BR: ['3.......', '........', '........', '........', '........', '........', '........', '........'],
    PAPER: ['33333333', '3......3', '3......3', '3......3', '3......3', '3......3', '3......3', '33333333']
  };

  /* ---------------- paint_cv：畫布畫面（前 U 個釘住，其餘動態） ---------------- */
  var cvInfo = null;
  function cv() {
    if (cvInfo) return cvInfo;
    var obj = { S0: solid('.'), S1: solid('1'), S2: solid('2'), S3: solid('3') }, k, i;
    var chars = {};
    for (i = 0; i < CV_CHARS.length; i++) {
      var n = nameOf(CV_CHARS.charAt(i));
      if (!chars[n] && glyph(n)) { chars[n] = 1; obj['T_' + n] = glyph(n); }
    }
    if (!obj.T_SP) obj.T_SP = solid('.');
    for (k in FRAME) obj[k] = FRAME[k];
    for (k in ICONS) obj[k] = ICONS[k];
    var U = Object.keys(obj).length;
    for (i = U; i < 256; i++) obj['POOL' + i] = solid('.');
    var b = CHR.bank('paint_cv', obj);
    // 每格動態磁磚要是各自的 Uint8Array（bank 可能共用同一份空白）→ 換成獨立陣列
    for (i = U; i < 256; i++) b.tiles[i] = new Uint8Array(64);
    cvInfo = { bank: b, U: U, name: 'paint_cv',
      t: function (nm) { return b.index(nm); },
      ch: function (c) { var n = nameOf(c); return b.has('T_' + n) ? b.index('T_' + n) : (n === 'SP' ? 0 : b.index('T_QUEST')); } };
    return cvInfo;
  }

  /* ---------------- paint_ui：標題 / 說明 / 選單 ---------------- */
  // 2× 標題字：DEMO 字放大一倍，上半色 3、下半色 2、右下陰影色 1
  function big(ch) {
    var gph = glyph(nameOf(ch)) || solid('.'), px = [], x, y;
    for (y = 0; y < 16; y++) { px.push([]); for (x = 0; x < 16; x++) px[y].push('.'); }
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      if (gph[y].charAt(x) === '.') continue;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var yy = y * 2 + dy, xx = x * 2 + dx;
        px[yy][xx] = yy < 7 ? '3' : '2';
        if (xx + 1 < 16 && yy + 1 < 16 && px[yy + 1][xx + 1] === '.') px[yy + 1][xx + 1] = 'S';
      }
    }
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (px[y][x] === 'S') px[y][x] = '1';
    // 陰影被後畫的字身蓋過時以字身為準（上面已處理：只填空白）
    var q = [];
    for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
      var rows = [];
      for (y = 0; y < 8; y++) { var r = ''; for (x = 0; x < 8; x++) r += px[ty * 8 + y][tx * 8 + x]; rows.push(r); }
      q.push(rows);
    }
    return q;  // TL TR BL BR
  }
  var LOGO = 'STARPINT';     // 「STAR PAINT」用到的字母
  var uiInfo = null;
  function ui() {
    if (uiInfo) return uiInfo;
    var obj = { S0: solid('.'), S1: solid('1'), S2: solid('2'), S3: solid('3') }, k, i;
    var chars = {};
    for (i = 0; i < UI_CHARS.length; i++) {
      var n = nameOf(UI_CHARS.charAt(i));
      if (!chars[n] && glyph(n)) { chars[n] = 1; obj['T_' + n] = glyph(n); }
    }
    if (!obj.T_SP) obj.T_SP = solid('.');
    for (k in FRAME) obj[k] = FRAME[k];
    for (k in ICONS) obj[k] = ICONS[k];
    for (i = 0; i < LOGO.length; i++) {
      var q = big(LOGO.charAt(i));
      obj['L_' + LOGO.charAt(i) + '0'] = q[0]; obj['L_' + LOGO.charAt(i) + '1'] = q[1];
      obj['L_' + LOGO.charAt(i) + '2'] = q[2]; obj['L_' + LOGO.charAt(i) + '3'] = q[3];
    }
    // 調色盤條紋（標題裝飾）：色 1 / 2 / 3 的斜紋
    obj.STRIPE = ['11112222', '11122223', '11222233', '12222333', '22223333', '22233331', '22333311', '23333111'];
    obj.BRUSHL = ['........', '........', '33333333', '32222222', '32222222', '33333333', '........', '........'];
    var b = CHR.bank('paint_ui', obj);
    uiInfo = { bank: b, name: 'paint_ui',
      t: function (nm) { return b.index(nm); },
      ch: function (c) { var n = nameOf(c); return b.has('T_' + n) ? b.index('T_' + n) : 0; },
      big: function (c) { return [b.index('L_' + c + '0'), b.index('L_' + c + '1'), b.index('L_' + c + '2'), b.index('L_' + c + '3')]; } };
    return uiInfo;
  }

  /* ---------------- 精靈 ---------------- */
  var SPR = {
    BLANK: solid('.'),
    CROSS: ['..131...', '..131...', '11...11.', '33...33.', '11...11.', '..131...', '..131...', '........'],
    PTR: ['1.......', '131.....', '1331....', '13331...', '133331..', '13311...', '.1.31...', '....1...'],
    DOT: ['........', '........', '..11....', '.1331...', '.1331...', '..11....', '........', '........'],
    ANCH: ['1.....1.', '.1...1..', '..3.3...', '...3....', '..3.3...', '.1...1..', '1.....1.', '........'],
    UND: ['33333333', '11111111', '........', '........', '........', '........', '........', '........'],
    MARK: ['...3....', '..333...', '.33333..', '1111111.', '........', '........', '........', '........'],
    MENU: ['.1......', '.21.....', '.221....', '.2221...', '.221....', '.21.....', '.1......', '........'],
    BRUSH: ['......33', '.....333', '....333.', '...333..', '..222...', '.2222...', '1222....', '11......'],
    PDOT: ['........', '..33....', '.3333...', '.3333...', '..33....', '........', '........', '........']
  };
  var sprInfo = null;
  function spr() {
    if (sprInfo) return sprInfo;
    var b = CHR.bank('paint_spr', SPR);
    sprInfo = { bank: b, name: 'paint_spr', s: function (nm) { return b.index(nm); } };
    return sprInfo;
  }

  // 字串 → 磁磚陣列（依 bank）
  function text(info, s) { var out = []; s = String(s); for (var i = 0; i < s.length; i++) out.push(info.ch(s.charAt(i))); return out; }

  P.Art = { ui: ui, cv: cv, spr: spr, text: text, ICONS: ICONS, TOOL_ORDER: TOOL_ORDER, TOOL_ICON: TOOL_ICON, CV_CHARS: CV_CHARS,
            reset: function () { cvInfo = null; uiInfo = null; sprInfo = null; } };
})();
