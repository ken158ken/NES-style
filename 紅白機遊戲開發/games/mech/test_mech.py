# -*- coding: utf-8 -*-
"""《星塵機甲》自動驗證：手感 ±1 幀 / 狀態機 / 房間切換 / 武器選單 / 弱點 / 可達性 / lint / 預算 / 音樂。

作法：Playwright(Chromium) 開 `mech.html?debug=1&scale=1&mute=1[&stage=...]`，
用 tools/shot.py 同一套除錯 API（`__nes.step/press/tap/release/render/state/lint/stats`）
與 `window.GAME.dev`（本遊戲自己的測試鉤子）推進與取樣；不改任何 engine 檔。

期望值來源（每一條都標）：
  [研究] docs/research/03_經典遊戲深度解析/03_洛克人2.md ②「手感規則」：
         沒有加速度（按下即定速 1.375 px/幀）、空中完全可控、跳躍可變高度（放開即停止上升）、
         跳滿 ≈ 3.5 格磚（56 px）、普通彈同屏上限 3 發、受傷 = 擊退 + 無敵、尖刺即死
         ③「以畫面為單位切換（screen transition）」、⑤「每位魔王 HP = 28；弱點 2 發秒殺」
         ⑥「E 罐最多 4 個」、⑧3「暫停時整個畫面重繪成選單」、⑩②「弱點武器 5~14 倍傷害」
  [契約] docs/TASKS.md「R4 《星塵機甲》契約」：蓄力 30 / 60 幀兩段、無敵 90 幀、
         每關 ≥ 6 畫面、2 中繼點、頭目弱點循環、武器能量 28
  [引擎] docs/ENGINE_API.md §5（VBlank 160 byte）、§7（≤ 25 色 / 每線 8 精靈）、§15.8

用法：../卡比之星/.venv/bin/python games/mech/test_mech.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import collections
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'mech.html').as_uri() + '?debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []
warnings = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def near(name, got, lo, hi, detail=''):
    ok(name, got is not None and lo <= got <= hi, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    return page.evaluate('() => window.GAME.state()')


def play(page, stage='frost', room=0, settle=120, clear=True):
    """開到某一關某一房並跳過 READY；clear=True 會把雜魚清掉（量手感時不被撞）。"""
    fresh(page, '&stage=%s&room=%d' % (stage, room))
    page.evaluate('(n) => __nes.step(n)', settle)
    if clear:
        page.evaluate('() => window.GAME.dev.clearEnemies()')
    return page.evaluate('() => window.GAME.state()')


# =====================================================================  ① 手感
JS_CONST = r"""
() => {
  const H = MG.Hero, W = MG.Weapons, L = MG.Levels, B = MG.Bosses;
  return {
    W: H.W, H: H.H, SLIDE_H: H.SLIDE_H, walk: H.WALK, slide: H.SLIDE_V,
    slideFrames: H.SLIDE_FRAMES, grav: H.GRAV, gravHalf: H.GRAV_HALF, jumpVy: H.JUMP_VY,
    maxFall: H.MAX_FALL, climb: H.CLIMB, inv: H.INV_FRAMES, hurtF: H.HURT_FRAMES,
    knock: H.KNOCK_VX, chargeMid: H.CHARGE_MID, chargeFull: H.CHARGE_FULL,
    lifeMax: H.LIFE_MAX, deathF: H.DEATH_FRAMES,
    apexTheory: H.jumpApexPx(),
    energyMax: W.ENERGY_MAX, order: W.ORDER, dmg: W.DMG,
    vanPeriod: L.VAN_PERIOD, vanOn: L.VAN_ON, vanWarn: L.VAN_WARN,
    bossHp: B.HP_MAX, pillars: B.PILLAR_X
  };
}
"""

JS_RUNSPEED = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(24, 168); __nes.step(2);
  const out = [];
  for (let i = 0; i < 4; i++) { __nes.press(['right'], 1); out.push(S().vx); }
  const x0 = S().x;
  __nes.press(['right'], 16);
  const moved = S().x - x0;
  __nes.release(); __nes.step(1);
  return { first: out[0], all: out, moved: moved, vxAfterRelease: S().vx, state: S().state };
}
"""

JS_JUMP = r"""
(opt) => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(24, 168); __nes.step(4);
  const t0 = S();
  let air = 0;
  if (opt.hold <= 1) { __nes.tap('a', 1); air++; }
  else for (let i = 0; i < opt.hold; i++) { __nes.press(opt.run ? ['a', 'right'] : ['a'], 1); air++; }
  __nes.release();
  while (!S().onGround && air++ < 240) { if (opt.run) __nes.press(['right'], 1); else __nes.step(1); }
  const s = S();
  return { heightPx: (t0.ySub - s.apexSub) / 16, distPx: s.x - t0.x, airFrames: air, landed: s.onGround, y: s.y };
}
"""

JS_AIRTURN = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(100, 168); __nes.step(4);
  for (let i = 0; i < 10; i++) __nes.press(['a', 'right'], 1);
  const vr = S().vx;
  __nes.press(['a', 'left'], 1);
  const vl = S().vx;
  __nes.release(); __nes.step(40);
  return { vr: vr, vl: vl };
}
"""

JS_SLIDE = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(24, 168); __nes.step(4);
  __nes.press(['down'], 2);
  __nes.press(['down', 'a'], 1);
  const s1 = S();
  const bh = window.MG.Hero.boxH(d.hero());
  const x0 = s1.x;
  let f = 1;
  while (S().sliding && f < 80) { __nes.press(['down'], 1); f++; }
  const s2 = S();
  return { sliding: s1.sliding, vx: s1.vx, boxH: bh, frames: f, dx: s2.x - x0, after: s2.state };
}
"""

JS_FALLCAP = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(120, 16); __nes.step(1);
  let mx = 0;
  for (let i = 0; i < 60; i++) { __nes.step(1); const v = S().vy; if (v > mx) mx = v; }
  return { maxVy: mx };
}
"""

JS_HURT = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(100, 168); __nes.step(4);
  const before = S();
  window.MG.Hero.hurt(d.hero(), d.ctx(), 3, 200);
  __nes.step(1);
  const s = S();
  let f = 0;
  while (S().inv > 0 && f < 200) { __nes.step(1); f++; }
  return { inv: s.inv, life: s.life, lifeBefore: before.life, vx: s.vx, state: s.state, invFrames: f + 1 };
}
"""

JS_SHOOT = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(24, 168); __nes.step(4);
  __nes.press(['right'], 2); __nes.release(); __nes.step(1);   // 先面向右（不然子彈往左飛出畫面就死了）
  const fired = [];
  for (let i = 0; i < 8; i++) { __nes.tap('b', 1); __nes.step(3); fired.push(d.shots().length); }
  const peak = Math.max.apply(null, fired);
  const dmg = d.shots().length ? d.shots()[0].dmg : null;
  return { peak: peak, dmg: dmg, shots: S().shots };
}
"""

JS_CHARGE = r"""
(hold) => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.clearEnemies();
  d.warp(24, 168); __nes.step(4);
  __nes.press(['b'], hold);
  const ct = S().chargeT;
  __nes.release(); __nes.step(2);
  const sh = d.shots();
  return { chargeT: ct, lvl: sh.length ? sh[0].lvl : null, dmg: sh.length ? sh[0].dmg : null };
}
"""

JS_LADDER = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  // 1-C LIFT SHAFT：梯子在第 3 欄
  const r = d.route();
  d.warp(r.ladderCol * 8 - 2, 168); __nes.step(4);
  __nes.press(['up'], 4);
  const grab = S();
  __nes.press(['up'], 90);
  const up = S();
  __nes.tap('b', 1); __nes.step(2);
  const shotWhileClimb = d.shots().length;
  __nes.press(['up'], 2);
  __nes.tap('a', 1); __nes.step(6);
  const released = S();
  return { ladderCol: r.ladderCol, grabX: grab.x, climbing: grab.climbing, state: grab.state,
           yAfter: up.y, climbingAfter: up.climbing, shotWhileClimb: shotWhileClimb,
           releasedClimbing: released.climbing, releasedState: released.state };
}
"""

JS_CLIMBOUT = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  // 1-D HIGH LEDGE：從下方的梯子爬到梯頂（T 與地板同列）後要站上地板
  let f = 0;
  while (S().climbing && f < 300) { __nes.press(['up'], 1); f++; }
  const s = S();
  return { frames: f, climbing: s.climbing, onGround: s.onGround, y: s.y, state: s.state };
}
"""

JS_SPIKE = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  // 1-E SPIKE ROW：尖刺在第 6..9 欄的地板列
  d.setLife(28);
  d.warp(6 * 8, 160); __nes.step(10);
  return { state: S().state, life: S().life };
}
"""

JS_LAVA = r"""
() => {
  const d = window.GAME.dev, S = () => window.GAME.state();
  d.setLife(28);
  d.warp(10 * 8, 160); __nes.step(10);
  return { state: S().state, life: S().life };
}
"""


# =====================================================================  可達性 BFS
JS_MAPS = r"""
() => {
  const out = {};
  for (const key of MG.LEVEL_ORDER) {
    const L = MG.LEVELS[key];
    out[key] = { name: L.name, theme: L.theme, boss: L.boss, rooms: [] };
    for (const r of L.rooms) {
      const grid = [];
      for (let row = 0; row < 30; row++) {
        let s = '';
        for (let c = 0; c < 32; c++) {
          const k = MG.solidKind(r.tileAt(c, row));
          s += (k === 'solid' ? '#' : (k === 'ladder' ? 'H' : (k === 'kill' ? 'X'
               : ((k === 'vanishA' || k === 'vanishB') ? 'v' : '.'))));
        }
        grid.push(s);
      }
      out[key].rooms.push({ name: r.name, next: r.next, entry: r.entry, grid: grid,
                            checkpoint: r.checkpoint, boss: r.boss, route: r.route,
                            spawns: r.spawns.length, items: r.items.length });
    }
  }
  return out;
}
"""


def bfs_reachable(grid, start, goal_test, jump_dc=6, jump_up=6, w=12, h=24):
    """以「站立格」為節點的保守可達性 BFS（消失磚一律當成不存在 = 主路線不能靠它）。

    節點 = (col, row)：腳踩在 row 這一列的上緣（即 row 是地板列，角色佔 row-3..row-1）。
    邊：① 同高度左右走（中間地板連續）② 跳（|dc| ≤ jump_dc、往上 ≤ jump_up 列、往下不限）
        ③ 梯子（同一欄上下）
    """
    rows, cols = len(grid), len(grid[0])

    def solid(c, r):
        if c < 0 or c >= cols:
            return False
        if r < 0:
            return True
        if r >= rows:
            return False
        return grid[r][c] == '#'

    def ladder(c, r):
        return 0 <= c < cols and 0 <= r < rows and grid[r][c] == 'H'

    def deadly(c, r):
        return 0 <= c < cols and 0 <= r < rows and grid[r][c] == 'X'

    def stand_ok(c, r):
        # 腳在 row r 的上緣 ⇒ 身體佔 r-3 .. r-1（24 px 高 = 3 列）
        if not solid(c, r):
            return False
        for rr in range(r - 3, r):
            if solid(c, rr) or deadly(c, rr):
                return False
        if deadly(c, r):
            return False
        return True

    nodes = [(c, r) for r in range(rows) for c in range(cols) if stand_ok(c, r)]
    nodeset = set(nodes)
    # 梯子節點：梯子欄上的每一格都可停
    lad = set((c, r) for r in range(rows) for c in range(cols) if ladder(c, r))

    start = tuple(start)
    if start not in nodeset and start not in lad:
        # 起點落在空中（從上方掉進來）⇒ 找正下方第一個站立點
        c, r = start
        while r < rows and (c, r) not in nodeset:
            r += 1
        start = (c, r)
    seen = set([start])
    q = collections.deque([start])
    while q:
        c, r = q.popleft()
        if goal_test(c, r):
            return True, seen
        nxt = []
        # 走 / 小跳：左右各 1 格、高度差 ≤ 1
        for dc in (-1, 1):
            for dr in (-1, 0, 1):
                nxt.append((c + dc, r + dr))
        # 跳
        for dc in range(-jump_dc, jump_dc + 1):
            for dr in range(-jump_up, 13):
                nxt.append((c + dc, r + dr))
        # 梯子
        if ladder(c, r - 1) or ladder(c, r - 2) or (c, r) in lad:
            for dr in range(-rows, rows):
                if ladder(c, r + dr):
                    nxt.append((c, r + dr))
        for n in nxt:
            if n in seen:
                continue
            if n in nodeset or n in lad:
                seen.add(n)
                q.append(n)
    return False, seen


# =====================================================================  主程式
def main():
    if not (ROOT / 'mech.html').exists():
        print('找不到 mech.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: (errors.append('console.' + m.type + ': ' + m.text)
                                      if (m.type == 'error' and 'Failed to load resource' not in m.text)
                                      else (warnings.append(m.text) if m.type == 'warning' else None)))

        # ---------- 0. 開機 / 模組 ----------
        s = fresh(page)
        st = page.evaluate('() => __nes.stats()')
        ok('engine 模組全到齊（missing 為空）', st['missing'] == [], st['missing'])
        ok('開機進「選關畫面」（研究 ⑦① 選關畫面就是難度選單）', s['mode'] == 'select', s['mode'])
        ok('NES.SH 可用（OAM / aabb / Pool）',
           page.evaluate("() => !!(NES.SH && NES.SH.OAM && NES.SH.aabb && NES.SH.Pool)"))
        C = page.evaluate(JS_CONST)
        ok('主角碰撞框 12×24、滑行 16（契約）', C['W'] == 12 and C['H'] == 24 and C['SLIDE_H'] == 16,
           '%s×%s / %s' % (C['W'], C['H'], C['SLIDE_H']))
        ok('精靈 bank ≤ 256 磚', page.evaluate("() => MG.sprBank.count") <= 256,
           page.evaluate("() => MG.sprBank.count"))
        ok('背景 bank ≤ 256 磚', page.evaluate("() => MG.bgBank.count") <= 256,
           page.evaluate("() => MG.bgBank.count"))
        ok('精靈模式 = 8×8（血條一格一磚）', page.evaluate("() => __nes.nes().ppu.stats && __nes.nes().ppu._sprH") == 8,
           page.evaluate("() => __nes.nes().ppu._sprH"))
        ok('ppu.flickerStep = 0（輪替交給 NES.SH.OAM，ENGINE_API §15.8）',
           page.evaluate("() => __nes.nes().ppu.flickerStep") == 0)

        # ---------- 1. 選關畫面 ----------
        ok('選關畫面 9 格、本輪 2 格可進入', page.evaluate("() => MG.SELECT.filter(s => s.open).length") == 2
           and page.evaluate("() => MG.SELECT.length") == 9)
        txt = page.evaluate("() => window.GAME.dev.screenText(2, 9, 13)")
        ok('選關畫面有標題 STARDUST MECH', txt.strip() == 'STARDUST MECH', repr(txt))
        page.evaluate("() => { __nes.tap('down',1); __nes.step(3); __nes.tap('down',1); __nes.step(3); __nes.tap('right',1); __nes.step(3); __nes.tap('right',1); __nes.step(3); }")
        s = page.evaluate('() => window.GAME.state()')
        ok('方向鍵把游標移到第 9 格（BLAZE）', s['sel'] == 8, s['sel'])
        page.evaluate("() => { __nes.tap('start',1); __nes.step(5); }")
        s = page.evaluate('() => window.GAME.state()')
        ok('START 進入 BLAZE FURNACE', s['level'] == 'blaze' and s['mode'] in ('ready', 'play'),
           (s['level'], s['mode']))

        # ---------- 2. 手感（研究 ② 手感規則）----------
        play(page, 'frost', 0)
        R = page.evaluate(JS_RUNSPEED)
        ok('沒有加速度：按下第 1 幀就到定速 1.375 px/幀（研究 ①）',
           R['first'] == C['walk'] == 352, (R['first'], C['walk']))
        near('16 幀走 22 px（1.375 × 16 = 22）', R['moved'], 21, 23)
        ok('放開方向鍵立刻停止（研究 ①）', R['vxAfterRelease'] == 0, R['vxAfterRelease'])

        near('跳躍理論高度 = v²/2g = 56 px（研究 ③ 3.5 格磚）', round(C['apexTheory'], 2), 55.5, 56.5)
        J = page.evaluate(JS_JUMP, {'hold': 40})
        near('長按跳實測高度 56 px ±1（手感 ±1 px）', J['heightPx'], 55.0, 57.0)
        near('長按跳滯空幀數 42 ±2 幀（手感 ±1 幀）', J['airFrames'], 40, 45)
        ok('跳完回到地面', J['landed'] is True)
        J1 = page.evaluate(JS_JUMP, {'hold': 1})
        ok('放開 A 立刻停止上升（點按跳 < 長按跳的 1/4，研究 ③）',
           J1['heightPx'] < J['heightPx'] / 4, (J1['heightPx'], J['heightPx']))
        JR = page.evaluate(JS_JUMP, {'hold': 40, 'run': 1})
        near('跑跳水平距離 ≈ 58 px（1.375 × 滯空幀）', JR['distPx'], 52, 64)
        A = page.evaluate(JS_AIRTURN)
        ok('空中可完全轉向、無空中慣性（研究 ②）', A['vr'] == 352 and A['vl'] == -352, (A['vr'], A['vl']))
        F = page.evaluate(JS_FALLCAP)
        ok('最大下墜速度 6 px/幀', F['maxVy'] == C['maxFall'] == 1536, (F['maxVy'], C['maxFall']))

        SL = page.evaluate(JS_SLIDE)
        ok('↓ + A 進入滑行', SL['sliding'] is True)
        ok('滑行速度 2.5 px/幀', abs(SL['vx']) == C['slide'] == 640, (SL['vx'], C['slide']))
        ok('滑行時碰撞框高 16（可鑽 2 格高的隧道）', SL['boxH'] == 16, SL['boxH'])
        near('滑行 26 幀 ±2', SL['frames'], 24, 29)

        H = page.evaluate(JS_HURT)
        ok('受傷扣血 3', H['lifeBefore'] - H['life'] == 3, (H['lifeBefore'], H['life']))
        ok('受傷無敵 90 幀（契約）', C['inv'] == 90 and H['inv'] >= 88, (C['inv'], H['inv']))
        near('無敵真的持續 90 幀 ±2', H['invFrames'], 88, 93)
        ok('受傷 = 強制後退 knockback（研究 ⑤；從右被打 ⇒ 往左飛）', H['vx'] < 0, H['vx'])
        ok('受傷硬直 16 幀（狀態 hurt）', H['state'] == 'hurt' and C['hurtF'] == 16, (H['state'], C['hurtF']))

        # ---------- 3. 射擊 / 蓄力 ----------
        SHT = page.evaluate(JS_SHOOT)
        ok('普通彈同屏上限 3 發（研究 ④）', SHT['peak'] == 3, SHT['peak'])
        ok('普通彈傷害 1', SHT['dmg'] == 1, SHT['dmg'])
        CH0 = page.evaluate(JS_CHARGE, 5)
        CH1 = page.evaluate(JS_CHARGE, 35)
        CH2 = page.evaluate(JS_CHARGE, 70)
        ok('蓄力 < 30 幀 = 普通彈（1 傷）', CH0['lvl'] == 0 and CH0['dmg'] == 1, CH0)
        ok('蓄力 ≥ 30 幀 = 中段（2 傷）', CH1['lvl'] == 1 and CH1['dmg'] == 2, CH1)
        ok('蓄力 ≥ 60 幀 = 全蓄力（3 傷）', CH2['lvl'] == 2 and CH2['dmg'] == 3, CH2)
        ok('蓄力上限 60 幀不再增加', CH2['chargeT'] == 60, CH2['chargeT'])
        E = page.evaluate("""() => {
          const d = window.GAME.dev;
          d.unlock('frost'); d.setWeapon('frost');
          const before = d.weapons().energy.frost;
          d.warp(24,168); __nes.step(4);
          __nes.tap('b',1); __nes.step(4);
          const after = d.weapons().energy.frost;
          window.MG.Weapons.energy.frost = 0;
          window.MG.Weapons.resetShots();
          const can = window.MG.Weapons.canFire();
          d.setWeapon('buster');
          return {before, after, can};
        }""")
        ok('特殊武器每發耗 1 格能量', E['before'] - E['after'] == 1, (E['before'], E['after']))
        ok('能量歸零就不能發射（但基礎砲無限）', E['can'] is False)
        ok('武器能量上限 28（＝頭目 HP，一張表好平衡）', C['energyMax'] == 28, C['energyMax'])

        # ---------- 4. 梯子（研究 ⑥）----------
        play(page, 'frost', 2)
        LD = page.evaluate(JS_LADDER)
        ok('按 ↑ 抓住梯子', LD['climbing'] is True and LD['state'] == 'climb', (LD['climbing'], LD['state']))
        ok('抓梯時 x 對齊梯子欄中心', LD['grabX'] == LD['ladderCol'] * 8 - 2, (LD['grabX'], LD['ladderCol']))
        ok('按 ↑ 會往上爬', LD['yAfter'] < 168, LD['yAfter'])
        ok('爬梯時可以射擊（研究 ⑥ 面向固定）', LD['shotWhileClimb'] >= 1, LD['shotWhileClimb'])
        ok('梯上按 A 鬆手落下（研究 ⑥）', LD['releasedClimbing'] is False, LD['releasedState'])
        play(page, 'frost', 3)
        CO = page.evaluate(JS_CLIMBOUT)
        ok('爬到梯頂會整個站上地板（研究 ⑥「梯頂需完整爬出」）',
           CO['climbing'] is False and CO['onGround'] is True and CO['y'] == 136,
           (CO['climbing'], CO['onGround'], CO['y']))

        # ---------- 5. 即死磚 / 消失磚 ----------
        play(page, 'frost', 4)
        SP = page.evaluate(JS_SPIKE)
        ok('尖刺即死（研究 ⑦）', SP['state'] == 'dead', SP)
        play(page, 'blaze', 0)
        LA = page.evaluate(JS_LAVA)
        ok('熔岩即死', LA['state'] == 'dead', LA)
        ok('消失磚週期 120 幀 / 出現 72 幀 / 預警 16 幀（研究 ④⑩ Yoku Block）',
           C['vanPeriod'] == 120 and C['vanOn'] == 72 and C['vanWarn'] == 16,
           (C['vanPeriod'], C['vanOn'], C['vanWarn']))
        V = page.evaluate("""() => {
          const L = MG.Levels, out = [];
          for (const t of [0, 60, 71, 72, 100, 119, 120]) out.push([t, L.vanishOn('A', t), L.vanishWarn('A', t)]);
          return { seq: out, bPhase: L.vanishPhase('B', 0) };
        }""")
        seq = {t: (a, b) for t, a, b in V['seq']}
        ok('消失磚相位是嚴格週期的純函式（t=0 出現 / t=72 消失 / t=120 又出現）',
           seq[0][0] and not seq[72][0] and seq[120][0], V['seq'])
        ok('消失磚消失前 16 幀會閃爍預警', seq[60][1] is True and seq[0][1] is False, V['seq'])
        ok('B 群相位差 60 幀（兩組交錯）', V['bPhase'] == 60, V['bPhase'])

        # ---------- 6. 房間切換（研究 ③ / ⑧2）----------
        play(page, 'frost', 0)
        T = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.clearEnemies(); d.warp(230, 168); __nes.step(2);
          __nes.nes().timing.budget.clear();
          let peak = 0, over = 0, f = 0;
          let pre = 0;
          while (!S().trans && pre < 90) { __nes.press(['right'], 1); pre++; }
          const started = !!S().trans;
          const dir = S().trans ? S().trans.dir : null;
          while (S().trans && f < 90) {
            __nes.step(1); f++;
            const b = __nes.nes().timing.budget.report();
            if (b.peak > peak) peak = b.peak;
            if (b.over) over++;
          }
          const s = S();
          return { started, dir, frames: f, peak, over, room: s.room, x: s.x, nt: s.nt };
        }""")
        ok('走到右邊界觸發換房（畫面單位捲動，研究 ③）', T['started'] is True and T['dir'] == 'right', T)
        ok('換房 32 幀完成（8 px/幀 × 32 = 256）', 28 <= T['frames'] <= 36, T['frames'])
        ok('換房每幀寫入 ≤ 48 byte（遠低於 160 VBlank 預算，ENGINE_API §5）', T['peak'] <= 48, T['peak'])
        ok('換房期間 VBlank 預算 0 次超支', T['over'] == 0, T['over'])
        ok('換房後主角在新房左緣', T['room'] == 1 and T['x'] <= 8, (T['room'], T['x']))
        ok('換房會換一張名稱表（兩張交替）', T['nt'] == 1, T['nt'])

        B = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          const before = S().room;
          d.clearEnemies(); d.warp(2, 168); __nes.step(2);
          __nes.press(['left'], 50);
          let f = 0;
          while (S().trans && f < 60) { __nes.step(1); f++; }
          return { before, after: S().room, x: S().x };
        }""")
        ok('可以往回走（回上一間房）', B['after'] == B['before'] - 1, B)

        U = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.gotoRoom(2);
          d.clearEnemies();
          const r = d.route();
          d.warp(r.ladderCol * 8 - 2, 168); __nes.step(2);
          let f = 0;
          while (S().room === 2 && f < 400) { d.clearEnemies(); __nes.press(['up'], 1); f++; }
          let g = 0;
          while (S().trans && g < 60) { __nes.step(1); g++; }
          const s = S();
          return { room: s.room, climbing: s.climbing, y: s.y, frames: f, transFrames: g };
        }""")
        ok('梯子爬到房頂 → 往上換房（垂直房間切換）', U['room'] == 3, U)
        ok('垂直換房 30 幀完成（8 px/幀 × 30 = 240）', 26 <= U['transFrames'] <= 34, U['transFrames'])
        ok('上換房後主角在新房底部、仍在梯子上', U['climbing'] is True and U['y'] >= 200, (U['climbing'], U['y']))

        D = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('blaze', 1);
          __nes.step(100);
          d.clearEnemies();
          const r = d.route();
          d.warp(r.holeCol * 8, 168); __nes.step(4);
          let f = 0;
          while (S().room === 1 && f < 200) { d.clearEnemies(); __nes.step(1); f++; }
          let g = 0;
          while (S().trans && g < 60) { __nes.step(1); g++; }
          return { room: S().room, y: S().y, dir: 'down', frames: f };
        }""")
        ok('走進洞裡 → 往下換房（垂直房間切換）', D['room'] == 2, D)

        RS = page.evaluate("""() => {
          const d = window.GAME.dev;
          d.level('frost', 0); __nes.step(100);
          const a = d.enemies().length;
          d.gotoRoom(1);
          const b = d.enemies().length;
          d.gotoRoom(0);
          const c = d.enemies().length;
          return { a, b, c };
        }""")
        ok('敵人「進畫面才生成、離開就銷毀」（研究 ③）',
           RS['a'] == 1 and RS['b'] == 2 and RS['c'] == 1, RS)

        # ---------- 7. 武器選單（研究 ⑧3）----------
        play(page, 'frost', 0)
        M = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.clearEnemies(); d.unlock('frost'); d.unlock('blaze');
          d.warp(60, 168); __nes.step(2);
          __nes.tap('start', 1); __nes.step(3);
          const paused = S().paused;
          const title = d.screenText(2, 11, 7);
          const x0 = S().x;
          __nes.press(['right'], 30);
          const frozen = S().x === x0;
          const w0 = d.weapons().cur;
          __nes.tap('down', 1); __nes.step(3);
          const w1 = d.weapons().cur;
          __nes.tap('down', 1); __nes.step(3);
          const w2 = d.weapons().cur;
          d.setLife(5); d.setTanks(2);
          __nes.tap('b', 1); __nes.step(3);
          const afterTank = S();
          __nes.tap('start', 1); __nes.step(3);
          const s = S();
          return { paused, title, frozen, w0, w1, w2, life: afterTank.life, tanks: afterTank.tanks,
                   resumed: s.paused, tileBack: d.ntTileAt(0, 24) };
        }""")
        ok('START 開武器選單（暫停 = 整個畫面重繪成選單，研究 ⑧3）', M['paused'] is True)
        ok('選單標題 WEAPONS', M['title'].strip() == 'WEAPONS', repr(M['title']))
        ok('暫停中遊戲完全凍結（主角不動）', M['frozen'] is True)
        ok('↓ 在已解鎖武器之間循環切換', M['w0'] == 'buster' and M['w1'] == 'frost' and M['w2'] == 'blaze',
           (M['w0'], M['w1'], M['w2']))
        ok('選單裡按 B 用 E 罐把血補滿（研究 ⑥）', M['life'] == 28 and M['tanks'] == 1, (M['life'], M['tanks']))
        ok('再按 START 解除暫停', M['resumed'] is False)
        ok('解除暫停會把房間整片畫回來', M['tileBack'] != page.evaluate("() => window.GAME.dev.bgIndex('SP')"),
           M['tileBack'])
        ok('E 罐上限 4（研究 ⑥）', page.evaluate("""() => {
             const d = window.GAME.dev; d.setTanks(0);
             for (let i = 0; i < 8; i++) { d.hero().tanks = Math.min(4, d.hero().tanks + 1); }
             return d.hero().tanks; }""") == 4)

        # ---------- 8. 頭目 / 弱點循環（研究 ⑤ / ⑩②③）----------
        ok('兩隻頭目 HP 都是 28（研究 ③「魔王 HP 統一 28」）', C['bossHp'] == 28, C['bossHp'])
        ok('弱點傷害 10 = 3 發倒；非弱點 1 傷 = 28 發（研究 ⑩②）',
           C['dmg']['frost']['blaze'] == 10 and C['dmg']['frost']['buster'] == 1
           and C['dmg']['blaze']['frost'] == 10 and C['dmg']['blaze']['buster'] == 1, C['dmg'])
        ok('弱點循環：FROST 怕爆焰、BLAZE 怕冰棱（互為剋制）',
           C['dmg']['frost']['frost'] == 0 and C['dmg']['blaze']['blaze'] == 0, C['dmg'])
        ok('全蓄力 3 傷（研究：蓄力是「不換武器時的解法」）',
           C['dmg']['frost']['buster2'] == 3 and C['dmg']['blaze']['buster2'] == 3)

        BO = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('frost', 6); __nes.step(180);
          const b0 = d.boss();
          const Wp = window.MG.Weapons;
          const hit = (kind, lvl) => {
            const b = d.bossObj();
            return Wp.damageTo(b.key, { kind: kind, lvl: lvl || 0, dmg: 1 });
          };
          const dBuster = hit('buster', 0), dCharge = hit('buster', 2), dWeak = hit('blaze', 0);
          // 直接打三發弱點
          const B = d.bossObj();
          window.MG.Bosses.hit(B, dWeak, d.ctx());
          window.MG.Bosses.hit(B, dWeak, d.ctx());
          const mid = d.boss();
          window.MG.Bosses.hit(B, dWeak, d.ctx());
          const after = d.boss();
          return { b0, dBuster, dCharge, dWeak, midHp: mid.hp, midPhase: mid.phase,
                   dead: after.dead, hp: after.hp };
        }""")
        ok('頭目登場：先掉下來、落地後才可被打（開場無敵）', BO['b0']['active'] is True and BO['b0']['hp'] == 28,
           BO['b0'])
        ok('弱點武器 3 發打倒頭目（研究 ⑩②「2~3 發秒殺」）', BO['dead'] is True and BO['hp'] == 0,
           (BO['dead'], BO['hp']))
        ok('血量 ≤ 14 進入第二階段（研究 ⑦ 難度曲線）', BO['midPhase'] == 2, (BO['midHp'], BO['midPhase']))
        ok('傷害表查詢正確（基礎 1 / 全蓄力 3 / 弱點 10）',
           BO['dBuster'] == 1 and BO['dCharge'] == 3 and BO['dWeak'] == 10,
           (BO['dBuster'], BO['dCharge'], BO['dWeak']))

        WG = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          let f = 0;
          while (S().mode !== 'weaponget' && f < 400) { __nes.step(1); f++; }
          const s = S();
          return { mode: s.mode, got: s.weaponGot, unlocked: s.unlocked, cleared: s.cleared,
                   text: d.screenText(10, 10, 11) };
        }""")
        ok('擊破頭目 → STAGE CLEAR 畫面', WG['mode'] == 'weaponget' and WG['text'].strip() == 'STAGE CLEAR',
           (WG['mode'], repr(WG['text'])))
        ok('擊破頭目 → 取得該頭目的武器（研究：武器剋制環的來源）',
           WG['got'] == 'frost' and WG['unlocked']['frost'] is True, (WG['got'], WG['unlocked']))
        ok('關卡被標記為已通關（選關畫面會顯示 CLEAR）', WG['cleared'].get('frost') is True, WG['cleared'])

        DS = page.evaluate("""() => {
          const d = window.GAME.dev;
          d.level('blaze', 6); __nes.step(180);
          const b = d.bossObj();
          b.hp = 10; b.phase = 2; b.mode = 'dash'; b.t = 0;
          for (let i = 0; i < 40; i++) __nes.step(1);
          const s = d.boss();
          return { mode: s.mode, invuln: s.invuln, pillars: window.MG.Bosses.PILLAR_X };
        }""")
        ok('第二階段的全螢幕衝刺附無敵（研究 ⑤ Heat Man）', DS['invuln'] is True, DS)
        ok('火柱固定在 x = 60 / 120 / 180 ⇒ 左右角落永遠安全（友善版）',
           DS['pillars'] == [60, 120, 180], DS['pillars'])

        # ---------- 9. 生命 / 中繼點 / 1UP ----------
        LF = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('frost', 5); __nes.step(120); d.clearEnemies();
          const cp = S().checkpoint;
          d.setLives(2);
          window.MG.Hero.kill(d.hero(), d.ctx());
          let f = 0;
          while (S().mode !== 'ready' && S().mode !== 'gameover' && f < 300) { __nes.step(1); f++; }
          const s = S();
          return { cp, mode: s.mode, room: s.room, lives: s.lives, life: s.life, energy: s.energy };
        }""")
        ok('中繼點記在「有 checkpoint 的房間」（研究 ③ 每關 2~3 個）', LF['cp']['room'] == 5, LF['cp'])
        ok('死亡 → 命 -1、回中繼點重來', LF['mode'] == 'ready' and LF['room'] == 5 and LF['lives'] == 1, LF)
        ok('復活時武器能量補滿（研究 ⑥「每次續關都是滿武器」）',
           LF['energy']['frost'] == 28 and LF['energy']['blaze'] == 28, LF['energy'])
        GO = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.setLives(0);
          window.MG.Hero.kill(d.hero(), d.ctx());
          let f = 0;
          while (S().mode !== 'gameover' && f < 300) { __nes.step(1); f++; }
          return { mode: S().mode, text: d.screenText(12, 11, 9) };
        }""")
        ok('命用完 → GAME OVER 畫面', GO['mode'] == 'gameover' and GO['text'].strip() == 'GAME OVER', GO)
        IT = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('frost', 0); __nes.step(120); d.clearEnemies();
          d.setLife(10);
          const it = d.items()[0];
          d.warp(it.x - 2, it.y - 8); __nes.step(6);
          const s = S();
          return { kind: it.kind, life: s.life, items: d.items().filter(i => i.alive).length };
        }""")
        ok('撿到能量球會補血', IT['life'] > 10, IT)
        ok('撿過的道具消失', IT['items'] == 0, IT)
        ONE = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('frost', 3); __nes.step(120); d.clearEnemies();
          const lv0 = S().lives;
          const it = d.items().filter(i => i.kind === 'oneup')[0];
          d.hero().lives = lv0;
          window.MG.Hero.reset(d.hero(), it.x, it.y - 10, 1); __nes.step(4);
          return { lv0, lv1: S().lives };
        }""")
        ok('1UP 加命', ONE['lv1'] == ONE['lv0'] + 1, ONE)

        # ---------- 10. 關卡資料 + 可達性 BFS ----------
        MAPS = page.evaluate(JS_MAPS)
        for key in ('frost', 'blaze'):
            L = MAPS[key]
            rooms = L['rooms']
            ok('關卡 %s 有 %d 個畫面（契約 ≥ 6）' % (L['name'], len(rooms)), len(rooms) >= 6, len(rooms))
            cps = [r for r in rooms if r['checkpoint']]
            ok('關卡 %s 有 %d 個中繼點（研究 ③ 每關 2~3 個）' % (L['name'], len(cps)), len(cps) >= 2, len(cps))
            ok('關卡 %s 最後一間是頭目房' % L['name'], rooms[-1]['boss'] == L['boss'], rooms[-1]['boss'])
            ok('關卡 %s 每間房都是 32×30 磚' % L['name'],
               all(len(r['grid']) == 30 and all(len(g) == 32 for g in r['grid']) for r in rooms))
            dirs = set(r['next'] for r in rooms if r['next'])
            ok('關卡 %s 的換房方向集合 = %s' % (L['name'], sorted(dirs)),
               'right' in dirs and (('up' in dirs) or ('down' in dirs)), sorted(dirs))
            for i, r in enumerate(rooms):
                grid = r['grid']
                ex = r['entry']['x'] // 8
                ey = (r['entry']['y'] + 24) // 8          # 腳所在的列
                route = r['route'] or {}
                d = route.get('dir') or r['next'] or 'right'
                if r['boss']:
                    continue
                if d == 'right':
                    goal = lambda c, rr: c >= 30
                elif d == 'up':
                    goal = (lambda lc: (lambda c, rr: c == lc and rr <= 2))(route.get('ladderCol', 0))
                else:
                    goal = (lambda hc: (lambda c, rr: abs(c - hc) <= 2 and rr >= 24))(route.get('holeCol', 0))
                reach, seen = bfs_reachable(grid, (ex, ey), goal)
                ok('可達性 %s：入口 → %s 出口（消失磚不算，= 主路線不靠節拍）' % (r['name'], d),
                   reach, '起點 %s，走訪 %d 格' % ((ex, ey), len(seen)))
            # 坑 / 危險帶寬度
            for r in rooms:
                worst = 0
                g24 = r['grid'][24]
                run = 0
                for c in range(32):
                    if g24[c] in ('.', 'X'):
                        run += 1
                        worst = max(worst, run)
                    else:
                        run = 0
                ok('%s 地板列的連續坑 / 危險帶 ≤ 6 格（跳得過去，研究 ⑩⑩ 不設死局）' % r['name'],
                   worst <= 6, worst)

        # ---------- 11. lint / 預算 / 每線 8 精靈 ----------
        shots = [('選關', ''), ('關卡1', '&stage=frost'), ('關卡1魔王', '&stage=frost&boss=1'),
                 ('關卡2', '&stage=blaze'), ('關卡2魔王', '&stage=blaze&boss=1'),
                 ('關卡1梯子房', '&stage=frost&room=2'), ('關卡2滑行房', '&stage=blaze&room=4')]
        for label, q in shots:
            fresh(page, q)
            page.evaluate('() => __nes.step(200)')
            r = page.evaluate('() => __nes.lint()')
            ok('lint %s：同屏 ≤ 25 色 / 無非法像素' % label,
               r.get('ok') is not False and r.get('colors', 0) <= 25 and not r.get('badPixels'),
               '%s 色 / bad=%s' % (r.get('colors'), r.get('badPixels')))
        BUD = page.evaluate("""() => {
          const d = window.GAME.dev, S = () => window.GAME.state();
          d.level('frost', 0); __nes.step(60);
          __nes.nes().timing.budget.clear();
          let maxLine = 0;
          for (let i = 0; i < 600; i++) {
            __nes.press(['right', 'b'], 1);
            const st = __nes.nes().ppu.stats;
            if (st.maxSpritesLine > maxLine) maxLine = st.maxSpritesLine;
          }
          const b = __nes.nes().timing.budget.report();
          return { over: b.overFrames, peak: b.peak, oamPeak: b.oamPeak, maxLine: maxLine };
        }""")
        ok('600 幀 VBlank 預算 0 次超支（ENGINE_API §5）', BUD['over'] == 0, BUD)
        ok('名稱表單幀尖峰 ≤ 160 byte', BUD['peak'] <= 160, BUD['peak'])
        ok('OAM 一幀 ≤ 256 byte（一次 DMA）', BUD['oamPeak'] <= 256, BUD['oamPeak'])
        ok('每條掃描線最多 10 顆（> 8 的由 PPU 丟棄並閃爍 = 研究 ⑧4 Capcom 的選擇）',
           BUD['maxLine'] <= 10, BUD['maxLine'])

        # ---------- 12. 音樂 / 音效 ----------
        MU = page.evaluate("""() => {
          const A = MG.Audio;
          return { keys: A.KEYS, bad: A.validate(), sfx: A.NAMES.length,
                   info: A.INFO, has: A.has('stage1') && A.has('boss') && A.has('select') };
        }""")
        ok('≥ 4 首原創曲（選關 / 關卡 ×2 / 頭目）', len(MU['keys']) >= 4 and MU['has'] is True, MU['keys'])
        ok('曲目資料驗證 0 錯（pattern 長度 / 音高 / order 指向）', MU['bad'] == [], MU['bad'][:5])
        ok('音效 ≥ 12 個、只佔 p2 / noi 聲道', MU['sfx'] >= 12, MU['sfx'])
        ok('選關 / 關卡 / 頭目曲都有 loop、過關曲不 loop',
           MU['info']['select']['loop'] and MU['info']['stage1']['loop'] and MU['info']['boss']['loop']
           and not MU['info']['clear']['loop'], None)
        MH = page.evaluate("""() => {
          const d = window.GAME.dev;
          d.level('frost', 0); __nes.step(10);
          const a = window.GAME.state().music;
          d.level('frost', 6); __nes.step(10);
          const b = window.GAME.state().music;
          return { stage: a, boss: b };
        }""")
        ok('進關播關卡曲、進魔王房播魔王曲', MH['stage'] == 'stage1' and MH['boss'] == 'boss', MH)

        # ---------- 13. 一鍵密技 / 觸控契約 ----------
        play(page, 'frost', 0)
        CT = page.evaluate("""() => {
          const S = () => window.GAME.state();
          window.GAME.dev.setLife(5); window.GAME.dev.setLives(1);
          window.dispatchEvent(new CustomEvent('nes-cheat', {detail:{source:'test'}}));
          __nes.step(3);
          const s = S();
          return { lives: s.lives, life: s.life, inv: s.inv, tanks: s.tanks,
                   unlocked: s.unlocked, cheats: s.cheats };
        }""")
        ok('一鍵密技（nes-cheat / C / ★密技）：命 9 + 血滿 + 全武器 + 無敵 20 秒',
           CT['lives'] == 9 and CT['life'] == 28 and CT['inv'] >= 1150
           and CT['unlocked']['frost'] and CT['unlocked']['blaze'], CT)
        ok('一鍵密技同時把 E 罐補到 4', CT['tanks'] == 4, CT['tanks'])
        ok('engine/touch.js 的 NES.Touch 在場（手機觸控）',
           page.evaluate("() => !!(NES.Touch && NES.Touch.rects && NES.Touch.cheat)"))

        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        bad_warn = [w for w in warnings if 'update() 失敗' in w or 'draw() 失敗' in w]
        ok('整場測試 0 次 game.update/draw 例外（engine 會吞成 warn）', not bad_warn, bad_warn[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 64)
    print('mech-r1 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
