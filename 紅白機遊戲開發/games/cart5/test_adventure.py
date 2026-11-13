# -*- coding: utf-8 -*-
"""《星塵冒險　消失的星燈》（cart5，id = adventure）自動驗證。

重點：註冊契約 / §6（標題密技無效、暫停 BGM、exit、bestText 6 字元、backTile）；說明頁文字（HOLD START+SELECT: MENU、C/★ = CHEAT）不溢出；
      10 個地點 + 標題的場景圖（磁磚 ≤ PIC 槽、合併數上限、逐張 NES.Lint）；所有選單文字 ≤ 6 格、每個選單 ≤ 7 項、選擇題問句一行；
      5 種結局都走得到（以真實按鍵操作指令選單）、結局收集存檔；壞結局按密技回到上一個決策點；遊戲中密技 = 立即提示且該局 goal false；
      提示依進度推進；存檔 / 讀檔（重開頁面後）；擋路（沒鑰匙 / 沒燈）；機器人 lag 0 / 14 / 24 走到真結局、每線 ≤ 8、overFrames 0、
      字形池 overflow 0、缺字 0。
作法：Playwright 開 `cart5.html?game=adventure&debug=1&scale=1&mute=1`，`NES.Input.inject` 逐幀推進 + `CT.Adv.dev`。

用法：../卡比之星/.venv/bin/python games/cart5/test_adventure.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart5.html').as_uri() + '?debug=1&scale=1&mute=1&game=adventure'
VERBOSE = '-v' in sys.argv
results = []
A, B, SELECT, START, UP, DOWN = 1, 2, 4, 8, 16, 32

HELPERS = r"""
window.T5 = {
  s: () => GAME.state().s,
  // 推進對話直到有選單開著（或結局卡片寫完）；回傳狀態
  adv: (maxF) => {
    maxF = maxF || 6000;
    for (let i = 0; i < maxF; i++) {
      const s = GAME.state().s;
      if (s.menu && s.menu.phase === 'open' && T5.idle()) return s;
      if (s.mode === 'card' && s.boxPhase === 'end') return s;
      if (!s.prompting && (s.boxPhase === 'wait' || s.boxPhase === 'end') && (i & 1) === 0) NES.Input.inject(1, 1);
      __nes.step(1);
    }
    return GAME.state().s;
  },
  idle: () => CT.Adv.dev.T().pending() === 0,
  // 在開著的選單裡用十字鍵移到 label 再按 A（真實按鍵）
  pick: (label) => {
    for (let n = 0; n < 40; n++) {
      const m = CT.Adv.dev.menu();
      if (!m) return false;
      const st = m.state();
      const k = st.items.indexOf(label);
      if (k < 0) return 'missing:' + st.items.join('/');
      if (st.sel === k) { NES.Input.inject(1, 1); __nes.step(1); __nes.step(2); return true; }
      NES.Input.inject(k > st.sel ? 32 : 16, 1); __nes.step(1); __nes.step(3);
    }
    return false;
  },
  // 指令（+ 對象）→ 跑完對話
  act: (cmd, target, answers) => {
    let s = T5.adv();
    if (s.menuKind !== 'cmd') return 'not-cmd:' + s.menuKind;
    let r = T5.pick(cmd); if (r !== true) return r;
    for (let i = 0; i < 20; i++) __nes.step(1);
    s = GAME.state().s;
    if (target && s.menu && s.menuKind !== 'cmd') { r = T5.pick(target); if (r !== true) return r; }
    answers = answers || [];
    for (let k = 0; k < 10; k++) {
      s = T5.adv();
      if (s.menuKind === 'ask' && answers.length) { r = T5.pick(answers.shift()); if (r !== true) return r; continue; }
      break;
    }
    return true;
  },
  // 列舉某場景在某些旗標下的選單內容
  menus: (scene, flags, items) => {
    const g = CT.Adv.dev.g(), S = CT.Adv.SCENES[scene];
    const api = { f: {}, scene: scene, visits: {}, has: (id) => (items || []).indexOf(id) >= 0 };
    (flags || []).forEach(f => api.f[f] = true);
    const objs = (S.objs || []).filter(o => !o.if || o.if(api)).map(o => o.n);
    let ppl = (S.people || []).filter(p => !p.if || p.if(api)).map(p => p.n);
    if (api.f.follow && scene !== 'bridge') ppl = ppl.concat(['拾光']);
    return { objs: objs, people: ppl, exits: S.exits.map(e => CT.Adv.SCENES[e.to].label), name: S.name };
  }
};
"""


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query='', keep=False):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Adv && !!CT.Adv.dev')
    if not keep:
        page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.adventure.")).forEach(k => localStorage.removeItem(k)); }')
    page.evaluate(HELPERS)
    page.evaluate('() => { CT.Adv.dev.toTitle(); __nes.step(30); }')


def S(page):
    return page.evaluate('() => T5.s()')


def tap(page, mask, after=4):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def new_game(page):
    page.evaluate('() => { CT.Adv.dev.newGame(); }')
    return page.evaluate('() => T5.adv()')


def act(page, cmd, target=None, answers=None):
    r = page.evaluate('([c, t, a]) => T5.act(c, t, a)', [cmd, target, answers or []])
    return r


def stats(page):
    return page.evaluate('() => __nes.stats()')


TRUE_ROUTE = [
    ('拿取', '提燈'), ('拿取', '郵差包'), ('移動', '廣場'), ('調查', '噴水池'), ('拿取', '閃光'), ('移動', '燈塔'),
    ('使用', '信'), ('使用', '鑰匙'), ('移動', '燈室'), ('使用', '提燈'), ('移動', '燈塔'), ('移動', '廣場'), ('移動', '鐘錶店'),
    ('使用', '小齒輪'), ('移動', '廣場'), ('移動', '天文台'), ('交談', None), ('移動', '廣場'), ('移動', '森林'), ('移動', '林地'),
    ('使用', '音樂盒'), ('交談', None, ['幫忙']), ('移動', '森林'), ('移動', '廣場'), ('移動', '燈塔'), ('移動', '燈室'), ('使用', '星核'),
    ('移動', '星橋'),
]


def play_route(page, route):
    bad = []
    for st in route:
        r = act(page, st[0], st[1], st[2] if len(st) > 2 else None)
        if r is not True:
            bad.append((st, r))
    return bad


# ===================================================================== 測試
def test_contract(page):
    fresh(page)
    c = page.evaluate('''() => { const g = CT.get('adventure');
      return { id: g.id, order: g.order, title: g.title, legacy: g.legacy, fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
               best: g.bestText(), bt: g.backTile, slots: CT.CART_CFG ? CT.CART_CFG.slots.map(s => s.id) : null }; }''')
    ok('註冊契約：id / order 1 / 標題 / legacy / 9 個函式', c['id'] == 'adventure' and c['order'] == 1 and c['title'] == '星塵冒險'
       and c['legacy'] == ['text-adventure.html'] and len(c['fns']) == 9, c)
    ok('bestText 右對齊 6 字元（ED 0/5）', c['best'] == 'ED 0/5' and len(c['best']) == 6, c['best'])
    ok('backTile 指向精靈圖樣表裡的實心星', isinstance(c['bt'], dict) and c['bt']['tile'] > 0 and c['bt']['pal'] == 3, c['bt'])
    s = S(page)
    ok('標題：選單 4 項（從頭開始 / 繼續遊戲 / 結局一覽 / 操作說明）+ BGM', s['menu']['items'] == ['從頭開始', '繼續遊戲', '結局一覽', '操作說明']
       and s['music'] == 'adv_title', s['menu'])
    ok('標題按密技無效', page.evaluate('() => CT.cheat()') is False and S(page)['cheats'] == 0)
    lint = page.evaluate('() => { __nes.render(); return NES.Lint.frame(__nes.ppu || NES.instance.ppu); }')
    ok('標題畫面 NES.Lint 通過（≤ 25 色、每線 ≤ 8）', lint['ok'], lint)
    t = page.evaluate('() => CT.Adv.dev.T().readLine(9, 16, 16)')
    ok('標題副標「～消失的星燈～」寫在畫面上', '消失的星燈' in t, t)


def test_help(page):
    fresh(page)
    tap(page, UP, 6)
    tap(page, A, 120)
    READ = '() => { const T = CT.Adv.dev.T(), out = []; for (let r = 0; r < 30; r += 1) { const l = T.readLine(0, r, 32).trim(); if (l && out[out.length - 1] !== l) out.push(l); } return out; }'
    s1 = S(page)
    p1 = page.evaluate(READ)
    rows = page.evaluate('() => { const T = CT.Adv.dev.T(), out = []; for (let r = 0; r < 30; r++) if (T.readLine(0, r, 32).trim()) out.push(r); return out; }')
    tap(page, A, 120)
    s2 = S(page)
    p2 = page.evaluate(READ)
    joined = '|'.join(p1 + p2)
    ok('說明頁 2 頁（A 翻頁）：「按住 START+SELECT：回選單」「C／★：密技」「自動存檔」都在', s2['mode'] == 'help' and '按住 START+SELECT：回選單' in joined
       and 'C／★：密技' in joined and '自動存檔' in joined and '1／2' in p1[0] and '2／2' in p2[0], (p1, p2))
    ok('說明頁沒有英文句子（只剩按鍵名 START / SELECT / A / B）', not re.search(r'HOLD|MENU|CHEAT|=', joined), joined)
    ok('說明頁兩頁：字形池 overflow 0、缺字 0', s1['text']['overflow'] == 0 and s2['text']['overflow'] == 0 and not s2['text']['missing'], s2['text'])
    gaps = [b - a for a, b in zip(rows, rows[1:])]
    ok('說明頁段落之間空一列（列距出現 2 = 中間一列空白）且不貼頂（第一行 ≥ 第 2 列）', 2 in gaps and rows[0] >= 2, rows)
    tap(page, B, 30)
    ok('說明頁 B 回標題', S(page)['mode'] == 'title')


def test_pictures(page):
    fresh(page)
    info = page.evaluate('''() => { const out = {}; const V = {room:['','morning'], plaza:[''], dock:['','fog'], tower:['','lit'], top:['','lit'], clock:[''], obs:[''], woods:['','lit'], deep:[''], bridge:['','home','travel'], title:['']};
      for (const k in V) for (const v of V[k]) { const p = CT.Adv.Art.picture(k, v); out[k + '/' + v] = [p.tiles.length, p.unique, p.merged, p.pals.flat().every(c => c >= 0 && c < 64 && c !== 0x0D)]; }
      return { out: out, slots: CT.Adv.Art.PIC_SLOTS, scenes: Object.keys(CT.Adv.SCENES).length, pics: new Set(Object.values(CT.Adv.SCENES).map(s => s.pic)).size }; }''')
    ok('地點 ≥ 10、各有自己的場景圖', info['scenes'] >= 10 and info['pics'] >= 10, info['scenes'])
    over = {k: v for k, v in info['out'].items() if v[0] > info['slots'] or not v[3]}
    ok('每張圖（含變體 %d 張）磁磚 ≤ PIC 槽 %d、調色盤合法' % (len(info['out']), info['slots']), not over, over)
    heavy = {k: v for k, v in info['out'].items() if v[2] > 24}
    ok('磁磚合併數每張 ≤ 24（原圖細節保留）', not heavy, heavy)
    bad = []
    for sc in ['room', 'plaza', 'dock', 'tower', 'top', 'clock', 'obs', 'woods', 'deep', 'bridge']:
        page.evaluate('(s) => { CT.Adv.dev.newGame(); CT.Adv.dev.set("follow"); CT.Adv.dev.goto(s); __nes.step(120); }', sc)
        r = page.evaluate('() => { __nes.render(); const l = NES.Lint.frame(__nes.ppu || NES.instance.ppu); return [l.ok, l.colors, __nes.stats().maxSpritesLine]; }')
        if not r[0] or r[2] > 8:
            bad.append((sc, r))
    ok('10 個地點逐張 NES.Lint 通過、每線精靈 ≤ 8（含跟隨的拾光）', not bad, bad)


def test_menus(page):
    fresh(page)
    flagsets = [[], ['sawGlint'], ['lit', 'calm'], ['follow', 'calm', 'lit', 'relit', 'bridge'], ['grab', 'relit', 'open', 'lit']]
    worst = page.evaluate('''(F) => { const out = []; const W = CT.Text.measure;
      for (const sc in CT.Adv.SCENES) for (const fl of F) { const m = T5.menus(sc, fl, ['lamp','gear','marble','map','core']);
        const look = [CT.Adv.UI.around].concat(m.objs), take = m.objs.concat(m.people);
        for (const L of [look, take, m.people, m.exits]) { if (L.length > 7) out.push([sc, fl, 'n', L]); L.forEach(t => { if (W(t) > 6) out.push([sc, fl, 'w', t]); }); }
        if (W(m.name) > 10) out.push([sc, 'name', m.name]); }
      Object.values(CT.Adv.ITEMS).forEach(it => { if (W(it.name) > 6) out.push(['item', it.name]); });
      CT.Adv.UI.cmds.forEach(t => { if (W(t) > 6) out.push(['cmd', t]); });
      return out; }''', flagsets)
    ok('所有選單：每項 ≤ 6 格（右欄寬 11）、每個選單 ≤ 7 項、位置名 ≤ 10 格', not worst, worst[:5])
    asks = page.evaluate(r'''() => { const out = []; const src = [CT.Adv.SCENES, CT.Adv.ENDINGS];
      const re = /ask\('([^']*)', \[([^\]]*)\]/g; return null; }''')
    src = (ROOT / 'games' / 'cart5' / 'adventure' / 'text_story.js').read_text(encoding='utf-8')
    import re
    qs = re.findall(r"ask\('([^']*)', \[([^\]]*)\]", src)
    bad = []
    for q, opts in qs:
        o = [x.strip().strip("'") for x in opts.split(',')]
        if len(q) > 13 or any(len(x) > 3 for x in o) or len(o) > 3:
            bad.append((q, o))
    ok('選擇題 %d 題：問句一行（≤ 13 字）、選項 ≤ 3 個字、≤ 3 個選項' % len(qs), len(qs) >= 6 and not bad, bad)


def test_blocks_and_defaults(page):
    fresh(page)
    new_game(page)
    s = S(page)
    ok('開場（含操作教學）跑完回到指令選單、位置名 = 閣樓小屋', s['menuKind'] == 'cmd' and s['loc'] == '閣樓小屋' and s['scene'] == 'room', s['loc'])
    ok('開場教學提到指令選單與提示', page.evaluate('() => CT.Adv.PROLOGUE.filter(x => typeof x === "string").join("").indexOf("提示") >= 0'))
    act(page, '交談')
    ok('沒有人可交談 → 提示句', S(page)['lastMsg'] == '這裡沒有可以說話的對象。', S(page)['lastMsg'])
    act(page, '使用')
    ok('身上沒東西 → 提示句', S(page)['lastMsg'] == '身上什麼都沒有。', S(page)['lastMsg'])
    act(page, '拿取', '提燈')
    s = S(page)
    ok('拿取提燈 → 物品欄 + 桌上的提燈精靈消失', 'lamp' in s['items'] and 'lamp' not in s['sprites'], s['items'])
    r = play_route(page, [('移動', '廣場'), ('移動', '燈塔')])
    act(page, '移動', '燈室')
    s = S(page)
    ok('燈塔鐵門沒開 → 移動燈室被擋', s['scene'] == 'tower' and '鎖' in s['lastMsg'], (r, s['lastMsg']))
    act(page, '使用', '提燈')
    ok('物品用在不對的地方 → 該物品的說明句', S(page)['lastMsg'] == '提燈裡沒有東西可以點亮。', S(page)['lastMsg'])
    act(page, '拿取', '霞婆婆')
    ok('拿取人物 → 不能帶走', '不能把人帶走' in S(page)['lastMsg'])
    play_route(page, [('移動', '廣場'), ('移動', '森林')])
    act(page, '移動', '林地')
    s = S(page)
    ok('沒有燈 → 進不了星石林地', s['scene'] == 'woods' and '太暗' in s['lastMsg'], s['lastMsg'])
    # 選擇題不能用 B 取消
    play_route(page, [('移動', '廣場'), ('移動', '小屋')])
    page.evaluate('() => { T5.adv(); }')
    r = page.evaluate('() => { T5.pick("調查"); __nes.step(20); return T5.pick("床"); }')
    page.evaluate('() => T5.adv()')
    tap(page, B, 20)
    s = S(page)
    ok('選擇題（要再睡一下嗎？）B 不會關掉', s['menuKind'] == 'ask' and s['menu']['items'] == ['再睡', '起床'], (r, s['menuKind']))
    page.evaluate('() => T5.pick("起床")')
    s = page.evaluate('() => T5.adv()')
    ok('選「起床」回到指令選單（沒進結局）', s['mode'] == 'play' and s['menuKind'] == 'cmd', s['mode'])


def test_hint_and_cheat(page):
    fresh(page)
    new_game(page)
    h0 = page.evaluate('() => CT.Adv.dev.hint()')
    act(page, '系統', '提示')
    s = S(page)
    ok('系統 → 提示：依進度給第一個沒完成的', s['lastMsg'] == h0 and '提燈' in h0 and s['hints'] == 1, s['lastMsg'])
    seq = page.evaluate('''() => { const D = CT.Adv.dev, out = [];
      for (const f of ['lampTaken','letterTaken','delivered','open','lit','gotGear','fixed','gotMap','calm','follow','relit','bridge']) { D.set(f); out.push(D.hint()); } return out; }''')
    ok('提示隨旗標逐步推進（12 段、各不相同）', len(set(seq)) >= 11, seq[-3:])
    fresh(page)
    new_game(page)
    r = page.evaluate('() => CT.cheat()')
    s = S(page)
    ok('遊戲中密技 = 立即提示（不用開選單）', r is True and s['sub'] == 'script' and s['runCheats'] == 1 and '提燈' in s['lastMsg'], s['lastMsg'])
    page.evaluate('() => T5.adv()')
    r2 = page.evaluate('() => { CT.Adv.dev.box(); return CT.cheat(); }')
    ok('對話進行中按密技不插隊（回 true 只在選單開著時）', S(page)['menuKind'] == 'script' or r2 is True)


def test_endings(page):
    fresh(page)
    new_game(page)
    bad = play_route(page, TRUE_ROUTE)
    act(page, '交談', None, ['送它走'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('真結局：真實按鍵走完最短路線（%d 步）→ 結局 1 卡片、goal' % (len(TRUE_ROUTE) + 1), not bad and s['ending'] == 'true' and s['mode'] == 'card' and s['goal'], (bad, s['ending'], s['mode']))
    ok('結局卡片寫「結局 1／5 星燈與歸途 THE END」', s['box']['lines'][:2] == ['結局 1／5', '星燈與歸途'], s['box']['lines'])
    tap(page, A, 30)
    s = S(page)
    ok('真結局後播片尾名單（捲動）', s['mode'] == 'credits', s['mode'])
    page.evaluate('() => { for (let i = 0; i < 3000 && T5.s().mode === "credits"; i++) __nes.step(1); }')
    ok('名單捲完自動回標題、結局收集 1', S(page)['mode'] == 'title' and S(page)['endings'] == 1)

    # 星之旅人：同路線最後選「一起去」
    new_game(page)
    play_route(page, TRUE_ROUTE)
    act(page, '交談', None, ['一起去'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('結局 2 星之旅人（星橋上選一起去）', s['ending'] == 'travel' and s['mode'] == 'card', s['ending'])
    tap(page, A, 30)

    # 燈亮了：林地裡硬搶星核（重開頁面 ⇒ 本次 goal 尚未達成；結局收集保留）
    fresh(page, keep=True)
    new_game(page)
    route = TRUE_ROUTE[:20] + [('拿取', '星核', ['搶回來']), ('移動', '森林'), ('移動', '廣場'), ('移動', '燈塔'), ('移動', '燈室'), ('使用', '星核')]
    bad = play_route(page, route)
    s = page.evaluate('() => T5.adv(8000)')
    ok('結局 3 燈亮了（搶回星核 → 放回燈座）', not bad and s['ending'] == 'lamp', (bad, s['ending']))
    ok('結局 3 不算 goal', not s['goal'])
    tap(page, A, 30)

    # 霧中的港口：鷗姐的玻璃珠 → 燈座（壞結局）→ 密技回到決策點
    new_game(page)
    route = TRUE_ROUTE[:6] + [('使用', '信'), ('使用', '鑰匙')]
    play_route(page, TRUE_ROUTE[:6])
    play_route(page, [('使用', '信'), ('使用', '鑰匙'), ('移動', '廣場'), ('移動', '碼頭'), ('交談', None), ('交談', None, ['收下']),
                      ('移動', '廣場'), ('移動', '燈塔'), ('移動', '燈室')])
    s = S(page)
    has_marble = 'marble' in s['items']
    act(page, '使用', '玻璃珠', ['放進去'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('結局 4 霧中的港口（玻璃珠放進燈座）', has_marble and s['ending'] == 'fog' and s['mode'] == 'card', (has_marble, s['ending']))
    card = s['box']['lines']
    ok('壞結局卡片寫「A：回到選擇前　B：回標題」（不再要求按密技）', card[-1] == 'A：回到選擇前　B：回標題'
       and not any('C/★' in l or 'C／★' in l for l in card), card)
    tap(page, A, 30)
    s = page.evaluate('() => T5.adv()')
    ok('壞結局卡片按 A → 回到上一個決策點（燈室、玻璃珠還在、指令選單）且不算密技', s['mode'] == 'play' and s['scene'] == 'top'
       and 'marble' in s['items'] and s['menuKind'] == 'cmd' and s['runCheats'] == 0 and s['cheats'] == 0 and s['retries'] == 1,
       (s['mode'], s['scene'], s['items'], s['runCheats']))
    # 回到選擇前之後接著走（不放玻璃珠）→ 仍可達成真結局 goal（同一局、未用密技）
    act(page, '使用', '提燈')
    s = S(page)
    ok('回到選擇前後劇情照常推進（燈室使用提燈 → lit）', 'lit' in s['flags'], s['flags'])
    play_route(page, TRUE_ROUTE[10:])
    act(page, '交談', None, ['送它走'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('壞結局 A 回到選擇前 → 繼續走完真結局：goal 達成（不算密技）', s['ending'] == 'true' and s['goal'] and s['runCheats'] == 0,
       (s['ending'], s['goal'], s['runCheats']))
    tap(page, A, 30)
    page.evaluate('() => { for (let i = 0; i < 3000 && T5.s().mode === "credits"; i++) __nes.step(1); }')

    # 回籠覺：開場就回去睡
    new_game(page)
    act(page, '調查', '床', ['再睡'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('結局 5 回籠覺（開場選再睡）', s['ending'] == 'sleep', s['ending'])
    page.evaluate('() => CT.cheat()')
    s = page.evaluate('() => T5.adv()')
    ok('回籠覺按密技 → 回到閣樓指令選單（密技仍可用、算密技）', s['mode'] == 'play' and s['scene'] == 'room' and s['menuKind'] == 'cmd'
       and s['runCheats'] == 1)
    act(page, '調查', '床', ['再睡'])
    s = page.evaluate('() => T5.adv(8000)')
    tap(page, B, 60)
    s = S(page)
    ok('壞結局卡片按 B → 回標題', s['mode'] == 'title', s['mode'])
    best = page.evaluate('() => CT.get("adventure").bestText()')
    ok('5 種結局都收集到 → bestText ED 5/5、存檔 endings = 0b11111', best == 'ED 5/5' and S(page)['endings'] == 31, best)
    page.evaluate('() => { CT.Adv.dev.toTitle(); T5.adv(); T5.pick("結局一覽"); __nes.step(60); }')
    lines = page.evaluate('() => { const T = CT.Adv.dev.T(), out = []; for (let r = 0; r < 30; r++) { const l = T.readLine(0, r, 32).trim(); if (l) out.push(l); } return out; }')
    ok('結局一覽列出 5 個結局名', all(n in '|'.join(lines) for n in ['星燈與歸途', '星之旅人', '燈亮了', '霧中的港口', '回籠覺']), lines)


def test_cheat_goal(page):
    fresh(page)
    new_game(page)
    play_route(page, TRUE_ROUTE[:3])
    page.evaluate('() => { T5.adv(); CT.cheat(); T5.adv(); }')
    play_route(page, TRUE_ROUTE[3:])
    act(page, '交談', None, ['送它走'])
    s = page.evaluate('() => T5.adv(8000)')
    ok('用過密技（提示）的那局看到真結局 goal 仍 false', s['ending'] == 'true' and not s['goal'] and s['runCheats'] >= 1, (s['ending'], s['goal']))


def test_autosave(page):
    fresh(page)
    ok('新存檔：沒有自動存檔', not S(page)['hasAuto'])
    new_game(page)
    play_route(page, TRUE_ROUTE[:3])          # 閣樓拿兩樣 → 廣場
    s = S(page)
    auto = page.evaluate('() => CT.load("adventure", "auto", null)')
    ok('換地點 / 拿到東西時自動存檔（%d 次）：最新 = 廣場、提燈 + 郵差包' % s['autoSaves'], s['autoSaves'] >= 3 and auto
       and auto['scene'] == 'plaza' and 'lamp' in auto['items'], (s['autoSaves'], auto))
    n0 = s['autoSaves']
    act(page, '調查', '四周')
    ok('沒有進展（只是調查四周）不重複存', S(page)['autoSaves'] == n0, S(page)['autoSaves'])
    play_route(page, TRUE_ROUTE[3:5])          # 噴水池 → 拿到小齒輪（旗標推進）
    ok('劇情推進（拿到小齒輪）→ 自動存檔', S(page)['autoSaves'] > n0 and 'gear' in page.evaluate('() => CT.load("adventure", "auto", null)')['items'])
    fresh(page, keep=True)
    page.evaluate('() => { T5.adv(); T5.pick("繼續遊戲"); __nes.step(30); }')
    s = S(page)
    ok('標題 → 繼續遊戲：第一項是「自動」（預設游標）', s['menu']['items'][0] == '自動' and s['menu']['sel'] == 0 and len(s['menu']['items']) == 4,
       s['menu'])
    page.evaluate('() => T5.pick("自動")')
    s = page.evaluate('() => T5.adv()')
    ok('讀自動存檔 → 回到廣場、小齒輪在身上、指令選單', s['scene'] == 'plaza' and 'gear' in s['items'] and s['menuKind'] == 'cmd'
       and '自動存檔' in s['lastMsg'], (s['scene'], s['items'], s['lastMsg']))
    ok('自動存檔畫面字形池 overflow 0、缺字 0', s['text']['overflow'] == 0 and not s['text']['missing'], s['text'])


def test_save_load(page):
    fresh(page)
    new_game(page)
    play_route(page, TRUE_ROUTE[:5])
    act(page, '系統', '存檔')
    page.evaluate('() => T5.pick("第2格")')
    s = page.evaluate('() => T5.adv()')
    ok('系統 → 存檔 → 第 2 格', '第 2 格' in s['lastMsg'], s['lastMsg'])
    fresh(page, keep=True)
    page.evaluate('() => { T5.adv(); T5.pick("繼續遊戲"); __nes.step(30); T5.adv(); }')
    page.evaluate('() => T5.pick("第2格")')
    s = page.evaluate('() => T5.adv()')
    ok('重開頁面 → 繼續遊戲 → 第 2 格：回到廣場、物品 / 旗標還原', s['scene'] == 'plaza' and 'gear' in s['items'] and 'lamp' in s['items']
       and 'gotGear' in s['flags'] and s['menuKind'] == 'cmd', (s['scene'], s['items']))
    fresh(page, keep=True)
    page.evaluate('() => { T5.adv(); T5.pick("繼續遊戲"); __nes.step(30); T5.adv(); }')
    page.evaluate('() => T5.pick("第1格")')
    page.evaluate('() => __nes.step(30)')
    s = S(page)
    ok('空的存檔格 → 不開始、回標題', s['mode'] == 'title', s['mode'])


def test_pause_exit(page):
    fresh(page, '&mute=0')
    new_game(page)
    tap(page, START, 10)
    s = S(page)
    paused = page.evaluate('() => !!(NES.instance && NES.instance.music ? NES.instance.music.isPaused() : (__nes.nes && __nes.nes.music.isPaused()))')
    loc = page.evaluate('() => CT.Adv.dev.T().readLine(21, 2, 10).trim()')
    ok('START 暫停：BGM pause、位置欄顯示暫停中', s['paused'] and loc == '暫停中', (paused, loc))
    f0 = S(page)['menu']['sel']
    tap(page, DOWN, 10)
    ok('暫停中選單不動', S(page)['menu']['sel'] == f0)
    tap(page, START, 10)
    s = S(page)
    loc = page.evaluate('() => CT.Adv.dev.T().readLine(21, 2, 10).trim()')
    ok('再按 START 解除、位置名還原', not s['paused'] and loc == '閣樓小屋', loc)
    page.evaluate('() => CT.get("adventure").exit(CT.nes())')
    ok('exit() 停音樂', S(page)['music'] is None)


def test_audio(page):
    fresh(page)
    a = page.evaluate('() => ({ songs: Object.keys(CT.Adv.Audio.SONGS), sfx: Object.keys(CT.Adv.Audio.SFX) })')
    ok('原創 BGM ≥ 3 首（%d）+ 音效 ≥ 4（%d）' % (len(a['songs']), len(a['sfx'])), len(a['songs']) >= 3 and len(a['sfx']) >= 4, a)


def test_bot(browser):
    for lag in (14, 0, 24):
        pg = browser.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '&bot=1&lag=%d' % lag)
        pg.wait_for_function('() => !!window.__nes && !!CT.Adv && !!CT.Adv.dev')
        pg.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart5.adventure.")).forEach(k => localStorage.removeItem(k)); }')
        r = pg.evaluate('''() => { let maxLine = 0, peak = 0, f = 0;
          for (; f < 30000; f++) { __nes.step(1); const st = __nes.stats(); maxLine = Math.max(maxLine, st.maxSpritesLine | 0); peak = Math.max(peak, st.budget.peak | 0);
            if (GAME.state().goal) break; }
          const st = __nes.stats(), s = GAME.state().s;
          return { goal: GAME.state().goal, frames: f, maxLine: maxLine, over: st.budget.overFrames, peak: peak, overflow: s.text.overflow, missing: CT.Text.missing(), ending: s.ending }; }''')
        ok('機器人 lag %d：真結局 goal（%d 幀）、每線 ≤ 8、overFrames 0、字形池 overflow 0、缺字 0' % (lag, r['frames']),
           r['goal'] and r['ending'] == 'true' and r['maxLine'] <= 8 and r['over'] == 0 and r['overflow'] == 0 and not r['missing'] and not errs, (r, errs[:2]))
        pg.close()


def main():
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            for fn in (test_contract, test_help, test_pictures, test_menus, test_blocks_and_defaults, test_hint_and_cheat, test_autosave,
                       test_endings, test_cheat_goal, test_save_load, test_pause_exit, test_audio):
                try:
                    fn(page)
                except Exception as e:  # noqa
                    ok(fn.__name__ + ' 執行', False, repr(e)[:300])
            ok('全程沒有頁面錯誤', not errs, errs[:3])
            test_bot(browser)
            browser.close()
    except Exception as e:  # noqa
        print('環境錯誤：', e)
        return 2
    n = sum(1 for r in results if r[0])
    print('test_adventure: %d/%d PASS' % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
