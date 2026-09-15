# -*- coding: utf-8 -*-
"""
Lv4 覺醒系統驗證（Round 7 / agent: awaken）—— src/awaken.js 的 KB.AWAKEN + src/progression.js 的第 4 級。

涵蓋：
  1. Lv4：xp 15 → Lv4 / dmgMul 1.75 / partMul 2、xp 14 仍 Lv3、等級上限 4、HUD 4 顆星（drawLvStars 回傳 16）
  2. 量表：命中 +4、連擊每 +1 再 +1、被打 −20、未 Lv4 不累積、滿 100 → ready + 「覺醒 READY」演出
  3. 觸發：跳+攻同幀 / 3 幀內先後 → 覺醒；量表沒滿或未 Lv4 → 不攔截（仍是普通跳與普通攻擊）；
     變身演出（停格）期間的輸入會排隊，演出結束自動發動（R7-P2-05）
  4. 覺醒狀態：300 幀後結束、量表歸 0、期間傷害 ×1.5、移動速度 ×1.2、無敵
  5. 20 種基本能力的覺醒招：各自命中 waddledee 致死
  5b. 覺醒招對魔王減傷（R7-P1-01）：20 招各打 60HP 魔王模擬體，單次覺醒總傷害 ≤ 40%
  5c. Round 8「awaken-mix」：24 種混合能力的**專屬**覺醒招 —— 各自命中致死、結束後回到正常狀態、
      對 60HP 魔王模擬體單次覺醒 ≤ 40%；baseKey 有專屬招用專屬、沒有才退回主成分
  5d. R8-P1-02：魔王站在畫面外（房間比螢幕寬、SIM 魔王放在 x=400）時，20 基本 + 24 混合招每招仍 ≥ 30%
  6. HUD 量表：畫在能力圖示下方（y218），不與 Lv 星（y194~197）重疊
  7. 全程監看 pageerror / console.error；MISSING SPRITES 必須為空

用法：python tools/test_awaken.py [-v] [--only lv4,gauge,trigger,state,moves,boss,mix,mixboss,farboss,hud] [--shots]
（--shots 會把 24 招混合覺醒招各存一張到 shots/agent_awakenmix/）
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

# Round 8「awaken-mix」：24 種混合能力的專屬覺醒招（順序 = KB.AWAKEN.MIX_ORDER）
MIX24 = ['flamesword', 'frostsword', 'thunderblade', 'flamegun', 'frostgun', 'thunderbow',
         'flamehammer', 'stonehammer', 'shadowblade', 'starmage', 'frostdragon', 'thundermech',
         'flamebow', 'frosthammer', 'thundersword', 'flameninja', 'frostninja', 'thundergun',
         'stonegiant', 'flamedragon', 'thunderdragon', 'timebeam', 'gravityblade', 'hammermech']

MIX_SHOTS = pathlib.Path(__file__).resolve().parent.parent / 'shots' / 'agent_awakenmix'
# --shots 的取景幀（從 startAwaken 起算的實際幀數）：預設 52，
# 少數招式在那一瞬間正好是全畫面白閃（居合的一閃、收尾的爆閃），改抓別的時間點
SHOT_AT = {'thunderblade': 46, 'frostgun': 34, 'frostdragon': 36, 'flamedragon': 36}

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
    # fix9 / R9-P2-01：漂浮中也能發動（Round 9 之後玩家大半時間待在 float）
    _prep(h)
    r3b = h.ev("""()=>{ const p = KB.player; p.vy = -3; p.onGround = false; p.setState('jump'); __kb.step(2);
      __kb.press({up:true}); __kb.step(3); __kb.release();
      const fl = p.state === 'float';
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release();
      return { fl, active: KB.AWAKEN.active(), move: KB.AWAKEN.moveName || '', state: p.state }; }""")
    check('漂浮中跳+攻 → 一樣發動覺醒', r3b['fl'] and r3b['active'], r3b)
    check('漂浮中覺醒的招式名正確（百斬星光劍）', r3b['move'] == '百斬星光劍', r3b)
    # 量表沒滿時漂浮中跳+攻不攔截（照舊拍動 / 出招）
    _prep(h, gauge=60)
    r3c = h.ev("""()=>{ const p = KB.player; p.vy = -3; p.onGround = false; p.setState('jump'); __kb.step(2);
      __kb.press({up:true}); __kb.step(3); __kb.release();
      const fl = p.state === 'float';
      __kb.press({jump:true, attack:true}); __kb.step(1); __kb.release(); __kb.step(2);
      return { fl, active: KB.AWAKEN.active(), state: p.state }; }""")
    check('漂浮中量表沒滿 → 不攔截（維持普通出招）', r3c['fl'] and not r3c['active'] and r3c['state'] in ('attack', 'float', 'fall'), r3c)
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
    # 混合能力 → 各自的專屬覺醒招（Round 8）
    mix = h.ev("""()=>{ const out = {};
      if (KB.MIX && KB.MIX.table) { for (const k of Object.keys(KB.ABILITIES)) {
        if (KB.MIX.isMix && KB.MIX.isMix(k)) { const m = KB.AWAKEN.moveFor(k); out[k] = m ? m.name : null; } } }
      return out; }""")
    check('混合能力都對應得到覺醒招', len(mix) > 0 and all(v for v in mix.values()), mix)


# ---------------------------------------------------------------------------
# 5. 20 招
# ---------------------------------------------------------------------------
def phase_moves(h, shots=False):
    print('-' * 8, '20 招基本覺醒招')
    keys = h.ev("()=>Object.keys(KB.AWAKEN.moves)")
    check('覺醒招共 44 招（基本 20 + 混合 24）', len(keys) == 44, len(keys))
    check('20 種基本能力都有覺醒招', all(k in keys for k in BASIC20), sorted(set(BASIC20) - set(keys)))
    names = h.ev("()=>Object.keys(KB.AWAKEN.moves).map(k=>KB.AWAKEN.moves[k].name)")
    check('招式名稱不重複', len(set(names)) == 44, [n for n in set(names) if names.count(n) > 1])
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

# R8-P1-02：把魔王模擬體放到「房間右側、畫面外」（卡比出生點 x=48，這裡放 x=400 → 差 352px），
# 重現 w1 威斯比「固定站在比螢幕寬的房間最右側」的情況。
SIM_BOSS_AT = """([hp, px]) => {
  const g = KB.game; if (!g || !KB.Boss) return null;
  for (const e of g.entities) if (e.type === 'boss' && !e.dead) e.dead = true;
  const B = new KB.Boss(px, 144);
  B.hp = hp; B.maxHp = hp; B.introducing = false; B.started = true;
  B.displayName = 'SIM'; B.subtitle = 'SIM'; B.solid = false; B.grav = 0;
  B.hurtsPlayer = false; B.contactDamage = false; B.hidden = true;
  B.ai = function () { }; B.draw = function () { }; B.drawBody = function () { };
  B.die = function () { this.dead = true; };
  KB.spawn(B); window.__simBoss = B;
  return { hp: B.hp, x: B.x, cx: B.cx, dx: +(B.cx - KB.player.cx).toFixed(1) };
}"""
FAR_X = 400              # 魔王站的世界座標（測試地圖寬 80 格 = 1280px，地面在 row 10）
FAR_MIN = 0.30           # 一次覺醒至少要打掉 30%（上限仍是 BOSS_CAP 35%）
# 例外：'time'（永恆時停）靠 8 秒時停期間累積傷害，時停中魔王的無敵幀不會走，
# 所以能打進去的次數天生就少 —— 把魔王放在卡比旁邊（x=112）實測也是 25%，與距離無關。
FAR_MIN_OVR = {'time': 0.20}

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
# 5c. Round 8「awaken-mix」：24 種混合能力的專屬覺醒招
# ---------------------------------------------------------------------------
# 招式結束後「回正常」的判定：覺醒已結束、量表歸 0、無敵 / 排程 / 停格 / 時停 / 子彈時間全部收乾淨、
# 場上不再有玩家方的判定框 / 投射物、卡比回到可操作狀態。
NORMAL = """() => {
  const p = KB.player, g = KB.game, A = KB.AWAKEN;
  const boxes = g.entities.filter(e => !e.dead && e.owner === 'player' && (e.type === 'hitbox' || e.type === 'proj')).length;
  return { active: A.active(), t: A.activeT, gauge: A.gauge, q: A.q.length, pend: A.pending | 0,
    awakenT: p.awakenT | 0, inv: p.invincibleT | 0, state: p.state, hp: p.hp,
    freeze: g.freezeT | 0, stop: g.timeStopT | 0, slow: g.slowMoT | 0, boxes };
}"""
OK_STATES = ('idle', 'walk', 'run', 'jump', 'fall', 'float', 'duck', 'crouch', 'slide', 'land')


def _mix_shot(h, key):
    # 截圖前把「開場橫幅 / ENTER 提示 / 成就 toast」讓開：兩者都只看 game.frame，
    # 暫時把 frame 往後推 400 幀再 render，拍完立刻還原（只影響這一次繪製，不動任何狀態）
    data = h.ev("""()=>{ const g = KB.game; if (!g) return null;
      const f0 = g.frame; if (g.toasts) g.toasts.length = 0;
      g.frame = f0 + 400; const d = __t.shot(); g.frame = f0; return d; }""")
    if not data:
        return None
    MIX_SHOTS.mkdir(parents=True, exist_ok=True)
    f = MIX_SHOTS / ('awk_%s.png' % key)
    f.write_bytes(ET.base64.b64decode(data.split(',', 1)[1]))
    return f


def phase_mix(h, shots=False):
    print('-' * 8, '24 招混合覺醒招（Round 8 awaken-mix）')
    order = h.ev("()=>KB.AWAKEN.MIX_ORDER || []")
    check('KB.AWAKEN.MIX_ORDER 共 24 個混合 key', sorted(order) == sorted(MIX24), sorted(set(order) ^ set(MIX24)))
    ismix = h.ev("(ks)=>ks.map(k=>!!(KB.MIX && KB.MIX.isMix && KB.MIX.isMix(k)))", MIX24)
    check('24 個 key 都是 KB.MIX 的混合能力', all(ismix), [k for k, b in zip(MIX24, ismix) if not b])
    info = h.ev("""(ks)=>ks.map(k=>{ const m = KB.AWAKEN.moves[k];
      return { k, own: KB.AWAKEN.hasOwnMove(k), base: KB.AWAKEN.baseKey(k), name: m ? m.name : null,
               parts: KB.MIX.parts(k) }; })""", MIX24)
    check('24 招都是「專屬招」（baseKey 回自己，不退回主成分）',
          all(r['own'] and r['base'] == r['k'] and r['name'] for r in info),
          [r for r in info if not (r['own'] and r['base'] == r['k'])])
    basic_names = h.ev("(ks)=>ks.map(k=>KB.AWAKEN.moves[k].name)", BASIC20)
    mix_names = [r['name'] for r in info]
    check('24 個招名彼此不重複、也不與基本 20 招重複',
          len(set(mix_names)) == 24 and not (set(mix_names) & set(basic_names)),
          [n for n in mix_names if mix_names.count(n) > 1] or list(set(mix_names) & set(basic_names)))
    # baseKey：沒有專屬招時才退回主成分 A（暫時把 flamesword 的招拿掉驗證，再放回去）
    fb = h.ev("""()=>{ const A = KB.AWAKEN, save = A.moves.flamesword; delete A.moves.flamesword;
      const back = A.baseKey('flamesword'), nm = A.moveFor('flamesword');
      A.moves.flamesword = save;
      return [back, nm ? nm.name : null, A.baseKey('flamesword')]; }""")
    check('沒有專屬招時退回主成分 A（flamesword → fire「焚天龍炎」）',
          fb[0] == 'fire' and fb[1] == '焚天龍炎', fb)
    check('放回專屬招後又用專屬（flamesword → flamesword）', fb[2] == 'flamesword', fb)
    # 每招的新精靈：詠唱姿勢 kirby_awaken_cast + 專屬印記 fx_awk_<mixkey>（art/kirby_awaken.js）
    h.goto(3, 9, ability=None, immune=True)
    h.ev(RESET)
    sig = h.ev("""(ks)=>{ const A = KB.AWAKEN, g = KB.game, bad = [];
      const has = n => !!KB.has(n);
      for (const k of ks) {
        if (!has('fx_awk_' + k)) { bad.push(k + ':no-sprite'); continue; }
        const n0 = g.entities.length;
        A.moves[k].exec(KB.player);
        const fx = g.entities.slice(n0).filter(e => e.type === 'fx').map(e => e.spr);
        if (fx.indexOf('kirby_awaken_cast') < 0) bad.push(k + ':no-cast');
        if (fx.indexOf('fx_awk_' + k) < 0) bad.push(k + ':no-sigil');
        for (const e of g.entities.slice(n0)) e.dead = true;
        A.reset(); KB.VFX.clear();
        if (g) { g.timeStopT = 0; g.slowMoT = 0; g.freezeT = 0; }
      }
      return { bad, cast: has('kirby_awaken_cast') }; }""", MIX24)
    check('新精靈：kirby_awaken_cast + 24 張 fx_awk_<mixkey> 都有註冊且每招都會疊上',
          sig['cast'] and not sig['bad'], sig['bad'][:6])

    for key in MIX24:
        nm = h.ev("(k)=>KB.AWAKEN.moves[k].name", key)
        h.goto(3, 9, ability=None, immune=True)
        h.ev(RESET)
        h.ev(GIVE, key)
        h.ev(SET_LV, [key, 4])
        h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
        h.spawn('waddledee', 7, 9, d=-1)
        h.ev("()=>{ KB.player.startAwaken(); }")
        at = SHOT_AT.get(key, 52)
        h.run(at, 13)
        if shots:
            _mix_shot(h, key)          # 招式演出中段（多段判定 + 特效最密的時候）
        h.run(262 - at, 20)
        e = h.ent()
        check(f'{key} [{nm}]: 混合覺醒招打死 waddledee', e['dead'], dict(hp=e['hp'], x=e['x']))
        h.run(360, 60)                      # 跑到覺醒（300 幀）+ 時停 / 排程 全部結束
        st2 = h.ev(NORMAL)
        ok = (not st2['active'] and st2['t'] == 0 and st2['gauge'] == 0 and st2['q'] == 0
              and st2['pend'] == 0 and st2['awakenT'] == 0 and st2['freeze'] == 0
              and st2['stop'] == 0 and st2['slow'] == 0 and st2['boxes'] == 0
              and st2['state'] in OK_STATES)
        check(f'{key} [{nm}]: 招式結束後回到正常狀態', ok, st2)


def phase_mixboss(h):
    print('-' * 8, '24 招混合覺醒招對魔王的傷害（BOSS_MUL / BOSS_CAP）')
    worst = []
    for key in MIX24:
        nm = h.ev("(k)=>KB.AWAKEN.moves[k].name", key)
        h.goto(3, 9, ability=None, immune=True)
        h.ev(RESET)
        h.ev(GIVE, key)
        h.ev(SET_LV, [key, 4])
        h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
        h.ev(SIM_BOSS, SIM_HP0)
        h.ev("()=>{ KB.player.startAwaken(); }")
        h.run(480, 40)
        b = h.ev(SIM_HP)
        lost = SIM_HP0 - b['hp'] if b else 999
        pct = lost / SIM_HP0
        worst.append((pct, key))
        check(f'{key} [{nm}]: 一次覺醒對 60HP 魔王 ≤ 40%（實測 {lost}/{SIM_HP0} = {pct:.0%}）',
              pct <= BOSS_CAP and not (b and b['dead']), dict(hp=b['hp'] if b else None, lost=lost))
    worst.sort(reverse=True)
    print('   最高 5 名：' + ', '.join(f'{k} {p:.0%}' for p, k in worst[:5]))
    check('沒有任何一招混合覺醒招能一次覺醒打死 60HP 魔王', worst[0][0] <= BOSS_CAP, worst[:3])


# ---------------------------------------------------------------------------
# 5d. R8-P1-02：魔王站在畫面外（房間比螢幕寬）時，覺醒招照樣打得到
# ---------------------------------------------------------------------------
# qa8 實測：w1 威斯比固定站在房間最右側，24 招混合覺醒招有 10 招打出 0 傷害
# （判定是「以卡比為中心的 288×208 框」＋「從卡比身上生出來的投射物」，全部落在畫面左半）。
# 這一組把 SIM 魔王放到 x=400（離卡比 350px 以上、完全在畫面外）重現，
# 要求 20 基本招 + 24 混合招每一招都至少打掉 30%（上限仍是 BOSS_CAP 35%）。
def _far_one(h, key):
    h.goto(3, 9, ability=None, immune=True)
    h.ev(RESET)
    h.ev(GIVE, key)
    h.ev(SET_LV, [key, 4])
    h.ev("()=>{ KB.AWAKEN.reset(); KB.AWAKEN.add(100); }")
    info = h.ev(SIM_BOSS_AT, [SIM_HP0, FAR_X])
    h.ev("()=>{ KB.player.startAwaken(); }")
    h.run(480, 40)
    b = h.ev(SIM_HP)
    lost = SIM_HP0 - b['hp'] if b else 0
    return lost / SIM_HP0, info


def phase_farboss(h):
    print('-' * 8, '遠處魔王（畫面外 350px）也要吃到覺醒招（R8-P1-02）')
    # 先確認測試情境真的「在畫面外」：魔王與攝影機中心差 > 半個畫面
    h.goto(3, 9, ability=None, immune=True)
    d = h.ev(SIM_BOSS_AT, [SIM_HP0, FAR_X])
    off = h.ev("()=>{ const B = window.__simBoss, c = KB.game.cam; return { dx: +(B.cx - (c.x + KB.W / 2)).toFixed(1), onscreen: B.x < c.x + KB.W && B.x + B.w > c.x }; }")
    check('SIM 魔王真的在畫面外（離攝影機中心 > 128px）', abs(off['dx']) > 128 and not off['onscreen'], off)
    check('API：KB.AWAKEN.bosses / bossShot 存在',
          h.ev("()=>typeof KB.AWAKEN.bosses === 'function' && typeof KB.AWAKEN.bossShot === 'function'"), '')
    # bigbox 會替畫面外的魔王追加一個「跟著魔王」的判定框
    bb = h.ev("""()=>{ const g = KB.game, n0 = g.entities.length;
      KB.AWAKEN.bigbox(KB.player, { dmg: 1, life: 2 });
      const boxes = g.entities.slice(n0).filter(e => e.type === 'hitbox');
      const B = window.__simBoss;
      const onBoss = boxes.filter(e => e.follow === B || (e.x < B.cx && e.x + e.w > B.cx)).length;
      for (const e of g.entities.slice(n0)) e.dead = true;
      return { n: boxes.length, onBoss }; }""")
    check('bigbox 對畫面外的魔王追加判定框', bb['n'] >= 2 and bb['onBoss'] >= 1, bb)
    worst = []
    for key in BASIC20 + MIX24:
        nm = h.ev("(k)=>KB.AWAKEN.moves[k].name", key)
        pct, info = _far_one(h, key)
        lo = FAR_MIN_OVR.get(key, FAR_MIN)
        worst.append((pct, key))
        check(f'{key} [{nm}]: 對 350px 外的魔王 ≥ {lo:.0%}（實測 {pct * SIM_HP0:.0f}/{SIM_HP0} = {pct:.0%}）',
              lo <= pct <= BOSS_CAP, dict(pct=round(pct, 3), boss=info))
    worst.sort()
    print('   最低 5 名：' + ', '.join(f'{k} {p:.0%}' for p, k in worst[:5]))
    check('44 招對遠處魔王沒有任何一招是 0 傷害', worst[0][0] > 0, worst[:3])


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
                         ('boss', phase_boss), ('mix', lambda hh: phase_mix(hh, a.shots)),
                         ('mixboss', phase_mixboss), ('farboss', phase_farboss), ('hud', phase_hud)):
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
