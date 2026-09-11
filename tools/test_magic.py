# -*- coding: utf-8 -*-
"""
魔法系能力自動驗證（Round 5）：mage 元素法師 / time 時間 / gravity 重力 / clone 分身 + 4 種魔法系敵人。
沿用 tools/enemy_test.py 的測試關卡與 Harness（注入 etest 關卡 → 生成敵人 → 模擬按鍵 → 取樣）。

每招檢查三件事：
  1. 招式有生效（命中 waddledee 會死 / 敵人被凍結 / 冰牆磁磚出現 / 分身存在…）
  2. 招式結束後回到正常狀態（state 回 idle/walk/fall、ability 還在、重力 / timeStop 等全域狀態復原）
  3. 全程沒有 pageerror / console.error / 缺精靈

用法：python tools/test_magic.py [--only mage,time] [--shots] [-v]
"""
import sys, pathlib, argparse, base64

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
import enemy_test as ET
from enemy_test import Harness, HOOK_JS, TEST_LEVEL, check

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots' / 'agent_magic'
NORMAL = ('idle', 'walk', 'run', 'fall', 'jump', 'crouch', 'float')
MAGIC_KEYS = ['mage', 'time', 'gravity', 'clone']
MAGIC_ENEMIES = {'wizzle': 'mage', 'tiktok': 'time', 'gravitron': 'gravity', 'mimi': 'clone'}


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
def step(h, n):
    h.ev("(n)=>__kb.step(n)", n)

def press(h, keys, frames):
    h.press(keys); step(h, frames)

def release(h, frames=1):
    h.release(); step(h, frames)

def give(h, key):
    """走正規流程給能力（會呼叫 onGet，分身才會生成）"""
    h.ev("(k)=>{const p=KB.player; p.ability=null; p.abilityData={}; p.giveAbility(k); p.setState('idle');}", key)
    step(h, 2)

def gstate(h):
    return h.ev("()=>({timeStop:KB.game.timeStopT|0, slowMo:KB.game.slowMoT|0, grav:+KB.player.grav.toFixed(3), "
                "phys:+KB.PHYS.grav.toFixed(3), state:KB.player.state, ability:KB.player.ability, "
                "x:+KB.player.x.toFixed(1), y:+KB.player.y.toFixed(1), vx:+KB.player.vx.toFixed(2), vy:+KB.player.vy.toFixed(2), hp:KB.player.hp})")

def allies(h):
    return h.ev("()=>KB.game.entities.filter(e=>!e.dead&&e.type==='ally').map(e=>({name:e.name,x:+e.x.toFixed(1),y:+e.y.toFixed(1)}))")

def tiles_at(h, cells):
    return h.ev("(cs)=>cs.map(c=>KB.game.map.get(c[0],c[1]))", cells)

def target(h):
    """目前測試敵人（__te）的狀態"""
    return h.ev("()=>{const e=__te; return e?{x:+e.x.toFixed(1),y:+e.y.toFixed(1),cx:+e.cx.toFixed(1),cy:+e.cy.toFixed(1),hp:e.hp,dead:!!e.dead,freezeT:e.freezeT|0,vy:+e.vy.toFixed(2)}:null;}")

def spawn_dummy(h, x, y=9, t='waddledee', still=True, d=1):
    e = h.spawn(t, x, y, d=d)
    if still:
        h.ev("()=>{const e=__te; if(e){e.speed=0; e.vx=0; e.turnAtEdge=false; e.turnAtWall=false;}}")
    return e

def killed(h, hp0=2):
    t = target(h)
    return t is None or t['dead'] or t['hp'] < hp0 or t['freezeT'] > 0

def normal_after(h, key, name, extra=''):
    """招式結束後：狀態回正常、能力還在、全域計時歸零、重力沒被改壞"""
    g = gstate(h)
    ok = (g['state'] in NORMAL and g['ability'] == key and abs(g['grav'] - g['phys']) < 1e-6)
    check(f'{name}: back to normal state', ok, dict(g, note=extra))
    return ok

def magic_ents(h):
    """本檔產生的持續型實體（ticker / 冰牆 / 黑洞 / 殘影）"""
    return h.ev("()=>KB.game.entities.filter(e=>!e.dead&&/^(magic_|icewall|blackhole|ghost|thundercall)/.test(e.name||'')).map(e=>e.name)")


# ---------------------------------------------------------------------------
# 1. mage 元素法師
# ---------------------------------------------------------------------------
def phase_mage(h):
    n = 'mage: '
    # --- X 火球 ---
    h.goto(3, 9, ability='mage'); spawn_dummy(h, 8)
    h.ev("()=>{KB.player.dir=1;}")
    press(h, 'attack', 3); release(h); step(h, 70)
    check(n + 'X fireball kills waddledee', killed(h), target(h))
    normal_after(h, 'mage', n + 'X fireball')

    # --- ↑+X 冰牆 ---
    h.goto(3, 9, ability='mage')
    press(h, 'up', 3); press(h, 'up,attack', 3); release(h); step(h, 30)
    cells = h.ev("()=>{const p=KB.player,T=KB.TILE,tx=Math.floor((p.cx+p.dir*20)/T),by=Math.floor((p.bottom-1)/T);return [[tx,by],[tx,by-1],[tx,by-2]];}")
    ch = tiles_at(h, cells)
    check(n + 'up+X builds a 3-tile ice wall', ch.count('I') == 3, dict(cells=cells, tiles=ch))
    walls = h.ev("()=>KB.game.entities.filter(e=>!e.dead&&e.name==='icewall').length")
    check(n + 'ice wall entity alive', walls == 1, walls)
    step(h, 250)
    ch2 = tiles_at(h, cells)
    check(n + 'ice wall restores tiles after 240f', 'I' not in ch2, ch2)
    normal_after(h, 'mage', n + 'up+X ice wall')

    # --- ↓+X 雷擊召喚 ---
    h.goto(3, 9, ability='mage'); h.ev("()=>{KB.player.dir=1;}")
    spawn_dummy(h, 6)
    press(h, 'down', 4); press(h, 'down,attack', 3); release(h); step(h, 80)
    check(n + 'down+X thunder kills waddledee', killed(h), target(h))
    normal_after(h, 'mage', n + 'down+X thunder')

    # --- 空中 X 風刃 ---
    h.goto(3, 9, ability='mage'); spawn_dummy(h, 7)
    h.ev("()=>{KB.player.dir=1;}")
    h.ev("([k,n])=>__kb.tap(k,n)", ['jump', 2]); step(h, 8)
    press(h, 'attack', 3); release(h); step(h, 60)
    check(n + 'air X wind blades kill waddledee', killed(h), target(h))
    normal_after(h, 'mage', n + 'air X wind')

    # --- 蓄力必殺：元素風暴 ---
    h.goto(3, 9, ability='mage'); spawn_dummy(h, 9)
    press(h, 'attack', 80); release(h); step(h, 30)
    st = h.ev("()=>KB.player.abilityData.mode")
    check(n + 'hold 60f -> storm ultimate', st == 'storm', st)
    step(h, 140)
    check(n + 'storm kills waddledee', killed(h), target(h))
    normal_after(h, 'mage', n + 'storm')
    check(n + 'no leftover magic entities', magic_ents(h) == [], magic_ents(h))


# ---------------------------------------------------------------------------
# 2. time 時間
# ---------------------------------------------------------------------------
def phase_time(h):
    n = 'time: '
    # --- 基準：一般狀態下敵人會走多遠 ---
    h.goto(3, 9, ability='time'); h.spawn('waddledee', 8, 9, d=1)
    x0 = target(h)['x']; step(h, 60); base = abs(target(h)['x'] - x0)

    # --- X 時停：敵人不動 ---
    h.goto(3, 9, ability='time', immune=True); h.spawn('waddledee', 8, 9, d=1)
    h.ev("()=>{KB.player.dir=1;}")
    press(h, 'attack', 3); release(h)
    g = gstate(h)
    check(n + 'X sets timeStopT = 180', g['timeStop'] >= 170, g['timeStop'])
    ex0 = target(h)['x']
    step(h, 60)
    ex1 = target(h)['x']
    check(n + 'enemies frozen during time stop (x unchanged)', abs(ex1 - ex0) < 0.01 and base > 8, dict(x0=ex0, x1=ex1, baseline=base))
    if h.shots:
        h.save_shot('magic_timestop')

    # --- 時停中 X 改為近身拳，累積傷害在解除時結算 ---
    h.ev("()=>{const p=KB.player,e=__te; p.x=e.x-16; p.y=e.y; p.vx=0; p.vy=0; p.dir=1; p.setState('idle');}")
    for _ in range(3):
        press(h, 'attack', 3); release(h); step(h, 12)
    mode = h.ev("()=>KB.player.abilityData.mode")
    pend = h.ev("()=>{const e=__te; return e? (e._pendDmg|0) : -1;}")
    alive = not target(h)['dead']
    check(n + 'punch during stop accumulates pending damage', pend >= 3 and alive, dict(mode=mode, pending=pend, dead=not alive))
    step(h, 200)   # 等時停結束
    check(n + 'pending damage resolves when time resumes', target(h)['dead'], target(h))
    check(n + 'timeStopT cleared', gstate(h)['timeStop'] == 0, gstate(h))
    normal_after(h, 'time', n + 'time stop')

    # --- 時停 CD：600 幀內再按 X 不會再次時停 ---
    press(h, 'attack', 3); release(h); step(h, 6)
    check(n + 'time stop has a cooldown (falls back to punch)', gstate(h)['timeStop'] == 0 and h.ev("()=>KB.player.abilityData.mode") == 'punch', gstate(h)['timeStop'])

    # --- ↓+X 慢動作 ---
    h.goto(3, 9, ability='time'); h.spawn('waddledee', 8, 9, d=1)
    press(h, 'down', 4); press(h, 'down,attack', 3); release(h); step(h, 4)
    check(n + 'down+X sets slowMoT', gstate(h)['slowMo'] > 180, gstate(h)['slowMo'])
    sx0 = target(h)['x']; step(h, 60); slow = abs(target(h)['x'] - sx0)
    check(n + 'enemy moves slower in slow-mo', slow < base * 0.75, dict(slow=slow, base=base))
    step(h, 260)
    check(n + 'slowMoT cleared', gstate(h)['slowMo'] == 0, gstate(h)['slowMo'])
    normal_after(h, 'time', n + 'slow-mo')

    # --- ↑+X 加速 ---
    h.goto(3, 9, ability='time')
    px0 = gstate(h)['x']; press(h, 'right', 60); release(h)
    walkDist = gstate(h)['x'] - px0
    h.goto(3, 9, ability='time')
    press(h, 'up', 3); press(h, 'up,attack', 3); release(h); step(h, 2)
    px1 = gstate(h)['x']; press(h, 'right', 60); release(h)
    hasteDist = gstate(h)['x'] - px1
    check(n + 'up+X haste makes kirby faster', hasteDist > walkDist * 1.25, dict(walk=round(walkDist, 1), haste=round(hasteDist, 1)))
    step(h, 140)
    check(n + 'haste ticker gone after 120f', all(t != 'magic_haste' for t in magic_ents(h)), magic_ents(h))
    normal_after(h, 'time', n + 'haste')

    # --- fix5：加速只放大速度上限，不能把卡比推出地圖 / 穿牆 ---
    #     測試地圖 col 34 rows 6~9 是一道牆；從 col 30 一路往右加速應該被牆擋下。
    h.goto(30, 9, ability='time')
    press(h, 'up', 3); press(h, 'up,attack', 3); release(h); step(h, 2)
    press(h, 'right', 200); release(h); step(h, 4)
    g = gstate(h)
    pw = h.ev("()=>KB.game.map.pw")
    check(n + 'haste stays inside the room', 0 <= g['x'] <= pw - 14, dict(x=g['x'], pw=pw))
    check(n + 'haste still collides with walls', g['x'] < 34 * 16, dict(x=g['x'], wall=34 * 16))
    step(h, 200)
    normal_after(h, 'time', n + 'haste wall')

    # --- 空中 X 回溯 ---
    h.goto(3, 9, ability='time')
    give(h, 'time')                      # 走 onGet 讓位置歷史從頭記錄
    press(h, 'right', 70); release(h)
    before = gstate(h)['x']
    h.ev("([k,n])=>__kb.tap(k,n)", ['jump', 2]); step(h, 8)
    press(h, 'attack', 3); release(h); step(h, 4)
    after = gstate(h)['x']
    check(n + 'air X rewinds kirby backwards', after < before - 20, dict(before=before, after=after))
    step(h, 60)
    normal_after(h, 'time', n + 'rewind')


# ---------------------------------------------------------------------------
# 3. gravity 重力
# ---------------------------------------------------------------------------
def phase_gravity(h):
    n = 'gravity: '
    # --- X 黑洞 ---
    h.goto(3, 9, ability='gravity'); spawn_dummy(h, 9)
    h.ev("()=>{KB.player.dir=1;}")
    press(h, 'attack', 3); release(h); step(h, 10)
    holes = h.ev("()=>KB.game.entities.filter(e=>!e.dead&&e.name==='blackhole').length")
    check(n + 'X spawns a black hole', holes == 1, holes)
    ex0 = target(h)['cx']
    step(h, 40)
    ex1 = target(h)['cx']
    check(n + 'black hole pulls the enemy in', abs(ex1 - ex0) > 4, dict(cx0=ex0, cx1=ex1))
    step(h, 90)
    check(n + 'black hole explodes and kills waddledee', killed(h), target(h))
    check(n + 'black hole removed after 90f', h.ev("()=>KB.game.entities.filter(e=>!e.dead&&e.name==='blackhole').length") == 0, '')
    normal_after(h, 'gravity', n + 'black hole')

    # --- ↓+X 反重力 ---
    h.goto(3, 9, ability='gravity'); spawn_dummy(h, 6)
    ey0 = target(h)['y']
    press(h, 'down', 4); press(h, 'down,attack', 3); release(h); step(h, 24)
    ey1 = target(h)['y']
    check(n + 'down+X lifts enemies off the ground', ey1 < ey0 - 8, dict(y0=ey0, y1=ey1))
    step(h, 150)
    check(n + 'lifted enemy falls back down', target(h)['y'] >= ey1, target(h))
    normal_after(h, 'gravity', n + 'anti-gravity')

    # --- 空中 X 隕石 ---
    h.goto(3, 9, ability='gravity'); spawn_dummy(h, 6)
    h.ev("()=>{KB.player.dir=1;}")
    h.ev("([k,n])=>__kb.tap(k,n)", ['jump', 2]); step(h, 6)
    press(h, 'attack', 3); release(h); step(h, 6)
    mets = len([s for s in h.spawned() if s['spr'] == 'proj_meteor'])
    step(h, 110)
    mets = max(mets, len([s for s in h.spawned() if s['spr'] == 'proj_meteor']))
    check(n + 'air X drops 3 meteors', mets >= 3, mets)
    check(n + 'meteor hits kill waddledee', killed(h), target(h))
    normal_after(h, 'gravity', n + 'meteor')

    # --- ↑+X 浮空（重力翻轉簡化版）---
    h.goto(3, 9, ability='gravity')
    y0 = gstate(h)['y']
    press(h, 'up', 3); press(h, 'up,attack', 3); release(h); step(h, 60)
    y1 = gstate(h)['y']
    check(n + 'up+X floats kirby upwards', y1 < y0 - 24, dict(y0=y0, y1=y1))
    press(h, 'down', 40); release(h)
    y2 = gstate(h)['y']
    check(n + 'down key descends while floating', y2 > y1, dict(y1=y1, y2=y2))
    step(h, 260)
    g = gstate(h)
    check(n + 'float ends, gravity restored, kirby lands', g['grav'] == g['phys'] and g['y'] > y1, g)
    check(n + 'float ticker gone', all(t != 'magic_flip' for t in magic_ents(h)), magic_ents(h))
    normal_after(h, 'gravity', n + 'float')

    # --- 蓄力必殺：奇點 ---
    h.goto(3, 9, ability='gravity'); spawn_dummy(h, 9)
    press(h, 'attack', 80); release(h); step(h, 30)
    check(n + 'hold 60f -> singularity', h.ev("()=>KB.player.abilityData.mode") == 'singularity', h.ev("()=>KB.player.abilityData.mode"))
    step(h, 140)
    check(n + 'singularity kills waddledee', killed(h), target(h))
    normal_after(h, 'gravity', n + 'singularity')
    check(n + 'no leftover magic entities', magic_ents(h) == [], magic_ents(h))


# ---------------------------------------------------------------------------
# 4. clone 分身
# ---------------------------------------------------------------------------
def phase_clone(h):
    n = 'clone: '
    h.goto(3, 9); give(h, 'clone')
    step(h, 10)
    al = allies(h)
    check(n + 'onGet spawns 2 mini kirbies', len(al) == 2, al)
    px = gstate(h)['x']
    press(h, 'right', 40); release(h); step(h, 10)
    al = allies(h)
    check(n + 'clones follow behind kirby', len(al) == 2 and all(a['x'] < gstate(h)['x'] + 2 for a in al), dict(px=gstate(h)['x'], allies=al))

    # --- 分身自動射擊 ---
    h.goto(3, 9); give(h, 'clone'); spawn_dummy(h, 6)
    step(h, 90)
    stars = [s for s in h.spawned() if s['spr'] == 'proj_ministar']
    check(n + 'clones auto-fire mini stars', len(stars) >= 1, len(stars))

    # --- X 全員吐星 ---
    h.goto(3, 9); give(h, 'clone'); spawn_dummy(h, 8)
    h.ev("()=>{KB.player.dir=1;}")
    n0 = len([s for s in h.spawned() if s['spr'] == 'proj_ministar'])
    press(h, 'attack', 3); release(h); step(h, 8)
    n1 = len([s for s in h.spawned() if s['spr'] == 'proj_ministar'])
    check(n + 'X fires 3 stars (kirby + 2 clones)', n1 - n0 >= 3, dict(before=n0, after=n1))
    step(h, 60)
    check(n + 'X stars kill waddledee', killed(h), target(h))
    normal_after(h, 'clone', n + 'X stars')

    # --- ↓+X 交換位置 ---
    h.goto(3, 9); give(h, 'clone')
    press(h, 'right', 40); release(h); step(h, 6)
    bx = gstate(h)['x']
    press(h, 'down', 4); press(h, 'down,attack', 3); release(h); step(h, 3)
    ax = gstate(h)['x']
    check(n + 'down+X swaps places with a clone', abs(ax - bx) > 10, dict(before=bx, after=ax))
    step(h, 40)
    normal_after(h, 'clone', n + 'swap')

    # --- 空中 X 分身墊腳 ---
    h.goto(3, 9); give(h, 'clone')
    press(h, 'jump', 14); release(h); step(h, 2)
    vy0 = gstate(h)['vy']
    press(h, 'attack', 3); release(h); step(h, 2)
    vy1 = gstate(h)['vy']
    check(n + 'air X gives a second jump (vy goes up)', vy1 < vy0 - 1.5, dict(vy0=vy0, vy1=vy1))
    step(h, 80)
    normal_after(h, 'clone', n + 'clone step')

    # --- fix5：空中連按 X 不能無限墊腳（每次滯空只能 1 次）---
    h.goto(3, 9); give(h, 'clone')
    y0 = gstate(h)['y']
    press(h, 'jump', 14); release(h); step(h, 2)
    minY = y0
    for _ in range(16):                       # 機器人式連按：每 8 幀敲一次 X
        press(h, 'attack', 2); release(h); step(h, 6)
        minY = min(minY, gstate(h)['y'])
    check(n + 'air X spam cannot climb forever', minY > y0 - 120, dict(y0=y0, minY=minY))
    step(h, 180)
    g = gstate(h)
    check(n + 'kirby comes back down after the spam', g['y'] >= y0 - 4, g)

    # --- fix5：落地之後可以再墊一次 ---
    press(h, 'jump', 14); release(h); step(h, 2)
    vy0 = gstate(h)['vy']
    press(h, 'attack', 3); release(h); step(h, 2)
    vy1 = gstate(h)['vy']
    check(n + 'landing re-arms the clone step', vy1 < vy0 - 1.5, dict(vy0=vy0, vy1=vy1))
    step(h, 120)
    normal_after(h, 'clone', n + 'clone step reset')

    # --- 蓄力必殺：百裂分身 ---
    h.goto(3, 9); give(h, 'clone'); spawn_dummy(h, 8)
    press(h, 'attack', 80); release(h); step(h, 20)
    check(n + 'hold 60f -> rush ultimate', h.ev("()=>KB.player.abilityData.mode") == 'rush', h.ev("()=>KB.player.abilityData.mode"))
    step(h, 100)
    check(n + 'rush kills waddledee', killed(h), target(h))
    normal_after(h, 'clone', n + 'rush')

    # --- 失去能力 → 分身消失 ---
    h.ev("()=>KB.player.dropAbility(false)")
    step(h, 4)
    check(n + 'onLose removes the clones', allies(h) == [], allies(h))
    check(n + 'no leftover magic entities', magic_ents(h) == [], magic_ents(h))


# ---------------------------------------------------------------------------
# 5. 魔法系敵人
# ---------------------------------------------------------------------------
def phase_enemies(h):
    for key, ab in MAGIC_ENEMIES.items():
        n = f'{key}: '
        fly = key == 'gravitron'
        h.goto(3, 9, immune=True)
        e = h.spawn(key, 9 if not fly else 9, 9 if not fly else 7, d=-1)
        S = h.run(40, 5)
        last = S[-1]['e']
        if fly:
            ok = not last['dead'] and not last['inSolid'] and last['y'] + last['h'] < 160
        else:
            ok = not last['dead'] and not last['inSolid'] and last['onGround']
        check(n + 'spawns correctly', ok, dict(x=last['x'], y=last['y'], onGround=last['onGround'], inSolid=last['inSolid']))

        # 特色行為
        S = h.run(220, 5)
        if key == 'wizzle':
            fb = [s for s in h.spawned() if s['spr'] == 'proj_magefire' and s['owner'] == 'enemy']
            blinks = h.ev("()=>__te? (__te.blinks|0) : 0")
            check(n + 'throws fireballs', len(fb) >= 1, len(fb))
            check(n + 'teleports at least once', blinks >= 1, blinks)
        elif key == 'tiktok':
            slowed = h.ev("()=>__te? (__te.slowP|0) : -1")
            attacked = any(s['e']['spr'] == 'tiktok_attack' for s in S)
            check(n + 'opens a time field near kirby', attacked, dict(slowP=slowed))
            # 時間場拖慢卡比：比較同樣按右 40 幀的位移
            h.goto(3, 9, immune=True)
            x0 = gstate(h)['x']; press(h, 'right', 40); release(h); free = gstate(h)['x'] - x0
            h.goto(3, 9, immune=True); h.spawn(key, 6, 9, d=-1)
            h.ev("()=>{__te.cool=0;}")
            h.run(60, 10)
            x1 = gstate(h)['x']; press(h, 'right', 40); release(h); slow = gstate(h)['x'] - x1
            check(n + 'time field slows kirby down', slow < free * 0.85, dict(free=round(free, 1), slowed=round(slow, 1)))
        elif key == 'gravitron':
            check(n + 'hovers without gravity', all(abs(s['e']['vy']) <= 1.6 for s in S), '')
            h.goto(3, 9, immune=True); h.spawn(key, 8, 7, d=-1)
            h.ev("()=>{__te.cool=0;}")
            px0 = gstate(h)['x']
            step(h, 90)
            px1 = gstate(h)['x']
            check(n + 'pulls kirby towards itself', px1 > px0 + 2, dict(x0=px0, x1=px1))
        elif key == 'mimi':
            # 模仿：卡比往右走時，Mimi 也往右走（靜止時它也靜止）
            h.goto(3, 9, immune=True); h.spawn(key, 9, 9, d=-1)
            h.run(30, 10)
            x0 = target(h)['x']
            press(h, 'right', 60); release(h)
            x1 = target(h)['x']
            lunged = h.ev("()=>__te && __te.state === 'lunge'")
            check(n + 'mimics kirby movement (or lunges)', x1 > x0 + 4 or lunged, dict(x0=x0, x1=x1, lunged=lunged))

        # 吸入 → 取得對應能力
        h.goto(3, 9, immune=True)
        h.spawn(key, 6, 9 if key != 'gravitron' else 8, d=-1)
        h.ev("()=>{KB.player.dir=1;}")
        press(h, 'attack', 70)
        mouth = h.player()['mouth']
        release(h)
        got = mouth and mouth.get('ability')
        check(n + f'inhaled -> ability {ab}', got == ab, mouth)
        press(h, 'down', 3); release(h); step(h, 20)
        check(n + 'swallow gives the ability', h.player()['ability'] == ab, h.player()['ability'])

        # 被劍打會死
        h.goto(3, 9, ability='sword', immune=True)
        h.spawn(key, 5, 9 if key != 'gravitron' else 8, d=-1)
        h.ev("()=>{KB.player.dir=1;}")
        for _ in range(8):
            h.ev("([k,n])=>__kb.tap(k,n)", ['attack', 2]); step(h, 16)
        t = target(h)
        check(n + 'dies to sword attacks', t['dead'] or t['hp'] <= 0, t)

        if h.shots:
            h.goto(3, 9, immune=True); h.spawn(key, 8, 9 if key != 'gravitron' else 7, d=-1)
            h.run(60, 10)
            h.save_shot('magic_enemy_' + key)


# ---------------------------------------------------------------------------
# 6. 註冊 / 資料完整性
# ---------------------------------------------------------------------------
def phase_registry(h):
    n = 'registry: '
    info = h.ev("(keys)=>keys.map(k=>{const d=KB.ABILITIES[k]||{};return {k, has:!!KB.ABILITIES[k], inKeys:(KB.ABILITY_KEYS||[]).indexOf(k)>=0, "
                "name:KB.ABILITY_NAMES[k]||null, hud:KB.ABILITY_HUD[k]||null, moves:(d.moves||[]).length, desc:!!d.desc, color:!!d.color, "
                "hat:KB.has(d.hat||('hat_'+k)), icon:KB.has('ui_ability_'+k), mini:KB.has('ui_ability_'+k+'_mini'), anim:KB.has('kirby_attack_'+k)};})", MAGIC_KEYS)
    for i in info:
        ok = i['has'] and i['inKeys'] and i['name'] and i['hud'] and i['moves'] >= 4 and i['desc'] and i['color'] and i['hat'] and i['icon'] and i['mini'] and i['anim']
        check(n + i['k'] + ' registered with moves / desc / sprites', ok, i)
    es = h.ev("(keys)=>keys.map(k=>({k, has:!!KB.ENEMIES[k], walk:KB.has(k+'_walk'), attack:KB.has(k+'_attack')}))", list(MAGIC_ENEMIES))
    for e in es:
        check(n + e['k'] + ' enemy registered with walk / attack sprites', e['has'] and e['walk'] and e['attack'], e)


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    ET.SHOTS = SHOTS
    phases = [('registry', phase_registry), ('mage', phase_mage), ('time', phase_time),
              ('gravity', phase_gravity), ('clone', phase_clone), ('enemies', phase_enemies)]
    only = [k for k in a.only.split(',') if k]
    if only:
        phases = [p for p in phases if p[0] in only]
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type in ('error', 'warning') else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate(TEST_LEVEL)
        pg.evaluate(HOOK_JS)
        h = Harness(pg, a.shots, a.hitbox)
        if a.shots:
            SHOTS.mkdir(parents=True, exist_ok=True)
        for label, fn in phases:
            print('-' * 8, label)
            n0 = len(logs)
            try:
                fn(h)
            except Exception as ex:
                check(f'{label}: raised', False, repr(ex))
            errs = [l for l in logs[n0:] if 'pageerror' in l or 'console.error' in l]
            check(f'{label}: no page errors', not errs, errs[:3])
        missing = pg.evaluate("()=>__kb.missing()")
        b.close()
    print('---')
    results = ET.results
    fails = [r for r in results if not r[1]]
    print(f'{len(results) - len(fails)}/{len(results)} passed')
    if fails:
        print('FAILED:')
        for f in fails:
            print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    if missing:
        print('MISSING SPRITES:', ', '.join(missing))
    warn = [l for l in logs if 'missing sprite' not in l]
    if warn:
        print('BROWSER LOG:')
        print('\n'.join(warn[:20]))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
