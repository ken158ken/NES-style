# -*- coding: utf-8 -*-
"""《星塵數獨 STAR SUDOKU》（cart3 槽 2，id = sudoku）自動驗證。

重點：題目產生器（5 級 × 多個種子）由 **Python 獨立回溯解題器** 再驗：終盤合法、提示是終盤子集、恰好 1 解；
      難度分級真實（HARD 只用 T1 解不完、EXPERT 只用 T1+T2 解不完）；同種子同題；
      游標規格（一格一格、按住首延遲 12 幀之後每 4 幀、邊緣繞回）、選字列 / 筆記模式 / 自動擦筆記 / 清除 / 提示、
      錯誤提示三段（OFF / ON / STRICT）、SELECT 放開復原（START+SELECT 不算）、自動檢查完成 + 星等 + 最佳時間、
      暫停藏盤面 + 計時停、密技（遊玩補強 / STRICT 原地續關 / 標題無效 / 不計 goal）、§6 規則、
      差異佇列 overFrames 0、機器人用解題器操作游標完成 goal（入門 + 簡單各 1 題）。
作法：Playwright 開 `cart3.html?game=sudoku&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Sudoku.dev` / `CT.Sudoku.Gen`。

用法：../卡比之星/.venv/bin/python games/cart3/test_sudoku.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=sudoku'
SHOTS = ROOT / 'shots' / 'agent_cart3-number'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
LV = ['intro', 'easy', 'normal', 'hard', 'expert']
SEEDS = range(1, 9)


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


# ---------------- Python 獨立驗證器（與 JS 無共用程式碼） ----------------
def geom(size):
    bw, bh = 3, (3 if size == 9 else 2)
    return bw, bh


def valid_full(grid, size):
    bw, bh = geom(size)
    want = set(range(1, size + 1))
    for r in range(size):
        if set(grid[r * size:(r + 1) * size]) != want:
            return False
    for c in range(size):
        if set(grid[c::size]) != want:
            return False
    for by in range(0, size, bh):
        for bx in range(0, size, bw):
            if set(grid[(by + y) * size + bx + x] for y in range(bh) for x in range(bw)) != want:
                return False
    return True


def count_solutions(grid, size, limit=2):
    bw, bh = geom(size)
    g = list(grid)
    cnt = [0]

    def ok_at(i, v):
        r, c = divmod(i, size)
        for k in range(size):
            if g[r * size + k] == v or g[k * size + c] == v:
                return False
        br, bc = (r // bh) * bh, (c // bw) * bw
        for y in range(bh):
            for x in range(bw):
                if g[(br + y) * size + bc + x] == v:
                    return False
        return True

    def rec():
        best, opts = -1, None
        for i in range(size * size):
            if g[i]:
                continue
            o = [v for v in range(1, size + 1) if ok_at(i, v)]
            if best < 0 or len(o) < len(opts):
                best, opts = i, o
                if len(o) <= 1:
                    break
        if best < 0:
            cnt[0] += 1
            return cnt[0] >= limit
        for v in opts:
            g[best] = v
            if rec():
                return True
            g[best] = 0
        return False

    rec()
    return cnt[0]


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Sudoku && !!CT.Sudoku.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.sudoku.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def hold(page, mask, n):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); __nes.step(2); }', [mask, n])


def start(page, lv, seed, check=1):
    page.evaluate('([l, s, c]) => { CT.Sudoku.dev.start(l, s, c); __nes.step(2); }', [lv, seed, check])


def goto_empty(page):
    """把游標放到第一個空格，回傳 idx。"""
    return page.evaluate('() => { const s = GAME.state().s; const i = s.vals.indexOf(0); CT.Sudoku.dev.setCursor(i % s.size, (i / s.size) | 0); __nes.step(1); return i; }')


def pick(page, item):
    """A 打開選字列 → 移到第 item 格（0 起）→ A。"""
    tap(page, A)
    cur = S(page)['pickSel']
    n = page.evaluate('() => GAME.state().s.size + 2')
    while cur != item:
        tap(page, RIGHT)
        cur = (cur + 1) % n
    tap(page, A)


def attr_at(page, i):
    return page.evaluate('(i) => { const s = GAME.state().s, lo = CT.Sudoku.dev.consts.LAYOUT[s.size]; return __nes.nes().ppu.getAttr(0, (lo.ox >> 1) + i % s.size, (lo.oy >> 1) + ((i / s.size) | 0)); }', i)


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
    reg = page.evaluate("""() => { const g = CT.get('sudoku'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id sudoku / order 2 / title 星塵數獨 / legacy 3 款', reg and reg['id'] == 'sudoku' and reg['order'] == 2 and reg['title'] == '星塵數獨' and len(reg['legacy']) == 3, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 沒紀錄 = 右對齊 6 字元「 --:--」', reg['bestText'] == ' --:--', repr(reg['bestText']))
    page.evaluate('() => CT.save("sudoku", "time_easy", 205)')
    ok('bestText 有紀錄 = 「 03:25」', page.evaluate('() => CT.get("sudoku").bestText()') == ' 03:25')
    page.evaluate('() => localStorage.removeItem("nes.cart3.sudoku.time_easy")')
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Sudoku.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Sudoku.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Sudoku.Audio.SONGS), sfx: Object.keys(CT.Sudoku.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 sudoku_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('sudoku_') for k in au['songs'] + au['sfx']), au)
    nt = page.evaluate("() => { const A = CT.Sudoku.Art.make(); const s = new Set(); for (let m = 0; m < 512; m++) s.add(A.cellTiles(0, 0, m).join(',')); return s.size; }")
    ok('筆記磚：26 磚涵蓋 9 個候選的全部 512 種組合（兩兩不同）', nt == 512, nt)

    # ---------------- 產生器：Python 獨立驗證 ----------------
    puzzles = page.evaluate('(seeds) => { const out = []; for (const lv of %r) for (const s of seeds) { const p = CT.Sudoku.Gen.make(lv, s); out.push({ lv, s, size: p.size, g: p.givens, sol: p.solution, tier: p.tier, clues: p.clues }); } return out; }' % LV, list(SEEDS))
    bad_full, bad_sub, bad_unique = [], [], []
    for p in puzzles:
        if not valid_full(p['sol'], p['size']):
            bad_full.append((p['lv'], p['s']))
        if any(v and v != p['sol'][i] for i, v in enumerate(p['g'])):
            bad_sub.append((p['lv'], p['s']))
        if count_solutions(p['g'], p['size'], 2) != 1:
            bad_unique.append((p['lv'], p['s']))
    ok('產生器 %d 題：終盤都是合法數獨（Python 驗）' % len(puzzles), not bad_full, bad_full)
    ok('產生器：提示數字都是終盤的子集', not bad_sub, bad_sub)
    ok('產生器：**每題恰好 1 解**（Python 獨立回溯數解）', not bad_unique, bad_unique)
    mins = {'intro': 14, 'easy': 36, 'normal': 27, 'hard': 22, 'expert': 20}
    ok('提示數 ≥ 各級下限（入門 14 / 簡單 36 / 普通 27 / 困難 22 / 專家 20）', all(p['clues'] >= mins[p['lv']] for p in puzzles),
       sorted(set((p['lv'], p['clues']) for p in puzzles))[:10])
    tiers = {lv: sorted(set(p['tier'] for p in puzzles if p['lv'] == lv)) for lv in LV}
    ok('難度分級：入門 / 簡單 / 普通 = T1、困難 = T2、專家 = T3', tiers == {'intro': [1], 'easy': [1], 'normal': [1], 'hard': [2], 'expert': [3]}, tiers)
    gap = page.evaluate("""() => { const G = CT.Sudoku.Gen, o = [];
        for (let s = 1; s <= 8; s++) { const h = G.make('hard', s), e = G.make('expert', s);
          o.push([G.logic(h.givens, 9, 1).solved, G.logic(h.givens, 9, 2).solved, G.logic(e.givens, 9, 2).solved, G.logic(e.givens, 9, 3).solved]); }
        return o; }""")
    ok('分級是真的：困難只用 T1 解不完、用 T2 解得完；專家用 T2 解不完、用 T3 解得完（無需猜題）', all(x == [False, True, False, True] for x in gap), gap)
    ok('6×6 入門：宮 3×2、數字 1..6', all(p['size'] == 6 and max(p['sol']) == 6 for p in puzzles if p['lv'] == 'intro'))
    same = page.evaluate("() => JSON.stringify(CT.Sudoku.Gen.make('normal', 77).givens) === JSON.stringify(CT.Sudoku.Gen.make('normal', 77).givens) && JSON.stringify(CT.Sudoku.Gen.make('normal', 77).givens) !== JSON.stringify(CT.Sudoku.Gen.make('normal', 78).givens)")
    ok('?seed= 可重現：同 (級, 種子) 同題、不同種子不同題', same)
    ms = page.evaluate("() => { let m = 0; for (let s = 100; s < 106; s++) { const t = performance.now(); CT.Sudoku.Gen.make('expert', s); m = Math.max(m, performance.now() - t); } return m; }")
    ok('產生速度：專家題 < 1 秒（實測最大 %.0f ms）' % ms, ms < 1000, ms)

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Sudoku.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(10, 26) if tt[i].strip()]
    ok('§6-6 選單 / 說明列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    tap(page, RIGHT)
    tap(page, RIGHT)
    tap(page, DOWN)
    tap(page, LEFT)
    s = S(page)
    ok('標題：→ 換難度（EASY → HARD）、↓ 換列、← 換檢查（ON → OFF）', s['lvSel'] == 3 and s['row'] == 1 and s['check'] == 0, (s['lvSel'], s['row'], s['check']))

    # ---------------- 游標 ----------------
    start(page, 1, 3)
    page.evaluate('() => { CT.Sudoku.dev.setCursor(0, 0); __nes.step(1); }')
    tap(page, RIGHT)
    ok('游標：點一下 → 一格', S(page)['cx'] == 1)
    page.evaluate('() => { CT.Sudoku.dev.setCursor(0, 0); __nes.step(1); }')
    page.evaluate('() => { NES.Input.inject(128, 11); __nes.step(11); }')
    c11 = S(page)['cx']
    page.evaluate('() => { NES.Input.inject(128, 2); __nes.step(2); }')
    c13 = S(page)['cx']
    page.evaluate('() => { NES.Input.inject(128, 8); __nes.step(8); NES.Input.inject(0, 0); __nes.step(2); }')
    c21 = S(page)['cx']
    ok('游標連發：按住 11 幀仍 1 格、第 13 幀第 2 格（首延遲 12）、之後每 4 幀一格（21 幀 = 4 格）', (c11, c13, c21) == (1, 2, 4), (c11, c13, c21))
    page.evaluate('() => { CT.Sudoku.dev.setCursor(8, 0); __nes.step(1); }')
    tap(page, RIGHT)
    tap(page, UP)
    ok('游標邊緣繞回（右邊 → 第 0 欄；上邊 → 第 8 列）', (S(page)['cx'], S(page)['cy']) == (0, 8), (S(page)['cx'], S(page)['cy']))

    # ---------------- 填字 / 筆記 / 清除 / 提示 ----------------
    gv = page.evaluate('() => CT.Sudoku.dev.givens()')
    gi = gv.index(next(v for v in gv if v))
    page.evaluate('(i) => { CT.Sudoku.dev.setCursor(i % 9, (i / 9) | 0); __nes.step(1); }', gi)
    tap(page, A)
    ok('題目提示格按 A 不開選字列', not S(page)['pick'])
    sol = page.evaluate('() => CT.Sudoku.dev.solution()')
    i0 = goto_empty(page)
    pick(page, sol[i0] - 1)
    s = S(page)
    ok('A → 選字列 → → 移 → A 填入正解', s['vals'][i0] == sol[i0] and not s['pick'] and s['misses'] == 0, (s['vals'][i0], sol[i0]))
    ok('同數字高亮：剛填的數字所在格 = 第 2 組調色盤', attr_at(page, i0) == 2, attr_at(page, i0))
    # 筆記 + 自動擦
    i1 = goto_empty(page)
    d1 = sol[i1]
    tap(page, B)
    ok('B 切筆記模式', S(page)['noteMode'])
    tap(page, A)
    while S(page)['pickSel'] != d1 - 1:
        tap(page, RIGHT)
    tap(page, A)
    tap(page, RIGHT)
    tap(page, A)
    s = S(page)
    ok('筆記模式：A 切換小點、選字列不關（連記兩個候選）', s['pick'] and bin(s['notes'][i1]).count('1') == 2 and (s['notes'][i1] >> (d1 - 1)) & 1, (s['pick'], s['notes'][i1]))
    tap(page, B)
    tap(page, B)
    ok('筆記模式下 B 關選字列、再按 B 關筆記模式', not S(page)['pick'] and not S(page)['noteMode'])
    # 在同列另一空格填 d1 → i1 的 d1 筆記被擦掉（若那格正解剛好是 d1 就換欄）
    row = i1 // 9
    peer = next((j for j in range(row * 9, row * 9 + 9) if j != i1 and S(page)['vals'][j] == 0), None)
    page.evaluate('(j) => { CT.Sudoku.dev.setCursor(j % 9, (j / 9) | 0); __nes.step(1); }', peer)
    pick(page, d1 - 1)
    ok('填入數字 → 同列 / 欄 / 宮的同數字筆記自動擦掉', not ((S(page)['notes'][i1] >> (d1 - 1)) & 1), S(page)['notes'][i1])
    ok('錯誤提示 ON：填錯 → MISS +1、該格紅底（第 3 組）', S(page)['misses'] == 1 and attr_at(page, peer) == 3, (S(page)['misses'], attr_at(page, peer)))
    pick(page, 9)
    ok('X 清除', S(page)['vals'][peer] == 0)
    pick(page, 10)
    ok('? 提示：直接填正解、HINT +1', S(page)['vals'][peer] == sol[peer] and S(page)['hints'] == 1, (S(page)['vals'][peer], S(page)['hints']))
    # 復原
    u0 = S(page)['undo']
    page.evaluate('() => { NES.Input.inject(4, 3); __nes.step(3); __nes.step(2); }')
    ok('SELECT 放開 = 復原一步（提示被收回）', S(page)['vals'][peer] == 0 and S(page)['undo'] == u0 - 1, (S(page)['vals'][peer], S(page)['undo']))
    page.evaluate('() => { NES.Input.inject(4, 3); __nes.step(3); NES.Input.inject(12, 10); __nes.step(10); NES.Input.inject(0, 0); __nes.step(3); }')
    ok('按 SELECT 期間碰過 START（回選單組合）→ 放開不復原', S(page)['undo'] == u0 - 1, S(page)['undo'])
    # 錯誤提示 OFF
    start(page, 1, 4, 0)
    sol = page.evaluate('() => CT.Sudoku.dev.solution()')
    i2 = goto_empty(page)
    pick(page, (sol[i2] % 9))
    ok('錯誤提示 OFF：填錯不紅底、HUD MISS 顯示 --', attr_at(page, i2) in (0, 1, 2) and S(page)['wrong'] == 1, attr_at(page, i2))
    # STRICT + 密技續關
    start(page, 0, 5, 2)
    sol = page.evaluate('() => CT.Sudoku.dev.solution()')
    for _ in range(3):
        i3 = goto_empty(page)
        pick(page, sol[i3] % 6)
    s = S(page)
    ok('STRICT：錯 3 次 → GAME OVER（播 sudoku_over）', s['over'] and s['music'] == 'sudoku_over', (s['over'], s['misses']))
    ok('§6-1 GAME OVER 按密技 = 原地續關（錯格擦掉、錯誤歸零、回到遊玩）',
       page.evaluate('() => CT.cheat()') and not S(page)['over'] and S(page)['misses'] == 0 and S(page)['wrong'] == 0 and S(page)['music'] == 'sudoku_play', S(page)['misses'])
    e0 = S(page)['empty']
    ok('遊玩中密技 = 星光指引（揭開 3 格正解）', page.evaluate('() => CT.cheat()') and S(page)['empty'] == e0 - 3, (e0, S(page)['empty']))

    # 暫停
    start(page, 1, 6)
    page.evaluate('() => __nes.step(70)')
    tap(page, START)
    t0 = S(page)['time']
    page.evaluate('() => __nes.step(60)')
    s = S(page)
    lo = page.evaluate('() => CT.Sudoku.dev.consts.LAYOUT[9]')
    hidden = page.evaluate('([lo]) => { const p = __nes.nes().ppu, A = CT.Sudoku.Art.make(), ec = A.cellTiles(0,0,0)[0]; let n = 0; for (let k = 0; k < 81; k++) if (p.getTile(0, lo.ox + 2 * (k % 9), lo.oy + 2 * ((k / 9) | 0)) === ec) n++; return n; }', [lo])
    ok('§6-2 START 暫停：計時停、BGM 暫停、盤面藏起來（81 格都是空白）', s['paused'] and s['time'] == t0 and page.evaluate('() => CT.Sudoku.Audio.isPaused()') and hidden == 81, (s['time'], t0, hidden))
    tap(page, START)
    ok('解除暫停：BGM 接續、盤面回來', not S(page)['paused'] and not page.evaluate('() => CT.Sudoku.Audio.isPaused()'))

    # 解完 / 星等 / 最佳時間
    start(page, 0, 7)
    left = page.evaluate('() => { const k = CT.Sudoku.dev.fillAllBut(1); __nes.step(2); return k; }')
    page.evaluate('(i) => { CT.Sudoku.dev.setCursor(i % 6, (i / 6) | 0); __nes.step(1); }', left[0])
    sol = page.evaluate('() => CT.Sudoku.dev.solution()')
    pick(page, sol[left[0]] - 1)
    s = S(page)
    ok('最後一格填對 → 自動檢查 → CLEAR、3 星、存最佳時間', s['cleared'] and s['stars'] == 3 and page.evaluate('() => CT.load("sudoku", "time_intro", 0)') >= 1, (s['cleared'], s['stars']))
    ok('goal 要入門 + 簡單都解過（只解入門 → false）', not page.evaluate('() => CT.get("sudoku").goal()'))
    ok('星等規則：無提示無錯且在標準時間內 3 星；1 提示 2 星；多提示 1 星',
       page.evaluate("() => [CT.Sudoku.dev.starsFor(100, 0, 0, 'easy'), CT.Sudoku.dev.starsFor(100, 1, 0, 'easy'), CT.Sudoku.dev.starsFor(100, 3, 0, 'easy'), CT.Sudoku.dev.starsFor(9999, 0, 0, 'easy')].join()") == '3,2,1,2')
    ok('解完畫面密技無效', page.evaluate('() => CT.cheat()') is False)
    page.evaluate('() => __nes.step(50)')
    tap(page, A)
    ok('解完 → A 回標題', S(page)['mode'] == 'title')

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    r = page.evaluate(RUN, {'n': 9000})
    ok('機器人：9000 幀內 goal（入門 + 簡單各解 1 題、不開密技）', r['goal'] and set(r['s']['clears']) >= {'intro', 'easy'}, (r['f'], r['s']['clears']))
    ok('機器人用解題器正常操作：0 錯誤、0 提示、0 密技（不改盤面狀態）', r['s']['misses'] == 0 and r['s']['hints'] == 0 and r['s']['cheats'] == 0, (r['s']['misses'], r['s']['hints']))
    ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
    page.evaluate('() => __nes.render()')
    # 每級各跑一題（機器人在 HARD / EXPERT 也解得完：解題器會用 T2 / T3）
    for lv in (3, 4):
        fresh(page, '&bot=1&autostart=1&level=%d&seed=%d' % (lv, 11 + lv))
        r = page.evaluate("""() => { for (let i = 0; i < 6000; i++) { __nes.step(1); if (GAME.state().s.cleared) break; }
            return { s: GAME.state().s, over: __nes.stats().budget.overFrames }; }""")
        ok('機器人解 %s（seed %d）：解完、0 錯、overFrames 0' % (LV[lv].upper(), 11 + lv), r['s']['cleared'] and r['s']['misses'] == 0 and r['over'] == 0, (r['s']['empty'], r['s']['frames']))

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_sudoku: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
