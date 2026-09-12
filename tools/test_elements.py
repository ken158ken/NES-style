# -*- coding: utf-8 -*-
"""
元素反應系統自動驗證（Round 6 elements）：KB.ELEM + tilemap 的環境反應 + 敵人 / 魔王屬性弱點。

檢查項目
  1. 元素分類       KB.ELEM.of() 對 fire / ice / spark / wind / 物理各種判定框與投射物都分類正確
  2. 火燒草         點燃 → 每 8 幀往兩側蔓延 1 格（共 3 格）→ 燒完變焦黑 → 30 秒後恢復；站在燃燒格的敵人 1 dmg/秒
  3. 木箱 W         火燒 40 幀後消失；鐵鎚類重擊直接砸破；風可以吹熄
  4. 冰面           冰打水面 → 8 秒的可站平台（卡比站得住、會滑）；火焰提前融化
  5. 電擊水域       電打水域 → 整片相連水域內敵人 dmg 4 + freezeT 30、水中的卡比自傷 1
  6. 屬性弱點       weak ×2 / resist ×0.5；魔王弱點（威斯比 火、克拉寇 冰、魅塔騎士 電 + 物理抗性）
  7. 元素狀態       燃燒 3 秒（每 30 幀 1 點）+ 連鎖點燃最多 3 隻、麻痺 60 幀不能動

用法：python tools/test_elements.py [--only elem,burn,ice] [--shots] [-v]
"""
import sys, json, pathlib, base64, argparse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
import enemy_test as ET
from enemy_test import Harness, HOOK_JS, check

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots' / 'agent_elements'
T = 16

# ---------------------------------------------------------------------------
# 測試關卡（id 不含數字 → tier 3）
#   W=60 H=12；地面 row 10~11
#   deco row 9：草 'g' x=6~20、花 'f' x=22
#   木箱 'W'  ：(26,9) (27,9)
#   水池      ：x=34~44 rows 8~10（水面 = row 8）
# ---------------------------------------------------------------------------
MW, MH = 60, 12
GRASS_X0, GRASS_X1 = 6, 20
FLOWER_X = 22
WOOD = [(26, 9), (27, 9)]
WAT_X0, WAT_X1 = 34, 44
WAT_TOP = 8

_g = [['.'] * MW for _ in range(MH)]
for y in (10, 11):
    for x in range(MW): _g[y][x] = '#'
for (wx, wy) in WOOD: _g[wy][wx] = 'W'
for y in range(WAT_TOP, 11):
    for x in range(WAT_X0, WAT_X1 + 1): _g[y][x] = '~'
MAP = [''.join(r) for r in _g]

_d = [['.'] * MW for _ in range(MH)]
for x in range(GRASS_X0, GRASS_X1 + 1): _d[9][x] = 'g'
_d[9][FLOWER_X] = 'f'
DECO = [''.join(r) for r in _d]

LEVEL_JS = "KB.LEVELS.push(" + json.dumps({
    'id': 'eltest', 'name': 'ELEMENT TEST', 'theme': 'green', 'music': None, 'boss': None,
    'rooms': [{'map': MAP, 'deco': DECO, 'spawn': [3, 9], 'entities': [], 'noBoss': True}],
}, ensure_ascii=False) + ");"

# 頁面內的元素測試輔助
ELEM_JS = r"""() => {
  const M = () => KB.game.map;
  window.__el = {
    reset() { const m = M(); m.decoFire.clear(); m.decoChar.clear(); m.woodFire.clear(); m.iceWater.clear();
              m.shockT = 0; m.shockCool = 0; m.shockCells = []; return true; },
    // 以「真的判定框」觸發環境反應（走 Hitbox.update → KB.ELEM.scanTiles 的正規路徑）
    strike(tx, ty, type, o) {
      o = o || {};
      const h = KB.hitbox(Object.assign({ x: tx * 16 + 2, y: ty * 16 + 2, w: 12, h: 12, dmg: o.dmg === undefined ? 2 : o.dmg,
        owner: 'player', type, life: 2, pierce: true, breakBlocks: true }, o.extra || {}));
      __kb.step(1);
      return true;
    },
    fires() { return Array.from(M().decoFire.keys()).sort(); },
    chars() { return Array.from(M().decoChar.keys()).sort(); },
    woods() { return Array.from(M().woodFire.keys()).sort(); },
    ices()  { return Array.from(M().iceWater.keys()).sort(); },
    tile(tx, ty) { return M().get(tx, ty); },
    sprite(tx, ty) { return M().tileSprite(tx, ty, 'green'); },
    shock() { const m = M(); return { t: m.shockT, cells: m.shockCells.length, cool: m.shockCool }; },
    step(n) { __kb.step(n); return true; },
    // 直接生成一隻敵人並回傳控制代號（沿用 enemy_test 的 __te）
    put(t, x, y, opts) {
      const e = KB.game.spawnDef(Object.assign({ t, x, y }, opts || {}));
      if (e) { e.active = true; e.speed = 0; e.vx = 0; e.turnAtEdge = false; e.turnAtWall = false; }
      __kb.step(1);
      return e ? { hp: e.hp, x: +e.x.toFixed(1), y: +e.y.toFixed(1) } : null;
    },
    ents() {
      return KB.game.entities.filter(e => !e.dead && e.type === 'enemy').map(e => ({
        name: e.name, hp: e.hp, x: +e.x.toFixed(1), y: +e.y.toFixed(1), vx: +e.vx.toFixed(2),
        freezeT: e.freezeT | 0, burn: e.status ? e.status.burn | 0 : 0, para: e.status ? e.status.para | 0 : 0,
        element: e.element || null, weak: e.weak || null, resist: e.resist || null,
      }));
    },
    clearEnemies() { for (const e of KB.game.entities) if (e.type === 'enemy') e.dead = true; __kb.step(1); return true; },
    // 純規則測試：不經過遊戲流程，直接問 KB.ELEM 乘算結果
    mult(tags, src, dmg) {
      const t = Object.assign({ cx: 0, cy: 0, y: 0, type: 'enemy' }, tags);
      return KB.ELEM.applyHit(t, dmg === undefined ? 4 : dmg, src);
    },
    bossTags(key) {
      const C = KB.BOSSES[key]; if (!C) return null;
      const b = Object.create(C.prototype);
      // 只取建構式設定的標籤 → 直接新建一個（魔王建構式會碰 KB.game，測試關卡已載入所以安全）
      const inst = new C(6, 9);
      const out = { weak: inst.weak || null, resist: inst.resist || null, resistK: inst.resistK === undefined ? null : inst.resistK };
      inst.dead = true;
      return out;
    },
    playerHp() { return KB.player.hp; },
    pos(x, y) { const p = KB.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.invuln = 0; p.invincibleT = 0;
                if (KB.game.updateCamera) KB.game.updateCamera(true); return true; },
    player() { const p = KB.player; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), hp: p.hp, onGround: !!p.onGround, state: p.state }; },
    shot() { __kb.render(); const c = KB.canvas, o = document.createElement('canvas'); o.width = c.width * 3; o.height = c.height * 3;
             const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); },
  };
  return true;
}"""

SHOT_ON = False


def shot(h, name):
    if not SHOT_ON: return
    data = h.ev("()=>__el.shot()")
    if not data: return
    SHOTS.mkdir(parents=True, exist_ok=True)
    (SHOTS / (name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('   shot ->', (SHOTS / (name + '.png')))


def reset(h, x=3, y=9):
    h.goto(x=x, y=y, level='eltest')
    h.ev("()=>__el.reset()")
    h.ev("()=>__el.clearEnemies()")


# ---------------------------------------------------------------------------
# 1. 元素分類
# ---------------------------------------------------------------------------
def phase_elem(h):
    cases = [
        ({'kind': 'fire'}, 'fire'), ({'kind': 'firedash'}, 'fire'), ({'kind': 'dragon_breath'}, 'fire'),
        ({'spr': 'proj_fireball', 'kind': 'proj'}, 'fire'),
        ({'kind': 'ice'}, 'ice'), ({'kind': 'proj', 'freeze': True}, 'ice'), ({'kind': 'icewall'}, 'ice'),
        ({'kind': 'spark'}, 'spark'), ({'kind': 'lightning'}, 'spark'), ({'kind': 'thunder'}, 'spark'),
        ({'kind': 'airpuff'}, 'wind'), ({'spr': 'proj_windblade', 'kind': 'cutter'}, 'wind'),
        ({'spr': 'proj_airpuff', 'kind': 'proj'}, 'wind'),
        ({'kind': 'sword'}, 'none'), ({'kind': 'hammer'}, 'none'), ({'kind': 'star'}, 'none'), ({'kind': 'cutter'}, 'none'),
        ({'elem': 'fire', 'kind': 'sword'}, 'fire'),   # elem 明確覆寫
    ]
    got = h.ev("(cs)=>cs.map(c=>KB.ELEM.of(c))", [c[0] for c in cases])
    for (src, want), g in zip(cases, got):
        check('elem: of(%s) = %s' % (json.dumps(src, ensure_ascii=False), want), g == want, g)
    check('elem: of(null) = none', h.ev("()=>KB.ELEM.of(null)") == 'none')


# ---------------------------------------------------------------------------
# 2. 火燒草：蔓延 / 焦黑 / 恢復 / 站在火上的敵人受傷
# ---------------------------------------------------------------------------
def phase_burn(h):
    reset(h)
    mid = (GRASS_X0 + GRASS_X1) // 2
    h.ev("([x,y])=>__el.pos(x,y)", [(mid - 4) * T, 9 * T])   # 把鏡頭帶到草地（截圖用）
    # 火焰判定框打在草上
    h.ev("([x,y])=>__el.strike(x,y,'fire')", [mid, 9])
    fires = h.ev("()=>__el.fires()")
    check('burn: 火焰判定框點燃草地', ('%d,9' % mid) in fires, fires)
    shot(h, 'burn_ignite')

    # 每 8 幀往兩側蔓延 1 格 → 9 幀後應該有 ±1
    h.ev("()=>__el.step(9)")
    f1 = h.ev("()=>__el.fires()")
    check('burn: 8 幀後往左右各蔓延 1 格', ('%d,9' % (mid - 1)) in f1 and ('%d,9' % (mid + 1)) in f1, f1)
    h.ev("()=>__el.step(18)")
    f3 = h.ev("()=>__el.fires()")
    xs = sorted(int(k.split(',')[0]) for k in f3)
    spread = (max(xs) - mid, mid - min(xs)) if xs else (0, 0)
    check('burn: 共蔓延 3 格（每側）', spread == (3, 3), dict(spread=spread, fires=f3))
    shot(h, 'burn_spread')
    # 不會再往第 4 格擴散
    h.ev("()=>__el.step(40)")
    xs2 = sorted(set(int(k.split(',')[0]) for k in (h.ev("()=>__el.fires()") + h.ev("()=>__el.chars()"))))
    check('burn: 蔓延上限 3 格（不會無限延燒）',
          xs2 and min(xs2) >= mid - 3 and max(xs2) <= mid + 3, dict(xs=xs2))

    # 燒完變焦黑
    h.ev("()=>__el.step(120)")
    chars = h.ev("()=>__el.chars()")
    check('burn: 燒完變焦黑（decoChar）', ('%d,9' % mid) in chars and not h.ev("()=>__el.fires()"), chars)
    shot(h, 'burn_char')
    # 30 秒（1800 幀）後恢復
    h.ev("()=>__el.step(1810)")
    check('burn: 焦黑 30 秒後恢復', not h.ev("()=>__el.chars()"), h.ev("()=>__el.chars()"))

    # 站在燃燒格上的敵人：1 dmg / 秒
    reset(h)
    h.ev("([x,y])=>__el.put('waddledee',x,y)", [mid, 9])
    hp0 = h.ev("()=>__el.ents()")
    h.ev("([x,y])=>{const m=KB.game.map; m.igniteDeco(x,y,0);}", [mid, 9])
    h.ev("()=>__el.step(62)")
    e1 = h.ev("()=>__el.ents()")
    ok = bool(hp0) and (not e1 or e1[0]['hp'] < hp0[0]['hp'])
    check('burn: 站在燃燒格的敵人受 1 dmg/秒', ok, dict(before=hp0, after=e1))

    # 風吹熄
    reset(h)
    h.ev("([x,y])=>{KB.game.map.igniteDeco(x,y,3);}", [mid, 9])
    check('burn: 點燃成功（吹熄前）', h.ev("()=>__el.fires()"), h.ev("()=>__el.fires()"))
    h.ev("([x,y])=>__el.strike(x,y,'airpuff',{dmg:0})", [mid, 9])
    check('burn: 風（airpuff）吹熄燃燒格，草沒有變焦黑',
          not h.ev("()=>__el.fires()") and not h.ev("()=>__el.chars()"),
          dict(fires=h.ev("()=>__el.fires()"), chars=h.ev("()=>__el.chars()")))


# ---------------------------------------------------------------------------
# 3. 木箱 W
# ---------------------------------------------------------------------------
def phase_wood(h):
    reset(h)
    wx, wy = WOOD[0]
    h.ev("([x,y])=>__el.pos(x,y)", [(wx - 4) * T, 9 * T])   # 鏡頭對到木箱
    check('wood: 木箱磁磚 W 是實心（可站）', h.ev("()=>KB.TileMap.isSolid('W')"))
    check('wood: 木箱有專屬精靈 tile_woodbox', h.ev("([x,y])=>__el.sprite(x,y)", [wx, wy]) == 'tile_woodbox')
    h.ev("([x,y])=>__el.strike(x,y,'fire')", [wx, wy])
    check('wood: 火焰點燃木箱', h.ev("()=>__el.woods()"), h.ev("()=>__el.woods()"))
    check('wood: 燃燒中改用 tile_woodbox_burn', h.ev("([x,y])=>__el.sprite(x,y)", [wx, wy]) == 'tile_woodbox_burn')
    shot(h, 'wood_burn')
    h.ev("()=>__el.step(20)")
    check('wood: 燒到一半還在（40 幀才燒毀）', h.ev("([x,y])=>__el.tile(x,y)", [wx, wy]) == 'W')
    h.ev("()=>__el.step(25)")
    check('wood: 火燒 40 幀後消失', h.ev("([x,y])=>__el.tile(x,y)", [wx, wy]) == '.',
          h.ev("([x,y])=>__el.tile(x,y)", [wx, wy]))

    # 鐵鎚類重擊直接砸破
    reset(h)
    wx2, wy2 = WOOD[1]
    h.ev("([x,y])=>__el.strike(x,y,'sword')", [wx2, wy2])
    check('wood: 一般攻擊（劍）砸不破', h.ev("([x,y])=>__el.tile(x,y)", [wx2, wy2]) == 'W')
    h.ev("([x,y])=>__el.strike(x,y,'hammer')", [wx2, wy2])
    check('wood: 鐵鎚重擊直接砸破', h.ev("([x,y])=>__el.tile(x,y)", [wx2, wy2]) == '.')

    # 風吹熄燃燒中的木箱
    reset(h)
    h.ev("([x,y])=>{KB.game.map.igniteWood(x,y);}", [WOOD[0][0], WOOD[0][1]])
    h.ev("([x,y])=>__el.strike(x,y,'airpuff',{dmg:0})", [WOOD[0][0], WOOD[0][1]])
    check('wood: 風吹熄燃燒中的木箱', not h.ev("()=>__el.woods()") and h.ev("([x,y])=>__el.tile(x,y)", [WOOD[0][0], WOOD[0][1]]) == 'W')


# ---------------------------------------------------------------------------
# 4. 冰面
# ---------------------------------------------------------------------------
def phase_ice(h):
    reset(h)
    ix = (WAT_X0 + WAT_X1) // 2
    h.ev("([x,y])=>__el.strike(x,y,'ice')", [ix, WAT_TOP])
    ices = h.ev("()=>__el.ices()")
    check('ice: 冰打水面 → 結冰', ('%d,%d' % (ix, WAT_TOP)) in ices, ices)
    check('ice: 結冰的水面用 tile_ice_surface',
          h.ev("([x,y])=>__el.sprite(x,y)", [ix, WAT_TOP]) == 'tile_ice_surface')
    # 只有最上排的水會結冰
    h.ev("([x,y])=>__el.strike(x,y,'ice')", [ix, WAT_TOP + 1])
    check('ice: 水面以下不會結冰', ('%d,%d' % (ix, WAT_TOP + 1)) not in h.ev("()=>__el.ices()"))

    # 把整排水面凍起來，卡比要站得住
    h.ev("([a,b,y])=>{const m=KB.game.map; for(let x=a;x<=b;x++) m.freezeWater(x,y);}", [WAT_X0, WAT_X1, WAT_TOP])
    h.ev("([x,y])=>__el.pos(x,y)", [ix * T, WAT_TOP * T - 20])
    h.ev("()=>__el.step(24)")
    p = h.ev("()=>__el.player()")
    check('ice: 卡比站得住結冰的水面（不會掉進水裡）',
          p['onGround'] and abs((p['y'] + 15) - WAT_TOP * T) <= 2, p)
    shot(h, 'ice_stand')

    # 冰面比較滑：同樣「按右 40 幀後放開」，冰上減速明顯比一般地面慢
    def coast(px, py, frames=40, after=12):
        h.ev("([x,y])=>__el.pos(x,y)", [px, py])
        h.ev("()=>__el.step(6)")
        h.press('right'); h.ev("([n])=>__el.step(n)", [frames])
        h.release()
        h.ev("([n])=>__el.step(n)", [after])
        return h.ev("()=>__el.player()")
    on_ice = coast(ix * T, WAT_TOP * T - 16)
    on_gnd = coast(8 * T, 9 * T)
    check('ice: 冰上摩擦變小（放手後滑得比一般地面久）',
          abs(on_ice['vx']) > abs(on_gnd['vx']) + 0.05, dict(ice=on_ice, ground=on_gnd))
    shot(h, 'ice_slide')
    h.ev("([a,b,y])=>{const m=KB.game.map; for(let x=a;x<=b;x++) m.freezeWater(x,y);}", [WAT_X0, WAT_X1, WAT_TOP])
    h.ev("([x,y])=>__el.pos(x,y)", [ix * T, WAT_TOP * T - 20])
    h.ev("()=>__el.step(20)")

    # 火焰融化
    h.ev("([x,y])=>__el.strike(x,y,'fire')", [ix, WAT_TOP])
    check('ice: 火焰讓結冰的水面提前融化', ('%d,%d' % (ix, WAT_TOP)) not in h.ev("()=>__el.ices()"))

    # 8 秒後自然融化
    reset(h)
    h.ev("([x,y])=>{KB.game.map.freezeWater(x,y);}", [ix, WAT_TOP])
    h.ev("()=>__el.step(479)")
    still = ('%d,%d' % (ix, WAT_TOP)) in h.ev("()=>__el.ices()")
    h.ev("()=>__el.step(4)")
    gone = ('%d,%d' % (ix, WAT_TOP)) not in h.ev("()=>__el.ices()")
    check('ice: 結冰維持 8 秒（480 幀）後自動融化', still and gone, dict(at479=still, at483=gone))


# ---------------------------------------------------------------------------
# 5. 電擊水域
# ---------------------------------------------------------------------------
def phase_shock(h):
    reset(h)
    ix = (WAT_X0 + WAT_X1) // 2
    h.ev("([x,y])=>__el.put('waddledee',x,y,{})", [WAT_X0 + 2, WAT_TOP + 1])
    h.ev("([x,y])=>{const e=KB.game.entities.filter(q=>q.type==='enemy')[0]; if(e){e.grav=0;e.solid=false;e.x=x*16;e.y=y*16;}}",
         [WAT_X0 + 2, WAT_TOP + 1])
    h.ev("()=>__el.step(1)")
    before = h.ev("()=>__el.ents()")
    h.ev("([x,y])=>__el.strike(x,y,'spark')", [ix, WAT_TOP + 1])
    after = h.ev("()=>__el.ents()")
    sh = h.ev("()=>__el.shock()")
    check('shock: 電擊觸發整片水域（shockT=20）', sh['t'] > 0 and sh['cells'] >= (WAT_X1 - WAT_X0 + 1), sh)
    dead = (not after) and before
    dmg_ok = dead or (before and after and before[0]['hp'] - after[0]['hp'] >= 4)
    check('shock: 水中敵人受 dmg 4', dmg_ok, dict(before=before, after=after))
    if after:
        check('shock: 水中敵人 freezeT 30', after[0]['freezeT'] >= 28, after)
    else:
        check('shock: 水中敵人已被電死（dmg 4 ≥ 血量）', True)

    # 卡比泡在水裡也會被自己的電電到 1 點
    reset(h)
    h.ev("([x,y])=>__el.put('squishy',x,y)", [ix + 2, WAT_TOP + 1])
    h.ev("([x,y])=>__el.pos(x,y)", [ix * T, (WAT_TOP + 1) * T])
    h.ev("()=>__el.step(8)")
    hp0 = h.ev("()=>__el.playerHp()")
    h.ev("([x,y])=>__el.strike(x,y,'spark')", [ix, WAT_TOP + 1])
    h.ev("()=>__el.step(2)")
    shot(h, 'shock_water')
    hp1 = h.ev("()=>__el.playerHp()")
    check('shock: 卡比在水中放電會自傷 1', hp1 == hp0 - 1, dict(before=hp0, after=hp1))

    # 冷卻：連續放電不會每幀重複結算
    h.ev("([x,y])=>__el.strike(x,y,'spark')", [ix, WAT_TOP + 1])
    hp2 = h.ev("()=>__el.playerHp()")
    check('shock: 40 幀冷卻內不重複觸發', hp2 == hp1, dict(hp1=hp1, hp2=hp2))


# ---------------------------------------------------------------------------
# 6. 屬性弱點 / 抗性
# ---------------------------------------------------------------------------
WEAK_TABLE = [
    # (敵人 key, 期待 element, weak, resist)
    ('chilly',    'ice',   ['fire'],  ['ice']),
    ('snowly',    'ice',   ['fire'],  ['ice']),
    ('mrfrosty',  'ice',   ['fire'],  ['ice']),
    ('hothead',   'fire',  ['ice'],   ['fire']),
    ('drako',     'fire',  ['ice'],   ['fire']),
    ('wizzle',    'fire',  ['ice'],   ['fire']),
    ('bolt',      'metal', ['spark'], None),
    ('shotzo',    'metal', ['spark'], None),
    ('rollarmor', 'metal', ['spark'], None),
    ('tiktok',    'metal', ['spark'], None),
    ('boodee',    'ghost', ['spark'], ['physical']),
    ('scarfy',    'ghost', ['spark'], ['physical']),
    ('squishy',   None,    ['spark'], None),
    ('glunk',     None,    ['spark'], None),
]
BOSS_TABLE = [
    ('whispywoods', ['fire'], None),
    ('kracko',      ['ice'],  None),
    ('metaknight',  ['spark'], ['physical']),
    ('lololo',      ['fire'], None),
    ('dedede',      None,     None),
]


def phase_weak(h):
    reset(h)
    tags = h.ev("(ks)=>ks.map(k=>{const C=KB.ENEMIES[k]; if(!C) return null; const e=new C(6,9);"
                "return {element:e.element||null, weak:e.weak||null, resist:e.resist||null};})",
                [k for k, _, _, _ in WEAK_TABLE])
    for (key, el, weak, res), g in zip(WEAK_TABLE, tags):
        ok = g is not None and g['element'] == el and g['weak'] == weak and g['resist'] == res
        check('weak: %s 標籤 element=%s weak=%s resist=%s' % (key, el, weak, res), ok, g)

    # 乘算規則
    m = h.ev("()=>({"
             "weak: __el.mult({weak:['fire']}, {kind:'fire'}, 4),"
             "res:  __el.mult({resist:['ice']}, {kind:'ice'}, 4),"
             "none: __el.mult({weak:['fire']}, {kind:'sword'}, 4),"
             "phys: __el.mult({resist:['physical']}, {kind:'sword'}, 4),"
             "physE:__el.mult({resist:['physical']}, {kind:'spark'}, 4),"
             "floor:__el.mult({resist:['ice']}, {kind:'ice'}, 1)"
             "})")
    check('weak: 弱點 ×2（4 → 8）', m['weak'] == 8, m)
    check('weak: 抗性 ×0.5（4 → 2）', m['res'] == 2, m)
    check('weak: 非弱點元素不加乘（4 → 4）', m['none'] == 4, m)
    check('weak: 物理抗性對 sword 生效（4 → 2）', m['phys'] == 2, m)
    check('weak: 物理抗性對電擊無效（4 → 4）', m['physE'] == 4, m)
    check('weak: 抗性至少留 1 點傷害', m['floor'] == 1, m)

    # 實戰：火打 chilly ×2、冰打 chilly ×0.5
    reset(h)
    h.ev("([x,y])=>__el.put('chilly',x,y)", [8, 9])
    r = h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy'&&q.name==='chilly')[0];"
             "if(!e) return null; e.hp = e.maxHp = 20; const a = e.hp;"
             "e.invuln=0; e.hurt(2,{kind:'fire',cx:e.cx,cy:e.cy}); const b = e.hp;"
             "e.invuln=0; e.hurt(2,{kind:'ice',cx:e.cx,cy:e.cy}); const c = e.hp;"
             "e.invuln=0; e.hurt(2,{kind:'sword',cx:e.cx,cy:e.cy}); const d = e.hp;"
             "return {fire:a-b, ice:b-c, sword:c-d};}")
    check('weak: chilly 被火打 2 → 扣 4（×2）', r and r['fire'] == 4, r)
    check('weak: chilly 被冰打 2 → 扣 1（×0.5）', r and r['ice'] == 1, r)
    check('weak: chilly 被劍打 2 → 扣 2（不變）', r and r['sword'] == 2, r)

    # 弱點演出截圖：火焰判定框打在 chilly 身上 → 「弱點!」黃字 + 特大爆散
    reset(h)
    h.ev("([x,y])=>__el.put('chilly',x,y)", [8, 9])
    h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy'&&q.name==='chilly')[0];"
         "if(e){e.hp=e.maxHp=30;} KB.player.x = 7*16; KB.player.y = 9*16;}")
    h.ev("([x,y])=>__el.strike(x,y,'fire',{dmg:3})", [8, 9])
    h.ev("()=>__el.step(3)")
    shot(h, 'weak_popup')
    vfx = h.ev("()=>KB.VFX.list.filter(e=>e.text).map(e=>e.text)")
    check('weak: 弱點時彈出「弱點!」文字', '弱點!' in (vfx or []), vfx)
    reset(h)
    h.ev("([x,y])=>__el.put('chilly',x,y)", [8, 9])
    h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy'&&q.name==='chilly')[0]; if(e){e.hp=e.maxHp=30;}}")
    h.ev("([x,y])=>__el.strike(x,y,'ice',{dmg:4})", [8, 9])
    h.ev("()=>__el.step(3)")
    vfx2 = h.ev("()=>KB.VFX.list.filter(e=>e.text).map(e=>e.text)")
    check('weak: 抗性時彈出「抗性」文字', '抗性' in (vfx2 or []), vfx2)
    shot(h, 'resist_popup')

    # 魔王弱點
    bt = h.ev("(ks)=>ks.map(k=>__el.bossTags(k))", [k for k, _, _ in BOSS_TABLE])
    for (key, weak, res), g in zip(BOSS_TABLE, bt):
        ok = g is not None and g['weak'] == weak and g['resist'] == res
        check('weak: 魔王 %s weak=%s resist=%s' % (key, weak, res), ok, g)
    mk = h.ev("()=>__el.bossTags('metaknight')")
    check('weak: 魅塔騎士物理抗性倍率 0.9（boss_test 門檻）', mk and mk['resistK'] == 0.9, mk)


# ---------------------------------------------------------------------------
# 7. 元素狀態：燃燒 / 連鎖 / 麻痺
# ---------------------------------------------------------------------------
def phase_status(h):
    reset(h)
    h.ev("([x,y])=>__el.put('waddledee',x,y)", [8, 9])
    r = h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy')[0]; if(!e) return null;"
             "e.hp=e.maxHp=30; e.invuln=0; e.hurt(1,{kind:'fire',cx:e.cx,cy:e.cy});"
             "return {burn:e.status.burn, hp:e.hp};}")
    check('status: 被火打到 → 燃燒 180 幀（3 秒）', r and r['burn'] == 180, r)
    hp0 = r['hp'] if r else 0
    h.ev("()=>__el.step(31)")
    e1 = h.ev("()=>__el.ents()")
    check('status: 燃燒每 30 幀扣 1 點', e1 and e1[0]['hp'] == hp0 - 1, dict(hp0=hp0, now=e1))
    h.ev("()=>__el.step(160)")
    e2 = h.ev("()=>__el.ents()")
    check('status: 燃燒 3 秒共扣 6 點後結束', e2 and e2[0]['burn'] == 0 and e2[0]['hp'] == hp0 - 6, dict(hp0=hp0, now=e2))

    # 火屬性敵人不會被點燃
    reset(h)
    h.ev("([x,y])=>__el.put('hothead',x,y)", [8, 9])
    r2 = h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy')[0]; if(!e) return null;"
              "e.hp=e.maxHp=30; e.invuln=0; e.hurt(1,{kind:'fire',cx:e.cx,cy:e.cy});"
              "return {burn:e.status?e.status.burn:0};}")
    check('status: 火屬性敵人不會被點燃', r2 and r2['burn'] == 0, r2)

    # 連鎖點燃：擠在一起的 5 隻 → 最多再燒 3 隻（共 4 隻）
    reset(h)
    h.ev("()=>{for(let i=0;i<5;i++){const e=KB.game.spawnDef({t:'waddledee',x:8,y:9});"
         "if(e){e.active=true;e.speed=0;e.vx=0;e.grav=0;e.solid=false;e.hp=e.maxHp=40;e.x=8*16+i*3;e.y=9*16;}}"
         "__kb.step(1);}")
    h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy')[0]; e.invuln=0; e.hurt(1,{kind:'fire',cx:e.cx,cy:e.cy});}")
    h.ev("()=>__el.step(70)")
    burning = [e for e in h.ev("()=>__el.ents()") if e['burn'] > 0]
    n = len(burning)
    check('status: 燃燒會連鎖點燃相鄰敵人', n >= 2, dict(n=n))
    check('status: 連鎖最多 3 隻（含起火者共 4 隻）', n <= 4, dict(n=n, ents=h.ev("()=>__el.ents()")))
    shot(h, 'status_chain')

    # 麻痺
    reset(h)
    h.ev("([x,y])=>__el.put('waddledee',x,y)", [8, 9])
    r3 = h.ev("()=>{const e=KB.game.entities.filter(q=>q.type==='enemy')[0]; if(!e) return null;"
              "e.hp=e.maxHp=30; e.speed=0.6; e.turnAtEdge=false; e.invuln=0;"
              "e.hurt(1,{kind:'spark',cx:e.cx,cy:e.cy});"
              "return {para:e.status.para, x:+e.x.toFixed(1)};}")
    check('status: 被電打到 → 麻痺 60 幀', r3 and r3['para'] == 60, r3)
    h.ev("()=>__el.step(40)")
    e3 = h.ev("()=>__el.ents()")
    moved = abs(e3[0]['x'] - r3['x']) if (e3 and r3) else 99
    check('status: 麻痺期間不能移動', moved < 1.0, dict(moved=moved, now=e3))
    h.ev("()=>__el.step(40)")
    e4 = h.ev("()=>__el.ents()")
    check('status: 麻痺結束後恢復行動', e4 and e4[0]['para'] == 0 and abs(e4[0]['x'] - r3['x']) > 1.0,
          dict(now=e4, x0=r3['x'] if r3 else None))


PHASES = [('elem', phase_elem), ('burn', phase_burn), ('wood', phase_wood), ('ice', phase_ice),
          ('shock', phase_shock), ('weak', phase_weak), ('status', phase_status)]


def main():
    global SHOT_ON
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('-v', '--verbose', action='store_true')
    a = ap.parse_args()
    SHOT_ON = a.shots
    ET.VERBOSE = a.verbose
    want = [k.strip() for k in a.only.split(',') if k.strip()]
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type in ('error', 'warning') else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.ELEM')
        pg.evaluate(LEVEL_JS)
        pg.evaluate(HOOK_JS)
        pg.evaluate(ELEM_JS)
        h = Harness(pg, False, False)
        for name, fn in PHASES:
            if want and name not in want: continue
            print('-' * 8, name)
            n0 = len(logs)
            try:
                fn(h)
            except Exception as ex:
                check('%s: raised' % name, False, repr(ex))
            errs = [l for l in logs[n0:] if 'pageerror' in l or 'console.error' in l]
            check('%s: no page errors' % name, not errs, errs[:3])
        missing = pg.evaluate("()=>__kb.missing()")
        b.close()
    print('---')
    fails = [r for r in ET.results if not r[1]]
    print('%d/%d passed' % (len(ET.results) - len(fails), len(ET.results)))
    if fails:
        print('FAILED:')
        for f in fails: print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    if missing: print('MISSING SPRITES:', ', '.join(missing))
    warn = [l for l in logs if 'missing sprite' not in l]
    if warn: print('BROWSER LOG:'); print('\n'.join(warn[:20]))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
