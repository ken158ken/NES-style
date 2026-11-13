# -*- coding: utf-8 -*-
"""《星塵問答》（cart5，id = quiz）自動驗證。

重點：題庫（≥ 200 題、6 類 × 3 級每格 ≥ 12、四選一互不相同、題目不重複、版面放得下、用字放得進字形池、
      每個字都有字形、抽樣答案對照表）、心算產生器（8 級 × 400 題：整數、非負、運算式重算一致、除法整除）；
      契約 / §6（標題密技無效、暫停 BGM 停 + 題目藏起來、exit 存分、bestText 6 字元、backTile）；
      限時連答（打字中不計時、答對加分 / 連對、答錯扣 5 秒、難度隨題數、整局不重複、時間到結算、密技 +15 秒 / 原地續關、用過密技 goal false）；
      生存（扣心、超時、升級、續關）；對戰（電腦作答時間 / 正確率、先答對得分、答錯出局、10 題結算）；
      心算（數字鍵盤游標規格、輸入 / 刪除 / 送出、加秒、升級、時間到）；
      真人讀題模型（依字數，蒙地卡羅：goal 達成率、對戰三級勝率；實機機器人交叉驗證）；
      機器人（真人模型快手）lag 12 / 15 / 24 都達成 goal，每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte、字形池 0 overflow、0 缺字。
作法：Playwright 開 `cart5.html?game=quiz&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Quiz.dev`。

用法：../卡比之星/.venv/bin/python games/cart5/test_quiz.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=quiz'
SHOTS = ROOT / 'shots' / 'agent_cart5-quiz'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128

# 抽樣答案對照（獨立於題庫寫一次：題目 → 正解；題庫被改錯就會紅）
ANSWER_KEY = {
    '太陽系中離太陽最近的行星是？': '水星',
    '蜘蛛有幾隻腳？': '8隻',
    '週期表中原子序為1的元素是？': '氫',
    '地球大氣中含量最多的氣體是？': '氮氣',
    '臺灣最高的山是？': '玉山',
    '澳洲的首都是？': '坎培拉',
    '臺灣最長的河川是？': '濁水溪',
    '世界上最深的海溝是？': '馬里亞納海溝',
    '人類第一次登陸月球是在哪一年？': '1969年',
    '北宋時發明活字印刷術的人是？': '畢昇',
    '法國大革命在哪一年爆發？': '1789年',
    '在臺灣發生火災應撥打哪個電話？': '119',
    '在臺灣報警應撥打哪個號碼？': '110',
    '「床前明月光」是哪位詩人寫的？': '李白',
    '「推敲」一詞的典故和哪位詩人有關？': '賈島',
    '紅白機在日本是哪一年發售的？': '1983年',
    '紅白機同一條掃描線最多顯示幾個精靈？': '8個',
    '紅白機主機內建的工作RAM有多大？': '2KB',
    '紅白機的CPU以哪一款處理器為基礎？': '6502',
    '紅白機的聲音晶片共有幾個聲道？': '5個',
}


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Quiz && !!CT.Quiz.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.quiz.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def hold(page, mask, n):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 0); __nes.step(2); }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def start(page, mode, **kw):
    opt = {'skipReady': True}
    opt.update(kw)
    page.evaluate('([m, o]) => { CT.Quiz.dev.start(m, o); __nes.step(1); }', [mode, opt])


def until_answer(page, n=200):
    return page.evaluate('(n) => { for (let i = 0; i < n; i++) { if (GAME.state().s.phase === "answer") return i; __nes.step(1); } return -1; }', n)


def shot(page, name):
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.evaluate('() => __nes.render()')
    page.locator('canvas#nes').screenshot(path=str(SHOTS / name))


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, txPeak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (GAME.state().goal) break;
    if (o.until && GAME.state().s.mode === o.until) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.goal = GAME.state().goal; r.s = GAME.state().s;
  return r;
}
"""


# ---------- 真人讀題模型（與 quiz/main.js 的 HUMAN / 機器人同一個模型）----------
# 每題作答幀 = max(12, round(60·(orient + (題目字數 + 四選項字數)/cps + think[難度])·e^N(0,SD))) + 游標格數·MOVE_F + PRESS_F；
# 游標格數 = 洗牌後正解位置到第 1 格的最短距離（0/1/1/2）；正確率依難度。規則照 main.js：限時連答（只在作答階段計時、
# 答對 100+難度+速度+連對、答錯 −5 秒、1~6 初 / 7~14 中 / 15+ 高）、對戰（電腦 planCpu / cpuAct、先答對得分、答錯出局、10 秒沒人答）。
def _htime(p, H, q, R):
    import math
    lv, ql, ol = q
    sec = (p['orient'] + (ql + ol) / p['cps'] + p['think'][lv - 1]) * math.exp(R.gauss(0, H['SD']))
    return max(12, round(sec * 60)) + R.choice((0, 1, 1, 2)) * H['MOVE_F'] + H['PRESS_F']


def sim_ta(p, H, C, bylv, R):
    t, score, combo, qn = C['TA_TIME'], 0, 0, 0
    while True:
        qn += 1
        lv = 1 if qn <= 6 else (2 if qn <= 14 else 3)
        f = _htime(p, H, R.choice(bylv[lv]), R)
        if f >= t:
            return score
        t -= f
        if R.random() < p['acc'][lv - 1]:
            combo += 1
            score += 100 + (lv - 1) * 50 + max(0, 50 - f // 6) + 10 * min(10, combo - 1)
        else:
            combo = 0
            t -= C['TA_WRONG']
            if t <= 0:
                return score


def sim_vs(p, H, C, cl, bylv, R):
    you = cpu = 0
    cp = C['CPU'][cl]
    for _ in range(10):
        r = R.random()
        lv = (1 if r < .6 else 2) if cl == 0 else ((1 if r < .3 else (2 if r < .75 else 3)) if cl == 1 else (2 if r < .4 else 3))
        q = R.choice(bylv[lv])
        ca = cp['min'] + R.randrange(cp['max'] - cp['min'] + 1) + (lv - 1) * 20
        cr = R.random() < cp['acc']
        hf = _htime(p, H, q, R)
        hr = R.random() < p['acc'][lv - 1]
        if hf >= C['VS_LIMIT']:
            hf = None
        if hf is not None and hf <= ca:          # 玩家先答（同幀：玩家的輸入先處理）
            if hr:
                you += 1
            elif cr:
                cpu += 1
            continue
        if ca < C['VS_LIMIT'] and cr:
            cpu += 1
            continue
        if hf is not None and hr:
            you += 1
    return you > cpu


def human_model(page):
    import random
    C = page.evaluate('() => CT.Quiz.dev.consts')
    H = C['HUMAN']
    P = {pr['name']: pr for pr in H['profiles']}
    bank = page.evaluate('() => CT.Quiz.BANK.map(q => [q.lv, q.q.length, q.opts.join("").length])')
    bylv = {lv: [b for b in bank if b[0] == lv] for lv in (1, 2, 3)}
    N = 6000
    hit, med, mean = {}, {}, {}
    for name in P:
        R = random.Random(1)
        sc = sorted(sim_ta(P[name], H, C, bylv, R) for _ in range(N))
        hit[name] = sum(x >= C['GOAL_SCORE'] for x in sc) / N
        med[name] = sc[N // 2]
        mean[name] = sum(sc) / N
    R = random.Random(2)
    old = sum(sim_ta(P['normal'], H, C, bylv, R) >= 3000 for _ in range(2000)) / 2000
    info = ' / '.join('%s %.0f%%（中位 %d）' % (k, hit[k] * 100, med[k]) for k in P)
    ok('真人模型：限時連答 goal %d 達成率 一般 50~75%%、快手 ≥ 85%%、慢讀 / 小朋友 > 0（%s）' % (C['GOAL_SCORE'], info),
       0.5 <= hit['normal'] <= 0.75 and hit['fast'] >= 0.85 and hit['slow'] > 0 and hit['kid'] > 0, info)
    ok('真人模型：舊門檻 3000 分一般玩家幾乎達不到（%.1f%%）⇒ 門檻必須低於 3000' % (old * 100), C['GOAL_SCORE'] < 3000 and old < 0.05, old)
    wr = {}
    for name in ('fast', 'normal', 'kid'):
        wr[name] = []
        for cl in range(3):
            R = random.Random(10 + cl)
            wr[name].append(sum(sim_vs(P[name], H, C, cl, bylv, R) for _ in range(3000)) / 3000)
    info = ' / '.join('%s %s' % (k, [round(x * 100) for x in v]) for k, v in wr.items())
    w = wr['normal']
    ok('真人模型：一般玩家對戰勝率 新手 ≥ 88%%、普通 35~50%%、高手 5~15%%（%s）' % info,
       w[0] >= 0.88 and 0.35 <= w[1] <= 0.5 and 0.05 <= w[2] <= 0.15, info)
    ok('真人模型：快手勝率隨強度遞減、小朋友對新手仍有勝算', wr['fast'][0] >= wr['fast'][1] >= wr['fast'][2] and wr['kid'][0] >= 0.2, info)
    # 實機交叉驗證：機器人用「一般」模型（?hum=1）真的在遊戲裡打 6 局，平均分數要和模擬平均接近（±20%）
    scores = []
    for seed in (11, 12, 13, 14, 15, 16):
        fresh(page, '&bot=1&hum=1&lag=12&seed=%d' % seed)
        r = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
        scores.append(r['s']['score'] if r['s']['mode'] == 'result' else -1)
    avg = sum(scores) / len(scores)
    ok('實機：一般模型機器人 6 局平均 %d 分 ≈ 模擬平均 %d（±20%%）' % (avg, mean['normal']), min(scores) >= 0 and abs(avg - mean['normal']) <= 0.2 * mean['normal'], scores)
    # 說明 / 結算文字跟著門檻
    ok('說明頁寫出過關門檻 %d 分' % C['GOAL_SCORE'], page.evaluate('(g) => CT.Quiz.UI.help[0].indexOf(String(g)) >= 0', C['GOAL_SCORE']))
    st = S(page)
    ok('結算畫面列出 GOAL 門檻', st['mode'] == 'result' and any(l.startswith('GOAL') and str(C['GOAL_SCORE']) in l for l in st['result']['lines']), st['result'] and st['result']['lines'])


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

    # ================= 題庫 =================
    bank = page.evaluate("""() => {
      const Q = CT.Quiz, B = Q.BANK, TX = CT.Text, POOL = Q.Art.POOL;
      const cells = {}; const bad = []; const texts = new Set(); let dup = [];
      const tiles = s => { const u = new Set(); for (const ch of s) if (ch !== ' ' && ch !== '　' && ch !== '\\n') u.add(ch); let n = 0; u.forEach(ch => n += ch.charCodeAt(0) < 0x7F ? 2 : 4); return n; };
      let maxTiles = 0, maxLines = 0, maxOpt = 0, noGlyph = [];
      B.forEach(q => {
        const k = q.cat + '-' + q.lv; cells[k] = (cells[k] || 0) + 1;
        if (texts.has(q.q)) dup.push(q.q); texts.add(q.q);
        if (q.opts.length !== 4 || new Set(q.opts).size !== 4 || q.opts.some(o => !o || o.trim() !== o) || q.a !== q.opts[0] || !q.q.trim()) bad.push(q.q);
        const lines = TX.wrap(q.q, 26)[0].length; maxLines = Math.max(maxLines, lines);
        q.opts.forEach(o => { maxOpt = Math.max(maxOpt, TX.measure(o)); });
        // 一題同時在畫面上：題目 + 4 選項（同樣式共用）+ 分類名（另一個顏色樣式 ⇒ 另算）
        const t = tiles(q.q + q.opts.join('')) + tiles(Q.CATS[q.cat]); maxTiles = Math.max(maxTiles, t);
        for (const ch of q.q + q.opts.join('')) if (ch !== ' ' && !TX.has(ch)) noGlyph.push(ch);
      });
      const uiStr = JSON.stringify(Q.UI) + Q.CATS.join('') + Q.LEVELS.join('');
      for (const ch of uiStr) if (ch.charCodeAt(0) >= 0x80 && !TX.has(ch)) noGlyph.push(ch);
      const helpPages = Q.UI.help.map(h => TX.paginate(h, 26, 7, POOL).length);
      return { n: B.length, cats: Q.CATS.length, cells, bad, dup, maxLines, maxOpt, maxTiles, pool: POOL, noGlyph: [...new Set(noGlyph)], helpPages,
               pairs: B.map(q => [q.q, q.a]) };
    }""")
    ok('題庫 ≥ 200 題（%d）' % bank['n'], bank['n'] >= 200, bank['n'])
    ok('分類 ≥ 6 類、3 級；每類每級 ≥ 12 題', bank['cats'] >= 6 and len(bank['cells']) == bank['cats'] * 3 and min(bank['cells'].values()) >= 12, bank['cells'])
    ok('每題四選一：4 個選項、互不相同、正解 = 第 1 個、沒有空白', not bank['bad'], bank['bad'][:3])
    ok('題目不重複', not bank['dup'], bank['dup'][:3])
    ok('題目 ≤ 3 行（每行 26 欄）＝放得進題目框', bank['maxLines'] <= 3, bank['maxLines'])
    ok('選項 ≤ 22 欄（不截斷）', bank['maxOpt'] <= 22, bank['maxOpt'])
    ok('一題全部用字 ≤ 字形池（%d / %d 磚）' % (bank['maxTiles'], bank['pool']), bank['maxTiles'] <= bank['pool'] - 8, bank['maxTiles'])
    ok('題庫 / 介面每個字都有字形（cjk_glyphs.py 已收）', not bank['noGlyph'], bank['noGlyph'][:10])
    pairs = dict(bank['pairs'])
    wrong = [(k, v, pairs.get(k)) for k, v in ANSWER_KEY.items() if pairs.get(k) != v]
    ok('抽樣答案對照表 %d 題全對' % len(ANSWER_KEY), not wrong, wrong[:3])
    ok('說明文字依池容量自動分頁（每模式 ≤ 3 頁）', all(1 <= p <= 3 for p in bank['helpPages']), bank['helpPages'])

    # ================= 心算產生器 =================
    m = page.evaluate("""() => {
      const M = CT.Quiz.Math, out = { bad: [], kinds: {}, maxW: 0, maxAns: 0, noGlyph: [] };
      let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7FFFFFFF) / 0x80000000;
      for (let lv = 1; lv <= 8; lv++) for (let i = 0; i < 400; i++) {
        const p = M.gen(lv, rnd), ex = p.tokens.map(t => typeof t === 'number' ? String(t) : t).join('');
        const v = Function('return (' + ex + ')')();
        if (!(Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 9999 && v === p.ans)) out.bad.push([lv, ex, p.ans, v]);
        if (p.tokens.indexOf('/') >= 0) { const k = p.tokens.indexOf('/'); }
        const kind = p.tokens.filter(t => typeof t === 'string').join(''); out.kinds[lv] = out.kinds[lv] || {}; out.kinds[lv][kind] = 1;
        out.maxW = Math.max(out.maxW, CT.Text.measure(p.text)); out.maxAns = Math.max(out.maxAns, p.ans);
        for (const ch of p.text) if (!CT.Text.has(ch)) out.noGlyph.push(ch);
      }
      // 除法整除：所有含 / 的題目逐步計算都沒有小數
      seed = 99; let frac = 0;
      for (let i = 0; i < 2000; i++) { const p = M.gen(5 + (i % 4), rnd); if (p.tokens.indexOf('/') >= 0) { const s = p.tokens.map(t => typeof t === 'number' ? String(t) : t).join(''); const a = s.split('/')[0]; const d = +s.split('/')[1]; if (Function('return (' + a + ')')() % d) frac++; } }
      out.frac = frac; out.noGlyph = [...new Set(out.noGlyph)];
      return out;
    }""")
    ok('心算 8 級 × 400 題：整數、0~9999、運算式重算一致', not m['bad'], m['bad'][:3])
    ok('心算除法一律整除', m['frac'] == 0, m['frac'])
    k = m['kinds']
    ok('心算題型逐級：1~3 加減、4 乘、5 除、6 混合、8 含括號 / 乘除混合',
       set(k['1']) <= {'+', '-'} and set(k['4']) == {'*'} and set(k['5']) == {'/'} and any(len(x) == 2 for x in k['6']) and any('(' in x for x in k['8']) and '*/' in k['8'], k)
    ok('心算題目寬 ≤ 26 欄、答案 ≤ 4 位數、字形齊全', m['maxW'] <= 26 and m['maxAns'] <= 9999 and not m['noGlyph'], (m['maxW'], m['maxAns'], m['noGlyph']))

    # ================= 契約 / 資產 =================
    reg = page.evaluate("""() => { const g = CT.get('quiz'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id quiz / order 3 / title 星塵問答 / legacy 3 款', reg and reg['id'] == 'quiz' and reg['order'] == 3 and reg['title'] == '星塵問答' and len(reg['legacy']) == 3, reg)
    ok('註冊：契約函式齊全（9 個）+ backTile', reg and len(reg['fns']) == 9 and reg['bt'] and reg['bt']['tile'] > 0, reg)
    ok('bestText 右對齊 6 字元（沒紀錄 000000）', reg['bestText'] == '000000', repr(reg['bestText']))
    st = S(page)
    ok('背景 CHR ≤ 256 磚（自有 + 框線 + 字形池）', 0 < st['tiles'] <= 256, st['tiles'])
    ok('選單曲 + 曲目 ≥ 2 首 BGM、音效 ≥ 4', st['music'] == 'quiz_title' and page.evaluate('() => Object.keys(CT.Quiz.Audio.SONGS).filter(k => CT.Quiz.Audio.SONGS[k].playLoop).length') >= 2
       and page.evaluate('() => Object.keys(CT.Quiz.Audio.SFX).length') >= 4)

    # ================= 標題 / 說明 =================
    step(page, 10)
    lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
    ok('標題 lint 通過（≤ 25 色）', lint['ok'] and lint['colors'] <= 25, lint)
    ok('標題文字寫在名稱表上（讀回「星塵問答」與四個模式）', page.evaluate('() => CT.Quiz.dev.readLine(12, 4, 8)') == '星塵問答'
       and page.evaluate('() => [12,14,16,18].map(r => CT.Quiz.dev.readLine(12, r, 8))') == ['限時連答', '生存挑戰', '對戰電腦', '心算衝刺'])
    shot(page, '01_title.png')
    tap(page, RIGHT); tap(page, RIGHT)
    ok('標題 → 換分類（全部 → 自然 → 地理）並重寫畫面', S(page)['cat'] == 1 and page.evaluate('() => CT.Quiz.dev.readLine(15, 21, 6)') == '地理', S(page)['cat'])
    tap(page, LEFT); tap(page, LEFT); tap(page, LEFT)
    ok('← 由全部繞到最後一類（遊戲）', S(page)['cat'] == 5, S(page)['cat'])
    tap(page, RIGHT)
    tap(page, DOWN); tap(page, DOWN); tap(page, RIGHT)
    st = S(page)
    ok('對戰電腦：→ 換電腦強度', st['sel'] == 2 and st['cpuLv'] == 2 and page.evaluate('() => CT.Quiz.dev.readLine(15, 21, 6)') == '高手', (st['sel'], st['cpuLv']))
    ok('標題按密技無效', page.evaluate('() => CT.cheat()') is False and S(page)['cheats'] == 0)
    tap(page, UP); tap(page, UP); tap(page, A, 4)
    st = S(page)
    ok('A → 說明頁（對話框分頁、名牌 = 模式名）', st['mode'] == 'help' and st['box'] and st['box']['pages'] >= 1, st['box'])
    tap(page, B, 2)
    ok('說明頁 B → 回標題', S(page)['mode'] == 'title')
    tap(page, A, 4)
    for _ in range(12):
        step(page, 40)
        if S(page)['mode'] != 'help':
            break
        tap(page, A, 2)
    st = S(page)
    ok('說明頁按 A 逐頁看完 → READY', st['mode'] in ('ready', 'play'), st['mode'])
    step(page, 100)
    st = S(page)
    ok('READY 90 幀後出第一題（限時連答）', st['mode'] == 'play' and st['qn'] == 1 and st['q'] is not None, (st['mode'], st['qn']))

    # ================= 限時連答 =================
    fresh(page, '&seed=11')
    start(page, 0)
    st = S(page)
    t0 = st['timeLeft']
    ok('出題後先進「打字中」（字形依預算逐幀上傳）', st['phase'] == 'print', st['phase'])
    n = until_answer(page)
    st = S(page)
    ok('題目在數幀內寫完（%d 幀）且打字中不扣時間' % n, 0 < n < 60 and st['timeLeft'] == t0, (n, st['timeLeft'], t0))
    lines = page.evaluate('() => { const s = GAME.state().s, D = CT.Quiz.dev, C = D.consts; return { q: [0,1,2].map(i => D.readLine(C.Q_COL, C.Q_ROW + i * 2, C.Q_W)).join(""), opts: C.OPT_ROWS.map(r => D.readLine(C.OPT_COL, r, C.OPT_W)), want: s.opts, wq: s.q.q, cat: D.readLine(C.Q_COL, 5, 8) }; }')
    ok('畫面讀回：題目全文、四個選項、分類名都正確（不截斷）', lines['q'] == lines['wq'] and lines['opts'] == lines['want'] and lines['cat'] == page.evaluate('() => CT.Quiz.CATS[GAME.state().s.q.cat]'), lines)
    lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
    ok('答題畫面 lint 通過', lint['ok'] and lint['colors'] <= 25, lint)
    shot(page, '02_quiz.png')
    tap(page, DOWN, 1)
    ok('↓ 移動選項游標（繞回）', S(page)['cur'] == 1)
    tap(page, UP, 1); tap(page, UP, 1)
    ok('↑ 由第 1 個繞到第 4 個', S(page)['cur'] == 3)
    st = S(page)
    page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
    st2 = S(page)
    ok('答對：+100 以上（含速度 / 難度加分）、連對 1、判定畫面', st2['score'] >= 100 and st2['combo'] == 1 and st2['phase'] == 'judge' and st2['judge']['ok'], (st2['score'], st2['combo'], st2['phase']))
    step(page, 62)
    st3 = S(page)
    ok('判定 60 幀後自動出下一題、題目不同', st3['qn'] == 2 and st3['q']['id'] != st['q']['id'], (st3['qn'],))
    until_answer(page)
    tl = S(page)['timeLeft']
    page.evaluate('() => { const s = GAME.state().s; CT.Quiz.dev.answer((s.ans + 1) % 4); }')
    st = S(page)
    ok('答錯：扣 5 秒、連對歸零、正解標記', st['timeLeft'] == tl - 300 and st['combo'] == 0 and not st['judge']['ok'], (tl, st['timeLeft']))
    # 跑 30 題：題目不重複、難度隨題數
    seen, lv_ok = set(), True
    page.evaluate('() => CT.Quiz.dev.set("timeLeft", 999999)')
    for i in range(30):
        page.evaluate('() => { for (let i = 0; i < 300 && GAME.state().s.phase !== "answer"; i++) __nes.step(1); }')
        s = S(page)
        seen.add(s['q']['id'])
        want = 1 if s['qn'] <= 6 else (2 if s['qn'] <= 14 else 3)
        if s['q']['lv'] != want:
            lv_ok = False
        page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
    ok('連續 30 題沒有重複題目', len(seen) == 30, len(seen))
    ok('難度隨題數：1~6 初級、7~14 中級、15 起高級', lv_ok)
    st = S(page)
    ok('連對加分累積（30 連對 maxCombo ≥ 30）', st['maxCombo'] >= 30, st['maxCombo'])
    ok('字形池 0 overflow、0 缺字、文字系統單幀 ≤ 136 byte', st['text']['overflow'] == 0 and not st['missing'] and st['text']['peak'] <= 136, (st['text']['overflow'], st['missing'], st['text']['peak']))
    # 時間到結算
    fresh(page, '&seed=4')
    start(page, 0)
    until_answer(page)
    page.evaluate('() => { CT.Quiz.dev.set("score", 3500); CT.Quiz.dev.set("timeLeft", 3); }')
    step(page, 70)
    st = S(page)
    ok('時間到 → 結算（時間到！）、存最高分、達標 goal', st['mode'] == 'result' and st['goal'] and page.evaluate('() => CT.load("quiz", "best", 0)') == 3500, (st['mode'], st['goal']))
    ok('結算標題讀回「時間到！」', page.evaluate('() => CT.Quiz.dev.readLine(12, 5, 10)').strip() == '時間到！', page.evaluate('() => CT.Quiz.dev.readLine(4, 5, 24)'))
    ok('bestText 顯示最高分 6 字元', page.evaluate('() => CT.get("quiz").bestText()') == '003500')
    ok('結算按密技 = 原地續關（+30 秒、分數保留）', page.evaluate('() => CT.cheat()') is True and S(page)['mode'] == 'play' and S(page)['timeLeft'] == 1800 and S(page)['score'] == 3500)
    # 用過密技的那局 goal false
    fresh(page, '&seed=4')
    start(page, 0)
    until_answer(page)
    tl = S(page)['timeLeft']
    ok('遊玩中密技：+15 秒', page.evaluate('() => CT.cheat()') is True and S(page)['timeLeft'] >= tl + 900 - 2)
    page.evaluate('() => { CT.Quiz.dev.set("score", 9000); CT.Quiz.dev.set("timeLeft", 2); }')
    step(page, 70)
    st = S(page)
    ok('用過密技那局：分數夠也不算 goal、不存最高分', st['mode'] == 'result' and not st['goal'] and page.evaluate('() => CT.load("quiz", "best", 0)') == 0, (st['goal'],))
    # 單一分類也能跑完（題目只來自該類）
    fresh(page, '&seed=8')
    start(page, 0, cat=4)
    cats = set()
    page.evaluate('() => CT.Quiz.dev.set("timeLeft", 999999)')
    for i in range(40):
        page.evaluate('() => { for (let i = 0; i < 300 && GAME.state().s.phase !== "answer"; i++) __nes.step(1); }')
        cats.add(S(page)['q']['cat'])
        page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
    ok('選單一分類（語文）：40 題都來自該類、題目用完自動循環', cats == {4}, cats)
    st = S(page)
    page.evaluate('() => { CT.Quiz.dev.set("score", 9999); CT.Quiz.dev.set("timeLeft", 2); }')
    page.evaluate('() => { for (let i = 0; i < 400 && GAME.state().s.mode !== "result"; i++) __nes.step(1); }')
    ok('單一分類高分不算 goal（goal 限全部分類）', S(page)['mode'] == 'result' and not S(page)['goal'])

    # ================= 暫停 =================
    fresh(page, '&seed=5')
    start(page, 0)
    until_answer(page)
    tl = S(page)['timeLeft']
    tap(page, START, 2)
    st = S(page)
    hidden = page.evaluate('() => CT.Quiz.dev.readLine(3, 7, 26)')
    ok('START 暫停：BGM 暫停、題目從畫面拿掉（不能偷看思考）、時間不走', st['paused'] and page.evaluate('() => CT.Quiz.Audio.isPaused() || !CT.Quiz.Audio.current') and hidden == '' and st['timeLeft'] == tl, (st['paused'], hidden))
    ok('暫停畫面寫「暫停中」', page.evaluate('() => CT.Quiz.dev.readLine(13, 9, 6)') == '暫停中')
    step(page, 30)
    tap(page, START, 2)
    st = S(page)
    ok('再按 START 解除：題目回來、時間繼續', not st['paused'] and page.evaluate('() => CT.Quiz.dev.readLine(3, 7, 26)') != '' and st['timeLeft'] < tl, st['timeLeft'])

    # ================= 生存 =================
    fresh(page, '&seed=6')
    start(page, 1)
    until_answer(page)
    page.evaluate('() => { const s = GAME.state().s; CT.Quiz.dev.answer((s.ans + 1) % 4); }')
    ok('生存：答錯扣 1 心', S(page)['lives'] == 2)
    step(page, 62)
    until_answer(page)
    step(page, 721)
    st = S(page)
    ok('生存：12 秒沒作答 = 超時扣 1 心', st['lives'] == 1 and st['judge']['timeout'], (st['lives'], st['judge']))
    step(page, 62)
    for i in range(5):
        until_answer(page)
        page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
        step(page, 62)
    st = S(page)
    ok('生存：答對 5 題升到 LV2、之後出中級題', st['lv'] == 2 and (until_answer(page) >= 0) and S(page)['q']['lv'] == 2, (st['lv'],))
    page.evaluate('() => { const s = GAME.state().s; CT.Quiz.dev.answer((s.ans + 1) % 4); }')
    step(page, 62)
    st = S(page)
    ok('生存：心用完 → 結算（挑戰結束）', st['mode'] == 'result' and st['result']['head'] == '挑戰結束', st['mode'])
    ok('生存：結算密技續關（補 3 心、同等級、分數保留）', page.evaluate('() => CT.cheat()') is True and S(page)['lives'] == 3 and S(page)['lv'] == 2 and S(page)['mode'] == 'play')

    # ================= 對戰電腦 =================
    cs = [page.evaluate('([l]) => CT.Quiz.dev.cpuSample(l, 4000, 1)', [lv]) for lv in (0, 1, 2)]
    ok('電腦 3 級正確率約 55 / 70 / 80%（±4%）', all(abs(c['acc'] - a) < 0.04 for c, a in zip(cs, (0.55, 0.7, 0.8))), [round(c['acc'], 3) for c in cs])
    ok('電腦作答時間（初級題）：新手 240~420、普通 210~350、高手 200~340 幀（依真人讀題模型調，fix-r9 P2-2）',
       [(c['min'], c['max']) for c in cs] == [(240, 420), (210, 350), (200, 340)] or all(lo <= c['min'] and c['max'] <= hi for c, (lo, hi) in zip(cs, ((240, 420), (210, 350), (200, 340)))),
       [(c['min'], c['max']) for c in cs])
    fresh(page, '&seed=7')
    start(page, 2, cpuLv=0)
    until_answer(page)
    page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
    st = S(page)
    ok('對戰：先答對得 1 分、本題結束', st['you'] == 1 and st['phase'] == 'judge' and st['judge']['who'] == 'you', (st['you'], st['phase']))
    step(page, 62)
    until_answer(page)
    page.evaluate('() => { const s = GAME.state().s; CT.Quiz.dev.answer((s.ans + 1) % 4); }')
    st = S(page)
    ok('對戰：答錯 → 本題出局、不能再答，電腦繼續', st['youOut'] and st['phase'] == 'answer' and page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)') is False, (st['youOut'], st['phase']))
    page.evaluate('() => { for (let i = 0; i < 800 && GAME.state().s.phase === "answer"; i++) __nes.step(1); }')
    st = S(page)
    ok('對戰：電腦到時間作答（答對得分或答錯 → 沒人得分）', st['phase'] == 'judge' and (st['cpuPick'] >= 0), (st['judge'], st['cpuPick'], st['cpuAt']))
    for i in range(12):
        page.evaluate('() => { for (let i = 0; i < 400 && GAME.state().s.phase !== "answer" && GAME.state().s.mode === "play"; i++) __nes.step(1); }')
        if S(page)['mode'] != 'play':
            break
        page.evaluate('() => CT.Quiz.dev.answer(GAME.state().s.ans)')
        step(page, 62)
    st = S(page)
    ok('對戰：10 題後結算、贏了記勝場', st['mode'] == 'result' and st['qn'] == 10 and st['you'] > st['cpu'] and page.evaluate('() => CT.load("quiz", "vsw", 0)') == 1, (st['mode'], st['qn'], st['you'], st['cpu']))
    lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
    ok('對戰結算 lint 通過', lint['ok'], lint)

    # ================= 心算 =================
    fresh(page, '&seed=9')
    start(page, 3)
    st = S(page)
    ok('心算：出題（LV1）、題目寫在畫面上', st['prob'] is not None and st['prob']['level'] == 1 and st['phase'] == 'answer', st['prob'])
    step(page, 30)
    ok('心算：題目讀回一致', page.evaluate('() => { const s = GAME.state().s; const D = CT.Quiz.dev; return D.readLine(0, D.consts.M_PROB_ROW, 32).trim() === s.prob.text; }'))
    # 游標規格：剛按下走一格；按住首延遲 12 幀、之後每 4 幀
    page.evaluate('() => { CT.Quiz.dev.set("kr", 0); CT.Quiz.dev.set("kc", 0); }')
    hold(page, DOWN, 1)
    r1 = S(page)['key'][0]
    page.evaluate('() => { CT.Quiz.dev.set("kr", 0); }')
    hold(page, DOWN, 12)
    r12 = S(page)['key'][0]
    page.evaluate('() => { CT.Quiz.dev.set("kr", 0); }')
    hold(page, DOWN, 13)
    r13 = S(page)['key'][0]
    page.evaluate('() => { CT.Quiz.dev.set("kr", 0); }')
    hold(page, DOWN, 17)
    r17 = S(page)['key'][0]
    ok('數字鍵盤游標：按下走 1、按住第 12 幀後才連走、之後每 4 幀', (r1, r12, r13, r17) == (1, 1, 2, 3), (r1, r12, r13, r17))
    st = S(page)
    ans = str(st['prob']['ans'])
    page.evaluate('(s) => { for (const c of s) CT.Quiz.dev.pressKey(c); CT.Quiz.dev.pressKey("9"); CT.Quiz.dev.pressKey("DEL"); }', ans)
    step(page, 20)
    st = S(page)
    shown = page.evaluate('() => CT.Quiz.dev.readLine(12, CT.Quiz.dev.consts.M_ANS_ROW, 10)')
    ok('心算：數字鍵輸入、← 刪一位、畫面顯示全形數字', st['input'] == ans and shown == page.evaluate('(s) => CT.Quiz.Math.fw(+s)', ans), (st['input'], shown))
    shot(page, '05_math.png')
    tl = st['timeLeft']
    page.evaluate('() => CT.Quiz.dev.pressKey("OK")')
    st = S(page)
    ok('心算：ＯＫ 送出答對 → 加分、+1 秒、連對', st['score'] == 10 and st['combo'] == 1 and st['timeLeft'] >= tl + 58 and st['judge']['ok'], (st['score'], st['timeLeft'], tl))
    for i in range(4):
        page.evaluate('() => { for (let i = 0; i < 80 && GAME.state().s.phase !== "answer"; i++) __nes.step(1); }')
        page.evaluate('() => { const s = GAME.state().s; for (const c of String(s.prob.ans)) CT.Quiz.dev.pressKey(c); CT.Quiz.dev.pressKey("OK"); }')
    st = S(page)
    ok('心算：答對 5 題升到 LV2', st['lv'] == 2 and st['solved'] == 5, (st['lv'], st['solved']))
    page.evaluate('() => { for (let i = 0; i < 80 && GAME.state().s.phase !== "answer"; i++) __nes.step(1); }')
    page.evaluate('() => { const s = GAME.state().s; CT.Quiz.dev.pressKey(String((s.prob.ans + 1) % 10)); CT.Quiz.dev.pressKey("OK"); }')
    st = S(page)
    ok('心算：答錯 → 連對歸零、顯示正解', st['combo'] == 0 and not st['judge']['ok'], st['combo'])
    page.evaluate('() => CT.Quiz.dev.set("timeLeft", 2)')
    step(page, 4)
    st = S(page)
    ok('心算：時間到 → 結算、存心算最佳', st['mode'] == 'result' and page.evaluate('() => CT.load("quiz", "math", 0)') == st['score'] and st['score'] > 0, (st['mode'], st['score']))

    # ================= exit 存分 =================
    fresh(page)
    start(page, 0)
    page.evaluate('() => { CT.Quiz.dev.set("score", 4321); CT.current.exit(__nes.nes()); }')
    ok('exit() 中途離開也存最高分', page.evaluate('() => CT.load("quiz", "best", 0)') == 4321)

    # ================= 真人讀題模型（fix-r9 P2-1 / P2-2）=================
    human_model(page)

    # ================= 機器人 =================
    GOAL = page.evaluate('() => CT.Quiz.dev.consts.GOAL_SCORE')
    for lag, cap in (('12', 12000), ('15', 12000), ('24', 14000)):
        fresh(page, '&bot=1&seed=3&lag=' + lag)
        r = page.evaluate(RUN, {'n': cap})
        s = r['s']
        ok('機器人 lag %s：%d 幀內限時連答 ≥ %d 分（goal，不開密技）' % (lag, cap, GOAL), r['goal'] and s['cheats'] == 0 and s['score'] >= GOAL, (r['f'], s['score'], s['correct'], s['answered']))
        ok('機器人 lag %s：每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte、池 0 overflow、0 缺字' % lag,
           r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160 and s['text']['overflow'] == 0 and not s['missing'], (r['ml'], r['over'], r['peak'], s['text']['overflow']))
        acc = s['correct'] / max(1, s['answered'])
        ok('機器人 lag %s：快手模型正確率 95/85/70%%（實際 %.0f%%，容許 60~97%%）' % (lag, acc * 100), 0.6 <= acc <= 0.97, (s['correct'], s['answered']))
    # 每次讀題反應 ≥ 12 幀：lag=0 也被夾到 12
    fresh(page, '&bot=1&seed=3&lag=0')
    r = page.evaluate(RUN, {'n': 12000})
    ok('機器人 lag=0 也夾到 ≥ 12 幀反應，仍達 goal', r['goal'], (r['f'], r['s']['score']))
    fresh(page, '&bot=1&seed=3&mode=3')
    r = page.evaluate(RUN, {'n': 5000, 'until': 'result'})
    ok('心算機器人（數字鍵盤路徑）一局解 ≥ 15 題、0 超支', r['s']['solved'] >= 15 and r['over'] == 0 and r['ml'] <= 8, (r['s']['solved'], r['over']))
    fresh(page, '&bot=1&seed=3&mode=2')
    r = page.evaluate(RUN, {'n': 9000, 'until': 'result'})
    ok('對戰機器人打完 10 題、0 超支', r['s']['mode'] == 'result' and r['s']['qn'] == 10 and r['over'] == 0, (r['s']['mode'], r['s']['qn'], r['s']['you'], r['s']['cpu']))

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_quiz: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
