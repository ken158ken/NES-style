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
 * 固定中文（fix-r9，qa-r9 P3-4）：ZH_GLYPH / ZH_WORD 由 zh_gen.py 離線產生（字形 = tools/cjk_glyphs.py 的 Noto 點陣），只烘進 paint_ui；
 *   ui().zh(詞 id) → 每字 4 塊磁磚。畫布 bank 不放中文（池要留給畫布）。
 * 契約：CT.Paint.Art = { ui(), cv(), spr(), text(bankInfo, str) → 磁磚陣列, ICONS, TOOL_ORDER, ZH_GLYPH, ZH_WORD }
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

  // ---- 固定中文（標題 / 說明 / 清單畫面用；資料由 zh_gen.py 產生）----
  // <zh:begin>（zh_gen.py 自動產生，不要手改；36 字）
  var ZH_GLYPH = {
    u661f: '00003ff830183ff830183ff8110011003ff8610041001ff801007ffc00000000',   // 星
    u5875: '01803ffc24403ffc244c244c3ffc28402f7c6f7c6f806ff8408040807ffc0000',   // 塵
    u756b: '01003ff801187ffc3ff801003ff87ffc00003ff83ff831181ff87ffc00000000',   // 畫
    u5ba4: '010001007ffc40043ff806400c301ff0110801003ff8010001007ffc00000000',   // 室
    u81ea: '010003003ff83018301830183ff8301830183ff83018301830183ff830080000',   // 自
    u7531: '0100010001003ff821082108210821083ff821082108210821083ff820080000',   // 由
    u8457: '08207efc08200a203fe8021002607ffc0f007ff848180ff808180ff808080000',   // 著
    u8272: '04000c000fe018c030807ff87108310831083ff830083004300410041ffc0000',   // 色
    u672c: '01000100010001007ffc07c005400d601930111031187ffc0100010001000000',   // 本
    u81e8: '00807f8059fc5b005af87c88448844f844007fdc5954595459547fdc01540000',   // 臨
    u6479: '0c607ffc0c401ff81ff810181ff804007ffc1fb0711c4fe43ff8010007000000',   // 摹
    u6311: '31a031a035a4fbac33b831b031a039b073b877ac35243120332636246c3c0000',   // 挑
    u6230: '00207768552c7724006c7ff849247f2c49287f380830ffb2087608dc088c0000',   // 戰
    u5feb: '3040304030c07bf878487c487048f0c837fe30c030b031983308360c34040000',   // 快
    u731c: '48407ffc304033fc70401ffc18001bf83a0c6bfc5a0c1bfc1a0c160c76380000',   // 猜
    u904a: '622023203ffe06407e7c178c2698669074fc149014903d903b306c0047fc0000',   // 遊
    u6232: '08200fa808247fa44ebc7c7c47247f245f3c5f3851185f104b34cbfc3f4c0000',   // 戲
    u8aaa: '209031901188ff0c030479f80108790801f87cf04c904c904d947d14431c0000',   // 說
    u660e: '00007dfc4584458445847dfc45844584458445fc7d04410403040604043c0000',   // 明
    u6309: '1040306033fcfe4432c430cc309837fe3d98711033b030e030f0339c77040000',   // 按
    u4f4f: '08c01840184037fc304070407040104017fc104010401040104017fe10000000',   // 住
    u56de: '00007ffc600c600c600c6fec6c6c6c6c6c6c6fec600c600c600c7ffc400c0000',   // 回
    u9078: '400067bc34a407bc74a0373c213067fc71301ffc11303318360c7c0047fc0000',   // 選
    u55ae: '00003ef822883ef800003ff831183ff831183ff8010001007ffc010001000000',   // 單
    u64cd: '300031f8311879f8300037bc34a43ca47fbc704037fc31503358364460400000',   // 操
    u4f5c: '08800980198013fe32c076c074fc10c010c010c010fc10c010c010c010400000',   // 作
    u5de5: '000000007ffc01000100010001000100010001000100010001007ffc00000000',   // 工
    u5177: '00001ff010101ff0101010101ff010101ff010107ffc0c601838701c40040000',   // 具
    u984f: '180079fe24203cfc3c8466847ffc4c8478fc46844c8452fc4648ddcc31040000',   // 顏
    u6a21: '111017fc11107c0033fc320c3bfc3a0c73fc504057fc10e011b8170c16040000',   // 模
    u5f0f: '00d000d800c87ffc00c0004000407f4008400860086008240fb67c34401c0000',   // 式
    u5857: '20c031e007386ffc20c00ff810c036d82ccc408001003ff801007ffc00000000',   // 塗
    u6eff: '031073101ffc031003f060c02ffc0cc40ff41dd43fd42ffc6eec6cc44c5c0000',   // 滿
    u6bcf: '080018001ffc30007ff8521011901090fffe1210331031903ffc003000e00000',   // 每
    u4e00: '00000000000000000000000000007ffe00000000000000000000000000000000',   // 一
    u5340: '00007ffc600067e06620662067e060006f78694869486f7820003ffc00000000'    // 區
  };
  var ZH_WORD = {
    TITLE: ['u661f', 'u5875', 'u756b', 'u5ba4'],   // 星塵畫室
    FREE: ['u81ea', 'u7531', 'u756b'],   // 自由畫
    BOOK: ['u8457', 'u8272', 'u672c'],   // 著色本
    COPY: ['u81e8', 'u6479', 'u6311', 'u6230'],   // 臨摹挑戰
    GUESS: ['u5feb', 'u756b', 'u731c', 'u731c'],   // 快畫猜猜
    HELP: ['u904a', 'u6232', 'u8aaa', 'u660e'],   // 遊戲說明
    HOLD: ['u6309', 'u4f4f'],   // 按住
    MENU: ['u56de', 'u9078', 'u55ae'],   // 回選單
    H_CTRL: ['u64cd', 'u4f5c'],   // 操作
    H_TOOL: ['u5de5', 'u5177'],   // 工具
    H_COLOR: ['u984f', 'u8272'],   // 顏色
    H_MODE: ['u6a21', 'u5f0f'],   // 模式
    FILLALL: ['u5857', 'u6eff', 'u6bcf', 'u4e00', 'u5340']   // 塗滿每一區
  };
  // <zh:end>

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
    // 固定中文：每字 16×16 切 4 塊（色 3），內容相同的塊共用（空白塊 = S0）
    var zq = {}, seen = { '................................................................': 'S0' };
    for (var cp in ZH_GLYPH) {
      var h = ZH_GLYPH[cp], rows = [], qn = [];
      for (i = 0; i < 16; i++) rows.push(parseInt(h.substr(i * 4, 4), 16));
      for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
        var pat = [], key = '';
        for (var yy = 0; yy < 8; yy++) {
          var r = '';
          for (var xx = 0; xx < 8; xx++) r += (rows[ty * 8 + yy] >> (15 - tx * 8 - xx)) & 1 ? '3' : '.';
          pat.push(r); key += r;
        }
        if (!seen[key]) { seen[key] = 'Z_' + cp + '_' + (ty * 2 + tx); obj[seen[key]] = pat; }
        qn.push(seen[key]);
      }
      zq[cp] = qn;
    }
    var b = CHR.bank('paint_ui', obj);
    uiInfo = { bank: b, name: 'paint_ui',
      // 中文詞 → [[TL,TR,BL,BR] 磁磚 …]（詞 id 見 ZH_WORD）
      zh: function (id) { return (ZH_WORD[id] || []).map(function (cp) { return zq[cp].map(function (n) { return b.index(n); }); }); },
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

  P.Art = { ui: ui, cv: cv, spr: spr, text: text, ICONS: ICONS, ZH_GLYPH: ZH_GLYPH, ZH_WORD: ZH_WORD, TOOL_ORDER: TOOL_ORDER, TOOL_ICON: TOOL_ICON, CV_CHARS: CV_CHARS,
            reset: function () { cvInfo = null; uiInfo = null; sprInfo = null; } };
})();
