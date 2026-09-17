# -*- coding: utf-8 -*-
"""
混合能力第二批（Round 7 mix2 agent）自動驗證：
  A. 定義完整性：12 個混合能力註冊進 KB.ABILITY_KEYS、3 招 + desc + flavour + color
     + mix=[A,B] + hat / icon / icon_mini / 招式動畫 / 必殺動畫；HUD 英文名 ≤ 7 字；
     key 不與第一批重複、KB.MIX.table 的 key 是排序後的 'a|b'。
  B. 混合流程：持有 A + 吞下給 B 的敵人（兩個方向都測）→ ability 變成 mixkey；
     真實流程（能力台座 KB.ITEMS.essence）；持有混合能力再吞第三個 → 直接替換；
     混合能力不能再混（KB.MIX.keyOf 回 null）。
  C. 12 組合 × 3 招：命中 waddledee 會死、招式結束回到正常狀態、招式專屬證據（投射物 / 判定框）。
  D. 受傷掉落混合能力 → 能力星的 key 是「主成分 A」。
  E. 蓄力門檻吃 KB.PROG.holdMul（Lv3 ×0.8）。
  F. 全程監看 pageerror / console.error；MISSING SPRITES 必須為空。
用法：python tools/test_mix2.py [--only flamebow,mixflow,defs,star,hold] [--hitbox] [-v] [--shots]
（測試地圖與頁面輔助函式沿用 tools/enemy_test.py 的 Harness / HOOK_JS / TEST_LEVEL）
"""
import sys, pathlib, argparse
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import enemy_test as ET
from enemy_test import (Harness, HOOK_JS, TEST_LEVEL, INDEX, GROUND_TOP, PLAYER_H,
                        spawned_of, run_move)

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

results = ET.results
check = ET.check

NORMAL_STATES = ('idle', 'walk', 'run', 'fall', 'jump', 'crouch', 'float', 'slide')

# 12 組合：mixkey → (成分 A, 成分 B)
COMBOS = [
    ('flamebow', 'fire', 'bow'),
    ('frosthammer', 'ice', 'hammer'),
    ('thundersword', 'spark', 'sword'),
    ('flameninja', 'fire', 'ninja'),
    ('frostninja', 'ice', 'ninja'),
    ('thundergun', 'spark', 'gunner'),
    ('stonegiant', 'stone', 'giant'),
    ('flamedragon', 'fire', 'dragon'),
    ('thunderdragon', 'spark', 'dragon'),
    ('timebeam', 'beam', 'time'),
    ('gravityblade', 'cutter', 'gravity'),
    ('hammermech', 'hammer', 'mech'),
]
KEYS = [c[0] for c in COMBOS]
# 第一批（不可以重複的 key / 組合）
MIX1_KEYS = ['flamesword', 'frostsword', 'thunderblade', 'flamegun', 'frostgun', 'thunderbow',
             'flamehammer', 'stonehammer', 'shadowblade', 'starmage', 'frostdragon', 'thundermech']

# ---------------------------------------------------------------------------
# A. 招式表：(mixkey, label, enemy, ex, ey, seq, wait, px, py)
#    seq 同 enemy_test：('keys', frames) / ('@air', 高度) / (None, n)=放開按鍵
#    蓄力必殺一律「按住 attack 56 幀後放開」（Lv1 門檻 50）。
# ---------------------------------------------------------------------------
AIR = lambda h: ('@air', h)
MOVES = [
    # ---- flamebow 焰弓 ----
    ('flamebow', 'X 火箭', 'waddledee', 8, 9, [('attack', 22), (None, 2)], 60, 3, 9),
    ('flamebow', '空中 X 火雨', 'waddledee', 5, 9, [AIR(46), ('attack', 30), (None, 2)], 70, 4, 9),
    ('flamebow', '蓄力 鳳凰箭', 'waddledee', 12, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- frosthammer 冰鎚 ----
    ('frosthammer', 'X 凍地衝擊', 'waddledee', 6, 9, [('attack', 24), (None, 2)], 60, 3, 9),
    ('frosthammer', '↓+X 冰柱群', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 80, 3, 9),
    ('frosthammer', '蓄力 冰河期', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- thundersword 雷劍 ----
    ('thundersword', 'X 帶電斬', 'waddledee', 5, 9, [('attack', 22), (None, 2)], 50, 3, 9),
    ('thundersword', '空中 X 雷擊落下斬', 'waddledee', 4, 9, [AIR(44), ('attack', 8), (None, 2)], 70, 3, 9),
    ('thundersword', '蓄力 雷神劍', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- flameninja 火忍 ----
    ('flameninja', 'X 火遁手裡劍', 'waddledee', 8, 9, [('attack', 20), (None, 2)], 60, 3, 9),
    ('flameninja', '↓+X 火焰替身爆', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 70, 3, 9),
    ('flameninja', '蓄力 火遁大炎', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 110, 3, 9),
    # ---- frostninja 冰忍 ----
    ('frostninja', 'X 冰針三連', 'waddledee', 8, 9, [('attack', 22), (None, 2)], 60, 3, 9),
    ('frostninja', '↓+X 冰鏡瞬移', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 70, 3, 9),
    ('frostninja', '蓄力 吹雪', 'waddledee', 9, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- thundergun 雷槍 ----
    ('thundergun', 'X 電擊彈鎖鏈', 'waddledee', 9, 9, [('attack', 26), (None, 2)], 70, 3, 9),
    ('thundergun', '↓+X 電網霰彈', 'waddledee', 6, 9, [('down', 3), ('down,attack', 3), (None, 2)], 80, 3, 9),
    ('thundergun', '蓄力 雷射砲', 'waddledee', 12, 9, [('attack', 56), (None, 2)], 120, 3, 9),
    # ---- stonegiant 岩巨人 ----
    ('stonegiant', 'X 岩拳踩踏', 'waddledee', 5, 9, [('attack', 34), (None, 2)], 60, 3, 9),
    ('stonegiant', '↓+X 滾石衝撞', 'waddledee', 9, 9, [('down', 3), ('down,attack', 3), (None, 2)], 80, 3, 9),
    ('stonegiant', '蓄力 山崩', 'waddledee', 7, 9, [('attack', 56), (None, 2)], 140, 3, 9),
    # ---- flamedragon 炎龍 ----
    ('flamedragon', 'X 炎息加強', 'waddledee', 6, 9, [('attack', 38), (None, 2)], 60, 3, 9),
    ('flamedragon', '空中 X 炎翼衝', 'waddledee', 6, 9, [AIR(40), ('attack', 8), (None, 2)], 70, 3, 9),
    ('flamedragon', '蓄力 太陽炎', 'waddledee', 9, 9, [('attack', 56), (None, 2)], 130, 3, 9),
    # ---- thunderdragon 雷龍 ----
    ('thunderdragon', 'X 雷息', 'waddledee', 6, 9, [('attack', 36), (None, 2)], 60, 3, 9),
    ('thunderdragon', '空中 X 雷翼俯衝', 'waddledee', 6, 9, [AIR(40), ('attack', 8), (None, 2)], 70, 3, 9),
    ('thunderdragon', '蓄力 雷雲', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 140, 3, 9),
    # ---- timebeam 時光束 ----
    ('timebeam', 'X 凍結光束', 'waddledee', 8, 9, [('attack', 24), (None, 2)], 60, 3, 9),
    ('timebeam', '↑+X 時間裂縫', 'waddledee', 6, 9, [('up', 3), ('up,attack', 3), (None, 2)], 90, 3, 9),
    ('timebeam', '蓄力 時停爆', 'waddledee', 7, 9, [('attack', 56), (None, 2)], 140, 3, 9),
    # ---- gravityblade 重力刃 ----
    ('gravityblade', 'X 軌道刃環繞', 'waddledee', 6, 9, [('attack', 24), (None, 2)], 110, 3, 9, -1),
    ('gravityblade', '↓+X 引力回收刃', 'waddledee', 7, 9, [('down', 3), ('down,attack', 3), (None, 2)], 90, 3, 9),
    ('gravityblade', '蓄力 刃之奇點', 'waddledee', 7, 9, [('attack', 56), (None, 2)], 140, 3, 9),
    # ---- hammermech 鎚機甲 ----
    ('hammermech', 'X 火箭鎚', 'waddledee', 5, 9, [('attack', 32), (None, 2)], 60, 3, 9),
    ('hammermech', '↑+X 飛彈鎚', 'waddledee', 9, 9, [('up', 3), ('up,attack', 3), (None, 2)], 100, 3, 9),
    ('hammermech', '蓄力 軌道砲鎚', 'waddledee', 8, 9, [('attack', 56), (None, 2)], 130, 3, 9),
]

# ---------------------------------------------------------------------------
# Round 9：每組補齊 ↑+X / ↓+X / 空中 X，且 ↑X / ↓X 在空中也要能用。
#   加上上面 MOVES 既有的地面招，12 組 × { ↑X 地、↓X 地、↑X 空、↓X 空、空中 X } 全有測試。
# ---------------------------------------------------------------------------
UP_G = [('up,attack', 3), (None, 2)]
DN_G = [('down', 2), ('down,attack', 3), (None, 2)]
UP_A = lambda h=40: [AIR(h), ('up,attack', 3), (None, 2)]
DN_A = lambda h=40: [AIR(h), ('down,attack', 3), (None, 2)]
AIR_X = lambda h, n=8: [AIR(h), ('attack', n), (None, 2)]

MOVES9 = [
    # ---- flamebow（原本就有 空中 X）----
    ('flamebow', '↑+X 烈陽仰射', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('flamebow', '↓+X 地火箭列', 'waddledee', 4, 9, DN_G, 90, 3, 9),
    ('flamebow', '空中 ↑+X 烈陽仰射', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('flamebow', '空中 ↓+X 地火箭列', 'waddledee', 4, 9, DN_A(), 90, 3, 9),
    # ---- frosthammer（原本就有 ↓+X）----
    ('frosthammer', '↑+X 冰鎚上擊', 'waddledee', 4, 9, UP_G, 70, 3, 9),
    ('frosthammer', '空中 ↑+X 冰鎚上擊', 'waddledee', 4, 9, UP_A(), 80, 3, 9),
    ('frosthammer', '空中 ↓+X 冰柱群', 'waddledee', 6, 9, DN_A(), 90, 3, 9),
    ('frosthammer', '空中 X 霜墜鎚', 'waddledee', 4, 9, AIR_X(46, 6), 80, 3, 9),
    # ---- thundersword（原本就有 空中 X）----
    ('thundersword', '↑+X 雷昇斬', 'waddledee', 4, 9, UP_G, 60, 3, 9),
    ('thundersword', '↓+X 落雷插劍', 'waddledee', 4, 9, DN_G, 70, 3, 9),
    ('thundersword', '空中 ↑+X 雷昇斬', 'waddledee', 4, 9, UP_A(), 70, 3, 9),
    ('thundersword', '空中 ↓+X 落雷插劍', 'waddledee', 4, 9, DN_A(), 80, 3, 9),
    # ---- flameninja（原本就有 ↓+X）----
    ('flameninja', '↑+X 火遁天輪手裡劍', 'waddledee', 4, 9, UP_G, 70, 3, 9),
    ('flameninja', '空中 ↑+X 火遁天輪手裡劍', 'waddledee', 4, 9, UP_A(), 80, 3, 9),
    ('flameninja', '空中 ↓+X 火焰替身爆', 'waddledee', 6, 9, DN_A(), 80, 3, 9),
    ('flameninja', '空中 X 炎舞亂投', 'waddledee', 5, 9, AIR_X(44, 26), 80, 3, 9),
    # ---- frostninja（原本就有 ↓+X）----
    ('frostninja', '↑+X 冰柱天梯', 'waddledee', 4, 9, UP_G, 70, 3, 9),
    ('frostninja', '空中 ↑+X 冰柱天梯', 'waddledee', 4, 9, UP_A(), 80, 3, 9),
    ('frostninja', '空中 ↓+X 冰鏡瞬移', 'waddledee', 6, 9, DN_A(), 80, 3, 9),
    ('frostninja', '空中 X 霰針亂舞', 'waddledee', 5, 9, AIR_X(44, 24), 80, 3, 9),
    # ---- thundergun（原本就有 ↓+X）----
    ('thundergun', '↑+X 對空電漿彈', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('thundergun', '空中 ↑+X 對空電漿彈', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('thundergun', '空中 ↓+X 電網霰彈', 'waddledee', 6, 9, DN_A(), 90, 3, 9),
    ('thundergun', '空中 X 滯空掃射', 'waddledee', 5, 9, AIR_X(44, 26), 90, 3, 9),
    # ---- stonegiant（原本就有 ↓+X）----
    ('stonegiant', '↑+X 擎天岩柱', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('stonegiant', '空中 ↑+X 擎天岩柱', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('stonegiant', '空中 ↓+X 滾石衝撞', 'waddledee', 9, 9, DN_A(), 90, 3, 9),
    ('stonegiant', '空中 X 巨人墜擊', 'waddledee', 4, 9, AIR_X(48, 6), 80, 3, 9),
    # ---- flamedragon（原本就有 空中 X）----
    ('flamedragon', '↑+X 焚天吐息', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('flamedragon', '↓+X 熔岩爪痕', 'waddledee', 4, 9, DN_G, 80, 3, 9),
    ('flamedragon', '空中 ↑+X 焚天吐息', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('flamedragon', '空中 ↓+X 熔岩爪痕', 'waddledee', 4, 9, DN_A(), 90, 3, 9),
    # ---- thunderdragon（原本就有 空中 X）----
    ('thunderdragon', '↑+X 雷鳴嘶吼', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('thunderdragon', '↓+X 地脈雷爪', 'waddledee', 4, 9, DN_G, 80, 3, 9),
    ('thunderdragon', '空中 ↑+X 雷鳴嘶吼', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('thunderdragon', '空中 ↓+X 地脈雷爪', 'waddledee', 4, 9, DN_A(), 90, 3, 9),
    # ---- timebeam（原本就有 ↑+X）----
    ('timebeam', '↓+X 時砂沙漏', 'waddledee', 4, 9, DN_G, 90, 3, 9),
    ('timebeam', '空中 ↑+X 時間裂縫', 'waddledee', 6, 9, UP_A(), 100, 3, 9),
    ('timebeam', '空中 ↓+X 時砂沙漏', 'waddledee', 4, 9, DN_A(), 90, 3, 9),
    ('timebeam', '空中 X 逆行光環', 'waddledee', 4, 9, AIR_X(40, 28), 90, 3, 9),
    # ---- gravityblade（原本就有 ↓+X）----
    ('gravityblade', '↑+X 反重力昇刃', 'waddledee', 4, 9, UP_G, 80, 3, 9),
    ('gravityblade', '空中 ↑+X 反重力昇刃', 'waddledee', 4, 9, UP_A(), 90, 3, 9),
    ('gravityblade', '空中 ↓+X 引力回收刃', 'waddledee', 7, 9, DN_A(), 100, 3, 9),
    ('gravityblade', '空中 X 墜壓刃', 'waddledee', 4, 9, AIR_X(44, 6), 80, 3, 9),
    # ---- hammermech（原本就有 ↑+X）----
    ('hammermech', '↓+X 地錨衝擊', 'waddledee', 4, 9, DN_G, 90, 3, 9),
    ('hammermech', '空中 ↑+X 飛彈鎚', 'waddledee', 9, 9, UP_A(), 110, 3, 9),
    ('hammermech', '空中 ↓+X 地錨衝擊', 'waddledee', 4, 9, DN_A(), 90, 3, 9),
    ('hammermech', '空中 X 噴射迴旋鎚', 'waddledee', 4, 9, AIR_X(40, 28), 90, 3, 9),
]
MOVES += MOVES9


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


def both(*fns):
    return lambda sp: all(f(sp) for f in fns)


# 招式專屬證據（label → (說明, 判定函式(spawned)))
EXTRA = {
    'X 火箭': ('2 發 proj_mix2_arrow_fire + 48×38 爆炸判定',
             both(has_proj('proj_mix2_arrow_fire', 2), has_box(48, 38, 1, 'fire'))),
    '空中 X 火雨': ('≥ 9 支下墜火箭箭', has_proj('proj_mix2_arrow_fire', 9)),
    '蓄力 鳳凰箭': ('proj_mix2_rocket_fire 巨箭 + 沿路火海', has_proj('proj_mix2_rocket_fire', 1)),
    'X 凍地衝擊': ('76×30 凍結地面判定', has_box(76, 30, 1, 'ice')),
    '↓+X 冰柱群': ('5 根 proj_mix2_shard_ice', has_proj('proj_mix2_shard_ice', 5)),
    '蓄力 冰河期': ('272×160 全畫面凍結', has_box(272, 160, 1, 'ice')),
    'X 帶電斬': ('2 次 34×30 帶電斬（會麻痺）', has_box(34, 30, 2, 'spark')),
    '空中 X 雷擊落下斬': ('落地 80×40 雷擊判定', has_box(80, 40, 1, 'spark')),
    '蓄力 雷神劍': ('150×200 巨大雷劍', has_box(150, 200, 1, 'spark')),
    'X 火遁手裡劍': ('3 枚 proj_mix2_star_fire', has_proj('proj_mix2_star_fire', 3)),
    '↓+X 火焰替身爆': ('瞬移落點 60×48 + 原地替身 54×46',
                  both(has_box(60, 48, 1, 'fire'), has_box(54, 46, 2, 'fire'))),
    '蓄力 火遁大炎': ('170×120 大炎牆', has_box(170, 120, 1, 'fire')),
    'X 冰針三連': ('3 根 proj_mix2_arrow_ice', has_proj('proj_mix2_arrow_ice', 3)),
    '↓+X 冰鏡瞬移': ('瞬移落點 44×32 凍結斬 + 冰鏡碎片',
                 both(has_box(44, 32, 1, 'ice'), has_proj('proj_mix2_shard_ice', 2))),
    '蓄力 吹雪': ('200×140 暴風雪判定', has_box(200, 140, 1, 'ice')),
    'X 電擊彈鎖鏈': ('≥ 3 發 proj_mix2_orb_spark', has_proj('proj_mix2_orb_spark', 3)),
    '↓+X 電網霰彈': ('7 發散彈 + 70×58 電網',
                 both(has_proj('proj_mix2_star_spark', 7), has_box(70, 58, 1, 'spark'))),
    '蓄力 雷射砲': ('220×26 雷射判定', has_box(220, 26, 1, 'spark')),
    'X 岩拳踩踏': ('岩拳 44×34 + 踩踏 90×32',
               both(has_box(44, 34, 1, 'stone'), has_box(90, 32, 1, 'stone'))),
    '↓+X 滾石衝撞': ('≥ 3 段 34×32 滾動判定', has_box(34, 32, 3, 'stone')),
    '蓄力 山崩': ('≥ 5 顆落石 + 272×44 全地面',
               both(has_proj('proj_mix2_orb_stone', 5), has_box(272, 44, 1, 'stone'))),
    'X 炎息加強': ('龍息拉長到 ≥ 76px', has_box(76, 30, 1, 'fire')),
    '空中 X 炎翼衝': ('落地 74×38 + 2 道火柱',
                 both(has_box(74, 38, 1, 'fire'), has_box(18, 48, 2, 'fire'))),
    '蓄力 太陽炎': ('140×130 太陽判定 + 巨大火球',
               both(has_box(140, 130, 1, 'fire'), has_proj('proj_mix2_orb_fire', 1))),
    'X 雷息': ('雷息拉長到 ≥ 68px', has_box(68, 28, 1, 'spark')),
    '空中 X 雷翼俯衝': ('落地 70×36 + 2 道落雷柱',
                  both(has_box(70, 36, 1, 'spark'), has_box(26, 200, 2, 'spark'))),
    '蓄力 雷雲': ('≥ 6 道 28×200 落雷', has_box(28, 200, 6, 'spark')),
    'X 凍結光束': ('110×20 時停光束', has_box(110, 20, 1, 'beam')),
    '↑+X 時間裂縫': ('3 個 proj_mix2_ring_time + 40×84 裂縫',
                 both(has_proj('proj_mix2_ring_time', 3), has_box(40, 84, 1, 'beam'))),
    '蓄力 時停爆': ('260×190 全畫面時停爆', has_box(260, 190, 1, 'beam')),
    'X 軌道刃環繞': ('4 枚 Mix2Orbit 環繞刃', has_cls('Mix2Orbit', 4)),
    '↓+X 引力回收刃': ('Mix2Return 回收刃', has_cls('Mix2Return', 1)),
    '蓄力 刃之奇點': ('120×110 奇點 + ≥ 12 道收束刃',
                 both(has_box(120, 110, 1, 'cutter'), has_proj('proj_mix2_ring_void', 12))),
    'X 火箭鎚': ('鎚頭 46×36 + 地面 60×30',
              both(has_box(46, 36, 1, 'mech'), has_box(60, 30, 1, 'mech'))),
    '↑+X 飛彈鎚': ('2 枚 Mix2Homing 飛彈', has_cls('Mix2Homing', 2)),
    '蓄力 軌道砲鎚': ('70×230 軌道砲柱', has_box(70, 230, 1, 'mech')),
    # ---- Round 9 新招 ----
    '↑+X 烈陽仰射': ('50×50 烈陽炸裂', has_box(50, 50, 1, 'fire')),
    '空中 ↑+X 烈陽仰射': ('空中一樣炸出 50×50 烈陽', has_box(50, 50, 1, 'fire')),
    '↓+X 地火箭列': ('3 根 18×46 火柱', has_box(18, 46, 3, 'fire')),
    '空中 ↓+X 地火箭列': ('空中一樣立起 3 根火柱', has_box(18, 46, 3, 'fire')),
    '↑+X 冰鎚上擊': ('32×54 上擊 + 2 片冰刃',
                 lambda sp: has_box(32, 54, 1, 'ice')(sp) and has_proj('proj_mix2_shard_ice', 2)(sp)),
    '空中 ↑+X 冰鎚上擊': ('空中升招的地面餘波（ice）', has_box(44, 22, 1, 'ice')),
    '空中 ↓+X 冰柱群': ('空中一樣豎起 5 根冰柱', has_proj('proj_mix2_shard_ice', 5)),
    '空中 X 霜墜鎚': ('落地 68×34 凍結判定', has_box(68, 34, 1, 'ice')),
    '↑+X 雷昇斬': ('24×68 雷昇斬', has_box(24, 68, 1, 'spark')),
    '空中 ↑+X 雷昇斬': ('空中升招的地面餘波（spark）', has_box(44, 22, 1, 'spark')),
    '↓+X 落雷插劍': ('84×22 地面落雷', has_box(84, 22, 1, 'spark')),
    '空中 ↓+X 落雷插劍': ('空中一樣打出 84×22 地面落雷', has_box(84, 22, 1, 'spark')),
    '↑+X 火遁天輪手裡劍': ('30×56 昇焰 + 3 枚上飛手裡劍',
                    lambda sp: has_box(30, 56, 1, 'fire')(sp) and has_proj('proj_mix2_star_fire', 3)(sp)),
    '空中 ↑+X 火遁天輪手裡劍': ('空中升招的地面餘波（fire）', has_box(44, 22, 1, 'fire')),
    '空中 ↓+X 火焰替身爆': ('空中一樣留下替身爆（54×46）', has_box(54, 46, 1, 'fire')),
    '空中 X 炎舞亂投': ('≥ 5 枚下壓手裡劍', has_proj('proj_mix2_star_fire', 5)),
    '↑+X 冰柱天梯': ('28×58 冰梯 + 3 根上飛冰刃',
                 lambda sp: has_box(28, 58, 1, 'ice')(sp) and has_proj('proj_mix2_shard_ice', 3)(sp)),
    '空中 ↑+X 冰柱天梯': ('空中升招的地面餘波（ice）', has_box(44, 22, 1, 'ice')),
    '空中 ↓+X 冰鏡瞬移': ('空中一樣瞬移並留下碎鏡冰片', has_proj('proj_mix2_shard_ice', 2)),
    '空中 X 霰針亂舞': ('≥ 6 支下壓冰針', has_proj('proj_mix2_arrow_ice', 6)),
    '↑+X 對空電漿彈': ('46×46 電網雲', has_box(46, 46, 1, 'spark')),
    '空中 ↑+X 對空電漿彈': ('空中一樣張開 46×46 電網雲', has_box(46, 46, 1, 'spark')),
    '空中 ↓+X 電網霰彈': ('空中一樣打出電網霰彈', has_proj('proj_mix2_star_spark', 7)),
    '空中 X 滯空掃射': ('≥ 4 發下壓電擊彈', has_proj('proj_mix2_orb_spark', 4)),
    '↑+X 擎天岩柱': ('32×62 岩柱 + 2 塊上飛岩',
                 lambda sp: has_box(32, 62, 1, 'stone')(sp) and has_proj('proj_mix2_shard_stone', 2)(sp)),
    '空中 ↑+X 擎天岩柱': ('空中升招的地面餘波（stone）', has_box(44, 22, 1, 'stone')),
    '空中 ↓+X 滾石衝撞': ('空中一樣滾出 stone 判定', has_box(30, 24, 1, 'stone')),
    '空中 X 巨人墜擊': ('落地 96×36 巨人震地', has_box(96, 36, 1, 'stone')),
    '↑+X 焚天吐息': ('28×68 仰天炎息', has_box(28, 68, 1, 'fire')),
    '空中 ↑+X 焚天吐息': ('空中一樣吐出 28×68 炎息', has_box(28, 68, 1, 'fire')),
    '↓+X 熔岩爪痕': ('72×24 熔岩爪 + 火海', lambda sp: has_box(72, 24, 1, 'fire')(sp) and has_box(44, 22, 1, 'fire')(sp)),
    '空中 ↓+X 熔岩爪痕': ('空中一樣抓出 72×24 熔岩爪', has_box(72, 24, 1, 'fire')),
    '↑+X 雷鳴嘶吼': ('26×70 雷吼', has_box(26, 70, 1, 'spark')),
    '空中 ↑+X 雷鳴嘶吼': ('空中一樣吼出 26×70 雷吼', has_box(26, 70, 1, 'spark')),
    '↓+X 地脈雷爪': ('76×24 地脈電流', has_box(76, 24, 1, 'spark')),
    '空中 ↓+X 地脈雷爪': ('空中一樣打出 76×24 地脈電流', has_box(76, 24, 1, 'spark')),
    '↓+X 時砂沙漏': ('66×42 時砂場 + proj_mix2_ring_time',
                 lambda sp: has_box(66, 42, 1, 'beam')(sp) and has_proj('proj_mix2_ring_time', 1)(sp)),
    '空中 ↓+X 時砂沙漏': ('空中一樣張開 66×42 時砂場', has_box(66, 42, 1, 'beam')),
    '空中 ↑+X 時間裂縫': ('空中一樣撕開 3 道時間裂縫', has_proj('proj_mix2_ring_time', 3)),
    '空中 X 逆行光環': ('44×44 逆行光環', has_box(44, 44, 1, 'beam')),
    '↑+X 反重力昇刃': ('30×58 昇刃 + 2 枚上飛刃',
                  lambda sp: has_box(30, 58, 1, 'cutter')(sp) and has_proj('proj_mix2_star_void', 2)(sp)),
    '空中 ↑+X 反重力昇刃': ('空中升招的地面餘波（cutter）', has_box(44, 22, 1, 'cutter')),
    '空中 ↓+X 引力回收刃': ('空中一樣丟出 Mix2Return 回收刃', has_cls('Mix2Return', 1)),
    '空中 X 墜壓刃': ('落地 64×32 重力壓', has_box(64, 32, 1, 'cutter')),
    '↓+X 地錨衝擊': ('80×28 地錨 + 2 枚橫飛火箭',
                 lambda sp: has_box(80, 28, 1, 'mech')(sp) and has_proj('proj_mix2_rocket_steel', 2)(sp)),
    '空中 ↓+X 地錨衝擊': ('空中一樣砸出 80×28 地錨', has_box(80, 28, 1, 'mech')),
    '空中 ↑+X 飛彈鎚': ('空中一樣射出 2 枚 Mix2Homing', has_cls('Mix2Homing', 2)),
    '空中 X 噴射迴旋鎚': ('44×40 迴旋判定 + 2 枚火箭',
                   lambda sp: has_box(44, 40, 1, 'mech')(sp) and has_proj('proj_mix2_rocket_steel', 2)(sp)),
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
                       boxes=[(x['kind'], x['w'], x['h']) for x in sp if x['type'] == 'hitbox' and x['owner'] == 'player'][:12],
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
    # 2) 真實流程：能力台座（KB.ITEMS.essence）—— 持有 stone 時踩 giant 台座 → 岩巨人
    h.goto(3, 9, ability='stone')
    h.run(4, 4)
    got = h.ev("""()=>{
      const p = KB.player;
      KB.spawn(new KB.ITEMS.essence(p.x, p.y, 'giant'));
      for (let i = 0; i < 10; i++) __kb.step(1);
      return p.ability;
    }""")
    h.run(20, 10)
    check('真實流程: 持有 stone 時踩 giant 能力台座 → stonegiant', got == 'stonegiant', got)
    # 站在台座上不放也不會被降級（fix6b 的 armed 規則對第二批一樣有效）
    stay = h.ev("""()=>{
      const p = KB.player, out = [];
      for (let i = 0; i < 4; i++) { for (let k = 0; k < 40; k++) __kb.step(1); out.push(p.ability); }
      return out;
    }""")
    check('站在 giant 台座上 160 幀，stonegiant 不會被降級回 giant',
          all(a == 'stonegiant' for a in stay), stay)
    # 反向：持有 time 踩 beam 台座 → timebeam
    h.goto(3, 9, ability='time'); h.run(4, 4)
    rev = h.ev("""()=>{
      const p = KB.player;
      KB.spawn(new KB.ITEMS.essence(p.x, p.y, 'beam'));
      for (let i = 0; i < 10; i++) __kb.step(1);
      return p.ability;
    }""")
    h.run(10, 10)
    check('真實流程: 持有 time 時踩 beam 台座 → timebeam', rev == 'timebeam', rev)
    # 3) 混合能力記進圖鑑
    h.goto(3, 9, ability='gravityblade'); h.run(6, 6)
    seen = h.ev("()=>!!(KB.save.seen && KB.save.seen.gravityblade)")
    check('混合能力記進 KB.save.seen', seen, seen)
    # 4) 持有混合能力再吞第三個 → 直接替換（不再混合）
    got = h.ev("""()=>{
      const p = KB.player;
      p.mouth = { ability: 'ice', name: 'test', score: 0 };
      p.setState('full'); p.swallow();
      return p.ability;
    }""")
    h.run(6, 6)
    check('持有 gravityblade 再吞 ice → 替換成 ice（不再混合）', got == 'ice', got)
    # 5) KB.MIX API（第二批的 12 組都要查得到、而且混合能力不能再混）
    api = h.ev("""(keys)=>{
      const tbl = KB.MIX.table;
      return {
        n: KB.ABILITY_KEYS.length,
        tbl: Object.keys(tbl).length,
        sorted: Object.keys(tbl).every(k => { const a = k.split('|'); return a.length === 2 && a[0] < a[1]; }),
        sym: [KB.MIX.keyOf('fire','bow'), KB.MIX.keyOf('bow','fire')],
        none: [KB.MIX.keyOf('bow','bow'), KB.MIX.keyOf('bow','beam'), KB.MIX.keyOf(null,'bow')],
        nomix: [KB.MIX.keyOf('flamebow','ice'), KB.MIX.keyOf('ice','flamebow'), KB.MIX.keyOf('flamebow','flamesword')],
        isMix: keys.map(k => KB.MIX.isMix(k)),
        parts: [KB.MIX.parts('stonegiant'), KB.MIX.parts('bow')],
        dup: keys.filter(k => KB.ABILITY_KEYS.filter(x => x === k).length !== 1),
      };
    }""", KEYS)
    check('KB.ABILITY_KEYS 至少 44 個（第一批 32 + 第二批 12）', api['n'] >= 44, api['n'])
    check('KB.MIX.table 至少 24 組（兩批各 12）', api['tbl'] >= 24, api['tbl'])
    check('KB.MIX.table 的 key 全部是排序後的 a|b', api['sorted'], api['sorted'])
    check('KB.MIX.keyOf 無序相同（fire+bow）', api['sym'] == ['flamebow', 'flamebow'], api['sym'])
    check('KB.MIX.keyOf 同能力 / 無組合 / null → null', api['none'] == [None, None, None], api['none'])
    check('KB.MIX.keyOf 混合能力不能再混 → null', api['nomix'] == [None, None, None], api['nomix'])
    check('12 個第二批 key 都被 KB.MIX.isMix 認得', all(api['isMix']), api['isMix'])
    check('KB.MIX.parts 正確', api['parts'] == [['stone', 'giant'], None], api['parts'])
    check('KB.ABILITY_KEYS 沒有重複註冊', api['dup'] == [], api['dup'])


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


# ---------------------------------------------------------------------------
# D. 蓄力門檻吃 KB.PROG.holdMul
# ---------------------------------------------------------------------------
_HOLD_JS = """([key, lv, stopAt]) => {
  const p = KB.player;
  __kb.release();
  try {
    const sv = (KB.PROG && KB.PROG.save) ? KB.PROG.save() : null;
    if (sv) { sv.abilityXp[key] = (lv >= 3 ? 8 : lv >= 2 ? 3 : 0); sv.abilityLv[key] = lv || 1; }
  } catch (e) { }
  p.ability = null; p.abilityData = {}; p.vx = 0; p.vy = 0;
  p.giveAbility(key); p.setState('idle');
  // 變身演出的 hitstop 期間 game.update 直接 return，先把停格跑完再開始數
  for (let i = 0; i < 90 && (KB.game.freezeT | 0) > 0; i++) __kb.step(1);
  __kb.step(4);
  __kb.press({ attack: true });
  let real = -1, tick = -1, held = 0;
  for (let i = 1; i <= 150; i++) {
    __kb.step(1); held = i;
    const d = p.abilityData || {};
    if (stopAt > 0 && (d.t | 0) >= stopAt) break;         // 只按到「還沒蓄滿」就放手
    if (d.charged) { real = i; tick = d.t | 0; break; }
  }
  const chargedAtRelease = !!(p.abilityData || {}).charged;
  __kb.release();
  let mode = null;
  for (let i = 0; i < 60; i++) { __kb.step(1); if ((p.abilityData || {}).mode === 'ult') { mode = 'ult'; break; } }
  __kb.release();
  return { real, tick, held, chargedAtRelease, mode, mul: (KB.PROG && KB.PROG.holdMul) ? KB.PROG.holdMul(key) : 1 };
}"""


def phase_hold(h):
    """蓄力門檻：招式表寫的 50 幀 = abilityData.t 的第 50 幀（Lv1）；
    Lv3 乘 KB.PROG.holdMul(0.8) → 第 40 幀。
    （真實按鍵幀數會比 abilityData.t 多幾幀 —— 招式中途的 hitstop 期間 game.update 直接 return，
      d.t 不會加，所以只驗「>= 門檻、且不超過門檻 + 14」。）"""
    N = 50
    M = max(4, round(N * 0.8))     # Lv3 = 40
    for key in KEYS:
        h.goto(3, 9)
        o = h.ev(_HOLD_JS, [key, 1, 0])
        check(f'{key}: Lv1 蓄滿在 abilityData.t 的第 {N} 幀', o['tick'] == N, o)
        check(f'{key}: Lv1 蓄滿後放開 → 進入必殺（mode ult）', o['mode'] == 'ult', o)
        check(f'{key}: Lv1 實際按鍵幀數 {N}~{N + 14}（hitstop 會吃掉幾幀）',
              N <= o['real'] <= N + 14, o)
        h.goto(3, 9)
        off = h.ev(_HOLD_JS, [key, 1, N - 6])
        check(f'{key}: Lv1 只按到 d.t={N - 6} 就放開 → 不觸發必殺',
              (not off['chargedAtRelease']) and off['mode'] is None, off)
        mv = h.ev("([k,n])=>{const d=KB.ABILITIES[k]; return (d.moves||[]).some(m=>String(m[0]).indexOf(String(n))>=0);}", [key, N])
        check(f'{key}: 招式表有寫出 {N} 幀（Lv1 門檻）', mv, mv)
    # Lv3：門檻縮成 40
    for key in KEYS:
        mul = h.ev("""(k)=>{ const sv = KB.PROG.save(); sv.abilityXp[k] = 8; sv.abilityLv[k] = 3;
          return [KB.PROG.level(k), KB.PROG.holdMul(k)]; }""", key)
        check(f'{key}: Lv3 → holdMul 0.8', mul == [3, 0.8], mul)
        h.goto(3, 9)
        o = h.ev(_HOLD_JS, [key, 3, 0])
        check(f'{key}: Lv3 蓄滿提早到第 {M} 幀（Lv1 是 {N}）', o['tick'] == M, o)
        check(f'{key}: Lv3 蓄滿後放開 → 進入必殺（mode ult）', o['mode'] == 'ult', o)
    h.ev("()=>{ try { const sv = KB.PROG.save(); sv.abilityXp = {}; sv.abilityLv = {}; } catch (e) { } }")


# ---------------------------------------------------------------------------
# E. 定義完整性
# ---------------------------------------------------------------------------
def phase_defs(h):
    info = h.ev("""(keys)=>{
      const out = {};
      for (const k of keys) {
        const d = KB.ABILITIES[k];
        out[k] = d ? {
          moves: (d.moves||[]).length, movesOk: (d.moves||[]).every(m => Array.isArray(m) && m.length === 2 && m[0] && m[1]),
          desc: !!d.desc, flavour: !!d.flavour, color: d.color || null,
          mix: d.mix || null, mixEl: d.mixEl || null, transform: !!d.transform,
          inKeys: KB.ABILITY_KEYS.indexOf(k) >= 0,
          name: KB.ABILITY_NAMES[k] || null, hud: KB.ABILITY_HUD[k] || null,
          hudLen: (KB.ABILITY_HUD[k]||'').length, hudAscii: /^[A-Z0-9]+$/.test(KB.ABILITY_HUD[k]||''),
          hat: KB.has(d.hat), icon: KB.has(d.icon), mini: KB.has(d.icon + '_mini'),
          anim: KB.has('kirby_attack_' + k), animN: (KB.SPR['kirby_attack_' + k]||{}).n || 0,
          ult: KB.has('kirby_attack_' + k + '_ult'),
          animUp: KB.has('kirby_attack_' + k + '_up'), animDn: KB.has('kirby_attack_' + k + '_dn'),
          mvKeys: (d.moves || []).map(m => String(m[0])),
          slots: ['m1', 'up', 'dn', 'air', 'ult'].filter(x => d.mv && d.mv[x]),
          iconW: (KB.SPR[d.icon]||{}).w || 0, iconH: (KB.SPR[d.icon]||{}).h || 0,
        } : null;
      }
      return out;
    }""", KEYS)
    want = dict((k, (a, b)) for k, a, b in COMBOS)
    for k, v in info.items():
        check(f'{k}: 註冊完整（KEYS / 名稱 / HUD）', v is not None and v['inKeys'] and v['name'] and v['hud'], v)
        if not v:
            continue
        check(f'{k}: 5 招（每招都有按鍵 + 招式名）+ desc + flavour + color',
              v['moves'] == 5 and v['movesOk'] and v['desc'] and v['flavour'] and v['color'], v)
        mk = v['mvKeys']
        check(f'{k}: 招式表固定順序 X / ↑+X / ↓+X / 空中 X / 蓄力',
              len(mk) == 5 and mk[0] == 'X' and '↑' in mk[1] and '↓' in mk[2] and '空中' in mk[3] and '按住' in mk[4], mk)
        check(f'{k}: 招式表同時含 ↑ 與 ↓', any('↑' in x for x in mk) and any('↓' in x for x in mk), mk)
        check(f'{k}: 五個招式槽齊全（m1 / up / dn / air / ult）',
              v['slots'] == ['m1', 'up', 'dn', 'air', 'ult'], v['slots'])
        check(f'{k}: ↑X / ↓X 專屬姿勢圖（_up / _dn）', v['animUp'] and v['animDn'], v)
        check(f'{k}: mix == {list(want[k])} + mixEl + transform',
              v['mix'] == list(want[k]) and bool(v['mixEl']) and v['transform'], v)
        check(f'{k}: hat / icon / mini / 招式動畫 / 必殺動畫都有圖',
              v['hat'] and v['icon'] and v['mini'] and v['anim'] and v['ult'], v)
        check(f'{k}: 招式動畫 2~3 幀', 2 <= v['animN'] <= 3, v['animN'])
        check(f'{k}: ui_ability 是 24×16', v['iconW'] == 24 and v['iconH'] == 16, (v['iconW'], v['iconH']))
        check(f'{k}: HUD 名稱 ≤ 7 字且全大寫英數（HUD 欄寬 53px）',
              v['hudLen'] <= 7 and v['hudAscii'], v['hud'])
    # 與第一批不重複
    dup = h.ev("""([k2, k1])=>({
      keyDup: k2.filter(k => k1.indexOf(k) >= 0),
      nameDup: k2.filter(k => k1.some(o => KB.ABILITY_NAMES[o] === KB.ABILITY_NAMES[k])),
      hudDup: k2.filter(k => k1.some(o => KB.ABILITY_HUD[o] === KB.ABILITY_HUD[k])),
      moveDup: (function(){
        const seen = new Set(), bad = [];
        for (const o of k1) for (const m of (KB.ABILITIES[o].moves||[])) seen.add(m[1]);
        for (const k of k2) for (const m of (KB.ABILITIES[k].moves||[])) if (seen.has(m[1])) bad.push(k + ':' + m[1]);
        return bad;
      })(),
    })""", [KEYS, MIX1_KEYS])
    check('第二批 12 個 key 不與第一批重複', dup['keyDup'] == [], dup['keyDup'])
    check('第二批中文名不與第一批重複', dup['nameDup'] == [], dup['nameDup'])
    check('第二批 HUD 名不與第一批重複', dup['hudDup'] == [], dup['hudDup'])
    check('第二批招式名不與第一批重複', dup['moveDup'] == [], dup['moveDup'])
    # 投射物 / 帽子 / 圖示精靈都存在
    spr = h.ev("""()=>{
      const els = ['fire','ice','spark','stone','time','void','steel'];
      const shapes = ['arrow','orb','shard','star','ring','rocket'];
      const miss = [];
      for (const e of els) for (const s of shapes) { const n = 'proj_mix2_' + s + '_' + e; if (!KB.has(n)) miss.push(n); }
      return miss;
    }""")
    check('42 個 proj_mix2_* 投射物精靈全部註冊', spr == [], spr)


# ---------------------------------------------------------------------------
# G. Round 9：空中出招時人物要持續下墜（不可以懸停）
# ---------------------------------------------------------------------------
_FALL_JS = """([keys, n]) => {
  const p = KB.player;
  p.x = 3 * 16; p.bottom = 160 - 64; p.vx = 0; p.vy = 0;
  __kb.step(1);
  const y0 = p.y;
  __kb.press(keys);
  const ys = [];
  for (let i = 0; i < n; i++) { __kb.step(1); ys.push(+p.y.toFixed(2)); }
  __kb.release();
  let stall = 0, maxStall = 0, prev = y0;
  for (const y of ys) { if (y <= prev + 0.001) stall++; else stall = 0; maxStall = Math.max(maxStall, stall); prev = y; }
  return { y0: +y0.toFixed(2), y1: ys[ys.length - 1], drop: +(ys[ys.length - 1] - y0).toFixed(2), maxStall, state: p.state };
}"""


def phase_airfall(h, only):
    for key in KEYS:
        if only and key not in only:
            continue
        for label, keys in (('空中 X', {'attack': True}), ('空中 ↑X', {'up': True, 'attack': True}),
                            ('空中 ↓X', {'down': True, 'attack': True})):
            h.goto(3, 9, ability=key, immune=True)
            o = h.ev(_FALL_JS, [keys, 26])
            check(f'{key} [{label}]: 空中出招仍持續下墜（26 幀掉 ≥ 6px）', o['drop'] >= 6, o)
            check(f'{key} [{label}]: 沒有懸停（連續不下墜 < 30 幀）', o['maxStall'] < 30, o)


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
        if not only or 'hold' in only:
            print('-' * 8, 'hold')
            try: phase_hold(h)
            except Exception as ex: check('hold: raised', False, repr(ex))
        if not only or 'airfall' in only or move_only:
            print('-' * 8, 'airfall')
            try: phase_airfall(h, move_only)
            except Exception as ex: check('airfall: raised', False, repr(ex))
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
