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
# 房間 2：高塔（20×24，地面 row 22-23，每 3 列一片單向平台）→ 測垂直死區鏡頭
TW, TH = 20, 24
tall = [['.'] * TW for _ in range(TH)]
for x in range(TW):
    tall[22][x] = '#'; tall[23][x] = '#'
for ty in range(19, 4, -3):
    for x in range(6, 13): tall[ty][x] = '='
ROOM3 = [''.join(r) for r in tall]
TEST_LEVEL = "KB.LEVELS.push(" + json.dumps({
    'id': 'test', 'name': 'ENGINE TEST', 'theme': 'green', 'music': None, 'boss': None,
    'rooms': [
        {'map': MAP, 'spawn': [2, 9], 'entities': [], 'doors': [{'x': DOOR_X, 'y': 9, 'to': {'room': 1, 'x': 2, 'y': 9}}]},
        {'map': ROOM2, 'spawn': [2, 9], 'entities': [], 'noBoss': True},
        {'map': ROOM3, 'spawn': [2, 21], 'entities': [], 'noBoss': True},
    ]}, ensure_ascii=False) + ");"

KB_LOOK_IDLE = 12   # 與 const.js KB.CAM.lookIdle 一致

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

        # ================= player-feel（手感）=================
        def jsv(expr): return pg.evaluate("()=>(" + expr + ")")
        def parts(): return pg.evaluate("()=>KB.game.parts.length")

        # 17. coyote time：走出平台邊緣 3 幀內按跳仍可起跳
        goto(10, 7); step(3)          # 站在 row8 單向平台（腳 y=128）
        pg.evaluate("(o)=>__kb.press(o)", {'right': True})
        air = -1
        for i in range(60):
            step(1)
            if not pl()['onGround']: air = i; break
        release(1)
        step(2)                        # 離地第 3 幀
        coy = jsv('KB.player.coyoteT')
        tap('jump', 1); step(1)
        q = pl()
        check('coyote time: 離地 3 幀仍可起跳', q['state'] == 'jump' and q['vy'] < 0, (air, coy, q['state'], q['vy']))

        # 18. 超過 coyote 視窗（8 幀）→ 變成漂浮
        goto(10, 7); step(3)
        pg.evaluate("(o)=>__kb.press(o)", {'right': True})
        for i in range(60):
            step(1)
            if not pl()['onGround']: break
        release(1); step(7)
        check('coyote 逾時 → 改為漂浮', jsv('KB.player.coyoteT') == 0, jsv('KB.player.coyoteT'))
        tap('jump', 1); step(1)
        check('離地過久按跳＝漂浮', pl()['state'] == 'float', pl()['state'])
        release(2)

        # 19. jump buffer：落地前 4 幀按跳 → 著地瞬間自動起跳（而不是漂浮）
        goto(2, 9); step(3)
        tap('jump', 1)
        nfall = 0
        for i in range(120):
            step(1); nfall += 1
            if pl()['onGround']: break
        goto(2, 9); step(3)          # 同樣的跳躍，在落地前 4 幀按跳
        tap('jump', 1)
        step(max(1, nfall - 5))
        tap('jump', 1)
        states = []
        for i in range(8): step(1); q = pl(); states.append((q['state'], q['vy']))
        jumped = any(s == 'jump' and v < 0 for s, v in states)
        check('jump buffer: 落地前 4 幀按跳 → 著地瞬間起跳',
              jumped and not any(s == 'float' for s, v in states), (nfall, states))
        release(1); step(60)

        # 20. 落地擠壓 + 揚塵
        goto(2, 9); step(5)
        pg.evaluate("()=>{KB.game.parts.length=0}")
        press('jump', 12); release(1)
        landed = False
        for i in range(60):
            step(1)
            if pl()['onGround'] and pl()['state'] == 'idle': landed = True; break
        check('落地擠壓 landT>0', landed and jsv('KB.player.landT') > 0, (landed, jsv('KB.player.landT')))
        check('落地揚塵 3~4 顆', 3 <= parts() <= 6, parts())
        shot('land_squash')

        # 21. 起跑 / 急轉身揚塵
        goto(2, 9); step(10)
        pg.evaluate("()=>{KB.game.parts.length=0}")
        press('right', 3)
        check('起跑揚塵', parts() >= 2, parts())
        press('right', 40)
        pg.evaluate("()=>{KB.game.parts.length=0}")
        press('left', 3)
        check('急轉身煞車揚塵', parts() >= 3, parts())
        release(2)

        # 22. 吸入：嘴前粒子、敵人被吸抖動、吸到東西 hit-stop 2 幀
        goto(4, 9); step(2); spawn_enemy('waddledee', 9, 9)
        pg.evaluate("()=>{KB.game.parts.length=0}")
        pg.evaluate("(o)=>__kb.press(o)", {'attack': True})
        step(6)
        check('吸入粒子（嘴前方）', parts() >= 2, parts())
        # 等敵人走進吸力範圍；抖動為純繪製偏移（KB.inhaleWobble），碰撞框座標不變
        being = False; wob = []
        for i in range(120):
            step(1)
            e = pg.evaluate("()=>{const e=KB.game.entities.find(x=>x.type==='enemy');if(!e||!e.beingInhaled)return null;const w=[];for(let k=0;k<8;k++)w.push(KB.inhaleWobble(e));return w}")
            if e:
                being = True; wob = e; break
        check('敵人被吸中會抖動（beingInhaled + 繪製偏移非零且會變號）',
              being and any(v != 0 for v in wob) and (max(wob) > 0 and min(wob) < 0), (being, wob))
        maxfz = 0
        for i in range(80):
            step(1); maxfz = max(maxfz, jsv('KB.game.freezeT'))
            if pl()['mouth']: break
        release(1)
        check('吸到東西 hit-stop 2 幀', maxfz == 2 and pl()['mouth'] is not None, (maxfz, pl()['mouth']))
        step(6)

        # 23. 漂浮：拍動粒子、吐氣後 8 幀不可再漂
        goto(2, 9); step(3)
        press('jump', 4); release(1); tap('jump', 1); step(2)
        check('進入漂浮', pl()['state'] == 'float', pl()['state'])
        pg.evaluate("()=>{KB.game.parts.length=0}")
        tap('jump', 1); step(1)
        check('每次拍動吐出空氣粒子', 1 <= parts() <= 3, parts())
        for i in range(20): tap('jump', 1); step(4)      # 飛高一點，留足夠落下空間
        tap('attack', 1); step(1)
        check('攻擊鍵吐氣', pl()['state'] == 'exhale', pl()['state'])
        step(15)                                          # exhale 狀態（14 幀）結束 → 上鎖 8 幀
        lock = jsv('KB.player.exhaleLockT')
        check('吐氣後 exhaleLock 生效（8 幀）', lock >= 7, lock)
        tap('jump', 1); step(1)
        check('吐氣後 8 幀內按跳不會漂浮', pl()['state'] != 'float', pl()['state'])
        step(8); air = not pl()['onGround']; tap('jump', 1); step(1)
        check('鎖定結束後可再漂浮', air and pl()['state'] == 'float', (air, pl()['state'], pl()['y']))
        release(1); step(180)

        # 24. 漂浮中 ↓+攻擊 不吐氣（只有攻擊鍵才吐氣）
        goto(2, 9); step(3)
        press('jump', 4); release(1); tap('jump', 1); step(2)
        check('漂浮中(2)', pl()['state'] == 'float', pl()['state'])
        press('down,attack', 2)
        check('↓+攻擊 不吐氣', pl()['state'] == 'float', pl()['state'])
        release(1); tap('attack', 1); step(1)
        check('單獨攻擊鍵才吐氣', pl()['state'] == 'exhale', pl()['state'])
        release(1); step(120)

        # 25. 滑鏟：按跳取消成跳躍（保留 70% 水平速度）
        goto(4, 9); step(3)
        press('right', 30)
        press('down', 2); press('down,jump', 1); press('down', 2)
        check('滑鏟中(2)', pl()['state'] == 'slide', pl()['state'])
        vx0 = pl()['vx']
        press('down', 1)
        pg.evaluate("()=>__kb.press({down:true,jump:true})"); step(1)
        q = pl()
        check('滑鏟跳取消', q['state'] == 'jump' and q['vy'] < 0, (q['state'], q['vy']))
        check('取消後保留 ~70% 水平速度', abs(q['vx'] - vx0 * 0.7) < 0.35, (vx0, q['vx']))
        release(1); step(60)

        # 26. 滑鏟撞牆：立即停止並小幅回彈
        goto(83, 9); step(3)
        press('right', 20)
        press('down', 2); press('down,jump', 1); release(1)
        bounced = None
        for i in range(40):
            step(1); q = pl()
            if q['vx'] < -0.1: bounced = q; break
        check('滑鏟撞牆回彈 0.8px/frame', bounced is not None and abs(abs(bounced['vx']) - 0.8) < 0.05, bounced and bounced['vx'])
        step(1)
        check('回彈期間仍為 slide（3 幀後結束）', jsv('KB.player.slideBounceT') >= 0, jsv('KB.player.slideBounceT'))
        step(6)
        check('回彈結束回到 idle/crouch', pl()['state'] in ('idle', 'crouch'), pl()['state'])

        # 27. 受傷：hit-stop 3 幀 + 震動 4 + 閃白
        goto(4, 9); step(2); spawn_enemy('waddledee', 7, 9)
        hp0 = pl()['hp']; maxfz = 0; maxshake = 0; flash = 0
        pg.evaluate("(o)=>__kb.press(o)", {'right': True})
        for i in range(60):
            step(1)
            maxfz = max(maxfz, jsv('KB.game.freezeT')); maxshake = max(maxshake, jsv('KB.game.shake'))
            flash = max(flash, jsv('KB.player.hurtFlashT'))
            if pl()['hp'] < hp0 and maxfz: break
        release(1)
        check('受傷 hit-stop 3 幀', maxfz == 3, maxfz)
        # shake 在設定的同一幀末就會 -1，所以外部觀察值為 hurtShake-1
        hs = pg.evaluate("()=>KB.PHYS.hurtShake")
        check('受傷畫面震動（KB.game.shake = %d）' % hs, maxshake >= hs - 1, (maxshake, hs))
        check('受傷閃白（tint 一幀）', flash > 0, flash)
        shot('hurt')

        # 28. 單向平台下穿：↓+跳 穿下去（不是滑鏟）
        goto(10, 7); step(4)
        q0 = pl()
        check('站在單向平台上', q0['onGround'] and abs(q0['y'] - (128 - 15)) < 1, q0['y'])
        press('down', 3)
        pg.evaluate("()=>__kb.press({down:true,jump:true})"); step(1)
        st1 = pl()['state']
        release(1); step(50)
        q = pl()
        check('平台上 ↓+跳 ＝下穿（非滑鏟）', st1 != 'slide' and q['onGround'] and abs(q['y'] - GROUND_Y) < 1, (st1, q['y']))
        shot('dropthrough')
        # 實心地面 ↓+跳 仍為滑鏟
        goto(4, 9); step(3)
        press('down', 3); press('down,jump', 1); press('down', 1)
        check('實心地面 ↓+跳 ＝滑鏟', pl()['state'] == 'slide', pl()['state'])
        release(1); step(30)

        # 29. 鏡頭：前瞻量依速度（靜止 12 / 跑步 40）
        goto(2, 9); step(3)
        pg.evaluate("()=>{for(let i=0;i<200;i++)KB.game.updateCamera();}")
        look_idle = jsv('KB.game.lookAhead')
        check('鏡頭前瞻：靜止 ~12px', abs(look_idle - KB_LOOK_IDLE) < 1.5, look_idle)
        tap('right', 2); step(3); press('right', 60)
        pg.evaluate("()=>{for(let i=0;i<300;i++)KB.game.updateCamera();}")
        look_run = jsv('KB.game.lookAhead')
        check('鏡頭前瞻：跑步 ~40px', look_run > 34, look_run)
        check('鏡頭前瞻平滑（無跳動）', jsv('Math.abs(KB.game.cam.x-(KB.player.cx-128+KB.game.lookAhead))') < 1.5)
        release(2)

        # 30. 鏡頭：垂直死區（畫面 40%~70%）—— 在高塔房（24 列）中央測試，避開地圖上下夾限
        goto(2, 21, room=2); step(5)
        pg.evaluate("""()=>{const g=KB.game;KB.player.y=185;g.cam.y=200-192*0.62;for(let i=0;i<200;i++)g.updateCamera();}""")
        base = pg.evaluate("()=>[KB.game.cam.y, KB.player.bottom-KB.game.cam.y]")
        check('死區中央：鏡頭穩定', 0.40 * 192 <= base[1] <= 0.70 * 192, base)
        moved = pg.evaluate("""()=>{const g=KB.game;const y0=g.cam.y;KB.player.y-=30;for(let i=0;i<150;i++)g.updateCamera();return [y0,g.cam.y,KB.player.bottom-g.cam.y]}""")
        check('垂直死區內鏡頭不動', abs(moved[1] - moved[0]) < 0.5, moved)
        out = pg.evaluate("""()=>{const g=KB.game;const y0=g.cam.y;KB.player.y-=45;for(let i=0;i<250;i++)g.updateCamera();return [y0,g.cam.y,KB.player.bottom-g.cam.y]}""")
        check('超出死區上緣（<40%）鏡頭跟隨', out[1] < out[0] - 5 and abs(out[2] - 0.40 * 192) < 2, out)
        down = pg.evaluate("""()=>{const g=KB.game;const y0=g.cam.y;KB.player.y+=150;for(let i=0;i<300;i++)g.updateCamera();return [y0,g.cam.y,KB.player.bottom-g.cam.y]}""")
        check('超出死區下緣（>70%）鏡頭跟隨', down[1] > down[0] + 5 and abs(down[2] - 0.70 * 192) < 2, down)

        # 31. 鏡頭：魔王房同框
        goto(2, 9); step(3)
        near = pg.evaluate("""()=>{const g=KB.game,p=KB.player;g.isBossRoom=true;
          g.boss={dead:false,cx:p.cx+150,bottom:p.bottom,x:p.cx+130,y:p.bottom-40,w:40,h:40};
          for(let i=0;i<300;i++)g.updateCamera();
          return {cam:g.cam.x, pl:p.cx-g.cam.x, bo:g.boss.cx-g.cam.x}}""")
        check('魔王房：距離近 → 兩者同框', 0 < near['pl'] < 256 and 0 < near['bo'] < 256, near)
        far = pg.evaluate("""()=>{const g=KB.game,p=KB.player;g.isBossRoom=true;
          g.boss={dead:false,cx:p.cx+340,bottom:p.bottom,x:p.cx+320,y:p.bottom-40,w:40,h:40};
          for(let i=0;i<300;i++)g.updateCamera();
          return {cam:g.cam.x, pl:p.cx-g.cam.x, margin:KB.CAM.bossMargin}}""")
        check('魔王房：距離超過畫面寬 → 玩家仍在畫面內且鏡頭偏向魔王',
              abs(far['pl'] - far['margin']) < 1.0, far)
        pg.evaluate("()=>{KB.game.boss=null;KB.game.isBossRoom=false;}")

        # 32. 輸入：BINDINGS / rebind / keyNames
        b1 = pg.evaluate("()=>KB.input.BINDINGS.jump")
        check('input.BINDINGS 存在', isinstance(b1, list) and 'KeyZ' in b1, b1)
        names = pg.evaluate("()=>KB.input.keyNames('jump')")
        check('input.keyNames 可讀', isinstance(names, list) and '空白鍵' in names, names)
        ok = pg.evaluate("()=>KB.input.rebind('jump',['KeyB'])")
        check('input.rebind 成功', ok is True and pg.evaluate("()=>KB.input.BINDINGS.jump")[0] == 'KeyB')
        check('rebind 後 keyNames 更新', pg.evaluate("()=>KB.input.keyNames('jump')") == ['B'])
        check('rebind 未知動作回傳 false', pg.evaluate("()=>KB.input.rebind('nope',['KeyB'])") is False)
        pg.evaluate("()=>KB.input.resetBindings()")
        check('resetBindings 還原', pg.evaluate("()=>KB.input.BINDINGS.jump").count('KeyZ') == 1)
        check('手把死區 0.35', abs(pg.evaluate("()=>KB.input.deadzone") - 0.35) < 1e-6)
        gp = pg.evaluate("()=>KB.input.GAMEPAD")
        check('手把 D-pad + X/Y/B 對應', gp['left'] == [14] and gp['jump'] == [0, 1] and gp['attack'] == [2, 3], gp)
        check('HELP 格式不變（[鍵, 說明] 字串對）',
              pg.evaluate("()=>KB.input.HELP.every(r=>Array.isArray(r)&&r.length===2&&typeof r[0]==='string'&&typeof r[1]==='string')") is True)

        # ================= Round 2 / player2 =================
        def clear_parts(): pg.evaluate("()=>{KB.game.parts.length=0}")

        # 33. 入水 / 出水水花粒子
        goto(38, 9); step(3)
        pg.evaluate("(o)=>__kb.press(o)", {'right': True})
        entered = False; pin = 0
        for i in range(120):
            clear_parts(); step(1)
            if jsv('KB.player.inWater'): entered = True; pin = parts(); break
        release(1)
        check('入水瞬間水花粒子（6 顆）', entered and pin >= 6, (entered, pin))
        check('入水進入 swim 狀態', pl()['state'] == 'swim', pl()['state'])
        shot('water_splash')
        # 水中氣泡：每 20 幀 1 顆
        clear_parts(); step(21)
        check('水中嘴邊氣泡（每 20 幀 1 顆）', 1 <= parts() <= 3, parts())
        # 出水小水花
        exited = False; pout = 0
        for i in range(60):
            for k in range(6):
                clear_parts()
                pg.evaluate("(o)=>__kb.press(o)", {'right': True, 'jump': k == 0})
                step(1)
                if not jsv('KB.player.inWater'): exited = True; pout = parts(); break
            if exited: break
        release(1)
        check('出水小水花', exited and pout >= 3, (exited, pout))

        # 34. 水中吸入（範圍減半 26px）→ full → 吐星
        goto(38, 9); step(2); press('right', 26)
        check('水中(2)', pl()['state'] == 'swim', pl()['state'])
        release(1)
        spawn_enemy('waddledee', 44, 8)
        # a) 距離 40px（陸上吸得到、水中吸不到）
        pg.evaluate("()=>{const e=KB.game.entities.find(x=>x.type==='enemy');KB.player.x=e.x-40-14;KB.player.y=e.y;KB.player.dir=1;e.vx=0;e.speed=0;}")
        pg.evaluate("(o)=>__kb.press(o)", {'attack': True})
        far_pull = False
        for i in range(20):
            step(1)
            if pg.evaluate("()=>{const e=KB.game.entities.find(x=>x.type==='enemy');return !!(e&&e.beingInhaled)}"): far_pull = True; break
        release(1)
        check('水中吸力範圍減半：40px 外吸不到', not far_pull, far_pull)
        # b) 距離 20px：吸得到
        pg.evaluate("()=>{const e=KB.game.entities.find(x=>x.type==='enemy');KB.player.x=e.x-20-14;KB.player.y=e.y;KB.player.dir=1;e.vx=0;e.speed=0;}")
        pg.evaluate("(o)=>__kb.press(o)", {'attack': True})
        got = False
        for i in range(120):
            step(1)
            if pl()['mouth']: got = True; break
        release(1)
        q = pl()
        check('水中吸入 → 含物（state 仍為 swim）', got and q['mouth'] is not None and q['state'] == 'swim', (got, q['state'], q['mouth']))
        shot('water_inhale')
        # c) 含物後吐星（先讓吸入的 hit-stop 2 幀過去）
        step(8)
        tap('attack', 1); step(3)
        stars = [e for e in pg.evaluate("()=>__kb.entities()") if e['spr'] == 'proj_star']
        check('水中含物可吐星', pl()['mouth'] is None and len(stars) >= 1, (pl()['mouth'], len(stars)))
        release(1); step(20)

        # 35. rideStar：沿路徑飛行、無敵、不可操作、抵達呼叫 onArrive
        goto(2, 9); step(3)
        st0 = pg.evaluate("""()=>{window.__arr=0;window.__arrX=null;
          const ok=KB.player.rideStar([[100,140],[200,60],[300,140]],p=>{window.__arr++;window.__arrX=[p.cx,p.cy];});
          return [ok,KB.player.state]}""")
        check('rideStar 回傳 true 並進入 ride 狀態', st0[0] is True and st0[1] == 'ride', st0)
        hurt_ret = pg.evaluate("()=>KB.player.hurt(2,{cx:0,cy:0})")
        check('ride 中無敵（hurt 無效）', hurt_ret is False and pl()['hp'] == 6 and jsv('KB.player.invincible') is True, (hurt_ret, pl()['hp']))
        clear_parts(); step(4)
        check('ride 拖尾粒子', parts() >= 1, parts())
        pg.evaluate("(o)=>__kb.press(o)", {'jump': True, 'left': True})
        step(6)
        check('ride 中不可操作（仍為 ride、不受重力）', pl()['state'] == 'ride' and abs(pl()['vy']) < 0.01, (pl()['state'], pl()['vy']))
        release(1)
        miny = 999; arrived = 0
        for i in range(400):
            step(1); miny = min(miny, pl()['y'])
            if pg.evaluate("()=>window.__arr") > 0: arrived = i; break
        arr = pg.evaluate("()=>window.__arr"); arrxy = pg.evaluate("()=>window.__arrX")
        check('rideStar 經過中途高點 (200,60)', miny < 80, miny)
        check('rideStar 抵達終點並呼叫 onArrive(player) 一次',
              arr == 1 and arrxy is not None and abs(arrxy[0] - 300) < 6 and abs(arrxy[1] - 140) < 6, (arr, arrxy, arrived))
        check('onArrive 未換場景 → 自動落地 fall', pl()['state'] in ('fall', 'idle'), pl()['state'])
        shot('ride_star')
        step(90)
        check('騎星結束後回到地面', pl()['onGround'], (pl()['state'], pl()['y']))
        # onArrive 換房時不強制落地（模擬 mechanics 的傳送星）
        goto(2, 9); step(3)
        pg.evaluate("()=>{KB.player.rideStar([[60,120]],p=>{KB.game.loadRoom(1,2,9);});}")
        for i in range(200):
            step(1)
            if pl()['state'] != 'ride': break
        check('rideStar onArrive 可換房', st()['game']['room'] == 1, (st()['game']['room'], pl()['state']))

        # 36. 梯子：吐氣彈不離開梯子 + 爬到頂 / 底的過渡幀
        goto(52, 9); step(2)
        press('right', 8); release(1)
        press('up', 20)
        check('梯子上(2)', pl()['state'] == 'climb', pl()['state'])
        e0 = st()['game']['ents']
        tap('attack', 1); step(3)
        puffs = [e for e in pg.evaluate("()=>__kb.entities()") if e['spr'] == 'proj_airpuff']
        check('梯子上按攻擊吐氣彈（不離開梯子）', pl()['state'] == 'climb' and len(puffs) >= 1, (pl()['state'], len(puffs)))
        shot('ladder_puff')
        topT = 0
        pg.evaluate("(o)=>__kb.press(o)", {'up': True})
        for i in range(200):
            step(1)
            if pl()['state'] == 'idle': topT = jsv('KB.player.climbTopT'); break
        release(1)
        check('爬到頂有過渡幀 kirby_climb_top', topT > 0 and pg.evaluate("()=>KB.has('kirby_climb_top')") is True, topT)
        check('kirby_swim_inhale / kirby_ride 精靈存在',
              pg.evaluate("()=>KB.has('kirby_swim_inhale')&&KB.has('kirby_ride')") is True)

        # 37. Extra 模式：maxHp 3；能力星壽命常數
        r = pg.evaluate("()=>{KB.session=KB.session||{};KB.session.extra=true;const p=new KB.Player(0,0);KB.session.extra=false;return [p.maxHp,p.hp]}")
        check('Extra 模式 maxHp / hp = 3', r == [3, 3], r)
        r2 = pg.evaluate("()=>{const p=new KB.Player(0,0);return [p.maxHp,p.hp]}")
        check('一般模式 maxHp / hp = 6', r2 == [6, 6], r2)
        check('KB.PHYS.abilityStarLife = 600', jsv('KB.PHYS.abilityStarLife') == 600, jsv('KB.PHYS.abilityStarLife'))
        check('KB.PHYS 新常數齊備',
              jsv('KB.PHYS.waterInhaleRange') == 26 and jsv('KB.PHYS.rideSpeed') == 4 and jsv('KB.PHYS.bubbleEvery') == 20
              and jsv('KB.PHYS.splashParts') == 6 and jsv('KB.PHYS.waterKnock') == 0.5 and jsv('KB.PHYS.extraMaxHp') == 3)
        # SPEC 第 10 節既有手感常數未被更動
        check('SPEC 既有常數未變（walk/run/jump/grav/swim）',
              jsv('[KB.PHYS.walk,KB.PHYS.run,KB.PHYS.jump,KB.PHYS.grav,KB.PHYS.swimSpeed,KB.PHYS.swimUp]') == [1.3, 2.2, -4.4, 0.24, 1.0, -2.2])

        # 38. 水中受傷擊退減半
        goto(38, 9); step(2); press('right', 26); release(1)
        check('水中(3)', pl()['state'] == 'swim', pl()['state'])
        kw = pg.evaluate("""()=>{const p=KB.player;p.invuln=0;p.invincibleT=0;p.hurt(1,{cx:p.cx+40,cy:p.cy});return [p.vx,p.vy]}""")
        check('水中受傷擊退減半（vx=-1.0, vy=-1.1）',
              abs(abs(kw[0]) - 1.0) < 0.01 and abs(kw[1] + 1.1) < 0.01, kw)
        goto(2, 9); step(4)
        kl = pg.evaluate("""()=>{const p=KB.player;p.invuln=0;p.invincibleT=0;p.hurt(1,{cx:p.cx+40,cy:p.cy});return [p.vx,p.vy]}""")
        check('陸上受傷擊退不變（vx=-2.0, vy=-2.2）',
              abs(abs(kl[0]) - 2.0) < 0.01 and abs(kl[1] + 2.2) < 0.01, kl)

        b.close()
    print('---')
    fails = [r for r in results if not r[1]]
    print(f'{len(results) - len(fails)}/{len(results)} passed')
    if logs: print('BROWSER ERRORS:'); print('\n'.join(logs[:20]))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
