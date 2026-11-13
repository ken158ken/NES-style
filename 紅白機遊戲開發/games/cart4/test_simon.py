# -*- coding: utf-8 -*-
"""《星塵跟我做 STAR ECHO》（cart4 槽 2，id = simon）自動驗證。

重點：四顆星標形狀 / 音高 / 音色兩兩不同、展示時的視覺提示（調色盤亮燈）與聲音（p1 鍵音）、EAR 不亮 / EYE 不響、
      遊玩 BGM 只用 tri + noi ⇒ 鍵音與 BGM 同時存在不搶聲道、READY 倒數、輸入對錯 / 逾時 MISS / 同串重放、
      重看一次（扣分不扣命、每回合一次）、倒著輸入、8 鍵（B + 方向）、暫停 BGM、密技（遊玩 +1 命 / 結束原地續關 /
      標題無效 / goal 失效）、§6 規則、機器人只讀畫面 / 聲音（延遲 0 / 14 / 24 幀都過 goal；EAR 純聽音也過 8 步）、
      每線 ≤ 8 精靈、overFrames 0。
fix-r8（qa-r8）：OCTET 方向先按 B 晚到 ≤ 4 幀仍判第二組（P2-6）、同一幀兩方向（觸控斜方向）不判定 + setWays(4/8)（P2-7）、
      HUD / 標題第 0~1 列留白與段落空列（P3-2 / P3-3）、goal 前不到最快 + 每 5 步回 1 命（P3-4）、EAR 開局前 SOUND CHECK（P3-6）、
      鍵音不是大 / 小三和弦（P3-7）、真人濾鏡（tools/human_filter.js）下的 goal 與 OCTET 量測。
作法：Playwright 開 `cart4.html?game=simon&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Simon.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_simon.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=simon'
VERBOSE = '-v' in sys.argv
QUICK = os.environ.get('NES_QUICK') == '1' or '--quick' in sys.argv   # run_all.sh --quick 設 NES_QUICK=1：略過長時間的真人模型 / 蒙地卡羅（完整 run_all 照跑）
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
DIRS = [UP, RIGHT, DOWN, LEFT]


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Simon && !!CT.Simon.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.simon.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def start(page, mode=0, seed=77):
    page.evaluate('([m, s]) => { CT.Simon.dev.start(m, s); __nes.step(1); }', [mode, seed])


def until(page, phase, n=2000):
    return page.evaluate('([p, n]) => { for (let i = 0; i < n; i++) { if (GAME.state().s.phase === p) return i; __nes.step(1); } return -1; }', [phase, n])


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0, maxLen: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    const st = GAME.state().s; r.maxLen = Math.max(r.maxLen, st.maxDone | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
    if (o.until === 'len' && st.maxDone >= o.len) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""


# ---------------- 真人模型（qa-r8 的 tools/human_filter.js）----------------
# 在 CT.current.bot 外面包一層：機器人自己的 &lag= 當基本反應延遲；每次按下另加 N(mj, sj) 幀；換組（120 幀內）+U(sw0, sw1)；
# lapse 機率分心 +lapseF 幀；兩次按下最少隔 refr 幀。P2-6 另加「兩手不同步」層（LATE_B_JS）：B 以機率 p 晚方向 1..maxL 幀。
HUMAN_JS = (ROOT / 'tools' / 'human_filter.js').read_text(encoding='utf-8')
LATE_B_JS = r"""
window.__lateBInstall = function (o) {
  // 「和弦」層（包在真人濾鏡外面）：真人濾鏡把每個鍵各自延遲，會把「B + 方向」拆散（B 放開了方向才到）；
  // 人按和弦時會一直按住 B 直到方向按下、隨即放開。所以：濾鏡輸出 B 按下後，B 保持到方向按下後 3 幀（最多 40 幀）就放。
  // 兩手不同步：以機率 o.p 讓 B 改成「方向按下後 1..o.maxL 幀」才出現（qa-r8：兩手同按常見差 1~2 幀，兩指觸控更大）。
  var g = CT.current, inner = g.bot.bind(g), s = o.seed | 0 || 9, t = 0, prevIn = 0, prevDir = 0, open = -1, late = 0, hold = -1, lateAt = -1;
  function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  window.__lateB = { n: 0, late: 0 };
  g.bot = function (nes) {
    t++;
    var m = inner(nes) | 0, bRise = (m & 2) && !(prevIn & 2), dir = m & 0xF0, dRise = dir && !prevDir;
    prevIn = m; prevDir = dir;
    if (bRise) { __lateB.n++; open = t; late = rnd() < o.p ? 1 + Math.floor(rnd() * o.maxL) : 0; if (late) __lateB.late++; hold = -1; lateAt = -1; }
    if (open >= 0) {
      if (dRise) { if (late) { lateAt = t + late; hold = lateAt + 4; } else hold = t + 3; open = -1; }
      else if (t - open > 40) open = -1;
    }
    // B 完全由這層決定（濾鏡的 B 只用來偵測「要按和弦了」），和弦結束就放開，不會拖到下一個低音
    var on = open >= 0 ? !late : (hold >= 0 && t <= hold && (lateAt < 0 || t >= lateAt));
    return on ? (m | 2) : (m & ~2);
  };
};
"""
HUM_RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, maxLen: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    r.ml = Math.max(r.ml, __nes.stats().maxSpritesLine | 0);
    const st = GAME.state().s; r.maxLen = Math.max(r.maxLen, st.maxDone | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
    if (o.until === 'len' && st.maxDone >= o.len) break;
    if (st.phase === 'over') break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""


def hum_run(page, query, seed, n, until='goal', ln=0, mj=3, sj=3, refr=4, lapse=0.03, grace=None, late=None):
    fresh(page, '&bot=1&seed=%d&' % seed + query)
    if grace is not None:
        page.evaluate('(n) => CT.Simon.dev.grace(n)', grace)
    page.evaluate('() => {' + HUMAN_JS + '}')
    o = dict(groups={'1': 255}, swWin=120, refr=refr, lapseF=30, seed=seed * 7 + 3, mj=mj, sj=sj, sw0=10, sw1=20, lapse=lapse)
    page.evaluate('(o) => { o.on = function () { var s = CT.current.state(); return s && s.mode === "play"; }; __humInstall(o); }', o)
    if late:
        page.evaluate('() => {' + LATE_B_JS + '}')
        page.evaluate('(o) => __lateBInstall(o)', dict(p=late[0], maxL=late[1], seed=seed * 13 + 1))
    r = page.evaluate(HUM_RUN, {'n': n, 'until': until, 'len': ln})
    page.evaluate('() => CT.Simon.dev.grace(4)')
    return r


def rows_text(page):
    return page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Simon.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = t ? '#' : ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-().,?') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")


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
    reg = page.evaluate("""() => { const g = CT.get('simon'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id simon / order 2 / title 星塵跟我做 / legacy 4 款', reg and reg['id'] == 'simon' and reg['order'] == 2 and reg['title'] == '星塵跟我做' and len(reg['legacy']) == 4, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 6 字元（00STEP）', reg['bestText'] == '00STEP' and len(reg['bestText']) == 6, reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Simon.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Simon.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Simon.Audio.SONGS), sfx: Object.keys(CT.Simon.Audio.SFX) })")
    ok('BGM ≥ 1（4 首）、音效 ≥ 4，全部 simon_ 前綴', len(au['songs']) >= 4 and len(au['sfx']) >= 4 and all(k.startswith('simon_') for k in au['songs'] + au['sfx']), au)
    ok('5 個模式：classic / ear / eye / reverse / octet', page.evaluate("() => CT.Simon.MODES.map(m => m.id).join(',')") == 'classic,ear,eye,reverse,octet')

    # 四顆星標：形狀兩兩不同、不是實心方塊、四色相不同
    sh = page.evaluate("""() => { const out = []; for (let k = 0; k < 4; k++) { const px = CT.Simon.shapePx(k, 48); let key = '', fill = 0;
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const v = px[y][x] ? 1 : 0; key += v; fill += v; } out.push({ key, fill: fill / 2304 }); } return out; }""")
    diffs = [sum(1 for i in range(2304) if sh[a_]['key'][i] != sh[b_]['key'][i]) for a_ in range(4) for b_ in range(a_ + 1, 4)]
    ok('四顆星標輪廓兩兩不同（每對 ≥ 300 像素差）、都不是方塊（填滿 20~65%）', min(diffs) >= 300 and all(0.2 <= x['fill'] <= 0.65 for x in sh), (min(diffs), [round(x['fill'], 2) for x in sh]))
    hues = page.evaluate("() => CT.Simon.LIT.map(p => p[1] & 15)")
    ok('四顆亮燈色相兩兩不同（青 / 金 / 洋紅 / 綠，不是紅綠藍黃四色組）', len(set(hues)) == 4 and 0x06 not in hues and 0x01 not in hues, hues)

    # 鍵音：音高兩兩不同、各組內 下 < 左 < 右 < 上、四方向音色不同、第二組有八度閃爍
    keys = page.evaluate("() => CT.Simon.Audio.KEYS")
    mid = [k['midi'] for k in keys]
    ok('8 個鍵音音高兩兩不同', len(set(mid)) == 8, mid)
    ok('音高順序 ↓ < ← < → < ↑（兩組都是）', all(mid[g + 2] < mid[g + 3] < mid[g + 1] < mid[g + 0] for g in (0, 4)), mid)
    ok('四方向音色（占空比 + 包絡）兩兩不同、第二組加八度閃爍', len(set((k['duty'], k['kind']) for k in keys[:4])) == 4 and all(k.get('shimmer') for k in keys[4:]) and not any(k.get('shimmer') for k in keys[:4]), [(k['duty'], k['kind']) for k in keys])
    fr = page.evaluate("() => CT.Simon.Audio.toneFrames(4, 20).filter(f => f.note).map(f => f.note)")
    ok('第二組鍵音逐幀在本音與高八度間切換（F6 / F7）', 'F-6' in fr and 'F-7' in fr, fr[:6])
    # P3-7：四鍵（以及第二組）都不是大 / 小三和弦，也不是舊版 A 大三和弦；最小音程 ≥ 5 半音；八度閃爍音不撞任何一顆
    def has_triad(ms):
        pcs = set(m % 12 for m in ms)
        return any(((r + 4) % 12 in pcs or (r + 3) % 12 in pcs) and (r + 7) % 12 in pcs for r in pcs)
    g1, g2 = sorted(mid[:4]), sorted(mid[4:])
    ok('P3-7 鍵音原創：兩組四音都不含大 / 小三和弦（舊版 A4/C#5/E5/A5 = A 大三和弦）', not has_triad(g1) and not has_triad(g2) and set(g1) != {69, 73, 76, 81}, (g1, g2))
    ok('P3-7 第一組相鄰最小音程 ≥ 5 半音（比舊版 3 半音好分辨）、8 音 + 4 個閃爍八度共 12 個音高互不相同',
       min(b_ - a_ for a_, b_ in zip(g1, g1[1:])) >= 5 and len(set(mid + [m + 12 for m in mid[4:]])) == 12, (g1, mid))
    play = page.evaluate("() => { const s = CT.Simon.Audio.SONGS.simon_play; const ch = {}; s.patterns.forEach(p => Object.keys(p).forEach(k => { if (p[k].some(r => r)) ch[k] = 1; })); return Object.keys(ch).sort(); }")
    ok('遊玩 BGM 只用 tri + noi（p1 留給鍵音、p2 留給系統音效）', play == ['noi', 'tri'], play)

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Simon.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-()') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 標題寫著 HOLD START+SELECT: MENU', 'HOLD START+SELECT: MENU' in txt)
    ok('§6-6 標題寫著 C/★ = CHEAT', 'C/$ = CHEAT' in txt)
    ok('標題有十字鍵對照（UP STAR / RIGHT MOON / LEFT COMET / DOWN PLANET / HOLD B + DIR）', all(w in txt for w in ['UP    STAR', 'RIGHT MOON', 'LEFT  COMET', 'DOWN  PLANET', 'HOLD B + DIR']))
    ok('P3-2 標題第 0、1 列全空（大字 ECHO 從第 2 列起，不貼可見區頂端）', not tt[0].strip() and not tt[1].strip() and 'STARDUST' in tt[3], tt[:4])
    mr = [i for i, r in enumerate(tt) if 'BEST' in r]
    dr = [i for i, r in enumerate(tt) if 'CHAIN GROWS' in r]
    ok('P3-3 標題：模式清單與說明之間空一列', mr and dr and dr[0] - mr[-1] == 2 and not tt[mr[-1] + 1].strip(), (mr, dr))
    page.evaluate('() => CT.cheat()')
    ok('§6-1 標題按密技無效', S(page)['mode'] == 'title' and S(page)['cheats'] == 0)

    # ---------------- READY 倒數 + 展示 ----------------
    start(page, 0, 31)
    c = page.evaluate('() => CT.Simon.dev.consts')
    tap(page, UP)
    st = S(page)
    ok('開局 READY 倒數（%d 幀），期間按鍵無效' % c['READY_F'], st['phase'] == 'ready' and st['pos'] == 0 and st['lives'] == 3, st['phase'])
    ok('展示節奏表（幀）：1~5 步 30+12、6~9 步 24+10、10~15 步 19+8、16+ 步 15+7', page.evaluate('() => [1,6,10,15,16].map(n => CT.Simon.dev.timing(n).join("+")).join(",")') == '30+12,24+10,19+8,19+8,15+7')
    ok('P3-4 goal（%d 步）之前最快只到 19+8，最快 15+7 從第 16 步起' % c['GOAL_LEN'], page.evaluate('(n) => CT.Simon.dev.timing(n)[0]', c['GOAL_LEN']) == 19 and page.evaluate('(n) => CT.Simon.dev.timing(n)[0]', c['GOAL_LEN'] + 1) == 15)
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    st = S(page)
    vis = page.evaluate('() => CT.Simon.dev.seeLit()')
    ms = page.evaluate('() => __nes.nes().music.state()')
    seq0 = page.evaluate('() => CT.Simon.dev.seq()')
    ok('經典展示：畫面上那顆的調色盤亮起（= 序列第 1 顆）', vis == seq0[0] and st['lit'] == seq0[0], (vis, seq0))
    ok('鍵音與 BGM 共存：p1 被 simon_k* 佔用，同時 BGM（tri）照常在播', (ms['channels'][0]['owner'] or '').startswith('simon_k') and ms['playing'] and ms['channels'][2]['on'], (ms['channels'][0]['owner'], ms['playing']))
    r0 = ms['rowsPlayed']
    page.evaluate('() => __nes.step(40)')
    ok('展示期間 BGM 的 row 持續前進（沒被鍵音打斷）', page.evaluate('() => __nes.nes().music.state().rowsPlayed') > r0)

    # 輸入：對 → 過關；錯 → MISS 扣命、同一串重放
    until(page, 'input')
    tap(page, DIRS[seq0[0]], 20)
    st = S(page)
    ok('按對 → 本回合完成（GOOD），長度 +1 進下一回合', st['phase'] in ('good', 'intro') and st['maxDone'] == 1, (st['phase'], st['maxDone']))
    until(page, 'input')
    seq = page.evaluate('() => CT.Simon.dev.seq()')
    wrong = (seq[0] + 1) % 4
    tap(page, DIRS[wrong], 2)
    st = S(page)
    ok('按錯 → MISS、命 −1、亮出正確那顆', st['phase'] == 'miss' and st['lives'] == 2 and st['misses'] == 1, (st['phase'], st['lives']))
    until(page, 'intro', 400)
    ok('MISS 後同一串（同長度）重放', S(page)['len'] == 2 and page.evaluate('() => CT.Simon.dev.seq()') == seq)
    until(page, 'input')
    n = page.evaluate('() => { let i = 0; while (GAME.state().s.phase === "input" && i < 500) { __nes.step(1); i++; } return i; }')
    ok('輸入 6 秒（%d 幀）沒按 → MISS' % c['INPUT_TIMEOUT'], S(page)['phase'] == 'miss' and abs(n - c['INPUT_TIMEOUT']) <= 2, n)

    # 重看一次
    until(page, 'input', 600)
    sc0 = S(page)['score']
    tap(page, B, 2)
    st = S(page)
    ok('輸入中按 B → 重看一次（回到展示、扣分不扣命）', st['phase'] in ('intro', 'show') and st['replayUsed'] and st['lives'] == 1 and st['score'] <= sc0, (st['phase'], st['lives'], sc0, st['score']))
    until(page, 'input')
    tap(page, SELECT, 2)
    ok('同一回合第二次重看無效', S(page)['phase'] == 'input' and S(page)['replays'] == 1)

    # 暫停
    tap(page, START)
    st = S(page)
    ok('§6-2 START 暫停：paused + BGM 暫停', st['paused'] and page.evaluate('() => CT.Simon.Audio.isPaused()'))
    p0 = st['pos']
    tap(page, DIRS[seq[0]])
    ok('暫停中按方向無效', S(page)['pos'] == p0)
    tap(page, START)
    ok('解除暫停：BGM 從暫停處接續', not S(page)['paused'] and not page.evaluate('() => CT.Simon.Audio.isPaused()') and S(page)['music'] == 'simon_play')

    # 密技
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 遊玩中密技 = 命 +1，goal 失效', st['lives'] == 2 and st['cheats'] == 1 and not page.evaluate('() => GAME.state().goal'))
    page.evaluate('() => { for (let k = 0; k < 6 && GAME.state().s.phase !== "over"; k++) { let i = 0; while (GAME.state().s.phase !== "input" && i < 900) { __nes.step(1); i++; } const s = CT.Simon.dev.seq(); const e = CT.Simon.dev.expect(); NES.Input.inject([16,128,32,64][(e + 1) % 4], 1); __nes.step(2); let j = 0; while (GAME.state().s.phase === "miss" && j < 200) { __nes.step(1); j++; } } }')
    st = S(page)
    ok('命用完 → GAME OVER + 結束曲', st['phase'] == 'over' and st['music'] == 'simon_over', (st['phase'], st['lives']))
    len0 = st['len']
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 GAME OVER 按密技 = 原地續關（同步數、命補 3）', st['phase'] == 'intro' and st['len'] == len0 and st['lives'] == 3 and st['continues'] == 1, (st['phase'], st['len'], st['lives']))

    # 倒著輸入 / 8 鍵
    start(page, 3, 41)
    page.evaluate('() => CT.Simon.dev.setLen(3)')
    until(page, 'input')
    sq3 = page.evaluate('() => CT.Simon.dev.seq()')
    ok('REVERSE：第一個要按的是最後一顆', page.evaluate('() => CT.Simon.dev.expect()') == sq3[-1], sq3)
    for k in reversed(sq3):
        tap(page, DIRS[k], 3)
    page.evaluate('() => __nes.step(20)')
    ok('REVERSE：倒著按完 = 過關', S(page)['maxDone'] == 3, S(page)['maxDone'])
    start(page, 4, 43)
    sq8 = page.evaluate('() => CT.Simon.makeSeq(43, 8)')
    ok('OCTET 序列用到第二組（k ≥ 4）', any(k >= 4 for k in sq8[:20]), sq8[:12])
    until(page, 'input')
    k0 = page.evaluate('() => CT.Simon.dev.expect()')
    if k0 >= 4:
        page.evaluate('(d) => { NES.Input.inject(2, 1); __nes.step(1); NES.Input.inject(2 | d, 1); __nes.step(1); __nes.step(20); }', DIRS[k0 & 3])
    else:
        tap(page, DIRS[k0], 20)
    ok('OCTET：按住 B + 方向 = 第二組、只按方向 = 第一組（第 1 顆 k=%d 答對）' % k0, S(page)['maxDone'] == 1 and S(page)['lastTone'] == k0, (S(page)['maxDone'], S(page)['lastTone']))

    # P3-6 EAR 開局前 SOUND CHECK：輪播四個鍵音；B = 回標題並提示靜音開關；A = 開始
    page.evaluate('() => CT.Simon.dev.soundOk(false)')
    start(page, 1, 51)
    st = S(page)
    t0 = st['toneCount']
    page.evaluate('() => __nes.step(100)')
    ck = rows_text(page)
    ok('P3-6 EAR 開局 → 先進 SOUND CHECK（不是直接開始）、畫面寫 HEAR THEM? / A = YES / B = NO / SILENT SWITCH', st['mode'] == 'check' and 'SOUND CHECK' in '\n'.join(ck) and 'SILENT SWITCH' in '\n'.join(ck) and 'A = YES' in '\n'.join(ck), st['mode'])
    ok('P3-6 SOUND CHECK 期間輪播四個鍵音（100 幀 ≥ 4 個）', S(page)['toneCount'] - t0 >= 4, S(page)['toneCount'] - t0)
    tap(page, B, 4)
    st = S(page)
    ok('P3-6 SOUND CHECK 按 B → 回標題，並在標題提示 NO SOUND? CHECK SILENT / SWITCH AND VOLUME', st['mode'] == 'title' and st['titleMsgT'] > 0 and any('CHECK SILENT' in r or 'SWITCH AND VOLUME' in r for r in rows_text(page)), (st['mode'], st['titleMsgT']))
    start(page, 1, 51)
    tap(page, A, 2)
    st = S(page)
    ok('P3-6 SOUND CHECK 按 A → 開始 EAR；同一次進入後再開 EAR 不再問', st['mode'] == 'play' and st['gameMode'] == 'ear' and st['soundOk'], (st['mode'], st['gameMode']))
    start(page, 0, 51)
    ok('P3-6 CLASSIC（有亮燈）不需要 SOUND CHECK', S(page)['mode'] == 'play')

    # EAR：展示時不亮燈但有聲音；EYE：亮燈但沒聲音
    start(page, 1, 51)
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    ok('EAR：展示時畫面不亮（四顆都 dim），但 p1 正在發鍵音', page.evaluate('() => CT.Simon.dev.seeLit()') == -1 and page.evaluate('() => CT.Simon.dev.hear()') == page.evaluate('() => CT.Simon.dev.seq()[0]'))
    start(page, 2, 52)
    t0 = S(page)['toneCount']
    until(page, 'show')
    page.evaluate('() => __nes.step(3)')
    ok('EYE：展示時亮燈，但整局不發鍵音', page.evaluate('() => CT.Simon.dev.seeLit()') == page.evaluate('() => CT.Simon.dev.seq()[0]') and S(page)['toneCount'] == t0)

    # ---------------- fix-r8 P2-6：OCTET 方向先按、B 晚到 ----------------
    def octet_case(lead, grace=4, b_first=False):
        start(page, 4, 43)
        page.evaluate('(n) => CT.Simon.dev.grace(n)', grace)
        until(page, 'input')
        k0 = page.evaluate('() => CT.Simon.dev.expect()')
        d = DIRS[k0 & 3]
        if b_first:
            page.evaluate('(d) => { NES.Input.inject(2, 1); __nes.step(1); NES.Input.inject(2 | d, 1); __nes.step(1); NES.Input.inject(2, 3); __nes.step(3); __nes.step(10); }', d)
        else:
            # 方向按 lead + 2 幀（人手按住），B 在方向按下後第 lead 幀才按下並按住 6 幀
            page.evaluate('([d, L]) => { for (let i = 0; i < L; i++) { NES.Input.inject(d, 1); __nes.step(1); } for (let i = 0; i < 6; i++) { NES.Input.inject(2 | (i < 2 ? d : 0), 1); __nes.step(1); } __nes.step(10); }', [d, lead])
        st = S(page)
        page.evaluate('() => CT.Simon.dev.grace(4)')
        return k0, st
    k0, st = octet_case(0, b_first=True)
    ok('P2-6 OCTET：B 先按再按方向 → 第二組（當幀判定）', st['lastTone'] == (k0 | 4), (k0, st['lastTone']))
    for lead in (1, 2, 4):
        k0, st = octet_case(lead)
        ok('P2-6 OCTET：方向先 %d 幀、B 才按下 → 仍判第二組（B_GRACE 4 幀）' % lead, st['lastTone'] == (k0 | 4), (k0, st['lastTone'], st['phase']))
    k0, st = octet_case(5)
    ok('P2-6 OCTET：方向先 5 幀才按 B → 超過容錯，判第一組', st['lastTone'] == (k0 & 3), (k0, st['lastTone']))
    k0, st = octet_case(2, grace=0)
    ok('P2-6 對照組（grace 0 = 舊版）：方向先 2 幀 → 判成第一組（qa-r8 重現）', st['lastTone'] == (k0 & 3), (k0, st['lastTone']))
    start(page, 4, 43)
    until(page, 'input')
    k0 = page.evaluate('() => CT.Simon.dev.expect()')
    page.evaluate('(d) => { NES.Input.inject(d, 1); __nes.step(1); }', DIRS[k0 & 3])
    t1 = S(page)
    page.evaluate('() => __nes.step(5)')
    t2 = S(page)
    ok('P2-6 OCTET：只按方向 → 先暫緩（%d 幀內不出聲），時限到才判第一組' % 4, t1['pend'] == (k0 & 3) and t2['pend'] == -1 and t2['lastTone'] == (k0 & 3), (t1['pend'], t2['pend'], t2['lastTone']))

    # ---------------- fix-r8 P2-7：觸控斜方向 ----------------
    start(page, 0, 47)
    until(page, 'input')
    st0 = S(page)
    tap(page, UP | RIGHT, 4)
    st = S(page)
    ok('P2-7 同一幀兩個方向一起按下（觸控斜方向）→ 不判定（不 MISS、不前進、不出鍵音）', st['phase'] == 'input' and st['pos'] == 0 and st['misses'] == st0['misses'] and st['toneCount'] == st0['toneCount'], (st['phase'], st['pos']))
    k0 = page.evaluate('() => CT.Simon.dev.expect()')
    tap(page, DIRS[k0], 4)
    st = S(page)
    ok('P2-7 接著按單一方向 → 正常判定', st['pos'] == 1 or st['phase'] in ('good', 'intro'), (st['phase'], st['pos'], st['lastTone']))
    ways = page.evaluate("""() => { const log = []; const T = NES.Touch || (NES.Touch = {}); const old = T.setWays;
        T.setWays = (n) => log.push(n);
        CT.Simon.dev.start(0, 9); __nes.step(1); const inPlay = log.slice();
        CT.get('simon').exit(__nes.nes()); const afterExit = log.slice();
        T.setWays = undefined; let err = null; try { CT.Simon.dev.start(0, 9); __nes.step(2); CT.get('simon').exit(__nes.nes()); } catch (e) { err = String(e); }
        T.setWays = old; return { inPlay, afterExit, err }; }""")
    ok('P2-7 進入遊玩呼叫 NES.Touch.setWays(4)、exit 設回 8；API 不存在時不報錯', ways['inPlay'][-1:] == [4] and ways['afterExit'][-1:] == [8] and ways['err'] is None, ways)
    fresh(page)

    # ---------------- fix-r8 P3-4：每 5 步回 1 命 ----------------
    start(page, 0, 53)
    page.evaluate('() => CT.Simon.dev.setLen(5)')
    until(page, 'input')
    e = page.evaluate('() => CT.Simon.dev.expect()')
    tap(page, DIRS[(e + 1) % 4], 2)
    ok('（先 MISS 一次：命 3 → 2）', S(page)['lives'] == 2)
    until(page, 'input', 400)
    for k in page.evaluate('() => CT.Simon.dev.seq()'):
        tap(page, DIRS[k], 3)
    page.evaluate('() => __nes.step(20)')
    st = S(page)
    ok('P3-4 完成第 5 步 → 回 1 命（2 → 3），訊息 LIFE+1', st['lives'] == 3 and st['lifeUps'] == 1, (st['lives'], st['lifeUps'], st['msg']))

    # P3-2 遊玩 HUD 不貼頂（第 0、1 列全空）、模式名不再寫到第 31 欄
    pr = rows_text(page)
    ok('P3-2 / P3-3 遊玩畫面第 0、1 列全空；模式名在上方標題列、右側 HUD 不超過第 30 欄', not pr[0].strip() and not pr[1].strip() and 'CLASSIC' in pr[2] and all(len(r.rstrip()) <= 31 for r in pr[3:]), [pr[2]] + [r for r in pr if len(r.rstrip()) > 31][:2])

    # §6-3 exit 存最高分
    start(page, 0, 61)
    page.evaluate('() => CT.Simon.dev.setLen(7)')
    until(page, 'input')
    for k in page.evaluate('() => CT.Simon.dev.seq()'):
        tap(page, DIRS[k], 3)
    page.evaluate('() => { __nes.step(20); CT.get("simon").exit(__nes.nes()); }')
    ok('§6-3 exit() 存最高步數 + bestText 07STEP', page.evaluate('() => CT.load("simon", "best", 0)') == 7 and page.evaluate('() => CT.get("simon").bestText()') == '07STEP')

    # ---------------- 機器人（只讀畫面 / 聲音） ----------------
    for lag, lim in ((14, 9000), (0, 9000), (24, 11000)):
        fresh(page, '&bot=1&seed=21&lag=%d' % lag)
        page.evaluate('() => CT.Simon.dev.guard(true)')
        r = page.evaluate(RUN, {'n': lim, 'until': 'goal'})
        r['reads'] = page.evaluate('() => CT.Simon.dev.guardReads()')
        ok('機器人（延遲 %d 幀）：%d 幀內經典 15 步 goal（%d 幀）' % (lag, lim, r['f']), r['goal'] and r['s']['cheats'] == 0 and r['s']['misses'] == 0 and r['s']['replays'] == 0, (r['f'], r['s']['maxDone']))
        if lag == 14:
            ok('防偷看：隱藏答案包成 Proxy，bot() 期間讀取 0 次', r['reads'] == 0, r['reads'])
            ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
    for mode, name in ((1, 'EAR（純聽音高辨位）'), (3, 'REVERSE'), (4, 'OCTET')):
        fresh(page, '&bot=1&seed=33&mode=%d' % mode)
        r = page.evaluate(RUN, {'n': 6000, 'until': 'len', 'len': 8})
        ok('機器人 %s：0 失誤完成 8 步' % name, r['s']['maxDone'] >= 8 and r['s']['misses'] == 0 and r['ml'] <= 8 and r['over'] == 0, (r['f'], r['s']['maxDone'], r['s']['misses']))

    if QUICK:
        print('  SKIP（NES_QUICK）真人濾鏡 CLASSIC 3 種子 + OCTET 失誤率')
    else:
        # ---------------- 真人濾鏡（tools/human_filter.js） ----------------
        hum = []
        for sd in (21, 22, 23):
            r = hum_run(page, 'lag=20', sd, 14000)
            hum.append(r)
        ok('真人濾鏡（延遲 20 + N(3,3) + 3%% 分心 +30 幀）：CLASSIC 3 / 3 種子達成 goal 15 步（%s 幀）' % [x['f'] for x in hum],
           all(x['goal'] for x in hum) and all(x['ml'] <= 8 and x['over'] == 0 for x in hum), [(x['f'], x['s']['maxDone'], x['s']['misses']) for x in hum])
        # OCTET：refr 0 ⇒ B 與方向各自延遲 N(3,3)，常常方向先到；比較舊版（grace 0）與新版（grace 4）的失誤
        # 失誤率 = 失誤 / 輸入按鍵數（完成 n 步 = 按了 1+2+…+n 下，加上失誤那幾下）
        oc = {}
        for sj in (3,):
            for gr in (0, 4):
                ms_, pr_ = 0, 0
                for sd in (31, 32, 33):
                    r = hum_run(page, 'mode=4&lag=16', sd, 9000, until='len', ln=10, sj=sj, refr=0, lapse=0, grace=gr, late=(0.5, 3))
                    ms_ += r['s']['misses']; pr_ += r['s']['maxDone'] * (r['s']['maxDone'] + 1) // 2 + r['s']['misses']
                oc[(sj, gr)] = (ms_, pr_, round(100.0 * ms_ / max(1, pr_), 1))
            print('  [量測] OCTET 真人濾鏡（N(3,%s) + 50%% 的 B 晚方向 1~3 幀）3 種子：舊版 失誤 %d / %d 下（%s%%）→ 新版 %d / %d 下（%s%%）' % ((sj,) + oc[(sj, 0)] + oc[(sj, 4)]))
        ok('P2-6 真人濾鏡 OCTET：新版每下失誤率 ≤ 舊版 1/4（%s%% → %s%%）' % (oc[(3, 0)][2], oc[(3, 4)][2]),
           oc[(3, 4)][2] * 4 <= oc[(3, 0)][2] and oc[(3, 0)][0] > 0, oc)

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_simon: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
