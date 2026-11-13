# -*- coding: utf-8 -*-
"""《星塵反應 STAR REFLEX》（cart4 槽 6，id = reflex）自動驗證。

重點：反應時間以幀計（亮燈那幀 → 按下那幀）、ms 換算、偷跑（亮燈前 / 亮燈後 < 6 幀）、SLOW、
      CHOICE 錯方向、COLOR 目標 / 干擾 / 漏按 / 忍住（顏色 + 形狀）、ARROW 三級（中央 / 位置衝突 / 空心反向）、
      暫停（音樂停、該次重測不算偷跑）、§6 規則、機器人反應延遲 0 / 12 / 18 / 24 / 26 幀對 goal 門檻的結果、每線 ≤ 8、VBlank。
      fix-r8：goal = 平均 ≤ 24 幀且偷跑 ≤ 2；**真人模型**（ex-Gaussian 反應時間 + 系統延遲 + 偷跑，20000 局蒙地卡羅，
      規則常數從頁面讀）與 tools/human_filter.js 包住機器人實跑；觸控斜方向（同幀兩方向不判）、HUD 不貼 y = 0。
作法：Playwright 開 `cart4.html?game=reflex&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Reflex.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_reflex.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import math
import os
import pathlib
import random
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HUMAN_JS = ROOT / 'tools' / 'human_filter.js'
# 人類簡單反應時間（ms）ex-Gaussian：μ、σ、τ；系統延遲：鍵盤 33 ms、iPhone 觸控 80 ms（qa-r8 方法）
PROFILES = [('20 代鍵盤', 215, 30, 35, 33), ('40 代鍵盤', 245, 35, 45, 33), ('20 代 iPhone', 215, 30, 35, 80),
            ('40 代 iPhone', 245, 35, 45, 80), ('60 代鍵盤', 290, 45, 60, 33)]


def human_mc(prof, avg_max, false_max, n_try, anticip, timeout, runs=20000, seed=1, p_false=0.05, lapse=0.01):
    """照 updateTest() 的規則：偷跑（5%）與 < anticip 幀都算偷跑並重測；≥ timeout = SLOW 以 timeout 計；按下取樣在下一幀。"""
    rng = random.Random(seed)
    mu, sd, tau, sysl = prof
    win = 0
    for _ in range(runs):
        rts, f = [], 0
        while len(rts) < n_try:
            if rng.random() < p_false:
                f += 1
                continue
            ms = rng.gauss(mu, sd) + rng.expovariate(1.0 / tau) + sysl + (300 if rng.random() < lapse else 0)
            fr = math.ceil(ms * 60.0988 / 1000)
            if fr < anticip:
                f += 1
                continue
            rts.append(min(fr, timeout))
        if round(sum(rts) / n_try) <= avg_max and f <= false_max:
            win += 1
    return round(win * 100.0 / runs, 1)
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=reflex'
VERBOSE = '-v' in sys.argv
QUICK = os.environ.get('NES_QUICK') == '1' or '--quick' in sys.argv   # run_all.sh --quick 設 NES_QUICK=1：略過長時間的真人模型 / 蒙地卡羅（完整 run_all 照跑）
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Reflex && !!CT.Reflex.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.reflex.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


JS_ROW_HAS = r"""
(a) => { const p = __nes.nes().ppu, A = CT.Reflex.Art.make(), w = A.text(a.s);
  for (let c = 0; c + w.length <= 32; c++) { let okk = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, a.r) !== w[i]) { okk = false; break; }
    if (okk) return true; } return false; }
"""
JS_ROWS_USED = r"""
() => { const p = __nes.nes().ppu, out = []; for (let r = 6; r < 25; r++) { let n = 0; for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) n++; out.push(n > 0 ? 1 : 0); } return out; }
"""
# 開局到 intro → 按 A → 回傳
JS_BEGIN = r"""
(mode) => { CT.Reflex.dev.start(mode); __nes.step(15); __nes.tap('a', 1); __nes.step(1); return GAME.state().s.ph; }
"""
# 等到亮燈（stim）那一幀；回傳 state
JS_TO_STIM = r"""
() => { for (let i = 0; i < 400; i++) { const s = GAME.state().s; if (s.ph === 'stim') return s; __nes.step(1); } return GAME.state().s; }
"""
JS_TO_WAIT = r"""
() => { for (let i = 0; i < 400; i++) { const s = GAME.state().s; if (s.ph === 'wait') return s; __nes.step(1); } return GAME.state().s; }
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
    reg = page.evaluate("""() => { const g = CT.get('reflex'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, back: CT.Reflex.Art.make().s('BACK') }; }""")
    ok('註冊：id / order 6 / title / legacy 5 款', reg and reg['id'] == 'reflex' and reg['order'] == 6 and reg['title'] == '星塵反應' and len(reg['legacy']) == 5, reg)
    ok('註冊：契約函式 9 個齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('§6-4 backTile = 精靈表的實心星 BACK', reg['bt'] and reg['bt']['tile'] == reg['back'], reg['bt'])
    bt = page.evaluate("() => { const a = CT.get('reflex').bestText(); localStorage.setItem('nes.cart4.reflex.avg_SIMPLE', '15'); const b = CT.get('reflex').bestText(); localStorage.removeItem('nes.cart4.reflex.avg_SIMPLE'); return [a, b]; }")
    ok('bestText：6 字元（ ---MS / 15 幀 =  250MS）', bt == [' ---MS', ' 250MS'], bt)
    a = page.evaluate("() => { const A = CT.Reflex.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length, sh: CT.Reflex.Art.SHAPES.length, cols: CT.Reflex.COLORS.map(c => c.sh) }; }")
    ok('CHR ≤ 256；顏色 5 種各配一個不同形狀（色弱可辨）', a['bg'] <= 256 and a['spr'] <= 256 and sorted(a['cols']) == [0, 1, 2, 3, 4], a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Reflex.Audio.SONGS), sfx: Object.keys(CT.Reflex.Audio.SFX) })")
    ok('BGM 3 首 + 音效 ≥ 4，全部 reflex_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4 and all(k.startswith('reflex_') for k in au['songs'] + au['sfx']), au)
    src = ''.join((ROOT / 'games/cart4/reflex' / f).read_text(encoding='utf-8') for f in ('main.js', 'song.js', 'art.js'))
    ok('§1-2 不用實際時鐘（無 Date.now() / performance.now() / setTimeout）', not re.search(r'Date\.now\(|performance\.now\(|setTimeout\(|new Date\(', src))
    ms = page.evaluate("() => [1, 6, 12, 18, 20, 24, 60].map(f => CT.Reflex.dev.ms(f))")
    ok('ms 換算 = 幀 × 1000 / 60.0988（18 幀 = 300 ms、20 幀 = 333 ms）', ms == [17, 100, 200, 300, 333, 399, 998], ms)
    tt = page.evaluate("() => [10, 15, 18, 21, 26, 40].map(f => CT.Reflex.dev.titleOf(f))")
    ok('稱號：PULSAR / COMET / METEOR / ROCKET / SATELLITE / MOONWALKER', tt == ['PULSAR', 'COMET', 'METEOR', 'ROCKET', 'SATELLITE', 'MOONWALKER'], tt)

    # ---------------- 標題 ----------------
    page.evaluate('() => __nes.step(60)')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠、overFrames 0', lint.get('ok') and page.evaluate('() => __nes.stats().budget.overFrames') == 0, lint.get('colors'))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 21}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 19}))
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 文字行之間都空一列', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); return { c, s: GAME.state().s }; }")
    ok('§6-1 標題按密技無效', not r['c'] and not r['s']['sessCheated'], r['c'])
    r = page.evaluate("() => { const o = []; for (let i = 0; i < 4; i++) { __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.game); } return o; }")
    ok('標題：←→ 切換 4 模式', r == ['CHOICE', 'COLOR', 'ARROW', 'SIMPLE'], r)
    page.evaluate("() => { __nes.tap('right', 1); __nes.step(2); }")
    ok('§1-3 說明頁畫出 CHOICE 的十字鍵對照（↑ ↓ ← →）', page.evaluate("() => { const p = __nes.nes().ppu, A = CT.Reflex.Art.make(), k = ['K_U','K_D','K_L','K_R'].map(n => A.t(n)); let n = 0; for (let c = 0; c < 32; c++) if (k.includes(p.getTile(0, c, 17))) n++; return n === 4; }"))

    # ---------------- SIMPLE：幀計時 / 偷跑 / SLOW ----------------
    fresh(page)
    ph = page.evaluate(JS_BEGIN, 'SIMPLE')
    s = page.evaluate("() => GAME.state().s")
    ok('開局 READY：先「按 A 開始」，按了才進入等待（燈變紅）', ph == 'wait' and page.evaluate("() => __nes.nes().ppu.getBgPalette(2)[2]") == 0x06, (ph, s['ph']))
    r = page.evaluate("() => { __nes.step(5); __nes.tap('a', 1); __nes.step(1); return GAME.state().s; }")
    ok('偷跑：等待中按 A ⇒ FALSE START、該次不算（0 次）、偷跑 +1', r['falses'] == 1 and len(r['trials']) == 0 and r['ph'] == 'fb', (r['falses'], r['trials'], r['ph']))
    page.evaluate(JS_TO_WAIT)
    st0 = page.evaluate(JS_TO_STIM)
    r = page.evaluate("""() => { const s0 = GAME.state().s; for (let i = 0; i < 14; i++) __nes.step(1); __nes.tap('a', 1);
        const s = GAME.state().s; return { s0f: s0.stimF, ft: s0.ft, tr: s.trials, pal: __nes.nes().ppu.getBgPalette(2) }; }""")
    ok('亮燈 = 綠燈 + 星標（調色盤 $2A）', st0['ph'] == 'stim' and st0['stimF'] == st0['ft'], st0['stimF'])
    ok('反應時間以幀計：亮燈後第 15 幀按下 ⇒ rt = 15 幀', r['tr'] and r['tr'][-1] == ['ok', 15], r['tr'])
    ok('畫面顯示換算 ms（15 幀 = 250 MS）', page.evaluate(JS_ROW_HAS, {'s': '250 MS', 'r': 23}))
    page.evaluate(JS_TO_WAIT)
    page.evaluate(JS_TO_STIM)
    r = page.evaluate("() => { __nes.step(2); __nes.tap('a', 1); return GAME.state().s; }")
    ok('亮燈後 < 6 幀（100 ms）按 ⇒ 判為偷跑（ANTICIPATION），不記成績', r['falses'] == 2 and len(r['trials']) == 1, (r['falses'], r['trials']))
    page.evaluate(JS_TO_WAIT)
    page.evaluate(JS_TO_STIM)
    r = page.evaluate("() => { __nes.step(95); return GAME.state().s; }")
    ok('90 幀沒按 ⇒ SLOW（以 90 幀計入）', r['trials'][-1] == ['slow', 90], r['trials'])
    # 暫停
    page.evaluate(JS_TO_WAIT)
    a0 = page.evaluate("() => { __nes.step(3); __nes.tap('start', 1); __nes.step(300); return GAME.state().s; }")
    hold = page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 27})
    c0 = page.evaluate("() => { __nes.tap('start', 1); __nes.step(1); return GAME.state().s; }")
    r = {'a': a0, 'b': a0, 'c': c0}
    ok('§6-2 暫停：音樂停、300 幀不會亮燈、寫 HOLD START+SELECT: MENU', a0['paused'] and a0['musicPaused'] and a0['ph'] == 'wait' and hold, (a0['paused'], a0['musicPaused'], a0['ph'], hold))
    ok('解除暫停：該次重新等待、不算偷跑', not r['c']['paused'] and r['c']['ph'] == 'wait' and r['c']['falses'] == r['a']['falses'], r['c']['falses'])
    # 跑完 5 次 → 結算
    r = page.evaluate("""() => { for (let k = 0; k < 10 && GAME.state().s.mode === 'play'; k++) { for (let i = 0; i < 400; i++) { const s = GAME.state().s; if (s.ph === 'stim' || s.mode !== 'play') break; __nes.step(1); }
          if (GAME.state().s.mode !== 'play') break; __nes.step(19); __nes.tap('a', 1); __nes.step(1); }
        for (let i = 0; i < 120 && GAME.state().s.mode === 'play'; i++) __nes.step(1); return GAME.state().s; }""")
    ok('SIMPLE 5 次 → 結算（平均含 SLOW 90 > 24 ⇒ goal false）', r['mode'] == 'result' and len(r['trials']) == 5 and not r['goal'], (r['mode'], r['trials'], r['falses']))
    lint = page.evaluate('() => __nes.lint()')
    ok('結算畫面 lint 綠、寫平均 / 稱號', lint.get('ok') and page.evaluate(JS_ROW_HAS, {'s': 'AVERAGE', 'r': 12}) and page.evaluate(JS_ROW_HAS, {'s': 'TITLE', 'r': 18}))
    r = page.evaluate("() => { const b = GAME.state().s.trials.length; CT.cheat(); __nes.step(2); const s = GAME.state().s; return { b, s }; }")
    ok('§6-1 結算按密技 = 原地續關（刪最差一次、回去補測、cheated）', r['s']['mode'] == 'play' and len(r['s']['trials']) == r['b'] - 1 and r['s']['cheated'] and r['s']['ph'] == 'wait', (r['s']['mode'], len(r['s']['trials']), r['s']['ph']))
    ok('用過密技 ⇒ goal() false', page.evaluate("() => CT.get('reflex').goal()") is False and r['s']['sessCheated'])
    r = page.evaluate("() => { const g = CT.Reflex.dev.g(); g.falses = 3; CT.cheat(); __nes.step(1); return GAME.state().s; }")
    ok('測驗中密技：偷跑歸零、本次重來', r['falses'] == 0 and r['ph'] == 'wait', (r['falses'], r['ph']))
    r = page.evaluate("""() => { localStorage.removeItem('nes.cart4.reflex.avg_CHOICE'); CT.Reflex.dev.start('CHOICE'); const g = CT.Reflex.dev.g();
        for (let i = 0; i < 10; i++) g.trials.push({ res: 'ok', rt: 22 }); CT.get('reflex').exit(__nes.nes()); return localStorage.getItem('nes.cart4.reflex.avg_CHOICE'); }""")
    ok('§6-3 exit() 存最佳平均', r == '22', r)

    # ---------------- CHOICE ----------------
    fresh(page)
    page.evaluate(JS_BEGIN, 'CHOICE')
    s = page.evaluate(JS_TO_STIM)
    d = s['stim']['dir']
    attr = page.evaluate("(d) => { const P = [[14,4],[14,18],[6,10],[22,10]]; const p = __nes.nes().ppu; return [0,1,2,3].map(k => p.getAttr(0, P[k][0] >> 1, P[k][1] >> 1)); }", d)
    ok('CHOICE：亮的艙換到亮色調色盤（其他 3 個不亮）', attr[d] == 2 and sorted(attr) == [1, 1, 1, 2], attr)
    keys = ['up', 'down', 'left', 'right']
    r = page.evaluate("(k) => { __nes.step(11); __nes.tap(k, 1); return GAME.state().s.trials; }", keys[[1, 0, 3, 2][d]])
    ok('CHOICE：按錯方向 ⇒ ERROR（記一次、不進平均）', r[-1][0] == 'err', r)
    page.evaluate(JS_TO_WAIT)
    s = page.evaluate(JS_TO_STIM)
    r = page.evaluate("(k) => { __nes.step(19); __nes.tap(k, 1); return GAME.state().s; }", keys[s['stim']['dir']])
    ok('CHOICE：按對 ⇒ rt 20 幀、平均只算對的', r['trials'][-1] == ['ok', 20] and r['avg'] == 20 and r['errs'] == 1, (r['trials'], r['avg'], r['errs']))
    page.evaluate(JS_TO_WAIT)
    s = page.evaluate(JS_TO_STIM)
    dd = s['stim']['dir']
    side = ['right', 'left', 'up', 'down'][dd] if dd < 2 else ['up', 'down'][dd - 2]
    r = page.evaluate("""(a) => { __nes.step(14); const n0 = GAME.state().s.trials.length; __nes.tap(a.k + ',' + a.side, 1); const s1 = GAME.state().s;
        __nes.step(2); __nes.tap(a.k, 1); const s2 = GAME.state().s; return { n0, n1: s1.trials.length, ph1: s1.ph, diag: s1.diag, last: s2.trials[s2.trials.length - 1] }; }""", {'k': keys[dd], 'side': side})
    ok('P2-7 斜方向（同一幀兩個方向）⇒ 不判定（不記 ERROR）；接著單一方向照常判定', r['n1'] == r['n0'] and r['ph1'] == 'stim' and r['diag'] >= 1 and r['last'][0] == 'ok', r)
    ways = page.evaluate("() => { const T = NES.Touch; if (!T || !T.getWays) return null; const a = T.getWays(); CT.get('reflex').exit(__nes.nes()); const b = T.getWays(); return [a, b]; }")
    ok('P2-7 init 時 NES.Touch.setWays(4)、exit 設回 8（API 缺席時不報錯）', ways is None or ways == [4, 8], ways)

    # ---------------- COLOR ----------------
    fresh(page)
    page.evaluate(JS_BEGIN, 'COLOR')
    seq = page.evaluate("() => CT.Reflex.dev.g().seq")
    ok('COLOR：12 次 = 7 目標 + 5 干擾（洗牌）', len(seq) == 12 and sum(seq) == 7, seq)
    ok('COLOR：說明列寫目標色名 + 形狀圖示', page.evaluate("() => { const g = CT.Reflex.dev.g(), C = CT.Reflex.COLORS[g.target], A = CT.Reflex.Art.make(), p = __nes.nes().ppu; let sh = false; for (let c = 0; c < 32; c++) if (p.getTile(0, c, 3) === A.t('SH_' + C.sh)) sh = true; return sh; }"))
    ok('P3-2 測驗中 HUD 不貼頂：名稱表第 0、1 列（可見 y < 8）沒有圖塊', page.evaluate("() => { const p = __nes.nes().ppu; for (let r = 0; r < 2; r++) for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) return false; return true; }"))
    out = []
    for k in range(4):
        s = page.evaluate(JS_TO_STIM)
        pal = page.evaluate("() => __nes.nes().ppu.getBgPalette(2)")
        mk = page.evaluate("() => { const p = __nes.nes().ppu, A = CT.Reflex.Art.make(), g = CT.Reflex.dev.g(); return p.getTile(0, 15, 12) === A.t('MK_' + CT.Reflex.Art.SHAPES[CT.Reflex.COLORS[g.stim.color].sh] + '_0'); }")
        col = page.evaluate("(i) => CT.Reflex.COLORS[i]", page.evaluate("() => CT.Reflex.dev.g().stim.color"))
        go = s['stim']['go']
        if k % 2 == 0:
            page.evaluate("() => { __nes.step(15); __nes.tap('a', 1); }")
        else:
            page.evaluate("() => __nes.step(70)")
        t = page.evaluate("() => GAME.state().s.trials")
        out.append((go, k % 2 == 0, t[-1][0], pal[2] == col['c'], mk))
        page.evaluate(JS_TO_WAIT)
    exp = {(1, True): 'ok', (0, True): 'err', (1, False): 'miss', (0, False): 'rej'}
    ok('COLOR：目標按 = OK、干擾按 = ERR、目標不按 = MISS、干擾忍住 = OK HOLD', all(exp[(o[0], o[1])] == o[2] for o in out), out)
    ok('COLOR：燈色 = 該色 NES 調色盤值、中央形狀標記 = 該色的形狀', all(o[3] and o[4] for o in out), out)

    # ---------------- ARROW ----------------
    fresh(page, '&bot=1&lag=14')
    page.evaluate("() => CT.Reflex.dev.start('ARROW')")
    r = page.evaluate("""() => { const seen = [], ml = [0]; let over0 = __nes.stats().budget.overFrames;
        for (let i = 0; i < 6000 && GAME.state().s.mode === 'play'; i++) { __nes.step(1); const st = __nes.stats(); if (st.maxSpritesLine > ml[0]) ml[0] = st.maxSpritesLine;
          const s = GAME.state().s; if (s.ph === 'stim' && (!seen.length || seen[seen.length - 1].id !== s.stimId)) seen.push({ id: s.stimId, k: s.trials.length, ...s.stim }); }
        return { seen, ml: ml[0], over: __nes.stats().budget.overFrames - over0, s: GAME.state().s }; }""")
    lv1 = [x for x in r['seen'] if x['k'] < 5]
    lv2 = [x for x in r['seen'] if 5 <= x['k'] < 10]
    lv3 = [x for x in r['seen'] if x['k'] >= 10]
    ok('ARROW 第 1 級：箭頭都在中央', lv1 and all(x['pos'] == -1 for x in lv1), [x['pos'] for x in lv1])
    ok('ARROW 第 2 級：出現在上下左右，且多數與方向衝突', lv2 and all(x['pos'] >= 0 for x in lv2) and sum(1 for x in lv2 if x['pos'] != x['dir']) >= 3, [(x['pos'], x['dir']) for x in lv2])
    ok('ARROW 第 3 級：有空心反向箭頭（want = 反方向）', any(x['hollow'] and x['want'] == [1, 0, 3, 2][x['dir']] for x in lv3), [(x['dir'], x['hollow'], x['want']) for x in lv3])
    ok('ARROW 機器人（lag 14）15 次全對、每線 ≤ 8、overFrames 0', r['s']['mode'] == 'result' and r['s']['errs'] == 0 and len(r['s']['trials']) == 15 and r['ml'] <= 8 and r['over'] == 0, (r['s']['mode'], r['s']['errs'], r['ml'], r['over']))

    # ---------------- 機器人：人類反應延遲 vs goal 門檻 ----------------
    def bot_goal(lag, mode='SIMPLE'):
        page.goto(BASE + '&bot=1&lag=%d' % lag)
        page.wait_for_function('() => !!window.CT && !!CT.Reflex && !!CT.Reflex.dev')
        page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.reflex.")).forEach(k => localStorage.removeItem(k)); }')
        return page.evaluate("""(mode) => { if (mode !== 'SIMPLE') CT.Reflex.dev.start(mode); let ml = 0, over0 = __nes.stats().budget.overFrames, peak = 0, f = 0;
            for (; f < 4000; f++) { __nes.step(1); const st = __nes.stats(); if (st.maxSpritesLine > ml) ml = st.maxSpritesLine; if (st.budget.peak > peak) peak = st.budget.peak;
              const s = GAME.state(); if (s.goal || s.s.mode === 'result') break; }
            return { f, ml, over: __nes.stats().budget.overFrames - over0, peak, goal: GAME.state().goal, s: GAME.state().s }; }""", mode)

    g18 = bot_goal(18)
    ok('goal：機器人從標題選 SIMPLE、延遲 18 幀 ⇒ 平均 18 幀（300 ms）≤ 24、0 偷跑', g18['goal'] and g18['s']['avg'] == 18 and g18['s']['falses'] == 0, (g18['f'], g18['s']['avg'], g18['s']['falses']))
    ok('goal 那一局：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', g18['ml'] <= 8 and g18['over'] == 0 and g18['peak'] <= 160, (g18['ml'], g18['over'], g18['peak']))
    g12 = bot_goal(12)
    ok('延遲 12 幀 ⇒ 平均 200 ms，goal 達成（稱號 PULSAR）', g12['goal'] and g12['s']['avg'] == 12, (g12['s']['avg'], g12['s']['title']))
    g24 = bot_goal(24)
    ok('延遲 24 幀 ⇒ 平均 400 ms = 門檻，goal 達成（qa-r8 P2-3：門檻 24 幀）', g24['goal'] and g24['s']['avg'] == 24, (g24['s']['avg'], g24['goal']))
    g26 = bot_goal(26)
    ok('延遲 26 幀 ⇒ 平均 433 ms > 400 ms，goal 不成立', not g26['goal'] and g26['s']['avg'] == 26 and g26['s']['mode'] == 'result', (g26['s']['avg'], g26['goal']))
    g0 = bot_goal(0)
    ok('延遲 0 幀（下一幀就按 = 1 幀）⇒ 被判 ANTICIPATION 偷跑，goal 不成立（人類不可能 < 100 ms）', not g0['goal'] and g0['s']['falses'] >= 5, (g0['s']['falses'], g0['s']['trials']))
    for m in ('CHOICE', 'COLOR'):
        v = bot_goal(18, m)
        ok('%s 機器人（lag 18）完成：0 錯、每線 ≤ 8、over 0' % m, v['s']['mode'] == 'result' and v['s']['errs'] == 0 and v['s']['misses'] == 0 and v['ml'] <= 8 and v['over'] == 0,
           (v['s']['mode'], v['s']['avg'], v['s']['errs'], v['s']['misses'], v['s']['rej'], v['ml'], v['over']))

    # ---------------- 偷跑容許：2 次 OK、3 次不行 ----------------
    def falses_run(nf):
        page.goto(BASE)
        page.wait_for_function('() => !!window.CT && !!CT.Reflex && !!CT.Reflex.dev')
        return page.evaluate("""(nf) => { CT.Reflex.dev.resetSess(); CT.Reflex.dev.start('SIMPLE'); __nes.step(15); __nes.tap('a', 1); __nes.step(1); let f = 0;
            for (let k = 0; k < 40 && GAME.state().s.mode === 'play'; k++) { for (let i = 0; i < 400; i++) { const s = GAME.state().s; if (s.ph === 'wait' || s.mode !== 'play') break; __nes.step(1); }
              if (GAME.state().s.mode !== 'play') break;
              if (f < nf) { __nes.step(3); __nes.tap('a', 1); f++; continue; }
              for (let i = 0; i < 400; i++) { const s = GAME.state().s; if (s.ph === 'stim') break; __nes.step(1); } __nes.step(19); __nes.tap('a', 1); __nes.step(1); }
            for (let i = 0; i < 120 && GAME.state().s.mode === 'play'; i++) __nes.step(1); const s = GAME.state(); return { goal: s.goal, falses: s.s.falses, avg: s.s.avg, n: s.s.n }; }""", nf)
    f2, f3 = falses_run(2), falses_run(3)
    ok('P2-3 偷跑 2 次 + 平均 20 幀 ⇒ goal 達成；偷跑 3 次 ⇒ 不成立', f2['goal'] and f2['falses'] == 2 and not f3['goal'] and f3['falses'] == 3, (f2, f3))

    # ---------------- 真人模型（qa-r8 P2-3）：單局過關率，舊門檻 vs 新門檻 ----------------
    K = page.evaluate("() => ({ avg: CT.Reflex.GOAL_AVG, f: CT.Reflex.GOAL_FALSE, n: CT.Reflex.CFG.SIMPLE.n, a: CT.Reflex.ANTICIP, to: CT.Reflex.CFG.SIMPLE.to })")
    ok('goal 常數：平均 ≤ 24 幀、偷跑 ≤ 2', K['avg'] == 24 and K['f'] == 2, K)
    if QUICK:
        print('  SKIP（NES_QUICK）真人模型蒙地卡羅 + 真人濾鏡實跑 8 局')
    else:
        rates = {}
        for name, mu, sd, tau, sysl in PROFILES:
            old = human_mc((mu, sd, tau, sysl), 20, 0, K['n'], K['a'], K['to'])
            new = human_mc((mu, sd, tau, sysl), K['avg'], K['f'], K['n'], K['a'], K['to'])
            rates[name] = (old, new)
        print('  [真人模型 reflex 單局過關率 %%：舊 → 新] %s' % ', '.join('%s %s→%s' % (k, v[0], v[1]) for k, v in rates.items()))
        ok('真人模型：20 / 40 代鍵盤、20 代 iPhone 單局過關率 ≥ 90%（舊門檻 ≤ 75%）',
           all(rates[k][1] >= 90 for k in ('20 代鍵盤', '40 代鍵盤', '20 代 iPhone')) and all(rates[k][0] <= 75 for k in ('20 代鍵盤', '40 代鍵盤', '20 代 iPhone')), rates)
        ok('真人模型：40 代 iPhone ≥ 75%、60 代鍵盤 3 局內過關 ≥ 90%（門檻仍有意義：60 代單局 < 80%）',
           rates['40 代 iPhone'][1] >= 75 and 1 - (1 - rates['60 代鍵盤'][1] / 100) ** 3 >= 0.9 and rates['60 代鍵盤'][1] < 80, rates)
        # 真人濾鏡：40 代鍵盤 ≈ 機器人 lag 12 + N(7.4, 3.4)（平均 ≈ 19.4 幀 ≈ 323 ms），實跑 8 局
        page.goto(BASE + '&bot=1&lag=12')
        page.wait_for_function('() => !!window.CT && !!CT.Reflex && !!CT.Reflex.dev && !!CT.current')
        page.add_script_tag(path=str(HUMAN_JS))
        page.evaluate("""() => __humInstall({ mj: 7.4, sj: 3.4, groups: {}, swWin: 0, sw0: 0, sw1: 0, refr: 0, lapse: 0.03, lapseF: 18, seed: 5,
            on: () => CT.Reflex.dev.g().mode === 'play' })""")
        hv = page.evaluate("""() => { const out = []; for (let k = 0; k < 8; k++) { CT.Reflex.dev.resetSess(); CT.Reflex.dev.setLag(12); CT.Reflex.dev.start('SIMPLE');
              for (let f = 0; f < 3000; f++) { __nes.step(1); if (GAME.state().s.mode === 'result') break; } const s = GAME.state(); out.push([s.goal, s.s.avg, s.s.falses]); }
            return out; }""")
        print('  [真人濾鏡 reflex 40 代鍵盤模型 8 局] %s' % hv)
        ok('真人濾鏡：40 代鍵盤模型實跑 8 局 ≥ 7 局 goal（平均 ≈ 19~21 幀）', sum(1 for x in hv if x[0]) >= 7, hv)

    ok('全程無頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for x in results if x[0])
    print('test_reflex: %d/%d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
