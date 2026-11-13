/*
 * games/cart5/paint/main.js — 《星塵畫室 STAR PAINT》（合輯卡帶五 槽 6，id = paint）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-1 cart5-paint（R9）｜ 依賴：paint/{art,core,pics,song}.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：coloring-game（著色本）、precision-draw（照著範例畫、算準確度）、quick-draw（快畫）。
 *
 * 畫面（畫布畫面）：
 *   第 2 列 HUD（模式 / 圖名、START: MENU）；畫布 128×128 = 名稱表第 2~17 欄 × 第 4~19 列（螢幕 x16..143 / y32..159），外框在四周。
 *   右側面板：第 4 / 6 列 10 個工具（筆 / 橡皮 / 填色桶 / 直線 / 方框 / 實心方塊 / 橢圓 / 筆刷大小 / 復原 / 重做）、
 *   第 8 列工具名、第 10~16 列色票（4 組 × 3 色 + 紙）；臨摹模式第 10~17 列是範例縮圖（64×64）、第 18 列色票；
 *   底部第 22 列：進度條（SYNC ####）+ CHR 用量；第 24 列模式資訊；第 26 列操作提示。暫停選單蓋在底部第 21~27 列。
 * 操作：十字鍵移游標（按住：前 8 幀 1 px/幀、之後 3 px/幀；按住 B = 精細：按一下 1 px、12 幀後每 4 幀 1 px）。
 *   A = 用工具 / 按面板按鈕；SELECT 單按 = 游標在畫布 ↔ 面板間跳；SELECT + ← / → = 復原 / 重做；SELECT + ↑ / ↓ = 換工具。
 *   直線 / 方框 / 方塊 / 橢圓：A 定起點、移動、A 定終點（起終點同一點 = 取消）；預覽用 ≤ 6 顆精靈點。
 *   色票：A 選色；對「已選的色票」再按 A = 改色（← → 色相 14 格含黑、↑ ↓ 亮度 4 階，**即時改 PPU 調色盤**；A 確定、B 取消）。
 *   START = 暫停選單（存檔 4 格 / 讀檔 / 分享碼複製 / 貼上 / 清除 / 離開）。
 * 模式：FREE DRAW 自由畫；COLOR BOOK 著色本 8 張（每個封閉區都塗滿 ≥ 90% = 完成）；
 *   COPY CHALLENGE 臨摹 8 張（120 秒照右邊範例畫，core.score 評分 S/A/B/C/D）；QUICK GUESS 快畫猜猜（6 回合各 25 秒，CPU 用形狀分類器猜）。
 * 密技（C / ★）：著色本 = 立刻塗好最大的未完成區；臨摹 = +30 秒，結算畫面 = 原地續畫 30 秒；快畫 = 這回合直接猜中，結算 = 追加一回合；
 *   自由畫 / 標題 / 說明 / 清單無效。用過密技那局不存紀錄、goal false。
 * goal = 同一次遊玩中「著色本完成 1 張」且「臨摹拿到 B 以上」（都沒用密技）。
 * 機器人：只讀畫面（ppu.indexFrame：線稿的封閉區、範例縮圖與色票顏色）＋ 游標位置；每個動作之間等 12 幀（人類節奏）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var P = CT.Paint = CT.Paint || {};
  var C = P.Core, PICS = P.Pics, AU = P.Audio, ART = P.Art;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var DIRS = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;

  var HZ = 60.0988, FLUSH_LIMIT = 150;
  var CVX = 16, CVY = 32, CV_COL = 2, CV_ROW = 4;
  var PX0 = 160, PX1 = 247, PY0 = 32, PY1 = 159;      // 游標可到的範圍（畫布 + 面板）
  var TOOLS = ART.TOOL_ORDER;
  var TOOL_NAME = { pen: 'PEN', erase: 'ERASER', fill: 'FILL', line: 'LINE', rect: 'FRAME', box: 'BLOCK', oval: 'OVAL', size: 'SIZE', undo: 'UNDO', redo: 'REDO' };
  var GUESS_ROUNDS = 6, GUESS_TIME = 1503, GUESS_EVERY = 40, COPY_CHEAT = 1803, BOT_LAG = 12;
  var MODES = [
    { key: 'free', name: 'FREE DRAW', zh: 'FREE' }, { key: 'book', name: 'COLOR BOOK', zh: 'BOOK' }, { key: 'copy', name: 'COPY CHALLENGE', zh: 'COPY' },
    { key: 'guess', name: 'QUICK GUESS', zh: 'GUESS' }, { key: 'help', name: 'HOW TO PLAY', zh: 'HELP' }
  ];
  var SPR_PAL = [[0x0F, 0x16, 0x30], [0x07, 0x27, 0x38], [0x0F, 0x21, 0x30], [0x0F, 0x28, 0x30]];
  var UI_PAL = { bd: 0x0F, bg: [[0x00, 0x10, 0x30], [0x07, 0x16, 0x28], [0x16, 0x2A, 0x30], [0x13, 0x24, 0x34]] };   // 第 2 組第 3 色 = 白：條紋與第一個選項共用屬性列（fix-r9）
  // 精靈槽
  var O_CUR = 0, O_ANCH = 1, O_PRE = 2, O_UND = 10, O_MARK = 11, O_MENU = 12;

  var nes0 = null, g = null, art = null, spr = null;

  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.slice(0, w); }
  function secs(f) { return Math.ceil(Math.max(0, f) / HZ); }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7FFFFFFF; return g.seed / 0x7FFFFFFF; }

  function newState() {
    var sd = parseInt((CT.query && CT.query('seed')) || '', 10);
    return { mode: 'title', sel: 0, t: 0, page: 0, helpPage: 0, list: null,
      want: new Int16Array(960), have: new Int16Array(960), q: [], wantA: new Int8Array(240), haveA: new Int8Array(240), qa: [],
      S: null, goalBook: false, goalCopy: false, seed: isNaN(sd) ? 20261113 : sd, cheatReq: false, lastCode: '', clip: '' };
  }

  /* ================================================================ 名稱表影子 + 差異佇列（主程式擁有的格子） */
  function put(c, r, t) { if (c < 0 || c > 31 || r < 0 || r > 29) return; var k = r * 32 + c; if (g.want[k] === t) return; g.want[k] = t; g.q.push(k); }
  function putA(c16, r16, p) { if (c16 < 0 || c16 > 15 || r16 < 0 || r16 > 14) return; var k = r16 * 16 + c16; if (g.wantA[k] === p) return; g.wantA[k] = p; g.qa.push(k); }
  function text(col, row, s) { var t = ART.text(art, s); for (var i = 0; i < t.length; i++) put(col + i, row, t[i]); }
  function center(row, s) { text(16 - (s.length >> 1), row, s); }
  // 固定中文（paint_ui 才有）：每字 2×2 格；混排時半形字放在下排（與中文字身底線對齊）。segs = ['#詞id' | 'ASCII', …]
  function zhW(segs) { var w = 0; segs.forEach(function (sg) { w += sg.charAt(0) === '#' ? 2 * (ART.ZH_WORD[sg.slice(1)] || []).length : sg.length; }); return w; }
  function zhLine(col, row, segs) {
    if (col < 0) col = 16 - (zhW(segs) >> 1);
    segs.forEach(function (sg) {
      if (sg.charAt(0) !== '#') { for (var j = 0; j < sg.length; j++) put(col + j, row, 0); text(col, row + 1, sg); col += sg.length; return; }
      art.zh(sg.slice(1)).forEach(function (q) { put(col, row, q[0]); put(col + 1, row, q[1]); put(col, row + 1, q[2]); put(col + 1, row + 1, q[3]); col += 2; });
    });
  }
  function clearRow(row, c0, c1) { for (var c = (c0 || 0); c <= (c1 === undefined ? 31 : c1); c++) put(c, row, 0); }
  function bud() { return nes0 && nes0.timing && nes0.timing.budget; }
  function flushMain(limit) {
    var B = bud(), ppu = nes0.ppu;
    while (g.qa.length) {
      if (B && !B.mute && B.used + 1 > limit) return;
      var a = g.qa.shift();
      if (g.haveA[a] !== g.wantA[a]) { ppu.setAttr(0, a & 15, a >> 4, g.wantA[a]); g.haveA[a] = g.wantA[a]; }
    }
    while (g.q.length) {
      if (B && !B.mute && B.used + 1 > limit) return;
      var k = g.q.shift();
      if (g.have[k] !== g.want[k]) { ppu.setTile(0, k & 31, k >> 5, g.want[k]); g.have[k] = g.want[k]; }
    }
  }
  // 換畫面：關 rendering 整片重畫（CT.blank 內不計 VBlank）
  function screen(info, pal, build) {
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      NES.CHR.setPattern(0, info.name);
      NES.CHR.setPattern(1, spr.name);
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.split(null); ppu.scroll(0, 0); ppu.spriteMode(8); ppu.flickerStep = 0;
      ppu.clearSprites();
      ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
      ppu.setBackdrop(pal.bd);
      for (var i = 0; i < 4; i++) { ppu.setBgPalette(i, pal.bg[i]); ppu.setSprPalette(i, SPR_PAL[i]); }
      g.want.fill(0); g.have.fill(0); g.q.length = 0; g.wantA.fill(0); g.haveA.fill(0); g.qa.length = 0;
      art = info;
      build();
      flushMain(1 << 30);
      if (g.S && g.S.disp && g.mode === 'paint') g.S.disp.flushAll();
    });
  }
  function hideSprites(from, to) { for (var i = from; i <= to; i++) nes0.ppu.sprite(i, null); }
  function sp(i, x, y, nm, pal) { nes0.ppu.sprite(i, { x: x, y: y, tile: spr.s(nm), pal: pal || 0 }); }

  /* ================================================================ 標題 / 說明 / 清單 */
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.S = null;
    screen(ART.ui(), UI_PAL, function () {
      var L = 'STAR PAINT', c0 = 16 - L.length, i;
      for (i = 0; i < L.length; i++) {
        if (L.charAt(i) === ' ') continue;
        var q = art.big(L.charAt(i));
        put(c0 + i * 2, 2, q[0]); put(c0 + i * 2 + 1, 2, q[1]); put(c0 + i * 2, 3, q[2]); put(c0 + i * 2 + 1, 3, q[3]);
      }
      for (i = 2; i < 14; i++) putA(i, 1, 1);
      zhLine(-1, 4, ['#TITLE']);
      for (i = 4; i < 28; i++) put(i, 6, art.t('STRIPE'));
      for (i = 2; i < 14; i++) putA(i, 3, 2);
      // 選項：中文 2 列高（第 7 / 10 / 13 / 16 / 19 列起），英文小字放在下排；選項之間空一列
      for (i = 0; i < MODES.length; i++) { zhLine(7, 7 + i * 3, ['#' + MODES[i].zh]); text(16, 8 + i * 3, MODES[i].name); }
      text(1, 22, padR(bestLine(), 30));
      zhLine(-1, 24, ['#HOLD', ' START+SELECT ', '#MENU']);
      center(27, 'C/* = CHEAT   B = HELP');
    });
    AU.play('paint_title');
  }
  function bestLine() {
    var done = CT.load('paint', 'pages', 0) | 0, n = 0;
    for (var i = 0; i < 8; i++) if (done & (1 << i)) n++;
    var cb = CT.load('paint', 'copyBest', -1), gb = CT.load('paint', 'guessBest', 0) | 0;
    return 'BOOK ' + n + '/8  COPY ' + (cb < 0 ? '---' : pad(cb, 3)) + '  GUESS ' + pad(gb, 4);
  }
  function updateTitle() {
    if (pressed(BTN.UP)) { g.sel = (g.sel + MODES.length - 1) % MODES.length; AU.sfx('paint_ui'); }
    if (pressed(BTN.DOWN)) { g.sel = (g.sel + 1) % MODES.length; AU.sfx('paint_ui'); }
    if (pressed(BTN.B)) { enterHelp(0); return; }
    if (pressed(BTN.A) || pressed(BTN.START)) {
      AU.sfx('paint_pick');
      var k = MODES[g.sel].key;
      if (k === 'help') enterHelp(0);
      else if (k === 'book' || k === 'copy') enterList(k);
      else startPaint(k, 0);
    }
  }
  function drawTitle() {
    hideSprites(0, 11);
    sp(O_MENU, 5 * 8 - 2, (7 + g.sel * 3) * 8 + 4, 'BRUSH', 1);
  }

  var HELP = [
    ['CONTROLS', ['D-PAD   MOVE (HOLD = FAST)', 'B HOLD  FINE 1 PIXEL STEPS', 'A       DRAW / PRESS BUTTON', 'SELECT  JUMP CANVAS <> PANEL',
      'SELECT+< >  UNDO / REDO', 'SELECT+{ }  CHANGE TOOL', 'START   PAUSE MENU + SAVE', '', '%HOLD', 'C/* = CHEAT'], 'H_CTRL'],
    ['TOOLS', ['@pen|PEN     FREE HAND LINES', '@erase|ERASER  BACK TO PAPER', '@fill|FILL    FILL ONE AREA', '@line|LINE    A START  A END',
      '@rect|FRAME   HOLLOW BOX', '@box|BLOCK   SOLID BOX', '@oval|OVAL    OVAL IN A BOX', '@size|SIZE    PEN 1 2 3 PIXELS',
      '@undo|UNDO    STEP BACK (24)', '@redo|REDO    STEP AGAIN'], 'H_TOOL'],
    ['COLORS', ['4 ROWS X 3 COLORS + PAPER.', 'A ON A SWATCH PICKS IT.', 'A AGAIN EDITS IT:', '  < > HUE   { } LIGHT', '  A OK   B CANCEL', '',
      'EACH 16X16 BLOCK SHOWS', 'ONE COLOR ROW. THE ROW', 'USED MOST THERE WINS.', 'BIG FILLS DRAW IN STEPS.'], 'H_COLOR'],
    ['MODES', ['FREE DRAW: 4 SAVE SLOTS', '  AND SHARE CODES.', 'COLOR BOOK: FILL EVERY', '  AREA OF A PAGE.',
      'COPY: 120 SECONDS TO COPY', '  THE PICTURE. B OR BETTER', '  CLEARS IT.', 'QUICK GUESS: DRAW THE', '  SHAPE. CPU GUESSES IT.'], 'H_MODE']
  ];
  function enterHelp(p) {
    g.mode = 'help'; g.helpPage = p; g.t = 0;
    var H = HELP[p];
    screen(ART.ui(), UI_PAL, function () {
      zhLine(-1, 2, ['#' + H[2], '  ' + H[0] + ' ' + (p + 1) + '/' + HELP.length]);
      for (var i = 0; i < H[1].length; i++) {
        var s = H[1][i];
        if (s === '%HOLD') { zhLine(3, 4 + i * 2, ['#HOLD', ' START+SELECT ', '#MENU']); continue; }
        if (s.charAt(0) === '@') {
          var bar = s.indexOf('|'), nm = s.slice(1, bar);
          put(3, 5 + i * 2, art.t(ART.TOOL_ICON[nm]));
          text(5, 5 + i * 2, s.slice(bar + 1));
        } else text(3, 5 + i * 2, s);
      }
      center(27, '< > PAGE   A NEXT   B BACK');
    });
  }
  function updateHelp() {
    if (pressed(BTN.B)) { enterTitle(); return; }
    if (pressed(BTN.LEFT) && g.helpPage > 0) { AU.sfx('paint_ui'); enterHelp(g.helpPage - 1); return; }
    if (pressed(BTN.RIGHT) || pressed(BTN.A) || pressed(BTN.START)) {
      AU.sfx('paint_ui');
      if (g.helpPage + 1 < HELP.length) enterHelp(g.helpPage + 1); else enterTitle();
    }
  }

  function enterList(kind) {
    g.mode = 'list'; g.list = kind; g.t = 0;
    var arr = kind === 'book' ? PICS.BOOK : PICS.COPY;
    if (g.page >= arr.length) g.page = 0;
    screen(ART.ui(), UI_PAL, function () {
      zhLine(-1, 2, [kind === 'book' ? '#BOOK' : '#COPY', '  ' + (kind === 'book' ? 'COLOR BOOK' : 'COPY CHALLENGE')]);
      var done = CT.load('paint', 'pages', 0) | 0;
      for (var i = 0; i < arr.length; i++) {
        var right = '';
        if (kind === 'book') right = (done & (1 << i)) ? 'DONE*' : '';
        else { var b = CT.load('paint', 'copy' + i, -1); right = b < 0 ? '---' : pad(b, 3) + ' ' + C.rating(b); }
        text(5, 5 + i * 2, (i + 1) + ' ' + padR(arr[i].name, 12) + ' ' + padL(right, 5));
      }
      if (kind === 'book') zhLine(-1, 21, ['#FILLALL', '  FILL EVERY AREA']); else center(22, '120 SECONDS - B TO CLEAR');
      center(24, 'A START   B BACK');
      zhLine(-1, 26, ['#HOLD', ' START+SELECT ', '#MENU']);
    });
  }
  function updateList() {
    var arr = g.list === 'book' ? PICS.BOOK : PICS.COPY;
    if (pressed(BTN.UP)) { g.page = (g.page + arr.length - 1) % arr.length; AU.sfx('paint_ui'); }
    if (pressed(BTN.DOWN)) { g.page = (g.page + 1) % arr.length; AU.sfx('paint_ui'); }
    if (pressed(BTN.B)) { enterTitle(); return; }
    if (pressed(BTN.A) || pressed(BTN.START)) { AU.sfx('paint_pick'); startPaint(g.list, g.page); }
  }
  function drawList() { hideSprites(0, 11); sp(O_MENU, 3 * 8, (5 + g.page * 2) * 8, 'BRUSH', 1); }

  /* ================================================================ 畫布畫面 */
  function toolPos(i) { return [20 + 2 * (i % 5), 4 + 2 * ((i / 5) | 0)]; }
  function swPos(S, code) {
    if (S.kind === 'copy') return code ? [20 + 2 * (code - 1), 18] : [26, 18];
    if (S.kind === 'guess') return null;
    if (!code) return [26, 10];
    return [20 + 2 * ((code - 1) % 3), 10 + 2 * (((code - 1) / 3) | 0)];
  }
  function codesOf(S) { if (S.kind === 'copy') return [1, 2, 3, 0]; if (S.kind === 'guess') return []; return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0]; }
  function palObj(p13) { return { bd: p13[0], bg: [[p13[1], p13[2], p13[3]], [p13[4], p13[5], p13[6]], [p13[7], p13[8], p13[9]], [p13[10], p13[11], p13[12]]] }; }
  // 面板文字用哪一組：第 3 色與紙最對比的那組
  function uiGroup(p13) {
    var best = 0, bv = -1;
    for (var gi = 0; gi < 4; gi++) { var v = C.contrast(p13[1 + gi * 3 + 2], p13[0]); if (v > bv + 0.5) { bv = v; best = gi; } }
    return best;
  }
  function blockOwner(S, bx, by) {
    if (bx >= 1 && bx <= 8 && by >= 2 && by <= 9) return 'canvas';
    if (S.kind === 'copy' && bx >= 10 && bx <= 13 && by >= 5 && by <= 8) return 'thumb';
    if (S.kind === 'copy' && by === 9 && bx >= 10 && bx <= 12) return 0;
    if ((S.kind === 'free' || S.kind === 'book') && bx >= 10 && bx <= 12 && by >= 5 && by <= 8) return by - 5;
    return 'ui';
  }
  function uiAttrs(S) {
    for (var by = 0; by < 15; by++) for (var bx = 0; bx < 16; bx++) {
      var o = blockOwner(S, bx, by);
      if (o === 'canvas' || o === 'thumb') continue;
      putA(bx, by, o === 'ui' ? S.ug : o);
    }
  }

  function startPaint(kind, page) {
    var S = { kind: kind, page: page, tool: kind === 'book' ? 'fill' : 'pen', size: 1, color: kind === 'guess' ? 1 : 1,
      cur: { x: CVX + 64, y: CVY + 64 }, hold: 0, fineT: 0, last: null, penDown: false, anchor: null,
      jumpPos: { x: PX0 + 4, y: PY0 + 4 }, selHeld: false, selCombo: false,
      phase: 'intro', timer: 0, paused: false, menuSel: 0, slot: 1, edit: null, msg: '', msgT: 0, cheated: false,
      complete: false, regions: null, areasDone: 0, guess: null, res: null, syncLabel: 'SYNC', t: 0, codeMsg: '' };
    g.S = S; g.mode = 'paint'; g.t = 0;
    var tipKey = 'tip_' + kind, firstTime = !CT.load('paint', tipKey, 0);
    S.firstTip = firstTime;
    if (kind === 'free') { S.pal13 = (CT.load('paint', 'freePal', null) || PICS.FREE_PAL).slice(); S.ref = null; }
    else if (kind === 'book') { S.pal13 = PICS.BOOK[page].pal13.slice(); S.ref = PICS.book(page); }
    else if (kind === 'copy') { S.pal13 = PICS.COPY[page].pal13.slice(); S.ref = PICS.copy(page); S.color = 1; }
    else { S.pal13 = PICS.GUESS_PAL.slice(); S.ref = null; S.tool = 'pen'; S.size = 2; }
    if (kind === 'book' || kind === 'free') S.color = kind === 'book' ? 1 : 3;
    S.ug = uiGroup(S.pal13);
    S.model = new C.Model();
    if (kind === 'book') { S.model.pix.set(S.ref); S.regions = C.regions(S.ref, 12); }
    // free / book / copy 一律先給說明卡（第一次較長）；guess 也是
    S.phase = (kind === 'free' && !firstTime) ? 'draw' : 'intro';
    P.Art.reset();
    var info = ART.cv();
    spr = ART.spr();
    S.info = info;
    screen(info, palObj(S.pal13), function () {
      S.disp = new C.Disp(nes0, info);
      S.surf = S.disp.addSurface(C.canvasSurface(S.model, CV_COL, CV_ROW));
      S.model.onDirty = function (cell) { S.disp.mark(S.surf, cell); };
      S.disp.markAll(S.surf);
      if (kind === 'copy') { S.thumb = S.disp.addSurface(C.thumbSurface(S.ref, 20, 10)); S.disp.markAll(S.thumb); }
      buildPanel(S);
    });
    S.disp.batch = 0; S.disp.batchDone = 0;
    if (kind === 'guess') initGuess(S);
    AU.play(kind === 'copy' || kind === 'guess' ? 'paint_rush' : 'paint_draw');
    if (S.phase === 'intro') drawIntro(S); else drawBottom(S);
  }
  function buildPanel(S) {
    var i;
    // 外框
    put(1, 3, art.t('F_TL')); put(18, 3, art.t('F_TR')); put(1, 20, art.t('F_BL')); put(18, 20, art.t('F_BR'));
    for (i = 2; i <= 17; i++) { put(i, 3, art.t('F_T')); put(i, 20, art.t('F_B')); }
    for (i = 4; i <= 19; i++) { put(1, i, art.t('F_L')); put(18, i, art.t('F_R')); }
    for (i = 0; i < TOOLS.length; i++) { var p = toolPos(i); put(p[0], p[1], art.t(ART.TOOL_ICON[TOOLS[i]])); }
    var cs = codesOf(S);
    for (i = 0; i < cs.length; i++) {
      var q = swPos(S, cs[i]);
      put(q[0], q[1], cs[i] ? art.t('S' + C.idxOf(cs[i])) : art.t('PAPER'));
    }
    uiAttrs(S);
    drawHud(S);
  }
  function hudTitle(S) {
    if (S.kind === 'free') return 'FREE DRAW';
    if (S.kind === 'book') return PICS.BOOK[S.page].name;
    if (S.kind === 'copy') return 'COPY ' + PICS.COPY[S.page].name;
    return 'QUICK GUESS';
  }
  function drawHud(S) {
    if (S.paused) { text(1, 2, padR('PAUSE  HOLD START+SELECT: MENU', 30)); return; }
    text(1, 2, padR(hudTitle(S), 19));
    text(20, 2, padR('START:MENU', 11));
    text(20, 8, padR(TOOL_NAME[S.tool] + (S.tool === 'pen' || S.tool === 'erase' || S.tool === 'line' || S.tool === 'rect' || S.tool === 'oval' ? ' ' + S.size + 'PX' : ''), 11));
  }
  function drawBottom(S) {
    for (var r = 21; r <= 27; r++) clearRow(r, 1, 30);
    statusRow(S, true);
    infoRow(S);
    hintRow(S);
  }
  function statusRow(S, force) {
    var D = S.disp, pend = D.pending();
    var s;
    if (S.msgT > 0) s = padR(S.msg, 18);
    else if (pend && D.batch >= 12) {
      var pr = D.progress(), n = Math.round(pr * 10), bar = '';
      for (var i = 0; i < 10; i++) bar += i < n ? '#' : '_';
      s = padR(S.syncLabel, 5) + bar + padL(Math.round(pr * 100) + '%', 4);
    } else s = padR('', 18);
    text(1, 22, padR(s, 18));
    var full = D.approxN > 0;
    text(20, 22, full && (S.t & 16) ? 'CHR FULL!  ' : padR('CHR ' + padL(D.used(), 3) + '/' + D.capacity(), 11));
  }
  function infoRow(S) {
    var s = '';
    if (S.kind === 'free') s = 'SLOT ' + S.slot + (CT.load('paint', 'slot' + S.slot, null) ? ' USED' : ' EMPTY');
    else if (S.kind === 'book') s = (S.complete ? 'COMPLETE!  ' : 'AREAS ') + pad(S.areasDone, 2) + '/' + pad(S.regions.length, 2);
    else if (S.kind === 'copy') s = 'TIME ' + padL(secs(S.timer), 3) + (S.cheated ? '  CHEAT' : '');
    else if (S.guess) { text(1, 24, padR('ROUND ' + Math.min(S.guess.total, S.guess.round + 1) + '/' + S.guess.total + ' ' + pad(S.guess.score, 4), 18)); infoTime(S); return; }
    text(1, 24, padR(s, 30));
  }
  function hintRow(S) {
    var s;
    if (S.edit) s = 'A OK  B CANCEL';
    else if (onPanel(S)) s = 'A PICK   SELECT: TO CANVAS';
    else if (S.anchor) s = 'A SET END  (SAME = CANCEL)';
    else s = 'A ' + (S.tool === 'fill' ? 'FILL' : 'DRAW') + '  B FINE  SELECT: PANEL';
    text(1, 26, padR(s, 30));
  }
  function msg(S, s, t) { S.msg = s; S.msgT = t || 120; }

  function drawIntro(S) {
    for (var r = 21; r <= 27; r++) clearRow(r, 1, 30);
    var L;
    if (S.kind === 'free') L = ['DRAW ANYTHING YOU LIKE.', 'SELECT JUMPS TO THE PANEL.', 'EACH 16X16 BLOCK: ONE ROW.'];
    else if (S.kind === 'book') L = ['PICK A COLOR ON THE RIGHT,', 'THEN FILL EACH AREA.', 'FILL EVERY AREA TO FINISH.'];
    else if (S.kind === 'copy') L = ['COPY THE PICTURE AT RIGHT.', '120 SECONDS. BLOCK TOOL', 'HELPS. B RANK OR BETTER!'];
    else L = ['DRAW THE SHAPE I ASK FOR.', 'I WILL TRY TO GUESS IT.', '6 ROUNDS, 25 SECONDS EACH.'];
    text(1, 21, L[0]); text(1, 23, L[1]); text(1, 25, L[2]);
    text(1, 27, 'PRESS A TO START');
  }
  function beginDraw(S) {
    S.phase = 'draw';
    CT.save('paint', 'tip_' + S.kind, 1);
    if (S.kind === 'copy') S.timer = PICS.COPY[S.page].time;
    if (S.kind === 'guess') nextRound(S, true);
    drawBottom(S);
  }

  /* ---------------- 輸入 ---------------- */
  function pressed(b) { return NES.Input.pressed(b); }
  function held(b) { return NES.Input.held(b); }
  function onCanvas(S) { return S.cur.x >= CVX && S.cur.x < CVX + 128 && S.cur.y >= CVY && S.cur.y < CVY + 128; }
  function onPanel(S) { return S.cur.x >= PX0 - 8; }
  function cpos(S) { return [S.cur.x - CVX, S.cur.y - CVY]; }
  function moveCursor(S) {
    var m = NES.Input.mask() & DIRS, dx = 0, dy = 0;
    if (!m) { S.hold = 0; return; }
    S.hold++;
    var step;
    if (held(BTN.B)) step = (S.hold === 1 || (S.hold > 12 && (S.hold & 3) === 0)) ? 1 : 0;
    else step = S.hold <= 8 ? 1 : 3;
    if (m & BTN.LEFT) dx = -step; else if (m & BTN.RIGHT) dx = step;
    if (m & BTN.UP) dy = -step; else if (m & BTN.DOWN) dy = step;
    S.cur.x = Math.max(CVX, Math.min(PX1, S.cur.x + dx));
    S.cur.y = Math.max(PY0, Math.min(PY1, S.cur.y + dy));
  }

  function updatePaint() {
    var S = g.S;
    S.t++;
    if (S.msgT > 0 && --S.msgT === 0) { /* 訊息到期 */ }
    if (S.paused) { updateMenu(S); return; }
    if (pressed(BTN.START) && !held(BTN.SELECT) && S.phase !== 'intro') { openMenu(S); return; }
    if (S.phase === 'intro') { if (pressed(BTN.A) || pressed(BTN.START)) { AU.sfx('paint_pick'); beginDraw(S); } return; }
    if (S.phase === 'result') { updateResult(S); return; }
    if (S.phase === 'between') { if (--S.waitT <= 0) nextRound(S, false); return; }
    if (S.edit) { updateEdit(S); return; }
    // SELECT 組合鍵
    if (held(BTN.SELECT)) {
      if (!S.selHeld) { S.selHeld = true; S.selCombo = false; }
      if (pressed(BTN.LEFT)) { S.selCombo = true; doUndo(S); }
      else if (pressed(BTN.RIGHT)) { S.selCombo = true; doRedo(S); }
      else if (pressed(BTN.UP) || pressed(BTN.DOWN)) {
        S.selCombo = true;
        var order = ['pen', 'erase', 'fill', 'line', 'rect', 'box', 'oval'], ti = order.indexOf(S.tool);
        ti = (ti + (pressed(BTN.UP) ? order.length - 1 : 1)) % order.length;
        setTool(S, order[ti < 0 ? 0 : ti]);
      }
      return;
    }
    if (S.selHeld) {
      S.selHeld = false;
      if (!S.selCombo) {           // 單按 SELECT：畫布 ↔ 面板
        var keep = { x: S.cur.x, y: S.cur.y };
        S.cur.x = S.jumpPos.x; S.cur.y = S.jumpPos.y; S.jumpPos = keep;
        S.penDown = false; AU.sfx('paint_ui');
      }
    }
    moveCursor(S);
    if (S.kind === 'copy') {
      S.timer--;
      if (S.timer > 0 && S.timer <= 600 && S.timer % 60 === 0) AU.sfx('paint_tick');
      if (S.timer <= 0) { finishCopy(S); return; }
    }
    if (S.kind === 'guess') updateGuess(S);
    if (S.phase !== 'draw') return;
    // A
    var a = pressed(BTN.A), ah = held(BTN.A);
    if (a && onPanel(S)) { panelClick(S); return; }
    var inC = onCanvas(S), p = cpos(S);
    if (S.tool === 'pen' || S.tool === 'erase') {
      var code = S.tool === 'erase' ? 0 : S.color;
      if (a && inC) { S.model.push(); S.model.brush(p[0], p[1], code, S.size); S.penDown = true; S.last = p; AU.sfx('paint_dot'); }
      else if (ah && S.penDown) {
        if (inC) {
          if (!S.last) S.model.brush(p[0], p[1], code, S.size);
          else if (S.last[0] !== p[0] || S.last[1] !== p[1]) S.model.line(S.last[0], S.last[1], p[0], p[1], code, S.size);
          S.last = p;
        } else S.last = null;
      }
      if (!ah) S.penDown = false;
    } else if (S.tool === 'fill') {
      if (a && inC) {
        if (S.model.get(p[0], p[1]) !== S.color) {
          S.model.push(); S.syncLabel = 'FILL'; S.disp.batch = 0; S.disp.batchDone = 0;
          var n = S.model.flood(p[0], p[1], S.color);
          if (n) AU.sfx('paint_fill');
        }
      }
    } else if (a && inC) {
      if (!S.anchor) { S.anchor = p; AU.sfx('paint_dot'); hintRow(S); }
      else {
        var q = S.anchor; S.anchor = null;
        if (q[0] === p[0] && q[1] === p[1]) { AU.sfx('paint_undo'); hintRow(S); return; }
        S.model.push(); S.syncLabel = 'DRAW'; S.disp.batch = 0; S.disp.batchDone = 0;
        if (S.tool === 'line') S.model.line(q[0], q[1], p[0], p[1], S.color, S.size);
        else if (S.tool === 'rect') S.model.rect(q[0], q[1], p[0], p[1], S.color, S.size);
        else if (S.tool === 'box') S.model.box(q[0], q[1], p[0], p[1], S.color);
        else if (S.tool === 'oval') S.model.ellipse(q[0], q[1], p[0], p[1], S.color, S.size);
        AU.sfx('paint_stamp'); hintRow(S);
      }
    }
  }
  function setTool(S, t) { S.tool = t; S.anchor = null; S.penDown = false; AU.sfx('paint_ui'); drawHud(S); hintRow(S); }
  function doUndo(S) { S.anchor = null; S.syncLabel = 'UNDO'; S.disp.batch = 0; S.disp.batchDone = 0; if (S.model.undo()) AU.sfx('paint_undo'); else { AU.sfx('paint_ng'); msg(S, 'NOTHING TO UNDO', 60); } }
  function doRedo(S) { S.anchor = null; S.syncLabel = 'REDO'; S.disp.batch = 0; S.disp.batchDone = 0; if (S.model.redo()) AU.sfx('paint_undo'); else { AU.sfx('paint_ng'); msg(S, 'NOTHING TO REDO', 60); } }

  function panelClick(S) {
    var col = S.cur.x >> 3, row = S.cur.y >> 3, i;
    for (i = 0; i < TOOLS.length; i++) {
      var p = toolPos(i);
      if (p[0] === col && p[1] === row) {
        var t = TOOLS[i];
        if (t === 'undo') doUndo(S);
        else if (t === 'redo') doRedo(S);
        else if (t === 'size') { S.size = S.size % 3 + 1; AU.sfx('paint_ui'); drawHud(S); }
        else setTool(S, t);
        return;
      }
    }
    var cs = codesOf(S);
    for (i = 0; i < cs.length; i++) {
      var q = swPos(S, cs[i]);
      if (q[0] === col && q[1] === row) {
        if (S.color === cs[i] && (S.kind === 'free' || S.kind === 'book')) openEdit(S, cs[i]);
        else { S.color = cs[i]; if (S.tool === 'erase') S.tool = 'pen'; AU.sfx('paint_pick'); drawHud(S); }
        return;
      }
    }
  }

  /* ---------------- 改色（即時寫 PPU 調色盤） ---------------- */
  function palIndex(code) { return code ? code : 0; }   // pal13 的索引：0 = 紙，1..12 = 組 × 3 + 色
  function openEdit(S, code) {
    var c = S.pal13[palIndex(code)], hl = C.hueLum(c);
    S.edit = { code: code, orig: c, h: hl[0], l: hl[1], t: 0 };
    AU.sfx('paint_pick'); editRows(S);
  }
  function editRows(S) {
    var E = S.edit, c = C.fromHueLum(E.h, E.l);
    for (var r = 21; r <= 27; r++) clearRow(r, 1, 30);
    text(1, 22, padR('EDIT ' + (E.code ? 'ROW ' + (C.grpOf(E.code) + 1) + ' COLOR ' + C.idxOf(E.code) : 'PAPER') + '  $' + ('0' + c.toString(16).toUpperCase()).slice(-2), 30));
    text(1, 24, padR('< > HUE ' + pad(E.h, 2) + '   { } LIGHT ' + E.l, 30));
    hintRow(S);
  }
  function applyColor(S, code, c) {
    S.pal13[palIndex(code)] = c;
    var ppu = nes0.ppu;
    if (!code) ppu.setBackdrop(c);
    else { var gi = C.grpOf(code); ppu.setBgPalette(gi, [S.pal13[1 + gi * 3], S.pal13[2 + gi * 3], S.pal13[3 + gi * 3]]); }
    var ug = uiGroup(S.pal13);
    if (ug !== S.ug) { S.ug = ug; uiAttrs(S); }
  }
  function updateEdit(S) {
    var E = S.edit, ch = false;
    if (pressed(BTN.LEFT)) { E.h = (E.h + 13) % 14; ch = true; }
    if (pressed(BTN.RIGHT)) { E.h = (E.h + 1) % 14; ch = true; }
    if (pressed(BTN.UP) && E.l < 3) { E.l++; ch = true; }
    if (pressed(BTN.DOWN) && E.l > 0) { E.l--; ch = true; }
    if (ch) { applyColor(S, E.code, C.fromHueLum(E.h, E.l)); AU.sfx('paint_ui'); editRows(S); }
    if (pressed(BTN.A)) { S.edit = null; AU.sfx('paint_ok'); if (S.kind === 'free') CT.save('paint', 'freePal', S.pal13); drawBottom(S); return; }
    if (pressed(BTN.B)) { applyColor(S, E.code, E.orig); S.edit = null; AU.sfx('paint_undo'); drawBottom(S); }
  }

  /* ---------------- 暫停選單 ---------------- */
  function menuItems(S) {
    if (S.kind === 'free') return ['RESUME', 'SAVE TO SLOT <' + S.slot + '>', 'LOAD SLOT <' + S.slot + '>', 'SHARE CODE <' + (S.share ? 'PASTE' : 'COPY') + '>', 'CLEAR CANVAS', 'QUIT TO TITLE'];
    if (S.kind === 'book') return ['RESUME', 'SAVE TO SLOT <' + S.slot + '>', 'START PAGE OVER', 'QUIT TO LIST'];
    if (S.kind === 'copy') return ['RESUME', 'FINISH NOW', 'QUIT TO LIST'];
    return ['RESUME', 'SKIP THIS ROUND', 'QUIT TO TITLE'];
  }
  function openMenu(S) {
    S.paused = true; S.menuSel = 0; S.penDown = false; S.anchor = null; S.menuMsg = '';
    AU.pause(); AU.sfx('paint_ui');
    menuRows(S); drawHud(S);
  }
  function menuRows(S) {
    var it = menuItems(S);
    for (var r = 21; r <= 27; r++) clearRow(r, 1, 30);
    for (var i = 0; i < it.length; i++) text(3, 21 + i, padR(it[i], 20));
    text(3, 27, padR(S.menuMsg || '{ } CHOOSE  A OK  B BACK', 27));
  }
  function closeMenu(S) {
    S.paused = false; AU.resume(); drawHud(S);
    if (S.phase === 'intro') drawIntro(S); else if (S.phase === 'result') resultRows(S); else drawBottom(S);
  }
  function updateMenu(S) {
    var it = menuItems(S), n = it.length, name = it[S.menuSel];
    if (pressed(BTN.UP)) { S.menuSel = (S.menuSel + n - 1) % n; AU.sfx('paint_ui'); }
    if (pressed(BTN.DOWN)) { S.menuSel = (S.menuSel + 1) % n; AU.sfx('paint_ui'); }
    if ((pressed(BTN.LEFT) || pressed(BTN.RIGHT)) && name.indexOf('SLOT') >= 0) {
      S.slot = pressed(BTN.LEFT) ? (S.slot + 2) % 4 + 1 : S.slot % 4 + 1; AU.sfx('paint_ui'); S.menuMsg = slotInfo(S.slot); menuRows(S);
    }
    if ((pressed(BTN.LEFT) || pressed(BTN.RIGHT)) && name.indexOf('SHARE CODE') === 0) { S.share = !S.share; AU.sfx('paint_ui'); S.menuMsg = ''; menuRows(S); }
    if (pressed(BTN.UP) || pressed(BTN.DOWN)) { if (S.menuMsg) { S.menuMsg = ''; menuRows(S); } }
    if (pressed(BTN.START) || pressed(BTN.B)) { closeMenu(S); return; }
    if (!pressed(BTN.A)) return;
    AU.sfx('paint_pick');
    if (name === 'RESUME') { closeMenu(S); return; }
    if (name.indexOf('SAVE TO SLOT') === 0) { CT.save('paint', 'slot' + S.slot, C.encode(S.model.pix, S.pal13)); S.menuMsg = 'SAVED TO SLOT ' + S.slot; AU.sfx('paint_ok'); menuRows(S); return; }
    if (name.indexOf('LOAD SLOT') === 0) {
      var sv = CT.load('paint', 'slot' + S.slot, null);
      if (!sv || !loadCode(S, sv)) { S.menuMsg = 'SLOT ' + S.slot + ' IS EMPTY'; AU.sfx('paint_ng'); menuRows(S); return; }
      closeMenu(S); msg(S, 'LOADED SLOT ' + S.slot, 90); return;
    }
    if (name === 'SHARE CODE <COPY>') {
      var code = C.encode(S.model.pix, S.pal13); g.lastCode = code;
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(function () { }); } catch (e) { }
      S.menuMsg = 'COPIED ' + code.length + ' CHARS'; AU.sfx('paint_ok'); menuRows(S); return;
    }
    if (name === 'SHARE CODE <PASTE>') {
      var str = null;
      try { str = window.prompt ? window.prompt('STAR PAINT share code (SP1...)', '') : null; } catch (e) { str = null; }
      if (str && loadCode(S, str)) { closeMenu(S); msg(S, 'CODE LOADED', 90); return; }
      S.menuMsg = str ? 'BAD CODE - CHECK IT' : 'NO CODE PASTED'; AU.sfx('paint_ng'); menuRows(S); return;
    }
    if (name === 'CLEAR CANVAS' || name === 'START PAGE OVER') {
      S.model.push(); S.syncLabel = 'CLEAR'; S.disp.batch = 0; S.disp.batchDone = 0;
      if (S.kind === 'book') S.model.load(S.ref); else S.model.clear(0);
      closeMenu(S); return;
    }
    if (name === 'FINISH NOW') { S.paused = false; AU.resume(); drawHud(S); finishCopy(S); return; }
    if (name === 'SKIP THIS ROUND') { closeMenu(S); endRound(S, false); return; }
    if (name === 'QUIT TO LIST') { quitPaint(S); enterList(S.kind); return; }
    if (name === 'QUIT TO TITLE') { quitPaint(S); enterTitle(); }
  }
  function slotInfo(n) { return 'SLOT ' + n + (CT.load('paint', 'slot' + n, null) ? ' HAS A PICTURE' : ' IS EMPTY'); }
  function quitPaint(S) { if (S.kind === 'guess' && S.guess) saveGuess(S); AU.stop(); }
  function loadCode(S, str) {
    var d = C.decode(str);
    if (!d) return false;
    S.model.push(); S.syncLabel = 'LOAD'; S.disp.batch = 0; S.disp.batchDone = 0;
    S.model.load(d.pix);
    for (var i = 0; i < 13; i++) S.pal13[i] = d.pal[i];
    var ppu = nes0.ppu; ppu.setBackdrop(S.pal13[0]);
    for (var gi = 0; gi < 4; gi++) ppu.setBgPalette(gi, [S.pal13[1 + gi * 3], S.pal13[2 + gi * 3], S.pal13[3 + gi * 3]]);
    S.ug = uiGroup(S.pal13); uiAttrs(S);
    if (S.kind === 'free') CT.save('paint', 'freePal', S.pal13);
    return true;
  }

  /* ---------------- 著色本 ---------------- */
  function checkBook(S) {
    if (S.kind !== 'book' || !S.regions) return;
    var done = 0, pix = S.model.pix;
    for (var i = 0; i < S.regions.length; i++) {
      var R = S.regions[i], n = 0;
      for (var j = 0; j < R.list.length; j++) if (pix[R.list[j]]) n++;
      if (n >= R.list.length * 0.9) done++;
    }
    var was = S.areasDone; S.areasDone = done;
    if (!S.complete && done === S.regions.length && S.disp.pending() === 0) {
      S.complete = true;
      var bits = CT.load('paint', 'pages', 0) | 0;
      if (!S.cheated) { CT.save('paint', 'pages', bits | (1 << S.page)); g.goalBook = true; }
      AU.stop(); AU.play('paint_done'); S.doneT = 200;
      msg(S, 'PAGE COMPLETE!', 240);
      infoRow(S);
    }
    if (was !== done) infoRow(S);
  }

  /* ---------------- 臨摹 ---------------- */
  function finishCopy(S) {
    var r = C.score(S.model.pix, S.ref);
    S.res = r; S.phase = 'result'; S.anchor = null; S.penDown = false;
    var best = CT.load('paint', 'copy' + S.page, -1);
    if (!S.cheated) {
      if (r.score > best) CT.save('paint', 'copy' + S.page, r.score);
      if (r.score > CT.load('paint', 'copyBest', -1)) CT.save('paint', 'copyBest', r.score);
      if (r.score >= C.PASS) g.goalCopy = true;
    }
    AU.stop(); AU.play('paint_done');
    AU.sfx(r.score >= C.PASS ? 'paint_ok' : 'paint_ng');
    resultRows(S);
  }
  function resultRows(S) {
    for (var r = 21; r <= 27; r++) clearRow(r, 1, 30);
    if (S.kind === 'copy') {
      var R = S.res, best = CT.load('paint', 'copy' + S.page, -1);
      text(1, 21, padR('SCORE ' + pad(R.score, 3) + '   RANK ' + R.rating, 30));
      text(1, 23, padR('SHAPE ' + pad(Math.round(R.f1 * 100), 3) + '  COLOR ' + pad(Math.round(R.color * 100), 3) + '  BEST ' + (best < 0 ? '---' : pad(best, 3)), 30));
      text(1, 25, padR(R.score >= C.PASS ? (S.cheated ? 'NICE! (CHEAT - NO RECORD)' : 'CLEAR! WELL DONE') : 'NEED ' + pad(C.PASS, 3) + ' FOR RANK B', 30));
      text(1, 27, padR('A RETRY  B LIST  C/* MORE', 30));
    } else {
      var G = S.guess;
      text(1, 21, padR('GOT ' + G.got + '/' + G.total + '   SCORE ' + pad(G.score, 4), 30));
      text(1, 23, padR('BEST ' + pad(Math.max(G.score, CT.load('paint', 'guessBest', 0) | 0), 4), 30));
      text(1, 25, padR(G.got >= G.total - 1 ? 'GREAT SKETCHING!' : 'KEEP PRACTICING!', 30));
      text(1, 27, padR('A AGAIN  B TITLE  C/* +1', 30));
    }
  }
  function updateResult(S) {
    if (pressed(BTN.A)) { AU.sfx('paint_pick'); startPaint(S.kind, S.page); return; }
    if (pressed(BTN.B)) { AU.sfx('paint_ui'); AU.stop(); if (S.kind === 'copy') enterList('copy'); else enterTitle(); }
  }

  /* ---------------- 快畫猜猜 ---------------- */
  function initGuess(S) {
    var order = C.SHAPES.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    S.guess = { order: order, round: -1, total: GUESS_ROUNDS, score: 0, got: 0, label: null, said: '', t: 0 };
  }
  function nextRound(S, first) {
    var G = S.guess;
    G.round++;
    if (G.round >= G.total) { endGuess(S); return; }
    if (G.round >= G.order.length) G.order.push(C.SHAPES[Math.floor(rnd() * C.SHAPES.length)]);
    G.want = G.order[G.round]; G.t = GUESS_TIME; G.label = null; G.said = '';
    S.phase = 'draw';
    if (!first) { S.model.push(); S.syncLabel = 'CLEAR'; S.disp.batch = 0; S.disp.batchDone = 0; S.model.clear(0); S.model.resetHistory(); }
    text(1, 2, padR('DRAW: ' + G.want, 18));
    guessPanel(S, 'READY...', '', '');
    infoRow(S);
  }
  function guessPanel(S, a, b, c) { text(20, 12, padR(a, 11)); text(20, 14, padR(b, 11)); text(20, 16, padR(c, 11)); text(20, 10, 'CPU SAYS:  '); }
  function updateGuess(S) {
    var G = S.guess;
    if (!G || S.phase !== 'draw') return;
    G.t--;
    if (G.t % 60 === 0) infoTime(S);
    if (G.t > 0 && G.t <= 300 && G.t % 60 === 0) AU.sfx('paint_tick');
    if ((GUESS_TIME - G.t) % GUESS_EVERY === 0) {
      var r = C.classify(S.model.pix);
      G.label = r.label;
      if (!r.label) guessPanel(S, 'HMM...', '', '');
      else if (r.label === G.want) { endRound(S, true); return; }
      else { guessPanel(S, 'IS IT A', r.label + '?', ''); if (r.label !== G.said) AU.sfx('paint_guess'); G.said = r.label; }
    }
    if (G.t <= 0) endRound(S, false);
  }
  function infoTime(S) { var G = S.guess; text(20, 24, padR(G.round >= 0 ? 'TIME ' + padL(secs(G.t), 2) : '', 10)); }
  function endRound(S, got) {
    var G = S.guess;
    if (got) { G.got++; G.score += 100 + secs(G.t) * 10; guessPanel(S, 'I GOT IT!', G.want + '!', '+' + (100 + secs(G.t) * 10)); AU.sfx('paint_ok'); }
    else { guessPanel(S, 'TIME UP!', 'IT WAS A', G.want); AU.sfx('paint_ng'); }
    S.phase = 'between'; S.waitT = 100; S.anchor = null; S.penDown = false;
    infoRow(S);
  }
  function endGuess(S) {
    S.phase = 'result'; saveGuess(S);
    AU.stop(); AU.play('paint_done');
    resultRows(S);
  }
  function saveGuess(S) { if (!S.cheated && S.guess.score > (CT.load('paint', 'guessBest', 0) | 0)) CT.save('paint', 'guessBest', S.guess.score); }

  /* ---------------- 密技 ---------------- */
  function doCheat() {
    var S = g.S;
    if (!S || g.mode !== 'paint' || S.phase === 'intro' || S.paused) return false;
    if (S.kind === 'book' && S.phase === 'draw' && !S.complete) {
      var best = null, pix = S.model.pix;
      for (var i = 0; i < S.regions.length; i++) {
        var R = S.regions[i], n = 0;
        for (var j = 0; j < R.list.length; j++) if (pix[R.list[j]]) n++;
        if (n < R.list.length * 0.9 && (!best || R.size > best.size)) best = R;
      }
      if (!best) return false;
      S.cheated = true; S.model.push();
      for (var k = 0; k < best.list.length; k++) { var q = best.list[k]; if (!pix[q]) S.model.set(q & 127, q >> 7, S.color || 1); }
      msg(S, 'CHEAT: AREA FILLED', 90); AU.sfx('paint_fill'); return true;
    }
    if (S.kind === 'copy') {
      S.cheated = true;
      if (S.phase === 'result') { S.phase = 'draw'; S.timer = COPY_CHEAT; AU.play('paint_rush'); drawBottom(S); }
      else S.timer += COPY_CHEAT;
      msg(S, 'CHEAT: +30 SECONDS', 90); AU.sfx('paint_ok'); return true;
    }
    if (S.kind === 'guess') {
      S.cheated = true;
      if (S.phase === 'result') { S.guess.total++; S.guess.round--; AU.play('paint_rush'); drawBottom(S); nextRound(S, false); return true; }
      if (S.phase === 'draw') { endRound(S, true); return true; }
    }
    return false;
  }

  /* ================================================================ 繪製 */
  function drawPaint() {
    var S = g.S, ppu = nes0.ppu, i;
    // 游標
    if (S.phase === 'intro') { sp(O_CUR, -16, -16, 'BLANK'); }
    else if (onPanel(S) || !onCanvas(S)) sp(O_CUR, S.cur.x, S.cur.y, 'PTR', 0);
    else sp(O_CUR, S.cur.x - 3, S.cur.y - 3, 'CROSS', 0);
    // 錨點 + 預覽
    hideSprites(O_ANCH, O_PRE + 7);
    if (S.anchor && !S.paused) {
      var ax = S.anchor[0] + CVX, ay = S.anchor[1] + CVY, bx = Math.max(CVX, Math.min(CVX + 127, S.cur.x)), by = Math.max(CVY, Math.min(CVY + 127, S.cur.y));
      sp(O_ANCH, ax - 3, ay - 3, 'ANCH', 1);
      var pts = [];
      if (S.tool === 'line') for (i = 1; i <= 4; i++) pts.push([ax + (bx - ax) * i / 5, ay + (by - ay) * i / 5]);
      else if (S.tool === 'rect' || S.tool === 'box') { pts.push([ax, by], [bx, ay]); }
      else if (S.tool === 'oval') {
        var cx = (ax + bx) / 2, cy = (ay + by) / 2, rx = Math.abs(bx - ax) / 2, ry = Math.abs(by - ay) / 2;
        for (i = 0; i < 8; i++) { var an = i * Math.PI / 4; pts.push([cx + rx * Math.cos(an), cy + ry * Math.sin(an)]); }
      }
      for (i = 0; i < pts.length && i < 8; i++) sp(O_PRE + i, Math.round(pts[i][0]) - 3, Math.round(pts[i][1]) - 3, 'DOT', 2);
    }
    // 工具底線 / 色票標記
    var ti = TOOLS.indexOf(S.tool), tp = toolPos(ti);
    sp(O_UND, tp[0] * 8, tp[1] * 8 + 8, 'UND', 3);
    var sw = swPos(S, S.color);
    if (sw && !S.paused) sp(O_MARK, sw[0] * 8, sw[1] * 8 + 8, 'MARK', S.edit ? (S.t & 8 ? 1 : 3) : 3); else ppu.sprite(O_MARK, null);
    if (S.paused) sp(O_MENU, 1 * 8 + 2, (21 + S.menuSel) * 8, 'MENU', 1); else ppu.sprite(O_MENU, null);
  }
  function hudLive(S) {
    if (S.paused || S.edit) return;
    if (S.phase === 'draw' || S.phase === 'between') statusRow(S);
    if (S.kind === 'copy' && S.phase === 'draw' && S.timer % 30 === 0) infoRow(S);
    if (S.kind === 'guess' && S.phase === 'draw') { /* 時間在 infoTime */ }
    if (S.phase === 'draw' && (S.t % 4 === 0)) hintRow(S);
  }

  /* ================================================================ 機器人（只讀畫面） */
  var BOT = { q: [], hold: 0, tapT: 0, lagT: 0, cur: null };
  function botReset() { BOT.q.length = 0; BOT.hold = 0; BOT.cur = null; BOT.lagT = 0; }
  function bq(step) { BOT.q.push(step); }
  function bWait(n) { bq({ wait: n }); }
  function bTap(m) { bWait(BOT_LAG); bq({ tap: m }); }
  function bMove(x, y) { bq({ move: [x, y] }); }
  function frameAt(x, y) { var f = nes0.ppu.indexFrame; return f ? f[y * 256 + x] : -1; }
  function botMoveMask(S, tx, ty) {
    var dx = tx - S.cur.x, dy = ty - S.cur.y;
    if (!dx && !dy) { BOT.hold = 0; return -1; }
    var next = (BOT.hold + 1) <= 8 ? 1 : 3, m = 0;
    if (Math.abs(dx) >= next) m |= dx < 0 ? BTN.LEFT : BTN.RIGHT;
    if (Math.abs(dy) >= next) m |= dy < 0 ? BTN.UP : BTN.DOWN;
    if (!m) { BOT.hold = 0; return 0; }
    BOT.hold++;
    return m;
  }
  function botStep() {
    var S = g.S;
    while (BOT.q.length) {
      var st = BOT.q[0];
      if (st.wait !== undefined) { if (st.wait-- > 0) return 0; BOT.q.shift(); continue; }
      if (st.tap !== undefined) { if (!st.done) { st.done = 1; return st.tap; } BOT.q.shift(); return 0; }
      if (st.until) { if (!st.until()) return 0; BOT.q.shift(); continue; }
      if (st.call) { BOT.q.shift(); var rest = BOT.q; BOT.q = []; st.call(); BOT.q = BOT.q.concat(rest); continue; }
      if (st.move) {
        if (!S) { BOT.q.shift(); continue; }
        var m = botMoveMask(S, st.move[0], st.move[1]);
        if (m < 0) { BOT.q.shift(); continue; }
        return m;
      }
      BOT.q.shift();
    }
    return null;
  }
  function botMask() {
    var r = botStep();
    if (r !== null) return r;
    botPlan();
    r = botStep();
    return r === null ? 0 : r;
  }
  function botPlan() {
    var S = g.S;
    if (g.goalBook && g.goalCopy) { bWait(60); return; }
    if (g.mode === 'title') {
      var want = !g.goalBook ? 1 : 2;
      if (g.sel !== want) { bTap(g.sel < want ? BTN.DOWN : BTN.UP); return; }
      bTap(BTN.A); bWait(10); return;
    }
    if (g.mode === 'help') { bTap(BTN.B); return; }
    if (g.mode === 'list') {
      var wantL = !g.goalBook ? 'book' : 'copy';
      if (g.list !== wantL) { bTap(BTN.B); return; }
      if (g.page !== 0) { bTap(BTN.UP); return; }
      bTap(BTN.A); bWait(10); return;
    }
    if (g.mode !== 'paint' || !S) { bWait(10); return; }
    if (S.paused) { bTap(BTN.START); return; }
    if (S.phase === 'intro') { bTap(BTN.A); return; }
    if (S.kind === 'book') {
      if (S.complete || g.goalBook) { botMenu(S, 'QUIT TO LIST'); return; }
      botBook(S); return;
    }
    if (S.kind === 'copy') {
      if (S.phase === 'result') { if (g.goalCopy) bWait(30); else bTap(BTN.A); return; }
      if (S.botDone) { botMenu(S, 'FINISH NOW'); return; }
      botCopy(S); return;
    }
    // 其他模式：回標題
    botMenu(S, S.kind === 'free' || S.kind === 'guess' ? 'QUIT TO TITLE' : 'QUIT TO LIST');
  }
  function botMenu(S, item) {
    bTap(BTN.START); bWait(4);
    bq({ call: function () {
      var it = menuItems(S), want = -1;
      for (var i = 0; i < it.length; i++) if (it[i] === item) want = i;
      for (var k = 0; k < want; k++) { bTap(BTN.DOWN); }
      bTap(BTN.A); bWait(10);
    } });
  }
  function toolXY(name) { var p = toolPos(TOOLS.indexOf(name)); return [p[0] * 8 + 3, p[1] * 8 + 3]; }
  function swXY(S, code) { var p = swPos(S, code); return [p[0] * 8 + 3, p[1] * 8 + 3]; }
  function botUse(S, name) { var t = toolXY(name); bMove(t[0], t[1]); bTap(BTN.A); }
  var SAFE = [148, 36];
  function cursorAway(S) { return S.cur.x === SAFE[0] && S.cur.y === SAFE[1]; }
  function botBook(S) {
    if (!cursorAway(S)) { bMove(SAFE[0], SAFE[1]); bWait(2); return; }
    // 從畫面讀：紙色（底色）以外都是線 → 找封閉的紙色區
    var bd = nes0.ppu.backdrop, mask = new Uint8Array(C.N);
    for (var y = 0; y < 128; y++) for (var x = 0; x < 128; x++) mask[y * 128 + x] = frameAt(CVX + x, CVY + y) === bd ? 0 : 1;
    var regs = C.regions(mask, 12);
    if (!regs.length) { bq({ until: function () { return S.disp.pending() === 0; } }); bWait(30); return; }
    var CODES = [1, 2, 4, 5, 7, 8, 10, 11], byCode = {};
    regs.forEach(function (r, i) { var c = CODES[i % CODES.length]; (byCode[c] = byCode[c] || []).push(r); });
    if (S.tool !== 'fill') botUse(S, 'fill');
    Object.keys(byCode).forEach(function (k) {
      var c = +k, sw = swXY(S, c);
      bq({ call: function () { if (S.color !== c) { bMove(sw[0], sw[1]); bTap(BTN.A); } } });
      byCode[k].forEach(function (r) {
        bMove(CVX + r.seed[0], CVY + r.seed[1]); bTap(BTN.A);
        bq({ until: function () { return S.disp.pending() === 0; } });
      });
    });
    bWait(30);
  }
  function botCopy(S) {
    if (!cursorAway(S)) { bMove(SAFE[0], SAFE[1]); bWait(2); return; }
    // 從畫面讀範例縮圖（x160..223, y80..143）與色票（第 18 列）
    var map = {}, bd = nes0.ppu.backdrop, codes = [1, 2, 3], i, x, y;
    for (i = 0; i < codes.length; i++) { var p = swPos(S, codes[i]); map[frameAt(p[0] * 8 + 3, p[1] * 8 + 3)] = codes[i]; }
    var ref = new Uint8Array(64 * 64);
    for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) { var c = frameAt(160 + x, 80 + y); ref[y * 64 + x] = c === bd ? 0 : (map[c] || 0); }
    // 8×8 px 格（= 縮圖 4×4）取主色
    var cell = new Uint8Array(256), cnt = new Int32Array(4);
    for (var cy = 0; cy < 16; cy++) for (var cx = 0; cx < 16; cx++) {
      cnt.fill(0);
      for (y = 0; y < 4; y++) for (x = 0; x < 4; x++) cnt[ref[(cy * 4 + y) * 64 + cx * 4 + x]]++;
      var b = 0; for (i = 1; i < 4; i++) if (cnt[i] > cnt[b]) b = i;
      if (b === 0 && cnt[0] < 12) { b = 1; for (i = 2; i < 4; i++) if (cnt[i] > cnt[b]) b = i; }
      cell[cy * 16 + cx] = b;
    }
    // 橫向合併成方塊，再往下合併同樣的方塊
    var runs = [];
    for (cy = 0; cy < 16; cy++) {
      cx = 0;
      while (cx < 16) {
        var cc = cell[cy * 16 + cx];
        if (!cc) { cx++; continue; }
        var ex = cx; while (ex + 1 < 16 && cell[cy * 16 + ex + 1] === cc) ex++;
        var merged = false;
        for (i = 0; i < runs.length; i++) { var R = runs[i]; if (R.c === cc && R.x0 === cx && R.x1 === ex && R.y1 === cy - 1) { R.y1 = cy; merged = true; break; } }
        if (!merged) runs.push({ c: cc, x0: cx, x1: ex, y0: cy, y1: cy });
        cx = ex + 1;
      }
    }
    if (S.tool !== 'box') botUse(S, 'box');
    [1, 2, 3].forEach(function (c) {
      var list = runs.filter(function (r) { return r.c === c; });
      if (!list.length) return;
      var sw = swXY(S, c);
      bMove(sw[0], sw[1]); bTap(BTN.A);
      list.forEach(function (r) {
        bMove(CVX + r.x0 * 8, CVY + r.y0 * 8); bTap(BTN.A);
        bMove(CVX + r.x1 * 8 + 7, CVY + r.y1 * 8 + 7); bTap(BTN.A);
      });
    });
    bq({ call: function () { S.botDone = true; } });
  }

  function goalOk() { return !!(g && g.goalBook && g.goalCopy); }

  /* ================================================================ 註冊 */
  var GAME = {
    id: 'paint', order: 6, title: '星塵畫室', legacy: ['coloring-game.html', 'precision-draw.html', 'quick-draw.html'],
    init: function (nes) {
      nes0 = nes;
      P.Art.reset();
      art = ART.ui(); spr = ART.spr();
      GAME.backTile = { tile: spr.s('PDOT'), pal: 3 };
      AU.init(nes);
      g = newState();
      botReset();
      var pm = CT.query ? CT.query('pmode') : null, pg = parseInt((CT.query && CT.query('page')) || '0', 10) || 0;
      if (pm === 'free' || pm === 'book' || pm === 'copy' || pm === 'guess') startPaint(pm, Math.max(0, Math.min(7, pg)));
      else enterTitle();
    },
    update: function () {
      g.t++;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'help') updateHelp();
      else if (g.mode === 'list') updateList();
      else if (g.mode === 'paint') {
        var S = g.S;
        updatePaint();
        if (g.S === S && g.mode === 'paint') {
          if (S.kind === 'book' && S.phase === 'draw' && S.t % 10 === 0) checkBook(S);
          if (S.doneT > 0 && --S.doneT === 0 && !S.paused) AU.play('paint_draw');
        }
      }
      AU.tick();
    },
    draw: function () {
      if (g.mode === 'paint') {
        var S = g.S;
        hudLive(S);
        flushMain(FLUSH_LIMIT);
        S.disp.flush(FLUSH_LIMIT); S.disp.idle();
        drawPaint();
      } else {
        flushMain(FLUSH_LIMIT);
        if (g.mode === 'title') drawTitle();
        else if (g.mode === 'list') drawList();
        else hideSprites(0, 12);
      }
    },
    state: function () {
      var S = g.S, s = null;
      if (S) {
        s = { kind: S.kind, page: S.page, phase: S.phase, tool: S.tool, size: S.size, color: S.color, cur: [S.cur.x, S.cur.y], anchor: S.anchor,
              paused: S.paused, menuSel: S.menuSel, slot: S.slot, edit: S.edit ? { code: S.edit.code, h: S.edit.h, l: S.edit.l } : null,
              pending: S.disp ? S.disp.pending() : 0, chrUsed: S.disp ? S.disp.used() : 0, chrCap: S.disp ? S.disp.capacity() : 0,
              approx: S.disp ? S.disp.approxN : 0, uploads: S.disp ? S.disp.uploads : 0, undo: S.model.undoS.length, redo: S.model.redoS.length,
              timer: S.timer, complete: S.complete, areas: S.regions ? [S.areasDone, S.regions.length] : null, cheated: S.cheated,
              res: S.res ? { score: S.res.score, rating: S.res.rating, f1: S.res.f1, color: S.res.color } : null,
              guess: S.guess ? { round: S.guess.round, total: S.guess.total, want: S.guess.want, label: S.guess.label, score: S.guess.score, got: S.guess.got, t: S.guess.t } : null,
              pal13: S.pal13.slice(), ug: S.ug, msg: S.msgT > 0 ? S.msg : '' };
      }
      return { mode: g.mode, sel: g.sel, page: g.page, list: g.list, helpPage: g.helpPage, t: g.t, queue: g.q.length + g.qa.length,
               goalBook: g.goalBook, goalCopy: g.goalCopy, goal: goalOk(), music: AU.current, paint: s };
    },
    exit: function () { var S = g && g.S; if (S && S.kind === 'guess' && S.guess) saveGuess(S); AU.stop(); },
    cheat: function () {
      var S = g && g.S;
      if (!S || g.mode !== 'paint' || S.phase === 'intro' || S.paused || S.kind === 'free') return false;
      if (S.kind === 'book' && (S.complete || S.phase !== 'draw')) return false;
      g.cheatReq = true; return true;
    },
    bot: function () { return botMask(); },
    goal: function () { return goalOk(); },
    bestText: function () { var b = CT.load('paint', 'copyBest', -1); return padL((b < 0 ? '--' : String(b)) + '%', 6); }
  };
  P.GAME = GAME;
  P.K = { HZ: HZ, CVX: CVX, CVY: CVY, GUESS_ROUNDS: GUESS_ROUNDS, GUESS_TIME: GUESS_TIME, COPY_CHEAT: COPY_CHEAT, FLUSH_LIMIT: FLUSH_LIMIT, BOT_LAG: BOT_LAG, TOOLS: TOOLS };
  P.dev = {
    g: function () { return g; },
    S: function () { return g.S; },
    start: function (kind, page) { startPaint(kind, page || 0); if (g.S.phase === 'intro') beginDraw(g.S); return g.S; },
    title: function () { enterTitle(); },
    help: function (p) { enterHelp(p || 0); },
    list: function (k) { enterList(k); },
    setTool: function (t) { setTool(g.S, t); },
    setColor: function (c) { g.S.color = c; },
    finishCopy: function () { finishCopy(g.S); },
    checkBook: function () { checkBook(g.S); },
    loadCode: function (s) { return loadCode(g.S, s); },
    exportCode: function () { return C.encode(g.S.model.pix, g.S.pal13); },
    openMenu: function () { openMenu(g.S); },
    toolPos: toolPos, swPos: function (c) { return swPos(g.S, c); }, menuItems: function () { return menuItems(g.S); },
    bot: BOT, uiGroup: uiGroup,
    // 測試用：讀名稱表某列（依目前 bank 反查字）
    rowText: function (r) {
      var rev = {}, cs = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/%!?<>{}#_*+=()', out = '';
      for (var i = cs.length - 1; i >= 0; i--) rev[art.ch(cs.charAt(i))] = cs.charAt(i);
      rev[0] = ' ';
      for (var c = 0; c < 32; c++) { var t = nes0.ppu.getTile(0, c, r); out += rev[t] !== undefined ? rev[t] : '~'; }
      return out;
    }
  };
  if (CT.register) CT.register(GAME);
})();
