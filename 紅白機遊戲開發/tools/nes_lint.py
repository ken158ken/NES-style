# -*- coding: utf-8 -*-
"""nes_lint.py — 掃 PNG 截圖，逐像素驗「原汁原味」的畫面限制。

驗什麼（來源：docs/research/01_硬體規格與限制.md §3.1/§3.4、05_美術與像素規範.md §1）：
  1. 每個像素的顏色都必須在 **NES 64 色系統調色盤**內。
  2. 去重後的同屏色數 <= 25（4 組背景 + 4 組精靈調色盤，各 3 色 + 1 共用底色）。
  3. 截圖若是整數放大 N 倍，每個 N×N 方塊必須完全同色（抓到縮放平滑 / 非整數倍放大）。
  4. 可選 --status-rows N：把上方 N 條掃描線當狀態列分區，狀態列與遊戲區各自算色數
     （分割捲動時兩區可以各用一套調色盤，但仍共用 25 色上限）。

用法：
  python tools/nes_lint.py shots/agent_x/foo.png
  python tools/nes_lint.py shots/*.png --scale 3 --crop 10,20,768,672 --status-rows 32
  python tools/nes_lint.py foo.png --json out.json      # --json - 表示印到 stdout

exit code：0 全過｜1 有違規｜2 參數 / 檔案錯誤｜3 內建調色盤與 engine/palette.js 不一致
"""
import argparse
import json
import os
import re
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print('需要 pillow：請用 ../卡比之星/.venv/bin/python 執行', file=sys.stderr)
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALETTE_JS = os.path.join(ROOT, 'engine', 'palette.js')

NES_W, NES_H = 256, 240
VISIBLE_H = 224           # NTSC 電視實際可見（上下各裁 8 條）
MAX_COLORS = 25

# NES 64 色系統調色盤（工作用 RGB 近似值）
# 來源：ROM Detectives Wiki — NES Palette，整理於 docs/research/01_硬體規格與限制.md §3.4。
# 注意：$0D 為禁用色（訊號比黑更黑），$0E/$0F/$1E/$1F/$2E/$2F/$3E/$3F 皆為黑。
# 這張表必須與 engine/palette.js 的 NES.PALETTE 完全一致（下方 load_palette_js 會檢查）。
PALETTE_HEX = [
    '7C7C7C', '0000FC', '0000BC', '4428BC', '940084', 'A80020', 'A81000', '881400',
    '503000', '007800', '006800', '005800', '004058', '000000', '000000', '000000',
    'BCBCBC', '0078F8', '0058F8', '6844FC', 'D800CC', 'E40058', 'F83800', 'E45C10',
    'AC7C00', '00B800', '00A800', '00A844', '008888', '000000', '000000', '000000',
    'F8F8F8', '3CBCFC', '6888FC', '9878F8', 'F878F8', 'F85898', 'F87858', 'FCA044',
    'F8B800', 'B8F818', '58D854', '58F898', '00E8D8', '787878', '000000', '000000',
    'FCFCFC', 'A4E4FC', 'B8B8F8', 'D8B8F8', 'F8B8F8', 'F8A4C0', 'F0D0B0', 'FCE0A8',
    'F8D878', 'D8F878', 'B8F8B8', 'B8F8D8', '00FCFC', 'F8D8F8', '000000', '000000',
]
assert len(PALETTE_HEX) == 64
FORBIDDEN = [0x0D]

PALETTE = [(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) for h in PALETTE_HEX]
PALETTE_SET = set(PALETTE)


VERBOSE = [False]


def hexs(rgb):
    return '#%02X%02X%02X' % rgb


def load_palette_js(path):
    """從 engine/palette.js 解析 64 色表；回傳 (list|None, 說明字串)。"""
    if not os.path.exists(path):
        return None, 'engine/palette.js 尚未存在（ppu agent 負責），只用內建表'
    try:
        src = open(path, encoding='utf-8').read()
    except OSError as e:
        return None, '讀取 palette.js 失敗：%s' % e
    # 先找 '#RRGGBB' / "0xRRGGBB"，再找 [r, g, b]
    hexes = re.findall(r"['\"]#?([0-9A-Fa-f]{6})['\"]", src)
    hexes += re.findall(r"0x([0-9A-Fa-f]{6})\b", src)
    if len(hexes) >= 64:
        return [(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) for h in hexes[:64]], 'palette.js（hex 字面）'
    triples = re.findall(r"\[\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\]", src)
    if len(triples) >= 64:
        return [tuple(int(x) for x in t) for t in triples[:64]], 'palette.js（[r,g,b] 陣列）'
    return None, 'palette.js 解析不到 64 個色值，只用內建表'


def check_palette_consistency(path):
    """內建表 vs palette.js 一致性檢查。回傳 (ok, 訊息, diff list)。"""
    js, note = load_palette_js(path)
    if js is None:
        return True, note, []
    diff = [{'index': i, 'builtin': hexs(PALETTE[i]), 'js': hexs(js[i])}
            for i in range(64) if tuple(js[i]) != PALETTE[i]]
    if diff:
        return False, '內建 64 色表與 %s 不一致（%d 格不同）' % (note, len(diff)), diff
    return True, '內建 64 色表與 %s 一致（64/64）' % note, []


def parse_crop(s):
    try:
        x, y, w, h = [int(v) for v in s.split(',')]
    except Exception:
        raise argparse.ArgumentTypeError('--crop 格式應為 x,y,w,h')
    if w <= 0 or h <= 0:
        raise argparse.ArgumentTypeError('--crop 的 w/h 必須 > 0')
    return (x, y, w, h)


def detect_scale(w, h):
    """猜整數放大倍率：寬度必須是 256 的倍數，高度是 240 或 224 的同倍率。"""
    if w % NES_W:
        return 0
    s = w // NES_W
    if s < 1:
        return 0
    for base in (NES_H, VISIBLE_H):
        if h == base * s:
            return s
    if h % s == 0:
        return s
    return 0


def downscale(px, w, h, s, check_uniform):
    """整數縮小 s 倍（取左上角像素），順便驗每個 s×s 方塊是否同色。"""
    ow, oh = w // s, h // s
    out = [None] * (ow * oh)
    smeared = 0
    first_bad = None
    for oy in range(oh):
        for ox in range(ow):
            c = px[oy * s * w + ox * s]
            out[oy * ow + ox] = c
            if check_uniform and s > 1:
                for dy in range(s):
                    row = (oy * s + dy) * w + ox * s
                    for dx in range(s):
                        if px[row + dx] != c:
                            smeared += 1
                            if first_bad is None:
                                first_bad = (ox, oy, hexs(c), hexs(px[row + dx]))
                            dy = s
                            break
                    else:
                        continue
                    break
    return out, ow, oh, smeared, first_bad


def region_stats(px, w, y0, y1):
    counts = {}
    for i in range(y0 * w, y1 * w):
        c = px[i]
        counts[c] = counts.get(c, 0) + 1
    return counts


def lint_image(path, args):
    res = {'file': path, 'ok': False, 'errors': [], 'warnings': []}
    try:
        im = Image.open(path)
    except Exception as e:
        res['errors'].append('開檔失敗：%s' % e)
        res['fatal'] = True
        return res
    if args.crop:
        x, y, w, h = args.crop
        im = im.crop((x, y, x + w, y + h))
    im = im.convert('RGB')
    w, h = im.size
    res['size'] = [w, h]

    scale = args.scale
    if scale == 0:
        scale = detect_scale(w, h)
        if scale == 0:
            res['errors'].append('無法自動判斷放大倍率（尺寸 %dx%d 不是 256×N）；請給 --scale / --crop' % (w, h))
            res['fatal'] = True
            return res
    if w % scale or h % scale:
        res['errors'].append('尺寸 %dx%d 無法被 --scale %d 整除' % (w, h, scale))
        res['fatal'] = True
        return res
    res['scale'] = scale

    raw = im.tobytes()
    px = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
    px, nw, nh, smeared, first_bad = downscale(px, w, h, scale, not args.no_check_scale)
    res['native'] = [nw, nh]
    if smeared:
        res['errors'].append('放大不是「整數倍 + 無平滑」：%d 個 %d×%d 方塊內有雜色（例：磁磚座標 %s）'
                             % (smeared, scale, scale, first_bad and str(first_bad[:2])))
    if nw != NES_W:
        res['warnings'].append('原生寬度 %d != 256' % nw)
    if nh not in (NES_H, VISIBLE_H):
        res['warnings'].append('原生高度 %d 不是 240 / 224' % nh)

    counts = region_stats(px, nw, 0, nh)
    colors = sorted(counts.keys(), key=lambda c: -counts[c])
    bad = [c for c in colors if c not in PALETTE_SET]
    bad_pixels = sum(counts[c] for c in bad)
    res['colors'] = len(colors)
    res['colorList'] = [hexs(c) for c in colors]
    res['badColors'] = [hexs(c) for c in bad]
    res['badPixels'] = bad_pixels
    res['maxColors'] = args.max_colors

    if bad:
        res['errors'].append('有 %d 個像素、%d 種顏色不在 NES 64 色表內：%s'
                             % (bad_pixels, len(bad), ' '.join(hexs(c) for c in bad[:8])))
    if len(colors) > args.max_colors:
        res['errors'].append('同屏色數 %d > %d' % (len(colors), args.max_colors))

    # 使用到的禁用色（$0D）
    forb = [i for i in FORBIDDEN if PALETTE[i] in counts]
    if forb:
        # $0D 與 $1D 同為 #000000，無法從像素分辨 → 只提醒
        # 截圖只有 RGB，$0D 與 $1D 同為黑無法分辨 → 只是提醒，預設不印（-v 才印）
        res['notes'] = res.get('notes', []) + [
            '畫面含與禁用色 %s 相同的 RGB；$0D 與 $1D 同為黑，截圖層分不出來，'
            '請靠 engine/nes_lint.js 的 ppu.indexFrame 檢查'
            % ','.join('$%02X' % i for i in forb)]

    if args.status_rows:
        n = min(args.status_rows, nh)
        top = region_stats(px, nw, 0, n)
        bot = region_stats(px, nw, n, nh)
        res['regions'] = {
            'status': {'rows': [0, n], 'colors': len(top), 'colorList': [hexs(c) for c in top]},
            'play': {'rows': [n, nh], 'colors': len(bot), 'colorList': [hexs(c) for c in bot]},
        }
        for key, r in res['regions'].items():
            if r['colors'] > args.max_colors:
                res['errors'].append('%s 區色數 %d > %d' % (key, r['colors'], args.max_colors))

    res['ok'] = not res['errors']
    return res


def human(res):
    tag = 'PASS' if res['ok'] else 'FAIL'
    lines = ['[%s] %s' % (tag, res['file'])]
    if 'size' in res:
        lines.append('      尺寸 %dx%d｜放大 %s 倍 → 原生 %s｜色數 %s/%s｜非法像素 %s'
                     % (res['size'][0], res['size'][1], res.get('scale', '?'),
                        'x'.join(str(v) for v in res.get('native', [])) or '?',
                        res.get('colors', '?'), res.get('maxColors', '?'), res.get('badPixels', '?')))
    if res.get('regions'):
        r = res['regions']
        lines.append('      分區：狀態列 %d 色（列 %d-%d）／遊戲區 %d 色（列 %d-%d）'
                     % (r['status']['colors'], r['status']['rows'][0], r['status']['rows'][1],
                        r['play']['colors'], r['play']['rows'][0], r['play']['rows'][1]))
    if res.get('colorList') and len(res['colorList']) <= 32:
        lines.append('      用色：' + ' '.join(res['colorList']))
    for e in res['errors']:
        lines.append('      ✗ ' + e)
    for wmsg in res['warnings']:
        lines.append('      ! ' + wmsg)
    if VERBOSE[0]:
        for note in res.get('notes', []):
            lines.append('      · ' + note)
    return '\n'.join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description='NES 截圖逐像素 lint（64 色 / <=25 色 / 整數放大）')
    ap.add_argument('images', nargs='+', help='PNG 檔案路徑')
    ap.add_argument('--scale', type=int, default=0, help='整數放大倍率；0 = 自動偵測（預設）')
    ap.add_argument('--crop', type=parse_crop, default=None, help='先裁切 x,y,w,h（去掉瀏覽器邊框）')
    ap.add_argument('--status-rows', type=int, default=0, help='上方 N 條掃描線視為狀態列，分區統計')
    ap.add_argument('--max-colors', type=int, default=MAX_COLORS, help='同屏色數上限（預設 25）')
    ap.add_argument('--no-check-scale', action='store_true', help='不驗放大方塊是否同色')
    ap.add_argument('--palette', default=PALETTE_JS, help='engine/palette.js 路徑（一致性檢查）')
    ap.add_argument('--json', default=None, help='JSON 輸出路徑；- 表示 stdout')
    ap.add_argument('-v', '--verbose', action='store_true', help='連提醒事項一起印')
    args = ap.parse_args(argv)
    VERBOSE[0] = args.verbose

    ok_pal, pal_msg, pal_diff = check_palette_consistency(args.palette)
    print('調色盤：' + pal_msg)

    results = [lint_image(p, args) for p in args.images]
    for r in results:
        print(human(r))

    n_fail = sum(0 if r['ok'] else 1 for r in results)
    n_fatal = sum(1 for r in results if r.get('fatal'))
    out = {
        'ok': ok_pal and n_fail == 0,
        'paletteConsistent': ok_pal,
        'paletteNote': pal_msg,
        'paletteDiff': pal_diff,
        'total': len(results),
        'failed': n_fail,
        'results': results,
    }
    if args.json:
        if args.json == '-':
            print(json.dumps(out, ensure_ascii=False, indent=2))
        else:
            os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
            with open(args.json, 'w', encoding='utf-8') as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
            print('JSON 已寫入 %s' % args.json)

    print('總計 %d 張，%d 張違規%s' % (len(results), n_fail, '（含 %d 張讀不了）' % n_fatal if n_fatal else ''))
    if not ok_pal:
        return 3
    if n_fatal:
        return 2
    return 1 if n_fail else 0


if __name__ == '__main__':
    sys.exit(main())
