# -*- coding: utf-8 -*-
"""
手機模擬截圖（Round 11）：以 Playwright 裝置描述（觸控 / 手機 UA / DPR）開 index.html，
截整個 viewport（含 DOM 虛擬按鍵），可模擬單點 / 多點觸控（CDP Input.dispatchTouchEvent）。
用法：
  python tools/mobile_shot.py --device "iPhone 13" --landscape --scene title --steps 60 --out shots/agent_x/m_title.png
  python tools/mobile_shot.py --device "Pixel 5" --scene game --level w1 --touch "tap 700 300 4; step 30" --out shots/agent_x/m_tap.png
  python tools/mobile_shot.py --device "Pixel 5" --scene game --touch "down 0 80 300; step 40; down 1 780 330; step 12; up 1; step 20; up 0" --out ...
  python tools/mobile_shot.py --list                  # 列出可用裝置
  --dist  改開 dist/卡比之星.html   --url <url> 開任意網址（例如 http://localhost:8000/）
  --eval "js" 截圖後 evaluate 並印出   --state 印 __kb.state()   --run 讓遊戲自己跑（不用 norun；step 仍可用 sleep 秒）
  --wait-sw 等 service worker 安裝好   --reload N 再重載 N 次（第二次載入才有 sw controller）   --offline 最後切離線重載（驗證離線可玩）
touch 指令（座標 = CSS px，viewport 左上為原點）：
  tap <x> <y> [frames]      按下 → 前進 frames 幀（預設 4）→ 放開
  down <id> <x> <y>         第 id 指按下（多點同時：不同 id）
  move <id> <x> <y>         第 id 指移動
  up <id>                   第 id 指放開
  step <n>                  前進 n 幀（norun 模式）/ 等 n/60 秒（--run 模式）
  key <name> [frames]       鍵盤虛擬 tap（left right up down jump attack select start）
  shot <name>               途中截圖 shots 同目錄 <out>_<name>.png
"""
import argparse, pathlib, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

class Touch:
    """多點觸控（CDP）：維持目前按住的點，每次變動把全部點一起送出"""
    def __init__(self, cdp):
        self.cdp = cdp; self.pts = {}
    def _send(self, typ, changed):
        pts = [{'x': x, 'y': y, 'id': i} for i, (x, y) in self.pts.items()]
        if typ == 'touchEnd':
            pts = [p for p in pts if p['id'] != changed]
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})
    def down(self, i, x, y):
        self.pts[i] = (x, y); self._send('touchStart', i)
    def move(self, i, x, y):
        if i in self.pts:
            self.pts[i] = (x, y); self._send('touchMove', i)
    def up(self, i):
        if i in self.pts:
            self._send('touchEnd', i); del self.pts[i]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--device', default='iPhone 13')
    ap.add_argument('--landscape', action='store_true')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--scene', default='title')
    ap.add_argument('--level', default='w1'); ap.add_argument('--room', type=int, default=0)
    ap.add_argument('--ability')
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--touch', default='')
    ap.add_argument('--out', default='shots/mobile.png')
    ap.add_argument('--dist', action='store_true')
    ap.add_argument('--url', default='')
    ap.add_argument('--eval', default='')
    ap.add_argument('--state', action='store_true')
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--console', action='store_true')
    ap.add_argument('--reload', type=int, default=0, help='載入後再重新載入 N 次（sw 第二次載入才會接管）')
    ap.add_argument('--offline', action='store_true', help='最後切成離線再重載一次（驗證 sw 離線可玩）')
    ap.add_argument('--wait-sw', dest='wait_sw', action='store_true', help='等 navigator.serviceWorker.ready')
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    if not out.is_absolute(): out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    logs = []
    with sync_playwright() as p:
        if a.list:
            print('\n'.join(sorted(p.devices.keys()))); return
        name = a.device + (' landscape' if a.landscape and (a.device + ' landscape') in p.devices else '')
        dev = dict(p.devices[name])
        if a.landscape and name == a.device:   # 沒有 landscape 描述：自己轉
            vp = dev['viewport']; dev['viewport'] = {'width': vp['height'], 'height': vp['width']}
        b = p.chromium.launch()
        ctx = b.new_context(**dev)
        pg = ctx.new_page()
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        url = a.url or ((ROOT / 'dist' / '卡比之星.html') if a.dist else (ROOT / 'index.html')).as_uri()
        q = '?debug=1&mute=1' + ('' if a.run else '&norun=1')
        opts = {'level': a.level, 'room': a.room, 'nofade': True}
        if a.ability: opts['ability'] = a.ability

        def load(first=False):
            if first: pg.goto(url + q)
            else: pg.reload()
            pg.wait_for_function('()=>window.__kb && KB.LEVELS')
            pg.evaluate("([s,o])=>__kb.goto(s,o)", [a.scene, opts])

        load(True)
        if a.wait_sw:      # 等 service worker 安裝完成（--url http://... 才有意義）
            try:
                pg.wait_for_function("()=>navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)", timeout=15000)
                print('sw ready')
            except Exception as e:
                print('sw not ready:', e)
        for i in range(a.reload):   # 重新載入（第二次載入才會有 serviceWorker.controller）
            load(); print('reload', i + 1)
        if a.offline:      # 切離線後再重載一次：驗證 sw 快取能撐起整個遊戲
            ctx.set_offline(True)
            load(); print('offline reload ok')
        cdp = ctx.new_cdp_session(pg); t = Touch(cdp)
        def step(n):
            if a.run: time.sleep(n / 60)
            else: pg.evaluate("(n)=>__kb.step(n)", n)
        step(a.steps)
        for raw in a.touch.split(';'):
            c = raw.strip().split()
            if not c: continue
            op = c[0]
            if op == 'tap':
                t.down(0, float(c[1]), float(c[2])); step(int(c[3]) if len(c) > 3 else 4); t.up(0)
            elif op == 'down': t.down(int(c[1]), float(c[2]), float(c[3]))
            elif op == 'move': t.move(int(c[1]), float(c[2]), float(c[3]))
            elif op == 'up': t.up(int(c[1]))
            elif op == 'step': step(int(c[1]))
            elif op == 'key': pg.evaluate("([k,n])=>__kb.tap(k,n)", [c[1], int(c[2]) if len(c) > 2 else 1])
            elif op == 'shot':
                pth = out.parent / f'{out.stem}_{c[1]}{out.suffix}'
                if not a.run: pg.evaluate("()=>__kb.render()")
                pg.screenshot(path=str(pth)); print('shot', pth)
            else: print('unknown touch op:', op)
        if not a.run: pg.evaluate("()=>__kb.render()")
        pg.screenshot(path=str(out)); print('shot', out, dev['viewport'], 'dpr', dev.get('device_scale_factor'))
        if a.eval: print(pg.evaluate(a.eval))
        if a.state: print(pg.evaluate("()=>__kb.state()"))
        errs = [l for l in logs if 'error' in l.lower()]
        if errs or a.console: print('\n'.join(logs if a.console else errs))
        b.close()

if __name__ == '__main__':
    main()
