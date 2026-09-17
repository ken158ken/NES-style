# -*- coding: utf-8 -*-
"""core 模組自動測試：engine/fixed.js、engine/input.js、engine/cpu_timing.js。

只載入 core 自己的三個檔（about:blank + add_script_tag），不依賴其他 engine 模組。
用法：../卡比之星/.venv/bin/python tools/test_core.py [-v]
"""
import sys
import json
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / 'engine'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r want=%r' % (got, want)))


def near(name, got, want, tol, detail=''):
    ok(name, abs(got - want) <= tol, detail or ('got=%r want=%r ±%r' % (got, want, tol)))


# ---------------------------------------------------------------- fixed.js
JS_FIXED = r"""
() => {
  const F = window.NES.FX, R = {};
  R.units = [F.SUB, F.VEL, F.ACC];

  // 來回轉換（所有 1/16 px 的倍數都必須完全復原）
  R.roundtrip = [0, 1, 2.5, -3.25, 15.0625, -0.0625, 255.9375].map(p => F.toPx(F.toSub(p)));
  R.floorNeg = [F.floorPx(F.toSub(2.9)), F.floorPx(F.toSub(-2.9)), F.floorPx(-1), F.floorPx(-16)];
  R.subFrac = [F.subFrac(F.toSub(2.5)), F.subFrac(F.toSub(-0.0625))];

  // v88
  R.v88 = [F.v88(2, 128), F.v88(1, 128), F.v88(0, 40), F.v88(-2, 128), F.v88(-1, 0)];
  R.velToPx = F.velToPx(640);

  // 餘數累積（正式寫法 Vec）：v=9（非 16 倍數），16 幀後剛好整除
  const pv = F.Vec(0); const trace = [];
  for (let i = 0; i < 16; i++) { F.vadd(pv, 9); trace.push([pv.sub, pv.frac]); }
  R.acc9 = [pv.sub, pv.frac]; R.acc9first = trace[0]; R.acc9mid = trace[7];

  // 負速度：floor 語意，餘數恆 0..15
  const nv = F.Vec(0); let minFrac = 99, maxFrac = -1;
  for (let i = 0; i < 16; i++) { F.vadd(nv, -9); if (nv.frac < minFrac) minFrac = nv.frac; if (nv.frac > maxFrac) maxFrac = nv.frac; }
  R.accNeg = [nv.sub, nv.frac, minFrac, maxFrac];
  R.accNegFirst = (() => { const q = F.Vec(0); F.vadd(q, -9); return [q.sub, q.frac]; })();

  // addVel 已改成「明確版本」的相容別名：addVel(vec, v) === vadd(vec, v)，沒有全域餘數
  const v = F.Vec(0), v2 = F.Vec(0); let same = true;
  for (let i = 0; i < 97; i++) {
    F.vadd(v, 37); F.addVel(v2, 37);
    if (v.sub !== v2.sub || v.frac !== v2.frac) same = false;
  }
  R.vecSame = same; R.vecEnd = [v.sub, v.frac];
  R.noGlobalFrac = (F.frac === undefined) && (F.addVel.frac === undefined);
  // 舊簽章（傳數字）必須明確報錯，而不是安靜算錯
  R.oldSigThrows = (() => { try { F.addVel(0, 384, 0); return false; } catch (e) { return /addVel\(vec, v\)/.test(e.message); } })();
  R.addAccAlias = (() => { const a = F.Acc(0); F.addAcc(a, 9); const b = F.Acc(0); F.aadd(b, 9); return a.v === b.v && a.frac === b.frac; })();

  // SMB 常數表
  const S = F.SMB;
  R.smb = [S.maxRun, S.maxWalk, S.maxWater, S.maxCutscene, S.accRun, S.accWalk, S.friction, S.airRunSpeed];
  R.smbPx = [F.velToPx(S.maxRun), F.velToPx(S.maxWalk), F.velToPx(S.maxWater), F.velToPx(S.maxCutscene)];
  R.jumpFor = [F.velToPx(S.jumpFor(0).vy0), F.velToPx(S.jumpFor(S.maxRun).vy0), F.velToPx(S.jumpFor(400).vy0)];

  // 等速位移：60 幀 × 2.5 px/幀 = 150 px = 2400 sub（必須完全相等）
  const run = F.Vec(0); for (let i = 0; i < 60; i++) F.vadd(run, S.maxRun);
  R.runDist = [run.sub, run.frac];
  const walk = F.Vec(0); for (let i = 0; i < 60; i++) F.vadd(walk, S.maxWalk);
  R.walkDist = [walk.sub, walk.frac];

  // 從靜止加速到上限所需幀數
  function framesToMax(a, max) {
    const av = F.Acc(0); let n = 0;
    while (av.v < max && n < 1000) { F.aadd(av, a); n++; }
    return n;
  }
  R.framesRun = framesToMax(S.accRun, S.maxRun);
  R.framesWalk = framesToMax(S.accWalk, S.maxWalk);
  R.framesTurn = framesToMax(S.accRun << S.turnShift, S.maxRun);

  // 跳躍：一律走 NES.FX.SMB 的共用規則（games/demo/main.js 用同一組函式 ⇒ 兩邊同一個數字）
  R.skipDefault = S.skipGravityFirstFrame;
  // 各段「按到頂」的最高點：用該段的速度區間去選段，確保 jumpFor 真的選到第 i 段
  R.apex = S.jump.map((j, i) => {
    const vx = (j.belowSpeed === Infinity) ? S.maxRun : (j.belowSpeed - 1);
    return [S.jumpSim({ hold: 400, vx: vx }).apexPx, j.h];
  });
  R.stand = S.jumpSim({ hold: 40 });                       // 靜止長按（文件 4 格 = 64 px）
  R.run = S.jumpSim({ hold: 40, vx: S.maxRun });           // 全速長按（文件 5 格 = 80 px）
  R.tap = S.jumpSim({ hold: 1 });                          // 點 1 幀（A 放開後離地 ≥1px 才切大重力）
  R.standOff = S.jumpSim({ hold: 40, skipFirst: false }).apexPx;   // 關掉開關 = 舊行為
  R.runOff = S.jumpSim({ hold: 40, vx: S.maxRun, skipFirst: false }).apexPx;
  R.standFull = S.jumpSim({ hold: 40, skipFirst: 'full' }).apexPx; // 整幀略過 = 過高
  // 逐幀 API（demo 用的那組）必須與 jumpSim 得到同一結果
  R.manual = (() => {
    const js = S.jumpState(), pos = F.Vec(0);
    S.jumpStart(js, 0, pos.sub);
    let lo = 0, f = 0;
    for (; f < 400; f++) {
      S.jumpGravity(js, f < 40, pos.sub, F.v88(4, 0));
      F.vadd(pos, js.vy.v);
      if (pos.sub < lo) lo = pos.sub;
      if (pos.sub >= 0 && js.vy.v > 0) { f++; break; }
    }
    return [-lo / F.SUB, f];
  })();
  // 放開 A 之後才切大重力（DiffToHaltJump：離地 ≥ 1 px）
  R.fastFallDelay = (() => {
    const js = S.jumpState(), pos = F.Vec(0);
    S.jumpStart(js, 0, pos.sub);
    const flags = [];
    for (let i = 0; i < 3; i++) { S.jumpGravity(js, false, pos.sub, 0); F.vadd(pos, js.vy.v); flags.push(js.fastFall); }
    return flags;
  })();
  R.swimApex = (() => {
    const av = F.Acc(S.swim.vy0), pv = F.Vec(0); let lo = 0;
    for (let i = 0; i < 400; i++) { F.aadd(av, S.swim.gHold); F.vadd(pv, av.v); if (pv.sub < lo) lo = pv.sub; if (av.v > 0 && pv.sub >= 0) break; }
    return -lo / F.SUB;
  })();

  // 整數工具
  R.tools = [F.clamp(5, 0, 3), F.clamp(-5, 0, 3), F.clamp(2, 0, 3),
             F.sign(-9), F.sign(0), F.sign(9),
             F.absMax(700, 640), F.absMax(-700, 640), F.absMax(-100, 640), F.absMax(700, -640)];
  return R;
}
"""


def test_fixed(page):
    print('[fixed.js]')
    R = page.evaluate(JS_FIXED)
    eq('SUB/VEL/ACC = 16/256/16', R['units'], [16, 256, 16])
    eq('toSub/toPx 來回（1/16 px 倍數完全復原）', R['roundtrip'],
       [0, 1, 2.5, -3.25, 15.0625, -0.0625, 255.9375])
    eq('floorPx 負數向下取整', R['floorNeg'], [2, -3, -1, -1])
    eq('subFrac 像素內餘數', R['subFrac'], [8, 15])
    eq('v88(hi,lo) 8.8 編碼（含負號）', R['v88'], [640, 384, 40, -640, -256])
    eq('velToPx(640) = 2.5 px/幀', R['velToPx'], 2.5)
    eq('Vec 餘數累積 16 幀 v=9 → sub 9 / frac 0', R['acc9'], [9, 0])
    eq('Vec 第 1 幀 v=9 → sub 0 / frac 9', R['acc9first'], [0, 9])
    eq('Vec 第 8 幀 v=9 → sub 4 / frac 8', R['acc9mid'], [4, 8])
    eq('Vec 負速度 16 幀 v=-9 → sub -9 / frac 0', R['accNeg'][:2], [-9, 0])
    ok('Vec 負速度餘數恆在 0..15', R['accNeg'][2] >= 0 and R['accNeg'][3] <= 15, R['accNeg'][2:])
    eq('Vec 負速度第 1 幀 floor 語意', R['accNegFirst'], [-1, 7])
    ok('addVel(vec,v) 相容別名 = vadd（97 幀 v=37）', R['vecSame'], R['vecEnd'])
    ok('addAcc(acc,a) 相容別名 = aadd', R['addAccAlias'])
    ok('全域餘數已移除（NES.FX.frac / addVel.frac 都不存在，QA P1-3）', R['noGlobalFrac'])
    ok('舊簽章 addVel(posSub, v, frac) 會明確 throw 而不是算錯', R['oldSigThrows'])
    eq('Vec 97 幀 v=37 → sub/frac', R['vecEnd'], [(97 * 37) // 16, (97 * 37) % 16])

    eq('SMB 速度/加速度常數（vel / acc）', R['smb'],
       [640, 384, 256, 192, 228, 152, 208, 400])
    eq('SMB 速度換算 px/幀（研究 03 ②）', R['smbPx'], [2.5, 1.5, 1.0, 0.75])
    eq('SMB jumpFor 分段初速（px/幀）', R['jumpFor'], [-4, -5, -5])
    eq('等速 60 幀 @2.5px/f = 2400 sub（±0）', R['runDist'], [2400, 0])
    eq('等速 60 幀 @1.5px/f = 1440 sub（±0）', R['walkDist'], [1440, 0])
    ok('靜止→跑步上限 ≈45 幀（研究 03 ②）', 44 <= R['framesRun'] <= 46, R['framesRun'])
    ok('靜止→走路上限 ≈40 幀（研究 03 ②）', 39 <= R['framesWalk'] <= 41, R['framesWalk'])
    ok('轉身加速度 ×2 → 幀數約減半', 22 <= R['framesTurn'] <= 24, R['framesTurn'])
    ok('起跳首幀半格重力（skipGravityFirstFrame）預設為開', R['skipDefault'] is True, R['skipDefault'])
    for i, (got, want) in enumerate(R['apex']):
        ok('跳躍段 %d 最高點 = %d px（文件值，容差 ±1）' % (i, want), abs(got - want) <= 1,
           'got=%.4f px want=%d px' % (got, want))
    ok('長按靜止跳 = 4 格 64 px（±1，QA P1-5）', abs(R['stand']['apexPx'] - 64) <= 1,
       '%.4f px / 滯空 %d 幀' % (R['stand']['apexPx'], R['stand']['airFrames']))
    ok('長按全速跳 = 5 格 80 px（±1，QA P1-5）', abs(R['run']['apexPx'] - 80) <= 1,
       '%.4f px / 滯空 %d 幀' % (R['run']['apexPx'], R['run']['airFrames']))
    ok('點按 1 幀的短跳 = 19.6875 px（demo 量到同一個數字，QA P1-4）',
       abs(R['tap']['apexPx'] - 19.6875) < 1e-9, '%.4f px' % R['tap']['apexPx'])
    ok('短按跳 < 長按跳（可變高度跳成立）', R['tap']['apexPx'] < R['stand']['apexPx'] - 20,
       '%.4f / %.4f' % (R['tap']['apexPx'], R['stand']['apexPx']))
    ok('逐幀 API（jumpState/jumpStart/jumpGravity）與 jumpSim 同結果',
       abs(R['manual'][0] - R['stand']['apexPx']) < 1e-9 and R['manual'][1] == R['stand']['airFrames'],
       '%s vs %.4f/%d' % (R['manual'], R['stand']['apexPx'], R['stand']['airFrames']))
    eq('放開 A：離地 ≥1 px 之後才切大重力（DiffToHaltJump）', R['fastFallDelay'], [False, True, True])
    ok('skipGravityFirstFrame=false → 回到舊的 62 / 77.5 px',
       R['standOff'] == 62 and R['runOff'] == 77.5, '%s / %s' % (R['standOff'], R['runOff']))
    ok("skipGravityFirstFrame='full' → 66 px（超過文件 2 px，所以預設用 half）",
       R['standFull'] == 66, R['standFull'])
    ok('水中跳躍初速 -2 px/f 的高度 < 陸上', R['swimApex'] < R['apex'][0][0], '%.2f px' % R['swimApex'])
    eq('clamp/sign/absMax', R['tools'], [3, 0, 2, -1, 0, 1, 640, -640, -100, 640])


# ---------------------------------------------------------------- input.js
JS_INPUT_BTN = "() => { const B = window.NES.Input.BTN; return [B.A,B.B,B.SELECT,B.START,B.UP,B.DOWN,B.LEFT,B.RIGHT]; }"

JS_INPUT_INJECT = r"""
() => {
  const I = window.NES.Input, B = I.BTN;
  I.reset();
  I.inject(B.RIGHT, 3);
  const rows = [];
  for (let i = 0; i < 5; i++) {
    I.poll();
    rows.push([I.mask(), I.held(B.RIGHT), I.pressed(B.RIGHT), I.released(B.RIGHT)]);
  }
  return rows;
}
"""

JS_INPUT_SEQ = r"""
() => {
  const I = window.NES.Input, B = I.BTN;
  I.reset();
  I.inject(B.RIGHT, 2).inject(B.RIGHT | B.A, 2).inject(0, 1);
  const rows = [];
  for (let i = 0; i < 6; i++) {
    I.poll();
    rows.push([I.mask(), I.pressed(B.A), I.released(B.A), I.pressed(B.RIGHT), I.released(B.RIGHT)]);
  }
  return { rows: rows, pendingAfter: I.injectPending() };
}
"""

JS_INPUT_RECORD = r"""
() => {
  const I = window.NES.Input, B = I.BTN;
  I.reset();
  I.record();
  I.inject(B.RIGHT, 3).inject(B.RIGHT | B.A, 2).inject(B.LEFT, 2).inject(0, 1);
  for (let i = 0; i < 8; i++) I.poll();
  const rec = I.stopRecord();
  // 重播：同一份紀錄必須逐幀重現
  I.reset();
  I.replay(rec);
  const back = [];
  for (let i = 0; i < 8; i++) { I.poll(); back.push(I.mask()); }
  // 重播用完後回到鍵盤來源
  I.poll();
  return { rec: rec, back: back, afterReplay: I.mask(), pending: I.replayPending() };
}
"""

JS_INPUT_KB_BEFORE = r"""
() => {
  const I = window.NES.Input, B = I.BTN;
  return { live: I.liveMask(), held: I.held(B.RIGHT), mask: I.mask() };
}
"""
JS_INPUT_KB_AFTER = r"""
() => {
  const I = window.NES.Input, B = I.BTN;
  I.poll();
  return { held: I.held(B.RIGHT), pressed: I.pressed(B.RIGHT), mask: I.mask() };
}
"""


def test_input(page):
    print('[input.js]')
    eq('BTN 位元 A/B/SELECT/START/UP/DOWN/LEFT/RIGHT', page.evaluate(JS_INPUT_BTN),
       [1, 2, 4, 8, 16, 32, 64, 128])

    rows = page.evaluate(JS_INPUT_INJECT)
    eq('inject 3 幀的遮罩序列', [r[0] for r in rows], [128, 128, 128, 0, 0])
    eq('held 只在注入期間為真', [r[1] for r in rows], [True, True, True, False, False])
    eq('pressed 只在第 1 幀（上緣）', [r[2] for r in rows], [True, False, False, False, False])
    eq('released 只在第 4 幀（下緣）', [r[3] for r in rows], [False, False, False, True, False])

    S = page.evaluate(JS_INPUT_SEQ)
    eq('連續多段 inject 的遮罩序列', [r[0] for r in S['rows']], [128, 128, 129, 129, 0, 0])
    eq('A pressed 只在第 3 幀', [r[1] for r in S['rows']], [False, False, True, False, False, False])
    eq('A released 只在第 5 幀', [r[2] for r in S['rows']], [False, False, False, False, True, False])
    eq('RIGHT pressed 只在第 1 幀（跨段不重觸發）', [r[3] for r in S['rows']],
       [True, False, False, False, False, False])
    eq('inject 佇列跑完歸零', S['pendingAfter'], 0)

    # inject(mask, 0) = 放開 / 清空佇列（nes.js 除錯 API 的 release 語意）
    Z = page.evaluate("""() => { const I = window.NES.Input; I.reset();
        I.inject(I.BTN.RIGHT, 10); const a = I.injectPending();
        I.inject(0, 0); const b = I.injectPending();
        I.poll(); return [a, b, I.mask()]; }""")
    eq('inject(m,0) 清空佇列並回到鍵盤來源', Z, [10, 0, 0])

    R = page.evaluate(JS_INPUT_RECORD)
    eq('record 取得 8 幀', len(R['rec']), 8)
    eq('record 內容', R['rec'], [128, 128, 128, 129, 129, 64, 64, 0])
    eq('replay 逐幀重現一致', R['back'], R['rec'])
    eq('replay 用完後回到鍵盤來源（0）', R['afterReplay'], 0)
    eq('replay 佇列歸零', R['pending'], 0)

    # 鍵盤：事件不得在 poll 之外改變 held
    page.evaluate("() => window.NES.Input.reset()")
    page.keyboard.down('ArrowRight')
    before = page.evaluate(JS_INPUT_KB_BEFORE)
    eq('鍵盤按下後 liveMask 已更新', before['live'], 128)
    eq('poll 之前 held 仍為 false（一幀一取樣）', before['held'], False)
    eq('poll 之前 mask 仍為 0', before['mask'], 0)
    after = page.evaluate(JS_INPUT_KB_AFTER)
    eq('poll 之後 held 為 true', after['held'], True)
    eq('poll 之後 pressed 為 true（上緣）', after['pressed'], True)

    # 鍵盤放開同樣要等下一次 poll
    page.keyboard.up('ArrowRight')
    still = page.evaluate("() => ({held: window.NES.Input.held(128), live: window.NES.Input.liveMask()})")
    eq('鍵盤放開後 liveMask 歸零', still['live'], 0)
    eq('鍵盤放開後 poll 之前 held 仍為 true', still['held'], True)
    eq('下一次 poll 後 released', page.evaluate(
        "() => { const I = window.NES.Input; I.poll(); return [I.held(128), I.released(128)]; }"), [False, True])

    # inject 優先於鍵盤
    page.evaluate("() => window.NES.Input.reset()")
    page.keyboard.down('ArrowLeft')
    pr = page.evaluate("""() => { const I = window.NES.Input; I.inject(I.BTN.RIGHT, 1);
        I.poll(); const a = I.mask(); I.poll(); const b = I.mask(); return [a, b]; }""")
    page.keyboard.up('ArrowLeft')
    eq('inject 優先於鍵盤（第 1 幀 RIGHT、第 2 幀回鍵盤 LEFT）', pr, [128, 64])

    # remap
    rm = page.evaluate("""() => { const I = window.NES.Input; I.reset(); I.resetMap();
        I.remap({KeyJ: 'A'}); return I.keymap()['KeyJ']; }""")
    eq('remap 寫入自訂鍵', rm, 'A')
    page.keyboard.down('KeyJ')
    rmv = page.evaluate("() => { const I = window.NES.Input; I.poll(); return I.held(I.BTN.A); }")
    page.keyboard.up('KeyJ')
    ok('remap 後的鍵可用', rmv, rmv)
    page.evaluate("() => { window.NES.Input.resetMap(); window.NES.Input.reset(); }")

    eq('maskToString / parseMask 對稱', page.evaluate(
        "() => { const I = window.NES.Input; const m = I.parseMask('right|a'); return [m, I.maskToString(m)]; }"),
       [129, 'A|RIGHT'])


# ---------------------------------------------------------------- cpu_timing.js
JS_TIMING_STEP = r"""
() => {
  const I = window.NES.Input;
  I.reset();
  const log = { u: 0, d: 0, order: [], masks: [] };
  const t = window.NES.Timing.create({
    update: (f) => { log.u++; log.order.push('u' + f); log.masks.push(I.mask()); },
    draw: (f) => { log.d++; log.order.push('d' + f); }
  });
  I.inject(I.BTN.RIGHT, 2).inject(I.BTN.A, 1);
  t.step(60);
  return { frame: t.frame, u: log.u, d: log.d, head: log.order.slice(0, 4),
           masks: log.masks.slice(0, 4), polls: I.pollCount(), hz: t.hz, mode: t.mode };
}
"""

JS_TIMING_BUDGET = r"""
() => {
  const T = window.NES.Timing;
  const t = T.create({ update: () => { t.budget.use(100); t.budget.use(100); } });
  t.budget.set(160);
  t.step(1);
  const a = { over: t.budget.over, used: t.budget.used, overFrames: t.budget.overFrames };
  t.step(1);
  const b = { over: t.budget.over, used: t.budget.used, overFrames: t.budget.overFrames, peak: t.budget.peak };
  // 預算內不應超支
  const t2 = T.create({ update: () => { t2.budget.use(150); } });
  t2.budget.set(160);
  t2.step(5);
  const c = { over: t2.budget.over, overFrames: t2.budget.overFrames, left: t2.budget.left() };
  return { a: a, b: b, c: c, defaultLimit: T.create({}).budget.limit };
}
"""

# OAM DMA 通道 / strict / mute / serial（R1 fix1：QA P1-6 的介面）
JS_TIMING_BUDGET2 = r"""
() => {
  const T = window.NES.Timing, t = T.create({});
  const b = t.budget;
  b.clear();
  // ① OAM 與 PPU 是兩條獨立通道：一幀寫滿 64 精靈（256 byte）不算超支
  for (let i = 0; i < 64; i++) b.use(4, 'oam');
  b.use(39);                                   // 名稱表 26 + 屬性 13（demo 每幀補欄）
  const a = { over: b.over, used: b.used, oamUsed: b.oamUsed, left: b.left(), oamLeft: b.oamLeft() };
  // ② OAM 超過 256 才算超支
  b.use(4, 'oam');
  const c = { over: b.over, overKind: b.overKind, overBy: b.overBy };
  // ③ reset 每幀清空並推進 serial
  const s0 = b.serial; b.reset();
  const d = { used: b.used, oamUsed: b.oamUsed, over: b.over, serialUp: b.serial - s0 };
  // ④ mute 期間完全不計帳（__nes.render() 重畫用）
  b.mute = true; b.use(1000); b.use(1000, 'oam'); b.mute = false;
  const e = { used: b.used, oamUsed: b.oamUsed, over: b.over };
  // ⑤ strict = 超支直接 throw
  b.strict = true;
  let msg = null;
  try { b.use(1000); } catch (err) { msg = err.message; }
  b.strict = false; b.clear();
  return { a: a, c: c, d: d, e: e, strictMsg: msg, report: Object.keys(b.report()).sort() };
}
"""

JS_TIMING_MODE = r"""
() => {
  const t = window.NES.Timing.create({});
  const ntsc = [t.hz, t.mode, t.stepMs()];
  t.setMode('pal');
  const pal = [t.hz, t.mode, t.stepMs(), t.budget.limit];
  t.setMode('ntsc');
  const back = [t.hz, t.mode, t.budget.limit];
  let threw = false; try { t.setMode('secam'); } catch (e) { threw = true; }
  return { ntsc: ntsc, pal: pal, back: back, threw: threw, HZ: window.NES.Timing.HZ };
}
"""


def test_timing(page):
    print('[cpu_timing.js]')
    R = page.evaluate(JS_TIMING_STEP)
    eq('step(60) → frame 恰為 60', R['frame'], 60)
    eq('update 呼叫 60 次', R['u'], 60)
    eq('draw 呼叫 60 次', R['d'], 60)
    eq('每幀順序 update → draw', R['head'], ['u0', 'd0', 'u1', 'd1'])
    eq('Input.poll 每幀一次（60 次）', R['polls'], 60)
    eq('poll 在 update 之前（update 內看得到注入的遮罩）', R['masks'], [128, 128, 1, 0])
    near('預設 hz = 60.0988', R['hz'], 60.0988, 1e-6)
    eq('預設模式 ntsc', R['mode'], 'ntsc')

    B = page.evaluate(JS_TIMING_BUDGET)
    eq('budget 預設 160 bytes（NTSC VBlank）', B['defaultLimit'], 160)
    eq('用量 200 > 160 → over', B['a']['over'], True)
    eq('over 幀數 1', B['a']['overFrames'], 1)
    eq('下一幀 reset 後 used 重算', B['b']['used'], 200)
    eq('over 幀數累計 2', B['b']['overFrames'], 2)
    eq('peak 記錄單幀最高用量', B['b']['peak'], 200)
    eq('預算內不 over', B['c']['over'], False)
    eq('預算內 overFrames 0', B['c']['overFrames'], 0)
    eq('budget.left() 正確', B['c']['left'], 10)

    B2 = page.evaluate(JS_TIMING_BUDGET2)
    eq('OAM 是獨立通道：64 精靈 256 byte + 名稱表 39 byte 不超支',
       [B2['a']['over'], B2['a']['used'], B2['a']['oamUsed']], [False, 39, 256])
    eq('budget.left()/oamLeft() 分開算', [B2['a']['left'], B2['a']['oamLeft']], [121, 0])
    eq('OAM 超過 256 byte（第 65 個精靈）才算超支',
       [B2['c']['over'], B2['c']['overKind'], B2['c']['overBy']], [True, 'oam', 4])
    eq('reset() 清空兩條通道並推進 serial（PPU 用它判斷換幀）',
       [B2['d']['used'], B2['d']['oamUsed'], B2['d']['over'], B2['d']['serialUp']], [0, 0, False, 1])
    eq('budget.mute 期間完全不計帳（__nes.render 重畫用）',
       [B2['e']['used'], B2['e']['oamUsed'], B2['e']['over']], [0, 0, False])
    ok('budget.strict = true → 超支直接 throw', bool(B2['strictMsg']) and '超支' in B2['strictMsg'],
       B2['strictMsg'])
    eq('budget.report() 欄位', B2['report'],
       sorted(['limit', 'used', 'peak', 'left', 'oamLimit', 'oamUsed', 'oamPeak',
               'over', 'overFrames', 'overBy', 'overKind', 'strict']))

    M = page.evaluate(JS_TIMING_MODE)
    near('NTSC hz', M['ntsc'][0], 60.0988, 1e-6)
    near('NTSC 步長 ms', M['ntsc'][2], 1000 / 60.0988, 1e-6)
    near('PAL hz = 50.0070', M['pal'][0], 50.0070, 1e-6)
    eq('setMode 切換 mode 字串', [M['ntsc'][1], M['pal'][1], M['back'][1]], ['ntsc', 'pal', 'ntsc'])
    near('PAL 步長 ms', M['pal'][2], 1000 / 50.0070, 1e-6)
    eq('PAL 的 VBlank 預算較大', M['pal'][3] > 160, True)
    eq('切回 NTSC 預算回到 160', M['back'][2], 160)
    eq('未知模式 throw', M['threw'], True)
    eq('HZ 表', [round(M['HZ']['ntsc'], 4), round(M['HZ']['pal'], 4)], [60.0988, 50.007])

    # rAF 迴圈：start/stop 與丟幀上限
    page.evaluate("""() => {
        window.__t = window.NES.Timing.create({ update: () => {}, draw: () => {} });
        window.__t.start();
    }""")
    page.wait_for_timeout(600)
    L = page.evaluate("""() => { const t = window.__t; const r = t.running; t.stop();
        return { running: r, stopped: t.running, frame: t.frame }; }""")
    eq('start() 後 running = true', L['running'], True)
    eq('stop() 後 running = false', L['stopped'], False)
    ok('rAF 迴圈 600ms 內推進合理幀數（10~50）', 10 <= L['frame'] <= 50, L['frame'])
    after = page.evaluate("() => { const f = window.__t.frame; return f; }")
    page.wait_for_timeout(150)
    eq('stop() 之後不再推進', page.evaluate("() => window.__t.frame"), after)

    # 一次 rAF 最多補 3 幀後丟幀（直接驗迴圈上限參數）
    D = page.evaluate("""() => {
        const t = window.NES.Timing.create({ maxCatchUp: 3 });
        t.step(3); const f = t.frame; t.reset();
        return { f: f, frame: t.frame, dropped: t.dropped };
    }""")
    eq('reset() 清空 frame/dropped', [D['f'], D['frame'], D['dropped']], [3, 0, 0])


# ---------------------------------------------------------------- main
def main():
    files = [ENGINE / 'fixed.js', ENGINE / 'input.js', ENGINE / 'cpu_timing.js']
    for f in files:
        if not f.exists():
            print('缺少檔案：%s' % f)
            return 2
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto('about:blank')
        for f in files:
            page.add_script_tag(path=str(f))
        loaded = page.evaluate("() => Object.keys(window.NES).sort()")
        ok('三個模組都掛上 window.NES', loaded == ['FX', 'Input', 'Timing'], loaded)
        test_fixed(page)
        test_input(page)
        test_timing(page)
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 60)
    print('core 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 60)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
