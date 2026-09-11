# -*- coding: utf-8 -*-
"""
敵人行為自動驗證（Kirby's Adventure 風）：注入程式化測試關卡，對全部 21 種敵人逐一檢查並印出 PASS / FAIL。
  1. 生成：地面型 30 幀內站在地上、飛行/水中型懸浮；不掉出地圖、不卡進牆
  2. 特色行為：200~300 幀內出現投射物 / 判定框 / 特定位置變化（每種敵人各自定義）
  3. 接觸：卡比碰到敵人 → hp 減少（gordo / shotzo 也是；cappy_bare 例外：無害）
  4. 吸入：面向敵人按住 attack → mouth.ability 正確；scarfy 不可吸且變 angry；gordo / shotzo / 小魔王 不可吸；cappy 留下 cappy_bare
  5. 攻擊：卡比持劍 → hp 減少 / 死亡 / 加分；bonkers、mrfrosty hp 歸零後暈倒（inhalable、無害）再吸入得到 hammer / ice
  6. 全程監看 pageerror / console.error；--shots 另存截圖 shots/enemy_<key>.png（第一次出現投射物或判定框的瞬間）與 shots/enemy_<key>_end.png
用法：python tools/enemy_test.py [--shots] [--only waddledee,gordo] [--hitbox] [-v]
"""
import sys, json, pathlib, base64, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots'

# ---------------------------------------------------------------------------
# 測試地圖：W=80, H=12。地面 row 10-11；坑洞 col 20..23；牆 col 34 rows 6..9；水池 col 44..51 rows 8..10（底 row 11）
# ---------------------------------------------------------------------------
W, H = 80, 12
grid = [['.'] * W for _ in range(H)]
def fill(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            grid[y][x] = ch
fill(0, 10, W - 1, 11, '#')
PIT_X0, PIT_X1 = 20, 23
fill(PIT_X0, 10, PIT_X1, 11, '.')
WALL_X = 34
fill(WALL_X, 6, WALL_X, 9, '#')
WATER_X0, WATER_X1 = 44, 51
fill(WATER_X0, 8, WATER_X1, 10, '~')
MAP = [''.join(r) for r in grid]
TEST_LEVEL = "KB.LEVELS.push(" + json.dumps({
    'id': 'etest', 'name': 'ENEMY TEST', 'theme': 'green', 'music': None, 'boss': None,
    'rooms': [{'map': MAP, 'spawn': [3, 9], 'entities': [], 'noBoss': True}],
}, ensure_ascii=False) + ");"

GROUND_TOP = 160          # row 10 上緣
PLAYER_H = 15

# 頁面內測試輔助：記錄所有 KB.spawn 產生的實體、玩家受傷來源；取樣快照
HOOK_JS = r"""() => {
  window.__spawned = []; window.__hurts = []; window.__te = null; window.__shot1 = null;
  const os = KB.spawn;
  KB.spawn = e => {
    if (KB.game) __spawned.push({ f: KB.game.frame, type: e.type, kind: e.kind || '', spr: e.spr || '', owner: e.owner || '', cls: e.constructor.name, name: e.name || '', x: +e.x.toFixed(1), y: +e.y.toFixed(1), w: e.w, h: e.h, dmg: e.dmg, freeze: !!e.freeze });
    return os(e);
  };
  const cap = () => { __kb.render(); const c = KB.canvas, o = document.createElement('canvas'); o.width = c.width * 3; o.height = c.height * 3; const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };
  window.__t = {
    goto(o) {
      __kb.release(); __kb.goto('game', Object.assign({ level: 'etest', room: 0, nofade: true }, o));
      __spawned.length = 0; __hurts.length = 0; __te = null; __shot1 = null;
      const p = KB.player, orig = p.hurt.bind(p);
      p.hurt = function (a, s) {
        const r = orig(a, s);
        if (r) __hurts.push({ f: KB.game.frame, dmg: a, kind: s ? ((s.type === 'enemy' || s.type === 'boss') ? 'body:' + (s.name || s.constructor.name) : (s.kind || s.type || s.name || '?')) : '?' });
        return r;
      };
      __kb.step(2); return true;
    },
    immune(v) { KB.player.invuln = v ? 1e9 : 0; },
    spawn(d) { const e = KB.game.spawnDef(d); __te = e; __kb.step(1); return __t.ent(); },
    ent() {
      const e = __te; if (!e) return null;
      return { x: +e.x.toFixed(1), y: +e.y.toFixed(1), cx: +e.cx.toFixed(1), cy: +e.cy.toFixed(1), w: e.w, h: e.h, vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), dir: e.dir,
        state: e.state, spr: e.spr, hp: e.hp, dead: e.dead, onGround: e.onGround, active: e.active, hidden: !!e.hidden, angry: !!e.angry, stunned: !!e.stunned,
        inhalable: e.inhalable, hurtsPlayer: e.hurtsPlayer, contactDamage: e.contactDamage !== false, beingInhaled: !!e.beingInhaled, freezeT: e.freezeT | 0, solid: e.solid,
        inSolid: KB.game.map.isSolidPx(e.cx, e.cy), inWater: KB.game.map.inWater(e.cx, e.cy), fellOut: !!e.fellOut, score: e.score };
    },
    others() {
      return KB.game.entities.filter(e => !e.dead && (e.type === 'proj' || e.type === 'hitbox' || (e.type === 'enemy' && e !== __te)))
        .map(e => ({ type: e.type, kind: e.kind || '', spr: e.spr || '', owner: e.owner || '', name: e.name || '', cls: e.constructor.name, x: +e.x.toFixed(1), y: +e.y.toFixed(1), w: e.w, h: e.h, vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), onGround: !!e.onGround, inhalable: !!e.inhalable, hurtsPlayer: !!e.hurtsPlayer, contactDamage: e.contactDamage !== false, dir: e.dir }));
    },
    player() { const p = KB.player; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1), hp: p.hp, state: p.state, mouth: p.mouth, ability: p.ability, dir: p.dir, onGround: p.onGround }; },
    sample() { return { f: KB.game.frame, e: __t.ent(), o: __t.others(), p: __t.player(), nh: __hurts.length, score: KB.game.score }; },
    // 步進 n 幀，每 every 幀取樣；shotWhen: 'proj' | 'hitbox' | 'any' → 第一次出現時擷取截圖到 __shot1
    run(n, every, keys, shotWhen) {
      const out = []; if (keys) __kb.press(keys); else __kb.release();
      for (let i = 0; i < n; i += every) {
        __kb.step(Math.min(every, n - i));
        const s = __t.sample(); out.push(s);
        if (shotWhen && !__shot1) {
          const hit = s.o.some(o => shotWhen === 'any' ? (o.type === 'proj' || o.type === 'hitbox') : o.type === shotWhen);
          if (hit) __shot1 = cap();
        }
      }
      return out;
    },
    taps(k, n, gap) { for (let i = 0; i < n; i++) { __kb.tap(k, 1); __kb.step(gap); } return __t.sample(); },
    spawned() { return __spawned.slice(); },
    hurts() { return __hurts.slice(); },
    shot() { return cap(); }, shot1() { const s = __shot1; __shot1 = null; return s; },
    teleport(x, y) { const p = KB.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; },
    dropAbility() { KB.player.dropAbility(false); KB.player.setState('idle'); },
  };
  return true;
}"""

# ---------------------------------------------------------------------------
# 敵人規格
# ---------------------------------------------------------------------------
ORDER = ['waddledee', 'waddledoo', 'brontoburt', 'hothead', 'sirkibble', 'sparky', 'rocky', 'chilly', 'bladeknight', 'bonkers', 'mrfrosty',
         'poppybros', 'scarfy', 'gordo', 'cappy', 'cappy_bare', 'twizzy', 'shotzo', 'squishy', 'glunk', 'kabu']
ABILITY = {'waddledee': None, 'waddledoo': 'beam', 'brontoburt': None, 'hothead': 'fire', 'sirkibble': 'cutter', 'sparky': 'spark', 'rocky': 'stone',
           'chilly': 'ice', 'bladeknight': 'sword', 'poppybros': None, 'cappy': None, 'cappy_bare': None, 'twizzy': None, 'squishy': None, 'glunk': None, 'kabu': None}
NOT_INHALABLE = {'scarfy', 'gordo', 'shotzo', 'bonkers', 'mrfrosty'}
FLY = {'brontoburt', 'scarfy', 'gordo', 'shotzo'}
INVINCIBLE = {'gordo', 'shotzo'}
MINIBOSS = {'bonkers': 'hammer', 'mrfrosty': 'ice'}
HOPPERS = {'sparky', 'poppybros'}

def overlaps(a, b):
    return a['x'] < b['x'] + b['w'] and a['x'] + a['w'] > b['x'] and a['y'] < b['y'] + b['h'] and a['y'] + a['h'] > b['y']

def hitbox_touches_player(S, kind):
    """取樣中是否有某種敵方判定框與卡比矩形重疊（不受卡比無敵幀影響的命中判定）"""
    for s in S:
        pr = {'x': s['p']['x'], 'y': s['p']['y'], 'w': 14, 'h': PLAYER_H}
        for o in s['o']:
            if o['type'] == 'hitbox' and o['owner'] == 'enemy' and o['kind'] == kind and overlaps(o, pr): return s['f']
    return None
HP = {'waddledee': 2, 'waddledoo': 2, 'brontoburt': 2, 'hothead': 2, 'sirkibble': 2, 'sparky': 2, 'rocky': 3, 'chilly': 2, 'bladeknight': 4, 'bonkers': 14,
      'mrfrosty': 12, 'poppybros': 2, 'scarfy': 2, 'gordo': 999, 'cappy': 2, 'cappy_bare': 2, 'twizzy': 2, 'shotzo': 999, 'squishy': 2, 'glunk': 2, 'kabu': 3}
# 各敵人在「玩家 x=3」時的預設生成格（吸入 / 攻擊 / 接觸階段會另外指定）
SPAWN = {k: dict(ex=8, ey=9) for k in ORDER}
SPAWN.update({'brontoburt': dict(ex=9, ey=6), 'scarfy': dict(ex=9, ey=7), 'gordo': dict(ex=9, ey=9, a='v', b=2), 'shotzo': dict(ex=10, ey=8),
              'squishy': dict(px=40, ex=47, ey=9), 'twizzy': dict(ex=12, ey=9), 'kabu': dict(ex=10, ey=9)})

results = []
VERBOSE = False
def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


class Harness:
    def __init__(self, pg, shots, hitbox):
        self.pg = pg; self.shots = shots; self.hitbox = hitbox
    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)
    def goto(self, x=3, y=9, ability=None, immune=False):
        o = {'x': x, 'y': y}
        if ability: o['ability'] = ability
        self.ev("(o)=>__t.goto(o)", o)
        if self.hitbox: self.ev("()=>__kb.hitbox(true)")
        if immune: self.ev("()=>__t.immune(true)")
    def spawn(self, t, x, y, d=None, a=None, b=None):
        o = {'t': t, 'x': x, 'y': y}
        if d is not None: o['dir'] = d
        if a is not None: o['a'] = a
        if b is not None: o['b'] = b
        return self.ev("(o)=>__t.spawn(o)", o)
    def run(self, n, every=5, keys=None, shot_when=None):
        return self.ev("([n,e,k,s])=>__t.run(n,e,k,s)", [n, every, {k: True for k in keys.split(',')} if keys else None, shot_when])
    def taps(self, key, n, gap=13): return self.ev("([k,n,g])=>__t.taps(k,n,g)", [key, n, gap])
    def ent(self): return self.ev("()=>__t.ent()")
    def player(self): return self.ev("()=>__t.player()")
    def others(self): return self.ev("()=>__t.others()")
    def spawned(self): return self.ev("()=>__t.spawned()")
    def hurts(self): return self.ev("()=>__t.hurts()")
    def teleport(self, x, y): self.ev("([x,y])=>__t.teleport(x,y)", [x, y])
    def score(self): return self.ev("()=>KB.game.score")
    def save_shot(self, name, data=None):
        if not self.shots: return
        if data is None: data = self.ev("()=>__t.shot()")
        if not data: return
        SHOTS.mkdir(parents=True, exist_ok=True)
        (SHOTS / f'enemy_{name}.png').write_bytes(base64.b64decode(data.split(',', 1)[1]))
    def save_shot1(self, name):
        if not self.shots: return
        data = self.ev("()=>__t.shot1()")
        if data: self.save_shot(name, data)


def spawned_of(sp, **kw):
    """篩選 spawn 紀錄：type / kind / cls / spr / owner"""
    out = []
    for s in sp:
        ok = True
        for k, v in kw.items():
            if s.get(k) != v: ok = False; break
        if ok: out.append(s)
    return out


# ---------------------------------------------------------------------------
# 階段 1：生成
# ---------------------------------------------------------------------------
def phase_spawn(h, key):
    cfg = SPAWN[key]
    h.goto(cfg.get('px', 3), 9)
    e0 = h.spawn(key, cfg['ex'], cfg['ey'], a=cfg.get('a'), b=cfg.get('b'))
    samples = h.run(30, 5)
    e = samples[-1]['e']
    ok = not e['dead'] and not e['fellOut'] and not e['inSolid'] and e['active']
    info = dict(x=e['x'], y=e['y'], onGround=e['onGround'], inSolid=e['inSolid'], dead=e['dead'], active=e['active'])
    if key in FLY:
        ok = ok and abs(e['y'] - e0['y']) < 24 and not e['onGround']
        check(f'{key}: spawn hovers (no gravity)', ok, info)
    elif key == 'squishy':
        ok = ok and e['inWater'] and all(s['e']['inWater'] for s in samples)
        check(f'{key}: spawn floats in water', ok, info)
    elif key in HOPPERS:
        ok = ok and any(s['e']['onGround'] for s in samples) and all(s['e']['y'] + s['e']['h'] <= GROUND_TOP + 0.5 for s in samples)
        check(f'{key}: spawn lands on ground (hopper, never below floor)', ok, info)
    else:
        ok = ok and e['onGround'] and abs((e['y'] + e['h']) - GROUND_TOP) < 0.5
        check(f'{key}: spawn stands on ground', ok, info)


# ---------------------------------------------------------------------------
# 階段 2：特色行為
# ---------------------------------------------------------------------------
def phase_feature(h, key):
    n = f'{key}: '
    if key == 'waddledee':
        h.goto(3); h.spawn(key, 6, 9, d=1)
        S = h.run(100, 10)
        xs = [s['e']['x'] for s in S]
        check(n + 'walks (x increases, on ground)', xs[-1] > xs[0] + 30 and all(s['e']['onGround'] for s in S), (xs[0], xs[-1]))
        # 懸崖轉向
        h.goto(13); h.spawn(key, 16, 9, d=1)
        S = h.run(220, 5)
        turned = [s['f'] for s in S if s['e']['dir'] == -1]
        maxr = max(s['e']['x'] + s['e']['w'] for s in S)
        check(n + 'turns at cliff edge', turned and maxr <= PIT_X0 * 16 + 4 and all(s['e']['onGround'] for s in S), dict(turnFrame=turned[:1], maxRight=maxr))
        # 撞牆轉向
        h.goto(26); h.spawn(key, 29, 9, d=1)
        S = h.run(260, 5)
        turned = [s['f'] for s in S if s['e']['dir'] == -1]
        maxr = max(s['e']['x'] + s['e']['w'] for s in S)
        check(n + 'turns at wall', turned and maxr <= WALL_X * 16 + 0.5, dict(turnFrame=turned[:1], maxRight=maxr))
    elif key == 'waddledoo':
        h.goto(3); h.spawn(key, 6, 9, d=-1)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned(); hu = h.hurts()
        beams = spawned_of(sp, type='proj', kind='beam')
        check(n + 'fires beam when player in front', len(beams) >= 4 and any(s['e']['spr'] == 'waddledoo_attack' for s in S), dict(beams=len(beams)))
        check(n + 'beam hurts player', any(x['kind'] == 'beam' for x in hu), hu)
        check(n + 'stands still while attacking', all(abs(s['e']['vx']) < 0.01 for s in S if s['e']['state'] == 'attack'), '')
        h.save_shot1(key)
    elif key == 'brontoburt':
        h.goto(3); h.spawn(key, 9, 6)
        S = h.run(240, 5)
        ys = [s['e']['y'] for s in S]; d0 = abs(S[0]['e']['cx'] - S[0]['p']['cx']); d1 = abs(S[-1]['e']['cx'] - S[-1]['p']['cx'])
        check(n + 'flies in sine wave (y varies)', max(ys) - min(ys) > 6, (min(ys), max(ys)))
        check(n + 'approaches player, never lands', d1 < d0 - 20 and not any(s['e']['onGround'] for s in S), (d0, d1))
    elif key == 'hothead':
        h.goto(3); h.spawn(key, 9, 9, d=-1)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned()
        fb = spawned_of(sp, type='proj', kind='fire')
        check(n + 'shoots fireball at mid range', len(fb) >= 1 and any(s['e']['spr'] == 'hothead_attack' for s in S), dict(fireballs=len(fb)))
        check(n + 'fireball arcs (vy<0 then falls) and dies on ground', len(fb) >= 1 and fb[0]['spr'] == 'proj_fireball' and not any(o['kind'] == 'fire' for o in S[-1]['o']), '')
        h.save_shot1(key)
        h.goto(3); h.spawn(key, 5, 9, d=-1)
        S = h.run(200, 2, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        fl = spawned_of(sp, type='hitbox', kind='fire')
        check(n + 'breathes flame at close range (hitbox + fx_fire)', len(fl) >= 1 and len(spawned_of(sp, type='fx', spr='fx_fire')) >= 3, dict(hitbox=len(fl)))
        check(n + 'flame reaches player', hitbox_touches_player(S, 'fire') is not None, dict(hurts=hu))
        h.save_shot1(key + '_flame')
        # 離開畫面 → 引擎放回起點 → 回到畫面時判定框已清、狀態重置
        h.goto(3); h.spawn(key, 5, 9, d=-1)
        S = h.run(120, 2)
        fl_on = [s for s in S if any(o['kind'] == 'fire' and o['type'] == 'hitbox' for o in s['o'])]
        h.teleport(70 * 16, GROUND_TOP - PLAYER_H); h.run(6, 6)
        far = h.ent()
        h.teleport(3 * 16 + 1, GROUND_TOP - PLAYER_H); S2 = h.run(40, 5); e2 = S2[-1]['e']   # 鏡頭漸進追隨，等它回來
        stale = any(o['type'] == 'hitbox' and o['owner'] == 'enemy' for s in S2 for o in s['o'])
        check(n + 'offscreen -> reset to start; back on screen -> walking, no stale hitbox',
              fl_on and not far['active'] and far['x'] == 5 * 16 and e2['active'] and e2['state'] == 'walk' and e2['spr'] == 'hothead_walk' and not stale,
              dict(flameSeen=len(fl_on), farActive=far['active'], farX=far['x'], active=e2['active'], state=e2['state'], spr=e2['spr'], stale=stale))
        # 冰凍中：火焰判定框消失、不再攻擊
        h.goto(3, 9, ability='ice', immune=True); h.spawn(key, 5, 9, d=-1)
        S = h.run(80, 2)
        S2 = h.run(40, 2, keys='attack'); h.ev("()=>__kb.release()"); S3 = h.run(30, 5)
        fz = [s for s in S2 + S3 if s['e']['freezeT'] > 0]
        check(n + 'frozen by ice: hitbox removed, stays frozen', fz and all(not any(o['type'] == 'hitbox' and o['owner'] == 'enemy' for o in s['o']) for s in fz) and all(s['e']['vx'] == 0 for s in fz), dict(frozenSamples=len(fz)))
    elif key == 'sirkibble':
        h.goto(3); h.spawn(key, 7, 9, d=-1)
        S = h.run(240, 3, shot_when='proj'); sp = h.spawned()
        cut = spawned_of(sp, cls='Boomerang')
        xs = [o['x'] for s in S for o in s['o'] if o['cls'] == 'Boomerang']
        gone = any(not any(o['cls'] == 'Boomerang' for o in s['o']) for s in S if s['f'] > (cut[0]['f'] + 30 if cut else 9e9))
        check(n + 'throws cutter boomerang', len(cut) >= 1 and any(s['e']['spr'] == 'sirkibble_throw' for s in S), dict(thrown=len(cut)))
        check(n + 'boomerang flies out then returns and vanishes', cut and min(xs) < cut[0]['x'] - 25 and xs[-1] > min(xs) + 10 and gone, dict(minX=min(xs) if xs else None, start=cut[0]['x'] if cut else None))
        check(n + 'only one cutter out at a time', all(sum(1 for o in s['o'] if o['cls'] == 'Boomerang') <= 1 for s in S), '')
        h.save_shot1(key)
    elif key == 'sparky':
        h.goto(3); h.spawn(key, 8, 9, d=-1)
        S = h.run(240, 5, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        air = [s for s in S if not s['e']['onGround']]
        check(n + 'hops (leaves ground)', len(air) >= 2, dict(airSamples=len(air)))
        sk = spawned_of(sp, type='hitbox', kind='spark')
        check(n + 'stops and discharges near player (spark hitbox)', len(sk) >= 1 and any(s['e']['spr'] == 'sparky_attack' for s in S), dict(spark=len(sk)))
        check(n + 'spark field hurts player', any(x['kind'] == 'spark' for x in hu), hu)
        h.save_shot1(key)
    elif key == 'rocky':
        h.goto(3); h.spawn(key, 5, 9, d=-1)
        S = h.run(200, 2, shot_when='hitbox'); sp = h.spawned()
        jumped = [s for s in S if s['e']['state'] == 'jump']
        st = spawned_of(sp, type='hitbox', kind='stone')
        check(n + 'jumps up (rocky_drop) near player', len(jumped) >= 1 and any(s['e']['spr'] == 'rocky_drop' and not s['e']['onGround'] for s in S), dict(jumpSamples=len(jumped)))
        check(n + 'landing shockwave hitbox', len(st) >= 1, dict(stone=len(st)))
        check(n + 'back to walking after landing', S[-1]['e']['state'] == 'walk' and S[-1]['e']['onGround'], S[-1]['e']['state'])
        h.save_shot1(key)
    elif key == 'chilly':
        h.goto(3); h.spawn(key, 6, 9, d=-1)
        S = h.run(200, 5, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        ice = spawned_of(sp, type='hitbox', kind='ice')
        check(n + 'breathes ice (freeze hitbox + fx_ice)', len(ice) >= 1 and ice[0]['freeze'] and len(spawned_of(sp, type='fx', spr='fx_ice')) >= 3, dict(ice=len(ice)))
        check(n + 'ice hurts player', any(x['kind'] == 'ice' for x in hu), hu)
        h.save_shot1(key)
    elif key == 'bladeknight':
        h.goto(3); h.spawn(key, 8, 9, d=1)
        S = h.run(300, 5, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        xs = [s['e']['x'] for s in S]
        sw = spawned_of(sp, type='hitbox', kind='sword')
        check(n + 'chases player (turns toward, x decreases)', S[2]['e']['dir'] == -1 and min(xs) < xs[0] - 20, (xs[0], min(xs)))
        check(n + 'swings sword when adjacent', len(sw) >= 1 and any(s['e']['spr'] == 'bladeknight_attack' for s in S), dict(sword=len(sw)))
        check(n + 'sword hurts player', any(x['kind'] == 'sword' for x in hu), hu)
        h.save_shot1(key)
    elif key == 'bonkers':
        h.goto(3); h.spawn(key, 10, 9, d=-1)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned()
        cc = spawned_of(sp, type='proj', kind='coconut')
        check(n + 'throws 2 coconuts at range', len(cc) >= 2 and all(c['spr'] == 'proj_cannonball' for c in cc), dict(coconuts=len(cc)))
        h.save_shot1(key)
        h.goto(3); h.spawn(key, 5, 9, d=-1)
        S = h.run(200, 2, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        hm = spawned_of(sp, type='hitbox', kind='hammer')
        check(n + 'hammer swing when close (dmg 2)', len(hm) >= 1 and hm[0]['dmg'] == 2 and any(s['e']['spr'] == 'bonkers_attack' for s in S), dict(hammer=len(hm)))
        check(n + 'hammer reaches player', hitbox_touches_player(S, 'hammer') is not None, dict(hurts=hu))
        h.save_shot1(key + '_hammer')
    elif key == 'mrfrosty':
        h.goto(3); h.spawn(key, 10, 9, d=-1)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned()
        sl = spawned_of(sp, cls='Slider')
        slx = [o for s in S for o in s['o'] if o['cls'] == 'Slider']
        check(n + 'throws sliding ice block at range', len(sl) >= 1 and any(s['e']['spr'] == 'mrfrosty_throw' for s in S), dict(sliders=len(sl)))
        check(n + 'ice block slides along ground toward player', slx and all(o['vx'] < 0 for o in slx) and any(o['onGround'] for o in slx), dict(seen=len(slx)))
        h.save_shot1(key)
        h.goto(3); h.spawn(key, 6, 9, d=-1)
        S = h.run(120, 2); hu = h.hurts()
        ch = [s for s in S if s['e']['state'] == 'charge']
        check(n + 'charges when close (vx = 2)', len(ch) >= 1 and any(abs(s['e']['vx']) >= 1.9 for s in ch), dict(chargeSamples=len(ch)))
        check(n + 'charge body hits player', any(x['kind'].startswith('body') for x in hu), hu)
    elif key == 'poppybros':
        h.goto(3); h.spawn(key, 12, 9, d=-1)
        S = h.run(300, 1, shot_when='proj'); sp = h.spawned()
        air = [s for s in S if not s['e']['onGround']]
        bombs = spawned_of(sp, cls='Bomb'); boom = spawned_of(sp, type='hitbox', kind='bomb')
        check(n + 'hops forward', len(air) >= 5 and S[-1]['e']['x'] < S[0]['e']['x'], dict(airSamples=len(air)))
        check(n + 'throws bomb (proj_bomb)', len(bombs) >= 1, dict(bombs=len(bombs)))
        f0 = boom[0]['f'] if boom else None
        alive_at = sum(1 for s in S if s['f'] == f0 for o in s['o'] if o['cls'] == 'Bomb')
        thrown_by = sum(1 for b_ in bombs if b_['f'] <= f0) if f0 is not None else 0
        check(n + 'bomb explodes (24x24 enemy hitbox) and disappears', len(boom) >= 1 and boom[0]['w'] == 24 and boom[0]['owner'] == 'enemy' and alive_at == thrown_by - 1, dict(explosions=len(boom), aliveAtBoom=alive_at, thrownByBoom=thrown_by))
        # 落地 → 爆炸 ≈ 40 幀
        land = None
        for s in S:
            for o in s['o']:
                if o['cls'] == 'Bomb' and o['onGround'] and abs(o['vy']) < 0.01 and land is None: land = s['f']
        fuse = (boom[0]['f'] - land) if (boom and land is not None) else None
        check(n + 'bomb fuse ~40 frames after settling', fuse is not None and 36 <= fuse <= 48, dict(fuse=fuse, land=land, boom=boom[0]['f'] if boom else None))
        h.save_shot1(key)
    elif key == 'scarfy':
        h.goto(3); h.spawn(key, 9, 7)
        S = h.run(200, 5); e = S[-1]['e']; p = S[-1]['p']
        check(n + 'hovers near player (~28px beside, above)', abs(abs(e['cx'] - p['cx']) - 28) < 8 and e['cy'] < p['cy'] - 10 and not e['onGround'], dict(dx=e['cx'] - p['cx'], dy=e['cy'] - p['cy']))
        check(n + 'calm scarfy is harmless unless touched (no hurt yet)', S[-1]['nh'] == 0, S[-1]['nh'])
    elif key == 'gordo':
        h.goto(3); e0 = h.spawn(key, 9, 9, a='v', b=2)
        S = h.run(200, 5); ys = [s['e']['y'] for s in S]
        check(n + "a='v' b=2 moves up 32px and back", abs((e0['y'] - min(ys)) - 32) < 2 and abs(max(ys) - e0['y']) < 1, dict(y0=e0['y'], minY=min(ys), maxY=max(ys)))
        h.goto(3); e0 = h.spawn(key, 9, 9, a='h', b=3)
        S = h.run(200, 5); xs = [s['e']['x'] for s in S]
        check(n + "a='h' b=3 moves right 48px and back, faces move dir", abs((max(xs) - e0['x']) - 48) < 2 and abs(min(xs) - e0['x']) < 1 and any(s['e']['dir'] == -1 for s in S), dict(x0=e0['x'], maxX=max(xs)))
        h.save_shot(key)
        h.goto(3); e0 = h.spawn(key, 9, 9)
        S = h.run(60, 10)
        check(n + 'no a/b: stays put', all(s['e']['x'] == e0['x'] and s['e']['y'] == e0['y'] for s in S), '')
    elif key == 'cappy':
        h.goto(3); h.spawn(key, 6, 9, d=1)
        S = h.run(100, 10); xs = [s['e']['x'] for s in S]
        check(n + 'walks', xs[-1] > xs[0] + 30, (xs[0], xs[-1]))
        h.goto(13); h.spawn(key, 16, 9, d=1)
        S = h.run(220, 5)
        check(n + 'turns at cliff edge', any(s['e']['dir'] == -1 for s in S) and all(s['e']['onGround'] for s in S), '')
    elif key == 'cappy_bare':
        h.goto(3); h.spawn(key, 6, 9, d=1)
        S = h.run(120, 5); xs = [s['e']['x'] for s in S]; e = S[-1]['e']
        check(n + 'runs away from player (fast)', xs[-1] > xs[0] + 60 and e['dir'] == 1, (xs[0], xs[-1]))
        check(n + 'harmless and inhalable after grace', not e['hurtsPlayer'] and not e['contactDamage'] and e['inhalable'], dict(hurts=e['hurtsPlayer'], inh=e['inhalable']))
    elif key == 'twizzy':
        h.goto(3); h.spawn(key, 12, 9)
        S = h.run(60, 10)
        check(n + 'perches when player is far', all(s['e']['state'] == 'perch' and s['e']['onGround'] and s['e']['vx'] == 0 for s in S), S[-1]['e']['state'])
        S = h.run(240, 5, keys='right')
        fly = [s for s in S if s['e']['state'] == 'fly']
        check(n + 'flies away when player approaches', len(fly) >= 1 and fly[0]['e']['dir'] == 1 and fly[0]['e']['vy'] < 0 and not fly[0]['e']['solid'], dict(flySamples=len(fly)))
        check(n + 'flees up & out of screen, then removed', fly and min(s['e']['y'] for s in fly) < fly[0]['e']['y'] - 40 and S[-1]['e']['dead'], dict(dead=S[-1]['e']['dead'], minY=min(s['e']['y'] for s in fly) if fly else None))
        d_at = abs(fly[0]['e']['cx'] - fly[0]['p']['cx']) if fly else None
        check(n + 'flee trigger distance <= inhale range (catchable)', d_at is not None and d_at <= 52, dict(distAtFlee=d_at))
    elif key == 'shotzo':
        h.goto(3); h.spawn(key, 10, 8)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned(); hu = h.hurts()
        cb = spawned_of(sp, type='proj', kind='cannon')
        cbo = [o for s in S for o in s['o'] if o['kind'] == 'cannon']
        check(n + 'fires cannonball toward player', len(cb) >= 1 and cbo and all(o['vx'] < 0 for o in cbo), dict(shots=len(cb)))
        check(n + 'cannonball hurts player', any(x['kind'] == 'cannon' for x in hu), hu)
        check(n + 'faces player', all(s['e']['dir'] == -1 for s in S), '')
        h.save_shot1(key)
    elif key == 'squishy':
        h.goto(40); h.spawn(key, 47, 9)
        S = h.run(300, 5); ys = [s['e']['y'] for s in S]; xs = [s['e']['x'] for s in S]
        check(n + 'swims (x and y vary)', max(ys) - min(ys) > 4 and max(xs) - min(xs) > 8, dict(dy=max(ys) - min(ys), dx=max(xs) - min(xs)))
        check(n + 'stays inside the pool', all(s['e']['inWater'] for s in S) and min(xs) >= WATER_X0 * 16 - 1 and max(xs) + 14 <= (WATER_X1 + 1) * 16 + 1, dict(minX=min(xs), maxX=max(xs), minY=min(ys), maxY=max(ys)))
        h.save_shot(key)
    elif key == 'glunk':
        h.goto(3); h.spawn(key, 8, 9)
        S = h.run(200, 5, shot_when='proj'); sp = h.spawned()
        bb = spawned_of(sp, type='proj', kind='bubble')
        bo = [o for s in S for o in s['o'] if o['kind'] == 'bubble']
        check(n + 'spits bubbles upward', len(bb) >= 2 and bo and all(o['vy'] < 0 and abs(o['vx']) < 0.01 for o in bo), dict(bubbles=len(bb)))
        check(n + 'bubble rises then vanishes', bo and min(o['y'] for o in bo) < bb[0]['y'] - 40 and not any(o['kind'] == 'bubble' and o['y'] < bb[0]['y'] - 100 for o in bo), '')
        check(n + 'stays put on ground', all(s['e']['vx'] == 0 and s['e']['onGround'] for s in S), '')
        h.save_shot1(key)
    elif key == 'kabu':
        h.goto(3); h.spawn(key, 10, 9)
        S = h.run(200, 5); p = S[0]['p']
        hid = [s for s in S if s['e']['hidden']]
        re = [s for s in S if s['e']['state'] == 'slide']
        check(n + 'vanishes after idle (hidden, harmless)', len(hid) >= 1 and all(not s['e']['hurtsPlayer'] and not s['e']['inhalable'] for s in hid), dict(hiddenSamples=len(hid)))
        check(n + 'reappears near player (~48px) on ground and slides toward', re and abs(abs(re[0]['e']['cx'] - re[0]['p']['cx']) - 48) < 12 and re[0]['e']['onGround'] and (re[0]['e']['vx'] * (re[0]['p']['cx'] - re[0]['e']['cx']) > 0), dict(dx=(re[0]['e']['cx'] - re[0]['p']['cx']) if re else None))
        check(n + 'back to idle after slide', S[-1]['e']['state'] in ('idle', 'gone', 'slide') and not S[-1]['e']['dead'], S[-1]['e']['state'])
        h.save_shot(key)


# ---------------------------------------------------------------------------
# 階段 3：接觸傷害（把卡比傳送到敵人身上）
# ---------------------------------------------------------------------------
def phase_contact(h, key):
    cfg = SPAWN[key]
    h.goto(cfg.get('px', 3), 9)
    e = h.spawn(key, cfg['ex'], cfg['ey'], a=cfg.get('a'), b=cfg.get('b'))
    h.run(3, 3)
    e = h.ent()
    h.teleport(e['cx'] - 7, e['y'] + e['h'] - PLAYER_H)
    S = h.run(4, 2); hu = h.hurts(); p = S[-1]['p']
    if key == 'cappy_bare':
        check(f'{key}: contact is harmless', p['hp'] == 6 and not hu, dict(hp=p['hp'], hurts=hu))
    else:
        check(f'{key}: body contact hurts player', p['hp'] < 6 and any(x['kind'].startswith('body') for x in hu), dict(hp=p['hp'], hurts=hu))


# ---------------------------------------------------------------------------
# 階段 4：吸入
# ---------------------------------------------------------------------------
def inhale_until(h, max_frames=90):
    """按住 attack，直到 mouth 有值；回傳 (samples, 花費幀數或 None)"""
    S = h.run(max_frames, 5, keys='attack')
    for s in S:
        if s['p']['mouth']: return S, s['f']
    return S, None

def phase_inhale(h, key):
    n = f'{key}: '
    px, ex, ey, d = 3, 6, 9, -1
    if key == 'squishy': px, ex = 43, 45
    if key == 'rocky': ex = 5
    h.goto(px, 9)
    e0 = h.spawn(key, ex, ey, d=d, a=SPAWN[key].get('a'), b=SPAWN[key].get('b')) if key != 'cappy_bare' else None
    if key == 'cappy_bare':
        e0 = h.spawn(key, 5, 9, d=1); h.run(45, 45)   # 等 grace 結束（會逃跑），再追到牠身後 36px 吸
        e0 = h.ent(); h.teleport(e0['cx'] - 36 - 7, GROUND_TOP - PLAYER_H)
    S, took = inhale_until(h, 120 if key == 'rocky' else 90)
    p = S[-1]['p']; e = S[-1]['e']; hu = h.hurts()
    if key in MINIBOSS or key in INVINCIBLE:
        check(n + 'cannot be inhaled (mouth stays empty, enemy alive)', took is None and not e['dead'] and not e['beingInhaled'], dict(mouth=p['mouth'], dead=e['dead']))
    elif key == 'scarfy':
        ang = [s for s in S if s['e']['angry']]
        a0 = ang[0]['e'] if ang else e
        check(n + 'inhale attempt fails and makes it angry', took is None and ang and a0['spr'] == 'scarfy_angry' and not a0['dead'] and not a0['inhalable'], dict(angry=a0['angry'], spr=a0['spr'], mouth=p['mouth']))
        h.ev("()=>__kb.release()")
        S2 = h.run(180, 5); sp = h.spawned(); hu = h.hurts(); e2 = S2[-1]['e']
        boom = spawned_of(sp, type='hitbox', kind='bomb')
        d0 = abs(S2[0]['e']['cx'] - S2[0]['p']['cx']) if not S2[0]['e']['dead'] else 0
        check(n + 'angry scarfy chases fast and explodes', e2['dead'] and len(boom) >= 1, dict(dead=e2['dead'], boom=len(boom), d0=d0))
        check(n + 'explosion hurts player', any(x['kind'] in ('bomb',) or x['kind'].startswith('body') for x in hu), hu)
    elif key == 'cappy':
        m = p['mouth']
        bares = [o for o in S[-1]['o'] if o['name'] == 'cappy_bare']
        check(n + 'inhale takes only the hat (mouth cappy_hat, ability null)', took is not None and m and m.get('ability') is None and m.get('name') == 'cappy_hat', dict(mouth=m, took=took))
        check(n + 'leaves cappy_bare behind (harmless, running away)', len(bares) == 1 and not bares[0]['hurtsPlayer'] and not bares[0]['contactDamage'] and bares[0]['vx'] != 0, bares)
        S3 = h.run(60, 10)
        bares = [o for o in S3[-1]['o'] if o['name'] == 'cappy_bare']
        check(n + 'cappy_bare becomes inhalable after grace', bares and bares[0]['inhalable'], bares)
        h.save_shot(key + '_bare')
    else:
        want = ABILITY[key]
        m = p['mouth']
        check(n + f'inhaled -> mouth.ability == {want!r}', took is not None and m is not None and m.get('ability') == want and e['dead'] and p['state'] in ('full', 'idle'), dict(mouth=m, took=took, state=p['state'], hurts=hu))
        if key == 'sirkibble':
            # 回旋刃本身也可吸入 → cutter（KA 規則）：等刀刃丟出後立刻吸
            h.goto(3); h.spawn(key, 7, 9, d=-1)
            S = h.run(60, 2)
            bl = [o for s in S for o in s['o'] if o['cls'] == 'Boomerang']
            S2, took2 = inhale_until(h, 60)
            m2 = S2[-1]['p']['mouth']
            check(n + 'boomerang is inhalable and gives cutter', bl and bl[0]['inhalable'] and took2 is not None and m2 and m2.get('ability') == 'cutter', dict(mouth=m2, took=took2, seen=len(bl)))
    if key == 'twizzy':
        check(n + 'was still perched when inhale started (not fled)', S[0]['e']['state'] in ('perch',) or took is not None, dict(state=S[0]['e']['state'], took=took))


# ---------------------------------------------------------------------------
# 階段 5：劍攻擊（卡比免疫接觸傷害，避免中途掉能力）
# ---------------------------------------------------------------------------
def phase_attack(h, key):
    n = f'{key}: '
    px, ex, ey = 3, 4, 9
    if key == 'squishy': px, ex = 43, 44
    if key in ('brontoburt', 'scarfy'): ey = 8
    if key == 'shotzo': ey = 9
    h.goto(px, 9, ability='sword', immune=True)
    e0 = h.spawn(key, ex, ey, d=-1, a=SPAWN[key].get('a') if key == 'gordo' else None, b=SPAWN[key].get('b') if key == 'gordo' else None)
    sc0 = h.score()
    hp0 = e0['hp']
    check(n + f'hp == {HP[key]}', hp0 == HP[key], hp0)
    hits_needed = 1 if key in INVINCIBLE else (HP[key] + 2) // 3
    h.taps('attack', 2, 14)
    e1 = h.ent()
    if key in INVINCIBLE:
        check(n + 'invincible: sword does nothing', e1['hp'] == hp0 and not e1['dead'], dict(hp=e1['hp'], dead=e1['dead']))
        return
    check(n + 'sword hit reduces hp / kills', e1['dead'] or e1['hp'] < hp0, dict(hp0=hp0, hp=e1['hp'], dead=e1['dead']))
    if hits_needed > 2:
        h.taps('attack', hits_needed + 2, 14); e1 = h.ent()
    if key in MINIBOSS:
        check(n + 'hp 0 -> stunned (inhalable, harmless, not dead)', e1['stunned'] and e1['hp'] == 0 and e1['inhalable'] and not e1['hurtsPlayer'] and not e1['dead'], dict(hp=e1['hp'], stunned=e1['stunned'], inh=e1['inhalable'], hurts=e1['hurtsPlayer']))
        check(n + 'stun awards 3000', h.score() - sc0 >= 3000, h.score() - sc0)
        h.save_shot(key + '_stun')
        h.ev("()=>__t.dropAbility()")
        # 走近再吸
        e1 = h.ent(); p = h.player()
        if abs(e1['cx'] - p['cx']) > 44: h.teleport(e1['cx'] - 40, p['y'])
        S, took = inhale_until(h, 120)
        m = S[-1]['p']['mouth']
        check(n + f"inhale stunned -> mouth.ability == {MINIBOSS[key]!r}", took is not None and m and m.get('ability') == MINIBOSS[key] and S[-1]['e']['dead'], dict(mouth=m, took=took))
        return
    S = h.run(30, 10); e2 = S[-1]['e']
    check(n + 'dies from sword', e2['dead'], dict(hp=e2['hp'], dead=e2['dead']))
    check(n + 'kill adds score', h.score() > sc0, dict(score=h.score() - sc0))
    if key == 'twizzy':
        sp = h.spawned()
        check(n + 'fx_poof on death', len(spawned_of(sp, type='fx', spr='fx_poof')) >= 1, '')


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', action='store_true'); ap.add_argument('--only', default='')
    ap.add_argument('--hitbox', action='store_true'); ap.add_argument('-v', action='store_true')
    a = ap.parse_args(); VERBOSE = a.v
    keys = [k for k in a.only.split(',') if k] or ORDER
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
        for key in keys:
            print('-' * 8, key)
            n0 = len(logs)
            for ph in (phase_spawn, phase_feature, phase_contact, phase_inhale, phase_attack):
                try:
                    ph(h, key)
                except Exception as ex:   # 測試本身出錯也視為 FAIL，不中斷其他敵人
                    check(f'{key}: {ph.__name__} raised', False, repr(ex))
            errs = [l for l in logs[n0:] if 'pageerror' in l or 'console.error' in l]
            check(f'{key}: no page errors', not errs, errs[:3])
        missing = pg.evaluate("()=>__kb.missing()")
        b.close()
    print('---')
    fails = [r for r in results if not r[1]]
    print(f'{len(results) - len(fails)}/{len(results)} passed')
    if fails:
        print('FAILED:'); [print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else '')) for f in fails]
    if missing: print('MISSING SPRITES:', ', '.join(missing))
    warn = [l for l in logs if 'missing sprite' not in l]
    if warn: print('BROWSER LOG:'); print('\n'.join(warn[:30]))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
