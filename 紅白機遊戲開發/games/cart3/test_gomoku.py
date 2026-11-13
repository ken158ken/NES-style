# -*- coding: utf-8 -*-
"""《星塵五子棋 STAR GOMOKU》（cart3 槽 4，id = gomoku）自動驗證。

重點：五子判定 / 增量評估一致、三級 AI（必勝 / 必擋、強弱分得開：NORMAL 勝 EASY、HARD 勝 NORMAL）、
      **分幀思考**（同 seed 同手、分幾幀跑結果不變、每幀 AI 時間 ≤ 預算）、井字 3×3 HARD 不敗、
      對局流程（游標一格一格、落子、CPU 思考、悔棋、提示、暫停、雙人、勝負、密技 / 原地續關）、§6 規則、
      盤面走背景名稱表、機器人用 AI 操作游標擊敗 NORMAL、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart3.html?game=gomoku&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Gomoku.dev` / `CT.Gomoku.AI`。

用法：../卡比之星/.venv/bin/python games/cart3/test_gomoku.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=gomoku'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Gomoku && !!CT.Gomoku.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.gomoku.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=1):
    page.evaluate('([m, a]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(a); }', [mask, after])


def idx(x, y):
    return y * 15 + x


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

DUEL = r"""
([lb, lw, n, s0]) => { const AI = CT.Gomoku.AI, res = { 0: 0, 1: 0, 2: 0 };
  for (let s = 1; s <= n; s++) { const b = new Int8Array(225); let c = 1, m = 0, w = 0;
    while (m < 225) { const j = AI.think(b, c, c === 1 ? lb : lw, (s0 + s) * 131 + m); const mv = j.finish(); b[mv] = c; m++;
      if (AI.fiveAt(b, mv)) { w = c; break; } c = 3 - c; }
    res[w]++; }
  return res; }
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
    reg = page.evaluate("""() => { const g = CT.get('gomoku'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id gomoku / order 4 / title / legacy 2 款', reg and reg['id'] == 'gomoku' and reg['order'] == 4 and reg['title'] == '星塵五子棋' and len(reg['legacy']) == 2, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 無紀錄 = 6 字元 000WIN', reg['bestText'] == '000WIN', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心塊', reg['bt'] and page.evaluate("(t) => t.tile === CT.Gomoku.Art.make().s('BACK')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Gomoku.Art.make(); return { bg: A.bg.count || A.bg.tiles.length, spr: A.spr.count || A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Gomoku.Audio.SONGS), sfx: Object.keys(CT.Gomoku.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 gomoku_ 前綴', len(au['songs']) >= 2 and len(au['sfx']) >= 4 and all(k.startswith('gomoku_') for k in au['songs'] + au['sfx']), au)

    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Gomoku.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t && t !== A.ch(' ')) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ CHEAT', 'C/$ CHEAT' in txt)
    body = [i for i in range(11, 28) if tt[i][2:30].strip()]
    ok('§6-6 選單 / 說明列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)

    # ---------------- AI 單元 ----------------
    r = page.evaluate("""() => { const AI = CT.Gomoku.AI, b = new Int8Array(225);
        [0, 16, 32, 48].forEach(i => b[i] = 1); const a = AI.fiveAt(b, 48); b[64] = 1; const c = AI.fiveAt(b, 64);
        const b2 = new Int8Array(225); [95, 96, 97, 98, 99, 100].forEach(i => b2[i] = 2); const d = AI.fiveAt(b2, 97);
        return { four: a, five: c && c.length, six: d && d.length }; }""")
    ok('五子判定：4 連不算、斜 5 連勝、6 連也算（自由規則）', r['four'] is None and r['five'] == 5 and r['six'] == 6, r)
    r = page.evaluate("""() => { const AI = CT.Gomoku.AI, rng = AI.Rng(5), s = AI.State(), b = new Int8Array(225); let bad = 0;
        for (let k = 0; k < 60; k++) { let c; do { c = rng.int(225); } while (b[c]); const col = 1 + (k & 1); AI.make(s, c, col); b[c] = col;
          const t = AI.State(b); if (t.sum[1] !== s.sum[1] || t.sum[2] !== s.sum[2]) bad++;
          if (k % 7 === 6) { AI.unmake(s, c, col); b[c] = 0; const u = AI.State(b); if (u.sum[1] !== s.sum[1] || u.sum[2] !== s.sum[2]) bad++; } }
        return { bad, windows: AI.WIN_COUNT }; }""")
    ok('增量評估：make / unmake 後的窗分數 = 從頭重算（60 手 0 差）、572 個五格窗', r['bad'] == 0 and r['windows'] == 572, r)
    r = page.evaluate("""() => { const AI = CT.Gomoku.AI, out = [];
        for (let lv = 0; lv <= 2; lv++) { const b = new Int8Array(225); [110, 111, 112, 113].forEach(i => b[i] = 2); [80, 81, 82, 96].forEach(i => b[i] = 1);
          const m = AI.think(b, 2, lv, 3).finish(); out.push(m === 109 || m === 114); }
        for (let lv = 1; lv <= 2; lv++) { const b = new Int8Array(225); [110, 111, 112, 113].forEach(i => b[i] = 1); b[109] = 2; [20, 40, 60].forEach(i => b[i] = 2);
          const m = AI.think(b, 2, lv, 3).finish(); out.push(m === 114); }
        return out; }""")
    ok('AI：三級都會「能成五就下」、NORMAL / HARD 一定擋對方的四', all(r), r)
    r = page.evaluate("""() => { const AI = CT.Gomoku.AI, b = new Int8Array(225); [112, 113, 97, 127, 98, 126, 111].forEach((c, k) => b[c] = 1 + (k & 1));
        const j1 = AI.think(b, 2, 2, 77), m1 = j1.finish();
        const j2 = AI.think(b, 2, 2, 77); let f = 0; while (!j2.run(0.3, () => performance.now())) f++;
        const j3 = AI.think(b, 2, 2, 77); while (!j3.run(5, () => performance.now()));
        return { m1, m2: j2.move, m3: j3.move, frames: j2.frames, nodes: j1.nodes, maxMs: j3.maxMs }; }""")
    ok('分幀思考：同 seed 同手，一次算完 / 切成 %d 幀 / 每幀 5 ms 結果完全一樣' % r['frames'], r['m1'] == r['m2'] == r['m3'] and r['frames'] > 5, r)
    ok('分幀思考：HARD 每幀 AI 時間 ≤ 15 ms（預算 5 ms + 一段 8 節點）', r['maxMs'] <= 15, r)
    d1 = page.evaluate(DUEL, [1, 0, 6, 0])
    d2 = page.evaluate(DUEL, [0, 1, 6, 10])
    ok('強弱：NORMAL 對 EASY 先後手共 12 局全勝', d1['1'] == 6 and d2['2'] == 6, (d1, d2))
    d3 = page.evaluate(DUEL, [2, 1, 4, 100])
    d4 = page.evaluate(DUEL, [1, 2, 4, 200])
    ok('強弱：HARD 對 NORMAL 先後手 8 局 ≥ 6 勝', d3['1'] + d4['2'] >= 6, (d3, d4))
    r = page.evaluate("""() => { const AI = CT.Gomoku.AI, rng = AI.Rng(9); let lost = 0, games = 0;
        for (let s = 0; s < 30; s++) { const b = [0,0,0,0,0,0,0,0,0]; let c = 1 + (s & 1), w;
          while (!(w = AI.tttWinner(b, 3))) { let m; if (c === 1) { const e = []; b.forEach((v, i) => { if (!v) e.push(i); }); m = e[rng.int(e.length)]; }
            else m = AI.thinkTTT(b, 3, 2, 2, s).finish(); b[m] = c; c = 3 - c; }
          games++; if (w.color === 1) lost++; }
        const b4 = new Array(16).fill(0); [0, 5, 10].forEach(i => b4[i] = 1); const n3 = AI.tttWinner(b4, 4); b4[15] = 1; const n4 = AI.tttWinner(b4, 4);
        return { lost, games, n3: !!n3, n4: n4 && n4.color }; }""")
    ok('井字 3×3：HARD 對亂下 30 局 0 敗（先後手各半）', r['lost'] == 0 and r['games'] == 30, r)
    ok('井字 4×4：要連 4 才算（連 3 不算）', r['n3'] is False and r['n4'] == 1, r)

    # ---------------- 對局流程 ----------------
    fresh(page, '&seed=11')
    tap(page, START, 2)
    s = st(page)
    ok('START → 五子棋 15×15 對 CPU NORMAL、你先手（太陽）', s['mode'] == 'play' and s['n'] == 15 and s['vsIdx'] == 1 and s['human'] == 1 and s['sub'] == 'turn', s)
    tap(page, RIGHT)
    ok('十字鍵按一下 = 一格', st(page)['cx'] == 8)
    page.evaluate('() => { NES.Input.inject(64, 17); __nes.step(17); NES.Input.inject(0, 0); __nes.step(2); }')
    ok('按住：首延遲 12、之後每 4 幀（17 幀 = 3 格）', st(page)['cx'] == 5, st(page)['cx'])
    page.evaluate('() => CT.Gomoku.dev.cursor(7, 7)')
    tap(page, A)
    s = st(page)
    ok('A 落子 → CPU 思考中', s['hist'] == [idx(7, 7)] and s['sub'] == 'think', s['sub'])
    tile = page.evaluate("() => __nes.nes().ppu.getTile(0, 2 + 7, 6 + 7) === CT.Gomoku.Art.make().t('S111')")
    ok('棋子畫在背景名稱表（太陽石磁磚）', tile)
    r = page.evaluate("""() => { let f = 0, worst = 0; while (GAME.state().s.sub === 'think' && f < 600) { const t = performance.now(); __nes.step(1); worst = Math.max(worst, performance.now() - t); f++; }
        return { f, worst, s: GAME.state().s }; }""")
    ok('CPU 至少「想」MIN_THINK 幀才下、思考期間每幀照常跑', r['f'] >= 23 and len(r['s']['hist']) == 2 and r['s']['sub'] == 'turn', {'f': r['f'], 'worst': round(r['worst'], 1)})
    tap(page, A)
    ok('下在已有子的格子 = 無效', len(st(page)['hist']) == 2)
    tap(page, SELECT, 2)
    s = st(page)
    ok('SELECT 悔棋：CPU 的手 + 自己上一手一起退、輪回自己', s['hist'] == [] and s['sub'] == 'turn' and s['stones'] == 0 and s['undos'] == 1, s)

    # 勝利 → goal / 紀錄
    page.evaluate('(m) => CT.Gomoku.dev.setup(m)', [idx(3, 7), idx(3, 9), idx(4, 7), idx(4, 9), idx(5, 7), idx(5, 9), idx(6, 7), idx(10, 2)])
    page.evaluate('() => CT.Gomoku.dev.cursor(7, 7)')
    tap(page, A, 2)
    s = st(page)
    ok('連成五 → 勝利（result.winner = 你、連線 5 格）', s['sub'] == 'over' and s['result']['winner'] == 1 and len(s['result']['line']) == 5, s['result'])
    ok('擊敗 NORMAL → goal、勝場存檔、bestText = N01WIN', page.evaluate('() => GAME.state().goal') and page.evaluate("() => CT.get('gomoku').bestText()") == 'N01WIN')
    hi = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Gomoku.Art.make(); const seen = new Set();
        for (let i = 0; i < 20; i++) { __nes.step(1); seen.add(p.getTile(0, 2 + 5, 6 + 7)); } return seen.has(A.t('S111H')) && seen.has(A.t('S111')); }""")
    ok('勝利連線閃爍（背景磁磚換高亮版）', hi)
    # 落敗 → 密技原地續關
    fresh(page, '&seed=12')
    page.evaluate('() => CT.Gomoku.dev.start(0, 1, 0)')
    page.evaluate('(m) => CT.Gomoku.dev.setup(m)', [idx(0, 0), idx(3, 7), idx(0, 2), idx(4, 7), idx(0, 4), idx(5, 7), idx(14, 14), idx(6, 7), idx(14, 12)])
    r = page.evaluate("() => { CT.Gomoku.dev.think(); let f = 0; while (GAME.state().s.sub === 'think' && f++ < 400) __nes.step(1); return GAME.state().s; }")
    ok('CPU 有四就會成五 → 你輸了（CPU WINS）', r['sub'] == 'over' and r['result']['winner'] == 2, r['result'])
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const s = GAME.state(); return { c, sub: s.s.sub, n: s.s.hist.length, cheated: s.s.gameCheated, goal: s.goal }; }")
    ok('§6-1 輸了按密技 = 原地續關（退回兩手繼續下）、該局記為用過密技、goal false', r['c'] and r['sub'] == 'turn' and r['n'] == 8 and r['cheated'] and r['goal'] is False, r)
    r = page.evaluate("() => { const c = CT.cheat(); const s = GAME.state().s; return { c, skip: s.skipCpu }; }")
    page.evaluate('() => { CT.Gomoku.dev.cursor(10, 10); }')
    tap(page, A, 3)
    s = st(page)
    ok('遊玩中密技 = CPU 下一手跳過（記為 -1，悔棋一併退）', r['c'] and r['skip'] and s['hist'][-1] == -1 and s['sub'] == 'turn', (r, s['hist'][-3:]))

    # 暫停 / 提示
    fresh(page, '&seed=13')
    page.evaluate('() => CT.Gomoku.dev.start(0, 1, 0)')
    page.evaluate('(m) => CT.Gomoku.dev.setup(m)', [idx(7, 7), idx(8, 8)])
    r = page.evaluate("""() => { NES.Input.inject(8, 1); __nes.step(1); const t = GAME.state().s.timer; __nes.step(30);
        const s = GAME.state().s, mp = __nes.nes().music.isPaused(); NES.Input.inject(8, 1); __nes.step(2);
        return { paused: s.paused, frozen: s.timer === t, mp, after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('START 暫停：計時凍結', r['paused'] and r['frozen'], r)
    ok('§6-2 暫停 = BGM 暫停，恢復接續', r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    r = page.evaluate("""() => { NES.Input.inject(8, 1); __nes.step(1); __nes.step(1); NES.Input.inject(32, 1); __nes.step(2); NES.Input.inject(1, 1); __nes.step(2);
        let f = 0; while (GAME.state().s.hinting && f++ < 300) __nes.step(1); const s = GAME.state().s; return { hints: s.hints, cell: s.hintCell, cur: s.cy * 15 + s.cx, free: s.hintCell >= 0 && !CT.Gomoku.dev.g().board[s.hintCell] }; }""")
    ok('暫停選單 HINT：分幀想一手 → 游標跳到建議點（空點）、hints +1', r['hints'] == 1 and r['free'] and r['cur'] == r['cell'], r)
    r = page.evaluate("() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 3); __nes.step(4); return GAME.state().s.paused; }")
    ok('SELECT + START 不觸發暫停', r is False, r)

    # 雙人 / 井字
    page.evaluate('() => CT.Gomoku.dev.start(0, 3, 0)')
    tap(page, A)
    tap(page, RIGHT)
    tap(page, A)
    s = st(page)
    ok('雙人同機：兩邊都由手把下、不會進 CPU 思考', s['twoP'] and len(s['hist']) == 2 and s['sub'] == 'turn' and not s['thinking'], s['sub'])
    page.evaluate('() => CT.Gomoku.dev.start(1, 2, 0)')
    tap(page, A)
    r = page.evaluate("() => { let f = 0; while (GAME.state().s.sub === 'think' && f++ < 400) __nes.step(1); return GAME.state().s; }")
    tile = page.evaluate("() => __nes.nes().ppu.getTile(0, 2 + 5, 7 + 5) === CT.Gomoku.Art.make().t('T1L_0')")
    ok('井字 3×3：落子（32×32 大棋子走背景）→ CPU HARD 回應', len(r['hist']) == 2 and r['n'] == 3 and tile, r['hist'])
    page.evaluate('() => CT.Gomoku.dev.start(2, 1, 1)')
    r = page.evaluate("() => { let f = 0; while (GAME.state().s.sub === 'think' && f++ < 400) __nes.step(1); return GAME.state().s; }")
    ok('井字 4×4 / CPU 先手：CPU 先下（太陽）、輪到你（月亮）', r['n'] == 4 and r['human'] == 2 and len(r['hist']) == 1 and r['turn'] == 2, r)
    r = page.evaluate("() => { CT.get('gomoku').exit(__nes.nes()); return GAME.state().s.thinking; }")
    ok('exit() 收掉思考工作', r is False)

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1&seed=2024')
    rr = page.evaluate(RUN, {'n': 30000, 'until': 'goal'})
    ok('機器人（不開密技）：用 AI 想 + 十字鍵一格一格走 + A，五子棋擊敗 CPU NORMAL → goal', rr['goal'] and rr['s']['cheats'] == 0 and rr['s']['vsIdx'] == 1 and rr['s']['kind'] == 'g', {'f': rr['f'], 'games': rr['s']['botGames'] + 1, 'moves': len(rr['s']['hist'])})
    ok('機器人全程：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', rr['ml'] <= 8 and rr['over'] == 0 and rr['peak'] <= 160, {'ml': rr['ml'], 'over': rr['over'], 'peak': rr['peak']})
    ok('全程每幀 AI 時間（CPU / 機器人）≤ 15 ms', rr['s']['maxThinkMs'] <= 15 and rr['s']['botMaxMs'] <= 15, (rr['s']['maxThinkMs'], rr['s']['botMaxMs']))
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d、AI 每幀最長 %.1f / %.1f ms' % (rr['f'], rr['ml'], rr['over'], rr['peak'], rr['s']['maxThinkMs'], rr['s']['botMaxMs']))

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_gomoku: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
