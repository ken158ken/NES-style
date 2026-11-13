# -*- coding: utf-8 -*-
"""《星塵接球》（cart2 槽 5，id = catch）自動驗證。

重點：三模式流程（接星 / 頂球 / 彈跳）、6 張彈跳關卡用「與遊戲同一個 bStep 的解題器」證明可通關、
      機器人：頂球 60 秒 goal + 彈跳 6 關全通 + 接星長跑，全程逐幀量每線精靈 ≤ 8 / VBlank ≤ 160 byte、
      R6 §6 統一規則（密技續關 / 標題無效 / 暫停 BGM / exit 存分 / backTile / 說明空列 / HOLD START+SELECT）。
作法：Playwright 開 `cart2.html?game=catch&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Catch.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_catch.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=catch'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Catch && !!CT.Catch.dev')
    page.evaluate('() => { ["best","best_catch","best_keep","best_bounce"].forEach(k => localStorage.removeItem("nes.cart2.catch." + k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 逐幀跑 n 幀並量硬限制；stop = 'goal' | 'over' | ''
RUN = r"""
(o) => { let ml = 0, pk = 0, i, gapBad = 0;
  for (i = 0; i < o.n; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); pk = Math.max(pk, s.budget.peak);
    const g = CT.Catch.dev.g();
    if (g.sub === 'catch' && g.mode === 'play') {   // 接星：落下物彼此垂直距離 ≥ 8（⇒ 一條掃描線最多 1 顆）
      const ys = g.items.map(t => t.y >> 8).sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k++) if (ys[k] - ys[k - 1] < 8) gapBad++;
    }
    if (o.stop === 'goal' && GAME.state().goal) break;
    if (o.stop === 'over' && GAME.state().s.mode === 'over') break; }
  return { frames: i, maxLine: ml, peak: pk, over: __nes.stats().budget.overFrames, colors: __nes.stats().colors, gapBad, s: GAME.state().s }; }
"""

# 標題 / 結算畫面：說明文字行之間都空一列 + 找字串
TEXT_JS = r"""
(want) => { const p = __nes.nes().ppu, A = CT.Catch.Art.make(), rows = [];
  for (let y = 5; y <= 27; y++) { let n = 0; for (let x = 1; x < 31; x++) { const t = p.getTile(0, x, y); if (t && t !== A.t('BLK')) n++; } rows.push(n > 0); }
  let adj = 0; for (let i = 1; i < rows.length; i++) if (rows[i] && rows[i - 1]) adj++;
  const found = want.map(w => { const tt = A.text(w); for (let y = 0; y < 30; y++) for (let x = 0; x + tt.length <= 32; x++) if (tt.every((t, i) => p.getTile(0, x + i, y) === t)) return true; return false; });
  return { adj, found }; }
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
    reg = page.evaluate("""() => { const g = CT.get('catch'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id catch / order 5 / title / legacy 三款舊作', reg and reg['id'] == 'catch' and reg['order'] == 5 and reg['title']
       and reg['legacy'] == ['ball-catch.html', 'bouncing-ball.html', 'ball-bounce.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    bt = page.evaluate("() => CT.get('catch').bestText()")
    ok('bestText 右對齊 6 字元（秒數 xx.xS）', len(bt) == 6 and bt.endswith('S') and bt == bt.rjust(6), repr(bt))
    a = page.evaluate("""() => { const A = CT.Catch.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        bolo: ['A','B','X'].every(f => [0,1,2,3].every(q => A.spr.index('BOLO_' + f + q) >= 0)) }; }""")
    ok('背景 / 精靈 bank ≤ 256；波羅 3 影格 × 4 磚', a['bg'] <= 256 and a['spr'] <= 256 and a['bolo'], a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Catch.Audio.SONGS), sfx: Object.keys(CT.Catch.Audio.SFX) })")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4，全部 catch_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4
       and all(k.startswith('catch_') for k in au['songs'] + au['sfx']), au)
    lv = page.evaluate("() => CT.Catch.LEVELS.map(L => ({ n: L.name, G: L.G, S: L.S, gems: L.gems.length, kinds: [...new Set(L.p.map(p => p[3]))].join('') }))")
    ok('彈跳：原創關卡 ≥ 6、星門對齊 16×16 屬性（偶數欄列）', len(lv) >= 6 and all(L['G'][0] % 2 == 0 and L['G'][1] % 2 == 0 for L in lv), lv)
    kinds = ''.join(L['kinds'] for L in lv)
    ok('彈跳：機關齊全（彈簧 ^ / 星刺 x / 碎晶 ~ / 苔墊 _）', all(c in kinds for c in '^x~_'), kinds)
    sol = page.evaluate("() => CT.Catch.LEVELS.map((L, n) => { const p = CT.Catch.dev.solveLevel(n); return p ? p.length : -1; })")
    ok('彈跳：6 關都被同一份物理的解題器證明可通關', all(n > 0 for n in sol), sol)
    ph = page.evaluate("() => CT.Catch.K_PHASES.map(p => [p.t, p.balls, p.wind, p.g, p.hit])")
    ok('頂球：階段遞增（時間 / 球數不遞減），60 秒前最多 2 顆', all(ph[i][0] < ph[i + 1][0] and ph[i][1] <= ph[i + 1][1] for i in range(len(ph) - 1))
       and max(p[1] for p in ph if p[0] < 3600) == 2 and ph[-1][1] == 3, ph)
    apex = [p[4] * p[4] / (2 * p[3]) / 256 for p in ph]
    ok('fix-r6 P2-1 三球階段重力 ≤ 16（滯空 ≥ 130 幀）、各階段頂點 130~150 px（不撞天花板 154）',
       all(p[3] <= 16 for p in ph if p[1] == 3 and p[0] == 3600) and all(130 <= a <= 150 for a in apex)
       and all(2 * p[4] / p[3] >= 130 for p in ph if p[0] == 3600), {'apex': [round(a) for a in apex]})

    # ---------------- 標題 ----------------
    r = page.evaluate(TEXT_JS, ['HOLD START+SELECT: MENU', 'CATCH STARS', 'KEEP IT UP', 'BOUNCE TOWER'])
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU、三個模式都列出', all(r['found']), r)
    ok('P3-5 標題說明文字行與行之間都空一列', r['adj'] == 0, r)
    r = page.evaluate("""() => { __nes.step(63); const p = __nes.nes().ppu, A = CT.Catch.Art.make(), w = A.text('C/* = CHEAT');
        let f = false; for (let x = 0; x < 20; x++) if (w.every((t, i) => p.getTile(0, x + i, 25) === t)) f = true;
        const star = A.t('F_STAR'); return { f, star: w[2] === star }; }""")
    ok('§6-6 標題寫 C/★ = CHEAT（★ 用星形字）', r['f'] and r['star'], r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(), p = __nes.nes().ppu, A = CT.Catch.Art.make(), has = (s, x) => A.text(s).every((t, i) => p.getTile(0, x + i, 25) === t);
        const out = []; for (let i = 0; i < 4; i++) { while ((g.t & 63) !== (i & 1 ? 40 : 8)) __nes.step(1); out.push({ go: has('START GO', 3), cheat: has('C/* = CHEAT', 13) }); } return out; }""")
    ok('fix-r6 P3-5 標題只閃 START GO，C/★ = CHEAT 一直顯示', all(x['cheat'] for x in r) and [x['go'] for x in r] == [True, False, True, False], r)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Catch.dev.g(); return { c, cheated: g.cheated, mode: g.mode }; }")
    ok('P3-7 標題畫面按密技無效', not r['c'] and not r['cheated'] and r['mode'] == 'title', r)
    r = page.evaluate("() => { const a = GAME.state().s.sel; __nes.tap('down', 1); __nes.step(1); const b = GAME.state().s.sel; __nes.tap('up', 1); __nes.step(1); return [a, b, GAME.state().s.sel]; }")
    ok('標題 ↑↓ 切換模式（預設 KEEP IT UP）', r == [1, 2, 1], r)

    # ---------------- 接星 ----------------
    r = page.evaluate("""() => { __nes.tap('up', 1); __nes.step(1); __nes.tap('start', 1); __nes.step(2); const g = CT.Catch.dev.g();
        const x0 = g.px; __nes.press('left', 10); const x1 = g.px; __nes.press(['left','b'], 10); const x2 = g.px;
        return { mode: g.mode, sub: g.sub, walk: (x0 - x1) >> 8, dash: (x1 - x2) >> 8 }; }""")
    ok('接星：START 開局、←→ 移動、B 衝刺更快', r['mode'] == 'play' and r['sub'] == 'catch' and r['walk'] == 25 and r['dash'] == 35, r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(), S = CT.Catch.dev.consts.SURF; g.px = 100 * 256; g.items = [{ type: 'STAR', x: 108 * 256, y: (S - 9) * 256, vx: 0 }];
        const s0 = g.score, c0 = g.caught; __nes.step(3); return { score: g.score - s0, caught: g.caught - c0, left: g.items.length }; }""")
    ok('接星：星星落進星籃 → 加分、接到數 +1', r['score'] > 0 and r['caught'] == 1 and r['left'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(), S = CT.Catch.dev.consts.SURF; g.items = [{ type: 'URCHIN', x: ((g.px >> 8) + 8) * 256, y: (S - 9) * 256, vx: 0 }];
        const l0 = g.lives; __nes.step(3); return { d: l0 - g.lives, dizzy: g.dizzy > 0 }; }""")
    ok('接星：接到虛空海膽 → 扣 1 命 + 暈眩', r['d'] == 1 and r['dizzy'], r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.dizzy = 0; g.miss = 4; const l0 = g.lives; g.items = [{ type: 'STAR', x: 20 * 256, y: 206 * 256, vx: 0 }]; g.px = 180 * 256;
        __nes.step(2); return { d: l0 - g.lives, miss: g.miss }; }""")
    ok('接星：漏接第 5 顆 → 扣 1 命、漏接數歸零', r['d'] == 1 and r['miss'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(), S = CT.Catch.dev.consts.SURF; g.caught = 13; g.lv = 1; g.px = 100 * 256;
        g.items = [{ type: 'STAR', x: 108 * 256, y: (S - 9) * 256, vx: 0 }]; __nes.step(3); return { lv: g.lv, caught: g.caught }; }""")
    ok('接星：接滿 10+2×LV 顆升級（LV1 → 2，落速提高）', r['lv'] == 2 and r['caught'] == 0, r)

    # ---------------- 頂球 ----------------
    fresh(page)
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(2); const g = CT.Catch.dev.g(); let hit = false, vy = 0;
        for (let i = 0; i < 120; i++) { __nes.step(1); if (g.hits > 0) { hit = true; vy = g.balls[0].vy; break; } }
        return { sub: g.sub, hit, vy, balls: g.balls.length }; }""")
    ok('頂球：開局 1 顆球落到托盤上被頂起（vy < 0）', r['sub'] == 'keep' and r['hit'] and r['vy'] < 0 and r['balls'] == 1, r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.streak = 1500; g.balls[0].x = 20 * 256; g.balls[0].y = 210 * 256; g.balls[0].vy = 300; g.px = 200 * 256;
        const l0 = g.lives; __nes.step(3); return { d: l0 - g.lives, streak: g.streak, drop: g.dropT > 0 }; }""")
    ok('頂球：（單球時）掉球 → 扣 1 命、連續時間歸零、重新發球', r['d'] == 1 and r['streak'] == 0 and r['drop'], r)
    r = page.evaluate("() => [0, 719, 720, 1440, 2400, 3600, 5400].map(t => CT.Catch.dev.phaseOf(t))")
    ok('頂球：連續 12s 起風、24s 雙球、60s 三球', r == [0, 0, 1, 2, 3, 4, 5], r)
    # fix-r6 P2-1 友善版：多球時掉一顆只移除那顆；最後一顆才算失誤
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.dropT = 0; g.lives = 3; g.streak = 3700; g.phase = 4; g.px = 200 * 256;
        g.balls = [{ x: 20 * 256, y: 213 * 256, vx: 0, vy: 300 }, { x: 120 * 256, y: 60 * 256, vx: 0, vy: 0 }, { x: 60 * 256, y: 80 * 256, vx: 0, vy: 0 }];
        __nes.step(2); const a = { lives: g.lives, streak: g.streak, balls: g.balls.length, lost: g.lost, drop: g.dropT };
        g.balls = [{ x: 20 * 256, y: 213 * 256, vx: 0, vy: 300 }]; g.pend = null; __nes.step(2);
        return Object.assign(a, { lives2: g.lives, streak2: g.streak, drop2: g.dropT > 0 }); }""")
    ok('fix-r6 P2-1 三球時掉一顆 → 不扣命、連續時間不歸零、只剩 2 顆', r['lives'] == 3 and r['streak'] >= 3700 and r['balls'] == 2 and r['lost'] >= 1 and r['drop'] == 0, r)
    ok('fix-r6 P2-1 最後一顆也掉了 → 扣 1 命、連續時間歸零', r['lives2'] == 2 and r['streak2'] == 0 and r['drop2'], r)
    # 新球投放錯拍：落地時間落在其他球之間的空檔（≥ 週期 / 4）
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.dropT = 0; g.lives = 3; g.streak = 3700; g.phase = 4; g.addCd = 0; g.pend = null; g.px = 100 * 256;
        const S = CT.Catch.dev.consts.SURF; g.balls = [{ x: 112 * 256, y: (S - 9) * 256, vx: 0, vy: 600 }, { x: 60 * 256, y: 90 * 256, vx: 0, vy: 0 }];
        __nes.step(1); const p = g.pend; if (!p) return { pend: false };
        const land = b0 => { const b = Object.assign({}, b0); for (let k = 1; k < 400; k++) { const pb = (b.y >> 8) + 8; b.vy += 16; b.y += b.vy; if (b.vy > 0 && pb <= S && (b.y >> 8) + 8 >= S) return k; } return 400; };
        const L = g.balls.map(land), F = land({ x: 0, y: 32 * 256, vy: 0 }) + p.t, T = land({ x: 0, y: (S - 8) * 256, vy: -1075 });
        const gaps = L.map(l => { const d = (((F - l) % T) + T) % T; return Math.min(d, T - d); });
        return { pend: true, L, F, T, minGap: Math.min(...gaps) }; }""")
    ok('fix-r6 P2-1 第 3 顆新球延後投放、落地時間與其他兩顆錯開 ≥ 週期 / 4', r['pend'] and r['minGap'] * 4 >= r['T'] - 4, r)

    # ---------------- 暫停（§6-2）/ SELECT+START ----------------
    r = page.evaluate("""() => { const M = __nes.nes().music; __nes.step(60); __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1);
        const p0 = GAME.state().s.paused; __nes.tap('start', 1); __nes.step(1); const g = CT.Catch.dev.g(), st = g.streak; const a = M.state(); __nes.step(120); const b = M.state();
        const p = __nes.nes().ppu, A = CT.Catch.Art.make(), w = A.text('PAUSE  HOLD START+SELECT: MENU');
        const txt = w.every((t, i) => p.getTile(0, 1 + i, 2) === t), fz = st === g.streak;
        __nes.tap('start', 1); __nes.step(1); const c = M.state();
        return { p0, pl: a.playing, still: a.rowsPlayed === b.rowsPlayed, frozen: fz, txt, resumed: c.playing, o0: a.orderIndex, o1: c.orderIndex, song: CT.Catch.Audio.current }; }""")
    ok('SELECT + START 不觸發暫停', not r['p0'], r)
    ok('§6-2 暫停：BGM 停（120 幀 rowsPlayed 不動）、遊戲凍結', not r['pl'] and r['still'] and r['frozen'], r)
    ok('§6-2 解除暫停 → 同一首接續播放', r['resumed'] and r['song'] == 'catch_keep', r)
    ok('§6-5 暫停列寫著 PAUSE  HOLD START+SELECT: MENU', r['txt'], r)

    # ---------------- 密技 / 續關（§6-1）----------------
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.lives = 1; g.balls = [{ x: 20 * 256, y: 214 * 256, vx: 0, vy: 400 }]; g.px = 200 * 256; g.score = 1234;
        __nes.step(3); const m0 = g.mode; const c = CT.cheat(); __nes.step(1);
        return { m0, c, mode: g.mode, sub: g.sub, lives: g.lives, score: g.score, cheated: g.cheated, cont: g.continues }; }""")
    ok('§6-1 GAME OVER 按密技 → 原地續關（同模式、命數補回 3、分數保留）', r['m0'] == 'over' and r['c'] and r['mode'] == 'play'
       and r['sub'] == 'keep' and r['lives'] == 3 and r['score'] == 1234 and r['cont'] == 1, r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.streak = 3700; g.goalHit = true; return { goal: CT.get('catch').goal(), sg: GAME.state().goal }; }""")
    ok('§6-1 用過密技那一局：連續 60 秒也不算 goal', not r['goal'] and not r['sg'], r)
    r = page.evaluate("""() => { const g = CT.Catch.dev.g(); g.lives = 2; CT.cheat(); __nes.step(1); return { lives: g.lives, net: g.net > 0 }; }""")
    ok('遊玩中密技：頂球補滿命數 + 10 秒星網', r['lives'] == 3 and r['net'], r)

    # ---------------- exit / backTile ----------------
    r = page.evaluate("""() => { localStorage.removeItem('nes.cart2.catch.best'); localStorage.removeItem('nes.cart2.catch.best_keep'); const g = CT.Catch.dev.g(); g.streak = 0; g.bestStreak = 1234; CT.get('catch').exit(__nes.nes()); const b1 = CT.load('catch', 'best', 0);
        g.bestStreak = 10; CT.get('catch').exit(__nes.nes()); return { b1, b2: CT.load('catch', 'best', 0), text: CT.get('catch').bestText() }; }""")
    ok('§6-3 exit() 存最高紀錄（較低不覆蓋）、bestText 反映（20.5S）', r['b1'] == 1234 and r['b2'] == 1234 and r['text'] == ' 20.5S', r)
    r = page.evaluate("() => { const bt = CT.get('catch').backTile, A = CT.Catch.Art.make(); return { bt, solid: A.spr.index('SOLID') }; }")
    ok('§6-4 backTile = 實心星塊（自己的精靈表）', r['bt'] and r['bt']['tile'] == r['solid'] and 0 <= r['bt']['pal'] <= 3, r)

    # ---------------- 彈跳：機關 ----------------
    fresh(page, '&stage=2')
    r = page.evaluate("""() => { const d = CT.Catch.dev, L = CT.Catch.LEVELS[1], map = d.buildMap(L), c = d.consts;
        const b = { x: 27 * 8 * 256, y: (27 * 8 - 20) * 256, vx: 0, vy: 0 }; let ev = null;
        for (let i = 0; i < 60; i++) { ev = d.bStep(b, 0, map, L.G); if (ev && ev.land) break; }
        const b2 = { x: 4 * 8 * 256, y: (27 * 8 - 20) * 256, vx: 0, vy: 0 }; let e2 = null;
        for (let i = 0; i < 60; i++) { e2 = d.bStep(b2, NES.Input.BTN.A, map, L.G); if (e2 && e2.land) break; }
        return { spring: ev && ev.land, vy: b.vy, want: -c.V_SPRING, hi: e2 && e2.hi, vy2: b2.vy, want2: -c.V_SUPER }; }""")
    ok('彈跳：踩彈簧 → 大彈跳（vy = −V_SPRING）', r['spring'] == '^' and r['vy'] == r['want'], r)
    ok('彈跳：落地時按住 A → 高跳（vy = −V_SUPER）', r['hi'] and r['vy2'] == r['want2'], r)
    r = page.evaluate("""() => { const d = CT.Catch.dev, L = CT.Catch.LEVELS[3], map = d.buildMap(L);
        const drop = () => { const b = { x: 9 * 8 * 256, y: (24 * 8 - 20) * 256, vx: 0, vy: 0 }; for (let i = 0; i < 80; i++) { const e = d.bStep(b, 0, map, L.G); if (e && (e.land || e.shatter || e.die)) return e; } return null; };
        const e1 = drop(); if (e1 && e1.land) e1.cols.forEach(c => { if (c >= 0 && map[24][c] === '~') map[24][c] = 'c'; });
        const e2 = drop(); const L3 = CT.Catch.LEVELS[2], m3 = d.buildMap(L3); const b = { x: 15 * 8 * 256, y: (27 * 8 - 24) * 256, vx: 0, vy: 0 }; let e3 = null;
        for (let i = 0; i < 80; i++) { e3 = d.bStep(b, 0, m3, L3.G); if (e3 && e3.die) break; }
        return { first: e1 && e1.land, second: e2 && !!e2.shatter, spike: e3 && e3.die }; }""")
    ok('彈跳：碎晶第一次可彈（龜裂）、第二次碎掉穿過', r['first'] == '~' and r['second'], r)
    ok('彈跳：碰到星刺 = 失誤', r['spike'] == 'spike', r)
    r = page.evaluate("() => { const g = CT.Catch.dev.g(); return { mode: g.mode, sub: g.sub, level: g.level }; }")
    ok('?stage=2 直接進彈跳第 2 關', r == {'mode': 'play', 'sub': 'bounce', 'level': 1}, r)

    # ---------------- 機器人：頂球 goal（不開密技）+ 逐幀硬限制 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate(RUN, {'n': 6000, 'stop': 'goal'})
    ok('機器人：頂球連續 60 秒（goal，未用密技）', hl['s']['goal'] and not hl['s']['cheated'] and hl['s']['streak'] >= 3600, {k: hl[k] for k in ('frames', 'maxLine', 'peak', 'over')})
    ok('頂球機器人全程每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', hl['maxLine'] <= 8 and hl['over'] == 0 and hl['peak'] <= 160, hl)
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：頂球（雙球）畫面 0 違規、色數 ≤ 25', lint.get('ok') and lint.get('badPixels', 0) == 0 and lint.get('colors', 99) <= 25, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})

    # fix-r6 P2-1：人類反應延遲（看到的是 N 幀前的球）實測三球階段撐得住
    for lag in (12, 24):
        fresh(page, '&bot=1&lag=%d' % lag)
        r = page.evaluate("""() => { let three = 0, after = 0, l0 = null, livesLost = 0, ml = 0;
            for (let i = 0; i < 9000; i++) { __nes.step(1); ml = Math.max(ml, __nes.stats().maxSpritesLine); const g = CT.Catch.dev.g(); if (g.sub !== 'keep' || g.mode !== 'play') continue;
              if (l0 === null) l0 = g.lives; if (g.lives < l0) { livesLost += l0 - g.lives; l0 = g.lives; }
              if (g.streak >= 3600) { after++; if (g.balls.length === 3) three++; } }
            const g = CT.Catch.dev.g(); return { livesLost, streakS: g.streak / 60, pct3: Math.round(100 * three / Math.max(1, after)), lost: g.lost, ml, over: __nes.stats().budget.overFrames, goal: GAME.state().goal }; }""")
        ok('fix-r6 P2-1 反應延遲 %d 幀的機器人：60 秒 goal、撐到 ≥ 140 秒 0 失誤、三球維持 ≥ 70%%、每線 ≤ 8' % lag,
           r['goal'] and r['livesLost'] == 0 and r['streakS'] >= 140 and r['pct3'] >= 70 and r['ml'] <= 8 and r['over'] == 0, r)

    # 接星長跑（3000 幀）
    fresh(page, '&bot=1&mode=catch')
    hc = page.evaluate(RUN, {'n': 3000, 'stop': 'over'})
    ok('機器人：接星 3000 幀（升級 ≥ 1 次）每線 ≤ 8、overFrames 0', hc['maxLine'] <= 8 and hc['over'] == 0 and hc['peak'] <= 160 and hc['s']['lv'] >= 2, {k: hc[k] for k in ('frames', 'maxLine', 'peak', 'over')} | {'lv': hc['s']['lv']})
    ok('接星：落下物「依落下距離」生成 ⇒ 任兩顆垂直距離 ≥ 8（一條線最多 1 顆）', hc['gapBad'] == 0, hc['gapBad'])

    # 彈跳 6 關全通
    fresh(page, '&bot=1&mode=bounce')
    hb = page.evaluate(RUN, {'n': 8000, 'stop': 'over'})
    ok('機器人：彈跳 6 關全通（ALL CLEAR）、0 失誤', hb['s']['allClear'] and hb['s']['levelsCleared'] == 6 and hb['s']['lives'] == 5, {k: hb[k] for k in ('frames', 'maxLine', 'over')} | {'replans': hb['s']['replans']})
    ok('彈跳機器人全程每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', hb['maxLine'] <= 8 and hb['over'] == 0 and hb['peak'] <= 160, hb)
    r = page.evaluate(TEXT_JS, ['ALL CLEAR!', 'START  TITLE'])
    ok('全破結算畫面：ALL CLEAR + 返回提示、行間空一列', all(r['found']) and r['adj'] == 0, r)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_catch: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
