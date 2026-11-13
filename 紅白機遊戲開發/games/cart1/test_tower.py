# -*- coding: utf-8 -*-
"""《星塵塔防》（cart1 槽 8，id=tower）自動驗證。

Playwright(Chromium) 開 `cart1.html?debug=1&scale=1&mute=1&game=tower[&map=N][&bot=1]`，
用 __nes 除錯 API 推進、CT.Tower.dev 鉤子佈置情境；engine / registry 一行未改。
期望值來源：
  [brief] docs/R5_BRIEF.md §3 / §4 C5-4（格子地圖、十字鍵游標、≥ 3 種塔各 2 級升級、≥ 4 種敵人、
          ≥ 3 張地圖 × 10 波、金錢 / 生命、快轉；goal = 第一張圖守完 10 波）、§1-2 硬限制
  [設計] games/cart1/tower/maps.js 檔頭（敵人排隊 GAP 24 px ⇒ 每線敵人上界 ≤ 6、魔王 +1）
用法：../卡比之星/.venv/bin/python games/cart1/test_tower.py [-v]
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=tower'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, q=''):
    page.goto(BASE + q)
    page.wait_for_function('() => !!window.__nes && !!(window.CT && CT.Tower && CT.Tower.dev)')
    page.evaluate('() => { try { localStorage.clear(); } catch (e) {} __nes.step(1); }')


def S(page):
    return page.evaluate('() => window.GAME.state().s')


# 滿載壓力：不蓋塔、生命 999、一次排 60 隻（含魔王）間隔 0 ⇒ 整條路以 GAP 間距塞滿，逐幀量
STRESS_JS = """(n) => {
  const D = CT.Tower.dev, g = D.g();
  g.lives = 999; g.money = 0;
  const list = [];
  for (let i = 0; i < 60; i++) list.push([i === 20 ? 'boss' : ['mite','moth','beetle','healer'][i % 4], 0]);
  g.wave = 10; g.spawn = list; g.spawnIdx = 0; g.spawnCd = 0; g.phase = 'run';
  let peak = 0, over0 = __nes.stats().budget.overFrames, gapMin = 1e9, maxEn = 0;
  for (let f = 0; f < n; f++) {
    __nes.step(1);
    const st = __nes.stats(); if (st.maxSpritesLine > peak) peak = st.maxSpritesLine;
    for (let i = 1; i < g.en.length; i++) gapMin = Math.min(gapMin, g.en[i - 1].s - g.en[i].s);
    maxEn = Math.max(maxEn, g.en.length);
  }
  const s = window.GAME.state().s;
  return { peak, over: __nes.stats().budget.overFrames - over0, gapMin: gapMin / 256, maxEn,
           enemyLine: s.maxEnemyLine, hidden: s.enemyHidden };
}"""


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'warning' and '失敗' in m.text else None)

        # ---------- 1. 契約 / 標題 ----------
        fresh(page)
        reg = page.evaluate("""() => { const g = CT.get('tower'); return g && { order: g.order,
            fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
        ok('CT.register 契約：id tower / order 8 / 九個函式齊全', reg and reg['order'] == 8 and len(reg['fns']) == 9, reg)
        ok('bestText ≤ 8 字元', len(page.evaluate("() => CT.get('tower').bestText()")) <= 8)
        lint = page.evaluate('() => (__nes.step(20), __nes.render(), __nes.lint())')
        ok('標題畫面 lint 綠', S(page)['mode'] == 'title' and lint['ok'] and lint['colors'] <= 25, lint.get('colors'))
        fl = page.evaluate("""() => { const st = () => window.GAME.state().s.mode, out = [];
            __nes.tap('start', 1); __nes.step(15); out.push(st()); __nes.tap('a', 1); __nes.step(15); out.push(st());
            __nes.tap('down', 1); __nes.step(2); __nes.tap('a', 1); __nes.step(2); out.push(st());
            __nes.tap('up', 1); __nes.step(2); __nes.tap('a', 1); __nes.step(2); out.push(st()); return out; }""")
        ok('標題 → 說明 → 選圖（第 2 張鎖住按 A 沒反應）→ 第 1 張開打', fl == ['howto', 'select', 'select', 'play'], fl)

        # ---------- 2. 資料 ----------
        D = page.evaluate("""() => ({
            maps: CT.Tower.MAPS.map(m => { const p = CT.Tower.buildPath(m), b = CT.Tower.bound(m);
              return { core: p.endsAtCore, cells: p.cells.length, bound: b.max }; }),
            waves: CT.Tower.MAPS.map((m, i) => CT.Tower.wavesFor(i).length),
            types: Object.keys(CT.Tower.ENEMIES), w10boss: CT.Tower.wavesFor(0)[9].some(g => g[0] === 'boss'),
            towers: CT.Tower.TOWER_ORDER.map(k => { const t = CT.Tower.TOWERS[k];
              return { lv: t.lv.length, up: t.lv[1].up > 0 && t.lv[2].up > 0, rng: t.lv[2].range > t.lv[0].range, dmg: t.lv[2].dmg > t.lv[0].dmg }; }),
            gap: CT.Tower.GAP })""")
        ok('≥ 3 張原創地圖、路徑都從出怪口走到星核', len(D['maps']) >= 3 and all(m['core'] and m['cells'] >= 30 for m in D['maps']), D['maps'])
        ok('每張圖 10 波、第 10 波有魔王', all(w == 10 for w in D['waves']) and D['w10boss'], D['waves'])
        ok('≥ 4 種敵人（+ 魔王）', len([t for t in D['types'] if t != 'boss']) >= 4 and 'boss' in D['types'], D['types'])
        ok('3 種塔 × 3 級（2 次升級）、升級射程 / 傷害都變強', len(D['towers']) == 3 and all(
            t['lv'] == 3 and t['up'] and t['rng'] and t['dmg'] for t in D['towers']), D['towers'])
        ok('每線敵人上界（GAP 24 px 排隊、貪婪法）三張圖都 ≤ 6', all(m['bound'] <= 6 for m in D['maps']), [m['bound'] for m in D['maps']])

        # ---------- 3. 游標 / 建造 / 升級 / 販賣 ----------
        fresh(page, '&map=1')
        s = S(page)
        ok('?map=1 直開：準備階段、金 100、命 20、第 1 波', s['mode'] == 'play' and s['phase'] == 'prep'
           and s['money'] == 100 and s['lives'] == 20 and s['wave'] == 1, s)
        cur = page.evaluate("""() => { __nes.tap('right', 1); __nes.step(1); __nes.tap('right', 1); __nes.step(1); __nes.tap('down', 1); __nes.step(2);
            const s = window.GAME.state().s, p = __nes.nes().ppu; const a = p._at[0];
            const c = s.cursor.c, r = s.cursor.r + 1; const byte = a[(r >> 1) * 8 + (c >> 1)], sh = ((r & 1) << 2) | ((c & 1) << 1);
            return { c, r: s.cursor.r, pal: (byte >> sh) & 3 }; }""")
        ok('十字鍵移游標（9,6）', cur['c'] == 9 and cur['r'] == 6, cur)
        hold = page.evaluate("() => { const s0 = window.GAME.state().s.cursor.c; __nes.press(['left'], 30); return s0 - window.GAME.state().s.cursor.c; }")
        ok('按住連發：30 幀移 ≥ 3 格', hold >= 3, hold)
        b = page.evaluate("""() => { const D = CT.Tower.dev, st = () => window.GAME.state().s; D.cursor(3, 2); __nes.step(1);
            const m0 = st().money; __nes.tap('a', 1); __nes.step(3); const m1 = st().money, t1 = st().towers.length;
            D.cursor(2, 2); __nes.step(1); __nes.tap('a', 1); __nes.step(3);
            return { cost: m0 - m1, towers: t1, onPath: st().towers.length, err: st().lastSfx }; }""")
        ok('A 在草地蓋光針塔：扣 30 金', b['cost'] == 30 and b['towers'] == 1, b)
        ok('路上不能蓋（錯誤音、塔數不變）', b['onPath'] == 1 and b['err'] == 'tower_error', b)
        up = page.evaluate("""() => { const D = CT.Tower.dev, st = () => window.GAME.state().s; D.setMoney(500); D.cursor(3, 2); __nes.step(1);
            const m0 = st().money; __nes.tap('a', 1); __nes.step(2); const m1 = st().money; __nes.tap('a', 1); __nes.step(2); const m2 = st().money;
            __nes.tap('a', 1); __nes.step(2); return { up1: m0 - m1, up2: m1 - m2, lv: st().towers[0][1], max: st().money === m2 }; }""")
        ok('A 在塔上升級：Lv2 35 金、Lv3 55 金、滿級再按不扣錢', up['up1'] == 35 and up['up2'] == 55 and up['lv'] == 2 and up['max'], up)
        sel = page.evaluate("""() => { const D = CT.Tower.dev, st = () => window.GAME.state().s; D.cursor(10, 2); __nes.step(1);
            const a = st().sel; __nes.tap('b', 1); __nes.step(2); const b = st().sel; __nes.tap('b', 1); __nes.step(2); return [a, b, st().sel]; }""")
        ok('B 點按換塔種：needle → frost → thunder', sel == ['needle', 'frost', 'thunder'], sel)
        sl = page.evaluate("""() => { const D = CT.Tower.dev, st = () => window.GAME.state().s; D.cursor(3, 2); __nes.step(1);
            const m0 = st().money; __nes.press(['b'], 45); __nes.step(2); return { refund: st().money - m0, towers: st().towers.length }; }""")
        ok('按住 B 賣塔：退投資 60%（(30+35+55)×0.6 = 72）', sl['refund'] == 72 and sl['towers'] == 0, sl)

        # ---------- 4. 波次 / 快轉 / 敵人行為 ----------
        wv = page.evaluate("""() => { const st = () => window.GAME.state().s; __nes.tap('select', 1); __nes.step(3);
            const a = st().phase; __nes.tap('select', 1); __nes.step(2); const f = st().fast; return [a, f]; }""")
        ok('準備時 SELECT = 立刻開波；開打後 SELECT = 快轉 ×2', wv == ['run', True], wv)
        lk = page.evaluate("""() => { const g = CT.Tower.dev.g(); __nes.step(1400); return { lives: g.lives, leaks: g.leaks }; }""")
        ok('沒塔守 → 敵人走到星核扣命', lk['leaks'] > 0 and lk['lives'] == 20 - lk['leaks'], lk)
        en = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.en.length = 0; g.towers.length = 0; g.lives = 99;
            D.spawn('beetle'); const e = g.en[0]; e.s = 40 * 256; D.sim(1); const s0 = e.s; D.sim(10); const v = (e.s - s0) / 10;
            e.slowT = 70; e.slowF = 100; const s1 = e.s; D.sim(10); const vs = (e.s - s1) / 10;
            const hp0 = e.hp; g.towers.push({ type: 'thunder', lv: 0, c: 0, r: 0, x: e.x, y: e.y, cd: 0, invest: 0, shots: 0 });
            D.sim(1); const armorDmg = hp0 - e.hp;
            return { v, vs, armorDmg }; }""")
        ok('冰霜減速：速度 ×100/256', abs(en['vs'] - en['v'] * 100 / 256) <= 2, en)
        ok('護甲：雷震 8 傷 − 甲蟲護甲 2 = 6', en['armorDmg'] == 6, en)
        hl = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.en.length = 0; g.towers.length = 0; g.spawnIdx = g.spawn.length = 0;
            D.spawn('mite'); g.en[0].s = 300 * 256; D.spawn('healer'); const h = g.en[1]; h.s = 300 * 256 - 24 * 256; h.healCd = 1;
            D.sim(1); const m = g.en[0]; m.hp = 1; h.healCd = 1; D.sim(1); return m.hp; }""")
        ok('癒菇：幫附近隊友回血', hl > 1, hl)

        # ---------- 5. 每線 ≤ 8：三張圖滿載壓力（含魔王）----------
        for mi in (1, 2, 3):
            fresh(page, '&map=%d' % mi)
            r = page.evaluate(STRESS_JS, 1600)
            ok('地圖 %d 滿載（%d 隻同屏、含魔王）：PPU 每線 ≤ 8、敵人線峰 ≤ 7、0 隻被藏、overFrames 0' % (mi, r['maxEn']),
               r['peak'] <= 8 and r['enemyLine'] <= 7 and r['hidden'] == 0 and r['over'] == 0 and r['maxEn'] >= 20, r)
            ok('地圖 %d 排隊間距永遠 ≥ 24 px' % mi, r['gapMin'] >= 24, r['gapMin'])
        fresh(page, '&map=1')
        bl = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.lives = 999; D.setMoney(99999); D.select(0);
            const spots = [[1,1],[3,1],[1,3],[3,3],[4,4],[6,2],[7,2],[6,6],[9,5],[10,5],[12,5],[13,5],[3,9],[4,9],[1,7],[3,7]];
            spots.forEach(([c, r]) => { D.cursor(c, r); D.build(); });
            const list = []; for (let i = 0; i < 50; i++) list.push(['beetle', 0]);
            g.spawn = list; g.spawnIdx = 0; g.phase = 'run'; g.wave = 10;
            let peak = 0, maxB = 0; const o0 = __nes.stats().budget.overFrames;
            for (let f = 0; f < 900; f++) { __nes.step(1); const st = __nes.stats(); peak = Math.max(peak, st.maxSpritesLine); maxB = Math.max(maxB, g.bul.length + g.fx.length); }
            const s = window.GAME.state().s;
            return { towers: g.towers.length, peak, maxB, skipped: s.fxSkipped, hidden: s.enemyHidden, over: __nes.stats().budget.overFrames - o0, bgPeak: s.bgPeak }; }""")
        ok('16 座塔齊射：子彈 + 火花多時逐線配額器擋住，PPU 每線 ≤ 8、敵人 0 隻被藏', bl['peak'] <= 8 and bl['hidden'] == 0
           and bl['towers'] >= 14 and bl['maxB'] >= 10, bl)
        ok('背景寫入佇列每幀 ≤ 120 byte、overFrames 0', bl['bgPeak'] <= 120 and bl['over'] == 0, bl)

        fx = page.evaluate("""() => { const g = CT.Tower.dev.g(); g.en.length = 0; g.bul.length = 0; g.fx.length = 0;
            for (let i = 0; i < 16; i++) g.fx.push({ x: 12 + i * 15, y: 100, kind: 'spark', t: 30 });
            const k0 = g.fxSkipped; __nes.step(1); __nes.render();
            return { line: __nes.stats().maxSpritesLine, skipped: g.fxSkipped - k0 }; }""")
        ok('同一條線 16 個火花：配額器只畫 8 個（其餘這幀不畫、下一幀輪替），PPU 不掉精靈', fx['line'] == 8 and fx['skipped'] >= 8, fx)

        # ---------- 6. 暫停 / 密技 / 通關 / 失守 ----------
        fresh(page, '&map=1')
        pz = page.evaluate("""() => { const g = CT.Tower.dev.g(); __nes.tap('select', 1); __nes.step(5); __nes.tap('start', 1); __nes.step(1);
            const s0 = g.spawnIdx, p0 = g.paused; __nes.step(120); const same = g.spawnIdx === s0; __nes.tap('start', 1); __nes.step(2); return [p0, same, g.paused]; }""")
        ok('START 暫停：出怪停止、再按恢復', pz == [True, True, False], pz)
        ct = page.evaluate("""() => { const g = CT.Tower.dev.g(); const m0 = g.money, l0 = g.lives; const r = CT.cheat(); return [r, g.money - m0, g.lives - l0]; }""")
        ok('一鍵密技：+300 金、生命 +10', ct == [True, 300, 10], ct)
        cg = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.wave = 10; g.phase = 'run'; g.spawn = []; g.spawnIdx = 0; g.en.length = 0;
            __nes.step(2); return { mode: window.GAME.state().s.mode, goal: window.GAME.state().goal, cleared: g.mapsCleared[0] }; }""")
        ok('用過密技守完第 1 張圖：通關照算（解鎖）但 goal() = false（qa-r5 P3-7）', cg['mode'] == 'clear' and cg['cleared']
           and cg['goal'] is False, cg)
        fresh(page, '&map=1')
        cl = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.wave = 10; g.phase = 'run'; g.spawn = []; g.spawnIdx = 0; g.en.length = 0;
            __nes.step(2); return { mode: window.GAME.state().s.mode, goal: window.GAME.state().goal, unlock: CT.load('tower', 'unlock', 1), best: CT.load('tower', 'best', 0) }; }""")
        ok('守完第 10 波 → 通關畫面、goal() = true、解鎖第 2 張圖、最高分存檔', cl['mode'] == 'clear' and cl['goal']
           and cl['unlock'] == 2 and cl['best'] > 0, cl)
        fresh(page, '&map=1')
        ov = page.evaluate("""() => { const D = CT.Tower.dev, g = D.g(); g.lives = 1; __nes.tap('select', 1); __nes.step(1500);
            const m = window.GAME.state().s.mode; __nes.step(70); __nes.tap('start', 1); __nes.step(2); return [m, window.GAME.state().s.mode]; }""")
        ok('生命歸零 → 失守畫面 → START 回標題', ov == ['over', 'title'], ov)

        # ---------- 6b. fix-r5：重打本波 / 密技原地續關 / 標題無效（brief §6-1、qa-r5 P2-1 / P3-3 / P3-7） ----------
        fresh(page)
        tc = page.evaluate("""() => { const g = CT.Tower.dev.g(); const r1 = CT.cheat(); __nes.step(15); __nes.tap('start', 1); __nes.step(2);
            const m = g.mode; const r2 = CT.cheat(); return { r1, r2, m, cheats: g.cheats, money: g.money }; }""")
        ok('標題 / 說明畫面按密技無效（回 false、不累計）', tc['r1'] is False and tc['r2'] is False and tc['m'] == 'howto'
           and tc['cheats'] == 0, tc)
        LOSE_JS = """(w) => { const D = CT.Tower.dev, g = D.g();
            g.wave = w; g.money = 500; const free = [];
            for (let r = 0; r < 12; r++) for (let c = 0; c < 16; c++) if (g.cells[r][c] === '.') free.push([c, r]);
            D.cursor(free[0][0], free[0][1]); D.select(0); D.build(); D.cursor(free[1][0], free[1][1]); D.select(2); D.build();
            const before = { money: g.money, towers: g.towers.length, score: g.score };
            g.lives = 5; g.prepT = 1; __nes.step(3); g.money += 77; g.score += 55; g.lives = 1; g.towers.pop();
            for (let i = 0; i < 2000 && g.mode === 'play'; i++) __nes.step(1);
            return { before, mode: g.mode, snapWave: window.GAME.state().s.retryWave }; }"""
        fresh(page, '&map=1')
        lo = page.evaluate(LOSE_JS, 4)
        ok('失守畫面記得本波（快照 = 開打那一刻）', lo['mode'] == 'over' and lo['snapWave'] == 4, lo)
        rw = page.evaluate("""() => { const g = CT.Tower.dev.g(); __nes.step(70); __nes.tap('a', 1); __nes.step(3); const s = window.GAME.state().s;
            return { mode: s.mode, wave: s.wave, phase: s.phase, money: s.money, lives: s.lives, towers: s.towers.length, score: s.score,
                     cheats: g.cheats, retries: s.retries, music: s.music }; }""")
        ok('失守後 A = RETRY WAVE：回到同一波的準備階段、塔 / 金錢 / 分數回到開打那一刻、生命 = max(10, 開波時 5) = 10、不算密技',
           rw['mode'] == 'play' and rw['wave'] == 4 and rw['phase'] == 'prep' and rw['money'] == lo['before']['money']
           and rw['towers'] == lo['before']['towers'] == 2 and rw['score'] == lo['before']['score'] and rw['lives'] == 10
           and rw['cheats'] == 0 and rw['retries'] == 1 and rw['music'] == 'battle', rw)
        tl = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Tower.Art; const D = CT.Tower.dev, g = D.g();
            g.lives = 1; g.prepT = 1; for (let i = 0; i < 2000 && g.mode === 'play'; i++) __nes.step(1);
            const row = r => p._nt[0].slice(r * 32, r * 32 + 32).join(); const t = A.text('RETRY WAVE 04').join();
            return { mode: g.mode, shown: row(18).indexOf(t) >= 0, cheatRow: row(22).indexOf(A.text('C/$').join()) >= 0 }; }""")
        ok('失守畫面寫著 A RETRY WAVE 04 與 C/★ 續關', tl['mode'] == 'over' and tl['shown'] and tl['cheatRow'], tl)
        cr = page.evaluate("""() => { const g = CT.Tower.dev.g(); const r = CT.cheat(); __nes.step(2); const s = window.GAME.state().s;
            return { r, mode: s.mode, wave: s.wave, lives: s.lives, towers: s.towers.length, cheats: g.cheats }; }""")
        ok('失守畫面按密技 → 立刻從同一波重打、塔保留、生命補回 20、記一次密技', cr['r'] and cr['mode'] == 'play' and cr['wave'] == 4
           and cr['lives'] == 20 and cr['towers'] == 2 and cr['cheats'] == 1, cr)
        cl2 = page.evaluate("""() => { const g = CT.Tower.dev.g(); g.wave = 10; g.phase = 'run'; g.spawn = []; g.spawnIdx = 0; g.en.length = 0;
            __nes.step(2); const a = [window.GAME.state().s.mode, window.GAME.state().goal]; const r = CT.cheat(); return a.concat([r]); }""")
        ok('續關後守完 → 通關但 goal() = false；通關畫面按密技無效', cl2 == ['clear', False, False], cl2)

        # ---------- 6c. fix-r5：暫停靜音 / exit 存分 / backTile / 說明頁 ----------
        fresh(page, '&map=1')
        pm = page.evaluate("""() => { const ms = () => (st => st.playing + ':' + st.rowsPlayed)(__nes.nes().music.state()); const m0 = window.GAME.state().s.music;
            __nes.tap('start', 1); __nes.step(2); const m1 = window.GAME.state().s.music, r0 = ms(); __nes.step(60); const r1 = ms();
            __nes.tap('start', 1); __nes.step(2); return { m0, m1, still: r0 === r1, m2: window.GAME.state().s.music }; }""")
        ok('START 暫停 = BGM 停（driver 不前進）、解除暫停接續守備曲', pm['m0'] == 'battle' and pm['m1'] is None and pm['still']
           and pm['m2'] == 'battle', pm)
        ex = page.evaluate("""() => { const g = CT.Tower.dev.g(); g.score = 4321; CT.back(); return CT.load('tower', 'best', 0); }""")
        ok('中途按住 START+SELECT 離開（exit）也存最高分', ex == 4321, ex)
        fresh(page)
        bt = page.evaluate("""() => { const b = CT.get('tower').backTile, A = CT.Tower.Art;
            const px = A.SPR.BACK.join('').replace(/\\./g, '').length;
            return { b, isBack: b.tile === A.spr('BACK'), px }; }""")
        ok('backTile：8×8 精靈表裡的專用實心方塊、pal 0', bt['isBack'] and bt['px'] >= 56 and bt['b']['pal'] == 0, bt)
        ht = page.evaluate("""() => { __nes.step(15); __nes.tap('start', 1); __nes.step(2); const p = __nes.nes().ppu, A = CT.Tower.Art;
            const row = r => p._nt[0].slice(r * 32, r * 32 + 32).join();
            const blank = r => p._nt[0].slice(r * 32 + 3, r * 32 + 29).every(t => t === A.bg('SP'));
            return { menu: row(24).indexOf(A.text('HOLD START+SELECT: MENU').join()) >= 0, cheat: row(14).indexOf(A.text('C/$ CHEAT').join()) >= 0,
                     gaps: [7, 9, 11, 13, 15].every(blank) }; }""")
        ok('說明頁：HOLD START+SELECT: MENU、C/★ CHEAT，操作行之間各空一列', ht['menu'] and ht['cheat'] and ht['gaps'], ht)

        # ---------- 7. 音 / 美術 ----------
        au = page.evaluate("""() => ({ songs: Object.keys(CT.Tower.Audio.SONGS), sfx: Object.keys(CT.Tower.Audio.SFX),
            banks: !!(NES.CHR.getBank('tower_bg') && NES.CHR.getBank('tower_spr')) })""")
        ok('≥ 1 首原創 BGM（標題 / 守備 / 通關 / 失守）', len(au['songs']) >= 4, au['songs'])
        ok('≥ 4 個音效、名稱全部 tower_ 前綴；CHR bank tower_ 前綴', len(au['sfx']) >= 4
           and all(k.startswith('tower_') for k in au['sfx']) and au['banks'], au['sfx'])
        fresh(page, '&map=2')
        lint = page.evaluate("() => { __nes.tap('select', 1); __nes.step(400); __nes.render(); return __nes.lint(); }")
        ok('地圖 2 遊玩畫面 lint 綠（≤ 25 色）', lint['ok'] and lint['colors'] <= 25, lint.get('colors'))
        ok('手機觸控：NES.Touch 在場', page.evaluate('() => !!(NES.Touch && NES.Touch.rects)'))

        # ---------- 8. 機器人（不開密技，逐幀量） ----------
        page.goto(BASE + '&bot=1')
        page.wait_for_function('() => !!window.__nes && !!CT.Tower.dev')
        page.evaluate('() => { try { localStorage.clear(); } catch (e) {} }')
        bot = page.evaluate("""(mx) => { let peak = 0;
            for (let f = 0; f < mx; f++) { __nes.step(1); const st = __nes.stats(); if (st.maxSpritesLine > peak) peak = st.maxSpritesLine;
              const s = window.GAME.state(); if (s.goal) return { goal: true, f, peak, over: st.budget.overFrames, lives: s.s.lives, cheats: CT.Tower.dev.g().cheats }; }
            return { goal: false, peak, over: __nes.stats().budget.overFrames, s: window.GAME.state().s }; }""", 15000)
        ok('機器人 15000 幀內守完第 1 張圖 10 波（goal，不開密技）', bot['goal'] and bot.get('cheats') == 0, bot)
        print('  bot: frames=%s peak=%s over=%s' % (bot.get('f'), bot.get('peak'), bot.get('over')))
        ok('機器人全程逐幀：每線精靈 ≤ 8', bot['peak'] <= 8, bot['peak'])
        ok('機器人全程 overFrames == 0', bot['over'] == 0, bot['over'])

        ok('整場 0 個 JS 例外 / update·draw 失敗', not errors, errors[:3])
        br.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('=' * 64)
    print('tower 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
