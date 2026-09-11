// 卡比 —— 玩家狀態機
(function () {
  const P = KB.PHYS;
  KB.HAT_OFFSET = { default: [0, 0], crouch: [0, -1], slide: [2, 1], full: [0, -1], float: [0, -2],
    inhale: [0, -1], spit: [0, -1], swallow: [0, -1], exhale: [0, -1], dance: [0, -1],
    swim: [2, 1], hurt: [0, 0], climb: [0, 0], attack: [0, 0],
    stone: [0, 99], door: [0, 99], dead: [0, 99] };

  class Player extends KB.Entity {
    constructor(x, y) {
      super(x, y);
      this.type = 'player'; this.w = 14; this.h = 15; this.z = 3; this.stepH = 8;
      this.hp = KB.MAX_HP; this.maxHp = KB.MAX_HP;
      this.state = 'idle'; this.stateT = 0;
      this.ability = null; this.mouth = null; this.abilityData = {};
      this.attackTimer = 0; this.attackLock = false; this.hurtTimer = 0; this.slideT = 0;
      this.running = false; this.lastTapDir = 0; this.tapT = 0;
      this.flipT = 0; this.jumped = false; this.jumpHold = 0;
      this.invincibleT = 0; this.stoneT = 0; this.mouthFull = false;
      this.inhaleT = 0; this.floatFrame = 0; this.floatAnimT = 0;
      this.ctl = true;        // 是否接受輸入
      this.deadT = 0; this.doorT = 0; this.doorTarget = null; this.danceT = 0;
      this.inWater = false; this.wasInWater = false;
      this.inhaleFx = null; this.anim = 'kirby_idle'; this.animT = 0; this.animFps = null;
      this.hitboxes = [];
      this.faceAnimCache = null; this.landT = 0;
      this.name = 'kirby';
    }

    // ---------- 狀態 ----------
    setState(s) {
      if (this.state === s) return;
      const prev = this.state;
      if (prev === 'attack' && s !== 'attack') { const d = this.abilityDef; if (d && d.onEnd) d.onEnd(this); }
      this.state = s; this.stateT = 0; this.animT = 0;
      if (prev === 'crouch' || prev === 'slide') this.setCrouchBox(false);
      if (s === 'crouch' || s === 'slide') this.setCrouchBox(true);
      if (s !== 'inhale') this.stopInhale();
      if (s !== 'attack' && s !== 'stone') { this.attackLock = false; this.attackTimer = 0; }
      if (s === 'float') { this.floatAnimT = 0; }
    }
    setCrouchBox(on) {
      const nb = on ? 9 : 15; const b = this.bottom; this.h = nb; this.bottom = b;
    }
    get full() { return !!this.mouth; }
    get airborne() { return !this.onGround; }
    get canControl() { return this.ctl && !['dead', 'door', 'dance', 'hurt'].includes(this.state); }
    get abilityDef() { return this.ability ? KB.ABILITIES[this.ability] : null; }
    get invincible() { return this.invincibleT > 0; }
    isAttackState() { return this.state === 'attack'; }

    // ---------- 主更新 ----------
    update(dt) {
      this.baseUpdate(dt);
      this.stateT++;
      if (this.invincibleT > 0) { this.invincibleT--; if (this.invincibleT === 0 && KB.game) KB.game.resumeMusic(); }
      if (this.landT > 0) this.landT--;
      const map = KB.game.map, inp = KB.input;
      this.wasInWater = this.inWater;
      this.inWater = map.inWater(this.cx, this.cy);

      switch (this.state) {
        case 'dead': this.updateDead(); return;
        case 'door': this.updateDoor(); return;
        case 'dance': this.vx = 0; this.physics(); return;
        case 'hurt': this.updateHurt(); return;
        case 'stone': this.updateStone(); return;
        case 'climb': this.updateClimb(); return;
      }
      if (this.inWater && !['swim'].includes(this.state) && !this.full && this.state !== 'attack') { this.setState('swim'); this.vy = Math.min(this.vy, 1); }
      if (!this.inWater && this.state === 'swim') this.setState('fall');
      if (this.state === 'swim') { this.updateSwim(); return; }

      // 攻擊狀態（能力）
      if (this.state === 'attack') { this.updateAttack(); return; }
      if (this.state === 'inhale') { this.updateInhale(); return; }
      if (this.state === 'spit' || this.state === 'swallow' || this.state === 'exhale') {
        this.vx *= 0.8; this.physics(); if (this.stateT > 14) this.setState(this.onGround ? 'idle' : 'fall'); return;
      }
      if (this.state === 'slide') { this.updateSlide(); return; }
      if (this.state === 'float') { this.updateFloat(); return; }

      // ---- 一般地面 / 空中 ----
      const left = inp.down('left'), right = inp.down('right'), dirIn = (right ? 1 : 0) - (left ? 1 : 0);
      const speed = this.full ? P.fullWalk : (this.running ? P.run : P.walk);
      // 雙擊跑步
      if (inp.pressed('left') || inp.pressed('right')) {
        const d = inp.pressed('right') ? 1 : -1;
        if (this.lastTapDir === d && this.tapT > 0 && this.onGround && !this.full) this.running = true;
        this.lastTapDir = d; this.tapT = 14;
      }
      if (this.tapT > 0) this.tapT--;
      if (dirIn === 0 && this.onGround) this.running = false;
      if (dirIn !== 0) {
        this.dir = dirIn;
        const acc = this.onGround ? P.accel : P.airAccel;
        if (Math.abs(this.vx) < speed || Math.sign(this.vx) !== dirIn) this.vx += dirIn * acc * (this.onGround ? 1 : 1);
        if (Math.abs(this.vx) > speed) this.vx = Math.max(-speed, Math.min(speed, this.vx * 0.9 + dirIn * speed * 0.1));
      } else {
        if (this.onGround) { this.vx *= (1 - P.friction); if (Math.abs(this.vx) < 0.1) this.vx = 0; }
        else this.vx *= 0.98;
      }

      // 門 / 梯子
      if (inp.pressed('up') && this.onGround) {
        const door = KB.game.doorAt(this); if (door) { this.enterDoor(door); return; }
      }
      if (!this.full) {
        if (inp.down('up') && map.onLadder(this.cx, this.cy)) { this.startClimb(); return; }
        if (inp.down('down') && map.onLadder(this.cx, this.bottom + 1) && !map.onLadder(this.cx, this.cy)) { this.startClimb(); this.y += 2; return; }
        if (inp.down('down') && !this.onGround && map.onLadder(this.cx, this.cy)) { this.startClimb(); return; }
      }

      // 蹲下 / 滑鏟
      if (this.onGround && inp.down('down') && !this.full) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.vx *= 0.7;
        if (inp.pressed('jump')) { this.startSlide(); return; }
        if (inp.pressed('attack') && this.abilityDef && this.abilityDef.onCrouchAttack) { this.abilityDef.onCrouchAttack(this); }
        this.physics(); return;
      } else if (this.state === 'crouch') this.setState('idle');

      // 平台下穿
      this.dropThrough = false;

      // 跳躍
      if (inp.pressed('jump')) {
        if (this.onGround) {
          this.vy = this.full ? P.fullJump : P.jump; this.jumped = true; this.jumpHold = 10; this.onGround = false;
          this.setState('jump'); KB.audio.sfx('jump');
        } else if (!this.full) {
          this.startFloat(); return;
        }
      }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }

      // 攻擊鍵
      if (inp.pressed('attack')) {
        if (this.full) { this.spit(); return; }
        if (this.ability) { this.startAttack(); return; }
        this.setState('inhale'); this.inhaleT = 0; KB.audio.sfx('inhale'); this.updateInhale(); return;
      }
      if (inp.down('attack') && !this.full && !this.ability && this.state !== 'inhale' && this.stateT > 2 && !inp.pressed('jump')) {
        // 按住攻擊鍵持續吸
        this.setState('inhale'); this.inhaleT = 0; this.updateInhale(); return;
      }
      // 吞下
      if (this.full && inp.pressed('down')) { this.swallow(); return; }
      // 丟棄能力
      if (inp.pressed('select') && this.ability) { this.dropAbility(true); }

      this.physics();
      this.afterPhysics();
      if (this.state === 'dead' || this.state === 'hurt') return;

      // 狀態判定
      if (this.onGround) {
        if (this.state === 'jump' || this.state === 'fall') { this.setState('idle'); this.landT = 6; KB.audio.sfx('land'); this.jumped = false; }
        if (Math.abs(this.vx) > 0.2 && dirIn !== 0) this.setState(this.running ? 'run' : 'walk');
        else if (this.state === 'walk' || this.state === 'run') this.setState('idle');
      } else {
        if (this.vy < 0) { if (this.state !== 'jump') this.setState('jump'); }
        else if (this.state !== 'fall') { this.setState('fall'); this.flipT = this.jumped ? 22 : 0; }
        if (this.state === 'fall' && this.flipT > 0) this.flipT--;
      }
    }

    afterPhysics() {
      if (this.fellOut && this.state !== 'dead') { this.hp = 0; this.die(true); }
      // 尖刺
      const map = KB.game.map;
      if (map.isSpike(this.cx, this.bottom - 1) || map.isSpike(this.cx, this.bottom + 1) && this.onGround) {
        if (this.state !== 'stone') this.hurt(1, { cx: this.cx, cy: this.cy + 20, spike: true });
      }
    }

    // ---------- 漂浮 ----------
    startFloat() {
      this.setState('float'); this.vy = P.floatUp; this.floatFrame = 0; this.floatAnimT = 0; KB.audio.sfx('float');
      this.running = false;
    }
    updateFloat() {
      const inp = KB.input;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (dirIn) { this.dir = dirIn; this.vx += dirIn * 0.1; }
      else this.vx *= 0.92;
      this.vx = Math.max(-1.0, Math.min(1.0, this.vx));
      if (inp.pressed('jump')) { this.vy = P.floatUp; this.floatAnimT = 0; KB.audio.sfx('float'); }
      if (inp.pressed('attack') || (inp.down('down') && this.onGround)) { this.exhale(); return; }
      if (inp.pressed('up') && this.onGround) { const d = KB.game.doorAt(this); if (d) { this.enterDoor(d); return; } }
      this.floatAnimT++;
      this.grav = P.floatGrav; this.maxFall = P.floatMaxFall;
      this.physics();
      this.grav = P.grav; this.maxFall = P.maxFall;
      if (this.hitCeil) this.vy = 0.2;
      this.afterPhysics();
      if (this.inWater) { this.setState('swim'); }
    }
    exhale() {
      this.setState('exhale'); KB.audio.sfx('exhale');
      KB.shoot({ spr: 'proj_airpuff', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 2.6, dmg: 1, owner: 'player', life: 22, w: 10, h: 10, dir: this.dir, solid: true, fxHit: 'fx_poof' });
      this.vy = 0.5;
    }

    // ---------- 吸入 ----------
    stopInhale() { if (this.inhaleFx) { this.inhaleFx.dead = true; this.inhaleFx = null; } this.releaseInhaled(); }
    releaseInhaled() {
      for (const e of KB.game.entities) if (e.beingInhaled && e.inhaleSrc === this) { e.beingInhaled = false; e.inhaleSrc = null; }
    }
    updateInhale() {
      const inp = KB.input;
      this.inhaleT++;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (this.onGround) { this.vx *= 0.7; } else { if (dirIn) this.vx += dirIn * 0.05; this.vx *= 0.96; }
      if (!inp.down('attack')) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      if (inp.pressed('jump') && this.onGround) { this.vy = P.jump; this.jumped = true; this.jumpHold = 10; this.onGround = false; KB.audio.sfx('jump'); }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }
      // 吸力範圍
      const mx = this.cx + this.dir * 8, my = this.cy;
      const rx = this.dir > 0 ? this.cx + 4 : this.cx - 4 - 52, ry = this.cy - 16, rw = 52, rh = 32;
      const mouth = { x: this.dir > 0 ? this.cx + 2 : this.cx - 12, y: this.cy - 6, w: 10, h: 12 };
      if (!this.inhaleFx || this.inhaleFx.dead) { this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 99999, fps: 10 }); }
      this.inhaleFx.x = this.cx + this.dir * 30; this.inhaleFx.y = this.cy + 10; this.inhaleFx.flip = this.dir < 0;
      const map = KB.game.map;
      for (const e of KB.game.entities) {
        if (e.dead || e === this) continue;
        if (!(e.type === 'enemy' || (e.type === 'proj' && e.inhalable) || e.type === 'item' && e.inhalable)) continue;
        if (!e.overlapsRect(rx, ry, rw, rh)) { if (e.inhaleSrc === this) { e.beingInhaled = false; e.inhaleSrc = null; } continue; }
        if (!e.inhalable) { if (e.onInhaleAttempt) e.onInhaleAttempt(this); continue; }
        if (e.freezeT > 0) continue;
        e.beingInhaled = true; e.inhaleSrc = this;
        e.pullTo ? e.pullTo(mx, my, 2.4) : (e.x += (mx - e.cx) * 0.15, e.y += (my - e.cy) * 0.15);
        if (e.overlapsRect(mouth.x, mouth.y, mouth.w, mouth.h)) {
          e.beingInhaled = false; e.inhaleSrc = null;
          e.onInhaled(this);
          if (this.mouth) { this.setState('full'); KB.audio.sfx('swallow'); KB.fx('fx_sparkle', this.cx, this.cy); this.stopInhale(); this.physics(); return; }
        }
      }
      // 星星方塊
      const bx = Math.floor((this.cx + this.dir * 20) / 16), by = Math.floor(this.cy / 16);
      for (const [tx, ty] of [[bx, by], [bx + this.dir, by]]) {
        const ch = map.get(tx, ty);
        if (ch === '*') {
          map.set(tx, ty, '.'); KB.particles(tx * 16 + 8, ty * 16 + 8, '#ffd040', 5, { spread: 1.5 });
          this.mouth = { ability: null, name: 'star', score: 10 }; this.setState('full'); KB.audio.sfx('swallow'); this.stopInhale(); this.physics(); return;
        }
      }
      this.physics();
      this.afterPhysics();
      if (this.onGround && this.vy === 0 && this.state === 'inhale') { /* keep */ }
    }
    spit() {
      const m = this.mouth; this.mouth = null;
      this.setState('spit'); KB.audio.sfx('spit');
      const dmg = 4;
      KB.shoot({ spr: 'proj_star', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 4, dmg, owner: 'player', life: 70, w: 12, h: 12, dir: this.dir, solid: true, fxHit: 'fx_hit', rotSpeed: 0.3 * this.dir, type: 'star' });
    }
    swallow() {
      const m = this.mouth; this.mouth = null;
      this.setState('swallow');
      if (m && m.ability && KB.ABILITIES[m.ability]) {
        this.giveAbility(m.ability);
      } else KB.audio.sfx('swallow');
    }
    giveAbility(key) {
      if (this.ability) this.dropAbility(false);
      this.ability = key; this.abilityData = {};
      KB.audio.sfx('ability');
      KB.fx('fx_sparkle', this.cx, this.cy - 4); KB.particles(this.cx, this.cy, ['#fff', '#ffe040', '#ffb0d0'], 12, { spread: 2.5 });
      if (KB.game) { KB.game.abilityFlash = 60; }
      const d = KB.ABILITIES[key]; if (d && d.onGet) d.onGet(this);
    }
    dropAbility(spawnStar) {
      const key = this.ability; if (!key) return;
      const d = KB.ABILITIES[key]; if (d && d.onLose) d.onLose(this);
      this.ability = null; this.abilityData = {};
      if (this.state === 'attack' || this.state === 'stone') this.setState(this.onGround ? 'idle' : 'fall');
      if (spawnStar && KB.ITEMS.abilitystar) KB.spawn(new KB.ITEMS.abilitystar(this.cx - 8, this.y - 8, key, -this.dir));
    }

    // ---------- 能力攻擊 ----------
    startAttack() {
      const d = this.abilityDef; if (!d) return;
      if (d.key === 'stone' || d.stoneLike) { this.startStone(); return; }
      this.setState('attack'); this.attackTimer = d.duration || 20; this.attackLock = d.lockMove !== false;
      this.attackFps = d.fps || 12;
      if (d.onAttack) d.onAttack(this);
    }
    restartAttack() { this.setState('idle'); this.startAttack(); }
    updateAttack() {
      const d = this.abilityDef, inp = KB.input;
      if (!d) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (!this.attackLock) {
        if (dirIn) { this.dir = dirIn; this.vx += dirIn * (this.onGround ? P.accel : P.airAccel); }
        const sp = d.moveSpeed || P.walk; this.vx = Math.max(-sp, Math.min(sp, this.vx));
        if (!dirIn && this.onGround) this.vx *= 0.8;
      } else if (this.onGround) this.vx *= 0.75;
      if (inp.pressed('jump') && this.onGround && d.canJump !== false) { this.vy = P.jump; this.jumped = true; this.jumpHold = 10; KB.audio.sfx('jump'); }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }
      if (d.update) d.update(this, dt1(), inp.down('attack'));
      this.attackTimer--;
      if (d.hold && inp.down('attack') && (d.maxHold === undefined || this.stateT < d.maxHold)) this.attackTimer = Math.max(this.attackTimer, 2);
      if (this.attackTimer <= 0) { if (d.onEnd) d.onEnd(this); this.setState(this.onGround ? 'idle' : 'fall'); }
      this.physics(); this.afterPhysics();
    }
    startStone() {
      this.setState('stone'); this.vx = 0; this.stoneT = 0; KB.audio.sfx('stone');
      KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      this.stoneBox = KB.hitbox({ x: this.x, y: this.y, w: this.w + 4, h: this.h + 2, dmg: 6, owner: 'player', type: 'stone', follow: this, ox: -this.w / 2 - 2, oy: -1, life: 99999, rehit: 20, pierce: true, stone: true, breakBlocks: true });
    }
    updateStone() {
      const inp = KB.input;
      this.stoneT++;
      this.grav = 0.6; this.maxFall = 7; this.vx *= 0.6;
      if (this.onSlope) { this.vx += (KB.game.map.get(Math.floor(this.cx / 16), Math.floor(this.bottom / 16)) === '/' ? -1 : 1) * 0.5; }
      const wasAir = !this.onGround;
      this.physics();
      if (wasAir && this.onGround) { KB.game.shake = 5; KB.audio.sfx('hammer'); KB.particles(this.cx, this.bottom, '#c0c0c8', 8, { spread: 2 }); }
      this.grav = P.grav; this.maxFall = P.maxFall;
      if ((inp.pressed('attack') && this.stoneT > 12) || this.stoneT > 900 || inp.pressed('select')) {
        if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
        if (inp.pressed('select')) { this.dropAbility(true); }
        this.setState(this.onGround ? 'idle' : 'fall');
        KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      }
      this.afterPhysics();
    }

    // ---------- 滑鏟 ----------
    startSlide() {
      this.setState('slide'); this.slideT = P.slideFrames; this.vx = this.dir * P.slide; KB.audio.sfx('slide');
      KB.hitbox({ x: this.x, y: this.y, w: this.w + 6, h: this.h, dmg: 2, owner: 'player', type: 'slide', follow: this, ox: -this.w / 2 - 3, oy: 0, life: P.slideFrames, rehit: 0, pierce: true, knock: 2 });
    }
    updateSlide() {
      this.slideT--;
      this.vx = this.dir * P.slide * Math.max(0.35, this.slideT / P.slideFrames);
      this.physics(); this.afterPhysics();
      if (this.slideT <= 0 || this.hitWall) { this.setState(KB.input.down('down') && this.onGround ? 'crouch' : 'idle'); this.vx *= 0.3; }
    }

    // ---------- 游泳 ----------
    updateSwim() {
      const inp = KB.input;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (dirIn) { this.dir = dirIn; this.vx += dirIn * 0.12; } else this.vx *= 0.9;
      this.vx = Math.max(-P.swimSpeed, Math.min(P.swimSpeed, this.vx));
      if (inp.pressed('jump')) { this.vy = P.swimUp; KB.audio.sfx('float'); KB.particles(this.cx, this.cy, '#c0f0ff', 3, { spread: 1, grav: -0.05, life: 15 }); }
      if (inp.down('down')) this.vy += 0.1;
      if (inp.pressed('attack')) {
        KB.audio.sfx('spit');
        KB.shoot({ spr: 'proj_airpuff', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 2.5, dmg: 1, owner: 'player', life: 24, w: 8, h: 8, dir: this.dir, solid: true, fxHit: 'fx_poof' });
      }
      if (inp.pressed('up') && this.onGround) { const d = KB.game.doorAt(this); if (d) { this.enterDoor(d); return; } }
      this.grav = P.swimGrav; this.maxFall = P.swimMaxFall;
      this.physics();
      this.grav = P.grav; this.maxFall = P.maxFall;
      this.afterPhysics();
      if (!this.inWater) { if (this.vy < 0) this.vy = Math.max(this.vy, -3.2); this.setState('jump'); }
    }

    // ---------- 梯子 ----------
    startClimb() { this.setState('climb'); this.vx = 0; this.vy = 0; this.cx = Math.floor(this.cx / 16) * 16 + 8; }
    updateClimb() {
      const inp = KB.input, map = KB.game.map;
      let dy = 0; if (inp.down('up')) dy = -P.climb; if (inp.down('down')) dy = P.climb;
      this.vy = 0; this.vx = 0; this.y += dy;
      this.climbing = dy !== 0; this.onGround = false;
      if (inp.pressed('jump')) { this.setState('fall'); this.vy = -2.5; this.jumped = false; return; }
      const midOn = map.onLadder(this.cx, this.cy), feetOn = map.onLadder(this.cx, this.bottom - 1), belowOn = map.onLadder(this.cx, this.bottom + 1);
      if (dy < 0 && !midOn && !feetOn) {
        // 爬到頂：站在梯子頂端（視為平台）
        this.bottom = Math.floor((this.bottom + 1) / 16) * 16; this.setState('idle'); this.onGround = true; return;
      }
      if (dy > 0) {
        if (!feetOn && !belowOn) { this.setState('fall'); return; }
        if (!belowOn && KB.physics.groundBelow(map, this)) { this.bottom = Math.floor((this.bottom + 1) / 16) * 16; this.setState('idle'); this.onGround = true; return; }
      }
      if (dy === 0 && !midOn && !feetOn && !belowOn) this.setState('fall');
    }

    // ---------- 門 ----------
    enterDoor(door) {
      this.setState('door'); this.doorT = 0; this.doorTarget = door; this.vx = 0; this.cx = door.cx; KB.audio.sfx('door');
    }
    updateDoor() {
      this.doorT++; this.vx = 0; this.physics();
      if (this.doorT === 24) KB.game.useDoor(this.doorTarget);
    }

    // ---------- 受傷 / 死亡 ----------
    hurt(amount, src) {
      if (this.dead || this.invuln > 0 || this.invincibleT > 0) return false;
      if (['dead', 'stone', 'door', 'dance'].includes(this.state)) return false;
      this.hp -= amount;
      KB.audio.sfx('hurt');
      const from = src && src.cx !== undefined ? src.cx : this.cx - this.dir;
      const kdir = this.cx < from ? -1 : 1;
      this.vx = kdir * P.knockback; this.vy = -2.2;
      this.invuln = P.invulnFrames; this.hurtTimer = P.hurtFrames;
      this.mouth = null; this.stopInhale();
      if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
      if (this.ability) this.dropAbility(true);
      KB.fx('fx_hit', this.cx, this.cy + 6);
      if (this.hp <= 0) { this.die(false); return true; }
      this.setState('hurt');
      return true;
    }
    updateHurt() {
      this.hurtTimer--; this.vx *= 0.94; this.physics(); this.afterPhysics();
      if (this.hurtTimer <= 0) this.setState(this.onGround ? 'idle' : 'fall');
    }
    die(fell) {
      if (this.state === 'dead') return;
      if (this.ability) { const d = KB.ABILITIES[this.ability]; if (d && d.onLose) d.onLose(this); }
      this.hp = 0; this.setState('dead'); this.deadT = 0; this.solid = false; this.vx = 0; this.vy = fell ? 0 : -3;
      this.mouth = null; this.ability = null; this.stopInhale();
      if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
      KB.audio.music(null); KB.audio.sfx('die');
      if (fell) this.y = KB.game.cam.y + KB.VIEW_H + 20;
    }
    updateDead() {
      this.deadT++;
      if (this.deadT < 30) { this.vx = 0; this.vy = 0; }
      else { this.vy += 0.15; this.y += this.vy; if (this.deadT === 30) this.vy = -4; }
      if (this.deadT === 110) KB.game.playerDied();
    }

    // ---------- 過關 ----------
    startDance() { this.setState('dance'); this.danceT = 0; this.vx = 0; this.mouth = null; this.stopInhale(); if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; } }

    // ---------- 動畫 ----------
    currentAnim() {
      const s = this.state, d = this.abilityDef;
      switch (s) {
        case 'idle': return this.full ? ['kirby_full_idle', 2] : ['kirby_idle', 1];
        case 'walk': return this.full ? ['kirby_full_walk', 8] : ['kirby_walk', 8];
        case 'run': return ['kirby_run', 12];
        case 'jump': return this.full ? ['kirby_full_jump', 1] : ['kirby_jump', 1];
        case 'fall': if (this.full) return ['kirby_full_jump', 1]; return this.flipT > 0 ? ['kirby_flip', 12] : ['kirby_fall', 1];
        case 'float': return ['kirby_float', 5];
        case 'inhale': return ['kirby_inhale', 8];
        case 'full': return ['kirby_full_idle', 2];
        case 'spit': return ['kirby_spit', 10];
        case 'swallow': return ['kirby_swallow', 10];
        case 'exhale': return ['kirby_exhale', 10];
        case 'slide': return ['kirby_slide', 1];
        case 'crouch': return ['kirby_crouch', 1];
        case 'hurt': return ['kirby_hurt', 1];
        case 'dead': return ['kirby_dead', 8];
        case 'swim': return ['kirby_swim', 4];
        case 'climb': return ['kirby_climb', this.climbing ? 6 : 0];
        case 'door': return ['kirby_door', 6];
        case 'dance': return ['kirby_dance', 6];
        case 'stone': return ['kirby_stone', 1];
        case 'attack': return [(d && d.anim) || ('kirby_attack_' + this.ability), this.attackFps || 12];
      }
      return ['kirby_idle', 1];
    }
    draw(g) {
      if (this.state === 'dead' && this.deadT < 30 && (this.deadT & 2)) return;
      if (this.invuln > 0 && this.state !== 'dead' && (this.invuln & 2)) return; // 閃爍
      const [anim, fps] = this.currentAnim();
      const opts = { flip: this.dir < 0, fps };
      if (this.state === 'idle') opts.frame = (this.stateT % 200) > 190 ? 1 : 0;
      else if (this.state === 'climb' && !this.climbing) opts.frame = 0;
      else if (this.state === 'float') opts.frame = Math.min(3, Math.floor(this.floatAnimT / 5)) ;
      else if (this.state === 'fall' && this.flipT > 0) opts.frame = Math.floor((22 - this.flipT) / 5.5) % 4;
      else if (this.state === 'attack') opts.t = this.stateT / 60;
      else opts.t = this.stateT / 60;
      if (this.invincibleT > 0) { const hues = ['#ffffff', '#ffe040', '#ff80c0', '#80e0ff']; if ((this.stateT >> 1) & 1) opts.tint = hues[(this.stateT >> 2) % 4]; }
      let bob = 0;
      if (this.state === 'float') bob = Math.round(Math.sin(this.t * 6) * 1);
      g.spr(anim, this.cx, this.bottom + bob, opts);
      // 帽子
      if (this.ability && this.state !== 'stone' && this.state !== 'door' && this.state !== 'dead') {
        const d = this.abilityDef; const hat = d && d.hat ? d.hat : 'hat_' + this.ability;
        if (KB.has(hat)) {
          const off = KB.HAT_OFFSET[this.state] || (this.full ? KB.HAT_OFFSET.full : KB.HAT_OFFSET.default);
          const ho = d && d.hatOffset && d.hatOffset[this.state] ? d.hatOffset[this.state] : null;
          const ox = ho ? ho[0] : off[0], oy = ho ? ho[1] : off[1];
          if (oy < 90) g.spr(hat, this.cx + ox * this.dir, this.y + oy + bob, { flip: this.dir < 0, t: this.t, tint: opts.tint });
        }
      }
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)');
    }
  }
  function dt1() { return 1 / 60; }
  KB.Player = Player;
})();
