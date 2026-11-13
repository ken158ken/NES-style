#!/usr/bin/env python3
"""games/cart5/paint/zh_gen.py — 《星塵畫室》固定中文點陣產生器（fix-r9-paint，qa-r9 P3-4）

畫室的畫布畫面把圖樣表幾乎整張讓給動態磁磚池，不能接 CT.Text；標題 / 說明 / 清單畫面用的 paint_ui bank
還有約 145 塊空位，所以把少量固定中文（標題、模式名、說明頁標題、回選單提示）**離線**點陣化後直接烘進 paint_ui。
字形與 tools/cjk_glyphs.py 完全相同（Noto Sans CJK TC 15px，同一個 render()），test_paint.py 逐位元比對。

輸出：改寫 art.js 裡 `// <zh:begin>` 與 `// <zh:end>` 之間的資料區（字串只放 ASCII：碼點十六進位 + 點陣十六進位，
      中文只出現在註解，所以 cjk_glyphs.py 的掃描不會把這些字收進卡帶共用的 glyphs.js）。

用法：../卡比之星/.venv/bin/python games/cart5/paint/zh_gen.py [--check]
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import cjk_glyphs  # noqa: E402

ART = os.path.join(HERE, 'art.js')
WORDS = [
    ('TITLE', '星塵畫室'),
    ('FREE', '自由畫'), ('BOOK', '著色本'), ('COPY', '臨摹挑戰'), ('GUESS', '快畫猜猜'), ('HELP', '遊戲說明'),
    ('HOLD', '按住'), ('MENU', '回選單'),
    ('H_CTRL', '操作'), ('H_TOOL', '工具'), ('H_COLOR', '顏色'), ('H_MODE', '模式'),
    ('FILLALL', '塗滿每一區'),
]


def block():
    chars = []
    for _, w in WORDS:
        for ch in w:
            if ch not in chars:
                chars.append(ch)
    out = ['  // <zh:begin>（zh_gen.py 自動產生，不要手改；%d 字）' % len(chars)]
    out.append('  var ZH_GLYPH = {')
    for ch in chars:
        out.append("    u%04x: '%s',   // %s" % (ord(ch), cjk_glyphs.glyph_hex(ch), ch))
    out[-1] = out[-1].replace("',   //", "'    //")
    out.append('  };')
    out.append('  var ZH_WORD = {')
    for i, (k, w) in enumerate(WORDS):
        cps = ', '.join("'u%04x'" % ord(ch) for ch in w)
        out.append('    %s: [%s]%s   // %s' % (k, cps, ',' if i + 1 < len(WORDS) else '', w))
    out.append('  };')
    out.append('  // <zh:end>')
    return '\n'.join(out), chars


def main():
    src = open(ART, encoding='utf-8').read()
    blk, chars = block()
    new = re.sub(r'  // <zh:begin>.*?// <zh:end>', lambda m: blk, src, flags=re.S)
    if '--check' in sys.argv:
        ok = new == src
        print('zh_gen: %s（%d 字）' % ('OK' if ok else '過期，請重產', len(chars)))
        return 0 if ok else 1
    if new == src and '<zh:begin>' not in src:
        print('art.js 找不到 <zh:begin> 標記'); return 1
    open(ART, 'w', encoding='utf-8').write(new)
    print('zh_gen: 寫入 %d 字 / %d 詞' % (len(chars), len(WORDS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
