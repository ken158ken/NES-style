/*
 * games/cart1/shell.js — 《星塵 8 合 1》開機選單（設 CT.Shell）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-0 cart1-shell agent（R5）。契約：docs/R5_BRIEF.md §2 / §4、games/cart1/registry.js。
 *
 * 流程：開機 logo「STARDUST WORKS」（星星落下 + 鐘聲，約 2.5 秒，A / START 可跳過）
 *     → 選單畫面：上方原創 logo 字「星塵 8 合 1」（16×16 中文字 + 陰影）、下方 8 槽清單
 *       （每槽：原創 16×16 圖示 + 16×16 中文名 + 最高分；未註冊 = 「?」圖示 +「準備中」灰字）
 *     → ↑↓ / SELECT 移動（按住自動連發）、A / START 進入（選中那行閃 30 幀再 CT.launch）
 *     → 遊戲內 START+SELECT 按住 60 幀 → registry 呼叫 CT.back() → 本檔 init({from:id})，
 *       直接回選單（不重播開機 logo），游標停在剛玩的那款。
 *
 * 畫面規格（全部經 PPU）：BG 表 0 = bank 'cart1_bg'（engine 原創 DEMO.FONT + 邊框 + 星點 +
 *   圖示 + logo 字 + 選單用到的中文字），精靈表 1 = 'cart1_spr'（游標星、閃光、開機大星）。
 *   中文字是離線用 Noto Sans CJK TC（SIL OFL）16px 點陣化後的 16×16 位元圖（每字 4 磚，
 *   只建這次選單用得到的字）；遇到表外的字 → 執行期用 canvas 點陣化一次；再不行就顯示 id 英文。
 *   調色盤：BG0 一般字 / BG1 選中行 / BG2 暖色圖示 + logo / BG3 冷色圖示；同屏 ≤ 25 色。
 *   整片重畫一律在 CT.blank() 裡（= 關 rendering 重寫）；平常每幀只寫游標行的屬性（≤ 24 byte）。
 *
 * 回選單回饋（brief §4 / §6-4）：registry 沒有給 overlay hook ⇒ 本檔包一層 window.GAME.draw，
 *   在遊戲 draw 之後、render 之前畫進度提示：遊戲有填 backTile {tile, pal} ⇒ OAM 62 / 63 用該磁磚
 *   「往中間收攏 + 快閃」；沒填 ⇒ 不借精靈，改閃 backdrop（越接近 60 幀閃越快）。放開後全部還原。
 *   （正式 hook 的需求寫在 PROGRESS 跨檔需求。）
 *
 * 音樂 / 音效（全部原創，名稱前綴 cart1_）：選單曲 cart1_menu、cart1_move / cart1_ok / cart1_ng / cart1_boot。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};

  /* ============================================================ 槽位預設表（LEGACY_MAP 卡帶一） */
  var DEFAULT_SLOTS = [
    { id: 'maze', order: 1, title: '星塵迷宮', icon: 'maze' },
    { id: 'blocks', order: 2, title: '星塵方塊', icon: 'blocks' },
    { id: 'brick', order: 3, title: '星塵打磚塊', icon: 'brick' },
    { id: 'pinball', order: 4, title: '星塵彈珠台', icon: 'pinball' },
    { id: 'snake', order: 5, title: '星塵貪食蟲', icon: 'snake' },
    { id: 'racing', order: 6, title: '星塵賽車', icon: 'racing' },
    { id: 'flyer', order: 7, title: '星塵飛鳥', icon: 'flyer' },
    { id: 'tower', order: 8, title: '星塵塔防', icon: 'tower' }
  ];
  var MAX_SLOTS = 10;          // 預設 8 槽；表外 id 的註冊遊戲接在後面（最多 10 列，第 9 列起不畫說明列）
  var NAME_CHARS = 6;          // 名稱最多 6 個中文字（12 欄）

  /* ============================================================ 16×16 中文點陣（每列 4 位十六進位） */
  // 產生方式：PIL ImageFont（NotoSansCJK-Regular.ttc, TC, 16px, 門檻 90 / logo 用 Bold 15px 門檻 120）
  var GLYPH = {
    '星': '1ffc100c1ffc100c100c1ff8198019803ffc61801ff8018001807ffe00000000',
    '塵': '008000803ffe22603ffe22663ffe2c602ffe2c622fbe60806ffc40807ffe4000',
    '迷': '22643364016c7968106037fe616879681b641e661c62106038606e0047fe0000',
    '宮': '010001807ffe60066ff66816081008100ff001001ffc100c100c100c1ffc1008',
    '方': '018000807ffe06000600060007fc060804080c080c0818081818301860f00000',
    '塊': '108013fe12267e2633fe1226122613fe10b014bc3cba71be41300333063e0000',
    '打': '1000180019ff18187e181818181818181e1878185818181818181818101870f0',
    '磚': '00307ffe303031fe213621fe3d3665fe6434e7fe640827fe24883cc820480038',
    '彈': '7bde0a520bde08007bfe4326432643fe7b260bfe08200fff0820182078200000',
    '珠': '00207da011a011fe112013207e20102013ff107010f814a87da4632606220020',
    '台': '0300020006200c30181831fc3ffc000600001ff810081008100810081ff81008',
    '貪': '018003c00e703ffc700e1ff800301ff810081ff81ff810081ff80c30781c6006',
    '食': '0180038006401ff0781c7ffe18181ff8181818181ff8180c19f818701f98180c',
    '蟲': '01801ffc118c118c1ffc01987ffc080608107efe4a927efe0a140a167ffe0102',
    '賽': '01807ffe44227ffe04201ff87ffe7ffe1ffc781e5ff81ff818180ff01c3c7004',
    '車': '018001807ffe01803ffc318c318c3ffc318c318c3ffc01807ffe018001800180',
    '飛': '3ff4013c0d3c791e7110111a110e7ff01136111c111e31122118610f41060000',
    '鳥': '010001001ff810081ff810081ff810001ffe10001ffe0006252625b66484401c',
    '塔': '1108110c17fe110c7d6830f01198130e17fa10001ffc3b046304030403fc0104',
    '防': '7c206c206ffe68c068c068c06cfc64c4648464847d8461046304660c64380000',
    '準': '21203b2007fe66203ffc02200bfc1220322063fe01807ffe0180018001800180',
    '備': '199817fe3198319877fe730077fe3e66326633fe326633fe36663666342c0000',
    '中': '0180018001807ffe618661866186618661867ffe618601800180018001800180'
  };
  var LOGO_GLYPH = {
    '星': '00003ff830183ff830183ff8198039803ff87ff863801ff801807ffc7ffc0000',
    '塵': '01803ffc36e026c03ffc26cc3ffc2c786ffc6d7c6f806ff86180fffc40000000',
    '合': '0180038007c00ee01c787ffc7fec00001ff01ff8181818181ff81ff818100000',
    // 數字是手繪（粗體 8 / 1）
    '8': '000007e00c301c381c380e7007e00e701c38381c381c381c1c3807f000000000',
    '1': '000001c003c007c00dc001c001c001c001c001c001c001c00ff8000000000000'
  };
  var READY_TEXT = '準備中';

  function hexRows(hex) {           // 64 hex → 16 個 16 位元整數
    var out = [], i;
    for (i = 0; i < 16; i++) out.push(parseInt(hex.substr(i * 4, 4), 16) | 0);
    return out;
  }
  // 16×16 位元圖 → 四塊 8×8 磁磚字串（TL TR BL BR），color = '1'..'3'
  function quadTiles(bits, colorAt) {
    var q = [[], [], [], []], y, x;
    for (y = 0; y < 16; y++) {
      var L = '', R = '';
      for (x = 0; x < 16; x++) {
        var c = colorAt(bits, x, y);
        if (x < 8) L += c; else R += c;
      }
      q[y < 8 ? 0 : 2].push(L);
      q[y < 8 ? 1 : 3].push(R);
    }
    return q;
  }
  function bitAt(bits, x, y) { return (x >= 0 && x < 16 && y >= 0 && y < 16) ? ((bits[y] >> (15 - x)) & 1) : 0; }
  function plainColor(col) { return function (b, x, y) { return bitAt(b, x, y) ? col : '.'; }; }
  // logo：本體 2、上緣高光 3、右下陰影 1（NES 標題字常見的立體字）
  function logoColor(b, x, y) {
    if (bitAt(b, x, y)) return bitAt(b, x, y - 1) ? '2' : '3';
    if (bitAt(b, x - 1, y - 1) || bitAt(b, x - 1, y) || bitAt(b, x, y - 1)) return '1';
    return '.';
  }

  // 表外中文字：執行期用 canvas 點陣化（同一字只做一次；失敗回 null）
  var rasterCache = {};
  function rasterGlyph(ch) {
    if (rasterCache[ch] !== undefined) return rasterCache[ch];
    var bits = null;
    try {
      var cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, 16, 16);
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '15px "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
      cx.fillText(ch, 8, 8.5);
      var d = cx.getImageData(0, 0, 16, 16).data, y, x, any = 0;
      bits = [];
      for (y = 0; y < 16; y++) {
        var row = 0;
        for (x = 0; x < 16; x++) if (d[(y * 16 + x) * 4] >= 110) { row |= 1 << (15 - x); any++; }
        bits.push(row);
      }
      if (!any) bits = null;
    } catch (e) { bits = null; }
    rasterCache[ch] = bits;
    return bits;
  }

  /* ============================================================ 圖示（16×16，原創；. 1 2 3） */
  var ICON = {
    // R5 fix：抽象單線迷宮 + 中央星星（避開吃豆 / 追兵造型；牆綠、星白、角落藍星屑）
    maze: { pal: 3, art: [
      '2222222222222222',
      '2......2.......2',
      '2.2222.2.22222.2',
      '2.2.........2..2',
      '2.2.2..3..2.2.22',
      '2...2.333.2....2',
      '222.233333222..2',
      '2.....333......2',
      '2.2..33.33..2.22',
      '2.2.........2..2',
      '2.22222.2.222..2',
      '2.......2......2',
      '2.222.2.2.2222.2',
      '2...2.2...2....2',
      '2.1.2.222.2..1.2',
      '2222222222222222'] },
    blocks: { pal: 2, art: [
      '................',
      '......3333......',
      '......3223......',
      '......3223......',
      '......3333......',
      '..3333....1111..',
      '..3223....1221..',
      '..3223....1221..',
      '..3333....1111..',
      '1111333311113333',
      '1221322312213223',
      '1221322312213223',
      '1111333311113333',
      '3333111111113333',
      '3223122112213223',
      '3333111111113333'] },
    brick: { pal: 2, art: [
      '1111.2222.1111.2',
      '1111.2222.1111.2',
      '................',
      '22.1111.2222.111',
      '22.1111.2222.111',
      '................',
      '1111.2222.......',
      '1111.2222.......',
      '................',
      '..........33....',
      '.........3333...',
      '.........3333...',
      '..........33....',
      '................',
      '....2222222.....',
      '...333333333....'] },
    pinball: { pal: 3, art: [
      '..2222......22..',
      '.2....2....2..2.',
      '2..33..2...2..2.',
      '2..33..2....22..',
      '.2....2.........',
      '..2222.....33...',
      '..........3333..',
      '..........3333..',
      '...........33...',
      '................',
      '1..............1',
      '11............11',
      '.111........111.',
      '..1111....1111..',
      '....111..111....',
      '................'] },
    snake: { pal: 3, art: [
      '................',
      '............3...',
      '...........333..',
      '............3...',
      '................',
      '....1111........',
      '...122221.......',
      '..12232321......',
      '..12222221......',
      '...1112221......',
      '......12221..111',
      '.......122211221',
      '.......122222221',
      '........1222221.',
      '.........11111..',
      '................'] },
    // R5 fix：俯視賽車（遊戲是俯視捲軸）+ 左側紅白路緣
    racing: { pal: 2, art: [
      '11..............',
      '11...222222.....',
      '33.1122222211...',
      '33.1122222211...',
      '11..23333332....',
      '11..23333332....',
      '33..22222222....',
      '33..22211222....',
      '11..22211222....',
      '11..22222222....',
      '33.1122222211...',
      '33.1123333211...',
      '11.1122222211...',
      '11...222222.....',
      '33..............',
      '33..............'] },
    // R5 fix（P3-8）：藍色星燕「琉璃」（星冠、燕尾分叉、白腹、黑眼；同遊戲內 PAL_BIRD 的 0x12 藍 + 白）
    flyer: { pal: 3, art: [
      '.........3......',
      '........333.....',
      '..1......3......',
      '..11....111.....',
      '...11..11111....',
      '...111.11.111...',
      '1...111111111333',
      '11...11111113...',
      '.11.1111111333..',
      '..111111113333..',
      '...1111113333...',
      '..11.1111333....',
      '.11...11111.....',
      '11..............',
      '................',
      '................'] },
    tower: { pal: 3, art: [
      '......2.........',
      '......2222......',
      '......222.......',
      '......2.........',
      '....1.1.1.1.....',
      '....1111111.....',
      '.....11111......',
      '.....13131......',
      '.....11111......',
      '.....11311......',
      '.....11111......',
      '....1111111.....',
      '....1131311.....',
      '...111111111....',
      '..11111111111...',
      '................'] },
    none: { pal: 0, art: [
      '................',
      '.22222222222222.',
      '.2............2.',
      '.2....2222....2.',
      '.2...22..22...2.',
      '.2.......22...2.',
      '.2......22....2.',
      '.2.....22.....2.',
      '.2.....22.....2.',
      '.2............2.',
      '.2.....22.....2.',
      '.2.....22.....2.',
      '.2............2.',
      '.22222222222222.',
      '................',
      '................'] }
  };
  function artQuad(art) {
    var q = [[], [], [], []], y;
    for (y = 0; y < 16; y++) {
      q[y < 8 ? 0 : 2].push(art[y].substring(0, 8));
      q[y < 8 ? 1 : 3].push(art[y].substring(8, 16));
    }
    return q;
  }

  /* ============================================================ 其他背景磁磚 */
  var DECOR = {
    BD_H: ['........', '11111111', '........', '1.1.1.1.', '........', '11111111', '........', '........'],
    BD_V: ['.1.1.1..', '.1...1..', '.1.1.1..', '.1...1..', '.1.1.1..', '.1...1..', '.1.1.1..', '.1...1..'],
    BD_TL: ['........', '.1111111', '.1......', '.1.1.1.1', '.1......', '.1.11111', '.1.1....', '.1.1.1..'],
    BD_TR: ['........', '1111111.', '......1.', '1.1.1.1.', '......1.', '11111.1.', '....1.1.', '..1.1.1.'],
    BD_BL: ['.1.1.1..', '.1.1....', '.1.11111', '.1......', '.1.1.1.1', '.1......', '.1111111', '........'],
    BD_BR: ['..1.1.1.', '....1.1.', '11111.1.', '......1.', '1.1.1.1.', '......1.', '1111111.', '........'],
    DOT1: ['........', '........', '........', '...2....', '........', '........', '........', '........'],
    DOT2: ['........', '........', '...1....', '..121...', '...1....', '........', '........', '........'],
    BAR: ['........', '........', '........', '22222222', '........', '........', '........', '........']
  };

  /* ============================================================ 精靈磁磚（表 1） */
  var SPR = {
    CUR: ['........', '.11.....', '.1211...', '.122211.', '.1223331', '.122211.', '.1211...', '.11.....'],
    SPK0: ['........', '...3....', '...3....', '.33333..', '...3....', '...3....', '........', '........'],
    SPK1: ['........', '........', '..1.1...', '...3....', '..1.1...', '........', '........', '........'],
    BIG_TL: ['.......1', '.......1', '......12', '......12', '.....122', '11111222', '.1222222', '..122222'],
    BIG_TR: ['1.......', '1.......', '21......', '21......', '221.....', '22211111', '2222221.', '222221..'],
    BIG_BL: ['...12232', '....1222', '...12222', '...12221', '..12221.', '..1221..', '.121....', '.11.....'],
    BIG_BR: ['32221...', '2221....', '22221...', '12221...', '.12221..', '..1221..', '....121.', '.....11.']
  };

  /* ============================================================ 字型對照（DEMO.FONT 名稱） */
  var CHARMAP = {
    ' ': 'SP', '.': 'DOT', ',': 'COMMA', ':': 'COLON', '-': 'DASH', '!': 'EXCL', '?': 'QUEST',
    "'": 'APOS', '/': 'SLASH', '(': 'LPAREN', ')': 'RPAREN', '+': 'PLUS', '=': 'EQ', '*': 'MUL',
    '>': 'ARROW', '%': 'PCT', '$': 'STAR', '@': 'COIN', '#': 'HEART'
  };
  (function () {
    var i;
    for (i = 0; i <= 9; i++) CHARMAP[String(i)] = 'N' + i;
    for (i = 65; i <= 90; i++) CHARMAP[String.fromCharCode(i)] = String.fromCharCode(i);
  })();
  function fontName(ch) {
    var n = CHARMAP[ch];
    if (n === undefined && ch >= 'a' && ch <= 'z') n = CHARMAP[ch.toUpperCase()];
    return n === undefined ? 'SP' : n;
  }

  /* ============================================================ 音樂 / 音效（原創） */
  function tok(s) { return String(s).split(/\s+/).filter(function (t) { return t.length > 0; }); }
  function track(str, inst, vol, duty, rowsN) {
    var t = tok(str), out = [], i;
    for (i = 0; i < rowsN; i++) {
      var s = t[i];
      if (s === undefined || s === '-') { out.push(null); continue; }
      if (s === '=') { out.push({ note: '===' }); continue; }
      var r = { note: s, inst: inst, vol: vol };
      if (duty !== null && duty !== undefined) r.duty = duty;
      out.push(r);
    }
    return out;
  }
  var DR = {
    k: { note: 13, inst: 'kick', vol: 13, duty: 0 },
    s: { note: 6, inst: 'snare', vol: 11, duty: 0 },
    h: { note: 1, inst: 'hat', vol: 7, duty: 0 }
  };
  function drums(str, rowsN) {
    var t = tok(str), out = [], i;
    for (i = 0; i < rowsN; i++) out.push(DR[t[i]] || null);
    return out;
  }
  var R32 = 32;
  // 選單曲「星塵卡帶」：F 大調、speed 6（≈150 BPM）、4 段 × 2 小節，A A' B C 後回 A；全部自作
  var MENU_SONG = {
    name: 'cart1_menu', speed: 6, rows: R32, loop: 0,
    instruments: {
      lead: { vol: [14, 13, 12, 11, 10, 10, 9, 9, 8, 8, 7], volLoop: 10, duty: [2, 2, 1] },
      harm: { vol: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], duty: [1] },
      bass: { vol: [15] },
      kick: { vol: [15, 12, 8, 4, 0] },
      snare: { vol: [13, 10, 7, 5, 3, 1, 0] },
      hat: { vol: [8, 4, 0] }
    },
    patterns: [
      { // A
        p1: track('F-5 - A-5 - C-6 - - - A-5 - C-6 - D-6 - C-6 - A-5 - - - G-5 - F-5 - G-5 - A-5 - - - - -', 'lead', 13, 2, R32),
        p2: track('A-4 - C-5 - - - A-4 - C-5 - - - A-4 - C-5 - E-4 - G-4 - - - E-4 - G-4 - - - C-5 - - -', 'harm', 10, 1, R32),
        tri: track('F-3 - - - F-3 - C-3 - F-3 - - - F-3 - C-3 - C-3 - - - C-3 - G-2 - C-3 - - - E-3 - - -', 'bass', 15, null, R32),
        noi: drums('k - h - s - h - k - h k s - h - k - h - s - h - k - h k s - s s', R32)
      },
      { // A'
        p1: track('F-5 - A-5 - C-6 - - - A-5 - C-6 - F-6 - E-6 - D-6 - - - C-6 - A#5 - A-5 - G-5 - - - F-5 -', 'lead', 13, 2, R32),
        p2: track('A-4 - C-5 - - - A-4 - C-5 - - - A-4 - C-5 - A#4 - D-5 - - - A#4 - C-5 - - - A-4 - - -', 'harm', 10, 1, R32),
        tri: track('F-3 - - - F-3 - C-3 - F-3 - - - F-3 - C-3 - A#2 - - - A#2 - F-2 - C-3 - - - F-3 - - -', 'bass', 15, null, R32),
        noi: drums('k - h - s - h - k - h k s - h - k - h - s - h - k - h k s - s s', R32)
      },
      { // B（轉到 D 小調，帶一點冒險感）
        p1: track('D-6 - - - C-6 - A-5 - - - F-5 - G-5 - A-5 - A#5 - - - A-5 - G-5 - - - E-5 - C-5 - - -', 'lead', 12, 1, R32),
        p2: track('F-4 - A-4 - - - F-4 - A-4 - - - F-4 - A-4 - G-4 - A#4 - - - G-4 - A#4 - - - G-4 - - -', 'harm', 9, 1, R32),
        tri: track('D-3 - - - D-3 - A-2 - D-3 - - - D-3 - A-2 - G-2 - - - G-2 - D-3 - C-3 - - - C-3 - - -', 'bass', 15, null, R32),
        noi: drums('k - h - s - h h k - h - s - h h k - h - s - h h k - k - s s s s', R32)
      },
      { // C（回主調的上行收束）
        p1: track('A#5 - A-5 - G-5 - A#5 - A-5 - G-5 - F-5 - A-5 - G-5 - E-5 - C-5 - E-5 - F-5 - - - - - - -', 'lead', 13, 2, R32),
        p2: track('D-5 - C-5 - A#4 - D-5 - C-5 - A#4 - A-4 - C-5 - A#4 - G-4 - E-4 - G-4 - A-4 - - - - - - -', 'harm', 9, 1, R32),
        tri: track('A#2 - - - A#2 - - - F-3 - - - F-3 - - - C-3 - - - C-3 - - - F-3 - C-3 - F-2 - - -', 'bass', 15, null, R32),
        noi: drums('k - h - s - h - k - h - s - h - k - h - s - h - k - s s k s s s', R32)
      }
    ],
    order: [0, 1, 2, 3]
  };
  function sq(list) {               // [[note, frames, vol, duty?], ...] → 方波音效幀
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      for (j = 0; j < e[1]; j++) {
        var r = { note: e[0], vol: e[2] };
        if (e[3] !== undefined) r.duty = e[3];
        out.push(r);
      }
    }
    out.push({ off: true });
    return out;
  }
  var SFX = {
    cart1_move: { priority: 3, data: { p2: sq([['E-6', 2, 9, 1], ['A-6', 3, 7, 1]]) } },
    cart1_ok: { priority: 6, data: { p2: sq([['C-6', 3, 12, 2], ['E-6', 3, 12, 2], ['G-6', 3, 12, 2], ['C-7', 8, 11, 2], ['C-7', 6, 6, 2]]) } },
    cart1_ng: { priority: 5, data: { p2: sq([['C-4', 4, 11, 0], ['B-3', 6, 9, 0]]) } },
    cart1_boot: { priority: 7, data: { p2: sq([['G-6', 4, 13, 1], ['D-7', 4, 12, 1], ['G-7', 10, 11, 1], ['G-7', 10, 6, 1], ['G-7', 10, 3, 1]]) } }
  };
  function music(nes) { return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null); }
  function defineSfx(nes) {
    var m = music(nes), k;
    if (!m || !m.define) return;
    for (k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) { try { m.define(k, SFX[k]); } catch (e) { } }
  }
  function sfx(nes, name) {
    var m = music(nes);
    if (!m || !m.sfx) return;
    try { m.sfx(name); } catch (e) { }
    S.lastSfx = name;
  }
  function playMenuSong(nes) {
    var m = music(nes);
    if (!m || !m.play) return;
    try { m.play(MENU_SONG, { loop: true }); S.song = 'cart1_menu'; } catch (e) { }
  }

  /* ============================================================ 狀態 */
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var BOOT_FRAMES = 150, LAUNCH_FRAMES = 30, REPEAT_DELAY = 18, REPEAT_RATE = 6;
  var ROW0 = 8;                    // 第一槽的名稱表列（偶數 ⇒ 每槽剛好一列屬性）
  var COL_ICON = 4, COL_NAME = 7, COL_BEST = 21;
  var S = {
    mode: 'boot', t: 0, sel: 0, slots: [], from: null, hold: 0, launchT: 0, launchId: null,
    lastSfx: null, song: null, bank: null, spr: null, nameTiles: {}, inited: 0, missingGlyph: []
  };
  var nes0 = null;

  function buildSlots() {
    var list = [], seen = {}, i, g;
    for (i = 0; i < DEFAULT_SLOTS.length; i++) {
      var d = DEFAULT_SLOTS[i];
      g = CT.get ? CT.get(d.id) : null;
      list.push({ id: d.id, order: g && g.order ? g.order : d.order, title: g ? (g.title || d.title) : d.title,
                  icon: d.icon, game: g });
      seen[d.id] = 1;
    }
    var extra = (CT.games || []).filter(function (x) { return x && x.id && !seen[x.id]; });
    for (i = 0; i < extra.length && list.length < MAX_SLOTS; i++) {
      g = extra[i];
      list.push({ id: g.id, order: g.order || 99, title: g.title || g.id, icon: 'none', game: g });
    }
    // 依 order 排（穩定：同 order 保持原順序）
    var idx = list.map(function (s, k) { return k; });
    idx.sort(function (a, b) { return (list[a].order - list[b].order) || (a - b); });
    return idx.map(function (k) { return list[k]; });
  }

  function bestOf(slot) {
    var g = slot.game;
    if (!g) return '';
    var t = null;
    try { if (typeof g.bestText === 'function') t = g.bestText(); } catch (e) { t = null; }
    if (t === null || t === undefined) {
      var v = CT.load ? CT.load(slot.id, 'best', 0) : 0;
      t = (typeof v === 'number' && isFinite(v)) ? String(Math.max(0, Math.floor(v))) : String(v == null ? 0 : v);
    }
    t = String(t);
    if (t.length > 8) t = t.substring(0, 8);
    return t;
  }

  /* ============================================================ CHR bank */
  function glyphBits(ch) {
    if (GLYPH[ch]) return hexRows(GLYPH[ch]);
    return rasterGlyph(ch);
  }
  function buildBanks() {
    var bg = {}, k, i, q, F = (NES.CHR && NES.CHR.DEMO && NES.CHR.DEMO.FONT) || {};
    bg.SP = ['........', '........', '........', '........', '........', '........', '........', '........'];
    for (k in F) if (Object.prototype.hasOwnProperty.call(F, k) && k !== 'SP') bg[k] = F[k];
    for (k in DECOR) if (Object.prototype.hasOwnProperty.call(DECOR, k)) bg[k] = DECOR[k];
    for (k in ICON) {
      if (!Object.prototype.hasOwnProperty.call(ICON, k)) continue;
      q = artQuad(ICON[k].art);
      for (i = 0; i < 4; i++) bg['IC_' + k + '_' + i] = q[i];
    }
    for (k in LOGO_GLYPH) {
      if (!Object.prototype.hasOwnProperty.call(LOGO_GLYPH, k)) continue;
      q = quadTiles(hexRows(LOGO_GLYPH[k]), logoColor);
      for (i = 0; i < 4; i++) bg['LG_' + k + '_' + i] = q[i];
    }
    // 中文名：只建這次選單用得到的字（白字 = 色 3）；「準備中」灰字 = 色 2
    var count = 0;
    for (k in bg) if (Object.prototype.hasOwnProperty.call(bg, k)) count++;
    S.nameTiles = {}; S.missingGlyph = [];
    function addChar(ch, col) {
      var key = col + ch;
      if (S.nameTiles[key] !== undefined) return true;
      var bits = glyphBits(ch);
      if (!bits) { S.missingGlyph.push(ch); S.nameTiles[key] = null; return false; }
      if (count + 4 > 256) { S.nameTiles[key] = null; return false; }
      var qq = quadTiles(bits, plainColor(col)), j;
      for (j = 0; j < 4; j++) bg['GN_' + col + '_' + ch + '_' + j] = qq[j];
      count += 4;
      S.nameTiles[key] = 'GN_' + col + '_' + ch + '_';
      return true;
    }
    for (i = 0; i < READY_TEXT.length; i++) addChar(READY_TEXT.charAt(i), '2');
    for (i = 0; i < S.slots.length; i++) {
      var sl = S.slots[i], t = String(sl.title || '').substring(0, NAME_CHARS), okAll = true, c;
      if (!sl.game) { sl.nameMode = 'ready'; continue; }
      for (c = 0; c < t.length; c++) {
        var ch = t.charAt(c);
        if (ch === ' ') continue;
        if (ch.charCodeAt(0) < 128) { okAll = false; break; }
        if (!addChar(ch, '3')) { okAll = false; break; }
      }
      sl.nameMode = (okAll && t.length) ? 'glyph' : 'ascii';
    }
    S.bank = NES.CHR.bank('cart1_bg', bg);
    S.spr = NES.CHR.bank('cart1_spr', SPR);
    S.tileCount = S.bank.tiles.length;
  }
  function T(name) { return S.bank.index(name); }
  function P(name) { return S.spr.index(name); }

  /* ============================================================ 畫面（全部在 CT.blank 內呼叫） */
  function setPalettes(ppu) {
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [0x11, 0x10, 0x30]);   // 一般：邊框藍 / 灰字 / 白字
    ppu.setBgPalette(1, [0x11, 0x00, 0x28]);   // 選中行：白字 → 黃字
    ppu.setBgPalette(2, [0x16, 0x27, 0x38]);   // 暖色：logo 陰影紅 / 橘 / 淡黃（圖示也用）
    ppu.setBgPalette(3, [0x12, 0x2A, 0x30]);   // 冷色圖示：藍 / 綠 / 白
    ppu.setSprPalette(0, [0x16, 0x27, 0x38]);  // 游標 / 開機大星
    ppu.setSprPalette(1, [0x21, 0x31, 0x30]);  // 閃光
    ppu.setSprPalette(2, [0x16, 0x27, 0x38]);
    ppu.setSprPalette(3, [0x12, 0x2A, 0x30]);
  }
  function text(ppu, col, row, s) {
    s = String(s);
    for (var i = 0; i < s.length && col + i < 32; i++) ppu.setTile(0, col + i, row, T(fontName(s.charAt(i))));
  }
  function quad(ppu, col, row, prefix) {
    ppu.setTile(0, col, row, T(prefix + '0'));
    ppu.setTile(0, col + 1, row, T(prefix + '1'));
    ppu.setTile(0, col, row + 1, T(prefix + '2'));
    ppu.setTile(0, col + 1, row + 1, T(prefix + '3'));
  }
  function clearScreen(ppu) {
    // 先切回垂直鏡像再清「兩張」：前一款若用水平鏡像，registry.resetHW 的 fill(1) 只會清到同一張實體表
    if (ppu.mirroring) ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, T('SP'));
    ppu.fillTiles(1, 0, 0, 32, 30, T('SP'));
    ppu.fillAttr(0, 0, 0, 16, 15, 0);
    ppu.fillAttr(1, 0, 0, 16, 15, 0);
    ppu.clearSprites();
    ppu.scroll(0, 0);
    if (ppu.split) ppu.split(null);
  }
  function drawBoot(ppu) {
    clearScreen(ppu);
    // 星點背景（固定種子，畫面可重現）
    var seed = 7, i;
    for (i = 0; i < 26; i++) {
      seed = (seed * 109 + 89) & 1023;
      var c = seed & 31, r = 2 + ((seed >> 5) % 26);
      if (r >= 11 && r <= 19) continue;
      ppu.setTile(0, c, r, T(i & 1 ? 'DOT1' : 'DOT2'));
    }
  }
  function drawBootText(ppu) {
    text(ppu, 9, 15, 'STARDUST WORKS');
    ppu.fillTiles(0, 9, 16, 14, 1, T('BAR'));
  }
  function slotRow(i) { return ROW0 + i * 2; }
  function drawSlot(ppu, i) {
    var sl = S.slots[i], row = slotRow(i), c;
    ppu.fillTiles(0, 3, row, 27, 2, T('SP'));
    var icon = sl.game ? (ICON[sl.icon] ? sl.icon : 'none') : 'none';
    quad(ppu, COL_ICON, row, 'IC_' + icon + '_');
    ppu.setAttr(0, COL_ICON >> 1, row >> 1, ICON[icon].pal);
    if (sl.nameMode === 'glyph') {
      var t = String(sl.title).substring(0, NAME_CHARS), col = COL_NAME;
      for (c = 0; c < t.length; c++) {
        var ch = t.charAt(c);
        if (ch !== ' ') quad(ppu, col, row, S.nameTiles['3' + ch]);
        col += 2;
      }
    } else if (sl.nameMode === 'ready') {
      for (c = 0; c < READY_TEXT.length; c++) {
        var pre = S.nameTiles['2' + READY_TEXT.charAt(c)];
        if (pre) quad(ppu, COL_NAME + c * 2, row, pre);
      }
      if (!S.nameTiles['2' + READY_TEXT.charAt(0)]) text(ppu, COL_NAME, row + 1, 'COMING SOON');
    } else {
      text(ppu, COL_NAME, row + 1, String(sl.title && /^[\x20-\x7e]+$/.test(sl.title) ? sl.title : sl.id).toUpperCase().substring(0, 13));
    }
    if (sl.game) {
      var b = bestOf(sl);
      text(ppu, COL_BEST + 8 - b.length, row + 1, b);
    }
  }
  function rowPal(ppu, i, pal) {
    var r16 = slotRow(i) >> 1, c;
    for (c = 3; c <= 14; c++) ppu.setAttr(0, c, r16, pal);
  }
  function drawMenu(ppu) {
    clearScreen(ppu);
    var c, r;
    // 邊框（第 1 / 28 列、第 0 / 31 欄 = 畫面可見範圍的最外圈）
    ppu.setTile(0, 0, 1, T('BD_TL')); ppu.setTile(0, 31, 1, T('BD_TR'));
    ppu.setTile(0, 0, 28, T('BD_BL')); ppu.setTile(0, 31, 28, T('BD_BR'));
    for (c = 1; c < 31; c++) { ppu.setTile(0, c, 1, T('BD_H')); ppu.setTile(0, c, 28, T('BD_H')); }
    for (r = 2; r < 28; r++) { ppu.setTile(0, 0, r, T('BD_V')); ppu.setTile(0, 31, r, T('BD_V')); }
    // logo「星塵 8 合 1」：第 3~4 列，屬性列 1~2（第 2~5 列）用暖色組
    var LOGO = [['星', 9], ['塵', 11], ['8', 14], ['合', 17], ['1', 20]], i;
    for (i = 0; i < LOGO.length; i++) quad(ppu, LOGO[i][1], 3, 'LG_' + LOGO[i][0] + '_');
    for (c = 1; c <= 14; c++) { ppu.setAttr(0, c, 1, 2); ppu.setAttr(0, c, 2, 2); }
    // logo 兩側星點
    ppu.setTile(0, 5, 3, T('DOT2')); ppu.setTile(0, 7, 5, T('DOT1')); ppu.setTile(0, 24, 4, T('DOT2'));
    ppu.setTile(0, 26, 2, T('DOT1')); ppu.setTile(0, 3, 5, T('DOT1')); ppu.setTile(0, 28, 5, T('DOT2'));
    text(ppu, 7, 6, 'ACTION 8 IN 1  CART-1');
    if (S.slots.length <= 8) text(ppu, 24, 7, 'BEST');
    for (i = 0; i < S.slots.length; i++) drawSlot(ppu, i);
    if (S.slots.length <= 8) {
      text(ppu, 4, 25, 'A/START PLAY  SELECT NEXT');
      text(ppu, 3, 26, 'HOLD START+SELECT = MENU');
    }
    rowPal(ppu, S.sel, 1);
  }

  /* ============================================================ 進度提示 overlay（回選單） */
  // R5 fix（P3-9 / brief §6-4）：
  //   遊戲註冊物件有 backTile: {tile, pal} ⇒ OAM 62 / 63 用「遊戲自己指定」的磁磚收攏（8×16 模式 tile 原樣傳給
  //     ppu.sprite = 上下兩塊那組），進度 > 2/3 改成顯示 / 隱藏快閃；
  //   沒填 backTile ⇒ 不借任何精靈（不再猜「最實心的磁磚」，避免畫成半台車 / 半片翅膀），改成閃 backdrop：
  //     亮色 = 原 backdrop 提亮一階（黑底 → $01 深藍），閃爍間隔隨進度變快；放開即還原（遊戲中途自己改 backdrop 也跟著更新備份）。
  var OV = { key: null, tile: 0, saved: [null, null], wrote: [null, null], on: false,
    mode: null, bdOn: false, bdSaved: 0, bdWrote: -1, lastMode: null };
  function backTileOf(g) {
    var bt = g && g.backTile;
    if (typeof bt === 'function') { try { bt = bt.call(g); } catch (e) { bt = null; } }
    if (!bt || typeof bt !== 'object') return null;
    var t = bt.tile, pl = bt.pal === undefined ? 0 : bt.pal;
    if (typeof t !== 'number' || t !== (t | 0) || t < 0 || t > 255) return null;
    if (typeof pl !== 'number' || pl !== (pl | 0) || pl < 0 || pl > 3) return null;
    return { tile: t, pal: pl };
  }
  function flashColor(c) {
    c = c | 0;
    if ((c & 0x0F) >= 0x0E || c === 0x0D) return 0x01;         // 各種黑 → 深藍
    if (c < 0x30) return c + 0x10;                             // 提亮一階（0x1D → 0x2D 灰，不會碰到 $0D）
    return (c & 0x0F) === 0x00 ? 0x10 : (c - 0x20);             // 已是最亮列 → 壓暗兩階
  }
  function same(a, b) {
    return a && b && a.x === b.x && a.y === b.y && a.tile === b.tile && a.pal === b.pal && a.on === b.on &&
      a.flipH === b.flipH && a.flipV === b.flipV && a.behind === b.behind;
  }
  function restoreSprites(ppu) {
    for (var k = 0; k < 2; k++) {
      var slot = 62 + k, now = ppu.getSprite(slot), sv = OV.saved[k];
      if (same(now, OV.wrote[k]) && sv) {
        if (sv.on) ppu.sprite(slot, { x: sv.x, y: sv.y, tile: sv.tile, pal: sv.pal, flipH: sv.flipH, flipV: sv.flipV, behind: sv.behind });
        else ppu.sprite(slot, null);
      }
      OV.saved[k] = null; OV.wrote[k] = null;
    }
    OV.on = false;
  }
  function restoreBackdrop(ppu) {
    if (OV.bdOn && (ppu.backdrop | 0) === OV.bdWrote && (ppu.backdrop | 0) !== OV.bdSaved) ppu.setBackdrop(OV.bdSaved);
    OV.bdOn = false; OV.bdWrote = -1;
  }
  function overlay(nes) {
    var ppu = nes && nes.ppu;
    if (!ppu) return;
    var p = (CT.current && CT.backProgress) ? CT.backProgress() : 0, k;
    var f = (nes.timing && nes.timing.frame) | 0;
    if (p > 0) {
      var bt = backTileOf(CT.current);
      if (bt && ppu.sprite && ppu.getSprite) {
        if (OV.bdOn) restoreBackdrop(ppu);
        OV.mode = OV.lastMode = 'tile'; OV.tile = bt.tile;
        var gap = Math.round(28 * (1 - p));            // 兩顆從 ±28 px 往中間收攏
        var show = p <= 0.66 || ((f >> 1) & 1);
        var pos = [{ x: 124 - 4 - gap, y: 16 }, { x: 124 + 4 + gap, y: 16 }];
        for (k = 0; k < 2; k++) {
          var slot = 62 + k, cur = ppu.getSprite(slot);
          if (!OV.on || !same(cur, OV.wrote[k])) OV.saved[k] = cur;   // 遊戲這幀自己寫過 ⇒ 更新備份
          if (show) ppu.sprite(slot, { x: pos[k].x, y: pos[k].y, tile: bt.tile, pal: bt.pal, flipH: k === 1 });
          else ppu.sprite(slot, null);
          OV.wrote[k] = ppu.getSprite(slot);
        }
        OV.on = true;
      } else if (ppu.setBackdrop) {
        if (OV.on) restoreSprites(ppu);
        OV.mode = OV.lastMode = 'backdrop';
        var cur0 = ppu.backdrop | 0;
        if (!OV.bdOn || cur0 !== OV.bdWrote) OV.bdSaved = cur0;      // 遊戲這幀自己改過 backdrop ⇒ 更新備份
        var sh = p > 0.66 ? 1 : (p > 0.33 ? 2 : 3);                  // 8 → 4 → 2 幀切換一次
        var want = ((f >> sh) & 1) ? flashColor(OV.bdSaved) : OV.bdSaved;
        if ((ppu.backdrop | 0) !== want) ppu.setBackdrop(want);      // 只有變色那幀花 1 byte
        OV.bdWrote = want; OV.bdOn = true;
      }
    } else {
      if (OV.on && ppu.getSprite) restoreSprites(ppu);
      if (OV.bdOn) restoreBackdrop(ppu);
      OV.mode = null;
    }
  }
  (function wrapDraw() {
    var G = window.GAME;
    if (!G || G.__cart1Overlay) return;
    var orig = G.draw;
    G.draw = function (nes) {
      if (orig) orig.call(G, nes);
      if (CT.current) overlay(nes);
      else { OV.on = false; OV.bdOn = false; OV.mode = null; }
    };
    G.__cart1Overlay = true;
  })();

  /* ============================================================ 輸入 */
  function inp(nes) { return (nes && nes.input) || NES.Input; }
  function pressed(nes, b) { var I = inp(nes); return !!(I && I.pressed && I.pressed(b)); }
  function held(nes, b) { var I = inp(nes); return !!(I && I.held && I.held(b)); }
  function moveDir(nes) {
    var d = 0;
    if (pressed(nes, BTN.DOWN) || pressed(nes, BTN.SELECT)) { S.hold = 0; return 1; }
    if (pressed(nes, BTN.UP)) { S.hold = 0; return -1; }
    if (held(nes, BTN.DOWN)) d = 1;
    else if (held(nes, BTN.UP)) d = -1;
    if (!d) { S.hold = 0; return 0; }
    S.hold++;
    if (S.hold >= REPEAT_DELAY && (S.hold - REPEAT_DELAY) % REPEAT_RATE === 0) return d;
    return 0;
  }

  /* ============================================================ 模式切換 */
  function enterMenu(nes) {
    var ppu = nes.ppu;
    S.mode = 'menu'; S.t = 0; S.hold = 0;
    CT.blank(nes, function () { drawMenu(ppu); });
    playMenuSong(nes);
  }
  function select(nes, i) {
    var n = S.slots.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === S.sel) return;
    rowPal(nes.ppu, S.sel, 0);
    S.sel = i;
    rowPal(nes.ppu, S.sel, 1);
  }

  /* ============================================================ CT.Shell */
  var Shell = {
    VERSION: 'cart1-shell r5',
    DEFAULT_SLOTS: DEFAULT_SLOTS,
    init: function (nes, opt) {
      // registry 的「第一次開機」路徑沒有包 CT.blank ⇒ 自己包（巢狀呼叫安全：會還原外層的 mute）
      if (CT.blank) CT.blank(nes, function () { Shell._init(nes, opt); });
      else Shell._init(nes, opt);
    },
    _init: function (nes, opt) {
      opt = opt || {};
      nes0 = nes;
      var ppu = nes.ppu;
      S.inited++;
      S.slots = buildSlots();
      S.from = opt.from || null;
      S.launchId = null; S.launchT = 0; S.hold = 0; S.t = 0;
      OV.on = false; OV.key = null; OV.bdOn = false; OV.mode = null;
      buildBanks();
      NES.CHR.setPattern(0, S.bank);
      NES.CHR.setPattern(1, S.spr);
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      if (ppu.spriteMode) ppu.spriteMode(8);
      ppu.flicker = 'rotate'; ppu.flickerStep = 8;
      if (ppu.mirroring) ppu.mirroring('v');
      defineSfx(nes);
      setPalettes(ppu);
      // 游標：回選單 → 停在剛玩的那款；第一次開機 → 0
      var want = 0, i;
      if (S.from) for (i = 0; i < S.slots.length; i++) if (S.slots[i].id === S.from) want = i;
      S.sel = want;
      var skip = S.from || opt.skipBoot || (CT.query && (CT.query('boot') === '0'));
      if (skip) {
        S.mode = 'menu';
        drawMenu(ppu);                                     // init 已在 CT.blank 內
        playMenuSong(nes);
      } else {
        S.mode = 'boot';
        drawBoot(ppu);
        var m = music(nes);
        if (m && m.stop) { try { m.stop(); } catch (e) { } }
      }
    },
    update: function (nes) {
      var m = music(nes);
      if (m && m.tick) { try { m.tick(); } catch (e) { } }
      S.t++;
      var ppu = nes.ppu;
      if (S.mode === 'boot') {
        if (S.t === 48) { drawBootText(ppu); sfx(nes, 'cart1_boot'); }
        if (S.t >= BOOT_FRAMES || (S.t > 8 && (pressed(nes, BTN.START) || pressed(nes, BTN.A)))) enterMenu(nes);
        return;
      }
      if (S.mode === 'launch') {
        S.launchT++;
        rowPal(ppu, S.sel, ((S.launchT >> 2) & 1) ? 0 : 1);
        if (S.launchT >= LAUNCH_FRAMES) {
          var id = S.launchId;
          S.mode = 'menu'; S.launchId = null;
          if (!CT.launch(id, { from: 'shell' })) { CT.blank(nes, function () { drawMenu(ppu); }); }
        }
        return;
      }
      // menu（START+SELECT 一起按 = 回選單熱鍵的手勢 ⇒ 在選單裡兩顆都不算，避免誤進遊戲）
      if (held(nes, BTN.START) && held(nes, BTN.SELECT)) { S.hold = 0; return; }
      var d = moveDir(nes);
      if (d) { select(nes, S.sel + d); sfx(nes, 'cart1_move'); }
      if (pressed(nes, BTN.A) || pressed(nes, BTN.START)) {
        var sl = S.slots[S.sel];
        if (sl && sl.game) {
          S.mode = 'launch'; S.launchT = 0; S.launchId = sl.id;
          if (m && m.stop) { try { m.stop(); } catch (e) { } }
          sfx(nes, 'cart1_ok');
        } else sfx(nes, 'cart1_ng');
      }
    },
    draw: function (nes) {
      var ppu = nes.ppu, t = S.t, k;
      if (S.mode === 'boot') {
        // 大星從上方落到中央（整數緩動），之後左右兩顆閃光交替
        var y = t >= 40 ? 88 : (-16 + ((104 * (t * (80 - t))) / 1600 | 0));
        var x = 120;
        ppu.sprite(0, { x: x, y: y, tile: P('BIG_TL'), pal: 0 });
        ppu.sprite(1, { x: x + 8, y: y, tile: P('BIG_TR'), pal: 0 });
        ppu.sprite(2, { x: x, y: y + 8, tile: P('BIG_BL'), pal: 0 });
        ppu.sprite(3, { x: x + 8, y: y + 8, tile: P('BIG_BR'), pal: 0 });
        if (t >= 48) {
          var on = (t >> 3) & 1;
          ppu.sprite(4, { x: 104, y: 84, tile: P(on ? 'SPK0' : 'SPK1'), pal: 1 });
          ppu.sprite(5, { x: 144, y: 100, tile: P(on ? 'SPK1' : 'SPK0'), pal: 1 });
        } else { ppu.sprite(4, null); ppu.sprite(5, null); }
        return;
      }
      // 選單：游標（左右輕晃）+ logo 旁兩顆閃光
      var bob = (t >> 3) & 1;
      var cy = slotRow(S.sel) * 8 + 4;
      var hide = S.mode === 'launch' && ((S.launchT >> 2) & 1);
      if (hide) ppu.sprite(0, null);
      else ppu.sprite(0, { x: 16 + bob, y: cy, tile: P('CUR'), pal: 0 });
      var ph = (t >> 4) & 3;
      ppu.sprite(1, { x: 60, y: 22, tile: P(ph & 1 ? 'SPK0' : 'SPK1'), pal: 1 });
      ppu.sprite(2, { x: 188, y: 34, tile: P(ph & 2 ? 'SPK0' : 'SPK1'), pal: 1 });
      for (k = 3; k < 6; k++) ppu.sprite(k, null);
    },
    state: function () {
      return {
        mode: S.mode, t: S.t, sel: S.sel, from: S.from, launchId: S.launchId, lastSfx: S.lastSfx, song: S.song,
        inited: S.inited, tiles: S.tileCount || 0, missingGlyph: S.missingGlyph.slice(),
        slots: S.slots.map(function (s) {
          return { id: s.id, title: s.title, registered: !!s.game, best: s.game ? bestOf(s) : null, name: s.nameMode };
        })
      };
    },
    // ---- 測試 / 工具用 ----
    dev: {
      select: function (i) { if (nes0) select(nes0, i); return S.sel; },
      slotRow: slotRow,
      overlayTile: function () { return OV.tile; },
      overlayMode: function () { return OV.mode; },
      overlayLastMode: function () { return OV.lastMode; },
      flashColor: flashColor, backTileOf: backTileOf,
      S: S, SONG: MENU_SONG, SFX: SFX, GLYPH: GLYPH, ICON: ICON
    }
  };
  CT.Shell = Shell;
})();
