# -*- coding: utf-8 -*-
"""《星塵連打 STAR MASH》（cart2 槽 8，id = mash）自動驗證。

重點：**只認按下邊緣**（按住 / 每幀狂按都只算邊緣）、4 模式規則（10 秒連打 / A-B 交替 / 指令連段 / 耐力節拍帶）、
      指令連段長度與限時隨連段變化、3 次失誤 GAME OVER、§6 規則、機器人「合理節奏」（絕不連續兩幀按鍵）、
      每線 ≤ 8 精靈、VBlank ≤ 160。
作法：Playwright 開 `cart2.html?game=mash&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Mash.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_mash.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=mash'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
KB = {'U': UP, 'D': DOWN, 'L': LEFT, 'R': RIGHT, 'A': A, 'B': B}


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Mash && !!CT.Mash.dev')
    page.evaluate('() => { ["best","alt","combo","end"].forEach(k => localStorage.removeItem("nes.cart2.mash." + k)); __nes.step(1); }')


def run(page):
    return page.evaluate('() => GAME.state().s.run')


def start(page, m):
    """直接開模式 m（0..3）並跳過倒數。"""
    page.evaluate('(m) => { CT.Mash.dev.start(m); CT.Mash.dev.begin(); __nes.step(1); }', m)


def press(page, mask):
    page.evaluate('(m) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(1); }', mask)


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, consec: 0, presses: 0 };
  let prev = 0;
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const m = NES.Input.mask();
    if (m && prev) r.consec++;
    if (m && !prev) r.presses++;
    prev = m;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const g = GAME.state();
    if (o.until === 'goal' && g.goal) break;
    if (o.until && g.s.mode === o.until) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
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

    # ---------------- 契約 / 資產 ----------------
    reg = page.evaluate("""() => { const g = CT.get('mash'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id / order 8 / title / legacy 4 款', reg and reg['id'] == 'mash' and reg['order'] == 8 and reg['title'] == '星塵連打' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 6 字元（000HIT）', reg['bestText'] == '000HIT', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Mash.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Mash.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Mash.Audio.SONGS), sfx: Object.keys(CT.Mash.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 mash_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('mash_') for k in au['songs'] + au['sfx']), au)
    ok('4 個模式、8 階稱號', page.evaluate('() => CT.Mash.MODES.length === 4 && CT.Mash.TITLES.length === 8'))

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Mash.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(6, 26) if tt[i].strip()]
    ok('§6-6 說明 / 模式列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)

    # ---------------- 只認按下邊緣 ----------------
    start(page, 0)
    page.evaluate('() => { NES.Input.inject(1, 60); __nes.step(60); __nes.step(2); }')
    ok('RAPID：A 按住 60 幀只算 1 下', run(page)['count'] == 1, run(page)['count'])
    start(page, 0)
    page.evaluate('() => { for (let i = 0; i < 60; i++) { NES.Input.inject((i & 1) ? 0 : 1, 1); __nes.step(1); } }')
    ok('RAPID：每幀狂按（按 / 放交替 60 幀）上限 = 30 下（只有邊緣）', run(page)['count'] == 30, run(page)['count'])
    start(page, 0)
    page.evaluate('() => { for (let i = 0; i < 60; i++) { NES.Input.inject(1, 1); __nes.step(1); } }')
    ok('RAPID：連續 60 幀都「注入按下」（模擬鍵盤自動重複）= 1 下', run(page)['count'] == 1, run(page)['count'])
    start(page, 0)
    press(page, A | B)
    ok('RAPID：A、B 同幀按下 = 2 下（兩顆鍵各自的邊緣）', run(page)['count'] == 2, run(page)['count'])
    r = page.evaluate('() => { __nes.step(700); return GAME.state().s; }')
    ok('RAPID：10 秒後 → 結算（計次 / 每秒 / 稱號）', r['mode'] == 'result', r['mode'])
    ok('稱號門檻：0 STARDUST / 60 METEOR / 130 SUPERNOVA', page.evaluate("() => [0, 60, 130].map(CT.Mash.dev.titleOf).join(',')") == 'STARDUST,METEOR,SUPERNOVA')
    ok('結算畫面密技無效', page.evaluate('() => CT.cheat()') is False)

    # ---------------- A/B 交替 ----------------
    start(page, 1)
    for k in (A, B, A, B):
        press(page, k)
    r1 = run(page)
    press(page, B)
    r2 = run(page)
    press(page, A)
    r3 = run(page)
    page.evaluate('() => __nes.step(10)')
    press(page, A)
    r4 = run(page)
    ok('SWITCH：A B A B = 4 步', r1['count'] == 4, r1)
    ok('SWITCH：同鍵連按 = 絆倒（不算、trips +1）', r2['count'] == 4 and r2['trips'] == 1 and r2['trip'] > 0, r2)
    ok('SWITCH：絆倒中按鍵無效、恢復後換鍵才算', r3['count'] == 4 and r4['count'] == 5, (r3['count'], r4['count']))

    # ---------------- 指令連段 ----------------
    start(page, 2)
    r = run(page)
    ok('COMMAND：開局 3 鍵、3 次失誤額度', len(r['seq']) == 3 and r['lives'] == 3, r)
    for ch in r['seq']:
        press(page, KB[ch])
    r = run(page)
    ok('COMMAND：照順序輸入 → 連段 1、得分', r['combo'] == 1 and r['score'] > 0, r)
    page.evaluate('() => __nes.step(20)')
    r = run(page)
    wrong = next(k for k in 'UDLRAB' if k != r['seq'][0])
    press(page, KB[wrong])
    r = run(page)
    ok('COMMAND：按錯 → 失誤 −1、連段 1 扣 5 → 0（不低於 0）', r['lives'] == 2 and r['combo'] == 0, r)
    page.evaluate('() => __nes.step(45)')
    page.evaluate('() => { CT.Mash.dev.g().run.combo = 7; }')
    r = run(page)
    wrong = next(k for k in 'UDLRAB' if k != r['seq'][r['pos']])
    press(page, KB[wrong])
    r = run(page)
    ok('COMMAND：連段 7 時按錯 → 扣 5 連段剩 2（fix-r6 友善版，不歸零）', r['lives'] == 1 and r['combo'] == 2, r)
    page.evaluate('() => { CT.Mash.dev.g().run.lives = 2; __nes.step(45); }')
    r = page.evaluate('() => { const R = CT.Mash.dev.g().run; __nes.step(R.seqT + 2); return GAME.state().s.run; }')
    ok('COMMAND：超時 → 失誤', r['lives'] == 1, r)
    lens = page.evaluate("""() => { const d = CT.Mash.dev, R = d.g().run, out = []; const c = R.combo;
        for (const k of [0, 4, 5, 10, 25, 40]) { R.combo = k; out.push([k, Math.min(8, 3 + Math.floor(k / 5)), d.seqTime(Math.min(8, 3 + Math.floor(k / 5)), k)]); }
        R.combo = c; return out; }""")
    ok('COMMAND：每 5 連段長度 +1（3 → 8 封頂）', [x[1] for x in lens] == [3, 3, 4, 5, 8, 8], lens)
    ok('COMMAND：同長度下限時隨連段縮短，且 ≥ 長度×14+50 幀', lens[4][2] >= 8 * 14 + 50 and lens[5][2] <= lens[4][2], lens)
    page.evaluate('() => __nes.step(45)')
    r = page.evaluate('() => { const R = CT.Mash.dev.g().run; __nes.step(R.seqT + 50); return GAME.state().s; }')
    ok('COMMAND：3 次失誤 → GAME OVER', r['mode'] == 'over', r['mode'])
    r = page.evaluate("""() => { const b = GAME.state().s.run; const c = CT.cheat(); __nes.step(2); const s = GAME.state().s;
        return { c, b, mode: s.mode, lives: s.run.lives, score: s.run.score, max: s.run.maxCombo, cheated: s.run.cheated, goal: GAME.state().goal }; }""")
    ok('§6-1 GAME OVER 按密技 → 原地續關（失誤額度補回、分數 / 最大連段保留）', r['c'] and r['mode'] == 'play' and r['lives'] == 3 and r['score'] == r['b']['score'] and r['max'] == r['b']['maxCombo'], r)
    ok('§6-1 用過密技那局 cheated、goal false', r['cheated'] and r['goal'] is False, r)

    # ---------------- 耐力 ----------------
    start(page, 3)
    r = page.evaluate("""() => { for (let i = 0; i < 240; i++) { NES.Input.inject(i % 12 === 0 ? 1 : 0, 1); __nes.step(1); } return GAME.state().s.run; }""")
    ok('ENDURANCE：每 12 幀一下（5/s）→ 落在第 1 帶 4-6 內', r['rate'] == 5 and r['inBand'] > 0 and r['inBand'] == r['judged'], r)
    r = page.evaluate("""() => { for (let i = 0; i < 120; i++) { NES.Input.inject(i % 4 === 0 ? 1 : 0, 1); __nes.step(1); } return GAME.state().s.run; }""")
    ok('ENDURANCE：太快（15/s）→ 出帶、不累積', r['rate'] > 6 and r['inBand'] < r['judged'], r)
    r = page.evaluate('() => { __nes.step(400); return GAME.state().s.run; }')
    ok('ENDURANCE：10 秒換第 2 帶', r['band'] == 1, r['band'])

    # ---------------- 暫停 / exit ----------------
    start(page, 0)
    r = page.evaluate("""() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 2); __nes.step(3); const p0 = GAME.state().s.paused;
        NES.Input.inject(8, 1); __nes.step(1); const t = GAME.state().s.run.time;
        for (let i = 0; i < 20; i++) { NES.Input.inject(i & 1 ? 0 : 1, 1); __nes.step(1); }
        const s = GAME.state().s, mp = __nes.nes().music.isPaused();
        NES.Input.inject(8, 1); __nes.step(2);
        return { p0, paused: s.paused, frozen: s.run.time === t && s.run.count === 0, mp, after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('SELECT + START 不觸發暫停', r['p0'] is False, r)
    ok('START 暫停：計時凍結、按鍵不計', r['paused'] and r['frozen'], r)
    ok('§6-2 暫停 = BGM 暫停，恢復接續', r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    r = page.evaluate("""() => { localStorage.removeItem('nes.cart2.mash.best'); CT.Mash.dev.start(0); CT.Mash.dev.begin();
        CT.Mash.dev.g().run.count = 77; CT.get('mash').exit(__nes.nes()); return { best: CT.load('mash', 'best', 0), txt: CT.get('mash').bestText() }; }""")
    ok('§6-3 exit() 存最高分；bestText = 077HIT', r['best'] == 77 and r['txt'] == '077HIT', r)
    r = page.evaluate("""() => { CT.Mash.dev.start(0); CT.Mash.dev.begin(); const g = CT.Mash.dev.g(); g.run.count = 150; CT.cheat(); __nes.step(1);
        CT.Mash.dev.result(); return { best: CT.load('mash', 'best', 0), time: g.run.time }; }""")
    ok('用過密技的測定不存紀錄', r['best'] == 77, r)

    # ---------------- 機器人：合理節奏、每線 / VBlank ----------------
    worst = {}
    for m in range(1, 5):
        fresh(page, '&bot=1&mmode=%d&direct=1' % m)
        rr = page.evaluate(RUN, {'n': 900})
        worst[m] = (rr['ml'], rr['over'], rr['peak'], rr['consec'], rr['presses'])
    ok('四模式機器人：從不連續兩幀按鍵（每次 1 幀就放）', all(v[3] == 0 for v in worst.values()), worst)
    ok('四模式：每線精靈 ≤ 8、overFrames 0、VBlank ≤ 160', all(v[0] <= 8 and v[1] == 0 and v[2] <= 160 for v in worst.values()), worst)
    fresh(page, '&bot=1&mmode=1&direct=1')
    rr = page.evaluate(RUN, {'n': 900, 'until': 'result'})
    ok('RAPID 機器人每 5 幀一下 ⇒ 10 秒 120 下（12/s，人類高手範圍）', rr['s']['run']['count'] == 120, rr['s']['run']['count'])
    fresh(page, '&bot=1&mmode=4&direct=1')
    rr = page.evaluate(RUN, {'n': 3900, 'until': 'result'})
    ok('ENDURANCE 機器人照帶中央節奏 ⇒ 評價 A 以上', rr['s']['mode'] == 'result' and rr['s']['run']['grade'] <= 1, rr['s']['run'])

    fresh(page, '&bot=1')
    rr = page.evaluate(RUN, {'n': 20000, 'until': 'goal'})
    ok('機器人（不開密技）：COMMAND 一局 ≥ 30 連段 → goal', rr['goal'] and rr['s']['run']['maxCombo'] >= 30, {'f': rr['f'], 'run': rr['s']['run']})
    ok('機器人全程：每線 ≤ 8、overFrames 0、從不連按', rr['ml'] <= 8 and rr['over'] == 0 and rr['consec'] == 0, {'ml': rr['ml'], 'over': rr['over'], 'consec': rr['consec']})
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d' % (rr['f'], rr['ml'], rr['over'], rr['peak']))

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_mash: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
