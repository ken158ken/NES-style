# -*- coding: utf-8 -*-
"""《星塵賽車》（cart1 槽 6，id=racing）自動驗證。

Playwright(Chromium) 開 `cart1.html?debug=1&scale=1&mute=1&game=racing[&track=N][&bot=1]`，
用 __nes 除錯 API 推進、用 CT.Racing.dev 鉤子佈置情境；engine / registry 一行未改。
期望值來源：
  [brief] docs/R5_BRIEF.md §3（≥ 3 條賽道、對手、名次、氮氣、goal = 三條都前 3）、§1-2 硬限制
  [設計] games/cart1/racing/main.js 檔頭（俯視捲軸、每線 ≤ 4 台車、每幀最多 48 byte 串流）
用法：../卡比之星/.venv/bin/python games/cart1/test_racing.py [-v]
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart1.html').as_uri() + '?debug=1&scale=1&mute=1&game=racing'
VERBOSE = '-v' in sys.argv
results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, q=''):
    page.goto(BASE + q)
    page.wait_for_function('() => !!window.__nes && !!(window.CT && CT.Racing && CT.Racing.dev)')
    page.evaluate('() => { try { localStorage.clear(); } catch (e) {} __nes.step(1); }')


def S(page):
    return page.evaluate('() => window.GAME.state().s')


RUN_JS = """(n) => {
  let peak = 0, over0 = __nes.stats().budget.overFrames, bpeak = 0;
  for (let i = 0; i < n; i++) {
    __nes.step(1);
    const st = __nes.stats();
    if (st.maxSpritesLine > peak) peak = st.maxSpritesLine;
    if (st.budget.peak > bpeak) bpeak = st.budget.peak;
  }
  return { peak, over: __nes.stats().budget.overFrames - over0, bpeak };
}"""


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'warning' and '失敗' in m.text else None)

        # ---------- 1. 註冊契約 ----------
        fresh(page)
        reg = page.evaluate("""() => { const g = CT.get('racing'); return g && {
            order: g.order, title: g.title, legacy: g.legacy,
            fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function') }; }""")
        ok('CT.register 契約：id racing / order 6 / 九個函式齊全', reg and reg['order'] == 6 and len(reg['fns']) == 9, reg)
        ok('bestText ≤ 8 字元', len(page.evaluate("() => CT.get('racing').bestText()")) <= 8)
        s = S(page)
        ok('開場 = 自己的標題畫面', s['mode'] == 'title', s['mode'])
        lint = page.evaluate('() => (__nes.step(20), __nes.render(), __nes.lint())')
        ok('標題畫面 lint 綠（≤ 25 色、0 違規）', lint['ok'] and lint['colors'] <= 25, lint.get('colors'))
        ok('標題播標題曲', S(page)['music'] == 'title')

        # ---------- 2. 賽道資料 ----------
        TR = page.evaluate("""() => CT.Racing.TRACKS.map(t => { const b = CT.Racing.buildTrack(t);
            let edge = 0, minL = 99, maxR = 0, minW = 99;
            for (let k = 0; k < b.N; k++) { const n = (k + 1) % b.N;
              edge = Math.max(edge, Math.abs(b.L[n] - b.L[k]), Math.abs(b.R[n] - b.R[k]));
              minL = Math.min(minL, b.L[k]); maxR = Math.max(maxR, b.R[k]); minW = Math.min(minW, b.R[k] - b.L[k] + 1); }
            const inRoad = b.items.every(it => it.col >= b.L[it.row] + 2 && it.col + it.w - 1 <= b.R[it.row] - 2);
            const types = {}; b.items.forEach(it => types[it.type] = (types[it.type] || 0) + 1);
            return { id: t.id, N: b.N, laps: t.laps, edge, minL, maxR, minW, inRoad, types, rivals: t.rivals.length }; })""")
        ok('≥ 3 條原創賽道、每條 3 圈', len(TR) >= 3 and all(t['laps'] == 3 for t in TR), [t['id'] for t in TR])
        ok('每圈 ≥ 400 列（≥ 3200 px）', all(t['N'] >= 400 for t in TR), [t['N'] for t in TR])
        ok('路緣每列最多移 1 欄（含一圈頭尾接縫）', all(t['edge'] <= 1 for t in TR), [t['edge'] for t in TR])
        ok('路面在畫面內（路肩不出 2..29 欄）、最窄 ≥ 10 欄', all(t['minL'] >= 3 and t['maxR'] <= 28 and t['minW'] >= 10 for t in TR),
           [(t['minL'], t['maxR'], t['minW']) for t in TR])
        ok('道具都在路面內且離路肩 ≥ 2 欄（屬性區塊不互染）', all(t['inRoad'] for t in TR))
        ok('每條都有氮氣罐 / 加速板 / 障礙（角錐或落石）/ 油漬', all(t['types'].get('nitro') and t['types'].get('boost')
           and (t['types'].get('cone') or t['types'].get('rock')) and t['types'].get('oil') for t in TR), [t['types'] for t in TR])
        ok('每條 5 台對手車、對手極速逐條提高', all(t['rivals'] == 5 for t in TR) and page.evaluate(
            "() => { const T = CT.Racing.TRACKS; return T[0].rivals[4] < T[1].rivals[4] && T[1].rivals[4] < T[2].rivals[4]; }"))

        # ---------- 3. 比賽：倒數 / 油門 / 路外 ----------
        fresh(page, '&track=1')
        s = S(page)
        ok('?track=1 直接開比賽、倒數階段', s['mode'] == 'race' and s['phase'] == 'count', (s['mode'], s['phase']))
        d0 = s['d']
        page.evaluate('() => __nes.press(["a"], 100)')
        s = S(page)
        ok('倒數 3 秒內車不會動', s['d'] == d0 and s['phase'] == 'count', (d0, s['d']))
        page.evaluate('() => __nes.press(["a"], 80)')
        ok('倒數 180 幀後 GO、播比賽曲', S(page)['phase'] == 'run' and S(page)['music'] == 'race')
        page.evaluate('() => __nes.press(["a"], 150)')
        s = S(page)
        ok('按住 A 約 2.5 秒到極速 896（3.5 px/幀）', s['s'] == 896, s['s'])
        sp = page.evaluate("""() => { const g = CT.Racing.dev.g(); g.player.x = 8 * 256 * 2 + 4 * 256; __nes.press(['a'], 60); return g.player.s; }""")
        ok('開到草地極速降到 ≤ 400', sp <= 400, sp)
        sc = page.evaluate("() => ({ y: __nes.nes().ppu._split && __nes.nes().ppu._split.line, nt: __nes.nes().ppu._split && __nes.nes().ppu._split.nt })")
        ok('HUD 分割：split(208) 切到名稱表 1', sc['y'] == 208 and sc['nt'] == 1, sc)
        hud = page.evaluate("""() => { const p = __nes.nes().ppu, a = CT.Racing.Art.text('LAP', true);
            return [p._nt[1][27 * 32 + 1], p._nt[1][27 * 32 + 2], p._nt[1][27 * 32 + 3]].join() === a.join(); }""")
        ok('HUD 第 27 列寫著 LAP（名稱表 1）', hud)

        # ---------- 4. 氮氣 / 道具 ----------
        nb = page.evaluate("""() => { const g = CT.Racing.dev.g(); g.player.x = 128 * 256; g.player.vx = 0;
            const n0 = g.nitro; __nes.press(['a'], 30); __nes.press(['a','b'], 1); __nes.press(['a'], 40);
            return { n0, n1: g.nitro, boost: g.player.boost, s: g.player.s }; }""")
        ok('B = 氮氣：數量 -1、加速中速度 > 896', nb['n1'] == nb['n0'] - 1 and nb['s'] > 896 and nb['boost'] > 0, nb)
        it = page.evaluate("""(kind) => { const g = CT.Racing.dev.g(), b = g.tb;
            const out = {};
            for (const k of ['oil', 'cone', 'nitro', 'boost']) {
              const item = b.items.find(i => i.type === k);
              const lap = Math.floor((g.player.d >> 8) / b.lapPx) + 1;
              CT.Racing.dev.warp((lap * b.lapPx) + item.row * 8 + 4 - 14);
              g.player.x = (item.col * 8 + 4) * 256; g.player.vx = 0; g.player.spin = 0; g.player.crash = 0; g.player.boost = 0;
              g.player.s = 600; g.player.hitCool = 0;
              const n0 = g.nitro, s0 = g.player.s;
              __nes.press(['a'], 6);
              out[k] = { spin: g.player.spin, crash: g.player.crash, s: g.player.s, s0, nitro: g.nitro - n0, boost: g.player.boost };
            }
            return out; }""")
        ok('油漬 → 打滑旋轉', it['oil']['spin'] > 0, it['oil'])
        ok('角錐 → 撞到減速（速度 ≤ 1/3 + 停頓）', it['cone']['crash'] > 0 and it['cone']['s'] < 400, it['cone'])
        ok('氮氣罐 → 氮氣 +1', it['nitro']['nitro'] == 1, it['nitro'])
        ok('加速板 → 衝刺（速度 ≥ 1100）', it['boost']['boost'] > 0 and it['boost']['s'] >= 1000, it['boost'])

        # ---------- 5. 每線 ≤ 4 台車（= 8 顆精靈） ----------
        bd = page.evaluate("""() => { const g = CT.Racing.dev.g(); const p = g.player;
            g.cars.forEach((c, i) => { c.d = p.d + (i ? 6 * 256 : 0); c.x = (60 + i * 26) * 256; c.s = p.s; c.spin = 0; });
            const before = g.bandPushes; __nes.step(1); __nes.render();
            return { pushes: g.bandPushes - before, line: __nes.stats().maxSpritesLine, cars: g.maxBandCars }; }""")
        ok('6 台車硬擠同一條線：第 5 台起被擋在後面、PPU 每線 ≤ 8', bd['pushes'] > 0 and bd['line'] <= 8 and bd['cars'] <= 4, bd)

        # ---------- 6. 暫停 ----------
        pz = page.evaluate("""() => { const g = CT.Racing.dev.g(); __nes.tap('start', 1); __nes.step(1); const t0 = g.raceT, d0 = g.player.d;
            __nes.step(30); const t1 = g.raceT, d1 = g.player.d; __nes.tap('start', 1); __nes.step(5);
            return { paused: t0 === t1 && d0 === d1, resumed: g.raceT > t1 }; }""")
        ok('START 暫停：時間與位置凍結、再按恢復', pz['paused'] and pz['resumed'], pz)

        # ---------- 7. 預算（整場正常駕駛 600 幀） ----------
        r = page.evaluate(RUN_JS, 600)
        s = S(page)
        ok('比賽中 VBlank 0 超支、單幀尖峰 ≤ 160', r['over'] == 0 and r['bpeak'] <= 160, r)
        ok('賽道串流每幀 ≤ 48 byte（32 磚 + 16 屬性）', s['maxRowBytes'] <= 48, s['maxRowBytes'])
        lint = page.evaluate('() => (__nes.render(), __nes.lint())')
        ok('比賽畫面 lint 綠（≤ 25 色）', lint['ok'] and lint['colors'] <= 25, lint.get('colors'))

        # ---------- 8. 流程：名次 / 接關 / GAME OVER / 冠軍 ----------
        fresh(page, '&track=1')
        fl = page.evaluate("""() => { const D = CT.Racing.dev, st = () => window.GAME.state().s;
            const out = [];
            D.finishNow(5); out.push(st().mode); __nes.step(40); __nes.tap('a', 1); __nes.step(2);
            out.push([st().mode, st().continues, st().points]);
            return out; }""")
        ok('第 5 名 → 結果畫面 → 用接關重跑同一條（接關 3 → 2、點數不計）', fl[0] == 'result' and fl[1][0] == 'intro'
           and fl[1][1] == 2 and fl[1][2] == 0, fl)
        fl2 = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(), st = () => window.GAME.state().s;
            g.continues = 0; D.enter('race'); D.finishNow(6); __nes.step(40); __nes.tap('a', 1); __nes.step(2);
            const m = st().mode; __nes.step(70); __nes.tap('start', 1); __nes.step(2); return [m, st().mode]; }""")
        ok('沒接關 → GAME OVER → START 回標題', fl2 == ['over', 'title'], fl2)
        ch = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(), st = () => window.GAME.state();
            g.ti = 0; g.points = 0; const out = [];
            for (let t = 0; t < 3; t++) { g.ti = t; D.enter('race'); D.finishNow(t + 1); __nes.step(40); __nes.tap('a', 1); __nes.step(2); out.push(st().s.mode); }
            return { modes: out, goal: st().goal, best: CT.load('racing', 'best', 0), pts: st().s.points }; }""")
        ok('三條都前 3 → 大獎賽冠軍畫面、goal() = true', ch['modes'] == ['intro', 'intro', 'champ'] and ch['goal'], ch)
        ok('最高分（點數）存檔 CT.save("racing","best")', ch['best'] == 9 + 6 + 4 == ch['pts'], ch)

        # ---------- 9. 密技 / 音效 ----------
        fresh(page, '&track=1')
        page.evaluate("() => __nes.press(['a'], 200)")
        ct = page.evaluate("""() => { const r = CT.cheat(); const g = CT.Racing.dev.g(); return { r, nitro: g.nitro, boost: g.player.boost, cheats: g.cheats }; }""")
        ok('一鍵密技（比賽中）：氮氣 9 + 超級加速、記一次密技', ct['r'] and ct['nitro'] == 9 and ct['boost'] > 100 and ct['cheats'] == 1, ct)

        # ---------- 9b. fix-r5：密技原地續關 / 標題無效 / goal 檢查（brief §6-1、qa-r5 P2-1 / P3-7） ----------
        fresh(page)
        tc = page.evaluate("""() => { const g = CT.Racing.dev.g(); const r1 = CT.cheat();
            __nes.step(15); __nes.tap('start', 1); __nes.step(2); const m = g.mode; const r2 = CT.cheat();
            return { r1, r2, m, cheats: g.cheats, nitro: g.nitro }; }""")
        ok('標題 / 說明畫面按密技無效（回 false、不累計）', tc['r1'] is False and tc['r2'] is False and tc['m'] == 'howto'
           and tc['cheats'] == 0, tc)
        fresh(page, '&track=2')
        rt = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(); g.points = 13; g.continues = 1;
            D.finishNow(5); const pts1 = g.points; const r = CT.cheat();
            return { r, pts1, mode: g.mode, phase: g.phase, ti: g.ti, pts: g.points, cont: g.continues, cheats: g.cheats }; }""")
        ok('第 5 名結果畫面按密技 → 立刻重跑同一條（倒數）、之前積分保留 / 這場不計、接關補回 3', rt['r'] and rt['mode'] == 'race'
           and rt['phase'] == 'count' and rt['ti'] == 1 and rt['pts1'] == 15 and rt['pts'] == 13 and rt['cont'] == 3, rt)
        ro = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(); g.continues = 0; D.finishNow(6); __nes.step(40); __nes.tap('a', 1); __nes.step(2);
            const m0 = g.mode; const r = CT.cheat(); return { m0, r, mode: g.mode, ti: g.ti, pts: g.points, cont: g.continues }; }""")
        ok('GAME OVER 畫面按密技 → 同一條賽道重跑、積分保留、接關 3', ro['m0'] == 'over' and ro['r'] and ro['mode'] == 'race'
           and ro['ti'] == 1 and ro['pts'] == 13 and ro['cont'] == 3, ro)
        rq = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(); D.finishNow(2); const r = CT.cheat(); return { r, mode: g.mode }; }""")
        ok('前 3 名的結果畫面按密技無效（不是失敗結算）', rq['r'] is False and rq['mode'] == 'result', rq)
        cg = page.evaluate("""() => { const D = CT.Racing.dev, g = D.g(), st = () => window.GAME.state();
            for (let t = 0; t < 3; t++) { g.ti = t; D.enter('race'); D.finishNow(1); __nes.step(40); __nes.tap('a', 1); __nes.step(2); }
            const a = { mode: st().s.mode, goal: st().goal, cheats: g.cheats };
            __nes.step(70); __nes.tap('start', 1); __nes.step(15); __nes.tap('start', 1); __nes.step(2);
            a.after = [st().s.mode, g.cheats]; return a; }""")
        ok('用過密技的大獎賽拿冠軍 → goal() = false；回標題重開一局密技歸零', cg['mode'] == 'champ' and cg['goal'] is False
           and cg['cheats'] >= 2 and cg['after'] == ['howto', 0], cg)

        # ---------- 9c. fix-r5：暫停靜音 / exit 存分 / backTile / 說明頁 ----------
        fresh(page, '&track=1')
        pm = page.evaluate("""() => { const g = CT.Racing.dev.g(); __nes.press(['a'], 200); const m0 = g.mode && window.GAME.state().s.music;
            __nes.tap('start', 1); __nes.step(2); const m1 = window.GAME.state().s.music; const r0 = __nes.nes().music.state ? (st => st.playing + ':' + st.rowsPlayed)(__nes.nes().music.state()) : '';
            __nes.step(60); const r1 = __nes.nes().music.state ? (st => st.playing + ':' + st.rowsPlayed)(__nes.nes().music.state()) : '';
            __nes.tap('start', 1); __nes.step(2); return { m0, m1, m2: window.GAME.state().s.music, still: r0 === r1 }; }""")
        ok('START 暫停 = BGM 停（driver 不前進）、解除暫停接續比賽曲', pm['m0'] == 'race' and pm['m1'] is None and pm['still']
           and pm['m2'] == 'race', pm)
        ex = page.evaluate("""() => { const g = CT.Racing.dev.g(); g.points = 17; CT.back(); return CT.load('racing', 'best', 0); }""")
        ok('中途按住 START+SELECT 離開（exit）也存最高分', ex == 17, ex)
        fresh(page)
        bt = page.evaluate("""() => { const G = CT.get('racing'), b = G.backTile, A = CT.Racing.Art;
            return { b, odd: (b.tile & 1) === 1, isBack: b.tile === A.spr('BACK'),
                     notCar: ['CAR_UP_L','CAR_UP_R','CAR_RT_L','CAR_RT_R','FLAG','NONE'].every(n => A.spr(n) !== b.tile) }; }""")
        ok('backTile：8×16 圖樣表 1 的專用星鑽（不是半台車）、pal 0', bt['odd'] and bt['isBack'] and bt['notCar']
           and bt['b']['pal'] == 0, bt)
        ht = page.evaluate("""() => { __nes.step(15); __nes.tap('start', 1); __nes.step(2); const p = __nes.nes().ppu, A = CT.Racing.Art;
            const row = r => p._nt[0].slice(r * 32, r * 32 + 32).join();
            const has = (r, s) => row(r).indexOf(A.text(s).join()) >= 0;
            const blank = r => p._nt[0].slice(r * 32 + 3, r * 32 + 29).every(t => t === A.bg('SP'));
            return { menu: has(14, 'HOLD START+SELECT: MENU'), cheat: has(12, 'C/$'),
                     gaps: [7, 9, 11, 13, 15].every(blank) }; }""")
        ok('說明頁：HOLD START+SELECT: MENU、C/★ CHEAT，操作行之間各空一列', ht['menu'] and ht['cheat'] and ht['gaps'], ht)
        au = page.evaluate("""() => ({ songs: Object.keys(CT.Racing.Audio.SONGS), sfx: Object.keys(CT.Racing.Audio.SFX),
            rows: CT.Racing.Audio.SONGS.race.order.length })""")
        ok('≥ 1 首原創 BGM（4 首：標題 / 比賽 / 勝 / 敗）、比賽曲 8 小節', len(au['songs']) >= 4 and au['rows'] == 8, au['songs'])
        ok('≥ 4 個音效、名稱全部加 racing_ 前綴', len(au['sfx']) >= 4 and all(k.startswith('racing_') for k in au['sfx']), au['sfx'])
        ok('CHR bank 名稱加前綴（racing_bg / racing_spr16）', page.evaluate(
            "() => !!(NES.CHR.getBank('racing_bg') && NES.CHR.getBank('racing_spr16'))"))
        ok('手機觸控：NES.Touch 在場', page.evaluate('() => !!(NES.Touch && NES.Touch.rects)'))

        # ---------- 10. 機器人整場大獎賽（不開密技，逐幀量） ----------
        page.goto(BASE + '&bot=1')
        page.wait_for_function('() => !!window.__nes && !!CT.Racing.dev')
        bot = page.evaluate("""(mx) => { let peak = 0;
            for (let f = 0; f < mx; f++) { __nes.step(1); const st = __nes.stats();
              if (st.maxSpritesLine > peak) peak = st.maxSpritesLine;
              const s = window.GAME.state(); if (s.goal) return { goal: true, f, peak, over: st.budget.overFrames, cheats: CT.Racing.dev.g().cheats, log: s.s.placeLog }; }
            return { goal: false, peak, over: __nes.stats().budget.overFrames, log: window.GAME.state().s.placeLog }; }""", 20000)
        ok('機器人 20000 幀內三條賽道都前 3 完賽（goal，不開密技）', bot['goal'] and bot.get('cheats') == 0, bot)
        print('  bot: frames=%s peak=%s over=%s' % (bot.get('f'), bot.get('peak'), bot.get('over')))
        ok('機器人全程逐幀：每線精靈 ≤ 8', bot['peak'] <= 8, bot['peak'])
        ok('機器人全程 overFrames == 0', bot['over'] == 0, bot['over'])

        ok('整場 0 個 JS 例外 / update·draw 失敗', not errors, errors[:3])
        br.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('=' * 64)
    print('racing 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
