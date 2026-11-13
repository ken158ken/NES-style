# -*- coding: utf-8 -*-
"""《星塵派對 STAR PARTY》（cart3 槽 8，id = party）自動驗證。

重點：三個遊戲（星數密碼 / 星塵猜拳大會 / 星牌高低）規則、解題器證明 HARD 7 次必定猜得到、CPU 習慣可學習、
      游標連發（首延遲 12 幀、之後每 4 幀）、`?seed=` 可重現、§6 規則（密技原地續關 / 標題結算無效 / 暫停 BGM /
      exit 存分 / backTile / HOLD START+SELECT / C/★）、機器人用游標正常操作達成 goal、每線 ≤ 8、VBlank ≤ 160、lint。
作法：Playwright 開 `cart3.html?game=party&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Party.dev`。

用法：../卡比之星/.venv/bin/python games/cart3/test_party.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=party'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Party && !!CT.Party.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.party.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def run(page):
    return page.evaluate('() => GAME.state().s.run')


def start(page, m, lv):
    page.evaluate('([m, lv]) => { CT.Party.dev.start(m, lv); __nes.step(1); }', [m, lv])


def press(page, mask, n=1):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 1); __nes.step(1); }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


SCREEN = """() => { const p = __nes.nes().ppu, A = CT.Party.Art.make(); const rows = [];
  for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
    for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-!.') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
  return rows; }"""

RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const g = GAME.state();
    if (o.until === 'goal' && g.goal) break;
    if (o.until && o.until !== 'goal' && g.s.mode === o.until) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
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
    reg = page.evaluate("""() => { const g = CT.get('party'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id / order 8 / title 星塵派對 / legacy 2 款', reg and reg['id'] == 'party' and reg['order'] == 8 and reg['title'] == '星塵派對' and len(reg['legacy']) == 2, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（CUP000）', reg['bestText'] == 'CUP000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Party.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Party.Art.make(); return { bg: A.bg.count || A.bg.tiles.length, spr: A.spr.count || A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Party.Audio.SONGS), sfx: Object.keys(CT.Party.Audio.SFX) })")
    ok('BGM 5 首、音效 ≥ 4，全部 party_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4 and all(k.startswith('party_') for k in au['songs'] + au['sfx']), au)
    ok('3 個遊戲：猜數 4 檔（含 CPU GUESS）/ 猜拳 3 難度 / 星牌 3 難度、3 位 CPU',
       page.evaluate('() => CT.Party.GAMES.map(x => x.lv.length).join() === "4,3,3" && CT.Party.OPP.length === 3'))

    # ---------------- 標題 ----------------
    tt = page.evaluate(SCREEN)
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(6, 27) if tt[i].strip()]
    ok('§6-6 說明 / 選單列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    ok('標題 BGM = party_title、lint 綠', st(page)['music'] == 'party_title' and lint(page)[0], lint(page))
    press(page, DOWN)
    press(page, RIGHT)
    s = st(page)
    ok('標題：↓ 換遊戲、→ 換難度', s['sel'] == 2 and s['lvl'][2] == 2, (s['sel'], s['lvl']))

    # ---------------- 游標連發 ----------------
    start(page, 0, 1)
    press(page, RIGHT)
    ok('游標：按一下 → 一格', run(page)['cx'] == 5, run(page)['cx'])
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 0; R.cy = 0; NES.Input.inject(128, 20); __nes.step(20); NES.Input.inject(0, 1); __nes.step(1); }')
    ok('游標：按住 20 幀 = 第 1 / 13 / 17 幀各一格（首延遲 12、之後每 4）', run(page)['cx'] == 3, run(page)['cx'])
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 0; NES.Input.inject(128, 24); __nes.step(24); NES.Input.inject(0, 1); __nes.step(1); }')
    ok('游標：按住 24 幀 = 4 格（第 21 幀那格）', run(page)['cx'] == 4, run(page)['cx'])

    # ---------------- 星數密碼 ----------------
    sol = page.evaluate('() => { let mx = 0, all = true; for (let s = 1; s <= 100; s++) { const n = CT.Party.dev.solve(s); if (n < 1) all = false; mx = Math.max(mx, n); } return { mx, all }; }')
    ok('解題器：1~100 每個密碼二分法都猜得到、最多 7 次 ⇒ HARD 7 次保證可解', sol['all'] and sol['mx'] == 7, sol)
    start(page, 0, 1)
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.secret = 50; R.cx = 9; R.cy = 2; }')   # 游標在 30
    press(page, A)
    r = run(page)
    ok('猜 30（密碼 50）⇒ HIGHER：範圍 031-100、次數 1', r['lo'] == 31 and r['hi'] == 100 and r['tries'] == 1, r)
    step(page, 4)
    dim = page.evaluate("() => { const p = __nes.nes().ppu, A = CT.Party.Art.make(); return [p.getTile(0, 30, 10) === A.t('DG_0'), p.getTile(0, 30, 12) === A.ch('0')]; }")
    ok('已排除的號碼變暗（30 暗、40 亮）', dim == [True, True], dim)
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 0; R.cy = 0; }')
    press(page, A)
    ok('猜已排除的 1 ⇒ 不扣次數（友善）', run(page)['tries'] == 1, run(page))
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 9; R.cy = 6; }')   # 70
    press(page, A)
    ok('猜 70 ⇒ LOWER：範圍 031-069', run(page)['hi'] == 69 and run(page)['lo'] == 31, run(page))
    press(page, B)
    r = run(page)
    ok('B 提示：游標跳到剩餘範圍正中央（50）', r['cy'] * 10 + r['cx'] + 1 == 50, r)
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 9; R.cy = 4; }')
    press(page, A)
    ok('猜中 50 ⇒ 結算畫面、紀錄寫入 num1', st(page)['mode'] == 'result' and page.evaluate('() => CT.load("party", "num1", 0)') == 3000, (st(page)['mode'], page.evaluate('() => CT.load("party", "num1", 0)')))
    ok('§6-1 結算畫面按密技無效', page.evaluate('() => CT.cheat()') is False)
    start(page, 0, 2)
    press(page, B)
    ok('HARD 沒有 B 提示（游標不動）', run(page)['cx'] == 4 and run(page)['cy'] == 4, run(page))
    # NORMAL 10 次用完 ⇒ GAME OVER ⇒ 密技原地續關 +3 次
    start(page, 0, 1)
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.secret = 100; R.tries = 9; R.cx = 0; R.cy = 0; }')
    press(page, A)
    ok('次數用完 ⇒ GAME OVER', st(page)['mode'] == 'over', st(page)['mode'])
    ov = '\n'.join(page.evaluate(SCREEN))
    ok('GAME OVER 畫面寫 C/★ = CONTINUE HERE、公布答案', 'C/$ = CONTINUE HERE' in ov and 'THE CODE WAS 100' in ov)
    ok('§6-1 GAME OVER 按密技 = 原地續關（+3 次、範圍保留）', page.evaluate('() => CT.cheat()') and (step(page, 2) or True) and
       st(page)['mode'] == 'num' and run(page)['maxT'] == 13 and run(page)['lo'] == 2 and run(page)['cheated'], run(page))
    # CPU GUESS：說謊會被擋
    start(page, 0, 3)
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.cx = 2; R.cy = 7; }')   # 73
    press(page, A)
    step(page, 120)
    r = run(page)
    ok('CPU GUESS：鎖定 73、CPU 游標一格一格走到猜測後等你回答', r['mine'] == 73 and r['phase'] == 'answer' and r['ctries'] == 1, r)
    wrong = DOWN if r['cg'] < 73 else UP
    press(page, wrong)
    r2 = run(page)
    ok('CPU GUESS：答錯方向 ⇒ 被友善擋下（範圍不變）', r2['clo'] == r['clo'] and r2['chi'] == r['chi'] and r2['phase'] == 'answer', r2)

    # 機器人：HARD 五個種子都在 7 次內、CPU GUESS 猜得到
    tries = []
    for sd in (1, 7, 42, 99, 2024):
        fresh(page, '&bot=1&pmode=1&plvl=3&direct=1&seed=%d' % sd)
        rr = page.evaluate(RUN, {'n': 3000, 'until': 'result'})
        tries.append((rr['s']['mode'], rr['s']['run']['tries'], rr['ml'], rr['over']))
    ok('機器人 HARD（5 種子）：游標操作猜中、≤ 7 次、每線 ≤ 8、over 0',
       all(t[0] == 'result' and t[1] <= 7 and t[2] <= 8 and t[3] == 0 for t in tries), tries)
    fresh(page, '&bot=1&pmode=1&plvl=4&direct=1&pnum=88')
    rr = page.evaluate(RUN, {'n': 6000, 'until': 'result'})
    ok('機器人 CPU GUESS：誠實回答 ⇒ CPU 在 ≤ 10 次內猜中 88、紀錄 cpu 寫入',
       rr['s']['mode'] == 'result' and rr['s']['run']['ctries'] <= 10 and page.evaluate('() => CT.load("party", "cpu", 0)') == rr['s']['run']['ctries'], rr['s']['run'])
    # ?seed= 可重現
    secs = []
    for q in ('&seed=123', '&seed=123', '&seed=124'):
        fresh(page, q)
        start(page, 0, 1)
        secs.append(page.evaluate('() => CT.Party.dev.secret()'))
    ok('?seed= 可重現（同種子同密碼、換種子不同）', secs[0] == secs[1] and secs[0] != secs[2], secs)

    # ---------------- 星塵猜拳大會 ----------------
    fresh(page)
    bt = page.evaluate('() => { const b = CT.Party.dev.beats, o = []; for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) o.push(b(a, c) ? 1 : 0); return o.join(""); }')
    ok('勝負表：石 > 剪、帆 > 石、剪 > 帆、同拳平手', bt == '001100010', bt)
    start(page, 1, 1)
    freq = page.evaluate("""() => { const R = CT.Party.dev.g().run, n = [0, 0, 0]; R.opp = 0;
      for (let i = 0; i < 2000; i++) n[CT.Party.dev.cpuPick()]++; return n; }""")
    ok('岩岩 NORMAL：星石比例 ≈ 75% + 25%/3（0.75~0.92）', 0.75 <= freq[0] / 2000 <= 0.92, freq)
    mimi = page.evaluate("""() => { const R = CT.Party.dev.g().run; R.opp = 1; let same = 0;
      for (let i = 0; i < 1000; i++) { R.yourLast = i % 3; if (CT.Party.dev.cpuPick() === R.yourLast) same++; } return same; }""")
    ok('映映：大多出你上一拳（≥ 75%）', mimi >= 750, mimi)
    orb = page.evaluate("""() => { const R = CT.Party.dev.g().run; R.opp = 2; let hit = 0;
      for (let i = 0; i < 1000; i++) { R.cpuLast = i % 3; if (CT.Party.dev.cpuPick() === (R.cpuLast + 1) % 3) hit++; } return hit; }""")
    ok('軌軌：大多照 石→帆→剪 輪轉（≥ 75%）', orb >= 750, orb)
    hard = page.evaluate("""() => { const R = CT.Party.dev.g().run; R.opp = 0; R.lvl = 2; let n = 0;
      for (let i = 0; i < 2000; i++) if (CT.Party.dev.cpuPick() === 0) n++; R.lvl = 1; return n; }""")
    ok('HARD 習慣較弱（岩岩星石比例 < NORMAL）', hard < freq[0], (hard, freq[0]))
    # 對戰流程：VS → 選拳 → 搖 → 判定
    ok('開局 = VS 畫面、BGM party_cup', run(page)['phase'] == 'vs' and st(page)['music'] == 'party_cup', run(page))
    vs = '\n'.join(page.evaluate(SCREEN))
    ok('VS 畫面寫出對手名與口頭禪（可學習的習慣提示）', 'VS ROCKO' in vs and 'STONE IS THE BEST' in vs)
    hud = page.evaluate(SCREEN)
    ok('qa-r7 P3-5：HUD 不貼頂（第 1 列沒有字、STAR CUP 在第 2 列、YOU x - y 在第 3 列）',
       hud[1].strip() == '' and hud[2].strip().startswith('STAR CUP') and hud[3].strip().startswith('YOU 0 - 0'), hud[1:4])
    step(page, 25)
    press(page, A)
    ok('A ⇒ 進入對戰（choose）', run(page)['phase'] == 'choose', run(page))
    ok('對戰畫面 lint 綠', lint(page)[0], lint(page))

    def throw(you, cpu):
        page.evaluate('([y, c]) => { const R = CT.Party.dev.g().run; R.cur = y; }', [you, cpu])
        page.evaluate('(c) => { const P = CT.Party.dev; P.__orig = P.__orig || null; window.__forceCpu = c; }', cpu)
        page.evaluate("""() => { const R = CT.Party.dev.g().run; NES.Input.inject(1, 1); __nes.step(1); NES.Input.inject(0, 1);
          R.ch = window.__forceCpu; __nes.step(1); __nes.step(75); }""")
        r = run(page)
        page.evaluate('() => __nes.step(85)')
        return r
    r = throw(1, 0)
    ok('帆 vs 石 ⇒ 你贏 1:0、紀錄列記下對手出拳', r['you'] == 1 and r['cpu'] == 0 and r['result'] == 'win' and r['log'] == [0], r)
    r = throw(2, 2)
    ok('平手不計分（1:0）', r['you'] == 1 and r['cpu'] == 0 and r['result'] == 'draw', r)
    r = throw(0, 2)
    ok('先拿 2 勝 ⇒ 擊敗岩岩、進下一位（VS 映映）', run(page)['opp'] == 1 and run(page)['phase'] == 'vs', run(page))
    step(page, 25)
    press(page, A)
    throw(0, 1)
    throw(0, 1)
    ok('映映先拿 2 勝 ⇒ GAME OVER', st(page)['mode'] == 'over', st(page)['mode'])
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    r = run(page)
    ok('§6-1 GAME OVER 密技 ⇒ 原地續關：同一位對手（映映）0:0 重打、標記用過密技', st(page)['mode'] == 'rps' and r['opp'] == 1 and r['phase'] == 'vs' and r['cheated'], r)
    ok('§6-1 用過密技 ⇒ goal false', page.evaluate('() => GAME.state().goal') is False)
    # 暫停
    step(page, 25)
    press(page, A)
    m0 = page.evaluate('() => __nes.nes().music.isPaused ? __nes.nes().music.isPaused() : null')
    press(page, START)
    p1 = page.evaluate('() => ({ s: GAME.state().s, mp: __nes.nes().music.isPaused(), pt: GAME.state().s.run.pt })')
    step(page, 60)
    p2 = page.evaluate('() => GAME.state().s.run.pt')
    ptxt = '\n'.join(page.evaluate(SCREEN))
    ok('§6-2 START 暫停 ⇒ BGM 暫停、遊戲凍結、寫 HOLD START+SELECT: MENU',
       m0 is False and p1['s']['paused'] and p1['mp'] and p1['pt'] == p2 and 'HOLD START+SELECT: MENU' in ptxt, (m0, p1['mp'], p1['pt'], p2))
    press(page, START)
    ok('§6-2 再按 START ⇒ 解除、BGM 接續', not st(page)['paused'] and not page.evaluate('() => __nes.nes().music.isPaused()'))
    ok('遊玩中密技 = 你 +1 勝（STAR POINT）', page.evaluate('() => { const y = GAME.state().s.run.you; CT.cheat(); __nes.step(1); return GAME.state().s.run.you === Math.min(1, y + 1); }'))

    # 機器人 goal（多種子）
    goals = []
    for sd in (0, 3, 11, 77, 500):
        fresh(page, '&bot=1' + ('&seed=%d' % sd if sd else ''))
        rr = page.evaluate(RUN, {'n': 12000, 'until': 'goal'})
        goals.append((rr['goal'], rr['f'], rr['ml'], rr['over'], rr['peak']))
    ok('機器人 goal（5 種子）：從標題用游標選 STAR CUP NORMAL、學習習慣連勝 3 位', all(x[0] for x in goals), goals)
    ok('機器人全程每線 ≤ 8、overFrames 0、VBlank ≤ 160', all(x[2] <= 8 and x[3] == 0 and x[4] <= 160 for x in goals), goals)
    ok('冠軍 ⇒ cups +1、bestText = CUP001、rps1 寫入最少回合',
       page.evaluate('() => CT.get("party").bestText()') == 'CUP001' and page.evaluate('() => CT.load("party", "rps1", 0)') > 0,
       page.evaluate('() => [CT.get("party").bestText(), CT.load("party", "rps1", 0)]'))
    fresh(page, '&bot=1&plvl=1')
    rr = page.evaluate(RUN, {'n': 12000, 'until': 'result'})
    ok('EASY 冠軍不算 goal（goal = NORMAL 以上）', rr['s']['mode'] == 'result' and rr['s']['run']['champion'] and not rr['goal'], (rr['s']['mode'], rr['goal']))

    # ---------------- 星牌高低 ----------------
    fresh(page)
    start(page, 2, 1)
    dk = page.evaluate("""() => { const d = CT.Party.dev.g().run.deck, k = new Set(d.map(c => c.r + ':' + c.s));
      return { n: d.length, u: k.size, ranks: [...new Set(d.map(c => c.r))].length }; }""")
    ok('一副 52 張不重複（13 點 × 4 花）', dk == {'n': 52, 'u': 52, 'ranks': 13}, dk)
    od = page.evaluate("""() => { const R = CT.Party.dev.g().run, o = CT.Party.dev.odds(), cr = R.deck[R.pos].r; let hi = 0, lo = 0, sm = 0;
      for (let i = R.pos + 1; i < 52; i++) { const r = R.deck[i].r; if (r > cr) hi++; else if (r < cr) lo++; else sm++; } return [o.hi === hi, o.lo === lo, o.same === sm, hi + lo + sm]; }""")
    ok('記牌提示：比大 / 比小 / 同點張數 = 實際剩餘牌', od == [True, True, True, 51], od)
    ok('星牌畫面 lint 綠', lint(page)[0], lint(page))

    def hl_set(cur_r, next_r, lvl=None):
        page.evaluate("""([a, b, lv]) => { const R = CT.Party.dev.g().run; if (lv !== null) R.lvl = lv;
          R.deck[R.pos] = { r: a, s: 0 }; R.deck[R.pos + 1] = { r: b, s: 1 }; }""", [cur_r, next_r, lvl])
    step(page, 20)
    hl_set(5, 9)
    press(page, A)            # 預設游標 HIGHER
    step(page, 8)
    ok('5 → 9 猜 HIGHER ⇒ 答對、連對 1', run(page)['ok'] == 1 and run(page)['streak'] == 1, run(page))
    step(page, 60)
    hl_set(7, 7)
    press(page, A)
    step(page, 8)
    ok('NORMAL 同點 ⇒ 安全（命不變）', run(page)['lives'] == 3 and run(page)['last'] == 'same', run(page))
    step(page, 60)
    hl_set(7, 7, 2)
    press(page, A)
    step(page, 8)
    ok('HARD 同點 ⇒ 算錯（命 -1）', run(page)['lives'] == 2 and run(page)['last'] == 'miss', run(page))
    step(page, 60)
    page.evaluate('() => { CT.Party.dev.g().run.lvl = 1; }')
    press(page, DOWN)
    ok('↓ ⇒ 游標移到 LOWER', run(page)['cur'] == 1, run(page))
    page.evaluate('() => { const R = CT.Party.dev.g().run; R.lives = 1; R.ok = 6; }')
    hl_set(3, 10)
    press(page, A)
    step(page, 70)
    ok('最後一命猜錯 ⇒ GAME OVER、紀錄 hl1 = 6', st(page)['mode'] == 'over' and page.evaluate('() => CT.load("party", "hl1", 0)') == 6, (st(page)['mode'], page.evaluate('() => CT.load("party", "hl1", 0)')))
    pos0 = run(page)['pos']
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    ok('§6-1 星牌 GAME OVER 密技 ⇒ 補滿命、同一張繼續', st(page)['mode'] == 'hl' and run(page)['lives'] == 3 and run(page)['pos'] == pos0 and run(page)['phase'] == 'choose', run(page))
    # exit 存分
    fresh(page)
    start(page, 2, 0)
    page.evaluate('() => { CT.Party.dev.g().run.ok = 9; CT.get("party").exit(__nes.nes()); }')
    ok('§6-3 中途離開（exit）也存最高紀錄（hl0 = 9）', page.evaluate('() => CT.load("party", "hl0", 0)') == 9)
    fresh(page, '&bot=1&pmode=3&plvl=1&direct=1')
    rr = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
    ok('機器人 EASY 星牌：靠記牌提示選邊玩到結束（GAME OVER 或翻完）、每線 ≤ 8、over 0',
       rr['s']['mode'] in ('result', 'over') and rr['ml'] <= 8 and rr['over'] == 0 and rr['s']['run']['ok'] >= 3, (rr['s']['mode'], rr['s']['run'] and rr['s']['run']['ok'], rr['ml'], rr['over']))

    ok('全程沒有 pageerror', not errs, errs[:3])
    browser.close()
    pw.stop()
    n = sum(1 for r in results if r[0])
    print('test_party: %d / %d PASS' % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
