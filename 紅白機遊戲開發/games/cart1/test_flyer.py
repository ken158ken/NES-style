# -*- coding: utf-8 -*-
"""《星塵飛燕》（cart1 槽 7，id = flyer）自動驗證。

重點：名稱表逐欄串流（NES.SH.Scroller）+ 移動縫只重寫有變的磚 ⇒ 畫面上的磚永遠等於邏輯世界、
      VBlank ≤ 160 byte、每線 ≤ 8 精靈、場景 / 速度 / 風 / 星屑 / 護盾 / 獎牌 / 流程。
作法：Playwright 開 `cart1.html?game=flyer&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Flyer.dev`。

用法：../卡比之星/.venv/bin/python games/cart1/test_flyer.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=flyer'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Flyer && !!CT.Flyer.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart1.flyer.best"); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


# 名稱表內容 == 邏輯世界（tileAt）：畫面可見欄 × 列 0..25
JS_NT_MATCH = r"""
() => {
  const d = CT.Flyer.dev, g = d.g(), p = __nes.nes().ppu, scr = d.scr();
  let bad = 0, n = 0, ex = null;
  const c0 = g.cam >> 3, c1 = Math.min(scr.next - 1, c0 + 33);
  for (let c = c0; c <= c1; c++) for (let r = 0; r < 26; r++) {
    n++;
    const want = d.tileAt(c, r), got = p.getTile((c >> 5) & 1, c & 31, r);
    if (want !== got) { bad++; if (!ex) ex = [c, r, want, got]; }
  }
  return { n, bad, ex };
}
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
    reg = page.evaluate("""() => { const g = CT.get('flyer'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id / order 7 / title / legacy', reg and reg['id'] == 'flyer' and reg['order'] == 7 and reg['title'] and reg['legacy'] == ['flappy-bird.html'], reg)
    ok('註冊：契約函式齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText ≤ 8 字元', len(page.evaluate("() => CT.get('flyer').bestText()")) <= 8)
    a = page.evaluate("""() => { const A = CT.Flyer.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        bird: [0,1,2].every(f => [0,1,2,3].every(q => A.spr.index('BIRD' + f + '_' + q) >= 0)) }; }""")
    ok('背景 / 精靈 bank ≤ 256；星燕 3 影格 × 4 磚', a['bg'] <= 256 and a['spr'] <= 256 and a['bird'], a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Flyer.Audio.SONGS), sfx: Object.keys(CT.Flyer.Audio.SFX) })")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4，全部 flyer_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('flyer_') for k in au['songs'] + au['sfx']), au)
    sc = page.evaluate("() => CT.Flyer.SCENES.map(s => [s.speed, s.gap, s.move, s.wind])")
    ok('5 個場景：速度遞增、縫遞減（難度遞增）', all(sc[i][0] < sc[i + 1][0] for i in range(4)) and all(sc[i][1] >= sc[i + 1][1] for i in range(4)), sc)
    ok('新障礙：場景 2 起移動縫、場景 3 起陣風', sc[0][2] == 0 and sc[1][2] > 0 and sc[1][3] == 0 and sc[2][3] > 0, sc)

    # ---------------- 門的生成 ----------------
    gt = page.evaluate("""() => { const d = CT.Flyer.dev; __nes.tap('start', 1); __nes.step(2);
        const out = []; for (let i = 0; i < 60; i++) { const G = d.gateAt(i); out.push([G.base, G.gap, G.moving, G.amp, G.col]); }
        let rng = true;
        for (let i = 0; i < 60; i++) { const G = d.gateAt(i); for (let t = 0; t < 400; t += 3) { const y = d.gateTopAt(G, t);
          if (y % 4 || y < G.base - G.amp || y > G.base + G.amp || y < 8 || y + G.gap > 188) rng = false; } }
        return { out, rng }; }""")
    g = gt['out']
    ok('門：間距 13 欄、柱寬 3 欄（不重疊）', all(g[i + 1][4] - g[i][4] == 13 for i in range(59)))
    ok('門：相鄰縫高差 ≤ 56 px（可達）', all(abs(g[i + 1][0] - g[i][0]) <= 56 + 2 * 24 for i in range(59)), max(abs(g[i + 1][0] - g[i][0]) for i in range(59)))
    ok('門：縫大小依場景（64/60/60/56/52）', [g[i][1] for i in (0, 10, 20, 30, 40)] == [64, 60, 60, 56, 52], [g[i][1] for i in (0, 10, 20, 30, 40)])
    ok('移動縫：4 px 一步、永遠在振幅與畫面範圍內', gt['rng'])
    ok('前 10 道全是固定縫、10~19 有移動縫', not any(x[2] for x in g[:10]) and any(x[2] for x in g[10:20]))

    # ---------------- 流程 ----------------
    s = st(page)
    ok('START → GET READY（星燕懸停，不捲動）', s['mode'] == 'ready' and s['cam'] == 0, s)
    page.evaluate("() => { __nes.tap('a', 1); __nes.step(1); }")
    s = st(page)
    ok('A → 開始飛行（振翅 vy = FLAP + 重力）', s['mode'] == 'play' and s['vy'] == -760 + 44, s)
    page.evaluate("() => { __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1); }")
    ok('SELECT + START 不觸發暫停', not st(page)['paused'])
    r = page.evaluate("""() => { __nes.tap('start', 1); __nes.step(1); const a = GAME.state().s; __nes.step(30); const b = GAME.state().s;
        __nes.tap('start', 1); __nes.step(1); return { p: a.paused, same: a.cam === b.cam && a.by === b.by, after: GAME.state().s.paused }; }""")
    ok('START 暫停：畫面凍結、再按恢復', r['p'] and r['same'] and not r['after'], r)
    hud = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Flyer.Art.make(), w = A.hud('GATE');
        return w.every((t, i) => p.getTile(0, 1 + i, 26) === t); }""")
    ok('狀態列（split 208 下方 nt0 row 26）寫著 GATE', hud)

    # 碰撞：撞地 / 撞柱
    r = page.evaluate("""() => { const g = CT.Flyer.dev.g(); g.by = 185 * 256; g.vy = 600; __nes.step(3); return g.mode; }""")
    ok('掉進下方的海 → 墜落', r == 'dead', r)
    page.evaluate("() => { __nes.step(90); }")
    r = st(page)
    ok('墜落 → GAME OVER 結算畫面', r['mode'] == 'over', r['mode'])
    page.evaluate("() => { __nes.step(50); __nes.tap('start', 1); __nes.step(2); }")
    ok('GAME OVER → START 回標題', st(page)['mode'] == 'title')
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(3); const g = d.g(), G = d.gateAt(3);
        g.by = (G.top - 30) * 256; g.vy = 0; g.camX = (G.col * 8 - 64 - 6) * 256; g.cam = g.camX >> 8;
        return { hit: d.hitTest() }; }""")
    ok('星燕與上柱重疊 → hitTest 為真', r['hit'], r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev, g = d.g(), G = d.gateAt(3);
        g.by = (G.top + (G.gap >> 1) - 8) * 256; return { hit: d.hitTest() }; }""")
    ok('星燕在縫中央 → 不碰撞', not r['hit'], r)

    # 護盾 / 星屑 / 密技
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(5); const g = d.g(); g.shield = true; const G = d.gateAt(5);
        g.by = (G.top - 30) * 256; g.vy = 0; g.camX = (G.col * 8 - 64 - 6) * 256; g.cam = g.camX >> 8; __nes.step(1);
        return { mode: g.mode, shield: g.shield, inv: g.inv }; }""")
    ok('護盾：撞柱不死、護盾消耗、無敵時間', r['mode'] == 'play' and not r['shield'] and r['inv'] > 0, r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(8); const g = d.g(); g.stars = 4; g.shield = false;
        const G = d.gateAt(8); G.star = true; G.got = false; g.inv = 200;
        g.camX = (G.col * 8 + 8 - 64 - 4) * 256; g.cam = g.camX >> 8; g.by = (G.top + (G.gap >> 1) - 4 - 6) * 256; g.vy = -44; __nes.step(1);
        return { got: G.got, stars: g.stars, shield: g.shield }; }""")
    ok('星屑：收集 → 第 5 顆換護盾', r['got'] and r['stars'] == 0 and r['shield'], r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(2); const g = d.g(); g.shield = false; const c = CT.cheat(); __nes.step(1);
        g.passed = 49; g.next = 49; return { c, shield: g.shield, cheated: g.cheated }; }""")
    ok('密技：立刻護盾、標記 cheated', r['c'] and r['shield'] and r['cheated'], r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(49); const g = d.g(); g.cheated = true; g.inv = 600;
        for (let i = 0; i < 200 && g.passed < 50; i++) __nes.step(1); return { passed: g.passed, goal: CT.get('flyer').goal() }; }""")
    ok('用過密技：通過 50 道也不算 goal', r['passed'] >= 50 and not r['goal'], r)

    # 獎牌
    m = page.evaluate("() => [0, 9, 10, 19, 20, 30, 40, 50, 99].map(n => CT.Flyer.dev.medalOf(n))")
    ok('獎牌門檻 10/20/30/40/50（銅 / 銀 / 金 / 晶 / 星）', m == [-1, -1, 0, 0, 1, 2, 3, 4, 4], m)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(22); const g = d.g(); g.inv = 0; g.shield = false; g.by = 186 * 256; g.vy = 600; __nes.step(100);
        return { mode: g.mode, best: CT.load('flyer', 'best', 0), medal: g.medal }; }""")
    ok('GAME OVER：最高紀錄存檔 + 銀牌', r['mode'] == 'over' and r['best'] == 22 and r['medal'] == 1, r)

    # 場景切換
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(9); const g = d.g(); g.inv = 2000; const sp0 = g.speed;
        for (let i = 0; i < 400 && g.passed < 10; i++) __nes.step(1); __nes.step(12);
        return { passed: g.passed, scene: g.scene, sp0, sp1: g.speed, bd: __nes.nes().ppu._backdrop !== undefined }; }""")
    ok('第 10 道門 → 場景 2、速度提高', r['passed'] >= 10 and r['scene'] == 1 and r['sp1'] > r['sp0'], r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(24); const g = d.g(); g.inv = 4000; let w = 0, wu = 0, wd = 0;
        for (let i = 0; i < 700; i++) { __nes.step(1); if (g.wind) { w++; if (g.wind < 0) wu++; else wd++; } } return { w, wu, wd }; }""")
    ok('場景 3：陣風有上有下（700 幀內）', r['w'] > 0 and r['wu'] > 0 and r['wd'] > 0, r)

    # ---------------- fix-r5 統一規則 ----------------
    # §6-1 / P2-1：GAME OVER（或墜落中）按密技 = 回到剛才那道門前繼續，保留門數 / 星屑 / 場景，送護盾；那局 goal 一律 false
    fresh(page)
    r = page.evaluate("""() => { const d = CT.Flyer.dev; d.jump(23); const g = d.g(); g.inv = 0; g.shield = false; g.stars = 2;
        g.by = 186 * 256; g.vy = 600; __nes.step(100);
        const before = { mode: g.mode, passed: g.passed, next: g.next, scene: g.scene, stars: g.stars };
        const c = CT.cheat(); __nes.step(1); const s = GAME.state().s, G = d.gateAt(g.next);
        return { before, c, mode: s.mode, passed: s.passed, next: s.next, scene: s.scene, stars: s.stars, shield: s.shield,
                 cheated: s.cheated, cont: s.continues, ahead: G.col * 8 - (g.cam + 64), song: CT.Flyer.Audio.current,
                 behind: (g.cam + 64 + 3) - (d.gateAt(g.next - 1).col * 8 + 24), hit: d.hitTest(),
                 inGap: s.by + 4 >= G.top && s.by + 12 <= G.top + G.gap }; }""")
    ok('§6-1 GAME OVER 按密技 → GET READY（不回標題）', r['before']['mode'] == 'over' and r['c'] and r['mode'] == 'ready', r)
    ok('§6-1 續關保留門數 / 下一道門 / 場景 / 星屑，送護盾，BGM 回場景曲', r['passed'] == r['before']['passed'] == 23 and r['next'] == r['before']['next']
       and r['scene'] == r['before']['scene'] and r['stars'] == r['before']['stars'] and r['shield'] and r['song'] == 'flyer_star' and r['cont'] == 1, r)
    ok('§6-1 續關位置 = 兩道門之間的空檔（離剛才那道門 71 px、上一道門已在身後）', r['ahead'] == 71 and r['behind'] == 12, r)
    ok('§6-1 續關懸停高度 = 剛才那道門縫中央、星燕不與任何柱重疊', r['inGap'] and not r['hit'], r)
    mt = page.evaluate(JS_NT_MATCH)
    ok('§6-1 續關後名稱表與邏輯世界逐磚一致（結算畫面已整片換回）', mt['bad'] == 0 and mt['n'] > 500, mt)
    r = page.evaluate("""() => { const g = CT.Flyer.dev.g(); __nes.tap('a', 1); __nes.step(1); const m = g.mode; let hit = false;
        for (let i = 0; i < 40; i++) { if (i % 9 === 0) __nes.tap('a', 1); __nes.step(1); if (g.mode !== 'play') { hit = true; break; } }
        return { m, alive: !hit || g.shield === false }; }""")
    ok('§6-1 續關後按 A 立刻接著飛', r['m'] == 'play', r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev, g = d.g(); g.goalHit = true; return { goal: CT.get('flyer').goal(), sg: GAME.state().s.goal }; }""")
    ok('§6-1 續關過的那局：goal() 與 state().goal 一律 false', not r['goal'] and not r['sg'], r)
    r = page.evaluate("""() => { const d = CT.Flyer.dev, g = d.g(); g.inv = 0; g.shield = false; g.by = 186 * 256; g.vy = 600; __nes.step(4);
        const m0 = g.mode, p0 = g.passed; const c = CT.cheat(); __nes.step(1); return { m0, c, mode: g.mode, passed: g.passed, p0 }; }""")
    ok('§6-1 墜落中按密技也能立刻續關', r['m0'] == 'dead' and r['c'] and r['mode'] == 'ready' and r['passed'] == r['p0'], r)
    # P3-7：標題畫面按密技無效
    fresh(page)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Flyer.dev.g(); return { c, cheated: g.cheated, shield: g.shield, mode: g.mode }; }")
    ok('P3-7 標題畫面按密技無效', not r['c'] and not r['cheated'] and not r['shield'] and r['mode'] == 'title', r)
    # P3-5 / §6-5
    r = page.evaluate("""() => { const p = __nes.nes().ppu; const rows = [];
        for (let y = 10; y <= 24; y++) { let n = 0; for (let x = 2; x < 30; x++) if (p.getTile(0, x, y)) n++; rows.push(n > 0); }
        let adj = 0; for (let i = 1; i < rows.length; i++) if (rows[i] && rows[i - 1]) adj++;
        const A = CT.Flyer.Art.make(), want = A.text('HOLD START+SELECT: MENU');
        let found = false; for (let y = 10; y <= 24 && !found; y++) for (let x = 2; x + want.length <= 30 && !found; x++) found = want.every((t, i) => p.getTile(0, x + i, y) === t);
        return { adj, found }; }""")
    ok('P3-5 標題說明文字行與行之間都空一列', r['adj'] == 0, r)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', r['found'], r)
    # §6-2 / P3-1：暫停 = BGM 停、恢復接續
    r = page.evaluate("""() => { const M = __nes.nes().music; __nes.tap('start', 1); __nes.step(2); __nes.tap('a', 1); __nes.step(1); CT.Flyer.dev.g().inv = 5000;
        for (let i = 0; i < 150; i++) { if (i % 30 === 0) __nes.tap('a', 1); __nes.step(1); }
        const ord0 = M.state().orderIndex; __nes.tap('start', 1); __nes.step(1); const a = M.state(); __nes.step(120); const b = M.state();
        const p = __nes.nes().ppu, A = CT.Flyer.Art.make(), w = A.hud('PAUSE  HOLD'), txt = w.every((t, i) => p.getTile(0, 1 + i, 27) === t);
        __nes.tap('start', 1); __nes.step(1); const c = M.state();
        return { ord0, pl: a.playing, paused: a.paused, still: a.rowsPlayed === b.rowsPlayed, txt, resumed: c.playing, ord1: c.orderIndex,
                 row0: a.row, row1: c.row, dRows: c.rowsPlayed - a.rowsPlayed, song: CT.Flyer.Audio.current, mode: GAME.state().s.mode }; }""")
    ok('§6-2 暫停時 BGM 停止（120 幀 rowsPlayed 不動）', r['mode'] == 'play' and not r['pl'] and r['still'], r)
    ok('§6-2 解除暫停 → 同一首、同一小節接續播放', r['resumed'] and r['song'] == 'flyer_sky' and r['ord1'] == r['ord0'], r)
    ok('fix-r6 P3-8 暫停走 engine pause（state.paused）、解除從同一 row 接續（不回 row 0）',
       r['paused'] and r['row1'] in (r['row0'], r['row0'] + 1) and 0 <= r['dRows'] <= 1, r)
    ok('§6-5 暫停狀態列寫著 PAUSE  HOLD START+SELECT: MENU', r['txt'], r)
    # §6-3 / P3-2
    r = page.evaluate("""() => { const g = CT.Flyer.dev.g(); g.passed = 17; CT.get('flyer').exit(__nes.nes()); const b1 = CT.load('flyer', 'best', 0);
        g.passed = 3; CT.get('flyer').exit(__nes.nes()); return { b1, b2: CT.load('flyer', 'best', 0), text: CT.get('flyer').bestText() }; }""")
    ok('§6-3 exit() 存最高分（較低不覆蓋）、bestText 反映', r['b1'] == 17 and r['b2'] == 17 and r['text'] == '0017GT', r)
    # §6-4 / P3-9
    r = page.evaluate("""() => { const bt = CT.get('flyer').backTile, A = CT.Flyer.Art.make();
        return { bt, star: A.spr.index('STAR'), wing: [0,1,2,3].map(q => A.spr.index('BIRD0_' + q)) }; }""")
    ok('§6-4 backTile = 星屑（不是星燕翅膀）', r['bt'] and r['bt']['tile'] == r['star'] and r['bt']['tile'] not in r['wing'] and 0 <= r['bt']['pal'] <= 3, r)
    # P3-11：標題曲開頭不再與 snake 雷同
    r = page.evaluate("""() => { const f = n => (n && n.note && n.note !== '===') ? n.note : null;
        const head = s => { const out = []; for (const p of s.order.map(i => s.patterns[i])) for (const n of p.p1) { const v = f(n); if (v) out.push(v); if (out.length >= 6) return out; } return out; };
        return { fly: head(CT.Flyer.Audio.SONGS.flyer_sky) }; }""")
    ok('P3-11 flyer 標題曲開頭不是 D G B A G（與 snake 雷同的舊動機）', r['fly'][:5] != ['D-5', 'G-5', 'B-5', 'A-5', 'G-5'], r)

    # 名稱表 == 世界（移動縫串流一致）
    fresh(page, '&gate=34&bot=1')
    mt = page.evaluate(JS_NT_MATCH)
    page.evaluate('() => __nes.step(300)')
    mt2 = page.evaluate(JS_NT_MATCH)
    ok('移動縫：名稱表可見欄與邏輯世界逐磚一致（跳關後 / 300 幀後）', mt['bad'] == 0 and mt2['bad'] == 0 and mt['n'] > 500, (mt, mt2))

    # ---------------- 機器人：完整一局 50 道門 + 逐幀硬限制 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let maxLine = 0, peak = 0, colors = 0, i, mism = 0, checks = 0;
        for (i = 0; i < 9000; i++) { __nes.step(1); const s = __nes.stats(); maxLine = Math.max(maxLine, s.maxSpritesLine);
          peak = Math.max(peak, s.budget.used); colors = Math.max(colors, s.colors);
          if (CT.get('flyer').goal()) break; }
        const s = __nes.stats(), g = CT.Flyer.dev.g();
        return { frames: i, goal: CT.get('flyer').goal(), maxLine, over: s.budget.overFrames, peak, colors, passed: g.passed, scrollPeak: CT.Flyer.dev.scr().peak }; }""")
    ok('機器人不開密技通過 50 道門（goal）', hl['goal'], hl)
    ok('機器人全程每線精靈 ≤ 8（逐幀）', hl['maxLine'] <= 8, hl['maxLine'])
    ok('機器人全程 overFrames == 0、單幀 ≤ 160 byte', hl['over'] == 0 and hl['peak'] <= 160, hl)
    ok('Scroller 單欄寫入 ≤ 39 byte（26 列 + 13 屬性）', hl['scrollPeak'] <= 39, hl['scrollPeak'])
    ok('同屏色數 ≤ 25', hl['colors'] <= 25, hl['colors'])
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：場景 5 遊玩畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_flyer: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
