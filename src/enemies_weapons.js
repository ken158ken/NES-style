// 武器系敵人（給 gunner / ninja / blade / bow 能力）（Round 5 變身大爆發）
// 全部繼承 KB.Baddie（enemies.js），沿用 notice() / chase() / tier / Extra 倍率。
(function () {
  'use strict';
  const Baddie = KB.Baddie;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  const shake = n => { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); if (KB.VFX && KB.VFX.shake) { try { KB.VFX.shake(n); } catch (e) { } } };
  function vfx(fn) {
    const a = Array.prototype.slice.call(arguments, 1);
    try { if (KB.VFX && typeof KB.VFX[fn] === 'function') KB.VFX[fn].apply(KB.VFX, a); } catch (e) { }
  }
  const playerAlive = () => !!(KB.player && !KB.player.dead && KB.player.state !== 'dead');
  const solidAt = (x, y) => { const m = KB.game && KB.game.map; return m ? m.isSolidPx(x, y) : true; };

  // =====================================================================
  //  Pistolo 手槍海盜 —— 給 gunner
  //  走路巡邏；察覺卡比後停下正對，掏槍射出直線子彈（w3 起連射 2 發、射程更遠）
  // =====================================================================
  class Pistolo extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'pistolo'; this.spr = 'pistolo_walk'; this.w = 14; this.h = 16;
      this.speed = 0.5; this.ability = 'gunner'; this.score = 350; this.hp = 2; this.maxHp = 2; this.cool = 70;
    }
    get range() { return this.tough ? 140 : 110; }
    get shootCD() { return this.tough ? 70 : 110; }
    fire() {
      const x = this.cx + this.dir * 9, y = this.cy - 2;
      KB.shoot({
        spr: 'proj_bullet', x: x, y: y, vx: this.dir * 3.4, vy: 0, dmg: 1, owner: 'enemy',
        life: 110, w: 6, h: 5, grav: 0, solid: true, pierce: false, type: 'gun', dir: this.dir,
        fxHit: 'fx_hit', breakBlocks: false, trail: '#fff8c0',
      });
      KB.fx('fx_muzzle', x + this.dir * 3, y, { flip: this.dir < 0 });
      KB.particles(x, y, ['#fff8c0', '#ff9028'], 3, { spread: 1.4, grav: 0, life: 8, up: 0, size: 1 });
      vfx('line', x, y, x + this.dir * 60, y, { color: '#fff8c0', width: 1, frames: 3 });
      shake(1); sfx('gun');
    }
    think() {
      if (this.state === 'shoot') {
        this.vx = 0;
        if (this.stateT === 10) this.fire();
        if (this.tough && this.stateT === 24) this.fire();
        if (this.stateT >= (this.tough ? 38 : 30)) { this.setState('walk'); this.setSpr('pistolo_walk'); this.cool = this.shootCD; }
        return;
      }
      this.setSpr('pistolo_walk');
      const see = this.notice(this.range, 44);
      if (see && this.onGround) { this.facePlayer(); this.vx = 0; } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(this.range, 40)) {
        this.facePlayer(); this.vx = 0; this.setState('shoot'); this.setSpr('pistolo_attack');
      }
    }
    pickFrame() { return this.state === 'shoot' ? (this.stateT < 8 ? 0 : 1) : undefined; }
  }

  // =====================================================================
  //  Kage Dee 影忍 —— 給 ninja
  //  w1~w2：原地丟手裡劍；w3 起：消失 → 出現在卡比背後 → 丟手裡劍
  // =====================================================================
  class KageDee extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'kagedee'; this.spr = 'kagedee_walk'; this.w = 14; this.h = 16;
      this.speed = 0.7; this.ability = 'ninja'; this.score = 400; this.hp = 2; this.maxHp = 2; this.cool = 80;
      this.hidden = false;
    }
    onReset() { super.onReset(); this.reveal(); }
    conceal() { this.hidden = true; this.inhalable = false; this.hurtsPlayer = false; this.vx = 0; }
    reveal() { this.hidden = false; this.inhalable = true; this.hurtsPlayer = true; }
    puff() {
      KB.fx('fx_poof', this.cx, this.cy + 6);
      KB.particles(this.cx, this.cy, ['#ffffff', '#c8c8d0', '#5460a0'], 8, { spread: 2, grav: -0.02, life: 16, up: 0.2, size: 1 });
      vfx('ring', this.cx, this.cy, { r0: 2, r1: 18, frames: 10, color: '#b070f0', width: 1 });
      sfx('teleport');
    }
    toss() {
      const s = KB.shoot({
        spr: 'proj_shuriken', x: this.cx + this.dir * 8, y: this.cy - 2, vx: this.dir * 2.8, vy: 0,
        dmg: 1, owner: 'enemy', life: 150, w: 9, h: 9, grav: 0, solid: true, pierce: false,
        type: 'shuriken', dir: this.dir, fxHit: 'fx_hit', breakBlocks: false, inhalable: true,
        rotSpeed: 0.45 * this.dir, trail: '#b070f0',
      });
      // 吸入敵方手裡劍也能得到 ninja（沿用 Sir Kibble 刀刃的規則）
      s.onInhaled = function (p) { this.dead = true; p.mouth = { ability: 'ninja', name: 'shuriken', score: 10 }; };
      vfx('sparkTrail', s, { color: '#eef2ff', every: 3, life: 8 });
      sfx('shuriken');
      return s;
    }
    behind() {
      const p = KB.player; if (!p) return false;
      const dir = p.dir, tx = p.cx - dir * 24 - this.w / 2, ty = p.bottom;
      if (solidAt(tx + 2, ty - 4) || solidAt(tx + this.w - 2, ty - 4) || solidAt(tx + this.w / 2, ty - this.h + 2)) return false;
      this.x = tx; this.bottom = ty; this.vx = 0; this.vy = 0; this.dir = dir;
      return true;
    }
    think() {
      if (this.state === 'vanish') {
        this.vx = 0;
        if (this.stateT === 1) { this.puff(); this.conceal(); }
        if (this.stateT === 16) this.behind();
        if (this.stateT >= 24) { this.reveal(); this.puff(); this.facePlayer(); this.setState('throw'); this.setSpr('kagedee_attack'); }
        return;
      }
      if (this.state === 'throw') {
        this.vx = 0;
        if (this.stateT === 8) this.toss();
        if (this.stateT >= 28) { this.setState('walk'); this.setSpr('kagedee_walk'); this.cool = this.tough ? 90 : 130; }
        return;
      }
      this.setSpr('kagedee_walk');
      const see = this.notice(120, 56);
      if (see && this.onGround) this.chase(this.speed * this.alertK); else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(140, 64)) {
        this.facePlayer(); this.vx = 0;
        if (this.tough) { this.setState('vanish'); }
        else { this.setState('throw'); this.setSpr('kagedee_attack'); }
      }
    }
    pickFrame() { return this.state === 'throw' ? (this.stateT < 8 ? 0 : 1) : undefined; }
    draw(g) { if (this.hidden) { KB.particles(this.cx, this.cy, ['#5460a0'], 1, { spread: 0.4, grav: 0, life: 6, up: 0, size: 1 }); return; } super.draw(g); }
  }

  // =====================================================================
  //  Ronin Dee 浪人 —— 給 blade
  //  拔刀前有 30 幀蹲姿預警（刀柄閃光 + 火花），之後往前居合突進
  // =====================================================================
  class RoninDee extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'ronin'; this.spr = 'ronin_walk'; this.w = 14; this.h = 16;
      this.speed = 0.45; this.ability = 'blade'; this.score = 500; this.hp = 3; this.maxHp = 3; this.cool = 70;
    }
    get warn() { return this.tough ? 30 : 42; }     // w1~w2 預警更久
    think() {
      if (this.state === 'ready') {
        this.vx = 0; this.setSpr('ronin_attack');
        if (this.stateT === 1) { sfx('sword'); KB.particles(this.cx, this.cy, ['#eef2ff', '#ffffff'], 5, { spread: 1.2, grav: 0, life: 14, up: 0.4, size: 1 }); }
        if (this.stateT % 6 === 0) KB.particles(this.cx + this.dir * 6, this.cy + 2, ['#ffffff', '#9aa6c0'], 1, { spread: 0.4, grav: -0.04, life: 12, up: 0.3, size: 1 });
        if (this.stateT === this.warn - 8) vfx('aura', this, { color: '#eef2ff', r: 14, frames: 10 });
        if (this.stateT >= this.warn) { this.facePlayer(); this.setState('iai'); }
        return;
      }
      if (this.state === 'iai') {
        if (this.stateT === 1) {
          this.killHitbox();
          this.hitbox = KB.hitbox({ x: 0, y: 0, w: 26, h: 20, dmg: 1, owner: 'enemy', type: 'blade', follow: this, ox: -4, oy: -3, life: 20, rehit: 14, breakBlocks: false });
          vfx('slash', this.cx + this.dir * 14, this.cy, 20, 0, { color: '#eef2ff', width: 2, frames: 10, arc: 2, flip: this.dir < 0 });
          vfx('line', this.cx, this.cy, this.cx + this.dir * 70, this.cy, { color: '#ffffff', width: 2, frames: 8 });
          shake(3); sfx('slash_big');
        }
        this.vx = this.dir * 4.0 * (this.exK || 1);
        if (this.stateT % 3 === 0) KB.particles(this.cx - this.dir * 8, this.cy, ['#eef2ff'], 1, { spread: 0.3, grav: 0, life: 8, up: 0, size: 1 });
        if (this.stateT >= 18 || KB.physics.wallAhead(KB.game.map, this)) { this.killHitbox(); this.setState('recover'); }
        return;
      }
      if (this.state === 'recover') {
        this.vx *= 0.75;
        if (this.stateT >= (this.tough ? 20 : 34)) { this.setState('walk'); this.setSpr('ronin_walk'); this.cool = this.tough ? 80 : 120; }
        return;
      }
      this.setSpr('ronin_walk');
      const see = this.notice(110, 44);
      // 察覺後主動逼近（站著不動會卡在剛好打不到的距離）
      if (see && this.onGround) this.chase(this.speed * this.alertK); else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(92, 36)) { this.facePlayer(); this.vx = 0; this.setState('ready'); this.setSpr('ronin_attack'); }
    }
    pickFrame() { return this.state === 'ready' ? 0 : (this.state === 'iai' ? 1 : undefined); }
  }

  // =====================================================================
  //  Archer Waddle 弓箭手 —— 給 bow
  //  拉弓時間內瞄準卡比，射出拋物線箭矢（被吸入箭矢可得 bow）
  // =====================================================================
  class ArcherWaddle extends Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'archerwaddle'; this.spr = 'archerwaddle_walk'; this.w = 14; this.h = 16;
      this.speed = 0.45; this.ability = 'bow'; this.score = 350; this.hp = 2; this.maxHp = 2; this.cool = 80;
    }
    get drawT() { return this.tough ? 18 : 28; }
    loose() {
      const p = KB.player; if (!p) return;
      const sx = this.cx + this.dir * 8, sy = this.cy - 4;
      const dx = p.cx - sx, dy = p.cy - sy, g = 0.13;
      const vx = clamp(dx * 0.05, -3.4, 3.4) || this.dir * 2.4;
      const t = clamp(Math.abs(dx / (vx || 1)), 10, 90);
      const vy = clamp((dy - 0.5 * g * t * t) / t, -4.2, 1.5);
      const a = KB.shoot({
        spr: 'proj_arrow', x: sx, y: sy, vx: vx, vy: vy, dmg: 1, owner: 'enemy',
        life: 200, w: 12, h: 6, grav: g, solid: true, pierce: false, type: 'bow',
        dir: vx < 0 ? -1 : 1, fxHit: 'fx_hit', breakBlocks: false, inhalable: true,
      });
      a.onInhaled = function (pl) { this.dead = true; pl.mouth = { ability: 'bow', name: 'arrow', score: 10 }; };
      a.rot = Math.atan2(vy, Math.abs(vx));
      KB.particles(sx, sy, ['#48c048', '#ffffff'], 4, { spread: 1.2, grav: 0, life: 10, up: 0, size: 1 });
      sfx('bow');
    }
    think() {
      if (this.state === 'aim') {
        this.vx = 0; this.facePlayer(); this.setSpr('archerwaddle_attack');
        if (this.stateT === 1) sfx('bow');
        if (this.stateT % 8 === 0 && this.stateT < this.drawT) KB.particles(this.cx + this.dir * 8, this.cy - 4, ['#48c048'], 1, { spread: 0.3, grav: 0, life: 10, up: 0.2, size: 1 });
        if (this.stateT === this.drawT) this.loose();
        if (this.stateT >= this.drawT + 16) { this.setState('walk'); this.setSpr('archerwaddle_walk'); this.cool = this.tough ? 80 : 130; }
        return;
      }
      this.setSpr('archerwaddle_walk');
      const see = this.notice(140, 90);
      if (see && this.onGround) { this.facePlayer(); this.vx = 0; } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(150, 96)) { this.facePlayer(); this.vx = 0; this.setState('aim'); this.setSpr('archerwaddle_attack'); }
    }
    pickFrame() { return this.state === 'aim' ? (this.stateT < this.drawT ? 0 : 1) : undefined; }
  }

  // ---------- 註冊 ----------
  KB.ENEMIES.pistolo = Pistolo;
  KB.ENEMIES.kagedee = KageDee;
  KB.ENEMIES.ronin = RoninDee;
  KB.ENEMIES.archerwaddle = ArcherWaddle;
  KB.ENEMIES_WEAPONS = { Pistolo, KageDee, RoninDee, ArcherWaddle };
})();
