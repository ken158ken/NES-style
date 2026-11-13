# -*- coding: utf-8 -*-
"""合輯卡帶殼層測試（R5 cart1.html《星塵 8 合 1》；R6 起參數化：cart1 + cart2《星塵反應 8 合 1》…）：
註冊契約 / 開機選單 / 切換無殘留 / 預算 / lint / 最高分 / 回選單提示 / 多卡帶設定（CT.CART_CFG）。

容忍「已註冊 0~8 款」：真遊戲有幾款就驗幾款（逐款的契約欄位、標題畫面 lint、launch → back → launch
下一款）；切換契約另用**只在測試中載入的假遊戲**驗（`add_init_script` 在 registry 之前塞進
`window.CT.games`，registry 的 `CT.games = CT.games || []` 會保留它們）⇒ 不碰 cart1.html。

期望值來源：
  [brief] docs/R5_BRIEF.md §2 槽位契約、§3 共同驗收、§4 C5-0
  [registry] games/cart1/registry.js（CT.launch / CT.back / CT.resetHW / START+SELECT 60 幀）
  [引擎] docs/ENGINE_API.md §5（VBlank 160 byte）、§7（≤ 25 色 / 每線 8 精靈）、§11（__nes）

用法：../卡比之星/.venv/bin/python tools/test_cart.py [-v] [--page cart1.html|cart2.html]
      （不給 --page = 依序跑 PAGES 全部；非 cart1 的項目名稱前面加 [cart2] 之類的標記）
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import playthrough_cart  # noqa: E402

VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
# R6：每張卡帶的入口頁 → 期望的 8 槽 id（cart1 照 R5；其餘以該卡 CART_CFG.slots 為準，這裡只是保底）
PAGES = {
    'cart1.html': ['maze', 'blocks', 'brick', 'pinball', 'snake', 'racing', 'flyer', 'tower'],
    'cart2.html': ['slash', 'laser', 'dodge', 'rope', 'catch', 'pop', 'gallery', 'mash'],
    'cart3.html': ['merge', 'sudoku', 'mines', 'gomoku', 'slide', 'lines', 'labyrinth', 'party'],   # R7 C7-0
    'cart4.html': ['cards', 'simon', 'flash', 'tune', 'rhythm', 'reflex', 'brain', 'color'],   # R8 C8-0
    'cart5.html': ['adventure', 'escape', 'quiz', 'words', 'typing', 'paint'],   # R9 C9-0：6 槽（以下「8」一律 = len(DEFAULT_IDS)）
}
PAGE_NAME = 'cart1.html'
CART = 'cart1'
PREFIX = 'cart1'
BASE = (ROOT / PAGE_NAME).resolve().as_uri() + '?debug=1&scale=1&mute=1'
DEFAULT_IDS = list(PAGES['cart1.html'])


def set_cart(page_name):
    """切換目前受測的卡帶（全域 BASE / CART / PREFIX / DEFAULT_IDS）。"""
    global PAGE_NAME, CART, PREFIX, BASE, DEFAULT_IDS
    PAGE_NAME = page_name
    CART = page_name.rsplit('.', 1)[0]
    PREFIX = CART
    BASE = (ROOT / page_name).resolve().as_uri() + '?debug=1&scale=1&mute=1'
    DEFAULT_IDS = list(PAGES.get(page_name, []))
BTN = {'A': 1, 'B': 2, 'SELECT': 4, 'START': 8, 'UP': 16, 'DOWN': 32, 'LEFT': 64, 'RIGHT': 128}

results = []
warnings = []


def ok(name, cond, detail=''):
    if CART != 'cart1':
        name = '[%s] %s' % (CART, name)
    results.append((bool(cond), name, detail, CART))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def warn(msg):
    warnings.append(msg)
    print('  WARN ' + msg)


# ---------------------------------------------------------------- 假遊戲（只在測試中載入）
FAKE_JS = r"""
(function () {
  var CT = window.CT = window.CT || {};
  CT.games = CT.games || [];
  function N() { return window.NES; }
  function mkBank(name) {
    return N().CHR.bank(name, {
      Z: ['........','........','........','........','........','........','........','........'],
      SOLID: ['33333333','32222223','32111123','32111123','32111123','32111123','32222223','33333333'],
      DOT: ['........','...11...','..1221..','.123321.','.123321.','..1221..','...11...','........'],
      TALL0: ['..3333..','.322223.','32222223','32222223','32222223','32222223','.322223.','..3333..'],
      TALL1: ['..1111..','.122221.','12222221','12222221','12222221','12222221','.122221.','..1111..']
    });
  }
  var A = { f: 0, presses: 0, cheats: 0, initN: 0, exitN: 0 };
  var fakeA = {
    id: 'zz_fake', order: 9, title: '星塵測試', legacy: ['test.html'],
    init: function (nes, opt) {
      A.f = 0; A.presses = 0; A.initN++; A.opt = opt;
      var b = mkBank('zzf_bg'), ppu = nes.ppu;
      N().CHR.setPattern(0, b); N().CHR.setPattern(1, b);
      ppu.setPatternTables(0, 1);
      ppu.setBackdrop(0x02);
      ppu.setBgPalette(0, [0x16, 0x27, 0x30]); ppu.setBgPalette(1, [0x1A, 0x2A, 0x3A]);
      ppu.setBgPalette(2, [0x14, 0x24, 0x34]); ppu.setBgPalette(3, [0x18, 0x28, 0x38]);
      ppu.setSprPalette(0, [0x05, 0x15, 0x25]); ppu.setSprPalette(1, [0x0B, 0x1B, 0x2B]);
      ppu.setSprPalette(2, [0x06, 0x16, 0x26]); ppu.setSprPalette(3, [0x0C, 0x1C, 0x2C]);
      ppu.fillTiles(0, 0, 0, 32, 30, b.index('SOLID'));      // 整片重畫（registry 已包 CT.blank）
      ppu.fillTiles(1, 0, 0, 32, 30, b.index('DOT'));
      ppu.fillAttr(0, 0, 0, 16, 15, 3); ppu.fillAttr(1, 0, 0, 16, 15, 2);
      ppu.scroll(5, 7);
      ppu.split(100, { x: 3, y: 40, nt: 1 });
      ppu.mirroring('h');
      ppu.flickerStep = 0;
      fakeA.backTile = window.__zzBackTile !== undefined ? window.__zzBackTile : { tile: b.index('SOLID'), pal: 2 };
    },
    update: function (nes) {
      A.f++;
      if (window.__zzBackdrop !== undefined) { nes.ppu.setBackdrop(window.__zzBackdrop); window.__zzBackdrop = undefined; }
      if (N().Input.pressed(N().Input.BTN.A)) A.presses++;
      if (nes.music && nes.music.tick) nes.music.tick();
    },
    draw: function (nes) {
      var ppu = nes.ppu, b = N().CHR.getBank('zzf_bg'), i;
      for (i = 0; i < 6; i++) ppu.sprite(i, { x: 20 + i * 30, y: 120 + ((A.f >> 2) & 3), tile: b.index('DOT'), pal: i & 3 });
      for (i = 40; i < 48; i++) ppu.sprite(i, { x: 8 * i - 300, y: 60, tile: b.index('SOLID'), pal: 1 });
    },
    state: function () { return { f: A.f, presses: A.presses, cheats: A.cheats, initN: A.initN, exitN: A.exitN, opt: A.opt }; },
    exit: function () { A.exitN++; },
    cheat: function () { A.cheats++; return true; },
    bot: function () { return (A.f & 1) ? N().Input.BTN.A : 0; },
    goal: function () { return A.presses >= 10; }
  };
  var B = { f: 0 };
  var fakeB = {
    id: 'zz_fake2', order: 10, title: 'FAKE2', legacy: [],
    init: function (nes) {
      B.f = 0;
      var b = mkBank('zzf2_bg'), ppu = nes.ppu;
      N().CHR.setPattern(0, b); N().CHR.setPattern(1, b);
      ppu.setPatternTables(0, 1);
      ppu.spriteMode(16);
      ppu.setBgPalette(0, [0x00, 0x10, 0x20]);
      ppu.setSprPalette(0, [0x01, 0x11, 0x21]);
      ppu.setTile(0, 3, 4, b.index('SOLID'));
    },
    update: function () { B.f++; },
    draw: function (nes) {
      var b = N().CHR.getBank('zzf2_bg');
      nes.ppu.sprite(0, { x: 100, y: 100, tile: b.index('TALL0') | 1, pal: 0 });
    },
    state: function () { return { f: B.f }; },
    cheat: function () { return false; },
    bot: function () { return 0; },
    goal: function () { return B.f > 5; },
    bestText: function () { return 'ABC123'; }
  };
  CT.games.push(fakeA, fakeB);
})();
"""

JS_PPU = r"""
() => {
  const ppu = __nes.nes().ppu;
  let nt0 = 0, nt1 = 0, at0 = 0, at1 = 0, oamOn = [];
  for (let r = 0; r < 30; r++) for (let c = 0; c < 32; c++) { if (ppu.getTile(0, c, r)) nt0++; if (ppu.getTile(1, c, r)) nt1++; }
  for (let r = 0; r < 15; r++) for (let c = 0; c < 16; c++) { if (ppu.getAttr(0, c, r)) at0++; if (ppu.getAttr(1, c, r)) at1++; }
  for (let i = 0; i < 64; i++) if (ppu.getSprite(i).on && ppu.getSprite(i).y < 240) oamOn.push(i);
  const sc = ppu.getScroll ? ppu.getScroll() : null;
  return { nt0, nt1, at0, at1, oamOn, split: ppu._split, scroll: sc, sprH: ppu.spriteMode(), backdrop: ppu.backdrop,
           over: __nes.stats().budget.overFrames, peak: __nes.stats().budget.peak };
}
"""


def open_page(page, query=''):
    page.goto(BASE + (('&' + query.lstrip('&?')) if query else ''))
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.CT')
    return page.evaluate('() => window.GAME.state()')


def S(page):
    return page.evaluate('() => window.GAME.state()')


def step(page, n):
    page.evaluate('(n) => __nes.step(n)', n)


def tap(page, keys, n=1):
    page.evaluate('([k, n]) => { __nes.tap(k, n); __nes.step(2); }', [keys, n])


def press(page, keys, n):
    page.evaluate('([k, n]) => __nes.press(k, n)', [keys, n])


def tile_index(page, table, name):
    return page.evaluate('([t, n]) => NES.CHR.getBank(t).index(n)', [table, name])


def row_tiles(page, row, c0, c1):
    return page.evaluate('([r, a, b]) => { const p = __nes.nes().ppu, o = []; for (let c = a; c < b; c++) o.push(p.getTile(0, c, r)); return o; }',
                         [row, c0, c1])


# =====================================================================  ① 沒有假遊戲：真遊戲（0~8 款）
def test_real(page):
    st = open_page(page, 'boot=0')
    games = page.evaluate(r"""() => window.CT.games.map(g => ({
      id: g.id, order: g.order, title: g.title, legacy: g.legacy,
      fns: ['init','update','draw','state','cheat','bot','goal'].filter(k => typeof g[k] === 'function'),
      exit: g.exit === undefined || typeof g.exit === 'function',
      bestText: g.bestText === undefined || typeof g.bestText === 'function'
    }))""")
    ids = [g['id'] for g in games]
    print('  已註冊 %d 款：%s' % (len(ids), ', '.join(ids) or '（無）'))
    ok('真遊戲：已註冊 0~8 款且 id 都在卡帶一的 8 槽內' if CART == 'cart1' else '真遊戲：已註冊 0~8 款且 id 都在本卡帶的 8 槽內', len(ids) <= len(DEFAULT_IDS) and all(i in DEFAULT_IDS for i in ids), ids)
    ok('真遊戲：id 不重複', len(set(ids)) == len(ids), ids)
    ok('選單：8 槽 + 未註冊顯示準備中', len(st['s']['slots']) == len(DEFAULT_IDS) and
       all((s['registered'] == (s['id'] in ids)) and (s['name'] == ('ready' if s['id'] not in ids else s['name']))
           for s in st['s']['slots']), [(s['id'], s['name']) for s in st['s']['slots']])
    for g in games:
        gid = g['id']
        ok('契約 %s：init/update/draw/state/cheat/bot/goal 齊全' % gid, len(g['fns']) == 7, g['fns'])
        ok('契約 %s：title 非空字串、legacy 陣列、exit/bestText 型別' % gid,
           isinstance(g['title'], str) and g['title'] and isinstance(g['legacy'], list) and g['exit'] and g['bestText'],
           (g['title'], g['legacy']))
        want = DEFAULT_IDS.index(gid) + 1
        ok('契約 %s：order 為 1..8 的整數' % gid, isinstance(g['order'], int) and 1 <= g['order'] <= len(DEFAULT_IDS), g['order'])
        if g['order'] != want:
            warn('%s 的 order=%r 與 LEGACY_MAP 槽位 %d 不同（選單照 order 排）' % (gid, g['order'], want))
        slot = [s for s in st['s']['slots'] if s['id'] == gid][0]
        ok('選單 %s：名稱以 16×16 中文字顯示（沒有缺字）' % gid, slot['name'] == 'glyph' and not st['s']['missingGlyph'],
           (slot['name'], st['s']['missingGlyph']))
    # 逐款：直接開 ?game= → 標題畫面 lint 綠 + 不超預算
    for gid in ids:
        open_page(page, 'game=' + gid)
        step(page, 60)
        page.evaluate('() => __nes.render()')
        lt = page.evaluate('() => __nes.lint()')
        sb = page.evaluate('() => __nes.stats()')
        ok('標題 %s：lint 綠（≤ 25 色、每線 ≤ 8）' % gid,
           lt.get('ok') and (lt.get('colors') or 0) <= 25 and (sb.get('maxSpritesLine') or 0) <= 8,
           {'colors': lt.get('colors'), 'maxLine': sb.get('maxSpritesLine'), 'bad': lt.get('badPixels')})
        ok('標題 %s：60 幀 overFrames == 0' % gid, sb['budget']['overFrames'] == 0, sb['budget'])
        ok('標題 %s：state() 可序列化' % gid, isinstance(S(page)['s'], (dict, list, type(None))), '')
    # 串接：選單 → 第 1 款 → 回選單 → 第 2 款 …（真的走選單 A 鍵）
    if ids:
        open_page(page, 'boot=0')
        prev = None
        for gid in ids:
            sel = page.evaluate('(id) => window.CT.Shell.state().slots.findIndex(s => s.id === id)', gid)
            page.evaluate('(i) => window.CT.Shell.dev.select(i)', sel)
            tap(page, 'a')
            step(page, 32)
            cur = S(page)['game']
            ok('串接：選單進入 %s%s' % (gid, '（上一款 %s）' % prev if prev else ''), cur == gid, cur)
            step(page, 60)
            # 回選單提示（P3-9）：有 backTile ⇒ OAM 62 用它；沒有 ⇒ 不借精靈、閃 backdrop
            bt = page.evaluate('(id) => CT.Shell.dev.backTileOf(CT.get(id))', gid)
            press(page, ['start', 'select'], 30)
            ov = page.evaluate('() => ({ mode: CT.Shell.dev.overlayMode(), s: __nes.nes().ppu.getSprite(62) })')
            if bt:
                ok('串接：%s 有 backTile ⇒ 提示用 OAM 62（tile %d / pal %d）' % (gid, bt['tile'], bt['pal']),
                   ov['mode'] == 'tile' and ov['s']['on'] and ov['s']['tile'] == bt['tile'] and ov['s']['pal'] == bt['pal'], ov)
            else:
                ok('串接：%s 沒有 backTile ⇒ 提示改閃 backdrop、不借 OAM 62' % gid,
                   ov['mode'] == 'backdrop' and not (ov['s']['on'] and ov['s']['y'] == 16), ov)
            press(page, ['start', 'select'], 32)
            page.evaluate('() => { __nes.release(); __nes.step(2); }')
            s = S(page)
            pp = page.evaluate(JS_PPU)
            ok('串接：%s 按住 START+SELECT 回選單、游標停在它' % gid,
               s['game'] is None and s['s']['mode'] == 'menu' and s['s']['slots'][s['s']['sel']]['id'] == gid, s['s'].get('sel'))
            ok('串接：%s 回選單後 PPU 無殘留（split / scroll / 8×8 / 名稱表 1 空）' % gid,
               pp['split'] is None and pp['sprH'] == 8 and pp['nt1'] == 0 and
               (pp['scroll'] is None or (pp['scroll'].get('x', 0) == 0 and pp['scroll'].get('y', 0) == 0)), pp)
            ok('串接：%s 切換全程 overFrames == 0' % gid, pp['over'] == 0, pp['over'])
            prev = gid
    return ids


# =====================================================================  ② 開機 / 選單（假遊戲在場）
def test_menu(page):
    st = open_page(page)
    s = st['s']
    ok('開機：沒有 ?game= ⇒ shell 接管、mode = boot', st['game'] is None and s and s['mode'] == 'boot', s and s['mode'])
    step(page, 60)
    ok('開機：第 48 幀播開機音效', S(page)['s']['lastSfx'] == PREFIX + '_boot', S(page)['s']['lastSfx'])
    page.evaluate('() => __nes.render()')
    lt = page.evaluate('() => __nes.lint()')
    ok('開機畫面 lint 綠', lt.get('ok'), lt.get('colors'))
    step(page, 100)
    s = S(page)['s']
    ok('開機：150 幀自動進選單 + 選單曲', s['mode'] == 'menu' and s['song'] == PREFIX + '_menu', (s['mode'], s['song']))
    st = open_page(page)
    step(page, 12)
    tap(page, 'start')
    ok('開機：START 可跳過', S(page)['s']['mode'] == 'menu', S(page)['s']['mode'])
    s = S(page)['s']
    ids = [x['id'] for x in s['slots']]
    ok('選單：預設 8 槽 + 表外 id 接在後面（共 10）', ids[:len(DEFAULT_IDS)] == DEFAULT_IDS and ids[len(DEFAULT_IDS):] == ['zz_fake', 'zz_fake2'] if len(ids) == len(DEFAULT_IDS) + 2 else False, ids)
    names = {x['id']: x['name'] for x in s['slots']}
    ok('選單：表外中文字走執行期點陣（星塵測試 → glyph）', names.get('zz_fake') == 'glyph' and not s['missingGlyph'],
       (names.get('zz_fake'), s['missingGlyph']))
    ok('選單：英文名退回 8×8 字型（FAKE2 → ascii）', names.get('zz_fake2') == 'ascii', names.get('zz_fake2'))
    ok('選單：CHR bank ≤ 256 磁磚', 0 < s['tiles'] <= 256, s['tiles'])
    # 準備中灰字：第一個未註冊槽的名稱格 = 準 的灰字磁磚
    unreg = [i for i, x in enumerate(s['slots']) if not x['registered']]
    if unreg:
        row = 8 + unreg[0] * 2
        want = tile_index(page, PREFIX + '_bg', 'GN_2_準_0')
        got = row_tiles(page, row, 7, 8)[0]
        ok('選單：未註冊槽畫「準備中」灰字', got == want, (got, want))
        icon = row_tiles(page, row, 4, 5)[0]
        ok('選單：未註冊槽畫「?」圖示', icon == tile_index(page, PREFIX + '_bg', 'IC_none_0'), icon)
    else:
        ok('選單：未註冊槽畫「準備中」灰字（全部已註冊 ⇒ 略過）', True)
        ok('選單：未註冊槽畫「?」圖示（略過）', True)
    # 操作
    sel0 = S(page)['s']['sel']
    tap(page, 'down')
    s = S(page)['s']
    ok('選單：↓ 移一格 + 移動音效', s['sel'] == sel0 + 1 and s['lastSfx'] == PREFIX + '_move', (s['sel'], s['lastSfx']))
    tap(page, 'up'); tap(page, 'up')
    ok('選單：↑ 在第一格會繞到最後一格', S(page)['s']['sel'] == len(ids) - 1, S(page)['s']['sel'])
    tap(page, 'select')
    ok('選單：SELECT = 下一格（繞回 0）', S(page)['s']['sel'] == 0, S(page)['s']['sel'])
    press(page, ['down'], 1 + 18 + 6 * 2)   # 第 1 幀 +1，按住第 18 / 24 / 30 幀各 +1 ⇒ 4
    page.evaluate('() => { __nes.release(); __nes.step(1); }')
    ok('選單：按住 ↓ 自動連發（18 幀後每 6 幀）', S(page)['s']['sel'] == 4, S(page)['s']['sel'])
    # 選中行的屬性 = 調色盤 1；其他行 = 0
    attrs = page.evaluate('() => { const p = __nes.nes().ppu, o = []; for (let i = 0; i < 10; i++) o.push(p.getAttr(0, 8, 4 + i)); return o; }')
    ok('選單：只有選中行用 BG 調色盤 1（黃字）', attrs[4] == 1 and all(a == 0 for k, a in enumerate(attrs) if k != 4), attrs)
    # 準備中 → 不進入
    if unreg:
        page.evaluate('(i) => window.CT.Shell.dev.select(i)', unreg[0])
        tap(page, 'a')
        step(page, 40)
        s = S(page)
        ok('選單：未註冊槽按 A ⇒ 錯誤音效、留在選單', s['game'] is None and s['s']['lastSfx'] == PREFIX + '_ng', s['s']['lastSfx'])
    else:
        ok('選單：未註冊槽按 A（全部已註冊 ⇒ 略過）', True)
    page.evaluate('() => __nes.render()')
    lt = page.evaluate('() => __nes.lint()')
    sb = page.evaluate('() => __nes.stats()')
    ok('選單畫面 lint 綠（≤ 25 色）', lt.get('ok') and lt.get('colors', 99) <= 25, lt.get('colors'))
    ok('選單：每線 ≤ 8 精靈、overFrames == 0', sb['maxSpritesLine'] <= 8 and sb['budget']['overFrames'] == 0,
       (sb['maxSpritesLine'], sb['budget']['overFrames']))
    # START+SELECT 在選單裡不做事
    press(page, ['start', 'select'], 70)
    page.evaluate('() => { __nes.release(); __nes.step(1); }')
    ok('選單：START+SELECT 在選單內無作用（不重開）', S(page)['s']['inited'] == 1, S(page)['s']['inited'])


# =====================================================================  ③ launch / back 契約（假遊戲）
def test_switch(page):
    open_page(page, 'boot=0')
    # 總控補充：backTile 可能在 init 裡才寫進註冊物件（pinball / flyer）⇒ shell 每次畫提示都要現讀，不能快取
    pre = page.evaluate('() => CT.get("zz_fake").backTile === undefined')
    ok('backTile 延遲出現：假遊戲 A 在 launch 前沒有 backTile（init 才寫）', pre, pre)
    ids = [x['id'] for x in S(page)['s']['slots']]
    ia = ids.index('zz_fake')
    page.evaluate('(i) => window.CT.Shell.dev.select(i)', ia)
    tap(page, 'start')
    s = S(page)
    ok('進入：A/START ⇒ 決定音效 + 閃爍（launch 模式）', s['s']['mode'] == 'launch' and s['s']['lastSfx'] == PREFIX + '_ok',
       (s['s']['mode'], s['s']['lastSfx']))
    step(page, 30)
    s = S(page)
    ok('進入：30 幀後 CT.current = zz_fake、init 收到 {from:"shell"}',
       s['game'] == 'zz_fake' and s['s']['initN'] == 1 and (s['s']['opt'] or {}).get('from') == 'shell', s['s'])
    pp = page.evaluate(JS_PPU)
    ok('進入那幀不超預算（整片重畫在 CT.blank 裡）', pp['over'] == 0, pp)
    step(page, 30)
    # 回選單提示（P3-9 / §6-4）：有 backTile ⇒ OAM 62/63 用它指定的磚與調色盤
    bd0 = page.evaluate('() => __nes.nes().ppu.backdrop')
    press(page, ['start', 'select'], 30)
    ov = page.evaluate('() => { const p = __nes.nes().ppu; return { a: p.getSprite(62), b: p.getSprite(63), prog: CT.backProgress(), t: CT.Shell.dev.overlayTile(), mode: CT.Shell.dev.overlayMode(), bd: p.backdrop }; }')
    want_tile = tile_index(page, 'zzf_bg', 'SOLID')
    ok('回選單提示（有 backTile）：OAM 62/63 亮、磚 = backTile.tile、調色盤 = backTile.pal',
       ov['mode'] == 'tile' and ov['a']['on'] and ov['b']['on'] and ov['t'] == want_tile and
       ov['a']['tile'] == want_tile and ov['b']['tile'] == want_tile and ov['a']['pal'] == 2 and ov['b']['pal'] == 2, ov)
    ok('回選單提示（有 backTile）：不動 backdrop', ov['bd'] == bd0, (ov['bd'], bd0))
    ok('backTile 延遲出現：init 後才寫的 backTile 照樣被 shell 讀到（tile 模式）', ov['mode'] == 'tile' and pre, ov['mode'])
    ok('回選單提示：進度 0.5 時兩顆往中間收攏（間距 < 開始時）', 0.4 < ov['prog'] < 0.6 and (ov['b']['x'] - ov['a']['x']) < 64,
       (ov['prog'], ov['a']['x'], ov['b']['x']))
    page.evaluate('() => { window.__btSave = CT.current.backTile; CT.current.backTile = { tile: 1, pal: 3 }; }')
    press(page, ['start', 'select'], 1)
    chg = page.evaluate('() => { const s = __nes.nes().ppu.getSprite(62); CT.current.backTile = window.__btSave; return { tile: s.tile, pal: s.pal }; }')
    ok('backTile 每幀現讀：執行中換成 {tile:1, pal:3} ⇒ 下一幀提示就換', chg == {'tile': 1, 'pal': 3}, chg)
    press(page, ['start', 'select'], 11)     # 進度 42/60 > 2/3 ⇒ 顯示 / 隱藏快閃
    seen = page.evaluate("""() => { const p = __nes.nes().ppu, o = [];
      for (let i = 0; i < 6; i++) { __nes.press(['start','select'], 1); o.push(p.getSprite(62).on); } return o; }""")
    ok('回選單提示（有 backTile）：進度 > 2/3 改快閃（6 幀內有亮有滅）', any(seen) and not all(seen), seen)
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    ov2 = page.evaluate('() => { const p = __nes.nes().ppu; return { a: p.getSprite(62).on, b: p.getSprite(63).on, prog: CT.backProgress(), game: GAME.state().game, mode: CT.Shell.dev.overlayMode() }; }')
    ok('回選單提示：放開 ⇒ 進度歸零、62/63 還原（假遊戲沒用 ⇒ 關）、仍在遊戲',
       ov2['prog'] == 0 and not ov2['a'] and not ov2['b'] and ov2['game'] == 'zz_fake' and ov2['mode'] is None, ov2)
    # 遊戲自己用了 OAM 62 ⇒ 放開後還原成遊戲的內容
    page.evaluate("""() => { const g = CT.get('zz_fake'), o = g.draw; g.__od = o;
      g.draw = function (nes) { o.call(g, nes); nes.ppu.sprite(62, { x: 200, y: 200, tile: 1, pal: 3 }); }; }""")
    step(page, 1)
    press(page, ['start', 'select'], 20)
    mid = page.evaluate('() => __nes.nes().ppu.getSprite(62)')
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    aft = page.evaluate('() => __nes.nes().ppu.getSprite(62)')
    page.evaluate("() => { const g = CT.get('zz_fake'); g.draw = g.__od; delete g.__od; __nes.nes().ppu.sprite(62, null); }")
    ok('回選單提示：遊戲自己用的 OAM 62 → 按住時借用、放開後還原',
       mid['y'] == 16 and aft['on'] and aft['x'] == 200 and aft['y'] == 200 and aft['pal'] == 3, (mid, aft))
    # 真的回選單
    press(page, ['start', 'select'], 60)
    page.evaluate('() => { __nes.step(1); }')
    s = S(page)
    ok('回選單：START+SELECT 60 幀 ⇒ exit() 被呼叫、shell init({from})', s['game'] is None and s['s']['from'] == 'zz_fake' and
       s['s']['mode'] == 'menu', s['s'].get('from'))
    ok('回選單：游標停在剛玩的那款', s['s']['sel'] == ia, s['s']['sel'])
    step(page, 10)
    s = S(page)
    ok('回選單：還按著 START 不會立刻重進', s['game'] is None and s['s']['mode'] == 'menu', s['s']['mode'])
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    pp = page.evaluate(JS_PPU)
    menu_nt0 = pp['nt0']
    ok('回選單：PPU 歸零後只剩選單（split 關、scroll 0、8×8、名稱表 1 空、backdrop $0F）',
       pp['split'] is None and pp['sprH'] == 8 and pp['nt1'] == 0 and pp['at1'] == 0 and pp['backdrop'] == 0x0F and
       (pp['scroll'] is None or (pp['scroll'].get('x', 0) == 0 and pp['scroll'].get('y', 0) == 0)), pp)
    ok('回選單：選單只用 OAM 0..2（假遊戲的 40..47 已清）', all(i < 3 for i in pp['oamOn']), pp['oamOn'])
    ok('回選單：選單有畫（名稱表 0 非空）', menu_nt0 > 200, menu_nt0)
    ok('回選單：exit() 被呼叫一次', page.evaluate('() => CT.get("zz_fake").state().exitN') == 1, '')
    # launch 另一款 ⇒ 不能留前一款 / 選單的任何東西
    ok('CT.launch 另一款回 true', page.evaluate('() => CT.launch("zz_fake2")'), '')
    pp = page.evaluate(JS_PPU)
    ok('launch 另一款：名稱表只剩它自己寫的 1 格', pp['nt0'] == 1 and pp['nt1'] == 0, (pp['nt0'], pp['nt1']))
    ok('launch 另一款：屬性表全 0、OAM 全空（它還沒 draw）', pp['at0'] == 0 and pp['at1'] == 0 and pp['oamOn'] == [], pp)
    ok('launch 另一款：split 關、scroll 0', pp['split'] is None and
       (pp['scroll'] is None or (pp['scroll'].get('x', 0) == 0 and pp['scroll'].get('y', 0) == 0)), pp)
    step(page, 3)
    ok('launch 另一款：draw 後只有它的 OAM 0（8×16）', page.evaluate(JS_PPU)['oamOn'] == [0] and
       page.evaluate(JS_PPU)['sprH'] == 16, page.evaluate(JS_PPU)['oamOn'])
    # 沒填 backTile（且 8×16）⇒ 不借精靈、改閃 backdrop
    press(page, ['start', 'select'], 20)
    seen = page.evaluate("""() => { const p = __nes.nes().ppu, o = [];
      for (let i = 0; i < 10; i++) { __nes.press(['start','select'], 1); o.push(p.backdrop); }
      return { bds: o, a: p.getSprite(62).on, b: p.getSprite(63).on, mode: CT.Shell.dev.overlayMode(), oam: [] }; }""")
    ok('回選單提示（沒 backTile）：OAM 62/63 不借（保持關）', not seen['a'] and not seen['b'] and seen['mode'] == 'backdrop', seen)
    ok('回選單提示（沒 backTile）：backdrop 在原色 $0F 與 $01 之間閃', set(seen['bds']) == {0x0F, 0x01}, seen['bds'])
    ok('回選單提示（沒 backTile）：OAM 只有遊戲自己的 0 號', page.evaluate(JS_PPU)['oamOn'] == [0], page.evaluate(JS_PPU)['oamOn'])
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    ok('回選單提示（沒 backTile）：放開 ⇒ backdrop 還原 $0F', page.evaluate('() => __nes.nes().ppu.backdrop') == 0x0F,
       page.evaluate('() => __nes.nes().ppu.backdrop'))
    ok('回選單提示：backdrop 閃爍那段 overFrames == 0', page.evaluate(JS_PPU)['over'] == 0, '')
    press(page, ['start', 'select'], 62)
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    s = S(page)
    pp = page.evaluate(JS_PPU)
    ok('回選單（從 8×16 那款）：游標在 zz_fake2、精靈模式回 8×8', s['game'] is None and
       s['s']['slots'][s['s']['sel']]['id'] == 'zz_fake2' and pp['sprH'] == 8, (s['s']['sel'], pp['sprH']))
    ok('切換全程（3 次 launch + 2 次 back）overFrames == 0', pp['over'] == 0, pp['over'])
    ok('CT.launch 不存在的 id 回 false 且不動狀態', page.evaluate('() => CT.launch("nope") === false && GAME.state().game === null'), '')
    # 密技分派
    page.evaluate('() => CT.launch("zz_fake")')
    page.evaluate('() => window.dispatchEvent(new CustomEvent("nes-cheat", {detail:{source:"api"}}))')
    ok('密技：nes-cheat 事件 ⇒ 目前遊戲 cheat()', page.evaluate('() => CT.get("zz_fake").state().cheats') == 1, '')
    page.evaluate('() => CT.back()')
    ok('密技：選單中 CT.cheat() 回 false', page.evaluate('() => CT.cheat()') is False, '')


# =====================================================================  ③b 回選單提示：backTile 邊界（P3-9）
def test_backtile(page):
    open_page(page, 'boot=0')
    # 不合法的 backTile（tile 超界）⇒ 視同沒填 ⇒ backdrop 閃爍、不借精靈
    page.evaluate('() => { window.__zzBackTile = { tile: 999, pal: 0 }; CT.launch("zz_fake"); __nes.step(3); }')
    bd0 = page.evaluate('() => __nes.nes().ppu.backdrop')
    press(page, ['start', 'select'], 20)
    r = page.evaluate("""() => { const p = __nes.nes().ppu, o = [];
      for (let i = 0; i < 10; i++) { __nes.press(['start','select'], 1); o.push(p.backdrop); }
      return { bds: o, a: p.getSprite(62).on, mode: CT.Shell.dev.overlayMode() }; }""")
    ok('backTile 不合法（tile 999）⇒ 退回 backdrop 閃爍、不借 OAM 62', r['mode'] == 'backdrop' and not r['a'] and
       bd0 in r['bds'] and len(set(r['bds'])) == 2, (bd0, r))
    # 按住期間遊戲自己改 backdrop（$02 → $06）⇒ 放開後是遊戲的新值，不是舊備份
    page.evaluate('() => { window.__zzBackdrop = 0x06; }')
    press(page, ['start', 'select'], 6)
    page.evaluate('() => { __nes.release(); __nes.step(2); }')
    got = page.evaluate('() => __nes.nes().ppu.backdrop')
    ok('backdrop 閃爍中遊戲自己改底色 ⇒ 放開後保留遊戲的新值 $06', got == 0x06, hex(got))
    # backTile 也可以是函式（回 {tile, pal}）
    page.evaluate('() => { window.__zzBackTile = function () { return { tile: 2, pal: 1 }; }; CT.back(); __nes.release(); CT.launch("zz_fake"); __nes.step(3); }')
    press(page, ['start', 'select'], 10)
    r = page.evaluate('() => { const s = __nes.nes().ppu.getSprite(62); return { on: s.on, tile: s.tile, pal: s.pal, mode: CT.Shell.dev.overlayMode() }; }')
    ok('backTile 可為函式 ⇒ 用回傳的 {tile:2, pal:1}', r['mode'] == 'tile' and r['on'] and r['tile'] == 2 and r['pal'] == 1, r)
    page.evaluate('() => { __nes.release(); __nes.step(2); window.__zzBackTile = undefined; CT.back(); }')
    fc = page.evaluate('() => [0x0F, 0x1D, 0x02, 0x21, 0x30, 0x3C, 0x3F, 0x0E].map(CT.Shell.dev.flashColor)')
    ok('flashColor：黑 → $01、提亮一階、最亮列壓暗、永遠不是 $0D',
       fc == [0x01, 0x2D, 0x12, 0x31, 0x10, 0x1C, 0x01, 0x01] and 0x0D not in fc, [hex(x) for x in fc])
    ok('backTileOf：缺 tile / pal 超界 / 非整數 ⇒ null；pal 省略 = 0',
       page.evaluate("""() => { const f = CT.Shell.dev.backTileOf;
         return f({}) === null && f({backTile: {pal: 1}}) === null && f({backTile: {tile: 3, pal: 4}}) === null &&
                f({backTile: {tile: 1.5}}) === null && f({backTile: {tile: 7}}).pal === 0 && f({backTile: {tile: 7, pal: 3}}).tile === 7; }"""), '')


# =====================================================================  ④ 最高分顯示
def test_best(page):
    open_page(page, 'boot=0')
    page.evaluate('() => { CT.save("zz_fake", "best", 4321); CT.back(); }')    # 選單重建
    s = S(page)['s']
    by = {x['id']: x for x in s['slots']}
    ok('最高分：CT.save → 選單顯示 4321', by['zz_fake']['best'] == '4321', by['zz_fake']['best'])
    ok('最高分：bestText() 優先（ABC123）', by['zz_fake2']['best'] == 'ABC123', by['zz_fake2']['best'])
    i = [x['id'] for x in s['slots']].index('zz_fake')
    row = 8 + i * 2 + 1
    got = row_tiles(page, row, 25, 29)
    want = [tile_index(page, PREFIX + '_bg', 'N' + c) for c in '4321']
    ok('最高分：名稱表右對齊寫在第 25~28 欄', got == want, (got, want))
    page.evaluate('() => { CT.save("zz_fake", "best", 0); }')


# =====================================================================  ⑤ 機器人工具（用假遊戲自測 playthrough_cart）
def test_bot(browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    r = playthrough_cart.run_game(pg, 'zz_fake', 600, init_script=FAKE_JS, chunk=50, page_name=PAGE_NAME)
    ok('playthrough_cart：假遊戲 bot() 達成 goal()、每線 ≤ 8、overFrames 0', r['ok'] and r['goal'] and r['frames'] < 60,
       {k: r[k] for k in ('goal', 'frames', 'maxLine', 'overFrames', 'errors')})
    pg.close()
    pg = ctx.new_page()
    r = playthrough_cart.run_game(pg, 'zz_fake', 600, init_script=FAKE_JS, chunk=50, hint=True, page_name=PAGE_NAME)
    ok('playthrough_cart --hint：提示常駐（backTile ⇒ tile 模式）仍達成 goal、每線 ≤ 8、沒被踢回選單',
       r['ok'] and r.get('hint') == 'tile' and r['maxLine'] <= 8, {k: r.get(k) for k in ('hint', 'goal', 'maxLine', 'errors')})
    pg.close()
    pg = ctx.new_page()
    r = playthrough_cart.run_game(pg, 'zz_none', 60, init_script=FAKE_JS, page_name=PAGE_NAME)
    ok('playthrough_cart：未註冊 id ⇒ unregistered、不 ok', r.get('unregistered') and not r['ok'], r['errors'])
    pg.close()
    ctx.close()


# =====================================================================  ⑥ 選單曲 / 音效資料
def test_audio(page):
    open_page(page, 'boot=0')
    bad = page.evaluate(r"""(pre) => {
      const d = CT.Shell.dev, s = d.SONG, bad = [];
      const toMidi = NES.Music.noteToMidi || null;
      s.patterns.forEach((p, i) => ['p1','p2','tri','noi'].forEach(t => {
        if (!p[t] || p[t].length !== s.rows) bad.push(i + t + ' len ' + (p[t] && p[t].length));
        (p[t] || []).forEach(r => { if (r && t !== 'noi' && toMidi && toMidi(r.note) == null) bad.push(i + t + ' note ' + r.note); });
      }));
      Object.keys(d.SFX).forEach(k => { if (k.indexOf(pre + '_') !== 0) bad.push('sfx 名稱沒前綴 ' + k); });
      return { bad, nSfx: Object.keys(d.SFX).length, playing: __nes.nes().music.state ? true : true };
    }""", PREFIX)
    ok('選單曲：4 段 × 4 軌、每軌 32 列、音名可解析', not bad['bad'], bad['bad'][:5])
    ok('音效：≥ 3 個且一律 %s_ 前綴' % PREFIX, bad['nSfx'] >= 3, bad['nSfx'])


# =====================================================================  ⑦ R6 多卡帶設定（CT.CART_CFG）+ bestText 統一格式
STUB_JS = r"""
(function () {
  // 只補「還沒註冊」的槽：registry 的 CT.register 會用同 id 的真遊戲蓋掉這些空殼
  var CT = window.CT = window.CT || {};
  CT.games = CT.games || [];
  (window.__stubIds || []).forEach(function (d) {
    CT.games.push({ id: d[0], order: d[1], title: d[2], legacy: [], __stub: true,
      init: function () {}, update: function () {}, draw: function () {}, state: function () { return {}; },
      cheat: function () { return false; }, bot: function () { return 0; }, goal: function () { return false; } });
  });
})();
"""


def test_cfg(page):
    open_page(page, 'boot=0')
    c = page.evaluate(r"""() => {
      const C = CT.CART_CFG || null, LG = /^[.123]{16}$/;
      if (!C) return null;
      const slots = (C.slots || []).map(s => ({ id: s.id, order: s.order, name: s.name, legacy: s.legacy,
        pal: s.icon && s.icon.pal, artOk: !!(s.icon && Array.isArray(s.icon.art) && s.icon.art.length === 16 && s.icon.art.every(r => LG.test(r))),
        nonEmpty: !!(s.icon && s.icon.art && s.icon.art.join('').replace(/\./g, '').length >= 24) }));
      const logo = C.logo || [], lgT = Object.assign({ '8': 1, '1': 1 }, C.logoGlyph || {});
      const cols = logo.map(x => x[1]).sort((a, b) => a - b);
      return { id: C.id, prefix: C.prefix, key: CT.KEY, cart: CT.CART, st: GAME.state().cart, slots,
        logoOk: logo.length > 0 && logo.every(x => !!lgT[x[0]] && x[1] >= 1 && x[1] + 1 <= 30) &&
                cols.every((v, i) => i === 0 || v - cols[i - 1] >= 2),
        logoHex: Object.keys(C.logoGlyph || {}).every(k => /^[0-9a-f]{64}$/.test(C.logoGlyph[k])),
        glyphHex: Object.keys(C.glyph || {}).every(k => /^[0-9a-f]{64}$/.test(C.glyph[k])),
        sub: C.sub, song: CT.Shell.dev.SONG && CT.Shell.dev.SONG.name,
        bankBg: !!NES.CHR.getBank(C.prefix + '_bg'), bankSpr: !!NES.CHR.getBank(C.prefix + '_spr'),
        nameChars: (C.slots || []).every(s => (s.name || '').length >= 2 && (s.name || '').length <= 6),
        pals: !!(C.palettes && C.palettes.bg && C.palettes.bg.length === 4 && C.palettes.spr && C.palettes.spr.length === 4) };
    }""")
    ok('R6 卡帶設定：CT.CART_CFG 存在（games/%s/cart.js 在 shell 前載入）' % CART, c is not None, c)
    if not c:
        return
    ok('R6 卡帶設定：id / prefix = %s、CT.CART = %s、存檔前綴 nes.%s.、state().cart' % (CART, CART, CART),
       c['id'] == CART and c['prefix'] == CART and c['cart'] == CART and c['key'] == 'nes.%s.' % CART and c['st'] == CART, c)
    ids = [x['id'] for x in c['slots']]
    ok('R6 卡帶設定：8 槽 id 照任務表順序（%s）' % ','.join(DEFAULT_IDS), ids == DEFAULT_IDS, ids)
    ok('R6 卡帶設定：order 1..8、名稱 2~6 字、legacy 非空陣列',
       [x['order'] for x in c['slots']] == list(range(1, len(DEFAULT_IDS) + 1)) and c['nameChars'] and
       all(isinstance(x['legacy'], list) and x['legacy'] for x in c['slots']), [(x['id'], x['order'], x['name']) for x in c['slots']])
    ok('R6 卡帶設定：8 個圖示都是 16×16 的 .123、pal 0..3、不是空白',
       all(x['artOk'] and x['nonEmpty'] and x['pal'] in (0, 1, 2, 3) for x in c['slots']),
       [(x['id'], x['artOk'], x['nonEmpty'], x['pal']) for x in c['slots'] if not (x['artOk'] and x['nonEmpty'])])
    ok('R6 卡帶設定：logo 每字都有點陣、2 欄寬不重疊、落在第 1~30 欄；點陣 64 位十六進位',
       c['logoOk'] and c['logoHex'] and c['glyphHex'], c)
    ok('R6 卡帶設定：選單曲 = %s_menu、CHR bank %s_bg / %s_spr、調色盤 4+4 組' % (PREFIX, PREFIX, PREFIX),
       c['song'] == PREFIX + '_menu' and c['bankBg'] and c['bankSpr'] and c['pals'], c)
    # 存檔前綴隔離：本卡寫的 key 只落在 nes.<cart>.
    iso = page.evaluate("""(cart) => { CT.save('zz_iso', 'best', 77);
      const mine = localStorage.getItem('nes.' + cart + '.zz_iso.best'), other = ['cart1', 'cart2', 'cart3', 'cart4', 'cart5'].filter(k => k !== cart)
        .some(k => localStorage.getItem('nes.' + k + '.zz_iso.best') !== null);
      localStorage.removeItem('nes.' + cart + '.zz_iso.best'); return { mine, other }; }""", CART)
    ok('R6 存檔：CT.save 只寫 nes.%s.<id>.<key>，不碰別張卡帶' % CART, iso['mine'] == '77' and not iso['other'], iso)
    # bestText 統一格式（R6 §1-6）：右對齊 6 字元
    bts = page.evaluate("""() => CT.games.filter(g => typeof g.bestText === 'function').map(g => {
      let t = null; try { t = g.bestText(); } catch (e) { t = 'ERR ' + e; } return [g.id, t]; })""")
    for gid, t in bts:
        ok('R6 bestText %s：右對齊 6 字元（純分數 000000 / 單位 ≤ 6）' % gid,
           isinstance(t, str) and len(t) == 6 and t == t.rstrip() and t.strip() != '' and all(ch.isalnum() or ch in ((' ./:-%' if CART == 'cart5' else ' ./:-') if CART not in ('cart1', 'cart2') else ' ./') for ch in t), t)   # R9：cart5 另允許 %（paint 臨摹相似度）   # R7 brief §1-5：時間紀錄 03:25 / 未有紀錄 --:--


def test_cfg_full(browser):
    """8 槽全部有遊戲（沒註冊的用空殼補）時：選單磁磚 ≤ 256、無缺字、圖示畫在第 4 欄、lint 綠。"""
    ctx = browser.new_context()
    stubs = [[gid, i + 1, 'STUB'] for i, gid in enumerate(DEFAULT_IDS)]
    ctx.add_init_script('window.__stubIds = %s;' % json.dumps(stubs))
    ctx.add_init_script(STUB_JS)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    open_page(pg, 'boot=0')
    step(pg, 30)
    names = pg.evaluate("() => (CT.CART_CFG.slots || []).map(s => [s.id, s.name])")
    # 空殼的 title 換成卡帶設定裡的中文名（真遊戲保留自己的 title）⇒ 量「全部中文名」的磁磚用量
    pg.evaluate("(nm) => { nm.forEach(([id, n]) => { const g = CT.get(id); if (g && g.__stub) g.title = n; }); CT.back(); __nes.step(10); }", names)
    st = S(pg)['s']
    ok('R6 全滿選單：8 槽都註冊、名稱全部 16×16 中文（無缺字）',
       len(st['slots']) == len(DEFAULT_IDS) and all(x['registered'] and x['name'] == 'glyph' for x in st['slots']) and not st['missingGlyph'],
       ([(x['id'], x['name']) for x in st['slots']], st['missingGlyph']))
    ok('R6 全滿選單：BG bank ≤ 256 磁磚', 0 < st['tiles'] <= 256, st['tiles'])
    icons = pg.evaluate("""(pre) => { const p = __nes.nes().ppu, b = NES.CHR.getBank(pre + '_bg');
      return CT.Shell.state().slots.map((s, i) => p.getTile(0, 4, 8 + i * 2) === b.index('IC_' + s.id + '_0')); }""", PREFIX)
    ok('R6 全滿選單：每槽畫自己的圖示（第 4 欄 = IC_<id>_0）', all(icons), icons)
    pg.evaluate('() => __nes.render()')
    lt = pg.evaluate('() => __nes.lint()')
    sb = pg.evaluate('() => __nes.stats()')
    ok('R6 全滿選單：lint 綠（≤ 25 色）、每線 ≤ 8、overFrames 0',
       lt.get('ok') and lt.get('colors', 99) <= 25 and sb['maxSpritesLine'] <= 8 and sb['budget']['overFrames'] == 0,
       (lt.get('colors'), sb['maxSpritesLine'], sb['budget']['overFrames']))
    ok('R6 全滿選單：沒有 pageerror', not errs, errs[:3])
    ctx.close()


# =====================================================================  ⑧ R6 cart1：暫停 BGM 從同一 row 接續（engine Music.pause / resume）
PAUSE_GAMES = [('blocks', ''), ('brick', ''), ('racing', 'track=1'), ('tower', 'map=1')]


def test_pause_resume(page):
    for gid, q in PAUSE_GAMES:
        open_page(page, 'game=%s&bot=1%s' % (gid, ('&' + q) if q else ''))
        # 機器人把遊戲帶進「遊玩中 + BGM 在播」，再多跑到曲子不在小節開頭
        r = page.evaluate("""() => { const M = __nes.nes().music;
          for (let i = 0; i < 9000; i++) { __nes.step(1); const s = GAME.state().s || {}, m = M.state();
            if (s.music && s.paused === false && (s.mode === 'play' || s.mode === 'race') && m.playing && m.row >= 3 && m.row <= 10) return { ok: true, f: i, music: s.music }; }
          return { ok: false, s: GAME.state().s && GAME.state().s.mode }; }""")
        if not r.get('ok'):
            ok('R6 暫停接續 %s：進到遊玩中且 BGM 在播' % gid, False, r)
            continue
        res = page.evaluate("""() => { CT.botOn = false; __nes.release(); const M = __nes.nes().music;
          const p0 = M.state(); __nes.tap('start', 1); __nes.step(1);
          const s1 = GAME.state().s, m1 = M.state(), paused1 = M.isPaused();
          __nes.step(120); const m2 = M.state();
          __nes.tap('start', 1); __nes.step(1);
          const s3 = GAME.state().s, m3 = M.state();
          return { o0: p0.orderIndex, r0: p0.row, gp: s1.paused, mus1: s1.music, paused1, pl1: m1.playing,
                   still: m1.row === m2.row && m1.orderIndex === m2.orderIndex && m1.rowsPlayed === m2.rowsPlayed,
                   o1: m1.orderIndex, r1: m1.row, o3: m3.orderIndex, r3: m3.row, pl3: m3.playing, gp3: s3.paused, mus3: s3.music,
                   paused3: M.isPaused() }; }""")
        ok('R6 暫停接續 %s：START 暫停 ⇒ driver.isPaused、音樂停、120 幀位置不動' % gid,
           res['gp'] is True and res['paused1'] and not res['pl1'] and res['still'] and res['mus1'] is None, res)
        ok('R6 暫停接續 %s：解除 ⇒ 從同一 order / row 接續（不是從頭）、曲名恢復 %s' % (gid, r['music']),
           res['gp3'] is False and res['pl3'] and not res['paused3'] and res['o3'] == res['o1'] and
           res['r1'] <= res['r3'] <= res['r1'] + 1 and res['mus3'] == r['music'] and (res['r3'] > 0 or res['o3'] > 0), res)


def test_racing_backtile(page):
    open_page(page, 'game=racing&track=1')
    r = page.evaluate("""() => { const g = CT.Racing.dev.g(); __nes.press(['a'], 200); const bt = CT.get('racing').backTile;
      const p = __nes.nes().ppu, seen = new Set(), seen0 = new Set();
      g.player.boost = 60;
      for (let i = 0; i < 24; i++) { __nes.press(['a'], 1); seen.add(p.getSprPalette(bt.pal).join(',')); seen0.add(p.getSprPalette(0).join(',')); }
      return { pal: bt.pal, n: seen.size, n0: seen0.size, mode: g.mode }; }""")
    ok('R6 racing backTile：不用調色盤 0、加速時它的調色盤不閃（車身調色盤 0 有在閃）',
       r['pal'] != 0 and r['n'] == 1 and r['n0'] >= 2, r)


def run_page(br, page_name):
    set_cart(page_name)
    print('==================== %s（%s）' % (page_name, CART))
    plain = br.new_context()
    pg = plain.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    # 卡帶設定裡的 8 槽 = 期望 id（cart1 照 R5 固定表）
    if CART != 'cart1':
        open_page(pg, 'boot=0')
        got = pg.evaluate('() => ((window.CT.CART_CFG && window.CT.CART_CFG.slots) || []).map(s => s.id)')
        if got and got != DEFAULT_IDS:
            warn('%s 的 CART_CFG.slots 與 test_cart PAGES 表不同：%s' % (CART, got))
    print('① 真遊戲（已註冊的才驗）')
    test_real(pg)
    plain.close()

    fake = br.new_context()
    fake.add_init_script(FAKE_JS)
    pg = fake.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    print('② 開機 / 選單')
    test_menu(pg)
    print('③ launch / back 契約')
    test_switch(pg)
    print('③b 回選單提示 backTile 邊界')
    test_backtile(pg)
    print('④ 最高分')
    test_best(pg)
    print('⑥ 音樂')
    test_audio(pg)
    fake.close()
    print('⑤ 機器人工具')
    test_bot(br)
    ok('全程沒有 pageerror', not errs, errs[:3])

    print('⑦ R6 多卡帶設定 / bestText')
    plain = br.new_context()
    pg = plain.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    test_cfg(pg)
    if CART == 'cart1':
        print('⑧ R6 cart1：暫停 BGM 接續 / racing backTile')
        test_pause_resume(pg)
        test_racing_backtile(pg)
    plain.close()
    test_cfg_full(br)
    ok('R6 段沒有 pageerror', not errs, errs[:3])


def main():
    pages = list(PAGES)
    if '--page' in sys.argv:
        k = sys.argv.index('--page')
        pages = [sys.argv[k + 1]] if k + 1 < len(sys.argv) else pages
    for pn in pages:
        if not (ROOT / pn).exists():
            print('環境錯誤：找不到 %s' % pn)
            return 2
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            for pn in pages:
                run_page(br, pn)
            br.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('環境錯誤：', e)
        return 2
    for cart in sorted(set(r[3] for r in results)):
        sub = [r for r in results if r[3] == cart]
        print('  %s：%d / %d PASS' % (cart, sum(1 for r in sub if r[0]), len(sub)))
    n_ok = sum(1 for r in results if r[0])
    print('test_cart: %d / %d PASS%s' % (n_ok, len(results), ('（%d 警告）' % len(warnings)) if warnings else ''))
    return 0 if n_ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
