# -*- coding: utf-8 -*-
"""
Lv4 覺醒系統驗證（Round 7 / agent: awaken）—— src/awaken.js 的 KB.AWAKEN + src/progression.js 的第 4 級。

涵蓋：
  1. Lv4：xp 15 → Lv4 / dmgMul 1.75 / partMul 2、xp 14 仍 Lv3、等級上限 4、HUD 4 顆星（drawLvStars 回傳 16）
  2. 量表：命中 +4、連擊每 +1 再 +1、被打 −20、未 Lv4 不累積、滿 100 → ready + 「覺醒 READY」演出
  3. 觸發：跳+攻同幀 / 3 幀內先後 → 覺醒；量表沒滿或未 Lv4 → 不攔截（仍是普通跳與普通攻擊）；
     變身演出（停格）期間的輸入會排隊，演出結束自動發動（R7-P2-05）
  4. 覺醒狀態：300 幀後結束、量表歸 0、期間傷害 ×1.5、移動速度 ×1.2、無敵
  5. 20 種基本能力的覺醒招：各自命中 waddledee 致死；混合能力用主成分 A 的招
  5b. 覺醒招對魔王減傷（R7-P1-01）：20 招各打 60HP 魔王模擬體，單次覺醒總傷害 ≤ 40%
  6. HUD 量表：畫在能力圖示下方（y218），不與 Lv 星（y194~197）重疊
  7. 全程監看 pageerror / console.error；MISSING SPRITES 必須為空

用法：python tools/test_awaken.py [-v] [--only lv4,gauge,trigger,state,moves,boss,hud]
（測試地圖與頁面輔助函式沿用 tools/enemy_test.py 的 Harness / HOOK_JS / TEST_LEVEL）
"""
import sys, pathlib, argparse
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import enemy_test as ET
from enemy_test import Harness, HOOK_JS, TEST_LEVEL, INDEX

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

results = ET.results
check = ET.check

BASIC20 = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer',
           'gunner', 'ninja', 'blade', 'bow', 'mage', 'time', 'gravity', 'clone',
           'giant', 'dragon', 'mech', 'ghost']

# 把某能力釘死在指定等級（直接寫 abilityXp / abilityLv，不經過 giveAbility 的升級演出）
SET_LV = """([key, lv]) => {
  const s = KB.PROG.save();
  s.abilityXp[key] = lv >= 4 ? 15 : lv >= 3 ? 8 : lv >= 2 ? 3 : 0;
  s.abilityLv[key] = lv;
  return [KB.PROG.level(key), KB.PROG.xp(key), KB.PROG.dmgMul(key), KB.PROG.partMul(key)];
}"""

# 乾淨起點：清空進度 + 量表
RESET = """() => { KB.PROG.reset(); KB.AWAKEN.reset(); KB.save.seen = {}; return true; }"""

# 給能力（含變身系；跑完變身停格）
GIVE = """(key) => {
  const p = KB.player;
  p.ability = null; p.abilityData = {}; if (p.form) p.clearForm(true);
  p.giveAbility(key);
  for (let k = 0; k < 90 && (KB.game.freezeT | 0) > 0; k++) __kb.step(1);
  return p.ability;
}"""

STATE = """() => ({ gauge: KB.AWAKEN.gauge, ready: KB.AWAKEN.ready(), active: KB.AWAKEN.active(),
  t: KB.AWAKEN.activeT, key: KB.AWAKEN.key, move: KB.AWAKEN.moveName,
  awakenT: KB.player ? (KB.player.awakenT | 0) : -1, inv: KB.player ? (KB.player.invincibleT | 0) : -1,
  state: KB.player ? KB.player.state : null })"""


def st(h):
    return h.ev(STATE)


# ---------------------------------------------------------------------------
# 1. Lv4
# ---------------------------------------------------------------------------
def phase_lv4(h):
    print('-' * 8, 'Lv4')
    h.goto(3, 9, immune=True)
    h.ev(RESET)
    r = h.ev("""() => {
      const out = {}; const s = KB.PROG.save();
      for (const xp of [8, 14, 15, 30]) { s.abilityXp.sword = xp; s.abilityLv.sword = KB.PROG.lvOfXp(xp);
        out[xp] = [KB.PROG.level('sword'), KB.PROG.dmgMul('sword'), KB.PROG.partMul('sword')]; }
      return out; }""")
    check('xp 8 → Lv3 / dmgMul 1.5', r['8'][0] == 3 and abs(r['8'][1] - 1.5) < 1e-9, r['8'])
    check('xp 14 → 仍是 Lv3（門檻是 15）', r['14'][0] == 3, r['14'])
    check('xp 15 → Lv4', r['15'][0] == 4, r['15'])
    check('Lv4 → dmgMul 1.75', abs(r['15'][1] - 1.75) < 1e-9, r['15'])
    check('Lv4 → 粒子 ×2', abs(r['15'][2] - 2) < 1e-9, r['15'])
    check('等級上限 4（xp 30 仍是 Lv4）', r['30'][0] == 4, r['30'])
    check('KB.PROG.MAXLV === 4', h.ev("()=>KB.PROG.MAXLV") == 4, h.ev("()=>KB.PROG.MAXLV"))
    # 傷害加成
    sd = h.ev("()=>{const o={};for(const d of [1,2,4,8])o[d]=KB.PROG.scaleDmg(d,'sword');return o;}")
    check('Lv4 傷害 dmg 4 → 7、dmg 8 → 14', sd['4'] == 7 and sd['8'] == 14, sd)
    # xpNext：Lv3 時 need 15、Lv4 時 max
    nx = h.ev("""()=>{const s=KB.PROG.save(); s.abilityXp.sword=8; s.abilityLv.sword=3; const a=KB.PROG.xpNext('sword');
      s.abilityXp.sword=15; s.abilityLv.sword=4; const b=KB.PROG.xpNext('sword'); return [a,b];}""")
    check('xpNext：Lv3 → 還差 7 到 15', nx[0]['need'] == 15 and nx[0]['left'] == 7, nx[0])
    check('xpNext：Lv4 → max', nx[1]['max'] is True, nx[1])
    # HUD / 圖鑑 Lv 星：4 顆（每顆 4px → 回傳 16）
    w = h.ev("""([lv])=>{ const s=KB.PROG.save(); s.abilityXp.sword= lv>=4?15:8; s.abilityLv.sword=lv;
      const c = KB.canvas.getContext('2d'); return KB.PROG.drawLvStars(c, 5, 194, 'sword'); }""", [4])
    check('Lv4 → drawLvStars 畫 4 顆星（寬 16）', w == 16, w)
    w3 = h.ev("""([lv])=>{ const s=KB.PROG.save(); s.abilityXp.sword=8; s.abilityLv.sword=3;
      const c = KB.canvas.getContext('2d'); return KB.PROG.drawLvStars(c, 5, 194, 'sword'); }""", [3])
    check('Lv3 → 仍是 3 顆星（寬 12）', w3 == 12, w3)
    # 成就「登峰造極」仍在 Lv3 解鎖
    ach = h.ev("""()=>{ KB.PROG.reset(); const s=KB.PROG.save(); s.abilityXp.fire=8; s.abilityLv.fire=3;
      KB.PROG.checkPassive(); return KB.PROG.has('lv3'); }""")
    check('成就「登峰造極」仍在 Lv3 解鎖（MAXLV 變 4 沒有連帶影響）', ach, ach)


# ---------------------------------------------------------------------------
# 2. 量表
# ---------------------------------------------------------------------------
def phase_gauge(h):
    print('-' * 8, '覺醒量表')
    h.goto(3, 9, immune=True)
    h.ev(RESET)
    api = h.ev("()=>!!(KB.AWAKEN && KB.AWAKEN.moves && KB.AWAKEN.tryTrigger && KB.AWAKEN.drawGauge && KB.AWAKEN.start)")
    check('KB.AWAKEN 已載入（moves / tryTrigger / drawGauge / start）', api, api)
    check('量表上限 100 / 覺醒 300 幀', h.ev("()=>[KB.AWAKEN.MAX, KB.AWAKEN.DUR]") == [100, 300],
          h.ev("()=>[KB.AWAKEN.MAX, KB.AWAKEN.DUR]"))
    # 未 Lv4 → 不累積
    h.ev(GIVE, 'sword')
    h.ev(SET_LV, ['sword', 3])
    g = h.ev("()=>{KB.AWAKEN.reset(); for(let i=0;i<5;i++) KB.PROG.scaleDmg(4,'sword'); return KB.AWAKEN.gauge;}")
    check('能力只有 Lv3 → 命中不累積量表', g == 0, g)
    # Lv4 → 每次命中 +4
    h.ev(SET_LV, ['sword', 4])
    g = h.ev("()=>{KB.AWAKEN.reset(); KB.PROG.resetCombo(); for(let i=0;i<3;i++) KB.PROG.scaleDmg(4,'sword'); return KB.AWAKEN.gauge;}")
    check('Lv4 命中 3 次 → 量表 12（每次 +4）', g == 12, g)
    # 連擊加成：combo 5 → 每次 +4+5
    g2 = h.ev("""()=>{ KB.AWAKEN.reset(); KB.PROG.resetCombo();
      for (let i=0;i<5;i++) KB.PROG.emit('kill', {score:0, cx:100, y:100, type:'enemy'});
      const before = KB.AWAKEN.gauge; KB.PROG.scaleDmg(4,'sword');
      return [KB.PROG.combo, before, KB.AWAKEN.gauge]; }""")
    check('連擊 5 時命中 → +9（4 + 5×1）', g2[2] - g2[1] == 9, g2)
    # 連擊加成上限
    g3 = h.ev("""()=>{ KB.AWAKEN.reset(); KB.PROG.resetCombo();
      for (let i=0;i<20;i++) KB.PROG.emit('kill', {score:0, cx:100, y:100, type:'enemy'});
      const before = KB.AWAKEN.gauge; KB.PROG.scaleDmg(4,'sword');
      return [KB.PROG.combo, KB.AWAKEN.gauge - before]; }""")
    check('連擊加成上限 10（+14）', g3[1] == 14, g3)
    # 充能節奏（R7-P1-01）：一路連擊也要 10 次以上命中才會充滿
    pace = h.ev("""()=>{ KB.AWAKEN.reset(); KB.PROG.resetCombo();
      let n = 0; const seq = [];
      while (KB.AWAKEN.gauge < KB.AWAKEN.MAX && n < 60) {
        KB.PROG.emit('kill', {score:0, cx:100, y:100, type:'enemy'});
        KB.PROG.scaleDmg(4,'sword'); seq.push(KB.AWAKEN.gauge); n++; }
      return [n, seq]; }""")
    check('一路連擊命中 ≥ 10 次才充滿量表（原本 8 次）', pace[0] >= 10, pace)
    # 被打 −20
    g4 = h.ev("""()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(50); const a = KB.AWAKEN.gauge;
      KB.PROG.emit('hurt', {amount:1}); return [a, KB.AWAKEN.gauge]; }""")
    check('被打 → 量表 −20', g4 == [50, 30], g4)
    check('量表不會低於 0', h.ev("()=>{KB.AWAKEN.reset(); KB.AWAKEN.add(5); KB.PROG.emit('hurt',{}); return KB.AWAKEN.gauge;}") == 0, '')
    # 滿 100 → ready + 演出
    full = h.ev("""()=>{ KB.AWAKEN.reset(); KB.VFX.clear(); KB.AWAKEN.add(100);
      return { g: KB.AWAKEN.gauge, ready: KB.AWAKEN.ready(), fx: KB.VFX.list.length }; }""")
    check('量表滿 100 → ready()', full['g'] == 100 and full['ready'], full)
    check('量表滿時放「覺醒 READY」演出（textPop + ring）', full['fx'] >= 2, full)
    check('量表不會超過 100', h.ev("()=>{KB.AWAKEN.add(999); return KB.AWAKEN.gauge;}") == 100, '')
    # 覺醒中不再累積
    nogain = h.ev("""()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); KB.AWAKEN.start(KB.player);
      const a = KB.AWAKEN.gauge; KB.PROG.scaleDmg(4,'sword'); const b = KB.AWAKEN.gauge;
      KB.AWAKEN.cancel(); KB.AWAKEN.reset(); return [a, b]; }""")
    check('覺醒中不再累積量表', nogain[0] == nogain[1], nogain)


# ---------------------------------------------------------------------------
# 3. 觸發
# ---------------------------------------------------------------------------
def _prep(h, key='sword', gauge=100, lv=4):
    h.goto(3, 9, immune=True)
    h.ev(RESET)
    h.ev(GIVE, key)
    h.ev(SET_LV, [key, lv])
    h.ev("(g)=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(g); }", gauge)
    h.release()
    h.run(2, 2)


def phase_trigger(h):
    print('-' * 8, '觸發（跳 + 攻擊）')
    # 同一幀
    _prep(h)
    h.ev("()=>{ __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release(); }")
    s = st(h)
    check('Lv4 + 量表滿 + 同幀跳+攻 → 覺醒發動', s['active'] and s['awakenT'] > 0, s)
    check('覺醒中記住能力與招式名', s['key'] == 'sword' and s['move'] == '百斬星光劍', s)
    # 3 幀內先後（跳 → 2 幀後攻擊）
    _prep(h)
    h.ev("""()=>{ __kb.press({jump:true}); __kb.step(1); __kb.release(); __kb.step(1);
      __kb.press({attack:true}); __kb.step(1); __kb.release(); }""")
    s = st(h)
    check('先跳、2 幀後再按攻擊 → 一樣發動（3 幀窗）', s['active'], s)
    # 間隔太久 → 不發動
    _prep(h)
    h.ev("""()=>{ __kb.press({jump:true}); __kb.step(1); __kb.release(); __kb.step(8);
      __kb.press({attack:true}); __kb.step(1); __kb.release(); }""")
    s = st(h)
    check('間隔 8 幀 → 不發動（只是普通跳 + 普通攻擊）', not s['active'], s)
    # 量表沒滿 → 不攔截
    _prep(h, gauge=60)
    r = h.ev("""()=>{ const p = KB.player; const y0 = p.y;
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release(); __kb.step(3);
      return { active: KB.AWAKEN.active(), state: p.state, vy: +p.vy.toFixed(2), dy: +(p.y - y0).toFixed(2) }; }""")
    check('量表沒滿 → 不發動覺醒', not r['active'], r)
    check('量表沒滿 → 跳+攻仍是普通跳躍（往上移動）', r['dy'] < 0, r)
    # 未 Lv4 → 不攔截，而且攻擊照常出招
    _prep(h, lv=3)
    r2 = h.ev("""()=>{ const p = KB.player; const y0 = p.y; let atk = false;
      __kb.press({jump:true, attack:true}); __kb.step(1);
      for (let i = 0; i < 4; i++) { __kb.step(1); if (p.state === 'attack') atk = true; }
      __kb.release();
      return { active: KB.AWAKEN.active(), atk, dy: +(p.y - y0).toFixed(2), gauge: KB.AWAKEN.gauge }; }""")
    check('未 Lv4 → 不發動覺醒', not r2['active'], r2)
    check('未 Lv4 → 跳+攻＝普通跳躍 + 普通攻擊', r2['dy'] < 0 and r2['atk'], r2)
    # 空中也能發動
    _prep(h)
    r3 = h.ev("""()=>{ const p = KB.player; p.vy = -3; p.onGround = false; p.setState('jump'); __kb.step(2);
      const air = !p.onGround;
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release();
      return { air, active: KB.AWAKEN.active() }; }""")
    check('空中同幀跳+攻 → 一樣發動', r3['air'] and r3['active'], r3)
    # 沒有能力時不發動
    _prep(h)
    r4 = h.ev("""()=>{ KB.player.dropAbility(false); KB.AWAKEN.add(100);
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release();
      return KB.AWAKEN.active(); }""")
    check('沒有能力時不發動', not r4, r4)

    # R7-P2-05：變身演出（game.freezeT 停格）期間按 跳+攻 → 排隊，演出結束自動發動
    def give_raw(key):
        h.goto(3, 9, ability=None, immune=True)
        h.ev(RESET)
        h.ev(SET_LV, [key, 4])
        h.ev("(k)=>{ const p = KB.player; p.ability = null; p.abilityData = {}; if (p.form) p.clearForm(true); p.giveAbility(k); }", key)
        h.ev(SET_LV, [key, 4])
    give_raw('giant')
    h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
    r5 = h.ev("""()=>{ const froze = KB.game.freezeT > 0;
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release();
      return { froze, pend: KB.AWAKEN.pending, active: KB.AWAKEN.active() }; }""")
    check('變身演出（停格）中按 跳+攻 → 排隊而不是被吃掉', r5['froze'] and r5['pend'] > 0, r5)
    h.run(80, 20)
    s5 = st(h)
    check('變身演出結束後自動發動覺醒（giant）', s5['active'] and s5['move'] == '天地崩裂', s5)
    # 量表沒滿 → 停格中不排隊
    give_raw('giant')
    h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(50); }")
    r6 = h.ev("""()=>{ __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release();
      return { pend: KB.AWAKEN.pending, gauge: KB.AWAKEN.gauge }; }""")
    check('量表沒滿 → 停格中不排隊（跳與攻擊照舊）', r6['pend'] == 0, r6)
    h.run(90, 30)
    check('量表沒滿 → 演出結束也不會自己發動', not st(h)['active'], st(h))


# ---------------------------------------------------------------------------
# 4. 覺醒狀態
# ---------------------------------------------------------------------------
def phase_state(h):
    print('-' * 8, '覺醒狀態')
    _prep(h)
    h.ev("()=>{ KB.player.startAwaken(); }")
    s = st(h)
    check('player.startAwaken() 可直接發動', s['active'] and s['t'] == 300, s)
    check('覺醒中無敵（invincibleT ≥ 300）', s['inv'] >= 300, s)
    # 傷害 ×1.5（Lv4 1.75 × 覺醒 1.5）
    dm = h.ev("()=>[KB.PROG.scaleDmg(4,'sword'), KB.PROG.dmgMul('sword')]")
    check('覺醒中傷害 ×1.5（Lv4 dmg 4 → 7 → 11）', dm[0] == 11, dm)
    # 移動速度 ×1.2（同樣按住右 40 幀，比較位移；覺醒那組要先把 hitstop 跑完）
    RUN40 = """()=>{ const p = KB.player; p.vx = 0; const x0 = p.x;
      __kb.press({right:true}); __kb.step(40); __kb.release(); __kb.step(1);
      return +(p.x - x0).toFixed(2); }"""
    _prep(h)
    d2 = h.ev(RUN40)                                    # 普通狀態
    _prep(h)
    h.ev("""()=>{ KB.player.startAwaken(); for (let i = 0; i < 40 && (KB.game.freezeT|0) > 0; i++) __kb.step(1); }""")
    d1 = h.ev(RUN40)                                    # 覺醒狀態
    check('覺醒中移動速度 ×1.2（40 幀位移 %.1f vs 普通 %.1f）' % (d1, d2), d1 > d2 * 1.12, [d1, d2])
    # 300 幀後結束 + 量表歸 0
    _prep(h)
    r = h.ev("""()=>{ KB.player.startAwaken(); const out = [];
      for (let i = 0; i < 30 && (KB.game.freezeT|0) > 0; i++) __kb.step(1);
      out.push({ f: 0, a: KB.AWAKEN.active(), t: KB.AWAKEN.activeT });
      __kb.step(290); out.push({ f: 290, a: KB.AWAKEN.active(), t: KB.AWAKEN.activeT });
      __kb.step(40); out.push({ f: 330, a: KB.AWAKEN.active(), t: KB.AWAKEN.activeT, g: KB.AWAKEN.gauge });
      return out; }""")
    check('覺醒中（290 幀）仍在覺醒狀態', r[1]['a'], r[1])
    check('300 幀後覺醒結束', not r[2]['a'], r[2])
    check('覺醒結束時量表歸 0', r[2]['g'] == 0, r[2])
    check('覺醒結束後 player.awakenT 歸 0', h.ev("()=>KB.player.awakenT|0") == 0, '')
    # 覺醒中的外觀精靈存在
    spr = h.ev("()=>[KB.has('fx_awaken_aura'), KB.has('hat_awaken_crown')]")
    check('覺醒外觀精靈 fx_awaken_aura / hat_awaken_crown 已註冊', spr == [True, True], spr)
    # 混合能力 → 主成分 A 的覺醒招
    mix = h.ev("""()=>{ const out = {};
      if (KB.MIX && KB.MIX.table) { for (const k of Object.keys(KB.ABILITIES)) {
        if (KB.MIX.isMix && KB.MIX.isMix(k)) { const m = KB.AWAKEN.moveFor(k); out[k] = m ? m.name : null; } } }
      return out; }""")
    check('混合能力都對應得到覺醒招（主成分 A）', len(mix) > 0 and all(v for v in mix.values()), mix)


# ---------------------------------------------------------------------------
# 5. 20 招
# ---------------------------------------------------------------------------
def phase_moves(h, shots=False):
    print('-' * 8, '20 招覺醒招')
    keys = h.ev("()=>Object.keys(KB.AWAKEN.moves)")
    check('覺醒招共 20 招', len(keys) == 20, keys)
    check('20 招對應 20 種基本能力', sorted(keys) == sorted(BASIC20), sorted(set(keys) ^ set(BASIC20)))
    names = h.ev("()=>Object.keys(KB.AWAKEN.moves).map(k=>KB.AWAKEN.moves[k].name)")
    check('招式名稱不重複', len(set(names)) == 20, names)
    for key in BASIC20:
        nm = h.ev("(k)=>KB.AWAKEN.moves[k].name", key)
        h.goto(3, 9, ability=None, immune=True)
        h.ev(RESET)
        h.ev(GIVE, key)
        h.ev(SET_LV, [key, 4])
        h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
        h.spawn('waddledee', 7, 9, d=-1)
        h.ev("()=>{ KB.player.startAwaken(); }")
        h.run(150, 25)
        e = h.ent()
        check(f'{key} [{nm}]: 覺醒招打死 waddledee', e['dead'], dict(hp=e['hp'], x=e['x']))
        if shots:
            h.save_shot('awaken_' + key)


# ---------------------------------------------------------------------------
# 5b. 覺醒招對魔王的傷害上限（R7-P1-01）
# ---------------------------------------------------------------------------
# 60 HP 的「魔王模擬體」：直接 new KB.Boss（type==='boss'、Boss.hurt 的 invuln 12 一併生效），
# 不畫圖、不移動、不會觸發過關演出，只用來量「一次覺醒總共打掉幾點血」。
SIM_BOSS = """(hp) => {
  const g = KB.game; if (!g || !KB.Boss) return null;
  for (const e of g.entities) if (e.type === 'boss' && !e.dead) e.dead = true;
  const B = new KB.Boss(7 * 16, 144);
  B.hp = hp; B.maxHp = hp; B.introducing = false; B.started = true;
  B.displayName = 'SIM'; B.subtitle = 'SIM'; B.solid = false; B.grav = 0;
  B.hurtsPlayer = false; B.contactDamage = false; B.hidden = true;
  B.ai = function () { }; B.draw = function () { }; B.drawBody = function () { };
  B.die = function () { this.dead = true; };
  KB.spawn(B); window.__simBoss = B;
  return { hp: B.hp, type: B.type };
}"""
SIM_HP = """() => { const B = window.__simBoss; return B ? { hp: Math.max(0, B.hp), maxHp: B.maxHp, dead: !!B.dead } : null; }"""

BOSS_CAP = 0.40          # 一次覺醒最多只能打掉 40% 的血（設計目標 ≈ 35%）
SIM_HP0 = 60


def phase_boss(h):
    print('-' * 8, '覺醒招對魔王的傷害（R7-P1-01）')
    mul = h.ev("()=>KB.AWAKEN.BOSS_MUL")
    check('KB.AWAKEN.BOSS_MUL = 0.35', abs(mul - 0.35) < 1e-9, mul)
    check('KB.AWAKEN.scaleForTarget / noteBossHit 存在',
          h.ev("()=>typeof KB.AWAKEN.scaleForTarget === 'function' && typeof KB.AWAKEN.noteBossHit === 'function'"), '')
    check('KB.AWAKEN.BOSS_CAP = 0.35', abs(h.ev("()=>KB.AWAKEN.BOSS_CAP") - 0.35) < 1e-9, '')
    # 單筆傷害換算：對魔王 ×0.35、對一般敵人不變、非覺醒攻擊不變
    r = h.ev("""()=>{
      const A = KB.AWAKEN;
      const atk = { awaken: true }, plain = {};
      const mk = id => ({ type: 'boss', id, hp: 60, maxHp: 60 });
      A.bossDmg = {};
      const a = A.scaleForTarget(20, atk, mk(901));          // 對魔王 ×0.35
      const b = A.scaleForTarget(20, atk, { type: 'enemy', id: 902, hp: 60, maxHp: 60 });
      const c = A.scaleForTarget(20, plain, mk(903));        // 非覺醒攻擊
      const d = A.scaleForTarget(2, atk, mk(904));           // 小傷害仍至少 1
      // 累積上限：同一隻魔王連續挨 10 下也不超過 maxHp × BOSS_CAP（記帳走 noteBossHit）
      const e = mk(905); let sum = 0;
      for (let i = 0; i < 10; i++) { const x = A.scaleForTarget(20, atk, e); A.noteBossHit(atk, e, x); sum += x; }
      A.bossDmg = {};
      return [a, b, c, d, sum];
    }""")
    check('覺醒招對魔王 20 → 7（×0.35）', r[0] == 7, r)
    check('覺醒招對一般敵人不減傷（20 → 20）', r[1] == 20, r)
    check('非覺醒攻擊對魔王不減傷（20 → 20）', r[2] == 20, r)
    check('減傷後至少 1 點', r[3] == 1, r)
    check('同一次覺醒對 60HP 魔王累積上限 21（60 × 0.35）', r[4] == 21, r)
    worst = []
    for key in BASIC20:
        nm = h.ev("(k)=>KB.AWAKEN.moves[k].name", key)
        h.goto(3, 9, ability=None, immune=True)
        h.ev(RESET)
        h.ev(GIVE, key)
        h.ev(SET_LV, [key, 4])
        h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
        h.ev(SIM_BOSS, SIM_HP0)
        h.ev("()=>{ KB.player.startAwaken(); }")
        h.run(330, 30)
        b = h.ev(SIM_HP)
        lost = SIM_HP0 - b['hp'] if b else 999
        pct = lost / SIM_HP0
        worst.append((pct, key))
        check(f'{key} [{nm}]: 一次覺醒對 60HP 魔王 ≤ 40%（實測 {lost}/{SIM_HP0} = {pct:.0%}）',
              pct <= BOSS_CAP and not (b and b['dead']), dict(hp=b['hp'] if b else None, lost=lost))
    worst.sort(reverse=True)
    print('   最高 5 名：' + ', '.join(f'{k} {p:.0%}' for p, k in worst[:5]))
    check('沒有任何一招能一次覺醒打死 60HP 魔王', worst[0][0] <= BOSS_CAP, worst[:3])


# ---------------------------------------------------------------------------
# 6. HUD 量表
# ---------------------------------------------------------------------------
def phase_hud(h):
    print('-' * 8, 'HUD 量表')
    _prep(h, gauge=60)
    box = h.ev("()=>({x:KB.AWAKEN.GX, y:KB.AWAKEN.GY, w:KB.AWAKEN.GW, h:KB.AWAKEN.GH})")
    check('量表畫在能力圖示（y200~216）下方', box['y'] >= 217 and box['y'] + box['h'] <= 224, box)
    check('量表與 Lv 星（y194~197）不重疊', box['y'] > 197, box)
    check('量表不會壓到能力名稱（x < 30）', box['x'] + box['w'] <= 30, box)
    w = h.ev("()=>KB.AWAKEN.drawGauge(KB.canvas.getContext('2d'), KB.game)")
    check('drawGauge 有畫（回傳寬度 26）', w == 26, w)
    # 沒有 Lv4 能力且量表 0 → 不畫
    z = h.ev("""()=>{ KB.AWAKEN.reset(); const s = KB.PROG.save(); const k = KB.player.ability;
      s.abilityXp[k] = 0; s.abilityLv[k] = 1;
      return KB.AWAKEN.drawGauge(KB.canvas.getContext('2d'), KB.game); }""")
    check('非 Lv4 且量表 0 → 不畫量表', z == 0, z)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--hitbox', action='store_true')
    a = ap.parse_args()
    ET.VERBOSE = a.v
    only = set(x for x in a.only.split(',') if x)
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
        h = Harness(pg, a.shots, a.hitbox)
        for name, fn in (('lv4', phase_lv4), ('gauge', phase_gauge), ('trigger', phase_trigger),
                         ('state', phase_state), ('moves', lambda hh: phase_moves(hh, a.shots)),
                         ('boss', phase_boss), ('hud', phase_hud)):
            if only and name not in only: continue
            fn(h)
        miss = pg.evaluate("()=>[...KB.missing]")
        check('無缺漏精靈（MISSING SPRITES）', not miss, miss)
        b.close()
    errs = [l for l in logs if l.startswith('[pageerror]') or l.startswith('[console.error]')]
    check('無 pageerror / console.error', not errs, errs[:5])
    n = len(results); ok = sum(1 for r in results if r[1])
    print('-' * 40)
    print(f'{ok}/{n} PASS')
    for r in results:
        if not r[1]: print('  FAIL:', r[0], r[2])
    sys.exit(0 if ok == n else 1)


if __name__ == '__main__':
    main()
