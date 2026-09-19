# -*- coding: utf-8 -*-
"""cruiser：自動通關機器人（貪婪 + 軌跡模擬）

策略（fix2-cruiser 改版）：
  - **按住 A**（R2 fix2 起 A 支援自動連射：邊緣 或 計時器歸零且按住，研究 §5-3）
  - 9 個候選方向，每個方向都**模擬「持續往該方向走」**：地形 84 幀、敵彈 / 敵人 40 幀，
    取最早碰撞幀算成本 ⇒ 機器人會真的往上 / 往下閃，而不是原地被瞄準彈鎖死
    （舊版只用「候選位置 + 停著不動」評估，上 / 下 / 停三者成本幾乎相同 ⇒ 永遠不做垂直閃避）
  - **打飛編隊優先**：瞄準目標優先選 fan 編隊（整隊打光才會掉膠囊），其次 zig / turret / tank
  - 撿到膠囊後按 B，順序 SPEED×2 → MISSILE → OPTION×2 → LASER；**死亡復活後願望清單重置**
    （死亡會清光強化並回到速度 1，不重新買 SPEED 就永遠追不開 2 px/幀 的瞄準彈）
  - 死亡就繼續（回檢查點），GAME OVER 或超過 --max-frames 就停

用法：
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py                 # 從頭跑
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py --camx 1024     # 分段驗證
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py --boss 1
"""
import argparse
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent   # tools/ 版（原 tools/playthrough_cruiser.py）
OUT = ROOT / 'shots' / 'play_cruiser'

BOT_JS = r"""
() => {
  // ---- 機器人：全部跑在頁面內，避免每幀一次 IPC ----
  const NESg = window.NES, CR = window.CR;
  const BTN = NESg.Input.BTN;
  const WISH = [1, 1, 2, 5, 5, 4];       // SPEED, SPEED, MISSILE, OPTION, OPTION, LASER
  const MOVES = [[0,0],[0,-1],[0,1],[1,0],[-1,0],[1,-1],[1,1],[-1,-1],[-1,1]];
  const TERR_H = 84, TERR_STEP = 4;      // 地形預判 84 幀（= 42 px 捲動）
  const THR_H = 56;                      // 敵彈 / 敵人預判 56 幀（魔王的環形 8 彈要更早看到）
  // 模擬時只「按住這個方向 HOLD 幀」，之後停住讓地形自己捲過來。
  // 若假設一路按到底，任何往上 / 往下的候選最後都會撞到天花板 / 地板 ⇒ 垂直移動永遠被罰，
  // 機器人就會退化成「只左右移動」（實測：魔王戰卡在 y = 94、打不到 y = 72 的裝甲板 18000 幀）。
  const HOLD = 24;
  const BOX_DX = 2, BOX_DY = 1, BOX_W = 12, BOX_H = 6;   // 自機碰撞框（相對精靈左上）

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
  }
  // 敵人種類 → 瞄準優先序（fan 編隊最優先：整隊打光才掉膠囊）
  function aimRank(k) { return k === 'fan' ? 0 : (k === 'zig' ? 1 : (k === 'turret' ? 2 : 3)); }

  window.__bot = {
    wish: WISH.slice(), deaths: 0, frames: 0, lastLives: 3, log: [], cause: '', wasAlive: true,
    lastMove: [0, 0],
    dbg: false, dbgCost: [], dbgHist: [],
    tick() {
      const s = CR.ship, st = CR.stage, g = window.GAME.state();
      let mask = 0;
      if (g.mode === 'title' || g.mode === 'gameover' || g.mode === 'stageclear') {
        if ((this.frames & 7) === 0) mask |= BTN.START;
        NESg.Input.inject(mask, 1); window.__nes.step(1); this.frames++;
        return g.mode;
      }
      if (!s.alive) { NESg.Input.inject(0, 1); window.__nes.step(1); this.frames++; return g.mode; }
      // 復活：強化全被清掉、速度回 1 ⇒ 願望清單也要重置，不然永遠不再買 SPEED
      if (!this.wasAlive) this.wish = WISH.slice();

      const spd = s.speedPx();
      const solid = (x, y) => { try { return !!st.solidAt(x | 0, y | 0); } catch (e) { return false; } };

      // ── 威脅清單（螢幕座標 + px/幀速度）──────────────────────────────
      const threats = [];
      st.bullets.each(b => {
        if (b.bg || b.big) threats.push({x: b.x, y: b.y, w: b.w, h: b.h, vx: 0, vy: 0, wt: 520});
        else threats.push({x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx / 256, vy: b.vy / 256, wt: 420});
      });
      st.enemies.each(e => {
        // fan 是正弦蛇行、zig 每 32 幀換向 ⇒ 垂直方向多留餘裕（線性外推不準）
        // 追蹤 / 蛇行的敵人線性外推不準 ⇒ 多留餘裕；tank 鎖定高度直衝，正面站著必死
        const pad = (e.kind === 'fan') ? 10 : (e.kind === 'zig' ? 8 : (e.kind === 'tank' ? 8 : 2));
        // 魔王部位釘在畫面上（上下小幅擺動），但 e.vx 是內部用的殘值 ⇒ 外推會誤判成「衝過來」，
        // 導致機器人把整片上下空間都當成死路，停在角落不敢靠近（實測卡 13000 幀不掉血）
        threats.push({x: e.x, y: e.y - pad, w: e.w, h: e.h + pad * 2,
                      vx: e.boss ? 0 : e.vx / 256,
                      vy: (e.boss || e.kind === 'fan' || e.kind === 'zig') ? 0 : e.vy / 256,
                      // 魔王部位是「必須靠近才打得到」的固定目標 ⇒ 威脅權重調低，不然機器人只會躲
                      // tank 鎖定高度直衝、hp 3 打不掉 ⇒ 權重最高；魔王部位最低（必須靠近才打得到）
                      wt: e.boss ? 150 : (e.kind === 'tank' ? 560 : 380), boss: !!e.boss});
      });

      // 魔王階段 3 的三連雷射：預告 30 幀是「背景磚」，機器人看不到，等雷射變成判定彈時
      // 已經是同一幀 0 距離 ⇒ 必死。改成直接讀 CR.Boss.state() 的預告，把 3 條列先當成威脅。
      if (st.bossActive && CR.Boss && CR.Boss.state) {
        const bs = CR.Boss.state();
        if (bs.active && (bs.laser === 'warn' || bs.laser === 'beam')) {
          const off = CR.Boss.LASER_OFF || [8, 24, 40];
          for (let i = 0; i < off.length; i++) {
            // tight：雷射之間只有 10 px 的縫，加了安全邊界就「哪裡都不能站」⇒ 這組威脅不加 pad
            threats.push({x: 0, y: bs.y + off[i] + 1, w: bs.x + 8, h: 6, vx: 0, vy: 0, wt: 900, tight: true});
          }
        }
      }

      // 膠囊：吸引（強化是唯一能追開瞄準彈的東西）
      let cap = null, capD = 1e9;
      st.capsules.each(c => {
        const d = Math.abs(c.x - s.sx) + Math.abs(c.y - s.sy);
        if (c.x > 4 && d < capD) { capD = d; cap = c; }
      });

      // 瞄準目標：**魔王部位 > fan 編隊 > zig > turret > tank**，同級取最近
      // （編隊要整隊打光才掉膠囊；魔王 24 血不主動對準就會像 qa2 那樣空耗 18000 幀）
      let aimY = null, aimBest = 1e9;
      st.enemies.each(e => {
        if (e.x <= s.sx + 40) return;
        const k = (e.boss ? -1e6 : aimRank(e.kind) * 500) + (e.x - s.sx);
        if (k < aimBest) { aimBest = k; aimY = e.y + e.h / 2; }
      });

      let best = null, bestCost = 1e18, bestThreat = 0, stayThreat = 0;
      if (this.dbg) this.dbgCost = [];
      for (let mi = 0; mi < MOVES.length; mi++) {
        const m = MOVES[mi];              // MOVES[0] = [0,0]（原地）⇒ 先算出「不動會不會被打到」
        const nx0 = Math.max(8, Math.min(240, s.sx + m[0] * spd));
        const ny0 = Math.max(16, Math.min(184, s.sy + m[1] * spd));
        let cost = 0;

        // ① 地形：沿「一直朝這個方向走」的軌跡模擬（相機 0.5 px/幀 ⇒ 地形相對左移）
        {
          const bx0 = nx0 + BOX_DX, by0 = ny0 + BOX_DY;
          if (solid(bx0, by0) || solid(bx0 + BOX_W, by0) ||
              solid(bx0, by0 + BOX_H) || solid(bx0 + BOX_W, by0 + BOX_H)) cost += 5e6;
          let px = nx0, py = ny0;
          for (let f = TERR_STEP; f <= TERR_H; f += TERR_STEP) {
            if (f <= HOLD) {
              px = Math.max(8, Math.min(240, px + m[0] * spd * TERR_STEP));
              py = Math.max(16, Math.min(184, py + m[1] * spd * TERR_STEP));
            }
            const qx = px + BOX_DX, qy = py + BOX_DY, ox = f * 0.5;
            let blocked = false;
            for (const yy of [qy - 1, qy + 3, qy + BOX_H + 1]) {
              if (solid(qx - 1 + ox, yy) || solid(qx + BOX_W + 1 + ox, yy)) { blocked = true; break; }
            }
            if (blocked) { cost += (TERR_H + 4 - f) * 400; break; }
          }
        }

        // ② 威脅：**同樣模擬「持續往這個方向走」**（舊版是「停在候選位置不動」⇒ 無法閃避瞄準彈）
        const cost0 = cost;
        for (const t of threats) {
          let px = nx0, py = ny0;
          for (let f = 1; f <= THR_H; f++) {
            if (f <= HOLD) {
              px = Math.max(8, Math.min(240, px + m[0] * spd));
              py = Math.max(16, Math.min(184, py + m[1] * spd));
            }
            const tx = t.x + t.vx * f, ty = t.y + t.vy * f;
            if (tx + t.w < -8 || tx > 264) break;
            const bx = px + BOX_DX, by = py + BOX_DY, pd = t.tight ? 0 : 4;
            if (aabb(bx - pd, by - pd, BOX_W + pd * 2, BOX_H + pd * 2, tx, ty, t.w, t.h)) {
              cost += t.wt * (THR_H + 2 - f); break;
            }
          }
          // 近距離額外懲罰（避免貼著敵人）；魔王部位除外 —— 它不會動，貼著它才打得到
          if (!t.boss) {
            const dx = (t.x + t.w / 2) - (nx0 + BOX_DX + BOX_W / 2);
            const dy = (t.y + t.h / 2) - (ny0 + BOX_DY + BOX_H / 2);
            const d2 = dx * dx + dy * dy;
            if (d2 < 900) cost += (900 - d2) * 2;
          }
        }
        const threatCost = cost - cost0;

        // ③ 膠囊吸引（有立即威脅時讓位給閃避）
        if (cap) cost += (threatCost > 0 ? 1 : 6) * (Math.abs(cap.x - nx0) + Math.abs(cap.y - ny0));

        // ③b 對準目標（fan 編隊優先）；沒有立即威脅時才積極對準
        if (aimY !== null) {
          const aimW = st.bossActive ? (threatCost > 0 ? 1.5 : 12) : (threatCost > 0 ? 0.5 : 9);
          cost += aimW * Math.abs(aimY - (ny0 + 4));
        }

        // ④ 待在左側 1/4（安全 + 有反應時間）；魔王戰稍微靠近
        const home = 56;              // 魔王戰也待在左側 1/4：自機彈往右飛，靠近沒有好處，只會少反應時間
        cost += (st.bossActive ? 2 : 5) * Math.abs(nx0 - home);   // 魔王戰以「對準核心」為主，站位讓步
        // 牆角＝沒有閃避空間。**平方懲罰**：離牆越近漲得越凶，量級要能跟威脅成本
        // （wt × 42 ≈ 1.6 萬）比才壓得住「一路往左退到死」的貪婪解 —— 舊版線性 200/px
        // 在 x = 8 只有 6400，永遠比撞上便宜 ⇒ 機器人必定退到左牆角被瞄準彈 / 編隊吃掉。
        if (nx0 < 48) cost += (48 - nx0) * (48 - nx0) * 32;
        if (ny0 < 36) cost += (36 - ny0) * (36 - ny0) * 10;
        if (ny0 > 164) cost += (ny0 - 164) * (ny0 - 164) * 10;

        // ⑥ 動量（抑制抖動）：上一幀往上、這一幀往下 ⇒ 兩幀淨位移 0，永遠閃不開
        //    （實測魔王戰死亡就是這種「上 19 / 下 19 逐幀交替」的對稱解）。
        //    **只在「原地不動會被打到」＝正在閃避時才生效**：平時要留給瞄準微調
        //    （速度 1 時瞄準梯度只有 30/幀，動量一大就永遠對不準核心）。
        if (mi === 0) stayThreat = threatCost;
        if (stayThreat > 0) {
          const lm = this.lastMove;
          if (m[0] !== lm[0] || m[1] !== lm[1]) cost += 150;
          if (lm[1] !== 0 && m[1] === -lm[1]) cost += 1600;
          if (lm[0] !== 0 && m[0] === -lm[0]) cost += 700;
        }

        if (this.dbg) this.dbgCost.push([m[0], m[1], Math.round(cost), Math.round(threatCost)]);
        if (cost < bestCost) { bestCost = cost; best = m; bestThreat = threatCost; }
      }
      this.lastMove = best;
      if (best[0] > 0) mask |= BTN.RIGHT; else if (best[0] < 0) mask |= BTN.LEFT;
      if (best[1] > 0) mask |= BTN.DOWN; else if (best[1] < 0) mask |= BTN.UP;

      // 射擊：R2 fix2 起「按住 A」＝自動連射（20 幀間隔 + 子彈在畫面上時凍結）
      mask |= BTN.A;

      // 強化：能量表到了想要的格就按 B（B 是邊緣）
      let want = this.wish.length ? this.wish[0] : -1;
      // 魔王戰不會再掉膠囊 ⇒ 手上有幾格就花幾格（4 = LASER 貫穿 / 5 = OPTION / 6 = 護盾），
      // 不然會像 qa2 那樣抱著 gauge 4 等一顆永遠不會出現的膠囊，用單發彈磨 24 血
      if (st.bossActive && g.gauge >= 4) want = g.gauge;   // 只花在 LASER / OPTION / 護盾
      if (want >= 0 && g.gauge === want && (this.frames & 1) === 1) {
        mask |= BTN.B;
        if (this.wish.length && this.wish[0] === want) this.wish.shift();
      }

      NESg.Input.inject(mask, 1);
      window.__nes.step(1);
      this.frames++;
      // 死亡瞬間（alive true → false）就地判死因
      if (this.wasAlive && !s.alive) {
        const rb = {x: s.x, y: s.y, w: BOX_W, h: BOX_H};
        let c = '';
        if (solid(rb.x, rb.y) || solid(rb.x + rb.w - 1, rb.y) ||
            solid(rb.x, rb.y + rb.h - 1) || solid(rb.x + rb.w - 1, rb.y + rb.h - 1)) c = 'terrain';
        st.bullets.each(b => { if (!c && aabb(rb.x-1, rb.y-1, rb.w+2, rb.h+2, b.x, b.y, b.w, b.h)) c = 'bullet'; });
        st.enemies.each(e => { if (!c && aabb(rb.x-1, rb.y-1, rb.w+2, rb.h+2, e.x, e.y, e.w, e.h)) c = 'enemy:' + e.kind; });
        this.deaths++;
        const gg = window.GAME.state();
        this.log.push({f: this.frames, camX: gg.camX, cause: c || '?', at: [s.sx, s.sy],
                       spd: gg.speed, pow: gg.power});
      }
      if (this.dbg) {
        this.dbgHist.push({f: this.frames, x: s.sx, y: s.sy, alive: s.alive,
          best: best.slice(), costs: this.dbgCost,
          thr: threats.map(t => [t.x | 0, t.y | 0, t.w, t.h, Math.round(t.vx * 10) / 10])});
        if (this.dbgHist.length > 40) this.dbgHist.shift();
      }
      this.wasAlive = s.alive;
      const g2 = window.GAME.state();
      this.lastLives = g2.lives;
      return g2.mode;
    },
    run(n) {
      for (let i = 0; i < n; i++) {
        const m = this.tick();
        const g = window.GAME.state();
        if (g.stage && g.stage.cleared) return {done: 'cleared', mode: m};
        if (m === 'gameover') return {done: 'gameover', mode: m};
      }
      return {done: '', mode: window.GAME.state().mode};
    }
  };
  return true;
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--camx', type=int, default=None)
    ap.add_argument('--boss', type=int, default=None)
    ap.add_argument('--max-frames', type=int, default=30000)
    ap.add_argument('--tag', default='')
    ap.add_argument('--shots', action='store_true', help='每 1200 幀截一張')
    args = ap.parse_args()

    q = '?debug=1&scale=1&mute=1'
    if args.camx is not None:
        q += '&camx=%d' % args.camx
    if args.boss is not None:
        q += '&boss=%d' % args.boss
    tag = args.tag or ('camx%d' % args.camx if args.camx is not None else
                       ('boss%d' % args.boss if args.boss is not None else 'full'))

    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page(viewport={'width': 900, 'height': 800})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto((ROOT / 'cruiser.html').as_uri() + q)
        page.wait_for_function('()=>!!window.__nes && !!window.CR && !!window.CR.ship')
        page.evaluate("()=>{__nes.tap('start',1); __nes.step(2);}")
        page.evaluate(BOT_JS)
        done = ''
        chunk = 600
        total = 0
        while total < args.max_frames:
            r = page.evaluate("(n)=>__bot.run(n)", chunk)
            total = page.evaluate("()=>__bot.frames")
            g = page.evaluate("()=>window.GAME.state()")
            print('f=%-6d mode=%-10s camX=%-5d lives=%d deaths=%d score=%-7d gauge=%d spd=%d '
                  'pow=%s enemies=%d boss=%s' %
                  (total, g['mode'], g['camX'], g['lives'],
                   page.evaluate("()=>__bot.deaths"), g['score'], g['gauge'], g['speed'],
                   ''.join(k[0].upper() if g['power'][k] else '-'
                           for k in ('missile', 'double', 'laser')) + str(g['power']['option']) +
                   str(g['power']['shield']),
                   g['enemies'], g['stage']['bossActive']))
            if args.shots and (total // 1200) != ((total - chunk) // 1200):
                shot(page, OUT / 'bot' / ('%s_f%05d.png' % (tag, total)))
            if r['done']:
                done = r['done']
                break
        g = page.evaluate("()=>window.GAME.state()")
        log = page.evaluate("()=>__bot.log")
        deaths = page.evaluate("()=>__bot.deaths")
        print('\n==== 機器人結果（%s）====' % tag)
        print('結束原因 =', done or '達到 --max-frames')
        print('幀數 =', total, ' 死亡數 =', deaths, ' 剩餘船 =', g['lives'],
              ' camX =', g['camX'], '/', g['stage']['length'] * 8,
              ' score =', g['score'], ' cleared =', g['stage']['cleared'])
        print('死亡紀錄 =', json.dumps(log, ensure_ascii=False))
        if errs:
            print('頁面錯誤 =', errs[:5])
        shot(page, OUT / 'bot' / ('%s_end.png' % tag))
        br.close()
    return 0 if done == 'cleared' else 1


if __name__ == '__main__':
    sys.exit(main())
