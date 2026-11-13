# -*- coding: utf-8 -*-
"""《星塵連線 STAR LINK》（cart3 槽 6，id = lines）自動驗證。

重點：36 關全部「解題器數解 == 1」（唯一解）、產生器 generate(spec, seed) 重跑 == 烘進來的關卡、星橋 / 星門機關規則、
      調色盤分組（過同一座橋的兩色同組）、游標連發（首延遲 12 幀、之後每 4 幀）、下筆 / 收回 / 切斷 / 復原 / 提示 / 清線、
      §6 規則（說明頁、密技、暫停 BGM）、機器人（解題器 + 游標）前 10 關、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart3.html?game=lines&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Lines.dev`。

用法：../卡比之星/.venv/bin/python games/cart3/test_lines.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=lines'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
DB = {'U': UP, 'D': DOWN, 'L': LEFT, 'R': RIGHT}


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Lines && !!CT.Lines.dev')
    page.evaluate('() => { localStorage.removeItem("nes.cart3.lines.stars"); localStorage.removeItem("nes.cart3.lines.seen"); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('(a) => { NES.Input.inject(a[0], 1); __nes.step(1); __nes.step(a[1]); }', [mask, after])


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
    reg = page.evaluate("""() => { const g = CT.get('lines'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id / order 6 / title / legacy', reg and reg['id'] == 'lines' and reg['order'] == 6 and reg['title'] == '星塵連線' and reg['legacy'] == ['connect-lines.html'], reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 右對齊 6 字元（ 00/36）', reg['bestText'] == ' 00/36', repr(reg['bestText']))
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Lines.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Lines.Art.make(); return { bg: A.bg.count, spr: A.spr.count, cells: Object.keys(A.cells).length }; }")
    ok('CHR bank ≤ 256（格子圖以內容去重）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Lines.Audio.SONGS), sfx: Object.keys(CT.Lines.Audio.SFX) })")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4，全部 lines_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('lines_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 關卡：唯一解 / 產生器重現 / 機關 ----------------
    v = page.evaluate("""() => { const G = CT.Lines.Gen, L = CT.Lines.LEVELS, out = { n: L.length, uniq: 0, bad: [], repro: 0, reproBad: [],
          colorsOk: true, bridgeGrp: true, gatesUsed: 0, gateLv: 0, bridgeLv: 0, sizes: [] };
        for (let i = 0; i < L.length; i++) {
          const lv = G.decode(L[i].code), r = G.solve(lv, 2);
          if (r.count === 1 && !r.aborted) out.uniq++; else out.bad.push(i + 1);
          if (lv.ends.length > 8 || new Set(lv.colors).size !== lv.colors.length) out.colorsOk = false;
          out.sizes.push(lv.w);
          if (lv.gates.length) { out.gateLv++; const gc = lv.gates[0], a = gc[1]*lv.w+gc[0], b = gc[3]*lv.w+gc[2];
            if (r.sol.some(p => { const i1 = p.indexOf(a), i2 = p.indexOf(b); return i1 >= 0 && i2 >= 0 && Math.abs(i1 - i2) === 1; })) out.gatesUsed++; }
          if (lv.bridges.length) { out.bridgeLv++;
            for (const bq of lv.bridges) { const c = bq[1]*lv.w+bq[0]; const who = []; r.sol.forEach((p, k) => { if (p.indexOf(c) >= 0) who.push(k); });
              if (who.length === 2 && (lv.colors[who[0]] >> 1) !== (lv.colors[who[1]] >> 1)) out.bridgeGrp = false; } }
          if (i % 5 === 0) { const g2 = G.generate(L[i].spec, L[i].seed); if (g2 && G.encode(g2) === L[i].code) out.repro++; else out.reproBad.push(i + 1); }
        }
        return out; }""")
    ok('關卡 ≥ 30（36 關）', v['n'] >= 30, v['n'])
    ok('全部關卡唯一解（解題器數到 2 只找到 1）', v['uniq'] == v['n'], v['bad'])
    ok('產生器 generate(spec, seed) 重跑 == 烘進來的關卡（每章抽 1）', not v['reproBad'] and v['repro'] >= 7, v['reproBad'])
    ok('每關 ≤ 8 色、顏色不重複', v['colorsOk'])
    ok('難度遞增：盤面 5×5 → 9×9', v['sizes'][0] == 5 and v['sizes'][-1] == 9 and v['sizes'] == sorted(v['sizes']), v['sizes'])
    ok('星橋：過同一座橋的兩色在同一組調色盤（同一屬性區畫得出來）', v['bridgeGrp'] and v['bridgeLv'] >= 15, v)
    ok('星門：每個有星門的關，正解都穿過星門', v['gateLv'] >= 10 and v['gatesUsed'] == v['gateLv'], (v['gateLv'], v['gatesUsed']))
    r = page.evaluate("""() => { const G = CT.Lines.Gen, sp = { w: 7, h: 7, minLen: 3, maxLen: 10, bridges: 1, gates: 1 };
        const a = G.generate(sp, 12345), b = G.generate(sp, 12345), c = G.generate(sp, 12346);
        return { same: G.encode(a) === G.encode(b), diff: G.encode(a) !== G.encode(c), uniq: G.solve(a, 2).count }; }""")
    ok('RANDOM：?seed 可重現（同 seed 同題、不同 seed 不同題）且唯一解', r['same'] and r['diff'] and r['uniq'] == 1, r)
    r = page.evaluate("""() => { const G = CT.Lines.Gen;
        return [G.solve({ w: 3, h: 3, ends: [[0,0,2,2]] }, 9).count, G.solve({ w: 3, h: 3, ends: [[0,1,2,1]], bridges: [[1,1]] }, 9).count]; }""")
    ok('解題器能數出多解（3×3 對角 = 2 解）、無解（單線過橋 = 0 解）', r == [2, 0], r)

    # ---------------- 標題 / 說明 ----------------
    def screen():
        return page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Lines.Art.make(); const rows = [];
            for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
              if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
            return rows; }""")
    txt = '\n'.join(screen())
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    page.evaluate('() => { CT.Lines.dev.g().sel = 2; NES.Input.inject(1, 1); __nes.step(3); }')
    rows = screen()
    body = [i for i in range(4, 26) if rows[i].strip()]
    ok('說明頁：規則（星橋 / 星門 / 星鏡）寫出來、段落之間空一列', all(k in '\n'.join(rows) for k in ('BRIDGE', 'GATE', 'MIRROR')) and all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)
    ok('說明頁文字不超出 32 欄（每列最後一欄空）', all(r_[31] == ' ' for r_ in rows), [r_ for r_ in rows if r_[31] != ' '])
    r = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Lines.Art.make(); const at = (c, r) => [p.getTile(0, c, r), p.getTile(0, c + 1, r), p.getTile(0, c, r + 1), p.getTile(0, c + 1, r + 1)].join();
        return { b: at(2, 10) === A.cell('B00').join() && at(4, 10) === A.cell('B23').join(), g: at(2, 14) === A.cell('G0').join(), m: at(2, 18) === A.cell('M10').join() }; }""")
    ok('P2-1 說明頁範例圖 = 遊戲內同一組格子磁磚（空橋 / 過橋 / 星門 / 星鏡）', r['b'] and r['g'] and r['m'], r)

    # ---------------- 遊玩操作 ----------------
    page.evaluate('() => { CT.Lines.dev.start(0); __nes.step(2); }')
    s0 = st(page)
    page.evaluate('() => { const g = CT.Lines.dev.g(); g.cx = 0; g.cy = 0; NES.Input.inject(128, 30); for (let i = 0; i < 30; i++) __nes.step(1); __nes.step(2); }')
    s1 = st(page)
    ok('游標按住連發：30 幀 = 第 1 幀 + 第 13/17/21/25/29 幀（6 格，5×5 盤撞邊停在 x=4）', s1['cx'] == min(4, 6), (s0['cx'], s1['cx']))
    page.evaluate('() => { const g = CT.Lines.dev.g(); g.cx = 0; g.cy = 0; NES.Input.inject(32, 13); for (let i = 0; i < 13; i++) __nes.step(1); __nes.step(2); }')
    ok('游標首延遲：按住 13 幀 = 2 格（第 1 幀 + 第 13 幀）', st(page)['cy'] == 2, st(page)['cy'])

    # 用第 1 關的正解：在端點下筆、走 2 格、走回 1 格
    sol = page.evaluate('() => CT.Lines.dev.sol()')
    w = st(page)['w']

    def dir_to(p, q):
        if q == p - w: return 'U'
        if q == p + w: return 'D'
        if q == p + 1: return 'R'
        return 'L'
    p0 = sol[0]
    page.evaluate('(c) => { const g = CT.Lines.dev.g(); g.cx = c % g.P.w; g.cy = Math.floor(c / g.P.w); }', p0[0])
    tap(page, A)
    ok('A 在星珠上下筆（pen = 該色）', st(page)['pen'] == 0, st(page)['pen'])
    tap(page, DB[dir_to(p0[0], p0[1])])
    tap(page, DB[dir_to(p0[1], p0[2])])
    ln = page.evaluate('() => CT.Lines.dev.paths()[0].length')
    tap(page, DB[dir_to(p0[2], p0[1])])
    ln2 = page.evaluate('() => CT.Lines.dev.paths()[0].length')
    ok('下筆後十字鍵延伸線、走回上一格 = 收回', ln == 3 and ln2 == 2, (ln, ln2))
    look = page.evaluate('(c) => CT.Lines.dev.cellLook(c)', p0[1])
    ok('線段格畫成「中心 + 兩方向」的磁磚、屬性 = 該色調色盤組', look[0].startswith('L') and look[1] == page.evaluate('() => CT.Lines.dev.puzzle().colors[0] >> 1'), look)
    # 完成第 0 色
    for i in range(1, len(p0) - 1):
        tap(page, DB[dir_to(p0[i], p0[i + 1])])
    s = st(page)
    ok('走到同色另一顆星珠 = 連成、自動收筆', s['links'] >= 1 and s['pen'] == -1, s)
    # SELECT 復原（放開才算）
    page.evaluate('() => { NES.Input.inject(4, 1); __nes.step(1); __nes.step(2); }')
    ok('SELECT（放開時）= 復原（回到下筆前）', page.evaluate('() => CT.Lines.dev.paths()[0].length') == 0)
    page.evaluate('() => { const g = CT.Lines.dev.g(); g.paths[0] = CT.Lines.dev.sol()[0].slice(); g.undo = [{ paths: g.paths.map(p => []) }]; NES.Input.inject(4, 5); __nes.step(4); NES.Input.inject(12, 3); __nes.step(3); NES.Input.inject(0, 1); __nes.step(3); }')
    ok('SELECT 按著時碰到 START（回選單手勢）⇒ 不復原', page.evaluate('() => CT.Lines.dev.paths()[0].length') > 0 and st(page)['undo'] == 1)
    page.evaluate('() => { const g = CT.Lines.dev.g(); if (g.paused) { NES.Input.inject(8, 1); __nes.step(2); } }')
    # 切斷：別色線走進第 0 色的線格
    cut = page.evaluate("""() => { const g = CT.Lines.dev.g(), P = g.P, s0 = CT.Lines.dev.sol()[0]; g.paths[0] = s0.slice();
        // 找一顆別色端點，其鄰格在第 0 色線上（不是端點）
        for (let k = 1; k < P.ncol; k++) for (const e of [P.endA[k], P.endB[k]]) {
          const x = e % P.w, y = Math.floor(e / P.w);
          for (const [d, dx, dy] of [[16,0,-1],[32,0,1],[64,-1,0],[128,1,0]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= P.w || ny >= P.h) continue;
            const c = ny * P.w + nx, i = s0.indexOf(c); if (i > 0 && i < s0.length - 1 && !P.bridge[c] && P.twin[c] < 0) return { k, e, d, c, i }; } }
        return null; }""")
    if cut:
        page.evaluate('(c) => { const g = CT.Lines.dev.g(); g.pen = -1; g.cx = c.e % g.P.w; g.cy = Math.floor(c.e / g.P.w); }', cut)
        tap(page, A)
        tap(page, cut['d'])
        r = page.evaluate('() => CT.Lines.dev.paths().map(p => p.length)')
        ok('切斷：走進別色的線 ⇒ 那條線從那格起被剪掉', r[0] == cut['i'] and r[cut['k']] == 2, (r, cut))
    else:
        ok('切斷：走進別色的線 ⇒ 那條線從那格起被剪掉', False, '找不到測試位置')
    # B 點一下：收筆；再點一下：清掉游標下那條線
    tap(page, B)
    pen_after = st(page)['pen']
    tap(page, B)
    ok('B 點一下 = 收筆、再點 = 清掉游標下那條線', pen_after == -1 and page.evaluate('(k) => CT.Lines.dev.paths()[k].length', cut['k'] if cut else 1) == 0)
    # 提示：B 長按 30 幀
    h0 = st(page)['hints']
    page.evaluate('() => { NES.Input.inject(2, 32); __nes.step(32); NES.Input.inject(0, 1); __nes.step(2); }')
    s = st(page)
    ok('B 長按 30 幀 = 提示（一條線畫成正解、提示數 +1）', s['hints'] == h0 + 1 and s['links'] >= 1, s)

    # ---------------- 星橋 / 星門 ----------------
    br = page.evaluate("""() => { const L = CT.Lines.LEVELS, G = CT.Lines.Gen; for (let i = 10; i < L.length; i++) { const lv = G.decode(L[i].code); if (lv.bridges.length && !lv.gates.length) return i; } return -1; }""")
    page.evaluate('(i) => { CT.Lines.dev.start(i); __nes.step(2); }', br)
    t = page.evaluate("""() => { const g = CT.Lines.dev.g(), P = g.P, b = P.L.bridges[0], c = b[1] * P.w + b[0];
        for (let k = 0; k < P.ncol; k++) { const s = P.sol[k], i = s.indexOf(c); if (i > 0) {
          g.paths[k] = s.slice(0, i + 1); g.pen = k; g.cx = b[0]; g.cy = b[1];
          const horiz = Math.abs(s[i] - s[i - 1]) === 1; return { k, i, perp: horiz ? 16 : 128, perp2: horiz ? 32 : 64, straight: s[i + 1] - s[i] === 1 ? 128 : s[i + 1] - s[i] === -1 ? 64 : s[i + 1] > s[i] ? 32 : 16 }; } }
        return null; }""")
    tap(page, t['perp'])
    tap(page, t['perp2'])
    l1 = page.evaluate('(k) => CT.Lines.dev.paths()[k].length', t['k'])
    tap(page, t['straight'])
    l2 = page.evaluate('(k) => CT.Lines.dev.paths()[k].length', t['k'])
    ok('星橋：在橋上不准轉彎，只能直直穿過', l1 == t['i'] + 1 and l2 == t['i'] + 2, (l1, l2, t))
    gt = page.evaluate("""() => { const L = CT.Lines.LEVELS, G = CT.Lines.Gen; for (let i = 20; i < L.length; i++) { const lv = G.decode(L[i].code); if (lv.gates.length) return i; } return -1; }""")
    page.evaluate('(i) => { CT.Lines.dev.start(i); __nes.step(2); }', gt)
    t = page.evaluate("""() => { const g = CT.Lines.dev.g(), P = g.P;
        for (let k = 0; k < P.ncol; k++) { const s = P.sol[k]; for (let i = 1; i < s.length - 1; i++) if (P.twin[s[i]] === s[i + 1]) {
          g.paths[k] = s.slice(0, i); g.pen = k; g.cx = s[i - 1] % P.w; g.cy = Math.floor(s[i - 1] / P.w);
          const d = s[i] - s[i - 1]; return { k, i, gin: s[i], gout: s[i + 1], m: d === 1 ? 128 : d === -1 ? 64 : d > 0 ? 32 : 16 }; } }
        return null; }""")
    tap(page, t['m'])
    s = st(page)
    p = page.evaluate('(k) => CT.Lines.dev.paths()[k]', t['k'])
    ok('星門：走進一扇門 ⇒ 線從另一扇門出來、游標跳到另一扇門', p[-2:] == [t['gin'], t['gout']] and s['cy'] * s['w'] + s['cx'] == t['gout'], (p[-3:], t))

    # ---------------- fix-r7：星鏡（自創機關）/ 機關外觀 / 教學頁 / 選關排版 / HUD ----------------
    v = page.evaluate("""() => { const G = CT.Lines.Gen, L = CT.Lines.LEVELS, out = { mirLv: 0, first: -1, ok: 0, bad: [] };
        for (let i = 0; i < L.length; i++) { const lv = G.decode(L[i].code); if (!lv.mirrors.length) continue; out.mirLv++; if (out.first < 0) out.first = i;
          const w = lv.w, sol = G.solve(lv, 1).sol, mc = lv.mirrors.map(m => [m[1] * w + m[0], m[2]]); let good = true;
          for (const [c, t] of mc) { const p = sol.find(q => q.indexOf(c) > 0 && q.indexOf(c) < q.length - 1); if (!p) { good = false; continue; }
            const j = p.indexOf(c), side = (a, b) => b === a - w ? 0 : b === a + 1 ? 1 : b === a + w ? 2 : 3;
            if (G.mirPartner(t, side(c, p[j - 1])) !== side(c, p[j + 1])) good = false; }
          if (good) out.ok++; else out.bad.push(i + 1); }
        return out; }""")
    ok('P3-7 自創機關「星鏡」：後段 ≥ 10 關（第 26 關起），每面鏡子的正解都照鏡面反彈', v['mirLv'] >= 10 and v['first'] == 25 and v['ok'] == v['mirLv'], v)
    r = page.evaluate(r"""() => { const G = CT.Lines.Gen;
        // 獨立暴力列舉（逐色 DFS：一般格一次、橋格 H/V 各一次且直行、星鏡照鏡面反彈、星門傳送）vs 解題器數解
        function brute(L, cap) { const w = L.w, h = L.h, N = w * h, endAt = new Int8Array(N).fill(-1), br = new Uint8Array(N), tw = new Int16Array(N).fill(-1), mr = new Int8Array(N);
          L.ends.forEach((e, k) => { endAt[e[1]*w+e[0]] = k; endAt[e[3]*w+e[2]] = k; }); (L.bridges||[]).forEach(b => br[b[1]*w+b[0]] = 1);
          (L.gates||[]).forEach(q => { const a = q[1]*w+q[0], b = q[3]*w+q[2]; tw[a] = b; tw[b] = a; }); (L.mirrors||[]).forEach(m => mr[m[1]*w+m[0]] = m[2]);
          const u = new Uint8Array(N), uH = new Uint8Array(N), uV = new Uint8Array(N), D = [[0,-1],[1,0],[0,1],[-1,0]]; let cnt = 0;
          const free = (c, d) => br[c] ? ((d & 1) ? !uH[c] : !uV[c]) : !u[c], mark = (c, d, v) => { if (br[c]) { if (d & 1) uH[c] = v; else uV[c] = v; } else u[c] = v; };
          const full = () => { for (let c = 0; c < N; c++) { if (br[c] ? (!uH[c] || !uV[c]) : !u[c]) return false; } return true; };
          function color(k) { if (cnt >= cap) return; if (k === L.ends.length) { if (full()) cnt++; return; } const e = L.ends[k], a = e[1]*w+e[0]; u[a] = 1; step(k, a, -1, e[3]*w+e[2]); u[a] = 0; }
          function step(k, c, inD, t0) { let ds = [0,1,2,3]; if (br[c] && inD >= 0) ds = [inD]; if (mr[c] && inD >= 0) { const ps = G.mirPartner(mr[c], (inD + 2) % 4); ds = ps < 0 ? [] : [ps]; }
            for (const d of ds) { const x = c % w + D[d][0], y = ((c / w) | 0) + D[d][1]; if (x < 0 || y < 0 || x >= w || y >= h) continue; const t = y * w + x;
              if (t === t0) { u[t] = 1; color(k + 1); u[t] = 0; continue; } if (endAt[t] >= 0 || !free(t, d)) continue;
              if (tw[t] >= 0) { const t2 = tw[t]; if (u[t2]) continue; u[t] = 1; u[t2] = 1; step(k, t2, -1, t0); u[t] = 0; u[t2] = 0; continue; }
              mark(t, d, 1); step(k, t, d, t0); mark(t, d, 0); } }
          color(0); return cnt; }
        let n = 0, agree = 0, multi = 0, bad = [];
        for (let s = 1; s <= 200; s++) { const R = G.rng(s * 31), cells = [...Array(16).keys()].sort(() => R() - 0.5), mx = 1 + Math.floor(R() * 2), my = 1 + Math.floor(R() * 2), mc = my * 4 + mx;
          const pool = cells.filter(c => c !== mc), ends = [[pool[0]%4, pool[0]>>2, pool[1]%4, pool[1]>>2], [pool[2]%4, pool[2]>>2, pool[3]%4, pool[3]>>2]];
          const L = { w: 4, h: 4, ends, mirrors: [[mx, my, 1 + Math.floor(R() * 2)]] }, a = G.solve(L, 99).count, b = brute(L, 99); n++; if (a === b) agree++; else bad.push(s); if (a >= 2) multi++; }
        for (let s = 1; s <= 24; s++) { const sp = [{ w: 5, h: 5, minLen: 3, maxLen: 8, mirrors: 2 }, { w: 5, h: 5, minLen: 3, maxLen: 9, mirrors: 1, bridges: 1 }, { w: 5, h: 5, minLen: 3, maxLen: 9, mirrors: 2, gates: 1 }][s % 3];
          const L = G.generate(sp, s * 977, 60); if (!L) continue; const a = G.solve(L, 9).count, b = brute(L, 9); n++; if (a === b && a === 1) agree++; else bad.push('g' + s); }
        return { n, agree, multi, bad }; }""")
    ok('星鏡：解題器 vs 獨立暴力列舉計數一致（4×4 隨機盤含 0 / 1 / 多解 + 5×5 產生盤唯一解）', r['n'] >= 200 and r['agree'] == r['n'] and r['multi'] >= 5, r)
    r = page.evaluate("""() => { const G = CT.Lines.Gen, sp = { w: 6, h: 6, minLen: 3, maxLen: 9, mirrors: 2 };
        const a = G.generate(sp, 777), b = G.generate(sp, 777); return { same: G.encode(a) === G.encode(b), mir: a.mirrors.length, uniq: G.solve(a, 2).count, rt: G.encode(G.decode(G.encode(a))) === G.encode(a) }; }""")
    ok('星鏡：產生器 spec.mirrors 可重現、唯一解、關卡字串第 6 欄編碼 / 解碼來回一致', r['same'] and r['mir'] == 2 and r['uniq'] == 1 and r['rt'], r)
    mi = v['first']
    page.evaluate('(i) => { CT.Lines.dev.start(i); __nes.step(2); }', mi)
    t = page.evaluate("""() => { const g = CT.Lines.dev.g(), P = g.P, w = P.w;
        for (let k = 0; k < P.ncol; k++) { const s = P.sol[k]; for (let i = 1; i < s.length - 1; i++) if (P.mirror[s[i]]) {
          g.paths[k] = s.slice(0, i + 1); g.pen = k; g.cx = s[i] % w; g.cy = Math.floor(s[i] / w);
          const dm = (a, b) => b === a - w ? 16 : b === a + w ? 32 : b === a + 1 ? 128 : 64, inD = dm(s[i - 1], s[i]);
          const wrong = [16, 32, 64, 128].filter(m => m !== dm(s[i], s[i + 1]) && m !== dm(s[i], s[i - 1]) && (s[i] % w + (m === 128 ? 1 : m === 64 ? -1 : 0)) >= 0 && (s[i] % w + (m === 128 ? 1 : m === 64 ? -1 : 0)) < w);
          return { k, i, right: dm(s[i], s[i + 1]), wrong: wrong[0], look: CT.Lines.dev.cellLook(s[i]) }; } }
        return null; }""")
    tap(page, t['wrong'])
    l1 = page.evaluate('(k) => CT.Lines.dev.paths()[k].length', t['k'])
    msg = page.evaluate('() => CT.Lines.dev.g().msg')
    tap(page, t['right'])
    l2 = page.evaluate('(k) => CT.Lines.dev.paths()[k].length', t['k'])
    ok('星鏡：在鏡格上只能照鏡面方向出去（別的方向擋下並提示），照鏡面 ⇒ 延伸', l1 == t['i'] + 1 and l2 == t['i'] + 2 and 'MIRROR' in msg, (l1, l2, msg, t))
    ok('星鏡：有線經過畫成「轉角線 + 鏡面」磁磚（屬性 = 線色組）', t['look'][0].startswith('M') and t['look'][0][-1] in 'AB', t['look'])
    r = page.evaluate("""() => { const g = CT.Lines.dev.g(), P = g.P; for (let k = 0; k < P.ncol; k++) g.paths[k] = P.sol[k].slice(); g.time = 99999; CT.Lines.dev.refresh();
        const ok1 = CT.Lines.dev.solved(); return { ok1 }; }""")
    ok('星鏡關：照正解畫完 ⇒ 判定完成', r['ok1'], r)
    # 機關外觀：空的機關用亮色（色 3）、各自不同的調色盤組；色 1 = 亮灰 $10
    pal = page.evaluate('() => { const p = __nes.nes().ppu; return [0, 1, 2, 3].map(i => Array.from(p.getBgPalette(i))); }')
    ok('P2-1 色 1（格點 / 有線時的機關結構）= 亮灰 $10，四組一致', all(q[1] == 0x10 for q in pal), pal)
    r = page.evaluate("""() => { CT.Lines.dev.start(10); __nes.step(2); const P = CT.Lines.dev.puzzle(), b = P.L.bridges[0], c = b[1] * P.w + b[0];
        const l0 = CT.Lines.dev.cellLook(c); const g = CT.Lines.dev.g(); const t0 = g.t; let keys = new Set();
        for (let f = 0; f < 70; f++) { __nes.step(1); keys.add(CT.Lines.dev.cellLook(c)[0]); }
        const lv = CT.Lines.LEVELS, G = CT.Lines.Gen; CT.Lines.dev.start(20); __nes.step(2); const P2 = CT.Lines.dev.puzzle(), q = P2.L.gates[0];
        const gl = CT.Lines.dev.cellLook(q[1] * P2.w + q[0]); CT.Lines.dev.start(25); __nes.step(2); const P3 = CT.Lines.dev.puzzle(), m = P3.L.mirrors[0];
        const ml = CT.Lines.dev.cellLook(m[1] * P3.w + m[0]); return { l0, keys: [...keys], gl, ml }; }""")
    ok('P2-1 空星橋 = 白欄杆紅柱（組 0 色 3），還沒被兩線填滿時每 32 幀閃一次（換一組磁磚）', r['l0'] == ['B00', 0] and set(r['keys']) == {'B00', 'B00x'}, r)
    ok('P2-1 空星門 = 青色傳送環（組 2）、空星鏡 = 金色斜鏡（組 1）——三種機關各自一種亮色', r['gl'] == ['G0', 2] and r['ml'][1] == 1 and r['ml'][0] in ('M10', 'M20'), r)
    px = page.evaluate('() => ({ bg: CT.Lines.Art.make().bg.count })')
    ok('CHR：加上星鏡 / 閃爍橋之後背景 bank 仍 ≤ 256', px['bg'] <= 256, px)
    # 教學頁
    page.evaluate('() => { localStorage.removeItem("nes.cart3.lines.seen"); CT.Lines.dev.begin(10); __nes.step(3); }')
    s1 = st(page)
    rows = screen()
    tut_txt = '\n'.join(rows)
    tutor_cells = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Lines.Art.make(); const want = new Set([...A.cell('B00'), ...A.cell('B23')]); let n = 0;
        for (let r = 0; r < 30; r++) for (let c = 0; c < 32; c++) if (want.has(p.getTile(0, c, r))) n++; return n; }""")
    ok('P2-1 第 11 關（第一座星橋）開場先跳教學頁：示意圖（空 / 解好）+ 說明 + A 關閉', s1['mode'] == 'tutor' and s1['tutor'] == 'bridge' and 'NEW: STAR BRIDGE' in tut_txt and 'GOT IT' in tut_txt and tutor_cells >= 8, (s1['mode'], s1['tutor'], tutor_cells))
    page.evaluate('() => __nes.step(15)')
    tap(page, A, 3)
    s2 = st(page)
    page.evaluate('() => { CT.Lines.dev.begin(10); __nes.step(3); }')
    s3 = st(page)
    ok('教學頁按 A ⇒ 進入關卡；看過就存檔，下次不再跳', s2['mode'] == 'play' and s2['level'] == 10 and s3['mode'] == 'play' and page.evaluate('() => CT.load("lines", "seen", {}).bridge') == 1, (s2['mode'], s3['mode']))
    page.evaluate('() => { CT.Lines.dev.begin(20); __nes.step(3); }')
    sg = st(page)
    tg = '\n'.join(screen())
    page.evaluate('() => __nes.step(15)')
    tap(page, A, 3)
    page.evaluate('() => { CT.Lines.dev.begin(25); __nes.step(3); }')
    sm = st(page)
    tm = '\n'.join(screen())
    page.evaluate('() => __nes.step(15)')
    tap(page, A, 3)
    sm2 = st(page)
    ok('P2-1 第 21 關（第一對星門）開場教學', sg['mode'] == 'tutor' and sg['tutor'] == 'gate' and 'NEW: STAR GATE' in tg, sg['tutor'])
    ok('P3-7 第 26 關（第一面星鏡）開場教學、A 關閉後進關', sm['tutor'] == 'mirror' and 'NEW: STAR MIRROR' in tm and sm2['mode'] == 'play' and sm2['level'] == 25, (sm['tutor'], sm2['mode']))
    page.evaluate('() => { CT.Lines.dev.begin(30); __nes.step(3); }')
    ok('三種機關都看過 ⇒ 後面的關卡直接開始', st(page)['mode'] == 'play')
    # 選關排版：36 個關卡號都在名稱表上
    page.evaluate('() => { CT.Lines.dev.select(); __nes.step(3); }')
    rows = screen()
    seen_ids = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Lines.Art.make(), out = [];
        for (let i = 0; i < CT.Lines.LEVELS.length; i++) { const q = CT.Lines.dev.selPos(i), s = String(i + 1).padStart(2, '0');
          if (p.getTile(0, q[0], q[1]) === A.ch(s[0]) && p.getTile(0, q[0] + 1, q[1]) === A.ch(s[1])) out.push(i + 1); } return out; }""")
    ok('P2-2 選關：36 個關卡號全部在名稱表上（不被說明列蓋掉）', len(seen_ids) == 36, seen_ids)
    page.evaluate('() => { const g = CT.Lines.dev.g(); g.lsel = 29; NES.Input.inject(32, 1); __nes.step(4); }')
    rows2 = screen()
    seen2 = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Lines.Art.make(); let n = 0;
        for (let i = 0; i < 36; i++) { const q = CT.Lines.dev.selPos(i), s = String(i + 1).padStart(2, '0'); if (p.getTile(0, q[0], q[1]) === A.ch(s[0]) && p.getTile(0, q[0] + 1, q[1]) === A.ch(s[1])) n++; } return n; }""")
    ok('P2-2 游標移到第 36 關：說明列寫出 LV 36 / 機關，關卡號仍全在', st(page)['lsel'] == 35 and any('LV 36' in r_ for r_ in rows2) and any('MIRROR' in r_ for r_ in rows2) and seen2 == 36, [r_ for r_ in rows2 if 'LV' in r_])
    ok('P3-5 選關 / 遊玩畫面第 1 列（y=0）沒有 HUD 字', rows[1].strip() == '', rows[1])
    page.evaluate('() => { CT.Lines.dev.start(30); __nes.step(3); }')
    rows = screen()
    ok('P3-5 遊玩 HUD：第 1 列空、標題 / 時間在第 2 列、9×9 盤也不和 HUD 重疊', rows[1].strip() == '' and 'LV 31' in rows[2] and 'TIME' in rows[2] and 'LINKS' in rows[23], (rows[1], rows[2], rows[23]))

    # ---------------- 過關 / 紀錄 / 暫停 / 密技 ----------------
    page.evaluate('() => { CT.Lines.dev.start(0); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Lines.dev.g(); const sol = CT.Lines.dev.sol(); for (let k = 0; k < sol.length; k++) { g.paths[k] = sol[k].slice(); }
        g.time = 300; g.paths[0] = sol[0].slice(0, -1); g.pen = 0; const P = g.P, h = sol[0][sol[0].length - 2], e = sol[0][sol[0].length - 1];
        g.cx = h % P.w; g.cy = Math.floor(h / P.w); const d = e - h; NES.Input.inject(d === 1 ? 128 : d === -1 ? 64 : d > 0 ? 32 : 16, 1); __nes.step(1); __nes.step(3);
        return { s: GAME.state().s, stars: CT.load('lines', 'stars', []), best: CT.get('lines').bestText() }; }""")
    ok('全部連成且填滿 ⇒ 過關（★★★：沒提示、在標準時間內）', r['s']['mode'] == 'clear' and r['s']['stars'] == 3, r['s'])
    ok('每關最佳星數存檔、bestText 顯示過關數（ 01/36）', r['stars'][0] == 3 and r['best'] == ' 01/36', r)
    page.evaluate('() => { CT.Lines.dev.start(1); __nes.step(2); }')
    r = page.evaluate("""() => { const t0 = GAME.state().s.time; NES.Input.inject(8, 1); __nes.step(1); __nes.step(30); const s = GAME.state().s, mp = __nes.nes().music.isPaused();
        NES.Input.inject(8, 1); __nes.step(2); return { paused: s.paused, frozen: s.time === t0 + 1 || s.time === t0, mp, after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('START 暫停：時間凍結', r['paused'] and r['frozen'], r)
    ok('§6-2 暫停 = BGM 暫停，恢復接續', r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    r = page.evaluate('() => { const c = CT.cheat(); __nes.step(2); const s = GAME.state().s; return { c, links: s.links, cheat: s.cheatUsed, goal: GAME.state().goal }; }')
    ok('§6-1 遊玩中密技 = 立刻畫好一條線；用過之後 goal 一律 false', r['c'] and r['links'] >= 1 and r['cheat'] and r['goal'] is False, r)

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    rr = page.evaluate(RUN, {'n': 20000, 'until': 'goal'})
    ok('機器人（解題器 + 一格一格移動游標，不開密技）：前 10 關全破 → goal', rr['goal'] and len(rr['s']['goalSet']) >= 10, {'f': rr['f'], 'set': rr['s']['goalSet']})
    ok('機器人全程：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', rr['ml'] <= 8 and rr['over'] == 0 and rr['peak'] <= 160, {'ml': rr['ml'], 'over': rr['over'], 'peak': rr['peak']})
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d' % (rr['f'], rr['ml'], rr['over'], rr['peak']))
    lint = page.evaluate('() => { __nes.render(); const r = __nes.lint(); return { ok: r.ok !== false, colors: r.colors }; }')
    ok('過關畫面 lint 綠（≤ 25 色）', lint['ok'], lint)
    rr2 = page.evaluate("""() => { const out = []; for (const lv of [25, 35]) { CT.Lines.dev.start(lv); __nes.step(2); let f = 0, ml = 0, over0 = __nes.stats().budget.overFrames | 0;
          while (f < 6000 && GAME.state().s.mode === 'play') { __nes.step(1); f++; ml = Math.max(ml, __nes.stats().maxSpritesLine | 0); }
          out.push({ lv: lv + 1, mode: GAME.state().s.mode, f, ml, over: (__nes.stats().budget.overFrames | 0) - over0 }); } return out; }""")
    ok('機器人照解題器一格一格操作：第 26 關（星鏡）與第 36 關（9×9 橋 + 門 + 鏡）都能過關、每線 ≤ 8、overFrames 0', all(x['mode'] == 'clear' and x['ml'] <= 8 and x['over'] == 0 for x in rr2), rr2)

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_lines: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
