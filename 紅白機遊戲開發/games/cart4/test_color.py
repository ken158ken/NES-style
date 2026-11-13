# -*- coding: utf-8 -*-
"""《星塵色感 HUE SENSE》（cart4 槽 8，id = color）自動驗證。

重點：色字干擾（墨色 / 字義、5 級、6 色鍵手把對應 + 形狀標記、判定以幀計、字寫完才顯示並開始計時）、
      色塊衝刺（SAME / BRIGHTER、60.0 秒 = 3606 幀、扣 3 秒、難度遞增）、調色（色相循環 / 亮度、計分、記憶回合 + B 重看扣分）、
      §6 規則（密技原地續關 / 標題結算說明頁無效 / 暫停 BGM + 藏題目 / exit 存分 / backTile / HOLD START+SELECT / C/★）、
      機器人反應延遲 0 / 18 / 24 幀都達成 goal、每線 ≤ 8、VBlank ≤ 160、lint。
作法：Playwright 開 `cart4.html?game=color&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Color.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_color.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=color'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Color && !!CT.Color.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.color.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def run(page):
    return page.evaluate('() => GAME.state().s.run')


def start(page, m):
    page.evaluate('(m) => { CT.Color.dev.start(m); __nes.step(1); }', m)


def press(page, mask, n=1):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 1); __nes.step(1); }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def until_phase(page, ph, n=600):
    return page.evaluate("""([ph, n]) => { for (let i = 0; i < n; i++) { const r = GAME.state().s.run; if (r && r.phase === ph) return i; __nes.step(1); } return -1; }""", [ph, n])


def pal(page, i):
    return page.evaluate('(i) => __nes.nes().ppu.getBgPalette(i)', i)


SCREEN = """() => { const p = __nes.nes().ppu, A = CT.Color.Art.make(); const rows = [];
  for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
    for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-!.()') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
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


def ask(page):
    """推到下一題可作答（字已顯示）。"""
    return until_phase(page, 'ask', 800)


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
    reg = page.evaluate("""() => { const g = CT.get('color'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id color / order 8 / title 星塵色感 / legacy color-match + color-rush',
       reg and reg['id'] == 'color' and reg['order'] == 8 and reg['title'] == '星塵色感' and reg['legacy'] == ['color-match.html', 'color-rush.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（000000）', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Color.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Color.Art.make(); return { bg: A.bg.count || A.bg.tiles.length, spr: A.spr.count || A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Color.Audio.SONGS), sfx: Object.keys(CT.Color.Audio.SFX) })")
    ok('BGM 5 首 + 音效 7 個，全部 color_ 前綴', len(au['songs']) == 5 and len(au['sfx']) >= 4 and all(k.startswith('color_') for k in au['songs'] + au['sfx']), au)
    cols = page.evaluate("() => CT.Color.COLORS.map(c => [c.name, c.c, c.key, c.pal])")
    ok('6 色鍵：色碼互異、按鍵互異（↑→↓← B A）、沒有禁用色 $0D',
       len({c[1] for c in cols}) == 6 and sorted(c[2] for c in cols) == [1, 2, 16, 32, 64, 128] and all(c[1] != 0x0D for c in cols), cols)
    shp = page.evaluate("""() => { const f = CT.Color.Art.inShape, m = [];
      for (let k = 0; k < 6; k++) { let s = ''; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s += f(k, x, y) ? 1 : 0; m.push(s); }
      let minD = 999; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { let d = 0; for (let q = 0; q < 256; q++) if (m[i][q] !== m[j][q]) d++; minD = Math.min(minD, d); }
      return minD; }""")
    ok('色弱友善：6 種形狀標記兩兩至少差 20 像素（圓 / 方 / 三角 / 星 / 菱 / 十字）', shp >= 20, shp)
    ok('時間換算：60 幀 = 998 ms（60.0988 Hz）、18 幀 = 300 ms', page.evaluate('() => [CT.Color.dev.ms(60), CT.Color.dev.ms(18)]') == [998, 300])

    # ---------------- 標題 / 說明頁 ----------------
    tt = page.evaluate(SCREEN)
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(6, 27) if tt[i].strip()]
    ok('§6-6 說明 / 選單列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    ok('標題 BGM = color_title、lint 綠', st(page)['music'] == 'color_title' and lint(page)[0], lint(page))
    press(page, B)
    hp = '\n'.join(page.evaluate(SCREEN))
    ok('B ⇒ 說明頁：手把對照圖（DPAD 4 色 + B 粉 / A 白）與三模式操作', st(page)['mode'] == 'help' and all(w in hp for w in ('RED', 'BLUE', 'GREEN', 'YELLOW', 'PINK', 'WHITE', 'DPAD', 'RUSH', 'MIXER')), hp)
    sw = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Color.Art.make();
      return CT.Color.COLORS.map((c, i) => p.getTile(0, c.sw[0], c.sw[1]) === A.t('SH_' + i + '_0') && p.getAttr(0, c.sw[0] >> 1, c.sw[1] >> 1) === c.pal); }""")
    ok('說明頁對照圖：6 個色塊畫成各自的形狀 + 正確調色盤', all(sw), sw)
    ok('說明頁 lint 綠、按密技無效', lint(page)[0] and page.evaluate('() => CT.cheat()') is False)
    step(page, 12)
    press(page, B)
    ok('說明頁 B ⇒ 回標題', st(page)['mode'] == 'title')
    for _ in range(3):
        press(page, DOWN)
    press(page, RIGHT)
    ok('SHAPE ASSIST 列 ←→ 切換並存檔', st(page)['assist'] is True and page.evaluate('() => CT.load("color", "assist", 0)') == 1, st(page)['assist'])
    press(page, RIGHT)
    ok('SHAPE ASSIST 再按一次關閉', st(page)['assist'] is False)

    # ---------------- 色字干擾 ----------------
    start(page, 0)
    r = run(page)
    ok('開局 = READY 倒數（3 2 1 GO），不出題', r['phase'] == 'ready' and r.get('cur') is None, r['phase'])
    w = until_phase(page, 'draw', 400)
    ok('READY 約 160 幀後才出第一題（人類預備時間）', 150 <= w <= 165, w)
    hid = pal(page, 3)
    ok('寫字期間第 3 組 BG 調色盤全黑（字還看不到）', hid[1:] == [0x0F, 0x0F, 0x0F], hid)
    ask(page)
    r = run(page)
    p3 = pal(page, 3)
    ok('字寫完那一幀才換上墨色並開始計時（佇列 0、t = 0、色 3 = 墨色）',
       st(page)['queue'] == 0 and r['cur']['t'] == 0 and p3[3] == page.evaluate('(i) => CT.Color.COLORS[i].c', r['cur']['ink']), (st(page)['queue'], r['cur'], p3))
    ok('第 1 級：4 色、限時 180 幀', r['lv'] == 0 and r['cur']['limit'] == 180, r['cur'])
    ok('色字畫面 lint 綠', lint(page)[0], lint(page))
    # 指定題目：字 RED、墨色 BLUE ⇒ 正解 = →
    page.evaluate('() => CT.Color.dev.forceInk(0, 1, "INK")')
    step(page, 30)
    press(page, A)
    ok('第 1 級按 A（未啟用的白色鍵）⇒ 不算作答', run(page)['phase'] == 'ask' and run(page)['lives'] == 5, run(page)['phase'])
    t0 = run(page)['cur']['t']
    press(page, RIGHT)
    r = run(page)
    exp = 50 + (50 * (180 - t0)) // 180
    ok('按墨色（藍 = →）⇒ 答對；分數 = 50 + ⌊50 × 剩餘 / 限時⌋（t = %d ⇒ %d）' % (t0, exp), r['cur']['res'] == 'ok' and r['score'] == exp and r['combo'] == 1, (r['score'], exp, r['cur']))
    ok('反應時間記錄以幀計（rts 末項 = 作答時的 t）', r['rts'][-1] == t0, r['rts'])
    ask(page)
    page.evaluate('() => CT.Color.dev.forceInk(2, 3, "INK")')
    press(page, DOWN)       # 按字義（綠 ↓）＝錯
    r = run(page)
    ok('按到字義（GREEN）而非墨色（YELLOW）⇒ 答錯：命 -1、連對歸零', r['cur']['res'] == 'miss' and r['lives'] == 4 and r['combo'] == 0, r)
    ask(page)
    step(page, 181)
    r = run(page)
    ok('逾時（180 幀）⇒ 算錯（命 -1）', r['cur']['res'] == 'miss' and r['lives'] == 3, r)
    # 暫停
    ask(page)
    t1 = run(page)['cur']['t']
    press(page, START)
    p = page.evaluate('() => ({ s: GAME.state().s, mp: __nes.nes().music.isPaused(), p3: __nes.nes().ppu.getBgPalette(3) })')
    step(page, 60)
    ptxt = '\n'.join(page.evaluate(SCREEN))
    ok('§6-2 START 暫停 ⇒ BGM 暫停、題目藏起來（不能偷看）、計時凍結、寫 HOLD START+SELECT: MENU',
       p['s']['paused'] and p['mp'] and p['p3'][1:] == [0x0F, 0x0F, 0x0F] and run(page)['cur']['t'] <= t1 + 1 and 'HOLD START+SELECT: MENU' in ptxt, (p['mp'], p['p3'], run(page)['cur']['t'], t1))
    press(page, START)
    ok('§6-2 再按 START ⇒ 解除、BGM 接續、墨色恢復', not st(page)['paused'] and not page.evaluate('() => __nes.nes().music.isPaused()') and pal(page, 3)[3] != 0x0F)
    # 遊玩中密技
    ok('遊玩中密技 = +2 命（上限 5）且標記用過密技', page.evaluate('() => { CT.cheat(); __nes.step(1); const r = GAME.state().s.run; return r.lives === 5 && r.cheated; }'))
    ok('§6-1 用過密技 ⇒ goal false', page.evaluate('() => GAME.state().goal') is False)
    # 規則切換 / 6 色（直接設到第 5 級）
    fresh(page)
    start(page, 0)
    page.evaluate('() => { const R = CT.Color.dev.g().run; R.qi = 32; R.lv = 4; }')
    lv5 = []
    for _ in range(12):
        ask(page)
        lv5.append(run(page)['cur'])
        c = lv5[-1]
        page.evaluate('(k) => { NES.Input.inject(k, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1); }', page.evaluate('(i) => CT.Color.COLORS[i].key', c['ans']))
        page.evaluate('() => { const R = CT.Color.dev.g().run; if (R.qi >= 39) R.qi = 33; }')
    rules = {c['rule'] for c in lv5}
    ok('第 5 級：規則 INK / WORD 都會出現，WORD 題正解 = 字義', rules == {'INK', 'WORD'} and all(c['ans'] == (c['ink'] if c['rule'] == 'INK' else c['word']) for c in lv5), [(c['rule'], c['word'], c['ink']) for c in lv5])
    ok('第 5 級：6 色（B / A 也會出題）、限時 120 幀', any(c['ans'] >= 4 or c['ink'] >= 4 or c['word'] >= 4 for c in lv5) and all(c['limit'] == 120 for c in lv5))
    ok('第 4 級起字位置會跳動（同長度字起始欄不同）', len({(c['len'], c['col']) for c in lv5}) > 6, [(c['len'], c['col']) for c in lv5])
    ok('5 級 × 8 題：限時 180/150/150/120/120 幀、色數 4/4/6/6/6',
       page.evaluate('() => CT.Color.INK_LV.map(l => l[0] + ":" + l[1]).join()') == '4:180,4:150,6:150,6:120,6:120')
    # 一致題比例：用 dev 產生器直接抽 400 題（同一套 inkNewQ）
    cong = page.evaluate("""() => { const G = CT.Color.dev.g(), R = G.run; R.lv = 0; let same = 0;
      for (let i = 0; i < 400; i++) { CT.Color.dev.newInk(); if (R.cur.ink === R.cur.word) same++; } return same / 400; }""")
    ok('第 1 級一致題（字 = 墨色）約 30%（其餘都是干擾題）', 0.18 <= cong <= 0.42, cong)
    # GAME OVER ⇒ 原地續關
    fresh(page)
    start(page, 0)
    ask(page)
    page.evaluate('() => { const R = CT.Color.dev.g().run; R.lives = 1; R.score = 777; R.qi = 5; }')
    step(page, 181)
    step(page, 70)
    ok('最後一命逾時 ⇒ GAME OVER', st(page)['mode'] == 'over', st(page)['mode'])
    ov = '\n'.join(page.evaluate(SCREEN))
    ok('GAME OVER 畫面寫 C/★ = CONTINUE HERE 與到達題數', 'C/$ = CONTINUE HERE' in ov and 'REACHED Q 06/40' in ov, ov)
    ok('§6-3 GAME OVER 時已存最高分（777）', page.evaluate('() => CT.load("color", "ink", 0)') == 777)
    page.evaluate('() => CT.cheat()')
    step(page, 2)
    r = run(page)
    ok('§6-1 GAME OVER 按密技 ⇒ 原地續關：同一題（第 6 題）、命補滿、分數保留、READY 倒數', st(page)['mode'] == 'ink' and r['qi'] == 5 and r['lives'] == 5 and r['score'] == 777 and r['phase'] == 'ready' and r['continues'] == 1, r)
    # exit 存分
    fresh(page)
    start(page, 0)
    page.evaluate('() => { CT.Color.dev.g().run.score = 1234; CT.get("color").exit(__nes.nes()); }')
    ok('§6-3 中途離開（exit）也存最高分（1234）', page.evaluate('() => CT.load("color", "ink", 0)') == 1234)

    # 機器人：反應延遲 0 / 18 / 24 幀都要達成 goal（另量 36 / 60 幀看門檻）
    lags = {}
    for lag in (0, 18, 24, 36, 60):
        fresh(page, '&bot=1&lag=%d' % lag)
        rr = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
        mn = min(rr['s']['run']['rts']) if rr['s']['run'] and rr['s']['run']['rts'] else -1
        lags[lag] = (rr['goal'], rr['s']['run']['score'], rr['f'], rr['ml'], rr['over'], rr['peak'], mn)
    ok('機器人 延遲 0 / 18 / 24 幀：從標題選 INK OR WORD 打完 40 題、分數 ≥ 3000 ⇒ goal', all(lags[k][0] for k in (0, 18, 24)), lags)
    ok('機器人 延遲 36 / 60 幀（較慢的人類）也 ≥ 3000（goal 門檻友善）', lags[36][0] and lags[60][0], lags)
    ok('機器人不偷跑：延遲 18 時每題反應 ≥ 18 幀（從字顯示那幀起算）', lags[18][6] >= 18, lags[18])
    ok('機器人全程每線 ≤ 8、overFrames 0、VBlank ≤ 160', all(v[3] <= 8 and v[4] == 0 and v[5] <= 160 for v in lags.values()), lags)
    ok('打完 ⇒ 結算畫面、bestText 6 字元 = 最高分', page.evaluate('() => CT.get("color").bestText()') == '%06d' % lags[60][1], page.evaluate('() => CT.get("color").bestText()'))
    ok('§6-1 結算畫面按密技無效', page.evaluate('() => CT.cheat()') is False)
    fresh(page, '&bot=1&lag=18')
    page.evaluate('() => { CT.Color.dev.g().assist = true; }')
    rr = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
    ok('SHAPE ASSIST 開著（字兩側形狀標記精靈）跑完：每線 ≤ 8、over 0', rr['ml'] <= 8 and rr['ml'] >= 2 and rr['over'] == 0, (rr['ml'], rr['over']))
    # ?seed= 可重現
    firsts = []
    for q in ('&seed=5', '&seed=5', '&seed=6'):
        fresh(page, q)
        start(page, 0)
        ask(page)
        c = run(page)['cur']
        firsts.append((c['word'], c['ink']))
        for _ in range(3):
            page.evaluate('(k) => { NES.Input.inject(k, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1); }', page.evaluate('() => CT.Color.COLORS[GAME.state().s.run.cur.ans].key'))
            ask(page)
            c = run(page)['cur']
            firsts[-1] += (c['word'], c['ink'])
    ok('?seed= 可重現（同種子同題目、換種子不同）', firsts[0] == firsts[1] and firsts[0] != firsts[2], firsts)

    # ---------------- 色塊衝刺 ----------------
    fresh(page)
    start(page, 1)
    ok('衝刺：60.0 秒 = 3606 幀、READY 期間色塊藏起來', run(page)['time'] == 3606 and pal(page, 2)[3] == 0x0F and st(page)['music'] == 'color_rush', run(page))
    ask(page)
    ok('衝刺畫面 lint 綠', lint(page)[0], lint(page))
    good = 0
    for _ in range(8):
        ask(page)
        c = run(page)['cur']
        L, Rc = pal(page, 2)[3], pal(page, 3)[3]
        okq = (c['ans'] == ('same' if L == Rc else 'diff')) if c['type'] == 'same' else (c['ans'] == ('left' if (L >> 4) > (Rc >> 4) else 'right'))
        good += okq
        k = {'same': A, 'diff': B, 'left': LEFT, 'right': RIGHT}[c['ans']]
        press(page, k)
    ok('衝刺題目與畫面一致（SAME = 色碼相同；BRIGHTER = 色碼列較高那邊）', good == 8, good)
    r = run(page)
    ok('正解連答 8 題 ⇒ OK 8、連擊 8', r['ok'] == 8 and r['combo'] == 8, r)
    ask(page)
    c = run(page)['cur']
    wrong = {'same': B, 'diff': A, 'left': RIGHT, 'right': LEFT}[c['ans']]
    t0 = run(page)['time']
    press(page, wrong)
    r = run(page)
    ok('答錯 ⇒ 扣 3 秒（180 幀）、連擊歸零', t0 - r['time'] - 180 <= 3 and t0 - r['time'] >= 180 and r['combo'] == 0, (t0, r['time']))
    diff = page.evaluate("""() => { const R = CT.Color.dev.g().run, D = CT.Color.dev; const out = { d0: 99, d5: 99, bright: true, same: true };
      for (const ok of [0, 30]) { R.ok = ok; for (let i = 0; i < 300; i++) { D.newRush(); const q = R.cur;
        if (q.type === 'same' && q.ans === 'diff') { const hd = D.hueDist(q.L & 15, q.R & 15) + Math.abs((q.L >> 4) - (q.R >> 4)); if (ok === 0) out.d0 = Math.min(out.d0, hd); else out.d5 = Math.min(out.d5, hd); }
        if (q.type === 'same' && q.ans === 'same' && q.L !== q.R) out.same = false;
        if (q.type === 'bright' && ((q.L >> 4) === (q.R >> 4) || (q.ans === 'left') !== ((q.L >> 4) > (q.R >> 4)))) out.bright = false; } }
      return out; }""")
    ok('衝刺難度遞增：開局「不同」至少差 4 格、30 題後最小只差 1；SAME / BRIGHTER 題目都自洽', diff['d0'] >= 4 and diff['d5'] == 1 and diff['bright'] and diff['same'], diff)
    ok('衝刺遊玩中密技 = +10 秒', page.evaluate('() => { const t = GAME.state().s.run.time; CT.cheat(); __nes.step(1); return GAME.state().s.run.time - t; }') >= 598)
    fresh(page, '&bot=1&pmode=2&direct=1&lag=18')
    rr = page.evaluate(RUN, {'n': 4200, 'until': 'result'})
    ok('機器人衝刺（延遲 18）：時間到 ⇒ 結算、分數 > 0、每線 ≤ 8、over 0', rr['s']['mode'] == 'result' and rr['s']['run']['score'] > 2000 and rr['ml'] <= 8 and rr['over'] == 0,
       (rr['s']['mode'], rr['s']['run']['score'], rr['f'], rr['ml'], rr['over']))
    ok('衝刺紀錄寫入 rush', page.evaluate('() => CT.load("color", "rush", 0)') == rr['s']['run']['score'])

    # ---------------- 調色 ----------------
    sc = page.evaluate("""() => { const f = CT.Color.dev.mixScore;
      return [f({ h: 5, l: 2, th: 5, tl: 2, t: 600 }).base, f({ h: 4, l: 2, th: 5, tl: 2, t: 0 }).base, f({ h: 5, l: 1, th: 5, tl: 2, t: 0 }).base,
              f({ h: 1, l: 2, th: 12, tl: 2, t: 0 }).base, f({ h: 5, l: 2, th: 5, tl: 2, t: 0 }).bonus, f({ h: 11, l: 0, th: 5, tl: 3, t: 0 }).base]; }""")
    ok('調色計分：完全一致 1000、色相差 1 = 750、亮度差 1 = 700、色相 12↔1 相鄰、時間分 ≤ 100、差太多 0', sc == [1000, 750, 700, 750, 100, 0], sc)
    fresh(page)
    start(page, 2)
    ask(page)
    ok('調色畫面 lint 綠', lint(page)[0], lint(page))
    page.evaluate('() => { const Q = CT.Color.dev.g().run.cur; Q.h = 1; Q.l = 3; }')
    press(page, LEFT)
    press(page, UP)
    c = run(page)['cur']
    ok('調色轉盤：← 從 1 繞到 12、↑ 亮度到 3 封頂', c['h'] == 12 and c['l'] == 3, c)
    ok('你的色塊 = 轉盤色碼（第 3 組 BG 調色盤）', pal(page, 3)[3] == page.evaluate('() => CT.Color.dev.mkColor(12, 3)'), pal(page, 3))
    page.evaluate('() => { const R = CT.Color.dev.g().run, Q = R.cur; Q.h = Q.th; Q.l = Q.tl; }')
    press(page, A)
    r = run(page)
    ok('A 決定：完全一致 ⇒ PERFECT、分數 ≥ 1000', r['cur']['res'] == 'perfect' and r['score'] >= 1000, r)
    page.evaluate('() => { CT.Color.dev.g().run.round = 4; }')
    step(page, 100)
    ask(page)
    r = run(page)
    ok('第 6 回合起 = 記憶回合', r['round'] == 5 and r['cur']['mem'], r)
    step(page, 125)
    ok('記憶回合：120 幀後目標蓋住（灰色 + 問號）', run(page)['cur']['covered'] and pal(page, 2)[3] == 0x10, pal(page, 2))
    press(page, B)
    c = run(page)['cur']
    ok('B ⇒ 再看一次（目標色亮回來，扣分旗標）', c['peeked'] and pal(page, 2)[3] == page.evaluate('() => { const Q = GAME.state().s.run.cur; return CT.Color.dev.mkColor(Q.th, Q.tl); }'), (c, pal(page, 2)))
    step(page, 62)
    press(page, B)
    ok('重看只限 1 次、60 幀後再蓋住', pal(page, 2)[3] == 0x10 and run(page)['cur']['peekT'] == 0)
    s0 = run(page)['score']
    page.evaluate('() => { const R = CT.Color.dev.g().run, Q = R.cur; Q.h = Q.th; Q.l = Q.tl; }')
    press(page, A)
    ok('重看過的回合扣 150 分（完全一致 ⇒ 1000 + 時間分 − 150）', 850 <= run(page)['score'] - s0 <= 950, run(page)['score'] - s0)
    fresh(page, '&bot=1&pmode=3&direct=1&lag=18')
    rr = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
    ok('機器人調色（延遲 18，記憶回合只在展示時讀）：10 回合打完、≥ 9500（S）、每線 ≤ 8、over 0',
       rr['s']['mode'] == 'result' and rr['s']['run']['score'] >= 9500 and rr['ml'] <= 8 and rr['over'] == 0, (rr['s']['mode'], rr['s']['run']['score'], rr['f'], rr['ml'], rr['over']))

    ok('全程沒有 pageerror', not errs, errs[:3])
    browser.close()
    pw.stop()
    n = sum(1 for r in results if r[0])
    print('test_color: %d / %d PASS' % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
