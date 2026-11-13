# -*- coding: utf-8 -*-
"""《星塵拼圖 STAR SLIDE》（cart3 槽 5，id = slide）自動驗證。

重點：6 張原創圖 × 每張一個 CHR bank（≤ 256、UI 索引各 bank 一致、屬性 = 每 16×16 一組調色盤）、
      打亂保證可解（滑塊奇偶 + 解題器真的解到底；旋轉 / 換位同樣）、`?seed=` 可重現、
      三模式操作（推一排 / 換位 / 2×2 旋轉）、半格滑動動畫、復原 / 提示 / 偷看、評價與紀錄、§6 規則、
      機器人（解題器 + 游標）3×3 + 4×4、每線 ≤ 8、VBlank ≤ 160。
作法：Playwright 開 `cart3.html?game=slide&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Slide.dev`。

用法：../卡比之星/.venv/bin/python games/cart3/test_slide.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart3.html').as_uri() + '?debug=1&scale=1&mute=1&game=slide'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Slide && !!CT.Slide.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart3.slide.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def st(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('(a) => { NES.Input.inject(a[0], 1); __nes.step(1); __nes.step(a[1]); }', [mask, after])


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
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
    reg = page.evaluate("""() => { const g = CT.get('slide'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id / order 5 / title / legacy 3 款', reg and reg['id'] == 'slide' and reg['order'] == 5 and reg['title'] == '星塵拼圖' and len(reg['legacy']) == 3, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText 右對齊 6 字元（ --:--）', reg['bestText'] == ' --:--', repr(reg['bestText']))
    ok('§6-4 backTile 指向自己精靈表的實心點', reg['bt'] and page.evaluate("(t) => t.tile === CT.Slide.Art.make().s('DOT')", reg['bt']), reg['bt'])
    banks = page.evaluate("""() => { const out = []; for (let i = 0; i < CT.Slide.Pics.count; i++) { const B = CT.Slide.Art.pic(i);
        out.push({ count: B.bank.count, base: B.base, font: B.bank.index('F_A'), slot: B.bank.index('SLOT'), st: B.pic.stats,
                   pal0: B.pic.pal[0], blk: B.pic.blockPal.length * B.pic.blockPal[0].length,
                   palsOk: B.pic.blockPal.every(r => r.every(p => p >= 0 && p <= 3)), mapOk: B.pic.map.length === 20 && B.pic.map.every(r => r.length === 20 && r.every(t => t >= 0 && t < B.pic.tiles.length)) }); }
        return out; }""")
    ok('≥ 6 張原創圖、每張一個 CHR bank 且 ≤ 256 磁磚', len(banks) >= 6 and all(b['count'] <= 256 for b in banks), [b['count'] for b in banks])
    ok('各 bank 的 UI 磁磚索引一致（換圖只換圖面磁磚）', len(set((b['font'], b['slot'], b['base']) for b in banks)) == 1, [(b['font'], b['base']) for b in banks])
    ok('圖面 20×20 磁磚、去重 / 合併後 ≤ 預算', all(b['mapOk'] and b['st']['final'] <= 256 - b['base'] for b in banks), [b['st'] for b in banks])
    ok('屬性：每 16×16 區塊一組調色盤（10×10 區、值 0..3）', all(b['palsOk'] and b['blk'] == 100 for b in banks))
    ok('文字色：每張圖第 0 組第 3 色都是白（$30）', all(b['pal0'][2] == 0x30 for b in banks), [b['pal0'] for b in banks])
    au = page.evaluate("() => ({ songs: Object.keys(CT.Slide.Audio.SONGS), sfx: Object.keys(CT.Slide.Audio.SFX) })")
    ok('BGM ≥ 1（3 首）、音效 ≥ 4，全部 slide_ 前綴', len(au['songs']) >= 1 and len(au['sfx']) >= 4 and all(k.startswith('slide_') for k in au['songs'] + au['sfx']), au)

    # ---------------- 可解性 / 解題器 ----------------
    v = page.evaluate("""() => { const S = CT.Slide.Solve, out = { slide: 0, slideBad: 0, parity: 0, rot: 0, rotBad: 0, swap: 0, swapBad: 0, notSolved: 0 };
        for (const n of [3, 4, 5]) for (let s = 1; s <= 30; s++) { const a = S.scrambleSlide(n, s * 7717 + n);
          if (S.slideSolvable(a, n)) out.parity++; if (S.solved(a)) out.notSolved++;
          const m = S.slide(a, n), b = a.slice(); let okm = !!m; if (m) for (const x of m) okm = okm && S.slideMove(b, n, x);
          if (okm && S.solved(b)) out.slide++; else out.slideBad++; }
        for (const n of [3, 4]) for (let s = 1; s <= 20; s++) { const r = S.scrambleRotate(n, s * 131 + n, n === 3 ? 8 : 14), m = S.rotateSolve(r.arr, n), b = r.arr.slice();
          if (m) for (const x of m) S.rotate(b, n, x.r, x.c, x.cw); if (m && S.solved(b)) out.rot++; else out.rotBad++; }
        for (const n of [3, 4, 5]) for (let s = 1; s <= 20; s++) { const a = S.scrambleSwap(n, s * 31 + n), m = S.swap(a), b = a.slice();
          for (const [i, j] of m) { const t = b[i]; b[i] = b[j]; b[j] = t; } if (S.solved(b) && m.length === S.swapPar(a)) out.swap++; else out.swapBad++; }
        return out; }""")
    ok('滑塊打亂 90 盤（3/4/5）全部通過奇偶可解判定、沒有一開始就拼好的', v['parity'] == 90 and v['notSolved'] == 0, v)
    ok('滑塊解題器（分段 BFS）90 盤全部真的解到底', v['slide'] == 90 and v['slideBad'] == 0, v)
    ok('旋轉解題器 40 盤（3×3 / 4×4）全部解到底', v['rot'] == 40 and v['rotBad'] == 0, v)
    ok('換位：循環分解解到底、步數 == n² − 循環數（最少交換）', v['swap'] == 60 and v['swapBad'] == 0, v)
    r = page.evaluate("""() => { const S = CT.Slide.Solve; const bad = [1, 0, 2, 3, 4, 5, 6, 7, 8];
        return { unsolvable: S.slideSolvable(bad, 3), solver: S.slide(bad, 3), same: S.scrambleSlide(4, 99).join() === S.scrambleSlide(4, 99).join(),
                 diff: S.scrambleSlide(4, 99).join() !== S.scrambleSlide(4, 100).join() }; }""")
    ok('奇偶判定抓得到不可解盤（只換兩片）且解題器拒解', r['unsolvable'] is False and r['solver'] is None, r)
    ok('?seed 可重現：同 seed 同盤、不同 seed 不同盤', r['same'] and r['diff'], r)

    # ---------------- 標題 ----------------
    def screen():
        return page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Slide.Art.make(); const rows = [];
            for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
              if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
            return rows; }""")
    txt = '\n'.join(screen())
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ =' in txt and 'CHEAT' in txt)
    ok('§6-1 標題按密技無效', page.evaluate('() => CT.cheat()') is False)
    r = page.evaluate("""() => { const p = __nes.nes().ppu; const before = CT.Slide.dev.g().pic; NES.Input.inject(32, 1); __nes.step(2); NES.Input.inject(32, 1); __nes.step(2);
        NES.Input.inject(128, 1); __nes.step(3); const g = CT.Slide.dev.g(); return { before, after: g.pic, bank: NES.CHR.getBank('slide_pic' + g.pic) !== null }; }""")
    ok('標題 PICTURE 列左右換圖（換 CHR bank）', r['after'] == (r['before'] + 1) % 6 and r['bank'], r)
    page.evaluate('() => { NES.Input.inject(2, 1); __nes.step(3); }')
    rows = screen()
    body = [i for i in range(4, 26) if rows[i].strip()]
    ok('說明頁：三模式都寫、段落之間空一列', all(k in '\n'.join(rows) for k in ('SLIDE', 'SWAP', 'ROTATE')) and all(body[i + 1] - body[i] >= 2 for i in range(len(body) - 1)), body)

    # ---------------- SLIDE ----------------
    page.evaluate('() => { CT.Slide.dev.start(0, 4, 0); __nes.step(2); }')
    s = st(page)
    ok('開局：游標在空格、名稱表 = 打亂後的圖（屬性跟著片走）', s['mode'] == 'play' and s['arr'][s['cr'] * 4 + s['cc']] == 15, s['arr'])
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), p = __nes.nes().ppu, B = g.B, o = CT.Slide.dev.off(), O = CT.Slide.dev.origin(); let bad = 0;
        for (let pos = 0; pos < 16; pos++) { const v = g.arr[pos]; if (v === 15) continue; const hr = v >> 2, hc = v & 3, tx = O[0] + (pos & 3) * 4, ty = O[1] + (pos >> 2) * 4;
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if (p.getTile(0, tx + dx, ty + dy) !== B.base + B.pic.map[o + hr * 4 + dy][o + hc * 4 + dx]) bad++;
          for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) if (p.getAttr(0, (tx >> 1) + sx, (ty >> 1) + sy) !== B.pic.blockPal[((o + hr * 4) >> 1) + sy][((o + hc * 4) >> 1) + sx]) bad++; }
        return bad; }""")
    ok('盤面每片的 16 磁磚 + 4 屬性都對（PPU 名稱表 / 屬性表實讀）', r == 0, r)
    page.evaluate('() => { const g = CT.Slide.dev.g(); g.cr = 0; g.cc = 0; NES.Input.inject(128, 30); for (let i = 0; i < 30; i++) __nes.step(1); NES.Input.inject(0, 1); __nes.step(1); }')
    ok('游標按住連發（第 1 幀 + 12 幀後每 4 幀，4×4 撞邊停在 3）', st(page)['cc'] == 3)
    page.evaluate('() => { const g = CT.Slide.dev.g(); g.cr = 0; g.cc = 0; NES.Input.inject(32, 13); for (let i = 0; i < 13; i++) __nes.step(1); NES.Input.inject(0, 1); __nes.step(1); }')
    ok('游標首延遲：按住 13 幀 = 2 格', st(page)['cr'] == 2, st(page)['cr'])
    # 推一排：把空格放在 (3,3)，游標到 (3,0) ⇒ 3 片一起推
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); g.arr = [4, 1, 2, 3, 0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; g.moves = 0; g.undo = []; CT.Slide.dev.g().anim = null;
        __nes.step(1); g.cr = 3; g.cc = 0; NES.Input.inject(1, 1); __nes.step(1); const p = __nes.nes().ppu, O = CT.Slide.dev.origin();
        const mid = []; for (let i = 0; i < 2; i++) { __nes.step(1); mid.push(GAME.state().s.anim); }
        __nes.step(30); return { arr: GAME.state().s.arr, moves: GAME.state().s.moves, mid }; }""")
    ok('A 推同一列的片 ⇒ 整排依序滑進空格（步數 = 片數）', r['arr'][12:16] == [15, 12, 13, 14] and r['moves'] == 3, r)
    ok('滑動動畫進行中（anim 旗標）', any(r['mid']), r['mid'])
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); g.cr = 0; g.cc = 1; const a0 = g.arr.slice(); NES.Input.inject(1, 1); __nes.step(3);
        return { same: GAME.state().s.arr.join() === a0.join() }; }""")
    ok('不在空格同列 / 同行 ⇒ 不動（只提示）', r['same'], r)
    # 半格動畫：推一片、第 1 幀名稱表上兩格中間是片的磁磚
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); g.arr = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,15,14]; g.anim = null; g.pending = []; __nes.step(1);
        g.cr = 3; g.cc = 3; NES.Input.inject(1, 1); __nes.step(1); for (let i = 0; i < 3; i++) __nes.step(1);
        const p = __nes.nes().ppu, O = CT.Slide.dev.origin(), B = g.B, o = CT.Slide.dev.off(); const tx = O[0] + 2 * 4 + 2, ty = O[1] + 3 * 4;
        const midOk = p.getTile(0, tx, ty) === B.base + B.pic.map[o + 3 * 4][o + 2 * 4];
        __nes.step(10); return { midOk, done: GAME.state().s.mode }; }""")
    ok('半格動畫：推一片時先畫在兩格正中間（16 px，仍對齊屬性）', r['midOk'], r)
    ok('拼好 ⇒ 完成畫面（最後一片補上）', r['done'] == 'done', r)
    rec = page.evaluate("() => ({ rec: CT.load('slide', 'rec_slide4', null), stars: CT.load('slide', 'stars', []), bt: CT.get('slide').bestText(), s: GAME.state().s })")
    ok('紀錄：各模式 × 尺寸最佳時間 / 步數、每張圖最佳星數；bestText 右對齊 6 字元（ mm:ss）', rec['rec'] and rec['stars'][0] >= 1 and len(rec['bt']) == 6 and rec['bt'][3] == ':', rec)
    # 復原 / 提示 / 偷看
    page.evaluate('() => { CT.Slide.dev.start(0, 3, 1); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), S = CT.Slide.Solve; const a0 = g.arr.slice(); const m = S.slide(g.arr, 3)[0];
        g.cr = Math.floor(m / 3); g.cc = m % 3; NES.Input.inject(1, 1); __nes.step(10); const a1 = GAME.state().s.arr.slice();
        NES.Input.inject(4, 1); __nes.step(1); __nes.step(3); return { moved: a1.join() !== a0.join(), back: GAME.state().s.arr.join() === a0.join(), moves: GAME.state().s.moves }; }""")
    ok('SELECT（放開時）= 復原一步（步數一起退回）', r['moved'] and r['back'] and r['moves'] == 0, r)
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), S = CT.Slide.Solve; const m = S.slide(g.arr, 3)[0]; g.cr = 0; g.cc = 0;
        NES.Input.inject(2, 1); __nes.step(1); __nes.step(2); const s = GAME.state().s; return { want: m, at: s.cr * 3 + s.cc, hints: s.hints }; }""")
    ok('B 點一下 = 提示：游標跳到解題器的下一步、提示數 +1', r['at'] == r['want'] and r['hints'] == 1, r)
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), p = __nes.nes().ppu, O = CT.Slide.dev.origin(), B = g.B, o = CT.Slide.dev.off();
        NES.Input.inject(2, 40); for (let i = 0; i < 28; i++) __nes.step(1);
        let solvedView = true; for (let pos = 0; pos < 9; pos++) { const tx = O[0] + (pos % 3) * 4, ty = O[1] + Math.floor(pos / 3) * 4;
          if (p.getTile(0, tx, ty) !== B.base + B.pic.map[o + Math.floor(pos / 3) * 4][o + (pos % 3) * 4]) solvedView = false; }
        const peek = GAME.state().s.peek; NES.Input.inject(0, 0); __nes.step(6); return { peek, solvedView, after: GAME.state().s.peek, hints: GAME.state().s.hints }; }""")
    ok('B 長按 20 幀 = 偷看完成圖、放開恢復（不算提示）', r['peek'] and r['solvedView'] and not r['after'] and r['hints'] == 1, r)

    # ---------------- SWAP / ROTATE ----------------
    page.evaluate('() => { CT.Slide.dev.start(1, 3, 2); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); const a0 = g.arr.slice(); g.cr = 0; g.cc = 0; NES.Input.inject(1, 1); __nes.step(2); const pick = GAME.state().s.pick;
        g.cr = 2; g.cc = 2; NES.Input.inject(1, 1); __nes.step(2); const a1 = GAME.state().s.arr; return { pick, ok: a1[0] === a0[8] && a1[8] === a0[0], moves: GAME.state().s.moves, par: GAME.state().s.par }; }""")
    ok('SWAP：A 選一片（標記）→ A 另一片 ⇒ 兩片交換、步數 +1；標準 = 最少交換', r['pick'] == 0 and r['ok'] and r['moves'] == 1 and r['par'] >= 1, r)
    page.evaluate('() => { CT.Slide.dev.start(2, 4, 3); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), S = CT.Slide.Solve; g.cr = 1; g.cc = 1; const a0 = g.arr.slice();
        NES.Input.inject(1, 1); __nes.step(3); const cw = S.rotate(a0.slice(), 4, 1, 1, true).join() === GAME.state().s.arr.join();
        NES.Input.inject(2, 1); __nes.step(1); __nes.step(3); const back = GAME.state().s.arr.join() === a0.join();
        return { cw, back, moves: GAME.state().s.moves }; }""")
    ok('ROTATE：A = 2×2 窗格順時針、B（點一下）= 逆時針', r['cw'] and r['back'] and r['moves'] == 2, r)
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); g.cr = 2; g.cc = 2; NES.Input.inject(128, 1); __nes.step(2); return GAME.state().s.cc; }""")
    ok('ROTATE：窗格游標不出界（4×4 只到 2）', r == 2, r)
    r = page.evaluate("""() => { NES.Input.inject(4, 32); for (let i = 0; i < 32; i++) __nes.step(1); NES.Input.inject(0, 1); __nes.step(2); return GAME.state().s.hints; }""")
    ok('ROTATE：SELECT 長按 = 提示（B 已拿去逆轉）', r == 1, r)

    # ---------------- 暫停 / 密技 ----------------
    page.evaluate('() => { CT.Slide.dev.start(0, 4, 0); __nes.step(2); }')
    r = page.evaluate("""() => { NES.Input.inject(4, 1); __nes.step(1); NES.Input.inject(12, 2); __nes.step(3); NES.Input.inject(0, 1); __nes.step(1); const p0 = GAME.state().s.paused, u0 = GAME.state().s.undo;
        const t0 = GAME.state().s.time; NES.Input.inject(8, 1); __nes.step(1); __nes.step(30); const s = GAME.state().s, mp = __nes.nes().music.isPaused();
        NES.Input.inject(8, 1); __nes.step(2); return { p0, u0, paused: s.paused, frozen: s.time <= t0 + 1, mp, after: GAME.state().s.paused, mp2: __nes.nes().music.isPaused() }; }""")
    ok('SELECT + START（回選單手勢）不暫停也不復原', r['p0'] is False and r['u0'] == 0, r)
    ok('START 暫停：時間凍結；§6-2 BGM 暫停、恢復接續', r['paused'] and r['frozen'] and r['mp'] is True and r['mp2'] is False and r['after'] is False, r)
    r = page.evaluate("""() => { const m0 = GAME.state().s.moves; const c = CT.cheat(); __nes.step(2); const s = GAME.state().s; return { c, moved: s.moves - m0, cheat: s.cheatUsed, goal: GAME.state().goal }; }""")
    ok('§6-1 遊玩中密技 = 解題器代走 10 步；用過之後 goal 一律 false', r['c'] and r['moved'] == 10 and r['cheat'] and r['goal'] is False, r)

    # ---------------- fix-r7：內容等價 / 片號輔助 / 標題文字 / HUD 不貼頂 ----------------
    r = page.evaluate("""() => { const d = CT.Slide.dev; return { c4: d.classes(5, 4, false), c5: d.classes(5, 5, false), s4: d.classes(5, 4, true) }; }""")
    ok('P2-4 內容等價：星鯨 4×4 第 12/13 片、5×5 第 20/21 片同類（畫面像素只差 ≤ 12 px）', r['c4'][12] == r['c4'][13] and r['c5'][20] == r['c5'][21], (r['c4'], r['c5']))
    ok('P2-4 滑塊的空格片自成一類（不和別片合併）', r['s4'][15] == 15 and r['s4'].count(15) == 1, r['s4'])
    page.evaluate('() => { CT.Slide.dev.start(1, 4, 5); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(); const a = [...Array(16).keys()]; a[12] = 13; a[13] = 12; a[0] = 1; a[1] = 0; g.arr = a; g.pickPos = -1; g.plan = null;
        g.cr = 0; g.cc = 0; NES.Input.inject(1, 1); __nes.step(2); g.cr = 0; g.cc = 1; NES.Input.inject(1, 1); __nes.step(3);
        const s = GAME.state().s; return { mode: s.mode, arr: s.arr.slice(12, 14), exact: CT.Slide.Solve.solved(s.arr) }; }""")
    ok('P2-4 SWAP 星鯨 4×4：第 12/13 片互換、其餘拼好 ⇒ 判定完成', r['mode'] == 'done' and r['arr'] == [13, 12] and not r['exact'], r)
    page.evaluate('() => { CT.Slide.dev.start(2, 4, 5); __nes.step(2); }')
    r = page.evaluate("""() => { const g = CT.Slide.dev.g(), S = CT.Slide.Solve; const a = [...Array(16).keys()]; a[12] = 13; a[13] = 12; S.rotate(a, 4, 1, 1, false); g.arr = a; g.plan = null;
        g.cr = 1; g.cc = 1; NES.Input.inject(1, 1); __nes.step(3); return GAME.state().s.mode; }""")
    ok('P2-4 ROTATE 星鯨 4×4：第 12/13 片互換仍判定完成', r == 'done', r)
    r = page.evaluate("""() => { const S = CT.Slide.Solve, d = CT.Slide.dev; let ok = 0, bad = [];
        for (const pic of [0, 3, 5]) for (const n of [4, 5]) { const cls = d.classes(pic, n, true);
          for (let s = 1; s <= 8; s++) { const a = S.scrambleSlide(n, s * 97 + pic), c = S.canon(a, cls, n), m = S.slide(c, n), b = a.slice();
            if (m) for (const x of m) S.slideMove(b, n, x); if (m && S.solvedEq(b, cls)) ok++; else bad.push([pic, n, s]); } }
        return { ok, bad }; }""")
    ok('P2-4 滑塊：依內容重新編號後仍可解（奇偶修正）、解題器解到「內容完成」（48 盤）', r['ok'] == 48 and not r['bad'], r)
    page.evaluate('() => { CT.Slide.dev.start(0, 5, 0); __nes.step(2); }')
    r = page.evaluate("""() => { const n0 = GAME.state().s.nums; NES.Input.inject(4, 32); for (let i = 0; i < 32; i++) __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
        const s = GAME.state().s;
        let ml = 0; for (let f = 0; f < 40; f++) { NES.Input.inject(f % 8 === 0 ? 128 : 0, 1); __nes.step(1); ml = Math.max(ml, __nes.stats().maxSpritesLine | 0); }
        return { n0, n1: s.nums, undo: s.undo, saved: CT.load('slide', 'nums', 0), ml }; }""")
    ok('片號輔助：SLIDE / SWAP 長按 SELECT 切換（不算復原）、設定存檔', r['n0'] is False and r['n1'] is True and r['undo'] == 0 and r['saved'] == 1, r)
    ok('片號輔助 5×5 開啟：每線精靈 ≤ 8（一列 5 顆片號 + 游標錯開掃描線）', 0 < r['ml'] <= 8, r)
    page.evaluate('() => { CT.Slide.dev.title(); __nes.step(2); }')
    rows = screen()
    txt = '\n'.join(rows)
    ok('P3-4 標題：C/★ = CHEAT 完整一段、不再黏成 MENUCHEAT', 'C/$ = CHEAT' in txt and 'MENUCHEAT' not in txt.replace(' ', ''), [r_ for r_ in rows if 'CHEAT' in r_])
    ok('標題有 NUMBERS 開關列', 'NUMBERS' in txt)
    top_title = rows[1].strip()
    page.evaluate('() => { CT.Slide.dev.start(0, 3, 0); __nes.step(2); }')
    rows = screen()
    ok('P3-5 HUD 不貼頂：標題 / 遊玩畫面第 1 列（y=0）留空、標題字在第 2 列', top_title == '' and rows[1].strip() == '' and 'STAR SLIDE' in rows[2], (top_title, rows[1], rows[2]))

    # ---------------- 機器人 ----------------
    fresh(page, '&bot=1')
    rr = page.evaluate(RUN, {'n': 30000, 'until': 'goal'})
    ok('機器人（解題器 + 一格一格移動游標，不開密技）：SLIDE 3×3 + 4×4 各拼好 → goal', rr['goal'] and sorted(rr['s']['goalDone']) == [3, 4], {'f': rr['f'], 'done': rr['s']['goalDone']})
    ok('機器人全程：每線 ≤ 8、overFrames 0、VBlank 尖峰 ≤ 160', rr['ml'] <= 8 and rr['over'] == 0 and rr['peak'] <= 160, {'ml': rr['ml'], 'over': rr['over'], 'peak': rr['peak']})
    ok('機器人步數 == 標準（★★★）', rr['s']['stars'] == 3 and rr['s']['moves'] == rr['s']['par'], rr['s'])
    print('  機器人：goal %d 幀、每線峰值 %d、overFrames %d、VBlank 尖峰 %d' % (rr['f'], rr['ml'], rr['over'], rr['peak']))
    lint = page.evaluate('() => { __nes.render(); const r = __nes.lint(); return { ok: r.ok !== false, colors: r.colors }; }')
    ok('完成畫面 lint 綠（≤ 25 色）', lint['ok'], lint)
    # 6 張圖的標題畫面都 lint 綠
    bad = page.evaluate("""() => { const out = []; for (let i = 0; i < 6; i++) { const g = CT.Slide.dev.g(); g.pic = i; CT.Slide.dev.title(); __nes.step(2); __nes.render();
        const r = __nes.lint(); if (r.ok === false) out.push([i, r.colors]); } return out; }""")
    ok('6 張圖的標題畫面（整張 160×160）lint 全綠', not bad, bad)

    ok('頁面錯誤 0', not errs, errs[:3])
    browser.close()
    pw.stop()
    n_ok = sum(1 for r_ in results if r_[0])
    print('test_slide: %d / %d PASS' % (n_ok, len(results)))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
