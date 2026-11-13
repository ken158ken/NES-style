# -*- coding: utf-8 -*-
"""《星塵雷射防衛 PRISM GUARD》（cart2 槽 2，id = laser）自動驗證。

重點：手把游標規格（前 8 幀 1 px、之後 3 px、B 精細）、瞬發雷射 / 充能稜鏡爆 / 過熱、五種敵人（大隕石碎裂、
      分裂彈、閃避機閃避 + 飛鏢）、設施損傷 → 瓦礫、過波修復、魔王眼莢、§6 統一規則、
      每線 ≤ 8（欄數記帳上界 + 機器人逐幀量）、VBlank ≤ 160 byte。
作法：Playwright 開 `cart2.html?game=laser&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Laser.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_laser.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=laser'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Laser && !!CT.Laser.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart2.laser.best"); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 進到第 w 波遊玩、關掉出怪、清場、準星置中、散熱
PLAY = """(w) => { const d = CT.Laser.dev; d.wave(w); d.play(); const g = d.g(); g.spawned = 0; g.spawnT = 99999; g.foes = []; g.heat = 0; g.over = 0;
    g.rx = 128; g.ry = 100; g.cd = 0; __nes.release(); __nes.step(1); return g.mode; }"""


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
    reg = page.evaluate("""() => { const g = CT.get('laser'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id / order 2 / title / legacy', reg and reg['id'] == 'laser' and reg['order'] == 2 and reg['title'] == '星塵雷射防衛' and reg['legacy'] == ['laser-defense.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 統一格式：右對齊 6 字元 000000', page.evaluate("() => CT.get('laser').bestText()") == '000000')
    a = page.evaluate("""() => { const A = CT.Laser.Art.make(), S = CT.Laser.Art.SPR;
        const ret = [0,1,2,3].map(q => S['RET_' + q]); const rows = []; for (let y = 0; y < 16; y++) rows.push(ret[(y >> 3) * 2].concat ? (ret[(y >> 3) * 2][y & 7] + ret[(y >> 3) * 2 + 1][y & 7]) : '');
        const longRun = rows.some(r => /[123]{6,}/.test(r)); const center = rows[7].charAt(7) + rows[8].charAt(8);
        return { bg: A.bg.count, spr: A.spr.count, fac: ['HS00','AS00','RS00','HD00','AD00','RD00','PR00'].every(n => A.bg.has(n)), longRun, center }; }""")
    ok('CHR：bank ≤ 256；三座設施（完好 / 損傷）+ 稜鏡砲磚齊全', a['bg'] <= 256 and a['spr'] <= 256 and a['fac'], a)
    ok('原創準星：菱形光環、中心空、沒有交叉十字的長橫線', not a['longRun'] and a['center'] == '..', a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Laser.Audio.SONGS), sfx: Object.keys(CT.Laser.Audio.SFX) })")
    ok('BGM ≥ 1（5 首）、音效 ≥ 4，全部 laser_ 前綴', len(au['songs']) >= 5 and len(au['sfx']) >= 4 and all(k.startswith('laser_') for k in au['songs'] + au['sfx']), au)
    wv = page.evaluate("() => CT.Laser.WAVES.map(w => [w.n, w.every, w.spd, !!w.boss, Object.keys(w.mix).length])")
    nb = [w for w in wv if not w[3]]
    ok('≥ 8 般波 + 魔王波', len(nb) >= 8 and wv[-1][3], wv)
    ok('難度遞增：數量↑、間隔↓、速度↑、種類不減', all(nb[i][0] <= nb[i + 1][0] and nb[i][1] > nb[i + 1][1] and nb[i][2] < nb[i + 1][2] and nb[i][4] <= nb[i + 1][4] for i in range(len(nb) - 1)), nb)
    cap = page.evaluate("() => ({ cap: CT.Laser.COL_CAP, cols: CT.Laser.COLS })")
    ok('每線設計上界：準星 2 + 敵人欄數上限 + 光束 1 ≤ 8', 2 + cap['cap'] + 1 <= 8 and cap['cols']['SPLIT'] == 3 and cap['cols']['DRONE'] == 3, cap)

    # ---------------- 標題 / §6 ----------------
    r = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Laser.Art.make();
        const find = (s) => { const w = A.text(s); for (let y = 0; y < 30; y++) for (let x = 0; x + w.length <= 32; x++) if (w.every((t, i) => p.getTile(0, x + i, y) === t)) return y; return -1; };
        const rows = []; for (let y = 9; y <= 24; y++) { let n = 0; for (let x = 2; x < 30; x++) if (p.getTile(0, x, y)) n++; rows.push(n > 0); }
        let adj = 0; for (let i = 1; i < rows.length; i++) if (rows[i] && rows[i - 1]) adj++;
        return { menu: find('HOLD START+SELECT: MENU'), cheat: find('C/* = CHEAT'), best: find('BEST 000000'), adj }; }""")
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU；§6-6 C/★ = CHEAT', r['menu'] > 0 and r['cheat'] > 0 and r['best'] > 0, r)
    ok('§6-6 說明文字段落之間空一列', r['adj'] == 0, r)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Laser.dev.g(); return { c, cheated: g.cheated, mode: g.mode }; }")
    ok('§6-1 標題畫面按密技無效', not r['c'] and not r['cheated'] and r['mode'] == 'title', r)

    # ---------------- 流程 / 場地 ----------------
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    s = st(page)
    ok('START → 第 1 波字幕（intro）、三座設施 3 HP', s['mode'] == 'intro' and s['wave'] == 0 and s['hp'] == [3, 3, 3], s)
    r = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Laser.Art.make(), F = CT.Laser.FAC;
        return { drawn: F.map(f => p.getTile(0, f.col, f.row) === A.t(f.pre + 'S00')), rows: F.map(f => f.row + f.h), prism: p.getTile(0, 16, 24) === A.t('PR00') }; }""")
    ok('場地：溫室 / 通訊塔 / 晶核爐 + 稜鏡砲畫在名稱表上', all(r['drawn']) and r['prism'], r)
    ok('三座設施座落高度各不相同（不是一排城市）', len(set(r['rows'])) == 3, r)
    page.evaluate("() => __nes.step(100)")
    ok('100 幀後進入遊玩', st(page)['mode'] == 'play')

    # 游標規格
    page.evaluate(PLAY, 0)
    r = page.evaluate("""() => { const g = CT.Laser.dev.g(); g.rx = 40; g.ry = 100; __nes.press('right', 8); const a = g.rx; __nes.press('right', 12); const b = g.rx; __nes.release(); __nes.step(1);
        __nes.press(['right', 'b'], 10); const c = g.rx; __nes.release(); __nes.step(1); __nes.press(['down', 'left'], 3); const d = [g.rx, g.ry]; __nes.release(); __nes.step(1); return { a, b, c, d }; }""")
    ok('游標：按住前 8 幀 1 px/幀', r['a'] == 48, r)
    ok('游標：之後 3 px/幀', r['b'] == 48 + 36, r)
    ok('游標：按住 B = 精細 1 px/幀', r['c'] == 84 + 10, r)
    ok('游標：斜向（↓←）同時移動', r['d'] == [91, 103], r)
    r = page.evaluate("() => { const g = CT.Laser.dev.g(); __nes.press(['up', 'left'], 120); __nes.release(); __nes.step(1); return [g.rx, g.ry]; }")
    ok('游標：夾在畫面內（HUD 下方）', r[0] == 8 and r[1] == 40, r)

    # 瞬發 / 充能 / 過熱
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.rx = 128; g.ry = 100; g.heat = 0;
        const f = d.foe('ROCK', 124, 96, 1, 0); f.vx = 0; f.vy = 0; const s0 = g.score; __nes.tap('a', 1); __nes.step(1);
        return { st: f.st, score: g.score - s0, heat: g.heat, shots: g.stat.shots }; }""")
    ok('A 瞬發雷射：準星上的小隕石爆炸、+25、熱量 +14', r['st'] == 'boom' and r['score'] == 25 and r['heat'] >= 14 * 4 - 6 and r['shots'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); __nes.step(20); g.foes = []; g.cd = 0;
        const f = d.foe('ROCK', 160, 96, 1, 0); f.vx = 0; f.vy = 0; __nes.tap('a', 1); __nes.step(1); return { st: f.st }; }""")
    ok('瞬發射程外（半徑 10）打不到', r['st'] == 'fly', r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.heat = 0; g.cd = 0; const b0 = g.stat.blasts;
        const fs = [d.foe('ROCK', 104, 96, 1, 0), d.foe('ROCK', 144, 96, 1, 0)]; fs.forEach(f => { f.vx = 0; f.vy = 0; });
        __nes.press('a', 45); const ch = g.charge; __nes.release(); __nes.step(1);
        return { ch, st: fs.map(f => f.st), blasts: g.stat.blasts - b0, r: d.blastR(45) }; }""")
    ok('按住 A 充能 → 放開 = 稜鏡爆（範圍內全部打掉）', r['ch'] >= 40 and r['st'] == ['boom', 'boom'] and r['blasts'] == 1 and r['r'] >= 24, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); __nes.step(20); g.foes = []; g.heat = 380; g.cd = 0; g.over = 0;
        __nes.tap('a', 1); __nes.step(1); const over = g.over; const s0 = g.stat.shots; __nes.step(8); __nes.tap('a', 1); __nes.step(1);
        const s1 = g.stat.shots; __nes.step(95); return { over, blocked: s1 === s0, after: g.over, heat: g.heat, oh: g.stat.overheats }; }""")
    ok('過熱：熱量滿 → 鎖定 90 幀不能射', r['over'] >= 80 and r['blocked'] and r['oh'] == 1, r)
    ok('過熱結束：熱量歸零、恢復射擊', r['after'] == 0 and r['heat'] == 0, r)

    # 敵人
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.cd = 0; g.heat = 0; g.rx = 128; g.ry = 100;
        const f = d.foe('BIG', 120, 92, 1, 0); f.vx = 0; f.vy = 0; __nes.tap('a', 1); __nes.step(1); const hp = f.hp, st1 = f.st;
        __nes.step(8); g.cd = 0; __nes.tap('a', 1); __nes.step(1); return { hp, st1, ks: g.foes.map(x => x.k), cols: d.usedCols() }; }""")
    ok('大隕石：2 HP，打碎裂成兩顆小隕石（欄數不增加）', r['hp'] == 1 and r['st1'] == 'fly' and r['ks'].count('ROCK') == 2 and r['cols'] <= 2, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.rx = 20; g.ry = 180;
        const f = d.foe('SPLIT', 120, 60, 1, 400); f.splitY = 90; const c0 = d.usedCols(); for (let i = 0; i < 40 && g.foes.some(x => x.k === 'SPLIT'); i++) __nes.step(1);
        return { c0, ks: g.foes.map(x => x.k), cols: d.usedCols(), tg: g.foes.map(x => x.fi) }; }""")
    ok('分裂彈：半空裂成 3 顆種子分攻（欄數 3 → 3）', r['c0'] == 3 and r['ks'] == ['SEED'] * 3 and r['cols'] == 3 and len(set(r['tg'])) == 3, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.rx = 200; g.ry = 180;
        const f = d.foe('DRONE', 30, 60, 1, 160); f.y = 80 * 256; f.x = 60 * 256; __nes.step(2);
        g.rx = (f.x >> 8) + 8 + 20; g.ry = (f.y >> 8) + 4; __nes.step(2); const dodge = f.dodge, x0 = f.x >> 8; __nes.step(10);
        return { dodge, moved: x0 - (f.x >> 8) }; }""")
    ok('閃避機：準星靠近就橫移閃開', r['dodge'] > 0 and r['moved'] >= 20, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.rx = 20; g.ry = 40;
        const f = d.foe('DRONE', 30, 60, 1, 160); f.x = 80 * 256; f.y = 80 * 256; f.vx = 200; f.dcd = 999; let dart = null;
        for (let i = 0; i < 200 && !dart; i++) { __nes.step(1); dart = g.foes.find(x => x.k === 'DART'); }
        return { dart: !!dart, fi: dart && dart.fi, cols: d.usedCols(), dx: dart && Math.abs(((dart.x >> 8) + 4) - (CT.Laser.FAC[dart.fi].box.x + CT.Laser.FAC[dart.fi].box.w / 2)) }; }""")
    ok('閃避機：飛到設施正上方丟飛鏢（飛鏢用預留的欄）', r['dart'] and r['cols'] == 3 and r['dx'] <= 6, r)

    # 設施損傷 / 瓦礫 / GAME OVER
    page.evaluate(PLAY, 1)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(), p = __nes.nes().ppu, A = CT.Laser.Art.make(), F = CT.Laser.FAC[0];
        g.rx = 250; g.ry = 40; const hit = () => { const f = d.foe('ROCK', F.box.x + 10, F.box.y - 30, 0, 400); for (let i = 0; i < 40 && g.foes.indexOf(f) >= 0 && f.st === 'fly'; i++) __nes.step(1); __nes.step(20); };
        hit(); const h1 = g.hp[0], t1 = p.getTile(0, F.col, F.row) === A.t('HS00');
        hit(); const h2 = g.hp[0], t2 = p.getTile(0, F.col, F.row) === A.t('HD00');
        hit(); const h3 = g.hp[0], rub = p.getTile(0, F.col, F.row + F.h - 1) === A.t('RUB_A') && p.getTile(0, F.col, F.row) === 0;
        return { h1, t1, h2, t2, h3, rub, hits: g.stat.hits }; }""")
    ok('隕石撞設施 −1 HP（3 → 2 外觀仍完好）', r['h1'] == 2 and r['t1'], r)
    ok('HP 1 → 換成損傷磚', r['h2'] == 1 and r['t2'], r)
    ok('HP 0 → 全毀變瓦礫', r['h3'] == 0 and r['rub'], r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); g.foes = []; g.hp = [0, 2, 3]; g.spawned = 0; g.score = 1000;
        g.spawned = CT.Laser.WAVES[g.wave].n; __nes.step(2); const m = g.mode; __nes.step(30); const hp = g.hp.slice(); __nes.step(130);
        return { m, hp, mode: g.mode, wave: g.wave, cleared: g.cleared, score: g.score }; }""")
    ok('過波：剩餘 HP 獎勵 + 修復最殘破（還活著）的一座 +1、全毀的不修', r['m'] == 'clear' and r['hp'] == [0, 3, 3] and r['score'] == 1000 + 500, r)
    ok('過波 → 下一波字幕', r['mode'] == 'intro' and r['wave'] == 2 and r['cleared'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); d.play(); g.spawned = 0; g.spawnT = 99999; g.foes = []; g.hp = [0, 0, 1]; g.score = 3456; g.rx = 20; g.ry = 40;
        const F = CT.Laser.FAC[2]; d.foe('ROCK', F.box.x + 10, F.box.y - 20, 2, 400); __nes.step(30); const m = g.mode; __nes.step(100);
        return { m, mode: g.mode, best: CT.load('laser', 'best', 0) }; }""")
    ok('三座全毀 → GAME OVER、存最高分', r['m'] == 'down' and r['mode'] == 'over' and r['best'] == 3456, r)
    r = page.evaluate("""() => { const g0 = CT.Laser.dev.g(), w0 = g0.wave, s0 = g0.score; const c = CT.cheat(); __nes.step(1); const g = CT.Laser.dev.g();
        return { c, w0, s0, mode: g.mode, wave: g.wave, score: g.score, hp: g.hp, cheated: g.cheated, cont: g.continues, spawned: g.spawned, song: CT.Laser.Audio.current }; }""")
    ok('§6-1 GAME OVER 按密技 → 同一波重來（設施全修、保留分數）', r['c'] and r['mode'] == 'intro' and r['wave'] == r['w0'] and r['score'] == r['s0']
       and r['hp'] == [3, 3, 3] and r['spawned'] == 0 and r['cont'] == 1 and r['song'] == 'laser_wave', r)
    r = page.evaluate("() => { const g = CT.Laser.dev.g(); g.goalHit = true; return { goal: CT.get('laser').goal(), sg: GAME.state().s.goal }; }")
    ok('§6-1 用過密技的那局 goal() 一律 false', not r['goal'] and not r['sg'], r)
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); d.play(); g.hp = [0, 1, 2]; g.heat = 300; const c = CT.cheat(); __nes.step(1); return { c, hp: g.hp, heat: g.heat }; }""")
    ok('遊玩中密技 = 三座設施全修好（含重建）+ 散熱', r['c'] and r['hp'] == [3, 3, 3] and r['heat'] <= 3, r)

    # §6-2 暫停 / §6-3 / §6-4
    fresh(page)
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(120); }")
    r = page.evaluate("""() => { __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1); return GAME.state().s.paused; }""")
    ok('SELECT + START 不觸發暫停', not r, r)
    r = page.evaluate("""() => { const M = __nes.nes().music, g = CT.Laser.dev.g(); __nes.step(41);
        const a0 = M.state(); __nes.tap('start', 1); __nes.step(1); const a = M.state(); const t = g.t, rx = g.rx; __nes.press('right', 30); __nes.release(); const b = M.state();
        const p = __nes.nes().ppu, A = CT.Laser.Art.make(), w = A.hud('PAUSE  HOLD START+SELECT: MENU'), txt = w.every((t2, i) => p.getTile(0, 1 + i, 3) === t2);
        const frozen = g.t === t && g.rx === rx; __nes.step(90); __nes.tap('start', 1); __nes.step(1); const c = M.state();
        return { pl: a.playing, still: a.rowsPlayed === b.rowsPlayed, txt, frozen, resumed: c.playing, ord: [a0.orderIndex, c.orderIndex], rows: [a.rowsPlayed, c.rowsPlayed], song: CT.Laser.Audio.current }; }""")
    ok('START 暫停：遊戲與準星凍結', r['frozen'], r)
    ok('§6-2 暫停時 BGM 停止、解除後同一位置接續', not r['pl'] and r['still'] and r['resumed'] and r['song'] == 'laser_wave' and r['ord'][0] == r['ord'][1] and r['rows'][1] - r['rows'][0] <= 1, r)
    ok('§6-5 暫停 HUD 寫著 PAUSE  HOLD START+SELECT: MENU', r['txt'], r)
    r = page.evaluate("""() => { const g = CT.Laser.dev.g(); g.score = 4321; CT.get('laser').exit(__nes.nes()); const b1 = CT.load('laser', 'best', 0);
        g.score = 1; CT.get('laser').exit(__nes.nes()); return { b1, b2: CT.load('laser', 'best', 0), text: CT.get('laser').bestText() }; }""")
    ok('§6-3 exit() 存最高分（較低不覆蓋）、bestText = 004321', r['b1'] == 4321 and r['b2'] == 4321 and r['text'] == '004321', r)
    r = page.evaluate("""() => { const bt = CT.get('laser').backTile, A = CT.Laser.Art.make(); return { bt, back: A.spr.index('BACK'), ret: [0,1,2,3].map(q => A.spr.index('RET_' + q)) }; }""")
    ok('§6-4 backTile = 星（不是準星的四分之一）', r['bt'] and r['bt']['tile'] == r['back'] and r['bt']['tile'] not in r['ret'], r)

    # ---------------- 魔王 ----------------
    fresh(page, '&wave=9')
    r = page.evaluate("""() => { const d = CT.Laser.dev, g = d.g(); __nes.step(170); const b = g.boss; const st0 = b && b.st; g.foes = [];
        b.x = 100; const px = b.x + 12, py = b.y + 10; const p0 = b.pods.slice(); d.fireAt(px, py, 4, false); const p1 = b.pods.slice();
        b.pods = [0, 0, 0, 1]; d.fireAt(b.x + 27, b.y + 10, 4, false); const st1 = b.st; __nes.step(300);
        return { st0, p0, p1, st1, mode: g.mode }; }""")
    ok('魔王「彗眼」：4 顆眼莢各 6 HP，打中扣 1', r['st0'] == 'fight' and r['p0'] == [6, 6, 6, 6] and sum(r['p1']) == 23, r)
    ok('眼莢全滅 → 魔王爆炸 → 結局', r['st1'] == 'die' and r['mode'] == 'ending', r)

    # ---------------- 機器人：完整一局 + 逐幀硬限制 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let maxLine = 0, peak = 0, colors = 0, i;
        for (i = 0; i < 20000; i++) { __nes.step(1); const s = __nes.stats(); maxLine = Math.max(maxLine, s.maxSpritesLine);
          peak = Math.max(peak, s.budget.used); colors = Math.max(colors, s.colors);
          if (CT.get('laser').goal()) break; }
        const s = __nes.stats(), g = CT.Laser.dev.g();
        return { frames: i, goal: CT.get('laser').goal(), maxLine, over: s.budget.overFrames, peak, colors, cleared: g.cleared, dropMain: g.stat.dropMain, maxCols: g.stat.maxCols, cheated: g.cheated }; }""")
    ok('機器人不開密技守過 5 波（goal）', hl['goal'] and not hl['cheated'], hl)
    ok('機器人全程每線精靈 ≤ 8（PPU 逐幀量）', hl['maxLine'] <= 8, hl)
    ok('機器人全程敵人欄數 ≤ 5、主體 0 丟棄', hl['maxCols'] <= 5 and hl['dropMain'] == 0, hl)
    ok('機器人全程 overFrames == 0、單幀 ≤ 160 byte', hl['over'] == 0 and hl['peak'] <= 160, hl)
    ok('同屏色數 ≤ 25', hl['colors'] <= 25, hl['colors'])
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：遊玩畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})
    fresh(page, '&bot=1&wave=9')
    r = page.evaluate("""() => { let i, maxLine = 0; for (i = 0; i < 12000; i++) { __nes.step(1); maxLine = Math.max(maxLine, __nes.stats().maxSpritesLine);
        if (GAME.state().s.mode === 'ending' || GAME.state().s.mode === 'over') break; }
        const g = CT.Laser.dev.g(); return { frames: i, mode: g.mode, maxLine, over: __nes.stats().budget.overFrames, maxCols: g.stat.maxCols }; }""")
    ok('機器人打倒魔王彗眼（第 9 波 → 結局），每線 ≤ 8、overFrames 0', r['mode'] == 'ending' and r['maxLine'] <= 8 and r['over'] == 0 and r['maxCols'] <= 5, r)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_laser: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
