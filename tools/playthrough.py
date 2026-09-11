# -*- coding: utf-8 -*-
"""自動通關機器人：用除錯 API 讓卡比自動往右走、卡住就跳/漂浮/吸入，遇門就進，到魔王房就用能力攻擊。
用法：python tools/playthrough.py --level w1 [--ability sword] [--maxframes 12000] [--shots]
輸出：每房進度、死亡次數、魔王是否被打敗、缺圖、瀏覽器錯誤。
"""
import argparse, json, pathlib, base64, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', default='w1')
    ap.add_argument('--ability', default='sword')
    ap.add_argument('--maxframes', type=int, default=15000)
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--room', type=int, default=0)
    ap.add_argument('--godmode', action='store_true', help='不會死（hp 固定）')
    a = ap.parse_args()
    logs = []
    outdir = ROOT / 'shots' / 'play' / a.level
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS')
        pg.evaluate("([l,r,ab])=>__kb.goto('game',{level:l,room:r,ability:ab,nofade:true})", [a.level, a.room, a.ability])
        pg.evaluate("()=>__kb.step(2)")

        def st(): return json.loads(pg.evaluate("()=>__kb.state()"))
        def press(o): pg.evaluate("(o)=>__kb.press(o)", o)
        def step(n): pg.evaluate("(n)=>__kb.step(n)", n)
        def shot(name):
            if not a.shots: return
            outdir.mkdir(parents=True, exist_ok=True)
            pg.evaluate("()=>__kb.render()")
            data = pg.evaluate("""()=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*2;o.height=c.height*2;const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""")
            (outdir / (name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))
        def door_near():
            return pg.evaluate("""()=>{const p=KB.player;const d=KB.game.entities.find(e=>e.type==='door'&&!e.locked&&Math.abs(e.cx-p.cx)<10&&Math.abs(e.bottom-p.bottom)<6);return d?{x:d.x,exit:d.exit}:null}""")
        def any_door_ahead():
            return pg.evaluate("""()=>{const p=KB.player;const ds=KB.game.entities.filter(e=>e.type==='door'&&!e.locked);if(!ds.length)return null;ds.sort((a,b)=>Math.abs(a.cx-p.cx)-Math.abs(b.cx-p.cx));const d=ds[0];return {dx:d.cx-p.cx,dy:d.bottom-p.bottom,exit:d.exit}}""")

        frames = 0; deaths = 0; rooms_seen = []; last_x = None; stuck = 0; dir_ = 1; lastRoom = -1; bossSeen = False; cleared = False; jumpT = 0
        shots_taken = 0; roomFrames = 0; maxX = {}
        while frames < a.maxframes:
            s = st(); g = s['game']; pl = s['player']
            if g is None or pl is None: break
            if s['scene'] != 'GameScene': print(f'scene changed to {s["scene"]} at frame {frames}'); shot('scene_' + s['scene']); break
            if g['room'] != lastRoom:
                lastRoom = g['room']; rooms_seen.append(g['room']); roomFrames = 0; stuck = 0; last_x = None; dir_ = 1
                print(f'[room {g["room"]}] enter at frame {frames}, x={pl["x"]}, y={pl["y"]}, ents={g["ents"]}')
                shot(f'room{g["room"]}_enter')
            if a.godmode: pg.evaluate("()=>{KB.player.hp=6}")
            if g['clearT'] >= 0:
                cleared = True; print(f'LEVEL CLEAR at frame {frames}'); shot('clear'); break
            if pl['state'] == 'dead':
                deaths += 1; print(f'  died at frame {frames} x={pl["x"]} y={pl["y"]} room {g["room"]}'); shot(f'death{deaths}')
                press({}); step(130); frames += 130; continue
            # 魔王房：往魔王靠近並攻擊
            if g['boss'] and not g['boss']['dead']:
                if not bossSeen: bossSeen = True; print(f'  boss appears hp={g["boss"]["hp"]} at frame {frames}'); shot('boss_intro')
                B = g['boss']; bl = B['x']; br = B['x'] + (B.get('w') or 40); pcx = pl['x'] + 7
                dx = (bl - 14 - pcx) if pcx < bl else ((br + 14 - pcx) if pcx > br else 0)   # 靠到魔王框邊緣外 14px
                keys = {}
                if abs(dx) > 6: keys['right' if dx > 0 else 'left'] = True
                elif (frames % 20) < 2: keys['right' if (bl + br) / 2 > pcx else 'left'] = True   # 攻擊時面向魔王
                high = B.get('y') is not None and (pl['y'] - B['y']) > 30
                if high and jumpT == 0 and pl['onGround'] and abs(dx) <= 30: jumpT = 22          # 魔王在上方：單次跳躍（不漂浮）
                if jumpT > 0:
                    keys['jump'] = jumpT > 10
                    if 12 <= jumpT <= 13 and pl['ability']: keys['attack'] = True                # 跳躍頂點揮劍
                    jumpT -= 2
                elif pl['ability']: keys['attack'] = (frames % 20) < 2
                else:
                    # 沒能力：吸入（按住 30 幀）/ 吐出（需邊緣觸發）
                    if pl['mouth']: keys['attack'] = (frames % 8) < 2
                    else: keys['attack'] = (frames % 60) < 30
                if frames % 90 < 15 and abs(dx) < 60: keys['jump'] = True
                press(keys); step(2); frames += 2
                if frames % 600 == 0: print(f'  boss hp={g["boss"]["hp"]} player hp={pl["hp"]} x={pl["x"]}'); shot(f'boss_f{frames}')
                continue
            if g['boss'] and g['boss']['dead']:
                # 找出口門
                d = any_door_ahead()
                if d and abs(d['dx']) < 10 and abs(d['dy']) < 6: press({'up': True}); step(3); press({}); step(40); frames += 43; continue
                if d: press({'right' if d['dx'] > 0 else 'left': True, 'jump': (frames % 30) < 5 and d['dy'] < -20}); step(2); frames += 2; continue
                step(10); frames += 10; continue
            # 一般房：找門
            dn = door_near()
            if dn and pl['onGround']:
                print(f'  door at x={dn["x"]} frame {frames}')
                press({}); step(24); press({'up': True}); step(3); press({}); step(45); frames += 72; continue
            # 前進邏輯
            x = pl['x']
            if last_x is not None and abs(x - last_x) < 0.8: stuck += 1
            elif last_x is not None and abs(x - last_x) > 1.5: stuck = max(0, stuck - 3)
            last_x = x
            maxX[g['room']] = max(maxX.get(g['room'], 0), x)
            keys = {'right' if dir_ > 0 else 'left': True}
            d = any_door_ahead()
            if d and abs(d['dx']) < 200:
                dir_ = 1 if d['dx'] > 0 else -1; keys = {'right' if dir_ > 0 else 'left': True}
                if d['dy'] < -20 and (frames % 40) < 20: keys['jump'] = True  # 門在上方：跳/漂浮
            if stuck > 25:
                ph = (stuck - 25) % 330
                if ph < 110: keys['jump'] = (frames % 10) < 3          # A：連按跳 → 漂浮越過
                elif ph < 200:                                          # B：攻擊（能力可打碎方塊）
                    keys['attack'] = (frames % 16) < 2 if pl['ability'] else (frames % 60) < 40
                    if not pl['ability'] and pl['mouth']: keys['attack'] = True
                elif ph < 300:                                          # C：吸入星星方塊再吐出
                    keys['attack'] = (frames % 60) < 40
                    if pl['mouth']: keys['attack'] = (frames % 60) >= 40
                else: dir_ *= -1; stuck = 0
            # 隨機跳過坑 / 打敵人
            if frames % 45 == 0 and not pl['mouth']: keys['jump'] = True
            if pl['mouth']: keys['attack'] = (frames % 8) < 2
            elif pl['ability'] and frames % 30 < 2: keys['attack'] = True
            press(keys); step(2); frames += 2; roomFrames += 2
            if roomFrames % 600 == 0: shot(f'room{g["room"]}_f{roomFrames}')
        press({})
        s = st()
        print('---')
        print(f'level={a.level} frames={frames} rooms={rooms_seen} deaths={deaths} cleared={cleared} boss={s["game"]["boss"] if s["game"] else None} maxX={maxX}')
        print('missing sprites:', s['missing'])
        if logs: print('\n'.join(logs[:30]))
        b.close()
        sys.exit(0 if cleared else 2)

if __name__ == '__main__':
    main()
