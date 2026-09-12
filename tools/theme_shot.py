# -*- coding: utf-8 -*-
"""
主題預覽截圖：進入遊戲後以 KB.previewTheme(theme) 切換磁磚 / 背景主題並塞入該主題全部示範裝飾，前進 N 幀後截圖。
用法：
  python tools/theme_shot.py --theme castle --out shots/world_castle.png
  python tools/theme_shot.py --all                       # 五個主題各存 shots/world_<theme>.png
  python tools/theme_shot.py --theme cloud --x 30 --steps 90 --scale 3
  --level w1 --room 0 指定房間；--x/--y 卡比出生磁磚座標（鏡頭跟著移動）；--seq N:frames 連拍
"""
import argparse, base64, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
THEMES = ['green', 'castle', 'island', 'cloud', 'dedede', 'space']   # fix6：Round 6 新主題 space（星之彼端）


def take(page, path, scale):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__kb.render()")
    data = page.evaluate("""(s)=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('saved', path)


def shoot(pg, theme, a, out):
    opts = {'level': a.level, 'room': a.room, 'nofade': True}
    if a.x is not None: opts['x'] = a.x
    if a.y is not None: opts['y'] = a.y
    pg.evaluate("(o)=>__kb.goto('game',o)", opts)
    ok = pg.evaluate("(th)=>KB.previewTheme ? KB.previewTheme(th) : (KB.game.theme=th, KB.game.room.bg=th, true)", theme)
    if not ok:
        print('previewTheme failed for', theme, file=sys.stderr)
    pg.evaluate("(n)=>__kb.step(n)", a.steps)
    if a.seq:
        n, fr = a.seq.split(':')
        for i in range(int(n)):
            take(pg, out.parent / f'{out.stem}_{i:02d}{out.suffix}', a.scale)
            pg.evaluate("(n)=>__kb.step(n)", int(fr))
    else:
        take(pg, out, a.scale)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--theme', default='green', choices=THEMES)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--level', default='w1')
    ap.add_argument('--room', type=int, default=0)
    ap.add_argument('--x', type=float); ap.add_argument('--y', type=float)
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--out', default='')
    ap.add_argument('--scale', type=int, default=3)
    ap.add_argument('--seq', default='')
    ap.add_argument('--console', action='store_true')
    a = ap.parse_args()
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        themes = THEMES if a.all else [a.theme]
        for th in themes:
            out = pathlib.Path(a.out) if (a.out and not a.all) else pathlib.Path('shots') / f'world_{th}.png'
            if not out.is_absolute(): out = ROOT / out
            shoot(pg, th, a, out)
        missing = pg.evaluate("()=>__kb.missing()")
        if missing:
            print('MISSING SPRITES:', ', '.join(missing))
        errs = [l for l in logs if 'error' in l.lower()]
        if errs or a.console:
            print('\n'.join(logs if a.console else errs))
        b.close()


if __name__ == '__main__':
    main()
