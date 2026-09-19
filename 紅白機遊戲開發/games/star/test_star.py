# -*- coding: utf-8 -*-
"""《星塵勇者》主角層自動驗證（star-hero）：手感 ±1 幀 / 狀態機 / 碰撞 / 鏡頭 / HUD / 預算 / lint。

作法：Playwright(Chromium) 開 `star.html?debug=1&scale=1&mute=1&level=<關>`，
用 tools/shot.py 同一套除錯 API（`__nes.step/press/tap/release/render/state/lint/stats`）
與 `window.GAME.dev`（本層自己的測試鉤子）推進與取樣；不改任何 engine 檔、不依賴別人的檔。

**大部分測試跑內建測試關 `?level=test`**（main.js 定義，20+ 欄平地 + 4 磚牆 + 坑 + 單向平台
+ ? 磚 + 金幣 + 尖刺 + 熔岩 + GOAL），這樣 star-world 的 W1 四關還在改也不會讓本檔變紅；
另有一組「真關卡」測試，`ST.LEVELS['1-1']` 在場時才跑（缺席自動 SKIP）。

期望值來源（每一條都標）：
  [研究] docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md ②「速度與加速度」「跳躍」
         （原始出處 SMBDIS.ASM 反組譯）：走 1.5 / 跑 2.5 px 幀、加速 45 / 40 幀、
         跳躍 5 段（4 格 64 px / 5 格 80 px）、受傷無敵 168 幀（8 × 21）
  [引擎] engine/fixed.js `NES.FX.SMB`（常數表 + 唯一一套跳躍規則，R1 fix1 起跳首幀半格重力）
         ⇒ 長按靜止跳 64.00 px、全速跑跳 80.00 px、點按 1 幀 19.6875 px
  [契約] docs/TASKS.md「R2b §契約」：受傷無敵 **120 幀**（刻意與 SMB 的 168 不同，任務指定）、
         踩敵回彈 −3 px/幀、碰撞框 12×22（蹲 12×14）、鏡頭往右 40% 觸發

用法：../卡比之星/.venv/bin/python games/star/test_star.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import math
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def near(name, got, lo, hi, detail=''):
    ok(name, got is not None and lo <= got <= hi, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


def fresh(page, level='test'):
    """重新載入頁面（?level=<關> 會跳過標題直接進 play）。"""
    page.goto(BASE + '&level=' + level)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    return page.evaluate('() => window.GAME.state()')


# =====================================================================  ① 手感
JS_CONST = r"""
() => {
  const S = NES.FX.SMB, FX = NES.FX;
  return {
    maxWalk: S.maxWalk, maxRun: S.maxRun, accWalk: S.accWalk, accRun: S.accRun,
    friction: S.friction, turnShift: S.turnShift, airRunSpeed: S.airRunSpeed,
    skipFirst: S.skipGravityFirstFrame, ACC: FX.ACC, VEL: FX.VEL,
    simTap: S.jumpSim({ hold: 1 }).apexPx,
    simHold: S.jumpSim({ hold: 40 }).apexPx,
    simRun: S.jumpSim({ hold: 40, vx: S.maxRun }).apexPx,
    simRunAir: S.jumpSim({ hold: 40, vx: S.maxRun }).airFrames,
    injurySMB: S.injuryFrames,
    heroInv: ST.Hero.INV_FRAMES, hurtFrames: ST.Hero.HURT_FRAMES, heroW: ST.Hero.W, heroH: ST.Hero.H, crouchH: ST.Hero.CROUCH_H,
    bounce: ST.Hero.BOUNCE
  };
}
"""

JS_ACCEL = r"""
(opt) => {
  const S = () => window.GAME.state();
  GAME.dev.warp(8); __nes.step(2);
  const keys = opt.run ? ['b', 'right'] : ['right'];
  const target = opt.run ? NES.FX.SMB.maxRun : NES.FX.SMB.maxWalk;
  let frames = -1;
  for (let i = 0; i < 120; i++) {
    __nes.press(keys, 1);
    if (S().vx >= target) { frames = i + 1; break; }
  }
  __nes.press(keys, 1);
  const s = S();
  return { frames, vx: s.vx, vxPx: s.vxPx, state: s.state };
}
"""

JS_JUMP = r"""
(opt) => {
  const S = () => window.GAME.state();
  GAME.dev.warp(8);
  __nes.step(2);
  if (opt.run) for (let i = 0; i < opt.run; i++) __nes.press(['b', 'right'], 1);
  const t0 = S();
  let air = 0;
  if (opt.hold <= 1) { __nes.tap('a', 1); air++; }
  else for (let i = 0; i < opt.hold; i++) { __nes.press(opt.run ? ['a', 'b', 'right'] : ['a'], 1); air++; }
  __nes.release();
  while (!S().onGround && air++ < 240) { if (opt.run) __nes.press(['b', 'right'], 1); else __nes.step(1); }
  const s = S();
  return {
    heightPx: (t0.ySub - s.apexSub) / 16,
    distPx: s.x - t0.x, airFrames: air, landed: s.onGround,
    vxAtJump: t0.vx, y: s.y
  };
}
"""

JS_BRAKE = r"""
() => {
  const S = () => window.GAME.state();
  GAME.dev.warp(8);  __nes.step(2);
  for (let i = 0; i < 50; i++) __nes.press(['b', 'right'], 1);      // 先到跑步上限（45 幀）
  const full = S().vx;
  let turn = -1;
  // 按住 B 轉身 ⇒ 用跑步加速度（accRun），面向 ≠ 移動方向再 ×2
  for (let i = 0; i < 120 && turn < 0; i++) { __nes.press(['b', 'left'], 1); if (S().vx <= 0) turn = i + 1; }
  GAME.dev.warp(8);  __nes.step(2);
  for (let i = 0; i < 50; i++) __nes.press(['b', 'right'], 1);
  let fric = -1;
  __nes.release();
  for (let i = 0; i < 200 && fric < 0; i++) { __nes.step(1); if (S().vx === 0) fric = i + 1; }
  return { full, turn, fric };
}
"""


def test_feel(page, C):
    print('[① 手感（±1 幀；對照研究 03/01 常數表 + engine/fixed.js SMB）]')
    fresh(page)
    walk = page.evaluate(JS_ACCEL, {'run': 0})
    run = page.evaluate(JS_ACCEL, {'run': 1})
    # 期望值：上限速度 ÷ 每幀加速量（acc/16）；[研究] 41 / 45 幀
    exp_walk = math.ceil(C['maxWalk'] / (C['accWalk'] / C['ACC']))
    exp_run = math.ceil(C['maxRun'] / (C['accRun'] / C['ACC']))
    near('靜止→走路上限 %d 幀（±1；研究 03/01 ②「約 40 幀」）' % exp_walk,
         walk['frames'], exp_walk - 1, exp_walk + 1, 'frames=%s' % walk['frames'])
    ok('走路上限 = 1.5 px/幀（384 vel；MaxLeft/RightXSpdData $18）',
       walk['vx'] == 384 and walk['vxPx'] == 1.5, walk['vxPx'])
    near('靜止→跑步上限 %d 幀（±1；研究 03/01 ②「約 45 幀」）' % exp_run,
         run['frames'], exp_run - 1, exp_run + 1, 'frames=%s' % run['frames'])
    ok('跑步上限 = 2.5 px/幀（640 vel；$28）', run['vx'] == 640 and run['vxPx'] == 2.5, run['vxPx'])
    ok('B 鍵跑步時狀態為 run', run['state'] == 'run', run['state'])

    tap = page.evaluate(JS_JUMP, {'hold': 1, 'run': 0})
    hold = page.evaluate(JS_JUMP, {'hold': 40, 'run': 0})
    runj = page.evaluate(JS_JUMP, {'hold': 40, 'run': 60})
    ok('起跳首幀半格重力預設為開（skipGravityFirstFrame）', C['skipFirst'] is True, C['skipFirst'])
    ok('長按靜止跳 = 64 px（4 格；[引擎] jumpSim 64.00）', abs(hold['heightPx'] - 64) <= 1,
       '%.4f px' % hold['heightPx'])
    ok('長按全速跑跳 = 80 px（5 格；[引擎] jumpSim 80.00）', abs(runj['heightPx'] - 80) <= 1,
       '%.4f px' % runj['heightPx'])
    ok('點按 1 幀 = 19.6875 px（[引擎] jumpSim）', abs(tap['heightPx'] - 19.6875) < 1e-9,
       '%.4f px' % tap['heightPx'])
    ok('點按跳 == NES.FX.SMB.jumpSim（同一套規則）', abs(tap['heightPx'] - C['simTap']) < 1e-9,
       '%.4f vs %.4f' % (tap['heightPx'], C['simTap']))
    ok('長按靜止跳 == jumpSim', abs(hold['heightPx'] - C['simHold']) < 1e-9,
       '%.4f vs %.4f' % (hold['heightPx'], C['simHold']))
    ok('長按全速跳 == jumpSim', abs(runj['heightPx'] - C['simRun']) < 1e-9,
       '%.4f vs %.4f' % (runj['heightPx'], C['simRun']))
    ok('短按跳明顯低於長按跳（可變高度跳成立）', tap['heightPx'] < hold['heightPx'] - 20,
       '%.2f / %.2f' % (tap['heightPx'], hold['heightPx']))
    ok('全速跳比靜止跳高（5 段跳躍表生效）', runj['heightPx'] > hold['heightPx'] + 10,
       '%.2f > %.2f' % (runj['heightPx'], hold['heightPx']))
    ok('三次跳躍都正常落地', tap['landed'] and hold['landed'] and runj['landed'])
    # 跑跳水平距離：全速 2.5 px/幀 × 滯空幀數（±4 px 容許碰撞對齊誤差）
    exp_dist = 2.5 * C['simRunAir']
    near('全速跑跳水平距離 ≈ %.0f px（2.5 px/幀 × %d 滯空幀）' % (exp_dist, C['simRunAir']),
         runj['distPx'], exp_dist - 5, exp_dist + 5,
         'dist=%s 期望 %.1f±5（airFrames 實測 %s / sim %s）'
         % (runj['distPx'], exp_dist, runj['airFrames'], C['simRunAir']))
    near('跑跳滯空幀數與 jumpSim 相同（±1）', runj['airFrames'], C['simRunAir'] - 1, C['simRunAir'] + 1,
         '%s vs %s' % (runj['airFrames'], C['simRunAir']))

    br = page.evaluate(JS_BRAKE)
    exp_turn = math.ceil(C['maxRun'] / (C['accRun'] * 2 / C['ACC']))
    exp_fric = math.ceil(C['maxRun'] / (C['friction'] / C['ACC']))
    ok('跑步上限 640 vel（煞車測試前置）', br['full'] == 640, br['full'])
    near('轉身（面向≠移動方向 ⇒ 加速度 ×2）煞到 0 需 %d 幀（±1）' % exp_turn,
         br['turn'], exp_turn - 1, exp_turn + 1, 'frames=%s' % br['turn'])
    near('放開方向鍵靠摩擦停下需 %d 幀（±1；FrictionData $d0）' % exp_fric,
         br['fric'], exp_fric - 1, exp_fric + 1, 'frames=%s' % br['fric'])


# =====================================================================  ② 狀態機
JS_STATES = r"""
() => {
  const S = () => window.GAME.state();
  const out = {};
  GAME.dev.warp(8); __nes.step(2);
  out.idle = S().state;
  __nes.press(['right'], 6); out.walk = S().state;
  __nes.press(['b', 'right'], 60); out.run = S().state;
  __nes.release(); __nes.step(60); out.backIdle = S().state;
  // 跳 → 落 → 回地面
  __nes.press(['a'], 3); out.jump = S().state; out.jumpVy = S().vy;
  for (let i = 0; i < 40 && S().vy <= 0; i++) __nes.press(['a'], 1);
  out.fall = S().state;
  __nes.release();
  let n = 0; while (!S().onGround && n++ < 200) __nes.step(1);
  out.land = S().state;
  // 蹲
  __nes.press(['down'], 3);
  out.crouch = S().state; out.crouchFlag = S().crouch;
  const g = GAME.dev.hero();
  out.crouchBoxH = g.h; out.crouchY = S().y;
  __nes.release(); __nes.step(3);
  out.standBoxH = GAME.dev.hero().h; out.standY = S().y;
  // 高速 + 蹲 = 滑行
  GAME.dev.warp(8); __nes.step(2);
  for (let i = 0; i < 50; i++) __nes.press(['b', 'right'], 1);
  __nes.press(['b', 'right', 'down'], 1);
  out.slide = S().state; out.slideVx = S().vx;
  __nes.release(); __nes.step(90);
  // 受傷
  GAME.dev.warp(8); __nes.step(2);
  const before = S();
  GAME.dev.hurt(before.x + 40);
  __nes.step(1);
  out.hurt = S().state; out.hurtInv = S().inv; out.hurtVx = S().vx;
  let k = 0; while (S().state === 'hurt' && k++ < 120) __nes.step(1);
  out.hurtFrames = k; out.afterHurtInv = S().inv;
  return out;
}
"""


def test_states(page, C):
    print('[② 狀態機轉移]')
    fresh(page)
    R = page.evaluate(JS_STATES)
    ok('靜止 = idle', R['idle'] == 'idle', R['idle'])
    ok('按右 = walk', R['walk'] == 'walk', R['walk'])
    ok('按 B + 右 = run', R['run'] == 'run', R['run'])
    ok('放開後摩擦停下回 idle', R['backIdle'] == 'idle', R['backIdle'])
    ok('按 A 起跳 = jump（vy < 0）', R['jump'] == 'jump' and R['jumpVy'] < 0,
       '%s vy=%s' % (R['jump'], R['jumpVy']))
    ok('上升轉下墜 = fall', R['fall'] == 'fall', R['fall'])
    ok('落地回 idle/walk', R['land'] in ('idle', 'walk'), R['land'])
    ok('按下 = crouch', R['crouch'] == 'crouch' and R['crouchFlag'] is True, R['crouch'])
    ok('蹲下碰撞框 = 12×%d（契約）' % C['crouchH'], R['crouchBoxH'] == C['crouchH'], R['crouchBoxH'])
    ok('蹲下時腳不動（y 下移 %d = 22−14）' % (C['heroH'] - C['crouchH']),
       R['crouchY'] - R['standY'] == C['heroH'] - C['crouchH'],
       '蹲 y=%s 站 y=%s' % (R['crouchY'], R['standY']))
    ok('放開下鍵站回 12×%d' % C['heroH'], R['standBoxH'] == C['heroH'], R['standBoxH'])
    ok('高速時按下 = slide（|vx| ≥ maxWalk）', R['slide'] == 'slide' and abs(R['slideVx']) >= C['maxWalk'],
       '%s vx=%s' % (R['slide'], R['slideVx']))
    ok('受傷 = hurt 狀態', R['hurt'] == 'hurt', R['hurt'])
    ok('受傷無敵 = 120 幀（[契約] R2b；SMB 原版為 %d）' % C['injurySMB'],
       R['hurtInv'] in (119, 120) and C['heroInv'] == 120, '%s（受傷當幀已倒數 1）' % R['hurtInv'])
    ok('受傷有擊退（vx 反向）', R['hurtVx'] < 0, R['hurtVx'])
    near('受傷硬直 %d 幀後恢復可控（±1）' % C['hurtFrames'], R['hurtFrames'], C['hurtFrames'] - 1, C['hurtFrames'] + 1, R['hurtFrames'])
    ok('硬直結束後無敵仍在倒數', 0 < R['afterHurtInv'] < 120, R['afterHurtInv'])


JS_INV = r"""
() => {
  const S = () => window.GAME.state();
  const ppu = __nes.nes().ppu;
  GAME.dev.warp(8); __nes.step(2);
  GAME.dev.hurt(S().x + 40);
  let on = 0, off = 0, frames = 0;
  while (S().inv > 0 && frames++ < 200) { __nes.step(1); const o = ppu.oam[0]; ((o.on && o.y < 240) ? on++ : off++); }
  return { frames, on, off, inv: S().inv, hits: S().hits };
}
"""


def test_invincible(page):
    print('[②b 無敵 120 幀 + 閃爍]')
    fresh(page)
    R = page.evaluate(JS_INV)
    near('無敵剛好 120 幀（±1）', R['frames'], 119, 121, R['frames'])
    ok('無敵期間主角 OAM 交替開 / 關（閃爍）', R['on'] > 20 and R['off'] > 20,
       '顯示 %d 幀 / 隱藏 %d 幀' % (R['on'], R['off']))
    ok('無敵結束後 inv 歸零', R['inv'] == 0, R['inv'])
    ok('受傷只算一次（hits = 1）', R['hits'] == 1, R['hits'])


# =====================================================================  ③ 單向平台
JS_ONEWAY = r"""
() => {
  const S = () => window.GAME.state();
  const T = ST.TILE, d = GAME.dev;
  const L = GAME.dev.layout();
  const platRow = L.PLAT_ROW, platCol = (L.PLAT[0] + L.PLAT[1]) >> 1;
  const out = { tile: d.tileAt(platCol, platRow), kind: d.kindAt(platCol, platRow) };
  // ① 從下方往上跳：不應該被擋（穿過去）
  d.warp(platCol * 8, L.GROUND_ROW * 8 - 22);
  __nes.step(2);
  let maxUp = 999;
  for (let i = 0; i < 40; i++) { __nes.press(['a'], 1); if (S().y < maxUp) maxUp = S().y; }
  __nes.release();
  out.topWhileRising = maxUp;
  out.passedUp = maxUp < platRow * 8 - 10;         // 頭已高過平台面
  // ② 下落時被平台接住
  let n = 0; while (!S().onGround && n++ < 200) __nes.step(1);
  out.landedY = S().y;
  out.landedOnPlat = S().y === platRow * 8 - 22;
  out.landedState = S().state;
  // ③ 蹲 + A 穿下去
  __nes.press(['down'], 3);
  __nes.press(['down', 'a'], 2);
  out.dropThru = S().dropThru;
  __nes.release();
  let m = 0; while (!S().onGround && m++ < 200) __nes.step(1);
  out.afterDropY = S().y;
  out.droppedThrough = S().y > platRow * 8;
  return out;
}
"""


def test_oneway(page):
    print('[③ 單向平台：下跳穿過 / 上落接住 / 蹲+A 穿下]')
    fresh(page)
    R = page.evaluate(JS_ONEWAY)
    ok('測試關的浮台是單向平台（solidKind = oneway）', R['kind'] == 'oneway', R['kind'])
    ok('從下方往上跳不會被平台擋住', R['passedUp'],
       'topWhileRising=%s（平台面 y=%s）' % (R['topWhileRising'], 21 * 8))
    ok('下落時被單向平台接住', R['landedOnPlat'], 'y=%s 期望 %s' % (R['landedY'], 21 * 8 - 22))
    ok('落到平台上狀態為 idle/walk', R['landedState'] in ('idle', 'walk'), R['landedState'])
    ok('蹲 + A 觸發穿下（dropThru > 0）', R['dropThru'] > 0, R['dropThru'])
    ok('穿下去後落到下面的地面', R['droppedThrough'], 'y=%s' % R['afterDropY'])


# =====================================================================  ④ 危險磚
JS_HAZARD = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev, T = ST.TILE;
  const L = GAME.dev.layout();
  const out = {};
  out.spikeKind = d.kindAt(L.SPIKE, L.SPIKE_ROW);
  d.warp((L.SPIKE - 3) * 8);
  __nes.step(2);
  const before = S();
  for (let i = 0; i < 40 && S().hits === before.hits; i++) __nes.press(['right'], 1);
  const hit = S();
  out.spikeHits = hit.hits; out.spikeInv = hit.inv; out.spikeState = hit.state;
  out.spikeAlive = hit.state !== 'dead'; out.spikeLives = hit.lives;
  out.lavaKind = d.kindAt(L.LAVA[0] + 1, L.GROUND_ROW);
  d.warp((L.LAVA[0] - 3) * 8);
  __nes.step(2);
  let n = 0;
  while (S().state !== 'dead' && n++ < 200) __nes.press(['b', 'right'], 1);
  out.lavaDead = S().state === 'dead'; out.lavaFrames = n;
  return out;
}
"""

JS_PIT = r"""
() => {
  const S = () => window.GAME.state();
  const L = GAME.dev.layout();
  GAME.dev.warp((L.PIT[0] - 2) * 8);
  __nes.step(2);
  let n0 = 0;
  while (S().checkpoint < 0 && n0++ < 400) __nes.press(['right'], 1);   // 先過檢查點
  const lives0 = S().lives, cp = S().checkpoint;
  let n = 0;
  while (S().state !== 'dead' && n++ < 400) __nes.press(['right'], 1);
  const dead = S();
  let m = 0;
  while (S().mode === 'dead' && m++ < 300) __nes.step(1);
  const after = S();
  return { fell: dead.state === 'dead', deadFrames: m, mode: after.mode,
           lives0, lives: after.lives, x: after.x, checkpoint: cp, deaths: after.deaths };
}
"""


def test_hazard(page):
    print('[④ 尖刺 / 熔岩 / 坑 / 死亡回檢查點]')
    fresh(page)
    R = page.evaluate(JS_HAZARD)
    ok('尖刺的 solidKind = hurt', R['spikeKind'] == 'hurt', R['spikeKind'])
    ok('踩到尖刺 → 受傷（hits +1）', R['spikeHits'] >= 1, R['spikeHits'])
    ok('踩到尖刺 → 無敵 120 幀', R['spikeInv'] >= 118, R['spikeInv'])
    ok('踩到尖刺 → 不會立刻死（命數不變）', R['spikeAlive'] and R['spikeLives'] == 3,
       'state=%s lives=%s' % (R['spikeState'], R['spikeLives']))
    ok('熔岩的 solidKind = hurt', R['lavaKind'] == 'hurt', R['lavaKind'])
    ok('碰到熔岩 → 立即死亡（不是受傷）', R['lavaDead'], 'frames=%s' % R['lavaFrames'])

    fresh(page)
    P = page.evaluate(JS_PIT)
    ok('掉進坑 → 死亡', P['fell'])
    near('死亡動畫 60 幀（跳起 → 落出畫面）±2', P['deadFrames'], 58, 62, P['deadFrames'])
    ok('死亡後回到 play 模式（還有命）', P['mode'] == 'play', P['mode'])
    ok('死亡 → lives −1', P['lives'] == P['lives0'] - 1, '%s → %s' % (P['lives0'], P['lives']))
    exp_x = (P['checkpoint'] * 8) if P['checkpoint'] and P['checkpoint'] > 0 else 32
    ok('死亡 → 回最近的檢查點（第 %s 欄 = x %s）' % (P['checkpoint'], exp_x),
       abs(P['x'] - exp_x) <= 8, 'x=%s checkpoint=%s' % (P['x'], P['checkpoint']))
    ok('死亡計數 deaths = 1', P['deaths'] == 1, P['deaths'])


JS_GAMEOVER = r"""
() => {
  const S = () => window.GAME.state();
  GAME.dev.setLives(0);
  const L = GAME.dev.layout();
  GAME.dev.warp((L.PIT[0] - 2) * 8); __nes.step(2);
  let n = 0;
  while (S().mode !== 'gameover' && n++ < 800) __nes.press(['right'], 1);
  return { mode: S().mode, lives: S().lives, frames: n };
}
"""


def test_gameover(page):
    print('[④b 命數用盡 → GAME OVER]')
    fresh(page)
    R = page.evaluate(JS_GAMEOVER)
    ok('lives = 0 時再死一次 → mode = gameover', R['mode'] == 'gameover',
       'mode=%s lives=%s frames=%s' % (R['mode'], R['lives'], R['frames']))


JS_TIMEUP = r"""
() => {
  const S = () => window.GAME.state();
  GAME.dev.warp(64); GAME.dev.setTime(1);
  let n = 0;
  while (S().state !== 'dead' && n++ < 120) __nes.step(1);
  return { dead: S().state === 'dead', time: S().time, frames: n };
}
"""


def test_timeup(page):
    print('[④c 時間歸零 → 死亡]')
    fresh(page)
    R = page.evaluate(JS_TIMEUP)
    ok('TIME 歸零 → 主角死亡', R['dead'], 'time=%s frames=%s' % (R['time'], R['frames']))


# =====================================================================  ⑤ 金幣 / ? 磚
JS_COIN = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev, T = ST.TILE;
  const L = d.layout(), CC = L.COINS[0], CR = L.COIN_ROW;
  const out = {};
  out.tileBefore = d.tileAt(CC, CR);
  out.ntBefore = d.ntTileAt(CC, CR);
  d.warp((CC - 3) * 8); __nes.step(2);
  const b = S();
  for (let i = 0; i < 80 && S().coins === b.coins; i++) __nes.press(['right'], 1);
  const a1 = S();
  out.coins = a1.coins; out.score = a1.score - b.score;
  out.tileAfter = d.tileAt(CC, CR);
  out.ntAfter = d.ntTileAt(CC, CR);
  return out;
}
"""

JS_QBLOCK = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev, T = ST.TILE;
  const L = d.layout(), QC = L.QBLOCK[0], QR = L.BLOCK_ROW, BC = L.BRICK;
  const out = { before: d.tileAt(QC, QR) };
  d.warp(QC * 8); __nes.step(2);
  const b = S();
  for (let i = 0; i < 40 && S().bumps === b.bumps; i++) __nes.press(['a'], 1);
  __nes.release(); __nes.step(2);
  const a1 = S();
  out.after = d.tileAt(QC, QR);
  out.nt = d.ntTileAt(QC, QR);
  out.ntUsed = ST.bgBank.has('F_USED') ? ST.bgBank.index('F_USED') : -1;
  out.bumps = a1.bumps; out.coins = a1.coins - b.coins; out.score = a1.score - b.score;
  out.pops = a1.pops;
  // BRICK：頂撞但不變 USED
  d.warp(BC * 8); __nes.step(2);
  const b2 = S();
  for (let i = 0; i < 40 && S().bumps === b2.bumps; i++) __nes.press(['a'], 1);
  __nes.release(); __nes.step(2);
  out.brickTile = d.tileAt(BC, QR);
  out.brickBumps = S().bumps - b2.bumps;
  out.brickCode = ST.TILE.BRICK;
  return out;
}
"""

JS_1UP = r"""
() => {
  const S = () => window.GAME.state();
  const L = GAME.dev.layout();
  GAME.dev.warp((L.COINS[0] - 3) * 8);
  GAME.dev.setCoins(99);
  GAME.dev.setLives(3);
  __nes.step(2);
  const b = S();
  for (let i = 0; i < 80 && S().oneUps === 0; i++) __nes.press(['right'], 1);
  const a = S();
  return { coins0: b.coins, coins: a.coins, lives0: b.lives, lives: a.lives, oneUps: a.oneUps };
}
"""


def test_items(page):
    print('[⑤ 金幣 / ? 磚 / BRICK 頂撞 / 100 金幣 1UP]')
    fresh(page)
    R = page.evaluate(JS_COIN)
    ok('走過金幣 → coins +1 以上', R['coins'] >= 1, R['coins'])
    ok('金幣加 200 分（SMB 慣例）', R['score'] >= 200, R['score'])
    ok('金幣磚被撿走後變 EMPTY', R['tileAfter'] == 0, '%s → %s' % (R['tileBefore'], R['tileAfter']))
    ok('名稱表同步更新（撿走那一格的磚變了）', R['ntAfter'] != R['ntBefore'],
       '%s → %s' % (R['ntBefore'], R['ntAfter']))

    fresh(page)
    Q = page.evaluate(JS_QBLOCK)
    ok('頂到 ? 磚（bumps > 0）', Q['bumps'] > 0, Q['bumps'])
    ok('? 磚變成 USED', Q['after'] == (5 if Q['before'] == 4 else Q['after']) and Q['after'] != Q['before'],
       '%s → %s' % (Q['before'], Q['after']))
    ok('? 磚的名稱表磚同步換成 USED 的圖', Q['nt'] == Q['ntUsed'] or Q['ntUsed'] < 0,
       'nt=%s used=%s' % (Q['nt'], Q['ntUsed']))
    ok('? 磚頂出金幣（coins +1、分數 +200）', Q['coins'] == 1 and Q['score'] == 200,
       'coins=%s score=%s' % (Q['coins'], Q['score']))
    ok('? 磚頂出金幣粒子（pops > 0）', Q['pops'] > 0, Q['pops'])
    ok('BRICK 頂撞不會變成 USED（只震動）', Q['brickTile'] == Q['brickCode'], Q['brickTile'])
    ok('BRICK 頂撞有計入 bumps', Q['brickBumps'] > 0, Q['brickBumps'])

    fresh(page)
    U = page.evaluate(JS_1UP)
    ok('第 100 枚金幣 → 1UP（lives +1）', U['lives'] == U['lives0'] + 1 and U['oneUps'] == 1,
       'lives %s → %s oneUps=%s' % (U['lives0'], U['lives'], U['oneUps']))
    ok('1UP 後金幣數歸零重算', U['coins'] < 5, U['coins'])


# =====================================================================  ⑥ 鏡頭 / 串流
JS_CAM = r"""
() => {
  const S = () => window.GAME.state();
  GAME.dev.warp(8);
  __nes.step(2);
  let first = null;
  for (let i = 0; i < 400 && !first; i++) {
    __nes.press(['right'], 1);
    const s = S();
    if (s.camX > 0) first = { camX: s.camX, x: s.x, screenX: s.screenX };
  }
  for (let i = 0; i < 200; i++) __nes.press(['b', 'right'], 1);
  const mid = S();
  for (let i = 0; i < 30; i++) __nes.press(['left'], 1);          // 先把向右動量煞掉
  const turned = S();
  for (let i = 0; i < 60; i++) __nes.press(['left'], 1);
  const midLeft = S();
  for (let i = 0; i < 160; i++) __nes.press(['left'], 1);
  const back = S();
  return { first, midCam: mid.camX, midX: mid.x,
           turnCam: turned.camX, turnX: turned.x,
           midLeftCam: midLeft.camX, midLeftScreenX: midLeft.screenX,
           backCam: back.camX, backX: back.x, backScreenX: back.screenX,
           camMin: back.camMin, scrNext: back.scrNext, scrLeft: back.scrLeft };
}
"""

JS_NTCHECK = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev;
  GAME.dev.warp(8); __nes.step(2);
  for (let i = 0; i < 400; i++) __nes.press(['b', 'right'], 1);   // 一路往右（右邊補欄）
  let bad = [];
  let s = S();
  let c0 = s.camX >> 3;
  for (let c = c0; c < c0 + 33; c++) {
    for (let r = 4; r < 30; r++) {
      if (d.ntTileAt(c, r) !== d.bgIndexAt(c, r)) { bad.push([c, r]); if (bad.length > 4) break; }
    }
    if (bad.length > 4) break;
  }
  const rightBad = bad.slice();
  for (let i = 0; i < 260; i++) __nes.press(['left'], 1);          // 回捲（左邊補欄）
  bad = [];
  s = S();
  c0 = s.camX >> 3;
  for (let c = c0; c < c0 + 33; c++) {
    for (let r = 4; r < 30; r++) {
      if (d.ntTileAt(c, r) !== d.bgIndexAt(c, r)) { bad.push([c, r]); if (bad.length > 4) break; }
    }
    if (bad.length > 4) break;
  }
  return { rightBad, leftBad: bad, camX: s.camX, scrNext: s.scrNext, scrLeft: s.scrLeft };
}
"""


def test_camera(page):
    print('[⑥ 鏡頭雙向鎖 + 名稱表補欄]')
    fresh(page)
    R = page.evaluate(JS_CAM)
    f = R['first'] or {}
    ok('鏡頭在主角到達畫面 40%（102 px）時才開始右捲',
       f.get('screenX') == 102 and f.get('camX') == f.get('x') - 102, json.dumps(f))
    ok('繼續往右 → 鏡頭跟著右捲', R['midCam'] > f.get('camX', 0),
       'cam %s → %s' % (f.get('camX'), R['midCam']))
    ok('往左走 → 鏡頭會回捲（雙向鎖，不是 demo 的單向）', R['backCam'] < R['turnCam'],
       'cam %s → %s' % (R['turnCam'], R['backCam']))
    ok('往左回捲途中主角維持在畫面 25% 左右（screenX ≈ 64）', 56 <= R['midLeftScreenX'] <= 72,
       'screenX=%s camX=%s' % (R['midLeftScreenX'], R['midLeftCam']))
    ok('回捲途中鏡頭確實在動（camX 變小）', R['midLeftCam'] < R['turnCam'],
       '%s → %s' % (R['turnCam'], R['midLeftCam']))
    ok('回捲不會超過名稱表還留著的最左欄（camX ≥ camMin）', R['backCam'] >= R['camMin'],
       'camX=%s camMin=%s' % (R['backCam'], R['camMin']))
    ok('主角不會被推出畫面左緣（screenX ≥ 0）', R['backScreenX'] >= 0, R['backScreenX'])

    fresh(page)
    N = page.evaluate(JS_NTCHECK)
    ok('往右捲 400 幀後，畫面上每一格名稱表 == tileAt 應有的磚（右側補欄正確）',
       len(N['rightBad']) == 0, json.dumps(N['rightBad'][:5]))
    ok('往左回捲 260 幀後，畫面上每一格名稱表仍然一致（左側補欄正確）',
       len(N['leftBad']) == 0, json.dumps(N['leftBad'][:5]))
    ok('Scroller 的 next / scrLeft 相距 ≤ 64 欄（環形視窗不重疊）',
       N['scrNext'] - N['scrLeft'] <= 64, 'next=%s left=%s' % (N['scrNext'], N['scrLeft']))


# =====================================================================  ⑦ HUD
JS_HUD = r"""
() => {
  const d = GAME.dev, ppu = __nes.nes().ppu;
  const bank = ST.bgBank;
  function read(row, col, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const t = ppu.getTile(0, col + i, row);
      const n = bank.names[bank.names.findIndex(k => bank.index(k) === t)];
      s += n === undefined ? '?' : n;
      s += '|';
    }
    return s;
  }
  function digits(row, col, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const t = ppu.getTile(0, col + i, row);
      let ch = '?';
      for (let k = 0; k <= 9; k++) if (bank.index('N' + k) === t) ch = String(k);
      s += ch;
    }
    return s;
  }
  const out = {};
  out.score0 = digits(2, 1, 6);
  out.time0 = digits(2, 16, 3);
  out.lives0 = digits(1, 30, 1);
  out.coins0 = digits(2, 12, 2);
  GAME.dev.setScore(123456); GAME.dev.setCoins(42); GAME.dev.setLives(5); GAME.dev.setTime(77);
  __nes.step(2);
  out.score1 = digits(2, 1, 6);
  out.coins1 = digits(2, 12, 2);
  out.lives1 = digits(1, 30, 1);
  out.time1 = digits(2, 16, 3);
  // 只寫有變的格：把分數個位 +1，這一幀名稱表寫入量應該很小
  const bud = __nes.nes().timing.budget;
  __nes.step(1);
  bud.clear();
  GAME.dev.setScore(123457);
  __nes.step(1);
  out.oneDigitBytes = bud.peak;
  // HUD 那 4 列的屬性必須是調色盤 0（白字）
  out.attr = [ppu.getAttr(0, 0, 0), ppu.getAttr(0, 8, 1), ppu.getAttr(0, 15, 1)];
  return out;
}
"""


def test_hud(page):
    print('[⑦ HUD：SCORE / COIN / TIME / WORLD / 命；只寫有變的格]')
    fresh(page)
    R = page.evaluate(JS_HUD)
    ok('初始 SCORE 顯示 000000', R['score0'] == '000000', R['score0'])
    ok('初始 TIME 顯示 300', R['time0'] == '300', R['time0'])
    ok('初始命數顯示 3', R['lives0'] == '3', R['lives0'])
    ok('初始 COIN 顯示 00', R['coins0'] == '00', R['coins0'])
    ok('分數改成 123456 後 HUD 同步', R['score1'] == '123456', R['score1'])
    ok('金幣改成 42 後 HUD 同步', R['coins1'] == '42', R['coins1'])
    ok('命數改成 5 後 HUD 同步', R['lives1'] == '5', R['lives1'])
    ok('時間改成 77 後 HUD 顯示 077', R['time1'] == '077', R['time1'])
    ok('只改一位數時，該幀名稱表寫入 ≤ 4 byte（只寫有變的格）', R['oneDigitBytes'] <= 4,
       'peak=%s byte' % R['oneDigitBytes'])
    ok('HUD 四列的屬性全是調色盤 0（白字）', all(a == 0 for a in R['attr']), R['attr'])


# =====================================================================  ⑧ 預算 / lint
JS_BUDGET = r"""
() => {
  const nes = __nes.nes(), bud = nes.timing.budget;
  GAME.dev.warp(8); __nes.step(2);
  bud.clear();
  let peak = 0, over = 0, oamPeak = 0;
  for (let i = 0; i < 400; i++) {
    __nes.press(['b', 'right'], 1);
    if (bud.used > peak) peak = bud.used;
    if (bud.oamUsed > oamPeak) oamPeak = bud.oamUsed;
    if (bud.over) over++;
  }
  for (let i = 0; i < 200; i++) {                 // 再往左回捲（左邊補欄也要在預算內）
    __nes.press(['left'], 1);
    if (bud.used > peak) peak = bud.used;
    if (bud.over) over++;
  }
  return { peak, over, overFrames: bud.overFrames, limit: bud.limit,
           oamPeak, oamLimit: bud.oamLimit, report: __nes.stats().budget };
}
"""

JS_LINT = r"""
() => {
  const bad = []; let maxColors = 0;
  GAME.dev.warp(8); __nes.step(2);
  for (let i = 0; i < 150; i++) {
    __nes.press(['b', 'right'], 1);
    const r = __nes.lint();
    if (r.colors > maxColors) maxColors = r.colors;
    if (!r.ok || r.colors > 25 || r.badPixels > 0) bad.push({ f: i, ok: r.ok, colors: r.colors, bad: r.badPixels });
  }
  return { bad, maxColors };
}
"""


def test_budget_lint(page):
    print('[⑧ VBlank 預算 + lint（≤ 25 色）]')
    fresh(page)
    R = page.evaluate(JS_BUDGET)
    ok('預算上限 = 160 byte / 幀（NTSC VBlank）', R['limit'] == 160, R['limit'])
    ok('600 幀（右捲 400 + 左捲 200）全程 budget.over === 0',
       R['over'] == 0 and R['overFrames'] == 0, 'over %d 幀' % R['over'])
    ok('單幀名稱表寫入尖峰 ≤ 160 byte', 0 < R['peak'] <= 160, 'peak=%s byte' % R['peak'])
    ok('補一欄 26 磚 + 13 屬性 = 39 byte（加 HUD 仍遠低於上限）', R['peak'] <= 120, R['peak'])
    ok('OAM 走獨立 DMA 通道（256 byte，不佔那 160）',
       R['oamPeak'] == 256 and R['oamLimit'] == 256, '%s/%s' % (R['oamPeak'], R['oamLimit']))

    fresh(page)
    L = page.evaluate(JS_LINT)
    ok('連續 150 幀 lint 全部 ok、badPixels = 0', len(L['bad']) == 0, json.dumps(L['bad'][:3]))
    ok('同屏色數 ≤ 25（最高 %d）' % L['maxColors'], L['maxColors'] <= 25, L['maxColors'])


JS_OAM = r"""
() => {
  const ppu = __nes.nes().ppu;
  GAME.dev.warp(8); __nes.step(4);
  const hero = [];
  for (let i = 0; i < 6; i++) hero.push(ppu.oam[i].on);
  return {
    flickerStep: ppu.flickerStep, spriteMode: ppu.spriteMode(), mirror: ppu.mirroring(),
    heroOn: hero, split: !!ppu._split, oamLint: NES.Lint.oam(ppu)
  };
}
"""


def test_ppu_setup(page):
    print('[⑧b PPU 設定：8×16 / 垂直鏡像 / flickerStep=0 / split(32)]')
    fresh(page)
    R = page.evaluate(JS_OAM)
    ok('精靈模式 = 8×16（主角 16×24）', R['spriteMode'] == 16, R['spriteMode'])
    ok('名稱表垂直鏡像（左右兩張不同，水平捲動用）', R['mirror'] == 'v', R['mirror'])
    ok('ppu.flickerStep = 0（輪替交給 NES.SH.OAM）', R['flickerStep'] == 0, R['flickerStep'])
    ok('有掃描線分割（上方 32 線 HUD）', R['split'], R['split'])
    ok('主角占 OAM 前 4 槽（prio 0 最優先）', all(R['heroOn'][:4]), R['heroOn'])
    ok('NES.Lint.oam 無錯誤', R['oamLint'].get('ok'), json.dumps(R['oamLint'])[:160])


# =====================================================================  ⑨ 模式
JS_TITLE = r"""
() => {
  const S = () => window.GAME.state();
  const out = { mode0: S().mode };
  __nes.tap('start', 1); __nes.step(2);
  out.mode1 = S().mode;
  return out;
}
"""

JS_CLEAR = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev, T = ST.TILE;
  const L = d.layout();
  d.warp((L.GOAL - 2) * 8); __nes.step(2);
  const b = S();
  let n = 0;
  while (S().mode !== 'clear' && n++ < 400) __nes.press(['right'], 1);
  const c = S();
  const timeAtClear = c.time;
  let m = 0;
  while (S().time > 0 && m++ < 200) __nes.step(1);
  const tallied = S();
  return { mode: c.mode, frames: n, scoreGoal: c.score - b.score,
           timeAtClear, scoreAfter: tallied.score, time: tallied.time, cleared: tallied.cleared };
}
"""


def test_modes(page):
    print('[⑨ 模式：title → play、GOAL → clear（時間換分）]')
    page.goto(BASE)                      # 沒有 ?level ⇒ 停在標題
    page.wait_for_function('() => !!window.__nes && !!window.GAME')
    page.evaluate('() => __nes.step(2)')
    R = page.evaluate(JS_TITLE)
    ok('沒有 ?level 參數時停在 title 模式', R['mode0'] == 'title', R['mode0'])
    ok('按 START → 進入 play', R['mode1'] == 'play', R['mode1'])

    fresh(page)
    C = page.evaluate(JS_CLEAR)
    ok('碰到 GOAL → mode = clear', C['mode'] == 'clear', 'mode=%s frames=%s' % (C['mode'], C['frames']))
    ok('過關加 1000 分', C['scoreGoal'] >= 1000, C['scoreGoal'])
    ok('結算把剩餘時間換成分數（每單位 50 分）',
       C['scoreAfter'] >= C['timeAtClear'] * 50, 'time=%s score=%s' % (C['timeAtClear'], C['scoreAfter']))
    ok('結算後 TIME 歸零', C['time'] == 0, C['time'])
    ok('cleared 旗標為 true', C['cleared'] is True, C['cleared'])


def test_query(page):
    print('[⑨b ?level= 直接開關卡]')
    s = fresh(page, 'test')
    ok('?level=test 直接進入內建測試關且跳過標題', s['level'] == 'test' and s['mode'] == 'play',
       '%s / %s' % (s['level'], s['mode']))
    has11 = page.evaluate("() => !!(window.ST && ST.LEVELS && ST.LEVELS['1-1'])")
    if has11:
        s = fresh(page, '1-1')
        ok('?level=1-1 直接開 W1 第一關', s['level'] == '1-1' and s['mode'] == 'play',
           '%s / %s' % (s['level'], s['mode']))
        ok('1-1 起點站在地面上（幾幀內 onGround）',
           page.evaluate("() => { __nes.step(8); return window.GAME.state().onGround; }"))
        ok('1-1 走 120 幀不會死、不會超支',
           page.evaluate("""() => { __nes.press(['right'], 120);
                                    const s = window.GAME.state();
                                    return s.state !== 'dead' && !__nes.stats().budgetOver; }"""))
    else:
        ok('star-world 的 ST.LEVELS[1-1] 尚未就緒（SKIP）', True, 'skipped')



# =====================================================================  ⑨c 結束畫面
# fix2-star（qa2-star P1-1 / P2-5）：GAME OVER 與「破完 W1」必須各自畫出字，而且
# **任何 camX 都看得到**（camX % 512 ≥ 256 ⇒ 文字會跨到第二張名稱表）。
# 三層驗證：① GAME.dev.screenText 讀回名稱表 ② 直接比對 ppu.getTile 的磚索引
#          ③ ppu.indexFrame 逐像素數白字（＝真的畫在可見區，不是寫到看不到的名稱表）
JS_BANNER = r"""
(opt) => {
  const S = () => window.GAME.state();
  const d = GAME.dev;
  d.warp(opt.col * 8); __nes.step(4);
  d.setLives(0); d.kill();
  let n = 0; while (S().mode !== 'gameover' && n++ < 600) __nes.step(1);
  const s = S();
  // ③ 逐像素：白色（bg 調色盤 0 的色 3 = $30）在文字那幾列的像素數
  __nes.render();
  const ppu = NES.instance.ppu, idx = ppu.indexFrame;
  function whitePixels(row, col, len) {
    let c = 0;
    for (let y = row * 8; y < row * 8 + 8; y++)
      for (let x = col * 8; x < (col + len) * 8; x++) if (idx[y * 256 + x] === 0x30) c++;
    return c;
  }
  // ② 名稱表磚索引（自己換算 nt / 欄，不經 screenText）
  const want = ST.textTiles(ST.bgBank, 'GAME OVER');
  const base = s.camX >> 3; let tileOk = true;
  for (let i = 0; i < want.length; i++) {
    const wc = (base + 12 + i) & 63;
    if (ppu.getTile((wc >> 5) & 1, wc & 31, 12) !== want[i]) tileOk = false;
  }
  return { mode: s.mode, won: s.won, camX: s.camX, camMod: s.camX % 512, fine: s.camX & 7,
           l1: d.screenText(12, 12, 9), l2: d.screenText(16, 10, 11), tileOk,
           white1: whitePixels(12, 12, 9), white2: whitePixels(16, 10, 11),
           banner: s.banner, budgetOver: __nes.stats().budgetOver };
}
"""

JS_BANNER_BACK = r"""
() => {
  const S = () => window.GAME.state();
  __nes.tap('start', 1); __nes.step(3);
  const a = S();
  const t1 = GAME.dev.screenText(9, 9, 13);
  __nes.tap('start', 1); __nes.step(3);
  return { mode1: a.mode, lives: a.lives, score: a.score, title: t1, mode2: S().mode };
}
"""

JS_WIN = r"""
() => {
  const S = () => window.GAME.state();
  const d = GAME.dev;
  d.setScore(12345);
  d.warp(240 * 8); __nes.step(4);
  let n = 0;
  while (!ST.Boss.dead && n++ < 20) { ST.Boss.stomp(); __nes.step(70); }
  n = 0; while (S().mode !== 'gameover' && n++ < 900) __nes.step(1);
  const s = S();
  __nes.render();
  const ppu = NES.instance.ppu, idx = ppu.indexFrame;
  function white(row, col, len) {
    let c = 0;
    for (let y = row * 8; y < row * 8 + 8; y++)
      for (let x = col * 8; x < (col + len) * 8; x++) if (idx[y * 256 + x] === 0x30) c++;
    return c;
  }
  return { mode: s.mode, won: s.won, camX: s.camX,
           l1: d.screenText(10, 9, 13), l2: d.screenText(13, 11, 9),
           l3: d.screenText(16, 10, 12), l4: d.screenText(19, 10, 11),
           white1: white(10, 9, 13), white4: white(19, 10, 11), score: s.score };
}
"""


def test_banner(page):
    print('[⑨c GAME OVER / WORLD 1 CLEAR 畫面文字（P1-1 / P2-5）]')
    has11 = page.evaluate("() => !!(window.ST && ST.LEVELS && ST.LEVELS['1-1'])")
    # ---- 輸光命：故意在關卡尾端（camX 很大、camX % 512 ≥ 256 ⇒ 文字跨兩張名稱表）----
    fresh(page, '1-1' if has11 else 'test')
    R = page.evaluate(JS_BANNER, {'col': 300 if has11 else 100})
    ok('命盡 → mode = gameover 且 won = false', R['mode'] == 'gameover' and R['won'] is False,
       'mode=%s won=%s' % (R['mode'], R['won']))
    ok('GAME OVER 文字寫在**目前可見**的名稱表（camX=%s，camX%%512=%s）' % (R['camX'], R['camMod']),
       R['l1'] == 'GAME OVER', R['l1'])
    ok('PRESS START 文字可見', R['l2'] == 'PRESS START', R['l2'])
    ok('名稱表磚索引逐格等於 textTiles(GAME OVER)', R['tileOk'] is True, R['tileOk'])
    ok('進 gameover 時鏡頭對齊 8 px（fine scroll = 0 ⇒ 文字不被切半格）', R['fine'] == 0, R['fine'])
    ok('indexFrame 逐像素：GAME OVER 有 ≥ 60 個白色像素（真的畫出來了）',
       R['white1'] >= 60, R['white1'])
    ok('indexFrame 逐像素：PRESS START 有 ≥ 60 個白色像素', R['white2'] >= 60, R['white2'])
    ok('state().banner 回報兩行文字', R['banner'] == ['GAME OVER', 'PRESS START'], R['banner'])
    ok('畫結束畫面沒有讓 VBlank 預算爆掉', not R['budgetOver'], R['budgetOver'])

    # ---- GAME OVER → START 回標題（P2-5）----
    B = page.evaluate(JS_BANNER_BACK)
    ok('GAME OVER 按 START → 回**標題**（不是直接重開）', B['mode1'] == 'title', B['mode1'])
    ok('回標題時命數 / 分數重置', B['lives'] == 3 and B['score'] == 0,
       'lives=%s score=%s' % (B['lives'], B['score']))
    ok('標題文字重新畫出來', B['title'] == 'STARDUST HERO', B['title'])
    ok('標題再按 START → 重新開始遊戲', B['mode2'] == 'play', B['mode2'])

    # ---- 破完 1-4：WORLD 1 CLEAR ----
    if not page.evaluate("() => !!(window.ST && ST.LEVELS && ST.LEVELS['1-4'] && ST.Boss)"):
        ok('star-world 的 1-4 / 魔王尚未就緒（SKIP 破關畫面）', True, 'skipped')
        return
    fresh(page, '1-4')
    W = page.evaluate(JS_WIN)
    ok('打倒魔王 → 結算 → won = true 的 gameover', W['mode'] == 'gameover' and W['won'] is True,
       'mode=%s won=%s' % (W['mode'], W['won']))
    ok('破關畫面寫 WORLD 1 CLEAR（與 GAME OVER 不同）', W['l1'] == 'WORLD 1 CLEAR', W['l1'])
    ok('破關畫面寫 THANK YOU', W['l2'] == 'THANK YOU', W['l2'])
    ok('破關畫面寫最終分數', W['l3'] == 'SCORE ' + str(W['score']).rjust(6, '0'),
       '%s / score=%s' % (W['l3'], W['score']))
    ok('破關畫面寫 PRESS START', W['l4'] == 'PRESS START', W['l4'])
    ok('indexFrame 逐像素：WORLD 1 CLEAR 有 ≥ 80 個白色像素', W['white1'] >= 80, W['white1'])
    ok('indexFrame 逐像素：PRESS START 有 ≥ 60 個白色像素', W['white4'] >= 60, W['white4'])


# =====================================================================  ⑨d 音樂呼叫點
JS_BOSS_MUSIC = r"""
() => {
  const S = () => window.GAME.state();
  const song = () => ST.Audio.state().song;
  GAME.dev.warp(200 * 8); __nes.step(4);
  const before = song();
  let n = 0;
  while (!ST.Boss.active && n++ < 400) __nes.press(['right'], 1);
  __nes.step(2);
  const inRoom = { song: song(), bossMusic: S().bossMusic, active: ST.Boss.active };
  n = 0; while (!ST.Boss.dead && n++ < 20) { ST.Boss.stomp(); __nes.step(70); }
  __nes.step(2);
  return { before, inRoom, afterKill: { song: song(), bossMusic: S().bossMusic, dead: ST.Boss.dead } };
}
"""


def test_music_hooks(page):
    print('[⑨d 音樂呼叫點：title 曲存在 / 進魔王房 boss / 擊破 clear（P2-1 / P2-2）]')
    page.goto(BASE)
    page.wait_for_function('() => !!window.__nes && !!window.GAME')
    page.evaluate('() => __nes.step(4)')
    keys = page.evaluate("() => (window.ST && ST.Audio) ? ST.Audio.KEYS : []")
    ok("song.js 有 'title' 這個 key（P2-2）", 'title' in keys, keys)
    ok('標題畫面實際播的是 title 曲',
       page.evaluate("() => ST.Audio.state() && ST.Audio.state().song") == 'title')
    warned = page.evaluate("""() => { let m = null;
        const old = console.warn; console.warn = (s) => { m = s; };
        const r = ST.Audio.play('no-such-song');
        console.warn = old; return { r, m }; }""")
    ok('play() 遇到未知 key 會 console.warn（不再靜默失敗）',
       warned['r'] is False and warned['m'] and 'no-such-song' in warned['m'], warned)

    if not page.evaluate("() => !!(window.ST && ST.LEVELS && ST.LEVELS['1-4'] && ST.Boss)"):
        ok('1-4 / 魔王尚未就緒（SKIP 魔王曲）', True, 'skipped')
        return
    fresh(page, '1-4')
    M = page.evaluate(JS_BOSS_MUSIC)
    ok('魔王房前播的是關卡曲 castle', M['before'] == 'castle', M['before'])
    ok('ST.Boss.active 變 true ⇒ 切 boss 曲（P2-1）',
       M['inRoom']['song'] == 'boss' and M['inRoom']['bossMusic'] == 1, M['inRoom'])
    ok('擊破魔王 ⇒ 切 clear 曲', M['afterKill']['song'] == 'clear' and M['afterKill']['bossMusic'] == 2,
       M['afterKill'])

# =====================================================================  ⑩ 綜合
JS_AIRCTRL = r"""
() => {
  const S = () => window.GAME.state();
  GAME.dev.warp(8); __nes.step(2);
  for (let i = 0; i < 60; i++) __nes.press(['right'], 1);        // 走路上限起跳
  const v0 = S().vx;
  __nes.press(['a', 'right'], 1);
  let maxV = 0;
  for (let i = 0; i < 30; i++) { __nes.press(['a', 'b', 'right'], 1); if (S().vx > maxV) maxV = S().vx; }
  __nes.release();
  let n = 0; while (!S().onGround && n++ < 200) __nes.step(1);
  return { v0, maxV, maxWalk: NES.FX.SMB.maxWalk, airRunSpeed: NES.FX.SMB.airRunSpeed };
}
"""


def test_air_control(page):
    print('[⑩ 空中控制門檻（SMB：|vx| ≥ $19 才沿用跑步參數）]')
    fresh(page)
    R = page.evaluate(JS_AIRCTRL)
    ok('走路上限起跳（vx = 384）', R['v0'] == 384, R['v0'])
    ok('空中按 B 不會突破走路上限（|vx| < airRunSpeed 時鎖 maxWalk）',
       R['maxV'] <= R['maxWalk'], 'maxV=%s maxWalk=%s airRunSpeed=%s'
       % (R['maxV'], R['maxWalk'], R['airRunSpeed']))


JS_WALL = r"""
() => {
  const S = () => window.GAME.state();
  const L = GAME.dev.layout();
  GAME.dev.warp((L.WALL - 4) * 8); __nes.step(2);
  let blocked = null;
  for (let i = 0; i < 80; i++) { __nes.press(['right'], 1); const s = S(); if (s.vx === 0 && s.x > (L.WALL - 4) * 8) { blocked = s.x; break; } }
  const before = S();
  for (let i = 0; i < 30; i++) __nes.press(['a', 'right'], 1);
  __nes.release();
  let n = 0; while (!S().onGround && n++ < 200) __nes.press(['right'], 1);
  const after = S();
  return { blocked, beforeX: before.x, afterX: after.x, cleared: after.x > (L.WALL + 1) * 8, y: after.y, wall: L.WALL };
}
"""


def test_wall(page):
    print('[⑩b 4 磚牆：走路被擋、跳得過去]')
    fresh(page)
    R = page.evaluate(JS_WALL)
    ok('走路撞到 4 磚牆會停下（vx 歸零）', R['blocked'] is not None, 'x=%s' % R['blocked'])
    ok('起跳可以越過 4 磚（32 px）高的牆', R['cleared'],
       'x %s → %s（牆在第 %s 欄）' % (R['beforeX'], R['afterX'], R['wall']))


JS_STOMP = r"""
() => {
  const S = () => window.GAME.state();
  const h = GAME.dev.hero();
  GAME.dev.warp(8); __nes.step(2);
  for (let i = 0; i < 20; i++) __nes.press(['a'], 1);   // 跳起來，確保在空中
  const b = S();
  ST.Hero.stomp(h);
  __nes.step(1);
  const a = S();
  return { vyBefore: b.vy, vyAfter: a.vy, bounce: ST.Hero.BOUNCE, stomps: a.stomps, onGround: a.onGround };
}
"""


def test_stomp(page):
    print('[⑩c 踩敵回彈 −3 px/幀（契約）]')
    fresh(page)
    R = page.evaluate(JS_STOMP)
    ok('ST.Hero.BOUNCE = −3 px/幀（−768 vel）', R['bounce'] == -768, R['bounce'])
    ok('踩敵後垂直速度變成回彈值（不是新的一次跳躍）', R['vyAfter'] < 0, R['vyAfter'])
    ok('踩敵計數 stomps +1', R['stomps'] == 1, R['stomps'])
    ok('踩敵後離地', R['onGround'] is False, R['onGround'])


# =====================================================================  主程式
def main():
    if not (ROOT / 'star.html').exists():
        print('找不到 star.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text)
                if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
        fresh(page)
        st = page.evaluate('() => __nes.stats()')
        ok('engine 模組全到齊（missing 為空）', st['missing'] == [], st['missing'])
        ok('NES.SH（engine/shmup.js）可用：Scroller / OAM / aabb',
           page.evaluate("() => !!(NES.SH && NES.SH.Scroller && NES.SH.OAM && NES.SH.aabb)"))
        C = page.evaluate(JS_CONST)
        ok('ST.Hero 碰撞框 = 12×22（契約）', C['heroW'] == 12 and C['heroH'] == 22,
           '%s×%s' % (C['heroW'], C['heroH']))
        ok('ST.SPR_HERO ≤ 128 磚（契約：精靈表 0..127）',
           page.evaluate("() => { let n = 0; for (const k in ST.SPR_HERO) n += 2; return n; }") <= 128)
        ok('ST.BG_HUD ≤ 64 磚（契約：背景表 0..63）',
           page.evaluate("() => Object.keys(ST.BG_HUD).length") <= 64)

        test_feel(page, C)
        test_states(page, C)
        test_invincible(page)
        test_oneway(page)
        test_hazard(page)
        test_gameover(page)
        test_timeup(page)
        test_items(page)
        test_camera(page)
        test_hud(page)
        test_budget_lint(page)
        test_ppu_setup(page)
        test_modes(page)
        test_banner(page)
        test_music_hooks(page)
        test_query(page)
        test_air_control(page)
        test_wall(page)
        test_stomp(page)

        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 64)
    print('star-hero 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
