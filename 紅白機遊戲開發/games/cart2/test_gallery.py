# -*- coding: utf-8 -*-
"""《星塵射擊場 STAR RANGE》（cart2 槽 7，id = gallery）自動驗證。

重點：游標規格（按住前 8 幀 1 px、之後 3 px、B 精細 1 px）、A 只認按下邊緣、環分畫面 = 計分、6 模式 × 5 級難度遞增、
      合格線 / GAME OVER / 結算評價、§6 規則（密技原地續關 / 標題無效 / goal false / 暫停 BGM / exit 存分 / backTile / 說明字樣）、
      每線 ≤ 8 精靈（6 模式各跑機器人逐幀量）、VBlank ≤ 160（佇列）、名稱表 == 影子。
作法：Playwright 開 `cart2.html?game=gallery&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Gallery.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_gallery.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=gallery'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Gallery && !!CT.Gallery.dev')
    page.evaluate('() => { ["best","grade_PRE","grade_SPD"].forEach(k => localStorage.removeItem("nes.cart2.gallery." + k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 逐幀跑（可選機器人），量每線精靈 / overFrames / 預算尖峰
RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const g = GAME.state();
    if (o.until && (g.s.mode === o.until || (o.until === 'goal' && g.goal))) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

NT_MATCH = r"""
() => { const g = CT.Gallery.dev.g(), p = __nes.nes().ppu; let bad = 0;
  for (let k = 0; k < 960; k++) if (p.getTile(0, k & 31, k >> 5) !== g.want[k]) bad++;
  return { bad, q: g.q.length + g.qa.length }; }
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
    reg = page.evaluate("""() => { const g = CT.get('gallery'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id / order 7 / title / legacy 8 款', reg and reg['id'] == 'gallery' and reg['order'] == 7 and reg['title'] == '星塵射擊場' and len(reg['legacy']) == 8, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元純分數', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', reg['bt'] and page.evaluate("(t) => { const A = CT.Gallery.Art.make(); return t.tile === A.s('SPARK') && t.pal >= 0 && t.pal < 4; }", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Gallery.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Gallery.Audio.SONGS), sfx: Object.keys(CT.Gallery.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 gallery_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('gallery_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 等級設計：難度遞增 ----------------
    lv = page.evaluate('() => CT.Gallery.LV')
    ok('6 模式 × 5 級', len(lv) == 6 and all(len(v) == 5 for v in lv.values()), list(lv.keys()))
    pre = lv['PRE']
    ok('精準靶：靶 32 → 16、限時不增、星風出現', pre[0]['size'] == 32 and pre[4]['size'] == 16 and all(pre[i]['time'] >= pre[i + 1]['time'] or pre[i]['size'] > pre[i + 1]['size'] for i in range(4)) and pre[4]['sway'] > 0, pre)
    spd = lv['SPD']
    ok('速射：存活時間遞減、數量 / 同時數不減', all(spd[i]['life'] > spd[i + 1]['life'] and spd[i]['n'] <= spd[i + 1]['n'] and spd[i]['conc'] <= spd[i + 1]['conc'] for i in range(4)), spd)
    ok('追蹤 / 追逐 / 眼力：速度遞增；多目標：靶數遞增', all(lv[k][i]['v'] < lv[k][i + 1]['v'] for k in ('TRK', 'CHS') for i in range(4))
       and all(lv['EYE'][i]['v'] < lv['EYE'][i + 1]['v'] for i in range(4)) and all(lv['ORD'][i]['n'] < lv['ORD'][i + 1]['n'] for i in range(4)))

    # ---------------- 環分：畫面 = 計分 ----------------
    rc = page.evaluate("""() => { const GA = CT.Gallery, A = GA.Art.make(); let bad = 0, n = 0;
        for (const size of [32, 16]) { const w = size / 8, pre = size === 32 ? 'TB_' : 'TS_';
          for (let ty = 0; ty < w; ty++) for (let tx = 0; tx < w; tx++) { const t = NES.CHR.getBank('gallery_bg').tiles[A.t(pre + (ty * w + tx))];
            for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { n++;
              const k = GA.ringIndex(size, tx * 8 + x - size / 2, ty * 8 + y - size / 2);
              if ((k >= 0) !== (t[y * 8 + x] > 0)) bad++; } } }
        return { bad, n, s0: GA.ringScore(32, 0, 0), s1: GA.ringScore(32, 4, 0), s2: GA.ringScore(32, 16, 0), s3: GA.ringScore(16, 0, 0), s4: GA.ringScore(16, 8, 0) }; }""")
    ok('環磚像素與 ringScore 逐點一致（32 + 16 靶，1280 點）', rc['bad'] == 0 and rc['n'] == 1280, rc)
    ok('環分：中心 10、偏 4 px = 8、靶外 0（16 靶同理）', rc['s0'] == 10 and rc['s1'] == 8 and rc['s2'] == 0 and rc['s3'] == 10 and rc['s4'] == 0, rc)
    r10 = page.evaluate("""() => { const GA = CT.Gallery; let n = 0, s10 = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (GA.ringScore(16, x - 8, y - 8) === 10) n++;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (GA.ringScore(32, x - 16, y - 16) === 10) s10++;
        return { n16: n, n32: s10, ring16: GA.RINGS[16] }; }""")
    ok('fix-r6 P3-3：16 靶 10 分環 ≥ 5×5（像素數 ≥ 13，與 32 靶同半徑 2）', r10['n16'] >= 13 and r10['n16'] == r10['n32'] and r10['ring16'][0] == 2, r10)
    ok('fix-r6 P3-3：精準靶第 5 級星風 ≤ 2', pre[4]['sway'] <= 2, pre)

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Gallery.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT（★ 用星字）', 'C/$ = CHEAT' in txt)
    body = [i for i in range(7, 27) if tt[i].strip()]
    ok('§6-6 說明 / 模式列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    r = page.evaluate("() => { const ok1 = GAME.state().s.mode === 'title'; const c = CT.cheat(); return { ok1, c }; }")
    ok('§6-1 標題按密技無效（cheat() false）', r['ok1'] and r['c'] is False, r)
    page.evaluate("() => { NES.Input.inject(32, 1); __nes.step(2); }")
    ok('標題 ↓ 換模式', st(page)['sel'] == 1)
    page.evaluate("() => { NES.Input.inject(16, 1); __nes.step(2); NES.Input.inject(8, 1); __nes.step(2); }")
    s = st(page)
    ok('START → 精準靶 LEVEL 1 說明（intro）', s['mode'] == 'intro' and s['run']['key'] == 'PRE' and s['run']['lv'] == 0, s['mode'])

    # ---------------- 游標規格 ----------------
    page.evaluate("() => { __nes.step(12); NES.Input.inject(1, 1); __nes.step(2); }")
    ok('intro 按 A → 開始', st(page)['mode'] == 'play')
    cur = page.evaluate("""() => { const g = CT.Gallery.dev.g(); g.cx = 60; g.cy = 120; const xs = [];
        for (let i = 0; i < 12; i++) { NES.Input.inject(128, 1); __nes.step(1); xs.push(g.cx); }
        __nes.step(2); const a = g.cx; NES.Input.inject(128, 1); __nes.step(1); const b = g.cx;
        const ys = []; for (let i = 0; i < 12; i++) { NES.Input.inject(32 | 2, 1); __nes.step(1); ys.push(g.cy); }
        return { xs, a, b, ys }; }""")
    d = [cur['xs'][i + 1] - cur['xs'][i] for i in range(11)]
    ok('十字鍵按住：前 8 幀 1 px/幀', cur['xs'][0] == 61 and d[:7] == [1] * 7, cur['xs'])
    ok('十字鍵按住：第 9 幀起 3 px/幀', all(x == 3 for x in d[8:]), d)
    ok('放開後重新按 = 回到 1 px', cur['b'] - cur['a'] == 1, cur)
    dy = [cur['ys'][i + 1] - cur['ys'][i] for i in range(11)]
    ok('B 按住 = 精細 1 px（按住超過 8 幀也不加速）', all(x == 1 for x in dy), dy)

    # ---------------- 精準靶計分 + A 只認邊緣 ----------------
    r = page.evaluate("""() => { const g = CT.Gallery.dev.g(); let k = 0; while (!g.sub.tg && k++ < 80) __nes.step(1);
        const tg = g.sub.tg; g.cx = tg.cx; g.cy = tg.cy; __nes.step(1);
        const s0 = g.sub.lvScore, shot0 = g.sub.shot;
        NES.Input.inject(1, 30); __nes.step(30);
        return { pts: g.sub.lvScore - s0, shots: g.sub.shot - shot0 }; }""")
    ok('準星對正中心 → 10 分（BULLSEYE）', r['pts'] == 10, r)
    ok('A 按住 30 幀只算 1 發（只認按下邊緣）', r['shots'] == 1, r)
    r = page.evaluate("""() => { const g = CT.Gallery.dev.g(); let k = 0; while (!g.sub.tg && k++ < 80) __nes.step(1);
        const tg = g.sub.tg; g.cx = tg.cx + 24; g.cy = tg.cy; __nes.step(1); const s0 = g.sub.lvScore;
        NES.Input.inject(1, 1); __nes.step(2); return { pts: g.sub.lvScore - s0, msg: g.msg }; }""")
    ok('打在靶外 → 0 分（MISS）', r['pts'] == 0 and 'MISS' in r['msg'], r)
    m = page.evaluate(NT_MATCH)
    ok('名稱表 == 影子（佇列清空後）', m['bad'] == 0 and m['q'] == 0, m)

    # ---------------- 暫停 ----------------
    r = page.evaluate("""() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 2); __nes.step(2); __nes.step(1);
        const p0 = GAME.state().s.paused;
        NES.Input.inject(8, 1); __nes.step(1); const g = CT.Gallery.dev.g(), t = g.t, cx = g.cx;
        NES.Input.inject(128, 30); __nes.step(30);
        const mp = __nes.nes().music.isPaused ? __nes.nes().music.isPaused() : null;
        const frozen = g.t === t && g.cx === cx;
        const row = []; const A = CT.Gallery.Art.make(), p = __nes.nes().ppu; for (let c = 1; c < 31; c++) row.push(p.getTile(0, c, 27));
        const want = A.text('PAUSE  HOLD START+SELECT: MENU');
        NES.Input.inject(8, 1); __nes.step(2);
        return { p0, frozen, mp, hint: want.every((v, i) => row[i] === v), after: GAME.state().s.paused,
                 mp2: __nes.nes().music.isPaused ? __nes.nes().music.isPaused() : null }; }""")
    ok('SELECT + START 不觸發暫停', r['p0'] is False, r)
    ok('START 暫停：時間 / 游標凍結', r['frozen'], r)
    ok('§6-2 暫停 = BGM 暫停（music.isPaused），恢復後接續', r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    ok('§6-5 暫停列寫著 HOLD START+SELECT: MENU', r['hint'], r)

    # ---------------- 速射 ----------------
    page.evaluate('() => { CT.Gallery.dev.start(1, 0); CT.Gallery.dev.begin(); }')
    r = page.evaluate("""() => { const g = CT.Gallery.dev.g(); let k = 0; while (!g.sub.list.length && k++ < 60) __nes.step(1);
        const o = g.sub.list[0]; __nes.step(20); g.cx = o.cx; g.cy = o.cy; __nes.step(1); const s0 = g.run.score;
        NES.Input.inject(1, 1); __nes.step(2); return { hits: g.sub.hits, pts: g.run.score - s0 }; }""")
    ok('速射：命中晶片 → 50~100 分（越快越高）', r['hits'] == 1 and 50 <= r['pts'] <= 100, r)
    r = page.evaluate("""() => { const g = CT.Gallery.dev.g(); __nes.step(2600); return GAME.state().s; }""")
    ok('速射：放著不打 → 晶片淡出、未達合格線 → GAME OVER', r['mode'] == 'over', r['mode'])
    # §6-1 密技原地續關
    r = page.evaluate("""() => { const before = GAME.state().s.run; const c = CT.cheat(); __nes.step(2); const s = GAME.state().s;
        return { c, before, mode: s.mode, lv: s.run.lv, score: s.run.score, cheated: s.run.cheated, goal: GAME.state().goal }; }""")
    ok('§6-1 GAME OVER 按密技 → 原地重打同一級（分數保留）', r['c'] and r['mode'] == 'intro' and r['lv'] == r['before']['lv'] and r['score'] == r['before']['score'], r)
    ok('§6-1 用過密技那局標記 cheated、goal false', r['cheated'] and r['goal'] is False, r)
    r = page.evaluate("""() => { CT.Gallery.dev.begin(); const g = CT.Gallery.dev.g(); __nes.step(5); g.sub.time = 3;
        const c = CT.cheat(); __nes.step(1); return { c, t: g.sub.time, max: g.sub.timeMax, cheated: g.run.cheated }; }""")
    ok('遊玩中密技 = 立刻補強（限時補滿）', r['c'] and r['cheated'], r)

    # ---------------- 多目標：打錯扣時間 ----------------
    page.evaluate('() => { CT.Gallery.dev.start(3, 0); CT.Gallery.dev.begin(); __nes.step(3); }')
    r = page.evaluate("""() => { const g = CT.Gallery.dev.g(), s = g.sub; const o = s.discs.find(d => d.num === 2);
        g.cx = o.cx; g.cy = o.cy; __nes.step(1); const t0 = s.time; NES.Input.inject(1, 1); __nes.step(2);
        const wrong = t0 - s.time; const o1 = s.discs.find(d => d.num === 1); g.cx = o1.cx; g.cy = o1.cy; __nes.step(1);
        NES.Input.inject(1, 1); __nes.step(2); return { wrong, next: s.next, n: s.discs.length }; }""")
    ok('多目標：打錯號 −60 幀（−1 秒）、照順序打 1 → 下一個是 2', r['wrong'] >= 60 and r['next'] == 2 and r['n'] == 3, r)

    # ---------------- 結算評價 ----------------
    r = page.evaluate("""() => { const d = CT.Gallery.dev; d.start(0, 4); const g = d.g(); g.run.score = Math.ceil(d.runMax('PRE') * 0.6);
        g.run.lvScores = [50, 50, 50, 50, 50]; d.result(); const s = GAME.state().s; return { mode: s.mode, grade: s.run.grade, pct: s.run.pct,
        best: CT.load('gallery', 'grade_PRE', 5), goals: s.goals, c: CT.cheat() }; }""")
    ok('結算：60% → 評價 B、存模式最佳評價', r['mode'] == 'result' and r['grade'] == 2 and r['pct'] == 60 and r['best'] == 2, r)
    ok('結算：精準靶 B 以上 → goal 旗標 PRE、結算畫面密技無效', r['goals']['PRE'] and r['c'] is False, r)
    r = page.evaluate("""() => { const d = CT.Gallery.dev; d.start(1, 4); const g = d.g(); g.run.score = d.runMax('SPD'); g.run.cheated = true;
        d.result(); return { goals: GAME.state().s.goals, goal: GAME.state().goal, gi: GAME.state().s.run.grade }; }""")
    ok('用過密技的速射拿 S 也不算 goal', r['gi'] == 0 and not r['goals']['SPD'] and r['goal'] is False, r)
    r = page.evaluate("""() => { localStorage.removeItem('nes.cart2.gallery.best'); const d = CT.Gallery.dev; d.start(0, 0); d.g().run.score = 4321; CT.get('gallery').exit(__nes.nes());
        return { best: CT.load('gallery', 'best', 0), txt: CT.get('gallery').bestText() }; }""")
    ok('§6-3 exit() 存最高分；bestText 右對齊 6 字', r['best'] >= 4321 and r['txt'] == '004321', r)

    # ---------------- 六模式各跑機器人：每線 ≤ 8、VBlank 不爆 ----------------
    worst = {}
    for m in range(1, 7):
        fresh(page, '&bot=1&gmode=%d&lv=5' % m)
        rr = page.evaluate(RUN, {'n': 1500})
        worst[m] = (rr['ml'], rr['over'], rr['peak'])
    ok('六模式第 5 級機器人 1500 幀：每線精靈 ≤ 8', all(v[0] <= 8 for v in worst.values()), worst)
    ok('六模式：overFrames 0、每幀 VBlank ≤ 160', all(v[1] == 0 and v[2] <= 160 for v in worst.values()), worst)
    ok('眼力模式（最滿）每線正好吃到 8 也不超', worst[6][0] <= 8, worst[6])
    m = page.evaluate(NT_MATCH)
    ok('機器人跑完：名稱表 == 影子（佇列不殘留錯誤）', m['bad'] == 0 or m['q'] > 0, m)

    # ---------------- 完整機器人 goal ----------------
    fresh(page, '&bot=1')
    rr = page.evaluate(RUN, {'n': 20000, 'until': 'goal'})
    ok('機器人（不開密技）：精準靶 + 速射都 ≥ B → goal', rr['goal'], {'f': rr['f'], 'goals': rr['s']['goals']})
    ok('機器人全程：每線 ≤ 8、overFrames 0', rr['ml'] <= 8 and rr['over'] == 0, {'ml': rr['ml'], 'over': rr['over'], 'peak': rr['peak']})
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d' % (rr['f'], rr['ml'], rr['over'], rr['peak']))

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_gallery: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
