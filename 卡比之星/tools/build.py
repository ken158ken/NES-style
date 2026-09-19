# -*- coding: utf-8 -*-
"""把 index.html、所有 src/*.js 與 assets/fonts/*.woff2 內嵌成單一檔案 dist/卡比之星.html（可直接雙擊）

另外（Round 11）會重新產生根目錄 `sw.js` 的頂端兩行 `const VERSION` / `const ASSETS`：
      ASSETS = index.html 的 <script src> 清單（照載入順序）＋ 固定資產（字型 / 字集 / manifest / icons），
      VERSION = 所有資產內容的 sha1 前 10 碼 ⇒ 任何檔案有改，部署後 sw 就會換快取版本。

字型：像素中文字型以 base64 data URI 寫進 `KB.FONT_DATA`，插在 gfx.js 之前，
      gfx.js 的 KB.loadPixelFonts() 會優先用它 ⇒ dist 單檔不必帶 assets/ 資料夾也有像素字。
      px12 = 縫合像素字體（SIL OFL 1.1）／px16 = GNU Unifont 16.0.04 子集（OFL 1.1）。
      同時把 `assets/fonts/unifont_chars.txt` 內嵌成 `KB.FONT_CHARS16`（px16 子集的字元清單，
      gfx.js 用來快速判斷缺字 ⇒ 整串退回 12px，不會出現豆腐）。
      （約 +1.3 MB；字型缺檔時自動略過，gfx.js 會退回相對路徑 / 系統字超取樣。）
"""
import base64
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = {  # KB.FONTS 的 key -> 檔名（要與 src/gfx.js 的 KB.FONT_SRC 對應）
    'px12': 'assets/fonts/fusion12-zh_hant.woff2',
    'px16': 'assets/fonts/unifont16-subset.woff2',
}
CHARS16 = 'assets/fonts/unifont_chars.txt'   # px16 子集的字元清單（tools/font_subset.py 產生）

html = (ROOT / 'index.html').read_text(encoding='utf-8')


def inline(m):
    src = m.group(1)
    js = (ROOT / src).read_text(encoding='utf-8')
    js = js.replace('</script', '<\\/script')
    return '<script>/* ' + src + ' */\n' + js + '\n</script>'


out = re.sub(r'<script src="([^"]+)"></script>', inline, html)

# dist 是單檔 file://：manifest / apple-touch-icon 這兩個外部連結抓不到（console 404），直接拿掉；
# 單檔版也不註冊 service worker（src/pwa.js 看到 KB.FONT_DATA 就略過）。
out = re.sub(r'[ \t]*<link rel="manifest"[^>]*>\n?', '', out)
out = re.sub(r'[ \t]*<link rel="apple-touch-icon"[^>]*>\n?', '', out)

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
    chars = ''
    cp = ROOT / CHARS16
    if cp.exists():
        raw = cp.read_text(encoding='utf-8')
        chars = ('KB.FONT_CHARS16 = ' + json.dumps(raw, ensure_ascii=False) + ';\n')
        print('embedded px16 char list:', len(raw), 'chars')
    else:
        print('char list missing, skipped:', CHARS16)
    tag = ('<script>/* assets/fonts（px12 縫合像素字體 SIL OFL 1.1 / px16 GNU Unifont 子集 OFL 1.1）*/\n'
           'window.KB = window.KB || {};\n' + chars + 'KB.FONT_DATA = {\n'
           + '\n'.join(entries) + '\n};\n</script>\n')
    marker = '<script>/* src/gfx.js */'
    assert marker in out, 'gfx.js 沒有被內嵌？'
    out = out.replace(marker, tag + marker, 1)
    print('embedded fonts:', ', '.join(FONTS), '%d KB (base64)' % (total // 1024))

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
(dist / '卡比之星.html').write_text(out, encoding='utf-8')
print('written', dist / '卡比之星.html', len(out) // 1024, 'KB')


# ============ Round 11：產生 sw.js 的 VERSION / ASSETS ============
SW = ROOT / 'sw.js'
SW_FIXED = [                    # 不在 index.html 裡、但離線要用的檔
    'assets/fonts/fusion12-zh_hant.woff2',
    'assets/fonts/unifont16-subset.woff2',
    'assets/fonts/unifont_chars.txt',
    'assets/manifest.webmanifest',
]


def build_sw(page_html):
    if not SW.exists():
        print('sw.js 不存在，略過')
        return
    srcs = re.findall(r'<script src="([^"]+)"></script>', page_html)      # 照 index.html 的載入順序
    icons = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'assets' / 'icons').glob('*.png'))
    rels = ['index.html'] + srcs + SW_FIXED + icons
    seen, files = set(), []
    for r in rels:
        if r not in seen:
            seen.add(r)
            files.append(r)

    missing = [r for r in files if not (ROOT / r).exists()]               # 缺檔檢查（印出來，不中斷）
    for r in missing:
        print('  !! sw ASSETS 缺檔：', r)
    print('sw ASSETS：%d 個檔案，缺 %d 個' % (len(files) + 1, len(missing)))

    h = hashlib.sha1()
    for r in files:
        f = ROOT / r
        h.update(r.encode('utf-8'))
        if f.exists():
            h.update(f.read_bytes())
    version = h.hexdigest()[:10]

    assets = ['./'] + ['./' + r for r in files]
    lines, per = [], 3
    for i in range(0, len(assets), per):
        lines.append('  ' + ' '.join(json.dumps(a) + ',' for a in assets[i:i + per]))
    arr = 'const ASSETS = [\n' + '\n'.join(lines).rstrip(',') + '\n];'

    src = SW.read_text(encoding='utf-8')
    src, n1 = re.subn(r"^const VERSION = .*$", "const VERSION = '%s';" % version, src, count=1, flags=re.M)
    src, n2 = re.subn(r"^const ASSETS = \[[\s\S]*?\];$", arr.replace('\\', '\\\\'), src, count=1, flags=re.M)
    assert n1 == 1 and n2 == 1, 'sw.js 的 VERSION / ASSETS 樣板行找不到（勿改那兩行的格式）'
    SW.write_text(src, encoding='utf-8')
    print('written', SW.relative_to(ROOT), 'VERSION', version)


build_sw(html)
