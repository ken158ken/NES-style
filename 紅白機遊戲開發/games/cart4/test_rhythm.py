# -*- coding: utf-8 -*-
"""《星塵節奏 STAR BEAT》（cart4 槽 5，id = rhythm）自動驗證。

重點：6 首原創曲 + 譜面（4 模式 × 3 難度 = 72 份，全部驗證 onset 對位 / 間距 / 精靈配額）、
      譜面與 APU driver row 嚴格同步（音符那一幀 driver 正在發那個 row）、判定窗口（幀）NORMAL PERFECT ≤ 3 / GREAT ≤ 6 / GOOD ≤ 10
      （EASY 4/8/12、HARD 2/5/8）、OFFSET（判定 / 畫面用 songFrame − OFFSET）+ 校正畫面、EAR 預告音（p1、vol 13、8 幀、四種輪廓）
      + SOUND CHECK、觸控斜方向（同幀兩方向不扣空按）、**真人模型**（蒙地卡羅 1000 局 + tools/human_filter.js 包住機器人實跑）、
      暫停凍結譜面時間、FADE / EAR（只靠聲音）模式、能量耗盡 → 密技原地續關、§6 規則、
      機器人人類模型（反應延遲 lag / 時機誤差 jit）0 / 12 / 24 幀與狂按對照、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart4.html?game=rhythm&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Rhythm.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_rhythm.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import os
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HUMAN_JS = ROOT / 'tools' / 'human_filter.js'
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=rhythm'
VERBOSE = '-v' in sys.argv
QUICK = os.environ.get('NES_QUICK') == '1' or '--quick' in sys.argv   # run_all.sh --quick 設 NES_QUICK=1：略過長時間的真人模型 / 蒙地卡羅（完整 run_all 照跑）
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
JS_MC = r"""
(P) => {
  // P: {sigma, bias, runs, rules:{win:[p,g,good], drain, w:[100,70,50], b:65}, wrong, lapse, seed, songs}
  const C = CT.Rhythm.Chart; let seed = P.seed || 1;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v); };
  const R = P.rules, songs = P.songs || [0, 1, 2];
  const charts = songs.map(s => C.get(s, 'CROSS', 1).notes);
  let allB = 0, anyF = 0; const accs = [];
  for (let r = 0; r < P.runs; r++) {
    let okAll = true, fail = false;
    for (const notes of charts) {
      let e = 60, sum = 0, failed = false, prevL = -1;
      for (const n of notes) {
        let d = Math.round(P.bias + P.sigma * gauss()), q;
        const a = Math.abs(d);
        let empty = 0;
        if (P.wrong && prevL >= 0 && n.lane !== prevL && rnd() < P.wrong) { q = 3; empty = 1; }
        else if (P.lapse && rnd() < P.lapse) q = 3;
        else q = a <= R.win[0] ? 0 : (a <= R.win[1] ? 1 : (a <= R.win[2] ? 2 : 3));
        if (q === 3 && d > R.win[2]) empty = 1;
        prevL = n.lane;
        if (q < 3) { sum += R.w[q]; e = Math.min(100, e + [2, 1, 0][q]); } else e -= R.drain;
        e -= empty;
        if (e <= 0) { failed = true; break; }
      }
      const acc = Math.floor(sum / notes.length);
      accs.push(acc);
      if (failed) { fail = true; okAll = false; } else if (acc < R.b) okAll = false;
    }
    if (okAll) allB++; if (fail) anyF++;
  }
  accs.sort((a, b) => a - b);
  return { allB: Math.round(allB * 1000 / P.runs) / 10, anyF: Math.round(anyF * 1000 / P.runs) / 10, accMed: accs[accs.length >> 1] };
}
"""
MC_LOG = []
HUM_LOG = []
# 跑到結算（或上限）
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
    gr = page.evaluate("() => [-11,-10,-7,-6,-4,-3,0,3,4,6,7,10,11].map(d => CT.Rhythm.dev.grade(d, 1))")
    ok('判定窗口 NORMAL：|d| ≤ 3 PERFECT、≤ 6 GREAT、≤ 10 GOOD、≥ 11 MISS（對稱）', gr == [3, 2, 2, 1, 1, 0, 0, 0, 1, 1, 2, 2, 3], gr)
    w = page.evaluate("() => [CT.Rhythm.Chart.WIN, CT.Rhythm.Chart.DIFFS.map(d => d.win), CT.Rhythm.Chart.DIFFS.map(d => d.drain), CT.Rhythm.dev.ACC_W]")
    ok('窗口常數在 chart.js：NORMAL 3/6/10、EASY 4/8/12、HARD 2/5/8；NORMAL drain 4；ACC 權重 GOOD 50',
       w[0] == {'PERFECT': 3, 'GREAT': 6, 'GOOD': 10} and w[1] == [[4, 8, 12], [3, 6, 10], [2, 5, 8]] and w[2][1] == 4 and w[3] == [100, 70, 50], w)
    ok('評價門檻 S95 / A85 / B65 / C50', page.evaluate("() => [100,95,94,85,84,65,64,50,49].map(a => CT.Rhythm.RANKS[CT.Rhythm.dev.rankOf(a)]).join('')") == 'SSAABBCCD')

    # ---------------- 標題 ----------------
    page.evaluate('() => __nes.step(60)')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠、overFrames 0、每線 ≤ 8', lint.get('ok') and page.evaluate('() => __nes.stats().budget.overFrames') == 0 and lint.get('maxSpritesLine', 0) <= 8, lint.get('colors'))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 24}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 22}))
    ok('P3-2 標題第 0、1 列（可見 y < 8）沒有任何圖塊', page.evaluate("() => { const p = __nes.nes().ppu; for (let r = 0; r < 2; r++) for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) return false; return true; }"))
    ok('P2-1 標題有 OFFSET 列（預設 +4F 67MS）', page.evaluate(JS_ROW_HAS, {'s': 'OFFSET +4F 67MS', 'r': 16}) and page.evaluate("() => GAME.state().s.offset") == 4)
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 文字行之間都空一列', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); return { c, s: GAME.state().s }; }")
    ok('§6-1 標題按密技無效', not r['c'] and not r['s']['sessCheated'] and r['s']['mode'] == 'title', r['c'])
    r = page.evaluate("""() => { const o = []; __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.game);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.song);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('left', 1); __nes.step(2); o.push(GAME.state().s.diff);
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.sight); return o; }""")
    ok('標題選單：模式 / 曲目 / 難度 / SIGHT 可切換', r == ['DUO', 1, 'EASY', 'FADE'], r)
    ok('§1-3 說明頁畫出 DUO 的按鍵對照（Ⓑ / Ⓐ 圖示）', page.evaluate("() => { const p = __nes.nes().ppu, A = CT.Rhythm.Art.make(); let a = 0, b = 0; for (let c = 0; c < 32; c++) { if (p.getTile(0, c, 20) === A.t('K_A')) a++; if (p.getTile(0, c, 20) === A.t('K_B')) b++; } return a === 1 && b === 1; }"))
    # OFFSET 手調 / 存檔 / 範圍
    r = page.evaluate("""() => { const o = []; __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(GAME.state().s.offset, localStorage.getItem('nes.cart4.rhythm.offset'));
        for (let i = 0; i < 30; i++) { __nes.tap('right', 1); __nes.step(1); } o.push(GAME.state().s.offset);
        for (let i = 0; i < 30; i++) { __nes.tap('left', 1); __nes.step(1); } o.push(GAME.state().s.offset);
        for (let i = 0; i < 8; i++) { __nes.tap('right', 1); __nes.step(1); } o.push(GAME.state().s.offset, localStorage.getItem('nes.cart4.rhythm.offset')); return o; }""")
    ok('P2-1 OFFSET 列 ←→ 手調（+5 存檔）、範圍 −4 ~ +12', r == [5, '5', 12, -4, 4, '4'], r)
    r = page.evaluate("() => { __nes.tap('up,right', 1); __nes.step(2); return GAME.state().s.row; }")
    ok('P2-7 標題同一幀按兩個方向（斜）⇒ 不動作', r == 4, r)

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

    # 判定實測（OFFSET 0）：在音符幀 +0 / +4 / −8 按，以及不按
    fresh(page, '&offset=0')
    jt = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 0); const g = CT.Rhythm.dev.g(), B = CT.Rhythm.Chart.LATE;
        const keys = ['up','down','left','right'], out = [], offs = [0, 4, -8, null, 6, -3];
        for (let k = 0; k < offs.length; k++) { const n = g.notes[k], off = offs[k];
          while (g.s < n.t - 12) __nes.step(1);
          if (off !== null) { while (g.s + 1 < n.t + off) __nes.step(1); __nes.tap(keys[n.lane], 1); }
          while (g.s < n.t + B + 1) __nes.step(1);
          out.push([off, n.st, n.d]); }
        return { out, cnt: [g.cnt[0], g.cnt[1], g.cnt[2], g.cnt[3]] }; }""")
    ok('判定實測（OFFSET 0）：+0 PERFECT、+4 GREAT、−8 GOOD、不按 MISS、+6 GREAT、−3 PERFECT', jt['cnt'] == [2, 2, 1, 1] and [o[2] for o in jt['out'] if o[0] is not None] == [0, 4, -8, 6, -3], jt)
    r = page.evaluate("""() => { const g = CT.Rhythm.dev.g(), n = g.notes.find(x => !x.st && x.t > g.s + 40), before = g.cnt.slice();
        __nes.tap(['up','down','left','right'][n.lane], 1); __nes.step(2); return { same: JSON.stringify(before) === JSON.stringify(g.cnt), st: n.st }; }""")
    ok('提早 > 18 幀按下不判定（不扣連擊、音符保留）', r['same'] and r['st'] == 0, r)
    # OFFSET 5：按下那幀的 songFrame = 音符幀 + 5（= 聲音延遲 5 幀的人「準時」按）⇒ PERFECT 0
    fresh(page, '&offset=5')
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 0); const g = CT.Rhythm.dev.g(), keys = ['up','down','left','right'], out = [];
        for (let k = 0; k < 3; k++) { const n = g.notes[k]; while (g.s + 1 < n.t + 5) __nes.step(1); __nes.tap(keys[n.lane], 1); __nes.step(1); out.push([n.st, n.d]); }
        const n3 = g.notes[3], pos = CT.Rhythm.dev.notePos(n3); return { out, off: g.off, sj: g.sj, s: g.s, sjOk: g.s - g.sj }; }""")
    ok('P2-1 OFFSET 5：songFrame = 音符 + 5 時按 ⇒ 判 PERFECT（d = 0），畫面 / 判定用 sj = s − 5', all(o == [1, 0] for o in r['out']) and r['sjOk'] == 5, r)
    # P2-7：同一幀兩個方向（觸控斜區）⇒ 只判有音符的那一軌、另一軌不扣能量
    fresh(page, '&offset=0')
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 0); const g = CT.Rhythm.dev.g(), keys = ['up','down','left','right'], other = ['right','left','up','down'];
        const n = g.notes.find(x => x.lane === 0); while (g.s + 1 < n.t) __nes.step(1); const e0 = g.energy; __nes.tap('up,right', 1); __nes.step(1);
        const a = { st: n.st, d: n.d, de: g.energy - e0, diag: g.diag };
        // 找一段前後 40 幀都沒有音符的空白（g.sj 時間）
        let T = -1; for (let i = 1; i < g.notes.length; i++) if (g.notes[i].t - g.notes[i - 1].t > 90 && g.notes[i - 1].t > g.sj + 10) { T = g.notes[i - 1].t + 45; break; }
        while (g.sj + 1 < T) { g.energy = 50; __nes.step(1); }
        const e1 = g.energy; __nes.tap('up,left', 1); const e2 = g.energy; __nes.step(2); const e3 = g.energy; __nes.tap('up', 1);
        return { a, T, diagEmpty: e2 - e1, single: g.energy - e3 }; }""")
    ok('P2-7 斜方向（↑+→ 同幀）：↑ 音符照判 PERFECT、→ 不算空按（能量 +2）', r['a']['st'] == 1 and r['a']['d'] == 0 and r['a']['de'] == 2 and r['a']['diag'] >= 1, r)
    ok('P2-7 空白處斜按不扣能量、單一方向空按仍 −1（防狂按）', r['diagEmpty'] == 0 and r['single'] == -1, r)


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
        for (let i = 0; i < 900; i++) { __nes.step(1); for (const n of g.notes) { if (n.st) continue; const dt = n.t - g.sj; if (dt < 0 || dt > g.T) continue;
          const p = CT.Rhythm.dev.notePos(n), any = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].some(k => { const s = __nes.nes().ppu.getSprite(k); return s && s.x === p.x && s.y === p.y; });
          if (dt < g.T * 0.4 && any) near++; if (dt > g.T * 0.6 && any) far++; } } return { near, far }; }""")
    ok('FADE：音符飛到後半段就隱形（遠處看得到）', r['near'] == 0 and r['far'] > 20, r)

    # ---------------- P2-2 EAR：預告音清楚可辨 ----------------
    fresh(page)
    r = page.evaluate("""() => { const S = CT.Rhythm.Audio.SFX, out = [];
        for (let i = 0; i < 4; i++) { const d = S['rhythm_cue' + i], ch = Object.keys(d.data)[0], fr = d.data[ch].filter(f => !f.off);
          let midi = [], cur = null; fr.forEach(f => { if (f.note !== undefined) cur = f.note; midi.push(cur); });
          out.push({ ch, len: fr.length, vmax: Math.max(...fr.map(f => f.vol)), vols: fr.map(f => f.vol), notes: midi, duty: fr[0].duty }); }
        const tick = S.rhythm_tick && Object.keys(S.rhythm_tick.data); return { out, tick, ear: CT.Rhythm.TRACKS.map(t => t.earKey) }; }""")
    cues = r['out']
    ok('P2-2 預告音：走 p1、長 8 幀、最大音量 ≥ 13', all(c['ch'] == 'p1' and c['len'] >= 6 and c['vmax'] >= 13 for c in cues), [(c['ch'], c['len'], c['vmax']) for c in cues])
    ok('P2-2 四種輪廓可辨：↑ 上行、↓ 下行、← 低音單擊、→ 高音雙擊（中間有靜音）、音色（duty）不同',
       cues[0]['notes'][0] != cues[0]['notes'][-1] and cues[1]['notes'][0] == cues[0]['notes'][-1] and cues[1]['notes'][-1] == cues[0]['notes'][0]
       and len(set(cues[2]['notes'])) == 1 and 0 in cues[3]['vols'] and len(set(cues[3]['notes'])) == 1 and cues[2]['duty'] != cues[3]['duty'], [(c['notes'][0], c['notes'][-1], c['duty']) for c in cues])
    ok('P2-2 EAR 命中音是雜訊（rhythm_tick，無音高）、每首有 EAR 版曲子', r['tick'] == ['noi'] and all(r['ear']), r)
    r = page.evaluate("""() => { CT.Rhythm.dev.start('CROSS', 0, 1, 2); const g = CT.Rhythm.dev.g(), m = __nes.nes().music, apu = __nes.nes().apu;
        const runs = {}, ref = [], hits = {}, melV = [], cueV = [], p2V = []; let cur = null, len = 0, lastOwner = null;
        const orig = m.sfx.bind(m); m.sfx = function (n, o) { hits[n] = (hits[n] || 0) + 1; if (n.indexOf('rhythm_cue') === 0 && g.s < g.barF) ref.push(n); return orig(n, o); };
        const KEYS = ['up', 'down', 'left', 'right'];
        for (let i = 0; i < 1500 && g.mode === 'play'; i++) { g.energy = 100; const nn = g.notes.find(x => !x.st && x.t === g.sj + 1);
          if (nn && (nn.id % 3)) __nes.tap(KEYS[nn.lane], 1); else __nes.step(1); const st = m.state(), p1 = st.channels[0], own = p1.owner, a = apu.state();
          if (own && own.indexOf('rhythm_cue') === 0) { cueV.push(a.pulse1.volume); if (own === lastOwner) len++; else { if (lastOwner) (runs[lastOwner] = runs[lastOwner] || []).push(len); len = 1; } }
          else { if (lastOwner) (runs[lastOwner] = runs[lastOwner] || []).push(len); len = 0; if (p1.on) melV.push(p1.vol); }
          if (!st.channels[1].owner && st.channels[1].on) p2V.push(st.channels[1].vol);
          lastOwner = own && own.indexOf('rhythm_cue') === 0 ? own : null; }
        m.sfx = orig; const allRuns = [].concat(...Object.values(runs));
        return { ref, hits, minRun: Math.min(...allRuns), nRuns: allRuns.length, cueMax: Math.max(...cueV), melMax: Math.max(...melV), p2Max: Math.max(...p2V), song: CT.Rhythm.Audio.current }; }""")
    ok('P2-2 EAR 數拍第 1 小節依序播 4 個參考音（↑ ↓ ← →）', r['ref'] == ['rhythm_cue0', 'rhythm_cue1', 'rhythm_cue2', 'rhythm_cue3'], r['ref'])
    ok('P2-2 EAR 實播：預告音每次在 p1 連續響 ≥ 6 幀、APU 音量 ≥ 12', r['nRuns'] > 20 and r['minRun'] >= 6 and r['cueMax'] >= 12, {k: r[k] for k in ('nRuns', 'minRun', 'cueMax')})
    ok('P2-2 EAR 實播：旋律（EAR 版，音量減半）與和聲都比預告音小、命中音全是 rhythm_tick',
       r['melMax'] < r['cueMax'] and r['p2Max'] < r['cueMax'] and r['song'].endswith('_ear') and not any(k.startswith('rhythm_hit') for k in r['hits']) and r['hits'].get('rhythm_tick', 0) > 5,
       {k: r[k] for k in ('melMax', 'p2Max', 'cueMax', 'song', 'hits')})

    # ---------------- P3-6 SOUND CHECK ----------------
    fresh(page)
    r = page.evaluate("""() => { const g = CT.Rhythm.dev.g(); g.sight = 2; g.diff = 2; __nes.tap('start', 1); __nes.step(2); const a = GAME.state().s.mode;
        __nes.step(30); __nes.tap('b', 1); __nes.step(2); const b = GAME.state().s;
        return { a, bm: b.mode, notice: b.notice }; }""")
    ok('P3-6 EAR 開始前先進 SOUND CHECK；Ⓑ 回標題並提示靜音開關', r['a'] == 'scheck' and r['bm'] == 'title' and 'SILENT' in r['notice']
       and page.evaluate(JS_ROW_HAS, {'s': 'CHECK SILENT', 'r': 6}), r)
    r = page.evaluate("""() => { const m = __nes.nes().music, seen = {}; const orig = m.sfx.bind(m); m.sfx = function (n, o) { seen[n] = 1; return orig(n, o); };
        __nes.tap('start', 1); __nes.step(170); const txtOk = GAME.state().s.mode; __nes.tap('a', 1); __nes.step(2); m.sfx = orig; const s = GAME.state().s;
        return { txtOk, seen: Object.keys(seen), mode: s.mode, sight: s.sight, diff: s.diff }; }""")
    ok('P3-6 SOUND CHECK 輪播 4 個預告音；Ⓐ 開始、HARD 自動降為 NORMAL（EAR 不開放 HARD）',
       r['txtOk'] == 'scheck' and all(('rhythm_cue%d' % i) in r['seen'] for i in range(4)) and r['mode'] == 'play' and r['sight'] == 'EAR' and r['diff'] == 'NORMAL', r)
    ok('P3-6 SOUND CHECK / 校正畫面 lint 綠', page.evaluate("() => { CT.Rhythm.dev.soundCheck(); __nes.step(3); const a = __nes.lint().ok; CT.Rhythm.dev.calib(); __nes.step(3); return a && __nes.lint().ok; }"))

    # ---------------- P2-1 OFFSET 校正畫面 ----------------
    def calib(page, dev):
        return page.evaluate("""(dev) => { CT.Rhythm.dev.calib(); const g = CT.Rhythm.dev.g(), m = __nes.nes().music; const beats = [];
            const orig = m.sfx.bind(m); m.sfx = function (n, o) { if (n.indexOf('rhythm_click') === 0) beats.push(g.cal.t); return orig(n, o); };
            for (let k = 4; k < 4 + 12 && g.cal && g.cal.res === null; k++) { const tgt = k * 30 + dev[(k - 4) % dev.length]; while (g.cal.t + 1 < tgt) __nes.step(1); __nes.tap('a', 1); }
            m.sfx = orig; const st = GAME.state().s; return { cal: st.cal, beats: beats.slice(0, 6), mode: st.mode }; }""", dev)
    fresh(page)
    r = calib(page, [5, 4, 6, 5, 5, 3, 7, 5])
    ok('P2-1 校正：節拍器每 30 幀一拍（嗶聲在第 k×30 幀發聲）、跟著按 8 下 ⇒ 中位數 +5', r['beats'] == [0, 30, 60, 90, 120, 150] and r['cal']['res'] == 5 and len(r['cal']['taps']) == 8, r)
    r2 = page.evaluate("() => { __nes.step(2); __nes.tap('a', 1); __nes.step(2); return [GAME.state().s.mode, GAME.state().s.offset, localStorage.getItem('nes.cart4.rhythm.offset')]; }")
    ok('P2-1 校正結果 Ⓐ 存檔、回標題 OFFSET = +5', r2 == ['title', 5, '5'], r2)
    r = calib(page, [-2, -1, -3, -2, -2, -2, 0, -4])
    ok('P2-1 校正：提早按（負值）也能算（−2）', r['cal']['res'] == -2, r['cal'])
    r = page.evaluate("() => { __nes.tap('b', 1); __nes.step(2); return [GAME.state().s.mode, GAME.state().s.offset]; }")
    ok('P2-1 校正畫面 Ⓑ 不存檔回標題', r == ['title', 5], r)

    if QUICK:
        print('  SKIP（NES_QUICK）真人模型蒙地卡羅 + 真人濾鏡實跑')
    else:
        # ---------------- 真人模型（qa-r8 P2-1 方法）：蒙地卡羅 1000 局 × 前 3 首 CROSS NORMAL ----------------
        OLD = {'win': [2, 5, 8], 'drain': 5, 'w': [100, 70, 40], 'b': 70}
        cur = page.evaluate("() => { const D = CT.Rhythm.Chart.DIFFS[1]; return { win: D.win, drain: D.drain, w: CT.Rhythm.dev.ACC_W, b: CT.Rhythm.RANK_MIN[2] }; }")
        def mc(sigma, bias, rules, runs=1000):
            return page.evaluate(JS_MC, {'sigma': sigma, 'bias': bias, 'runs': runs, 'rules': rules, 'wrong': 0.02, 'lapse': 0.01, 'seed': 7})
        # 偏差：看畫面 +1（螢幕延遲）；跟聲音 = 聲音延遲 L − OFFSET；舊版沒有 OFFSET ⇒ 偏差 = L
        nov_old, nov_new = mc(5, 1, OLD), mc(5, 1, cur)
        aud_old, aud_new = mc(5, 5, OLD), mc(5, 5 - 4, cur)
        pro_aud_old, pro_aud_new = mc(3.5, 5, OLD), mc(3.5, 1, cur)
        s6 = mc(6, 1, cur)
        MC_LOG.extend([('新手 σ5 看畫面', nov_old, nov_new), ('新手 σ5 跟聲音 L5', aud_old, aud_new), ('熟手 σ3.5 跟聲音 L5', pro_aud_old, pro_aud_new), ('σ6 看畫面', None, s6)])
        ok('真人模型：新手 σ5（看畫面）前 3 首全 B ≥ 85%（舊規則對照 < 20%）', nov_new['allB'] >= 85 and nov_old['allB'] < 20, (nov_old, nov_new))
        ok('真人模型：新手 σ5 跟著聲音按（輸出延遲 5 幀、預設 OFFSET 4）全 B ≥ 85%、0 FAILED（舊版 0% B）', aud_new['allB'] >= 85 and aud_new['anyF'] == 0 and aud_old['allB'] == 0, (aud_old, aud_new))
        ok('真人模型：熟手 σ3.5 跟聲音不再系統性按晚（全 B ≥ 95%）', pro_aud_new['allB'] >= 95, (pro_aud_old, pro_aud_new))

        # ---------------- 真人濾鏡（tools/human_filter.js）包住機器人，實際跑遊戲 ----------------
        def human_run(off, mj, sj, songs=(0, 1, 2), seed=7, clk=''):
            page.goto(BASE + '&bot=1&lag=12&jit=0&lead=12&offset=%d' % off + ('&botclk=' + clk if clk else ''))
            page.wait_for_function('() => !!window.CT && !!CT.Rhythm && !!CT.Rhythm.dev && !!CT.current')
            page.add_script_tag(path=str(HUMAN_JS))
            page.evaluate("""(o) => __humInstall({ mj: o.mj, sj: o.sj, groups: {}, swWin: 0, sw0: 0, sw1: 0, refr: 0, lapse: 0, lapseF: 0, seed: o.seed,
                on: () => CT.Rhythm.dev.g().mode === 'play' })""", {'mj': mj, 'sj': sj, 'seed': seed})
            out = []
            for sg in songs:
                v = page.evaluate(JS_RUN.replace('__SETUP__', 'CT.Rhythm.dev.start("CROSS", %d, 1, 0)' % sg), 4000)
                out.append({'rank': v['s']['rank'], 'acc': v['s']['acc'], 'ml': v['ml'], 'over': v['over']})
            return out
        hv = [human_run(4, 13, 5, seed=sd) for sd in (3, 7, 11)]
        HUM_LOG.append(('新手 σ5 看畫面 ×3 種子', hv))
        ok('真人濾鏡：新手 σ5（偏差 +1）實跑前 3 首 × 3 種子，≥ 8/9 首 B 以上；每線 ≤ 8、over 0',
           sum(1 for run in hv for x in run if x['rank'] in ('S', 'A', 'B')) >= 8 and all(x['ml'] <= 8 and x['over'] == 0 for run in hv for x in run), hv)
        # 跟著聲音按：機器人改以 songFrame（聲音產生時間）為基準，濾鏡加上 5 幀聲音延遲 ⇒ 按下時 songFrame ≈ 音符 + 5
        a5 = human_run(5, 17, 3.5, songs=(2,), clk='s')
        a0 = human_run(0, 17, 3.5, songs=(2,), clk='s')
        HUM_LOG.append(('跟聲音 +5 σ3.5：OFFSET 5 / 0', a5 + a0))
        ok('qa-r8 P2-1 ③：偏差 +5、σ3.5 的人在 OFFSET 5 時拿 B 以上，且比 OFFSET 0 準', a5[0]['rank'] in ('S', 'A', 'B') and a5[0]['acc'] > a0[0]['acc'], (a5, a0))

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

    ways = page.evaluate("() => { const T = NES.Touch; if (!T || !T.getWays) return null; const a = T.getWays(); CT.get('rhythm').exit(__nes.nes()); const b = T.getWays(); return [a, b]; }")
    ok('P2-7 init 時 NES.Touch.setWays(4)、exit 設回 8（API 缺席時不報錯）', ways is None or ways == [4, 8], ways)

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
    for name, a, b in MC_LOG:
        print('  [真人模型] %s：舊 %s → 新 %s' % (name, a, b))
    for name, v in HUM_LOG:
        print('  [真人濾鏡] %s：%s' % (name, [(x['rank'], x['acc']) for x in (v if isinstance(v[0], dict) else [y for run in v for y in run])]))
    print('test_rhythm: %d/%d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
