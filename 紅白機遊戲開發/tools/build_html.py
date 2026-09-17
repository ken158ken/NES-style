# -*- coding: utf-8 -*-
"""把 docs/research/**/*.md 編譯成單頁 index.html（離線可開、左側目錄、可搜尋）。
用法：python tools/build_html.py   （需 markdown 套件：../卡比之星/.venv/bin/python）"""
import pathlib, re, html, datetime
import markdown
ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / 'docs' / 'research'
files = sorted([p for p in RES.rglob('*.md')], key=lambda p: str(p.relative_to(RES)))
md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists'])
sections, nav = [], []
for i, p in enumerate(files):
    rel = str(p.relative_to(RES))
    text = p.read_text(encoding='utf-8')
    md.reset()
    body = md.convert(text)
    m = re.search(r'^#\s+(.+)$', text, re.M)
    title = m.group(1).strip() if m else p.stem
    sid = 'sec%02d' % i
    nav.append('<a href="#%s">%s</a>' % (sid, html.escape(title)))
    sections.append('<section id="%s"><div class="path">%s</div>%s</section>' % (sid, html.escape(rel), body))
page = '''<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>紅白機遊戲開發 研究總覽</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#0f1220;--panel:#181c2e;--fg:#e8ecf8;--muted:#98a2c0;--acc:#ffd85c;--line:#2a3050}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 "Noto Sans CJK TC","Microsoft JhengHei",sans-serif;display:flex}
nav{width:280px;flex:none;position:sticky;top:0;height:100vh;overflow:auto;background:var(--panel);border-right:1px solid var(--line);padding:16px}
nav h1{font-size:16px;color:var(--acc);margin:0 0 8px}nav a{display:block;color:var(--muted);text-decoration:none;padding:4px 6px;border-radius:4px;font-size:13px}
nav a:hover{background:#242a44;color:var(--fg)}nav input{width:100%;box-sizing:border-box;margin:8px 0;padding:6px;background:#0f1220;color:var(--fg);border:1px solid var(--line);border-radius:4px}
main{flex:1;min-width:0;padding:24px 40px;max-width:1100px}
section{border-bottom:1px solid var(--line);padding-bottom:32px;margin-bottom:32px}.path{color:var(--muted);font-size:12px;margin-bottom:8px}
h1,h2,h3{color:var(--acc)}h1{font-size:26px}h2{font-size:20px;margin-top:32px}h3{font-size:16px}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:4px 8px;vertical-align:top}th{background:#242a44}
code{background:#242a44;padding:1px 4px;border-radius:3px;font-size:13px}pre{background:#0b0e1a;padding:12px;overflow:auto;border-radius:6px}
a{color:#8cd0ff}blockquote{border-left:3px solid var(--acc);margin:0;padding:4px 12px;color:var(--muted)}
mark{background:#ffd85c;color:#000}
@media(max-width:800px){body{display:block}nav{position:static;width:auto;height:auto}main{padding:16px}}
</style></head><body>
<nav><h1>紅白機遊戲開發 研究總覽</h1><div style="font-size:12px;color:var(--muted)">編譯：@@DATE@@　文件：@@N@@ 份</div>
<input id="q" placeholder="搜尋（Enter 標示）"><div id="nav">@@NAV@@</div></nav>
<main>@@MAIN@@</main>
<script>
const q=document.getElementById('q');q.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const t=q.value.trim();document.querySelectorAll('mark').forEach(m=>m.replaceWith(m.textContent));if(!t)return;
const w=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);let first=null;
for(const n of nodes){const i=n.nodeValue.indexOf(t);if(i<0)continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+t.length);const m=document.createElement('mark');r.surroundContents(m);if(!first)first=m;}
if(first)first.scrollIntoView({block:'center'});});
</script></body></html>'''
page = page.replace('@@DATE@@', datetime.datetime.now().strftime('%Y-%m-%d %H:%M')).replace('@@N@@', str(len(files))).replace('@@NAV@@', '\n'.join(nav)).replace('@@MAIN@@', '\n'.join(sections))
(ROOT / 'index.html').write_text(page, encoding='utf-8')
print('written index.html', len(page)//1024, 'KB from', len(files), 'files')
