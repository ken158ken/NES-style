# -*- coding: utf-8 -*-
"""截圖工具：Playwright(Chromium) 開 game.html?debug=1，跑腳本推進幀數後截圖（沿用 ../卡比之星/tools/shot.py 語法）。

用法：
  PY=../卡比之星/.venv/bin/python
  $PY tools/shot.py --out shots/agent_x/boot.png                                   # 開機畫面（預設 step 1 幀）
  $PY tools/shot.py --steps 60 --out shots/agent_x/idle.png
  $PY tools/shot.py --script "press right 40; tap a 1; step 30; shot jump" --out shots/agent_x/run.png
  $PY tools/shot.py --seq 6:4 --scale 3 --out shots/agent_x/anim.png               # 連拍 6 張、每張間隔 4 幀
  $PY tools/shot.py --script "step 30" --lint --out shots/agent_x/lint.png         # 截完跑 __nes.lint()，違規 exit 1

script 指令：press <key,key...> <frames> | tap <key,...> <frames> | step <n> | release | shot <name>
key：a b select start up down left right（NES 八鍵；逗號可多按）
其他：--state 印 __nes.state()、--stats 印 __nes.stats()、--console 印全部 console、--url 換頁面
說明：頁面以 ?debug=1&scale=1 開啟 ⇒ canvas 是 256×224 原生尺寸，放大由本工具的 --scale 做（整數、無平滑）。
      debug 模式下 Timing 不自動跑，畫面只由 step/press/tap 推進 ⇒ 截圖可重現。
"""
import argparse
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'game.html').as_uri()
KEYS = ('a', 'b', 'select', 'start', 'up', 'down', 'left', 'right')


def take(page, path, scale):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    data = page.evaluate(
        """(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
                 const o=document.createElement('canvas');
                 o.width=c.width*s; o.height=c.height*s;
                 const x=o.getContext('2d'); x.imageSmoothingEnabled=false;
                 x.drawImage(c,0,0,o.width,o.height);
                 return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('saved', path)
    return path


def run_script(page, script, out_base, scale, shots):
    for raw in script.split(';'):
        cmd = raw.strip()
        if not cmd:
            continue
        parts = cmd.split()
        op = parts[0]
        if op == 'press':
            keys = parts[1].split(',')
            frames = int(parts[2]) if len(parts) > 2 else 1
            page.evaluate("([k,n])=>__nes.press(k,n)", [keys, frames])
        elif op == 'tap':
            keys = parts[1].split(',')
            frames = int(parts[2]) if len(parts) > 2 else 1
            page.evaluate("([k,n])=>__nes.tap(k,n)", [keys, frames])
        elif op == 'step':
            page.evaluate("(n)=>__nes.step(n)", int(parts[1]) if len(parts) > 1 else 1)
        elif op == 'release':
            page.evaluate("()=>{__nes.release(); __nes.step(1)}")
        elif op == 'shot':
            name = parts[1] if len(parts) > 1 else 'shot'
            p = out_base.parent / (out_base.stem + '_' + name + out_base.suffix)
            shots.append(take(page, p, scale))
        else:
            print('unknown script op:', op, file=sys.stderr)


def report_lint(page):
    """回傳 (ok, 文字)；ok=False 代表有違規（呼叫端 exit 1）。"""
    r = page.evaluate("()=>__nes.lint()")
    if not r:
        return True, 'lint: 無回傳（nes_lint.js 未載入？）'
    if r.get('skipped'):
        return True, 'lint: SKIP（%s）' % r.get('reason', '')
    ok = bool(r.get('ok', True))
    bits = ['lint: %s' % ('PASS' if ok else 'FAIL')]
    if r.get('colors') is not None:
        bits.append('colors=%s' % r['colors'])
    if r.get('badPixels'):
        bits.append('badPixels=%s' % r['badPixels'])
    if r.get('overLine'):
        bits.append('overLine=%s' % json.dumps(r['overLine'])[:200])
    if r.get('ppuOverLines'):
        bits.append('ppu.overLines=%s(超過 8 精靈/線，閃爍屬正常)' % json.dumps(r['ppuOverLines'])[:120])
    if r.get('maxSpritesLine') is not None:
        bits.append('maxSprLine=%s' % r['maxSpritesLine'])
    if r.get('oamError'):
        bits.append('oam 無法檢查(%s)' % r['oamError'][:60])
    if r.get('oam'):
        bits.append('oam=%s' % json.dumps(r['oam'], ensure_ascii=False)[:200])
    return ok, '  '.join(bits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--script', default='', help='press/tap/step/release/shot，分號分隔')
    ap.add_argument('--steps', type=int, default=1, help='沒有 --script 時推進的幀數')
    ap.add_argument('--keys', default='', help='開場就按住的鍵（逗號分隔）')
    ap.add_argument('--seq', default='', help='N:frames 連拍 N 張、每張間隔 frames 幀')
    ap.add_argument('--out', default='shots/out.png')
    ap.add_argument('--scale', type=int, default=3)
    ap.add_argument('--lint', action='store_true', help='截圖後呼叫 __nes.lint()，違規則 exit 1')
    ap.add_argument('--state', action='store_true')
    ap.add_argument('--stats', action='store_true')
    ap.add_argument('--console', action='store_true')
    ap.add_argument('--url', default='', help='自訂頁面（預設 game.html）')
    ap.add_argument('--query', default='', help='附加網址參數，例如 "level=1&room=2"')
    a = ap.parse_args()

    out = pathlib.Path(a.out)
    if not out.is_absolute():
        out = ROOT / out
    url = a.url or PAGE
    if a.url and '://' not in a.url:   # R2：相對路徑（例如 cruiser.html）→ 專案內檔案
        url = (ROOT / a.url).resolve().as_uri()
    url += ('&' if '?' in url else '?') + 'debug=1&scale=1&mute=1'
    if a.query:
        url += '&' + a.query.lstrip('?&')

    logs = []
    fail = False
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 240})
        pg.on('console', lambda m: logs.append('[%s] %s' % (m.type, m.text)))
        pg.on('pageerror', lambda e: logs.append('[pageerror] %s' % e))
        pg.goto(url)
        try:
            pg.wait_for_function('()=>window.__nes && window.NES && NES.instance', timeout=15000)
        except Exception as e:
            print('頁面沒有掛上 __nes：', e, file=sys.stderr)
            print('\n'.join(logs), file=sys.stderr)
            b.close()
            sys.exit(2)

        missing = pg.evaluate("()=>__nes.missing()")
        if missing:
            print('MISSING MODULES:', ', '.join(missing))

        shots = []
        if a.keys:
            pg.evaluate("(k)=>__nes.press(k,1)", a.keys.split(','))
        if a.script:
            run_script(pg, a.script, out, a.scale, shots)
        elif a.steps:
            pg.evaluate("(n)=>__nes.step(n)", a.steps)

        if a.seq:
            n, fr = a.seq.split(':')
            for i in range(int(n)):
                shots.append(take(pg, out.parent / ('%s_%02d%s' % (out.stem, i, out.suffix)), a.scale))
                pg.evaluate("(n)=>__nes.step(n)", int(fr))
        else:
            shots.append(take(pg, out, a.scale))

        if a.state:
            print('state:', json.dumps(pg.evaluate("()=>__nes.state()"), ensure_ascii=False))
        if a.stats:
            print('stats:', json.dumps(pg.evaluate("()=>__nes.stats()"), ensure_ascii=False))
        if a.lint:
            ok, text = report_lint(pg)
            print(text)
            fail = fail or not ok

        # file:// 缺檔的 404（Failed to load resource）是預期中的佔位，不算錯誤
        errs = [l for l in logs
                if ('error' in l.lower() or 'pageerror' in l)
                and 'Failed to load resource' not in l]
        if errs:
            print('PAGE ERRORS:')
            print('\n'.join(errs))
            fail = True
        if a.console:
            print('--- console ---')
            print('\n'.join(logs))
        b.close()

    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
