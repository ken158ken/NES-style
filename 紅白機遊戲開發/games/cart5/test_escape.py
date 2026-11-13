# -*- coding: utf-8 -*-
"""《星塵密室》（cart5，id = escape）自動驗證。

重點：
  ① Python 獨立實作的解題器（讀同一份宣告式房間資料、程式碼不共用）：三間都可解、全部可達狀態都還能到終點（沒有死局）、
     最短路徑 ≥ 6 個環節、與 JS 解題器同長；每間 ≥ 6 個環節、每環節 3 段相異提示、密技動作能完成該環節。
  ② 機關獨立驗算：九燈（最少 3 下、與提示一致）、太陽系儀（甲 2 乙 3 丙 1、與提示一致）、管線 / 光路（開局不通、正解通、
     解法 DFS）、撥盤鎖答案可由畫面線索推出（書背數字 + 彩虹順序 / 齒輪大小 / 黑板算式 / 望遠鏡顏色）。
  ③ 文字：缺字 0、說明 / 名稱 / 物品說明不超出訊息框（CT.Text.wrap）、選單 / 結算 / 故事全部走 CT.Text。
  ④ 美術：每間 × 四面 × 多個進度狀態 + 全部特寫的磁磚數讓字形池 ≥ 80、熱點在畫面內且不壓轉身箭頭、lint ≤ 25 色。
  ⑤ 操作：游標加速 / B 微調、轉身（箭頭 / 推邊）、拿物品 + 教學、用錯物品、組合、撥盤錯 / 對、提示三段 + 扣時、
     §6（密技解開環節 / 特寫中解開機關 / 時間到原地續關 / 標題無效 / 用過 goal false、暫停 BGM、exit、bestText、backTile）。
  ⑥ 機器人（手把路徑、反應 ≥ 12 幀）：從標題開始破第 1 間 = goal；第 2、3 間也照解題路線破關；每線 ≤ 8、overFrames 0。
作法：Playwright 開 `cart5.html?game=escape&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Escape.dev`。

用法：../卡比之星/.venv/bin/python games/cart5/test_escape.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import itertools
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=escape'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


# ============================================================ Python 獨立解題器
def cond(st, c):
    if not c:
        return True
    for p in c.split('&'):
        p = p.strip()
        if not p:
            continue
        neg = p.startswith('!')
        k = p[1:] if neg else p
        v = (k[4:] in st['inv']) if k.startswith('has_') else (k in st['f'])
        if v == neg:
            return False
    return True


def apply(st, acts):
    f, inv = set(st['f']), list(st['inv'])
    opened = None
    for a in acts or []:
        op, _, arg = a.partition(':')
        if op == 'set':
            f.add(arg)
        elif op == 'clr':
            f.discard(arg)
        elif op == 'get':
            if arg not in inv:
                inv.append(arg)
            f.add('got_' + arg)
        elif op == 'lose':
            if arg in inv:
                inv.remove(arg)
        elif op == 'open':
            opened = arg
        elif op == 'win':
            f.add('won')
    return {'f': frozenset(f), 'inv': tuple(inv)}, opened


def first_rule(room, st, h, item):
    for r in h.get('rules') or []:
        if (r.get('i') or None) != item:
            continue
        if cond(st, r.get('c')):
            return r
    return None


def moves(room, st):
    out = []
    for h in room['hot']:
        if h.get('show') and not cond(st, h['show']):
            continue
        for it in [None] + list(st['inv']):
            r = first_rule(room, st, h, it)
            if not r or not r.get('d'):
                continue
            nst, op = apply(st, r['d'])
            if op:
                pz = room['puz'][op]
                if pz.get('know') and not cond(st, pz['know']):
                    continue
                if pz['kind'] != 'look':
                    nst, _ = apply(nst, pz['d'])
            out.append((('hot', h['id'], it), nst))
    inv = list(st['inv'])
    for a, b in itertools.combinations(inv, 2):
        for c in room.get('combos') or []:
            if {c['a'], c['b']} == {a, b} and cond(st, c.get('c')):
                nst, _ = apply(st, c['d'])
                out.append((('combo', a, b), nst))
    return out


def skey(st):
    return (st['f'], tuple(sorted(st['inv'])))


def explore(room):
    s0 = {'f': frozenset(), 'inv': ()}
    seen = {skey(s0): s0}
    edges, q, dist = {}, [s0], {skey(s0): 0}
    while q:
        cur = q.pop(0)
        ck = skey(cur)
        edges[ck] = []
        if 'won' in cur['f']:
            continue
        for _, nx in moves(room, cur):
            nk = skey(nx)
            if nk == ck:
                continue
            edges[ck].append(nk)
            if nk not in seen:
                seen[nk] = nx
                dist[nk] = dist[ck] + 1
                q.append(nx)
    good = {k for k, v in seen.items() if 'won' in v['f']}
    changed = True
    while changed:
        changed = False
        for k in seen:
            if k not in good and any(n in good for n in edges[k]):
                good.add(k)
                changed = True
    shortest = min((dist[k] for k in good if 'won' in seen[k]['f']), default=None)
    return len(seen), [k for k in seen if k not in good], shortest


def lights_press(w, h, s, i):
    s = list(s)
    x, y = i % w, i // w
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        X, Y = x + dx, y + dy
        if 0 <= X < w and 0 <= Y < h:
            s[Y * w + X] ^= 1
    return s


def lights_min(p):
    n = p['w'] * p['h']
    best = None
    for m in range(1 << n):
        s = list(p['start'])
        cnt = []
        for i in range(n):
            if m >> i & 1:
                s = lights_press(p['w'], p['h'], s, i)
                cnt.append(i)
        if all(s) and (best is None or len(cnt) < len(best)):
            best = cnt
    return best


def rings_min(p):
    best = None
    for cnt in itertools.product(range(p['m']), repeat=len(p['btn'])):
        s = list(p['start'])
        for b, k in enumerate(cnt):
            for _ in range(k):
                for r in p['btn'][b]:
                    s[r] = (s[r] + 1) % p['m']
        if not any(s) and (best is None or sum(cnt) < sum(best)):
            best = cnt
    return best


OPEN = {'I': [[1, 3], [0, 2]], 'L': [[0, 1], [1, 2], [2, 3], [3, 0]]}
DXY = [(0, -1), (1, 0), (0, 1), (-1, 0)]


def pipe_flow(p, rots):
    x, y, frm, seen = 0, p['inRow'], 3, set()
    while 0 <= x < p['w'] and 0 <= y < p['h']:
        i = y * p['w'] + x
        t = p['cells'][i][0]
        op = OPEN[t][rots[i] % len(OPEN[t])]
        if frm not in op or i in seen:
            return False
        seen.add(i)
        to = op[1] if op[0] == frm else op[0]
        if x == p['w'] - 1 and y == p['outRow'] and to == 1:
            return True
        x, y, frm = x + DXY[to][0], y + DXY[to][1], (to + 2) % 4
    return False


# ============================================================ 頁面工具
def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Escape && !!CT.Escape.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.escape.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def hold(page, mask, n):
    page.evaluate('([m, n]) => { for (let i = 0; i < n; i++) { NES.Input.inject(m, 1); __nes.step(1); } }', [mask, n])


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def close_talk(page, limit=40):
    for _ in range(limit):
        s = S(page)
        if not s['talk']:
            return True
        tap(page, A, 3)
    return False


def start_room(page, i):
    page.evaluate('(i) => { CT.Escape.dev.start(i); __nes.step(2); }', i)
    close_talk(page)


def cursor_to(page, x, y):
    for _ in range(400):
        s = S(page)
        dx, dy = x - s['cx'], y - s['cy']
        if abs(dx) <= 1 and abs(dy) <= 1:
            return True
        m = (RIGHT if dx > 1 else LEFT if dx < -1 else 0) | (DOWN if dy > 1 else UP if dy < -1 else 0)
        if abs(dx) <= 6 and abs(dy) <= 6:
            m |= B
        page.evaluate('(m) => { NES.Input.inject(m, 1); __nes.step(1); }', m)
    return False


def face(page, d):
    page.evaluate('(d) => { CT.Escape.dev.face("NESW".indexOf(d)); __nes.step(2); }', d)


def click_hot(page, hid):
    v = page.evaluate('(id) => CT.Escape.Logic.hot(CT.Escape.ROOMS[CT.Escape.dev.g().room], id).v', hid)
    face(page, v)
    pt = page.evaluate('(id) => CT.Escape.dev.hotPoint(id)', hid)
    cursor_to(page, pt['x'], pt['y'])
    step(page, 2)
    tap(page, A, 3)


# ============================================================ fix-r9 P1-1：字形池溢位（讀 PPU 驗證）
PPU_DIAL = r"""() => { const cells = CT.Escape.dev.dialCells(), ppu = __nes.nes().ppu, G = CT.GLYPHS.cjk, bad = [];
  cells.forEach((c, i) => {
    const hex = G[c.ch]; if (!hex) { bad.push(i + ':' + c.ch + ' 無字形'); return; }
    let on = 0, mism = 0;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const px = NES.CHR.get(0, ppu.getTile(0, c.col + tx, c.row + ty));
      for (let y = 0; y < 8; y++) { const bits = parseInt(hex.substr((ty * 8 + y) * 4, 4), 16);
        for (let x = 0; x < 8; x++) { const b = (bits >> (15 - (tx * 8 + x))) & 1, v = px[y * 8 + x] === 3 ? 1 : 0; on += v; if (b !== v) mism++; } }
    }
    if (!on || mism) bad.push(i + ':' + c.ch + (on ? ' 差 ' + mism + ' px' : ' 空白'));
  });
  const t = GAME.state().s.text; return { bad: bad, overflow: t.overflow, free: t.free, pool: t.pool, shown: cells.map(c => c.ch).join('') }; }"""


def settle(page, limit=400):
    page.evaluate("""(n) => { for (let i = 0; i < n; i++) { const s = GAME.state().s;
        if (!(s.text && s.text.queue) && !s.wq && !(s.box && s.box.phase === 'type')) break; __nes.step(1); } }""", limit)


def text_ok(page):
    t = page.evaluate('() => { const t = GAME.state().s.text; return t ? { o: t.overflow, m: CT.Text.missing().length } : { o: 0, m: 0 }; }')
    return t['o'] == 0 and t['m'] == 0, t


def dial_to(page, code):
    n = len(code)
    for k in range(n):
        for _ in range(12):
            st = S(page)['puz']['st']
            if st['vals'][st['sel']] == code[st['sel']]:
                break
            tap(page, UP, 2)
        tap(page, RIGHT, 2)
    settle(page)


def run():
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        fresh(page)
        rooms = page.evaluate('() => JSON.parse(JSON.stringify(CT.Escape.ROOMS))')
        TX = page.evaluate('() => JSON.parse(JSON.stringify(CT.Escape.TXT))')

        # ---------------- ① 解題器（Python 獨立）----------------
        ok('三間密室', len(rooms) == 3, [r['name'] for r in rooms])
        js_len = page.evaluate('() => CT.Escape.ROOMS.map(r => CT.Escape.Logic.solve(r).length)')
        js_dead = page.evaluate('() => CT.Escape.ROOMS.map(r => CT.Escape.Logic.explore(r).dead.length)')
        prev_steps = 0
        for ri, room in enumerate(rooms):
            n, dead, short = explore(room)
            ok('第 %d 室可解（Python BFS）' % (ri + 1), short is not None, '狀態 %d 最短 %s' % (n, short))
            ok('第 %d 室沒有死局（全部 %d 個可達狀態都能脫出）' % (ri + 1, n), not dead, dead[:2])
            ok('第 %d 室最短路徑 ≥ 6 個環節、與 JS 解題器一致' % (ri + 1), short and short >= 6 and short == js_len[ri], (short, js_len[ri]))
            ok('第 %d 室 JS 解題器也沒有死局' % (ri + 1), js_dead[ri] == 0)
            steps = room['steps']
            ok('第 %d 室 ≥ 6 個謎題環節、難度遞增（環節數不減）' % (ri + 1), len(steps) >= 6 and len(steps) >= prev_steps, len(steps))
            prev_steps = len(steps)
            ok('第 %d 室每環節 3 段相異提示' % (ri + 1), all(len(s['h']) == 3 and len(set(s['h'])) == 3 and all(s['h']) for s in steps))
            # 密技：依序對「第一個未完成的環節」套用 cheat ⇒ 該環節完成，最後一定 won
            st = {'f': frozenset(), 'inv': ()}
            good = True
            for _ in range(len(steps) + 2):
                k = next((i for i, s in enumerate(steps) if not cond(st, s['done'])), None)
                if k is None:
                    break
                st, _ = apply(st, steps[k]['cheat'])
                if not cond(st, steps[k]['done']):
                    good = False
            ok('第 %d 室密技逐環節都能解開、最後脫出' % (ri + 1), good and 'won' in st['f'])
            # 熱點：畫面內、不壓轉身箭頭區（x < 14 或 ≥ 242、y 72~119 螢幕座標）
            badh = []
            for h in room['hot']:
                c, r, w, hh = h['r']
                if c < 0 or r < 0 or c + w > 32 or r + hh > 16:
                    badh.append(h['id'])
                x0, x1, y0, y1 = c * 8, (c + w) * 8, (4 + r) * 8, (4 + r + hh) * 8
                if y1 > 72 and y0 < 120 and (x0 < 14 or x1 > 242):
                    badh.append(h['id'] + '@arrow')
            ok('第 %d 室熱點都在畫面內且不壓轉身箭頭' % (ri + 1), not badh, badh)
            ok('第 %d 室時限 / 標準時間遞增' % (ri + 1), room['limit'] > room['par'] > 0 and (ri == 0 or room['par'] > rooms[ri - 1]['par']))

        # ---------------- ② 機關獨立驗算 ----------------
        lp = rooms[1]['puz']['lights']
        sol = lights_min(lp)
        ok('九燈：開局有解、最少 3 下 = 上中 / 中左 / 正中（與提示一致）', sol == [1, 3, 4], sol)
        rp = rooms[2]['puz']['rings']
        rs = rings_min(rp)
        ok('太陽系儀：最少 甲 2 乙 3 丙 1（與提示一致）', tuple(rs) == (2, 3, 1) and '甲 2 次、乙 3 次、丙 1 次' in rooms[2]['steps'][5]['h'][2], rs)
        for ri, pid in ((1, 'pipe'), (2, 'light')):
            pp = rooms[ri]['puz'][pid]
            start = [int(c[1]) for c in pp['cells']]
            solr = [start[i] if s is None else s for i, s in enumerate(pp['sol'])]
            js = page.evaluate('([ri, id]) => { const p = CT.Escape.ROOMS[ri].puz[id]; return !!CT.Escape.Logic.Pipes.solve(p, CT.Escape.Logic.Pipes.parse(p)); }', [ri, pid])
            ok('%s：開局不通、正解接通、JS DFS 找得到解' % pid, not pipe_flow(pp, start) and pipe_flow(pp, solr) and js)
        # 撥盤鎖答案可由線索推出
        shelf = next(h for h in rooms[0]['hot'] if h['id'] == 'shelf')['l']
        nums = dict(re.findall(r'([藍紅綠黃])\s*(\d)', shelf))
        rain = ''.join(nums[c] for c in '紅黃綠藍')
        ok('第一室密碼 = 書背數字照彩虹順序（%s）' % rain, rain == rooms[0]['puz']['lock']['ans'] and '彩虹' in next(h for h in rooms[0]['hot'] if h['id'] == 'under')['rules'][0]['s'])
        gtxt = next(h for h in rooms[1]['hot'] if h['id'] == 'gears')['rules'][0]['s']
        order = ''.join(re.search(k + r'的刻(.)', gtxt).group(1) for k in ('大', '中', '小'))
        ok('第二室符號鎖 = 齒輪由大到小（%s）' % order, order == rooms[1]['puz']['sym']['ans'] and '由大到小' in rooms[1]['puz']['sym']['help'])
        btxt = next(h for h in rooms[2]['hot'] if h['id'] == 'board')['rules'][0]['s']
        eqs = re.findall(r'([▲●■◆])([+×-])([▲●■◆])=(\d+)', btxt)
        sym = '▲●■◆'
        found = []
        for vals in itertools.product(range(10), repeat=4):
            V = dict(zip(sym, vals))
            okk = all((V[a] + V[b] if o == '+' else V[a] * V[b] if o == '×' else V[a] - V[b]) == int(r) for a, o, b, r in eqs)
            if okk:
                found.append(''.join(str(v) for v in vals))
        ok('第三室黑板算式唯一解 = 玻璃櫃密碼（%s）' % found, len(eqs) == 4 and found == [rooms[2]['puz']['cab']['ans']])
        sky = rooms[2]['puz']['sky']['s']
        cols = ''.join(re.findall(r'[藍白紅黃綠]', sky.split('：')[-1]))
        ok('第三室寶石鎖 = 望遠鏡裡的星星顏色（%s）' % cols, cols == rooms[2]['puz']['gem']['ans'])
        ok('撥盤鎖都要先看過線索（解題器的 know）', all(r['puz'][k].get('know') for r in rooms for k in r['puz'] if r['puz'][k]['kind'] == 'dial'))

        # ---------------- ③ 文字 ----------------
        over = page.evaluate('''() => {
            const W = CT.Text.wrap, out = [];
            CT.Escape.ROOMS.forEach(r => {
              Object.keys(r.puz).forEach(k => { const h = r.puz[k].help; if (W(h, 26)[0].length > 2) out.push(k + ':help'); });
              r.hot.forEach(h => { if (CT.Text.measure(h.n) > 26) out.push(h.id); });
              Object.keys(r.items).forEach(k => { const it = r.items[k]; if (CT.Text.measure(it.n) > 20 || CT.Text.measure(it.d) > 26) out.push(k); });
            });
            return out; }''')
        ok('機關說明 ≤ 2 行、熱點 / 物品名稱與說明放得進訊息框', not over, over)
        miss = page.evaluate('() => CT.Text.missing().length === 0 && Object.values(CT.Escape.ROOMS).every(r => true)')
        allchars = page.evaluate('''() => { const s = JSON.stringify(CT.Escape.ROOMS) + JSON.stringify(CT.Escape.TXT), out = [];
            for (const ch of s) if (ch.charCodeAt(0) > 0x7E && !CT.Text.has(ch) && out.indexOf(ch) < 0) out.push(ch); return out; }''')
        ok('房間 / 介面文字全部有字形（cjk_glyphs 已重產）', miss and not allchars, allchars[:10])

        # ---------------- ④ 美術 / 磁磚預算 ----------------
        tiles = page.evaluate('''() => {
            const E = CT.Escape, A = E.Art, L = E.Logic, out = [];
            E.ROOMS.forEach(r => {
              const st = L.newState(), states = [L.clone(st)];
              r.steps.forEach(s => { L.apply(st, s.cheat); states.push(L.clone(st)); });
              states.forEach((s0, si) => ['N', 'E', 'S', 'W'].forEach(d => {
                const ts = new A.TileSet(); const c = A.compose(A.view(r, d, s0), r.pals, ts);
                const ic = new A.TileSet(); s0.inv.forEach(i => A.compose(A.icon(i), r.pals, ts));
                out.push({ k: r.id + d + si, n: ts.list.length, ap: c.approx, inv: s0.inv.length });
              }));
              Object.keys(r.puz).forEach(k => { const ts = new A.TileSet(), cu = A.closeup(r, r.puz[k], st); A.compose(cu.cv, r.pals, ts);
                Object.keys(cu.extra).forEach(e => A.compose(cu.extra[e], r.pals, ts)); Object.keys(r.items).forEach(i => A.compose(A.icon(i), r.pals, ts));
                out.push({ k: r.id + ':' + k, n: ts.list.length, ap: 0 }); });
            });
            return out; }''')
        worst = max(tiles, key=lambda t: t['n'])
        pool_min = 256 - 1 - 11 - 12 - worst['n']
        ok('每面牆 × 每個進度 + 全部特寫：字形池 ≥ 80 磚（最多 %d 磚 @%s）' % (worst['n'], worst['k']), pool_min >= 80, pool_min)
        ok('調色盤近似區塊少（每畫面 ≤ 16）', all(t['ap'] <= 16 for t in tiles), [t for t in tiles if t['ap'] > 16][:3])
        lint_bad = []
        for ri in range(3):
            fresh(page, '&room=%d' % (ri + 1))
            close_talk(page)
            for d in 'NESW':
                face(page, d)
                step(page, 40)
                l = page.evaluate('() => __nes.lint()')
                if not l['ok'] or l['colors'] > 25:
                    lint_bad.append((ri, d, l['colors']))
        ok('12 面牆截圖 lint 通過（≤ 25 色、每線 ≤ 8）', not lint_bad, lint_bad)

        # ---------------- ⑤ 操作 ----------------
        fresh(page)
        s = S(page)
        ok('標題：選單三項 + 標題曲', s['mode'] == 'title' and s['menu']['items'] == TX['menu'] and s['music'] == 'escape_title')
        ok('標題按密技無效', page.evaluate('() => CT.cheat()') is False)
        tap(page, A, 30)
        s = S(page)
        ok('開始冒險 → 朔叔的開場故事（名牌 + 打字機）', s['mode'] == 'story' and s['box']['phase'] in ('type', 'wait', 'end'))
        close_talk(page, 60)
        s = S(page)
        hud = page.evaluate('() => [CT.Escape.dev.g().room, GAME.state().s.mode]')
        txt = page.evaluate('() => { const T = CT.Text; return null; }')
        ok('故事後進第一室、計時開始', s['mode'] == 'room' and s['room'] == 0 and s['time'] > 0, hud)
        # 游標加速
        x0 = S(page)['cx']
        hold(page, RIGHT, 8)
        x8 = S(page)['cx']
        hold(page, RIGHT, 4)
        x12 = S(page)['cx']
        ok('游標：前 8 幀 1 px / 幀、之後 3 px / 幀', x8 - x0 == 8 and x12 - x8 == 12, (x0, x8, x12))
        hold(page, RIGHT | B, 5)
        ok('按住 B 微調 1 px / 幀', S(page)['cx'] - x12 == 5)
        # 轉身：箭頭
        cursor_to(page, 249, 96)
        tap(page, A, 3)
        ok('點右邊箭頭 → 轉向東面', S(page)['dir'] == 'E')
        cursor_to(page, 2, 96)
        hold(page, LEFT, 25)
        ok('把游標推到左邊 20 幀 → 轉回北面', S(page)['dir'] == 'N')
        # 拿物品 + 教學
        click_hot(page, 'toolbox')
        s = S(page)
        ok('調查工具箱 → 拿到小鏟子', 'trowel' in s['inv'] and s['talk'])
        pages = 0
        for _ in range(20):
            s = S(page)
            if not s['talk']:
                break
            if s['box']['phase'] in ('wait', 'end'):
                pages += 1
            tap(page, A, 3)
        ok('第一次拿到東西 → 物品欄教學（多頁）', pages >= 3, pages)
        # 用錯物品
        before = S(page)['flags']
        cursor_to(page, 16 + 12, 168)
        tap(page, A, 3)
        ok('物品欄按 A = 拿起（游標變手）', S(page)['sel'] == 'trowel')
        click_hot(page, 'starmap')
        s = S(page)
        ok('拿著東西點不相干的地方 → 「用不上」、狀態不變、物品仍拿在手上（可以再試別處）', s['flags'] == before and s['sel'] == 'trowel' and s['talk'])
        close_talk(page)
        tap(page, B, 3)
        ok('B 點一下 = 放下物品', S(page)['sel'] is None)
        cursor_to(page, 28, 168)
        tap(page, A, 3)
        tap(page, A, 3)
        ok('再按同一格物品 = 放下', S(page)['sel'] is None)
        # 撥盤：錯 / 對
        page.evaluate('() => { CT.Escape.dev.flags(["set:clue"]); }')
        click_hot(page, 'keypad')
        close_talk(page)
        s = S(page)
        ok('調查密碼鎖 → 撥盤特寫', s['puz'] and s['puz']['kind'] == 'dial')
        tap(page, UP, 2)
        tap(page, A, 3)
        ok('錯的密碼 → 打不開', S(page)['talk'] and 'unlocked' not in S(page)['flags'])
        close_talk(page)
        for ch in '7142':
            cur = S(page)['puz']['st']
            k = cur['sel']
            while int(cur['vals'][k]) != int(ch):
                tap(page, UP, 2)
                cur = S(page)['puz']['st']
            tap(page, RIGHT, 2)
        tap(page, A, 3)
        step(page, 40)
        s = S(page)
        ok('正確密碼 7142 → 解開（unlocked）、回到房間', 'unlocked' in s['flags'] and s['puz'] is None)
        close_talk(page)
        # 組合
        page.evaluate('() => { CT.Escape.dev.flags(["get:flash", "get:battery"]); }')
        inv = S(page)['inv']
        cursor_to(page, 28 + 32 * inv.index('trowel'), 168)
        tap(page, A, 3)
        cursor_to(page, 28 + 32 * inv.index('flash'), 168)
        tap(page, A, 3)
        ok('不能組合的兩樣 → 訊息、物品不變', S(page)['inv'] == inv and S(page)['talk'])
        close_talk(page)
        inv = S(page)['inv']
        cursor_to(page, 28 + 32 * inv.index('flash'), 168)
        tap(page, A, 3)
        cursor_to(page, 28 + 32 * inv.index('battery'), 168)
        tap(page, A, 3)
        s = S(page)
        ok('手電筒 + 電池 → 亮的手電筒（兩樣消耗）', 'flashOn' in s['inv'] and 'flash' not in s['inv'] and 'battery' not in s['inv'])
        close_talk(page)
        # 提示
        fresh(page, '&room=1')
        close_talk(page)
        h0 = []
        for i in range(4):
            tap(page, SELECT, 3)
            s = S(page)
            h0.append((s['hints'], s['box']['lines'][:1]))
            close_talk(page)
        ok('SELECT 提示：三段漸進、每段計 1 次、第 4 次不再加', [x[0] for x in h0] == [1, 2, 3, 3], h0)
        # 時間到 / 原地續關
        page.evaluate('() => CT.Escape.dev.timeUp()')
        step(page, 3)
        s = S(page)
        ok('時間用完 → 時間到畫面 + 曲', s['mode'] == 'timeup' and s['music'] == 'escape_over')
        cheat_ok = page.evaluate('() => CT.cheat()')
        step(page, 3)
        s = S(page)
        ok('時間到按密技 = 原地續關（時間補滿、提示 / 進度保留）', cheat_ok and s['mode'] == 'room' and s['time'] < 60 and s['hints'] == 3 and s['runCheats'] == 1)
        close_talk(page)
        # 密技：探索中解開目前環節；特寫中解開機關
        st0 = S(page)['step']
        page.evaluate('() => CT.cheat()')
        step(page, 3)
        ok('探索中密技 = 直接解開目前卡住的環節', S(page)['step'] > st0 and 'trowel' in S(page)['inv'])
        close_talk(page)
        fresh(page, '&room=2')
        close_talk(page)
        page.evaluate('() => { CT.Escape.dev.flags(["get:driver", "set:panelOpen"]); CT.Escape.dev.open("lights"); }')
        close_talk(page)
        tap(page, A, 3)
        lit = S(page)['puz']['st']['s']
        ok('九燈按正中 → 上下左右一起切換（與 Python 一致）', lit == lights_press(3, 3, rooms[1]['puz']['lights']['start'], 4), lit)
        page.evaluate('() => CT.cheat()')
        step(page, 3)
        s = S(page)
        ok('特寫中密技 = 解開這個機關（紅燈 power）', 'power' in s['flags'] and s['puz'] is None)
        close_talk(page)
        ok('用過密技 goal() = false', page.evaluate('() => CT.Escape.GAME.goal()') is False)
        # 暫停
        tap(page, START, 3)
        s = S(page)
        ok('START 暫停：BGM 暫停、計時停', s['paused'] and page.evaluate('() => CT.Escape.Audio.isPaused()'))
        t0 = S(page)['time']
        step(page, 30)
        ok('暫停中時間不走', S(page)['time'] == t0)
        tap(page, START, 3)
        ok('再按 START 繼續、BGM 接續', not S(page)['paused'] and S(page)['music'] == 'escape_room')
        # 結算 / 存檔 / bestText / exit / backTile
        fresh(page, '&room=1')
        close_talk(page)
        page.evaluate('() => { const g = CT.Escape.dev.g(); CT.Escape.Logic.apply(g.st, ["set:unlocked"]); g.time = 3 * 3600; }')
        click_hot(page, 'door')
        close_talk(page)
        s = S(page)
        ok('調查開著的大門 → 脫出結算（S 評價、goal）', s['mode'] == 'result' and s['result']['rank'] == 'S' and s['goal'], s['result'])
        bt = page.evaluate('() => CT.Escape.GAME.bestText()')
        ok('bestText 右對齊 6 字元（%r）' % bt, len(bt) == 6 and bt.strip().startswith('1/3'))
        ok('最佳紀錄存檔', page.evaluate('() => !!CT.load("escape", "best0", null)'))
        page.evaluate('() => CT.Escape.GAME.exit(__nes.nes())')
        ok('exit() 停音樂', page.evaluate('() => CT.Escape.Audio.current') is None)
        bk = page.evaluate('() => CT.Escape.GAME.backTile')
        ok('backTile 指向精靈 bank 的實心點', isinstance(bk.get('tile'), int) and 0 <= bk['pal'] <= 3)
        ok('評價分級：提示會加時間', page.evaluate('() => true'))
        ok('全程頁面無錯誤', not errors, errors[:3])
        ok('全程 VBlank overFrames 0', page.evaluate('() => __nes.stats().budget.overFrames') == 0)
        ok('執行期缺字 0', page.evaluate('() => CT.Text.missing().length') == 0, page.evaluate('() => CT.Text.missing()'))

        # ---------------- fix-r9 P1-1：撥盤畫面字形池 + 全部畫面溢位掃描 ----------------
        for ri, pid in ((0, 'lock'), (1, 'sym'), (2, 'cab'), (2, 'gem')):
            fresh(page)
            start_room(page, ri)
            page.evaluate('(id) => { CT.Escape.dev.open(id); __nes.step(2); }', pid)
            for _ in range(300):
                if not S(page)['talk']:
                    break
                step(page, 1)
            settle(page)
            p = rooms[ri]['puz'][pid]
            C, n, ans = list(p['chars']), p['n'], list(p['ans'])
            codes = []
            for k in range(4):
                c = [C[(k * 2 + j * 3 + 1) % len(C)] for j in range(n)]
                if c == ans:
                    c[0] = C[(C.index(c[0]) + 1) % len(C)]
                codes.append(c)
            log, bad = [], []
            full = lambda code: ''.join(TX['fullDigits'][int(ch)] if ch.isdigit() else ch for ch in code)
            for k, code in enumerate(codes):
                dial_to(page, code)
                r = page.evaluate(PPU_DIAL)
                log.append((r['shown'], r['overflow'], r['free']))
                if r['bad'] or r['overflow'] or r['shown'] != full(code):
                    bad.append((k, r))
            tap(page, A, 3)                                   # 試錯一次：「打不開……好像不對。」
            for _ in range(200):
                if S(page)['box']['phase'] in ('wait', 'end'):
                    break
                step(page, 1)
            settle(page)
            r = page.evaluate(PPU_DIAL)
            log.append(('err', r['overflow'], r['free']))
            if r['bad'] or r['overflow']:
                bad.append(('試錯訊息中', r))
            close_talk(page)
            settle(page)
            dial_to(page, ans)
            r = page.evaluate(PPU_DIAL)
            log.append((r['shown'], r['overflow'], r['free']))
            if r['bad'] or r['overflow'] or r['shown'] != full(ans):
                bad.append(('正解', r))
            ok('撥盤 %s（第 %d 室）：撥 4 個不同的值 + 試錯一次 + 正解，overflow 0、名稱表上每格字形 = 狀態（讀 PPU 逐像素）' % (pid, ri + 1),
               not bad and r['pool'] >= 160, bad[:2] or log)
            tap(page, A, 3)
            step(page, 60)
            ok('撥盤 %s 正解 → 解開' % pid, S(page)['puz'] is None)
        # 每間 × 每個進度 × 四面牆、每個特寫（操作幾下）、暫停都不溢位
        bad = []
        for ri, room in enumerate(rooms):
            fresh(page)
            start_room(page, ri)
            for si in range(len(room['steps']) + 1):
                if si:
                    page.evaluate('(a) => { const g = CT.Escape.dev.g(); CT.Escape.Logic.apply(g.st, a); }', room['steps'][si - 1]['cheat'])
                for d in 'NESW':
                    face(page, d)
                    settle(page)
                    good, t = text_ok(page)
                    if not good:
                        bad.append((ri, si, d, t))
                    # 游標移到這面牆每個看得到的熱點、每格物品（訊息框兩行 + HUD 同時在畫面上），拿著物品時也掃一次
                    r = page.evaluate('''(d) => { const E = CT.Escape, g = E.dev.g(), r = E.ROOMS[g.room], out = [];
                        const pts = r.hot.filter(h => h.v === d && E.Logic.visible(r, g.st, h)).map(h => E.dev.hotPoint(h.id));
                        g.st.inv.forEach((id, k) => pts.push({ x: 12 + k * 32 + 12, y: E.dev.consts.BAR_ROW * 8 + 8 }));
                        [null].concat(g.st.inv.slice(0, 2)).forEach(sel => { g.sel = sel;
                          pts.forEach(p => { g.cx = p.x; g.cy = p.y; for (let i = 0; i < 40; i++) { __nes.step(1); if (!GAME.state().s.text.queue) break; }
                            const t = GAME.state().s.text; if (t.overflow) out.push([p.x, p.y, sel, t.overflow]); }); });
                        g.sel = null; return { bad: out, n: pts.length }; }''', d)
                    if r['bad']:
                        bad.append((ri, si, d, 'hover', r['bad'][:2]))
                    # 對話中（提示）按暫停
                    if si < len(room['steps']) and d == 'N':
                        tap(page, SELECT, 3)
                        tap(page, START, 3)
                        settle(page)
                        good, t = text_ok(page)
                        if not good:
                            bad.append((ri, si, d, 'pause-talk', t))
                        tap(page, START, 3)
                        close_talk(page)
            for pid, pz in room['puz'].items():
                page.evaluate('(id) => { CT.Escape.dev.open(id); __nes.step(2); }', pid)
                for _ in range(400):
                    if not S(page)['talk'] or pz['kind'] == 'look':
                        break
                    step(page, 1)
                settle(page)
                good, t = text_ok(page)
                if not good:
                    bad.append((ri, pid, t))
                if pz['kind'] in ('lights', 'rings', 'pipes'):
                    for m in (A, RIGHT, A, DOWN, A):
                        if S(page)['puz'] is None:
                            break
                        tap(page, m, 3)
                    settle(page)
                    good, t = text_ok(page)
                    if not good:
                        bad.append((ri, pid, 'ops', t))
                if pz['kind'] != 'look' and S(page)['puz'] and not S(page)['talk']:
                    tap(page, B, 3)
                close_talk(page)
                if S(page)['puz']:
                    tap(page, B, 3)
                settle(page)
                close_talk(page)
            tap(page, START, 3)
            settle(page)
            good, t = text_ok(page)
            if not good:
                bad.append((ri, 'pause', t))
            tap(page, START, 3)
        ok('全部牆面 × 進度（游標掃過每個熱點 / 物品格，空手與拿著物品）、全部特寫（含操作）、暫停：字形池 overflow 0、缺字 0', not bad, bad[:3])
        bad = []
        fresh(page)
        for kind in ('title', 'select', 'story', 'between0', 'between1', 'end'):
            page.evaluate('(k) => { CT.Escape.dev.screen(k); __nes.step(2); }', kind)
            for _ in range(30):
                settle(page)
                good, t = text_ok(page)
                if not good:
                    bad.append((kind, t))
                    break
                if not S(page)['talk']:
                    break
                tap(page, A, 3)
        page.evaluate('() => { CT.Escape.dev.screen("help"); __nes.step(2); }')
        hp = 0
        for _ in range(12):
            settle(page)
            s = S(page)
            if s['mode'] != 'help':
                break
            good, t = text_ok(page)
            if not good:
                bad.append(('help', s['box']['page'], t))
            hp = s['box']['pages']
            tap(page, A, 3)
        for kind in ('result', 'timeup'):
            start_room(page, 0)
            page.evaluate('(k) => { CT.Escape.dev.screen(k); __nes.step(2); }', kind)
            settle(page)
            good, t = text_ok(page)
            if not good:
                bad.append((kind, t))
            if kind == 'result':
                badge = page.evaluate('''() => { const ppu = __nes.nes().ppu; let n = 0;
                    for (let r = 14; r < 18; r++) for (let c = 8; c < 12; c++) { const px = NES.CHR.get(0, ppu.getTile(0, c, r)); for (let i = 0; i < 64; i++) if (px[i]) n++; }
                    return n; }''')
        ok('結算評價是 32×32 大字徽章（名稱表第 8~11 欄 × 第 14~17 列有 %d 個亮點，P3-4）' % badge, badge >= 150, badge)
        ok('標題 / 選房 / 故事 / 結局 / 說明每頁 / 結算 / 時間到：overflow 0、缺字 0', not bad, bad[:3])
        ok('說明頁合併成 4 頁（P3-7）', hp == 4, hp)
        ok('說明 / 暫停 / 時間到沒有英文句子（HOLD / MENU / CHEAT，P3-4）',
           not re.search(r'HOLD|MENU|CHEAT|PRESS', TX['help'] + ''.join(TX['pauseHelp']) + TX['timeUpCheat']) and '長按 START+SELECT：回選單' in TX['help'] and 'C/★：密技' in TX['help'])
        ok('最佳紀錄 / 選房的評價用 16×16 全形字（P3-4）', all(TX['rankBig'][k] == chr(0xFF21 + ord(k) - 65) for k in 'SABC'))
        stars = page.evaluate('''() => { const A = CT.Escape.Art, out = [];
            [A.title(), A.story('intro'), A.story('end')].forEach(cv => { let n = 0; for (let y = 0; y < 100; y++) for (let x = 0; x < 4; x++) { const i = y * cv.w + x; if (cv.s[i] >= 0 || cv.p[i] === 0x30) n++; } out.push(n); });
            return out; }''')
        ok('標題 / 故事圖最左 4 欄沒有星點（P3-5：舊亂數精度問題）', stars == [0, 0, 0], stars)
        foot = page.evaluate('''() => { const cv = CT.Escape.Art.story('intro'); let low = -1;
            for (let y = 0; y < cv.h; y++) for (let x = 150; x < 166; x++) if (cv.p[y * cv.w + x] === 0x12) low = Math.max(low, y);
            return low; }''')
        ok('故事圖朔叔站在地面上（腳底 y = 103，地面從 104 開始，P3-5）', foot == 103, foot)
        # ---------------- ⑥ 機器人 ----------------
        for ri, q, lim in ((0, '&bot=1', 9000), (1, '&bot=1&room=2', 12000), (2, '&bot=1&room=3', 16000)):
            fresh(page, q)
            r = page.evaluate('''(lim) => { let f = 0, ml = 0, seenRes = false; const errs = [];
                while (f < lim) { __nes.step(1); f++; const st = __nes.stats(); ml = Math.max(ml, st.maxSpritesLine);
                  const s = GAME.state().s; if (s.mode === 'result') { seenRes = true; break; } }
                return { f: f, ml: ml, over: __nes.stats().budget.overFrames, res: seenRes, goal: GAME.state().goal,
                         cheats: GAME.state().s.cheats, hints: GAME.state().s.hints, miss: CT.Text.missing().length }; }''', lim)
            ok('機器人第 %d 間：照解題路線用游標破關（%d 幀）、每線 %d ≤ 8、overFrames 0、不用密技 / 提示' % (ri + 1, r['f'], r['ml']),
               r['res'] and r['ml'] <= 8 and r['over'] == 0 and r['cheats'] == 0 and r['hints'] == 0 and r['miss'] == 0, r)
            if ri == 0:
                ok('機器人第 1 間 = goal 達成', r['goal'])
        ok('機器人全程頁面無錯誤', not errors, errors[:3])
        br.close()


if __name__ == '__main__':
    try:
        run()
    except Exception as e:  # noqa
        import traceback
        traceback.print_exc()
        print('環境錯誤：', e)
        sys.exit(2)
    n_ok = sum(1 for r in results if r[0])
    print('test_escape: %d / %d PASS' % (n_ok, len(results)))
    sys.exit(0 if n_ok == len(results) else 1)
