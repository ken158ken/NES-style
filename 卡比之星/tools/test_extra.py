# -*- coding: utf-8 -*-
"""
Extra 模式 / 成績板 / 第 7 節點 / 可燃植被 驗證（Round 7 / agent: extra）

涵蓋：
  1. 疊加層資料（src/levels_extra.js）：KB.EXTRA_LAYERS 每個世界都有、統計數字合理；
     KB.applyRoomLayers 回傳副本、**KB.LEVELS 原始資料一個字都沒變**
  2. Extra 套用實況：同一間房 extra 開 / 關 → 敵人變多、多出尖刺 '^'、多一個隱藏 1UP、補給變少；
     一般層（w4 r0 雲草 / w5 r1 地毯邊）**不看 extra 旗標**，兩種難度都要在
  3. 魔王 Extra 變體（bosses.js / bosses_w6.js）：開場即二階段、maxHp ×1.25、每隻都有新招的狀態
  4. 成績板 KB.RecordsScene：能開、能翻頁、畫得出來、不噴錯；KB.recordOf 讀得到存檔欄位
  5. 通關次數 / 最短時間：game.js levelClear 會累加 KB.save.playCount 並更新 KB.save.bestTime
  6. 選關第 7 節點：注入假 w7 → 7 個節點 / 7 個標籤不重疊；cleared.w6 且大星星 ≥ 15 才解得開
  7. 可燃植被：TileMap.BURN_DECO 的 cloud / dedede 有值、對應的焦黑圖存在，實機點火 → 燃燒 → 蔓延 → 焦黑

用法：python tools/test_extra.py [-v]
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


# 假的第 7 關（world7 agent 還沒交件時用來驗證選關節點 / 解鎖條件；已存在就不重複加）
FAKE_W7 = """() => {
  if (!KB.LEVELS.some(l => l.id === 'w7')) {
    const m = ['################', '#..............#', '#..............#', '#..............#',
               '#..............#', '#..............#', '#..............#', '#..............#',
               '#..............#', '#..............#', '################', '################'];
    KB.LEVELS.push({ id: 'w7', name: '夢幻迴廊', theme: 'dream', music: null, boss: null,
      rooms: [{ map: m, spawn: [3, 9], entities: [], noBoss: true }] });
  }
  return KB.LEVELS.length;
}"""

# 同一間房，extra 開 / 關 各載入一次後的統計
ROOM_STAT = """([lid, room, extra]) => {
  // __kb.goto 的 extra 是「或」上既有 session 的（debug 便利），所以關掉時要先自己清掉
  KB.session = KB.session || {}; KB.session.extra = !!extra;
  __kb.goto('game', { level: lid, room: room, nofade: true, extra: extra });
  __kb.step(2);
  const g = KB.game, ents = g.room.entities || [];
  const SUP = { food: 1, tomato: 1, candy: 1 };
  const count = t => ents.filter(e => e.t === t).length;
  let spikes = 0;
  for (const r of g.room.map) for (const ch of r) if (ch === '^') spikes++;
  return {
    extra: !!KB.session.extra, maxHp: KB.player.maxHp,
    enemies: ents.filter(e => KB.ENEMIES[e.t]).length,
    supplies: ents.filter(e => SUP[e.t]).length,
    oneups: count('oneup'), spikes: spikes,
    deco: (g.room.deco || []).join(''),
  };
}"""

# 魔王：用真實魔王房載入、跑完登場，再觀察 N 幀看得到哪些狀態
BOSS_PROBE = """([lid, room, frames]) => {
  __kb.goto('game', { level: lid, room: room, ability: 'sword', nofade: true, extra: true });
  __kb.step(170);
  const b = KB.game.boss;
  if (!b) return null;
  const out = { name: b.name, phase: b.phase, maxHp: b.maxHp, intro: !!b.introducing, states: [], clones: 0 };
  const seen = {};
  for (let i = 0; i < frames; i++) {
    __kb.step(1);
    const bb = KB.game.boss; if (!bb || bb.dead) break;
    seen[bb.state] = 1; if (bb.partner) seen[bb.partner.state] = 1;
    const n = KB.game.entities.filter(e => !e.dead && e.constructor.name === 'ShadowClone').length;
    if (n > out.clones) out.clones = n;
    if (KB.game.entities.filter(e => !e.dead && e.kind === 'box').length >= 3) seen.__3box = 1;
  }
  out.states = Object.keys(seen);
  return out;
}"""

# 點火：把卡比放在 deco 左邊、給火焰能力、噴一段時間，回傳燃燒 / 焦黑的格子
BURN = """([lid, room, x, y, waitChar]) => {
  __kb.goto('game', { level: lid, room: room, x: x, y: y, ability: 'fire', nofade: true });
  __kb.step(6);
  KB.input.setVirtual({ attack: true }, true);
  __kb.step(70);
  KB.input.setVirtual({}, true);
  const fire = [...KB.game.map.decoFire.keys()];
  __kb.step(waitChar || 0);
  return { fire: fire, char: [...KB.game.map.decoChar.keys()] };
}"""

BOSSES = [
    ('whispywoods', 'w1', 3, 'leafstorm', '龍捲落葉'),
    ('lololo', 'w2', 4, '__3box', '三箱齊推'),
    ('kracko', 'w3', 4, 'tracker', '雷雲追蹤'),
    ('metaknight', 'w4', 4, 'crossslash', '劍氣十字'),
    ('dedede', 'w5', 5, 'quake', '巨鎚震盪波'),
    ('shadowkirby', 'w6', 5, 'split', '影分身 4 隻'),
]


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', '--verbose', action='store_true')
    ap.add_argument('--only', default='', help='只跑某幾段（逗號分隔：layers,rooms,boss,records,play,node,burn）')
    a = ap.parse_args()
    VERBOSE = a.verbose
    only = set(x.strip() for x in a.only.split(',') if x.strip())
    run = lambda k: (not only) or (k in only)

    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')

        def ev(js, arg=None):
            return pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)

        # ============================================================ 1. 疊加層資料
        if run('layers'):
            print('-' * 8, '疊加層資料（src/levels_extra.js）')
            check('KB.EXTRA_LAYERS / KB.NORMAL_LAYERS / KB.applyRoomLayers 都有註冊',
                  ev("()=>!!(KB.EXTRA_LAYERS && KB.NORMAL_LAYERS && KB.applyRoomLayers && KB.extraLayerStats)"))
            st = ev("()=>KB.extraLayerStats()")
            check('每個世界都有 Extra 疊加層（%d 房）' % st['rooms'],
                  all(w in st['byLevel'] for w in ['w1', 'w2', 'w3', 'w4', 'w5', 'w6']), list(st['byLevel']))
            check('每房 +2~4 隻敵人（共 %d 隻 / %d 房）' % (st['enemies'], st['rooms']),
                  all(2 <= v['enemies'] / max(1, v['rooms']) <= 4 for v in st['byLevel'].values()),
                  {k: v['enemies'] for k, v in st['byLevel'].items()})
            check('每房各 1 處尖刺（2 格）與 1 個隱藏 1UP',
                  st['spikes'] == st['rooms'] * 2 and st['oneups'] == st['rooms'], st)
            check('有移除補給（減半）%d 份' % st['removed'], st['removed'] > 0, st)
            # 原始資料不可變
            unchanged = ev("""() => {
              const before = JSON.stringify(KB.LEVELS.map(l => l.rooms.map(r => [r.map, r.deco, (r.entities||[]).length])));
              let copies = 0;
              for (const l of KB.LEVELS) l.rooms.forEach((r, i) => { const c = KB.applyRoomLayers(l.id, i, r, true); if (c !== r) copies++; });
              const after = JSON.stringify(KB.LEVELS.map(l => l.rooms.map(r => [r.map, r.deco, (r.entities||[]).length])));
              return { same: before === after, copies };
            }""")
            check('applyRoomLayers 回傳副本、原始 KB.LEVELS 完全沒被改到（%d 間房有疊加層）' % unchanged['copies'],
                  unchanged['same'] and unchanged['copies'] > 30, unchanged)

        # ============================================================ 2. 實機套用
        if run('rooms'):
            print('-' * 8, 'Extra 疊加層實機套用')
            norm = ev(ROOM_STAT, ['w1', 0, False])
            extra = ev(ROOM_STAT, ['w1', 0, True])
            check('w1 r0 敵人 %d → %d（Extra 變多）' % (norm['enemies'], extra['enemies']),
                  extra['enemies'] > norm['enemies'], [norm['enemies'], extra['enemies']])
            check('w1 r0 尖刺 %d → %d' % (norm['spikes'], extra['spikes']), extra['spikes'] == norm['spikes'] + 2,
                  [norm['spikes'], extra['spikes']])
            check('w1 r0 隱藏 1UP %d → %d' % (norm['oneups'], extra['oneups']), extra['oneups'] == norm['oneups'] + 1,
                  [norm['oneups'], extra['oneups']])
            check('w1 r0 補給 %d → %d（減半）' % (norm['supplies'], extra['supplies']),
                  extra['supplies'] < norm['supplies'], [norm['supplies'], extra['supplies']])
            check('Extra 時卡比 maxHp = 3（player2 的旗標也吃得到）', extra['maxHp'] == 3 and norm['maxHp'] == 6,
                  [norm['maxHp'], extra['maxHp']])
            # 每個世界抽一間房都要變多
            per = []
            for lid in ['w2', 'w3', 'w4', 'w5', 'w6']:
                n = ev(ROOM_STAT, [lid, 0, False])['enemies']
                x = ev(ROOM_STAT, [lid, 0, True])['enemies']
                per.append((lid, n, x))
            check('w2~w6 的 r0 在 Extra 都變多', all(x > n for _, n, x in per), per)
            # 一般層（不看 extra 旗標）
            g4 = [ev(ROOM_STAT, ['w4', 0, e]) for e in (False, True)]
            g5 = [ev(ROOM_STAT, ['w5', 1, e]) for e in (False, True)]
            check('w4 r0 鋪了 6 格可燃雲草 / 雲花（一般層，兩種難度都在）',
                  all(s['deco'].count('g') + s['deco'].count('f') >= 6 for s in g4),
                  [s['deco'].count('g') + s['deco'].count('f') for s in g4])
            check('w5 r1 鋪了 6 格可燃地毯邊（一般層，兩種難度都在）',
                  all(s['deco'].count('v') == 6 for s in g5), [s['deco'].count('v') for s in g5])

        # ============================================================ 3. 魔王 Extra 變體
        if run('boss'):
            print('-' * 8, '魔王 Extra 變體（開場即二階段 + 新招）')
            base = ev("""() => { const out = {}; for (const k in KB.BOSSES) { const B = KB.BOSSES[k];
              const b = new B(0, 0); out[k] = b.maxHp; } return out; }""")
            for key, lid, room, state, cname in BOSSES:
                r = ev(BOSS_PROBE, [lid, room, 900])
                if not r:
                    check('%s Extra 探測' % key, False, 'boss 沒生出來')
                    continue
                want = max(1, round(base.get(key, 40) * 1.25))
                check('%s：登場結束就是二階段（phase=%s）' % (key, r['phase']), r['phase'] == 2 and not r['intro'], r)
                check('%s：maxHp %d → %d（×1.25）' % (key, base.get(key, 0), r['maxHp']), r['maxHp'] == want, r['maxHp'])
                if key == 'shadowkirby':
                    ok = r['clones'] >= 4
                else:
                    ok = state in r['states']
                check('%s：放得出新招「%s」' % (key, cname), ok, r['states'] if key != 'shadowkirby' else r['clones'])

        # ============================================================ 4. 成績板
        if run('records'):
            print('-' * 8, '成績板 KB.RecordsScene')
            ev("""() => {
              KB.save.cleared = { w1: 1, w2: 1 };
              KB.save.best = { w1: 123400 }; KB.save.rank = { w1: 'S' }; KB.save.bestTime = { w1: 4260 };
              KB.save.stars = { w1: [1, 1, 1], w2: [1, 0, 0] }; KB.save.playCount = { w1: 7, w2: 2 };
              KB.save.extraCleared = { w1: true }; KB.save.arena = { bestTime: 11880, cleared: true };
              return true;
            }""")
            rec = ev("()=>KB.recordOf('w1')")
            check('KB.recordOf 讀得到 best / rank / time / stars / plays / extra',
                  rec['best'] == 123400 and rec['rank'] == 'S' and rec['time'] == 4260
                  and rec['stars'] == 3 and rec['plays'] == 7 and rec['extra'], rec)
            su = ev("()=>KB.recordsSummary()")
            check('彙總：競技場最佳時間 / 大星星 / 成就 / 能力發現', su['arena'] == 11880 and su['stars'] == 4
                  and 'ach' in su and 'seen' in su, su)
            logs.clear()
            pages = ev("""() => {
              KB.setScene(new KB.RecordsScene(0));
              const out = [];
              for (let i = 0; i < KB.scene.pages; i++) { KB.scene.page = i; __kb.step(2); __kb.render(); out.push(KB.scene.page); }
              return { pages: KB.scene.pages, visited: out, scene: KB.scene.constructor.name };
            }""")
            check('成績板可開啟、%d 頁全部畫得出來且不噴錯' % pages['pages'],
                  pages['scene'] == 'RecordsScene' and pages['pages'] >= 2 and not logs, [pages, logs[:2]])
            nav = ev("""() => {
              KB.setScene(new KB.RecordsScene(0));
              const tap = k => { KB.input.setVirtual({ [k]: true }, true); KB.input.update(); KB.scene.update(1 / 60);
                                 KB.input.setVirtual({}, true); KB.input.update(); };
              tap('right'); const p1 = KB.scene.page;
              tap('left'); const p0 = KB.scene.page;
              tap('jump'); __kb.step(30);
              return [p1, p0, KB.scene.constructor.name];
            }""")
            check('←→ 換頁、Z 返回標題', nav[0] == 1 and nav[1] == 0 and nav[2] == 'TitleScene', nav)
            check('標題選單有「成績板」項目',
                  ev("()=>{const m=new KB.TitleMenu(); return m.items.map(i=>i.id).includes('records');}"))

        # ============================================================ 5. playCount / bestTime
        if run('play'):
            print('-' * 8, '通關次數 / 最短時間（game.js levelClear）')
            got = ev("""() => {
              KB.save.playCount = {}; KB.save.bestTime = {}; KB.save.extraCleared = {};
              const run = (extra, frames) => {
                __kb.goto('game', { level: 'w1', room: 0, nofade: true, extra: extra });
                __kb.step(2); KB.game.timeAlive = frames; KB.game.levelClear();
              };
              run(false, 5000); const a = { p: KB.save.playCount.w1, t: KB.save.bestTime.w1, e: !!KB.save.extraCleared.w1 };
              run(false, 9000); const c = { p: KB.save.playCount.w1, t: KB.save.bestTime.w1 };
              run(true, 3000); const d = { p: KB.save.playCount.w1, t: KB.save.bestTime.w1, e: !!KB.save.extraCleared.w1 };
              return [a, c, d];
            }""")
            check('通關一次 → playCount 1、bestTime 5000', got[0]['p'] == 1 and got[0]['t'] == 5000, got[0])
            check('再通關（較慢）→ playCount 2、bestTime 不變', got[1]['p'] == 2 and got[1]['t'] == 5000, got[1])
            check('Extra 通關（較快）→ playCount 3、bestTime 3000、extraCleared 記起來',
                  got[2]['p'] == 3 and got[2]['t'] == 3000 and got[2]['e'], got[2])

        # ============================================================ 6. 選關第 7 節點
        if run('node'):
            print('-' * 8, '選關第 7 節點（W7 夢幻迴廊）')
            # 向下相容：暫時把 w7 抽掉，節點數要退回 6（world7 交件前後都要成立）
            n6 = ev("""() => {
              KB.UI.unlockAll = false;
              const i = KB.LEVELS.findIndex(l => l.id === 'w7');
              const saved = i >= 0 ? KB.LEVELS.splice(i, 1)[0] : null;
              const n = new KB.StageSelectScene(0).nodes.length;
              if (saved) KB.LEVELS.splice(i, 0, saved);
              return n;
            }""")
            ev(FAKE_W7)
            info = ev("""() => {
              KB.UI.unlockAll = false;
              KB.save.cleared = { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1 };
              KB.save.stars = { w1: [1,1,1], w2: [1,1,0], w3: [1,1,1], w4: [1,0,0], w5: [1,1,0], w6: [1,0,0] };  // 12 顆
              const sc = new KB.StageSelectScene(0);
              const lb = sc.labels();
              const hit = (a, b) => a[0] < b[0]+b[2] && b[0] < a[0]+a[2] && a[1] < b[1]+b[3] && b[1] < a[1]+a[3];
              let overlap = 0, out = 0;
              for (let i = 0; i < lb.rs.length; i++) {
                const r = lb.rs[i];
                if (r[0] < 4 || r[0] + r[2] > 250 || r[1] < 4 || r[1] + 18 > 157) out++;
                for (let j = i + 1; j < lb.rs.length; j++) if (hit(lb.rs[i], lb.rs[j])) overlap++;
              }
              return { nodes: sc.nodes.length, labels: lb.rs.length, overlap, out,
                       stars: KB.UI.starTotal(), lockedW7: !sc.canEnter(6), moveW7: sc.canMove(6) };
            }""")
            check('沒有 w7 時只有 6 個節點（向下相容）', n6 == 6, n6)
            check('有 w7 時 7 個節點 / 7 個標籤，0 重疊 0 出界',
                  info['nodes'] == 7 and info['labels'] == 7 and info['overlap'] == 0 and info['out'] == 0, info)
            check('大星星 12 < 15 → W7 鎖住（但游標走得過去，看得到解鎖條件）',
                  info['lockedW7'] and info['moveW7'], info)
            open_ = ev("""() => {
              KB.save.stars = { w1: [1,1,1], w2: [1,1,1], w3: [1,1,1], w4: [1,1,1], w5: [1,1,1], w6: [1,1,1] };
              const a = { stars: KB.UI.starTotal(), open: KB.UI.dreamOpen(), enter: new KB.StageSelectScene(0).canEnter(6) };
              KB.save.cleared.w6 = false;
              const b = { open: KB.UI.dreamOpen() };
              KB.save.cleared.w6 = true;
              return [a, b];
            }""")
            check('大星星 18 ≥ 15 且通關 w6 → W7 解鎖', open_[0]['open'] and open_[0]['enter'] and open_[0]['stars'] == 18, open_[0])
            check('沒通關 w6 就算星星夠也不開', not open_[1]['open'], open_[1])
            check('Extra 模式時選關標題有 EXTRA 紅字（畫得出來不噴錯）', ev("""() => {
              KB.session.extra = true; KB.setScene(new KB.StageSelectScene(0)); __kb.step(4); __kb.render();
              KB.session.extra = false; return true; }""") and not logs, logs[:2])
            check('真結局：cleared.w7 → EndingScene 走 TRUE END 版面', ev("""() => {
              KB.save.cleared.w7 = true; const e = new KB.EndingScene(null);
              KB.setScene(e); e.reveal = e.total; __kb.step(4); __kb.render();
              const ok = e.trueEnd; KB.save.cleared.w7 = false; return ok; }"""))

        # ============================================================ 7. 可燃植被
        if run('burn'):
            print('-' * 8, 'w4 / w5 可燃植被')
            bd = ev("()=>KB.TileMap.BURN_DECO")
            check('TileMap.BURN_DECO：cloud=%r dedede=%r' % (bd.get('cloud'), bd.get('dedede')),
                  'g' in (bd.get('cloud') or '') and 'f' in (bd.get('cloud') or '')
                  and 'k' in (bd.get('dedede') or '') and 'v' in (bd.get('dedede') or ''), bd)
            spr = ev("()=>['deco_cloud_g','deco_cloud_f','deco_dedede_v','deco_cloud_g_burnt','deco_cloud_f_burnt',"
                     "'deco_dedede_v_burnt','deco_dedede_k_burnt'].filter(n=>!KB.has(n))")
            check('雲草 / 雲花 / 地毯邊 與對應焦黑圖都有註冊', spr == [], spr)
            w4 = ev(BURN, ['w4', 0, 66, 9, 260])
            check('w4 r0：噴火點燃雲草並往兩側蔓延（%d 格）' % len(w4['fire']), len(w4['fire']) >= 4, w4['fire'])
            check('w4 r0：燒完變焦黑（%d 格）' % len(w4['char']), len(w4['char']) >= 4, w4['char'])
            w5 = ev(BURN, ['w5', 1, 68, 9, 0])
            check('w5 r1：噴火點燃地毯邊（%d 格）' % len(w5['fire'] + w5['char']), len(w5['fire'] + w5['char']) >= 4,
                  [w5['fire'], w5['char']])

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
