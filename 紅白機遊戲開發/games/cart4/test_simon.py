# -*- coding: utf-8 -*-
"""《星塵跟我做 STAR ECHO》（cart4 槽 2，id = simon）自動驗證。

重點：四顆星標形狀 / 音高 / 音色兩兩不同、展示時的視覺提示（調色盤亮燈）與聲音（p1 鍵音）、EAR 不亮 / EYE 不響、
      遊玩 BGM 只用 tri + noi ⇒ 鍵音與 BGM 同時存在不搶聲道、READY 倒數、輸入對錯 / 逾時 MISS / 同串重放、
      重看一次（扣分不扣命、每回合一次）、倒著輸入、8 鍵（B + 方向）、暫停 BGM、密技（遊玩 +1 命 / 結束原地續關 /
      標題無效 / goal 失效）、§6 規則、機器人只讀畫面 / 聲音（延遲 0 / 14 / 24 幀都過 goal；EAR 純聽音也過 8 步）、
      每線 ≤ 8 精靈、overFrames 0。
作法：Playwright 開 `cart4.html?game=simon&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Simon.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_simon.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=simon'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
DIRS = [UP, RIGHT, DOWN, LEFT]


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Simon && !!CT.Simon.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.simon.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def start(page, mode=0, seed=77):
    page.evaluate('([m, s]) => { CT.Simon.dev.start(m, s); __nes.step(1); }', [mode, seed])


def until(page, phase, n=2000):
    return page.evaluate('([p, n]) => { for (let i = 0; i < n; i++) { if (GAME.state().s.phase === p) return i; __nes.step(1); } return -1; }', [phase, n])


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, maxLen: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const st = GAME.state().s; r.maxLen = Math.max(r.maxLen, st.maxDone | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
    if (o.until === 'len' && st.maxDone >= o.len) break;
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
    reg = page.evaluate("""() => { const g = CT.get('simon'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id simon / order 2 / title 星塵跟我做 / legacy 4 款', reg and reg['id'] == 'simon' and reg['order'] == 2 and reg['title'] == '星塵跟我做' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 6 字元（00STEP）', reg['bestText'] == '00STEP' and len(reg['bestText']) == 6, reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Simon.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Simon.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Simon.Audio.SONGS), sfx: Object.keys(CT.Simon.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 simon_ 前綴', len(au['songs']) >= 4 and len(au['sfx']) >= 4 and all(k.startswith('simon_') for k in au['songs'] + au['sfx']), au)
    ok('5 個模式：classic / ear / eye / reverse / octet', page.evaluate("() => CT.Simon.MODES.map(m => m.id).join(',')") == 'classic,ear,eye,reverse,octet')

    # 四顆星標：形狀兩兩不同、不是實心方塊、四色相不同
    sh = page.evaluate("""() => { const out = []; for (let k = 0; k < 4; k++) { const px = CT.Simon.shapePx(k, 48); let key = '', fill = 0;
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const v = px[y][x] ? 1 : 0; key += v; fill += v; } out.push({ key, fill: fill / 2304 }); } return out; }""")
    diffs = [sum(1 for i in range(2304) if sh[a_]['key'][i] != sh[b_]['key'][i]) for a_ in range(4) for b_ in range(a_ + 1, 4)]
    ok('四顆星標輪廓兩兩不同（每對 ≥ 300 像素差）、都不是方塊（填滿 20~65%）', min(diffs) >= 300 and all(0.2 <= x['fill'] <= 0.65 for x in sh), (min(diffs), [round(x['fill'], 2) for x in sh]))
    hues = page.evaluate("() => CT.Simon.LIT.map(p => p[1] & 15)")
    ok('四顆亮燈色相兩兩不同（青 / 金 / 洋紅 / 綠，不是紅綠藍黃四色組）', len(set(hues)) == 4 and 0x06 not in hues and 0x01 not in hues, hues)

    # 鍵音：音高兩兩不同、各組內 下 < 左 < 右 < 上、四方向音色不同、第二組有八度閃爍
    keys = page.evaluate("() => CT.Simon.Audio.KEYS")
    mid = [k['midi'] for k in keys]
    ok('8 個鍵音音高兩兩不同', len(set(mid)) == 8, mid)
    ok('音高順序 ↓ < ← < → < ↑（兩組都是）', all(mid[g + 2] < mid[g + 3] < mid[g + 1] < mid[g + 0] for g in (0, 4)), mid)
    ok('四方向音色（占空比 + 包絡）兩兩不同、第二組加八度閃爍', len(set((k['duty'], k['kind']) for k in keys[:4])) == 4 and all(k.get('shimmer') for k in keys[4:]) and not any(k.get('shimmer') for k in keys[:4]), [(k['duty'], k['kind']) for k in keys])
    fr = page.evaluate("() => CT.Simon.Audio.toneFrames(4, 20).filter(f => f.note).map(f => f.note)")
    ok('第二組鍵音逐幀在本音與高八度間切換（G#5 / G#6）', 'G#5' in fr and 'G#6' in fr, fr[:6])
    play = page.evaluate("() => { const s = CT.Simon.Audio.SONGS.simon_play; const ch = {}; s.patterns.forEach(p => Object.keys(p).forEach(k => { if (p[k].some(r => r)) ch[k] = 1; })); return Object.keys(ch).sort(); }")
    ok('遊玩 BGM 只用 tri + noi（p1 留給鍵音、p2 留給系統音效）', play == ['noi', 'tri'], play)

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Simon.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-()') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    ok('標題有十字鍵對照（UP STAR / RIGHT MOON / LEFT COMET / DOWN PLANET / B+DIR）', all(w in txt for w in ['UP    STAR', 'RIGHT MOON', 'LEFT  COMET', 'DOWN  PLANET', 'B+DIR']))
    page.evaluate('() => CT.cheat()')
    ok('§6-1 標題按密技無效', S(page)['mode'] == 'title' and S(page)['cheats'] == 0)

    # ---------------- READY 倒數 + 展示 ----------------
    start(page, 0, 31)
    c = page.evaluate('() => CT.Simon.dev.consts')
    tap(page, UP)
    st = S(page)
    ok('開局 READY 倒數（%d 幀），期間按鍵無效' % c['READY_F'], st['phase'] == 'ready' and st['pos'] == 0 and st['lives'] == 3, st['phase'])
    ok('展示節奏表（幀）：1~5 步 30+12、6~9 步 24+10、10~13 步 19+8、14+ 步 15+7', page.evaluate('() => [1,6,10,14].map(n => CT.Simon.dev.timing(n).join("+")).join(",")') == '30+12,24+10,19+8,15+7')
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    st = S(page)
    vis = page.evaluate('() => CT.Simon.dev.seeLit()')
    ms = page.evaluate('() => __nes.nes().music.state()')
    seq0 = page.evaluate('() => CT.Simon.dev.seq()')
    ok('經典展示：畫面上那顆的調色盤亮起（= 序列第 1 顆）', vis == seq0[0] and st['lit'] == seq0[0], (vis, seq0))
    ok('鍵音與 BGM 共存：p1 被 simon_k* 佔用，同時 BGM（tri）照常在播', (ms['channels'][0]['owner'] or '').startswith('simon_k') and ms['playing'] and ms['channels'][2]['on'], (ms['channels'][0]['owner'], ms['playing']))
    r0 = ms['rowsPlayed']
    page.evaluate('() => __nes.step(40)')
    ok('展示期間 BGM 的 row 持續前進（沒被鍵音打斷）', page.evaluate('() => __nes.nes().music.state().rowsPlayed') > r0)

    # 輸入：對 → 過關；錯 → MISS 扣命、同一串重放
    until(page, 'input')
    tap(page, DIRS[seq0[0]], 20)
    st = S(page)
    ok('按對 → 本回合完成（GOOD），長度 +1 進下一回合', st['phase'] in ('good', 'intro') and st['maxDone'] == 1, (st['phase'], st['maxDone']))
    until(page, 'input')
    seq = page.evaluate('() => CT.Simon.dev.seq()')
    wrong = (seq[0] + 1) % 4
    tap(page, DIRS[wrong], 2)
    st = S(page)
    ok('按錯 → MISS、命 −1、亮出正確那顆', st['phase'] == 'miss' and st['lives'] == 2 and st['misses'] == 1, (st['phase'], st['lives']))
    until(page, 'intro', 400)
    ok('MISS 後同一串（同長度）重放', S(page)['len'] == 2 and page.evaluate('() => CT.Simon.dev.seq()') == seq)
    until(page, 'input')
    n = page.evaluate('() => { let i = 0; while (GAME.state().s.phase === "input" && i < 500) { __nes.step(1); i++; } return i; }')
    ok('輸入 6 秒（%d 幀）沒按 → MISS' % c['INPUT_TIMEOUT'], S(page)['phase'] == 'miss' and abs(n - c['INPUT_TIMEOUT']) <= 2, n)

    # 重看一次
    until(page, 'input', 600)
    sc0 = S(page)['score']
    tap(page, B, 2)
    st = S(page)
    ok('輸入中按 B → 重看一次（回到展示、扣分不扣命）', st['phase'] in ('intro', 'show') and st['replayUsed'] and st['lives'] == 1 and st['score'] <= sc0, (st['phase'], st['lives'], sc0, st['score']))
    until(page, 'input')
    tap(page, SELECT, 2)
    ok('同一回合第二次重看無效', S(page)['phase'] == 'input' and S(page)['replays'] == 1)

    # 暫停
    tap(page, START)
    st = S(page)
    ok('§6-2 START 暫停：paused + BGM 暫停', st['paused'] and page.evaluate('() => CT.Simon.Audio.isPaused()'))
    p0 = st['pos']
    tap(page, DIRS[seq[0]])
    ok('暫停中按方向無效', S(page)['pos'] == p0)
    tap(page, START)
    ok('解除暫停：BGM 從暫停處接續', not S(page)['paused'] and not page.evaluate('() => CT.Simon.Audio.isPaused()') and S(page)['music'] == 'simon_play')

    # 密技
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 遊玩中密技 = 命 +1，goal 失效', st['lives'] == 2 and st['cheats'] == 1 and not page.evaluate('() => GAME.state().goal'))
    page.evaluate('() => { for (let k = 0; k < 6 && GAME.state().s.phase !== "over"; k++) { let i = 0; while (GAME.state().s.phase !== "input" && i < 900) { __nes.step(1); i++; } const s = CT.Simon.dev.seq(); const e = CT.Simon.dev.expect(); NES.Input.inject([16,128,32,64][(e + 1) % 4], 1); __nes.step(2); let j = 0; while (GAME.state().s.phase === "miss" && j < 200) { __nes.step(1); j++; } } }')
    st = S(page)
    ok('命用完 → GAME OVER + 結束曲', st['phase'] == 'over' and st['music'] == 'simon_over', (st['phase'], st['lives']))
    len0 = st['len']
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 GAME OVER 按密技 = 原地續關（同步數、命補 3）', st['phase'] == 'intro' and st['len'] == len0 and st['lives'] == 3 and st['continues'] == 1, (st['phase'], st['len'], st['lives']))

    # 倒著輸入 / 8 鍵
    start(page, 3, 41)
    page.evaluate('() => CT.Simon.dev.setLen(3)')
    until(page, 'input')
    sq3 = page.evaluate('() => CT.Simon.dev.seq()')
    ok('REVERSE：第一個要按的是最後一顆', page.evaluate('() => CT.Simon.dev.expect()') == sq3[-1], sq3)
    for k in reversed(sq3):
        tap(page, DIRS[k], 3)
    page.evaluate('() => __nes.step(20)')
    ok('REVERSE：倒著按完 = 過關', S(page)['maxDone'] == 3, S(page)['maxDone'])
    start(page, 4, 43)
    sq8 = page.evaluate('() => CT.Simon.makeSeq(43, 8)')
    ok('OCTET 序列用到第二組（k ≥ 4）', any(k >= 4 for k in sq8[:20]), sq8[:12])
    until(page, 'input')
    k0 = page.evaluate('() => CT.Simon.dev.expect()')
    if k0 >= 4:
        page.evaluate('(d) => { NES.Input.inject(2, 1); __nes.step(1); NES.Input.inject(2 | d, 1); __nes.step(1); __nes.step(20); }', DIRS[k0 & 3])
    else:
        tap(page, DIRS[k0], 20)
    ok('OCTET：按住 B + 方向 = 第二組、只按方向 = 第一組（第 1 顆 k=%d 答對）' % k0, S(page)['maxDone'] == 1 and S(page)['lastTone'] == k0, (S(page)['maxDone'], S(page)['lastTone']))

    # EAR：展示時不亮燈但有聲音；EYE：亮燈但沒聲音
    start(page, 1, 51)
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    ok('EAR：展示時畫面不亮（四顆都 dim），但 p1 正在發鍵音', page.evaluate('() => CT.Simon.dev.seeLit()') == -1 and page.evaluate('() => CT.Simon.dev.hear()') == page.evaluate('() => CT.Simon.dev.seq()[0]'))
    start(page, 2, 52)
    t0 = S(page)['toneCount']
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    ok('EYE：展示時亮燈，但整局不發鍵音', page.evaluate('() => CT.Simon.dev.seeLit()') == page.evaluate('() => CT.Simon.dev.seq()[0]') and S(page)['toneCount'] == t0)

    # §6-3 exit 存最高分
    start(page, 0, 61)
    page.evaluate('() => CT.Simon.dev.setLen(7)')
    until(page, 'input')
    for k in page.evaluate('() => CT.Simon.dev.seq()'):
        tap(page, DIRS[k], 3)
    page.evaluate('() => { __nes.step(20); CT.get("simon").exit(__nes.nes()); }')
    ok('§6-3 exit() 存最高步數 + bestText 07STEP', page.evaluate('() => CT.load("simon", "best", 0)') == 7 and page.evaluate('() => CT.get("simon").bestText()') == '07STEP')

    # ---------------- 機器人（只讀畫面 / 聲音） ----------------
    for lag, lim in ((14, 9000), (0, 9000), (24, 11000)):
        fresh(page, '&bot=1&seed=21&lag=%d' % lag)
        page.evaluate('() => CT.Simon.dev.guard(true)')
        r = page.evaluate(RUN, {'n': lim, 'until': 'goal'})
        r['reads'] = page.evaluate('() => CT.Simon.dev.guardReads()')
        ok('機器人（延遲 %d 幀）：%d 幀內經典 15 步 goal（%d 幀）' % (lag, lim, r['f']), r['goal'] and r['s']['cheats'] == 0 and r['s']['misses'] == 0 and r['s']['replays'] == 0, (r['f'], r['s']['maxDone']))
        if lag == 14:
            ok('防偷看：隱藏答案包成 Proxy，bot() 期間讀取 0 次', r['reads'] == 0, r['reads'])
            ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
    for mode, name in ((1, 'EAR（純聽音高辨位）'), (3, 'REVERSE'), (4, 'OCTET')):
        fresh(page, '&bot=1&seed=33&mode=%d' % mode)
        r = page.evaluate(RUN, {'n': 6000, 'until': 'len', 'len': 8})
        ok('機器人 %s：0 失誤完成 8 步' % name, r['s']['maxDone'] >= 8 and r['s']['misses'] == 0 and r['ml'] <= 8 and r['over'] == 0, (r['f'], r['s']['maxDone'], r['s']['misses']))

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_simon: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
