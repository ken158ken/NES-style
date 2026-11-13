# -*- coding: utf-8 -*-
"""《星塵探雷 STAR MINES》（cart3 槽 3，id = mines）自動驗證。

重點：**無猜盤面**（產生器 + 邏輯解題器：每個難度多個 seed 都能只靠邏輯從首擊解完、首擊 3×3 無雷、雷數正確、
      同 seed 同盤）、解題器不會推錯、游標一格一格（首延遲 12 / 之後每 4 幀）、插旗 / 和弦 / 踩雷 / 復原 /
      提示 / 暫停 / 密技（遊玩補強、踩雷原地續關）/ 最佳時間 / 連勝、§6 規則、機器人只看 view 用解題器完成
      （0 次猜測）、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart3.html?game=mines&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Mines.dev`。

用法：../卡比之星/.venv/bin/python games/cart3/test_mines.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=mines'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Mines && !!CT.Mines.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.mines.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=1):
    page.evaluate('([m, a]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(a); }', [mask, after])


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

# 5×5：上排 (0,0) (2,0) 兩顆雷；從 (4,4) 開 ⇒ 只剩上排 (0,0) (1,0) (2,0) 沒開，(1,1) = 2
CHORD_ROWS = ['*.*..', '.....', '.....', '.....', '.....']


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
    reg = page.evaluate("""() => { const g = CT.get('mines'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id mines / order 3 / title / legacy minesweeper', reg and reg['id'] == 'mines' and reg['order'] == 3 and reg['title'] == '星塵探雷' and reg['legacy'] == ['minesweeper.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 無紀錄 = 6 字元 " --:--"', reg['bestText'] == ' --:--', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心塊', reg['bt'] and page.evaluate("(t) => t.tile === CT.Mines.Art.make().s('BACK')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Mines.Art.make(); return { bg: A.bg.count || A.bg.tiles.length, spr: A.spr.count || A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Mines.Audio.SONGS), sfx: Object.keys(CT.Mines.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 mines_ 前綴', len(au['songs']) >= 2 and len(au['sfx']) >= 4 and all(k.startswith('mines_') for k in au['songs'] + au['sfx']), au)
    modes = page.evaluate('() => CT.Mines.MODES')
    ok('3 難度 + 自訂；寬皆偶數（盤面對齊屬性格）、雷數遞增', len(modes) == 4 and all(m['w'] % 2 == 0 for m in modes) and modes[0]['m'] < modes[1]['m'] < modes[2]['m'], modes)

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Mines.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t && t !== A.ch(' ')) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ CHEAT', 'C/$ CHEAT' in txt)
    body = [i for i in range(11, 28) if tt[i][2:30].strip()]
    ok('§6-6 選單 / 說明列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)

    # ---------------- 產生器 + 驗證器（無猜盤面） ----------------
    gen = page.evaluate("""() => { const G = CT.Mines.Gen, out = [];
        for (const [W, H, M] of [[10, 10, 12], [12, 11, 24], [14, 12, 40], [6, 6, 9]]) {
          let okAll = true, maxTries = 0, safeStart = true, cnt = true;
          for (let s = 1; s <= 25; s++) {
            const start = ((s * 7) % H) * W + ((s * 13) % W);
            const g = G.Generator(W, H, M, start, s * 7919); while (!g.step(50));
            maxTries = Math.max(maxTries, g.tries);
            const r = G.solve(W, H, g.mines, start, M);
            if (!r.ok) okAll = false;
            let n = 0; for (let i = 0; i < W * H; i++) n += g.mines[i];
            if (n !== M) cnt = false;
            const sx = start % W, sy = (start / W) | 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = sx + dx, y = sy + dy;
              if (x >= 0 && y >= 0 && x < W && y < H && g.mines[y * W + x]) safeStart = false; }
          }
          out.push({ W, H, M, okAll, maxTries, safeStart, cnt });
        } return out; }""")
    ok('產生器：4 種尺寸 × 25 seed 全部「只靠邏輯從首擊解完」（驗證器 solve.ok）', all(x['okAll'] for x in gen), gen)
    ok('產生器：首擊周圍 3×3 一定無雷（首擊安全且打開一片）', all(x['safeStart'] for x in gen), gen)
    ok('產生器：雷數正確', all(x['cnt'] for x in gen), gen)
    rep = page.evaluate("""() => { const G = CT.Mines.Gen; const a = G.Generator(14, 12, 40, 80, 1234); while (!a.step(9)); const b = G.Generator(14, 12, 40, 80, 1234); while (!b.step(1));
        const c = G.Generator(14, 12, 40, 80, 999); while (!c.step(5));
        return { same: a.mines.join('') === b.mines.join(''), diff: a.mines.join('') !== c.mines.join('') }; }""")
    ok('?seed= 可重現：同 seed + 首擊 ⇒ 同盤（與每幀試幾盤無關），不同 seed ⇒ 不同盤', rep['same'] and rep['diff'], rep)
    snd = page.evaluate("""() => { const G = CT.Mines.Gen, rng = G.Rng(77); let bad = 0, n = 0;
        for (let k = 0; k < 300; k++) { const W = 6 + rng.int(9), H = 6 + rng.int(7), M = Math.max(2, Math.floor(W * H * (0.1 + rng.int(15) / 100)));
          const st = rng.int(W * H), m = G.randomBoard(W, H, M, st, rng), num = G.counts(W, H, m), v = new Int8Array(W * H).fill(-1);
          G.openCell(W, H, m, num, v, st);
          for (let r = 0; r < 40; r++) { const d = G.deduce(W, H, v, M); n += d.safe.length + d.mine.length;
            d.mine.forEach(i => { if (!m[i]) bad++; v[i] = -2; }); d.safe.forEach(i => { if (m[i]) bad++; else G.openCell(W, H, m, num, v, i); });
            if (!d.safe.length) break; } }
        return { bad, n }; }""")
    ok('解題器正確性：300 張隨機盤（含要猜的）推出的雷 / 安全格 0 錯', snd['bad'] == 0 and snd['n'] > 1000, snd)

    # ---------------- 遊玩：游標 / 首擊 ----------------
    fresh(page, '&seed=42')
    tap(page, START, 2)
    s = st(page)
    ok('START → 遊玩（EASY 10×10 / 12 雷），等首擊', s['mode'] == 'play' and s['sub'] == 'ready' and s['W'] == 10 and s['M'] == 12, s)
    cx0 = s['cx']
    tap(page, RIGHT)
    ok('十字鍵按一下 = 一格', st(page)['cx'] == cx0 + 1)
    page.evaluate('() => { NES.Input.inject(64, 12); __nes.step(12); NES.Input.inject(0, 0); __nes.step(2); }')
    c12 = st(page)['cx']
    page.evaluate('() => { NES.Input.inject(64, 13); __nes.step(13); NES.Input.inject(0, 0); __nes.step(2); }')
    c13 = st(page)['cx']
    page.evaluate('() => { NES.Input.inject(128, 17); __nes.step(17); NES.Input.inject(0, 0); __nes.step(2); }')
    c17 = st(page)['cx']
    ok('按住：首延遲 12 幀（按 12 幀 = 1 格、13 幀 = 2 格）、之後每 4 幀（17 幀 = 3 格）', c12 == cx0 and c13 == cx0 - 2 and c17 == cx0 + 1, (cx0, c12, c13, c17))
    page.evaluate('() => CT.Mines.dev.cursor(5, 5)')
    tap(page, A, 3)
    s = st(page)
    view = page.evaluate('() => CT.Mines.dev.view()')
    ok('首擊：產生盤面（分幀抽盤）→ live、首擊格 = 0 並展開 ≥ 9 格', s['sub'] == 'live' and view[55] == 0 and s['opened'] >= 9 and s['genTries'] >= 1, s)
    ok('盤面走背景名稱表：遊玩中精靈 ≤ 8 顆（游標 4）', page.evaluate('() => __nes.nes().ppu.oam.filter(o => o && o.on).length') <= 8)

    # ---------------- 插旗 / 和弦 / 勝利 ----------------
    fresh(page)
    page.evaluate('(r) => { CT.Mines.dev.start(0); CT.Mines.dev.setBoard(r, 4, 4); __nes.step(2); }', CHORD_ROWS)
    v = page.evaluate('() => CT.Mines.dev.view()')
    ok('測試盤：從 (4,4) 開 ⇒ 只剩上排 3 格未開、(1,1) = 2', v[0] == -1 and v[1] == -1 and v[2] == -1 and v[6] == 2 and sum(1 for x in v if x == -1) == 3, v[:10])
    page.evaluate('() => CT.Mines.dev.cursor(0, 0)')
    tap(page, B)
    s = st(page)
    ok('B = 插旗（旗數 1、剩餘雷數 HUD 減 1）', s['flags'] == 1 and page.evaluate('() => CT.Mines.dev.view()[0]') == -2)
    tap(page, B)
    ok('再按 B = 拔旗', st(page)['flags'] == 0)
    tap(page, B)
    page.evaluate('() => CT.Mines.dev.cursor(2, 0)')
    tap(page, B)
    page.evaluate('() => CT.Mines.dev.cursor(1, 1)')
    tap(page, A, 2)
    s = st(page)
    ok('和弦：數字上按 A、旗數 = 數字 ⇒ 開完其餘鄰格 → 全開 = 勝利', s['sub'] == 'won' and page.evaluate('() => CT.Mines.dev.view()[1]') == 2, s)
    ok('勝利：剩下的雷自動插旗、星等 1..3、最佳時間存檔、連勝 +1', s['flags'] == 2 and 1 <= s['stars'] <= 3 and s['streak'] == 1 and page.evaluate("() => CT.load('mines', 'best0', 0)") > 0, s)
    bt = page.evaluate("() => CT.get('mines').bestText()")
    ok('bestText 有紀錄 = 難度字母 + MM:SS（6 字元，例 E00:00）', len(bt) == 6 and bt[0] == 'E' and bt[3] == ':', bt)

    # ---------------- 踩雷 / 復原 / 密技續關 ----------------
    page.evaluate('(r) => { CT.Mines.dev.setBoard(r, 4, 4); __nes.step(2); }', CHORD_ROWS)
    page.evaluate('() => { CT.Mines.dev.g().streak = 2; CT.Mines.dev.cursor(0, 0); }')
    tap(page, B)
    page.evaluate('() => CT.Mines.dev.cursor(1, 0)')
    tap(page, B)
    page.evaluate('() => CT.Mines.dev.cursor(1, 1)')
    tap(page, A, 2)
    s = st(page)
    ok('插錯旗再和弦 ⇒ 踩雷（dead）、連勝歸零、播 mines_lose', s['sub'] == 'dead' and s['streak'] == 0 and s['music'] == 'mines_lose', s)
    page.evaluate('() => __nes.step(40)')
    v = page.evaluate('() => CT.Mines.dev.view()')
    tap(page, SELECT, 2)
    s = st(page)
    v2 = page.evaluate('() => CT.Mines.dev.view()')
    ok('踩雷後 SELECT = 復原：回到踩雷前（live、旗子還在、雷沒開）', s['sub'] == 'live' and s['boardDied'] and v2[2] == -1 and v2[0] == -2, (s['sub'], v2[:3]))
    tap(page, A, 2)
    ok('復原後再踩一次', st(page)['sub'] == 'dead')
    r = page.evaluate('() => { const c = CT.cheat(); __nes.step(2); const s = GAME.state(); return { c, sub: s.s.sub, cheated: s.s.boardCheated, goal: s.goal }; }')
    ok('§6-1 踩雷後按密技 = 原地續關（回到踩雷前一步）、該盤記為用過密技、goal false', r['c'] and r['sub'] == 'live' and r['cheated'] and r['goal'] is False, r)
    fresh(page, '&seed=7')
    page.evaluate('() => { CT.Mines.dev.start(0); CT.Mines.dev.cursor(5, 5); }')
    tap(page, A, 3)
    o0 = st(page)['opened']
    r = page.evaluate('() => { const c = CT.cheat(); __nes.step(1); return { c, s: GAME.state().s }; }')
    ok('遊玩中密技 = 一口氣開完推得出的安全格（補強）', r['c'] and r['s']['opened'] > o0 and r['s']['boardCheated'], (o0, r['s']['opened']))

    fresh(page, '&seed=9')
    # qa-r7 P3-5：HUD 不貼頂（EASY / NORMAL 第 2 / 3 列、第 1 列空；HARD 12 列盤面沒有空列，維持第 1 / 2 列）
    hud = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Mines.Art.make(), d = CT.Mines.dev, out = [];
        const blank = (r) => { for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); if (t !== 0 && t !== A.t('SP') && t !== A.t('ST1') && t !== A.t('ST2')) return false; } return true; };
        for (const m of [0, 1, 2]) { d.start(m); for (let i = 0; i < 40; i++) __nes.step(1);
          const g = d.g(); out.push({ m, oy: g.oy, r1: blank(1), mine1: p.getTile(0, 1, 1) === A.t('IC_MINE'), mine2: p.getTile(0, 1, 2) === A.t('IC_MINE'),
            boxTop: g.oy - 1, helpRow: p.getTile(0, 2, 28) }); }
        d.start(0); return out; }""")
    ok('qa-r7 P3-5：EASY / NORMAL HUD 下移到第 2 列（第 1 列空、盤框在第 5 列以下）；HARD 維持第 1 列',
       hud[0]['r1'] and hud[0]['mine2'] and hud[0]['boxTop'] >= 4 and hud[1]['r1'] and hud[1]['mine2'] and hud[1]['oy'] == 6 and hud[1]['boxTop'] >= 4
       and hud[2]['mine1'] and hud[2]['oy'] == 4, hud)
    # ---------------- 提示 / 暫停 ----------------
    fresh(page, '&seed=9')
    page.evaluate('() => { CT.Mines.dev.start(0); CT.Mines.dev.cursor(5, 5); }')
    tap(page, A, 3)
    h = page.evaluate("""() => { CT.Mines.dev.hint(); const s = GAME.state().s, m = CT.Mines.dev.mines(); return { cell: s.hintCell, mine: s.hintCell >= 0 ? m[s.hintCell] : -1, hints: s.hints, cur: s.cy * s.W + s.cx, msg: s.msg }; }""")
    ok('提示：指出推得出的安全格（不是雷）、游標跳過去、hints +1', h['cell'] >= 0 and h['mine'] == 0 and h['cur'] == h['cell'] and h['hints'] == 1, h)
    h = page.evaluate("""() => { const g = CT.Mines.dev.g(), m = CT.Mines.dev.mines(); let k = -1;
        for (let i = 0; i < m.length; i++) if (!m[i] && g.view[i] === -1) { k = i; break; } g.view[k] = -2; CT.Mines.dev.hint(); return { k, cell: GAME.state().s.hintCell, msg: GAME.state().s.msg }; }""")
    ok('提示：有插錯的旗先指出來', h['cell'] == h['k'] and 'WRONG' in h['msg'], h)
    r = page.evaluate("""() => { NES.Input.inject(8, 1); __nes.step(1); const t = GAME.state().s.timer; __nes.step(60);
        const s = GAME.state().s, mp = __nes.nes().music.isPaused(); __nes.step(10);
        const A = CT.Mines.Art.make(), g = CT.Mines.dev.g(), veil = __nes.nes().ppu.getTile(0, g.ox, g.oy) === A.t('VEIL_0');
        NES.Input.inject(8, 1); __nes.step(2); return { paused: s.paused, frozen: s.timer === t, mp, veil, after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('START 暫停：計時凍結、盤面蓋起來（VEIL）', r['paused'] and r['frozen'] and r['veil'], r)
    ok('§6-2 暫停 = BGM 暫停，恢復接續', r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    r = page.evaluate("() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 3); __nes.step(4); return GAME.state().s.paused; }")
    ok('SELECT + START 不觸發暫停', r is False, r)

    # ---------------- 自訂 ----------------
    r = page.evaluate("""() => { const d = CT.Mines.dev; d.custom(13, 30, 999); d.start(); const s = GAME.state().s; return s; }""")
    c = page.evaluate("() => { const g = CT.Mines.dev.g(); g.mode = 'title'; g.modeIdx = 3; g.sel = 1; return 1; }")
    page.evaluate('() => { NES.Input.inject(128, 1); __nes.step(2); }')
    cc = page.evaluate('() => { const g = CT.Mines.dev.g(); return [g.cw, g.chh, g.cm]; }')
    ok('自訂：寬只走偶數、雷數上限 25%', cc[0] % 2 == 0 and cc[2] <= cc[0] * cc[1] // 4, cc)

    # ---------------- 機器人：只看 view、用解題器，0 猜測 ----------------
    fresh(page, '&bot=1&seed=2024')
    rr = page.evaluate(RUN, {'n': 20000, 'until': 'goal'})
    ok('機器人（不開密技）：EASY 無猜盤面連贏 3 局 → goal、0 次猜測', rr['goal'] and rr['s']['sessStreak'] >= 3 and rr['s']['guesses'] == 0 and rr['s']['cheats'] == 0, {'f': rr['f'], 's': {k: rr['s'][k] for k in ('wins', 'losses', 'sessStreak', 'guesses')}})
    ok('機器人全程：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', rr['ml'] <= 8 and rr['over'] == 0 and rr['peak'] <= 160, {'ml': rr['ml'], 'over': rr['over'], 'peak': rr['peak']})
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d' % (rr['f'], rr['ml'], rr['over'], rr['peak']))
    fresh(page, '&bot=1&seed=5&mode=2')
    rr = page.evaluate("""() => { const g = CT.Mines.dev.g(); let f = 0; let ml = 0, over0 = __nes.stats().budget.overFrames;
        for (; f < 12000; f++) { __nes.step(1); ml = Math.max(ml, __nes.stats().maxSpritesLine | 0); if (g.mode === 'play' && g.modeIdx !== 2) { g.modeIdx = 2; } if (GAME.state().s.wins >= 1) break; }
        return { f, ml, over: __nes.stats().budget.overFrames - over0, s: GAME.state().s }; }""")
    ok('HARD 14×12 / 40：機器人照樣只靠邏輯解完（wins ≥ 1、0 猜測、0 超支）', rr['s']['wins'] >= 1 and rr['s']['guesses'] == 0 and rr['over'] == 0 and rr['ml'] <= 8, {'f': rr['f'], 'W': rr['s']['W'], 'guess': rr['s']['guesses']})

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_mines: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
