/*
 * games/cart5/text.js — 卡帶五中文文字系統 CT.Text（R9 C9-0 cart5-text）
 * ---------------------------------------------------------------------------
 * 用法與規格以 docs/ENGINE_API.md「卡帶五文字系統（CT.Text）」為準；字形資料 games/cart5/glyphs.js（CT.GLYPHS，
 * tools/cjk_glyphs.py 產生）。像真機的 CHR-RAM：遊戲的背景 bank 預留一段「字形池」磁磚，執行期把當頁需要的
 * 16×16 全形字（4 磚）/ 8×16 半形字（2 磚）寫進池裡再排到名稱表；每磚 16 byte + 每格 1 byte **都計 VBlank 預算**，
 * 所以文字是「打字機」逐字出現。runtime 不用 canvas 字型。
 *
 *   // init（在 CT.blank 裡）：
 *   var obj = { ...自己的背景磁磚 };
 *   CT.Text.reserve(obj, 128);                       // 加框線磁磚 TX_* + 字形池 TX_P0..TX_P127
 *   var bank = NES.CHR.bank('adv_bg', obj); NES.CHR.setPattern(0, bank);
 *   var T = CT.Text.create(nes, { bank: bank });      // 預設 fg 色 3、底色 0、框線色 1 / 2
 *   var box = T.box({ x: 1, y: 20, w: 30, h: 8 });
 *   box.say('第一頁……\f第二頁', { name: '星燈' });
 *   // update：
 *   T.update();                                        // 讀手把（A 加速 / 翻頁、↑↓ 選單）+ 依預算寫 PPU
 *   if (box.state().phase === 'closed') ...
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};

  var VERSION = 'cart5-text r1';
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var COLS = 32, ROWS = 30, CELLS = COLS * ROWS;
  var TILE_BYTES = 16;                       // 2bpp 8×8 = 16 byte（CHR-RAM 上傳成本）
  var ASCII_DY = 4;                          // 半形 8×8 字身在 16 列行高裡往下移 4 列（與全形字身置中）
  var CLOSE_PUNCT = '，。、！？：；」』）》〉…～,.!?:;)]}%';
  var OPEN_PUNCT = '「『（《〈([{';
  var DASH = '—―─';                           // 破折號：整串不拆、不放行首
  var PAUSE_PUNCT = '。！？…!?';
  var missingAll = [];

  /* ============================================================ 框線磁磚（原創；. 底色 1 框暗 2 框亮 3 字色） */
  var FRAME_ART = {
    TX_BLANK: ['........', '........', '........', '........', '........', '........', '........', '........'],
    TX_H: ['........', '........', '........', '22222222', '11111111', '........', '........', '........'],
    TX_V: ['...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...', '...21...'],
    TX_TL: ['........', '........', '........', '...22222', '...21111', '...21...', '...21...', '...21...'],
    TX_TR: ['........', '........', '........', '22222...', '11121...', '...21...', '...21...', '...21...'],
    TX_BL: ['...21...', '...21...', '...21...', '...22222', '...11111', '........', '........', '........'],
    TX_BR: ['...21...', '...21...', '...21...', '22221...', '11111...', '........', '........', '........'],
    TX_J: ['...21...', '...21...', '...21...', '22221222', '11111111', '........', '........', '........'],
    TX_NEXT: ['........', '........', '3333333.', '.33333..', '..333...', '...3....', '........', '........'],
    TX_END: ['........', '........', '.33333..', '.33333..', '.33333..', '.33333..', '.33333..', '........'],
    TX_CUR0: ['........', '........', '........', '........', '.3......', '.33.....', '.333....', '.3333...'],
    TX_CUR1: ['.3333...', '.333....', '.33.....', '.3......', '........', '........', '........', '........']
  };
  var FRAME_NAMES = Object.keys(FRAME_ART);

  function rowsBlank() { return FRAME_ART.TX_BLANK.slice(0); }

  /* ============================================================ 字形資料 */
  function glyphs() { return CT.GLYPHS || { cjk: {}, ascii: {} }; }
  function isAscii(ch) { var c = ch.charCodeAt(0); return c >= 0x20 && c <= 0x7E; }
  function hasGlyph(ch) { return isAscii(ch) ? !!glyphs().ascii[ch] : !!glyphs().cjk[ch]; }
  // 全形字 → 16 個 16 位元整數；缺字 → □（記入 missing）
  function cjkBits(ch, miss) {
    var h = glyphs().cjk[ch];
    if (!h) {
      if (miss && miss.indexOf(ch) < 0) miss.push(ch);
      if (missingAll.indexOf(ch) < 0) missingAll.push(ch);
      h = glyphs().cjk['□'];
      if (!h) return null;
    }
    var out = [], i;
    for (i = 0; i < 16; i++) out.push(parseInt(h.substr(i * 4, 4), 16) | 0);
    return out;
  }
  function asciiBits(ch) {
    var h = glyphs().ascii[ch] || glyphs().ascii['?'] || '0000000000000000', out = [], i;
    for (i = 0; i < 8; i++) out.push(parseInt(h.substr(i * 2, 2), 16) | 0);
    return out;
  }
  // 字寬（欄）：半形 1、全形 2、控制字元 0
  function widthOf(ch) {
    if (ch === '\n' || ch === '\f' || ch === '\r') return 0;
    return isAscii(ch) ? 1 : 2;
  }
  function tilesOf(ch) {
    if (ch === ' ' || ch === '　') return 0;
    return isAscii(ch) ? 2 : 4;
  }
  function measure(s) {
    s = String(s); var w = 0, i;
    for (i = 0; i < s.length; i++) w += widthOf(s.charAt(i));
    return w;
  }

  /* ============================================================ 斷行 / 分頁（純函式） */
  // wrap(text, cols) → [[字串行, ...], ...]（外層 = 以 \f 強制分段；每行寬 ≤ cols 欄，不截斷）
  function wrap(text, cols) {
    text = String(text).replace(/\r\n?/g, '\n');
    cols = Math.max(2, cols | 0);
    var segs = text.split('\f'), out = [], s;
    for (s = 0; s < segs.length; s++) out.push(wrapSeg(segs[s], cols));
    return out;
  }
  function isWordCh(ch) { return /[A-Za-z0-9'_\-]/.test(ch); }
  // 斷行單位（不可拆的一串）：
  //   · 收尾標點（CLOSE_PUNCT）黏在前一個單位後面 ⇒ 「」。」「！？」「……」不拆、行首不放收尾標點（避頭，連續標點會連同前一字一起帶到下一行）；
  //   · 破折號 —（DASH）整串黏在前一個單位後面 ⇒ 「——」不拆、行首不放破折號；
  //   · 開頭標點（OPEN_PUNCT）黏在下一個單位前面 ⇒ 行末不放「「（」（避尾）；
  //   · 英文單字（含數字）一個字一個單位。
  // 單位比一整行還寬時才逐字硬切（極端窄欄）。
  function units(seg) {
    var out = [], i = 0, n = seg.length, lead = '';
    function add(u, glue) {
      if (glue && out.length && out[out.length - 1] !== ' ' && !lead) out[out.length - 1] += u;
      else { out.push(lead + u); lead = ''; }
    }
    while (i < n) {
      var ch = seg.charAt(i);
      if (OPEN_PUNCT.indexOf(ch) >= 0) { lead += ch; i++; continue; }
      if (ch === ' ') { if (lead) { out.push(lead); lead = ''; } out.push(' '); i++; continue; }
      if (isWordCh(ch)) {
        var j = i; while (j < n && isWordCh(seg.charAt(j))) j++;
        add(seg.substring(i, j), false); i = j; continue;
      }
      add(ch, CLOSE_PUNCT.indexOf(ch) >= 0 || DASH.indexOf(ch) >= 0);
      i++;
    }
    if (lead) out.push(lead);
    return out;
  }
  function wrapSeg(seg, cols) {
    var lines = [], paras = seg.split('\n'), p;
    for (p = 0; p < paras.length; p++) {
      var us = units(paras[p]), line = '', w = 0, k, c, wrapped = false;
      for (k = 0; k < us.length; k++) {
        var u = us[k], uw = measure(u);
        if (u === ' ') {                                   // 自動換行後的行首空白丟掉
          if (w === 0 && wrapped) continue;
          if (w + 1 > cols) { lines.push(line.replace(/ +$/, '')); line = ''; w = 0; wrapped = true; continue; }
          line += u; w++; continue;
        }
        if (w + uw > cols && w > 0) { lines.push(line.replace(/ +$/, '')); line = ''; w = 0; wrapped = true; }
        if (uw > cols) {                                   // 比一行還寬：逐字硬切
          for (c = 0; c < u.length; c++) {
            var cw = widthOf(u.charAt(c));
            if (w + cw > cols && w > 0) { lines.push(line); line = ''; w = 0; wrapped = true; }
            line += u.charAt(c); w += cw;
          }
          continue;
        }
        line += u; w += uw; wrapped = false;
      }
      lines.push(line.replace(/ +$/, ''));
    }
    return lines;
  }
  // 一頁（一組行）需要的池磁磚數（同字只算一次）
  function pageTiles(lines) {
    var seen = {}, n = 0, i, j;
    for (i = 0; i < lines.length; i++) {
      for (j = 0; j < lines[i].length; j++) {
        var ch = lines[i].charAt(j);
        if (seen[ch]) continue;
        seen[ch] = 1; n += tilesOf(ch);
      }
    }
    return n;
  }
  // paginate(text, cols, maxLines, capTiles) → [[行...], ...]；每頁 ≤ maxLines 行且用字 ≤ capTiles 磁磚
  function paginate(text, cols, maxLines, cap) {
    var segs = wrap(text, cols), pages = [], s, i;
    cap = cap === undefined ? 1e9 : cap;
    for (s = 0; s < segs.length; s++) {
      var cur = [];
      var lines = splitByCap(segs[s], cap);
      for (i = 0; i < lines.length; i++) {
        if (cur.length && (cur.length >= maxLines || pageTiles(cur.concat([lines[i]])) > cap)) { pages.push(cur); cur = []; }
        cur.push(lines[i]);
      }
      if (cur.length) pages.push(cur);
    }
    return pages;
  }
  // 單行本身就超過容量（池太小）→ 從字中間切成多行（極端情況；正常池 ≥ 一行 4 × 字數）
  function splitByCap(lines, cap) {
    var out = [], i;
    for (i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (pageTiles([l]) <= cap) { out.push(l); continue; }
      var cur = '', j;
      for (j = 0; j < l.length; j++) {
        if (cur && pageTiles([cur + l.charAt(j)]) > cap) { out.push(cur); cur = ''; }
        cur += l.charAt(j);
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  /* ============================================================ reserve：在 bank 定義物件裡預留磁磚 */
  function reserve(obj, slots) {
    slots = slots === undefined ? 128 : (slots | 0);
    if (slots < 16) throw new Error('CT.Text.reserve：字形池至少 16 磚');
    var i;
    for (i = 0; i < FRAME_NAMES.length; i++) obj[FRAME_NAMES[i]] = rowsBlank();
    for (i = 0; i < slots; i++) obj['TX_P' + i] = rowsBlank();
    return obj;
  }
  reserve.frameTiles = FRAME_NAMES.length;

  /* ============================================================ create：一個文字系統實例（綁一個 bank） */
  function create(nes, opt) {
    opt = opt || {};
    var bank = opt.bank;
    if (typeof bank === 'string') bank = NES.CHR.getBank(bank);
    if (!bank || !bank.tiles || !bank.has || !bank.has('TX_P0')) throw new Error('CT.Text.create：bank 沒有 CT.Text.reserve() 的磁磚');
    var ppu = nes.ppu;
    var style0 = {
      fg: opt.fg === undefined ? 3 : opt.fg, shadow: opt.shadow | 0, bg: opt.bg | 0,
      f1: opt.frame1 === undefined ? 1 : opt.frame1, f2: opt.frame2 === undefined ? 2 : opt.frame2
    };
    var pool = [], i;
    for (i = 0; bank.has('TX_P' + i); i++) pool.push(bank.index('TX_P' + i));
    var TI = {};
    for (i = 0; i < FRAME_NAMES.length; i++) TI[FRAME_NAMES[i].substring(3)] = bank.index(FRAME_NAMES[i]);

    var T = {
      VERSION: VERSION, nes: nes, bank: bank, ppu: ppu, style: style0, nt: opt.nt | 0,
      maxBytes: opt.maxBytes === undefined ? 136 : (opt.maxBytes | 0),
      reserveBytes: opt.reserveBytes === undefined ? 16 : (opt.reserveBytes | 0),
      tile: TI, poolSize: pool.length, widgets: [], input: opt.input !== false
    };
    var free = pool.slice(0);                  // 空著的池磁磚
    var cache = {};                            // key → {key, ch, tiles[], refs, last}
    var cacheN = 0, useSerial = 0;
    var cellPl = [new Array(CELLS), new Array(CELLS)];    // 每格目前顯示的字形放置（{g, left}）
    var cellTile = [new Array(CELLS), new Array(CELLS)];  // 每格本系統最後寫的磁磚（undefined = 不是本系統寫的）
    var queue = [], qHead = 0;
    var st = { frame: -1, spent: 0, peak: 0, uploads: 0, glyphUploads: 0, hits: 0, evictions: 0, overflow: 0,
      cellWrites: 0, bytesTotal: 0, frames: 0, missing: [] };

    /* ---------- 像素：把字形畫進 bank 的磁磚（in-place；ppu.render 每幀清快取 ⇒ 立刻生效） ---------- */
    function paintFrameTiles() {
      var k;
      for (k in FRAME_ART) {
        if (!Object.prototype.hasOwnProperty.call(FRAME_ART, k)) continue;
        var t = bank.tiles[bank.index(k)], art = FRAME_ART[k], y, x;
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
          var c = art[y].charAt(x);
          t[y * 8 + x] = c === '1' ? style0.f1 : c === '2' ? style0.f2 : c === '3' ? style0.fg : style0.bg;
        }
      }
    }
    // bits(x,y) → 0/1；寫 cw×ch 磚（cw 磚寬 1/2，chh 磚高 2）
    function paintGlyph(tiles, cw, bitAt, sty) {
      var tx, ty, y, x;
      for (ty = 0; ty < 2; ty++) for (tx = 0; tx < cw; tx++) {
        var t = bank.tiles[tiles[ty * cw + tx]];
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
          var gx = tx * 8 + x, gy = ty * 8 + y, v;
          if (bitAt(gx, gy)) v = sty.fg;
          else if (sty.shadow && bitAt(gx - 1, gy - 1)) v = sty.shadow;
          else v = sty.bg;
          t[y * 8 + x] = v;
        }
      }
    }
    function upload(g) {
      var sty = g.sty;
      if (g.ascii) {
        var ab = asciiBits(g.ch);
        paintGlyph(g.tiles, 1, function (x, y) {
          y -= ASCII_DY;
          return (x >= 0 && x < 8 && y >= 0 && y < 8) ? ((ab[y] >> (7 - x)) & 1) : 0;
        }, sty);
      } else {
        var cb = cjkBits(g.ch, st.missing) || [];
        paintGlyph(g.tiles, 2, function (x, y) {
          return (x >= 0 && x < 16 && y >= 0 && y < 16 && cb[y]) ? ((cb[y] >> (15 - x)) & 1) : 0;
        }, sty);
      }
    }

    /* ---------- 字形池（LRU；只回收畫面上沒有任何格子在用的字） ---------- */
    function keyOf(ch, sty) { return sty.fg + '' + sty.shadow + sty.bg + ch; }
    function lookup(ch, sty) { return cache[keyOf(ch, sty)] || null; }
    function evictOne() {
      var best = null, k;
      for (k in cache) {
        if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
        var g = cache[k];
        if (g.refs > 0) continue;
        if (!best || g.last < best.last) best = g;
      }
      if (!best) return false;
      delete cache[best.key]; cacheN--;
      for (var j = 0; j < best.tiles.length; j++) free.push(best.tiles[j]);
      st.evictions++;
      return true;
    }
    function alloc(ch, sty) {
      var n = isAscii(ch) ? 2 : 4;
      while (free.length < n) if (!evictOne()) return null;
      var g = { key: keyOf(ch, sty), ch: ch, sty: sty, ascii: n === 2, tiles: free.splice(0, n), refs: 0, last: ++useSerial };
      cache[g.key] = g; cacheN++;
      return g;
    }

    /* ---------- 名稱表格子（追蹤哪格顯示哪個字 ⇒ 正確的參照計數） ---------- */
    function idx(col, row) { return row * COLS + col; }
    function inScreen(col, row) { return col >= 0 && col < COLS && row >= 0 && row < ROWS; }
    function dropCell(nt, i) {
      var pl = cellPl[nt][i];
      if (!pl) return;
      cellPl[nt][i] = null;
      if (--pl.left === 0) pl.g.refs--;
    }
    function writeCell(nt, col, row, tile) {
      if (!inScreen(col, row)) return;
      var i = idx(col, row);
      dropCell(nt, i);
      ppu.setTile(nt, col, row, tile);        // 1 byte（ppu 自動計帳）
      cellTile[nt][i] = tile;
      st.cellWrites++;
    }

    /* ---------- 工作佇列（依預算逐幀消化） ---------- */
    function budget() { return (ppu && ppu.budget) || (nes.timing && nes.timing.budget) || null; }
    function muted() { var b = budget(); return !!(b && b.mute); }
    function frameNo() { return (nes.timing && nes.timing.frame) | 0; }
    function syncFrame() {
      var f = frameNo();
      if (f !== st.frame) {
        if (st.frame >= 0 && st.spent) st.frames++;
        st.frame = f; st.spent = 0;
      }
    }
    function allowance() {
      if (muted()) return 1e9;
      syncFrame();
      var b = budget(), a = T.maxBytes - st.spent;
      if (b) a = Math.min(a, b.left() - T.reserveBytes);
      return a;
    }
    function charge(n) {
      if (muted()) return;
      st.spent += n; st.bytesTotal += n;
      if (st.spent > st.peak) st.peak = st.spent;
    }
    function jobCost(j) {
      if (j.t === 'tile') return 1;
      if (j.t === 'attr') return 1;
      if (j.t === 'call') return 0;
      if (j.t === 'glyph') {
        if (j.ch === ' ' || j.ch === '　') return 0;
        var n = isAscii(j.ch) ? 2 : 4;
        return (lookup(j.ch, j.sty) ? 0 : n * TILE_BYTES) + n;
      }
      return 0;
    }
    function runJob(j) {
      if (j.t === 'tile') { writeCell(j.nt, j.col, j.row, j.tile); charge(1); return; }
      if (j.t === 'attr') { ppu.setAttr(j.nt, j.c16, j.r16, j.pal); charge(1); return; }
      if (j.t === 'call') { j.fn(); return; }
      if (j.t !== 'glyph' || j.ch === ' ' || j.ch === '　') return;
      var g = lookup(j.ch, j.sty), bud = budget();
      if (g) { st.hits++; }
      else {
        g = alloc(j.ch, j.sty);
        if (!g) {                                // 池滿且全部都在畫面上：寫空白並記帳（不該發生：分頁會先檢查容量）
          st.overflow++;
          var w0 = isAscii(j.ch) ? 1 : 2, a, b2;
          for (a = 0; a < 2; a++) for (b2 = 0; b2 < w0; b2++) { writeCell(j.nt, j.col + b2, j.row + a, TI.BLANK); charge(1); }
          return;
        }
        upload(g);
        if (bud && bud.use) bud.use(g.tiles.length * TILE_BYTES);     // CHR-RAM 上傳：每磚 16 byte
        charge(g.tiles.length * TILE_BYTES);
        st.uploads += g.tiles.length; st.glyphUploads++;
      }
      g.last = ++useSerial;
      var cw = g.ascii ? 1 : 2, pl = { g: g, left: 0 }, ty, tx;
      for (ty = 0; ty < 2; ty++) for (tx = 0; tx < cw; tx++) {
        var c = j.col + tx, r = j.row + ty;
        if (!inScreen(c, r)) continue;
        writeCell(j.nt, c, r, g.tiles[ty * cw + tx]);
        charge(1);
        cellPl[j.nt][idx(c, r)] = pl; pl.left++;
      }
      if (pl.left) g.refs++;
    }
    function pump() {
      var a = allowance();
      while (qHead < queue.length) {
        var j = queue[qHead], c = jobCost(j);
        if (c > a) break;
        queue[qHead++] = null;
        runJob(j);
        a -= c;
      }
      if (qHead >= queue.length) { queue.length = 0; qHead = 0; }
      else if (qHead > 256) { queue = queue.slice(qHead); qHead = 0; }
    }
    function push(j) { queue.push(j); return j; }
    function pending() { return queue.length - qHead; }

    /* ---------- 低階：排入寫入 ---------- */
    function mkStyle(o) {
      if (!o) return style0;
      return { fg: o.fg === undefined ? style0.fg : o.fg, shadow: o.shadow === undefined ? style0.shadow : o.shadow,
        bg: o.bg === undefined ? style0.bg : o.bg };
    }
    function qGlyph(nt, col, row, ch, sty) { push({ t: 'glyph', nt: nt, col: col, row: row, ch: ch, sty: sty }); }
    function qTile(nt, col, row, tile) { push({ t: 'tile', nt: nt, col: col, row: row, tile: tile }); }
    function qClear(nt, col, row, w, h, force) {
      var r, c;
      for (r = row; r < row + h; r++) for (c = col; c < col + w; c++) {
        if (!inScreen(c, r)) continue;
        if (!force && cellTile[nt][idx(c, r)] === TI.BLANK) continue;   // 已是空白就省 1 byte
        qTile(nt, c, r, TI.BLANK);
      }
    }
    function qFrame(nt, x, y, w, h) {
      var c, r;
      qTile(nt, x, y, TI.TL); for (c = x + 1; c < x + w - 1; c++) qTile(nt, c, y, TI.H); qTile(nt, x + w - 1, y, TI.TR);
      for (r = y + 1; r < y + h - 1; r++) { qTile(nt, x, r, TI.V); qTile(nt, x + w - 1, r, TI.V); }
      qTile(nt, x, y + h - 1, TI.BL); for (c = x + 1; c < x + w - 1; c++) qTile(nt, c, y + h - 1, TI.H); qTile(nt, x + w - 1, y + h - 1, TI.BR);
    }
    function qAttr(nt, x, y, w, h, pal) {
      if (pal === undefined || pal === null) return;
      var c16, r16;
      for (r16 = y >> 1; r16 <= (y + h - 1) >> 1; r16++) for (c16 = x >> 1; c16 <= (x + w - 1) >> 1; c16++)
        if (c16 >= 0 && c16 < 16 && r16 >= 0 && r16 < 15) push({ t: 'attr', nt: nt, c16: c16, r16: r16, pal: pal });
    }
    // 一行文字：全形 2×2 格、半形 1×2 格；回傳寫到的欄寬
    function qLine(nt, col, row, s, sty) {
      var c = col, i;
      for (i = 0; i < s.length; i++) {
        var ch = s.charAt(i), w = widthOf(ch);
        if (!w) continue;
        qGlyph(nt, c, row, ch, sty);
        c += w;
      }
      return c - col;
    }
    // 畫面上某矩形「外面」正在用（或已排隊要用）的池磁磚
    // 畫面上某矩形「外面」正在用的池磁磚——以「佇列全部寫完之後」的畫面計算（排隊要擦的不算、排隊要寫的算）
    function heldOutside(nt, x, y, w, h) {
      var fut = new Array(CELLS), tl = {}, i, j, a, b2;
      for (i = 0; i < CELLS; i++) { var pl = cellPl[nt][i]; if (pl) { fut[i] = pl.g.key; tl[pl.g.key] = pl.g.tiles.length; } }
      for (i = qHead; i < queue.length; i++) {
        j = queue[i];
        if (!j || j.nt !== nt) continue;
        if (j.t === 'tile') { if (inScreen(j.col, j.row)) fut[idx(j.col, j.row)] = null; }
        else if (j.t === 'glyph' && tilesOf(j.ch)) {
          var k = keyOf(j.ch, j.sty), cw = isAscii(j.ch) ? 1 : 2;
          tl[k] = tilesOf(j.ch);
          for (a = 0; a < 2; a++) for (b2 = 0; b2 < cw; b2++) if (inScreen(j.col + b2, j.row + a)) fut[idx(j.col + b2, j.row + a)] = k;
        }
      }
      var seen = {}, n = 0;
      for (i = 0; i < CELLS; i++) {
        if (!fut[i] || seen[fut[i]]) continue;
        var c = i % COLS, r = (i / COLS) | 0;
        if (c >= x && c < x + w && r >= y && r < y + h) continue;
        seen[fut[i]] = 1; n += tl[fut[i]];
      }
      return n;
    }

    /* ============================================================ 公開：低階 */
    T.measure = measure;
    T.wrap = function (s, cols) { return wrap(s, cols); };
    T.paginate = function (s, cols, lines, cap) { return paginate(s, cols, lines, cap === undefined ? pool.length : cap); };
    T.has = hasGlyph;
    // print(col, row, text, {nt, style, w}) → {cols, lines}：立即排入（不打字機；依預算數幀內寫完）
    T.print = function (col, row, s, o) {
      o = o || {};
      var nt = o.nt === undefined ? T.nt : o.nt, sty = mkStyle(o.style || o), lines = o.w ? wrap(s, o.w)[0] : String(s).split('\n');
      var maxw = 0, i;
      for (i = 0; i < lines.length; i++) maxw = Math.max(maxw, qLine(nt, col, row + i * 2, lines[i], sty));
      return { cols: maxw, lines: lines.length };
    };
    T.clear = function (col, row, w, h, o) { qClear((o && o.nt !== undefined) ? o.nt : T.nt, col, row, w, h, !!(o && o.force)); };
    T.frame = function (x, y, w, h, o) {
      var nt = (o && o.nt !== undefined) ? o.nt : T.nt;
      qFrame(nt, x, y, w, h);
      if (o && o.fill !== false) qClear(nt, x + 1, y + 1, w - 2, h - 2, true);
      if (o && o.pal !== undefined) qAttr(nt, x, y, w, h, o.pal);
    };
    T.call = function (fn) { push({ t: 'call', fn: fn }); };
    T.busy = function () { return pending() > 0; };
    T.pending = pending;
    // 在 CT.blank（預算 mute）裡呼叫 = 一次寫完；其他時候 = 照預算寫
    T.flush = function () { pump(); return pending(); };
    T.pump = pump;
    // 遊戲自己整片重畫名稱表後呼叫：忘掉所有格子（池內容保留當快取）
    T.reset = function () {
      var nt, i;
      for (nt = 0; nt < 2; nt++) for (i = 0; i < CELLS; i++) { cellPl[nt][i] = null; cellTile[nt][i] = undefined; }
      for (var k in cache) if (Object.prototype.hasOwnProperty.call(cache, k)) cache[k].refs = 0;
      queue.length = 0; qHead = 0;
    };
    // 遊戲自己蓋掉某區（不經本系統）後呼叫：該區的字不再算「在畫面上」
    T.release = function (col, row, w, h, o) {
      var nt = (o && o.nt !== undefined) ? o.nt : T.nt, r, c;
      for (r = row; r < row + h; r++) for (c = col; c < col + w; c++) if (inScreen(c, r)) { dropCell(nt, idx(c, r)); cellTile[nt][idx(c, r)] = undefined; }
    };
    T.free = function () {          // 目前可用（空著 + 可回收）的池磁磚
      var n = free.length, k;
      for (k in cache) if (Object.prototype.hasOwnProperty.call(cache, k) && cache[k].refs <= 0) n += cache[k].tiles.length;
      return n;
    };
    T.heldOutside = function (x, y, w, h, nt) { return heldOutside(nt === undefined ? T.nt : nt, x, y, w, h); };
    T.stats = function () {
      syncFrame();
      return { bytes: st.spent, peak: st.peak, uploads: st.uploads, glyphUploads: st.glyphUploads, hits: st.hits,
        evictions: st.evictions, overflow: st.overflow, cellWrites: st.cellWrites, bytesTotal: st.bytesTotal,
        cached: cacheN, free: free.length, pool: pool.length, queue: pending(), missing: st.missing.slice(),
        maxBytes: T.maxBytes, reserveBytes: T.reserveBytes };
    };
    // 測試用：讀回某格目前顯示的字（由 cellPl 反查）
    T.charAt = function (col, row, nt) {
      var pl = cellPl[nt === undefined ? T.nt : nt][idx(col, row)];
      return pl ? pl.g.ch : null;
    };
    T.readLine = function (col, row, cols, nt) {     // 讀回一行（全形字只在左上格算一次）
      nt = nt === undefined ? T.nt : nt;
      var s = '', c = col, end = col + cols;
      while (c < end) {
        var pl = cellPl[nt][idx(c, row)];
        if (pl && pl.g.ascii) { s += pl.g.ch; c += 1; }
        else if (pl) { s += pl.g.ch; c += 2; }
        else { s += ' '; c += 1; }
      }
      return s.replace(/ +$/, '');
    };

    /* ============================================================ 輸入 */
    var I = function () { return nes.input || NES.Input; };
    function pressed(b) { var i = I(); return !!(i && i.pressed && i.pressed(b)); }
    function held(b) { var i = I(); return !!(i && i.held && i.held(b)); }

    /* ============================================================ 對話框 box */
    T.box = function (o) {
      o = o || {};
      var nt = o.nt === undefined ? T.nt : o.nt;
      var B = {
        kind: 'box', x: o.x === undefined ? 1 : o.x, y: o.y === undefined ? 20 : o.y,
        w: o.w === undefined ? 30 : o.w, h: o.h === undefined ? 8 : o.h,
        pad: o.pad === undefined ? 1 : o.pad, pitch: o.pitch === undefined ? 2 : o.pitch,
        speed: o.speed === undefined ? 2 : o.speed, pausePunct: o.pausePunct === undefined ? 8 : o.pausePunct,
        pal: o.pal, sty: mkStyle(o.style), nameSty: mkStyle(o.nameStyle || o.style), input: o.input === undefined ? T.input : o.input,
        phase: 'idle', pages: [], page: 0, line: 0, pos: 0, wait: 0, t: 0, rush: false, drawn: false,
        name: null, plateW: 0, onPage: null, onClose: null, text: '', blinkOn: false, active: true
      };
      B.cols = B.w - 2 - B.pad * 2;
      B.lines = Math.max(1, Math.floor((B.h - 2 - 2) / B.pitch) + 1);
      B.tx = B.x + 1 + B.pad; B.ty = B.y + 1;
      function innerRect() { return [B.x + 1, B.y + 1, B.w - 2, B.h - 2]; }
      function cap() {
        var r = innerRect();
        return pool.length - heldOutside(nt, r[0], r[1], r[2], r[3]);
      }
      function drawPlate(name) {
        // 名牌：左上角疊在框上（第 y-3 ~ y 列）；先擦掉舊名牌
        if (B.plateW) {
          qClear(nt, B.x + 1, B.y - 3, B.plateW, 3, true);
          var c;
          for (c = B.x + 1; c < B.x + 1 + B.plateW; c++) qTile(nt, c, B.y, TI.H);
          B.plateW = 0;
        }
        B.name = name || null;
        if (!name || B.y < 3) return;
        var pw = measure(name) + 4, px = B.x + 1, cc;
        qTile(nt, px, B.y - 3, TI.TL); for (cc = px + 1; cc < px + pw - 1; cc++) qTile(nt, cc, B.y - 3, TI.H); qTile(nt, px + pw - 1, B.y - 3, TI.TR);
        qTile(nt, px, B.y - 2, TI.V); qTile(nt, px, B.y - 1, TI.V); qTile(nt, px + pw - 1, B.y - 2, TI.V); qTile(nt, px + pw - 1, B.y - 1, TI.V);
        qClear(nt, px + 1, B.y - 2, pw - 2, 2, false);
        qLine(nt, px + 2, B.y - 2, name, B.nameSty);
        qTile(nt, px, B.y, TI.J); qTile(nt, px + pw - 1, B.y, TI.J);
        B.plateW = pw;
      }
      function nextTilePos() { return [B.x + B.w - 2, B.y + B.h - 2]; }     // 右下角內側的留白欄（不壓字、不壓框）
      function startPage() {
        // 可用容量可能變了（別的視窗佔了池）→ 剩下的頁重排
        var c = cap(), rest = B.pages.slice(B.page), need = pageTiles(rest[0] || []);
        if (need > c || rest.some(function (p) { return pageTiles(p) > c; })) {
          var lines = [], k;
          for (k = 0; k < rest.length; k++) lines = lines.concat(rest[k]);
          var re = paginate(lines.join('\n'), B.cols, B.lines, Math.max(4, c));
          B.pages = B.pages.slice(0, B.page).concat(re);
        }
        B.phase = 'clear'; B.line = 0; B.pos = 0; B.wait = 0; B.rush = false; B.emitted = false;
        var r = innerRect();
        qClear(nt, r[0], r[1], r[2], r[3], false);
        var np = nextTilePos();
        qTile(nt, np[0], np[1], TI.BLANK); B.blinkOn = false;
        push({ t: 'call', fn: function () { if (B.phase === 'clear') B.phase = 'type'; } });
        if (B.onPage) try { B.onPage(B.page, B.pages.length); } catch (e) { }
      }
      // 排下一個字（回傳 false = 本頁打完）
      function emitOne() {
        var lines = B.pages[B.page] || [];
        while (B.line < lines.length && B.pos >= lines[B.line].length) { B.line++; B.pos = 0; }
        if (B.line >= lines.length) { B.emitted = true; return false; }
        var s = lines[B.line], col = B.tx, k;
        for (k = 0; k < B.pos; k++) col += widthOf(s.charAt(k));
        var ch = s.charAt(B.pos++);
        if (widthOf(ch)) qGlyph(nt, col, B.ty + B.line * B.pitch, ch, B.sty);
        B.lastCh = ch;
        return true;
      }
      function emitAll() { while (emitOne()) { } }
      B.say = function (text, so) {
        so = so || {};
        B.text = String(text);
        if (!B.drawn) {
          qFrame(nt, B.x, B.y, B.w, B.h);
          qClear(nt, B.x + 1, B.y + 1, B.w - 2, B.h - 2, true);
          if (B.pal !== undefined) qAttr(nt, B.x, B.y - (so.name || o.name ? 3 : 0), B.w, B.h + (so.name || o.name ? 3 : 0), B.pal);
          B.drawn = true;
        }
        var nm = so.name !== undefined ? so.name : (o.name || null);
        if (nm !== B.name) drawPlate(nm);
        if (so.speed !== undefined) B.speed = so.speed;
        B.onClose = so.onClose || null; B.onPage = so.onPage || null;
        B.pages = paginate(B.text, B.cols, B.lines, Math.max(4, cap()));
        B.page = 0;
        startPage();
        return B;
      };
      B.rushPage = function () { if (B.phase === 'type' || B.phase === 'clear') B.rush = true; };
      B.next = function () {
        if (B.phase === 'type' || B.phase === 'clear') { B.rush = true; return; }
        var np = nextTilePos();
        if (B.phase === 'wait') { B.page++; startPage(); return; }
        if (B.phase === 'end') {
          qTile(nt, np[0], np[1], TI.BLANK);
          B.phase = 'closed';
          if (B.onClose) try { B.onClose(); } catch (e) { }
        }
      };
      B.close = function (co) {      // 擦掉整個框（含名牌）；{erase:false} = 只停
        if (!co || co.erase !== false) {
          if (B.plateW) qClear(nt, B.x + 1, B.y - 3, B.plateW, 3, true);
          qClear(nt, B.x, B.y, B.w, B.h, true);
        }
        B.plateW = 0; B.name = null; B.drawn = false; B.phase = 'idle'; B.pages = [];
      };
      B.update = function () {
        B.t++;
        var np = nextTilePos();
        if (B.input && B.active) {
          if (pressed(BTN.A)) B.next();
        }
        if (B.phase === 'type') {
          if (B.rush) { emitAll(); }
          else if (pending() === 0) {
            if (B.wait > 0) B.wait--;
            else {
              var any = emitOne();
              // 空白不花時間；句末標點停一下
              while (any && B.lastCh && !widthOf(B.lastCh)) any = emitOne();
              if (any) B.wait = B.speed - 1 + (PAUSE_PUNCT.indexOf(B.lastCh) >= 0 ? B.pausePunct : 0);
            }
          }
          // 全部字排完且寫完 → 等玩家
          if (B.emitted && pending() === 0) {
            B.phase = B.page + 1 < B.pages.length ? 'wait' : 'end';
            B.t = 0;
          }
        } else if (B.phase === 'wait' || B.phase === 'end') {
          var on = ((B.t >> 4) & 1) === 0;
          if (on !== B.blinkOn) { qTile(nt, np[0], np[1], on ? (B.phase === 'wait' ? TI.NEXT : TI.END) : TI.BLANK); B.blinkOn = on; }
        }
      };
      B.state = function () {
        return { phase: B.phase, page: B.page, pages: B.pages.length, name: B.name, lines: (B.pages[B.page] || []).slice(),
          cols: B.cols, maxLines: B.lines, x: B.x, y: B.y, w: B.w, h: B.h };
      };
      T.widgets.push(B);
      return B;
    };

    /* ============================================================ 選項選單 menu */
    T.menu = function (o) {
      o = o || {};
      var nt = o.nt === undefined ? T.nt : o.nt, items = (o.items || []).map(String), maxw = 0, i;
      for (i = 0; i < items.length; i++) maxw = Math.max(maxw, measure(items[i]));
      var frame = o.frame !== false;
      var M = {
        kind: 'menu', items: items, x: o.x | 0, y: o.y | 0, frame: frame,
        w: o.w || (maxw + 3 + (frame ? 2 : 0)), h: o.h || (items.length * 2 + (frame ? 2 : 0)),
        sel: o.sel | 0, cancel: o.cancel !== false, choice: null, phase: 'idle', active: true, input: o.input === undefined ? T.input : o.input,
        onMove: o.onMove || null, onChoose: o.onChoose || null, sty: mkStyle(o.style), pal: o.pal, hold: 0, curRow: -1
      };
      var ix = M.x + (frame ? 1 : 0), iy = M.y + (frame ? 1 : 0);
      if (maxw + 3 > M.w - (frame ? 2 : 0)) throw new Error('CT.Text.menu：選項「' + items.join('/') + '」超過寬度 ' + M.w + '（文字不准截斷）');
      if (items.length * 2 > M.h - (frame ? 2 : 0)) throw new Error('CT.Text.menu：選項太多，高度 ' + M.h + ' 放不下 ' + items.length + ' 項');
      if (pageTiles(items) > pool.length) throw new Error('CT.Text.menu：選項用字 ' + pageTiles(items) + ' 磚超過字形池 ' + pool.length);
      function drawCursor() {
        if (M.curRow >= 0) { qTile(nt, ix, M.curRow, TI.BLANK); qTile(nt, ix, M.curRow + 1, TI.BLANK); }
        M.curRow = iy + M.sel * 2;
        qTile(nt, ix, M.curRow, TI.CUR0); qTile(nt, ix, M.curRow + 1, TI.CUR1);
      }
      M.open = function () {
        M.choice = null; M.phase = 'drawing'; M.curRow = -1; M.hold = 0;
        if (frame) qFrame(nt, M.x, M.y, M.w, M.h);
        qClear(nt, ix, iy, M.w - (frame ? 2 : 0), M.h - (frame ? 2 : 0), false);
        if (M.pal !== undefined) qAttr(nt, M.x, M.y, M.w, M.h, M.pal);
        for (var k = 0; k < items.length; k++) qLine(nt, ix + 2, iy + k * 2, items[k], M.sty);
        drawCursor();
        push({ t: 'call', fn: function () { if (M.phase === 'drawing') M.phase = 'open'; } });
        return M;
      };
      M.select = function (k) {
        k = ((k % items.length) + items.length) % items.length;
        if (k === M.sel) return;
        M.sel = k; drawCursor();
        if (M.onMove) try { M.onMove(k); } catch (e) { }
      };
      M.choose = function (k) {
        M.choice = k; M.phase = 'chosen';
        if (M.onChoose) try { M.onChoose(k); } catch (e) { }
      };
      M.close = function (co) {
        if (!co || co.erase !== false) qClear(nt, M.x, M.y, M.w, M.h, true);
        M.phase = 'idle'; M.curRow = -1;
      };
      M.update = function () {
        if (M.phase !== 'open' || !M.input || !M.active) return;
        var d = 0;
        if (pressed(BTN.DOWN)) { d = 1; M.hold = 0; }
        else if (pressed(BTN.UP)) { d = -1; M.hold = 0; }
        else if (held(BTN.DOWN) || held(BTN.UP)) {
          M.hold++;
          if (M.hold >= 12 && (M.hold - 12) % 4 === 0) d = held(BTN.DOWN) ? 1 : -1;     // R7：首延遲 12 幀、之後每 4 幀
        } else M.hold = 0;
        if (d) M.select(M.sel + d);
        if (pressed(BTN.A)) M.choose(M.sel);
        else if (M.cancel && pressed(BTN.B)) M.choose(-1);
      };
      M.state = function () { return { phase: M.phase, sel: M.sel, choice: M.choice, items: items.slice(), x: M.x, y: M.y, w: M.w, h: M.h }; };
      T.widgets.push(M);
      return M;
    };

    /* ============================================================ 捲動文字 scroll */
    T.scroll = function (o) {
      o = o || {};
      var nt = o.nt === undefined ? T.nt : o.nt, frame = o.frame !== false;
      var S = {
        kind: 'scroll', x: o.x | 0, y: o.y | 0, w: o.w || 30, h: o.h || 10, frame: frame, pad: o.pad === undefined ? 1 : o.pad,
        lines: [], top: 0, follow: o.follow !== false, auto: o.auto | 0, t: 0, hold: 0, sty: mkStyle(o.style),
        input: o.input === undefined ? T.input : o.input, active: true, drawn: false, pal: o.pal, shown: []
      };
      var ix = S.x + (frame ? 1 : 0) + S.pad, iy = S.y + (frame ? 1 : 0);
      S.cols = S.w - (frame ? 2 : 0) - S.pad * 2;
      S.rows = Math.floor((S.h - (frame ? 2 : 0)) / 2);
      S.worst = S.rows * Math.floor(S.cols / 2) * 4;        // 可視區全是不同全形字時要的池磚
      if (S.worst > pool.length) throw new Error('CT.Text.scroll：可視區最多要 ' + S.worst + ' 磚，超過字形池 ' + pool.length + '（縮小 w / h 或加大 reserve）');
      function maxTop() { return Math.max(0, S.lines.length - S.rows); }
      function redraw() {
        if (!S.drawn) {
          if (frame) qFrame(nt, S.x, S.y, S.w, S.h);
          qClear(nt, S.x + (frame ? 1 : 0), iy, S.w - (frame ? 2 : 0), S.h - (frame ? 2 : 0), true);
          if (S.pal !== undefined) qAttr(nt, S.x, S.y, S.w, S.h, S.pal);
          S.drawn = true;
        }
        // 只重寫有變的行：先全部擦掉變動行（釋放池）→ 再寫新行
        var k, want = [];
        for (k = 0; k < S.rows; k++) want.push(S.lines[S.top + k] || '');
        for (k = 0; k < S.rows; k++) if (want[k] !== S.shown[k]) qClear(nt, ix, iy + k * 2, S.cols, 2, false);
        for (k = 0; k < S.rows; k++) if (want[k] !== S.shown[k]) qLine(nt, ix, iy + k * 2, want[k], S.sty);
        S.shown = want;
      }
      S.setText = function (text) { S.lines = [].concat.apply([], wrap(text, S.cols)); S.top = 0; S.shown = S.drawn ? S.shown : []; redraw(); return S; };   // 從第一行開始看
      S.push = function (text) { S.lines = S.lines.concat([].concat.apply([], wrap(text, S.cols))); if (S.follow) S.top = maxTop(); redraw(); return S; };
      S.scrollTo = function (t) { t = Math.max(0, Math.min(maxTop(), t | 0)); if (t !== S.top) { S.top = t; redraw(); } };
      S.close = function () { qClear(nt, S.x, S.y, S.w, S.h, true); S.drawn = false; S.shown = []; };
      S.update = function () {
        S.t++;
        if (S.auto && S.t % S.auto === 0 && pending() === 0 && S.top < maxTop()) S.scrollTo(S.top + 1);
        if (!S.input || !S.active) return;
        var d = 0;
        if (pressed(BTN.DOWN)) { d = 1; S.hold = 0; } else if (pressed(BTN.UP)) { d = -1; S.hold = 0; }
        else if (held(BTN.DOWN) || held(BTN.UP)) { S.hold++; if (S.hold >= 12 && (S.hold - 12) % 4 === 0) d = held(BTN.DOWN) ? 1 : -1; }
        else S.hold = 0;
        if (d && pending() === 0) S.scrollTo(S.top + d);
      };
      S.state = function () { return { top: S.top, lines: S.lines.length, rows: S.rows, cols: S.cols, atEnd: S.top >= maxTop(), shown: S.shown.slice() }; };
      T.widgets.push(S);
      return S;
    };

    /* ============================================================ 每幀 */
    T.update = function () {
      for (var k = 0; k < T.widgets.length; k++) { var w = T.widgets[k]; if (w.update) w.update(); }
      pump();
      // 本幀新排的工作也盡量在本幀寫（打字機剛排的字不延遲一幀）
      return T;
    };
    T.remove = function (w) { var k = T.widgets.indexOf(w); if (k >= 0) T.widgets.splice(k, 1); };

    paintFrameTiles();
    return T;
  }

  CT.Text = {
    VERSION: VERSION,
    reserve: reserve, create: create,
    measure: measure, wrap: wrap, paginate: paginate, pageTiles: pageTiles, widthOf: widthOf, tilesOf: tilesOf,
    has: hasGlyph,
    missing: function () { return missingAll.slice(); },
    FRAME_NAMES: FRAME_NAMES, TILE_BYTES: TILE_BYTES, ASCII_DY: ASCII_DY
  };
})();
