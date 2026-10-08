# -*- coding: utf-8 -*-
"""games/cruiser R4 驗收：rank 動態難度 / 第 7 關魔王連戰 / 波動 + Option 編隊 /
隱藏獎勵 / 結局名單 + 排行榜 / 一鍵密技回歸。

作法：Playwright(Chromium) 開 `cruiser.html?debug=1&scale=1&mute=1`，用 `__nes.step/lint`
推進與取樣。本檔只驗 **R4 新增的東西**；R2/R3 的既有驗收仍由
`test_cruiser.py`(303) / `test_stage1.py`(174) / `test_stages.py`(218) / `test_song.py`(154) 負責。

用法：../卡比之星/.venv/bin/python games/cruiser/test_r4.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

對照：docs/R4_BRIEF.md「F4-4 cruiser-r4」、
      docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §7-4（rank）/ §9-2（隱藏要素）、
      docs/research/11_橫向射擊設計與技術.md §13（動態難度）/ §14（能量表）。
"""
import base64
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = (ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1'
SHOTS = ROOT / 'shots' / 'agent_r4'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

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
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    d = page.evaluate("""(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
        const o=document.createElement('canvas'); o.width=c.width*s; o.height=c.height*s;
        const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height);
        return o.toDataURL('image/png')}""", 3)
    path.write_bytes(base64.b64decode(d.split(',', 1)[1]))


# ================================================================== ① rank 動態難度
def test_rank(page):
    print('[① rank 動態難度（研究 16 §7-4 / 11 §13）]')
    fresh(page)
    r = ev(page, """
        var R = CR.Rank;
        return { has: !!R, max: R.MAX, up: R.UP_FRAMES, cap: R.UP_CAP, pen: R.DEATH_PEN,
                 bullet: R.BULLET_MUL.length, period: R.PERIOD_MUL.length,
                 b0: R.BULLET_MUL[0], b1: R.BULLET_MUL[1], b2: R.BULLET_MUL[2],
                 p0: R.PERIOD_MUL[0], p1: R.PERIOD_MUL[1], enabled: R.enabled() };
    """)
    ok('CR.Rank 存在', r['has'])
    eq('rank 上限 7', r['max'], 7)
    eq('效果表長度 = 8（rank 0..7）', [r['bullet'], r['period']], [8, 8])
    ok('rank 0 / 1 的倍率都是 1.000（開局與復活後手感 = R3）',
       r['b0'] == 256 and r['b1'] == 256 and r['p0'] == 256 and r['p1'] == 256, r)
    eq('rank 2 的敵彈倍率 = 1.25（R3 的既有門檻）', r['b2'], 320)
    ok('預設啟用', r['enabled'] is True)

    r = ev(page, """
        var R = CR.Rank, s = CR.ship;
        s.reset(true); R.reset(true);
        var a = R.state();
        s.power.laser = true; s.power.option = 2; s.power.shield = 5; s.speed = 4;
        var b = R.state();
        var i; for (i = 0; i < 1300; i++) R.update();
        var c = R.state();
        R.onDeath(); s.reset(true);
        var d = R.state();
        return { a: a, b: b, c: c, d: d };
    """)
    eq('裸機 rank = 0', r['a']['rank'], 0)
    eq('滿裝備 equip = 5（主武器 + Option×2 + 護盾 + SPEED≥4）', r['b']['equip'], 5)
    ok('存活 1300 幀（> 1200）+ 有火力 ⇒ 存活加成 +1', r['c']['surv'] == 1, r['c'])
    ok('rank 隨火力 / 存活上升（%d -> %d）' % (r['a']['rank'], r['c']['rank']),
       r['c']['rank'] > r['a']['rank'] and r['c']['rank'] >= 6, r['c'])
    ok('死亡 ⇒ rank 掉回 0（裝備清空 + 存活歸零 + 罰 3）', r['d']['rank'] == 0, r['d'])
    eq('死亡罰 = 3', r['d']['penalty'], 3)

    r = ev(page, """
        var R = CR.Rank, s = CR.ship;
        s.reset(true); R.reset(true);
        var i; for (i = 0; i < 4000; i++) R.update();
        var naked = R.state();
        R.setLoop(2); var lp = R.state(); R.setLoop(0);
        return { naked: naked, loop: lp };
    """)
    ok('**裸機不會隨時間變難**（存活 4000 幀 rank 仍是 0）',
       r['naked']['rank'] == 0 and r['naked']['surv'] == 0, r['naked'])
    ok('第二輪 rank 起點更高（loop 2 ⇒ +4，上限）', r['loop']['loopBonus'] == 4 and r['loop']['rank'] >= 4,
       r['loop'])

    r = ev(page, """
        var R = CR.Rank, E = CR.Enemies, s = CR.ship, out = {};
        CR.stage.load(1); s.reset(true); R.reset(true);
        out.base = E.bulletSpeed(); out.baseP = E.firePeriod(90);
        s.power.laser = true; s.power.option = 2; s.power.shield = 5; s.speed = 5;
        var i; for (i = 0; i < 4000; i++) R.update();
        out.rank = R.value(); out.hi = E.bulletSpeed(); out.hiP = E.firePeriod(90);
        out.shots = E.rankShotsN(); out.fan = R.fanPlus(); out.lead = E.rankLead();
        out.turret = E.turretPeriod(100 * 8);
        R.setEnabled(false, false);
        out.offRank = R.value(); out.offSpeed = E.bulletSpeed(); out.offP = E.firePeriod(90);
        R.setEnabled(true, false); s.reset(true); R.reset(true);
        return out;
    """)
    ok('rank 高時敵彈變快（%d -> %d，8.8）' % (r['base'], r['hi']), r['hi'] > r['base'], r)
    ok('rank 高時砲台週期變短（%d -> %d 幀）' % (r['baseP'], r['hiP']), r['hiP'] < r['baseP'], r)
    ok('rank 高時瞄準砲台一次 >= 2 發（扇形）', r['shots'] >= 2, r['shots'])
    ok('rank 高時 fan 編隊 +1 隻以上', r['fan'] >= 1, r['fan'])
    ok('rank >= 3 預判射擊', r['lead'] is True, r['lead'])
    eq('**turretPeriod() 的 90 / 130 一個數字都沒變**（test_stage1 的斷言靠它）', r['turret'], 90)
    ok('`setEnabled(false)` 退回 R3 行為（rank = 裝備 rank、週期不變）',
       r['offRank'] == 3 and r['offP'] == 90, r)

    fresh(page, '&rank=0')
    r = ev(page, """
        CR.ship.power.laser = true; CR.ship.power.option = 2; CR.ship.power.shield = 5;
        var i; for (i = 0; i < 2000; i++) CR.Rank.update();
        return { on: CR.Rank.enabled(), rank: CR.Rank.value(), p: CR.Enemies.firePeriod(90) };
    """)
    ok('`?rank=0` 關掉動態難度（設定可關）', r['on'] is False and r['p'] == 90, r)


# ================================================== ② 第 7 關「魔王連戰」
def test_stage7(page):
    print('[② 第 7 關：魔王連戰（六隻強化版 + 原創真最終魔王三形態）]')
    fresh(page)
    r = ev(page, """
        var s = CR.stage; s.load(7);
        var d = s.def(), sum = 0, i;
        for (i = 0; i < d.terrain.length; i++) sum += d.terrain[i][0];
        return { count: CR.STAGE_COUNT, name: s.name, key: s.key, boss: s.bossKey,
                 cols: s.COLS, cam: s.CAM_MAX, minFree: s.minFree, music: s.music,
                 sum: sum, bossCol0: s.BOSS_COL0, cps: s.CHECKPOINTS,
                 names: CR.Boss.names(), total: CR.Boss.TOTAL_HP, n: CR.Boss.COUNT,
                 isRush: !!CR.Boss.isRush, guns: d.waves ? 1 : 0 };
    """)
    eq('CR.STAGE_COUNT = 7', r['count'], 7)
    eq('關卡 7 名稱 = BOSS RUSH', r['name'], 'BOSS RUSH')
    eq('關卡 7 魔王 key = rush', r['boss'], 'rush')
    eq('關卡 7 地形 RLE 總和 = 欄數', r['sum'], r['cols'])
    eq('關卡 7 camMax = (cols - 32) × 8', r['cam'], (r['cols'] - 32) * 8)
    ok('關卡 7 通道下限 >= 20 列（連戰室要夠寬）', r['minFree'] >= 20, r['minFree'])
    eq('連戰 9 隻（六關魔王強化版 + OMEGA 三形態）', r['n'], 9)
    eq('連戰名單', r['names'], ['EYE FORTRESS', 'TWIN MOAI', 'MIRROR CORE', 'BIO CORE',
                               'MOTHER BRAIN', 'CORE FORTRESS', 'OMEGA I', 'OMEGA II', 'OMEGA III'])
    ok('連戰總血量 >= 150（%d）' % r['total'], r['total'] >= 150, r['total'])
    ok('`stages.js` 只有資料：第 7 關也走共用的 buildWaves 骨架', r['guns'] == 0, r)

    r = ev(page, """
        var s = CR.stage, T = s.spawnTable(), i, guns = 0;
        for (i = 0; i < T.length; i++) if (T[i].gun) guns++;
        var asc = true;
        for (i = 1; i < T.length; i++) if (T[i].col < T[i - 1].col) asc = false;
        return { n: T.length, guns: guns, asc: asc, first: T[0] ? T[0].col : -1 };
    """)
    ok('關卡 7 出怪表遞增且 >= 10 個事件', r['asc'] and r['n'] >= 10, r)
    eq('接近段零固定砲（連戰前只給補給）', r['guns'], 0)

    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(7); s.restart(s.CAM_MAX);
        CR.ship.invul = 1 << 28; CR.ship.lives = 9;
        var seen = {}, forms = {}, i, esc = 0;
        for (i = 0; i < 30000; i++) {
          __nes.step(1);
          s.enemies.each(function (e) { if (e.boss && e.alive) e.hit(9); });
          var st2 = CR.Boss.state();
          if (st2.sub) seen[st2.index] = st2.sub;
          if (st2.form) forms[st2.form] = 1;
          if (st2.escapeT > esc) esc = st2.escapeT;
          if (s.cleared) break;
        }
        return { cleared: s.cleared, frames: i, seen: seen, forms: Object.keys(forms).map(Number).sort(),
                 esc: esc, mode: window.GAME.state().mode, bossActive: s.bossActive };
    """)
    ok('連戰 9 隻依序全部上場', len(r['seen']) == 9, sorted(r['seen'].keys()))
    eq('真最終魔王三形態（form 1 / 2 / 3）', r['forms'], [1, 2, 3])
    ok('真最終魔王有脫出倒數（%d 幀）' % r['esc'], r['esc'] >= 300, r['esc'])
    ok('全部打完 → cleared + stageclear', r['cleared'] and r['mode'] == 'stageclear', r['mode'])

    fresh(page, '&stage=7&rush=7')
    r = ev(page, """
        __nes.step(10);
        var g = window.GAME.state();
        return { stage: g.stage.index, idx: CR.Boss.index(), sub: CR.Boss.state().sub,
                 bossActive: g.stage.bossActive };
    """)
    ok('`?stage=7&rush=7` 直接跳到連戰第 7 隻（OMEGA I）',
       r['stage'] == 7 and r['idx'] == 6 and r['sub'] == 'OMEGA I', r)
    # 等魔王滑進定位（60 幀）再多跑一會兒，讓艦體形變圖與核心都畫出來才截圖
    lt = ev(page, """
        CR.ship.invul = 0; CR.ship.power.option = 2; CR.ship.power.ripple = true;
        CR.ship.syncOptions();
        var i; for (i = 0; i < 150; i++) { NES.Input.inject(NES.Input.BTN.A, 1); __nes.step(1); }
        NES.Input.inject(0, 1); __nes.step(2);
        __nes.render();
        var lt = __nes.lint(), st2 = __nes.stats();
        return { ok: lt.ok, colors: lt.colors, over: st2.budget.over, phase: CR.Boss.state().phase,
                 sub: CR.Boss.state().sub };
    """)
    shot(page, SHOTS / 'r4_rush_omega1.png')
    ok('連戰畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt['colors'])
    eq('連戰的 VBlank 預算 0 次超支', lt['over'], 0)

    # 友善版：死在第 n 隻 → 接關不是從第 1 隻重打
    r = ev(page, """
        var s = CR.stage;
        CR.Boss.setIndex(3);
        var a = CR.Boss.index();
        CR.Boss.despawn(); s.restart(s.BOSS_RESPAWN);
        var i; for (i = 0; i < 400 && !s.bossActive; i++) __nes.step(1);
        return { before: a, after: CR.Boss.index(), frames: i, active: s.bossActive };
    """)
    ok('友善版：死在第 4 隻 → 復活後從第 4 隻接關（不是重打第 1 隻）',
       r['before'] == 3 and r['after'] == 3 and r['active'], r)


# ================================================== ③ 波動（ripple）+ Option 編隊
def test_ripple(page):
    print('[③ 新裝備「波動」+ Option 編隊切換]')
    fresh(page)
    r = ev(page, """
        var s = CR.ship; s.reset(true); s.clearShots();
        s.power.laser = false; s.power.double = false; s.power.ripple = false;
        s.gauge = 3; var a = s.activate();
        s.gauge = 3; var b = s.activate();
        var o = { d: s.power.double, r: s.power.ripple, l: s.power.laser };
        s.gauge = 3; var c = s.activate();
        s.gauge = 4; var d = s.activate();
        var o2 = { d: s.power.double, r: s.power.ripple, l: s.power.laser };
        return { a: a, b: b, c: c, d: d, o: o, o2: o2 };
    """)
    eq('能量表格 3 第一次 = DOUBLE', r['a'], 'DOUBLE')
    eq('格 3 第二次 = RIPPLE（波動，沙羅曼蛇的格 3）', r['b'], 'RIPPLE')
    ok('RIPPLE 取代 DOUBLE（互斥）', r['o']['r'] is True and r['o']['d'] is False, r['o'])
    eq('已經有 RIPPLE 再按 ⇒ 不消耗膠囊', r['c'], '')
    ok('LASER 把 RIPPLE 關掉（三者互斥）',
       r['o2']['l'] is True and r['o2']['r'] is False and r['o2']['d'] is False, r['o2'])

    r = ev(page, """
        var s = CR.ship, K = CR.Ship.K;
        s.reset(true); s.place(60, 100); s.clearShots(); s.emit[0].timer = 0;
        s.power.ripple = true; s.power.laser = false; s.power.double = false; s.power.missile = false;
        s.fire();
        function shot() { var o = null; for (var i = 0; i < s.shots.length; i++)
          if (s.shots[i].alive && s.shots[i].kind === K.RIPPLE) o = s.shots[i]; return o; }
        var t0 = shot(), a = { x: t0.x, y: t0.y, w: t0.w, h: t0.h, len: t0.len };
        var i; for (i = 0; i < 2; i++) __nes.step(1);
        var t1 = shot(), b = { x: t1.x, h: t1.h, len: t1.len };
        for (i = 0; i < 16; i++) __nes.step(1);
        var t2 = shot(), c = t2 ? { x: t2.x, h: t2.h, len: t2.len } : null;
        return { a: a, b: b, c: c, dx: b.x - a.x };
    """)
    eq('波動初始高度 8 px（1 節）', [r['a']['h'], r['a']['len']], [8, 1])
    eq('波動速度 5 px/幀（2 幀 = 10 px）', r['dx'], 10)
    ok('波動會擴張：18 幀後 3 節 24 px', r['c'] and r['c']['len'] == 3 and r['c']['h'] == 24, r['c'])
    eq('波動最高 3 節（不會無限長）', CR_MAX_SEG(page), 3)

    r = ev(page, """
        var s = CR.ship;
        s.reset(true); s.power.option = 2; s.place(100, 100); s.setOptMode('TRAIL');
        var i; for (i = 0; i < 40; i++) { NES.Input.inject(NES.Input.BTN.RIGHT, 1); __nes.step(1); }
        NES.Input.inject(0, 1); __nes.step(2);
        var trail = s.state().options.slice();
        s.setOptMode('FIXED'); __nes.step(2);
        var fixed = s.state().options.slice();
        s.setOptMode('ORBIT'); 
        var orb = [], j;
        for (j = 0; j < 3; j++) { __nes.step(20); orb.push(s.state().options[0]); }
        var names = CR.Ship.OPT_MODE_NAME.slice();
        s.setOptMode('TRAIL');
        return { trail: trail, fixed: fixed, orb: orb, names: names, sx: s.sx, sy: s.sy };
    """)
    eq('三種編隊：TRAIL / FIXED / ORBIT', r['names'], ['TRAIL', 'FIXED', 'ORBIT'])
    ok('FIXED：兩顆固定在船正後方的定點（第 2 顆更後面、y = 船）',
       r['fixed'][1]['x'] < r['fixed'][0]['x'] < r['sx'] and r['fixed'][0]['y'] == r['sy'], r['fixed'])
    ok('ORBIT：繞著船轉（三次取樣的 y 不相同）',
       len(set(o['y'] for o in r['orb'])) >= 2, r['orb'])
    ok('TRAIL：沿軌跡落後（x 比船小，R2 原行為）', r['trail'][0]['x'] < r['sx'], r['trail'])

    r = ev(page, """
        CR.g.mode = 'play'; CR.g.paused = false;
        var B = NES.Input.BTN, out = [], i;
        CR.ship.setOptMode('TRAIL');
        for (i = 0; i < 3; i++) {
          NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
          out.push(window.GAME.state().optModeName);
        }
        return { out: out, hud: window.GAME.state().hud.split('|')[0],
                 note: window.GAME.state().note, paused: window.GAME.state().paused };
    """)
    eq('遊戲中按 SELECT 循環編隊', r['out'], ['FIXED', 'ORBIT', 'TRAIL'])
    ok('SELECT 切編隊不會進暫停', r['paused'] is False)
    ok('切換時畫面提示 OPTION <模式>', 'OPTION' in (r['note'] or ''), r['note'])
    ok('HUD 有編隊字母（T / F / O）', r['hud'].rstrip().endswith('ST1') and
       (' T^' in r['hud'] or ' F^' in r['hud'] or ' O^' in r['hud']), r['hud'])

    # 回歸：draw() 不能拋例外（R4 開發期間踩過一次 —— hudSync 把 optModeName 當字串用，
    #       整個 draw 被中斷 ⇒ OAM 維持上一幀、畫面上沒有任何精靈，而且**所有既有測試都還是綠的**）
    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(1); s.restart(400);
        var sh = CR.ship; sh.reset(true); sh.invul = 0; sh.place(70, 100); sh.power.option = 2;
        sh.syncOptions();
        __nes.step(4);
        var err = '';
        try { window.GAME.draw(__nes.nes()); } catch (e) { err = e.message; }
        var ppu = __nes.nes().ppu, n = 0, i, sp, first = null;
        for (i = 0; i < 64; i++) { sp = ppu.getSprite(i); if (sp.y < 240) { n++; if (!first) first = sp; } }
        __nes.render();
        var lt = __nes.lint();
        return { err: err, n: n, first: first, colors: lt.colors, ok: lt.ok };
    """)
    eq('play 模式 GAME.draw() 不拋例外', r['err'], '')
    ok('play 模式 OAM 真的有精靈（船 + 2 顆 Option，>= 4 顆）', r['n'] >= 4, r['n'])
    ok('第一顆精靈就是船（x = 70、y = 100）',
       r['first'] and r['first']['x'] == 70 and r['first']['y'] == 100, r['first'])
    ok('畫面顏色 > 4（＝精靈真的畫出來了，不是只剩背景）', r['colors'] > 4, r['colors'])

    r = ev(page, """
        var b = CR.optButton ? CR.optButton() : null;
        return { has: !!(b && b.el), id: b && b.el ? b.el.id : '', txt: b && b.el ? b.el.textContent : '' };
    """)
    ok('手機多一顆「編隊」鈕（DOM，engine/touch.js 一個字沒改）',
       r['has'] and r['id'] == 'cr-optbtn' and r['txt'] == '編隊', r)


def CR_MAX_SEG(page):
    return page.evaluate('()=>CR.Ship.RIPPLE_MAX_SEG')


# ================================================== ④ 隱藏獎勵
def test_bonus(page):
    print('[④ 每關 1 個隱藏獎勵（研究 §9-2）]')
    fresh(page)
    r = ev(page, """
        var D = CR.Bonus.DEFS, out = {}, k;
        for (k in D) out[k] = [D[k].kind, D[k].reward];
        return { defs: out, hold: CR.Bonus.HOLD_FRAMES, score: CR.Bonus.SCORE };
    """)
    eq('七關各 1 個隱藏獎勵', sorted(int(k) for k in r['defs']), [1, 2, 3, 4, 5, 6, 7])
    ok('只有兩種獎勵：1UP / 全消彈',
       set(v[1] for v in r['defs'].values()) == {'1up', 'clear'}, r['defs'])
    ok('兩類條件：擊殺特定敵人 / 特定位置不開火',
       set(v[0] for v in r['defs'].values()) == {'kill', 'hold'}, r['defs'])
    eq('位置類要連續 20 幀', r['hold'], 20)

    # 擊殺類（關卡 3：打掉 4 尊石像的嘴）
    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(3); s.restart(600);
        CR.Bonus.newGame(); CR.Bonus.reset(3);
        CR.ship.invul = 1 << 28; CR.ship.lives = 3;
        var l0 = CR.ship.lives, sc0 = CR.ship.score, i, out = [];
        for (i = 0; i < 4; i++) {
          CR.Bonus.onKill({ kind: 'mouth' });
          out.push(CR.Bonus.update());
        }
        return { out: out, lives: CR.ship.lives, l0: l0, sc: CR.ship.score - sc0,
                 st: CR.Bonus.state(), again: CR.Bonus.update() };
    """)
    eq('關卡 3：打掉第 4 尊石像才觸發', r['out'], ['', '', '', '1up'])
    eq('獎勵 = 1UP（命 +1）', r['lives'], r['l0'] + 1)
    eq('隱藏獎勵附帶 5000 分', r['sc'], 5000)
    eq('一局之內同一關只能拿 1 次', r['again'], '')
    ok('state().bonus 有進度回報', r['st']['awards'] == 1 and 3 in r['st']['found'], r['st'])

    # 位置類（關卡 1：空戰段上緣 20 幀不開火）
    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(1); s.restart(400);
        CR.Bonus.newGame(); CR.Bonus.reset(1);
        var sh = CR.ship; sh.reset(true); sh.invul = 1 << 28; sh.lives = 3;
        sh.place(40, 20);
        var d = CR.Bonus.DEFS[1], out = '', i;
        for (i = 0; i < 25 && !out; i++) { sh.place(40, 20); out = CR.Bonus.update(); }
        var hitF = i;
        // 再來一次：這次「有開火」（畫面上有自機彈）⇒ 不該觸發
        CR.Bonus.newGame(); CR.Bonus.reset(1);
        sh.place(40, 20); sh.emit[0].timer = 0; sh.power.laser = false; sh.fire();
        var out2 = '';
        for (i = 0; i < 25 && !out2; i++) { sh.place(40, 20); out2 = CR.Bonus.update(); }
        // 位置不對也不該觸發
        CR.Bonus.newGame(); CR.Bonus.reset(1);
        sh.clearShots();
        var out3 = '';
        for (i = 0; i < 25 && !out3; i++) { sh.place(120, 150); out3 = CR.Bonus.update(); }
        return { out: out, frames: hitF, out2: out2, out3: out3, rect: d.rect };
    """)
    eq('關卡 1：上緣帶停 20 幀不開火 → 1UP', r['out'], '1up')
    ok('剛好 20~21 幀觸發（不是一碰就給）', 20 <= r['frames'] <= 22, r['frames'])
    eq('畫面上有自機彈（＝在開火）就不算', r['out2'], '')
    eq('位置不對就不算', r['out3'], '')

    # 全消彈型（關卡 2：打掉 4 隻爬行砲）
    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(2); s.restart(800);
        CR.Bonus.newGame(); CR.Bonus.reset(2);
        var i; for (i = 0; i < 6; i++) s.spawnTest('zig', 100 + i * 12, 60 + i * 8);
        var n0 = s.aliveEnemies();
        for (i = 0; i < 4; i++) CR.Bonus.onKill({ kind: 'crawl' });
        var ev2 = CR.Bonus.update();
        return { ev: ev2, n0: n0, n1: s.aliveEnemies() };
    """)
    eq('關卡 2：打掉 4 隻爬行砲 → 全消彈', r['ev'], 'clear')
    ok('全消彈真的清掉畫面上的雜魚（%d -> %d）' % (r['n0'], r['n1']), r['n1'] < r['n0'], r)


# ================================================== ⑤ 結局名單 + 排行榜
def test_ending(page):
    print('[⑤ 結局畫面 / 工作人員名單捲動 / 結局曲 / 分數排行]')
    fresh(page)
    r = ev(page, """
        return { keys: Object.keys(CR.SONGS), loop: CR.Audio.LOOPED.credits,
                 play: CR.Audio.play('credits'), st: CR.Audio.state(),
                 rows: CR.Credits.SEQ.length, stop: CR.Credits.STOP_Y,
                 lines: CR.Credits.LINES.length };
    """)
    ok('song.js 新鍵 `credits`', 'credits' in r['keys'], r['keys'])
    ok('結局曲不循環', r['loop'] is False)
    ok('CR.Audio.play("credits") 成功且在播', r['play'] is True and r['st']['playing'] is True, r['st'])
    ok('名單 60 列、捲 240 px', r['rows'] == 60 and r['stop'] == 240, r)
    ok('名單內容 >= 30 行（原創職稱 + 組名，無真人姓名）', r['lines'] >= 30, r['lines'])

    r = ev(page, """
        CR.g.mode = 'play';
        var s = CR.stage; s.load(7); s.restart(s.CAM_MAX);
        CR.ship.invul = 1 << 28; CR.ship.lives = 9; CR.ship.addScore(300000);
        var B = NES.Input.BTN, i;
        for (i = 0; i < 30000; i++) {
          __nes.step(1);
          s.enemies.each(function (e) { if (e.boss && e.alive) e.hit(9); });
          if (window.GAME.state().mode === 'stageclear') break;
        }
        function tap() { NES.Input.inject(B.START, 1); __nes.step(1);
                         NES.Input.inject(0, 1); __nes.step(3); return window.GAME.state().mode; }
        var m1 = tap();                       // stageclear -> ending
        var m2 = tap();                       // ending -> credits
        var y0 = CR.Credits.state().y;
        for (i = 0; i < 300; i++) __nes.step(1);
        var c = CR.Credits.state();
        var lt = (function () { __nes.render(); return __nes.lint(); })();
        return { m1: m1, m2: m2, y0: y0, y: c.y, row: c.row, next: c.nextRow,
                 lint: lt.ok, colors: lt.colors, song: CR.Audio.state().song };
    """)
    eq('第 7 關破 + START → ENDING', r['m1'], 'ending')
    eq('ENDING + START → 工作人員名單（credits）', r['m2'], 'credits')
    ok('名單真的在捲（y %d -> %d）' % (r['y0'], r['y']), r['y'] > r['y0'] and r['y'] >= 70, r)
    ok('捲動時補寫新列（nextRow 前進）', r['next'] > 30, r['next'])
    ok('名單畫面 lint 綠（%d 色）' % r['colors'], r['lint'] and r['colors'] <= 25, r['colors'])
    eq('名單播結局曲 credits', r['song'], 'credits')
    shot(page, SHOTS / 'r4_credits.png')

    # fix-r4（qa-r4 P2-3）：名單畫面的 START 快轉 = 一幀寫完剩下的列（最多 960 byte），
    # 要跟 main 其他 16 處轉場一樣包在 muteBudget 裡，否則那一幀真機會撕圖。
    # （直接呼叫 Credits.skip()，不按鍵 ⇒ 不影響後面「名單 → 名字輸入 → 排行榜」那段流程；
    #   量完再 start() 一次把名單倒回去，start 本來就是轉場、照樣要 mute。）
    r = ev(page, """
        var bud = NES.instance.timing.budget, ppu = CR.g.ppu;
        var hook = CR.muteBudget;
        var left = CR.Credits.state().rows - CR.Credits.state().nextRow;
        bud.clear();
        CR.Credits.skip();
        var out = { left: left, over: bud.overFrames, peak: bud.peak,
                    done: CR.Credits.done(), rows: CR.Credits.state().nextRow,
                    hook: typeof hook };
        if (hook) hook(true);
        CR.Credits.start(ppu);
        if (hook) hook(false);
        bud.clear();
        out.restored = CR.Credits.state().nextRow;
        return out;
    """)
    ok('快轉前還有 %d 列沒寫（確定這一幀是整批寫入）' % r['left'], r['left'] > 20, r['left'])
    ok('快轉確實把名單寫到底', r['done'] and r['rows'] == 60, r)
    eq('main 有把 muteBudget 開放給轉場模組用', r['hook'], 'function')
    eq('快轉那一幀 **沒有** VBlank 超支（P2-3；修之前是 1）', r['over'], 0)
    ok('快轉那一幀不計帳（peak = %d，修之前是 960）' % r['peak'], r['peak'] <= 160, r)
    eq('量完把名單倒回去，後面的流程不受影響', r['restored'], 30)

    r = ev(page, """
        var B = NES.Input.BTN, i, guard = 0;
        function tap(k) { NES.Input.inject(B[k], 1); __nes.step(1);
                          NES.Input.inject(0, 1); __nes.step(3); return window.GAME.state(); }
        var g = tap('START');                 // 快轉名單
        while (window.GAME.state().mode === 'credits' && guard++ < 40) tap('START');
        var m = window.GAME.state().mode;
        var e0 = CR.HiScore.entry();
        tap('UP'); tap('RIGHT'); tap('UP'); tap('UP'); tap('RIGHT'); tap('DOWN');
        var e1 = CR.HiScore.entry();
        var g2 = tap('A');
        return { mode: m, e0: e0, e1: e1, mode2: g2.mode, mark: g2.scoreMark,
                 list: CR.HiScore.list().slice(0, 2) };
    """)
    eq('名單結束 → 名字輸入畫面（分數上榜）', r['mode'], 'entry')
    eq('名字預設 AAA', r['e0']['name'], 'AAA')
    ok('↑↓ 換字母 / ←→ 移游標（AAA -> %s）' % r['e1']['name'], r['e1']['name'] != 'AAA', r['e1'])
    eq('A / START 確定 → 排行榜畫面', r['mode2'], 'scores')
    eq('名字進榜第 1 名', r['list'][0]['n'], r['e1']['name'])
    ok('分數進榜（%d）' % r['list'][0]['s'], r['list'][0]['s'] >= 300000, r['list'][0])
    shot(page, SHOTS / 'r4_scores.png')

    lt = ev(page, "__nes.render(); return __nes.lint();")
    ok('排行榜畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt['colors'])

    r = ev(page, """
        var B = NES.Input.BTN;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(4);
        var g = window.GAME.state();
        return { mode: g.mode, stage: g.stage.index, loop: g.loop, rank: g.rankState.loopBonus };
    """)
    ok('排行榜 START → 第二輪從關卡 1 開始',
       r['mode'] == 'play' and r['stage'] == 1 and r['loop'] == 1, r)
    ok('第二輪 rank 起點更高（loopBonus = 2）', r['rank'] == 2, r['rank'])

    # 排行榜資料層
    fresh(page)
    r = ev(page, """
        var H = CR.HiScore;
        H.clear();
        var a = H.list().length, top = H.list()[0].s, last = H.list()[9].s;
        var q1 = H.qualifies(last + 1), q0 = H.qualifies(1);
        var rk = H.insert('ZZZ', top + 1, 7, 1);
        var b = H.list();
        var i; for (i = 0; i < 12; i++) H.insert('Q' + (i % 10), 1000 + i, 1, 0);
        var c = H.list().length;
        var raw = window.localStorage.getItem(H.KEY);
        H.reload();
        var d = H.list()[0];
        var nm = H.cleanName('a1b');
        H.clear();
        return { a: a, q1: q1, q0: q0, rk: rk, first: b[0], len: b.length, c: c,
                 saved: !!raw, d: d, nm: nm, letters: H.LETTERS.length };
    """)
    eq('排行榜固定 10 筆', r['a'], 10)
    ok('分數高於第 10 名才上榜', r['q1'] is True and r['q0'] is False, r)
    eq('破紀錄插在第 1 名', [r['rk'], r['first']['n']], [0, 'ZZZ'])
    eq('插入後仍然只有 10 筆', [r['len'], r['c']], [10, 10])
    ok('存進 localStorage 且重載後還在', r['saved'] and r['d']['n'] == 'ZZZ', r['d'])
    eq('名字只收 A..Z 與 `.`（3 字母）', r['nm'], 'AB.')
    eq('可選字元 27 個（A..Z + .）', r['letters'], 27)

    # 標題畫面（**不要** fresh() 的 START）：SELECT 看榜、再 START 回標題
    page.goto(PAGE)
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.GAME')
    page.evaluate('() => __nes.step(3)')
    r = ev(page, """
        var B = NES.Input.BTN;
        var m0 = window.GAME.state().mode;
        NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(3);
        var m = window.GAME.state().mode;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(3);
        return { m0: m0, m: m, back: window.GAME.state().mode };
    """)
    ok('標題畫面 SELECT = 看排行榜',
       r['m0'] == 'title' and r['m'] == 'scores', r)
    ok('排行榜（從標題進來的）按 START 回標題', r['back'] == 'title', r)


# ================================================== ⑥ 密技 / 既有功能回歸
def test_cheat(page):
    print('[⑥ 一鍵密技 / 暫停 / Konami 仍在（R2c 的驗收不能壞）]')
    fresh(page, '&stage=7')
    page.evaluate("() => { __nes.release(); __nes.step(20); }")
    b = page.evaluate('() => GAME.state()')
    page.keyboard.press('KeyC')
    page.evaluate('() => __nes.step(2)')
    k = page.evaluate('() => GAME.state()')
    ok('第 7 關：鍵盤 C 一鍵密技照樣生效（SPEED %d → %d）' % (b['speed'], k['speed']),
       k['speed'] == b['speed'] + 1 and k['power']['option'] == 2 and k['power']['shield'] == 5,
       k['power'])
    ok('第 7 關：密技畫面出現 SECRET!', 'SECRET' in k['msg'].split('|')[1], k['msg'])
    r = ev(page, """
        __nes.step(40);
        NES.Touch.cheat(); __nes.step(2);
        var a = window.GAME.state().cheats;
        var B = NES.Input.BTN;
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
        var p = window.GAME.state();
        NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
        return { cheats: a, paused: p.paused, msg2: p.msg2.split('|')[0],
                 back: window.GAME.state().paused };
    """)
    ok('NES.Touch.cheat()（手機 ★密技）仍可用', r['cheats'] >= 2, r['cheats'])
    ok('START 暫停 + 暫停提示文字仍在', r['paused'] is True and 'SECRET' in r['msg2'], r)
    ok('再按 START 解除暫停', r['back'] is False)

    r = ev(page, """
        CR.ship.addScore(1000);
        CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
        __nes.step(150);
        var m = window.GAME.state().mode;
        var B = NES.Input.BTN;
        NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(3);
        var g = window.GAME.state();
        return { over: m, mode: g.mode, lives: g.lives };
    """)
    ok('GAME OVER + SELECT 續關仍可用', r['over'] == 'gameover' and r['mode'] == 'play' and r['lives'] == 3, r)


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
        test_rank(page)
        test_stage7(page)
        test_ripple(page)
        test_bonus(page)
        test_ending(page)
        test_cheat(page)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 66)
    print('R4 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 66)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
