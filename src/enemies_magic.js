// 魔法系敵人（Round 5 變身大爆發）
//   wizzle    小巫師   → mage     ：瞬移 + 丟火球
//   tiktok    時鐘怪   → time     ：張開時間場讓卡比短暫變慢
//   gravitron 浮球     → gravity  ：漂浮並把卡比拉向自己
//   mimi      模仿者   → clone    ：模仿卡比的移動，靠近時撲擊
// 依賴：KB.Baddie（enemies.js）、KB.hitbox / KB.shoot / KB.fx / KB.particles
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const playerAlive = () => !!(KB.player && !KB.player.dead && KB.player.state !== 'dead');
  function sfx(name, fallback) {
    try {
      const A = KB.audio; if (!A || !A.sfx) return;
      if (A.SFX_NAMES && A.SFX_NAMES.indexOf(name) < 0) { if (fallback) A.sfx(fallback); return; }
      A.sfx(name);
    } catch (e) { }
  }
  function V(fn) {
    try {
      if (!KB.VFX || typeof KB.VFX[fn] !== 'function') return null;
      return KB.VFX[fn].apply(KB.VFX, Array.prototype.slice.call(arguments, 1));
    } catch (e) { return null; }
  }
  const B = () => KB.Baddie;

  // =====================================================================
  //  Wizzle 小巫師（mage）：走兩步 → 丟火球 → 瞬移到卡比另一側
  // =====================================================================
  class Wizzle extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'wizzle'; this.spr = 'wizzle_walk'; this.w = 12; this.h = 18;
      this.speed = 0.35; this.ability = 'mage'; this.hp = 2; this.maxHp = 2; this.score = 400; this.cool = 50;
      this.blinks = 0; this.hidden = false;
    }
    get castCD() { return this.tough ? 70 : 110; }
    think() {
      if (this.state === 'blink') {
        this.vx = 0; this.vy = 0;
        if (this.stateT === 1) {
          KB.particles(this.cx, this.cy, ['#a860f0', '#d8b0ff', '#ffffff'], 12, { spread: 2.4, grav: 0, life: 18 });
          KB.fx('fx_poof', this.cx, this.cy + 6);
          V('ring', this.cx, this.cy, { r0: 2, r1: 24, frames: 12, color: '#a860f0', width: 2 });
          sfx('magic_circle', 'swallow');
          this.hidden = true;
        }
        if (this.stateT === 16) {
          // 落到卡比的另一側（避免卡進牆裡：撞牆就退回原位）
          const p = KB.player, map = KB.game.map;
          if (p) {
            const side = p.cx < this.cx ? 1 : -1;
            const nx = clamp(p.cx + side * 46 - this.w / 2, 8, map.w * KB.TILE - this.w - 8);
            const ox = this.x, oy = this.y;
            this.x = nx; this.y = p.cy - this.h;
            if (map.isSolidPx(this.cx, this.cy)) { this.x = ox; this.y = oy; }
            this.facePlayer();
          }
          this.hidden = false;
          this.blinks++;
          KB.particles(this.cx, this.cy, ['#a860f0', '#d8b0ff', '#ffffff'], 14, { spread: 2.4, grav: 0, life: 18 });
          KB.fx('fx_sparkle', this.cx, this.cy);
        }
        if (this.stateT >= 26) { this.setState('walk'); this.setSpr('wizzle_walk'); this.cool = this.castCD; }
        return;
      }
      if (this.state === 'cast') {
        this.vx = 0;
        if (this.stateT === 12) {
          this.facePlayer();
          KB.shoot({ spr: 'proj_magefire', x: this.cx + this.dir * 8, y: this.cy - 2, vx: this.dir * 2.2, vy: -1.1, dmg: 1, owner: 'enemy',
            life: 150, w: 10, h: 10, grav: 0.09, solid: true, pierce: false, type: 'fire', dir: this.dir, fxHit: 'fx_fire', trail: '#ff9020',
            inhalable: true, ownerEnt: this, fps: 12, breakBlocks: false });
          KB.particles(this.cx + this.dir * 8, this.cy - 2, ['#ffe040', '#ff9020', '#a860f0'], 6, { spread: 1.2, grav: 0, life: 14 });
          sfx('fireball', 'fire');
        }
        if (this.stateT >= 30) {
          this.setState(this.blinks % 2 === 0 && this.canSee(160, 80) ? 'blink' : 'walk');
          this.setSpr('wizzle_walk'); this.cool = this.castCD;
        }
        return;
      }
      const see = this.notice(120, 64);
      if (see && this.onGround) { this.facePlayer(); this.vx = 0; } else this.walk();
      if (this.cool <= 0 && this.canSee(140, 72)) { this.facePlayer(); this.vx = 0; this.setState('cast'); this.setSpr('wizzle_attack'); }
    }
    draw(g) {
      if (this.hidden) {
        if (Math.floor(this.t * 60) % 3 === 0) KB.particles(this.cx, this.cy, '#a860f0', 1, { spread: 0.6, grav: 0, life: 10, up: 0, size: 1 });
        return;
      }
      super.draw(g);
    }
  }

  // =====================================================================
  //  Tik-Tok 時鐘怪（time）：原地擺動；卡比靠近就張開時間場，讓卡比短暫變慢
  // =====================================================================
  class TikTok extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'tiktok'; this.spr = 'tiktok_walk'; this.w = 14; this.h = 16;
      this.speed = 0.25; this.ability = 'time'; this.hp = 3; this.maxHp = 3; this.score = 400; this.cool = 60;
      this.slowP = 0;   // 對卡比的減速剩餘幀數
    }
    get fieldCD() { return this.tough ? 110 : 160; }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        if (this.stateT === 1) {
          V('worldTint', '#b090e8', 0.18, 90);
          V('circle', this.cx, this.cy, { r: 40, frames: 90, color: '#a860f0', spin: 0.05 });
          KB.particles(this.cx, this.cy, ['#d8b0ff', '#a860f0', '#ffffff'], 14, { spread: 2.6, grav: 0, life: 24 });
          KB.fx('fx_gear', this.cx, this.cy - 12, { life: 40 });
          sfx('slowmo', 'charge');
          this.slowP = 90;
        }
        if (this.stateT % 6 === 0) KB.particles(this.cx + rnd(-20, 20), this.cy + rnd(-16, 16), ['#d8b0ff', '#a860f0'], 1, { spread: 0.3, grav: 0, life: 16, up: 0, size: 1 });
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('tiktok_walk'); this.cool = this.fieldCD; }
        return;
      }
      this.walk();
      if (this.cool <= 0 && this.canSee(72, 40)) { this.facePlayer(); this.vx = 0; this.setState('attack'); this.setSpr('tiktok_attack'); }
    }
    update(dt) {
      super.update(dt);
      // 時間場：卡比在範圍內時每幀被拖慢（敵人在玩家之後更新，直接改寫 vx 有效）
      if (this.slowP > 0 && !this.dead) {
        this.slowP--;
        const p = KB.player;
        if (p && playerAlive() && Math.abs(p.cx - this.cx) < 96 && Math.abs(p.cy - this.cy) < 72) {
          p.vx *= 0.5;
          if (KB.game && KB.game.frame % 8 === 0) KB.particles(p.cx + rnd(-6, 6), p.cy + rnd(-8, 8), ['#d8b0ff', '#a860f0'], 1, { spread: 0.3, grav: 0, life: 14, up: 0.2, size: 1 });
        }
      }
    }
    onReset() { super.onReset(); this.slowP = 0; }
  }

  // =====================================================================
  //  Gravitron 浮球（gravity）：漂浮上下擺動，靠近時把卡比拉過來
  // =====================================================================
  class Gravitron extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'gravitron'; this.spr = 'gravitron_walk'; this.w = 14; this.h = 14;
      this.ability = 'gravity'; this.hp = 3; this.maxHp = 3; this.score = 450; this.cool = 50;
      this.grav = 0; this.solid = false; this.turnAtEdge = false; this.turnAtWall = false;
      this.y0 = y; this.phase = Math.random() * Math.PI * 2; this.pullT = 0;
    }
    get pullCD() { return this.tough ? 90 : 140; }
    think() {
      this.phase += 0.05;
      if (this.state === 'attack') {
        this.vx = 0; this.vy = Math.sin(this.phase) * 0.25;
        if (this.stateT === 1) {
          V('ring', this.cx, this.cy, { r0: 4, r1: 90, frames: 16, color: '#d8b0ff', width: 2 });
          KB.particles(this.cx, this.cy, ['#a860f0', '#d8b0ff'], 12, { spread: 2.4, grav: 0, life: 20 });
          sfx('gravity_lift', 'beam');
          this.pullT = 60;
        }
        if (this.stateT >= 64) { this.setState('walk'); this.setSpr('gravitron_walk'); this.cool = this.pullCD; }
        return;
      }
      // 慢速追蹤 + 上下漂浮
      const p = KB.player;
      if (p && playerAlive()) {
        this.facePlayer();
        const dx = p.cx - this.cx;
        this.vx = clamp(dx * 0.012, -0.7, 0.7) * (this.exK || 1);
      } else this.vx = 0;
      this.vy = Math.sin(this.phase) * 0.5 + (this.y0 - this.y) * 0.01;
      if (this.cool <= 0 && this.canSee(104, 72)) { this.setState('attack'); this.setSpr('gravitron_attack'); }
    }
    update(dt) {
      super.update(dt);
      if (this.pullT > 0 && !this.dead) {
        this.pullT--;
        const p = KB.player;
        if (p && playerAlive() && p.state !== 'stone') {
          const dx = this.cx - p.cx, dy = this.cy - p.cy, d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          if (d < 104) {
            p.vx += dx / d * 0.22;
            if (!p.onGround) p.vy += dy / d * 0.14;
            if (KB.game && KB.game.frame % 6 === 0) KB.particles(p.cx, p.cy, '#d8b0ff', 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
          }
        }
      }
    }
    onReset() { super.onReset(); this.pullT = 0; this.y0 = this.startY; }
  }

  // =====================================================================
  //  Mimi 模仿者（clone）：模仿卡比的移動方向；貼近時撲擊
  // =====================================================================
  class Mimi extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'mimi'; this.spr = 'mimi_walk'; this.w = 12; this.h = 15;
      this.speed = 0.6; this.ability = 'clone'; this.hp = 2; this.maxHp = 2; this.score = 350; this.cool = 40;
      this.copyT = 0;
    }
    think() {
      if (this.state === 'lunge') {
        if (this.stateT === 1) {
          this.facePlayer();
          this.vx = this.dir * 2.2 * (this.exK || 1); this.vy = -2.6; this.onGround = false;
          this.hitbox = KB.hitbox({ x: 0, y: 0, w: 16, h: 14, dmg: 1, owner: 'enemy', type: 'clone', follow: this, ox: -8, oy: 0,
            flipWithOwner: false, life: 26, rehit: 12, breakBlocks: false });
          KB.particles(this.cx, this.bottom, ['#d8b0ff', '#ffffff'], 6, { spread: 1.4, grav: 0.05, life: 14, up: 0.6 });
          sfx('clone_rush', 'jump');
        }
        if (this.onGround && this.stateT > 6) {
          this.killHitbox();
          this.setState('walk'); this.setSpr('mimi_walk'); this.cool = 70; this.vx = 0;
        }
        return;
      }
      const p = KB.player;
      const see = this.notice(112, 56);
      if (see && p) {
        // 模仿：跟著卡比往同一個方向走（像照鏡子一樣）
        this.copyT++;
        const pd = p.vx > 0.15 ? 1 : p.vx < -0.15 ? -1 : 0;
        if (pd) {
          this.dir = -pd;                       // 面向卡比的反方向＝與卡比同向移動時的鏡像
          this.vx = pd * this.speed * 1.2 * (this.exK || 1);
          if (this.onGround && (KB.physics.wallAhead(KB.game.map, this) || KB.physics.edgeAhead(KB.game.map, this))) this.vx = 0;
        } else { this.vx = 0; this.facePlayer(); }
        if (this.cool <= 0 && this.playerDist() < 56 && this.onGround) { this.setState('lunge'); this.setSpr('mimi_attack'); return; }
      } else {
        this.copyT = 0;
        this.walk();
      }
    }
    onReset() { super.onReset(); this.copyT = 0; }
  }

  Object.assign(KB.ENEMIES, { wizzle: Wizzle, tiktok: TikTok, gravitron: Gravitron, mimi: Mimi });
  KB.MagicEnemies = { Wizzle, TikTok, Gravitron, Mimi };
})();
