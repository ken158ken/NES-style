# -*- coding: utf-8 -*-
"""版本戳：把 game.html / star.html / cruiser.html 內每個 <script src="x.js"> 改成 x.js?v=<內容 sha1 前 8 碼>，
瀏覽器 / GitHub Pages 快取（max-age 600）就不會再讓玩家拿到舊 JS。部署前跑一次（總控 commit 前）。
  ../卡比之星/.venv/bin/python tools/stamp.py [--check]
"""
import hashlib, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['game.html', 'star.html', 'cruiser.html']
check = '--check' in sys.argv
changed = 0
for name in PAGES:
    p = ROOT / name
    if not p.exists():
        continue
    html = p.read_text(encoding='utf-8')
    def stamp(m):
        src = m.group(1).split('?')[0]
        f = ROOT / src
        if not f.exists():
            return m.group(0)
        h = hashlib.sha1(f.read_bytes()).hexdigest()[:8]
        return '<script src="%s?v=%s"></script>' % (src, h)
    out = re.sub(r'<script src="([^"]+)"></script>', stamp, html)
    if out != html:
        changed += 1
        if check:
            print('STALE', name)
        else:
            p.write_text(out, encoding='utf-8'); print('stamped', name)
print('stamp: %d 頁需要更新' % changed if check else 'stamp: done')
sys.exit(1 if (check and changed) else 0)
