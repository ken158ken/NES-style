# -*- coding: utf-8 -*-
"""單檔打包：把 game.html 裡的 <script src> 全部內嵌成 dist/星塵勇者.html（可直接雙擊遊玩）。

用法：
  ../卡比之星/.venv/bin/python tools/build.py [--out dist/星塵勇者.html] [--check]

行為：
  - 依 game.html 的載入順序（engine 契約順序 → games/**）逐檔內嵌，保持順序不變。
  - 缺檔（R1 平行開發期間常見）不中斷：改寫成註解並列在結尾報告。
  - games/ 底下有但 game.html 沒列到的 *.js 會自動補在最後一個 games 腳本之後（並提示要補進 game.html）。
  - </script 會被跳脫成 <\\/script，避免提前關閉標籤。
  - --check 只檢查不寫檔（給 tools/run_all.sh 用）；缺 engine 檔時 exit 1。
"""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'game.html'
# 契約載入順序（build 會驗證 game.html 是否照這個順序列出 engine 檔）
ENGINE_ORDER = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js',
                'ppu.js', 'nes_lint.js', 'apu.js', 'music.js', 'nes.js']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='dist/星塵勇者.html')
    ap.add_argument('--check', action='store_true', help='只檢查不寫檔')
    a = ap.parse_args()

    html = SRC.read_text(encoding='utf-8')
    found, missing, order = [], [], []

    def inline(m):
        src = m.group(1)
        p = ROOT / src
        if not p.exists():
            missing.append(src)
            return '<!-- 缺檔（未內嵌）：%s -->' % src
        js = p.read_text(encoding='utf-8').replace('</script', r'<\/script')
        found.append(src)
        if src.startswith('engine/'):
            order.append(pathlib.PurePosixPath(src).name)
        return '<script>/* %s */\n%s\n</script>' % (src, js)

    out_html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

    # --- games/ 底下漏列的檔案自動補上 ---
    listed = set(found) | set(missing)
    extra = sorted(str(p.relative_to(ROOT)).replace('\\', '/')
                   for p in (ROOT / 'games').rglob('*.js')) if (ROOT / 'games').exists() else []
    extra = [s for s in extra if s not in listed]
    if extra:
        blocks = []
        for src in extra:
            js = (ROOT / src).read_text(encoding='utf-8').replace('</script', r'<\/script')
            blocks.append('<script>/* %s（game.html 未列，build 自動補） */\n%s\n</script>' % (src, js))
            found.append(src)
        anchor = '<script>\n// ---- 啟動'
        if anchor in out_html:
            out_html = out_html.replace(anchor, '\n'.join(blocks) + '\n' + anchor, 1)
        else:
            out_html = out_html.replace('</body>', '\n'.join(blocks) + '\n</body>', 1)

    # --- 載入順序檢查 ---
    expect = [n for n in ENGINE_ORDER if n in order]
    order_ok = order == expect
    if not order_ok:
        print('WARN game.html 的 engine 載入順序與契約不符：')
        print('  實際:', ' → '.join(order))
        print('  契約:', ' → '.join(expect))

    miss_engine = [m for m in missing if m.startswith('engine/')]
    print('內嵌 %d 檔；缺 %d 檔' % (len(found), len(missing)))
    for m in missing:
        print('  缺檔:', m)
    if extra:
        print('自動補上（建議加進 game.html）:', ', '.join(extra))

    if a.check:
        ok = order_ok and not miss_engine
        print('build --check:', 'PASS' if ok else 'FAIL')
        sys.exit(0 if ok else 1)

    out = pathlib.Path(a.out)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(out_html, encoding='utf-8')
    print('written', out, '%d KB' % (len(out_html.encode('utf-8')) // 1024))
    if miss_engine:
        print('注意：缺少 engine 檔 %s ⇒ dist 會以 stub 執行' % ', '.join(miss_engine))


if __name__ == '__main__':
    main()
