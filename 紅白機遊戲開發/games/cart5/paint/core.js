/*
 * games/cart5/paint/core.js — 《星塵畫室》核心：畫布模型 / 點陣繪圖 / 動態 CHR 顯示 / 存檔碼 / 評分 / 形狀分類
 * ---------------------------------------------------------------------------
 * 擁有者：C9-1 cart5-paint（R9）｜ 依賴：engine/ppu.js、engine/chr.js、paint/art.js
 *
 * 1) Model：128×128 個「色碼」（Uint8Array 16384）：0 = 紙（= 底色 $3F00），1..12 = 第 g 組第 i 色（碼 = 1 + g×3 + (i−1)）。
 *    模型永遠保存「玩家真正選的顏色」；顯示時才受 NES 屬性限制（見 3）。復原 / 重做各 ≥ 24 步（整張快照）。
 * 2) 繪圖原語（全部整數、Bresenham）：brush / line / rect / box / ellipse（外框 = 取樣點連線、實心 = 逐列區間）/ flood（4 連通）/ poly。
 * 3) Disp：畫布走背景名稱表 + **動態 CHR（像 CHR-RAM）**。每個 8×8 格的內容（只看色號 0..3）算成 key，
 *    依內容去重配置圖樣表磁磚（參考計數；同內容共用；只有自己用的磁磚直接原地改寫）。
 *    每格更新最多花 16（磁磚 16 byte）+ 1（名稱表）byte，**磁磚上傳以 budget.use(16) 計入 VBlank 預算**；
 *    每幀處理到預算剩不到 17 byte 就停，其餘下一幀繼續 ⇒ 大範圍填色 / 復原 / 清除會分幀完成（pending / progress 給 HUD 畫進度條）。
 *    屬性（16×16 區）＝區內非紙像素「最多的那一組」（色 1 / 2 優先，只有線條色 3 時才看色 3）；其他組的像素以同色號顯示（NES 色彩衝突）。
 *    池子用完時退而求其次：找內容最接近的現有磁磚（Hamming 距離）暫代，該格記在 approx，有空位時自動重排。
 * 4) 存檔碼 / 分享碼：'SP1' + base64url( 調色盤 13 byte + RLE(碼, 長度−1) + CRC16 )。
 * 5) 臨摹評分：32×32 格（4×4 px）墨跡遮罩 F1（容許 1 格偏差）70% + 顏色吻合 30%。
 * 6) 快畫猜猜：極座標輪廓 r(θ) 的 DFT 諧波（k = 2..5）+ 主軸細長比 + 中心有無墨 ⇒ LINE / CIRCLE / TRIANGLE / SQUARE / STAR / CROSS。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var P = CT.Paint = CT.Paint || {};

  var W = 128, H = 128, N = W * H, UNDO_MAX = 24;
  function idxOf(code) { return code ? ((code - 1) % 3) + 1 : 0; }
  function grpOf(code) { return code ? ((code - 1) / 3) | 0 : -1; }
  function codeOf(g, i) { return i ? 1 + g * 3 + (i - 1) : 0; }

  /* ================================================================ Model */
  function Model() {
    this.pix = new Uint8Array(N);
    this.onDirty = null;       // (cell 0..255) → void
    this.undoS = []; this.redoS = [];
  }
  Model.prototype.get = function (x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? -1 : this.pix[y * W + x]; };
  Model.prototype.set = function (x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var k = y * W + x;
    if (this.pix[k] === c) return;
    this.pix[k] = c;
    if (this.onDirty) this.onDirty(((y >> 3) << 4) | (x >> 3));
  };
  Model.prototype.load = function (src) {
    for (var k = 0; k < N; k++) if (this.pix[k] !== src[k]) { this.pix[k] = src[k]; if (this.onDirty) this.onDirty((((k >> 7) >> 3) << 4) | ((k & 127) >> 3)); }
  };
  Model.prototype.clear = function (c) { var a = new Uint8Array(N); if (c) a.fill(c); this.load(a); };
  // 復原：動作前呼叫 push()
  Model.prototype.push = function () {
    this.undoS.push(new Uint8Array(this.pix));
    if (this.undoS.length > UNDO_MAX) this.undoS.shift();
    this.redoS.length = 0;
  };
  Model.prototype.undo = function () {
    if (!this.undoS.length) return false;
    this.redoS.push(new Uint8Array(this.pix));
    this.load(this.undoS.pop());
    return true;
  };
  Model.prototype.redo = function () {
    if (!this.redoS.length) return false;
    this.undoS.push(new Uint8Array(this.pix));
    this.load(this.redoS.pop());
    return true;
  };
  Model.prototype.resetHistory = function () { this.undoS.length = 0; this.redoS.length = 0; };

  /* ---------------- 繪圖原語 ---------------- */
  Model.prototype.brush = function (x, y, c, size) {
    size = size || 1;
    var o = (size - 1) >> 1;
    for (var dy = 0; dy < size; dy++) for (var dx = 0; dx < size; dx++) this.set(x - o + dx, y - o + dy, c);
  };
  Model.prototype.line = function (x0, y0, x1, y1, c, size) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, guard = 0;
    for (;;) {
      this.brush(x0, y0, c, size);
      if ((x0 === x1 && y0 === y1) || ++guard > 1024) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  Model.prototype.rect = function (x0, y0, x1, y1, c, size) {
    this.line(x0, y0, x1, y0, c, size); this.line(x1, y0, x1, y1, c, size);
    this.line(x1, y1, x0, y1, c, size); this.line(x0, y1, x0, y0, c, size);
  };
  Model.prototype.box = function (x0, y0, x1, y1, c) {
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) this.set(x, y, c);
  };
  // 橢圓：外接框 (x0,y0)-(x1,y1)（含端點）
  function ellPts(x0, y0, x1, y1) {
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    var cx = (xa + xb) / 2, cy = (ya + yb) / 2, rx = (xb - xa) / 2, ry = (yb - ya) / 2;
    var n = Math.max(16, Math.ceil((rx + ry) * 3.2)), pts = [];
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n;
      pts.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))]);
    }
    return pts;
  }
  Model.prototype.ellipse = function (x0, y0, x1, y1, c, size) {
    var p = ellPts(x0, y0, x1, y1);
    for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; this.line(p[i][0], p[i][1], q[0], q[1], c, size); }
  };
  Model.prototype.disc = function (x0, y0, x1, y1, c) {
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    var cx = (xa + xb) / 2, cy = (ya + yb) / 2, rx = (xb - xa) / 2 + 0.5, ry = (yb - ya) / 2 + 0.5;
    for (var y = ya; y <= yb; y++) {
      var t = (y - cy) / ry, w = rx * Math.sqrt(Math.max(0, 1 - t * t));
      for (var x = Math.ceil(cx - w - 0.0001); x <= Math.floor(cx + w + 0.0001); x++) this.set(x, y, c);
    }
    this.ellipse(x0, y0, x1, y1, c, 1);
  };
  Model.prototype.circle = function (cx, cy, r, c, size) { this.ellipse(cx - r, cy - r, cx + r, cy + r, c, size); };
  Model.prototype.fcircle = function (cx, cy, r, c) { this.disc(cx - r, cy - r, cx + r, cy + r, c); };
  Model.prototype.poly = function (pts, c, size) {
    for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; this.line(pts[i][0], pts[i][1], q[0], q[1], c, size); }
  };
  Model.prototype.fpoly = function (pts, c) {
    var ya = 1e9, yb = -1e9, i;
    for (i = 0; i < pts.length; i++) { ya = Math.min(ya, pts[i][1]); yb = Math.max(yb, pts[i][1]); }
    for (var y = Math.max(0, ya); y <= Math.min(H - 1, yb); y++) {
      var xs = [], yc = y + 0.5;
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (i = 0; i + 1 < xs.length; i += 2) for (var x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, c);
    }
    this.poly(pts, c, 1);
  };
  // 4 連通填色；回傳填了幾點（同色 / 出界 = 0）
  Model.prototype.flood = function (x, y, c) {
    var src = this.get(x, y);
    if (src < 0 || src === c) return 0;
    var stack = [y * W + x], n = 0, pix = this.pix, seen = new Uint8Array(N);
    seen[y * W + x] = 1;
    while (stack.length) {
      var k = stack.pop(), px = k & 127, py = k >> 7;
      this.set(px, py, c); n++;
      if (px > 0 && !seen[k - 1] && pix[k - 1] === src) { seen[k - 1] = 1; stack.push(k - 1); }
      if (px < W - 1 && !seen[k + 1] && pix[k + 1] === src) { seen[k + 1] = 1; stack.push(k + 1); }
      if (py > 0 && !seen[k - W] && pix[k - W] === src) { seen[k - W] = 1; stack.push(k - W); }
      if (py < H - 1 && !seen[k + W] && pix[k + W] === src) { seen[k + W] = 1; stack.push(k + W); }
    }
    return n;
  };

  /* ================================================================ Disp：動態 CHR 顯示 */
  // surf = { col, row, cw, ch, cell(i, out64), block(b) → 組別 | -1（保持）, bw, bh }
  function Disp(nes, info) {
    this.nes = nes; this.info = info; this.bank = info.bank; this.U = info.U;
    this.refc = new Int32Array(256); this.skey = new Array(256); this.map = {};
    this.free = [];
    this.surfs = [];
    this.tmp = new Uint8Array(64);
    this.uploads = 0; this.cellsDone = 0; this.batch = 0; this.batchDone = 0;
    this.approx = {}; this.approxN = 0;
    var i;
    for (i = 0; i < 256; i++) {
      var t = this.bank.tiles[i];
      if (i < this.U) { this.refc[i] = 1 << 28; var k = keyOf(t); this.skey[i] = k; if (this.map[k] === undefined) this.map[k] = i; }
      else { t.fill(0); this.skey[i] = null; }
    }
    for (i = 255; i >= this.U; i--) this.free.push(i);
  }
  function keyOf(t) {
    var s = '';
    for (var i = 0; i < 64; i += 4) s += String.fromCharCode(48 + (t[i] | (t[i + 1] << 2) | (t[i + 2] << 4) | (t[i + 3] << 6)));
    return s;
  }
  Disp.keyOf = keyOf;
  Disp.prototype.addSurface = function (s) {
    var n = s.cw * s.ch;
    s.cur = new Int16Array(n);         // 目前顯示的磁磚（init 時全 0 = 實心紙）
    s.dirty = new Uint8Array(n); s.q = [];
    s.bdirty = new Uint8Array(s.bw * s.bh); s.bq = []; s.attr = new Int8Array(s.bw * s.bh).fill(-1);
    this.surfs.push(s);
    return s;
  };
  Disp.prototype.mark = function (s, cell) {
    if (!s.dirty[cell]) { s.dirty[cell] = 1; s.q.push(cell); this.batch++; }
    var cx = cell % s.cw, cy = (cell / s.cw) | 0, b = (cy >> 1) * s.bw + (cx >> 1);
    if (!s.bdirty[b]) { s.bdirty[b] = 1; s.bq.push(b); }
  };
  Disp.prototype.markAll = function (s) { for (var i = 0; i < s.cw * s.ch; i++) this.mark(s, i); };
  Disp.prototype.pending = function () { var n = 0; for (var i = 0; i < this.surfs.length; i++) n += this.surfs[i].q.length + this.surfs[i].bq.length; return n; };
  Disp.prototype.progress = function () {
    var p = 0; for (var i = 0; i < this.surfs.length; i++) p += this.surfs[i].q.length;
    if (!p) { this.batch = 0; this.batchDone = 0; return 1; }
    return Math.min(1, this.batchDone / Math.max(1, this.batch));
  };
  Disp.prototype.used = function () { return 256 - this.U - this.free.length; };
  Disp.prototype.capacity = function () { return 256 - this.U; };
  Disp.prototype.decref = function (t) {
    if (t < this.U) return;
    if (--this.refc[t] > 0) return;
    this.refc[t] = 0;
    if (this.map[this.skey[t]] === t) delete this.map[this.skey[t]];
    this.skey[t] = null;
    this.free.push(t);
    // 有格子在暫代（池滿時）→ 重排一格
    for (var k in this.approx) {
      var a = this.approx[k]; delete this.approx[k]; this.approxN--;
      this.mark(this.surfs[a[0]], a[1]);
      break;
    }
  };
  Disp.prototype.nearest = function (t) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < 256; i++) {
      if (i >= this.U && !this.refc[i]) continue;
      var u = this.bank.tiles[i], d = 0;
      for (var j = 0; j < 64 && d < bd; j++) if (u[j] !== t[j]) d++;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  function bud(nes) { return nes && nes.timing && nes.timing.budget; }
  // 處理一格；回傳實際花的 byte
  Disp.prototype.doCell = function (si, s, cell) {
    var ppu = this.nes.ppu, t = this.tmp, B = bud(this.nes);
    s.cell(cell, t);
    var key = keyOf(t), cur = s.cur[cell], col = s.col + (cell % s.cw), row = s.row + ((cell / s.cw) | 0), cost = 0;
    var ak = si + ':' + cell;
    if (this.approx[ak]) { delete this.approx[ak]; this.approxN--; }
    if (this.skey[cur] === key) return 0;
    var hit = this.map[key];
    if (hit !== undefined) {
      if (hit >= this.U) this.refc[hit]++;
      ppu.setTile(0, col, row, hit); cost = 1;
      s.cur[cell] = hit; this.decref(cur);
      return cost;
    }
    if (cur >= this.U && this.refc[cur] === 1) {
      if (this.map[this.skey[cur]] === cur) delete this.map[this.skey[cur]];
      this.bank.tiles[cur].set(t); this.skey[cur] = key; this.map[key] = cur;
      if (B) B.use(16); this.uploads++;
      return 16;
    }
    var slot = this.free.length ? this.free.pop() : -1;
    if (slot < 0) {
      var nb = this.nearest(t);
      if (nb !== cur) { if (nb >= this.U) this.refc[nb]++; ppu.setTile(0, col, row, nb); s.cur[cell] = nb; this.decref(cur); cost = 1; }
      this.approx[ak] = [si, cell]; this.approxN++;
      return cost;
    }
    this.bank.tiles[slot].set(t); this.skey[slot] = key; this.map[key] = slot; this.refc[slot] = 1;
    if (B) B.use(16); this.uploads++;
    ppu.setTile(0, col, row, slot);
    s.cur[cell] = slot; this.decref(cur);
    return 17;
  };
  // 每幀呼叫：limit = 本幀 ppu 通道最多用到幾 byte（預算 mute 時全部做完）
  Disp.prototype.flush = function (limit) {
    var B = bud(this.nes), ppu = this.nes.ppu, si, s;
    var room = function () { return !B || B.mute || (B.used + 17 <= limit); };
    for (si = 0; si < this.surfs.length; si++) {
      s = this.surfs[si];
      while (s.q.length && room()) {
        var cell = s.q.shift(); s.dirty[cell] = 0;
        this.doCell(si, s, cell); this.cellsDone++; this.batchDone++;
      }
    }
    for (si = 0; si < this.surfs.length; si++) {
      s = this.surfs[si];
      while (s.bq.length && (!B || B.mute || B.used + 1 <= limit)) {
        var b = s.bq.shift(); s.bdirty[b] = 0;
        var gsel = s.block(b, s.attr[b]);
        if (gsel >= 0 && gsel !== s.attr[b]) {
          s.attr[b] = gsel;
          ppu.setAttr(0, (s.col >> 1) + (b % s.bw), (s.row >> 1) + ((b / s.bw) | 0), gsel);
        }
      }
    }
  };
  Disp.prototype.flushAll = function () { this.flush(1 << 30); };
  Disp.prototype.idle = function () { if (!this.pending()) { this.batch = 0; this.batchDone = 0; } };

  // 畫布 128×128 → surface（16×16 格、8×8 屬性區）
  function canvasSurface(model, col, row) {
    var pix = model.pix;
    return {
      col: col, row: row, cw: 16, ch: 16, bw: 8, bh: 8, model: model,
      cell: function (i, out) {
        var x0 = (i & 15) << 3, y0 = (i >> 4) << 3, o = 0;
        for (var y = 0; y < 8; y++) { var k = (y0 + y) * W + x0; for (var x = 0; x < 8; x++) out[o++] = idxOf(pix[k + x]); }
      },
      block: function (b, cur) { return majority(pix, W, (b & 7) << 4, (b >> 3) << 4, 16, cur); }
    };
  }
  // 參考圖縮圖 64×64（每 2×2 取左上）→ surface（8×8 格）
  function thumbSurface(ref, col, row) {
    var half = new Uint8Array(64 * 64);
    for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) half[y * 64 + x] = ref[(y * 2) * W + x * 2];
    return {
      col: col, row: row, cw: 8, ch: 8, bw: 4, bh: 4, half: half,
      cell: function (i, out) {
        var x0 = (i & 7) << 3, y0 = (i >> 3) << 3, o = 0;
        for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) out[o++] = idxOf(half[(y0 + y) * 64 + x0 + x]);
      },
      block: function (b, cur) { return majority(half, 64, (b & 3) << 4, (b >> 2) << 4, 16, cur); }
    };
  }
  function majority(pix, stride, x0, y0, sz, cur) {
    var c12 = [0, 0, 0, 0], c3 = [0, 0, 0, 0], x, y;
    for (y = 0; y < sz; y++) for (x = 0; x < sz; x++) {
      var c = pix[(y0 + y) * stride + x0 + x];
      if (!c) continue;
      if (idxOf(c) === 3) c3[grpOf(c)]++; else c12[grpOf(c)]++;
    }
    var cnt = (c12[0] + c12[1] + c12[2] + c12[3]) ? c12 : ((c3[0] + c3[1] + c3[2] + c3[3]) ? c3 : null);
    if (!cnt) return cur < 0 ? 0 : cur;
    var best = cur >= 0 ? cur : 0;
    for (var gi = 0; gi < 4; gi++) if (cnt[gi] > cnt[best]) best = gi;
    return best;
  }

  /* ================================================================ 存檔碼 */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function crc16(a) {
    var c = 0xFFFF;
    for (var i = 0; i < a.length; i++) { c ^= a[i] << 8; for (var j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
    return c;
  }
  function b64(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), left = bytes.length - i;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (left > 1 ? B64[(n >> 6) & 63] : '') + (left > 2 ? B64[n & 63] : '');
    }
    return s;
  }
  function unb64(s) {
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64.indexOf(s.charAt(i));
      if (v < 0) return null;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }
  // pal13 = [底色, g0c1, g0c2, g0c3, g1c1, …, g3c3]
  function encode(pix, pal13) {
    var bytes = [], i;
    for (i = 0; i < 13; i++) bytes.push(pal13[i] & 63);
    i = 0;
    while (i < N) { var c = pix[i], n = 1; while (i + n < N && pix[i + n] === c && n < 256) n++; bytes.push(c, n - 1); i += n; }
    var cr = crc16(bytes); bytes.push(cr >> 8, cr & 255);
    return 'SP1' + b64(bytes);
  }
  function decode(str) {
    str = String(str || '').replace(/\s+/g, '');
    if (str.slice(0, 3) !== 'SP1') return null;
    var bytes = unb64(str.slice(3));
    if (!bytes || bytes.length < 17) return null;
    var body = bytes.slice(0, bytes.length - 2), cr = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
    if (crc16(body) !== cr) return null;
    var pal = body.slice(0, 13), pix = new Uint8Array(N), p = 0, i;
    for (i = 0; i < 13; i++) if (pal[i] > 63 || pal[i] === 0x0D) return null;
    for (i = 13; i + 1 < body.length; i += 2) {
      var c = body[i], n = body[i + 1] + 1;
      if (c > 12 || p + n > N) return null;
      pix.fill(c, p, p + n); p += n;
    }
    if (p !== N || ((body.length - 13) & 1)) return null;
    return { pix: pix, pal: pal };
  }

  /* ================================================================ 臨摹評分 */
  // 32×32 格：墨 = 非紙像素 ≥ 4 / 16；主色 = 格內最多的非紙碼
  function cells32(pix) {
    var ink = new Uint8Array(1024), dom = new Uint8Array(1024), cnt = new Int32Array(13);
    for (var cy = 0; cy < 32; cy++) for (var cx = 0; cx < 32; cx++) {
      cnt.fill(0); var n = 0;
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) { var c = pix[(cy * 4 + y) * W + cx * 4 + x]; if (c) { cnt[c]++; n++; } }
      var i = cy * 32 + cx;
      if (n >= 4) { ink[i] = 1; var b = 1; for (var k = 2; k <= 12; k++) if (cnt[k] > cnt[b]) b = k; dom[i] = b; }
    }
    return { ink: ink, dom: dom };
  }
  function near(m, i, want) {
    var cx = i & 31, cy = i >> 5;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x > 31 || y > 31) continue;
      var j = y * 32 + x;
      if (want === undefined ? m.ink[j] : (m.ink[j] && m.dom[j] === want)) return true;
    }
    return false;
  }
  function score(user, ref) {
    var U = cells32(user), R = cells32(ref), nu = 0, nr = 0, hitU = 0, hitR = 0, colOk = 0, colN = 0;
    for (var i = 0; i < 1024; i++) {
      if (U.ink[i]) { nu++; if (near(R, i)) hitU++; }
      if (R.ink[i]) {
        nr++; if (near(U, i)) hitR++;
        if (U.ink[i] || near(U, i)) { colN++; if (near(U, i, R.dom[i])) colOk++; }
      }
    }
    if (!nu || !nr) return { score: 0, f1: 0, color: 0, prec: 0, rec: 0, rating: 'D' };
    var prec = hitU / nu, rec = hitR / nr, f1 = (prec + rec) ? 2 * prec * rec / (prec + rec) : 0, col = colN ? colOk / colN : 0;
    var sc = Math.round(100 * (0.7 * f1 + 0.3 * col));
    return { score: sc, f1: f1, color: col, prec: prec, rec: rec, rating: rating(sc) };
  }
  var RATE = [['S', 90], ['A', 80], ['B', 65], ['C', 45], ['D', 0]];
  function rating(sc) { for (var i = 0; i < RATE.length; i++) if (sc >= RATE[i][1]) return RATE[i][0]; return 'D'; }

  /* ================================================================ 著色本區域 */
  // 紙色（0）的 4 連通區塊中「不碰畫布邊」且 ≥ minSize 的 → [{size, seed:[x,y], list:Int32Array}]
  function regions(pix, minSize) {
    var lab = new Int32Array(N).fill(-1), out = [], stack = [];
    for (var s = 0; s < N; s++) {
      if (pix[s] || lab[s] >= 0) continue;
      var list = [], edge = false, id = out.length + 1000000;
      stack.length = 0; stack.push(s); lab[s] = id;
      while (stack.length) {
        var k = stack.pop(), x = k & 127, y = k >> 7; list.push(k);
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
        if (x > 0 && lab[k - 1] < 0 && !pix[k - 1]) { lab[k - 1] = id; stack.push(k - 1); }
        if (x < W - 1 && lab[k + 1] < 0 && !pix[k + 1]) { lab[k + 1] = id; stack.push(k + 1); }
        if (y > 0 && lab[k - W] < 0 && !pix[k - W]) { lab[k - W] = id; stack.push(k - W); }
        if (y < H - 1 && lab[k + W] < 0 && !pix[k + W]) { lab[k + W] = id; stack.push(k + W); }
      }
      if (edge || list.length < minSize) continue;
      // 種子：離區塊重心最近的區內點
      var sx = 0, sy = 0, i;
      for (i = 0; i < list.length; i++) { sx += list[i] & 127; sy += list[i] >> 7; }
      sx /= list.length; sy /= list.length;
      var bk = list[0], bd = 1e9;
      for (i = 0; i < list.length; i++) { var d = Math.pow((list[i] & 127) - sx, 2) + Math.pow((list[i] >> 7) - sy, 2); if (d < bd) { bd = d; bk = list[i]; } }
      out.push({ size: list.length, seed: [bk & 127, bk >> 7], list: Int32Array.from(list) });
    }
    return out;
  }

  /* ================================================================ 快畫猜猜：形狀分類 */
  var SHAPES = ['LINE', 'CIRCLE', 'TRIANGLE', 'SQUARE', 'STAR', 'CROSS'];
  function classify(pix) {
    var xs = [], ys = [], i;
    for (i = 0; i < N; i++) if (pix[i]) { xs.push(i & 127); ys.push(i >> 7); }
    var n = xs.length, f = { n: n };
    if (n < 20) return { label: null, f: f };
    var mx = 0, my = 0, xa = 999, xb = -1, ya = 999, yb = -1;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; xa = Math.min(xa, xs[i]); xb = Math.max(xb, xs[i]); ya = Math.min(ya, ys[i]); yb = Math.max(yb, ys[i]); }
    mx /= n; my /= n;
    var sxx = 0, syy = 0, sxy = 0;
    for (i = 0; i < n; i++) { var dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= n; syy /= n; sxy /= n;
    var tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(0.01, tr / 2 - disc);
    f.elong = Math.sqrt(l1 / l2);
    var bw = xb - xa + 1, bh = yb - ya + 1, size = Math.max(bw, bh);
    f.fill = n / (bw * bh); f.size = size;
    if (size < 10) return { label: null, f: f };
    if (f.elong > 5) return { label: 'LINE', f: f };
    // 中心（墨跡重心）附近有沒有墨
    var cr = Math.max(2, size * 0.1), centerInk = 0;
    for (i = 0; i < n; i++) if (Math.abs(xs[i] - mx) <= cr && Math.abs(ys[i] - my) <= cr) centerInk++;
    f.center = centerInk;
    // 極座標輪廓：32 個角度桶的最遠距離
    var NB = 32, r = new Float64Array(NB);
    for (i = 0; i < n; i++) {
      var ddx = xs[i] - mx, ddy = ys[i] - my, d = Math.sqrt(ddx * ddx + ddy * ddy);
      var bi = Math.floor(((Math.atan2(ddy, ddx) + Math.PI) / (2 * Math.PI)) * NB) % NB;
      if (d > r[bi]) r[bi] = d;
    }
    for (var pass = 0; pass < 2; pass++) for (i = 0; i < NB; i++) if (!r[i]) r[i] = (r[(i + NB - 1) % NB] + r[(i + 1) % NB]) / 2;
    var mean = 0; for (i = 0; i < NB; i++) mean += r[i]; mean /= NB;
    var v = 0; for (i = 0; i < NB; i++) v += (r[i] - mean) * (r[i] - mean);
    f.cv = Math.sqrt(v / NB) / Math.max(0.01, mean);
    var M = [0, 0, 0, 0, 0, 0];
    for (var k = 2; k <= 5; k++) {
      var re = 0, im = 0;
      for (i = 0; i < NB; i++) { re += r[i] * Math.cos(2 * Math.PI * k * i / NB); im -= r[i] * Math.sin(2 * Math.PI * k * i / NB); }
      M[k] = Math.sqrt(re * re + im * im) / (mean * NB);
    }
    f.m = M.slice(2);
    if (centerInk >= 3 && f.fill < 0.4 && f.cv > 0.2) return { label: 'CROSS', f: f };
    if (f.cv < 0.075) return { label: 'CIRCLE', f: f };
    var bk2 = 3;
    for (k = 4; k <= 5; k++) if (M[k] > M[bk2]) bk2 = k;
    if (M[2] > M[bk2] * 1.6 && f.cv < 0.25) return { label: 'CIRCLE', f: f };
    if (M[bk2] < 0.03) return { label: 'CIRCLE', f: f };
    return { label: bk2 === 3 ? 'TRIANGLE' : bk2 === 4 ? 'SQUARE' : 'STAR', f: f };
  }

  /* ================================================================ 調色盤工具 */
  // 色相 0..12（0 = 灰）＋ 13 = 黑；亮度 0..3 ⇒ NES 色號（避開 $0D）
  function hueLum(c) { if (c === 0x0F || (c & 15) >= 13) return [13, 0]; return [c & 15, c >> 4]; }
  function fromHueLum(h, l) { return h >= 13 ? 0x0F : (l << 4) | h; }
  function lumOf(c) { var p = NES.PALETTE ? NES.PALETTE[c] : null; if (!p) return 0; return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; }
  function contrast(a, b) { var pa = NES.PALETTE[a], pb = NES.PALETTE[b]; if (!pa || !pb) return 0; return Math.abs(lumOf(a) - lumOf(b)) + 0.25 * (Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2])) / 3; }

  P.Core = {
    W: W, H: H, N: N, UNDO_MAX: UNDO_MAX, Model: Model, Disp: Disp, canvasSurface: canvasSurface, thumbSurface: thumbSurface,
    idxOf: idxOf, grpOf: grpOf, codeOf: codeOf, majority: majority, encode: encode, decode: decode, crc16: crc16,
    score: score, rating: rating, RATE: RATE, regions: regions, classify: classify, SHAPES: SHAPES,
    hueLum: hueLum, fromHueLum: fromHueLum, contrast: contrast, lumOf: lumOf, ellPts: ellPts
  };
})();
