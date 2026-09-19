# -*- coding: utf-8 -*-
"""
tools/test_apu.py — engine/apu.js + engine/music.js + games/cruiser/song.js 的自動測試（audio agent 專用）

不依賴其他人的檔案：用 Playwright 開 about:blank，只 add_script_tag 載入
apu.js / music.js / games/cruiser/song.js（這三個都是 audio agent 自己的檔）。

用法：
    ../卡比之星/.venv/bin/python tools/test_apu.py
    ../卡比之星/.venv/bin/python tools/test_apu.py -v      # 印出每項細節

驗證項目：
  1  方波四種占空比的輸出波形序列
  2  方波 t<8 靜音 / 掃頻目標溢位靜音
  3  掃頻方向（正向升頻 / 負向降頻）與方波 1 的「負向差一」
  4  包絡衰減（15→0）與 loop
  5  長度計數器歸零後停音 + 長度查表
  6  三角波 32 階梯波序列 + 無音量暫存器
  7  雜訊 LFSR 週期：長模式 32767、短模式 93 / 31
  8  DPCM 1-bit 差分（±2、夾在 0..127）
  9  非線性混音（單獨 vs 合奏不是線性相加）
  10 frame counter 240Hz（4 步）/ 192Hz（5 步）
  11 render 決定性（同輸入同輸出）
  12 music：pattern / row 推進與 speed
  13 music：sfx 搶聲道 + 結束後復原
  14 music：slide（滑音）/ detune 效果欄（R2 新增，QA R1 P2-7 / X15）
  15 cruiser：CR.SONGS 六首曲的 pattern 合法性（音域 / 聲道分配 / order / 長度）
  16 cruiser：CR.SFX 優先權表 + 搶佔後音樂軌回復
  17 cruiser：10 秒離線渲染無 NaN / 不削波
"""
import sys, pathlib, json

ROOT = pathlib.Path(__file__).resolve().parent.parent
APU = ROOT / 'engine' / 'apu.js'
MUSIC = ROOT / 'engine' / 'music.js'
CRUISER_SONG = ROOT / 'games' / 'cruiser' / 'song.js'

VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    mark = 'PASS' if ok else 'FAIL'
    if not ok or VERBOSE:
        print('  [%s] %s%s' % (mark, name, ('  — ' + str(detail)) if detail else ''))
    return bool(ok)


# ----------------------------------------------------------------- JS 測試碼

JS = r"""
window.T = {};
const A = window.NES.APU, M = window.NES.Music;

function mk(o){ o = o || {}; if(o.sampleRate===undefined) o.sampleRate = 44100; return A.create(o); }

// 1 占空比波形
T.duty = function(){
  const res = [];
  for (let d = 0; d < 4; d++){
    const a = mk();
    a.write(0x4015, 1);
    a.write(0x4001, 0x08);              // 關掃頻
    a.write(0x4000, (d<<6) | 0x1F);     // 固定音量 15
    a.write(0x4002, 0x0F);              // timer = 15
    a.write(0x4003, (1<<3) | 0);
    const seq = [];
    for (let s = 0; s < 8; s++){
      a.clock(32);                      // 一個序列步 = 2*(t+1) = 32 CPU cycles
      seq.push(a.state().pulse1.out > 0 ? 1 : 0);
    }
    res.push({duty:d, seq:seq, table:A.DUTY[d]});
  }
  return res;
};

// 2 t<8 靜音、掃頻溢位靜音
T.mute = function(){
  const a = mk();
  a.write(0x4015,1); a.write(0x4001,0x08); a.write(0x4000,0x1F);
  a.write(0x4002,0x07); a.write(0x4003,(1<<3)|0);     // timer = 7 < 8
  const lowMuted = a.state().pulse1.muted;
  a.write(0x4002,0x20); a.write(0x4003,(1<<3)|0);     // timer = 0x20
  const okMuted = a.state().pulse1.muted;
  const b = mk();
  b.write(0x4015,1); b.write(0x4001,0x00);            // shift=0、negate=0 → 目標 = 2×timer
  b.write(0x4002,0x00); b.write(0x4003,(1<<3)|5);     // timer = 0x500 → 目標 0xA00 > $7FF
  return {lowMuted, okMuted, overflowMuted: b.state().pulse1.muted};
};

// 3 掃頻方向與「方波 1 負向差一」
T.sweep = function(){
  function run(reg4001, ch){
    const a = mk();
    const base = ch === 1 ? 0x4000 : 0x4004;
    a.write(0x4015, ch === 1 ? 1 : 2);
    a.write(base+0, 0x1F);
    a.write(base+1, reg4001);
    a.write(base+2, 0x00);
    a.write(base+3, (1<<3)|1);          // timer = 0x100
    const t0 = a.state()[ch===1?'pulse1':'pulse2'].timer;
    a.clock(29830*4);                   // 幾個 half frame
    const t1 = a.state()[ch===1?'pulse1':'pulse2'].timer;
    return [t0, t1];
  }
  const up = run(0x81, 1);              // enable, period 0, negate 0, shift 1 → timer 變大 = 音變低
  const dn = run(0x89, 1);              // negate → timer 變小 = 音變高
  // 負向差一：shift=1, timer=0x100 → change = 128；p1 target = 256-129 = 127、p2 = 256-128 = 128
  const a1 = mk(); a1.write(0x4015,1); a1.write(0x4000,0x1F); a1.write(0x4001,0x09);
  a1.write(0x4002,0x00); a1.write(0x4003,(1<<3)|1);
  const a2 = mk(); a2.write(0x4015,2); a2.write(0x4004,0x1F); a2.write(0x4005,0x09);
  a2.write(0x4006,0x00); a2.write(0x4007,(1<<3)|1);
  return {up, dn, t1: a1.state().pulse1.sweepTarget, t2: a2.state().pulse2.sweepTarget};
};

// 4 包絡（以「確實跑過 n 次 quarter frame」為單位，避免 7457 累加的漂移）
function quarters(a, n){
  const target = a.state().quarterCount + n;
  let guard = 0;
  while (a.state().quarterCount < target && guard++ < 200000) a.clock(64);
}
T.envelope = function(){
  const a = mk();
  a.write(0x4015,1); a.write(0x4001,0x08);
  a.write(0x4000, 0x00);                // duty0, halt=0, const=0, v=0 → 每個 quarter frame 衰減 1
  a.write(0x4002,0x80); a.write(0x4003,(1<<3)|1);
  const seq = [];
  for (let i=0;i<18;i++){ quarters(a,1); seq.push(a.state().pulse1.envDecay); }
  // loop 版本（halt/loop = 1）：20 個 quarter → 15..0 之後回捲
  const b = mk();
  b.write(0x4015,1); b.write(0x4001,0x08);
  b.write(0x4000, 0x20);
  b.write(0x4002,0x80); b.write(0x4003,(1<<3)|1);
  quarters(b, 20);
  // 不 loop 的對照組
  const c = mk();
  c.write(0x4015,1); c.write(0x4001,0x08);
  c.write(0x4000, 0x00);
  c.write(0x4002,0x80); c.write(0x4003,(1<<3)|1);
  quarters(c, 20);
  return {seq, looped: b.state().pulse1.envDecay, notLooped: c.state().pulse1.envDecay};
};

// 5 長度計數器
T.length = function(){
  const a = mk();
  a.write(0x4015,1); a.write(0x4001,0x08);
  a.write(0x4000,0x1F);                  // halt=0 → length 會遞減
  a.write(0x4002,0x80); a.write(0x4003,(0<<3)|1);   // length index 0 → 10
  const l0 = a.state().pulse1.length;
  let outs = [];
  // half frame 在 14913 / 29829；跑 6 個 frame counter 週期 = 12 個 half frame
  for (let i=0;i<12;i++){ a.clock(14915); outs.push(a.state().pulse1.length); }
  const st = a.state().pulse1;
  return {l0, table0: A.LENGTH_TABLE[0], lengths: outs, finalLen: st.length, finalOut: st.out};
};

// 6 三角波
T.triangle = function(){
  const a = mk();
  a.write(0x4015,4);
  a.write(0x4008, 0xFF);                 // control=1, reload=$7F
  a.write(0x400A, 0x0F); a.write(0x400B,(1<<3)|0);   // timer = 15 → 每 16 CPU cycle 一階
  a.clock(7457);                          // 先跑一個 quarter frame 讓 linear counter 載入
  const seq = [];
  const start = a.state().triangle.out;
  for (let i=0;i<32;i++){ a.clock(16); seq.push(a.state().triangle.out); }
  // 沒有音量暫存器：寫 $4008 的低 7 bit 只影響 linear counter，不影響振幅
  const vals = {};
  for (const v of [0x81, 0xBF, 0xFF]){
    const b = mk();
    b.write(0x4015,4); b.write(0x4008, v); b.write(0x400A,0x0F); b.write(0x400B,(1<<3)|0);
    b.clock(7457);
    let mn=99, mx=-1;
    for (let i=0;i<64;i++){ b.clock(16); const o=b.state().triangle.out; if(o<mn)mn=o; if(o>mx)mx=o; }
    vals[v] = [mn, mx];
  }
  return {start, seq, table: A.TRIANGLE_SEQ, vals};
};

// 7 雜訊 LFSR
T.lfsr = function(){
  function period(mode, seed){
    const a = mk();
    a.write(0x4015, 8);
    a.write(0x400C, 0x1F);
    a.write(0x400E, (mode?0x80:0) | 0);   // period index 0 = 4 CPU cycles
    a.write(0x400F, 1<<3);
    a.setNoiseLfsr(seed);
    let n = 0;
    do { a.clock(4); n++; } while (a.state().noise.lfsr !== seed && n < 70000);
    return n;
  }
  return {long: period(0, 1), short93: period(1, 1), short31: period(1, 0x737),
          table: A.NOISE_PERIOD_NTSC};
};

// 8 DPCM 差分
T.dpcm = function(){
  function run(byteVal, start){
    const a = mk();
    a.setDpcmSample(new Uint8Array([byteVal, byteVal, byteVal, byteVal]));
    a.write(0x4010, 0x0F);               // rate index 15 = 54 cycles/bit（最快）
    a.write(0x4011, start);
    a.write(0x4012, 0x00);
    a.write(0x4013, 0x00);               // 長度 = 1 byte
    a.write(0x4015, 0x10);
    const levels = [a.state().dmc.level];
    for (let i=0;i<24;i++){ a.clock(54); levels.push(a.state().dmc.level); }
    return levels;
  }
  const up = run(0xFF, 0);      // 全 1 → 每 bit +2
  const dn = run(0x00, 64);     // 全 0 → 每 bit -2
  const clampHi = run(0xFF, 126);
  const clampLo = run(0x00, 1);
  return {up, dn, clampHi, clampLo, rates: A.DMC_RATE_NTSC};
};

// 9 非線性混音
T.mixer = function(){
  const one = A.mix(15,0,0,0,0);
  const two = A.mix(15,15,0,0,0);
  const tri = A.mix(0,0,15,0,0);
  const noi = A.mix(0,0,0,15,0);
  const both = A.mix(0,0,15,15,0);
  const zero = A.mix(0,0,0,0,0);
  const full = A.mix(15,15,15,15,127);
  // 查表與公式一致？
  let tableOk = true;
  const a = mk();
  a.write(0x4015,0x0F); a.write(0x4001,8); a.write(0x4000,0x1F);
  a.write(0x4002,0x80); a.write(0x4003,(1<<3)|0);
  a.clock(100);
  const st = a.state();
  const byFormula = A.mix(st.pulse1.out, st.pulse2.out, st.triangle.out, st.noise.out, st.dmc.out);
  if (Math.abs(byFormula - st.mix) > 1e-6) tableOk = false;
  return {one, two, tri, noi, both, zero, full, tableOk};
};

// 10 frame counter
T.frameCounter = function(){
  const a = mk();
  a.write(0x4017, 0x40);                 // 4-step、關 IRQ
  a.clock(A.CPU_HZ);                     // 剛好 1 秒
  const four = {q: a.state().quarterCount, h: a.state().halfCount};
  const b = mk();
  b.write(0x4017, 0xC0);                 // 5-step
  const preQ = b.state().quarterCount;   // 寫入時立刻 clock 一次 quarter+half
  b.clock(A.CPU_HZ);
  const five = {q: b.state().quarterCount - preQ, h: b.state().halfCount - 1, preQ};
  return {four, five, cyclesPerFrame: A.CYCLES_PER_FRAME};
};

// 11 render 決定性
T.deterministic = function(){
  function make(){
    const a = mk();
    a.write(0x4015,0x0F); a.write(0x4001,8);
    a.write(0x4000,0x9F); a.write(0x4002,0xFD); a.write(0x4003,(1<<3)|0);
    a.write(0x4008,0xFF); a.write(0x400A,0x7F); a.write(0x400B,(1<<3)|1);
    a.write(0x400C,0x1F); a.write(0x400E,0x06); a.write(0x400F,1<<3);
    return a;
  }
  const a = make(), b = make();
  const x = a.render(8000), y = b.render(8000);
  let same = x.length === y.length, diff = 0;
  for (let i=0;i<x.length;i++) if (x[i] !== y[i]) { same = false; diff++; }
  // 分段 render 也要與一次 render 相同
  const c = make();
  const p1 = c.render(3000), p2 = c.render(5000);
  let sameSplit = true;
  for (let i=0;i<3000;i++) if (p1[i] !== x[i]) sameSplit = false;
  for (let i=0;i<5000;i++) if (p2[i] !== x[3000+i]) sameSplit = false;
  let nonzero = 0;
  for (let i=0;i<x.length;i++) if (x[i] !== 0) nonzero++;
  return {same, diff, sameSplit, nonzero};
};

// 12 music pattern 推進
T.musicRows = function(){
  const apu = mk();
  const m = M.create(apu);
  const song = M.DEMO.song;
  m.play(song, {loop:true});
  const speed = song.speed;
  const snaps = [];
  // 前兩個 row
  snaps.push(m.state().row);
  for (let i=0;i<speed;i++) m.tick();
  snaps.push(m.state().row);
  for (let i=0;i<speed;i++) m.tick();
  snaps.push(m.state().row);
  // 跑完一個 pattern（16 row）→ orderIndex 前進
  const need = speed*16 - speed*2;
  for (let i=0;i<need;i++) m.tick();
  const afterPattern = m.state();
  // 跑完 8 個 pattern → 回到 order 0（loop）
  const m2 = M.create(mk());
  m2.play(song,{loop:true});
  for (let i=0;i<speed*16*8;i++) m2.tick();
  const wrapped = m2.state();
  // 不 loop 的情況
  const m3 = M.create(mk());
  m3.play(song,{loop:false});
  for (let i=0;i<speed*16*8+2;i++) m3.tick();
  // 第一個 row 的音高是否進了 APU
  const m4 = M.create(mk());
  const apu4 = m4.apu;
  m4.play(song,{loop:true});
  m4.tick();
  const s4 = apu4.state();
  return {snaps, speed, afterOrder: afterPattern.orderIndex, afterRow: afterPattern.row,
          wrappedOrder: wrapped.orderIndex, stoppedPlaying: m3.state().playing,
          p1Timer: s4.pulse1.timer, p1Len: s4.pulse1.length, triLen: s4.triangle.length,
          expectP1: M.PULSE_PERIOD[M.noteToMidi('A-4')], enableMask: s4 && m4.state().enableMask};
};

// 13 sfx 搶聲道 / 復原
T.sfxSteal = function(){
  const apu = mk();
  const m = M.create(apu);
  m.define('jump', M.DEMO.sfx.jump);
  m.define('coin', M.DEMO.sfx.coin);
  m.play(M.DEMO.song, {loop:true});
  for (let i=0;i<12;i++) m.tick();
  const beforeP2 = apu.state().pulse2.timer;

  m.sfx('jump');
  m.record(true);
  m.tick();
  const during = m.state();
  const logStart = m.log.slice();
  const sfxP2 = apu.state().pulse2.timer;

  // 再跑 3 幀，看音樂有沒有繼續寫別的軌、有沒有偷寫 p2
  m.record(true);
  for (let i=0;i<3;i++) m.tick();
  const logMid = m.log.slice();
  const musicP2 = logMid.filter(w => w[0]>=0x4004 && w[0]<=0x4007 && w[2]==='music').length;
  const sfxP2Writes = logMid.filter(w => w[0]>=0x4004 && w[0]<=0x4007 && w[2]==='sfx').length;
  const musicOther = logMid.filter(w => w[2]==='music' &&
        ((w[0]>=0x4000&&w[0]<=0x4003)||(w[0]>=0x4008&&w[0]<=0x400F))).length;
  // 音效期間：APU 上的 p2 是音效的音高，不是音樂的
  const musicWantP2 = m.state().channels[1].period;
  const apuP2During = apu.state().pulse2.timer;

  // 跑到音效結束（含歸還那一幀）
  m.record(true);
  let guard = 0;
  while (m.state().sfx.length && guard++ < 100) m.tick();
  m.tick(); m.tick();
  const logEnd = m.log.slice();
  const restoredWrites = logEnd.filter(w => w[0]>=0x4004 && w[0]<=0x4007 && w[2]==='music').length;
  const after = m.state();
  const apuP2After = apu.state().pulse2.timer;
  const musicWantAfter = after.channels[1].period;

  // 優先權
  const m2 = M.create(mk());
  m2.define('jump', M.DEMO.sfx.jump);
  m2.define('coin', M.DEMO.sfx.coin);
  m2.play(M.DEMO.song,{loop:true});
  m2.sfx('coin');  m2.tick();
  m2.sfx('jump');  m2.tick();
  const lowFail = m2.state().sfx.map(s=>s.name);
  m2.sfx('jump', {priority: 9}); m2.tick();
  const highWin = m2.state().sfx.map(s=>s.name);

  // 指定別的聲道
  const m3 = M.create(mk());
  m3.define('jump', M.DEMO.sfx.jump);
  m3.play(M.DEMO.song,{loop:true});
  m3.sfx('jump', {channels:['noi']});
  m3.tick();
  const remapped = m3.state().channels[3].owned && !m3.state().channels[1].owned;

  return {
    beforeP2, sfxP2,
    ownedDuring: during.channels[1].owned,
    ownerName: during.channels[1].owner,
    startSfxWrites: logStart.filter(w=>w[2]==='sfx').length,
    musicP2, sfxP2Writes, musicOther,
    matchSfxNotMusic: apuP2During !== musicWantP2,
    ownedAfter: after.channels[1].owned,
    restoredWrites,
    restoredMatchesMusic: apuP2After === musicWantAfter,
    lowFail, highWin, remapped,
    musicChannelsStillOn: after.channels[0].on && after.channels[2].on
  };
};

/* ===================== 14 slide（滑音）/ detune 效果欄（R2 新增）===================== */

function tiny(track, arr, speed){
  const pat = {}; pat[track] = arr;
  return {name:'tiny', speed: speed||1, rows: arr.length, loop:0,
          instruments:{}, patterns:[pat], order:[0]};
}
// 播 n 幀，收集某一軌每幀的 {period, detune, slideAcc}
function trace(song, chIndex, n){
  const m = M.create(mk());
  m.play(song, {loop:true});
  const out = [];
  for (let i=0;i<n;i++){ m.tick(); const c = m.state().channels[chIndex];
    out.push({p: c.period, d: c.detune, acc: c.slideAcc, on: c.on}); }
  return out;
}

T.slideDetune = function(){
  const P = M.PULSE_PERIOD, TR = M.TRI_PERIOD;
  const A4 = P[M.noteToMidi('A-4')];

  // 14.1 向下相容：demo 曲完全不帶 detune / slide
  const md = M.create(mk());
  md.play(M.DEMO.song, {loop:true});
  let clean = true;
  for (let i=0;i<600;i++){
    md.tick();
    for (const c of md.state().channels){
      if (c.detune !== 0 || c.slide !== null || c.slideAcc !== 0) clean = false;
    }
  }

  // 14.2 detune = 固定週期偏移
  const det = trace(tiny('p1', [{note:'A-4', vol:15, detune:5}, null, null, null]), 0, 4)
                .map(x => x.p);

  // 14.3 detune 持續 / 歸零
  const det2 = trace(tiny('p1', [{note:'A-4', vol:15, detune:7}, null,
                                 {note:'A-4', vol:15}, null,
                                 {note:'A-4', vol:15, detune:0}, null]), 0, 6).map(x => x.p);

  // 14.4 slide 數字：首幀 0 偏移，之後每幀 +rate
  const sl = trace(tiny('p1', [{note:'A-4', vol:15, slide:10}, null, null, null, null]), 0, 5)
               .map(x => x.p);

  // 14.5 slide {rate,to}：滑到目標音就停（G-4 比 A-4 低 → 週期變大）
  const G4 = P[M.noteToMidi('G-4')];
  const sTo = trace(tiny('p1', [{note:'A-4', vol:15, slide:{rate:9, to:'G-4'}},
                                null,null,null,null,null,null,null,null,null,null,null]), 0, 12)
                .map(x => x.p);

  // 14.6 slide {rate,limit}：累積夾在 ±limit
  const sLim = trace(tiny('p1', [{note:'A-4', vol:15, slide:{rate:10, limit:25}},
                                 null,null,null,null,null]), 0, 6).map(x => x.p);
  const sNeg = trace(tiny('p1', [{note:'A-4', vol:15, slide:{rate:-10, limit:25}},
                                 null,null,null,null,null]), 0, 6).map(x => x.p);

  // 14.7 新音 → slideAcc 歸零，但 detune 保留
  const reset = trace(tiny('p1', [{note:'A-4', vol:15, slide:12, detune:4}, null, null,
                                  {note:'A-4', vol:15}, null]), 0, 5);

  // 14.8 三角波也吃 detune / slide
  const A2 = TR[M.noteToMidi('A-2')];
  const triS = trace(tiny('tri', [{note:'A-2', detune:6, slide:3}, null, null]), 2, 3).map(x => x.p);

  // 14.9 雜訊軌不受 detune / slide 影響（note = 週期索引 0..15）
  const noi = trace(tiny('noi', [{note:5, vol:10, detune:100, slide:50}, null, null]), 3, 3)
                .map(x => x.p);

  // 14.10 音效的幀也吃 slide / detune
  const apu = mk(); const ms = M.create(apu);
  ms.define('dive', {priority:5, channels:['p2'], data:{p2:[
    {duty:1, vol:12, note:'A-4', slide:20}, null, null, null, {off:true}]}});
  ms.sfx('dive');
  const sfxT = [];
  for (let i=0;i<4;i++){ ms.tick(); sfxT.push(apu.state().pulse2.timer); }
  const apu2 = mk(); const ms2 = M.create(apu2);
  ms2.define('flat', {priority:5, channels:['p2'], data:{p2:[
    {duty:1, vol:12, note:'A-4', detune:11}, null, {off:true}]}});
  ms2.sfx('flat'); ms2.tick();
  const sfxDetune = apu2.state().pulse2.timer;

  // 14.11 slide:0 / null 關閉
  const off = trace(tiny('p1', [{note:'A-4', vol:15, slide:8}, null,
                                {note:'A-4', vol:15, slide:0}, null]), 0, 4).map(x=>x.p);

  return {clean, A4, G4, A2, det, det2, sl, sTo, sLim, sNeg,
          reset: reset.map(x=>({p:x.p, d:x.d, acc:x.acc})),
          triS, noi, sfxT, sfxDetune, off};
};

/* ============ 15/16/17 games/cruiser/song.js（CR.Audio / CR.SONGS / CR.SFX）============ */

T.hasCruiser = function(){ return !!(window.CR && window.CR.SONGS && window.CR.SFX); };

T.cruiserSongs = function(){
  const S = window.CR.SONGS;
  const keys = Object.keys(S);
  const MEL = {p1:1, p2:1, tri:1};
  const bad = {range:[], noise:[], vol:[], duty:[], order:[], track:[], dmc:[], tri:[]};
  const info = {};
  for (const k of keys){
    const s = S[k];
    const tracks = {};
    let melRows = {p1:0, p2:0, tri:0, noi:0};
    for (let pi=0; pi<s.patterns.length; pi++){
      const pat = s.patterns[pi];
      for (const t in pat){
        tracks[t] = 1;
        if (t === 'dmc') bad.dmc.push(k+' pat'+pi);
        const arr = pat[t];
        for (let ri=0; ri<arr.length; ri++){
          const r = arr[ri]; if (!r) continue;
          const at = k+' '+t+'['+pi+':'+ri+']';
          if (r.vol !== undefined && (r.vol < 0 || r.vol > 15)) bad.vol.push(at+'='+r.vol);
          if (r.duty !== undefined && (r.duty < 0 || r.duty > 3)) bad.duty.push(at+'='+r.duty);
          if (r.note === undefined || r.note === null) continue;
          melRows[t] = (melRows[t]||0) + 1;
          if (t === 'noi'){
            if (!(Number.isInteger(r.note) && r.note >= 0 && r.note <= 15)) bad.noise.push(at+'='+r.note);
          } else if (MEL[t]){
            const midi = M.noteToMidi(r.note);
            if (midi === null || midi < 24 || midi > 107) bad.range.push(at+'='+r.note);
            // 三角波是低音軌：不該爬到 C-5（midi 72）以上
            if (t === 'tri' && midi !== null && midi > 72) bad.tri.push(at+'='+r.note);
          }
        }
      }
    }
    for (const o of s.order) if (!(o >= 0 && o < s.patterns.length)) bad.order.push(k+' order '+o);
    if (!tracks.p1 || !tracks.tri) bad.track.push(k+' 缺 p1/tri');
    // 實際播完一輪要幾幀
    const m = M.create(mk());
    m.play(s, {loop:false});
    let f=0; while (m.state().playing && f++ < 5000) m.tick();
    info[k] = {speed:s.speed, bpm: +(3600/(s.speed*4)).toFixed(1), patterns:s.patterns.length,
               order:s.order.length, tracks:Object.keys(tracks), frames:f,
               sec:+(f/60.0988).toFixed(2), notes:melRows};
  }
  return {keys, bad, info};
};

// stage1 回音軌 = 主旋律延後 ECHO_DELAY row、音量 -2 級、detune > 0
T.cruiserEcho = function(){
  const s = window.CR.SONGS.stage1;
  const D = window.CR.Audio.ECHO_DELAY;
  const L = s.order.length, R = s.rows;
  function noteAt(track, flatRow){
    const pi = s.order[Math.floor(flatRow / R) % L];
    const arr = s.patterns[pi][track];
    const r = arr && arr[flatRow % R];
    return r && r.note !== undefined ? r.note : null;
  }
  let match = 0, mismatch = [];
  const total = L * R;
  for (let i=0;i<total;i++){
    const want = noteAt('p1', ((i - D) % total + total) % total);
    const got = noteAt('p2', i);
    if (want === got) match++; else mismatch.push(i+':'+want+'/'+got);
  }
  // 音量與 detune
  let leadVol = null, echoVol = null, echoDet = null, leadDet = 0, echoDuty = null;
  for (const p of s.patterns){
    for (const r of (p.p1||[])) if (r && r.vol !== undefined && leadVol === null) leadVol = r.vol;
    for (const r of (p.p1||[])) if (r && r.detune) leadDet = r.detune;
    for (const r of (p.p2||[])) if (r && r.vol !== undefined && echoVol === null) echoVol = r.vol;
    for (const r of (p.p2||[])) if (r && r.detune !== undefined && echoDet === null) echoDet = r.detune;
    for (const r of (p.p2||[])) if (r && r.duty !== undefined && echoDuty === null) echoDuty = r.duty;
  }
  return {delay:D, total, match, mismatch: mismatch.slice(0,5), leadVol, echoVol, echoDet, leadDet, echoDuty};
};

T.cruiserSfx = function(){
  const F = window.CR.SFX, PR = window.CR.Audio.PRIORITY;
  const names = Object.keys(F);
  // 聲道宣告：除了 die，不准碰 p1 / tri
  const illegal = [];
  const chans = {};
  for (const n of names){
    const c = F[n].channels || Object.keys(F[n].data);
    chans[n] = c;
    if (n !== 'die' && (c.indexOf('p1') >= 0 || c.indexOf('tri') >= 0)) illegal.push(n+':'+c);
  }
  // 優先權搶佔
  const apu = mk(), m = M.create(apu);
  for (const n of names) m.define(n, F[n]);
  m.play(window.CR.SONGS.stage1, {loop:true});
  for (let i=0;i<20;i++) m.tick();

  m.sfx('shot'); m.tick();
  const afterShot = m.state().sfx.map(s=>s.name);
  m.sfx('explode'); m.tick();
  const explodeWins = m.state().sfx.map(s=>s.name);
  m.sfx('shot'); m.tick();
  const shotLoses = m.state().sfx.map(s=>s.name);
  m.stopSfx(); m.tick();

  // 搶佔期間：p2 / noi 被佔、p1 / tri 仍由音樂寫
  for (let i=0;i<6;i++) m.tick();
  m.sfx('explode');
  m.record(true);
  // explode 的 noi 軌 19 幀 / p2 軌 14 幀，取 12 幀觀察（speed 6 → 至少跨 2 個 row，
  // 音樂軌一定會有新的音符寫入；_emit 對「沒變的值」會省略寫入，窗口太短會量到 0）
  for (let i=0;i<12;i++) m.tick();
  const log = m.log.slice();
  const musicP2  = log.filter(w=>w[0]>=0x4004 && w[0]<=0x4007 && w[2]==='music').length;
  const musicNoi = log.filter(w=>w[0]>=0x400C && w[0]<=0x400F && w[2]==='music').length;
  const musicP1  = log.filter(w=>w[0]>=0x4000 && w[0]<=0x4003 && w[2]==='music').length;
  const musicTri = log.filter(w=>w[0]>=0x4008 && w[0]<=0x400B && w[2]==='music').length;
  const st = m.state();
  const ownedDuring = {p2: st.channels[1].owned, noi: st.channels[3].owned,
                       p1: st.channels[0].owned, tri: st.channels[2].owned};

  // 跑到音效結束 + 2 幀 → 聲道歸還、APU 回到音樂的值
  let guard = 0;
  while (m.state().sfx.length && guard++ < 200) m.tick();
  m.record(true);
  for (let i=0;i<14;i++) m.tick();      // 歸還後跨過幾個 row，讓音樂把 p2 / noi 完整重寫
  const logBack = m.log.slice();
  const restoreP2  = logBack.filter(w=>w[0]>=0x4004 && w[0]<=0x4007 && w[2]==='music').length;
  const restoreNoi = logBack.filter(w=>w[0]>=0x400C && w[0]<=0x400F && w[2]==='music').length;
  const after = m.state();
  const apuS = apu.state();
  const backOk = !after.channels[1].owned && !after.channels[3].owned
              && apuS.pulse2.timer === after.channels[1].period
              && after.channels[0].on && after.channels[2].on && after.playing;

  // die：搶四軌，而且 CR.Audio.sfx('die') 會先停音樂
  const apu2 = mk(), m2 = M.create(apu2);
  window.CR.Audio._d = m2;
  window.CR.Audio.init({music: m2});
  window.CR.Audio.play('stage1');
  for (let i=0;i<10;i++) m2.tick();
  const playingBefore = m2.state().playing;
  window.CR.Audio.sfx('die');
  m2.tick();
  const dieState = m2.state();
  const dieChans = dieState.sfx.length ? dieState.sfx[0].channels : [];

  // CR.Audio 介面
  const api = ['init','play','stop','sfx','tick'].every(k => typeof window.CR.Audio[k] === 'function');

  return {names, chans, illegal, PR, afterShot, explodeWins, shotLoses,
          musicP2, musicNoi, musicP1, musicTri, ownedDuring,
          restoreP2, restoreNoi, backOk,
          playingBefore, dieChans, diePlaying: dieState.playing, api};
};

T.cruiserRender = function(key, seconds){
  const apu = A.create({sampleRate: 44100});
  const m = M.create(apu);
  for (const n in window.CR.SFX) m.define(n, window.CR.SFX[n]);
  m.play(window.CR.SONGS[key], {loop:true});
  const frames = Math.round(seconds * A.FRAME_HZ);
  let nan = 0, peak = 0, sum = 0, sum2 = 0, n = 0;
  for (let f=0; f<frames; f++){
    m.tick();
    const b = apu.tick();
    for (let i=0;i<b.length;i++){
      const v = b[i];
      if (!isFinite(v)) { nan++; continue; }
      const av = Math.abs(v); if (av > peak) peak = av;
      sum += v; sum2 += v*v; n++;
    }
  }
  const mean = sum/n;
  return {nan, peak, rms: Math.sqrt(sum2/n - mean*mean), samples: n, frames};
};

// ⚠ 最後一行必須是「非函式」的值：playwright 的 evaluate 如果拿到函式當完成值會直接呼叫它
true;
"""


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('需要 playwright：../卡比之星/.venv/bin/python -m pip install playwright', file=sys.stderr)
        return 2

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('about:blank')
        page.add_script_tag(path=str(APU))
        page.add_script_tag(path=str(MUSIC))
        if CRUISER_SONG.exists():
            page.add_script_tag(path=str(CRUISER_SONG))
        page.evaluate(JS)
        if errs:
            print('JS 載入錯誤：', errs, file=sys.stderr)
            return 2

        def run(name):
            return page.evaluate('()=>T.%s()' % name)

        print('== engine/apu.js ==')

        # 1 占空比
        r = run('duty')
        for d in r:
            seq, tab = d['seq'], d['table']
            rot = any(all(seq[i] == tab[(i + k) % 8] for i in range(8)) for k in range(8))
            check('1.%d 占空比 duty=%d 波形序列' % (d['duty'], d['duty']), rot,
                  'out=%s table=%s' % (seq, tab))
        # 占空比 0/1/2 的高位元數 = 1/2/4，duty3 = 6（25% 反相）
        highs = [sum(d['seq']) for d in r]
        check('1.4 占空比高位元數 1/2/4/6', highs == [1, 2, 4, 6], highs)

        # 2 靜音
        r = run('mute')
        check('2.1 timer < 8 靜音', r['lowMuted'] and not r['okMuted'], r)
        check('2.2 掃頻目標 > $7FF 靜音', r['overflowMuted'], r)

        # 3 掃頻
        r = run('sweep')
        check('3.1 掃頻正向 → timer 變大（音變低）', r['up'][1] > r['up'][0], r['up'])
        check('3.2 掃頻負向 → timer 變小（音變高）', r['dn'][1] < r['dn'][0], r['dn'])
        check('3.3 方波 1 負向差一（p1=127 / p2=128）', r['t1'] == 127 and r['t2'] == 128,
              'p1=%s p2=%s' % (r['t1'], r['t2']))

        # 4 包絡
        r = run('envelope')
        seq = r['seq']
        mono = all(seq[i] >= seq[i + 1] for i in range(len(seq) - 1))
        check('4.1 包絡由 15 逐 quarter frame 衰減到 0',
              seq[0] == 15 and seq[:16] == list(range(15, -1, -1)) and mono, seq)
        check('4.2 包絡 loop（halt=1 → 歸零後回 15）',
              r['looped'] == 12 and r['notLooped'] == 0,
              'loop=%s noloop=%s' % (r['looped'], r['notLooped']))

        # 5 長度計數器
        r = run('length')
        check('5.1 長度查表 index0 = 10', r['table0'] == 10 and r['l0'] == 10, r['l0'])
        check('5.2 長度歸零後停音', r['finalLen'] == 0 and r['finalOut'] == 0,
              'len=%s out=%s' % (r['finalLen'], r['finalOut']))
        check('5.3 長度逐 half frame 遞減', r['lengths'][0] < 10 and r['lengths'] == sorted(r['lengths'], reverse=True),
              r['lengths'])

        # 6 三角波
        r = run('triangle')
        seq, tab = r['seq'], r['table']
        rot = any(all(seq[i] == tab[(i + k) % 32] for i in range(32)) for k in range(32))
        check('6.1 三角波 32 階梯波序列', rot, seq)
        check('6.2 三角波階數 0..15 各出現兩次', sorted(seq) == sorted(list(range(16)) * 2), sorted(seq))
        amps = list(r['vals'].values())
        check('6.3 三角波無音量控制（寫不同 $4008 振幅不變）', all(a == [0, 15] for a in amps), r['vals'])

        # 7 LFSR
        r = run('lfsr')
        check('7.1 LFSR 長模式週期 32767', r['long'] == 32767, r['long'])
        check('7.2 LFSR 短模式週期 93', r['short93'] == 93, r['short93'])
        check('7.3 LFSR 短模式另一條循環 31', r['short31'] == 31, r['short31'])
        check('7.4 NTSC 雜訊 16 段週期表', r['table'] == [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068], r['table'])

        # 8 DPCM
        r = run('dpcm')
        up, dn = r['up'], r['dn']
        # 真機：啟動後要先耗掉 8 個 bit 的 silence 期才開始輸出，所以從第一次變動起算
        def deltas(levels):
            i = next((k for k in range(1, len(levels)) if levels[k] != levels[k - 1]), None)
            return [levels[k + 1] - levels[k] for k in range(i - 1, len(levels) - 1)] if i is not None else []
        du, dd = deltas(up), deltas(dn)
        check('8.1 DPCM bit=1 → 每 bit 位準 +2', len(du) >= 8 and all(x == 2 for x in du[:8]), up)
        check('8.2 DPCM bit=0 → 每 bit 位準 -2', len(dd) >= 8 and all(x == -2 for x in dd[:8]), dn)
        check('8.3 DPCM 位準夾在 0..127', max(r['clampHi']) <= 127 and min(r['clampLo']) >= 0,
              'hi=%s lo=%s' % (max(r['clampHi']), min(r['clampLo'])))
        check('8.4 NTSC DMC 16 段取樣率表', r['rates'][0] == 428 and r['rates'][15] == 54, r['rates'])

        # 9 混音
        r = run('mixer')
        check('9.1 兩個方波合奏 < 單獨 ×2（非線性）', r['two'] < 2 * r['one'] and r['two'] > r['one'],
              'one=%.5f two=%.5f 2×one=%.5f' % (r['one'], r['two'], 2 * r['one']))
        check('9.2 三角+雜訊合奏 < 各自相加（非線性）', r['both'] < r['tri'] + r['noi'],
              'tri=%.5f noi=%.5f both=%.5f sum=%.5f' % (r['tri'], r['noi'], r['both'], r['tri'] + r['noi']))
        check('9.3 全 0 → 0（避免除以 0）', r['zero'] == 0, r['zero'])
        check('9.4 滿載輸出在 0..1.05', 0.9 < r['full'] <= 1.05, r['full'])
        check('9.5 查表與公式一致', r['tableOk'], r['tableOk'])

        # 10 frame counter
        r = run('frameCounter')
        q4, h4 = r['four']['q'], r['four']['h']
        check('10.1 4 步模式 quarter ≈ 240Hz', abs(q4 - 240) <= 1, q4)
        check('10.2 4 步模式 half ≈ 120Hz', abs(h4 - 120) <= 1, h4)
        q5 = r['five']['q']
        check('10.3 5 步模式 quarter ≈ 192Hz', abs(q5 - 192) <= 1, q5)
        check('10.4 5 步模式寫 $4017 立刻 clock 一次', r['five']['preQ'] == 1, r['five']['preQ'])
        check('10.5 每影格 CPU cycle = 1789773/60.0988', abs(r['cyclesPerFrame'] - 29780.5) < 1.0, r['cyclesPerFrame'])

        # 11 決定性
        r = run('deterministic')
        check('11.1 render 決定性（同輸入同輸出）', r['same'] and r['diff'] == 0, r)
        check('11.2 分段 render 與整段一致', r['sameSplit'], r['sameSplit'])
        check('11.3 render 確實有輸出', r['nonzero'] > 7000, r['nonzero'])

        print('== engine/music.js ==')

        # 12 pattern 推進
        r = run('musicRows')
        check('12.1 每 speed 幀推進一 row', r['snaps'] == [0, 1, 2], r['snaps'])
        check('12.2 一個 pattern 跑完 → order 前進、row 歸零',
              r['afterOrder'] == 1 and r['afterRow'] == 0, (r['afterOrder'], r['afterRow']))
        check('12.3 8 個 pattern 跑完 → loop 回 order 0', r['wrappedOrder'] == 0, r['wrappedOrder'])
        check('12.4 loop=false → 曲末停止', r['stoppedPlaying'] is False, r['stoppedPlaying'])
        check('12.5 第一個 row 的音高寫進 APU（A-4）', r['p1Timer'] == r['expectP1'],
              'timer=%s expect=%s' % (r['p1Timer'], r['expectP1']))
        check('12.6 長度計數器已載入（方波 / 三角波都會發聲）',
              r['p1Len'] > 0 and r['triLen'] > 0, (r['p1Len'], r['triLen']))

        # 13 sfx
        r = run('sfxSteal')
        check('13.1 sfx 佔用 p2', r['ownedDuring'] and r['ownerName'] == 'jump', r['ownerName'])
        check('13.2 sfx 期間音樂完全不寫 p2 暫存器', r['musicP2'] == 0, r['musicP2'])
        check('13.3 sfx 期間音樂其它軌照常寫入', r['musicOther'] > 0, r['musicOther'])
        check('13.4 sfx 自己在寫 p2', r['sfxP2Writes'] > 0 and r['startSfxWrites'] > 0,
              (r['sfxP2Writes'], r['startSfxWrites']))
        check('13.5 sfx 期間 APU 的 p2 是音效的音高', r['matchSfxNotMusic'] and r['sfxP2'] != r['beforeP2'],
              (r['beforeP2'], r['sfxP2']))
        check('13.6 sfx 結束後歸還聲道', r['ownedAfter'] is False, r['ownedAfter'])
        check('13.7 歸還後音樂完整重寫 p2（$4004~$4007）', r['restoredWrites'] >= 4, r['restoredWrites'])
        check('13.8 歸還後 APU 的 p2 回到音樂的音高', r['restoredMatchesMusic'], r['restoredMatchesMusic'])
        check('13.9 低優先權搶不走高優先權', r['lowFail'] == ['coin'], r['lowFail'])
        check('13.10 高優先權搶得走', r['highWin'] == ['jump'], r['highWin'])
        check('13.11 可指定要搶的聲道（channels 選項）', r['remapped'], r['remapped'])
        check('13.12 搶聲道期間其它音樂軌不中斷', r['musicChannelsStillOn'], r['musicChannelsStillOn'])

        # 14 slide / detune
        r = run('slideDetune')
        A4, G4, A2 = r['A4'], r['G4'], r['A2']
        check('14.1 向下相容：demo 曲 600 幀內 detune=0 / slide=null', r['clean'], r['clean'])
        check('14.2 detune 固定週期偏移（每幀 base+5）', r['det'] == [A4 + 5] * 4,
              'base=%d got=%s' % (A4, r['det']))
        check('14.3 detune 持續到下次改寫、detune:0 取消',
              r['det2'] == [A4 + 7, A4 + 7, A4 + 7, A4 + 7, A4, A4], 'base=%d got=%s' % (A4, r['det2']))
        check('14.4 slide 數字：首幀 0 偏移、之後每幀 +rate',
              r['sl'] == [A4 + 10 * i for i in range(5)], 'base=%d got=%s' % (A4, r['sl']))
        sto = r['sTo']
        check('14.5 slide {rate,to}：滑到目標音就停（A-4 → G-4）',
              sto[0] == A4 and sto[-1] == G4 and max(sto) == G4
              and all(sto[i] <= sto[i + 1] for i in range(len(sto) - 1)),
              'A-4=%d G-4=%d got=%s' % (A4, G4, sto))
        check('14.6 slide {rate,limit}：累積夾在 +limit',
              r['sLim'] == [A4, A4 + 10, A4 + 20, A4 + 25, A4 + 25, A4 + 25], r['sLim'])
        check('14.7 slide 負 rate 也夾在 -limit',
              r['sNeg'] == [A4, A4 - 10, A4 - 20, A4 - 25, A4 - 25, A4 - 25], r['sNeg'])
        rs = r['reset']
        check('14.8 新音觸發 → slideAcc 歸零、detune 保留',
              [x['acc'] for x in rs] == [12, 24, 36, 12, 24] and [x['d'] for x in rs] == [4] * 5
              and rs[3]['p'] == A4 + 4, rs)
        check('14.9 三角波也吃 detune / slide', r['triS'] == [A2 + 6, A2 + 9, A2 + 12],
              'A-2=%d got=%s' % (A2, r['triS']))
        check('14.10 雜訊軌不受 detune / slide 影響（仍是週期索引 5）', r['noi'] == [5, 5, 5], r['noi'])
        check('14.11 音效的幀吃 slide（p2 timer 每幀 +20）',
              r['sfxT'] == [A4, A4 + 20, A4 + 40, A4 + 60], 'base=%d got=%s' % (A4, r['sfxT']))
        check('14.12 音效的幀吃 detune', r['sfxDetune'] == A4 + 11,
              'base=%d got=%d' % (A4, r['sfxDetune']))
        check('14.13 slide:0 關掉滑音', r['off'] == [A4, A4 + 8, A4, A4], r['off'])

        if not page.evaluate('()=>T.hasCruiser()'):
            check('15.0 games/cruiser/song.js 載入（CR.SONGS / CR.SFX）', False, '沒有 window.CR')
        else:
            print('== games/cruiser/song.js ==')

            # 15 曲目資料合法性
            r = run('cruiserSongs')
            want_keys = ['title', 'stage1', 'boss', 'clear', 'gameover', 'extend']
            check('15.1 六首曲齊全 %s' % want_keys, sorted(r['keys']) == sorted(want_keys), r['keys'])
            bad = r['bad']
            check('15.2 p1/p2/tri 的音名都解析得出且在 C1..B7（midi 24..107）',
                  not bad['range'], bad['range'][:6])
            check('15.3 三角波是低音軌（不超過 C-5 / midi 72）', not bad['tri'], bad['tri'][:6])
            check('15.4 雜訊軌的 note 是 0..15 的週期索引', not bad['noise'], bad['noise'][:6])
            check('15.5 vol 在 0..15、duty 在 0..3',
                  not bad['vol'] and not bad['duty'], (bad['vol'][:4], bad['duty'][:4]))
            check('15.6 order 索引都指得到 pattern', not bad['order'], bad['order'][:6])
            check('15.7 每首曲都有 p1 主旋律與 tri 低音', not bad['track'], bad['track'])
            check('15.8 沒有曲子用到 DMC 軌（R2 不放取樣）', not bad['dmc'], bad['dmc'][:4])
            info = r['info']
            for k in want_keys:
                if k not in info:
                    continue
            want_len = {'title': (17.04, 8), 'stage1': (25.56, 16), 'boss': (10.65, 8),
                        'clear': (3.99, 3), 'gameover': (3.00, 2), 'extend': (1.00, 1)}
            bpm_ok = {'title': 112.5, 'stage1': 150.0, 'boss': 180.0,
                      'clear': 180.0, 'gameover': 150.0, 'extend': 300.0}
            for k, (sec, npat) in want_len.items():
                i = info.get(k, {})
                check('15.9.%-8s %s BPM / %d pattern / %.2f 秒' % (k, bpm_ok[k], npat, sec),
                      i.get('bpm') == bpm_ok[k] and i.get('patterns') == npat
                      and abs(i.get('sec', 0) - sec) < 0.05,
                      i)
            check('15.10 stage1 是 16 小節、四軌齊全',
                  info['stage1']['order'] == 16 and sorted(info['stage1']['tracks']) == ['noi', 'p1', 'p2', 'tri'],
                  info['stage1'])

            # 15.11~ 回音軌
            r = run('cruiserEcho')
            check('15.11 stage1 回音軌 = 主旋律延後 %d row（%d/%d row 相符，loop 點接得上）'
                  % (r['delay'], r['match'], r['total']),
                  r['match'] == r['total'] and r['delay'] == 4, r['mismatch'])
            check('15.12 stage1 回音軌音量比主旋律低 2 級（%s → %s）' % (r['leadVol'], r['echoVol']),
                  r['leadVol'] - r['echoVol'] == 2, (r['leadVol'], r['echoVol']))
            check('15.13 stage1 回音軌有 detune（+%s）、主旋律沒有' % r['echoDet'],
                  r['echoDet'] > 0 and r['leadDet'] == 0, (r['echoDet'], r['leadDet']))
            check('15.14 stage1 回音軌用 12.5% 占空比（duty 0）', r['echoDuty'] == 0, r['echoDuty'])

            # 16 音效優先權 / 搶佔 / 回復
            r = run('cruiserSfx')
            want_sfx = ['shot', 'laser', 'missile', 'hit', 'explode', 'capsule', 'powerup', 'die', 'extend']
            check('16.1 九個音效齊全 %s' % want_sfx, sorted(r['names']) == sorted(want_sfx), r['names'])
            PR = r['PR']
            check('16.2 優先權 die > explode > powerup ≥ laser > shot（%s）'
                  % ' > '.join('%s%d' % (k, PR[k]) for k in ['die', 'explode', 'powerup', 'laser', 'shot']),
                  PR['die'] > PR['explode'] > PR['powerup'] >= PR['laser'] > PR['shot'], PR)
            check('16.3 除了 die，音效只用 p2 / noi（不搶 p1 主旋律與 tri 低音）',
                  not r['illegal'], r['illegal'])
            check('16.4 die 搶四軌 p1+p2+tri+noi', sorted(r['dieChans']) == ['noi', 'p1', 'p2', 'tri'],
                  r['dieChans'])
            check('16.5 CR.Audio.sfx(\'die\') 會先停音樂（NES 慣例）',
                  r['playingBefore'] is True and r['diePlaying'] is False,
                  (r['playingBefore'], r['diePlaying']))
            check('16.6 低優先權的 shot 搶不走 explode',
                  r['afterShot'] == ['shot'] and r['explodeWins'] == ['explode']
                  and r['shotLoses'] == ['explode'],
                  (r['afterShot'], r['explodeWins'], r['shotLoses']))
            od = r['ownedDuring']
            check('16.7 explode 期間 p2 / noi 被佔用，p1 / tri 沒有',
                  od['p2'] and od['noi'] and not od['p1'] and not od['tri'], od)
            check('16.8 搶佔期間音樂完全不寫 p2 / noi 暫存器',
                  r['musicP2'] == 0 and r['musicNoi'] == 0, (r['musicP2'], r['musicNoi']))
            check('16.9 搶佔期間音樂照常寫 p1 / tri（旋律低音不中斷）',
                  r['musicP1'] > 0 and r['musicTri'] > 0, (r['musicP1'], r['musicTri']))
            check('16.10 音效結束後音樂重寫 p2 / noi 把聲道拿回去',
                  r['restoreP2'] >= 4 and r['restoreNoi'] >= 2, (r['restoreP2'], r['restoreNoi']))
            check('16.11 回復後 APU 的 p2 = 音樂的音高、四軌都在播', r['backOk'], r['backOk'])
            check('16.12 CR.Audio 介面 init/play/stop/sfx/tick 齊全', r['api'], r['api'])

            # 17 10 秒離線渲染
            for key in ['stage1', 'boss']:
                r = page.evaluate('()=>T.cruiserRender(%r, 10)' % key)
                check('17.%s 10 秒渲染無 NaN / 峰值 %.4f ≤ 1.0 / 有訊號（RMS %.4f、%d 樣本）'
                      % (key, r['peak'], r['rms'], r['samples']),
                      r['nan'] == 0 and 0.02 < r['peak'] <= 1.0 and r['rms'] > 0.01, r)

        browser.close()

    npass = sum(1 for _, ok, _ in RESULTS if ok)
    nfail = len(RESULTS) - npass
    print('\n總計 %d 項，通過 %d，失敗 %d' % (len(RESULTS), npass, nfail))
    if nfail:
        print('失敗項目：')
        for name, ok, detail in RESULTS:
            if not ok:
                print('  -', name, '—', detail)
    return 1 if nfail else 0


if __name__ == '__main__':
    sys.exit(main())
