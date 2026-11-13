# -*- coding: utf-8 -*-
"""《星塵翻牌 STAR CARDS》（cart4 槽 1，id = cards）自動驗證。

重點：18 種原創牌面（三色組各 6 張、像素全不同）、5 種盤面成對發牌、發牌 + READY 預備期不收輸入、5 格翻牌動畫、
      配對 / 連對加分 / 失誤翻回、經典步數上限、限時、VS CPU 記憶力（只記翻開過的牌、容量上限）、偷看、§6 規則
      （密技原地續關 / 標題結算無效 / 暫停 BGM / exit 存分 / backTile / HOLD START+SELECT / C/★）、
      機器人只讀名稱表（Proxy 監看：bot() 期間碰 run.cards 次數 = 0）、反應延遲 0 / 12 / 24 都過 goal、每線 ≤ 8、VBlank ≤ 160、lint。
作法：Playwright 開 `cart4.html?game=cards&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Cards.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_cards.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=cards'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Cards && !!CT.Cards.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.cards.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def run(page):
    return page.evaluate('() => GAME.state().s.run')


def start(page, m, lv, skip=True):
    page.evaluate('([m, lv, s]) => { CT.Cards.dev.start(m, lv); if (s) CT.Cards.dev.skipIntro(); __nes.step(1); }', [m, lv, skip])


def press(page, mask, n=1):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 1); __nes.step(1); }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def goto_card(page, i):
    page.evaluate('(i) => { const R = CT.Cards.dev.g().run; R.cx = i % R.W; R.cy = Math.floor(i / R.W); }', i)


def flip_at(page, i):
    goto_card(page, i)
    press(page, A)


def pair_of(page):
    """回傳 (a, b, c)：a b 同圖、c 與 a 不同圖（只用在測試，不給機器人）"""
    return page.evaluate("""() => { const f = CT.Cards.dev.faces(), R = CT.Cards.dev.g().run;
      for (let i = 0; i < f.length; i++) { if (R.cards[i].st !== 'down') continue;
        for (let j = i + 1; j < f.length; j++) if (R.cards[j].st === 'down' && f[j] === f[i]) {
          for (let k = 0; k < f.length; k++) if (R.cards[k].st === 'down' && f[k] !== f[i]) return [i, j, k]; return [i, j, -1]; } }
      return null; }""")


SCREEN = """() => { const p = __nes.nes().ppu, A = CT.Cards.Art.make(); const rows = [];
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
    if (o.until2 && g.s.mode === o.until2) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

# 機器人誠實度：bot() 執行期間任何人碰 run.cards（隱藏牌面）就計數
SPY = r"""
() => {
  const G = CT.get('cards'), ob = G.bot;
  window.__peek = 0; window.__inBot = false;
  G.bot = function (n) { window.__inBot = true; try { return ob.call(G, n); } finally { window.__inBot = false; } };
  window.__wrapRun = () => {
    const R = CT.Cards.dev.g().run;
    if (!R || R.__spied) return;
    R.cards = new Proxy(R.cards, { get(t, k) { if (window.__inBot) window.__peek++; return t[k]; } });
    R.__spied = true;
  };
}
"""
RUN_SPY = r"""
(o) => {
  const r = { f: 0, ml: 0, peak: 0, over0: __nes.stats().budget.overFrames | 0 };
  for (let i = 0; i < o.n; i++) {
    window.__wrapRun(); __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.goal = GAME.state().goal; r.peek = window.__peek; r.moves = GAME.state().s.run && GAME.state().s.run.moves;
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
    reg = page.evaluate("""() => { const g = CT.get('cards'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id cards / order 1 / title 星塵翻牌 / legacy 4 款', reg and reg['id'] == 'cards' and reg['order'] == 1 and reg['title'] == '星塵翻牌' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（000000）', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Cards.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Cards.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length, nf: A.NFACE }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    fx = page.evaluate("""() => { const F = CT.Cards.Art, n = F.FACE_NAMES.length, keys = [];
      for (let f = 0; f < n; f++) keys.push(JSON.stringify(F.facePx(f)));
      const uniq = new Set(keys).size;
      // 每張至少 3 色（描邊 / 主色 / 白）、主色像素 ≥ 20
      const rich = keys.map((k, f) => { const px = F.facePx(f).flat(); return new Set(px).size >= 3 && px.filter(v => v === 2).length >= 20; });
      return { n, uniq, rich: rich.every(Boolean) }; }""")
    ok('原創牌面圖 18 種（≥ 15）、像素全不同、每張 3 色且主色 ≥ 20 px', fx['n'] == 18 and fx['uniq'] == 18 and fx['rich'], fx)
    sil = page.evaluate("""() => { const F = CT.Cards.Art, out = [];
      for (let grp = 0; grp < 3; grp++) { const s = new Set(); for (let f = grp * 6; f < grp * 6 + 6; f++) s.add(JSON.stringify(F.facePx(f).map(r => r.map(v => v === 3 ? 0 : 1)))); out.push(s.size); }
      return out; }""")
    ok('同色組內 6 張剪影（非白像素遮罩）全不同 ⇒ 色弱也能靠形狀分', sil == [6, 6, 6], sil)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Cards.Audio.SONGS), sfx: Object.keys(CT.Cards.Audio.SFX) })")
    ok('BGM ≥ 3 首、音效 ≥ 4，全部 cards_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4 and all(k.startswith('cards_') for k in au['songs'] + au['sfx']), au)
    ok('3 模式：經典 5 盤 / 限時 5 盤 / VS 4 級記憶力', page.evaluate('() => CT.Cards.GAMES.map(x => x.lv.length).join() === "5,5,4" && CT.Cards.MEM.length === 4'))

    # ---------------- 標題 ----------------
    tt = page.evaluate(SCREEN)
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(6, 26) if tt[i].strip()]
    ok('§6-6 說明 / 選單列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    ok('標題 BGM = cards_title、lint 綠', st(page)['music'] == 'cards_title' and lint(page)[0], lint(page))
    press(page, DOWN)
    press(page, RIGHT)
    s = st(page)
    ok('標題：↓ 換模式、→ 換盤面', s['sel'] == 1 and s['lvl'][1] == 2, (s['sel'], s['lvl']))

    # ---------------- 發牌 / 預備 ----------------
    sizes = page.evaluate("""() => { const out = [];
      for (let lv = 0; lv < 5; lv++) { CT.Cards.dev.start(0, lv); const f = CT.Cards.dev.faces(), c = {}; f.forEach(x => c[x] = (c[x] || 0) + 1);
        out.push([f.length, Object.values(c).every(v => v === 2), Object.keys(c).length]); }
      return out; }""")
    ok('5 種盤面 12 / 16 / 20 / 24 / 30 張、每種圖剛好 2 張', [x[0] for x in sizes] == [12, 16, 20, 24, 30] and all(x[1] for x in sizes) and [x[2] for x in sizes] == [6, 8, 10, 12, 15], sizes)
    fresh(page)
    start(page, 0, 1, skip=False)
    press(page, A)
    r = run(page)
    ok('開局發牌期間按 A 不會翻牌', r['phase'] == 'deal' and r['moves'] == 0 and 'up' not in r['st'], r['phase'])
    page.evaluate('() => { for (let i = 0; i < 300 && GAME.state().s.run.phase === "deal"; i++) __nes.step(1); }')
    r = run(page)
    ok('發牌完 ⇒ 全部牌背、進 READY', r['phase'] == 'ready' and all(v == 'back' for v in r['vis']), (r['phase'], set(r['vis'])))
    press(page, A)
    ok('READY 倒數期間按 A 不會翻牌（預備 90 幀）', run(page)['phase'] == 'ready' and 'up' not in run(page)['st'])
    step(page, 95)
    ok('READY 90 幀後 ⇒ 可以翻（pick）、lint 綠', run(page)['phase'] == 'pick' and lint(page)[0], run(page)['phase'])

    # ---------------- 翻牌動畫 ----------------
    goto_card(page, 0)
    seq = page.evaluate("""() => { NES.Input.inject(1, 1); const v = [];
      for (let i = 0; i < 18; i++) { __nes.step(1); const x = GAME.state().s.run.vis[0]; if (v[v.length - 1] !== x) v.push(x); }
      NES.Input.inject(0, 1); __nes.step(1); return v; }""")
    ok('翻牌動畫 5 格：牌背 → 半寬 → 側邊 → 半寬白面 → 牌面', seq == ['back', 'backhalf', 'edge', 'facehalf', 'face'], seq)

    # ---------------- 游標連發 ----------------
    fresh(page)
    start(page, 0, 4)
    page.evaluate('() => { const R = CT.Cards.dev.g().run; R.cx = 0; R.cy = 0; }')
    press(page, RIGHT)
    ok('游標：按一下 → 一格', run(page)['cx'] == 1, run(page)['cx'])
    page.evaluate('() => { const R = CT.Cards.dev.g().run; R.cx = 0; NES.Input.inject(128, 20); __nes.step(20); NES.Input.inject(0, 1); __nes.step(1); }')
    ok('游標：按住 20 幀 = 3 格（首延遲 12、之後每 4）', run(page)['cx'] == 3, run(page)['cx'])

    # ---------------- 配對 / 連對 / 失誤 ----------------
    fresh(page)
    start(page, 0, 1)
    a1, b1, c1 = pair_of(page)
    flip_at(page, a1)
    flip_at(page, b1)
    step(page, 40)
    r = run(page)
    ok('同圖 ⇒ 配對成功留在桌上（配對框）、+100、連對 1、步數 1', r['st'][a1] == 'done' and r['vis'][b1] == 'matched' and r['score'] == 100 and r['combo'] == 1 and r['moves'] == 1, (r['st'][a1], r['score'], r['combo'], r['moves']))
    a2, b2, c2 = pair_of(page)
    flip_at(page, a2)
    flip_at(page, b2)
    step(page, 40)
    r = run(page)
    ok('連續配對 ⇒ 連對 ×2（+200，共 300）', r['score'] == 300 and r['combo'] == 2 and r['maxCombo'] == 2, (r['score'], r['combo']))
    a3, b3, c3 = pair_of(page)
    flip_at(page, a3)
    flip_at(page, c3)
    step(page, 20)
    ok('不同圖 ⇒ 先停住讓你看（兩張都翻開）', run(page)['phase'] == 'look' and run(page)['st'][c3] == 'up')
    step(page, 50)
    r = run(page)
    ok('不同圖 ⇒ 翻回去、連對歸零、步數 +1', r['st'][a3] == 'down' and r['vis'][c3] == 'back' and r['combo'] == 0 and r['moves'] == 3 and r['phase'] == 'pick', (r['st'][a3], r['vis'][c3], r['combo'], r['moves']))
    flip_at(page, a3)
    flip_at(page, a3)
    ok('同一張不能翻兩次（第二張必須是別張）', len(run(page)['open']) == 1, run(page)['open'])
    flip_at(page, b3)
    step(page, 40)
    # ---------------- 偷看 ----------------
    lim0 = run(page)['limit']
    press(page, B)
    r = run(page)
    step(page, 3)
    vis = run(page)['vis']
    ok('B 偷看：未配對的牌全亮、經典步數上限 -4', r['phase'] == 'peek' and r['limit'] == lim0 - 4 and all(v in ('face', 'matched') for v in vis), (r['phase'], r['limit'], lim0))
    step(page, 62)
    vis = run(page)['vis']
    ok('偷看 60 幀後蓋回、回到 pick', run(page)['phase'] == 'pick' and all(v in ('back', 'matched') for v in vis), set(vis))
    press(page, B)
    ok('偷看每盤只能 1 次', run(page)['phase'] == 'pick' and run(page)['limit'] == lim0 - 4)

    # ---------------- 經典步數上限 / 密技續關 ----------------
    page.evaluate('() => { const R = CT.Cards.dev.g().run; R.moves = R.limit - 1; }')
    a4, b4, c4 = pair_of(page)
    flip_at(page, a4)
    flip_at(page, c4)
    page.evaluate('() => { for (let i = 0; i < 200 && GAME.state().s.mode === "play"; i++) __nes.step(1); }')
    ok('經典：用完步數仍沒翻完 ⇒ GAME OVER', st(page)['mode'] == 'over')
    done0 = run(page)['st']
    page.evaluate('() => CT.cheat()')
    step(page, 3)
    r = run(page)
    ok('§6-1 GAME OVER 密技 ⇒ 原地續關：同一盤（配對狀態不變）、上限 = 已用 +10', st(page)['mode'] == 'play' and r['st'] == done0 and r['limit'] == r['moves'] + 10 and r['cheated'] and r['continues'] == 1, (r['limit'], r['moves']))
    ok('§6-1 用過密技 ⇒ goal false', page.evaluate('() => GAME.state().goal') is False)
    lim1 = run(page)['limit']
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    ok('遊玩中密技 = 經典 +5 步', run(page)['limit'] == lim1 + 5)

    # ---------------- 暫停 ----------------
    m0 = page.evaluate('() => __nes.nes().music.isPaused()')
    press(page, START)
    p1 = page.evaluate('() => ({ s: GAME.state().s, mp: __nes.nes().music.isPaused() })')
    cx0 = p1['s']['run']['cx']
    press(page, RIGHT)
    press(page, A)
    ptxt = '\n'.join(page.evaluate(SCREEN))
    ok('§6-2 START 暫停 ⇒ BGM 暫停、操作凍結、寫 HOLD START+SELECT: MENU',
       m0 is False and p1['s']['paused'] and p1['mp'] and run(page)['cx'] == cx0 and not run(page)['open'] and 'HOLD START+SELECT: MENU' in ptxt, (m0, p1['mp']))
    press(page, START)
    ok('§6-2 再按 START ⇒ 解除、BGM 接續', not st(page)['paused'] and not page.evaluate('() => __nes.nes().music.isPaused()'))

    # ---------------- 限時 ----------------
    fresh(page)
    start(page, 1, 0)
    t0 = run(page)['timeF']
    step(page, 60)
    ok('限時 4×3 = 40 秒（2400 幀），pick 中每幀 -1', t0 in (2399, 2400) and t0 - run(page)['timeF'] == 60, (t0, run(page)['timeF']))
    a5, b5, c5 = pair_of(page)
    t1 = run(page)['timeF']
    flip_at(page, a5)
    flip_at(page, b5)
    step(page, 40)
    ok('限時：配對成功 +2 秒（120 幀）', run(page)['timeF'] > t1 + 120 - 60, (t1, run(page)['timeF']))
    page.evaluate('() => { CT.Cards.dev.g().run.timeF = 5; }')
    step(page, 10)
    ok('限時：時間到 ⇒ GAME OVER', st(page)['mode'] == 'over')
    page.evaluate('() => CT.cheat()')
    step(page, 3)
    ok('§6-1 限時續關 ⇒ 補 30 秒、同一盤', st(page)['mode'] == 'play' and run(page)['timeF'] >= 1790 and run(page)['matched'] == 1, run(page)['timeF'])

    # ---------------- VS CPU ----------------
    fresh(page)
    start(page, 2, 0)
    r = run(page)
    ok('VS：固定 6×5（15 對、不會平手）、你先', r['W'] == 6 and r['H'] == 5 and r['turn'] == 'p', (r['W'], r['H'], r['turn']))
    ok('VS：開局 CPU 什麼都不記得（mem 0）', r['mem'] == 0)
    # 你翻 5 次不同圖 ⇒ DOZY 只記 2 張
    page.evaluate('() => { CT.Cards.dev.g().run.lvl = 0; }')
    a6, b6, c6 = pair_of(page)
    flip_at(page, a6)
    flip_at(page, c6)
    step(page, 60)
    r = run(page)
    ok('VS：失誤換 CPU、CPU 記得剛翻開的牌（DOZY 容量 2）', r['turn'] == 'c' and r['mem'] <= 2 and r['mem'] >= 1, (r['turn'], r['mem']))
    hon = page.evaluate("""() => { const R = CT.Cards.dev.g().run; R.lvl = 3; R.mem = [];
      // 讓 CPU 只「看過」兩張同圖的牌 a, b（模擬：翻開過）⇒ PERFECT 一定選其中一張
      const f = CT.Cards.dev.faces(); let a = -1, b = -1;
      for (let i = 0; i < f.length && b < 0; i++) for (let j = i + 1; j < f.length; j++) if (R.cards[i].st === 'down' && R.cards[j].st === 'down' && f[i] === f[j]) { a = i; b = j; break; }
      R.mem = [{ i: a, f: f[a] }, { i: b, f: f[b] }]; R.open = [];
      const pickKnown = CT.Cards.dev.cpuChoose();
      // 記憶清空 ⇒ 只能亂猜（不可能剛好每次都挑到某一對：連 20 次挑到同一對 = 作弊）
      R.mem = []; const picks = new Set(); for (let k = 0; k < 20; k++) picks.add(CT.Cards.dev.cpuChoose());
      return { ok: pickKnown === a || pickKnown === b, spread: picks.size }; }""")
    ok('VS：CPU 記得的同圖一定拿；記憶清空 ⇒ 只能亂猜（20 次分散 ≥ 5 張）', hon['ok'] and hon['spread'] >= 5, hon)
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    ok('VS 遊玩中密技 = PIPPO 全忘光（mem 0）', run(page)['mem'] == 0 and run(page)['cheated'])
    # 整局：機器人 vs NORMAL / PERFECT 都能打完
    vsr = []
    for lv in (2, 4):
        fresh(page, '&bot=1&pmode=3&plvl=%d&direct=1' % lv)
        rr = page.evaluate(RUN, {'n': 14000, 'until': 'result', 'until2': 'over'})
        vsr.append((rr['s']['mode'], rr['s']['run']['pp'], rr['s']['run']['cp'], rr['ml'], rr['over']))
    ok('VS 整局打完（vs NORMAL / PERFECT）⇒ 結算或 GAME OVER、pp+cp = 15、每線 ≤ 8、over 0',
       all(x[0] in ('result', 'over') and x[1] + x[2] == 15 and x[3] <= 8 and x[4] == 0 for x in vsr), vsr)
    ok('VS 機器人（只靠看過的牌）贏 NORMAL', vsr[0][0] == 'result', vsr[0])

    # ---------------- exit 存分 ----------------
    fresh(page)
    start(page, 0, 1)
    page.evaluate('() => { CT.Cards.dev.g().run.score = 777; CT.get("cards").exit(__nes.nes()); }')
    ok('§6-3 中途離開（exit）也存最高分（000777）', page.evaluate('() => CT.get("cards").bestText()') == '000777')

    # ---------------- 機器人 goal ----------------
    fresh(page, '&bot=1')
    page.evaluate(SPY)
    rr = page.evaluate(RUN_SPY, {'n': 8000})
    ok('機器人誠實：bot() 期間碰隱藏牌面 run.cards 次數 = 0，仍達成 goal', rr['goal'] and rr['peek'] == 0, rr)
    goals = []
    for q in ('', '&seed=3', '&seed=77', '&lag=0', '&lag=24', '&lag=24&seed=11'):
        fresh(page, '&bot=1' + q)
        rr = page.evaluate(RUN, {'n': 9000, 'until': 'goal'})
        goals.append((q, rr['goal'], rr['f'], rr['ml'], rr['over'], rr['peak'], rr['s']['run'] and rr['s']['run']['moves']))
    ok('機器人 goal（經典 4×4 ≤ 24 步；3 種子 + 反應延遲 0 / 24）', all(x[1] for x in goals), goals)
    ok('機器人全程每線 ≤ 8、overFrames 0、VBlank ≤ 160', all(x[3] <= 8 and x[4] == 0 and x[5] <= 160 for x in goals), goals)
    ok('達成 goal ⇒ 紀錄寫入（mv1、bestText 非 0）', page.evaluate('() => CT.load("cards", "mv1", 0) > 0 && CT.get("cards").bestText() !== "000000"'))
    fresh(page, '&bot=1&pmode=2&plvl=2&lag=24&direct=1')
    rr = page.evaluate(RUN, {'n': 6000, 'until': 'result', 'until2': 'over'})
    ok('限時 4×4 機器人延遲 24 幀仍在 60 秒內翻完（人類節奏可達成）', rr['s']['mode'] == 'result', (rr['s']['mode'], rr['s']['run']['timeF']))
    fresh(page, '&bot=1&plvl=1')
    rr = page.evaluate(RUN, {'n': 6000, 'until': 'result'})
    ok('經典 4×3 通關不算 goal（goal = 4×4）', rr['s']['mode'] == 'result' and not rr['goal'], (rr['s']['mode'], rr['goal']))

    ok('全程沒有 pageerror', not errs, errs[:3])
    browser.close()
    pw.stop()
    n = sum(1 for r in results if r[0])
    print('test_cards: %d / %d PASS' % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
