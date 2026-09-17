// 複製能力 —— 8 種能力完整實作（火焰 / 劍 / 光束 / 刀刃 / 電擊 / 石頭 / 冰凍 / 鐵鎚）
// 介面：KB.ABILITIES[key] = { key, name, hudName, hat, icon, color, duration, lockMove, hold, maxHold, fps, canJump, moveSpeed,
//   onGet(p), onLose(p), onAttack(p), update(p, dt, held), onEnd(p), onCrouchAttack?(p), hatOffset?:{state:[ox,oy]} }
// 與 player.js 的 startAttack / updateAttack 流程相容：
//   - startAttack：setState('attack')、attackTimer=duration、attackLock=lockMove、attackFps=fps，最後呼叫 onAttack(p)
//   - updateAttack：每幀呼叫 update(p, dt, held)；hold 型能力按住時 attackTimer 會被續到 2（stateT < maxHold）；timer 歸零呼叫 onEnd
//   - 受傷 → dropAbility → onLose；死亡 / 進門 / 過關不會呼叫 onEnd，所以所有跟隨型判定框都用「心跳」續命
//     （每幀 life=3），攻擊狀態被任何原因中斷時 3 幀內自動消失；onEnd / onLose 另外明確清除。
(function () {
  KB.ABILITIES = KB.ABILITIES || {};
  const P = KB.PHYS;

  // ---------- 蓄力必殺的門檻（fix5b / R5-P1-03）----------
  // 這些數字就是招式表 / 圖鑑上寫給玩家看的「按住 N 幀放開」，
  // **從按下攻擊鍵的那一幀算起**。各招內部的計數器起點不同（有的要等收招動作演完才開始加），
  // 所以下面使用時會扣掉各自的偏移量；改數字時只改這裡，招式表文案也用同一個值。
  // 驗證：tools/enemy_test.py 的「蓄力門檻」段（按住 N+2 幀觸發、N-6 幀不觸發）。
  const HAMMER_SPIN = 40;   // 鐵鎚・大迴旋（招式表：按住 40 幀放開）
  const BEAM_WAVE = 45;   // 光束・星潮光束（招式表：按住 45 幀放開）
  const SPARK_BURST = 45;   // 電擊・電擊波（招式表：按住 45 幀放開）
  // fix6：Lv3 蓄力時間 ×0.8（KB.PROG.holdMul）。招式表上的數字一律是 **Lv1** 的門檻，
  //   能力練到 Lv3 之後同一招會提早 20% 蓄滿（KB.PROG 未載入時回傳原值，行為完全不變）。
  const HOLD = (key, n) => (KB.PROG && KB.PROG.holdMul) ? Math.max(4, Math.round(n * KB.PROG.holdMul(key))) : n;

  const def = (key, o) => {
    o.key = key; o.name = o.name || KB.ABILITY_NAMES[key]; o.hudName = o.hudName || KB.ABILITY_HUD[key];
    o.hat = o.hat || ('hat_' + key); o.icon = o.icon || ('ui_ability_' + key);
    KB.ABILITIES[key] = o; return o;
  };

  // ---------- 共用工具 ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const data = p => p.abilityData || (p.abilityData = {});
  const down = k => KB.input.down(k);
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  // 特效呼叫（src/vfx.js 的 KB.VFX）；KB.VFX 不存在或丟例外時整組 no-op，不影響判定
  const vx = function (name) {
    const V = KB.VFX;
    if (!V || typeof V[name] !== 'function') return null;
    try { return V[name].apply(V, Array.prototype.slice.call(arguments, 1)); } catch (e) { return null; }
  };
  // 蓄力完成的共用演出（flash + ring + MAX!）
  const chargeFx = (p, color) => { sfx('charge_ready'); vx('chargeReady', p.cx, p.cy - 14, color); };
  // 清除本能力產生、且必須隨攻擊結束的實體（判定框 / 光鞭）
  function killBox(p) {
    const d = data(p);
    if (d.box) { d.box.dead = true; d.box = null; }
    if (d.box2) { d.box2.dead = true; d.box2 = null; }
    if (d.whip) { d.whip.dead = true; d.whip = null; }
  }
  const beat = b => { if (b && !b.dead) b.life = 3; };                 // 心跳續命
  // Round 10：招式進行中改寫判定框尺寸 / 位移時，一律經過這裡。
  //   傳進來的 w / h / ox / oy 都是「原始（未放大）」數值，函式依 b.meleeScaled 重算實際值，
  //   規則與 entity.js Hitbox 建構子完全相同（方向框 3/4 往前 1/4 往後、對稱框置中、高度置中）。
  //   少了這層的話，逐幀改寫 b.w / b.ox 會把建構子放大的結果洗掉
  //   （劍的揮砍、火 / 冰的噴射與柱子、鐵鎚掄下都是逐幀改寫）。
  function fitBox(b, o) {
    if (!b || b.dead) return b;
    const s = b.meleeScaled || 1;
    const w = o.w !== undefined ? o.w : b.w0, h = o.h !== undefined ? o.h : b.h0;
    const w2 = Math.round(w * s), h2 = Math.round(h * s);
    if (o.ox !== undefined) b.ox = o.ox - (b.flipWithOwner ? Math.round((w2 - w) / 4) : Math.round((w2 - w) / 2));
    if (o.oy !== undefined) b.oy = o.oy - Math.round((h2 - h) / 2);
    b.w0 = w; b.h0 = h; b.w = w2; b.h = h2;
    return b;
  }
  // 判定框目前的「上緣高度」（放大後跟著變大），給頭頂柱狀招的特效用，讓火 / 冰噴到判定的邊界
  const boxUp = (b, d) => (b && !b.dead) ? -b.oy : d;
  // 暗房照明（mechanics）：招式期間每幀呼叫，game.js 的 drawDark 讀 lightR / lightT（結束後 180 幀線性縮回 40px）
  const light = r => { const g = KB.game; if (g) { g.lightR = r; g.lightT = 180; g.lightF = g.frame; } };
  const slowFall = (p, v) => { if (!p.onGround && p.vy > v) p.vy = v; }; // 空中攻擊時緩慢下落
  // 連段：setState 對相同狀態不會重置 stateT，所以先切回 idle 再重新 startAttack（動畫 / 計時 / 判定全部重來）
  function restartAttack(p) { p.setState('idle'); p.startAttack(); }
  // 指定下一招後重新起手（data.next 不會被 onEnd 清掉）
  function startMove(p, m) { data(p).next = m; restartAttack(p); }
  // hold 型能力：是否仍在噴射中（按住且未超過 maxHold，或最短噴射時間尚未用完）
  // maxHold 由各招式動態改寫：非按住型招式會設成 0，讓 player.js 的續命條件失效
  function holding(p, held) { const d = p.abilityDef; return (held && d.maxHold > 0 && p.stateT < d.maxHold) || p.attackTimer > 2; }
  // Round 9：招式方向快照。player-input 會在 startAttack 當幀寫入 p.atkDir = {up, down, air}；
  //   舊版 player.js（或 onStoneStart 這種不經過 startAttack 的路徑）沒有時就自己讀輸入，兩種都支援。
  const atkDir = p => p.atkDir || { up: down('up'), down: down('down'), air: !p.onGround };
  // 取出本次攻擊的招式：優先用 data.next（蹲攻 / 蓄力放開），否則依優先序「↑X > ↓X > 空中 X > X」判斷。
  //   空中按 ↑ / ↓ 一樣出對應的招（各招自己在內部做「空中版」變體：判定框跟著卡比 + slowFall 緩降）。
  function pickMode(p, air, upMode, ground, downMode) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    const a = atkDir(p);
    if (a.up && upMode) return upMode;
    if (a.down && downMode) return downMode;
    if (a.air && air) return air;
    return ground;
  }
  // 設定本招的動畫 / 長度 / 移動鎖（player.js 讀 def.anim、p.attackTimer、p.attackLock、p.attackFps）
  function setup(p, o) {
    const D = p.abilityDef;
    D.anim = o.anim || null; D.maxHold = o.maxHold || 0;
    p.attackTimer = o.dur; p.attackFps = o.fps || 10;
    p.attackLock = o.lock !== false;
  }
  const clearAnim = p => { const D = p.abilityDef; if (D) { D.anim = null; D.maxHold = D.maxHold0 || 0; } };

  // ======================================================================
  // 1. 火焰 FIRE
  //    X      噴火    ：按住最多 90 幀，前方火焰柱伸長到 40px，每 8 幀重複判定 dmg 1
  //    ↑+X    火焰噴泉：頭頂噴出火柱（伸長到 38px），判定跟著卡比、空中緩降（Round 9 新增）
  //    ↓+X    火焰衝刺：變成火球水平衝 40 幀，全身判定 dmg 3、可撞破星星 / 炸彈方塊
  //             （空中版 = 火焰俯衝：斜下俯衝、落地爆燃）
  //    空中 X 火焰旋轉：身體被火環包覆旋轉 30 幀，範圍判定 dmg 2、緩降
  // ======================================================================
  def('fire', {
    color: '#f04020', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    desc: '把火焰之心含在嘴裡，一張口就是熊熊烈焰。',
    moves: [['X', '噴火'], ['↑+X', '火焰噴泉'], ['↓+X', '火焰衝刺'], ['空中 X', '火焰旋轉']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'dash'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, 'spin', 'pillar', 'breath', 'dash');
      if (d.mode === 'pillar') {
        // ↑+X 火焰噴泉：頭頂的火柱慢慢長高（判定框跟著卡比，空中也能放）
        setup(p, { anim: 'kirby_attack_fire_up', dur: 26, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 16, h: 12, dmg: 2, owner: 'player', type: 'fire', follow: p, ox: -8, oy: -10, life: 3, rehit: 7, knock: 1.6, flipWithOwner: false, breakBlocks: true });
        p.vx *= 0.4;
        vx('ring', p.cx, p.y - 2, { r0: 3, r1: 22, frames: 14, color: '#ffb040', width: 2 });
        vx('burst', p.cx, p.y - 2, { n: 12, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 2.4, life: 22, grav: -0.06, size: 2, dir: -Math.PI / 2, spread: 0.7 });
        vx('shake', 2);
      } else if (d.mode === 'dash') {
        const air = !p.onGround;
        setup(p, { anim: 'kirby_attack_fire_dash', dur: 40, fps: 12, lock: true });
        d.dive = air;               // 空中版：火焰俯衝（判定框往下移，斜下衝）
        d.box = KB.hitbox({ x: 0, y: 0, w: 24, h: air ? 24 : 20, dmg: 3, owner: 'player', type: 'fire', follow: p, ox: -12, oy: air ? 2 : -3, life: 3, rehit: 8, knock: 2, flipWithOwner: false, breakBlocks: true });
        d.box.breakHard = true;     // 火焰衝刺可撞破硬磚 X（mechanics）
        p.vx = p.dir * (air ? 2.8 : 3.4);
        if (air) p.vy = 3.2;
        // 特效：橘色殘影 + 火星拖尾 + 起步爆燃
        vx('afterimage', p, { frames: 42, color: '#ff8030', every: 2, alpha: 0.55 });
        vx('sparkTrail', p, { color: ['#ffe040', '#ff9020', '#ff4010'], every: 2, life: 15, frames: 42 });
        vx('burst', p.cx - p.dir * 8, p.cy + 2, { n: 14, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 2.4, life: 22, grav: -0.03, size: 2, dir: p.dir > 0 ? Math.PI : 0, spread: 0.9 });
        vx('ring', p.cx, p.cy, { r0: 3, r1: 26, frames: 14, color: '#ffb040', width: 2 });
        vx('shake', 3);
      } else if (d.mode === 'spin') {
        setup(p, { anim: 'kirby_attack_fire_spin', dur: 30, fps: 14, lock: false });
        d.box = KB.hitbox({ x: 0, y: 0, w: 30, h: 28, dmg: 2, owner: 'player', type: 'fire', follow: p, ox: -15, oy: -14, life: 3, rehit: 8, knock: 1.2, flipWithOwner: false });
        vx('aura', p, { color: '#ff8030', r: 17, frames: 32, pulse: 0.35 });
        vx('afterimage', p, { frames: 30, color: '#ff8030', every: 3, alpha: 0.4 });
        vx('ring', p.cx, p.cy, { r0: 6, r1: 30, frames: 16, color: '#ffe040', width: 2 });
      } else {
        setup(p, { anim: null, dur: 12, fps: 10, lock: true, maxHold: 90 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 12, h: 16, dmg: 1, owner: 'player', type: 'fire', follow: p, ox: 6, oy: 0, life: 3, rehit: 8 });
      }
      KB.audio.sfx('fire');
    },
    update(p, dt, held) {
      const d = data(p), b = d.box;
      d.t++;
      light(64);                    // 火光：暗房照明半徑 64px
      if (d.mode === 'pillar') {
        // 火柱每幀長高 3px（最高 38px），判定框從卡比頭頂往上延伸
        slowFall(p, 0.6);
        if (b && !b.dead) {
          const hh = Math.min(38, 12 + d.t * 3); fitBox(b, { h: hh, oy: -hh + 2 }); beat(b);
        }
        p.vx *= 0.85;
        if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + rnd(-3, 3), p.y - rnd(2, boxUp(b, 12)), { vy: -1.6, life: 12, flip: Math.random() < 0.5, fps: 12 });
        KB.particles(p.cx + rnd(-6, 6), p.y - rnd(0, boxUp(b, 12)), ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.5, grav: -0.08, life: 14, up: 0.9, size: 1 });
        if (d.t === 10 || d.t === 20) vx('ring', p.cx, p.y - 16, { r0: 3, r1: 20, frames: 12, color: '#ffe040', width: 2 });
        if (d.t % 12 === 0) KB.audio.sfx('fire');
        return;
      }
      if (d.mode === 'dash') {
        if (d.dive) {
          // 空中版：斜下俯衝，落地爆燃後收招（不會懸停）
          p.vx = p.dir * 2.8; if (p.vy < 5.4) p.vy += 0.34;
          if (b && !b.dead) beat(b);
          if (d.t % 2 === 1) KB.fx('fx_fire', p.cx - p.dir * 6, p.y + rnd(2, 14), { vx: -p.dir * 0.8, vy: -1.2, life: 12, flip: p.dir > 0, fps: 12 });
          KB.particles(p.cx + rnd(-8, 8), p.cy + rnd(-4, 10), ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.8, grav: -0.05, life: 14, up: 0.4, size: 1 });
          if (d.t % 14 === 0) KB.audio.sfx('fire');
          if (p.onGround && d.t > 2) {
            p.attackTimer = Math.min(p.attackTimer, 6); KB.game.shake = 4;
            KB.hitbox({ x: p.cx - 24, y: p.bottom - 14, w: 48, h: 16, dmg: 3, owner: 'player', type: 'fire', life: 8, rehit: 0, pierce: true, melee: true, knock: 2.4 });
            vx('burst', p.cx, p.bottom - 2, { n: 18, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3, life: 24, grav: 0.1, size: 2 });
            for (const sgn of [-1, 1]) vx('shockwave', p.cx + sgn * 6, p.bottom, { dir: sgn, speed: 3.2, frames: 18, w: 12, h: 13, color: '#ffb040' });
            vx('ring', p.cx, p.bottom - 4, { r0: 4, r1: 34, frames: 14, color: '#ffe040', width: 2 });
          }
          return;
        }
        p.vx = p.dir * 3.4;
        if (b && !b.dead) beat(b);
        if (d.t % 2 === 1) KB.fx('fx_fire', p.cx - p.dir * 8, p.cy + 4, { vx: -p.dir * 1.2, vy: rnd(-0.4, 0.2), life: 12, flip: p.dir > 0, fps: 12 });
        KB.particles(p.cx + rnd(-9, 9), p.cy + rnd(-8, 8), ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.8, grav: -0.04, life: 14, up: 0.2, vx: -p.dir * 1.2, size: 1 });
        if (d.t % 14 === 0) KB.audio.sfx('fire');
        if (p.hitWall) {
          p.attackTimer = Math.min(p.attackTimer, 4); KB.game.shake = 3;
          vx('burst', p.cx + p.dir * 8, p.cy, { n: 18, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3, life: 24, grav: 0.06, size: 2 });
          vx('ring', p.cx + p.dir * 8, p.cy, { r0: 2, r1: 30, frames: 14, color: '#ff8030', width: 2 });
        }
        return;
      }
      if (d.mode === 'spin') {
        slowFall(p, 0.9);
        if (b && !b.dead) beat(b);
        const a = d.t * 0.5;
        KB.particles(p.cx + Math.cos(a) * 13, p.cy + Math.sin(a) * 12, ['#ffe040', '#ff9020'], 1, { spread: 0.3, grav: -0.03, life: 10, up: 0, size: 1 });
        if (d.t % 6 === 1) KB.fx('fx_fire', p.cx + Math.cos(a) * 13, p.cy + Math.sin(a) * 12, { life: 8, flip: Math.cos(a) < 0, fps: 14 });
        if (d.t % 15 === 0) KB.audio.sfx('fire');
        return;
      }
      const on = holding(p, held);
      slowFall(p, 0.5);
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; return; }
      fitBox(b, { w: Math.min(40, 12 + d.t * 5), ox: 6 }); beat(b);
      // 特效：噴口火星爆散（每 6 幀）
      if (d.t === 1) vx('burst', p.cx + p.dir * 12, p.cy + 4, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 1.8, life: 18, grav: -0.04, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 0.7 });
      else if (d.t % 6 === 0) vx('burst', p.cx + p.dir * (10 + b.w * 0.7), p.cy + 5, { n: 6, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 1.4, life: 16, grav: -0.05, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 1 });
      // 火焰段連續飛出（fx_fire 3 幀），加上向上飄的火星粒子
      if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 2.4, vy: rnd(-0.3, 0.1), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 10 + b.w * 0.8), p.cy + rnd(-4, 6), ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.5, grav: -0.05, life: 12, up: 0.2, vx: p.dir * 1.4, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('fire');
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.dive = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 2. 劍 SWORD
  //    X      揮砍    ：18 幀，先舉過頭再劈向前方（24×26，dmg 3），可邊走邊揮、連打連段
  //    滿血 X 劍氣    ：HP 全滿時揮砍第 6 幀射出短程劍氣（proj_swordwave，飛 80px）
  //    空中 X 迴旋斬  ：全身旋轉判定 30 幀（旋轉 2 圈）、緩降
  //    ↑+X    上挑斬  ：判定往上 28px 並小跳
  //    ↓+X    掃堂斬  ：壓低重心貼地橫掃 30px（Round 9 新增；空中版 = 向下斜斬並加速下墜）
  // ======================================================================
  def('sword', {
    color: '#40c040', duration: 18, lockMove: false, moveSpeed: P.walk, fps: 10,
    desc: '揮舞勇者之劍，斬擊乾淨俐落；體力全滿時劍尖會射出劍氣。',
    moves: [['X', '揮砍'], ['↑+X', '上挑斬'], ['↓+X', '掃堂斬'], ['空中 X', '迴旋斬'], ['滿血 X', '劍氣']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'low'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, 'spin', 'up', 'swing', 'low');
      if (d.mode === 'spin') {
        setup(p, { anim: 'kirby_attack_sword_spin', dur: 30, fps: 14, lock: false });
        d.box = KB.hitbox({ x: 0, y: 0, w: 32, h: 26, dmg: 2, owner: 'player', type: 'sword', follow: p, ox: -16, oy: -13, life: 3, rehit: 9, knock: 1.2, flipWithOwner: false });
        if (p.vy > -0.5) p.vy = -0.5;
        // 特效：迴旋斬 → 綠色殘影 + 環形劍光
        vx('afterimage', p, { frames: 32, color: '#d0ffd0', every: 2, alpha: 0.55 });
        vx('aura', p, { color: '#40c040', r: 26, frames: 30, pulse: 0.4 });
        vx('ring', p.cx, p.cy, { r0: 8, r1: 46, frames: 14, color: '#d0ffd0', width: 2 });
      } else if (d.mode === 'low') {
        // ↓+X 掃堂斬：貼地橫掃 + 前滑；空中版改成向下斜斬（判定框移到身體下方並加速下墜）
        const air = !p.onGround;
        setup(p, { anim: 'kirby_attack_sword_down', dur: 20, fps: 12, lock: true });
        if (air) {
          d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 28, dmg: 4, owner: 'player', type: 'sword', follow: p, ox: -13, oy: 6, life: 16, rehit: 0, knock: 2.2, flipWithOwner: false });
          p.vx = p.dir * 1.2; if (p.vy < 2.6) p.vy = 2.6;
          vx('slash', p.cx, p.cy + 12, 28, Math.PI / 2, { color: '#d0ffd0', width: 4, frames: 11, arc: Math.PI * 0.9 });
        } else {
          d.box = KB.hitbox({ x: 0, y: 0, w: 30, h: 14, dmg: 4, owner: 'player', type: 'sword', follow: p, ox: -4, oy: 6, life: 16, rehit: 0, knock: 2.4 });
          p.vx = p.dir * 2.4;
          vx('slash', p.cx + p.dir * 8, p.bottom - 5, 27, p.dir > 0 ? 0 : Math.PI, { color: '#d0ffd0', width: 4, frames: 11, arc: Math.PI * 0.55, flip: p.dir < 0 });
          vx('shockwave', p.cx + p.dir * 8, p.bottom, { dir: p.dir, speed: 3, frames: 16, w: 11, h: 12, color: '#d0ffd0' });
        }
        vx('afterimage', p, { frames: 20, color: '#d0ffd0', every: 2, alpha: 0.45 });
        vx('burst', p.cx + p.dir * 10, p.bottom - 3, { n: 8, colors: ['#ffffff', '#d0ffd0'], speed: 1.8, life: 16, grav: 0.1, size: 1 });
      } else if (d.mode === 'up') {
        setup(p, { anim: 'kirby_attack_sword_up', dur: 22, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 30, dmg: 3, owner: 'player', type: 'sword', follow: p, ox: -11, oy: -28, life: 18, rehit: 0, knock: 2.2, flipWithOwner: false });
        if (p.onGround) { p.vy = -2.8; p.onGround = false; }
        // 特效：上挑斬 → 由下往上的弧
        vx('slash', p.cx + p.dir * 4, p.cy - 12, 30, -Math.PI / 2, { color: '#d0ffd0', width: 4, frames: 12, arc: Math.PI * 0.9, flip: p.dir < 0 });
        vx('line', p.cx + p.dir * 4, p.cy - 4, p.cx + p.dir * 8, p.cy - 48, { color: '#ffffff', width: 2, frames: 10 });
      } else {
        setup(p, { anim: null, dur: 18, fps: 10, lock: false });
        d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 16, dmg: 3, owner: 'player', type: 'sword', follow: p, ox: -8, oy: -18, life: 16, rehit: 0, knock: 1.5 });
      }
      KB.audio.sfx('sword');
    },
    update(p) {
      const d = data(p), t = p.stateT, b = d.box;
      if (d.mode === 'spin') {
        slowFall(p, 0.8);
        if (b && !b.dead) beat(b);
        const a = t * 0.42;   // 30 幀約轉 2 圈
        KB.particles(p.cx + Math.cos(a) * 15, p.cy + Math.sin(a) * 14, ['#ffffff', '#d0ffd0'], 1, { spread: 0.2, grav: 0, life: 8, up: 0, size: 1 });
        // 特效：每半圈補一道大弧劍光
        if (t === 2 || t === 9 || t === 16 || t === 23) vx('slash', p.cx, p.cy, 30, a, { color: '#d0ffd0', width: 4, frames: 10, arc: Math.PI * 1.3 });
        if (t === 15) KB.audio.sfx('sword');
        return;
      }
      if (d.mode === 'low') {
        // 地面：邊掃邊往前滑（摩擦力遞減）；空中：判定框跟著卡比一起落下
        if (p.onGround) { p.vx = p.dir * Math.max(0.6, 2.4 - t * 0.14); if (t % 3 === 0) p.footDust && p.footDust(1, -p.dir); }
        else if (p.vy < 1.2) p.vy = 1.2;
        if (b && !b.dead && t > 15) { b.dead = true; d.box = null; }
        if (t >= 1 && t <= 12) KB.particles(p.cx + p.dir * rnd(6, 24), p.bottom - rnd(1, 8), ['#ffffff', '#d0ffd0'], 1, { spread: 0.3, grav: 0.04, life: 9, up: 0.2, size: 1 });
        if (t === 3) KB.audio.sfx('sword');
        return;
      }
      if (d.mode === 'up') {
        if (b && !b.dead && t > 14) { b.dead = true; d.box = null; }
        if (t >= 2 && t <= 12) {
          const a = Math.PI * 0.15 + (t - 2) / 10 * Math.PI * 0.75;
          KB.particles(p.cx + p.dir * Math.cos(a) * 15, p.cy - 6 - Math.sin(a) * 15, ['#ffffff', '#d0ffd0'], 1, { spread: 0.2, grav: 0, life: 8, up: 0, size: 1 });
        }
        return;
      }
      if (b && !b.dead) {
        if (t <= 4) fitBox(b, { ox: -8, oy: -18, w: 22, h: 16 });   // 舉劍過頭（可打到頭上的敵人）
        else fitBox(b, { ox: 4, oy: -8, w: 24, h: 26 });              // 劈向前方
      }
      // 特效：揮下瞬間的大斬擊弧（由上往前掃）
      if (t === 5) vx('slash', p.cx + p.dir * 5, p.cy - 6, 32, p.dir > 0 ? -0.8 : Math.PI + 0.8, { color: '#d0ffd0', width: 4, frames: 11, arc: Math.PI * 1.05, flip: p.dir < 0 });
      // 滿血劍氣：體力全滿時揮到底射出短程斬擊波
      if (t === 6 && p.hp >= p.maxHp && !d.wave) {
        d.wave = true;
        KB.shoot({ spr: 'proj_swordwave', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * 4, vy: 0, dmg: 2, owner: 'player', life: 22, w: 12, h: 16,
          grav: 0, solid: true, pierce: false, type: 'sword', dir: p.dir, fxHit: 'fx_hit', trail: '#d0ffd0', knock: 1.5, fps: 12 });
        KB.audio.sfx('cutter');
        // 特效：劍氣 → 一道向前射出的白綠光線 + 出鞘環
        vx('line', p.cx + p.dir * 12, p.cy - 2, p.cx + p.dir * 92, p.cy - 2, { color: '#d0ffd0', width: 3, frames: 12 });
        vx('line', p.cx + p.dir * 12, p.cy - 2, p.cx + p.dir * 70, p.cy - 8, { color: '#ffffff', width: 1, frames: 10 });
        vx('ring', p.cx + p.dir * 12, p.cy - 2, { r0: 2, r1: 18, frames: 10, color: '#ffffff', width: 1 });
      }
      // 劍光弧線（白色粒子沿弧線掃過）
      if (t >= 2 && t <= 12) {
        const a = Math.PI * 0.8 - (t - 2) / 10 * Math.PI * 0.95;
        KB.particles(p.cx + p.dir * Math.cos(a) * 17, p.cy - 1 - Math.sin(a) * 17, ['#ffffff', '#d0ffd0'], 1, { spread: 0.15, grav: 0, life: 7, up: 0, size: 1 });
      }
      if (t >= 9 && KB.input.pressed('attack')) restartAttack(p);   // 連段
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.wave = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 3. 光束 BEAM：手甩出 6 顆 fx_beam_seg 組成的弧形光鞭，從頭頂上方掃到前方（16 幀）
  //    判定框每幀包住外側 4 段，dmg 2，命中一次（rehit 0）
  // ======================================================================
  class BeamWhip extends KB.Entity {
    constructor(p) {
      super(p.x, p.y);
      this.type = 'fx'; this.solid = false; this.grav = 0; this.z = 6; this.w = 1; this.h = 1; this.name = 'beamwhip';
      this.p = p; this.age = 0; this.dur = 16; this.n = 6; this.segs = [];
      // Round 10：光鞭屬「遠程」（判定框每幀依 segs 重算絕對座標），維持原大小 → melee:false
      this.box = KB.hitbox({ x: p.x, y: p.y, w: 12, h: 12, dmg: 2, owner: 'player', type: 'beam', life: 3, rehit: 0, pierce: true, melee: false, dir: p.dir });
      this.update(0);
    }
    update(dt) {
      this.baseUpdate(dt); const p = this.p;
      if (this.age > this.dur || p.state !== 'attack' || p.ability !== 'beam' || p.dead) { this.dead = true; if (this.box) this.box.dead = true; return; }
      this.age++;
      const hx = p.cx + p.dir * 5, hy = p.y + 6;   // 手的位置
      const segs = [];
      for (let i = 1; i <= this.n; i++) {
        const f = Math.max(0, Math.min(1, (this.age - i * 1.1) / (this.dur - 5)));   // 越外側的段越晚跟上 → 鞭子弧形
        const a = Math.PI * 0.55 - f * Math.PI * 0.62;                                 // 99° → -12°
        const r = i * 7;
        segs.push({ x: hx + Math.cos(a) * r * p.dir, y: hy - Math.sin(a) * r });
      }
      this.segs = segs;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 2; i < segs.length; i++) { const s = segs[i]; x0 = Math.min(x0, s.x - 5); y0 = Math.min(y0, s.y - 5); x1 = Math.max(x1, s.x + 5); y1 = Math.max(y1, s.y + 5); }
      const b = this.box; b.x = x0; b.y = y0; b.w = x1 - x0; b.h = y1 - y0; b.dir = p.dir; beat(b);
      const tip = segs[segs.length - 1]; this.x = tip.x; this.y = tip.y;
      if (this.age % 2 === 0) KB.particles(tip.x, tip.y, ['#ffe040', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 8, up: 0, size: 1 });
    }
    draw(g) { for (const s of this.segs) g.spr('fx_beam_seg', s.x, s.y + 3, { t: this.t }); }
  }
  KB.BeamWhip = BeamWhip;

  // 牽星光環命中：直接把敵人吞下並取得牠的能力（需 e.ability 且可吸入）。
  //   Round 9：抓不到的目標（沒能力 / 不可吸入 / 魔王）改成直接打傷，不再完全沒作用。
  function captureHit(p, e) {
    if (!e || e.dead) return false;
    if (e.type === 'enemy' && e.inhalable && e.ability && KB.ABILITIES[e.ability]) {
      KB.fx('fx_sparkle', e.cx, e.cy);
      KB.particles(e.cx, e.cy, ['#ffe040', '#ffffff'], 8, { spread: 2, grav: 0, life: 16, up: 0 });
      e.onInhaled(p);              // 設定 p.mouth（含分數 / cappy 特例）
      if (p.mouth) p.swallow();    // 立即吞下 → giveAbility
      return true;
    }
    if (e.type !== 'enemy' && e.type !== 'boss') return false;
    // 光環本體 dmg 0 —— game.js 仍會呼叫 b.hurt(0) 並種下 6 幀無敵，
    // 所以這裡要先清掉才打得進去（否則抓不住的敵人會完全沒反應）。
    e.invuln = 0;
    try { e.hurt(3, { cx: p.cx, cy: p.cy, knock: 1.6, type: 'beam' }); } catch (err) { }
    KB.fx('fx_hit', e.cx, e.cy);
    vx('burst', e.cx, e.cy, { n: 8, colors: ['#ffe040', '#ffffff'], speed: 2, life: 14, grav: 0 });
    return false;
  }

  def('beam', {
    color: '#f0e040', duration: 20, hold: true, lockMove: true, canJump: false, fps: 10,
    desc: '揮出星光構成的光鞭；蓄滿力可放出貫穿一切的星潮光束。',
    moves: [['X', '甩光束'], ['↑+X', '天頂光柱'], ['↓+X', '牽星光環'], ['空中 X', '光星墜'], ['按住 45 幀放開', '星潮光束']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'capture'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, 'starfall', 'upbeam', 'whip', 'capture'); d.charged = false;
      if (d.mode === 'wave') {
        setup(p, { anim: 'kirby_attack_beam_charge', dur: 24, fps: 8, lock: true });
        KB.shoot({ spr: 'proj_beamwave', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * 2.6, vy: 0, dmg: 4, owner: 'player', life: 110, w: 18, h: 18,
          grav: 0, solid: false, pierce: true, type: 'beam', dir: p.dir, fxHit: 'fx_sparkle', trail: '#ffe040', knock: 2, fps: 10, breakBlocks: true });
        KB.game.shake = 3; KB.audio.sfx('beam');
        // 特效：星潮光束 → 巨大光柱 + 沿途分支電光 + 後座爆散
        vx('beam', p.cx + p.dir * 10, p.cy - 2, p.dir, 110, { width: 20, color: '#ffe040', frames: 20, taper: 0.55 });
        vx('lightning', p.cx + p.dir * 14, p.cy - 2, p.cx + p.dir * 104, p.cy - 2, { color: '#fff0a0', frames: 16, jitter: 7, branches: 3 });
        vx('ring', p.cx + p.dir * 8, p.cy - 2, { r0: 4, r1: 40, frames: 16, color: '#ffffff', width: 2 });
        vx('burst', p.cx + p.dir * 8, p.cy - 2, { n: 16, colors: ['#ffe040', '#ffffff'], speed: 2.6, life: 24, grav: 0, size: 2 });
        vx('flash', '#fff8c0', 6, 0.4);
        vx('zoom', 1.1, 10);
      } else if (d.mode === 'upbeam') {
        // ↑+X 天頂光柱：雙手上舉射出貫穿光柱（判定框跟著卡比，空中緩降）
        setup(p, { anim: 'kirby_attack_beam_up', dur: 22, fps: 12, lock: true, maxHold: 0 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 18, h: 38, dmg: 3, owner: 'player', type: 'beam', follow: p, ox: -9, oy: -36, life: 18, rehit: 0, pierce: true, knock: 1.6, flipWithOwner: false, breakBlocks: true });
        KB.audio.sfx('beam');
        vx('line', p.cx, p.y + 4, p.cx, p.y - 40, { color: '#ffe040', width: 5, frames: 16 });
        vx('line', p.cx - 2, p.y + 4, p.cx - 2, p.y - 34, { color: '#ffffff', width: 1, frames: 14 });
        vx('lightning', p.cx, p.y + 2, p.cx, p.y - 38, { color: '#fff0a0', frames: 14, jitter: 5, branches: 2 });
        vx('ring', p.cx, p.y - 4, { r0: 3, r1: 26, frames: 14, color: '#ffffff', width: 2 });
        vx('shake', 3);
      } else if (d.mode === 'starfall') {
        // 空中 X 光星墜：腳下張開旋轉星環往下壓（緩降 26 幀，不會懸停）
        setup(p, { anim: 'kirby_attack_beam_star', dur: 26, fps: 12, lock: false, maxHold: 0 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 32, h: 26, dmg: 3, owner: 'player', type: 'beam', follow: p, ox: -16, oy: 6, life: 3, rehit: 8, knock: 1.4, flipWithOwner: false });
        KB.audio.sfx('beam');
        vx('circle', p.cx, p.y + 18, { r: 22, frames: 26, color: '#ffe040', spin: 0.2, glyphs: 8 });
        vx('ring', p.cx, p.y + 18, { r0: 4, r1: 30, frames: 16, color: '#ffffff', width: 2 });
      } else if (d.mode === 'capture') {
        // 空中版：光環改成包住全身（判定框跟著卡比），地面版維持往前抓
        const air = !p.onGround;
        setup(p, { anim: 'kirby_attack_beam_capture', dur: 20, fps: 10, lock: true });
        vx('circle', p.cx + (air ? 0 : p.dir * 14), p.cy + (air ? 6 : 0), { r: air ? 26 : 22, frames: 22, color: '#ffe040', spin: 0.14, glyphs: 8 });
        d.box = air
          ? KB.hitbox({ x: 0, y: 0, w: 30, h: 30, dmg: 0, owner: 'player', type: 'beam', follow: p, ox: -15, oy: 0, life: 14, rehit: 0, pierce: true, flipWithOwner: false, breakBlocks: false, onHit: b => captureHit(p, b) })
          : KB.hitbox({ x: 0, y: 0, w: 22, h: 18, dmg: 0, owner: 'player', type: 'beam', follow: p, ox: 4, oy: -2, life: 12, rehit: 0, pierce: true, breakBlocks: false, onHit: b => captureHit(p, b) });
        KB.audio.sfx('beam');
      } else {
        setup(p, { anim: null, dur: 20, fps: 10, lock: true, maxHold: 200 });
        d.whip = KB.spawn(new BeamWhip(p)); d.box = d.whip.box;
        KB.audio.sfx('beam');
        vx('slash', p.cx + p.dir * 5, p.y + 6, 30, p.dir > 0 ? -1.0 : Math.PI + 1.0, { color: '#ffe040', width: 2, frames: 14, arc: Math.PI * 0.62, flip: p.dir < 0 });
      }
    },
    update(p, dt, held) {
      const d = data(p), t = p.stateT;
      if (d.mode === 'upbeam') {
        slowFall(p, 0.7); p.vx *= 0.85; light(80);
        if (d.box && !d.box.dead) beat(d.box);
        if (t % 3 === 1) KB.particles(p.cx + rnd(-6, 6), p.y - rnd(0, 36), ['#ffe040', '#ffffff'], 1, { spread: 0.3, grav: -0.05, life: 12, up: 1.0, size: 1 });
        if (t === 8 || t === 15) vx('ring', p.cx, p.y - 20, { r0: 2, r1: 18, frames: 10, color: '#ffe040', width: 1 });
        return;
      }
      if (d.mode === 'starfall') {
        slowFall(p, 1.0); light(72);
        if (d.box && !d.box.dead) beat(d.box);
        const a = t * 0.34;
        KB.particles(p.cx + Math.cos(a) * 14, p.y + 16 + Math.sin(a) * 8, ['#ffe040', '#ffffff'], 1, { spread: 0.3, grav: 0, life: 10, up: 0, size: 1 });
        if (t % 8 === 3) vx('ring', p.cx, p.y + 18, { r0: 3, r1: 22, frames: 10, color: '#ffe040', width: 1 });
        if (t % 12 === 0) KB.audio.sfx('beam');
        return;
      }
      if (d.mode === 'capture') {
        if (!p.onGround) slowFall(p, 0.9);
        if (t >= 3 && t <= 12) KB.particles(p.cx + p.dir * rnd(8, 24), p.cy + rnd(-8, 8), ['#ffe040', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 8, up: 0, size: 1 });
        return;
      }
      if (d.mode === 'wave') {
        if (t < 10) KB.particles(p.cx + p.dir * 12, p.cy - 2, ['#ffe040', '#ffffff'], 1, { spread: 1.2, grav: 0, life: 10, up: 0, size: 1 });
        return;
      }
      // 光鞭：16 幀後若仍按住 → 進入蓄力；**從按下那一幀算起滿 45 幀**放開就放出星潮光束
      // （fix5b / R5-P1-03：原本寫 t >= 45，實測門檻 46 幀 —— d.t 在招式開始的下一幀才 ++）
      if (t >= 16) {
        if (d.whip) { d.whip.dead = true; d.whip = null; d.box = null; }
        if (held) {
          if (t >= HOLD('beam', BEAM_WAVE) - 1) {
            if (!d.charged) chargeFx(p, '#ffe040');
            d.charged = true;
            if (t % 3 === 0) KB.particles(p.cx + p.dir * 10, p.cy - 2, ['#ffffff', '#ffe040'], 2, { spread: 1.6, grav: 0, life: 12, up: 0, size: 1 });
          } else {
            if (t % 8 === 0) sfx('charge');
            if (t % 4 === 0) KB.particles(p.cx + p.dir * 10, p.cy - 2, '#ffe040', 1, { spread: 0.8, grav: 0, life: 10, up: 0, size: 1 });
          }
          const D = p.abilityDef; D.anim = 'kirby_attack_beam_charge'; p.attackFps = 8;
        } else if (d.charged) { startMove(p, 'wave'); return; }
      }
      if (t >= 15 && !held && !d.charged && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 4. 刀刃 CUTTER：丟出 proj_cutter，飛 46px 後迴旋回到卡比手上消失（空中也可接住）；穿透多個敵人 dmg 3
  //    回程時清除 hitSet → 同一敵人去回各可命中一次；撞牆立刻折返；同時最多 2 片
  // ======================================================================
  class CutterBlade extends KB.Projectile {
    constructor(p) {
      super({ spr: 'proj_cutter', x: p.cx + p.dir * 8, y: p.cy - 1, vx: p.dir * 3.6, dmg: 3, owner: 'player', life: 160, w: 12, h: 12,
        pierce: true, solid: false, rotSpeed: 0.45 * p.dir, type: 'cutter', dir: p.dir, destructible: false, knock: 1.2, fps: 12 });
      this.thrower = p; this.phase = 'out'; this.range = 46; this.startX = this.cx; this.name = 'cutter';
      this.grav = 0; this.hurtsPlayer = false; this.inhalable = false;
      vx('sparkTrail', this, { color: ['#ffffff', '#e0e0e0'], every: 2, life: 12, frames: 140 });   // 特效：白色刃光拖尾
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.vanish(); return; }
      this.rot += this.rotSpeed;
      const p = this.thrower, map = KB.game.map;
      if (this.phase === 'out') {
        const edge = this.dir > 0 ? this.x + this.w + this.vx : this.x + this.vx;
        if (map.isSolidPx(edge, this.cy)) { this.phase = 'back'; this.vx = -this.dir * 2; this.hitSet.clear(); }   // 撞牆彈回
        else if (Math.abs(this.cx - this.startX) >= this.range) this.phase = 'turn';
      }
      if (this.phase === 'turn') {   // 減速 → 反向（迴旋鏢感）
        this.vx -= this.dir * 0.3;
        if (Math.sign(this.vx) === -this.dir && Math.abs(this.vx) >= 1.5) { this.phase = 'back'; this.hitSet.clear(); }
      }
      if (this.phase === 'back') {   // 追蹤卡比的手
        const dx = p.cx - this.cx, dy = (p.cy - 1) - this.cy;
        this.vx += Math.sign(dx) * 0.28; this.vx = Math.max(-4.2, Math.min(4.2, this.vx));
        this.vy += Math.sign(dy) * 0.22; this.vy = Math.max(-3, Math.min(3, this.vy));
        if (Math.abs(dy) < 3) this.vy *= 0.7;
        if (Math.abs(dx) < 12) this.vx *= 0.85;
        if (Math.abs(dx) < 9 && Math.abs(dy) < 12) {   // 接住
          this.dead = true; KB.particles(this.cx, this.cy, '#ffffff', 3, { spread: 1, grav: 0, life: 8, up: 0 }); return;
        }
        if (Math.abs(dx) > 260 || Math.abs(dy) > 200 || p.state === 'dead') { this.vanish(); return; }
      }
      this.x += this.vx; this.y += this.vy;
      if (this.y > map.ph + 48) this.dead = true;
      if (Math.floor(this.t * 60) % 3 === 0) KB.particles(this.cx, this.cy, '#ffffff', 1, { spread: 0.3, grav: 0, life: 8, up: 0, size: 1 });
    }
    vanish() { this.dead = true; KB.fx('fx_poof', this.cx, this.cy + 6); }
  }
  KB.CutterBlade = CutterBlade;

  // 上拋刃：垂直丟出 42px 後落回卡比手上；上升與下降各可命中一次
  class UpBlade extends CutterBlade {
    constructor(p) {
      super(p);
      this.vx = p.dir * 0.5; this.vy = -4.4; this.phase = 'rise'; this.startY = this.cy; this.range = 42;
      this.rotSpeed = 0.5 * p.dir; this.name = 'cutter_up';
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.vanish(); return; }
      this.rot += this.rotSpeed;
      const p = this.thrower, map = KB.game.map;
      if (this.phase === 'rise') {
        this.vy += 0.16;
        if (map.isSolidPx(this.cx, this.y + this.vy) || (this.startY - this.cy) >= this.range || this.vy >= 0) {
          this.phase = 'back'; this.hitSet.clear();
        }
      }
      if (this.phase === 'back') {   // 落回卡比手上
        const dx = p.cx - this.cx, dy = (p.cy - 1) - this.cy;
        this.vx += Math.sign(dx) * 0.22; this.vx = Math.max(-3.2, Math.min(3.2, this.vx));
        this.vy += Math.sign(dy) * 0.26; this.vy = Math.max(-3, Math.min(3.6, this.vy));
        if (Math.abs(dx) < 9 && Math.abs(dy) < 12) { this.dead = true; KB.particles(this.cx, this.cy, '#ffffff', 3, { spread: 1, grav: 0, life: 8, up: 0 }); return; }
        if (Math.abs(dx) > 260 || Math.abs(dy) > 200 || p.state === 'dead') { this.vanish(); return; }
      }
      this.x += this.vx; this.y += this.vy;
      if (this.y > map.ph + 48) this.dead = true;
      if (Math.floor(this.t * 60) % 3 === 0) KB.particles(this.cx, this.cy, '#ffffff', 1, { spread: 0.3, grav: 0, life: 8, up: 0, size: 1 });
    }
  }
  KB.UpBlade = UpBlade;

  def('cutter', {
    color: '#e0e0e0', duration: 14, lockMove: false, moveSpeed: P.walk, fps: 10,
    desc: '把頭上的鋼刃當迴力鏢丟出去，記得接住它。',
    moves: [['X', '迴旋刃'], ['↑+X', '上拋刃'], ['↓+X', '下劈'], ['空中 X', '錐旋刃']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).blades = []; },
    onCrouchAttack(p) { startMove(p, 'chop'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.blades = (d.blades || []).filter(b => !b.dead);
      d.mode = pickMode(p, 'drill', 'upthrow', 'throw', 'chop');
      if (d.mode === 'drill') {
        // 空中 X 錐旋刃：抱著鋼刃頭下旋轉俯衝，落地彈起碎光（Round 9 新增）
        setup(p, { anim: 'kirby_attack_cutter_drill', dur: 30, fps: 14, lock: true });
        d.landed = false;
        p.vx = p.dir * 0.9; if (p.vy < 2.6) p.vy = 2.6;
        d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 26, dmg: 3, owner: 'player', type: 'cutter', follow: p, ox: -10, oy: 0, life: 3, rehit: 7, knock: 1.8, flipWithOwner: false });
        KB.audio.sfx('cutter');
        vx('afterimage', p, { frames: 30, color: '#ffffff', every: 2, alpha: 0.5 });
        vx('sparkTrail', p, { color: ['#ffffff', '#e0e0e0'], every: 2, life: 12, frames: 30 });
        vx('ring', p.cx, p.cy, { r0: 4, r1: 24, frames: 12, color: '#ffffff', width: 2 });
        return;
      }
      if (d.mode === 'chop') {
        // 空中版：判定框往下移，整套動作跟著卡比落下
        const air = !p.onGround;
        setup(p, { anim: 'kirby_attack_cutter_chop', dur: 24, fps: 10, lock: false });
        d.hit2 = false; d.air = air;
        d.box = KB.hitbox({ x: 0, y: 0, w: 18, h: 14, dmg: 2, owner: 'player', type: 'cutter', follow: p, ox: 2, oy: air ? -6 : -16, life: 7, rehit: 0, knock: 1.2 });
        KB.audio.sfx('cutter');
        // 特效：下劈上段的白色刃弧
        vx('slash', p.cx + p.dir * 6, p.cy - 10, 17, p.dir > 0 ? -1.4 : Math.PI + 1.4, { color: '#ffffff', width: 2, frames: 9, arc: Math.PI * 0.7, flip: p.dir < 0 });
        return;
      }
      if (d.blades.length >= 2) { setup(p, { anim: null, dur: 14, fps: 10, lock: false }); return; }   // 最多兩片在外，仍播放動作
      if (d.mode === 'upthrow') {
        setup(p, { anim: 'kirby_attack_cutter_up', dur: 18, fps: 12, lock: false });
        d.blades.push(KB.spawn(new UpBlade(p)));
      } else {
        setup(p, { anim: null, dur: 14, fps: 10, lock: false });
        d.blades.push(KB.spawn(new CutterBlade(p)));
      }
      KB.audio.sfx('cutter');
    },
    update(p) {
      const d = data(p), t = p.stateT;
      if (d.mode === 'drill') {
        if (!p.onGround) {
          if (p.vy < 5.6) p.vy += 0.3;
          p.vx = p.dir * 0.9;
          if (d.box && !d.box.dead) beat(d.box);
          if (t % 2 === 0) KB.particles(p.cx + rnd(-9, 9), p.cy + rnd(-8, 8), ['#ffffff', '#e0e0e0'], 1, { spread: 0.4, grav: 0, life: 9, up: 0, size: 1 });
          if (t % 10 === 5) KB.audio.sfx('cutter');
        } else if (!d.landed) {
          d.landed = true; killBox(p);
          KB.hitbox({ x: p.cx - 26, y: p.bottom - 14, w: 52, h: 16, dmg: 3, owner: 'player', type: 'cutter', life: 8, rehit: 0, pierce: true, melee: true, knock: 2.4 });
          KB.game.shake = 4; KB.audio.sfx('cutter');
          vx('burst', p.cx, p.bottom - 2, { n: 16, colors: ['#ffffff', '#e0e0e0', '#c8c8d0'], speed: 2.8, life: 20, grav: 0.14, size: 2 });
          for (const sgn of [-1, 1]) vx('shockwave', p.cx + sgn * 6, p.bottom, { dir: sgn, speed: 3.2, frames: 16, w: 12, h: 13, color: '#ffffff' });
          vx('ring', p.cx, p.bottom - 4, { r0: 4, r1: 32, frames: 14, color: '#ffffff', width: 2 });
          p.attackTimer = Math.min(p.attackTimer, 8);
        }
        return;
      }
      if (d.mode === 'chop') {
        // 兩段判定：先上段撩、第 10 幀起下段劈
        if (t === 10 && !d.hit2) {
          d.hit2 = true; killBox(p);
          d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: d.air ? 28 : 22, dmg: 3, owner: 'player', type: 'cutter', follow: p, ox: 2, oy: d.air ? 4 : -4, life: 10, rehit: 0, knock: 2 });
          KB.audio.sfx('cutter');
          KB.particles(p.cx + p.dir * 12, p.cy + 6, ['#ffffff', '#e0e0e0'], 4, { spread: 1.2, grav: 0.05, life: 12, up: 0.3, size: 1 });
          // 特效：下段劈的大刃弧 + 火花
          vx('slash', p.cx + p.dir * 6, p.cy - 2, 20, p.dir > 0 ? -0.5 : Math.PI + 0.5, { color: '#ffffff', width: 3, frames: 11, arc: Math.PI * 1.0, flip: p.dir < 0 });
          vx('burst', p.cx + p.dir * 14, p.cy + 6, { n: 8, colors: ['#ffffff', '#e0e0e0'], speed: 2, life: 18, grav: 0.12, size: 2 });
        }
        slowFall(p, 1.6);
        return;
      }
      if (t >= 8 && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.air = false; d.landed = false; d.blades = (d.blades || []).filter(b => !b.dead); },
    onLose(p) { killBox(p); clearAnim(p); /* 已丟出的刀刃會自行飛回卡比後消失 */ },
  });

  // ======================================================================
  // 5. 電擊 SPARK：按住時卡比周圍 44×40 電場（rehit 6，dmg 1），不能移動、不能跳；放開即停
  //    ↑+X 雷擊柱：頭頂導出 38px 電柱（Round 9 新增）
  //    ↓+X 落雷  ：電流沿地面向兩側竄（空中版 = 腳下的下擊電柱）（Round 9 新增）
  //    空中 X 電光衝：電球裹身斜下衝，落地放電（Round 9 新增）
  // ======================================================================
  def('spark', {
    color: '#60c0ff', duration: 10, hold: true, maxHold: 150, lockMove: false, moveSpeed: 0.5, canJump: false, fps: 12,
    desc: '全身通電，放電時還能拖著電場慢慢走；蓄滿再放開會炸開巨大電擊波。',
    moves: [['X', '放電（88px 電場）'], ['↑+X', '雷擊柱'], ['↓+X', '落雷'], ['空中 X', '電光衝'], ['按住 45 幀放開', '電擊波（96px）']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'quake'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, 'dive', 'bolt', 'field', 'quake'); d.charged = false; d.landed = false;
      if (d.mode === 'burst') {
        setup(p, { anim: 'kirby_attack_spark_burst', dur: 20, fps: 12, lock: true });
        // Round 10：電擊波本來就是 96×80 的全身巨框（招式表寫「96px」），再放大會蓋掉整個畫面 → melee:false
        d.box = KB.hitbox({ x: 0, y: 0, w: 96, h: 80, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -48, oy: -32, life: 20, rehit: 7, flipWithOwner: false, pierce: true, melee: false });
        KB.game.shake = 5; KB.audio.sfx('spark');
        KB.particles(p.cx, p.cy, ['#ffffff', '#80d0ff', '#c0f0ff'], 24, { spread: 4, grav: 0, life: 20, up: 0 });
        // 特效：隨機 6 道閃電 + 電藍魔法陣 + 一瞬藍染世界
        for (let i = 0; i < 6; i++) {
          const a = rnd(0, Math.PI * 2), r = rnd(34, 52);
          vx('lightning', p.cx, p.cy, p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r * 0.8, { color: '#c0f0ff', frames: 14, jitter: 6, branches: 2 });
        }
        vx('circle', p.cx, p.cy + 6, { r: 44, frames: 26, color: '#80d0ff', spin: 0.16, glyphs: 12 });
        vx('worldTint', '#80d0ff', 0.4, 8);
        vx('flash', '#ffffff', 5, 0.45);
        vx('ring', p.cx, p.cy, { r0: 6, r1: 54, frames: 18, color: '#ffffff', width: 2 });
        vx('zoom', 1.12, 10);
      } else if (d.mode === 'bolt') {
        // ↑+X 雷擊柱：頭頂導出電柱（判定框跟著卡比，空中緩降）
        setup(p, { anim: 'kirby_attack_spark_up', dur: 24, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 38, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -10, oy: -36, life: 3, rehit: 8, knock: 1.6, flipWithOwner: false, pierce: true });
        KB.audio.sfx('spark'); KB.game.shake = 3;
        for (let i = 0; i < 3; i++) vx('lightning', p.cx + rnd(-4, 4), p.y + 4, p.cx + rnd(-8, 8), p.y - rnd(26, 38), { color: '#c0f0ff', frames: 14, jitter: 5, branches: 2 });
        vx('ring', p.cx, p.y - 6, { r0: 3, r1: 24, frames: 14, color: '#ffffff', width: 2 });
        vx('circle', p.cx, p.y - 18, { r: 16, frames: 20, color: '#80d0ff', spin: 0.2, glyphs: 6 });
      } else if (d.mode === 'quake') {
        // ↓+X 落雷：地面版沿地面向兩側竄；空中版改成腳下的下擊電柱
        const air = !p.onGround;
        setup(p, { anim: 'kirby_attack_spark_down', dur: 26, fps: 12, lock: true });
        d.air = air;
        d.box = air
          ? KB.hitbox({ x: 0, y: 0, w: 20, h: 34, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -10, oy: 8, life: 3, rehit: 8, knock: 1.4, flipWithOwner: false, pierce: true })
          : KB.hitbox({ x: 0, y: 0, w: 52, h: 16, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -26, oy: 4, life: 3, rehit: 8, knock: 2, flipWithOwner: false, pierce: true, melee: true });
        KB.audio.sfx('spark'); KB.game.shake = 4;
        if (air) {
          vx('lightning', p.cx, p.y + 10, p.cx + rnd(-6, 6), p.y + 40, { color: '#c0f0ff', frames: 14, jitter: 5, branches: 2 });
          vx('ring', p.cx, p.y + 22, { r0: 3, r1: 22, frames: 14, color: '#80d0ff', width: 2 });
        } else {
          for (const sgn of [-1, 1]) {
            vx('shockwave', p.cx + sgn * 6, p.bottom, { dir: sgn, speed: 3.4, frames: 20, w: 12, h: 13, color: '#c0f0ff' });
            vx('lightning', p.cx, p.bottom - 3, p.cx + sgn * 26, p.bottom - 3, { color: '#c0f0ff', frames: 12, jitter: 4, branches: 1 });
          }
          vx('ring', p.cx, p.bottom - 3, { r0: 4, r1: 34, frames: 16, color: '#ffffff', width: 2 });
        }
      } else if (d.mode === 'dive') {
        // 空中 X 電光衝：電球裹身斜下衝，落地放電
        setup(p, { anim: 'kirby_attack_spark_dive', dur: 34, fps: 14, lock: true });
        p.vx = p.dir * 2.6; if (p.vy < 3.0) p.vy = 3.0;
        d.box = KB.hitbox({ x: 0, y: 0, w: 28, h: 26, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -14, oy: -4, life: 3, rehit: 7, knock: 1.8, flipWithOwner: false });
        KB.audio.sfx('spark');
        vx('afterimage', p, { frames: 34, color: '#80d0ff', every: 2, alpha: 0.5 });
        vx('aura', p, { color: '#80d0ff', r: 16, frames: 34, pulse: 0.4 });
        vx('ring', p.cx, p.cy, { r0: 4, r1: 26, frames: 12, color: '#c0f0ff', width: 2 });
      } else {
        setup(p, { anim: null, dur: 10, fps: 12, lock: false, maxHold: 150 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 44, h: 40, dmg: 1, owner: 'player', type: 'spark', follow: p, ox: -22, oy: -12, life: 3, rehit: 6, flipWithOwner: false });
        KB.audio.sfx('spark');
      }
    },
    update(p, dt, held) {
      const d = data(p), b = d.box;
      d.t++;
      light(96);                    // 放電 / 電擊波：暗房照明半徑 96px
      if (d.mode === 'burst') {
        p.vx *= 0.6;
        if (b && !b.dead) { beat(b); b.life = Math.max(b.life, 2); }
        const r = 16 + d.t * 1.8;
        for (let i = 0; i < 3; i++) {
          const a = rnd(0, Math.PI * 2);
          KB.particles(p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r * 0.8, ['#ffffff', '#80d0ff'], 1, { spread: 0.6, grav: 0, life: 10, up: 0, size: 1 });
        }
        if (d.t % 3 === 0) KB.fx('fx_spark_field', p.cx + rnd(-42, 42), p.cy + rnd(-30, 30) + 6, { life: 5, flip: Math.random() < 0.5, fps: 15 });
        if (d.t % 7 === 0) KB.audio.sfx('spark');
        return;
      }
      if (d.mode === 'bolt') {
        slowFall(p, 0.7); p.vx *= 0.85;
        if (b && !b.dead) beat(b);
        if (d.t % 4 === 1) vx('lightning', p.cx + rnd(-4, 4), p.y + 2, p.cx + rnd(-9, 9), p.y - rnd(20, 36), { color: '#c0f0ff', frames: 8, jitter: 4, branches: 1 });
        if (d.t % 2 === 0) KB.fx('fx_spark_field', p.cx + rnd(-14, 14), p.y - rnd(4, boxUp(b, 34)), { life: 4, flip: Math.random() < 0.5, fps: 15 });
        KB.particles(p.cx + rnd(-14, 14), p.y - rnd(0, boxUp(b, 36)), ['#ffffff', '#80d0ff', '#c0f0ff'], 1, { spread: 0.6, grav: -0.05, life: 10, up: 0.8, size: 1 });
        if (d.t % 10 === 0) KB.audio.sfx('spark');
        return;
      }
      if (d.mode === 'quake') {
        if (d.air) { if (p.vy < 1.4) p.vy = 1.4; } else p.vx *= 0.7;
        if (b && !b.dead) beat(b);
        if (d.t % 3 === 0) {
          const ox = d.air ? rnd(-8, 8) : rnd(-24, 24), oy = d.air ? rnd(10, 38) : rnd(2, 14);
          KB.fx('fx_spark_field', p.cx + ox, p.y + oy, { life: 4, flip: Math.random() < 0.5, fps: 15 });
        }
        if (d.t % 6 === 2) {
          if (d.air) vx('lightning', p.cx, p.y + 10, p.cx + rnd(-8, 8), p.y + rnd(26, 40), { color: '#c0f0ff', frames: 8, jitter: 4, branches: 1 });
          else for (const sgn of [-1, 1]) vx('lightning', p.cx, p.bottom - 3, p.cx + sgn * rnd(14, 26), p.bottom - 3, { color: '#c0f0ff', frames: 8, jitter: 4, branches: 1 });
        }
        KB.particles(p.cx + (d.air ? rnd(-9, 9) : rnd(-26, 26)), p.y + (d.air ? rnd(12, 36) : rnd(4, 15)), ['#ffffff', '#80d0ff'], 1, { spread: 0.8, grav: 0, life: 10, up: 0.2, size: 1 });
        if (d.t % 10 === 0) KB.audio.sfx('spark');
        return;
      }
      if (d.mode === 'dive') {
        if (!p.onGround) {
          p.vx = p.dir * 2.6; if (p.vy < 5.4) p.vy += 0.3;
          if (b && !b.dead) beat(b);
          if (d.t % 2 === 0) KB.fx('fx_spark_field', p.cx + rnd(-12, 12), p.cy + rnd(-10, 10), { life: 4, flip: Math.random() < 0.5, fps: 15 });
          KB.particles(p.cx + rnd(-12, 12), p.cy + rnd(-10, 10), ['#ffffff', '#80d0ff', '#c0f0ff'], 1, { spread: 0.8, grav: 0, life: 9, up: 0, size: 1 });
          if (d.t % 9 === 4) KB.audio.sfx('spark');
        } else if (!d.landed) {
          d.landed = true; killBox(p);
          KB.hitbox({ x: p.cx - 34, y: p.bottom - 16, w: 68, h: 18, dmg: 4, owner: 'player', type: 'spark', life: 8, rehit: 0, pierce: true, melee: true, knock: 2.6 });
          KB.game.shake = 6; KB.audio.sfx('spark');
          for (const sgn of [-1, 1]) vx('shockwave', p.cx + sgn * 6, p.bottom, { dir: sgn, speed: 3.6, frames: 18, w: 13, h: 14, color: '#c0f0ff' });
          vx('ring', p.cx, p.bottom - 4, { r0: 5, r1: 42, frames: 16, color: '#ffffff', width: 2 });
          vx('burst', p.cx, p.bottom - 2, { n: 16, colors: ['#ffffff', '#80d0ff', '#c0f0ff'], speed: 2.8, life: 20, grav: 0.1, size: 2 });
          p.attackTimer = Math.min(p.attackTimer, 10);
        }
        return;
      }
      const on = holding(p, held);
      p.vx *= 0.9;   // 帶電時可以走，但速度受電場拖累（moveSpeed 0.5）
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; if (d.charged) startMove(p, 'burst'); return; }
      beat(b);
      // 特效：電場中不斷跳動的閃電（每 5 幀 2 道）
      if (d.t === 1) vx('circle', p.cx, p.cy + 6, { r: 38, frames: 20, color: '#80d0ff', spin: 0.18, glyphs: 8 });
      if (d.t % 5 === 2) {
        for (let i = 0; i < 2; i++) {
          const a = rnd(0, Math.PI * 2), r = rnd(18, 38);
          vx('lightning', p.cx, p.cy, p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, { color: '#c0f0ff', frames: 7, jitter: 4, branches: 1 });
        }
      }
      // 電場隨機閃爍 + 藍白粒子
      if (d.t % 2 === 0) KB.fx('fx_spark_field', p.cx + rnd(-38, 38), p.cy + rnd(-26, 30) + 8, { life: 4, flip: Math.random() < 0.5, fps: 15 });
      KB.particles(p.cx + rnd(-40, 40), p.cy + rnd(-32, 32), ['#ffffff', '#80d0ff', '#c0f0ff'], 1, { spread: 1.2, grav: 0, life: 8, up: 0, size: 1 });
      if (d.t % 10 === 0) KB.audio.sfx('spark');
      if (p.stateT >= HOLD('spark', SPARK_BURST) - 1) {   // fix5b：實際 = 招式表的 45 幀（原本 >= 45 實測要 46 幀）
        if (!d.charged) chargeFx(p, '#60c0ff');
        d.charged = true;
        if (d.t % 4 === 0) KB.particles(p.cx, p.y - 6, ['#ffffff', '#ffe040'], 2, { spread: 1, grav: 0, life: 12, up: 0.4, size: 1 });
      } else if (p.stateT >= 12 && p.stateT % 8 === 0) sfx('charge');
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; d.air = false; d.landed = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 6. 石頭 STONE：player.js 的 startStone / updateStone 處理（無敵、重落、壓扁敵人、再按攻擊解除）
  //    本檔額外負責：變身時隨機外觀（岩石 / 石像 / 鐵塊）＋ 斜坡自動滾動（加速、dmg 8）
  //    Round 9：變身當幀的方向鍵決定變化型 —— ↑+X 彗星落石（先小跳再以最高速砸下、落地大衝擊）、
  //             ↓+X 地滾衝刺（落地就以滾速 3.6 衝出去，撞擊 dmg 8）。方向鍵沒按就是原本的變石。
  //    掛勾：entity.js 的 Hitbox 在收到 {stone:true, owner:'player'} 時呼叫 onStoneStart，
  //          並每幀呼叫 hitbox.onUpdate（判定框在玩家之後更新，可安全改寫 p.vx）
  // ======================================================================
  const STONE_FORMS = ['kirby_stone_1', 'kirby_stone_2', 'kirby_stone_3'];
  const STONE_DUST = { kirby_stone_1: '#a0a0a8', kirby_stone_2: '#d8c4a0', kirby_stone_3: '#c8c8d0' };

  def('stone', {
    color: '#a0a0a8', stoneLike: true,
    desc: '變成堅硬的石塊，無敵又能壓扁敵人；在斜坡上會越滾越快。',
    moves: [['X', '變石（無敵、下壓）'], ['↑+X', '彗星落石'], ['↓+X', '地滾衝刺'], ['空中 X', '急速落石'], ['斜坡上', '滾石衝撞'], ['再按 X', '解除變身']],
    hatOffset: { stone: [0, 99] },
    onGet(p) { p.stoneT = 0; },
    // ↓+X（蹲下按攻擊）也要能變石 —— player.js 的蹲下分支只會呼叫 onCrouchAttack
    onCrouchAttack(p) { p.startStone(); },
    // 每次變身：隨機外觀 + 重設滾動速度 + 讀方向鍵決定變化型
    onStoneStart(p, box) {
      const d = data(p);
      d.form = STONE_FORMS[(Math.random() * STONE_FORMS.length) | 0];
      if (KB.SPR[d.form]) KB.SPR.kirby_stone = KB.SPR[d.form];
      d.roll = 0; d.pendRoll = 0;
      // 石頭不經過 startAttack（player.js 直接走 startStone），p.atkDir 可能是上一招的舊值 →
      // 這裡以「變身當幀的實際按鍵」為準，兩種讀法結果相同（atkDir 本來就是同一幀的快照）。
      d.variant = down('up') ? 'comet' : down('down') ? 'rolldash' : null;
      if (d.variant === 'comet') {
        if (p.onGround) { p.vy = -3.2; p.onGround = false; }   // 先彈起再以最高速砸下
        vx('ring', p.cx, p.cy, { r0: 4, r1: 26, frames: 12, color: '#ffe040', width: 2 });
        vx('sparkTrail', p, { color: ['#ffe040', '#ffffff', '#a0a0a8'], every: 2, life: 14, frames: 120 });
        vx('textPop', p.cx, p.y - 18, 'COMET!', { color: '#ffe040', frames: 30 });
      } else if (d.variant === 'rolldash') {
        if (p.onGround) d.roll = p.dir * 3.6; else d.pendRoll = p.dir * 3.6;
        vx('afterimage', p, { frames: 40, color: '#c8c8d0', every: 3, alpha: 0.45 });
        vx('ring', p.cx, p.cy, { r0: 4, r1: 24, frames: 12, color: '#c8c8d0', width: 2 });
      }
      KB.particles(p.cx, p.cy, STONE_DUST[d.form] || '#a0a0a8', 8, { spread: 2, life: 20 });
      // 特效：變石瞬間 → 震動 + 碎石噴發 + 白閃 + zoom punch
      // 註：這裡「不」放 hitstop —— 變石的停格會吃掉「再按 X 解除」的按鍵邊緣，
      //     playthrough 機器人會卡在石頭狀態過不了關（實測 hitstop 2 / 4 都會卡）。
      //     石頭的停格感改由落地衝擊（rollUpdate 內的重落地）負責。
      const dust = STONE_DUST[d.form] || '#a0a0a8';
      vx('shake', 6);
      vx('flash', '#ffffff', 4, 0.3);
      vx('burst', p.cx, p.bottom - 4, { n: 18, colors: [dust, '#ffffff', '#807870'], speed: 2.6, life: 26, grav: 0.2, size: 3 });
      vx('ring', p.cx, p.cy, { r0: 4, r1: 30, frames: 14, color: dust, width: 3 });
      vx('zoom', 1.14, 10);
      box.onUpdate = hb => KB.ABILITIES.stone.rollUpdate(p, hb);
    },
    // 斜坡滾動：累積滾速並反推 player.js updateStone 的 vx*0.6 + 斜坡 0.5，讓石頭真的滾起來
    rollUpdate(p, box) {
      if (p.state !== 'stone' || p.dead) return;
      const d = data(p), map = KB.game && KB.game.map;
      if (!map) return;
      const ch = map.get(Math.floor(p.cx / 16), Math.floor(p.bottom / 16));
      const sdir = p.onSlope ? (ch === '/' ? -1 : 1) : 0;
      // 特效：重落地衝擊（左右各一道地面衝擊波 + 塵爆 + 震動；不放 hitstop，見 onStoneStart 註解）
      if (p.onGround && !d.wasGround && (d.fallV || 0) > 4) {
        const dust2 = STONE_DUST[d.form] || '#a0a0a8';
        vx('shake', 6);
        vx('burst', p.cx, p.bottom - 2, { n: 14, colors: [dust2, '#ffffff'], speed: 2.4, life: 22, grav: 0.25, size: 3 });
        for (const s of [-1, 1]) vx('shockwave', p.cx + s * 6, p.bottom, { dir: s, speed: 3, frames: 18, w: 12, h: 13, color: dust2 });
        vx('ring', p.cx, p.bottom - 4, { r0: 4, r1: 34, frames: 14, color: dust2, width: 2 });
      }
      // 彗星落石：離地時直接吃滿下落速度（updateStone 每幀 maxFall = 7）
      if (d.variant === 'comet' && !p.onGround && p.vy > -0.5) p.vy = 7;
      // 落地大衝擊（彗星落石）／落地才開跑（地滾衝刺）
      if (p.onGround && !d.wasGround) {
        if (d.variant === 'comet') {
          const dc = STONE_DUST[d.form] || '#a0a0a8';
          KB.hitbox({ x: p.cx - 34, y: p.bottom - 16, w: 68, h: 18, dmg: 9, owner: 'player', type: 'stone', life: 8, rehit: 0, pierce: true, melee: true, knock: 3.4, breakBlocks: true });
          vx('shake', 9); vx('hitstop', 3); vx('zoom', 1.16, 10);
          vx('burst', p.cx, p.bottom - 2, { n: 20, colors: [dc, '#ffffff', '#ffe040'], speed: 3.4, life: 26, grav: 0.24, size: 3 });
          for (const sgn of [-1, 1]) vx('shockwave', p.cx + sgn * 8, p.bottom, { dir: sgn, speed: 4, frames: 22, w: 14, h: 16, color: dc });
          vx('ring', p.cx, p.bottom - 4, { r0: 6, r1: 52, frames: 18, color: '#ffe040', width: 3 });
          vx('textPop', p.cx, p.bottom - 26, 'CRASH!', { color: '#ffe040', frames: 34 });
          d.variant = null;
        }
        if (d.pendRoll) { d.roll = d.pendRoll; d.pendRoll = 0; }
      }
      d.wasGround = p.onGround; d.fallV = p.vy;
      let r = d.roll || 0;
      if (sdir) r = Math.max(-4.6, Math.min(4.6, r + sdir * 0.34));
      else if (p.onGround) r *= 0.94;
      if (Math.abs(r) < 0.02) r = 0;
      d.roll = r;
      if (r) {
        p.dir = r < 0 ? -1 : 1;
        // updateStone 下一幀會先 vx *= 0.6，斜坡上再 += 0.5*sdir；此處反推目標速度
        p.vx = Math.max(-12, Math.min(12, (r - 0.5 * sdir) / 0.6));
        if (Math.abs(r) > 1.2 && KB.game.frame % 4 === 0)
          KB.particles(p.cx - Math.sign(r) * 6, p.bottom - 1, STONE_DUST[d.form] || '#a0a0a8', 2, { spread: 1, up: 0.6, life: 16, size: 1 });
      }
      box.dmg = Math.abs(r) > 1.2 ? 8 : 6;     // 滾動中撞擊威力更強
      box.knock = Math.abs(r) > 1.2 ? 3 : 0;
    },
    onLose(p) {
      if (p.stoneBox) { p.stoneBox.dead = true; p.stoneBox = null; }
      const d = data(p); d.roll = 0; d.pendRoll = 0; d.variant = null;
    },
  });

  // ======================================================================
  // 7. 冰凍 ICE：按住噴冰霧（前方 32px，rehit 10，freeze:true → 敵人變冰塊，entity.js 處理）
  //    ↑+X 冰柱噴泉：頭頂長出 38px 冰柱、一樣會凍結（Round 9 新增）
  //    ↓+X 冰塊飛踢的空中版：改成朝斜下方踢出冰彈
  // ======================================================================
  def('ice', {
    color: '#a0e8ff', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    desc: '吐出刺骨寒霧凍住敵人，再一腳把冰塊飛踢飛出去。',
    moves: [['X', '噴冰'], ['↑+X', '冰柱噴泉'], ['↓+X', '冰塊飛踢'], ['空中 X', '冰晶散射']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'kick'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, 'burst', 'pillar', 'breath', 'kick');
      if (d.mode === 'pillar') {
        // ↑+X 冰柱噴泉：頭頂的冰柱慢慢長高，命中一樣會凍結
        setup(p, { anim: 'kirby_attack_ice_up', dur: 26, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 16, h: 12, dmg: 1, owner: 'player', type: 'ice', follow: p, ox: -8, oy: -10, life: 3, rehit: 9, freeze: true, knock: 1.2, flipWithOwner: false, breakBlocks: true });
        p.vx *= 0.4;
        KB.audio.sfx('ice');
        vx('ring', p.cx, p.y - 2, { r0: 3, r1: 22, frames: 14, color: '#a0e8ff', width: 2 });
        vx('burst', p.cx, p.y - 2, { n: 12, colors: ['#ffffff', '#c0f0ff', '#80d0ff'], speed: 2.2, life: 22, grav: 0.04, size: 2, dir: -Math.PI / 2, spread: 0.7 });
      } else if (d.mode === 'kick') {
        setup(p, { anim: 'kirby_attack_ice_kick', dur: 20, fps: 10, lock: true });
        d.kicked = false;
      } else if (d.mode === 'burst') {
        setup(p, { anim: 'kirby_attack_ice_burst', dur: 22, fps: 10, lock: false });
        // 五道冰晶呈扇形散射
        for (let i = 0; i < 5; i++) {
          const a = (-150 + i * 60) * Math.PI / 180;
          KB.shoot({ spr: 'proj_ice', x: p.cx + Math.cos(a) * 8, y: p.cy + Math.sin(a) * 8, vx: Math.cos(a) * 2.6, vy: Math.sin(a) * 2.6,
            dmg: 2, owner: 'player', life: 30, w: 8, h: 8, grav: 0, solid: false, pierce: false, freeze: true, type: 'ice',
            dir: Math.cos(a) < 0 ? -1 : 1, fxHit: 'fx_ice', trail: '#c0f0ff', breakBlocks: true });
        }
        slowFall(p, 0.4);
        KB.audio.sfx('ice');
        // 特效：冰晶散射 → 冰藍雙環 + 晶體粒子爆散
        vx('ring', p.cx, p.cy, { r0: 4, r1: 40, frames: 18, color: '#a0e8ff', width: 3 });
        vx('ring', p.cx, p.cy, { r0: 2, r1: 26, frames: 14, color: '#ffffff', width: 1 });
        vx('burst', p.cx, p.cy, { n: 20, colors: ['#ffffff', '#c0f0ff', '#80d0ff'], speed: 2.4, life: 28, grav: 0.05, size: 3 });
        vx('circle', p.cx, p.cy, { r: 26, frames: 22, color: '#a0e8ff', spin: -0.1, glyphs: 6 });
      } else {
        setup(p, { anim: null, dur: 12, fps: 10, lock: true, maxHold: 90 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 12, h: 16, dmg: 1, owner: 'player', type: 'ice', follow: p, ox: 6, oy: 0, life: 3, rehit: 10, freeze: true });
        KB.audio.sfx('ice');
        vx('ring', p.cx + p.dir * 10, p.cy + 4, { r0: 2, r1: 18, frames: 12, color: '#c0f0ff', width: 2 });
      }
    },
    update(p, dt, held) {
      const d = data(p), b = d.box;
      d.t++;
      if (d.mode === 'kick') {
        if (p.stateT === 7 && !d.kicked) {
          d.kicked = true;
          // 找出附近被凍住的敵人 → 變成冰塊飛踢出去；沒有就射出短程冰彈
          let best = null, bd = 1e9;
          for (const e of KB.game.entities) {
            if (e.dead || e.type !== 'enemy' || e.freezeT <= 0) continue;
            const dx = e.cx - p.cx, dy = e.cy - p.cy;
            if (dx * p.dir < -8 || Math.abs(dx) > 44 || Math.abs(dy) > 26) continue;
            const dd = Math.abs(dx); if (dd < bd) { bd = dd; best = e; }
          }
          if (best) {
            const blk = new KB.IceBlock(best.x, best.y, p.dir);
            blk.dmg = 5; blk.bottom = best.bottom; KB.spawn(blk);
            best.freezeT = 0; best.dead = true;
            if (KB.game) KB.game.addScore(best.score, best.cx, best.y);
            KB.particles(best.cx, best.cy, ['#ffffff', '#c0f0ff'], 8, { spread: 2, life: 16 });
            KB.game.shake = 3;
            vx('ring', best.cx, best.cy, { r0: 4, r1: 30, frames: 14, color: '#a0e8ff', width: 3 });
            vx('burst', best.cx, best.cy, { n: 14, colors: ['#ffffff', '#c0f0ff', '#80d0ff'], speed: 2.4, life: 24, grav: 0.08, size: 3 });
            vx('textPop', best.cx, best.cy - 16, 'ICE KICK!', { color: '#a0e8ff', frames: 34 });
          } else {
            // 空中版：往斜下方踢（判定跟著卡比落下，不會停在半空）
            const air = !p.onGround;
            KB.shoot({ spr: 'proj_ice', x: p.cx + p.dir * (air ? 6 : 10), y: p.cy - 1 + (air ? 6 : 0), vx: p.dir * (air ? 2.2 : 3.4), vy: air ? 4.2 : 0, dmg: 2, owner: 'player', life: air ? 40 : 24, w: 10, h: 10,
              grav: 0, solid: true, pierce: false, freeze: true, type: 'ice', dir: p.dir, fxHit: 'fx_ice', trail: '#c0f0ff', breakBlocks: true });
            if (air) KB.hitbox({ x: 0, y: 0, w: 22, h: 22, dmg: 2, owner: 'player', type: 'ice', follow: p, ox: -11, oy: 8, life: 10, rehit: 0, freeze: true, knock: 1.4, flipWithOwner: false });
          }
          KB.audio.sfx('ice');
          KB.particles(p.cx + p.dir * 14, p.bottom - 4, ['#ffffff', '#c0f0ff'], 6, { spread: 1.4, grav: 0.05, life: 14, up: 0.4, size: 1 });
        }
        return;
      }
      if (d.mode === 'pillar') {
        slowFall(p, 0.6); p.vx *= 0.85;
        if (b && !b.dead) { const hh = Math.min(38, 12 + d.t * 3); fitBox(b, { h: hh, oy: -hh + 2 }); beat(b); }
        if (d.t % 2 === 1) KB.fx('fx_ice', p.cx + rnd(-3, 3), p.y - rnd(2, boxUp(b, 12)), { vy: -1.2, life: 12, flip: Math.random() < 0.5, fps: 12 });
        KB.particles(p.cx + rnd(-6, 6), p.y - rnd(0, boxUp(b, 12)), ['#ffffff', '#c0f0ff', '#80d0ff'], 1, { spread: 0.5, grav: -0.04, life: 14, up: 0.7, size: 1 });
        if (d.t === 10 || d.t === 20) vx('ring', p.cx, p.y - 16, { r0: 3, r1: 18, frames: 12, color: '#a0e8ff', width: 1 });
        if (d.t % 12 === 0) KB.audio.sfx('ice');
        return;
      }
      if (d.mode === 'burst') {
        slowFall(p, 0.7);
        if (d.t % 3 === 1) KB.particles(p.cx + rnd(-12, 12), p.cy + rnd(-12, 12), ['#ffffff', '#c0f0ff', '#80d0ff'], 1, { spread: 0.5, grav: 0.02, life: 14, up: 0, size: 1 });
        return;
      }
      const on = holding(p, held);
      slowFall(p, 0.5);
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; return; }
      fitBox(b, { w: Math.min(32, 12 + d.t * 4), ox: 6 }); beat(b);
      // 特效：噴冰前端的冰藍環 + 晶體碎屑
      if (d.t % 8 === 3) {
        vx('ring', p.cx + p.dir * (8 + b.w * 0.8), p.cy + 5, { r0: 2, r1: 14, frames: 12, color: '#a0e8ff', width: 1 });
        vx('burst', p.cx + p.dir * (8 + b.w * 0.7), p.cy + 5, { n: 5, colors: ['#ffffff', '#c0f0ff'], speed: 1.2, life: 18, grav: 0.05, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 1 });
      }
      if (d.t % 2 === 1) KB.fx('fx_ice', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 1.9, vy: rnd(-0.2, 0.2), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 10 + b.w * 0.8), p.cy + rnd(-5, 5), ['#ffffff', '#c0f0ff', '#80d0ff'], 1, { spread: 0.6, grav: 0.02, life: 14, up: 0.1, vx: p.dir * 1.0, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('ice');
    },
    onEnd(p) { killBox(p); clearAnim(p); data(p).mode = null; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 8. 鐵鎚 HAMMER：掄鎚 26 幀，判定由頭頂掃到前方（26×28，dmg 6，knock 2.5），揮到底時地面震動 + 塵土
  //    空中：判定較小（20×22，dmg 5）。蹲下＋攻擊：原地大力敲擊（34×30，dmg 8，shake 5）
  //    ↑+X 擎天鎚：由下往上掄過頭頂（26×34，dmg 6，把敵人打飛）（Round 9 新增）
  //    ↓+X 巨鎚敲擊的空中版：判定框移到身體下方並加速下砸
  // ======================================================================
  def('hammer', {
    color: '#e08040', duration: 26, hold: true, lockMove: true, canJump: false, fps: 7,
    desc: '扛起沉重的木槌，一擊就能把星星方塊與敵人砸扁。',
    moves: [['X', '掄鎚'], ['↑+X', '擎天鎚'], ['↓+X', '巨鎚敲擊'], ['空中 X', '落地震'], ['按住 40 幀放開', '大迴旋']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'smash'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, 'drop', 'rise', 'swing', 'smash');
      d.hits = 0; d.charge = 0; d.ready = false; d.landed = false;
      if (d.mode === 'rise') {
        // ↑+X 擎天鎚：由下往上掄過頭頂，判定框在頭上（空中沿用，緩降）
        setup(p, { anim: 'kirby_attack_hammer_up', dur: 24, fps: 10, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 34, dmg: 6, owner: 'player', type: 'hammer', follow: p, ox: -13, oy: -32, life: 18, rehit: 0, knock: 3.2, flipWithOwner: false, breakBlocks: true });
        if (p.onGround) { p.vy = -2.2; p.onGround = false; }
        p.vx *= 0.4;
        vx('slash', p.cx, p.cy - 14, 22, -Math.PI / 2, { color: '#f0e0c0', width: 4, frames: 13, arc: Math.PI * 1.1, flip: p.dir < 0 });
        vx('ring', p.cx, p.y - 12, { r0: 4, r1: 30, frames: 14, color: '#f0e0c0', width: 2 });
        vx('shake', 4);
      } else if (d.mode === 'smash') {
        setup(p, { anim: null, dur: 34, fps: 6, lock: true });
        p.vx = 0;
      } else if (d.mode === 'drop') {
        // 空中落地震：先短暫停滯再帶著鎚頭重落
        setup(p, { anim: 'kirby_attack_hammer_drop', dur: 90, fps: 8, lock: true });
        p.vy = -1.2; p.vx = 0;
      } else if (d.mode === 'spin') {
        setup(p, { anim: 'kirby_attack_hammer_spin', dur: 54, fps: 12, lock: true });
        KB.game.shake = 3;
      } else {
        setup(p, { anim: null, dur: 26, fps: 7, lock: true, maxHold: 240 });
      }
      KB.audio.sfx('hammer');
    },
    update(p, dt, held) {
      const d = data(p), t = p.stateT;
      // ---- 空中落地震 ----
      if (d.mode === 'drop') {
        if (t < 6) { p.vy = Math.min(p.vy, -0.6); }
        else if (!d.landed) {
          p.grav = 0.72; p.maxFall = 8;
          if (t % 3 === 0) KB.particles(p.cx, p.bottom - 4, ['#d8b890', '#ffffff'], 1, { spread: 0.6, grav: 0, life: 8, up: 0, size: 1 });
          if (!d.box) d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 20, dmg: 5, owner: 'player', type: 'hammer', follow: p, ox: -11, oy: 2, life: 3, rehit: 8, knock: 2, flipWithOwner: false });
          beat(d.box);
          if (p.onGround) {
            d.landed = true; killBox(p);
            p.grav = P.grav; p.maxFall = P.maxFall;
            KB.game.shake = 7; KB.audio.sfx('stone');
            // 地面兩側衝擊波
            for (const s of [-1, 1]) {
              KB.hitbox({ x: p.cx + (s > 0 ? 4 : -40), y: p.bottom - 14, w: 36, h: 16, dmg: 6, owner: 'player', type: 'hammer', life: 10, rehit: 0, pierce: true, melee: true, knock: 3 });
              KB.fx('fx_hit', p.cx + s * 20, p.bottom - 4);
              KB.particles(p.cx + s * 14, p.bottom, ['#d8b890', '#f0e0c0', '#ffffff'], 9, { spread: 2.2, vx: s * 1.6, up: 1.2, life: 24 });
              // 特效：左右兩道地面衝擊波
              vx('shockwave', p.cx + s * 8, p.bottom, { dir: s, speed: 3.6, frames: 22, w: 14, h: 16, color: '#f0e0c0' });
            }
            vx('ring', p.cx, p.bottom - 4, { r0: 6, r1: 56, frames: 18, color: '#f0e0c0', width: 3 });
            vx('hitstop', 4); vx('shake', 8); vx('zoom', 1.12, 10);
            vx('textPop', p.cx, p.bottom - 26, 'SMASH!', { color: '#ffe040', frames: 36 });
            p.attackTimer = Math.min(p.attackTimer, 14);
          }
        }
        if (t > 80) { p.grav = P.grav; p.maxFall = P.maxFall; }
        return;
      }
      // ---- 擎天鎚 ----
      if (d.mode === 'rise') {
        slowFall(p, 0.8); p.vx *= 0.85;
        if (t >= 2 && t <= 14) {
          const a = Math.PI * 0.2 + (t - 2) / 12 * Math.PI * 0.7;
          KB.particles(p.cx + p.dir * Math.cos(a) * 16, p.cy - 4 - Math.sin(a) * 16, ['#f0e0c0', '#ffffff'], 1, { spread: 0.25, grav: 0, life: 9, up: 0, size: 1 });
        }
        if (t === 4) { KB.audio.sfx('hammer'); vx('hitstop', 2); }
        if (d.box && !d.box.dead && t > 16) { d.box.dead = true; d.box = null; }
        return;
      }
      // ---- 蓄力大迴旋：連續三段判定，邊轉邊前進 ----
      if (d.mode === 'spin') {
        p.vx = p.dir * 1.5;
        const stage = Math.floor(t / 18);
        if (t % 18 === 2 && d.hits === stage) {
          d.hits++;
          killBox(p);
          d.box = KB.hitbox({ x: 0, y: 0, w: 40, h: 32, dmg: 6, owner: 'player', type: 'hammer', follow: p, ox: -20, oy: -16, life: 14, rehit: 0, knock: 3, pierce: true, flipWithOwner: false });
          KB.audio.sfx('hammer'); KB.game.shake = 3;
          KB.particles(p.cx, p.cy, ['#d8b890', '#f0e0c0'], 6, { spread: 2, up: 0.5, life: 16 });
          // 特效：大迴旋每段補一圈環 + 大弧 + 殘影
          vx('ring', p.cx, p.cy, { r0: 8, r1: 42, frames: 16, color: '#f0e0c0', width: 3 });
          vx('slash', p.cx, p.cy, 22, d.hits * 2.1, { color: '#f0e0c0', width: 4, frames: 12, arc: Math.PI * 1.6 });
          if (d.hits === 1) vx('afterimage', p, { frames: 54, color: '#f0e0c0', every: 3, alpha: 0.45 });
        }
        if (t % 4 === 0) KB.particles(p.cx + rnd(-18, 18), p.cy + rnd(-14, 14), '#f0e0c0', 1, { spread: 0.4, grav: 0, life: 8, up: 0, size: 1 });
        return;
      }
      // ---- 掄鎚 / 巨鎚敲擊 ----
      const smash = d.mode === 'smash';
      const swingT = smash ? 7 : 5, hitT = smash ? 15 : 13;   // 揮下開始 / 揮到底
      if (t === swingT) {
        killBox(p);
        // 空中版巨鎚敲擊：判定框移到身體下方（打腳下的敵人），並加速下砸
        if (smash && !p.onGround) { d.box = KB.hitbox({ x: 0, y: 0, w: 32, h: 30, dmg: 8, owner: 'player', type: 'hammer', follow: p, ox: -16, oy: 6, life: 16, rehit: 0, knock: 3, flipWithOwner: false }); if (p.vy < 3.2) p.vy = 3.2; }
        else if (smash) d.box = KB.hitbox({ x: 0, y: 0, w: 34, h: 30, dmg: 8, owner: 'player', type: 'hammer', follow: p, ox: -4, oy: -14, life: 16, rehit: 0, knock: 3 });
        else if (!p.onGround) d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 22, dmg: 5, owner: 'player', type: 'hammer', follow: p, ox: 2, oy: -8, life: 14, rehit: 0, knock: 2 });
        else d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 28, dmg: 6, owner: 'player', type: 'hammer', follow: p, ox: 2, oy: -12, life: 16, rehit: 0, knock: 2.5 });
      }
      const b = d.box;
      if (b && !b.dead && !smash) {   // 判定框從頭頂上方掃到身前
        const f = Math.min(1, (t - swingT) / (hitT - swingT));
        fitBox(b, { oy: (p.onGround ? -12 : -8) - Math.round((1 - f) * 10), ox: 2 - Math.round((1 - f) * 8) });
      }
      if (t === hitT && p.onGround) {
        KB.game.shake = smash ? 5 : 3; KB.audio.sfx('stone');
        KB.particles(p.cx + p.dir * (smash ? 14 : 16), p.bottom, ['#d8b890', '#f0e0c0', '#ffffff'], smash ? 14 : 7, { spread: smash ? 2.4 : 1.6, up: 1.4, life: 22 });
        if (smash) KB.fx('fx_hit', p.cx + p.dir * 16, p.bottom - 2);
        // 特效：地面衝擊波 + 落點環（巨鎚敲擊再加停格 / zoom / SMASH! 字）
        const hx = p.cx + p.dir * (smash ? 14 : 16);
        vx('shockwave', hx, p.bottom, { dir: p.dir, speed: smash ? 3.8 : 3, frames: smash ? 22 : 18, w: smash ? 14 : 11, h: smash ? 16 : 12, color: '#f0e0c0' });
        vx('ring', hx, p.bottom - 3, { r0: 4, r1: smash ? 46 : 32, frames: 16, color: '#f0e0c0', width: smash ? 3 : 2 });
        if (smash) {
          vx('hitstop', 5); vx('shake', 7); vx('zoom', 1.14, 10);
          vx('burst', hx, p.bottom - 2, { n: 16, colors: ['#d8b890', '#f0e0c0', '#ffffff'], speed: 2.8, life: 26, grav: 0.24, size: 3 });
          vx('textPop', p.cx, p.bottom - 26, 'SMASH!', { color: '#ffe040', frames: 36 });
        }
      }
      // 掄鎚動作結束後仍按住 → 進入蓄力；**從按下那一幀算起滿 40 幀**就放出大迴旋。
      // fix5b / R5-P1-03：d.charge 是從 t>=24（掄鎚動作演完）才開始加，所以實際門檻是 24+40=64 幀，
      //                   照招式表按住 40 幀放開完全沒反應。門檻改成 HAMMER_SPIN - 24，實際 = 標示。
      if (!smash && t >= 24) {
        if (b && !b.dead) { b.dead = true; d.box = null; }
        if (held) {
          d.charge++;
          if (d.charge >= HOLD('hammer', HAMMER_SPIN) - 24) {
            if (!d.ready) { d.ready = true; chargeFx(p, '#e08040'); }
            if (d.charge % 3 === 0) KB.particles(p.cx + rnd(-10, 10), p.y - 4, ['#ffffff', '#ffe040'], 2, { spread: 1, grav: 0, life: 12, up: 0.5, size: 1 });
          } else {
            if (d.charge % 8 === 1) sfx('charge');
            if (d.charge % 5 === 0) KB.particles(p.cx + p.dir * 8, p.y + 2, '#f0e0c0', 1, { spread: 0.8, grav: 0, life: 10, up: 0.3, size: 1 });
          }
          p.vx *= 0.8;
        } else if (d.ready) { startMove(p, 'spin'); return; }
      }
      if (t >= 20 && t < 24 && !smash && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) {
      killBox(p); clearAnim(p);
      const d = data(p); d.mode = null; d.charge = 0; d.ready = false; d.landed = false;
      p.grav = P.grav; p.maxFall = P.maxFall;
    },
    onLose(p) { killBox(p); clearAnim(p); p.grav = P.grav; p.maxFall = P.maxFall; },
  });
})();
