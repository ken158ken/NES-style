# -*- coding: utf-8 -*-
"""卡帶五中文文字系統 CT.Text（games/cart5/text.js + glyphs.js + tools/cjk_glyphs.py）自動驗證（R9 C9-0）。

重點：字形與 Noto 點陣逐位元一致（離線資料 + 執行期寫進 CHR 的像素）、半形 95 字、工具 --check / 掃描約定、
      動態上傳每幀 ≤ 預算（逐幀量 budget.used、T.stats().bytes、strict 模式不 throw）、讓出遊戲已用的預算、
      對話框（框線 / 名牌 / 逐字 / ▼ 翻頁 / ■ 結束 / A 加速 / 翻頁 / 關閉）、選單（游標 / ↑↓ / A / B / 超寬 throw）、
      捲動文字、半形全形混排（寬度 / 斷行 / 避頭 / 英文整字 / 半形置中）、分頁不截斷且不超過池容量、
      2000 字長文逐頁播完（畫面讀回 = 原文、LRU 有回收、overflow 0、缺字 0、overFrames 0）、textdemo 只在 ?game=textdemo 註冊。
作法：Playwright 開 `cart5.html?game=textdemo&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.TextDemo` / `CT.Text`。

用法：../卡比之星/.venv/bin/python games/cart5/test_text.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import pathlib
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import cjk_glyphs  # noqa: E402

PAGE = (ROOT / 'cart5.html').as_uri()
BASE = PAGE + '?debug=1&scale=1&mute=1&game=textdemo'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


# ============================================================ 離線：字形資料與工具
def offline():
    src = (ROOT / 'games/cart5/glyphs.js').read_text(encoding='utf-8')
    m = re.search(r'/\*JSON\*/(.*?)/\*END\*/', src, re.S)
    ok('glyphs.js 有 JSON 區段', m)
    d = json.loads(m.group(1))
    cjk, asc = d['cjk'], d['ascii']
    ok('glyphs.js 規格字串 = 工具目前規格', d.get('spec') == cjk_glyphs.SPEC, d.get('spec'))
    bad = [ch for ch, h in cjk.items() if h != cjk_glyphs.glyph_hex(ch)]
    ok('全形字 %d 個與 Noto 點陣逐位元一致' % len(cjk), not bad and len(cjk) > 300, ''.join(bad[:20]))
    ok('全形字每字 64 位十六進位', all(len(h) == 64 and re.fullmatch('[0-9a-f]+', h) for h in cjk.values()))
    ok('半形字 0x20~0x7E 共 95 個', sorted(asc) == [chr(c) for c in range(0x20, 0x7F)], len(asc))
    ok('半形字與工具內原創字型一致', all(asc[c] == cjk_glyphs.ascii_hex(c) for c in asc))
    up = [c for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
    ok('半形大寫 / 數字字身在第 0~6 列（第 7 列留白）', all(asc[c][14:16] == '00' for c in up))
    ok('半形 g j p q y 用到第 7 列下伸部', all(asc[c][14:16] != '00' for c in 'gjpqy'))
    # 字身範圍：15px ⇒ 右邊一欄留空當字距（絕大多數字）、沒有字超出 16 列（工具上移不裁切）
    rows_used = [cjk_glyphs.render(ch) for ch in list(cjk)[:200]]
    ok('15px 字身：右側第 16 欄留空（字距）≥ 95%', sum(1 for r in rows_used if not any(v & 1 for v in r)) >= 190)
    ok('ALWAYS 符號都收了（▼▶■□…全形空白）', all(c in cjk for c in cjk_glyphs.ALWAYS))
    # 工具 --check
    r = subprocess.run([sys.executable, str(ROOT / 'tools/cjk_glyphs.py'), '--check'], capture_output=True, text=True)
    ok('cjk_glyphs.py --check 通過（沒有缺字 / 多字）', r.returncode == 0, r.stdout.strip()[-120:])
    # 掃描約定：字串常值收、註解不收、正規式不誤判
    ss = cjk_glyphs.js_strings("var a = '甲乙'; // 丙丁\n/* 戊 */ var b = \"己\" + `庚${x}辛`; var r = /壬/g; var c = 1 / 2; var d = '癸';")
    got = set(''.join(''.join(cjk_glyphs.wanted_chars(s)) for s in ss))
    ok('掃描：字串常值與模板字串收進來', set('甲乙己庚辛癸') <= got, got)
    ok('掃描：註解 / 正規式不收', not (set('丙丁戊壬') & got), got)
    ok('掃描：\\u 跳脫解開', cjk_glyphs.wanted_chars('\\u661f') == ['星'])
    chars, per = cjk_glyphs.scan()
    ok('掃描範圍含 textdemo 文字檔', any('textdemo/text_demo.js' in k for k in per))
    ok('glyphs.js 不掃自己', not any(k.endswith('glyphs.js') for k in per))
    return cjk, asc


# ============================================================ 瀏覽器
def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Text && !!CT.TextDemo && !!CT.TextDemo.dev || (CT.get && CT.get("textdemo"))')
    page.evaluate('() => { __nes.step(1); }')


def step(page, n=1):
    page.evaluate('(n) => __nes.step(n)', n)


def press(page, mask, n=1):
    page.evaluate('([m, n]) => { NES.Input.inject(m, n); __nes.step(n); NES.Input.inject(0, 1); __nes.step(1); }', [mask, n])


DEV = "CT.get('textdemo').dev"

# 逐幀推進直到條件成立；同時記每幀預算（budget.used）與 T.stats().bytes 峰值
RUN_UNTIL = """([cond, maxF, pressA]) => {
  const G = CT.get('textdemo').dev, nes = __nes.nes(), bud = nes.timing.budget;
  const f = new Function('G', 'return (' + cond + ');');
  let peak = 0, tpeak = 0, over = 0, frames = 0, aPress = 0, waitT = 0;
  for (let i = 0; i < maxF; i++) {
    if (f(G)) break;
    let m = 0;
    const bs = G.box.state();
    if (pressA && (bs.phase === 'wait' || bs.phase === 'end')) { if (++waitT >= 13) { m = 1; waitT = 0; aPress++; } } else waitT = 0;
    NES.Input.inject(m, 1);
    __nes.step(1);
    frames++;
    const u = bud.used; if (u > peak) peak = u; if (u > bud.limit) over++;
    const tb = G.T.stats().bytes; if (tb > tpeak) tpeak = tb;
  }
  NES.Input.inject(0, 1);
  return { frames, peak, tpeak, over, overFrames: bud.overFrames, aPress, done: f(G) };
}"""


def run_until(page, cond, max_frames=20000, press_a=False):
    return page.evaluate(RUN_UNTIL, [cond, max_frames, press_a])


GLYPH_AT = """([col, row]) => {
  // 從 PPU 名稱表 + 圖樣表讀回 (col,row) 起 2×2 格的 16×16 點陣（色 3 = 1）
  const p = __nes.nes().ppu, bits = [];
  for (let y = 0; y < 16; y++) {
    let v = 0;
    for (let x = 0; x < 16; x++) {
      const t = p.getTile(0, col + (x >> 3), row + (y >> 3));
      const px = NES.CHR.get(0, t)[(y & 7) * 8 + (x & 7)];
      if (px === 3) v |= 1 << (15 - x);
    }
    bits.push(v);
  }
  return bits;
}"""

ASCII_AT = """([col, row]) => {
  const p = __nes.nes().ppu, bits = [];
  for (let y = 0; y < 16; y++) {
    let v = 0;
    for (let x = 0; x < 8; x++) {
      const t = p.getTile(0, col, row + (y >> 3));
      if (NES.CHR.get(0, t)[(y & 7) * 8 + x] === 3) v |= 1 << (7 - x);
    }
    bits.push(v);
  }
  return bits;
}"""


def browser(cjk, asc):
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))

        # ---- 註冊條件
        page.goto(PAGE + '?debug=1&scale=1&mute=1')
        page.wait_for_function('() => !!window.__nes && !!window.CT')
        ok('textdemo 不帶 ?game=textdemo 時不註冊（正式選單看不到）', page.evaluate("() => !CT.get('textdemo')"))
        ok('CT.Text / CT.GLYPHS 在 cart5.html 載入', page.evaluate("() => !!CT.Text && !!CT.GLYPHS && CT.GLYPHS.count > 300"))
        ok('glyphs.js / text.js 排在 cart5:games 標記最前面',
           page.evaluate("""() => { const s = [...document.scripts].map(x => x.getAttribute('src') || '');
              const i = s.indexOf('games/cart5/glyphs.js'), j = s.indexOf('games/cart5/text.js');
              const reg = s.indexOf('games/cart1/registry.js'); const others = s.filter(x => /games\\/cart5\\/(?!glyphs|text\\.js|cart\\.js)/.test(x)).map(x => s.indexOf(x));
              return reg < i && i < j && others.every(k => k > j); }"""))

        fresh(page)
        ok('textdemo 已註冊、id / title', page.evaluate("() => CT.get('textdemo').title === '文字示範'"))

        # ---- 預留磁磚 / 框線
        info = page.evaluate("""() => { const G = CT.get('textdemo').dev; return { pool: G.T.poolSize, n: G.bank.tiles.length,
          frame: CT.Text.FRAME_NAMES.length, tiles: Object.keys(G.T.tile) }; }""")
        ok('reserve：字形池 208 磚 + 框線 12 磚、bank ≤ 256', info['pool'] == 208 and info['frame'] == 12 and info['n'] <= 256, info)

        # ---- 對話框第一頁：打字機 + 名牌 + 框
        r = run_until(page, "G.box.state().phase === 'wait'", 600)
        ok('第一頁逐字寫完進入 wait（%d 幀）' % r['frames'], r['done'] and r['frames'] > 20, r)
        ok('打字期間每幀 VBlank ≤ 160（峰值 %d）' % r['peak'], r['peak'] <= 160 and r['over'] == 0, r)
        ok('文字系統每幀 ≤ maxBytes 136（峰值 %d）' % r['tpeak'], r['tpeak'] <= 136, r)
        bs = page.evaluate('() => %s.box.state()' % DEV)
        screen = page.evaluate("""() => { const T = CT.get('textdemo').dev.T, b = CT.get('textdemo').dev.box;
           const out = []; for (let i = 0; i < b.lines; i++) out.push(T.readLine(b.tx, b.ty + i * b.pitch, b.cols)); return out; }""")
        ok('畫面讀回 = 本頁文字', screen[:len(bs['lines'])] == bs['lines'], (screen, bs['lines']))
        ok('名牌「星燈」畫在框左上（第 y-2 列）', page.evaluate("() => { const T = CT.get('textdemo').dev.T; return T.readLine(4, 18, 6) === '星燈'; }"))
        frame_ok = page.evaluate("""() => { const G = CT.get('textdemo').dev, p = __nes.nes().ppu, t = G.T.tile, b = G.box;
           return p.getTile(0, b.x, b.y) === t.TL && p.getTile(0, b.x + b.w - 1, b.y + b.h - 1) === t.BR &&
             p.getTile(0, b.x + 5, b.y + b.h - 1) === t.H && p.getTile(0, b.x, b.y + 3) === t.V && p.getTile(0, 2, b.y) === t.J; }""")
        ok('框線四角 / 邊 / 名牌接點磁磚正確', frame_ok)
        # 執行期寫進 CHR 的像素 = Noto 點陣（本頁每個全形字）
        cells = page.evaluate("""() => { const G = CT.get('textdemo').dev, b = G.box, T = G.T, out = [];
           for (let i = 0; i < b.lines; i++) { let c = b.tx; const s = (b.pages[b.page] || [])[i] || '';
             for (const ch of s) { out.push([ch, c, b.ty + i * b.pitch]); c += CT.Text.widthOf(ch); } } return out; }""")
        bad = []
        for ch, c, rr in cells:
            if ch in ' 　':
                continue
            if ord(ch) <= 0x7E:
                got = page.evaluate(ASCII_AT, [c, rr])
                want = [0] * 4 + [int(asc[ch][k * 2:k * 2 + 2], 16) for k in range(8)] + [0] * 4
            else:
                got = page.evaluate(GLYPH_AT, [c, rr])
                want = cjk_glyphs.render(ch)
            if got != want:
                bad.append(ch)
        ok('執行期 CHR 像素與 Noto 點陣逐位元一致（本頁 %d 字）' % len(cells), not bad and len(cells) > 10, ''.join(bad))
        nxt = page.evaluate("""() => { const G = CT.get('textdemo').dev, p = __nes.nes().ppu, b = G.box, t = G.T.tile, seen = new Set();
           for (let i = 0; i < 40; i++) { __nes.step(1); seen.add(p.getTile(0, b.x + b.w - 2, b.y + b.h - 2)); }
           return [seen.has(t.NEXT), seen.has(t.BLANK)]; }""")
        ok('wait 時右下角 ▼ 閃爍（NEXT ↔ 空白）', nxt == [True, True], nxt)

        # ---- A 翻頁 + A 加速
        press(page, A)
        bs2 = page.evaluate('() => %s.box.state()' % DEV)
        ok('wait 按 A → 翻到第 2 頁', bs2['page'] == 1 and bs2['phase'] in ('clear', 'type'), bs2)
        step(page, 4)
        press(page, A)          # 打字中按 A = 這頁立刻寫完（仍照預算）
        r2 = run_until(page, "G.box.state().phase === 'wait' || G.box.state().phase === 'end'", 200)
        ok('打字中按 A 加速：%d 幀內寫完' % r2['frames'], r2['done'] and r2['frames'] <= 40, r2)
        ok('加速時每幀仍 ≤ 160（峰值 %d）' % r2['peak'], r2['peak'] <= 160 and r2['over'] == 0, r2)

        # ---- 播到底：■ 結束 + 關閉 → 選單
        r3 = run_until(page, "G.box.state().phase === 'end'", 3000, press_a=True)
        ok('播到最後一頁 phase=end', r3['done'], r3)
        endseen = page.evaluate("""() => { const G = CT.get('textdemo').dev, p = __nes.nes().ppu, b = G.box, t = G.T.tile, seen = new Set();
           for (let i = 0; i < 40; i++) { __nes.step(1); seen.add(p.getTile(0, b.x + b.w - 2, b.y + b.h - 2)); } return seen.has(t.END); }""")
        ok('最後一頁右下角是 ■（END）', endseen)
        press(page, A)
        step(page, 2)
        st = page.evaluate("() => { const G = CT.get('textdemo').dev; return { mode: G.mode, menu: G.menu && G.menu.state() }; }")
        ok('最後一頁按 A → onClose → 開選單', st['mode'] == 'menu' and st['menu'] is not None, st)

        # ---- 選單
        r4 = run_until(page, "G.menu && G.menu.state().phase === 'open'", 200)
        ok('選單在 %d 幀內畫完（預算內）' % r4['frames'], r4['done'] and r4['over'] == 0, r4)
        items = page.evaluate("""() => { const G = CT.get('textdemo').dev, M = G.menu, T = G.T, out = [];
           for (let i = 0; i < M.items.length; i++) out.push(T.readLine(M.x + 3, M.y + 1 + i * 2, M.w - 4)); return out; }""")
        ok('選單選項畫面讀回正確', items == ['再聽一次', '捲動文字', '混排測試', '長文播放'], items)
        cur = page.evaluate("() => { const G = CT.get('textdemo').dev, M = G.menu; return __nes.nes().ppu.getTile(0, M.x + 1, M.y + 1) === G.T.tile.CUR0 && __nes.nes().ppu.getTile(0, M.x + 1, M.y + 2) === G.T.tile.CUR1; }")
        ok('▶ 游標在第一項', cur)
        press(page, DOWN)
        step(page, 2)
        cur2 = page.evaluate("() => { const G = CT.get('textdemo').dev, M = G.menu, p = __nes.nes().ppu; return [M.sel, p.getTile(0, M.x + 1, M.y + 3) === G.T.tile.CUR0, p.getTile(0, M.x + 1, M.y + 1) === G.T.tile.BLANK]; }")
        ok('↓ → 游標移到第 2 項、舊位置擦掉', cur2 == [1, True, True], cur2)
        held = page.evaluate("""() => { const M = CT.get('textdemo').dev.menu; const s0 = M.sel;
           NES.Input.inject(32, 11); __nes.step(11); const a = M.sel; NES.Input.inject(32, 6); __nes.step(6); const b = M.sel; NES.Input.inject(0, 1); __nes.step(1); return [s0, a, b]; }""")
        ok('按住 ↓：第 1 幀移一格、首延遲 12 幀後每 4 幀再移', held[1] == (held[0] + 1) % 4 and held[2] != held[1], held)
        page.evaluate("() => CT.get('textdemo').dev.menu.select(1)")
        press(page, A)
        step(page, 2)
        st = page.evaluate("() => { const G = CT.get('textdemo').dev; return { mode: G.mode, v: G.visits }; }")
        ok('A 選定「捲動文字」→ 捲動模式', st['mode'] == 'scroll' and st['v'].get('1') == 1, st)

        # ---- 捲動文字
        r5 = run_until(page, "G.T.pending() === 0", 300)
        sc = page.evaluate("""() => { const G = CT.get('textdemo').dev, S = G.scroll, T = G.T, out = [];
           const st = S.state(); for (let i = 0; i < st.rows; i++) out.push(T.readLine(S.x + 2, S.y + 1 + i * 2, st.cols)); return { st, out }; }""")
        ok('捲動區畫面讀回 = 可視行（%d 行 / 共 %d 行）' % (sc['st']['rows'], sc['st']['lines']),
           sc['out'] == [s for s in sc['st']['shown']] and sc['st']['lines'] > sc['st']['rows'], sc)
        ok('捲動區畫完預算內', r5['over'] == 0 and r5['peak'] <= 160, r5)
        top0 = sc['st']['top']
        press(page, DOWN)
        r6 = run_until(page, "G.T.pending() === 0", 300)
        sc2 = page.evaluate("""() => { const G = CT.get('textdemo').dev, S = G.scroll, T = G.T, out = [];
           const st = S.state(); for (let i = 0; i < st.rows; i++) out.push(T.readLine(S.x + 2, S.y + 1 + i * 2, st.cols)); return { st, out }; }""")
        ok('↓ 捲一行：畫面讀回跟著變', sc2['st']['top'] == top0 + 1 and sc2['out'] == sc2['st']['shown'], sc2['st'])
        ok('捲動重寫每幀 ≤ 160（峰值 %d）' % r6['peak'], r6['over'] == 0 and r6['peak'] <= 160, r6)
        press(page, B)
        step(page, 2)
        ok('B 離開捲動 → 回選單', page.evaluate("() => CT.get('textdemo').dev.mode === 'menu'"))
        run_until(page, "G.menu && G.menu.state().phase === 'open'", 300)

        # ---- 混排：寬度 / 斷行 / 避頭 / 英文整字 / 半形置中
        pure = page.evaluate("""() => ({
          m1: CT.Text.measure('HP 120'), m2: CT.Text.measure('中A'), m3: CT.Text.measure('「星」'),
          w1: CT.Text.wrap('aaaa bbbbbb', 8)[0], w2: CT.Text.wrap('一二三四五六，七八', 12)[0],
          w3: CT.Text.wrap('甲\\n乙\\f丙', 10), w4: CT.Text.wrap('abcdefghijkl', 5)[0],
          w5: CT.Text.wrap('一二三四「五六', 10)[0]
        })""")
        ok('寬度：半形 1 欄、全形 2 欄', pure['m1'] == 6 and pure['m2'] == 3 and pure['m3'] == 6, pure)
        ok('英文整字換行（不從字中間切）', pure['w1'] == ['aaaa', 'bbbbbb'], pure['w1'])
        ok('避頭：逗號不放行首（連同前一字換行）', pure['w2'][1][0] != '，' and ''.join(pure['w2']) == '一二三四五六，七八', pure['w2'])
        ok('\\n 換行、\\f 強制換頁', pure['w3'] == [['甲', '乙'], ['丙']], pure['w3'])
        ok('比一行還長的英文字才硬切', pure['w4'] == ['abcde', 'fghij', 'kl'], pure['w4'])
        ok('避尾：「 不放行末', not pure['w5'][0].endswith('「'), pure['w5'])
        # 在選單選「混排測試」
        page.evaluate("() => { const G = CT.get('textdemo').dev; G.menu.select(2); }")
        step(page, 1)
        press(page, A)
        r7 = run_until(page, "G.box.state().phase === 'wait'", 1500)
        mix = page.evaluate("""() => { const G = CT.get('textdemo').dev, b = G.box, T = G.T, out = [];
           for (let i = 0; i < b.lines; i++) out.push(T.readLine(b.tx, b.ty + i * b.pitch, b.cols)); return { out, lines: b.state().lines }; }""")
        ok('混排頁畫面讀回 = 文字（含 Lv.12 / B2 / Ready?）', mix['out'][:len(mix['lines'])] == mix['lines'] and 'Lv.12' in ''.join(mix['lines']), mix)
        # 半形字像素：找到 'L' 的位置，驗 8×8 字身在 16 列行高的第 4~11 列
        pos = page.evaluate("""() => { const G = CT.get('textdemo').dev, b = G.box; const s = b.state().lines[0]; let c = b.tx;
           for (const ch of s) { if (ch === 'L') return [c, b.ty]; c += CT.Text.widthOf(ch); } return null; }""")
        if pos:
            got = page.evaluate(ASCII_AT, pos)
            want = [0] * 4 + [int(asc['L'][k * 2:k * 2 + 2], 16) for k in range(8)] + [0] * 4
            ok('半形 8×8 字身置中於 16 列行高（往下 4 列）', got == want, got)
        else:
            ok('混排第一行有 L', False, mix)
        r7b = run_until(page, "G.mode === 'menu' && G.menu && G.menu.state().phase === 'open'", 3000, press_a=True)
        ok('混排播完回選單', r7b['done'] and r7b['over'] == 0, r7b)

        # ---- 分頁不超過池容量（純函式，小池）
        pg = page.evaluate("""() => { const s = CT.TextDemo.longText(600), P = CT.Text.paginate(s, 26, 3, 64);
           return { n: P.length, max: Math.max(...P.map(p => CT.Text.pageTiles(p))), joined: P.map(p => p.join('')).join('') === s.replace(/\\n/g, '') }; }""")
        ok('小池 64 磚：每頁用字 ≤ 64 磚（%d 頁）' % pg['n'], pg['max'] <= 64, pg)
        ok('分頁接回去 = 原文（不截斷）', pg['joined'], pg)

        # ---- 2000 字長文
        page.evaluate("""() => { const G = CT.get('textdemo').dev; G.menu.select(3); __nes.nes().timing.budget.strict = true; }""")
        step(page, 1)
        press(page, A)
        total = page.evaluate("() => CT.TextDemo.longText(2000).length")
        ok('長文 ≥ 2000 字（%d）' % total, total >= 2000)
        LONG = """([maxF]) => {
          const G = CT.get('textdemo').dev, nes = __nes.nes(), bud = nes.timing.budget, T = G.T, b = G.box;
          let peak = 0, tpeak = 0, over = 0, frames = 0, waitT = 0, pages = [], mism = 0, lastPage = -1, err = null;
          try {
            for (let i = 0; i < maxF && !G.longDone; i++) {
              const s = b.state(); let m = 0;
              if ((s.phase === 'wait' || s.phase === 'end') && s.page !== lastPage) {
                const out = []; for (let k = 0; k < s.lines.length; k++) out.push(T.readLine(b.tx, b.ty + k * b.pitch, b.cols));
                if (out.join('|') !== s.lines.join('|')) mism++;
                pages.push(out.join('')); lastPage = s.page;
              }
              if (s.phase === 'wait' || s.phase === 'end') { if (++waitT >= 13) { m = 1; waitT = 0; } } else waitT = 0;
              NES.Input.inject(m, 1); __nes.step(1); frames++;
              if (bud.used > peak) peak = bud.used; if (bud.used > bud.limit) over++;
              const tb = T.stats().bytes; if (tb > tpeak) tpeak = tb;
            }
          } catch (e) { err = String(e); }
          bud.strict = false;
          return { frames, peak, tpeak, over, overFrames: bud.overFrames, pages, mism, done: G.longDone, err, st: T.stats(), missing: CT.Text.missing() };
        }"""
        lr = page.evaluate(LONG, [60000])
        want = page.evaluate("() => CT.TextDemo.longText(2000) + CT.TextDemo.TEXT.end")
        got = ''.join(lr['pages'])
        ok('2000 字長文逐頁播完（%d 頁、%d 幀）' % (len(lr['pages']), lr['frames']), lr['done'] and not lr['err'], lr.get('err'))
        ok('長文每頁畫面讀回 = 該頁文字', lr['mism'] == 0, lr['mism'])
        ok('長文全部頁面接起來 = 原文（不截斷、不漏字）', got.replace(' ', '') == want.replace(' ', ''), (len(got), len(want)))
        ok('長文每幀 VBlank ≤ 160（峰值 %d）、strict 模式沒 throw' % lr['peak'], lr['peak'] <= 160 and lr['over'] == 0 and not lr['err'], lr['peak'])
        ok('長文文字系統每幀 ≤ 136（峰值 %d）' % lr['tpeak'], lr['tpeak'] <= 136)
        ok('長文 overFrames == 0', lr['overFrames'] == 0, lr['overFrames'])
        ok('字形池 LRU 有回收（evictions %d）且 overflow 0' % lr['st']['evictions'], lr['st']['evictions'] > 0 and lr['st']['overflow'] == 0, lr['st'])
        ok('沒有缺字（CT.Text.missing 空）', lr['missing'] == [] and lr['st']['missing'] == [], lr['missing'])
        ok('上傳磚數 > 0 且有快取命中', lr['st']['uploads'] > 100 and lr['st']['hits'] > 100, lr['st'])

        # ---- 讓出遊戲已用的預算 / CT.blank 一次寫完 / 缺字 □
        yr = page.evaluate("""() => {
          const G = CT.get('textdemo').dev, T = G.T, nes = __nes.nes(), bud = nes.timing.budget, p = nes.ppu;
          // 遊戲本幀先寫 120 byte，再叫 T 寫一大段 → T 只能用 160 − 120 − 16 = 24
          T.print(2, 6, '一二三四五六七八九十');
          bud.reset(); p.fillTiles(0, 0, 29, 32, 1, 0); for (let i = 0; i < 88; i++) p.setTile(1, i & 31, 10 + (i >> 5), 0);
          const before = bud.used; T.pump(); const after = bud.used;
          // CT.blank 內 flush 一次寫完、不計帳
          bud.reset(); let left = -1; CT.blank(nes, () => { T.flush(); left = T.pending(); }); const used2 = bud.used;
          // 缺字 → □、記錄
          T.print(2, 10, '龘'); CT.blank(nes, () => T.flush());
          return { before, after, left, used2, miss: CT.Text.missing(), ch: T.charAt(2, 10) };
        }""")
        ok('遊戲先用 120 byte → 文字系統只補到 ≤ 160 − 16', yr['after'] <= 160 - 16 and yr['after'] >= yr['before'], yr)
        ok('CT.blank 裡 flush() 一次寫完且不計預算', yr['left'] == 0 and yr['used2'] == 0, yr)
        ok('表外的字顯示 □ 並記進 CT.Text.missing()', '龘' in yr['miss'] and yr['ch'] == '龘', yr)

        # ---- 選單超寬 throw（文字不准截斷）
        th = page.evaluate("""() => { const T = CT.get('textdemo').dev.T; try { T.menu({ x: 0, y: 0, w: 8, items: ['這個選項太長了放不下'] }); return false; } catch (e) { return /截斷/.test(e.message); } }""")
        ok('選單選項超寬 → throw（不截斷）', th)
        th2 = page.evaluate("""() => { const T = CT.get('textdemo').dev.T; try { T.scroll({ x: 0, y: 0, w: 32, h: 30 }); return false; } catch (e) { return /字形池/.test(e.message); } }""")
        ok('捲動區最壞用字超過字形池 → throw', th2)

        # ---- lint 截圖
        fresh(page)
        run_until(page, "G.box.state().phase === 'wait'", 600)
        lint = page.evaluate('() => __nes.lint()')
        ok('textdemo 畫面 lint 綠（%s 色）' % lint.get('colors'), lint.get('ok'), lint)
        ok('沒有頁面錯誤', not errs, errs[:3])
        br.close()


def main():
    try:
        cjk, asc = offline()
        browser(cjk, asc)
    except Exception as e:  # noqa
        import traceback
        traceback.print_exc()
        print('環境錯誤：', e)
        return 2
    n = len(results)
    p = sum(1 for r in results if r[0])
    print('test_text.py: %d / %d PASS' % (p, n))
    return 0 if p == n else 1


if __name__ == '__main__':
    sys.exit(main())
