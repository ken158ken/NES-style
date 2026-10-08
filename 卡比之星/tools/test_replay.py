# -*- coding: utf-8 -*-
"""幽靈重播 / 定幀確定性 / 關卡計時排行 自動測試（Round 12・K12-2 ghost-replay）

跑的東西（全部在 Chromium 裡用真的遊戲引擎跑，不是模型）：
  A. PRNG            KB.RNG 種子可重現、不同種子不同序列、模擬結束會還原 Math.random
  B. 定幀確定性      同種子 + 同輸入序列跑兩次 ⇒ 逐幀雜湊 / 逐幀座標完全相同
  C. 輸入快照 / 注入 KB.input.maskNow / applyReplay / endReplay 的 down・pressed・released 語意
  D. 壓縮往返        輸入 RLE、幽靈軌跡位元打包的往返一致與體積（5 分鐘 < 50KB）
  E. 排行插入排序    每關最佳 5 筆，較快的插前面、第 6 筆擠掉最後一筆
  F. 幽靈同步        重播同一串輸入時，幽靈座標與本體逐幀誤差 0
  G. 播放 / 快轉     watch / setSpeed（×1 ×2 ×4 ×8）/ 跳過 / 播放中不寫存檔
  H. 整合            真的玩 → 通關 → 寫排行 + localStorage 重播；Extra 另一份；競技場不錄

用法：python tools/test_replay.py [--shots]
"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots' / 'replay'
WANT_SHOTS = '--shots' in sys.argv

# 位元順序＝KB.input.ACTIONS
L, R, U, D, J, A, S, T = (1 << i for i in range(8))

results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + ('  ' + str(info) if info != '' else ''))


def scenario(n=600):
    """一段會用到走 / 跳 / 吸入 / 飛行的固定輸入序列"""
    out = []
    for i in range(n):
        m = 0
        if (i // 40) % 3 != 2: m |= R
        if i % 37 == 0: m |= J
        if 0 <= i % 53 < 6: m |= A
        if 0 <= i % 97 < 3: m |= U
        out.append(m)
    return out


def main():
    logs = []
    MASKS = scenario(600)
    SHORT = scenario(180)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.REPLAY && KB.RNG')
        ev = lambda js, arg=None: (pg.evaluate(js, arg) if arg is not None else pg.evaluate(js))
        ev("()=>{KB.UI.unlockAll=true; KB.REPLAY.clear(); return 1}")

        def shot(name):
            if not WANT_SHOTS: return
            SHOTS.mkdir(parents=True, exist_ok=True)
            pg.evaluate("()=>__kb.render()")
            pg.screenshot(path=str(SHOTS / (name + '.png')))

        # ------------------------------------------------ A. PRNG
        print('-' * 8, 'A. 遊戲內 PRNG')
        r = ev("""()=>{
          KB.RNG.seed(4242); const a=[]; for(let i=0;i<5;i++) a.push(KB.RNG.random());
          KB.RNG.seed(4242); const b=[]; for(let i=0;i<5;i++) b.push(KB.RNG.random());
          KB.RNG.seed(4243); const c=[]; for(let i=0;i<5;i++) c.push(KB.RNG.random());
          return {a,b,c, inRange:a.every(v=>v>=0&&v<1)};
        }""")
        check('A1 同種子連續 5 個亂數完全相同', r['a'] == r['b'], r['a'][:2])
        check('A2 不同種子第 1 個亂數不同', r['a'][0] != r['c'][0], [r['a'][0], r['c'][0]])
        check('A3 亂數落在 [0,1)', r['inRange'])
        check('A4 seed() 會把 calls() 歸零', ev("()=>{KB.RNG.seed(9); const z=KB.RNG.calls(); KB.RNG.random(); return [z,KB.RNG.calls()];}") == [0, 1])
        check('A5 平時 Math.random 未被換掉（模擬外 RNG.on() 為 false）', ev("()=>KB.RNG.on()") is False)

        # ------------------------------------------------ B. 定幀確定性
        print('-' * 8, 'B. 定幀確定性（同種子 + 同輸入 ⇒ 逐幀相同）')
        a = ev("(o)=>KB.REPLAY.simulate(o)", {'levelId': 'w1', 'seed': 777, 'masks': MASKS, 'trace': True, 'record': True})
        b2 = ev("(o)=>KB.REPLAY.simulate(o)", {'levelId': 'w1', 'seed': 777, 'masks': MASKS, 'trace': True})
        diff = next((i for i in range(min(len(a['fh']), len(b2['fh']))) if a['fh'][i] != b2['fh'][i]), -1)
        check('B1 兩次模擬的總雜湊相同', a['hash'] == b2['hash'], [a['hash'], b2['hash']])
        check('B2 兩次模擬的 PRNG 呼叫次數相同', a['rngCalls'] == b2['rngCalls'], [a['rngCalls'], b2['rngCalls']])
        check('B3 逐幀雜湊完全相同（第一個相異幀 = -1）', diff == -1, diff)
        check('B4 逐幀座標完全相同', a['x'] == b2['x'] and a['y'] == b2['y'], [len(a['x']), a['x'][-1], a['y'][-1]])
        check('B5 模擬期間確實用到 PRNG（不是沒有亂數才「確定」）', a['rngCalls'] > 20, a['rngCalls'])
        c = ev("(o)=>KB.REPLAY.simulate(o)", {'levelId': 'w1', 'seed': 20251008, 'masks': MASKS})
        check('B6 換種子 ⇒ 結果不同（粒子 / 敵人亂數有吃到種子）', a['hash'] != c['hash'], [a['hash'], c['hash']])
        d = ev("(o)=>KB.REPLAY.simulate(o)", {'levelId': 'w1', 'seed': 777, 'masks': [m ^ R for m in MASKS]})
        check('B7 換輸入 ⇒ 結果不同', a['hash'] != d['hash'], [a['hash'], d['hash']])
        check('B8 模擬跑完 Math.random 已還原', ev("()=>KB.RNG.on()") is False)
        check('B9 模擬有真的跑滿 600 幀', a['n'] == 600, a['n'])

        # ------------------------------------------------ C. 輸入快照 / 注入
        print('-' * 8, 'C. 每幀輸入快照與重播注入')
        mm = ev("()=>{const I=KB.input; I.endReplay(); I.applyReplay(0); I.applyReplay((1<<1)|(1<<4)); return {m:I.maskNow(), names:I.maskNames(I.maskNow()), right:I.down('right'), jump:I.down('jump'), left:I.down('left')};}")
        check('C1 maskNow() 位元對應 ACTIONS（right|jump）', mm['m'] == (R | J), mm['m'])
        check('C2 maskNames() 轉得回動作名', sorted(mm['names']) == ['jump', 'right'], mm['names'])
        check('C3 注入後 down() 正確', mm['right'] and mm['jump'] and not mm['left'])
        pr = ev("""()=>{const I=KB.input; I.endReplay();
          I.applyReplay(1<<4); const a=I.pressed('jump');
          I.applyReplay(1<<4); const b=I.pressed('jump');
          I.applyReplay(0);    const c=I.released('jump'), d=I.pressed('jump');
          I.applyReplay(0);    const e=I.released('jump');
          return [a,b,c,d,e];}""")
        check('C4 pressed() 只在按下那一幀為 true', pr[0] is True and pr[1] is False and pr[3] is False, pr)
        check('C5 released() 只在放開那一幀為 true', pr[2] is True and pr[4] is False, pr)
        check('C6 endReplay() 清空所有按鍵', ev("()=>{const I=KB.input; I.applyReplay(255); I.endReplay(); return KB.input.ACTIONS.every(n=>!I.down(n)&&!I.pressed(n));}"))
        check('C7 replaying() 旗標正確', ev("()=>{const I=KB.input;I.applyReplay(0);const a=I.replaying();I.endReplay();return [a,I.replaying()];}") == [True, False])
        check('C8 srcDown() 讀的是硬體來源（重播注入不影響）', ev("()=>{const I=KB.input;I.endReplay();I.applyReplay(255);return [I.down('right'), I.srcDown('right')];}") == [True, False])

        # ------------------------------------------------ D. 壓縮往返
        print('-' * 8, 'D. 壓縮（RLE / 位元打包）往返與體積')
        rt = ev("""()=>{
          const ms=[]; for(let i=0;i<5000;i++) ms.push((i%37===0)?(i%256):((i>>3)&255));
          const by=KB.REPLAY.encInputs(ms), back=KB.REPLAY.decInputs(by, ms.length);
          let ok=true; for(let i=0;i<ms.length;i++) if(ms[i]!==back[i]){ok=false;break;}
          return {ok, raw:ms.length, rle:by.length};
        }""")
        check('D1 輸入 RLE 往返 5000 幀完全一致', rt['ok'], rt)
        check('D2 輸入 RLE 有壓縮（< 原始 50%）', rt['rle'] < rt['raw'] * 0.5, rt)
        big = ev("""()=>{
          const r={lv:'w1',key:'w1',sd:1,masks:[],gx:[],gy:[],gd:[],ga:[],names:['kirby_walk','kirby_jump'],fps:[8,1],idx:{},n:0,deaths:2,lives:4,
                   st:{room:0},ev:{},time:18000,ability:'fire',date:'2026-10-08'};
          let x=100,y=200;
          for(let i=0;i<18000;i++){ x+=((i%7)-3); y+=((i%5)-2); if(x<0)x=0; if(y<0)y=0;
            r.masks.push((i>>4)&255); r.gx.push(x); r.gy.push(y); r.gd.push(i&1); r.ga.push((i>>6)&1); r.n++; }
          const s=JSON.stringify(KB.REPLAY.encode(r)), d=KB.REPLAY.decode(s);
          let gok=true, mok=true;
          for(let i=0;i<18000;i++){
            if(d.gx[i]!==r.gx[i]||d.gy[i]!==r.gy[i]||d.gd[i]!==r.gd[i]||d.ga[i]!==r.ga[i]) {gok=false;break;}
            if(d.masks[i]!==r.masks[i]) {mok=false;break;}
          }
          return {bytes:s.length, kb:+(s.length/1024).toFixed(1), gok, mok, n:d.n, gn:d.gn, an:d.an};
        }""")
        check('D3 幽靈軌跡位元打包往返 18000 幀完全一致', big['gok'], big['kb'])
        check('D4 輸入串往返 18000 幀完全一致', big['mok'])
        check('D5 5 分鐘（18000 幀）單關重播 < 50KB', big['bytes'] < 50 * 1024, str(big['kb']) + 'KB')
        check('D6 平均 < 3 byte/幀', big['bytes'] / 18000 < 3, round(big['bytes'] / 18000, 2))
        check('D7 精靈名表有存進重播', big['an'] == ['kirby_walk', 'kirby_jump'], big['an'])
        check('D8 decode 回來的幀數正確', big['n'] == 18000 and big['gn'] == 18000, [big['n'], big['gn']])
        check('D9 decode 擋得住壞資料', ev("()=>[KB.REPLAY.decode('{'), KB.REPLAY.decode('{\"v\":99}')]") == [None, None])

        # ------------------------------------------------ E. 排行插入排序
        print('-' * 8, 'E. 關卡計時排行（最佳 5 筆，插入排序）')
        bd = ev("""()=>{
          KB.REPLAY.clear();
          const K='ttest', at=[];
          at.push(KB.REPLAY.addEntry(K,{t:3000,d:'2026-10-01',ab:'fire',de:1}));
          at.push(KB.REPLAY.addEntry(K,{t:2000,d:'2026-10-02',ab:'sword',de:0}));
          at.push(KB.REPLAY.addEntry(K,{t:4000,d:'2026-10-03',ab:'ice',de:2}));
          at.push(KB.REPLAY.addEntry(K,{t:5000,d:'2026-10-04',ab:'beam',de:3}));
          at.push(KB.REPLAY.addEntry(K,{t:6000,d:'2026-10-05',ab:'stone',de:4}));
          const full=KB.REPLAY.board(K).map(e=>e.t);
          const slow=KB.REPLAY.addEntry(K,{t:9999,d:'2026-10-06',ab:'bow',de:9});
          const afterSlow=KB.REPLAY.board(K).map(e=>e.t);
          const fast=KB.REPLAY.addEntry(K,{t:1000,d:'2026-10-07',ab:'ninja',de:0});
          const afterFast=KB.REPLAY.board(K);
          return {at, full, slow, afterSlow, fast, afterFast, len:afterFast.length};
        }""")
        check('E1 第 1 筆名次 0', bd['at'][0] == 0, bd['at'])
        check('E2 較快的插到前面（名次 0）', bd['at'][1] == 0, bd['at'])
        check('E3 較慢的往後排', bd['at'][2] == 2 and bd['at'][3] == 3 and bd['at'][4] == 4, bd['at'])
        check('E4 排行依時間遞增', bd['full'] == sorted(bd['full']), bd['full'])
        check('E5 最多保留 5 筆', len(bd['full']) == 5 and bd['len'] == 5, [len(bd['full']), bd['len']])
        check('E6 第 6 筆比最後一名慢 ⇒ 不入榜（-1）', bd['slow'] == -1, bd['slow'])
        check('E7 不入榜時排行完全不變', bd['afterSlow'] == bd['full'], bd['afterSlow'])
        check('E8 更快的紀錄擠掉最後一名', bd['fast'] == 0 and bd['afterFast'][0]['t'] == 1000 and 6000 not in [e['t'] for e in bd['afterFast']], [e['t'] for e in bd['afterFast']])
        e0 = bd['afterFast'][0]
        check('E9 排行欄位（日期 / 能力 / 死亡數）都有保存', e0['d'] == '2026-10-07' and e0['ab'] == 'ninja' and e0['de'] == 0, e0)
        check('E10 排行寫進 localStorage', ev("()=>{const o=JSON.parse(localStorage.getItem('kirbystar_replay')||'{}'); return !!(o.boards&&o.boards.ttest&&o.boards.ttest.length===5);}"))

        # ------------------------------------------------ F. 幽靈同步
        print('-' * 8, 'F. 幽靈同步（位置誤差 0）')
        check('F1 錄製的軌跡幀數 == 模擬幀數', a['recFrames'] == a['n'], [a['recFrames'], a['n']])
        check('F2 重播有產生出重播字串', isinstance(a.get('replay'), str) and len(a['replay']) > 100, len(a.get('replay') or ''))
        g1 = ev("([o,s])=>KB.REPLAY.simulate(Object.assign({},o,{ghostCheck:s}))",
                [{'levelId': 'w1', 'seed': 777, 'masks': MASKS}, a['replay']])
        check('F3 幽靈與本體逐幀位置誤差 0', g1['maxErr'] == 0, g1['maxErr'])
        check('F4 逐幀都有比對到（比對幀數 = 600）', g1['cmp'] == 600, g1['cmp'])
        bad = MASKS[:100] + [m ^ R for m in MASKS[100:]]
        g2 = ev("([o,s])=>KB.REPLAY.simulate(Object.assign({},o,{ghostCheck:s}))",
                [{'levelId': 'w1', 'seed': 777, 'masks': bad}, a['replay']])
        check('F5 輸入一改幽靈就對不上（證明 F3 不是恆真）', g2['maxErr'] > 0, g2['maxErr'])

        # 幽靈實際繪製（錄 → 再玩 → drawGhost 有畫 / 關掉就不畫）
        gd = ev("""()=>{
          KB.REPLAY.clear();
          __kb.goto('game',{level:'w1',nofade:true,ability:'fire'});
          __kb.press({right:true}); __kb.step(200); __kb.release(); __kb.step(2);
          KB.game.timeAlive=2000; KB.game.levelClear();
          __kb.goto('game',{level:'w1',nofade:true,ability:'fire'});
          __kb.step(40);
          const probe=()=>{ const cam={x:Math.round(KB.game.cam.x),y:Math.round(KB.game.cam.y)};
            const g=new KB.G(KB.ctx,cam); let n=0; const old=KB.drawSpr;
            KB.drawSpr=function(){n++; return old.apply(this,arguments);};
            KB.REPLAY.drawGhost(g,KB.ctx,KB.game); KB.drawSpr=old; return n; };
          KB.REPLAY.setGhost(true); const on=probe();
          KB.REPLAY.setGhost(false); const off=probe();
          KB.REPLAY.setGhost(true);
          const info=KB.REPLAY.ghostInfo(), at=KB.REPLAY.ghostAt(39);
          return {on, off, info, at, rec:KB.REPLAY.recInfo()};
        }""")
        check('F6 幽靈開啟時真的有畫（drawSpr 被呼叫）', gd['on'] > 0, gd['on'])
        check('F7 幽靈關閉時完全不畫', gd['off'] == 0, gd['off'])
        check('F8 幽靈資料載入（幀數 = 上一次的紀錄）', gd['info'] and gd['info']['n'] == 202, gd['info'])
        check('F9 ghostAt() 讀得到座標 / 方向 / 精靈名', gd['at'] and gd['at']['anim'].startswith('kirby_'), gd['at'])
        check('F10 幽靈只畫不碰撞（不在 entities 裡）', ev("()=>KB.game.entities.filter(e=>e.ghost||e.type==='ghost').length") == 0)
        shot('ghost')

        # ------------------------------------------------ G. 播放 / 快轉 / 跳過
        print('-' * 8, 'G. 觀看最佳重播（自動播 / 快轉 / 跳過）')
        pl = ev("""()=>{
          window.__back=0;
          const before=JSON.stringify([KB.save.best,KB.save.playCount,KB.save.bestTime]);
          const ok=KB.REPLAY.watch('w1', ()=>{window.__back++;});
          const p0=KB.REPLAY.progress();
          __kb.step(10); const p1=KB.REPLAY.progress();
          KB.REPLAY.setSpeed(4); __kb.step(10); const p2=KB.REPLAY.progress();
          KB.REPLAY.setSpeed(2); __kb.step(10); const p3=KB.REPLAY.progress();
          const after=JSON.stringify([KB.save.best,KB.save.playCount,KB.save.bestTime]);
          return {ok,p0,p1,p2,p3,same:before===after,playing:KB.REPLAY.playing(),rec:KB.REPLAY.recInfo()};
        }""")
        check('G1 watch() 開得起來', pl['ok'] is True)
        check('G2 播放初始進度 i=0、速度 ×1', pl['p0']['i'] == 0 and pl['p0']['speed'] == 1, pl['p0'])
        check('G3 ×1：10 幀前進 10', pl['p1']['i'] == 10, pl['p1'])
        check('G4 ×4 快轉：10 幀前進 40', pl['p2']['i'] == 50, pl['p2'])
        check('G5 ×2 快轉：10 幀前進 20', pl['p3']['i'] == 70, pl['p3'])
        check('G6 播放中不錄製（recInfo 為 null）', pl['rec'] is None, pl['rec'])
        check('G7 播放中不寫存檔（best / playCount / bestTime 不變）', pl['same'], pl['same'])
        shot('replay')
        sk = ev("""()=>{ const n0=window.__back; KB.REPLAY.stop(); return {back:window.__back-n0, playing:KB.REPLAY.playing()}; }""")
        check('G8 跳過（stop）會結束播放並回呼', sk['back'] == 1 and sk['playing'] is False, sk)
        fin = ev("""()=>{
          window.__back=0; KB.REPLAY.watch('w1', ()=>{window.__back++;});
          KB.REPLAY.setSpeed(8); for(let i=0;i<60;i++) __kb.step(1);
          return {back:window.__back, playing:KB.REPLAY.playing()};
        }""")
        check('G9 播到底會自動結束並回呼', fin['back'] >= 1 and fin['playing'] is False, fin)
        check('G10 播放結束後輸入注入已解除', ev("()=>KB.input.replaying()") is False)
        check('G11 setSpeed 只接受 1/2/4/8', ev("()=>{KB.REPLAY.watch('w1'); const a=KB.REPLAY.setSpeed(3), b=KB.REPLAY.setSpeed(8); const s=KB.REPLAY.speed(); KB.REPLAY.stop(); return [a,b,s];}") == [False, True, 8])

        # ------------------------------------------------ H. 整合
        print('-' * 8, 'H. 整合（真的玩一遍）')
        it = ev("""()=>{
          KB.REPLAY.clear();
          if (KB.session) KB.session.extra=false;
          __kb.goto('game',{level:'w1',nofade:true,ability:'sword'});
          __kb.press({right:true}); __kb.step(260); __kb.release(); __kb.step(2);
          const seed=KB.REPLAY.recInfo().seed;
          KB.game.player.ability='sword';          // 途中受傷會掉能力 ⇒ 結算前明確指定，測的是「有記下來」
          KB.game.timeAlive=1800; KB.game.levelClear();
          const key=KB.REPLAY.keyOf('w1');
          return {key, seed, board:KB.REPLAY.board(key), size:KB.REPLAY.rawSize('w1'),
                  has:KB.REPLAY.hasReplay('w1'),
                  keys:Object.keys(localStorage).filter(k=>k.indexOf('kirbystar_replay')===0).sort()};
        }""")
        check('H1 通關後排行寫進第 1 名', len(it['board']) == 1 and it['board'][0]['t'] == 1800, it['board'])
        check('H2 排行記下使用能力', it['board'][0]['ab'] == 'sword', it['board'][0])
        check('H3 最佳重播寫進 localStorage', it['has'] and 'kirbystar_replay_w1' in it['keys'], it['keys'])
        check('H4 單關重播 < 50KB', 0 < it['size'] < 50 * 1024, str(round(it['size'] / 1024, 2)) + 'KB')
        ex = ev("""()=>{
          KB.session.extra=true;
          __kb.goto('game',{level:'w1',nofade:true,ability:'fire'});
          __kb.press({right:true}); __kb.step(120); __kb.release();
          const key=KB.REPLAY.keyOf('w1'); KB.game.player.ability='fire';
          KB.game.timeAlive=2400; KB.game.levelClear();
          const r={key, ex:KB.REPLAY.board('w1#x'), normal:KB.REPLAY.board('w1')};
          KB.session.extra=false; return r;
        }""")
        check('H5 Extra 模式用另一組 key（w1#x）', ex['key'] == 'w1#x', ex['key'])
        check('H6 Extra 排行與一般模式分開', len(ex['ex']) == 1 and len(ex['normal']) == 1 and ex['ex'][0]['t'] == 2400, [ex['ex'], ex['normal']])
        check('H7 競技場 / 挑戰模式不錄製',
              ev("""()=>{ const g=new KB.GameScene('w1',{arena:{}}); g.enter(); const r=KB.REPLAY.recInfo();
                         __kb.goto('game',{level:'w1',nofade:true}); return r; }""") is None)
        check('H8 幽靈開關存進設定並持久化', ev("()=>{KB.REPLAY.setGhost(false); const a=KB.REPLAY.ghostOn(), b=KB.save.settings.ghost; KB.REPLAY.setGhost(true); return [a,b,KB.REPLAY.ghostOn()];}") == [False, False, True])
        check('H9 clear() 清得掉排行與重播', ev("()=>{KB.REPLAY.clear(); return [KB.REPLAY.board('w1').length, KB.REPLAY.hasReplay('w1'), Object.keys(localStorage).filter(k=>k.indexOf('kirbystar_replay_')===0).length];}") == [0, False, 0])
        check('H10 KB.REPLAY / KB.RNG 都掛在全域', ev("()=>!!(KB.REPLAY&&KB.RNG&&KB.input.applyReplay&&KB.input.maskNow)"))
        fs = ev("""()=>{
          const run=()=>{ KB.REPLAY.forceSeed(5150); __kb.goto('game',{level:'w1',nofade:true});
            __kb.press({right:true}); __kb.step(120); __kb.release();
            return [KB.RNG.current(), KB.RNG.calls(), Math.round(KB.player.cx), Math.round(KB.player.bottom)]; };
          const a=run(), b=run(); KB.REPLAY.forceSeed(0);
          return {a,b,off:KB.REPLAY.forceSeed(0)};
        }""")
        check('H12 forceSeed() 讓一般遊玩也能重現同一串亂數', fs['a'] == fs['b'] and fs['a'][0] == 5150, fs)
        check('H13 forceSeed(0) 取消指定種子', fs['off'] == 0, fs['off'])

        # ------------------------------------------------ I. 唯讀模式（fix12 / R12-P2-01）
        print('-' * 8, 'I. 唯讀模式（觀看重播絕對不寫任何存檔）')
        ro = ev("""()=>{
          const lsSnap=()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf('kirbystar')===0)o[k]=localStorage.getItem(k);}return o;};
          KB.REPLAY.clear();
          if (KB.session) KB.session.extra=false;
          // 1. 真的玩一段並通關 ⇒ 產生 w1 最佳重播（能力 sword）
          __kb.goto('game',{level:'w1',nofade:true,ability:'sword'});
          __kb.press({right:true}); __kb.step(200); __kb.release(); __kb.step(2);
          KB.game.player.ability='sword';
          KB.game.timeAlive=1500; KB.game.levelClear();
          __kb.goto('title'); __kb.step(2);
          // 2. 把「會被重播偷寫」的欄位清乾淨並存檔 ⇒ 之後任何一點變動都抓得到
          KB.save.achievements={}; KB.save.abilityXp={}; KB.save.abilityLv={};
          KB.save.musicHeard={}; KB.save.playTime=7;
          KB.saveGame();
          const snapSave=JSON.stringify(KB.save), snapLs=lsSnap();
          // 3. 觀看重播（播到自然結束）
          // back 回呼在 endPlay() 還原完成的當下被呼叫 ⇒ 在「回到選關畫面播選單曲」之前取樣
          window.__roEnd=null;
          const ok=KB.REPLAY.watch('w1', ()=>{ window.__roEnd={save:JSON.stringify(KB.save), ls:lsSnap()}; });
          const d={ro:KB.REPLAY.readonly()};
          __kb.step(5);
          d.unlock=KB.PROG.unlock('first_ability');
          d.xp=KB.PROG.gainAbility('fire');
          d.heard=KB.MUSICBOX?KB.MUSICBOX.markHeard('title'):false;
          const b1=localStorage.getItem('kirbystar_save_1'); KB.saveGame();
          d.saveGameNoop=(b1===localStorage.getItem('kirbystar_save_1'));
          KB.REPLAY.setSpeed(8);
          for(let i=0;i<600 && KB.REPLAY.playing();i++) __kb.step(1);
          const aft={ro:KB.REPLAY.readonly(), playing:KB.REPLAY.playing(), ended:!!window.__roEnd};
          // 4. localStorage 逐鍵比對 + KB.save 逐欄位比對（取樣點＝播放結束的當下）
          const end=window.__roEnd||{save:JSON.stringify(KB.save), ls:lsSnap()};
          const now=end.ls, diff=[];
          for(const k in now) if(!(k in snapLs)) diff.push('+'+k);
          for(const k in snapLs) if(!(k in now)) diff.push('-'+k); else if(now[k]!==snapLs[k]) diff.push('~'+k);
          const a=JSON.parse(snapSave), b=JSON.parse(end.save), saveDiff=[];
          for(const k in a) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) saveDiff.push(k);
          for(const k in b) if(!(k in a)) saveDiff.push('+'+k);
          // 5. 還原：寫入點都回來了
          const back={};
          const b0=localStorage.getItem('kirbystar_save_1'); KB.save.playTime=99; KB.saveGame();
          back.writes=(b0!==localStorage.getItem('kirbystar_save_1'));
          back.unlock=KB.PROG.unlock('first_ability');
          back.xp=!!KB.PROG.gainAbility('fire');
          back.tick=(typeof KB.SAVES.tick==='function');
          return {ok, d, aft, diff, saveDiff, back, info:KB.REPLAY.roInfo(), lsKeys:Object.keys(snapLs).length};
        }""")
        check('I1 watch() 開得起來並進入唯讀模式', ro['ok'] is True and ro['d']['ro'] is True, ro['d'])
        check('I2 唯讀期間 KB.saveGame() 不寫 localStorage', ro['d']['saveGameNoop'] is True)
        check('I3 唯讀期間 PROG.unlock() 被短路', ro['d']['unlock'] is False, ro['d']['unlock'])
        check('I4 唯讀期間 PROG.gainAbility() 被短路', ro['d']['xp'] is None, ro['d']['xp'])
        check('I5 唯讀期間 MUSICBOX.markHeard() 被短路', ro['d']['heard'] is False, ro['d']['heard'])
        check('I6 播完自動結束且唯讀模式解除', ro['aft'] == {'ro': False, 'playing': False, 'ended': True}, ro['aft'])
        check('I7 localStorage 逐鍵完全不變（含 save_1 / global / replay）', ro['diff'] == [] and ro['lsKeys'] >= 2, [ro['diff'], ro['lsKeys']])
        check('I8 KB.save 逐欄位完全不變（成就 / abilityXp / playTime / savedAt）', ro['saveDiff'] == [], ro['saveDiff'])
        check('I9 還原後 KB.saveGame 又寫得進去', ro['back']['writes'] is True)
        check('I10 還原後 PROG.unlock / gainAbility / SAVES.tick 都回來了',
              ro['back']['unlock'] is True and ro['back']['xp'] is True and ro['back']['tick'] is True, ro['back'])
        # 「不是恆真」：把短路關掉（直接呼叫原生寫入點）同一串操作就會寫進去
        ctl = ev("""()=>{
          const b0=localStorage.getItem('kirbystar_save_1');
          KB.save.achievements={}; KB.saveGame();
          const b1=localStorage.getItem('kirbystar_save_1');
          const u=KB.PROG.unlock('first_ability');
          return {changed:b0!==b1, unlock:u, has:!!KB.save.achievements['first_ability']};
        }""")
        check('I11 對照組：非播放中 unlock / saveGame 真的會寫（證明 I2~I8 不是恆真）',
              ctl['unlock'] is True and ctl['has'] is True and ctl['changed'] is True, ctl)
        check('I12 唯讀 API 都掛在 KB.REPLAY 上', ev("()=>typeof KB.REPLAY.readonly==='function'&&typeof KB.REPLAY.roInfo==='function'"))

        errs = [l for l in logs if 'error' in l.lower() or 'pageerror' in l.lower()]
        check('H11 全程無 console error / pageerror', not errs, errs[:3])
        b.close()

    print('-' * 8)
    ok = sum(1 for _, c, _ in results if c)
    print('%d/%d passed' % (ok, len(results)))
    for n, c, i in results:
        if not c: print('  FAIL', n, i)
    sys.exit(0 if ok == len(results) else 1)


main()
