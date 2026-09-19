#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/test_touch.py — engine/touch.js（NES.Touch）與三個入口頁手機版面的自動測試
（agent: nes-touch, R2）

用法：
    ../卡比之星/.venv/bin/python tools/test_touch.py [--only cruiser] [--headed]

作法：Playwright 以「真的手機裝置描述」（觸控 / 手機 UA / DPR）開 game.html / star.html /
cruiser.html，用 CDP Input.dispatchTouchEvent 打真的觸控事件，再用 __nes.step() 推幀。

涵蓋（三頁 × iPhone 13 橫向 / Pixel 5 直向 = 6 組；另加桌機 1280×800 三頁）：
  版面：覆蓋層自動顯示、七顆按鍵齊全（fix5 多了 ★密技）、按鍵矩形不與畫面交集、不出界、overlapping=false、
        backing store 整數、CSS 尺寸 = 256×顯示倍率、手機是小數倍、
        直向畫面貼上方 / 橫向兩側各留 ≥110px（平板 170px）
  輸入：START 進遊戲、搖桿推右 30 幀 held(RIGHT) 且主角 x 增加、放開後方向歸零、
        A 按下 pressed(A)、右 + A 同時、全放開後 mask 0
  自動顯示：鍵盤輸入後淡出、再觸控又出現
  密技鍵（fix5）：矩形存在 / 與其他按鍵零重疊 / 位置（直向在 START 旁、橫向在 START 下方）、
        按下派發 window 的 `nes-cheat`、不進 NES 八鍵遮罩、閃一下（nt-flash）、300ms 防連按、
        `NES.Touch.cheat()` 程式觸發、`layout.cheatButton = false` 可整顆關掉
  桌機：不顯示觸控層、scale 整數 3、backing store 768×672、CSS 尺寸整數、cheat() 仍可派發事件
"""
import argparse
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['game.html', 'star.html', 'cruiser.html']
# (裝置, 是否橫向, 標籤)
DEVS = [('iPhone 13', True, 'iPhone13橫'), ('Pixel 5', False, 'Pixel5直')]
KEYS = ('dpad', 'a', 'b', 'select', 'start', 'cheat', 'fs')      # fix5：第 7 顆 ★密技

READ_JS = """() => {
  const L = window.NES_LAYOUT, c = document.getElementById('nes');
  return {
    L: L, R: NES.Touch.rects(), active: NES.Touch.active(),
    overlapping: !!NES.Touch.overlapping,
    vw: window.innerWidth, vh: window.innerHeight,
    cw: c.width, ch: c.height,
    cssW: parseFloat(c.style.width), cssH: parseFloat(c.style.height),
    cssX: parseFloat(c.style.left), cssY: parseFloat(c.style.top),
    nesScale: NES.instance.scale
  };
}"""


class Touch:
    """多點觸控（CDP）：維持目前按住的點，每次變動把全部點一起送出"""

    def __init__(self, cdp):
        self.cdp = cdp
        self.pts = {}

    def _send(self, typ, changed):
        pts = [{'x': x, 'y': y, 'id': i} for i, (x, y) in self.pts.items()]
        if typ == 'touchEnd':
            pts = [p for p in pts if p['id'] != changed]
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})

    def down(self, i, x, y):
        self.pts[i] = (x, y)
        self._send('touchStart', i)

    def move(self, i, x, y):
        if i in self.pts:
            self.pts[i] = (x, y)
            self._send('touchMove', i)

    def up(self, i):
        if i in self.pts:
            self._send('touchEnd', i)
            del self.pts[i]

    def clear(self):
        for i in list(self.pts.keys()):
            self.up(i)


def inter(a, b):
    """兩個矩形（x,y,w,h）是否重疊（>0.5px 才算，避免浮點邊界誤判）"""
    return (a['x'] + a['w'] > b['x'] + 0.5 and a['x'] < b['x'] + b['w'] - 0.5 and
            a['y'] + a['h'] > b['y'] + 0.5 and a['y'] < b['y'] + b['h'] - 0.5)


def run_mobile(p, page_name, device, landscape, label, results):
    def ok(name, cond, detail=''):
        results.append({'name': '%s/%s %s' % (page_name, label, name), 'ok': bool(cond), 'detail': str(detail)})

    dev_name = device + (' landscape' if landscape and (device + ' landscape') in p.devices else '')
    dev = dict(p.devices[dev_name])
    if landscape and dev_name == device:
        vp = dev['viewport']
        dev['viewport'] = {'width': vp['height'], 'height': vp['width']}

    b = p.chromium.launch()
    errors = []
    try:
        ctx = b.new_context(**dev)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and
              'Failed to load resource' not in m.text else None)
        url = (ROOT / page_name).resolve().as_uri() + '?debug=1&mute=1'
        pg.goto(url)
        pg.wait_for_function('()=>window.__nes && window.NES_LAYOUT && NES.Touch', timeout=20000)
        pg.evaluate('()=>__nes.step(2)')
        d = pg.evaluate(READ_JS)
        L, R = d['L'], d['R']
        screen = {'x': L['x'], 'y': L['y'], 'w': L['w'], 'h': L['h']}

        # ---------------------------------------------------------- ① 版面
        ok('觸控裝置自動顯示覆蓋層', d['active'])
        ok('七顆按鍵齊全（搖桿/A/B/SELECT/START/★密技/全螢幕）',
           all(k in R for k in KEYS), '有 ' + ','.join(sorted(R.keys())))
        bad = [k for k in R if inter(R[k], screen)]
        ok('按鍵矩形不與畫面交集', not bad,
           '重疊: %s ｜ 畫面 %s' % (bad, [round(v, 1) for v in (L['x'], L['y'], L['w'], L['h'])]))
        oob = [k for k in R if R[k]['x'] < -0.5 or R[k]['y'] < -0.5 or
               R[k]['x'] + R[k]['w'] > d['vw'] + 0.5 or R[k]['y'] + R[k]['h'] > d['vh'] + 0.5]
        ok('按鍵矩形不出界', not oob, '出界: %s ｜ viewport %dx%d' % (oob, d['vw'], d['vh']))
        ok('NES.Touch.overlapping = false（沒有半透明壓畫面）', not d['overlapping'])
        back = L['back']
        ok('backing store 倍率是整數', float(back).is_integer(), 'back=%s' % back)
        ok('canvas backing store = 256×back / 224×back',
           d['cw'] == 256 * back and d['ch'] == 224 * back, '%dx%d back=%s' % (d['cw'], d['ch'], back))
        ok('nes.scale 與 backing 倍率一致（setScale 只收整數）', d['nesScale'] == back,
           'nes.scale=%s back=%s' % (d['nesScale'], back))
        ok('CSS 尺寸 = 256×顯示倍率（±0.5px）',
           abs(d['cssW'] - 256 * L['scale']) <= 0.5 and abs(d['cssH'] - 224 * L['scale']) <= 0.5,
           'css %sx%s scale=%.4f' % (d['cssW'], d['cssH'], L['scale']))
        ok('CSS 尺寸與 NES_LAYOUT 一致', d['cssW'] == L['w'] and d['cssH'] == L['h'],
           'css %sx%s layout %sx%s' % (d['cssW'], d['cssH'], L['w'], L['h']))
        ok('手機允許小數倍（顯示倍率不是整數）', not float(L['scale']).is_integer(), 'scale=%.4f' % L['scale'])
        ok('NES_LAYOUT.mobile = true', L['mobile'] is True)
        if L['portrait']:
            ok('直向：寬度填滿', abs(L['w'] - d['vw']) <= 1, 'w=%s vw=%s' % (L['w'], d['vw']))
            ok('直向：畫面貼上方（y = safe.top）', abs(L['y'] - L['safe']['t']) <= 0.5, 'y=%s' % L['y'])
        else:
            need = 170 if min(d['vw'], d['vh']) >= 500 else 110
            gl, gr = L['x'], d['vw'] - (L['x'] + L['w'])
            ok('橫向：高度填滿', abs(L['h'] - d['vh']) <= 1, 'h=%s vh=%s' % (L['h'], d['vh']))
            ok('橫向：兩側各留 ≥ %dpx 給按鍵' % need, gl >= need - 0.5 and gr >= need - 0.5,
               '左 %.1f 右 %.1f' % (gl, gr))

        # ---------------------------------------------------------- ② 輸入
        cdp = ctx.new_cdp_session(pg)
        t = Touch(cdp)
        st = R['start']
        t.down(0, st['cx'], st['cy'])
        pg.evaluate('()=>__nes.step(3)')
        t.up(0)
        pg.evaluate('()=>__nes.step(12)')
        mode = pg.evaluate('()=>__nes.state().mode')
        ok('觸控 START → 進入遊戲（mode=play）', mode == 'play', 'mode=%s' % mode)

        x0 = pg.evaluate('()=>__nes.state().x')
        pad = R['dpad']
        t.down(0, pad['cx'] + pad['w'] * 0.36, pad['cy'])
        pg.evaluate('()=>__nes.step(30)')
        res = pg.evaluate("""()=>({held: NES.Input.held(NES.Input.BTN.RIGHT),
                                   tm: NES.Touch.mask(), sec: NES.Touch.sector(),
                                   dirs: NES.Touch.dirs(), x: __nes.state().x,
                                   mask: NES.Input.maskToString()})""")
        ok('搖桿推右 30 幀：NES.Input.held(RIGHT) = true', res['held'], 'mask=%s' % res['mask'])
        ok('搖桿推右：扇區 0（正右）且 dirs.right', res['sec'] == 0 and res['dirs']['right'],
           'sector=%s dirs=%s' % (res['sec'], res['dirs']))
        ok('搖桿推右 30 幀：主角 x 增加', res['x'] > x0, 'x %s → %s' % (x0, res['x']))
        t.up(0)
        pg.evaluate('()=>__nes.step(2)')
        rel = pg.evaluate('()=>({tm: NES.Touch.mask(), im: NES.Input.mask()})')
        ok('放開搖桿：Touch.mask() 與 Input.mask() 都歸零',
           rel['tm'] == 0 and rel['im'] == 0, 'touch=%s input=%s' % (rel['tm'], rel['im']))

        ba = R['a']
        t.down(0, ba['cx'], ba['cy'])
        pg.evaluate('()=>__nes.step(1)')
        pa = pg.evaluate("""()=>({pressed: NES.Input.pressed(NES.Input.BTN.A),
                                  held: NES.Input.held(NES.Input.BTN.A)})""")
        ok('A 按下：pressed(A) = true（邊緣）', pa['pressed'], str(pa))
        pg.evaluate('()=>__nes.step(2)')
        ok('A 持續按住：held(A) = true',
           pg.evaluate('()=>NES.Input.held(NES.Input.BTN.A)'))

        t.down(1, pad['cx'] + pad['w'] * 0.36, pad['cy'])
        pg.evaluate('()=>__nes.step(3)')
        both = pg.evaluate("""()=>({m: NES.Input.mask(), s: NES.Input.maskToString(),
                                    tm: NES.Touch.mask()})""")
        want = 1 | 128       # A | RIGHT
        ok('右 + A 同時：Input.mask() 同時含 A 與 RIGHT',
           (both['m'] & want) == want, 'mask=%s' % both['s'])
        ok('右 + A 同時：Touch.mask() 與 Input.mask() 一致',
           both['tm'] == both['m'], 'touch=%s input=%s' % (both['tm'], both['m']))
        t.clear()
        pg.evaluate('()=>__nes.step(2)')
        z = pg.evaluate('()=>({tm: NES.Touch.mask(), im: NES.Input.mask()})')
        ok('全部放開：mask 0（inject 佇列已清、鍵盤取回控制權）',
           z['tm'] == 0 and z['im'] == 0, 'touch=%s input=%s' % (z['tm'], z['im']))

        # ------------------------------------------------- ④ fix5：一鍵密技鍵
        pg.evaluate("""() => {
          window.__cheatN = 0; window.__cheatSrc = [];
          window.addEventListener('nes-cheat', function (e) {
            window.__cheatN++; window.__cheatSrc.push((e.detail && e.detail.source) || '');
          });
        }""")
        R2 = pg.evaluate('()=>NES.Touch.rects()')
        ch = R2.get('cheat')
        ok('★密技鍵有矩形且尺寸 > 0', bool(ch) and ch['w'] > 10 and ch['h'] > 10, ch)
        if ch:
            hits = [k for k in R2 if k != 'cheat' and inter(R2[k], ch)]
            ok('★密技鍵與其他按鍵零重疊', not hits, '壓到: %s' % hits)
            ok('★密技鍵不與畫面交集', not inter(ch, screen),
               'cheat %s ｜ 畫面 %s' % ([round(ch[v], 1) for v in 'xywh'],
                                        [round(v, 1) for v in (L['x'], L['y'], L['w'], L['h'])]))
            sta = R2['start']
            if L['portrait']:
                ok('直向：★密技鍵與 START 同一列、排在 START 旁邊',
                   abs(ch['cy'] - sta['cy']) <= 2 and ch['x'] >= sta['x'] + sta['w'] - 0.5,
                   'cheat cx=%.1f cy=%.1f ｜ start cx=%.1f cy=%.1f' % (ch['cx'], ch['cy'], sta['cx'], sta['cy']))
            else:
                ok('橫向：★密技鍵接在 SELECT / START 下方（同一欄）',
                   abs(ch['cx'] - sta['cx']) <= 2 and ch['y'] >= sta['y'] + sta['h'] - 0.5,
                   'cheat cx=%.1f y=%.1f ｜ start cx=%.1f y=%.1f' % (ch['cx'], ch['y'], sta['cx'], sta['y']))

            t.clear()
            pg.evaluate('()=>__nes.step(1)')
            t.down(0, ch['cx'], ch['cy'])
            flash = pg.evaluate("""()=>({flash: NES.Touch.buttons.cheat.className.indexOf('nt-flash') >= 0,
                                          n: window.__cheatN, src: window.__cheatSrc.slice(),
                                          im: NES.Input.mask(), tm: NES.Touch.mask()})""")
            ok('按下 ★密技 立刻派發 window 的 nes-cheat（pointerdown 邊緣）',
               flash['n'] == 1 and flash['src'][:1] == ['touch'], flash)
            ok('按下 ★密技 會閃一下（nt-flash）', flash['flash'], flash['flash'])
            ok('★密技不是 NES 八鍵：Input.mask() / Touch.mask() 都是 0',
               flash['im'] == 0 and flash['tm'] == 0, (flash['im'], flash['tm']))
            t.up(0)
            t.down(1, ch['cx'], ch['cy'])
            t.up(1)
            ok('300ms 內連按只算一次（防連按）', pg.evaluate('()=>window.__cheatN') == 1,
               pg.evaluate('()=>window.__cheatN'))
            pg.wait_for_timeout(340)
            t.down(0, ch['cx'], ch['cy'])
            t.up(0)
            ok('過了 300ms 再按又會發動（不限次數）', pg.evaluate('()=>window.__cheatN') == 2,
               pg.evaluate('()=>window.__cheatN'))
            pg.wait_for_timeout(340)
            api = pg.evaluate('()=>({r: NES.Touch.cheat(), n: window.__cheatN, s: window.__cheatSrc.slice(-1)[0]})')
            ok('NES.Touch.cheat() 也能程式觸發（source = api）',
               api['r'] is True and api['n'] == 3 and api['s'] == 'api', api)

            off = pg.evaluate("""() => {
              NES.Touch.setLayout({ cheatButton: false });
              const R = NES.Touch.rects();
              return { keys: Object.keys(R).sort(), lay: NES.Touch.layout.cheatButton };
            }""")
            ok('layout.cheatButton = false 可整顆關掉（rects 不再有 cheat）',
               'cheat' not in off['keys'] and off['lay'] is False, off)
            back = pg.evaluate("""() => {
              NES.Touch.setLayout({ cheatButton: true });
              const R = NES.Touch.rects(), L = window.NES_LAYOUT;
              const sc = { x: L.x, y: L.y, w: L.w, h: L.h };
              const hit = (a, b) => (a.x + a.w > b.x + 0.5 && a.x < b.x + b.w - 0.5 &&
                                     a.y + a.h > b.y + 0.5 && a.y < b.y + b.h - 0.5);
              const bad = Object.keys(R).filter(k => hit(R[k], sc));
              return { has: !!R.cheat, bad: bad, over: !!NES.Touch.overlapping };
            }""")
            ok('設回 cheatButton = true：密技鍵回來且版面仍不壓畫面',
               back['has'] and not back['bad'] and not back['over'], back)
            t.clear()
            pg.evaluate('()=>__nes.step(1)')

        # ---------------------------------------------------------- ③ 自動顯示
        pg.keyboard.press('KeyZ')
        ok('鍵盤輸入後淡出（active=false）', not pg.evaluate('()=>NES.Touch.active()'))
        t.down(0, L['x'] + L['w'] / 2, L['y'] + L['h'] / 2)
        t.up(0)
        ok('再次觸控後又出現（active=true）', pg.evaluate('()=>NES.Touch.active()'))

        ok('頁面無 JS 例外', not errors, ' | '.join(errors[:3]))
    finally:
        b.close()


def run_desktop(p, page_name, results):
    def ok(name, cond, detail=''):
        results.append({'name': '%s/桌機1280x800 %s' % (page_name, name), 'ok': bool(cond), 'detail': str(detail)})

    b = p.chromium.launch()
    try:
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto((ROOT / page_name).resolve().as_uri() + '?debug=1&mute=1')
        pg.wait_for_function('()=>window.__nes && window.NES_LAYOUT && NES.Touch', timeout=20000)
        pg.evaluate('()=>__nes.step(2)')
        d = pg.evaluate(READ_JS)
        L = d['L']
        ok('桌機不顯示觸控按鍵', not d['active'])
        ok('桌機維持整數倍 scale = 3', L['scale'] == 3 and L['back'] == 3,
           'scale=%s back=%s' % (L['scale'], L['back']))
        ok('桌機 backing store = 768×672', d['cw'] == 768 and d['ch'] == 672, '%dx%d' % (d['cw'], d['ch']))
        ok('桌機 CSS 尺寸 = 768×672 且置中',
           d['cssW'] == 768 and d['cssH'] == 672 and d['cssX'] == 256 and d['cssY'] == 64,
           'css %sx%s @(%s,%s)' % (d['cssW'], d['cssH'], d['cssX'], d['cssY']))
        ok('桌機 NES_LAYOUT.mobile = false', L['mobile'] is False)
        dc = pg.evaluate("""() => {
          window.__cheatN = 0;
          window.addEventListener('nes-cheat', function () { window.__cheatN++; });
          const r = NES.Touch.cheat();
          return { r: r, n: window.__cheatN, active: NES.Touch.active() };
        }""")
        ok('桌機：覆蓋層雖然隱藏，NES.Touch.cheat() 仍能派發 nes-cheat',
           dc['r'] is True and dc['n'] == 1 and dc['active'] is False, dc)
        ok('桌機頁面無 JS 例外', not errors, ' | '.join(errors[:3]))
    finally:
        b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='只跑某一頁（game / star / cruiser）')
    a = ap.parse_args()
    pages = [p for p in PAGES if (not a.only or a.only in p)]

    results = []
    with sync_playwright() as p:
        for page_name in pages:
            for dev, land, label in DEVS:
                run_mobile(p, page_name, dev, land, label, results)
            run_desktop(p, page_name, results)

    passed = sum(1 for r in results if r['ok'])
    failed = [r for r in results if not r['ok']]
    for r in results:
        line = '  [%s] %s' % ('PASS' if r['ok'] else 'FAIL', r['name'])
        if r['detail']:
            line += '   — ' + r['detail']
        print(line)
    print('')
    print('總計 %d / %d 通過' % (passed, len(results)))
    if failed:
        print('失敗：')
        for r in failed:
            print('  - %s %s' % (r['name'], r['detail']))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
