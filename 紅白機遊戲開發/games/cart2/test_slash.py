# -*- coding: utf-8 -*-
"""《星塵忍者斬 STAR BLADE》（cart2 槽 1，id = slash）自動驗證。

重點：三招斬擊判定 / 雷核 / 硬殼兩刀 / 御守 / 漏接扣心 / 一刀多斬 / 配額過關 / 魔王只在開眼時受傷、
      §6 統一規則（密技原地續關、標題無效、goal 排除密技、暫停停 BGM 接續、exit 存分、backTile、說明行距）、
      每線 ≤ 8（設計上界 + 機器人逐幀量 + 配額器主體 0 丟棄）、VBlank ≤ 160 byte。
作法：Playwright 開 `cart2.html?game=slash&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Slash.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_slash.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=slash'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Slash && !!CT.Slash.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart2.slash.best"); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 進到第 s 關的遊玩狀態、關掉出怪（測試自己放物件）
PLAY = """(s) => { const d = CT.Slash.dev; d.stage(s); d.play(); const g = d.g(); g.spawnT = 99999; g.objs = []; __nes.step(1); return g.mode; }"""


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
    reg = page.evaluate("""() => { const g = CT.get('slash'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id / order 1 / title / legacy', reg and reg['id'] == 'slash' and reg['order'] == 1 and reg['title'] == '星塵忍者斬' and reg['legacy'] == ['ninja-slice.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 統一格式：右對齊 6 字元 000000', page.evaluate("() => CT.get('slash').bestText()") == '000000')
    a = page.evaluate("""() => { const A = CT.Slash.Art.make(); const names = A.spr.names.concat(A.bg.names).join(' ');
        return { bg: A.bg.count, spr: A.spr.count, ninja: ['STAND','RUN1','RUN2','JUMP','SLASH','RISE','CLEAVE','HURT'].every(f => [0,1,2,3].every(q => A.spr.has('N' + f + '_' + q))),
                 objs: ['ORE','BEETLE','TALI0','SHELL','CRACK','BOMB','CHARM'].every(k => A.spr.has(k + '_0')),
                 fruit: /FRUIT|APPLE|MELON|BANANA|ORANGE|PEACH|LEMON/.test(names) }; }""")
    ok('CHR：背景 / 精靈 bank ≤ 256；主角 8 影格 × 4 磚', a['bg'] <= 256 and a['spr'] <= 256 and a['ninja'], a)
    ok('原創拋出物：星礦 / 機械蟲 / 符咒 / 硬殼 / 雷核 / 御守，沒有任何水果圖', a['objs'] and not a['fruit'], a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Slash.Audio.SONGS), sfx: Object.keys(CT.Slash.Audio.SFX) })")
    ok('BGM ≥ 1（5 首）、音效 ≥ 4，全部 slash_ 前綴', len(au['songs']) >= 5 and len(au['sfx']) >= 4 and all(k.startswith('slash_') for k in au['songs'] + au['sfx']), au)
    sg = page.evaluate("() => CT.Slash.STAGES.map(s => [s.quota, s.every, s.grav, s.alive, !!s.boss])")
    nb = [x for x in sg if not x[4]]
    ok('≥ 5 般關 + 魔王關（第 6 關）', len(nb) >= 5 and sg[-1][4], sg)
    ok('難度遞增：配額↑、出怪間隔↓、重力↑', all(nb[i][0] < nb[i + 1][0] and nb[i][1] > nb[i + 1][1] and nb[i][2] < nb[i + 1][2] for i in range(len(nb) - 1)), nb)
    lb = page.evaluate("() => CT.Slash.dev.lineBound()")
    ok('每線設計上界（主角 2 + 魔王 4 + 拋出物 2×同屏上限）全部 ≤ 8', max(lb) <= 8, lb)

    # ---------------- 標題 / §6 ----------------
    r = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Slash.Art.make();
        const find = (s) => { const w = A.text(s); for (let y = 0; y < 30; y++) for (let x = 0; x + w.length <= 32; x++) if (w.every((t, i) => p.getTile(0, x + i, y) === t)) return y; return -1; };
        const rows = []; for (let y = 9; y <= 24; y++) { let n = 0; for (let x = 2; x < 30; x++) if (p.getTile(0, x, y)) n++; rows.push(n > 0); }
        let adj = 0; for (let i = 1; i < rows.length; i++) if (rows[i] && rows[i - 1]) adj++;
        return { menu: find('HOLD START+SELECT: MENU'), cheat: find('C/* = CHEAT'), adj, mode: GAME.state().s.mode }; }""")
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', r['menu'] > 0, r)
    ok('§6-6 標題寫著 C/★ = CHEAT（★ 字形）', r['cheat'] > 0, r)
    ok('§6-6 說明文字段落之間空一列', r['adj'] == 0, r)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Slash.dev.g(); return { c, cheated: g.cheated, mode: g.mode }; }")
    ok('§6-1 標題畫面按密技無效', not r['c'] and not r['cheated'] and r['mode'] == 'title', r)

    # ---------------- 流程 ----------------
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    s = st(page)
    ok('START → 第 1 關開場字幕（intro）', s['mode'] == 'intro' and s['stage'] == 0 and s['hearts'] == 5, s)
    page.evaluate("() => __nes.step(100)")
    ok('100 幀後進入遊玩', st(page)['mode'] == 'play')
    page.evaluate(PLAY, 0)
    r = page.evaluate("() => { const g = CT.Slash.dev.g(); g.px = 100; __nes.press('right', 10); return g.px; }")
    ok('→ 每幀移動 2 px', r == 120, r)
    r = page.evaluate("() => { const g = CT.Slash.dev.g(); __nes.release(); __nes.tap('b', 1); const v0 = g.vy; __nes.step(10); const y = g.py >> 8; __nes.step(60); return { v0, y, ground: g.ground, end: g.py >> 8 }; }")
    ok('B 跳躍：升空、落回地面', r['v0'] < 0 and r['y'] < 176 and r['ground'] and r['end'] == 176, r)

    # 橫斬命中星礦
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); g.px = 100; g.face = 1; g.sw = null;
        const o = d.launch('ORE', 124, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0;
        __nes.tap('a', 1); __nes.step(4); return { st: o.st, sliced: g.sliced, score: g.score, combo: g.combo, cuts: g.stat.cuts }; }""")
    ok('A 橫斬：前方星礦被斬開（已斬 +1、連斬 1、加分）', r['st'] == 'cut' and r['sliced'] == 1 and r['combo'] == 1 and r['score'] >= 10, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(20); g.objs = []; g.px = 100; g.face = 1; g.sw = null;
        const o = d.launch('ORE', 70, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0;
        __nes.tap('a', 1); __nes.step(4); return { st: o.st }; }""")
    ok('橫斬只斬面向那一側（背後的不中）', r['st'] == 'fly', r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(20); g.objs = []; g.px = 100; g.sw = null;
        const o = d.launch('BEETLE', 102, 100); o.y = 140 * 256; o.vy = -200; o.vx = 0;
        __nes.press(['a', 'up'], 1); __nes.release(); const vy = g.vy; __nes.step(6); return { st: o.st, vy, ground: g.ground }; }""")
    ok('A+↑ 昇空斬：往上躍起、頭上的機械蟲被斬', r['st'] == 'cut' and r['vy'] < 0 and not r['ground'], r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(60); g.objs = []; g.px = 100; g.face = 1; g.sw = null;
        const o = d.launch('ORE', 70, 100); o.y = 182 * 256; o.vy = 0; o.vx = 0;
        __nes.press(['a', 'down'], 1); __nes.release(); __nes.step(4); return { st: o.st, ground: g.ground }; }""")
    ok('A+↓ 地上下劈 = 貼地橫掃前後（背後低處也中）', r['st'] == 'cut' and r['ground'], r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(20); g.objs = []; g.px = 100; g.sw = null; g.hearts = 5; g.inv = 0;
        __nes.tap('b', 1); __nes.step(12); const o = d.launch('TALI', 100, 100); o.y = (g.py >> 8) * 256 + 22 * 256; o.vy = 0; o.vx = 0; o.gr = 0;
        __nes.press(['a', 'down'], 1); __nes.release(); const vy = g.vy; __nes.step(4); return { st: o.st, vy }; }""")
    ok('A+↓ 空中下劈：向下急墜、腳下的符咒被斬', r['st'] == 'cut' and r['vy'] > 0, r)

    # 雷核 / 硬殼 / 御守 / 漏接 / 一刀多斬
    page.evaluate(PLAY, 2)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); g.px = 100; g.face = 1; g.hearts = 5; g.combo = 4; g.inv = 0;
        const o = d.launch('BOMB', 124, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0;
        __nes.tap('a', 1); __nes.step(3); return { st: o.st, hearts: g.hearts, combo: g.combo, bombs: g.stat.bombs }; }""")
    ok('斬到雷核：爆炸、扣 1 心、連斬歸零', r['st'] == 'boom' and r['hearts'] == 4 and r['combo'] == 0 and r['bombs'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(60); g.objs = []; g.px = 100; g.face = 1; g.sw = null; g.hearts = 5;
        const o = d.launch('BOMB', 150, 100); o.y = 200 * 256; o.vy = 300; o.vx = 0; __nes.step(20); return { hearts: g.hearts, n: g.objs.length }; }""")
    ok('雷核不斬、掉回地面：不扣心', r['hearts'] == 5 and r['n'] == 0, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); g.objs = []; g.px = 100; g.face = 1; g.sw = null; g.inv = 0;
        const o = d.launch('SHELL', 124, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0; o.gr = 0;
        __nes.tap('a', 1); __nes.step(3); const a = { st: o.st, hp: o.hp, vy: o.vy };
        __nes.step(16); o.y = 170 * 256; o.x = 124 * 256; o.vy = 0; o.vx = 0; __nes.tap('a', 1); __nes.step(3); return { a, st: o.st }; }""")
    ok('硬殼：第一刀裂開並彈起、第二刀才斬開', r['a']['st'] == 'fly' and r['a']['hp'] == 1 and r['a']['vy'] < 0 and r['st'] == 'cut', r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(20); g.objs = []; g.px = 100; g.face = 1; g.sw = null; g.hearts = 3;
        const o = d.launch('CHARM', 124, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0;
        __nes.tap('a', 1); __nes.step(3); return { hearts: g.hearts }; }""")
    ok('御守：斬開回 1 心', r['hearts'] == 4, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(20); g.objs = []; g.hearts = 5; g.combo = 3; const m0 = g.stat.misses;
        const o = d.launch('ORE', 200, 100); o.y = 205 * 256; o.vy = 400; o.vx = 0; __nes.step(10); return { hearts: g.hearts, combo: g.combo, miss: g.stat.misses - m0 }; }""")
    ok('漏接：掉回地面扣 1 心、連斬歸零', r['hearts'] == 4 and r['combo'] == 0 and r['miss'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); g.objs = []; g.px = 100; g.face = 1; g.sw = null; const s0 = g.score, m0 = g.stat.multi;
        for (const x of [116, 132]) { const o = d.launch('ORE', x, 100); o.y = 168 * 256; o.vy = 0; o.vx = 0; o.gr = 0; }
        __nes.tap('a', 1); __nes.step(3); return { cut: g.objs.filter(o => o.st === 'cut').length, multi: g.stat.multi - m0, msg: g.msg, gain: g.score - s0 }; }""")
    ok('一刀斬兩個：DOUBLE CUT 額外 +50', r['cut'] == 2 and r['multi'] == 1 and 'DOUBLE' in r['msg'], r)

    # 過關 / GAME OVER
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(30); g.objs = []; g.hearts = 2; g.sliced = g.stage === 2 ? 19 : 0; g.px = 100; g.face = 1; g.sw = null;
        const o = d.launch('ORE', 124, 100); o.y = 170 * 256; o.vy = 0; o.vx = 0; o.gr = 0;
        __nes.tap('a', 1); __nes.step(3); const m = g.mode, h = g.hearts; __nes.step(160); return { m, h, mode: g.mode, stage: g.stage, sliced: g.sliced, cleared: g.cleared }; }""")
    ok('斬滿配額 → STAGE CLEAR、回 2 心', r['m'] == 'clear' and r['h'] == 4, r)
    ok('過關 → 下一關開場（已斬歸零）', r['mode'] == 'intro' and r['stage'] == 3 and r['sliced'] == 0 and r['cleared'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); d.play(); g.spawnT = 99999; g.objs = []; g.score = 4321; g.hearts = 1; g.inv = 0;
        const o = d.launch('ORE', 200, 100); o.y = 205 * 256; o.vy = 400; o.vx = 0; __nes.step(10); const m = g.mode; __nes.step(80);
        return { m, mode: g.mode, best: CT.load('slash', 'best', 0) }; }""")
    ok('心歸零 → 倒下 → GAME OVER、存最高分', r['m'] == 'down' and r['mode'] == 'over' and r['best'] == 4321, r)

    # §6-1 GAME OVER 按密技 = 原地續關
    r = page.evaluate("""() => { const g0 = CT.Slash.dev.g(); const before = { stage: g0.stage, score: g0.score, sliced: g0.sliced };
        const c = CT.cheat(); __nes.step(1); const g = CT.Slash.dev.g();
        return { before, c, mode: g.mode, stage: g.stage, score: g.score, sliced: g.sliced, hearts: g.hearts, cheated: g.cheated, cont: g.continues, song: CT.Slash.Audio.current }; }""")
    ok('§6-1 GAME OVER 按密技 → 同一關續玩（保留分數 / 已斬數、心補滿）', r['c'] and r['mode'] == 'intro' and r['stage'] == r['before']['stage']
       and r['score'] == r['before']['score'] and r['sliced'] == r['before']['sliced'] and r['hearts'] == 5 and r['cont'] == 1 and r['song'] == 'slash_stage', r)
    r = page.evaluate("() => { const g = CT.Slash.dev.g(); g.goalHit = true; return { goal: CT.get('slash').goal(), sg: GAME.state().s.goal, gg: GAME.state().goal }; }")
    ok('§6-1 用過密技的那局 goal() 一律 false', not r['goal'] and not r['sg'] and not r['gg'], r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); d.play(); g.spawnT = 99999; g.hearts = 2;
        const o = d.launch('BOMB', 100, 100); const c = CT.cheat(); __nes.step(1); return { c, hearts: g.hearts, bomb: o.st }; }""")
    ok('遊玩中密技 = 心補滿 + 場上雷核消失', r['c'] and r['hearts'] == 5 and r['bomb'] != 'fly', r)

    # §6-2 暫停
    fresh(page)
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(120); }")
    r = page.evaluate("""() => { __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1); return GAME.state().s.paused; }""")
    ok('SELECT + START 不觸發暫停', not r, r)
    r = page.evaluate("""() => { const M = __nes.nes().music, g = CT.Slash.dev.g(); __nes.step(37);
        const a0 = M.state(); __nes.tap('start', 1); __nes.step(1); const a = M.state(); const px = g.px, t = g.t, n = g.objs.length; __nes.step(120); const b = M.state();
        const p = __nes.nes().ppu, A = CT.Slash.Art.make(), w = A.hud('PAUSE  HOLD START+SELECT: MENU'), txt = w.every((t2, i) => p.getTile(0, 1 + i, 3) === t2);
        const frozen = g.t === t && g.px === px; __nes.tap('start', 1); __nes.step(1); const c = M.state();
        return { pl: a.playing, still: a.rowsPlayed === b.rowsPlayed, txt, frozen, resumed: c.playing, ord: [a0.orderIndex, c.orderIndex], rows: [a.rowsPlayed, c.rowsPlayed], song: CT.Slash.Audio.current, paused: GAME.state().s.paused }; }""")
    ok('START 暫停：遊戲凍結', r['frozen'], r)
    ok('§6-2 暫停時 BGM 停止（120 幀 rowsPlayed 不動）', not r['pl'] and r['still'], r)
    ok('§6-2 解除暫停 → 同一首、同一位置接續', r['resumed'] and r['song'] == 'slash_stage' and r['ord'][0] == r['ord'][1] and r['rows'][1] - r['rows'][0] <= 1 and not r['paused'], r)
    ok('§6-5 暫停 HUD 寫著 PAUSE  HOLD START+SELECT: MENU', r['txt'], r)
    # §6-3 / §6-4
    r = page.evaluate("""() => { const g = CT.Slash.dev.g(); g.score = 777; CT.get('slash').exit(__nes.nes()); const b1 = CT.load('slash', 'best', 0);
        g.score = 5; CT.get('slash').exit(__nes.nes()); return { b1, b2: CT.load('slash', 'best', 0), text: CT.get('slash').bestText() }; }""")
    ok('§6-3 exit() 存最高分（較低不覆蓋）、bestText = 000777', r['b1'] == 777 and r['b2'] == 777 and r['text'] == '000777', r)
    r = page.evaluate("""() => { const bt = CT.get('slash').backTile, A = CT.Slash.Art.make();
        return { bt, back: A.spr.index('BACK'), ninja: [0,1,2,3].map(q => A.spr.index('NSTAND_' + q)) }; }""")
    ok('§6-4 backTile = 金色星（不是主角半身）', r['bt'] and r['bt']['tile'] == r['back'] and r['bt']['tile'] not in r['ninja'] and 0 <= r['bt']['pal'] <= 3, r)

    # ---------------- 魔王 ----------------
    fresh(page, '&stage=6')
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(120); g.objs = [];
        const b = g.boss; b.st = 'hover'; b.x = 100; b.y = 100; b.t = 0; g.px = 108; g.sw = null; g.vy = 0;
        __nes.press(['a', 'up'], 1); __nes.release(); __nes.step(14); const closed = b.hp;
        __nes.step(20); b.st = 'open'; b.t = 0; b.x = 100; b.y = 100; g.sw = null; g.py = 176 * 256; g.ground = true; g.vy = 0;
        __nes.press(['a', 'up'], 1); __nes.release(); __nes.step(14); return { closed, open: b.hp, st: b.st, max: 12 }; }""")
    ok('魔王：閉眼時斬不痛（clang）', r['closed'] == 12, r)
    ok('魔王：俯衝開眼時昇空斬中眼睛 −1', r['open'] == 11, r)
    r = page.evaluate("""() => { const d = CT.Slash.dev, g = d.g(); __nes.step(40); g.objs = []; g.hearts = 5; g.inv = 0; g.px = 100; g.py = 176 * 256; g.ground = true;
        const o = d.launch('BOMB', 104, 999, 104); o.y = 150 * 256; o.vy = 0; o.vx = 0; __nes.step(40); return { hearts: g.hearts, st: o.st }; }""")
    ok('魔王投下的雷核落地爆炸：站在旁邊扣 1 心', r['hearts'] == 4, r)
    r = page.evaluate("""() => { const g = CT.Slash.dev.g(); g.boss.hp = 1; g.boss.st = 'open'; g.boss.t = 0; g.boss.x = 100; g.boss.y = 100; g.sw = null;
        g.px = 108; g.py = 176 * 256; g.ground = true; g.vy = 0; g.inv = 0; g.hurtT = 0;
        __nes.press(['a', 'up'], 1); __nes.release(); __nes.step(14); const st0 = g.boss && g.boss.st; __nes.step(300);
        return { st0, mode: g.mode }; }""")
    ok('魔王 HP 歸零 → 爆炸 → 全破結局', r['st0'] == 'die' and r['mode'] == 'ending', r)

    # ---------------- 機器人：完整一局 + 逐幀硬限制 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let maxLine = 0, peak = 0, colors = 0, i;
        for (i = 0; i < 20000; i++) { __nes.step(1); const s = __nes.stats(); maxLine = Math.max(maxLine, s.maxSpritesLine);
          peak = Math.max(peak, s.budget.used); colors = Math.max(colors, s.colors);
          if (CT.get('slash').goal()) break; }
        const s = __nes.stats(), g = CT.Slash.dev.g();
        return { frames: i, goal: CT.get('slash').goal(), maxLine, over: s.budget.overFrames, peak, colors, cleared: g.cleared, dropMain: g.stat.dropMain, gl: g.stat.maxLine, cheated: g.cheated }; }""")
    ok('機器人不開密技連過 3 關（goal）', hl['goal'] and not hl['cheated'], hl)
    ok('機器人全程每線精靈 ≤ 8（PPU 逐幀量）', hl['maxLine'] <= 8, hl)
    ok('機器人全程主體精靈 0 丟棄（配額器 stat.dropMain）', hl['dropMain'] == 0 and hl['gl'] <= 8, hl)
    ok('機器人全程 overFrames == 0、單幀 ≤ 160 byte', hl['over'] == 0 and hl['peak'] <= 160, hl)
    ok('同屏色數 ≤ 25', hl['colors'] <= 25, hl['colors'])
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：遊玩畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})
    fresh(page, '&bot=1&stage=6')
    r = page.evaluate("""() => { let i, maxLine = 0; for (i = 0; i < 12000; i++) { __nes.step(1); maxLine = Math.max(maxLine, __nes.stats().maxSpritesLine);
        if (GAME.state().s.mode === 'ending' || GAME.state().s.mode === 'over') break; }
        const g = CT.Slash.dev.g(); return { frames: i, mode: g.mode, maxLine, over: __nes.stats().budget.overFrames, dropMain: g.stat.dropMain }; }""")
    ok('機器人打倒魔王鐵燈籠（第 6 關 → 結局），每線 ≤ 8、overFrames 0', r['mode'] == 'ending' and r['maxLine'] <= 8 and r['over'] == 0 and r['dropMain'] == 0, r)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_slash: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
