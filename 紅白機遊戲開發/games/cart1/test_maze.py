# -*- coding: utf-8 -*-
"""《星塵迷宮》（cart1 槽 1，id = maze）自動驗證：迷宮資料 / 註冊契約 / 手感 / 追兵 AI / 流程 / 硬限制 / 機器人。

作法：Playwright(Chromium) 開 `cart1.html?game=maze&debug=1&scale=1&mute=1`，
用 `__nes.step/press/tap/release/render/state/lint/stats` 推進，`CT.Maze.dev`（本遊戲的測試鉤子）佈置場面。
期望值來源：docs/R5_BRIEF.md §3（共同驗收）、§4 C5-1；maze/maps.js（Z.LEVELS 速度表）；ENGINE_API §5 / §7。

用法：../卡比之星/.venv/bin/python games/cart1/test_maze.py [-v] [--no-bot]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?game=maze&debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv
NO_BOT = '--no-bot' in sys.argv
BOT_MAX = 30000

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail != '' else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Maze && !!CT.Maze.dev')
    page.evaluate('() => { localStorage.clear(); }')
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Maze && !!CT.Maze.dev')
    page.evaluate('() => __nes.step(1)')


def S(page):
    return page.evaluate('() => GAME.state().s')


def to_play(page, level=0):
    """開局並跳過 READY；追兵全關回巢、主角無敵（量手感用）。"""
    fresh(page, '&level=%d' % level if level else '')
    if not level:
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(2); }')
    page.evaluate('() => __nes.step(160)')
    return S(page)


JS_MAPCHECK = r"""
() => {
  const Z = CT.Maze, out = [];
  const W = Z.MAP_W, H = Z.MAP_H;
  for (const m of Z.MAPS) {
    const g = m.rows, r = { name: m.name, h: g.length, w: Math.min(...g.map(s => s.length)), wmax: Math.max(...g.map(s => s.length)) };
    const open = (x, y) => { if (y < 0 || y >= H) return false; x = (x + W) % W; const c = g[y][x]; return c !== '#' && c !== '-' && c !== 'G'; };
    let dots = 0, stars = 0, sym = true, sq = 0, dead = 0;
    for (let y = 0; y < H; y++) {
      if (g[y].split('').reverse().join('').replace(/P/g, '.') !== g[y].replace(/P/g, '.')) sym = false;
      for (let x = 0; x < W; x++) {
        const c = g[y][x];
        if (c === '.') dots++;
        if (c === 'o') stars++;
        if (open(x, y)) {
          let n = 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (open(x + dx, y + dy)) n++;
          if (n < 2) dead++;
          if (x < W - 1 && y < H - 1 && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1)) sq++;
        }
      }
    }
    // 從出生點 BFS（含隧道環繞）
    const seen = new Set([Z.START.join(',')]), q = [Z.START.slice()];
    let reach = 0;
    while (q.length) { const [x, y] = q.shift(); const c = g[y][x]; if (c === '.' || c === 'o') reach++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = (x + dx + W) % W, ny = y + dy; if (!open(nx, ny)) continue; const k = nx + ',' + ny; if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
    r.dots = dots; r.stars = stars; r.sym = sym; r.square = sq; r.dead = dead; r.reach = reach;
    r.tunnel = g[Z.TUNNEL_ROW][0] !== '#' && g[Z.TUNNEL_ROW][W - 1] !== '#';
    r.door = g[Z.PEN.door[1]][Z.PEN.door[0]] === '-';
    r.exitOpen = open(Z.PEN.exit[0], Z.PEN.exit[1]);
    r.startOpen = g[Z.START[1]][Z.START[0]] === 'P';
    r.bonusOpen = open(Z.BONUS_TILE[0], Z.BONUS_TILE[1]);
    out.push(r);
  }
  // 兩兩差異（不同格數）
  const diff = [];
  for (let i = 0; i < Z.MAPS.length; i++) for (let j = i + 1; j < Z.MAPS.length; j++) {
    let d = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((Z.MAPS[i].rows[y][x] === '#') !== (Z.MAPS[j].rows[y][x] === '#')) d++;
    diff.push(d);
  }
  return { maps: out, diff };
}
"""

JS_BOT = r"""
(n) => { let peak = 0, oamMax = 0, done = false;
  for (let i = 0; i < n; i++) {
    __nes.step(1);
    const st = __nes.stats(); if (st.maxSpritesLine > peak) peak = st.maxSpritesLine;
    let on = 0; const o = __nes.nes().ppu.oam; for (let k = 0; k < 64; k++) if (o[k].on) on++;
    if (on > oamMax) oamMax = on;
    if (GAME.state().goal) { done = true; break; }
  }
  const st = __nes.stats();
  return { peak, oamMax, done, frame: st.frame, over: st.budget.overFrames, bpeak: st.budget.peak, s: GAME.state().s };
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

        # ---------------- ① 註冊契約 ----------------
        fresh(page)
        reg = page.evaluate('''() => { const g = CT.get('maze'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
            fns: ['init','update','draw','state','exit','cheat','bot','goal','bestText'].filter(k => typeof g[k] === 'function') }; }''')
        ok('註冊：CT.get("maze") 存在、order 1、標題 星塵迷宮', reg and reg['order'] == 1 and reg['title'] == '星塵迷宮', reg)
        ok('註冊：契約函式齊全（init/update/draw/state/exit/cheat/bot/goal/bestText）', reg and len(reg['fns']) == 9, reg and reg['fns'])
        ok('註冊：legacy 指向 pacman.html', reg and reg['legacy'] == ['pacman.html'])
        st = S(page)
        ok('開局：標題畫面（mode=title）、標題曲 maze_title', st['mode'] == 'title' and st['song'] == 'maze_title', st['mode'])
        lint = page.evaluate('() => __nes.lint()')
        ok('標題：lint 綠（≤ 25 色、0 違規）', lint['ok'] and lint['colors'] <= 25, lint.get('colors'))
        ok('bestText()：6 位數字串', len(page.evaluate('() => CT.get("maze").bestText()')) == 6)
        t20 = page.evaluate('() => CT.Maze.dev.rowText(27)')
        ok('P3-6 標題寫 C/★ = CHEAT（不是 C = CHEAT）', 'C/★ = CHEAT' in t20, t20)
        ok('P1-1 標題角色表改成一排圖示 + 名字（同一列 4 個名字）', all(n in page.evaluate('() => CT.Maze.dev.rowText(18)') for n in ['VEX', 'MOSS', 'ORBIT', 'SHARD']))

        # ---------------- ①b 視覺身分（P1-1：不是 Pac-Man 的招牌畫面） ----------------
        vis = page.evaluate('''() => { const d = CT.Maze.dev; return { walls: CT.Maze.MAPS.map(m => m.wall), sweep: d.CLEAR_SWEEP, spr: d.SPR_PALS,
            names: d.NAMES, stars: CT.Maze.MAPS.map(m => { const o = []; m.rows.forEach((r, y) => r.split('').forEach((c, x) => { if (c === 'o') o.push([x, y]); })); return o; }) }; }''')
        BLUE = lambda c: (c & 0x0F) in (0x1, 0x2, 0x3, 0xC) and c not in (0x30,)
        ok('P1-1 四張迷宮牆色都不是藍 / 青藍（色相 1/2/3/C 不用）', all(not BLUE(c) for w in vis['walls'] for c in w[:2]), vis['walls'])
        ok('P1-1 四張迷宮牆色互不相同', len(set(tuple(w[:2]) for w in vis['walls'])) == 4, vis['walls'])
        ok('P1-1 過關演出不閃白（彩虹掃牆表沒有 $30 / $20）', all(c not in (0x20, 0x30) for p in vis['sweep'] for c in p), vis['sweep'])
        ok('P1-1 能量星不放在四個角落', all(not (x in (1, 25) and y in (3, 19)) for o in vis['stars'] for x, y in o), vis['stars'])
        ok('P1-1 主角不是黃色（火箭調色盤沒有 $28 / $38）', all(c not in (0x28, 0x38) for c in vis['spr'][0]), vis['spr'][0])
        ch = [vis['spr'][1][0], vis['spr'][1][1], vis['spr'][2][0], vis['spr'][2][1]]
        RED_PINK_CYAN_ORANGE = lambda c: (c & 0x0F) in (0x4, 0x5, 0x6, 0x7, 0xC) or c in (0x27, 0x26)
        ok('P1-1 追兵配色避開紅 / 粉 / 青 / 橘', not any(RED_PINK_CYAN_ORANGE(c) for c in ch), ch)
        ok('P1-1 追兵改名（VEX / MOSS / ORBIT / SHARD）、追擊者不是紅色', vis['names'] == ['VEX', 'MOSS', 'ORBIT', 'SHARD'] and (ch[0] & 0x0F) not in (0x5, 0x6), (vis['names'], hex(ch[0])))
        wt = page.evaluate('() => CT.Maze.BG_TILES.W0')
        ok('P1-1 牆磚是實心星岩（不是外框雙線：中心像素有填色）', wt[4][4] != '.' and wt[3][3] != '.', wt)

        # ---------------- ② 迷宮資料 ----------------
        mc = page.evaluate(JS_MAPCHECK)
        maps = mc['maps']
        ok('迷宮：≥ 4 張', len(maps) >= 4, len(maps))
        ok('迷宮：每張 27×23', all(m['w'] == 27 and m['wmax'] == 27 and m['h'] == 23 for m in maps), [(m['w'], m['h']) for m in maps])
        ok('迷宮：每張左右鏡射對稱', all(m['sym'] for m in maps))
        ok('迷宮：沒有死路（每個走道格 ≥ 2 個出口）', all(m['dead'] == 0 for m in maps), [m['dead'] for m in maps])
        ok('迷宮：走道寬 1 格（沒有 2×2 空地）', all(m['square'] == 0 for m in maps), [m['square'] for m in maps])
        ok('迷宮：所有星屑 / 能量星都能從出生點走到', all(m['reach'] == m['dots'] + m['stars'] for m in maps), [(m['reach'], m['dots'] + m['stars']) for m in maps])
        ok('迷宮：每張 4 顆能量星、≥ 200 顆星屑', all(m['stars'] == 4 and m['dots'] >= 200 for m in maps), [(m['stars'], m['dots']) for m in maps])
        ok('迷宮：隧道（第 11 列兩端開口）、巢門、巢出口、出生點、獎勵格都在', all(m['tunnel'] and m['door'] and m['exitOpen'] and m['startOpen'] and m['bonusOpen'] for m in maps))
        ok('迷宮：四張彼此不同（任兩張 ≥ 40 格牆不同）', min(mc['diff']) >= 40, mc['diff'])
        lv = page.evaluate('() => CT.Maze.LEVELS')
        ok('難度：主角 / 追兵速度逐關遞增、能量星時間逐關遞減', all(lv[i + 1]['hero'] >= lv[i]['hero'] and lv[i + 1]['chase'] > lv[i]['chase'] and lv[i + 1]['fright'] < lv[i]['fright'] for i in range(len(lv) - 1)))
        ok('難度：追兵比主角慢（每關 chase < hero）、隧道裡更慢', all(l['chase'] < l['hero'] and l['tunnel'] < l['chase'] for l in lv))
        bank = page.evaluate('() => ({ bg: CT.Maze.dev.bg().count, spr: CT.Maze.dev.spr().count, bg0: CT.Maze.dev.bg().names[0] })')
        ok('CHR：背景 / 精靈 bank ≤ 256 磁磚、0 號 = 空白', bank['bg'] <= 256 and bank['spr'] <= 256 and bank['bg0'] == 'SP', bank)
        names = page.evaluate('() => Object.keys(CT.Maze.SONGS).concat(Object.keys(CT.Maze.SFX))')
        ok('聲音：曲名 / 音效名全部 maze_ 前綴、≥ 1 首 BGM + ≥ 4 個音效',
           all(n.startswith('maze_') for n in names) and len(page.evaluate('() => Object.keys(CT.Maze.SFX)')) >= 4, names)

        # ---------------- ③ 流程 / 手感 ----------------
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(3); }')
        st = S(page)
        ok('START → READY（mode=ready、出發曲 maze_start）', st['mode'] == 'ready' and st['song'] == 'maze_start', (st['mode'], st['song']))
        row1 = page.evaluate('() => CT.Maze.dev.rowText(1, 10, 22)')
        ok('開局字樣 LIFT OFF!（原創、寫在上方橫幅第 1 列，不是 READY!）', row1.strip() == 'LIFT OFF!', row1)
        ok('開局字樣：底列（第 27 列）沒有字', page.evaluate('() => CT.Maze.dev.rowText(27).trim()') == '')
        page.evaluate('() => __nes.step(160)')
        st = S(page)
        ok('READY 結束 → play、BGM maze_stage', st['mode'] == 'play' and st['song'] == 'maze_stage', (st['mode'], st['song']))

        to_play(page)
        page.evaluate('() => { CT.Maze.dev.park(); CT.Maze.dev.god(); CT.Maze.dev.warp(13, 17); }')
        x0 = S(page)['hero']['x']
        page.evaluate('() => __nes.press(["left"], 64)')
        st = S(page)
        moved = x0 - st['hero']['x']
        ok('手感：主角定點數速度（第 1 關 320/256 px/幀 → 64 幀 ≈ 80 px）', 76 <= moved <= 81, moved)
        ok('吃星屑：分數 +10 / 顆、剩餘數減少', st['score'] >= 10 * 8 and st['dots'] < st['dotsTotal'], (st['score'], st['dots']))
        page.evaluate('() => __nes.press(["left"], 120)')
        st2 = S(page)
        ok('撞牆停住（同一列一直往左，x 不再變）', st2['hero']['x'] == page.evaluate('() => { __nes.press(["left"], 20); return GAME.state().s.hero.x; }'), st2['hero'])

        # 隧道
        page.evaluate('() => { CT.Maze.dev.warp(1, 11); }')
        page.evaluate('() => __nes.press(["left"], 30)')
        st = S(page)
        ok('隧道：從左端走出去 → 出現在右端（x ≥ 176）', st['hero']['x'] >= 176 and st['hero']['t'][1] == 11, st['hero'])

        # 能量星
        to_play(page)
        page.evaluate('() => { CT.Maze.dev.park(); CT.Maze.dev.god(); }')
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.chasers[0].state = "out"; CT.Maze.dev.chaser(0, 5, 1); CT.Maze.dev.warp(3, 6); }')   # 能量星在 (3,5)
        page.evaluate('() => __nes.press(["up"], 12)')
        st = S(page)
        ok('能量星：追兵受驚（frightT = 第 1 關 480 左右）、BGM 換成 maze_fright',
           st['frightT'] > 400 and st['chasers'][0]['fright'] and st['song'] == 'maze_fright', (st['frightT'], st['song']))
        # 吃受驚追兵
        page.evaluate('() => { const h = GAME.state().s.hero.t; CT.Maze.dev.chaser(0, h[0], h[1]); }')
        sc0 = S(page)['score']
        page.evaluate('() => __nes.step(2)')
        st = S(page)
        ok('吃受驚追兵：+200、追兵變回巢的核心（eyes）', st['score'] - sc0 >= 200 and st['chasers'][0]['state'] == 'eyes', (st['score'] - sc0, st['chasers'][0]['state']))
        page.evaluate('() => __nes.step(40)')
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.chasers[1].state = "out"; g.chasers[1].fright = true; const h = GAME.state().s.hero; CT.Maze.dev.chaser(1, h.t[0], h.t[1]); g.hero.x = h.t[0]*8; g.hero.y = h.t[1]*8; }')
        sc1 = S(page)['score']
        page.evaluate('() => __nes.step(2)')
        ok('連吃第 2 隻：+400（倍增）', S(page)['score'] - sc1 >= 400, S(page)['score'] - sc1)
        page.evaluate('() => __nes.step(400)')
        st = S(page)
        ok('核心飛回巢後復活出巢（state ∈ leave/out、不再受驚）', st['chasers'][0]['state'] in ('leave', 'out') and not st['chasers'][0]['fright'], st['chasers'][0])

        # ---------------- ④ 追兵 AI 個性 ----------------
        to_play(page)
        ai = page.evaluate('''() => {
          const d = CT.Maze.dev, g = d.g(); d.god(); d.setPhase(1);   // 追擊波
          g.chasers.forEach((c, i) => { c.state = 'out'; c.fright = false; });
          // 焰尾：主角在 (1,21)，焰尾在 (13,17) 往左 → BFS 最短路方向
          d.warp(1, 21); g.hero.dir = 1; d.chaser(0, 13, 17); g.chasers[0].dir = 3;
          const flare = d.chooseDir(0);
          // 霧鏡：主角在 (13,17) 往右 → 目標 = 前方下一個路口，不是主角本身
          d.warp(13, 17); g.hero.dir = 1;
          const mist = d.target(1);
          // 環星：主角遠 → 巡邏點；近 → 主角
          d.chaser(2, 1, 1); d.warp(25, 21);
          const orbitFar = d.target(2);
          d.warp(3, 1);
          const orbitNear = d.target(2);
          // 碎晶：同一個路口重複問 40 次，方向不只一種
          d.chaser(3, 13, 17); g.chasers[3].dir = 0; d.warp(25, 1);
          const set = new Set(); for (let i = 0; i < 40; i++) set.add(d.chooseDir(3));
          // 散開波：目標 = 自己的角落
          d.setPhase(0);
          const home = [0,1,2,3].map(i => d.target(i));
          return { flare, mist, orbitFar, orbitNear, shard: set.size, home };
        }''')
        ok('刺棘 VEX（追擊）：沿 BFS 最短路（從 (13,17) 往左追向 (1,21)）', ai['flare'] == 3, ai['flare'])
        ok('苔莢 MOSS（包抄）：目標是主角前方的路口、不是主角所在格', ai['mist'] != [13, 17] and ai['mist'][1] == 17 and ai['mist'][0] > 13, ai['mist'])
        ok('環星 ORBIT（巡邏）：主角遠 → 巡邏點；主角進 8 格內 → 追主角', ai['orbitFar'] != [25, 21] and ai['orbitNear'] == [3, 1], (ai['orbitFar'], ai['orbitNear']))
        ok('碎晶 SHARD（亂走）：同一路口會選不同方向', ai['shard'] >= 2, ai['shard'])
        ok('散開波：四隻各回自己的角落（目標互不相同）', len(set(tuple(h) for h in ai['home'])) == 4, ai['home'])

        # ---------------- ⑤ 死亡 / 過關 / 獎勵 / 加命 ----------------
        to_play(page)
        lives0 = S(page)['lives']
        page.evaluate('() => { const d = CT.Maze.dev, g = d.g(); g.chasers[0].state = "out"; g.chasers[0].fright = false; const h = GAME.state().s.hero.t; d.chaser(0, h[0], h[1]); }')
        page.evaluate('() => __nes.step(3)')
        ok('碰到追兵 → dying', S(page)['mode'] == 'dying', S(page)['mode'])
        page.evaluate('() => __nes.step(120)')
        st = S(page)
        ok('死亡後命數 -1、回到 READY', st['lives'] == lives0 - 1 and st['mode'] == 'ready', (st['lives'], st['mode']))

        to_play(page)
        page.evaluate('() => { const d = CT.Maze.dev; d.park(); d.god(); d.eatAllBut(240); }')
        st0 = S(page)
        page.evaluate('() => { const d = CT.Maze.dev, g = d.g(); g.eaten = 69; }')
        page.evaluate('() => { CT.Maze.dev.warp(13, 17); __nes.press(["left"], 16); }')
        ok('獎勵：吃到第 70 顆時在巢下方出現獎勵道具', S(page)['bonus'] is not None, S(page)['bonus'])
        page.evaluate('() => { const d = CT.Maze.dev, g = d.g(); d.warp(13, 15); __nes.step(2); }')
        ok('獎勵：碰到就加分（bonusGot = 1）', S(page)['bonusGot'] == 1, S(page)['bonusGot'])
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.score = 9990; g.extraGiven = false; }')
        l0 = S(page)['lives']
        page.evaluate('() => { CT.Maze.dev.warp(13, 17); __nes.press(["right"], 30); }')
        ok('10000 分加 1 命', S(page)['lives'] == l0 + 1, (l0, S(page)['lives'], S(page)['score']))

        to_play(page)
        page.evaluate('() => { const d = CT.Maze.dev; d.park(); d.god(); d.eatAllBut(0); }')
        page.evaluate('() => __nes.step(2)')
        st = S(page)
        ok('吃光 → clear（過關數 1、過關曲）', st['mode'] == 'clear' and st['clears'] == 1 and st['song'] == 'maze_clear', (st['mode'], st['clears']))
        page.evaluate('() => __nes.step(150)')
        st = S(page)
        ok('過關 → 第 2 關換第 2 張迷宮（COMET YARD）', st['level'] == 2 and st['map'] == 1 and st['mapName'] == 'COMET YARD', (st['level'], st['mapName']))
        lint = page.evaluate('() => __nes.lint()')
        ok('第 2 關畫面 lint 綠', lint['ok'], lint.get('errors'))
        page.evaluate('() => { CT.Maze.dev.level(5); }')
        ok('第 5 關循環回第 1 張迷宮', S(page)['map'] == 0, S(page)['map'])

        # ---------------- ⑥ 暫停 / 密技 / GAME OVER ----------------
        to_play(page)
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(1); }')
        f0 = S(page)
        page.evaluate('() => __nes.press(["left"], 30)')
        f1 = S(page)
        ok('START 暫停：主角不動', f0['paused'] and f1['hero'] == f0['hero'], (f0['paused'], f0['hero'], f1['hero']))
        ok('暫停訊息 PAUSE 寫在上方橫幅', page.evaluate('() => CT.Maze.dev.rowText(1, 10, 22)').strip() == 'PAUSE')
        ok('§6-5 暫停畫面寫回選單方法 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in page.evaluate('() => CT.Maze.dev.rowText(27)'))
        mus = page.evaluate('() => { const d = __nes.music || NES.Music._default; return { playing: !!d.playing, cur: CT.Maze.Audio.current }; }')
        ok('§6-2 暫停 = BGM 停（driver.playing false）', not mus['playing'], mus)
        r0 = page.evaluate('() => { const d = __nes.music || NES.Music._default, a = d.rowsPlayed; __nes.step(60); return d.rowsPlayed - a; }')
        ok('§6-2 暫停 60 幀 BGM 不前進（rowsPlayed 不變）', r0 == 0, r0)
        page.evaluate('() => { __nes.tap("start", 1); __nes.step(1); }')
        ok('再按 START 解除暫停', not S(page)['paused'])
        mus = page.evaluate('() => ({ playing: !!(__nes.music || NES.Music._default).playing, cur: CT.Maze.Audio.current })')
        ok('§6-2 解除暫停 → 同一首 BGM 接續播放', mus['playing'] and mus['cur'] == 'maze_stage', mus)
        ok('§6-5 解除暫停 → 提示列清掉', page.evaluate('() => CT.Maze.dev.rowText(27).trim()') == '')
        l0 = S(page)['lives']
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(1); }')
        st = S(page)
        ok('一鍵密技（nes-cheat）：+1 命 + 追兵全體受驚、cheats = 1', st['lives'] == l0 + 1 and st['frightT'] > 0 and st['cheats'] == 1, (st['lives'], st['frightT'], st['cheats']))
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.clears = 3; }')
        ok('開過密技 → goal() 不成立（機器人驗收必須不開密技）', not page.evaluate('() => CT.get("maze").goal()'))
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.lives = 0; g.score = 4321; g.best = 4321; const d = CT.Maze.dev; g.chasers[0].state = "out"; g.chasers[0].fright = false; g.frightT = 0; const h = GAME.state().s.hero.t; d.chaser(0, h[0], h[1]); }')
        page.evaluate('() => __nes.step(120)')
        ok('最後一命死亡 → GAME OVER', S(page)['mode'] == 'over', S(page)['mode'])
        ok('GAME OVER 時最高分存檔（CT.load maze.best = 4321）', page.evaluate('() => CT.load("maze", "best", 0)') == 4321)
        # §6-1 GAME OVER 按密技 = 原地續關
        pre = S(page)
        page.evaluate('() => { window.dispatchEvent(new CustomEvent("nes-cheat", { detail: { source: "test" } })); __nes.step(2); }')
        st = S(page)
        ok('§6-1 GAME OVER 按密技 → 同一關續關（mode ready、level 不變）', st['mode'] == 'ready' and st['level'] == pre['level'], (st['mode'], st['level'], pre['level']))
        ok('§6-1 續關保留分數與已吃星屑、命數回開局值 3', st['score'] == pre['score'] and st['dots'] == pre['dots'] and st['lives'] == 3, (st['score'], st['dots'], st['lives']))
        ok('§6-1 續關後 GAME OVER 字樣換成 LIFT OFF!、cheats 累加、goal() 仍 false', page.evaluate('() => CT.Maze.dev.rowText(1, 10, 22)').strip() == 'LIFT OFF!' and st['cheats'] == pre['cheats'] + 1 and not page.evaluate('() => CT.get("maze").goal()'))
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.lives = 0; const d = CT.Maze.dev; d.god(false); __nes.step(110); g.chasers[0].state = "out"; g.chasers[0].fright = false; g.frightT = 0; const h = GAME.state().s.hero.t; d.chaser(0, h[0], h[1]); }')
        page.evaluate('() => __nes.step(120)')
        ok('續關後再死光 → 再次 GAME OVER', S(page)['mode'] == 'over', S(page)['mode'])
        page.evaluate('() => __nes.step(210)')
        ok('GAME OVER → 回到自己的標題', S(page)['mode'] == 'title')
        c0 = S(page)['cheats']
        r = page.evaluate('() => CT.get("maze").cheat()')
        page.evaluate('() => __nes.step(1)')
        ok('P3-7 標題畫面按密技無效（cheat() false、cheats 不變）', r is False and S(page)['cheats'] == c0, (r, S(page)['cheats'], c0))

        # §6-3 中途離開也存最高分
        fresh(page, '&level=1')
        page.evaluate('() => __nes.step(200)')
        page.evaluate('() => { const g = CT.Maze.dev.g(); g.score = 7777; g.best = 7777; CT.get("maze").exit(__nes); }')
        ok('§6-3 exit() 把目前分數寫入最高分（7777）', page.evaluate('() => CT.load("maze", "best", 0)') == 7777)
        # §6-4 backTile
        bt = page.evaluate('''() => { const g = CT.get("maze"), b = g.backTile, spr = CT.Maze.dev.spr();
            return b && { tile: b.tile, pal: b.pal, name: spr.names[b.tile], rows: CT.Maze.SPR_TILES.BACK }; }''')
        ok('§6-4 backTile = 自己精靈表的實心小星 BACK（pal 0）', bt and bt['name'] == 'BACK' and bt['pal'] == 0 and sum(r.count('3') for r in bt['rows']) >= 18, bt)

        # ---------------- ⑦ 機器人：連過 3 張迷宮（不開密技），逐幀量硬限制 ----------------
        if not NO_BOT:
            page.goto(BASE + '&bot=1')
            page.wait_for_function('() => !!window.__nes && !!CT.Maze')
            peak = 0; oam = 0; r = None; total = 0
            while total < BOT_MAX:
                r = page.evaluate(JS_BOT, 2000)
                total += 2000
                peak = max(peak, r['peak']); oam = max(oam, r['oamMax'])
                if r['done']:
                    break
            s = r['s']
            print('  bot: frame=%d clears=%d deaths=%d score=%d peakLine=%d oamMax=%d overFrames=%d budgetPeak=%d' % (
                r['frame'], s['clears'], s['deaths'], s['score'], peak, oam, r['over'], r['bpeak']))
            ok('機器人：連過 3 張迷宮（goal）、%d 幀內' % BOT_MAX, r['done'], (r['frame'], s['clears']))
            ok('機器人：沒開密技（cheats = 0）', s['cheats'] == 0)
            ok('機器人全程：每線精靈 ≤ 8（逐幀量）', peak <= 8, peak)
            ok('機器人全程：OAM 同時最多 8 顆（設計上限）', oam <= 8, oam)
            ok('機器人全程：VBlank 超支幀 = 0、尖峰 ≤ 160 byte', r['over'] == 0 and r['bpeak'] <= 160, (r['over'], r['bpeak']))
            lint = page.evaluate('() => __nes.lint()')
            ok('機器人結束畫面 lint 綠', lint['ok'], lint.get('errors'))

        ok('全程沒有 JS 例外', not errors, errors[:3])
        browser.close()

    n_ok = sum(1 for r in results if r[0])
    print('test_maze: %d / %d 通過' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
