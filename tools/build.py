# -*- coding: utf-8 -*-
"""把 index.html、所有 src/*.js 與 assets/fonts/*.woff2 內嵌成單一檔案 dist/卡比之星.html（可直接雙擊）

字型：像素中文字型（SIL OFL 1.1）以 base64 data URI 寫進 `KB.FONT_DATA`，插在 gfx.js 之前，
      gfx.js 的 KB.loadPixelFonts() 會優先用它 ⇒ dist 單檔不必帶 assets/ 資料夾也有像素字。
      （約 +1.3 MB；字型缺檔時自動略過，gfx.js 會退回相對路徑 / 系統字超取樣。）
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = {  # KB.FONTS 的 key -> 檔名（要與 src/gfx.js 的 KB.FONT_SRC 對應）
    'px12': 'assets/fonts/fusion12-zh_hant.woff2',
    'px16': 'assets/fonts/ark16-zh_tw.woff2',
}

html = (ROOT / 'index.html').read_text(encoding='utf-8')


def inline(m):
    src = m.group(1)
    js = (ROOT / src).read_text(encoding='utf-8')
    js = js.replace('</script', '<\\/script')
    return '<script>/* ' + src + ' */\n' + js + '\n</script>'


out = re.sub(r'<script src="([^"]+)"></script>', inline, html)

# ---- 字型 data URI（插在 gfx.js 之前）----
entries, total = [], 0
for key, rel in FONTS.items():
    p = ROOT / rel
    if not p.exists():
        print('font missing, skipped:', rel)
        continue
    b64 = base64.b64encode(p.read_bytes()).decode('ascii')
    total += len(b64)
    entries.append("  %s: 'data:font/woff2;base64,%s'," % (key, b64))
if entries:
    tag = ('<script>/* assets/fonts (SIL OFL 1.1) */\nwindow.KB = window.KB || {};\nKB.FONT_DATA = {\n'
           + '\n'.join(entries) + '\n};\n</script>\n')
    marker = '<script>/* src/gfx.js */'
    assert marker in out, 'gfx.js 沒有被內嵌？'
    out = out.replace(marker, tag + marker, 1)
    print('embedded fonts:', ', '.join(FONTS), '%d KB (base64)' % (total // 1024))

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
(dist / '卡比之星.html').write_text(out, encoding='utf-8')
print('written', dist / '卡比之星.html', len(out) // 1024, 'KB')
