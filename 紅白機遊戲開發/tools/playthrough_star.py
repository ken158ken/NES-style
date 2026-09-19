# -*- coding: utf-8 -*-
"""《星塵勇者》通關機器人：貪婪策略走完一關，印 cleared / frames / deaths。

用法（PY=../卡比之星/.venv/bin/python）：
  $PY tools/playthrough_star.py --level 1-1
  $PY tools/playthrough_star.py --level 1-4 --seed 7 --max-frames 30000
  $PY tools/playthrough_star.py --all            # 依序跑 1-1..1-4（缺席的關自動略過）
  $PY tools/playthrough_star.py --level test     # main.js 的內建測試關（驗證機器人本身）
  $PY tools/playthrough_star.py --cheat          # 不通關，改驗一鍵密技（暫停 SELECT / GAME OVER SELECT）

策略（全部在頁面內跑，一次 evaluate 推 2000 幀，避免每幀 round-trip）：
  ① 基本動作：一直往右 + 按住 B 跑
  ② 起跳（大跳按住 A 40 幀 ⇒ 完整可變高度跳 = 80 px 高 / 152 px 遠；小跳 10 幀）條件任一成立：
     ※ 任務書原本寫「長按 20 幀」，實測 20 幀只有約 100 px 水平距離，過不了 W1 裡 7~8 欄寬的坑，
       故改成按滿整個上升段（= `NES.FX.SMB.jumpSim({hold:40})` 的那一組數字）。
       - 前方 2 格內、身體高度範圍有 solid 牆
       - 前方 1..3(4) 格是坑（那一欄整欄都沒有可站立面）／落點是 hurt 磚（尖刺 / 熔岩）
       - 前方 3 格（24 px）內、垂直差 ≤ 24 px 有敵人 → 只跳 10 幀（小跳踩敵）
         ※「前方 10 格內有坑」時不為敵人起跳：早跳會在坑上方才落下，而空中無法加速到跑速
         ※ 前方 10 格內有坑時不為敵人起跳（早跳會在坑上方才落下，空中加不到跑速）
  ③ 卡住（連續 120 幀 x 沒前進）→ 往左退 30 幀再試，退完把「起跳門檻」放寬一格
  ④ 死亡由遊戲自己處理（回檢查點），機器人只計數

結束碼：0 = 指定的關全部 cleared / 1 = 有關卡沒過 / 2 = 環境錯誤
"""
import argparse
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEVELS = ['1-1', '1-2', '1-3', '1-4']

BOT_JS = r"""
(opt) => {
  const BTN = NES.Input.BTN, d = window.GAME.dev;
  const S = () => window.GAME.state();
  const HOLDS = [10, 12, 15, 19, 24, 30, 40];   // 候選「按住 A 幀數」
  const LOOK = 75;                              // 「不跳會怎樣」要往前看幾幀
  const PROGRESS = 80;                          // 這 60 幀至少要前進幾 px，否則就找跳法
  // 死一次就換一組策略（起跳時機 / 偏好長跳 / 要不要踩敵），20 組輪著試
  const STRATS = [];
  [6, 8, 10, 12, 14].forEach(w => [false, true].forEach(lb => [true, false].forEach(eh => STRATS.push({ w: w, lb: lb, eh: eh }))));

  // ---- 跳躍模擬器：用 engine 的同一套物理（NES.FX.SMB）+ 關卡查詢，往前推演一次 ----
  // 把「該按住 A 幾幀」從猜測變成**驗證**：只挑真的能安全落地、而且有前進的那個。
  // 只模擬地形（不含敵人）：一路按住 右 + B，按住 A `hold` 幀（hold = 0 就是完全不跳）。
  window.__botSim = function (hold, x0, y0, vx0, noB) {
    const FX = NES.FX, SMB = FX.SMB;
    const W = 12, H = 22, MAXF = hold ? 220 : LOOK, MAXFALL = FX.v88(4, 0);
    const px = FX.Vec(x0), py = FX.Vec(y0), vx = FX.Acc(vx0), vy = FX.Acc(0);
    const js = SMB.jumpState(vy);
    let onGround = (hold === 0);
    if (hold > 0) SMB.jumpStart(js, Math.abs(vx0), py.sub);
    // 「走著掉下去」（沒有起跳）用的是大重力（gFall）——實機的 jumpGravity 在放開 A 之後
    // 就已經是 fastFall 狀態。少了這一行，模擬的自由落體會慢到 60 幀還沒掉出畫面，
    // 於是「直接走下去」被誤判成安全 ⇒ 機器人在浮台邊緣不起跳、直接走進虛空。
    else js.fastFall = true;
    const K = (c, r) => { const k = d.kindAt(c, r); return (k === 'slopeL' || k === 'slopeR') ? 'solid' : k; };
    function blockedH(x, y) {
      const c = x >> 3;
      return K(c, y >> 3) === 'solid' || K(c, (y + 11) >> 3) === 'solid' || K(c, (y + H - 1) >> 3) === 'solid';
    }
    function foot(x, frow, prevFeet) {
      const k = K(x >> 3, frow);
      if (k === 'solid') return true;
      if (k === 'oneway') return vy.v >= 0 && prevFeet <= (frow << 3);
      return false;
    }
    // 危險磚：尖刺 / 熔岩，**外加 1-4 的斧頭機關**——碰到斧頭會把整條橋（含主角腳下那一欄）
    // 拆掉，主角跟著掉進熔岩，所以對機器人來說斧頭等同致命磚，要跳過去。
    const AXE = (window.ST && ST.TILE) ? ST.TILE.AXE : -1;
    function hurtAt(x, y) {
      for (let c = x >> 3; c <= (x + W - 1) >> 3; c++) {
        for (let r = y >> 3; r <= (y + H - 1) >> 3; r++) {
          if (K(c, r) === 'hurt') return true;
          if (AXE >= 0 && d.tileAt(c, r) === AXE) return true;
        }
      }
      return false;
    }
    let f = 0, air = 0, x = x0, y = y0, firstAir = -1;
    while (f < MAXF) {
      const run = (!noB) && (onGround || Math.abs(vx.v) >= SMB.airRunSpeed);
      FX.aapproach(vx, run ? SMB.maxRun : SMB.maxWalk, run ? SMB.accRun : SMB.accWalk);
      if (!onGround) SMB.jumpGravity(js, f < hold, py.sub, MAXFALL);
      const prevFeet = FX.floorPx(py.sub) + H;
      FX.vadd(px, vx.v);
      x = FX.floorPx(px.sub); y = FX.floorPx(py.sub);
      if (blockedH(x + W - 1, y)) { x = (((x + W - 1) >> 3) << 3) - W; FX.vsetPx(px, x); FX.aset(vx, 0); }
      FX.vadd(py, vy.v);
      y = FX.floorPx(py.sub);
      if (vy.v >= 0) {
        const frow2 = (y + H) >> 3;
        if (foot(x, frow2, prevFeet) || foot(x + W - 1, frow2, prevFeet)) {
          y = (frow2 << 3) - H; FX.vsetPx(py, y); FX.aset(vy, 0); onGround = true;
        } else onGround = false;
      } else {
        onGround = false;
        const hrow2 = y >> 3;
        if (K(x >> 3, hrow2) === 'solid' || K((x + W - 1) >> 3, hrow2) === 'solid') {
          y = ((hrow2 + 1) << 3); FX.vsetPx(py, y); FX.aset(vy, 0);
        }
      }
      f++;
      if (!onGround) { air++; if (firstAir < 0) firstAir = f; }
      if (y > 240) return { ok: false, why: 'pit', x: x, y: y, f: f, dx: x - x0, firstAir: firstAir };
      if (hurtAt(x, y)) return { ok: false, why: 'hurt', x: x, y: y, f: f, dx: x - x0, firstAir: firstAir };
      if (hold > 0 && onGround && air > 2) return { ok: true, x: x, y: y, f: f, dx: x - x0, vx: vx.v };
    }
    return { ok: hold === 0, x: x, y: y, f: f, dx: x - x0, firstAir: firstAir, vx: vx.v };
  };

  window.__bot = {
    seed: (opt.seed >>> 0) || 1,
    frames: 0, deaths: 0, jump: 0, stuck: 0, stuckN: 0, lastX: -1, back: 0, loose: 0,
    done: null, cache: {},
    warnT: 10, enemyHop: true, longBias: false, jumpNoB: false, wantBack: 0
  };
  const B = window.__bot;
  B.stratOfs = B.seed % 20;
  function rnd() { B.seed = (B.seed * 1103515245 + 12345) & 0x7fffffff; return B.seed / 0x7fffffff; }

  // 決定這一幀要不要起跳、按住幾幀
  function decide(s, b) {
    const SIM = window.__botSim;
    // ① 前方有「可以踩的、而且高度跟主角差不多」的敵人 → 小跳踩它。
    //    飛行體（不可踩）飛在頭頂上，跳上去反而會撞到 ⇒ 直接從下面跑過去。
    const list = (s.inv > 0 || !b.enemyHop) ? [] : d.enemyList();   // 無敵中直接衝過去，不必踩
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.stompable === false) continue;
      if (e.x + e.w > s.x && e.x - s.x <= 28 && Math.abs(e.y - s.y) <= 20) {
        const r = SIM(10, s.x, s.y, s.vx);
        if (r.ok) return 10;
      }
    }
    // ② 「完全不跳」往前看 60 幀：能安全前進 ≥ 80 px 就不用跳
    const key = (s.x >> 1) + ':' + (s.y >> 1) + ':' + (s.vx >> 5) + ':' + (b.loose > 0 ? 1 : 0) + ':' + b.warnT + (b.longBias ? 'L' : '');
    const hit = b.cache[key];
    if (hit !== undefined) return hit;
    // 兩步推演：從落點 (x,y,vx) 出發，「不跳」或「某一種跳」至少要有一條活路
    function survivable(r) {
      if (SIM(0, r.x, r.y, r.vx).ok) return true;
      for (let j = 0; j < HOLDS.length; j++) if (SIM(HOLDS[j], r.x, r.y, r.vx).ok) return true;
      for (let j = 0; j < HOLDS.length; j++) if (SIM(HOLDS[j], r.x, r.y, r.vx, true).ok) return true;
      return false;
    }
    const r0 = SIM(0, s.x, s.y, s.vx);
    let hold = 0;
    // 前方 2 欄有「從地面往上連續的 solid」= 非跳不可的台階 / 牆
    const frow = (s.y + (s.crouch ? 14 : 22)) >> 3, fcol = (s.x + 11) >> 3;
    let stepUp = 0;
    for (let i = 1; i <= 2; i++) {
      let up = 0;
      while (up < 7 && d.kindAt(fcol + i, frow - 1 - up) === 'solid') up++;
      if (up > stepUp) stepUp = up;
    }
    // **盡量晚跳**：不跳會死、但還有 > 14 幀的緩衝時，先繼續跑把速度拉滿再說。
    //   （SMB 規則：起跳時 |vx| < $19 就整段滯空鎖在走速 ⇒ 早跳 = 跳不遠 = 掉進坑裡）
    // 「還有幾幀才踏空 / 踩到危險磚」——不是「還有幾幀才死」（掉下去還要飛 20 幀才出畫面）
    // 踏空那一幀就是最後的起跳機會（之後在空中就按不出跳了）；
    // 直接走進尖刺（沒有踏空）的話才用「碰到危險磚的那一幀」。
    const warn = r0.ok ? 999 : ((r0.firstAir >= 0) ? r0.firstAir : r0.f);
    const urgent = warn <= b.warnT || stepUp > 0 || b.loose > 0;
    // 起跳前方有「不可踩的飛行體」擋著 ⇒ 還有餘裕的話就晚一點再跳（等它飛過去）。
    // 天空關全程沒有地面，跳到一半被撞歪就是掉下去，所以寧可多等幾幀。
    if (urgent && warn > 3 && b.enemyHop) {
      const fl = d.enemyList();
      for (let i = 0; i < fl.length; i++) {
        const e = fl[i];
        if (e.stompable !== false) continue;
        if (e.x + e.w > s.x - 8 && e.x - s.x < 72 && Math.abs(e.y - s.y) < 44) return 0;
      }
    }
    if (urgent && !(r0.ok && r0.dx >= (b.loose > 0 ? PROGRESS + 40 : PROGRESS))) {
      // ③ 找最短、而且「早 4 px / 晚 4 px / 慢一點」三種擾動下都安全的跳法
      for (let ci = 0; ci < HOLDS.length; ci++) {
        const h = b.longBias ? HOLDS[HOLDS.length - 1 - ci] : HOLDS[ci];
        const r = SIM(h, s.x, s.y, s.vx);
        if (!r.ok || r.dx < 16 || (r0.ok && r.dx <= r0.dx)) continue;
        if (!(SIM(h, s.x - 10, s.y, s.vx - 96).ok && SIM(h, s.x + 8, s.y, s.vx).ok
          && SIM(h, s.x, s.y, s.vx - 96).ok)) continue;
        if (!survivable(r)) continue;          // 兩步：落點還要有活路（天空關的小浮台很關鍵）
        hold = h; break;
      }
      // 還是找不到就試「放開 B 的短跳」（空中鎖走速 ⇒ 飛得近很多，適合小浮台）
      if (!hold) {
        for (let ci = 0; ci < HOLDS.length; ci++) {
          const h = HOLDS[ci];
          const r = SIM(h, s.x, s.y, s.vx, true);
          if (!r.ok || r.dx < 12) continue;
          if (!(SIM(h, s.x - 8, s.y, s.vx - 64, true).ok && SIM(h, s.x + 6, s.y, s.vx, true).ok)) continue;
          if (!survivable(r)) continue;
          hold = -h; break;
        }
      }
      // 頭上有東西就跳不起來（W1 有「矮隧道 → 緊接大坑」的橋段）：
      // 這一幀先別浪費起跳，等鑽出隧道的那一幀再跳（那時 warn 會更小，一樣會觸發）。
      const hrow = s.y >> 3;
      const headBlocked = d.kindAt(s.x >> 3, hrow - 1) === 'solid' || d.kindAt((s.x + 11) >> 3, hrow - 1) === 'solid'
        || d.kindAt(s.x >> 3, hrow - 2) === 'solid' || d.kindAt((s.x + 11) >> 3, hrow - 2) === 'solid';
      // 一個安全跳法都找不到 ⇒ 多半是「助跑不夠」（剛落到小浮台上、速度還沒拉起來）。
      // 後面有路就先往左退一小段重新助跑，真的沒路可退才賭一把滿跳。
      if (!hold && !r0.ok && !headBlocked) {
        const back = (s.x - 20) >> 3;
        let room = true;
        for (let c = back; c <= (s.x >> 3) && room; c++) {
          let sr = -1;
          for (let r = frow - 2; r < 30; r++) { const kk = d.kindAt(c, r); if (kk === 'hurt') { sr = -2; break; } if (kk === 'solid' || kk === 'oneway') { sr = r; break; } }
          if (sr < 0 || sr > frow + 1) room = false;
        }
        if (room && b.loose === 0) { b.wantBack = 1; return 0; }
        hold = 40;
      }
      if (hold < 0 && headBlocked) hold = 0;
      if (headBlocked && hold > 0) hold = 0;
    }
    b.cache[key] = hold;
    return hold;
  }

  window.__botStep = function (n) {
    const b = window.__bot;
    for (let k = 0; k < n; k++) {
      const s = S();
      if (s.mode === 'clear') { b.done = { cleared: true, x: s.x, score: s.score, time: s.time, level: s.level }; return b; }
      if (s.mode === 'gameover') { b.done = { cleared: false, reason: 'gameover', x: s.x, level: s.level }; return b; }
      if (s.deaths > b.deaths) {
        b.deaths = s.deaths; b.jump = 0; b.back = 0; b.stuck = 0; b.stuckN = 0; b.loose = 0; b.lastX = -1;
        // 死了就換下一組策略參數再試（策略表固定 20 組，--seed 決定從哪一組開始 ⇒ 可重現）
        const st = STRATS[(b.deaths + b.stratOfs) % STRATS.length];
        b.warnT = st.w; b.longBias = st.lb; b.enemyHop = st.eh;
        b.cache = {};
      }
      if (s.mode === 'title') { __nes.tap('start', 1); b.frames++; continue; }
      if (s.mode === 'dead') { __nes.step(1); b.frames++; continue; }

      let mask = 0;
      if (b.back > 0) {
        // 卡住 → 往左退一段再試。退的時候絕對不能退進後面的坑裡。
        const frow = (s.y + (s.crouch ? 14 : 22)) >> 3;
        const behind = (s.x - 6) >> 3;
        let pitBehind = false;
        for (let c = behind; c >= behind - 1; c--) {
          let sr = -1;
          for (let r = frow; r < 30; r++) { const kk = d.kindAt(c, r); if (kk === 'hurt') { sr = -2; break; } if (kk === 'solid' || kk === 'oneway') { sr = r; break; } }
          if (sr < 0) pitBehind = true;
        }
        if (pitBehind) { b.back = 0; b.loose = 180; }
        else { b.back--; mask = BTN.LEFT; if (b.back === 0) b.loose = 180; }
      }
      // 魔王戰：魔王還活著就別跑過頭，貼上去踩頭 3 次（沒有旗桿磚，打倒魔王 = 過關）
      const bs = (d.boss && d.boss()) || null;
      if (b.back === 0 && bs && bs.active && bs.alive && !bs.dead) {
        const dx = (bs.x + 16) - (s.x + 6);
        mask = (dx >= 0 ? BTN.RIGHT : BTN.LEFT) | BTN.B;
        if (s.onGround && b.jump === 0 && Math.abs(dx) <= 40) b.jump = 16;
        if (b.jump > 0) { mask |= BTN.A; b.jump--; }
        __nes.press(mask, 1);
        b.frames++;
        b.lastX = -1; b.stuck = 0;
        if (b.frames >= opt.maxFrames) { b.done = { cleared: false, reason: 'timeout', x: S().x, level: S().level }; return b; }
        continue;
      }
      if (b.back === 0) {
        mask = BTN.RIGHT | ((b.jump > 0 && b.jumpNoB) ? 0 : BTN.B);
        if (s.onGround && b.jump === 0) {
          const h = decide(s, b);
          if (b.wantBack) { b.wantBack = 0; b.back = 18; }
          else if (h) { b.jump = (h < 0) ? -h : h; b.jumpNoB = (h < 0); }
        }
        if (b.loose > 0) b.loose--;
      }
      if (b.jump > 0) { mask |= BTN.A; b.jump--; }
      __nes.press(mask, 1);
      b.frames++;
      const s2 = S();
      if (s2.x > b.lastX) { b.lastX = s2.x; b.stuck = 0; }
      else if (++b.stuck >= 90) {
        b.stuck = 0; b.stuckN++;
        b.back = Math.min(20 + 30 * b.stuckN, 140);
        b.jump = 0;
        b.cache = {};                       // 換個決策（避免一直重播同一組錯誤選擇）
        if (b.stuckN > 2) rnd();
      }
      if (b.frames >= opt.maxFrames) { b.done = { cleared: false, reason: 'timeout', x: s2.x, level: s2.level }; return b; }
    }
    return b;
  };
  return window.__bot;
}
"""


# ============================================================ fix4：一鍵密技驗證
# 使用者回饋（2026-09-19）：「多個一鍵密技好了，當然也保留舊密技，不然死到一半就玩不下去了。」
#   START 暫停 → SELECT = 命補到 9 + 無敵 20 秒（1200 幀），不限次數、每次暫停只吃一次；
#   GAME OVER → SELECT = 3 條命回當前關卡的檢查點續關（分數保留），不限次數。
JS_TAPS = r"""
(keys) => {
  const B = NES.Input.BTN;
  for (const k of keys) {
    NES.Input.inject(B[k], 1); __nes.step(1);
    NES.Input.inject(0, 1); __nes.step(1);
  }
  return window.GAME.state();
}
"""


def shot(page, path, scale=3):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    d = page.evaluate("""(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
        const o=document.createElement('canvas'); o.width=c.width*s; o.height=c.height*s;
        const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height);
        return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(d.split(',', 1)[1]))
    print('  saved', path)


def run_cheat(page, url, level, out):
    """暫停 → SELECT → 命 / 無敵欄位變化 → 防連按 → 解除還原 → GAME OVER SELECT 續關。"""
    bad = []

    def chk(name, cond, detail=''):
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))
        if not cond:
            bad.append(name)

    def fresh():
        page.goto(url + '&level=' + level)
        page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
        page.evaluate('() => __nes.step(2)')
        return page.evaluate('() => window.GAME.state()')

    # ---------------------------------------------------------- 暫停 + SELECT
    before = fresh()
    page.evaluate("() => { __nes.press(['right'], 120); }")
    p1 = page.evaluate(JS_TAPS, ['START'])
    chk('START → 進入暫停', p1['paused'] is True and p1['mode'] == 'play', p1['mode'])
    chk('暫停畫面兩行：PAUSE / C OR $ = SECRET',
        p1['banner'] == ['PAUSE', 'C OR $ = SECRET'], p1['banner'])
    frz = page.evaluate("""() => { const a = window.GAME.state(); __nes.release(); __nes.step(90);
        const b = window.GAME.state();
        return { same: a.x === b.x && a.camX === b.camX && a.time === b.time, paused: b.paused }; }""")
    chk('暫停 90 幀：主角 / 鏡頭 / 計時器全部凍結', frz['same'] and frz['paused'], frz)
    shot(page, out / 'star_pause.png')
    a1 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('暫停 SELECT：命 %d → %d（補到 9）' % (before['lives'], a1['lives']), a1['lives'] == 9)
    chk('暫停 SELECT：無敵 1200 幀（20 秒）', a1['inv'] == 1200, a1['inv'])
    chk('暫停 SELECT：畫出 SECRET!',
        a1['banner'] == ['PAUSE', 'C OR $ = SECRET', 'SECRET!'], a1['banner'])
    chk('暫停 SELECT：觸發 powerup 音效', a1['lastSfx'] == 'powerup', a1['lastSfx'])
    shot(page, out / 'star_secret.png')
    page.evaluate("() => { GAME.dev.setLives(1); GAME.dev.hero().inv = 5; }")
    a2 = page.evaluate(JS_TAPS, ['SELECT', 'SELECT'])
    chk('防連按：同一次暫停再按 SELECT 無效',
        a2['secrets'] == 1 and a2['lives'] == 1, (a2['secrets'], a2['lives']))
    a3 = page.evaluate("() => { __nes.release(); __nes.step(70); return window.GAME.state(); }")
    chk('SECRET! 1 秒後收回、PAUSE 留著', a3['banner'] == ['PAUSE', 'C OR $ = SECRET'], a3['banner'])
    a4 = page.evaluate(JS_TAPS, ['START'])
    chk('再按 START → 解除暫停、文字收回', a4['paused'] is False and a4['banner'] is None, a4['banner'])
    rest = page.evaluate("""() => { const d = GAME.dev, s = window.GAME.state(), base = s.camX >> 3;
        let bad = 0;
        [[12, 13, 5], [15, 8, 15], [18, 12, 7]].forEach(function (t) {
          for (let i = 0; i < t[2]; i++)
            if (d.ntTileAt(base + t[1] + i, t[0]) !== d.bgIndexAt(base + t[1] + i, t[0])) bad++;
        });
        return bad; }""")
    chk('解除暫停後被文字蓋掉的地形磚全部還原', rest == 0, rest)
    a5 = page.evaluate("() => { __nes.press(['right'], 30); return window.GAME.state(); }")
    chk('解除暫停後遊戲繼續跑', a5['x'] > a4['x'], (a4['x'], a5['x']))
    shot(page, out / 'star_after.png')
    page.evaluate(JS_TAPS, ['START'])
    a6 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('不限次數：第 2 次暫停 SELECT 照樣生效',
        a6['secrets'] == 2 and a6['lives'] == 9 and a6['inv'] == 1200, (a6['secrets'], a6['lives']))
    page.evaluate(JS_TAPS, ['START'])

    # ------------------------------------------------- GAME OVER SELECT 續關
    fresh()
    over = page.evaluate("""() => { const d = GAME.dev, S = () => window.GAME.state();
        d.warp(300 * 8); __nes.step(4);          // 先走到關卡尾端（過檢查點 + camX % 512 >= 256）
        d.setScore(7700); d.setLives(0); d.kill();
        let n = 0; while (S().mode !== 'gameover' && n++ < 600) __nes.step(1);
        return S(); }""")
    chk('命盡 → GAME OVER', over['mode'] == 'gameover', over['mode'])
    chk('GAME OVER 畫面三行（多一行 C OR $ = CONTINUE）',
        over['banner'] == ['GAME OVER', 'PRESS START', 'C OR $ = CONTINUE'], over['banner'])
    shot(page, out / 'star_gameover.png')
    c1 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('GAME OVER 按 SELECT → 回遊戲、3 條命', c1['mode'] == 'play' and c1['lives'] == 3,
        (c1['mode'], c1['lives']))
    chk('SELECT 續關不清分數（%d → %d）' % (over['score'], c1['score']), c1['score'] == over['score'])
    chk('SELECT 續關回到當前關卡（%s）的檢查點 x=%d' % (c1['level'], c1['x']),
        c1['level'] == over['level'] and (over['checkpoint'] < 0 or abs(c1['x'] - over['checkpoint'] * 8) <= 32),
        (over['checkpoint'], c1['x']))
    chk('SELECT 續關計數 +1、字收回', c1['continues'] == 1 and c1['banner'] is None,
        (c1['continues'], c1['banner']))
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    chk('續關後畫面 lint 綠（≤ 25 色）', lt['ok'] and lt['colors'] <= 25,
        (lt['ok'], lt['colors']))
    shot(page, out / 'star_continue.png')
    c2 = page.evaluate("""() => { const d = GAME.dev, S = () => window.GAME.state(), B = NES.Input.BTN;
        d.setLives(0); d.kill();
        let n = 0; while (S().mode !== 'gameover' && n++ < 600) __nes.step(1);
        const m = S().mode;
        NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
        const s = S();
        return { over: m, mode: s.mode, lives: s.lives, continues: s.continues }; }""")
    chk('SELECT 續關不限次數（第 2 次照樣可用）',
        c2['over'] == 'gameover' and c2['mode'] == 'play' and c2['lives'] == 3 and c2['continues'] == 2, c2)

    # ================================================= fix5：真·一鍵密技（不必暫停）
    # 使用者回饋：「電腦版也要有一鍵密技…手機跟電腦都要，盡量一鍵，比較直觀。」
    print('  ---- fix5：真·一鍵密技（鍵盤 C / 觸控 ★密技 / nes-cheat）----')

    def keyC(steps=2):
        page.keyboard.press('KeyC')
        page.evaluate('(n)=>__nes.step(n)', steps)
        return page.evaluate('()=>window.GAME.state()')

    b5 = fresh()
    page.evaluate("() => { __nes.press(['right'], 40); __nes.release(); __nes.step(2); }")
    k1 = keyC()
    chk('play 中按 C：不必暫停就生效（paused=false）', k1['paused'] is False, k1['paused'])
    chk('play 中按 C：命 %d → %d、無敵 %d 幀' % (b5['lives'], k1['lives'], k1['inv']),
        k1['lives'] == 9 and k1['inv'] >= 1195)
    chk('play 中按 C：只疊 SECRET! 一行（不是暫停版三行）',
        k1['floatBanner'] == ['SECRET!'] and k1['banner'] is None,
        (k1['floatBanner'], k1['banner']))
    chk('play 中按 C：觸發 powerup 音效', k1['lastSfx'] == 'powerup', k1['lastSfx'])
    shot(page, out / 'onekey_play.png')
    base5 = k1['camX'] >> 3
    page.evaluate("() => { GAME.dev.setLives(1); GAME.dev.hero().inv = 5; }")
    k2 = keyC()
    chk('連按限制：30 幀內再按 C 無效', k2['cheats'] == 1 and k2['lives'] == 1,
        (k2['cheats'], k2['lives']))
    page.evaluate('()=>__nes.step(32)')
    k3 = keyC()
    chk('連按限制：過 30 幀後再按 C 又生效（不限次數）',
        k3['cheats'] == 2 and k3['lives'] == 9, k3['cheats'])
    page.evaluate("() => { __nes.release(); __nes.step(70); }")
    k4 = page.evaluate('()=>window.GAME.state()')
    rest5 = page.evaluate("""(base) => { const d = GAME.dev; let bad = 0;
        for (let i = 0; i < 7; i++)
          if (d.ntTileAt(base + 12 + i, 18) !== d.bgIndexAt(base + 12 + i, 18)) bad++;
        return bad; }""", base5)
    lt5 = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    chk('SECRET! 1 秒後收回、7 格地形逐格還原、lint 綠',
        k4['floatBanner'] is None and rest5 == 0 and lt5['ok'],
        (k4['floatBanner'], rest5, lt5['ok'], lt5['colors']))
    shot(page, out / 'onekey_after.png')
    k5 = page.evaluate("() => { __nes.press(['right'], 30); return window.GAME.state(); }")
    chk('按 C 之後遊戲照樣繼續跑（沒有被凍住）', k5['x'] > k4['x'], (k4['x'], k5['x']))
    k6 = page.evaluate("()=>{NES.Touch.cheat(); __nes.step(2); return window.GAME.state();}")
    chk('NES.Touch.cheat()（觸控 ★密技 鍵）也能發動', k6['cheats'] == 3, k6['cheats'])
    page.evaluate('()=>__nes.step(32)')
    page.evaluate(JS_TAPS, ['START'])
    page.evaluate("() => { GAME.dev.setLives(1); GAME.dev.hero().inv = 0; }")
    k7 = keyC()
    chk('暫停中按 C 也生效（暫停版三行 banner）',
        k7['paused'] is True and k7['lives'] == 9 and
        k7['banner'] == ['PAUSE', 'C OR $ = SECRET', 'SECRET!'], k7['banner'])
    page.evaluate(JS_TAPS, ['START'])

    fresh()
    o5 = page.evaluate("""() => { const d = GAME.dev, S = () => window.GAME.state();
        d.warp(300 * 8); __nes.step(4);
        d.setScore(6100); d.setLives(0); d.kill();
        let n = 0; while (S().mode !== 'gameover' && n++ < 600) __nes.step(1);
        return S(); }""")
    chk('命盡 → GAME OVER（第三行 C OR $ = CONTINUE）',
        o5['mode'] == 'gameover' and o5['banner'] == ['GAME OVER', 'PRESS START', 'C OR $ = CONTINUE'],
        o5['banner'])
    shot(page, out / 'onekey_gameover.png')
    k8 = keyC()
    chk('GAME OVER 按 C：立刻 3 條命續關、分數保留（%d → %d）' % (o5['score'], k8['score']),
        k8['mode'] == 'play' and k8['lives'] == 3 and k8['score'] == o5['score'], k8['mode'])
    chk('GAME OVER 按 C：回到當前關卡（%s）的檢查點 x=%d' % (k8['level'], k8['x']),
        k8['level'] == o5['level'] and
        (o5['checkpoint'] < 0 or abs(k8['x'] - o5['checkpoint'] * 8) <= 32),
        (o5['checkpoint'], k8['x']))
    lt6 = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    chk('C 續關後畫面 lint 綠（≤ 25 色）', lt6['ok'] and lt6['colors'] <= 25, (lt6['ok'], lt6['colors']))
    shot(page, out / 'onekey_continue.png')
    k9 = page.evaluate("""() => { const d = GAME.dev, S = () => window.GAME.state();
        d.setLives(0); d.kill();
        let n = 0; while (S().mode !== 'gameover' && n++ < 600) __nes.step(1);
        return S().mode; }""")
    k10 = keyC()
    chk('GAME OVER 按 C 不限次數（第 2 次照樣續關）',
        k9 == 'gameover' and k10['mode'] == 'play' and k10['cheatContinues'] == 2,
        k10['cheatContinues'])

    fresh()
    k11 = page.evaluate(JS_TAPS, ['START', 'SELECT'])
    chk('fix4 的暫停 + SELECT 仍可用', k11['secrets'] == 1 and k11['lives'] == 9 and k11['inv'] == 1200,
        (k11['secrets'], k11['lives']))


    print('\n==== 一鍵密技驗證：%s ====' % ('全部通過' if not bad else '%d 項失敗' % len(bad)))
    for b in bad:
        print('  FAIL', b)
    return 1 if bad else 0


def run_level(page, url, level, seed, max_frames, verbose, lives):
    page.goto(url + '&level=' + level)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    st = page.evaluate('() => window.GAME.state()')
    if st['level'] != level:
        print('level=%s 不存在（實際開到 %s）' % (level, st['level']))
        return None
    if lives:
        page.evaluate('(n) => window.GAME.dev.setLives(n)', lives)
    page.evaluate(BOT_JS, {'seed': seed, 'maxFrames': max_frames})
    b = None
    while True:
        b = page.evaluate('(n) => window.__botStep(n)', 2000)
        if b.get('done'):
            break
        if verbose:
            print('  ... frames=%d x=%s deaths=%d' % (b['frames'], page.evaluate('()=>window.GAME.state().x'), b['deaths']))
    d = b['done']
    d['frames'] = b['frames']
    d['deaths'] = b['deaths']
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', default='1-1')
    ap.add_argument('--all', action='store_true', help='依序跑 1-1..1-4')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--max-frames', type=int, default=20000)
    ap.add_argument('--lives', type=int, default=60, help='給機器人幾條命（死亡數照實回報）')
    ap.add_argument('--verbose', '-v', action='store_true')
    ap.add_argument('--cheat', '--konami', dest='cheat', action='store_true',
                    help='不跑通關，改驗 fix4 一鍵密技（暫停 SELECT = 命 9 + 無敵 20 秒 / '
                         'GAME OVER SELECT = 3 命回檢查點續關）'
                         ' + fix5 真·一鍵密技（鍵盤 C / 觸控 ★密技 / nes-cheat，不必暫停）')
    a = ap.parse_args()

    if not (ROOT / 'star.html').exists():
        print('找不到 star.html')
        return 2
    url = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'

    if a.cheat:
        out = ROOT / 'shots' / 'play_star' / 'cheat'
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            rc = run_cheat(page, url, a.level, out)
            if errs:
                print('PAGE ERRORS:', errs[:3])
                rc = 1
            browser.close()
        return rc

    todo = LEVELS if a.all else [a.level]
    bad = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        for lv in todo:
            has = page.evaluate if False else None
            r = run_level(page, url, lv, a.seed, a.max_frames, a.verbose, a.lives)
            if r is None:
                if a.all:
                    print('%-4s SKIP（關卡尚未就緒）' % lv)
                    continue
                bad = 1
                continue
            print('%-4s cleared=%s frames=%d deaths=%d%s'
                  % (lv, r['cleared'], r['frames'], r['deaths'],
                     ('  score=%s time=%s' % (r.get('score'), r.get('time'))) if r['cleared']
                     else ('  reason=%s x=%s' % (r.get('reason'), r.get('x')))))
            if not r['cleared']:
                bad = 1
        if errs:
            print('PAGE ERRORS:', errs[:3])
            bad = 1
        browser.close()
    return bad


if __name__ == '__main__':
    sys.exit(main())
