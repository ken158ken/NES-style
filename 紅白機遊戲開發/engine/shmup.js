/*
 * engine/shmup.js — NES.SH：橫向射擊（宇宙巡航艦式）共用工具
 * ---------------------------------------------------------------------------
 * 擁有者：engine agent（R2）｜ classic script + IIFE + 零相依（只用到傳進來的 ppu）
 * 契約：docs/TASKS.md「R2《星塵巡航艦》§ engine/shmup.js」、正式版見 docs/ENGINE_API.md §15
 *
 * 設計原則（跟 R1 一樣是「原汁原味紅白機」）：
 *   ① 全整數：三角函數是 8.8 定點查表（256 = 1.0），角度一圈 = 256 單位；
 *      執行期不呼叫 Math.sin / Math.cos / Math.atan2（只在載入時建表）。
 *   ② 零配置：Pool / OAM / Scroller / Spawner 的每幀路徑都不 new 物件、不建陣列
 *      （OAM 寫入時重複使用同一個 scratch 物件餵給 ppu.sprite）。
 *   ③ VBlank 預算：Scroller 每幀最多寫 1 欄 = 30 byte（+ 每 2 欄一次的 15 byte 屬性）
 *      = **≤ 45 byte**，遠低於 NTSC 160 byte/幀（見 ENGINE_API §5 budget）。
 *   ④ 每線 8 精靈：OAM 的軟體 sprite cycling 由本模組做，所以使用者必須先設
 *      **`ppu.flickerStep = 0`**（否則 PPU 自己的輪替會跟這裡的輪替互相打架）。
 *
 * 角度單位（重要）：0..255 一圈，**0 = 右(+x)、64 = 下(+y)、128 = 左(-x)、192 = 上(-y)**
 * （螢幕座標 y 向下，所以角度增加 = 順時針）。
 *
 * 名稱表方向（重要）：水平捲動要「左右兩張不同」＝ PPU 的 **垂直鏡像 `ppu.mirroring('v')`**
 * （nt 0 = 左、nt 1 = 右，世界第 c 欄寫進 `c & 63` → nt `(c>>5)&1` 的第 `c&31` 欄）。
 * `Scroller.reset()` 會自動套用（可用 `{mirror:false}` 關掉）。
 */
(function (global) {
  'use strict';

  var NES = global.NES = global.NES || {};
  var SH = NES.SH = NES.SH || {};

  SH.VERSION = '1.0';
  NES.SHMUP_VERSION = SH.VERSION;

  var ONE = 256;          // 8.8 定點的 1.0
  var ANGLES = 256;       // 一圈的角度單位數
  var SCREEN_W = 256;
  var SCREEN_H = 240;
  var NT_COLS = 32;       // 一張名稱表 32 欄
  var WINDOW = 64;        // 兩張名稱表 = 64 欄的環形視窗
  var PRIO_N = 8;         // prio 0..7

  /* ================================================================ 三角函數 */

  var SIN = new Int16Array(ANGLES);
  var COS = new Int16Array(ANGLES);
  /** 載入時用 Math 建 8.8 正弦 / 餘弦表（執行期只查表）。 */
  (function buildTrig() {
    for (var a = 0; a < ANGLES; a++) {
      var r = a * Math.PI * 2 / ANGLES;
      SIN[a] = Math.round(Math.sin(r) * ONE);
      COS[a] = Math.round(Math.cos(r) * ONE);
    }
  })();
  SH.SIN = SIN;
  SH.COS = COS;

  // atan(i/256) 的角度表（0..256 → 0..32 單位＝ 0..45°），八分法用
  var ATAN = new Uint8Array(257);
  /** 載入時用 Math 建反正切表（第一個八分圓 0..45°）。 */
  (function buildAtan() {
    for (var i = 0; i <= 256; i++) ATAN[i] = Math.round(Math.atan(i / 256) * ANGLES / (Math.PI * 2));
  })();
  SH.ATAN = ATAN;

  /** 查表版 sin：角度自動取 0..255。 */
  function sin(a) { return SIN[a & 255]; }
  /** 查表版 cos：角度自動取 0..255。 */
  function cos(a) { return COS[a & 255]; }

  /** 整數版 atan2：回傳 0..255 的角度（0 = 右、64 = 下、128 = 左、192 = 上），不用 Math.atan2。 */
  function atan2(dy, dx) {
    dy = dy | 0; dx = dx | 0;
    if (dx === 0 && dy === 0) return 0;
    var ax = dx < 0 ? -dx : dx;
    var ay = dy < 0 ? -dy : dy;
    var a;
    if (ax >= ay) a = ATAN[(ay * 256 / ax) | 0];            // 0..32（≤ 45°）
    else a = 64 - ATAN[(ax * 256 / ay) | 0];                // 32..64（> 45°）
    if (dx >= 0) return dy >= 0 ? (a & 255) : ((256 - a) & 255);
    return dy >= 0 ? ((128 - a) & 255) : ((128 + a) & 255);
  }

  /** 角度 + 速度 → 8.8 速度向量；傳 out 可重複使用物件（每幀零配置）。 */
  function vel(angle, speed88, out) {
    var a = angle & 255, s = speed88 | 0;
    var vx = (COS[a] * s + 128) >> 8;
    var vy = (SIN[a] * s + 128) >> 8;
    if (out) { out.vx = vx; out.vy = vy; out.a = a; return out; }
    return { vx: vx, vy: vy, a: a };
  }

  /** 瞄準射擊：(sx,sy) 指向 (tx,ty) 的 8.8 速度向量 {vx, vy, a}；傳 out 可重複使用物件。 */
  function aim(sx, sy, tx, ty, speed88, out) {
    return vel(atan2((ty | 0) - (sy | 0), (tx | 0) - (sx | 0)), speed88, out);
  }

  /** 整數 AABB 重疊判定（相鄰不算重疊、寬或高為 0 一律不重疊）。 */
  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /** 點是否落在矩形內（整數）。 */
  function inRect(x, y, r) {
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  /** 整數夾限。 */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 每 n 幀成立一次（phase 可錯開）。 */
  function every(frame, n, phase) {
    n = n | 0;
    if (n <= 0) return false;
    var d = ((frame | 0) - (phase | 0)) % n;
    return (d < 0 ? d + n : d) === 0;
  }

  SH.sin = sin;
  SH.cos = cos;
  SH.atan2 = atan2;
  SH.vel = vel;
  SH.aim = aim;
  SH.aabb = aabb;
  SH.inRect = inRect;
  SH.clamp = clamp;
  SH.every = every;

  /* ================================================================ Timer */

  /** 小工具計時器：每 period 幀 tick() 回 true 一次。 */
  function Timer(period, phase) {
    if (!(this instanceof Timer)) return new Timer(period, phase);
    this.period = (period | 0) || 1;
    this.t = (phase | 0) || 0;
  }
  /** 推進一幀，到期回 true 並歸零。 */
  Timer.prototype.tick = function () {
    this.t++;
    if (this.t >= this.period) { this.t = 0; return true; }
    return false;
  };
  /** 歸零。 */
  Timer.prototype.reset = function (period) {
    if (period !== undefined) this.period = (period | 0) || 1;
    this.t = 0;
    return this;
  };
  SH.Timer = Timer;

  /* ================================================================ Pool */

  /**
   * 固定大小物件池（無 GC）：建構時就把 n 個物件全部造好，之後只在「活 / 死」之間切換。
   * 物件多一個 `alive` 旗標（alloc → true、free → false）；遊戲自己把 `alive` 設成 false
   * 也算釋放（下一次 `each()` 會自動回收），方便敵人 / 子彈用最自然的寫法。
   */
  function Pool(n, factory) {
    if (!(this instanceof Pool)) return new Pool(n, factory);
    n = n | 0;
    if (n <= 0) throw new Error('NES.SH.Pool: n 必須是 > 0 的整數，收到 ' + n);
    if (typeof factory !== 'function') throw new Error('NES.SH.Pool: factory 必須是 function');
    this.size = n;
    this.count = 0;
    this.items = new Array(n);
    this._live = new Uint8Array(n);
    this._free = new Int32Array(n);
    this._top = n;
    for (var i = 0; i < n; i++) {
      var o = factory(i);
      if (!o || typeof o !== 'object') throw new Error('NES.SH.Pool: factory(' + i + ') 必須回傳物件');
      o.alive = false;
      try {
        Object.defineProperty(o, '_pi', { value: i, enumerable: false, writable: true, configurable: true });
      } catch (e) { o._pi = i; }
      this.items[i] = o;
      this._free[i] = n - 1 - i;      // 讓 alloc 依 0,1,2… 的順序取槽（可重現）
    }
  }
  /** 取一個空槽（回傳物件，`alive = true`）；沒槽了回 null（NES 風：不生成）。 */
  Pool.prototype.alloc = function () {
    if (this._top <= 0) return null;
    var i = this._free[--this._top];
    this._live[i] = 1;
    this.count++;
    var o = this.items[i];
    o.alive = true;
    return o;
  };
  /** 釋放一個物件（重複釋放安全，回傳是否真的釋放了）。 */
  Pool.prototype.free = function (o) {
    if (!o) return false;
    var i = o._pi;
    if (!(typeof i === 'number' && i >= 0 && i < this.size && this.items[i] === o)) {
      i = this.items.indexOf(o);
      if (i < 0) return false;
    }
    if (!this._live[i]) { o.alive = false; return false; }
    this._live[i] = 0;
    o.alive = false;
    this._free[this._top++] = i;
    this.count--;
    return true;
  };
  /** 走訪所有活著的物件 `fn(obj, i)`；途中被設成 `alive = false` 的會就地回收。 */
  Pool.prototype.each = function (fn, ctx) {
    var n = 0, i, o;
    for (i = 0; i < this.size; i++) {
      if (!this._live[i]) continue;
      o = this.items[i];
      if (o.alive === false) { this.free(o); continue; }
      fn.call(ctx, o, i);
      n++;
      if (o.alive === false && this._live[i]) this.free(o);
    }
    return n;
  };
  /** 第 i 槽是否活著。 */
  Pool.prototype.isAlive = function (i) { return !!this._live[i | 0]; };
  /** 全部釋放（關卡重來 / 檢查點復活用）。 */
  Pool.prototype.freeAll = function () {
    for (var i = 0; i < this.size; i++) {
      this._live[i] = 0;
      this.items[i].alive = false;
      this._free[i] = this.size - 1 - i;
    }
    this._top = this.size;
    this.count = 0;
    return this;
  };
  /** `freeAll()` 的別名。 */
  Pool.prototype.reset = Pool.prototype.freeAll;
  SH.Pool = Pool;

  /* ================================================================ OAM */

  /**
   * 每幀精靈配置器：`begin()` → 一堆 `add()` → `end()` 寫進 PPU 的 OAM 0..63。
   * `prio` 0 最高（船 / 選項 / 自機彈 → 敵彈 → 敵 → 爆炸）；**同 prio 之間每幀輪替起點**
   * ＝軟體 sprite cycling，所以要先設 `ppu.flickerStep = 0`（見檔頭）。
   * 超過可用槽數的丟棄並累計 `dropped`；`y >= 240` 或 x 超界的在 `add()` 就略過（計 `skipped`）。
   */
  function OAM(ppu, opt) {
    if (!(this instanceof OAM)) return new OAM(ppu, opt);
    opt = opt || {};
    if (!ppu || typeof ppu.sprite !== 'function') throw new Error('NES.SH.OAM: 需要 NES.PPU 實例');
    this.ppu = ppu;
    this.slots = 64;
    this.reserve = clamp(opt.reserve | 0, 0, 64);     // 前 reserve 槽保留給遊戲自己寫
    this.capacity = this.slots - this.reserve;
    this.step = (opt.step === undefined) ? 8 : (opt.step | 0);   // 每幀輪替幾個（NESdev 慣例 8）
    this.hideY = (opt.hideY === undefined) ? 240 : (opt.hideY | 0);
    this.hideUnused = opt.hideUnused !== false;
    this.margin = (opt.margin === undefined) ? 16 : (opt.margin | 0);
    var max = (opt.max | 0) || 128;
    this._max = max;
    this._x = new Int16Array(max);
    this._y = new Int16Array(max);
    this._t = new Uint8Array(max);
    this._p = new Uint8Array(max);
    this._f = new Uint8Array(max);
    this._pr = new Uint8Array(max);
    this._ord = new Int16Array(max);
    this._cnt = new Int32Array(PRIO_N);
    this._gs = new Int32Array(PRIO_N);
    this._gl = new Int32Array(PRIO_N);
    this._s = { x: 0, y: 0, tile: 0, pal: 0, flipH: false, flipV: false, behind: false };
    this.n = 0;
    this.used = 0;
    this.dropped = 0;
    this.skipped = 0;
    this.overflow = 0;
    this.frames = 0;
  }
  /** 開始收集這一幀的精靈（清空計數）。 */
  OAM.prototype.begin = function () {
    this.n = 0; this.used = 0; this.dropped = 0; this.skipped = 0; this.overflow = 0;
    return this;
  };
  /** 低階加入（不配置物件）：回傳 true = 收下。 */
  OAM.prototype.push = function (x, y, tile, pal, prio, flags) {
    x = x | 0; y = y | 0;
    var m = this.margin;
    if (y >= SCREEN_H || y < -m || x >= SCREEN_W || x < -m) { this.skipped++; return false; }
    var k = this.n;
    if (k >= this._max) { this.overflow++; this.dropped++; return false; }
    this._x[k] = x; this._y[k] = y;
    this._t[k] = tile & 255;
    this._p[k] = pal & 3;
    this._f[k] = flags & 7;
    this._pr[k] = clamp(prio | 0, 0, PRIO_N - 1);
    this.n = k + 1;
    return true;
  };
  /** 加入一個精靈 `{x,y,tile,pal,flipH,flipV,behind,prio}`（可重複使用同一個物件）。 */
  OAM.prototype.add = function (s) {
    return this.push(s.x, s.y, s.tile, s.pal, s.prio,
      (s.flipH ? 1 : 0) | (s.flipV ? 2 : 0) | (s.behind ? 4 : 0));
  };
  /** 排序 + 輪替 + 寫進 OAM；回傳實際寫入的精靈數（其餘計入 `dropped`）。 */
  OAM.prototype.end = function () {
    var n = this.n, cnt = this._cnt, gs = this._gs, gl = this._gl, ord = this._ord, pr = this._pr;
    var i, p, acc = 0;
    // 依 prio 做穩定計數排序（同 prio 保持 add 的順序）
    for (p = 0; p < PRIO_N; p++) cnt[p] = 0;
    for (i = 0; i < n; i++) cnt[pr[i]]++;
    for (p = 0; p < PRIO_N; p++) { gs[p] = acc; gl[p] = cnt[p]; acc += cnt[p]; cnt[p] = gs[p]; }
    for (i = 0; i < n; i++) ord[cnt[pr[i]]++] = i;

    var ppu = this.ppu, sp = this._s, slot = this.reserve, cap = this.slots;
    var written = 0, j, k, off, len, f;
    outer:
    for (p = 0; p < PRIO_N; p++) {
      len = gl[p];
      if (len === 0) continue;
      // 同 prio 每幀輪替起點 ⇒ 連續兩幀的聯集蓋滿整組（軟體 sprite cycling）
      off = (len > 1 && this.step) ? (((this.frames * this.step) % len) + len) % len : 0;
      for (j = 0; j < len; j++) {
        if (slot >= cap) break outer;
        k = ord[gs[p] + ((j + off) % len)];
        f = this._f[k];
        sp.x = this._x[k]; sp.y = this._y[k];
        sp.tile = this._t[k]; sp.pal = this._p[k];
        sp.flipH = (f & 1) !== 0; sp.flipV = (f & 2) !== 0; sp.behind = (f & 4) !== 0;
        ppu.sprite(slot++, sp);
        written++;
      }
    }
    if (written < n) this.dropped += n - written;
    if (this.hideUnused) {
      sp.x = 0; sp.y = this.hideY; sp.tile = 0; sp.pal = 0;
      sp.flipH = false; sp.flipV = false; sp.behind = false;
      for (; slot < cap; slot++) ppu.sprite(slot, sp);
    }
    this.used = written;
    this.frames = (this.frames + 1) | 0;
    return written;
  };
  /** 把輪替指標歸零（換關 / 重開時用，讓截圖可重現）。 */
  OAM.prototype.resetCycle = function () { this.frames = 0; return this; };
  SH.OAM = OAM;

  /* ================================================================ Scroller */

  /**
   * 水平捲動的名稱表欄串流：兩張名稱表 = 64 欄的環形視窗，世界第 c 欄固定寫進
   * `c & 63`（nt `(c>>5)&1` 的第 `c&31` 欄）。`update()` 每幀最多補 1 欄
   * ＝ 30 byte（+ 每 2 欄一次的 15 byte 屬性）≤ **45 byte**。
   * **不會**動 `ppu.scroll` / `ppu.split`（那是遊戲的事，見 ENGINE_API §15 範例）。
   */
  function Scroller(ppu, opt) {
    if (!(this instanceof Scroller)) return new Scroller(ppu, opt);
    opt = opt || {};
    if (!ppu || typeof ppu.setTile !== 'function') throw new Error('NES.SH.Scroller: 需要 NES.PPU 實例');
    if (typeof opt.tileAt !== 'function') throw new Error('NES.SH.Scroller: 需要 tileAt(col, row)');
    var nt = (opt.nt === undefined) ? 2 : (opt.nt | 0);
    if (nt !== 2) throw new Error('NES.SH.Scroller: nt 只支援 2（名稱表 0/1 左右串接）');
    this.ppu = ppu;
    this.nt = nt;
    this.cols = (opt.cols | 0) || 0;                 // 關卡總欄數（0 = 不限）
    this.tileAt = opt.tileAt;
    this.attrAt = opt.attrAt || null;
    this.row0 = clamp(opt.row0 | 0, 0, 29);
    this.rows = clamp((opt.rows === undefined) ? 30 : (opt.rows | 0), 1, 30 - this.row0);
    this.ahead = (opt.ahead === undefined) ? 34 : (opt.ahead | 0);      // 補到畫面右緣再往右幾欄
    this.maxCols = clamp((opt.maxCols === undefined) ? 1 : (opt.maxCols | 0), 1, 8);
    this.mirror = (opt.mirror === undefined) ? 'v' : opt.mirror;
    this._r16a = this.row0 >> 1;
    this._r16b = (this.row0 + this.rows - 1) >> 1;
    this.next = 0;          // 下一個還沒寫過的世界欄
    this.bytes = 0;         // 上一次 update 寫了幾 byte
    this.totalBytes = 0;
    this.peak = 0;          // update 的單幀尖峰（reset 不計入）
    this.columns = 0;       // 累計寫過幾欄
  }
  /** 一欄的 byte 數（30 列 + 每 2 欄一次的 15 個屬性）。 */
  Scroller.prototype.colBytes = function (c) {
    var b = this.rows;
    if (this.attrAt && ((c & 31) & 1) === 0) b += this._r16b - this._r16a + 1;
    return b;
  };
  /** 把世界第 c 欄寫進名稱表（含每 2 欄一次的 16×16 屬性）；回傳寫入 byte 數。 */
  Scroller.prototype.writeColumn = function (c) {
    c = c | 0;
    var ppu = this.ppu, ntc = c & (WINDOW - 1), nt = (ntc >> 5) & 1, col = ntc & (NT_COLS - 1);
    var r1 = this.row0 + this.rows, b = 0, r;
    for (r = this.row0; r < r1; r++) {
      ppu.setTile(nt, col, r, (this.tileAt(c, r) | 0) & 255);
      b++;
    }
    if (this.attrAt && (col & 1) === 0) {
      var c16 = col >> 1, w16 = c >> 1, r16;
      for (r16 = this._r16a; r16 <= this._r16b; r16++) {
        ppu.setAttr(nt, c16, r16, (this.attrAt(w16, r16) | 0) & 3);
        b++;
      }
    }
    this.columns++;
    return b;
  };
  /**
   * 一次補滿兩張名稱表（64 欄）：只在 init / 換關 / 檢查點復活（rendering 關閉）時呼叫，
   * 會遠超 VBlank 預算，所以**不要**在遊戲中途呼叫。回傳寫入 byte 數。
   */
  Scroller.prototype.reset = function (camX) {
    camX = camX | 0;
    if (camX < 0) camX = 0;
    if (this.mirror) this.ppu.mirroring(this.mirror);
    var first = camX >> 3, b = 0, i;
    for (i = 0; i < WINDOW; i++) b += this.writeColumn(first + i);
    this.next = first + WINDOW;
    this.bytes = b;
    this.totalBytes += b;
    return b;
  };
  /** 每幀呼叫：只補「新露出」的欄（預設最多 1 欄 / 幀）；回傳本幀寫入 byte 數。 */
  Scroller.prototype.update = function (camX) {
    camX = camX | 0;
    if (camX < 0) camX = 0;
    var first = camX >> 3, wrote = 0, b = 0;
    if (this.next < first) this.next = first;            // 相機瞬移 ⇒ 不補舊欄（要整片重畫請 reset）
    var target = first + this.ahead;
    var lim = first + WINDOW - 1;                        // 不可覆蓋畫面上還看得見的欄
    if (target > lim) target = lim;
    if (this.cols > 0 && target > this.cols - 1) target = this.cols - 1;
    while (this.next <= target && wrote < this.maxCols) {
      b += this.writeColumn(this.next);
      this.next++;
      wrote++;
    }
    this.bytes = b;
    this.totalBytes += b;
    if (b > this.peak) this.peak = b;
    return b;
  };
  /** 還差幾欄沒補上（> 0 表示相機跑太快）。 */
  Scroller.prototype.pending = function (camX) {
    var target = ((camX | 0) >> 3) + this.ahead;
    if (this.cols > 0 && target > this.cols - 1) target = this.cols - 1;
    var d = target - this.next + 1;
    return d > 0 ? d : 0;
  };
  SH.Scroller = Scroller;

  /* ================================================================ Spawner */

  /**
   * 以「關卡欄」為鍵的出怪表：`camCol` 前進到 `col` 時呼叫 `fn(ctx, col, entry)`；
   * 每筆只觸發一次，相機倒退不重觸發（復活請用 `reset()` / `seek()`）。
   */
  function Spawner(table) {
    if (!(this instanceof Spawner)) return new Spawner(table);
    if (!table || typeof table.length !== 'number') throw new Error('NES.SH.Spawner: table 必須是陣列');
    var list = new Array(table.length), i, e;
    for (i = 0; i < table.length; i++) {
      e = table[i];
      if (!e || typeof e.fn !== 'function') throw new Error('NES.SH.Spawner: table[' + i + '] 需要 {col, fn}');
      list[i] = e;
    }
    list.sort(function (a, b) { return (a.col | 0) - (b.col | 0); });   // 允許表沒排好
    this.table = list;
    this.index = 0;
    this.fired = 0;
    this.lastCol = -1;
  }
  /** 每幀呼叫：觸發所有 `col <= camCol` 且還沒觸發過的項目；回傳本幀觸發數。 */
  Spawner.prototype.update = function (camCol, ctx) {
    camCol = camCol | 0;
    var t = this.table, n = t.length, fired = 0, e;
    while (this.index < n && (t[this.index].col | 0) <= camCol) {
      e = t[this.index++];
      this.fired++;
      fired++;
      e.fn(ctx, e.col | 0, e);
    }
    this.lastCol = camCol;
    return fired;
  };
  /** 全部重置（關卡重來）。 */
  Spawner.prototype.reset = function () {
    this.index = 0; this.fired = 0; this.lastCol = -1;
    return this;
  };
  /** 檢查點復活：把 `col <= camCol` 的項目直接標成已觸發（不執行 fn）。 */
  Spawner.prototype.seek = function (camCol) {
    camCol = camCol | 0;
    var t = this.table, n = t.length;
    this.index = 0;
    while (this.index < n && (t[this.index].col | 0) <= camCol) this.index++;
    this.fired = 0;
    this.lastCol = camCol;
    return this;
  };
  /** 還有幾筆沒觸發。 */
  Spawner.prototype.remaining = function () { return this.table.length - this.index; };
  SH.Spawner = Spawner;

})(typeof window !== 'undefined' ? window : this);
