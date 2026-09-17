# -*- coding: utf-8 -*-
"""
點陣字型檢視工具：開啟 index.html?debug=1 進入 game 場景後，直接在畫布上用 KB.text 畫出全字集並存成 PNG。
用法：
  python tools/font_shot.py --out shots/font.png --scale 4
  python tools/font_shot.py --text "SCORE 0000000|x3|Hello!" --out shots/font_custom.png   # 以 | 分行
  --bg 深色底 / --outline 加外框示範 / --scale 放大倍率（預設 4）
"""
import argparse, base64, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

DEFAULT_LINES = [
    ('ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#ffffff'),
    ('abcdefghijklmnopqrstuvwxyz', '#ffffff'),
    ('0123456789!?.,:;-+/()', '#ffe040'),
    ('\'"x×©<>=_%*#&[]~@', '#ffe040'),
    ('★♥→←↑↓ SCORE 0000000 x3', '#ffb0d0'),
    ('NORMAL FIRE SWORD BEAM', '#ffe040'),
    ('CUTTER SPARK STONE ICE', '#ffe040'),
    ('HAMMER 1UP! PAUSE', '#ffe040'),
    ('PUSH START BUTTON', '#ffffff'),
    ('Kirby Star (c) 2026 Fan Game', '#60d8f8'),
    ('The quick brown fox jumps', '#ffffff'),
    ('over the lazy dog. 12:30', '#ffffff'),
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='shots/font.png')
    ap.add_argument('--scale', type=int, default=4)
    ap.add_argument('--text', default='', help='自訂文字，以 | 分行')
    ap.add_argument('--bg', default='#182030')
    ap.add_argument('--outline', action='store_true', help='示範 outline 效果')
    ap.add_argument('--spacing', type=int, default=0)
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [(t, '#ffffff') for t in a.text.split('|')] if a.text else DEFAULT_LINES
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate("(o)=>__kb.goto('game',o)", {'level': 'w1', 'room': 0, 'nofade': True})
        pg.evaluate("(n)=>__kb.step(n)", 2)
        data = pg.evaluate("""([lines,bg,outline,spacing,scale])=>{
          const ctx=KB.ctx; ctx.fillStyle=bg; ctx.fillRect(0,0,KB.W,KB.H);
          let y=4;
          for(const [t,col] of lines){
            const o={color:col,spacing:spacing}; if(outline){o.outline='#202020';}
            KB.text(ctx,t,4,y,o); y+=10;
          }
          // 字距示範：spacing 1
          KB.text(ctx,'SPACING 1 ABC xyz 09',4,y+2,{color:'#48c048',spacing:1}); y+=12;
          KB.text(ctx,'OUTLINE 1UP x3',4,y+2,{color:'#ffe040',outline:'#402000'}); y+=12;
          KB.text(ctx,'SHADOW SCORE 0100',4,y+2,{color:'#ffffff',shadow:'#000000'});
          // 缺字檢查
          const need='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:;-+/()\\'"x×©<>=_%';
          const miss=[...need].filter(c=>!KB.FONT[c]);
          const bad=Object.keys(KB.FONT).filter(k=>{const r=KB.FONT[k];return r.length!==8||r.some(s=>s.length!==8)||r.some(s=>s[7]!=='.');});
          window.__fontReport={missing:miss,bad:bad,count:Object.keys(KB.FONT).length};
          const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*scale;o.height=c.height*scale;
          const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png');
        }""", [lines, a.bg, a.outline, a.spacing, a.scale])
        out.write_bytes(base64.b64decode(data.split(',', 1)[1]))
        rep = pg.evaluate("()=>window.__fontReport")
        print('saved', out)
        print('glyphs:', rep['count'], ' missing:', rep['missing'] or 'none', ' malformed:', rep['bad'] or 'none')
        errs = [l for l in logs if 'error' in l.lower()]
        if errs:
            print('\n'.join(errs))
        b.close()

if __name__ == '__main__':
    main()
