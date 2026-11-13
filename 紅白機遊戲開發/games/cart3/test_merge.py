# -*- coding: utf-8 -*-
"""《星塵合星 STAR MERGE》（cart3 槽 1，id = merge）自動驗證。

重點：滑動合併規則（每顆一次、不連鎖、第 12 階封頂）、黑洞格（擋路 / 吞星塵石礫 / 24 步跳位）、
      每步補一顆、復原 1 步（含卡死畫面）、卡死判定、密技（遊玩掃除 / 卡死原地續關 / 標題無效 / goal 失效）、
      ?seed= 可重現、盤面只有天體圖示（**名稱表盤面區沒有任何數字字型**）、§6 規則、
      影子表 + 差異佇列（大滑動分幀寫、overFrames 0）、機器人 goal（4×4 合出第 8 階）、每線 ≤ 8 精靈。
作法：Playwright 開 `cart3.html?game=merge&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Merge.dev` / `CT.Merge.logic`。

用法：../卡比之星/.venv/bin/python games/cart3/test_merge.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=merge'
SHOTS = ROOT / 'shots' / 'agent_cart3-number'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
L_, R_, U_, D_ = 0, 1, 2, 3


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Merge && !!CT.Merge.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.merge.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def slide(page, cells, n, d):
    return page.evaluate('([c, n, d]) => CT.Merge.logic.slide(c, n, d)', [cells, n, d])


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def start(page, mode=0, seed=0):
    page.evaluate('([m, s]) => { CT.Merge.dev.start(m, s); __nes.step(1); }', [mode, seed])


def setc(page, cells):
    page.evaluate('(c) => { CT.Merge.dev.setCells(c); __nes.step(4); }', cells)


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

FONT_DIGITS = "() => { const A = CT.Merge.Art.make(); return '0123456789'.split('').map(c => A.ch(c)); }"


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
    reg = page.evaluate("""() => { const g = CT.get('merge'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id merge / order 1 / title 星塵合星 / legacy 2048', reg and reg['id'] == 'merge' and reg['order'] == 1 and reg['title'] == '星塵合星' and reg['legacy'] == ['2048.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元純分數（000000）', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Merge.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Merge.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Merge.Audio.SONGS), sfx: Object.keys(CT.Merge.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 merge_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('merge_') for k in au['songs'] + au['sfx']), au)
    ok('4 個模式（≥ 3 難度）：4×4 / 5×5 / 3×3 / 黑洞 5×5', page.evaluate("() => CT.Merge.MODES.map(m => m.n + (m.hole ? 'h' : '')).join(',')") == '4,5,3,5h')

    # 12 階圖示：互不相同、都不是「實心方塊」（透明像素 ≥ 25%）
    ic = page.evaluate("""() => { const A = CT.Merge.Art.make(); const out = [];
        for (let t = 1; t <= 12; t++) { let key = '', clear = 0;
          for (let j = 0; j < 9; j++) { const idx = A.tierTile(t, j); key += idx + ','; const px = NES.CHR.getBank('merge_bg').tiles[idx];
            for (let k = 0; k < 64; k++) if (!px[k]) clear++; }
          out.push({ key, clear: clear / 576 }); }
        return out; }""")
    ok('12 階天體圖示兩兩不同', len(set(x['key'] for x in ic)) == 12, [x['key'][:12] for x in ic])
    ok('12 階圖示都不是方形色塊（每顆透明像素 ≥ 25%）', all(x['clear'] >= 0.25 for x in ic), [round(x['clear'], 2) for x in ic])

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Merge.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    body = [i for i in range(14, 27) if tt[i].strip()]
    ok('§6-6 說明列之間都空一列', all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    tap(page, RIGHT)
    tap(page, RIGHT)
    ok('標題 → ← 切模式（RIGHT ×2 = TINY 3X3）', S(page)['menu'] == 2, S(page)['menu'])
    page.evaluate('() => { __nes.render(); }')
    lt = page.evaluate('() => __nes.lint()')
    ok('標題 lint 綠（≤ 25 色）', lt.get('ok') and lt.get('colors', 99) <= 25, lt.get('colors'))

    # ---------------- 滑動規則（純函式） ----------------
    r = slide(page, [1, 1, 0, 0] + [0] * 12, 4, L_)
    ok('規則：兩顆星塵相撞 → 1 顆石礫，分數 + 4（2^2）', r['cells'][:4] == [2, 0, 0, 0] and r['score'] == 4 and r['moved'], r)
    r = slide(page, [1, 1, 1, 1] + [0] * 12, 4, L_)
    ok('規則：一列四顆同階 → 兩顆升階（每顆只合一次）', r['cells'][:4] == [2, 2, 0, 0], r['cells'][:4])
    r = slide(page, [2, 1, 1, 0] + [0] * 12, 4, L_)
    ok('規則：不連鎖（2,1,1 → 2,2 而不是 3）', r['cells'][:4] == [2, 2, 0, 0], r['cells'][:4])
    r = slide(page, [3, 0, 3, 3] + [0] * 12, 4, R_)
    ok('規則：往右擠（3,_,3,3 → _,_,3,4）', r['cells'][:4] == [0, 0, 3, 4], r['cells'][:4])
    c = [0] * 16
    c[0], c[4], c[8], c[12] = 5, 5, 0, 6
    r = slide(page, c, 4, D_)
    ok('規則：往下（直欄 5,5,_,6 → _,_,6,6）', [r['cells'][i] for i in (0, 4, 8, 12)] == [0, 0, 6, 6], [r['cells'][i] for i in (0, 4, 8, 12)])
    r = slide(page, [12, 12, 0, 0] + [0] * 12, 4, L_)
    ok('規則：第 12 階（星系團）封頂不再合', r['cells'][:2] == [12, 12] and not r['moved'], r['cells'][:4])
    r = slide(page, [1, 2, 1, 2] + [2, 1, 2, 1] + [1, 2, 1, 2] + [2, 1, 2, 1], 4, L_)
    ok('規則：無法移動 → moved false', not r['moved'] and not page.evaluate('() => CT.Merge.logic.canMove([1,2,1,2,2,1,2,1,1,2,1,2,2,1,2,1], 4)'))
    # 黑洞
    r = slide(page, [0, -1, 1, 0] + [0] * 12, 4, L_)
    ok('黑洞：星塵滑進黑洞被吞（+5 分）', r['cells'][:4] == [0, -1, 0, 0] and r['swallowed'] == 1 and r['score'] == 5, r)
    r = slide(page, [0, -1, 0, 3] + [0] * 12, 4, L_)
    ok('黑洞：彗星（第 3 階）不被吞、停在黑洞旁', r['cells'][:4] == [0, -1, 3, 0] and r['swallowed'] == 0, r['cells'][:4])
    r = slide(page, [0, 3, -1, 0] + [0] * 12, 4, R_)
    ok('黑洞：擋路（往右被黑洞擋住）', r['cells'][:4] == [0, 3, -1, 0] and not r['moved'], r['cells'][:4])

    # ---------------- 遊玩流程 ----------------
    start(page, 0, 42)
    s1 = S(page)['cells']
    start(page, 0, 42)
    s2 = S(page)['cells']
    ok('?seed= 可重現：同種子開局盤面相同、恰 2 顆', s1 == s2 and sum(1 for v in s1 if v) == 2, s1)
    setc(page, [1, 1, 0, 0] + [0] * 12)
    page.evaluate('() => { NES.Input.inject(64, 1); __nes.step(1); __nes.step(3); }')
    st = S(page)
    ok('滑動：← 合併 + 補一顆（共 2 顆）、MOVES 1、分數 4', sum(1 for v in st['cells'] if v) == 2 and st['moves'] == 1 and st['score'] == 4 and st['cells'][0] == 2, st)
    setc(page, [2, 0, 0, 0, 3] + [0] * 11)
    tap(page, LEFT)
    st2 = S(page)
    ok('無效滑動：不補顆、不算步、播 bump', st2['cells'] == [2, 0, 0, 0, 3] + [0] * 11 and st2['moves'] == 1 and st2['lastSfx'] == 'merge_bump', (st2['moves'], st2['lastSfx']))
    setc(page, [1, 1, 0, 0] + [0] * 12)
    sc0 = S(page)['score']
    tap(page, LEFT)
    tap(page, B)
    st3 = S(page)
    ok('B 復原 1 步：盤面 / 分數回到滑動前', st3['cells'] == [1, 1, 0, 0] + [0] * 12 and st3['score'] == sc0 and st3['undos'] == 1, (st3['cells'], st3['score'], sc0))
    tap(page, B)
    ok('復原只有 1 步（連按第二次無效）', S(page)['undos'] == 1)
    # 盤面區不出現數字
    setc(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 1, 2, 3])
    page.evaluate('() => __nes.step(4)')
    dg = page.evaluate(FONT_DIGITS)
    lo = page.evaluate('() => CT.Merge.dev.layout()')
    board_tiles = page.evaluate('([lo]) => { const p = __nes.nes().ppu, o = []; for (let r = lo.oy - 1; r < lo.oy + 16; r++) for (let c = lo.ox - 1; c < lo.ox + 16; c++) o.push(p.getTile(0, c, r)); return o; }', [lo])
    ok('盤面區（名稱表）沒有任何數字字型：數值只在 HUD', not any(t in dg for t in board_tiles if t), [t for t in board_tiles if t in dg][:5])
    attrs = page.evaluate('([lo]) => { const p = __nes.nes().ppu, o = []; for (let k = 0; k < 16; k++) o.push(p.getAttr(0, (lo.ox >> 1) + 2 * (k % 4), (lo.oy >> 1) + 2 * ((k / 4) | 0))); return o; }', [lo])
    pals = page.evaluate('() => [1,2,3,4,5,6,7,8,9,10,11,12,0,1,2,3].map(t => t ? CT.Merge.TIERS[t].pal : 0)')
    ok('每格自己的屬性調色盤（= 該階配色）', attrs == pals, (attrs, pals))
    page.evaluate('() => __nes.render()')

    # 卡死 / 星等 / 原地續關
    stuck = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 8]
    setc(page, stuck)
    page.evaluate('() => { CT.Merge.dev.setTop(8); CT.Merge.dev.checkOver(); __nes.step(4); }')
    st = S(page)
    ok('卡死 → NO MOVES（over）+ 星等 2（最高第 8 階）', st['over'] and st['stars'] == 2, (st['over'], st['stars']))
    ok('卡死畫面：播 merge_over', st['music'] == 'merge_over', st['music'])
    ok('§6-1 卡死時密技 = 原地續關（回到遊玩、騰出空格、cheats 1、goal false）',
       page.evaluate('() => CT.cheat()') and not S(page)['over'] and S(page)['cells'].count(0) > 0 and S(page)['cheats'] == 1 and not page.evaluate('() => CT.get("merge").goal()'), S(page)['cells'])
    tap(page, LEFT)
    ok('續關後可以繼續滑', S(page)['moves'] >= 1 and not S(page)['over'], S(page)['moves'])
    # 卡死時 B 復原
    start(page, 0, 3)
    setc(page, [3, 0, 0, 0] + [0] * 12)
    page.evaluate('() => { CT.Merge.dev.move(1); CT.Merge.dev.setCells([1,2,1,2,2,1,2,1,1,2,1,2,2,1,2,1]); CT.Merge.dev.checkOver(); __nes.step(2); }')
    ok('構造卡死盤面 → over', S(page)['over'])
    tap(page, B)
    st = S(page)
    ok('卡死畫面按 B = 復原 1 步並回到遊玩', not st['over'] and st['undos'] == 1 and st['cells'][:4] == [3, 0, 0, 0] and st['music'] == 'merge_play', st)
    # 遊玩中密技：掃除最低階
    start(page, 0, 5)
    setc(page, [1, 1, 3, 0, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    ok('遊玩中密技 = 星塵掃除（最低一階全蒸發）', page.evaluate('() => CT.cheat()') and S(page)['cells'][:6] == [0, 0, 3, 0, 0, 4], S(page)['cells'][:6])
    # goal：4×4 合出第 8 階（不開密技）
    start(page, 0, 6)
    setc(page, [7, 7, 0, 0] + [0] * 12)
    tap(page, LEFT)
    st = S(page)
    ok('goal：4×4 合出恆星（第 8 階）→ IGNITED! + goal true', st['top'] == 8 and st['goal'] and page.evaluate('() => CT.get("merge").goal()') and st['msg'] == 'IGNITED!', (st['top'], st['msg']))
    start(page, 0, 6)
    page.evaluate('() => CT.cheat()')
    setc(page, [7, 7, 0, 0] + [0] * 12)
    tap(page, LEFT)
    ok('用過密技的那一局 goal 一律 false', not page.evaluate('() => CT.get("merge").goal()'))
    start(page, 1, 6)
    page.evaluate('() => { CT.Merge.dev.setCells([7,7].concat(new Array(23).fill(0))); __nes.step(2); }')
    tap(page, LEFT)
    ok('goal 只認 4×4（5×5 合出恆星不算）', S(page)['top'] == 8 and not page.evaluate('() => CT.get("merge").goal()'))
    # 黑洞每 24 步跳位
    start(page, 3, 9)
    h0 = S(page)['hole']
    page.evaluate('() => { let k = 0; while (GAME.state().s.moves < 24 && k < 400) { CT.Merge.dev.move(k & 3); if (GAME.state().s.over) CT.Merge.dev.undo(); k++; } __nes.step(2); }')
    st = S(page)
    ok('黑洞模式：開局黑洞在中央；24 步後跳到別格（holeT 重置）', h0 == 12 and (st['hole'] != h0 or st['moves'] < 24) and st['cells'][st['hole']] == -1 and st['cells'].count(-1) == 1, (h0, st['hole'], st['moves'], st['holeT']))

    # 暫停
    start(page, 0, 11)
    tap(page, START)
    st = S(page)
    ok('§6-2 START 暫停：paused + BGM 暫停（isPaused）', st['paused'] and page.evaluate('() => CT.Merge.Audio.isPaused()'), st['paused'])
    m0 = S(page)['moves']
    tap(page, LEFT)
    tap(page, RIGHT)
    ok('暫停中滑動無效', S(page)['moves'] == m0)
    tap(page, START)
    ok('解除暫停：BGM 從暫停處接續', not S(page)['paused'] and not page.evaluate('() => CT.Merge.Audio.isPaused()') and S(page)['music'] == 'merge_play')

    # §6-3 exit 存最高分
    start(page, 0, 12)
    setc(page, [6, 6, 0, 0] + [0] * 12)
    tap(page, LEFT)
    sc = S(page)['score']
    page.evaluate('() => CT.get("merge").exit(__nes.nes())')
    ok('§6-3 exit() 存最高分 + bestText 6 字元', page.evaluate('() => CT.load("merge", "best", 0)') == sc and page.evaluate('() => CT.get("merge").bestText()') == str(sc).zfill(6), sc)

    # VBlank：5×5 滿盤大改 → 分幀寫完、不超支
    start(page, 1, 13)
    page.evaluate('() => { __nes.step(10); }')
    o0 = page.evaluate('() => __nes.stats().budget.overFrames')
    page.evaluate('() => { CT.Merge.dev.setCells([1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6,7,8,9,10,11,12,1]); }')
    r = page.evaluate('() => { const out = []; for (let i = 0; i < 6; i++) { __nes.step(1); out.push([CT.Merge.dev.pending(), __nes.stats().budget.used]); } return out; }')
    ok('影子表 + 差異佇列：25 格全換 → 分 ≥ 2 幀寫完，每幀 ≤ 160 byte', r[0][0] > 0 and r[-1][0] == 0 and all(x[1] <= 160 for x in r), r)
    ok('大改那幾幀 overFrames 仍 0', page.evaluate('() => __nes.stats().budget.overFrames') == o0)

    # 每線精靈：一次合併 5 欄（UP）
    start(page, 1, 14)
    page.evaluate('() => { const c = new Array(25).fill(0); for (let x = 0; x < 5; x++) { c[x] = 1; c[5 + x] = 1; } CT.Merge.dev.setCells(c); __nes.step(4); }')
    r = page.evaluate('() => { NES.Input.inject(16, 1); let ml = 0; for (let i = 0; i < 16; i++) { __nes.step(1); ml = Math.max(ml, __nes.stats().maxSpritesLine | 0); } return ml; }')
    ok('5 欄同時合併：每線精靈 ≤ 6（閃光 5 + 生成 1）', 0 < r <= 6, r)

    # 機器人
    fresh(page, '&bot=1&seed=21')
    r = page.evaluate(RUN, {'n': 12000, 'until': 'goal'})
    ok('機器人：12000 幀內 goal（4×4 第 8 階、不開密技）', r['goal'] and r['s']['cheats'] == 0 and r['s']['gameMode'] == 'classic', (r['f'], r['s']['top']))
    ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
    ok('機器人沒用復原（解題器自己走）', r['s']['undos'] == 0, r['s']['undos'])
    page.evaluate('() => __nes.render()')

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_merge: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
