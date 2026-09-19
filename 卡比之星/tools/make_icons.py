# -*- coding: utf-8 -*-
"""產生 PWA 圖示（原創手繪像素風，Round 11 pwa agent）

在 32×32 的像素格上「手繪」一顆粉紅圓臉角色（腮紅、眼睛、小嘴）＋一顆星星，
底色是夜空藍加幾顆星點，再用最近鄰放大輸出成各尺寸 PNG：

    assets/icons/icon-192.png            192 = 32×6     （manifest any）
    assets/icons/icon-512.png            512 = 32×16    （manifest any）
    assets/icons/icon-180.png            180（32×5=160 置中，四周留白、不透明）apple-touch
    assets/icons/icon-maskable-512.png   512（32×10=320 置中 ⇒ 四邊內縮 18.75%）maskable 安全區

所有像素皆由本檔程式生成（橢圓 / 手寫字串圖樣），未使用任何官方素材。
用法：  .venv/bin/python tools/make_icons.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icons'

# 調色盤（沿用 src/const.js 的 KB.PAL.kirby 色票）
PAL = {
    '.': None,             # 透明（最後會鋪底色）
    'p': '#ffb0d0',        # 主體粉
    'P': '#e07aa8',        # 陰影粉
    'l': '#ffd8e8',        # 高光粉
    'k': '#202848',        # 輪廓 / 眼睛深藍
    'w': '#ffffff',        # 眼睛白
    'b': '#5060c0',        # 眼睛藍
    'c': '#f27090',        # 腮紅
    'm': '#a02040',        # 嘴內
    'y': '#ffe040',        # 星星
    'Y': '#e09020',        # 星星陰影
    'n': '#101830',        # 夜空底
    'N': '#1c2a50',        # 夜空底（亮一點的斜角）
    's': '#8090d0',        # 背景小星點
}

W = H = 32


def blank():
    return [['.' for _ in range(W)] for _ in range(H)]


def paste(grid, patch, x0, y0):
    for j, row in enumerate(patch):
        for i, ch in enumerate(row):
            if ch in ('.', ' '):
                continue
            x, y = x0 + i, y0 + j
            if 0 <= x < W and 0 <= y < H:
                grid[y][x] = ch


def ellipse(grid, cx, cy, rx, ry, fill, edge=None, shade=None, hi=None):
    """畫實心橢圓：edge 為 1px 輪廓、shade 右下暗面、hi 左上高光"""
    def inside(x, y):
        u = (x + 0.5 - cx) / rx
        v = (y + 0.5 - cy) / ry
        return u * u + v * v <= 1.0

    for y in range(H):
        for x in range(W):
            if not inside(x, y):
                continue
            border = not (inside(x - 1, y) and inside(x + 1, y) and inside(x, y - 1) and inside(x, y + 1))
            if border and edge:
                grid[y][x] = edge
                continue
            u = (x + 0.5 - cx) / rx
            v = (y + 0.5 - cy) / ry
            d = (u * u + v * v) ** 0.5
            ch = fill
            if shade and d > 0.62 and u + v > 0.55:
                ch = shade
            elif hi and 0.40 < d < 0.74 and (-u) + (-v) > 0.85:
                ch = hi
            grid[y][x] = ch


# ---------- 零件（手繪像素圖樣）----------
EYE = [          # 4×9 大眼睛：白高光 + 深藍瞳 + 藍下緣
    '.kk.',
    'wwkk',
    'wwkk',
    'kkkk',
    'kkkk',
    'kkkk',
    'kkkk',
    'bbbb',
    '.bb.',
]
BLUSH = [        # 6×3 腮紅
    '.cccc.',
    'cccccc',
    '.cccc.',
]
MOUTH = [        # 5×4 小張嘴
    '.kkk.',
    'kmmmk',
    'kmmmk',
    '.kkk.',
]
STAR = [         # 7×7 五角星（右上角裝飾）
    '...y...',
    '..yyy..',
    'yyyyyyy',
    '.yyyyy.',
    '..yyy..',
    '.yY.Yy.',
    '.Y...Y.',
]
FOOT = [         # 7×4 紅腳（露在圓臉下方兩側）
    '.kkkkk.',
    'krrrrrk',
    'krrrRRk',
    '.kkkkk.',
]
PAL['r'] = '#e8305c'
PAL['R'] = '#a81c48'


def draw():
    g = blank()
    # 夜空底（單色，maskable 放大置中時四周不會有接縫）+ 幾顆小星點
    for y in range(H):
        for x in range(W):
            g[y][x] = 'n'
    for (x, y) in [(3, 3), (5, 24), (29, 21), (14, 2), (2, 14), (30, 30), (1, 29)]:
        g[y][x] = 's'

    # 腳（先畫，讓圓臉壓在上面）
    paste(g, FOOT, 5, 25)
    paste(g, FOOT, 20, 25)

    # 圓臉本體
    ellipse(g, 16.0, 15.5, 12.6, 12.2, fill='p', edge='k', shade='P', hi='l')

    # 腮紅 → 眼睛 → 嘴
    paste(g, BLUSH, 6, 17)
    paste(g, BLUSH, 20, 17)
    paste(g, EYE, 11, 9)
    paste(g, EYE, 17, 9)
    paste(g, MOUTH, 13, 20)

    # 右上角星星
    paste(g, STAR, 24, 1)
    return g


def to_image(grid):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = img.load()
    for y in range(H):
        for x in range(W):
            hexc = PAL[grid[y][x]] or PAL['n']
            r = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
            px[x, y] = (r[0], r[1], r[2], 255)
    return img


def save(base, size, art_size, path):
    """把 32×32 原圖以最近鄰放大到 art_size，置中貼在 size×size 的不透明底上"""
    canvas = Image.new('RGBA', (size, size), _rgb(PAL['n']))
    art = base.resize((art_size, art_size), Image.NEAREST)
    off = ((size - art_size) // 2, (size - art_size) // 2)
    canvas.paste(art, off)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)
    print('written', path.relative_to(ROOT), f'{size}x{size} (art {art_size})')


def _rgb(hexc):
    return (int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16), 255)


def main():
    base = to_image(draw())
    save(base, 192, 192, OUT / 'icon-192.png')                 # 32×6
    save(base, 512, 512, OUT / 'icon-512.png')                 # 32×16
    save(base, 180, 160, OUT / 'icon-180.png')                 # apple-touch（不透明、留白）
    save(base, 512, 320, OUT / 'icon-maskable-512.png')        # maskable：內縮 18.75%（安全區）


if __name__ == '__main__':
    main()
