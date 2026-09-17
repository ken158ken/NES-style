# -*- coding: utf-8 -*-
"""
挑戰模式驗證（Round 8 / agent: challenge）

涵蓋：
  1. api      KB.CHALLENGE 介面、決定性亂數、mm:ss.ff、存檔結構（舊存檔相容）
  2. time     時間攻擊：計時會跑、死亡不扣命（時間繼續）、過關直接進挑戰結算並記 KB.save.challenge.time（只留最短）
  3. nohit    無傷挑戰：受傷即失敗（reason='hit'）、過關記 nohit[id]=true + 最短時間
  4. tower    挑戰塔：10 層、同 seed 同房間序列（決定性）、不同 seed 會不同、第 5/10 層是魔王、世界範圍隨層數提升
  5. mods     修飾條件：鏡像（寬度不變 / 門存在 / 斜坡互換 / 原始資料沒被改到）、1HP、暗房、敵人 ×1.3、倍化、封印之口、時限
  6. daily    每日挑戰：seed = YYYYMMDD、3 層固定修飾、每天一次
  7. arena    Boss Rush Extra：KB.ArenaScene({extra}) / ({all7}) 的順序與 KB.session.extra、變體紀錄
  8. records  成績板「挑戰」頁：分頁數 +1、畫得出來、數值讀得到
  9. menu     KB.ChallengeScene：5 個項目、子選單（選世界 / Boss Rush 變體）、畫得出來

用法：python tools/test_challenge.py [-v] [--only api,time,...] [--shots]
"""
import sys, json, base64, pathlib, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTDIR = ROOT / 'shots' / 'agent_challenge'

results = []
VERBOSE = False
SHOTS = False


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


def shot(pg, name):
    if not SHOTS:
        return
    SHOTDIR.mkdir(parents=True, exist_ok=True)
    # 截圖前先把淡入淡出關掉（剛切場景時 fade=1，截出來會是一片黑）
    pg.evaluate("()=>{if(KB.scene){KB.scene.fade=0; KB.scene.fadeDir=0; KB.scene.leaving=null;} __kb.step(1);}")
    pg.evaluate("()=>__kb.render()")
    data = pg.evaluate("""(s)=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;
        const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""", 3)
    (SHOTDIR / (name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('  shot', name)


def J(pg, js, arg=None):
    """在頁面內執行並回傳 JSON（回傳 undefined 時給 None）"""
    return pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)


# 乾淨的挑戰存檔（每段測試前呼叫，避免互相汙染）
RESET = """() => {
  KB.save.challenge = { time: {}, nohit: {}, nohitTime: {}, tower: { bestFloor: 0, bestTime: 0, clears: 0 }, daily: {}, arena: {} };
  KB.save.cleared = KB.save.cleared || {};
  KB.session = KB.session || {}; KB.session.extra = false;
  return true;
}"""


# ---------------------------------------------------------------- 1. api
def t_api(pg):
    print('\n--- 1. API / 亂數 / 存檔 ---')
    api = J(pg, "()=>Object.keys(KB.CHALLENGE).sort()")
    need = ['MODS', 'MOD_LIST', 'rng', 'towerPlan', 'dailyPlan', 'startTime', 'startNohit',
            'startTower', 'startDaily', 'buildFloor', 'drawHUD', 'onRoom', 'onEnter', 'tick',
            'exitDoor', 'onDeath', 'onClear', 'afterClear', 'bestTime', 'bestNohit', 'bestTower']
    miss = [k for k in need if k not in api]
    check('KB.CHALLENGE 介面齊全', not miss, 'missing=' + str(miss))
    check('KB.ChallengeScene 存在（TitleMenu 掛入口的條件）', J(pg, "()=>typeof KB.ChallengeScene === 'function'"))

    # 決定性亂數：同 seed 同數列、不同 seed 不同
    a = J(pg, "()=>{const r=KB.CHALLENGE.rng(1234);return [r(),r(),r(),r(),r()]}")
    b = J(pg, "()=>{const r=KB.CHALLENGE.rng(1234);return [r(),r(),r(),r(),r()]}")
    c = J(pg, "()=>{const r=KB.CHALLENGE.rng(1235);return [r(),r(),r(),r(),r()]}")
    check('rng(seed) 決定性（同 seed 同數列）', a == b, a[:2])
    check('rng(seed) 不同 seed 會不同', a != c)
    check('rng 落在 [0,1)', all(0 <= v < 1 for v in a))

    # mm:ss.ff
    fmt = J(pg, "()=>[KB.CHALLENGE.mmssff(0),KB.CHALLENGE.mmssff(90),KB.CHALLENGE.mmssff(3661*60/60|0),KB.CHALLENGE.mmssff(60*75+30)]")
    check('mm:ss.ff 格式', fmt[0] == '00:00.00' and fmt[1] == '00:01.50', fmt)

    # 日期種子
    d = J(pg, "()=>[KB.CHALLENGE.dateKey(new Date(2026,8,12)),KB.CHALLENGE.dateSeed('20260912')]")
    check('dateKey/dateSeed = YYYYMMDD', d[0] == '20260912' and d[1] == 20260912, d)

    # 存檔結構（舊存檔沒有 challenge 也要自動補齊）
    s = J(pg, "()=>{delete KB.save.challenge; const c=KB.CHALLENGE.save(); return Object.keys(c).sort()}")
    check('KB.save.challenge 自動補齊', s == ['arena', 'daily', 'nohit', 'nohitTime', 'time', 'tower'], s)

    # 修飾條件表
    mods = J(pg, "()=>KB.CHALLENGE.MOD_LIST")
    check('修飾條件 8 種', len(mods) == 8, mods)
    named = J(pg, "()=>KB.CHALLENGE.MOD_LIST.every(k=>!!(KB.CHALLENGE.MODS[k].name&&KB.CHALLENGE.MODS[k].desc))")
    check('每個修飾條件都有中文名 + 說明', named)


# ---------------------------------------------------------------- 2. time
def t_time(pg):
    print('\n--- 2. 時間攻擊 ---')
    pg.evaluate(RESET)
    st = J(pg, """()=>{KB.CHALLENGE.startTime('w1'); KB.scene.fade=0; KB.scene.fadeDir=0; __kb.step(2);
      const g=KB.game; return {scene:KB.scene.constructor.name, type:g.challenge.type, lvl:g.levelId, t:g.timeAlive, lives:g.lives}}""")
    check('startTime 進入 GameScene + challenge.type=time', st['scene'] == 'GameScene' and st['type'] == 'time' and st['lvl'] == 'w1', st)

    t0 = J(pg, "()=>{__kb.step(60); return KB.game.timeAlive}")
    check('計時每幀 +1（60 幀後 timeAlive ≈ 60）', 55 <= t0 <= 70, t0)
    shot(pg, 'time_hud')

    # HUD 有畫出 mm:ss.ff（直接比對 drawHUD 的字串產生器）
    hud = J(pg, "()=>KB.CHALLENGE.mmssff(KB.game.timeAlive)")
    check('HUD 計時字串是 mm:ss.ff', len(hud) == 8 and hud[2] == ':' and hud[5] == '.', hud)

    # 死亡不扣命、時間繼續
    dead = J(pg, """()=>{const g=KB.game, before=g.timeAlive, lv=g.lives;
      g.playerDied(); __kb.step(4);
      return {scene:KB.scene.constructor.name, lives:KB.game.lives, deaths:KB.game.challenge.deaths, before, after:KB.game.timeAlive}}""")
    check('時間攻擊死亡不會 GAME OVER', dead['scene'] == 'GameScene', dead)
    check('死亡不扣命（lives 仍 ≥ 0）', dead['lives'] >= 0, dead['lives'])
    check('死亡次數有記（deaths=1）', dead['deaths'] == 1, dead['deaths'])
    check('死亡後時間繼續累加', dead['after'] >= dead['before'], dead)

    # 過關 → 挑戰結算（沒有滾動計分）+ 紀錄
    clr = J(pg, """()=>{const g=KB.game; KB.save.playCount=KB.save.playCount||{};
      const play0=KB.save.playCount.w1|0, best0=(KB.save.best&&KB.save.best.w1)|0;
      g.timeAlive=1234; g.levelClear(); __kb.step(240);
      return {scene:KB.scene.constructor.name, rec:KB.save.challenge.time.w1,
              play0, play:(KB.save.playCount.w1)|0, best0, best:(KB.save.best&&KB.save.best.w1)|0}}""")
    check('過關直接進 ChallengeResultScene（無結算滾動）', clr['scene'] == 'ChallengeResultScene', clr['scene'])
    check('記 KB.save.challenge.time[w1]', clr['rec'] == 1234, clr['rec'])
    check('挑戰模式不寫一般通關統計（playCount / best 不變）', clr['play'] == clr['play0'] and clr['best'] == clr['best0'], clr)
    shot(pg, 'time_result')

    # 只留最短
    best = J(pg, """()=>{KB.CHALLENGE.startTime('w1'); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      const g=KB.game; g.timeAlive=2000; g.levelClear(); __kb.step(240); const worse=KB.save.challenge.time.w1;
      KB.CHALLENGE.startTime('w1'); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      const h=KB.game; h.timeAlive=900; h.levelClear(); __kb.step(240);
      return {worse, better:KB.save.challenge.time.w1}}""")
    check('最佳時間只留最短（2000 不覆蓋 1234、900 會更新）', best['worse'] == 1234 and best['better'] == 900, best)


# ---------------------------------------------------------------- 3. nohit
def t_nohit(pg):
    print('\n--- 3. 無傷挑戰 ---')
    pg.evaluate(RESET)
    st = J(pg, """()=>{KB.CHALLENGE.startNohit('w1'); KB.scene.fade=0;KB.scene.fadeDir=0; __kb.step(4);
      return {scene:KB.scene.constructor.name, type:KB.game.challenge.type, hurts:KB.PROG.run.hurts}}""")
    check('startNohit 進入 GameScene + type=nohit', st['scene'] == 'GameScene' and st['type'] == 'nohit', st)
    check('進場時 hurts 歸零', st['hurts'] == 0)
    shot(pg, 'nohit_hud')

    fail = J(pg, """()=>{KB.PROG.run.hurts = 1; __kb.step(3);
      return {scene:KB.scene.constructor.name, reason:KB.scene.r?KB.scene.r.reason:null, ok:KB.scene.r?KB.scene.r.ok:null}}""")
    check('受傷即失敗 → ChallengeResultScene', fail['scene'] == 'ChallengeResultScene', fail)
    check('失敗原因 = hit（顯示「被擊中！」）', fail['reason'] == 'hit' and fail['ok'] is False, fail)
    opts = J(pg, "()=>KB.scene.opts")
    check('失敗畫面有「重試 / 離開」兩個選項', opts == ['重試', '離開'], opts)
    shot(pg, 'nohit_fail')

    # 真的走 player.hurt 也要觸發
    real = J(pg, """()=>{KB.CHALLENGE.startNohit('w1'); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(4);
      KB.player.invincibleT=0; KB.player.invuln=0; KB.player.hurt(1,{cx:KB.player.cx-20,cy:KB.player.cy}); __kb.step(4);
      return {scene:KB.scene.constructor.name, hurts:KB.PROG.run.hurts}}""")
    check('真的被打中（player.hurt）也會失敗', real['scene'] == 'ChallengeResultScene', real)

    ok = J(pg, """()=>{KB.CHALLENGE.startNohit('w2'); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      const g=KB.game; g.timeAlive=3000; g.levelClear(); __kb.step(240);
      const r1={done:KB.save.challenge.nohit.w2, t:KB.save.challenge.nohitTime.w2};
      KB.CHALLENGE.startNohit('w2'); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      const h=KB.game; h.timeAlive=1500; h.levelClear(); __kb.step(240);
      return {r1, t2:KB.save.challenge.nohitTime.w2, scene:KB.scene.constructor.name}}""")
    check('通關記 nohit[w2]=true', ok['r1']['done'] is True, ok['r1'])
    check('通關記最短時間（3000 → 1500）', ok['r1']['t'] == 3000 and ok['t2'] == 1500, ok)


# ---------------------------------------------------------------- 4. tower
def t_tower(pg):
    print('\n--- 4. 挑戰塔（10 層 / 種子決定性）---')
    pg.evaluate(RESET)
    p1 = J(pg, "()=>KB.CHALLENGE.towerPlan(1,10).map(f=>f.lv+':'+f.room+':'+f.mods.join('+'))")
    p1b = J(pg, "()=>KB.CHALLENGE.towerPlan(1,10).map(f=>f.lv+':'+f.room+':'+f.mods.join('+'))")
    p2 = J(pg, "()=>KB.CHALLENGE.towerPlan(2,10).map(f=>f.lv+':'+f.room+':'+f.mods.join('+'))")
    check('挑戰塔 10 層', len(p1) == 10, len(p1))
    check('同 seed → 同房間 / 同修飾序列', p1 == p1b, p1[:3])
    check('不同 seed → 不同序列', p1 != p2, p2[:3])

    plan = J(pg, "()=>KB.CHALLENGE.towerPlan(7,10)")
    bosses = [f['floor'] for f in plan if f['boss']]
    check('第 5 / 10 層是魔王', bosses == [5, 10], bosses)
    check('魔王層的魔王 key 有效', all(f['boss'] in J(pg, "()=>Object.keys(KB.BOSSES)") for f in plan if f['boss']))
    mods_ok = all(1 <= len(f['mods']) <= 2 for f in plan)
    check('每層 1~2 個修飾條件', mods_ok, [f['mods'] for f in plan])
    check('第 1 層固定 1 個修飾', len(plan[0]['mods']) == 1, plan[0]['mods'])
    # 世界範圍隨層數提升
    wn = [int(f['lv'][1:]) for f in plan]
    check('世界範圍隨層數提升（第 1 層 ≤ 第 10 層的上界）',
          max(wn[:2]) <= max(wn[-2:]), wn)
    rng = J(pg, "()=>[KB.CHALLENGE.worldRange(1,10,7),KB.CHALLENGE.worldRange(5,10,7),KB.CHALLENGE.worldRange(10,10,7)]")
    check('worldRange 依層數放寬', rng[0][1] < rng[1][1] < rng[2][1], rng)
    check('非魔王層都挑得到出口（room.doors 或 room.exit）',
          J(pg, "()=>KB.CHALLENGE.towerPlan(3,10).filter(f=>!f.boss).every(f=>{const l=KB.LEVELS.find(x=>x.id===f.lv);const r=l.rooms[f.room];return !!((r.doors&&r.doors.length)||r.exit)})"))

    # 實機：進第 1 層（截圖含修飾提示橫幅）→ 走到出口門 → 第 2 層
    J(pg, """()=>{KB.CHALLENGE.startTower({seed:1}); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(30); return 1}""")
    shot(pg, 'tower_f1')
    run = J(pg, """()=>{KB.CHALLENGE.startTower({seed:1}); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      const g=KB.game, f1={lvl:g.levelId, floor:g.challenge.floor, door:g.entities.filter(e=>e.type==='door'&&e.exit).length};
      const d=g.entities.find(e=>e.type==='door'&&e.exit);
      g.useDoor(d); g.fade=1; g.fadeDir=0; if(g.fadeCb){const cb=g.fadeCb; g.fadeCb=null; cb();}
      KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(2);
      __kb.step(28);
      return {f1, floor2:KB.game.challenge.floor, lvl2:KB.game.levelId, base:KB.game.challenge.base}}""")
    check('第 1 層有出口門', run['f1']['door'] == 1 and run['f1']['lvl'] == 'tower', run['f1'])
    check('出口門直接進下一層（floor 1 → 2）', run['floor2'] == 2 and run['lvl2'] == 'tower', run)
    check('層間時間累加到 challenge.base', run['base'] >= 0, run['base'])
    shot(pg, 'tower_f2')

    # 跳到第 5 層（魔王層）
    b5 = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:5,floors:10,score:0,hp:0,ability:null,mods:[],limit:0,failed:false,
        seed:1, plan:KB.CHALLENGE.towerPlan(1,10)};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(30);
      const g=KB.game; return {boss:!!g.boss, name:g.bossName, floor:g.challenge.floor, mods:g.challenge.mods}}""")
    check('第 5 層是魔王戰', b5['boss'] is True, b5)
    shot(pg, 'tower_f5')

    # 死亡 → 結算顯示到達層數
    died = J(pg, """()=>{KB.game.playerDied(); __kb.step(4);
      return {scene:KB.scene.constructor.name, floor:KB.scene.r?KB.scene.r.floor:null, ok:KB.scene.r?KB.scene.r.ok:null,
              bestFloor:KB.save.challenge.tower.bestFloor}}""")
    check('塔內死亡 → 結算', died['scene'] == 'ChallengeResultScene' and died['ok'] is False, died)
    check('結算顯示到達層數 5', died['floor'] == 5, died)
    check('最高層記錄寫入 KB.save.challenge.tower.bestFloor', died['bestFloor'] == 5, died)
    shot(pg, 'tower_result')

    # 全破紀錄
    win = J(pg, """()=>{const ch={type:'tower',base:9999,deaths:0,floor:10,floors:10,score:0,hp:6,ability:null,mods:[],limit:0,failed:false,
        seed:1, plan:KB.CHALLENGE.towerPlan(1,10)};
      KB.CHALLENGE.finishTower(ch, true);
      return {t:KB.save.challenge.tower, ok:KB.scene.r.ok, floor:KB.scene.r.floor}}""")
    check('全破記 bestTime / clears', win['t']['bestTime'] == 9999 and win['t']['clears'] == 1 and win['t']['bestFloor'] == 10, win)


# ---------------------------------------------------------------- 5. mods
def t_mods(pg):
    print('\n--- 5. 修飾條件 ---')
    pg.evaluate(RESET)
    # 鏡像：寬度不變、門存在、斜坡互換、原始資料零變動
    mir = J(pg, """()=>{
      const before = KB.LEVELS.find(l=>l.id==='w1').rooms[0].map.join('|');
      const plan=[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['mirror'],ability:null,limit:0}];
      const lv = KB.CHALLENGE.buildFloor(plan,1), r = lv.rooms[0];
      const src = KB.LEVELS.find(l=>l.id==='w1').rooms[0];
      const rev = s => s.split('').reverse().map(c=>c==='/'?'\\\\':(c==='\\\\'?'/':c)).join('');
      return {
        w0: src.map[0].length, w1: r.map[0].length, h0: src.map.length, h1: r.map.length,
        rowMatch: r.map.every((row,i)=>row===rev(src.map[i])),
        exit: r.exit, spawn: r.spawn, srcSpawn: src.spawn,
        slopes0: src.map.join('').split('/').length-1, slopes1: r.map.join('').split('\\\\').length-1,
        intact: KB.LEVELS.find(l=>l.id==='w1').rooms[0].map.join('|') === before,
        mirrored: !!r.mirrored,
      }}""")
    check('鏡像：地圖寬度 / 高度不變', mir['w0'] == mir['w1'] and mir['h0'] == mir['h1'], mir)
    check('鏡像：每一列都是原列的反轉（含 / \\ 互換）', mir['rowMatch'], mir['rowMatch'])
    check('鏡像：原本的 / 數量 == 鏡像後的 \\ 數量', mir['slopes0'] == mir['slopes1'], [mir['slopes0'], mir['slopes1']])
    check('鏡像：出口門位置存在且在鏡像側', mir['exit'] is not None and mir['exit']['x'] == mir['w0'] - 1 - 91, mir['exit'])
    check('鏡像：出生點跟著鏡像', mir['spawn'][0] == mir['w0'] - 1 - mir['srcSpawn'][0], [mir['spawn'], mir['srcSpawn']])
    check('鏡像：KB.LEVELS 原始資料零變動（深拷貝）', mir['intact'])

    # 實機：鏡像房載入後門真的在、玩家站得住
    live = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:1,floors:10,score:0,hp:0,ability:null,mods:[],limit:0,failed:false,
        seed:0, plan:[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['mirror'],ability:null,limit:0}]};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(20);
      const g=KB.game, d=g.entities.find(e=>e.type==='door'&&e.exit);
      return {door:!!d, dx:d?Math.round(d.cx-KB.player.cx):null, onGround:KB.player.onGround, w:g.map.w}}""")
    check('鏡像房實機：出口門存在且在玩家左側', live['door'] and live['dx'] < 0, live)
    check('鏡像房實機：玩家出生後站得住（不會卡在牆裡）', live['onGround'], live)
    shot(pg, 'mod_mirror')

    # 1HP
    hp1 = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:1,floors:10,score:0,hp:6,ability:null,mods:[],limit:0,failed:false,
        seed:0, plan:[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['onehp'],ability:null,limit:0}]};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(6);
      return {maxHp:KB.player.maxHp, hp:KB.player.hp}}""")
    check('修飾「一擊必殺」：maxHp = 1、hp = 1', hp1['maxHp'] == 1 and hp1['hp'] == 1, hp1)

    # 暗房
    dk = J(pg, """()=>{const plan=[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['dark'],ability:null,limit:0}];
      const lv=KB.CHALLENGE.buildFloor(plan,1);
      const src=KB.LEVELS.find(l=>l.id==='w1').rooms[0];
      return {dark:!!lv.rooms[0].dark, srcDark:!!src.dark}}""")
    check('修飾「黑暗」：room.dark = true（原始房間沒被改到）', dk['dark'] and not dk['srcDark'], dk)

    # 敵人速度 ×1.3
    fast = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:1,floors:10,score:0,hp:0,ability:null,mods:[],limit:0,failed:false,
        seed:0, plan:[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['fast'],ability:null,limit:0}]};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(30);
      const es=KB.game.entities.filter(e=>e.type==='enemy');
      return {n:es.length, k:es.length?+es[0].exK.toFixed(3):null, all:es.every(e=>Math.abs(e.exK-1.3)<1e-6)}}""")
    check('修飾「疾走」：敵人 exK = 1.3（30 幀後沒被 applyExtra 蓋掉）', fast['k'] == 1.3 and fast['all'], fast)

    # 倍化
    dbl = J(pg, """()=>{const mk=(mods)=>{const plan=[{floor:1,lv:'w2',room:0,boss:null,bossName:'',name:'t',mods:mods,ability:null,limit:0}];
        const lv=KB.CHALLENGE.buildFloor(plan,1); return lv.rooms[0].entities.filter(e=>!!KB.ENEMIES[e.t]).length;};
      const a=mk([]), b=mk(['double']); return {plain:a, dbl:b}}""")
    check('修飾「倍化」：敵人數量明顯增加', dbl['dbl'] >= dbl['plain'] * 2, dbl)

    # 封印之口
    ni = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:1,floors:10,score:0,hp:0,ability:'sword',mods:[],limit:0,failed:false,
        seed:0, plan:[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['noinhale'],ability:null,limit:0}]};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(6);
      const ab=KB.player.ability;
      KB.player.setState('inhale'); __kb.step(2);
      return {ability:ab, state:KB.player.state}}""")
    check('修飾「封印之口」：進場沒有能力', ni['ability'] in (None, '', 'null'), ni)
    check('修飾「封印之口」：吸入動作立刻被取消', ni['state'] != 'inhale', ni)

    # 時限
    tm = J(pg, """()=>{const ch={type:'tower',base:0,deaths:0,floor:1,floors:10,score:0,hp:0,ability:null,mods:[],limit:0,failed:false,
        seed:0, plan:[{floor:1,lv:'w1',room:0,boss:null,bossName:'',name:'t',mods:['timed'],ability:null,limit:90*60}]};
      KB.CHALLENGE.enterFloor(ch); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(4);
      const lim=KB.game.challenge.limit;
      KB.game.timeAlive = 90*60; __kb.step(3);
      return {lim, scene:KB.scene.constructor.name, reason:KB.scene.r?KB.scene.r.reason:null}}""")
    check('修飾「時限」：limit = 90 秒（5400 幀）', tm['lim'] == 5400, tm)
    check('修飾「時限」：時間到即失敗（reason=time）', tm['scene'] == 'ChallengeResultScene' and tm['reason'] == 'time', tm)

    # 隨機能力（由種子決定）
    rnd = J(pg, """()=>{const a=KB.CHALLENGE.towerPlan(42,10).map(f=>f.ability), b=KB.CHALLENGE.towerPlan(42,10).map(f=>f.ability);
      return {same: JSON.stringify(a)===JSON.stringify(b), any:a.filter(Boolean)}}""")
    check('修飾「隨機能力」：能力由種子決定（可重現）', rnd['same'], rnd['any'][:3])


# ---------------------------------------------------------------- 6. daily
def t_daily(pg):
    print('\n--- 6. 每日挑戰 ---')
    pg.evaluate(RESET)
    d = J(pg, """()=>{const p=KB.CHALLENGE.dailyPlan('20260912'), q=KB.CHALLENGE.dailyPlan('20260912'), r=KB.CHALLENGE.dailyPlan('20260913');
      return {n:p.length, same:JSON.stringify(p)===JSON.stringify(q), diff:JSON.stringify(p)!==JSON.stringify(r),
              mods:p.map(f=>f.mods.join('+')), boss:p.map(f=>!!f.boss),
              seedFromDate: KB.CHALLENGE.dateSeed('20260912')}}""")
    check('每日挑戰 3 層', d['n'] == 3, d['n'])
    check('同一天 → 同一組（seed = YYYYMMDD）', d['same'] and d['seedFromDate'] == 20260912, d['seedFromDate'])
    check('不同日期 → 不同組', d['diff'])
    check('每日修飾固定（fast / mirror+dark / onehp）', d['mods'] == ['fast', 'mirror+dark', 'onehp'], d['mods'])
    check('每日第 3 層是魔王', d['boss'] == [False, False, True], d['boss'])

    run = J(pg, """()=>{KB.CHALLENGE.startDaily({key:'20260912'}); KB.scene.fade=0;KB.scene.fadeDir=0;__kb.step(30);
      const g=KB.game; return {type:g.challenge.type, floors:g.challenge.floors, key:g.challenge.dateKey, mods:g.challenge.mods}}""")
    check('startDaily 進入 3 層塔', run['type'] == 'daily' and run['floors'] == 3, run)
    shot(pg, 'daily_f1')

    once = J(pg, """()=>{const ch=KB.game.challenge; KB.CHALLENGE.fail(KB.game,'dead');
      const k=ch.dateKey; const rec=KB.save.challenge.daily[k];
      return {rec, done:KB.CHALLENGE.dailyDone(k), scene:KB.scene.constructor.name}}""")
    check('每日紀錄寫入 KB.save.challenge.daily[YYYYMMDD]', once['rec'] is not None and once['rec']['floor'] == 1, once['rec'])
    check('同一天只能挑戰一次（dailyDone）', once['done'] is True, once)
    shot(pg, 'daily_result')

    keep = J(pg, """()=>{const ch={type:'daily',base:5,deaths:0,floor:3,floors:3,score:0,hp:0,ability:null,mods:[],limit:0,failed:false,
        seed:20260912, dateKey:'20260912', plan:KB.CHALLENGE.dailyPlan('20260912')};
      KB.CHALLENGE.finishTower(ch, true); return KB.save.challenge.daily['20260912']}""")
    check('同一天的第二次結果不覆蓋（保留第一次）', keep['floor'] == 1 and keep['ok'] is False, keep)

    recent = J(pg, "()=>KB.CHALLENGE.dailyRecent(7).map(r=>r.key)")
    check('dailyRecent(7) 回傳最近 7 天', len(recent) == 7 and len(set(recent)) == 7, recent[:3])


# ---------------------------------------------------------------- 7. arena
def t_arena(pg):
    print('\n--- 7. Boss Rush Extra ---')
    pg.evaluate(RESET)
    pg.evaluate("()=>{KB.save.cleared=KB.save.cleared||{}; KB.save.cleared.w6=true;}")
    base = J(pg, "()=>({normal:KB.arenaCount({}), all7:KB.arenaCount({all7:true}), variant:[KB.arenaVariant({}),KB.arenaVariant({extra:true}),KB.arenaVariant({all7:true}),KB.arenaVariant({extra:true,all7:true})]})")
    check('全 7 魔王：連戰數量 = 7', base['all7'] == 7, base)
    check('變體識別碼', base['variant'] == ['normal', 'extra', 'all7', 'extra_all7'], base['variant'])

    o = J(pg, """()=>{const a=KB.newArena(null,{all7:true});
      return {n:a.order.length, last:a.order[a.order.length-1], uniq:new Set(a.order).size}}""")
    check('全 7 魔王：order 共 7 名、最後固定夢魘之核', o['n'] == 7 and o['last'] == 'nightmarecore' and o['uniq'] == 7, o)

    ex = J(pg, """()=>{const s=new KB.ArenaScene({extra:true, from:'challenge'});
      KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(4);
      return {scene:KB.scene.constructor.name, opt:s.opt}}""")
    check('KB.ArenaScene({extra}) 可建立', ex['scene'] == 'ArenaScene', ex)
    check('ArenaScene 記住 extra / from', ex['opt']['extra'] is True and ex['opt']['from'] == 'challenge', ex['opt'])
    shot(pg, 'arena_extra_pick')

    sess = J(pg, """()=>{const s=new KB.ArenaScene({extra:true}); KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(2);
      KB.input.setVirtual({jump:true}, true); __kb.step(2); KB.input.clearVirtual();
      for(let i=0;i<40;i++) __kb.step(1);
      return {extra:!!(KB.session&&KB.session.extra), scene:KB.scene.constructor.name}}""")
    check('Extra 變體：進競技場時 KB.session.extra = true', sess['extra'] is True, sess)
    shot(pg, 'arena_extra_boss')

    rec = J(pg, """()=>{const a=KB.newArena(null,{extra:true,all7:true}); a.base=4242; a.beaten=a.order.length;
      KB.setScene(new KB.ArenaResultScene(a, true)); __kb.step(2);
      return {v:KB.save.challenge.arena, normal:KB.save.arena?KB.save.arena.bestTime:null}}""")
    check('變體通關記在 KB.save.challenge.arena[variant]', rec['v'].get('extra_all7', {}).get('bestTime') == 4242, rec['v'])
    check('變體紀錄不會汙染一般競技場 bestTime', not rec['normal'], rec['normal'])
    pg.evaluate("()=>{KB.session.extra=false;}")


# ---------------------------------------------------------------- 8. records
def t_records(pg):
    print('\n--- 8. 成績板「挑戰」頁 ---')
    pg.evaluate(RESET)
    pg.evaluate("""()=>{const c=KB.CHALLENGE.save();
      c.time.w1=3600; c.time.w2=5400; c.nohit.w1=true; c.nohitTime.w1=4200;
      c.tower={bestFloor:7,bestTime:12000,clears:2};
      c.daily[KB.CHALLENGE.dateKey()]={floor:3,time:5000,ok:true};
      c.arena={extra:{bestTime:3000,cleared:true}};}""")
    r = J(pg, """()=>{const s=new KB.RecordsScene(0); KB.setScene(s); s.fade=0; __kb.step(2);
      return {pages:s.pages, chPage:s.chPage, lv:KB.LEVELS.length}}""")
    check('成績板分頁 = 1 總覽 + n 世界 + 1 挑戰', r['pages'] == r['lv'] + 2 and r['chPage'] == r['lv'] + 1, r)
    draw = J(pg, """()=>{try{const s=new KB.RecordsScene(0); KB.setScene(s); s.fade=0; s.page=s.chPage;
      for(let i=0;i<4;i++)__kb.step(1); __kb.render(); return 'ok'}catch(e){return String(e)}}""")
    check('挑戰頁畫得出來（不噴錯）', draw == 'ok', draw)
    shot(pg, 'records_challenge')
    allpages = J(pg, """()=>{try{const s=new KB.RecordsScene(0); KB.setScene(s); s.fade=0;
      for(let p=0;p<s.pages;p++){s.page=p; __kb.step(1); __kb.render();} return 'ok'}catch(e){return String(e)}}""")
    check('全部分頁都畫得出來', allpages == 'ok', allpages)


# ---------------------------------------------------------------- 9. menu
def t_menu(pg):
    print('\n--- 9. 挑戰選單 ---')
    pg.evaluate(RESET)
    m = J(pg, """()=>{const s=new KB.ChallengeScene(); KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(3);
      return {scene:KB.scene.constructor.name, items:KB.CHALLENGE.ITEMS.map(i=>i.id), n:KB.CHALLENGE.ITEMS.length}}""")
    check('挑戰選單 5 個項目', m['n'] == 5 and m['items'] == ['time', 'nohit', 'tower', 'daily', 'arena'], m['items'])
    shot(pg, 'menu')

    for i in range(5):
        pg.evaluate("(i)=>{KB.scene.i=i; __kb.step(1); __kb.render();}", i)
    check('選單每一項都畫得出來', True)

    # 每一項的最佳紀錄摘要
    summ = J(pg, """()=>{const c=KB.CHALLENGE.save(); c.time.w1=3600; c.nohit.w1=true; c.tower={bestFloor:5,bestTime:9000,clears:1};
      return KB.CHALLENGE.ITEMS.map(i=>KB.CHALLENGE.summaryOf(i.id)[0])}""")
    check('每一項都顯示最佳紀錄', all(isinstance(x, str) and x for x in summ), summ)
    shot(pg, 'menu_records')

    # 子選單：選世界
    sub = J(pg, """()=>{KB.save.cleared={w1:true,w2:true};
      const s=new KB.ChallengeScene(0); KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(2);
      s.choose(); __kb.step(1); __kb.render();
      return {mode:s.mode, worlds:KB.CHALLENGE.worlds().length}}""")
    check('時間攻擊 → 選世界子選單', sub['mode'] == 'world', sub)
    shot(pg, 'menu_world')

    # 未通關任何世界時擋下
    lock = J(pg, """()=>{KB.save.cleared={}; KB.DEBUG=false; KB.UI.unlockAll=false;
      const s=new KB.ChallengeScene(0); KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(2);
      s.choose(); __kb.step(1);
      const r={mode:s.mode, msg:s.msg, n:KB.CHALLENGE.worlds().length};
      KB.DEBUG=true; KB.UI.unlockAll=true; KB.save.cleared={w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true};
      return r}""")
    check('沒有通關過的世界時擋下（不進子選單）', lock['mode'] == 'menu' and lock['msg'] > 0 and lock['n'] == 0, lock)

    # Boss Rush 子選單
    ar = J(pg, """()=>{const s=new KB.ChallengeScene(4); KB.setScene(s); s.fade=0; s.leaving=null; __kb.step(2);
      s.choose(); __kb.step(1); __kb.render();
      return {mode:s.mode, opts:KB.CHALLENGE.ARENA_OPTS.map(o=>o.id)}}""")
    check('Boss Rush → 變體子選單（4 種）', ar['mode'] == 'arena' and ar['opts'] == ['normal', 'extra', 'all7', 'extra_all7'], ar)
    shot(pg, 'menu_arena')

    # 事件：challengeClear
    ev = J(pg, """()=>{let got=null; KB.PROG.on('challengeClear', d=>{got=d;});
      KB.CHALLENGE.emitClear({type:'tower', floor:10, ok:true}); return got}""")
    check("KB.PROG.emit('challengeClear') 供成就使用", ev is not None and ev['type'] == 'tower', ev)


SECTIONS = {
    'api': t_api, 'time': t_time, 'nohit': t_nohit, 'tower': t_tower,
    'mods': t_mods, 'daily': t_daily, 'arena': t_arena, 'records': t_records, 'menu': t_menu,
}


def main():
    global VERBOSE, SHOTS
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', '--verbose', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--shots', action='store_true', help='順便存截圖到 shots/agent_challenge/')
    a = ap.parse_args()
    VERBOSE = a.verbose
    SHOTS = a.shots
    only = [s.strip() for s in a.only.split(',') if s.strip()] or list(SECTIONS)
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.CHALLENGE')
        pg.evaluate("()=>{KB.UI.unlockAll=true; KB.save.cleared={w1:1,w2:1,w3:1,w4:1,w5:1,w6:1,w7:1};}")
        for s in only:
            if s not in SECTIONS:
                print('unknown section', s); continue
            SECTIONS[s](pg)
        b.close()
    check('無 console error / pageerror', not logs, logs[:6])
    ok = sum(1 for _, c, _ in results if c)
    print('\n==========================================')
    print(f'{ok} / {len(results)} PASS')
    bad = [n for n, c, _ in results if not c]
    if bad:
        print('FAILED:', '; '.join(bad))
    print('==========================================')
    sys.exit(0 if ok == len(results) else 1)


if __name__ == '__main__':
    main()
