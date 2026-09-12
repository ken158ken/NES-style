// 變身系敵人（Round 5 變身大爆發）
//   bigbloom 巨大花（→ giant）／ drako 小龍（→ dragon）／ bolt 機器兵（→ mech）／ boodee 幽靈迪（→ ghost）
// 依賴：KB.Baddie（enemies.js）、KB.physics（tilemap.js）、KB.hitbox / KB.shoot / KB.fx / KB.particles、KB.VFX（選用）
(function () {
  'use strict';
  const T = KB.TILE;
  const Baddie = KB.Baddie;
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const vf = function (fn) {
    try {
      if (KB.VFX && typeof KB.VFX[fn] === 'function') return KB.VFX[fn].apply(KB.VFX, Array.prototype.slice.call(arguments, 1));
    } catch (e) { }
    return null;
  };
  const shake = n => { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); };

  // =====================================================================
  //  Bigbloom 巨大花（吞下 → giant）
  //  行為：慢慢走；察覺玩家後張開花瓣噴出「膨脹花粉」（前方判定 + 花粉粒子）。
  // =====================================================================
  class Bigbloom extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'bigbloom'; this.spr = 'bigbloom_walk';
      this.w = 20; this.h = 26;
      this.hp = 4; this.maxHp = 4; this.speed = 0.35; this.score = 500;
      this.ability = 'giant'; this.cool = 60;
      this.dropTable = { pointstar: 0.3, food: 0.08 };
    }
    onReset() { super.onReset(); this.setSpr('bigbloom_walk'); }
    /** 附身時按 X 會呼叫（幽靈能力） */
    attack() { if (this.state !== 'bloom') { this.setState('bloom'); this.setSpr('bigbloom_attack'); } }
    think() {
      if (this.state === 'bloom') {
        this.vx = 0;
        if (this.stateT === 10) {
          this.hitbox = KB.hitbox({
            x: 0, y: 0, w: 40, h: 22, dmg: 1, owner: 'enemy', type: 'pollen', follow: this,
            ox: 6, oy: 2, life: 42, rehit: 14, breakBlocks: false,
          });
          sfx('inhale');
          vf('ring', this.cx, this.cy, { r0: 4, r1: 34, frames: 18, color: '#ff7ab0', width: 2 });
        }
        if (this.stateT >= 10 && this.stateT < 50 && this.stateT % 3 === 0) {
          KB.particles(this.cx + this.dir * (14 + (this.stateT % 16)), this.cy + 2, ['#ffd0e8', '#ff7ab0', '#fff0a0'], 2,
            { spread: 0.8, grav: 0.02, life: 22, up: 0.2, vx: this.dir * 1.1, size: 2 });
        }
        if (this.stateT >= 58) { this.killHitbox(); this.setState('walk'); this.setSpr('bigbloom_walk'); this.cool = 120; }
        return;
      }
      this.setSpr('bigbloom_walk');
      const see = this.notice(104, 44);
      if (see && this.onGround && this.playerDist() > 30) this.chase(this.speed * this.alertK);
      else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(80, 30)) {
        this.facePlayer(); this.vx = 0; this.setState('bloom'); this.setSpr('bigbloom_attack');
      }
    }
  }

  // =====================================================================
  //  Drako 小龍（吞下 → dragon）
  //  行為：無重力正弦飛行；察覺玩家後靠近並噴出小火球。
  // =====================================================================
  class Drako extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'drako'; this.spr = 'drako_fly';
      this.w = 16; this.h = 14;
      this.grav = 0; this.solid = false;
      this.hp = 3; this.maxHp = 3; this.speed = 0.9; this.score = 420;
      this.element = 'fire'; this.weak = ['ice']; this.resist = ['fire'];   // 火屬性：怕冰、抗火
      this.ability = 'dragon'; this.cool = 60; this.state = 'fly';
      this.phase = Math.random() * Math.PI * 2;
    }
    onReset() { super.onReset(); this.grav = 0; this.solid = false; this.setSpr('drako_fly'); this.setState('fly'); }
    attack() { if (this.state !== 'breath') { this.setState('breath'); this.setSpr('drako_attack'); } }
    think() {
      this.phase += 0.08;
      if (this.state === 'breath') {
        this.vx *= 0.85; this.vy = Math.cos(this.phase) * 0.3;
        if (this.stateT === 12) {
          const dx = this.playerDx(), dy = this.playerDy(), d = Math.max(1, Math.hypot(dx, dy));
          KB.shoot({
            spr: 'proj_drakofire', x: this.cx + this.dir * 10, y: this.cy + 1,
            vx: dx / d * 2.4, vy: dy / d * 2.4, dmg: 1, owner: 'enemy', life: 110, w: 8, h: 8,
            grav: 0, solid: true, pierce: false, inhalable: true, type: 'fire', fxHit: 'fx_fire',
            breakBlocks: false, dir: this.dir, ownerEnt: this,
          });
          sfx('fire');
          KB.particles(this.cx + this.dir * 10, this.cy, ['#ffe040', '#ff9020', '#ff4010'], 5, { spread: 1.2, grav: -0.03, life: 16 });
        }
        if (this.stateT >= 34) { this.setState('fly'); this.setSpr('drako_fly'); this.cool = 95; }
        return;
      }
      this.setSpr('drako_fly');
      const map = KB.game.map;
      if (this.notice(130, 96)) {
        const p = KB.player, tx = p.cx - this.dir * 34, ty = p.cy - 26;
        const ex = tx - this.cx, ey = ty - this.cy, d = Math.hypot(ex, ey);
        if (d > 6) { this.vx = clamp(ex * 0.045, -1.4, 1.4); this.vy = clamp(ey * 0.045, -1.2, 1.2) + Math.cos(this.phase) * 0.25; }
        else { this.vx *= 0.85; this.vy = Math.cos(this.phase) * 0.35; }
        if (Math.abs(this.playerDx()) > 4) this.facePlayer();
        if (this.cool <= 0) { this.setState('breath'); this.setSpr('drako_attack'); }
      } else {
        if (this.x <= 0 && this.dir < 0) this.dir = 1;
        if (this.x + this.w >= map.pw && this.dir > 0) this.dir = -1;
        if (KB.physics.wallAhead(map, this)) this.dir *= -1;
        this.vx = this.dir * this.speed;
        this.vy = Math.cos(this.phase) * 0.7;
      }
    }
  }

  // =====================================================================
  //  Bolt 機器兵（吞下 → mech）
  //  行為：巡邏；察覺玩家後停下瞄準 → 射出雷射線（KB.VFX.line + 雷射彈）。
  // =====================================================================
  class Bolt extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'bolt'; this.spr = 'bolt_walk';
      this.w = 14; this.h = 18;
      this.hp = 3; this.maxHp = 3; this.speed = 0.5; this.score = 400;
      this.ability = 'mech'; this.cool = 70;
      this.element = 'metal'; this.weak = ['spark'];   // 機械：怕電
    }
    onReset() { super.onReset(); this.setSpr('bolt_walk'); }
    attack() { if (this.state !== 'aim') { this.setState('aim'); this.setSpr('bolt_attack'); } }
    think() {
      if (this.state === 'aim') {
        this.vx = 0;
        if (this.stateT === 4) sfx('charge');
        if (this.stateT > 4 && this.stateT < 18 && this.stateT % 4 === 0) {
          KB.particles(this.cx + this.dir * 9, this.cy - 2, ['#78e8ff', '#ffffff'], 2, { spread: 0.5, grav: 0, life: 12, size: 1 });
        }
        if (this.stateT === 20) {
          const x0 = this.cx + this.dir * 9, y0 = this.cy - 2;
          vf('line', x0, y0, x0 + this.dir * 130, y0, { color: '#78e8ff', frames: 12, width: 3 });
          KB.shoot({
            spr: 'proj_boltbeam', x: x0, y: y0, vx: this.dir * 3.4, vy: 0, dmg: 1, owner: 'enemy',
            life: 90, w: 10, h: 5, grav: 0, solid: true, pierce: false, inhalable: true,
            type: 'beam', fxHit: 'fx_hit', breakBlocks: false, dir: this.dir, ownerEnt: this,
          });
          sfx('beam');
          KB.particles(x0, y0, ['#78e8ff', '#ffffff'], 5, { spread: 1.2, grav: 0, life: 14, vx: this.dir * 1.2, size: 1 });
        }
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('bolt_walk'); this.cool = 110; }
        return;
      }
      this.setSpr('bolt_walk');
      const see = this.notice(120, 36);
      if (see && this.onGround) {
        this.facePlayer();
        if (this.playerDist() > 64) this.chase(this.speed * this.alertK); else this.vx = 0;
      } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(140, 26)) {
        this.facePlayer(); this.vx = 0; this.setState('aim'); this.setSpr('bolt_attack');
      }
    }
    die(src) {
      if (this.dead) return;
      shake(3);
      KB.particles(this.cx, this.cy, ['#e8e8f0', '#9aa4b4', '#5c6676', '#ffe040'], 10, { spread: 2.4, life: 26 });
      super.die(src);
    }
  }

  // =====================================================================
  //  Boo Dee 幽靈迪（吞下 → ghost）
  //  行為：無視地形直線飄向玩家（會穿牆）；靠得夠近就張嘴撲擊。
  // =====================================================================
  class BooDee extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'boodee'; this.spr = 'boodee_float';
      this.w = 14; this.h = 14;
      this.grav = 0; this.solid = false;          // 穿牆
      this.hp = 2; this.maxHp = 2; this.speed = 0.6; this.score = 380;
      this.ability = 'ghost'; this.cool = 60; this.state = 'float';
      this.element = 'ghost'; this.weak = ['spark']; this.resist = ['physical'];   // 幽靈：物理打不痛、怕電
      this.phase = Math.random() * Math.PI * 2;
    }
    onReset() { super.onReset(); this.grav = 0; this.solid = false; this.setSpr('boodee_float'); this.setState('float'); }
    attack() { if (this.state !== 'lunge') { this.setState('lunge'); this.setSpr('boodee_attack'); } }
    think() {
      this.phase += 0.1;
      if (this.state === 'lunge') {
        if (this.stateT === 1) {
          const dx = this.playerDx(), dy = this.playerDy(), d = Math.max(1, Math.hypot(dx, dy));
          this.vx = dx / d * 2.4; this.vy = dy / d * 2.4;
          sfx('ghost_wail');
        }
        this.vx *= 0.95; this.vy *= 0.95;
        if (this.stateT % 4 === 0) KB.particles(this.cx, this.cy, ['#ffffff', '#c4ccec'], 1, { spread: 0.4, grav: -0.02, life: 16, size: 1 });
        if (this.stateT >= 34) { this.setState('float'); this.setSpr('boodee_float'); this.cool = 100; }
        return;
      }
      this.setSpr('boodee_float');
      const map = KB.game.map;
      if (this.notice(140, 110)) {
        const p = KB.player;
        const ex = p.cx - this.cx, ey = p.cy - 8 - this.cy, d = Math.hypot(ex, ey) || 1;
        this.vx = clamp(ex / d * this.speed * this.alertK * 1.6, -1.5, 1.5);
        this.vy = clamp(ey / d * this.speed * this.alertK * 1.6, -1.2, 1.2) + Math.cos(this.phase) * 0.2;
        this.facePlayer();
        if (this.cool <= 0 && d < 72) { this.setState('lunge'); this.setSpr('boodee_attack'); }
      } else {
        if (this.x <= 0 && this.dir < 0) this.dir = 1;
        if (this.x + this.w >= map.pw && this.dir > 0) this.dir = -1;
        this.vx = this.dir * this.speed * 0.7;
        this.vy = Math.cos(this.phase) * 0.5;
      }
    }
    draw(g) {
      // 幽靈：半透明 + 微微上下飄
      const o = { t: this.beingInhaled ? 0 : this.animT / 60, alpha: 0.78 };
      if (this.freezeT > 0) { this.drawFrozen(g); return; }
      const wx = KB.inhaleWobble(this);
      this.drawGlow(g);
      g.spr(this.spr, this.cx + wx, this.bottom + this.bob + (this.wobY || 0), this.sprOpts(o));
    }
  }

  Object.assign(KB.ENEMIES, { bigbloom: Bigbloom, drako: Drako, bolt: Bolt, boodee: BooDee });
  KB.FORM_ENEMIES = { Bigbloom, Drako, Bolt, BooDee };
})();
