/*
 * engine/music.js — FamiTracker 式音樂 / 音效驅動（每幀 tick 一次，把 pattern 轉成 APU 暫存器寫入）
 * classic script / IIFE / 零相依（只在 play() 時需要一個 NES.APU 實例；不 require、不 import）。
 *
 * 規格來源：docs/research/06 §1.6（音效搶聲道）、§1.7（每幀 = 最小時間單位、speed）、
 *           §2.1 琶音、§2.3 顫音、§2.5 占空比包絡、§2.7 雜訊鼓；docs/research/01 §4.6（driver 架構）。
 *
 * ============================== song 格式 ==============================
 * song = {
 *   name:  'xxx',
 *   speed: 6,                  // 每 row 幾幀（NTSC 60Hz；BPM = 3600 / (speed × rowsPerBeat)）
 *   rows:  16,                 // 每個 pattern 的 row 數（可被 pattern 自身長度覆寫）
 *   instruments: { name: inst },
 *   patterns: [ pattern, ... ],
 *   order:  [ 0, 1, 2, ... ]   // 每個元素 = patterns 索引，或 {p1:0,p2:1,tri:0,noi:2,dmc:0} 逐軌選 pattern
 *   loop:   0,                 // 循環回到哪一個 order 索引（undefined = 回 0）
 *   dpcm:   { name: {data:[...bytes], rate:0..15, loop:false} }   // 選用
 * }
 *
 * pattern = { p1:[row,...], p2:[...], tri:[...], noi:[...], dmc:[...] }
 *   軌名固定：p1 / p2 / tri / noi / dmc（對應 $4000 / $4004 / $4008 / $400C / $4010）
 *
 * row = null（不變）或 {
 *   note : 'A-4' | 'C#5' | midi 數字 | '---'（放開）| '==='（立即切音）
 *          ★ noi 軌的 note = 雜訊週期索引 0..15（NTSC 16 段週期表）
 *          ★ dmc 軌的 note = song.dpcm 的取樣名稱
 *   inst : 樂器名（吃 song.instruments）
 *   vol  : 0..15（三角波無效，真機沒有音量）
 *   arp  : [0,4,7]  琶音：每幀換一個半音偏移（§2.1）
 *   vib  : {rate, depth, delay}  顫音：rate = 每幀相位增量(64 為一圈)、depth = timer 偏移量、delay = 延遲幀數
 *   duty : 0..3     占空比（方波）；noi 軌則是 0/1 的 LFSR 長短模式
 *   cut  : n        n 幀後自動切音（§4 音效 / 斷奏用）
 *   stop : true     停止整首曲子
 * }
 *
 * instrument = {
 *   vol:[...], volLoop:i,      // 每幀音量包絡 0..15（與 row 的 vol 相乘後除 15）
 *   duty:[...], dutyLoop:i,    // 每幀占空比包絡（§2.5）
 *   arp:[...], arpLoop:i,      // 每幀半音偏移
 *   pitch:[...], pitchLoop:i   // 每幀 timer 偏移（正值 = 音更低）
 * }
 *   包絡跑完後：有 xxxLoop → 從該索引循環；沒有 → 停在最後一格。
 *
 * ============================== sfx 格式 ==============================
 * sfx = {
 *   priority: 5,                       // 數字大者可搶下數字小者佔用的聲道
 *   data: { p2:[frame,...], noi:[...] } // 每個元素 = 一幀，欄位與 row 相同（絕對值、不是 pattern）
 * }                                     // frame 為 null 表示沿用上一幀；{off:true} 表示該軌結束
 *
 * ============================== API ==============================
 *   NES.Music.create(apu) → driver（測試用；不碰全域狀態）
 *   NES.Music.attach(apu) → 設定預設 driver，之後 NES.Music.play/stop/sfx/tick/define 直接可用
 *   driver.define(name, sfx)
 *   driver.play(song, {loop:true})
 *   driver.stop()
 *   driver.sfx(name, {priority, channels})   channels = ['p1'] 之類，覆寫 sfx 預設佔用的軌
 *   driver.tick()                            每幀呼叫一次（遊戲 update 裡）
 *   driver.state()                           測試用狀態快照
 *   NES.Music.DEMO = { song, sfx:{jump, coin} }   ← 原創短曲 8 小節 + 2 個原創音效
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};

  var CPU_HZ = 1789773;
  var CH_NAMES = ['p1', 'p2', 'tri', 'noi', 'dmc'];
  var CH_BASE = [0x4000, 0x4004, 0x4008, 0x400C, 0x4010];
  var CH_INDEX = { p1: 0, p2: 1, tri: 2, noi: 3, dmc: 4 };
  var LEN_IDX = 1;            // LENGTH_TABLE[1] = 254（halt=1 時不遞減，只是要 >0 才會發聲）
  var SWEEP_OFF = 0x08;       // negate=1, shift=0 → 關掉掃頻且不會觸發「目標週期溢位靜音」

  /* --------------------------------------------------------------- 音名表 */

  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteToMidi(n) {
    if (typeof n === 'number') return n;
    if (typeof n !== 'string') return null;
    var s = n.toUpperCase();
    var base = SEMI[s.charAt(0)];
    if (base === undefined) return null;
    var i = 1, acc = 0;
    if (s.charAt(1) === '#' || s.charAt(1) === '+') { acc = 1; i = 2; }
    else if (s.charAt(1) === 'B' || s.charAt(1) === '-') { if (s.charAt(1) === 'B') acc = -1; i = 2; }
    var oct = parseInt(s.substring(i), 10);
    if (isNaN(oct)) return null;
    return (oct + 1) * 12 + base + acc;      // C-4 = 60
  }

  function freqOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // 方波 / 雜訊：f = CPU/(16*(t+1))；三角波：f = CPU/(32*(t+1))
  var PULSE_PERIOD = new Int16Array(128);
  var TRI_PERIOD = new Int16Array(128);
  (function () {
    for (var m = 0; m < 128; m++) {
      var f = freqOf(m);
      var p = Math.round(CPU_HZ / (16 * f)) - 1;
      PULSE_PERIOD[m] = p < 0 ? 0 : (p > 0x7FF ? 0x7FF : p);
      var t = Math.round(CPU_HZ / (32 * f)) - 1;
      TRI_PERIOD[m] = t < 0 ? 0 : (t > 0x7FF ? 0x7FF : t);
    }
  })();

  /* ------------------------------------------------------------- 包絡取值 */

  function envAt(arr, loop, frame) {
    if (!arr || !arr.length) return null;
    if (frame < arr.length) return arr[frame];
    if (loop === undefined || loop === null || loop >= arr.length) return arr[arr.length - 1];
    var span = arr.length - loop;
    return arr[loop + ((frame - arr.length) % span)];
  }

  /* --------------------------------------------------------------- 聲道態 */

  function ChannelState(i) {
    this.i = i;
    this.name = CH_NAMES[i];
    this.base = CH_BASE[i];
    this.reset();
  }
  ChannelState.prototype.reset = function () {
    this.on = false;            // 是否正在發聲
    this.midi = null;           // 方波 / 三角波：MIDI 音高；雜訊：週期索引；DMC：取樣名
    this.inst = null;
    this.rowVol = 15;
    this.duty = 1;
    this.arp = null;
    this.vib = null;
    this.cut = -1;
    this.noteFrame = 0;         // 觸發後經過的幀數
    this.vibPhase = 0;
    this.trigger = false;       // 這一幀要不要重新觸發（重設相位 / 包絡）
    this.force = false;         // 被音效還回來後，強制重寫全部暫存器
    this.lastCtl = -1; this.lastLo = -1; this.lastHi = -1; this.lastSweep = -1;
    this.outVol = 0; this.outPeriod = 0; this.outDuty = 0;
  };

  /* --------------------------------------------------------------- driver */

  function Driver(apu) {
    this.apu = apu;
    this.song = null;
    this.playing = false;
    this.loopSong = true;
    this.speed = 6;
    this.orderIndex = 0;
    this.row = 0;
    this.rowFrame = 0;
    this.frame = 0;
    this.rowsPlayed = 0;
    this.enableMask = 0;
    this.sfxDefs = {};
    this.active = [];           // 進行中的音效
    this.sfxSeq = 0;
    this.ch = [];
    for (var i = 0; i < 5; i++) this.ch.push(new ChannelState(i));
    this.dpcmMap = {};
    this.log = null;
  }

  // record(true) 之後，driver 寫進 APU 的每一筆都會記在 driver.log：[addr, val, 'music'|'sfx']
  Driver.prototype.record = function (on) { this.log = on ? [] : null; return this; };
  Driver.prototype._w = function (addr, val) {
    if (this.log) this.log.push([addr, val & 0xFF, this._src || 'music']);
    if (this.apu) this.apu.write(addr, val & 0xFF);
  };
  Driver.prototype._enable = function (i, on) {
    var m = on ? (this.enableMask | (1 << i)) : (this.enableMask & ~(1 << i));
    if (m !== this.enableMask) { this.enableMask = m; this._w(0x4015, m); }
  };

  /* --- 音效定義 --- */

  Driver.prototype.define = function (name, sfx) {
    if (!sfx || !sfx.data) throw new Error('sfx 需要 {priority, data:{軌名:[每幀...]}}：' + name);
    this.sfxDefs[name] = sfx;
    return this;
  };

  Driver.prototype.sfx = function (name, opts) {
    opts = opts || {};
    var def = typeof name === 'string' ? this.sfxDefs[name] : name;
    if (!def) throw new Error('未定義的音效：' + name);
    var priority = opts.priority === undefined ? (def.priority || 0) : opts.priority;
    var srcNames = Object.keys(def.data);
    var dstNames = opts.channels || def.channels || srcNames;
    if (typeof dstNames === 'string') dstNames = [dstNames];

    var inst = { name: (typeof name === 'string' ? name : '(inline)'), priority: priority, id: ++this.sfxSeq, chans: [] };
    for (var k = 0; k < srcNames.length; k++) {
      var dst = dstNames[k] || srcNames[k];
      var ci = CH_INDEX[dst];
      if (ci === undefined) throw new Error('未知聲道：' + dst);
      inst.chans.push({ ci: ci, frames: def.data[srcNames[k]], pos: 0, st: null, done: false });
    }
    // 同聲道上：優先權 >= 現有者才搶得到；搶不到的軌就不播
    var keep = [];
    for (var a = 0; a < this.active.length; a++) {
      var other = this.active[a], survive = [];
      for (var c = 0; c < other.chans.length; c++) {
        var taken = false;
        for (var m = 0; m < inst.chans.length; m++) {
          if (inst.chans[m].ci === other.chans[c].ci) {
            if (priority >= other.priority) taken = true;
            else inst.chans[m].blocked = true;
          }
        }
        if (!taken) survive.push(other.chans[c]);
      }
      if (survive.length) { other.chans = survive; keep.push(other); }
      else this._releaseNone(other);
    }
    this.active = keep;
    inst.chans = inst.chans.filter(function (c) { return !c.blocked; });
    if (inst.chans.length) this.active.push(inst);
    return inst;
  };

  Driver.prototype._releaseNone = function () { /* 被完全搶走的音效不需要額外處理 */ };

  Driver.prototype.stopSfx = function () {
    for (var i = 0; i < this.active.length; i++) {
      for (var c = 0; c < this.active[i].chans.length; c++) this._restore(this.active[i].chans[c].ci);
    }
    this.active = [];
    return this;
  };

  Driver.prototype._restore = function (ci) {
    var ch = this.ch[ci];
    ch.force = true;
    ch.lastCtl = ch.lastLo = ch.lastHi = ch.lastSweep = -1;
    if (!ch.on) this._enable(ci, false);
  };

  Driver.prototype.owner = function (ci) {
    for (var i = 0; i < this.active.length; i++) {
      for (var c = 0; c < this.active[i].chans.length; c++) {
        if (this.active[i].chans[c].ci === ci) return this.active[i];
      }
    }
    return null;
  };

  /* --- 播放控制 --- */

  Driver.prototype.play = function (song, opts) {
    opts = opts || {};
    this.song = song;
    this.playing = true;
    this.loopSong = opts.loop === undefined ? true : !!opts.loop;
    this.speed = song.speed || 6;
    this.orderIndex = opts.from || 0;
    this.row = 0;
    this.rowFrame = 0;
    this.rowsPlayed = 0;
    for (var i = 0; i < 5; i++) { this.ch[i].reset(); }
    this.enableMask = 0;
    this._w(0x4015, 0);
    this._w(0x4017, 0x40);             // 4-step 模式、關掉 frame IRQ
    // 載入 DPCM 取樣（$C000 起，64 bytes 對齊）
    this.dpcmMap = {};
    if (song.dpcm && this.apu && this.apu.setDpcmSample) {
      var addr = 0xC000;
      for (var n in song.dpcm) {
        if (!Object.prototype.hasOwnProperty.call(song.dpcm, n)) continue;
        var s = song.dpcm[n];
        var bytes = s.data || s;
        this.apu.setDpcmSample(bytes, addr);
        this.dpcmMap[n] = {
          addrReg: (addr - 0xC000) / 64,
          lenReg: Math.max(0, Math.ceil((bytes.length - 1) / 16)),
          rate: s.rate === undefined ? 15 : s.rate,
          loop: !!s.loop
        };
        addr += Math.ceil(bytes.length / 64) * 64;
      }
    }
    return this;
  };

  Driver.prototype.stop = function () {
    this.playing = false;
    for (var i = 0; i < 5; i++) { this.ch[i].on = false; this.ch[i].midi = null; }
    this.enableMask = 0;
    this._w(0x4015, 0);
    return this;
  };

  /* --- 取 pattern --- */

  Driver.prototype._patternFor = function (chName) {
    var song = this.song;
    if (!song || !song.order || !song.order.length) return null;
    var entry = song.order[this.orderIndex % song.order.length];
    var pi = (entry !== null && typeof entry === 'object') ? entry[chName] : entry;
    if (pi === undefined || pi === null) return null;
    var pat = song.patterns[pi];
    return pat ? (pat[chName] || null) : null;
  };

  Driver.prototype.rowsInPattern = function () {
    var song = this.song, max = 0;
    for (var i = 0; i < CH_NAMES.length; i++) {
      var a = this._patternFor(CH_NAMES[i]);
      if (a && a.length > max) max = a.length;
    }
    return max || (song && song.rows) || 16;
  };

  /* --- 每幀 --- */

  Driver.prototype.tick = function () {
    this.frame++;
    if (this.playing) {
      if (this.rowFrame === 0) this._readRow();
      this._advanceChannels();
      this.rowFrame++;
      if (this.rowFrame >= this.speed) {
        this.rowFrame = 0;
        this.row++;
        this.rowsPlayed++;
        if (this.row >= this.rowsInPattern()) {
          this.row = 0;
          this.orderIndex++;
          if (this.orderIndex >= this.song.order.length) {
            if (this.loopSong) this.orderIndex = this.song.loop || 0;
            else { this.stop(); }
          }
        }
      }
    }
    this._writeMusic();
    this._advanceSfx();
    return this;
  };

  Driver.prototype._readRow = function () {
    for (var i = 0; i < 5; i++) {
      var arr = this._patternFor(CH_NAMES[i]);
      var r = arr ? arr[this.row] : null;
      if (!r) continue;
      this._applyRow(this.ch[i], r);
    }
  };

  Driver.prototype._applyRow = function (ch, r) {
    if (r.stop) { this.playing = false; this.stop(); return; }
    if (r.inst !== undefined) ch.inst = r.inst;
    if (r.vol !== undefined) ch.rowVol = r.vol;
    if (r.duty !== undefined) ch.duty = r.duty;
    if (r.arp !== undefined) ch.arp = r.arp;
    if (r.vib !== undefined) { ch.vib = r.vib; ch.vibPhase = 0; }
    ch.cut = r.cut === undefined ? -1 : r.cut;
    if (r.note !== undefined && r.note !== null) {
      if (r.note === '---' || r.note === 'off') { ch.on = false; }
      else if (r.note === '===' || r.note === 'cut') { ch.on = false; ch.midi = null; }
      else {
        if (ch.i === 3) ch.midi = r.note | 0;               // 雜訊：週期索引
        else if (ch.i === 4) ch.midi = r.note;              // DMC：取樣名
        else {
          var m = noteToMidi(r.note);
          if (m === null) throw new Error('無法解析音名：' + r.note);
          ch.midi = m;
        }
        ch.on = true;
        ch.trigger = true;
        ch.noteFrame = 0;
        ch.vibPhase = 0;
      }
    }
  };

  // 把每一軌的「這一幀該有的音高 / 音量 / 占空比」算出來（不論有沒有被音效搶走，狀態都要往前走）
  Driver.prototype._advanceChannels = function () {
    var song = this.song;
    for (var i = 0; i < 5; i++) {
      var ch = this.ch[i];
      if (ch.cut >= 0 && ch.noteFrame >= ch.cut) { ch.on = false; ch.cut = -1; }
      if (!ch.on) { ch.outVol = 0; ch.noteFrame++; continue; }
      var inst = (song && song.instruments && ch.inst) ? song.instruments[ch.inst] : null;
      var f = ch.noteFrame;

      // 音量：row 音量 × 樂器包絡
      var vol = ch.rowVol;
      if (inst) {
        var iv = envAt(inst.vol, inst.volLoop, f);
        if (iv !== null) vol = Math.floor(vol * iv / 15);
      }
      ch.outVol = vol < 0 ? 0 : (vol > 15 ? 15 : vol);

      // 占空比：row 值 or 樂器包絡
      var duty = ch.duty;
      if (inst) { var id = envAt(inst.duty, inst.dutyLoop, f); if (id !== null) duty = id; }
      ch.outDuty = duty & 3;

      if (i === 3) {                                   // 雜訊：note 就是週期索引
        ch.outPeriod = ch.midi & 15;
      } else if (i === 4) {                            // DMC
        ch.outPeriod = 0;
      } else {
        var midi = ch.midi;
        if (ch.arp && ch.arp.length) midi += ch.arp[f % ch.arp.length];
        if (inst) { var ia = envAt(inst.arp, inst.arpLoop, f); if (ia !== null) midi += ia; }
        if (midi < 0) midi = 0; if (midi > 127) midi = 127;
        var p = (i === 2) ? TRI_PERIOD[midi] : PULSE_PERIOD[midi];
        if (ch.vib) {
          var delay = ch.vib.delay || 0;
          if (f >= delay) {
            ch.vibPhase += (ch.vib.rate || 4);
            p += Math.round((ch.vib.depth || 2) * Math.sin(ch.vibPhase * Math.PI / 32));
          }
        }
        if (inst) { var ip = envAt(inst.pitch, inst.pitchLoop, f); if (ip !== null) p += ip; }
        ch.outPeriod = p < 0 ? 0 : (p > 0x7FF ? 0x7FF : p);
      }
      ch.noteFrame++;
    }
  };

  // 把音樂狀態寫進 APU；被音效佔用的軌跳過
  Driver.prototype._writeMusic = function () {
    this._src = 'music';
    for (var i = 0; i < 5; i++) {
      if (this.owner(i)) { this.ch[i].trigger = false; continue; }
      this._emit(this.ch[i], this.ch[i].on, this.ch[i].outVol, this.ch[i].outPeriod,
        this.ch[i].outDuty, this.ch[i].trigger || this.ch[i].force, this.ch[i].midi);
      this.ch[i].trigger = false;
      this.ch[i].force = false;
    }
    this._src = null;
  };

  // 實際的暫存器輸出（音樂與音效共用）
  Driver.prototype._emit = function (ch, on, vol, period, duty, trigger, extra) {
    var i = ch.i, base = ch.base;
    if (!on) { this._enable(i, false); return; }
    this._enable(i, true);
    if (i === 0 || i === 1) {
      var ctl = ((duty & 3) << 6) | 0x30 | (vol & 15);
      if (ctl !== ch.lastCtl || trigger) { this._w(base + 0, ctl); ch.lastCtl = ctl; }
      if (ch.lastSweep !== SWEEP_OFF || trigger) { this._w(base + 1, SWEEP_OFF); ch.lastSweep = SWEEP_OFF; }
      var lo = period & 0xFF, hi = (period >> 8) & 7;
      if (lo !== ch.lastLo || trigger) { this._w(base + 2, lo); ch.lastLo = lo; }
      if (hi !== ch.lastHi || trigger) { this._w(base + 3, (LEN_IDX << 3) | hi); ch.lastHi = hi; }
    } else if (i === 2) {
      if (ch.lastCtl !== 0xFF || trigger) { this._w(0x4008, 0xFF); ch.lastCtl = 0xFF; }  // control=1 + reload=$7F → 持續發聲
      var tlo = period & 0xFF, thi = (period >> 8) & 7;
      if (tlo !== ch.lastLo || trigger) { this._w(0x400A, tlo); ch.lastLo = tlo; }
      if (thi !== ch.lastHi || trigger) { this._w(0x400B, (LEN_IDX << 3) | thi); ch.lastHi = thi; }
    } else if (i === 3) {
      var nctl = 0x30 | (vol & 15);
      if (nctl !== ch.lastCtl || trigger) { this._w(0x400C, nctl); ch.lastCtl = nctl; }
      var mode = (duty & 1) ? 0x80 : 0;                 // 雜訊軌把 duty 當成 LFSR 長短模式
      var nper = mode | (period & 15);
      if (nper !== ch.lastLo || trigger) { this._w(0x400E, nper); ch.lastLo = nper; }
      if (trigger) { this._w(0x400F, LEN_IDX << 3); }
    } else if (i === 4) {
      var s = this.dpcmMap[extra];
      if (s && trigger) {
        this._w(0x4010, (s.loop ? 0x40 : 0) | (s.rate & 15));
        this._w(0x4012, s.addrReg);
        this._w(0x4013, s.lenReg);
        this._enable(4, false);
        this._enable(4, true);
      }
    }
  };

  // 音效：每幀推進一格；跑完就把聲道還給音樂
  Driver.prototype._advanceSfx = function () {
    this._src = 'sfx';
    var keep = [];
    for (var a = 0; a < this.active.length; a++) {
      var inst = this.active[a], alive = [];
      for (var c = 0; c < inst.chans.length; c++) {
        var sc = inst.chans[c];
        var ci = sc.ci;
        var fr = sc.frames[sc.pos];
        if (sc.pos >= sc.frames.length || (fr && fr.off)) { this._restore(ci); continue; }
        if (!sc.st) sc.st = { vol: 15, duty: 0, midi: 69, on: true, trigger: true };
        var st = sc.st;
        st.trigger = (sc.pos === 0);
        if (fr) {
          if (fr.vol !== undefined) st.vol = fr.vol;
          if (fr.duty !== undefined) st.duty = fr.duty;
          if (fr.note !== undefined) {
            st.midi = (ci === 3 || ci === 4) ? fr.note : noteToMidi(fr.note);
            if (fr.retrigger) st.trigger = true;
          }
          if (fr.period !== undefined) st.period = fr.period; else st.period = undefined;
        }
        var period;
        if (ci === 3) period = st.midi & 15;
        else if (st.period !== undefined) period = st.period;
        else period = (ci === 2 ? TRI_PERIOD : PULSE_PERIOD)[Math.max(0, Math.min(127, st.midi))];
        var ch = this.ch[ci];
        this._emit(ch, true, st.vol, period, st.duty, st.trigger, st.midi);
        sc.pos++;
        alive.push(sc);
      }
      if (alive.length) { inst.chans = alive; keep.push(inst); }
    }
    this.active = keep;
    this._src = null;
  };

  /* --- 狀態快照（測試用） --- */

  Driver.prototype.state = function () {
    var self = this;
    return {
      playing: this.playing,
      frame: this.frame,
      orderIndex: this.orderIndex,
      row: this.row,
      rowFrame: this.rowFrame,
      rowsPlayed: this.rowsPlayed,
      speed: this.speed,
      enableMask: this.enableMask,
      sfx: this.active.map(function (s) {
        return { name: s.name, priority: s.priority, channels: s.chans.map(function (c) { return CH_NAMES[c.ci]; }), pos: s.chans[0] ? s.chans[0].pos : 0 };
      }),
      channels: this.ch.map(function (c) {
        return {
          name: c.name, on: c.on, midi: c.midi, vol: c.outVol, period: c.outPeriod,
          duty: c.outDuty, noteFrame: c.noteFrame, owned: !!self.owner(c.i),
          owner: self.owner(c.i) ? self.owner(c.i).name : null
        };
      })
    };
  };

  /* ================================================================ DEMO */
  /* 全部原創：8 小節 / A 小調 / speed 6（16 row 一小節 → 150 BPM）。
     編制照研究 06 §1.6 的標準配方：p1 旋律、p2 琶音和聲、三角波八度跳躍低音、雜訊鼓。 */

  function pat(len, map) {
    var a = new Array(len);
    for (var i = 0; i < len; i++) a[i] = map[i] || null;
    return a;
  }
  function L(note, extra) {               // 旋律用 row
    var o = { note: note };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  var ROWS = 16;

  // --- 鼓 pattern（雜訊軌；note = 週期索引）---
  var DRUM_BASIC = pat(ROWS, {
    0: { note: 12, inst: 'kick', vol: 13, duty: 0 },
    2: { note: 2, inst: 'hat', vol: 6 },
    4: { note: 6, inst: 'snare', vol: 12 },
    6: { note: 2, inst: 'hat', vol: 6 },
    8: { note: 12, inst: 'kick', vol: 13 },
    10: { note: 2, inst: 'hat', vol: 6 },
    12: { note: 6, inst: 'snare', vol: 12 },
    14: { note: 2, inst: 'hat', vol: 6 }
  });
  var DRUM_FILL = pat(ROWS, {
    0: { note: 12, inst: 'kick', vol: 13, duty: 0 },
    2: { note: 2, inst: 'hat', vol: 6 },
    4: { note: 6, inst: 'snare', vol: 12 },
    6: { note: 2, inst: 'hat', vol: 6 },
    8: { note: 12, inst: 'kick', vol: 13 },
    10: { note: 6, inst: 'snare', vol: 8 },
    12: { note: 6, inst: 'snare', vol: 10 },
    13: { note: 6, inst: 'snare', vol: 11 },
    14: { note: 5, inst: 'snare', vol: 13 },
    15: { note: 4, inst: 'snare', vol: 15 }
  });

  function melody(notes, extra) {          // 8 個八分音符（row 0,2,4,...,14）
    var m = {};
    for (var i = 0; i < notes.length; i++) {
      if (notes[i]) m[i * 2] = L(notes[i], i === 0 ? extra : null);
    }
    return pat(ROWS, m);
  }
  function bass(notes) { return melody(notes); }
  function padRow(note, arp) {
    return pat(ROWS, { 0: { note: note, inst: 'pad', vol: 10, duty: 0, arp: arp } });
  }

  var MIN = [0, 3, 7], MAJ = [0, 4, 7];

  var DEMO_SONG = {
    name: '星塵序曲（原創 demo）',
    speed: 6,
    rows: ROWS,
    loop: 0,
    instruments: {
      lead: { vol: [15, 15, 15, 14, 14, 13, 13, 12, 12, 11], volLoop: 9, duty: [1] },
      leadEcho: { vol: [8, 8, 7, 7, 6, 6, 5], volLoop: 6, duty: [0] },
      pad: { vol: [10, 10, 9, 9, 8, 8, 7], volLoop: 6, duty: [0] },
      bass: {},
      kick: { vol: [15, 13, 10, 7, 4, 2, 0], volLoop: 6 },
      snare: { vol: [15, 13, 11, 9, 7, 5, 3, 2, 1, 0], volLoop: 9 },
      hat: { vol: [8, 4, 2, 0], volLoop: 3 }
    },
    patterns: [
      { // 1  Am
        p1: melody(['A-4', 'C-5', 'E-5', 'A-5', 'G-5', 'E-5', 'C-5', 'E-5'], { inst: 'lead', vol: 15, duty: 1 }),
        p2: padRow('A-3', MIN),
        tri: bass(['A-2', 'A-3', 'A-2', 'A-3', 'A-2', 'A-3', 'E-3', 'G-3']),
        noi: DRUM_BASIC
      },
      { // 2  F
        p1: melody(['F-4', 'A-4', 'C-5', 'F-5', 'E-5', 'C-5', 'A-4', 'C-5']),
        p2: padRow('F-3', MAJ),
        tri: bass(['F-2', 'F-3', 'F-2', 'F-3', 'F-2', 'F-3', 'A-2', 'C-3']),
        noi: DRUM_BASIC
      },
      { // 3  C
        p1: melody(['C-5', 'E-5', 'G-5', 'C-6', 'B-5', 'G-5', 'E-5', 'G-5']),
        p2: padRow('C-4', MAJ),
        tri: bass(['C-3', 'C-4', 'C-3', 'C-4', 'C-3', 'C-4', 'E-3', 'G-3']),
        noi: DRUM_BASIC
      },
      { // 4  G（段落結尾過門）
        p1: melody(['B-4', 'D-5', 'G-5', 'B-5', 'A-5', 'G-5', 'D-5', 'B-4']),
        p2: padRow('G-3', MAJ),
        tri: bass(['G-2', 'G-3', 'G-2', 'G-3', 'G-2', 'G-3', 'B-2', 'D-3']),
        noi: DRUM_FILL
      },
      { // 5  Am
        p1: melody(['A-4', 'C-5', 'E-5', 'A-5', 'G-5', 'E-5', 'C-5', 'A-4']),
        p2: padRow('A-3', MIN),
        tri: bass(['A-2', 'A-3', 'A-2', 'A-3', 'A-2', 'A-3', 'E-3', 'G-3']),
        noi: DRUM_BASIC
      },
      { // 6  F
        p1: melody(['F-4', 'A-4', 'C-5', 'F-5', 'E-5', 'C-5', 'A-4', 'F-4']),
        p2: padRow('F-3', MAJ),
        tri: bass(['F-2', 'F-3', 'F-2', 'F-3', 'F-2', 'F-3', 'A-2', 'C-3']),
        noi: DRUM_BASIC
      },
      { // 7  E（和聲小調的 V，♯7 帶出張力）
        p1: melody(['E-5', 'G#5', 'B-5', 'E-6', 'D-6', 'B-5', 'G#5', 'B-5']),
        p2: padRow('E-3', MAJ),
        tri: bass(['E-2', 'E-3', 'E-2', 'E-3', 'E-2', 'E-3', 'G#2', 'B-2']),
        noi: DRUM_BASIC
      },
      { // 8  Am（長音收尾 + 顫音）
        p1: pat(ROWS, {
          0: { note: 'A-5', inst: 'lead', vol: 15, duty: 1, vib: { rate: 5, depth: 3, delay: 10 } },
          8: { note: 'E-5', vib: { rate: 5, depth: 2, delay: 8 } },
          12: { note: 'A-4', vib: null }
        }),
        p2: padRow('A-3', MIN),
        tri: bass(['A-2', 'A-3', 'A-2', 'A-3', 'A-2', 'A-3', 'A-2', 'E-3']),
        noi: DRUM_FILL
      }
    ],
    order: [0, 1, 2, 3, 4, 5, 6, 7]
  };

  // --- 2 個原創音效 ---
  // jump：方波 25% → 12.5%，兩個八度上滑、10 幀衰減（§4.2「上行 = 正面」）
  var SFX_JUMP = {
    priority: 5,
    channels: ['p2'],
    data: {
      p2: [
        { duty: 1, vol: 12, note: 'A-4' },
        { note: 'C#5' },
        { note: 'E-5' },
        { note: 'A-5', vol: 11 },
        { note: 'C#6', duty: 0 },
        { note: 'E-6', vol: 9 },
        { note: 'A-6', vol: 7 },
        { vol: 5 },
        { vol: 3 },
        { vol: 1 },
        { off: true }
      ]
    }
  };
  // coin：短前音 + 長尾音的上行五度（B-5 → F#6），尾音慢衰減
  var SFX_COIN = {
    priority: 6,
    channels: ['p2'],
    data: {
      p2: [
        { duty: 1, vol: 12, note: 'B-5' },
        null, null, null,
        { note: 'F#6', vol: 12, retrigger: true },
        null, null, null, null, null,
        { vol: 11 }, { vol: 10 }, { vol: 9 }, { vol: 8 }, { vol: 7 },
        { vol: 6 }, { vol: 5 }, { vol: 4 }, { vol: 3 }, { vol: 2 }, { vol: 1 },
        { off: true }
      ]
    }
  };

  /* ------------------------------------------------------------------ 匯出 */

  var api = {
    create: function (apu) { return new Driver(apu); },
    Driver: Driver,
    noteToMidi: noteToMidi,
    freqOf: freqOf,
    PULSE_PERIOD: PULSE_PERIOD,
    TRI_PERIOD: TRI_PERIOD,
    CHANNELS: CH_NAMES,
    DEMO: { song: DEMO_SONG, sfx: { jump: SFX_JUMP, coin: SFX_COIN } },
    VERSION: '1.0.0',
    _default: null,
    attach: function (apu) {
      api._default = new Driver(apu);
      api._default.define('jump', SFX_JUMP);
      api._default.define('coin', SFX_COIN);
      return api._default;
    }
  };
  ['define', 'play', 'stop', 'sfx', 'tick', 'state', 'stopSfx', 'record'].forEach(function (m) {
    api[m] = function () {
      if (!api._default) throw new Error('請先呼叫 NES.Music.attach(apu)');
      return api._default[m].apply(api._default, arguments);
    };
  });
  NES.Music = api;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
