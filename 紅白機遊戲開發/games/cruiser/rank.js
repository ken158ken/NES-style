/*
 * games/cruiser/rank.js — 《星塵巡航艦》R4：rank 動態難度（CR.Rank）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-r4 agent（R4）｜ 零相依（只讀 CR.ship / CR.stage，缺席也不會 throw）
 * 研究依據：docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §7-4（rank `$17`）、
 *           §7-5（loop `$1A`）、docs/research/11_橫向射擊設計與技術.md §13（動態難度 rank）。
 *
 * ── 公式（每幀從頭重算，沒有累加器 ⇒ 不會漂移、死亡自動掉下來）──────────────
 *   equip  = (LASER | DOUBLE | RIPPLE ? 1 : 0) + Option 數 + (護盾 ? 1 : 0) + (SPEED >= 4 ? 1 : 0)
 *   surv   = equip >= 1 ? min(3, floor(存活幀 / 1200)) : 0      // **裸機不會隨時間變難**
 *   loopB  = min(4, loop × 2)                                   // 第二輪 rank 起點更高（§7-5）
 *   pen    = 死亡當下設 3，之後每存活 600 幀回補 1（Gradius IV 的「死亡降 rank」修正）
 *   rank   = clamp(0, 7, equip + surv + loopB − pen)
 *
 * 「裸機不隨時間變難」是刻意的（研究 11 §13.2「Gradius 症候群」）：rank 的本意是
 *   「難度跟著火力走」，玩家剛死完一無所有時不該被加壓。副作用是 R3 的既有測試
 *   （砲台週期 90 / 130、敵彈 2.0 px/幀）在裸機狀態下**數字一字不變**。
 *
 * ── rank 改什麼（研究 §7-4：只改「敵人怎麼打」，不改「敵人是誰」）────────────
 *   | rank | 敵彈速倍率 | 砲台週期倍率 | 瞄準砲台一次幾發 | fan 編隊 +n | 預判 |
 *   |---|---|---|---|---|---|
 *   | 0 | 1.000 | 1.000 | 1 | 0 | — |
 *   | 1 | 1.000 | 1.000 | 1 | 0 | — |
 *   | 2 | 1.250 | 1.000 | 1 | 0 | — |
 *   | 3 | 1.250 | 0.938 | 1 | 0 | ✓ |
 *   | 4 | 1.313 | 0.875 | 1 | +1 | ✓ |
 *   | 5 | 1.313 | 0.813 | 2（扇形 ±8） | +1 | ✓ |
 *   | 6 | 1.375 | 0.750 | 2 | +2 | ✓ |
 *   | 7 | 1.438 | 0.688 | 3（扇形 ±10） | +2 | ✓ |
 *   rank 0 / 1 的倍率全部是 1.000 ⇒ 開局與復活後的手感與 R3 完全相同。
 *   **出怪表（哪一欄生什麼）永遠不變**，只有「同一波 fan 的隻數」會多 1~2 隻（任務卡 ①
 *   明文要求 rank 影響編隊；研究的界線是「不改生成事件」，欄位與種類本輪一個都沒動）。
 *
 * ── 設定可關 ────────────────────────────────────────────────────────────────
 *   `?rank=0` 或 `CR.Rank.setEnabled(false)` ⇒ 退回 R3 行為（rank = CR.ship.rank()，
 *   只有「>= 2 敵彈 ×1.25 / >= 3 預判」兩道門檻，週期 / 發數 / 編隊都不動）。
 *   設定存進 `localStorage.cruiser_rank`（讀不到就用預設 true）。
 */
(function () {
  'use strict';
  var CR = window.CR = window.CR || {};

  var MAX = 7;
  var UP_FRAMES = 1200;                 // 存活 20 秒 +1
  var UP_CAP = 3;
  var LOOP_STEP = 2, LOOP_CAP = 4;
  var DEATH_PEN = 3, PEN_RECOVER = 600; // 死亡罰 3，每存活 10 秒回補 1
  var SPEED_RANK_AT = 4;                // SPEED >= 4 算 1 點火力

  // 8.8 倍率表（256 = 1.000）
  var BULLET_MUL = [256, 256, 320, 320, 336, 336, 352, 368];
  var PERIOD_MUL = [256, 256, 256, 240, 224, 208, 192, 176];
  var SHOTS_N = [1, 1, 1, 1, 1, 2, 2, 3];       // 瞄準砲台一次幾發
  var FAN_PLUS = [0, 0, 0, 0, 1, 1, 2, 2];      // fan 編隊隻數加成
  var LEAD_AT = 3;                              // rank >= 3 預判射擊（R3 既有門檻）
  var KEY = 'cruiser_rank';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var S = {
    enabled: true, cur: 0, equip: 0, surv: 0, loopB: 0, pen: 0,
    alive: 0, loop: 0, deaths: 0, peak: 0, frames: 0
  };

  function loadPref() {
    try {
      var v = window.localStorage.getItem(KEY);
      if (v === '0' || v === 'off' || v === 'false') return false;
      return true;
    } catch (e) { return true; }
  }
  function savePref(on) {
    try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { }
  }
  (function queryPref() {
    S.enabled = loadPref();
    try {
      var q = new window.URLSearchParams(window.location.search);
      var r = q.get('rank');
      if (r === '0' || r === 'off') S.enabled = false;
      else if (r === '1' || r === 'on') S.enabled = true;
    } catch (e) { /* about:blank */ }
  })();

  function shipRank() {                 // R3 的裝備 rank（0..4），關掉動態難度時就用它
    var s = CR.ship;
    if (s && typeof s.rank === 'function') { var r = s.rank() | 0; return clamp(r, 0, 3); }
    return 0;
  }

  function equipOf() {
    var s = CR.ship;
    if (!s || !s.power) return 0;
    var p = s.power;
    var main = (p.laser || p.double || p.ripple) ? 1 : 0;
    return main + (p.option | 0) + (p.shield > 0 ? 1 : 0) + ((s.speed | 0) >= SPEED_RANK_AT ? 1 : 0);
  }

  function recompute() {
    S.equip = equipOf();
    S.surv = (S.equip >= 1) ? Math.min(UP_CAP, (S.alive / UP_FRAMES) | 0) : 0;
    S.loopB = Math.min(LOOP_CAP, S.loop * LOOP_STEP);
    S.cur = clamp(S.equip + S.surv + S.loopB - S.pen, 0, MAX);
    if (S.cur > S.peak) S.peak = S.cur;
    return S.cur;
  }

  var R = {
    MAX: MAX, UP_FRAMES: UP_FRAMES, UP_CAP: UP_CAP,
    LOOP_STEP: LOOP_STEP, LOOP_CAP: LOOP_CAP,
    DEATH_PEN: DEATH_PEN, PEN_RECOVER: PEN_RECOVER, LEAD_AT: LEAD_AT,
    BULLET_MUL: BULLET_MUL, PERIOD_MUL: PERIOD_MUL, SHOTS_N: SHOTS_N, FAN_PLUS: FAN_PLUS,
    KEY: KEY,

    // 每幀一次（stage_runtime.update 的開頭呼叫；只在 play 推進）
    update: function () {
      S.frames++;
      var s = CR.ship;
      if (s && s.alive !== false) {
        S.alive++;
        if (S.pen > 0 && (S.alive % PEN_RECOVER) === 0) S.pen--;
      }
      return recompute();
    },
    // 死亡：存活計時歸零 + 罰 3（裝備本來就會被 ship.reset(true) 清掉）
    onDeath: function () {
      S.deaths++; S.alive = 0; S.pen = DEATH_PEN;
      return recompute();
    },
    // 新一局 / 過關 / 換輪
    reset: function (hard) {
      S.alive = 0; S.pen = 0;
      if (hard) { S.deaths = 0; S.peak = 0; S.loop = 0; S.frames = 0; }
      return recompute();
    },
    setLoop: function (n) { S.loop = Math.max(0, n | 0); return recompute(); },
    loop: function () { return S.loop; },

    value: function () { return S.enabled ? recompute() : shipRank(); },
    legacy: shipRank,
    enabled: function () { return !!S.enabled; },
    setEnabled: function (on, persist) {
      S.enabled = !!on;
      if (persist !== false) savePref(S.enabled);
      return S.enabled;
    },
    toggle: function () { return R.setEnabled(!S.enabled); },

    // ---- 效果查詢（enemies.js / stages 用）----
    bulletMul: function () { var r = R.value(); return S.enabled ? BULLET_MUL[r] : (r >= 2 ? 320 : 256); },
    periodMul: function () { return S.enabled ? PERIOD_MUL[R.value()] : 256; },
    shotsN: function () { return S.enabled ? SHOTS_N[R.value()] : 1; },
    fanPlus: function () { return S.enabled ? FAN_PLUS[R.value()] : 0; },
    lead: function () { return R.value() >= LEAD_AT; },

    state: function () {
      recompute();
      return {
        enabled: !!S.enabled, rank: R.value(), dyn: S.cur, equip: S.equip, surv: S.surv,
        loopBonus: S.loopB, penalty: S.pen, alive: S.alive, deaths: S.deaths,
        peak: S.peak, loop: S.loop,
        bulletMul: R.bulletMul(), periodMul: R.periodMul(), shots: R.shotsN(),
        fanPlus: R.fanPlus(), lead: R.lead()
      };
    }
  };

  CR.Rank = R;
})();
