/*
 * engine/apu.js — Ricoh 2A03（NTSC）APU 暫存器級模擬
 * classic script / IIFE / 零相依。掛在 window.NES.APU。
 *
 * 規格來源：
 *   docs/research/01_硬體規格與限制.md §4（占空比表、雜訊 16 週期表、DPCM、非線性混音）
 *   docs/research/06_音樂音效_2A03與chiptune.md §1（五聲道細節、frame counter、混音公式）
 *   （原始出處：NESdev Wiki APU / APU Pulse / APU Triangle / APU Noise / APU DMC / APU Mixer）
 *
 * 設計要點
 *   - 以「CPU cycle」為時間基準逐週期推進：三角波 / 雜訊 / DMC 的 timer 吃 CPU 時脈，
 *     兩支方波的 timer 吃 APU 時脈（CPU/2）。
 *   - 取樣輸出用 box-average（把一個輸出樣本涵蓋的所有 CPU cycle 的混音值平均），
 *     等於一個廉價的抗鋸齒低通，比點取樣乾淨很多。
 *   - 混音用研究文件的**非線性公式**，預先展開成查表（pulseTable / tndTable），
 *     查表值與 NES.APU.mix() 公式完全一致。
 *   - render(n) 與 tick() 共用同一個時鐘：兩者都會推進時間並產生樣本，
 *     所以同一段時間**只能擇一**呼叫（離線測試用 render / 逐幀推進用 tick）。
 *
 * API
 *   NES.APU.create({sampleRate, highpass, lowpass})  → apu
 *     apu.write(addr, val)        $4000~$4017
 *     apu.read(addr)              $4015 狀態
 *     apu.clock(nCpuCycles)       只推進時間、不產生樣本（測試用）
 *     apu.render(nSamples)        → Float32Array（離線、決定性）
 *     apu.tick()                  推進一個 NTSC 影格（1789773/60.0988 cycles），回傳該幀的 Float32Array
 *     apu.mix()                   目前這一瞬間的混音值（0..~1）
 *     apu.setDpcmSample(bytes, addr=0xC000)
 *     apu.connect(audioContext, {volume, destination, bufferSize, workletUrl})
 *                                 → Promise（AudioWorklet，失敗退 ScriptProcessor）
 *                                 ※ Chromium 在 file:// 下不允許用 blob: 載入 worklet 模組，
 *                                   會自動退回 ScriptProcessor；用 http(s) 開或傳 workletUrl
 *                                   （指向一份含 WORKLET_SRC 的 .js）就能走 AudioWorklet。
 *                                   apu.mode 會是 'audioworklet' 或 'scriptprocessor'。
 *     apu.disconnect()
 *     apu.reset()
 *     apu.state()                 內部狀態快照（測試用）
 *   NES.APU.mix(p1, p2, tri, noi, dmc) → 非線性混音純函式
 *   NES.APU.CPU_HZ / FRAME_HZ / CYCLES_PER_FRAME
 *   NES.APU.LENGTH_TABLE / DUTY / TRIANGLE_SEQ / NOISE_PERIOD_NTSC / DMC_RATE_NTSC
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};

  /* ---------------------------------------------------------------- 常數表 */

  var CPU_HZ = 1789773;                       // NTSC 2A03 [01 §4.2]
  var FRAME_HZ = 60.0988;                     // NTSC 影格率 [PLAN §1]
  var CYCLES_PER_FRAME = CPU_HZ / FRAME_HZ;   // 29780.5...

  // 長度計數器查表（NESdev APU Length Counter）
  var LENGTH_TABLE = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
  ];

  // 方波占空比序列 [01 §4.2]
  var DUTY = [
    [0, 1, 0, 0, 0, 0, 0, 0],   // 12.5%
    [0, 1, 1, 0, 0, 0, 0, 0],   // 25%
    [0, 1, 1, 1, 1, 0, 0, 0],   // 50%
    [1, 0, 0, 1, 1, 1, 1, 1]    // 25% 反相
  ];

  // 三角波 32 階梯波 [06 §1.3]
  var TRIANGLE_SEQ = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
  ];

  // 雜訊 16 段週期表（NTSC，CPU cycles）[01 §4.3 / 06 §1.4]
  var NOISE_PERIOD_NTSC = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
  var NOISE_PERIOD_PAL = [4, 8, 14, 30, 60, 88, 118, 148, 188, 236, 354, 472, 708, 944, 1890, 3778];

  // DMC 16 段取樣率（NTSC，CPU cycles / bit）[01 §4.4]
  var DMC_RATE_NTSC = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];

  // frame counter 分頻點（CPU cycles）[06 §1.7]
  var FC_STEPS_4 = [7457, 14913, 22371, 29829, 29830];
  var FC_STEPS_5 = [7457, 14913, 22371, 29829, 37281, 37282];

  /* ------------------------------------------------------------ 非線性混音 */

  // pulse_out = 95.88 / (8128/(p1+p2) + 100)
  // tnd_out   = 159.79 / (1/(t/8227 + n/12241 + d/22638) + 100)
  function mixFormula(p1, p2, tri, noi, dmc) {
    var ps = p1 + p2;
    var pulseOut = ps ? 95.88 / (8128 / ps + 100) : 0;
    var s = tri / 8227 + noi / 12241 + dmc / 22638;
    var tndOut = s ? 159.79 / (1 / s + 100) : 0;
    return pulseOut + tndOut;
  }

  // 查表（值與 mixFormula 完全相同，只是預先展開）
  var PULSE_TABLE = new Float32Array(31);
  for (var i = 0; i < 31; i++) PULSE_TABLE[i] = i ? 95.88 / (8128 / i + 100) : 0;
  var TND_TABLE = new Float32Array(16 * 16 * 128);   // index = tri*2048 + noi*128 + dmc
  (function () {
    for (var t = 0; t < 16; t++) {
      for (var n = 0; n < 16; n++) {
        for (var d = 0; d < 128; d++) {
          var s = t / 8227 + n / 12241 + d / 22638;
          TND_TABLE[t * 2048 + n * 128 + d] = s ? 159.79 / (1 / s + 100) : 0;
        }
      }
    }
  })();

  /* ------------------------------------------------------------------ 方波 */

  function Pulse(isCh1) {
    this.ch1 = !!isCh1;             // 方波 1 的掃頻負向要多 -1（one's complement）
    this.reset();
  }
  Pulse.prototype.reset = function () {
    this.enabled = false;
    this.duty = 0; this.halt = false; this.constVol = false; this.volParam = 0;
    this.envStart = false; this.envDivider = 0; this.envDecay = 0;
    this.sweepEnabled = false; this.sweepPeriod = 0; this.sweepNegate = false;
    this.sweepShift = 0; this.sweepReload = false; this.sweepDivider = 0;
    this.timer = 0; this.timerCounter = 0; this.phase = 0;
    this.length = 0; this.out = 0;
  };
  Pulse.prototype.sweepTarget = function () {
    var change = this.timer >> this.sweepShift;
    if (this.sweepNegate) change = this.ch1 ? -change - 1 : -change;
    var t = this.timer + change;
    return t < 0 ? 0 : t;
  };
  // 真機行為：只要「目標週期 > $7FF」就靜音，**即使掃頻沒啟用**。
  // 所以寫 $4001 = $00（shift=0）會讓 timer > $3FF 的低音消失；
  // NES 音樂驅動的標準慣例是寫 $08（negate=1, shift=0）來「關掉掃頻」。music.js 照此慣例。
  Pulse.prototype.muted = function () {
    return this.timer < 8 || this.sweepTarget() > 0x7FF;
  };
  Pulse.prototype.volume = function () {
    return this.constVol ? this.volParam : this.envDecay;
  };
  Pulse.prototype.updateOut = function () {
    this.out = (this.length > 0 && !this.muted() && DUTY[this.duty][this.phase]) ? this.volume() : 0;
  };
  Pulse.prototype.clockTimer = function () {          // 每個 APU cycle（CPU/2）
    if (--this.timerCounter < 0) {
      this.timerCounter = this.timer;
      this.phase = (this.phase + 1) & 7;
      this.updateOut();
    }
  };
  Pulse.prototype.clockEnvelope = function () {       // quarter frame
    if (this.envStart) {
      this.envStart = false;
      this.envDecay = 15;
      this.envDivider = this.volParam;
    } else if (--this.envDivider < 0) {
      this.envDivider = this.volParam;
      if (this.envDecay > 0) this.envDecay--;
      else if (this.halt) this.envDecay = 15;         // halt 位元同時是包絡 loop
    }
    this.updateOut();
  };
  Pulse.prototype.clockLength = function () {         // half frame
    if (!this.halt && this.length > 0) this.length--;
    this.updateOut();
  };
  Pulse.prototype.clockSweep = function () {          // half frame
    if (this.sweepDivider === 0 && this.sweepEnabled && this.sweepShift > 0 && !this.muted()) {
      this.timer = this.sweepTarget();
    }
    if (this.sweepDivider === 0 || this.sweepReload) {
      this.sweepDivider = this.sweepPeriod;
      this.sweepReload = false;
    } else {
      this.sweepDivider--;
    }
    this.updateOut();
  };
  Pulse.prototype.write = function (reg, v) {
    switch (reg) {
      case 0:
        this.duty = (v >> 6) & 3;
        this.halt = (v & 0x20) !== 0;
        this.constVol = (v & 0x10) !== 0;
        this.volParam = v & 15;
        break;
      case 1:
        this.sweepEnabled = (v & 0x80) !== 0;
        this.sweepPeriod = (v >> 4) & 7;
        this.sweepNegate = (v & 8) !== 0;
        this.sweepShift = v & 7;
        this.sweepReload = true;
        break;
      case 2:
        this.timer = (this.timer & 0x700) | (v & 0xFF);
        break;
      case 3:
        this.timer = (this.timer & 0xFF) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTH_TABLE[(v >> 3) & 31];
        this.phase = 0;
        this.envStart = true;
        break;
    }
    this.updateOut();
  };
  Pulse.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (!on) this.length = 0;
    this.updateOut();
  };

  /* ---------------------------------------------------------------- 三角波 */

  function Triangle() { this.reset(); }
  Triangle.prototype.reset = function () {
    this.enabled = false;
    this.control = false;          // = length halt，同時是 linear counter control
    this.linearReload = 0; this.linearReloadFlag = false; this.linear = 0;
    this.timer = 0; this.timerCounter = 0; this.phase = 0;
    this.length = 0;
    this.out = TRIANGLE_SEQ[0];    // 真機靜音時維持最後輸出值，不歸零 [01 §4.1]
  };
  Triangle.prototype.clockTimer = function () {       // 每個 CPU cycle
    if (--this.timerCounter < 0) {
      this.timerCounter = this.timer;
      if (this.length > 0 && this.linear > 0) {
        this.phase = (this.phase + 1) & 31;
        this.out = TRIANGLE_SEQ[this.phase];
      }
    }
  };
  Triangle.prototype.clockLinear = function () {      // quarter frame
    if (this.linearReloadFlag) this.linear = this.linearReload;
    else if (this.linear > 0) this.linear--;
    if (!this.control) this.linearReloadFlag = false;
  };
  Triangle.prototype.clockLength = function () {      // half frame
    if (!this.control && this.length > 0) this.length--;
  };
  Triangle.prototype.write = function (reg, v) {
    switch (reg) {
      case 0:
        this.control = (v & 0x80) !== 0;
        this.linearReload = v & 0x7F;
        break;
      case 2:
        this.timer = (this.timer & 0x700) | (v & 0xFF);
        break;
      case 3:
        this.timer = (this.timer & 0xFF) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTH_TABLE[(v >> 3) & 31];
        this.linearReloadFlag = true;
        break;
    }
  };
  Triangle.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (!on) this.length = 0;
  };

  /* ------------------------------------------------------------------ 雜訊 */

  function Noise() { this.reset(); }
  Noise.prototype.reset = function () {
    this.enabled = false;
    this.halt = false; this.constVol = false; this.volParam = 0;
    this.envStart = false; this.envDivider = 0; this.envDecay = 0;
    this.mode = false;                       // false = 長模式(32767)、true = 短模式(93/31)
    this.period = NOISE_PERIOD_NTSC[0];
    this.periodIndex = 0;
    this.timerCounter = 0;
    this.lfsr = 1;                           // 15-bit，初值非 0
    this.length = 0;
    this.out = 0;
  };
  Noise.prototype.volume = function () { return this.constVol ? this.volParam : this.envDecay; };
  Noise.prototype.updateOut = function () {
    this.out = (this.length > 0 && !(this.lfsr & 1)) ? this.volume() : 0;
  };
  Noise.prototype.clockTimer = function () {          // 每個 CPU cycle（週期表單位為 CPU cycle）
    if (--this.timerCounter < 0) {
      this.timerCounter = this.period - 1;   // 週期表為「每 N 個 CPU cycle 移位一次」
      var fb = (this.lfsr ^ (this.lfsr >> (this.mode ? 6 : 1))) & 1;
      this.lfsr = ((this.lfsr >> 1) | (fb << 14)) & 0x7FFF;
      this.updateOut();
    }
  };
  Noise.prototype.clockEnvelope = Pulse.prototype.clockEnvelope;
  Noise.prototype.clockLength = function () {
    if (!this.halt && this.length > 0) this.length--;
    this.updateOut();
  };
  Noise.prototype.write = function (reg, v, table) {
    switch (reg) {
      case 0:
        this.halt = (v & 0x20) !== 0;
        this.constVol = (v & 0x10) !== 0;
        this.volParam = v & 15;
        break;
      case 2:
        this.mode = (v & 0x80) !== 0;
        this.periodIndex = v & 15;
        this.period = table[this.periodIndex];
        break;
      case 3:
        if (this.enabled) this.length = LENGTH_TABLE[(v >> 3) & 31];
        this.envStart = true;
        break;
    }
    this.updateOut();
  };
  Noise.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (!on) this.length = 0;
    this.updateOut();
  };

  /* ------------------------------------------------------------- DPCM / DMC */

  function DMC(apu) { this.apu = apu; this.reset(); }
  DMC.prototype.reset = function () {
    this.enabled = false;
    this.irqEnable = false; this.loop = false; this.irqFlag = false;
    this.rate = DMC_RATE_NTSC[0];
    this.rateIndex = 0;
    this.timerCounter = 0;
    this.level = 0;                 // 7-bit 輸出位準 0..127
    this.sampleAddr = 0xC000; this.sampleLen = 1;
    this.curAddr = 0xC000; this.bytesRemaining = 0;
    this.shift = 0; this.bitsRemaining = 8;
    this.silence = true;
    this.bufferByte = 0; this.bufferFilled = false;
    this.out = 0;
  };
  DMC.prototype.restart = function () {
    this.curAddr = this.sampleAddr;
    this.bytesRemaining = this.sampleLen;
  };
  DMC.prototype.fetch = function () {
    if (this.bufferFilled || this.bytesRemaining === 0) return;
    this.bufferByte = this.apu.dmcRead(this.curAddr);
    this.bufferFilled = true;
    this.curAddr = this.curAddr + 1 > 0xFFFF ? 0x8000 : this.curAddr + 1;
    this.bytesRemaining--;
    if (this.bytesRemaining === 0) {
      if (this.loop) this.restart();
      else if (this.irqEnable) this.irqFlag = true;
    }
  };
  DMC.prototype.clockTimer = function () {            // 每個 CPU cycle
    if (--this.timerCounter < 0) {
      this.timerCounter = this.rate - 1;     // 取樣率表為「每 N 個 CPU cycle 輸出 1 bit」
      if (!this.silence) {
        // 1-bit 差分：bit=1 → +2、bit=0 → −2，夾在 0..127 [01 §4.4]
        if (this.shift & 1) { if (this.level <= 125) this.level += 2; }
        else { if (this.level >= 2) this.level -= 2; }
      }
      this.shift >>= 1;
      if (--this.bitsRemaining === 0) {
        this.bitsRemaining = 8;
        if (this.bufferFilled) { this.silence = false; this.shift = this.bufferByte; this.bufferFilled = false; }
        else this.silence = true;
      }
      this.fetch();
      this.out = this.level;
    }
  };
  DMC.prototype.write = function (reg, v, table) {
    switch (reg) {
      case 0:
        this.irqEnable = (v & 0x80) !== 0;
        this.loop = (v & 0x40) !== 0;
        this.rateIndex = v & 15;
        this.rate = table[this.rateIndex];
        if (!this.irqEnable) this.irqFlag = false;
        break;
      case 1:
        this.level = v & 0x7F;
        this.out = this.level;
        break;
      case 2:
        this.sampleAddr = 0xC000 + (v & 0xFF) * 64;     // %11AAAAAA.AA000000
        break;
      case 3:
        this.sampleLen = (v & 0xFF) * 16 + 1;           // %LLLL.LLLL0001
        break;
    }
  };
  DMC.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (!on) { this.bytesRemaining = 0; }
    else if (this.bytesRemaining === 0) { this.restart(); this.fetch(); }
    this.irqFlag = this.irqFlag && on;
  };

  /* -------------------------------------------------------------- APU 本體 */

  function APU(opts) {
    opts = opts || {};
    this.sampleRate = opts.sampleRate || 44100;
    this.region = opts.region === 'pal' ? 'pal' : 'ntsc';
    this.noiseTable = this.region === 'pal' ? NOISE_PERIOD_PAL : NOISE_PERIOD_NTSC;
    this.dmcTable = DMC_RATE_NTSC;
    this.highpassHz = opts.highpass === undefined ? 90 : opts.highpass;
    this.lowpassHz = opts.lowpass === undefined ? 14000 : opts.lowpass;

    this.pulse1 = new Pulse(true);
    this.pulse2 = new Pulse(false);
    this.triangle = new Triangle();
    this.noise = new Noise();
    this.dmc = new DMC(this);
    this.dmcMem = new Uint8Array(0x4000);      // $C000..$FFFF

    this.reset();
    this._initFilters();
    this._node = null; this._ctx = null; this._blobUrl = null; this._gain = null;
  }

  APU.prototype._initFilters = function () {
    // 一階高通（去直流，真機約 90Hz）+ 一階低通（真機約 14kHz）
    var sr = this.sampleRate;
    this.hpA = this.highpassHz > 0 ? Math.exp(-2 * Math.PI * this.highpassHz / sr) : 0;
    this.lpA = this.lowpassHz > 0 ? Math.exp(-2 * Math.PI * this.lowpassHz / sr) : 0;
    this.hpPrevIn = 0; this.hpPrevOut = 0; this.lpPrev = 0;
  };

  APU.prototype.reset = function () {
    this.pulse1.reset(); this.pulse2.reset(); this.triangle.reset();
    this.noise.reset(); this.dmc.reset();
    this.cycle = 0;                 // frame counter 內的 CPU cycle
    this.totalCycles = 0;
    this.apuCycleParity = 0;
    this.fcMode5 = false;
    this.fcIrqInhibit = false;
    this.frameIrq = false;
    this.fcStepIndex = 0;
    this.quarterCount = 0;          // 統計：240Hz 節拍數
    this.halfCount = 0;
    this.frameCount = 0;
    this._cycleCarry = 0;
    this._frameSampleCarry = 0;
    this.hpPrevIn = 0; this.hpPrevOut = 0; this.lpPrev = 0;
  };

  APU.prototype.dmcRead = function (addr) {
    var i = addr - 0xC000;
    if (i < 0 || i >= this.dmcMem.length) return 0;
    return this.dmcMem[i];
  };

  // 測試用：直接設定 LFSR 種子（真機不可寫，僅供驗證短模式的 93 / 31 兩條循環）
  APU.prototype.setNoiseLfsr = function (v) {
    this.noise.lfsr = v & 0x7FFF;
    this.noise.updateOut();
    return this;
  };

  APU.prototype.setDpcmSample = function (bytes, addr) {
    addr = addr === undefined ? 0xC000 : addr;
    if (addr < 0xC000) throw new Error('DPCM 取樣必須放在 $C000 以上（真機限制）');
    var off = addr - 0xC000;
    for (var i = 0; i < bytes.length && off + i < this.dmcMem.length; i++) {
      this.dmcMem[off + i] = bytes[i] & 0xFF;
    }
    return this;
  };

  /* --- 暫存器 --- */

  APU.prototype.write = function (addr, val) {
    addr = addr | 0; val = val & 0xFF;
    if (addr < 0x4000 || addr > 0x4017) return this;
    if (addr <= 0x4003) this.pulse1.write(addr - 0x4000, val);
    else if (addr <= 0x4007) this.pulse2.write(addr - 0x4004, val);
    else if (addr <= 0x400B) this.triangle.write(addr - 0x4008, val);
    else if (addr <= 0x400F) this.noise.write(addr - 0x400C, val, this.noiseTable);
    else if (addr <= 0x4013) this.dmc.write(addr - 0x4010, val, this.dmcTable);
    else if (addr === 0x4015) {
      this.pulse1.setEnabled((val & 1) !== 0);
      this.pulse2.setEnabled((val & 2) !== 0);
      this.triangle.setEnabled((val & 4) !== 0);
      this.noise.setEnabled((val & 8) !== 0);
      this.dmc.setEnabled((val & 16) !== 0);
    } else if (addr === 0x4017) {
      this.fcMode5 = (val & 0x80) !== 0;
      this.fcIrqInhibit = (val & 0x40) !== 0;
      if (this.fcIrqInhibit) this.frameIrq = false;
      this.cycle = 0;
      this.fcStepIndex = 0;
      if (this.fcMode5) { this.clockQuarter(); this.clockHalf(); }
    }
    return this;
  };

  APU.prototype.read = function (addr) {
    if (addr !== 0x4015) return 0;
    var v = 0;
    if (this.pulse1.length > 0) v |= 1;
    if (this.pulse2.length > 0) v |= 2;
    if (this.triangle.length > 0) v |= 4;
    if (this.noise.length > 0) v |= 8;
    if (this.dmc.bytesRemaining > 0) v |= 16;
    if (this.frameIrq) v |= 0x40;
    if (this.dmc.irqFlag) v |= 0x80;
    this.frameIrq = false;
    return v;
  };

  /* --- frame counter --- */

  APU.prototype.clockQuarter = function () {
    this.pulse1.clockEnvelope();
    this.pulse2.clockEnvelope();
    this.noise.clockEnvelope();
    this.triangle.clockLinear();
    this.quarterCount++;
  };
  APU.prototype.clockHalf = function () {
    this.pulse1.clockLength(); this.pulse1.clockSweep();
    this.pulse2.clockLength(); this.pulse2.clockSweep();
    this.triangle.clockLength();
    this.noise.clockLength();
    this.halfCount++;
  };
  APU.prototype._clockFrameCounter = function () {
    var c = ++this.cycle;
    if (!this.fcMode5) {
      if (c === FC_STEPS_4[0]) this.clockQuarter();
      else if (c === FC_STEPS_4[1]) { this.clockQuarter(); this.clockHalf(); }
      else if (c === FC_STEPS_4[2]) this.clockQuarter();
      else if (c === FC_STEPS_4[3]) {
        this.clockQuarter(); this.clockHalf();
        if (!this.fcIrqInhibit) this.frameIrq = true;
      } else if (c >= FC_STEPS_4[4]) { this.cycle = 0; this.frameCount++; }
    } else {
      if (c === FC_STEPS_5[0]) this.clockQuarter();
      else if (c === FC_STEPS_5[1]) { this.clockQuarter(); this.clockHalf(); }
      else if (c === FC_STEPS_5[2]) this.clockQuarter();
      else if (c === FC_STEPS_5[4]) { this.clockQuarter(); this.clockHalf(); }
      else if (c >= FC_STEPS_5[5]) { this.cycle = 0; this.frameCount++; }
    }
  };

  /* --- 時間推進 --- */

  APU.prototype.clockOne = function () {
    this.triangle.clockTimer();
    this.noise.clockTimer();
    this.dmc.clockTimer();
    if ((this.apuCycleParity ^= 1) === 0) {
      this.pulse1.clockTimer();
      this.pulse2.clockTimer();
    }
    this._clockFrameCounter();
    this.totalCycles++;
  };

  // 只推進時間、不產生樣本（測試 / 快轉用）
  APU.prototype.clock = function (n) {
    for (var i = 0; i < n; i++) this.clockOne();
    return this;
  };

  APU.prototype.rawMix = function () {
    return PULSE_TABLE[this.pulse1.out + this.pulse2.out] +
      TND_TABLE[this.triangle.out * 2048 + this.noise.out * 128 + this.dmc.out];
  };
  APU.prototype.mix = APU.prototype.rawMix;

  APU.prototype._filter = function (x) {
    var y = x;
    if (this.hpA) {
      y = this.hpA * (this.hpPrevOut + x - this.hpPrevIn);
      this.hpPrevIn = x; this.hpPrevOut = y;
    }
    if (this.lpA) {
      y = this.lpPrev + (1 - this.lpA) * (y - this.lpPrev);
      this.lpPrev = y;
    }
    return y;
  };

  // 離線渲染：決定性（同起始狀態 + 同暫存器寫入 → 同輸出）
  APU.prototype.render = function (nSamples, outBuf) {
    var out = outBuf || new Float32Array(nSamples);
    var cps = CPU_HZ / this.sampleRate;
    for (var i = 0; i < nSamples; i++) {
      this._cycleCarry += cps;
      var k = Math.floor(this._cycleCarry);
      this._cycleCarry -= k;
      var acc = 0;
      for (var c = 0; c < k; c++) {
        this.clockOne();
        acc += this.rawMix();
      }
      out[i] = this._filter(k ? acc / k : this.rawMix());
    }
    return out;
  };

  APU.prototype.samplesPerFrame = function () { return this.sampleRate / FRAME_HZ; };

  // 推進一個 NTSC 影格；內含 4 次 240Hz quarter frame。回傳該幀的樣本。
  APU.prototype.tick = function () {
    this._frameSampleCarry += this.sampleRate / FRAME_HZ;
    var n = Math.floor(this._frameSampleCarry);
    this._frameSampleCarry -= n;
    return this.render(n);
  };

  /* --- 即時播放 --- */

  var WORKLET_SRC =
    "class NesApuPlayer extends AudioWorkletProcessor{" +
    "constructor(){super();this.q=[];this.pos=0;this.qLen=0;this.asked=0;" +
    "this.port.onmessage=e=>{const d=e.data;if(d&&d.pcm){this.q.push(d.pcm);this.qLen+=d.pcm.length;this.asked=0;}" +
    "else if(d&&d.cmd==='flush'){this.q=[];this.pos=0;this.qLen=0;}};}" +
    "process(inputs,outputs){const out=outputs[0][0];const n=out.length;let i=0;" +
    "while(i<n){if(!this.q.length){while(i<n)out[i++]=0;break;}" +
    "const b=this.q[0];const take=Math.min(n-i,b.length-this.pos);" +
    "for(let k=0;k<take;k++)out[i+k]=b[this.pos+k];" +
    "i+=take;this.pos+=take;this.qLen-=take;" +
    "if(this.pos>=b.length){this.q.shift();this.pos=0;}}" +
    "const low=sampleRate*0.06,hi=sampleRate*0.12;" +
    "if(this.qLen<low&&!this.asked){this.asked=1;this.port.postMessage({need:Math.ceil(hi-this.qLen)});}" +
    "return true;}}" +
    "registerProcessor('nes-apu-player',NesApuPlayer);";

  APU.prototype.connect = function (ctx, opts) {
    opts = opts || {};
    var self = this;
    this.disconnect();
    this._ctx = ctx;
    this.sampleRate = ctx.sampleRate;
    this._initFilters();
    var gain = ctx.createGain();
    gain.gain.value = opts.volume === undefined ? 1 : opts.volume;
    gain.connect(opts.destination || ctx.destination);
    this._gain = gain;

    function fallback() {
      var size = opts.bufferSize || 1024;
      var sp = ctx.createScriptProcessor(size, 0, 1);
      sp.onaudioprocess = function (e) {
        var ch = e.outputBuffer.getChannelData(0);
        self.render(ch.length, ch);
      };
      sp.connect(gain);
      self._node = sp;
      self.mode = 'scriptprocessor';
      return self;
    }

    if (!ctx.audioWorklet || (!opts.workletUrl && (typeof Blob === 'undefined' || typeof URL === 'undefined'))) {
      return Promise.resolve(fallback());
    }
    var url;
    if (opts.workletUrl) {
      url = opts.workletUrl;
    } else {
      url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      this._blobUrl = url;
    }
    return ctx.audioWorklet.addModule(url).then(function () {
      var node = new global.AudioWorkletNode(ctx, 'nes-apu-player', { numberOfInputs: 0, outputChannelCount: [1] });
      node.port.onmessage = function (e) {
        var d = e.data;
        if (d && d.need > 0) node.port.postMessage({ pcm: self.render(d.need) });
      };
      node.connect(gain);
      // 先灌一點前置緩衝
      node.port.postMessage({ pcm: self.render(Math.ceil(ctx.sampleRate * 0.1)) });
      self._node = node;
      self.mode = 'audioworklet';
      return self;
    })['catch'](function () { return fallback(); });
  };

  APU.prototype.disconnect = function () {
    if (this._node) {
      try { this._node.disconnect(); } catch (e) { }
      if (this._node.onaudioprocess) this._node.onaudioprocess = null;
      if (this._node.port) this._node.port.onmessage = null;
      this._node = null;
    }
    if (this._gain) { try { this._gain.disconnect(); } catch (e) { } this._gain = null; }
    if (this._blobUrl) { try { URL.revokeObjectURL(this._blobUrl); } catch (e) { } this._blobUrl = null; }
    this.mode = null;
    this._ctx = null;
    return this;
  };

  /* --- 測試用狀態快照 --- */

  APU.prototype.state = function () {
    function p(c) {
      return {
        enabled: c.enabled, duty: c.duty, halt: c.halt, constVol: c.constVol,
        volParam: c.volParam, volume: c.volume(), envDecay: c.envDecay,
        timer: c.timer, phase: c.phase, length: c.length, out: c.out,
        muted: c.muted(), sweepEnabled: c.sweepEnabled, sweepNegate: c.sweepNegate,
        sweepShift: c.sweepShift, sweepPeriod: c.sweepPeriod, sweepTarget: c.sweepTarget()
      };
    }
    return {
      sampleRate: this.sampleRate,
      totalCycles: this.totalCycles,
      cycle: this.cycle,
      quarterCount: this.quarterCount,
      halfCount: this.halfCount,
      frameCount: this.frameCount,
      fcMode5: this.fcMode5,
      frameIrq: this.frameIrq,
      pulse1: p(this.pulse1),
      pulse2: p(this.pulse2),
      triangle: {
        enabled: this.triangle.enabled, timer: this.triangle.timer, phase: this.triangle.phase,
        length: this.triangle.length, linear: this.triangle.linear,
        linearReload: this.triangle.linearReload, control: this.triangle.control,
        out: this.triangle.out
      },
      noise: {
        enabled: this.noise.enabled, mode: this.noise.mode, periodIndex: this.noise.periodIndex,
        period: this.noise.period, lfsr: this.noise.lfsr, length: this.noise.length,
        volume: this.noise.volume(), envDecay: this.noise.envDecay, out: this.noise.out
      },
      dmc: {
        enabled: this.dmc.enabled, rateIndex: this.dmc.rateIndex, rate: this.dmc.rate,
        level: this.dmc.level, bytesRemaining: this.dmc.bytesRemaining,
        bitsRemaining: this.dmc.bitsRemaining, silence: this.dmc.silence,
        loop: this.dmc.loop, irqFlag: this.dmc.irqFlag, out: this.dmc.out
      },
      mix: this.rawMix()
    };
  };

  /* ------------------------------------------------------------------ 匯出 */

  NES.APU = {
    create: function (opts) { return new APU(opts); },
    mix: mixFormula,
    CPU_HZ: CPU_HZ,
    FRAME_HZ: FRAME_HZ,
    CYCLES_PER_FRAME: CYCLES_PER_FRAME,
    LENGTH_TABLE: LENGTH_TABLE,
    DUTY: DUTY,
    TRIANGLE_SEQ: TRIANGLE_SEQ,
    NOISE_PERIOD_NTSC: NOISE_PERIOD_NTSC,
    NOISE_PERIOD_PAL: NOISE_PERIOD_PAL,
    WORKLET_SRC: WORKLET_SRC,
    DMC_RATE_NTSC: DMC_RATE_NTSC,
    PULSE_TABLE: PULSE_TABLE,
    VERSION: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
