# -*- coding: utf-8 -*-
"""
蓄力必殺門檻驗證（fix5b / QA R5-P1-03）。

招式表 / 圖鑑上寫的「按住 N 幀放開」必須就是**從按下攻擊鍵的那一幀算起**的真實門檻：
  - 按住 N+2 幀放開 → 必殺一定觸發
  - 只按住 N-6 幀放開 → 必殺一定不觸發
（Round 5 之前 10 招全部標低：鐵鎚寫 40 實際要 64、居合寫 50 實際 63、機甲 50→68、
  光束 / 電擊 45→46、槍手 / 法師 / 重力 / 分身 / 龍化 60→61，照著暫停卡按完全沒反應。）

判定方式：必殺一律是 `startMove(p, '<必殺模式>')`，所以放開後 60 幀內只要
`KB.player.abilityData.mode` 出現過那個模式名就算觸發（不看特效數量，不會誤判）。

本檔負責 src/abilities.js 的 hammer / beam / spark；
weapons / magic / forms 三系在各自的 tools/test_weapons.py / test_magic.py / test_forms.py
匯入這裡的 run_charge() 驗證。

fix6：門檻會乘 KB.PROG.holdMul(key)（Lv3 ×0.8），所以測試分兩組 ——
  Lv1：招式表寫的數字就是真實門檻（N+2 觸發 / N-6 不觸發）
  Lv3：門檻縮成 round(N×0.8)（同樣 +2 觸發 / -6 不觸發）
用法：python tools/test_charge.py [--only hammer] [-v]
"""
import sys, pathlib, argparse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
import enemy_test as ET
from enemy_test import Harness, HOOK_JS, TEST_LEVEL, INDEX, check

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# (能力 key, 招式表寫的幀數, 必殺的 abilityData.mode, 招式名)
CHARGE_CASES = {
    'hammer':  (40, 'spin',        '大迴旋'),
    'beam':    (45, 'wave',        '星潮光束'),
    'spark':   (45, 'burst',       '電擊波'),
    'gunner':  (60, 'time',        '子彈時間'),
    'blade':   (50, 'iai',         '居合一閃'),
    'bow':     (80, 'meteor',      '流星箭'),
    'mage':    (60, 'storm',       '元素風暴'),
    'gravity': (60, 'singularity', '奇點'),
    'clone':   (60, 'rush',        '百裂分身'),
    'dragon':  (60, 'nova',        '龍炎彈'),
    'mech':    (50, 'barrage',     '全彈發射'),
}

# 站在地上、乾淨狀態 → 按住 hold 幀 → 放開 → 觀察 60 幀內有沒有進入必殺模式
# fix6：門檻會乘 KB.PROG.holdMul(key)（Lv3 ×0.8），所以先把該能力的等級釘死在 lv
#       （直接寫 abilityXp / abilityLv，讓接下來的 giveAbility 不會再升級、也不會放 LEVEL UP 演出）。
_CHARGE_JS = """([key, hold, ult, lv]) => {
  const p = KB.player;
  __kb.release();
  try {
    const sv = (KB.PROG && KB.PROG.save) ? KB.PROG.save() : null;
    if (sv) { sv.abilityXp[key] = (lv >= 3 ? 8 : lv >= 2 ? 3 : 0); sv.abilityLv[key] = lv || 1; }
  } catch (e) { }
  p.ability = null; p.abilityData = {}; p.vx = 0; p.vy = 0;
  p.giveAbility(key); p.setState('idle');
  // 變身演出的 hitstop 期間 game.update 直接 return，__kb.step() 不會推進玩家；
  // 先把停格跑完再開始數蓄力幀數，否則「按住 N 幀」會少算 6~10 幀（forms 系一定會踩到）。
  for (let i = 0; i < 90 && (KB.game.freezeT | 0) > 0; i++) __kb.step(1);
  __kb.step(4);
  let seen = false;
  const watch = (n) => {
    for (let i = 0; i < n; i++) {
      __kb.step(1);
      if ((KB.player.abilityData || {}).mode === ult) seen = true;
    }
  };
  __kb.press({ attack: true }); watch(hold);
  __kb.release(); watch(60);
  return seen;
}"""


def lv3_hold(n):
    """Lv3 門檻 = round(N × KB.PROG.holdMul) = round(N × 0.8)（下限 4）。"""
    return max(4, round(n * 0.8))


def run_charge(h, keys, chk=None):
    """Lv1 下驗證「N+2 觸發 / N-6 不觸發」，且招式表寫的數字 = 真實門檻。
    h = Harness（只用到 goto / ev），chk = 各測試檔自己的 check（預設用 enemy_test 的）。"""
    check = chk or ET.check
    for key in keys:
        n, ult, name = CHARGE_CASES[key]
        h.goto(3, 9)
        on = h.ev(_CHARGE_JS, [key, n + 2, ult, 1])
        check(f'{key} [{name}]: 按住 {n + 2} 幀放開 → 必殺觸發', on, on)
        h.goto(3, 9)
        off = h.ev(_CHARGE_JS, [key, n - 6, ult, 1])
        check(f'{key} [{name}]: 只按住 {n - 6} 幀 → 必殺不觸發', not off, off)
        # 招式表文案要和門檻一致（玩家看到的數字 = Lv1 的實際幀數）
        mv = h.ev("([k,n])=>{const d=KB.ABILITIES[k]; return (d.moves||[]).some(m=>String(m[0]).indexOf(String(n))>=0);}", [key, n])
        check(f'{key} [{name}]: 招式表有寫出 {n} 幀（Lv1）', mv, mv)


def run_charge_lv3(h, keys, chk=None):
    """fix6：Lv3 的蓄力門檻 = round(N × 0.8)。
    驗證「round(N×0.8)+2 觸發 / round(N×0.8)-6 不觸發」，並確認 KB.PROG.holdMul 真的回 0.8。"""
    check = chk or ET.check
    for key in keys:
        n, ult, name = CHARGE_CASES[key]
        m = lv3_hold(n)
        mul = h.ev("""(k)=>{ const sv = KB.PROG.save(); sv.abilityXp[k] = 8; sv.abilityLv[k] = 3;
          return [KB.PROG.level(k), KB.PROG.holdMul(k)]; }""", key)
        check(f'{key} [{name}]: Lv3 → holdMul 0.8', mul == [3, 0.8], mul)
        h.goto(3, 9)
        on = h.ev(_CHARGE_JS, [key, m + 2, ult, 3])
        check(f'{key} [{name}]: Lv3 按住 {m + 2} 幀（原本 {n}）→ 必殺觸發', on, on)
        h.goto(3, 9)
        off = h.ev(_CHARGE_JS, [key, m - 6, ult, 3])
        check(f'{key} [{name}]: Lv3 只按住 {m - 6} 幀 → 必殺不觸發', not off, off)


# ---------------------------------------------------------------------------
# Round 9：招式表（moves）格式檢查
#   固定順序 X → ↑+X → ↓+X → 空中 X →（蓄力 / 其他），最多 6 列；
#   ↑ 與 ↓ 各恰好一列、空中至少一列；desc 不可消失。
#   暫停卡 / 圖鑑就是照這張表逐列印出來的，所以順序與列數要鎖住。
# ---------------------------------------------------------------------------
BASIC_KEYS = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer']
WEAPON_KEYS = ['gunner', 'ninja', 'blade', 'bow']

_TABLE_JS = """(keys)=>keys.map(k=>{
  const d = KB.ABILITIES[k];
  return [k, (d && d.moves) ? d.moves.map(m=>String(m[0])) : null, !!(d && d.desc), (d && d.moves) ? d.moves.length : 0];
})"""


def run_move_table(h, keys, chk=None):
    """Round 9：每種能力的招式表都要有 ↑ / ↓ / 空中 各一列，且順序固定。"""
    check = chk or ET.check
    for key, labels, has_desc, n in h.ev(_TABLE_JS, keys):
        if not check(f'{key} [moves]: 招式表存在', bool(labels), labels):
            continue
        check(f'{key} [moves]: 最多 6 列（暫停卡放得下）', n <= 6, labels)
        ups = [i for i, l in enumerate(labels) if '↑' in l]
        dns = [i for i, l in enumerate(labels) if '↓' in l]
        airs = [i for i, l in enumerate(labels) if '空中' in l]
        check(f'{key} [moves]: 恰有一列 ↑+X', len(ups) == 1, labels)
        check(f'{key} [moves]: 恰有一列 ↓+X', len(dns) == 1, labels)
        check(f'{key} [moves]: 恰有一列 空中 X', len(airs) == 1, labels)
        if len(ups) == 1 and len(dns) == 1 and len(airs) == 1:
            check(f'{key} [moves]: 順序 X → ↑+X → ↓+X → 空中 X',
                  0 < ups[0] < dns[0] < airs[0], labels)
        check(f'{key} [moves]: 招式名稱不重複', len(set(labels)) == len(labels), labels)
        check(f'{key} [moves]: desc 仍在', has_desc, has_desc)


# ---------------------------------------------------------------------------
# Round 10：貼身招判定加倍（melee-basic）
#   KB.PHYS.meleeScale = 2；entity.js 的 Hitbox 建構子自動放大「跟隨卡比的近戰框」，
#   abilities.js 對絕對座標的貼身框補 melee:true、對不該放大的補 melee:false。
#   這裡逐招實測：8 基本能力的每一招（X / ↑X / ↓X / 空中 X / 空中 ↑X / 空中 ↓X / 蓄力）
#   ── 貼身框 meleeScaled == 2 且 w == w0×2、h == h0×2
#   ── 遠程投射物（KB.Projectile 子類）尺寸完全不變
#   ── 白名單（石頭本體 / 電擊波 96×80 / 光鞭）維持原大小
# ---------------------------------------------------------------------------
MELEE_KEYS = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer']

# 招式輸入：(名稱, 同時按住的方向鍵, 按住攻擊幀數, 是否先浮空)
MELEE_MOVES = [
    ('X', [], 14, False), ('↑X', ['up'], 14, False), ('↓X', ['down'], 14, False),
    ('空中X', [], 14, True), ('空中↑X', ['up'], 14, True), ('空中↓X', ['down'], 14, True),
    ('蓄力', [], 70, False),
]

# 不放大的貼身框白名單（w0, h0, 理由）；其餘玩家判定框一律要 ×2
MELEE_EXEMPT = {
    'stone_body': '石頭本體：player.js startStone 的 stone:true 無敵框（放大會壓到不該壓的敵人）',
    'spark_96':   '電擊波（蓄力）：本來就是 96×80 全身巨框，招式表寫明 96px',
    'beam_whip':  '光鞭：遠程，判定框每幀依 6 段 segs 的絕對座標重算',
}

# 遠程投射物的合法尺寸（放大後必須完全一樣）
MELEE_PROJ = {
    'sword':  {(12, 16)},             # 劍氣 proj_swordwave
    'beam':   {(18, 18)},             # 星潮光束 proj_beamwave
    'cutter': {(12, 12)},             # 迴旋刃 / 上拋刃 proj_cutter
    'ice':    {(8, 8), (10, 10)},     # 冰晶散射 / 冰彈 proj_ice
}

_MELEE_HOOK = r"""() => {
  window.__mrec = [];
  const os = KB.spawn;
  KB.spawn = e => {
    const r = os(e);
    if (e.owner === 'player' && (e.type === 'hitbox' || e.type === 'proj'))
      __mrec.push({ cls: e.type, kind: e.kind || e.name || '', w: e.w, h: e.h,
        w0: e.w0 === undefined ? e.w : e.w0, h0: e.h0 === undefined ? e.h : e.h0,
        ms: e.meleeScaled || 0, follow: !!e.follow, stone: !!e.stone, ent: e });
    return r;
  };
  window.__melee = ([key, keys, hold, air]) => {
    __kb.release();
    __t.goto({ x: 3, y: 9, ability: key });
    const p = KB.player; p.invuln = 1e9; p.dir = 1;
    if (air) { p.y -= 52; p.onGround = false; p.vy = 0; }
    __kb.step(1);
    __mrec.length = 0;
    const kk = { attack: true }; for (const k of keys) kk[k] = true;
    __kb.press(kk);
    let mid = [];
    for (let i = 0; i < hold; i++) {
      __kb.step(1);
      if (i === Math.min(10, hold - 1)) mid = __mrec.filter(r => r.ent && !r.ent.dead && r.cls === 'hitbox')
        .map(r => ({ kind: r.kind, w: r.ent.w, h: r.ent.h, w0: r.ent.w0, h0: r.ent.h0, ms: r.ent.meleeScaled || 0, stone: r.stone, follow: r.follow }));
    }
    __kb.release();
    for (let i = 0; i < 40; i++) __kb.step(1);
    const seen = {}, out = [];
    for (const r of __mrec) {
      const id = r.cls + '|' + r.kind + '|' + r.w0 + 'x' + r.h0 + '|' + r.ms + '|' + r.stone;
      if (seen[id]) continue; seen[id] = 1;
      out.push({ cls: r.cls, kind: r.kind, w: r.w, h: r.h, w0: r.w0, h0: r.h0, ms: r.ms, follow: r.follow, stone: r.stone });
    }
    return { spawn: out, mid: mid };
  };
  return true;
}"""


def _exempt(key, b):
    """回傳白名單理由（不該放大的框），不是白名單就回 None。"""
    if b['stone']: return 'stone_body'
    if key == 'spark' and b['w0'] >= 96: return 'spark_96'
    if key == 'beam' and not b['follow'] and b['kind'] == 'beam': return 'beam_whip'
    return None


def run_melee(h, chk=None):
    """Round 10：8 基本能力的貼身招 meleeScaled == 2、遠程投射物不變。"""
    check = chk or ET.check
    h.ev(_MELEE_HOOK)
    all_exempt = set()
    scale = h.ev("()=>KB.PHYS.meleeScale")
    check('melee: KB.PHYS.meleeScale == 2', scale == 2, scale)
    for key in MELEE_KEYS:
        bad, good, projs, midbad, exempt = [], 0, set(), [], set()
        for name, keys, hold, air in MELEE_MOVES:
            r = h.ev("(a)=>__melee(a)", [key, keys, hold, air])
            for b in r['spawn']:
                if b['cls'] == 'proj':
                    projs.add((b['w'], b['h']))
                    if b['ms']: bad.append(f"{name} 遠程 {b['kind']} 被放大")
                    continue
                why = _exempt(key, b)
                if why:
                    exempt.add(why)
                    if b['ms'] != 0: bad.append(f"{name} {b['kind']} {b['w0']}x{b['h0']} 白名單卻被放大({why})")
                elif b['ms'] == 2 and b['w'] == b['w0'] * 2 and b['h'] == b['h0'] * 2:
                    good += 1
                else:
                    bad.append(f"{name} {b['kind']} {b['w0']}x{b['h0']} -> {b['w']}x{b['h']} ms={b['ms']}")
            for b in r['mid']:
                if _exempt(key, b) or b['ms'] != 2: continue
                if b['w'] != b['w0'] * 2 or b['h'] != b['h0'] * 2:
                    midbad.append(f"{name} {b['kind']} 招式中途 {b['w0']}x{b['h0']} -> {b['w']}x{b['h']}")
        check(f'{key} [melee]: 每個貼身判定框都是 2×（w/h 各 ×2、meleeScaled 2）', not bad and good > 0, bad or good)
        check(f'{key} [melee]: 招式中途改寫尺寸後仍維持 2×（fitBox）', not midbad, midbad)
        if key in MELEE_PROJ:
            check(f'{key} [melee]: 遠程投射物尺寸不變 {sorted(MELEE_PROJ[key])}',
                  projs and projs <= MELEE_PROJ[key], sorted(projs))
        all_exempt |= exempt
        for why in sorted(exempt):
            check(f'{key} [melee]: 白名單維持原尺寸 — {MELEE_EXEMPT[why]}', True, '')
    # 三個白名單一定都要出現過（規則寫壞把它們一起放大時，上面的迴圈會靜靜地少檢查）
    check('melee: 石頭本體 / 電擊波 / 光鞭 三個白名單都出現過',
          all_exempt == set(MELEE_EXEMPT), sorted(all_exempt))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    only = [k for k in a.only.split(',') if k] or ['hammer', 'beam', 'spark']
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate(TEST_LEVEL)
        pg.evaluate(HOOK_JS)
        h = Harness(pg, False, False)
        print('-' * 8, 'charge Lv1', ','.join(only))
        run_charge(h, only)
        print('-' * 8, 'charge Lv3 (×0.8)', ','.join(only))
        run_charge_lv3(h, only)
        print('-' * 8, 'moves table (Round 9)')
        run_move_table(h, BASIC_KEYS + WEAPON_KEYS)
        print('-' * 8, 'melee x2 (Round 10)')
        run_melee(h)           # __t.goto 來自上面的 HOOK_JS
        check('charge: no page errors', not logs, logs[:3])
        b.close()
    print('---')
    fails = [r for r in ET.results if not r[1]]
    print(f'{len(ET.results) - len(fails)}/{len(ET.results)} passed')
    for f in fails:
        print('  FAIL ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
