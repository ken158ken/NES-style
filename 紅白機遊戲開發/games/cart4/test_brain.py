# -*- coding: utf-8 -*-
"""《星塵腦力 STAR BRAIN》（cart4 槽 7，id = brain）自動驗證。

重點：四模式（TWIN 雙手同步 / JUGGLE 多工 / TRACER 時空追蹤 / TILT 重力感應）的等級設計遞增、
      split + 屬性分區（TWIN 流動場地 / 固定區、TILT 傾斜位移、JUGGLE 四格屬性）、定點數物理不穿牆、
      §6 規則（密技原地續關 / 標題無效 / goal false / 暫停 BGM / exit 存分 / backTile / 說明字樣）、
      機器人人類延遲（預設 15、另驗 0 與 24 都能達成 goal）、每線 ≤ 8 精靈、VBlank ≤ 160、名稱表 == 影子。
作法：Playwright 開 `cart4.html?game=brain&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Brain.dev` / `CT.Brain.C`。

用法：../卡比之星/.venv/bin/python games/cart4/test_brain.py [-v] [--quick]（--quick 略過長跑的機器人）
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import pathlib
import sys
from collections import deque

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=brain'
VERBOSE = '-v' in sys.argv
QUICK = '--quick' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)[:400]) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Brain && !!CT.Brain.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.brain.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


SCREEN = r"""
() => { const p = __nes.nes().ppu, A = CT.Brain.Art.make(); const rows = [];
  const rev = {}; for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-.,!?()') rev[A.ch(k)] = k;
  for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); s += (t && rev[t] !== undefined) ? rev[t] : ' '; } rows.push(s); }
  return rows; }
"""

RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, ev: [] };
  let prev = GAME.state().s.mode;
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const g = GAME.state();
    if (g.s.mode !== prev) { prev = g.s.mode; if (prev === 'over' || prev === 'result' || prev === 'lvlend') r.ev.push([r.f, prev, g.s.run && g.s.run.lv, g.s.run && g.s.run.hurts]); }
    if (o.until === 'goal' && g.goal) break;
    if (o.until && g.s.mode === o.until) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""

NT_MATCH = r"""
() => { const C = CT.Brain.C, p = __nes.nes().ppu; let bad = 0;
  for (let k = 0; k < 960; k++) if (p.getTile(0, k & 31, k >> 5) !== C.want[k]) bad++;
  return { bad, q: C.q.length + C.qa.length }; }
"""


def bfs_ok(rows):
    s = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == 'S'][0]
    seen = {s}
    q = deque([s])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if rows[ny][nx] not in '#o' and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    goals = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == 'G']
    stars = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == '*']
    return goals and all(g in seen for g in goals) and all(t in seen for t in stars), len(stars)


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

    # ================= 契約 / 資產 =================
    reg = page.evaluate("""() => { const g = CT.get('brain'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id brain / order 7 / 星塵腦力 / legacy 4 款', reg and reg['id'] == 'brain' and reg['order'] == 7 and reg['title'] == '星塵腦力' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元純分數', reg['bestText'] == '000000', reg['bestText'])
    ok('§6-4 backTile = 自己精靈表的實心星', reg['bt'] and page.evaluate("(t) => t.tile === CT.Brain.Art.make().s('STARS') && t.pal >= 0 && t.pal < 4", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Brain.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Brain.Audio.SONGS), sfx: Object.keys(CT.Brain.Audio.SFX) })")
    ok('BGM 7 首、音效 ≥ 4，全部 brain_ 前綴', len(au['songs']) >= 7 and len(au['sfx']) >= 4 and all(k.startswith('brain_') for k in au['songs'] + au['sfx']), au)
    md = page.evaluate("""() => CT.Brain.Modes.map(M => ({ key: M.key, levels: M.levels, hearts: M.hearts, rules: M.rules.length, pad: !!M.pad, goalLine: !!M.goalLine,
        fns: ['enter','tick','draw','hud2','grade','observe','bot','cheat','titleOf','resultLines','levelTip'].filter(k => typeof M[k] === 'function').length }))""")
    ok('四模式齊全（TWIN / JUGGLE / TRACER / TILT），各有等級 / 規則 / 手把圖 / 評價 / 機器人', [m['key'] for m in md] == ['TWIN', 'JUGGLE', 'TRACER', 'TILT']
       and all(m['levels'] >= 5 and m['rules'] >= 5 and m['pad'] and m['goalLine'] and m['fns'] == 11 for m in md), md)

    # ================= 等級設計 =================
    d = page.evaluate('() => ({ LV: CT.Brain.Dual.LV, T: CT.Brain.Dual.LEVEL_T })')
    L = d['LV']
    ok('TWIN：8 級，隕石速度 / 晶礦速度遞增、間隔遞減', len(L) == 8 and all(L[i]['rv'] < L[i + 1]['rv'] and L[i]['iv'] < L[i + 1]['iv'] and L[i]['gap'] > L[i + 1]['gap'] for i in range(7)), L)
    ok('TWIN：第 5 級起規則對調、雙顆機率遞增', all(L[i]['flip'] == (1 if i >= 4 else 0) for i in range(8)) and all(L[i]['dbl'] <= L[i + 1]['dbl'] for i in range(7)), L)
    ok('TWIN：排距 ≥ 40 px、晶礦間距 ≥ 40 px（不同排不疊在同一掃描線）', all(x['rv'] * x['gap'] // 256 >= 40 and x['iv'] * x['igap'] // 256 >= 40 for x in L),
       [(x['rv'] * x['gap'] // 256, x['iv'] * x['igap'] // 256) for x in L])
    ok('TWIN：每級 20 秒（1202 幀）', d['T'] == 1202, d['T'])
    mu = page.evaluate('() => ({ S: CT.Brain.Multi.STAGE, LV: CT.Brain.Multi.LV, O: CT.Brain.Multi.OPENS, goalF: CT.Brain.GOAL_FRAMES })')
    ok('JUGGLE：goal = 90 秒 = 5409 幀；時間軸 20 / 45 / 90 / 120 / 150 秒', mu['goalF'] == 5409 and mu['S'] == [0, 1202, 2704, 5409, 7212, 9015], mu['S'])
    ok('JUGGLE：任務 2 → 3 → 4 件（DRIFT+PUMP / +SIGNAL / +SHIELD）', mu['O'] == [0, 0, 1, 2], mu['O'])
    ML = mu['LV']
    ok('JUGGLE：風力 / 漏油 / 流星速度逐級遞增', all(ML[i]['wind'] < ML[i + 1]['wind'] and ML[i]['leak'] < ML[i + 1]['leak'] and ML[i]['met'] < ML[i + 1]['met'] for i in range(4)), ML)
    ok('JUGGLE：推力恆大於最大風力（一定救得回來）', all(x['thrust'] > x['wind'] for x in ML), ML)
    tr = page.evaluate('() => CT.Brain.Track.LV')
    ok('TRACER：8 級，盤面 4→6、物件 1→3、步速變快、盲段（第 5、8 級）', len(tr) == 8 and tr[0]['n'] == 4 and tr[7]['n'] == 6 and max(x['k'] for x in tr) == 3
       and all(tr[i]['st'] >= tr[i + 1]['st'] for i in range(7)) and tr[4]['blind'] > 0 and tr[7]['blind'] > 0 and tr[7]['one'] == 1, tr)
    boards = page.evaluate('() => CT.Brain.Tilt.BOARDS')
    shape = all(len(b['rows']) == 12 and all(len(r) == 16 for r in b['rows']) and b['rows'][0] == '#' * 16 and b['rows'][11] == '#' * 16
                and all(r[0] == '#' and r[15] == '#' for r in b['rows']) for b in boards)
    ok('TILT：8 張星盤 16×12、四周是牆', len(boards) == 8 and shape, [b['name'] for b in boards])
    reach = [bfs_ok(b['rows']) for b in boards]
    ok('TILT：每張起點都走得到星門與全部星屑（Python BFS，洞 = 不可走）', all(r[0] for r in reach), reach)
    holes = [sum(r.count('o') for r in b['rows']) for b in boards]
    ok('TILT：第 1 張沒有洞（先學滾），之後才有', holes[0] == 0 and all(h > 0 for h in holes[1:]), holes)
    ok('TILT：冰面（第 4 張起）與輸送帶（第 5 張起）', '~' in ''.join(boards[3]['rows']) and any(c in ''.join(boards[4]['rows']) for c in '<>^v'), '')

    # ================= 標題 / 說明頁 =================
    txt = '\n'.join(page.evaluate(SCREEN))
    ok('標題：STAR BRAIN 字樣 + 4 模式 + HOLD START+SELECT: MENU + C/$ = CHEAT', all(k in txt for k in ['SPLIT MIND TRAINING LAB', 'TWIN SYNC', 'JUGGLE', 'TRACER', 'TILT ROLL', 'HOLD START+SELECT: MENU', 'C/$ = CHEAT']), txt)
    lint = page.evaluate('() => __nes.lint()')
    ok('標題畫面 lint 綠', lint.get('ok'), lint)
    ok('標題按密技無效（cheat() = false）', page.evaluate("() => CT.get('brain').cheat()") is False)
    for m in range(4):
        page.evaluate('(m) => CT.Brain.dev.howto(m)', m)
        page.evaluate('() => __nes.step(2)')
        t2 = '\n'.join(page.evaluate(SCREEN))
        info = page.evaluate('(m) => { const M = CT.Brain.Modes[m]; return { pad: [M.pad.b, M.pad.a].concat(M.pad.d), rules: M.rules }; }', m)
        rows = page.evaluate(SCREEN)
        long_ok = all(len(r) <= 26 for r in info['rules'])
        ok('說明頁 %d：規則 + 手把對照（按鍵用途）+ HOLD START+SELECT: MENU，規則每列 ≤ 26 字' % (m + 1),
           all(p in t2 for p in info['pad'] if p != '-') and 'HOLD START+SELECT: MENU' in t2 and long_ok and 'A GO' in t2, rows[20:27])
    ok('說明頁按密技無效', page.evaluate("() => CT.get('brain').cheat()") is False)
    # 起始等級：沒到過只能選 1，存檔到達第 4 級後可以選到 4
    r = page.evaluate("""() => { CT.Brain.dev.howto(0); __nes.step(2); NES.Input.inject(128, 1); __nes.step(2); const a = CT.Brain.dev.g().howLv;
        CT.save('brain', 'reach_TWIN', 3); CT.Brain.dev.howto(0); __nes.step(2); const b = CT.Brain.dev.g().howLv;
        NES.Input.inject(128, 1); __nes.step(2); const c = CT.Brain.dev.g().howLv; NES.Input.inject(64, 1); __nes.step(2); const d = CT.Brain.dev.g().howLv; return { a, b, c, d }; }""")
    ok('起始等級：只能選已到達的等級（未解鎖 → 1；到達 4 → 預設 4、往右不超過、往左可退）', r == {'a': 0, 'b': 3, 'c': 3, 'd': 2}, r)
    page.evaluate("() => localStorage.removeItem('nes.cart4.brain.reach_TWIN')")

    # ================= TWIN：split / 屬性 / 判定 =================
    page.evaluate('() => { CT.Brain.dev.start(0, 0); CT.Brain.dev.begin(); }')
    r = page.evaluate("""() => { const p = __nes.nes().ppu, ys = new Set(); for (let i = 0; i < 40; i++) { __nes.step(1); ys.add(p.getScroll().y); }
        const sp = p._split; let same = true; for (let c = 0; c < 32; c++) for (let rr = 1; rr <= 18; rr++) if (p.getTile(0, c, rr) !== p.getTile(0, c, 0)) same = false;
        const at = r16 => [0, 7, 9].map(c => (p._at ? null : null));
        return { ys: [...ys].sort(), split: sp && { line: sp.line, y: sp.y }, same }; }""")
    ok('TWIN：主捲動 y 在 0..7 循環（流動）、split(144) 下方顯示名稱表列 19 起（固定區）', r['split'] == {'line': 144, 'y': 152} and len(r['ys']) >= 4 and max(r['ys']) <= 7 and min(r['ys']) >= 0, r)
    ok('TWIN：流動區名稱表每列相同（週期 8 px，捲動不露接縫）', r['same'], r)
    att = page.evaluate("() => { const C = CT.Brain.C; return [C.wantA[5 * 16 + 2], C.wantA[5 * 16 + 7], C.wantA[5 * 16 + 12], C.wantA[14 * 16 + 3]]; }")
    ok('TWIN：屬性分區 左半組 1 / 中央柱組 3 / 右半組 2 / HUD 組 0', att == [1, 3, 2, 0], att)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.items = []; s.itemWait = 9999; const h0 = GAME.state().s.run.hearts;
        NES.Input.inject(1, 1); __nes.step(2); NES.Input.inject(2, 1); __nes.step(2); return { h0, h1: GAME.state().s.run.hearts, ng: s.sortNg }; }""")
    ok('TWIN：分揀區沒有東西時按 A / B 不算錯（友善）', r['h0'] == r['h1'] and r['ng'] == 0, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.rocks = []; s.rowWait = 9999; s.items = [{ type: 0, y: 150 * 256, dec: 0, fly: 0, x: 192 }];
        const sc0 = GAME.state().s.run.score; NES.Input.inject(1, 1); __nes.step(2); const ok1 = s.sortOk, sc1 = GAME.state().s.run.score;
        s.items = [{ type: 0, y: 150 * 256, dec: 0, fly: 0, x: 192 }]; const h0 = GAME.state().s.run.hearts; NES.Input.inject(2, 1); __nes.step(2);
        return { ok1, gain: sc1 - sc0, ng: s.sortNg, dh: h0 - GAME.state().s.run.hearts }; }""")
    ok('TWIN：晶礦按 A（右槽）= 正確加分；按 B = 分錯 −1 心', r['ok1'] == 1 and r['gain'] > 0 and r['ng'] == 1 and r['dh'] == 1, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.items = [{ type: 1, y: 60 * 256, dec: 0, fly: 0, x: 192 }]; s.itemWait = 9999; const h0 = GAME.state().s.run.hearts;
        for (let i = 0; i < 200 && s.items.length; i++) __nes.step(1); return { left: s.items.length, dh: h0 - GAME.state().s.run.hearts }; }""")
    ok('TWIN：沒分揀就掉出閘門 = −1 心', r['left'] == 0 and r['dh'] == 1, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.inv = 0; s.rocks = [{ lane: s.lane, y: 140 * 256, row: 999, hit: false }]; s.rowWait = 9999;
        const h0 = GAME.state().s.run.hearts; for (let i = 0; i < 40; i++) __nes.step(1); return { dh: h0 - GAME.state().s.run.hearts, inv: s.inv > 0 }; }""")
    ok('TWIN：隕石撞星艇 = −1 心 + 60 幀無敵', r['dh'] == 1 and r['inv'], r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub, l0 = s.lane; NES.Input.inject(64, 1); __nes.step(2); const l1 = s.lane; NES.Input.inject(64, 1); __nes.step(2); NES.Input.inject(64, 1); __nes.step(2);
        const l2 = s.lane; for (let i = 0; i < 10; i++) __nes.step(1); return { l0, l1, l2, sx: s.sx >> 8 }; }""")
    ok('TWIN：← 換跑道（邊界停住），星艇滑到該跑道左緣 12', r['l1'] == max(0, r['l0'] - 1) and r['l2'] == 0 and r['sx'] == 12, r)
    page.evaluate('() => { CT.Brain.dev.start(0, 4); CT.Brain.dev.begin(); }')
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; const at = s.flipAt; s.rocks = []; s.rowWait = 99999; s.items = []; s.itemWait = 99999;
        for (let i = 0; i < at + 5; i++) __nes.step(1);
        const t = (c, r) => __nes.nes().ppu.getTile(0, c, r), A = CT.Brain.Art.make();
        return { at, flip: s.flip, left: [19, 20, 21].map(c => t(c, 25)), gem: A.text('GEM') }; }""")
    ok('TWIN 第 5 級：規則對調（左槽牌子變 GEM）', r['at'] > 0 and r['flip'] is True and r['left'] == r['gem'], r)

    # ================= JUGGLE：屬性分區 / 任務 =================
    page.evaluate('() => { CT.Brain.dev.start(1, 0); CT.Brain.dev.begin(); }')
    att = page.evaluate("() => { const C = CT.Brain.C; return [C.wantA[3 * 16 + 2], C.wantA[3 * 16 + 10], C.wantA[9 * 16 + 2], C.wantA[9 * 16 + 10]]; }")
    ok('JUGGLE 第 1 級：左上 / 右上運作（組 1 / 2）、左下 / 右下待命（組 0）', att == [1, 2, 0, 0], att)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.t = 1190; for (let i = 0; i < 20; i++) __nes.step(1); const C = CT.Brain.C;
        return { on: s.on, lv: s.lv, a: C.wantA[9 * 16 + 2] }; }""")
    ok('JUGGLE 20 秒：SIGNAL 開放、左下格屬性換成組 2', r['on'] == [True, True, True, False] and r['lv'] == 1 and r['a'] == 2, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub, f0 = s.fuel; NES.Input.inject(1, 40); __nes.step(40); __nes.step(2); return { d: s.fuel - f0, f: s.fuel }; }""")
    ok('JUGGLE PUMP：按住 A 40 幀只算 1 下（按下邊緣）', 6 * 256 - 40 * 30 < r['d'] <= 6 * 256, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.fuel = 62 * 256; s.freeze[1] = 0; const f0 = s.fails[1]; NES.Input.inject(1, 1); __nes.step(2);
        return { fails: s.fails[1] - f0, fuel: s.fuel >> 8 }; }""")
    ok('JUGGLE PUMP：打滿出來 = 失誤、油槽回 40', r['fails'] == 1 and r['fuel'] <= 40, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.freeze[2] = 0; s.sig = { dirs: [0], idx: 0, left: 100, max: 100 }; const f0 = s.fails[2];
        NES.Input.inject(32, 1); __nes.step(2); return { fails: s.fails[2] - f0, sig: s.sig }; }""")
    ok('JUGGLE SIGNAL：亮 ↑ 按 ↓ = 失誤', r['fails'] == 1 and r['sig'] is None, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.freeze[2] = 0; s.sig = { dirs: [1], idx: 0, left: 100, max: 100 }; const k0 = s.okSig;
        NES.Input.inject(32, 1); __nes.step(2); return { ok: s.okSig - k0 }; }""")
    ok('JUGGLE SIGNAL：亮 ↓ 按 ↓ = 成功', r['ok'] == 1, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.on[3] = true; s.freeze[3] = 0; s.mets = []; s.metWait = 9999; s.cool = 0;
        NES.Input.inject(2, 1); __nes.step(2); const c = s.cool; s.cool = 0; s.mets = [{ x: 180 * 256, v: 0 }]; const k0 = s.okMet; NES.Input.inject(2, 1); __nes.step(2);
        return { c, ok: s.okMet - k0, left: s.mets.length }; }""")
    ok('JUGGLE SHIELD：空揮 → 冷卻 30 幀；流星在環內按 B → 擊碎', r['c'] >= 28 and r['ok'] == 1 and r['left'] == 0, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.freeze[0] = 0; s.dp = 0; s.dv = 0; s.wind = 0; s.windTo = 0; s.windHold = 9999;
        NES.Input.inject(128, 30); __nes.step(30); const a = s.dp; NES.Input.inject(64, 60); __nes.step(60); return { a, b: s.dp, int: Number.isInteger(s.dp) && Number.isInteger(s.dv) }; }""")
    ok('JUGGLE DRIFT：→ 推右、← 推回（8.8 定點整數）', r['a'] > 0 and r['b'] < r['a'] and r['int'], r)

    # ================= TRACER =================
    gen = page.evaluate("""() => { let bad = 0, n = 0, ansBad = 0; const T = CT.Brain.Track;
        for (let lv = 0; lv < 8; lv++) for (let k = 0; k < 25; k++) { CT.Brain.dev.start(2, lv); const s = CT.Brain.C.g.sub; n++;
          for (const pos of s.track) { const seen = new Set(); for (const q of pos) { const key = q.x + ',' + q.y; if (seen.has(key)) bad++; seen.add(key);
            if (q.x < 0 || q.y < 0 || q.x >= T.LV[lv].n || q.y >= T.LV[lv].n) bad++; } }
          const a = s.track[s.q.at][s.q.who]; if (a.x !== s.q.ans.x || a.y !== s.q.ans.y) ansBad++; }
        return { bad, n, ansBad }; }""")
    ok('TRACER：200 回合的軌跡都在盤內、同一步兩物件不重疊、答案 = 軌跡', gen['bad'] == 0 and gen['ansBad'] == 0 and gen['n'] == 200, gen)
    page.evaluate('() => { CT.Brain.dev.start(2, 0); CT.Brain.dev.begin(); }')
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; for (let i = 0; i < 400 && s.phase !== 'ask'; i++) __nes.step(1);
        const o = CT.Brain.Modes[2].observe(); return { phase: s.phase, objs: o.objs, sprites: CT.Brain.C.sprUsed }; }""")
    ok('TRACER：作答時物件全部隱藏（畫面 / 機器人觀察都看不到）', r['phase'] == 'ask' and r['objs'] is None and r['sprites'] == 4, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; NES.Input.inject(2, 1); __nes.step(2); const p1 = s.phase, rep = s.rep;
        for (let i = 0; i < 400 && s.phase !== 'ask'; i++) __nes.step(1); NES.Input.inject(2, 1); __nes.step(2);
        return { p1, rep, p2: s.phase, rep2: s.rep }; }""")
    ok('TRACER：B 重看一次（回到 WATCH），第二次 B 無效', r['p1'] == 'watch' and r['rep'] == 1 and r['p2'] == 'ask' and r['rep2'] == 1, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; s.cx = s.q.ans.x; s.cy = s.q.ans.y; const sc0 = GAME.state().s.run.score; NES.Input.inject(1, 1); __nes.step(2);
        return { ok: s.judgeOk, gain: GAME.state().s.run.score - sc0, full: 50 + Math.floor((600 - 0) / 10) }; }""")
    ok('TRACER：答對加分；重看過的那題只拿一半', r['ok'] is True and 0 < r['gain'] <= r['full'] // 2 + 1, r)
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; for (let i = 0; i < 400 && s.phase !== 'ask'; i++) __nes.step(1);
        s.cx = (s.q.ans.x + 1) % 4; s.cy = s.q.ans.y; const h0 = GAME.state().s.run.hearts; NES.Input.inject(1, 1); __nes.step(2);
        return { ok: s.judgeOk, dh: h0 - GAME.state().s.run.hearts }; }""")
    ok('TRACER：答錯 −1 心', r['ok'] is False and r['dh'] == 1, r)

    # ================= TILT：物理 =================
    page.evaluate('() => { CT.Brain.dev.start(3, 0); CT.Brain.dev.begin(); }')
    r = page.evaluate("""() => { const s = CT.Brain.C.g.sub; NES.Input.inject(128, 6); const tx = []; for (let i = 0; i < 6; i++) { __nes.step(1); tx.push(s.tx); }
        NES.Input.inject(0, 0); __nes.step(1); return { tx, back: s.tx }; }""")
    ok('TILT：傾斜有慣性（每幀 +1，放開回正）', r['tx'] == [1, 2, 3, 4, 5, 6] and r['back'] == 5, r)
    r = page.evaluate("""() => { const T = CT.Brain.Tilt, s = CT.Brain.C.g.sub; let bad = 0, nonInt = 0, frames = 0; const keys = [16, 32, 64, 128, 80, 160, 0];
        for (let b = 0; b < 8; b++) { CT.Brain.dev.start(3, b); CT.Brain.dev.begin(); const ss = CT.Brain.C.g.sub;
          ss.grid = ss.grid.map(r => r.map(c => c === 'o' || c === 'G' ? '.' : c));
          let seed = 7 + b;
          for (let i = 0; i < 1500; i++) { if (i % 40 === 0) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; NES.Input.inject(keys[(seed >> 8) % keys.length], 40); }
            __nes.step(1); frames++; const x = ss.x >> 8, y = ss.y >> 8;
            for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) if (ss.grid[(y + dy) >> 4][(x + dx) >> 4] === '#') bad++;
            if (!Number.isInteger(ss.x) || !Number.isInteger(ss.vx)) nonInt++; } }
        NES.Input.inject(0, 0); return { bad, nonInt, frames }; }""")
    ok('TILT：8 張盤 × 1500 幀亂按，球的 6×6 碰撞盒從不進牆、位置速度全是整數', r['bad'] == 0 and r['nonInt'] == 0, r)
    r = page.evaluate("""() => { CT.Brain.dev.start(3, 1); CT.Brain.dev.begin(); const s = CT.Brain.C.g.sub; let hx = -1, hy = -1;
        s.grid.forEach((row, y) => row.forEach((c, x) => { if (c === 'o' && hx < 0) { hx = x; hy = y; } }));
        s.x = (hx * 16 + 8) * 256 + 3 * 256; s.y = (hy * 16 + 8) * 256; s.vx = 0; s.vy = 0; const h0 = GAME.state().s.run.hearts;
        for (let i = 0; i < 20; i++) __nes.step(1); const fell = s.fall > 0; for (let i = 0; i < 40; i++) __nes.step(1);
        return { fell, dh: h0 - GAME.state().s.run.hearts, back: [s.x >> 12, s.y >> 12], start: [s.sx, s.sy] }; }""")
    ok('TILT：洞口 3 px 被吸進去 → −1 心、回起點', r['fell'] and r['dh'] == 1 and r['back'] == r['start'], r)
    r = page.evaluate("""() => { const p = __nes.nes().ppu, s = CT.Brain.C.g.sub; NES.Input.inject(128 | 32, 30); __nes.step(30);
        const sp = p._split; const nt1 = p.getTile(1, 5, 10) === CT.Brain.Art.make().t('MT_WALL_0'); NES.Input.inject(0, 0); return { line: sp.line, x: sp.x, y: sp.y, nt1 }; }""")
    ok('TILT：傾斜時 split(32) 以下的星盤位移 ±2 px（x 511/510 = 往右、y 30）、名稱表 1 鋪牆', r['line'] == 32 and r['x'] in (510, 511) and r['y'] in (30, 31) and r['nt1'], r)
    r = page.evaluate("""() => { const C = CT.Brain.C, s = CT.Brain.C.g.sub; let bad = 0; const want = { '#': 2, '.': 1, 'o': 1, 'G': 3, 'S': 1, '*': 1, '~': 3 };
        s.grid.forEach((row, y) => row.forEach((c, x) => { if (want[c] !== undefined && C.wantA[(2 + y) * 16 + x] !== want[c]) bad++; })); return bad; }""")
    ok('TILT：每個金屬塊 = 一個屬性區塊（牆組 2 / 地板組 1 / 星門冰組 3）', r == 0, r)

    # ================= §6：暫停 / 密技 / 續關 / exit =================
    page.evaluate('() => { CT.Brain.dev.start(1, 0); CT.Brain.dev.begin(); __nes.step(30); }')
    r = page.evaluate("""() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 2); __nes.step(3); const p0 = GAME.state().s.paused;
        NES.Input.inject(8, 1); __nes.step(2); const s = CT.Brain.C.g.sub, t = s.t; const rp = __nes.nes().music.state().rowsPlayed;
        __nes.step(60); const frozen = s.t === t, mp = __nes.nes().music.isPaused(), rp2 = __nes.nes().music.state().rowsPlayed;
        const row = []; const A = CT.Brain.Art.make(), p = __nes.nes().ppu; for (let c = 1; c < 31; c++) row.push(p.getTile(0, c, 3));
        const want = A.text('PAUSE  HOLD START+SELECT: MENU'); NES.Input.inject(8, 1); __nes.step(2);
        return { p0, frozen, mp, rows: rp === rp2, hint: want.every((v, i) => row[i] === v), after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('SELECT + START 不觸發暫停', r['p0'] is False, r)
    ok('START 暫停：時間凍結、BGM 暫停（rowsPlayed 不動）、解除接續', r['frozen'] and r['mp'] is True and r['rows'] and r['mp2'] is False and r['after'] is False, r)
    ok('§6-5 暫停列寫著 HOLD START+SELECT: MENU', r['hint'], r)
    r = page.evaluate("""() => { const g = CT.Brain.dev.g(); g.run.hearts = 0; __nes.step(2); const m1 = g.mode; const lv = g.run.lv, sc = g.run.score;
        const c = CT.get('brain').cheat(); __nes.step(2); return { m1, c, m2: g.mode, lv2: g.run.lv, lv, hearts: g.run.hearts, cheated: g.run.cheated, cont: g.run.continues, sc2: g.run.score, sc }; }""")
    ok('§6-1 GAME OVER 按密技 = 原地續關（同一級、愛心補滿、分數保留）', r['m1'] == 'over' and r['c'] is True and r['m2'] == 'ready' and r['lv2'] == r['lv']
       and r['hearts'] == 5 and r['cheated'] and r['cont'] == 1 and r['sc2'] == r['sc'], r)
    r = page.evaluate("""() => { CT.Brain.dev.start(1, 2); CT.Brain.dev.begin(); const g = CT.Brain.dev.g(); g.run.hearts = 2; CT.get('brain').cheat(); __nes.step(2);
        g.sub.t = 5400; for (let i = 0; i < 20; i++) __nes.step(1); return { hearts: g.run.hearts, cheated: g.run.cheated, goal: CT.get('brain').goal(), t: g.sub.t }; }""")
    ok('§6-1 遊玩中密技 = 愛心補滿；用過密技那局撐過 90 秒 goal 仍 false', r['hearts'] == 5 and r['cheated'] and r['goal'] is False and r['t'] > 5409, r)
    r = page.evaluate("""() => { const g = CT.Brain.dev.g(); g.run.score = 4321; CT.get('brain').exit(__nes.nes()); return CT.load('brain', 'best', 0); }""")
    ok('§6-3 exit() 存最高分', r == 4321, r)
    ok('bestText 反映最高分（右對齊 6 字元）', page.evaluate("() => CT.get('brain').bestText()") == '004321')

    # ================= 結算 / 評價 =================
    r = page.evaluate("""() => { CT.Brain.dev.start(3, 0); CT.Brain.dev.begin(); const g = CT.Brain.dev.g(); g.run.lv = 7; g.run.hurts = 0; CT.Brain.dev.result(); __nes.step(2);
        return { mode: g.mode, grade: g.run.grade, saved: CT.load('brain', 'grade_TILT', 5) }; }""")
    txt = '\n'.join(page.evaluate(SCREEN))
    ok('結算：評價大字 + 稱號 + 評價存檔（TILT 0 失誤 = S）', r['mode'] == 'result' and r['grade'] == 'S' and r['saved'] == 0 and 'GRAVITY MASTER' in txt and 'GRADE' in txt, r)
    r = page.evaluate("""() => { CT.Brain.dev.start(3, 5); CT.Brain.dev.begin(); const g = CT.Brain.dev.g(); g.run.lv = 7; g.run.hurts = 0; CT.Brain.dev.result(); return g.run.grade; }""")
    ok('不是從第 1 級開始的那局，評價最高 B', r == 'B', r)
    m = page.evaluate(NT_MATCH)
    page.evaluate('() => __nes.step(3)')
    m = page.evaluate(NT_MATCH)
    ok('名稱表 == 影子（佇列清空後）', m['bad'] == 0 and m['q'] == 0, m)

    # ================= 機器人：goal / 每線 / VBlank / 人類延遲 =================
    def bot_run(q, n, until='goal'):
        fresh(page, q)
        return page.evaluate(RUN, {'n': n, 'until': until})

    r = bot_run('&bot=1', 9000)
    ok('機器人（預設延遲 15 幀）：JUGGLE 撐過 90 秒 → goal（不開密技）', r['goal'] and r['s']['run']['cheated'] is False and r['s']['lag'] == 15, {k: r[k] for k in ('f', 'ml', 'over', 'peak', 'goal')})
    ok('機器人全程每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, {k: r[k] for k in ('f', 'ml', 'over', 'peak')})
    if not QUICK:
        for lag in (0, 24):
            r = bot_run('&bot=1&lag=%d' % lag, 9000)
            ok('人類延遲 %d 幀：JUGGLE 仍達成 goal（每線 ≤ 8、over 0）' % lag, r['goal'] and r['ml'] <= 8 and r['over'] == 0 and r['s']['lag'] == lag, {k: r[k] for k in ('f', 'ml', 'over', 'goal')})
        for m, name, n in ((1, 'TWIN', 14000), (3, 'TRACER', 16000), (4, 'TILT', 12000)):
            r = bot_run('&bot=1&botmode=%d&gmode=%d' % (m, m), n, 'result')
            ok('機器人（延遲 15）：%s 從第 1 級打到結算' % name, r['s']['mode'] == 'result' and r['ml'] <= 8 and r['over'] == 0,
               {'f': r['f'], 'ml': r['ml'], 'over': r['over'], 'grade': r['s']['run'] and r['s']['run']['grade'], 'hurts': r['s']['run'] and r['s']['run']['hurts']})
        r = bot_run('&bot=1&botmode=2&gmode=2', 9600, 'result')
        ok('機器人（延遲 15）：JUGGLE 撐完 150 秒到結算', r['s']['mode'] == 'result' and r['ml'] <= 8 and r['over'] == 0,
           {'f': r['f'], 'ml': r['ml'], 'grade': r['s']['run'] and r['s']['run']['grade'], 'hurts': r['s']['run'] and r['s']['run']['hurts']})
        r = page.evaluate("() => __nes.lint()")
        ok('結算畫面 lint 綠', r.get('ok'), r)
    # 機器人公平性：觀察裡沒有「還沒出現」的內部狀態
    fresh(page, '&gmode=2')
    page.evaluate('() => CT.Brain.dev.begin()')
    keys = page.evaluate('() => Object.keys(CT.Brain.Modes[1].observe())')
    ok('機器人觀察（JUGGLE）不含下次出現時間（sigWait / metWait / windTo）', not any(k in keys for k in ('sigWait', 'metWait', 'windTo', 'windHold')), keys)
    fresh(page, '&gmode=1')
    page.evaluate('() => CT.Brain.dev.begin()')
    keys = page.evaluate('() => Object.keys(CT.Brain.Modes[0].observe())')
    ok('機器人觀察（TWIN）不含下次對調時間 / 生成計時', not any(k in keys for k in ('flipAt', 'rowWait', 'itemWait')), keys)

    ok('頁面無錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r in results if r[0])
    print('test_brain：%d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
