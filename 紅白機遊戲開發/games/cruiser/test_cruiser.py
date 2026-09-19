# -*- coding: utf-8 -*-
"""《星塵巡航艦》自機層（ship agent）自動驗證：手感數字 / 武器 / 能量表 / Option / 死亡 / HUD / PPU 限制。

作法：Playwright(Chromium) 開 `cruiser.html?debug=1&scale=1&mute=1`，用與 tools/shot.py 同一套除錯 API
（`__nes.step/press/tap/release/render/state/lint/stats`）推進與取樣；不改任何 engine / stage 檔。

用法：../卡比之星/.venv/bin/python games/cruiser/test_cruiser.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

期望值來源：docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §⑩「手感數字表」
（byte-level 逆向）＋ docs/TASKS.md「R2 → ship agent」契約。每一組數字在下方 test 函式的
docstring 裡標了來源。stage 相關的測試在 `CR.stage.spawnTest` 不存在時印 SKIP、不算失敗。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = (ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv

results = []
skipped = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def near(name, got, lo, hi, detail=''):
    try:
        c = lo <= got <= hi
    except TypeError:
        c = False
    ok(name, c, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


def skip(name, why):
    skipped.append((name, why))
    print('  SKIP %s — %s' % (name, why))


# --------------------------------------------------------------------- 共用 JS
# 測試前的環境整理：清敵人 / 敵彈 / 膠囊、關掉地形判定、給無敵，讓數值測試不被關卡干擾
JS_SETUP = r"""
(opt) => {
  opt = opt || {};
  const st = window.CR.stage;
  if (st) {
    if (opt.restart !== false && st.restart) st.restart(0);
    ['enemies', 'bullets', 'capsules'].forEach(k => {
      const p = st[k];
      if (p && p.items) p.items.forEach(o => { o.alive = false; });
    });
    if (opt.noSolid !== false) st.solidAt = function () { return false; };
    if (opt.freezeCam) st.speed = 0;
  }
  const s = window.CR.ship;
  s.clearShots();
  window.CR.Fx.reset();
  if (opt.invul !== false) s.invul = 999999;
  if (opt.speed) s.speed = opt.speed;
  if (opt.place) s.place(opt.place[0], opt.place[1]);
  return window.GAME.state();
}
"""


def fresh(page, start=True, setup=None):
    page.goto(PAGE)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.CR && !!window.CR.ship')
    if start:
        page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    if setup is not None:
        page.evaluate(JS_SETUP, setup)
    return page.evaluate('() => window.GAME.state()')


def S(page):
    return page.evaluate('() => window.GAME.state()')


# ============================================================ ① 啟動 / 契約
def test_boot(page):
    print('[① 啟動 / CHR / 契約欄位]')
    fresh(page, start=False)
    stt = page.evaluate('() => __nes.stats()')
    ok('engine 模組全到齊（missing 為空）', stt['missing'] == [], stt['missing'])
    s = S(page)
    ok('開機模式 = title', s['mode'] == 'title', s['mode'])
    ok('state() 有契約欄位', all(k in s for k in
        ('mode', 'x', 'y', 'speed', 'gauge', 'power', 'lives', 'score', 'camX', 'enemies', 'shots', 'stage', 'hud')),
       sorted(s.keys()))
    ok('使用 engine 的 NES.SH.OAM（不是 fallback）', s['oam']['engine'] is True, s['oam'])

    chr_info = page.evaluate(r"""() => ({
      spr: Object.keys(CR.SPR_SHIP).length,
      bg: Object.keys(CR.BG_HUD).length,
      sprBank: CR.sprBank.count, bgBank: CR.bgBank.count,
      world0: CR.SPR_WORLD ? CR.sprBank.index(Object.keys(CR.SPR_WORLD)[0]) : null,
      bgWorld0: CR.BG_WORLD ? CR.bgBank.index(Object.keys(CR.BG_WORLD)[0]) : null,
      shipTiles: ['S_SHIP_L0','S_SHIP_R0','S_SHIP_L1','S_SHIP_R1','S_OPT0','S_OPT1','S_BULLET','S_BULLET_D',
                  'S_LASER','S_LASER_H','S_MISSILE0','S_MISSILE1','S_CAP_R0','S_CAP_R1','S_CAP_B',
                  'S_SHIELD0','S_SHIELD1','S_DEBRIS0','S_DEBRIS1'].every(n => CR.TILE[n] !== undefined),
      expTiles: [0,1,2,3].every(f => ['TL','TR','BL','BR'].every(p => CR.TILE['S_EXP'+f+'_'+p] !== undefined)),
      hudTiles: ['H_SP','H_N0','H_N9','H_A','H_Z','H_QUEST','H_MUL','H_GL','H_GM','H_GR',
                 'H_GLON','H_GMON','H_GRON','H_SHIP'].every(n => CR.BGTILE[n] !== undefined)
    })""")
    ok('CR.SPR_SHIP 磚數 ≤ 128（精靈表前半）', chr_info['spr'] <= 128, chr_info['spr'])
    ok('CR.BG_HUD 磚數 ≤ 64（背景表 0..63）', chr_info['bg'] <= 64, chr_info['bg'])
    ok('船 / 彈 / 雷射 / 飛彈 / 膠囊 / 護盾 / 碎片磚齊全', chr_info['shipTiles'])
    ok('爆炸 4 幀 ×4 磚齊全（16 磚）', chr_info['expTiles'])
    ok('HUD 字型 + 能量格框 + 船圖示磚齊全', chr_info['hudTiles'])
    ok('精靈 bank ≤ 256', chr_info['sprBank'] <= 256, chr_info['sprBank'])
    ok('背景 bank ≤ 256', chr_info['bgBank'] <= 256, chr_info['bgBank'])
    if chr_info['world0'] is not None:
        ok('SPR_WORLD 從磚 128 起（chr_ship 補滿前 128 格）', chr_info['world0'] == 128, chr_info['world0'])
        ok('BG_WORLD 從磚 64 起（chr_ship 補滿前 64 格）', chr_info['bgWorld0'] == 64, chr_info['bgWorld0'])
    else:
        skip('SPR_WORLD / BG_WORLD 磚起點', 'chr_world.js 未載入')

    ppu = page.evaluate(r"""() => {
      const p = NES.instance.ppu;
      return { backdrop: p.getBgPalette ? null : null, spr0: p.getSprPalette(0), spr1: p.getSprPalette(1),
               bg0: p.getBgPalette(0), flickerStep: p.flickerStep, split: 208 };
    }""")
    ok('ppu.flickerStep = 0（輪替交給 NES.SH.OAM）', ppu['flickerStep'] == 0, ppu['flickerStep'])
    ok('精靈組 0 = 船（深藍 / 白 / 橘）', ppu['spr0'][-3:] == [0x01, 0x30, 0x27], ppu['spr0'])
    ok('精靈組 1 = 自機彈 / 爆炸（紅 / 黃 / 白）', ppu['spr1'][-3:] == [0x16, 0x28, 0x30], ppu['spr1'])
    ok('背景組 0 = HUD（灰 / 淺灰 / 白）', ppu['bg0'][-3:] == [0x00, 0x10, 0x30], ppu['bg0'])

    page.evaluate("() => { __nes.tap('start', 1); __nes.step(2); }")
    ok('按 START → 進入 play', S(page)['mode'] == 'play', S(page)['mode'])


# ============================================================ ② 移動 / 邊界
JS_SPEED = r"""
(lvl) => {
  const s = CR.ship;
  s.speed = lvl; s.invul = 999999;
  s.place(8, 100);
  const x0 = GAME.state().x;
  __nes.press(['right'], 60);
  const x1 = GAME.state().x;
  __nes.release();
  return { x0, x1, d: x1 - x0, px: GAME.state().speedPx };
}
"""


def test_speed(page):
    """[源] 速度 5 級 = 1.0 / 1.5 / 2.0 / 2.5 / 3.0 px/幀（等差 0.5，無加速度）"""
    print('[② 速度 5 級 × 60 幀位移（研究 §10-1）]')
    fresh(page, setup={'noSolid': True})
    want = [1.0, 1.5, 2.0, 2.5, 3.0]
    for lvl in range(1, 6):
        r = page.evaluate(JS_SPEED, lvl)
        exp = want[lvl - 1] * 60
        near('速度 %d = %.1f px/幀（60 幀位移 %.0f ±0.5）' % (lvl, want[lvl - 1], exp),
             r['d'], exp - 0.5, exp + 0.5, 'd=%s px=%s' % (r['d'], r['px']))
        ok('速度 %d 的 speedPx 回報正確' % lvl, abs(r['px'] - want[lvl - 1]) < 1e-9, r['px'])

    # 無加速度：第 1 幀就是滿速
    r = page.evaluate(r"""() => {
      const s = CR.ship; s.speed = 3; s.place(40, 100);
      const a = GAME.state().x; __nes.press(['right'], 1); const b = GAME.state().x;
      __nes.release(); return b - a; }""")
    ok('無加速度：速度 3 第 1 幀就走 2 px', r == 2, r)

    b = page.evaluate(r"""() => {
      const s = CR.ship; s.speed = 5; s.invul = 999999;
      const o = {};
      s.place(120, 100); __nes.press(['right'], 200); o.xmax = GAME.state().x;
      s.place(120, 100); __nes.press(['left'], 200);  o.xmin = GAME.state().x;
      s.place(120, 100); __nes.press(['up'], 200);    o.ymin = GAME.state().y;
      s.place(120, 100); __nes.press(['down'], 200);  o.ymax = GAME.state().y;
      __nes.release();
      s.place(120, 100); __nes.press(['left','right'], 20); o.lr = GAME.state().x;
      __nes.release();
      s.place(120, 100); __nes.press(['up','down'], 20); o.ud = GAME.state().y;
      __nes.release();
      return o; }""")
    ok('X 上界 = 240', b['xmax'] == 240, b['xmax'])
    ok('X 下界 = 8', b['xmin'] == 8, b['xmin'])
    ok('Y 上界 = 16', b['ymin'] == 16, b['ymin'])
    ok('Y 下界 = 184', b['ymax'] == 184, b['ymax'])
    ok('左右同按 → 淨位移 0', b['lr'] == 120, b['lr'])
    ok('上下同按 → 下優先（y 變大）', b['ud'] > 100, b['ud'])

    d = page.evaluate(r"""() => {
      const s = CR.ship; s.speed = 1; s.place(40, 100);
      __nes.press(['right','down'], 10); const st = GAME.state(); __nes.release();
      return { dx: st.x - 40, dy: st.y - 100 }; }""")
    ok('斜向不正規化（每軸各走滿速）', d['dx'] == 10 and d['dy'] == 10, d)


# ============================================================ ③ 武器
def test_weapons(page):
    """[源] 標準彈 7 / 雷射 12 / DOUBLE (+4,−4) / 飛彈 (+0.5,+2)→(+2,0)；每發射體 2 槽、間隔 20 幀"""
    print('[③ 武器（研究 §10-2）]')
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(40, 100); s.clearShots(); s.emit[0].timer = 0;
      __nes.release(); __nes.step(1);
      __nes.tap('a', 1);
      const timer = GAME.state().timers[0];
      const a = GAME.state().shots.map(o => o.x);
      __nes.step(1);
      const b = GAME.state().shots.map(o => o.x);
      return { n: a.length, a: a[0], b: b[0], timer: timer, delay: CR.Ship.FIRE_DELAY }; }""")
    ok('按 A → 射出 1 發', r['n'] == 1, r)
    ok('標準彈速度 = 7 px/幀', r['b'] - r['a'] == 7, '%s → %s' % (r['a'], r['b']))
    ok('連射間隔常數 = 20 幀', r['delay'] == 20, r['delay'])
    ok('射擊後計時器 = 20', r['timer'] == 20, r['timer'])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(40, 100); s.clearShots(); s.emit[0].timer = 0;
      const tap = () => { __nes.release(); __nes.step(1); __nes.tap('a', 1); };   // 放開一幀才算「本幀按下」
      tap();                                    // 第 1 發
      const n1 = GAME.state().shotCount;
      __nes.release(); __nes.step(8); tap();    // 第 10 幀：冷卻中 → 不該射
      const n2 = GAME.state().shotCount;
      __nes.release(); __nes.step(14); tap();   // 第 25 幀：冷卻完 → 可以射
      const n3 = GAME.state().shotCount;
      return { n1, n2, n3, t: GAME.state().timers[0] }; }""")
    ok('連射間隔 20 幀：第 10 幀再按沒有新彈', r['n1'] == 1 and r['n2'] == 1, r)
    ok('冷卻結束（20 幀後）可以再射（同屏 2 發）', r['n3'] == 2, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(8, 100); s.clearShots();
      let max = 0;
      for (let i = 0; i < 10; i++) {
        __nes.release(); __nes.step(1);
        s.emit[0].timer = 0; __nes.tap('a', 1);
        max = Math.max(max, s.mainUsed(0));
      }
      return { max, alive: GAME.state().shotCount }; }""")
    ok('每個發射體主武器同屏上限 2 槽', r['max'] == 2, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(8, 100); s.clearShots();
      __nes.release(); __nes.step(1); s.emit[0].timer = 0; __nes.tap('a', 1);
      __nes.release(); __nes.step(1); s.emit[0].timer = 0; __nes.tap('a', 1);   // 兩槽都占用
      const t0 = s.emit[0].timer; __nes.step(5); const t1 = s.emit[0].timer;
      return { used: s.mainUsed(0), t0, t1 }; }""")
    ok('兩槽占用時連射計時器凍結', r['used'] == 2 and r['t0'] == r['t1'], r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(40, 100); s.clearShots();
      s.power.double = true; s.power.laser = false; s.emit[0].timer = 0;
      __nes.tap('a', 1);
      const a = GAME.state().shots.filter(o => o.k === 1)[0];
      __nes.step(1);
      const b = GAME.state().shots.filter(o => o.k === 1)[0];
      return { has: !!a, dx: b ? b.x - a.x : null, dy: b ? b.y - a.y : null,
               n: GAME.state().shotCount }; }""")
    ok('DOUBLE：同時射出正前 + 斜上兩發', r['has'] and r['n'] == 2, r)
    ok('DOUBLE 斜彈 = (+4, −4)', r['dx'] == 4 and r['dy'] == -4, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(40, 100); s.clearShots();
      s.power.laser = true; s.power.double = false; s.emit[0].timer = 0;
      __nes.tap('a', 1);
      const lens = [], heads = [];
      for (let i = 0; i < 6; i++) {
        const t = GAME.state().shots.filter(o => o.k === 2)[0];
        if (t) { lens.push(t.len); heads.push(t.x + t.w); }
        __nes.step(1);
      }
      return { lens, heads, w: lens.length ? lens[lens.length-1] * 8 : 0 }; }""")
    ok('雷射段數 1→4 後封頂', r['lens'] and max(r['lens']) == 4 and r['lens'][0] <= 2, r['lens'])
    ok('雷射頭速度 = 12 px/幀',
       len(r['heads']) >= 3 and all(r['heads'][i + 1] - r['heads'][i] == 12 for i in range(len(r['heads']) - 2)),
       r['heads'])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(40, 60); s.clearShots();
      s.power.missile = true; s.power.laser = false; s.power.double = false; s.emit[0].timer = 0;
      CR.stage && (CR.stage.solidAt = function(){ return false; });
      __nes.tap('a', 1);
      const a = GAME.state().shots.filter(o => o.k === 3)[0];
      __nes.step(2);
      const b = GAME.state().shots.filter(o => o.k === 3)[0];
      const cnt0 = s.missileUsed(0);
      s.emit[0].timer = 0; __nes.tap('a', 1);
      return { has: !!a, dx: b ? b.x - a.x : null, dy: b ? b.y - a.y : null,
               one: cnt0, after: s.missileUsed(0) }; }""")
    ok('MISSILE：射出飛彈', r['has'], r)
    ok('飛彈空中 (+0.5, +2)：2 幀 = (+1, +4)', r['dx'] == 1 and r['dy'] == 4, r)
    ok('飛彈同屏每個發射體只有 1 發', r['one'] == 1 and r['after'] == 1, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.clearShots();
      s.power.laser = false; s.power.double = false;
      s.gauge = 3; const a = s.activate();
      s.gauge = 4; const b = s.activate();
      const o1 = { d: s.power.double, l: s.power.laser };
      s.gauge = 3; const c = s.activate();
      const o2 = { d: s.power.double, l: s.power.laser };
      return { a, b, c, o1, o2 }; }""")
    ok('DOUBLE → LASER 互斥切換', r['o1']['l'] is True and r['o1']['d'] is False, r['o1'])
    ok('LASER → DOUBLE 互斥切換', r['o2']['d'] is True and r['o2']['l'] is False, r['o2'])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.place(240, 100); s.clearShots(); s.emit[0].timer = 0;
      s.power.laser = false; s.power.double = false; s.power.missile = false;
      __nes.tap('a', 1); __nes.step(4);
      return GAME.state().shotCount; }""")
    ok('子彈飛出畫面（X > 248）後消滅', r == 0, r)


# ============================================================ ④ 能量表 / 膠囊
def test_gauge(page):
    """[源] 第 7 顆回捲到格 1；已擁有不消耗；OPTION ≤ 2；護盾 5 下；每第 16 顆 = 清屏"""
    print('[④ 能量表 / 膠囊（研究 §10-5）]')
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      const s = CR.ship; s.gauge = 0; s.capsules = 0;
      const seq = [];
      for (let i = 0; i < 7; i++) { s.capsule(false); seq.push(s.gauge); }
      return seq; }""")
    ok('撿膠囊 gauge 1..6 遞增', r[:6] == [1, 2, 3, 4, 5, 6], r)
    ok('第 7 顆回捲到格 1', r[6] == 1, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999;
      const o = {};
      s.gauge = 1; o.act1 = s.activate(); o.speed = s.speed; o.g1 = s.gauge;
      for (let i = 0; i < 6; i++) { s.gauge = 1; s.activate(); }
      o.speedMax = s.speed; s.gauge = 1; o.actMax = s.activate(); o.gMax = s.gauge;
      return o; }""")
    ok('B 啟用格 1（SPEED）→ 速度 +1、能量表歸零', r['act1'] == 'SPEED' and r['speed'] == 2 and r['g1'] == 0, r)
    ok('SPEED 上限 5', r['speedMax'] == 5, r['speedMax'])
    ok('已達速度上限 → 不消耗膠囊（gauge 保留）', r['actMax'] == '' and r['gMax'] == 1, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true);
      const o = {};
      s.gauge = 2; o.a = s.activate(); o.m = s.power.missile; o.g = s.gauge;
      s.gauge = 2; o.b = s.activate(); o.g2 = s.gauge;
      return o; }""")
    ok('B 啟用格 2（MISSILE）', r['a'] == 'MISSILE' and r['m'] is True and r['g'] == 0, r)
    ok('已擁有 MISSILE → 不消耗膠囊', r['b'] == '' and r['g2'] == 2, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true);
      const o = { n: [] };
      for (let i = 0; i < 3; i++) { s.gauge = 5; o.n.push(s.activate()); }
      o.opt = s.power.option; o.g = s.gauge;
      s.gauge = 6; o.sh = s.activate(); o.hp = s.power.shield;
      s.gauge = 6; o.sh2 = s.activate(); o.g2 = s.gauge;
      o.rank = s.rank();
      return o; }""")
    ok('OPTION 上限 2', r['opt'] == 2 and r['n'][2] == '', r)
    ok('OPTION 滿 → 不消耗膠囊', r['g'] == 5, r['g'])
    ok('B 啟用格 6（?）→ 護盾 hp 5', r['sh'] == 'SHIELD' and r['hp'] == 5, r)
    ok('已有護盾 → 不消耗膠囊', r['sh2'] == '' and r['g2'] == 6, r)
    ok('rank = 主武器 + Option 數 + 護盾 = 3（0 武器 + 2 Option + 護盾）', r['rank'] == 3, r['rank'])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.capsules = 0;
      const kinds = [];
      for (let i = 0; i < 16; i++) kinds.push(s.capsule());   // 不指定顏色 → 由 ship 計數
      return { last: kinds[15], others: kinds.slice(0, 15).every(k => typeof k === 'number') }; }""")
    ok('每第 16 顆膠囊 = 清屏膠囊', r['last'] == 'clear' and r['others'], r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.power.shield = 5;
      const hits = [];
      for (let i = 0; i < 6; i++) { s.invul = 0; hits.push(s.hit()); }
      return { hits, alive: s.alive, shield: s.power.shield }; }""")
    ok('護盾擋 5 下、第 6 下死亡', r['hits'] == [False] * 5 + [True] and r['alive'] is False, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.power.shield = 5; s.invul = 0;
      const died = s.hit(true);           // 地形
      return { died, shield: s.power.shield }; }""")
    ok('護盾不擋地形（撞地形必死）', r['died'] is True and r['shield'] == 5, r)


# ============================================================ ⑤ Option
def test_options(page):
    """[源] 環 24 筆、延遲 11 / 22；只有按方向鍵那一幀環才前進；復活時環全填重生座標"""
    print('[⑤ Option 跟隨（研究 §10-3）]')
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999;
      s.power.option = 2; s.speed = 1; s.place(8, 100); s.syncOptions();
      const trail = [];
      for (let i = 0; i < 40; i++) {
        __nes.press(['right'], 1);
        const st = GAME.state();
        trail.push({ x: st.x, o0: st.options[0].x, o1: st.options[1].x });
      }
      __nes.release();
      return { trail, ring: CR.Ship.RING, lag: CR.Ship.OPT_LAG }; }""")
    ok('環長度 = 24 筆', r['ring'] == 24, r['ring'])
    ok('延遲 = [11, 22] 筆', r['lag'] == [11, 22], r['lag'])
    tr = r['trail']
    lag0 = all(tr[i]['o0'] == tr[i - 11]['x'] for i in range(11, len(tr)))
    lag1 = all(tr[i]['o1'] == tr[i - 22]['x'] for i in range(22, len(tr)))
    ok('Option 1 落後船 11 幀（連續按方向鍵）', lag0, [ (t['x'], t['o0']) for t in tr[11:16] ])
    ok('Option 2 落後船 22 幀', lag1, [ (t['x'], t['o1']) for t in tr[22:27] ])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999;
      s.power.option = 2; s.speed = 3; s.place(8, 100); s.syncOptions();
      __nes.press(['right'], 20);
      __nes.release(); __nes.step(1);
      const a = GAME.state().options.map(o => o.x);
      __nes.step(30);                                  // 停手 30 幀
      const b = GAME.state().options.map(o => o.x);
      return { a, b, steps: GAME.state().ringSteps }; }""")
    ok('停手時 Option 環凍結（位置完全不動）', r['a'] == r['b'], r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999;
      s.power.option = 2; s.place(60, 80); s.clearShots();
      s.emit.forEach(e => e.timer = 0);
      __nes.tap('a', 1);
      const srcs = GAME.state().shots.map(o => o.src).sort();
      return srcs; }""")
    ok('Option 也發射同型武器（src 0 / 1 / 2 各一發）', r == [0, 1, 2], r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.power.option = 2;
      s.place(200, 40); __nes.press(['left','up'], 20); __nes.release();
      s.place(CR.Ship.SPAWN_X, CR.Ship.SPAWN_Y);          // 模擬復活
      const o = GAME.state().options;
      return { o, sx: CR.Ship.SPAWN_X, sy: CR.Ship.SPAWN_Y }; }""")
    ok('復活時環全部填成重生座標（Option 立刻就位）',
       all(p['x'] == r['sx'] and p['y'] == r['sy'] for p in r['o']), r['o'])


# ============================================================ ⑥ 死亡 / 命數
def test_death(page):
    """[源] 強化全失 + 回 512 px 檢查點 + 剩餘船 −1；[推論] 停頓 90 幀、重生無敵 90 幀（每 4 幀閃）"""
    print('[⑥ 死亡 / 復活 / 命數（研究 §10-1 / §10-4）]')
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      const s = CR.ship;
      s.reset(true); s.invul = 0;
      s.speed = 4; s.power.double = true; s.power.missile = true; s.power.option = 2;
      s.power.shield = 5; s.gauge = 3;
      if (CR.stage) { CR.stage.camX = 1500; }
      s.hit(true);                                  // 地形 = 護盾無效，直接死
      const a = { alive: s.alive, dt: s.deathTimer, debris: s.debris.filter(d => d.alive).length,
                  booms: GAME.state().booms };
      __nes.step(1);
      const mode1 = GAME.state().mode;
      __nes.step(95);
      const st = GAME.state();
      return { a, mode1, after: { mode: st.mode, lives: st.lives, speed: st.speed, power: st.power,
               gauge: st.gauge, invul: st.invul, camX: st.camX, alive: st.alive } }; }""")
    ok('死亡：alive = false、停頓 90 幀', r['a']['alive'] is False and r['a']['dt'] == 90, r['a'])
    ok('死亡：噴出碎片（2 種磚 6 塊）+ 爆炸', r['a']['debris'] == 6 and r['a']['booms'] >= 1, r['a'])
    ok('死亡：主程式切到 dead 模式', r['mode1'] == 'dead', r['mode1'])
    af = r['after']
    ok('復活：模式回 play', af['mode'] == 'play', af['mode'])
    ok('復活：剩餘船 −1（3 → 2）', af['lives'] == 2, af['lives'])
    ok('復活：強化全部歸零', af['speed'] == 1 and af['gauge'] == 0 and
       af['power'] == {'missile': False, 'double': False, 'laser': False, 'option': 0, 'shield': 0}, af['power'])
    near('復活：無敵 90 幀（已跑掉幾幀）', af['invul'], 80, 90, af['invul'])
    ok('復活：回到檢查點（camX 從 1500 退回 ≤ 1500 的檢查點）', af['camX'] <= 1500 and af['camX'] < 1500, af['camX'])
    ok('復活：alive = true', af['alive'] is True, af)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.invul = 91;      // 對齊 4 幀群組的起點
      const seq = [];
      for (let i = 0; i < 12; i++) { seq.push(s.blink()); s.invul--; }
      return seq; }""")
    ok('無敵閃爍：每 4 幀切換一次（顯示 4 幀 / 隱藏 4 幀）',
       r[0:4] == [r[0]] * 4 and r[4:8] == [not r[0]] * 4 and r[8:12] == [r[0]] * 4, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.newGame(); s.invul = 0;
      const lives = [];
      for (let k = 0; k < 3; k++) {
        s.invul = 0; s.hit(true); __nes.step(95);
        lives.push(GAME.state().lives);
      }
      return { lives, mode: GAME.state().mode }; }""")
    ok('連死 3 次 → 剩餘船 2 / 1 / 0', r['lives'] == [2, 1, 0], r['lives'])
    ok('剩餘船 0 → GAME OVER 畫面', r['mode'] == 'gameover', r['mode'])

    r = page.evaluate(r"""() => {
      __nes.tap('start', 1); __nes.step(2);
      const a = GAME.state().mode;
      __nes.tap('start', 1); __nes.step(2);
      return { a, b: GAME.state().mode, lives: GAME.state().lives }; }""")
    ok('GAME OVER 按 START → 回標題', r['a'] == 'title', r['a'])
    ok('標題按 START → 重新開始（剩餘船回 3）', r['b'] == 'play' and r['lives'] == 3, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.newGame();
      const o = { l0: s.lives };
      s.addScore(19999); o.l1 = s.lives;
      s.addScore(1);     o.l2 = s.lives;
      s.addScore(20000); o.l3 = s.lives;
      o.score = s.score; o.hi = s.hi;
      return o; }""")
    ok('EXTEND：19999 分還沒加船', r['l1'] == 3, r)
    ok('EXTEND：每 20000 分 +1 船', r['l2'] == 4 and r['l3'] == 5, r)
    ok('HI 分數跟著最高分走', r['hi'] >= r['score'], r)


# ============================================================ ⑦ HUD / 名稱表
def test_hud(page):
    print('[⑦ HUD（下方 32 線 split）與 VBlank 預算]')
    fresh(page, setup={'noSolid': True})
    h = S(page)['hud'].split('|')
    ok('HUD 共 3 列', len(h) == 3, h)
    ok('第 1 列 = 1P 分數 + HI 紀錄 + 船數', h[0].strip().startswith('1P 0000000') and 'HI' in h[0] and 'x' in h[0], h[0])
    # fix2 P2-1：5 字標籤 6 格相連（SPEEDMISSLDOUBL…）改成 4 欄一格（3 字 + 1 空欄），與格框對齊
    ok('第 2 列 = 能量表 6 格標籤（4 欄一格、格間留空）',
       all(t in h[1] for t in ['SPD', 'MSL', 'DBL', 'LSR', 'OPT', '?'])
       and 'SPDMSL' not in h[1] and h[1].strip() == 'SPD  MSL  DBL  LSR  OPT   ?', h[1])
    ok('第 3 列 = 能量表 6 個格框', h[2].count('[') == 6 and h[2].count(']') == 6, h[2])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.gauge = 0;
      const out = [];
      for (let i = 1; i <= 6; i++) { s.gauge = i; __nes.step(1); out.push(GAME.state().hud.split('|')[2]); }
      s.gauge = 0; __nes.step(1); out.push(GAME.state().hud.split('|')[2]);
      return out; }""")
    for i in range(6):
        ok('能量表第 %d 格選中時反白（<===>）' % (i + 1),
           r[i].count('<') == 1 and r[i].count('>') == 1 and r[i].index('<') == i * 5 + 1, r[i])
    ok('gauge 歸零 → 全部格框回未選狀態', r[6].count('<') == 0, r[6])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.score = 0; s.addScore(123456); __nes.step(1);
      const a = GAME.state().hud.split('|')[0];
      s.lives = 7; __nes.step(1);
      const b = GAME.state().hud.split('|')[0];
      return { a, b }; }""")
    ok('HUD 分數欄更新', '0123456' in r['a'], r['a'])
    ok('HUD 剩餘船更新', r['b'].rstrip().endswith('x7'), r['b'])

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.invul = 999999;
      const t = NES.instance.timing;
      t.budget.clear();
      let peak = 0, over = 0;
      for (let i = 0; i < 400; i++) {
        if (i % 7 === 0) s.gauge = (s.gauge % 6) + 1;
        if (i % 11 === 0) { s.emit[0].timer = 0; __nes.press(['a','right'], 1); }
        else __nes.press(['right'], 1);
        const b = t.budget;
        if (b.used > peak) peak = b.used;
        if (b.over) over++;
      }
      __nes.release();
      return { peak, over, rep: t.budget.report() }; }""")
    ok('400 幀名稱表寫入預算 budget.over === 0', r['over'] == 0 and r['rep']['overFrames'] == 0, r['rep'])
    ok('單幀 VBlank 寫入尖峰 ≤ 160 byte', r['peak'] <= 160, r['peak'])

    r = page.evaluate(r"""() => {
      const p = NES.instance.ppu;
      const row = 26, col = 1;
      const before = p.getTile(0, col, row);
      __nes.step(120);
      return { before, after: p.getTile(0, col, row), hud: GAME.state().hud.split('|')[0] }; }""")
    ok('捲動 120 幀後 HUD 名稱表沒有被地形蓋掉', r['before'] == r['after'] and '1P' in r['hud'], r)


# ============================================================ ⑧ PPU 限制 / OAM
def test_ppu(page):
    print('[⑧ PPU 限制：同屏 ≤ 25 色、每線 8 精靈的 OAM 輪替]')
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      const s = CR.ship;
      s.power.option = 2; s.power.double = true; s.power.shield = 5; s.speed = 3;
      s.invul = 0;
      const worst = { colors: 0, over: 0 };
      for (let i = 0; i < 240; i++) {
        s.invul = 999999;
        if (i % 9 === 0) { s.emit.forEach(e => e.timer = 0); __nes.press(['a','right'], 1); }
        else __nes.press(['right','down'], 1);
        const l = __nes.lint();
        if (l.colors > worst.colors) worst.colors = l.colors;
        if (!l.ok) worst.over++;
      }
      __nes.release();
      return worst; }""")
    ok('240 幀遊玩中同屏色數 ≤ 25', r['colors'] <= 25, r['colors'])
    ok('240 幀 lint 全綠（含每線 8 精靈）', r['over'] == 0, r)

    # OAM 軟體 sprite cycling：同一條掃描線 12 顆同 prio 的精靈，連續兩幀的聯集要蓋滿
    r = page.evaluate(r"""() => {
      const written = [[], []];
      let frame = 0;
      const fake = { sprite: function (i, s) { if (s && s.y < 240) written[frame].push(s.tile); } };
      const oam = NES.SH.OAM(fake, { reserve: 0 });
      for (frame = 0; frame < 2; frame++) {
        oam.begin();
        for (let k = 0; k < 12; k++) oam.add({ x: k * 16, y: 100, tile: k + 1, pal: 0, prio: 3 });
        oam.end();
      }
      const uni = new Set(written[0].concat(written[1]));
      return { f0: written[0].length, f1: written[1].length, union: uni.size,
               dropped: oam.dropped }; }""")
    ok('OAM：12 顆同 prio 的精靈兩幀聯集蓋滿 12 顆（軟體 sprite cycling）', r['union'] == 12, r)
    ok('OAM：每幀都有寫出精靈（輪替起點不同）', r['f0'] == 12 and r['f1'] == 12, r)

    r = page.evaluate(r"""() => {
      const fake = { sprite: function () {} };
      const oam = NES.SH.OAM(fake, { reserve: 0 });
      oam.begin();
      for (let k = 0; k < 80; k++) oam.add({ x: 8, y: 100, tile: 1, pal: 0, prio: 3 });
      const n = oam.end();
      return { n, dropped: oam.dropped }; }""")
    ok('OAM：超過 64 槽的精靈被丟棄並計 dropped', r['n'] == 64 and r['dropped'] == 16, r)

    r = page.evaluate(r"""() => {
      const order = [];
      const fake = { sprite: function (i, s) { if (s && s.y < 240) order.push(s.pal); } };
      const oam = NES.SH.OAM(fake, { reserve: 0 });
      oam.begin();
      oam.add({ x: 8, y: 100, tile: 1, pal: 3, prio: 4 });   // 爆炸
      oam.add({ x: 8, y: 100, tile: 1, pal: 2, prio: 3 });   // 敵
      oam.add({ x: 8, y: 100, tile: 1, pal: 1, prio: 1 });   // 自機彈
      oam.add({ x: 8, y: 100, tile: 1, pal: 0, prio: 0 });   // 船
      oam.end();
      return order.slice(0, 4); }""")
    ok('OAM：prio 排序 船(0) → 自機彈(1) → 敵(3) → 爆炸(4)', r == [0, 1, 2, 3], r)


# ============================================================ ⑨ 與 stage 的整合
def test_stage(page):
    print('[⑨ 與 CR.stage 的整合（沒有 spawnTest 就 SKIP）]')
    fresh(page, setup={'noSolid': True})
    has = page.evaluate('() => !!(window.CR.stage && typeof CR.stage.spawnTest === "function")')
    if not has:
        skip('敵人 / 膠囊 / 敵彈整合（6 項）', 'CR.stage.spawnTest 不存在（stage agent 尚未提供）')
        return

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999; s.place(20, 100);
      s.clearShots(); s.emit.forEach(e => e.timer = 0);
      CR.stage.solidAt = function(){ return false; };
      CR.stage.spawnTest('fan', 120, 101);
      const n0 = CR.stage.enemies.count;
      if (!n0) return { err: 'spawn 失敗' };
      const score0 = s.score;
      for (let i = 0; i < 60 && CR.stage.enemies.count >= n0; i++) {
        __nes.release(); __nes.step(1);
        s.emit.forEach(e2 => e2.timer = 0); __nes.tap('a', 1);
      }
      const st = GAME.state();
      return { n0, n1: CR.stage.enemies.count, kills: st.kills, score: st.score - score0, booms: st.booms }; }""")
    if r.get('err'):
        skip('自機彈 × 敵人', r['err'])
    else:
        ok('自機彈打中敵人 → 敵人減少', r['n1'] < r['n0'], r)
        ok('擊墜計數 +1', r['kills'] >= 1, r)
        ok('擊墜加分', r['score'] > 0, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999; s.place(100, 100);
      const g0 = s.gauge;
      const c = CR.stage.spawnTest('capsule', 104, 102);
      if (!c) return { err: '膠囊 spawn 失敗' };
      __nes.step(2);
      return { g0, g1: GAME.state().gauge, alive: c.alive }; }""")
    if r.get('err'):
        skip('撿膠囊 → gauge', r['err'])
    else:
        ok('撿到紅膠囊 → gauge +1', r['g1'] == r['g0'] + 1 and r['alive'] is False, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 0; s.place(100, 100);
      const e = CR.stage.spawnTest('zig', 104, 101);
      if (!e) return { err: '敵人 spawn 失敗' };
      __nes.step(2);
      return { alive: GAME.state().alive, mode: GAME.state().mode }; }""")
    if r.get('err'):
        skip('敵人撞船 → 死亡', r['err'])
    else:
        ok('敵人撞到船 → 船死亡', r['alive'] is False, r)

    r = page.evaluate(r"""() => {
      const s = CR.ship; s.reset(true); s.invul = 999999; s.place(100, 100);
      CR.stage.spawnTest('fan', 150, 60); CR.stage.spawnTest('fan', 170, 70);
      const before = CR.stage.enemies.count;
      const kind = s.capsule(true);                 // 藍膠囊 → 清屏
      __nes.step(1);
      return { kind, before, after: CR.stage.enemies.count }; }""")
    ok('藍膠囊呼叫 CR.stage.clearScreen()（畫面上的敵人被清掉）',
       r['kind'] == 'clear' and r['after'] <= r['before'], r)


# ============================================================ ⑩ 收尾
def test_no_errors(page, errors):
    print('[⑩ 穩定度]')
    page.evaluate("() => { __nes.press(['right','a'], 120); __nes.release(); }")
    s = S(page)
    ok('長跑 120 幀後仍在遊戲中', s['mode'] in ('play', 'dead', 'gameover', 'stageclear'), s['mode'])
    ok('state().lastEvent 沒有跨模組例外', not s['lastEvent'], s['lastEvent'])
    ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])


# ============================================== ⑪ fix2（R2 QA P1 / P2 / P3 回歸）
def test_fix2(page):
    print('[⑪ fix2：自動連射 / 訊息文字 / 復活音樂 / HUD 版面]')

    # ---- P1-1 按住 A 自動連射（研究 §5-3 [源]：邊緣 或「計時器歸零 + 按住」都能發）----
    fresh(page, setup={'noSolid': True})
    r = page.evaluate(r"""() => {
      CR.ship.fired = 0; __nes.release(); __nes.step(1);
      const fs = []; let last = CR.ship.fired;
      for (let i = 0; i < 200; i++) {
        NES.Input.inject(NES.Input.BTN.A, 1); __nes.step(1);
        if (CR.ship.fired !== last) { fs.push(i); last = CR.ship.fired; }
      }
      NES.Input.inject(0, 1);
      const gaps = []; for (let i = 1; i < fs.length; i++) gaps.push(fs[i] - fs[i - 1]);
      return { n: CR.ship.fired, frames: fs, gaps: gaps };
    }""")
    ok('按住 A 200 幀會自動連射（不再只射 1 發）', r['n'] >= 8, r['n'])
    near('按住 A 的平均節奏 = 每 21~23 幀 1 發（槽滿凍結）',
         round(200.0 / max(1, r['n']), 1), 21.0, 23.0, '%d 發 / 200 幀，間隔 %s' % (r['n'], r['gaps']))
    ok('最小發射間隔 ≥ FIRE_DELAY（20 幀）', min(r['gaps']) >= 20 if r['gaps'] else False, r['gaps'])

    # 手動連打不應該比自動連射慢（邊緣路徑仍在）
    r2 = page.evaluate(r"""() => {
      CR.ship.fired = 0; __nes.release(); __nes.step(1);
      for (let i = 0; i < 200; i++) { NES.Input.inject((i & 1) ? 0 : NES.Input.BTN.A, 1); __nes.step(1); }
      NES.Input.inject(0, 1);
      return CR.ship.fired;
    }""")
    ok('手動連打（每 2 幀）與自動連射同級', abs(r2 - r['n']) <= 2, '%s vs %s' % (r2, r['n']))

    # ---- P1-2 STAGE CLEAR / GAME OVER 文字在「目前可見的名稱表」上 ----
    for camx, kill, want in ((2816, True, 'STAGE CLEAR'), (800, False, 'GAME OVER')):
        page.goto((ROOT / 'cruiser.html').as_uri() +
                  ('?debug=1&scale=1&mute=1&boss=3' if kill else '?debug=1&scale=1&mute=1&camx=800'))
        page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
        page.evaluate("() => { __nes.tap('start', 1); __nes.step(10); }")
        if kill:
            st = page.evaluate(r"""() => {
              for (let i = 0; i < 900; i++) {
                __nes.step(1);
                CR.stage.enemies.each(e => { if (e.boss && e.alive) e.hit(9); });
                if (GAME.state().mode === 'stageclear') break;
              }
              const g = GAME.state();
              return { mode: g.mode, msg: g.msg, scroll: ((g.camX % 512) + 512) % 512, camX: g.camX };
            }""")
        else:
            st = page.evaluate(r"""() => {
              CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
              __nes.step(140);
              const g = GAME.state();
              return { mode: g.mode, msg: g.msg, scroll: ((g.camX % 512) + 512) % 512, camX: g.camX };
            }""")
        ok('%s：模式正確' % want, st['mode'] == ('stageclear' if kill else 'gameover'), st)
        ok('%s：捲動 ≥ 256（文字必須寫到名稱表 1）' % want, st['scroll'] >= 256, st['scroll'])
        ok('%s：文字出現在畫面可見區（列 11）' % want, want in st['msg'].split('|')[0], st['msg'])
        ok('%s：PRESS START 也看得到（列 15）' % want, 'PRESS START' in st['msg'].split('|')[1], st['msg'])
        # 畫面真的畫得出來且沒有違規（文字覆蓋屬性列之後仍 ≤ 25 色）
        lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
        ok('%s：畫面 lint 綠（文字覆蓋屬性列後仍 ≤ 25 色）' % want,
           lt['ok'] is True and lt['colors'] <= 25, {'ok': lt['ok'], 'colors': lt['colors']})

    # ---- P1-3 死亡後重播音樂 ----
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1')       # 不 mute，才有 CR.Audio
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(60); }")
    a = page.evaluate("() => CR.Audio.state(NES.instance)")
    ok('開局播 stage1', a['song'] == 'stage1' and a['playing'] is True, a)
    a2 = page.evaluate(r"""() => {
      CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(200);
      return { mode: GAME.state().mode, audio: CR.Audio.state(NES.instance) };
    }""")
    ok('死亡 200 幀後已復活', a2['mode'] == 'play', a2['mode'])
    ok('死亡後音樂重播（playing === true）', a2['audio']['playing'] is True, a2['audio'])
    ok('復活後曲目是 stage1', a2['audio']['song'] == 'stage1', a2['audio'])

    # ---- P2-2 魔王進場播 boss、擊破播 clear ----
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&boss=1')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(120); }")
    b = page.evaluate("() => ({ boss: GAME.state().stage.bossActive, audio: CR.Audio.state(NES.instance) })")
    page.evaluate("() => { CR.ship.invul = 999999; }")      # 只驗音樂切換，不要被魔王打死變 gameover
    ok('魔王進場 → bossActive', b['boss'] is True, b)
    ok('魔王進場 → 播 boss 曲', b['audio']['song'] == 'boss' and b['audio']['playing'] is True, b['audio'])
    c = page.evaluate(r"""() => {
      for (let i = 0; i < 900; i++) {
        __nes.step(1);
        CR.stage.enemies.each(e => { if (e.boss && e.alive) e.hit(9); });
        if (GAME.state().mode === 'stageclear') break;
      }
      return { mode: GAME.state().mode, audio: CR.Audio.state(NES.instance) };
    }""")
    ok('魔王擊破 → 播 clear 曲', c['mode'] == 'stageclear' and c['audio']['song'] == 'clear', c)

    # ---- P3-1 標題畫面不掛 HUD ----
    page.goto(PAGE)
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    t = page.evaluate("() => { __nes.step(4); const g = GAME.state(); return { mode: g.mode, hudOn: g.hudOn, hud: g.hud, msg: g.msg }; }")
    ok('標題模式', t['mode'] == 'title', t['mode'])
    ok('標題畫面沒有能量表 HUD', t['hudOn'] is False and t['hud'] == '', t)
    ok('標題文字看得到', 'STARDUST CRUISER' in t['msg'].split('|')[0] or 'PRESS START' in t['msg'].split('|')[1], t['msg'])
    t2 = page.evaluate("() => { __nes.tap('start', 1); __nes.step(4); const g = GAME.state(); return { mode: g.mode, hudOn: g.hudOn, hud: g.hud }; }")
    ok('進遊戲後 HUD 重建', t2['mode'] == 'play' and t2['hudOn'] is True and '1P' in t2['hud'], t2)

    # ---- P3-2 魔王復活點 ----
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1&boss=1')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(120); }")
    d = page.evaluate(r"""() => {
      const before = CR.stage.camX;
      CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(120);
      return { before: before, after: CR.stage.camX, cp: CR.stage.BOSS_RESPAWN, max: CR.stage.CAM_MAX };
    }""")
    ok('stage 匯出 BOSS_RESPAWN', d['cp'] == 2760, d)
    ok('魔王戰死亡 → 復活點在魔王門口（≤ 3 秒空捲）', (d['max'] - d['cp']) / 0.5 <= 180, d)
    ok('死後 camX 已回到魔王復活點之後', d['after'] >= d['cp'], d)


# ======================================= ⑫ fix3（START 暫停 / Konami 秘技 / 續關）
# 期望值來源：docs/research/03…/16_宇宙巡航艦_沙羅曼蛇.md §9-1 [源]
#   暫停中 ↑↑↓↓←→←→BA → SPEED UP ×1 / MISSILE / OPTION ×2 / 護盾（不含 DOUBLE / LASER）；
#   一場 1 次（每打掉一隻 Big Core 多 1 次）；GAME OVER 畫面輸入 → 3 條命續關、分數不清。
# 使用者記憶的變體 ↑↑↓↓←←→→AB / …ABAB / ABAB 一併接受（最近 12 個按鍵邊緣的字尾比對）。

# 用注入佇列送一串「按下 1 幀 → 放開 1 幀」的按鍵邊緣
JS_TAPS = r"""
(keys) => {
  const B = NES.Input.BTN;
  for (const k of keys) {
    NES.Input.inject(B[k], 1); __nes.step(1);
    NES.Input.inject(0, 1); __nes.step(1);
  }
  return window.GAME.state();
}
"""
CODE_FC = ['UP', 'UP', 'DOWN', 'DOWN', 'LEFT', 'RIGHT', 'LEFT', 'RIGHT', 'B', 'A']
CODE_V1 = ['UP', 'UP', 'DOWN', 'DOWN', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'A', 'B']
CODE_V2 = ['A', 'B', 'A', 'B']


def test_fix3(page):
    print('[⑫ fix3：START 暫停 / Konami 秘技（原版 + 變體）/ 一次限制 / GAME OVER 續關]')

    # ---------------------------------------------------------------- 暫停
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(30); }")
    before = page.evaluate("""() => { const g = GAME.state();
        return { camX: g.camX, x: g.x, y: g.y, pf: g.playFrames, ev: CR.stage.spawner().index }; }""")
    p1 = page.evaluate(JS_TAPS, ['START'])
    ok('START → 進入暫停', p1['paused'] is True, p1['paused'])
    ok('暫停畫面畫出 PAUSE（列 11）', 'PAUSE' in p1['msg'].split('|')[0], p1['msg'])
    after = page.evaluate("""() => { __nes.release(); __nes.step(90);
        const g = GAME.state();
        return { camX: g.camX, x: g.x, y: g.y, pf: g.playFrames, ev: CR.stage.spawner().index,
                 paused: g.paused }; }""")
    ok('暫停 90 幀：相機凍結', after['camX'] == before['camX'], (before['camX'], after['camX']))
    ok('暫停 90 幀：自機與出怪表都不動',
       after['x'] == before['x'] and after['y'] == before['y'] and
       after['pf'] == before['pf'] and after['ev'] == before['ev'], (before, after))
    ok('暫停不會自己解除', after['paused'] is True)

    # 解除暫停 → 地形磚被還原（PAUSE 文字寫過的格）
    r = page.evaluate(r"""() => {
      const ppu = __nes.nes().ppu, s = CR.stage;
      const base = ((s.camX % 512) + 512) % 512 >> 3;
      const cells = [];
      for (let i = 0; i < 5; i++) {
        const gc = (base + 13 + i) & 63;
        cells.push([(gc >> 5) & 1, gc & 31, 11, s.tileAt((s.camX >> 3) + 13 + i, 11)]);
      }
      const dirty = cells.filter(c => ppu.getTile(c[0], c[1], c[2]) !== c[3]).length;
      NES.Input.inject(NES.Input.BTN.START, 1); __nes.step(1);
      NES.Input.inject(0, 1); __nes.step(1);
      const restored = cells.filter(c => ppu.getTile(c[0], c[1], c[2]) === c[3]).length;
      const g = GAME.state();
      return { dirty, restored, n: cells.length, paused: g.paused, msg: g.msg };
    }""")
    ok('暫停時 PAUSE 文字真的蓋掉了地形磚', r['dirty'] > 0, r)
    ok('再按 START → 解除暫停', r['paused'] is False, r)
    ok('解除暫停後地形磚全部還原（CR.stage.redraw）', r['restored'] == r['n'], r)
    r2 = page.evaluate("() => { __nes.release(); __nes.step(10); const g = GAME.state(); return { camX: g.camX, pf: g.playFrames }; }")
    ok('解除暫停後遊戲繼續跑', r2['camX'] > after['camX'] and r2['pf'] > after['pf'], (after, r2))

    # ------------------------------------------------- Konami 原版指令的效果
    for name, code in (('原版 ↑↑↓↓←→←→BA', CODE_FC),
                       ('變體 ↑↑↓↓←←→→AB', CODE_V1),
                       ('變體 ABAB', CODE_V2)):
        fresh(page, setup={'noSolid': True})
        page.evaluate("() => { __nes.release(); __nes.step(10); }")
        b = S(page)
        page.evaluate(JS_TAPS, ['START'])
        g2 = page.evaluate(JS_TAPS, code)
        ok('%s：取得 SPEED UP ×1' % name, g2['speed'] == b['speed'] + 1, (b['speed'], g2['speed']))
        ok('%s：取得 MISSILE' % name, g2['power']['missile'] is True, g2['power'])
        ok('%s：取得 OPTION ×2' % name, g2['power']['option'] == 2, g2['power'])
        ok('%s：取得護盾（5 點）' % name, g2['power']['shield'] == 5, g2['power'])
        ok('%s：不含 DOUBLE / LASER（[源] §9-1）' % name,
           g2['power']['double'] is False and g2['power']['laser'] is False, g2['power'])
        ok('%s：顯示 SECRET!' % name, 'SECRET' in g2['msg'].split('|')[1], g2['msg'])
        ok('%s：剩餘次數 1 → 0' % name, g2['secretLeft'] == 0 and g2['secrets'] == 1, g2['secretLeft'])

    # SECRET! 訊息 60 幀後收回，PAUSE 還在
    r = page.evaluate("() => { __nes.release(); __nes.step(70); return GAME.state(); }")
    ok('SECRET! 顯示 1 秒後收回、PAUSE 仍在', 'SECRET' not in r['msg'].split('|')[1]
       and 'PAUSE' in r['msg'].split('|')[0], r['msg'])

    # -------------------------------------------------------- 一場只能用 1 次
    g3 = page.evaluate(JS_TAPS, CODE_FC)
    ok('一場遊戲只能用 1 次（[源] §9-1）', g3['secrets'] == 1 and g3['secretLeft'] == 0, g3['secrets'])
    r = page.evaluate(r"""() => {
      CR.ship.power.option = 0; CR.ship.power.shield = 0; CR.ship.syncOptions();
      const B = NES.Input.BTN;
      for (const k of ['UP','UP','DOWN','DOWN','LEFT','RIGHT','LEFT','RIGHT','B','A']) {
        NES.Input.inject(B[k], 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      }
      const g = GAME.state();
      return { option: g.power.option, shield: g.power.shield, secrets: g.secrets };
    }""")
    ok('用完之後再輸入一次完全沒有效果',
       r['option'] == 0 and r['shield'] == 0 and r['secrets'] == 1, r)

    # ------------------------------------------ 只有暫停 / GAME OVER 才收指令
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(10); }")
    g4 = page.evaluate(JS_TAPS, CODE_FC)          # 沒有先暫停
    ok('遊戲進行中輸入指令不會觸發（只在暫停 / GAME OVER 有效）',
       g4['secrets'] == 0 and g4['secretLeft'] == 1 and g4['power']['option'] == 0, g4['secrets'])

    # ------------------------------------------------ 觸控（external）也輸得進去
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(10); }")
    g5 = page.evaluate(r"""() => {
      const B = NES.Input.BTN;
      // 觸控覆蓋層走 Input.setExternal（不是 inject）⇒ 驗 pressed() 的邊緣對 external 也成立
      const tap = (b) => { NES.Input.setExternal(b); __nes.step(1); NES.Input.setExternal(0); __nes.step(1); };
      tap(B.START);
      const paused = GAME.state().paused;
      for (const k of ['UP','UP','DOWN','DOWN','LEFT','RIGHT','LEFT','RIGHT','B','A']) tap(B[k]);
      const g = GAME.state();
      NES.Input.setExternal(0);
      return { paused: paused, secrets: g.secrets, option: g.power.option, shield: g.power.shield };
    }""")
    ok('觸控（NES.Input.setExternal）也能暫停 + 輸入秘技',
       g5['paused'] is True and g5['secrets'] == 1 and g5['option'] == 2 and g5['shield'] == 5, g5)

    # -------------------------------------------- 打掉魔王 → 秘技次數 +1（[源]）
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1&boss=1')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(60); }")
    r = page.evaluate(r"""() => {
      const before = GAME.state().secretLeft;
      CR.ship.invul = 999999;
      for (let i = 0; i < 900; i++) {
        __nes.step(1);
        CR.stage.enemies.each(e => { if (e.boss && e.alive) e.hit(9); });
        if (GAME.state().mode === 'stageclear') break;
      }
      const g = GAME.state();
      return { before: before, after: g.secretLeft, mode: g.mode };
    }""")
    ok('打掉一隻魔王 → 秘技次數 +1（[源] §9-1）',
       r['mode'] == 'stageclear' and r['after'] == r['before'] + 1, r)

    # ------------------------------------------------ GAME OVER 輸入指令 → 續關
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1&camx=1600')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(30); }")
    over = page.evaluate(r"""() => {
      CR.ship.addScore(12300);
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      const g = GAME.state();
      return { mode: g.mode, lives: g.lives, score: g.score, cont: g.continueCam, msg: g.msg };
    }""")
    ok('死到沒命 → GAME OVER', over['mode'] == 'gameover' and over['lives'] == 0, over)
    ok('GAME OVER 前先記好續關檢查點（512 的倍數 / 魔王門口）',
       over['cont'] % 512 == 0 or over['cont'] == 2760, over['cont'])
    cont = page.evaluate(JS_TAPS, CODE_FC)
    ok('GAME OVER 輸入 Konami 指令 → 回到遊戲', cont['mode'] == 'play', cont['mode'])
    ok('續關給 3 條命（[源] §9-1）', cont['lives'] == 3, cont['lives'])
    ok('續關不清分數', cont['score'] >= over['score'], (over['score'], cont['score']))
    ok('續關回到 GAME OVER 前的檢查點', cont['camX'] == over['cont'], (over['cont'], cont['camX']))
    ok('續關後強化歸零、秘技次數重設為 1',
       cont['power']['option'] == 0 and cont['speed'] == 1 and cont['secretLeft'] == 1, cont['power'])
    ok('續關計數 +1', cont['continues'] == 1, cont['continues'])
    ok('續關後 HUD 回來了', cont['hudOn'] is True and '1P' in cont['hud'], cont['hudOn'])
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('續關後畫面 lint 綠', lt['ok'] is True and lt['colors'] <= 25,
       {'ok': lt['ok'], 'colors': lt['colors']})

    # GAME OVER 按 START 仍然是回標題（原有行為不變）
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1&camx=1600')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(30); }")
    r = page.evaluate(r"""() => {
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      const m0 = GAME.state().mode;
      NES.Input.inject(NES.Input.BTN.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
      const g = GAME.state();
      return { m0: m0, mode: g.mode, msg: g.msg };
    }""")
    ok('GAME OVER 按 START 仍然回標題', r['m0'] == 'gameover' and r['mode'] == 'title', r)
    ok('標題畫面有秘技提示小字（fix4 改成 SECRET: PAUSE + SELECT）',
       'SECRET: PAUSE + SELECT' in page.evaluate("() => CR.screenText(18)"),
       page.evaluate("() => CR.screenText(18)"))


# =============================== ⑬ fix4（一鍵密技：暫停 SELECT / GAME OVER SELECT）
# 使用者回饋（2026-09-19）：「多個一鍵密技好了，當然也保留舊密技，不然死到一半就玩不下去了。」
#   暫停中 SELECT   = Konami 同款效果（SPEED+1 / MISSILE / OPTION×2 / 護盾 5），**不限次數**，
#                     但每次暫停只吃一次（防連按）；**不消耗 Konami 的一場 1 次額度**。
#   GAME OVER SELECT = 3 條命回檢查點續關（分數保留），**不限次數**；Konami 續關保留。
def test_fix4(page):
    print('[⑬ fix4：一鍵密技（SELECT）/ 兩行暫停畫面 / GAME OVER SELECT 續關]')

    # ------------------------------------------------ 暫停畫面兩行（文字可見）
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(10); }")
    b = S(page)
    p1 = page.evaluate(JS_TAPS, ['START'])
    ok('暫停畫面第 1 行 = PAUSE（列 11）', 'PAUSE' in p1['msg'].split('|')[0], p1['msg'])
    ok('暫停畫面第 2 行 = SELECT = SECRET（列 13）',
       'SELECT = SECRET' in p1['msg2'].split('|')[0], p1['msg2'])
    px = page.evaluate(r"""() => {
      __nes.render();
      const f = __nes.nes().ppu.indexFrame, W = 256;
      let n = 0;
      for (let y = 13 * 8; y < 14 * 8; y++) for (let x = 0; x < W; x++) if (f[y * W + x] === 0x30) n++;
      return n;
    }""")
    ok('SELECT = SECRET 真的畫在可見區（列 13 的白色像素 ≥ 60）', px >= 60, px)

    # ------------------------------------------------------- SELECT 一鍵密技
    g1 = page.evaluate(JS_TAPS, ['SELECT'])
    ok('SELECT：SPEED +1', g1['speed'] == b['speed'] + 1, (b['speed'], g1['speed']))
    ok('SELECT：MISSILE / OPTION×2 / 護盾 5',
       g1['power']['missile'] is True and g1['power']['option'] == 2 and g1['power']['shield'] == 5,
       g1['power'])
    ok('SELECT：不含 DOUBLE / LASER（與 Konami 同一組效果）',
       g1['power']['double'] is False and g1['power']['laser'] is False, g1['power'])
    ok('SELECT：顯示 SECRET!', 'SECRET' in g1['msg'].split('|')[1], g1['msg'])
    ok('SELECT：PAUSE / SELECT = SECRET 兩行仍在',
       'PAUSE' in g1['msg'].split('|')[0] and 'SELECT = SECRET' in g1['msg2'].split('|')[0], g1['msg2'])
    ok('SELECT：**不消耗** Konami 的一場 1 次額度', g1['secretLeft'] == 1, g1['secretLeft'])
    ok('SELECT：selectSecrets 計數 +1', g1['selectSecrets'] == 1 and g1['selectUsed'] is True, g1)

    # ------------------------------------------------ 防連按：同一次暫停只吃一次
    page.evaluate("() => { CR.ship.power.option = 0; CR.ship.power.shield = 0; CR.ship.syncOptions(); }")
    g2 = page.evaluate(JS_TAPS, ['SELECT', 'SELECT', 'SELECT'])
    ok('防連按：同一次暫停再按 SELECT 完全沒有效果',
       g2['selectSecrets'] == 1 and g2['power']['option'] == 0 and g2['power']['shield'] == 0, g2['selectSecrets'])

    # -------------------------------------- 解除 → 再暫停 → SELECT 可以再用（不限次數）
    g3 = page.evaluate(JS_TAPS, ['START'])
    ok('解除暫停（文字收回）', g3['paused'] is False and 'PAUSE' not in g3['msg'].split('|')[0], g3['msg'])
    ok('解除暫停後列 13 的 SELECT = SECRET 也還原了',
       'SELECT = SECRET' not in g3['msg2'].split('|')[0], g3['msg2'])
    page.evaluate("() => { __nes.release(); __nes.step(20); }")
    g4 = page.evaluate(JS_TAPS, ['START'])
    ok('再次暫停：SELECT 額度重置', g4['selectUsed'] is False, g4['selectUsed'])
    g5 = page.evaluate(JS_TAPS, ['SELECT'])
    ok('SELECT 不限次數（第 2 次照樣生效）',
       g5['selectSecrets'] == 2 and g5['power']['option'] == 2 and g5['power']['shield'] == 5, g5['selectSecrets'])
    ok('用了兩次 SELECT 之後，Konami 的一場 1 次仍然完好', g5['secretLeft'] == 1, g5['secretLeft'])
    g6 = page.evaluate(JS_TAPS, CODE_FC)
    ok('Konami 序列仍可用，且此時才扣掉那 1 次',
       g6['secretLeft'] == 0 and g6['secrets'] == g5['secrets'] + 1, (g5['secrets'], g6['secrets']))

    # ------------------------------------------- 遊戲進行中按 SELECT 不會觸發
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(10); }")
    g7 = page.evaluate(JS_TAPS, ['SELECT', 'SELECT'])
    ok('遊戲進行中按 SELECT 沒有任何效果（只有暫停 / GAME OVER 有效）',
       g7['selectSecrets'] == 0 and g7['power']['option'] == 0 and g7['paused'] is False, g7['selectSecrets'])

    # ------------------------------------------------------- 觸控 SELECT 也通
    fresh(page, setup={'noSolid': True})
    page.evaluate("() => { __nes.release(); __nes.step(10); }")
    g8 = page.evaluate(r"""() => {
      const B = NES.Input.BTN;
      const tap = (b) => { NES.Input.setExternal(b); __nes.step(1); NES.Input.setExternal(0); __nes.step(1); };
      tap(B.START); tap(B.SELECT);
      const g = GAME.state();
      NES.Input.setExternal(0);
      return { paused: g.paused, sel: g.selectSecrets, option: g.power.option, shield: g.power.shield };
    }""")
    ok('觸控手把的 SELECT 鍵（setExternal）也能一鍵密技',
       g8['paused'] is True and g8['sel'] == 1 and g8['option'] == 2 and g8['shield'] == 5, g8)

    # ------------------------------------------- GAME OVER 按 SELECT 續關（不限次數）
    page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1&camx=1600')
    page.wait_for_function('() => !!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("() => { __nes.tap('start', 1); __nes.step(30); }")
    over = page.evaluate(r"""() => {
      CR.ship.addScore(9800);
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      return GAME.state();
    }""")
    ok('GAME OVER 畫面多一行 SELECT = CONTINUE（列 17）',
       'SELECT = CONTINUE' in over['msg2'].split('|')[1], over['msg2'])
    ok('GAME OVER 畫面 PRESS START 仍在', 'PRESS START' in over['msg'].split('|')[1], over['msg'])
    px2 = page.evaluate(r"""() => {
      __nes.render();
      const f = __nes.nes().ppu.indexFrame, W = 256;
      let n = 0;
      for (let y = 17 * 8; y < 18 * 8; y++) for (let x = 0; x < W; x++) if (f[y * W + x] === 0x30) n++;
      return n;
    }""")
    ok('SELECT = CONTINUE 真的畫在可見區（列 17 白色像素 ≥ 60）', px2 >= 60, px2)
    c1 = page.evaluate(JS_TAPS, ['SELECT'])
    ok('GAME OVER 按 SELECT → 回到遊戲', c1['mode'] == 'play', c1['mode'])
    ok('SELECT 續關給 3 條命', c1['lives'] == 3, c1['lives'])
    ok('SELECT 續關不清分數', c1['score'] >= over['score'], (over['score'], c1['score']))
    ok('SELECT 續關回到 GAME OVER 前的檢查點',
       c1['camX'] == over['continueCam'], (over['continueCam'], c1['camX']))
    ok('SELECT 續關計數 +1', c1['selectContinues'] == 1 and c1['continues'] == 1, c1['selectContinues'])
    ok('SELECT 續關後 HUD 回來了', c1['hudOn'] is True and '1P' in c1['hud'], c1['hudOn'])
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('SELECT 續關後畫面 lint 綠', lt['ok'] is True and lt['colors'] <= 25,
       {'ok': lt['ok'], 'colors': lt['colors']})

    # 第二次 GAME OVER → 再按 SELECT 還是能續關（不限次數）
    c2 = page.evaluate(r"""() => {
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      const m = GAME.state().mode;
      const B = NES.Input.BTN;
      NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      const g = GAME.state();
      return { over: m, mode: g.mode, lives: g.lives, sc: g.selectContinues };
    }""")
    ok('GAME OVER SELECT 續關不限次數（第 2 次照樣可用）',
       c2['over'] == 'gameover' and c2['mode'] == 'play' and c2['lives'] == 3 and c2['sc'] == 2, c2)


def main():
    if not (ROOT / 'cruiser.html').exists():
        print('找不到 cruiser.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text)
                if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        test_boot(page)
        test_speed(page)
        test_weapons(page)
        test_gauge(page)
        test_options(page)
        test_death(page)
        test_hud(page)
        test_ppu(page)
        test_stage(page)
        test_fix2(page)
        test_fix3(page)
        test_fix4(page)
        test_no_errors(page, errors)
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 70)
    print('cruiser / ship 測試：%d 項，通過 %d，失敗 %d，SKIP %d'
          % (n, n - len(bad), len(bad), len(skipped)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    for name, why in skipped:
        print('  SKIP  %s  — %s' % (name, why))
    print('=' * 70)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
