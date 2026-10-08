# -*- coding: utf-8 -*-
"""《星塵機甲》通關機器人：貪婪策略 + 跳躍模擬器走完一關（含打頭目），印 cleared / frames / deaths。

用法（PY=../卡比之星/.venv/bin/python）：
  $PY tools/playthrough_mech.py --stage frost          # 關卡 1（只用機甲砲 + 蓄力打頭目）
  $PY tools/playthrough_mech.py --stage blaze          # 關卡 2
  $PY tools/playthrough_mech.py --all                  # 選關畫面 → FROST → 選關 → BLAZE（拿到弱點武器）
  $PY tools/playthrough_mech.py --room 3 --stage frost # 只跑某一間房（除錯）
  $PY tools/playthrough_mech.py --cheat                # 不通關，改驗一鍵密技（C / ★ / nes-cheat / SELECT 續關）

策略（全部在頁面內跑，一次 evaluate 推 1500 幀，避免每幀 round-trip）：
  ① 選關畫面：方向鍵把游標移到目標格 → START
  ② 一般房間：看 `GAME.dev.route()` 給的方向
     - right：一直往右 + 用**跳躍模擬器**決定「該不該跳、按住 A 幾幀」
       （模擬器用與 games/mech/hero.js 相同的常數：1.375 px/幀、g = 0.25、v0 = −5.293、
        放開 A 立刻停止上升；一路查 `GAME.dev.kindAt` 的地形）
     - up：走到 `ladderCol` 的 x，按住 ↑ 爬梯，爬到房頂自動換房
     - down：走到 `holeCol` 的 x，直接走進洞裡（不跳）
  ③ 射擊：前方 120 px 內有敵人就點 B（點一下放開 = 普通彈）
  ④ 頭目房：站左側安全角（火柱固定在 x = 60/120/180），持續攻擊，
     有弱點武器就先用暫停選單切過去（= 真的走一次武器選單）；否則蓄力 60 幀打 3 傷。
     敵彈 / 衝刺靠近就跳。血量 ≤ 10 且有 E 罐 → 開選單用罐。
  ⑤ 卡住（180 幀沒前進）→ 往反方向退 20 幀再試，並放寬跳躍門檻

結束碼：0 = 指定的關全部 cleared / 1 = 有關卡沒過 / 2 = 環境錯誤
"""
import argparse
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAGES = ['frost', 'blaze']
SLOT = {'frost': 0, 'blaze': 8}

BOT_JS = r"""
(opt) => {
  const BTN = NES.Input.BTN, d = window.GAME.dev;
  const S = () => window.GAME.state();
  const WALK = 1.375, GRAV = 0.25, JUMP_VY = -1355 / 256, MAXFALL = 6;
  const W = 12, H = 24;
  const HOLDS = [0, 6, 10, 14, 20, 26, 34, 46];

  // ---- 跳躍模擬器：與 games/mech/hero.js 同一套規則（無加速度、放開 A 立刻停止上升）----
  // **消失磚一律當成不存在**：規劃路線時不把它算進落腳點，
  // 這樣機器人通關就等於證明「主路線不靠消失磚」（友善版設計的驗收）。
  function kind(c, r) {
    if (c < 0 || c >= 32) return 'none';
    if (r < 0) return 'solid';
    if (r >= 30) return 'none';
    const raw = d.rawKind ? d.rawKind(c, r) : null;
    if (raw === 'vanishA' || raw === 'vanishB') return 'none';
    return d.kindAt(c, r);
  }
  function solid(c, r) { return kind(c, r) === 'solid'; }
  function killAt(x, y) {
    for (let c = x >> 3; c <= (x + W - 1) >> 3; c++)
      for (let r = y >> 3; r <= (y + H - 1) >> 3; r++)
        if (kind(c, r) === 'kill') return true;
    return false;
  }
  function blockedH(x, y) {
    const c = x >> 3;
    return solid(c, y >> 3) || solid(c, (y + 12) >> 3) || solid(c, (y + H - 1) >> 3);
  }
  // hold = 0 代表「完全不跳、直接往前走」
  window.__botSim = function (hold, x0, y0, dir, maxF) {
    let x = x0, y = y0, vy = 0, onG = true, first = false, jh = false;
    if (hold > 0) { vy = JUMP_VY; onG = false; first = true; jh = true; }
    maxF = maxF || 150;
    let wall = 0;
    for (let f = 0; f < maxF; f++) {
      if (!onG) {
        if (jh && f >= hold && vy < 0) { vy = 0; jh = false; }
        vy += first ? GRAV / 2 : GRAV;
        first = false;
        if (vy > MAXFALL) vy = MAXFALL;
      }
      // X
      let nx = x + dir * WALK;
      const px = dir > 0 ? Math.floor(nx) + W - 1 : Math.floor(nx);
      if (blockedH(px, Math.floor(y))) { wall++; nx = x; } else wall = 0;
      x = nx;
      // Y
      y += vy;
      const iy = Math.floor(y), ix = Math.floor(x);
      if (vy >= 0) {
        const frow = (iy + H) >> 3;
        if (solid(ix >> 3, frow) || solid((ix + W - 1) >> 3, frow)) {
          y = (frow << 3) - H; vy = 0; onG = true;
        } else onG = false;
      } else {
        onG = false;
        const hrow = iy >> 3;
        if (solid(ix >> 3, hrow) || solid((ix + W - 1) >> 3, hrow)) { y = ((hrow + 1) << 3); vy = 0; }
      }
      if (killAt(Math.floor(x), Math.floor(y))) return { die: true, x: x, y: y, f: f };
      if (y > 240) return { fell: true, x: x, y: y, f: f };
      if (onG && f > 2) return { ok: true, x: x, y: y, f: f, wall: wall };
    }
    return { timeout: true, x: x, y: y, wall: wall };
  };

  // ---- 機器人狀態 ----
  const bot = {
    frames: 0, deaths: 0, done: null, lastX: -999, stuck: 0, backoff: 0,
    jumpCool: 0, bCool: 0, menuPlan: null, menuT: 0, tankUsed: 0,
    target: opt.stage, maxFrames: opt.maxFrames || 60000, log: [],
    wantRoom: (opt.room === undefined || opt.room === null) ? -1 : opt.room, chargeT: 0, selT: 0
  };
  window.__bot = bot;

  function mask(keys) {
    let m = 0;
    for (const k of keys) m |= BTN[k.toUpperCase()];
    return m;
  }

  // ---------------- 選關畫面 ----------------
  function planSelect(s) {
    const want = opt.slot;
    // 選關畫面吃的是「本幀按下」的邊緣 ⇒ 每 4 幀才按一下（放開再按才算新的一次）
    bot.selT++;
    if ((bot.selT & 3) !== 0) return [];
    const cr = (s.sel / 3) | 0, cc = s.sel % 3;
    const wr = (want / 3) | 0, wc = want % 3;
    if (cr !== wr) return ['down'];
    if (cc !== wc) return ['right'];
    return ['start'];
  }

  // ---------------- 一般房間 ----------------
  function planRoom(s) {
    const route = d.route();
    const h = d.hero();
    const keys = [];
    if (!route) return keys;

    // 從下方的梯子進來的房間：先爬完梯子再談路線（洛克人的豎井接頁）
    if (h.climbing) return [route.dir === 'down' ? 'down' : 'up'];

    // 射擊：前方有敵人 / 一律定期點一下（清路）
    const en = d.enemies();
    let shoot = false;
    for (const e of en) {
      const dx = (e.x + e.w / 2) - (h.x + 6);
      if (Math.abs(dx) < 140 && Math.abs(e.y - h.y) < 48 && (dx > 0) === (h.facing > 0)) shoot = true;
    }
    if (shoot && bot.bCool <= 0) { keys.push('b'); bot.bCool = 8; }
    if (bot.bCool > 0) bot.bCool--;

    // 敵人太近就跳過去
    let close = false;
    for (const e of en) {
      const dx = (e.x + e.w / 2) - (h.x + 6);
      if (dx * (h.facing > 0 ? 1 : -1) > 0 && Math.abs(dx) < 34 && Math.abs(e.y - h.y) < 30) close = true;
    }

    if (route.dir === 'up') {
      const tx = route.ladderCol * 8 - 2;
      if (h.climbing) { keys.push('up'); return keys; }
      if (Math.abs(h.x - tx) > 2) return keys.concat(walk(h, h.x < tx ? 1 : -1, close));
      keys.push('up');
      return keys;
    }
    if (route.dir === 'down') {
      const tx = route.holeCol * 8;
      const dir = h.x < tx ? 1 : -1;
      // 洞口附近就純走（要掉下去，不能跳）；還遠的話照常用模擬器處理障礙
      if (Math.abs(h.x - tx) <= 24) { keys.push(dir > 0 ? 'right' : 'left'); return keys; }
      return keys.concat(walk(h, dir, close));
    }
    // right（含卡住時的退行）
    return keys.concat(walk(h, bot.backoff > 0 ? -1 : 1, close));
  }

  // 朝 dir 走，並用跳躍模擬器決定「該不該跳、按住 A 幾幀」
  function walk(h, dir, close) {
    const keys = [dir > 0 ? 'right' : 'left'];
    if (h.onGround && bot.jumpCool <= 0) {
      const hold = chooseHold(h, dir, close);
      if (hold > 0) { keys.push('a'); bot.holdLeft = hold - 1; bot.jumpCool = 2; }
    } else if (bot.holdLeft > 0) { keys.push('a'); bot.holdLeft--; }
    if (bot.jumpCool > 0) bot.jumpCool--;
    return keys;
  }

  function needJump(h, dir) {
    const r = window.__botSim(0, h.x, h.y, dir, 60);
    return !!(r.die || r.fell || (r.wall && r.wall > 2));
  }
  function chooseHold(h, dir, close) {
    const base = window.__botSim(0, h.x, h.y, dir, 70);
    const bad = base.die || base.fell || (base.timeout && base.wall > 2) || (base.ok && base.wall > 2);
    if (!bad && !close) return 0;
    for (let i = 1; i < HOLDS.length; i++) {
      const r = window.__botSim(HOLDS[i], h.x, h.y, dir, 160);
      if (r.die || r.fell) continue;
      if (!r.ok) continue;
      if (dir > 0 && r.x <= h.x + 4) continue;
      if (dir < 0 && r.x >= h.x - 4) continue;
      return HOLDS[i];
    }
    return close ? 20 : 0;
  }

  // ---------------- 頭目房 ----------------
  function weakOf(key) { return key === 'frost' ? 'blaze' : 'frost'; }
  function planBoss(s) {
    const h = d.hero(), b = d.boss(), keys = [];
    const wk = b ? weakOf(b.key) : null;
    const wps = d.weapons();

    // 暫停選單：切弱點武器 / 用 E 罐
    if (s.paused) {
      bot.menuT++;
      if (bot.menuPlan === 'tank') {
        if (bot.menuT < 4) return [];
        if (bot.menuT < 8) return ['b'];
        bot.menuPlan = null; bot.menuT = 0;
        return ['start'];
      }
      const m = d.menu();
      const cur = m.list[m.sel];
      if (cur && cur.key === bot.menuPlan && cur.unlocked) { bot.menuPlan = null; bot.menuT = 0; return ['start']; }
      return (bot.menuT & 3) === 0 ? ['down'] : [];
    }
    if (wk && wps.unlocked[wk] && wps.cur !== wk && b && b.active) {
      bot.menuPlan = wk; bot.menuT = 0;
      return ['start'];
    }
    if (h.life <= 10 && h.tanks > 0 && bot.tankUsed < 4) {
      bot.tankUsed++; bot.menuPlan = 'tank'; bot.menuT = 0;
      return ['start'];
    }

    // 站位：左側安全角（火柱固定 x = 60 / 120 / 180）
    const safeX = 26;
    if (h.x > safeX + 10) keys.push('left');
    else if (h.x < safeX - 10) keys.push('right');

    // 閃避：敵彈 / 衝刺靠近就跳（無敵幀內不必閃，專心輸出）
    let danger = false;
    if (h.inv <= 30) {
      for (const e of d.eshots()) {
        const dx = (e.x + 3) - (h.x + 6);
        const ey = e.y + 3;
        const approach = (dx > 0 && e.vx < 0) || (dx < 0 && e.vx > 0) || (Math.abs(e.vx) < 1);
        if (Math.abs(dx) < 90 && approach && ey > h.y - 4 && ey < h.y + H + 8) danger = true;
      }
      if (b && !b.dead && b.active && Math.abs(b.x - h.x) < 80 && (b.mode === 'dash' || b.mode === 'hop')) danger = true;
    }
    if (danger && h.onGround && bot.jumpCool <= 0) { bot.holdLeft = 46; bot.jumpCool = 8; }
    if (bot.holdLeft > 0) { keys.push('a'); bot.holdLeft--; }
    if (bot.jumpCool > 0) bot.jumpCool--;

    // 攻擊：點射（弱點武器 3 發倒；機甲砲 28 發，但同屏 3 發的連射比蓄力快）
    if (!b || !b.active || b.dead) return keys;
    if (bot.bCool <= 0) { keys.push('b'); bot.bCool = (wps.cur === wk) ? 12 : 9; }
    if (bot.bCool > 0) bot.bCool--;
    return keys;
  }

  window.__botStep = function (n) {
    for (let i = 0; i < n; i++) {
      const s = S();
      let keys = [];
      if (s.mode === 'select') {
        if (bot.done) break;
        keys = planSelect(s);
      } else if (s.mode === 'ready' || s.trans) {
        keys = [];
      } else if (s.mode === 'weaponget') {
        bot.done = { cleared: true, reason: 'weaponget', room: s.room, life: s.life, weapon: s.weaponGot };
        break;
      } else if (s.mode === 'gameover') {
        bot.done = { cleared: false, reason: 'gameover', room: s.room };
        break;
      } else if (s.mode === 'dead') {
        keys = [];
      } else if (s.mode === 'play') {
        if (bot.wantRoom >= 0 && s.room !== bot.wantRoom) {
          bot.done = { cleared: true, reason: 'leftroom', room: s.room };
          break;
        }
        keys = d.route() && d.route().boss ? planBoss(s) : planRoom(s);
      }
      bot.deaths = s.deaths;
      // 卡住偵測
      if (s.mode === 'play' && !s.trans) {
        if (Math.abs(s.x - bot.lastX) < 2) {
          if (++bot.stuck > 180) { bot.backoff = 24; bot.stuck = 0; }
        } else { bot.stuck = 0; bot.lastX = s.x; }
      }
      if (bot.backoff > 0) bot.backoff--;
      __nes.press(keys, 1);
      bot.frames++;
      if (bot.frames >= bot.maxFrames) { bot.done = { cleared: false, reason: 'timeout', room: s.room }; break; }
    }
    const st = S();
    return { done: bot.done, frames: bot.frames, deaths: st.deaths, room: st.room,
             mode: st.mode, life: st.life, x: st.x, y: st.y,
             boss: st.boss ? st.boss.hp : null, weapon: st.weapon };
  };
  return true;
}
"""


def shot(page, path, scale=2):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    data = page.evaluate(
        """(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
                 const o=document.createElement('canvas');
                 o.width=c.width*s; o.height=c.height*s;
                 const x=o.getContext('2d'); x.imageSmoothingEnabled=false;
                 x.drawImage(c,0,0,o.width,o.height);
                 return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('saved', path)


def run_stage(page, url, stage, max_frames, verbose, lives, room=None, out=None):
    q = '&stage=' + stage
    if room is not None:
        q += '&room=%d' % room
    page.goto(url + q)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    if lives:
        page.evaluate('(n) => window.GAME.dev.setLives(n)', lives)
    page.evaluate(BOT_JS, {'stage': stage, 'slot': SLOT.get(stage, 0),
                           'maxFrames': max_frames, 'room': room})
    b = None
    while True:
        b = page.evaluate('(n) => window.__botStep(n)', 1500)
        if b.get('done'):
            break
        if verbose:
            print('  ... f=%d room=%s x=%s life=%s boss=%s' % (b['frames'], b['room'], b['x'], b['life'], b['boss']))
    if out:
        shot(page, out)
    d = b['done']
    d['frames'] = b['frames']
    d['deaths'] = b['deaths']
    d['life'] = b['life']
    return d


def run_all(page, url, max_frames, verbose, lives, out_dir):
    """選關畫面 → FROST（只有機甲砲）→ 選關 → BLAZE（用剛拿到的 FROST SHOT）。"""
    page.goto(url)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    results = []
    total = 0
    for stage in STAGES:
        page.evaluate('() => { window.__bot = null; }')
        page.evaluate(BOT_JS, {'stage': stage, 'slot': SLOT[stage], 'maxFrames': max_frames})
        if lives:
            page.evaluate('(n) => window.GAME.dev.setLives(n)', lives)
        b = None
        while True:
            b = page.evaluate('(n) => window.__botStep(n)', 1500)
            if b.get('done'):
                break
            if verbose:
                print('  ... %s f=%d room=%s x=%s life=%s boss=%s' % (stage, b['frames'], b['room'], b['x'], b['life'], b['boss']))
        d = b['done']
        d['stage'] = stage
        d['frames'] = b['frames']
        d['deaths'] = b['deaths']
        d['weapon'] = b['weapon']
        total += b['frames']
        results.append(d)
        if out_dir:
            shot(page, out_dir / ('chain_%s.png' % stage))
        if not d.get('cleared'):
            break
        # weaponget → START 回選關
        for _ in range(240):
            st = page.evaluate('() => window.GAME.state().mode')
            if st == 'select':
                break
            page.evaluate("() => __nes.press(['start'], 1)")
            page.evaluate('() => __nes.step(2)')
    return results, total


def run_cheat(page, url, out):
    bad = []

    def chk(name, cond, detail=''):
        ok = bool(cond)
        print('  [%s] %s%s' % ('PASS' if ok else 'FAIL', name, ('  — ' + str(detail)) if detail else ''))
        if not ok:
            bad.append(name)

    def fresh(q='&stage=frost'):
        page.goto(url + q)
        page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
        page.evaluate('() => __nes.step(120)')
        return page.evaluate('() => window.GAME.state()')

    # ① 鍵盤 C
    fresh()
    page.evaluate("() => { window.GAME.dev.setLife(6); window.GAME.dev.setLives(1); }")
    page.keyboard.press('c')
    page.evaluate('() => __nes.step(3)')
    s = page.evaluate('() => window.GAME.state()')
    chk('鍵盤 C：命補到 9 / 血補滿 / 全武器解鎖', s['lives'] == 9 and s['life'] == 28 and s['unlocked']['frost'] and s['unlocked']['blaze'],
        (s['lives'], s['life'], s['unlocked']))
    chk('鍵盤 C：無敵 20 秒（1200 幀）', s['inv'] >= 1150, s['inv'])
    chk('鍵盤 C：E 罐補到 4', s['tanks'] == 4, s['tanks'])
    chk('鍵盤 C：cheats 計數 +1', s['cheats'] == 1 and s['lastCheat'] == 'secret', (s['cheats'], s['lastCheat']))

    # ② nes-cheat 事件（= 觸控 ★密技）
    fresh()
    page.evaluate("() => window.dispatchEvent(new CustomEvent('nes-cheat', {detail:{source:'touch'}}))")
    page.evaluate('() => __nes.step(3)')
    s = page.evaluate('() => window.GAME.state()')
    chk('nes-cheat 事件（★密技）同樣生效', s['cheats'] == 1 and s['lives'] == 9, (s['cheats'], s['lives']))

    # ③ 防連按
    page.evaluate("() => { for (let i=0;i<5;i++) window.dispatchEvent(new CustomEvent('nes-cheat')); }")
    page.evaluate('() => __nes.step(3)')
    s = page.evaluate('() => window.GAME.state()')
    chk('30 幀防連按：連按 5 次只算 1 次', s['cheats'] == 1, s['cheats'])
    page.evaluate('() => __nes.step(40)')
    page.evaluate("() => window.dispatchEvent(new CustomEvent('nes-cheat'))")
    page.evaluate('() => __nes.step(3)')
    s = page.evaluate('() => window.GAME.state()')
    chk('冷卻過後可以再按（不限次數）', s['cheats'] == 2, s['cheats'])

    # ④ GAME OVER → 一鍵續關
    fresh()
    page.evaluate("() => { window.GAME.dev.setLives(0); window.GAME.dev.hero().life = 1; }")
    page.evaluate("() => { window.GAME.dev.ctx(); NES.Input.inject(0,0); }")
    page.evaluate("() => { const h = window.GAME.dev.hero(); window.MG.Hero.kill(h, window.GAME.dev.ctx()); }")
    page.evaluate('() => __nes.step(140)')
    s = page.evaluate('() => window.GAME.state()')
    chk('命用完 → GAME OVER 畫面', s['mode'] == 'gameover', s['mode'])
    page.evaluate("() => window.dispatchEvent(new CustomEvent('nes-cheat'))")
    page.evaluate('() => __nes.step(5)')
    s = page.evaluate('() => window.GAME.state()')
    chk('GAME OVER 一鍵續關：3 條命回中繼點', s['mode'] in ('ready', 'play') and s['lives'] == 3,
        (s['mode'], s['lives']))
    chk('續關計數 +1', s['continues'] == 1, s['continues'])

    # ⑤ SELECT 也能續關（兩步版）
    fresh()
    page.evaluate("() => { window.GAME.dev.setLives(0); }")
    page.evaluate("() => { const h = window.GAME.dev.hero(); window.MG.Hero.kill(h, window.GAME.dev.ctx()); }")
    page.evaluate('() => __nes.step(140)')
    page.evaluate("() => __nes.tap('select', 1)")
    page.evaluate('() => __nes.step(5)')
    s = page.evaluate('() => window.GAME.state()')
    chk('GAME OVER 按 SELECT 續關', s['mode'] in ('ready', 'play') and s['lives'] == 3, (s['mode'], s['lives']))

    # ⑥ START 暫停 = 武器選單
    fresh()
    page.evaluate("() => __nes.tap('start', 1)")
    page.evaluate('() => __nes.step(4)')
    s = page.evaluate('() => window.GAME.state()')
    chk('START 進武器選單（遊戲凍結）', s['paused'] is True, s['paused'])
    x0 = s['x']
    page.evaluate("() => __nes.press(['right'], 30)")
    s = page.evaluate('() => window.GAME.state()')
    chk('暫停中主角不動', s['x'] == x0, (x0, s['x']))
    page.evaluate("() => __nes.tap('start', 1)")
    page.evaluate('() => __nes.step(4)')
    s = page.evaluate('() => window.GAME.state()')
    chk('再按 START 解除暫停', s['paused'] is False, s['paused'])

    if out:
        shot(page, out / 'cheat.png')
    print('\n==== 一鍵密技驗證：%s ====' % ('全部通過' if not bad else '%d 項失敗' % len(bad)))
    for b in bad:
        print('  FAIL', b)
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', default='frost', choices=STAGES)
    ap.add_argument('--all', action='store_true', help='選關畫面 → FROST → BLAZE（兩關連打）')
    ap.add_argument('--room', type=int, default=None, help='只跑某一間房（除錯）')
    ap.add_argument('--max-frames', type=int, default=60000)
    ap.add_argument('--lives', type=int, default=0, help='給機器人幾條命（0 = 用遊戲預設 3；死亡數照實回報）')
    ap.add_argument('--verbose', '-v', action='store_true')
    ap.add_argument('--shots', action='store_true', help='每關結束存一張截圖到 shots/play_mech/')
    ap.add_argument('--cheat', '--konami', dest='cheat', action='store_true',
                    help='不跑通關，改驗一鍵密技（C / ★密技 / nes-cheat / GAME OVER 續關 / START 暫停）')
    a = ap.parse_args()

    if not (ROOT / 'mech.html').exists():
        print('找不到 mech.html')
        return 2
    url = (ROOT / 'mech.html').as_uri() + '?debug=1&scale=1&mute=1'
    out_dir = (ROOT / 'shots' / 'play_mech') if a.shots else None

    bad = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text)
                if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)

        if a.cheat:
            rc = run_cheat(page, url, out_dir)
            if errs:
                print('PAGE ERRORS:', errs[:3])
                rc = 1
            browser.close()
            return rc

        if a.all:
            results, total = run_all(page, url, a.max_frames, a.verbose, a.lives, out_dir)
            print('')
            for r in results:
                print('%-6s cleared=%s frames=%d deaths=%d life=%s weapon=%s'
                      % (r['stage'], r.get('cleared'), r['frames'], r['deaths'], r.get('life'), r.get('weapon')))
                if not r.get('cleared') or r['deaths'] > 0:
                    bad = 1
            print('兩關合計 %d 幀（%.1f 秒）' % (total, total / 60.0988))
            if len(results) < len(STAGES):
                bad = 1
        else:
            r = run_stage(page, url, a.stage, a.max_frames, a.verbose, a.lives, a.room,
                          out_dir / ('%s.png' % a.stage) if out_dir else None)
            print('%-6s cleared=%s frames=%d deaths=%d life=%s reason=%s'
                  % (a.stage, r.get('cleared'), r['frames'], r['deaths'], r.get('life'), r.get('reason')))
            if not r.get('cleared'):
                bad = 1

        if errs:
            print('PAGE ERRORS:', errs[:3])
            bad = 1
        browser.close()
    return bad


if __name__ == '__main__':
    sys.exit(main())
