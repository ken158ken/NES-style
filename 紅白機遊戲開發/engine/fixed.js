/* engine/fixed.js — NES.FX：定點數工具（位置 1/16 px、速度 8.8）
 * R1 / agent core。classic script、IIFE、零相依。
 *
 * 單位系統（全部整數；命名與 docs/TASKS.md「API 契約」一致）
 * ┌──────────┬───────────────┬───────────────────────────────────────────┐
 * │ 名稱     │ 1 單位 =      │ 用途                                       │
 * ├──────────┼───────────────┼───────────────────────────────────────────┤
 * │ sub      │ 1/16 px       │ 位置（SUB = 16）                           │
 * │ vel      │ 1/256 px/幀   │ 速度 8.8（v88(hi,lo) = hi 整數 px + lo/256）│
 * │ acc      │ 1/4096 px/幀² │ 加速度（= 1/16 vel，ACC = 16）             │
 * └──────────┴───────────────┴───────────────────────────────────────────┘
 * 兩層換算都是「每 16 個小單位進位 1 個大單位」，所以累加一律用 >>4 / &15，
 * 負數用算術右移自然取 floor，餘數恆為 0..15，不會因正負號漂移。
 *
 * 與 SMB1 反組譯常數的對應（見下方 NES.FX.SMB）：
 *   SMB「速度值」1 單位 = 1/16 px/幀 = 16 vel
 *   SMB「加速度 / 摩擦」1 單位 = 1/256 速度值/幀 = 1/4096 px/幀² = 1 acc  ← 原始位元組可直接用
 *   SMB「重力值」1 單位 = 1/256 px/幀² = 1 vel/幀 = 16 acc
 */
(function (root) {
  'use strict';
  var NES = root.NES = root.NES || {};

  var SUB = 16;    // 位置：1 px = 16 sub
  var VEL = 256;   // 速度：1 px/幀 = 256 vel（8.8 的 .8）
  var ACC = 16;    // 加速度：1 vel/幀 = 16 acc（→ 1 px/幀² = 4096 acc）

  /* ---------- 位置換算 ---------- */
  function toSub(px) { return (px * SUB) | 0; }          // px → sub（截尾取整）
  function toPx(sub) { return (sub | 0) / SUB; }         // sub → px（唯一會回傳非整數的函式，顯示 / 除錯用）
  function floorPx(sub) { return (sub | 0) >> 4; }       // sub → px（向下取整，負數也正確）
  function ceilPx(sub) { return -((-(sub | 0)) >> 4); }
  function roundPx(sub) { return ((sub | 0) + 8) >> 4; }
  function subFrac(sub) { return (sub | 0) & 15; }       // 像素內的 1/16 餘數（0..15）

  /* ---------- 速度換算（8.8） ---------- */
  // v88(2, 128) = 2.5 px/幀 = 640；負速度傳負的 hi：v88(-2, 128) = -640
  function v88(hi, lo) {
    hi = hi | 0; lo = lo | 0;
    if (hi < 0) return -(((-hi) * VEL + (lo < 0 ? -lo : lo)) | 0);
    return (hi * VEL + lo) | 0;
  }
  function velToPx(v) { return (v | 0) / VEL; }                     // vel → px/幀
  function pxToVel(px) { return Math.round(px * VEL) | 0; }         // px/幀 → vel
  function accToPx(a) { return (a | 0) / (VEL * ACC); }             // acc → px/幀²
  function pxToAcc(px) { return Math.round(px * VEL * ACC) | 0; }   // px/幀² → acc
  function smbSpd(b) { return ((b | 0) * 16) | 0; }                 // SMB 速度值($xx) → vel
  function smbGrav(b) { return ((b | 0) * 16) | 0; }                // SMB 重力值($xx) → acc

  /* ---------- Vec：{sub, frac} 小物件，每幀零配置 ---------- */
  function Vec(px, frac) { return { sub: toSub(px || 0), frac: frac | 0 }; }
  function vecSub(sub, frac) { return { sub: sub | 0, frac: frac | 0 }; }
  function vadd(vec, v) {                    // 位置前進一幀，回傳新的 sub
    var f = vec.frac + (v | 0);
    var d = f >> 4;
    vec.frac = f - (d << 4);
    vec.sub = (vec.sub + d) | 0;
    return vec.sub;
  }
  function vsetPx(vec, px) { vec.sub = toSub(px); vec.frac = 0; return vec; }
  function vsetSub(vec, sub) { vec.sub = sub | 0; vec.frac = 0; return vec; }
  function vpx(vec) { return vec.sub >> 4; }
  function vpxf(vec) { return vec.sub / SUB; }

  /* ---------- Acc：{v, frac} 速度小物件（加速度累加用） ---------- */
  function Acc(v) { return { v: v | 0, frac: 0 }; }
  function aadd(av, a) {                     // 速度前進一幀，回傳新的 vel
    var f = av.frac + (a | 0);
    var d = f >> 4;
    av.frac = f - (d << 4);
    av.v = (av.v + d) | 0;
    return av.v;
  }
  function aset(av, v) { av.v = v | 0; av.frac = 0; return av; }
  // 朝 target 以 a（acc 單位）逼近並夾住，不會過衝
  function aapproach(av, target, a) {
    target = target | 0;
    if (av.v < target) { aadd(av, a); if (av.v > target) aset(av, target); }
    else if (av.v > target) { aadd(av, -(a | 0)); if (av.v < target) aset(av, target); }
    return av.v;
  }

  /* ---------- 相容別名（R1 fix1 定案：正式寫法是 Vec / Acc）----------
   * 舊契約 `addVel(posSub, v88) → {pos, frac}` 與舊實作 `addVel(posSub, v, frac) → int`
   * （餘數放在全域 `NES.FX.frac`）**都已作廢**：全域餘數在多實體（主角 + N 個敵人）
   * 之間會互相污染。正式寫法是把餘數放進物件本身：
   *     位置 `Vec{sub, frac}` + `vadd(vec, v)`　／　速度 `Acc{v, frac}` + `aadd(av, a)`
   * `addVel / addAcc` 保留為**明確版本的相容別名**（= vadd / aadd），沒有任何隱藏狀態。
   */
  function addVel(vec, v) {
    if (!vec || typeof vec !== 'object' || typeof vec.sub !== 'number') {
      throw new TypeError('NES.FX.addVel 已改為 addVel(vec, v)（vec = FX.Vec(px)）；' +
        '舊的 addVel(posSub, v, frac) 與全域 NES.FX.frac 已移除，見 docs/ENGINE_API.md §3');
    }
    return vadd(vec, v);
  }
  function addAcc(av, a) {
    if (!av || typeof av !== 'object' || typeof av.v !== 'number') {
      throw new TypeError('NES.FX.addAcc 已改為 addAcc(acc, a)（acc = FX.Acc(vel)）；' +
        '舊的 addAcc(v, a, frac) 已移除，見 docs/ENGINE_API.md §3');
    }
    return aadd(av, a);
  }

  /* ---------- 整數工具 ---------- */
  function clamp(v, lo, hi) { v = v | 0; lo = lo | 0; hi = hi | 0; return v < lo ? lo : (v > hi ? hi : v); }
  function sign(v) { v = v | 0; return v > 0 ? 1 : (v < 0 ? -1 : 0); }
  function abs(v) { v = v | 0; return v < 0 ? -v : v; }
  function absMax(v, m) { v = v | 0; m = m | 0; if (m < 0) m = -m; return v > m ? m : (v < -m ? -m : v); }
  function mulShr(a, b, s) { return ((a | 0) * (b | 0)) >> (s | 0); }  // 定點乘法

  /* ---------- SMB1 常數表 ----------
   * 來源：docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md ②「速度與加速度」「跳躍」
   *       原始出處 doppelganger《A Comprehensive SMB Disassembly》(SMBDIS.ASM)
   * 每一欄都標原始位元組與換算後的 px 值，方便回頭核對。
   */
  var SMB = {
    src: 'docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md（SMBDIS.ASM 反組譯）',

    // MaxRightXSpdData / MaxLeftXSpdData（原始為 1/16 px/幀 的速度值）
    maxRun:      smbSpd(0x28),   // $28 = 40 → 2.5  px/幀 = 640 vel
    maxWalk:     smbSpd(0x18),   // $18 = 24 → 1.5  px/幀 = 384 vel
    maxWater:    smbSpd(0x10),   // $10 = 16 → 1.0  px/幀 = 256 vel
    maxCutscene: smbSpd(0x0c),   // $0c = 12 → 0.75 px/幀 = 192 vel

    // FrictionData（原始為 1/256 速度值/幀 = 1 acc，數值可直接用）
    accRun:   0xe4,              // 228 → 0.05566 px/幀²（14.25 vel/幀）
    accWalk:  0x98,              // 152 → 0.03711 px/幀²（ 9.5  vel/幀）
    friction: 0xd0,              // 208 → 0.05078 px/幀²（13.0  vel/幀）
    turnShift: 1,                // 面向 ≠ 移動方向時 `asl` → 加速度 ×2（煞車/轉身快一倍）

    // 空中控制門檻：水平速度 ≥ $19（1.5625 px/幀）才沿用跑步上限與跑步加速度
    airRunSpeed: smbSpd(0x19),   // 400 vel

    /* 跳躍 5 段：依起跳瞬間的水平速度絕對值（vel）選段
     * belowSpeed = 該段的上界（最後一段為 Infinity）
     * vy0 = 起跳初速（vel，負 = 往上）；gHold/gFall = 按住 / 放開 A 的重力（acc）
     * h = 研究文件列的理論最高跳躍高度（px），僅供對照（離散積分會差 1~3 px）
     */
    jump: [
      { belowSpeed: smbSpd(0x09), vy0: -v88(4, 0), gHold: smbGrav(0x20), gFall: smbGrav(0x70), h: 64 },
      { belowSpeed: smbSpd(0x10), vy0: -v88(4, 0), gHold: smbGrav(0x20), gFall: smbGrav(0x70), h: 64 },
      { belowSpeed: smbSpd(0x19), vy0: -v88(4, 0), gHold: smbGrav(0x1e), gFall: smbGrav(0x60), h: 68 },
      { belowSpeed: smbSpd(0x1c), vy0: -v88(5, 0), gHold: smbGrav(0x28), gFall: smbGrav(0x90), h: 80 },
      { belowSpeed: Infinity,     vy0: -v88(5, 0), gHold: smbGrav(0x28), gFall: smbGrav(0x90), h: 80 }
    ],
    swim:      { vy0: -v88(2, 0), gHold: smbGrav(0x0d), gFall: smbGrav(0x0a) },
    whirlpool: { vy0: -v88(1, 0), gHold: smbGrav(0x04), gFall: smbGrav(0x09) },

    // 放開 A 後要離地 ≥ 1 px 才切成大重力（DiffToHaltJump）
    diffToHaltJump: SUB,         // 16 sub = 1 px

    // 敵人：NormalXSpdData（栗寶寶等）
    enemySlow: smbSpd(0x08),     // $f8 → 0.5  px/幀（表中為負方向，這裡存絕對值）
    enemyFast: smbSpd(0x0c),     // $f4 → 0.75 px/幀

    // 計時器節拍（幀）
    intervalTimer: 21,           // IntervalTimerControl：每 21 幀一跳（framerule）
    injuryFrames: 8 * 21,        // 168 幀 ≈ 2.80 秒
    starFrames: 35 * 21,         // 735 幀 ≈ 12.2 秒

    // 依水平速度取跳躍段
    jumpFor: function (absSpeedVel) {
      absSpeedVel = absSpeedVel < 0 ? -absSpeedVel : absSpeedVel;
      for (var i = 0; i < SMB.jump.length; i++) if (absSpeedVel < SMB.jump[i].belowSpeed) return SMB.jump[i];
      return SMB.jump[SMB.jump.length - 1];
    },

    /* ---- 起跳首幀的重力（R1 fix1 總控裁定；QA P1-4 / P1-5）----------------
     * 半隱式 Euler（每幀「先加重力、再位移」）會把跳躍高度系統性地低估半個
     * 重力步：靜止跳 62.00 px（文件 4 格 = 64）、全速跳 77.50 px（文件 5 格 = 80），
     * ⇒「剛好 4 格牆 / 5 格牆」的關卡會跳不過去。
     * 修正：**起跳後的第 1 幀只套用半格重力**（leapfrog / 中點積分），之後照常。
     *   離散積分和 = Σ(v0 − g(k+½)) = v0²/2g ＝ 連續解 ⇒ 靜止跳 64.00 px、全速跳 80.00 px（±0）。
     * skipGravityFirstFrame 三種值：
     *   true / 'half' 首幀半格重力 →  64.00 / 80.00 px（預設，對齊研究文件 03/01）
     *   'full'        首幀完全不加重力 → 66.00 / 82.50 px（超過文件 2 / 2.5 px）
     *   false         舊行為（純半隱式） → 62.00 / 77.50 px（比文件少 2 / 2.5 px）
     */
    skipGravityFirstFrame: true
  };

  /* ---------- 跳躍：core 與 demo 共用的唯一一套規則 ----------
   * 用法（見 games/demo/main.js stepPlayer）：
   *   var js = FX.SMB.jumpState(g.vy);               // 綁定自己的 Acc，零配置
   *   if (onGround && pressedA) FX.SMB.jumpStart(js, FX.abs(vx), py.sub);
   *   if (!onGround) FX.SMB.jumpGravity(js, aHeldNow, py.sub, MAX_FALL);
   *   FX.vadd(py, js.vy.v);                          // 先重力、再位移（半隱式）
   * 規則：① 依起跳瞬間 |vx| 取 5 段之一（jumpFor）
   *       ② 按住 A = gHold；放開 **且已離地 ≥ 1 px**（DiffToHaltJump）才切 gFall
   *       ③ 起跳首幀依 skipGravityFirstFrame 只套半格重力（見上）
   */
  function jumpState(vyAcc) {
    return {
      seg: SMB.jump[0],
      vy: vyAcc || Acc(0),
      fastFall: false,
      startSub: 0,
      first: false,
      skipFirst: SMB.skipGravityFirstFrame
    };
  }
  function jumpStart(js, absVxVel, pySub) {
    js.seg = SMB.jumpFor(absVxVel | 0);
    aset(js.vy, js.seg.vy0);
    js.fastFall = false;
    js.startSub = pySub | 0;
    js.first = true;
    return js;
  }
  // 重新設定垂直速度但不算「新的一次跳躍」（踩敵回彈、被彈飛…）
  function jumpBounce(js, vel, pySub) {
    aset(js.vy, vel | 0);
    js.fastFall = false;
    js.startSub = pySub | 0;
    js.first = false;
    return js;
  }
  function jumpGravity(js, aHeld, pySub, maxFall) {
    if (!aHeld && (js.startSub - (pySub | 0)) >= SMB.diffToHaltJump) js.fastFall = true;
    var g = js.fastFall ? js.seg.gFall : js.seg.gHold;
    if (js.first) {
      js.first = false;
      if (js.skipFirst === 'full') g = 0;
      else if (js.skipFirst) g = g >> 1;
    }
    aadd(js.vy, g);
    if (maxFall !== undefined && maxFall !== null && js.vy.v > (maxFall | 0)) aset(js.vy, maxFall | 0);
    return js.vy.v;
  }
  /* 純模擬：把上面那套規則跑到落回起跳高度，回傳最高點。
   * tools/test_core.py 與 games/demo/test_demo.py 量到的必須是同一個數字。
   *   jumpSim({hold:40})            靜止長按 → 64.00 px
   *   jumpSim({hold:40, vx:SMB.maxRun}) 全速長按 → 80.00 px
   *   jumpSim({hold:1})             點按 1 幀 → 19.6875 px
   */
  function jumpSim(opt) {
    opt = opt || {};
    var hold = opt.hold === undefined ? 40 : (opt.hold | 0);
    var vx = opt.vx === undefined ? 0 : (opt.vx | 0);
    var maxFall = opt.maxFall === undefined ? v88(4, 0) : (opt.maxFall | 0);
    var maxFrames = opt.maxFrames === undefined ? 600 : (opt.maxFrames | 0);
    var js = jumpState();
    if (opt.skipFirst !== undefined) js.skipFirst = opt.skipFirst;
    var pos = Vec(0), lo = 0, f = 0;
    jumpStart(js, vx, pos.sub);
    while (f < maxFrames) {
      jumpGravity(js, f < hold, pos.sub, maxFall);
      vadd(pos, js.vy.v);
      f++;
      if (pos.sub < lo) lo = pos.sub;
      if (pos.sub >= 0 && js.vy.v > 0) break;   // 回到起跳高度 = 落地
    }
    return { apexSub: -lo, apexPx: -lo / SUB, airFrames: f, vy: js.vy.v, seg: js.seg };
  }
  SMB.jumpState = jumpState;
  SMB.jumpStart = jumpStart;
  SMB.jumpBounce = jumpBounce;
  SMB.jumpGravity = jumpGravity;
  SMB.jumpSim = jumpSim;

  NES.FX = {
    SUB: SUB, VEL: VEL, ACC: ACC,
    toSub: toSub, toPx: toPx, floorPx: floorPx, ceilPx: ceilPx, roundPx: roundPx, subFrac: subFrac,
    v88: v88, velToPx: velToPx, pxToVel: pxToVel, accToPx: accToPx, pxToAcc: pxToAcc,
    smbSpd: smbSpd, smbGrav: smbGrav,
    addVel: addVel, addAcc: addAcc,
    Vec: Vec, vecSub: vecSub, vadd: vadd, vsetPx: vsetPx, vsetSub: vsetSub, vpx: vpx, vpxf: vpxf,
    Acc: Acc, aadd: aadd, aset: aset, aapproach: aapproach,
    clamp: clamp, sign: sign, abs: abs, absMax: absMax, mulShr: mulShr,
    SMB: SMB
  };
})(typeof window !== 'undefined' ? window : this);
