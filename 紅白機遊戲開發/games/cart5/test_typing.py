# -*- coding: utf-8 -*-
"""《星塵打字 STAR TYPER》（cart5，id = typing）自動驗證。

重點：字表（≥ 300 字、5 級字長正確、句子只用畫面鍵盤打得出的字、換行 ≤ 3 行）、CHR ≤ 256 磚；
      游標規格（剛按下立刻走、按住首延遲 12 幀之後每 4 幀、同排繞回、上下到最近的鍵）；
      METEOR：第一個字母鎖定最低的字、打錯算 miss、B 解除鎖定、打完擊落 + 加分、落地扣護盾、升級、GAME OVER + 密技原地續關；
      SENTENCE：計時從第一鍵開始、WPM / 正確率 / 評價、CASE EXACT 要切大寫、提示鍵；TIME ATTACK：+1 秒 / 時間到結算；
      實體鍵盤直打（W A S D Z X 不會動游標、C 不會觸發密技、Esc 暫停 / 解除、離開打字狀態還原手把對應）；
      §6（暫停 BGM 停、標題密技無效、exit 存分、bestText 6 字元、backTile）、文字不超出 32 欄、overFrames 0；
      機器人（手把路徑、人類節奏）lag 0 / 15 / 24 都在幀數上限內達成 goal（單字落下第 5 級）。
作法：Playwright 開 `cart5.html?game=typing&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Typing.dev` + `page.keyboard`。

用法：../卡比之星/.venv/bin/python games/cart5/test_typing.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=typing'
SHOTS = ROOT / 'shots' / 'agent_cart5-type'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Typing && !!CT.Typing.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.typing.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def start(page, mode, **kw):
    opt = {'skipReady': True}
    opt.update(kw)
    page.evaluate('([m, o]) => { CT.Typing.dev.start(m, o); __nes.step(2); }', [mode, opt])


def walk_to(page, key):
    """手把路徑走到某鍵（用 kbd.path，一次一格）。"""
    for _ in range(40):
        p = page.evaluate('(k) => { const K = CT.Typing.dev.kb(); return K.path(GAME.state().s.cur, k); }', key)
        if not p:
            return True
        tap(page, p[0], 1)
    return False


def type_pad(page, word):
    for ch in word:
        walk_to(page, 'space' if ch == ' ' else ch.lower())
        tap(page, A, 1)


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, shields: 9 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.goal = GAME.state().goal; r.s = GAME.state().s;
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
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    fresh(page)

    # ---------------- 契約 / 資產 ----------------
    reg = page.evaluate("""() => { const g = CT.get('typing'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id typing / order 5 / title 星塵打字 / legacy 4 款', reg and reg['id'] == 'typing' and reg['order'] == 5 and reg['title'] == '星塵打字' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）+ backTile', reg and len(reg['fns']) == 9 and reg['bt'] and reg['bt']['tile'] > 0, reg)
    ok('bestText 右對齊 6 字元（沒紀錄 000000）', reg['bestText'] == '000000', repr(reg['bestText']))
    d = page.evaluate("""() => { const D = CT.Typing.DICT, L = [[3],[4],[5],[6],[7,8]];
        const bad = []; D.T.forEach((t, i) => t.forEach(w => { if (L[i].indexOf(w.length) < 0 || !/^[a-z]+$/.test(w)) bad.push(w); }));
        const sent = [].concat.apply([], D.SENTENCES);
        return { n: D.ALL.length, tiers: D.T.map(t => t.length), bad: bad, uniq: new Set(D.ALL).size === D.ALL.length,
          sentBad: sent.filter(s => !/^[A-Za-z ,.]+$/.test(s)), lines: sent.map(s => CT.Typing.dev.wrapLines(s).length),
          wrapOk: sent.every(s => CT.Typing.dev.wrapLines(s).map(x => x.s).join('') === s && CT.Typing.dev.wrapLines(s).every(x => x.s.length <= 27)) }; }""")
    ok('字表 ≥ 300 字、無重複、全小寫 a-z', d['n'] >= 300 and d['uniq'] and not d['bad'], (d['n'], d['tiers'], d['bad'][:5]))
    ok('字表 5 級（3 / 4 / 5 / 6 / 7~8 字母）每級 ≥ 50 字', all(t >= 50 for t in d['tiers']), d['tiers'])
    ok('句子 3 級 × 8 句、只用畫面鍵盤打得出的字（字母 / 空白 / , .）', len(d['lines']) == 24 and not d['sentBad'], d['sentBad'])
    ok('句子換行：每行 ≤ 27 字元、≤ 3 行、拼回去 = 原句', d['wrapOk'] and max(d['lines']) <= 3, d['lines'])
    st = S(page)
    ok('背景 CHR ≤ 256 磚（去重後）', 0 < st['tiles'] <= 256, st['tiles'])

    # ---------------- 標題 / 說明 ----------------
    page.evaluate('() => __nes.render()')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題 lint 通過（≤ 25 色）', lint['ok'] and lint['colors'] <= 25, lint)
    tap(page, DOWN); tap(page, RIGHT); tap(page, SELECT)
    st = S(page)
    ok('標題：↓ 換模式、→ 換句子等級、SELECT 換 CASE', st['sel'] == 1 and st['sLv'] == 2 and st['caseExact'] is True, (st['sel'], st['sLv'], st['caseExact']))
    ok('標題按密技無效', page.evaluate('() => CT.cheat()') is False and S(page)['cheats'] == 0)
    tap(page, UP); tap(page, A, 4)
    ok('A → 說明頁', S(page)['mode'] == 'help')
    tap(page, B, 2)
    ok('說明頁 B → 回標題', S(page)['mode'] == 'title')
    tap(page, A, 14); tap(page, A, 2)
    st = S(page)
    ok('說明頁 A → READY 倒數（打字狀態已開）', st['mode'] == 'ready' and st['phys']['active'], st['mode'])
    step(page, 125)
    ok('READY 120 幀後開始', S(page)['mode'] == 'play')

    # ---------------- 游標 ----------------
    start(page, 0)
    page.evaluate('() => { CT.Typing.dev.clearWords(); CT.Typing.dev.set("spawnT", -99999); CT.Typing.dev.set("cur", "g"); }')
    tap(page, RIGHT, 0)
    ok('游標：剛按下立刻走一格（g → h）', S(page)['cur'] == 'h', S(page)['cur'])
    step(page, 3)
    seq = page.evaluate("""() => { const out = []; NES.Input.inject(128, 21);
        for (let i = 0; i < 21; i++) { __nes.step(1); out.push(GAME.state().s.cur); } __nes.step(2); return out; }""")
    moves = [i for i in range(1, len(seq)) if seq[i] != seq[i - 1]]
    ok('游標按住：第 0 幀走、首延遲 12 幀、之後每 4 幀', [0] + moves == [0, 12, 16, 20] or moves == [12, 16, 20], (seq[0], moves))
    page.evaluate('() => CT.Typing.dev.set("cur", "p")')
    tap(page, RIGHT)
    ok('游標同排繞回（p → q）', S(page)['cur'] == 'q')
    tap(page, UP)
    ok('↑ 到上一排最近的鍵（q → 大小寫鍵，最下排繞回）', S(page)['cur'] == 'shift', S(page)['cur'])
    page.evaluate('() => CT.Typing.dev.set("cur", "space")')
    tap(page, DOWN)
    ok('↓ 從空白鍵繞回第一排最近的鍵', S(page)['cur'] in ('t', 'y', 'r'), S(page)['cur'])

    # ---------------- METEOR ----------------
    page.evaluate('() => { CT.Typing.dev.spawn("cat", 4, 6); CT.Typing.dev.spawn("cow", 14, 10); }')
    type_pad(page, 'c')
    st = S(page)
    ok('METEOR：打 c 鎖定最低的 c 字（cow 在第 10 列）', st['lock'] >= 0 and st['words'][st['lock']]['t'] == 'cow' and st['words'][st['lock']]['typed'] == 1, st['words'])
    type_pad(page, 'x')
    ok('打錯字母 = miss、鎖定不變', S(page)['misses'] == 1 and S(page)['lock'] >= 0)
    ok('提示鍵 = 下一個要打的字母（o）', S(page)['hint'] == 'o', S(page)['hint'])
    tap(page, B)
    st = S(page)
    ok('B 解除鎖定（已打歸零）', st['lock'] == -1 and all(w['typed'] == 0 for w in st['words']))
    type_pad(page, 'cow')
    st = S(page)
    ok('打完 cow → 擊落、加分、雷射音效', st['killed'] == 1 and st['score'] > 0 and len(st['words']) == 1 and st['lastSfx'] == 'typing_zap', (st['killed'], st['score'], st['lastSfx']))
    page.evaluate('() => __nes.render()')
    lint = page.evaluate('() => __nes.lint()')
    ok('遊玩畫面 lint 通過、每線 ≤ 8 精靈', lint['ok'] and lint['maxSpritesLine'] <= 8, lint)
    page.evaluate('() => { CT.Typing.dev.clearWords(); CT.Typing.dev.spawn("sun", 6, 15); }')
    step(page, 70)
    st = S(page)
    ok('字落到基地 → 護盾 −1、字消失', st['shields'] == 4 and not st['words'], (st['shields'], st['words']))
    page.evaluate('() => { CT.Typing.dev.set("lvCount", 5); CT.Typing.dev.spawn("ant", 6, 8); }')
    type_pad(page, 'ant')
    st = S(page)
    ok('擊落到配額 → 升到第 2 級 + 橫幅', st['lv'] == 2 and st['banner'] > 0 and st['lvCount'] == 0, (st['lv'], st['banner']))
    page.evaluate('() => { CT.Typing.dev.clearWords(); CT.Typing.dev.set("shields", 1); CT.Typing.dev.spawn("ice", 6, 15); }')
    step(page, 70)
    st = S(page)
    ok('護盾歸零 → GAME OVER 結算（BASE DOWN）', st['mode'] == 'result' and st['over'] and st['result']['title'] == 'BASE DOWN', st['result'])
    ok('GAME OVER 按密技 = 原地續關（同一級、護盾補滿、分數保留）', page.evaluate('() => CT.cheat()') and S(page)['mode'] == 'play' and S(page)['lv'] == 2 and S(page)['shields'] == 5 and S(page)['score'] > 0)
    ok('用過密技那局 goal 不會成立', S(page)['runCheats'] == 1 and not page.evaluate('() => GAME.state().goal'))
    page.evaluate('() => { CT.Typing.dev.spawn("bee", 6, 6); CT.Typing.dev.spawn("owl", 16, 8); }')
    ok('遊玩中密技：全部擊落 + 護盾補滿', page.evaluate('() => CT.cheat()') and not S(page)['words'] and S(page)['shields'] == 5)

    # ---------------- 實體鍵盤 ----------------
    start(page, 0)
    page.evaluate('() => { CT.Typing.dev.clearWords(); CT.Typing.dev.set("spawnT", -99999); CT.Typing.dev.set("cur", "g"); }')
    step(page, 2)
    km = page.evaluate('() => [GAME.state().s.phys, NES.Input.keymap().KeyZ, NES.Input.keymap().KeyA]')
    ok('打字狀態：W A S D Z X / Enter / Shift 暫時移出手把（remap）', km[0]['remapped'] and not km[1] and not km[2], km)
    page.evaluate('() => { CT.Typing.dev.spawn("wasd", 4, 6); }')
    page.keyboard.type('wasd')
    step(page, 2)
    st = S(page)
    ok('實體鍵盤打 wasd → 擊落，游標不動（不影響手把路徑）', st['killed'] == 1 and st['cur'] == 'g' and st['phys']['used'] >= 4, (st['killed'], st['cur']))
    page.evaluate('() => { CT.Typing.dev.spawn("cup", 4, 6); }')
    page.keyboard.press('KeyC')
    step(page, 2)
    st = S(page)
    ok('實體鍵盤 C = 字母（鎖定 cup），不觸發密技', st['cheats'] == 0 and st['lock'] >= 0, (st['cheats'], st['lock']))
    page.keyboard.press('Escape')
    step(page, 2)
    st = S(page)
    km = page.evaluate('() => [NES.Input.keymap().KeyZ, NES.Input.keymap().Enter, __nes.nes().music.isPaused()]')
    ok('Esc 暫停：BGM 暫停、手把對應還原（Z = A、Enter = START）', st['paused'] and not st['phys']['active'] and km[0] == 'A' and km[1] == 'START' and km[2], (st['paused'], km))
    page.keyboard.press('Escape')
    step(page, 3)
    st = S(page)
    ok('暫停中再按 Esc → 解除、打字狀態恢復', not st['paused'] and st['phys']['active'] and st['phys']['remapped'], st['phys'])
    tap(page, START)
    ok('START 暫停 / 再按解除', S(page)['paused'])
    tap(page, START)
    ok('解除暫停後音樂接續', not S(page)['paused'] and not page.evaluate('() => __nes.nes().music.isPaused()'))

    # ---------------- SENTENCE ----------------
    start(page, 1, sLv=1, exact=False)
    st = S(page)
    sent = st['sent']
    ok('SENTENCE：一回合 3 句（1 級）', len(sent) == 3 and all(s in page.evaluate('() => CT.Typing.DICT.SENTENCES[0]') for s in sent))
    step(page, 30)
    ok('計時從第一鍵才開始', S(page)['sTime'] == 0)
    page.evaluate('(c) => CT.Typing.dev.feed(c)', sent[0][0].lower())
    step(page, 60)
    ok('第一鍵後開始計時（CASE EASY 小寫也對）', S(page)['sTime'] >= 59 and S(page)['sPos'] == 1, (S(page)['sTime'], S(page)['sPos']))
    page.evaluate('() => CT.Typing.dev.feed("#")')
    ok('打錯算 MISS、不前進', S(page)['sMiss'] == 1 and S(page)['sPos'] == 1)
    want = sent[0][1]
    ok('提示鍵 = 下一個字（空白 → space 鍵）', S(page)['hint'] == ('space' if want == ' ' else want.lower()), (S(page)['hint'], want))
    page.evaluate('(s) => { for (const c of s) CT.Typing.dev.feed(c); }', sent[0][1:])
    step(page, 75)
    page.evaluate('(s) => { for (const c of s) CT.Typing.dev.feed(c); }', sent[1])
    step(page, 75)
    page.evaluate('(s) => { for (const c of s) CT.Typing.dev.feed(c); }', sent[2])
    step(page, 2)
    st = S(page)
    r = st['result'] or {}
    ok('打完 3 句 → 結算（WPM / 正確率 / 評價）', st['mode'] == 'result' and 'wpm' in r and r['acc'] < 100 and r['rank'] in 'SABCD', r)
    ok('WPM 公式：300 字元 / 3606 幀 = 60 WPM、評價門檻手把 / 鍵盤分開',
       page.evaluate('() => CT.Typing.dev.wpmOf(300, 3606)') == 60 and page.evaluate('() => CT.Typing.dev.rankOf(20, 98, false)') == 'S' and page.evaluate('() => CT.Typing.dev.rankOf(20, 98, true)') == 'C')
    start(page, 1, sLv=2, exact=True)
    s0 = S(page)['sent'][0]
    page.evaluate('(c) => CT.Typing.dev.feed(c)', s0[0].lower())
    st = S(page)
    ok('CASE EXACT：大寫字打小寫 = MISS、提示改亮 aA 鍵', st['sMiss'] == 1 and st['sPos'] == 0 and st['hint'] == 'shift', (st['sMiss'], st['hint']))
    tap(page, SELECT)
    ok('SELECT 切大寫後鍵盤變大寫（ABC）', S(page)['upper'])
    walk_to(page, s0[0].lower()); tap(page, A, 1)
    ok('切大寫後用畫面鍵盤打對', S(page)['sPos'] == 1, S(page)['sPos'])
    ok('SENTENCE 密技：自動打完目前這個字', page.evaluate('() => CT.cheat()') and S(page)['sPos'] > 1)

    # ---------------- TIME ATTACK ----------------
    start(page, 2)
    st = S(page)
    t0, w = st['taT'], st['taWord']
    page.evaluate('(s) => { for (const c of s) CT.Typing.dev.feed(c); }', w)
    st = S(page)
    ok('TIME ATTACK：打完一字 +1 秒、換下一個字', st['taDone'] == 1 and st['taT'] >= t0 + 60 - 2 and st['taWord'] != w, (t0, st['taT']))
    page.evaluate('() => CT.Typing.dev.set("taT", 3)')
    step(page, 5)
    st = S(page)
    ok('時間到 → 結算 + 存最佳', st['mode'] == 'result' and st['result']['title'] == 'TIME UP!' and page.evaluate('() => CT.load("typing", "ta", 0)') > 0)

    # ---------------- exit 存分 / 文字 ----------------
    start(page, 0)
    page.evaluate('() => { CT.Typing.dev.set("score", 4321); CT.current.exit(__nes.nes()); }')
    ok('exit() 存最高分（中途離開）', page.evaluate('() => CT.load("typing", "best", 0)') == 4321 and page.evaluate('() => GAME.state().s.phys.active') is False)
    ok('bestText 顯示最高分 6 字元', page.evaluate('() => CT.get("typing").bestText()') == '004321')
    ok('全部畫面文字沒有超出 32 欄（無 text overflow 錯誤）', not [e for e in errs if 'overflow' in e], [e for e in errs if 'overflow' in e][:2])

    # ---------------- 機器人 ----------------
    for lag, cap in (('15', 9000), ('0', 9000), ('24', 11000)):
        fresh(page, '&bot=1&seed=3&lag=' + lag)
        r = page.evaluate(RUN, {'n': cap})
        ok('機器人 lag %s：%d 幀內到第 5 級（goal，不開密技）' % (lag, cap), r['goal'] and r['s']['lv'] >= 5 and r['s']['cheats'] == 0, (r['f'], r['s']['lv'], r['s']['shields']))
        ok('機器人 lag %s：每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte' % lag, r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
        if lag == '15':
            bot_pad = page.evaluate('() => GAME.state().s.phys.used')
            ok('機器人只走手把路徑（沒用實體鍵盤）', bot_pad == 0)

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_typing: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
