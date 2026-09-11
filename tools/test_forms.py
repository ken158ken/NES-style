# -*- coding: utf-8 -*-
"""
變身系能力自動驗證（Round 5 forms）：giant 巨大化 / dragon 龍化 / mech 機甲 / ghost 幽靈。
仿 tools/enemy_test.py 的 Harness，注入程式化測試關卡後逐項檢查並印出 PASS / FAIL。

  1. 變身生效：取得能力時 p.form 正確（scale / fly / armor / noclip）、碰撞框等比例、sizeMul
  2. 每一招：命中 waddledee 會死 + 招式結束回到正常狀態（不卡在 attack）
  3. giant：900 幀後自動縮小並失去能力；吸入範圍 ×2 可直接吞下中魔王；↓+X 可破硬磚 X
  4. dragon：按住跳會持續上升（飛行）
  5. mech：受傷扣裝甲不掉能力；裝甲歸零 → armor_break 解除變身
  6. ghost：noclip 穿過 1 格薄牆、被 3 格厚牆擋回；附身敵人 → 解除時敵人死亡；隱身
  7. 4 種新敵人吞下後給對應能力
  8. moves / desc / flavour 資料（暫停說明卡會讀）與精靈完整性
  9. 全程監看 pageerror / console.error

用法：python tools/test_forms.py [--shots] [--only giant,ghost] [--hitbox] [-v]
"""
import sys, json, pathlib, base64, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots' / 'agent_forms'

# ---------------------------------------------------------------------------
# 測試地圖：W=80, H=12。地面 row 10-11。
#   col 20 rows 8~9   硬磚 X（giant ↓+X 衝撞要打破）
#   col 30 rows 4~9   1 格厚牆（ghost 穿得過）
#   col 40~42 rows 4~9 3 格厚牆（ghost 穿不過，會被推回）
#   col 56~59 row 8   單向平台（↑+X 類招式把敵人放在高處）
# ---------------------------------------------------------------------------
W, H = 80, 12
grid = [['.'] * W for _ in range(H)]


def fill(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            grid[y][x] = ch


fill(0, 10, W - 1, 11, '#')
HARD_X, HARD_Y0, HARD_Y1 = 20, 8, 9
fill(HARD_X, HARD_Y0, HARD_X, HARD_Y1, 'X')
THIN_X = 30
fill(THIN_X, 4, THIN_X, 9, '#')
THICK_X0, THICK_X1 = 40, 42
fill(THICK_X0, 4, THICK_X1, 9, '#')
PLAT_X0, PLAT_X1 = 56, 59
fill(PLAT_X0, 8, PLAT_X1, 8, '=')
MAP = [''.join(r) for r in grid]

TEST_LEVEL = "KB.LEVELS.push(" + json.dumps({
    'id': 'ftest', 'name': 'FORM TEST', 'theme': 'green', 'music': None, 'boss': None,
    'rooms': [{'map': MAP, 'spawn': [3, 9], 'entities': [], 'noBoss': True}],
}, ensure_ascii=False) + ");"

GROUND_TOP = 160          # row 10 上緣
PLAYER_H = 15
KEYS = ['giant', 'dragon', 'mech', 'ghost']

HOOK_JS = r"""() => {
  window.__spawned = []; window.__te = null;
  const os = KB.spawn;
  KB.spawn = e => {
    if (KB.game) __spawned.push({ f: KB.game.frame, type: e.type, kind: e.kind || '', spr: e.spr || '',
      owner: e.owner || '', cls: e.constructor.name, name: e.name || '', dmg: e.dmg, w: e.w, h: e.h });
    return os(e);
  };
  const cap = () => { __kb.render(); const c = KB.canvas, o = document.createElement('canvas');
    o.width = c.width * 3; o.height = c.height * 3; const x = o.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };
  window.__t = {
    goto(o) {
      __kb.release();
      __kb.goto('game', Object.assign({ level: 'ftest', room: 0, nofade: true }, o));
      __spawned.length = 0; __te = null;
      const p = KB.player;
      if (o.ability) { p.ability = null; p.abilityData = {}; p._abilityKey = null; p.giveAbility(o.ability); }
      // 變身大演出會停格 10 幀 + 黑邊，測試不需要 → 直接跳過
      KB.game.freezeT = 0; if (KB.VFX && KB.VFX.clear) KB.VFX.clear();
      if (o.immune) p.invuln = 1e9;
      __kb.step(2);
      return true;
    },
    immune(v) { KB.player.invuln = v ? 1e9 : 0; },
    spawn(d) { const e = KB.game.spawnDef(d); __te = e; __kb.step(1); return __t.ent(); },
    ent() {
      const e = __te; if (!e) return null;
      return { x: +e.x.toFixed(1), y: +e.y.toFixed(1), cx: +e.cx.toFixed(1), cy: +e.cy.toFixed(1),
        w: e.w, h: e.h, vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), dir: e.dir, state: e.state, spr: e.spr,
        hp: e.hp, dead: e.dead, onGround: e.onGround, active: e.active, inhalable: e.inhalable,
        freezeT: e.freezeT | 0, alert: !!e.alert, solid: e.solid, fellOut: !!e.fellOut,
        inSolid: KB.game.map.isSolidPx(e.cx, e.cy) };
    },
    player() {
      const p = KB.player, f = p.form;
      return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1),
        bottom: +p.bottom.toFixed(1), w: p.w, h: p.h, stepH: p.stepH, vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
        hp: p.hp, state: p.state, ability: p.ability, mouth: p.mouth, dir: p.dir, onGround: p.onGround,
        sizeMul: p.sizeMul, possessed: p.possessed ? (p.possessed.name || 'enemy') : null, invuln: p.invuln | 0,
        form: f ? { key: f.key, scale: f.scale || 1, noclip: !!f.noclip, fly: !!f.fly, armor: f.armor || 0,
          hp: f.hp === undefined ? null : f.hp, alpha: f.alpha === undefined ? null : f.alpha,
          hidden: !!f.hidden, inhaleAll: !!f.inhaleAll } : null };
    },
    others() {
      return KB.game.entities.filter(e => !e.dead && (e.type === 'proj' || e.type === 'hitbox' || (e.type === 'enemy' && e !== __te)))
        .map(e => ({ type: e.type, kind: e.kind || '', spr: e.spr || '', owner: e.owner || '', name: e.name || '',
          cls: e.constructor.name, x: +e.x.toFixed(1), y: +e.y.toFixed(1), w: e.w, h: e.h, dmg: e.dmg | 0 }));
    },
    sample() { return { f: KB.game.frame, e: __t.ent(), o: __t.others(), p: __t.player() }; },
    run(n, every, keys) {
      const out = []; if (keys) __kb.press(keys); else __kb.release();
      for (let i = 0; i < n; i += every) { __kb.step(Math.min(every, n - i)); out.push(__t.sample()); }
      return out;
    },
    spawned() { return __spawned.slice(); },
    teleport(x, y) { const p = KB.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; },
    hurt(n, fromRight) {
      const p = KB.player; p.invuln = 0;
      const r = p.hurt(n, { cx: p.cx + (fromRight ? 24 : -24), cy: p.cy });
      return { ok: !!r, hp: p.hp, ability: p.ability, form: __t.player().form };
    },
    tile(tx, ty) { return KB.game.map.get(tx, ty); },
    info(k) { const d = KB.ABILITIES[k] || {};
      return { name: d.name || null, hud: d.hudName || null, desc: d.desc || null, flavour: d.flavour || null,
        moves: d.moves || null, color: d.color || null, transform: !!d.transform, icon: d.icon || null }; },
    has(n) { return KB.has(n); },
    keys() { return (KB.ABILITY_KEYS || []).slice(); },
    save() { return (KB.save && KB.save.seen) || null; },
    shot() { return cap(); },
  };
  return true;
}"""

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
        if immune: o['immune'] = True
        self.ev("(o)=>__t.goto(o)", o)
        if self.hitbox: self.ev("()=>__kb.hitbox(true)")

    def spawn(self, t, x, y, d=None):
        o = {'t': t, 'x': x, 'y': y}
        if d is not None: o['dir'] = d
        return self.ev("(o)=>__t.spawn(o)", o)

    def run(self, n, every=5, keys=None):
        return self.ev("([n,e,k])=>__t.run(n,e,k)", [n, every, {k: True for k in keys.split(',')} if keys else None])

    def ent(self): return self.ev("()=>__t.ent()")
    def player(self): return self.ev("()=>__t.player()")
    def others(self): return self.ev("()=>__t.others()")
    def spawned(self): return self.ev("()=>__t.spawned()")
    def teleport(self, x, y): self.ev("([x,y])=>__t.teleport(x,y)", [x, y])
    def hurt(self, n=1, from_right=True): return self.ev("([n,r])=>__t.hurt(n,r)", [n, bool(from_right)])
    def tile(self, tx, ty): return self.ev("([a,b])=>__t.tile(a,b)", [tx, ty])
    def info(self, k): return self.ev("(k)=>__t.info(k)", k)
    def has(self, n): return self.ev("(n)=>__t.has(n)", n)
    def akeys(self): return self.ev("()=>__t.keys()")
    def release(self): self.ev("()=>__kb.release()")
    def press(self, keys): self.ev("(o)=>__kb.press(o)", {k: True for k in keys.split(',')})

    def save_shot(self, name):
        if not self.shots: return
        data = self.ev("()=>__t.shot()")
        if not data: return
        SHOTS.mkdir(parents=True, exist_ok=True)
        (SHOTS / f'test_{name}.png').write_bytes(base64.b64decode(data.split(',', 1)[1]))


def spawned_of(sp, **kw):
    out = []
    for s in sp:
        ok = True
        for k, v in kw.items():
            if s.get(k) != v: ok = False; break
        if ok: out.append(s)
    return out


# ---------------------------------------------------------------------------
# 階段 1：變身生效
# ---------------------------------------------------------------------------
FORM_SPEC = {
    'giant':  dict(scale=2, fly=False, armor=0, noclip=False, inhaleAll=True),
    'dragon': dict(scale=1, fly=True, armor=0, noclip=False, inhaleAll=False),
    'mech':   dict(scale=1, fly=False, armor=1, noclip=False, inhaleAll=False),
    'ghost':  dict(scale=1, fly=False, armor=0, noclip=True, inhaleAll=False),
}


def phase_form(h, key):
    n = f'{key}: '
    h.goto(3, 9, ability=key, immune=True)
    p = h.player()
    f = p['form']
    if not check(n + 'giveAbility 產生 p.form', bool(f), p): return
    spec = FORM_SPEC[key]
    ok = (f['key'] == key and f['scale'] == spec['scale'] and f['fly'] == spec['fly']
          and f['armor'] == spec['armor'] and f['noclip'] == spec['noclip'] and f['inhaleAll'] == spec['inhaleAll'])
    check(n + 'form 旗標正確（scale/fly/armor/noclip/inhaleAll）', ok, f)
    # 碰撞框等比例（底部不變）
    s = spec['scale']
    check(n + f'碰撞框依 scale 調整（w={14*s} h={15*s} stepH={8*s}）',
          p['w'] == 14 * s and p['h'] == 15 * s and p['stepH'] == 8 * s,
          dict(w=p['w'], h=p['h'], stepH=p['stepH']))
    check(n + 'p.sizeMul == scale', p['sizeMul'] == s, p['sizeMul'])
    check(n + '變身後仍站在地面上（bottom 不變）', abs(p['bottom'] - GROUND_TOP) < 1.5 or not p['onGround'],
          dict(bottom=p['bottom'], onGround=p['onGround']))
    # 圖鑑「已見過」
    seen = h.ev("()=>__t.save()")
    check(n + 'KB.save.seen 有紀錄', bool(seen) and seen.get(key) is True, seen)
    # 丟棄能力 → form 清除、碰撞框還原
    h.ev("()=>{KB.player.dropAbility(false);}")
    h.run(3, 3)
    p2 = h.player()
    check(n + 'dropAbility 會清掉 form 並還原碰撞框',
          p2['form'] is None and p2['w'] == 14 and p2['h'] == 15 and p2['sizeMul'] == 1, p2)
    h.save_shot(key + '_form')


# ---------------------------------------------------------------------------
# 階段 2：招式（命中 waddledee 會死 + 結束回正常狀態）
# ---------------------------------------------------------------------------
NORMAL_STATES = ('idle', 'walk', 'run', 'fall', 'jump', 'crouch', 'swim')
MOVES = [
    # ability, label,              enemy,       ex, ey, seq,                                             wait, px, py
    ('giant',  'X 巨腳踩踏',        'waddledee',  6,  9, [('attack', 3)],                                  70,  3, 9),
    ('giant',  '↓+X 巨人衝撞',      'waddledee', 10,  9, [('down', 3), ('down,attack', 3), (None, 26)],     40,  3, 9),
    ('giant',  '空中 X 屁股墜落',    'waddledee',  6,  9, [('@air', 40), ('attack', 3)],                    80,  3, 9),
    ('dragon', 'X 龍息',            'waddledee',  6,  9, [('attack', 34)],                                 40,  3, 9),
    ('dragon', '↓+X 尾擊',          'waddledee',  5,  9, [('down', 3), ('down,attack', 3)],                 40,  3, 9),
    ('dragon', '空中 X 俯衝',        'waddledee',  8,  9, [('@air', 44), ('attack', 3)],                    70,  3, 9),
    ('dragon', '蓄力 必殺 龍炎彈',   'waddledee', 14,  9, [('attack', 74), ('@spawn', 0), (None, 4)],       110,  3, 9),
    ('mech',   'X 火箭拳',          'waddledee',  7,  9, [('attack', 3)],                                  60,  3, 9),
    ('mech',   '↑+X 追蹤飛彈',      'waddledee',  9,  9, [('up', 3), ('up,attack', 3)],                     90,  3, 9),
    ('mech',   '空中 X 噴射墜踩',    'waddledee',  5,  9, [('@air', 40), ('attack', 3)],                    80,  3, 9),
    ('mech',   '蓄力 必殺 全彈發射', 'waddledee', 10,  9, [('attack', 74), ('@spawn', 0), (None, 4)],       130,  3, 9),
    ('ghost',  '空中 X 幽靈哀嚎',    'waddledee',  5,  9, [('attack', 3), (None, 22), ('@air', 26), ('@spawn', 0), ('attack', 3)], 50, 3, 9),
]


def run_move(h, ability, enemy, ex, ey, seq, wait, px, py, edir=1):
    h.goto(px, py, ability=ability, immune=True)
    pending = any(c[0] == '@spawn' for c in seq)
    if not pending:
        h.spawn(enemy, ex, ey, d=edir)
    for keys, n in seq:
        if keys == '@spawn':
            h.spawn(enemy, ex, ey, d=edir); continue
        if keys == '@air':
            p = h.player(); h.teleport(p['x'], GROUND_TOP - p['h'] - n); h.run(1, 1); continue
        h.run(n, n, keys=keys)
    S = h.run(wait, 5)
    return S, h.spawned()


def phase_moves(h, only=None):
    for row in MOVES:
        ability, label, enemy, ex, ey, seq, wait, px, py = row[:9]
        if only and ability not in only: continue
        nm = f'{ability} [{label}]'
        try:
            S, sp = run_move(h, ability, enemy, ex, ey, seq, wait, px, py)
            e = S[-1]['e']
            check(nm + ': kills waddledee', e['dead'], dict(hp=e['hp'], x=e['x'], px=S[-1]['p']['x'], state=S[-1]['p']['state']))
            st = S[-1]['p']['state']
            check(nm + ': player returns to a normal state', st in NORMAL_STATES, st)
        except Exception as ex_:
            check(nm + ': raised', False, repr(ex_))


# ---------------------------------------------------------------------------
# 階段 3：giant 專屬
# ---------------------------------------------------------------------------
def phase_giant(h):
    n = 'giant: '
    # 900 幀後自動縮小（分段跑，避免單次步進太久）
    h.goto(3, 9, ability='giant', immune=True)
    for _ in range(10):
        h.run(100, 100)
        if h.player()['ability'] is None: break
    p = h.player()
    check(n + '900 幀後自動解除變身（form 清除、失去能力）',
          p['ability'] is None and p['form'] is None and p['w'] == 14, p)
    # 限時最後 120 幀會閃爍（form.alpha 週期變化）
    h.goto(3, 9, ability='giant', immune=True)
    h.run(790, 100)
    alphas = set()
    for _ in range(8):
        h.run(2, 2)
        a = h.player()
        if a['form']: alphas.add(a['form']['alpha'])
    check(n + '最後 120 幀 form.alpha 會閃爍', len(alphas) >= 2, sorted(str(a) for a in alphas))
    # 吸入範圍 ×2：可以直接吞下「平常吸不動」的中魔王 bonkers
    h.goto(3, 9, ability='giant', immune=True)
    h.spawn('bonkers', 8, 9, d=-1)
    mouth = None
    for _ in range(24):
        h.run(5, 5, keys='up,attack')
        pl = h.player()
        if pl['mouth']: mouth = pl['mouth']; break
    check(n + '吸入範圍 ×2：可直接吞下中魔王 bonkers（忽略 inhalable）',
          bool(mouth) and mouth.get('ability') == 'hammer', mouth)
    # 一般大小的卡比吸不動 bonkers（對照組）
    h.goto(3, 9, immune=True)
    h.spawn('bonkers', 8, 9, d=-1)
    got = None
    for _ in range(24):
        h.run(5, 5, keys='up,attack')
        pl = h.player()
        if pl['mouth']: got = pl['mouth']; break
    check(n + '對照組：沒變身時吸不動 bonkers', got is None, got)
    # ↓+X 衝撞可破硬磚 X
    h.goto(HARD_X - 5, 9, ability='giant', immune=True)
    h.run(3, 3, keys='down'); h.run(3, 3, keys='down,attack'); h.run(40, 5)
    t1 = h.tile(HARD_X, HARD_Y1)
    check(n + '↓+X 巨人衝撞可破硬磚 X', t1 == '.', dict(tile=t1, px=h.player()['x']))
    h.save_shot('giant_charge')


# ---------------------------------------------------------------------------
# 階段 4：dragon 專屬
# ---------------------------------------------------------------------------
def phase_dragon(h):
    n = 'dragon: '
    h.goto(6, 9, ability='dragon', immune=True)
    p0 = h.player()
    h.teleport(p0['x'], GROUND_TOP - p0['h'] - 30)
    h.run(1, 1)
    y0 = h.player()['y']
    S = h.run(40, 10, keys='jump')
    y1 = S[-1]['p']['y']
    check(n + '按住跳會持續上升（飛行）', y1 < y0 - 20, dict(y0=y0, y1=y1))
    # 放開後緩降（不是自由落體）
    S2 = h.run(40, 10)
    vys = [abs(s['p']['vy']) for s in S2]
    check(n + '放開跳鍵後緩降（|vy| ≤ 0.8，不是自由落體）', max(vys) <= 0.8, dict(maxVy=max(vys)))
    h.save_shot('dragon_fly')
    # 龍炎彈會產生貫穿火球
    h.goto(3, 9, ability='dragon', immune=True)
    h.run(74, 74, keys='attack'); h.run(30, 5)
    sp = spawned_of(h.spawned(), type='proj', spr='proj_dragonball')
    check(n + '蓄力放開 → 發射 proj_dragonball', len(sp) >= 1, len(sp))


# ---------------------------------------------------------------------------
# 階段 5：mech 專屬
# ---------------------------------------------------------------------------
def phase_mech(h):
    n = 'mech: '
    h.goto(3, 9, ability='mech')
    p0 = h.player()
    r = h.hurt(1)
    check(n + '受傷扣裝甲值、不扣 HP、不掉能力',
          r['ability'] == 'mech' and r['hp'] == p0['hp'] and r['form'] and r['form']['hp'] == 5, r)
    # 打光裝甲 → armor_break → 解除變身
    for _ in range(6):
        h.run(3, 3)
        st = h.player()
        if st['ability'] is None: break
        h.hurt(1)
    h.run(5, 5)
    p2 = h.player()
    check(n + '裝甲歸零 → 解除變身（form 清除、失去能力）',
          p2['form'] is None and p2['ability'] is None and p2['w'] == 14, p2)
    # 噴射跳：按住跳飛得比放開更高
    h.goto(3, 9, ability='mech', immune=True)
    S = h.run(46, 4, keys='jump')
    hi_hold = min(s['p']['y'] for s in S)
    h.goto(3, 9, ability='mech', immune=True)
    h.run(3, 3, keys='jump')
    S2 = h.run(43, 4)
    hi_tap = min(s['p']['y'] for s in S2)
    check(n + '噴射跳：按住跳比點一下跳更高', hi_hold < hi_tap - 6, dict(hold=hi_hold, tap=hi_tap))
    # 火箭拳會飛出去再飛回來
    h.goto(3, 9, ability='mech', immune=True)
    h.run(3, 3, keys='attack')
    xs = []
    for _ in range(14):
        h.run(4, 4)
        f = [o for o in h.others() if o['spr'] == 'proj_rocketfist']
        if f: xs.append(f[0]['x'])
    check(n + '火箭拳飛出 100px 後折返（來回各判定）',
          len(xs) >= 4 and max(xs) > xs[0] + 40 and xs[-1] < max(xs) - 20, dict(x0=xs[0] if xs else None, xmax=max(xs) if xs else None, xend=xs[-1] if xs else None))
    h.save_shot('mech_fist')


# ---------------------------------------------------------------------------
# 階段 6：ghost 專屬
# ---------------------------------------------------------------------------
def phase_ghost(h):
    n = 'ghost: '
    # 1 格薄牆：穿得過
    h.goto(THIN_X - 3, 9, ability='ghost', immune=True)
    x0 = h.player()['cx']
    S = h.run(110, 10, keys='right')
    x1 = S[-1]['p']['cx']
    check(n + 'noclip 穿過 1 格厚的牆', x1 > (THIN_X + 1) * 16, dict(x0=x0, x1=x1, wall=THIN_X * 16))
    h.save_shot('ghost_thin')
    # 3 格厚牆：被擋回來
    h.goto(THICK_X0 - 3, 9, ability='ghost', immune=True)
    S = h.run(110, 10, keys='right')
    x2 = S[-1]['p']['cx']
    check(n + 'noclip 被 3 格厚的牆擋住（推回）', x2 < THICK_X0 * 16 + 4,
          dict(x=x2, wallL=THICK_X0 * 16, wallR=(THICK_X1 + 1) * 16))
    h.save_shot('ghost_thick')
    # X 開關穿牆
    h.goto(3, 9, ability='ghost', immune=True)
    on0 = h.player()['form']['noclip']
    h.run(3, 3, keys='attack'); h.run(4, 4)
    on1 = h.player()['form']['noclip']
    h.run(20, 10)
    h.run(3, 3, keys='attack'); h.run(4, 4)
    on2 = h.player()['form']['noclip']
    check(n + 'X 可切換穿牆模式（開→關→開）', on0 is True and on1 is False and on2 is True, [on0, on1, on2])
    # 240 幀後自動變回可碰撞
    h.goto(3, 9, ability='ghost', immune=True)
    h.run(250, 50)
    check(n + 'noclip 240 幀後自動關閉（仍保有幽靈能力）',
          h.player()['form'] is not None and h.player()['form']['noclip'] is False and h.player()['ability'] == 'ghost',
          h.player()['form'])
    # ↑+X 隱身
    h.goto(3, 9, ability='ghost', immune=True)
    h.spawn('waddledee', 7, 9, d=-1)          # 敵人先在場，隱身判定框才會排在牠後面更新
    h.run(3, 3, keys='up'); h.run(3, 3, keys='up,attack'); h.run(6, 3)
    f = h.player()['form']
    check(n + '↑+X 隱身：form.alpha 降到 0.3', f and f['alpha'] == 0.3, f)
    # 隱身期間敵人察覺不到（alert 會被尾隨判定框清掉）
    S = h.run(60, 10)
    check(n + '隱身期間敵人不會進入警戒（alert 保持 false）',
          all(not s['e']['alert'] for s in S), [s['e']['alert'] for s in S])
    # ↓+X 附身 → 再按 ↓+X 解除並讓敵人死亡
    h.goto(3, 9, ability='ghost', immune=True)
    e0 = h.spawn('waddledee', 5, 9, d=-1)
    h.teleport(e0['x'] - 2, e0['y'] - 2); h.run(2, 2)
    h.run(3, 3, keys='down'); h.run(3, 3, keys='down,attack'); h.run(4, 4)
    pos = h.player()
    check(n + '↓+X 附身敵人（卡比隱形跟著敵人）',
          pos['possessed'] == 'waddledee' and pos['form']['hidden'] is True, pos['possessed'])
    # 附身中按方向鍵可控制敵人
    ex0 = h.ent()['x']
    h.run(24, 8, keys='right')
    ex1 = h.ent()['x']
    check(n + '附身中方向鍵可控制敵人移動', ex1 > ex0 + 8, dict(x0=ex0, x1=ex1))
    # 再按 ↓+X 解除 → 敵人死亡
    h.release(); h.run(2, 2)
    h.run(3, 3, keys='down'); h.run(3, 3, keys='down,attack'); h.run(10, 5)
    e = h.ent(); pl = h.player()
    check(n + '再按 ↓+X 解除附身 → 敵人死亡、卡比恢復顯示',
          e['dead'] and pl['possessed'] is None and pl['form'] and pl['form']['hidden'] is False,
          dict(dead=e['dead'], possessed=pl['possessed']))
    h.save_shot('ghost_possess')


# ---------------------------------------------------------------------------
# 階段 7：4 種新敵人 → 對應能力
# ---------------------------------------------------------------------------
ENEMY_ABILITY = [('bigbloom', 'giant', 8, 9), ('drako', 'dragon', 8, 7), ('bolt', 'mech', 8, 9), ('boodee', 'ghost', 8, 8)]


def phase_enemies(h):
    for key, ab, ex, ey in ENEMY_ABILITY:
        n = f'{key}: '
        # 生成：不掉出地圖、不卡牆
        h.goto(3, 9, immune=True)
        e0 = h.spawn(key, ex, ey)
        S = h.run(40, 5)
        e = S[-1]['e']
        check(n + 'spawn 正常（不死、不掉出地圖、不卡在磁磚裡）',
              not e['dead'] and not e['fellOut'] and not e['inSolid'] and e['active'],
              dict(x=e['x'], y=e['y'], dead=e['dead'], inSolid=e['inSolid']))
        # 吸入 → 吞下 → 得到能力
        h.goto(3, 9, immune=True)
        h.spawn(key, 6, 9 if key != 'drako' else 8)
        got = None
        for _ in range(30):
            h.run(4, 4, keys='attack')
            pl = h.player()
            if pl['mouth']: got = pl['mouth']; break
        if got:
            # 吸到東西會有 2 幀 hit-stop（P.inhaleFreeze），停格期間 player.update 不跑 →
            # 先空跑幾幀把停格消掉，再按 ↓ 吞下，否則 pressed('down') 會被吃掉。
            h.release(); h.run(8, 8)
            h.run(4, 4, keys='down')
            h.run(30, 6)
        pl = h.player()
        check(n + f'吸入吞下 → 得到 {ab}', pl['ability'] == ab, dict(mouth=got, ability=pl['ability']))
        check(n + '取得後 p.form 生效', pl['form'] is not None and pl['form']['key'] == ab, pl['form'])
        h.save_shot('enemy_' + key)
        # 特色行為：200 幀內出現投射物 / 判定框
        h.goto(3, 9, immune=True)
        h.spawn(key, ex, ey)
        S = h.run(220, 10)
        acted = any(o['owner'] == 'enemy' for s in S for o in s['o'] if o['type'] in ('proj', 'hitbox'))
        moved = abs(S[-1]['e']['x'] - S[0]['e']['x']) > 4 or abs(S[-1]['e']['y'] - S[0]['e']['y']) > 4
        check(n + '200 幀內會攻擊或移動', acted or moved, dict(acted=acted, moved=moved))


# ---------------------------------------------------------------------------
# 階段 8：資料與精靈完整性
# ---------------------------------------------------------------------------
SPRITES = {
    # `kirby_attack_<key>` 是 player.js currentAnim() 在 state==='attack' 時的預設名字：
    # form 還沒建立 / 已經解除而能力還在的那幾幀會落回它，沒註冊就會畫洋紅方塊（fix5）。
    'giant': ['hat_giant', 'kirby_attack_giant', 'ui_ability_giant', 'ui_ability_giant_mini'],
    'dragon': ['kirby_dragon_idle', 'kirby_dragon_walk', 'kirby_dragon_fly', 'kirby_dragon_attack',
               'kirby_attack_dragon', 'proj_dragonball', 'ui_ability_dragon', 'ui_ability_dragon_mini'],
    'mech': ['kirby_mech_idle', 'kirby_mech_walk', 'kirby_mech_jump', 'kirby_mech_attack',
             'kirby_attack_mech', 'proj_rocketfist', 'proj_missile', 'ui_ability_mech', 'ui_ability_mech_mini'],
    'ghost': ['kirby_ghost_idle', 'kirby_ghost_walk', 'kirby_ghost_attack',
              'kirby_attack_ghost', 'ui_ability_ghost', 'ui_ability_ghost_mini'],
}
ENEMY_SPRITES = ['bigbloom_walk', 'bigbloom_attack', 'drako_fly', 'drako_attack',
                 'bolt_walk', 'bolt_attack', 'boodee_float', 'boodee_attack', 'proj_drakofire', 'proj_boltbeam']


def phase_data(h):
    ks = h.akeys()
    check('registry: KB.ABILITY_KEYS 包含 4 種變身', all(k in ks for k in KEYS), ks)
    for k in KEYS:
        d = h.info(k)
        ok = (bool(d['name']) and bool(d['hud']) and bool(d['desc'])
              and isinstance(d['moves'], list) and len(d['moves']) >= 4
              and all(len(m) == 2 and m[0] and m[1] for m in d['moves'])
              and isinstance(d['flavour'], list) and len(d['flavour']) >= 2)
        check(f'{k}: 有 desc + flavour(2 行) + >=4 招（暫停說明卡）', ok, d)
        check(f'{k}: def.transform = true（取得時播放變身演出）', d['transform'] is True, d['transform'])
        for s in SPRITES[k]:
            check(f'{k}: sprite {s}', h.has(s), s)
    for s in ENEMY_SPRITES:
        check(f'enemies: sprite {s}', h.has(s), s)


# ---------------------------------------------------------------------------
def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('-v', '--verbose', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.verbose
    only = [k for k in a.only.split(',') if k] or None
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
        stages = [
            ('form', lambda: [phase_form(h, k) for k in KEYS if not only or k in only]),
            ('moves', lambda: phase_moves(h, only)),
            ('giant', lambda: phase_giant(h) if not only or 'giant' in only else None),
            ('dragon', lambda: phase_dragon(h) if not only or 'dragon' in only else None),
            ('mech', lambda: phase_mech(h) if not only or 'mech' in only else None),
            ('ghost', lambda: phase_ghost(h) if not only or 'ghost' in only else None),
            ('enemies', lambda: phase_enemies(h) if not only else None),
            ('data', lambda: phase_data(h) if not only else None),
        ]
        for label, fn in stages:
            print('-' * 8, label)
            n0 = len(logs)
            try:
                fn()
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
        print('FAILED:')
        for f in fails:
            print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    if missing: print('MISSING SPRITES:', ', '.join(missing))
    warn = [l for l in logs if 'missing sprite' not in l]
    if warn:
        print('BROWSER LOG:')
        print('\n'.join(warn[:30]))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
