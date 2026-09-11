# -*- coding: utf-8 -*-
"""引擎機制自動測試：注入程式化生成的測試關卡，跑多個情境，印出 PASS/FAIL 與截圖。
用法：python tools/engine_test.py [--shots]
"""
import sys, json, pathlib, base64
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots' / 'engine'
WANT_SHOTS = '--shots' in sys.argv

# ---- 程式化建立測試地圖（W=96, H=12；地面在 row 10-11）----
W, H = 96, 12
grid = [['.'] * W for _ in range(H)]
def put(x, y, ch): grid[y][x] = ch
def fill(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, ch)
fill(0, 10, W - 1, 11, '#')
# 單向平台 row 8, cols 8..12（地面 top=160，平台 top=128 → 需跳 32px）
fill(8, 8, 12, 8, '=')
# 星星方塊：地面上 (16,9) 與 (24,9)
put(16, 9, '*'); put(24, 9, '*')
# 斜坡土丘：cols 28..35，'/##\' 樣式兩層
put(28, 9, '/'); fill(29, 9, 34, 9, '#'); put(35, 9, '\\')
put(29, 8, '/'); fill(30, 8, 33, 8, '#'); put(34, 8, '\\')
# 水池：cols 40..47，rows 8..10 為水，row 11 為底
fill(40, 8, 47, 10, '~')
# 梯子：col 53 rows 4..9；頂端兩側平台 '=' 在 row 4 (51,52,54,55)
fill(53, 4, 53, 9, 'H'); put(51, 4, '='); put(52, 4, '='); put(54, 4, '='); put(55, 4, '=')
# 尖刺：地面上 (60,9),(61,9)
put(60, 9, '^'); put(61, 9, '^')
# 門在 (66,9)
DOOR_X = 66
# 坑洞：cols 72..79 無地面
fill(72, 10, 79, 11, '.')
# 牆：col 86 rows 6..9 實心（測撞牆）
fill(86, 6, 86, 9, '#')
MAP = [''.join(r) for r in grid]
ROOM2 = ['.' * 32] * 10 + ['#' * 32] * 2
TEST_LEVEL = "KB.LEVELS.push(" + json.dumps({
    'id': 'test', 'name': 'ENGINE TEST', 'theme': 'green', 'music': None, 'boss': None,
    'rooms': [
        {'map': MAP, 'spawn': [2, 9], 'entities': [], 'doors': [{'x': DOOR_X, 'y': 9, 'to': {'room': 1, 'x': 2, 'y': 9}}]},
        {'map': ROOM2, 'spawn': [2, 9], 'entities': [], 'noBoss': True},
    ]}, ensure_ascii=False) + ");"

results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + ('  ' + str(info) if info else ''))

def main():
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.on('console', lambda m: logs.append(m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate(TEST_LEVEL)

        def goto(x=None, y=None, room=0, ability=None):
            pg.evaluate("()=>__kb.release()")
            o = {'level': 'test', 'room': room, 'nofade': True}
            if x is not None: o['x'] = x
            if y is not None: o['y'] = y
            if ability: o['ability'] = ability
            pg.evaluate("(o)=>__kb.goto('game',o)", o)
            pg.evaluate("()=>__kb.step(2)")
        def press(keys, n):
            pg.evaluate("(o)=>__kb.press(o)", {k: True for k in keys.split(',')})
            pg.evaluate("(n)=>__kb.step(n)", n)
        def release(n=1):
            pg.evaluate("()=>__kb.release()"); pg.evaluate("(n)=>__kb.step(n)", n)
        def tap(k, n=1):
            pg.evaluate("([k,n])=>__kb.tap(k,n)", [k, n])
        def step(n): pg.evaluate("(n)=>__kb.step(n)", n)
        def st(): return json.loads(pg.evaluate("()=>__kb.state()"))
        def pl(): return st()['player']
        def enemies(): return [e for e in pg.evaluate("()=>__kb.entities()") if e['type'] == 'enemy']
        def spawn_enemy(t, x, y, d=-1): pg.evaluate("(o)=>KB.game.spawnDef(o)", {'t': t, 'x': x, 'y': y, 'dir': d}); step(1)
        def shot(name):
            if not WANT_SHOTS: return
            SHOTS.mkdir(parents=True, exist_ok=True)
            pg.evaluate("()=>__kb.render()")
            data = pg.evaluate("""()=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*3;o.height=c.height*3;const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""")
            (SHOTS / (name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))

        GROUND_Y = 160 - 15  # 玩家 y（腳在 160）

        # 1. 走路與跑步
        goto(2, 9)
        p0 = pl(); press('right', 40); p1 = pl()
        check('walk moves right', p1['x'] > p0['x'] + 30, (p0['x'], p1['x']))
        check('walk state', p1['state'] == 'walk', p1['state'])
        release(20); check('idle after release', pl()['state'] == 'idle' and abs(pl()['vx']) < 0.01)
        tap('right', 2); step(3); press('right', 30); p2 = pl()
        check('double-tap run', p2['state'] == 'run' and p2['vx'] > 2.0, (p2['state'], p2['vx']))
        release(5)

        # 2. 跳躍高度（短按 vs 長按）
        goto(2, 9); step(5)
        tap('jump', 1); ys = []
        for i in range(40): step(1); ys.append(pl()['y'])
        short_h = GROUND_Y - min(ys)
        goto(2, 9); step(5)
        press('jump', 20); ys = []
        for i in range(40): step(1); ys.append(pl()['y'])
        long_h = GROUND_Y - min(ys)
        release(1)
        check('variable jump height', long_h > short_h + 10, (short_h, long_h))
        check('jump height ~40px', 34 < long_h < 52, long_h)
        step(20)
        check('landed after jump', pl()['onGround'] and pl()['state'] == 'idle', pl()['state'])

        # 3. 單向平台：從下方跳上去
        goto(9, 9); step(3)
        press('jump', 20); step(30); release(1)
        q = pl()
        check('one-way platform landed', q['onGround'] and abs(q['y'] - (128 - 15)) < 1, (q['y'], q['onGround']))
        shot('platform')

        # 4. 吸入星星方塊 → full → 吐出 → 星星彈打破方塊
        goto(14, 9); step(3)
        press('attack', 40); release(2)
        q = pl(); check('inhaled star block -> full', q['mouth'] is not None and q['state'] in ('full', 'idle'), (q['state'], q['mouth']))
        check('block (16,9) removed', pg.evaluate("()=>KB.game.map.get(16,9)") == '.')
        ents0 = st()['game']['ents']
        tap('attack', 1); step(3)
        check('spit creates projectile', st()['game']['ents'] > ents0 and pl()['mouth'] is None, st()['game']['ents'])
        step(60)
        blk = pg.evaluate("()=>KB.game.map.get(24,9)")
        check('spit star broke block at (24,9)', blk == '.', blk)
        shot('spit')

        # 5. 斜坡：走過去不卡住，y 會升高再降低
        goto(25, 9); step(3)
        xs, ys = [], []
        pg.evaluate("(o)=>__kb.press(o)", {'right': True})
        for i in range(150): step(1); q = pl(); xs.append(q['x']); ys.append(q['y'])
        release(1)
        mono = all(xs[i + 1] >= xs[i] - 0.01 for i in range(len(xs) - 1))
        check('slope: x monotonic (no stuck)', mono and xs[-1] > 36 * 16, (xs[0], xs[-1]))
        check('slope: climbed up 32px', min(ys) < GROUND_Y - 30, min(ys))
        check('slope: back on floor', abs(ys[-1] - GROUND_Y) < 1, ys[-1])
        shot('slope')

        # 6. 吞下敵人與能力（直接給 mouth）→ 丟棄 → 能力星
        goto(2, 9); step(2)
        pg.evaluate("()=>{KB.player.mouth={ability:'fire',name:'x'}; KB.player.setState('full');}")
        tap('down', 2); step(20)
        check('swallow gives ability', pl()['ability'] == 'fire', pl()['ability'])
        tap('select', 1); step(5)
        ents = pg.evaluate("()=>__kb.entities()")
        check('discard ability spawns star', pl()['ability'] is None and any(e['t'] == 'abilitystar' for e in ents), [e['t'] for e in ents])
        # 撿回：把卡比移到能力星上
        step(35)
        pg.evaluate("()=>{const s=KB.game.entities.find(e=>e.name==='abilitystar'); if(s){KB.player.x=s.x; KB.player.y=s.y-4;}}")
        step(5)
        check('regain ability by touching star', pl()['ability'] == 'fire', pl()['ability'])

        # 7. 漂浮：多次按跳上升，吐氣落下
        goto(2, 9); step(2)
        press('jump', 5); release(1); tap('jump', 1); step(5)
        check('float state', pl()['state'] == 'float', pl()['state'])
        for i in range(8): tap('jump', 1); step(6)
        q = pl(); check('float rises', q['y'] < 100, q['y'])
        tap('attack', 1); step(2)
        check('exhale ends float', pl()['state'] in ('exhale', 'fall'), pl()['state'])
        step(150)
        check('fell back to ground', pl()['onGround'], pl()['y'])
        shot('float')

        # 8. 蹲下與滑鏟打敵人（waddledee 在 x=10 面向左走過來）
        goto(4, 9); step(2); spawn_enemy('waddledee', 8, 9)
        press('down', 5); check('crouch', pl()['state'] == 'crouch')
        press('down,jump', 1); press('down', 3); check('slide', pl()['state'] == 'slide', pl()['state'])
        e0 = len(enemies())
        press('down', 20); release(1); step(30)
        e1 = len(enemies())
        check('slide killed waddledee', e0 == 1 and e1 == 0, (e0, e1))

        # 9. 水：進入游泳、按跳上浮、離開水
        goto(38, 9); step(2)
        press('right', 30)
        q = pl(); check('swim state in water', q['state'] == 'swim', (q['state'], q['x']))
        step(30); y0 = pl()['y']; tap('jump', 1); step(12); check('swim stroke rises', pl()['y'] < y0, (y0, pl()['y']))
        for i in range(10): press('right,jump', 1); press('right', 8)
        press('right', 40); release(1)
        q = pl(); check('exited water', q['state'] != 'swim' and q['x'] > 48 * 16, (q['state'], q['x']))
        shot('water')

        # 10. 梯子：爬上去、站在頂端、再爬下
        goto(52, 9); step(2)
        press('right', 8); release(1)
        press('up', 20)
        q = pl(); check('climb state', q['state'] == 'climb', (q['state'], q['y']))
        press('up', 120); release(1); step(5)
        q = pl(); check('climbed to top & standing', q['onGround'] and abs(q['y'] - (64 - 15)) < 1 and q['state'] == 'idle', (q['state'], q['y']))
        shot('ladder')
        press('down', 40); q = pl(); check('climb down from top', q['state'] == 'climb' and q['y'] > 64 - 15 + 10, (q['state'], q['y']))
        press('down', 120); release(3)
        check('reached bottom standing', pl()['onGround'] and abs(pl()['y'] - GROUND_Y) < 1, pl()['y'])

        # 11. 尖刺受傷
        goto(57, 9); step(2)
        hp0 = pl()['hp']; press('right', 50); release(1)
        check('spike hurts', pl()['hp'] < hp0, (hp0, pl()['hp']))

        # 12. 門
        goto(64, 9); step(2)
        press('right', 22); release(1)
        press('up', 3); step(60); release(1)
        check('door -> room 1', st()['game']['room'] == 1, (st()['game']['room'], pl()['x']))

        # 13. 掉入坑洞死亡與重生
        goto(69, 9); step(2)
        lives0 = st()['game']['lives']
        press('right', 60); release(1)
        step(220)
        q = st()
        check('fell -> lives decreased & respawn', q['game']['lives'] == lives0 - 1 and q['player']['state'] != 'dead' and q['player']['hp'] == 6, (q['game']['lives'], q['player']['state']))

        # 14. 能力攻擊打敵人（sword）
        goto(4, 9, ability='sword'); step(2); spawn_enemy('waddledee', 6, 9)
        e0 = len(enemies())
        for i in range(8): tap('attack', 1); step(14)
        e1 = len(enemies())
        check('sword kills waddledee', e0 == 1 and e1 == 0, (e0, e1))

        # 15. 撞牆不穿透
        goto(82, 9); step(2)
        press('right', 60); release(1)
        q = pl(); check('wall blocks (x<=86*16-14)', q['x'] <= 86 * 16 - 14 + 0.01 and q['x'] > 84 * 16, q['x'])

        # 16. 受傷後無敵與擊退
        goto(4, 9); step(2); spawn_enemy('waddledee', 7, 9)
        press('right', 40); release(1)
        q = pl(); check('enemy contact hurts', q['hp'] == 5 and q['state'] in ('hurt', 'idle', 'fall'), (q['hp'], q['state']))
        step(30); check('invuln prevents second hit', pl()['hp'] == 5, pl()['hp'])

        b.close()
    print('---')
    fails = [r for r in results if not r[1]]
    print(f'{len(results) - len(fails)}/{len(results)} passed')
    if logs: print('BROWSER ERRORS:'); print('\n'.join(logs[:20]))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
