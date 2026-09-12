# -*- coding: utf-8 -*-
"""
混合能力（Round 6 mix agent）自動驗證：
  A. 定義完整性：12 個混合能力註冊進 KB.ABILITY_KEYS（20 → 32）、3 招 + desc + flavour + color
     + mix=[A,B] + hat / icon / icon_mini / 招式動畫；KB.MIX.table / keyOf / isMix / parts 行為。
  B. 混合流程：持有 A + 吞下給 B 的敵人（或直接塞 mouth）→ ability 變成 mixkey；
     真實流程（fire + 吸入 bladeknight 吞下 → flamesword）；持有混合能力再吞第三個 → 直接替換。
  C. 12 組合 × 3 招：命中 waddledee 會死、招式結束回到正常狀態、招式專屬證據（投射物 / 判定框）。
  D. 受傷掉落混合能力 → 能力星的 key 是「主成分 A」。
  E. player select：短按仍然丟棄能力；沒有 KB.Helper 時長按 45 幀放開也只是丟棄。
  F. fix6 丟星混合：短按 SELECT 丟出的能力星（vx ±2.4 / vy -3）砸中帶 ability 的敵人 →
     敵人被吞噬、星星變成混合星，撿起來就是混合能力；沒有組合 / 受傷掉出來的星星行為完全不變。
  F. 全程監看 pageerror / console.error；MISSING SPRITES 必須為空。
用法：python tools/test_mix.py [--only flamesword,mixflow,defs,select,throwmix] [--hitbox] [-v] [--shots]
（測試地圖與頁面輔助函式沿用 tools/enemy_test.py 的 Harness / HOOK_JS / TEST_LEVEL）
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

# 12 組合：mixkey → (成分 A, 成分 B)
COMBOS = [
    ('flamesword', 'fire', 'sword'),
    ('frostsword', 'ice', 'sword'),
    ('thunderblade', 'spark', 'blade'),
    ('flamegun', 'fire', 'gunner'),
    ('frostgun', 'ice', 'gunner'),
    ('thunderbow', 'spark', 'bow'),
    ('flamehammer', 'fire', 'hammer'),
    ('stonehammer', 'stone', 'hammer'),
    ('shadowblade', 'cutter', 'ninja'),
    ('starmage', 'beam', 'mage'),
    ('frostdragon', 'ice', 'dragon'),
    ('thundermech', 'spark', 'mech'),
]
KEYS = [c[0] for c in COMBOS]

# ---------------------------------------------------------------------------
# A. 招式表：(mixkey, label, enemy, ex, ey, seq, wait, px, py)
#    seq 同 enemy_test：('keys', frames) / ('@air', 高度) / (None, n)=放開按鍵
#    蓄力必殺一律「按住 attack 56 幀後放開」（門檻 50）。
# ---------------------------------------------------------------------------
AIR = lambda h: ('@air', h)
MOVES = [
    # ---- flamesword 炎劍 ----
    ('flamesword', 'X 火焰劍氣三連', 'waddledee', 8, 9, [('attack', 22), (None, 2)], 40, 3, 9),
    ('flamesword', '空中 X 落下爆炎斬', 'waddledee', 4, 9, [AIR(44), ('attack', 8), (None, 2)], 70, 3, 9),
    ('flamesword', '蓄力 火龍捲', 'waddledee', 14, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- frostsword 冰劍 ----
    ('frostsword', 'X 冰晶斬・凍結', 'waddledee', 6, 9, [('attack', 20), (None, 2)], 40, 3, 9),
    ('frostsword', '↑+X 冰柱上挑', 'waddledee', 6, 9, [('up', 3), ('up,attack', 3), (None, 2)], 60, 3, 9),
    ('frostsword', '蓄力 冰河', 'waddledee', 9, 9, [('attack', 56), (None, 2)], 110, 3, 9, -1),
    # ---- thunderblade 雷刀 ----
    ('thunderblade', 'X 雷光一閃', 'waddledee', 10, 9, [('attack', 18), (None, 2)], 40, 3, 9),
    ('thunderblade', '↓+X 雷步瞬移斬', 'waddledee', 7, 9, [('down', 3), ('down,attack', 3), (None, 2)], 50, 3, 9),
    ('thunderblade', '蓄力 雷神', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- flamegun 火焰槍 ----
    ('flamegun', 'X 燃燒彈 + 火海', 'waddledee', 8, 9, [('attack', 24), (None, 2)], 60, 3, 9),
    ('flamegun', '↓+X 霰彈火牆', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 60, 3, 9),
    ('flamegun', '蓄力 火箭砲', 'waddledee', 12, 9, [('attack', 56), (None, 2)], 100, 3, 9),
    # ---- frostgun 冰彈槍 ----
    ('frostgun', 'X 凍結彈', 'waddledee', 9, 9, [('attack', 26), (None, 2)], 60, 3, 9),
    ('frostgun', '↓+X 冰霧散彈', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 70, 3, 9),
    ('frostgun', '蓄力 絕對零度光束', 'waddledee', 12, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- thunderbow 雷弓 ----
    ('thunderbow', 'X 追蹤雷箭', 'waddledee', 9, 9, [('attack', 24), (None, 2)], 70, 3, 9),
    ('thunderbow', '空中 X 箭雨閃電', 'waddledee', 5, 9, [AIR(46), ('attack', 26), (None, 2)], 70, 4, 9),
    ('thunderbow', '蓄力 天雷之矢', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- flamehammer 火鎚 ----
    ('flamehammer', 'X 爆炎鎚・火柱', 'waddledee', 6, 9, [('attack', 26), (None, 2)], 50, 3, 9),
    ('flamehammer', '空中 X 火焰迴旋', 'waddledee', 4, 9, [AIR(20), ('attack', 30), (None, 2)], 50, 3, 9),
    ('flamehammer', '蓄力 隕石鎚', 'waddledee', 7, 9, [('attack', 56), (None, 2)], 130, 3, 9),
    # ---- stonehammer 岩鎚 ----
    ('stonehammer', 'X 地裂衝擊波三段', 'waddledee', 9, 9, [('attack', 32), (None, 2)], 60, 3, 9),
    ('stonehammer', '↑+X 岩石投擲', 'waddledee', 9, 9, [('up', 3), ('up,attack', 3), (None, 2)], 80, 3, 9, -1),
    ('stonehammer', '蓄力 地震', 'waddledee', 7, 9, [('attack', 56), (None, 2)], 130, 3, 9),
    # ---- shadowblade 影刃 ----
    ('shadowblade', 'X 三方向迴旋刃', 'waddledee', 9, 9, [('attack', 20), (None, 2)], 50, 3, 9),
    ('shadowblade', '↓+X 影分身刃陣', 'waddledee', 5, 9, [('down', 3), ('down,attack', 3), (None, 2)], 70, 3, 9),
    ('shadowblade', '蓄力 千刃', 'waddledee', 6, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- starmage 星光法師 ----
    ('starmage', 'X 星光束', 'waddledee', 8, 9, [('attack', 28), (None, 2)], 50, 3, 9),
    ('starmage', '↑+X 星雨', 'waddledee', 5, 9, [('up', 3), ('up,attack', 3), (None, 2)], 90, 3, 9),
    ('starmage', '蓄力 銀河爆', 'waddledee', 6, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- frostdragon 冰龍 ----
    ('frostdragon', 'X 冰息凍結', 'waddledee', 6, 9, [('attack', 32), (None, 2)], 50, 3, 9),
    ('frostdragon', '空中 X 冰翼俯衝', 'waddledee', 6, 9, [AIR(40), ('attack', 8), (None, 2)], 70, 3, 9),
    ('frostdragon', '蓄力 冰龍彈', 'waddledee', 12, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- thundermech 雷電機甲 ----
    ('thundermech', 'X 電磁拳', 'waddledee', 6, 9, [('attack', 22), (None, 2)], 50, 3, 9),
    ('thundermech', '↑+X 雷射飛彈', 'waddledee', 9, 9, [('up', 3), ('up,attack', 3), (None, 2)], 90, 3, 9),
    ('thundermech', '蓄力 EMP 全畫面', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 110, 3, 9),
]


def has_proj(spr, n=1):
    return lambda sp: len(spawned_of(sp, type='proj', spr=spr, owner='player')) >= n


def has_box(minw=0, minh=0, n=1, kind=None):
    def fn(sp):
        c = 0
        for x in sp:
            if x['type'] != 'hitbox' or x['owner'] != 'player':
                continue
            if kind and x['kind'] != kind:
                continue
            if x['w'] >= minw and x['h'] >= minh:
                c += 1
        return c >= n
    return fn


def has_cls(cls, n=1):
    return lambda sp: len([x for x in sp if x['cls'] == cls]) >= n


# 招式專屬證據（label → (說明, 判定函式(spawned)))
EXTRA = {
    'X 火焰劍氣三連': ('射出 3 道 proj_mix_wave_fire', has_proj('proj_mix_wave_fire', 3)),
    '空中 X 落下爆炎斬': ('落地 70×36 爆炎判定', has_box(70, 36, 1, 'fire')),
    '蓄力 火龍捲': ('放出 2 根 proj_mix_tornado_fire', has_proj('proj_mix_tornado_fire', 2)),
    'X 冰晶斬・凍結': ('凍結斬 + proj_mix_wave_ice', lambda sp: has_proj('proj_mix_wave_ice')(sp) and any(
        x['type'] == 'hitbox' and x['owner'] == 'player' and x['freeze'] for x in sp)),
    '↑+X 冰柱上挑': ('3 根 proj_mix_spike_ice', has_proj('proj_mix_spike_ice', 3)),
    '蓄力 冰河': ('≥ 5 根冰柱推進', has_proj('proj_mix_spike_ice', 5)),
    'X 雷光一閃': ('全畫面 272px spark 判定', has_box(272, 20, 1, 'spark')),
    '↓+X 雷步瞬移斬': ('瞬移後 40×30 判定', has_box(40, 30, 1, 'spark')),
    '蓄力 雷神': ('≥ 5 道落雷柱（高 200）', has_box(20, 200, 5, 'spark')),
    'X 燃燒彈 + 火海': ('燃燒彈 + 地面火海判定', lambda sp: has_proj('proj_mix_orb_fire', 2)(sp) and has_box(44, 22, 1, 'fire')(sp)),
    '↓+X 霰彈火牆': ('7 發散彈 + 火牆', lambda sp: has_proj('proj_mix_wave_fire', 7)(sp) and has_box(26, 46, 1, 'fire')(sp)),
    '蓄力 火箭砲': ('proj_mix_bolt_fire 巨彈', has_proj('proj_mix_bolt_fire', 1)),
    'X 凍結彈': ('≥ 3 發 proj_mix_orb_ice', has_proj('proj_mix_orb_ice', 3)),
    '↓+X 冰霧散彈': ('9 發散彈 + 冰霧', lambda sp: has_proj('proj_mix_wave_ice', 9)(sp) and has_box(62, 40, 1, 'ice')(sp)),
    '蓄力 絕對零度光束': ('210px 冰凍光束判定', has_box(210, 20, 1, 'ice')),
    'X 追蹤雷箭': ('2 發 MixHoming 追蹤箭', has_cls('MixHoming', 2)),
    '空中 X 箭雨閃電': ('≥ 10 支下墜雷箭', has_proj('proj_mix_bolt_spark', 10)),
    '蓄力 天雷之矢': ('44×210 天雷柱', has_box(44, 210, 1, 'spark')),
    'X 爆炎鎚・火柱': ('3 道火柱判定', has_box(18, 48, 3, 'fire')),
    '空中 X 火焰迴旋': ('46×42 旋轉判定', has_box(46, 42, 1, 'fire')),
    '蓄力 隕石鎚': ('≥ 4 顆隕石', has_proj('proj_mix_orb_fire', 4)),
    'X 地裂衝擊波三段': ('3 道 proj_mix_wave_stone', has_proj('proj_mix_wave_stone', 3)),
    '↑+X 岩石投擲': ('2 顆 proj_mix_orb_stone', has_proj('proj_mix_orb_stone', 2)),
    '蓄力 地震': ('全畫面地面判定 + 岩刺', lambda sp: has_box(272, 44, 1, 'stone')(sp) and has_proj('proj_mix_spike_stone', 3)(sp)),
    'X 三方向迴旋刃': ('3 方向 proj_mix_wave_shadow', has_proj('proj_mix_wave_shadow', 3)),
    '↓+X 影分身刃陣': ('4 個 MixOrbit 環繞刃', has_cls('MixOrbit', 4)),
    '蓄力 千刃': ('≥ 18 道刃 + 收束判定', lambda sp: has_proj('proj_mix_wave_shadow', 18)(sp) and has_box(120, 96, 1, 'cutter')(sp)),
    'X 星光束': ('96×18 光束判定', has_box(96, 18, 1, 'beam')),
    '↑+X 星雨': ('≥ 6 顆 proj_mix_orb_star', has_proj('proj_mix_orb_star', 6)),
    '蓄力 銀河爆': ('230×180 全屏判定', has_box(230, 180, 1, 'beam')),
    'X 冰息凍結': ('龍息拉長到 ≥ 60px 且凍結', has_box(60, 26, 1, 'ice')),
    '空中 X 冰翼俯衝': ('落地 66×36 + 冰柱', lambda sp: has_box(66, 36, 1, 'ice')(sp) and has_proj('proj_mix_spike_ice', 2)(sp)),
    '蓄力 冰龍彈': ('28×28 貫穿冰龍彈', has_proj('proj_mix_orb_ice', 1)),
    'X 電磁拳': ('2 次 38×28 電磁拳', has_box(38, 28, 2, 'spark')),
    '↑+X 雷射飛彈': ('2 枚 MixHoming 飛彈', has_cls('MixHoming', 2)),
    '蓄力 EMP 全畫面': ('272×200 全畫面判定', has_box(272, 200, 1, 'spark')),
}


def phase_moves(h, only):
    for row in MOVES:
        ability, label, enemy, ex, ey, seq, wait, px, py = row[:9]
        edir = row[9] if len(row) > 9 else 1
        if only and ability not in only:
            continue
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
                ok = fn(sp)
            except Exception as ex_:
                ok = False; desc += ' ' + repr(ex_)
            check(nm + ': ' + desc, ok,
                  dict(projs=sorted(set(x['spr'] for x in sp if x['type'] == 'proj')),
                       boxes=[(x['kind'], x['w'], x['h']) for x in sp if x['type'] == 'hitbox' and x['owner'] == 'player'][:10],
                       cls=sorted(set(x['cls'] for x in sp))))


# ---------------------------------------------------------------------------
# B. 混合流程
# ---------------------------------------------------------------------------
def phase_mixflow(h):
    # 1) 12 組合：持有 A + 吞下 B → mixkey（無序兩個方向都測）
    for key, a, b in COMBOS:
        for first, second in ((a, b), (b, a)):
            h.goto(3, 9, ability=first)
            got = h.ev("""([b])=>{
              const p = KB.player;
              p.mouth = { ability: b, name: 'test', score: 0 };
              p.setState('full');
              p.swallow();
              return p.ability;
            }""", [second])
            h.run(6, 6)
            check(f'{key}: {first} + 吞下 {second} → {key}', got == key, got)
    # 2) 真實流程 A：吸入 bladeknight（給 sword）→ 先讓卡比拿著 fire → 按 ↓ 吞下 → flamesword
    #    （player.js 規則：持有能力時攻擊鍵是「用招式」，所以先空手吸，含在嘴裡再拿能力）
    h.goto(3, 9)
    h.spawn('bladeknight', 6, 9, d=-1)
    S, took = inhale_until(h, 140)
    m = S[-1]['p']['mouth']
    check('真實流程: 吸入 bladeknight → mouth.ability == sword',
          took is not None and m is not None and m.get('ability') == 'sword', dict(mouth=m, took=took))
    h.release(); h.run(4, 4)
    h.ev("()=>{ KB.player.ability = 'fire'; KB.player.abilityData = {}; }")
    h.run(4, 4)
    h.ev("()=>{ const p=KB.player; if(p.mouth) p.swallow(); }")
    h.run(24, 12)
    ab = h.ev("()=>KB.player.ability")
    check('真實流程: 持有 fire 時吞下 sword → flamesword', ab == 'flamesword', ab)
    # 3) 真實流程 B：能力台座（KB.ITEMS.essence）—— 持有 fire 時踩 sword 台座 → flamesword
    h.goto(3, 9, ability='fire')
    h.run(4, 4)
    got = h.ev("""()=>{
      const p = KB.player;
      KB.spawn(new KB.ITEMS.essence(p.x, p.y, 'sword'));
      for (let i = 0; i < 10; i++) __kb.step(1);
      return p.ability;
    }""")
    h.run(20, 10)
    check('真實流程: 持有 fire 時踩 sword 能力台座 → flamesword', got == 'flamesword', got)
    # R6-P1-01：站在台座上不放（超過 30 幀冷卻）不可以被降級回成分 B
    stay = h.ev("""()=>{
      const p = KB.player;
      const out = [];
      for (let i = 0; i < 5; i++) { for (let k = 0; k < 40; k++) __kb.step(1); out.push(p.ability); }
      return out;
    }""")
    check('R6-P1-01: 站在 sword 台座上 200 幀，flamesword 不會被降級回 sword',
          all(a == 'flamesword' for a in stay), stay)
    # 台座本身還在（不是靠銷毀來擋）、armed 已經在觸發時關掉
    st = h.ev("""()=>{
      const e = KB.game.entities.find(x => x.name === 'essence');
      return e ? { alive: !e.dead, armed: !!e.armed } : null;
    }""")
    check('R6-P1-01: 台座沒有消失、armed 已關（必須離開再進來才會再次觸發）',
          st is not None and st['alive'] and st['armed'] is False, st)
    # 離開台座 → 丟掉能力 → 再回來 → 台座重新給能力（armed 重新上膛）
    again = h.ev("""()=>{
      const p = KB.player, e = KB.game.entities.find(x => x.name === 'essence');
      if (!e) return null;
      const ex = e.cx;
      p.x = ex + 120; p.y = e.y;                      // 走遠 → armed 重新上膛
      for (let i = 0; i < 6; i++) __kb.step(1);
      const armedAway = !!e.armed;
      p.ability = null; p.abilityData = {};
      p.x = e.x; p.y = e.y;                            // 回到台座
      for (let i = 0; i < 6; i++) __kb.step(1);
      return { armedAway, ability: p.ability };
    }""")
    check('R6-P1-01: 離開台座範圍 → armed 重新上膛 → 再踩上去會再給一次能力',
          again is not None and again['armedAway'] and again['ability'] == 'sword', again)
    # 反過來：成分順序相反（持有 sword 踩 fire 台座 → flamesword，之後也不會被降級成 fire）
    h.goto(3, 9, ability='sword')
    h.run(4, 4)
    rev = h.ev("""()=>{
      const p = KB.player;
      KB.spawn(new KB.ITEMS.essence(p.x, p.y, 'fire'));
      for (let i = 0; i < 10; i++) __kb.step(1);
      const mixed = p.ability;
      for (let i = 0; i < 160; i++) __kb.step(1);
      return [mixed, p.ability];
    }""")
    check('R6-P1-01: sword + fire 台座 → flamesword，且 160 幀後仍是 flamesword',
          rev == ['flamesword', 'flamesword'], rev)
    # 對照：沒有組合的台座就照舊替換
    h.goto(3, 9, ability='fire')
    h.run(4, 4)
    got2 = h.ev("""()=>{
      const p = KB.player;
      KB.spawn(new KB.ITEMS.essence(p.x, p.y, 'beam'));
      for (let i = 0; i < 10; i++) __kb.step(1);
      return p.ability;
    }""")
    h.run(20, 10)
    check('對照組: fire + beam 沒有組合 → 照舊替換成 beam', got2 == 'beam', got2)
    h.goto(3, 9, ability='flamesword'); h.run(4, 4)
    # 混合演出：能力色 / 圖鑑紀錄
    seen = h.ev("()=>!!(KB.save.seen && KB.save.seen.flamesword)")
    check('真實流程: 混合能力記進 KB.save.seen', seen, seen)
    # 3) 持有混合能力再吞第三個 → 直接替換（不再混合）
    got = h.ev("""()=>{
      const p = KB.player;
      p.mouth = { ability: 'ice', name: 'test', score: 0 };
      p.setState('full'); p.swallow();
      return p.ability;
    }""")
    h.run(6, 6)
    check('持有 flamesword 再吞 ice → 替換成 ice（不再混合）', got == 'ice', got)
    # 4) KB.MIX API
    api = h.ev("""()=>({
      n: KB.ABILITY_KEYS.length,
      tbl: Object.keys(KB.MIX.table).length,
      sym: [KB.MIX.keyOf('fire','sword'), KB.MIX.keyOf('sword','fire')],
      none: [KB.MIX.keyOf('fire','fire'), KB.MIX.keyOf('fire','beam'), KB.MIX.keyOf(null,'fire')],
      nomix: [KB.MIX.keyOf('flamesword','ice'), KB.MIX.keyOf('ice','flamesword')],
      isMix: [KB.MIX.isMix('flamesword'), KB.MIX.isMix('fire'), KB.MIX.isMix(null)],
      parts: [KB.MIX.parts('flamesword'), KB.MIX.parts('fire')],
    })""")
    check('KB.ABILITY_KEYS 20 → 32', api['n'] == 32, api['n'])
    check('KB.MIX.table 有 12 組', api['tbl'] == 12, api['tbl'])
    check('KB.MIX.keyOf 無序相同', api['sym'] == ['flamesword', 'flamesword'], api['sym'])
    check('KB.MIX.keyOf 無組合 / 同能力 / null → null', api['none'] == [None, None, None], api['none'])
    check('KB.MIX.keyOf 混合能力不能再混 → null', api['nomix'] == [None, None], api['nomix'])
    check('KB.MIX.isMix 正確', api['isMix'] == [True, False, False], api['isMix'])
    check('KB.MIX.parts 正確', api['parts'] == [['fire', 'sword'], None], api['parts'])


# ---------------------------------------------------------------------------
# C. 受傷掉落 → 能力星是主成分 A
# ---------------------------------------------------------------------------
def phase_star(h):
    for key, a, b in COMBOS:
        h.goto(3, 9, ability=key)
        h.run(4, 4)
        star = h.ev("""()=>{
          const p = KB.player;
          p.invuln = 0;
          p.hurt(1, { cx: p.cx + 20, cy: p.cy });
          const s = KB.game.entities.find(e => !e.dead && e.name === 'abilitystar');
          return { ability: s ? s.ability : null, playerAbility: p.ability };
        }""")
        check(f'{key}: 受傷掉出的能力星 key 是主成分 {a!r}',
              star['ability'] == a and star['playerAbility'] is None, star)
    # 對照組：一般能力掉自己的 key
    h.goto(3, 9, ability='sword'); h.run(4, 4)
    s2 = h.ev("""()=>{ const p=KB.player; p.invuln=0; p.hurt(1,{cx:p.cx+20,cy:p.cy});
      const s = KB.game.entities.find(e=>!e.dead && e.name==='abilitystar'); return s ? s.ability : null; }""")
    check('對照組: 一般能力 sword 掉 sword 星', s2 == 'sword', s2)


# ---------------------------------------------------------------------------
# D. select：短按丟棄 / 無 Helper 時長按也丟棄
# ---------------------------------------------------------------------------
def phase_select(h):
    # 這一段要測「沒有夥伴系統時」的行為 → 先把 KB.Helper 收起來，最後再還原
    h.ev("()=>{ window.__realHelper = KB.Helper; KB.Helper = undefined; }")

    def drop_test(name, frames):
        h.goto(3, 9, ability='flamesword')
        h.run(6, 6)
        h.run(frames, frames, keys='select')
        h.release()
        h.run(6, 3)
        out = h.ev("""()=>({ ability: KB.player.ability, hold: KB.player.selectHoldT|0,
          star: (KB.game.entities.find(e=>!e.dead && e.name==='abilitystar')||{}).ability || null })""")
        return out

    check('player.selectHoldT 欄位存在', h.ev("()=>typeof KB.player.selectHoldT") == 'number')
    o = drop_test('短按', 5)
    check('select 短按（5 幀）→ 丟棄能力並掉主成分星', o['ability'] is None and o['star'] == 'fire', o)
    o = drop_test('長按', 60)
    check('select 長按 60 幀（沒有 KB.Helper）→ 仍然丟棄', o['ability'] is None and o['star'] == 'fire', o)
    # 按住但還沒放開 → 不該丟
    h.goto(3, 9, ability='flamesword'); h.run(6, 6)
    h.run(30, 30, keys='select')
    mid = h.ev("()=>({ ability: KB.player.ability, hold: KB.player.selectHoldT|0 })")
    check('select 按住未放開 → 能力還在、selectHoldT 累加', mid['ability'] == 'flamesword' and mid['hold'] >= 29, mid)
    h.release(); h.run(4, 4)
    # 假 Helper：長按 45 幀以上放開 → 呼叫 KB.Helper.spawn(p) 且不丟能力
    h.ev("""()=>{ window.__helperCalls = []; KB.Helper = { spawn(p){ __helperCalls.push(p === KB.player); return true; } }; }""")
    h.goto(3, 9, ability='flamesword'); h.run(6, 6)
    h.run(50, 50, keys='select'); h.release(); h.run(6, 3)
    o = h.ev("""()=>({ ability: KB.player.ability, calls: window.__helperCalls.slice(),
      star: (KB.game.entities.find(e=>!e.dead && e.name==='abilitystar')||{}).ability || null })""")
    check('select 長按 + KB.Helper.spawn 回傳 true → 不丟能力、改叫夥伴',
          o['ability'] == 'flamesword' and o['calls'] == [True] and o['star'] is None, o)
    # 短按時不該呼叫 Helper
    h.ev("()=>{ window.__helperCalls = []; }")
    h.goto(3, 9, ability='flamesword'); h.run(6, 6)
    h.run(5, 5, keys='select'); h.release(); h.run(6, 3)
    o = h.ev("""()=>({ ability: KB.player.ability, calls: window.__helperCalls.slice() })""")
    check('select 短按不呼叫 KB.Helper.spawn', o['ability'] is None and o['calls'] == [], o)
    # Helper 拒絕（回傳 false）→ 退回丟棄
    h.ev("()=>{ KB.Helper = { spawn(){ return false; } }; }")
    h.goto(3, 9, ability='flamesword'); h.run(6, 6)
    h.run(50, 50, keys='select'); h.release(); h.run(6, 3)
    o = h.ev("""()=>({ ability: KB.player.ability,
      star: (KB.game.entities.find(e=>!e.dead && e.name==='abilitystar')||{}).ability || null })""")
    check('KB.Helper.spawn 回傳 false → 退回原本的丟棄', o['ability'] is None and o['star'] == 'fire', o)
    # 沒有能力但有夥伴時，長按仍要能進來（吸回路徑）：selectHoldT 必須繼續累加
    h.ev("()=>{ KB.Helper = { exists(){ return true; }, spawn(){ window.__recalled = true; return true; } }; window.__recalled = false; }")
    h.goto(3, 9); h.run(6, 6)
    h.ev("()=>{ KB.player.ability = null; }")
    h.run(50, 50, keys='select'); h.release(); h.run(6, 3)
    o = h.ev("()=>({ recalled: !!window.__recalled, hold: KB.player.selectHoldT|0 })")
    check('無能力但有夥伴: 長按 50 幀放開 → 呼叫 KB.Helper.spawn（吸回）', o['recalled'], o)
    h.ev("()=>{ KB.Helper = window.__realHelper; }")


# ---------------------------------------------------------------------------
# F. fix6：短按 SELECT 丟出能力星 → 砸中帶能力的敵人 → 混合星
# ---------------------------------------------------------------------------
_THROW_JS = """([enemyKey, ex, useSelect]) => {
  const p = KB.player;
  p.dir = 1;
  const en = __t.spawn({ t: enemyKey, x: ex, y: 9, dir: -1 });
  if (en && en.setCenter) { /* 站定即可 */ }
  if (useSelect) { __kb.press({ select: true }); for (let i = 0; i < 5; i++) __kb.step(1); __kb.release(); }
  else { p.dropAbility(true, true); }
  let mixed = null, enemyDeadAt = -1, landed = -1;
  for (let i = 0; i < 120; i++) {
    __kb.step(1);
    const e = KB.game.entities.find(x => x.name === enemyKey || (x.type === 'enemy' && x.name === enemyKey));
    if (enemyDeadAt < 0 && (!e || e.dead)) enemyDeadAt = i;
    const s = KB.game.entities.find(x => !x.dead && x.name === 'abilitystar');
    if (s && s.mixed && !mixed) mixed = { ability: s.ability, parts: s.mixParts, at: i };
    if (s && landed < 0 && s.bounces > 0) landed = i;
    if (mixed && landed >= 0) break;
  }
  const s = KB.game.entities.find(x => !x.dead && x.name === 'abilitystar');
  // 卡比走過去撿（直接搬到星星上，避開地形差異）
  let picked = null;
  if (s) {
    p.x = s.cx - p.w / 2; p.bottom = s.bottom; p.vx = 0; p.vy = 0;
    for (let i = 0; i < 40 && !p.ability; i++) __kb.step(1);
    picked = p.ability;
  }
  return { mixed, enemyDeadAt, landed, star: s ? { ability: s.ability, mixed: !!s.mixed, thrown: !!s.thrown } : null, picked };
}"""


def phase_throwmix(h):
    # 1) 初速：丟出去的星星往前拋（vx ±2.4 / vy -3）、受傷掉的維持原本的慢速
    v = h.ev("""()=>{
      const s = new KB.ITEMS.abilitystar(0, 0, 'fire', 1);
      const drop = { vx: s.vx, vy: s.vy, thrown: !!s.thrown };
      s.throwForward(1);
      const right = { vx: s.vx, vy: s.vy, thrown: !!s.thrown };
      const s2 = new KB.ITEMS.abilitystar(0, 0, 'fire', 1); s2.throwForward(-1);
      return { drop, right, leftVx: s2.vx, fn: typeof s.throwForward };
    }""")
    check('abilitystar.throwForward() 存在', v['fn'] == 'function', v)
    check('丟出的能力星初速 vx +2.4 / vy -3',
          abs(v['right']['vx'] - 2.4) < 1e-6 and abs(v['right']['vy'] + 3) < 1e-6 and v['right']['thrown'], v['right'])
    check('往左丟 → vx -2.4', abs(v['leftVx'] + 2.4) < 1e-6, v['leftVx'])
    check('受傷掉出的能力星維持 R3 的慢速（vx 1.0 / vy -3.5、thrown=false）',
          abs(v['drop']['vx'] - 1.0) < 1e-6 and abs(v['drop']['vy'] + 3.5) < 1e-6 and not v['drop']['thrown'], v['drop'])

    # 2) 真實流程：持有 fire → 短按 SELECT 丟出 → 砸中 bladeknight（sword）→ 炎劍混合星 → 撿起來就是炎劍
    h.goto(3, 9, ability='fire'); h.run(6, 6)
    o = h.ev(_THROW_JS, ['bladeknight', 8, True])
    check('短按 SELECT 丟出的 fire 星砸中 bladeknight → 變成 flamesword 混合星',
          o['mixed'] is not None and o['mixed']['ability'] == 'flamesword', o)
    check('混合星記得兩個成分 [fire, sword]',
          o['mixed'] is not None and o['mixed']['parts'] == ['fire', 'sword'], o['mixed'])
    check('被砸中的敵人當場被吞噬', o['enemyDeadAt'] >= 0, o)
    check('卡比撿起混合星 → 直接獲得 flamesword', o['picked'] == 'flamesword', o)

    # 3) 對照組 A：沒有組合（fire + hothead 的 fire）→ 敵人不死、星星還是 fire
    h.goto(3, 9, ability='fire'); h.run(6, 6)
    o2 = h.ev(_THROW_JS, ['hothead', 8, True])
    check('對照組: fire 星砸 hothead（同樣是 fire）→ 不混合、星星仍是 fire',
          o2['mixed'] is None and o2['star'] is not None and o2['star']['ability'] == 'fire', o2)
    check('對照組: 沒有組合時敵人不會被吞噬', o2['enemyDeadAt'] < 0, o2)
    check('對照組: 沒碰到組合就照原本落地彈跳（bounces > 0）', o2['landed'] >= 0, o2)

    # 4) 對照組 B：受傷掉出來的星星（thrown=false）飛過敵人也不會混合
    #    —— boss_test 的 kracko / dedede 機器人靠這條路徑撿回劍，行為必須完全不變
    h.goto(3, 9, ability='fire'); h.run(6, 6)
    o3 = h.ev("""()=>{
      const p = KB.player;
      __t.spawn({ t: 'bladeknight', x: 5, y: 9, dir: -1 });
      p.dropAbility(true, false);
      const s0 = KB.game.entities.find(x => !x.dead && x.name === 'abilitystar');
      if (s0) { s0.vx = 2.4; s0.vy = -3; }          // 速度一樣快，只差沒有 thrown 旗標
      let mixed = false;
      for (let i = 0; i < 90; i++) {
        __kb.step(1);
        const s = KB.game.entities.find(x => !x.dead && x.name === 'abilitystar');
        if (s && s.mixed) { mixed = true; break; }
      }
      const s = KB.game.entities.find(x => !x.dead && x.name === 'abilitystar');
      return { mixed, ability: s ? s.ability : null };
    }""")
    check('受傷掉出的能力星（thrown=false）飛過帶能力的敵人不會混合',
          o3['mixed'] is False, o3)

    # 5) fix6（QA R6-P1-02）：長按吸回後「繼續按著」不會被當成新的短按把能力再丟掉
    h.ev("()=>{ window.__realHelper2 = KB.Helper; }")
    h.goto(3, 9, ability='fire'); h.run(6, 6)
    o4 = h.ev("""()=>{
      const p = KB.player;
      // 假夥伴：第 45 幀「吸回」—— 夥伴消失、能力隔 12 幀才回到卡比身上（模擬 ReturnStar 飛行）
      let has = true, back = -1, t = 0;
      KB.Helper = {
        exists(){ return has; },
        spawn(pl){ has = false; back = t + 12; return true; },
      };
      p.ability = null; has = true;
      __kb.press({ select: true });
      for (t = 0; t < 120; t++) {
        if (has && t === 45) { has = false; back = t + 12; }     // helper.js 的 pollSelect 路徑
        if (back >= 0 && t === back) { p.giveAbility('fire'); back = -1; }
        __kb.step(1);
      }
      const beforeRelease = p.ability;
      __kb.release();
      for (let i = 0; i < 10; i++) __kb.step(1);
      const star = KB.game.entities.find(e => !e.dead && e.name === 'abilitystar');
      return { beforeRelease, after: p.ability, star: star ? star.ability : null, lock: !!p.selectLock };
    }""")
    check('長按吸回後繼續按住 SELECT，放開時不會把剛拿回的能力丟掉',
          o4['beforeRelease'] == 'fire' and o4['after'] == 'fire' and o4['star'] is None, o4)
    h.ev("()=>{ KB.Helper = window.__realHelper2; }")

    # 6) 說明文案：暫停「無能力」卡與操作說明第 2 頁都要看得到這條提示
    txt = h.ev("""()=>{
      const mv = (KB.UI.abilityInfo(null).moves || []).map(m => m.join(' '));
      const h2 = (KB.UI.HELP2 || []).map(r => r.join(' '));
      return { mv, h2 };
    }""")
    check('暫停「無能力」卡有「丟能力星砸敵人可混合」',
          any('混合' in m for m in txt['mv']), txt['mv'])
    check('操作說明第 2 頁有「丟星砸敵人可混合」',
          any('混合' in r for r in txt['h2']), txt['h2'])


# ---------------------------------------------------------------------------
# E. 定義完整性
# ---------------------------------------------------------------------------
def phase_defs(h):
    info = h.ev("""(keys)=>{
      const out = {};
      for (const k of keys) {
        const d = KB.ABILITIES[k];
        out[k] = d ? {
          moves: (d.moves||[]).length, desc: !!d.desc, flavour: !!d.flavour, color: d.color || null,
          mix: d.mix || null, inKeys: KB.ABILITY_KEYS.indexOf(k) >= 0,
          name: KB.ABILITY_NAMES[k] || null, hud: KB.ABILITY_HUD[k] || null,
          hudLen: (KB.ABILITY_HUD[k]||'').length,
          hat: KB.has(d.hat), icon: KB.has(d.icon), mini: KB.has(d.icon + '_mini'),
          anim: KB.has('kirby_attack_' + k), ult: KB.has('kirby_attack_' + k + '_ult'),
        } : null;
      }
      return out;
    }""", KEYS)
    want = dict((k, (a, b)) for k, a, b in COMBOS)
    for k, v in info.items():
        check(f'{k}: 註冊完整（KEYS / 名稱 / HUD）', v is not None and v['inKeys'] and v['name'] and v['hud'], v)
        if not v:
            continue
        check(f'{k}: 3 招 + desc + flavour + color', v['moves'] == 3 and v['desc'] and v['flavour'] and v['color'], v)
        check(f'{k}: mix == {list(want[k])}', v['mix'] == list(want[k]), v['mix'])
        check(f'{k}: hat / icon / mini / 招式動畫 / 必殺動畫都有圖', v['hat'] and v['icon'] and v['mini'] and v['anim'] and v['ult'], v)
        check(f'{k}: HUD 名稱 ≤ 7 字（HUD 欄寬 53px）', v['hudLen'] <= 7, v['hud'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    only = [x for x in a.only.split(',') if x]
    move_only = [o for o in only if o in KEYS]
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
        if not only or 'mixflow' in only:
            print('-' * 8, 'mixflow')
            try: phase_mixflow(h)
            except Exception as ex: check('mixflow: raised', False, repr(ex))
        if not only or 'star' in only:
            print('-' * 8, 'star')
            try: phase_star(h)
            except Exception as ex: check('star: raised', False, repr(ex))
        if not only or 'select' in only:
            print('-' * 8, 'select')
            try: phase_select(h)
            except Exception as ex: check('select: raised', False, repr(ex))
        if not only or 'throwmix' in only:
            print('-' * 8, 'throwmix')
            try: phase_throwmix(h)
            except Exception as ex: check('throwmix: raised', False, repr(ex))
        if not only or move_only:
            print('-' * 8, 'moves'); phase_moves(h, move_only)
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
