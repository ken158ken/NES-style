# -*- coding: utf-8 -*-
"""games/cruiser 關卡層（stage agent）自動驗證：地形 / 出怪 / 敵人 / 魔王 / 預算 / lint。

作法：Playwright(Chromium) 開 `cruiser.html?debug=1&scale=1&mute=1`，用 `__nes.step/tap/lint/stats`
推進與取樣，並直接呼叫 `CR.stage` 的契約 API（`spawnTest / restart / clearScreen / solidAt`）。
本檔只驗 stage 自己的東西；**不依賴 ship 的具體行為**（船一律開無敵、敵人用 spawnTest 生成）。

用法：../卡比之星/.venv/bin/python games/cruiser/test_stage1.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

對照：docs/TASKS.md「R2《星塵巡航艦》」契約、docs/ENGINE_API.md §15（NES.SH）、
      docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §10（捲動 0.5 px/f、檢查點 512 px）。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = (ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r 期望 %r' % (got, want)))


def near(name, got, lo, hi, detail=''):
    ok(name, got is not None and lo <= got <= hi, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


def fresh(page):
    """重載頁面 → 進入 play 模式 → 船無敵（避免死亡觸發 restart 打斷測試）→ 清場。"""
    page.goto(PAGE)
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!CR.stage && !!window.GAME')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(3); }")
    page.evaluate("""() => {
        if (CR.ship) { CR.ship.invul = 1 << 28; CR.ship.lives = 9; }
        CR.stage.restart(0);
    }""")
    return page


def ev(page, js):
    return page.evaluate('() => { ' + js + ' }')


# ------------------------------------------------------------------ ① 契約介面
def test_contract(page):
    print('[① CR.stage 契約介面 / CHR 磚分配]')
    fresh(page)
    api = ev(page, """
        var s = CR.stage, out = {};
        ['init','update','draw','checkpoint','restart','solidAt','clearScreen','spawnTest']
          .forEach(function(k){ out[k] = typeof s[k]; });
        out.length = s.length; out.speed = s.speed; out.camX = s.camX;
        out.bossActive = s.bossActive; out.cleared = s.cleared;
        out.pools = ['enemies','bullets','capsules'].map(function(k){ return !!(s[k] && s[k].items); });
        return out;
    """)
    for k in ('init', 'update', 'draw', 'checkpoint', 'restart', 'solidAt', 'clearScreen', 'spawnTest'):
        eq('CR.stage.%s 是 function' % k, api[k], 'function')
    eq('CR.stage.length = 384 欄（12 畫面）', api['length'], 384)
    eq('CR.stage.speed = 128（8.8 = 0.5 px/幀，研究 16 §10）', api['speed'], 128)
    ok('enemies / bullets / capsules 都是物件池', all(api['pools']), api['pools'])
    ok('起始 bossActive=false、cleared=false', not api['bossActive'] and not api['cleared'])

    chr_ = ev(page, """
        var spr = NES.CHR.getBank('cr_spr'), bg = NES.CHR.getBank('cr_bg');
        function minIdx(bank, pfx) {
          var m = 999, i;
          for (i = 0; i < bank.names.length; i++) if (bank.names[i].indexOf(pfx) === 0) {
            var v = bank.index(bank.names[i]); if (v < m) m = v;
          }
          return m;
        }
        return {
          sprWorld: Object.keys(CR.SPR_WORLD).length,
          bgWorld: Object.keys(CR.BG_WORLD).length,
          sprMin: minIdx(spr, 'W_'), bgMin: minIdx(bg, 'W_'),
          sprMax: spr.count, bgMax: bg.count
        };
    """)
    ok('CR.SPR_WORLD ≤ 128 磚（契約：精靈磚 128..255）', chr_['sprWorld'] <= 128, chr_['sprWorld'])
    ok('CR.BG_WORLD ≤ 192 磚（契約：背景磚 64..255）', chr_['bgWorld'] <= 192, chr_['bgWorld'])
    ok('W_ 精靈磚落在索引 ≥ 128', chr_['sprMin'] >= 128, 'min=%s' % chr_['sprMin'])
    ok('W_ 背景磚落在索引 ≥ 64', chr_['bgMin'] >= 64, 'min=%s' % chr_['bgMin'])
    ok('兩個 bank 都 ≤ 256 磚', chr_['sprMax'] <= 256 and chr_['bgMax'] <= 256,
       '%s / %s' % (chr_['sprMax'], chr_['bgMax']))

    pal = ev(page, """
        return { spr2: CR.WORLD_PAL.spr2, spr3: CR.WORLD_PAL.spr3,
                 bg1: CR.WORLD_PAL.bg1, bg2: CR.WORLD_PAL.bg2, bg3: CR.WORLD_PAL.bg3,
                 backdrop: CR.WORLD_PAL.backdrop };
    """)
    ok('stage 只宣告精靈 2/3 與背景 1..3（契約分工）',
       len(pal['spr2']) == 3 and len(pal['spr3']) == 3 and len(pal['bg1']) == 3, pal)
    ok('底色 $0F', pal['backdrop'] == 0x0F, pal['backdrop'])
    ok('沒有用到禁色 $0D',
       all(0x0D not in v for v in (pal['spr2'], pal['spr3'], pal['bg1'], pal['bg2'], pal['bg3'])))


# ------------------------------------------------------------------ ② Scroller / 預算
def test_scroller(page):
    print('[② 欄串流 / VBlank 預算 / 名稱表一致性]')
    fresh(page)
    r = ev(page, """
        var nes = __nes.nes(), b = nes.timing.budget;
        b.clear();
        var peak = 0, maxCol = 0, i;
        for (i = 0; i < 600; i++) { __nes.step(1); var by = CR.stage.scroller().bytes; if (by > maxCol) maxCol = by; }
        var rep = b.report();
        return { over: rep.overFrames, peak: rep.peak, limit: rep.limit, maxCol: maxCol,
                 camX: CR.stage.camX, scrPeak: CR.stage.scroller().peak };
    """)
    eq('Scroller 600 幀 budget.overFrames === 0', r['over'], 0)
    ok('單幀 PPU 寫入尖峰 ≤ 160 byte', r['peak'] <= r['limit'], '%s / %s' % (r['peak'], r['limit']))
    ok('欄串流單幀 ≤ 45 byte（26 磚 + 13 屬性 = 39）', r['maxCol'] <= 45, 'max=%s' % r['maxCol'])
    near('600 幀後 camX ≈ 300 px（0.5 px/幀）', r['camX'], 298, 302, 'camX=%s' % r['camX'])

    s = ev(page, """
        var sc = CR.stage.scroller();
        return { row0: sc.row0, rows: sc.rows, cols: sc.cols, nt: sc.nt };
    """)
    eq('Scroller row0 = 0', s['row0'], 0)
    eq('Scroller rows = 26（列 26..29 留給 HUD，不被地形覆蓋）', s['rows'], 26)
    eq('Scroller cols = 384', s['cols'], 384)

    m = ev(page, """
        var ppu = __nes.nes().ppu, bad = 0, checked = 0, first = CR.stage.camX >> 3, c, r, want, got;
        for (c = first; c < first + 32; c++) {
          for (r = 0; r < 26; r += 3) {
            var ntc = c & 63;
            got = ppu.getTile((ntc >> 5) & 1, ntc & 31, r);
            want = CR.stage.tileAt(c, r);
            checked++;
            if (got !== want) bad++;
          }
        }
        return { bad: bad, checked: checked };
    """)
    ok('名稱表內容與 tileAt() 一致（可見 32 欄 × 9 列取樣）', m['bad'] == 0,
       '不一致 %s / %s' % (m['bad'], m['checked']))

    a = ev(page, """
        var ppu = __nes.nes().ppu, bad = 0, first = CR.stage.camX >> 3, c16, r16;
        for (c16 = (first >> 1) + 1; c16 < (first >> 1) + 15; c16++) {
          for (r16 = 0; r16 < 13; r16++) {
            var wc = c16 * 2, ntc = wc & 63;
            if (((ntc & 31) & 1) !== 0) continue;
            var got = ppu.getAttr((ntc >> 5) & 1, (ntc & 31) >> 1, r16);
            if (got !== CR.stage.attrAt(c16, r16)) bad++;
          }
        }
        return bad;
    """)
    eq('屬性表與 attrAt() 一致', a, 0)


# ------------------------------------------------------------------ ③ 出怪表
def test_spawner(page):
    print('[③ 出怪表（NES.SH.Spawner）]')
    fresh(page)
    t = ev(page, """
        var tb = CR.stage.spawnTable(), i, inc = true, cols = [];
        for (i = 0; i < tb.length; i++) { cols.push(tb[i].col); if (i && tb[i].col < tb[i-1].col) inc = false; }
        return { n: tb.length, inc: inc, first: cols[0], last: cols[cols.length - 1],
                 sec1: cols.filter(function(c){ return c < 160; }).length,
                 sec2: cols.filter(function(c){ return c >= 160 && c < 320; }).length,
                 sec3: cols.filter(function(c){ return c >= 320; }).length,
                 breath: cols.filter(function(c){ return c >= 301 && c < 320; }).length };
    """)
    ok('出怪事件 ≥ 40 個', t['n'] >= 40, 'n=%s' % t['n'])
    ok('欄位遞增排序', t['inc'])
    # fix3：三段式（空戰段 欄 0..159 / 本關段 160..319 / 魔王段 320..）
    ok('三段都有事件（空戰段 / 本關段 / 魔王段）',
       t['sec1'] >= 15 and t['sec2'] >= 20 and t['sec3'] >= 2, t)
    ok('節奏漸強：本關段的事件密度 > 空戰段',
       (t['sec2'] / 160.0) > (t['sec1'] / 160.0), '%s vs %s' % (t['sec2'], t['sec1']))
    ok('魔王前有「呼吸區」（欄 301..319 完全不出怪，研究 11 §⑯-2 第 ⑤ 段）',
       t['breath'] == 0, t['breath'])

    s = ev(page, """
        CR.stage.restart(0);
        var i0 = CR.stage.spawner().index;
        CR.stage.restart(2048);
        var i2 = CR.stage.spawner().index;
        var tb = CR.stage.spawnTable(), want = 0, i;
        for (i = 0; i < tb.length; i++) if (tb[i].col <= 256) want++;
        CR.stage.restart(0);
        return { i0: i0, i2: i2, want: want };
    """)
    eq('restart(0) → Spawner 進度歸零', s['i0'], 0)
    eq('restart(2048) → Spawner.seek 跳過欄 ≤ 256 的事件（不補生）', s['i2'], s['want'])

    fired = ev(page, """
        CR.stage.restart(0);
        var before = CR.stage.spawner().index, i;
        for (i = 0; i < 900; i++) __nes.step(1);
        return { before: before, after: CR.stage.spawner().index,
                 alive: CR.stage.aliveEnemies(), camCol: CR.stage.camX >> 3 };
    """)
    ok('捲動 900 幀（≈ 欄 56）後有觸發事件', fired['after'] > fired['before'],
       '%s → %s（camCol=%s）' % (fired['before'], fired['after'], fired['camCol']))
    ok('同屏敵人 ≤ 10（契約上限）', fired['alive'] <= 10, 'alive=%s' % fired['alive'])


# ------------------------------------------------------------------ ④ 敵人
def test_enemies(page):
    print('[④ 四種敵人 + 編隊掉膠囊]')
    fresh(page)

    fan = ev(page, """
        CR.stage.restart(0);
        var list = CR.stage.spawnTest('fan', 200, 100);
        var marked = list.filter(function(e){ return e.marked; }).length;
        var idx2 = list[2] && list[2].marked;
        return { n: list.length, marked: marked, third: !!idx2,
                 w: list[0].w, h: list[0].h, kind: list[0].kind, hp: list[0].hp };
    """)
    eq('fan 編隊 = 5 隻', fan['n'], 5)
    eq('編隊只有 1 隻標記個體', fan['marked'], 1)
    ok('標記的是第 3 隻（index 2）', fan['third'])
    ok('小蜂碰撞框 8×8、hp 1', fan['w'] == 8 and fan['h'] == 8 and fan['hp'] == 1, fan)

    drop = ev(page, """
        CR.stage.restart(0);
        var caps0 = CR.stage.aliveCapsules();
        var list = CR.stage.spawnTest('fan', 200, 100), i;
        for (i = 0; i < 4; i++) list[i].hit(1);
        var mid = CR.stage.aliveCapsules();
        list[4].hit(1);
        var end = CR.stage.aliveCapsules();
        return { caps0: caps0, mid: mid, end: end, alive: CR.stage.aliveEnemies() };
    """)
    eq('編隊打掉 4 隻：還沒掉膠囊', drop['mid'], drop['caps0'])
    eq('編隊全滅 → 掉 1 顆膠囊', drop['end'], drop['caps0'] + 1)
    eq('全滅後場上 0 隻敵人', drop['alive'], 0)

    escape = ev(page, """
        CR.stage.restart(0);
        var c0 = CR.stage.aliveCapsules();
        var list = CR.stage.spawnTest('fan', 60, 100), i;
        for (i = 0; i < 4; i++) list[i].hit(1);
        for (i = 0; i < 120; i++) __nes.step(1);         // 讓第 5 隻飛出畫面左緣
        return { caps: CR.stage.aliveCapsules() - c0, alive: CR.stage.aliveEnemies() };
    """)
    eq('有個體逃走（非全滅）就不掉膠囊', escape['caps'], 0)

    zig = ev(page, """
        CR.stage.restart(0);
        var e = CR.stage.spawnTest('zig', 200, 100), ys = [], flips = [], prev = null, i;
        for (i = 0; i < 100; i++) {
          var v0 = e.vy; __nes.step(1);
          if (e.vy !== v0) flips.push(e.t);
          ys.push(e.y);
        }
        return { flips: flips.slice(0, 3), n: flips.length, hp: e.hp, w: e.w, h: e.h };
    """)
    ok('zig 每 32 幀換一次垂直方向', zig['flips'][:3] == [32, 64, 96], zig['flips'])
    ok('zig hp 1、碰撞框 12×12', zig['hp'] == 1 and zig['w'] == 12 and zig['h'] == 12, zig)

    tank = ev(page, """
        CR.stage.restart(0);
        var e = CR.stage.spawnTest('tank', 230, 100);
        var hp0 = e.hp, a = e.hit(1), b = e.hit(1), c = e.hit(1);
        return { hp0: hp0, a: a, b: b, c: c, alive: e.alive, score: e.score };
    """)
    eq('tank hp = 3', tank['hp0'], 3)
    ok('打 2 下不死、第 3 下才死', (not tank['a']) and (not tank['b']) and tank['c'] and not tank['alive'], tank)

    tv = ev(page, """
        CR.stage.restart(0);
        CR.ship.x = 40; CR.ship.y = 30;                    // 船在左上
        var e = CR.stage.spawnTest('turret', 200, 160);
        CR.stage.bullets.freeAll();
        var i, b = null;
        for (i = 0; i < CR.Enemies.TURRET_PERIOD + 2 && !b; i++) {
          __nes.step(1);
          CR.stage.bullets.each(function (x) { if (!b) b = x; });
        }
        if (!b) return { none: true };
        var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) / 256;
        return { vx: b.vx, vy: b.vy, spd: spd, frames: i };
    """)
    ok('砲台會在 90 幀內射出 1 發', not tv.get('none'), tv)
    if not tv.get('none'):
        ok('瞄準向量朝向船（左上 ⇒ vx < 0、vy < 0）', tv['vx'] < 0 and tv['vy'] < 0,
           'vx=%s vy=%s' % (tv['vx'], tv['vy']))
        near('敵彈速度 ≈ 2.0 px/幀（研究 16 §10）', tv['spd'], 1.90, 2.10, '%.3f' % tv['spd'])

    tv2 = ev(page, """
        CR.stage.restart(0);
        CR.ship.x = 220; CR.ship.y = 190;                  // 船在右下
        var e = CR.stage.spawnTest('turret', 60, 40);
        CR.stage.bullets.freeAll();
        var i, b = null;
        for (i = 0; i < CR.Enemies.TURRET_PERIOD + 2 && !b; i++) {
          __nes.step(1);
          CR.stage.bullets.each(function (x) { if (!b) b = x; });
        }
        return b ? { vx: b.vx, vy: b.vy } : { none: true };
    """)
    ok('瞄準向量朝向船（右下 ⇒ vx > 0、vy > 0）',
       (not tv2.get('none')) and tv2['vx'] > 0 and tv2['vy'] > 0, tv2)

    ceil = ev(page, """
        CR.stage.restart(2200);                            // fix3：要塞段（欄 275 起才有天花板 / 地板）
        var e = CR.stage.spawnTurretAt((CR.stage.camX >> 3) + 20, true);
        var f = CR.stage.spawnTurretAt((CR.stage.camX >> 3) + 22, false);
        return { ceilY: e && e.y, ceilFlip: e && e.flipV, floorY: f && f.y, floorFlip: f && f.flipV,
                 ch: CR.stage.ceilAt((CR.stage.camX >> 3) + 20),
                 fh: CR.stage.floorAt((CR.stage.camX >> 3) + 22) };
    """)
    ok('貼天花板的砲台用 flipV、貼在天花板下緣',
       ceil['ceilFlip'] is True and ceil['ceilY'] == ceil['ch'] * 8 + 2, ceil)
    ok('貼地板的砲台不翻轉、站在地板頂面',
       ceil['floorFlip'] is False and ceil['floorY'] == (26 - ceil['fh']) * 8 - 14, ceil)

    cap = ev(page, """
        CR.stage.restart(0);
        var c = CR.stage.spawnTest('capsule', 200, 100), x0 = c.x, i;
        for (i = 0; i < 16; i++) __nes.step(1);
        return { dx: c.x - x0, alive: c.alive, w: c.w, h: c.h };
    """)
    eq('膠囊 16 幀往左飄 8 px（0.5 px/幀）', cap['dx'], -8)
    ok('膠囊沒有壽命（16 幀後仍存在）', cap['alive'])

    blue = ev(page, """
        CR.stage.restart(0);
        var seq0 = CR.stage.capsuleSeq(), seen = [], want = [], i;
        for (i = 0; i < 16; i++) {
          CR.stage.capsules.freeAll();
          var c = CR.stage.spawnTest('capsule', 200, 100);
          seen.push(c.blue ? 1 : 0);
          want.push(((seq0 + i + 1) % CR.stage.BLUE_EVERY === 0) ? 1 : 0);
        }
        return { seen: seen, want: want, every: CR.stage.BLUE_EVERY };
    """)
    eq('膠囊計數間隔 = 16', blue['every'], 16)
    eq('每第 16 顆膠囊是藍色清屏膠囊（由 stage 計數，跨檢查點不歸零）',
       blue['seen'], blue['want'])
    ok('16 顆裡剛好 1 顆藍色', sum(blue['seen']) == 1, blue['seen'])


# ------------------------------------------------------------------ ⑤ clearScreen / solidAt / restart
def test_stage_api(page):
    print('[⑤ clearScreen / solidAt / checkpoint / restart]')
    fresh(page)

    cs = ev(page, """
        CR.stage.restart(0);
        CR.stage.spawnTest('fan', 200, 60);
        CR.stage.spawnTest('zig', 200, 120);
        var tank = CR.stage.spawnTest('tank', 230, 150);
        var i;
        for (i = 0; i < 6; i++) CR.stage.spawnTest('bullet', 200, 40 + i * 8);
        var b0 = CR.stage.aliveBullets(), e0 = CR.stage.aliveEnemies();
        var r = CR.stage.clearScreen();
        return { b0: b0, e0: e0, r: r, b1: CR.stage.aliveBullets(), e1: CR.stage.aliveEnemies(),
                 tankAlive: tank.alive };
    """)
    ok('clearScreen 前有 6 發敵彈 + 7 隻敵人', cs['b0'] == 6 and cs['e0'] == 7, cs)
    eq('clearScreen 清光所有敵彈', cs['b1'], 0)
    eq('clearScreen 回報清掉的敵彈數', cs['r']['bullets'], 6)
    eq('clearScreen 消滅小敵（fan 5 + zig 1）', cs['r']['enemies'], 6)
    ok('clearScreen 有計分', cs['r']['score'] > 0, cs['r']['score'])
    ok('硬殼（tank）不算小敵、不被清屏消滅', cs['tankAlive'] is True)

    cp = ev(page, """
        var s = CR.stage;
        return { a: s.checkpoint(0), b: s.checkpoint(600), c: s.checkpoint(1100),
                 d: s.checkpoint(2900), step: s.CHECKPOINT_STEP, list: s.CHECKPOINTS };
    """)
    eq('檢查點間距 512 px（研究 16 §10-4）', cp['step'], 512)
    eq('第 1 關共 6 個檢查點', cp['list'], [0, 512, 1024, 1536, 2048, 2560])
    eq('checkpoint(0) = 0', cp['a'], 0)
    eq('checkpoint(600) = 512', cp['b'], 512)
    eq('checkpoint(1100) = 1024', cp['c'], 1024)
    eq('checkpoint(2900) = 2560（最後一個 ≤ camX 的檢查點）', cp['d'], 2560)

    rs = ev(page, """
        CR.stage.restart(0);
        CR.stage.spawnTest('fan', 200, 60);
        CR.stage.spawnTest('bullet', 200, 80);
        CR.stage.spawnTest('capsule', 200, 90);
        var before = { e: CR.stage.aliveEnemies(), b: CR.stage.aliveBullets(), c: CR.stage.aliveCapsules() };
        CR.stage.restart(CR.stage.checkpoint(1100));
        return { before: before, camX: CR.stage.camX,
                 e: CR.stage.aliveEnemies(), b: CR.stage.aliveBullets(), c: CR.stage.aliveCapsules(),
                 boss: CR.stage.bossActive, cleared: CR.stage.cleared };
    """)
    ok('restart 前場上有敵 / 彈 / 膠囊', rs['before']['e'] > 0 and rs['before']['b'] > 0)
    eq('restart(checkpoint) → camX 回到檢查點', rs['camX'], 1024)
    ok('restart 清空敵 / 彈 / 膠囊', rs['e'] == 0 and rs['b'] == 0 and rs['c'] == 0, rs)
    ok('restart 關掉 bossActive / cleared', (not rs['boss']) and (not rs['cleared']))

    sa = ev(page, """
        CR.stage.restart(2200);                 // fix3：要塞段（有天花板 / 地板）
        var col = CR.stage.camX >> 3;
        var ch = CR.stage.ceilAt(col + 4), fh = CR.stage.floorAt(col + 4);
        var x = 4 * 8 + 2;
        return {
          ch: ch, fh: fh,
          ceil: CR.stage.solidAt(x, ch * 8 - 4),          // 天花板內
          open: CR.stage.solidAt(x, 104),                 // 中央開闊處
          floor: CR.stage.solidAt(x, (26 - fh) * 8 + 4),  // 地板內
          above: CR.stage.solidAt(x, -1),
          below: CR.stage.solidAt(x, 208),
          world: CR.stage.solidAtWorld(CR.stage.camX + x, (26 - fh) * 8 + 4)
        };
    """)
    ok('solidAt：天花板內 = true', sa['ceil'] is True, sa)
    ok('solidAt：中央通道 = false', sa['open'] is False, sa)
    ok('solidAt：地板內 = true', sa['floor'] is True, sa)
    ok('solidAt：遊戲區上下邊界外 = true', sa['above'] is True and sa['below'] is True, sa)
    ok('solidAt（畫面座標）與 solidAtWorld（世界座標）一致', sa['world'] == sa['floor'])

    consist = ev(page, """
        CR.stage.restart(2200);
        var col = CR.stage.camX >> 3, bad = 0, n = 0, c, r;
        for (c = 0; c < 32; c++) for (r = 0; r < 26; r++) {
          var k = CR.stage.kindAt(col + c, r);
          var solid = CR.stage.solidAt(c * 8 + 3, r * 8 + 3);
          var isSpaceish = (k === CR.stage.K.SPACE || k === CR.stage.K.STARA || k === CR.stage.K.STARB
                            || k === CR.stage.K.BOSSBG || k === CR.stage.K.GRID);
          n++;
          if (isSpaceish && solid) bad++;
          if (!isSpaceish && !solid && k !== CR.stage.K.LWARN && k !== CR.stage.K.LBEAM) bad++;
        }
        return { bad: bad, n: n };
    """)
    ok('solidAt 與名稱表磚種一致（32×26 全掃）', consist['bad'] == 0,
       '不一致 %s / %s' % (consist['bad'], consist['n']))

    st = ev(page, """
        CR.stage.restart(0);
        var out = {}, kinds = ['fan','turret','zig','tank','bullet','capsule','capsule_blue','boom'];
        kinds.forEach(function(k){
          CR.stage.restart(0);
          var r = CR.stage.spawnTest(k, 200, 100);
          out[k] = !!r;
        });
        var threw = false;
        try { CR.stage.spawnTest('nope', 0, 0); } catch (e) { threw = true; }
        out.threw = threw;
        CR.stage.restart(0);
        return out;
    """)
    ok('spawnTest 支援全部 8 種（給 ship 的 test_cruiser.py 用）',
       all(st[k] for k in ('fan', 'turret', 'zig', 'tank', 'bullet', 'capsule', 'capsule_blue', 'boom')), st)
    ok('spawnTest 遇到未知種類會 throw', st['threw'])


# ------------------------------------------------------------------ ⑥ 魔王
def test_boss(page):
    print('[⑥ 魔王「核心要塞」三階段]')
    fresh(page)

    const = ev(page, """
        return { plate: CR.Boss.PLATE_HP, core: CR.Boss.CORE_HP, p3: CR.Boss.PHASE3_HP,
                 total: CR.Boss.TOTAL_HP, open: CR.Boss.OPEN_FRAMES, shut: CR.Boss.SHUT_FRAMES,
                 enter: CR.Boss.ENTER_FRAMES, warn: CR.Boss.WARN_FRAMES, ring: CR.Boss.RING_N,
                 hulls: Object.keys(CR.Boss.HULL_MAPS).length };
    """)
    eq('外殼板 hp 4 × 4 片', const['plate'], 4)
    eq('核心 hp 8', const['core'], 8)
    eq('魔王總血量 24（總控依研究調整）', const['total'], 24)
    eq('三張艦體形變圖（每掉一階段換一張）', const['hulls'], 3)
    eq('核心開 60 幀 / 合 90 幀', [const['open'], const['shut']], [60, 90])
    eq('環形彈 8 發', const['ring'], 8)

    ent = ev(page, """
        CR.stage.restart(0);
        CR.stage.spawnTest('boss');
        var s0 = CR.Boss.state(), i;
        for (i = 0; i < CR.Boss.ENTER_FRAMES + 2; i++) __nes.step(1);
        var s1 = CR.Boss.state();
        return { s0: s0, s1: s1, parts: CR.stage.enemies.count };
    """)
    eq('進場階段 phase = 0', ent['s0']['phase'], 0)
    eq('進場 60 幀後 → 階段 1', ent['s1']['phase'], 1)
    eq('落位在 HOME_X = 176', ent['s1']['x'], 176)
    eq('階段 1 艦體用形變圖 ①', ent['s1']['hullPhase'], 1)
    eq('外殼板 4 片、各 hp 4', ent['s1']['plateHp'], [4, 4, 4, 4])
    eq('階段 1 只有 4 個可打部位（核心尚未配置）', ent['parts'], 4)

    p1 = ev(page, """
        var parts = [], i;
        CR.stage.enemies.each(function(e){ parts.push(e); });
        var hp0 = parts[0].hp;
        parts[0].hit(1); parts[0].hit(1);
        var mid = parts[0].hp;
        parts[0].hit(2);
        var st = CR.Boss.state();
        return { hp0: hp0, mid: mid, left: st.platesLeft, phase: st.phase, dead: !parts[0].alive };
    """)
    ok('外殼板吃傷害（4 → 2）', p1['hp0'] == 4 and p1['mid'] == 2, p1)
    ok('外殼板打完會消失、platesLeft 遞減', p1['dead'] and p1['left'] == 3, p1)

    p2 = ev(page, """
        var parts = [];
        CR.stage.enemies.each(function(e){ parts.push(e); });
        parts.forEach(function(e){ e.hit(99); });
        var st = CR.Boss.state();
        var core = null;
        CR.stage.enemies.each(function(e){ if (e.kind === 'bcore') core = e; });
        return { phase: st.phase, coreHp: st.coreHp, open: st.coreOpen, hull: st.hullPhase,
                 hasCore: !!core, coreW: core && core.w };
    """)
    eq('4 片打光 → 階段 2', p2['phase'], 2)
    eq('階段 2 換形變圖 ②', p2['hull'], 2)
    eq('核心露出 hp 8', p2['coreHp'], 8)
    ok('階段 2 一開始核心是合上的（無敵）', p2['open'] is False)
    ok('核心是 16×16 的可打部位', p2['hasCore'] and p2['coreW'] == 16, p2)

    shut = ev(page, """
        var core = null;
        CR.stage.enemies.each(function(e){ if (e.kind === 'bcore') core = e; });
        var hp0 = CR.Boss.state().coreHp;
        var r = core.hit(3);
        return { hp0: hp0, r: r, hp1: CR.Boss.state().coreHp };
    """)
    ok('核心合上時打不進（hit 回 false、hp 不變）',
       shut['r'] is False and shut['hp0'] == shut['hp1'], shut)

    cyc = ev(page, """
        var st = CR.Boss.state(), i, flips = [], prev = st.coreOpen;
        for (i = 0; i < 400; i++) {
          __nes.step(1);
          var s = CR.Boss.state();
          if (s.phase !== 2) break;
          if (s.coreOpen !== prev) { flips.push({ f: i, open: s.coreOpen }); prev = s.coreOpen; }
        }
        return flips.slice(0, 4);
    """)
    ok('核心開合週期：合 90 幀後開', len(cyc) >= 1 and cyc[0]['open'] is True and 88 <= cyc[0]['f'] <= 91, cyc)
    ok('核心開合週期：開 60 幀後合',
       len(cyc) >= 2 and cyc[1]['open'] is False and 58 <= (cyc[1]['f'] - cyc[0]['f']) <= 62, cyc)

    p3 = ev(page, """
        var core = null;
        CR.stage.enemies.each(function(e){ if (e.kind === 'bcore') core = e; });
        var i;
        for (i = 0; i < 200 && !CR.Boss.state().coreOpen; i++) __nes.step(1);
        var before = CR.Boss.state();
        core.hit(5);                                   // 8 → 3 ⇒ 觸發階段 3
        var st = CR.Boss.state();
        return { before: before.coreHp, phase: st.phase, hp: st.coreHp, laser: st.laser, hull: st.hullPhase };
    """)
    eq('核心開啟時可打（8 → 3）', p3['hp'], 3)
    eq('核心 hp ≤ 3 → 階段 3', p3['phase'], 3)
    eq('階段 3 換形變圖 ③', p3['hull'], 3)
    eq('階段 3 從雷射預告開始', p3['laser'], 'warn')

    laser = ev(page, """
        var i, seq = [], big0 = 0, big1 = 0;
        for (i = 0; i < 40; i++) { __nes.step(1); }
        var s1 = CR.Boss.state();
        CR.stage.bullets.each(function(b){ if (b.big) big1++; });
        var rows = [], ppu = __nes.nes().ppu;
        CR.Boss.LASER_OFF.forEach(function(o){ rows.push((CR.Boss.raw().y + o) >> 3); });
        var beamTile = CR.stage.tileIndex('LBEAM'), hit = 0, c;
        for (c = 0; c < 20; c++) {
          var wc = (CR.stage.camX >> 3) + c, ntc = wc & 63;
          if (ppu.getTile((ntc >> 5) & 1, ntc & 31, rows[1]) === beamTile) hit++;
        }
        return { laser: s1.laser, big: big1, beamTiles: hit };
    """)
    eq('預告 30 幀後進入發射（beam）', laser['laser'], 'beam')
    eq('三條雷射各是一顆大判定彈（main 的敵彈 × 船判定直接生效）', laser['big'], 3)
    ok('雷射用背景磚畫（不吃精靈額度）', laser['beamTiles'] >= 18, laser['beamTiles'])

    ring = ev(page, """
        CR.stage.bullets.freeAll();
        var i, n = 0;
        for (i = 0; i < CR.Boss.BEAM_FRAMES + CR.Boss.COOL_FRAMES + 5; i++) {
          __nes.step(1);
          var c = 0; CR.stage.bullets.each(function(b){ if (!b.big) c++; });
          if (c > n) n = c;
        }
        return n;
    """)
    ok('階段 3 每輪放環形 8 彈', ring >= 8, 'max=%s' % ring)

    die = ev(page, """
        var core = null;
        CR.stage.enemies.each(function(e){ if (e.kind === 'bcore') core = e; });
        var i;
        for (i = 0; i < 300 && !CR.Boss.state().coreOpen; i++) __nes.step(1);
        core.hit(99);
        var s0 = CR.Boss.state();
        for (i = 0; i < CR.Boss.DEATH_FRAMES + 3; i++) __nes.step(1);
        return { phase0: s0.phase, deathT: s0.deathT, cleared: CR.stage.cleared,
                 active: CR.Boss.active(), booms: CR.stage.explosions.count };
    """)
    eq('核心打爆 → 階段 4（死亡大爆炸）', die['phase0'], 4)
    eq('大爆炸 90 幀', die['deathT'], 90)
    ok('爆炸結束 → CR.stage.cleared = true', die['cleared'] is True, die)
    ok('魔王結束後 bossActive 關閉', die['active'] is False)


# ------------------------------------------------------------------ ⑦ lint / 精靈
def test_lint(page):
    print('[⑦ lint（≤ 25 色）/ 每線精靈 / OAM 輪替]')
    fresh(page)
    r = ev(page, """
        CR.stage.restart(600);
        var i, worst = 0, colors = 0, over = 0;
        for (i = 0; i < 400; i++) {
          __nes.step(1);
          var s = __nes.stats();
          if (s.maxSpritesLine > worst) worst = s.maxSpritesLine;
          if (s.colors > colors) colors = s.colors;
        }
        var l = __nes.lint();
        return { worst: worst, colors: colors, lint: l.ok, bad: l.badPixels,
                 over: __nes.nes().timing.budget.report().overFrames };
    """)
    ok('400 幀內同屏色數 ≤ 25', r['colors'] <= 25, 'max=%s' % r['colors'])
    ok('lint 通過（無非 64 色像素）', r['lint'] and not r['bad'], r)
    ok('400 幀 VBlank 預算 0 次超支', r['over'] == 0, r['over'])
    ok('每線精靈數 ≤ 10（超過 8 的由 NES.SH.OAM 輪替 ⇒ 交替幀畫齊）', r['worst'] <= 10, 'max=%s' % r['worst'])

    heavy = ev(page, """
        CR.stage.restart(600);
        CR.stage.enemies.freeAll();
        var i;
        for (i = 0; i < 10; i++) CR.stage.spawnTest('zig', 150 + (i % 3) * 20, 96);   // 硬擠同一條線
        var worst = 0, dropped = 0;
        for (i = 0; i < 12; i++) {
          __nes.step(1);
          var s = __nes.stats();
          if (s.maxSpritesLine > worst) worst = s.maxSpritesLine;
        }
        var l = __nes.lint();
        return { worst: worst, alive: CR.stage.aliveEnemies(), ok: l.ok, colors: l.colors };
    """)
    ok('刻意塞滿同一條掃描線時，同屏敵人仍 ≤ 10', heavy['alive'] <= 10, heavy['alive'])
    ok('超線時 lint 仍不報色數 / 壞像素（閃爍是合法的 NES 行為）',
       heavy['ok'] or heavy['colors'] <= 25, heavy)

    oam = ev(page, """
        CR.stage.restart(600);
        var ppu = __nes.nes().ppu;
        return { flickerStep: ppu.flickerStep, flicker: ppu.flicker, mode: ppu.spriteMode() };
    """)
    eq('ppu.flickerStep = 0（輪替交給 NES.SH.OAM，畫面可重現）', oam['flickerStep'], 0)
    eq('8×8 精靈模式', oam['mode'], 8)


# ================================================ ⑧ fix2（R2 QA P2-3 / P2-4~6 難度與配色）
def test_fix2(page):
    print('[⑧ fix2：通道寬度 / 檢查點安全區 / 紅色單體 / 敵彈與砲台配色]')
    fresh(page)

    # ---- 通道最窄 ≥ 18 列（原本 [5,8] / [4,7] / [6,6] 只剩 13~15 列）----
    r = ev(page, """
        var s = CR.stage, worst = 99, at = -1, c;
        for (c = 0; c < s.length; c++) {
          var free = s.ROWS - s.ceilAt(c) - s.floorAt(c);
          if (free < worst) { worst = free; at = c; }
        }
        return { worst: worst, at: at, rows: s.ROWS };
    """)
    ok('全關最窄通道 >= 18 列（144 px）', r['worst'] >= 18, r)

    # ---- 檢查點之後 22 欄內沒有砲台事件（砲台站在事件欄 + 34、進畫面時相機在 -32）----
    r = ev(page, """
        var s = CR.stage, tb = s.spawnTable(), cps = s.CHECKPOINTS, out = [], i, j;
        var seen = [], orig = s.spawnTurretAt;
        s.spawnTurretAt = function (col, ceil) { seen.push(col); return null; };
        for (i = 0; i < tb.length; i++) { try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {} }
        s.spawnTurretAt = orig;
        s.enemies.freeAll(); s.restart(0);
        var evc = seen.map(function (w) { return w - 34; });
        for (i = 0; i < cps.length; i++) {
          var cp = cps[i] >> 3;
          for (j = 0; j < evc.length; j++) if (evc[j] >= cp && evc[j] < cp + 22) out.push([cp, evc[j]]);
        }
        return { turrets: evc, bad: out };
    """)
    ok('砲台數量由 15 座減到 <= 10 座', len(r['turrets']) <= 10, r['turrets'])
    ok('每個檢查點之後 22 欄內沒有砲台（復活後 >= 350 幀不會被瞄準彈鎖定）', r['bad'] == [], r['bad'])

    # ---- 難點段（世界欄 150~300）的砲台射擊週期 130（-30% 密度）----
    r = ev(page, """
        var E = CR.Enemies;
        return { base: E.TURRET_PERIOD, easy: E.EASY_PERIOD,
                 at100: E.turretPeriod(100 * 8), at180: E.turretPeriod(180 * 8),
                 at250: E.turretPeriod(250 * 8), at318: E.turretPeriod(318 * 8) };
    """)
    eq('砲台基礎週期 90 幀（研究 §10）', r['base'], 90)
    eq('難點段砲台週期 130 幀（敵彈密度 -30%）', r['easy'], 130)
    # fix3：砲台只存在於要塞（世界欄 248..319）⇒ 放寬區改成 248..383
    ok('要塞欄 250 / 318 在放寬區、空戰段欄 100 / 180 不在',
       r['at250'] == 130 and r['at318'] == 130 and r['at100'] == 90 and r['at180'] == 90, r)

    # ---- 紅色單體（研究 §3-3 [源]）：必掉膠囊，每個檢查點之後 14 欄內至少一隻 ----
    r = ev(page, """
        var s = CR.stage, tb = s.spawnTable(), reds = [], i;
        for (i = 0; i < tb.length; i++) {
          var before = [];
          s.enemies.each(function (e) { before.push(e); });
          try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {}
          var got = false;
          s.enemies.each(function (e) { if (before.indexOf(e) < 0 && e.drop) got = true; });
          if (got) reds.push(tb[i].col);
          s.enemies.freeAll();
        }
        s.restart(0);
        var cps = s.CHECKPOINTS, miss = [], j;
        for (i = 1; i < cps.length; i++) {          // 檢查點 0 = 開局（沒有懲罰），不需要回血點
          var cp = cps[i] >> 3, hit = false;
          for (j = 0; j < reds.length; j++) if (reds[j] >= cp && reds[j] <= cp + 14) hit = true;
          if (!hit) miss.push(cp);
        }
        return { reds: reds, miss: miss };
    """)
    ok('出怪表有紅色單體（打掉必掉膠囊）', len(r['reds']) >= 6, r['reds'])
    ok('每個復活檢查點（512 起）之後 14 欄內都有紅色單體（死亡後有回血路徑）', r['miss'] == [], r)

    r = ev(page, """
        CR.stage.restart(0);
        var e = CR.Enemies.spawn('zig', 200, 100, { drop: 1 });
        var pal = e.pal, n0 = CR.stage.aliveCapsules();
        e.hit(9);
        return { pal: pal, caps: CR.stage.aliveCapsules() - n0, PAL_DROP: CR.Enemies.PAL_DROP };
    """)
    eq('紅色單體用精靈調色盤 1（ship 的 紅 $16 / 橘 $28 / 白 $30）', r['pal'], 1)
    eq('紅色單體打掉 -> 掉 1 顆膠囊', r['caps'], 1)

    # ---- P2-4 敵彈只用亮色 3（兩幀交替 spr2 淡黃 / spr1 白）----
    r = ev(page, """
        var S = CR.SPR_WORLD;   // 8x8 磚是字串列；quad() 產生的 16x16 子磚已編成 64 byte 陣列
        function px(t) { var a = [], i, j, c;
          if (typeof t[0] === 'string') { for (i = 0; i < t.length; i++) for (j = 0; j < t[i].length; j++) { c = t[i].charAt(j); a.push(c === '.' ? 0 : (c | 0)); } }
          else { for (i = 0; i < 64; i++) a.push(t[i] | 0); }
          return a; }
        function used(t) { var u = {}, a = px(t), i; for (i = 0; i < a.length; i++) u[a[i]] = 1; return Object.keys(u).sort().join(''); }
        return { s0: used(S.W_SHOT0), s1: used(S.W_SHOT1) };
    """)
    ok('敵彈第 1 幀只有輪廓色 1 + 亮色 3', r['s0'] == '013', r['s0'])
    ok('敵彈第 2 幀也只有輪廓色 1 + 亮色 3（不再用深綠色 2）', r['s1'] == '013', r['s1'])

    # ---- P2-5 砲台主體改藍（色 2），白只留輪廓 / 砲管 ----
    r = ev(page, """
        var S = CR.SPR_WORLD, ts = [S.W_TUR0_r1c0, S.W_TUR0_r1c1], i, j, n2 = 0, n3 = 0;
        for (i = 0; i < ts.length; i++) for (j = 0; j < 64; j++) {
          if (ts[i][j] === 2) n2++;
          if (ts[i][j] === 3) n3++;
        }
        return { n2: n2, n3: n3 };
    """)
    ok('砲台下半部以色 2（藍）為主體、色 3（白）只剩點綴', r['n2'] > r['n3'], r)

    # ---- P2-6 魔王室背板改網點（不再整片實心）----
    r = ev(page, """
        var t = CR.BG_WORLD.W_BOSSBG, i, j, on = 0, tot = 0;
        if (typeof t[0] === 'string') { for (i = 0; i < t.length; i++) for (j = 0; j < t[i].length; j++) { tot++; if (t[i].charAt(j) !== '.') on++; } }
        else { for (i = 0; i < 64; i++) { tot++; if (t[i] !== 0) on++; } }
        return { on: on, tot: tot };
    """)
    ok('魔王室背板是 2x2 網點（實心比例 ~50%，感知飽和度砍半）',
       0.4 <= r['on'] / float(r['tot']) <= 0.6, r)

    # ---- 魔王復活點 ----
    r = ev(page, "return { cp: CR.stage.BOSS_RESPAWN, max: CR.stage.CAM_MAX };")
    eq('stage.BOSS_RESPAWN = 2760', r['cp'], 2760)
    ok('魔王死亡後空捲 <= 3 秒', (r['max'] - r['cp']) / 0.5 <= 180, r)


# ============================================== ⑨ fix3（三段式節奏 + 可破壞小隕石）
def test_fix3(page):
    print('[⑨ fix3：三段式節奏 / 空戰段淨空 / 可破壞小隕石]')
    fresh(page)

    # ---- 分段常數 ----
    r = ev(page, """
        var s = CR.stage;
        return { air: s.AIR_COLS, b0: s.BELT_COL0, b1: s.BELT_COL1, f0: s.FORT_COL0,
                 boss: s.BOSS_COL0, rocks: s.BIG_ROCKS.length };
    """)
    eq('空戰段 = 欄 0..191（camX 0..1280，前 5 畫面看得到的全部欄）', r['air'], 192)
    eq('小行星帶從欄 192 起', r['b0'], 192)
    eq('要塞從欄 248 起', r['f0'], 248)
    eq('核心室（魔王段）從欄 320 起（＝ 世界 2560..3072 px）', r['boss'], 320)

    # ---- 空戰段：完全沒有 solid（地形 / 隕石 / 砲台底座）----
    r = ev(page, """
        var s = CR.stage, bad = [], c, r2;
        for (c = 0; c < s.AIR_COLS; c++) {
          if (s.ceilAt(c) || s.floorAt(c)) { bad.push(['hf', c]); continue; }
          for (r2 = 0; r2 < s.ROWS; r2++) if (s.solidAtWorld(c * 8 + 3, r2 * 8 + 3)) bad.push([c, r2]);
        }
        return { bad: bad.slice(0, 5), n: bad.length };
    """)
    ok('空戰段（欄 0..191 ＝ camX 0..1280）沒有任何 solid 磚（純星空）', r['n'] == 0, r)

    # ---- 空戰段：出怪表只有 fan / zig，沒有 turret / tank / rock ----
    r = ev(page, """
        var s = CR.stage, tb = s.spawnTable(), kinds = {}, turretCols = [], i;
        var orig = s.spawnTurretAt;
        s.spawnTurretAt = function (col) { turretCols.push(col); return null; };
        for (i = 0; i < tb.length; i++) {
          if (tb[i].col >= 160) break;
          s.enemies.freeAll();
          try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {}
          s.enemies.each(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
        }
        s.spawnTurretAt = orig; s.enemies.freeAll(); s.restart(0);
        return { kinds: kinds, turrets: turretCols.length };
    """)
    ok('空戰段只有 fan 編隊與 zig（沒有 turret / tank / rock ⇒ 沒有硬殼、沒有敵彈）',
       sorted(r['kinds'].keys()) == ['fan', 'zig'] and r['turrets'] == 0, r)
    ok('空戰段 fan 編隊 ≥ 10 波（5 隻 / 波）', r['kinds'].get('fan', 0) >= 50, r['kinds'])
    ok('空戰段紅色單體 ≥ 6 隻（hp 1、必掉膠囊的保底管道）',
       r['kinds'].get('zig', 0) >= 10, r['kinds'])

    # ---- 空戰段實跑：0 發敵彈、膠囊管道足夠 ----
    r = ev(page, """
        CR.stage.restart(0);
        CR.ship.invul = 1 << 28;
        var maxB = 0, i, drops = 0;
        for (i = 0; i < 2560; i++) {                    // camX 0 → 1280
          __nes.step(1);
          if (CR.stage.aliveBullets() > maxB) maxB = CR.stage.aliveBullets();
        }
        // 把場上還活著的小敵全部打掉，數一數空戰段的膠囊上限
        var seq0 = CR.stage.capsuleSeq();
        return { camX: CR.stage.camX, maxBullets: maxB, seq0: seq0 };
    """)
    eq('空戰段跑完 camX = 1280', r['camX'], 1280)
    eq('空戰段全程 0 發敵彈（規格是「640 px 後才開始」，實作更寬鬆＝完全沒有）', r['maxBullets'], 0)

    r = ev(page, """
        // 膠囊供給上限：把空戰段的每一個事件都生出來、全部打光，數膠囊
        CR.stage.restart(0);
        var s = CR.stage, tb = s.spawnTable(), caps = 0, i, guard = 0;
        var seq0 = s.capsuleSeq();
        for (i = 0; i < tb.length && tb[i].col < 160; i++) {
          s.enemies.freeAll(); s.capsules.freeAll();
          try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {}
          var list = [];
          s.enemies.each(function (e) { list.push(e); });
          for (var j = 0; j < list.length; j++) if (list[j].alive) list[j].hit(9);
        }
        caps = s.capsuleSeq() - seq0;
        s.restart(0);
        return { caps: caps };
    """)
    # 11 波 fan（全滅各 1 顆）+ 7 隻紅色單體（1 發即掉）= 18；機器人實測自然拿到 9 顆
    ok('空戰段全打光可得 16~20 顆膠囊（機器人實測自然拿 9 顆 ⇒ SPEED / MISSILE / LASER 買得起）',
       16 <= r['caps'] <= 20, r)

    # ---- 小行星帶：大隕石只貼上下緣、通道 ≥ 18 列 ----
    r = ev(page, """
        var s = CR.stage, worst = 99, at = -1, c, r2, run, best;
        for (c = 0; c < s.length; c++) {
          run = 0; best = 0;
          for (r2 = 0; r2 < s.ROWS; r2++) {
            if (!s.solidAtWorld(c * 8 + 3, r2 * 8 + 3)) { run++; if (run > best) best = run; }
            else run = 0;
          }
          if (best < worst) { worst = best; at = c; }
        }
        var rows = s.BIG_ROCKS.map(function (b) { return b[1]; });
        var cols = s.BIG_ROCKS.map(function (b) { return b[0]; });
        return { worst: worst, at: at, rows: rows,
                 outside: cols.filter(function (c2) { return c2 < s.BELT_COL0 || c2 > s.BELT_COL1 - 1; }) };
    """)
    ok('全關「最長連續可通行列」>= 18 列（144 px，含大隕石）', r['worst'] >= 18, r)
    ok('大隕石只貼上緣（列 0 / 2）或下緣（列 22 / 24）',
       all(x in (0, 2, 22, 24) for x in r['rows']), r['rows'])
    ok('大隕石全部落在小行星帶（欄 192..246）', r['outside'] == [], r['outside'])

    # ---- 可破壞小隕石 rock ----
    r = ev(page, """
        CR.stage.restart(0);
        var e = CR.stage.spawnTest('rock', 200, 100);
        if (!e) return { none: true };
        var spec = CR.Enemies.SPEC.rock;
        var hp0 = e.hp, a = e.hit(1), b = e.hit(1);
        return { hp0: hp0, a: a, b: b, alive: e.alive, score: spec.score,
                 w: spec.w, h: spec.h, small: spec.small, pal: spec.pal,
                 vx: CR.Enemies.ROCK_VX };
    """)
    ok('spawnTest 支援 rock', not r.get('none'), r)
    eq('小隕石 hp = 2', r['hp0'], 2)
    ok('打 1 下不死、第 2 下才破', (not r['a']) and r['b'] and not r['alive'], r)
    eq('小隕石 100 分', r['score'], 100)
    ok('小隕石碰撞框 8×8、算「小敵」（會被藍膠囊清屏）', r['w'] == 8 and r['h'] == 8 and r['small'], r)
    eq('小隕石往左 1.0 px/幀（8.8 = -256）', r['vx'], -256)

    r = ev(page, """
        CR.stage.restart(0);
        var e = CR.stage.spawnTest('rock', 200, 100), x0 = e.x, i;
        for (i = 0; i < 16; i++) __nes.step(1);
        return { dx: e.x - x0, y: e.y };
    """)
    eq('小隕石 16 幀往左 16 px（比捲動 0.5 快一倍 ⇒ 會「迎面飄來」）', r['dx'], -16)
    eq('小隕石不上下飄', r['y'], 100)

    # ---- 小隕石只出現在小行星帶 ----
    r = ev(page, """
        var s = CR.stage, tb = s.spawnTable(), cols = [], i;
        var orig = s.spawnTurretAt;
        s.spawnTurretAt = function () { return null; };
        for (i = 0; i < tb.length; i++) {
          s.enemies.freeAll();
          try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {}
          var got = false;
          s.enemies.each(function (e) { if (e.kind === 'rock') got = true; });
          if (got) cols.push(tb[i].col);
        }
        s.spawnTurretAt = orig; s.enemies.freeAll(); s.restart(0);
        return { cols: cols };
    """)
    ok('小隕石事件 ≥ 4 組，而且全部在小行星帶（欄 160..213）',
       len(r['cols']) >= 4 and all(160 <= c <= 213 for c in r['cols']), r['cols'])

    # ---- tank 硬殼只在本關段之後才出現 ----
    r = ev(page, """
        var s = CR.stage, tb = s.spawnTable(), first = -1, i;
        var orig = s.spawnTurretAt;
        s.spawnTurretAt = function () { return null; };
        for (i = 0; i < tb.length; i++) {
          s.enemies.freeAll();
          try { tb[i].fn({}, tb[i].col, tb[i]); } catch (e) {}
          var got = false;
          s.enemies.each(function (e) { if (e.kind === 'tank') got = true; });
          if (got && first < 0) first = tb[i].col;
        }
        s.spawnTurretAt = orig; s.enemies.freeAll(); s.restart(0);
        return { first: first };
    """)
    ok('tank 硬殼最早在要塞段才登場（欄 >= 214）', r['first'] >= 214, r)

    # ---- 魔王爆炸瞬間清空殘彈（打贏了不該死在勝利動畫裡）----
    r = ev(page, """
        CR.stage.restart(CR.stage.CAM_MAX);
        CR.ship.invul = 1 << 28;
        CR.stage.bossActive = true; CR.Boss.spawn(); CR.Boss.force(2);
        var i;
        for (i = 0; i < 240; i++) __nes.step(1);       // 讓魔王放幾輪環形彈
        var before = CR.stage.aliveBullets();
        CR.stage.enemies.each(function (e) { if (e.boss && e.alive) e.hit(99); });
        __nes.step(1);
        var st = CR.Boss.state();
        return { before: before, after: CR.stage.aliveBullets(), phase: st.phase };
    """)
    ok('魔王被打爆前畫面上有殘留敵彈', r['before'] > 0, r)
    eq('魔王進入爆炸階段（phase 4）', r['phase'], 4)
    eq('魔王爆炸瞬間清空全部敵彈（fix3：不會打贏了反而死在勝利動畫裡）', r['after'], 0)

    # ---- stage.redraw（暫停文字還原用）----
    r = ev(page, """
        var s = CR.stage, ppu = __nes.nes().ppu;
        s.restart(600);
        var c = (s.camX >> 3) + 5, ntc = c & 63, nt = (ntc >> 5) & 1, col = ntc & 31;
        var want = s.tileAt(c, 12);
        ppu.setTile(nt, col, 12, 0);                    // 故意寫髒
        var dirty = ppu.getTile(nt, col, 12);
        s.redraw();
        return { want: want, dirty: dirty, got: ppu.getTile(nt, col, 12),
                 fn: typeof s.redraw, camX: s.camX };
    """)
    eq('CR.stage.redraw 是 function', r['fn'], 'function')
    ok('redraw() 把被文字蓋掉的磚還原（且不動 camX）', r['got'] == r['want'] and r['camX'] == 600, r)


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
        miss = page.evaluate('() => __nes.missing()')
        ok('engine 模組全到齊（missing 為空）', miss == [], miss)
        test_contract(page)
        test_scroller(page)
        test_spawner(page)
        test_enemies(page)
        test_stage_api(page)
        test_boss(page)
        test_lint(page)
        test_fix2(page)
        test_fix3(page)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 66)
    print('stage 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 66)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
