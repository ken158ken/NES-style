/*
 * games/cart1/shell.js — 合輯卡帶共用的開機選單（設 CT.Shell；R5《星塵 8 合 1》起，R6 起多卡帶共用）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-0 cart1-shell agent（R5）→ C6-0 cart-platform（R6 多卡帶化）。契約：docs/R5_BRIEF.md §2 / §4、games/cart1/registry.js。
 *
 * R6 多卡帶：卡帶專屬的資料（logo 字 / 副標 / 8 槽 + 圖示 / 槽名點陣 / 選單曲 / 調色盤）一律由
 *   `CT.CART_CFG`（games/cartN/cart.js，在本檔之前載入）提供，本檔只留共用的邏輯與磁磚；
 *   CHR bank / 音效名稱前綴 = CART_CFG.prefix（cart1 = 'cart1_'，與 R5 相同）。沒有 CART_CFG ⇒ 退回空設定（只列已註冊的款）。
 *
 * 流程：開機 logo「STARDUST WORKS」（星星落下 + 鐘聲，約 2.5 秒，A / START 可跳過）
 *     → 選單畫面：上方原創 logo 字「星塵 8 合 1」（16×16 中文字 + 陰影）、下方 8 槽清單
 *       （每槽：原創 16×16 圖示 + 16×16 中文名 + 最高分；未註冊 = 「?」圖示 +「準備中」灰字）
 *     → ↑↓ / SELECT 移動（按住自動連發）、A / START 進入（選中那行閃 30 幀再 CT.launch）
 *     → 遊戲內 START+SELECT 按住 60 幀 → registry 呼叫 CT.back() → 本檔 init({from:id})，
 *       直接回選單（不重播開機 logo），游標停在剛玩的那款。
 *
 * 畫面規格（全部經 PPU）：BG 表 0 = bank '<prefix>_bg'（engine 原創 DEMO.FONT + 邊框 + 星點 +
 *   圖示 + logo 字 + 選單用到的中文字），精靈表 1 = '<prefix>_spr'（游標星、閃光、開機大星）；cart1 = 'cart1_bg' / 'cart1_spr'。
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
 * 音樂 / 音效（全部原創）：選單曲 = CART_CFG.song（cart1_menu / cart2_menu …）、音效 <prefix>_move / _ok / _ng / _boot。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};

  /* ============================================================ 卡帶設定（CT.CART_CFG，見 games/cart1/cart.js 檔頭） */
  var FALLBACK_CFG = {
    id: 'cart', prefix: 'cart', title: 'STARDUST', logo: [], logoGlyph: {}, sub: 'STARDUST 8 IN 1', subCol: 8,
    slots: [], glyph: {}, song: null, palettes: null
  };
  function cfg() { return CT.CART_CFG || FALLBACK_CFG; }
  function prefix() { return String(cfg().prefix || cfg().id || CT.CART || 'cart'); }
  // 槽位預設表（= CART_CFG.slots 換成 R5 的 {id, order, title, icon} 形狀）
  function defaultSlots() {
    return (cfg().slots || []).map(function (d, k) {
      return { id: d.id, order: d.order || (k + 1), title: d.name || d.title || d.id, icon: d.id, legacy: d.legacy || [] };
    });
  }
  var MAX_SLOTS = 10;          // 預設 8 槽；表外 id 的註冊遊戲接在後面（最多 10 列，第 9 列起不畫說明列）
  var NAME_CHARS = 6;          // 名稱最多 6 個中文字（12 欄）

  /* ============================================================ 16×16 中文點陣（每列 4 位十六進位） */
  // 共用字（準備中）；槽名用字由 CART_CFG.glyph 提供，logo 字由 CART_CFG.logoGlyph 提供
  // 產生方式：PIL ImageFont（NotoSansCJK-Regular.ttc, TC, 16px, 門檻 90 / logo 用 Bold 15px 門檻 120）
  var BASE_GLYPH = {
    '準': '21203b2007fe66203ffc02200bfc1220322063fe01807ffe0180018001800180',
    '備': '199817fe3198319877fe730077fe3e66326633fe326633fe36663666342c0000',
    '中': '0180018001807ffe618661866186618661867ffe618601800180018001800180'
  };
  function glyphTable() {
    var out = {}, k, g = cfg().glyph || {};
    for (k in g) if (Object.prototype.hasOwnProperty.call(g, k)) out[k] = g[k];
    for (k in BASE_GLYPH) if (Object.prototype.hasOwnProperty.call(BASE_GLYPH, k)) out[k] = BASE_GLYPH[k];
    return out;
  }
  // logo 用的手繪粗體數字（各卡帶 logo 都是「…8 合 1」，cfg.logoGlyph 沒給就用這兩個）
  var LOGO_DIGIT = {
    '8': '000007e00c301c381c380e7007e00e701c38381c381c381c1c3807f000000000',
    '1': '000001c003c007c00dc001c001c001c001c001c001c001c00ff8000000000000'
  };
  function logoTable() {
    var out = {}, k, g = cfg().logoGlyph || {};
    for (k in g) if (Object.prototype.hasOwnProperty.call(g, k)) out[k] = g[k];
    for (k in LOGO_DIGIT) if (Object.prototype.hasOwnProperty.call(LOGO_DIGIT, k) && !out[k]) out[k] = LOGO_DIGIT[k];
    return out;
  }
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
  // 各槽圖示來自 CART_CFG.slots[i].icon {pal, art}；none = 未註冊 / 表外 id 的「?」
  var NONE_ICON = {
    pal: 0, art: [
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
      '................']
  };
  function iconTable() {
    var out = {}, sl = cfg().slots || [], i;
    for (i = 0; i < sl.length; i++) if (sl[i] && sl[i].icon && sl[i].icon.art) out[sl[i].id] = { pal: sl[i].icon.pal | 0, art: sl[i].icon.art };
    out.none = NONE_ICON;
    return out;
  }
  var ICON = iconTable();
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
  // 選單曲 = CART_CFG.song（物件，或 function(kit) → song）；同一個 cfg 只建一次
  var songCache = { src: null, song: null };
  function menuSong() {
    var src = cfg().song;
    if (!src) return null;
    if (songCache.src !== src) {
      songCache.src = src;
      try { songCache.song = (typeof src === 'function') ? src({ track: track, drums: drums, R32: R32 }) : src; }
      catch (e) { songCache.song = null; }
    }
    return songCache.song;
  }
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
  var SFX_BASE = {
    move: { priority: 3, data: { p2: sq([['E-6', 2, 9, 1], ['A-6', 3, 7, 1]]) } },
    ok: { priority: 6, data: { p2: sq([['C-6', 3, 12, 2], ['E-6', 3, 12, 2], ['G-6', 3, 12, 2], ['C-7', 8, 11, 2], ['C-7', 6, 6, 2]]) } },
    ng: { priority: 5, data: { p2: sq([['C-4', 4, 11, 0], ['B-3', 6, 9, 0]]) } },
    boot: { priority: 7, data: { p2: sq([['G-6', 4, 13, 1], ['D-7', 4, 12, 1], ['G-7', 10, 11, 1], ['G-7', 10, 6, 1], ['G-7', 10, 3, 1]]) } }
  };
  // 音效名 = <prefix>_move / _ok / _ng / _boot（CART_CFG.sfx 可逐個覆寫資料）；cart1 = cart1_move …（同 R5）
  var SFX = {};
  function buildSfx() {
    var k, o = (cfg().sfx) || {};
    SFX = {};
    for (k in SFX_BASE) if (Object.prototype.hasOwnProperty.call(SFX_BASE, k)) SFX[prefix() + '_' + k] = o[k] || SFX_BASE[k];
    return SFX;
  }
  buildSfx();
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
    var song = menuSong();
    if (!song) { try { m.stop(); } catch (e0) { } S.song = null; return; }
    try { m.play(song, { loop: true }); S.song = song.name || (prefix() + '_menu'); } catch (e) { }
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
    var DEFAULT_SLOTS = defaultSlots();
    for (i = 0; i < DEFAULT_SLOTS.length; i++) {
      var d = DEFAULT_SLOTS[i];
      g = CT.get ? CT.get(d.id) : null;
      // R6：卡帶設定裡的槽位順序優先（選單版面歸卡帶管；cart1 兩邊一致 ⇒ 與 R5 相同），表外 id 才用遊戲自己的 order
      list.push({ id: d.id, order: d.order || (g && g.order) || 99, title: g ? (g.title || d.title) : d.title,
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
    var G = glyphTable();
    if (G[ch]) return hexRows(G[ch]);
    return rasterGlyph(ch);
  }
  function buildBanks() {
    ICON = iconTable();
    var LOGO_GLYPH = logoTable();
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
    S.bank = NES.CHR.bank(prefix() + '_bg', bg);
    S.spr = NES.CHR.bank(prefix() + '_spr', SPR);
    S.tileCount = S.bank.tiles.length;
  }
  function T(name) { return S.bank.index(name); }
  function P(name) { return S.spr.index(name); }

  /* ============================================================ 畫面（全部在 CT.blank 內呼叫） */
  var DEFAULT_PAL = {
    backdrop: 0x0F,
    bg: [[0x11, 0x10, 0x30], [0x11, 0x00, 0x28], [0x16, 0x27, 0x38], [0x12, 0x2A, 0x30]],
    spr: [[0x16, 0x27, 0x38], [0x21, 0x31, 0x30], [0x16, 0x27, 0x38], [0x12, 0x2A, 0x30]]
  };
  function setPalettes(ppu) {
    // BG0 一般字 / BG1 選中行 / BG2 暖色圖示 + logo / BG3 冷色圖示；SPR0 游標 + 開機大星 / SPR1 閃光（CART_CFG.palettes）
    var P0 = cfg().palettes || DEFAULT_PAL, i;
    ppu.setBackdrop(P0.backdrop === undefined ? 0x0F : P0.backdrop);
    for (i = 0; i < 4; i++) ppu.setBgPalette(i, (P0.bg || DEFAULT_PAL.bg)[i] || DEFAULT_PAL.bg[i]);
    for (i = 0; i < 4; i++) ppu.setSprPalette(i, (P0.spr || DEFAULT_PAL.spr)[i] || DEFAULT_PAL.spr[i]);
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
    var bt = String(cfg().bootText || 'STARDUST WORKS').substring(0, 30), c0 = 16 - Math.ceil(bt.length / 2);
    text(ppu, c0, 15, bt);
    ppu.fillTiles(0, c0, 16, bt.length, 1, T('BAR'));
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
    var C = cfg(), LOGO = C.logo || [], LG = logoTable(), i;
    for (i = 0; i < LOGO.length; i++) if (LG[LOGO[i][0]]) quad(ppu, LOGO[i][1], 3, 'LG_' + LOGO[i][0] + '_');
    var lp = (C.logoPal === undefined ? 2 : C.logoPal) & 3;                 // logo 調色盤（cart1 = 2 暖色）
    for (c = 1; c <= 14; c++) { ppu.setAttr(0, c, 1, lp); ppu.setAttr(0, c, 2, lp); }
    // logo 兩側星點
    var DOTS = C.dots || [[5, 3, 'DOT2'], [7, 5, 'DOT1'], [24, 4, 'DOT2'], [26, 2, 'DOT1'], [3, 5, 'DOT1'], [28, 5, 'DOT2']];
    for (i = 0; i < DOTS.length; i++) ppu.setTile(0, DOTS[i][0], DOTS[i][1], T(DOTS[i][2] === 'DOT1' ? 'DOT1' : 'DOT2'));
    var sub = String(C.sub || '');
    text(ppu, C.subCol === undefined ? Math.max(1, 16 - (sub.length >> 1)) : C.subCol, 6, sub);
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
    VERSION: 'cart-shell r6',
    get DEFAULT_SLOTS() { return defaultSlots(); },
    cart: function () { return cfg(); },
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
      buildSfx();
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
        if (S.t === 48) { drawBootText(ppu); sfx(nes, prefix() + '_boot'); }
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
      if (d) { select(nes, S.sel + d); sfx(nes, prefix() + '_move'); }
      if (pressed(nes, BTN.A) || pressed(nes, BTN.START)) {
        var sl = S.slots[S.sel];
        if (sl && sl.game) {
          S.mode = 'launch'; S.launchT = 0; S.launchId = sl.id;
          if (m && m.stop) { try { m.stop(); } catch (e) { } }
          sfx(nes, prefix() + '_ok');
        } else sfx(nes, prefix() + '_ng');
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
      var SPK = cfg().sparkles || [[60, 22], [188, 34]];
      ppu.sprite(1, { x: SPK[0][0], y: SPK[0][1], tile: P(ph & 1 ? 'SPK0' : 'SPK1'), pal: 1 });
      ppu.sprite(2, { x: SPK[1][0], y: SPK[1][1], tile: P(ph & 2 ? 'SPK0' : 'SPK1'), pal: 1 });
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
      S: S,
      get SONG() { return menuSong(); }, get SFX() { return SFX; }, get GLYPH() { return glyphTable(); },
      get ICON() { return ICON; }, get CFG() { return cfg(); }
    }
  };
  CT.Shell = Shell;
})();
