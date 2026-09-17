# -*- coding: utf-8 -*-
"""測試房（games/demo）自動驗證：手感 / 相機 / 精靈閃爍 / lint / 音效搶聲道 / 效能。

作法：Playwright(Chromium) 開 `game.html?debug=1&scale=1`，用 tools/shot.py 同一套除錯 API
（`__nes.step/press/tap/release/render/state/lint/stats`）推進與取樣；不改任何 engine 檔。

用法：../卡比之星/.venv/bin/python games/demo/test_demo.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

對照數字來源：
  docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md ②（SMBDIS.ASM 反組譯）
  docs/PROGRESS.md「fix1」區段：跳躍規則統一到 `NES.FX.SMB.jumpState/jumpStart/jumpGravity`，
  起跳首幀半格重力（skipGravityFirstFrame）⇒ 長按靜止跳 64.00 px（4 格）、全速跳 80.00 px（5 格）、
  點按 1 幀 19.6875 px；本檔每個跳躍數字都會再跟 `NES.FX.SMB.jumpSim()` 對照，兩邊必須一模一樣。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = (ROOT / 'game.html').as_uri() + '?debug=1&scale=1'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def near(name, got, lo, hi, detail=''):
    ok(name, lo <= got <= hi, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


def fresh(page):
    """重新載入頁面並進入遊戲（標題畫面按 START）。"""
    page.goto(PAGE)
    page.wait_for_function('() => !!window.__nes && !!window.GAME')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    return page.evaluate('() => window.GAME.state()')


# ---------------------------------------------------------------- ① 跑步加速
JS_RUN = r"""
() => {
  const S = window.GAME.state;
  const out = { vx: [], frames: -1, walkFrames: -1 };
  for (let i = 0; i < 80; i++) {
    __nes.press(['b', 'right'], 1);
    const v = S().vx;
    out.vx.push(v);
    if (out.frames < 0 && v >= 640) out.frames = i + 1;   // maxRun = 2.5 px/幀 = 640 vel
  }
  out.max = S().vx;
  out.maxPx = S().vxPx;
  return out;
}
"""

JS_WALK = r"""
() => {
  const S = window.GAME.state;
  let frames = -1;
  for (let i = 0; i < 80; i++) {
    __nes.press(['right'], 1);
    if (frames < 0 && S().vx >= 384) frames = i + 1;      // maxWalk = 1.5 px/幀 = 384 vel
  }
  return { frames: frames, vx: S().vx, vxPx: S().vxPx };
}
"""


def test_accel(page):
    print('[① 靜止 → 跑 / 走 上限幀數]')
    fresh(page)
    R = page.evaluate(JS_RUN)
    near('靜止→跑步上限 45 幀（±1，對照 core 測試）', R['frames'], 44, 46, 'frames=%s' % R['frames'])
    ok('跑步上限 = 2.5 px/幀（640 vel）', R['max'] == 640 and R['maxPx'] == 2.5, R['maxPx'])
    fresh(page)
    W = page.evaluate(JS_WALK)
    near('靜止→走路上限 41 幀（±1，core 記錄 41）', W['frames'], 40, 42, 'frames=%s' % W['frames'])
    ok('走路上限 = 1.5 px/幀（384 vel）', W['vx'] == 384 and W['vxPx'] == 1.5, W['vxPx'])


# ---------------------------------------------------------------- ② 跳躍高度
JS_JUMP = r"""
(opt) => {
  const S = window.GAME.state;
  const y0 = S().ySub;
  if (opt.run) for (let i = 0; i < opt.run; i++) __nes.press(['b', 'right'], 1);
  const yTakeoff = S().ySub;
  if (opt.hold <= 1) {
    __nes.tap('a', 1);
  } else {
    for (let i = 0; i < opt.hold; i++) __nes.press(opt.run ? ['a', 'b', 'right'] : ['a'], 1);
  }
  __nes.release();
  let g = 0;
  while (!S().onGround && g++ < 200) {
    if (opt.run) __nes.press(['b', 'right'], 1); else __nes.step(1);
  }
  const s = S();
  return {
    heightPx: (yTakeoff - s.apexSub) / 16,
    landed: s.onGround, y: s.y, x: s.x, vxAtJump: s.vx, airFrames: g
  };
}
"""


def test_jump(page):
    print('[② 短按 / 長按 跳躍高度（與 NES.FX.SMB 共用規則對照）]')
    fresh(page)
    tap = page.evaluate(JS_JUMP, {'hold': 1, 'run': 0})
    fresh(page)
    hold = page.evaluate(JS_JUMP, {'hold': 40, 'run': 0})
    fresh(page)
    runj = page.evaluate(JS_JUMP, {'hold': 40, 'run': 60})
    # 引擎那一套（tools/test_core.py 量的也是它）
    sim = page.evaluate("""() => {
        const S = NES.FX.SMB;
        return { skip: S.skipGravityFirstFrame,
                 tap: S.jumpSim({hold: 1}).apexPx,
                 hold: S.jumpSim({hold: 40}).apexPx,
                 run: S.jumpSim({hold: 40, vx: S.maxRun}).apexPx };
    }""")

    ok('起跳首幀半格重力的開關預設為開（skipGravityFirstFrame）', sim['skip'] is True, sim['skip'])
    ok('短按跳 < 長按跳（可變高度跳成立）', tap['heightPx'] < hold['heightPx'] - 20,
       '短 %.2f px / 長 %.2f px' % (tap['heightPx'], hold['heightPx']))
    ok('長按（靜止起跳）= 4 格 64 px（±1，QA P1-5）', abs(hold['heightPx'] - 64) <= 1,
       '%.4f px（文件 64）' % hold['heightPx'])
    ok('長按（全速起跳）= 5 格 80 px（±1，QA P1-5）', abs(runj['heightPx'] - 80) <= 1,
       '%.4f px（文件 80）' % runj['heightPx'])
    ok('短按跳 = 19.6875 px（A 只按 1 幀，離地 ≥1px 後才切大重力）',
       abs(tap['heightPx'] - 19.6875) < 1e-9, '%.4f px' % tap['heightPx'])
    # 同一套規則 ⇒ demo 實測與引擎模擬必須完全相等（QA P1-4：不再有兩套答案）
    ok('短按跳：demo 實測 == NES.FX.SMB.jumpSim（同一套規則）',
       abs(tap['heightPx'] - sim['tap']) < 1e-9, '%.4f vs %.4f' % (tap['heightPx'], sim['tap']))
    ok('長按靜止跳：demo 實測 == jumpSim', abs(hold['heightPx'] - sim['hold']) < 1e-9,
       '%.4f vs %.4f' % (hold['heightPx'], sim['hold']))
    ok('長按全速跳：demo 實測 == jumpSim', abs(runj['heightPx'] - sim['run']) < 1e-9,
       '%.4f vs %.4f' % (runj['heightPx'], sim['run']))
    ok('全速跳比靜止跳高（5 段跳躍表生效）', runj['heightPx'] > hold['heightPx'] + 10,
       '%.2f > %.2f' % (runj['heightPx'], hold['heightPx']))
    ok('三次跳躍都正常落地', tap['landed'] and hold['landed'] and runj['landed'])


# ---------------------------------------------------------------- ③ 相機
JS_CAM = r"""
() => {
  const S = window.GAME.state;
  let first = null;
  for (let i = 0; i < 300 && !first; i++) {
    __nes.press(['right'], 1);
    const s = S();
    if (s.camX > 0) first = { camX: s.camX, x: s.x, screenX: s.screenX };
  }
  // 再往右走一段，確認畫面跟著捲
  for (let i = 0; i < 60; i++) __nes.press(['right'], 1);
  const mid = S();
  // 先按左 20 幀讓向右的動量歸零（SMB 轉身：加速度 ×2），再量「往左走相機不動」
  for (let i = 0; i < 20; i++) __nes.press(['left'], 1);
  const turned = S();
  for (let i = 0; i < 90; i++) __nes.press(['left'], 1);
  const back = S();
  return { first: first, midCam: mid.camX, midX: mid.x,
           turnCam: turned.camX, turnX: turned.x,
           backCam: back.camX, backX: back.x, backScreenX: back.screenX };
}
"""


def test_camera(page):
    print('[③ 相機：右側 40% 開始捲、單向鎖]')
    fresh(page)
    R = page.evaluate(JS_CAM)
    f = R['first'] or {}
    ok('相機在主角到達畫面 40%（102 px）時才開始捲',
       f.get('screenX') == 102 and f.get('camX') == f.get('x') - 102, json.dumps(f))
    ok('繼續往右 → 相機跟著右捲', R['midCam'] > f.get('camX', 0),
       'cam %s → %s' % (f.get('camX'), R['midCam']))
    ok('往左走 90 幀 → 相機完全不動（單向鎖）', R['backCam'] == R['turnCam'],
       'cam %s → %s（主角 x %s → %s）' % (R['turnCam'], R['backCam'], R['turnX'], R['backX']))
    ok('往左走時主角 x 確實變小', R['backX'] < R['turnX'], '%s → %s' % (R['turnX'], R['backX']))
    ok('往左走時主角被螢幕左緣擋住（screenX ≥ 0）', 0 <= R['backScreenX'] <= 102,
       'screenX=%s x=%s' % (R['backScreenX'], R['backX']))


# ---------------------------------------------------------------- ④ 精靈閃爍
# 敵人調色盤的色 3 = $38，畫面上只有敵人會用到 ⇒ 用它逐隻判斷「這一幀有沒有被畫出來」
JS_VISIBLE = r"""
() => {
  const nes = __nes.nes(), ppu = nes.ppu, idx = ppu.indexFrame;
  const s = window.GAME.state();
  const seen = {};
  s.enemyList.forEach(e => {
    let n = 0;
    for (let y = e.y; y < e.y + 16; y++) {
      if (y < 0 || y >= 240) continue;
      for (let x = e.sx; x < e.sx + 16; x++) {
        if (x < 0 || x >= 256) continue;
        if (idx[y * 256 + x] === 0x38) n++;
      }
    }
    if (n > 0) seen[e.id] = n;
  });
  return { seen: Object.keys(seen).map(Number), stats: __nes.stats(),
           onScreen: s.enemyList.filter(e => e.sx > -16 && e.sx < 256).map(e => e.id) };
}
"""


def test_flicker(page):
    print('[④ 12 隻敵人同線 → 每線 > 8 精靈的閃爍]')
    fresh(page)
    page.evaluate("() => { __nes.press(['b','right'], 860); __nes.release(); __nes.step(4); }")
    s = page.evaluate('() => __nes.state()')
    on = [e for e in s['enemyList'] if -16 < e['sx'] < 256]
    ok('敵人房：12 隻敵人同時在畫面上', len(on) == 12, '%d 隻 sx=%s' % (len(on), [e['sx'] for e in on]))
    bands = sorted(set(e['band'] for e in on))
    ok('分成兩條掃描線帶（y=192 地面 / y=176 高台）', bands == [0, 1], bands)

    st = s['stats']
    ok('每掃描線精靈數 > 8（PPU 丟棄第 9 個起）', st['maxSpritesLine'] > 8, st['maxSpritesLine'])
    ok('__nes.stats().flickered > 0（有掃描線在閃爍）', st['flickered'] > 0, st['flickered'])

    f1 = page.evaluate(JS_VISIBLE)
    page.evaluate('() => __nes.step(1)')
    f2 = page.evaluate(JS_VISIBLE)
    union = sorted(set(f1['seen']) | set(f2['seen']))
    ids = sorted(e['id'] for e in on)
    ok('單幀畫不完（每線 8 個上限確實生效）', len(f1['seen']) < 12, '第 1 幀畫出 %d 隻' % len(f1['seen']))
    ok('兩幀 OAM 合集 = 12 隻全部出現', union == ids,
       '第1幀 %s / 第2幀 %s / 合集 %s' % (sorted(f1['seen']), sorted(f2['seen']), union))


# ---------------------------------------------------------------- ⑤ lint 120 幀
JS_LINT = r"""
() => {
  const bad = []; let maxColors = 0, maxLine = 0, flickFrames = 0;
  for (let i = 0; i < 120; i++) {
    __nes.press(['b', 'right'], 1);
    const r = __nes.lint(), st = __nes.stats();
    if (r.colors > maxColors) maxColors = r.colors;
    if (st.maxSpritesLine > maxLine) maxLine = st.maxSpritesLine;
    if (st.flickered > 0) flickFrames++;
    if (!r.ok || r.colors > 25 || r.badPixels > 0) {
      bad.push({ frame: i, ok: r.ok, colors: r.colors, badPixels: r.badPixels });
    }
  }
  return { bad: bad, maxColors: maxColors, maxLine: maxLine, flickFrames: flickFrames };
}
"""


def test_lint(page):
    print('[⑤ 連續 120 幀 nes_lint]')
    fresh(page)
    # 先走到敵人房（畫面最擠的地方）再連續 lint 120 幀
    page.evaluate("() => { __nes.press(['b','right'], 820); __nes.release(); __nes.step(2); }")
    R = page.evaluate(JS_LINT)
    ok('120 幀 lint 全部 ok=true、badPixels=0', len(R['bad']) == 0, json.dumps(R['bad'][:3]))
    ok('同屏色數 ≤ 25（最高 %d）' % R['maxColors'], R['maxColors'] <= 25, R['maxColors'])
    ok('這 120 幀確實有超過 8 精靈的掃描線', R['maxLine'] > 8 and R['flickFrames'] > 0,
       'maxLine=%s flickFrames=%s' % (R['maxLine'], R['flickFrames']))


# ---------------------------------------------------------------- ⑥ 踩敵 / 音效
JS_STOMP = r"""
() => {
  const S = window.GAME.state;
  const before = S();
  const e0 = before.enemyList[0];
  let guard = 0;
  while (S().x < e0.x - 30 && guard++ < 1500) __nes.press(['right'], 1);
  __nes.release();
  let g2 = 0;
  while (S().vx !== 0 && g2++ < 200) __nes.step(1);
  const stand = S();

  // 原地起跳（按住 A 14 幀）；jump 音效只有 10 幀，起跳後第 3 幀取樣
  let jumpFrame = null;
  for (let i = 0; i < 14; i++) { __nes.press(['a'], 1); if (i === 2) jumpFrame = S(); }
  __nes.release();
  let g3 = 0, coinFrame = null;
  while (!S().onGround && g3++ < 200) {
    __nes.step(1);
    const s = S();
    if (!coinFrame && s.stomps > before.stomps) coinFrame = s;   // 踩中的那一幀
  }
  const after = S();
  return { before: before, stand: stand, jumpFrame: jumpFrame, coinFrame: coinFrame, after: after };
}
"""


def test_stomp(page):
    print('[⑥ 踩敵計分 + 音效搶聲道]')
    fresh(page)
    R = page.evaluate(JS_STOMP)
    b, a = R['before'], R['after']
    ok('踩到敵人 → 敵人消失', a['enemies'] == b['enemies'] - 1,
       '%d → %d' % (b['enemies'], a['enemies']))
    ok('踩到敵人 → 分數 +100', a['score'] == b['score'] + 100, '%d → %d' % (b['score'], a['score']))
    ok('踩敵計數 stomps = 1', a['stomps'] == 1, a['stomps'])

    jm = R['jumpFrame']['music'] or {}
    ok('跳躍音效搶下 p2 聲道（jump priority 5）',
       jm.get('owners', {}).get('p2') == 'jump', json.dumps(jm.get('owners')))
    cm = (R['coinFrame'] or {}).get('music') or {}
    ok('踩敵音效搶下 p2 聲道（coin priority 6 > jump 5）',
       cm.get('owners', {}).get('p2') == 'coin' and 'coin' in cm.get('sfx', []), json.dumps(cm))
    ok('音效佔用期間音樂仍在播（只少一軌）', bool(cm.get('playing')), json.dumps(cm.get('sfx')))

    rel = page.evaluate("""() => { __nes.step(40); const m = window.GAME.state().music;
                                   return m; }""")
    ok('音效結束後 p2 還給音樂', rel and rel['owners']['p2'] is None, json.dumps(rel.get('owners')))


# ------------------------------------------------- ⑥b 側面接觸 → 閃爍無敵 60 幀
JS_HIT = r"""
() => {
  const S = window.GAME.state, nes = __nes.nes(), ppu = nes.ppu;
  const before = S();
  let guard = 0;
  while (S().hits === 0 && guard++ < 1500) __nes.press(['right'], 1);   // 走著撞上去（不是踩）
  const hit = S();
  // 之後 60 幀往左走開（避免無敵一結束又貼上同一隻）：主角 OAM 應該一下開一下關
  let onFrames = 0, offFrames = 0;
  for (let i = 0; i < 60; i++) {
    __nes.press(['left'], 1);
    (ppu.oam[0].on ? onFrames++ : offFrames++);
  }
  const after = S();
  return { hitsBefore: before.hits, hits: hit.hits, inv: hit.inv, stomps: hit.stomps,
           onFrames: onFrames, offFrames: offFrames, invAfter: after.inv, enemies: after.enemies };
}
"""


def test_invincible(page):
    print('[⑥b 側面接觸 → 閃爍無敵 60 幀]')
    fresh(page)
    R = page.evaluate(JS_HIT)
    ok('走路撞到敵人側面 → 不是踩死（敵人還在）', R['stomps'] == 0 and R['enemies'] == 14,
       'stomps=%s enemies=%s' % (R['stomps'], R['enemies']))
    ok('側面接觸 → 無敵計時 = 60 幀', R['inv'] == 60, R['inv'])
    ok('無敵期間主角 OAM 交替開 / 關（閃爍）', R['onFrames'] > 10 and R['offFrames'] > 10,
       '顯示 %d 幀 / 隱藏 %d 幀' % (R['onFrames'], R['offFrames']))
    ok('60 幀後無敵結束（走開後不再被判定）', R['invAfter'] == 0, R['invAfter'])
    ok('無敵期間不會重複扣（hits 仍為 1）', R['hits'] == 1, R['hits'])


# ------------------------------------------- ⑥c VBlank 寫入預算 + 截圖可重現
JS_BUDGET = r"""
() => {
  const nes = __nes.nes(), bud = nes.timing.budget;
  const hist = {};
  bud.clear();
  let over = 0, peak = 0, oamPeak = 0;
  for (let i = 0; i < 400; i++) {            // 邊跑邊補名稱表欄（每幀 26 磚 + 13 屬性）
    __nes.press(['b', 'right'], 1);
    const u = bud.used;
    hist[u] = (hist[u] || 0) + 1;
    if (u > peak) peak = u;
    if (bud.oamUsed > oamPeak) oamPeak = bud.oamUsed;
    if (bud.over) over++;
  }
  // __nes.render() 重畫不可以把同一幀的預算再算一次
  const before = { used: bud.used, oam: bud.oamUsed };
  __nes.render(); __nes.render();
  const after = { used: bud.used, oam: bud.oamUsed };
  return { hist: hist, peak: peak, oamPeak: oamPeak, over: over,
           overFrames: bud.overFrames, limit: bud.limit, oamLimit: bud.oamLimit,
           before: before, after: after, report: __nes.stats().budget };
}
"""


def test_budget(page):
    print('[⑥c VBlank 寫入預算 timing.budget（QA P1-6）]')
    fresh(page)
    R = page.evaluate(JS_BUDGET)
    ok('預算上限 = 160 byte / 幀（NTSC VBlank）', R['limit'] == 160, R['limit'])
    ok('budget.use() 真的有人呼叫（400 幀內用量 > 0）', R['peak'] > 0,
       '單幀最高 %d byte，分布 %s' % (R['peak'], json.dumps(R['hist'])))
    ok('補一欄 26 磚 + 13 屬性 = 39 byte 在預算內', R['peak'] <= 160,
       '單幀最高 %d byte（含狀態列更新）' % R['peak'])
    ok('400 幀全程沒有超支（budgetOver 恆 false）', R['over'] == 0 and R['overFrames'] == 0,
       'over %d 幀' % R['over'])
    ok('OAM 走獨立的 DMA 通道（64 精靈 = 256 byte，不佔那 160）',
       R['oamPeak'] == 256 and R['oamLimit'] == 256, '%s / %s' % (R['oamPeak'], R['oamLimit']))
    ok('__nes.render() 重畫不會重複計帳（截圖不影響預算統計）',
       R['before'] == R['after'], '%s → %s' % (json.dumps(R['before']), json.dumps(R['after'])))
    ok('__nes.stats().budget 有完整明細', R['report'] and R['report']['limit'] == 160,
       json.dumps(R['report']))


# ------------------------------------------- ⑥d __nes.render() 截圖可重現（P1-2）
JS_PURE = r"""
() => {
  const ppu = __nes.nes().ppu;
  const sig = () => {
    // 敵人帶的兩條掃描線：把 indexFrame 摘成字串，足以分辨「畫了哪幾隻」
    let s = '';
    for (const y of [180, 196]) for (let x = 0; x < 256; x += 2) s += ppu.indexFrame[y * 256 + x].toString(16);
    return s;
  };
  const out = [];
  for (let i = 0; i < 3; i++) { __nes.render(); out.push({ start: ppu.oamStart(), sig: sig() }); }
  const s0 = out[0].sig;
  // 再推進一個完整幀（update + draw + endFrame）
  __nes.step(1);
  const next = { start: ppu.oamStart(), sig: sig() };
  return { starts: out.map(o => o.start), same: out.every(o => o.sig === s0),
           nextStart: next.start, nextDiff: next.sig !== s0, flickerStep: ppu.flickerStep };
}
"""


def test_render_pure(page):
    print('[⑥d __nes.render() 只重畫、不推進（QA P1-2）]')
    fresh(page)
    page.evaluate("() => { __nes.press(['b','right'], 860); __nes.release(); __nes.step(3); }")
    R = page.evaluate(JS_PURE)
    ok('連續 3 次 __nes.render() 畫出完全相同的一張圖（截圖可重現）', R['same'], R['starts'])
    ok('連續 render() 不推進 PPU 的 OAM 輪替指標', len(set(R['starts'])) == 1, R['starts'])
    ok('step(1) 之後畫面才會換一批精靈（demo 自己做 sprite cycling）', R['nextDiff'])
    ok('demo 把 ppu.flickerStep 設成 0（輪替由遊戲控制）', R['flickerStep'] == 0, R['flickerStep'])


# ---------------------------------------------------------------- ⑦ 效能
JS_PERF = r"""
() => {
  const nes = __nes.nes(), G = nes.game;
  let tGame = 0;
  const u = G.update, d = G.draw;
  G.update = function (n) { const a = performance.now(); u.call(G, n); tGame += performance.now() - a; };
  G.draw = function (n) { const a = performance.now(); d.call(G, n); tGame += performance.now() - a; };
  let ppuMs = 0;
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) { __nes.press(['b', 'right'], 1); ppuMs += nes.ppu.stats.ms; }
  const total = performance.now() - t0;
  G.update = u; G.draw = d;
  return { total: total, perFrame: total / 300, gamePerFrame: tGame / 300, ppuPerFrame: ppuMs / 300 };
}
"""


def test_perf(page):
    print('[⑦ 效能：300 幀]')
    fresh(page)
    page.evaluate("() => { __nes.press(['b','right'], 800); __nes.release(); __nes.step(2); }")
    R = page.evaluate(JS_PERF)
    ok('update + draw 平均 < 4 ms/幀（%.3f ms）' % R['gamePerFrame'], R['gamePerFrame'] < 4.0,
       '%.3f ms' % R['gamePerFrame'])
    ok('整幀（Input.poll + update + apu.tick + draw + ppu.render）平均 < 4 ms（%.3f ms）'
       % R['perFrame'], R['perFrame'] < 4.0, '%.3f ms' % R['perFrame'])
    print('    明細：整幀 %.3f ms｜game.update+draw %.3f ms｜ppu.render %.3f ms'
          % (R['perFrame'], R['gamePerFrame'], R['ppuPerFrame']))


# ---------------------------------------------------------------- 主程式
def main():
    if not (ROOT / 'game.html').exists():
        print('找不到 game.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text)
                if m.type == 'error' else None)
        fresh(page)
        st = page.evaluate('() => __nes.stats()')
        ok('engine 模組全到齊（missing 為空）', st['missing'] == [], st['missing'])
        test_accel(page)
        test_jump(page)
        test_camera(page)
        test_flicker(page)
        test_lint(page)
        test_stomp(page)
        test_invincible(page)
        test_budget(page)
        test_render_pure(page)
        test_perf(page)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 64)
    print('demo 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
