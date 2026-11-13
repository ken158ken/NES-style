# -*- coding: utf-8 -*-
"""《星塵泡泡》（cart2 槽 6，id = pop）自動驗證。

重點：三模式（戳泡泡 / 氣球射擊 / 敲噗噗芽）、游標規格（R6 §1-4）、只認 A 按下邊緣、
      泡泡牆走背景磚 + 垂直捲動（名稱表 == 邏輯格子、VBlank 寫入佇列 ≤ 160）、氣球同速生成規則（任一 24 px 帶 ≤ 3 顆）、
      坑裡生物走背景磚；機器人：敲噗噗芽 goal（≥ 8000 分）+ 泡泡 / 氣球長跑，全程逐幀量每線 ≤ 8 / overFrames 0；
      R6 §6 統一規則（密技續關 / 標題無效 / 暫停 BGM / exit 存分 / backTile / 說明空列 / HOLD START+SELECT）。
作法：Playwright 開 `cart2.html?game=pop&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Pop.dev`。

用法：../卡比之星/.venv/bin/python games/cart2/test_pop.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart2.html').as_uri() + '?debug=1&scale=1&mute=1&game=pop'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Pop && !!CT.Pop.dev')
    page.evaluate('() => { ["best","best_bubble","best_balloon","best_burrow"].forEach(k => localStorage.removeItem("nes.cart2.pop." + k)); __nes.step(1); }')


def start(page, idx):
    """標題選第 idx 個模式（0 泡泡 / 1 氣球 / 2 敲）後開局。"""
    page.evaluate("""(idx) => { const g = CT.Pop.dev.g(); while (g.sel !== idx) { __nes.tap('down', 1); __nes.step(1); } __nes.tap('start', 1); __nes.step(2); }""", idx)


RUN = r"""
(o) => { let ml = 0, pk = 0, i, band = 0, maxBal = 0;
  for (i = 0; i < o.n; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); pk = Math.max(pk, s.budget.peak);
    const g = CT.Pop.dev.g();
    if (g.sub === 'balloon' && g.mode === 'play') {      // 任一 24 px 帶（氣球 16 + 繩 8）最多 3 顆
      const ys = g.bals.map(b => b.y >> 8); maxBal = Math.max(maxBal, ys.length);
      for (const y0 of ys) { let n = 0; for (const y of ys) if (y >= y0 && y < y0 + 24) n++; if (n > 3) band++; }
    }
    if (o.stop === 'goal' && GAME.state().goal) break;
    if (o.stop === 'over' && GAME.state().s.mode === 'over') break; }
  return { frames: i, maxLine: ml, peak: pk, over: __nes.stats().budget.overFrames, band, maxBal, s: GAME.state().s }; }
"""

# 泡泡：可見列的名稱表 == 邏輯格子（佇列清空後）
NT_JS = r"""
() => { const d = CT.Pop.dev, g = d.g(), p = __nes.nes().ppu, A = CT.Pop.Art.make(); let bad = 0, n = 0, ex = null;
  for (let k = Math.max(g.esc, g.made - 13); k < g.made; k++) for (let cc = 1; cc <= 14; cc++) {
    const v = d.cell(k, cc), r = (k % 15) * 2, c = cc * 2;
    if (g.anims.some(a => a.k === k && a.cc === cc)) continue;
    const pre = v ? (v.t === 'i' ? 'IBU' : (v.t === 's' ? 'SBU' : 'BUB')) : null;
    for (let q = 0; q < 4; q++) { n++; const want = pre ? A.t(pre + q) : 0, got = p.getTile(0, c + (q & 1), r + (q >> 1)); if (want !== got) { bad++; if (!ex) ex = [k, cc, q, want, got]; } }
    if (v) { n++; if (p.getAttr(0, cc, k % 15) !== v.c) { bad++; if (!ex) ex = ['attr', k, cc]; } }
  }
  return { n, bad, ex, q: g.wq.length }; }
"""

TEXT_JS = r"""
(want) => { const p = __nes.nes().ppu, A = CT.Pop.Art.make(), rows = [];
  for (let y = 13; y <= 27; y++) { let n = 0; for (let x = 1; x < 31; x++) { const t = p.getTile(0, x, y); if (t && t !== A.t('BLK')) n++; } rows.push(n > 0); }
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
    reg = page.evaluate("""() => { const g = CT.get('pop'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
    ok('註冊：id pop / order 6 / title / legacy 三款舊作', reg and reg['id'] == 'pop' and reg['order'] == 6 and reg['title']
       and reg['legacy'] == ['bubble-pop.html', 'balloon-pop-challenge.html', 'whack-a-mole.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    bt = page.evaluate("() => CT.get('pop').bestText()")
    ok('bestText 右對齊 6 字元（純分數 000000）', bt == '000000', repr(bt))
    a = page.evaluate("""() => { const A = CT.Pop.Art.make(); return { bg: A.bg.tiles.length, spr: A.spr.tiles.length,
        cr: CT.Pop.Art.CREATURES, all: CT.Pop.Art.CREATURES.every(n => [1,2,3,4].every(l => [0,1,2,3].every(q => A.bg.index(n + '_' + l + '_' + q) >= 0))) }; }""")
    ok('背景 / 精靈 bank ≤ 256；噗噗芽 5 種 × 4 姿態 × 4 磚（背景磚）', a['bg'] <= 256 and a['spr'] <= 256 and a['all'] and len(a['cr']) == 5, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Pop.Audio.SONGS), sfx: Object.keys(CT.Pop.Audio.SFX) })")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4，全部 pop_ 前綴', len(au['songs']) >= 3 and len(au['sfx']) >= 4 and all(k.startswith('pop_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 標題 ----------------
    r = page.evaluate(TEXT_JS, ['HOLD START+SELECT: MENU', 'BUBBLE RISE', 'BALLOON SHOT', 'BURROW BOP'])
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU、三個模式都列出', all(r['found']), r)
    ok('P3-5 標題說明文字行與行之間都空一列', r['adj'] == 0, r)
    r = page.evaluate("() => { __nes.step(63); const p = __nes.nes().ppu, A = CT.Pop.Art.make(), w = A.text('C/* = CHEAT'); let f = false; for (let x = 0; x < 20; x++) if (w.every((t, i) => p.getTile(0, x + i, 25) === t)) f = true; return f; }")
    ok('§6-6 標題寫 C/★ = CHEAT', r)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(), p = __nes.nes().ppu, A = CT.Pop.Art.make(), has = (s, x) => A.text(s).every((t, i) => p.getTile(0, x + i, 25) === t);
        const out = []; for (let i = 0; i < 4; i++) { while ((g.t & 63) !== (i & 1 ? 40 : 8)) __nes.step(1); out.push({ go: has('START GO', 3), cheat: has('C/* = CHEAT', 13) }); } return out; }""")
    ok('fix-r6 P3-5 標題只閃 START GO，C/★ = CHEAT 一直顯示', all(x['cheat'] for x in r) and [x['go'] for x in r] == [True, False, True, False], r)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(2); const g = CT.Pop.dev.g(); return { c, cheated: g.cheated, mode: g.mode, sel: g.sel }; }")
    ok('P3-7 標題畫面按密技無效（預設選 BURROW BOP）', not r['c'] and not r['cheated'] and r['mode'] == 'title' and r['sel'] == 2, r)

    # ---------------- 敲噗噗芽 ----------------
    start(page, 2)
    dirs = [['up', 'left'], ['up'], ['up', 'right'], ['left'], [], ['right'], ['down', 'left'], ['down'], ['down', 'right']]
    sel = []
    for d in dirs:
        sel.append(page.evaluate("(d) => { if (d.length) __nes.press(d, 1); else __nes.step(1); return CT.Pop.dev.g().selPod; }", d))
    page.evaluate('() => __nes.release()')
    ok('3×3：十字鍵 8 方向 + 不按 = 中央，共 9 個位置', sel == list(range(9)), sel)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); g.spawnK = 9999; g.pods.forEach(p => { p.type = null; p.lvl = 0; p.drawn = ''; });
        d.spawn(4, 'BLIP'); __nes.step(12); const s0 = g.score; __nes.tap('a', 1); __nes.step(1); const p = g.pods[4];
        const A = CT.Pop.Art.make(), G = d.podGeo(4), pp = __nes.nes().ppu;
        __nes.step(1); const tile = pp.getTile(0, G.c0 + 1, G.r0), attr = pp.getAttr(0, (G.c0 + 1) >> 1, G.r0 >> 1);
        return { d: g.score - s0, ph: p.ph, combo: g.combo, tile, want: A.t('BLIP_4_0'), attr }; }""")
    ok('敲中 BLIP（中央坑）→ +100、被敲暈', r['d'] == 100 and r['ph'] == 'hit' and r['combo'] == 1, r)
    ok('坑裡的生物是背景磚（名稱表 = 暈眼圖、屬性 = 綠組 1）', r['tile'] == r['want'] and r['attr'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); __nes.step(40); d.spawn(4, 'THORN'); __nes.step(12); g.score = 1000; const s0 = g.score;
        __nes.tap('a', 1); __nes.step(1); const r1 = { d: g.score - s0, stun: g.stun, ph: g.pods[4].ph, combo: g.combo };
        d.spawn(1, 'BLIP'); __nes.step(12); const s1 = g.score; __nes.press(['up', 'a'], 1); __nes.release(); __nes.step(1);
        return Object.assign(r1, { blocked: g.score === s1 && g.pods[1].ph !== 'hit' }); }""")
    ok('敲到紅刺 THORN → −200、槌子暈 45 幀、連擊歸零', r['d'] == -200 and r['stun'] >= 40 and r['ph'] == 'laugh' and r['combo'] == 0, r)
    ok('暈眩中按 A 敲不下去', r['blocked'], r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); g.stun = 0; __nes.step(60); const p = g.pods[7]; d.spawn(7, 'FAKER'); p.ph = 'peek';
        __nes.step(6); const lvl = p.lvl, w0 = g.whiffs; __nes.press(['down', 'a'], 1); __nes.release(); __nes.step(1);
        const whiff = g.whiffs - w0; let up = false; for (let i = 0; i < 60; i++) { __nes.step(1); if (p.lvl === 3) { up = true; break; } }
        return { lvl, whiff, up }; }""")
    ok('FAKER 假動作：探頭時敲 = 揮空，之後才真的冒出來', r['lvl'] == 1 and r['whiff'] == 1 and r['up'], r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); g.stun = 0; g.pods.forEach(p => { p.type = null; p.lvl = 0; }); d.spawn(0, 'SPITTER');
        let spat = false; for (let i = 0; i < 80; i++) { __nes.step(1); if (g.spore) { spat = true; break; } }
        const tgt = g.spore && g.spore.target; for (let i = 0; i < 40; i++) __nes.step(1);
        return { spat, tgt, stun: g.stun > 0 }; }""")
    ok('SPITTER 反擊：太久沒敲 → 朝槌子所在的坑吐孢子 → 命中暈眩', r['spat'] and r['tgt'] == 4 and r['stun'], r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); g.stun = 0; g.combo = 0; let n = 0;
        d.spawn(4, 'BLIP'); __nes.step(12); __nes.press('a', 30); __nes.release(); n = g.hitsN;
        return { combo: g.combo, mal: g.mal }; }""")
    ok('按住 A 30 幀只算一次敲（只認按下邊緣）', r['combo'] == 1, r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); g.combo = 9; g.stun = 0; __nes.step(30); d.spawn(4, 'GOLDY'); __nes.step(12); const s0 = g.score;
        __nes.tap('a', 1); __nes.step(1); return { d: g.score - s0, combo: g.combo }; }""")
    ok('連擊 10 = FEVER：分數 ×2（GOLDY 300 → 600）', r['d'] == 600 and r['combo'] == 10, r)
    r = page.evaluate("() => CT.Pop.dev.g().pods.map((p, i) => CT.Pop.dev.podGeo(i)).map(G => [G.c0 + 1, G.r0])")
    ok('坑裡生物對齊 16×16 屬性（欄列皆偶數）', all(c % 2 == 0 and rr % 2 == 0 for c, rr in r), r)

    # 暫停（§6-2）
    r = page.evaluate("""() => { const M = __nes.nes().music; __nes.press('select', 1); __nes.press(['select','start'], 2); __nes.release(); __nes.step(1);
        const p0 = GAME.state().s.paused; __nes.tap('start', 1); __nes.step(1); const g = CT.Pop.dev.g(), t0 = g.timer; const a = M.state(); __nes.step(120); const b = M.state();
        const p = __nes.nes().ppu, A = CT.Pop.Art.make(), w = A.text('PAUSE  HOLD START+SELECT: MENU'), txt = w.every((t, i) => p.getTile(0, 1 + i, 2) === t), fz = g.timer === t0;
        __nes.tap('start', 1); __nes.step(1); const c = M.state();
        return { p0, pl: a.playing, still: a.rowsPlayed === b.rowsPlayed, fz, txt, resumed: c.playing, song: CT.Pop.Audio.current }; }""")
    ok('SELECT + START 不觸發暫停', not r['p0'], r)
    ok('§6-2 暫停：BGM 停、計時凍結；解除後同一首接續', not r['pl'] and r['still'] and r['fz'] and r['resumed'] and r['song'] == 'pop_rush', r)
    ok('§6-5 暫停列寫著 PAUSE  HOLD START+SELECT: MENU', r['txt'], r)

    # 時間到 → 結算 → 密技續關
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); g.score = 4321; g.timer = 2; __nes.step(3); const m0 = g.mode;
        const c = CT.cheat(); __nes.step(1); return { m0, c, mode: g.mode, sub: g.sub, score: g.score, timer: g.timer, cheated: g.cheated }; }""")
    ok('§6-1 時間到按密技 → 原地續關（同模式、分數保留、+20 秒）', r['m0'] == 'over' and r['c'] and r['mode'] == 'play' and r['sub'] == 'burrow'
       and r['score'] == 4321 and r['timer'] >= 1190, r)
    r = page.evaluate("() => { const g = CT.Pop.dev.g(); g.score = 9999; g.goalHit = true; return { goal: CT.get('pop').goal(), sg: GAME.state().goal }; }")
    ok('§6-1 用過密技那一局：≥ 8000 也不算 goal', not r['goal'] and not r['sg'], r)
    r = page.evaluate("""() => { localStorage.removeItem('nes.cart2.pop.best'); const g = CT.Pop.dev.g(); g.score = 5555; CT.get('pop').exit(__nes.nes()); const b1 = CT.load('pop', 'best', 0);
        g.score = 10; CT.get('pop').exit(__nes.nes()); return { b1, b2: CT.load('pop', 'best', 0), text: CT.get('pop').bestText() }; }""")
    ok('§6-3 exit() 存最高分（較低不覆蓋）、bestText 005555', r['b1'] == 5555 and r['b2'] == 5555 and r['text'] == '005555', r)
    r = page.evaluate("() => { const bt = CT.get('pop').backTile, A = CT.Pop.Art.make(); return { bt, solid: A.spr.index('SOLID') }; }")
    ok('§6-4 backTile = 實心方塊（自己的精靈表）', r['bt'] and r['bt']['tile'] == r['solid'], r)

    # ---------------- 游標規格（§1-4）----------------
    fresh(page)
    start(page, 0)
    r = page.evaluate("""() => { const c = CT.Pop.dev.g().cur; c.x = 60; c.y = 100; const out = [];
        for (let i = 0; i < 12; i++) { const x = c.x; __nes.press('right', 1); out.push(c.x - x); } __nes.release(); __nes.step(1);
        const x0 = c.x; __nes.press(['right', 'b'], 20); __nes.release(); return { steps: out, fine: c.x - x0 }; }""")
    ok('游標：按住前 8 幀 1 px/幀、之後 3 px/幀', r['steps'] == [1] * 8 + [3] * 4, r)
    ok('游標：B 按住 = 精細 1 px/幀', r['fine'] == 20, r)

    # ---------------- 戳泡泡 ----------------
    r = page.evaluate(NT_JS)
    ok('泡泡：開局名稱表 == 邏輯格子（含屬性色）', r['bad'] == 0 and r['n'] > 300, r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); __nes.step(10); const k = g.made - 6, R = g.grid[k % 15];
        for (let c = 1; c <= 14; c++) R[c] = null; [3, 4, 5].forEach(c => R[c] = { c: 2, t: 'n' }); R[6] = { c: 1, t: 'n' };
        const R2 = g.grid[(k + 1) % 15]; for (let c = 1; c <= 14; c++) R2[c] = null; R2[4] = { c: 2, t: 'n' }; R2[5] = { c: 2, t: 'i' };
        const sy = k * 16 - g.S; g.cur.x = 3 * 16 + 8; g.cur.y = sy + 8; const s0 = g.score;
        __nes.tap('a', 1); __nes.step(1);
        return { left: [3, 4, 5, 6].map(c => !!R[c]), below: [!!R2[4], !!R2[5]], d: g.score - s0, chain: g.cchain }; }""")
    ok('泡泡：戳一顆 → 相連同色（4 顆）一起破、異色與冰殼不連', r['left'] == [False, False, False, True] and r['below'] == [False, True] and r['d'] == 160, r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); const k = g.made - 5, R = g.grid[k % 15]; for (let c = 1; c <= 14; c++) R[c] = null;
        R[8] = { c: 2, t: 'n' }; R[10] = { c: 3, t: 'i' }; g.cur.x = 8 * 16 + 8; g.cur.y = k * 16 - g.S + 8; __nes.step(8); g.cur.y = k * 16 - g.S + 8;
        __nes.tap('a', 1); __nes.step(1); const chain = g.cchain;
        g.cur.x = 10 * 16 + 8; g.cur.y = k * 16 - g.S + 8; __nes.step(8); g.cur.y = k * 16 - g.S + 8; __nes.tap('a', 1); __nes.step(1); const ice1 = R[10] && R[10].t;
        __nes.step(8); g.cur.y = k * 16 - g.S + 8; __nes.tap('a', 1); __nes.step(1); return { chain, ice1, ice2: !!R[10] }; }""")
    ok('泡泡：連續戳同一色 → 色彩連鎖 ×2', r['chain'] == 2, r)
    ok('泡泡：冰殼要戳兩次（第一下變普通泡泡）', r['ice1'] == 'n' and not r['ice2'], r)
    r = page.evaluate("""() => { const d = CT.Pop.dev, g = d.g(); const k = g.made - 5; [k - 1, k, k + 1].forEach(kk => { const R = g.grid[kk % 15]; for (let c = 1; c <= 14; c++) R[c] = null; for (let c = 4; c <= 8; c++) R[c] = { c: 1 + (c % 3), t: 'n' }; });
        g.grid[k % 15][6] = { c: 1, t: 's' }; g.cur.x = 6 * 16 + 8; __nes.step(8); g.cur.y = k * 16 - g.S + 8; __nes.tap('a', 1); __nes.step(1);
        let n = 0; [k - 1, k, k + 1].forEach(kk => { for (let c = 4; c <= 8; c++) if (g.grid[kk % 15][c]) n++; });
        __nes.step(40); const p = __nes.nes().ppu; let blank = 0, nz = 0;
        [k - 1, k, k + 1].forEach(kk => { for (let c = 5; c <= 7; c++) for (let q = 0; q < 4; q++) { if (p.getTile(0, c * 2 + (q & 1), (kk % 15) * 2 + (q >> 1)) === 0) blank++; else nz++; } });
        return { left: n, blank, nz }; }""")
    ok('泡泡：星泡炸開周圍 3×3（15 顆剩 6 顆）', r['left'] == 6, r)
    ok('泡泡：破裂動畫（破片 → 清空）經寫入佇列跑完，3×3 的 36 格磚都清空', r['blank'] == 36 and r['nz'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); const p0 = g.pressure; const R = g.grid[g.esc % 15]; for (let c = 1; c <= 14; c++) R[c] = { c: 1, t: 'n' };
        for (let i = 0; i < 200 && g.pressure === p0; i++) __nes.step(1); return { d: g.pressure - p0 }; }""")
    ok('泡泡：一整列漂出頂端 → 壓力 +14', r['d'] == 14, r)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); g.pressure = 19; const R = g.grid[g.esc % 15]; R[3] = { c: 1, t: 'n' };
        for (let i = 0; i < 200 && g.mode === 'play'; i++) __nes.step(1); const m0 = g.mode; const lv = g.lv; CT.cheat(); __nes.step(1);
        return { m0, mode: g.mode, p: g.pressure, lv: g.lv, lv0: lv }; }""")
    ok('泡泡：壓力滿 20 → GAME OVER；密技原地續關（同等級、壓力歸零）', r['m0'] == 'over' and r['mode'] == 'play' and r['p'] == 0 and r['lv'] == r['lv0'], r)

    # ---------------- 氣球射擊 ----------------
    fresh(page)
    start(page, 1)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); g.bals = [{ x: 100, y: 120 * 256, type: 'black', pat: 0, ph: 0, popT: 0 }]; g.cur.x = 108; g.cur.y = 128;
        const t0 = g.timer; __nes.tap('a', 1); __nes.step(1); const b = { dt: t0 - g.timer, pops: g.pops };
        __nes.step(20); g.bals = [{ x: 100, y: 120 * 256, type: 'red', pat: 0, ph: 0, popT: 0 }]; g.cur.y = 127; const s0 = g.score; __nes.tap('a', 1); __nes.step(1);
        return Object.assign(b, { d: g.score - s0, pops2: g.pops, popT: g.bals[0] && g.bals[0].popT }); }""")
    ok('氣球：打到黑氣球 → −5 秒、不算配額', r['dt'] >= 300 and r['pops'] == 0, r)
    ok('氣球：打到紅氣球 → 爆開、+10、配額 +1', r['d'] == 10 and r['pops2'] == 1 and r['popT'] > 0, r)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); g.pops = g.quota; g.timer = 1; __nes.step(2); const s1 = g.stage;
        g.pops = 0; g.timer = 1; __nes.step(2); return { s1, mode: g.mode }; }""")
    ok('氣球：時間到達成配額 → 下一關；沒達成 → GAME OVER', r['s1'] == 2 and r['mode'] == 'over', r)
    r = page.evaluate("() => { const g = CT.Pop.dev.g(); g.mode = 'play'; return [1, 2, 4, 6].map(n => { CT.Pop.dev.initBalloon(n); return g.quota; }); }")
    ok('fix-r6 氣球配額 = 16 + 3 × 關數（1 → 19、4 → 28）', r == [19, 22, 28, 34], r)
    r = page.evaluate("""() => { const g = CT.Pop.dev.g(); CT.Pop.dev.initBalloon(1); __nes.step(4);
        const p = __nes.nes().ppu, A = CT.Pop.Art.make(), BG = CT.Pop.Art.BG, sil = CT.Pop.Art.SIL;
        let silOk = true; for (let r = 0; r < 6; r++) for (let c = 0; c < 32; c++) if (p.getTile(0, c, 24 + r) !== A.t(sil[r][c])) silOk = false;
        g.bals = []; g.spawnT = 999; __nes.step(1); const y0 = g.bals.length ? g.bals[0].y >> 8 : -1;
        return { bd: p.backdrop, grass: 'GRASS' in BG || 'CL_L' in BG, silOk, y0 }; }""")
    ok('fix-r6 P3-4 氣球關：黃昏星港（無草叢 / 白雲磚、底部 6 列是城牆剪影、氣球從畫面下緣外 y=240 生成後升起）', not r['grass'] and r['silOk'] and r['y0'] >= 236 and r['bd'] == 0x02, r)

    # ---------------- 機器人：敲噗噗芽 goal + 長跑硬限制 ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate(RUN, {'n': 6000, 'stop': 'goal'})
    ok('機器人：敲噗噗芽一局 ≥ 8000 分（goal，未用密技）', hl['s']['goal'] and hl['s']['score'] >= 8000 and not hl['s']['cheated'], {k: hl[k] for k in ('frames', 'maxLine', 'peak', 'over')} | {'score': hl['s']['score']})
    ok('敲噗噗芽機器人每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', hl['maxLine'] <= 8 and hl['over'] == 0 and hl['peak'] <= 160, hl)
    hl2 = page.evaluate(RUN, {'n': 4000, 'stop': 'over'})
    ok('敲噗噗芽整局（含 4 種新生物階段）每線 ≤ 8、overFrames 0', hl2['maxLine'] <= 8 and hl2['over'] == 0 and hl2['s']['mode'] == 'over', {k: hl2[k] for k in ('frames', 'maxLine', 'peak', 'over')})
    r = page.evaluate(TEXT_JS, ['TIME UP!', 'START  TITLE', 'C/*    CONTINUE HERE'])
    ok('結算：TIME UP + 返回 / 續關提示、行間空一列', all(r['found']) and r['adj'] == 0, r)
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：結算畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})

    fresh(page, '&bot=1&mode=bubble')
    hb = page.evaluate(RUN, {'n': 4000, 'stop': 'over'})
    ok('機器人：泡泡 4000 幀（升級 ≥ 2 次）每線 ≤ 8、overFrames 0、≤ 160 byte', hb['maxLine'] <= 8 and hb['over'] == 0 and hb['peak'] <= 160 and hb['s']['lv'] >= 3,
       {k: hb[k] for k in ('frames', 'maxLine', 'peak', 'over')} | {'lv': hb['s']['lv']})
    r = page.evaluate(NT_JS)
    ok('泡泡長跑後名稱表仍 == 邏輯格子（捲動補列一致）', r['bad'] == 0, r)
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：泡泡遊玩畫面（split 狀態列）0 違規、色數 ≤ 25', lint.get('ok') and lint.get('badPixels', 0) == 0 and lint.get('colors', 99) <= 25, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})

    fresh(page, '&bot=1&mode=balloon')
    hn = page.evaluate(RUN, {'n': 8000, 'stop': 'over'})
    ok('機器人：氣球 8000 幀（過 ≥ 2 關）每線 ≤ 8、overFrames 0', hn['maxLine'] <= 8 and hn['over'] == 0 and hn['s']['stage'] >= 3,
       {k: hn[k] for k in ('frames', 'maxLine', 'peak', 'over', 'maxBal')} | {'stage': hn['s']['stage']})
    ok('氣球：同速上升 + 生成規則 ⇒ 任一 24 px 帶永遠 ≤ 3 顆、總數 ≤ 10', hn['band'] == 0 and hn['maxBal'] <= 10, hn)
    lint = page.evaluate('() => __nes.lint()')
    ok('nes_lint：氣球遊玩畫面 0 違規', lint.get('ok') and lint.get('badPixels', 0) == 0, {k: lint.get(k) for k in ('ok', 'colors', 'badPixels')})
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_pop: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
