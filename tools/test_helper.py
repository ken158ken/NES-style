# -*- coding: utf-8 -*-
"""
夥伴系統自動驗證（Round 6）：KB.Helper —— 長按 SELECT 把能力變成 AI 夥伴。
沿用 tools/enemy_test.py 的測試關卡與 Harness（注入 etest 關卡 → 生成敵人 → 模擬按鍵 → 取樣）。

驗證項目：
  1. 生成      spawn() 後夥伴存在（type 'ally' / name 'helper' / hp 4）、卡比 ability 變 null 且「不掉能力星」
  2. 跟隨      掉隊後距離收斂（> 40px 追、< 24px 停）；越過坑洞；> 200px 或卡住 90 幀瞬移
  3. 攻擊      sword / fire / gunner / mage 四種能力各自能打死 waddledee，判定框 owner 'player' 且標記 fromHelper
  4. 受傷      HP 歸零 → 變回能力星掉在原地（卡比可撿回）；受傷 60 幀無敵
  5. 吸回      ① 卡比吸入夥伴 → mouth.ability 正確、吞下後能力回到卡比
               ② 已有夥伴時再長按 SELECT → 夥伴變回能力星飛向卡比 → 卡比重新取得能力
  6. 長按      沒有夥伴時長按 SELECT 45 幀 → 生成夥伴（player.js 的鉤子尚未接上時走 KB.Helper.pollSelect 相容路徑）
  7. 全程沒有 pageerror / console.error / 缺精靈

用法：python tools/test_helper.py [--only spawn,follow,attack,damage,recall,select] [--shots] [-v]
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
SHOTS = ROOT / 'shots' / 'agent_helper'
ATTACK_KEYS = ['sword', 'fire', 'gunner', 'mage']


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
def step(h, n):
    h.ev("(n)=>__kb.step(n)", n)


def press(h, keys, frames):
    h.press(keys); step(h, frames)


def release(h, frames=1):
    h.release(); step(h, frames)


def spawn_helper(h, key):
    """走正規流程：卡比拿著 key → KB.Helper.spawn(p)"""
    h.ev("(k)=>{const p=KB.player; if(p.ability!==k){p.ability=k; p.abilityData={};} KB.Helper.clear();}", key)
    r = h.ev("()=>KB.Helper.spawn(KB.player)")
    step(h, 2)
    return r


def hs(h):
    """夥伴狀態"""
    return h.ev("""()=>{const H=KB.Helper,e=H.get();
      return {exists:H.exists(), inList: !!(e&&KB.game.entities.indexOf(e)>=0),
        ability:e?e.ability:null, hp:e?e.hp:null, maxHp:e?e.maxHp:null, type:e?e.type:null, name:e?e.name:null,
        owner:e?e.owner:null, inhalable:e?!!e.inhalable:null, state:e?e.state:null, invuln:e?e.invuln|0:null,
        cx:e?+e.cx.toFixed(1):null, cy:e?+e.cy.toFixed(1):null, onGround:e?!!e.onGround:null};}""")


def ps(h):
    """卡比狀態"""
    return h.ev("()=>{const p=KB.player;return {ability:p.ability, mouth:p.mouth, state:p.state, hp:p.hp, "
                "cx:+p.cx.toFixed(1), cy:+p.cy.toFixed(1), dir:p.dir};}")


def dist(h):
    return h.ev("()=>{const e=KB.Helper.get(),p=KB.player; if(!e)return -1; "
                "return +Math.hypot(e.cx-p.cx,e.cy-p.cy).toFixed(1);}")


def stars(h, key=None):
    return h.ev("(k)=>KB.game.entities.filter(e=>!e.dead&&e.name==='abilitystar'&&(!k||e.ability===k))"
                ".map(e=>({ability:e.ability,cx:+e.cx.toFixed(1),cy:+e.cy.toFixed(1)}))", key)


def ret_stars(h):
    return h.ev("()=>KB.game.entities.filter(e=>!e.dead&&e.name==='helper_returnstar').map(e=>e.key)")


def install_recorder(h):
    """只裝一次：記錄所有「夥伴招式產生」的判定框 / 投射物（短命的招式也抓得到）"""
    h.ev("""()=>{ if(window.__hbInstalled) return; window.__hbInstalled=true; window.__hb=[];
      const os=KB.spawn;
      KB.spawn=e=>{ if(e&&e.fromHelper&&(e.type==='hitbox'||e.type==='proj'))
        __hb.push({type:e.type, owner:e.owner, dmg:e.dmg, cls:e.constructor.name}); return os(e); };}""")


def helper_boxes(h, reset=False):
    """夥伴招式產生、且被視為玩家方的判定框 / 投射物"""
    if reset:
        h.ev("()=>{window.__hb=[];}")
        return []
    return h.ev("()=>window.__hb||[]")


def teleport_player(h, x, y=9):
    h.ev("([x,y])=>{const p=KB.player,T=KB.TILE; p.x=x*T+1; p.bottom=y*T+T; p.vx=0; p.vy=0;}", [x, y])


def target(h):
    return h.ev("()=>{const e=__te; return e?{hp:e.hp,dead:!!e.dead,cx:+e.cx.toFixed(1)}:null;}")


def dummy(h, x, y=9, t='waddledee'):
    e = h.spawn(t, x, y, d=-1)
    h.ev("()=>{const e=__te; if(e){e.speed=0; e.vx=0; e.turnAtEdge=false; e.turnAtWall=false; e.active=true;}}")
    return e


def shot(h, name):
    if not h.shots:
        return
    data = h.ev("()=>__t.shot()")
    if not data:
        return
    SHOTS.mkdir(parents=True, exist_ok=True)
    (SHOTS / ('test_' + name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))


# ---------------------------------------------------------------------------
# 1. 生成
# ---------------------------------------------------------------------------
def phase_spawn(h):
    n = 'spawn: '
    h.goto(3, 9, ability='sword')
    p0 = ps(h)
    check(n + 'kirby starts with sword', p0['ability'] == 'sword', p0)
    ok = spawn_helper(h, 'sword')
    check(n + 'KB.Helper.spawn() returns true', ok is True, ok)
    e = hs(h)
    check(n + 'helper entity exists in game.entities', e['exists'] and e['inList'], e)
    check(n + "helper type 'ally' / name 'helper' / owner 'player'",
          e['type'] == 'ally' and e['name'] == 'helper' and e['owner'] == 'player', e)
    check(n + 'helper inherits the ability key', e['ability'] == 'sword', e)
    check(n + 'helper hp = 4', e['hp'] == 4 and e['maxHp'] == 4, e)
    check(n + 'helper is inhalable', e['inhalable'] is True, e)
    p = ps(h)
    check(n + 'kirby lost the ability (p.ability === null)', p['ability'] is None, p)
    check(n + 'no ability star dropped', stars(h) == [], stars(h))
    # 夥伴會跟著卡比站在地上
    step(h, 40)
    e = hs(h)
    check(n + 'helper stands on ground near kirby', e['onGround'] and dist(h) < 60, dict(e, dist=dist(h)))
    check(n + 'helper sprite registered', h.ev("()=>KB.has('helper_idle')&&KB.has('helper_walk')&&"
                                               "KB.has('helper_jump')&&KB.has('helper_attack')&&KB.has('helper_hurt')"), True)
    shot(h, 'spawn')
    # 沒有能力時 spawn 失敗
    h.goto(3, 9)
    h.ev("()=>KB.Helper.clear()")
    r = h.ev("()=>KB.Helper.spawn(KB.player)")
    check(n + 'spawn() without an ability returns false', r is False, r)
    # 已經有夥伴時再呼叫 spawn → 轉成吸回
    h.goto(3, 9, ability='fire'); spawn_helper(h, 'fire')
    r = h.ev("()=>KB.Helper.spawn(KB.player)")
    step(h, 2)
    check(n + 'spawn() with a helper already out -> recall (returns true)', r is True, r)
    check(n + 'recall turns the helper into a flying ability star', ret_stars(h) == ['fire'] and not hs(h)['exists'],
          dict(ret=ret_stars(h), helper=hs(h)['exists']))


# ---------------------------------------------------------------------------
# 2. 跟隨 AI
# ---------------------------------------------------------------------------
def phase_follow(h):
    n = 'follow: '
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword')
    step(h, 20)
    # --- 卡比往右走，夥伴跟上 ---
    press(h, 'right', 120); release(h); step(h, 40)
    d = dist(h)
    check(n + 'helper catches up while kirby walks right (dist < 60)', 0 <= d < 60, dict(dist=d, helper=hs(h), p=ps(h)))
    # --- 靠太近會停下（< 24px 不再推擠）---
    step(h, 60)
    d2 = dist(h)
    check(n + 'helper stops near kirby (dist >= 8)', d2 >= 8, dict(dist=d2))
    # --- 掉隊 > 200px → 瞬移 ---
    teleport_player(h, 30, 9)
    far = dist(h)
    step(h, 20)
    d3 = dist(h)
    check(n + 'helper teleports back when > 200px away', far > 200 and d3 < 80, dict(before=far, after=d3))
    # --- 越過坑洞（etest 關卡 col 20~23 是坑）---
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword')
    teleport_player(h, 18, 9); step(h, 10)
    h.ev("()=>{const e=KB.Helper.get(); if(e){e.cx=18*16+8; e.bottom=10*16;}}")
    teleport_player(h, 27, 9)
    step(h, 150)
    e = hs(h)
    crossed = e['exists'] and e['cx'] > 24 * 16
    check(n + 'helper crosses the pit (col 20~23) to reach kirby', crossed, dict(helper=e, dist=dist(h)))
    shot(h, 'follow_pit')
    # --- 卡比在上方的平台（col 56~59 row 8）：跳 + 漂浮追上去 ---
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword')
    teleport_player(h, 57, 9); step(h, 20)
    h.ev("()=>{const e=KB.Helper.get(); e.cx=57*16+8; e.bottom=10*16;}")
    teleport_player(h, 57, 7)
    step(h, 120)
    e = hs(h)
    pl = ps(h)
    check(n + 'helper jumps / floats up to kirby on the platform',
          e['exists'] and e['cy'] < pl['cy'] + 20 and dist(h) < 60, dict(helper=e, p=pl, dist=dist(h)))
    # --- 4 格高的牆（col 34）過不去 → 卡住 90 幀後瞬移 ---
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword')
    teleport_player(h, 31, 9); step(h, 20)
    teleport_player(h, 37, 9)
    step(h, 160)
    e = hs(h)
    check(n + 'helper stuck at the 4-tile wall -> teleports to kirby', e['exists'] and dist(h) < 80,
          dict(helper=e, dist=dist(h)))
    # --- 夥伴不會傷害卡比 ---
    hp0 = ps(h)['hp']
    step(h, 60)
    check(n + 'helper never hurts kirby', ps(h)['hp'] == hp0, dict(hp0=hp0, hp=ps(h)['hp']))


# ---------------------------------------------------------------------------
# 3. 攻擊（sword / fire / gunner / mage）
# ---------------------------------------------------------------------------
def phase_attack(h):
    for key in ATTACK_KEYS:
        n = 'attack %s: ' % key
        if not h.ev("(k)=>!!KB.ABILITIES[k]", key):
            check(n + 'ability exists', False, 'KB.ABILITIES[%s] missing' % key)
            continue
        h.goto(3, 9, ability=key)
        install_recorder(h)
        h.ev("()=>{KB.player.invuln=1e9;}")          # 卡比不受傷，只看夥伴的戰果
        spawn_helper(h, key)
        step(h, 10)
        helper_boxes(h, reset=True)
        dummy(h, 7)                                   # 夥伴右邊 ~60px
        killed = False
        for _ in range(24):
            step(h, 10)
            t = target(h)
            if t is None or t['dead'] or t['hp'] < 2:
                killed = True
                break
        boxes = helper_boxes(h)
        check(n + 'helper kills waddledee with its ability', killed, dict(target=target(h), helper=hs(h)))
        owners = set(b['owner'] for b in boxes)
        check(n + "helper hitboxes are owner 'player' (collisions work unchanged)",
              bool(boxes) and owners == {'player'}, dict(n=len(boxes), owners=sorted(owners)))
        check(n + 'helper-made entities are tagged fromHelper', bool(boxes), len(boxes))
        e = hs(h)
        check(n + 'helper survives and keeps the ability', e['exists'] and e['ability'] == key, e)
        shot(h, 'attack_' + key)
    # --- 攻擊冷卻：90 幀最多 1 次 ---
    n = 'attack cd: '
    h.goto(3, 9, ability='sword')
    h.ev("()=>{KB.player.invuln=1e9;}")
    spawn_helper(h, 'sword')
    h.ev("()=>{const e=KB.Helper.get(); e.atkCool=0;}")
    dummy(h, 7)
    h.ev("()=>{const e=__te; if(e){e.hp=999; e.maxHp=999;}}")
    starts = h.ev("""()=>{const e=KB.Helper.get(); let n=0, last=null;
      for(let i=0;i<180;i++){ __kb.step(1); if(e.state==='attack'&&last!=='attack') n++; last=e.state; }
      return n;}""")
    check(n + 'at most 2 attacks in 180 frames (cd 90)', 1 <= starts <= 2, starts)


# ---------------------------------------------------------------------------
# 4. 受傷 / 死亡
# ---------------------------------------------------------------------------
def phase_damage(h):
    n = 'damage: '
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword'); step(h, 10)
    r = h.ev("()=>KB.Helper.get().hurt(1,null)")
    check(n + 'helper.hurt() reduces hp', r is True and hs(h)['hp'] == 3, hs(h))
    check(n + 'helper gets 60 frames of invulnerability', hs(h)['invuln'] >= 55, hs(h))
    r2 = h.ev("()=>KB.Helper.get().hurt(1,null)")
    check(n + 'second hit within invuln is ignored', r2 is False and hs(h)['hp'] == 3, dict(r=r2, hp=hs(h)['hp']))
    # --- 敵人接觸會扣血 ---
    h.goto(3, 9, ability='sword')
    h.ev("()=>{KB.player.invuln=1e9;}")
    spawn_helper(h, 'sword'); step(h, 6)
    h.ev("()=>{const e=KB.Helper.get(); e.ability=null;}")     # 拿掉招式，只測接觸傷害
    hp0 = hs(h)['hp']
    h.spawn('waddledee', 5, 9, d=-1)
    h.ev("()=>{const e=__te,g=KB.Helper.get(); e.active=true; e.speed=0; e.vx=0; e.cx=g.cx; e.bottom=g.bottom;}")
    step(h, 4)
    check(n + 'touching an enemy costs 1 hp', hs(h)['hp'] == hp0 - 1, dict(hp0=hp0, hp=hs(h)['hp']))
    # --- 敵彈會扣血 ---
    h.goto(3, 9, ability='sword')
    spawn_helper(h, 'sword'); step(h, 6)
    hp0 = hs(h)['hp']
    h.ev("()=>{const g=KB.Helper.get(); KB.shoot({spr:'proj_star',x:g.cx,y:g.cy,vx:0,vy:0,dmg:1,owner:'enemy',life:30,w:8,h:8,grav:0,solid:false});}")
    step(h, 3)
    check(n + 'enemy projectile costs 1 hp', hs(h)['hp'] == hp0 - 1, dict(hp0=hp0, hp=hs(h)['hp']))
    # --- HP 0 → 能力星掉在原地 ---
    h.goto(3, 9, ability='beam'); spawn_helper(h, 'beam'); step(h, 20)
    at = h.ev("()=>{const e=KB.Helper.get();return {cx:+e.cx.toFixed(1),cy:+e.cy.toFixed(1)};}")
    h.ev("()=>{const e=KB.Helper.get(); e.invuln=0; e.hurt(4,null);}")
    step(h, 2)
    st = stars(h, 'beam')
    check(n + 'hp 0 -> helper dies', not hs(h)['exists'], hs(h))
    check(n + 'hp 0 -> drops an ability star on the spot', len(st) == 1 and abs(st[0]['cx'] - at['cx']) < 24,
          dict(star=st, at=at))
    # 卡比可以撿回
    h.ev("()=>{const s=KB.game.entities.find(e=>!e.dead&&e.name==='abilitystar'); const p=KB.player; s.graceT=0; s.cx=p.cx; s.cy=p.cy;}")
    step(h, 4)
    check(n + 'kirby can pick the star back up', ps(h)['ability'] == 'beam', ps(h))
    shot(h, 'death_star')


# ---------------------------------------------------------------------------
# 5. 吸回（吸入 / 長按 SELECT）
# ---------------------------------------------------------------------------
def phase_recall(h):
    n = 'inhale: '
    h.goto(3, 9, ability='cutter'); spawn_helper(h, 'cutter'); step(h, 20)
    # 把夥伴放在卡比正前方，按住攻擊吸入
    h.ev("()=>{const e=KB.Helper.get(),p=KB.player; p.dir=1; e.cx=p.cx+26; e.bottom=p.bottom; e.vx=0; e.atkCool=600;}")
    got = None
    h.press('attack')
    for _ in range(60):
        step(h, 1)
        m = h.ev("()=>KB.player.mouth")
        if m:
            got = m
            break
    release(h)
    check(n + 'kirby can inhale the helper', got is not None and got.get('ability') == 'cutter', got)
    check(n + 'helper is consumed by the inhale', not hs(h)['exists'], hs(h))
    h.ev("()=>{KB.player.swallow();}")
    step(h, 20)
    check(n + 'swallowing gives the ability back', ps(h)['ability'] == 'cutter', ps(h))

    n = 'recall: '
    h.goto(3, 9, ability='ice'); spawn_helper(h, 'ice'); step(h, 20)
    r = h.ev("()=>KB.Helper.recall(KB.player)")
    step(h, 2)
    check(n + 'recall() returns true', r is True, r)
    check(n + 'helper is gone, a return star is flying', not hs(h)['exists'] and ret_stars(h) == ['ice'],
          dict(helper=hs(h)['exists'], ret=ret_stars(h)))
    shot(h, 'recall_star')
    step(h, 90)
    check(n + 'the star reaches kirby and gives the ability back', ps(h)['ability'] == 'ice', ps(h))
    check(n + 'return star cleaned up', ret_stars(h) == [], ret_stars(h))
    # 沒有夥伴時 recall 失敗
    h.ev("()=>KB.Helper.clear()")
    check(n + 'recall() without a helper returns false', h.ev("()=>KB.Helper.recall(KB.player)") is False, True)


# ---------------------------------------------------------------------------
# 6. 長按 SELECT（相容路徑：player.js 的鉤子尚未接上也能用）
# ---------------------------------------------------------------------------
def phase_select(h):
    n = 'select: '
    h.goto(3, 9, ability='hammer')
    h.ev("()=>KB.Helper.clear()")
    press(h, 'select', 50)
    release(h); step(h, 4)
    e = hs(h)
    check(n + 'holding SELECT 45f spawns the helper', e['exists'] and e['ability'] == 'hammer', dict(e=e, p=ps(h)))
    check(n + 'kirby has no ability and no ability star is left over',
          ps(h)['ability'] is None and stars(h) == [], dict(p=ps(h), stars=stars(h)))
    shot(h, 'select_spawn')
    # --- 再長按一次 → 吸回（按滿 45 幀當下觸發）---
    step(h, 30)
    press(h, 'select', 46)
    check(n + 'holding SELECT again recalls the helper', not hs(h)['exists'] and ret_stars(h) == ['hammer'],
          dict(helper=hs(h)['exists'], ret=ret_stars(h)))
    release(h); step(h, 90)
    check(n + 'kirby gets the ability back after the recall', ps(h)['ability'] == 'hammer', ps(h))
    # --- 短按仍是原本的「丟掉能力」行為 ---
    h.goto(3, 9, ability='sword')
    h.ev("()=>KB.Helper.clear()")
    h.ev("([k,n])=>__kb.tap(k,n)", ['select', 2])
    step(h, 10)
    check(n + 'a short SELECT tap still just drops the ability (no helper)',
          not hs(h)['exists'] and ps(h)['ability'] is None and len(stars(h)) == 1,
          dict(helper=hs(h)['exists'], p=ps(h), stars=stars(h)))
    # --- 換房後夥伴會跟上（loadRoom 會清空 entities）---
    n = 'room: '
    h.goto(3, 9, ability='sword'); spawn_helper(h, 'sword'); step(h, 10)
    h.ev("()=>{KB.game.loadRoom(0, 20, 9);}")
    step(h, 6)
    e = hs(h)
    check(n + 'helper follows kirby through a room change', e['exists'] and e['inList'] and dist(h) < 80,
          dict(e=e, dist=dist(h)))
    # --- 卡比死亡 → 夥伴消失 ---
    h.ev("()=>{KB.player.die();}")
    step(h, 6)
    check(n + 'helper disappears when kirby dies', not hs(h)['exists'], hs(h))


PHASES = {
    'spawn': phase_spawn, 'follow': phase_follow, 'attack': phase_attack,
    'damage': phase_damage, 'recall': phase_recall, 'select': phase_select,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    names = [k for k in a.only.split(',') if k] or list(PHASES.keys())
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
        for nm in names:
            fn = PHASES.get(nm)
            if not fn:
                check('unknown phase ' + nm, False)
                continue
            print('-' * 8, nm)
            n0 = len(logs)
            try:
                fn(h)
            except Exception as ex:
                check('%s: raised' % nm, False, repr(ex))
            errs = [l for l in logs[n0:] if 'pageerror' in l or 'console.error' in l]
            check('%s: no page errors' % nm, not errs, errs[:3])
        missing = pg.evaluate("()=>__kb.missing()")
        b.close()
    print('---')
    res = ET.results
    fails = [r for r in res if not r[1]]
    print('%d/%d passed' % (len(res) - len(fails), len(res)))
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
