# -*- coding: utf-8 -*-
"""cruiser：自動通關機器人（貪婪 + 軌跡模擬）

策略（fix2-cruiser 初版、fix3-cruiser 修訂）：
  - **按住 A**（R2 fix2 起 A 支援自動連射：邊緣 或 計時器歸零且按住，研究 §5-3）
  - 9 個候選方向，每個方向都**模擬「持續往該方向走」**：地形 84 幀、敵彈 / 敵人 56 幀，
    取最早碰撞幀算成本 ⇒ 機器人會真的往上 / 往下閃，而不是原地被瞄準彈鎖死
    （舊版只用「候選位置 + 停著不動」評估，上 / 下 / 停三者成本幾乎相同 ⇒ 永遠不做垂直閃避）
  - **紅色單體優先**（fix3）：`e.drop` 的敵人 1 發必掉膠囊 ⇒ 瞄準優先序排在 fan 編隊之前
  - 撿到膠囊後按 B，順序 SPEED×2 → MISSILE → LASER → OPTION×2；**死亡復活後願望清單重置**
    （死亡會清光強化並回到速度 1，不重新買 SPEED 就永遠追不開 2 px/幀 的瞄準彈）
  - 死亡就繼續（回檢查點），GAME OVER 或超過 --max-frames 就停

fix3 的三項機器人修正（都附實測依據，見程式內註解）：
  ① 模擬視野改成「固定看 40 px」而不是「固定看 24 幀」——速度 4 時 24 幀 = 60 px，
     在核心室（天花板 3 列）等於「往上一定撞牆」⇒ 機器人被鎖在 y 86，雷射從裝甲板下緣擦過去
  ② 膠囊吸引權重 6 → 14（大於「對準敵人」的 9）⇒ 掉 15 顆撿 14 顆（原本掉 10 撿 5）
  ③ 魔王戰手上有幾格能量就花掉（原本要 ≥ 4 才花）

用法：
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py                 # 從頭跑
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py --camx 1024     # 分段驗證
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py --boss 1
  ../卡比之星/.venv/bin/python tools/playthrough_cruiser.py --konami        # 驗秘技流程（不通關）
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
  // fix3：LASER 提前到 OPTION 之前（格 4 比格 5 便宜 1 顆膠囊，而且雷射貫穿 ⇒ 魔王 24 血打得完）
  const WISH = [1, 1, 2, 4, 5, 5];       // SPEED, SPEED, MISSILE, LASER, OPTION, OPTION
  const MOVES = [[0,0],[0,-1],[0,1],[1,0],[-1,0],[1,-1],[1,1],[-1,-1],[-1,1]];
  const TERR_H = 84, TERR_STEP = 4;      // 地形預判 84 幀（= 42 px 捲動）
  const THR_H = 56;                      // 敵彈 / 敵人預判 56 幀（魔王的環形 8 彈要更早看到）
  // 模擬時只「按住這個方向 HOLD 幀」，之後停住讓地形自己捲過來。
  // 若假設一路按到底，任何往上 / 往下的候選最後都會撞到天花板 / 地板 ⇒ 垂直移動永遠被罰，
  // 機器人就會退化成「只左右移動」（實測：魔王戰卡在 y = 94、打不到 y = 72 的裝甲板 18000 幀）。
  const HOLD = 24, HOLD_PX = 40;
  // fix3：HOLD 是「幀數」⇒ 速度越高模擬位移越遠。速度 4（2.5 px/幀）時 24 幀 = 60 px，
  // 在核心室（天花板 3 列 = y < 24）代表「往上」永遠會撞天花板 ⇒ 任何向上候選都被罰 2.6 萬，
  // 機器人被鎖在 y 86、雷射從 y 88 擦過 y 72..88 的裝甲板下緣（實測 24000 幀 0 傷害）。
  // 改成**固定看 40 px**（幀數 = 40 / 速度，上限 24、下限 8）⇒ 上下對稱。
  const holdFor = (spd) => Math.max(8, Math.min(HOLD, Math.round(HOLD_PX / spd)));
  const BOX_DX = 2, BOX_DY = 1, BOX_W = 12, BOX_H = 6;   // 自機碰撞框（相對精靈左上）

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
  }
  // 敵人種類 → 瞄準優先序（fan 編隊最優先：整隊打光才掉膠囊）
  // fix3：`e.drop` 的**紅色單體**是「1 發必掉膠囊」的保底管道 ⇒ 優先序排在 fan 之前
  //       （人類玩家學到「紅色 = 有獎」之後也是這樣打）。
  // R3 擴關：mouth（石像的嘴）= 打掉整隻石像的唯一方法 ⇒ 最優先；invuln 的（火山彈 / 石像本體）跳過
  const AIMR = {fan: 1, mouth: 1, zig: 2, split: 2, egg: 2, homing: 2,
                turret: 3, crawl: 3, turret4: 3, rock: 4, brick: 5, tent: 5};
  function aimRank(k) { return AIMR[k] || 5; }
  // 威脅權重：打不破的東西（火山彈 / 石像本體 / 岩壁 / 觸手）要更遠地避開
  function threatWt(e) {
    if (e.boss) return 150;
    if (e.invuln) return 620;
    if (e.kind === 'tank') return 560;
    if (e.kind === 'brick' || e.kind === 'tent') return 560;
    if (e.kind === 'homing') return 480;
    return 380;
  }
  function threatPad(e) {
    if (e.kind === 'fan') return 10;
    if (e.kind === 'homing') return 10;
    if (e.kind === 'zig' || e.kind === 'tank' || e.kind === 'split') return 8;
    return 2;
  }

  window.__bot = {
    wish: WISH.slice(), deaths: 0, frames: 0, lastLives: 3, log: [], cause: '', wasAlive: true,
    lastMove: [0, 0],
    // R3：--assist（密技輔助）與跨關統計
    assist: false, cheats: 0, stages: [], lastStage: 1, stageF0: 0,
    dbg: false, dbgCost: [], dbgHist: [],
    tick() {
      const s = CR.ship, st = CR.stage, g = window.GAME.state();
      let mask = 0;
      if (g.mode === 'title' || g.mode === 'gameover' || g.mode === 'stageclear' || g.mode === 'ending') {
        if ((this.frames & 7) === 0) mask |= BTN.START;
        NESg.Input.inject(mask, 1); window.__nes.step(1); this.frames++;
        return g.mode;
      }
      if (!s.alive) { NESg.Input.inject(0, 1); window.__nes.step(1); this.frames++; return g.mode; }
      // 復活：強化全被清掉、速度回 1 ⇒ 願望清單也要重置，不然永遠不再買 SPEED
      if (!this.wasAlive) this.wish = WISH.slice();

      const spd = s.speedPx();
      const hold = holdFor(spd);
      const solid = (x, y) => { try { return !!st.solidAt(x | 0, y | 0); } catch (e) { return false; } };

      // ── 威脅清單（螢幕座標 + px/幀速度）──────────────────────────────
      // R3 --assist：每 120 幀按一次一鍵密技（SPEED / MISSILE / OPTION x2 / 護盾），驗「通路存在」
      if (this.assist && (this.frames % 120) === 0 && CR.cheat) { CR.cheat(); this.cheats++; }
      const threats = [];
      st.bullets.each(b => {
        if (b.bg || b.big) threats.push({x: b.x, y: b.y, w: b.w, h: b.h, vx: 0, vy: 0, wt: 520});
        else threats.push({x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx / 256, vy: b.vy / 256, wt: 420});
      });
      st.enemies.each(e => {
        // fan 是正弦蛇行、zig 每 32 幀換向 ⇒ 垂直方向多留餘裕（線性外推不準）
        // 追蹤 / 蛇行的敵人線性外推不準 ⇒ 多留餘裕；tank 鎖定高度直衝，正面站著必死
        const pad = threatPad(e);
        // 魔王部位釘在畫面上（上下小幅擺動），但 e.vx 是內部用的殘值 ⇒ 外推會誤判成「衝過來」，
        // 導致機器人把整片上下空間都當成死路，停在角落不敢靠近（實測卡 13000 幀不掉血）
        threats.push({x: e.x, y: e.y - pad, w: e.w, h: e.h + pad * 2,
                      vx: e.boss ? 0 : e.vx / 256,
                      vy: (e.boss || e.kind === 'fan' || e.kind === 'zig' || e.anchored) ? 0 : e.vy / 256,
                      // 魔王部位是「必須靠近才打得到」的固定目標 ⇒ 威脅權重調低，不然機器人只會躲
                      // tank 鎖定高度直衝、hp 3 打不掉 ⇒ 權重最高；魔王部位最低（必須靠近才打得到）
                      wt: threatWt(e), boss: !!e.boss});
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
        if (e.invuln) return;                 // R3：打不破的（火山彈 / 石像本體）不值得瞄
        const k = (e.boss ? -1e6 : (e.drop ? 0 : aimRank(e.kind) * 500)) + (e.x - s.sx);
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
            if (f <= hold) {
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
            if (f <= hold) {
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
        // fix3：權重 6 比「對準目標」的 9 還小 ⇒ 機器人寧可繼續瞄敵人，實測掉 10 顆只撿到 5 顆。
        //       調到 14（大於 aim 的 9、home 的 5）⇒ 沒有立即威脅時優先去接膠囊。
        if (cap) cost += (threatCost > 0 ? 2 : 14) * (Math.abs(cap.x - nx0) + Math.abs(cap.y - ny0));

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
      // fix3：魔王戰不會再掉膠囊 ⇒ 手上有幾格就立刻花掉（1 SPEED / 3 DOUBLE 都比抱著不用好）
      if (st.bossActive && g.gauge >= 1) want = g.gauge;
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
        st.bullets.each(b => { if (!c && aabb(rb.x-1, rb.y-1, rb.w+2, rb.h+2, b.x, b.y, b.w, b.h))
          c = 'bullet(' + (Math.round(b.vx / 25.6) / 10) + ',' + (Math.round(b.vy / 25.6) / 10) + ')'; });
        st.enemies.each(e => { if (!c && aabb(rb.x-1, rb.y-1, rb.w+2, rb.h+2, e.x, e.y, e.w, e.h)) c = 'enemy:' + e.kind; });
        this.deaths++;
        const gg = window.GAME.state();
        this.log.push({f: this.frames, camX: gg.camX, cause: c || '?', at: [s.sx, s.sy],
                       spd: gg.speed, pow: gg.power,
                       boss: (CR.Boss && CR.Boss.state) ? CR.Boss.state().phase : 0,
                       nb: st.aliveBullets ? st.aliveBullets() : 0});
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
        const sn = (g.stage && g.stage.index) || 1;
        if (sn !== this.lastStage) {           // R3：換關 -> 記一筆並重新計時
          this.stages.push({stage: this.lastStage, frames: this.frames - this.stageF0,
                            deaths: this.deaths, score: g.score, loop: g.loop});
          this.lastStage = sn; this.stageF0 = this.frames;
        }
        if (g.stage && g.stage.cleared && !this.chain) return {done: 'cleared', mode: m};
        if (m === 'ending') return {done: 'ending', mode: m};
        if (m === 'gameover') return {done: 'gameover', mode: m};
      }
      return {done: '', mode: window.GAME.state().mode};
    },
    chain: false
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


# ============================================================ Konami 秘技驗證
# 研究 §9-1 [源]：暫停中 ↑↑↓↓←→←→BA → SPEED UP ×1 / MISSILE / OPTION ×2 / 護盾，一場 1 次；
#                 GAME OVER 畫面輸入同一組 → 3 條命續關（分數不清）。
CODE_FC = ['UP', 'UP', 'DOWN', 'DOWN', 'LEFT', 'RIGHT', 'LEFT', 'RIGHT', 'B', 'A']
CODE_V1 = ['UP', 'UP', 'DOWN', 'DOWN', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'A', 'B']
CODE_V2 = ['A', 'B', 'A', 'B']

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


def run_konami(page, out):
    """暫停 → 輸入指令 → 強化欄位變化 → 一次限制 → GAME OVER 續關。回傳 0 / 1。"""
    bad = []

    def chk(name, cond, detail=''):
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))
        if not cond:
            bad.append(name)

    def fresh(query=''):
        page.goto((ROOT / 'cruiser.html').as_uri() + '?debug=1&scale=1&mute=1' + query)
        page.wait_for_function('()=>!!window.__nes && !!window.CR && !!window.CR.ship')
        page.evaluate("()=>{__nes.tap('start',1); __nes.step(30);}")
        return page.evaluate('()=>window.GAME.state()')

    for name, code in (('原版 ↑↑↓↓←→←→BA', CODE_FC),
                       ('變體 ↑↑↓↓←←→→AB', CODE_V1),
                       ('變體 ABAB', CODE_V2)):
        before = fresh()
        p1 = page.evaluate(JS_TAPS, ['START'])
        chk('%s：START 進入暫停（畫面出現 PAUSE）' % name,
            p1['paused'] and 'PAUSE' in p1['msg'].split('|')[0], p1['msg'].split('|')[0].strip())
        after = page.evaluate(JS_TAPS, code)
        chk('%s：SPEED %d → %d' % (name, before['speed'], after['speed']),
            after['speed'] == before['speed'] + 1)
        chk('%s：MISSILE / OPTION×2 / 護盾 5' % name,
            after['power']['missile'] and after['power']['option'] == 2 and after['power']['shield'] == 5,
            after['power'])
        chk('%s：不含 DOUBLE / LASER' % name,
            not after['power']['double'] and not after['power']['laser'], after['power'])
        chk('%s：顯示 SECRET!' % name, 'SECRET' in after['msg'].split('|')[1], after['msg'].split('|')[1].strip())
        chk('%s：一場只能用 1 次（剩餘 %d）' % (name, after['secretLeft']),
            after['secretLeft'] == 0 and after['secrets'] == 1)
        again = page.evaluate(JS_TAPS, code)
        chk('%s：再輸入一次無效' % name, again['secrets'] == 1)
        if code is CODE_FC:
            shot(page, out / 'konami_secret.png')
            back = page.evaluate(JS_TAPS, ['START'])
            chk('再按 START 解除暫停、遊戲繼續', not back['paused'])
            go = page.evaluate("()=>{__nes.release(); __nes.step(60); return window.GAME.state();}")
            chk('解除暫停後相機繼續捲動', go['camX'] > back['camX'], (back['camX'], go['camX']))
            shot(page, out / 'konami_after.png')

    # ---- GAME OVER 續關 ----
    fresh('&camx=1600')
    over = page.evaluate(r"""()=>{
      CR.ship.addScore(12300);
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      return window.GAME.state();
    }""")
    chk('打到沒命 → GAME OVER', over['mode'] == 'gameover' and over['lives'] == 0, over['mode'])
    shot(page, out / 'konami_gameover.png')
    cont = page.evaluate(JS_TAPS, CODE_FC)
    chk('GAME OVER 輸入指令 → 續關回遊戲', cont['mode'] == 'play', cont['mode'])
    chk('續關給 3 條命', cont['lives'] == 3, cont['lives'])
    chk('續關不清分數（%d → %d）' % (over['score'], cont['score']), cont['score'] >= over['score'])
    chk('續關回到 GAME OVER 前的檢查點 camX=%d' % cont['camX'], cont['camX'] == over['continueCam'],
        (over['continueCam'], cont['camX']))
    chk('續關後強化歸零、秘技次數重設 1',
        cont['power']['option'] == 0 and cont['speed'] == 1 and cont['secretLeft'] == 1)
    shot(page, out / 'konami_continue.png')

    # ================================================================ fix4：一鍵密技
    # 使用者回饋：「多個一鍵密技好了，當然也保留舊密技」⇒ 暫停 SELECT / GAME OVER SELECT。
    print('  ---- fix4：一鍵密技（SELECT）----')
    before = fresh()
    p1 = page.evaluate(JS_TAPS, ['START'])
    chk('暫停畫面兩行：PAUSE / C OR $ = SECRET',
        'PAUSE' in p1['msg'].split('|')[0] and 'C OR $ = SECRET' in p1['msg2'].split('|')[0],
        (p1['msg'].split('|')[0].strip(), p1['msg2'].split('|')[0].strip()))
    a1 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('暫停 SELECT：SPEED %d → %d' % (before['speed'], a1['speed']),
        a1['speed'] == before['speed'] + 1)
    chk('暫停 SELECT：MISSILE / OPTION×2 / 護盾 5',
        a1['power']['missile'] and a1['power']['option'] == 2 and a1['power']['shield'] == 5,
        a1['power'])
    chk('暫停 SELECT：顯示 SECRET!', 'SECRET' in a1['msg'].split('|')[1], a1['msg'].split('|')[1].strip())
    chk('暫停 SELECT **不消耗** Konami 的一場 1 次額度', a1['secretLeft'] == 1, a1['secretLeft'])
    shot(page, out / 'select_secret.png')
    page.evaluate("()=>{CR.ship.power.option=0; CR.ship.power.shield=0; CR.ship.syncOptions();}")
    a2 = page.evaluate(JS_TAPS, ['SELECT', 'SELECT'])
    chk('防連按：同一次暫停再按 SELECT 無效',
        a2['selectSecrets'] == 1 and a2['power']['option'] == 0, a2['selectSecrets'])
    page.evaluate(JS_TAPS, ['START'])                    # 解除
    page.evaluate("()=>{__nes.release(); __nes.step(20);}")
    page.evaluate(JS_TAPS, ['START'])                    # 再暫停
    a3 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('不限次數：第 2 次暫停 SELECT 照樣生效',
        a3['selectSecrets'] == 2 and a3['power']['option'] == 2 and a3['power']['shield'] == 5,
        a3['selectSecrets'])
    a4 = page.evaluate(JS_TAPS, CODE_FC)
    chk('舊密技保留：用過 SELECT 之後 Konami 序列仍可用（此時才扣額度）',
        a4['secretLeft'] == 0 and a4['secrets'] == a3['secrets'] + 1, (a3['secrets'], a4['secrets']))

    fresh('&camx=1600')
    o2 = page.evaluate(r"""()=>{
      CR.ship.addScore(9800);
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      return window.GAME.state();
    }""")
    chk('GAME OVER 畫面多一行 C OR $ = CONTINUE',
        'C OR $ = CONTINUE' in o2['msg2'].split('|')[1], o2['msg2'].split('|')[1].strip())
    shot(page, out / 'select_gameover.png')
    c2 = page.evaluate(JS_TAPS, ['SELECT'])
    chk('GAME OVER 按 SELECT → 3 條命續關回檢查點 camX=%d' % c2['camX'],
        c2['mode'] == 'play' and c2['lives'] == 3 and c2['camX'] == o2['continueCam'],
        (o2['continueCam'], c2['camX'], c2['lives']))
    chk('SELECT 續關不清分數（%d → %d）' % (o2['score'], c2['score']), c2['score'] >= o2['score'])
    shot(page, out / 'select_continue.png')
    c3 = page.evaluate(r"""()=>{
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      const m = window.GAME.state().mode;
      const B = NES.Input.BTN;
      NES.Input.inject(B.SELECT,1); __nes.step(1); NES.Input.inject(0,1); __nes.step(1);
      const g = window.GAME.state();
      return { over: m, mode: g.mode, lives: g.lives, sc: g.selectContinues };
    }""")
    chk('SELECT 續關不限次數（第 2 次照樣可用）',
        c3['over'] == 'gameover' and c3['mode'] == 'play' and c3['lives'] == 3 and c3['sc'] == 2, c3)

    # ================================================= fix5：真·一鍵密技（不必暫停）
    # 使用者回饋：「電腦版也要有一鍵密技，巡航艦一定要…手機跟電腦都要，盡量一鍵，比較直觀。」
    print('  ---- fix5：真·一鍵密技（鍵盤 C / 觸控 ★密技 / nes-cheat）----')

    def keyC(steps=2):
        page.keyboard.press('KeyC')
        page.evaluate('(n)=>__nes.step(n)', steps)
        return page.evaluate('()=>window.GAME.state()')

    b5 = fresh()
    page.evaluate("()=>{__nes.release(); __nes.step(20);}")
    k1 = keyC()
    chk('play 中按 C：不必暫停就生效（paused=false）', k1['paused'] is False, k1['paused'])
    chk('play 中按 C：SPEED %d → %d、MISSILE / OPTION×2 / 護盾 5' % (b5['speed'], k1['speed']),
        k1['speed'] == b5['speed'] + 1 and k1['power']['missile'] and
        k1['power']['option'] == 2 and k1['power']['shield'] == 5, k1['power'])
    chk('play 中按 C：畫面出現 SECRET!（只有一行，沒有 PAUSE）',
        'SECRET' in k1['msg'].split('|')[1] and 'PAUSE' not in k1['msg'].split('|')[0],
        (k1['msg'].split('|')[1].strip(), k1['msg'].split('|')[0].strip()))
    chk('play 中按 C：**不消耗** Konami 的一場 1 次額度', k1['secretLeft'] == 1, k1['secretLeft'])
    shot(page, out / 'onekey_play.png')
    page.evaluate("()=>{CR.ship.power.option=0; CR.ship.power.shield=0; CR.ship.syncOptions();}")
    k2 = keyC()
    chk('連按限制：30 幀內再按 C 無效', k2['cheats'] == 1 and k2['power']['option'] == 0,
        (k2['cheats'], k2['power']['option']))
    page.evaluate('()=>__nes.step(32)')
    k3 = keyC()
    chk('連按限制：過 30 幀後再按 C 又生效（不限次數）',
        k3['cheats'] == 2 and k3['power']['option'] == 2, k3['cheats'])
    page.evaluate('()=>__nes.step(70)')
    k4 = page.evaluate('()=>window.GAME.state()')
    lt5 = page.evaluate("()=>{__nes.render(); return __nes.lint();}")
    chk('SECRET! 1 秒後收回、地形還原、lint 綠',
        k4['secretMsg'] == 0 and 'SECRET' not in k4['msg'].split('|')[1] and lt5['ok'],
        (k4['secretMsg'], lt5['ok'], lt5['colors']))
    shot(page, out / 'onekey_after.png')
    k5 = page.evaluate("()=>{NES.Touch.cheat(); __nes.step(2); return window.GAME.state();}")
    chk('NES.Touch.cheat()（觸控 ★密技 鍵）也能發動', k5['cheats'] == 3, k5['cheats'])
    page.evaluate('()=>__nes.step(32)')
    k6 = page.evaluate(JS_TAPS, ['START'])
    k7 = keyC()
    chk('暫停中按 C 也生效（三行：PAUSE / 提示 / SECRET!）',
        k7['paused'] is True and 'PAUSE' in k7['msg'].split('|')[0] and
        'SECRET' in k7['msg'].split('|')[1], (k7['msg'], k7['msg2']))
    page.evaluate(JS_TAPS, ['START'])

    fresh('&camx=1600')
    o5 = page.evaluate(r"""()=>{
      CR.ship.addScore(8800);
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150);
      return window.GAME.state();
    }""")
    chk('GAME OVER 第三行 = C OR $ = CONTINUE',
        'C OR $ = CONTINUE' in o5['msg2'].split('|')[1], o5['msg2'].split('|')[1].strip())
    shot(page, out / 'onekey_gameover.png')
    k8 = keyC()
    chk('GAME OVER 按 C：立刻 3 條命續關、分數保留（%d → %d）' % (o5['score'], k8['score']),
        k8['mode'] == 'play' and k8['lives'] == 3 and k8['score'] >= o5['score'], k8['mode'])
    chk('GAME OVER 按 C：回到檢查點 camX≈%d' % k8['camX'],
        abs(k8['camX'] - o5['continueCam']) <= 2, (o5['continueCam'], k8['camX']))
    shot(page, out / 'onekey_continue.png')
    k9 = page.evaluate(r"""()=>{
      CR.ship.lives = 1; CR.ship.invul = 0; CR.ship.power.shield = 0; CR.ship.hit(true);
      __nes.step(150); return window.GAME.state().mode;
    }""")
    k10 = keyC()
    chk('GAME OVER 按 C 不限次數（第 2 次照樣續關）',
        k9 == 'gameover' and k10['mode'] == 'play' and k10['cheatContinues'] == 2,
        k10['cheatContinues'])
    fresh()
    page.evaluate("()=>{__nes.release(); __nes.step(10);}")
    k11 = page.evaluate(JS_TAPS, ['START', 'SELECT'])
    chk('fix4 的暫停 + SELECT 仍可用', k11['selectSecrets'] == 1 and k11['power']['shield'] == 5,
        k11['selectSecrets'])
    page.evaluate("()=>{CR.ship.power.option=0; CR.ship.power.shield=0; CR.ship.syncOptions();}")
    k12 = page.evaluate(JS_TAPS, CODE_FC)
    chk('Konami 序列仍可用（此時才扣額度）',
        k12['secretLeft'] == 0 and k12['power']['option'] == 2, k12['secretLeft'])


    print('\n==== 秘技驗證：%s ====' % ('全部通過' if not bad else '%d 項失敗' % len(bad)))
    for b in bad:
        print('  FAIL', b)
    return 1 if bad else 0


def play(page, q, tag, args, chain=False):
    """跑一段（一關或一整輪）。回傳 {done, frames, deaths, lives, camX, score, cleared, log, stages}。"""
    page.goto((ROOT / 'cruiser.html').as_uri() + q)
    page.wait_for_function('()=>!!window.__nes && !!window.CR && !!window.CR.ship')
    page.evaluate("()=>{__nes.tap('start',1); __nes.step(2);}")
    page.evaluate(BOT_JS)
    page.evaluate('(o)=>{ __bot.assist = !!o.assist; __bot.chain = !!o.chain; '
                  '__bot.lastStage = (window.GAME.state().stage.index || 1); }',
                  {'assist': bool(args.assist), 'chain': bool(chain)})
    done = ''
    chunk = 600
    total = 0
    while total < args.max_frames:
        r = page.evaluate("(n)=>__bot.run(n)", chunk)
        total = page.evaluate("()=>__bot.frames")
        g = page.evaluate("()=>window.GAME.state()")
        print('f=%-6d st=%d mode=%-10s camX=%-5d lives=%d deaths=%d score=%-7d gauge=%d spd=%d '
              'pow=%s enemies=%d boss=%s' %
              (total, g['stage'].get('index', 1), g['mode'], g['camX'], g['lives'],
               page.evaluate("()=>__bot.deaths"), g['score'], g['gauge'], g['speed'],
               ''.join(k[0].upper() if g['power'][k] else '-'
                       for k in ('missile', 'double', 'laser')) + str(g['power']['option']) +
               str(g['power']['shield']),
               g['enemies'], g['stage']['bossActive']),
              ' caps=%d/%d' % (g['capsules'], page.evaluate("()=>CR.stage.capsuleSeq()")))
        if args.shots and (total // 1200) != ((total - chunk) // 1200):
            shot(page, OUT / 'bot' / ('%s_f%05d.png' % (tag, total)))
        if r['done']:
            done = r['done']
            break
    g = page.evaluate("()=>window.GAME.state()")
    out = {
        'tag': tag, 'done': done or 'maxframes', 'frames': total,
        'deaths': page.evaluate("()=>__bot.deaths"), 'lives': g['lives'],
        'camX': g['camX'], 'camMax': g['stage'].get('camMax', 0), 'score': g['score'],
        'cleared': bool(g['stage']['cleared']), 'stage': g['stage'].get('index', 1),
        'log': page.evaluate("()=>__bot.log"), 'stages': page.evaluate("()=>__bot.stages"),
        'cheats': page.evaluate("()=>__bot.cheats"),
    }
    shot(page, OUT / 'bot' / ('%s_end.png' % tag))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--camx', type=int, default=None)
    ap.add_argument('--boss', type=int, default=None)
    ap.add_argument('--stage', type=int, default=None, help='R3：從第 N 關開始（1..6）')
    ap.add_argument('--all', action='store_true', help='R3：六關逐關各跑一次，最後印通關表')
    ap.add_argument('--chain', action='store_true',
                    help='R3：不在過關時停下，一路打到 ENDING（驗證關卡串接 / 第二輪）')
    ap.add_argument('--assist', action='store_true',
                    help='R3：每 120 幀按一次一鍵密技（驗「通路存在」；不用這個就是純實力通關）')
    ap.add_argument('--max-frames', type=int, default=30000)
    ap.add_argument('--tag', default='')
    ap.add_argument('--shots', action='store_true', help='每 1200 幀截一張')
    ap.add_argument('--konami', '--cheat', dest='konami', action='store_true',
                    help='不跑通關，改驗秘技：Konami（暫停 / 一次限制 / GAME OVER 續關）'
                         ' + fix4 一鍵密技（暫停 SELECT / GAME OVER SELECT，不限次數）'
                         ' + fix5 真·一鍵密技（鍵盤 C / 觸控 ★密技 / nes-cheat，不必暫停）')
    args = ap.parse_args()

    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page(viewport={'width': 900, 'height': 800})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        if args.konami:
            print('==== Konami 秘技流程驗證（研究 §9-1）====')
            rc = run_konami(page, OUT / 'konami')
            if errs:
                print('頁面錯誤 =', errs[:5])
                rc = 1
            br.close()
            return rc

        base = '?debug=1&scale=1&mute=1'
        rows = []
        rc = 0
        if args.all:
            for n in range(1, 7):
                q = base + '&stage=%d' % n
                tag = (args.tag + '_' if args.tag else '') + 'stage%d' % n
                print('\n======== 關卡 %d（%s）========' % (n, 'assist' if args.assist else '實力'))
                r = play(page, q, tag, args)
                rows.append(r)
                if not r['cleared']:
                    rc = 1
        else:
            q = base
            if args.stage is not None:
                q += '&stage=%d' % args.stage
            if args.camx is not None:
                q += '&camx=%d' % args.camx
            if args.boss is not None:
                q += '&boss=%d' % args.boss
            tag = args.tag or ('stage%d' % args.stage if args.stage is not None else
                               ('camx%d' % args.camx if args.camx is not None else
                                ('boss%d' % args.boss if args.boss is not None else 'full')))
            r = play(page, q, tag, args, chain=args.chain)
            rows.append(r)
            rc = 0 if (r['cleared'] or r['done'] == 'ending') else 1

        print('\n==== 機器人結果%s ====' % ('（--assist 密技輔助）' if args.assist else '（純實力）'))
        print('%-10s %-10s %8s %7s %6s %9s %8s' % ('段落', '結束', '幀數', '死亡', '剩船', '分數', 'camX'))
        for r in rows:
            print('%-10s %-10s %8d %7d %6d %9d %5d/%d' %
                  (r['tag'], r['done'], r['frames'], r['deaths'], r['lives'],
                   r['score'], r['camX'], r['camMax']))
            if r['log']:
                print('   死亡紀錄 =', json.dumps(r['log'], ensure_ascii=False)[:400])
        if errs:
            print('頁面錯誤 =', errs[:5])
            rc = 1
        br.close()
    return rc


if __name__ == '__main__':
    sys.exit(main())
