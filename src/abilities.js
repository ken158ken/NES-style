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
  // 取出本次攻擊的招式：優先用 data.next（蹲攻 / 蓄力放開），否則依「空中 / 上鍵 / 地面」判斷
  function pickMode(p, air, upMode, ground) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    if (!p.onGround && air) return air;
    if (down('up') && upMode) return upMode;
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
  //    ↓+X    火焰衝刺：變成火球水平衝 40 幀，全身判定 dmg 3、可撞破星星 / 炸彈方塊
  //    空中 X 火焰旋轉：身體被火環包覆旋轉 30 幀，範圍判定 dmg 2、緩降
  // ======================================================================
  def('fire', {
    color: '#f04020', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    desc: '把火焰之心含在嘴裡，一張口就是熊熊烈焰。',
    moves: [['X', '噴火'], ['↓+X', '火焰衝刺'], ['空中 X', '火焰旋轉']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'dash'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, 'spin', null, 'breath');
      if (d.mode === 'dash') {
        setup(p, { anim: 'kirby_attack_fire_dash', dur: 40, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 24, h: 20, dmg: 3, owner: 'player', type: 'fire', follow: p, ox: -12, oy: -3, life: 3, rehit: 8, knock: 2, flipWithOwner: false, breakBlocks: true });
        d.box.breakHard = true;     // 火焰衝刺可撞破硬磚 X（mechanics）
        p.vx = p.dir * 3.4;
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
      if (d.mode === 'dash') {
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
      b.w = Math.min(40, 12 + d.t * 5); beat(b);
      // 特效：噴口火星爆散（每 6 幀）
      if (d.t === 1) vx('burst', p.cx + p.dir * 12, p.cy + 4, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 1.8, life: 18, grav: -0.04, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 0.7 });
      else if (d.t % 6 === 0) vx('burst', p.cx + p.dir * (10 + b.w * 0.7), p.cy + 5, { n: 6, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 1.4, life: 16, grav: -0.05, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 1 });
      // 火焰段連續飛出（fx_fire 3 幀），加上向上飄的火星粒子
      if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 2.4, vy: rnd(-0.3, 0.1), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 36), p.cy + rnd(-4, 6), ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.5, grav: -0.05, life: 12, up: 0.2, vx: p.dir * 1.4, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('fire');
    },
    onEnd(p) { killBox(p); clearAnim(p); data(p).mode = null; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 2. 劍 SWORD
  //    X      揮砍    ：18 幀，先舉過頭再劈向前方（24×26，dmg 3），可邊走邊揮、連打連段
  //    滿血 X 劍氣    ：HP 全滿時揮砍第 6 幀射出短程劍氣（proj_swordwave，飛 80px）
  //    空中 X 迴旋斬  ：全身旋轉判定 30 幀（旋轉 2 圈）、緩降
  //    ↑+X    上挑斬  ：判定往上 28px 並小跳
  // ======================================================================
  def('sword', {
    color: '#40c040', duration: 18, lockMove: false, moveSpeed: P.walk, fps: 10,
    desc: '揮舞勇者之劍，斬擊乾淨俐落；體力全滿時劍尖會射出劍氣。',
    moves: [['X', '揮砍'], ['空中 X', '迴旋斬'], ['↑+X', '上挑斬'], ['滿血 X', '劍氣']],
    hatOffset: { attack: [0, 0] },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, 'spin', 'up', 'swing');
      if (d.mode === 'spin') {
        setup(p, { anim: 'kirby_attack_sword_spin', dur: 30, fps: 14, lock: false });
        d.box = KB.hitbox({ x: 0, y: 0, w: 32, h: 26, dmg: 2, owner: 'player', type: 'sword', follow: p, ox: -16, oy: -13, life: 3, rehit: 9, knock: 1.2, flipWithOwner: false });
        if (p.vy > -0.5) p.vy = -0.5;
        // 特效：迴旋斬 → 綠色殘影 + 環形劍光
        vx('afterimage', p, { frames: 32, color: '#d0ffd0', every: 2, alpha: 0.55 });
        vx('aura', p, { color: '#40c040', r: 16, frames: 30, pulse: 0.4 });
        vx('ring', p.cx, p.cy, { r0: 8, r1: 30, frames: 14, color: '#d0ffd0', width: 2 });
      } else if (d.mode === 'up') {
        setup(p, { anim: 'kirby_attack_sword_up', dur: 22, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 30, dmg: 3, owner: 'player', type: 'sword', follow: p, ox: -11, oy: -28, life: 18, rehit: 0, knock: 2.2, flipWithOwner: false });
        if (p.onGround) { p.vy = -2.8; p.onGround = false; }
        // 特效：上挑斬 → 由下往上的弧
        vx('slash', p.cx + p.dir * 4, p.cy - 12, 20, -Math.PI / 2, { color: '#d0ffd0', width: 3, frames: 12, arc: Math.PI * 0.9, flip: p.dir < 0 });
        vx('line', p.cx + p.dir * 4, p.cy - 4, p.cx + p.dir * 8, p.cy - 34, { color: '#ffffff', width: 2, frames: 10 });
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
        if (t === 2 || t === 9 || t === 16 || t === 23) vx('slash', p.cx, p.cy, 19, a, { color: '#d0ffd0', width: 3, frames: 10, arc: Math.PI * 1.3 });
        if (t === 15) KB.audio.sfx('sword');
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
        if (t <= 4) { b.ox = -8; b.oy = -18; b.w = 22; b.h = 16; }   // 舉劍過頭（可打到頭上的敵人）
        else { b.ox = 4; b.oy = -8; b.w = 24; b.h = 26; }              // 劈向前方
      }
      // 特效：揮下瞬間的大斬擊弧（由上往前掃）
      if (t === 5) vx('slash', p.cx + p.dir * 5, p.cy - 6, 21, p.dir > 0 ? -0.8 : Math.PI + 0.8, { color: '#d0ffd0', width: 3, frames: 11, arc: Math.PI * 1.05, flip: p.dir < 0 });
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
      this.box = KB.hitbox({ x: p.x, y: p.y, w: 12, h: 12, dmg: 2, owner: 'player', type: 'beam', life: 3, rehit: 0, pierce: true, dir: p.dir });
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

  // 牽星光環命中：直接把敵人吞下並取得牠的能力（需 e.ability 且可吸入）
  function captureHit(p, e) {
    if (!e || e.dead || e.type !== 'enemy') return;
    if (!e.inhalable || !e.ability || !KB.ABILITIES[e.ability]) return;
    KB.fx('fx_sparkle', e.cx, e.cy);
    KB.particles(e.cx, e.cy, ['#ffe040', '#ffffff'], 8, { spread: 2, grav: 0, life: 16, up: 0 });
    e.onInhaled(p);              // 設定 p.mouth（含分數 / cappy 特例）
    if (p.mouth) p.swallow();    // 立即吞下 → giveAbility
  }

  def('beam', {
    color: '#f0e040', duration: 20, hold: true, lockMove: true, canJump: false, fps: 10,
    desc: '揮出星光構成的光鞭；蓄滿力可放出貫穿一切的星潮光束。',
    moves: [['X', '甩光束'], ['按住 45 幀放開', '星潮光束'], ['↓+X', '牽星光環']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'capture'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, null, null, 'whip'); d.charged = false;
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
      } else if (d.mode === 'capture') {
        setup(p, { anim: 'kirby_attack_beam_capture', dur: 20, fps: 10, lock: true });
        vx('circle', p.cx + p.dir * 14, p.cy, { r: 22, frames: 22, color: '#ffe040', spin: 0.14, glyphs: 8 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 18, dmg: 0, owner: 'player', type: 'beam', follow: p, ox: 4, oy: -2, life: 12, rehit: 0, pierce: true,
          breakBlocks: false, onHit: b => captureHit(p, b) });
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
      if (d.mode === 'capture') {
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
          if (t >= BEAM_WAVE - 1) {
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
    moves: [['X', '迴旋刃'], ['↑+X', '上拋刃'], ['↓+X / 空中 X', '下劈']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).blades = []; },
    onCrouchAttack(p) { startMove(p, 'chop'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.blades = (d.blades || []).filter(b => !b.dead);
      d.mode = pickMode(p, 'chop', 'upthrow', 'throw');
      if (d.mode === 'chop') {
        setup(p, { anim: 'kirby_attack_cutter_chop', dur: 24, fps: 10, lock: false });
        d.hit2 = false;
        d.box = KB.hitbox({ x: 0, y: 0, w: 18, h: 14, dmg: 2, owner: 'player', type: 'cutter', follow: p, ox: 2, oy: -16, life: 7, rehit: 0, knock: 1.2 });
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
      if (d.mode === 'chop') {
        // 兩段判定：先上段撩、第 10 幀起下段劈
        if (t === 10 && !d.hit2) {
          d.hit2 = true; killBox(p);
          d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 22, dmg: 3, owner: 'player', type: 'cutter', follow: p, ox: 2, oy: -4, life: 10, rehit: 0, knock: 2 });
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
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.blades = (d.blades || []).filter(b => !b.dead); },
    onLose(p) { killBox(p); clearAnim(p); /* 已丟出的刀刃會自行飛回卡比後消失 */ },
  });

  // ======================================================================
  // 5. 電擊 SPARK：按住時卡比周圍 44×40 電場（rehit 6，dmg 1），不能移動、不能跳；放開即停
  // ======================================================================
  def('spark', {
    color: '#60c0ff', duration: 10, hold: true, maxHold: 150, lockMove: false, moveSpeed: 0.5, canJump: false, fps: 12,
    desc: '全身通電，放電時還能拖著電場慢慢走；蓄滿再放開會炸開巨大電擊波。',
    moves: [['X', '放電（44px 電場）'], ['放電中 ←→', '帶電慢走'], ['按住 45 幀放開', '電擊波（96px）']],
    hatOffset: { attack: [0, 0] },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, null, null, 'field'); d.charged = false;
      if (d.mode === 'burst') {
        setup(p, { anim: 'kirby_attack_spark_burst', dur: 20, fps: 12, lock: true });
        d.box = KB.hitbox({ x: 0, y: 0, w: 96, h: 80, dmg: 3, owner: 'player', type: 'spark', follow: p, ox: -48, oy: -32, life: 20, rehit: 7, flipWithOwner: false, pierce: true });
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
      const on = holding(p, held);
      p.vx *= 0.9;   // 帶電時可以走，但速度受電場拖累（moveSpeed 0.5）
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; if (d.charged) startMove(p, 'burst'); return; }
      beat(b);
      // 特效：電場中不斷跳動的閃電（每 5 幀 2 道）
      if (d.t === 1) vx('circle', p.cx, p.cy + 6, { r: 22, frames: 20, color: '#80d0ff', spin: 0.18, glyphs: 8 });
      if (d.t % 5 === 2) {
        for (let i = 0; i < 2; i++) {
          const a = rnd(0, Math.PI * 2), r = rnd(14, 22);
          vx('lightning', p.cx, p.cy, p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, { color: '#c0f0ff', frames: 7, jitter: 4, branches: 1 });
        }
      }
      // 電場隨機閃爍 + 藍白粒子
      if (d.t % 2 === 0) KB.fx('fx_spark_field', p.cx + rnd(-20, 20), p.cy + rnd(-14, 18) + 8, { life: 4, flip: Math.random() < 0.5, fps: 15 });
      KB.particles(p.cx + rnd(-22, 22), p.cy + rnd(-18, 18), ['#ffffff', '#80d0ff', '#c0f0ff'], 1, { spread: 1.2, grav: 0, life: 8, up: 0, size: 1 });
      if (d.t % 10 === 0) KB.audio.sfx('spark');
      if (p.stateT >= SPARK_BURST - 1) {   // fix5b：實際 = 招式表的 45 幀（原本 >= 45 實測要 46 幀）
        if (!d.charged) chargeFx(p, '#60c0ff');
        d.charged = true;
        if (d.t % 4 === 0) KB.particles(p.cx, p.y - 6, ['#ffffff', '#ffe040'], 2, { spread: 1, grav: 0, life: 12, up: 0.4, size: 1 });
      } else if (p.stateT >= 12 && p.stateT % 8 === 0) sfx('charge');
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 6. 石頭 STONE：player.js 的 startStone / updateStone 處理（無敵、重落、壓扁敵人、再按攻擊解除）
  //    本檔額外負責：變身時隨機外觀（岩石 / 石像 / 鐵塊）＋ 斜坡自動滾動（加速、dmg 8）
  //    掛勾：entity.js 的 Hitbox 在收到 {stone:true, owner:'player'} 時呼叫 onStoneStart，
  //          並每幀呼叫 hitbox.onUpdate（判定框在玩家之後更新，可安全改寫 p.vx）
  // ======================================================================
  const STONE_FORMS = ['kirby_stone_1', 'kirby_stone_2', 'kirby_stone_3'];
  const STONE_DUST = { kirby_stone_1: '#a0a0a8', kirby_stone_2: '#d8c4a0', kirby_stone_3: '#c8c8d0' };

  def('stone', {
    color: '#a0a0a8', stoneLike: true,
    desc: '變成堅硬的石塊，無敵又能壓扁敵人；在斜坡上會越滾越快。',
    moves: [['X', '變石（無敵、下壓）'], ['斜坡上', '滾石衝撞'], ['再按 X', '解除變身']],
    hatOffset: { stone: [0, 99] },
    onGet(p) { p.stoneT = 0; },
    // 每次變身：隨機外觀 + 重設滾動速度
    onStoneStart(p, box) {
      const d = data(p);
      d.form = STONE_FORMS[(Math.random() * STONE_FORMS.length) | 0];
      if (KB.SPR[d.form]) KB.SPR.kirby_stone = KB.SPR[d.form];
      d.roll = 0;
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
      data(p).roll = 0;
    },
  });

  // ======================================================================
  // 7. 冰凍 ICE：按住噴冰霧（前方 32px，rehit 10，freeze:true → 敵人變冰塊，entity.js 處理）
  // ======================================================================
  def('ice', {
    color: '#a0e8ff', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    desc: '吐出刺骨寒霧凍住敵人，再一腳把冰塊飛踢飛出去。',
    moves: [['X', '噴冰'], ['↓+X', '冰塊飛踢'], ['空中 X', '冰晶散射']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'kick'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.mode = pickMode(p, 'burst', null, 'breath');
      if (d.mode === 'kick') {
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
            KB.shoot({ spr: 'proj_ice', x: p.cx + p.dir * 10, y: p.cy - 1, vx: p.dir * 3.4, vy: 0, dmg: 2, owner: 'player', life: 24, w: 10, h: 10,
              grav: 0, solid: true, pierce: false, freeze: true, type: 'ice', dir: p.dir, fxHit: 'fx_ice', trail: '#c0f0ff', breakBlocks: true });
          }
          KB.audio.sfx('ice');
          KB.particles(p.cx + p.dir * 14, p.bottom - 4, ['#ffffff', '#c0f0ff'], 6, { spread: 1.4, grav: 0.05, life: 14, up: 0.4, size: 1 });
        }
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
      b.w = Math.min(32, 12 + d.t * 4); beat(b);
      // 特效：噴冰前端的冰藍環 + 晶體碎屑
      if (d.t % 8 === 3) {
        vx('ring', p.cx + p.dir * (8 + b.w * 0.8), p.cy + 5, { r0: 2, r1: 14, frames: 12, color: '#a0e8ff', width: 1 });
        vx('burst', p.cx + p.dir * (8 + b.w * 0.7), p.cy + 5, { n: 5, colors: ['#ffffff', '#c0f0ff'], speed: 1.2, life: 18, grav: 0.05, size: 2, dir: p.dir > 0 ? 0 : Math.PI, spread: 1 });
      }
      if (d.t % 2 === 1) KB.fx('fx_ice', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 1.9, vy: rnd(-0.2, 0.2), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 30), p.cy + rnd(-5, 5), ['#ffffff', '#c0f0ff', '#80d0ff'], 1, { spread: 0.6, grav: 0.02, life: 14, up: 0.1, vx: p.dir * 1.0, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('ice');
    },
    onEnd(p) { killBox(p); clearAnim(p); data(p).mode = null; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 8. 鐵鎚 HAMMER：掄鎚 26 幀，判定由頭頂掃到前方（26×28，dmg 6，knock 2.5），揮到底時地面震動 + 塵土
  //    空中：判定較小（20×22，dmg 5）。蹲下＋攻擊：原地大力敲擊（34×30，dmg 8，shake 5）
  // ======================================================================
  def('hammer', {
    color: '#e08040', duration: 26, hold: true, lockMove: true, canJump: false, fps: 7,
    desc: '扛起沉重的木槌，一擊就能把星星方塊與敵人砸扁。',
    moves: [['X', '掄鎚'], ['按住 40 幀放開', '大迴旋'], ['空中 X', '落地震'], ['↓+X', '巨鎚敲擊']],
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { startMove(p, 'smash'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = pickMode(p, 'drop', null, 'swing');
      d.hits = 0; d.charge = 0; d.ready = false; d.landed = false;
      if (d.mode === 'smash') {
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
              KB.hitbox({ x: p.cx + (s > 0 ? 4 : -40), y: p.bottom - 14, w: 36, h: 16, dmg: 6, owner: 'player', type: 'hammer', life: 10, rehit: 0, pierce: true, knock: 3 });
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
        if (smash) d.box = KB.hitbox({ x: 0, y: 0, w: 34, h: 30, dmg: 8, owner: 'player', type: 'hammer', follow: p, ox: -4, oy: -14, life: 16, rehit: 0, knock: 3 });
        else if (!p.onGround) d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 22, dmg: 5, owner: 'player', type: 'hammer', follow: p, ox: 2, oy: -8, life: 14, rehit: 0, knock: 2 });
        else d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 28, dmg: 6, owner: 'player', type: 'hammer', follow: p, ox: 2, oy: -12, life: 16, rehit: 0, knock: 2.5 });
      }
      const b = d.box;
      if (b && !b.dead && !smash) {   // 判定框從頭頂上方掃到身前
        const f = Math.min(1, (t - swingT) / (hitT - swingT));
        b.oy = (p.onGround ? -12 : -8) - Math.round((1 - f) * 10); b.ox = 2 - Math.round((1 - f) * 8);
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
          if (d.charge >= HAMMER_SPIN - 24) {
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
