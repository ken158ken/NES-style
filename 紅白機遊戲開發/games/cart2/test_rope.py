# -*- coding: utf-8 -*-
"""《星塵跳繩》（cart2 槽 4，id = rope）自動驗證。

重點：設定畫面（模式 / 角色 / 場地）、繩子控制器（週期 / 速度浮動 / 三種假動作）、跳躍物理與判定（過 / PERFECT / 失誤）、
      雙繩 A/B 腳、升級、§6 規則（密技原地續關 / 標題密技無效 / goal 檢查密技 / 暫停 BGM 停 / exit 存分 / backTile / 說明頁行距）、
      每線 ≤ 8（跳繩者最優先、繩珠配額）、VBlank 每幀 ≤ 160 byte、機器人連跳 100。
作法：Playwright 開 `cart2.html?game=rope&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Rope.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_rope.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=rope'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Rope && !!CT.Rope.dev')
    page.evaluate('() => { ["best","bestD","score"].forEach(k => localStorage.removeItem("nes.cart2.rope." + k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


JS_ROW_HAS = r"""
(a) => { const p = __nes.nes().ppu, A = CT.Rope.Art.make(), w = a.hud ? A.hud(a.s) : A.text(a.s);
  for (let c = 0; c + w.length <= 32; c++) { let okk = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, a.r) !== w[i]) { okk = false; break; }
    if (okk) return true; } return false; }
"""
JS_ROWS_USED = r"""
() => { const p = __nes.nes().ppu, out = []; for (let r = 9; r < 27; r++) { let n = 0; for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) n++; out.push(n > 0 ? 1 : 0); } return out; }
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
    reg = page.evaluate("""() => { const g = CT.get('rope'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, back: CT.Rope.Art.make().s('BACK') }; }""")
    ok('註冊：id / order 4 / title / legacy', reg and reg['id'] == 'rope' and reg['order'] == 4 and reg['title'] == '星塵跳繩' and reg['legacy'] == ['jump-rope.html'], reg)
    ok('註冊：契約函式 9 個齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('§6-4 backTile = 精靈表的實心星 BACK（pal 1）', reg['bt'] and reg['bt']['tile'] == reg['back'] and reg['bt']['pal'] == 1, reg['bt'])
    bt = page.evaluate("() => { const a = CT.get('rope').bestText(); localStorage.setItem('nes.cart2.rope.best', '45'); return [a, CT.get('rope').bestText()]; }")
    ok('bestText：6 字元（000HIT / 045HIT）', bt == ['000HIT', '045HIT'], bt)
    a = page.evaluate("""() => { const A = CT.Rope.Art.make(), R = CT.Rope; return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        frames: R.Art.HEADS.every(h => R.Art.LEGS.every(f => [0,1,2,3,4,5].every(i => A.spr.index(h + '_' + f + '_' + i) >= 0))),
        nch: R.CHARS.length, nv: R.VENUES.length, ids: R.CHARS.map(c => c.id).concat(R.VENUES.map(v => v.id)) }; }""")
    ok('CHR ≤ 256；3 角色 × 5 影格（站 / 空中 / 絆倒 / 抬左 / 抬右）× 6 磚', a['bg'] <= 256 and a['spr'] <= 256 and a['frames'], a)
    ok('原創角色 3 位、場地 3 個', a['nch'] == 3 and a['nv'] == 3, a['ids'])
    au = page.evaluate("() => ({ songs: Object.keys(CT.Rope.Audio.SONGS), sfx: Object.keys(CT.Rope.Audio.SFX) })")
    ok('BGM ≥ 1（5 首：標題 + 每場地 1 首 + 結束）、音效 ≥ 4，全部 rope_ 前綴', len(au['songs']) >= 5 and len(au['sfx']) >= 4
       and all(k.startswith('rope_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 標題 / 設定 ----------------
    page.evaluate('() => __nes.step(60)')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠、overFrames 0', lint.get('ok') and page.evaluate('() => __nes.stats().budget.overFrames') == 0, lint.get('colors'))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 21}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 19}))
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 文字行之間都空一列', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); const s = GAME.state().s; return { c, cheats: s.cheats, mode: s.mode }; }")
    ok('§6-1 標題按密技無效', not r['c'] and r['cheats'] == 0 and r['mode'] == 'title', r)
    r = page.evaluate("""() => { const o = []; __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.who);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('left', 1); __nes.step(2); o.push(GAME.state().s.venue);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(CT.Rope.dev.g().msel);
        __nes.tap('right', 1); __nes.step(2); o.push(CT.Rope.dev.g().msel); return o; }""")
    ok('設定：↓ 換列、←→ 改角色 / 場地 / 模式', r == ['BOBO', 'NEON', 1, 0], r)
    phys = page.evaluate("""() => { const R = CT.Rope, out = [];
        R.CHARS.forEach((c, i) => R.VENUES.forEach((v, j) => { const gr = (c.g * v.grav) >> 2; out.push({ c: c.id, v: v.id, air: Math.round(2 * c.v0 / gr), apex: (c.v0 * c.v0 / (2 * gr) / 256) | 0 }); }));
        return out; }""")
    by = {(x['c'], x['v']): x for x in phys}
    ok('角色手感不同：BOBO 跳最高、LUMI 滯空最短', by[('BOBO', 'PLAZA')]['apex'] > by[('TICO', 'PLAZA')]['apex'] > by[('LUMI', 'PLAZA')]['apex']
       and by[('LUMI', 'PLAZA')]['air'] < by[('TICO', 'PLAZA')]['air'], phys[:3])
    ok('MOON 低重力：滯空比 PLAZA 長 ≥ 25%', all(by[(c, 'MOON')]['air'] * 4 >= by[(c, 'PLAZA')]['air'] * 5 for c in ('TICO', 'BOBO', 'LUMI')), [by[(c, 'MOON')]['air'] for c in ('TICO', 'BOBO', 'LUMI')])

    # ---------------- 繩子控制器 ----------------
    r = page.evaluate("""() => { const d = CT.Rope.dev, r = d.newRope(5); r.lvl = 1; r.venue = 0; d.planNext(r); r.w = r.tw;
        const cross = []; for (let f = 1; f <= 400; f++) { const x = d.stepRope(r); if (x.a) cross.push(f); }
        return { tw: r.tw, gaps: cross.slice(1).map((v, i) => v - cross[i]) }; }""")
    ok('繩子：LV1 PLAZA 每圈 96 幀（定速）', r['gaps'] and all(abs(x - 96) <= 1 for x in r['gaps']), r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, r = d.newRope(9); r.lvl = 5; r.venue = 2; const tws = new Set(); for (let i = 0; i < 40; i++) { d.planNext(r); tws.add(r.tw); } return tws.size; }""")
    ok('LV2 起每圈繩速浮動（NEON 40 圈 ≥ 8 種速度）', r >= 8, r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, r = d.newRope(3); r.lvl = 12; r.venue = 1; const k = {};
        for (let i = 0; i < 200; i++) { d.planNext(r); if (r.feint) k[r.feint.type] = (k[r.feint.type] || 0) + 1; } return k; }""")
    ok('LV3 起有假動作，三種都會出現（HOLD / DIP / RUSH）', all(r.get(k, 0) > 0 for k in ('hold', 'dip', 'rush')), r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, r = d.newRope(1); r.lvl = 1; d.planNext(r); r.w = r.tw; r.th = 50000;
        r.feint = { type: 'dip', at: 54000, len: 16 }; r.fired = false; let ths = [];
        for (let i = 0; i < 30; i++) { d.stepRope(r); ths.push(r.th); }
        const hold = d.newRope(1); hold.lvl = 1; d.planNext(hold); hold.w = hold.tw; hold.th = 28000; hold.feint = { type: 'hold', at: 30000, len: 20 }; hold.fired = false;
        const hs = []; for (let i = 0; i < 25; i++) { d.stepRope(hold); hs.push(hold.th); }
        return { dipBack: ths[20] < ths[5], minTh: Math.min(...ths), held: hs.slice(4, 20).every(v => v === 30000) }; }""")
    ok('DIP：繩子下到一半又退回（θ 先增後減）', r['dipBack'] and r['minTh'] < 54000, r)
    ok('HOLD：繩子在頭頂停住一段時間', r['held'], r)

    # ---------------- fix-r6 P2-2：開局預備 120 幀（3 2 1 JUMP!）----------------
    JS_IDLE = r"""(n) => { const g = CT.Rope.dev.g(), th0 = g.rope.th, st0 = g.rope.st; let moved = 0, readyF = 0, m0 = g.misses;
        for (let i = 0; i < n; i++) { __nes.step(1); if (g.rope.th !== th0) moved++; if (g.rope.st === 'ready') readyF++; }
        return { st0, th0, moved, readyF, misses: g.misses - m0, lives: g.lives, mode: g.mode, st: g.rope.st }; }"""
    combos = []
    for mode in ('normal', 'double'):
        for v in range(3):
            fresh(page, '&rmode=%s&venue=%d&who=%d' % (mode, v, v))
            r = page.evaluate(JS_IDLE, 119)   # fresh() 已走 1 幀 ⇒ 共 120 幀
            combos.append((mode, v, r))
    ok('P2-2 開局：6 種（NORMAL/DOUBLE × 3 場地）都先停 120 幀，繩子不動、什麼都不按也 0 失誤',
       all(r['st0'] == 'ready' and r['moved'] == 0 and r['readyF'] >= 118 and r['misses'] == 0 and r['lives'] == 3 for _, _, r in combos),
       [(m, v, r['moved'], r['readyF'], r['misses']) for m, v, r in combos])
    ok('P2-2 開局：NORMAL 繩子停在頭頂（θ = 180°），DOUBLE 兩條停在前 / 後（離腳下 90°）',
       all(r['th0'] == (32768 if m == 'normal' else 16384) for m, _, r in combos), [(m, r['th0']) for m, _, r in combos])
    fresh(page, '&rmode=normal')
    r = page.evaluate("""() => { const out = []; const has = (s) => { const p = __nes.nes().ppu, A = CT.Rope.Art.make(), w = A.hud(s);
        for (let c = 0; c + w.length <= 32; c++) { let k = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, 2) !== w[i]) { k = false; break; } if (k) return true; } return false; };
        for (const f of [5, 45, 85, 125]) { while (CT.Rope.dev.g().ft < f) __nes.step(1); out.push([has('READY   3'), has('READY   2'), has('READY   1'), has('JUMP!')]); }
        return out; }""")
    ok('P2-2 HUD 倒數：第 5 / 45 / 85 幀顯示 3 / 2 / 1，倒數完顯示 JUMP!',
       r[0][0] and r[1][1] and r[2][2] and r[3][3] and not r[3][0], r)
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(), m0 = g.misses; let first = -1;
        for (let i = 0; i < 400; i++) { __nes.step(1); if (g.misses > m0) { first = g.ft; break; } } return { first, st: g.rope.st }; }""")
    ok('P2-2 倒數結束才開始轉：閒置時第一次失誤發生在倒數之後（> 120 幀）', r['first'] > 120, r)
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); __nes.step(72); const st = g.rope.st, m0 = g.misses, l0 = g.lives;
        for (let i = 0; i < 118; i++) __nes.step(1); return { st, dm: g.misses - m0, dl: l0 - g.lives, st2: g.rope.st }; }""")
    ok('P2-2 絆倒重來：同樣先倒數 120 幀、期間 0 失誤', r['st'] == 'ready' and r['dm'] == 0 and r['dl'] == 0, r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); d.over(); __nes.step(2); CT.cheat(); __nes.step(1); const st = g.rope.st, m0 = g.misses;
        for (let i = 0; i < 118; i++) __nes.step(1); return { mode: g.mode, st, dm: g.misses - m0, lives: g.lives }; }""")
    ok('P2-2 續關（密技原地續關）：同樣先倒數 120 幀、期間 0 失誤', r['mode'] == 'play' and r['st'] == 'ready' and r['dm'] == 0 and r['lives'] == 3, r)
    fresh(page, '&rmode=normal')
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); for (let i = 0; i < 60; i++) { if (i % 31 === 0) __nes.tap('a', 1); __nes.step(1); } return { misses: g.misses, combo: g.combo, st: g.rope.st }; }""")
    ok('P2-2 倒數中可以先空跳熱身，不判定也不算連跳', r['misses'] == 0 and r['combo'] == 0 and r['st'] == 'ready', r)

    # ---------------- fix-r6 P3-7：標題 BEST 與選單 bestText 同格式 ----------------
    fresh(page)
    r = page.evaluate("""() => { localStorage.setItem('nes.cart2.rope.best', '45'); localStorage.setItem('nes.cart2.rope.bestD', '7');
        const G = CT.get('rope'), d = CT.Rope.dev, g = d.g(); __nes.tap('down', 1); __nes.step(2); __nes.tap('up', 1); __nes.step(2);
        const p = __nes.nes().ppu, A = CT.Rope.Art.make(); const row = (s) => { const w = A.text(s); for (let c = 0; c + w.length <= 32; c++) { let k = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, 23) !== w[i]) { k = false; break; } if (k) return true; } return false; };
        const n = row('BEST ' + G.bestText()); __nes.tap('right', 1); __nes.step(2); const dd = row('BEST ' + d.bestFmt(7)); __nes.tap('left', 1); __nes.step(2);
        return { bt: G.bestText(), n, dd, old: row('045 HIT') }; }""")
    ok('P3-7 標題 BEST = 選單 bestText() 格式（BEST 045HIT；雙繩同格式 007HIT）', r['bt'] == '045HIT' and r['n'] and r['dd'] and not r['old'], r)

    # ---------------- 跳躍 / 判定 ----------------
    fresh(page, '&rmode=normal')
    s = st(page)
    ok('開局：NORMAL / PLAZA / TICO、3 顆心', s['mode'] == 'play' and s['game'] == 'NORMAL' and s['venue'] == 'PLAZA' and s['who'] == 'TICO' and s['lives'] == 3, s)
    r = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Rope.Art.make();
        return { kl: p.getTile(0, 6, 18) === A.t('KL_0') && p.getTile(0, 7, 21) === A.t('KL_7'), kr: p.getTile(0, 24, 18) === A.t('KR_0'),
                 ground: p.getTile(0, 0, 22) === A.t('GR_T'), hud: p.getTile(0, 0, 0) === A.t('HB') }; }""")
    ok('場地：兩台搖繩機器人（BG）、地面、狀態列', all(r.values()), r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.rope.st = 'stop'; __nes.tap('a', 1); __nes.step(1); const h1 = g.h, air = g.air;
        let n = 1; while (g.air && n < 80) { __nes.step(1); n++; } return { air, h1: h1 >> 8, frames: n }; }""")
    ok('A = 跳：離地、約 30 幀後落地（TICO / PLAZA）', r['air'] and r['h1'] >= 3 and 26 <= r['frames'] <= 34, r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.rope.st = 'stop'; __nes.tap('a', 1); __nes.step(1);
        let n = 0; while (g.h > 2 * 256 || g.vh > 0) { __nes.step(1); if (++n > 80) break; } __nes.tap('a', 1); __nes.step(1);
        let k = 0; while (g.air && g.vh < 0 && k < 10) { __nes.step(1); k++; } return { air: g.air, rising: g.vh > 0 || g.h > 0 }; }""")
    ok('落地前按 A 會緩衝：一落地立刻再跳', r['air'], r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.mode = 'play'; g.air = true; g.foot = 'LR'; d.jump('LR'); g.h = g.apex; const c0 = g.combo, p0 = g.perfects;
        const ok1 = d.judge('a'); const p1 = g.perfects; g.h = 6 * 256; const ok2 = d.judge('a');
        return { ok1, ok2, dc: g.combo - c0, perfect: p1 - p0, good: g.goods, judge: g.judge }; }""")
    ok('判定：頂點 = PERFECT、離地 6 px = GOOD，連跳 +2', r['ok1'] and r['ok2'] and r['dc'] == 2 and r['perfect'] == 1 and r['good'] >= 1, r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.air = false; g.h = 0; const l0 = g.lives; const res = d.judge('a');
        const m = g.mode; __nes.step(72); return { res, dl: l0 - g.lives, combo: g.combo, m, m2: g.mode, st: g.rope.st }; }""")
    ok('失誤：站在地上被繩子掃到 → 扣心、連跳歸零、絆倒 70 幀後繩子回頭頂倒數重來', not r['res'] and r['dl'] == 1 and r['combo'] == 0 and r['m'] == 'trip' and r['m2'] == 'play' and r['st'] == 'ready', r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.jumps = 9; g.lvl = 1; g.air = true; g.h = 20 * 256; g.apex = 30 * 256; d.judge('a'); return [g.lvl, g.rope.lvl]; }""")
    ok('每 10 下升一級（繩子控制器同步等級）', r == [2, 2], r)

    # ---------------- 雙繩 ----------------
    fresh(page, '&rmode=double')
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.rope.st = 'stop'; const o = {};
        __nes.tap('a', 1); __nes.step(1); o.a = g.foot; while (g.air) __nes.step(1);
        __nes.tap('b', 1); __nes.step(1); o.b = g.foot; while (g.air) __nes.step(1);
        __nes.tap(['a', 'b'], 1); __nes.step(1); o.ab = g.foot; while (g.air) __nes.step(1); return o; }""")
    ok('雙繩：A = 抬左腳、B = 抬右腳、A+B = 雙腳大跳', r == {'a': 'L', 'b': 'R', 'ab': 'LR'}, r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.mode = 'play'; g.air = true; g.h = 8 * 256; g.apex = 12 * 256;
        g.foot = 'R'; const okB = d.judge('b'); g.mode = 'play'; g.air = true; g.h = 8 * 256; g.foot = 'L'; const okA = d.judge('a');
        g.mode = 'play'; g.air = true; g.h = 8 * 256; g.foot = 'L'; g.lives = 3; const bad = d.judge('b'); return { okB, okA, bad }; }""")
    ok('雙繩判定：藍繩要右腳、金繩要左腳，腳不對 = 失誤', r['okB'] and r['okA'] and not r['bad'], r)
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.mode = 'play'; g.combo = 99; g.air = true; g.h = 8 * 256; g.foot = 'LR'; d.judge('a'); return CT.get('rope').goal(); }""")
    ok('goal 只算一般模式（雙繩連跳 100 不算）', not r, r)

    # ---------------- 密技 / goal / 結束 / 續關 / 暫停 / exit ----------------
    fresh(page, '&rmode=normal')
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.combo = 99; g.air = true; g.h = 20 * 256; g.apex = 30 * 256; d.judge('a'); return { goal: CT.get('rope').goal(), combo: g.combo }; }""")
    ok('goal：一般模式連跳 100 下且沒用密技', r['goal'] and r['combo'] == 100, r)
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); g.lives = 1; CT.cheat(); __nes.step(1); return { lives: g.lives, slow: g.rope.slowT, cheated: g.cheated, goal: CT.get('rope').goal() }; }""")
    ok('遊玩中密技：心補滿 + 繩子放慢 10 秒，之後 goal false', r['lives'] == 3 and r['slow'] > 500 and r['cheated'] and not r['goal'], r)
    fresh(page, '&rmode=normal')
    r = page.evaluate("""() => { const d = CT.Rope.dev, g = d.g(); g.score = 777; g.jumps = 34; g.lvl = 4; g.rope.lvl = 4; g.bestCombo = 30;
        for (let i = 0; i < 3; i++) { g.mode = 'play'; g.air = false; d.judge('a'); __nes.step(72); }
        return { mode: g.mode, over: __nes.stats().budget.overFrames }; }""")
    ok('3 顆心用完 → GAME OVER 結算（不超預算）', r['mode'] == 'over' and r['over'] == 0, r)
    ok('GAME OVER 畫面寫著 C/★ CONTINUE HERE、lint 綠', page.evaluate(JS_ROW_HAS, {'s': 'CONTINUE HERE', 'r': 23}) and page.evaluate('() => __nes.lint().ok'))
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); CT.cheat(); __nes.step(2);
        return { mode: g.mode, lives: g.lives, score: g.score, jumps: g.jumps, lvl: g.lvl, rl: g.rope.lvl, cont: g.continues, goal: CT.get('rope').goal(), over: __nes.stats().budget.overFrames }; }""")
    ok('§6-1 GAME OVER 按密技 → 原地續關（分數 / 總跳數 / 等級保留、心 3）',
       r['mode'] == 'play' and r['lives'] == 3 and r['score'] == 777 and r['jumps'] == 34 and r['lvl'] == 4 and r['rl'] == 4 and r['cont'] == 1, r)
    ok('續關後 goal false、整片重畫不超預算', not r['goal'] and r['over'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); __nes.step(150); __nes.tap('start', 1); __nes.step(1); const th = g.rope.th, mp = NES.Music.isPaused();
        __nes.step(60); return { p: g.paused, frozen: th === g.rope.th, mp }; }""")
    ok('§6-2 START 暫停：繩子凍結、BGM 暫停', r['p'] and r['frozen'] and r['mp'], r)
    ok('§6-5 暫停列寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 2, 'hud': True}))
    r = page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); return { p: CT.Rope.dev.g().paused, mp: NES.Music.isPaused(), playing: NES.Music.state().playing }; }")
    ok('再按 START 恢復、BGM 接續', not r['p'] and not r['mp'] and r['playing'], r)
    r = page.evaluate("() => { __nes.press('select', 2); __nes.press(['select','start'], 40); __nes.step(42); __nes.release(); __nes.step(1); return CT.Rope.dev.g().paused; }")
    ok('START+SELECT 不觸發暫停', not r, r)
    r = page.evaluate("""() => { const g = CT.Rope.dev.g(); localStorage.removeItem('nes.cart2.rope.best'); g.bestCombo = 42; CT.get('rope').exit(); const a = +localStorage.getItem('nes.cart2.rope.best');
        g.bestCombo = 5; CT.get('rope').exit(); return [a, +localStorage.getItem('nes.cart2.rope.best')]; }""")
    ok('§6-3 exit() 存最高連跳（只寫比舊值大的）', r == [42, 42], r)

    # ---------------- 硬限制：雙繩每線 / 三場地 lint ----------------
    for v in range(3):
        fresh(page, '&bot=1&rmode=double&venue=%d&who=%d' % (v, v))
        r = page.evaluate("""() => { let ml = 0, peak = 0; for (let i = 0; i < 1500; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); }
            const s = GAME.state().s; return { ml, peak, over: __nes.stats().budget.overFrames, hidMax: s.hidMax, combo: s.combo, misses: s.misses, venue: s.venue, lint: __nes.lint().ok, colors: __nes.lint().colors }; }""")
        ok('雙繩 %s 1500 幀：每線 ≤ 8、繩珠連續被藏 ≤ 2 幀、overFrames 0、lint 綠（機器人 0 失誤）' % r['venue'],
           r['ml'] <= 8 and r['hidMax'] <= 2 and r['over'] == 0 and r['peak'] <= 160 and r['lint'] and r['misses'] == 0 and r['combo'] >= 20, r)

    # ---------------- 機器人：一般模式連跳 100 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let ml = 0, peak = 0, i;
        for (i = 0; i < 12000; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); if (CT.get('rope').goal()) break; }
        const s = GAME.state().s; return { frames: i, goal: CT.get('rope').goal(), ml, peak, over: __nes.stats().budget.overFrames, misses: s.misses, perfects: s.perfects, feints: s.feints, cheats: s.cheats, hidMax: s.hidMax }; }""")
    ok('機器人（從標題開始）不開密技一般模式連跳 100（goal）', hl['goal'] and hl['cheats'] == 0, hl)
    ok('機器人途中遇到假動作 ≥ 5 次仍 0 失誤', hl['feints'] >= 5 and hl['misses'] == 0, hl)
    ok('機器人全程每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', hl['ml'] <= 8 and hl['over'] == 0 and hl['peak'] <= 160, hl)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_rope: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
