// Lv4 覺醒系統 KB.AWAKEN（Round 7 覺醒與挑戰）
// 載入順序：player.js → game.js → progression.js → **awaken.js** → records.js / ui.js …
//   （所以這裡可以安全包住 KB.PROG 的函式，並在 KB.save 建好之後使用）
//
// ── KB.AWAKEN API（其他 agent 照這個介面呼叫；缺 KB.game / KB.PROG 時全部安全 no-op）──────────
//   量表   gauge（0~100，唯讀請用 A.gauge）/ MAX / add(n) / hit() / onHurt() / ready() / pct()
//   等級   lv4(key?)（能力是否 Lv4）/ LV（=4）
//   狀態   active() / activeT / DUR（=300）/ start(p) / end(p) / cancel()
//   觸發   tryTrigger(p)（player.js 每幀呼叫；只有「跳+攻 3 幀內」且量表滿才回 true）
//   招式   moves[key] = { name, exec(p) } / moveFor(key) / baseKey(key)（混合能力→主成分 A）/ exec(p, key)
//   繪製   drawGauge(ctx, game)（progression.drawHUD 內呼叫，畫在能力圖示下方 x4 y218 26×5）
//   雜項   tick(game)（由 KB.PROG.update 包裝自動每幀呼叫）/ reset() / after(frames, fn)
//
// ── 規則 ──────────────────────────────────────────────────────────────────────
//   1. 只有「持有的能力已經是 Lv4」時量表才會累積：命中敵人 +6、連擊每 +1 再 +2（連擊上限 10 → 最多 +26）、
//      受傷 −20（走 KB.PROG 的 'hurt' 事件）。滿 100 → HUD 量表閃爍 + textPop「覺醒 READY」+ sfx('max')。
//   2. 地面 / 空中同一幀（或 3 幀內先後）按下「跳 + 攻擊」且量表滿 → player.startAwaken()。
//      量表沒滿 / 能力不是 Lv4 → 完全不攔截，跳與攻擊照原本運作。
//   3. 覺醒狀態 300 幀：全身金色、無敵（金色閃爍與吃到無敵糖的彩虹閃不同）、移動速度 ×1.2、
//      所有招傷害 ×1.5（包進 KB.PROG.scaleDmg）、HUD Lv 星全金；結束時量表歸 0。
//   4. 覺醒發動當下立刻放出該能力的「覺醒招」（20 種基本能力各 1 招；混合能力用主成分 A 的招）。
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
  A.HIT_GAIN = 6;           // 命中敵人
  A.COMBO_GAIN = 2;         // 連擊每 +1 額外
  A.COMBO_CAP = 10;         // 連擊加成上限（避免一擊灌滿）
  A.HURT_LOSS = 20;         // 被打
  A.SPD = 1.2;              // 覺醒中移動速度
  A.DMG = 1.5;              // 覺醒中傷害
  A.TIME_DMG = 3;           // time 覺醒招：時停期間累積傷害 ×3
  const GOLD = A.GOLD = '#ffe040', GOLD_HI = A.GOLD_HI = '#fffce0', GOLD_LO = A.GOLD_LO = '#ff9800';

  // ---------------------------------------------------------------- 狀態
  A.gauge = 0;
  A.activeT = 0;
  A.timeBonusT = 0;         // time 覺醒招的「累積傷害 ×3」剩餘幀
  A.key = null;             // 覺醒中使用的能力
  A.moveName = '';
  A.wasFull = false;
  A.q = [];                 // 排程（after）
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
    sfx('max');
  };
  /** 命中敵人（由 KB.PROG.scaleDmg 的包裝呼叫）：+6，連擊每 +1 再 +2 */
  A.hit = function () {
    if (A.active() || !A.lv4()) return 0;
    const pg = P(), combo = pg ? Math.min(A.COMBO_CAP, pg.combo | 0) : 0;
    return A.add(A.HIT_GAIN + combo * A.COMBO_GAIN);
  };
  /** 被打：−20 */
  A.onHurt = function () { if (A.active()) return 0; return A.add(-A.HURT_LOSS); };

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

  // ---------------------------------------------------------------- 覺醒狀態
  A.start = function (p) {
    p = p || player();
    if (!p || !G() || !p.ability) return false;
    const key = p.ability, mv = A.moveFor(key);
    A.key = key;
    A.moveName = mv ? mv.name : '覺醒';
    A.activeT = A.DUR;
    A.q.length = 0;
    p.awakenT = A.DUR;
    p.invincibleT = Math.max(p.invincibleT | 0, A.DUR);
    // 吃掉這一幀的輸入：跳躍緩衝要清掉（否則下一幀會補跳），攻擊狀態先收招
    p.jumpBufT = 0; p.jumpHold = 0;
    if (p.state === 'attack') { p.attackTimer = 0; p.setState(p.onGround ? 'idle' : 'fall'); }
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
  // 混合能力（KB.MIX）用主成分 A 的覺醒招；變身系能力同樣有自己的招。
  A.moves = {};
  const MOVE_ORDER = A.MOVE_ORDER = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer',
    'gunner', 'ninja', 'blade', 'bow', 'mage', 'time', 'gravity', 'clone', 'giant', 'dragon', 'mech', 'ghost'];

  /** 混合能力 → 主成分 A（其他情況原樣回傳） */
  A.baseKey = function (key) {
    if (!key) return null;
    if (A.moves[key]) return key;
    try {
      if (KB.MIX && KB.MIX.isMix && KB.MIX.isMix(key)) {
        const ps = KB.MIX.parts(key);
        if (ps && ps[0] && A.moves[ps[0]]) return ps[0];
        if (ps && ps[1] && A.moves[ps[1]]) return ps[1];
      }
    } catch (e) { }
    return key;
  };
  A.moveFor = function (key) { const k = A.baseKey(key || curKey()); return (k && A.moves[k]) || null; };
  A.moveName2 = function (key) { const m = A.moveFor(key); return m ? m.name : ''; };
  A.exec = function (p, key) {
    p = p || player(); if (!p) return false;
    const m = A.moveFor(key || p.ability); if (!m) return false;
    try { m.exec(p); } catch (e) { return false; }
    return true;
  };

  // ---------- 招式共用零件 ----------
  /** 全畫面判定框（預設 288×208，以卡比為中心；不破壞地形） */
  function bigbox(p, o) {
    o = o || {};
    const w = o.w || 288, h = o.h || 208;
    const cx = o.cx === undefined ? p.cx : o.cx, cy = o.cy === undefined ? p.cy : o.cy;
    return KB.hitbox({
      x: cx - w / 2, y: cy - h / 2, w, h,
      dmg: o.dmg === undefined ? 10 : o.dmg,
      owner: 'player', type: o.type || 'awaken', life: o.life || 4,
      rehit: o.rehit || 0, pierce: true, knock: o.knock === undefined ? 2 : o.knock,
      breakBlocks: !!o.breakBlocks, freeze: !!o.freeze, onHit: o.onHit || null,
    });
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
    const n = o.n || 4, gap = o.gap || 8;
    for (let i = 0; i < n; i++) {
      A.after(1 + i * gap, pp => {
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
          KB.shoot({
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
    intro(p, '#a0e8ff', { sfx: 'icewall', tint: 0.4, tintT: 70 });
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
          KB.shoot({
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
        if (i % 2 === 0) KB.shoot({ spr: 'proj_shuriken', x: q.cx, y: q.cy, vx: q.dir * 6, vy: rnd(-1.5, 1.5), dmg: 3, owner: 'player', life: 60, grav: 0, pierce: true, solid: false, w: 10, h: 10, rotSpeed: 0.6, breakBlocks: false, type: 'ninja' });
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
          KB.shoot({
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
          KB.shoot({
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
          KB.shoot({
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
      A.hit();                       // 量表：命中敵人 +6（+ 連擊）
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
