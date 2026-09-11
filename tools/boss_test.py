# -*- coding: utf-8 -*-
"""
魔王戰自動驗證工具（Playwright / Chromium，headless）。
每個魔王注入一個程式化魔王房（KB.LEVELS.push，16×12 一個畫面寬），登場結束後做三種測試並輸出 PASS/FAIL：
  [idle]   卡比站著不動 600 幀：魔王要有移動 / 攻擊（敵方 proj 或 hitbox 出現）、卡比 hp 要減少、不能有 pageerror。
  [fight]  卡比拿劍，「普通玩家」策略最多 N 幀：魔王要死、出現過關門、走進門後 clearT>=0。跑 --runs 個樣本
           （出生點 / 揮劍節拍不同；魔王 rng 由座標決定，同一樣本是決定性的），全部贏才 PASS。
           策略：有劍 → 貼近魔王、每 15 幀揮劍、每 90 幀原地跳；劍掉了 → 去撿能力星；沒劍 → 吸附近的彈藥
           （蘋果 / 箱子 / 雨滴 / 衝擊星 / 小兵）走近吐回去；反射動作：魔王跳到頭上就走開、貼地飛來的攻擊就跳過、
           魔王張嘴吸就往反方向走、沒武器被逼到牆角就往中央鑽。
  [inhale] （威斯比）走到 130px 內張嘴吸：蘋果能被吸入（mouth 有值），吐出的星星要能打傷威斯比。
截圖以事件觸發（第一顆敵方投射物、卡比受傷、魔王受傷、魔王死亡、過關門、過關、吸入、吐出）存到 shots/boss_<key>_*.png。

用法：
  python tools/boss_test.py                       # 全部魔王（每個 3 個 fight 樣本）
  python tools/boss_test.py --boss kracko --runs 6
  python tools/boss_test.py --boss whispywoods --w1   # 威斯比改用真正的 w1 魔王房（levels.js room 3）
  python tools/boss_test.py --events 40            # 印出 fight 第 0 個樣本與失敗樣本的前 40 個事件（受傷來源 / 命中）
  python tools/boss_test.py --frames 6000 --scale 3 --console --hitbox
結束碼：全部 PASS 為 0。
"""
import argparse, base64, json, pathlib, sys, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOTS = ROOT / 'shots'

E = '................'
G = '################'
# 每個魔王的測試房（16×12，一個畫面寬；y=10,11 為地面）
ROOMS = {
    'whispywoods': dict(theme='green', map=[E] * 10 + [G, G], spawn=[3, 9], bossPos=[12, 9]),
    'lololo': dict(theme='castle', map=[E] * 6 + ['...#########....'] + [E] * 3 + [G, G], spawn=[2, 9], bossPos=[12, 9]),
    'kracko': dict(theme='island', map=[E] * 10 + [G, G], spawn=[3, 9], bossPos=[6, 5]),
    'metaknight': dict(theme='cloud', map=[E] * 10 + [G, G], spawn=[3, 9], bossPos=[12, 9]),
    'dedede': dict(theme='dedede', map=[E] * 10 + [G, G], spawn=[2, 9], bossPos=[12, 9]),
}
ORDER = ['whispywoods', 'lololo', 'kracko', 'metaknight', 'dedede']

# 瀏覽器端驅動：整個迴圈在頁面內跑（每幀 evaluate 太慢），回傳統計與事件截圖
DRIVER_JS = r"""
window.__bt = (function () {
  const scaleShot = s => { const c = KB.canvas, o = document.createElement('canvas'); o.width = c.width * s; o.height = c.height * s;
    const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };
  function targets() {
    const p = KB.player, out = [];
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
  function exitDoor() { return KB.game.entities.find(e => !e.dead && e.type === 'door' && e.exit) || null; }
  function abilityStar() { return KB.game.entities.find(e => !e.dead && e.name === 'abilitystar') || null; }
  // 附近可吸入的彈藥（蘋果 / 箱子 / 雨滴 / 衝擊星 / 一般敵人）
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
  // 受傷來源統計（包 Player.prototype.hurt 一次）
  if (!KB.Player.prototype.__btWrapped) {
    const orig = KB.Player.prototype.hurt;
    KB.Player.prototype.hurt = function (a, src) { const r = orig.call(this, a, src); if (r && window.__hurtBy) { const k = src ? (src.kind || src.name || (src.constructor && src.constructor.name) || '?') : '?'; window.__hurtBy[k] = (window.__hurtBy[k] || 0) + 1; window.__lastHurtBy = k; } return r; };
    KB.Player.prototype.__btWrapped = true;
  }
  return {
    inject(id, key, room) {
      const lv = { id, name: 'BOSS TEST ' + key, theme: room.theme, music: 'boss', boss: key,
        rooms: [{ name: 'test', map: room.map, spawn: room.spawn, entities: [], bossRoom: true, bossPos: room.bossPos }] };
      const i = KB.LEVELS.findIndex(l => l.id === id); if (i >= 0) KB.LEVELS.splice(i, 1);
      KB.LEVELS.push(lv); return lv.id;
    },
    // mode: 'idle' | 'fight' | 'inhale' | 'door'
    run(n, mode, o) {
      o = o || {}; const scale = o.scale || 3;
      const log = { frames: 0, attacksSpawned: 0, maxAttacks: 0, attackKinds: {}, bossStates: {}, bossMoved: 0, minHp: 99, hurtCount: 0,
        bossHp: [], bossHits: 0, deadAt: -1, doorAt: -1, clearAt: -1, mouthAt: -1, spitAt: -1, spitHitAt: -1, playerDied: 0, shots: {}, pos: [], events: [] };
      const seen = new Set(); let lastHp = KB.player.hp, lastBossHp = KB.game.boss ? KB.game.boss.hp : 0;
      const b0 = KB.game.boss; let bx0 = b0 ? b0.x : 0, by0 = b0 ? b0.y : 0;
      const pending = {}; // name -> frames left before snapshot
      const snap = (name, delay) => { if (!(name in log.shots) && !(name in pending)) pending[name] = delay || 0; };
      let phase = mode, spitT = -1, upT = 0, lastLives = KB.game.lives, inhaleT = 0, waitT = 0, jumpHold = 0, prevAttack = false, escaping = 0;
      // 節奏跳只在站定時做（空中沒摩擦，帶著速度跳會飄進魔王身體）；反射跳（躲震波）不受限。按住 12 幀（放開會被 jumpCut 變成小跳）
      const jump = (force) => { if (force || Math.abs(KB.player.vx) < 0.5) jumpHold = 12; };
      window.__hurtBy = {}; log.hurtBy = window.__hurtBy; log.spits = 0; log.starPicks = 0; let hadAbility = !!KB.player.ability;
      for (let i = 0; i < n; i++) {
        const g = KB.game, p = KB.player, b = g.boss; const inp = {};
        if (g.clearT >= 0) { if (log.clearAt < 0) { log.clearAt = i; snap('clear', 30); } }
        if (phase === 'fight' && b && !b.dead) {
          const t = nearest(); const dx = t.cx - p.cx, gap = Math.abs(dx) - (t.w / 2 + p.w / 2);
          if (!hadAbility && p.ability) log.starPicks++; hadAbility = !!p.ability;
          const ph = o.phase || 0;   // 擾動：不同樣本的揮劍 / 跳躍節拍不同
          // 反射動作 1：有重力的魔王跳起來朝自己落下時往旁邊走開（不要站在落點；被逼到牆角就往另一側鑽）
          const mw = KB.game.map.pw;
          const awayDir = (d) => { const cornered = (d < 0 && p.x < 10) || (d > 0 && p.x + p.w > mw - 10); return cornered ? -d : d; };
          const falling = t.solid && t.grav && !t.onGround && t.bottom < p.bottom - 2 && Math.abs(dx) < t.w / 2 + 24;
          // 反射動作 2：貼地朝自己飛來的敵方攻擊（震波 / 氣團 / 箱子）在 44px 內就跳過去
          let incoming = false;
          for (const e of enemyAttacks()) { const ex = e.cx - p.cx; if (Math.abs(ex) < 44 && e.vx && Math.sign(e.vx) === -Math.sign(ex) && e.bottom > p.y + 6) { incoming = true; break; } }
          if (incoming && p.onGround) { log.hops = (log.hops || 0) + 1; jump(true); }
          // 反射動作 3：魔王張嘴吸的時候往反方向走（吸力比走路慢，走就掙脫得掉）
          const sucking = t.state === 'inhale' && Math.abs(dx) < 120;
          // 沒武器又被逼到牆角：往房間中央鑽出去，而且一路鑽到離魔王 70px 以外才停（不然會在牆邊來回抖）
          if (escaping && (Math.abs(dx) > 70 || p.ability)) escaping = 0;
          if (!p.ability && !escaping && (p.x < 10 || p.x + p.w > mw - 10) && Math.abs(dx) < 70) escaping = p.x < 10 ? 1 : -1;
          const star0 = !p.ability && !p.mouth ? abilityStar() : null;   // 劍掉了：撿回能力星優先於逃跑（否則星星 7 秒後就消失）
          if (falling) { log.dodges = (log.dodges || 0) + 1; inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true; }
          else if (sucking && !star0) { log.flee = (log.flee || 0) + 1; inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true; }
          else if (escaping && !star0) { log.escapes = (log.escapes || 0) + 1; inp[escaping > 0 ? 'right' : 'left'] = true; }
          else if (p.ability) {
            // 有劍：貼近魔王、每 15 幀揮劍、每 90 幀跳（簡單玩家）
            if (gap > (o.stopGap !== undefined ? o.stopGap : 8)) inp[dx > 0 ? 'right' : 'left'] = true;
            if ((i + ph * 7) % (o.attackEvery || 15) === 0) inp.attack = true;
            if ((i + ph * 31) % (o.jumpEvery || 90) === 0 && p.onGround) jump();
          } else if (p.mouth) {
            // 含著彈藥：走到魔王 100px 內；魔王在自己高度就吐，在上方就跳起來到頂點吐（否則等一下）
            const sameH = t.y < p.bottom + 8 && t.bottom > p.y - 12, above = t.bottom <= p.y - 12 && t.bottom > p.y - 70;
            if (Math.abs(dx) > 100) inp[dx > 0 ? 'right' : 'left'] = true;
            else if (prevAttack) { /* 吐出需要按鍵「按下」邊緣：上一幀按著就先放開一幀 */ }
            else if (sameH || ++waitT > 240) { inp.attack = true; log.spits++; waitT = 0; if (!('spit' in log.shots)) snap('spit', 3); }
            else if (above) { if (p.onGround && (i % 30 === 0)) jump(); else if (!p.onGround && p.vy > -0.6 && p.state !== 'float') { inp.attack = true; log.spits++; waitT = 0; if (!('spit' in log.shots)) snap('spit', 3); } }
          } else {
            const star = abilityStar(), ammo = ammoNear(p);
            if (star) {  // 劍掉了：去撿能力星
              const sx = star.cx - p.cx; if (Math.abs(sx) > 3) inp[sx > 0 ? 'right' : 'left'] = true;
              if (star.bottom < p.y - 6 && p.onGround && Math.abs(sx) < 12 && i % 20 === 0) jump();
            } else if (ammo) {  // 附近有彈藥：面向它、按住吸
              const ax = ammo.cx - p.cx;
              if (Math.abs(ax) > 44 || (ax > 0) !== (p.dir > 0)) { inp[ax > 0 ? 'right' : 'left'] = true; inhaleT = 0; }
              else { inp.attack = true; inhaleT++; if (inhaleT === 2) snap('inhale', 6); }
            } else if (gap < 40) inp[awayDir(dx > 0 ? -1 : 1) > 0 ? 'right' : 'left'] = true;   // 什麼都沒有：離魔王遠一點等彈藥
          }
        } else if (phase === 'fight' && b && b.dead) { phase = 'door'; }
        if (phase === 'door') {
          const d = exitDoor();
          if (d && p.state !== 'door' && g.clearT < 0) {
            const dx = d.cx - p.cx;
            if (Math.abs(dx) > 2) inp[dx > 0 ? 'right' : 'left'] = true;
            else if (p.onGround) { if (upT % 2 === 0) inp.up = true; upT++; }
          }
        }
        if (phase === 'inhale') {
          // 走到魔王 130px 內站著張嘴吸（面向魔王）；含物後走向魔王，靠近時吐出
          if (!p.mouth) { const t = nearest(); const dx = t.cx - p.cx; if (Math.abs(dx) > 130 || (dx > 0) !== (p.dir > 0)) { inp[dx > 0 ? 'right' : 'left'] = true; } else inp.attack = true; }
          else {
            if (log.mouthAt < 0) { log.mouthAt = i; snap('mouth', 2); }
            const t = nearest(); const dx = t.cx - p.cx;
            if (Math.abs(dx) > (o.spitDist || 90)) inp[dx > 0 ? 'right' : 'left'] = true;
            else if (spitT < 0) { inp.attack = true; spitT = i; log.spitAt = i; snap('spit', 4); }
          }
        }
        if (jumpHold > 0) { inp.jump = true; jumpHold--; }
        prevAttack = !!inp.attack;
        KB.input.setVirtual(inp, true); __kb.step(1); log.frames++;
        // ---- 統計 ----
        const atk = enemyAttacks();
        for (const e of atk) if (!seen.has(e.id)) { seen.add(e.id); log.attacksSpawned++; const k = e.kind || e.constructor.name; log.attackKinds[k] = (log.attackKinds[k] || 0) + 1; if (log.attacksSpawned === 1) snap('attack', 6); }
        log.maxAttacks = Math.max(log.maxAttacks, atk.length);
        if (b) { log.bossStates[b.state] = (log.bossStates[b.state] || 0) + 1; log.bossMoved = Math.max(log.bossMoved, Math.abs(b.x - bx0) + Math.abs(b.y - by0)); }
        for (const e of targets()) if (e !== b) log.bossStates['partner:' + e.state] = (log.bossStates['partner:' + e.state] || 0) + 1;
        const ev = (kind, extra) => { if (log.events.length < 400) log.events.push(Object.assign({ f: i, k: kind, bs: b ? b.state : null, p: [Math.round(p.x), Math.round(p.y), p.state, p.ability ? 'S' : (p.mouth ? 'M' : '-')], b: b ? [Math.round(b.x), Math.round(b.y)] : null }, extra || {})); };
        if (p.hp < lastHp) { log.hurtCount++; snap('hurt', 2); ev('hurt', { by: window.__lastHurtBy, hp: p.hp }); } lastHp = p.hp; log.minHp = Math.min(log.minHp, p.hp);
        if (g.lives < lastLives) { log.playerDied++; lastLives = g.lives; ev('died'); }
        if (b && b.hp < lastBossHp) { log.bossHits++; snap('bosshit', 1); ev('hit', { bhp: b.hp }); if (spitT >= 0 && log.spitHitAt < 0) log.spitHitAt = i; } if (b) lastBossHp = b.hp;
        if (b && i % 60 === 0) log.bossHp.push(b.hp);
        if (i % 120 === 0) log.pos.push([Math.round(p.x), Math.round(p.y), b ? Math.round(b.x) : 0, b ? Math.round(b.y) : 0]);
        if (b && b.dead && log.deadAt < 0) { log.deadAt = i; snap('dead', 30); }
        if (exitDoor() && log.doorAt < 0 && (!b || b.dead)) { log.doorAt = i; snap('door', 8); }
        if (i === Math.floor(n / 2)) snap('mid', 0);
        for (const k of Object.keys(pending)) { if (pending[k]-- <= 0) { log.shots[k] = scaleShot(scale); delete pending[k]; } }
        if (o.stopOnClear && g.clearT >= 30) break;
        if (o.stopOnMouth && spitT >= 0 && i > spitT + 80) break;
      }
      KB.input.clearVirtual();
      for (const k of Object.keys(pending)) log.shots[k] = scaleShot(scale);
      const b = KB.game.boss;
      log.final = { bossHp: b ? b.hp : null, bossDead: !!(b && b.dead), bossState: b ? b.state : null, playerHp: KB.player.hp, exitDoor: !!exitDoor(), clearT: KB.game.clearT, mouth: KB.player.mouth, ability: KB.player.ability };
      return log;
    },
    summary() {
      const g = KB.game, p = KB.player, b = g.boss; const ents = g.entities.filter(e => !e.dead); const counts = {};
      for (const e of ents) { const k = e.type + ':' + (e.name || e.constructor.name); counts[k] = (counts[k] || 0) + 1; }
      return { boss: b ? { cls: b.constructor.name, name: b.displayName, state: b.state, hp: b.hp, maxHp: b.maxHp, x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: b.w, h: b.h, dead: b.dead, intro: !!b.introducing } : null,
        player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), hp: p.hp, state: p.state, ability: p.ability, mouth: p.mouth }, bossIntroT: g.bossIntroT, exitDoor: !!exitDoor(), counts, cam: g.cam };
    },
    shot(s) { __kb.render(); return scaleShot(s || 3); },
  };
})();
"""


def save_png(path, data_url):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(data_url.split(',', 1)[1]))


class Session:
    def __init__(self, pw, console):
        self.logs = []
        self.console = console
        self.browser = pw.chromium.launch()
        self.page = self.browser.new_page(viewport={'width': 256, 'height': 224})
        self.page.on('console', lambda m: self.logs.append(f'[{m.type}] {m.text}'))
        self.page.on('pageerror', lambda e: self.logs.append(f'[pageerror] {e}'))
        self.page.goto(INDEX + '?debug=1&mute=1&norun=1')
        self.page.wait_for_function('()=>window.__kb && KB.LEVELS && KB.BOSSES')
        self.page.evaluate(DRIVER_JS)
        self.save0 = self.page.evaluate("()=>{try{return localStorage.getItem('kirbystar_save')}catch(e){return null}}")

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def errors(self):
        return [l for l in self.logs if l.startswith('[pageerror]') or l.startswith('[error]')]

    def take_errors(self):
        e = self.errors(); self.logs = []; return e

    def close(self):
        # 還原存檔（測試關卡的過關紀錄不要留在 localStorage）
        try:
            self.page.evaluate("(s)=>{try{ if(s===null) localStorage.removeItem('kirbystar_save'); else localStorage.setItem('kirbystar_save', s);}catch(e){}}", self.save0)
        except Exception:
            pass
        self.browser.close()

    def start(self, key, ability=None, use_w1=False, hitbox=False, intro_frames=160, dx=0, use_real=False):
        """載入（注入的）魔王房並跑完登場。回傳 summary。dx：出生點往右偏移幾格（擾動用）。use_real：用 levels.js 的真實魔王房。"""
        if use_w1 or use_real:
            lv, rm = REAL_ROOMS[key] if use_real else ('w1', 3)
            opts = {'level': lv, 'room': rm, 'nofade': True}
            if dx:
                sp = self.ev("([l,r])=>{const L=KB.LEVELS.find(x=>x.id===l); return L.rooms[r].spawn}", [lv, rm])
                opts['x'] = sp[0] + dx; opts['y'] = sp[1]
        else:
            room = ROOMS[key]
            lid = self.ev("([id,key,room])=>__bt.inject(id,key,room)", ['bt_' + key, key, room])
            opts = {'level': lid, 'room': 0, 'nofade': True}
            if dx: opts['x'] = room['spawn'][0] + dx; opts['y'] = room['spawn'][1]
        if ability:
            opts['ability'] = ability
        self.ev("(o)=>__kb.goto('game',o)", opts)
        if hitbox:
            self.ev("()=>__kb.hitbox(true)")
        s = self.ev("()=>__bt.summary()")
        if not s['boss']:
            raise RuntimeError('boss not spawned for ' + key)
        self.ev("(n)=>__kb.step(n)", intro_frames)
        return self.ev("()=>__bt.summary()")


REAL_ROOMS = {'whispywoods': ('w1', 3), 'lololo': ('w2', 4), 'kracko': ('w3', 4), 'metaknight': ('w4', 4), 'dedede': ('w5', 5)}


def fmt(d):
    return json.dumps(d, ensure_ascii=False)


def run_boss(sess, key, a):
    res = {}
    out = SHOTS / f'boss_{key}'
    print(f'\n========== {key} ==========')
    use_w1 = a.w1 and key == 'whispywoods'
    use_real = a.real

    # ---------- [intro / idle] ----------
    s0 = sess.start(key, use_w1=use_w1, use_real=use_real, hitbox=a.hitbox)
    print('after intro:', fmt(s0))
    save_png(out.parent / f'{out.name}_intro.png', sess.ev("(s)=>__bt.shot(s)", a.scale))
    intro_ok = s0['boss'] and not s0['boss']['intro'] and s0['bossIntroT'] == 0
    log = sess.ev("([n,m,o])=>__bt.run(n,m,o)", [a.idle_frames, 'idle', {'scale': a.scale}])
    for k, v in log.pop('shots').items():
        save_png(out.parent / f'{out.name}_idle_{k}.png', v)
    errs = sess.take_errors()
    print('idle:', fmt({k: log[k] for k in ['attacksSpawned', 'maxAttacks', 'attackKinds', 'bossStates', 'bossMoved', 'minHp', 'hurtCount', 'hurtBy', 'playerDied', 'final']}))
    moved_or_attacked = log['attacksSpawned'] > 0 or log['bossMoved'] > 8
    idle_ok = intro_ok and moved_or_attacked and log['attacksSpawned'] > 0 and log['minHp'] < 6 and not errs
    res['idle'] = idle_ok
    print(f"[{key}] IDLE   {'PASS' if idle_ok else 'FAIL'}  (intro_ok={bool(intro_ok)} attacks={log['attacksSpawned']} moved={log['bossMoved']:.0f} minHp={log['minHp']} errors={len(errs)})")
    for e in errs: print('   ', e)

    # ---------- [fight]（跑 a.runs 個樣本：出生點與揮劍節拍不同）----------
    wins = 0
    for r in range(a.runs):
        s1 = sess.start(key, ability='sword', use_w1=use_w1, use_real=use_real, hitbox=a.hitbox, intro_frames=160 + r * 11, dx=r % 3)
        log = sess.ev("([n,m,o])=>__bt.run(n,m,o)", [a.frames, 'fight', {'scale': a.scale, 'stopOnClear': True, 'phase': r}])
        for k, v in log.pop('shots').items():
            if r == 0: save_png(out.parent / f'{out.name}_fight_{k}.png', v)
        errs = sess.take_errors()
        hp_curve = log['bossHp']
        step = max(1, len(hp_curve) // 20)
        print(f'fight#{r} hp curve (every 60f):', hp_curve[::step], '... last', hp_curve[-1] if hp_curve else None)
        print(f'fight#{r}:', fmt({k: log.get(k) for k in ['frames', 'bossHits', 'deadAt', 'doorAt', 'clearAt', 'minHp', 'hurtCount', 'hurtBy', 'playerDied', 'starPicks', 'spits', 'dodges', 'hops', 'flee', 'escapes', 'attacksSpawned', 'attackKinds', 'bossStates', 'final']}))
        ok = log['final']['bossDead'] and log['doorAt'] >= 0 and log['clearAt'] >= 0 and not errs
        if a.events and (not ok or a.events > 0 and r == 0):
            for e in log['events'][:abs(a.events)]:
                print('   ev', fmt(e))
        wins += ok
        print(f"[{key}] FIGHT#{r} {'PASS' if ok else 'FAIL'}  (dead={log['final']['bossDead']} deadAt={log['deadAt']} door={log['doorAt']} clear={log['clearAt']} playerDied={log['playerDied']} errors={len(errs)})")
        for e in errs: print('   ', e)
    fight_ok = wins == a.runs
    res['fight'] = fight_ok
    print(f"[{key}] FIGHT  {'PASS' if fight_ok else 'FAIL'}  ({wins}/{a.runs} runs won)")

    # ---------- [inhale]（威斯比：蘋果可吸入、吐星打傷）----------
    if key == 'whispywoods':
        sess.start(key, use_w1=use_w1, use_real=use_real, hitbox=a.hitbox)
        log = sess.ev("([n,m,o])=>__bt.run(n,m,o)", [a.inhale_frames, 'inhale', {'scale': a.scale, 'stopOnMouth': True}])
        for k, v in log.pop('shots').items():
            save_png(out.parent / f'{out.name}_inhale_{k}.png', v)
        errs = sess.take_errors()
        print('inhale:', fmt({k: log[k] for k in ['frames', 'mouthAt', 'spitAt', 'spitHitAt', 'bossHits', 'minHp', 'final']}))
        inhale_ok = log['mouthAt'] >= 0 and log['spitHitAt'] >= 0 and not errs
        res['inhale'] = inhale_ok
        print(f"[{key}] INHALE {'PASS' if inhale_ok else 'FAIL'}  (mouthAt={log['mouthAt']} spitAt={log['spitAt']} spitHitAt={log['spitHitAt']} errors={len(errs)})")
        for e in errs: print('   ', e)

    missing = sess.ev("()=>__kb.missing()")
    if missing:
        print('missing sprites:', ', '.join(missing))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boss', default='all', help='whispywoods / lololo / kracko / metaknight / dedede / all')
    ap.add_argument('--frames', type=int, default=6000, help='fight 最大幀數')
    ap.add_argument('--runs', type=int, default=3, help='fight 樣本數（每個樣本出生點 / 節拍不同）')
    ap.add_argument('--idle-frames', type=int, default=600)
    ap.add_argument('--inhale-frames', type=int, default=1800)
    ap.add_argument('--scale', type=int, default=3)
    ap.add_argument('--w1', action='store_true', help='威斯比改用 levels.js 的 w1 魔王房（room 3）')
    ap.add_argument('--real', action='store_true', help='全部魔王改用 levels.js 的真實魔王房')
    ap.add_argument('--hitbox', action='store_true')
    ap.add_argument('--console', action='store_true')
    ap.add_argument('--events', type=int, default=0, help='印出 fight 的前 N 個事件（受傷 / 命中 / 死亡）')
    a = ap.parse_args()
    keys = ORDER if a.boss == 'all' else [k.strip() for k in a.boss.split(',')]
    results = {}
    t0 = time.time()
    with sync_playwright() as pw:
        sess = Session(pw, a.console)
        for k in keys:
            if k not in ROOMS:
                print('unknown boss', k); continue
            try:
                results[k] = run_boss(sess, k, a)
            except Exception as ex:
                print(f'[{k}] EXCEPTION {ex!r}')
                results[k] = {'exception': False}
            if a.console:
                print('\n'.join(sess.logs)); sess.logs = []
        sess.close()
    print('\n================ SUMMARY ================')
    all_ok = True
    for k, r in results.items():
        line = '  '.join(f"{t}={'PASS' if ok else 'FAIL'}" for t, ok in r.items())
        all_ok &= all(r.values())
        print(f'{k:12s} {line}')
    print('ALL', 'PASS' if all_ok else 'FAIL', f'({time.time() - t0:.0f}s)')
    sys.exit(0 if all_ok else 1)


if __name__ == '__main__':
    main()
