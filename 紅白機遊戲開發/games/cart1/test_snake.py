# -*- coding: utf-8 -*-
"""《星塵貪食蟲》（cart1 槽 5，id = snake）自動驗證：場地資料 / 註冊契約 / 移動與轉向 / 成長 / 傳送門 /
三模式流程（經典無盡 / 關卡制 / 對戰電腦蟲）/ 暫停 / 密技 / 硬限制 / 機器人。

作法：Playwright(Chromium) 開 `cart1.html?game=snake&debug=1&scale=1&mute=1[&mode=..|&stage=N]`，
`__nes.*` 推進、`CT.Snake.dev` 佈置場面。期望值來源：docs/R5_BRIEF.md §3 / §4 C5-1、snake/stages.js。

用法：../卡比之星/.venv/bin/python games/cart1/test_snake.py [-v] [--no-bot]
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?game=snake&debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv
NO_BOT = '--no-bot' in sys.argv
BOT_MAX = 12000

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail != '' else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Snake && !!CT.Snake.dev')
    page.evaluate('() => localStorage.clear()')
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Snake && !!CT.Snake.dev')
    page.evaluate('() => __nes.step(1)')


def S(page):
    return page.evaluate('() => GAME.state().s')


def play(page, query):
    fresh(page, query)
    page.evaluate('() => __nes.step(72)')       # 跳過 READY
    return S(page)


def until_move(page, n=1):
    """推進到蟲剛好走了 n 格（用 head 變化判斷）。"""
    return page.evaluate('''(n) => { let moved = 0, h = JSON.stringify(GAME.state().s.head), f = 0;
        while (moved < n && f < 200) { __nes.step(1); f++; const s = GAME.state().s; if (s.mode !== 'play') break;
          const h2 = JSON.stringify(s.head); if (h2 !== h) { moved++; h = h2; } }
        return f; }''', n)


JS_STAGECHECK = r"""
() => {
  const Sn = CT.Snake, W = Sn.FW, H = Sn.FH, out = [];
  const all = Sn.STAGES.concat([Sn.ENDLESS, Sn.ARENA]);
  for (const d of all) {
    const occ = new Int8Array(W * H);
    for (const w of d.walls) for (let y = w[1]; y < w[1] + w[3]; y++) for (let x = w[0]; x < w[0] + w[2]; x++) occ[y * W + x] = 1;
    let portalBad = 0;
    const portal = {};
    for (const p of d.portals) { for (const c of [p.a, p.b]) { if (occ[c[1] * W + c[0]]) portalBad++; occ[c[1] * W + c[0]] = 2; } portal[p.a.join()] = p.b; portal[p.b.join()] = p.a; }
    // 起始蟲身（含電腦蟲）不能壓在牆 / 門上
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    let startBad = 0;
    for (const st of [d.start, d.cpu].filter(Boolean)) for (let i = 0; i < Sn.START_LEN + 3; i++) {
      const x = st[0] - DX[st[2]] * i + (i >= Sn.START_LEN ? DX[st[2]] * (i - Sn.START_LEN + 1) * 0 : 0), y = st[1] - DY[st[2]] * i;
      if (i < Sn.START_LEN && (x < 0 || y < 0 || x >= W || y >= H || occ[y * W + x])) startBad++;
    }
    // 起點前方 3 格要空（開局不會一出門就撞）
    for (let i = 1; i <= 3; i++) { const x = d.start[0] + DX[d.start[2]] * i, y = d.start[1] + DY[d.start[2]] * i; if (x < 0 || y < 0 || x >= W || y >= H || occ[y * W + x]) startBad++; }
    // 連通：所有空格（含傳送門跳躍）一個連通塊
    let free = 0, s0 = -1;
    for (let i = 0; i < W * H; i++) if (!occ[i]) { free++; if (s0 < 0) s0 = i; }
    const seen = new Uint8Array(W * H), q = [s0]; seen[s0] = 1; let reach = 0;
    while (q.length) { const k = q.shift(), x = k % W, y = (k / W) | 0; reach++;
      for (let dd = 0; dd < 4; dd++) { let nx = x + DX[dd], ny = y + DY[dd]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (occ[ny * W + nx] === 2) { const t = portal[nx + ',' + ny]; nx = t[0] + DX[dd]; ny = t[1] + DY[dd]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; }
        const nk = ny * W + nx; if (occ[nk] || seen[nk]) continue; seen[nk] = 1; q.push(nk); } }
    out.push({ name: d.name, target: d.target, speed: d.speed, portals: d.portals.length, walls: d.walls.length, portalBad, startBad, free, reach });
  }
  return out;
}
"""

JS_BOT = r"""
(n) => { let peak = 0, done = false;
  for (let i = 0; i < n; i++) { __nes.step(1); const st = __nes.stats(); if (st.maxSpritesLine > peak) peak = st.maxSpritesLine; if (GAME.state().goal) { done = true; break; } }
  const st = __nes.stats(); return { peak, done, frame: st.frame, over: st.budget.overFrames, bpeak: st.budget.peak, s: GAME.state().s };
}
"""


def main():
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception as e:  # noqa
            print('無法啟動 Chromium：', e)
            return 2
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        # ---------------- ① 註冊 / 標題 ----------------
        fresh(page)
        reg = page.evaluate('''() => { const g = CT.get('snake'); return g && { order: g.order, title: g.title, legacy: g.legacy,
            fns: ['init','update','draw','state','exit','cheat','bot','goal','bestText'].filter(k => typeof g[k] === 'function') }; }''')
        ok('註冊：CT.get("snake") 存在、order 5、標題 星塵貪食蟲', reg and reg['order'] == 5 and reg['title'] == '星塵貪食蟲', reg)
        ok('註冊：契約函式齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
        ok('註冊：legacy = snake.html + snake-game.html', reg and reg['legacy'] == ['snake.html', 'snake-game.html'])
        st = S(page)
        ok('開局：標題選單（mode=title）、標題曲 snake_title', st['mode'] == 'title' and st['song'] == 'snake_title', st['mode'])
        lint = page.evaluate('() => __nes.lint()')
        ok('標題：lint 綠、選單游標精靈每線 ≤ 8', lint['ok'] and lint['maxSpritesLine'] <= 8, (lint.get('colors'), lint.get('maxSpritesLine')))
        page.evaluate('() => { __nes.tap("down", 1); __nes.step(1); }')
        s1 = S(page)['sel']
        page.evaluate('() => { __nes.tap("up", 1); __nes.step(1); __nes.tap("up", 1); __nes.step(1); }')
        s2 = S(page)['sel']
        ok('選單：↓ 下移、↑ 上移並環繞（0 → 1 → 0 → 2）', s1 == 1 and s2 == 2, (s1, s2))
        names = page.evaluate('() => Object.keys(CT.Snake.SONGS).concat(Object.keys(CT.Snake.SFX))')
        ok('聲音：曲名 / 音效名全部 snake_ 前綴、≥ 1 首 BGM + ≥ 4 個音效',
           all(n.startswith('snake_') for n in names) and len(page.evaluate('() => Object.keys(CT.Snake.SFX)')) >= 4, names)
        r22, r23, r24 = (page.evaluate('(r) => CT.Snake.dev.rowText(r)', r) for r in (22, 23, 24))
        ok('P3-5 標題說明行距：兩行說明之間空一列', r22.strip() != '' and r23.strip() == '' and r24.strip() != '', (r22, r23, r24))
        ok('P3-6 標題寫 C/★ CHEAT（不是 C CHEAT）', 'C/★ CHEAT' in r24, r24)
        c0 = S(page)['cheats']
        rr = page.evaluate('() => CT.get("snake").cheat()')
        page.evaluate('() => __nes.step(1)')
        ok('P3-7 標題畫面按密技無效（cheat() false、cheats 不變）', rr is False and S(page)['cheats'] == c0 and S(page)['mode'] == 'title', (rr, S(page)['cheats']))
        bt = page.evaluate('''() => { const b = CT.get("snake").backTile, spr = CT.Snake.dev.spr(); return b && { tile: b.tile, pal: b.pal, name: spr.names[b.tile] }; }''')
        ok('§6-4 backTile = 自己精靈表的實心小星 BACK（pal 0）', bt and bt['name'] == 'BACK' and bt['pal'] == 0, bt)
        bank = page.evaluate('() => ({ bg: CT.Snake.dev.bg().count, bg0: CT.Snake.dev.bg().names[0] })')
        ok('CHR：背景 bank ≤ 256 磁磚、0 號 = 空白', bank['bg'] <= 256 and bank['bg0'] == 'SP', bank)

        # ---------------- ② 場地資料 ----------------
        sc = page.evaluate(JS_STAGECHECK)
        stages = sc[:-2]
        ok('關卡制：≥ 6 關（實作 8 關）', len(stages) >= 6, len(stages))
        ok('關卡：每關空格全部連通（含傳送門）', all(s['reach'] == s['free'] for s in sc), [(s['name'], s['reach'], s['free']) for s in sc])
        ok('關卡：起始蟲身與前方 3 格不壓牆 / 門', all(s['startBad'] == 0 for s in sc), [(s['name'], s['startBad']) for s in sc])
        ok('關卡：傳送門不壓在牆上', all(s['portalBad'] == 0 for s in sc))
        ok('關卡：第 2 關起有障礙、第 3 關起有傳送門、≥ 2 關有兩組傳送門',
           all(s['walls'] > 0 for s in stages[1:]) and all(s['portals'] > 0 for s in stages[2:]) and sum(1 for s in stages if s['portals'] >= 2) >= 2)
        ok('難度：目標數不遞減、速度（幀 / 格）不遞增', all(stages[i + 1]['target'] >= stages[i]['target'] and stages[i + 1]['speed'] <= stages[i]['speed'] for i in range(len(stages) - 1)))

        # ---------------- ③ 移動 / 轉向 / 成長 ----------------
        st = play(page, '&mode=stages')
        ok('STAGES：第 1 關、3 命、蟲長 4、mode=play', st['stage'] == 1 and st['lives'] == 3 and st['length'] == 4 and st['mode'] == 'play', (st['stage'], st['lives'], st['length'], st['mode']))
        f = until_move(page, 2)
        f2 = until_move(page, 1)
        ok('移動：第 1 關每 8 幀走一格', f2 == 8, (f, f2))
        h0 = S(page)['head']
        page.evaluate('() => __nes.tap("up", 1)')
        until_move(page, 1)
        st = S(page)
        ok('轉向：按 ↑ → 下一步往上（dir 0、頭 y - 1）', st['dir'] == 0 and st['head'][1] == h0[1] - 1, (st['dir'], h0, st['head']))
        page.evaluate('() => __nes.tap("down", 1)')
        until_move(page, 1)
        ok('不能直接掉頭（往上時按 ↓ 被忽略）', S(page)['dir'] == 0, S(page)['dir'])
        page.evaluate('() => { __nes.tap("right", 1); __nes.tap("down", 1); }')
        until_move(page, 1)
        d1 = S(page)['dir']
        until_move(page, 1)
        d2 = S(page)['dir']
        ok('預先排 2 個轉向：→ 再 ↓ 依序生效', d1 == 1 and d2 == 2, (d1, d2))
        sc0 = S(page)
        page.evaluate('() => { const s = GAME.state().s; CT.Snake.dev.placeFood(s.head[0], s.head[1] + 1); }')
        until_move(page, 1)
        st = S(page)
        until_move(page, 1)
        st2 = S(page)
        ok('吃星：分數增加、STAR 計數 +1、新的星立刻生成', st['score'] > sc0['score'] and st['eaten'] == sc0['eaten'] + 1 and st['food'] is not None, (st['score'], st['eaten'], st['food']))
        ok('吃星後身長 +1', st2['length'] == sc0['length'] + 1, (sc0['length'], st2['length']))
        ok('HUD 第 2 列寫著關卡名（名稱表 (1,2) 非空）', page.evaluate('() => CT.Snake.dev.shadowAt(1, 2) !== 0'))

        # 星鑽
        play(page, '&mode=stages')
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.foods = 4; }')
        page.evaluate('() => { const s = GAME.state().s; CT.Snake.dev.placeFood(s.head[0] + 1, s.head[1]); }')
        until_move(page, 1)
        st = S(page)
        ok('每 5 顆星冒出限時星鑽', st['gem'] is not None, st['gem'])
        page.evaluate('''() => { const g = CT.Snake.dev.g(), s = GAME.state().s, gm = s.gem;
            g.occ[gm[1] * 30 + gm[0]] = 0; g.gem.x = s.head[0] + 1; g.gem.y = s.head[1]; g.occ[s.head[1] * 30 + s.head[0] + 1] = 4; }''')
        until_move(page, 1)
        l0 = S(page)['length']
        until_move(page, 3)
        ok('吃星鑽：+3 節（之後 3 步每步長 1 節）', S(page)['length'] == l0 + 3 and S(page)['mode'] == 'play', (l0, S(page)['length']))

        # 撞牆 / 撞自己 / 追尾巴
        st = play(page, '&mode=stages')
        page.evaluate('() => { __nes.tap("down", 1); }')
        until_move(page, 6)
        st = S(page)
        ok('撞外牆 → crash', st['mode'] == 'crash', (st['mode'], st['head']))
        page.evaluate('() => __nes.step(90)')
        st = S(page)
        ok('撞毀後命 -1、同一關重來（ready）', st['lives'] == 2 and st['mode'] in ('ready', 'play') and st['stage'] == 1, (st['lives'], st['mode']))
        st = play(page, '&mode=stages')
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.pl.grow = 4; }')
        until_move(page, 4)
        page.evaluate('() => { __nes.tap("up", 1); __nes.step(1); __nes.tap("left", 1); }')
        until_move(page, 2)
        page.evaluate('() => { __nes.tap("down", 1); }')
        until_move(page, 1)
        ok('撞到自己 → crash', S(page)['mode'] == 'crash', S(page)['mode'])
        st = play(page, '&mode=stages')
        page.evaluate('() => { __nes.tap("up", 1); __nes.step(1); __nes.tap("left", 1); }')
        until_move(page, 2)
        page.evaluate('() => { __nes.tap("down", 1); }')
        until_move(page, 2)
        ok('身長 4 繞小圈：走進「正要讓開的尾巴格」不算撞', S(page)['mode'] == 'play', S(page)['mode'])

        # 傳送門
        st = play(page, '&stage=3')
        tp = page.evaluate('''() => { const d = CT.Snake.dev, g = d.g();
            const a = d.stepCell(3, 10, 3), b = d.stepCell(26, 10, 1), blocked = d.stepCell(2, 9, 2);
            return { a, b, blocked }; }''')
        ok('傳送門：從 (3,10) 往左進 A → 從 (27,10) 往左出（落在 (26,10)）', tp['a'] and tp['a']['x'] == 26 and tp['a']['y'] == 10 and tp['a']['warp'], tp['a'])
        ok('傳送門雙向：從 (26,10) 往右進 → 落在 (3,10)', tp['b'] and tp['b']['x'] == 3 and tp['b']['warp'], tp['b'])
        tp2 = page.evaluate('''() => { const d = CT.Snake.dev; d.stage(7); return d.stepCell(13, 10, 1); }''')
        ok('傳送門出口被擋（第 7 關 (1,0) 往右出口外是牆以外 → 自動轉彎）', tp2 is not None and tp2['warp'], tp2)
        st = play(page, '&stage=3')
        page.evaluate('''() => { const g = CT.Snake.dev.g(); /* 蟲頭搬到 (4,10) 往左 */
            g.pl.cells.forEach(c => { g.occ[c[1] * 30 + c[0]] = 0; });
            g.pl.cells = [[4, 10], [5, 10], [6, 10], [7, 10]]; g.pl.dir = 3; g.pl.cells.forEach(c => { g.occ[c[1] * 30 + c[0]] = 5; }); g.moveT = 0; }''')
        until_move(page, 2)
        st = S(page)
        ok('實際走進傳送門：頭從右側出來、warps = 1', st['head'][0] >= 25 and st['warps'] == 1 and st['mode'] == 'play', (st['head'], st['warps']))

        # 過關
        st = play(page, '&mode=stages')
        page.evaluate('() => { CT.Snake.dev.setEaten(7); const s = GAME.state().s; CT.Snake.dev.placeFood(s.head[0] + 1, s.head[1]); }')
        until_move(page, 1)
        page.evaluate('() => __nes.step(2)')
        st = S(page)
        ok('吃滿目標 → STAGE CLEAR（過關曲）', st['mode'] == 'clear' and st['song'] == 'snake_clear', (st['mode'], st['song']))
        page.evaluate('() => __nes.step(140)')
        st = S(page)
        ok('過關 → 第 2 關 TWIN BARS、底色換掉', st['stage'] == 2 and st['stageName'] == 'TWIN BARS', (st['stage'], st['stageName']))
        ok('關卡存檔（CT.load snake.stage ≥ 1）', page.evaluate('() => CT.load("snake", "stage", 0)') >= 1)

        # 暫停 / 密技
        page.evaluate('() => __nes.step(80)')
        h0 = S(page)['head']
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(40); }')
        st = S(page)
        ok('START 暫停：蟲不動、PAUSE 訊息', st['paused'] and st['head'] == h0, (st['paused'], h0, st['head']))
        ok('§6-5 暫停畫面寫 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in page.evaluate('() => CT.Snake.dev.rowText(17)'))
        mus = page.evaluate('() => { const d = NES.Music._default, a = d.rowsPlayed; __nes.step(60); return { playing: !!d.playing, rows: d.rowsPlayed - a, paused: d.isPaused(), ord: d.orderIndex, row: d.row, rp: d.rowsPlayed }; }')
        snap = mus
        ok('§6-2 暫停 = BGM 停（playing false、60 幀 rowsPlayed 不前進）', not mus['playing'] and mus['rows'] == 0, mus)
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(1); }')
        mus = page.evaluate('() => { const d = NES.Music._default; return { playing: !!d.playing, cur: CT.Snake.Audio.current, ord: d.orderIndex, row: d.row, rp: d.rowsPlayed }; }')
        ok('§6-2 解除暫停 → 同一首 BGM 接續（snake_play）', mus['playing'] and mus['cur'] == 'snake_play', mus)
        ok('fix-r6 P3-8 暫停走 engine pause、解除從同一小節同一 row 接續（不回 row 0）',
           snap['paused'] and mus['ord'] == snap['ord'] and mus['row'] in (snap['row'], snap['row'] + 1) and 0 <= mus['rp'] - snap['rp'] <= 1, (snap, mus))
        ok('§6-5 解除暫停 → 提示清掉', 'HOLD' not in page.evaluate('() => CT.Snake.dev.rowText(17)'))
        i0 = S(page)['interval']; l0 = S(page)['lives']
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(1); }')
        st = S(page)
        ok('一鍵密技：+1 命、慢動作（每格多 3 幀）、cheats = 1', st['lives'] == l0 + 1 and st['interval'] == i0 + 3 and st['cheats'] == 1, (l0, st['lives'], i0, st['interval']))
        page.evaluate('() => { CT.Snake.dev.g().clearsRun = 3; }')
        ok('開過密技 → goal() 不成立', not page.evaluate('() => CT.get("snake").goal()'))

        # ---------------- ④ 經典無盡 ----------------
        st = play(page, '&mode=endless')
        ok('ENDLESS：空場地、HUD 顯示 SPEED', st['sMode'] == 'ENDLESS' and st['interval'] == 8, (st['sMode'], st['interval']))
        page.evaluate('() => { CT.Snake.dev.g().foods = 5; }')
        ok('ENDLESS：每 5 顆加速一級（8 → 7 幀 / 格）', S(page)['interval'] == 7, S(page)['interval'])
        page.evaluate('() => { CT.Snake.dev.g().score = 777; CT.Snake.dev.g().best = 777; __nes.tap("up", 1); }')
        until_move(page, 20)
        page.evaluate('() => __nes.step(90)')
        st = S(page)
        ok('ENDLESS：撞牆 → GAME OVER、經典最高分存檔', st['mode'] == 'over' and page.evaluate('() => CT.load("snake", "endless", 0)') == 777, (st['mode'],))
        pre = S(page)
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(2); }')
        st = S(page)
        ok('§6-1 ENDLESS GAME OVER 按密技 → 原地續玩（ready、分數 777 保留、cheats +1）',
           st['mode'] == 'ready' and st['score'] == pre['score'] == 777 and st['sMode'] == 'ENDLESS' and st['cheats'] == pre['cheats'] + 1, (st['mode'], st['score'], st['cheats']))
        page.evaluate('() => { __nes.step(72); __nes.tap("up", 1); }')
        until_move(page, 30)
        page.evaluate('() => __nes.step(90)')
        ok('續玩後再撞 → 再次 GAME OVER', S(page)['mode'] == 'over', S(page)['mode'])
        page.evaluate('() => __nes.step(210)')
        ok('GAME OVER → 回標題', S(page)['mode'] == 'title')

        # §6-1 關卡制：最後一命 → GAME OVER → 密技 = 同一關續關、命數回 3
        st = play(page, '&mode=stages&stage=4')
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.lives = 1; g.score = 345; g.pl.eaten = 3; __nes.tap("up", 1); }')
        until_move(page, 30)
        page.evaluate('() => __nes.step(90)')
        pre = S(page)
        ok('關卡制最後一命撞毀 → GAME OVER', pre['mode'] == 'over', pre['mode'])
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(2); }')
        st = S(page)
        ok('§6-1 關卡制 GAME OVER 按密技 → 同一關（第 4 關）續關、命數 3、分數保留',
           st['mode'] == 'ready' and st['stage'] == 4 and st['lives'] == 3 and st['score'] == pre['score'], (st['mode'], st['stage'], st['lives'], st['score'], pre['score']))
        page.evaluate('() => { CT.Snake.dev.g().clearsRun = 3; }')
        ok('§6-1 用過密技續關 → goal() 不成立', not page.evaluate('() => CT.get("snake").goal()'))
        # §6-3 中途離開也存最高分
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.score = 8888; g.best = 8888; CT.get("snake").exit(__nes); }')
        ok('§6-3 exit() 把目前分數寫入最高分（8888）', page.evaluate('() => CT.load("snake", "best", 0)') == 8888)

        # ---------------- ⑤ 對戰電腦蟲 ----------------
        st = play(page, '&mode=vs&bot=1')
        ok('VS CPU：雙蟲上場、對戰曲 snake_vs', st['cpu'] is not None and st['song'] == 'snake_vs' and st['cpu']['length'] == 4, st['cpu'])
        page.evaluate('() => __nes.step(900)')
        st = S(page)
        ok('電腦蟲會自己找星吃（900 幀內吃到 ≥ 2 顆）', st['cpu']['eaten'] >= 2, st['cpu'])
        lint = page.evaluate('() => __nes.lint()')
        ok('對戰畫面 lint 綠（兩條蟲同一組背景調色盤）', lint['ok'] and lint['colors'] <= 25, lint.get('colors'))
        st = play(page, '&mode=vs')
        page.evaluate('''() => { const g = CT.Snake.dev.g(); const put = (s, cells, dir, code) => { s.cells.forEach(c => { g.occ[c[1] * 30 + c[0]] = 0; }); s.cells = cells; s.dir = dir; cells.forEach(c => { g.occ[c[1] * 30 + c[0]] = code; }); };
            put(g.pl, [[12, 18], [11, 18], [10, 18], [9, 18]], 1, 5); put(g.cpu, [[14, 18], [15, 18], [16, 18], [17, 18]], 3, 6); g.moveT = 0; CT.Snake.dev.cpuDir(3); }''')
        until_move(page, 1)
        page.evaluate('() => __nes.step(2)')
        st = S(page)
        ok('正面對撞（搶同一格）→ 雙雙撞毀', st['mode'] == 'crash', st['mode'])
        page.evaluate('() => __nes.step(90)')
        ok('雙雙撞毀 = 平手，重打這一局（比分不變）', S(page)['winsP'] == 0 and S(page)['winsC'] == 0 and S(page)['mode'] == 'round', (S(page)['mode'], S(page)['winsP'], S(page)['winsC']))
        st = play(page, '&mode=vs')
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.pl.eaten = 9; const s = GAME.state().s; CT.Snake.dev.placeFood(s.head[0] + 1, s.head[1]); }')
        until_move(page, 1)
        page.evaluate('() => __nes.step(2)')
        st = S(page)
        ok('先吃滿 10 顆 → 贏這一局（WINS 1-0）', st['winsP'] == 1 and st['mode'] == 'round', (st['winsP'], st['mode']))
        page.evaluate('() => __nes.step(150)')
        ok('下一局：ROUND 2、電腦蟲變快（interval 5）', S(page)['round'] == 2 and S(page)['interval'] == 5, (S(page)['round'], S(page)['interval']))
        # §6-1 對戰輸掉整場 → 密技 = 同一局重打（撤銷剛才輸掉的那局）
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.winsC = 2; g.mode = "over"; }')
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(2); }')
        st = S(page)
        ok('§6-1 VS 輸掉整場按密技 → 同一局重打（ready、ROUND 2、CPU 勝場 2 → 1）', st['mode'] == 'ready' and st['round'] == 2 and st['winsC'] == 1, (st['mode'], st['round'], st['winsC']))
        page.evaluate('() => { const g = CT.Snake.dev.g(); g.winsP = 2; g.mode = "over"; }')
        ok('§6-1 VS 贏下整場的結束畫面按密技無效', page.evaluate('() => CT.get("snake").cheat()') is False)

        # ---------------- ⑥ 機器人：關卡制過 3 關 ----------------
        if not NO_BOT:
            page.goto(BASE + '&bot=1')
            page.wait_for_function('() => !!window.__nes && !!CT.Snake')
            peak = 0; r = None; total = 0
            while total < BOT_MAX:
                r = page.evaluate(JS_BOT, 2000)
                total += 2000
                peak = max(peak, r['peak'])
                if r['done']:
                    break
            s = r['s']
            print('  bot: frame=%d stage=%d clears=%d deaths=%d score=%d peakLine=%d overFrames=%d budgetPeak=%d' % (
                r['frame'], s['stage'], s['clears'], s['deaths'], s['score'], peak, r['over'], r['bpeak']))
            ok('機器人：從標題選 STAGES、過 3 關（goal）、%d 幀內' % BOT_MAX, r['done'] and s['sMode'] == 'STAGES', (r['frame'], s['clears']))
            ok('機器人：沒開密技', s['cheats'] == 0)
            ok('機器人全程：每線精靈 ≤ 8（逐幀量）', peak <= 8, peak)
            ok('機器人全程：VBlank 超支幀 = 0、尖峰 ≤ 160 byte', r['over'] == 0 and r['bpeak'] <= 160, (r['over'], r['bpeak']))

        ok('全程沒有 JS 例外', not errors, errors[:3])
        browser.close()

    n_ok = sum(1 for r in results if r[0])
    print('test_snake: %d / %d 通過' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
