# -*- coding: utf-8 -*-
"""
觸控虛擬按鍵驗證（Round 11 / agent: touch）—— src/touch.js、src/input.js。

用 Playwright 手機裝置模擬 + CDP Input.dispatchTouchEvent（多點）實際「按」DOM 覆蓋層，
再從遊戲狀態（__kb.state()）與 KB.input / KB.TOUCH 檢查結果。

涵蓋：
  A. input.js 契約 2：setTouch / touchActive / hint（虛擬鍵名 ↔ 鍵盤名切換）、virtualOnly 遮罩
  B. D-pad：按右 30 幀卡比 x 增加；死區內不觸發；單指滑動由右切到上（8 方向）
  C. A 鍵跳躍（vy < 0）；右 + A 同時（多點）
  D. 自動顯示：鍵盤輸入後淡出、再觸控又出現；mode off / on 強制
  E. layout：side left 時攻擊鍵在左半邊；size / opacity 生效並存進 KB.save.settings.touch
  F. 版面：三裝置直 / 橫向，按鍵中心不落在畫面（KB.layout）矩形內（空間不足只印 WARN）

用法：python tools/test_touch.py [-v]     非零 exit = 有 FAIL
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

results = []
warns = []
VERBOSE = False


def check(name, cond, info=''):
    results.append((name, bool(cond)))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


def warn(name, info=''):
    warns.append(name)
    print('WARN ' + name + (('  ' + str(info)) if info else ''))


class Touch:
    """多點觸控（CDP）：維持目前按住的點，每次變動把全部點一起送出（同 tools/mobile_shot.py）"""

    def __init__(self, cdp):
        self.cdp = cdp
        self.pts = {}

    def _send(self, typ, changed):
        pts = [{'x': x, 'y': y, 'id': i} for i, (x, y) in self.pts.items()]
        if typ == 'touchEnd':
            pts = [p for p in pts if p['id'] != changed]
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})

    def down(self, i, x, y):
        self.pts[i] = (x, y); self._send('touchStart', i)

    def move(self, i, x, y):
        if i in self.pts:
            self.pts[i] = (x, y); self._send('touchMove', i)

    def up(self, i):
        if i in self.pts:
            self._send('touchEnd', i); del self.pts[i]

    def clear(self):
        for i in list(self.pts):
            self.up(i)


def open_page(pw, browser, device, landscape):
    name = device + (' landscape' if landscape and (device + ' landscape') in pw.devices else '')
    dev = dict(pw.devices[name])
    if landscape and name == device:
        vp = dev['viewport']; dev['viewport'] = {'width': vp['height'], 'height': vp['width']}
    ctx = browser.new_context(**dev)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(INDEX + '?debug=1&mute=1&norun=1')
    pg.wait_for_function('()=>window.__kb && window.KB && KB.LEVELS && KB.TOUCH && KB.TOUCH.rects')
    cdp = ctx.new_cdp_session(pg)
    return ctx, pg, Touch(cdp), dev, errs


def goto_game(pg, level='w1'):
    pg.evaluate("([s,o])=>__kb.goto(s,o)", ['game', {'level': level, 'room': 0, 'nofade': True}])
    pg.evaluate("()=>__kb.step(12)")


def step(pg, n):
    """前進 n 幀。先等兩個 rAF：Chromium 的 touchmove → pointermove 是 vsync 對齊的，
    CDP 連續送點若不跨幀會被合併掉（實機手指移動不會有這問題，只是測試工具的節奏）。"""
    pg.evaluate("""(n)=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{__kb.step(n);r(1);})))""", n)


def state(pg):
    return json.loads(pg.evaluate("()=>__kb.state()"))


def rects(pg):
    pg.evaluate("()=>KB.TOUCH.relayout()")
    return pg.evaluate("()=>KB.TOUCH.rects()")


def screen_rect(pg):
    return pg.evaluate("""()=>{const L=KB.layout; if(L&&L.w>0) return {x:L.x,y:L.y,w:L.w,h:L.h,src:'KB.layout'};
      const r=KB.canvas.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height,src:'canvas'};}""")


# ---------------------------------------------------------------- 主要輸入測試
def test_input_api(pg):
    print('\n-- A. input.js 契約 2（setTouch / touchActive / hint）--')
    r = pg.evaluate("""()=>{
      const I=KB.input; const out={};
      I.clearTouch(); I.update();
      out.beforeDown = I.down('right');
      I.setTouch('right', true); I.update();
      out.afterDown = I.down('right');
      out.touchDown = I.touchDown('right');
      out.active = I.touchActive();
      out.hintJump = I.hint('jump'); out.hintAttack=I.hint('attack');
      out.hintSelect = I.hint('select'); out.hintStart=I.hint('start'); out.hintLeft=I.hint('left');
      // virtualOnly 遮罩（截圖 / 測試工具用）：觸控也要被遮掉
      I.setVirtual({}, true); I.update(); out.masked = I.down('right');
      I.clearVirtual(); I.update(); out.unmasked = I.down('right');
      I.setTouch('right', false); I.update(); out.afterUp = I.down('right');
      out.bad = I.setTouch('nosuch', true);
      return out; }""")
    check('setTouch 前 right 未按下', r['beforeDown'] is False, r)
    check('setTouch(right,true) → input.down(right)', r['afterDown'] is True, r)
    check('touchDown(right) 回報觸控來源', r['touchDown'] is True, r)
    check('touchActive() 觸控後為 true', r['active'] is True, r)
    check("hint 觸控標籤 A/B/C/START/方向鍵",
          [r['hintJump'], r['hintAttack'], r['hintSelect'], r['hintStart'], r['hintLeft']] ==
          ['A', 'B', 'C', 'START', '方向鍵'], r)
    check('virtualOnly 遮罩觸控', r['masked'] is False, r)
    check('解除遮罩後觸控恢復', r['unmasked'] is True, r)
    check('setTouch(false) 放開', r['afterUp'] is False, r)
    check('setTouch 未知動作回 false', r['bad'] is False, r)

    # 鍵盤輸入後 hint 換回鍵盤名
    pg.keyboard.press('KeyZ')
    r2 = pg.evaluate("()=>({act:KB.input.touchActive(), h:KB.input.hint('jump'), hs:KB.input.hint('start')})")
    check('鍵盤輸入後 touchActive() 轉 false', r2['act'] is False, r2)
    check('鍵盤時 hint(jump) 回鍵盤名 Z', r2['h'] == 'Z', r2)
    check('鍵盤時 hint(start) 回鍵盤名 Enter', r2['hs'] == 'Enter', r2)
    # BINDINGS 就地修改的既有行為沒被破壞（keyconfig / test_saves 依賴）
    r3 = pg.evaluate("""()=>{const b=KB.input.BINDINGS; const ok=KB.input.rebind('jump',['KeyQ']);
      const same=(b===KB.input.BINDINGS); const n=KB.input.keyNames('jump')[0];
      KB.input.resetBindings(); return {ok,same,n,back:KB.input.keyNames('jump')[0]};}""")
    check('rebind 仍就地修改 BINDINGS 物件', r3['ok'] and r3['same'] and r3['n'] == 'Q' and r3['back'] == 'Z', r3)


def test_dpad_and_buttons(pg, t):
    print('\n-- B/C. D-pad 與動作鍵（CDP 觸控）--')
    goto_game(pg)
    R = rects(pg)
    check('覆蓋層有 dpad / jump / attack / select / start',
          all(k in R for k in ('dpad', 'jump', 'attack', 'select', 'start')), sorted(R.keys()))
    dp, jp, at = R['dpad'], R['jump'], R['attack']

    # B1 死區：正中央按下不產生方向
    t.down(0, dp['cx'], dp['cy']); step(pg, 2)
    d0 = pg.evaluate("()=>KB.TOUCH.dirs()")
    check('D-pad 死區：中心不觸發方向', not any(d0.values()), d0)
    t.up(0); step(pg, 2)

    # B2 按右 30 幀 → 卡比 x 增加
    x0 = state(pg)['player']['x']
    t.down(0, dp['cx'] + dp['w'] * 0.36, dp['cy']); step(pg, 2)
    dirR = pg.evaluate("()=>({d:KB.TOUCH.dirs(), i:KB.input.down('right')})")
    check('D-pad 右：input.down(right)', dirR['i'] is True and dirR['d']['right'] is True, dirR)
    step(pg, 30)
    x1 = state(pg)['player']['x']
    check('D-pad 右按 30 幀 → 卡比 x 增加', x1 > x0 + 4, f'{x0} -> {x1}')

    # B3 單指滑動：右 → 上（8 方向切換）
    t.move(0, dp['cx'], dp['cy'] - dp['h'] * 0.36); step(pg, 2)
    sl = pg.evaluate("()=>({up:KB.input.down('up'), right:KB.input.down('right'), d:KB.TOUCH.dirs()})")
    check('滑動由右切到上：down(up) 成立且 right 解除', sl['up'] is True and sl['right'] is False, sl)
    # 斜向：右上同時
    t.move(0, dp['cx'] + dp['w'] * 0.27, dp['cy'] - dp['h'] * 0.27); step(pg, 2)
    di = pg.evaluate("()=>KB.TOUCH.dirs()")
    check('滑到右上 → 8 方向同時 right + up', di['right'] and di['up'] and not di['down'] and not di['left'], di)
    t.up(0); step(pg, 2)
    rel = pg.evaluate("()=>KB.input.down('up')||KB.input.down('right')")
    check('放開 D-pad → 方向全部解除', rel is False)

    # C1 A 鍵跳躍（落地後）
    step(pg, 40)
    st = state(pg)
    t.down(0, jp['cx'], jp['cy']); step(pg, 3)
    vy = state(pg)['player']['vy']
    check('A 鍵按下 → vy < 0（起跳）', vy < 0, f'onGround(before)={st["player"]["onGround"]} vy={vy}')
    t.up(0); step(pg, 60)

    # C2 多點：右 + A 同時
    step(pg, 30)
    x0 = state(pg)['player']['x']
    t.down(0, dp['cx'] + dp['w'] * 0.36, dp['cy'])
    t.down(1, jp['cx'], jp['cy'])
    step(pg, 3)
    both = pg.evaluate("()=>({r:KB.input.down('right'), j:KB.input.down('jump')})")
    check('多點同時：right + jump 都按下', both['r'] is True and both['j'] is True, both)
    step(pg, 12)
    p = state(pg)['player']
    check('右 + A 同時 → x 增加且離地', p['x'] > x0 + 3 and p['onGround'] is False, f"x {x0}->{p['x']} onGround={p['onGround']}")
    t.up(0); t.up(1); step(pg, 40)

    # C3 B 鍵（攻擊 / 吸入）
    t.down(0, at['cx'], at['cy']); step(pg, 3)
    ab = pg.evaluate("()=>KB.input.down('attack')")
    check('B 鍵按下 → input.down(attack)', ab is True)
    t.up(0); step(pg, 10)
    ab2 = pg.evaluate("()=>KB.input.down('attack')")
    check('B 鍵放開 → attack 解除', ab2 is False)

    # C4 START 鍵 → 暫停
    st0 = state(pg)['game']['paused']
    t.down(0, R['start']['cx'], R['start']['cy']); step(pg, 2); t.up(0); step(pg, 3)
    st1 = state(pg)['game']['paused']
    check('START 鍵切換暫停', bool(st1) != bool(st0), f'{st0} -> {st1}')
    t.down(0, R['start']['cx'], R['start']['cy']); step(pg, 2); t.up(0); step(pg, 3)


def test_autoshow(pg, t):
    print('\n-- D. 自動顯示 / 淡出 --')
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'auto'})")
    R = rects(pg)
    t.down(0, R['jump']['cx'], R['jump']['cy']); step(pg, 2); t.up(0); step(pg, 2)
    check('觸控裝置 mode auto → 覆蓋層顯示', pg.evaluate("()=>KB.TOUCH.active()") is True)
    op1 = pg.evaluate("()=>getComputedStyle(KB.TOUCH.el).opacity")
    check('顯示時 root opacity = 1', abs(float(op1) - 1) < 0.01, op1)

    pg.keyboard.press('KeyZ'); step(pg, 2)
    check('鍵盤輸入後覆蓋層淡出（active false）', pg.evaluate("()=>KB.TOUCH.active()") is False)
    off = pg.evaluate("()=>({cls:KB.TOUCH.el.className, pe:getComputedStyle(KB.TOUCH.buttons.jump).pointerEvents})")
    check('淡出時 pointer-events: none', off['pe'] == 'none', off)
    # 淡出時按鍵不該吃到輸入
    t.down(0, R['jump']['cx'], R['jump']['cy']); step(pg, 2)
    j = pg.evaluate("()=>KB.input.touchDown('jump')")
    check('淡出時按鍵不觸發輸入', j is False)
    check('但再次觸控 → 覆蓋層回來', pg.evaluate("()=>KB.TOUCH.active()") is True)
    t.up(0); step(pg, 2)

    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'off'})")
    check('mode off → 隱藏', pg.evaluate("()=>KB.TOUCH.active()") is False)
    x0 = state(pg)['player']['x']
    R2 = pg.evaluate("()=>KB.TOUCH.rects()")
    # qa11 P1 逃生口：觸控裝置上 mode off 後只要再有觸控就自動切回 auto（否則純觸控裝置會鎖死）
    t.down(0, R2['dpad']['cx'] + R2['dpad']['w'] * 0.36, R2['dpad']['cy']); step(pg, 20)
    check('mode off 時再觸控 → 逃生口切回 auto 並顯示',
          pg.evaluate("()=>KB.TOUCH.layout.mode") == 'auto' and pg.evaluate("()=>KB.TOUCH.active()") is True)
    t.up(0); step(pg, 2)
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'on'})")
    check('mode on → 強制顯示', pg.evaluate("()=>KB.TOUCH.active()") is True)
    pg.keyboard.press('KeyZ'); step(pg, 2)
    check('mode on 時鍵盤不會讓它淡出', pg.evaluate("()=>KB.TOUCH.active()") is True)
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'auto'})")


def test_layout_opts(pg, dev):
    print('\n-- E. layout 設定（side / size / opacity / 存檔）--')
    vw = dev['viewport']['width']
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'on', side:'right'})")
    R = rects(pg)
    check('side right：攻擊鍵在右半邊', R['attack']['cx'] > vw / 2, R['attack']['cx'])
    check('side right：D-pad 在左半邊', R['dpad']['cx'] < vw / 2, R['dpad']['cx'])
    pg.evaluate("()=>KB.TOUCH.setLayout({side:'left'})")
    R = rects(pg)
    check('side left：攻擊鍵在左半邊', R['attack']['cx'] < vw / 2, R['attack']['cx'])
    check('side left：跳躍鍵也在左半邊', R['jump']['cx'] < vw / 2, R['jump']['cx'])
    check('side left：D-pad 換到右半邊', R['dpad']['cx'] > vw / 2, R['dpad']['cx'])

    w1 = rects(pg)['jump']['w']
    pg.evaluate("()=>KB.TOUCH.setLayout({size:1.2})")
    w2 = rects(pg)['jump']['w']
    pg.evaluate("()=>KB.TOUCH.setLayout({size:0.8})")
    w3 = rects(pg)['jump']['w']
    check('size 1.2 > 1 > 0.8（按鍵尺寸生效）', w2 >= w1 >= w3 and w2 > w3, f'{w3} / {w1} / {w2}')

    pg.evaluate("()=>KB.TOUCH.setLayout({size:1, opacity:0.75})")
    op = float(pg.evaluate("()=>getComputedStyle(KB.TOUCH.buttons.jump).opacity"))
    check('opacity 0.75 套到按鍵', abs(op - 0.75) < 0.06, op)
    saved = pg.evaluate("""()=>{const s=KB.save&&KB.save.settings&&KB.save.settings.touch;
      let ls=null; try{ls=JSON.parse(localStorage.getItem('kirbystar_save_1')||'{}');}catch(e){}
      return {s, hasSave: !!(KB.save&&KB.save.settings)};}""")
    check('setLayout 寫進 KB.save.settings.touch',
          saved['s'] and saved['s']['side'] == 'left' and abs(saved['s']['opacity'] - 0.75) < 1e-6, saved)
    # 重新載入後仍保留（全域 settings → localStorage kirbystar_global）
    pg.reload()
    pg.wait_for_function('()=>window.__kb && KB.TOUCH && KB.TOUCH.rects')
    pg.wait_for_function('()=>KB.TOUCH.layout.side==="left"', timeout=4000)
    lay = pg.evaluate("()=>KB.TOUCH.layout")
    check('reload 後 layout 由存檔還原', lay['side'] == 'left' and abs(lay['opacity'] - 0.75) < 1e-6, lay)
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'auto', side:'right', size:1, opacity:0.5})")


def test_overlap(pg, tag, dev):
    L = screen_rect(pg)
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'on'})")
    R = rects(pg)
    vw, vh = dev['viewport']['width'], dev['viewport']['height']
    bad = []
    for k, r in R.items():
        inside = (L['x'] < r['cx'] < L['x'] + L['w']) and (L['y'] < r['cy'] < L['y'] + L['h'])
        if inside:
            bad.append(k)
    off = [k for k, r in R.items() if r['cx'] < 0 or r['cy'] < 0 or r['cx'] > vw or r['cy'] > vh]
    check(f'[{tag}] 按鍵中心都在 viewport 內', not off, off)
    if bad:
        warn(f'[{tag}] {len(bad)} 顆按鍵中心壓在畫面上（空間不足）', f'{bad} screen={L}')
    else:
        check(f'[{tag}] 按鍵中心都不在畫面（{L["src"]}）矩形內', True,
              f'screen={ {k: round(v,1) for k,v in L.items() if k!="src"} }')
    ov = pg.evaluate("()=>KB.TOUCH.overlapping")
    if ov:
        warn(f'[{tag}] touch.js 自評為「壓在畫面邊緣」（半透明模式）')
    pg.evaluate("()=>KB.TOUCH.setLayout({mode:'auto'})")
    return R, L


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.v
    all_errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        # --- 主場：iPhone 13 橫向 ---
        ctx, pg, t, dev, errs = open_page(pw, b, 'iPhone 13', True)
        print(f'== iPhone 13 橫向 {dev["viewport"]} dpr {dev.get("device_scale_factor")} ==')
        check('KB.TOUCH.available（觸控裝置）', pg.evaluate("()=>KB.TOUCH.available") is True)
        test_input_api(pg)
        test_dpad_and_buttons(pg, t)
        test_autoshow(pg, t)
        test_layout_opts(pg, dev)
        goto_game(pg)
        print('\n-- F. 版面（畫面外空白處）--')
        test_overlap(pg, 'iPhone13 橫', dev)
        all_errs += [f'[iPhone13 橫] {e}' for e in errs]
        ctx.close()

        # --- 直向 ---
        ctx, pg, t, dev, errs = open_page(pw, b, 'Pixel 5', False)
        print(f'\n== Pixel 5 直向 {dev["viewport"]} ==')
        goto_game(pg)
        test_overlap(pg, 'Pixel5 直', dev)
        R = rects(pg)
        x0 = state(pg)['player']['x']
        t.down(0, R['dpad']['cx'] + R['dpad']['w'] * 0.36, R['dpad']['cy']); step(pg, 30)
        check('[Pixel5 直] D-pad 右 30 幀 → x 增加', state(pg)['player']['x'] > x0 + 4,
              f"{x0} -> {state(pg)['player']['x']}")
        t.up(0); step(pg, 5)
        ph = pg.evaluate("()=>({p: (KB.layout? KB.layout.portrait : null), dp: KB.TOUCH.rects().dpad.cy, cv: KB.canvas.getBoundingClientRect().bottom})")
        check('[Pixel5 直] D-pad 在畫面下方', ph['dp'] > ph['cv'] - 2, ph)
        all_errs += [f'[Pixel5 直] {e}' for e in errs]
        ctx.close()

        # --- 平板橫向 ---
        ctx, pg, t, dev, errs = open_page(pw, b, 'iPad Mini', True)
        print(f'\n== iPad Mini 橫向 {dev["viewport"]} ==')
        goto_game(pg)
        test_overlap(pg, 'iPadMini 橫', dev)
        R = rects(pg)
        x0 = state(pg)['player']['x']
        t.down(0, R['dpad']['cx'] + R['dpad']['w'] * 0.36, R['dpad']['cy'])
        t.down(1, R['jump']['cx'], R['jump']['cy'])
        step(pg, 20)
        p = state(pg)['player']
        check('[iPadMini 橫] 多點 右 + A → 前進且離地', p['x'] > x0 + 3 and p['onGround'] is False, p)
        t.clear(); step(pg, 5)
        all_errs += [f'[iPadMini 橫] {e}' for e in errs]
        ctx.close()
        b.close()

    real = [e for e in all_errs if 'favicon' not in e.lower()]
    if real:
        print('\n主控台錯誤：')
        for e in real[:10]:
            print('  ', e)
    check('無主控台 / page error', not real, real[:3])

    n = len(results); ok = sum(1 for _, c in results if c)
    print(f'\n===== test_touch: {ok}/{n} PASS, {n - ok} FAIL, {len(warns)} WARN =====')
    return 0 if ok == n else 1


if __name__ == '__main__':
    sys.exit(main())
