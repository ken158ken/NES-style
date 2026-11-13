# -*- coding: utf-8 -*-
"""《星塵 8 合 1》（cart1.html）合輯機器人：跑某一款（或全部）的 `bot()` 直到 `goal()` 或幀數上限。

用法（PY=../卡比之星/.venv/bin/python）：
  $PY tools/playthrough_cart.py --game maze              # 單款
  $PY tools/playthrough_cart.py --game blocks --max 60000
  $PY tools/playthrough_cart.py --all                    # 全部已註冊的款（未註冊的槽列為 SKIP）
  $PY tools/playthrough_cart.py --all --json             # 只印 JSON 行（給其他工具吃）
  $PY tools/playthrough_cart.py --all --hint             # R5 fix：全程強制畫回選單提示（CT.backProgress 固定 0.5）
                                                         #   ⇒ 每線峰值含 backTile 的 OAM 62/63（qa-r5 的壓力法收進工具）

作法：開 `cart1.html?debug=1&bot=1&game=<id>&scale=1&mute=1`（registry 的 ?bot=1 ⇒ 每幀把
  `g.bot(nes)` 的回傳值 inject 成下一幀的按鍵；**不開密技**），在頁面內逐幀 `__nes.step(1)`，
  每幀讀 `__nes.stats()`：
    - `maxSpritesLine`（PPU 這幀「同一掃描線上的精靈數」峰值，含被第 9 個以後擋掉的 ⇒ 不靠輪替）
    - `budget.overFrames`（VBlank 160 byte 超支幀數，累計）、`budget.peak`（單幀尖峰）
  與 `GAME.state().goal`；一次 evaluate 跑一段（預設 600 幀）避免每幀 round-trip。
  頁面錯誤（pageerror / console.error / 引擎 warn「xxx() 失敗」）一併記錄。

輸出：每款一行 JSON（`{"game","ok","goal","frames","maxLine","overFrames","budgetPeak","errors","sec"}`）
  + 人看的表。驗收（brief §3）：goal 達成 且 maxLine ≤ 8 且 overFrames == 0 且無頁面錯誤 ⇒ ok。

結束碼：0 = 指定的款全部 ok（--all 且 0 款已註冊也算 0）/ 1 = 有款沒過 / 2 = 環境錯誤 / 3 = 指定的 id 未註冊
"""
import argparse
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'cart1.html').resolve().as_uri()
DEFAULT_MAX = 36000          # 10 分鐘遊戲時間
CHUNK = 600

RUN_JS = r"""
(opt) => {
  const st = window.__cartRun || (window.__cartRun = { frames: 0, maxLine: 0, maxLineAt: -1, goal: false, peak: 0, over: 0, overAt: -1 });
  const n = opt.n;
  for (let i = 0; i < n; i++) {
    __nes.step(1);
    st.frames++;
    const s = __nes.stats();
    const ml = s.maxSpritesLine | 0;
    if (ml > st.maxLine) { st.maxLine = ml; st.maxLineAt = st.frames; }
    const b = s.budget || {};
    if ((b.peak | 0) > st.peak) st.peak = b.peak | 0;
    if ((b.overFrames | 0) > st.over) { if (st.over === 0) st.overAt = st.frames; st.over = b.overFrames | 0; }
    const g = window.GAME.state();
    if (g.goal) { st.goal = true; break; }
    if (g.game !== opt.id) { st.left = g.game; break; }      // 被踢回選單 / 換款 = 異常
  }
  return st;
}
"""


def page_url(gid, extra=''):
    q = 'debug=1&bot=1&scale=1&mute=1&game=' + gid
    if extra:
        q += '&' + extra.lstrip('&?')
    return PAGE + '?' + q


def attach_errors(page):
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:160]))

    def on_console(m):
        t = m.text
        # 缺檔（平行開發期間別款的 script 還沒寫好）只記警告，不算本款失敗
        if 'Failed to load resource' in t:
            WARN.append(t[:120])
            return
        if m.type == 'error' or ('失敗' in t and m.type in ('warning', 'warn')):
            errs.append(m.type + ': ' + t[:160])
    page.on('console', on_console)
    return errs


WARN = []


def registered(page):
    """回傳目前 cart1.html 已註冊的 id 清單（開一次頁面）。"""
    page.goto(PAGE + '?debug=1&scale=1&mute=1&boot=0')
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.CT')
    return page.evaluate('() => window.CT.games.map(g => g.id)')


def run_game(page, gid, max_frames=DEFAULT_MAX, extra='', init_script=None, chunk=CHUNK, hint=False):
    """在 page 上跑一款的機器人；回傳結果 dict。init_script 給 test_cart.py 塞假遊戲用。"""
    errs = attach_errors(page)
    if init_script:
        page.add_init_script(init_script)
    t0 = time.time()
    page.goto(page_url(gid, extra))
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.CT')
    info = page.evaluate('() => ({ cur: window.GAME.state().game, games: window.CT.games.map(g => g.id),'
                         ' bot: !!(window.CT.current && window.CT.current.bot), goal: !!(window.CT.current && window.CT.current.goal) })')
    res = {'game': gid, 'ok': False, 'goal': False, 'frames': 0, 'maxLine': 0, 'overFrames': 0,
           'budgetPeak': 0, 'errors': [], 'sec': 0.0}
    if info['cur'] != gid:
        res['errors'] = ['未註冊（已註冊：%s）' % ','.join(info['games'])]
        res['unregistered'] = True
        return res
    if not info['bot'] or not info['goal']:
        res['errors'].append('缺 bot() 或 goal()')
    if hint:      # 回選單提示常駐（只換 shell 讀的進度函式；registry 的 60 幀計數不受影響 ⇒ 不會真的回選單）
        res['hint'] = page.evaluate('() => { CT.backProgress = function () { return 0.5; };'
                                    ' __nes.step(1); return (CT.Shell && CT.Shell.dev.overlayMode()) || null; }')
    st = {}
    while True:
        n = min(chunk, max_frames - st.get('frames', 0))
        if n <= 0:
            break
        st = page.evaluate(RUN_JS, {'n': n, 'id': gid})
        if st.get('goal') or st.get('left'):
            break
    res.update({
        'goal': bool(st.get('goal')), 'frames': st.get('frames', 0), 'maxLine': st.get('maxLine', 0),
        'maxLineAt': st.get('maxLineAt', -1), 'overFrames': st.get('over', 0), 'overAt': st.get('overAt', -1),
        'budgetPeak': st.get('peak', 0), 'sec': round(time.time() - t0, 1)
    })
    if st.get('left') is not None:
        res['errors'].append('中途離開遊戲（目前 = %s）' % st.get('left'))
    res['errors'] += errs[:8]
    if WARN:
        res['warnings'] = ['%d 個資源載入失敗（缺檔）' % len(WARN)]
        del WARN[:]
    res['ok'] = res['goal'] and res['maxLine'] <= 8 and res['overFrames'] == 0 and not res['errors']
    return res


def table(rows):
    print('%-9s %-5s %-5s %8s %7s %6s %6s %6s  %s' % ('game', 'ok', 'goal', 'frames', 'maxLine', 'over', 'peak', 'sec', '備註'))
    print('-' * 78)
    for r in rows:
        note = '; '.join(r.get('errors', []))[:60]
        if r.get('unregistered'):
            print('%-9s %-5s %-5s %8s %7s %6s %6s %6s  %s' % (r['game'], 'SKIP', '-', '-', '-', '-', '-', '-', '未註冊（準備中）'))
            continue
        print('%-9s %-5s %-5s %8d %7d %6d %6d %6.1f  %s' % (
            r['game'], 'OK' if r['ok'] else 'FAIL', 'Y' if r['goal'] else 'N', r['frames'], r['maxLine'],
            r['overFrames'], r['budgetPeak'], r['sec'], note))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--game', default='', help='遊戲 id（maze / blocks / brick / pinball / snake / racing / flyer / tower）')
    ap.add_argument('--all', action='store_true', help='跑全部已註冊的款')
    ap.add_argument('--max', type=int, default=DEFAULT_MAX, help='幀數上限（預設 %d）' % DEFAULT_MAX)
    ap.add_argument('--query', default='', help='額外網址參數（例如 "seed=3"）')
    ap.add_argument('--json', action='store_true', help='只印 JSON 行')
    ap.add_argument('--hint', action='store_true', help='全程強制畫回選單提示（量 backTile 精靈對每線峰值的影響）')
    a = ap.parse_args()
    if not a.game and not a.all:
        ap.error('請給 --game <id> 或 --all')
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # pragma: no cover
        print('需要 playwright：', e)
        return 2
    rows = []
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            ctx = br.new_context()
            ids = [a.game] if a.game else []
            if a.all:
                pg = ctx.new_page()
                ids = registered(pg)
                pg.close()
                # 未註冊的預設槽也列出來（SKIP）
                defaults = ['maze', 'blocks', 'brick', 'pinball', 'snake', 'racing', 'flyer', 'tower']
                for d in defaults:
                    if d not in ids:
                        rows.append({'game': d, 'ok': False, 'unregistered': True, 'errors': []})
            for gid in ids:
                pg = ctx.new_page()
                r = run_game(pg, gid, a.max, a.query, hint=a.hint)
                pg.close()
                rows.append(r)
                print(json.dumps(r, ensure_ascii=False), flush=True)
            br.close()
    except Exception as e:
        print('環境錯誤：', e)
        return 2
    if a.all:
        for r in rows:
            if r.get('unregistered'):
                print(json.dumps(r, ensure_ascii=False))
    if not a.json:
        order = ['maze', 'blocks', 'brick', 'pinball', 'snake', 'racing', 'flyer', 'tower']
        rows.sort(key=lambda r: order.index(r['game']) if r['game'] in order else 99)
        print()
        table(rows)
    if a.game and rows and rows[0].get('unregistered'):
        return 3
    bad = [r for r in rows if not r.get('unregistered') and not r['ok']]
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
