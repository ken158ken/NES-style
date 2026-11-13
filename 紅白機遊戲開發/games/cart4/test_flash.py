# -*- coding: utf-8 -*-
"""《星塵閃記 STAR FLASH》（cart4 槽 3，id = flash）自動驗證。

重點：四模式（圖案重現 / 序列重現 / 哪裡變了 / 與 CPU 吱比競速）規則與等級表、READY 預備期不收輸入、B 重看（扣分不扣命）、
      序列每格有音高 + 亮格（靜音也能玩）、找差異的變化 = 資料差異、競速 CPU 記錯會出局、§6 規則、
      機器人只讀畫面（Proxy 監看答案陣列：bot() 期間讀取次數 = 0）、反應延遲 0 / 12 / 24 都過 goal、每線 ≤ 8、VBlank ≤ 160、lint。
作法：Playwright 開 `cart4.html?game=flash&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Flash.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_flash.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=flash'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Flash && !!CT.Flash.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.flash.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def run(page):
    return page.evaluate('() => GAME.state().s.run')


def start(page, m, opt):
    page.evaluate('([m, o]) => { CT.Flash.dev.start(m, o); __nes.step(1); }', [m, opt])


def press(page, mask, n=1):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 1); __nes.step(1); }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def until_phase(page, ph, n=600):
    return page.evaluate('([ph, n]) => { for (let i = 0; i < n; i++) { if (GAME.state().s.run && GAME.state().s.run.phase === ph) return i; __nes.step(1); } return -1; }', [ph, n])


def tap_cell(page, i):
    page.evaluate('(i) => { const R = CT.Flash.dev.g().run; R.cx = i % R.n; R.cy = Math.floor(i / R.n); }', i)
    press(page, A)


def answer(page):
    return page.evaluate('() => CT.Flash.dev.answer()')


SCREEN = """() => { const p = __nes.nes().ppu, A = CT.Flash.Art.make(); const rows = [];
  for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
    for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-!.') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
  return rows; }"""

RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, maxLv: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const g = GAME.state();
    if (g.s.run) r.maxLv = Math.max(r.maxLv, g.s.run.cleared | 0);
    if (o.until === 'goal' && g.goal) break;
    if (o.until && o.until !== 'goal' && g.s.mode === o.until) break;
    if (o.until2 && g.s.mode === o.until2) break;
    if (o.lv && g.s.run && (g.s.run.cleared | 0) >= o.lv) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

# 機器人誠實度：bot() 執行期間讀答案陣列（lit / seq / changes / before / after / cpu）就計數
SPY = r"""
() => {
  const G = CT.get('flash'), ob = G.bot;
  window.__peek = 0; window.__inBot = false;
  G.bot = function (n) { window.__inBot = true; try { return ob.call(G, n); } finally { window.__inBot = false; } };
  window.__wrapRun = () => {
    const R = CT.Flash.dev.g().run;
    if (!R) return;
    for (const k of ['lit', 'seq', 'changes', 'before', 'after']) {
      const v = R[k];
      if (!v || v.__spy) continue;
      const p = new Proxy(v, { get(t, key) { if (key === '__spy') return true; if (window.__inBot) window.__peek++; return t[key]; } });
      R[k] = p;
    }
  };
}
"""
RUN_SPY = r"""
(o) => {
  const r = { f: 0 };
  for (let i = 0; i < o.n; i++) {
    window.__wrapRun(); __nes.step(1); r.f++;
    const g = GAME.state();
    if (o.lv && g.s.run && (g.s.run.cleared | 0) >= o.lv) break;
    if (g.goal) break;
  }
  r.goal = GAME.state().goal; r.peek = window.__peek; r.cleared = GAME.state().s.run && GAME.state().s.run.cleared;
  return r;
}
"""


def lint(page):
    page.evaluate('() => __nes.render()')
    lt = page.evaluate('() => __nes.lint()')
    return lt.get('ok') and lt.get('colors', 99) <= 25, lt.get('colors')


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
    reg = page.evaluate("""() => { const g = CT.get('flash'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id flash / order 3 / title 星塵閃記 / legacy 5 款', reg and reg['id'] == 'flash' and reg['order'] == 3 and reg['title'] == '星塵閃記' and len(reg['legacy']) == 5, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（000000）', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Flash.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Flash.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    shp = page.evaluate("""() => { const A = CT.Flash.Art.make(), b = A.bg, k = ['EMP','LIT','MRK','BAD','MIS'];
      const big = new Set(k.map(s => [0,1,2,3].map(i => Array.from(b.tiles[b.index('C_' + s + '_' + i)]).join('')).join('|'))).size;
      const sm = new Set(k.map(s => [0,1,2,3].map(i => Array.from(b.tiles[b.index('SC_' + s + '_' + i)]).join('')).join('|'))).size;
      const sy = new Set([0,1,2,3,4,5,6,7].map(s => [0,1,2,3].map(i => Array.from(b.tiles[b.index('SY_' + s + '_' + i)]).join('')).join('|'))).size;
      return [big, sm, sy]; }""")
    ok('格子 5 狀態形狀全不同（大格 / 小格，色弱可分）、找差異 8 種符號全不同', shp == [5, 5, 8], shp)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Flash.Audio.SONGS), sfx: Object.keys(CT.Flash.Audio.SFX), tones: CT.Flash.Audio.TONES })")
    ok('BGM ≥ 3 首、音效 ≥ 4，全部 flash_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4 and all(k.startswith('flash_') for k in au['songs'] + au['sfx']), au['songs'])
    ok('序列格子音 16 個、音高全不同', len(au['tones']) == 16 and len(set(au['tones'])) == 16, au['tones'])
    seqsong = page.evaluate("() => CT.Flash.Audio.SONGS.flash_seq.patterns.every(p => p.p1.every(x => !x) && p.p2.every(x => !x))")
    ok('序列模式 BGM 不用方波（讓出 p2 給格子音）', seqsong)
    ok('4 模式、競速 3 級 CPU', page.evaluate('() => CT.Flash.MODES.length === 4 && CT.Flash.CPUS.length === 3'))
    tb = page.evaluate('() => CT.Flash.TABLE')
    ok('圖案等級表：12 級、格數不減、3×3 → 4×4 → 5×5、第 8 級 5×5 亮 8 格',
       tb['MAX_LV'] == 12 and all(tb['PAT_K'][i] <= tb['PAT_K'][i + 1] for i in range(1, 12)) and tb['PAT_N'][1] == 3 and tb['PAT_N'][3] == 4 and tb['PAT_N'][6] == 5 and tb['PAT_K'][8] == 8, tb['PAT_K'])

    # ---------------- 標題 ----------------
    tt = page.evaluate(SCREEN)
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(6, 26) if tt[i].strip()]
    ok('§6-6 說明 / 選單列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    ok('標題 BGM = flash_title、lint 綠', st(page)['music'] == 'flash_title' and lint(page)[0], lint(page))
    press(page, DOWN)
    press(page, RIGHT)
    s = st(page)
    ok('標題：↓ 換模式、→ 換速度', s['sel'] == 1 and s['lvl'][1] == 2, (s['sel'], s['lvl']))

    # ---------------- 圖案重現 ----------------
    fresh(page)
    start(page, 0, 1)
    r = run(page)
    press(page, A)
    press(page, RIGHT)
    ok('開局 READY：第 1 級預備 90 幀、期間按鍵無效', r['phase'] == 'ready' and run(page)['marks'] == 0 and run(page)['cx'] == 1 and page.evaluate('() => CT.Flash.K.READY_F') == 90, r)
    w = until_phase(page, 'show', 200)
    ok('READY 結束 ⇒ 展示（第 1 級 3×3 亮 3 格、展示 70 幀）', w > 0 and run(page)['n'] == 3 and run(page)['k'] == 3 and run(page)['showT'] == 70, (w, run(page)['showT']))
    step(page, 3)
    ans = answer(page)
    lit_scr = page.evaluate("""() => { const R = CT.Flash.dev.g().run, A = CT.Flash.Art.make(), p = __nes.nes().ppu, out = [];
      for (let i = 0; i < R.n * R.n; i++) { const rc = CT.Flash.dev.bigRC(i); if (p.getTile(0, rc[0] + 1, rc[1] + 1) === A.t('C_LIT_0')) out.push(i); } return out; }""")
    ok('展示中畫面上亮的格 = 答案', sorted(lit_scr) == sorted(ans), (lit_scr, ans))
    ok('展示畫面 lint 綠', lint(page)[0])
    tap_cell(page, ans[0])
    ok('展示中按 A 無效（不能偷點）', run(page)['marks'] == 0)
    until_phase(page, 'input', 200)
    for c in ans:
        tap_cell(page, c)
    r = run(page)
    ok('點對全部 ⇒ 過關、+300（100×3）', r['phase'] == 'judge' and r['ok'] and r['score'] == 300, (r['phase'], r['score']))
    until_phase(page, 'ready', 200)
    ok('過關 ⇒ 第 2 級（LEVEL n 預備 45 幀）', run(page)['level'] == 2 and run(page)['k'] == 4)
    until_phase(page, 'input', 400)
    ans = answer(page)
    wrong = [i for i in range(9) if i not in ans][0]
    tap_cell(page, ans[0])
    tap_cell(page, wrong)
    r = run(page)
    mis = page.evaluate("""(ans) => { const A = CT.Flash.Art.make(), p = __nes.nes().ppu; __nes.step(2);
      return ans.slice(1).every(i => { const rc = CT.Flash.dev.bigRC(i); return p.getTile(0, rc[0] + 1, rc[1] + 1) === A.t('C_MIS_0'); }); }""", ans)
    ok('點錯 ⇒ 扣 1 命、漏掉的格畫空心星（MIS）', r['lives'] == 2 and not r['ok'] and mis, (r['lives'], mis))
    until_phase(page, 'ready', 200)
    ok('點錯 ⇒ 同一級換新圖重來', run(page)['level'] == 2)
    until_phase(page, 'input', 400)
    lv0 = run(page)['lives']
    press(page, B)
    r = run(page)
    ok('B 重看 ⇒ 回展示、不扣命', r['phase'] == 'show' and r['replayUsed'] and r['lives'] == lv0, r['phase'])
    until_phase(page, 'input', 400)
    press(page, B)
    ok('重看每級只有 1 次', run(page)['phase'] == 'input')
    sc0 = run(page)['score']
    for c in answer(page):
        tap_cell(page, c)
    ok('重看過的那級得分減半（100×4/2 = 200）', run(page)['score'] - sc0 == 200, run(page)['score'] - sc0)
    # 等級 6 = 5×5、展示時間 EXPERT ×0.7
    page.evaluate('() => CT.Flash.dev.level(8)')
    ok('第 8 級 = 5×5 亮 8 格、NORMAL 展示 120 幀', run(page)['n'] == 5 and run(page)['k'] == 8 and run(page)['showT'] == 120, (run(page)['n'], run(page)['k'], run(page)['showT']))
    ok('5×5 盤面 lint 綠', lint(page)[0])
    fresh(page)
    start(page, 0, 0)
    t_relax = run(page)['showT']
    start(page, 0, 2)
    ok('速度：RELAX 展示 ×1.5（105）/ EXPERT ×0.7（49）', t_relax == 105 and run(page)['showT'] == 49, (t_relax, run(page)['showT']))

    # ---------------- 密技 / GAME OVER / 暫停 ----------------
    fresh(page)
    start(page, 0, 1)
    until_phase(page, 'input', 300)
    page.evaluate('() => { CT.Flash.dev.g().run.lives = 1; }')
    ans = answer(page)
    tap_cell(page, [i for i in range(9) if i not in ans][0])
    page.evaluate('() => { for (let i = 0; i < 200 && GAME.state().s.mode === "play"; i++) __nes.step(1); }')
    ok('最後一命點錯 ⇒ GAME OVER', st(page)['mode'] == 'over')
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    r = run(page)
    ok('§6-1 GAME OVER 密技 ⇒ 原地續關（同一級、命補回 3）', st(page)['mode'] == 'play' and r['level'] == 1 and r['lives'] == 3 and r['cheated'] and r['continues'] == 1, r)
    ok('§6-1 用過密技 ⇒ goal false', page.evaluate('() => GAME.state().goal') is False)
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    ok('遊玩中密技 = +1 命', run(page)['lives'] == 4)
    until_phase(page, 'show', 200)
    m0 = page.evaluate('() => __nes.nes().music.isPaused()')
    pt0 = run(page)['pt']
    press(page, START)
    step(page, 30)
    ptxt = '\n'.join(page.evaluate(SCREEN))
    ok('§6-2 START 暫停 ⇒ BGM 暫停、展示計時凍結、寫 HOLD START+SELECT: MENU',
       m0 is False and st(page)['paused'] and page.evaluate('() => __nes.nes().music.isPaused()') and run(page)['pt'] == pt0 and 'HOLD START+SELECT: MENU' in ptxt, (pt0, run(page)['pt']))
    press(page, START)
    ok('§6-2 再按 START ⇒ 解除、BGM 接續', not st(page)['paused'] and not page.evaluate('() => __nes.nes().music.isPaused()'))
    fresh(page)
    start(page, 0, 1)
    page.evaluate('() => { const R = CT.Flash.dev.g().run; R.score = 4321; R.cleared = 5; CT.get("flash").exit(__nes.nes()); }')
    ok('§6-3 中途離開（exit）也存最高分 / 最高級（004321、lv0 = 5）',
       page.evaluate('() => CT.get("flash").bestText()') == '004321' and page.evaluate('() => CT.load("flash", "lv0", 0)') == 5)

    # ---------------- 序列 ----------------
    fresh(page)
    start(page, 1, 1)
    until_phase(page, 'show', 200)
    seen = page.evaluate("""() => { const R = CT.Flash.dev.g().run, A = CT.Flash.Art.make(), p = __nes.nes().ppu, out = []; let prev = -1;
      while (GAME.state().s.run.phase === 'show') { __nes.step(1); let lit = -1;
        for (let i = 0; i < R.n * R.n; i++) { const rc = CT.Flash.dev.bigRC(i); if (p.getTile(0, rc[0] + 1, rc[1] + 1) === A.t('C_LIT_0')) lit = i; }
        if (lit >= 0 && lit !== prev) out.push(lit); prev = lit; }
      return out; }""")
    ans = answer(page)
    ok('序列：畫面依序亮格 = 答案順序（長度 = 等級 + 2 = 3）', seen == ans and len(ans) == 3, (seen, ans))
    snd = page.evaluate("""() => { const R = CT.Flash.dev.g().run; return R.seq.map(c => 'flash_t' + c).every(k => !!CT.Flash.Audio.SFX[k]); }""")
    ok('序列：每格有自己的音（flash_t<格>）', snd)
    for c in ans:
        tap_cell(page, c)
        step(page, 12)
    ok('序列：照順序點回 ⇒ 過關', run(page)['phase'] == 'judge' and run(page)['ok'], run(page)['phase'])
    until_phase(page, 'input', 600)
    ans = answer(page)
    tap_cell(page, ans[1] if ans[1] != ans[0] else (ans[0] + 1) % 9)
    step(page, 12)
    ok('序列：順序點錯 ⇒ 扣命', run(page)['lives'] == 2 and not run(page)['ok'], run(page))

    # ---------------- 找差異 ----------------
    fresh(page)
    start(page, 2, 1)
    until_phase(page, 'mask', 400)
    step(page, 2)
    ok('找差異：展示後先蓋牌（全部空格）', run(page)['phase'] == 'mask')
    until_phase(page, 'input', 100)
    step(page, 3)
    diff = page.evaluate("""() => { const R = CT.Flash.dev.g().run, d = [];
      for (let i = 0; i < R.before.length; i++) { const a = R.before[i], b = R.after[i]; if (JSON.stringify(a) !== JSON.stringify(b)) d.push(i); } return d; }""")
    ans = answer(page)
    ok('找差異：前後資料的差異格 = 變化格（第 1 級 1 處、4×4）', sorted(diff) == sorted(ans) and len(ans) == 1 and run(page)['n'] == 4, (diff, ans))
    ok('找差異畫面 lint 綠', lint(page)[0])
    tap_cell(page, ans[0])
    ok('找差異：點到變化格 ⇒ 過關', run(page)['ok'] and run(page)['phase'] == 'judge')
    page.evaluate('() => CT.Flash.dev.level(7)')
    until_phase(page, 'input', 600)
    ans = answer(page)
    wrong = [i for i in range(25) if i not in ans][0]
    tap_cell(page, ans[0])
    ok('第 7 級 = 3 處變化；找到 1 處還沒過關', len(ans) == 3 and run(page)['found'] == 1 and run(page)['phase'] == 'input', ans)
    tap_cell(page, wrong)
    ok('找差異：點錯 ⇒ 扣命', run(page)['lives'] == 2)

    # ---------------- 競速 ----------------
    fresh(page)
    start(page, 3, 0)
    until_phase(page, 'input', 400)
    ans = answer(page)
    r = run(page)
    ok('競速：4×4 雙盤、第 1 回合亮 3 格', r['n'] == 4 and r['k'] == 3 and len(ans) == 3, r)
    for c in ans:
        tap_cell(page, c)
    ok('競速：你先正確點完 ⇒ 你得 1 分', run(page)['ps'] == 1 and run(page)['cs'] == 0, (run(page)['ps'], run(page)['cs']))
    until_phase(page, 'input', 400)
    ans = answer(page)
    tap_cell(page, [i for i in range(16) if i not in ans][0])
    ok('競速：點錯 ⇒ 你出局、等吱比', run(page)['pOut'])
    page.evaluate('() => { for (let i = 0; i < 900 && GAME.state().s.run.phase !== "judge"; i++) __nes.step(1); }')
    r = run(page)
    ok('競速：你出局後吱比點完或點錯 ⇒ 回合結束', r['phase'] == 'judge' and (r['cs'] == 1 or r['cOut']), r)
    fresh(page, '&bot=1&pmode=4&plvl=1&direct=1')
    rr = page.evaluate(RUN, {'n': 9000, 'until': 'result', 'until2': 'over'})
    ok('競速：機器人（延遲 12）贏吱比 EASY 5 分', rr['s']['mode'] == 'result' and rr['s']['run']['ps'] == 5 and rr['ml'] <= 8 and rr['over'] == 0, (rr['s']['mode'], rr['s']['run']['ps'], rr['s']['run']['cs']))
    fresh(page, '&bot=1&pmode=4&plvl=3&direct=1&lag=24')
    rr = page.evaluate(RUN, {'n': 12000, 'until': 'result', 'until2': 'over'})
    ok('競速 HARD（延遲 24）整場打完、雙方都有得分機會（每線 ≤ 8、over 0）', rr['s']['mode'] in ('result', 'over') and rr['ml'] <= 8 and rr['over'] == 0, (rr['s']['mode'], rr['s']['run']['ps'], rr['s']['run']['cs']))

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    page.evaluate(SPY)
    rr = page.evaluate(RUN_SPY, {'n': 6000})
    ok('機器人誠實（圖案）：bot() 期間讀答案陣列次數 = 0，仍達成 goal', rr['goal'] and rr['peek'] == 0, rr)
    for m, lv in ((2, 6), (3, 6)):
        fresh(page, '&bot=1&pmode=%d&direct=1' % m)
        page.evaluate(SPY)
        rr = page.evaluate(RUN_SPY, {'n': 9000, 'lv': lv})
        ok('機器人誠實（%s）：只讀畫面也過第 %d 級、讀答案 0 次' % (['', '', '序列', '找差異'][m], lv), rr['cleared'] >= lv and rr['peek'] == 0, rr)
    goals = []
    for q in ('', '&seed=5', '&seed=99', '&lag=0', '&lag=24', '&lag=24&seed=8'):
        fresh(page, '&bot=1' + q)
        rr = page.evaluate(RUN, {'n': 9000, 'until': 'goal'})
        goals.append((q, rr['goal'], rr['f'], rr['ml'], rr['over'], rr['peak']))
    ok('機器人 goal（圖案 NORMAL 過第 8 級；3 種子 + 反應延遲 0 / 24）', all(x[1] for x in goals), goals)
    ok('機器人全程每線 ≤ 8、overFrames 0、VBlank ≤ 160', all(x[3] <= 8 and x[4] == 0 and x[5] <= 160 for x in goals), goals)
    fresh(page, '&bot=1&plvl=3&lag=24')
    rr = page.evaluate(RUN, {'n': 9000, 'until': 'goal'})
    ok('EXPERT（展示 ×0.7）延遲 24 也過 goal', rr['goal'], rr['f'])
    fresh(page, '&bot=1&plvl=1')
    rr = page.evaluate(RUN, {'n': 9000, 'lv': 8})
    ok('RELAX 過第 8 級不算 goal（goal = NORMAL 以上）', rr['maxLv'] >= 8 and not rr['goal'], (rr['maxLv'], rr['goal']))
    fresh(page, '&bot=1')
    rr = page.evaluate(RUN, {'n': 20000, 'until': 'result', 'until2': 'over'})
    ok('機器人圖案模式一路打到 12 級全破（結算 + 紀錄）', rr['s']['mode'] == 'result' and page.evaluate('() => CT.load("flash", "lv0", 0)') == 12, (rr['s']['mode'], rr['maxLv']))

    ok('全程沒有 pageerror', not errs, errs[:3])
    browser.close()
    pw.stop()
    n = sum(1 for r in results if r[0])
    print('test_flash: %d / %d PASS' % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
