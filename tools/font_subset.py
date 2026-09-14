# -*- coding: utf-8 -*-
"""16px 中文像素字型子集產生器（agent: font2）

掃 `src/**/*.js` 用到的所有非 ASCII 字元（＋一組常用標點 / ASCII），從 **GNU Unifont** 原檔裁出
只含這些字的 woff2，寫到 `assets/fonts/unifont16-subset.woff2`，字元清單寫到
`assets/fonts/unifont_chars.txt`（`tools/build.py` 會把它內嵌成 `KB.FONT_CHARS16`）。

為什麼要子集：Unifont 全字檔 ~5 MB，內嵌進 dist 會變 6.7 MB base64；只留遊戲用得到的
約 1,800 個字 ⇒ 56 KB。**原檔不要放進專案**，本工具會下載到暫存目錄（預設 /tmp）。

用法：
    .venv/bin/python tools/font_subset.py              # 掃 src、下載（或用快取）、產生子集
    .venv/bin/python tools/font_subset.py --check      # 只檢查：列出 src 有但子集沒有的字
    .venv/bin/python tools/font_subset.py --src <path/to/unifont-16.0.04.otf>
    .venv/bin/python tools/font_subset.py --cache-dir /tmp/unifont

新增中文文案之後請重跑一次，否則新字在 16px 標題會被 gfx.js 判定為缺字、整串退回 12px。

授權：GNU Unifont 16.0.04 為 SIL OFL 1.1 / GPLv2+ font exception 雙授權；本專案依 OFL 1.1 使用，
      授權全文見 `assets/fonts/OFL-unifont.txt`。
"""
import argparse
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / 'src'
OUT_FONT = ROOT / 'assets' / 'fonts' / 'unifont16-subset.woff2'
OUT_CHARS = ROOT / 'assets' / 'fonts' / 'unifont_chars.txt'
VERSION = '16.0.04'
URL = f'https://unifoundry.com/pub/unifont/unifont-{VERSION}/font-builds/unifont-{VERSION}.otf'

# 一定要收的字：ASCII 可見字元（混排時整段走像素字型）＋ 遊戲畫面常見的全形標點 / 符號
ALWAYS = (
    ''.join(chr(c) for c in range(0x20, 0x7f))
    + '，。、；：？！「」『』（）《》〈〉—…‧・～　'
    + '←↑→↓★☆♥●○◆■□▲▼※×÷±≒≦≧№'
    + '１２３４５６７８９０％：！？（）'
)


def scan_chars():
    """掃 src/**/*.js 的所有字元（非 ASCII 全收；ASCII 由 ALWAYS 補齊）。"""
    chars = set(ALWAYS)
    for p in sorted(SRC_DIR.rglob('*.js')):
        for ch in p.read_text(encoding='utf-8'):
            if ord(ch) > 0x7f:
                chars.add(ch)
    # 換行 / tab 之類的控制字元不要進字型
    chars = {c for c in chars if ord(c) >= 0x20 and c != ''}
    return sorted(chars)


def ensure_source(src, cache_dir):
    if src:
        p = pathlib.Path(src).expanduser()
        if not p.exists():
            sys.exit(f'找不到字型原檔：{p}')
        return p
    cache = pathlib.Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    p = cache / f'unifont-{VERSION}.otf'
    if p.exists() and p.stat().st_size > 1_000_000:
        print('使用快取的 Unifont 原檔：', p, f'({p.stat().st_size // 1024} KB)')
        return p
    print('下載 Unifont 原檔（約 5 MB，只留在暫存目錄，不會進專案）…', URL)
    with urllib.request.urlopen(URL, timeout=180) as r:
        data = r.read()
    p.write_bytes(data)
    print('已下載', p, f'({len(data) // 1024} KB)')
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='', help='Unifont 原檔路徑（省略＝自動下載到 --cache-dir）')
    ap.add_argument('--cache-dir', default='/tmp/kb-unifont', help='原檔下載 / 快取目錄（不要指到專案內）')
    ap.add_argument('--check', action='store_true', help='只檢查 src 用到的字有沒有全在現有子集裡')
    a = ap.parse_args()

    chars = scan_chars()
    text = ''.join(chars)
    print(f'src 用到的字元：{len(chars)} 個（非 ASCII {sum(1 for c in chars if ord(c) > 0x7f)}）')

    if a.check:
        if not OUT_CHARS.exists():
            sys.exit('還沒有 ' + str(OUT_CHARS) + '，請先不加 --check 跑一次')
        have = set(OUT_CHARS.read_text(encoding='utf-8'))
        missing = [c for c in chars if c not in have]
        if missing:
            print('子集缺字（這些字在 16px 會整串退回 12px）：', ''.join(missing))
            sys.exit(1)
        print('OK：src 用到的字全部都在子集裡')
        return

    otf = ensure_source(a.src, a.cache_dir)
    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, '-m', 'fontTools.subset', str(otf),
        '--text=' + text,
        '--output-file=' + str(OUT_FONT),
        '--flavor=woff2',
        '--layout-features=',            # 點陣字不需要 GSUB/GPOS
        '--no-hinting',
        '--desubroutinize',
        '--name-IDs=*', '--name-legacy',  # 保留字型名稱 / 授權資訊
        '--notdef-outline',
    ]
    print('$', ' '.join(cmd[:4]), '… (共', len(text), '字)')
    r = subprocess.run(cmd)
    if r.returncode != 0:
        sys.exit('pyftsubset 失敗')
    OUT_CHARS.write_text(text, encoding='utf-8')
    print('寫出', OUT_FONT, f'({OUT_FONT.stat().st_size // 1024} KB)')
    print('寫出', OUT_CHARS, f'({len(text)} 字)')
    print('提醒：改完要重跑 tools/build.py 才會進 dist。')


if __name__ == '__main__':
    main()
