# -*- coding: utf-8 -*-
"""
武器系（Round 5 weapons agent）自動驗證：
  A. 4 能力 × 每招：命中 waddledee 會死 + 招式結束回到正常狀態 + 招式專屬效果（投射物 / 判定框 / 特效）
  B. ninja 壁跳：貼牆 + 跳 → 反向彈起
  C. 4 敵人（pistolo / kagedee / ronin / archerwaddle）：生成站地、會攻擊、可被吸入並給對應能力、會被劍打死
  D. 全程監看 pageerror / console.error；MISSING SPRITES 必須為空
用法：python tools/test_weapons.py [--only gunner,ninja,enemies] [--hitbox] [-v] [--shots]
（測試地圖與頁面輔助函式直接沿用 tools/enemy_test.py 的 Harness / HOOK_JS / TEST_LEVEL）
"""
import sys, pathlib, argparse
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import enemy_test as ET
from enemy_test import (Harness, HOOK_JS, TEST_LEVEL, INDEX, GROUND_TOP, PLAYER_H,
                        spawned_of, run_move, inhale_until)

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

results = ET.results
check = ET.check

NORMAL_STATES = ('idle', 'walk', 'run', 'fall', 'jump', 'crouch', 'float', 'slide')

# ---------------------------------------------------------------------------
# A. 招式表：(ability, label, enemy, ex, ey, seq, wait, px, py[, edir])
#    seq 用法同 enemy_test：('keys', frames) / ('@air', px) / ('@tp', x) / (None, n)=放開按鍵
# ---------------------------------------------------------------------------
MOVES = [
    # ---- gunner ----
    ('gunner', 'X 雙槍連射',   'waddledee', 9, 9, [('attack', 14), (None, 2)],                    36, 3, 9),
    ('gunner', '↓+X 蓄力霰彈', 'waddledee', 7, 9, [('down', 3), ('down,attack', 3), (None, 2)],   40, 3, 9),
    ('gunner', '空中 X 俯衝掃射', 'waddledee', 5, 9, [('@air', 30), ('attack', 26), (None, 2)],   40, 4, 9),
    ('gunner', '↑+X 對空三連', 'waddledee', 57, 7, [('up', 3), ('up,attack', 3), (None, 2)],      40, 57, 9),
    ('gunner', '必殺 子彈時間', 'waddledee', 8, 9, [('attack', 66), (None, 2)],                  110, 3, 9),
    # ---- ninja ----
    ('ninja', 'X 手裡剎三連',  'waddledee', 9, 9, [('attack', 6), (None, 2)],                     40, 3, 9),
    ('ninja', '↓+X 替身瞬移',  'waddledee', 8, 9, [('down', 3), ('down,attack', 3), (None, 2)],   40, 3, 9),
    ('ninja', '空中 X 飛踢',   'waddledee', 6, 9, [('@air', 36), ('attack', 3), (None, 2)],       46, 3, 9),
    ('ninja', '必殺 影分身斬', 'waddledee', 9, 9, [('attack', 56), (None, 2)],                    60, 3, 9),
    # ---- blade ----
    ('blade', 'X 三段連斬（第 1 段）', 'waddledee', 5, 9, [('attack', 3), (None, 2)],             30, 3, 9),
    ('blade', 'X 三段連斬（第 3 段）', 'waddledee', 5, 9,
     [('attack', 2), (None, 8), ('attack', 2), (None, 8), ('attack', 2), (None, 2)],             40, 3, 9),
    ('blade', '蓄力 居合一閃', 'waddledee', 9, 9, [('attack', 74), (None, 2)],                    60, 3, 9),
    ('blade', '空中 X 落下斬', 'waddledee', 4, 9, [('@air', 44), ('attack', 3), (None, 2)],       60, 3, 9),
    ('blade', '↑+X 上撩斬',    'waddledee', 57, 7, [('up', 3), ('up,attack', 3), (None, 2)],      40, 57, 9),
    # ---- bow ----
    ('bow', 'X 射箭',         'waddledee', 7, 9, [('attack', 6), (None, 2)],                      44, 3, 9),
    ('bow', '蓄力 貫穿箭',     'waddledee', 9, 9, [('attack', 48), (None, 2)],                    50, 3, 9),
    ('bow', '必殺 流星箭',     'waddledee', 9, 9, [('attack', 88), (None, 2)],                   110, 3, 9),
    ('bow', '空中 X 箭雨',     'waddledee', 5, 9, [('@air', 40), ('attack', 4), (None, 2)],       50, 4, 9),
    ('bow', '↓+X 陷阱箭',      'waddledee', 5, 9, [('down', 3), ('down,attack', 3), (None, 2)],   120, 3, 9, -1),
]

# 招式專屬效果：label → (檢查名稱, 判定函式(spawned, samples))
def has_proj(spr, n=1):
    return lambda sp, S: len(spawned_of(sp, type='proj', spr=spr)) >= n
def has_box(kind, n=1):
    return lambda sp, S: len([x for x in sp if x['type'] == 'hitbox' and x['owner'] == 'player' and x['kind'] == kind]) >= n
def has_cls(cls, n=1):
    return lambda sp, S: len([x for x in sp if x['cls'] == cls]) >= n

EXTRA = {
    'X 雙槍連射':      ('連續射出 ≥ 2 發 proj_bullet', has_proj('proj_bullet', 2)),
    '↓+X 蓄力霰彈':    ('扇形 7 發 proj_bullet',        has_proj('proj_bullet', 7)),
    '必殺 子彈時間':    ('全方向 ≥ 16 發 + slowMo',      has_proj('proj_bullet', 16)),
    'X 手裡剎三連':    ('射出 3 枚 proj_shuriken',      has_proj('proj_shuriken', 3)),
    '必殺 影分身斬':    ('產生忍者判定框',               has_box('ninja')),
    '蓄力 居合一閃':    ('產生 160px blade 判定框',       lambda sp, S: any(x['type'] == 'hitbox' and x['owner'] == 'player' and x['kind'] == 'blade' and x['w'] >= 150 for x in sp)),
    '空中 X 落下斬':    ('落地左右各一道衝擊判定',        lambda sp, S: len([x for x in sp if x['type'] == 'hitbox' and x['owner'] == 'player' and x['kind'] == 'blade' and x['w'] == 40]) >= 2),
    'X 射箭':          ('射出 proj_arrow',              has_proj('proj_arrow')),
    '蓄力 貫穿箭':      ('射出 proj_arrow_big',          has_proj('proj_arrow_big')),
    '必殺 流星箭':      ('射出 proj_arrow_meteor',       has_proj('proj_arrow_meteor')),
    '空中 X 箭雨':      ('一次 5 支 proj_arrow',         has_proj('proj_arrow', 5)),
    '↓+X 陷阱箭':      ('放下 BowTrap 並被踩爆',         lambda sp, S: has_cls('BowTrap')(sp, S) and has_box('bow')(sp, S)),
}


def phase_moves(h, only):
    for row in MOVES:
        ability, label, enemy, ex, ey, seq, wait, px, py = row[:9]
        if only and ability not in only: continue
        edir = row[9] if len(row) > 9 else 1
        nm = f'{ability} [{label}]'
        try:
            S, sp = run_move(h, ability, enemy, ex, ey, seq, wait, px, py, edir)
        except Exception as ex_:
            check(nm + ': raised', False, repr(ex_)); continue
        e = S[-1]['e']; st = S[-1]['p']['state']
        check(nm + ': kills waddledee', e['dead'], dict(hp=e['hp'], ex=e['x'], px=S[-1]['p']['x'], state=st))
        check(nm + ': player returns to a normal state', st in NORMAL_STATES, st)
        if label in EXTRA:
            desc, fn = EXTRA[label]
            try:
                ok = fn(sp, S)
            except Exception as ex_:
                ok = False; desc += ' ' + repr(ex_)
            check(nm + ': ' + desc, ok, dict(projs=sorted(set(x['spr'] for x in sp if x['type'] == 'proj')),
                                             boxes=[(x['kind'], x['w']) for x in sp if x['type'] == 'hitbox' and x['owner'] == 'player'][:8]))


# ---------------------------------------------------------------------------
# B. ninja 壁跳（測試地圖 col 34 rows 6..9 是一面 4 格高的牆）
# ---------------------------------------------------------------------------
def phase_wallkick(h):
    h.goto(30, 9, immune=True)
    # 走正式流程拿能力（giveAbility → onGet），壁跳的跟隨實體才會建立
    h.ev("()=>{ KB.player.giveAbility('ninja'); }")
    h.run(40, 40, keys='right')                      # 走到牆邊
    h.run(6, 6, keys='right,jump')                   # 起跳貼牆
    S = h.run(10, 2, keys='right')                   # 貼著牆上升 / 下滑
    before = S[-1]['p']
    check('ninja [壁跳]: 貼牆滑行（wallT 記憶窗開啟）', h.ev("()=>KB.player.abilityData.wallT|0") > 0,
          dict(wallT=h.ev("()=>KB.player.abilityData.wallT|0"), x=before['x']))
    h.ev("()=>{__kb.press({right:true, jump:true}); __kb.step(1);}")   # 貼牆瞬間按跳
    after = h.player()
    vy = h.ev("()=>+KB.player.vy.toFixed(2)")
    ok = after['dir'] == -1 and vy < -3 and not after['onGround']
    check('ninja [壁跳]: 貼牆按跳會反向彈起', ok, dict(beforeDir=before['dir'], afterDir=after['dir'],
                                                  vy=vy, beforeX=before['x'], afterX=after['x'], onGround=after['onGround']))
    h.release()
    S3 = h.run(40, 10)
    check('ninja [壁跳]: 壁跳後回到正常狀態', S3[-1]['p']['state'] in NORMAL_STATES, S3[-1]['p']['state'])


# ---------------------------------------------------------------------------
# C. 4 種新敵人
# ---------------------------------------------------------------------------
ENEMIES = ['pistolo', 'kagedee', 'ronin', 'archerwaddle']
E_ABILITY = {'pistolo': 'gunner', 'kagedee': 'ninja', 'ronin': 'blade', 'archerwaddle': 'bow'}
E_HP = {'pistolo': 2, 'kagedee': 2, 'ronin': 3, 'archerwaddle': 2}
# 攻擊證據：投射物 spr 或（ronin）敵方判定框
E_ATTACK = {
    'pistolo': lambda sp: len(spawned_of(sp, type='proj', spr='proj_bullet', owner='enemy')) >= 1,
    'kagedee': lambda sp: len(spawned_of(sp, type='proj', spr='proj_shuriken', owner='enemy')) >= 1,
    'ronin': lambda sp: len([x for x in sp if x['type'] == 'hitbox' and x['owner'] == 'enemy' and x['kind'] == 'blade']) >= 1,
    'archerwaddle': lambda sp: len(spawned_of(sp, type='proj', spr='proj_arrow', owner='enemy')) >= 1,
}


def enemy_phases(h, key, shots=False):
    n = f'{key}: '
    # 1) 生成：站在地上、沒卡進牆、沒掉出地圖
    h.goto(3, 9)
    h.spawn(key, 8, 9)
    S = h.run(30, 5)
    e = S[-1]['e']
    check(n + 'spawn stands on ground', (not e['dead'] and not e['fellOut'] and not e['inSolid'] and e['active']
                                         and e['onGround'] and abs((e['y'] + e['h']) - GROUND_TOP) < 0.5),
          dict(x=e['x'], y=e['y'], onGround=e['onGround'], inSolid=e['inSolid'], dead=e['dead']))
    check(n + f'hp == {E_HP[key]}', e['hp'] == E_HP[key], e['hp'])

    # 2) 會攻擊（卡比免疫，站著讓牠打）
    h.goto(3, 9, immune=True)
    h.spawn(key, 9, 9, d=-1)
    S = h.run(260, 5, shot_when='any')
    sp = h.spawned()
    ok = E_ATTACK[key](sp)
    check(n + 'attacks the player', ok, dict(projs=sorted(set(x['spr'] for x in sp if x['type'] == 'proj')),
                                             boxes=sorted(set(x['kind'] for x in sp if x['type'] == 'hitbox' and x['owner'] == 'enemy'))))
    states = sorted(set(s['e']['state'] for s in S))
    check(n + 'uses its special state', len(states) >= 2, states)
    if shots: h.save_shot1('w_' + key)

    # 3) 可被吸入 → 得到對應能力
    h.goto(3, 9)
    h.spawn(key, 6, 9, d=-1)
    S, took = inhale_until(h, 120)
    p = S[-1]['p']; e = S[-1]['e']; m = p['mouth']
    check(n + f'inhaled -> mouth.ability == {E_ABILITY[key]!r}',
          took is not None and m is not None and m.get('ability') == E_ABILITY[key] and e['dead'] and p['state'] in ('full', 'idle'),
          dict(mouth=m, took=took, state=p['state']))
    h.release()
    # 吞下去 → 真的拿到能力且能攻擊
    h.ev("()=>{const p=KB.player; if(p.mouth) p.swallow(); }")
    h.run(20, 10)
    ab = h.ev("()=>KB.player.ability")
    check(n + f'swallow -> ability == {E_ABILITY[key]!r}', ab == E_ABILITY[key], ab)

    # 4) 被劍打死
    h.goto(3, 9, ability='sword', immune=True)
    h.spawn(key, 5, 9, d=-1)
    h.taps('attack', 8, 13)
    S = h.run(30, 5)
    e = S[-1]['e']
    check(n + 'dies to sword', e['dead'], dict(hp=e['hp'], dead=e['dead']))


# ---------------------------------------------------------------------------
# D. 能力定義完整性（moves / desc / flavour / 圖示 / 帽子 / 註冊）
# ---------------------------------------------------------------------------
def phase_defs(h):
    info = h.ev("""()=>{
      const out={};
      for (const k of ['gunner','ninja','blade','bow']) {
        const d = KB.ABILITIES[k];
        out[k] = d ? { moves:(d.moves||[]).length, desc:!!d.desc, flavour:!!d.flavour,
          inKeys: KB.ABILITY_KEYS.indexOf(k)>=0, name: KB.ABILITY_NAMES[k]||null, hud: KB.ABILITY_HUD[k]||null,
          hat: KB.has(d.hat), icon: KB.has(d.icon), mini: KB.has(d.icon+'_mini'), anim: KB.has('kirby_attack_'+k) } : null;
      }
      return out;
    }""")
    for k, v in info.items():
        check(f'{k}: ability def registered', v is not None and v['inKeys'] and v['name'] and v['hud'], v)
        if not v: continue
        check(f'{k}: >= 4 moves + desc + flavour', v['moves'] >= 4 and v['desc'] and v['flavour'], v)
        check(f'{k}: hat / icon / mini / base attack sprite exist', v['hat'] and v['icon'] and v['mini'] and v['anim'], v)
    ens = h.ev("()=>['pistolo','kagedee','ronin','archerwaddle'].map(k=>[k,!!KB.ENEMIES[k]])")
    check('enemies registered in KB.ENEMIES', all(x[1] for x in ens), ens)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    only = [x for x in a.only.split(',') if x]
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type in ('error', 'warning') else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate(TEST_LEVEL)
        pg.evaluate(HOOK_JS)
        h = Harness(pg, a.shots, a.hitbox)
        if not only or 'defs' in only:
            print('-' * 8, 'defs'); phase_defs(h)
        print('-' * 8, 'moves')
        phase_moves(h, [o for o in only if o in ('gunner', 'ninja', 'blade', 'bow')])
        if not only or 'ninja' in only:
            print('-' * 8, 'wallkick')
            try: phase_wallkick(h)
            except Exception as ex: check('ninja [壁跳]: raised', False, repr(ex))
        if not only or 'enemies' in only:
            for key in ENEMIES:
                print('-' * 8, key)
                try: enemy_phases(h, key, a.shots)
                except Exception as ex: check(f'{key}: raised', False, repr(ex))
        missing = pg.evaluate("()=>__kb.missing()")
        b.close()
    print('---')
    fails = [r for r in results if not r[1]]
    print(f'{len(results) - len(fails)}/{len(results)} passed')
    if fails:
        print('FAILED:'); [print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else '')) for f in fails]
    if missing: print('MISSING SPRITES:', ', '.join(missing))
    errs = [l for l in logs if 'pageerror' in l or 'console.error' in l]
    if errs: print('PAGE ERRORS:'); print('\n'.join(errs[:20]))
    warn = [l for l in logs if 'missing sprite' not in l and l not in errs]
    if warn: print('BROWSER LOG:'); print('\n'.join(warn[:20]))
    sys.exit(1 if (fails or missing or errs) else 0)


if __name__ == '__main__':
    main()
