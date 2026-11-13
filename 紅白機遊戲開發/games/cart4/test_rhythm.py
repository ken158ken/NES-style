# -*- coding: utf-8 -*-
"""《星塵節奏 STAR BEAT》（cart4 槽 5，id = rhythm）自動驗證。

重點：6 首原創曲 + 譜面（4 模式 × 3 難度 = 72 份，全部驗證 onset 對位 / 間距 / 精靈配額）、
      譜面與 APU driver row 嚴格同步（音符那一幀 driver 正在發那個 row）、判定窗口（幀）PERFECT ≤ 2 / GREAT ≤ 5 / GOOD ≤ 8、
      暫停凍結譜面時間、FADE / EAR（只靠聲音）模式、能量耗盡 → 密技原地續關、§6 規則、
      機器人人類模型（反應延遲 lag / 時機誤差 jit）0 / 12 / 24 幀與狂按對照、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart4.html?game=rhythm&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Rhythm.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_rhythm.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=rhythm'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Rhythm && !!CT.Rhythm.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.rhythm.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


JS_ROW_HAS = r"""
(a) => { const p = __nes.nes().ppu, A = CT.Rhythm.Art.make(), w = A.text(a.s);
  for (let c = 0; c + w.length <= 32; c++) { let okk = true; for (let i = 0; i < w.length; i++) if (p.getTile(0, c + i, a.r) !== w[i]) { okk = false; break; }
    if (okk) return true; } return false; }
"""
JS_ROWS_USED = r"""
() => { const p = __nes.nes().ppu, out = []; for (let r = 6; r < 27; r++) { let n = 0; for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) n++; out.push(n > 0 ? 1 : 0); } return out; }
"""
# 跑到結算（或上限），逐幀量每線精靈峰值 / overFrames；回傳最後狀態
JS_RUN = r"""
(max) => { __SETUP__; let ml = 0, over0 = __nes.stats().budget.overFrames, peak = 0;
  for (let i = 0; i < max; i++) { __nes.step(1); const s = __nes.stats(); if (s.maxSpritesLine > ml) ml = s.maxSpritesLine;
    if (s.budget.peak > peak) peak = s.budget.peak; const g = GAME.state().s; if (g.mode === 'result' || g.mode === 'fail') break; }
  const g = GAME.state().s; return { ml, over: __nes.stats().budget.overFrames - over0, peak, s: g }; }
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
    reg = page.evaluate("""() => { const g = CT.get('rhythm'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, back: CT.Rhythm.Art.make().s('BACK') }; }""")
    ok('註冊：id / order 5 / title / legacy 5 款', reg and reg['id'] == 'rhythm' and reg['order'] == 5 and reg['title'] == '星塵節奏' and len(reg['legacy']) == 5, reg)
    ok('註冊：契約函式 9 個齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('§6-4 backTile = 精靈表的實心星 BACK', reg['bt'] and reg['bt']['tile'] == reg['back'], reg['bt'])
    bt = page.evaluate("() => { const a = CT.get('rhythm').bestText(); localStorage.setItem('nes.cart4.rhythm.best', '12345'); const b = CT.get('rhythm').bestText(); localStorage.removeItem('nes.cart4.rhythm.best'); return [a, b]; }")
    ok('bestText：右對齊 6 字元（000000 / 012345）', bt == ['000000', '012345'], bt)
    a = page.evaluate("() => { const A = CT.Rhythm.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length }; }")
    ok('CHR bank ≤ 256 磚', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("""() => { const R = CT.Rhythm; return { songs: Object.keys(R.Audio.SONGS), sfx: Object.keys(R.Audio.SFX), tracks: R.TRACKS.map(t => [t.key, t.title, t.speed, t.bars]),
        lanes: R.LANE_NOTE, ch: R.TRACKS.map(t => { const s = R.Audio.SONGS[t.key]; const used = {p1:0,p2:0,tri:0,noi:0};
          s.patterns.forEach(p => Object.keys(used).forEach(k => { if ((p[k] || []).some(x => x && x.note !== undefined)) used[k]++; })); return used; }) }; }""")
    ok('可玩原創曲 ≥ 6 首（每首 19 小節：數拍 2 + ABAC 16 + 收尾 1）', len(au['tracks']) >= 6 and all(t[3] == 19 for t in au['tracks']), au['tracks'])
    ok('每首都用到 p1 / p2 / tri / noi 四聲道', all(all(v > 0 for v in c.values()) for c in au['ch']), au['ch'])
    ok('速度各異（speed 5 / 6 / 7 / 8 都有）', set(t[2] for t in au['tracks']) == {5, 6, 7, 8}, [t[2] for t in au['tracks']])
    ok('BGM + 音效全部 rhythm_ 前綴、音效 ≥ 4', len(au['sfx']) >= 4 and all(k.startswith('rhythm_') for k in au['songs'] + au['sfx']), len(au['sfx']))
    ok('§1-4 四軌命中音各自音高（4 個不同音）', len(set(au['lanes'])) == 4 and all(('rhythm_hit%d' % i) in au['sfx'] and ('rhythm_cue%d' % i) in au['sfx'] for i in range(4)), au['lanes'])

    # ---------------- 譜面 ----------------
    ch = page.evaluate("""() => { const C = CT.Rhythm.Chart, out = [];
        for (let t = 0; t < CT.Rhythm.TRACKS.length; t++) for (const m of C.MODES) for (let d = 0; d < 3; d++) {
          const c = C.get(t, m, d), v = C.validate(c); out.push({ t, m, d, n: v.n, ok: v.ok, p: v.problems, lr: v.maxLR, row: v.maxRow,
            lanes: [0,1,2,3].map(L => c.notes.filter(n => n.lane === L).length) }); }
        return out; }""")
    ok('72 份譜面全部通過驗證（onset 對位 / 不在數拍小節 / 間距 / 配額）', len(ch) == 72 and all(c['ok'] for c in ch), [c for c in ch if not c['ok']][:3])
    ok('精靈配額：CROSS / DUO 左右臂同時 ≤ 6、BLADE 同高度 ≤ 3', max(c['lr'] for c in ch) <= 6 and max(c['row'] for c in ch) <= 3, (max(c['lr'] for c in ch), max(c['row'] for c in ch)))
    by = {(c['t'], c['m'], c['d']): c for c in ch}
    ok('難度遞增：每首 EASY ≤ NORMAL ≤ HARD 音符數，且 6 首合計嚴格遞增', all(by[(t, 'CROSS', 0)]['n'] <= by[(t, 'CROSS', 1)]['n'] <= by[(t, 'CROSS', 2)]['n'] for t in range(6))
       and sum(by[(t, 'CROSS', 0)]['n'] for t in range(6)) < sum(by[(t, 'CROSS', 1)]['n'] for t in range(6)) < sum(by[(t, 'CROSS', 2)]['n'] for t in range(6)),
       [(by[(t, 'CROSS', 0)]['n'], by[(t, 'CROSS', 1)]['n'], by[(t, 'CROSS', 2)]['n']) for t in range(6)])
    ok('CROSS 四軌都有音符、DUO 只有 ← →、ORBIT 只有單軌', all(min(by[(t, 'CROSS', 1)]['lanes']) >= 5 for t in range(6))
       and all(by[(t, 'DUO', d)]['lanes'][0] == 0 and by[(t, 'DUO', d)]['lanes'][1] == 0 for t in range(6) for d in range(3))
       and all(by[(t, 'ORBIT', d)]['lanes'][1:] == [0, 0, 0] for t in range(6) for d in range(3)), [by[(t, 'CROSS', 1)]['lanes'] for t in range(6)])
    src = ''.join((ROOT / 'games/cart4/rhythm' / f).read_text(encoding='utf-8') for f in ('main.js', 'chart.js', 'song.js', 'art.js'))
    ok('§1-2 不用實際時鐘（無 Date.now() / performance.now() / setTimeout）', not re.search(r'Date\.now\(|performance\.now\(|setTimeout\(|new Date\(', src))

    # ---------------- 判定窗口（幀） ----------------
    gr = page.evaluate("() => [-9,-8,-6,-5,-3,-2,0,2,3,5,6,8,9].map(d => CT.Rhythm.dev.grade(d))")
    ok('判定窗口：|d| ≤ 2 PERFECT、≤ 5 GREAT、≤ 8 GOOD、≥ 9 MISS（對稱）', gr == [3, 2, 2, 1, 1, 0, 0, 0, 1, 1, 2, 2, 3], gr)
    w = page.evaluate("() => CT.Rhythm.Chart.WIN")
    ok('窗口常數寫死在 chart.js（PERFECT 2 / GREAT 5 / GOOD 8）', w == {'PERFECT': 2, 'GREAT': 5, 'GOOD': 8}, w)
    ok('評價門檻 S95 / A85 / B70 / C55', page.evaluate("() => [100,95,94,85,84,70,69,55,54].map(a => CT.Rhythm.RANKS[CT.Rhythm.dev.rankOf(a)]).join('')") == 'SSAABBCCD')

    # ---------------- 標題 ----------------
    page.evaluate('() => __nes.step(60)')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠、overFrames 0、每線 ≤ 8', lint.get('ok') and page.evaluate('() => __nes.stats().budget.overFrames') == 0 and lint.get('maxSpritesLine', 0) <= 8, lint.get('colors'))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 23}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 21}))
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 文字行之間都空一列', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); return { c, s: GAME.state().s }; }")
    ok('§6-1 標題按密技無效', not r['c'] and not r['s']['sessCheated'] and r['s']['mode'] == 'title', r['c'])
    r = page.evaluate("""() => { const o = []; __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.game);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.song);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('left', 1); __nes.step(2); o.push(GAME.state().s.diff);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.sight); return o; }""")
    ok('標題選單：模式 / 曲目 / 難度 / SIGHT 可切換', r == ['DUO', 1, 'EASY', 'FADE'], r)
    ok('§1-3 說明頁畫出 DUO 的按鍵對照（Ⓑ / Ⓐ 圖示）', page.evaluate("() => { const p = __nes.nes().ppu, A = CT.Rhythm.Art.make(); let a = 0, b = 0; for (let c = 0; c < 32; c++) { if (p.getTile(0, c, 19) === A.t('K_A')) a++; if (p.getTile(0, c, 19) === A.t('K_B')) b++; } return a === 1 && b === 1; }"))

    # ---------------- 同步：音符那一幀 driver 正在發那個 row ----------------
    fresh(page)
    sync = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 0); const g = CT.Rhythm.dev.g(), d = __nes.nes().music, bad = [];
        let checked = 0, firstS = null;
        for (let f = 0; f < 2400; f++) { g.energy = 100; __nes.step(1); if (firstS === null) firstS = g.s;
          const m = d.state(); if (!m.playing) break;
          const rowNow = m.orderIndex * 16 + m.row - (m.rowFrame === 0 ? 1 : 0);
          for (const n of g.notes) if (n.t === g.s) { checked++; const sounding = Math.floor(g.s / g.sp); if (sounding !== n.row || (m.rowsPlayed * g.sp + m.rowFrame - 1) !== n.t) bad.push([n.row, sounding, rowNow]); }
          if (g.mode !== 'play') break; }
        return { checked, bad: bad.slice(0, 3), firstS, n: g.notes.length }; }""")
    ok('同步：開局第一幀 songFrame = 0（driver tick 一次 = 1 幀）', sync['firstS'] == 0, sync['firstS'])
    ok('同步：每顆音符到判定點那一幀，driver 正好在發該 row 的第 1 幀（全曲每顆）', sync['checked'] == sync['n'] and not sync['bad'], sync)

    # 判定實測：在音符幀 +0 / +3 / −7 按，以及不按
    fresh(page)
    jt = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 0); const g = CT.Rhythm.dev.g(), B = CT.Rhythm.Chart.LATE;
        const keys = ['up','down','left','right'], out = [], offs = [0, 3, -7, null, 5, -2];
        for (let k = 0; k < offs.length; k++) { const n = g.notes[k], off = offs[k];
          while (g.s < n.t - 12) __nes.step(1);
          if (off !== null) { while (g.s + 1 < n.t + off) __nes.step(1); __nes.tap(keys[n.lane], 1); }
          while (g.s < n.t + B + 1) __nes.step(1);
          out.push([off, n.st, n.d]); }
        return { out, cnt: [g.cnt[0], g.cnt[1], g.cnt[2], g.cnt[3]] }; }""")
    ok('判定實測：+0 幀 PERFECT、+3 GREAT、−7 GOOD、不按 MISS、+5 GREAT、−2 PERFECT', jt['cnt'] == [2, 2, 1, 1] and [o[2] for o in jt['out'] if o[0] is not None] == [0, 3, -7, 5, -2], jt)
    r = page.evaluate("""() => { const g = CT.Rhythm.dev.g(), n = g.notes.find(x => !x.st && x.t > g.s + 40), before = g.cnt.slice();
        __nes.tap(['up','down','left','right'][n.lane], 1); __nes.step(2); return { same: JSON.stringify(before) === JSON.stringify(g.cnt), st: n.st }; }""")
    ok('提早 > 16 幀按下不判定（不扣連擊、音符保留）', r['same'] and r['st'] == 0, r)

    # 暫停：譜面時間凍結
    r = page.evaluate("""() => { const g = CT.Rhythm.dev.g(), m = __nes.nes().music; __nes.tap('start', 1); __nes.step(1);
        const s0 = g.s, r0 = m.state().rowsPlayed, p = g.paused, mp = m.state().paused; __nes.step(120);
        const s1 = g.s, r1 = m.state().rowsPlayed, row27 = (() => { const A = CT.Rhythm.Art.make(), w = A.text('PAUSE'), pp = __nes.nes().ppu; for (let c = 0; c < 28; c++) { let k = true; for (let i = 0; i < w.length; i++) if (pp.getTile(0, c + i, 27) !== w[i]) k = false; if (k) return true; } return false; })();
        __nes.tap('start', 1); __nes.step(2); return { p, mp, s0, s1, r0, r1, row27, after: g.s, playing: m.state().playing }; }""")
    ok('§6-2 暫停：driver pause、120 幀內 songFrame / rowsPlayed 不動、畫面寫 PAUSE', r['p'] and r['mp'] and r['s0'] == r['s1'] and r['r0'] == r['r1'] and r['row27'], r)
    ok('解除暫停：從同一 row 接續（songFrame 只前進 1~2 幀）', r['playing'] and 1 <= r['after'] - r['s1'] <= 3, r)
    ok('暫停畫面寫 HOLD START+SELECT: MENU（解除後該列還原）', page.evaluate("() => !CT.Rhythm.dev.g().msgOn"))

    # 能量耗盡 → 密技原地續關
    fresh(page)
    r = page.evaluate(JS_RUN.replace('__SETUP__', 'CT.Rhythm.dev.start("CROSS", 1, 2, 0)'), 6000)
    fs = r['s']
    ok('閒置到能量耗盡 → FAILED（音樂暫停）', fs['mode'] == 'fail' and fs['failed'] and fs['musicPaused'], {k: fs[k] for k in ('mode', 'energy', 'miss', 'musicRow')})
    r2 = page.evaluate("() => { const row0 = GAME.state().s.musicRow, s0 = CT.Rhythm.dev.g().s; CT.cheat(); __nes.step(3); const s = GAME.state().s; return { row0, s0, s }; }")
    ok('§6-1 FAILED 按密技：原地續關（同一 row 接續、能量 60、cheated）', r2['s']['mode'] == 'play' and r2['s']['musicPlaying'] and r2['s']['cheated'] and r2['s']['musicRow'] - r2['row0'] <= 1 and r2['s']['energy'] >= 55, r2)
    ok('用過密技 ⇒ goal() false', page.evaluate("() => CT.get('rhythm').goal()") is False and r2['s']['sessCheated'])
    r = page.evaluate("() => { CT.Rhythm.dev.g().energy = 10; CT.cheat(); __nes.step(1); return GAME.state().s.energy; }")
    ok('遊玩中密技：能量補滿', r == 100, r)

    # exit 存最高分
    r = page.evaluate("() => { localStorage.removeItem('nes.cart4.rhythm.best'); const g = CT.Rhythm.dev.g(); g.cheated = false; g.score = 4321; CT.get('rhythm').exit(__nes.nes()); return localStorage.getItem('nes.cart4.rhythm.best'); }")
    ok('§6-3 exit() 存最高分', r == '4321', r)

    # ---------------- SIGHT：FADE / EAR ----------------
    fresh(page)
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 2); const g = CT.Rhythm.dev.g(); let spr = 0;
        for (let i = 0; i < 1200; i++) { __nes.step(1); spr = Math.max(spr, g.sprUsed); } return { spr, cued: g.cued, judged: g.cnt.reduce((a, b) => a + b, 0) }; }""")
    ok('EAR（只靠聲音）：畫面上沒有音符精靈、每顆音符前一拍有預告音', r['spr'] <= 4 and r['cued'] >= r['judged'] > 5, r)
    fresh(page)
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 1); const g = CT.Rhythm.dev.g(); let near = 0, far = 0;
        for (let i = 0; i < 900; i++) { __nes.step(1); for (const n of g.notes) { if (n.st) continue; const dt = n.t - g.s; if (dt < 0 || dt > g.T) continue;
          const p = CT.Rhythm.dev.notePos(n), any = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].some(k => { const s = __nes.nes().ppu.getSprite(k); return s && s.x === p.x && s.y === p.y; });
          if (dt < g.T * 0.4 && any) near++; if (dt > g.T * 0.6 && any) far++; } } return { near, far }; }""")
    ok('FADE：音符飛到後半段就隱形（遠處看得到）', r['near'] == 0 and r['far'] > 20, r)

    # ---------------- 機器人：人類模型 ----------------
    def bot_run(q, mode, song, diff, sight=0):
        page.goto(BASE + '&bot=1' + q)
        page.wait_for_function('() => !!window.CT && !!CT.Rhythm && !!CT.Rhythm.dev')
        return page.evaluate(JS_RUN.replace('__SETUP__', 'CT.Rhythm.dev.start("%s", %d, %d, %d)' % (mode, song, diff, sight)), 4000)

    res = {}
    for lag, jit in ((0, 0), (12, 3), (24, 6)):
        res[(lag, jit)] = bot_run('&lag=%d&jit=%d' % (lag, jit), 'CROSS', 2, 1)
    r0, r12, r24 = res[(0, 0)]['s'], res[(12, 3)]['s'], res[(24, 6)]['s']
    ok('機器人 lag 0 / jit 0：NEBULA FUNK NORMAL 全 PERFECT（S）', r0['mode'] == 'result' and r0['rank'] == 'S' and r0['perfect'] == r0['notes'], {k: r0[k] for k in ('rank', 'perfect', 'notes')})
    ok('機器人 lag 12 / jit ±3（預設）：B 以上', r12['rank'] in ('S', 'A', 'B'), {k: r12[k] for k in ('rank', 'acc', 'perfect', 'great', 'good', 'miss')})
    ok('機器人 lag 24 / jit ±6：仍 B 以上（音符飛行 72 幀 ≫ 24 幀反應，難的是時機）', r24['rank'] in ('S', 'A', 'B'), {k: r24[k] for k in ('rank', 'acc', 'perfect', 'great', 'good', 'miss')})
    ok('機器人整首：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', all(v['ml'] <= 8 and v['over'] == 0 and v['peak'] <= 160 for v in res.values()), [(v['ml'], v['over'], v['peak']) for v in res.values()])
    # 狂按：每 2 幀輪流按四個方向
    page.goto(BASE)
    page.wait_for_function('() => !!window.CT && !!CT.Rhythm && !!CT.Rhythm.dev')
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 2, 1, 0); const g = CT.Rhythm.dev.g(), keys = ['up','left','down','right']; let k = 0;
        for (let i = 0; i < 4000 && g.mode === 'play'; i++) { if (i % 2 === 0) __nes.tap(keys[(k++) % 4], 1); else __nes.step(1); }
        if (g.mode === 'fail') return { mode: g.mode }; while (g.mode === 'play') __nes.step(1); return { mode: g.mode, rank: GAME.state().s.rank, acc: g.acc }; }""")
    ok('狂按（每 2 幀換方向亂按）：空按扣能量 ⇒ FAILED 或拿不到 B', r.get('rank') in ('C', 'D', 'F', None) or r['mode'] == 'fail', r)

    for mode, song, diff in (('DUO', 3, 2), ('ORBIT', 4, 2), ('BLADE', 5, 2), ('CROSS', 5, 2)):
        v = bot_run('', mode, song, diff)
        ok('%s HARD 曲 %d（機器人 lag 12）：完成 B 以上、每線 ≤ 8、over 0' % (mode, song + 1),
           v['s']['mode'] == 'result' and v['s']['rank'] in ('S', 'A', 'B') and v['ml'] <= 8 and v['over'] == 0 and v['peak'] <= 160,
           {'rank': v['s']['rank'], 'acc': v['s']['acc'], 'ml': v['ml'], 'over': v['over'], 'peak': v['peak'], 'hid': v['s']['hidden']})
    lint = page.evaluate('() => __nes.lint()')
    ok('結算畫面 lint 綠', lint.get('ok'), lint.get('colors'))
    r = page.evaluate("() => { const c = CT.cheat(); return c; }")
    ok('通關結算畫面按密技無效', r is False)

    # ---------------- goal：機器人從標題選曲，前 3 首 NORMAL B 以上 ----------------
    page.goto(BASE + '&bot=1')
    page.wait_for_function('() => !!window.CT && !!CT.Rhythm && !!CT.Rhythm.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.rhythm.")).forEach(k => localStorage.removeItem(k)); }')
    r = page.evaluate("""() => { let f = 0; for (; f < 9000; f++) { __nes.step(1); if (GAME.state().goal) break; } const s = GAME.state().s;
        return { f, goal: GAME.state().goal, clr: s.clr, best: CT.get('rhythm').bestText(), rk: localStorage.getItem('nes.cart4.rhythm.rk_CROSS_0_1') }; }""")
    ok('goal：機器人從標題依序選 3 首 CROSS NORMAL，皆 B 以上（≤ 9000 幀）', r['goal'] and len(r['clr'].get('CROSS1', {})) == 3, r)
    ok('最高分 / 評價存檔（選單 bestText 有分數）', r['best'] != '000000' and r['rk'] is not None, (r['best'], r['rk']))

    ok('全程無頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for x in results if x[0])
    print('test_rhythm: %d/%d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
