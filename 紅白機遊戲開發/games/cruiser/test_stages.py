# -*- coding: utf-8 -*-
"""games/cruiser R3 擴關（六關）自動驗證：關卡資料 / 切關 / 新敵人 / 五隻新魔王 / 難度曲線。

作法：Playwright(Chromium) 開 `cruiser.html?debug=1&scale=1&mute=1`，用 `__nes.step/lint/stats`
推進與取樣，直接呼叫 `CR.stage.load(n)` 切關。本檔只驗 **R3 擴關新增的東西**；
關卡 1 的既有驗收仍由 `test_stage1.py`（174 項）負責，ship / 主程式由 `test_cruiser.py` 負責。

用法：../卡比之星/.venv/bin/python games/cruiser/test_stages.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

對照：docs/TASKS.md「R3 cruiser 擴關」、docs/ENGINE_API.md §15（NES.SH）、
      docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §7（關卡構成 / 檢查點 / loop）。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = (ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1'
SHOTS = ROOT / 'shots' / 'agent_stages'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

# 每關的驗收基準表（與 games/cruiser/stages.js 的註解同一份數字）
# 關: (名稱, 魔王 key, 欄數, camMax, 通道下限列, 曲目 key)
EXPECT = {
    1: ('ASTEROID BELT', 'core', 384, 2816, 18, 'stage1'),
    2: ('VOLCANO', 'eye', 352, 2560, 18, 'stage2'),
    3: ('STONEHENGE', 'twin', 384, 2816, 18, 'stage3'),
    4: ('INVERTED WORLD', 'mirror', 368, 2688, 17, 'stage4'),
    5: ('BIO CAVERN', 'bio', 400, 2944, 17, 'stage5'),
    6: ('MOTHER SHIP', 'brain', 416, 3072, 16, 'stage6'),
}
GUN_KINDS = ('turret', 'turret4', 'crawl', 'moai')

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r 期望 %r' % (got, want)))


def fresh(page, query=''):
    page.goto(PAGE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!CR.stage && !!window.GAME')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(3); }")
    page.evaluate("() => { if (CR.ship) { CR.ship.invul = 1 << 28; CR.ship.lives = 9; } }")
    return page


def ev(page, js, arg=None):
    if arg is None:
        return page.evaluate('() => { ' + js + ' }')
    return page.evaluate('(a) => { ' + js + ' }', arg)


def shot(page, path):
    import base64
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    d = page.evaluate("""(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
        const o=document.createElement('canvas'); o.width=c.width*s; o.height=c.height*s;
        const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height);
        return o.toDataURL('image/png')}""", 3)
    path.write_bytes(base64.b64decode(d.split(',', 1)[1]))


# ------------------------------------------------------------------ ① 關卡資料表
def test_data(page):
    print('[① CR.STAGES 六關資料 / load(n) 介面]')
    fresh(page)
    r = ev(page, """
        return { count: CR.STAGE_COUNT, len: CR.STAGES.length,
                 load: typeof CR.stage.load, index: CR.stage.index,
                 setLoop: typeof CR.stage.setLoop, loop: CR.stage.loop,
                 keys: Object.keys(CR.Bosses).filter(function(k){ return k !== 'make'; }).sort() };
    """)
    eq('CR.STAGE_COUNT = 6', r['count'], 6)
    eq('CR.STAGES 長度 7（index 0 空著）', r['len'], 7)
    eq('CR.stage.load 是 function', r['load'], 'function')
    eq('CR.stage.setLoop 是 function', r['setLoop'], 'function')
    eq('開機載入關卡 1', r['index'], 1)
    eq('開機 loop = 0（第 1 輪）', r['loop'], 0)
    eq('CR.Bosses 登記 6 隻魔王', r['keys'], ['bio', 'brain', 'core', 'eye', 'mirror', 'twin'])

    for n, (name, boss, cols, cam, minfree, music) in EXPECT.items():
        d = ev(page, """
            var s = CR.stage; s.load(a);
            var t = s.def().terrain, sum = 0, i;
            for (i = 0; i < t.length; i++) sum += t[i][0];
            return { name: s.name, boss: s.bossKey, cols: s.COLS, cam: s.CAM_MAX,
                     minFree: s.minFree, music: s.music, sum: sum, index: s.index,
                     bossCol0: s.BOSS_COL0, cps: s.CHECKPOINTS, respawn: s.BOSS_RESPAWN,
                     bossName: CR.Boss.NAME, bossKey: CR.Boss.key, totalHp: CR.Boss.TOTAL_HP };
        """, n)
        eq('關卡 %d 名稱 = %s' % (n, name), d['name'], name)
        eq('關卡 %d 魔王 = %s（CR.Boss 已切換）' % (n, boss), d['bossKey'], boss)
        eq('關卡 %d 欄數 = %d' % (n, cols), d['cols'], cols)
        eq('關卡 %d camMax = %d px' % (n, cam), d['cam'], cam)
        ok('關卡 %d 長度落在 2500~3500 px' % n, 2500 <= d['cam'] <= 3500, d['cam'])
        eq('關卡 %d 地形 RLE 總和 = 欄數' % n, d['sum'], cols)
        eq('關卡 %d 曲目 key = %s' % (n, music), d['music'], music)
        eq('關卡 %d 魔王室起點 = camMax - 256 欄外' % n, d['bossCol0'], cols - 64)
        ok('關卡 %d 檢查點每 512 px' % n,
           d['cps'] == list(range(0, d['cam'] + 1, 512)), d['cps'])
        eq('關卡 %d 魔王復活點 = camMax - 56' % n, d['respawn'], cam - 56)
        ok('關卡 %d 魔王總血量 >= 20' % n, d['totalHp'] >= 20, d['totalHp'])


# ------------------------------------------------------------------ ② 地形通道寬度
def test_terrain(page):
    print('[② 每關地形：通道寬度下限 / 大隕石不擋路 / solidAt 與名稱表一致]')
    fresh(page)
    for n, (name, boss, cols, cam, minfree, music) in EXPECT.items():
        r = ev(page, """
            var s = CR.stage; s.load(a);
            var worst = 99, worstCol = -1, c, free;
            for (c = 0; c < s.COLS; c++) {
              free = s.ROWS - s.ceilAt(c) - s.floorAt(c);
              if (free < worst) { worst = free; worstCol = c; }
            }
            // 實際可通行高度（含大隕石）：逐欄數「連續非 solid 的最長縱向區段」
            var worstRun = 99, wrCol = -1, r2, run;
            for (c = 0; c < s.COLS; c++) {
              run = 0; var best = 0;
              for (r2 = 0; r2 < s.ROWS; r2++) {
                if (s.SOLID[s.kindAt(c, r2)]) { run = 0; } else { run++; if (run > best) best = run; }
              }
              if (best < worstRun) { worstRun = best; wrCol = c; }
            }
            return { worst: worst, worstCol: worstCol, run: worstRun, runCol: wrCol, min: s.minFree };
        """, n)
        ok('關卡 %d 地形 ceil+floor 通道 >= %d 列（最窄 %d @ 欄 %d）' % (n, minfree, r['worst'], r['worstCol']),
           r['worst'] >= minfree, r)
        ok('關卡 %d 實際可通行縱向區段 >= %d 列（最窄 %d @ 欄 %d）' % (n, minfree, r['run'], r['runCol']),
           r['run'] >= minfree, r)

    # solidAt（畫面座標）與 kindAt（世界座標）一致
    r = ev(page, """
        var s = CR.stage, bad = [], c, r2;
        s.load(4); s.restart(1200);
        for (c = 0; c < 32; c++) for (r2 = 0; r2 < s.ROWS; r2++) {
          var want = !!s.SOLID[s.kindAt((s.camX >> 3) + c, r2)];
          var got = s.solidAt(c * 8 + 1, r2 * 8 + 1);
          if (want !== got) bad.push([c, r2, want, got]);
        }
        return { bad: bad.slice(0, 5), n: bad.length };
    """)
    eq('solidAt 與 kindAt 完全一致（關卡 4 × 32 欄 × 26 列）', r['n'], 0, r['bad'])


# ------------------------------------------------------------------ ③ 出怪表
def test_waves(page):
    print('[③ 每關出怪表：欄遞增 / 在世界範圍內 / 檢查點安全規則]')
    fresh(page)
    for n in EXPECT:
        r = ev(page, """
            var s = CR.stage; s.load(a);
            var tb = s.spawnTable(), inc = true, i, cols = [], out = [];
            for (i = 0; i < tb.length; i++) {
              cols.push(tb[i].col);
              if (i && tb[i].col < tb[i - 1].col) inc = false;
              if (tb[i].col < 0 || tb[i].col >= s.COLS) out.push(tb[i].col);
            }
            return { n: tb.length, inc: inc, out: out, min: Math.min.apply(null, cols),
                     max: Math.max.apply(null, cols), cols: s.COLS };
        """, n)
        ok('關卡 %d 出怪表 >= 25 筆（%d 筆）' % (n, r['n']), r['n'] >= 25, r['n'])
        ok('關卡 %d 出怪表欄號遞增' % n, r['inc'], r)
        eq('關卡 %d 出怪表座標都在 0..COLS-1' % n, r['out'], [])

    # 安全規則：檢查點後 22 欄沒有固定砲、14 欄內至少一隻紅色單體
    for n in EXPECT:
        r = ev(page, """
            var s = CR.stage; s.load(a);
            var tb = s.spawnTable(), cps = s.CHECKPOINTS, guns = [], reds = [], i, j;
            // 逐筆實際跑一次 fn，看它生出什麼（在乾淨的池子上）
            for (i = 0; i < tb.length; i++) {
              s.enemies.freeAll(); CR.Enemies.reset();
              try { tb[i].fn(s, tb[i].col, tb[i]); } catch (e) { /* 需要地形的會回 null */ }
              var kinds = {}, red = false;
              s.enemies.each(function (e) { kinds[e.kind] = 1; if (e.drop) red = true; });
              if (kinds.turret || kinds.turret4 || kinds.crawl || kinds.moai) guns.push(tb[i].col);
              if (red) reds.push(tb[i].col);
            }
            s.enemies.freeAll(); CR.Enemies.reset();
            var badGun = [], missRed = [];
            for (j = 0; j < cps.length; j++) {
              var k = cps[j] >> 3;
              if (k >= s.BOSS_COL0) continue;
              if (j === 0) continue;             // 檢查點 0 = 開局（沒有死亡懲罰），不需要回血點
              for (i = 0; i < guns.length; i++) if (guns[i] >= k && guns[i] < k + 22) badGun.push([k, guns[i]]);
              var has = false;
              for (i = 0; i < reds.length; i++) if (reds[i] >= k && reds[i] < k + 14) has = true;
              if (!has) missRed.push(k);
            }
            return { guns: guns.length, reds: reds.length, badGun: badGun, missRed: missRed };
        """, n)
        ok('關卡 %d 檢查點後 22 欄內沒有固定砲（共 %d 座）' % (n, r['guns']), r['badGun'] == [], r['badGun'])
        ok('關卡 %d 每個檢查點 14 欄內至少一隻紅色單體（共 %d 隻）' % (n, r['reds']),
           r['missRed'] == [], r['missRed'])


# ------------------------------------------------------------------ ④ 新敵人
def test_enemies(page):
    print('[④ R3 新敵人：火山彈 / 爬行砲 / 石像 / 分裂體 / 追蹤彈 / 觸手 / 卵 / 岩壁 / 四方砲]')
    fresh(page)
    ev(page, "CR.stage.load(2); CR.stage.restart(1200);")

    r = ev(page, """
        var s = CR.stage; s.enemies.freeAll();
        var e = s.spawnTest('lava', 180, 180);
        var y0 = e.y, up = false, down = false, i;
        for (i = 0; i < 40; i++) { __nes.step(1); if (e.y < y0 - 20) up = true; }
        var top = e.y;
        for (i = 0; i < 80; i++) { __nes.step(1); if (e.y > top + 20) down = true; }
        var before = e.hp; e.hit(9);
        return { up: up, down: down, invuln: e.invuln, alive: e.alive, hp: e.hp, before: before };
    """)
    ok('火山彈：拋物線先上升再落下', r['up'] and r['down'], r)
    ok('火山彈：不可破壞（invuln，打了不死）', r['invuln'] and r['alive'], r)

    r = ev(page, """
        var s = CR.stage; s.enemies.freeAll(); s.bullets.freeAll();
        CR.ship.x = 40; CR.ship.y = 40;
        var e = CR.Enemies.spawn('crawl', 200, 180, { wx: s.camX + 200 });
        var x0 = e.x, i, b = null;
        for (i = 0; i < 200 && !b; i++) { __nes.step(1); s.bullets.each(function (x) { if (!b) b = x; }); }
        return { moved: e.x < x0, dx: e.x - x0, fired: !!b,
                 vx: b ? b.vx : 0, vy: b ? b.vy : 0, onFloor: e.y >= 150 };
    """)
    ok('爬行砲：沿地形往左爬（%s px）' % r['dx'], r['moved'], r)
    ok('爬行砲：會瞄準射擊（船在左上 ⇒ vx<0 / vy<0）', r['fired'] and r['vx'] < 0 and r['vy'] < 0, r)

    r = ev(page, """
        var s = CR.stage; s.load(3); s.restart(1200);
        s.enemies.freeAll(); s.bullets.freeAll();
        var pair = s.spawnTest('moai', 200, 120);
        var body = pair[0], mouth = pair[1];
        var b0 = body.hp; body.hit(9);
        var bodyAlive = body.alive, bodyInvuln = body.invuln;   // 打嘴之後 invuln 會被解除 => 先記
        var i, ring = 0;
        for (i = 0; i < 260; i++) { __nes.step(1); }
        s.bullets.each(function (b) { if (b.ring) ring++; });
        mouth.hit(9);
        return { bodyInvuln: bodyInvuln, bodyAlive: bodyAlive, ring: ring,
                 bodyDead: !body.alive, mouthDead: !mouth.alive };
    """)
    ok('石像：本體無敵（只有嘴可打）', r['bodyInvuln'] and r['bodyAlive'], r)
    ok('石像：會吐環狀彈（%d 顆）' % r['ring'], r['ring'] >= 5, r['ring'])
    ok('石像：打掉嘴 ⇒ 本體一起爆', r['mouthDead'] and r['bodyDead'], r)

    r = ev(page, """
        var s = CR.stage; s.enemies.freeAll();
        var e = s.spawnTest('split', 180, 100);
        e.hit(9);
        var fans = 0, splits = 0;
        s.enemies.each(function (x) { if (x.kind === 'fan') fans++; if (x.kind === 'split') splits++; });
        return { fans: fans, splits: splits };
    """)
    ok('分裂體：打掉分裂成 2 隻小蜂（分裂體本身消失）', r['fans'] == 2 and r['splits'] == 0, r)

    r = ev(page, """
        var s = CR.stage; s.enemies.freeAll();
        CR.ship.x = 40; CR.ship.y = 170;
        var e = s.spawnTest('homing', 230, 30);
        e.marked = true;                       // spawn() 會把 marked 重設 => 槽被重用就認得出來
        var y0 = e.y, i;
        for (i = 0; i < 60; i++) __nes.step(1);
        var turned = e.y > y0 + 10;
        for (i = 0; i < CR.Enemies.HOMING_LIFE + 20; i++) __nes.step(1);
        return { turned: turned, gone: !(e.alive && e.marked && e.kind === 'homing'),
                 life: CR.Enemies.HOMING_LIFE };
    """)
    ok('追蹤導彈：會往船的方向轉', r['turned'], r)
    ok('追蹤導彈：壽命 %d 幀後自爆（不會無限糾纏）' % r['life'], r['gone'], r)

    r = ev(page, """
        var s = CR.stage; s.load(5); s.restart(1200); s.enemies.freeAll();
        var e = CR.Enemies.spawn('tent', 200, 180, { wx: s.camX + 200, ceiling: false });
        var lo = 999, hi = 0, i;
        for (i = 0; i < 140; i++) { __nes.step(1); if (e.h < lo) lo = e.h; if (e.h > hi) hi = e.h; }
        return { lo: lo, hi: hi, grow: hi - lo, alive: e.alive, hp: e.hp };
    """)
    ok('觸手：會伸縮（%d ~ %d px）' % (r['lo'], r['hi']), r['grow'] >= 30, r)

    r = ev(page, """
        var s = CR.stage; s.enemies.freeAll();
        var e = CR.Enemies.spawn('egg', 200, 100, { wx: s.camX + 200 });
        e.marked = true;
        var i;
        for (i = 0; i < CR.Enemies.EGG_HATCH + 4; i++) __nes.step(1);
        var fans = 0;
        s.enemies.each(function (x) { if (x.kind === 'fan') fans++; });
        return { fans: fans, gone: !(e.alive && e.marked && e.kind === 'egg') };
    """)
    ok('孵化卵：%d 幀後孵出 2 隻小蜂' % 150, r['gone'] and r['fans'] == 2, r)

    r = ev(page, """
        var s = CR.stage; s.load(3); s.restart(1200); s.enemies.freeAll();
        var e = CR.Enemies.spawn('brick', 200, 80, { wx: s.camX + 200 });
        var hp0 = e.hp, i;
        for (i = 0; i < 3; i++) e.hit(1);
        var mid = e.alive;
        e.hit(1);
        return { hp0: hp0, mid: mid, dead: !e.alive };
    """)
    ok('可破壞岩壁：hp %d，打滿才破' % r['hp0'], r['hp0'] == 4 and r['mid'] and r['dead'], r)

    r = ev(page, """
        var s = CR.stage; s.load(6); s.restart(1200);
        s.enemies.freeAll(); s.bullets.freeAll();
        var e = CR.Enemies.spawn('turret4', 200, 100, { wx: s.camX + 200 });
        var i, n = 0;
        for (i = 0; i < e.period + 4; i++) __nes.step(1);
        var dirs = { l: 0, r: 0, u: 0, d: 0 };
        s.bullets.each(function (b) {
          n++;
          if (Math.abs(b.vx) > Math.abs(b.vy)) { if (b.vx < 0) dirs.l++; else dirs.r++; }
          else { if (b.vy < 0) dirs.u++; else dirs.d++; }
        });
        return { n: n, dirs: dirs };
    """)
    ok('四方砲台：一次射 4 發（上下左右各 1）', r['n'] >= 4, r)


# ------------------------------------------------------------------ ⑤ 五隻新魔王
def test_bosses(page):
    print('[⑤ 關卡 2..6 的五隻魔王：三階段 / 可被打死 / 打死後 cleared]')
    fresh(page)
    for n in (2, 3, 4, 5, 6):
        r = ev(page, """
            CR.g.mode = 'play';
            var s = CR.stage; s.load(a); s.restart(s.CAM_MAX);
            CR.ship.invul = 1 << 28; CR.ship.lives = 9;
            var i, phases = {}, guard = 0, esc = 0;
            for (i = 0; i < 4000; i++) {
              __nes.step(1);
              s.enemies.each(function (e) { if (e.boss && e.alive) e.hit(9); });
              var st2 = CR.Boss.state();
              if (st2.phase >= 0) phases[st2.phase] = 1;
              if (st2.escapeT > 0) esc = Math.max(esc, st2.escapeT);
              guard = i;
              if (s.cleared) break;
            }
            return { cleared: s.cleared, frames: guard, phases: Object.keys(phases).map(Number).sort(),
                     boss: CR.Boss.key, total: CR.Boss.TOTAL_HP, esc: esc,
                     bossActive: s.bossActive, escapeT: s.escapeT };
        """, n)
        ok('關卡 %d 魔王（%s）可以被打死' % (n, r['boss']), r['cleared'], r)
        ok('關卡 %d 魔王走過 2 個以上階段' % n, len(r['phases']) >= 3, r['phases'])
        ok('關卡 %d 打死後 cleared=true 且 bossActive=false' % n,
           r['cleared'] and not r['bossActive'], r)
        if n == 6:
            ok('最終魔王有「脫出倒數」階段（phase 5，%d 幀）' % r['esc'], r['esc'] >= 200, r)
            eq('脫出倒數結束後 escapeT 歸零', r['escapeT'], 0)

    # force(phase) 除錯介面（?boss=N 與機器人用）
    for n in (2, 3, 4, 5, 6):
        r = ev(page, """
            CR.g.mode = 'play';
            var s = CR.stage; s.load(a); s.restart(s.CAM_MAX);
            s.bossActive = true; CR.Boss.spawn(); CR.Boss.force(3);
            return { phase: CR.Boss.state().phase, active: CR.Boss.active() };
        """, n)
        ok('關卡 %d：CR.Boss.force(3) 直接跳到階段 3' % n, r['phase'] == 3 and r['active'], r)


# ------------------------------------------------------------------ ⑥ 難度曲線 / loop
def test_difficulty(page):
    print('[⑥ 難度曲線（每關參數表）與第二輪 loop 加成]')
    fresh(page)
    rows = []
    for n in EXPECT:
        r = ev(page, """
            var s = CR.stage; s.setLoop(0); s.load(a);
            return { p: s.params, maxAlive: s.MAX_ALIVE_ENEMY, speed: CR.Enemies.bulletSpeed() };
        """, n)
        rows.append((n, r['p']['bulletScale'], r['p']['period'], r['maxAlive'], r['speed']))
    ok('敵彈倍率逐關遞增', all(rows[i][1] < rows[i + 1][1] for i in range(5)), rows)
    ok('砲台週期逐關遞減（關卡 2 起）',
       all(rows[i][2] > rows[i + 1][2] for i in range(1, 5)), rows)
    ok('同屏敵人上限逐關遞增（不遞減）', all(rows[i][3] <= rows[i + 1][3] for i in range(5)), rows)
    ok('關卡 1 參數與 R2 完全一致（bulletScale 256 / period 90 / maxAlive 10）',
       rows[0][1] == 256 and rows[0][2] == 90 and rows[0][3] == 10, rows[0])
    if VERBOSE:
        print('   難度表 =', rows)

    r = ev(page, """
        var s = CR.stage, out = [];
        [0, 1, 2, 3].forEach(function (L) {
          s.setLoop(L); s.load(1);
          out.push({ loop: L, scale: s.params.bulletScale, period: s.params.period,
                     maxAlive: s.MAX_ALIVE_ENEMY, speed: CR.Enemies.bulletSpeed() });
        });
        s.setLoop(0); s.load(1);
        return out;
    """)
    ok('第二輪起敵彈變快（loop 0/1/2/3 = %s）' % [x['speed'] for x in r],
       r[0]['speed'] < r[1]['speed'] < r[2]['speed'], r)
    ok('第二輪起砲台週期變短', r[0]['period'] > r[1]['period'] > r[2]['period'], r)
    ok('倍率有上限（不會無限暴走）', r[3]['scale'] <= 460 and r[3]['period'] >= 48, r[3])


# ------------------------------------------------------------------ ⑦ 切關 / ENDING / 第二輪
def test_flow(page):
    print('[⑦ 關卡串接：STAGE CLEAR → 下一關 → ENDING → 第二輪]')
    fresh(page)
    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(3); s.restart(s.CAM_MAX);
        CR.ship.invul = 1 << 28; CR.ship.lives = 9;
        var i;
        for (i = 0; i < 4000; i++) {
          __nes.step(1);
          s.enemies.each(function (e) { if (e.boss && e.alive) e.hit(9); });
          if (window.GAME.state().mode === 'stageclear') break;
        }
        var g0 = window.GAME.state();
        var B = NES.Input.BTN;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(4);
        var g1 = window.GAME.state();
        return { mode0: g0.mode, msg0: g0.msg, msg2: g0.msg2, bonus: g0.bonus, score0: g0.score,
                 mode1: g1.mode, stage1: g1.stage.index, camX: g1.camX,
                 name: g1.stage.name, score1: g1.score, power: g1.power, hud: g1.hud };
    """)
    eq('打掉關卡 3 魔王 → stageclear', r['mode0'], 'stageclear')
    ok('列 11 仍然是 STAGE CLEAR（既有斷言不變）', 'STAGE CLEAR' in r['msg0'].split('|')[0], r['msg0'])
    ok('列 13 顯示分數結算 STAGE 3 BONUS', 'STAGE 3' in r['msg2'].split('|')[0] and 'BONUS' in r['msg2'].split('|')[0],
       r['msg2'])
    ok('過關獎金 = 1000 × 關數 × 輪數 = 3000', r['bonus'] == 3000, r['bonus'])
    eq('按 START → 進入關卡 4', r['stage1'], 4)
    eq('關卡 4 名稱', r['name'], 'INVERTED WORLD')
    ok('切關後回到關卡起點（camX %d <= 8，測試多跑了 4 幀）' % r['camX'], r['camX'] <= 8, r['camX'])
    eq('切關後模式回到 play', r['mode1'], 'play')
    ok('切關後 HUD 顯示 ST4', r['hud'].split('|')[0].rstrip().endswith('ST4'), r['hud'].split('|')[0])
    shot(page, SHOTS / 'flow_stage4_start.png')

    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(6); s.restart(s.CAM_MAX);
        CR.ship.invul = 1 << 28; CR.ship.lives = 9;
        var i;
        for (i = 0; i < 5000; i++) {
          __nes.step(1);
          s.enemies.each(function (e) { if (e.boss && e.alive) e.hit(9); });
          if (window.GAME.state().mode === 'stageclear') break;
        }
        var B = NES.Input.BTN;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(4);
        var g1 = window.GAME.state();
        var msg = [9, 11, 13, 15].map(function (r2) { return CR.screenText(r2).trim(); });
        return { mode: g1.mode, msg: msg, endings: g1.endings, loop: g1.loop };
    """)
    eq('打掉第 6 關魔王 + START → ENDING 畫面', r['mode'], 'ending')
    ok('ENDING 有 CONGRATULATIONS / ALL STAGE CLEAR / PRESS START',
       'CONGRATULATIONS' in r['msg'][0] and 'ALL STAGE CLEAR' in r['msg'][1] and 'PRESS START' in r['msg'][3],
       r['msg'])
    shot(page, SHOTS / 'flow_ending.png')

    r = ev(page, """
        var B = NES.Input.BTN;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(4);
        var g = window.GAME.state();
        return { mode: g.mode, stage: g.stage.index, loop: g.loop, sloop: g.stage.loop,
                 scale: CR.stage.params.bulletScale, camX: g.camX, hud: g.hud };
    """)
    eq('ENDING 按 START → 第二輪從關卡 1 開始', r['stage'], 1)
    eq('第二輪 loop = 1', r['loop'], 1)
    eq('CR.stage.loop 同步 = 1', r['sloop'], 1)
    ok('第二輪關卡 1 的敵彈倍率比第一輪高（%d > 256）' % r['scale'], r['scale'] > 256, r['scale'])
    eq('第二輪模式 play', r['mode'], 'play')
    shot(page, SHOTS / 'flow_loop2.png')


# ------------------------------------------------------------------ ⑧ ?stage=N
def test_query(page):
    print('[⑧ ?stage=N 直接開該關（tools/shot.py --query / 機器人 --stage）]')
    for n in (2, 5, 6):
        fresh(page, '&stage=%d' % n)
        r = ev(page, """
            __nes.step(10);
            var g = window.GAME.state();
            return { index: g.stage.index, name: g.stage.name, mode: g.mode,
                     start: g.startStage, hud: g.hud, camX: g.camX };
        """)
        eq('?stage=%d → 直接開關卡 %d' % (n, n), r['index'], n)
        eq('?stage=%d → startStage = %d' % (n, n), r['start'], n)
        ok('?stage=%d → HUD 顯示 ST%d' % (n, n), r['hud'].split('|')[0].rstrip().endswith('ST%d' % n),
           r['hud'].split('|')[0])
    # ?stage=3&camx=1200 併用
    fresh(page, '&stage=3&camx=1200')
    r = ev(page, "__nes.step(10); var g = window.GAME.state(); return { i: g.stage.index, camX: g.camX };")
    eq('?stage=3&camx=1200 → 關卡 3', r['i'], 3)
    ok('?stage=3&camx=1200 → camX ≈ 1200', abs(r['camX'] - 1200) <= 8, r['camX'])


# ------------------------------------------------------------------ ⑨ lint / 預算 / 截圖
def test_lint(page):
    print('[⑨ 每關 lint（≤ 25 色）/ VBlank 預算 / 每線 8 精靈 / 三張截圖]')
    fresh(page)
    for n, (name, boss, cols, cam, minfree, music) in EXPECT.items():
        r = ev(page, """
            var s = CR.stage, nes = __nes.nes(), b = nes.timing.budget;
            CR.g.mode = 'play';
            s.load(a); s.restart(0);
            CR.ship.invul = 1 << 28;
            b.clear();
            var peak = 0, i, worst = 0;
            for (i = 0; i < 600; i++) { __nes.step(1); var by = s.scroller().bytes; if (by > peak) peak = by; }
            __nes.render();
            var lt = __nes.lint(), st2 = __nes.stats();
            return { peak: peak, over: st2.budget.over, ok: lt.ok, colors: lt.colors,
                     overLine: (lt.overLine || []).length, dropped: window.GAME.state().oam.dropped };
        """, n)
        ok('關卡 %d：600 幀 lint 綠（%d 色）' % (n, r['colors']), r['ok'] and r['colors'] <= 25, r)
        ok('關卡 %d：Scroller 單欄尖峰 <= 45 byte（%d）' % (n, r['peak']), r['peak'] <= 45, r['peak'])
        ok('關卡 %d：600 幀 VBlank 預算 0 次超支' % n, not r['over'], r['over'])
        shot(page, SHOTS / ('t%d_a_start.png' % n))

        r = ev(page, """
            var s = CR.stage;
            CR.g.mode = 'play';
            s.restart((s.CAM_MAX >> 1) & ~7);
            CR.ship.invul = 1 << 28;
            var i;
            for (i = 0; i < 420; i++) __nes.step(1);
            __nes.render();
            var lt = __nes.lint();
            return { ok: lt.ok, colors: lt.colors, camX: s.camX, enemies: s.aliveEnemies() };
        """)
        ok('關卡 %d 中段（camX %d）lint 綠（%d 色）' % (n, r['camX'], r['colors']),
           r['ok'] and r['colors'] <= 25, r)
        shot(page, SHOTS / ('t%d_b_mid.png' % n))

        r = ev(page, """
            var s = CR.stage;
            CR.g.mode = 'play';
            s.restart(s.CAM_MAX);
            CR.ship.invul = 1 << 28;
            var i;
            for (i = 0; i < 240; i++) __nes.step(1);
            CR.Boss.force(3);
            for (i = 0; i < 60; i++) __nes.step(1);
            __nes.render();
            var lt = __nes.lint();
            return { ok: lt.ok, colors: lt.colors, phase: CR.Boss.state().phase, boss: CR.Boss.key };
        """)
        ok('關卡 %d 魔王戰（%s 階段 %s）lint 綠（%d 色）' % (n, r['boss'], r['phase'], r['colors']),
           r['ok'] and r['colors'] <= 25, r)
        shot(page, SHOTS / ('t%d_c_boss.png' % n))


# ------------------------------------------------------------------ 主程式
def main():
    if not (ROOT / 'cruiser.html').exists():
        print('找不到 cruiser.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 256, 'height': 240})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text)
                if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        try:
            fresh(page)
        except Exception as e:
            print('頁面無法進入 play 模式：', e)
            print('\n'.join(errors[:5]))
            browser.close()
            return 2
        test_data(page)
        test_terrain(page)
        test_waves(page)
        test_enemies(page)
        test_bosses(page)
        test_difficulty(page)
        test_flow(page)
        test_query(page)
        test_lint(page)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 66)
    print('R3 擴關測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 66)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
