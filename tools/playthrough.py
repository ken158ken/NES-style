# -*- coding: utf-8 -*-
"""自動通關機器人：用除錯 API 讓卡比自動往右走、卡住就跳/漂浮/吸入，遇門就進，到魔王房就用能力攻擊。
用法：python tools/playthrough.py --level w1 [--ability sword] [--maxframes 30000] [--shots] [--collect]
輸出：每房進度、死亡次數、魔王是否被打敗、缺圖、瀏覽器錯誤。
備註：
  - 主路線機器人「不會」走秘密房（doors 的 secret / 目標房 room.secret 一律忽略），否則會在隱藏門與主線門之間擺盪。
  - --godmode 會固定 hp 並擋掉落坑死亡（fellOut / y 超界時拉回 checkpoint）。
  - --collect 會在半徑內主動去撿大星星（bigstar），結束時印出 KB.save.stars。
"""
import argparse, json, pathlib, base64, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

# =====================================================================
# 魔王房的玩家模型（R4 / QA R3-P1-01「兩支工具對同一隻魔王的結論相反」）
# ---------------------------------------------------------------------
# Round 3 的問題：這支工具用「每 2 幀來回一次 evaluate、每 24 幀揮一次劍、沒有任何閃避」打魔王，
# 於是 boss_test --curve 說迪迪迪被打掉 90%、洛洛洛 100%，playthrough 卻只打掉 0~2% / 30%
# ⇒ 「w5 deaths=4」量到的是工具笨，不是關卡難度。
# 這裡把 tools/boss_test.py 的 [fight]／[mid] 玩家模型整段搬過來（同一份判斷、同樣逐幀驅動），
# 兩支工具對同一隻魔王才會給出同一個量級的答案。模型內容：
#   ① 距離：貼到「魔王框外 stopGap px」為止（預設 14px —— 劍的判定框從卡比中心往前 28px、
#      身體半寬 7px ⇒ 有效射程約 21px，14px 打得到又不會走進魔王身體），太近就退開，
#      維持 14~40px 的中距離前後游走（strafe）。
#   ② 面向：靠攏用的左右鍵本身就會轉身，揮劍前一定先面向魔王。
#   ③ 攻擊節奏：每 attackEvery 幀揮一次、每 jumpEvery 幀站定跳一次。
#   ④ 反射動作：魔王跳到頭上／高速衝過來就往旁邊閃、貼地飛來的攻擊在 44px 內跳過、
#      威斯比竄根的預警出現在腳下就走開、魔王張嘴吸就往反方向走、被逼到牆角往中央鑽、
#      劍掉了先撿能力星、沒武器就吸附近的彈藥走近吐回去。
# =====================================================================
BOSS_MODEL_JS = r"""
window.__pt = (function () {
  function targets() {
    const out = [];
    for (const e of KB.game.entities) if (!e.dead && e.type === 'boss' && !e.ko && !e.hidden && !e.untouchable) out.push(e);
    return out;
  }
  function nearest() {
    const p = KB.player; let best = null, bd = 1e9;
    for (const e of targets()) { const d = Math.abs(e.cx - p.cx) + Math.abs(e.cy - p.cy) * 0.5; if (d < bd) { bd = d; best = e; } }
    return best || KB.game.boss;
  }
  function enemyAttacks() {
    const a = [];
    for (const e of KB.game.entities) if (!e.dead && ((e.type === 'proj' && e.owner === 'enemy') || (e.type === 'hitbox' && e.owner === 'enemy'))) a.push(e);
    return a;
  }
  function abilityStar() { return KB.game.entities.find(e => !e.dead && e.name === 'abilitystar') || null; }
  function ammoNear(p) {
    let best = null, bd = 1e9;
    for (const e of KB.game.entities) {
      if (e.dead || e === p || !e.inhalable || e.name === 'abilitystar') continue;
      if (!(e.type === 'enemy' || e.type === 'proj' || e.type === 'item')) continue;
      const dx = Math.abs(e.cx - p.cx), dy = Math.abs(e.cy - p.cy); if (dx > 80 || dy > 48) continue;
      const d = dx + dy; if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  return {
    // 前方 1~3 格的腳邊 / 身體那一列有沒有尖刺（R4）。
    // 尖刺是「看得到就該跳」的地形傷害，人類玩家一定會跳；原本的機器人只有「每 45 幀跳一次」，
    // 所以 w3 r2 的尖刺床（縮短到 3 格之後仍然）是最大的死亡熱點 —— 那是工具看不見障礙，不是關卡不公平。
    spikeAhead(dir) {
      const p = KB.player, m = KB.game.map, T = 16;
      const fy = Math.floor((p.bottom + 1) / T);
      const fx = Math.floor((dir > 0 ? p.x + p.w - 1 : p.x) / T);
      for (let k = 0; k <= 3; k++) {   // k=0：前緣已經踩進去的那一格（磁磚 16px、卡比 14px，貼上去時前緣早就在裡面了）
        const tx = fx + dir * k;
        if (m.get(tx, fy) === '^' || m.get(tx, fy - 1) === '^') return k + 1;
      }
      return 0;
    },
    // 跑最多 o.frames 幀的魔王戰；遇到魔王死 / 玩家死 / 過關 / 場景切換就提早回傳。
    bossRun(o) {
      o = o || {};
      const out = { frames: 0, ended: 'frames', bossHp: null, bossMinHp: null, bossMaxHp: 0, bossDead: false, hurt: 0, playerHp: 0 };
      let jumpHold = 0, prevAttack = false, escaping = 0, waitT = 0, inhaleT = 0;
      const jump = (force) => { if (force || Math.abs(KB.player.vx) < 0.5) jumpHold = 12; };
      const ph = o.phase || 0, stopGap = o.stopGap !== undefined ? o.stopGap : 14;
      const strafe = o.strafe || 20, attackEvery = o.attackEvery || 15, jumpEvery = o.jumpEvery || 90;
      let lastHp = KB.player.hp;
      const n = o.frames || 120;
      for (let i = 0; i < n; i++) {
        if (!KB.scene || KB.scene.constructor.name !== 'GameScene') { out.ended = 'scene'; break; }
        const g = KB.game, p = KB.player, b = g.boss;
        if (!b) { out.ended = 'noboss'; break; }
        if (g.clearT >= 0) { out.ended = 'clear'; break; }
        if (b.dead) { out.ended = 'bossdead'; break; }
        if (p.state === 'dead') { out.ended = 'died'; break; }
        const inp = {};
        const t = nearest(); const dx = t.cx - p.cx, gap = Math.abs(dx) - (t.w / 2 + p.w / 2);
        const mw = g.map.pw;
        const awayDir = (d) => { const cornered = (d < 0 && p.x < 10) || (d > 0 && p.x + p.w > mw - 10); return cornered ? -d : d; };
        const falling = t.solid && t.grav && !t.onGround && t.bottom < p.bottom - 2 && Math.abs(dx) < t.w / 2 + 24;
        const bvx = (window.__ptLastBx !== undefined && window.__ptLastBid === t.id) ? (t.x - window.__ptLastBx) : 0;
        window.__ptLastBx = t.x; window.__ptLastBid = t.id;
        const charging = Math.abs(bvx) > 1.6 && (bvx > 0) === (dx < 0) && Math.abs(dx) < 120 && t.bottom > p.y - 8 && t.y < p.bottom + 8;
        let incoming = false;
        for (const e of enemyAttacks()) { const ex = e.cx - p.cx; if (Math.abs(ex) < 44 && e.vx && Math.sign(e.vx) === -Math.sign(ex) && e.bottom > p.y + 6) { incoming = true; break; } }
        if (incoming && p.onGround) jump(true);
        let rootX = null;
        if (t.roots) for (const rt of t.roots) if (rt.t < rt.warn && Math.abs(rt.x - p.cx) < 24) { rootX = rt.x; break; }
        const sucking = (t.state === 'inhale' || t.state === 'rampage') && Math.abs(dx) < 120;
        if (escaping && (Math.abs(dx) > 70 || p.ability)) escaping = 0;
        if (!p.ability && !escaping && (p.x < 10 || p.x + p.w > mw - 10) && Math.abs(dx) < 70) escaping = p.x < 10 ? 1 : -1;
        const star0 = !p.ability && !p.mouth ? abilityStar() : null;
        if (rootX !== null) inp[awayDir(p.cx < rootX ? -1 : 1) > 0 ? 'right' : 'left'] = true;
        else if (falling || charging) { inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true; if (charging && p.onGround) jump(true); }
        else if (sucking && !star0) inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true;
        else if (escaping && !star0) inp[escaping > 0 ? 'right' : 'left'] = true;
        else if (p.ability) {
          if (gap > stopGap) inp[dx > 0 ? 'right' : 'left'] = true;                                   // 靠到框外 stopGap px
          else if (gap < stopGap - 10) inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true;   // 太近就退開
          else { const c = i % (strafe * 2); inp[(c < strafe) === (dx > 0) ? 'left' : 'right'] = true; }   // 中距離前後游走
          if ((i + ph * 7) % attackEvery === 0) inp.attack = true;
          if ((i + ph * 31) % jumpEvery === 0 && p.onGround) jump();
          if (t.bottom < p.y - 10 && t.bottom > p.y - 70 && gap < 48 && p.onGround && (i + ph * 3) % 48 === 0) jump();   // 魔王飄在高處
        } else if (p.mouth) {
          const sameH = t.y < p.bottom + 8 && t.bottom > p.y - 12, above = t.bottom <= p.y - 12 && t.bottom > p.y - 70;
          if (Math.abs(dx) > 100) inp[dx > 0 ? 'right' : 'left'] = true;
          else if (prevAttack) { /* 吐出需要按鍵「按下」邊緣：上一幀按著就先放開一幀 */ }
          else if (sameH || ++waitT > 240) { inp.attack = true; waitT = 0; }
          else if (above) { if (p.onGround && (i % 30 === 0)) jump(); else if (!p.onGround && p.vy > -0.6 && p.state !== 'float') inp.attack = true; }
        } else {
          const star = abilityStar(), ammo = ammoNear(p);
          if (star) {
            const sx = star.cx - p.cx; if (Math.abs(sx) > 3) inp[sx > 0 ? 'right' : 'left'] = true;
            if (star.bottom < p.y - 6 && p.onGround && Math.abs(sx) < 12 && i % 20 === 0) jump();
          } else if (ammo) {
            const ax = ammo.cx - p.cx;
            if (Math.abs(ax) > 44 || (ax > 0) !== (p.dir > 0)) { inp[ax > 0 ? 'right' : 'left'] = true; inhaleT = 0; }
            else { inp.attack = true; inhaleT++; }
          } else if (gap < 40) inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true;
        }
        if (jumpHold > 0) { inp.jump = true; jumpHold--; }
        prevAttack = !!inp.attack;
        KB.input.setVirtual(inp, true); __kb.step(1); out.frames++;
        if (o.godmode && KB.player && KB.player.state !== 'dead') {
          KB.player.hp = KB.player.maxHp;
          if (o.ability && o.ability !== 'none' && !KB.player.ability && !KB.player.mouth && KB.ABILITIES[o.ability]) KB.player.ability = o.ability;
        }
        const bb = KB.game.boss;
        if (bb && !bb.introducing) {
          out.bossMaxHp = Math.max(out.bossMaxHp, bb.maxHp);
          out.bossMinHp = out.bossMinHp === null ? bb.hp : Math.min(out.bossMinHp, bb.hp);
        }
        if (KB.player.hp < lastHp) out.hurt++; lastHp = KB.player.hp;
      }
      KB.input.clearVirtual();
      const b = KB.game.boss;
      out.bossHp = b ? b.hp : null; out.bossDead = !!(b && b.dead); out.playerHp = KB.player.hp;
      return out;
    },
  };
})();
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', default='w1')
    ap.add_argument('--ability', default='sword')
    ap.add_argument('--maxframes', type=int, default=30000)
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--room', type=int, default=0)
    ap.add_argument('--godmode', action='store_true', help='不會死（hp 固定 + 不會摔死）')
    ap.add_argument('--collect', action='store_true', help='順路去撿大星星（bigstar）')
    ap.add_argument('--boss-gap', type=float, default=14, help='魔王戰保持的距離（魔王框外幾 px；劍的有效射程約 21px）')
    ap.add_argument('--boss-strafe', type=int, default=20, help='魔王戰前後游走的半週期（幀）')
    ap.add_argument('--boss-attack-every', type=int, default=15, help='魔王戰每幾幀揮一次')
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
        pg.evaluate(BOSS_MODEL_JS)
        pg.evaluate("([l,r,ab])=>__kb.goto('game',{level:l,room:r,ability:ab,nofade:true})", [a.level, a.room, a.ability])
        pg.evaluate("()=>__kb.step(2)")

        def st(): return json.loads(pg.evaluate("()=>__kb.state()"))
        def falling(pl):
            # 快速下墜（掉進坑裡）→ 連按跳觸發漂浮。人類玩家一定會這樣自救，
            # 但原本的機器人「每 45 幀跳一次」常常來不及，w4 的一格寬雲洞因此變成假的必死點。
            return (not pl['onGround']) and pl['vy'] >= 4 and pl['state'] not in ('ride', 'dead', 'hurt')
        def press(o): pg.evaluate("(o)=>__kb.press(o)", o)
        def step(n): pg.evaluate("(n)=>__kb.step(n)", n)
        def shot(name):
            if not a.shots: return
            outdir.mkdir(parents=True, exist_ok=True)
            pg.evaluate("()=>__kb.render()")
            data = pg.evaluate("""()=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*2;o.height=c.height*2;const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""")
            (outdir / (name + '.png')).write_bytes(base64.b64decode(data.split(',', 1)[1]))
        # 主路線用的門：排除秘密門（door.secret 或目標房標了 secret / noBoss）
        # 註：game.js 的 Door 目前沒有把 levels.js 的 secret 旗標複製到實體上，所以用 to.room 反查房間資料。
        MAIN_DOORS = """(()=>{const L=KB.game.level;const sec=r=>{const t=L.rooms[r];return !!(t&&(t.secret||t.noBoss));};
          return KB.game.entities.filter(e=>e.type==='door'&&!e.dead&&!e.locked&&!e.secret&&!(e.to&&sec(e.to.room)));})()"""
        def door_near():
            # 用遊戲自己的 doorAt（判定比「距離 < 10」嚴格：|cx 差| < 8 且框要重疊）。
            # 否則會出現「機器人覺得站到門口了、按上卻進不去」的無限迴圈（w5 r2 出口曾經卡在這）。
            return pg.evaluate("()=>{const p=KB.player;const d=KB.game.doorAt(p);if(!d)return null;"
                               "const ms=" + MAIN_DOORS + ";if(!ms.includes(d))return null;return {x:d.x,exit:d.exit}}")
        def any_door_ahead():
            return pg.evaluate("()=>{const p=KB.player;const ds=" + MAIN_DOORS + ";if(!ds.length)return null;ds.sort((a,b)=>Math.abs(a.cx-p.cx)-Math.abs(b.cx-p.cx));const d=ds[0];return {dx:d.cx-p.cx,dy:d.bottom-p.bottom,exit:d.exit}}")
        def locked_doors():
            return pg.evaluate("()=>KB.game.entities.filter(e=>e.type==='door'&&!e.dead&&e.locked).length")
        def miniboss_near():
            return pg.evaluate("""()=>{const p=KB.player;const m=KB.game.entities.find(e=>!e.dead&&KB.MiniBoss&&e instanceof KB.MiniBoss&&!e.stunned);
              return m?{dx:m.cx-p.cx,dy:m.cy-p.cy,hp:m.hp,px:p.x,mw:KB.game.map.pw}:null}""")
        def essence_near():
            # 能力台座（KB.ITEMS.essence）：碰到就給能力、不會消失。空手時優先去踩一下，
            # 否則上鎖的中魔王房（鐵殼 / 硬直才有攻擊窗）會變成永遠打不倒的死循環。
            return pg.evaluate("""()=>{const p=KB.player;const s=KB.game.entities.filter(e=>!e.dead&&e.name==='essence');
              if(!s.length)return null;s.sort((a,b)=>Math.abs(a.cx-p.cx)-Math.abs(b.cx-p.cx));const d=s[0];
              return {dx:d.cx-p.cx,dy:d.cy-p.cy}}""")
        def ability_star_near():
            return pg.evaluate("""()=>{const p=KB.player;const s=KB.game.entities.find(e=>!e.dead&&e.name==='abilitystar');
              return s?{dx:s.cx-p.cx,dy:s.cy-p.cy}:null}""")
        def bigstar_near():
            return pg.evaluate("""()=>{const p=KB.player;const s=KB.game.entities.filter(e=>!e.dead&&e.name==='bigstar');
              if(!s.length)return null;s.sort((a,b)=>Math.abs(a.cx-p.cx)-Math.abs(b.cx-p.cx));const d=s[0];
              return {dx:d.cx-p.cx,dy:d.cy-p.cy}}""")

        frames = 0; deaths = 0; rooms_seen = []; last_x = None; stuck = 0; dir_ = 1; lastRoom = -1; bossSeen = False; cleared = False; jumpT = 0
        bossPhase = 0; bossMinHp = None; bossMaxHp = 0   # 魔王戰量測：整場（含死亡重來）魔王掉到的最低血量
        spikeJump = 0   # R4：看到前方尖刺後的連續跳躍幀數
        shots_taken = 0; roomFrames = 0; maxX = {}; starChase = 0; starBlock = 0; bsChase = 0; bsBlock = 0
        essChase = 0; essBlock = 0; mbStuck = 0; mbLastX = None
        while frames < a.maxframes:
            s = st(); g = s['game']; pl = s['player']
            if g is None or pl is None: break
            if s['scene'] != 'GameScene': print(f'scene changed to {s["scene"]} at frame {frames}'); shot('scene_' + s['scene']); break
            if g['room'] != lastRoom:
                lastRoom = g['room']; rooms_seen.append(g['room']); roomFrames = 0; stuck = 0; last_x = None; dir_ = 1
                essChase = 0; essBlock = 0; mbStuck = 0; mbLastX = None; spikeJump = 0
                print(f'[room {g["room"]}] enter at frame {frames}, x={pl["x"]}, y={pl["y"]}, ents={g["ents"]}')
                shot(f'room{g["room"]}_enter')
            if a.godmode:
                # hp 固定 + 擋掉落坑死亡（掉出地圖就拉回 checkpoint）+ 掉了的能力補回來
                # （補能力是為了讓「主路線能不能走完」與「沒武器打不打得贏」兩件事分開測；
                #   無武器的戰鬥平衡由 tools/boss_test.py 負責。）
                pg.evaluate("""(ab)=>{const p=KB.player,g=KB.game;p.hp=6;
                  if(p.fellOut||p.y>g.map.ph+8){const c=g.checkpoint||{x:32,y:32};p.x=c.x;p.y=c.y;p.vx=0;p.vy=0;p.fellOut=false;if(p.setState)p.setState('idle');}
                  if(ab&&ab!=='none'&&!p.ability&&!p.mouth&&KB.ABILITIES[ab]&&p.state!=='dead')p.ability=ab;}""", a.ability)
            if g['clearT'] >= 0:
                cleared = True; print(f'LEVEL CLEAR at frame {frames}'); shot('clear'); break
            if pl['state'] == 'dead':
                deaths += 1; print(f'  died at frame {frames} x={pl["x"]} y={pl["y"]} room {g["room"]}'); shot(f'death{deaths}')
                press({}); step(130); frames += 130; continue
            # 掉了能力就先去撿能力星（劍是打中魔王 / 魔王的主要手段，星星只存在 7 秒）
            # 追星有上限：在尖刺床之類的地方會一直撿一直掉，追太久就放棄，先往前走（避免原地死循環）
            if starBlock > 0: starBlock -= 2
            if not pl['ability'] and not pl['mouth'] and starBlock <= 0 and pl['state'] not in ('hurt', 'dead'):
                ast = ability_star_near()
                if ast and abs(ast['dx']) < 160 and abs(ast['dy']) < 110:
                    starChase += 2
                    if starChase > 400: starChase = 0; starBlock = 300
                    else:
                        keys = {'right' if ast['dx'] > 0 else 'left': True}
                        if ast['dy'] < -10: keys['jump'] = (frames % 10) < 4
                        press(keys); step(2); frames += 2; continue
                else: starChase = 0
            else: starChase = 0
            # 魔王房：整段交給 __pt.bossRun（＝ boss_test 的玩家模型，逐幀在頁面內跑）
            # R4 / QA R3-P1-01：原本這裡是「每 2 幀 round-trip、每 24 幀揮一次劍、沒有任何閃避」的土砲打法，
            #   對同一隻魔王的結論和 boss_test 差一個數量級（迪迪迪 0~2% vs 90%）。
            if g['boss'] and not g['boss']['dead']:
                if not bossSeen: bossSeen = True; print(f'  boss appears hp={g["boss"]["hp"]} at frame {frames}'); shot('boss_intro')
                r = pg.evaluate("(o)=>__pt.bossRun(o)", {
                    'frames': 300, 'stopGap': a.boss_gap, 'strafe': a.boss_strafe,
                    'attackEvery': a.boss_attack_every, 'jumpEvery': 90,
                    'phase': bossPhase, 'godmode': a.godmode, 'ability': a.ability,
                })
                frames += r['frames']; bossPhase += 1
                if r['bossMaxHp']:
                    bossMaxHp = max(bossMaxHp, r['bossMaxHp'])
                    bossMinHp = r['bossMinHp'] if bossMinHp is None else min(bossMinHp, r['bossMinHp'])
                if bossPhase % 3 == 0 or r['ended'] != 'frames':
                    print(f'  boss hp={r["bossHp"]}/{r["bossMaxHp"]} (min {bossMinHp}) player hp={r["playerHp"]} '
                          f'hurt={r["hurt"]} ended={r["ended"]} at frame {frames}')
                    shot(f'boss_f{frames}')
                if r['frames'] == 0 and r['ended'] == 'frames': step(10); frames += 10   # 保險：不會空轉
                continue
            if g['boss'] and g['boss']['dead']:
                # 找出口門
                d = any_door_ahead()
                if d and abs(d['dx']) < 10 and abs(d['dy']) < 6: press({'up': True}); step(3); press({}); step(40); frames += 43; continue
                if d: press({'right' if d['dx'] > 0 else 'left': True, 'jump': (frames % 30) < 5 and d['dy'] < -20}); step(2); frames += 2; continue
                step(10); frames += 10; continue
            # 出口被鎖（中魔王門鎖）：先去把中魔王打倒
            if locked_doors() and not any_door_ahead():
                # 空手時先去踩能力台座（中魔王要有武器才打得倒）
                if essBlock > 0: essBlock -= 2
                if not pl['ability'] and not pl['mouth'] and essBlock <= 0:
                    es = essence_near()
                    if es and abs(es['dx']) < 700 and abs(es['dy']) < 200:
                        essChase += 2
                        if essChase > 1600: essChase = 0; essBlock = 2000
                        else:
                            keys = {'right' if es['dx'] > 0 else 'left': True}
                            if es['dy'] < -12 or essChase % 120 < 40: keys['jump'] = (frames % 8) < 3
                            press(keys); step(2); frames += 2; continue
                    else: essChase = 0
                else: essChase = 0
                mb = miniboss_near()
                if mb:
                    # 走去中魔王的路上可能要越過坑 / 台階：位置不動就連按跳（漂浮）
                    if mbLastX is not None and abs(pl['x'] - mbLastX) < 0.8: mbStuck += 2
                    else: mbStuck = max(0, mbStuck - 4)
                    mbLastX = pl['x']
                    keys = {}
                    d = mb['dx']; toward = 'right' if d > 0 else 'left'; away = 'left' if d > 0 else 'right'
                    # 被逼到牆角就改成往中魔王那側鑽（邊漂浮越過他），否則會卡在牆邊被連續打
                    cornered = (away == 'left' and mb['px'] < 24) or (away == 'right' and mb['px'] + 16 > mb['mw'] - 24)
                    if pl['ability']:
                        # 有武器：貼到 26px 內，轉身後揮劍
                        if abs(d) > 26: keys[toward] = True
                        elif (frames % 24) < 3: keys[toward] = True
                        keys['attack'] = 4 <= (frames % 24) < 6
                        if frames % 110 < 8: keys['jump'] = True
                    elif pl['mouth']:
                        # 含著彈藥：走到 70px 內吐回去
                        if abs(d) > 70: keys[toward] = True
                        elif (frames % 20) < 3: keys[toward] = True
                        else: keys['attack'] = (frames % 20) < 6
                    else:
                        # 沒武器：保持 100px 左右（中魔王只有遠距離才會丟可吸入的椰子 / 冰塊），面向他張嘴吸
                        if abs(d) < 84:
                            if cornered: keys[toward] = True; keys['jump'] = (frames % 8) < 5   # 漂浮越過他到另一側
                            else: keys[away] = True
                        elif abs(d) > 140: keys[toward] = True
                        elif (frames % 40) < 3: keys[toward] = True
                        else: keys['attack'] = (frames % 70) < 46
                        if frames % 150 < 8: keys['jump'] = True
                    if mbStuck > 30: keys['jump'] = (frames % 8) < 3
                    # R4：走向中魔王的路上一樣要閃尖刺（w3 r2 的出口被 gatekeeper 鎖住 ⇒ 整間房都走這條分支，
                    #   原本完全沒有尖刺意識，4 段尖刺床就是這一關的死亡熱點）
                    if spikeJump > 0:
                        keys['jump'] = (spikeJump % 4) >= 2; spikeJump -= 2
                    elif pl['state'] not in ('hurt', 'dead') and pg.evaluate("(d)=>__pt.spikeAhead(d)", 1 if d > 0 else -1):
                        spikeJump = 24; keys['jump'] = True
                    if falling(pl): keys['jump'] = (frames % 4) < 2
                    press(keys); step(2); frames += 2; continue
            # 順路撿大星星（有追星上限：藏在可破壞方塊後 / 水底的星星機器人不一定拿得到，追太久就放棄繼續主線）
            if a.collect:
                if bsBlock > 0: bsBlock -= 2
                bs = bigstar_near() if bsBlock <= 0 else None
                if bs and abs(bs['dx']) < 260 and abs(bs['dy']) < 200:
                    bsChase += 2
                    if bsChase > 1200: bsChase = 0; bsBlock = 3000
                    else:
                        keys = {'right' if bs['dx'] > 0 else 'left': True}
                        if bs['dy'] < -12: keys['jump'] = (frames % 8) < 5
                        if pl['ability'] and frames % 20 < 2: keys['attack'] = True   # 順手打破擋路的星星 / 炸彈方塊
                        press(keys); step(2); frames += 2; continue
                else: bsChase = 0
            # 一般房：找門。走到門附近就先「對準」再按上——遊戲的 doorAt 要求 |cx 差| < 8，
            # 只靠 door_near() 判斷會出現「站在門旁邊一直按上卻進不去」的死循環。
            dn = door_near()
            if dn and pl['onGround']:
                print(f'  door at x={dn["x"]} frame {frames}')
                press({}); step(10); press({'up': True}); step(3); press({}); step(45); frames += 58; continue
            dAlign = any_door_ahead()
            if dAlign and pl['onGround'] and abs(dAlign['dx']) < 26 and abs(dAlign['dy']) < 6:
                if abs(dAlign['dx']) > 3:
                    press({'right' if dAlign['dx'] > 0 else 'left': True}); step(1); frames += 1; continue
                press({}); step(6); press({'up': True}); step(3); press({}); step(45); frames += 54; continue
            # 前進邏輯
            x = pl['x']
            if last_x is not None and abs(x - last_x) < 0.8: stuck += 1
            elif last_x is not None and abs(x - last_x) > 1.5: stuck = max(0, stuck - 3)
            last_x = x
            maxX[g['room']] = max(maxX.get(g['room'], 0), x)
            keys = {'right' if dir_ > 0 else 'left': True}
            d = any_door_ahead()
            climbing = False
            if d and abs(d['dx']) < 200:
                dir_ = 1 if d['dx'] > 0 else -1; keys = {'right' if dir_ > 0 else 'left': True}
                # 門在上方：要「連續點跳」才會持續漂浮（按住只會拍一次），按住 20 幀等於只上升一下就掉回去
                if d['dy'] < -20:
                    climbing = True
                    keys['jump'] = (frames % 8) < 2
                    if abs(d['dx']) < 6: keys.pop('right', None); keys.pop('left', None)   # 已經對準門就別再左右飄
            if stuck > 25:
                ph = (stuck - 25) % 330
                if ph < 110: keys['jump'] = (frames % 10) < 3          # A：連按跳 → 漂浮越過
                elif ph < 200:                                          # B：攻擊（能力可打碎方塊）
                    keys['attack'] = (frames % 16) < 2 if pl['ability'] else (frames % 60) < 40
                    if not pl['ability'] and pl['mouth']: keys['attack'] = True
                elif ph < 280:                                          # C：吸入星星方塊再吐出
                    keys['attack'] = (frames % 60) < 40
                    if pl['mouth']: keys['attack'] = (frames % 60) >= 40
                elif ph < 330:                                          # D：↓+攻擊（重擊招式，硬磚 X 只有這類打得破）
                    keys['down'] = True
                    keys['attack'] = (frames % 20) < 3
                else: dir_ *= -1; stuck = 0
            # R4：看到前方有尖刺就「連按跳」漂浮過去（按住只會跳一次，尖刺床有 3 格寬，要靠漂浮才飛得完）
            if spikeJump > 0:
                keys['jump'] = (spikeJump % 4) >= 2; spikeJump -= 2
            elif pl['state'] not in ('hurt', 'dead') and pg.evaluate("(d)=>__pt.spikeAhead(d)", dir_):
                spikeJump = 24; keys['jump'] = True
            # 隨機跳過坑 / 打敵人
            if frames % 45 == 0 and not pl['mouth']: keys['jump'] = True
            if pl['mouth']: keys['attack'] = (frames % 8) < 2
            elif pl['ability'] and frames % 30 < 2: keys['attack'] = True
            # 爬升中一律不攻擊：漂浮中按攻擊＝吐氣（中斷漂浮 + KB.PHYS.exhaleLock 8 幀不能再漂），
            # 空中揮劍（迴旋斬）同樣會把卡比從漂浮狀態拉下來。
            # 「一邊漂上去一邊每 30 幀揮一次劍」等於永遠爬不上垂直房的豎井（w6 r1 實測 45000 幀爬不完）。
            if (climbing or pl['state'] == 'float') and not pl['onGround']: keys.pop('attack', None)
            if falling(pl): keys['jump'] = (frames % 4) < 2
            press(keys); step(2); frames += 2; roomFrames += 2
            if roomFrames % 600 == 0: shot(f'room{g["room"]}_f{roomFrames}')
        press({})
        s = st()
        # 沒過關時把「卡在哪」印出來（玩家狀態 + 同房實體），省得每次都要重跑一次加 --shots
        if not cleared:
            print('  [stuck] player=', s['player'], 'room=', s['game']['room'] if s['game'] else None)
            print('  [stuck] ents=', pg.evaluate(
                "()=>JSON.stringify(KB.game.entities.filter(e=>!e.dead&&Math.abs(e.cx-KB.player.cx)<200)"
                ".map(e=>({n:e.name||e.type,x:Math.round(e.x),y:Math.round(e.y),s:e.state})))"))
        print('---')
        bossPct = (100.0 * (bossMaxHp - bossMinHp) / bossMaxHp) if (bossMaxHp and bossMinHp is not None) else None
        print(f'level={a.level} frames={frames} rooms={rooms_seen} deaths={deaths} cleared={cleared} boss={s["game"]["boss"] if s["game"] else None} maxX={maxX}')
        # 魔王被打掉幾 %（整場最低血量／最大血量，和 boss_test --curve 同一個定義）
        print(f'bossDamage={bossPct if bossPct is None else round(bossPct)}% (min {bossMinHp} / max {bossMaxHp})')
        if a.collect:
            print('stars:', pg.evaluate("()=>JSON.stringify(KB.save.stars||{})"))
        print('missing sprites:', s['missing'])
        if logs: print('\n'.join(logs[:30]))
        b.close()
        sys.exit(0 if cleared else 2)

if __name__ == '__main__':
    main()
