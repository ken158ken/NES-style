# -*- coding: utf-8 -*-
"""《星塵打磚塊》（cart1 槽 3，id = brick）自動驗證。

作法：Playwright 開 `cart1.html?debug=1&scale=1&mute=1&game=brick[&round=N]`，用 `__nes.*` 與
`CT.Brick.dev`（本遊戲的測試鉤子）推進與取樣；不改任何 engine / registry 檔。

期望值來源：
  [brief] docs/R5_BRIEF.md §3 / §4 C5-2：≥ 10 關原創磚陣、硬磚 / 不壞磚、≥ 4 種膠囊、第 10 關魔王、
          goal = 連過 5 關、每線 ≤ 8 精靈（不靠輪替）、VBlank ≤ 160、≥ 1 BGM + ≥ 4 音效、密技、最高分
  [研究]  docs/research/05 §1（屬性表 16×16 一組調色盤）⇒ 一磚寬 = 一屬性格，同欄兩列同組
  [本檔]  main.js 常數（拍子 8 區角度、速度上下限、魔王 HP 24、每幀名稱表上限 140）

用法：../卡比之星/.venv/bin/python games/cart1/test_brick.py [-v]
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=brick'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Brick && !!CT.Brick.dev')
    page.evaluate('() => { __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def play(page, rnd=1):
    """開到第 rnd 回合並發球。"""
    fresh(page, '&round=%d' % rnd)
    page.evaluate('() => { __nes.step(70); __nes.tap("a", 1); __nes.step(2); }')


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))

        # ---------------- 註冊 / 標題 ----------------
        page.goto(BASE)
        page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Brick')
        page.evaluate('() => { localStorage.removeItem("nes.cart1.brick.best"); localStorage.removeItem("nes.cart1.brick.round"); }')
        fresh(page)
        reg = page.evaluate('''() => { const g = CT.get('brick'); return g && {id: g.id, order: g.order, title: g.title,
            fns: ['init','update','draw','state','cheat','bot','goal','bestText'].filter(k => typeof g[k] === 'function')}; }''')
        ok('註冊：id / order / title', reg and reg['id'] == 'brick' and reg['order'] == 3 and reg['title'] == '星塵打磚塊', reg)
        ok('註冊：契約函式齊全', reg and len(reg['fns']) == 8, reg)
        lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
        ok('標題畫面 lint 綠', lint.get('ok') and lint.get('colors', 99) <= 25, lint)
        r = page.evaluate('() => { __nes.tap("right", 1); __nes.step(1); return GAME.state().s.startRound; }')
        ok('標題：開始回合只能選到已到達的最大回合（新檔 = 1）', r == 1, r)
        ok('cheat() 在標題不生效', page.evaluate('() => CT.get("brick").cheat()') is False)
        r = page.evaluate('''() => { const p = __nes.nes().ppu, rows = {}; const m = {}; const D = NES.CHR.DEMO.CHARMAP;
            for (const k in D) m[CT.Brick.bgBank.has(D[k]) ? CT.Brick.bgBank.index(D[k]) : -1] = k;
            for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); s += (t in m) ? m[t] : ' '; } rows[r] = s; }
            return rows; }''')
        txt = [r[str(i)] if str(i) in r else r[i] for i in range(30)]
        hit = [i for i, row in enumerate(txt) if 'START+SELECT' in row]
        ok('§6-5 標題寫得到「HOLD START+SELECT:MENU」、§6-6 寫成 C/★', hit and 'C/$' in ''.join(txt), hit)
        textrows = [i for i, row in enumerate(txt) if i >= 11 and any(ch.isalnum() for ch in row)]
        ok('P3-5 說明文字列之間至少空一列', textrows and all(b - a >= 2 for a, b in zip(textrows, textrows[1:])), textrows)

        # ---------------- 關卡資料 ----------------
        lv = page.evaluate('() => CT.Brick.ROUNDS.map(r => ({name: r.name, top: r.top, rows: r.rows, boss: !!r.boss}))')
        ok('≥ 10 回合、第 10 回合是魔王', len(lv) >= 10 and lv[9]['boss'] and not any(x['boss'] for x in lv[:9]), [x['name'] for x in lv])
        bad = []
        for i, rd in enumerate(lv):
            if rd['top'] % 2 or rd['top'] + len(rd['rows']) > 14:
                bad.append((i + 1, 'top/rows'))
            for row in rd['rows']:
                if len(row) != 14 or any(c not in '.abcdefHX' for c in row):
                    bad.append((i + 1, row))
            grid = ['.' * 14] * rd['top'] + rd['rows'] + ['.' * 14] * 14
            for c in range(14):
                for r0 in range(0, 14, 2):
                    pals = set()
                    for ch in (grid[r0][c], grid[r0 + 1][c]):
                        if ch in 'ab': pals.add(1)
                        if ch in 'cd': pals.add(2)
                        if ch in 'ef': pals.add(3)
                    if len(pals) > 1:
                        bad.append((i + 1, 'attr', c, r0))
        ok('磚陣格式正確 + 屬性限制（同欄 2k / 2k+1 列同組調色盤）', not bad, bad[:5])
        ok('有硬磚 H 與不壞磚 X', any('H' in ''.join(x['rows']) for x in lv) and any('X' in ''.join(x['rows']) for x in lv))
        names = [x['name'] for x in lv]
        ok('回合名稱全部不重複（10 張原創配置）', len(set(names)) == len(names) and len(set(tuple(x['rows']) for x in lv)) == len(lv), names)

        # ---------------- 發球 / 拍子角度 / 牆 ----------------
        play(page, 1)
        st = S(page)
        ok('READY → A 發球：球往上飛、BGM 星艇出擊', st['mode'] == 'play' and not st['stuck'] and st['balls'][0]['vy'] < 0 and st['music'] == 'brick_main', st)
        ok('球位置 / 速度全為整數（8.8 定點）', all(isinstance(st['balls'][0][k], int) for k in ('x', 'y', 'vx', 'vy', 's')), st['balls'])
        r = page.evaluate('''() => { const d = CT.Brick.dev, c = d.consts, out = [];
            for (const off of [0, 30]) { d.setPaddle(100); d.setBall(100 + off - 2, c.PY - 8, 64, 0x200); __nes.step(4);
              const b = GAME.state().s.balls[0]; out.push(b ? b.vx : null); }
            return out; }''')
        ok('拍子左端 → 往左上、右端 → 往右上（8 區角度表）', r[0] is not None and r[1] is not None and r[0] < 0 < r[1], r)
        r = page.evaluate('''() => { const d = CT.Brick.dev; d.setBall(20, 150, 128 + 32, 0x200); __nes.step(6); return GAME.state().s.balls[0].vx; }''')
        ok('左牆反彈：vx 由負轉正', r > 0, r)

        # ---------------- 磚 ----------------
        play(page, 2)
        r = page.evaluate('''() => { const d = CT.Brick.dev; const g0 = d.grid(); let hc = -1, hr = -1;
            for (let rr = 0; rr < 14; rr++) { const c = g0[rr].indexOf('H'); if (c >= 0) { hc = c; hr = rr; break; } }
            const l0 = GAME.state().s.left; d.hitBrick(hc, hr); const one = d.grid()[hr][hc]; d.hitBrick(hc, hr);
            return {one, two: d.grid()[hr][hc], dl: l0 - GAME.state().s.left}; }''')
        ok('硬磚（第 2 回合）：第 1 下只裂開、第 2 下才破', r['one'] == 'H' and r['two'] == '.' and r['dl'] == 1, r)
        play(page, 6)
        r = page.evaluate('''() => { const d = CT.Brick.dev; const g0 = d.grid(); let hc, hr, xc, xr;
            for (let rr = 0; rr < 14; rr++) { const c = g0[rr].indexOf('H'); if (c >= 0 && hc === undefined) { hc = c; hr = rr; }
              const x = g0[rr].indexOf('X'); if (x >= 0 && xc === undefined) { xc = x; xr = rr; } }
            d.hitBrick(hc, hr); d.hitBrick(hc, hr); const h2 = d.grid()[hr][hc]; d.hitBrick(hc, hr);
            for (let i = 0; i < 5; i++) d.hitBrick(xc, xr);
            return {h2, h3: d.grid()[hr][hc], x: d.grid()[xr][xc]}; }''')
        ok('第 6 回合起硬磚要 3 下', r['h2'] == 'H' and r['h3'] == '.', r)
        ok('不壞磚 X 打 5 下仍在', r['x'] == 'X', r)

        # ---------------- VBlank：一幀清大量磚 ----------------
        play(page, 5)
        r = page.evaluate('''() => { const d = CT.Brick.dev; const left0 = GAME.state().s.left;
            d.clearAll(); let maxW = 0, frames = 0; const q0 = GAME.state().s.queue;
            for (let i = 0; i < 6; i++) { __nes.step(1); const s = GAME.state().s; maxW = Math.max(maxW, s.ntWrites); if (s.queue === 0 && !frames) frames = i + 1; }
            return {left0, q0, maxW, frames, over: __nes.stats().budget.overFrames, mode: GAME.state().s.mode}; }''')
        ok('一次打掉整關 ~100 磚（~200 byte）：分幀寫、每幀 ≤ 140、overFrames 0', r['maxW'] <= 140 and r['frames'] >= 2 and r['over'] == 0, r)
        ok('打完全部可破磚 → 回合突破（clear）', r['mode'] == 'clear', r)
        r = page.evaluate('() => { __nes.step(160); const s = GAME.state().s; return {round: s.round, mode: s.mode, cleared: s.cleared}; }')
        ok('回合突破 150 幀後進下一回合', r['round'] == 6 and r['mode'] == 'ready' and r['cleared'] == 1, r)

        # ---------------- 膠囊 ----------------
        play(page, 1)
        r = page.evaluate('''() => { const d = CT.Brick.dev, out = {};
            d.takeCap('WING'); out.E = GAME.state().s.pw;
            d.takeCap('BEAM'); out.Lpw = GAME.state().s.pw; out.Lp = GAME.state().s.power;
            __nes.step(20); __nes.tap('a', 1); __nes.step(1); out.beams = GAME.state().s.beams;
            d.takeCap('TIME'); out.S = GAME.state().s.balls.every(b => b.s === d.consts.SPEED_MIN);
            const l0 = GAME.state().s.lives; d.takeCap('LIFE'); out.P = GAME.state().s.lives - l0;
            d.takeCap('WALL'); out.G = GAME.state().s.guard;
            d.takeCap('TRIO'); out.M = GAME.state().s.balls.length; out.Mp = GAME.state().s.power;
            return out; }''')
        ok('星珠 WING：星艇加長到 48 px', r['E'] == 48, r)
        ok('星珠 BEAM：雷射（取代加長，A 一次射 2 道）', r['Lp'] == 'BEAM' and r['Lpw'] == 32 and r['beams'] == 2, r)
        ok('星珠 TIME：球速回到下限', r['S'], r)
        ok('星珠 LIFE：命 +1', r['P'] == 1, r)
        ok('星珠 WALL：底部防護欄', r['G'] is True, r)
        ok('星珠 TRIO：分裂成 3 球、取消其他能力', r['M'] == 3 and r['Mp'] == '', r)
        r = page.evaluate('''() => { const d = CT.Brick.dev; let drops = 0;
            for (let i = 0; i < 40; i++) { const g0 = d.grid(); for (let rr = 0; rr < 14; rr++) { const c = g0[rr].search(/[a-f]/); if (c >= 0) { d.hitBrick(c, rr); break; } }
              if (GAME.state().s.cap) drops++; }
            return {drops, balls: GAME.state().s.balls.length}; }''')
        ok('多球期間不掉膠囊（每線精靈規則）', r['drops'] == 0 and r['balls'] >= 2, r)
        play(page, 1)
        r = page.evaluate('''() => { const d = CT.Brick.dev, c = d.consts; d.takeCap('GRAB'); d.setPaddle(100); d.setBall(110, c.PY - 10, 64, 0x200);
            __nes.step(8); const s1 = GAME.state().s; __nes.step(20); const x0 = GAME.state().s.balls[0].x;
            __nes.press(['right'], 10); const x1 = GAME.state().s.balls[0].x; __nes.tap('a', 1); __nes.step(2);
            return {stuck: s1.stuck, follow: x1 - x0, after: GAME.state().s.stuck}; }''')
        ok('星珠 GRAB：接住球黏在星艇上、跟著移動、A 放開', r['stuck'] and r['follow'] == 30 and r['after'] is False, r)
        r = page.evaluate('''() => { const d = CT.Brick.dev; d.takeCap('WALL'); d.setPaddle(16); d.setBall(200, 190, 64, 0x200);
            __nes.step(30); const s = GAME.state().s; return {vy: s.balls[0] && s.balls[0].vy, guard: s.guard, mode: s.mode}; }''')
        ok('防護欄擋下一次後消失', r['vy'] is not None and r['vy'] < 0 and r['guard'] is False and r['mode'] == 'play', r)

        # ---------------- 每線精靈最壞情況 ----------------
        play(page, 1)
        r = page.evaluate('''() => { const d = CT.Brick.dev, c = d.consts; d.takeCap('WING'); d.setPaddle(100);
            d.setBall(120, c.PY - 2, 192, 0x100); d.spawnCap('TIME', 110, c.PY - 2); __nes.step(1);
            const a = __nes.stats().maxSpritesLine;
            d.takeCap('TRIO'); const bs = GAME.state().s.balls; __nes.step(1);
            return {a, b: __nes.stats().maxSpritesLine, balls: bs.length}; }''')
        ok('最壞一線：加長 6 + 球 + 膠囊 ≤ 8；多球 3 + 星艇 4 ≤ 8', r['a'] <= 8 and r['b'] <= 8, r)
        ok('精靈保險從未丟棄（dropLine == 0）', S(page)['stat']['dropLine'] == 0)

        # ---------------- 速度 ----------------
        r = page.evaluate('() => { const c = CT.Brick.dev.consts; return [c.SPEED_MIN, c.SPEED_MAX, GAME.state().s.speed]; }')
        ok('球速：每回合起速介於上下限（1.5 ~ 3.5 px/幀）', r[0] == 0x180 and r[1] == 0x380 and r[0] <= r[2] <= r[1], r)

        # ---------------- 失球 / GAME OVER / 接關 ----------------
        play(page, 1)
        r = page.evaluate('''() => { const d = CT.Brick.dev; const l0 = GAME.state().s.lives; d.lose(); __nes.step(2); const m1 = GAME.state().s.mode;
            __nes.step(100); const s = GAME.state().s; return {l0, m1, l1: s.lives, m2: s.mode}; }''')
        ok('失球 → dead → 命 -1 → READY', r['m1'] == 'dead' and r['l1'] == r['l0'] - 1 and r['m2'] == 'ready', r)
        r = page.evaluate('''() => { const d = CT.Brick.dev; d.hitBrick(2, 2); d.hitBrick(3, 2); for (let i = 0; i < 5 && GAME.state().s.mode !== 'over'; i++) { __nes.step(70); __nes.tap('a', 1); __nes.step(2); d.lose(); __nes.step(95); }
            const s = GAME.state().s; return {mode: s.mode, msg: s.msg, best: CT.load('brick', 'best', -1), score: s.score}; }''')
        ok('命用完 → GAME OVER（可接關 / 結束）', r['mode'] == 'over' and 'GAME OVER' in r['msg'], r)
        ok('最高分存檔（CT.save brick.best）', r['best'] == r['score'] and r['score'] > 0, r)
        r = page.evaluate('() => { __nes.step(70); __nes.tap("a", 1); __nes.step(2); const s = GAME.state().s; return {mode: s.mode, lives: s.lives, cont: s.continues}; }')
        ok('A 接關：同回合、命 3、continues +1', r['mode'] == 'ready' and r['lives'] == 3 and r['cont'] == 1, r)

        # ---------------- fix-r5 §6-1：GAME OVER 按密技 = 原地續關 ----------------
        play(page, 3)
        r = page.evaluate('''() => { const d = CT.Brick.dev; for (let i = 0; i < 6; i++) { const g0 = d.grid(); for (let rr = 0; rr < 14; rr++) { const c = g0[rr].search(/[a-f]/); if (c >= 0) { d.hitBrick(c, rr); break; } } }
            const grid0 = JSON.stringify(d.grid()), sc0 = GAME.state().s.score, left0 = GAME.state().s.left;
            for (let i = 0; i < 6 && GAME.state().s.mode !== 'over'; i++) { if (GAME.state().s.mode === 'ready') { __nes.step(70); __nes.tap('a', 1); __nes.step(2); } d.lose(); __nes.step(95); }
            const m0 = GAME.state().s.mode; __nes.step(5); const ok1 = CT.get('brick').cheat(); __nes.step(1); const s = GAME.state().s;
            return {m0, ok1, mode: s.mode, round: s.round, lives: s.lives, score: s.score, sc0, sameGrid: JSON.stringify(d.grid()) === grid0, left: s.left, left0,
                    cont: s.continues, cheats: s.cheats, guard: s.guard, music: s.music, goal: CT.get('brick').goal()}; }''')
        ok('GAME OVER 按密技：回傳 true、立刻回到同一回合 READY（不用再按 A）', r['m0'] == 'over' and r['ok1'] and r['mode'] == 'ready' and r['round'] == 3, r)
        ok('原地續關：分數保留、磚陣原樣（已打掉的不復原）、命補回 3、防護欄', r['score'] == r['sc0'] and r['sameGrid'] and r['left'] == r['left0'] and r['lives'] == 3 and r['guard'], r)
        ok('原地續關：不算 continues、cheats +1 ⇒ 這局 goal() 恆 false', r['cont'] == 0 and r['cheats'] == 1 and r['goal'] is False, r)
        r = page.evaluate('() => { __nes.step(70); __nes.tap("a", 1); __nes.step(4); const s = GAME.state().s; return {mode: s.mode, balls: s.balls.length, music: s.music}; }')
        ok('原地續關後 A 發球照常遊玩 + BGM 恢復', r['mode'] == 'play' and r['balls'] == 1 and r['music'] == 'brick_main', r)

        # ---------------- fix-r5 P3-2：中途離開也存最高分 ----------------
        r = page.evaluate('''() => { localStorage.removeItem('nes.cart1.brick.best'); const d = CT.Brick.dev;
            for (let i = 0; i < 3; i++) { const g0 = d.grid(); for (let rr = 0; rr < 14; rr++) { const c = g0[rr].search(/[a-f]/); if (c >= 0) { d.hitBrick(c, rr); break; } } }
            const sc = GAME.state().s.score; CT.get('brick').exit(__nes.nes()); return {sc, best: CT.load('brick', 'best', -1)}; }''')
        ok('exit()（按住 START+SELECT 回選單）時把目前分數寫進 brick.best', r['sc'] > 0 and r['best'] == r['sc'], r)

        # ---------------- 暫停 / 密技 ----------------
        r = page.evaluate('''() => { __nes.step(70); __nes.tap('a', 1); __nes.step(2); __nes.tap('start', 1); __nes.step(1); const b0 = JSON.stringify(GAME.state().s.balls);
            __nes.step(30); const s = GAME.state().s; const same = JSON.stringify(s.balls) === b0; __nes.tap('start', 1); __nes.step(1);
            return {paused: s.paused, same, msg: s.msg, after: GAME.state().s.paused}; }''')
        ok('START 暫停：球不動；再按解除', r['paused'] and r['same'] and r['after'] is False, r)
        r = page.evaluate('''() => { const l0 = GAME.state().s.lives, c0 = GAME.state().s.cheats; const ok1 = CT.get('brick').cheat(); const s = GAME.state().s;
            return {ok1, dl: s.lives - l0, guard: s.guard, dc: s.cheats - c0, mode: s.mode}; }''')
        ok('一鍵密技「補給艦」（遊玩中）：命 +1 + 防護欄、回 true、不換畫面', r['ok1'] and r['dl'] == 1 and r['guard'] and r['dc'] == 1 and r['mode'] == 'play', r)

        # ---------------- 魔王 ----------------
        play(page, 10)
        st = S(page)
        ok('第 10 回合：魔王「蝕核」HP 24、魔王曲', st['boss'] and st['boss']['hp'] == 24 and st['music'] == 'brick_boss', st['boss'])
        lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
        ok('魔王畫面 lint 綠（≤ 25 色）', lint.get('ok'), lint.get('colors'))
        r = page.evaluate('''() => { const d = CT.Brick.dev; d.fireNow(); __nes.step(2); const f = GAME.state().s.fire;
            let i = 0, dead = false; d.setPaddle(GAME.state().s.px); while (i++ < 200) { __nes.step(1); if (GAME.state().s.mode === 'dead') { dead = true; break; } }
            return {f, dead}; }''')
        ok('魔王開火（瞄準星艇），火球打中 → 失命', r['f'] >= 1 and r['dead'], r)
        r = page.evaluate('''() => { __nes.step(140); __nes.tap('a', 1); __nes.step(2); const d = CT.Brick.dev; let k = 0; while (GAME.state().s.boss.hp > 1 && k++ < 30) d.bossHit(1); const hp1 = GAME.state().s.boss.hp;
            d.bossHit(1); let i = 0; while (i++ < 200 && GAME.state().s.mode !== 'ending') __nes.step(1);
            const s = GAME.state().s; return {hp1, mode: s.mode, dead: s.boss.dead, music: s.music}; }''')
        ok('魔王打到 0 擊破 → 結尾（ending）+ 結尾曲', r['hp1'] == 1 and r['mode'] == 'ending' and r['dead'] and r['music'] == 'brick_end', r)

        # ---------------- 音樂 / 音效 / 原創 ----------------
        r = page.evaluate('() => ({songs: Object.keys(CT.Brick.Audio.SONGS), sfx: Object.keys(CT.Brick.Audio.SFX)})')
        ok('原創曲 ≥ 2 首（含魔王曲）、brick_ 前綴', len(r['songs']) >= 2 and 'brick_boss' in r['songs'] and all(k.startswith('brick_') for k in r['songs']), r['songs'])
        ok('音效 ≥ 4 個、brick_ 前綴', len(r['sfx']) >= 4 and all(k.startswith('brick_') for k in r['sfx']), r['sfx'])
        src = ''.join((ROOT / 'games/cart1/brick' / f).read_text(encoding='utf-8').upper() for f in ('main.js', 'levels.js', 'audio.js', 'art.js'))
        ok('原創性：不含既有商業作品名稱（ARKANOID / VAUS / DOH）', all(w not in src for w in ('ARKANOID', 'VAUS', "'DOH", ' DOH ')))
        r = page.evaluate('''() => { const K = CT.Brick, bank = K.sprBank; return {caps: K.CAPS, tiles: K.CAPS.map(c => bank.has('CAP_' + c)),
            letters: ['E','M','L','S','C','P','G'].filter(c => bank.has('CAP_' + c))}; }''')
        ok('P2-2：星珠用自訂名稱 + 圖示精靈（不再是 E/L/S/C/P 字母膠囊）', len(r['caps']) == 7 and all(len(c) == 4 for c in r['caps']) and all(r['tiles']) and not r['letters'], r)
        raw = (ROOT / 'games/cart1/brick/main.js').read_text(encoding='utf-8')
        ok('P2-2：回合播報改 SECTOR / ENGAGE / BREACHED（不用 ROUND … READY）', "'ROUND '" not in raw and "'READY'" not in raw and "'SECTOR '" in raw and "'ENGAGE'" in raw, '')
        r = page.evaluate('() => { const bt = CT.get("brick").backTile; return bt && {tile: bt.tile, pal: bt.pal, has: CT.Brick.sprBank.index("BACK") === bt.tile}; }')
        ok('§6-4 backTile：精靈表裡的小星、pal 0..3', r and r['has'] and 0 <= r['pal'] <= 3, r)

        # ---------------- 機器人 ----------------
        fresh(page, '&bot=1')
        r = page.evaluate('''() => { let ml = 0, i; for (i = 0; i < 36000; i++) { __nes.step(1); const st = __nes.stats();
              if (st.maxSpritesLine > ml) ml = st.maxSpritesLine; if (GAME.state().goal) break; }
            const s = GAME.state().s; return {frames: i, ml, over: __nes.stats().budget.overFrames, cleared: s.cleared, cheats: s.cheats, cont: s.continues, drop: s.stat.dropLine}; }''')
        ok('機器人（不開密技）連過 5 回合 ≤ 36000 幀', r['cleared'] >= 5 and r['cheats'] == 0 and r['frames'] < 36000, r)
        ok('機器人全程每線 ≤ 8 精靈（逐幀量）、保險未觸發', r['ml'] <= 8 and r['drop'] == 0, r)
        ok('機器人全程 overFrames == 0', r['over'] == 0, r)

        ok('全程無頁面錯誤', not errors, errors[:3])
        br.close()

    n_ok = sum(1 for r in results if r[0])
    print('test_brick: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
