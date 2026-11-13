# -*- coding: utf-8 -*-
"""《星塵旋律 STAR MELODY》（cart4 槽 4，id = tune）自動驗證。

重點：8 音鍵盤（十字鍵 + 按住 B）與對照圖、原創旋律產生器（音域 / 級進 / 收主音 / seed 可重現）、
      題目曲與畫面同步（亮鍵 / 時間軸由 driver row 推回）、節奏判定窗口（幀）、對錯 / 逾時 / 重聽、
      HIGH-LOW 與 ODD NOTE 兩個模式、HINT OFF（只靠聲音）、輸入時鍵音（p1）與節拍器 BGM（tri + noi）共存、
      暫停、密技、§6 規則、機器人只讀畫面 / 聲音（延遲 0 / 14 / 24 都過 goal）、每線 ≤ 8、overFrames 0。
作法：Playwright 開 `cart4.html?game=tune&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Tune.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_tune.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=tune'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
KEYDIR = [LEFT, DOWN, UP, RIGHT]


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Tune && !!CT.Tune.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.tune.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def key(page, k, after=2):
    """彈第 k 鍵（k ≥ 4 先按住 B 一幀）。"""
    page.evaluate('([k, d, a]) => { if (k >= 4) { NES.Input.inject(2, 1); __nes.step(1); NES.Input.inject(2 | d, 1); } else NES.Input.inject(d, 1); __nes.step(1); __nes.step(a); }', [k, KEYDIR[k & 3], after])


def start(page, mode=0, seed=77, hint=True):
    page.evaluate('([m, s, h]) => { CT.Tune.dev.start(m, s, h); __nes.step(1); }', [mode, seed, hint])


def until(page, phase, n=3000):
    return page.evaluate('([p, n]) => { for (let i = 0; i < n; i++) { if (GAME.state().s.phase === p) return i; __nes.step(1); } return -1; }', [phase, n])


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
    if (o.until === 'lv' && GAME.state().s.lvDone >= o.lv) break;
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
    reg = page.evaluate("""() => { const g = CT.get('tune'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id tune / order 4 / title 星塵旋律 / legacy 2 款', reg and reg['id'] == 'tune' and reg['order'] == 4 and reg['title'] == '星塵旋律' and len(reg['legacy']) == 2, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（  LV00）', reg['bestText'] == '  LV00', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Tune.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Tune.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Tune.Audio.SONGS), sfx: Object.keys(CT.Tune.Audio.SFX) })")
    ok('BGM ≥ 1（5 首）、音效 ≥ 4，全部 tune_ 前綴', len(au['songs']) >= 5 and len(au['sfx']) >= 4 and all(k.startswith('tune_') for k in au['songs'] + au['sfx']), au)
    ok('3 個模式：replay / highlow / odd', page.evaluate("() => CT.Tune.MODES.map(m => m.id).join(',')") == 'replay,highlow,odd')
    lv = page.evaluate('() => CT.Tune.LEVELS')
    ok('REPLAY 8 級：音數遞增 3→8、音域 DO-MI → 全 8 音、第 5 級起要對節奏、速度遞增',
       len(lv) == 8 and all(lv[i]['n'] <= lv[i + 1]['n'] and lv[i]['hi'] <= lv[i + 1]['hi'] and lv[i]['U'] >= lv[i + 1]['U'] for i in range(7))
       and lv[0]['n'] == 3 and lv[7]['n'] == 8 and lv[0]['hi'] == 2 and [x['rh'] for x in lv] == [False] * 4 + [True] * 4, [(x['n'], x['hi'], x['rh'], x['U']) for x in lv])
    hl = page.evaluate('() => CT.Tune.HL_LV.map(x => x.hi)')
    ok('HIGH-LOW 音程逐級縮小到半音', hl[0] >= 7 and hl[-1] == 1 and all(hl[i] >= hl[i + 1] for i in range(7)), hl)
    sc = page.evaluate('() => CT.Tune.Audio.SCALE')
    ok('8 音 = C 大調 C5..C6，兩兩不同、由低到高', sc == [72, 74, 76, 77, 79, 81, 83, 84], sc)
    ch = page.evaluate("""() => { const A = CT.Tune.Audio, o = {};
        for (const k in A.SFX) o[k] = Object.keys(A.SFX[k].data).join('+');
        const beat = A.SONGS.tune_beat, used = {}; beat.patterns.forEach(p => Object.keys(p).forEach(t => { if (p[t].some(r => r)) used[t] = 1; }));
        return { sfx: o, beat: Object.keys(used).sort() }; }""")
    ok('聲道分工：琴鍵音 tune_k0..7 只走 p1、系統音效走 p2（/ noi），節拍器 BGM 只用 tri + noi',
       all(ch['sfx']['tune_k%d' % i] == 'p1' for i in range(8)) and all('p1' not in v for k, v in ch['sfx'].items() if not k.startswith('tune_k')) and ch['beat'] == ['noi', 'tri'], ch)

    # 原創旋律產生器
    mel = page.evaluate("""() => { const out = { bad: 0, ends: 0, steps: 0, total: 0, same: true };
        for (let s = 1; s <= 400; s++) { const L = CT.Tune.LEVELS[s % 8]; const m = CT.Tune.genMelody(L.n, L.hi, L.rh, s * 7919);
          if (m.length !== L.n || m.some(x => x.k < 0 || x.k > L.hi)) out.bad++;
          if ([0, 4, 7].indexOf(m[m.length - 1].k) >= 0) out.ends++;
          for (let i = 1; i < m.length; i++) { out.total++; if (Math.abs(m[i].k - m[i - 1].k) <= 2) out.steps++; }
          if (L.rh && m.reduce((a, b) => a + b.dur, 0) > 24) out.bad++; }
        const a = JSON.stringify(CT.Tune.genMelody(6, 7, true, 1234)), b = JSON.stringify(CT.Tune.genMelody(6, 7, true, 1234));
        out.same = a === b; return out; }""")
    ok('旋律產生器：400 句都在音域內、節奏型總長 ≤ 24 單位、全部收在 DO/SO/高 DO', mel['bad'] == 0 and mel['ends'] == 400, mel)
    ok('旋律產生器：級進（≤ 2 級）為主（> 60%）、同 seed 可重現', mel['steps'] / mel['total'] > 0.6 and mel['same'], (mel['steps'], mel['total']))

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Tune.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-()') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 / §6-6 標題寫著 HOLD START+SELECT: MENU 與 C/★ = CHEAT', 'HOLD START+SELECT: MENU' in txt and 'C/$ = CHEAT' in txt)
    ok('標題有鍵盤對照圖：8 個唱名 + B=HOLD', all(w in txt for w in ['DO', 'RE', 'MI', 'FA', 'SO', 'LA', 'TI', 'B=HOLD']))
    page.evaluate('() => CT.cheat()')
    ok('§6-1 標題按密技無效', S(page)['mode'] == 'title' and S(page)['cheats'] == 0)
    tap(page, RIGHT)
    ok('標題 ←→ 切換 HINT ON / OFF', S(page)['hint'] is False)
    tap(page, LEFT)

    # ---------------- READY + 聽 ----------------
    start(page, 0, 31)
    c = page.evaluate('() => CT.Tune.dev.consts')
    key(page, 0)
    ok('開局 READY 倒數（%d 幀），期間按鍵無效' % c['READY_F'], S(page)['phase'] == 'ready' and S(page)['entered'] == 0)
    until(page, 'listen')
    page.evaluate('() => { let i = 0; while (CT.Tune.dev.sounding() < 0 && i < 300) { __nes.step(1); i++; } __nes.step(2); }')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    si = page.evaluate('() => CT.Tune.dev.sounding()')
    pos = page.evaluate('() => __nes.nes().music.state()')
    ok('同步：正在響的音由 driver row 推回（row %d 落在第 %d 個音的區間）' % (pos['row'], si), si == 0 and cur['events'][0]['row'] <= pos['row'] < cur['events'][0]['row'] + cur['events'][0]['dur'])
    ok('視覺提示：響的那個音，畫面上那根星鐘管亮（屬性表 = 亮調色盤）', page.evaluate('() => CT.Tune.dev.seeKey()') == cur['notes'][0]['k'], (page.evaluate('() => CT.Tune.dev.seeKey()'), cur['notes'][0]))
    ok('聲音：APU 方波 1 的實際音高 = 該鍵音高', page.evaluate('() => CT.Tune.dev.hear()') == cur['notes'][0]['midi'])
    until(page, 'input')
    ok('聽完自動進入輸入，換成節拍器 BGM（tune_beat）', S(page)['music'] == 'tune_beat')

    # 輸入：對 → 過；錯 → MISS
    for nt in cur['notes']:
        key(page, nt['k'], 6)
    ms = page.evaluate('() => __nes.nes().music.state()')
    page.evaluate('() => __nes.step(20)')
    ok('照音彈對 → 這題過（GOOD）、Q 前進', S(page)['phase'] == 'good' and S(page)['q'] == 1, (S(page)['phase'], S(page)['msg']))
    until(page, 'input')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    key(page, cur['notes'][0]['k'], 0)
    ms = page.evaluate('() => __nes.nes().music.state()')
    ok('鍵音與 BGM 共存：p1 由 tune_k* 佔用、節拍器 BGM 仍在播（tri / noi 沒被搶）', (ms['channels'][0]['owner'] or '').startswith('tune_k') and ms['playing'] and not ms['channels'][2]['owned'] and not ms['channels'][3]['owned'], ms['channels'][0]['owner'])
    page.evaluate('() => __nes.step(8)')
    wrong = (cur['notes'][1]['k'] + 1) % 3
    key(page, wrong, 2)
    st = S(page)
    ok('彈錯音 → MISS、命 −1', st['phase'] == 'miss' and st['lives'] == 2, (st['phase'], st['lives'], st['msg']))
    until(page, 'prep', 400)
    ok('MISS 後同一題重聽（旋律不變）', page.evaluate('() => CT.Tune.dev.cur().notes') == cur['notes'])
    until(page, 'input')
    n = page.evaluate('() => { let i = 0; while (GAME.state().s.phase === "input" && i < 700) { __nes.step(1); i++; } return i; }')
    ok('輸入 %d 幀（8 秒）沒彈 → TIME UP' % c['INPUT_TIMEOUT'], S(page)['phase'] == 'miss' and abs(n - c['INPUT_TIMEOUT']) <= 2, n)
    until(page, 'input', 800)
    tap(page, SELECT)
    st = S(page)
    ok('SELECT = 再聽一次（扣分不扣命，回到聽）', st['phase'] in ('prep', 'listen') and st['againUsed'] and st['lives'] == 1, (st['phase'], st['lives']))
    until(page, 'input')
    tap(page, SELECT)
    ok('同一題第二次再聽無效', S(page)['phase'] == 'input' and S(page)['agains'] == 1)

    # 暫停
    tap(page, START)
    ok('§6-2 START 暫停：paused + BGM 暫停', S(page)['paused'] and page.evaluate('() => CT.Tune.Audio.isPaused()'))
    e0 = S(page)['entered']
    key(page, 0)
    ok('暫停中彈鍵無效', S(page)['entered'] == e0)
    tap(page, START)
    ok('解除暫停：BGM 從暫停處接續', not S(page)['paused'] and not page.evaluate('() => CT.Tune.Audio.isPaused()'))

    # 密技
    page.evaluate('() => CT.cheat()')
    ok('§6-1 遊玩中密技 = 命 +1，goal 失效', S(page)['lives'] == 2 and S(page)['cheats'] == 1 and not page.evaluate('() => GAME.state().goal'))
    page.evaluate('() => { for (let k = 0; k < 5 && GAME.state().s.phase !== "over"; k++) { let i = 0; while (GAME.state().s.phase !== "input" && i < 1500) { __nes.step(1); i++; } const c = CT.Tune.dev.cur(); NES.Input.inject(c.notes[0].k === 0 ? 32 : 64, 1); __nes.step(2); let j = 0; while (GAME.state().s.phase === "miss" && j < 300) { __nes.step(1); j++; } } }')
    st = S(page)
    ok('命用完 → GAME OVER + 結束曲', st['phase'] == 'over' and st['music'] == 'tune_over', (st['phase'], st['lives']))
    lv0, q0 = st['lv'], st['q']
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 GAME OVER 按密技 = 原地續關（同級同題、命補 3）', st['phase'] == 'prep' and st['lv'] == lv0 and st['q'] == q0 and st['lives'] == 3 and st['continues'] == 1, (st['phase'], st['lv'], st['lives']))

    # 節奏判定（幀）
    jr = page.evaluate("""() => { const J = CT.Tune.judgeRhythm, n = [{dur:2},{dur:1},{dur:1},{dur:3},{dur:4}], U = 12;
        const exact = [0, 24, 36, 48, 84];
        const slow = exact.map(t => Math.round(t * 1.15));
        const jit = [0, 27, 37, 46, 87];
        const off = [0, 24, 46, 48, 84];
        const tooSlow = exact.map(t => Math.round(t * 1.6));
        return { exact: J(exact, n, U), slow: J(slow, n, U), jit: J(jit, n, U), off: J(off, n, U), tooSlow: J(tooSlow, n, U) }; }""")
    ok('節奏：完全對拍 = PERFECT（誤差 0 幀）', jr['exact']['ok'] and jr['exact']['perfect'], jr['exact'])
    ok('節奏：整體慢 15% 但比例對 = 過（先換算成玩家自己的速度）', jr['slow']['ok'], jr['slow'])
    ok('節奏：每個音距 ±3 幀以內 = 過且 PERFECT（≤ %d 幀）' % c['RH_PERFECT'], jr['jit']['ok'] and jr['jit']['perfect'], jr['jit'])
    ok('節奏：某個 12 幀的音距彈成 22 幀（超過 max(%d 幀, %d%%)）= RHYTHM OFF' % (c['RH_MIN'], int(c['RH_PCT'] * 100)), not jr['off']['ok'], jr['off'])
    ok('節奏：整體慢 60%（超出速度容許 0.8~1.25）= 不過', not jr['tooSlow']['ok'], jr['tooSlow'])

    # HIGH-LOW
    start(page, 1, 41)
    until(page, 'answer')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    ans = {'U': UP, 'D': DOWN, 'R': RIGHT}[cur['ans']]
    tap(page, ans, 2)
    ok('HIGH-LOW：答對（第 2 音%s）→ 過' % cur['ans'], S(page)['phase'] == 'good', (cur['m1'], cur['m2'], S(page)['msg']))
    until(page, 'answer')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    tap(page, RIGHT, 2)
    ok('HIGH-LOW 第 1 級沒有「一樣」選項：按 → 不算作答', S(page)['phase'] == 'answer' and not cur['m1'] == cur['m2'])
    tap(page, DOWN if cur['ans'] == 'U' else UP, 2)
    ok('HIGH-LOW：答錯 → MISS 並揭曉', S(page)['phase'] == 'miss' and S(page)['lives'] == 2)

    # ODD NOTE
    start(page, 2, 43)
    until(page, 'pick')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    diff = [i for i in range(len(cur['notes'])) if cur['notes'][i]['k'] != cur['notesB'][i]['k']]
    ok('ODD NOTE：第二段只有 1 個音不同、節奏相同', diff == [cur['odd']] and [x['dur'] for x in cur['notes']] == [x['dur'] for x in cur['notesB']], diff)
    for _ in range(cur['odd']):
        tap(page, RIGHT, 1)
    tap(page, A, 2)
    ok('ODD NOTE：←→ 移到被改的音按 A → 過', S(page)['phase'] == 'good' and S(page)['cursor'] == cur['odd'], S(page)['msg'])

    # HINT OFF：不亮燈但有聲音
    start(page, 0, 51, False)
    until(page, 'listen')
    page.evaluate('() => { let i = 0; while (CT.Tune.dev.sounding() < 0 && i < 300) { __nes.step(1); i++; } __nes.step(2); }')
    ok('HINT OFF：播放中星鐘管不亮、但 APU 正在響該音', page.evaluate('() => CT.Tune.dev.seeKey()') == -1 and page.evaluate('() => CT.Tune.dev.hear()') == page.evaluate('() => CT.Tune.dev.cur().notes[0].midi'))

    # 8 鍵：B + 方向
    start(page, 0, 61)
    page.evaluate('() => CT.Tune.dev.setLv(4)')
    until(page, 'input', 3000)
    key(page, 7, 2)
    ok('按住 B + → = 高 DO（第 8 鍵）', S(page)['lastKey'] == 7)
    until(page, 'input', 3000)
    key(page, 0, 2)
    ok('只按 ← = DO（第 1 鍵）', S(page)['lastKey'] == 0)

    # §6-3 exit
    start(page, 0, 71)
    page.evaluate('() => { CT.Tune.dev.setLv(3); }')
    page.evaluate('() => { const g = GAME.state().s; }')
    page.evaluate('() => { CT.get("tune").exit(__nes.nes()); }')
    ok('§6-3 exit() 存檔（未過級 = 0）', page.evaluate('() => CT.load("tune", "best", 0)') == 0)

    # ---------------- 機器人（只讀畫面 / 聲音） ----------------
    for lag, lim in ((14, 9000), (0, 9000), (24, 9000)):
        fresh(page, '&bot=1&seed=21&lag=%d' % lag)
        page.evaluate('() => CT.Tune.dev.guard(true)')
        r = page.evaluate(RUN, {'n': lim, 'until': 'goal'})
        r['reads'] = page.evaluate('() => CT.Tune.dev.guardReads()')
        ok('機器人（延遲 %d 幀）：%d 幀內 REPLAY 第 6 級過關 goal（%d 幀）' % (lag, lim, r['f']), r['goal'] and r['s']['cheats'] == 0 and r['s']['misses'] == 0 and r['s']['agains'] == 0, (r['f'], r['s']['lvDone'], r['s']['misses']))
        if lag == 14:
            ok('防偷看：隱藏答案包成 Proxy，bot() 期間讀取 0 次', r['reads'] == 0, r['reads'])
            ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
            page.evaluate('() => CT.get("tune").exit(__nes.nes())')
            ok('§6-3 exit() 存最高級 + bestText（  LV06）', page.evaluate('() => CT.get("tune").bestText()') == '  LV06')
    for q, name in (('mode=0&hint=0', 'REPLAY HINT OFF（純聽音）'), ('mode=1', 'HIGH-LOW（聽音高）'), ('mode=2', 'ODD NOTE（聽兩段比對）'), ('mode=1&hint=0', 'HIGH-LOW HINT OFF')):
        fresh(page, '&bot=1&seed=33&' + q)
        r = page.evaluate(RUN, {'n': 12000, 'until': 'lv', 'lv': 4})
        ok('機器人 %s：0 失誤過 4 級' % name, r['s']['lvDone'] >= 4 and r['s']['misses'] == 0 and r['ml'] <= 8 and r['over'] == 0, (r['f'], r['s']['lvDone'], r['s']['misses']))

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_tune: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
