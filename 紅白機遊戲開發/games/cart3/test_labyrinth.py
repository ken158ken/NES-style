# -*- coding: utf-8 -*-
"""《星塵迷宮探索》（cart3 槽 7，id = labyrinth）自動驗證。

重點：產生器 + 驗證器（9 層固定種子每層可達出口、無死局、星屑永遠拿得到；隨機種子 40 個；驗證器不是空殼）、
      解題器路徑可重播、視野 = 屬性表（明亮 / 微光 / 黑暗 + 移動時每幀寫入量）、小地圖 = nt1（SELECT 只切捲動基底）、
      鑰匙門 / 日月開關 / 潮汐牆（有人站著延後升起）/ 星屑 / 星燈 / 羅盤、結算星等與紀錄、§6 規則
      （標題密技無效 / 遊玩密技 + goal false / 暫停 BGM 停 + 重來 / exit 存檔 / backTile / 說明頁行距）、
      ?seed= 可重現、每線 ≤ 8、VBlank 每幀 ≤ 160 byte、機器人（解題器 + 十字鍵）過 3 層 / 全 9 層。
作法：Playwright 開 `cart3.html?game=labyrinth&debug=1&scale=1&mute=1`，`__nes.*` + `CT.Labyrinth.dev`。

用法：../卡比之星/.venv/bin/python games/cart3/test_labyrinth.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=labyrinth'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Labyrinth && !!CT.Labyrinth.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.indexOf("nes.cart3.labyrinth.") === 0).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


JS_ROW_HAS = r"""
(a) => { const p = __nes.nes().ppu, A = CT.Labyrinth.Art.make(), w = A.text(a.s), nt = a.nt || 0;
  for (let c = 0; c + w.length <= 32; c++) { let okk = true; for (let i = 0; i < w.length; i++) if (p.getTile(nt, c + i, a.r) !== w[i]) { okk = false; break; }
    if (okk) return true; } return false; }
"""
JS_ROWS_USED = r"""
() => { const p = __nes.nes().ppu, out = []; for (let r = 9; r < 27; r++) { let n = 0; for (let c = 0; c < 32; c++) if (p.getTile(0, c, r)) n++; out.push(n > 0 ? 1 : 0); } return out; }
"""
# 把露明放到某格（測試用：直接改位置，不經過機關）
JS_TP = r"""
(a) => { const g = CT.Labyrinth.dev.g(), p = g.p; p.cx = a.x; p.cy = a.y; p.tx = a.x; p.ty = a.y; p.moving = false;
  p.x = (g.OX + a.x) * 8; p.y = (g.OY + a.y) * 8; CT.Labyrinth.dev.light(true); return true; }
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
    reg = page.evaluate("""() => { const g = CT.get('labyrinth'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, back: CT.Labyrinth.Art.make().s('BACK') }; }""")
    ok('註冊：id / order 7 / title / legacy maze-game', reg and reg['id'] == 'labyrinth' and reg['order'] == 7 and reg['title'] == '星塵迷宮探索'
       and reg['legacy'] == ['maze-game.html'], reg)
    ok('註冊：契約函式 9 個齊全', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('§6-4 backTile = 精靈表的實心星 BACK（pal 1）', reg['bt'] and reg['bt']['tile'] == reg['back'] and reg['bt']['pal'] == 1, reg['bt'])
    bt = page.evaluate("""() => { const a = CT.get('labyrinth').bestText(); localStorage.setItem('nes.cart3.labyrinth.reach', '4');
        const b = CT.get('labyrinth').bestText(); localStorage.setItem('nes.cart3.labyrinth.best', '205'); const c = CT.get('labyrinth').bestText();
        ['reach','best'].forEach(k => localStorage.removeItem('nes.cart3.labyrinth.' + k)); return [a, b, c]; }""")
    ok('bestText：右對齊 6 字元（FLR 00 / FLR 03 / " 03:25"）', bt == ['FLR 00', 'FLR 03', ' 03:25'], bt)
    a = page.evaluate("""() => { const A = CT.Labyrinth.Art.make(), B = CT.Labyrinth.Art.BG;
        const need = ['WL','WF','FL0','KEY','DOOR','DOOR_O','SW_S','SW_M','GA_C','GA_O','GB_C','GB_O','SH_C','SH_W','SH_O','EXIT','SHARD','LAMP','MK_EXIT','MK_KEY','MK_DOOR','MK_SW','MK_SHARD','MK_LAMP'];
        const spr = ['P_D0','P_D1','P_U0','P_U1','P_S0','P_S1','ARR_N','ARR_NE','ARR_E','MAPDOT','SPARK','BACK'];
        return { bg: A.bg.tiles.length, spr: A.spr.tiles.length, miss: need.filter(n => !B[n]).concat(spr.filter(n => !CT.Labyrinth.Art.SPR[n])),
                 mq: [...Array(16).keys()].every(m => !!B['MQ' + m]) }; }""")
    ok('CHR ≤ 256；機關 / 小地圖 16 種四分格 + 6 標記 / 露明 6 影格齊全', a['bg'] <= 256 and a['spr'] <= 256 and not a['miss'] and a['mq'], a)
    au = page.evaluate("""() => { const A = CT.Labyrinth.Audio, bad = [];
        Object.keys(A.SONGS).forEach(k => A.SONGS[k].patterns.forEach((p, i) => Object.keys(p).forEach(t => { if (p[t].length !== 16) bad.push(k + ':' + i + ':' + t); })));
        return { songs: Object.keys(A.SONGS), sfx: Object.keys(A.SFX), bad }; }""")
    ok('BGM 6 首（標題 / 三主題 / 過關 / 結局）+ 音效 ≥ 4，全部 labyrinth_ 前綴', len(au['songs']) == 6 and len(au['sfx']) >= 4
       and all(k.startswith('labyrinth_') for k in au['songs'] + au['sfx']), au['songs'])
    ok('每首每個 pattern 各軌都是 16 列', not au['bad'], au['bad'][:5])

    # ---------------- 產生器 / 驗證器 / 解題器 ----------------
    gen = page.evaluate("""() => { const G = CT.Labyrinth.Gen, out = [];
        for (let n = 1; n <= 9; n++) { const lv = G.floor(n); out.push(lv ? { n, W: lv.W, H: lv.H, v: lv.verify, k: lv.keys.length, d: lv.doors.length,
            s: lv.switches.length, ga: lv.gates.length, sh: lv.shifts.length, sd: lv.shards.length, lamp: lv.lamp >= 0, par: lv.par, att: lv.attempt } : { n, fail: true }); }
        return out; }""")
    ok('9 層固定種子全部產生成功', all('fail' not in f for f in gen), [f['n'] for f in gen if 'fail' in f])
    ok('驗證器：9 層全部「出口可達 + 無死局（softlock 0）+ 星屑永遠拿得到（shardLock 0）」',
       all(f['v']['ok'] and f['v']['steps'] > 0 and f['v']['softlock'] == 0 and f['v']['shardLock'] == 0 for f in gen),
       [(f['n'], f['v']['steps'], f['v']['states']) for f in gen])
    ok('逐層變大（15×11 → 31×23）、最短步數大致遞增', gen[0]['W'] == 15 and gen[8]['W'] == 31 and gen[8]['H'] == 23
       and all(gen[i]['W'] * gen[i]['H'] <= gen[i + 1]['W'] * gen[i + 1]['H'] for i in range(8)) and gen[8]['v']['steps'] > gen[0]['v']['steps'] * 5,
       [(f['W'], f['H'], f['v']['steps']) for f in gen])
    ok('機關逐層加入：F2 鎖門、F3 日月門、F4 潮汐牆、F5 起星燈、F9 = 3 門 3 閘 12 潮汐牆',
       gen[1]['d'] == 1 and gen[2]['ga'] == 1 and gen[3]['sh'] == 4 and gen[4]['lamp'] and gen[8]['d'] == 3 and gen[8]['ga'] == 3 and gen[8]['sh'] == 12
       and all(f['k'] == f['d'] and f['s'] == f['ga'] for f in gen), [(f['n'], f['d'], f['ga'], f['sh']) for f in gen])
    r = page.evaluate("""() => { const G = CT.Labyrinth.Gen, sp = G.FLOORS[6], at = G.floor(7).attempt, a = G.build(sp, at), b = G.build(sp, at), c = G.floor(8);
        return { same: a.grid.join() === b.grid.join(), diff: a.grid.join() !== c.grid.join() }; }""")
    ok('固定種子：同種子兩次產生完全相同、不同層不同', r['same'] and r['diff'], r)
    r = page.evaluate("""() => { const G = CT.Labyrinth.Gen, bad = []; let steps = 0;
        for (let i = 1; i <= 40; i++) { const lv = G.random(i * 7331); if (!lv || !lv.verify.ok) bad.push(i); else steps += lv.verify.steps; }
        return { bad, avg: steps / 40 }; }""")
    ok('隨機模式 40 個種子全部通過驗證器', not r['bad'], r)
    r = page.evaluate("""() => { const G = CT.Labyrinth.Gen, T = G.T, lv = G.floor(6);
        const cp = Object.assign({}, lv, { grid: lv.grid.slice() });
        cp.grid[lv.keys[0]] = T.FLOOR; cp.keys = lv.keys.slice(1);        // 拿掉一把鑰匙
        const v1 = G.verify(cp);
        const cp2 = Object.assign({}, lv, { grid: lv.grid.slice() });
        cp2.grid[lv.switches[0]] = T.FLOOR; cp2.switches = lv.switches.slice(1);   // 拿掉開關
        const v2 = G.verify(cp2);
        return { k: v1.ok, ks: v1.steps, s: v2.ok, ss: v2.steps }; }""")
    ok('驗證器不是空殼：拿掉一把鑰匙 / 一個開關 → 判定不可解', not r['k'] and not r['s'] and r['ks'] < 0 and r['ss'] < 0, r)
    r = page.evaluate("""() => { const G = CT.Labyrinth.Gen, out = [];
        for (let n = 1; n <= 9; n++) { const lv = G.floor(n), im = G.indexMaps(lv), path = G.solve(lv, lv.start, 0, 0, 0);
          let sw = 0, dm = 0, km = 0, okk = path && path[0] === lv.start;
          for (let i = 1; okk && i < path.length; i++) { const a = path[i - 1], b = path[i], d = Math.abs(a - b);
            if (d !== 1 && d !== lv.W) { okk = false; break; }
            const e = G.enterRule(lv, b, sw, dm, km, im.k, im.d); if (!e) { okk = false; break; } sw = e.sw; dm = e.dm; km = e.km; }
          out.push(okk && path[path.length - 1] === lv.exit && path.length - 1 === lv.verify.steps); }
        return out; }""")
    ok('解題器：9 層的最短路徑用遊戲規則逐步重播都合法、終點 = 出口、長度 = 驗證器步數', all(r), r)

    # ---------------- 標題 ----------------
    page.evaluate('() => __nes.step(60)')
    lint = page.evaluate('() => __nes.lint()')
    ok('標題：lint 綠、overFrames 0', lint.get('ok') and page.evaluate('() => __nes.stats().budget.overFrames') == 0, lint.get('colors'))
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 24}))
    ok('§6-6 標題寫著 C/★ = CHEAT', page.evaluate(JS_ROW_HAS, {'s': 'C/★ = CHEAT', 'r': 22}))
    used = page.evaluate(JS_ROWS_USED)
    ok('§6-6 選單 / 說明文字行之間都空一列', all(not (used[i] and used[i + 1]) for i in range(len(used) - 1)), used)
    r = page.evaluate("() => { const c = CT.cheat(); __nes.step(1); const s = GAME.state().s; return { c, cheats: s.cheats, mode: s.mode }; }")
    ok('§6-1 標題按密技無效', not r['c'] and r['cheats'] == 0 and r['mode'] == 'title', r)
    r = page.evaluate("""() => { localStorage.setItem('nes.cart3.labyrinth.reach', '3'); const o = [];
        __nes.tap('down', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); __nes.tap('right', 1); __nes.step(2); o.push(CT.Labyrinth.dev.g().selFloor);
        __nes.tap('right', 1); __nes.step(2); o.push(CT.Labyrinth.dev.g().selFloor);
        __nes.tap('down', 1); __nes.step(2); const s0 = CT.Labyrinth.dev.g().seed; __nes.tap('right', 1); __nes.step(2); o.push(CT.Labyrinth.dev.g().seed - s0);
        localStorage.removeItem('nes.cart3.labyrinth.reach'); return o; }""")
    ok('選單：FLOOR SELECT 只能選到已解鎖的層（reach 3 → 1→2→3→1）、RANDOM ←→ 改種子', r == [3, 1, 1], r)

    # ---------------- 開局 / 視野 ----------------
    fresh(page, '&floor=3')
    s = st(page)
    ok('?floor=3 直接開第 3 層（TWIN LOCKS 23×15）', s['mode'] == 'play' and s['floor'] == 3 and s['W'] == 23 and s['H'] == 15 and s['name'] == 'TWIN LOCKS', s)
    ok('HUD 寫著層名、標準時間、鑰匙 / 星屑 / 羅盤', page.evaluate(JS_ROW_HAS, {'s': 'F3 TWIN LOCKS', 'r': 1}) and page.evaluate(JS_ROW_HAS, {'s': 'PAR 00:', 'r': 2}))
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(), p = __nes.nes().ppu, bx = (g.p.x + 4) >> 4, by = (g.p.y + 4) >> 4;
        const pal = (x, y) => p.getAttr(0, x, y), far = [];
        for (let y = 2; y <= 13; y++) for (let x = 0; x < 16; x++) { const dx = x - bx, dy = y - by; if (dx * dx + dy * dy >= 16) far.push(pal(x, y)); }
        return { here: pal(bx, by), far0: far.every(v => v === 0), nFar: far.length, hud: pal(5, 0), msg: pal(5, 14),
                 bg0: [1,2,3].map(i => p._bg ? p._bg[0][i] : null) }; }""")
    ok('視野 = 屬性表：露明所在區塊用明亮組（2）、4 區塊外全是黑暗組（0）、狀態列固定 3', r['here'] == 2 and r['far0'] and r['hud'] == 3 and r['msg'] == 3, r)
    r = page.evaluate("""() => { const dev = CT.Labyrinth.dev, g = dev.g(); const x0 = g.p.x, c0 = g.p.cx; let maxA = 0, maxW = 0, frames = 0, moved = 0;
        const sh = dev.shadow(); const A0 = sh.haveA.slice();
        for (let i = 0; i < 400; i++) { const d = g.p.cx > 2 ? 'left' : 'down'; __nes.press(d, 1); frames++;
          maxW = Math.max(maxW, __nes.stats().budget.used); maxA = Math.max(maxA, dev.wstat.attrPeak); }
        __nes.release(); __nes.step(1);
        let changed = 0; for (let i = 0; i < 240; i++) if (sh.haveA[i] !== A0[i]) changed++;
        return { maxW, maxA, changed, over: __nes.stats().budget.overFrames, cx: g.p.cx, cy: g.p.cy, ft: g.ft, known: g.known.reduce((a, b) => a + b, 0) }; }""")
    ok('邊走邊更新視野：屬性真的有變、每幀屬性寫入 ≤ 40、整幀 ≤ 140 byte、overFrames 0',
       r['changed'] > 5 and r['maxA'] <= 40 and r['maxW'] <= 140 and r['over'] == 0, r)
    ok('走過的格子記進探索紀錄（≥ 40 格）', r['known'] >= 40, r['known'])

    # ---------------- 小地圖 ----------------
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(), p = __nes.nes().ppu; let n = 0;
        for (let y = 0; y < 30; y++) for (let x = 0; x < 32; x++) { const t = p.getTile(1, x, y); if (t) n++; }
        const ft0 = g.ft; __nes.tap('select', 1); const used = __nes.stats().budget.used; const sc = p.getScroll(); __nes.step(30);
        const ft1 = g.ft, map = g.map, lint = __nes.lint().ok; __nes.tap('select', 1); __nes.step(2);
        return { n, base: sc.nt, used, frozen: ft1 === ft0, map, lint, back: p.getScroll().nt, mapAfter: g.map }; }""")
    ok('小地圖 = nt1：探索過的地方已畫進第二張名稱表', r['n'] > 40, r)
    ok('SELECT 開地圖：只切捲動基底到 nt1（那幀寫入 ≤ 10 byte）、計時停、lint 綠；再按 SELECT 回來',
       r['base'] == 1 and r['used'] <= 10 and r['frozen'] and r['map'] and r['lint'] and r['back'] == 0 and not r['mapAfter'], r)
    ok('地圖畫面寫著 SELECT / B: CLOSE 與圖例', page.evaluate(JS_ROW_HAS, {'s': 'SELECT / B: CLOSE', 'r': 27, 'nt': 1}) and page.evaluate(JS_ROW_HAS, {'s': 'SWITCH', 'r': 25, 'nt': 1}))

    # ---------------- 機關 ----------------
    fresh(page, '&floor=2')
    r = page.evaluate("""(TP) => { const dev = CT.Labyrinth.dev, g = dev.g(), lv = g.lv, W = lv.W, G = CT.Labyrinth.Gen, A = CT.Labyrinth.Art.make();
        const door = lv.doors[0], key = lv.keys[0], DX = G.DX, DY = G.DY;
        // 找門旁邊能站的格與方向
        let from = -1, dir = -1; for (let d = 0; d < 4; d++) { const n = door - DX[d] - DY[d] * W; if (lv.grid[n] !== G.T.WALL) { from = n; dir = d; break; } }
        const tp = (c) => { const p = g.p; p.cx = c % W; p.cy = (c / W) | 0; p.tx = p.cx; p.ty = p.cy; p.moving = false; p.x = (g.OX + p.cx) * 8; p.y = (g.OY + p.cy) * 8; };
        tp(from); const m1 = dev.tryMove(dir), msg = g.msg;
        const tileShut = __nes.nes().ppu.getTile(0, g.OX + door % W, g.OY + ((door / W) | 0)) === A.t('DOOR');
        // 走到鑰匙旁邊踩上去
        let kf = -1, kd = -1; for (let d = 0; d < 4; d++) { const n = key - DX[d] - DY[d] * W; if (lv.grid[n] !== G.T.WALL) { kf = n; kd = d; break; } }
        tp(kf); dev.tryMove(kd); for (let i = 0; i < 12; i++) __nes.step(1); const keys = GAME.state().s.keys;
        tp(from); const m2 = dev.tryMove(dir); __nes.step(12);
        return { m1, msg, tileShut, keys, m2, dm: g.dm, keysAfter: GAME.state().s.keys, open: __nes.nes().ppu.getTile(0, g.OX + door % W, g.OY + ((door / W) | 0)) === A.t('DOOR_O'),
                 keyGone: __nes.nes().ppu.getTile(0, g.OX + key % W, g.OY + ((key / W) | 0)) !== A.t('KEY') }; }""", None)
    ok('鎖門：沒鑰匙撞門 → 走不過去 + LOCKED 提示', not r['m1'] and 'LOCKED' in r['msg'] and r['tileShut'], r)
    ok('踩到鑰匙 → 鑰匙 +1、磁磚換成地板', r['keys'] == 1 and r['keyGone'], r)
    ok('有鑰匙再撞門 → 門打開（DOOR_O）、鑰匙用掉', r['m2'] and r['dm'] == 1 and r['keysAfter'] == 0 and r['open'], r)

    fresh(page, '&floor=3')
    r = page.evaluate("""() => { const dev = CT.Labyrinth.dev, g = dev.g(), lv = g.lv, W = lv.W, G = CT.Labyrinth.Gen, A = CT.Labyrinth.Art.make(), p = __nes.nes().ppu;
        const sw = lv.switches[0], gate = lv.gates[0], DX = G.DX, DY = G.DY, gt = () => p.getTile(0, g.OX + gate % W, g.OY + ((gate / W) | 0));
        const tp = (c) => { const q = g.p; q.cx = c % W; q.cy = (c / W) | 0; q.tx = q.cx; q.ty = q.cy; q.moving = false; q.x = (g.OX + q.cx) * 8; q.y = (g.OY + q.cy) * 8; };
        let f = -1, d0 = -1; for (let d = 0; d < 4; d++) { const n = sw - DX[d] - DY[d] * W; if (lv.grid[n] !== G.T.WALL) { f = n; d0 = d; break; } }
        const before = { sw: g.sw, tile: gt() === A.t(lv.grid[gate] === G.T.GATE_A ? 'GA_C' : 'GB_C') };
        tp(f); dev.tryMove(d0); __nes.step(12);
        const after = { sw: g.sw, tile: gt() === A.t(lv.grid[gate] === G.T.GATE_A ? 'GA_O' : 'GB_O') };
        dev.tryMove((d0 + 2) & 3); __nes.step(12); dev.tryMove(d0); __nes.step(12);
        return { before, after, back: g.sw, hud: GAME.state().s.sw }; }""")
    ok('日月開關：踩上去切換、日門（GATE_A）從關變開', r['before']['sw'] == 0 and r['before']['tile'] and r['after']['sw'] == 1 and r['after']['tile'], r)
    ok('離開再踩一次 → 切回去（可來回切換）', r['back'] == 0, r)

    fresh(page, '&floor=4')
    r = page.evaluate("""() => { const dev = CT.Labyrinth.dev, g = dev.g(), lv = g.lv, W = lv.W, A = CT.Labyrinth.Art.make(), p = __nes.nes().ppu, P = CT.Labyrinth.SHIFT_P;
        const tile = (c) => p.getTile(0, g.OX + c % W, g.OY + ((c / W) | 0));
        const s0 = lv.shifts.filter(s => s.ph === 0).map(s => s.c), s1 = lv.shifts.filter(s => s.ph === 1).map(s => s.c);
        const t0 = { c0: s0.every(c => g.shiftSt[c] === 2), o1: s1.every(c => g.shiftSt[c] !== 2) };
        // 讓露明站在一格「下一輪要升起」的 s1 上
        const tp = (c) => { const q = g.p; q.cx = c % W; q.cy = (c / W) | 0; q.tx = q.cx; q.ty = q.cy; q.moving = false; q.x = (g.OX + q.cx) * 8; q.y = (g.OY + q.cy) * 8; };
        tp(s1[0]);
        let warned = false; while (g.ft < P - 1) { __nes.step(1); if (g.shiftSt[s1[1]] === 1) warned = true; }
        __nes.step(3);
        const t1 = { c1: s1.slice(1).every(c => g.shiftSt[c] === 2), o0: s0.every(c => g.shiftSt[c] === 0), stand: g.shiftSt[s1[0]], pend: g.shiftPend[s1[0]],
                     tileC: tile(s1[1]) === A.t('SH_C'), tileO: tile(s0[0]) === A.t('SH_O') };
        // 走開 → 那格立刻升起
        const lv2 = lv, G = CT.Labyrinth.Gen; let moved = false;
        for (let d = 0; d < 4 && !moved; d++) moved = dev.tryMove(d);
        for (let i = 0; i < 10; i++) __nes.step(1);
        return { t0, warned, t1, moved, after: g.shiftSt[s1[0]], blocked: (() => { const q = g.p; return !moved; })() }; }""")
    ok('潮汐牆：開局第 0 組升起、第 1 組沉下', r['t0']['c0'] and r['t0']['o1'], r)
    ok('潮汐牆：換組前有預警（SH_W）、到點兩組互換（磁磚 SH_C / SH_O）', r['warned'] and r['t1']['c1'] and r['t1']['o0'] and r['t1']['tileC'] and r['t1']['tileO'], r)
    ok('有人站在要升起的格子上 → 延後（不夾人），走開後才升起', r['t1']['stand'] != 2 and r['t1']['pend'] == 1 and r['moved'] and r['after'] == 2, r)

    fresh(page, '&floor=5')
    r = page.evaluate("""() => { const dev = CT.Labyrinth.dev, g = dev.g(), lv = g.lv, W = lv.W, G = CT.Labyrinth.Gen, DX = G.DX, DY = G.DY;
        const tp = (c) => { const q = g.p; q.cx = c % W; q.cy = (c / W) | 0; q.tx = q.cx; q.ty = q.cy; q.moving = false; q.x = (g.OX + q.cx) * 8; q.y = (g.OY + q.cy) * 8; };
        const step = (c) => { for (let d = 0; d < 4; d++) { const n = c - DX[d] - DY[d] * W; if (lv.grid[n] === G.T.FLOOR || lv.grid[n] === G.T.SHARD) { tp(n); dev.tryMove(d); __nes.step(12); return true; } } return false; };
        const r1 = g.r1; step(lv.lamp); const lamp = { r1: g.r1, d: g.r1 - r1 };
        step(lv.shards[0]); const sh = g.shards;
        const c0 = g.compass; dev.compassPing(); __nes.step(4); const arrows = (() => { let n = 0; for (let i = 0; i < 8; i++) { const s = __nes.nes().ppu.getSprite(i); if (s && s.y < 240 && s.tile === CT.Labyrinth.Art.make().s(['ARR_N','ARR_NE','ARR_E'][0]) || (s && [CT.Labyrinth.Art.make().s('ARR_N'), CT.Labyrinth.Art.make().s('ARR_NE'), CT.Labyrinth.Art.make().s('ARR_E')].indexOf(s.tile) >= 0 && s.y < 240)) n++; } return n; })();
        return { lamp, sh, compass: g.compass, c0, arrows, msg: g.msg }; }""")
    ok('星燈：照明半徑 +16 px', r['lamp']['d'] == 16, r)
    ok('星屑：撿到 +1', r['sh'] == 1, r)
    ok('羅盤（B）：次數 -1、箭頭精靈指向出口、提示方位', r['compass'] == r['c0'] - 1 and r['arrows'] >= 1 and 'NEEDLE' in r['msg'], r)

    # ---------------- 通關 / 結算 / 紀錄 ----------------
    fresh(page, '&floor=1')
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(), lv = g.lv, W = lv.W; let i;
        for (i = 0; i < 3000; i++) { const m = CT.get('labyrinth').bot(); NES.Input.inject(m & 255, 1); __nes.step(1); if (g.mode === 'clear') break; }
        const res = g.result; __nes.step(5);
        return { i, mode: g.mode, res, rec: JSON.parse(localStorage.getItem('nes.cart3.labyrinth.f1')), reach: +localStorage.getItem('nes.cart3.labyrinth.reach'),
                 lint: __nes.lint().ok, over: __nes.stats().budget.overFrames }; }""")
    ok('走到星門 → 過關演出 → 結算畫面（lint 綠、不超預算）', r['mode'] == 'clear' and r['lint'] and r['over'] == 0, r)
    ok('星等：到出口 ★ + 時間 ≤ PAR ★（機器人沒撿星屑 ⇒ 2 星）', r['res'] and r['res']['stars'] == 2 and r['res']['t'] <= r['res']['par'] * 60, r['res'])
    ok('紀錄：每層最佳時間 / 星等存檔、解鎖下一層', r['rec'] and r['rec']['s'] == 2 and r['rec']['t'] == r['res']['t'] and r['reach'] == 2, r)
    ok('結算畫面寫著 CLEAR! 與 A: FINISH（單層模式）', page.evaluate(JS_ROW_HAS, {'s': 'CLEAR!', 'r': 5}) and page.evaluate(JS_ROW_HAS, {'s': 'A: FINISH', 'r': 24}))
    r = page.evaluate("() => { const c = CT.cheat(); return { c, cheats: GAME.state().s.cheats }; }")
    ok('結算畫面按密技無效', not r['c'] and r['cheats'] == 0, r)

    # ---------------- 密技 / 暫停 / 重來 / exit ----------------
    fresh(page, '&floor=6')
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(); const k0 = GAME.state().s.keys; CT.cheat(); __nes.step(1);
        const s = GAME.state().s; let known = g.known.reduce((a, b) => a + b, 0); let maxU = 0; for (let i = 0; i < 10; i++) { __nes.step(1); maxU = Math.max(maxU, __nes.stats().budget.used); }
        return { keys: s.keys - k0, boost: s.boost, cheated: s.cheated, known, N: g.W * g.H, goal: CT.get('labyrinth').goal(), maxU, over: __nes.stats().budget.overFrames }; }""")
    ok('遊玩中密技：地圖全開 + 頭燈全亮 20 秒 + 萬用鑰匙 1 把，之後 goal false', r['keys'] == 1 and r['boost'] > 1100 and r['cheated'] and r['known'] == r['N'] and not r['goal'], r)
    ok('地圖全開的大量寫入被佇列分攤（每幀 ≤ 140、不超預算）', r['maxU'] <= 140 and r['over'] == 0, r)
    fresh(page, '&floor=2')
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(); __nes.press('right', 20); __nes.press('down', 20); __nes.release(); __nes.step(5);
        __nes.tap('start', 1); __nes.step(1); const ft = g.ft, mp = NES.Music.isPaused(); __nes.step(60);
        return { p: g.paused, frozen: ft === g.ft, mp, ft }; }""")
    ok('§6-2 START 暫停：計時凍結、BGM 暫停', r['p'] and r['frozen'] and r['mp'], r)
    ok('§6-5 暫停畫面寫著 HOLD START+SELECT: MENU 與 B: RETRY FLOOR', page.evaluate(JS_ROW_HAS, {'s': 'HOLD START+SELECT: MENU', 'r': 28})
       and page.evaluate(JS_ROW_HAS, {'s': 'B: RETRY FLOOR', 'r': 2}))
    r = page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); return { p: CT.Labyrinth.dev.g().paused, mp: NES.Music.isPaused(), playing: NES.Music.state().playing }; }")
    ok('再按 START 恢復、BGM 接續', not r['p'] and not r['mp'] and r['playing'], r)
    r = page.evaluate("""() => { const g = CT.Labyrinth.dev.g(), lv = g.lv; __nes.step(30); __nes.tap('start', 1); __nes.step(1); __nes.tap('b', 1); __nes.step(2);
        return { paused: g.paused, ft: g.ft, cx: g.p.cx + g.p.cy * lv.W === lv.start, floor: g.run.floor, over: __nes.stats().budget.overFrames }; }""")
    ok('友善版：暫停中 B = 重來這一層（計時歸零、回起點、整片重畫不超預算）', not r['paused'] and r['ft'] <= 2 and r['cx'] and r['floor'] == 2 and r['over'] == 0, r)
    r = page.evaluate("() => { __nes.press('select', 2); __nes.press(['select','start'], 40); __nes.step(42); __nes.release(); __nes.step(1); return CT.Labyrinth.dev.g().paused; }")
    ok('START+SELECT 不觸發暫停', not r, r)
    r = page.evaluate("() => { try { CT.get('labyrinth').exit(); return { ok: true, playing: NES.Music.state().playing }; } catch (e) { return { ok: false, e: String(e) }; } }")
    ok('§6-3 exit()：存檔不出錯、音樂停', r['ok'] and not r['playing'], r)

    # ---------------- ?seed= 可重現 ----------------
    fresh(page, '&seed=4242')
    a1 = page.evaluate("() => { const g = CT.Labyrinth.dev.g(); return { kind: g.run.kind, grid: g.lv.grid.join(''), start: g.lv.start }; }")
    fresh(page, '&seed=4242')
    a2 = page.evaluate("() => { const g = CT.Labyrinth.dev.g(); return { grid: g.lv.grid.join(''), start: g.lv.start }; }")
    fresh(page, '&seed=4243')
    a3 = page.evaluate("() => CT.Labyrinth.dev.g().lv.grid.join('')")
    ok('?seed= 隨機模式可重現（同種子同迷宮、換種子不同）', a1['kind'] == 'rand' and a1['grid'] == a2['grid'] and a1['start'] == a2['start'] and a3 != a1['grid'])

    # ---------------- 每層開局畫面 lint ----------------
    bad = []
    for n in range(1, 10):
        fresh(page, '&floor=%d' % n)
        r = page.evaluate("() => { __nes.step(20); const l = __nes.lint(); return { ok: l.ok, colors: l.colors, over: __nes.stats().budget.overFrames }; }")
        if not (r['ok'] and r['colors'] <= 25 and r['over'] == 0):
            bad.append((n, r))
    ok('9 層開局畫面全部 lint 綠（≤ 25 色）、overFrames 0', not bad, bad)

    # ---------------- 機器人：從標題開始，過 3 層（goal） ----------------
    fresh(page, '&bot=1')
    hl = page.evaluate("""() => { let ml = 0, peak = 0, i;
        for (i = 0; i < 12000; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); if (CT.get('labyrinth').goal()) break; }
        const s = GAME.state().s; return { frames: i, goal: CT.get('labyrinth').goal(), ml, peak, over: __nes.stats().budget.overFrames, cleared: s.cleared, cheats: s.cheats, bot: s.bot, attrPeak: s.attrPeak }; }""")
    ok('機器人（從標題開始、解題器 + 十字鍵）不開密技連過 3 層（goal）', hl['goal'] and hl['cheats'] == 0 and hl['cleared'] == 3, hl)
    ok('機器人全程每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', hl['ml'] <= 8 and hl['over'] == 0 and hl['peak'] <= 160, hl)
    full = page.evaluate("""() => { let ml = 0, peak = 0, i;
        for (i = 0; i < 30000; i++) { __nes.step(1); const s = __nes.stats(); ml = Math.max(ml, s.maxSpritesLine); peak = Math.max(peak, s.budget.used); if (GAME.state().s.mode === 'end') break; }
        const s = GAME.state().s; return { frames: i, mode: s.mode, cleared: s.cleared, ml, peak, over: __nes.stats().budget.overFrames, best: +localStorage.getItem('nes.cart3.labyrinth.best'), bt: CT.get('labyrinth').bestText(), lint: __nes.lint().ok }; }""")
    ok('機器人續跑完 9 層 → 結局、總時間寫進最佳紀錄、bestText = mm:ss', full['mode'] == 'end' and full['cleared'] == 9 and full['best'] > 0 and ':' in full['bt'] and full['lint'], full)
    ok('全 9 層每線 ≤ 8、overFrames 0、單幀 ≤ 160 byte', full['ml'] <= 8 and full['over'] == 0 and full['peak'] <= 160, full)
    ok('頁面無 JS 錯誤', not errs, errs[:3])

    browser.close(); pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_labyrinth: %d/%d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
