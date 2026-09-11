// 道具：番茄、食物、1UP、糖果、點數星、能力星、冰塊
(function () {
  class Item extends KB.Entity {
    constructor(x, y) {
      super(x, y); this.type = 'item'; this.w = 12; this.h = 12; this.z = 2;
      this.grav = 0; this.solid = false; this.spr = 'item_star'; this.bob = true; this.score = 100; this.sfx = 'item';
      this.life = -1; this.hurtsPlayer = false; this.inhalable = false;
    }
    update(dt) {
      this.baseUpdate(dt);
      if (this.grav) this.physics();
      if (this.life > 0) { this.life--; if (this.life <= 0) this.dead = true; }
      const p = KB.player;
      if (p && !p.dead && p.state !== 'dead' && this.overlaps(p)) { this.collect(p); }
    }
    collect(p) {
      this.dead = true; KB.audio.sfx(this.sfx);
      KB.game.addScore(this.score, this.cx, this.y);
      KB.particles(this.cx, this.cy, ['#ffffff', '#ffe040'], 5, { spread: 1.2 });
      this.onCollect(p);
    }
    onCollect(p) { }
    draw(g) {
      const bob = this.bob ? Math.round(Math.sin(this.t * 4) * 1.5) : 0;
      if (this.life > 0 && this.life < 90 && (Math.floor(this.t * 60) & 2)) return;
      g.spr(this.spr, this.cx, this.bottom + bob, { t: this.t });
    }
  }
  KB.Item = Item;

  KB.ITEMS.tomato = class extends Item {
    constructor(x, y) { super(x, y); this.spr = 'item_tomato'; this.name = 'tomato'; this.score = 500; this.w = 14; this.h = 14; }
    onCollect(p) { p.hp = p.maxHp; KB.fx('fx_sparkle', p.cx, p.cy - 8); }
  };
  KB.ITEMS.food = class extends Item {
    constructor(x, y, kind) { super(x, y); this.kind = kind !== undefined ? kind : Math.floor(Math.random() * 4); this.spr = 'item_food'; this.name = 'food'; this.score = 300; }
    onCollect(p) { p.hp = Math.min(p.maxHp, p.hp + 2); }
    draw(g) { const bob = this.bob ? Math.round(Math.sin(this.t * 4) * 1.5) : 0; g.spr(this.spr, this.cx, this.bottom + bob, { frame: this.kind }); }
  };
  KB.ITEMS.oneup = class extends Item {
    constructor(x, y) { super(x, y); this.spr = 'item_1up'; this.name = 'oneup'; this.score = 0; this.sfx = '1up'; }
    onCollect(p) { KB.game.lives++; KB.game.toast('1UP!'); }
  };
  KB.ITEMS.candy = class extends Item {
    constructor(x, y) { super(x, y); this.spr = 'item_candy'; this.name = 'candy'; this.score = 1000; }
    onCollect(p) { p.invincibleT = 660; KB.audio.music('invincible'); }
  };
  KB.ITEMS.pointstar = class extends Item {
    constructor(x, y, opts) {
      super(x, y); this.spr = 'item_star'; this.name = 'pointstar'; this.score = 10; this.w = 8; this.h = 8; this.bob = false;
      opts = opts || {};
      if (opts.pop) { this.grav = 0.2; this.solid = true; this.vx = (Math.random() - 0.5) * 3; this.vy = -3 - Math.random() * 2; this.life = 300; this.bounce = true; }
    }
    update(dt) {
      const wasGround = this.onGround;
      super.update(dt);
      if (this.grav && this.onGround && this.bounce) { this.vy = -1.5; this.vx *= 0.7; if (Math.abs(this.vx) < 0.05) { this.grav = 0; this.solid = false; this.vy = 0; } }
      if (this.grav && this.hitWall) this.vx *= -0.5;
    }
  };
  // 能力星：丟棄 / 受傷時掉出；碰到或吸入可取回能力
  KB.ITEMS.abilitystar = class extends Item {
    constructor(x, y, ability, dir) {
      super(x, y); this.spr = 'item_abilitystar'; this.name = 'abilitystar'; this.ability = ability; this.w = 14; this.h = 14; this.bob = false;
      this.grav = 0.18; this.solid = true; this.maxFall = 3; this.vx = (dir || 1) * 1.6; this.vy = -3.5; this.life = 420; this.score = 0;
      this.inhalable = true; this.graceT = 30; this.bounces = 0;
    }
    update(dt) {
      this.baseUpdate(dt);
      if (this.beingInhaled) return;
      this.physics();
      if (this.onGround) { this.bounces++; this.vy = this.bounces < 6 ? -2.6 : 0; if (this.bounces >= 6) this.vx *= 0.5; }
      if (this.hitWall) { this.vx *= -1; this.dir *= -1; }
      if (this.fellOut) this.dead = true;
      if (this.life > 0) { this.life--; if (this.life <= 0) this.dead = true; }
      if (this.graceT > 0) this.graceT--;
      const p = KB.player;
      if (this.graceT === 0 && p && p.state !== 'dead' && p.state !== 'hurt' && !p.ability && this.overlaps(p)) { this.dead = true; p.giveAbility(this.ability); }
    }
    onInhaled(p) { this.dead = true; p.mouth = { ability: this.ability, name: 'abilitystar', score: 0 }; }
    pullTo(px, py, s) { const dx = px - this.cx, dy = py - this.cy, d = Math.max(1, Math.hypot(dx, dy)); this.x += dx / d * s; this.y += dy / d * s; }
    draw(g) {
      if (this.life > 0 && this.life < 90 && (Math.floor(this.t * 60) & 2)) return;
      const d = KB.ABILITIES[this.ability]; const col = d && d.color ? d.color : '#ffe040';
      g.spr(this.spr, this.cx, this.bottom, { t: this.t, fps: 6 });
      const icon = 'ui_ability_' + this.ability + '_mini';
      if (KB.has(icon)) g.spr(icon, this.cx, this.cy + 4, {});
      else g.rect(this.cx - 2, this.cy - 2, 4, 4, col);
    }
  };
  // 冰塊：冰凍敵人死亡後滑出，撞到其他敵人造成傷害
  KB.IceBlock = class extends KB.Entity {
    constructor(x, y, dir) {
      super(x, y); this.type = 'proj'; this.w = 14; this.h = 14; this.owner = 'player'; this.dmg = 4; this.vx = dir * 3; this.life = 90; this.spr = 'proj_iceblock'; this.name = 'iceblock';
      this.hurtsPlayer = false; this.destructible = false; this.kind = 'iceblock'; this.pierce = true; this.hitSet = new Set(); this.breakBlocks = true; this.knock = 2;
    }
    update(dt) {
      this.baseUpdate(dt); this.physics(); this.life--;
      if (this.hitWall || this.life <= 0 || this.fellOut) { this.dead = true; KB.particles(this.cx, this.cy, '#c0f0ff', 8, { spread: 2 }); KB.audio.sfx('block'); }
    }
    draw(g) { g.spr(this.spr, this.cx, this.bottom, { t: this.t }); }
    hurt() { return false; }
  };
})();
