# -*- coding: utf-8 -*-
"""《星塵方塊》（cart1 槽 2，id = blocks）自動驗證。

作法：Playwright 開 `cart1.html?debug=1&scale=1&mute=1&game=blocks`，用 `__nes.step/press/tap/stats/lint`
與 `CT.Blocks.dev`（本遊戲的測試鉤子）推進與取樣；不改任何 engine / registry 檔。

期望值來源：
  [brief]  docs/R5_BRIEF.md §3 / §4 C5-2：10×20、預覽 ×3、暫存、硬降 / 軟降、DAS、等級加速、兩模式、消行演出、
           goal = 馬拉松 40 行、每線 ≤ 8 精靈、VBlank ≤ 160、≥ 1 BGM + ≥ 4 音效、密技、最高分存檔
  [研究]   docs/research/03_經典遊戲深度解析/13 ④（重力表 = 查表、單調遞增速度）、⑪（亂數要有記憶、DAS 參數化、
           指數型消行獎勵、音樂即 UI）
  [本檔]   main.js 常數（DAS 12 / 4、鎖定延遲 30、每幀名稱表上限 140）

用法：../卡比之星/.venv/bin/python games/cart1/test_blocks.py [-v]
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=blocks'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Blocks && !!CT.Blocks.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart1.blocks.best"); localStorage.removeItem("nes.cart1.blocks.bestc"); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def start(page, mode='marathon', level=1):
    page.evaluate('([m, l]) => { CT.Blocks.dev.start(m, l); __nes.step(40); }', [mode, level])


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))

        # ---------------- 註冊 / 標題 ----------------
        fresh(page)
        reg = page.evaluate('''() => { const g = CT.get('blocks'); return g && {id: g.id, order: g.order, title: g.title,
            fns: ['init','update','draw','state','cheat','bot','goal','bestText'].filter(k => typeof g[k] === 'function')}; }''')
        ok('註冊：id / order / title', reg and reg['id'] == 'blocks' and reg['order'] == 2 and reg['title'] == '星塵方塊', reg)
        ok('註冊：契約函式齊全（init/update/draw/state/cheat/bot/goal/bestText）', reg and len(reg['fns']) == 8, reg and reg['fns'])
        lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
        ok('標題畫面 lint 綠（≤ 25 色、無違規像素）', lint.get('ok') and lint.get('colors', 99) <= 25, lint)
        st = S(page)
        ok('標題：有原創 BGM 在播（blocks_b）', st['mode'] == 'title' and st['music'] == 'blocks_b', st['music'])
        page.evaluate('() => { __nes.tap("right", 1); __nes.step(2); __nes.tap("down", 1); __nes.step(2); __nes.tap("right", 1); __nes.step(2); __nes.tap("right", 1); __nes.step(2); }')
        st = S(page)
        ok('標題選單：→ 切模式、↓ 換列、→ 調等級', st['menu'][0] == 1 and st['sel'] == 1 and st['menu'][1] == 3, st['menu'])
        ok('cheat() 在標題畫面不生效（回 false）', page.evaluate('() => CT.get("blocks").cheat()') is False)
        txt = page.evaluate('''() => { const p = __nes.nes().ppu, m = {}; const D = NES.CHR.DEMO.CHARMAP;
            for (const k in D) if (CT.Blocks.bgBank.has(D[k])) m[CT.Blocks.bgBank.index(D[k])] = k;
            const out = []; for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); s += (t in m) ? m[t] : ' '; } out.push(s); }
            return out; }''')
        ok('§6-5 標題寫得到「HOLD START+SELECT:MENU」、§6-6 寫成 C/★', any('START+SELECT' in row for row in txt) and any('C/$' in row for row in txt), '')
        textrows = [i for i, row in enumerate(txt) if i >= 9 and any(ch.isalnum() for ch in row)]
        ok('P3-5 說明 / 選單文字列之間至少空一列', textrows and all(b - a >= 2 for a, b in zip(textrows, textrows[1:])), textrows)

        # ---------------- 開局 / 預覽 / 7 袋 ----------------
        fresh(page)
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(40); }')
        st = S(page)
        ok('START 開始馬拉松：出塊、預覽 3 個', st['mode'] == 'play' and st['piece'] and len(st['next']) == 3, (st['mode'], st['piece'], st['next']))
        seq = page.evaluate('''() => { const d = CT.Blocks.dev, out = [];
            for (let i = 0; i < 14; i++) { d.setField([]); const s = GAME.state().s; out.push(s.piece.t);
              __nes.tap('up', 1); __nes.step(12); }
            return out; }''')
        counts = {t: seq.count(t) for t in 'IOTSZJL'}
        ok('7 袋亂數：前 14 塊每種剛好 2 個（亂數有記憶，研究 13 ⑪5）', all(v == 2 for v in counts.values()), (seq, counts))

        # ---------------- 旋轉 / 踢牆 ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('T', 3, 5, 0); d.holdGravity(true);
            const rots = []; for (let i = 0; i < 4; i++) { __nes.tap('a', 1); __nes.step(1); rots.push(GAME.state().s.piece.rot); d.holdGravity(true); }
            __nes.tap('b', 1); __nes.step(1); const back = GAME.state().s.piece.rot; return {rots, back}; }''')
        ok('A 右旋 4 次回到原位、B 左旋', r['rots'] == [1, 2, 3, 0] and r['back'] == 3, r)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('I', 7, 5, 1); d.holdGravity(true);
            const x0 = GAME.state().s.piece.x; __nes.tap('a', 1); __nes.step(1); const s = GAME.state().s.piece; return {x0, rot: s.rot, x: s.x}; }''')
        ok('靠右牆旋轉 I：踢牆成功（rot 改變且仍在場內）', r['rot'] == 2 and r['x'] <= 6, r)

        # ---------------- DAS ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('O', 0, 5, 0);
            const xs = []; for (let i = 0; i < 24; i++) { d.holdGravity(true); __nes.press(['right'], 1); xs.push(GAME.state().s.piece.x); }
            __nes.release(); return xs; }''')
        moves = [i for i in range(1, len(r)) if r[i] != r[i - 1]]
        ok('DAS：按下立刻動 1 格、第 12 幀起每 4 幀重複', r[0] == 1 and moves[:3] == [12, 16, 20], (r, moves))

        # ---------------- 硬降 / 軟降 / 影子 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('O', 4, 2, 0); __nes.step(1);
            const s0 = GAME.state().s; __nes.tap('up', 1); __nes.step(1); const s1 = GAME.state().s;
            return {ghost: s0.ghostY, y0: s0.piece.y, sc0: s0.score, sc1: s1.score, f: d.field().slice(-2)}; }''')
        ok('影子落點 = 硬降落點（O 落在底兩列）', r['ghost'] == 20 and r['f'] == ['....11....', '....11....'], r)
        ok('硬降每格 +2 分', r['sc1'] - r['sc0'] == 2 * (r['ghost'] - r['y0']), r)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('O', 4, 2, 0); __nes.step(1);
            const s0 = GAME.state().s; __nes.press(['down'], 10); const s1 = GAME.state().s; __nes.release();
            return {dy: s1.piece.y - s0.piece.y, ds: s1.score - s0.score}; }''')
        ok('軟降：每 2 幀 1 格、每格 +1 分', r['dy'] >= 4 and r['ds'] == r['dy'], r)

        # ---------------- 鎖定延遲 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('O', 4, 20, 0);
            let n = 0; while (GAME.state().s.piece && n < 80) { __nes.step(1); n++; } return n; }''')
        ok('鎖定延遲 30 幀（著地後不是立刻鎖）', 29 <= r <= 32, r)

        # ---------------- 消行 / 演出 / VBlank ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { const d = CT.Blocks.dev;
            d.setField(['.333333333', '.222222222', '.111111111', '.444444444']); d.setPiece('I', -2, 5, 1); __nes.step(1);
            const sc0 = GAME.state().s.score;
            __nes.tap('up', 1); const subs = []; let maxW = 0, maxBud = 0;
            for (let i = 0; i < 40; i++) { __nes.step(1); const s = GAME.state().s; subs.push(s.sub); maxW = Math.max(maxW, s.ntWrites);
              const b = __nes.stats().budget; maxBud = Math.max(maxBud, b.used); }
            const s = GAME.state().s;
            return {subs: subs.slice(0, 30), lines: s.lines, novas: s.stats.novas, dsc: s.score - sc0, maxW, maxBud,
                    over: __nes.stats().budget.overFrames, f: d.field().slice(-4), q: s.queue}; }''')
        ok('一次消 4 行（NOVA!）：lines 4、novas 1', r['lines'] == 4 and r['novas'] == 1, r)
        ok('消行演出：clear 狀態持續 ≥ 20 幀才收合', r['subs'].count('clear') >= 20, r['subs'])
        ok('消 4 行得分 = 800 × 等級 + 硬降', r['dsc'] >= 800 and r['dsc'] < 900, r['dsc'])
        ok('收合後盤面清空、佇列清空', r['f'] == ['..........'] * 4 and r['q'] == 0, r)
        ok('消行 + 整片下移：每幀名稱表寫入 ≤ 140、VBlank 用量 ≤ 160、overFrames 0',
           r['maxW'] <= 140 and r['maxBud'] <= 160 and r['over'] == 0, r)
        # 整片重寫壓力：暫停（盤面 200 格全清）→ 分幀寫完
        r = page.evaluate('''() => { const d = CT.Blocks.dev; const rows = []; for (let i = 0; i < 16; i++) rows.push(i % 2 ? '.12312312.' : '3.1231231.');
            d.setField(rows); __nes.step(3); __nes.tap('start', 1); let maxW = 0; const qs = [];
            for (let i = 0; i < 4; i++) { __nes.step(1); const s = GAME.state().s; maxW = Math.max(maxW, s.ntWrites); qs.push(s.queue); }
            const s = GAME.state().s; __nes.tap('start', 1); __nes.step(4);
            return {paused: s.paused, maxW, qs, over: __nes.stats().budget.overFrames, after: GAME.state().s.paused}; }''')
        ok('暫停：盤面整片隱藏分幀寫（每幀 ≤ 140、overFrames 0）', r['paused'] and r['maxW'] <= 140 and r['over'] == 0 and r['qs'][-1] == 0, r)
        ok('暫停再按 START 解除', r['after'] is False, r)

        # ---------------- 等級 / 重力 / 調色盤 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setLines(9); d.setField(['.111111111']); d.setPiece('I', -2, 5, 1);
            __nes.step(1); const g0 = d.gravity(); __nes.tap('up', 1); __nes.step(40); const s = GAME.state().s;
            const pal = __nes.nes().ppu.getBgPalette(1); return {lv: s.level, g0, g1: d.gravity(), pal, tbl: d.consts.GRAVITY}; }''')
        tbl = r['tbl']
        ok('每 10 行升一級（9 → 10 行：Lv1 → Lv2）', r['lv'] == 2, r)
        ok('重力查表單調加速（研究 13 ⑪1），Lv1 = 50 幀 / 格、Lv20 = 1', all(tbl[i] >= tbl[i + 1] for i in range(len(tbl) - 1)) and tbl[0] == 50 and tbl[-1] == 1 and r['g1'] < r['g0'], tbl)
        ok('升級換方塊色（背景第 1 組 = 第 2 級色）', list(r['pal'])[:3] == [0x16, 0x2A, 0x30] or list(r['pal'])[1:4] == [0x16, 0x2A, 0x30], r['pal'])

        # ---------------- 暫存 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); __nes.step(1); const t0 = GAME.state().s.piece.t;
            __nes.tap('select', 1); __nes.step(1); const s1 = GAME.state().s; __nes.tap('select', 1); __nes.step(1); const s2 = GAME.state().s;
            return {t0, hold: s1.hold, used: s1.holdUsed, cur1: s1.piece.t, cur2: s2.piece.t}; }''')
        ok('SELECT 暫存：當前塊進暫存框、同一塊不能連換兩次', r['hold'] == r['t0'] and r['used'] and r['cur1'] == r['cur2'], r)

        # ---------------- 危險區音樂 / 密技 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; const rows = []; for (let i = 0; i < 16; i++) rows.push('11111.1111');
            d.setField(rows); __nes.step(2); const m = GAME.state().s.music; const top0 = GAME.state().s.stackTop;
            const ok1 = CT.get('blocks').cheat(); __nes.step(2); const s = GAME.state().s; return {m, top0, top1: s.stackTop, ok1, cheats: s.cheats}; }''')
        ok('堆高到危險區 → 換急版 BGM（音樂即 UI）', r['m'] == 'blocks_fast', r)
        ok('一鍵密技「星塵炸彈」：回 true、堆高立刻降 4 列', r['ok1'] and r['top1'] == r['top0'] + 4 and r['cheats'] == 1, r)

        # ---------------- 堆滿 / 最高分 / 回標題 ----------------
        r = page.evaluate('''() => { const d = CT.Blocks.dev; const rows = []; for (let i = 0; i < 21; i++) rows.push('1111.11111');
            d.setField(rows); d.setPiece('O', 4, 0, 0); __nes.tap('up', 1); __nes.step(60); const s = GAME.state().s;
            return {sub: s.sub, result: s.result, score: s.score, best: CT.load('blocks', 'best', -1)}; }''')
        ok('堆到頂 → GAME OVER', r['sub'] == 'over' and r['result'] == 'over', r)
        ok('最高分存檔（CT.save blocks.best）', r['best'] == r['score'] and r['score'] > 0, r)
        page.evaluate('() => { __nes.step(60); __nes.tap("start", 1); __nes.step(2); }')
        ok('GAME OVER 後 START 回自己的標題', S(page)['mode'] == 'title')
        ok('bestText() ≤ 8 字元', len(page.evaluate('() => CT.get("blocks").bestText()')) <= 8)

        # ---------------- fix-r5 §6-1：GAME OVER 按密技 = 原地續關 ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setLines(12); const rows = []; for (let i = 0; i < 21; i++) rows.push('1111.11111');
            d.setField(rows); d.setPiece('O', 4, 0, 0); __nes.tap('select', 1); __nes.step(1);
            const hold = GAME.state().s.hold;
            d.setPiece('O', 4, 0, 0); __nes.tap('up', 1); __nes.step(60); const s0 = GAME.state().s;
            const ok1 = CT.get('blocks').cheat(); __nes.step(40); const s = GAME.state().s;
            return {sub0: s0.sub, sc0: s0.score, ok1, sub: s.sub, mode: s.mode, score: s.score, lines: s.lines, level: s.level, hold, hold1: s.hold,
                    piece: !!s.piece, top: s.stackTop, cheats: s.cheats, music: s.music, result: s.result, goal: CT.get('blocks').goal()}; }''')
        ok('GAME OVER 按密技：回 true、立刻接著出塊（不回標題）', r['sub0'] == 'over' and r['ok1'] and r['mode'] == 'play' and r['sub'] == 'fall' and r['piece'] and r['result'] is None, r)
        ok('原地續關：分數 / 行數 / 等級 / 暫存全保留、上方清出 ≥ 8 列', r['score'] == r['sc0'] and r['lines'] == 12 and r['level'] == 2 and r['hold1'] == r['hold'] and r['top'] >= 8, r)
        ok('原地續關：BGM 恢復、cheats +1 ⇒ goal() 恆 false', r['music'] in ('blocks_a', 'blocks_fast') and r['cheats'] == 1 and r['goal'] is False, r)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setLines(149); d.setField(['.111111111']); d.setPiece('I', -2, 5, 1);
            __nes.step(1); __nes.tap('up', 1); __nes.step(40); const sub = GAME.state().s.sub; return {sub, ok1: CT.get('blocks').cheat()}; }''')
        ok('完走（COMPLETE）畫面按密技無效', r['sub'] == 'done' and r['ok1'] is False, r)

        # ---------------- fix-r5 P3-4：UP+左右（觸控偏上）不誤硬降 ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setField([]); d.setPiece('T', 4, 3, 0); d.holdGravity(true); __nes.step(1);
            const y0 = GAME.state().s.piece.y, id0 = GAME.state().s.piece.id;
            __nes.press(['up', 'left'], 1); d.holdGravity(true); const a = GAME.state().s.piece;
            __nes.press(['up', 'left'], 3); d.holdGravity(true); const b = GAME.state().s.piece;
            __nes.release(); __nes.step(1); d.holdGravity(true);
            __nes.press(['left'], 2); __nes.press(['left', 'up'], 2); d.holdGravity(true); const c = GAME.state().s.piece;
            __nes.release(); __nes.step(1); __nes.tap('up', 1); __nes.step(1); const e = GAME.state().s;
            return {y0, id0, a, b, c, after: e.piece ? e.piece.id : null, sub: e.sub}; }''')
        ok('P3-4：UP+LEFT 同時按下 → 只往左移、不硬降', r['a'] and r['a']['id'] == r['id0'] and r['a']['y'] == r['y0'] and r['a']['x'] == 3, r)
        ok('P3-4：按住左時滑上 UP → 不硬降', r['c'] and r['c']['id'] == r['id0'] and r['c']['y'] <= r['y0'] + 1, r)
        ok('P3-4：UP 單獨按下仍是硬降', r['after'] != r['id0'], r)

        # ---------------- fix-r5 P3-1 / P3-2 / §6-4 ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { __nes.tap('start', 1); __nes.step(2); const m1 = GAME.state().s.music; __nes.tap('start', 1); __nes.step(2);
            return {m1, m2: GAME.state().s.music}; }''')
        ok('P3-1 暫停時 BGM 停、解除後接續', r['m1'] is None and r['m2'] == 'blocks_a', r)
        r = page.evaluate('''() => { localStorage.removeItem('nes.cart1.blocks.best'); const d = CT.Blocks.dev;
            d.setField(['.111111111']); d.setPiece('I', -2, 5, 1); __nes.step(1); __nes.tap('up', 1); __nes.step(40);
            const sc = GAME.state().s.score; CT.get('blocks').exit(__nes.nes()); return {sc, best: CT.load('blocks', 'best', -1)}; }''')
        ok('P3-2 exit()（START+SELECT 回選單）時存最高分', r['sc'] > 0 and r['best'] == r['sc'], r)
        r = page.evaluate('() => { const bt = CT.get("blocks").backTile; return bt && {tile: bt.tile, pal: bt.pal, has: CT.Blocks.sprBank.index("BK_F") === bt.tile}; }')
        ok('§6-4 backTile：精靈表裡的實心方塊、pal 0..3', r and r['has'] and 0 <= r['pal'] <= 3, r)

        # ---------------- 完走 150 行 ----------------
        fresh(page); start(page)
        r = page.evaluate('''() => { const d = CT.Blocks.dev; d.setLines(149); d.setField(['.111111111']); d.setPiece('I', -2, 5, 1);
            __nes.step(1); __nes.tap('up', 1); __nes.step(40); const s = GAME.state().s; return {sub: s.sub, result: s.result, music: s.music, goal: s.goal}; }''')
        ok('馬拉松 150 行完走 → COMPLETE + 完走曲；goal 已達成', r['sub'] == 'done' and r['result'] == 'clear' and r['music'] == 'blocks_clear' and r['goal'], r)

        # ---------------- 挑戰模式 ----------------
        fresh(page); start(page, 'challenge')
        r = page.evaluate('''() => { const d = CT.Blocks.dev; const f0 = d.field().slice(-4); const s0 = GAME.state().s;
            const rise = d.consts.RISE[0]; d.holdGravity(true); __nes.step(1);
            let n = 0; while (GAME.state().s.stats.rises < 1 && n < rise + 60) { d.holdGravity(true); __nes.step(1); n++; }
            return {f0, n, rise, mode: s0.gameMode, rises: GAME.state().s.stats.rises}; }''')
        holes = [row.count('.') for row in r['f0']]
        ok('挑戰：開局底部 4 列垃圾（每列剛好 1 個洞）', holes == [1, 1, 1, 1] and all(c in '4.' for row in r['f0'] for c in row), r['f0'])
        ok('挑戰：每 RISE[0] 幀升起一列垃圾', r['rises'] == 1 and abs(r['n'] - r['rise']) <= 42, r)

        # ---------------- START+SELECT 不佔用 ----------------
        r = page.evaluate('''() => { __nes.press(['select'], 2); __nes.press(['select', 'start'], 3); __nes.release(); __nes.step(1); return GAME.state().s.paused; }''')
        ok('START 與 SELECT 同按不觸發暫停（留給 registry 回選單）', r is False, r)

        # ---------------- 音樂 / 音效 ----------------
        r = page.evaluate('''() => { const A = CT.Blocks.Audio; return {songs: Object.keys(A.SONGS), sfx: Object.keys(A.SFX),
            names: Object.values(A.SONGS).map(s => s.name)}; }''')
        ok('原創曲 ≥ 2 首、全部 blocks_ 前綴', len(r['songs']) >= 2 and all(k.startswith('blocks_') for k in r['songs']), r['songs'])
        ok('音效 ≥ 4 個、全部 blocks_ 前綴', len(r['sfx']) >= 4 and all(k.startswith('blocks_') for k in r['sfx']), r['sfx'])
        src = ''.join((ROOT / 'games/cart1/blocks' / f).read_text(encoding='utf-8') for f in ('main.js', 'audio.js', 'art.js'))
        ok('原創性：程式 / 畫面字串不含原作名稱（TETRIS / KOROBEINIKI）',
           'TETRIS' not in src.upper().replace('TETRIS.HTML', '').replace('TETRIS-GAME.HTML', '') and 'KOROBEINIKI' not in src.upper())

        # ---------------- 機器人 ----------------
        fresh(page, '&bot=1')
        r = page.evaluate('''() => { let ml = 0, i; for (i = 0; i < 8000; i++) { __nes.step(1); const st = __nes.stats();
              ml = Math.max(ml, st.maxSpritesLine); if (GAME.state().goal) break; }
            const s = GAME.state().s; return {frames: i, ml, over: __nes.stats().budget.overFrames, lines: s.lines, cheats: s.cheats}; }''')
        ok('機器人（不開密技）馬拉松消 40 行 ≤ 8000 幀', r['lines'] >= 40 and r['cheats'] == 0 and r['frames'] < 8000, r)
        ok('機器人全程每線 ≤ 8 精靈（逐幀量，當前塊 4 + 影子 4）', r['ml'] <= 8, r)
        ok('機器人全程 overFrames == 0', r['over'] == 0, r)
        lint = page.evaluate('() => { __nes.render(); return __nes.lint(); }')
        ok('遊玩畫面 lint 綠', lint.get('ok'), lint)

        ok('全程無頁面錯誤', not errors, errors[:3])
        br.close()

    n_ok = sum(1 for r in results if r[0])
    print('test_blocks: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
