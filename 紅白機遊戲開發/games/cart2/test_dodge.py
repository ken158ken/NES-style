# -*- coding: utf-8 -*-
"""《星塵躲避》（cart2 槽 3，id = dodge）自動驗證。

重點：兩模式流程、6 種彈幕型態、擦彈 / 受擊 / 精細移動 / 星爆、躲避球場砲蟹（BG 投手）/ 衝刺無敵 / 道具、
      逐線配額器（每線 ≤ 8，被藏的子彈下一幀優先 ⇒ 連續被藏 ≤ 2 幀）、§6 規則（密技原地續關 / 標題密技無效 /
      goal 檢查密技 / 暫停 BGM 停 / exit 存分 / backTile / 說明頁行距與字樣）、VBlank 每幀 ≤ 160 byte。
作法：Playwright 開 `cart2.html?game=dodge&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Dodge.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_dodge.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=dodge'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Dodge && !!CT.Dodge.dev')
    page.evaluate('() => { ["best","court","barScore"].forEach(k => localStorage.removeItem("nes.cart2.dodge." + k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 某列（nt0）是否含有字串 s（任一欄起點）
JS_ROW_HAS = r"""
(a) => { const p = __nes.nes().ppu, A = CT.Dodge.Art.make(), w = A.text(a.s);
  for (let c = 0; c + w.length <= 32; c++) { let okk = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, a.r) !== w[i]) { okk = false; break; }
    if (okk) return true; } return false; }
"""
JS_ROWS_USED = r"""
() => { const p = __nes.nes().ppu, out = []; for (let r = 8; r < 27; r++) { let n = 0; for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) n++; out.push(n > 0 ? 1 : 0); } return out; }
"""
# 跑 n 幀，逐幀量每線峰值 / 預算
JS_RUN = r"""
(n) => { let ml = 0, peak = 0, over0 = __nes.stats().budget.overFrames;
  for (let i = 0; i < n; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); }
  return { ml, peak, over: __nes.stats().budget.overFrames - over0, s: GAME.state().s }; }
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
    reg = page.evaluate("""() => { const g = CT.get('dodge'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, back: CT.Dodge.Art.make().s('BACK') }; }""")
    ok('註冊：id / order 3 / title / legacy 兩個舊作', reg and reg['id'] == 'dodge' and reg['order'] == 3 and reg['title'] == '星塵躲避'
       and reg['legacy'] == ['dodge-ball.html', 'dodge-master.html'], reg)
    ok('註冊：契約函式 9 個齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('§6-4 backTile = 精靈表的實心星 BACK（pal 3）', reg['bt'] and reg['bt']['tile'] == reg['back'] and reg['bt']['pal'] == 3, reg['bt'])
    bt = page.evaluate("() => { const a = CT.get('dodge').bestText(); localStorage.setItem('nes.cart2.dodge.best', '2730'); const b = CT.get('dodge').bestText(); return [a, b]; }")
    ok('bestText：右對齊 6 字元（0.0S → "  0.0S"，2730 幀 → " 45.5S"）', bt == ['  0.0S', ' 45.5S'], bt)
    a = page.evaluate("""() => { const A = CT.Dodge.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        nova: [0,1,2].every(f => [0,1,2,3].every(q => A.spr.index('NOVA' + f + '_' + q) >= 0)),
        crab: [0,1,2].every(f => [0,1,2,3].every(q => A.bg.index('CB' + f + '_' + q) >= 0)) }; }""")
    ok('CHR：背景 / 精靈 bank ≤ 256；諾娃 3 影格、砲蟹 3 影格', a['bg'] <= 256 and a['spr'] <= 256 and a['nova'] and a['crab'], a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Dodge.Audio.SONGS), sfx: Object.keys(CT.Dodge.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4（9 個），全部 dodge_ 前綴', len(au['songs']) >= 4 and len(au['sfx']) >= 4
       and all(k.startswith('dodge_') for k in au['songs'] + au['sfx']), au)
    ok('彈幕型態 ≥ 6 種且名稱不重複', page.evaluate('() => CT.Dodge.PATTERNS.length >= 6 && new Set(CT.Dodge.PATTERNS).size === CT.Dodge.PATTERNS.length'))

    # ---------------- 標題 ----------------
    r = page.evaluate(JS_RUN, 60)
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠（≤ 25 色、每線 ≤ 8）、60 幀 overFrames 0', lint.get('ok') and lint.get('colors', 99) <= 25 and r['over'] == 0, (lint.get('colors'), r))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 23}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 21}))
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 說明 / 選單文字行之間都空一列（第 8~26 列沒有相鄰兩列都有字）', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); const s = GAME.state().s; return { c, cheats: s.cheats, mode: s.mode }; }")
    ok('§6-1 標題按密技無效（回 false、不計次）', not r['c'] and r['cheats'] == 0 and r['mode'] == 'title', r)
    r = page.evaluate("() => { const a = GAME.state().s.sel; __nes.tap('down', 1); __nes.step(2); const b = GAME.state().s.sel; __nes.tap('down', 1); __nes.step(2); return [a, b, GAME.state().s.sel]; }")
    ok('標題：↑↓ 在 COURT / BARRAGE 間切換（預設 BARRAGE）', r == [1, 0, 1], r)
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    s = st(page)
    ok('START → 彈幕大師開局（3 命、2 星爆、TIME 0）', s['mode'] == 'play' and s['game'] == 'barrage' and s['lives'] == 3 and s['bombs'] == 2 and s['t'] <= 2, s)

    # ---------------- 彈幕：6 型態 + 配額 ----------------
    pats = []
    for p in range(6):
        r = page.evaluate("""(p) => { const d = CT.Dodge.dev, g = d.g(); g.b = []; d.setTime(p * 600); g.inv = 99999; g.hx = 128 * 256; g.hy = 190 * 256;
            let ml = 0, peak = 0, maxB = 0, o0 = __nes.stats().budget.overFrames;
            for (let i = 0; i < 400; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); maxB = Math.max(maxB, g.b.length); }
            return { pat: GAME.state().s.pattern, ml, peak, over: __nes.stats().budget.overFrames - o0, maxB, hidMax: g.hidMax }; }""", p)
        pats.append(r)
    ok('6 型態依序輪替（每 10 秒一種）', [x['pat'] for x in pats] == ['WHIRL', 'BLOOM', 'FAN', 'RAIN', 'TWIN', 'CROSS'], [x['pat'] for x in pats])
    ok('每種型態都有出彈（400 幀內同屏 ≥ 8 顆）', all(x['maxB'] >= 8 for x in pats), [x['maxB'] for x in pats])
    ok('每種型態：每線精靈 ≤ 8（逐幀）', all(x['ml'] <= 8 for x in pats), [x['ml'] for x in pats])
    ok('每種型態：VBlank 每幀 ≤ 160 byte、overFrames 0', all(x['over'] == 0 and x['peak'] <= 160 for x in pats), [(x['peak'], x['over']) for x in pats])
    ok('彈數上限：同屏 ≤ 48 顆（設計上限）', all(x['maxB'] <= 48 for x in pats), [x['maxB'] for x in pats])
    ok('配額器：任何子彈連續被藏 ≤ 2 幀', pats[-1]['hidMax'] <= 2, pats[-1]['hidMax'])
    # 壓力：48 顆擠在同一列
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.hidMax = 0; g.inv = 99999; g.hy = 200 * 256;
        for (let i = 0; i < 48; i++) d.spawnV(16 + i * 4, 120, 0, 0, 'B_ORB', 1);
        const seen = new Set(); let ml = 0;
        for (let f = 0; f < 8; f++) { __nes.step(1); ml = Math.max(ml, __nes.stats().maxSpritesLine); g.b.forEach((b, i) => { if (b.hid === 0) seen.add(i); }); }
        const n = g.b.length; g.b = []; return { ml, seen: seen.size, n, hidMax: g.hidMax }; }""")
    ok('壓力：48 顆同一列 → 每線仍 ≤ 8（配額器）', r['ml'] <= 8, r)
    ok('壓力：8 幀內每一顆都輪到畫出來過（藏過的優先）', r['seen'] == r['n'] == 48 and r['hidMax'] <= 8, r)

    # ---------------- fix-r6 P3-2：60 秒後每輪加難 ----------------
    r = page.evaluate("() => { const d = CT.Dodge.dev, o = []; for (let L = 1; L <= 37; L++) o.push([d.loopRound(L), d.loopIv(L), d.loopSp(L)]); return o; }")
    ok('P3-2 前 60 秒不動：LV1~6 出彈間隔 / 彈速倍率都是 1（256/256）', all(x[0] == 0 and x[1] == 256 and x[2] == 256 for x in r[:6]), r[:6])
    ok('P3-2 LOOP 第 n 輪：間隔 ×0.85ⁿ（218 / 185 / 157）、下限 0.6（154）；彈速每輪 +8%、上限 +40%',
       [r[i][1] for i in (6, 12, 18, 24, 30, 36)] == [218, 185, 157, 154, 154, 154]
       and [r[i][2] for i in (6, 12, 18)] == [276, 296, 316] and max(x[2] for x in r) <= 256 * 1.4, [(x[0], x[1], x[2]) for x in r[5::6]])
    JS_RATE = r"""(L) => { const d = CT.Dodge.dev, g = d.g(), M = CT.Dodge.MAXB, cap = M.barrage; M.barrage = 9999; g.b = []; g.inv = 99999;
        d.setTime((L - 1) * 600); let n = 0, vs = 0, vn = 0;
        for (let i = 0; i < 560; i++) { __nes.step(1); g.b.forEach(b => { if (b.life === 1) { n++; if (b.k === 'B_ORB') { vs += Math.hypot(b.vx, b.vy); vn++; } } }); }
        M.barrage = cap; g.b = []; return { n, v: vn ? Math.round(vs / vn) : 0 }; }"""
    rates = [page.evaluate(JS_RATE, L) for L in (7, 13, 19)]
    ok('P3-2 同型態（WHIRL）出彈量逐輪增加（LV7 < LV13 < LV19，不計上限）', rates[0]['n'] < rates[1]['n'] < rates[2]['n'], rates)
    ok('P3-2 同型態彈速逐輪提高（LV13 / LV7 ≈ +7%，LV19 再提高）', rates[0]['v'] < rates[1]['v'] < rates[2]['v'] and rates[1]['v'] * 100 >= rates[0]['v'] * 105, rates)
    hard = []
    for L in (19, 25, 31):
        for p in range(6):
            r = page.evaluate("""(a) => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.hidMax = 0; d.setTime((a.L - 1 + a.p) * 600); g.inv = 99999; g.hx = 128 * 256; g.hy = 190 * 256;
                let ml = 0, peak = 0, maxB = 0, o0 = __nes.stats().budget.overFrames;
                for (let i = 0; i < 300; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); maxB = Math.max(maxB, g.b.length); }
                return { L: g.lvl, ml, peak, over: __nes.stats().budget.overFrames - o0, maxB, hidMax: g.hidMax }; }""", {'L': L, 'p': p})
            hard.append(r)
    ok('P3-2 LOOP 第 3~5 輪 × 6 型態：每線 ≤ 8（配額器）、彈數 ≤ 48、VBlank ≤ 160 / overFrames 0、子彈連續被藏 ≤ 2 幀',
       all(x['ml'] <= 8 and x['maxB'] <= 48 and x['peak'] <= 160 and x['over'] == 0 and x['hidMax'] <= 2 for x in hard),
       [(x['L'], x['ml'], x['maxB'], x['hidMax']) for x in hard if not (x['ml'] <= 8 and x['maxB'] <= 48 and x['hidMax'] <= 2)] or 'ok')

    # ---------------- 擦彈 / 受擊 / 移動 / 星爆 ----------------
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.inv = 0; g.hx = 128 * 256; g.hy = 150 * 256;
        const s0 = g.score, z0 = g.graze, l0 = g.lives; d.setTime(40);
        d.spawnV(136, 120, 0, 512, 'B_ORB', 1); __nes.step(30); return { dz: g.graze - z0, ds: g.score - s0, dl: g.lives - l0 }; }""")
    ok('擦彈：子彈從 8 px 旁擦過 → 擦彈 +1、分數 ≥ +10、不扣命', r['dz'] == 1 and r['ds'] >= 10 and r['dl'] == 0, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.inv = 0; const l0 = g.lives; d.setTime(40);
        d.spawnV(g.hx >> 8, (g.hy >> 8) - 30, 0, 512, 'B_ORB', 1); __nes.step(20); return { dl: l0 - g.lives, inv: g.inv, hits: g.hits }; }""")
    ok('受擊：正面撞上 → 扣 1 命 + 無敵時間', r['dl'] == 1 and r['inv'] > 0, r)
    r = page.evaluate("""() => { const g = CT.Dodge.dev.g(); g.b = []; g.hx = 60 * 256; const x0 = g.hx; __nes.press('right', 10); __nes.step(10); __nes.release(); const dn = (g.hx - x0) >> 8;
        const x1 = g.hx; __nes.press(['right', 'b'], 10); __nes.step(10); __nes.release(); __nes.step(1); return { dn, df: (g.hx - x1) >> 8 }; }""")
    ok('移動 2 px/幀；按住 B = 精細移動 1 px/幀', r['dn'] == 20 and r['df'] == 10, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); for (let i = 0; i < 10; i++) d.spawnV(40 + i * 10, 60, 0, 0, 'B_ORB', 1);
        const b0 = g.bombs; __nes.tap('a', 1); __nes.step(1); return { b: g.b.length, dbomb: b0 - g.bombs }; }""")
    ok('A = 星爆：清掉全部子彈、星爆 -1', r['b'] == 0 and r['dbomb'] == 1, r)
    r = page.evaluate("() => { const d = CT.Dodge.dev, g = d.g(); d.setTime(1199); __nes.step(2); return [g.lvl, g.msg]; }")
    ok('每 10 秒升一級（LV 3 = FAN）並播報', r[0] == 3 and 'FAN' in r[1], r)

    # ---------------- 暫停 ----------------
    r = page.evaluate("""() => { const g = CT.Dodge.dev.g(); __nes.tap('start', 1); __nes.step(1); const t0 = g.t, mp = NES.Music.isPaused();
        __nes.step(60); const t1 = g.t; return { p: g.paused, frozen: t0 === t1, mp }; }""")
    ok('§6-2 START 暫停：時間凍結、BGM 暫停（NES.Music.isPaused）', r['p'] and r['frozen'] and r['mp'], r)
    ok('§6-5 暫停列寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 2}))
    r = page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); return { p: CT.Dodge.dev.g().paused, mp: NES.Music.isPaused(), playing: NES.Music.state().playing }; }")
    ok('再按 START 恢復：BGM 從暫停處接續', not r['p'] and not r['mp'] and r['playing'], r)
    r = page.evaluate("() => { __nes.press('select', 2); __nes.press(['select','start'], 40); __nes.step(42); __nes.release(); __nes.step(1); return CT.Dodge.dev.g().paused; }")
    ok('START+SELECT（回選單手勢）不觸發暫停', not r, r)

    # ---------------- 密技 / goal / 結束 / 續關 ----------------
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.inv = 99999; d.setTime(3598); __nes.step(3); return { goal: CT.get('dodge').goal(), t: g.t }; }""")
    ok('goal：彈幕大師存活 60 秒（3600 幀）且沒用密技', r['goal'] and r['t'] >= 3600, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); const l0 = g.lives; CT.cheat(); __nes.step(1);
        return { cheated: g.cheated, dl: g.lives - l0, goal: CT.get('dodge').goal(), b: g.b.length }; }""")
    ok('遊玩中密技：+1 命、清彈、之後 goal 一律 false', r['cheated'] and r['dl'] == 1 and not r['goal'] and r['b'] == 0, r)
    fresh(page, '&dmode=barrage')
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); d.setTime(1500); g.score = 4321; g.graze = 12; g.inv = 0;
        d.hurt(); g.inv = 0; d.hurt(); g.inv = 0; d.hurt(); const m1 = g.mode; let o0 = __nes.stats().budget.overFrames; __nes.step(75);
        return { m1, m2: g.mode, over: __nes.stats().budget.overFrames - o0 }; }""")
    ok('3 命用完 → 倒下 → GAME OVER 結算（整片重畫不超預算）', r['m1'] == 'dead' and r['m2'] == 'over' and r['over'] == 0, r)
    ok('GAME OVER 畫面：寫著 GAME OVER 與 C/★ CONTINUE HERE', page.evaluate(JS_ROW_HAS, {'s': 'GAME OVER', 'r': 6}) and page.evaluate(JS_ROW_HAS, {'s': 'CONTINUE HERE', 'r': 23}))
    lint = page.evaluate('() => __nes.lint()')
    ok('GAME OVER 畫面 lint 綠', lint.get('ok'), lint.get('colors'))
    r = page.evaluate("""() => { const g = CT.Dodge.dev.g(); let o0 = __nes.stats().budget.overFrames; CT.cheat(); __nes.step(2);
        return { mode: g.mode, lives: g.lives, bombs: g.bombs, t: g.t, score: g.score, graze: g.graze, lvl: g.lvl, goal: CT.get('dodge').goal(), cont: g.continues, over: __nes.stats().budget.overFrames - o0 }; }""")
    ok('§6-1 GAME OVER 按密技 → 原地續關（時間 / 等級 / 分數 / 擦彈保留，命 3、星爆 2）',
       r['mode'] == 'play' and r['lives'] == 3 and r['bombs'] == 2 and r['t'] >= 1500 and r['score'] >= 4321 and r['graze'] == 12 and r['lvl'] == 3 and r['cont'] == 1, r)
    ok('續關後 goal false、切換不超預算', not r['goal'] and r['over'] == 0, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); localStorage.removeItem('nes.cart2.dodge.best'); d.setTime(1234); CT.get('dodge').exit(); const a = +localStorage.getItem('nes.cart2.dodge.best');
        g.t = 10; CT.get('dodge').exit(); const b = +localStorage.getItem('nes.cart2.dodge.best'); return [a, b]; }""")
    ok('§6-3 exit() 存最高分（只寫比舊值大的）', r == [1234, 1234], r)

    # ---------------- fix-r6 P3-7：標題 BEST 與選單 bestText 同格式 ----------------
    fresh(page)
    r = page.evaluate("""() => { localStorage.setItem('nes.cart2.dodge.best', '2730'); localStorage.setItem('nes.cart2.dodge.court', '1234');
        __nes.tap('down', 1); __nes.step(2); __nes.tap('down', 1); __nes.step(2); return CT.get('dodge').bestText(); }""")
    hb = page.evaluate(JS_ROW_HAS, {'s': 'BEST ' + r, 'r': 25})
    page.evaluate("() => { __nes.tap('down', 1); __nes.step(2); }")
    hc = page.evaluate(JS_ROW_HAS, {'s': 'BEST 001234', 'r': 25})
    ok('P3-7 標題 BEST = 選單 bestText()（BARRAGE "BEST  45.5S"；COURT 純分數 6 位）', r == ' 45.5S' and hb and hc, (r, hb, hc))

    # ---------------- 躲避球場 ----------------
    fresh(page, '&dmode=court')
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(), p = __nes.nes().ppu, A = CT.Dodge.Art.make();
        return g.crabs.map(k => { const q = d.crabPos(k.side, k.slot); return p.getTile(0, q.c, q.r) === A.t('CB' + k.f + '_0') && p.getTile(0, q.c + 1, q.r + 1) === A.t('CB' + k.f + '_3'); }); }""")
    ok('球場：開局 2 隻砲蟹畫在場邊牆上（BG 2×2 磚）', len(r) == 2 and all(r), r)
    r = page.evaluate("""() => { const g = CT.Dodge.dev.g(); g.inv = 99999; let thrown = 0;
        for (let i = 0; i < 240; i++) { __nes.step(1); if (g.b.length) { thrown = i; break; } } return { thrown, n: g.b.length }; }""")
    ok('砲蟹走位 → 蓄力 → 投球（240 幀內出球）', r['n'] > 0, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.b = []; g.inv = 0; g.dashCD = 0; g.dashT = 0; g.hx = 128 * 256; g.hy = 128 * 256; const l0 = g.lives;
        __nes.tap('b', 1); __nes.step(1); const dt = g.dashT; d.spawnV(g.hx >> 8, g.hy >> 8, 0, 0, 'BALL', 1); __nes.step(2);
        const l1 = g.lives; g.b = []; return { dt, dl: l0 - l1, cd: g.dashCD }; }""")
    ok('B = 衝刺：12 幀無敵（球疊在身上也不扣命）+ 冷卻', r['dt'] >= 10 and r['dl'] == 0 and r['cd'] > 0, r)
    r = page.evaluate("() => { const d = CT.Dodge.dev, g = d.g(), out = []; for (let L = 1; L <= 7; L++) { g.lvl = L; out.push(d.courtParams()); } g.lvl = 1; return out; }")
    ok('球場難度遞增：投手數 / 球速不減、LV2~6 依序加入反彈 / 快速 / 弧線 / 分裂 / 連投',
       all(r[i + 1]['crabs'] >= r[i]['crabs'] and r[i + 1]['speed'] > r[i]['speed'] for i in range(6))
       and [r[i]['bounce'] for i in (0, 1)] == [False, True] and r[2]['fast'] and r[3]['curve'] and r[4]['split'] and r[5]['dbl'], [(x['crabs'], x['speed']) for x in r])
    r = page.evaluate("""() => { const g = CT.Dodge.dev.g(); g.b = []; g.lives = 2; g.items = [{ k: 'IT_HEART', x: g.hx >> 8, y: g.hy >> 8, t: 100 }]; __nes.step(2);
        const h = g.lives; g.items = [{ k: 'IT_SHIELD', x: g.hx >> 8, y: g.hy >> 8, t: 100 }]; __nes.step(2); return { h, sh: g.shield, n: g.items.length }; }""")
    ok('道具：補心 +1、護盾', r['h'] == 3 and r['sh'] and r['n'] == 0, r)
    r = page.evaluate("""() => { const d = CT.Dodge.dev, g = d.g(); g.lvl = 6; d.setTime(3000); g.inv = 99999; let ml = 0, peak = 0, o0 = __nes.stats().budget.overFrames;
        for (let i = 0; i < 900; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); }
        return { ml, peak, over: __nes.stats().budget.overFrames - o0, crabs: g.crabs.length, q: g.bgQ.length }; }""")
    ok('球場 LV6 900 幀：每線 ≤ 8、砲蟹 BG 佇列每幀 ≤ 160 byte、overFrames 0', r['ml'] <= 8 and r['peak'] <= 160 and r['over'] == 0 and r['crabs'] >= 6, r)
    lint = page.evaluate('() => __nes.lint()')
    ok('球場遊玩畫面 lint 綠', lint.get('ok') and lint.get('colors', 99) <= 25, lint.get('colors'))

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let ml = 0, peak = 0, i;
        for (i = 0; i < 6000; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); if (CT.get('dodge').goal()) break; }
        const s = GAME.state().s; return { frames: i, goal: CT.get('dodge').goal(), ml, peak, over: __nes.stats().budget.overFrames, hits: s.hits, hidMax: s.hidMax, cheats: s.cheats }; }""")
    ok('機器人（標題選 BARRAGE）不開密技存活 60 秒（goal）', hl['goal'] and hl['cheats'] == 0, hl)
    ok('機器人全程每線 ≤ 8、overFrames 0、子彈連續被藏 ≤ 2 幀', hl['ml'] <= 8 and hl['over'] == 0 and hl['hidMax'] <= 2, hl)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_dodge: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
