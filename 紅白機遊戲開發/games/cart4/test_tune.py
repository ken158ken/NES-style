# -*- coding: utf-8 -*-
"""《星塵旋律 STAR MELODY》（cart4 槽 4，id = tune）自動驗證。

重點：8 音鍵盤（十字鍵 + 按住 B）與對照圖、原創旋律產生器（音域 / 級進 / 收主音 / seed 可重現）、
      題目曲與畫面同步（亮鍵 / 時間軸由 driver row 推回）、節奏判定窗口（幀）、對錯 / 逾時 / 重聽、
      HIGH-LOW 與 ODD NOTE 兩個模式、HINT OFF（只靠聲音）、輸入時鍵音（p1）與節拍器 BGM（tri + noi）共存、
      暫停、密技、§6 規則、機器人只讀畫面 / 聲音（延遲 0 / 14 / 24 都過 goal）、每線 ≤ 8、overFrames 0。
fix-r8（qa-r8）：方向先按 B 晚到 ≤ 4 幀仍判高音組、節奏時間記方向那一幀（P2-6）、同一幀兩方向不判定 + setWays（P2-7）、
      HUD / 標題不貼頂、段落空列、按鍵列拆兩列（P3-2 / P3-3）、節奏容許 35% + 1 個音距（P3-5）、HINT OFF 的 SOUND CHECK（P3-6）、
      真人濾鏡（tools/human_filter.js）蒙地卡羅 + 實機回測。
作法：Playwright 開 `cart4.html?game=tune&debug=1&scale=1&mute=1`，`NES.Input.inject` + `CT.Tune.dev`。

用法：../卡比之星/.venv/bin/python games/cart4/test_tune.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = (ROOT / 'cart4.html').as_uri() + '?debug=1&scale=1&mute=1&game=tune'
VERBOSE = '-v' in sys.argv
QUICK = os.environ.get('NES_QUICK') == '1' or '--quick' in sys.argv   # run_all.sh --quick 設 NES_QUICK=1：略過長時間的真人模型 / 蒙地卡羅（完整 run_all 照跑）
results = []
A, B, SELECT, START, UP, DOWN, LEFT, RIGHT = 1, 2, 4, 8, 16, 32, 64, 128
KEYDIR = [LEFT, DOWN, UP, RIGHT]


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def fresh(page, query=''):
    page.goto(BASE + query)
    page.wait_for_function('() => !!window.__nes && !!window.CT && !!CT.Tune && !!CT.Tune.dev')
    page.evaluate('() => { Object.keys(localStorage).filter(k => k.startsWith("nes.cart4.tune.")).forEach(k => localStorage.removeItem(k)); __nes.step(1); }')


def S(page):
    return page.evaluate('() => GAME.state().s')


def tap(page, mask, after=2):
    page.evaluate('([m, k]) => { NES.Input.inject(m, 1); __nes.step(1); __nes.step(k); }', [mask, after])


def key(page, k, after=2):
    """彈第 k 鍵（k ≥ 4 先按住 B 一幀）。"""
    page.evaluate('([k, d, a]) => { if (k >= 4) { NES.Input.inject(2, 1); __nes.step(1); NES.Input.inject(2 | d, 1); } else NES.Input.inject(d, 1); __nes.step(1); __nes.step(a); }', [k, KEYDIR[k & 3], after])


def start(page, mode=0, seed=77, hint=True):
    page.evaluate('([m, s, h]) => { CT.Tune.dev.start(m, s, h); __nes.step(1); }', [mode, seed, hint])


def until(page, phase, n=3000):
    return page.evaluate('([p, n]) => { for (let i = 0; i < n; i++) { if (GAME.state().s.phase === p) return i; __nes.step(1); } return -1; }', [phase, n])


RUN = r"""
(o) => {
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0, peak: 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    const s = __nes.stats();
    r.ml = Math.max(r.ml, s.maxSpritesLine | 0); r.peak = Math.max(r.peak, s.budget.used | 0);
    if (o.until === 'goal' && GAME.state().goal) break;
    if (o.until === 'lv' && GAME.state().s.lvDone >= o.lv) break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""


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
  const r = { f: 0, ml: 0, over0: __nes.stats().budget.overFrames | 0 };
  for (let i = 0; i < o.n; i++) {
    __nes.step(1); r.f++;
    r.ml = Math.max(r.ml, __nes.stats().maxSpritesLine | 0);
    const st = GAME.state().s;
    if (GAME.state().goal || st.phase === 'over') break;
  }
  r.over = (__nes.stats().budget.overFrames | 0) - r.over0;
  r.s = GAME.state().s; r.goal = GAME.state().goal;
  return r;
}
"""
# 節奏蒙地卡羅：真正的旋律產生器 + 真正的 judgeRhythm；人的每個按下時間 = 理想時間 × 速度 + N(0, jit) 幀
MC = r"""
(o) => {
  let s = o.seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  const out = {};
  for (const rule of o.rules) {
    CT.Tune.dev.rhRule(rule[0], rule[1]);
    const res = [];
    for (const lv of [5, 6, 7, 8]) {
      const L = CT.Tune.LEVELS[lv - 1]; let pass = 0;
      for (let k = 0; k < o.N; k++) {
        const notes = CT.Tune.genMelody(L.n, L.hi, true, 1000 + k * 7 + lv);
        let t = 0; const times = [];
        for (let i = 0; i < notes.length; i++) { times.push(t + o.jit * gauss()); if (i < notes.length - 1) t += notes[i].dur * L.U * (1 + o.rel * gauss()); }
        if (CT.Tune.judgeRhythm(times, notes, L.U).ok) pass++;
      }
      res.push(Math.round(pass / o.N * 1000) / 10);
    }
    out[rule.join('/')] = res;
  }
  CT.Tune.dev.rhRule(0.35, 1);
  return out;
}
"""


def hum_run(page, query, seed, n, mj=3, sj=3, refr=4, lapse=0.03, rule=None, grace=None, late=None):
    fresh(page, '&bot=1&seed=%d&' % seed + query)
    if rule:
        page.evaluate('(r) => CT.Tune.dev.rhRule(r[0], r[1])', rule)
    if grace is not None:
        page.evaluate('(n) => CT.Tune.dev.grace(n)', grace)
    page.evaluate('() => {' + HUMAN_JS + '}')
    o = dict(groups={'1': 255}, swWin=120, refr=refr, lapseF=30, seed=seed * 7 + 3, mj=mj, sj=sj, sw0=10, sw1=20, lapse=lapse)
    page.evaluate('(o) => { o.on = function () { var s = CT.current.state(); return s && s.mode === "play"; }; __humInstall(o); }', o)
    if late:
        page.evaluate('() => {' + LATE_B_JS + '}')
        page.evaluate('(o) => __lateBInstall(o)', dict(p=late[0], maxL=late[1], seed=seed * 13 + 1))
    r = page.evaluate(HUM_RUN, {'n': n})
    page.evaluate('() => { CT.Tune.dev.rhRule(0.35, 1); CT.Tune.dev.grace(4); }')
    return r


def rows_text(page):
    return page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Tune.Art.make(); const rows = [];
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
    reg = page.evaluate("""() => { const g = CT.get('tune'); return g && { id: g.id, order: g.order, title: g.title, legacy: g.legacy,
        fns: ['init','update','draw','state','cheat','bot','goal','exit','bestText'].filter(k => typeof g[k] === 'function'),
        bt: g.backTile, bestText: g.bestText() }; }""")
    ok('註冊：id tune / order 4 / title 星塵旋律 / legacy 2 款', reg and reg['id'] == 'tune' and reg['order'] == 4 and reg['title'] == '星塵旋律' and len(reg['legacy']) == 2, reg)
    ok('註冊：契約函式齊全（9 個）', reg and len(reg['fns']) == 9, reg and reg['fns'])
    ok('bestText = 右對齊 6 字元（  LV00）', reg['bestText'] == '  LV00', reg['bestText'])
    ok('§6-4 backTile 指向自己精靈表的實心星', page.evaluate("(t) => t.tile === CT.Tune.Art.make().s('DOT')", reg['bt']), reg['bt'])
    a = page.evaluate("() => { const A = CT.Tune.Art.make(); return { bg: A.bg.count, spr: A.spr.count }; }")
    ok('CHR bank ≤ 256（bg / spr）', a['bg'] <= 256 and a['spr'] <= 256, a)
    au = page.evaluate("() => ({ songs: Object.keys(CT.Tune.Audio.SONGS), sfx: Object.keys(CT.Tune.Audio.SFX) })")
    ok('BGM ≥ 1（5 首）、音效 ≥ 4，全部 tune_ 前綴', len(au['songs']) >= 5 and len(au['sfx']) >= 4 and all(k.startswith('tune_') for k in au['songs'] + au['sfx']), au)
    ok('3 個模式：replay / highlow / odd', page.evaluate("() => CT.Tune.MODES.map(m => m.id).join(',')") == 'replay,highlow,odd')
    lv = page.evaluate('() => CT.Tune.LEVELS')
    ok('REPLAY 8 級：音數遞增 3→8、音域 DO-MI → 全 8 音、第 5 級起要對節奏、速度遞增',
       len(lv) == 8 and all(lv[i]['n'] <= lv[i + 1]['n'] and lv[i]['hi'] <= lv[i + 1]['hi'] and lv[i]['U'] >= lv[i + 1]['U'] for i in range(7))
       and lv[0]['n'] == 3 and lv[7]['n'] == 8 and lv[0]['hi'] == 2 and [x['rh'] for x in lv] == [False] * 4 + [True] * 4, [(x['n'], x['hi'], x['rh'], x['U']) for x in lv])
    hl = page.evaluate('() => CT.Tune.HL_LV.map(x => x.hi)')
    ok('HIGH-LOW 音程逐級縮小到半音', hl[0] >= 7 and hl[-1] == 1 and all(hl[i] >= hl[i + 1] for i in range(7)), hl)
    sc = page.evaluate('() => CT.Tune.Audio.SCALE')
    ok('8 音 = C 大調 C5..C6，兩兩不同、由低到高', sc == [72, 74, 76, 77, 79, 81, 83, 84], sc)
    ch = page.evaluate("""() => { const A = CT.Tune.Audio, o = {};
        for (const k in A.SFX) o[k] = Object.keys(A.SFX[k].data).join('+');
        const beat = A.SONGS.tune_beat, used = {}; beat.patterns.forEach(p => Object.keys(p).forEach(t => { if (p[t].some(r => r)) used[t] = 1; }));
        return { sfx: o, beat: Object.keys(used).sort() }; }""")
    ok('聲道分工：琴鍵音 tune_k0..7 只走 p1、系統音效走 p2（/ noi），節拍器 BGM 只用 tri + noi',
       all(ch['sfx']['tune_k%d' % i] == 'p1' for i in range(8)) and all('p1' not in v for k, v in ch['sfx'].items() if not k.startswith('tune_k')) and ch['beat'] == ['noi', 'tri'], ch)

    # 原創旋律產生器
    mel = page.evaluate("""() => { const out = { bad: 0, ends: 0, steps: 0, total: 0, same: true };
        for (let s = 1; s <= 400; s++) { const L = CT.Tune.LEVELS[s % 8]; const m = CT.Tune.genMelody(L.n, L.hi, L.rh, s * 7919);
          if (m.length !== L.n || m.some(x => x.k < 0 || x.k > L.hi)) out.bad++;
          if ([0, 4, 7].indexOf(m[m.length - 1].k) >= 0) out.ends++;
          for (let i = 1; i < m.length; i++) { out.total++; if (Math.abs(m[i].k - m[i - 1].k) <= 2) out.steps++; }
          if (L.rh && m.reduce((a, b) => a + b.dur, 0) > 24) out.bad++; }
        const a = JSON.stringify(CT.Tune.genMelody(6, 7, true, 1234)), b = JSON.stringify(CT.Tune.genMelody(6, 7, true, 1234));
        out.same = a === b; return out; }""")
    ok('旋律產生器：400 句都在音域內、節奏型總長 ≤ 24 單位、全部收在 DO/SO/高 DO', mel['bad'] == 0 and mel['ends'] == 400, mel)
    ok('旋律產生器：級進（≤ 2 級）為主（> 60%）、同 seed 可重現', mel['steps'] / mel['total'] > 0.6 and mel['same'], (mel['steps'], mel['total']))

    # ---------------- 標題 ----------------
    tt = page.evaluate("""() => { const p = __nes.nes().ppu, A = CT.Tune.Art.make(); const rows = [];
        for (let r = 0; r < 30; r++) { let s = ''; for (let c = 0; c < 32; c++) { const t = p.getTile(0, c, r); let ch = ' ';
          if (t) for (const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+:/$=-()') if (A.ch(k) === t) { ch = k; break; } s += ch; } rows.push(s); }
        return rows; }""")
    txt = '\n'.join(tt)
    ok('§6-5 / §6-6 標題寫著 HOLD START+SELECT: MENU 與 C/★ = CHEAT', 'HOLD START+SELECT: MENU' in txt and 'C/$ = CHEAT' in txt)
    ok('標題有鍵盤對照圖：8 個唱名 + KEY / HOLD 兩列', all(w in txt for w in ['DO', 'RE', 'MI', 'FA', 'SO', 'LA', 'TI', 'NOTE', 'KEY', 'HOLD']))
    kr = [i for i, r in enumerate(tt) if r.startswith(' KEY')]
    hr = [i for i, r in enumerate(tt) if r.startswith(' HOLD')]
    ok('P3-3 按鍵列拆成兩列：KEY 列 8 個方向、下一列 HOLD 只在高音組 4 根底下標 B（不再黏成 ←B↓B…）',
       kr and hr and hr[0] == kr[0] + 1 and tt[hr[0]].count('B') == 4 and 'B' not in tt[kr[0]][5:] and 'B=HOLD' not in txt, (tt[kr[0]] if kr else None, tt[hr[0]] if hr else None))
    ok('P3-2 標題第 0、1 列全空（STAR MELODY 大字從第 2 列起）', not tt[0].strip() and not tt[1].strip(), tt[:3])
    hint_r = [i for i, r in enumerate(tt) if 'HINT' in r]
    push_r = [i for i, r in enumerate(tt) if 'PUSH START' in r]
    ok('P3-3 HINT ON/OFF 與 PUSH START 不同列；段落（模式 / 說明 / HINT / 操作 / 鍵盤）之間都有空列',
       hint_r and hint_r[0] not in push_r and not tt[hint_r[0] - 1].strip() and not tt[hint_r[0] + 1].strip() and not tt[8].strip(), (hint_r, push_r))
    page.evaluate('() => CT.cheat()')
    ok('§6-1 標題按密技無效', S(page)['mode'] == 'title' and S(page)['cheats'] == 0)
    tap(page, RIGHT)
    ok('標題 ←→ 切換 HINT ON / OFF', S(page)['hint'] is False)
    tap(page, LEFT)

    # ---------------- READY + 聽 ----------------
    start(page, 0, 31)
    c = page.evaluate('() => CT.Tune.dev.consts')
    key(page, 0)
    ok('開局 READY 倒數（%d 幀），期間按鍵無效' % c['READY_F'], S(page)['phase'] == 'ready' and S(page)['entered'] == 0)
    until(page, 'listen')
    page.evaluate('() => { let i = 0; while (CT.Tune.dev.sounding() < 0 && i < 300) { __nes.step(1); i++; } __nes.step(2); }')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    si = page.evaluate('() => CT.Tune.dev.sounding()')
    pos = page.evaluate('() => __nes.nes().music.state()')
    ok('同步：正在響的音由 driver row 推回（row %d 落在第 %d 個音的區間）' % (pos['row'], si), si == 0 and cur['events'][0]['row'] <= pos['row'] < cur['events'][0]['row'] + cur['events'][0]['dur'])
    ok('視覺提示：響的那個音，畫面上那根星鐘管亮（屬性表 = 亮調色盤）', page.evaluate('() => CT.Tune.dev.seeKey()') == cur['notes'][0]['k'], (page.evaluate('() => CT.Tune.dev.seeKey()'), cur['notes'][0]))
    ok('聲音：APU 方波 1 的實際音高 = 該鍵音高', page.evaluate('() => CT.Tune.dev.hear()') == cur['notes'][0]['midi'])
    until(page, 'input')
    ok('聽完自動進入輸入，換成節拍器 BGM（tune_beat）', S(page)['music'] == 'tune_beat')

    # 輸入：對 → 過；錯 → MISS
    for nt in cur['notes']:
        key(page, nt['k'], 6)
    ms = page.evaluate('() => __nes.nes().music.state()')
    page.evaluate('() => __nes.step(20)')
    ok('照音彈對 → 這題過（GOOD）、Q 前進', S(page)['phase'] == 'good' and S(page)['q'] == 1, (S(page)['phase'], S(page)['msg']))
    until(page, 'input')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    key(page, cur['notes'][0]['k'], 0)
    ms = page.evaluate('() => __nes.nes().music.state()')
    ok('鍵音與 BGM 共存：p1 由 tune_k* 佔用、節拍器 BGM 仍在播（tri / noi 沒被搶）', (ms['channels'][0]['owner'] or '').startswith('tune_k') and ms['playing'] and not ms['channels'][2]['owned'] and not ms['channels'][3]['owned'], ms['channels'][0]['owner'])
    page.evaluate('() => __nes.step(8)')
    wrong = (cur['notes'][1]['k'] + 1) % 3
    key(page, wrong, 2)
    st = S(page)
    ok('彈錯音 → MISS、命 −1', st['phase'] == 'miss' and st['lives'] == 2, (st['phase'], st['lives'], st['msg']))
    until(page, 'prep', 400)
    ok('MISS 後同一題重聽（旋律不變）', page.evaluate('() => CT.Tune.dev.cur().notes') == cur['notes'])
    until(page, 'input')
    n = page.evaluate('() => { let i = 0; while (GAME.state().s.phase === "input" && i < 700) { __nes.step(1); i++; } return i; }')
    ok('輸入 %d 幀（8 秒）沒彈 → TIME UP' % c['INPUT_TIMEOUT'], S(page)['phase'] == 'miss' and abs(n - c['INPUT_TIMEOUT']) <= 2, n)
    until(page, 'input', 800)
    tap(page, SELECT)
    st = S(page)
    ok('SELECT = 再聽一次（扣分不扣命，回到聽）', st['phase'] in ('prep', 'listen') and st['againUsed'] and st['lives'] == 1, (st['phase'], st['lives']))
    until(page, 'input')
    tap(page, SELECT)
    ok('同一題第二次再聽無效', S(page)['phase'] == 'input' and S(page)['agains'] == 1)

    # 暫停
    tap(page, START)
    ok('§6-2 START 暫停：paused + BGM 暫停', S(page)['paused'] and page.evaluate('() => CT.Tune.Audio.isPaused()'))
    e0 = S(page)['entered']
    key(page, 0)
    ok('暫停中彈鍵無效', S(page)['entered'] == e0)
    tap(page, START)
    ok('解除暫停：BGM 從暫停處接續', not S(page)['paused'] and not page.evaluate('() => CT.Tune.Audio.isPaused()'))

    # 密技
    page.evaluate('() => CT.cheat()')
    ok('§6-1 遊玩中密技 = 命 +1，goal 失效', S(page)['lives'] == 2 and S(page)['cheats'] == 1 and not page.evaluate('() => GAME.state().goal'))
    page.evaluate('() => { for (let k = 0; k < 5 && GAME.state().s.phase !== "over"; k++) { let i = 0; while (GAME.state().s.phase !== "input" && i < 1500) { __nes.step(1); i++; } const c = CT.Tune.dev.cur(); NES.Input.inject(c.notes[0].k === 0 ? 32 : 64, 1); __nes.step(2); let j = 0; while (GAME.state().s.phase === "miss" && j < 300) { __nes.step(1); j++; } } }')
    st = S(page)
    ok('命用完 → GAME OVER + 結束曲', st['phase'] == 'over' and st['music'] == 'tune_over', (st['phase'], st['lives']))
    lv0, q0 = st['lv'], st['q']
    page.evaluate('() => CT.cheat()')
    st = S(page)
    ok('§6-1 GAME OVER 按密技 = 原地續關（同級同題、命補 3）', st['phase'] == 'prep' and st['lv'] == lv0 and st['q'] == q0 and st['lives'] == 3 and st['continues'] == 1, (st['phase'], st['lv'], st['lives']))

    # 節奏判定（幀）
    jr = page.evaluate("""() => { const J = CT.Tune.judgeRhythm, n = [{dur:2},{dur:1},{dur:1},{dur:3},{dur:4}], U = 12;
        const exact = [0, 24, 36, 48, 84];
        const slow = exact.map(t => Math.round(t * 1.15));
        const jit = [0, 27, 37, 46, 87];
        const off = [0, 24, 46, 48, 84];
        const tooSlow = exact.map(t => Math.round(t * 1.6));
        return { exact: J(exact, n, U), slow: J(slow, n, U), jit: J(jit, n, U), off: J(off, n, U), tooSlow: J(tooSlow, n, U) }; }""")
    ok('節奏：完全對拍 = PERFECT（誤差 0 幀）', jr['exact']['ok'] and jr['exact']['perfect'], jr['exact'])
    ok('節奏：整體慢 15% 但比例對 = 過（先換算成玩家自己的速度）', jr['slow']['ok'], jr['slow'])
    ok('節奏：每個音距 ±3 幀以內 = 過且 PERFECT（≤ %d 幀）' % c['RH_PERFECT'], jr['jit']['ok'] and jr['jit']['perfect'], jr['jit'])
    ok('節奏：兩個 12 幀的音距各差 10 幀（超過 max(%d 幀, %d%%)）= RHYTHM OFF' % (c['RH_MIN'], int(round(c['RH_PCT'] * 100))), not jr['off']['ok'], jr['off'])
    j1 = page.evaluate("""() => { const J = CT.Tune.judgeRhythm, n = [{dur:2},{dur:1},{dur:1},{dur:3},{dur:4}], U = 12;
        return { one: J([0, 24, 45, 57, 93], n, U), wild: J([0, 24, 60, 72, 108], n, U) }; }""")
    ok('P3-5 節奏：只有 1 個音距超出（12 幀的音距彈成 21 幀，換算速度後誤差 +7.7 > 6、≤ 2 倍容許）= 仍過、但不算 PERFECT', j1['one']['ok'] and not j1['one']['perfect'] and j1['one']['over'] == 1, j1['one'])
    ok('P3-5 節奏：1 個音距離譜（12 幀彈成 36 幀，誤差 +21 > 2 倍容許）= 仍 RHYTHM OFF', not j1['wild']['ok'], j1['wild'])
    ok('P3-5 容許比例 35%%、容許 %d 個音距超出（≤ %d 倍）' % (c['RH_SLACK'], c['RH_SLACK_MUL']), abs(c['RH_PCT'] - 0.35) < 1e-9 and c['RH_SLACK'] == 1)
    ok('節奏：整體慢 60%（超出速度容許 0.8~1.25）= 不過', not jr['tooSlow']['ok'], jr['tooSlow'])

    # HIGH-LOW
    start(page, 1, 41)
    until(page, 'answer')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    ans = {'U': UP, 'D': DOWN, 'R': RIGHT}[cur['ans']]
    tap(page, ans, 2)
    ok('HIGH-LOW：答對（第 2 音%s）→ 過' % cur['ans'], S(page)['phase'] == 'good', (cur['m1'], cur['m2'], S(page)['msg']))
    until(page, 'answer')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    tap(page, RIGHT, 2)
    ok('HIGH-LOW 第 1 級沒有「一樣」選項：按 → 不算作答', S(page)['phase'] == 'answer' and not cur['m1'] == cur['m2'])
    tap(page, DOWN if cur['ans'] == 'U' else UP, 2)
    ok('HIGH-LOW：答錯 → MISS 並揭曉', S(page)['phase'] == 'miss' and S(page)['lives'] == 2)

    # ODD NOTE
    start(page, 2, 43)
    until(page, 'pick')
    cur = page.evaluate('() => CT.Tune.dev.cur()')
    diff = [i for i in range(len(cur['notes'])) if cur['notes'][i]['k'] != cur['notesB'][i]['k']]
    ok('ODD NOTE：第二段只有 1 個音不同、節奏相同', diff == [cur['odd']] and [x['dur'] for x in cur['notes']] == [x['dur'] for x in cur['notesB']], diff)
    for _ in range(cur['odd']):
        tap(page, RIGHT, 1)
    tap(page, A, 2)
    ok('ODD NOTE：←→ 移到被改的音按 A → 過', S(page)['phase'] == 'good' and S(page)['cursor'] == cur['odd'], S(page)['msg'])

    # P3-6 HINT OFF 的 SOUND CHECK
    page.evaluate('() => CT.Tune.dev.soundOk(false)')
    start(page, 0, 51, False)
    st = S(page)
    k0 = st['keyCount']
    page.evaluate('() => __nes.step(100)')
    ck = '\n'.join(rows_text(page))
    ok('P3-6 HINT OFF 開局 → 先進 SOUND CHECK，寫 HEAR THEM? / A = YES / B = NO / SILENT SWITCH', st['mode'] == 'check' and 'SOUND CHECK' in ck and 'SILENT SWITCH' in ck and 'A = YES' in ck, st['mode'])
    ok('P3-6 SOUND CHECK 輪播鍵音（100 幀 ≥ 4 個）', S(page)['keyCount'] - k0 >= 4, S(page)['keyCount'] - k0)
    tap(page, B, 4)
    st = S(page)
    ok('P3-6 按 B → 回標題並提示 CHECK SILENT / SWITCH AND VOLUME', st['mode'] == 'title' and st['titleMsgT'] > 0 and any('CHECK SILENT' in r or 'SWITCH AND VOLUME' in r for r in rows_text(page)), st['mode'])
    start(page, 0, 51, False)
    tap(page, A, 2)
    ok('P3-6 按 A → 開始（HINT OFF）；HINT ON 不需要檢查', S(page)['mode'] == 'play' and not S(page)['hint'], S(page)['mode'])

    # HINT OFF：不亮燈但有聲音
    start(page, 0, 51, False)
    until(page, 'listen')
    page.evaluate('() => { let i = 0; while (CT.Tune.dev.sounding() < 0 && i < 300) { __nes.step(1); i++; } __nes.step(2); }')
    ok('HINT OFF：播放中星鐘管不亮、但 APU 正在響該音', page.evaluate('() => CT.Tune.dev.seeKey()') == -1 and page.evaluate('() => CT.Tune.dev.hear()') == page.evaluate('() => CT.Tune.dev.cur().notes[0].midi'))

    # 8 鍵：B + 方向
    start(page, 0, 61)
    page.evaluate('() => CT.Tune.dev.setLv(4)')
    until(page, 'input', 3000)
    key(page, 7, 2)
    ok('按住 B + → = 高 DO（第 8 鍵）', S(page)['lastKey'] == 7)
    until(page, 'input', 3000)
    key(page, 0, 6)
    ok('只按 ← = DO（第 1 鍵；暫緩 4 幀等 B 之後才判低音組）', S(page)['lastKey'] == 0)

    # ---------------- fix-r8 P2-6：方向先按、B 晚到 ----------------
    def lead_case(lead, grace=4):
        start(page, 0, 61)
        page.evaluate('() => CT.Tune.dev.setLv(4)')
        page.evaluate('(n) => CT.Tune.dev.grace(n)', grace)
        until(page, 'input', 3000)
        f0 = page.evaluate('() => GAME.state().s.frames')
        page.evaluate('([d, L]) => { for (let i = 0; i < L; i++) { NES.Input.inject(d, 1); __nes.step(1); } for (let i = 0; i < 6; i++) { NES.Input.inject(2 | (i < 2 ? d : 0), 1); __nes.step(1); } __nes.step(4); }', [RIGHT, lead])
        st = S(page)
        tm = page.evaluate('() => CT.Tune.dev.inpTimes()')
        page.evaluate('() => CT.Tune.dev.grace(4)')
        return st, tm, f0
    for lead in (1, 2, 4):
        st, tm, f0 = lead_case(lead)
        ok('P2-6 方向（→）先 %d 幀、B 才按 → 仍判高 DO（第 8 鍵）' % lead, st['lastKey'] == 7, (st['lastKey'], st['phase']))
    ok('P2-6 節奏計時記「方向按下那一幀」（不受暫緩影響）', tm and tm[0] == f0 + 1, (tm, f0))
    st, tm, f0 = lead_case(5)
    ok('P2-6 方向先 5 幀才按 B → 超過容錯，判 FA（第 4 鍵）', st['lastKey'] == 3, st['lastKey'])
    st, tm, f0 = lead_case(2, grace=0)
    ok('P2-6 對照組（grace 0 = 舊版）：方向先 2 幀 → 判成 FA（qa-r8 重現）', st['lastKey'] == 3, st['lastKey'])

    # ---------------- fix-r8 P2-7：斜方向 ----------------
    start(page, 0, 61)
    until(page, 'input', 3000)
    e0 = S(page)['entered']
    tap(page, UP | RIGHT, 6)
    ok('P2-7 同一幀兩個方向一起按下（觸控斜方向）→ 不判定（不算彈錯、不出鍵音）', S(page)['entered'] == e0 and S(page)['phase'] == 'input', (S(page)['entered'], S(page)['phase']))
    start(page, 1, 41)
    until(page, 'answer')
    tap(page, UP | RIGHT, 4)
    ok('P2-7 HIGH-LOW 作答時斜方向也不判定', S(page)['phase'] == 'answer')
    ways = page.evaluate("""() => { const log = []; const T = NES.Touch || (NES.Touch = {}); const old = T.setWays;
        T.setWays = (n) => log.push(n);
        CT.Tune.dev.start(0, 9); __nes.step(1); const inPlay = log.slice();
        CT.get('tune').exit(__nes.nes()); const afterExit = log.slice();
        T.setWays = undefined; let err = null; try { CT.Tune.dev.start(0, 9); __nes.step(2); CT.get('tune').exit(__nes.nes()); } catch (e) { err = String(e); }
        T.setWays = old; return { inPlay, afterExit, err }; }""")
    ok('P2-7 進入遊玩呼叫 NES.Touch.setWays(4)、exit 設回 8；API 不存在時不報錯', ways['inPlay'][-1:] == [4] and ways['afterExit'][-1:] == [8] and ways['err'] is None, ways)
    fresh(page)

    # P3-2 遊玩 HUD 不貼頂
    start(page, 0, 61)
    page.evaluate('() => __nes.step(30)')
    pr = rows_text(page)
    ok('P3-2 遊玩畫面第 0、1 列全空（HUD 從第 2 列起：模式 / 命、第 3 列 LV / 分數）', not pr[0].strip() and not pr[1].strip() and 'REPLAY' in pr[2] and 'LV1' in pr[3], pr[:4])

    # §6-3 exit
    start(page, 0, 71)
    page.evaluate('() => { CT.Tune.dev.setLv(3); }')
    page.evaluate('() => { const g = GAME.state().s; }')
    page.evaluate('() => { CT.get("tune").exit(__nes.nes()); }')
    ok('§6-3 exit() 存檔（未過級 = 0）', page.evaluate('() => CT.load("tune", "best", 0)') == 0)

    # ---------------- 機器人（只讀畫面 / 聲音） ----------------
    for lag, lim in ((14, 9000), (0, 9000), (24, 9000)):
        fresh(page, '&bot=1&seed=21&lag=%d' % lag)
        page.evaluate('() => CT.Tune.dev.guard(true)')
        r = page.evaluate(RUN, {'n': lim, 'until': 'goal'})
        r['reads'] = page.evaluate('() => CT.Tune.dev.guardReads()')
        ok('機器人（延遲 %d 幀）：%d 幀內 REPLAY 第 6 級過關 goal（%d 幀）' % (lag, lim, r['f']), r['goal'] and r['s']['cheats'] == 0 and r['s']['misses'] == 0 and r['s']['agains'] == 0, (r['f'], r['s']['lvDone'], r['s']['misses']))
        if lag == 14:
            ok('防偷看：隱藏答案包成 Proxy，bot() 期間讀取 0 次', r['reads'] == 0, r['reads'])
            ok('機器人全程每線 ≤ 8 精靈、overFrames 0、單幀 ≤ 160 byte', r['ml'] <= 8 and r['over'] == 0 and r['peak'] <= 160, (r['ml'], r['over'], r['peak']))
            page.evaluate('() => CT.get("tune").exit(__nes.nes())')
            ok('§6-3 exit() 存最高級 + bestText（  LV06）', page.evaluate('() => CT.get("tune").bestText()') == '  LV06')
    for q, name in (('mode=0&hint=0', 'REPLAY HINT OFF（純聽音）'), ('mode=1', 'HIGH-LOW（聽音高）'), ('mode=2', 'ODD NOTE（聽兩段比對）'), ('mode=1&hint=0', 'HIGH-LOW HINT OFF')):
        fresh(page, '&bot=1&seed=33&' + q)
        r = page.evaluate(RUN, {'n': 12000, 'until': 'lv', 'lv': 4})
        ok('機器人 %s：0 失誤過 4 級' % name, r['s']['lvDone'] >= 4 and r['s']['misses'] == 0 and r['ml'] <= 8 and r['over'] == 0, (r['f'], r['s']['lvDone'], r['s']['misses']))

    if QUICK:
        print('  SKIP（NES_QUICK）P3-5 蒙地卡羅 + 真人濾鏡實機回測')
    else:
        # ---------------- 真人模型：P3-5 節奏規則蒙地卡羅 + 實機回測 ----------------
        mc = page.evaluate(MC, {'N': 3000, 'seed': 12345, 'jit': 3, 'rel': 0, 'rules': [[0.30, 0], [0.35, 1]]})
        mc2 = page.evaluate(MC, {'N': 3000, 'seed': 777, 'jit': 2, 'rel': 0.10, 'rules': [[0.30, 0], [0.35, 1]]})
        print('  [量測] 每題過關率（第 5/6/7/8 級）按下抖動 N(0,3) 幀：舊 %s → 新 %s；抖動 2 幀 + 音距 10%%：舊 %s → 新 %s' % (mc['0.3/0'], mc['0.35/1'], mc2['0.3/0'], mc2['0.35/1']))
        ok('P3-5 蒙地卡羅（抖動 N(0,3) 幀）：第 5、6 級（goal）每題過關率新版 ≥ 90%%（舊版 %s）' % mc['0.3/0'][:2], min(mc['0.35/1'][:2]) >= 90 and all(a_ >= b_ for a_, b_ in zip(mc['0.35/1'], mc['0.3/0'])), mc)
        # 實機：機器人延遲 20 + 每下 N(3,3) 抖動 + 兩手不同步（50% 的 B 晚方向 1~3 幀，P2-6 情境）；舊版 = 舊節奏規則 + grace 0
        hr_ = {}
        for name, rule, gr in (('old', [0.30, 0], 0), ('new', [0.35, 1], 4)):
            res = [hum_run(page, 'lag=20', sd, 16000, refr=0, lapse=0, rule=rule, grace=gr, late=(0.5, 3)) for sd in ((21, 22, 23) if name == 'old' else (21, 22, 23, 24, 25))]
            hr_[name] = res
            print('  [量測] 實機真人濾鏡（延遲 20 + N(3,3) + 50%% 的 B 晚 1~3 幀）%s：goal %d/%d、失誤 %s、過關級 %s' % (name, sum(1 for x in res if x['goal']), len(res), [x['s']['misses'] for x in res], [x['s']['lvDone'] for x in res]))
        ok('真人濾鏡實機：新版 REPLAY goal ≥ 4/5 種子、失誤總數 < 舊版、每線 ≤ 8、overFrames 0',
           sum(1 for x in hr_['new'] if x['goal']) >= 4 and sum(x['s']['misses'] for x in hr_['new']) < sum(x['s']['misses'] for x in hr_['old']) and all(x['ml'] <= 8 and x['over'] == 0 for x in hr_['new']),
           [(x['goal'], x['s']['misses'], x['s']['lvDone']) for x in hr_['new']])

    ok('全程沒有頁面錯誤', not errs, errs[:3])
    browser.close()
    pw.stop()
    npass = sum(1 for r in results if r[0])
    print('test_tune: %d / %d PASS' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
