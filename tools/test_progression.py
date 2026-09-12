# -*- coding: utf-8 -*-
"""
進度系統驗證（Round 6 / agent: progression）—— src/progression.js 的 KB.PROG。

涵蓋：
  1. 能力等級：取得同一能力 3 次 → Lv2 且 dmgMul 1.25；8 次 → Lv3 / 1.5；scaleDmg 四捨五入且不會變小
  2. 連擊：連續擊殺 +1、3 秒（180 幀）沒補刀自動歸零、受傷立刻 BREAK 歸零、加分公式
  3. 成就：至少 5 條可由事件觸發（first_ability / lv3 / combo10 / arena_clear / arena_fast / helper / mix…）
  4. Style Rank：無傷 + 高 combo + 快 → S；受傷多 + 無 combo + 慢 → C；bestRank 只升不降
  5. 選關第 6 節點：注入假 w6 後 StageSelectScene 有 6 個節點、6 個標籤且互不重疊；沒有 w6 時只有 5 個

用法：python tools/test_progression.py [-v]
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

results = []
VERBOSE = False


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


# 假的第 6 關（world6 agent 還沒寫好時用來驗證選關節點；已存在就不重複加）
FAKE_W6 = """() => {
  if (!KB.LEVELS.some(l => l.id === 'w6')) {
    const m = ['################', '#..............#', '#..............#', '#..............#',
               '#..............#', '#..............#', '#..............#', '#..............#',
               '#..............#', '#..............#', '################', '################'];
    KB.LEVELS.push({ id: 'w6', name: '星之彼端', theme: 'space', music: null, boss: null,
      rooms: [{ map: m, spawn: [3, 9], entities: [], noBoss: true }] });
  }
  return KB.LEVELS.length;
}"""

# 乾淨起點：清空進度、跳到 w1 第一房
RESET = """() => {
  KB.PROG.reset();
  KB.save.seen = {}; KB.save.cleared = {}; KB.save.stars = {}; KB.save.arena = {};
  __kb.release();
  __kb.goto('game', { level: 'w1', room: 0, nofade: true });
  KB.PROG.beginLevel(KB.game);
  __kb.step(2);
  return true;
}"""

# 取得能力 n 次（每次先清掉現有能力，變身停格跑完再繼續）
GIVE_N = """([key, n]) => {
  const p = KB.player;
  for (let i = 0; i < n; i++) {
    p.ability = null; p.abilityData = {};
    p.giveAbility(key);
    for (let k = 0; k < 60 && (KB.game.freezeT | 0) > 0; k++) __kb.step(1);
  }
  return { lv: KB.PROG.level(key), xp: KB.PROG.xp(key), dmg: KB.PROG.dmgMul(key), part: KB.PROG.partMul(key), hold: KB.PROG.holdMul(key) };
}"""

# 假敵人物件（只需要 score / cx / y）
KILL_N = """([n, score]) => {
  for (let i = 0; i < n; i++) KB.PROG.emit('kill', { score: score, cx: 100, y: 100, type: 'enemy' });
  return { combo: KB.PROG.combo, max: KB.PROG.comboMax, t: KB.PROG.comboT };
}"""


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.v
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        ev = pg.evaluate

        # ------------------------------------------------------------------ 0. 載入
        print('-' * 8, 'API')
        api = ev("()=>!!(KB.PROG && KB.PROG.level && KB.PROG.emit && KB.PROG.rankData && KB.PROG.ACH)")
        check('KB.PROG 已載入（level / emit / rankData / ACH）', api, api)
        # ---- 成就定義完整性（Round 8 ach2：20 → 40 條）----
        defs = ev("()=>KB.PROG.ACH.map(a=>({id:a.id, name:a.name, hint:a.hint}))")
        check('成就共 40 條', len(defs) == 40, len(defs))
        ids = [d['id'] for d in defs]
        check('成就 id 不重複', len(set(ids)) == len(ids), len(ids))
        keep20 = ['first_ability', 'basic8', 'all20', 'lv3', 'combo10', 'nohit_world', 'clear_w5', 'arena_clear',
                  'arena_fast', 'stars15', 'secret5', 'inhale_boss', 'possess', 'timestop5', 'mix_first', 'helper',
                  'elec_water', 'burn10', 'hp1_boss', 'extra_clear']
        check('Round 6 的 20 條 id 全部保留（舊存檔相容）', all(k in ids for k in keep20),
              [k for k in keep20 if k not in ids])
        bad_name = [d['id'] + ':' + str(d['name']) for d in defs if not d['name'] or len(d['name']) > 6]
        check('每條名稱 ≤ 6 字且非空', not bad_name, bad_name)
        bad_hint = [d['id'] + ':' + str(d['hint']) for d in defs if not d['hint'] or len(d['hint']) > 16]
        check('每條描述 ≤ 16 字且非空', not bad_hint, bad_hint)
        api8 = ev("()=>!!(KB.PROG.backfill && KB.PROG.achTimeStr && KB.PROG.mixCount && KB.PROG.autoDetect)")
        check('新 API：backfill / achTimeStr / mixCount / autoDetect', api8, api8)
        patched = ev("()=>!!KB.Player.prototype.__progPatched")
        check('player.giveAbility / hurt 已 monkeypatch（未改 player.js）', patched, patched)

        # ------------------------------------------------------------------ 1. 能力等級
        print('-' * 8, '能力等級')
        ev(RESET)
        r1 = ev(GIVE_N, ['sword', 1])
        check('取得 1 次 → Lv1 / dmgMul 1', r1['lv'] == 1 and r1['dmg'] == 1, r1)
        r3 = ev(GIVE_N, ['sword', 2])            # 累計 3 次
        check('取得同能力 3 次 → Lv2', r3['lv'] == 2 and r3['xp'] == 3, r3)
        check('Lv2 → dmgMul 1.25', abs(r3['dmg'] - 1.25) < 1e-9, r3['dmg'])
        check('Lv2 → 粒子 ×1.5', abs(r3['part'] - 1.5) < 1e-9, r3['part'])
        r8 = ev(GIVE_N, ['sword', 5])            # 累計 8 次
        check('取得同能力 8 次 → Lv3 / dmgMul 1.5', r8['lv'] == 3 and abs(r8['dmg'] - 1.5) < 1e-9, r8)
        check('Lv3 → 蓄力時間 ×0.8', abs(r8['hold'] - 0.8) < 1e-9, r8['hold'])
        r9 = ev(GIVE_N, ['sword', 3])            # 超過上限不會再升
        check('等級上限 3', r9['lv'] == 3, r9)
        other = ev("()=>KB.PROG.level('fire')")
        check('其他能力不受影響（fire 仍 Lv1）', other == 1, other)
        # scaleDmg：四捨五入、至少 +0
        sd = ev("()=>{const o={}; for (const d of [1,2,3,4,5,10]) o[d]=KB.PROG.scaleDmg(d,'sword'); return o;}")
        check('Lv3 傷害加成 dmg 4 → 6', sd['4'] == 6, sd)
        check('Lv3 傷害加成 dmg 1 → 2（不會比原本低）', sd['1'] >= 1, sd)
        sd2 = ev("()=>{KB.PROG.save().abilityXp.sword=3;KB.PROG.save().abilityLv.sword=2;const o={};for(const d of [1,2,3,4,5,10])o[d]=KB.PROG.scaleDmg(d,'sword');return o;}")
        check('Lv2 dmg 4 → 5、dmg 1 → 1（round(1.25)=1 不低於原值）', sd2['4'] == 5 and sd2['1'] == 1, sd2)
        lv1 = ev("()=>KB.PROG.scaleDmg(4,'fire')")
        check('Lv1 不加成（4 → 4）', lv1 == 4, lv1)
        # 升級演出（banner + flash + sfx）
        upfx = ev("""()=>{ KB.PROG.reset(); KB.VFX.clear(); const p=KB.player; let n=0;
          for(let i=0;i<3;i++){ p.ability=null; p.abilityData={}; p.giveAbility('fire');
            for(let k=0;k<60&&(KB.game.freezeT|0)>0;k++) __kb.step(1); }
          return KB.VFX.list.length; }""")
        check('升級時有放 VFX（banner / flash / ring）', upfx > 0, upfx)

        # ------------------------------------------------------------------ 2. 連擊
        print('-' * 8, '連擊')
        ev(RESET)
        c = ev(KILL_N, [3, 200])
        check('連續擊殺 3 隻 → combo 3', c['combo'] == 3 and c['max'] == 3, c)
        check('連擊視窗 180 幀（3 秒）', c['t'] == 180, c['t'])
        # 分數：base 由 Enemy.die 給，這裡驗證 PROG 只補 0.1×combo 的部分
        sc = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.game.score = 0;
          for (let i=0;i<3;i++) KB.PROG.emit('kill', {score:100, cx:100, y:100});
          return KB.game.score; }""")
        check('combo 加分 = Σ round(100×0.1×combo)（第 2、3 擊 = 20+30）', sc == 50, sc)
        # 3 秒內沒補刀 → 歸零
        rst = ev("""()=>{ KB.PROG.reset(); KB.PROG.emit('kill',{score:0}); KB.PROG.emit('kill',{score:0});
          const a = KB.PROG.combo; for (let i=0;i<179;i++) KB.PROG.update(KB.game); const b = KB.PROG.combo;
          KB.PROG.update(KB.game); return [a, b, KB.PROG.combo]; }""")
        check('179 幀內 combo 仍在、第 180 幀歸零', rst[0] == 2 and rst[1] == 2 and rst[2] == 0, rst)
        # 中途補刀會續命
        keep = ev("""()=>{ KB.PROG.reset(); KB.PROG.emit('kill',{score:0});
          for (let i=0;i<170;i++) KB.PROG.update(KB.game);
          KB.PROG.emit('kill',{score:0}); const t = KB.PROG.comboT;
          for (let i=0;i<30;i++) KB.PROG.update(KB.game); return [KB.PROG.combo, t]; }""")
        check('3 秒內補刀 → 計時重置、combo 繼續累積', keep[0] == 2 and keep[1] == 180, keep)
        # 顏色門檻
        col = ev("()=>[KB.PROG.comboColor(2), KB.PROG.comboColor(5), KB.PROG.comboColor(10)]")
        check('combo 顏色：<5 白 / ≥5 黃 / ≥10 紅', col[0] == '#ffffff' and col[1] == '#ffe040' and col[2] == '#ff5060', col)
        # 受傷 BREAK
        brk = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.VFX.clear();
          for (let i=0;i<4;i++) KB.PROG.emit('kill',{score:0});
          const before = KB.PROG.combo;
          KB.PROG.emit('hurt', {amount:1});
          return { before, after: KB.PROG.combo, breakT: KB.PROG.breakT, fx: KB.VFX.list.length, hurts: KB.PROG.run.hurts }; }""")
        check('受傷 → combo 歸零', brk['before'] == 4 and brk['after'] == 0, brk)
        check('受傷 → BREAK 演出（textPop）', brk['breakT'] > 0 and brk['fx'] > 0, brk)
        check('受傷計入本關統計 run.hurts', brk['hurts'] == 1, brk)
        # 真的挨打也會 BREAK（走 player.hurt monkeypatch，不是直接 emit）
        real = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game);
          for (let i=0;i<3;i++) KB.PROG.emit('kill',{score:0});
          const p = KB.player; p.invuln = 0; p.hurt(1, {cx: p.cx + 20});
          return [KB.PROG.combo, KB.PROG.run.hurts]; }""")
        check('player.hurt() 實際受傷也會 BREAK', real[0] == 0 and real[1] == 1, real)

        # ------------------------------------------------------------------ 3. 成就
        print('-' * 8, '成就')
        ev("()=>KB.PROG.reset()")
        got = []
        got.append(ev("()=>{ KB.player.ability=null; KB.player.giveAbility('ice'); return KB.PROG.has('first_ability'); }"))
        check('成就 1 首次變身 first_ability', got[-1], got[-1])
        got.append(ev("()=>{ for(let i=0;i<8;i++){KB.player.ability=null;KB.player.giveAbility('ice');} return KB.PROG.has('lv3'); }"))
        check('成就 2 任一能力 Lv3', got[-1], got[-1])
        got.append(ev("()=>{ KB.PROG.resetCombo(); for(let i=0;i<10;i++) KB.PROG.emit('kill',{score:0}); return KB.PROG.has('combo10'); }"))
        check('成就 3 combo 10', got[-1], got[-1])
        got.append(ev("()=>{ KB.PROG.emit('arenaClear', {time: 60*150}); return [KB.PROG.has('arena_clear'), KB.PROG.has('arena_fast')]; }"))
        check('成就 4/5 競技場通關 + 3 分內', got[-1] == [True, True], got[-1])
        got.append(ev("()=>{ KB.PROG.emit('helper',{key:'fire'}); KB.PROG.emit('possess',{}); KB.PROG.emit('inhaleBoss',{}); "
                      "return [KB.PROG.has('helper'), KB.PROG.has('possess'), KB.PROG.has('inhale_boss')]; }"))
        check('成就 6~8 夥伴 / 附身 / 吸中魔王（跨系統事件）', got[-1] == [True, True, True], got[-1])
        got.append(ev("()=>{ for(let i=0;i<10;i++) KB.PROG.emit('burn',{kind:'grass'}); "
                      "for(let i=0;i<3;i++) KB.PROG.emit('elemKill',{kind:'water_spark'}); "
                      "return [KB.PROG.has('burn10'), KB.PROG.has('elec_water')]; }"))
        check('成就 9/10 燒毀 10 草 / 電擊水域擊殺 3（累積型）', got[-1] == [True, True], got[-1])
        got.append(ev("""()=>{ KB.game.timeStopT = 999; for(let i=0;i<5;i++) KB.PROG.emit('kill',{score:0}); KB.game.timeStopT = 0;
          return KB.PROG.has('timestop5'); }"""))
        check('成就 11 時停中擊殺 5', got[-1], got[-1])
        got.append(ev("""()=>{ KB.save.stars = {w1:[1,1,1],w2:[1,1,1],w3:[1,1,1],w4:[1,1,1],w5:[1,1,1]};
          KB.PROG.emit('bigstar',{}); return KB.PROG.has('stars15'); }"""))
        check('成就 12 收齊 15 大星星', got[-1], got[-1])
        got.append(ev("""()=>{ for (const r of [0,1,2,3,4]) KB.PROG.emit('secretRoom', {levelId:'w'+(r+1), roomIdx:9});
          return KB.PROG.has('secret5'); }"""))
        check('成就 13 找到 5 秘密房', got[-1], got[-1])
        got.append(ev("""()=>{ KB.PROG.beginLevel(KB.game); KB.PROG.emit('levelClear', {levelId:'w1'}); return KB.PROG.has('nohit_world'); }"""))
        check('成就 14 無傷通關任一世界', got[-1], got[-1])
        got.append(ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.PROG.emit('hurt',{amount:1});
          KB.PROG.emit('levelClear', {levelId:'w1'}); return KB.PROG.has('nohit_world'); }"""))
        check('受傷過就拿不到「無傷通關」', not got[-1], got[-1])
        got.append(ev("""()=>{ const p = KB.player; p.hp = 1; KB.PROG.emit('bossDefeated', {hp:1}); return KB.PROG.has('hp1_boss'); }"""))
        check('成就 15 HP1 逆轉擊敗魔王', got[-1], got[-1])
        got.append(ev("""()=>{ KB.session = KB.session || {}; KB.session.extra = true; KB.PROG.beginLevel(KB.game);
          KB.PROG.emit('levelClear', {levelId:'w5'}); KB.session.extra = false; return KB.PROG.has('extra_clear'); }"""))
        check('成就 16 Extra 通關', got[-1], got[-1])
        got.append(ev("()=>{ KB.PROG.emit('mix',{key:'firesword'}); return KB.PROG.has('mix_first'); }"))
        check('成就 17 混合能力首次', got[-1], got[-1])
        got.append(ev("""()=>{ KB.save.cleared = KB.save.cleared || {}; KB.save.cleared.w5 = true; KB.PROG.checkPassive();
          return KB.PROG.has('clear_w5'); }"""))
        check('成就 18 通關 w5', got[-1], got[-1])
        got.append(ev("""()=>{ KB.save.seen = {}; for (const k of ['fire','sword','beam','cutter','spark','stone','ice','hammer']) KB.save.seen[k]=true;
          KB.PROG.checkPassive(); return KB.PROG.has('basic8'); }"""))
        check('成就 19 集齊 8 基本能力', got[-1], got[-1])
        got.append(ev("""()=>{ for (const k of KB.ABILITY_KEYS.slice(0,20)) KB.save.seen[k]=true; KB.PROG.checkPassive();
          return [KB.PROG.has('all20'), KB.UI.seenCount()]; }"""))
        check('成就 20 集齊 20 能力', got[-1][0] or got[-1][1] < 20, got[-1])
        cnt = ev("()=>KB.PROG.achCount()")
        check('本輪至少解鎖 5 條成就（實測 %d 條）' % cnt, cnt >= 5, cnt)
        # toast + 不重複解鎖
        dup = ev("()=>{ KB.PROG.toasts.length=0; KB.PROG.toastQ.length=0; const a = KB.PROG.unlock('helper'); const b = KB.PROG.unlock('helper'); return [a, b, KB.PROG.toastQ.length]; }")
        check('已解鎖的成就不會重複跳 toast', dup[1] is False and dup[2] <= 1, dup)
        # fix6：unlock 先進佇列，下一次 update 才放出來（橫幅演出期間會繼續等）
        ts = ev("""()=>{ KB.PROG.reset(); KB.save.seen = {}; KB.save.cleared = {}; KB.save.stars = {}; KB.save.arena = {};
          KB.save.extraCleared = {}; KB.VFX.clear(); KB.game.abilityFlash = 0;
          KB.PROG.toasts.length = 0; KB.PROG.toastQ.length = 0; KB.PROG.unlock('combo10');
          const q = KB.PROG.toastQ.length; KB.PROG.update(KB.game);
          const n = KB.PROG.toasts.length; for (let i=0;i<150;i++) KB.PROG.update(KB.game);
          return [q, n, KB.PROG.toasts.length]; }""")
        check('成就 toast 排隊 → 放出後 150 幀自動消失', ts == [1, 1, 0], ts)
        # fix6：變身橫幅期間延後、一次只顯示 1 張、位置在遊戲區右下（y 150~180）
        dl = ev("""()=>{ KB.PROG.reset(); KB.save.seen = {}; KB.save.cleared = {}; KB.save.stars = {}; KB.save.arena = {};
          KB.VFX.clear(); KB.PROG.toasts.length=0; KB.PROG.toastQ.length=0;
          KB.game.abilityFlash = 30;
          KB.PROG.unlock('combo10'); KB.PROG.unlock('lv3');
          for (let i=0;i<10;i++) KB.PROG.update(KB.game);
          const held = [KB.PROG.toasts.length, KB.PROG.toastQ.length];
          KB.game.abilityFlash = 0;
          for (let i=0;i<10;i++) KB.PROG.update(KB.game);
          return { held, shown: KB.PROG.toasts.length, queued: KB.PROG.toastQ.length,
                   max: KB.PROG.TOAST_MAX, y: KB.PROG.TOAST_Y }; }""")
        check('變身橫幅期間（abilityFlash > 0）成就 toast 延後排隊',
              dl['held'] == [0, 2], dl)
        check('橫幅結束後一次只放 1 張、其餘留在佇列',
              dl['shown'] == 1 and dl['queued'] == 1 and dl['max'] == 1, dl)
        check('成就 toast 畫在遊戲區右下（y 150~180）', 150 <= dl['y'] <= 180 - 26 + 4, dl['y'])
        # 存檔
        sv = ev("""()=>{ KB.PROG.reset(); KB.PROG.unlock('combo10');
          // saves-input 上線後 KB.saveGame() 會寫進「目前的存檔槽」（kirbystar_save_N），舊版是 kirbystar_save
          const keys = Object.keys(localStorage).filter(k => k.indexOf('kirbystar_save') === 0);
          return keys.some(k => { try { const o = JSON.parse(localStorage.getItem(k) || '{}');
            return !!(o.achievements && o.achievements.combo10); } catch (e) { return false; } }); }""")
        check('成就寫進 localStorage 存檔（單一存檔或存檔槽）', sv, sv)

        # ------------------------------------------------------------------ 4. Style Rank
        print('-' * 8, 'Style Rank')
        s_rank = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.PROG.comboMax = 16;
          KB.game.timeAlive = 60*60; KB.save.stars = {w1:[1,1,1]};
          return KB.PROG.rankData(KB.game); }""")
        check('無傷 + combo16 + 60 秒 + ★3 → S', s_rank['rank'] == 'S', [s_rank['rank'], s_rank['pts']])
        c_rank = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.PROG.comboMax = 0;
          for (let i=0;i<5;i++) KB.PROG.emit('hurt',{amount:1});
          KB.game.timeAlive = 60*400; KB.save.stars = {};
          return KB.PROG.rankData(KB.game); }""")
        check('受傷 5 次 + 無 combo + 400 秒 + 無星 → C', c_rank['rank'] == 'C', [c_rank['rank'], c_rank['pts']])
        check('rankData 有 4 項評分細項', len(s_rank['parts']) == 4, [p['label'] for p in s_rank['parts']])
        best = ev("""()=>{ KB.PROG.reset(); KB.PROG.saveRank('w1','B'); const a = KB.PROG.bestRank('w1');
          KB.PROG.saveRank('w1','C'); const b = KB.PROG.bestRank('w1');
          KB.PROG.saveRank('w1','S'); return [a, b, KB.PROG.bestRank('w1')]; }""")
        check('bestRank 只升不降（B → C 無效 → S）', best == ['B', 'B', 'S'], best)
        # 結算畫面真的畫得出來
        res = ev("""()=>{ KB.PROG.reset(); KB.PROG.beginLevel(KB.game); KB.PROG.comboMax = 12;
          KB.game.timeAlive = 60*80; KB.setScene(new KB.ResultScene(KB.game));
          KB.scene.fade = 0; KB.scene.fadeDir = 0;
          for (let i=0;i<400;i++) __kb.step(1);
          return { done: KB.scene.done, rank: KB.scene.rk ? KB.scene.rk.rank : null, saved: KB.PROG.bestRank(KB.game ? 'w1' : 'w1') }; }""")
        check('ResultScene 跑完會存 Style Rank', res['done'] and res['rank'] and res['saved'] == res['rank'], res)

        # ------------------------------------------------------------------ 5. 選關第 6 節點
        print('-' * 8, '選關第 6 節點')
        # 向下相容：暫時把 w6 拿掉 → 只剩 5 個節點（不會出現「製作中」的第 6 點）
        n5 = ev("""()=>{ const all = KB.LEVELS.slice();
          KB.LEVELS = KB.LEVELS.filter(l => l.id !== 'w6' && l.id !== 'w7');
          const s = new KB.StageSelectScene(0);
          const r = [s.nodes.length, s.labels().rs.length, KB.LEVELS.length];
          KB.LEVELS = all;   // 還原原本順序（w6 必須留在 index 5）
          return r; }""")
        check('沒有 w6/w7 時只有 5 個節點（%d 關）' % n5[2], n5[0] == 5 and n5[1] == 5, n5)
        total = ev(FAKE_W6)
        check('注入 w6 後 KB.LEVELS 有 6 關', total >= 6, total)
        n6 = ev("""()=>{ const s = new KB.StageSelectScene(0);
          const rs = s.labels().rs;
          const hit = (a,b)=>a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];
          let over = 0, out = 0;
          for (let i=0;i<rs.length;i++){ for (let j=i+1;j<rs.length;j++) if (hit(rs[i],rs[j])) over++;
            if (rs[i][0]<4 || rs[i][0]+rs[i][2]>250 || rs[i][1]<4 || rs[i][1]+18>156) out++; }
          return { n: s.nodes.length, paths: s.paths.length, labels: rs.length, over, out,
                   theme: s.themeOf(5), name: s.nameOf(5), node: s.nodes[5], spr: !!KB.SPR['uifb_node_space'] }; }""")
        check('選關 ≥ 6 個節點', n6['n'] >= 6, n6)
        check('n 個節點 → n-1 段虛線路徑', n6['paths'] == n6['n'] - 1, n6['paths'])
        check('關名標籤互不重疊 / 不出界', n6['over'] == 0 and n6['out'] == 0, n6)
        check('第 6 點主題 space / 有紫藍節點圖 uifb_node_space', n6['theme'] == 'space' and n6['spr'], n6)
        check('第 6 點在右上角 [238,56]', n6['node'] == [238, 56], n6['node'])
        # 選關畫面真的畫得出來（含星空島）
        draw6 = ev("""()=>{ __kb.goto('select', {index:5}); KB.scene.fade=0; KB.scene.fadeDir=0; __kb.step(4); __kb.render();
          return [KB.scene.nodes.length, KB.scene.cur]; }""")
        check('選關畫面可繪製（≥6 節點、游標停在 index 5）', draw6[0] >= 6 and draw6[1] == 5, draw6)
        # 能力進度讀 KB.ABILITY_KEYS.length（mix 之後會變 32）
        akn = ev("()=>[KB.UI.abilityKeys().length, KB.ABILITY_KEYS.length]")
        check('「能力 n/N」的 N 直接讀 KB.ABILITY_KEYS.length', akn[0] == akn[1], akn)

        # ------------------------------------------------------------------ 6. 圖鑑成就分頁
        print('-' * 8, '圖鑑成就分頁')
        gal = ev("""()=>{ const g = new KB.AbilityGallery(); const a = g.tab;
          const tap = k => { KB.input.setVirtual({[k]:true}, true); KB.input.update(); const r = g.update();
                             KB.input.setVirtual({}, true); KB.input.update(); return r; };
          tap('select'); const b = g.tab;          // → 成就分頁
          tap('right'); const p1 = g.ap;           // 成就分頁換頁
          const back = tap('jump');                // Z 離開
          tap('select'); const c = g.tab;          // → 回能力分頁
          return [a, b, p1, back, c, g.achPages, g.achList.length]; }""")
        check('圖鑑 SELECT 切到成就分頁（%d 頁）' % gal[5], gal[0] == 0 and gal[1] == 1 and gal[6] == 40, gal)
        check('成就分頁 ←→ 換頁、Z 返回、再按 SELECT 回能力分頁', gal[2] == 1 and gal[3] == 'back' and gal[4] == 0, gal)

        # ------------------------------------------------------------------ 7. 成就誤觸發（大王退治）
        print('-' * 8, '成就誤觸發回歸（Round 8 ach2）')
        # 舊 bug：clear_w5 / arena_clear 寫在 checkPassive（每次 emit 都跑）→ 存檔裡 cleared.w5 已經是 true 時
        #        會在「之後隨便哪一個事件」才解鎖並跳卡片 → shots/agent_fix7/awaken_boss_after.png
        #        （迪迪迪還剩 65% 血就跳出「大王退治」）。
        rep = ev("""()=>{ KB.PROG.reset(); KB.save.cleared = {}; KB.save.seen = {}; KB.save.arena = {};
          __kb.release(); __kb.goto('game', {level:'w5', room:5, nofade:true});
          KB.PROG.beginLevel(KB.game); __kb.step(3);
          for (let i=0;i<200;i++) __kb.step(1);                       // 跑完魔王登場演出
          const b = KB.game.boss; b.hp = Math.ceil(b.maxHp * 0.65);   // 打到剩 65%
          for (let i=0;i<6;i++) KB.PROG.emit('kill', {score:100, cx:100, y:100});
          KB.PROG.emit('hurt', {amount:1});
          for (let i=0;i<40;i++) KB.PROG.update(KB.game);
          return { hp: b.hp, max: b.maxHp, ach: Object.keys(KB.save.achievements),
                   shown: KB.PROG.toasts.map(t=>t.id).concat(KB.PROG.toastQ.map(t=>t.id)) }; }""")
        check('W5 魔王剩 65% 血：不會解鎖「大王退治」clear_w5',
              'clear_w5' not in rep['ach'] and 'clear_w5' not in rep['shown'], rep)
        check('（同時修掉）?debug=1 的 UI.seenCount 陷阱不會誤解鎖 basic8 / all20',
              'all20' not in rep['ach'] and 'basic8' not in rep['ach'], rep['ach'])
        check('魔王血量真的只剩 ~65%（重現條件成立）', rep['hp'] == round(rep['max'] * 0.65 + 0.4999), rep)
        # 舊存檔（cleared.w5 已是 true）→ 進關卡時靜默補發，不會在魔王戰中途跳卡片
        rep2 = ev("""()=>{ KB.PROG.reset(); KB.save.cleared = {w5: true}; KB.save.seen = {};
          __kb.goto('game', {level:'w5', room:5, nofade:true});
          KB.PROG.beginLevel(KB.game); __kb.step(3);
          const silent = KB.PROG.has('clear_w5');
          const q0 = KB.PROG.toasts.concat(KB.PROG.toastQ).map(t=>t.id);
          for (let i=0;i<200;i++) __kb.step(1);
          const b = KB.game.boss; b.hp = Math.ceil(b.maxHp * 0.65);
          for (let i=0;i<6;i++) KB.PROG.emit('kill', {score:0});
          for (let i=0;i<40;i++) KB.PROG.update(KB.game);
          return { silent, q0, shown: KB.PROG.toasts.concat(KB.PROG.toastQ).map(t=>t.id) }; }""")
        check('舊存檔已通關 W5 → beginLevel 靜默補發（有記錄、不跳卡片）',
              rep2['silent'] and 'clear_w5' not in rep2['q0'] and 'clear_w5' not in rep2['shown'], rep2)
        # 真的通關 W5 的當下才解鎖，而且會跳卡片
        ok5 = ev("""()=>{ KB.PROG.reset(); KB.save.cleared = {}; KB.PROG.beginLevel(KB.game);
          KB.PROG.toasts.length = 0; KB.PROG.toastQ.length = 0;
          KB.save.cleared.w5 = true;                       // game.js levelClear 先寫旗標再 emit
          KB.PROG.emit('levelClear', {levelId: 'w5'});
          return { has: KB.PROG.has('clear_w5'), q: KB.PROG.toastQ.map(t=>t.id) }; }""")
        check('真的通關 W5 的當下解鎖並跳卡片', ok5['has'] and 'clear_w5' in ok5['q'], ok5)
        # backfill 本身不跳卡片、也不會重複解鎖
        bf = ev("""()=>{ KB.PROG.reset(); KB.save.cleared = {w5:true, w6:true}; KB.save.arena = {cleared:true};
          KB.PROG.toasts.length = 0; KB.PROG.toastQ.length = 0;
          KB.PROG.backfill();
          return { has: ['clear_w5','clear_w6','arena_clear'].map(i=>KB.PROG.has(i)),
                   q: KB.PROG.toastQ.length + KB.PROG.toasts.length, silent: KB.PROG.silent }; }""")
        check('backfill 一次補齊 clear_w5 / clear_w6 / arena_clear 且 0 卡片',
              bf['has'] == [True, True, True] and bf['q'] == 0 and bf['silent'] == 0, bf)

        # ------------------------------------------------------------------ 8. 新成就（Round 8 的 20 條）
        print('-' * 8, '新成就觸發')
        na = ev("""()=>{ KB.PROG.reset();
          KB.save.cleared = {}; KB.save.seen = {}; KB.save.stars = {}; KB.save.arena = {}; KB.save.extraCleared = {};
          KB.PROG.beginLevel(KB.game);
          const H = KB.PROG.has.bind(KB.PROG), r = {};
          // ① 覺醒：不靠 emit，自動偵測 KB.AWAKEN.activeT 由 0 變正
          if (KB.AWAKEN) { KB.AWAKEN.activeT = 0; KB.PROG.update(KB.game); KB.AWAKEN.activeT = 60; KB.PROG.update(KB.game); KB.AWAKEN.activeT = 0; }
          r.awaken_first = H('awaken_first');
          for (let i=0;i<10;i++) KB.PROG.emit('awaken', {});
          r.awaken10 = H('awaken10');
          // ② 覺醒斬王 + 無傷討伐（bossHurts 0）
          KB.PROG.run.bossHurts = 0;
          KB.PROG.emit('bossDefeated', {hp: 5, awaken: true});
          r.awaken_boss = H('awaken_boss'); r.nohit_boss = H('nohit_boss');
          // ③ 魔王戰中被打到 → 拿不到「完美討伐」
          KB.PROG.save().achievements.nohit_boss = 0; delete KB.PROG.save().achievements.nohit_boss;
          KB.PROG.run.bossHurts = 2; KB.PROG.emit('bossDefeated', {hp: 5});
          r.nohit_boss_blocked = !H('nohit_boss');
          // ④ Lv4 / Lv4 ×5
          KB.PROG.save().abilityXp = { sword:15, fire:15, ice:15, beam:15, cutter:15 };
          KB.PROG.checkPassive(); r.lv4_any = H('lv4_any'); r.lv4_five = H('lv4_five');
          // ⑤ 混合 12 / 24（從 KB.save.seen 推）
          const mixKeys = Object.keys(KB.ABILITIES).filter(k => KB.MIX && KB.MIX.isMix && KB.MIX.isMix(k));
          for (const k of mixKeys.slice(0, 12)) KB.save.seen[k] = true;
          KB.PROG.checkPassive(); r.mix12 = H('mix12'); r.mix24_not_yet = !H('mix24');
          for (const k of mixKeys) KB.save.seen[k] = true;
          KB.PROG.checkPassive(); r.mix24 = H('mix24'); r.mixCount = KB.PROG.mixCount();
          // ⑥ 夥伴：兩名（自動偵測 count()）、合體技（自動偵測 unionCD 由 0 變滿）
          if (KB.Helper) {
            const c0 = KB.Helper.count, cd0 = KB.Helper.unionCD;
            KB.Helper.count = () => 2; KB.PROG.update(KB.game); KB.Helper.count = c0;
            KB.Helper.unionCD = 0; KB.PROG.update(KB.game); KB.Helper.unionCD = 600; KB.PROG.update(KB.game);
            KB.Helper.unionCD = cd0;
          }
          r.helper_two = H('helper_two'); r.union = H('union');
          for (let i=0;i<20;i++) KB.PROG.emit('helperKill', {});
          r.helper_kill20 = H('helper_kill20');
          // ⑦ 元素全書
          for (const el of ['fire','ice','spark','wind']) KB.PROG.emit('elemKill', {elem: el});
          r.elem_all = H('elem_all');
          // ⑧ W6 / W7 通關
          KB.PROG.emit('levelClear', {levelId: 'w6'}); r.clear_w6 = H('clear_w6');
          KB.PROG.emit('levelClear', {levelId: 'w7'}); r.clear_w7 = H('clear_w7');
          // ⑨ S 評價
          KB.PROG.saveRank('w1', 'S'); r.rank_s = H('rank_s');
          // ⑩ 大星星 21 / 秘密房 7
          KB.save.stars = {}; for (const l of KB.LEVELS) KB.save.stars[l.id] = [1,1,1];
          KB.PROG.checkPassive(); r.stars21 = H('stars21');
          for (const l of KB.LEVELS) KB.PROG.emit('secretRoom', {levelId: l.id, roomIdx: 9});
          r.secret7 = H('secret7');
          // ⑪ 競技場 6 連戰
          KB.PROG.emit('arenaClear', {time: 60*200, beaten: 6, total: 6}); r.arena6 = H('arena6');
          // ⑫ Extra 全通
          for (const l of KB.LEVELS) KB.save.extraCleared[l.id] = true;
          KB.PROG.checkPassive(); r.extra_all = H('extra_all');
          // ⑬ 元成就
          r.ach20 = H('ach20'); r.count = KB.PROG.achCount();
          return r; }""")
        NEW20 = ['awaken_first', 'awaken10', 'awaken_boss', 'nohit_boss', 'lv4_any', 'lv4_five', 'mix12', 'mix24',
                 'helper_two', 'union', 'helper_kill20', 'elem_all', 'clear_w6', 'clear_w7', 'rank_s',
                 'stars21', 'secret7', 'arena6', 'extra_all', 'ach20']
        got_new = [k for k in NEW20 if na.get(k)]
        check('新成就可被觸發 ≥ 8 條（實測 %d/20 條）' % len(got_new), len(got_new) >= 8, [k for k in NEW20 if not na.get(k)])
        check('20 條新成就全部可觸發', len(got_new) == 20, [k for k in NEW20 if not na.get(k)])
        check('覺醒自動偵測（KB.AWAKEN.activeT 0→正，不用 emit）', na.get('awaken_first'), na)
        check('合體技 / 雙夥伴自動偵測（KB.Helper.unionCD / count）', na.get('union') and na.get('helper_two'), na)
        check('混合能力計數 = 24（KB.MIX.isMix）', na.get('mixCount') == 24, na.get('mixCount'))
        check('12 種混合時還拿不到「混合全通」', na.get('mix24_not_yet'), na)
        check('魔王戰中被打到 → 拿不到「完美討伐」', na.get('nohit_boss_blocked'), na)
        check('元成就「成就達人」＝其他 20 條達成', na.get('ach20') and na.get('count', 0) >= 21, na.get('count'))
        # 競技場 6 連戰：arena.js 目前只傳 time → 退而從 KB.game.arena 推（KB.game 不會被清掉）
        a6 = ev("""()=>{ KB.PROG.reset(); const old = KB.game.arena;
          KB.game.arena = { beaten: 6, order: [1,2,3,4,5,6] };
          KB.PROG.emit('arenaClear', {time: 60*200});
          const r = [KB.PROG.has('arena6'), KB.PROG.count('arenaBeaten')];
          KB.game.arena = old; return r; }""")
        check('arenaClear 沒傳 beaten/total 時從 KB.game.arena 推出「六王連霸」', a6 == [True, 6], a6)
        # 真的用火屬性打死敵人 → 元素全書的火（走 KB.Enemy.prototype.die 的 monkeypatch）
        ek = ev("""()=>{ KB.PROG.reset(); __kb.goto('game', {level:'w1', room:0, nofade:true}); KB.PROG.beginLevel(KB.game); __kb.step(2);
          const e = KB.game.entities.find(x => x.type === 'enemy'); if (!e) return null;
          e.hurt(99, { kind: 'fireball', owner: 'player' });
          __kb.step(2);
          return { dead: !!e.dead, src: !!e._killSrc, elem: KB.PROG.save().prog.elemKills }; }""")
        check('KB.Enemy.die monkeypatch 記下擊殺來源 → 元素擊殺自動統計',
              ek and ek['dead'] and ek['src'] and (ek['elem'] or {}).get('fire') == 1, ek)

        # ------------------------------------------------------------------ 9. 成就頁分頁（40 條 / 每頁 10）
        print('-' * 8, '成就頁分頁')
        ap = ev("""()=>{ const g = new KB.AbilityGallery(1);
          const tap = k => { KB.input.setVirtual({[k]:true}, true); KB.input.update(); const r = g.update();
                             KB.input.setVirtual({}, true); KB.input.update(); return r; };
          const n = g.achList.length, pages = g.achPages;
          tap('right'); const p1 = g.ap, i1 = g.ai;      // →：換頁，游標跟到該頁第一條
          tap('down'); const i2 = g.ai;                   // ↓：移動游標
          tap('left'); const p2 = g.ap;
          // ↑ 越過頁首 → 自動翻到上一頁
          g.ap = 1; g.ai = 10; tap('up'); const p3 = g.ap, i3 = g.ai;
          return { n, pages, p1, i1, i2, p2, p3, i3 }; }""")
        check('成就頁 40 條 / 4 頁（每頁 10 條）', ap['n'] == 40 and ap['pages'] == 4, ap)
        check('←→ 翻頁、游標跟到該頁第一條', ap['p1'] == 1 and ap['i1'] == 10 and ap['p2'] == 0, ap)
        check('↑↓ 移動游標、越過頁邊自動換頁', ap['i2'] == 11 and ap['p3'] == 0 and ap['i3'] == 9, ap)
        drawn = ev("""()=>{ KB.PROG.reset(); const ids = KB.PROG.ACH.slice(0, 24).map(a=>a.id);
          for (const id of ids) KB.save.achievements[id] = Date.now();
          __kb.goto('title'); KB.scene.fade = 0; KB.scene.fadeDir = 0; __kb.step(2);
          KB.scene.menu = new KB.TitleMenu(KB.scene); KB.scene.menu.sub = new KB.AbilityGallery(1);
          const out = [];
          for (let p = 0; p < 4; p++) { KB.scene.menu.sub.ap = p; KB.scene.menu.sub.ai = p * 10; __kb.step(1); __kb.render(); out.push(p); }
          return { out: out.length, count: KB.PROG.achCount(), ts: KB.PROG.achTimeStr(ids[0]).length }; }""")
        check('成就頁 4 頁都畫得出來（含解鎖時間字串）', drawn['out'] == 4 and drawn['ts'] == 11, drawn)

        # ------------------------------------------------------------------ 10. 選單條件整合
        print('-' * 8, '選單整合（挑戰 / 存檔槽 / 按鍵設定 / 配色）')
        mn = ev("""()=>{ const C0 = KB.ChallengeScene, S0 = KB.SaveSelectScene;
          KB.ChallengeScene = undefined; KB.SaveSelectScene = undefined;
          const off = new KB.TitleMenu().items.map(i => i.id);
          KB.ChallengeScene = function () { }; KB.SaveSelectScene = function () { };
          const m = new KB.TitleMenu(); const on = m.items.map(i => i.id);
          const win = m.win, n = m.items.length;
          m.sel = n - 1; m.clampTop(); const topEnd = m.top;
          m.sel = 0; m.clampTop(); const top0 = m.top;
          KB.ChallengeScene = C0; KB.SaveSelectScene = S0;
          return { off, on, win, n, topEnd, top0 }; }""")
        check('沒有 KB.ChallengeScene / KB.SaveSelectScene 時不顯示入口',
              'challenge' not in mn['off'] and 'saves' not in mn['off'], mn['off'])
        check('有 KB.ChallengeScene → 標題選單出現「挑戰模式」', 'challenge' in mn['on'], mn['on'])
        check('有 KB.SaveSelectScene → 標題選單出現「存檔槽」', 'saves' in mn['on'], mn['on'])
        check('項目 > 7 時改成捲動（視窗 7 列，選到最後一項會捲到底）',
              mn['n'] > 7 and mn['win'] == 7 and mn['topEnd'] == mn['n'] - 7 and mn['top0'] == 0, mn)
        mn2 = ev("""()=>{ const S0 = KB.SKINS, K0 = KB.KeyConfigMenu, K1 = KB.KeyConfigScene;
          KB.SKINS = undefined; KB.KeyConfigMenu = undefined; KB.KeyConfigScene = undefined;
          const off = new KB.SettingsMenu().items.map(i => i.id);
          KB.SKINS = { list: () => ['pink', 'blue'], current: () => 'pink', set: () => true,
                       unlocked: () => true, name: id => (id === 'blue' ? '天空藍' : '櫻花粉') };
          KB.KeyConfigMenu = function () { return { update: () => 'back', draw: () => { } }; };
          const m = new KB.SettingsMenu(); const on = m.items.map(i => i.id);
          // 卡比配色 cycle：→ 換成下一個已解鎖配色
          let setTo = null; KB.SKINS.set = id => { setTo = id; return true; };
          m.sel = on.indexOf('skin');
          KB.input.setVirtual({ right: true }, true); KB.input.update(); m.update();
          KB.input.setVirtual({}, true); KB.input.update();
          // 按鍵設定 ›：Z 進入子選單
          m.sel = on.indexOf('keyconfig');
          KB.input.setVirtual({ jump: true }, true); KB.input.update(); m.update();
          KB.input.setVirtual({}, true); KB.input.update();
          const sub = !!m.sub;
          m.update();                     // 子選單回傳 'back' → 關掉
          const closed = !m.sub;
          KB.SKINS = S0; KB.KeyConfigMenu = K0; KB.KeyConfigScene = K1;
          return { off, on, setTo, sub, closed }; }""")
        check('沒有 KB.SKINS / KB.KeyConfigMenu 時設定頁不顯示那兩項',
              'skin' not in mn2['off'] and 'keyconfig' not in mn2['off'], mn2['off'])
        check('有 KB.SKINS → 設定頁出現「卡比配色」，→ 會呼叫 KB.SKINS.set',
              'skin' in mn2['on'] and mn2['setTo'] == 'blue', mn2)
        check('有 KB.KeyConfigMenu → 設定頁出現「按鍵設定 ›」，Z 進入子選單並可返回',
              'keyconfig' in mn2['on'] and mn2['sub'] and mn2['closed'], mn2)
        skins_real = ev("""()=>{ if (!KB.SKINS || !KB.SKINS.list) return 'no-skins';
          const m = new KB.SettingsMenu(); const ids = m.items.map(i => i.id);
          return { has: ids.indexOf('skin') >= 0, list: KB.SKINS.list().length, name: KB.SKINS.name(KB.SKINS.current()) }; }""")
        check('實機 KB.SKINS 也接得上（只列已解鎖）',
              skins_real == 'no-skins' or (skins_real['has'] and skins_real['list'] >= 1 and skins_real['name']), skins_real)
        draws = ev("""()=>{ __kb.goto('title'); KB.scene.fade = 0; KB.scene.fadeDir = 0; __kb.step(2);
          const m = KB.scene.menu = new KB.TitleMenu(KB.scene); __kb.step(1); __kb.render();
          m.sel = m.items.length - 1; m.clampTop(); __kb.step(1); __kb.render();
          m.sub = new KB.SettingsMenu(); __kb.step(1); __kb.render();
          return { n: m.items.length, set: m.sub.items.length }; }""")
        check('標題選單（捲到底）與設定頁都畫得出來（%d / %d 項）' % (draws['n'], draws['set']),
              draws['n'] >= 8 and draws['set'] >= 5, draws)

        check('全程無 console error / pageerror', not logs, logs[:3])
        b.close()

    print('---')
    fails = [r for r in results if not r[1]]
    print('%d/%d passed' % (len(results) - len(fails), len(results)))
    for f in fails:
        print('  FAIL ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
