# -*- coding: utf-8 -*-
"""
截圖工具：以 Playwright(Chromium) 開啟 index.html?debug=1，跳到指定場景、模擬按鍵、前進 N 幀後截圖。
用法：
  python tools/shot.py --scene game --level w1 --room 0 --steps 60 --out shots/w1.png
  python tools/shot.py --scene game --level w1 --keys right --steps 90 --out shots/walk.png
  python tools/shot.py --scene game --level w1 --script "press right 40; tap jump 1; step 20; release; step 10" --out shots/jump.png
  python tools/shot.py --scene sheet --filter kirby --page 0 --out shots/sheet_kirby.png
  python tools/shot.py --scene title --steps 120 --out shots/title.png
  python tools/shot.py --scene game --level w1 --ability fire --script "tap attack 1; step 8" --out shots/fire.png
  --scale 3 放大倍率（預設 3）  --state 印出 __kb.state()  --seq N:frames 連拍 N 張（每張間隔 frames 幀）
script 指令：press <key,key...> <frames> | tap <key> <frames> | step <frames> | release | goto <scene> | shot <name>
key: left right up down jump attack select start
"""
import argparse, json, os, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

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
            obj = {k: True for k in keys}
            page.evaluate("(o)=>__kb.press(o)", obj)
            page.evaluate("(n)=>__kb.step(n)", frames)
        elif op == 'tap':
            page.evaluate("([k,n])=>__kb.tap(k,n)", [parts[1], int(parts[2]) if len(parts) > 2 else 1])
        elif op == 'step':
            page.evaluate("(n)=>__kb.step(n)", int(parts[1]))
        elif op == 'release':
            page.evaluate("()=>{__kb.release(); __kb.step(1)}")
        elif op == 'goto':
            page.evaluate("(s)=>__kb.goto(s,{nofade:true})", parts[1])
        elif op == 'shot':
            name = parts[1]
            p = out_base.parent / (out_base.stem + '_' + name + out_base.suffix)
            take(page, p, scale); shots.append(p)
        else:
            print('unknown script op', op, file=sys.stderr)

def take(page, path, scale):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__kb.render()")
    data = page.evaluate("""(s)=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""", scale)
    import base64
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('saved', path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scene', default='game')
    ap.add_argument('--level', default='w1')
    ap.add_argument('--room', type=int, default=0)
    ap.add_argument('--x', type=float); ap.add_argument('--y', type=float)
    ap.add_argument('--ability')
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--keys', default='')
    ap.add_argument('--script', default='')
    ap.add_argument('--filter', default='')
    ap.add_argument('--page', type=int, default=0)
    ap.add_argument('--out', default='shots/out.png')
    ap.add_argument('--scale', type=int, default=3)
    ap.add_argument('--state', action='store_true')
    ap.add_argument('--seq', default='')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('--console', action='store_true', help='印出瀏覽器 console 訊息')
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    if not out.is_absolute():
        out = ROOT / out
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        opts = {'level': a.level, 'room': a.room, 'nofade': True}
        if a.x is not None: opts['x'] = a.x
        if a.y is not None: opts['y'] = a.y
        if a.ability: opts['ability'] = a.ability
        if a.scene == 'sheet':
            pg.evaluate("(o)=>__kb.goto('sheet',o)", {'filter': a.filter, 'page': a.page})
        else:
            pg.evaluate("([s,o])=>__kb.goto(s,o)", [a.scene, opts])
        if a.hitbox:
            pg.evaluate("()=>__kb.hitbox(true)")
        shots = []
        if a.keys:
            pg.evaluate("(o)=>__kb.press(o)", {k: True for k in a.keys.split(',')})
        if a.script:
            run_script(pg, a.script, out, a.scale, shots)
        else:
            pg.evaluate("(n)=>__kb.step(n)", a.steps)
        if a.seq:
            n, fr = a.seq.split(':')
            for i in range(int(n)):
                pth = out.parent / f'{out.stem}_{i:02d}{out.suffix}'
                take(pg, pth, a.scale); shots.append(pth)
                pg.evaluate("(n)=>__kb.step(n)", int(fr))
        else:
            take(pg, out, a.scale)
        if a.state:
            print(pg.evaluate("()=>__kb.state()"))
        missing = pg.evaluate("()=>__kb.missing()")
        if missing:
            print('MISSING SPRITES:', ', '.join(missing))
        errs = [l for l in logs if 'error' in l.lower()]
        if errs or a.console:
            print('\n'.join(logs if a.console else errs))
        b.close()

if __name__ == '__main__':
    main()
