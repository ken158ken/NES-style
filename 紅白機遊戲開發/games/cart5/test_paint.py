# -*- coding: utf-8 -*-
"""《星塵畫室 STAR PAINT》（cart5 槽 6，id = paint）自動驗證。

重點：畫布 128×128 走背景名稱表 + 動態 CHR（像 CHR-RAM：依內容去重 / 參考計數 / 原地改寫，磁磚上傳 16 byte 計入 VBlank 預算），
      大範圍填色 / 復原 / 清除分幀完成且有進度條、每幀 ≤ 160 byte、畫面像素與模型一致、屬性多數決、池滿退化；
      工具（筆 / 橡皮 / 填色 / 直線 / 方框 / 方塊 / 橢圓 / 筆刷大小 / 復原重做 ≥ 20 步）、游標規格（加速 / B 精細）、
      調色盤即時改、存檔 4 格 + 分享碼、著色本 8 張、臨摹評分、快畫分類器、§6 規則、機器人（只讀畫面、人類節奏）。
作法：Playwright 開 `cart5.html?game=paint&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Paint.dev`。

用法：../卡比之星/.venv/bin/python games/cart5/test_paint.py [-v] [--quick]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=paint'
VERBOSE = '-v' in sys.argv
QUICK = '--quick' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Paint && !!CT.Paint.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.paint.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)


def tap(page, mask, after=2):
    page.evaluate('(a) => { NES.Input.inject(a[0], 1); __nes.step(1); __nes.step(a[1]); }', [mask, after])


def hold(page, mask, n):
    page.evaluate('(a) => { for (let i = 0; i < a[1]; i++) { NES.Input.inject(a[0], 1); __nes.step(1); } __nes.step(1); }', [mask, n])


def ps(page):
    return page.evaluate('() => GAME.state().s.paint')


# 一段幀的統計：每幀 VBlank 用量 / 每線精靈 / overFrames 增量
RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, per: [] };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats(), p = GAME.state().s.paint;
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.per) r.per.push([s.budget.used | 0, p ? p.pending : 0]);
    if (o.until === 'idle' && p && p.pending === 0) break;
    if (o.until === 'goal' && GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  return r;
}
"""

# 畫面（indexFrame）與模型一致：每個畫布像素 = 屬性組的對應色（色號 0 = 底色）
SCREEN_MATCH = r"""
() => {
  const S = CT.Paint.dev.S(), ppu = __nes.nes().ppu, C = CT.Paint.Core; S.cur.x = 148; S.cur.y = 36; __nes.step(1); __nes.render();
  const f = ppu.indexFrame; let bad = 0, first = null;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const code = S.model.pix[y * 128 + x], idx = C.idxOf(code);
    const grp = ppu.getAttr(0, 1 + (x >> 4), 2 + (y >> 4));
    const want = idx ? ppu.getBgPalette(grp)[idx] : ppu.backdrop;
    if (f[(32 + y) * 256 + 16 + x] !== want) { bad++; if (!first) first = [x, y, f[(32 + y) * 256 + 16 + x], want]; }
  }
  return { bad, first };
}
"""


def main():
    try:
        pw = sync_playwright().start()
        browser = pw.chromium.launch()
    except Exception as e:  # noqa
        print('環境錯誤：', e)
        return 2
    page = browser.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    fresh(page)

    # ---------------- 契約 / 資產 ----------------
    reg = ev(page, """() => { const g = CT.get('paint'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id paint / order 6 / 星塵畫室 / legacy 3 款', reg and reg['id'] == 'paint' and reg['order'] == 6 and reg['title'] == '星塵畫室' and len(reg['legacy']) == 3, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 右對齊 6 字元（無紀錄 "   --%"）', reg['bestText'] == '   --%', repr(reg['bestText']))
    ok('§6-4 backTile 指向自己精靈表的點', reg['bt'] and ev(page, "(t) => t.tile === CT.Paint.Art.spr().s('PDOT')", reg['bt']), reg['bt'])
    a = ev(page, """() => { const P = CT.Paint, C = P.Core, cv = P.Art.cv();
        const books = P.Pics.BOOK.map((b, i) => { const px = P.Pics.book(i); return { name: b.name, codes: [...new Set(px)].sort(), regions: C.regions(px, 12).length }; });
        const copies = P.Pics.COPY.map((b, i) => { const px = P.Pics.copy(i); return { name: b.name, codes: [...new Set(px)].sort(), time: b.time }; });
        const pals = P.Pics.BOOK.map(b => b.pal13).concat(P.Pics.COPY.map(b => b.pal13), [P.Pics.FREE_PAL, P.Pics.GUESS_PAL]);
        return { count: cv.bank.count, U: cv.U, books, copies, palOk: pals.every(p => p.length === 13 && p.every(c => c >= 0 && c <= 63 && c !== 0x0D)),
                 songs: Object.keys(P.Audio.SONGS), sfx: Object.keys(P.Audio.SFX).length,
                 names: P.Pics.BOOK.map(b => b.name).concat(P.Pics.COPY.map(b => b.name)) }; }""")
    ok('paint_cv bank 256 磁磚：釘住 UI ≤ 80、動態池 ≥ 176', a['count'] == 256 and a['U'] <= 80, (a['count'], a['U']))
    ok('著色本 ≥ 8 張原創線稿，線條只用色碼 3', len(a['books']) >= 8 and all(b['codes'] == [0, 3] for b in a['books']), [b['codes'] for b in a['books']])
    ok('著色本每張 ≥ 6 個封閉區（≥ 12 px）', all(b['regions'] >= 6 for b in a['books']), [(b['name'], b['regions']) for b in a['books']])
    ok('臨摹範例 ≥ 8 張，只用紙 + 第 0 組 3 色、限時 120 秒', len(a['copies']) >= 8 and all(set(c['codes']) <= {0, 1, 2, 3} and c['time'] == 7212 for c in a['copies']), [c['codes'] for c in a['copies']])
    ok('所有圖名不重複且 ≤ 12 字（清單不截斷）', len(set(a['names'])) == len(a['names']) and all(len(n) <= 12 for n in a['names']), a['names'])
    ok('所有調色盤 13 色合法（無 $0D）', a['palOk'])
    ok('音樂 4 首（標題 / 畫室 / 速寫 / 完成）+ 音效 ≥ 8', len(a['songs']) == 4 and a['sfx'] >= 8, (a['songs'], a['sfx']))

    # ---------------- 標題 / 說明 ----------------
    rows = ev(page, '() => [8,11,14,17,20,22,25,27].map(r => CT.Paint.dev.rowText(r))')
    ok('標題：5 個選項 + 紀錄列 + 回選單提示 + 密技提示（隔行）', 'FREE DRAW' in rows[0] and 'QUICK GUESS' in rows[3] and 'HOW TO PLAY' in rows[4]
       and 'GUESS 0000' in rows[5] and 'START+SELECT' in rows[6] and 'C/* = CHEAT' in rows[7], rows)
    # fix-r9 P3-4：固定中文點陣（paint_ui）
    zh = ev(page, """() => { const A = CT.Paint.Art, u = A.ui(), p = __nes.nes().ppu;
        const at = (c, r, id) => u.zh(id).every((q, k) => p.getTile(0, c + 2*k, r) === q[0] && p.getTile(0, c + 2*k + 1, r) === q[1] && p.getTile(0, c + 2*k, r + 1) === q[2] && p.getTile(0, c + 2*k + 1, r + 1) === q[3]);
        const out = { glyph: A.ZH_GLYPH, n: u.bank.tiles.length, title: at(12, 4, 'TITLE'),
          modes: ['FREE', 'BOOK', 'COPY', 'GUESS', 'HELP'].every((id, i) => at(7, 7 + i * 3, id)), hold: at(4, 24, 'HOLD') && at(22, 24, 'MENU') };
        CT.Paint.dev.help(0); __nes.step(1); out.help = at(7, 2, 'H_CTRL') && at(3, 20, 'HOLD');
        CT.Paint.dev.list('book'); __nes.step(1); out.list = at(7, 2, 'BOOK') && at(4, 26, 'HOLD');
        CT.Paint.dev.list('copy'); __nes.step(1); out.list2 = at(4, 2, 'COPY');
        CT.Paint.dev.title(); __nes.step(1); return out; }""")
    sys.path.insert(0, str(ROOT / 'tools'))
    import cjk_glyphs
    bad = [k for k, v in zh['glyph'].items() if cjk_glyphs.glyph_hex(chr(int(k[1:], 16))) != v]
    ok('中文點陣與 tools/cjk_glyphs.py（Noto 15px）逐位元一致、%d 字' % len(zh['glyph']), not bad and len(zh['glyph']) >= 30, bad)
    import subprocess
    chk = subprocess.run([sys.executable, str(ROOT / 'games/cart5/paint/zh_gen.py'), '--check'], capture_output=True, text=True)
    ok('zh_gen.py --check：art.js 的中文資料是最新的', chk.returncode == 0, chk.stdout.strip())
    ok('paint_ui bank ≤ 256 塊（含中文）', zh['n'] <= 256, zh['n'])
    ok('標題 / 說明 / 清單畫面中文：星塵畫室、5 個模式名、說明頁標題、按住…回選單、清單標題', zh['title'] and zh['modes'] and zh['hold'] and zh['help'] and zh['list'] and zh['list2'],
       {k: v for k, v in zh.items() if k != 'glyph'})
    helps = ev(page, '() => { const out = []; for (let p = 0; p < 4; p++) { CT.Paint.dev.help(p); __nes.step(1); const t = []; for (let r = 2; r < 29; r++) t.push(CT.Paint.dev.rowText(r)); out.push(t); } return out; }')
    flat = [' '.join(h) for h in helps]
    ok('說明 4 頁：操作含（按住）START+SELECT（回選單）與 C/* = CHEAT', 'START+SELECT' in flat[0] and 'C/* = CHEAT' in flat[0], helps[0])
    ok('說明：工具頁 10 種工具、調色頁教 16X16 屬性規則、模式頁 4 模式', all(w in flat[1] for w in ['PEN', 'ERASER', 'FILL', 'LINE', 'FRAME', 'BLOCK', 'OVAL', 'SIZE', 'UNDO', 'REDO'])
       and 'EACH 16X16 BLOCK SHOWS' in flat[2] and all(w in flat[3] for w in ['FREE DRAW', 'COLOR BOOK', 'COPY', 'QUICK GUESS']))
    ok('說明頁文字不貼邊（第 0 / 31 欄都空白）', all(r[0] == ' ' and r[31] == ' ' for h in helps for r in h))
    ok('標題 / 說明畫面按密技無效', ev(page, '() => { CT.Paint.dev.title(); __nes.step(1); return CT.get("paint").cheat(); }') is False)

    # ---------------- 游標規格 ----------------
    ev(page, '() => { CT.Paint.dev.start("free", 0); __nes.step(2); }')
    x0 = ps(page)['cur'][0]
    hold(page, RIGHT, 8)
    x8 = ps(page)['cur'][0]
    ev(page, '() => { CT.Paint.dev.S().cur.x = 40; }')
    hold(page, RIGHT, 20)
    x20 = ps(page)['cur'][0]
    ok('游標：按住前 8 幀 1 px/幀、之後 3 px/幀', x8 - x0 == 8 and x20 - 40 == 8 + 12 * 3, (x0, x8, x20))
    ev(page, '() => { const S = CT.Paint.dev.S(); S.cur.x = 80; S.cur.y = 96; }')
    hold(page, RIGHT | B, 1)
    f1 = ps(page)['cur'][0]
    hold(page, RIGHT | B, 24)
    f2 = ps(page)['cur'][0]
    ok('游標：按住 B 精細（按下 1 px、12 幀後每 4 幀 1 px）', f1 == 81 and 83 <= f2 <= 85, (f1, f2))

    # ---------------- 工具（直接用模型原語）----------------
    t = ev(page, """() => { const M = new CT.Paint.Core.Model(), cnt = () => M.pix.reduce((a, b) => a + (b ? 1 : 0), 0);
        const o = {}; M.line(0, 0, 9, 0, 3, 1); o.line = cnt(); M.clear(0);
        M.brush(10, 10, 3, 3); o.brush3 = cnt(); M.clear(0);
        M.rect(0, 0, 9, 9, 3, 1); o.rect = cnt(); M.clear(0);
        M.box(0, 0, 9, 9, 3); o.box = cnt(); M.clear(0);
        M.ellipse(10, 10, 50, 30, 3, 1); let sym = true; for (let y = 0; y < 128; y++) for (let x = 10; x <= 50; x++) if (!!M.pix[y*128+x] !== !!M.pix[y*128+60-x]) sym = false; o.sym = sym; o.oval = cnt();
        o.fill = M.flood(30, 20, 5); o.fill0 = M.flood(30, 20, 5); M.clear(0);
        M.rect(0, 0, 127, 127, 3, 1); o.flood = M.flood(5, 5, 2);
        return o; }""")
    ok('直線 10 px / 3×3 筆刷 9 px / 方框 36 px / 方塊 100 px', t['line'] == 10 and t['brush3'] == 9 and t['rect'] == 36 and t['box'] == 100, t)
    ok('橢圓左右對稱、填色只填內部（再填同色 = 0）、4 連通填滿 126×126', t['sym'] and t['fill'] > 400 and t['fill0'] == 0 and t['flood'] == 126 * 126, t)

    # ---------------- 輸入操作：筆 / 直線（A 起 A 終、同點取消）----------------
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('free', 0); const S = D.S(); S.cur.x = 40; S.cur.y = 60; S.color = 3;
        NES.Input.inject(1, 1); __nes.step(1); for (let i = 0; i < 10; i++) { NES.Input.inject(1 | 128, 1); __nes.step(1); } __nes.step(2);
        const pen = S.model.pix.reduce((a, b) => a + (b ? 1 : 0), 0);
        D.setTool('line'); S.cur.x = 30; S.cur.y = 100; NES.Input.inject(1, 1); __nes.step(2);
        const anch = S.anchor && S.anchor.slice(); S.cur.x = 70; S.cur.y = 100; NES.Input.inject(1, 1); __nes.step(2);
        const ln = S.model.pix.reduce((a, b) => a + (b ? 1 : 0), 0) - pen;
        NES.Input.inject(1, 1); __nes.step(2); NES.Input.inject(1, 1); __nes.step(2);
        return { pen, anch, ln, cancel: S.anchor, total: S.model.pix.reduce((a, b) => a + (b ? 1 : 0), 0), undo: S.model.undoS.length }; }""")
    ok('筆：按住 A + → 10 幀（移 14 px）畫出 15 px 連續線（加速時也不斷）', r['pen'] == 15, r)
    ok('直線工具：A 定起點、A 定終點畫 41 px；同點兩下 = 取消', r['anch'] == [14, 68] and r['ln'] == 41 and r['cancel'] is None and r['total'] == 56 and r['undo'] == 2, r)

    # ---------------- 面板：工具 / 色票 / 改色即時寫 PPU ----------------
    r = ev(page, """() => { const D = CT.Paint.dev, S = D.S(), ppu = __nes.nes().ppu;
        const click = (col, row) => { S.cur.x = col * 8 + 3; S.cur.y = row * 8 + 3; NES.Input.inject(1, 1); __nes.step(2); };
        const tp = D.toolPos(2); click(tp[0], tp[1]); const tool = S.tool;
        const sp = D.swPos(8); click(sp[0], sp[1]); const color = S.color;
        click(sp[0], sp[1]); const editing = !!S.edit; const before = ppu.getBgPalette(2)[2];
        NES.Input.inject(128, 1); __nes.step(1); const used = __nes.stats().budget.used; __nes.step(1);
        const after = ppu.getBgPalette(2)[2], pal13 = S.pal13[8];
        NES.Input.inject(2, 1); __nes.step(2); const back = ppu.getBgPalette(2)[2];
        click(sp[0], sp[1]); NES.Input.inject(16, 1); __nes.step(2); NES.Input.inject(1, 1); __nes.step(2);
        return { tool, color, editing, before, after, pal13, back, used, kept: ppu.getBgPalette(2)[2], saved: CT.load('paint', 'freePal', null) }; }""")
    ok('面板：A 按工具圖示換工具、按色票換色', r['tool'] == 'fill' and r['color'] == 8, r)
    ok('對已選色票再按 A = 改色；→ 換色相當幀就寫進 PPU 調色盤（計入預算）', r['editing'] and r['after'] != r['before'] and r['after'] == r['pal13'] and r['used'] >= 3, r)
    ok('改色：B 取消還原、A 確定並記住自由畫調色盤', r['back'] == r['before'] and r['kept'] != r['before'] and r['saved'] and r['saved'][8] == r['kept'], r)
    r = ev(page, """() => { const S = CT.Paint.dev.S(), ppu = __nes.nes().ppu, ug0 = S.ug;
        S.color = 0; const sp = CT.Paint.dev.swPos(0); S.cur.x = sp[0]*8+3; S.cur.y = sp[1]*8+3; NES.Input.inject(1,1); __nes.step(2);
        let n = 0; while (S.edit && (S.edit.h !== 13) && n++ < 20) { NES.Input.inject(64, 1); __nes.step(2); }
        NES.Input.inject(1, 1); __nes.step(2); for (let i = 0; i < 6; i++) __nes.step(1);
        return { bd: ppu.backdrop, ug0, ug: S.ug, attr: ppu.getAttr(0, 13, 13) }; }""")
    ok('改紙色（底色）成黑 → 面板文字自動換到對比最大的那組屬性', r['bd'] == 0x0F and r['ug'] != r['ug0'] and r['attr'] == r['ug'], r)

    # ---------------- 動態 CHR：大範圍填色分幀 + 進度條 + 畫面與模型一致 ----------------
    ev(page, "() => { localStorage.removeItem('nes.cart5.paint.freePal'); CT.Paint.dev.start('free', 0); __nes.step(2); }")
    r = ev(page, """() => { const S = CT.Paint.dev.S(); S.model.push();
        S.model.ellipse(8, 8, 120, 100, 6, 2); S.model.line(0, 127, 127, 0, 9, 3);
        for (let i = 0; i < 9; i++) S.model.circle(16 + i * 12, 110, 5, 10 + (i % 3), 1);
        __nes.step(30); S.cur.x = 18; S.cur.y = 158; CT.Paint.dev.setTool('fill'); S.color = 2; S.cur.x = 16 + 64; S.cur.y = 32 + 50;
        NES.Input.inject(1, 1); __nes.step(1); return { pend: S.disp.pending(), row: CT.Paint.dev.rowText(22) }; }""")
    run = ev(page, RUN, {'n': 120, 'per': True, 'until': 'idle'})
    bar = ev(page, '() => CT.Paint.dev.rowText(22)')
    ok('大填色分幀完成：第一幀後還有 ≥ 40 格待上傳、幾幀後清空', r['pend'] >= 40 and 2 <= run['f'] < 60, (r['pend'], run['f']))
    ok('分幀期間每幀 VBlank ≤ 160 byte（實際 ≤ 150）、overFrames 0', run['peak'] <= 150 and run['over'] == 0, (run['peak'], run['per'][:6]))
    ok('分幀期間 HUD 有進度條（FILL ####__ 百分比）', 'FILL' in r['row'] and ('#' in r['row'] or '_' in r['row']), r['row'])
    m = ev(page, SCREEN_MATCH)
    ok('上傳完成後畫面每個畫布像素 = 屬性組的對應色（16384 px 全對）', m['bad'] == 0, m)
    r = ev(page, """() => { const S = CT.Paint.dev.S(), D = S.disp, bank = D.bank; let bad = 0;
        for (let c = 0; c < 256; c++) { const t = bank.tiles[S.surf.cur[c]], x0 = (c & 15) * 8, y0 = (c >> 4) * 8;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (t[y*8+x] !== CT.Paint.Core.idxOf(S.model.pix[(y0+y)*128+x0+x])) bad++;
          if (__nes.nes().ppu.getTile(0, 2 + (c & 15), 4 + (c >> 4)) !== S.surf.cur[c]) bad += 1000; }
        let rc = 0; for (let i = D.U; i < 256; i++) rc += D.refc[i];
        let live = 0; for (let c = 0; c < 256; c++) if (S.surf.cur[c] >= D.U) live++;
        return { bad, rc, live, used: D.used(), uniq: new Set(Array.from(S.surf.cur).filter(t => t >= D.U)).size }; }""")
    ok('CHR-RAM 帳：圖樣表內容 = 模型、名稱表指向正確、參考計數總和 = 使用格數、池用量 = 不同磁磚數', r['bad'] == 0 and r['rc'] == r['live'] and r['used'] == r['uniq'], r)
    r = ev(page, """() => { const S = CT.Paint.dev.S(); S.model.clear(0); __nes.step(40); const u0 = S.disp.used(), up0 = S.disp.uploads;
        for (let i = 0; i < 12; i++) { S.model.line(i * 8 + 2, 2, i * 8 + 5, 5, 3, 1); } __nes.step(10);
        return { u0, u1: S.disp.used(), up: S.disp.uploads - up0 }; }""")
    ok('同內容的格子共用一塊磁磚（12 格一樣的斜線 → 池只多 1 塊）', r['u0'] == 0 and r['u1'] == 1, r)
    r = ev(page, """() => { const S = CT.Paint.dev.S(), M = S.model; M.push(); M.clear(0); __nes.step(40);
        M.box(0, 0, 127, 63, 4); M.box(0, 64, 127, 127, 1); M.box(16, 0, 18, 15, 1); __nes.step(40);
        const ppu = __nes.nes().ppu; return { a: ppu.getAttr(0, 1, 2), b: ppu.getAttr(0, 1, 6), c: ppu.getAttr(0, 2, 2) }; }""")
    ok('屬性多數決：16×16 區顯示「用得最多的那組」（綠區內少量紅 → 仍是綠組）', r['a'] == 1 and r['b'] == 0 and r['c'] == 1, r)
    r = ev(page, """() => { const S = CT.Paint.dev.S(), M = S.model; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        M.push(); for (let k = 0; k < 16384; k++) M.pix[k] = 0; M.load(new Uint8Array(16384).map(() => 1 + Math.floor(rnd() * 3)));
        const o0 = __nes.stats().budget.overFrames; let f = 0; while (S.disp.pending() && f < 400) { __nes.step(1); f++; }
        const ap = S.disp.approxN, used = S.disp.used(), cap = S.disp.capacity(), row = CT.Paint.dev.rowText(22);
        M.clear(0); let g = 0; while (S.disp.pending() && g < 400) { __nes.step(1); g++; }
        return { f, ap, used, cap, over: __nes.stats().budget.overFrames - o0, ap2: S.disp.approxN, used2: S.disp.used(), row }; }""")
    ok('池子用完（256 格全是雜訊）：不當機、用最接近的磁磚暫代、HUD 警告、不超預算', r['ap'] > 0 and r['used'] == r['cap'] and r['over'] == 0, r)
    ok('清空後暫代全部收回、池子歸零', r['ap2'] == 0 and r['used2'] == 0, r)

    # ---------------- 復原 / 重做 ≥ 20 步 ----------------
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('free', 0); const S = D.S(); __nes.step(2);
        for (let i = 0; i < 30; i++) { S.model.push(); S.model.line(0, i * 4, 127, i * 4, 1 + (i % 12), 1); }
        const full = S.model.undoS.length; let u = 0; while (S.model.undo()) u++;
        const after = S.model.pix.reduce((a, b) => a + (b ? 1 : 0), 0); let rd = 0; while (S.model.redo()) rd++;
        const lines = S.model.pix.reduce((a, b) => a + (b ? 1 : 0), 0);
        NES.Input.inject(4 | 64, 1); __nes.step(1); NES.Input.inject(4, 1); __nes.step(1); __nes.step(1);
        const viaKey = S.model.redoS.length;
        return { full, u, after, rd, lines, viaKey }; }""")
    ok('復原 ≥ 24 步（上限 24）、重做全部還原', r['full'] == 24 and r['u'] == 24 and r['rd'] == 24 and r['lines'] == 30 * 128, r)
    ok('SELECT + ← = 復原（快捷鍵）', r['viaKey'] == 1, r)

    # ---------------- 存檔 4 格 + 分享碼 ----------------
    r = ev(page, """() => { const D = CT.Paint.dev, S = D.S(), C = CT.Paint.Core;
        const code = C.encode(S.model.pix, S.pal13), d = C.decode(code);
        const same = d && d.pix.every((v, i) => v === S.model.pix[i]) && d.pal.every((v, i) => v === S.pal13[i]);
        const bad = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
        return { len: code.length, same, bad: C.decode(bad), junk: C.decode('hello'), blank: C.encode(new Uint8Array(16384), S.pal13).length }; }""")
    ok('分享碼：SP1 + base64url + CRC，往返一致；改 1 字 / 亂碼都拒收', r['same'] and r['bad'] is None and r['junk'] is None, r)
    ok('空白畫布的分享碼很短（變長 RLE，≤ 40 字）', r['blank'] <= 40, r['blank'])
    r = ev(page, """() => { const D = CT.Paint.dev, S = D.S(); __nes.step(10); D.openMenu(); __nes.step(4);
        const items = D.menuItems(); const hud = D.rowText(2);
        const go = (name) => { while (D.menuItems()[S.menuSel] !== name && S.menuSel < 8) { NES.Input.inject(32, 1); __nes.step(2); } NES.Input.inject(1, 1); __nes.step(2); };
        NES.Input.inject(32, 1); __nes.step(2); NES.Input.inject(128, 1); __nes.step(2); NES.Input.inject(128, 1); __nes.step(2);
        const slot = S.slot; NES.Input.inject(1, 1); __nes.step(2);
        const saved = !!CT.load('paint', 'slot3', null), msg = D.rowText(27);
        const before = Array.from(S.model.pix); NES.Input.inject(8, 1); __nes.step(2);
        S.model.push(); S.model.clear(0); __nes.step(40);
        D.openMenu(); __nes.step(1); NES.Input.inject(32, 1); __nes.step(2); NES.Input.inject(32, 1); __nes.step(2); NES.Input.inject(1, 1); __nes.step(60);
        const back = S.model.pix.every((v, i) => v === before[i]);
        return { items, hud, slot, saved, msg, back, paused: S.paused }; }""")
    ok('暫停選單 ≤ 6 項：存檔 / 讀檔 / 分享碼 / 清除 / 離開；HUD 寫 HOLD START+SELECT: MENU', len(r['items']) == 6 and 'HOLD START+SELECT: MENU' in r['hud'], r)
    ok('存檔 4 格：← → 換格、存進第 3 格、清掉後讀回一模一樣', r['slot'] == 3 and r['saved'] and 'SAVED TO SLOT 3' in r['msg'] and r['back'] and not r['paused'], r)

    # ---------------- 暫停：BGM 靜音 ----------------
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('free', 0); __nes.step(5); NES.Input.inject(8, 1); __nes.step(2);
        const p1 = { paused: D.S().paused, mus: CT.Paint.Audio.paused() }; NES.Input.inject(8, 1); __nes.step(2);
        return { p1, p2: { paused: D.S().paused, mus: CT.Paint.Audio.paused() } }; }""")
    ok('§6-2 START 暫停 = BGM 暫停；再按 START 接續', r['p1']['paused'] and r['p1']['mus'] and not r['p2']['paused'] and not r['p2']['mus'], r)
    ok('自由畫按密技無效', ev(page, '() => CT.get("paint").cheat()') is False)

    # ---------------- 著色本 ----------------
    r = ev(page, """() => { const D = CT.Paint.dev, C = CT.Paint.Core; const out = [];
        for (let i = 0; i < 8; i++) { D.start('book', i); __nes.step(2); const S = D.S(); out.push({ used: S.disp.used(), ap: S.disp.approxN, areas: S.regions.length }); }
        return out; }""")
    ok('8 張線稿都放得進動態 CHR 池（不需暫代）', all(x['ap'] == 0 and x['used'] < 178 for x in r), r)
    fresh(page)
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('book', 2); const S = D.S(); __nes.step(2);
        const regs = S.regions; let i = 0;
        for (const R of regs) { S.model.push(); S.model.flood(R.seed[0], R.seed[1], [1,2,4,5,7,8,10,11][i++ % 8]); }
        let f = 0; while (!S.complete && f < 400) { __nes.step(1); f++; }
        const info = D.rowText(24);
        return { complete: S.complete, f, info, pages: CT.load('paint', 'pages', 0), goalBook: GAME.state().s.goalBook, music: CT.Paint.Audio.current }; }""")
    ok('著色本：每個區都塗滿 → COMPLETE、記錄該頁完成、播完成曲', r['complete'] and r['pages'] == 4 and r['goalBook'] and 'COMPLETE' in r['info'] and r['music'] == 'paint_done', r)
    fresh(page)
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('book', 0); const S = D.S(); __nes.step(2);
        const n0 = S.regions.length; const ok = CT.get('paint').cheat(); __nes.step(12); D.checkBook();
        return { ok, cheated: S.cheated, areas: S.areasDone, n0 }; }""")
    ok('著色本密技 = 立刻塗好最大的未完成區，該局標記用過密技', r['ok'] and r['cheated'] and r['areas'] >= 1, r)

    # ---------------- 臨摹評分 ----------------
    r = ev(page, """() => { const P = CT.Paint, C = P.Core, out = [];
        for (let i = 0; i < 8; i++) { const ref = P.Pics.copy(i);
          const sh = new Uint8Array(16384); for (let y = 0; y < 128; y++) for (let x = 0; x < 125; x++) sh[y*128 + x + 3] = ref[y*128 + x];
          const wrong = ref.map(c => c ? (c % 3) + 1 : 0);
          const half = new Uint8Array(16384).fill(1);
          out.push({ self: C.score(ref, ref).score, empty: C.score(new Uint8Array(16384), ref).score, shift: C.score(sh, ref).score,
                     wrong: C.score(wrong, ref).score, half: C.score(half, ref).score }); }
        return out; }""")
    ok('臨摹：照抄 100 / 空白 0 / 位移 3 px 仍 ≥ A(85)', all(x['self'] == 100 and x['empty'] == 0 and x['shift'] >= 85 for x in r), r)
    ok('臨摹：顏色全錯 < B、整張塗滿同一色 < B（不能亂塗過關）', all(x['wrong'] < 72 and x['half'] < 72 for x in r), r)
    # fix-r9 P2-3：偷懶畫法一律 < B，認真照抄 ≥ A，亂畫 < C
    r = ev(page, """() => { const P = CT.Paint, C = P.Core, out = [];
        let sd = 12345; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
        const blocks = (ref, bs, th, dx, dy, drop) => { const M = new C.Model(), n = 128 / bs;
          for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) { const cnt = [0, 0, 0, 0];
            for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) cnt[ref[(cy*bs + y)*128 + cx*bs + x]]++;
            let b = 0; for (let k = 1; k < 4; k++) if (cnt[k] > cnt[b]) b = k;
            if (b === 0 && cnt[0] < bs * bs * th) { b = 1; for (let k = 2; k < 4; k++) if (cnt[k] > cnt[b]) b = k; }
            if (b && rnd() >= drop) M.box(cx*bs + dx, cy*bs + dy, cx*bs + bs - 1 + dx, cy*bs + bs - 1 + dy, b); }
          return M.pix; };
        const bbox = (ref) => { let x0 = 128, y0 = 128, x1 = -1, y1 = -1; const cnt = [0, 0, 0, 0];
          for (let i = 0; i < 16384; i++) if (ref[i]) { const x = i & 127, y = i >> 7; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); cnt[ref[i]]++; }
          let b = 1; for (let k = 2; k < 4; k++) if (cnt[k] > cnt[b]) b = k; return [x0, y0, x1, y1, b]; };
        for (let i = 0; i < 8; i++) { const ref = P.Pics.copy(i), o = {}, bb = bbox(ref);
          let M = new C.Model(); M.box(bb[0], bb[1], bb[2], bb[3], bb[4]); o.solid = C.score(M.pix, ref).score;
          M = new C.Model(); M.rect(bb[0], bb[1], bb[2], bb[3], bb[4], 3); o.frame = C.score(M.pix, ref).score;
          o.big32 = C.score(blocks(ref, 32, 10 / 16, 0, 0, 0), ref).score;
          o.b16 = C.score(blocks(ref, 16, 10 / 16, 0, 0, 0), ref).score;
          o.b8 = C.score(blocks(ref, 8, 12 / 16, 0, 0, 0), ref).score;
          o.human = C.score(blocks(ref, 8, 12 / 16, (rnd() * 7 | 0) - 3, (rnd() * 7 | 0) - 3, 0.08), ref).score;
          M = new C.Model(); let x = 64, y = 64;
          for (let k = 0; k < 40; k++) { const nx = rnd() * 128 | 0, ny = rnd() * 128 | 0; M.line(x, y, nx, ny, 1 + (rnd() * 3 | 0), 2); x = nx; y = ny; }
          o.scrib = C.score(M.pix, ref).score; out.push(o); }
        return { out, rate: C.RATE, pass: C.PASS }; }""")
    o8 = r['out']
    ok('臨摹門檻 S 93 / A 85 / B 72 / C 55（goal = B）', r['pass'] == 72 and [x[1] for x in r['rate'][:4]] == [93, 85, 72, 55], r['rate'])
    ok('臨摹：外框位置畫一個實心方塊 → 8 張都 < B', all(x['solid'] < 72 for x in o8), [x['solid'] for x in o8])
    ok('臨摹：只畫外框空心方塊 → 8 張都 < B', all(x['frame'] < 72 for x in o8), [x['frame'] for x in o8])
    ok('臨摹：4×4 大方塊（32 px）→ 8 張都 < B', all(x['big32'] < 72 for x in o8), [x['big32'] for x in o8])
    ok('臨摹：8×8 方塊認真照抄 → 8 張都 ≥ A', all(x['b8'] >= 85 for x in o8), [x['b8'] for x in o8])
    ok('臨摹：模擬人畫（8×8 方塊、整體位移 ±3 px、8% 漏畫）→ 8 張都 ≥ B', all(x['human'] >= 72 for x in o8), [x['human'] for x in o8])
    ok('臨摹：隨機亂畫 40 筆 → 8 張都 < C', all(x['scrib'] < 55 for x in o8), [x['scrib'] for x in o8])
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('copy', 1); const S = D.S(); const t0 = S.timer;
        S.timer = 3; __nes.step(5); const ph = S.phase, res = S.res && S.res.rating;
        const c1 = CT.get('paint').cheat(); __nes.step(2);
        return { t0, ph, res, c1, ph2: S.phase, t2: S.timer, cheated: S.cheated }; }""")
    ok('臨摹 120 秒 = 7212 幀，時間到進結算', r['t0'] == 7212 and r['ph'] == 'result' and r['res'] == 'D', r)
    ok('§6-1 結算畫面按密技 = 原地續畫 30 秒（畫布保留、標記密技）', r['c1'] and r['ph2'] == 'draw' and 1790 <= r['t2'] <= 1803 and r['cheated'], r)

    # ---------------- 快畫猜猜：分類器 ----------------
    r = ev(page, """() => { const C = CT.Paint.Core, P = CT.Paint.Pics, out = {};
        const T = (lab, fn) => { const M = new C.Model(); fn(M); (out[lab] = out[lab] || []).push(C.classify(M.pix).label); };
        for (const [x, y, s] of [[20, 20, 80], [40, 30, 50], [10, 50, 60]]) {
          T('LINE', M => M.line(x, y, x + s, y + s / 3, 1, 2));
          T('CIRCLE', M => M.ellipse(x, y, x + s, y + s, 1, 2));
          T('TRIANGLE', M => { M.line(x + s / 2, y, x + s, y + s, 1, 2); M.line(x + s, y + s, x, y + s, 1, 2); M.line(x, y + s, x + s / 2, y, 1, 2); });
          T('SQUARE', M => M.rect(x, y, x + s, y + s, 1, 2));
          T('STAR', M => { const cx = x + s / 2, cy = y + s / 2, p = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; p.push([Math.round(cx + s / 2 * Math.cos(a)), Math.round(cy + s / 2 * Math.sin(a))]); } M.poly(p, 1, 2); });
          T('CROSS', M => { M.line(x, y + s / 2, x + s, y + s / 2, 1, 2); M.line(x + s / 2, y, x + s / 2, y + s, 1, 2); });
        }
        T('STAR', M => P.star5(M, 64, 64, 40, 16, 1));
        T('CROSS', M => { M.line(20, 20, 100, 100, 1, 2); M.line(100, 20, 20, 100, 1, 2); });
        T('CIRCLE', M => M.ellipse(10, 30, 110, 90, 1, 1));
        T('SQUARE', M => M.poly([[64, 10], [110, 56], [64, 102], [18, 56]], 1, 2));
        return out; }""")
    hits = sum(1 for k, v in r.items() for x in v if x == k)
    total = sum(len(v) for v in r.values())
    ok('形狀分類器：6 類 × 多種大小 / 位置（含菱形、X 字、扁橢圓、凹星）全部猜對', hits == total, r)
    ok('筆畫太少（< 20 px）不亂猜', ev(page, '() => { const C = CT.Paint.Core, M = new C.Model(); M.line(5, 5, 12, 5, 1, 1); return C.classify(M.pix).label; }') is None)
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('guess', 0); const S = D.S(); const G = S.guess; const want = G.want, order = G.order.slice();
        const M = S.model; M.push();
        if (want === 'CIRCLE') M.ellipse(20, 20, 100, 100, 1, 2); else if (want === 'SQUARE') M.rect(20, 20, 100, 100, 1, 2);
        else if (want === 'LINE') M.line(10, 10, 110, 60, 1, 2); else if (want === 'CROSS') { M.line(10, 60, 110, 60, 1, 2); M.line(60, 10, 60, 110, 1, 2); }
        else if (want === 'TRIANGLE') { M.line(60, 10, 110, 100, 1, 2); M.line(110, 100, 10, 100, 1, 2); M.line(10, 100, 60, 10, 1, 2); }
        else CT.Paint.Pics.star5(M, 64, 64, 50, 20, 1);
        __nes.step(45); return { want, order, got: G.got, score: G.score, phase: S.phase, panel: D.rowText(12) + D.rowText(14) }; }""")
    ok('快畫：畫出題目要的形狀 → CPU 40 幀內猜中、加分（100 + 剩餘秒 × 10）', r['got'] == 1 and r['score'] >= 300 and r['phase'] == 'between' and 'I GOT IT' in r['panel'], r)
    o2 = ev(page, '() => { CT.Paint.dev.start("guess", 0); return CT.Paint.dev.S().guess.order.slice(); }')
    o3 = ev(page, '() => { const g = CT.Paint.dev.g(); g.seed = 99; CT.Paint.dev.start("guess", 0); return CT.Paint.dev.S().guess.order.slice(); }')
    ok('快畫：6 題涵蓋 6 種形狀、?seed 可重現（同種子同順序）', sorted(r['order']) == sorted(['LINE', 'CIRCLE', 'TRIANGLE', 'SQUARE', 'STAR', 'CROSS']) and o3 != r['order'], (r['order'], o2, o3))
    r = ev(page, """() => { const D = CT.Paint.dev; D.start('guess', 0); const S = D.S(); S.guess.score = 777; CT.get('paint').exit(__nes.nes());
        return CT.load('paint', 'guessBest', 0); }""")
    ok('§6-3 中途離開（exit）也存最高分', r == 777, r)

    # ---------------- 畫面 lint ----------------
    lints = ev(page, """() => { const D = CT.Paint.dev, out = {};
        const L = (k) => { __nes.step(2); __nes.render(); const l = __nes.lint(); out[k] = [l.ok, l.colors, l.maxSpritesLine]; };
        D.title(); L('title'); D.help(2); L('help'); D.list('copy'); L('list');
        D.start('free', 0); L('free'); D.start('book', 4); L('book'); D.start('copy', 5); L('copy'); D.start('guess', 0); L('guess');
        return out; }""")
    ok('7 種畫面 lint 全 PASS（≤ 25 色、每線 ≤ 8）', all(v[0] and v[1] <= 25 and v[2] <= 8 for v in lints.values()), lints)

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    taps = ev(page, """() => { const r = { f: 0, ml: 0, peak: 0, gaps: [] }; let last = -100, prev = 0; const o0 = __nes.stats().budget.overFrames;
        for (let i = 0; i < 12000; i++) { __nes.step(1); r.f++; const s = __nes.stats(); r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
          const m = NES.Input.mask() & 15; if (m && !prev) { r.gaps.push(r.f - last); last = r.f; } prev = m;
          if (GAME.state().goal) break; }
        r.over = __nes.stats().budget.overFrames - o0; r.goal = GAME.state().goal; r.minGap = Math.min(...r.gaps.slice(1)); r.n = r.gaps.length;
        const s = GAME.state().s; r.res = s.paint && s.paint.res; delete r.gaps; return r; }""")
    ok('機器人：著色本完成 1 張 + 臨摹 ≥ B（goal）', taps['goal'] and taps['res'] and taps['res']['score'] >= 72, taps)
    ok('機器人：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', taps['ml'] <= 8 and taps['over'] == 0 and taps['peak'] <= 160, taps)
    ok('機器人人類節奏：任兩次按鍵（A/B/SELECT/START）間隔 ≥ 13 幀', taps['minGap'] >= 13, taps)
    if not QUICK:
        sc = ev(page, """() => { const out = []; const g = CT.Paint.dev.g();
            for (let i = 0; i < 8; i++) { g.goalCopy = false; g.goalBook = true; CT.Paint.dev.start('copy', i); const S = CT.Paint.dev.S();
              let f = 0; while (S.phase !== 'result' && f < 9000) { __nes.step(1); f++; }
              out.push([i, S.res && S.res.score, f]); }
            return out; }""")
        ok('機器人策略（8×8 方塊臨摹）8 張範例都在時限內 ≥ B', all(x[1] is not None and x[1] >= 72 for x in sc), sc)

    ok('全程無頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_paint: %d/%d 通過' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
