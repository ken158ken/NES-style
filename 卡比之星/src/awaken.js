// Lv4 覺醒系統 KB.AWAKEN（Round 7 覺醒與挑戰）
// 載入順序：player.js → game.js → progression.js → **awaken.js** → records.js / ui.js …
//   （所以這裡可以安全包住 KB.PROG 的函式，並在 KB.save 建好之後使用）
//
// ── KB.AWAKEN API（其他 agent 照這個介面呼叫；缺 KB.game / KB.PROG 時全部安全 no-op）──────────
//   量表   gauge（0~100，唯讀請用 A.gauge）/ MAX / add(n) / hit() / onHurt() / ready() / pct()
//   等級   lv4(key?)（能力是否 Lv4）/ LV（=4）
//   狀態   active() / activeT / DUR（=300）/ start(p) / end(p) / cancel()
//   觸發   tryTrigger(p)（player.js 每幀呼叫；只有「跳+攻 3 幀內」且量表滿才回 true）
//          bufferInput(game)（game.js 在演出停格 freezeT > 0 時呼叫：把跳+攻排隊，停格結束自動發動）
//   招式   moves[key] = { name, exec(p) } / moveFor(key) / baseKey(key)（有專屬招用專屬，沒有才退主成分 A）/ exec(p, key)
//          hasOwnMove(key)（是不是有自己的專屬覺醒招）/ MOVE_ORDER（基本 20）/ MIX_ORDER（混合 24）
//   繪製   drawGauge(ctx, game)（progression.drawHUD 內呼叫，畫在能力圖示下方 x4 y218 26×5）
//   平衡   BOSS_MUL / BOSS_CAP（覺醒招對魔王的減傷與單次覺醒傷害上限）/ scaleForTarget(dmg, atk, target)
//   雜項   tick(game)（由 KB.PROG.update 包裝自動每幀呼叫）/ reset() / after(frames, fn)
//
// ── 規則 ──────────────────────────────────────────────────────────────────────
//   1. 只有「持有的能力已經是 Lv4」時量表才會累積：命中敵人 +4、連擊每 +1 再 +1（連擊上限 10 → 最多 +14）、
//      受傷 −20（走 KB.PROG 的 'hurt' 事件）。滿 100 → HUD 量表閃爍 + textPop「覺醒 READY」+ sfx('max')。
//   2. 地面 / 空中同一幀（或 3 幀內先後）按下「跳 + 攻擊」且量表滿 → player.startAwaken()。
//      量表沒滿 / 能力不是 Lv4 → 完全不攔截，跳與攻擊照原本運作。
//   3. 覺醒狀態 300 幀：全身金色、無敵（金色閃爍與吃到無敵糖的彩虹閃不同）、移動速度 ×1.2、
//      所有招傷害 ×1.5（包進 KB.PROG.scaleDmg）、HUD Lv 星全金；結束時量表歸 0。
//   4. 覺醒發動當下立刻放出該能力的「覺醒招」——20 種基本能力各 1 招、
//      24 種混合能力（KB.MIX）各 1 招**專屬覺醒招**（Round 8「awaken-mix」，演出比基本覺醒更誇張）；
//      沒有專屬招的能力才退回主成分 A 的招（A.baseKey）。
(function () {
  'use strict';
  const KB = window.KB;
  const A = KB.AWAKEN = KB.AWAKEN || {};
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- 常數
  A.LV = 4;                 // 覺醒需要的能力等級
  A.MAX = 100;              // 量表上限
  A.DUR = 300;              // 覺醒狀態幀數
  A.WINDOW = 2;             // 跳 / 攻擊的容許間隔（幀）＝「3 幀內先後按」
  A.PEND = 90;              // 演出停格期間按下的「跳+攻」可以排隊幾幀（R7-P2-05）
  A.HIT_GAIN = 4;           // 命中敵人
  A.COMBO_GAIN = 1;         // 連擊每 +1 額外
  A.COMBO_CAP = 10;         // 連擊加成上限（避免一擊灌滿）
  A.HURT_LOSS = 20;         // 被打
  A.SPD = 1.2;              // 覺醒中移動速度
  A.DMG = 1.5;              // 覺醒中傷害
  A.TIME_DMG = 3;           // time 覺醒招：時停期間累積傷害 ×3
  A.BOSS_MUL = 0.35;        // 覺醒招打在魔王（type==='boss'）身上的傷害倍率（R7-P1-01 平衡）
  A.BOSS_CAP = 0.35;        // 一次覺醒對同一隻魔王的總傷害上限（佔該形態血量的比例）
  const GOLD = A.GOLD = '#ffe040', GOLD_HI = A.GOLD_HI = '#fffce0', GOLD_LO = A.GOLD_LO = '#ff9800';

  // ---------------------------------------------------------------- 狀態
  A.gauge = 0;
  A.activeT = 0;
  A.timeBonusT = 0;         // time 覺醒招的「累積傷害 ×3」剩餘幀
  A.key = null;             // 覺醒中使用的能力
  A.moveName = '';
  A.wasFull = false;
  A.q = [];                 // 排程（after）
  A.pending = 0;            // 停格（變身演出）期間排隊中的覺醒：剩餘有效幀數
  A.bossDmg = {};           // 本次覺醒對各魔王已造成的傷害（entity.id → 累計），start/reset 時清空
  let jF = -999, aF = -999; // 最後一次按下 跳 / 攻擊 的幀

  // ---------------------------------------------------------------- 工具
  const P = () => (KB.PROG || null);
  const G = () => (KB.game || null);
  const player = () => KB.player || (KB.game && KB.game.player) || null;
  const frame = () => (KB.game ? (KB.game.frame | 0) : 0);
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  /** 安全呼叫 KB.VFX（未載入 / 丟例外時 no-op） */
  const v = function (name) {
    const V = KB.VFX;
    if (!V || !KB.game || typeof V[name] !== 'function') return null;
    try { return V[name].apply(V, Array.prototype.slice.call(arguments, 1)); } catch (e) { return null; }
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  A.vfx = v;

  /** 排程：frames 幀後執行 fn(player)（在 A.tick 裡推進，所以 hitstop 期間會一起定格） */
  A.after = function (frames, fn) { A.q.push({ t: Math.max(1, frames | 0), fn }); return A; };

  // ---------------------------------------------------------------- 等級 / 量表
  const curKey = () => { const p = player(); return (p && p.ability) || null; };
  A.lv4 = function (key) {
    const pg = P(); if (!pg) return false;
    key = key || curKey(); if (!key) return false;
    return pg.level(key) >= A.LV;
  };
  A.ready = () => A.gauge >= A.MAX;
  A.pct = () => clamp(A.gauge / A.MAX, 0, 1);
  A.active = () => A.activeT > 0;
  A.canAwaken = function (p) {
    p = p || player();
    return !!(p && p.ability && !A.active() && A.ready() && A.lv4(p.ability) && G());
  };

  /** 量表增減（回傳實際變化量）；跨過 100 的那一次會放「覺醒 READY」演出 */
  A.add = function (n) {
    const before = A.gauge;
    A.gauge = clamp(A.gauge + (+n || 0), 0, A.MAX);
    if (A.gauge < A.MAX) A.wasFull = false;
    if (A.gauge >= A.MAX && !A.wasFull) { A.wasFull = true; A.onFull(); }
    return A.gauge - before;
  };
  A.onFull = function () {
    const p = player();
    if (p) v('textPop', p.cx, p.y - 18, '覺醒 READY', { color: GOLD, size: 12, frames: 70, rise: 0.35, outline: '#3a2400' });
    if (p) v('ring', p.cx, p.cy, { r0: 6, r1: 34, frames: 16, color: GOLD, width: 2 });
    sfx('awk_ready');            // Round 8 audio8：覺醒量表集滿
    sfx('max');
  };
  /** 命中敵人（由 KB.PROG.scaleDmg 的包裝呼叫）：+4，連擊每 +1 再 +1 */
  A.hit = function () {
    if (A.active() || !A.lv4()) return 0;
    const pg = P(), combo = pg ? Math.min(A.COMBO_CAP, pg.combo | 0) : 0;
    return A.add(A.HIT_GAIN + combo * A.COMBO_GAIN);
  };
  /** 被打：−20 */
  A.onHurt = function () { if (A.active()) return 0; return A.add(-A.HURT_LOSS); };

  /**
   * 依「攻擊者 / 目標」再調整傷害（game.js collisions 第一階段呼叫）。
   * R7-P1-01：覺醒招（awaken 旗標）打在魔王（type === 'boss'）身上一律 ×A.BOSS_MUL，
   * 且一次覺醒對同一隻魔王的總傷害不超過該形態血量的 BOSS_CAP（＝最多打掉約 35% 血）；
   * 對一般敵人完全不變。
   */
  A.scaleForTarget = function (dmg, atk, target) {
    const n = +dmg;
    if (!(n > 0) || !atk || !atk.awaken) return dmg;
    if (!target || target.type !== 'boss') return dmg;
    const d = Math.max(1, Math.round(n * A.BOSS_MUL));
    return Math.max(0, Math.min(d, A.bossLeft(target)));
  };
  /** 這次覺醒對 target 還能造成幾點傷害（＝該形態血量 × BOSS_CAP − 已造成） */
  A.bossLeft = function (target) {
    const cap = Math.max(1, Math.round((+target.maxHp || +target.hp || 1) * A.BOSS_CAP));
    return Math.max(0, cap - (A.bossDmg[target.id] || 0));
  };
  /** 記帳：只累計「真的扣掉的血」（game.js 在 hurt 前後比對 hp 後呼叫；被無敵幀擋下的不算） */
  A.noteBossHit = function (atk, target, applied) {
    const n = +applied;
    if (!(n > 0) || !atk || !atk.awaken || !target || target.type !== 'boss') return 0;
    A.bossDmg[target.id] = (A.bossDmg[target.id] || 0) + n;
    return A.bossDmg[target.id];
  };

  // ---------------------------------------------------------------- 觸發（player.js 每幀呼叫）
  /**
   * 跳 + 攻擊（同一幀，或 3 幀內先後）且量表滿 → 覺醒。
   * 回傳 true 代表「本幀的輸入被覺醒吃掉了」，player.js 要直接 return；
   * 其餘情況一律回 false —— 未 Lv4 / 量表沒滿時跳與攻擊完全照舊。
   */
  A.tryTrigger = function (p) {
    const inp = KB.input; if (!inp || !inp.pressed) return false;
    p = p || player();
    const f = frame();
    if (inp.pressed('jump')) jF = f;
    if (inp.pressed('attack')) aF = f;
    // 至少一邊是「這一幀剛按下」，而且兩邊的間隔 ≤ WINDOW 幀
    if (jF !== f && aF !== f) return false;
    if (Math.abs(jF - aF) > A.WINDOW) return false;
    if (!A.canAwaken(p)) return false;
    jF = aF = -999;
    return A.start(p) === true;
  };

  /**
   * R7-P2-05：演出停格（game.freezeT > 0，例如變身 / 取得能力的 hitstop）期間
   * game.update 會直接 return，player.update → tryTrigger 整段都不會跑，
   * 「跳+攻」的輸入等於被整個吃掉（量表滿了也沒反應、也沒有任何提示）。
   * game.js 的 freeze 分支會呼叫這個把輸入排隊：停格結束後由 A.tick 自動發動（最多等 A.PEND 幀）。
   * 未 Lv4 / 量表沒滿一律不排隊（跳與攻擊照舊）。
   */
  A.bufferInput = function (game) {
    const inp = KB.input; if (!inp || !inp.pressed) return false;
    const f = frame();
    if (inp.pressed('jump')) jF = f;
    if (inp.pressed('attack')) aF = f;
    if (jF !== f && aF !== f) return false;
    if (Math.abs(jF - aF) > A.WINDOW) return false;
    const p = player();
    if (!p || A.active() || !A.ready() || !A.lv4(p.ability)) return false;
    jF = aF = -999;
    if (A.pending > 0) return true;
    A.pending = A.PEND;
    // 「覺醒 READY」的字可能還在頭上飄（兩行 12px 字疊在一起會糊成亂碼）→ 先收掉再放新的
    try { if (KB.VFX && KB.VFX.list) for (const e of KB.VFX.list) if (e && e.text === '覺醒 READY') e.dead = true; } catch (e) { }
    v('textPop', p.cx, p.y - 18, '變身中…', { color: GOLD, size: 12, frames: 40, rise: 0.3, outline: '#3a2400' });
    sfx('menu');
    return true;
  };

  // ---------------------------------------------------------------- 覺醒狀態
  A.start = function (p) {
    p = p || player();
    if (!p || !G() || !p.ability) return false;
    const key = p.ability, mv = A.moveFor(key);
    A.key = key;
    A.moveName = mv ? mv.name : '覺醒';
    A.activeT = A.DUR;
    A.q.length = 0;
    A.bossDmg = {};                 // 每次覺醒重新計算「對魔王的傷害上限」
    p.awakenT = A.DUR;
    p.invincibleT = Math.max(p.invincibleT | 0, A.DUR);
    // 吃掉這一幀的輸入：跳躍緩衝要清掉（否則下一幀會補跳），攻擊狀態先收招
    p.jumpBufT = 0; p.jumpHold = 0;
    if (p.state === 'attack') { p.attackTimer = 0; p.setState(p.onGround ? 'idle' : 'fall'); }
    // 頭上可能還飄著「覺醒 READY」（70 幀），會和招式名 / 招式中的 textPop 疊成亂碼 → 先收掉
    // （與 R7-P2-05 的 bufferInput 同一招）
    try { if (KB.VFX && KB.VFX.list) for (const e of KB.VFX.list) if (e && e.text === '覺醒 READY') e.dead = true; } catch (e) { }
    // ---- 演出（VFX.transform 風格，金色）----
    v('hitstop', 8);
    v('shake', 8);
    v('letterbox', 150);
    v('zoom', 1.22, 18);
    v('flash', GOLD_HI, 12, 0.85);
    v('worldTint', GOLD, 0.35, 46);
    v('transform', p, key, { name: A.moveName, color: GOLD, hitstop: false });
    v('circle', p.cx, p.cy + 6, { r: 38, frames: 70, color: GOLD, spin: 0.09, glyphs: 12 });
    v('aura', p, { color: GOLD, r: 20, frames: A.DUR, pulse: 0.3 });
    v('burst', p.cx, p.cy, { n: 30, colors: [GOLD, GOLD_HI, GOLD_LO], speed: 3.4, life: 34, grav: -0.02, size: 3 });
    sfx('awk_start');            // Round 8 audio8：覺醒發動
    sfx('transform'); sfx('ultimate');
    const pg = P(); if (pg && pg.emit) { try { pg.emit('awaken', { key }); } catch (e) { } }
    // ---- 立刻放出覺醒招 ----
    A.exec(p, key);
    return true;
  };
  /** 覺醒結束：量表歸 0 */
  A.end = function (p) {
    p = p || player();
    if (!A.activeT && !A.key) { A.gauge = 0; A.wasFull = false; return false; }
    A.activeT = 0; A.gauge = 0; A.wasFull = false; A.key = null; A.q.length = 0;
    if (p) {
      p.awakenT = 0;
      v('ring', p.cx, p.cy, { r0: 26, r1: 4, frames: 16, color: GOLD, width: 2 });
      v('burst', p.cx, p.cy, { n: 14, colors: [GOLD, '#c0c8d8'], speed: 1.6, life: 26, grav: 0.05, size: 2 });
      v('textPop', p.cx, p.y - 12, '覺醒終了', { color: '#ffd0a0', size: 10, frames: 40, rise: 0.3, outline: '#3a2400' });
    }
    sfx('awk_end');              // Round 8 audio8：覺醒終了
    sfx('untransform');
    return true;
  };
  A.cancel = function () { A.activeT = 0; A.key = null; A.q.length = 0; const p = player(); if (p) p.awakenT = 0; };

  /** 覺醒中的移動加成：在玩家自己的 physics 之後再補走 (SPD-1) 倍的水平位移（含地形碰撞） */
  function boost(p) {
    const ex = p.vx * (A.SPD - 1);
    if (!ex || !KB.physics || !KB.game || !KB.game.map) return;
    const st = p.state;
    if (st === 'dead' || st === 'door' || st === 'ride' || st === 'climb' || st === 'stone') return;
    const probe = {
      x: p.x, y: p.y, w: p.w, h: p.h, vx: ex, vy: 0, grav: 0, stepH: p.stepH,
      onGround: p.onGround, dropThrough: p.dropThrough,
    };
    try { KB.physics.step(probe, KB.game.map); } catch (e) { return; }
    p.x = probe.x;                     // 只取水平位移（垂直交給 player 自己的 physics）
    if (p.clampToRoom) p.clampToRoom();
  }

  /** 覺醒中的持續特效（金色火星 + 每 40 幀一圈光環） */
  function auraFx(p) {
    const t = A.DUR - A.activeT;
    if (t % 5 === 0) KB.particles(p.cx + rnd(-7, 7), p.cy + rnd(-8, 8), [GOLD, GOLD_HI, GOLD_LO], 1, { spread: 0.5, grav: -0.05, life: 18, up: 0.3, size: 1 });
    if (t % 40 === 20) v('ring', p.cx, p.cy, { r0: 4, r1: 26, frames: 14, color: GOLD, width: 1 });
  }

  /** 每幀（由 KB.PROG.update 的包裝呼叫） */
  A.tick = function (game) {
    // 排程
    if (A.q.length) {
      const due = [];
      for (const j of A.q) { if (--j.t <= 0) { j.done = true; due.push(j); } }
      if (due.length) A.q = A.q.filter(j => !j.done);
      for (const j of due) { try { j.fn(player()); } catch (e) { } }
    }
    if (A.timeBonusT > 0) A.timeBonusT--;
    // 停格期間排隊的覺醒（A.bufferInput）：停格一結束就自動發動
    if (A.pending > 0) {
      A.pending--;
      const pp = player();
      if (A.canAwaken(pp) && pp.state !== 'dead' && !(game && game.freezeT > 0)) {
        A.pending = 0;
        if (pp.startAwaken) pp.startAwaken(); else A.start(pp);
      }
    }
    if (A.activeT > 0) {
      const p = player();
      A.activeT--;
      if (p && p.state !== 'dead') { boost(p); auraFx(p); }
      if (A.activeT <= 0) A.end(p);
      else if (p && p.state === 'dead') A.end(p);
    }
  };

  /** 進關卡 / 測試重置 */
  A.reset = function () {
    A.gauge = 0; A.activeT = 0; A.timeBonusT = 0; A.key = null; A.wasFull = false; A.q.length = 0;
    A.bossDmg = {};
    jF = aF = -999;
    const p = player(); if (p) p.awakenT = 0;
    return true;
  };

  // ---------------------------------------------------------------- HUD 量表
  // 能力圖示（x4 y200 24×16）正下方：外框 26×5 @ (4,218)，內部填色 24×3。
  // Lv 星在圖示「正上方」(y194)，兩者不重疊；右邊從 x30 起是能力中文名，所以寬度停在 29。
  A.GX = 4; A.GY = 218; A.GW = 26; A.GH = 5;
  A.drawGauge = function (ctx, game) {
    const p = (game && game.player) || player();
    const key = p && p.ability;
    const show = A.active() || A.gauge > 0 || (key && A.lv4(key));
    if (!show || !KB.rect) return 0;
    const x = A.GX, y = A.GY, w = A.GW, h = A.GH, f = (game && game.frame | 0) || 0;
    const inW = w - 2, inH = h - 2;
    const act = A.active();
    const pct = act ? (A.activeT / A.DUR) : A.pct();
    const full = !act && A.ready();
    // 外框（滿的時候金 / 白閃爍）
    const edge = full ? (((f >> 2) & 1) ? GOLD_HI : GOLD_LO) : (act ? GOLD : '#4a5268');
    KB.rect(ctx, x, y, w, h, '#181c28');
    KB.rect(ctx, x, y, w, 1, edge); KB.rect(ctx, x, y + h - 1, w, 1, edge);
    KB.rect(ctx, x, y, 1, h, edge); KB.rect(ctx, x + w - 1, y, 1, h, edge);
    // 內容
    KB.rect(ctx, x + 1, y + 1, inW, inH, '#101828');
    const fw = Math.round(inW * pct);
    if (fw > 0) {
      const body = act ? (((f >> 1) & 1) ? GOLD_HI : GOLD) : (full ? (((f >> 2) & 1) ? GOLD_HI : GOLD) : '#ffb020');
      KB.rect(ctx, x + 1, y + 1, fw, inH, body);
      KB.rect(ctx, x + 1, y + 1, fw, 1, full || act ? GOLD_HI : '#ffe0a0');   // 上緣高光
    }
    // 滿的時候兩側各閃一顆小星
    if (full && ((f >> 2) & 1)) {
      KB.rect(ctx, x - 2, y + 1, 1, 3, GOLD_HI); KB.rect(ctx, x - 3, y + 2, 3, 1, GOLD_HI);
      KB.rect(ctx, x + w + 1, y + 1, 1, 3, GOLD_HI); KB.rect(ctx, x + w, y + 2, 3, 1, GOLD_HI);
    }
    return w;
  };

  // ================================================================ 覺醒招
  // 20 種基本能力各 1 招；每招 = letterbox + zoom + 全畫面多段判定 + 專屬特效。
  // 混合能力（KB.MIX）24 組另有自己的專屬招（見本檔後段「混合能力覺醒招」）；變身系能力同樣有自己的招。
  A.moves = {};
  const MOVE_ORDER = A.MOVE_ORDER = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer',
    'gunner', 'ninja', 'blade', 'bow', 'mage', 'time', 'gravity', 'clone', 'giant', 'dragon', 'mech', 'ghost'];

  /**
   * 覺醒招的查表 key。
   * Round 8「awaken-mix」起 24 種混合能力各有**專屬覺醒招**，所以順序是：
   *   ① 這個 key 自己有招（20 基本 + 24 混合）→ 直接用專屬招；
   *   ② 沒有（例如之後新增的混合組合還沒寫專屬招）→ 退回主成分 A 的招；
   *   ③ 主成分 A 也沒有 → 退回成分 B；都沒有就原樣回傳（moveFor 會回 null）。
   */
  A.baseKey = function (key) {
    if (!key) return null;
    if (A.moves[key]) return key;                    // ① 專屬招優先
    try {
      if (KB.MIX && KB.MIX.isMix && KB.MIX.isMix(key)) {
        const ps = KB.MIX.parts(key);
        if (ps && ps[0] && A.moves[ps[0]]) return ps[0];   // ② 退回主成分 A
        if (ps && ps[1] && A.moves[ps[1]]) return ps[1];   // ③ 再退回成分 B
      }
    } catch (e) { }
    return key;
  };
  /** 這個能力用的是不是「自己的專屬覺醒招」（混合能力用來區分專屬 / 退回主成分） */
  A.hasOwnMove = function (key) { return !!(key && A.moves[key]); };
  A.moveFor = function (key) { const k = A.baseKey(key || curKey()); return (k && A.moves[k]) || null; };
  A.moveName2 = function (key) { const m = A.moveFor(key); return m ? m.name : ''; };
  /**
   * 覺醒招專屬音（Round 8 audio8 交件的音效表）：
   *   基本能力 → sfx('awk_<key>')（20 種）
   *   混合能力 → sfx('awk_<主成分 A>') + sfx('mix_<mixkey>') **疊加**（24 種）
   * 不存在的名字只會 warnOnce，不會壞；這裡仍先過濾一次，保持 console 乾淨。
   */
  A.moveSfx = function (key) {
    key = key || curKey(); if (!key) return false;
    let base = key;
    try {
      if (KB.MIX && KB.MIX.isMix && KB.MIX.isMix(key)) {
        const ps = KB.MIX.parts(key);
        if (ps && ps[0]) base = ps[0];
      }
    } catch (e) { }
    if (MOVE_ORDER.indexOf(base) >= 0) sfx('awk_' + base);
    if (base !== key && MIX_ORDER.indexOf(key) >= 0) sfx('mix_' + key);
    return true;
  };
  A.exec = function (p, key) {
    p = p || player(); if (!p) return false;
    const k = key || p.ability;
    const m = A.moveFor(k); if (!m) return false;
    A.moveSfx(k);
    try { m.exec(p); } catch (e) { return false; }
    return true;
  };

  // ---------- 招式共用零件 ----------
  /** 覺醒招專用投射物：與 KB.shoot 相同，另外標上 awaken 旗標（對魔王 ×A.BOSS_MUL） */
  function ashoot(o) { const pr = KB.shoot(o); if (pr) pr.awaken = true; return pr; }
  A.shoot = ashoot;
  /**
   * 追蹤魔王的覺醒投射（R8-P1-02）。
   * 投射物型的招式（流星雨 / 環形彈幕）只打得到畫面內，房間比畫面寬時魔王收不到，
   * 這裡補一發從卡比身上射出、每幀微轉向魔王的投射（不受地形阻擋、不會離畫面就消失）。
   * 房內沒有魔王、或魔王本來就在畫面中央附近 → 不生成（一般房間的手感完全不變）。
   */
  function bossShot(q, spr, o) {
    o = o || {};
    const R = camRect(), out = [];
    for (const e of bosses()) {
      if (Math.abs(e.cx - R.cx) < 100 && Math.abs(e.cy - R.cy) < 80) continue;   // 已經在畫面中段 → 一般判定打得到
      const sp = o.speed || 7;
      const dx = e.cx - q.cx, dy = e.cy - q.cy, d = Math.hypot(dx, dy) || 1;
      const pr = ashoot({
        spr: spr || 'proj_star', x: q.cx, y: q.cy, vx: dx / d * sp, vy: dy / d * sp,
        dmg: o.dmg || 3, owner: 'player', life: o.life || 90, grav: 0, pierce: true, solid: false,
        w: o.w || 12, h: o.h || 12, breakBlocks: false, type: o.type || 'awaken',
        trail: o.trail || null, rotSpeed: o.rotSpeed || 0,
      });
      if (!pr) continue;
      pr.offscreenKill = false;
      const target = e, base = pr.update.bind(pr);
      pr.update = function (dt) {
        if (!target.dead) {          // 每幀把速度轉向魔王（純追蹤，速度大小不變）
          const ax = target.cx - this.cx, ay = target.cy - this.cy, ad = Math.hypot(ax, ay) || 1;
          this.vx += (ax / ad * sp - this.vx) * 0.35;
          this.vy += (ay / ad * sp - this.vy) * 0.35;
        }
        base(dt);
      };
      out.push(pr);
    }
    return out;
  }
  A.bossShot = bossShot;
  /**
   * 房內活著的魔王（type === 'boss'，含多形態 / 分身）。
   * R8-P1-02：房間比畫面寬時（例：w1 威斯比固定站在最右側），全畫面招的判定打不到魔王，
   * bigbox / bossShot 用這份清單把判定延伸過去。
   */
  function bosses() {
    const g = G(), out = [];
    if (!g || !g.entities) return out;
    for (let i = 0; i < g.entities.length; i++) {
      const e = g.entities[i];
      if (e && e.type === 'boss' && !e.dead && !(e.hp <= 0)) out.push(e);
    }
    return out;
  }
  A.bosses = bosses;
  /** 覺醒招判定框（共用選項 → KB.hitbox），一律帶 awaken 旗標 */
  // Round 10（貼身判定加倍）：覺醒招一律「不放大」——
  //   走這裡的框全是 bigbox() 產生的全畫面框（預設 288×208）或追著畫面外魔王的大框（≥ 64×64），
  //   本來就遠大於 entity.js 的 48×48 門檻，而且是定點 / 全畫面招，放大只會讓演出與判定對不上。
  //   明確寫死 melee: !!o.melee（預設 false）當保險，行為與 Round 9 完全相同；
  //   將來若真要做「貼身小框的覺醒招」，在該招的 opts 傳 melee: true 就好。
  function mkbox(x, y, w, h, o, follow) {
    const hb = KB.hitbox({
      x, y, w, h, melee: !!o.melee,
      dmg: o.dmg === undefined ? 10 : o.dmg,
      owner: 'player', type: o.type || 'awaken', life: o.life || 4,
      rehit: o.rehit || 0, pierce: true, knock: o.knock === undefined ? 2 : o.knock,
      breakBlocks: !!o.breakBlocks, freeze: !!o.freeze, onHit: o.onHit || null,
      follow: follow || null, flipWithOwner: false, ox: follow ? -w / 2 : 0, oy: follow ? follow.h / 2 - h / 2 : 0,
    });
    if (hb) hb.awaken = true;      // R7-P1-01：對魔王的傷害另乘 A.BOSS_MUL（game.js collisions 讀這個旗標）
    return hb;
  }
  /**
   * 全畫面判定框（預設 288×208）。
   * R8-P1-02：預設**以攝影機為中心**（288 > 畫面寬 256，畫面內的卡比一定包得住），
   * 另外房內若有「不在框內」的魔王（房間比畫面寬、魔王站在畫面外），
   * 再追加一個跟著那隻魔王走的判定框 —— 讓「全畫面招」名副其實。
   * 指定 cx / cy 的定點招（爆破點、黑洞）維持原本行為，不追加。
   */
  function bigbox(p, o) {
    o = o || {};
    const w = o.w || 288, h = o.h || 208;
    const R = camRect();
    const atP = !!o.atPlayer || !G();
    const cx = o.cx === undefined ? (atP ? p.cx : R.cx) : o.cx;
    const cy = o.cy === undefined ? (atP ? p.cy : R.cy) : o.cy;
    const hb = mkbox(cx - w / 2, cy - h / 2, w, h, o, null);
    if (o.cx === undefined && o.cy === undefined && !o.noBoss) {
      const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
      for (const e of bosses()) {
        if (e.x + e.w > l && e.x < r && e.y + e.h > t && e.y < b) continue;    // 已經在框內
        const bw = Math.max(64, e.w + 48), bh = Math.max(64, e.h + 48);
        mkbox(e.cx - bw / 2, e.cy - bh / 2, bw, bh, o, e);
      }
    }
    return hb;
  }
  A.bigbox = bigbox;
  /** 攝影機矩形（世界座標）：拿來把特效鋪滿整個畫面 */
  function camRect() {
    const g = G();
    const c = g && g.cam ? g.cam : { x: 0, y: 0 };
    return { x: c.x, y: c.y, w: KB.W, h: KB.VIEW_H, cx: c.x + KB.W / 2, cy: c.y + KB.VIEW_H / 2 };
  }
  A.camRect = camRect;
  /** 招式開場：letterbox + zoom + 染色 + 白閃（transform 已經有一份，這裡是招式自己的色調） */
  function intro(p, col, o) {
    o = o || {};
    v('letterbox', o.lb || 150);
    v('zoom', o.zoom || 1.16, o.zoomT || 24);
    v('worldTint', col, o.tint === undefined ? 0.3 : o.tint, o.tintT || 40);
    v('flash', o.flash || col, 8, 0.6);
    v('shake', o.shake || 6);
    if (o.sfx) sfx(o.sfx);
  }
  /**
   * 多段判定：n 段、每段間隔 gap 幀，每段一個全畫面判定框 + each(p, i) 的專屬特效。
   * 招式總傷害 = n × dmg（覺醒中還會再吃 ×1.5）。
   */
  function storm(p, o) {
    const n = o.n || 4, gap = o.gap || 8, d0 = o.delay || 0;
    for (let i = 0; i < n; i++) {
      A.after(1 + d0 + i * gap, pp => {
        const q = pp || player(); if (!q || q.state === 'dead') return;
        bigbox(q, o);
        if (o.each) { try { o.each(q, i); } catch (e) { } }
        if (o.sfx && i % (o.sfxEvery || 1) === 0) sfx(o.sfx);
        v('shake', o.shake2 || 4);
        if (o.hitstop) v('hitstop', o.hitstop);
      });
    }
  }
  A.storm = storm;
  const M = (key, name, exec) => { A.moves[key] = { key, name, exec }; return A.moves[key]; };

  // ---------- 1. 火焰：焚天龍炎 ----------
  M('fire', '焚天龍炎', p => {
    intro(p, '#ff5010', { sfx: 'fireball' });
    storm(p, {
      n: 6, gap: 7, dmg: 9, type: 'fire', sfx: 'fire', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 由地面竄起的火柱（每段 5 根），外加一條掃過畫面的龍焰
        for (let k = 0; k < 5; k++) {
          const x = R.x + (k + 0.5) * (R.w / 5) + rnd(-10, 10);
          v('beam', x, R.y + R.h, -Math.PI / 2, R.h * 0.9, { width: 14 - i, color: k & 1 ? '#ffb020' : '#ff5010', frames: 14, taper: true });
          v('burst', x, R.y + R.h - 8, { n: 8, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3, life: 26, grav: -0.06, size: 2 });
        }
        v('lightning', R.x, R.cy + Math.sin(i) * 26, R.x + R.w, R.cy - Math.sin(i) * 26, { color: '#ffd060', frames: 12, jitter: 14, branches: 4 });
        v('ring', q.cx, q.cy, { r0: 8, r1: 70, frames: 16, color: '#ff7020', width: 3 });
      },
    });
  });

  // ---------- 2. 劍：百斬星光劍 ----------
  M('sword', '百斬星光劍', p => {
    intro(p, '#60ff90', { sfx: 'slash_big' });
    storm(p, {
      n: 8, gap: 5, dmg: 7, type: 'sword', sfx: 'sword', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(20, R.w - 20), y = R.y + rnd(24, R.h - 24);
          v('slash', x, y, 34, rnd(-Math.PI, Math.PI), { color: k & 1 ? '#ffffff' : '#80ffa0', width: 3, frames: 12, arc: 2.1, flip: (i + k) & 1 });
        }
        v('line', R.x, R.cy + 40 - i * 10, R.x + R.w, R.cy - 40 + i * 10, { color: '#ffffff', width: 2, frames: 10 });
        v('afterimage', q, { frames: 10, color: '#a0ffc0', every: 1, alpha: 0.5 });
      },
    });
    A.after(46, q => { if (q) { v('flash', '#ffffff', 10, 0.8); v('ring', q.cx, q.cy, { r0: 4, r1: 86, frames: 20, color: '#ffffff', width: 3 }); } });
  });

  // ---------- 3. 光束：銀河光柱 ----------
  M('beam', '銀河光柱', p => {
    intro(p, '#ffd030', { sfx: 'beam', zoom: 1.2 });
    storm(p, {
      n: 5, gap: 9, dmg: 11, type: 'beam', sfx: 'beam',
      each(q, i) {
        const R = camRect();
        v('beam', q.cx, R.y, Math.PI / 2, R.h, { width: 40 - i * 4, color: '#fff0a0', frames: 18, taper: false });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + i * 0.3;
          v('beam', q.cx, q.cy, a, 150, { width: 7, color: k & 1 ? '#ffd030' : '#ffffff', frames: 14, taper: true });
        }
        v('circle', q.cx, q.cy, { r: 40 + i * 6, frames: 22, color: '#ffe070', spin: 0.12, glyphs: 12 });
      },
    });
  });

  // ---------- 4. 刀刃：千刃迴旋 ----------
  M('cutter', '千刃迴旋', p => {
    intro(p, '#c0ffe0', { sfx: 'cutter' });
    storm(p, {
      n: 8, gap: 6, dmg: 7, type: 'cutter', sfx: 'cutter', sfxEvery: 3,
      each(q, i) {
        // 每段 6 把迴旋刃從卡比身上旋出（真投射物，飛出畫面）
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + i * 0.4;
          ashoot({
            spr: 'proj_cutter', x: q.cx, y: q.cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
            dmg: 4, owner: 'player', life: 70, grav: 0, pierce: true, solid: false,
            w: 12, h: 12, rotSpeed: 0.5, breakBlocks: false, type: 'cutter',
          });
        }
        v('ring', q.cx, q.cy, { r0: 6, r1: 60, frames: 14, color: '#c0ffe0', width: 2 });
        v('slash', q.cx, q.cy, 40, i * 0.8, { color: '#ffffff', width: 3, frames: 10, arc: 3.0 });
      },
    });
  });

  // ---------- 5. 電擊：雷帝降臨 ----------
  M('spark', '雷帝降臨', p => {
    intro(p, '#80d8ff', { sfx: 'thunder' });
    storm(p, {
      n: 6, gap: 7, dmg: 9, type: 'spark', sfx: 'thunder', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 5; k++) {
          const x = R.x + rnd(8, R.w - 8);
          v('lightning', x, R.y - 10, x + rnd(-20, 20), R.y + R.h, { color: k & 1 ? '#ffffff' : '#80d8ff', frames: 12, jitter: 10, branches: 3 });
        }
        v('circle', q.cx, q.cy, { r: 46, frames: 18, color: '#80d8ff', spin: -0.16, glyphs: 8 });
        if (i === 0) v('worldTint', '#a0e0ff', 0.4, 30);
        KB.fx('fx_spark_field', q.cx, q.cy, { life: 14 });
      },
    });
  });

  // ---------- 6. 石頭：巨岩天墜 ----------
  M('stone', '巨岩天墜', p => {
    intro(p, '#b0a090', { sfx: 'stone', shake: 9 });
    storm(p, {
      n: 5, gap: 9, dmg: 12, type: 'stone', sfx: 'hardblock', shake2: 8, hitstop: 3,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const x = R.x + rnd(16, R.w - 16);
          v('beam', x, R.y, Math.PI / 2, R.h * 0.8, { width: 18, color: '#9a8878', frames: 10, taper: true });
          v('burst', x, R.y + R.h - 12, { n: 10, colors: ['#c8c0b0', '#8a8070', '#5a5248'], speed: 2.6, life: 30, grav: 0.12, size: 2 });
        }
        v('shockwave', q.cx, q.bottom, { w: 200, h: 16, dir: 1, speed: 8, frames: 16, color: '#c8c0b0' });
        v('shockwave', q.cx, q.bottom, { w: 200, h: 16, dir: -1, speed: 8, frames: 16, color: '#c8c0b0' });
      },
    });
  });

  // ---------- 7. 冰凍：絕對零度 ----------
  M('ice', '絕對零度', p => {
    intro(p, '#a0e8ff', { sfx: 'icewall', tint: 0.3, tintT: 70 });
    storm(p, {
      n: 6, gap: 8, dmg: 8, type: 'ice', sfx: 'ice', sfxEvery: 2, freeze: true,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 7; k++) {
          const x = R.x + rnd(6, R.w - 6), y = R.y + rnd(10, R.h - 10);
          KB.fx('fx_ice', x, y, { life: 16 });
          v('burst', x, y, { n: 5, colors: ['#ffffff', '#a0e8ff', '#60a8d8'], speed: 1.6, life: 28, grav: 0.03, size: 2 });
        }
        v('circle', q.cx, q.cy, { r: 34 + i * 8, frames: 26, color: '#c0f0ff', spin: 0.05, glyphs: 6 });
        if (i === 5) { v('flash', '#e0f8ff', 14, 0.85); v('worldTint', '#80c8ff', 0.45, 60); }
      },
    });
  });

  // ---------- 8. 鐵鎚：隕鎚天崩 ----------
  M('hammer', '隕鎚天崩', p => {
    intro(p, '#ff9040', { sfx: 'hammer', shake: 10, zoom: 1.24 });
    storm(p, {
      n: 4, gap: 12, dmg: 15, type: 'hammer', sfx: 'hammer', shake2: 10, hitstop: 4, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        v('beam', q.cx, R.y, Math.PI / 2, q.cy - R.y, { width: 46, color: '#d8a060', frames: 10, taper: true });
        v('shockwave', q.cx, q.bottom, { w: 256, h: 22, dir: 1, speed: 10, frames: 18, color: '#ffd0a0' });
        v('shockwave', q.cx, q.bottom, { w: 256, h: 22, dir: -1, speed: 10, frames: 18, color: '#ffd0a0' });
        v('ring', q.cx, q.bottom, { r0: 4, r1: 90, frames: 18, color: '#ffb060', width: 3 });
        v('burst', q.cx, q.bottom, { n: 20, colors: ['#ffe040', '#c89060', '#8a6040'], speed: 3.4, life: 32, grav: 0.16, size: 3 });
        v('textPop', q.cx, q.y - 16, i === 3 ? 'CRASH!!' : 'SMASH!', { color: '#ffe040', size: 10, frames: 30, rise: 0.5, outline: '#3a2400' });
      },
    });
  });

  // ---------- 9. 槍手：死亡輪舞 ----------
  M('gunner', '死亡輪舞', p => {
    intro(p, '#ffd070', { sfx: 'shotgun' });
    if (G()) G().slowMoT = Math.max(G().slowMoT | 0, 90);     // 子彈時間
    storm(p, {
      n: 6, gap: 7, dmg: 6, type: 'gunner', sfx: 'gun', sfxEvery: 2,
      each(q, i) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU + i * 0.26;
          ashoot({
            spr: 'proj_bullet', x: q.cx, y: q.cy, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
            dmg: 3, owner: 'player', life: 60, grav: 0, pierce: true, solid: false,
            w: 8, h: 8, breakBlocks: false, type: 'bullet',
          });
        }
        KB.fx('fx_muzzle', q.cx, q.cy, { life: 8 });
        v('ring', q.cx, q.cy, { r0: 4, r1: 54, frames: 12, color: '#ffd070', width: 2 });
        v('afterimage', q, { frames: 10, color: '#ffe0a0', every: 2, alpha: 0.45 });
      },
    });
  });

  // ---------- 10. 忍者：千影分身 ----------
  M('ninja', '千影分身', p => {
    intro(p, '#a070ff', { sfx: 'teleport' });
    storm(p, {
      n: 8, gap: 6, dmg: 7, type: 'ninja', sfx: 'shuriken', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 分身在畫面各處現身 → 斬擊 → 化為煙
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(24, R.w - 24), y = R.y + rnd(30, R.h - 30);
          v('slash', x, y, 26, rnd(-Math.PI, Math.PI), { color: '#d0b0ff', width: 3, frames: 10, arc: 1.9 });
          v('burst', x, y, { n: 6, colors: ['#a070ff', '#6a30a8', '#ffffff'], speed: 1.8, life: 20, grav: -0.02, size: 2 });
          KB.fx('fx_poof', x, y, { life: 12 });
        }
        v('afterimage', q, { frames: 12, color: '#a070ff', every: 1, alpha: 0.55 });
        if (i % 2 === 0) ashoot({ spr: 'proj_shuriken', x: q.cx, y: q.cy, vx: q.dir * 6, vy: rnd(-1.5, 1.5), dmg: 3, owner: 'player', life: 60, grav: 0, pierce: true, solid: false, w: 10, h: 10, rotSpeed: 0.6, breakBlocks: false, type: 'ninja' });
      },
    });
  });

  // ---------- 11. 居合：無想一閃 ----------
  M('blade', '無想一閃', p => {
    intro(p, '#ffffff', { sfx: 'iai', zoom: 1.26, lb: 170 });
    v('hitstop', 6);
    // 收刀 → 20 幀後一次爆發（全畫面白斬），再補 3 段追斬
    A.after(20, q => {
      if (!q) return;
      const R = camRect();
      v('flash', '#ffffff', 16, 0.95);
      v('line', R.x, q.cy, R.x + R.w, q.cy, { color: '#ffffff', width: 6, frames: 16 });
      v('beam', q.cx, q.cy, 1, 300, { width: 26, color: '#ffffff', frames: 18, taper: true });
      v('beam', q.cx, q.cy, -1, 300, { width: 26, color: '#ffffff', frames: 18, taper: true });
      v('hitstop', 6); v('shake', 10);
      sfx('slash_big');
      bigbox(q, { dmg: 26, type: 'blade', life: 6 });
    });
    storm(p, {
      n: 3, gap: 12, dmg: 8, type: 'blade', sfx: 'sword',
      each(q, i) {
        v('slash', q.cx, q.cy, 46, [-0.5, 0.6, 0][i], { color: '#e0e8ff', width: 4, frames: 12, arc: 2.6, flip: i & 1 });
        v('afterimage', q, { frames: 12, color: '#ffffff', every: 1, alpha: 0.6 });
      },
    });
  });

  // ---------- 12. 弓：流星群 ----------
  M('bow', '流星群', p => {
    intro(p, '#ffb060', { sfx: 'arrow_rain' });
    storm(p, {
      n: 7, gap: 7, dmg: 7, type: 'bow', sfx: 'arrow', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const x = R.x + rnd(0, R.w);
          ashoot({
            spr: 'proj_arrow_meteor', x, y: R.y - 8, vx: rnd(-1.2, 1.2), vy: 7,
            dmg: 4, owner: 'player', life: 80, grav: 0.12, pierce: true, solid: false,
            w: 10, h: 10, breakBlocks: false, type: 'bow', trail: ['#ffe040', '#ff8020'],
          });
          v('line', x - 30, R.y - 10, x, R.y + R.h * 0.6, { color: '#ffd080', width: 2, frames: 10 });
        }
        v('ring', q.cx, q.cy, { r0: 10, r1: 64, frames: 14, color: '#ffb060', width: 2 });
      },
    });
  });

  // ---------- 13. 法師：元素創世 ----------
  M('mage', '元素創世', p => {
    intro(p, '#c090ff', { sfx: 'magic_big', zoom: 1.2 });
    const COLS = ['#ff5010', '#60c8ff', '#ffe040', '#80ff90', '#c090ff', '#ffffff'];
    storm(p, {
      n: 6, gap: 8, dmg: 10, type: 'mage', sfx: 'magic_circle', sfxEvery: 2,
      each(q, i) {
        const c = COLS[i % COLS.length], R = camRect();
        v('circle', q.cx, q.cy, { r: 30 + i * 9, frames: 30, color: c, spin: (i & 1 ? 0.12 : -0.12), glyphs: 8 + i });
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU + i * 0.5;
          v('beam', q.cx, q.cy, a, 140, { width: 9, color: c, frames: 14, taper: true });
        }
        v('burst', R.cx, R.cy, { n: 16, colors: [c, '#ffffff'], speed: 3.2, life: 30, grav: -0.02, size: 2 });
        KB.fx('fx_rune', q.cx + rnd(-40, 40), q.cy + rnd(-30, 30), { life: 20 });
      },
    });
  });

  // ---------- 14. 時間：永恆時停（時停 8 秒 + 累積傷害 ×3）----------
  M('time', '永恆時停', p => {
    intro(p, '#d0d8e8', { sfx: 'timestop', tint: 0.35, tintT: 90, lb: 200 });
    const g = G();
    const STOP = 480;                           // 8 秒
    if (g) g.timeStopT = Math.max(g.timeStopT | 0, STOP);
    A.timeBonusT = STOP;                        // 這段期間所有累積傷害 ×3（見 scaleDmg 包裝）
    v('worldTint', '#8090b0', 0.4, STOP);
    v('textPop', p.cx, p.y - 22, '時間停止', { color: '#e0e8ff', size: 12, frames: 80, rise: 0.3, outline: '#181c28' });
    storm(p, {
      n: 10, gap: 10, dmg: 5, type: 'time', sfx: 'slowmo', sfxEvery: 4,
      each(q, i) {
        const R = camRect();
        v('circle', q.cx, q.cy, { r: 50, frames: 20, color: '#e0e8ff', spin: -0.2, glyphs: 12 });
        v('slash', R.x + rnd(20, R.w - 20), R.y + rnd(20, R.h - 20), 30, rnd(-Math.PI, Math.PI), { color: '#ffffff', width: 2, frames: 10, arc: 2.2 });
        v('afterimage', q, { frames: 10, color: '#c0d0ff', every: 1, alpha: 0.4 });
      },
    });
    A.after(STOP - 6, () => { sfx('timeresume'); v('flash', '#ffffff', 12, 0.7); });
  });

  // ---------- 15. 重力：黑洞崩壞 ----------
  M('gravity', '黑洞崩壞', p => {
    intro(p, '#9060ff', { sfx: 'blackhole', zoom: 1.22, lb: 170 });
    const hole = { x: p.cx, y: p.cy - 10 };
    v('circle', hole.x, hole.y, { r: 56, frames: 90, color: '#6030c0', spin: 0.2, glyphs: 14 });
    storm(p, {
      n: 8, gap: 8, dmg: 7, type: 'gravity', sfx: 'gravity_lift', sfxEvery: 3, knock: 0,
      each(q, i) {
        // 把所有敵人往黑洞拉
        const g = G();
        if (g) for (const e of g.entities) {
          if (e.dead || (e.type !== 'enemy' && !(e.type === 'proj' && e.owner === 'enemy'))) continue;
          const dx = hole.x - e.cx, dy = hole.y - e.cy, d = Math.max(6, Math.hypot(dx, dy));
          e.vx = dx / d * 2.6; e.vy = dy / d * 2.6 - 0.2;
        }
        v('ring', hole.x, hole.y, { r0: 70 - i * 6, r1: 6, frames: 14, color: '#b080ff', width: 3 });
        v('burst', hole.x, hole.y, { n: 12, colors: ['#9060ff', '#40208a', '#ffffff'], speed: 2.4, life: 24, grav: 0, size: 2 });
        if (i === 7) { v('flash', '#c0a0ff', 14, 0.85); v('hitstop', 6); v('shake', 10); bigbox(q, { dmg: 16, type: 'gravity', life: 6, cx: hole.x, cy: hole.y }); }
      },
    });
  });

  // ---------- 16. 分身：萬象分身 ----------
  M('clone', '萬象分身', p => {
    intro(p, '#70e0ff', { sfx: 'clone_summon' });
    storm(p, {
      n: 8, gap: 6, dmg: 7, type: 'clone', sfx: 'clone_rush', sfxEvery: 3,
      each(q, i) {
        const R = camRect();
        // 8 個分身輪流從左右衝過畫面
        const y = R.y + 40 + (i % 4) * 28, dir = i & 1 ? 1 : -1;
        const x0 = dir > 0 ? R.x - 10 : R.x + R.w + 10;
        v('line', x0, y, x0 + dir * R.w, y, { color: '#70e0ff', width: 4, frames: 10 });
        v('slash', R.cx, y, 28, dir > 0 ? 0 : Math.PI, { color: '#ffffff', width: 3, frames: 10, arc: 2.0 });
        v('afterimage', q, { frames: 12, color: '#70e0ff', every: 1, alpha: 0.5 });
        v('burst', R.cx, y, { n: 8, colors: ['#70e0ff', '#ffffff'], speed: 2.2, life: 22, grav: 0, size: 2 });
      },
    });
  });

  // ---------- 17. 巨大化：天地崩裂 ----------
  M('giant', '天地崩裂', p => {
    intro(p, '#ffd0a0', { sfx: 'giant_roar', zoom: 1.3, shake: 12 });
    storm(p, {
      n: 5, gap: 11, dmg: 13, type: 'giant', sfx: 'stomp', shake2: 12, hitstop: 4, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        v('shockwave', q.cx, q.bottom, { w: 300, h: 26, dir: 1, speed: 12, frames: 20, color: '#ffe0b0' });
        v('shockwave', q.cx, q.bottom, { w: 300, h: 26, dir: -1, speed: 12, frames: 20, color: '#ffe0b0' });
        for (let k = 0; k < 5; k++) v('burst', R.x + (k + 0.5) * R.w / 5, R.y + R.h - 6, { n: 10, colors: ['#c8b090', '#8a7050', '#ffe0b0'], speed: 3.2, life: 30, grav: 0.18, size: 3 });
        if (i === 4) { v('flash', '#fff0d0', 14, 0.8); v('textPop', q.cx, q.y - 20, '天地崩裂', { color: '#ffd0a0', size: 12, frames: 46, rise: 0.4, outline: '#3a2400' }); }
      },
    });
  });

  // ---------- 18. 龍：龍神咆哮 ----------
  M('dragon', '龍神咆哮', p => {
    intro(p, '#ff7040', { sfx: 'dragon_breath', zoom: 1.2 });
    storm(p, {
      n: 6, gap: 8, dmg: 10, type: 'dragon', sfx: 'dragon_breath', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 左右兩道貫穿畫面的龍焰 + 天上落下的火球
        v('beam', q.cx, q.cy, 1, 320, { width: 34 - i * 2, color: '#ff7040', frames: 16, taper: true });
        v('beam', q.cx, q.cy, -1, 320, { width: 34 - i * 2, color: '#ffb060', frames: 16, taper: true });
        for (let k = 0; k < 3; k++) {
          ashoot({
            spr: 'proj_drakofire', x: R.x + rnd(0, R.w), y: R.y - 6, vx: rnd(-1, 1), vy: 6,
            dmg: 4, owner: 'player', life: 70, grav: 0.1, pierce: true, solid: false,
            w: 12, h: 12, breakBlocks: false, type: 'dragon', trail: ['#ffb060', '#ff5010'],
          });
        }
        v('ring', q.cx, q.cy, { r0: 8, r1: 80, frames: 16, color: '#ff9050', width: 3 });
      },
    });
  });

  // ---------- 19. 機甲：最終兵器 ----------
  M('mech', '最終兵器', p => {
    intro(p, '#80c8ff', { sfx: 'rocket_punch', zoom: 1.22 });
    storm(p, {
      n: 7, gap: 7, dmg: 8, type: 'mech', sfx: 'missile', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const a = -Math.PI / 2 + rnd(-0.9, 0.9);
          ashoot({
            spr: 'proj_missile', x: q.cx + rnd(-10, 10), y: q.cy, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5,
            dmg: 3, owner: 'player', life: 80, grav: 0.06, pierce: false, solid: false,
            w: 10, h: 8, breakBlocks: false, type: 'mech', trail: ['#ffe040', '#80c8ff'],
          });
        }
        if (i % 2 === 1) v('beam', q.cx, q.cy, q.dir, 300, { width: 22, color: '#a0e0ff', frames: 14, taper: true });
        KB.fx('fx_gear', R.cx + rnd(-60, 60), R.cy + rnd(-40, 40), { life: 18 });
        v('lightning', q.cx, q.cy, R.x + rnd(0, R.w), R.y + rnd(0, R.h), { color: '#a0e0ff', frames: 10, jitter: 8, branches: 2 });
      },
    });
  });

  // ---------- 20. 幽靈：靈魂收割 ----------
  M('ghost', '靈魂收割', p => {
    intro(p, '#b0a0ff', { sfx: 'ghost_wail', tint: 0.35, tintT: 60 });
    let healed = 0;                            // 整招最多補 2 格體力
    storm(p, {
      n: 6, gap: 9, dmg: 9, type: 'ghost', sfx: 'ghost_phase', sfxEvery: 2,
      onHit(target, box) {
        const q = player();
        if (q && !box.__healed && healed < 2) { box.__healed = true; healed++; q.hp = Math.min(q.maxHp, q.hp + 1); }
      },
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const x = R.x + rnd(16, R.w - 16), y = R.y + rnd(20, R.h - 20);
          v('slash', x, y, 30, rnd(-Math.PI, Math.PI), { color: '#d0c0ff', width: 3, frames: 12, arc: 2.4 });
          v('burst', x, y, { n: 6, colors: ['#b0a0ff', '#6a30a8', '#ffffff'], speed: 1.4, life: 30, grav: -0.04, size: 2 });
        }
        v('circle', q.cx, q.cy, { r: 34 + i * 7, frames: 24, color: '#b0a0ff', spin: -0.1, glyphs: 7 });
        v('aura', q, { color: '#b0a0ff', r: 18, frames: 20, pulse: 0.4 });
      },
    });
  });

  // ================================================================ 混合能力覺醒招（Round 8「awaken-mix」）
  // 24 種混合能力各 1 招專屬覺醒招：把兩個成分的特色融合，演出比 20 招基本覺醒更誇張
  //   ‧ 一律 intro2()：letterbox（更長）+ zoom（更大）+ worldTint（兩個成分色各一次）+ flash + shake
  //   ‧ 一律至少 2 種以上 VFX 組合（slash / beam / lightning / circle / ring / shockwave / burst / afterimage / textPop…）
  //   ‧ 判定一律走 bigbox()（帶 awaken 旗標）與 ashoot()（帶 awaken 旗標）→ 魔王減傷 BOSS_MUL / 上限 BOSS_CAP 全部生效
  //   ‧ 開場疊上 art/kirby_awaken.js 的新精靈：kirby_awaken_cast（詠唱姿勢）+ fx_awk_<key>（每招專屬印記）
  const MIX_ORDER = A.MIX_ORDER = [
    'flamesword', 'frostsword', 'thunderblade', 'flamegun', 'frostgun', 'thunderbow',
    'flamehammer', 'stonehammer', 'shadowblade', 'starmage', 'frostdragon', 'thundermech',
    'flamebow', 'frosthammer', 'thundersword', 'flameninja', 'frostninja', 'thundergun',
    'stonegiant', 'flamedragon', 'thunderdragon', 'timebeam', 'gravityblade', 'hammermech',
  ];

  /** 混合覺醒招開場：詠唱姿勢 + 該招專屬印記（兩張都是 art/kirby_awaken.js 的新精靈） */
  function sigil(p, key, o) {
    o = o || {};
    try {
      KB.fx('kirby_awaken_cast', p.cx, p.cy - 2, { life: o.cast || 28, alpha: 0.82, z: 7 });
      KB.fx('fx_awk_' + key, p.cx, p.cy - (o.up === undefined ? 6 : o.up), { life: o.life || 34, alpha: 0.92, z: 7, fps: o.fps || 10 });
    } catch (e) { }
  }
  /** 比 intro() 更誇張的開場：兩段 worldTint（成分 A 色 → 成分 B 色）+ 大 zoom + 長 letterbox */
  function intro2(p, key, cA, cB, o) {
    o = o || {};
    v('letterbox', o.lb || 190);
    v('zoom', o.zoom || 1.28, o.zoomT || 30);
    // 兩段染色（成分 A 色 → 成分 B 色）；A.start 本身還有一層金色 worldTint(0.35)，
    // 所以這裡刻意壓低 alpha，疊起來才不會糊成一片單色看不見招式
    v('worldTint', cA, o.tint === undefined ? 0.26 : o.tint, o.tintT || 44);
    A.after(o.tint2 || 26, () => v('worldTint', cB, 0.22, 44));
    v('flash', o.flash || '#ffffff', 10, 0.72);
    v('shake', o.shake || 8);
    v('hitstop', o.hitstop === undefined ? 4 : o.hitstop);
    v('circle', p.cx, p.cy, { r: 44, frames: 60, color: cB, spin: o.spin || 0.14, glyphs: 12 });
    v('ring', p.cx, p.cy, { r0: 4, r1: 74, frames: 18, color: cA, width: 3 });
    sigil(p, key, o);
    if (o.sfx) sfx(o.sfx);
    if (o.sfx2) A.after(10, () => sfx(o.sfx2));
  }
  /** 收招：名稱橫幅 + 白閃 + 光環（每招結尾都放，讓「更誇張」有一致的收束） */
  function finale(delay, name, col, o) {
    o = o || {};
    A.after(delay, q => {
      if (!q) return;
      v('flash', o.flash || '#ffffff', 14, 0.82);
      v('ring', q.cx, q.cy, { r0: 4, r1: o.r || 94, frames: 20, color: col, width: 3 });
      v('textPop', q.cx, q.y - 20, name, { color: col, size: 12, frames: 48, rise: 0.4, outline: '#1a1024' });
      v('shake', o.shake || 8);
      if (o.hitstop) v('hitstop', o.hitstop);
      if (o.dmg) bigbox(q, { dmg: o.dmg, type: o.type || 'awaken', life: 6, breakBlocks: !!o.breakBlocks });
      if (o.sfx) sfx(o.sfx);
    });
  }
  /** 天降投射物（流星 / 落雷 / 落石共用） */
  function rain(q, spr, o) {
    o = o || {};
    const R = camRect(), n = o.n || 4;
    for (let k = 0; k < n; k++) {
      const x = o.x === undefined ? R.x + rnd(4, R.w - 4) : o.x;
      ashoot({
        spr, x, y: R.y - 8, vx: o.vx === undefined ? rnd(-1.2, 1.2) : o.vx, vy: o.vy || 7,
        dmg: o.dmg || 3, owner: 'player', life: o.life || 80, grav: o.grav === undefined ? 0.1 : o.grav,
        pierce: true, solid: false, w: o.w || 10, h: o.h || 10, breakBlocks: false,
        type: o.type || 'awaken', trail: o.trail || null, rotSpeed: o.rotSpeed || 0,
      });
      if (o.streak) v('line', x - 26, R.y - 10, x, R.y + R.h * 0.62, { color: o.streak, width: 2, frames: 10 });
    }
    // R8-P1-02：畫面外的魔王收不到天降投射 → 補一發會追過去的
    bossShot(q, spr, { dmg: o.dmg || 3, type: o.type || 'awaken', w: o.w || 10, h: o.h || 10, trail: o.trail || null, rotSpeed: o.rotSpeed || 0 });
  }
  /** 環形彈幕 */
  function ringShot(q, spr, o) {
    o = o || {};
    const n = o.n || 10, sp = o.speed || 5.4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + (o.off || 0);
      ashoot({
        spr, x: q.cx, y: q.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: o.dmg || 3, owner: 'player', life: o.life || 64, grav: 0, pierce: true, solid: false,
        w: o.w || 10, h: o.h || 10, breakBlocks: false, type: o.type || 'awaken',
        rotSpeed: o.rotSpeed || 0, trail: o.trail || null,
      });
    }
    // R8-P1-02：環形彈幕以卡比為圓心，畫面外的魔王吃不到 → 補一發會追過去的
    bossShot(q, spr, { dmg: o.dmg || 3, type: o.type || 'awaken', w: o.w || 10, h: o.h || 10, trail: o.trail || null, rotSpeed: o.rotSpeed || 0, speed: sp + 1.6 });
  }
  const MM = (key, name, exec) => { A.moves[key] = { key, name, exec, mix: true }; return A.moves[key]; };

  // ---------- 1. 炎劍：炎帝百斬 ----------
  MM('flamesword', '炎帝百斬', p => {
    intro2(p, 'flamesword', '#ff5a20', '#ffd060', { sfx: 'fireball', sfx2: 'slash_big' });
    storm(p, {
      n: 9, gap: 5, dmg: 7, type: 'fire', sfx: 'sword', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(18, R.w - 18), y = R.y + rnd(24, R.h - 24);
          v('slash', x, y, 36, rnd(-Math.PI, Math.PI), { color: k & 1 ? '#ffd060' : '#ff5a20', width: 4, frames: 12, arc: 2.3, flip: (i + k) & 1 });
          v('burst', x, y, { n: 7, colors: ['#ffe040', '#ff8020', '#c03000'], speed: 2.6, life: 24, grav: -0.05, size: 2 });
        }
        // 每 3 段從地面竄起一排火劍氣
        if (i % 3 === 0) for (let k = 0; k < 4; k++) {
          const x = R.x + (k + 0.5) * (R.w / 4);
          v('beam', x, R.y + R.h, -Math.PI / 2, R.h * 0.85, { width: 11, color: '#ff7020', frames: 13, taper: true });
        }
        v('afterimage', q, { frames: 10, color: '#ffb060', every: 1, alpha: 0.5 });
        if (i === 4) ringShot(q, 'proj_mix_wave_fire', { n: 8, dmg: 3, speed: 5, w: 14, h: 14, type: 'fire' });
      },
    });
    finale(50, '炎帝百斬', '#ff8030', { sfx: 'fire', dmg: 8, type: 'fire' });
  });

  // ---------- 2. 冰劍：永凍劍界 ----------
  MM('frostsword', '永凍劍界', p => {
    intro2(p, 'frostsword', '#78d8ff', '#ffffff', { sfx: 'icewall', sfx2: 'sword', tint: 0.3 });
    storm(p, {
      n: 8, gap: 6, dmg: 8, type: 'ice', sfx: 'ice', sfxEvery: 2, freeze: true,
      each(q, i) {
        const R = camRect();
        // 畫面各處立起冰劍（beam）→ 交叉斬
        for (let k = 0; k < 4; k++) {
          const x = R.x + rnd(14, R.w - 14), y = R.y + rnd(30, R.h - 20);
          v('beam', x, y + 40, -Math.PI / 2, 46, { width: 9, color: '#a8e8ff', frames: 14, taper: true });
          KB.fx('fx_ice', x, y, { life: 16 });
        }
        v('slash', q.cx, q.cy, 44, i * 0.9, { color: '#ffffff', width: 4, frames: 12, arc: 2.8, flip: i & 1 });
        v('circle', q.cx, q.cy, { r: 32 + i * 6, frames: 26, color: '#c0f0ff', spin: 0.06, glyphs: 6 });
        if (i === 3) rain(q, 'proj_mix_spike_ice', { n: 5, dmg: 3, vy: 6, grav: 0.06, type: 'ice' });
      },
    });
    finale(52, '永凍劍界', '#a8e8ff', { flash: '#e0f8ff', sfx: 'icewall', dmg: 8, type: 'ice' });
  });

  // ---------- 3. 雷刀：雷神一閃 ----------
  MM('thunderblade', '雷神一閃', p => {
    intro2(p, 'thunderblade', '#ffe040', '#ffffff', { sfx: 'iai', zoom: 1.32, lb: 200, hitstop: 8 });
    // 收刀 22 幀 → 全畫面雷光一閃（單段重擊）
    A.after(22, q => {
      if (!q) return;
      const R = camRect();
      // 白閃刻意壓到 0.6 / 12 幀：0.95 會把一閃的劍氣與雷弧整個蓋成一片白（看不出招式）
      v('flash', '#fffce0', 12, 0.6);
      v('line', R.x, q.cy, R.x + R.w, q.cy, { color: '#ffb000', width: 7, frames: 20 });
      v('beam', q.cx, q.cy, 1, 320, { width: 28, color: '#ffe040', frames: 20, taper: true });
      v('beam', q.cx, q.cy, -1, 320, { width: 28, color: '#ffe040', frames: 20, taper: true });
      for (let k = 0; k < 6; k++) v('lightning', q.cx, q.cy, R.x + rnd(0, R.w), R.y + rnd(0, R.h), { color: '#ffe040', frames: 12, jitter: 12, branches: 3 });
      v('hitstop', 8); v('shake', 12); sfx('thunder');
      bigbox(q, { dmg: 24, type: 'spark', life: 6 });
    });
    storm(p, {
      n: 4, gap: 11, dmg: 8, type: 'spark', sfx: 'spark',
      each(q, i) {
        v('slash', q.cx, q.cy, 48, [-0.6, 0.7, -0.2, 0.4][i], { color: '#fffce0', width: 4, frames: 12, arc: 2.7, flip: i & 1 });
        v('afterimage', q, { frames: 12, color: '#ffe040', every: 1, alpha: 0.6 });
        KB.fx('fx_spark_field', q.cx, q.cy, { life: 12 });
      },
    });
    finale(58, '雷神一閃', '#ffe040', { sfx: 'thunder' });
  });

  // ---------- 4. 火焰槍：煉獄輪舞 ----------
  MM('flamegun', '煉獄輪舞', p => {
    intro2(p, 'flamegun', '#ff8828', '#ffd070', { sfx: 'shotgun', sfx2: 'fire' });
    if (G()) G().slowMoT = Math.max(G().slowMoT | 0, 60);        // 子彈時間（60 幀；拉長會讓魔王的無敵幀走太慢）
    storm(p, {
      n: 7, gap: 6, dmg: 6, type: 'fire', sfx: 'gun', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        ringShot(q, 'proj_mix_orb_fire', { n: 10, off: i * 0.3, dmg: 3, speed: 5.6, type: 'fire', trail: ['#ffe040', '#ff5010'] });
        KB.fx('fx_muzzle', q.cx, q.cy, { life: 8 });
        v('ring', q.cx, q.cy, { r0: 4, r1: 58, frames: 12, color: '#ff8828', width: 2 });
        // 地面火海
        v('shockwave', q.cx, q.bottom, { w: 190, h: 14, dir: i & 1 ? 1 : -1, speed: 9, frames: 16, color: '#ff9030' });
        v('burst', R.cx + rnd(-70, 70), R.y + R.h - 8, { n: 9, colors: ['#ffe040', '#ff8020', '#c03000'], speed: 3, life: 28, grav: -0.07, size: 2 });
        v('afterimage', q, { frames: 10, color: '#ffb060', every: 2, alpha: 0.45 });
      },
    });
    // 子彈時間結束後的收尾齊射（時間恢復正常速度，目標的無敵幀也回正常 → 這 3 段才吃得滿）
    storm(p, {
      n: 3, gap: 9, dmg: 9, type: 'fire', sfx: 'shotgun', delay: 64,
      each(q, i) {
        ringShot(q, 'proj_mix_orb_fire', { n: 8, off: i * 0.4, dmg: 3, speed: 6, type: 'fire', trail: ['#ffe040', '#ff5010'] });
        v('beam', q.cx, q.cy, q.dir, 240, { width: 20, color: '#ff9030', frames: 14, taper: true });
        v('burst', q.cx, q.cy, { n: 12, colors: ['#ffe040', '#ff8020'], speed: 3.2, life: 26, grav: -0.04, size: 2 });
      },
    });
    finale(96, '煉獄輪舞', '#ff8828', { sfx: 'fireball', dmg: 8, type: 'fire' });
  });

  // ---------- 5. 冰彈槍：絕零彈幕 ----------
  MM('frostgun', '絕零彈幕', p => {
    intro2(p, 'frostgun', '#9fe8ff', '#ffffff', { sfx: 'shotgun', sfx2: 'ice', tint: 0.28 });
    if (G()) G().slowMoT = Math.max(G().slowMoT | 0, 60);         // 子彈時間
    storm(p, {
      n: 8, gap: 6, dmg: 6, type: 'ice', sfx: 'gun', sfxEvery: 2, freeze: true,
      each(q, i) {
        const R = camRect();
        ringShot(q, 'proj_mix2_shard_ice', { n: 12, off: i * 0.22, dmg: 3, speed: 5.2, type: 'ice' });
        KB.fx('fx_muzzle', q.cx, q.cy, { life: 8 });
        v('circle', q.cx, q.cy, { r: 30 + i * 5, frames: 22, color: '#c0f0ff', spin: -0.1, glyphs: 8 });
        for (let k = 0; k < 3; k++) KB.fx('fx_ice', R.x + rnd(10, R.w - 10), R.y + rnd(16, R.h - 16), { life: 16 });
        if (i === 7) { v('flash', '#e0f8ff', 14, 0.85); v('worldTint', '#80c8ff', 0.45, 50); }
      },
    });
    // 子彈時間結束後的收尾齊射
    storm(p, {
      n: 3, gap: 9, dmg: 9, type: 'ice', sfx: 'shotgun', delay: 64, freeze: true,
      each(q, i) {
        ringShot(q, 'proj_mix2_shard_ice', { n: 10, off: i * 0.35, dmg: 3, speed: 5.8, type: 'ice' });
        v('beam', q.cx, q.cy, q.dir, 240, { width: 22, color: '#a8e8ff', frames: 14, taper: true });
        v('circle', q.cx, q.cy, { r: 46, frames: 22, color: '#e8fbff', spin: -0.14, glyphs: 8 });
      },
    });
    finale(96, '絕零彈幕', '#9fe8ff', { flash: '#e0f8ff', sfx: 'icewall', dmg: 8, type: 'ice' });
  });

  // ---------- 6. 雷弓：天雷千矢 ----------
  MM('thunderbow', '天雷千矢', p => {
    intro2(p, 'thunderbow', '#ffd020', '#ffffff', { sfx: 'arrow_rain', sfx2: 'thunder' });
    storm(p, {
      n: 8, gap: 6, dmg: 7, type: 'spark', sfx: 'bow', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        rain(q, 'proj_mix2_arrow_spark', { n: 4, dmg: 3, vy: 7.5, grav: 0.08, type: 'spark', trail: ['#ffe040', '#ffffff'], streak: '#ffe880' });
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(8, R.w - 8);
          v('lightning', x, R.y - 10, x + rnd(-16, 16), R.y + R.h, { color: k & 1 ? '#ffffff' : '#ffd020', frames: 12, jitter: 10, branches: 3 });
        }
        v('ring', q.cx, q.cy, { r0: 8, r1: 62, frames: 14, color: '#ffd020', width: 2 });
        if (i % 3 === 0) KB.fx('fx_spark_field', q.cx, q.cy, { life: 12 });
      },
    });
    finale(52, '天雷千矢', '#ffd020', { sfx: 'thunder', dmg: 8, type: 'spark' });
  });

  // ---------- 7. 火鎚：隕炎天崩 ----------
  MM('flamehammer', '隕炎天崩', p => {
    intro2(p, 'flamehammer', '#ff6a10', '#ffd0a0', { sfx: 'hammer', sfx2: 'meteor', zoom: 1.32, shake: 12 });
    storm(p, {
      n: 5, gap: 11, dmg: 13, type: 'fire', sfx: 'hammer', shake2: 11, hitstop: 4, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        v('beam', q.cx, R.y, Math.PI / 2, q.cy - R.y, { width: 48, color: '#ff8030', frames: 10, taper: true });
        v('shockwave', q.cx, q.bottom, { w: 256, h: 22, dir: 1, speed: 10, frames: 18, color: '#ffd0a0' });
        v('shockwave', q.cx, q.bottom, { w: 256, h: 22, dir: -1, speed: 10, frames: 18, color: '#ffd0a0' });
        v('ring', q.cx, q.bottom, { r0: 4, r1: 96, frames: 18, color: '#ff7020', width: 3 });
        v('burst', q.cx, q.bottom, { n: 20, colors: ['#ffe040', '#ff8020', '#8a4020'], speed: 3.6, life: 32, grav: 0.16, size: 3 });
        rain(q, 'proj_mix_orb_fire', { n: 3, dmg: 3, vy: 6.5, type: 'fire', trail: ['#ffb060', '#ff4010'] });
        v('textPop', q.cx, q.y - 16, i === 4 ? 'INFERNO!!' : 'SMASH!', { color: '#ffe040', size: 10, frames: 28, rise: 0.5, outline: '#3a2400' });
      },
    });
    finale(60, '隕炎天崩', '#ff6a10', { sfx: 'fireball', dmg: 8, type: 'fire', breakBlocks: true, hitstop: 4 });
  });

  // ---------- 8. 岩鎚：大地終焉 ----------
  MM('stonehammer', '大地終焉', p => {
    intro2(p, 'stonehammer', '#c0b098', '#ffe0b0', { sfx: 'hardblock', sfx2: 'stone', zoom: 1.3, shake: 12 });
    storm(p, {
      n: 5, gap: 11, dmg: 13, type: 'stone', sfx: 'hardblock', shake2: 12, hitstop: 4, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const x = R.x + rnd(14, R.w - 14);
          v('beam', x, R.y, Math.PI / 2, R.h * 0.85, { width: 20, color: '#9a8878', frames: 10, taper: true });
          v('burst', x, R.y + R.h - 12, { n: 10, colors: ['#e8e0d0', '#a89078', '#5a4838'], speed: 2.8, life: 30, grav: 0.14, size: 2 });
        }
        v('shockwave', q.cx, q.bottom, { w: 280, h: 24, dir: 1, speed: 11, frames: 20, color: '#e0d8c8' });
        v('shockwave', q.cx, q.bottom, { w: 280, h: 24, dir: -1, speed: 11, frames: 20, color: '#e0d8c8' });
        v('ring', q.cx, q.bottom, { r0: 6, r1: 88, frames: 18, color: '#c0b098', width: 3 });
        if (i % 2 === 0) rain(q, 'proj_mix_orb_stone', { n: 3, dmg: 3, vy: 6, type: 'stone' });
      },
    });
    finale(62, '大地終焉', '#c0b098', { flash: '#ffe0b0', sfx: 'stone', dmg: 8, type: 'stone', breakBlocks: true, hitstop: 4 });
  });

  // ---------- 9. 影刃：千影刃陣 ----------
  MM('shadowblade', '千影刃陣', p => {
    intro2(p, 'shadowblade', '#b070f0', '#e0c8ff', { sfx: 'teleport', sfx2: 'cutter' });
    storm(p, {
      n: 9, gap: 5, dmg: 7, type: 'cutter', sfx: 'shuriken', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 影分身現身斬 + 迴旋刃向心收束
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(22, R.w - 22), y = R.y + rnd(28, R.h - 28);
          v('slash', x, y, 28, rnd(-Math.PI, Math.PI), { color: '#d0b0ff', width: 3, frames: 10, arc: 2.1 });
          KB.fx('fx_poof', x, y, { life: 12 });
        }
        ringShot(q, 'proj_mix_bolt_shadow', { n: 6, off: i * 0.42, dmg: 3, speed: 5, type: 'cutter', rotSpeed: 0.5 });
        v('ring', q.cx, q.cy, { r0: 66 - i * 5, r1: 6, frames: 14, color: '#b070f0', width: 2 });
        v('afterimage', q, { frames: 12, color: '#b070f0', every: 1, alpha: 0.55 });
      },
    });
    finale(52, '千影刃陣', '#b070f0', { sfx: 'cutter', dmg: 8, type: 'cutter' });
  });

  // ---------- 10. 星光法師：銀河創世 ----------
  MM('starmage', '銀河創世', p => {
    intro2(p, 'starmage', '#fff0a0', '#c090ff', { sfx: 'magic_big', sfx2: 'beam', zoom: 1.34, lb: 200 });
    const COLS = ['#fff0a0', '#c090ff', '#80d8ff', '#ffffff', '#ffd030', '#ff90d0'];
    storm(p, {
      n: 7, gap: 8, dmg: 10, type: 'beam', sfx: 'magic_circle', sfxEvery: 2,
      each(q, i) {
        const c = COLS[i % COLS.length], R = camRect();
        v('circle', q.cx, q.cy, { r: 28 + i * 8, frames: 30, color: c, spin: (i & 1 ? 0.14 : -0.14), glyphs: 9 + i });
        v('beam', q.cx, R.y, Math.PI / 2, R.h, { width: 34 - i * 3, color: '#fff0a0', frames: 16, taper: false });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + i * 0.34;
          v('beam', q.cx, q.cy, a, 150, { width: 8, color: c, frames: 14, taper: true });
        }
        v('burst', R.cx + rnd(-60, 60), R.cy + rnd(-40, 40), { n: 14, colors: [c, '#ffffff'], speed: 3, life: 30, grav: -0.03, size: 2 });
        KB.fx('fx_rune', q.cx + rnd(-44, 44), q.cy + rnd(-30, 30), { life: 20 });
      },
    });
    finale(62, '銀河創世', '#fff0a0', { r: 110, sfx: 'magic_big', dmg: 8, type: 'beam' });
  });

  // ---------- 11. 冰龍：冰龍神咆哮 ----------
  MM('frostdragon', '冰龍神咆哮', p => {
    intro2(p, 'frostdragon', '#8fdcff', '#ffffff', { sfx: 'dragon_breath', sfx2: 'icewall', zoom: 1.3, tint: 0.28 });
    storm(p, {
      n: 7, gap: 8, dmg: 9, type: 'ice', sfx: 'dragon_breath', sfxEvery: 2, freeze: true,
      each(q, i) {
        const R = camRect();
        v('beam', q.cx, q.cy, 1, 320, { width: 36 - i * 2, color: '#8fdcff', frames: 16, taper: true });
        v('beam', q.cx, q.cy, -1, 320, { width: 36 - i * 2, color: '#e8fbff', frames: 16, taper: true });
        rain(q, 'proj_mix_orb_ice', { n: 3, dmg: 3, vy: 6, type: 'ice', trail: ['#e8fbff', '#78d8ff'] });
        for (let k = 0; k < 3; k++) KB.fx('fx_ice', R.x + rnd(12, R.w - 12), R.y + rnd(18, R.h - 18), { life: 16 });
        v('ring', q.cx, q.cy, { r0: 8, r1: 82, frames: 16, color: '#8fdcff', width: 3 });
        if (i === 6) { v('flash', '#e0f8ff', 14, 0.85); v('worldTint', '#80c8ff', 0.45, 54); }
      },
    });
    finale(62, '冰龍神咆哮', '#8fdcff', { flash: '#e0f8ff', sfx: 'wing_flap', dmg: 8, type: 'ice' });
  });

  // ---------- 12. 雷電機甲：雷神兵器 ----------
  MM('thundermech', '雷神兵器', p => {
    intro2(p, 'thundermech', '#80c8ff', '#ffe040', { sfx: 'rocket_punch', sfx2: 'thunder', zoom: 1.3 });
    storm(p, {
      n: 8, gap: 7, dmg: 8, type: 'mech', sfx: 'missile', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 4; k++) {
          const a = -Math.PI / 2 + rnd(-1, 1);
          ashoot({
            spr: 'proj_mix2_rocket_spark', x: q.cx + rnd(-10, 10), y: q.cy, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6,
            dmg: 3, owner: 'player', life: 80, grav: 0.05, pierce: false, solid: false,
            w: 12, h: 8, breakBlocks: false, type: 'mech', trail: ['#ffe040', '#80c8ff'],
          });
        }
        if (i % 2 === 1) v('beam', q.cx, q.cy, q.dir, 320, { width: 26, color: '#a0e0ff', frames: 14, taper: true });
        v('lightning', q.cx, q.cy, R.x + rnd(0, R.w), R.y + rnd(0, R.h), { color: '#ffe040', frames: 10, jitter: 10, branches: 3 });
        KB.fx('fx_gear', R.cx + rnd(-60, 60), R.cy + rnd(-40, 40), { life: 18 });
        if (i === 7) KB.fx('fx_spark_field', q.cx, q.cy, { life: 14 });
      },
    });
    finale(62, '雷神兵器', '#80c8ff', { sfx: 'rocket_punch', dmg: 8, type: 'mech', hitstop: 4 });
  });

  // ---------- 13. 焰弓：鳳凰流星 ----------
  MM('flamebow', '鳳凰流星', p => {
    intro2(p, 'flamebow', '#ff7a30', '#ffe040', { sfx: 'arrow_rain', sfx2: 'fireball' });
    storm(p, {
      n: 8, gap: 6, dmg: 7, type: 'fire', sfx: 'bow', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        rain(q, 'proj_mix2_arrow_fire', { n: 4, dmg: 3, vy: 7, grav: 0.1, type: 'fire', trail: ['#ffe040', '#ff8020'], streak: '#ffd080' });
        // 鳳凰雙翼（兩道大弧）
        v('slash', q.cx - 16, q.cy - 6, 38, -2.2, { color: '#ff9030', width: 4, frames: 14, arc: 2.0 });
        v('slash', q.cx + 16, q.cy - 6, 38, -0.9, { color: '#ffe040', width: 4, frames: 14, arc: 2.0, flip: true });
        v('burst', q.cx, q.cy - 8, { n: 12, colors: ['#ffe040', '#ff8020', '#ffffff'], speed: 3, life: 28, grav: -0.06, size: 2 });
        if (i % 3 === 0) v('ring', q.cx, q.cy, { r0: 8, r1: 70, frames: 14, color: '#ff7a30', width: 2 });
      },
    });
    finale(56, '鳳凰流星', '#ff7a30', { r: 104, sfx: 'meteor', dmg: 8, type: 'fire' });
  });

  // ---------- 14. 冰鎚：冰河終焉 ----------
  MM('frosthammer', '冰河終焉', p => {
    intro2(p, 'frosthammer', '#6fd0f8', '#e8fbff', { sfx: 'hammer', sfx2: 'icewall', zoom: 1.3, shake: 11, tint: 0.4 });
    storm(p, {
      n: 5, gap: 11, dmg: 12, type: 'ice', sfx: 'hammer', shake2: 10, hitstop: 4, freeze: true,
      each(q, i) {
        const R = camRect();
        v('shockwave', q.cx, q.bottom, { w: 272, h: 22, dir: 1, speed: 10, frames: 20, color: '#c0f0ff' });
        v('shockwave', q.cx, q.bottom, { w: 272, h: 22, dir: -1, speed: 10, frames: 20, color: '#c0f0ff' });
        for (let k = 0; k < 5; k++) {
          const x = R.x + (k + 0.5) * (R.w / 5) + rnd(-8, 8);
          v('beam', x, R.y + R.h, -Math.PI / 2, 56 + i * 6, { width: 13, color: '#a8e8ff', frames: 14, taper: true });
          KB.fx('fx_ice', x, R.y + R.h - 30, { life: 16 });
        }
        v('circle', q.cx, q.cy, { r: 34 + i * 9, frames: 26, color: '#e8fbff', spin: 0.05, glyphs: 7 });
        // R8-P2-04：全畫面結冰的白底上淺色字讀不出來 → 亮字 + 2px 深藍黑外框（textPop outlineW）
        v('textPop', q.cx, q.y - 16, i === 4 ? 'GLACIER!!' : 'FREEZE!', { color: '#eaf8ff', size: 10, frames: 28, rise: 0.5, outline: '#08203a', outlineW: 2 });
      },
    });
    finale(60, '冰河終焉', '#6fd0f8', { flash: '#e0f8ff', sfx: 'icewall', dmg: 8, type: 'ice', hitstop: 4 });
  });

  // ---------- 15. 雷劍：雷帝百斬 ----------
  MM('thundersword', '雷帝百斬', p => {
    intro2(p, 'thundersword', '#ffe860', '#ffffff', { sfx: 'thunder', sfx2: 'sword' });
    storm(p, {
      n: 9, gap: 5, dmg: 7, type: 'spark', sfx: 'sword', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(18, R.w - 18), y = R.y + rnd(24, R.h - 24);
          v('slash', x, y, 34, rnd(-Math.PI, Math.PI), { color: k & 1 ? '#ffffff' : '#ffe860', width: 4, frames: 12, arc: 2.2, flip: (i + k) & 1 });
          v('lightning', q.cx, q.cy, x, y, { color: '#ffe040', frames: 10, jitter: 8, branches: 2 });
        }
        v('afterimage', q, { frames: 10, color: '#ffe860', every: 1, alpha: 0.55 });
        if (i % 3 === 0) { KB.fx('fx_spark_field', q.cx, q.cy, { life: 12 }); v('worldTint', '#ffe860', 0.22, 16); }
      },
    });
    finale(52, '雷帝百斬', '#ffe860', { sfx: 'thunder', dmg: 8, type: 'spark' });
  });

  // ---------- 16. 火忍：火遁・大焚天 ----------
  MM('flameninja', '火遁・大焚天', p => {
    intro2(p, 'flameninja', '#ff5828', '#e0c8ff', { sfx: 'teleport', sfx2: 'fireball' });
    storm(p, {
      n: 9, gap: 5, dmg: 7, type: 'fire', sfx: 'shuriken', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(22, R.w - 22), y = R.y + rnd(28, R.h - 28);
          KB.fx('fx_poof', x, y, { life: 12 });
          v('slash', x, y, 26, rnd(-Math.PI, Math.PI), { color: '#ff9040', width: 3, frames: 10, arc: 2.0 });
          v('burst', x, y, { n: 8, colors: ['#ffe040', '#ff5828', '#3a1860'], speed: 2.2, life: 24, grav: -0.05, size: 2 });
        }
        if (i % 2 === 0) ringShot(q, 'proj_mix2_star_fire', { n: 5, off: i * 0.5, dmg: 3, speed: 5.4, type: 'fire', rotSpeed: 0.7 });
        v('afterimage', q, { frames: 12, color: '#ff7040', every: 1, alpha: 0.55 });
        if (i === 8) { v('circle', q.cx, q.cy, { r: 62, frames: 28, color: '#ff5828', spin: 0.16, glyphs: 12 }); v('flash', '#ffd0a0', 14, 0.8); }
      },
    });
    finale(54, '火遁・大焚天', '#ff5828', { sfx: 'fire', dmg: 8, type: 'fire' });
  });

  // ---------- 17. 冰忍：冰遁・絕零陣 ----------
  MM('frostninja', '冰遁・絕零陣', p => {
    intro2(p, 'frostninja', '#a8e8ff', '#9060e0', { sfx: 'teleport', sfx2: 'ice', tint: 0.28 });
    storm(p, {
      n: 9, gap: 5, dmg: 7, type: 'ice', sfx: 'shuriken', sfxEvery: 2, freeze: true,
      each(q, i) {
        const R = camRect();
        // 冰鏡分身：現身 → 碎鏡冰片
        for (let k = 0; k < 3; k++) {
          const x = R.x + rnd(22, R.w - 22), y = R.y + rnd(28, R.h - 28);
          KB.fx('fx_ice', x, y, { life: 16 });
          v('slash', x, y, 26, rnd(-Math.PI, Math.PI), { color: '#e8fbff', width: 3, frames: 10, arc: 2.0 });
          v('burst', x, y, { n: 7, colors: ['#ffffff', '#a8e8ff', '#2060b0'], speed: 1.9, life: 26, grav: 0.02, size: 2 });
        }
        if (i % 2 === 0) ringShot(q, 'proj_mix2_star_ice', { n: 5, off: i * 0.45, dmg: 3, speed: 5.2, type: 'ice', rotSpeed: 0.7 });
        v('circle', q.cx, q.cy, { r: 30 + i * 5, frames: 24, color: '#c0f0ff', spin: -0.12, glyphs: 8 });
        v('afterimage', q, { frames: 12, color: '#a8e8ff', every: 1, alpha: 0.5 });
      },
    });
    finale(54, '冰遁・絕零陣', '#a8e8ff', { flash: '#e0f8ff', sfx: 'icewall', dmg: 8, type: 'ice' });
  });

  // ---------- 18. 雷槍：雷射死亡輪舞 ----------
  MM('thundergun', '雷射死亡輪舞', p => {
    intro2(p, 'thundergun', '#ffc830', '#a0e0ff', { sfx: 'shotgun', sfx2: 'thunder' });
    if (G()) G().slowMoT = Math.max(G().slowMoT | 0, 60);         // 子彈時間
    storm(p, {
      n: 7, gap: 7, dmg: 7, type: 'spark', sfx: 'gun', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 旋轉雷射（6 道）+ 電擊彈
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + i * 0.32;
          v('beam', q.cx, q.cy, a, 170, { width: 9, color: k & 1 ? '#ffc830' : '#a0e0ff', frames: 14, taper: true });
        }
        ringShot(q, 'proj_mix_bolt_spark', { n: 8, off: i * 0.3, dmg: 3, speed: 5.6, type: 'spark' });
        KB.fx('fx_muzzle', q.cx, q.cy, { life: 8 });
        v('lightning', R.x, R.cy + Math.sin(i) * 30, R.x + R.w, R.cy - Math.sin(i) * 30, { color: '#ffe040', frames: 12, jitter: 12, branches: 3 });
        v('afterimage', q, { frames: 10, color: '#ffe880', every: 2, alpha: 0.45 });
      },
    });
    // 子彈時間結束後的收尾雷射
    storm(p, {
      n: 3, gap: 9, dmg: 9, type: 'spark', sfx: 'shotgun', delay: 64,
      each(q, i) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + i * 0.4;
          v('beam', q.cx, q.cy, a, 220, { width: 14, color: k & 1 ? '#ffc830' : '#a0e0ff', frames: 14, taper: true });
        }
        ringShot(q, 'proj_mix_bolt_spark', { n: 6, off: i * 0.4, dmg: 3, speed: 6, type: 'spark' });
        KB.fx('fx_spark_field', q.cx, q.cy, { life: 14 });
      },
    });
    finale(96, '雷射死亡輪舞', '#ffc830', { sfx: 'thunder', dmg: 8, type: 'spark' });
  });

  // ---------- 19. 岩巨人：山崩地裂 ----------
  MM('stonegiant', '山崩地裂', p => {
    intro2(p, 'stonegiant', '#a89078', '#ffe0b0', { sfx: 'giant_roar', sfx2: 'stomp', zoom: 1.36, shake: 14 });
    storm(p, {
      n: 5, gap: 11, dmg: 13, type: 'stone', sfx: 'stomp', shake2: 13, hitstop: 5, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        v('shockwave', q.cx, q.bottom, { w: 300, h: 28, dir: 1, speed: 12, frames: 20, color: '#e8e0d0' });
        v('shockwave', q.cx, q.bottom, { w: 300, h: 28, dir: -1, speed: 12, frames: 20, color: '#e8e0d0' });
        rain(q, 'proj_mix_orb_stone', { n: 4, dmg: 3, vy: 6.4, type: 'stone' });
        for (let k = 0; k < 5; k++) v('burst', R.x + (k + 0.5) * R.w / 5, R.y + R.h - 6, { n: 11, colors: ['#e8e0d0', '#a89078', '#5a4838'], speed: 3.4, life: 32, grav: 0.18, size: 3 });
        v('ring', q.cx, q.bottom, { r0: 6, r1: 100, frames: 20, color: '#a89078', width: 3 });
        v('textPop', q.cx, q.y - 18, i === 4 ? 'COLLAPSE!!' : 'QUAKE!', { color: '#ffe0b0', size: 10, frames: 30, rise: 0.5, outline: '#3a2400' });
      },
    });
    finale(64, '山崩地裂', '#a89078', { flash: '#fff0d0', sfx: 'giant_roar', dmg: 8, type: 'stone', breakBlocks: true, hitstop: 5, shake: 12 });
  });

  // ---------- 20. 炎龍：太陽龍神 ----------
  MM('flamedragon', '太陽龍神', p => {
    intro2(p, 'flamedragon', '#ff5030', '#ffe040', { sfx: 'giant_roar', sfx2: 'dragon_breath', zoom: 1.34, lb: 200 });
    const sun = { x: p.cx, y: p.cy - 14 };
    v('circle', sun.x, sun.y, { r: 58, frames: 100, color: '#ffb020', spin: 0.1, glyphs: 14 });
    storm(p, {
      n: 7, gap: 8, dmg: 9, type: 'fire', sfx: 'dragon_breath', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 太陽（放射光柱）+ 左右貫穿龍焰 + 火雨
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + i * 0.2;
          v('beam', sun.x, sun.y, a, 130, { width: 10, color: k & 1 ? '#ffe040' : '#ff5030', frames: 14, taper: true });
        }
        v('beam', q.cx, q.cy, 1, 320, { width: 32 - i * 2, color: '#ff7040', frames: 16, taper: true });
        v('beam', q.cx, q.cy, -1, 320, { width: 32 - i * 2, color: '#ffb060', frames: 16, taper: true });
        rain(q, 'proj_mix_orb_fire', { n: 3, dmg: 3, vy: 6.2, type: 'fire', trail: ['#ffe040', '#ff5010'] });
        v('burst', sun.x, sun.y, { n: 14, colors: ['#fff0a0', '#ff8020', '#c03000'], speed: 3.4, life: 30, grav: -0.03, size: 2 });
        if (i === 6) { v('flash', '#fff0c0', 16, 0.9); v('worldTint', '#ff8020', 0.42, 50); }
      },
    });
    finale(66, '太陽龍神', '#ff5030', { r: 112, sfx: 'wing_flap', dmg: 8, type: 'fire' });
  });

  // ---------- 21. 雷龍：雷雲龍神 ----------
  MM('thunderdragon', '雷雲龍神', p => {
    intro2(p, 'thunderdragon', '#b0d8ff', '#ffe040', { sfx: 'giant_roar', sfx2: 'thunder', zoom: 1.32, tint: 0.27 });
    storm(p, {
      n: 7, gap: 8, dmg: 9, type: 'spark', sfx: 'thunder', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 雷雲落雷柱 + 左右雷息
        for (let k = 0; k < 5; k++) {
          const x = R.x + (k + 0.5) * (R.w / 5) + rnd(-12, 12);
          v('lightning', x, R.y - 10, x + rnd(-14, 14), R.y + R.h, { color: k & 1 ? '#ffffff' : '#ffe040', frames: 12, jitter: 11, branches: 3 });
          v('beam', x, R.y, Math.PI / 2, R.h * 0.9, { width: 8, color: '#b0d8ff', frames: 10, taper: true });
        }
        v('beam', q.cx, q.cy, 1, 300, { width: 30 - i * 2, color: '#b0d8ff', frames: 16, taper: true });
        v('beam', q.cx, q.cy, -1, 300, { width: 30 - i * 2, color: '#ffe040', frames: 16, taper: true });
        KB.fx('fx_spark_field', q.cx, q.cy, { life: 14 });
        if (i % 2 === 0) v('worldTint', '#a0c8ff', 0.3, 18);
      },
    });
    finale(66, '雷雲龍神', '#b0d8ff', { sfx: 'wing_flap', dmg: 8, type: 'spark' });
  });

  // ---------- 22. 時光束：時空崩壞（時停 + 光柱）----------
  MM('timebeam', '時空崩壞', p => {
    intro2(p, 'timebeam', '#c0a8ff', '#ffffff', { sfx: 'timestop', sfx2: 'beam', zoom: 1.3, lb: 210, tint: 0.27 });
    const g = G(), STOP = 150;
    if (g) g.timeStopT = Math.max(g.timeStopT | 0, STOP);       // 全場定格
    v('worldTint', '#8090b0', 0.4, STOP);
    v('textPop', p.cx, p.y - 24, '時間停止', { color: '#e0e8ff', size: 12, frames: 80, rise: 0.3, outline: '#181c28' });
    storm(p, {
      n: 9, gap: 8, dmg: 7, type: 'beam', sfx: 'beam', sfxEvery: 2,
      each(q, i) {
        const R = camRect();
        // 停滯的時空裡落下光柱
        const x = R.x + (i % 3) * (R.w / 3) + R.w / 6 + rnd(-14, 14);
        v('beam', x, R.y, Math.PI / 2, R.h, { width: 30 - i * 2, color: '#fff0ff', frames: 18, taper: false });
        v('beam', q.cx, R.y, Math.PI / 2, R.h, { width: 16, color: '#c0a8ff', frames: 14, taper: false });
        v('circle', q.cx, q.cy, { r: 44 + i * 4, frames: 24, color: '#e0e8ff', spin: -0.22, glyphs: 12 });
        v('burst', x, R.y + R.h - 10, { n: 10, colors: ['#ffffff', '#c0a8ff', '#404870'], speed: 2.6, life: 28, grav: -0.02, size: 2 });
        v('afterimage', q, { frames: 10, color: '#c0d0ff', every: 1, alpha: 0.4 });
        if (i === 8) { v('flash', '#ffffff', 16, 0.9); v('shake', 12); }
      },
    });
    // 時停解除的瞬間：剛才停滯的光柱「一起落下」（5 段解放，時停期間被凍住的目標這時才吃滿）
    A.after(STOP - 8, () => { sfx('timeresume'); v('flash', '#ffffff', 14, 0.8); v('shake', 10); });
    storm(p, {
      n: 5, gap: 7, dmg: 8, type: 'beam', sfx: 'beam', sfxEvery: 2, delay: STOP + 4,
      each(q, i) {
        const R = camRect();
        for (let k = 0; k < 3; k++) {
          const x = R.x + (k + 0.5) * (R.w / 3) + rnd(-16, 16);
          v('beam', x, R.y, Math.PI / 2, R.h, { width: 26 - i * 2, color: k & 1 ? '#c0a8ff' : '#ffffff', frames: 16, taper: false });
        }
        v('ring', q.cx, q.cy, { r0: 6, r1: 80, frames: 16, color: '#c0a8ff', width: 3 });
        v('burst', q.cx, q.cy, { n: 12, colors: ['#ffffff', '#c0a8ff', '#404870'], speed: 3, life: 26, grav: -0.02, size: 2 });
      },
    });
    finale(STOP + 46, '時空崩壞', '#c0a8ff', { r: 108, sfx: 'magic_big', dmg: 8, type: 'beam', hitstop: 4 });
  });

  // ---------- 23. 重力刃：刃之黑洞 ----------
  MM('gravityblade', '刃之黑洞', p => {
    intro2(p, 'gravityblade', '#9060e0', '#d0b0ff', { sfx: 'blackhole', sfx2: 'cutter', zoom: 1.32, lb: 200 });
    const hole = { x: p.cx, y: p.cy - 10 };
    v('circle', hole.x, hole.y, { r: 58, frames: 100, color: '#6030c0', spin: 0.24, glyphs: 14 });
    storm(p, {
      n: 9, gap: 7, dmg: 7, type: 'cutter', sfx: 'gravity_lift', sfxEvery: 3, knock: 0,
      each(q, i) {
        const g = G(), R = camRect();
        // 把敵人 / 敵彈吸進黑洞，刃在外圈向心收束
        if (g) for (const e of g.entities) {
          if (e.dead || (e.type !== 'enemy' && !(e.type === 'proj' && e.owner === 'enemy'))) continue;
          const dx = hole.x - e.cx, dy = hole.y - e.cy, d = Math.max(6, Math.hypot(dx, dy));
          e.vx = dx / d * 2.8; e.vy = dy / d * 2.8 - 0.2;
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + i * 0.5, r = 74 - i * 5;
          ashoot({
            spr: 'proj_mix2_ring_void', x: hole.x + Math.cos(a) * r, y: hole.y + Math.sin(a) * r,
            vx: -Math.cos(a) * 4.6, vy: -Math.sin(a) * 4.6, dmg: 3, owner: 'player', life: 40,
            grav: 0, pierce: true, solid: false, w: 12, h: 12, rotSpeed: 0.6, breakBlocks: false, type: 'cutter',
          });
          v('slash', hole.x + Math.cos(a) * r, hole.y + Math.sin(a) * r, 26, a + Math.PI, { color: '#d0b0ff', width: 3, frames: 10, arc: 2.0 });
        }
        v('ring', hole.x, hole.y, { r0: 78 - i * 6, r1: 6, frames: 14, color: '#b080ff', width: 3 });
        v('burst', hole.x, hole.y, { n: 12, colors: ['#9060e0', '#280a4a', '#ffffff'], speed: 2.4, life: 24, grav: 0, size: 2 });
        if (i === 8) { v('flash', '#c0a0ff', 16, 0.9); v('hitstop', 6); v('shake', 12); bigbox(q, { dmg: 14, type: 'cutter', life: 6, cx: hole.x, cy: hole.y }); }
      },
    });
    finale(72, '刃之黑洞', '#9060e0', { r: 106, sfx: 'blackhole' });
  });

  // ---------- 24. 鎚機甲：軌道終焉鎚 ----------
  MM('hammermech', '軌道終焉鎚', p => {
    intro2(p, 'hammermech', '#ff9850', '#90a8c8', { sfx: 'jet', sfx2: 'hammer', zoom: 1.34, shake: 12, lb: 200 });
    storm(p, {
      n: 5, gap: 12, dmg: 13, type: 'mech', sfx: 'hammer', shake2: 12, hitstop: 5, breakBlocks: true,
      each(q, i) {
        const R = camRect();
        // 軌道砲柱從天而降 + 鎚擊衝擊波 + 飛彈齊射
        const x = q.cx + rnd(-30, 30);
        v('beam', x, R.y, Math.PI / 2, R.h, { width: 44 - i * 3, color: '#e8f0ff', frames: 16, taper: false });
        v('beam', q.cx, R.y, Math.PI / 2, q.cy - R.y, { width: 40, color: '#ff9850', frames: 10, taper: true });
        v('shockwave', q.cx, q.bottom, { w: 264, h: 24, dir: 1, speed: 11, frames: 20, color: '#ffd0a0' });
        v('shockwave', q.cx, q.bottom, { w: 264, h: 24, dir: -1, speed: 11, frames: 20, color: '#ffd0a0' });
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + rnd(-0.8, 0.8);
          ashoot({
            spr: 'proj_mix2_rocket_steel', x: q.cx + rnd(-10, 10), y: q.cy, vx: Math.cos(a) * 4.4, vy: Math.sin(a) * 4.4,
            dmg: 3, owner: 'player', life: 80, grav: 0.05, pierce: false, solid: false,
            w: 12, h: 8, breakBlocks: false, type: 'mech', trail: ['#ffd0a0', '#90a8c8'],
          });
        }
        KB.fx('fx_gear', R.cx + rnd(-60, 60), R.cy + rnd(-40, 40), { life: 18 });
        v('textPop', q.cx, q.y - 18, i === 4 ? 'ORBITAL!!' : 'LOCK ON', { color: '#ffd0a0', size: 10, frames: 28, rise: 0.5, outline: '#24303c' });
      },
    });
    finale(66, '軌道終焉鎚', '#ff9850', { r: 108, sfx: 'missile', dmg: 8, type: 'mech', breakBlocks: true, hitstop: 5, shake: 12 });
  });

  // ================================================================ 掛鉤
  // ① KB.PROG.scaleDmg：覺醒中傷害 ×1.5、time 覺醒招期間再 ×3；同時作為「命中敵人」的量表鉤子
  //    （game.js 的第一階段碰撞對每個成立的命中呼叫一次 scaleDmg，是唯一不改 game.js 就能攔到命中的點）
  // ② KB.PROG.update：每幀推進 A.tick
  // ③ KB.PROG.beginLevel：進關卡重置量表
  // ④ KB.PROG 'hurt' 事件：被打 −20
  function patch() {
    const pg = P(); if (!pg || pg.__awakenPatched) return false;
    const scale = pg.scaleDmg;
    pg.scaleDmg = function (dmg, key) {
      let d = scale.call(pg, dmg, key);
      const n = +d;
      if (n > 0) {
        if (A.active()) d = Math.max(n, Math.round(n * A.DMG));
        if (A.timeBonusT > 0) d = Math.max(d, Math.round(d * A.TIME_DMG));
      }
      A.hit();                       // 量表：命中敵人 +4（+ 連擊）
      return d;
    };
    const upd = pg.update;
    pg.update = function (game) { const r = upd.apply(pg, arguments); try { A.tick(game); } catch (e) { } return r; };
    const begin = pg.beginLevel;
    pg.beginLevel = function (game) { const r = begin.apply(pg, arguments); try { A.reset(); } catch (e) { } return r; };
    if (pg.on) pg.on('hurt', () => A.onHurt());
    pg.__awakenPatched = true;
    return true;
  }
  patch();
  A.patch = patch;
})();
