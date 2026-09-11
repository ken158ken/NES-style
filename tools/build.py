# -*- coding: utf-8 -*-
"""把 index.html 與所有 src/*.js 內嵌成單一檔案 dist/卡比之星.html（可直接雙擊）"""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
def inline(m):
    src = m.group(1)
    js = (ROOT / src).read_text(encoding='utf-8')
    js = js.replace('</script', '<\\/script')
    return '<script>/* ' + src + ' */\n' + js + '\n</script>'
out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
dist = ROOT / 'dist'; dist.mkdir(exist_ok=True)
(dist / '卡比之星.html').write_text(out, encoding='utf-8')
print('written', dist / '卡比之星.html', len(out) // 1024, 'KB')
