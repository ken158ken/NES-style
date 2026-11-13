# -*- coding: utf-8 -*-
"""《星塵彈珠台》（cart1 槽 4，id = pinball）自動驗證。

重點：定點數物理的「擋板不穿模」證明 + 牆壁不穿模壓力測試 + 規則 / 流程 / 硬限制。
作法：Playwright 開 `cart1.html?game=pinball&debug=1&scale=1&mute=1`，用 `__nes.*` 除錯 API 與
      `CT.Pinball.Phys`（純物理，零相依）/ `CT.Pinball.dev`（遊戲鉤子）取樣；不改任何 engine 檔。

用法：../卡比之星/.venv/bin/python games/cart1/test_pinball.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=pinball'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Pinball && !!CT.Pinball.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart1.pinball.best"); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# ------------------------------------------------------------------ 物理（頁面內純 JS）
JS_PHYS = r"""
() => {
  const P = CT.Pinball.Phys, out = {};
  out.SUB = P.SUB; out.MAXV = P.MAXV; out.BALL_R = P.BALL_R;
  // isqrt 正確性
  let bad = 0;
  for (let i = 0; i < 5000; i++) { const n = (i * 7919 * 104729) % 2000000000; const r = P.isqrt(n); if (!(r * r <= n && (r + 1) * (r + 1) > n)) bad++; }
  out.isqrtBad = bad;
  // 每子步：球位移 / 擋板尖端位移
  out.ballStep = P.MAXV / P.SUB;
  out.tipStep = P.FL.W_UP / P.SUB * 2 * Math.PI / 1024 * P.FL.L;   // Q8
  out.contactWall = P.BALL_R + 256;
  out.contactFlip = P.BALL_R + P.FL.R;
  // 整數性：跑 600 幀後所有狀態都是整數
  const w = P.create(); w.launch(48);
  for (let f = 0; f < 600; f++) { w.setFlip(0, (f % 50) < 10); w.setFlip(1, (f % 70) < 10); w.step(); }
  const b = w.ball;
  out.ints = [b.x, b.y, b.vx, b.vy, w.flips[0].a, w.flips[1].a].every(Number.isInteger);
  return out;
}
"""

# 擋板防穿模：在兩支擋板上方的每個 x（1 px 間隔）× 3 種高度 × 5 種揮動時機 × 2 種水平速度掉球
JS_FLIP = r"""
() => {
  const P = CT.Pinball.Phys, Q = 256;
  let trials = 0, tunnels = 0, worstPen = 0, launchedUp = 0, rests = 0, ex = [];
  for (let k = 0; k < 2; k++) {
    const F = P.FLIPPERS[k];
    const x0 = k === 0 ? F.x - 2 : F.x - 18, x1 = k === 0 ? F.x + 18 : F.x + 2;
    for (let x = x0; x <= x1; x++) for (const h of [340, 300, 220]) for (const ft of [-1, 0, 10, 25, 40]) for (const vx of [-96, 96]) {
      const w = P.create(); const b = w.ball;
      b.parked = false; b.x = x * Q; b.y = h * Q; b.vx = vx; b.vy = 0;
      trials++;
      let fired = -1, up = false, tun = false, prevIn = false, prevBelow = false;
      for (let f = 0; f < 260; f++) {
        // 揮動時機：球進入擋板區後第 ft 幀按下，按 14 幀；ft = -1 = 一直不按
        if (fired < 0 && ft >= 0 && (b.y >> 8) > 370) fired = f + ft;
        const held = fired >= 0 && f >= fired && f < fired + 14;
        w.setFlip(k, held);
        w.step();
        const pen = w.penetration(); if (pen > worstPen) worstPen = pen;
        if (!b.live) break;
        // 穿模判定：前一幀與這一幀球心都在擋板跨度內（兩端各縮 2 px），而且從線「上方」跑到「下方」
        // （繞過尖端 / 從旁邊掉下去不算；那是合法的漏球路線）
        const fl = w.flips[k], tip = P.flipTip(fl, {});
        const lo = Math.min(fl.px, tip.x) + 2 * Q, hi = Math.max(fl.px, tip.x) - 2 * Q;
        const inSpan = b.x > lo && b.x < hi;
        let below = false;
        if (inSpan) { const t = (b.x - fl.px) / (tip.x - fl.px), ly = fl.py + (tip.y - fl.py) * t; below = b.y > ly; }
        if (inSpan && prevIn && below && !prevBelow) tun = true;
        prevIn = inSpan; prevBelow = below;
        if (held && b.vy < -3 * Q) up = true;
      }
      if (tun) { tunnels++; if (ex.length < 5) ex.push([k, x, h, ft, vx]); }
      if (up) launchedUp++;
      if (ft === -1) rests++;
    }
  }
  return { trials, tunnels, worstPen, launchedUp, ex };
}
"""

# 托球再打：舉著擋板接球 → 球滾到支點邊停住 → 放開 8 幀再按 → 球往上飛
JS_CRADLE = r"""
() => {
  const P = CT.Pinball.Phys, Q = 256; let n = 0, okc = 0, sp = [];
  for (let k = 0; k < 2; k++) for (let d = 4; d <= 12; d += 2) {
    const F = P.FLIPPERS[k], w = P.create(), b = w.ball;
    b.parked = false; b.x = (F.x + F.side * d) * Q; b.y = 360 * Q; b.vx = 0; b.vy = 0;
    n++;
    for (let f = 0; f < 150; f++) { w.setFlip(k, true); w.step(); }
    // 放下擋板，等球沿著斜面滾到離支點 ≥ 9 px（擋板中段）再打
    for (let f = 0; f < 60; f++) { w.setFlip(k, false); w.step(); if (Math.abs(b.x - F.x * Q) >= 9 * Q) break; }
    let best = 0;
    for (let f = 0; f < 12; f++) { w.setFlip(k, true); w.step(); best = Math.min(best, b.vy); }
    sp.push(Math.round(best / Q * 10) / 10);
    if (best < -3 * Q && b.live) okc++;
  }
  return { n, ok: okc, vy: sp };
}
"""

# 牆壁防穿模：隨機位置 × 最高速 × 隨機方向，球永遠留在外框內
JS_WALLS = r"""
() => {
  const P = CT.Pinball.Phys, Q = 256;
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let trials = 0, escapes = 0, worstPen = 0, frames = 0;
  for (let i = 0; i < 400; i++) {
    const w = P.create(), b = w.ball;
    b.parked = false;
    b.x = Math.floor((24 + rnd() * 190) * Q); b.y = Math.floor((70 + rnd() * 260) * Q);
    const a = rnd() * Math.PI * 2;
    b.vx = Math.round(Math.cos(a) * P.MAXV); b.vy = Math.round(Math.sin(a) * P.MAXV);
    if (w.penetration() > 0) continue;            // 出生點剛好壓在物件上就跳過
    trials++;
    for (let f = 0; f < 240; f++) {
      w.setFlip(0, (f % 40) < 8); w.setFlip(1, (f % 52) < 8);
      w.step(); frames++;
      const pen = w.penetration(); if (pen > worstPen) worstPen = pen;
      if (!b.live || b.parked) break;
      const x = b.x / Q, y = b.y / Q;
      if (x < 12 || x > 244 || y < 16) { escapes++; break; }
      if (x > 228 && x < 229 && y > 125) { escapes++; break; }     // 不得穿過發射道內牆
    }
  }
  return { trials, escapes, worstPen, frames };
}
"""

JS_ELEMENTS = r"""
() => {
  const P = CT.Pinball.Phys, Q = 256, out = {};
  // 發射：滿力到頂、弱力回到發射桿
  let w = P.create(); w.launch(48); let minY = 999;
  for (let f = 0; f < 120; f++) { w.step(); minY = Math.min(minY, w.ball.y >> 8); }
  out.fullTop = minY;
  w = P.create(); w.launch(0); let rep = false;
  for (let f = 0; f < 400; f++) { w.step(); if (w.events.some(e => e.type === 'repark')) { rep = true; break; } }
  out.weakRepark = rep;
  // 保險桿：從上方慢慢掉到保險桿上 → 被踢出 ≥ 4 px/幀
  w = P.create(); w.ball.parked = false; w.ball.x = 96 * Q; w.ball.y = 70 * Q; w.ball.vx = 0; w.ball.vy = 64;
  let bump = 0, sp = 0;
  for (let f = 0; f < 40; f++) { w.step(); if (w.events.some(e => e.type === 'bumper')) { bump++; sp = Math.max(sp, Math.hypot(w.ball.vx, w.ball.vy) / Q); } }
  out.bump = bump; out.bumpSpeed = sp;
  // 漏球：正中央落下
  w = P.create(); w.ball.parked = false; w.ball.x = 120 * Q; w.ball.y = 380 * Q;
  let drain = false; for (let f = 0; f < 200; f++) { w.step(); if (w.events.some(e => e.type === 'drain')) { drain = true; break; } }
  out.drain = drain;
  // 滾道感應：從滾道 1 正上方掉下
  w = P.create(); w.ball.parked = false; w.ball.x = P.LANES[1] * Q; w.ball.y = 22 * Q;
  let lane = -1; for (let f = 0; f < 60; f++) { w.step(); const e = w.events.find(e => e.type === 'lane'); if (e) { lane = e.id; break; } }
  out.lane = lane;
  // 星洞：吸住再吐出
  w = P.create(); w.ball.parked = false; w.ball.x = (P.SAUCER.x) * Q; w.ball.y = (P.SAUCER.y - 12) * Q; w.ball.vy = 128;
  let cap = false, ej = false;
  for (let f = 0; f < 120; f++) { w.step(); if (w.events.some(e => e.type === 'saucer')) cap = true; if (w.events.some(e => e.type === 'eject')) { ej = true; break; } }
  out.saucer = cap; out.eject = ej;
  // 落下靶：往左打中 → 事件
  w = P.create(); w.ball.parked = false; w.ball.x = 40 * Q; w.ball.y = 207 * Q; w.ball.vx = -4 * Q; w.ball.vy = -40;
  let drop = -1; for (let f = 0; f < 30; f++) { w.step(); const e = w.events.find(e => e.type === 'drop'); if (e) { drop = e.id; break; } }
  out.drop = drop;
  // 擋板舉起時間
  w = P.create(); w.setFlip(0, true); let n = 0; while (w.flips[0].a > P.FL.UP && n < 20) { w.step(); n++; }
  out.flipFrames = n;
  return out;
}
"""


def main():
    try:
        pw = sync_playwright().start()
        browser = pw.chromium.launch()
    except Exception as e:  # noqa
        print('環境錯誤：', e)
        return 2
    page = browser.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    fresh(page)

    # ---------------- 契約 ----------------
    reg = page.evaluate("""() => { const g = CT.get('pinball'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id / order 4 / title / legacy', reg and reg['id'] == 'pinball' and reg['order'] == 4 and reg['title'] and reg['legacy'] == ['pinball.html'], reg)
    ok('註冊：契約函式齊全（init/update/draw/state/cheat/bot/goal/exit/bestText）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText ≤ 8 字元', len(page.evaluate("() => CT.get('pinball').bestText()")) <= 8)

    # ---------------- 物理 ----------------
    ph = page.evaluate(JS_PHYS)
    ok('isqrt 5000 筆皆為 floor(√n)', ph['isqrtBad'] == 0, ph['isqrtBad'])
    ok('每子步球位移 < 球半徑 + 牆半徑（不可能一步越過牆）', ph['ballStep'] < ph['contactWall'], (ph['ballStep'], ph['contactWall']))
    ok('每子步擋板尖端位移 < 接觸厚度的 1/4', ph['tipStep'] < ph['contactFlip'] / 4, (round(ph['tipStep'], 1), ph['contactFlip']))
    ok('600 幀後位置 / 速度 / 擋板角都是整數（定點數）', ph['ints'])

    fl = page.evaluate(JS_FLIP)
    ok('擋板防穿模：%d 次落球（逐 px × 高度 × 揮動時機）0 次穿過擋板' % fl['trials'], fl['tunnels'] == 0 and fl['trials'] >= 400, fl)
    ok('擋板：解算後殘留穿透 ≤ 0.5 px', fl['worstPen'] <= 128, fl['worstPen'])
    cr = page.evaluate(JS_CRADLE)
    ok('擋板：托球（舉著擋板讓球停在支點邊）→ 放下、滾到中段再打，球以 ≥ 3 px/幀往上（左右 × 5 個落點）', cr['ok'] == cr['n'] and cr['n'] == 10, cr)

    wl = page.evaluate(JS_WALLS)
    ok('牆壁防穿模：%d 次最高速亂射 0 次逃出外框 / 穿過發射道牆' % wl['trials'], wl['escapes'] == 0 and wl['trials'] >= 300, wl)
    ok('牆壁：最大殘留穿透 ≤ 0.5 px', wl['worstPen'] <= 128, wl['worstPen'])

    el = page.evaluate(JS_ELEMENTS)
    ok('發射桿滿力 → 球到桌頂（y < 60）', el['fullTop'] < 60, el['fullTop'])
    ok('發射桿弱力 → 球回到發射桿重新停靠', el['weakRepark'])
    ok('保險桿：踢出速度 ≥ 4 px/幀', el['bump'] >= 1 and el['bumpSpeed'] >= 4, el)
    ok('正中央落下 → drain 事件', el['drain'])
    ok('滾道感應（S-T-A-R 第 2 條）', el['lane'] == 1, el['lane'])
    ok('星洞：吸住後吐出', el['saucer'] and el['eject'], el)
    ok('落下靶：打中第 2 片', el['drop'] == 1, el['drop'])
    ok('擋板 ≤ 4 幀舉到頂', 1 <= el['flipFrames'] <= 4, el['flipFrames'])

    # ---------------- 美術 / 聲音 ----------------
    a = page.evaluate("""() => { const A = CT.Pinball.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        lights: A.LIGHTS.length, used: Object.keys(A.T.used).length,
        rows: A.flipTiles.map(f => [0,1,2].map(r => [0,1,2].filter(c => f[r*3+c] >= 0).length)) }; }""")
    ok('背景 bank ≤ 256 磚、精靈 bank ≤ 256', a['bg'] <= 256 and a['spr'] <= 256, a)
    ok('燈號 16 顆（滾道 4 / 倍率 4 / SAVE / 落下靶 3 / 立靶 3 / 星洞）且互不共用磚格', a['lights'] == 16 and a['used'] > 0, a['lights'])
    ok('擋板 8 影格、每列 ≤ 3 磚（兩支 + 球 ≤ 7 精靈 / 線）', len(a['rows']) == 8 and max(max(r) for r in a['rows']) <= 3, a['rows'])
    au = page.evaluate("""() => { const A = CT.Pinball.Audio; return { songs: Object.keys(A.SONGS), sfx: Object.keys(A.SFX) }; }""")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4（全部 pinball_ 前綴）', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('pinball_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 流程 ----------------
    s = st(page)
    ok('開機 = 標題畫面', s['mode'] == 'title', s['mode'])
    page.evaluate("() => __nes.tap('start', 1)"); page.evaluate("() => __nes.step(3)")
    s = st(page)
    ok('START → 開始（球 1/3、停在發射桿）', s['mode'] == 'play' and s['ball'] == 1 and s['parked'], s)
    ok('發射桿停靠時相機在桌底（248）', s['cam'] == 248, s['cam'])
    page.evaluate("() => { __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1); }")
    ok('SELECT + START 不觸發暫停（保留給回選單）', not st(page)['paused'])
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(1); }")
    s1 = st(page)
    page.evaluate("() => __nes.press('down', 30)")
    s2 = st(page)
    ok('START = 暫停，暫停中按鍵無效', s1['paused'] and s2['parked'], (s1['paused'], s2['parked']))
    page.evaluate("() => { __nes.tap('start', 1); __nes.press('down', 48); __nes.release(); __nes.step(40); }")
    s = st(page)
    ok('解除暫停 → 蓄力發射，球離開發射道、相機上移', not s['parked'] and s['cam'] < 248, s)
    hud = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Pinball.Art.make(); const want = A.textTiles('SC ');
        return [0,1,2].every((i) => p.getTile(2, 1 + i, 26) === want[i]); }""")
    ok('狀態列（下方名稱表 row 26）寫著 SC 分數', hud)
    # 救球：開局救球時間內漏球 → 球數不變
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(), b = g.w.ball; b.x = 120 * 256; b.y = 440 * 256; b.vx = 0; b.vy = 512;
        for (let i = 0; i < 10; i++) __nes.step(1); return { ball: g.ball, parked: b.parked, msg: g.msg }; }""")
    ok('救球：開局救球時間內漏球 → 回到發射桿、球數不變', r['ball'] == 1 and r['parked'] and 'SAVED' in r['msg'], r)
    # 沒有救球 → 下一顆
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(), w = g.w; g.saveLit = false;
        w.launch(48); for (let i = 0; i < 5; i++) __nes.step(1); g.autoSave = 0; g.saveLit = false;
        const b = w.ball; b.x = 120 * 256; b.y = 440 * 256; b.vx = 0; b.vy = 512;
        for (let i = 0; i < 200; i++) __nes.step(1); return { ball: g.ball, parked: b.parked, bonus: g.bonus }; }""")
    ok('漏球（無救球）→ 結算 BONUS、換第 2 顆', r['ball'] == 2 and r['parked'], r)
    # 規則：STAR 全亮 → 倍率 +1、任務 1 完成
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(), w = g.w; w.launch(48); for (let i = 0; i < 60; i++) __nes.step(1);
        const m0 = g.mult, s0 = g.score;
        for (let k = 0; k < 4; k++) { w.events.length = 0; }
        g.lanes = [1, 1, 1, 0];
        const b = w.ball; b.x = CT.Pinball.Phys.LANES[3] * 256; b.y = 22 * 256; b.vx = 0; b.vy = 64;
        for (let i = 0; i < 30 && g.mult === m0; i++) __nes.step(1);
        return { m0, m1: g.mult, mission: g.mission, gain: g.score - s0 }; }""")
    ok('S-T-A-R 四燈全亮 → 倍率 +1、任務 M1 完成', r['m1'] == r['m0'] + 1 and r['mission'] == 1 and r['gain'] >= 6000, r)
    r = page.evaluate("""() => { const d = CT.Pinball.dev, g = d.g(); const r0 = g.rank;
        g.mission = 1; g.mprog = 0; for (let i = 0; i < 40; i++) d.missionEvent('bump');
        d.missionEvent('drops'); d.missionEvent('stands'); d.missionEvent('hole');
        return { r0, r1: g.rank, mission: g.mission, done: g.missionsDone }; }""")
    ok('任務組合 M1→M5 全完成 → RANK +1、任務回到 M1', r['r1'] == r['r0'] + 1 and r['mission'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(); return g.rank; }""")
    ok('RANK 提高後開局救球時間縮短（≥ 180 幀）', page.evaluate("() => { const g = CT.Pinball.dev.g(); return g.rank >= 2; }"), r)

    # 密技
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(); const b0 = g.balls; const okc = CT.cheat(); __nes.step(1);
        return { okc, b0, b1: g.balls, saveLit: g.saveLit, cheated: g.cheated }; }""")
    ok('密技：+1 顆球並點亮 SAVE，標記 cheated', r['okc'] and r['b1'] == r['b0'] + 1 and r['saveLit'] and r['cheated'], r)
    fresh(page)
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(2); CT.cheat(); __nes.step(1);
        const d = CT.Pinball.dev, g = d.g(); d.award(999999); return { goal: CT.get('pinball').goal(), score: g.score, cheated: g.cheated }; }""")
    ok('用過密技後分數再高也不算機器人 goal', r['cheated'] and not r['goal'], r)

    # GAME OVER + 最高分
    fresh(page)
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(2); const d = CT.Pinball.dev, g = d.g();
        d.award(12345);
        for (let n = 0; n < 3; n++) { g.autoSave = 0; g.saveLit = false; g.w.launch(48); __nes.step(3); g.autoSave = 0; g.saveLit = false;
          const b = g.w.ball; b.x = 120 * 256; b.y = 445 * 256; b.vy = 512; b.vx = 0; __nes.step(140); }
        return { mode: g.mode, best: CT.load('pinball', 'best', 0), score: g.score, goal: CT.get('pinball').goal(), gs: CT.Pinball.GOAL_SCORE }; }""")
    ok('3 顆球用完 → GAME OVER，最高分寫入存檔', r['mode'] == 'over' and r['best'] == r['score'] and r['best'] >= 12345, r)
    ok('goal 門檻 = 30000 分（未達 → goal false）', r['gs'] == 30000 and not r['goal'], r)
    page.evaluate("() => { __nes.step(70); __nes.tap('start', 1); __nes.step(2); }")
    ok('GAME OVER → START 回標題', st(page)['mode'] == 'title')

    # ---------------- fix-r5 統一規則 ----------------
    # §6-1 / P2-1：GAME OVER 按密技 = 原地續關（補回 3 顆球、保留分數 / 任務 / RANK），用過的那局 goal 一律 false
    fresh(page)
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(2); const d = CT.Pinball.dev, g = d.g();
        d.award(4321); g.mission = 2; g.rank = 2; g.mult = 3;
        for (let n = 0; n < 3; n++) { g.autoSave = 0; g.saveLit = false; g.w.launch(48); __nes.step(3); g.autoSave = 0; g.saveLit = false;
          const b = g.w.ball; b.x = 120 * 256; b.y = 445 * 256; b.vy = 512; b.vx = 0; __nes.step(140); }
        const before = { mode: g.mode, score: g.score, mission: g.mission, rank: g.rank };
        const c = CT.cheat(); __nes.step(1); const s = GAME.state().s;
        return { before, c, mode: s.mode, ball: s.ball, balls: s.balls, score: s.score, mission: s.mission, rank: s.rank,
                 parked: s.parked, cheated: s.cheated, cont: s.continues, song: CT.Pinball.Audio.current }; }""")
    ok('§6-1 GAME OVER 按密技 → 立刻回到遊玩（球 1/3、停在發射桿）', r['before']['mode'] == 'over' and r['c'] and r['mode'] == 'play'
       and r['ball'] == 1 and r['balls'] == 3 and r['parked'], r)
    ok('§6-1 續關保留分數 / 任務進度 / RANK，BGM 換回遊玩曲', r['score'] == r['before']['score'] and r['mission'] == r['before']['mission']
       and r['rank'] == r['before']['rank'] and r['song'] == 'pinball_play' and r['cont'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Pinball.dev, g = d.g(); g.goalHit = true; d.award(99999);
        return { goal: CT.get('pinball').goal(), sg: GAME.state().s.goal }; }""")
    ok('§6-1 續關過的那局：goal() 與 state().goal 一律 false', not r['goal'] and not r['sg'], r)
    r = page.evaluate("""() => { const g = CT.Pinball.dev.g(); g.autoSave = 0; g.saveLit = false; g.w.launch(48); __nes.step(3);
        g.autoSave = 0; g.saveLit = false; const b = g.w.ball; b.x = 120 * 256; b.y = 445 * 256; b.vy = 512; b.vx = 0; __nes.step(140);
        return { ball: g.ball, mode: g.mode }; }""")
    ok('續關後漏球照常扣球（球 2/3）', r['ball'] == 2 and r['mode'] == 'play', r)
    # P3-7：標題畫面按密技無效
    fresh(page)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Pinball.dev.g(); return { c, cheated: g.cheated, mode: g.mode }; }")
    ok('P3-7 標題畫面按密技無效（不生效、不標記）', not r['c'] and not r['cheated'] and r['mode'] == 'title', r)
    # P3-5 / §6-5：標題說明行距 + 回選單提示
    r = page.evaluate("""() => { const p = __nes.nes().ppu; const rows = [];
        for (let y = 10; y <= 26; y++) { let n = 0; for (let x = 2; x < 30; x++) if (p.getTile(0, x, y)) n++; rows.push(n > 0); }
        let adj = 0; for (let i = 1; i < rows.length; i++) if (rows[i] && rows[i - 1]) adj++;
        const A = CT.Pinball.Art.make(), want = A.textTiles('HOLD START+SELECT: MENU');
        let found = false; for (let y = 10; y <= 26 && !found; y++) for (let x = 2; x + want.length <= 30 && !found; x++) found = want.every((t, i) => p.getTile(0, x + i, y) === t);
        return { adj, found }; }""")
    ok('P3-5 標題說明文字行與行之間都空一列', r['adj'] == 0, r)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', r['found'], r)
    # §6-2 / P3-1：暫停 = BGM 停、恢復接續同一小節
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(200); const M = __nes.nes().music, m = { get orderIndex() { return M.state().orderIndex; }, get rowsPlayed() { return M.state().rowsPlayed; }, get playing() { return M.state().playing; } };
        const ord0 = m.orderIndex; __nes.tap('start', 1); __nes.step(1); const r0 = m.rowsPlayed, pl = m.playing; __nes.step(120);
        const r1 = m.rowsPlayed, hudPause = GAME.state().s.paused; __nes.tap('start', 1); __nes.step(1);
        return { ord0, pl, still: r1 === r0, hudPause, resumed: m.playing, ord1: m.orderIndex, song: CT.Pinball.Audio.current }; }""")
    ok('§6-2 暫停時 BGM 停止（120 幀 rowsPlayed 不動）', r['hudPause'] and not r['pl'] and r['still'], r)
    ok('§6-2 解除暫停 → 同一首、同一小節接續播放', r['resumed'] and r['song'] == 'pinball_play' and r['ord1'] == r['ord0'], r)
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(2); const p = __nes.nes().ppu, A = CT.Pinball.Art.make(), w = A.textTiles('PAUSE  HOLD');
        const ok = w.every((t, i) => p.getTile(2, 1 + i, 27) === t); __nes.tap('start', 1); __nes.step(2); return ok; }""")
    ok('§6-5 暫停狀態列寫著 PAUSE  HOLD START+SELECT: MENU', r)
    # §6-3 / P3-2：中途離開也存最高分（只寫比舊值大的）
    r = page.evaluate("""() => { const d = CT.Pinball.dev, g = d.g(); d.award(4750); const sc = g.score; CT.get('pinball').exit(__nes.nes());
        const b1 = CT.load('pinball', 'best', 0); g.score = 10; CT.get('pinball').exit(__nes.nes()); const b2 = CT.load('pinball', 'best', 0);
        return { sc, b1, b2, text: CT.get('pinball').bestText() }; }""")
    ok('§6-3 exit() 存最高分（較低分不覆蓋）、bestText 反映', r['b1'] == r['sc'] and r['b2'] == r['sc'] and r['text'] == str(r['sc']).zfill(7), r)
    # §6-4 / P3-9：backTile 指向自己精靈表裡的彈珠
    r = page.evaluate("""() => { const g = CT.get('pinball'), bt = g.backTile, A = CT.Pinball.Art.make();
        return { bt, ball: A.spr.index('BALL') }; }""")
    ok('§6-4 backTile = {tile: BALL, pal 0..3}', r['bt'] and r['bt']['tile'] == r['ball'] and 0 <= r['bt']['pal'] <= 3, r)

    # ---------------- 硬限制：機器人 2400 幀逐幀量 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let maxLine = 0, over = 0, peak = 0, colors = 0;
        for (let i = 0; i < 2400; i++) { __nes.step(1); const s = __nes.stats(); maxLine = Math.max(maxLine, s.maxSpritesLine);
          peak = Math.max(peak, s.budget.used); colors = Math.max(colors, s.colors); }
        const s = __nes.stats(); return { maxLine, over: s.budget.overFrames, peak, colors, score: GAME.state().s.score }; }""")
    ok('機器人 2400 幀：每線精靈 ≤ 8（逐幀）', hl['maxLine'] <= 8, hl)
    ok('機器人 2400 幀：VBlank overFrames == 0、單幀 ≤ 160 byte', hl['over'] == 0 and hl['peak'] <= 160, hl)
    ok('同屏色數 ≤ 25', hl['colors'] <= 25, hl['colors'])
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：遊玩畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})
    cam = page.evaluate("""() => { const g = CT.Pinball.dev.g(), b = g.w.ball; b.parked = false; b.x = 120 * 256; b.y = 60 * 256; b.vx = 0; b.vy = 0;
        for (let i = 0; i < 12; i++) __nes.step(1); return g.cam; }""")
    ok('桌面 > 1 畫面：球在桌頂時相機捲到 0 附近', cam <= 8, cam)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_pinball: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
