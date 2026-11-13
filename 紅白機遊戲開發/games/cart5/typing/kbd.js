/*
 * games/cart5/typing/kbd.js — 卡帶五英文字遊戲共用：8×8 英文字型 + 畫面 QWERTY 鍵盤 + 實體鍵盤直打（`CT.Typing.Kbd`）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：engine/chr.js（大寫 / 數字 / 標點沿用原創 DEMO.FONT；小寫 26 字本檔手繪）
 * 使用者：typing（星塵打字）、words（星塵字謎）。
 *
 * 畫面鍵盤（背景名稱表）：
 *   一顆鍵 = 1 個「鍵面磁磚」（色 1 鍵面 + 色 3 字），框線 / 鍵面外擴 1 px 畫在鄰格（由版面程式化切出、去重）；
 *   鍵距 2 磚，上下兩排錯開 1 磚 = QWERTY 的半鍵錯位。鍵盤區所有調色盤**共用色 1（鍵面）/ 色 2（框）**，
 *   只換色 3 ⇒ 每顆鍵所在的 16×16 屬性區塊可以獨立換字色（字謎標示「不在字裡 / 在字裡」），框線不會跟著變色。
 * 游標：十字鍵一格一格（剛按下立刻走；按住首延遲 12 幀、之後每 4 幀），左右在同一排繞回、上下到最近的鍵。
 * 實體鍵盤（桌機加速，不影響手把路徑）：遊戲進入「打字狀態」時 `Phys.setActive(true)`：
 *   - 收字：a-z（Shift = 大寫）、空白、, . '、Backspace、Enter、Esc（= 暫停）。
 *   - 暫時把 input.js 預設對應的 W A S D Z X / Enter / Shift 從手把移除（`NES.Input.remap`，只在這些鍵都放開時才套用，
 *     避免「按著鍵時改對應 ⇒ 放開收不到」卡鍵）；離開打字狀態 / exit 立刻還原。方向鍵照常移游標。
 *   - 打字狀態下 C 是字母不是密技（攔下 registry 的 C 鍵密技；密技改由 ★ 或「暫停畫面按 C」）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var TY = CT.Typing = CT.Typing || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 字型 ============================== */
  var LOWER = {
    a: ['........', '........', '..333...', '.....3..', '..3333..', '.3...3..', '..3333..', '........'],
    b: ['.3......', '.3......', '.3333...', '.3...3..', '.3...3..', '.3...3..', '.3333...', '........'],
    c: ['........', '........', '..3333..', '.3......', '.3......', '.3......', '..3333..', '........'],
    d: ['.....3..', '.....3..', '..3333..', '.3...3..', '.3...3..', '.3...3..', '..3333..', '........'],
    e: ['........', '........', '..333...', '.3...3..', '.33333..', '.3......', '..3333..', '........'],
    f: ['...33...', '..3.....', '..3.....', '.3333...', '..3.....', '..3.....', '..3.....', '........'],
    g: ['........', '........', '..3333..', '.3...3..', '.3...3..', '..3333..', '.....3..', '..333...'],
    h: ['.3......', '.3......', '.3333...', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '........'],
    i: ['...3....', '........', '..33....', '...3....', '...3....', '...3....', '..333...', '........'],
    j: ['....3...', '........', '...33...', '....3...', '....3...', '....3...', '.3..3...', '..33....'],
    k: ['.3......', '.3......', '.3..3...', '.3.3....', '.33.....', '.3.3....', '.3..3...', '........'],
    l: ['..33....', '...3....', '...3....', '...3....', '...3....', '...3....', '..333...', '........'],
    m: ['........', '........', '.33.3...', '.3.3.3..', '.3.3.3..', '.3.3.3..', '.3...3..', '........'],
    n: ['........', '........', '.3333...', '.3...3..', '.3...3..', '.3...3..', '.3...3..', '........'],
    o: ['........', '........', '..333...', '.3...3..', '.3...3..', '.3...3..', '..333...', '........'],
    p: ['........', '........', '.3333...', '.3...3..', '.3...3..', '.3333...', '.3......', '.3......'],
    q: ['........', '........', '..3333..', '.3...3..', '.3...3..', '..3333..', '.....3..', '.....3..'],
    r: ['........', '........', '.3.333..', '.33.....', '.3......', '.3......', '.3......', '........'],
    s: ['........', '........', '..3333..', '.3......', '..333...', '.....3..', '.3333...', '........'],
    t: ['..3.....', '..3.....', '.3333...', '..3.....', '..3.....', '..3..3..', '...33...', '........'],
    u: ['........', '........', '.3...3..', '.3...3..', '.3...3..', '.3..33..', '..33.3..', '........'],
    v: ['........', '........', '.3...3..', '.3...3..', '.3...3..', '..3.3...', '...3....', '........'],
    w: ['........', '........', '.3...3..', '.3...3..', '.3.3.3..', '.3.3.3..', '..3.3...', '........'],
    x: ['........', '........', '.3...3..', '..3.3...', '...3....', '..3.3...', '.3...3..', '........'],
    y: ['........', '........', '.3...3..', '.3...3..', '.3...3..', '..3333..', '.....3..', '..333...'],
    z: ['........', '........', '.33333..', '....3...', '...3....', '..3.....', '.33333..', '........']
  };
  // 鍵盤特殊鍵的標籤圖（本檔原創）
  var EXTRA = {
    '<': ['........', '...3....', '..3.....', '.333333.', '..3.....', '...3....', '........', '........'],   // 退格箭頭
    '#': ['...3....', '..333...', '.3.3.3..', '...3....', '...3....', '...3....', '...3....', '........'],   // 上箭頭（大小寫）
    '_': ['........', '........', '........', '........', '........', '.3....3.', '.333333.', '........'],   // 空白鍵符號
    '~': ['........', '......3.', '......3.', '..3...3.', '.333333.', '..3.....', '........', '........'],   // Enter 折返箭頭
    '$': ['...3....', '..333...', '.33333..', '..333...', '.33.33..', '........', '........', '........'],   // 星（★）
    '^': ['........', '.33.33..', '.33333..', '.33333..', '..333...', '...3....', '........', '........'],   // 心
    '@': ['..333...', '.3...3..', '.3.3.3..', '.3...3..', '..333...', '........', '........', '........'],   // 環（◎）
    '`': ['........', '........', '........', '..33....', '..33....', '........', '........', '........']    // 小點（·）
  };
  var PRINTABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:-!?\'/()+=*>%' + '<#_~$^@`';

  function glyph(ch) {
    if (LOWER[ch]) return LOWER[ch];
    if (EXTRA[ch]) return EXTRA[ch];
    var FONT = (NES.CHR && NES.CHR.DEMO && NES.CHR.DEMO.FONT) || {};
    var MAP = (NES.CHR && NES.CHR.DEMO && NES.CHR.DEMO.CHARMAP) || {};
    var n = MAP[ch];
    return (n && FONT[n]) || null;
  }
  // 字形 → 磁磚：fg = 字色索引、bg = 底色索引（0 = 透明 / 底色）
  function glyphTile(ch, fg, bg) {
    var t = new Uint8Array(64), g = glyph(ch), x, y;
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) t[y * 8 + x] = (g && g[y].charAt(x) !== '.') ? fg : (bg || 0);
    return t;
  }
  function code(ch) { return 'G' + ch.charCodeAt(0); }

  /* ============================== 版面 ============================== */
  // spec = { rows: [{ r, c0, keys: 'qwertyuiop' }, ...], specials: [{ id, label, r, c, w }] }；字母鍵 id = 小寫字母
  function create(spec) {
    var keys = [], rows = [], rowR = [], i, j;
    spec.rows.forEach(function (row, ri) {
      rowR.push(row.r);
      var list = [];
      for (j = 0; j < row.keys.length; j++) {
        var ch = row.keys.charAt(j);
        list.push({ id: ch, ch: ch, r: row.r, c: row.c0 + 2 * j, w: 1, label: ch, row: ri });
      }
      rows.push(list);
    });
    (spec.specials || []).forEach(function (s) {
      var ri = rowR.indexOf(s.r);
      if (ri < 0) { ri = rows.length; rows.push([]); rowR.push(s.r); }
      rows[ri].push({ id: s.id, ch: null, r: s.r, c: s.c, w: s.w, label: s.label, row: ri });
    });
    rows.forEach(function (list, ri) {
      list.sort(function (a, b) { return a.c - b.c; });
      list.forEach(function (k, ci) { k.row = ri; k.col = ci; keys.push(k); });
    });
    var byId = {};
    keys.forEach(function (k) { byId[k.id] = k; });
    function cx(k) { return k.c * 2 + k.w; }        // 中心 ×2（避免小數）
    function move(k, dir) {
      var list = rows[k.row], n;
      if (dir === BTN.LEFT) return list[(k.col + list.length - 1) % list.length];
      if (dir === BTN.RIGHT) return list[(k.col + 1) % list.length];
      if (dir === BTN.UP || dir === BTN.DOWN) {
        var rr = (k.row + (dir === BTN.UP ? rows.length - 1 : 1)) % rows.length, best = null, bd = 1e9;
        for (n = 0; n < rows[rr].length; n++) {
          var o = rows[rr][n], d = Math.abs(cx(o) - cx(k));
          if (d < bd || (d === bd && o.c < best.c)) { bd = d; best = o; }
        }
        return best;
      }
      return k;
    }
    // 機器人 / 提示：從 a 鍵到 b 鍵最少步數的方向序列（BFS）
    function path(aId, bId) {
      var a = byId[aId], b = byId[bId];
      if (!a || !b) return [];
      if (a === b) return [];
      var prev = {}, q = [a], seen = {}, dirs = [BTN.LEFT, BTN.RIGHT, BTN.UP, BTN.DOWN];
      seen[a.id] = 1;
      while (q.length) {
        var k = q.shift();
        for (var d = 0; d < 4; d++) {
          var m = move(k, dirs[d]);
          if (seen[m.id]) continue;
          seen[m.id] = 1; prev[m.id] = { from: k.id, dir: dirs[d] };
          if (m === b) { var out = [], id = b.id; while (id !== a.id) { out.unshift(prev[id].dir); id = prev[id].from; } return out; }
          q.push(m);
        }
      }
      return [];
    }

    // 框線 / 外擴：畫在 256×240 的像素表上，再切出「不是鍵面」的每一格
    var faces = {};
    keys.forEach(function (k) { for (var t = 0; t < k.w; t++) faces[(k.c + t) + ',' + k.r] = { key: k, idx: t }; });
    var px = [];
    for (i = 0; i < 240; i++) { px.push(new Uint8Array(256)); }
    function dot(x, y, v) { if (x >= 0 && x < 256 && y >= 0 && y < 240) px[y][x] = v; }
    var rmin = 99, rmax = 0, cmin = 99, cmax = 0;
    keys.forEach(function (k) {
      var x0 = k.c * 8, x1 = (k.c + k.w) * 8, y0 = k.r * 8, y1 = y0 + 8, x, y;
      for (y = y0 - 1; y < y1; y++) dot(x0 - 1, y, 1);
      for (x = x0 - 1; x < x1; x++) dot(x, y0 - 1, 1);
      for (y = y0 - 2; y <= y1; y++) { dot(x0 - 2, y, 2); dot(x1, y, 2); }
      for (x = x0 - 2; x <= x1; x++) { dot(x, y0 - 2, 2); dot(x, y1, 2); }
      rmin = Math.min(rmin, k.r - 1); rmax = Math.max(rmax, k.r + 1);
      cmin = Math.min(cmin, k.c - 1); cmax = Math.max(cmax, k.c + k.w);
    });
    var edges = [], edgeTiles = {}, seenT = {}, en = 0, r, c;
    for (r = rmin; r <= rmax; r++) for (c = cmin; c <= cmax; c++) {
      if (faces[c + ',' + r]) continue;
      var t = new Uint8Array(64), any = 0, x2, y2;
      for (y2 = 0; y2 < 8; y2++) for (x2 = 0; x2 < 8; x2++) { t[y2 * 8 + x2] = px[r * 8 + y2][c * 8 + x2]; any |= t[y2 * 8 + x2]; }
      if (!any) continue;
      var key = Array.prototype.join.call(t, '');
      if (!seenT[key]) { seenT[key] = 'KE' + (en++); edgeTiles[seenT[key]] = t; }
      edges.push({ c: c, r: r, name: seenT[key] });
    }
    // 每顆鍵各格要顯示的字（多格鍵：標籤置中）
    function labelAt(k, idx, upper) {
      if (k.ch) { var ch = k.ch; if (upper && ch >= 'a' && ch <= 'z') ch = ch.toUpperCase(); return idx === 0 ? ch : ' '; }
      var L = k.label || '', off = Math.floor((k.w - L.length) / 2), p = idx - off;
      return (p >= 0 && p < L.length) ? L.charAt(p) : ' ';
    }
    var K = {
      spec: spec, keys: keys, rows: rows, byId: byId, edges: edges, edgeTiles: edgeTiles,
      rmin: rmin, rmax: rmax, cmin: cmin, cmax: cmax,
      move: move, path: path, labelAt: labelAt,
      // 所有鍵面要用到的字（大小寫兩種都收）
      faceChars: function () {
        var s = { ' ': 1 };
        keys.forEach(function (k) {
          for (var t = 0; t < k.w; t++) { s[labelAt(k, t, false)] = 1; s[labelAt(k, t, true)] = 1; }
        });
        return Object.keys(s);
      },
      // 寫整個鍵盤：put(c, r, tile)；faceTile(ch) → 磁磚；upper = 目前大寫
      paint: function (put, faceTile, edgeTile, upper) {
        edges.forEach(function (e) { put(e.c, e.r, edgeTile(e.name)); });
        K.paintFaces(put, faceTile, upper);
      },
      paintFaces: function (put, faceTile, upper) {
        keys.forEach(function (k) { for (var t = 0; t < k.w; t++) put(k.c + t, k.r, faceTile(labelAt(k, t, upper))); });
      },
      // 游標四角的精靈座標（左上 / 右上 / 左下 / 右下）
      corners: function (k) {
        var x0 = k.c * 8 - 4, x1 = (k.c + k.w) * 8 - 5, y0 = k.r * 8 - 4, y1 = k.r * 8 + 3;
        return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
      }
    };
    return K;
  }

  /* ============================== 游標連發（一格一格） ============================== */
  var REP_FIRST = 12, REP_NEXT = 4;
  function Repeat() { this.dir = 0; this.t = 0; }
  Repeat.prototype.step = function () {
    var I = NES.Input, dirs = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT], k;
    for (k = 0; k < 4; k++) if (I.pressed(dirs[k])) { this.dir = dirs[k]; this.t = 0; return dirs[k]; }
    if (this.dir && I.held(this.dir)) {
      this.t++;
      if (this.t >= REP_FIRST && ((this.t - REP_FIRST) % REP_NEXT) === 0) return this.dir;
      return 0;
    }
    this.dir = 0; this.t = 0;
    return 0;
  };
  Repeat.prototype.reset = function () { this.dir = 0; this.t = 0; };

  /* ============================== 實體鍵盤 ============================== */
  var REMAP_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];
  var REMAP_BITS = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT | BTN.A | BTN.B | BTN.START | BTN.SELECT;
  var Phys = {
    active: false, owner: null, queue: [], remapped: false, saved: null, wantRemap: false, used: 0, installed: false,
    install: function () {
      if (Phys.installed || !window.addEventListener) return;
      Phys.installed = true;
      window.addEventListener('keydown', onKey, true);
    },
    // owner = 遊戲 id；只在 CT.current 是那款時收字
    setActive: function (on, owner) {
      Phys.install();
      on = !!on;
      if (owner) Phys.owner = owner;
      if (on === Phys.active) return;
      Phys.active = on;
      Phys.queue.length = 0;
      if (on) Phys.wantRemap = true;
      else { Phys.wantRemap = false; Phys.restore(); }
    },
    // 每幀呼叫：等相關鍵都放開才改對應（避免卡鍵）
    tick: function () {
      var I = NES.Input;
      if (!Phys.active || Phys.remapped || !Phys.wantRemap || !I || !I.remap) return;
      var live = I.liveMask ? I.liveMask() : 0;
      if (live & REMAP_BITS) return;
      var km = I.keymap ? I.keymap() : {}, obj = {};
      Phys.saved = {};
      REMAP_KEYS.forEach(function (k) { Phys.saved[k] = km[k]; obj[k] = 0; });
      I.remap(obj);
      Phys.remapped = true;
    },
    restore: function () {
      var I = NES.Input;
      if (!Phys.remapped || !I || !I.remap) { Phys.remapped = false; return; }
      var obj = {};
      REMAP_KEYS.forEach(function (k) { obj[k] = Phys.saved && Phys.saved[k] !== undefined ? Phys.saved[k] : (I.DEFAULT_MAP && I.DEFAULT_MAP[k]); });
      I.remap(obj);
      Phys.remapped = false; Phys.saved = null;
    },
    drain: function () { var q = Phys.queue.slice(); Phys.queue.length = 0; return q; }
  };
  function onKey(e) {
    if (!e || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!CT.current || CT.current.id !== Phys.owner) return;
    if (!Phys.active) {                      // 暫停中：只收 Esc（= 解除暫停）
      if (e.key === 'Escape' && !e.repeat && Phys.queue.length < 32) Phys.queue.push('\x1b');
      return;
    }
    var k = e.key, out = null;
    if (typeof k !== 'string') return;
    if (k.length === 1 && /[A-Za-z]/.test(k)) out = k;
    else if (k === ' ' || k === ',' || k === '.' || k === "'") out = k;
    else if (k === 'Backspace') out = '\b';
    else if (k === 'Enter') out = '\n';
    else if (k === 'Escape') out = '\x1b';
    if (out === null) return;
    if (e.code === 'KeyC') { if (e.stopPropagation) e.stopPropagation(); }   // C = 字母，不是密技
    if (e.preventDefault) e.preventDefault();
    if (e.repeat && (out === '\n' || out === '\x1b')) return;
    if (Phys.queue.length < 32) Phys.queue.push(out);
    Phys.used++;
  }

  /* ============================== 機器人人類節奏：方向 / A 都是「按 4 幀放 4 幀」 ============================== */
  // tapper.next(mask) → 這一幀要送出的遮罩；busy() = 還在按 / 放的週期中
  function Tapper(on, off) { this.on = on || 4; this.off = off || 4; this.t = 0; this.m = 0; }
  Tapper.prototype.busy = function () { return this.t > 0; };
  Tapper.prototype.tick = function () {
    if (this.t <= 0) return 0;
    this.t--;
    return this.t >= this.off ? this.m : 0;
  };
  Tapper.prototype.tap = function (m) { this.m = m; this.t = this.on + this.off; };

  /* ============================== 影子名稱表 + 屬性 + 差異佇列（每幀 ≤ limit byte） ============================== */
  function Shadow(limit) {
    var want = new Uint8Array(960 + 240), have = new Uint8Array(960 + 240), dirty = new Uint8Array(960 + 240);
    var queue = [], qi = 0, S = { writes: 0, peak: 0, limit: limit || 140, nes: null, overflow: 0 };
    S.put = function (c, r, t) {
      if (c < 0 || c > 31 || r < 0 || r > 29) return;
      var i = r * 32 + c;
      want[i] = t;
      if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
    };
    S.get = function (c, r) { return want[r * 32 + c]; };
    S.putA = function (bx, by, p) {
      if (bx < 0 || bx > 15 || by < 0 || by > 14) return;
      var i = 960 + by * 16 + bx;
      want[i] = p;
      if (have[i] !== p && !dirty[i]) { dirty[i] = 1; queue.push(i); }
    };
    // 文字超出 32 欄 = 程式錯（qa-r7 P3-4「文字截斷」）：console.error 讓測試抓得到
    S.text = function (c, r, s, tileOf) {
      s = String(s);
      if (c + s.length > 32) { try { console.error('text overflow: "' + s + '" @' + c + ',' + r); } catch (e) { } }
      for (var i = 0; i < s.length; i++) S.put(c + i, r, tileOf(s.charAt(i)));
    };
    S.flush = function (ppu, unlimited) {
      var nes = S.nes, bud = nes && nes.timing && nes.timing.budget;
      var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
      while (qi < queue.length) {
        if (!unlimited && base + n >= S.limit) break;
        var i = queue[qi++];
        dirty[i] = 0;
        if (want[i] !== have[i]) {
          if (i < 960) ppu.setTile(0, i & 31, i >> 5, want[i]);
          else ppu.setAttr(0, (i - 960) & 15, (i - 960) >> 4, want[i]);
          have[i] = want[i]; n++;
        }
      }
      if (qi >= queue.length) { queue.length = 0; qi = 0; }
      S.writes = n; if (!unlimited && n > S.peak) S.peak = n;
      return n;
    };
    S.reset = function () { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; };
    S.pending = function () { return queue.length - qi; };
    return S;
  }

  TY.Kbd = {
    create: create, glyph: glyph, glyphTile: glyphTile, code: code, LOWER: LOWER, EXTRA: EXTRA, PRINTABLE: PRINTABLE,
    Shadow: Shadow, Repeat: Repeat, REP_FIRST: REP_FIRST, REP_NEXT: REP_NEXT, Phys: Phys, Tapper: Tapper,
    // 游標四角精靈圖（色 3 外框 / 色 2 內線）
    CORNERS: {
      CTL: ['3333....', '3222....', '32......', '32......', '........', '........', '........', '........'],
      CTR: ['....3333', '....2223', '......23', '......23', '........', '........', '........', '........'],
      CBL: ['........', '........', '........', '........', '32......', '32......', '3222....', '3333....'],
      CBR: ['........', '........', '........', '........', '......23', '......23', '....2223', '....3333']
    }
  };
})();
