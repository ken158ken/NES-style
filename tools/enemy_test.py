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
# 單向平台（row 8，col 56~59）：測試「↑+攻擊」類招式（敵人站在卡比頭上）
PLAT_X0, PLAT_X1 = 56, 59
fill(PLAT_X0, 8, PLAT_X1, 8, '=')
# 石頭滾動用斜坡：col 61~63 高台（頂面 row 7），col 64/65/66 逐級下降的 '\\'，col 67 起回到一般地面
fill(61, 7, 63, 11, '#')
for _sx, _sy in ((64, 7), (65, 8), (66, 9)):
    grid[_sy][_sx] = '\\'
    fill(_sx, _sy + 1, _sx, 11, '#')
MAP = [''.join(r) for r in grid]
def _test_level(lid):
    return "KB.LEVELS.push(" + json.dumps({
        'id': lid, 'name': 'ENEMY TEST ' + lid, 'theme': 'green', 'music': None, 'boss': None,
        'rooms': [{'map': MAP, 'spawn': [3, 9], 'entities': [], 'noBoss': True}],
    }, ensure_ascii=False) + ");"


# 'etest' 的 id 沒有數字 → tier 取預設值 3（完整行為）；'etw1'~'etw5' 用來測「敵人行為分世界」。
TEST_LEVEL = ''.join([_test_level('etest')] + [_test_level('etw%d' % i) for i in range(1, 6)])

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
        inSolid: KB.game.map.isSolidPx(e.cx, e.cy), inWater: KB.game.map.inWater(e.cx, e.cy), fellOut: !!e.fellOut, score: e.score,
        // Round 3 分世界強度（entity.js 的 KB.Enemy）
        tier: e.tier, tough: !!e.tough, alertK: e.alertK, canCatch: !!e.canCatch,
        throwCD: e.throwCD === undefined ? null : e.throwCD, fireCD: e.fireCD === undefined ? null : e.fireCD,
        range: e.range === undefined ? null : e.range, windT: e.windT | 0, cool: e.cool | 0 };
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
         'poppybros', 'scarfy', 'gordo', 'cappy', 'cappy_bare', 'twizzy', 'shotzo', 'squishy', 'glunk', 'kabu',
         'spikeball', 'dartwing', 'snowly', 'rollarmor']
ABILITY = {'waddledee': None, 'waddledoo': 'beam', 'brontoburt': None, 'hothead': 'fire', 'sirkibble': 'cutter', 'sparky': 'spark', 'rocky': 'stone',
           'chilly': 'ice', 'bladeknight': 'sword', 'poppybros': None, 'cappy': None, 'cappy_bare': None, 'twizzy': None, 'squishy': None, 'glunk': None, 'kabu': None,
           'spikeball': None, 'dartwing': None, 'snowly': 'ice', 'rollarmor': 'hammer'}
NOT_INHALABLE = {'scarfy', 'gordo', 'shotzo', 'bonkers', 'mrfrosty', 'rollarmor'}
FLY = {'brontoburt', 'scarfy', 'gordo', 'shotzo', 'dartwing'}
INVINCIBLE = {'gordo', 'shotzo'}
MINIBOSS = {'bonkers': 'hammer', 'mrfrosty': 'ice', 'rollarmor': 'hammer'}
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
      'mrfrosty': 12, 'poppybros': 2, 'scarfy': 2, 'gordo': 999, 'cappy': 2, 'cappy_bare': 2, 'twizzy': 2, 'shotzo': 999, 'squishy': 2, 'glunk': 2, 'kabu': 3,
      'spikeball': 3, 'dartwing': 2, 'snowly': 3, 'rollarmor': 12}
# 各敵人在「玩家 x=3」時的預設生成格（吸入 / 攻擊 / 接觸階段會另外指定）
SPAWN = {k: dict(ex=8, ey=9) for k in ORDER}
SPAWN.update({'brontoburt': dict(ex=9, ey=6), 'scarfy': dict(ex=9, ey=7), 'gordo': dict(ex=9, ey=9, a='v', b=2), 'shotzo': dict(ex=10, ey=8),
              'squishy': dict(px=40, ex=47, ey=9), 'twizzy': dict(ex=12, ey=9), 'kabu': dict(ex=10, ey=9),
              'dartwing': dict(ex=9, ey=6), 'spikeball': dict(ex=9, ey=9), 'snowly': dict(ex=9, ey=9),
              'rollarmor': dict(ex=9, ey=9)})

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
    def goto(self, x=3, y=9, ability=None, immune=False, level=None):
        o = {'x': x, 'y': y}
        if level: o['level'] = level          # 'etw1'~'etw5'：切換世界強度（KB.Enemy.tier）
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
    def press(self, keys): self.ev("(o)=>__kb.press(o)", {k: True for k in keys.split(',')})
    def release(self): self.ev("()=>__kb.release()")
    def ability_moves(self, key): return self.ev("(k)=>{const d=KB.ABILITIES[k];return {moves:d.moves||null, desc:d.desc||null};}", key)
    def stone_form(self): return self.ev("()=>KB.player.abilityData && KB.player.abilityData.form")
    def score(self): return self.ev("()=>KB.game.score")
    def extra(self, v): self.ev("(v)=>{KB.session = KB.session || {}; KB.session.extra = !!v;}", bool(v))
    def items(self): return self.ev("()=>KB.game.entities.filter(e=>!e.dead && e.type==='item').map(e=>e.name)")
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
        ok = (ok and not e['onGround']
              and e['y'] + e['h'] < GROUND_TOP - 6                      # 沒有落到地面
              and all(abs(s['e']['vy']) <= 1.6 for s in samples))       # 速度不像自由落體（重力會到 4.2）
        check(f'{key}: spawn hovers (no gravity)', ok, dict(info, maxVy=max(abs(s['e']['vy']) for s in samples)))
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
        # 只看「第一把」刀刃的軌跡：w3 起冷卻只有 60 幀，取樣尾端常常是第二把剛飛出去的位置
        f_end = cut[1]['f'] if len(cut) > 1 else 9e9
        xs = [o['x'] for s in S for o in s['o'] if o['cls'] == 'Boomerang' and s['f'] <= f_end]
        gone = any(not any(o['cls'] == 'Boomerang' for o in s['o']) for s in S if s['f'] > (cut[0]['f'] + 30 if cut else 9e9))
        check(n + 'throws cutter boomerang', len(cut) >= 1 and any(s['e']['spr'] == 'sirkibble_throw' for s in S), dict(thrown=len(cut)))
        check(n + 'boomerang flies out then returns and vanishes', cut and min(xs) < cut[0]['x'] - 25 and xs[-1] > min(xs) + 10 and gone, dict(minX=min(xs) if xs else None, start=cut[0]['x'] if cut else None, n=len(cut)))
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
        # 落地 → 爆炸 ≈ 40 幀（若炸彈直接砸中卡比會提早爆，屬正常）
        land = None
        for s in S:
            for o in s['o']:
                if o['cls'] == 'Bomb' and o['onGround'] and abs(o['vy']) < 0.01 and land is None: land = s['f']
        fuse = (boom[0]['f'] - land) if (boom and land is not None) else None
        hit_player = any(abs(s['p']['cx'] - (boom[0]['x'] + 12)) < 24 for s in S if s['f'] == boom[0]['f']) if boom else False
        check(n + 'bomb fuse ~40 frames after settling (or explodes on contact)',
              (fuse is not None and 36 <= fuse <= 48) or hit_player, dict(fuse=fuse, land=land, boom=boom[0]['f'] if boom else None, onPlayer=hit_player))
        # 拋物線瞄準：炸彈落點 / 爆點應該落在卡比附近（±48px）
        bx = boom[0]['x'] + 12 if boom else None
        pxs = [s['p']['cx'] for s in S if boom and s['f'] == boom[0]['f']]
        check(n + 'bomb is lobbed toward the player (lands within 48px)',
              bx is not None and pxs and abs(bx - pxs[0]) <= 48, dict(boomX=bx, playerX=pxs[0] if pxs else None))
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
    elif key == 'spikeball':
        h.goto(3); h.spawn(key, 6, 9, d=1)
        S = h.run(160, 4); e = S[-1]['e']
        dash = [x for x in S if x['e']['state'] == 'dash']
        check(n + 'notices player and dashes (spikeball_dash, |vx| >= 2)',
              dash and any(x['e']['spr'] == 'spikeball_dash' and abs(x['e']['vx']) >= 2.0 for x in dash), dict(dashSamples=len(dash)))
        h.save_shot(key)
        # 玩家站在坑的另一側（>96px，不觸發察覺），刺球一路滾進坑裡（turnAtEdge 關閉）
        h.goto(27); h.spawn(key, 16, 9, d=1)
        S = h.run(260, 5)
        fell = [x for x in S if x['e']['x'] > PIT_X0 * 16 - 8]
        check(n + 'rolls over the cliff edge (does not turn back)', bool(fell) or S[-1]['e']['dead'],
              dict(maxX=max(x['e']['x'] for x in S), dead=S[-1]['e']['dead']))
    elif key == 'dartwing':
        h.goto(3); h.spawn(key, 9, 6)
        S = h.run(240, 5, shot_when='proj'); sp = h.spawned()
        fe = spawned_of(sp, type='proj', kind='feather')
        fo = [o for x in S for o in x['o'] if o['kind'] == 'feather']
        check(n + 'throws aimed feather darts', len(fe) >= 1 and all(f['spr'] == 'proj_feather' for f in fe) and any(x['e']['spr'] == 'dartwing_throw' for x in S), dict(feathers=len(fe)))
        check(n + 'feather flies toward the player (vx < 0)', bool(fo) and all(o['vx'] < 0 for o in fo), dict(seen=len(fo)))
        hov = S[-1]['e']
        check(n + 'hovers above the player, never lands', hov['cy'] < S[-1]['p']['cy'] - 10 and not any(x['e']['onGround'] for x in S), dict(dy=hov['cy'] - S[-1]['p']['cy']))
        h.save_shot1(key)
    elif key == 'snowly':
        h.goto(3); h.spawn(key, 6, 9, d=-1)
        S = h.run(220, 4, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        ice = spawned_of(sp, type='hitbox', kind='ice')
        check(n + 'breathes freezing mist (freeze hitbox + fx_ice)',
              len(ice) >= 1 and ice[0]['freeze'] and len(spawned_of(sp, type='fx', spr='fx_ice')) >= 3 and any(x['e']['spr'] == 'snowly_attack' for x in S), dict(ice=len(ice)))
        check(n + 'mist reaches player', hitbox_touches_player(S, 'ice') is not None, dict(hurts=hu))
        check(n + 'keeps its distance (never walks into the player)', all(abs(x['e']['cx'] - x['p']['cx']) > 18 for x in S), '')
        h.save_shot1(key)
    elif key == 'rollarmor':
        # ① 鐵殼滾動：距離遠 → 縮進殼裡高速滾過來
        h.goto(3); h.spawn(key, 14, 9, d=-1)
        S = h.run(240, 4); roll = [x for x in S if x['e']['state'] == 'roll']
        check(n + 'curls into its shell and rolls at the player (rollarmor_roll, |vx| >= 2.5)',
              bool(roll) and any(x['e']['spr'] == 'rollarmor_roll' and abs(x['e']['vx']) >= 2.5 for x in roll),
              dict(rollSamples=len(roll), maxVx=max((abs(x['e']['vx']) for x in roll), default=0)))
        h.save_shot(key)
        # 撞牆反彈：玩家站在牆（col 34）的另一側 → 滾過去撞牆，方向會翻轉且永遠越不過牆
        # （生成點要避開 col 20~23 的坑，否則會直接掉下去）
        h.goto(40); h.spawn(key, 28, 9, d=1)
        S = h.run(320, 3); roll = [x for x in S if x['e']['state'] == 'roll']
        dirs = sorted(set(x['e']['dir'] for x in roll))
        maxr = max(x['e']['x'] + x['e']['w'] for x in S)
        check(n + 'bounces off walls while rolling (dir flips, never passes the wall)',
              len(roll) >= 2 and len(dirs) == 2 and maxr <= WALL_X * 16 + 0.5, dict(dirs=dirs, maxRight=maxr))
        # ② 站起來砸地：近距離 → slam（dmg 2 判定框 + 左右兩道震波）
        h.goto(3); h.spawn(key, 5, 9, d=-1)
        S = h.run(240, 2, shot_when='hitbox'); sp = h.spawned(); hu = h.hurts()
        hm = spawned_of(sp, type='hitbox', kind='hammer')
        sk = [x for x in sp if x['type'] == 'hitbox' and x['kind'] == 'shock']
        check(n + 'stands up and slams the ground (dmg 2 hammer hitbox)',
              len(hm) >= 1 and hm[0]['dmg'] == 2 and any(x['e']['spr'] == 'rollarmor_attack' for x in S), dict(hammer=len(hm)))
        check(n + 'slam sends one shockwave to each side', len(sk) >= 2, dict(shock=len(sk)))
        check(n + 'slam reaches the player',
              hitbox_touches_player(S, 'hammer') is not None or any(x['kind'] in ('hammer', 'shock') for x in hu), dict(hurts=hu))
        h.save_shot1(key + '_slam')
        # ③ 鐵殼關著（滾動 / 砸地預備）打不穿；殼張開（open）才扣血
        h.goto(3, 9, ability='sword', immune=True); h.spawn(key, 6, 9, d=-1)
        r = h.ev("""()=>{
          const e = __te, o = {};
          e.setState('roll'); e.stateT = 30; e.invuln = 0;
          o.hp0 = e.hp; o.rollRet = e.hurt(3, {cx: e.cx, cy: e.cy}); o.hpRoll = e.hp;
          e.setState('slam'); e.stateT = 2; e.invuln = 0;
          o.slamRet = e.hurt(3, {cx: e.cx, cy: e.cy}); o.hpSlam = e.hp;
          e.setState('open'); e.openT = 400; e.invuln = 0;
          o.openRet = e.hurt(3, {cx: e.cx, cy: e.cy}); o.hpOpen = e.hp;
          return o;
        }""")
        check(n + 'armored shell (roll / slam windup) blocks all damage',
              r['hpRoll'] == r['hp0'] and r['hpSlam'] == r['hp0'] and r['rollRet'] is True and r['slamRet'] is True, r)
        check(n + 'open shell takes damage', r['hpOpen'] == r['hp0'] - 3, r)
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
        # 有無敵狀態的中魔王（鐵甲滾球的鐵殼）可能擋掉好幾下 → 補打到暈倒為止
        for _ in range(16):
            if e1['stunned'] or e1['dead']: break
            h.taps('attack', 3, 14); e1 = h.ent()
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


# ---------------------------------------------------------------------------
# 階段 6：能力招式 —— 每個能力的每一招都要能打死 waddledee（或達成該招的特殊效果）
#   seq 元素：(按鍵字串 or None, 幀數)；特殊指令：('@air', 上移 px)、('@spawn', 0)、('@tp', 目標 x)
# ---------------------------------------------------------------------------
ABILITY_MOVES = [
    # ability,   label,                 enemy,        ex, ey, seq,                                              wait, px, py
    ('sword',  'X 揮砍',               'waddledee',   4,  9, [('attack', 3)],                                     40,  3, 9),
    ('sword',  '滿血 X 劍氣',           'waddledee',   9,  9, [('attack', 3)],                                     50,  3, 9),
    ('sword',  '空中 X 迴旋斬',         'waddledee',   4,  9, [('@air', 6), ('attack', 3)],                        50,  3, 9),
    ('sword',  '↑+X 上挑斬',           'waddledee',  57,  7, [('up', 3), ('up,attack', 3)],                       40, 57, 9),
    ('hammer', 'X 掄鎚',               'waddledee',   4,  9, [('attack', 3)],                                     40,  3, 9),
    ('hammer', '蓄力 X 大迴旋',         'waddledee',   5,  9, [('attack', 70), ('@spawn', 0), (None, 4)],          70,  3, 9),
    ('hammer', '空中 X 落地震',         'waddledee',   4,  9, [('@air', 24), ('attack', 3)],                       40,  3, 9),
    ('hammer', '↓+X 巨鎚敲擊',         'waddledee',   4,  9, [('down', 3), ('down,attack', 3)],                   50,  3, 9),
    ('fire',   'X 噴火',               'waddledee',   5,  9, [('attack', 32)],                                    30,  3, 9),
    ('fire',   '↓+X 火焰衝刺',         'waddledee',   9,  9, [('down', 3), ('down,attack', 3), (None, 40)],       20,  3, 9),
    ('fire',   '空中 X 火焰旋轉',       'waddledee',   4,  9, [('@air', 6), ('attack', 3)],                        50,  3, 9),
    ('ice',    'X 噴冰',               'waddledee',   5,  9, [('attack', 34)],                                    30,  3, 9),
    ('ice',    '↓+X 冰塊飛踢（冰彈）',    'waddledee',   5,  9, [('down', 3), ('down,attack', 3)],                   40,  3, 9),
    ('ice',    '空中 X 冰晶散射',       'waddledee',   4,  9, [('@air', 6), ('attack', 3)],                        50,  3, 9),
    ('beam',   'X 甩光束',             'waddledee',   5,  9, [('attack', 3)],                                     40,  3, 9),
    ('beam',   '蓄力 X 星潮光束',       'waddledee',   9,  9, [('attack', 60), ('@spawn', 0), (None, 4)],          70,  3, 9),
    ('cutter', 'X 迴旋刃',             'waddledee',   5,  9, [('attack', 3)],                                     50,  3, 9),
    ('cutter', '↑+X 上拋刃',           'waddledee',  57,  7, [('up', 3), ('up,attack', 3)],                       50, 57, 9),
    ('cutter', '↓+X 下劈',             'waddledee',   4,  9, [('down', 3), ('down,attack', 3)],                   50,  3, 9),
    ('spark',  'X 放電',               'waddledee',   4,  9, [('attack', 22)],                                    30,  3, 9),
    ('spark',  '蓄力 X 電擊波',         'waddledee',   6,  9, [('attack', 55), ('@spawn', 0), (None, 4)],          40,  3, 9),
    ('stone',  'X 變石壓扁',           'waddledee',   4,  9, [('@tp', 56), ('attack', 3)],                        40,  3, 9),
    ('stone',  '斜坡滾石衝撞',          'waddledee',  70,  9, [('attack', 3)],                                    160, 64, 6, -1),
]


def run_move(h, ability, enemy, ex, ey, seq, wait, px, py, edir=1):
    """執行一段招式輸入，回傳 (samples, spawned)"""
    h.goto(px, py, ability=ability, immune=True)
    pending = any(c[0] == '@spawn' for c in seq)
    if not pending:
        h.spawn(enemy, ex, ey, d=edir)
    for keys, n in seq:
        if keys == '@spawn':
            h.spawn(enemy, ex, ey, d=edir); continue
        if keys == '@air':
            p = h.player(); h.teleport(p['x'], GROUND_TOP - PLAYER_H - n); h.run(1, 1); continue
        if keys == '@tp':
            p = h.player(); h.teleport(n, p['y']); h.run(1, 1); continue
        h.run(n, n, keys=keys)
    S = h.run(wait, 5)
    return S, h.spawned()


def phase_abilities(h):
    for row in ABILITY_MOVES:
        ability, label, enemy, ex, ey, seq, wait, px, py = row[:9]
        edir = row[9] if len(row) > 9 else 1
        nm = f'{ability} [{label}]'
        try:
            S, sp = run_move(h, ability, enemy, ex, ey, seq, wait, px, py, edir)
            e = S[-1]['e']
            check(nm + ': kills waddledee', e['dead'], dict(hp=e['hp'], x=e['x'], playerState=S[-1]['p']['state']))
            # 攻擊結束後不可卡在 attack 狀態
            st = S[-1]['p']['state']
            check(nm + ': player returns to a normal state', st in ('idle', 'walk', 'run', 'fall', 'jump', 'crouch', 'stone'), st)
        except Exception as ex_:
            check(nm + ': raised', False, repr(ex_))
    # 招式專屬效果
    S, sp = run_move(h, 'sword', 'waddledee', 9, 9, [('attack', 3)], 40, 3, 9)
    check('sword 滿血劍氣: spawns proj_swordwave', len(spawned_of(sp, type='proj', spr='proj_swordwave')) >= 1, '')
    # 非滿血時不射劍氣
    h.goto(3, 9, ability='sword', immune=False)
    h.ev("()=>{KB.player.hp = 3;}")
    h.run(3, 3, keys='attack'); h.run(20, 10)
    check('sword 劍氣: only at full HP', len(spawned_of(h.spawned(), type='proj', spr='proj_swordwave')) == 0, '')
    # 冰塊飛踢：把凍住的敵人踢成冰塊投射物
    h.goto(3, 9, ability='ice', immune=True)
    h.spawn('bladeknight', 5, 9, d=1)
    h.run(16, 16, keys='attack'); h.release(); h.run(4, 4)
    frozen = h.ent()
    h.run(3, 3, keys='down'); h.run(3, 3, keys='down,attack'); S = h.run(30, 5)
    ice = [o for x in S for o in x['o'] if o['name'] == 'iceblock']
    check('ice 冰塊飛踢: frozen enemy becomes a flying ice block',
          frozen['freezeT'] > 0 and bool(ice) and S[-1]['e']['dead'], dict(freezeT=frozen['freezeT'], blocks=len(ice)))
    # 牽星光環：命中有能力的敵人 → 直接取得該能力
    h.goto(3, 9, ability='beam', immune=True)
    h.spawn('chilly', 5, 9, d=1)
    h.run(3, 3, keys='down'); h.run(3, 3, keys='down,attack'); S = h.run(30, 5)
    check('beam 牽星光環: steals the enemy ability (chilly -> ice)',
          S[-1]['p']['ability'] == 'ice' and S[-1]['e']['dead'], dict(ability=S[-1]['p']['ability'], dead=S[-1]['e']['dead']))
    # 電擊：放電中仍可緩慢移動
    h.goto(3, 9, ability='spark', immune=True)
    x0 = h.player()['x']
    S = h.run(40, 10, keys='attack,right')
    check('spark 帶電慢走: can still walk while discharging', S[-1]['p']['x'] > x0 + 8, dict(x0=x0, x1=S[-1]['p']['x']))
    # 石頭：每次變身隨機外觀（至少出現 2 種）
    forms = set()
    for _ in range(12):
        h.goto(3, 9, ability='stone', immune=True)
        h.run(2, 2, keys='attack'); h.release(); h.run(2, 2)
        f = h.stone_form()
        if f: forms.add(f)
    check('stone 變身: random appearance (>=2 of kirby_stone_1/2/3)', len(forms) >= 2, sorted(forms))
    # 石頭：斜坡上會加速滾動且判定提升到 dmg 8
    h.goto(64, 6, ability='stone', immune=True)
    h.spawn('waddledee', 70, 9, d=-1)
    h.run(3, 3, keys='attack'); h.release()
    S = h.run(150, 3)
    vmax = max(abs(x['p']['x'] - S[i - 1]['p']['x']) / 3 for i, x in enumerate(S) if i)
    dmg = h.ev("()=>KB.player.stoneBox ? KB.player.stoneBox.dmg : 0")
    check('stone 斜坡滾石: accelerates down the slope (>= 2 px/frame)', vmax >= 2.0, dict(maxSpeed=round(vmax, 2)))
    check('stone 斜坡滾石: smashes the enemy at the bottom', S[-1]['e']['dead'], dict(dead=S[-1]['e']['dead'], px=S[-1]['p']['x']))
    # moves / desc 資料（ui-menu 說明卡會讀）
    for k in ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer']:
        d = h.ability_moves(k)
        ok = bool(d['desc']) and isinstance(d['moves'], list) and len(d['moves']) >= 3 and all(len(m) == 2 and m[0] and m[1] for m in d['moves'])
        check(f'{k}: has desc + >=3 moves for the pause card', ok, d)


# ---------------------------------------------------------------------------
# 階段 7：敵人掉落表（entity.js 的 Enemy.dropTable / rollDrop）
#   機率設成 0 / 1 就是確定性行為，測試不靠隨機。
# ---------------------------------------------------------------------------
DROP_NAMES = ('pointstar', 'food', 'tomato', 'oneup', 'candy')

def dropped(h):
    """本次 goto 之後由 KB.spawn 生出來的掉落道具（用 spawn 紀錄而不是場上實體：
    道具可能一落地就被站在旁邊的卡比撿走）"""
    return [x['name'] for x in h.spawned() if x['type'] == 'item' and x['name'] in DROP_NAMES]


def kill_with_table(h, enemy, table, boss_room=False, drop=None, taps=6):
    """生一隻敵人、覆寫牠的掉落表，用劍打死，回傳掉出來的道具名稱"""
    h.goto(3, 9, ability='sword', immune=True)
    h.spawn(enemy, 5, 9, d=-1)
    if drop is not None:
        h.ev("(d)=>{__te.dropItem = d;}", drop)
    h.ev("([t, b])=>{ __te.dropTable = t; KB.game.isBossRoom = b; }", [table, bool(boss_room)])
    h.taps('attack', taps, 14)
    for _ in range(16):
        e = h.ent()
        if e['dead'] or e['stunned']: break
        h.taps('attack', 3, 14)
    h.run(10, 10)
    return dropped(h)


def phase_drops(h):
    n = 'drops: '
    tbl = h.ev("()=>({enemy: new KB.ENEMIES.waddledee(0,0).dropTable, mini: new KB.ENEMIES.bonkers(0,0).dropTable})")
    check(n + 'default tables (Enemy 0.25/0.05, MiniBoss 0.5/0.1)',
          tbl['enemy'] == {'pointstar': 0.25, 'food': 0.05} and tbl['mini'] == {'tomato': 0.5, 'oneup': 0.1}, tbl)
    it = kill_with_table(h, 'waddledee', {'pointstar': 1})
    check(n + 'probability 1 always drops', it.count('pointstar') == 1 and len(it) == 1, it)
    it = kill_with_table(h, 'waddledee', {'pointstar': 0, 'food': 0})
    check(n + 'probability 0 never drops', it == [], it)
    it = kill_with_table(h, 'waddledee', {'tomato': 1, 'oneup': 1})
    check(n + 'at most one item per kill (first hit in the table wins)', it == ['tomato'], it)
    it = kill_with_table(h, 'waddledee', {'pointstar': 1}, boss_room=True)
    check(n + 'no drops in a boss room', it == [], it)
    it = kill_with_table(h, 'waddledee', {'pointstar': 1}, drop='oneup')
    check(n + "spawnDef 'drop' overrides the table", it == ['oneup'], it)
    # 被吸入吞下不掉落（onInhaled 不經過 die）
    h.goto(3, 9)
    h.spawn('waddledee', 6, 9, d=-1)
    h.ev("()=>{__te.dropTable = {pointstar: 1};}")
    S, took = inhale_until(h, 90)
    check(n + 'inhaled (swallowed) enemies drop nothing', took is not None and dropped(h) == [], dict(took=took, items=dropped(h)))
    # 掉出地圖不掉落
    h.goto(3, 9)
    h.spawn('waddledee', 6, 9, d=-1)
    h.ev("()=>{__te.dropTable = {pointstar: 1}; __te.y = KB.game.map.ph + 200;}")
    h.run(20, 10)
    check(n + 'enemies that fall out of the map drop nothing', h.ent()['dead'] and dropped(h) == [], dropped(h))
    # 中魔王：被打倒（暈倒）的那一刻掉，吸入時不重複掉
    h.goto(3, 9, ability='sword', immune=True)
    h.spawn('bonkers', 5, 9, d=-1)
    h.ev("()=>{__te.dropTable = {tomato: 1};}")
    for _ in range(20):
        e = h.ent()
        if e['stunned'] or e['dead']: break
        h.taps('attack', 3, 14)
    at_stun = dropped(h)
    check(n + 'mini-boss drops when it is knocked down (stun)', at_stun == ['tomato'], dict(stunned=h.ent()['stunned'], items=at_stun))
    h.ev("()=>__t.dropAbility()")
    e1 = h.ent(); pl = h.player()
    if abs(e1['cx'] - pl['cx']) > 44: h.teleport(e1['cx'] - 40, pl['y'])
    S, took = inhale_until(h, 120)
    check(n + 'inhaling the stunned mini-boss does not drop again', took is not None and dropped(h) == at_stun,
          dict(took=took, before=at_stun, after=dropped(h)))


# ---------------------------------------------------------------------------
# 階段 8：Extra（超難）難度鉤子（KB.session.extra）
# ---------------------------------------------------------------------------
def phase_extra(h):
    n = 'extra: '
    h.goto(3)
    ex = h.ev("()=>({on: KB.extraOn(), tbl: KB.EXTRA, spd: KB.exK('spd'), proj: KB.exK('proj'), ph: KB.exPhase2()})")
    check(n + 'KB.EXTRA table exists and is OFF by default',
          ex['on'] is False and ex['spd'] == 1 and ex['proj'] == 1 and ex['ph'] == 0.5
          and ex['tbl'] == {'spd': 1.2, 'proj': 1.2, 'bossHp': 1.25, 'miniHp': 1.25, 'phase2': 0.6}, ex)

    def walk_speed(v):
        h.goto(3); h.extra(v)
        h.spawn('waddledee', 8, 9, d=1)
        S = h.run(60, 10)
        return max(abs(x['e']['vx']) for x in S)
    v0, v1 = walk_speed(False), walk_speed(True)
    check(n + 'enemy movement speed x1.2', abs(v1 - v0 * 1.2) < 0.02, dict(normal=v0, extra=v1))

    # 敵方投射物初速 ×1.2（玩家的不受影響）
    pr = h.ev("""()=>{
      const mk = o => { const p = new KB.Projectile(Object.assign({spr:'proj_star', x:100, y:100, vx:2, vy:-3}, o)); p.dead = true; return {vx:+p.vx.toFixed(3), vy:+p.vy.toFixed(3)}; };
      KB.session.extra = false; const a = mk({owner:'enemy'});
      KB.session.extra = true;  const b = mk({owner:'enemy'}), c = mk({owner:'player'});
      KB.session.extra = false;
      return {normal:a, extra:b, player:c};
    }""")
    check(n + 'enemy projectile speed x1.2 (player projectiles unchanged)',
          abs(pr['extra']['vx'] - 2.4) < 1e-6 and abs(pr['extra']['vy'] + 3.6) < 1e-6
          and pr['normal'] == {'vx': 2, 'vy': -3} and pr['player'] == {'vx': 2, 'vy': -3}, pr)
    # 實戰：shotzo 的砲彈也要快 1.2 倍
    def cannon_vx(v):
        h.goto(3); h.extra(v)
        h.spawn('shotzo', 10, 8)
        S = h.run(200, 4)
        vs = [abs(o['vx']) for x in S for o in x['o'] if o['kind'] == 'cannon']
        return max(vs) if vs else 0
    c0, c1 = cannon_vx(False), cannon_vx(True)
    check(n + 'in game: shotzo cannonball x1.2', c0 > 0 and abs(c1 - c0 * 1.2) < 0.03, dict(normal=c0, extra=c1))

    # 中魔王 HP ×1.25
    def mini_hp(v):
        h.goto(3); h.extra(v)
        h.spawn('rollarmor', 9, 9, d=-1)
        h.run(3, 3)
        e = h.ent(); return (e['hp'], h.ev("()=>__te.maxHp"))
    m0, m1 = mini_hp(False), mini_hp(True)
    check(n + 'mini-boss HP x1.25 (12 -> 15)', m0 == (12, 12) and m1 == (15, 15), dict(normal=m0, extra=m1))
    b0 = mini_hp(False)
    check(n + 'mini-boss HP back to normal when extra is off', b0 == (12, 12), b0)

    # 魔王 maxHp ×1.25、二階段門檻 50% → 60%
    bs = h.ev("""()=>{
      const mk = () => { const b = new KB.BOSSES.whispywoods(200, 144); b.ensureExtra(); return {maxHp:b.maxHp, hp:b.hp, half:b.half}; };
      KB.session.extra = false; const a = mk();
      KB.session.extra = true;  const b = mk();
      KB.session.extra = false;
      return {normal:a, extra:b};
    }""")
    check(n + 'boss maxHp x1.25 (40 -> 50) and hp starts full',
          bs['normal']['maxHp'] == 40 and bs['extra']['maxHp'] == 50 and bs['extra']['hp'] == 50, bs)
    check(n + 'phase 2 threshold 50% -> 60%',
          abs(bs['normal']['half'] - 20) < 1e-6 and abs(bs['extra']['half'] - 30) < 1e-6, bs)
    h.extra(False)


# ---------------------------------------------------------------------------
# 階段 6（Round 3 balance-enemies）：敵人行為分世界
#   強度來源 = KB.game.level.id 裡的數字（測試關卡 'etw1'~'etw5'），spawnDef.a 為 1~5 的數字時覆寫。
#   w1~w2 = 基礎行為，w3 起 = 強化行為（接刃 / 6 道掃射 / 短冷卻）。
# ---------------------------------------------------------------------------
def _bomb_frames(sp):
    return [b['f'] for b in spawned_of(sp, cls='Bomb')]


def phase_world(h):
    n = 'world: '
    # ---- tier 的來源與覆寫 ----
    h.goto(3, 9, level='etw1', immune=True); e = h.spawn('waddledee', 8, 9, d=-1)
    check(n + 'level id w1 -> tier 1 (basic behaviour)', e['tier'] == 1 and not e['tough'] and abs(e['alertK'] - 1.1) < 1e-6, dict(tier=e['tier'], tough=e['tough'], alertK=e['alertK']))
    h.goto(3, 9, level='etw5', immune=True); e = h.spawn('waddledee', 8, 9, d=-1)
    check(n + 'level id w5 -> tier 5 (tough behaviour)', e['tier'] == 5 and e['tough'] and abs(e['alertK'] - 1.25) < 1e-6, dict(tier=e['tier'], alertK=e['alertK']))
    h.goto(3, 9, level='etw1', immune=True); e = h.spawn('waddledee', 8, 9, d=-1, a=4)
    check(n + 'spawnDef.a overrides tier (a=4 inside w1)', e['tier'] == 4 and e['tough'], dict(tier=e['tier']))
    h.goto(3, 9, immune=True); e = h.spawn('waddledee', 8, 9, d=-1)
    check(n + "unknown level id -> tier 3 (full behaviour)", e['tier'] == 3 and e['tough'], dict(tier=e['tier']))

    # ---- Sir Kibble：w1~w2 不接刃、間隔 >= 90；w3 起接刃、間隔 60 ----
    gaps = {}
    for lid, tier in (('etw1', 1), ('etw3', 3)):
        h.goto(3, 9, level=lid, immune=True)
        e = h.spawn('sirkibble', 7, 9, d=-1)
        h.run(420, 6)
        fs = [b['f'] for b in spawned_of(h.spawned(), cls='Boomerang')]
        gaps[lid] = min((fs[i + 1] - fs[i] for i in range(len(fs) - 1)), default=None)
        check(n + f'sirkibble {lid}: canCatch={tier >= 3}', e['canCatch'] == (tier >= 3), dict(tier=e['tier'], canCatch=e['canCatch'], throwCD=e['throwCD']))
        check(n + f'sirkibble {lid}: throwCD {"60" if tier >= 3 else ">=90"}', e['throwCD'] == (60 if tier >= 3 else 90), dict(throwCD=e['throwCD']))
    check(n + 'sirkibble: w1 throws less often than w3', gaps['etw1'] is not None and gaps['etw3'] is not None and gaps['etw1'] >= 90 and gaps['etw1'] > gaps['etw3'], gaps)

    # ---- Waddle Doo：w1~w2 只掃 3 道，w3 起 6 道 ----
    for lid, want in (('etw1', 3), ('etw4', 6)):
        h.goto(3, 9, level=lid, immune=True)
        h.spawn('waddledoo', 6, 9, d=-1)
        h.run(200, 5)
        beams = spawned_of(h.spawned(), type='proj', kind='beam')
        burst = [b for b in beams if beams and b['f'] <= beams[0]['f'] + 24]
        check(n + f'waddledoo {lid}: fan = {want} beams', len(burst) == want, dict(burst=len(burst), total=len(beams)))

    # ---- Hot Head：w1 噴火持續縮短 30%（30 → 21 幀）----
    flame = {}
    for lid in ('etw1', 'etw3'):
        h.goto(3, 9, level=lid, immune=True)
        h.spawn('hothead', 5, 9, d=-1)
        S = h.run(240, 1)
        runs, cur = [], 0
        for s in S:
            if any(o['type'] == 'hitbox' and o['kind'] == 'fire' for o in s['o']): cur += 1
            elif cur: runs.append(cur); cur = 0
        if cur: runs.append(cur)
        flame[lid] = max(runs) if runs else 0
        flame[lid + '_runs'] = runs
    check(n + 'hothead: w1 flame ~30% shorter than w3 (30 -> 21 frames)',
          flame['etw1'] and flame['etw3'] and flame['etw1'] <= flame['etw3'] * 0.78, flame)

    # ---- Shotzo：射程 120、開火間隔 w1~w2 ×1.6 / w3~w5 ×1.3 ----
    h.goto(3, 9, level='etw1', immune=True); e = h.spawn('shotzo', 10, 8)
    check(n + 'shotzo: range 170 -> 120', e['range'] == 120, dict(range=e['range']))
    check(n + 'shotzo: w1 fire interval 100 x1.6 = 160', e['fireCD'] == 160, dict(fireCD=e['fireCD']))
    h.goto(3, 9, level='etw4', immune=True); e = h.spawn('shotzo', 10, 8)
    check(n + 'shotzo: w4 fire interval 100 x1.3 = 130', e['fireCD'] == 130, dict(fireCD=e['fireCD']))
    # 射程外（玩家 x=3 → cx=10；砲台放在 x=12 格 → cx=200，相距 190 > 120）不開火
    h.goto(3, 9, level='etw3', immune=True); h.spawn('shotzo', 12, 8)
    h.run(240, 8)
    far = spawned_of(h.spawned(), type='proj', kind='cannon')
    h.goto(3, 9, level='etw3', immune=True); h.spawn('shotzo', 8, 8)
    S = h.run(240, 4)
    near = spawned_of(h.spawned(), type='proj', kind='cannon')
    check(n + 'shotzo: no fire beyond 120px, fires inside it', len(far) == 0 and len(near) >= 1, dict(far=len(far), near=len(near)))
    # 砲彈速度不變（2.5 px/f，Extra 關閉時）
    spd = [round((o['vx'] ** 2 + o['vy'] ** 2) ** 0.5, 2) for s2 in S for o in s2['o'] if o['kind'] == 'cannon']
    check(n + 'shotzo: cannonball speed unchanged (2.5 px/f)', bool(spd) and all(abs(v - 2.5) < 0.06 for v in spd), dict(speeds=spd[:4]))

    # ---- Poppy Bros：18 幀舉手預警、距離 < 48px 不丟改跳開、w1~w2 間隔 ×1.5 ----
    h.goto(3, 9, level='etw1', immune=True); e = h.spawn('poppybros', 9, 9, d=-1)
    check(n + 'poppybros: w1 throw interval 80 x1.5 = 120', e['throwCD'] == 120, dict(throwCD=e['throwCD']))
    S = h.run(300, 1); sp = h.spawned()
    wind = [s['f'] for s in S if s['e']['windT'] > 0]
    bombs = _bomb_frames(sp)
    # 舉手預警：第一顆炸彈之前必須有連續 18 幀的 windT
    lead = len([f for f in wind if bombs and f < bombs[0]])
    check(n + 'poppybros: 18-frame wind-up before the first bomb', len(bombs) >= 1 and lead >= 16, dict(bombs=len(bombs), windFrames=lead))
    check(n + 'poppybros: frozen (hop frame 0) while winding up', all(abs(s['e']['vx']) < 0.01 for s in S if s['e']['windT'] > 0), '')
    h.goto(3, 9, level='etw4', immune=True); e = h.spawn('poppybros', 9, 9, d=-1)
    check(n + 'poppybros: w4 throw interval stays 80', e['throwCD'] == 80, dict(throwCD=e['throwCD']))
    # 貼臉（< 48px）：不丟炸彈，改跳開
    h.goto(3, 9, level='etw3', immune=True)
    h.spawn('poppybros', 5, 9, d=-1)
    h.teleport(64, 144)                      # 卡比 cx≈71、poppy cx≈87 → 相距約 16px
    S = h.run(150, 1); sp = h.spawned()
    bombs_close = spawned_of(sp, cls='Bomb')
    # 只看「一直維持貼臉」的那段：距離從頭到尾都 < 48px 就不該有炸彈
    stayed_close = all(abs(s['e']['cx'] - s['p']['cx']) < 60 for s in S[:60])
    hopped = any(abs(s['e']['vx']) > 0.5 and not s['e']['onGround'] for s in S[:90])
    check(n + 'poppybros: point-blank (< 48px) -> hops away instead of bombing',
          stayed_close and hopped and len(bombs_close) == 0,
          dict(bombs=len(bombs_close), hopped=hopped, stayedClose=stayed_close))

    # ---- 察覺加速倍率 ----
    for lid, k in (('etw2', 1.1), ('etw3', 1.25)):
        h.goto(3, 9, level=lid, immune=True); e = h.spawn('waddledee', 8, 9, d=-1)
        check(n + f'notice speed multiplier {lid} = {k}', abs(e['alertK'] - k) < 1e-6, dict(alertK=e['alertK']))


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', action='store_true'); ap.add_argument('--only', default='')
    ap.add_argument('--hitbox', action='store_true'); ap.add_argument('-v', action='store_true')
    a = ap.parse_args(); VERBOSE = a.v
    keys = [k for k in a.only.split(',') if k] or ORDER
    run_abilities = (not a.only) or ('abilities' in keys)
    run_extras = (not a.only) or ('drops' in keys) or ('extra' in keys) or ('world' in keys)
    only_drops = 'drops' in keys
    only_extra = 'extra' in keys
    only_world = 'world' in keys
    keys = [k for k in keys if k not in ('abilities', 'drops', 'extra', 'world')]
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
        if run_abilities:
            print('-' * 8, 'abilities')
            n0 = len(logs)
            phase_abilities(h)
            errs = [l for l in logs[n0:] if 'pageerror' in l or 'console.error' in l]
            check('abilities: no page errors', not errs, errs[:3])
        if run_extras:
            for label, fn, want in (('drops', phase_drops, only_drops), ('extra', phase_extra, only_extra), ('world', phase_world, only_world)):
                if a.only and not want: continue
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
