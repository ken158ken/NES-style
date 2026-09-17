/* engine/cpu_timing.js — NES.Timing：60.0988 Hz 固定步邏輯迴圈
 * R1 / agent core。classic script、IIFE、零相依。
 *
 * 原則：
 *   - 邏輯步長固定 1/hz，**不做 delta-time 補間**（位置永遠是整數 sub 的累加）。
 *   - rAF 迴圈用累加器；一次 rAF 最多補 3 幀，還有剩就直接丟掉（避免分頁回前景時暴衝）。
 *   - step(n) 同步跑 n 幀（不走 rAF），供 tools/test_*.py 與截圖使用。
 *   - 每幀順序：Input.poll() → update() → draw()（NES.Input 不存在就跳過 poll）。
 *   - budget 模擬 VBlank 的 PPU 寫入頻寬：NTSC VBlank ≈ 2273 cycle ≈ 160~200 bytes。
 *     來源 docs/research/01_硬體規格與限制.md §2.4。
 *     兩條獨立通道（R1 fix1 / QA P1-6）：
 *       'ppu'（預設）名稱表 / 屬性表 / 調色盤，limit = 160 byte（NTSC）
 *       'oam'  $4014 DMA 一次搬 256 byte（513 cycle），與上面那 160 byte 是分開的頻寬，
 *              所以一幀寫滿 64 個精靈（256 byte）不算超支；真正超支的是 setTile 那條。
 *     nes.js boot 時把本物件綁到 ppu.budget，PPU 的每個寫入函式都會自動計帳。
 *     budget.strict = true ⇒ 超支直接 throw（開發期抓「一幀寫太多」）；預設只記錄。
 */
(function (root) {
  'use strict';
  var NES = root.NES = root.NES || {};

  var HZ = { ntsc: 60.0988, pal: 50.0070 };   // 來源：01 §2.4
  var VBLANK_BYTES = { ntsc: 160, pal: 500 }; // NTSC 20 線 ≈160~200 B；PAL 70 線 ≈3.3 倍

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(function () { fn(now()); }, 16);
  }
  function craf(id) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  }

  var OAM_BYTES = 256;          // $4014 DMA：影子 OAM 一整頁

  function makeBudget(bytes) {
    return {
      limit: bytes | 0,
      used: 0,
      over: false,        // 本幀是否超支（任一通道）
      explicit: false,    // 是否被 set() 明確指定過（setMode 就不再覆蓋）
      overFrames: 0,      // 累計超支幀數
      overBy: 0,          // 最近一次超支的超出量（byte）
      overKind: '',       // 'ppu' | 'oam'
      peak: 0,            // 歷史單幀最高用量（ppu 通道）
      oamLimit: OAM_BYTES,
      oamUsed: 0,
      oamPeak: 0,
      serial: 0,          // 幀序號：每次 reset() +1，讓 PPU 知道「換幀了」
      mute: false,        // true = 暫停計帳（__nes.render() 重畫時用）
      strict: false,      // true = 超支直接 throw
      set: function (b) { this.limit = b | 0; this.explicit = true; return this; },
      setOam: function (b) { this.oamLimit = b | 0; return this; },
      // use(n) 或 use(n, 'oam')
      use: function (n, kind) {
        if (this.mute) return !this.over;
        n = n | 0;
        var used, limit;
        if (kind === 'oam') {
          this.oamUsed = used = (this.oamUsed + n) | 0;
          limit = this.oamLimit;
          if (used > this.oamPeak) this.oamPeak = used;
        } else {
          this.used = used = (this.used + n) | 0;
          limit = this.limit;
          if (used > this.peak) this.peak = used;
        }
        if (used > limit) {
          if (!this.over) { this.over = true; this.overFrames++; }
          this.overBy = used - limit;
          this.overKind = kind === 'oam' ? 'oam' : 'ppu';
          if (this.strict) {
            throw new Error('NES.Timing.budget 超支：' + this.overKind + ' 通道本幀已寫 ' + used +
              ' byte，上限 ' + limit + '（VBlank 只搬得動這麼多；把寫入分攤到多幀）');
          }
        }
        return !this.over;            // true = 還在預算內
      },
      left: function () { return (this.limit - this.used) | 0; },
      oamLeft: function () { return (this.oamLimit - this.oamUsed) | 0; },
      reset: function () {
        this.used = 0; this.oamUsed = 0; this.over = false;
        this.serial = (this.serial + 1) | 0;
        return this;
      },
      clear: function () {
        this.reset();
        this.overFrames = 0; this.overBy = 0; this.overKind = '';
        this.peak = 0; this.oamPeak = 0;
        return this;
      },
      // 目前狀態摘要（__nes.stats() 用）
      report: function () {
        return {
          limit: this.limit, used: this.used, peak: this.peak, left: this.left(),
          oamLimit: this.oamLimit, oamUsed: this.oamUsed, oamPeak: this.oamPeak,
          over: this.over, overFrames: this.overFrames, overBy: this.overBy, overKind: this.overKind,
          strict: !!this.strict
        };
      }
    };
  }

  function create(opts) {
    opts = opts || {};
    var update = opts.update || function () {};
    var draw = opts.draw || function () {};
    var mode = opts.mode || 'ntsc';
    var hz = opts.hz || HZ[mode] || HZ.ntsc;
    var stepMs = 1000 / hz;
    var maxCatchUp = opts.maxCatchUp === undefined ? 3 : (opts.maxCatchUp | 0);
    var acc = 0, last = 0, rafId = 0;

    var t = {
      frame: 0,
      hz: hz,
      mode: mode,
      running: false,
      dropped: 0,          // 因來不及而丟掉的幀數
      budget: makeBudget(opts.budgetBytes || VBLANK_BYTES[mode] || 160)
    };
    if (opts.budgetBytes) t.budget.explicit = true;
    if (opts.strictBudget) t.budget.strict = true;

    function runFrame() {
      t.budget.reset();
      var In = root.NES && root.NES.Input;
      if (In && In.poll) In.poll();
      update(t.frame);
      draw(t.frame);
      t.frame = (t.frame + 1) | 0;
    }

    function loop(ts) {
      if (!t.running) return;
      if (typeof ts !== 'number') ts = now();
      var dt = ts - last;
      last = ts;
      if (dt < 0) dt = 0;
      if (dt > 1000) dt = 1000;        // 分頁休眠後不要暴衝
      acc += dt;
      var n = 0;
      while (acc >= stepMs && n < maxCatchUp) { runFrame(); acc -= stepMs; n++; }
      if (acc >= stepMs) {             // 補不完 → 丟幀（不做 dt 補間）
        t.dropped += Math.floor(acc / stepMs);
        acc = 0;
      }
      rafId = raf(loop);
    }

    t.start = function () {
      if (t.running) return t;
      t.running = true;
      last = now(); acc = 0;
      rafId = raf(loop);
      return t;
    };
    t.stop = function () {
      if (!t.running) return t;
      t.running = false;
      craf(rafId); rafId = 0;
      return t;
    };
    t.step = function (n) {            // 同步跑 n 幀（測試 / 截圖）
      n = n === undefined ? 1 : (n | 0);
      for (var i = 0; i < n; i++) runFrame();
      return t.frame;
    };
    t.setMode = function (m) {
      if (!HZ.hasOwnProperty(m)) throw new Error('NES.Timing: 未知模式 ' + m);
      mode = m; t.mode = m;
      hz = HZ[m]; t.hz = hz; stepMs = 1000 / hz;
      if (!t.budget.explicit) t.budget.limit = VBLANK_BYTES[m] | 0;
      acc = 0;
      return t;
    };
    t.setHz = function (v) { hz = +v; t.hz = hz; stepMs = 1000 / hz; acc = 0; return t; };
    t.stepMs = function () { return stepMs; };
    t.setCallbacks = function (u, d) { if (u) update = u; if (d) draw = d; return t; };
    t.reset = function () { t.frame = 0; t.dropped = 0; acc = 0; t.budget.clear(); return t; };

    return t;
  }

  NES.Timing = { HZ: HZ, VBLANK_BYTES: VBLANK_BYTES, create: create, now: now };
})(typeof window !== 'undefined' ? window : this);
