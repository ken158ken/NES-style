# -*- coding: utf-8 -*-
"""《星塵字謎 STAR WORDS》（cart5，id = words）自動驗證。

重點：探測回饋（Python 獨立實作比對 300 組，含重複字母）、回饋表現是「字母下方的符號精靈」而不是字格上色；
      找字盤產生器（3 級 × 多種子，Python 獨立驗：每字恰好出現 1 次、方向在該級允許範圍、全 A-Z）；
      拉選兩種操作（A 按住拖曳 / A 點兩端）、倒著選也算、非直線不算；重組字（打亂 ≠ 原字、同字母、同字母另一個真字也算對、
      提示鎖住、時間到扣命、沒命續關）；探測（畫面鍵盤 DEL / GO、未滿 5 字、掃描、勝 / 敗 + 密技 +2 次）；
      實體鍵盤直打；§6（暫停、標題密技無效、exit 存分、bestText 6 字元、backTile）；文字不超出 32 欄；
      機器人（手把路徑、人類節奏）lag 0 / 15 / 24 達成 goal（找字盤完成 1 盤）、每線 ≤ 8、overFrames 0。
作法：Playwright 開 `cart5.html?game=words&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Words.dev` + `page.keyboard`。

用法：../卡比之星/.venv/bin/python games/cart5/test_words.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import random
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=words'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
DIRS8 = [(1, 0), (0, 1), (1, 1), (1, -1), (-1, 0), (0, -1), (-1, -1), (-1, 1)]


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


# ---------------- Python 獨立實作（與 JS 無共用程式碼） ----------------
def probe_py(ans, gs):
    ans, gs = ans.lower(), gs.lower()
    res = [0] * 5
    pool = {}
    for i in range(5):
        if gs[i] == ans[i]:
            res[i] = 2
        else:
            pool[ans[i]] = pool.get(ans[i], 0) + 1
    for i in range(5):
        if res[i] == 0 and pool.get(gs[i], 0) > 0:
            res[i] = 1
            pool[gs[i]] -= 1
    return res


def occurrences(grid, word):
    n = 0
    for y in range(10):
        for x in range(10):
            for dx, dy in DIRS8:
                okk = True
                for k, ch in enumerate(word):
                    X, Y = x + dx * k, y + dy * k
                    if not (0 <= X < 10 and 0 <= Y < 10) or grid[Y * 10 + X] != ch:
                        okk = False
                        break
                if okk:
                    n += 1
    return n


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Words && !!CT.Words.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.words.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def start(page, mode, **kw):
    page.evaluate('([m, o]) => { CT.Words.dev.start(m, o); __nes.step(2); }', [mode, kw])


def walk_to(page, key):
    for _ in range(40):
        p = page.evaluate('(k) => CT.Words.dev.kb().path(GAME.state().s.cur, k)', key)
        if not p:
            return True
        tap(page, p[0], 1)
    return False


def pad_type(page, word):
    for ch in word:
        walk_to(page, ch.lower())
        tap(page, A, 1)


def hunt_goto(page, x, y, holdA=False):
    for _ in range(30):
        s = S(page)
        m = 0
        if x > s['cx']:
            m |= RIGHT
        elif x < s['cx']:
            m |= LEFT
        if y > s['cy']:
            m |= DOWN
        elif y < s['cy']:
            m |= UP
        if not m:
            return
        if holdA:
            page.evaluate('(m) => { NES.Input.inject(m | 1, 1); __nes.step(1); NES.Input.inject(1, 1); __nes.step(1); }', m)
        else:
            tap(page, m, 1)


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
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
    reg = page.evaluate("""() => { const g = CT.get('words'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id words / order 4 / title 星塵字謎 / legacy 3 款', reg and reg['id'] == 'words' and reg['order'] == 4 and reg['title'] == '星塵字謎' and len(reg['legacy']) == 3, reg)
    ok('註冊：契約函式齊全（9 個）+ backTile', reg and len(reg['fns']) == 9 and reg['bt']['tile'] > 0, reg)
    ok('bestText 6 字元（STK 00）', reg['bestText'] == 'STK 00', repr(reg['bestText']))
    st = S(page)
    ok('背景 CHR ≤ 256 磚', 0 < st['tiles'] <= 256, st['tiles'])
    cells = page.evaluate("""() => { const A = CT.Words.Art.make(), out = {}, empty = A.cell('').join(','), slot = A.slot().join(',');
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { const t = A.cell(ch); out[ch] = { same: t.join(',') === empty || t.join(',') === slot,
          lit: t.reduce((n, i) => n + Array.prototype.filter.call(NES.CHR.getBank('words_bg').tiles[i], v => v === 3).length, 0) }; }
        return out; }""")
    ok('26 個字格都有自己的大字（不會撞到空格 / 空槽磁磚名）', all(not v['same'] and v['lit'] >= 20 for v in cells.values()), {k: v for k, v in cells.items() if v['same'] or v['lit'] < 20})
    page.evaluate('() => __nes.render()')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題 lint 通過', lint['ok'], lint)
    ok('標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    tap(page, DOWN); tap(page, DOWN); tap(page, RIGHT)
    ok('標題：↓↓ 選 WORD HUNT、→ 換 NORMAL', S(page)['sel'] == 2 and S(page)['hLv'] == 1)
    tap(page, A, 4)
    ok('A → 說明頁', S(page)['mode'] == 'help')
    tap(page, B)
    ok('B → 回標題', S(page)['mode'] == 'title')

    # ---------------- 探測回饋 ----------------
    pool = page.evaluate('() => CT.Typing.DICT.PROBE')
    ok('探測答案池 ≥ 100 字、全部 5 字母', len(pool) >= 100 and all(len(w) == 5 for w in pool), len(pool))
    rnd = random.Random(9)
    pairs = [(rnd.choice(pool), rnd.choice(pool)) for _ in range(280)] + [('apple', 'papal'), ('sheep', 'eerie'), ('robin', 'boobs'), ('lemon', 'melon'), ('sweet', 'eeeee'), ('crane', 'stone')] + [(w, w) for w in pool[:14]]
    js = page.evaluate('(ps) => ps.map(p => CT.Words.Gen.probe(p[0], p[1]))', pairs)
    bad = [(p, j, probe_py(*p)) for p, j in zip(pairs, js) if j != probe_py(*p)]
    ok('探測回饋與 Python 獨立實作一致（300 組，含重複字母）', not bad, bad[:3])

    start(page, 0, answer='CRANE')
    pad_type(page, 'sto')
    tap(page, B)
    ok('畫面鍵盤打字 + B 刪字', S(page)['typed'] == 'ST', S(page)['typed'])
    walk_to(page, 'go'); tap(page, A)
    ok('未滿 5 字按 GO → 提示 NEED 5 LETTERS、不送出', S(page)['msg'] == 'NEED 5 LETTERS' and not S(page)['probes'])
    pad_type(page, 'one')
    walk_to(page, 'go'); tap(page, A, 1)
    st = S(page)
    ok('送出 STONE → 回饋 [·,·,·,★,★]', st['probes'] and st['probes'][0]['r'] == [0, 0, 0, 2, 2], st['probes'])
    ok('符號逐一揭曉（揭曉中只出現一部分符號）', st['reveal'] > 0)
    step(page, 55)
    st = S(page)
    ok('鍵盤標示：S T O 不在（灰）、N E 在字裡（金）', st['keyState'].get('s') == 1 and st['keyState'].get('t') == 1 and st['keyState'].get('n') == 2 and st['keyState'].get('e') == 2, st['keyState'])
    syms = page.evaluate("""() => { __nes.render(); const A = CT.Words.Art.make(), want = { star: A.s('SYM_STAR'), ring: A.s('SYM_RING'), dot: A.s('SYM_DOT') }, row = [];
        for (let i = 0; i < 64; i++) { const s = __nes.nes().ppu.getSprite(i); if (s && s.y === 5 * 8) row.push([s.x, s.tile === want.star ? 'S' : s.tile === want.ring ? 'R' : s.tile === want.dot ? 'D' : '?']); }
        row.sort((a, b) => a[0] - b[0]); return row.map(r => r[1]).join(''); }""")
    ok('回饋表現 = 字母正下方的符號精靈（· · · ★ ★），字格不上色', syms == 'DDDSS', syms)
    attrs = page.evaluate('() => { const p = __nes.nes().ppu; return p.getAttr ? [p.getAttr(0, 5, 2), p.getAttr(0, 7, 2)] : null; }')
    ok('探測列屬性維持一般調色盤（沒有用格子顏色表示對錯）', attrs is None or attrs == [0, 0], attrs)
    tap(page, SELECT)
    st = S(page)
    ok('SELECT 掃描：透露一個還沒對上的位置（不是 N / E）', st['scan'] in (0, 1, 2), st['scan'])
    tap(page, SELECT)
    ok('掃描每回合只能 1 次', S(page)['scan'] == st['scan'] and S(page)['lastSfx'] == 'words_bad')
    page.keyboard.type('crane')
    page.keyboard.press('Enter')
    step(page, 60)
    st = S(page)
    ok('實體鍵盤直打 + Enter 送出 → 解出（SIGNAL DECODED、連勝 1）', st['mode'] == 'result' and st['result']['title'] == 'SIGNAL DECODED!' and st['streak'] == 1, (st['mode'], st['result']))
    ok('解出存連勝紀錄、bestText 更新', page.evaluate('() => CT.get("words").bestText()') == 'STK 01')
    start(page, 0, answer='CRANE')
    for w in ['STONE', 'BLIMP', 'SHOUT', 'FUDGY', 'PLUMB', 'DITCH', 'WOOLY']:
        page.evaluate('(w) => { for (const c of w) CT.Words.dev.feed(c); CT.Words.dev.feed("\\n"); __nes.step(55); }', w)
    st = S(page)
    ok('7 次用完 → SIGNAL LOST（顯示答案）', st['mode'] == 'result' and st['over'] and 'CRANE' in st['result']['lines'][0], st['result'])
    ok('失敗結算按密技 = 同一題 +2 次探測續玩', page.evaluate('() => CT.cheat()') and S(page)['mode'] == 'play' and S(page)['maxP'] == 9 and S(page)['answer'] == 'CRANE')
    page.evaluate('() => { for (const c of "CRANE") CT.Words.dev.feed(c); CT.Words.dev.feed("\\n"); __nes.step(55); }')
    ok('續玩第 8 次解出', S(page)['mode'] == 'result' and not S(page)['over'])

    # ---------------- 重組字 ----------------
    start(page, 1, skipReady=True, seed=5)
    st = S(page)
    lens = [len(w) for w in st['shWords']]
    ok('重組字 10 個字、字長 4 → 7 遞增', lens == [4, 4, 4, 5, 5, 5, 6, 6, 7, 7], lens)
    sc = page.evaluate("""(ws) => ws.map(w => { const R = CT.Words.Gen.rng(w.length * 31); const s = CT.Words.Gen.scramble(w, R);
        return [w, s, s !== w && s.split('').sort().join('') === w.split('').sort().join('')]; })""", st['shWords'] + ['STONE', 'APPLE', 'LEMON', 'TREE'])
    ok('打亂後 ≠ 原字、字母相同', all(x[2] for x in sc), [x for x in sc if not x[2]])
    want = st['shWords'][0]
    tray = [t[0] for t in st['tray']]
    for ch in want:
        i = tray.index(ch)
        while S(page)['tc'] != i:
            tap(page, RIGHT, 1)
        tap(page, A, 1)
        tray[i] = '#'
    st = S(page)
    ok('十字鍵 + A 依序拿字母 → 答對、加分、等待下一字', st['shScore'] > 0 and st['shWait'] > 0, (st['ans'], st['shScore']))
    step(page, 65)
    ok('下一個字', S(page)['shIdx'] == 1)
    w1 = S(page)['shWords'][1]
    wrong = w1[1:] + w1[0]
    if wrong == w1:
        wrong = w1[::-1]
    page.evaluate('(w) => { for (const c of w) CT.Words.dev.feed(c); }', wrong)
    st = S(page)
    ok('拼錯 → 字母全部退回、提示再試', st['ans'] == '' and 'TRY AGAIN' in st['msg'], (st['ans'], st['msg']))
    tap(page, SELECT)
    st = S(page)
    ok('SELECT 提示：從頭放對 1 個字母', st['ans'] == w1[0] and st['shHints'] == 1, st['ans'])
    tap(page, B)
    ok('提示放的字母不能被 B 拿回', S(page)['ans'] == w1[0])
    page.keyboard.type(w1[1:].lower())
    step(page, 2)
    ok('實體鍵盤直打字母 → 答對', S(page)['shWait'] > 0, S(page)['ans'])
    step(page, 65)
    page.evaluate('() => { const s = GAME.state().s; CT.Words.dev.set("shWords", s.shWords.map((w, i) => i === s.shIdx ? "LEMON" : w)); CT.Words.dev.set("tray", "OMLNE".split("").map(c => ({ ch: c, used: false }))); CT.Words.dev.set("ans", []); }')
    page.evaluate('() => { for (const c of "MELON") CT.Words.dev.feed(c); }')
    ok('同字母的另一個真字（LEMON → MELON）也算對', S(page)['shWait'] > 0 and 'GREAT' in page.evaluate('() => CT.Words.dev.get("shShow")'))
    step(page, 65)
    page.evaluate('() => CT.Words.dev.set("shT", 2)')
    step(page, 4)
    st = S(page)
    ok('時間到 → 扣 1 命、顯示答案', st['lives'] == 2 and st['shWait'] > 0)
    page.evaluate('() => { CT.Words.dev.set("lives", 1); CT.Words.dev.set("shWait", 0); CT.Words.dev.set("shT", 2); }')
    step(page, 100)
    st = S(page)
    ok('沒命 → OUT OF LIVES', st['mode'] == 'result' and st['over'], st['result'])
    ok('沒命按密技 = 原地續關（命補滿、接下一字）', page.evaluate('() => CT.cheat()') and S(page)['mode'] == 'play' and S(page)['lives'] == 3)
    start(page, 1, skipReady=True, seed=6)
    page.evaluate('() => { CT.Words.dev.set("shScore", 777); CT.current.exit(__nes.nes()); }')
    ok('exit() 中途離開也存重組字最高分', page.evaluate('() => CT.load("words", "shuffle", 0)') == 777)

    # ---------------- 找字盤 ----------------
    gen = page.evaluate("""() => { const out = []; for (let lv = 0; lv < 3; lv++) for (let s = 1; s <= 12; s++) { const h = CT.Words.Gen.hunt(lv, s * 101 + lv);
        out.push({ lv: lv, grid: h.grid.join(''), words: h.words, place: h.place, theme: h.theme }); } return out; }""")
    allowed = {0: {(1, 0), (0, 1)}, 1: {(1, 0), (0, 1), (1, 1), (1, -1)}, 2: set(DIRS8)}
    nw = {0: 6, 1: 8, 2: 10}
    bad = []
    for h in gen:
        if len(h['grid']) != 100 or not h['grid'].isalpha() or not h['grid'].isupper():
            bad.append(('grid', h['lv']))
        if len(h['words']) != nw[h['lv']] or len(set(h['words'])) != len(h['words']):
            bad.append(('count', h['lv'], h['words']))
        for w in h['words']:
            if occurrences(h['grid'], w) != 1 or len(w) > 8:
                bad.append(('occ', w, occurrences(h['grid'], w)))
        for p in h['place']:
            if (p['dx'], p['dy']) not in allowed[h['lv']]:
                bad.append(('dir', h['lv'], p))
    ok('找字盤 3 級 × 12 盤：每字恰好出現 1 次（Python 驗）、方向符合等級、字數 6 / 8 / 10', not bad, bad[:3])
    ok('HARD 有用到倒寫方向', any(p['dx'] < 0 or (p['dx'] == 0 and p['dy'] < 0) for h in gen if h['lv'] == 2 for p in h['place']))

    start(page, 2, hLv=0, seed=3)
    pl = page.evaluate('() => CT.Words.dev.place()')
    seq = page.evaluate("""() => { const out = []; NES.Input.inject(128, 21);
        for (let i = 0; i < 21; i++) { __nes.step(1); out.push(GAME.state().s.cx); } __nes.step(2); return out; }""")
    moves = [i for i in range(1, len(seq)) if seq[i] != seq[i - 1]]
    ok('字盤游標：剛按下走一格、按住首延遲 12 幀之後每 4 幀', seq[0] == 1 and moves == [12, 16, 20], (seq[:3], moves))
    page.evaluate('() => { CT.Words.dev.set("cx", 0); CT.Words.dev.set("cy", 0); }')
    tap(page, RIGHT | DOWN)
    ok('十字鍵斜按 = 斜走一格', S(page)['cx'] == 1 and S(page)['cy'] == 1)
    p0 = pl[0]
    w0 = p0['w']
    ex, ey = p0['x'] + p0['dx'] * (len(w0) - 1), p0['y'] + p0['dy'] * (len(w0) - 1)
    hunt_goto(page, p0['x'], p0['y'])
    page.evaluate('() => { NES.Input.inject(1, 1); __nes.step(1); }')
    hunt_goto(page, ex, ey, holdA=True)
    page.evaluate('() => { __nes.step(2); }')
    st = S(page)
    ok('拉選：A 按住從字首拖到字尾放開 → 找到 %s' % w0, w0 in st['found'], (st['found'], st['msg']))
    p1 = pl[1]
    w1 = p1['w']
    ex, ey = p1['x'] + p1['dx'] * (len(w1) - 1), p1['y'] + p1['dy'] * (len(w1) - 1)
    hunt_goto(page, ex, ey)
    tap(page, A)
    hunt_goto(page, p1['x'], p1['y'])
    tap(page, A)
    st = S(page)
    ok('點兩端（A、移動、A），而且從字尾往字首倒著選也算 → 找到 %s' % w1, w1 in st['found'], st['found'])
    page.evaluate('() => { CT.Words.dev.set("cx", 0); CT.Words.dev.set("cy", 0); }')
    tap(page, A); tap(page, RIGHT); tap(page, RIGHT); tap(page, DOWN); tap(page, A)
    st = S(page)
    ok('不是直線 / 斜線的選取不算、不會誤判', len(st['found']) == 2 and st['selA'] is None)
    tap(page, A); tap(page, RIGHT); tap(page, B)
    ok('B 取消拉選', S(page)['selA'] is None and len(S(page)['found']) == 2)
    tap(page, SELECT)
    ok('SELECT 提示：字首閃爍、提示次數 +1', S(page)['hHints'] == 1)
    tap(page, START)
    ok('START 暫停（BGM 暫停）', S(page)['paused'] and page.evaluate('() => __nes.nes().music.isPaused()'))
    page.evaluate('() => __nes.render()')
    tap(page, START)
    for p in pl[2:]:
        page.evaluate('(p) => { CT.Words.dev.set("cx", p.x); CT.Words.dev.set("cy", p.y); }', p)
        tap(page, A)
        page.evaluate('(p) => { CT.Words.dev.set("cx", p.x + p.dx * (p.w.length - 1)); CT.Words.dev.set("cy", p.y + p.dy * (p.w.length - 1)); }', p)
        tap(page, A)
    st = S(page)
    ok('全部找到 → BOARD CLEAR + 評價、goal 成立（沒用密技）', st['mode'] == 'result' and 'BOARD CLEAR' in st['result']['title'] and st['goal'], st['result'])
    ok('最佳時間存檔', page.evaluate('() => CT.load("words", "hunt0", 0)') >= 1)
    fresh(page)
    start(page, 2, hLv=0, seed=4)
    ok('找字盤密技：直接找出一個字', page.evaluate('() => CT.cheat()') and len(S(page)['found']) == 1)
    pl = page.evaluate('() => CT.Words.dev.place()')
    for p in pl[1:]:
        page.evaluate('(p) => { CT.Words.dev.set("cx", p.x); CT.Words.dev.set("cy", p.y); }', p)
        tap(page, A)
        page.evaluate('(p) => { CT.Words.dev.set("cx", p.x + p.dx * (p.w.length - 1)); CT.Words.dev.set("cy", p.y + p.dy * (p.w.length - 1)); }', p)
        tap(page, A)
    ok('用過密技那盤完成也不算 goal', S(page)['mode'] == 'result' and not S(page)['goal'])

    # ---------------- fix-r9-type P3-3：words 離開路徑也還原手把對應 ----------------
    KM = '() => { const k = NES.Input.keymap(); return [k.KeyZ, k.KeyX, k.KeyW, k.KeyA, k.KeyS, k.KeyD, k.ShiftLeft, k.Enter]; }'
    KM_OK = ['A', 'B', 'UP', 'LEFT', 'DOWN', 'RIGHT', 'SELECT', 'START']
    start(page, 0, answer='CRANE')
    step(page, 3)
    ok('P3-3 前提：STAR PROBE 打字狀態已 remap', page.evaluate('() => CT.Typing.Kbd.Phys.remapped'))
    page.keyboard.press('Escape')
    step(page, 2)
    page.keyboard.down('Shift')
    page.keyboard.down('Enter')
    step(page, 75)
    page.keyboard.up('Enter')
    page.keyboard.up('Shift')
    step(page, 2)
    km = page.evaluate(KM)
    ok('P3-3 words 暫停後按住 Enter+Shift 回選單 → 對應全部還原', page.evaluate('() => CT.current === null') and km == KM_OK, km)
    for k in ('z', 'x', 'w', 'a', 's', 'd', 'Shift'):
        page.keyboard.down(k)
    step(page, 1)
    m = page.evaluate('() => NES.Input.mask()')
    for k in ('z', 'x', 'w', 'a', 's', 'd', 'Shift'):
        page.keyboard.up(k)
    step(page, 1)
    want = A | B | UP | LEFT | DOWN | RIGHT | SELECT
    ok('P3-3 回選單後 Z X W A S D Shift 立即可用（%d）' % m, m & want == want, m)
    page.evaluate('() => { CT.launch("words"); __nes.step(2); }')
    start(page, 1, skipReady=True, seed=5)
    step(page, 3)
    page.evaluate('() => { CT.back(); __nes.step(2); }')
    ok('P3-3 重組字打字中直接回選單（exit）→ 對應立即還原', page.evaluate(KM) == KM_OK and not page.evaluate('() => CT.Typing.Kbd.Phys.active'))
    page.evaluate('() => { CT.launch("words"); __nes.step(2); }')

    # ---------------- fix-r9-type P3-6：觸控直接點（探測 = 鍵盤；重組 = 點字母） ----------------
    tctx = browser.new_context(has_touch=True, viewport={'width': 900, 'height': 900})
    tp = tctx.new_page()
    terrs = []
    tp.on('pageerror', lambda e: terrs.append(str(e)))
    fresh(tp)
    NXY = """(p) => { const el = CT.Typing.Kbd.Tap.el, r = el.getBoundingClientRect(); return [r.left + p[0] * r.width / 256, r.top + (p[1] - 8) * r.height / 224]; }"""

    def ttap_px(x, y):
        cx, cy = tp.evaluate(NXY, [x, y])
        tp.touchscreen.tap(cx, cy)
        step(tp, 1)

    def ttap_key(key):
        k = tp.evaluate('(id) => { const k = CT.Words.dev.kb().byId[id]; return [k.c * 8 + k.w * 4, k.r * 8 + 4]; }', key)
        ttap_px(k[0], k[1])
    start(tp, 0, answer='CRANE')
    step(tp, 3)
    for ch in 'crane':
        ttap_key(ch)
    ok('觸控點畫面鍵盤 c r a n e → 探測列打出 CRANE、游標跟著跳', S(tp)['typed'].upper() == 'CRANE' and S(tp)['cur'] == 'e', (S(tp)['typed'], S(tp)['cur']))
    ttap_key('del')
    ok('觸控點 DEL → 退一格', S(tp)['typed'].upper() == 'CRAN', S(tp)['typed'])
    ttap_key('e')
    ttap_key('go')
    step(tp, 60)
    ok('觸控點 GO → 送出、解出', S(tp)['mode'] == 'result' and not S(tp)['over'], S(tp)['mode'])
    start(tp, 1, skipReady=True, seed=5)
    step(tp, 2)
    st = S(tp)
    n = len(st['tray'])
    c0 = max(2, (16 - n) & ~1)
    ttap_px((c0 + 2 * 2) * 8 + 8, 8 * 8 + 8)
    st = S(tp)
    ok('重組字：觸控點上排第 3 個字母 → 拿進答案', len(st['ans']) == 1 and st['tray'][2].endswith('*'), (st['ans'], st['tray']))
    ttap_px(128, 12 * 8 + 8)
    ok('重組字：觸控點下排答案 → 退回一個', S(tp)['ans'] == '' and not S(tp)['tray'][2].endswith('*'), (S(tp)['ans'], S(tp)['tray']))
    used0 = tp.evaluate('() => CT.Typing.Kbd.Tap.used')
    x, y = tp.evaluate(NXY, [(c0 + 2) * 8 + 8, 72])
    tp.mouse.click(x, y)
    step(tp, 1)
    ok('滑鼠點不算（只在觸控時啟用）', tp.evaluate('() => CT.Typing.Kbd.Tap.used') == used0 and S(tp)['ans'] == '')
    ok('觸控頁全程沒有頁面錯誤', not terrs, terrs[:3])
    tctx.close()

    # ---------------- 畫面 lint / 文字 ----------------
    for mode, kw in ((0, {'answer': 'CRANE'}), (1, {'skipReady': True}), (2, {'hLv': 2})):
        start(page, mode, **kw)
        step(page, 30)
        page.evaluate('() => __nes.render()')
        lint = page.evaluate('() => __nes.lint()')
        ok('模式 %d 遊玩畫面 lint 通過、每線 ≤ 8' % mode, lint['ok'] and lint['maxSpritesLine'] <= 8, lint)
    ok('全部畫面文字沒有超出 32 欄', not [e for e in errs if 'overflow' in e], [e for e in errs if 'overflow' in e][:2])

    # ---------------- 機器人 ----------------
    for lag, cap in (('15', 6000), ('0', 6000), ('24', 7000)):
        fresh(page, '&bot=1&seed=3&lag=' + lag)
        r = page.evaluate(RUN, {'n': cap})
        ok('機器人 lag %s：%d 幀內完成找字盤 1 盤（goal，不開密技）' % (lag, cap), r['goal'] and r['s']['cheats'] == 0 and r['s']['hHints'] == 0, (r['f'], r['s']['found']))
        ok('機器人 lag %s：每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte' % lag, r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_words: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
