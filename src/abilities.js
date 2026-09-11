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
  const def = (key, o) => {
    o.key = key; o.name = o.name || KB.ABILITY_NAMES[key]; o.hudName = o.hudName || KB.ABILITY_HUD[key];
    o.hat = o.hat || ('hat_' + key); o.icon = o.icon || ('ui_ability_' + key);
    KB.ABILITIES[key] = o; return o;
  };

  // ---------- 共用工具 ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const data = p => p.abilityData || (p.abilityData = {});
  // 清除本能力產生、且必須隨攻擊結束的實體（判定框 / 光鞭）
  function killBox(p) {
    const d = data(p);
    if (d.box) { d.box.dead = true; d.box = null; }
    if (d.whip) { d.whip.dead = true; d.whip = null; }
  }
  const beat = b => { if (b && !b.dead) b.life = 3; };                 // 心跳續命
  const slowFall = (p, v) => { if (!p.onGround && p.vy > v) p.vy = v; }; // 空中攻擊時緩慢下落
  // 連段：setState 對相同狀態不會重置 stateT，所以先切回 idle 再重新 startAttack（動畫 / 計時 / 判定全部重來）
  function restartAttack(p) { p.setState('idle'); p.startAttack(); }
  // hold 型能力：是否仍在噴射中（按住且未超過 maxHold，或最短噴射時間尚未用完）
  function holding(p, held) { const d = p.abilityDef; return (held && p.stateT < (d.maxHold || 1e9)) || p.attackTimer > 2; }

  // ======================================================================
  // 1. 火焰 FIRE：按住噴火（最多 90 幀），前方火焰柱逐漸伸長到 40px，每 8 幀重複判定 dmg 1
  // ======================================================================
  def('fire', {
    color: '#f04020', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.box = KB.hitbox({ x: 0, y: 0, w: 12, h: 16, dmg: 1, owner: 'player', type: 'fire', follow: p, ox: 6, oy: 0, life: 3, rehit: 8 });
      KB.audio.sfx('fire');
    },
    update(p, dt, held) {
      const d = data(p), b = d.box, on = holding(p, held);
      d.t++; slowFall(p, 0.5);
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; return; }
      b.w = Math.min(40, 12 + d.t * 5); beat(b);
      // 火焰段連續飛出（fx_fire 3 幀），加上向上飄的火星粒子
      if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 2.4, vy: rnd(-0.3, 0.1), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 36), p.cy + rnd(-4, 6), ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.5, grav: -0.05, life: 12, up: 0.2, vx: p.dir * 1.4, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('fire');
    },
    onEnd: killBox, onLose: killBox,
  });

  // ======================================================================
  // 2. 劍 SWORD：快速揮劍 18 幀，先舉過頭再劈向前方（24×26，dmg 3）；可邊走邊揮、連打連段、空中可用
  // ======================================================================
  def('sword', {
    color: '#40c040', duration: 18, lockMove: false, moveSpeed: P.walk, fps: 10,
    hatOffset: { attack: [0, 0] },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.box = KB.hitbox({ x: 0, y: 0, w: 22, h: 16, dmg: 3, owner: 'player', type: 'sword', follow: p, ox: -8, oy: -18, life: 16, rehit: 0, knock: 1.5 });
      KB.audio.sfx('sword');
    },
    update(p) {
      const d = data(p), t = p.stateT, b = d.box;
      if (b && !b.dead) {
        if (t <= 4) { b.ox = -8; b.oy = -18; b.w = 22; b.h = 16; }   // 舉劍過頭（可打到頭上的敵人）
        else { b.ox = 4; b.oy = -8; b.w = 24; b.h = 26; }              // 劈向前方
      }
      // 劍光弧線（白色粒子沿弧線掃過）
      if (t >= 2 && t <= 12) {
        const a = Math.PI * 0.8 - (t - 2) / 10 * Math.PI * 0.95;
        KB.particles(p.cx + p.dir * Math.cos(a) * 17, p.cy - 1 - Math.sin(a) * 17, ['#ffffff', '#d0ffd0'], 1, { spread: 0.15, grav: 0, life: 7, up: 0, size: 1 });
      }
      if (t >= 9 && KB.input.pressed('attack')) restartAttack(p);   // 連段
    },
    onEnd: killBox, onLose: killBox,
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

  def('beam', {
    color: '#f0e040', duration: 20, lockMove: true, canJump: false, fps: 10,
    hatOffset: { attack: [0, 0] },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.whip = KB.spawn(new BeamWhip(p)); d.box = d.whip.box;
      KB.audio.sfx('beam');
    },
    update(p) { if (p.stateT >= 15 && KB.input.pressed('attack')) restartAttack(p); },
    onEnd: killBox, onLose: killBox,
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

  def('cutter', {
    color: '#e0e0e0', duration: 14, lockMove: false, moveSpeed: P.walk, fps: 10,
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).blades = []; },
    onAttack(p) {
      const d = data(p); d.blades = (d.blades || []).filter(b => !b.dead);
      if (d.blades.length >= 2) return;   // 最多兩片在外，仍播放動作
      d.blades.push(KB.spawn(new CutterBlade(p)));
      KB.audio.sfx('cutter');
    },
    update(p) { if (p.stateT >= 8 && KB.input.pressed('attack')) restartAttack(p); },
    onEnd(p) { const d = data(p); d.blades = (d.blades || []).filter(b => !b.dead); },
    onLose(p) { /* 已丟出的刀刃會自行飛回卡比後消失 */ },
  });

  // ======================================================================
  // 5. 電擊 SPARK：按住時卡比周圍 44×40 電場（rehit 6，dmg 1），不能移動、不能跳；放開即停
  // ======================================================================
  def('spark', {
    color: '#60c0ff', duration: 10, hold: true, maxHold: 150, lockMove: true, canJump: false, fps: 12,
    hatOffset: { attack: [0, 0] },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.box = KB.hitbox({ x: 0, y: 0, w: 44, h: 40, dmg: 1, owner: 'player', type: 'spark', follow: p, ox: -22, oy: -12, life: 3, rehit: 6, flipWithOwner: false });
      KB.audio.sfx('spark');
    },
    update(p, dt, held) {
      const d = data(p), b = d.box, on = holding(p, held);
      d.t++; p.vx *= 0.7;
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; return; }
      beat(b);
      // 電場隨機閃爍 + 藍白粒子
      if (d.t % 2 === 0) KB.fx('fx_spark_field', p.cx + rnd(-20, 20), p.cy + rnd(-14, 18) + 8, { life: 4, flip: Math.random() < 0.5, fps: 15 });
      KB.particles(p.cx + rnd(-22, 22), p.cy + rnd(-18, 18), ['#ffffff', '#80d0ff', '#c0f0ff'], 1, { spread: 1.2, grav: 0, life: 8, up: 0, size: 1 });
      if (d.t % 10 === 0) KB.audio.sfx('spark');
    },
    onEnd: killBox, onLose: killBox,
  });

  // ======================================================================
  // 6. 石頭 STONE：player.js 的 startStone / updateStone 處理（無敵、重落、壓扁敵人、再按攻擊解除）
  // ======================================================================
  def('stone', {
    color: '#a0a0a8', stoneLike: true,
    hatOffset: { stone: [0, 99] },
    onGet(p) { p.stoneT = 0; },
    onLose(p) { if (p.stoneBox) { p.stoneBox.dead = true; p.stoneBox = null; } },
  });

  // ======================================================================
  // 7. 冰凍 ICE：按住噴冰霧（前方 32px，rehit 10，freeze:true → 敵人變冰塊，entity.js 處理）
  // ======================================================================
  def('ice', {
    color: '#a0e8ff', duration: 12, hold: true, maxHold: 90, lockMove: true, canJump: false, fps: 10,
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      d.box = KB.hitbox({ x: 0, y: 0, w: 12, h: 16, dmg: 1, owner: 'player', type: 'ice', follow: p, ox: 6, oy: 0, life: 3, rehit: 10, freeze: true });
      KB.audio.sfx('ice');
    },
    update(p, dt, held) {
      const d = data(p), b = d.box, on = holding(p, held);
      d.t++; slowFall(p, 0.5);
      if (!b || b.dead) return;
      if (!on) { b.dead = true; d.box = null; return; }
      b.w = Math.min(32, 12 + d.t * 4); beat(b);
      if (d.t % 2 === 1) KB.fx('fx_ice', p.cx + p.dir * 10, p.cy + 6, { vx: p.dir * 1.9, vy: rnd(-0.2, 0.2), life: 13, flip: p.dir < 0, fps: 12 });
      KB.particles(p.cx + p.dir * rnd(10, 30), p.cy + rnd(-5, 5), ['#ffffff', '#c0f0ff', '#80d0ff'], 1, { spread: 0.6, grav: 0.02, life: 14, up: 0.1, vx: p.dir * 1.0, size: 1 });
      if (d.t % 24 === 0) KB.audio.sfx('ice');
    },
    onEnd: killBox, onLose: killBox,
  });

  // ======================================================================
  // 8. 鐵鎚 HAMMER：掄鎚 26 幀，判定由頭頂掃到前方（26×28，dmg 6，knock 2.5），揮到底時地面震動 + 塵土
  //    空中：判定較小（20×22，dmg 5）。蹲下＋攻擊：原地大力敲擊（34×30，dmg 8，shake 5）
  // ======================================================================
  def('hammer', {
    color: '#e08040', duration: 26, lockMove: true, canJump: false, fps: 7,
    hatOffset: { attack: [0, 0] },
    onCrouchAttack(p) { data(p).smash = true; p.startAttack(); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.mode = d.smash ? 'smash' : 'swing'; d.smash = false;
      if (d.mode === 'smash') { p.attackTimer = 34; p.attackFps = 6; p.vx = 0; }
      KB.audio.sfx('hammer');
    },
    update(p) {
      const d = data(p), t = p.stateT, smash = d.mode === 'smash';
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
      }
      if (t >= 20 && !smash && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); data(p).mode = null; },
    onLose(p) { killBox(p); },
  });
})();
