# -*- coding: utf-8 -*-
"""手機模擬截圖（R2 nes-touch agent；改寫自 ../卡比之星/tools/mobile_shot.py）

以 Playwright 裝置描述（觸控 / 手機 UA / DPR）開入口頁，截整個 viewport
（含 engine/touch.js 的 DOM 虛擬按鍵），可模擬單點 / 多點觸控（CDP Input.dispatchTouchEvent）。

用法（PY=../卡比之星/.venv/bin/python）：
  $PY tools/mobile_shot.py --page cruiser.html --device "iPhone 13" --landscape --out shots/agent_nes_touch/m.png
  $PY tools/mobile_shot.py --page star.html --device "Pixel 5" --touch "tap 200 620 3; step 40" --out shots/x.png
  $PY tools/mobile_shot.py --page game.html --touch "down 0 95 570; step 30; up 0" --eval "NES.Input.maskToString()"
  $PY tools/mobile_shot.py --list                       # 列出可用裝置
  --dist        改開 dist/<對應的單檔>.html
  --url <url>   開任意網址（蓋掉 --page）
  --scale N     附加 ?scale=N（＝強制整數倍、關掉手機小數倍版面；預設不加，讓頁面自己算）
  --query "a=1" 附加網址參數     --state 印 __nes.state()     --eval "js" 截圖後 evaluate 並印出
  --rects       印 NES.Touch.rects() 與 window.NES_LAYOUT
  --run         讓遊戲自己跑（不用 debug 的 step；step n 改成等 n/60 秒）
  --console     印全部 console      --hint 保留 debug 提示列（預設截圖前隱藏）

touch 指令（座標 = CSS px，viewport 左上為原點）：
  tap <x> <y> [frames]   按下 → 前進 frames 幀（預設 4）→ 放開
  down <id> <x> <y>      第 id 指按下（多點同時：不同 id）
  move <id> <x> <y>      第 id 指移動
  up <id>                第 id 指放開
  step <n>               前進 n 幀（debug 模式）/ 等 n/60 秒（--run）
  key <name> [frames]    用 __nes.tap() 送 NES 八鍵（a b select start up down left right）
  shot <name>            途中截圖到 <out>_<name>.png
"""
import argparse
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = {'game.html': '星塵測試室.html', 'star.html': '星塵勇者.html', 'cruiser.html': '星塵巡航艦.html'}


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--page', default='cruiser.html', help='game.html / star.html / cruiser.html')
    ap.add_argument('--device', default='iPhone 13')
    ap.add_argument('--landscape', action='store_true')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--touch', default='')
    ap.add_argument('--out', default='shots/mobile.png')
    ap.add_argument('--dist', action='store_true')
    ap.add_argument('--url', default='')
    ap.add_argument('--scale', type=int, default=0)
    ap.add_argument('--query', default='')
    ap.add_argument('--eval', default='')
    ap.add_argument('--state', action='store_true')
    ap.add_argument('--rects', action='store_true')
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--console', action='store_true')
    ap.add_argument('--hint', action='store_true', help='保留 debug 提示列（預設截圖前隱藏，免得蓋到 HUD）')
    a = ap.parse_args()

    out = pathlib.Path(a.out)
    if not out.is_absolute():
        out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    logs = []

    with sync_playwright() as p:
        if a.list:
            print('\n'.join(sorted(p.devices.keys())))
            return 0
        name = a.device + (' landscape' if a.landscape and (a.device + ' landscape') in p.devices else '')
        if name not in p.devices:
            print('未知裝置：%s（--list 看清單）' % a.device, file=sys.stderr)
            return 2
        dev = dict(p.devices[name])
        if a.landscape and name == a.device:        # 沒有 landscape 描述：自己轉
            vp = dev['viewport']
            dev['viewport'] = {'width': vp['height'], 'height': vp['width']}

        b = p.chromium.launch()
        ctx = b.new_context(**dev)
        pg = ctx.new_page()
        pg.on('console', lambda m: logs.append('[%s] %s' % (m.type, m.text)))
        pg.on('pageerror', lambda e: logs.append('[pageerror] %s' % e))

        if a.url:
            url = a.url if '://' in a.url else (ROOT / a.url).resolve().as_uri()
        elif a.dist:
            url = (ROOT / 'dist' / DIST.get(a.page, '星塵測試室.html')).as_uri()
        else:
            url = (ROOT / a.page).resolve().as_uri()
        url += ('&' if '?' in url else '?') + 'debug=1&mute=1'
        if a.scale:
            url += '&scale=%d' % a.scale
        if a.query:
            url += '&' + a.query.lstrip('?&')

        pg.goto(url)
        try:
            pg.wait_for_function('()=>window.__nes && window.NES && NES.instance && window.NES_LAYOUT', timeout=15000)
        except Exception as e:
            print('頁面沒有掛上 __nes / NES_LAYOUT：', e, file=sys.stderr)
            print('\n'.join(logs), file=sys.stderr)
            b.close()
            return 2
        missing = pg.evaluate('()=>__nes.missing()')
        if missing:
            print('MISSING MODULES:', ', '.join(missing))

        cdp = ctx.new_cdp_session(pg)
        t = Touch(cdp)

        def step(n):
            if a.run:
                time.sleep(n / 60.0)
            else:
                pg.evaluate('(n)=>__nes.step(n)', n)

        def snap(path):
            if not a.hint:
                pg.evaluate("()=>{const h=document.getElementById('hint'); if(h) h.style.display='none';}")
            if not a.run:
                pg.evaluate('()=>__nes.render()')
            pg.screenshot(path=str(path))
            print('shot', path)

        step(a.steps)
        for raw in a.touch.split(';'):
            c = raw.strip().split()
            if not c:
                continue
            op = c[0]
            if op == 'tap':
                t.down(0, float(c[1]), float(c[2]))
                step(int(c[3]) if len(c) > 3 else 4)
                t.up(0)
            elif op == 'down':
                t.down(int(c[1]), float(c[2]), float(c[3]))
            elif op == 'move':
                t.move(int(c[1]), float(c[2]), float(c[3]))
            elif op == 'up':
                t.up(int(c[1]))
            elif op == 'step':
                step(int(c[1]))
            elif op == 'key':
                pg.evaluate('([k,n])=>__nes.tap(k,n)', [c[1], int(c[2]) if len(c) > 2 else 1])
            elif op == 'shot':
                snap(out.parent / ('%s_%s%s' % (out.stem, c[1], out.suffix)))
            else:
                print('unknown touch op:', op, file=sys.stderr)

        snap(out)
        print('device', name, dev['viewport'], 'dpr', dev.get('device_scale_factor'))
        if a.rects:
            print('NES_LAYOUT:', pg.evaluate('()=>window.NES_LAYOUT'))
            print('rects:', pg.evaluate('()=>NES.Touch && NES.Touch.rects()'))
            print('touch active:', pg.evaluate('()=>NES.Touch && NES.Touch.active()'),
                  'overlapping:', pg.evaluate('()=>NES.Touch && NES.Touch.overlapping'))
        if a.state:
            print('state:', pg.evaluate('()=>__nes.state()'))
        if a.eval:
            print(pg.evaluate('()=>(%s)' % a.eval))
        errs = [l for l in logs if ('error' in l.lower() or 'pageerror' in l) and 'Failed to load resource' not in l]
        if errs:
            print('PAGE ERRORS:')
            print('\n'.join(errs))
        if a.console:
            print('--- console ---')
            print('\n'.join(logs))
        b.close()
        return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
