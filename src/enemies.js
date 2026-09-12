// 敵人 AI —— 全部一般敵人與小魔王（以 Kirby's Adventure 的行為為藍本之原創實作）
// 依賴：KB.Enemy（entity.js）、KB.physics（tilemap.js）、KB.hitbox / KB.shoot / KB.fx / KB.particles
(function () {
  const T = KB.TILE;
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sign = v => v < 0 ? -1 : 1;
  const playerAlive = () => !!(KB.player && !KB.player.dead && KB.player.state !== 'dead');
  const shake = n => { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); };

  // =====================================================================
  //  共用基底：狀態機、動畫計時、追擊、判定框管理
  // =====================================================================
  class Baddie extends KB.Enemy {
    constructor(x, y) {
      super(x, y);
      this.state = 'walk'; this.stateT = 0; this.animT = 0; this.cool = 30;
      this.hitbox = null; this.bob = 0; this.lastF = undefined;
      this.alert = false; this.alertT = 0;   // 察覺玩家（notice()）
    }
    setState(s) { this.state = s; this.stateT = 0; }
    setSpr(n) { if (this.spr !== n) { this.spr = n; this.animT = 0; } }
    // 引擎把離開畫面太遠的敵人放回起點（active=false）；回到畫面時偵測到「跳幀 + 位於起點」即重置 AI
    // 通用重置：清掉跟隨型判定框、回到初始狀態 / 精靈 / 冷卻（子類覆寫時請呼叫 super.onReset()）
    onReset() {
      this.killHitbox();
      if (this.state0 !== undefined) { this.setState(this.state0); this.setSpr(this.spr0); this.cool = this.cool0; }
      this.vx = 0; this.vy = 0; this.freezeT = 0; this.beingInhaled = false; this.inhaleSrc = null;
      this.alert = false; this.alertT = 0;
      this.status = null;   // 元素狀態（燃燒 / 麻痺）也一起清掉，回到畫面時不會還在燒（Round 6 elements）
    }
    // Extra（超難）難度：所有敵人的調整集中在這裡（倍率見 entity.js 的 KB.EXTRA）。
    // 子類建構式會在 super() 之後才設定 speed / hp，所以不能在建構式裡做 —— 改在「第一次 update」套用一次。
    applyExtra() {
      if (this.extraApplied) return; this.extraApplied = true;
      if (!KB.extraOn()) return;
      this.exK = KB.EXTRA.spd;                       // 走路 / 追擊速度 ×1.2（Enemy.walk 與 chase 共用）
      if (this.isMiniBoss) {                          // 中魔王血量 ×1.25
        this.maxHp = Math.max(1, Math.round(this.maxHp * KB.EXTRA.miniHp));
        this.hp = this.maxHp;
      }
    }
    update(dt) {
      if (this.state0 === undefined) { this.state0 = this.state; this.spr0 = this.spr; this.cool0 = this.cool; this.applyExtra(); }
      if (KB.game) {
        const f = KB.game.frame;
        if (this.lastF !== undefined && f - this.lastF > 1 && this.x === this.startX) this.onReset();
        this.lastF = f;
      }
      // 被冰凍 / 被吸入中：跟隨型判定框（火焰、電場…）不該繼續存在；冰凍的無重力敵人停在原地
      if (this.freezeT > 0 || this.beingInhaled) {
        this.killHitbox();
        if (this.freezeT > 0 && !this.solid) { this.vx = 0; this.vy = 0; }
      }
      super.update(dt);
    }
    ai(dt) { this.stateT++; this.animT++; if (this.cool > 0) this.cool--; this.think(dt); }
    think(dt) { this.walk(); }
    // 走向玩家；遇牆 / 懸崖停下（回傳是否有前進）
    chase(speed) {
      this.facePlayer();
      if (this.onGround && ((this.turnAtWall && KB.physics.wallAhead(KB.game.map, this)) || (this.turnAtEdge && KB.physics.edgeAhead(KB.game.map, this)))) { this.vx = 0; return false; }
      this.vx = speed * this.dir * (this.exK || 1); return true;
    }
    canSee(dx, dy) { return playerAlive() && this.playerDist() <= dx && Math.abs(this.playerDy()) <= (dy !== undefined ? dy : 32); }
    inFront() { return this.playerDx() * this.dir > 0; }
    // 察覺玩家：進入 range（預設 96px）時 alert = true，第一次會冒出驚嘆的黃色火花。
    // 各敵人自行決定警戒後的反應（加速 / 轉向 / 改用特殊招）。
    notice(range, dy) {
      const see = this.canSee(range === undefined ? 96 : range, dy === undefined ? 48 : dy);
      if (see && !this.alert) {
        this.alert = true; this.alertT = 0;
        KB.particles(this.cx, this.y - 3, ['#ffe040', '#ffffff'], 4, { spread: 0.7, grav: 0.03, life: 16, up: 1.3, size: 1 });
      } else if (!see) { this.alert = false; this.alertT = 0; }
      if (see) this.alertT++;
      return see;
    }
    killHitbox() { if (this.hitbox) { this.hitbox.dead = true; this.hitbox = null; } }
    die(src) { if (this.dead) return; this.killHitbox(); super.die(src); }
    onInhaled(p) { this.killHitbox(); super.onInhaled(p); }
    pickFrame() { return undefined; }
    draw(g) {
      if (this.freezeT > 0) { this.drawFrozen(g); return; }
      const o = { t: this.beingInhaled ? 0 : this.animT / 60 };
      const fr = this.pickFrame(); if (fr !== undefined) o.frame = fr;
      const wx = KB.inhaleWobble(this);
      this.drawGlow(g);                       // 暗房微光 + 眼睛亮點（entity.js）
      g.spr(this.spr, this.cx + wx, this.bottom + this.bob + (this.wobY || 0), this.sprOpts(o));
    }
  }

  // =====================================================================
  //  敵方投射物子類
  // =====================================================================
  // 回旋刃（Sir Kibble）：飛出後減速折返，回到主人身邊消失
  class Boomerang extends KB.Projectile {
    constructor(o) {
      super(Object.assign({ spr: 'proj_cutter', w: 10, h: 10, dmg: 1, owner: 'enemy', life: 160, solid: false, pierce: true, inhalable: true, type: 'cutter', fxHit: 'fx_hit', breakBlocks: false }, o));
      this.d0 = this.vx < 0 ? -1 : 1; this.maxV = Math.abs(this.vx); this.home = o.ownerEnt || null;
      this.rotSpeed = 0.35 * this.d0; this.x0 = this.x; this.y0 = this.cy; this.kind = 'cutter';
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.rot += this.rotSpeed;
      this.vx -= this.d0 * 0.09;
      if (this.vx * this.d0 < 0) {
        // 折返中：朝主人（或原點）高度修正
        const ty = this.home && !this.home.dead ? this.home.cy : this.y0;
        this.vy = clamp((ty - this.cy) * 0.06, -1.2, 1.2);
        if (this.vx * this.d0 < -this.maxV) this.vx = -this.d0 * this.maxV;
        this.flip = this.vx < 0;
        if (this.home && !this.home.dead && this.overlaps(this.home)) {
          // 回收：主人接住刀刃 → 冷卻縮短、冒出白色火花。
          // w1~w2（tier ≤ 2）不接刃：刀刃直接消失，不觸發 caught 的短冷卻連發（QA R2-P1-06）
          this.dead = true;
          if (!this.home.canCatch) return;
          this.home.caught = true;
          KB.fx('fx_sparkle', this.home.cx, this.home.cy - 2);
          KB.particles(this.home.cx, this.home.cy, ['#ffffff', '#e0e0e0'], 5, { spread: 1.2, grav: 0, life: 12, up: 0, size: 1 });
          sfx('cutter');
          return;
        }
        if ((this.x - this.x0) * this.d0 < -24) { this.dead = true; return; }
      }
      this.x += this.vx; this.y += this.vy;
      if (KB.game && this.y > KB.game.map.ph + 48) this.dead = true;
    }
    // KA 規則：吸入 Sir Kibble 丟出的刀刃也能得到 cutter
    onInhaled(p) { this.dead = true; p.mouth = { ability: 'cutter', name: 'cutter', score: 10 }; }
  }

  // 炸彈（Poppy Bros.）：拋物線、落地 40 幀後爆炸（碰到卡比或被攻擊也爆）
  class Bomb extends KB.Projectile {
    constructor(o) {
      super(Object.assign({ spr: 'proj_bomb', w: 10, h: 10, dmg: 1, owner: 'enemy', life: 300, grav: 0.16, solid: true, pierce: true, inhalable: true, type: 'bomb', breakBlocks: false }, o));
      this.landT = -1; this.maxFall = 4; this.rotSpeed = 0.12 * this.dir; this.fuse = o.fuse || 40; this.blink = false; this.kind = 'bomb';
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--;
      const pvx = this.vx, pvy = this.vy;
      this.rot += this.rotSpeed;
      this.physics();
      if (this.hitWall) this.vx = -pvx * 0.4;
      if (this.onGround) {
        if (this.landT < 0 && pvy > 1.5) { this.vy = -pvy * 0.35; this.vx *= 0.6; }         // 落地彈一下
        else { this.landT = Math.max(0, this.landT) + 1; this.vx *= 0.8; this.rotSpeed = 0; if (Math.abs(this.vx) < 0.05) this.vx = 0; }
      }
      const p = KB.player;
      if (this.life <= 0 || this.fellOut || this.landT >= this.fuse || (p && p.state !== 'dead' && this.overlaps(p))) { this.explode(); return; }
      this.blink = this.landT >= 0 && this.landT > this.fuse - 20 && (this.landT & 2) === 0;
    }
    explode() {
      if (this.dead) return; this.dead = true;
      KB.hitbox({ x: this.cx - 12, y: this.cy - 12, w: 24, h: 24, dmg: 1, owner: 'enemy', type: 'bomb', life: 4, pierce: true, breakBlocks: false });
      KB.fx('fx_poof', this.cx, this.cy + 8);
      KB.particles(this.cx, this.cy, ['#ff8040', '#ffe040', '#ffffff'], 10, { spread: 2.5 });
      shake(3); sfx('hammer');
    }
    hurt() { this.explode(); return true; }
    draw(g) { g.spr(this.spr, this.cx, this.bottom, { t: this.t, flip: this.flip, rot: this.rot, tint: this.blink ? '#ffffff' : undefined }); }
  }

  // 滑行冰塊（Mr. Frosty）：貼地滑行，撞牆 / 撞到卡比碎裂
  class Slider extends KB.Projectile {
    constructor(o) {
      super(Object.assign({ spr: 'proj_iceblock', w: 14, h: 14, dmg: 1, owner: 'enemy', life: 200, grav: 0.25, solid: true, pierce: false, inhalable: true, type: 'iceblock', fxHit: 'fx_hit', breakBlocks: false }, o));
      this.maxFall = 4; this.kind = 'iceblock';
    }
    update(dt) {
      this.baseUpdate(dt); this.life--;
      this.physics();
      if (this.hitWall || this.life <= 0 || this.fellOut) { this.dead = true; KB.particles(this.cx, this.cy, '#c0f0ff', 8, { spread: 2 }); sfx('block'); }
    }
  }

  // =====================================================================
  //  一般敵人
  // =====================================================================
  // Waddle Dee：走路，遇牆 / 懸崖轉向；察覺玩家（96px）後小跳一下受驚並加速前進
  class WaddleDee extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'waddledee'; this.spr = 'waddledee_walk'; this.w = 14; this.h = 14; this.speed = 0.5; this.ability = null; }
    think() {
      const see = this.notice(96, 40);
      if (see && this.alertT === 1 && this.onGround) { this.vy = -1.6; this.onGround = false; }   // 受驚小跳
      // 玩家貼得很近又在背後 → 回頭看
      if (see && this.playerDist() < 30 && !this.inFront() && this.onGround) this.facePlayer();
      this.walk(see ? this.speed * this.alertK : this.speed);
    }
  }

  // Waddle Doo：玩家在前方 80px 內時停下甩光束 —— 扇形掃射 6 道 proj_beam（-95° → +25°）
  class WaddleDoo extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'waddledoo'; this.spr = 'waddledoo_walk'; this.w = 14; this.h = 14; this.speed = 0.5; this.ability = 'beam'; this.cool = 40; }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        const k = this.stateT - 8, N = this.tough ? 6 : 3;   // w1~w2 只掃 3 道，w3 起 6 道
        if (k >= 0 && k < N * 3 && k % 3 === 0) {
          const i = k / 3, a = (-95 + i * (120 / (N - 1))) * Math.PI / 180;   // -95° → +25°：頭頂掃到前方地面（蹲下也躲不掉）
          const ox = this.cx + this.dir * 5, oy = this.cy - 2;
          KB.shoot({ spr: 'proj_beam', x: ox + this.dir * Math.cos(a) * 7, y: oy + Math.sin(a) * 7, vx: this.dir * Math.cos(a) * 2.3, vy: Math.sin(a) * 2.3, dmg: 1, owner: 'enemy', life: 18, w: 6, h: 6, solid: false, pierce: false, breakBlocks: false, type: 'beam', fxHit: 'fx_hit', dir: this.dir, ownerEnt: this });
          KB.fx('fx_beam_seg', ox + this.dir * Math.cos(a) * 4, oy + Math.sin(a) * 4 + 3, { life: 3 });
          if (i === 0) sfx('beam');
        }
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('waddledoo_walk'); this.cool = 90; }
        return;
      }
      this.setSpr('waddledoo_walk');
      const see = this.notice(96, 40);
      if (see && this.onGround && this.cool <= 20) this.facePlayer();   // 察覺 → 轉頭盯著玩家
      this.walk(see ? this.speed * this.alertK : this.speed);
      if (this.cool <= 0 && this.onGround && this.canSee(80, 24) && this.inFront()) { this.vx = 0; this.setState('attack'); this.setSpr('waddledoo_attack'); }
    }
  }

  // Bronto Burt：正弦波飛行；看到玩家時緩慢追擊。不受重力、穿牆
  class BrontoBurt extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'brontoburt'; this.spr = 'brontoburt_fly'; this.w = 14; this.h = 14;
      this.grav = 0; this.solid = false; this.speed = 0.6; this.phase = Math.random() * Math.PI * 2; this.ability = null;
    }
    think() {
      this.phase += 0.08;
      const map = KB.game.map;
      if (this.canSee(110, 80)) {
        const dx = this.playerDx(), dy = this.playerDy() - 8;
        this.vx = clamp(this.vx + sign(dx) * 0.03, -0.7, 0.7);
        this.vy = clamp(dy * 0.02, -0.5, 0.5) + Math.cos(this.phase) * 0.6;
        if (Math.abs(dx) > 6) this.dir = sign(dx);
      } else {
        if (this.x <= 0 && this.dir < 0) this.dir = 1;
        if (this.x + this.w >= map.pw && this.dir > 0) this.dir = -1;
        if (KB.physics.wallAhead(map, this)) this.dir *= -1;
        this.vx = this.dir * this.speed;
        this.vy = Math.cos(this.phase) * 0.9;
      }
    }
  }

  // Hot Head：走路；近距離噴火（前方火焰判定 30 幀），中距離發射拋物線火球
  class HotHead extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'hothead'; this.spr = 'hothead_walk'; this.w = 14; this.h = 14; this.speed = 0.4; this.ability = 'fire'; this.cool = 60;
      this.element = 'fire'; this.weak = ['ice']; this.resist = ['fire'];   // 火屬性：怕冰、抗火
    }
    think() {
      if (this.state === 'flame') {
        this.vx = 0;
        const fl = this.tier <= 1 ? 21 : 30;   // w1 的噴火持續縮短 30%（30 → 21 幀）
        if (this.stateT === 6) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 30, h: 14, dmg: 1, owner: 'enemy', type: 'fire', follow: this, ox: 5, oy: 0, life: fl, rehit: 10, breakBlocks: false }); sfx('fire'); }
        if (this.stateT >= 6 && this.stateT < 6 + fl && this.stateT % 4 === 2) KB.fx('fx_fire', this.cx + this.dir * (12 + (this.stateT % 12)), this.cy + 4, { flip: this.dir < 0 });
        if (this.stateT >= 14 + fl) { this.setState('walk'); this.setSpr('hothead_walk'); this.cool = 120; }
        return;
      }
      if (this.state === 'shoot') {
        this.vx = 0;
        if (this.stateT === 10) {
          KB.shoot({ spr: 'proj_fireball', x: this.cx + this.dir * 8, y: this.cy - 2, vx: this.dir * 1.8, vy: -2.6, grav: 0.12, dmg: 1, owner: 'enemy', life: 150, w: 8, h: 8, solid: true, fxHit: 'fx_poof', trail: '#ff8030', type: 'fire', breakBlocks: false, dir: this.dir, ownerEnt: this });
          sfx('fire');
        }
        if (this.stateT >= 30) { this.setState('walk'); this.setSpr('hothead_walk'); this.cool = 120; }
        return;
      }
      this.setSpr('hothead_walk');
      // 察覺玩家：加速逼近到噴火距離就停住（遠程型不主動貼身）
      const see = this.notice(96, 48);
      if (see && this.onGround) {
        if (this.playerDist() > 40) this.chase(this.speed * this.alertK); else { this.facePlayer(); this.vx = 0; }
      } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(96, 48)) {
        this.facePlayer(); this.vx = 0; this.setSpr('hothead_attack');
        this.setState(this.playerDist() < 44 && Math.abs(this.playerDy()) < 16 ? 'flame' : 'shoot');
      }
    }
  }

  // Sir Kibble：玩家接近時丟出回旋刃（一次只有一把在外）
  class SirKibble extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'sirkibble'; this.spr = 'sirkibble_walk'; this.w = 14; this.h = 16; this.speed = 0.5; this.ability = 'cutter'; this.score = 300; this.cutter = null; this.cool = 40; }
    // w1~w2：不接刃，丟刀間隔 90 幀；w3 起：接刃（接回後 24 幀就能再丟），一般間隔 60 幀
    get canCatch() { return this.tough; }
    get throwCD() { return this.tough ? 60 : 90; }
    think() {
      if (this.state === 'throw') {
        this.vx = 0;
        if (this.stateT === 10) { this.cutter = KB.spawn(new Boomerang({ x: this.cx + this.dir * 8, y: this.cy - 2, vx: this.dir * 2.6, vy: 0, dir: this.dir, ownerEnt: this })); sfx('cutter'); }
        if (this.stateT >= 28) { this.setState('walk'); this.setSpr('sirkibble_walk'); this.cool = this.throwCD; }
        return;
      }
      if (this.caught) { this.caught = false; this.cool = Math.min(this.cool, 24); this.setSpr('sirkibble_throw'); }   // 接回刀刃 → 很快再丟
      else this.setSpr('sirkibble_walk');
      // 察覺玩家：停下腳步轉身正對，準備出手
      const see = this.notice(96, 40);
      if (see && this.onGround) { this.facePlayer(); this.vx = 0; } else this.walk();
      const busy = this.cutter && !this.cutter.dead;
      if (!busy && this.cool <= 0 && this.onGround && this.canSee(100, 40)) { this.facePlayer(); this.vx = 0; this.setState('throw'); this.setSpr('sirkibble_throw'); }
    }
  }

  // Sparky：每 40 幀小跳前進；玩家靠近時停下放電（周圍 40×36 判定）
  class Sparky extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'sparky'; this.spr = 'sparky_hop'; this.w = 14; this.h = 14; this.ability = 'spark'; this.hopT = 20; this.cool = 60; this.state = 'hop';
      this.element = 'spark'; this.resist = ['spark'];   // 電屬性：抗電
    }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        if (this.stateT === 1) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 40, h: 36, dmg: 1, owner: 'enemy', type: 'spark', follow: this, ox: -20, oy: -11, flipWithOwner: false, life: 45, rehit: 8, breakBlocks: false }); sfx('spark'); }
        if (this.stateT % 3 === 0) KB.fx('fx_spark_field', this.cx + (Math.random() - 0.5) * 36, this.cy + 10 + (Math.random() - 0.5) * 30, { life: 4 });
        if (this.stateT >= 46) { this.setState('hop'); this.setSpr('sparky_hop'); this.cool = 70; this.hopT = 20; }
        return;
      }
      if (this.onGround) {
        this.vx = 0;
        if (this.cool <= 0 && this.canSee(40, 24)) { this.setState('attack'); this.setSpr('sparky_attack'); return; }
        if (--this.hopT <= 0) {
          this.hopT = 40;
          const map = KB.game.map;
          if (KB.physics.wallAhead(map, this) || KB.physics.edgeAhead(map, this)) this.dir *= -1;
          else if (playerAlive() && this.playerDist() < 120 && Math.random() < 0.4) this.facePlayer();
          this.vy = -2.4; this.vx = this.dir * 0.9; this.onGround = false;
        }
      } else this.vx = this.dir * 0.9;
    }
    pickFrame() { return this.state === 'attack' ? undefined : (this.onGround ? 0 : 1); }
  }

  // Rocky：慢走；玩家接近時跳起重落，落地震動並產生地面判定。重、較難吸
  class Rocky extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'rocky'; this.spr = 'rocky_walk'; this.w = 16; this.h = 16; this.speed = 0.3; this.ability = 'stone'; this.hp = 3; this.maxHp = 3; this.cool = 20; }
    pullTo(px, py, s) { super.pullTo(px, py, s * 0.55); }
    think() {
      if (this.state === 'jump') {
        if (this.stateT === 1) { this.vy = -4.2; this.vx = clamp(this.playerDx() * 0.03, -1.2, 1.2) * this.exK; this.onGround = false; }   // Extra：撲擊速度也 ×KB.exK('spd')
        if (this.vy > 0) { this.grav = 0.5; this.maxFall = 6; }
        if (this.stateT > 2 && this.onGround) {
          this.grav = KB.GRAV; this.maxFall = KB.MAXFALL; this.vx = 0;
          KB.hitbox({ x: this.cx - 20, y: this.bottom - 10, w: 40, h: 12, dmg: 1, owner: 'enemy', type: 'stone', life: 6, pierce: true, breakBlocks: false });
          KB.particles(this.cx, this.bottom, '#c0c0c8', 8, { spread: 2 }); shake(4); sfx('hammer');
          this.setState('walk'); this.setSpr('rocky_walk'); this.cool = 90;
        }
        return;
      }
      this.setSpr('rocky_walk');
      // 察覺玩家：慢慢輾過去
      if (this.notice(96, 40) && this.onGround) this.chase(this.speed * this.alertK); else this.walk();
      if (this.cool <= 0 && this.onGround && playerAlive() && this.playerDist() < 36 && this.playerDy() > -24) { this.facePlayer(); this.setState('jump'); this.setSpr('rocky_drop'); }
    }
  }

  // Chilly：走路；定時朝前方噴冰（判定帶 freeze 旗標）
  class Chilly extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'chilly'; this.spr = 'chilly_walk'; this.w = 14; this.h = 16; this.speed = 0.4; this.ability = 'ice'; this.cool = 60;
      this.element = 'ice'; this.weak = ['fire']; this.resist = ['ice'];   // 冰屬性：怕火、抗冰
    }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        if (this.stateT === 6) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 28, h: 16, dmg: 1, owner: 'enemy', type: 'ice', follow: this, ox: 5, oy: 0, life: 30, rehit: 10, freeze: true, breakBlocks: false }); sfx('ice'); }
        if (this.stateT >= 6 && this.stateT < 36 && this.stateT % 4 === 2) KB.fx('fx_ice', this.cx + this.dir * (12 + (this.stateT % 12)), this.cy + 4, { flip: this.dir < 0 });
        if (this.stateT >= 44) { this.setState('walk'); this.setSpr('chilly_walk'); this.cool = 110; }
        return;
      }
      this.setSpr('chilly_walk');
      // 察覺玩家：滑步逼近到噴冰距離就停住（遠程型不主動貼身）
      if (this.notice(96, 40) && this.onGround) {
        if (this.playerDist() > 32) this.chase(this.speed * this.alertK); else { this.facePlayer(); this.vx = 0; }
      } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(80, 24)) { this.facePlayer(); this.vx = 0; this.setState('attack'); this.setSpr('chilly_attack'); }
    }
  }

  // Blade Knight：看到玩家便走近，貼身時揮劍（前方 20×20 判定 12 幀）；中距離改用突刺衝鋒。hp 4
  class BladeKnight extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'bladeknight'; this.spr = 'bladeknight_walk'; this.w = 14; this.h = 18; this.hp = 4; this.maxHp = 4; this.speed = 0.6; this.ability = 'sword'; this.cool = 30; }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        if (this.stateT === 6) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 20, h: 20, dmg: 1, owner: 'enemy', type: 'sword', follow: this, ox: 4, oy: -3, life: 12, rehit: 0, breakBlocks: false }); sfx('sword'); }
        if (this.stateT >= 26) { this.setState('walk'); this.setSpr('bladeknight_walk'); this.cool = 40; }
        return;
      }
      // 突刺衝鋒：舉劍蓄勢 8 幀 → 帶著劍往前衝 18 幀
      if (this.state === 'lunge') {
        if (this.stateT < 8) { this.vx = 0; }
        else {
          if (this.stateT === 8) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 22, h: 18, dmg: 1, owner: 'enemy', type: 'sword', follow: this, ox: 3, oy: -2, life: 20, rehit: 0, breakBlocks: false }); sfx('sword'); }
          this.vx = this.dir * 2.4 * this.exK;   // Extra：突刺衝鋒速度 ×KB.exK('spd')
          if (this.stateT % 4 === 0) KB.particles(this.cx - this.dir * 8, this.bottom - 2, '#e0e0e8', 2, { spread: 0.8, up: 0.4, life: 12, size: 1 });
          if (this.hitWall || (this.onGround && KB.physics.edgeAhead(KB.game.map, this)) || this.stateT >= 26) {
            this.killHitbox(); this.vx = 0; this.setState('walk'); this.setSpr('bladeknight_walk'); this.cool = 70;
          }
        }
        return;
      }
      this.setSpr('bladeknight_walk');
      const see = this.notice(96, 32);
      if (see || this.canSee(90, 28)) this.chase(this.speed * (see ? this.alertK : 1)); else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(30, 24)) { this.facePlayer(); this.vx = 0; this.setState('attack'); this.setSpr('bladeknight_attack'); }
      else if (this.cool <= 0 && this.onGround && see && this.playerDist() > 40 && this.playerDist() < 90 && Math.abs(this.playerDy()) < 20) {
        this.facePlayer(); this.vx = 0; this.setState('lunge'); this.setSpr('bladeknight_attack');
      }
    }
  }

  // =====================================================================
  //  小魔王基底：hp 歸零不消失，改為「暈倒可吸入」5 秒（吸入給能力）
  // =====================================================================
  class MiniBoss extends Baddie {
    constructor(x, y) {
      super(x, y); this.inhalable = false; this.score = 3000; this.stunned = false; this.stunT = 0; this.stunH = 16;
      this.turnAtEdge = true; this.persistent = true; this.walkSpr = 'waddledee_walk';
      this.isMiniBoss = true;                            // applyExtra / 掉落表用
      this.dropTable = { tomato: 0.5, oneup: 0.1 };      // 中魔王的掉落（在 stun 的那一刻 roll）
    }
    hurt(amount, src) {
      if (this.dead || this.stunned || this.invuln > 0) return false;
      // 元素弱點 / 抗性與燃燒 / 麻痺狀態（與 Enemy.hurt 一致；R6-P1-03）
      const dmg = KB.ELEM ? KB.ELEM.applyHit(this, amount, src) : amount;
      this.hp -= dmg; this.flash = 8; this.invuln = 8;
      if (KB.ELEM) KB.ELEM.onHit(this, src);
      if (this.hp <= 0) { this.hp = 0; this.stun(src); return true; }
      sfx('boss_hurt'); return true;
    }
    stun(src) {
      this.stunned = true; this.stunT = 300; this.inhalable = true; this.hurtsPlayer = false; this.vx = 0; this.killHitbox();
      this.setState('stunned'); this.setSpr(this.walkSpr);
      const b = this.bottom; this.bodyH = this.h; this.h = this.stunH; this.bottom = b;
      KB.fx('fx_poof', this.cx, this.cy + 8); KB.particles(this.cx, this.cy, ['#ffe040', '#ffffff'], 12, { spread: 3 });
      shake(6); sfx('boss_die');
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
      this.score = 0;   // 吸入 / 消失時不重複給分
      // 中魔王「被打倒」＝ stun 的那一刻就掉道具（之後暈倒的身體還可以被吸入拿能力，不會重複掉）
      this.rollDrop(src);
    }
    ai(dt) {
      this.stateT++; this.animT++; if (this.cool > 0) this.cool--;
      if (this.stunned) { this.vx = 0; if (--this.stunT <= 0) { this.dead = true; KB.fx('fx_poof', this.cx, this.cy + 8); } return; }
      this.think(dt);
    }
    draw(g) {
      if (!this.stunned) { super.draw(g); return; }
      const blink = this.stunT < 90 ? (this.stunT & 2) : ((this.stunT >> 3) & 1);
      if (blink) return;
      // 躺下：以 90° 旋轉繪製（頭朝面向側）
      const s = KB.sprSize(this.spr);
      g.spr(this.spr, this.cx - this.dir * s.h / 2, this.bottom - s.w / 2, { frame: 0, rot: this.dir * Math.PI / 2, flip: false });
    }
  }

  // Bonkers：走向玩家；貼近掄鎚（dmg 2），遠時丟 2 顆椰子。暈倒後吸入給 hammer
  class Bonkers extends MiniBoss {
    constructor(x, y) { super(x, y); this.name = 'bonkers'; this.spr = this.walkSpr = 'bonkers_walk'; this.w = 26; this.h = 30; this.hp = 14; this.maxHp = 14; this.ability = 'hammer'; this.speed = 0.6; this.cool = 50; }
    think() {
      if (this.state === 'hammer') {
        this.vx = 0;
        if (this.stateT === 14) {
          this.hitbox = KB.hitbox({ x: 0, y: 0, w: 32, h: 36, dmg: 2, owner: 'enemy', type: 'hammer', follow: this, ox: 2, oy: -6, life: 10, rehit: 0, breakBlocks: false });
          KB.particles(this.cx + this.dir * 18, this.bottom, '#c0a060', 6, { spread: 1.5 }); shake(4); sfx('hammer');
        }
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('bonkers_walk'); this.cool = 60; }
        return;
      }
      if (this.state === 'throw') {
        this.vx = 0;
        if (this.stateT === 10 || this.stateT === 22) {
          const k = this.stateT === 10 ? 0 : 1;
          KB.shoot({ spr: 'proj_cannonball', x: this.cx + this.dir * 12, y: this.y + 8, vx: this.dir * (1.5 + k * 0.7), vy: -3.4, grav: 0.14, dmg: 1, owner: 'enemy', life: 180, w: 10, h: 10, solid: true, fxHit: 'fx_poof', inhalable: true, type: 'coconut', breakBlocks: false, dir: this.dir, rotSpeed: 0.2 * this.dir, ownerEnt: this });
          sfx('spit');
        }
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('bonkers_walk'); this.cool = 80; }
        return;
      }
      // 第二招：大跳撲擊 —— 躍向玩家，落地產生左右兩道地面衝擊波
      if (this.state === 'leap') {
        if (this.stateT === 1) { this.vy = -5.0; this.vx = clamp(this.playerDx() * 0.035, -2.2, 2.2) * this.exK; this.onGround = false; }   // Extra：撲擊速度 ×KB.exK('spd')
        if (this.vy > 0) { this.grav = 0.45; this.maxFall = 7; }
        if (this.stateT > 3 && this.onGround) {
          this.grav = KB.GRAV; this.maxFall = KB.MAXFALL; this.vx = 0;
          for (const s of [-1, 1]) {
            KB.hitbox({ x: this.cx + (s > 0 ? 6 : -44), y: this.bottom - 14, w: 38, h: 16, dmg: 2, owner: 'enemy', type: 'hammer', life: 10, pierce: true, breakBlocks: false });
            KB.particles(this.cx + s * 18, this.bottom, ['#c0a060', '#f0e0c0'], 7, { spread: 2, vx: s * 1.5, up: 1.2, life: 22 });
            KB.fx('fx_hit', this.cx + s * 22, this.bottom - 4);
          }
          shake(6); sfx('hammer');
          this.setState('walk'); this.setSpr('bonkers_walk'); this.cool = 80;
        }
        return;
      }
      this.setSpr('bonkers_walk');
      const see = this.notice(120, 56);
      if (playerAlive()) this.chase(this.speed * (see ? this.alertK : 1)); else this.walk();
      if (this.cool <= 0 && this.onGround && playerAlive() && Math.abs(this.playerDy()) < 40) {
        const d = this.playerDist();
        if (d < 40) { this.facePlayer(); this.vx = 0; this.setState('hammer'); this.setSpr('bonkers_attack'); }
        else if (d > 70) { this.facePlayer(); this.vx = 0; this.setState('throw'); this.setSpr('bonkers_attack'); }
        else { this.facePlayer(); this.vx = 0; this.setState('leap'); this.setSpr('bonkers_attack'); }
      }
    }
  }

  // Mr. Frosty：走向玩家；遠時丟滑行冰塊，近時衝撞。暈倒後吸入給 ice
  class MrFrosty extends MiniBoss {
    constructor(x, y) { super(x, y); this.name = 'mrfrosty'; this.spr = this.walkSpr = 'mrfrosty_walk'; this.w = 26; this.h = 28; this.hp = 12; this.maxHp = 12; this.ability = 'ice'; this.speed = 0.5; this.cool = 50;
      this.element = 'ice'; this.weak = ['fire']; this.resist = ['ice'];   // 冰屬性：怕火、抗冰
    }
    think() {
      if (this.state === 'throw') {
        this.vx = 0;
        if (this.stateT === 14) { KB.spawn(new Slider({ x: this.cx + this.dir * 16, y: this.bottom - 7, vx: this.dir * 2.2, vy: -1, dir: this.dir, ownerEnt: this })); sfx('ice'); }
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('mrfrosty_walk'); this.cool = 70; }
        return;
      }
      if (this.state === 'charge') {
        this.vx = this.dir * 2.0 * this.exK;   // Extra：衝撞速度 ×KB.exK('spd')
        if (this.stateT % 6 === 0) KB.particles(this.cx - this.dir * 10, this.bottom, '#e0f8ff', 2, { spread: 1, up: 0.5, life: 15 });
        if (this.hitWall || this.stateT >= 45 || (this.onGround && KB.physics.edgeAhead(KB.game.map, this))) {
          if (this.hitWall) { shake(4); sfx('block'); }
          this.vx = 0; this.setState('walk'); this.setSpr('mrfrosty_walk'); this.cool = 70;
        }
        return;
      }
      // 第二招：寒霜吐息 —— 原地噴出帶凍結旗標的冰霧（42×20，48 幀）
      if (this.state === 'breath') {
        this.vx = 0;
        if (this.stateT === 8) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 42, h: 20, dmg: 1, owner: 'enemy', type: 'ice', follow: this, ox: 8, oy: 2, life: 48, rehit: 12, freeze: true, breakBlocks: false }); sfx('ice'); }
        if (this.stateT >= 8 && this.stateT < 56 && this.stateT % 4 === 0) {
          KB.fx('fx_ice', this.cx + this.dir * (16 + (this.stateT % 16) * 1.6), this.cy + 8, { flip: this.dir < 0, vx: this.dir * 1.2, life: 12 });
          KB.particles(this.cx + this.dir * 20, this.cy + 8, ['#ffffff', '#c0f0ff'], 1, { spread: 0.8, grav: 0.02, life: 16, up: 0, vx: this.dir * 1.2, size: 1 });
        }
        if (this.stateT >= 64) { this.killHitbox(); this.setState('walk'); this.setSpr('mrfrosty_walk'); this.cool = 90; }
        return;
      }
      this.setSpr('mrfrosty_walk');
      const see = this.notice(120, 56);
      if (playerAlive()) this.chase(this.speed * (see ? this.alertK : 1)); else this.walk();
      if (this.cool <= 0 && this.onGround && playerAlive() && Math.abs(this.playerDy()) < 40) {
        this.facePlayer(); this.vx = 0;
        if (this.playerDist() > 56) { this.setState('throw'); this.setSpr('mrfrosty_throw'); }
        else if ((this.frostCombo = (this.frostCombo || 0) + 1) % 3 === 0) { this.setState('breath'); this.setSpr('mrfrosty_throw'); }
        else { this.setState('charge'); this.setSpr('mrfrosty_walk'); }
      }
    }
  }

  // ---------------------------------------------------------------------
  // 鐵甲滾球 Rollarmor（原創中魔王）
  //   造型：穿著鐵甲的圓滾生物，背上一整片可開闔的鐵殼。
  //   兩招：
  //     ① 鐵殼滾動（roll）—— 縮進殼裡高速滾過來，撞牆反彈，滾 2 次牆之後散開。
  //     ② 站起來砸地（slam）—— 立起身子高舉雙臂砸下，正面 dmg 2 判定 + 左右各一道沿地面跑的震波。
  //   弱點：**殼是關的時候（滾動 / 砸地預備）打不穿**（會「鏘」一聲彈開、不扣血）；
  //         滾完 / 砸完的 open 硬直期間鐵殼會張開露出軟肉，那才是玩家的攻擊窗。
  //   打倒後與其他中魔王一樣會暈倒 → 可吸入取得 hammer。
  // ---------------------------------------------------------------------
  const ROLL_CURL = 20;   // 縮進殼裡的預備幀數
  const SLAM_HIT = 24;    // 舉起雙臂到砸下的幀數（鐵殼關著＝無敵期）
  class Rollarmor extends MiniBoss {
    constructor(x, y) {
      super(x, y);
      this.name = 'rollarmor'; this.displayName = '鐵甲滾球';
      this.spr = this.walkSpr = 'rollarmor_walk';
      this.w = 30; this.h = 30; this.hp = 12; this.maxHp = 12; this.ability = 'hammer';
      this.speed = 0.55; this.cool = 50; this.score = 3500; this.stunH = 18;
      this.rot = 0; this.bounces = 0; this.hurtT = 0; this.clang = 0; this.combo = 0;
      this.state = 'walk';
      this.element = 'metal'; this.weak = ['spark'];   // 鐵甲：怕電
    }
    onReset() {
      super.onReset();
      this.rot = 0; this.bounces = 0; this.hurtT = 0; this.clang = 0; this.combo = 0;
      this.turnAtEdge = true; this.setSpr('rollarmor_walk');
    }
    // 鐵殼關著 → 無敵（滾動中、砸地的預備動作）
    get armored() { return this.state === 'roll' || (this.state === 'slam' && this.stateT < SLAM_HIT); }
    hurt(amount, src) {
      if (this.dead || this.stunned) return false;
      if (this.armored) {
        if (this.invuln <= 0) {
          this.invuln = 10; this.clang = 10;
          const hx = src && src.cx !== undefined ? clamp(src.cx, this.x, this.x + this.w) : this.cx;
          const hy = src && src.cy !== undefined ? clamp(src.cy, this.y, this.bottom) : this.cy;
          KB.fx('fx_hit', hx, hy);
          KB.particles(hx, hy, ['#ffffff', '#d8e0ec'], 6, { spread: 1.8, grav: 0.06, life: 14, up: 0.4, size: 1 });
          sfx('block');
        }
        return true;   // 判定框被鐵殼彈開：算「打到了」（不會每幀重複判定），但不扣血
      }
      const ok = super.hurt(amount, src);
      if (ok && !this.stunned) this.hurtT = 14;
      return ok;
    }
    // 砸地：正面 dmg 2 判定 + 左右兩道沿地面前進的震波
    slamGround() {
      const gy = this.bottom;
      this.killHitbox();
      this.hitbox = KB.hitbox({ x: 0, y: 0, w: 30, h: 26, dmg: 2, owner: 'enemy', type: 'hammer', follow: this, ox: 0, oy: 4, life: 10, breakBlocks: false });
      for (const s of [-1, 1]) {
        if (KB.Shockwave) KB.spawn(new KB.Shockwave(s > 0 ? this.x + this.w : this.x, gy, s, { speed: 2.4, life: 80, dmg: 1, color: '#d8e0ec' }));
        else KB.hitbox({ x: this.cx + (s > 0 ? 10 : -50), y: gy - 14, w: 40, h: 16, dmg: 1, owner: 'enemy', type: 'shock', life: 12, pierce: true, breakBlocks: false });
        KB.particles(this.cx + s * 16, gy, ['#c8d0e0', '#ffffff'], 7, { spread: 2, vx: s * 1.5, up: 1.4, life: 22 });
      }
      shake(6); sfx('hammer');
    }
    think() {
      if (this.hurtT > 0) this.hurtT--;
      if (this.clang > 0) this.clang--;
      // ① 鐵殼滾動：縮殼 → 高速滾動（撞牆反彈）→ 撞兩次牆或時間到就散開
      if (this.state === 'roll') {
        if (this.stateT < ROLL_CURL) { this.vx *= 0.7; if (this.stateT === 1) sfx('stone'); return; }
        this.vx = this.dir * 2.8 * (this.exK || 1);
        if (this.stateT % 3 === 0) KB.particles(this.cx - this.dir * 12, this.bottom - 2, ['#c8d0e0', '#ffffff'], 1, { spread: 0.8, up: 0.5, life: 12, size: 1 });
        if (this.hitWall) {
          this.dir *= -1; this.bounces++; shake(4); sfx('block');
          KB.particles(this.cx + this.dir * -14, this.cy, ['#ffffff', '#d8e0ec'], 8, { spread: 2.2, life: 16 });
        }
        const edge = this.onGround && KB.physics.edgeAhead(KB.game.map, this);
        if (this.bounces >= 2 || edge || this.stateT > 150) { this.vx = 0; this.openShell(60); }
        return;
      }
      // ② 站起來砸地：SLAM_HIT 幀的預備（鐵殼關著）→ 砸下 → 硬直
      if (this.state === 'slam') {
        this.vx *= 0.8;
        if (this.stateT === 1) { this.facePlayer(); sfx('boss_hurt'); }
        if (this.stateT < SLAM_HIT && this.stateT % 5 === 0) KB.particles(this.cx, this.y - 2, ['#ffe040', '#ffffff'], 1, { spread: 0.5, grav: 0.02, life: 14, up: 0.6, size: 1 });
        if (this.stateT === SLAM_HIT) this.slamGround();
        if (this.stateT > SLAM_HIT + 16) { this.killHitbox(); this.openShell(46); }
        return;
      }
      // 硬直（鐵殼張開）：玩家的攻擊窗，只會慢慢後退喘氣
      if (this.state === 'open') {
        this.vx *= 0.85;
        if (this.stateT % 8 === 0) KB.particles(this.cx + (Math.random() - 0.5) * 18, this.y + 6, '#ffffff', 1, { spread: 0.4, grav: -0.02, life: 16, up: 0.4, size: 1 });
        if (this.stateT >= this.openT) { this.setState('walk'); this.setSpr('rollarmor_walk'); this.turnAtEdge = true; this.cool = 50; }
        return;
      }
      this.setSpr('rollarmor_walk');
      const see = this.notice(140, 60);
      if (playerAlive()) this.chase(this.speed * (see ? 1.5 : 1)); else this.walk();
      if (this.cool <= 0 && this.onGround && playerAlive() && Math.abs(this.playerDy()) < 44) {
        this.facePlayer(); this.vx = 0; this.bounces = 0; this.combo++;
        if (this.playerDist() > 70 || this.combo % 3 === 0) { this.setState('roll'); this.setSpr('rollarmor_roll'); this.turnAtEdge = false; }
        else { this.setState('slam'); this.setSpr('rollarmor_attack'); }
      }
    }
    openShell(frames) {
      this.openT = frames; this.setState('open'); this.setSpr('rollarmor_attack'); this.turnAtEdge = true; this.bounces = 0;
      KB.particles(this.cx, this.cy, ['#ffffff', '#e06040'], 6, { spread: 1.6, life: 18 });
      sfx('block');
    }
    pickFrame() {
      if (this.state === 'slam') return this.stateT < SLAM_HIT ? 0 : 1;
      if (this.state === 'open') return 1;
      return undefined;
    }
    draw(g) {
      if (this.freezeT > 0) { this.drawFrozen(g); return; }
      if (this.stunned) {
        const blink = this.stunT < 90 ? (this.stunT & 2) : ((this.stunT >> 3) & 1);
        if (blink) return;
        g.spr('rollarmor_stun', this.cx, this.bottom, { frame: 0, flip: this.dir < 0 });
        return;
      }
      if (this.state === 'roll') {
        this.rot += (this.stateT < ROLL_CURL ? 0.06 : this.vx * 0.09);
        const wx = KB.inhaleWobble(this);
        g.spr('rollarmor_roll', this.cx + wx, this.cy + (this.wobY || 0), this.sprOpts({ t: this.animT / 60, rot: this.rot, flip: false }));
        return;
      }
      if (this.hurtT > 0 && this.state !== 'slam') {
        const wx = KB.inhaleWobble(this);
        g.spr('rollarmor_hurt', this.cx + wx, this.bottom + (this.wobY || 0), this.sprOpts({ t: 0 }));
        return;
      }
      super.draw(g);
      if (this.clang > 0 && (this.clang & 1)) g.spr(this.spr, this.cx, this.bottom, { frame: this.pickFrame() || 0, flip: this.dir < 0, tint: '#ffffff', alpha: 0.5 });
    }
  }

  // Poppy Bros. Jr.：跳躍前進，看到玩家時丟拋物線瞄準炸彈。
  //   QA R2-1 #3：Round 1 的「落點直接算在玩家身上」在無掩體的直走廊幾乎沒有反應時間，
  //   所以 Round 3 加了 18 幀的「舉手預警」（停在 hop 幀 0 + 高舉炸彈 + 黃色火花），
  //   而且距離 < 48px 時不丟改跳開（貼臉炸彈躲不掉）。w1~w2 的投擲間隔再 ×1.5。
  const POPPY_WIND = 18;      // 舉手預警幀
  const POPPY_MINDIST = 48;   // 最小投擲距離（更近就跳開）
  class PoppyBros extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'poppybros'; this.spr = 'poppybros_hop'; this.w = 14; this.h = 16; this.score = 300; this.hopT = 20; this.cool = 50; this.windT = 0; this.ability = null; this.state = 'hop'; }
    onReset() { super.onReset(); this.windT = 0; }
    get throwCD() { return this.tough ? 80 : 120; }   // w1~w2：80 × 1.5 = 120 幀
    throwBomb() {
      // 拋物線瞄準玩家：固定上拋初速，飛行時間回推水平初速（重力 0.16）
      const dx = this.playerDx(), dy = this.playerDy();
      const vy0 = dy < -24 ? -4.2 : -3.4;
      const T = -2 * vy0 / 0.16;
      const vx = clamp(dx / T, -2.8, 2.8);
      this.dir = sign(dx || this.dir);
      KB.spawn(new Bomb({ x: this.cx + this.dir * 6, y: this.y + 4, vx, vy: vy0, dir: this.dir, ownerEnt: this }));
      KB.particles(this.cx + this.dir * 6, this.y + 4, '#ffe040', 3, { spread: 0.8, grav: 0.03, life: 12, size: 1 });
      sfx('spit');
    }
    // 太近就往反方向跳開，不丟炸彈
    hopAway() {
      this.dir = -sign(this.playerDx() || this.dir);
      const map = KB.game.map;
      if (KB.physics.wallAhead(map, this) || KB.physics.edgeAhead(map, this)) this.dir *= -1;
      this.vy = -3.2; this.vx = this.dir * 1.3 * this.exK; this.onGround = false;
      this.hopT = 30; this.cool = Math.max(this.cool, 40);
      KB.particles(this.cx, this.bottom, ['#ffffff', '#d0d0e0'], 3, { spread: 1.0, grav: 0.1, life: 12, size: 1 });
    }
    think() {
      // 舉手預警：站定 18 幀（停格在 hop 幀 0，頭上舉著炸彈）後才丟
      if (this.windT > 0) {
        this.vx = 0;
        if (this.windT % 6 === 0) KB.particles(this.cx, this.y - 6, ['#ffe040', '#ffffff'], 1, { spread: 0.5, grav: 0.02, life: 14, up: 0.6, size: 1 });
        if (--this.windT === 0) this.throwBomb();
        return;
      }
      if (this.onGround) {
        this.vx = 0;
        if (--this.hopT <= 0) {
          if (this.cool <= 0 && this.canSee(120, 64)) {
            if (this.playerDist() < POPPY_MINDIST) { this.hopAway(); return; }
            this.facePlayer(); this.windT = POPPY_WIND; this.cool = this.throwCD; this.hopT = 30; sfx('jump');
            return;
          }
          this.hopT = 30;
          const map = KB.game.map;
          if (playerAlive() && this.playerDist() < 130) this.facePlayer();
          if (KB.physics.wallAhead(map, this) || KB.physics.edgeAhead(map, this)) this.dir *= -1;
          this.vy = -2.8; this.vx = this.dir * 1.0 * this.exK; this.onGround = false;   // Extra：跳躍前進速度 ×KB.exK('spd')
        }
      } else this.vx = this.dir * 1.0 * this.exK;
    }
    pickFrame() { return (this.windT > 0 || this.onGround) ? 0 : 1; }
    draw(g) {
      super.draw(g);
      if (this.windT <= 0) return;
      // 舉手預警的「舉著的炸彈」（沒有專屬的 attack 精靈，改用 proj_bomb 畫在頭頂，最後 6 幀閃白）
      const bob = Math.round(Math.sin(this.windT * 0.5));
      g.spr('proj_bomb', this.cx + this.dir * 2, this.y - 4 + bob, { t: 0, flip: this.dir < 0, tint: (this.windT <= 6 && (this.windT & 1)) ? '#ffffff' : undefined });
    }
  }

  // Scarfy：浮空緩慢跟隨；被嘗試吸入即變臉狂追，碰到玩家或 2 秒後爆炸。不可吸入
  class Scarfy extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'scarfy'; this.spr = 'scarfy_fly'; this.w = 14; this.h = 14; this.grav = 0; this.solid = false;
      this.inhalable = false; this.angry = false; this.angryT = 0; this.phase = Math.random() * Math.PI * 2; this.ability = null;
      this.element = 'ghost'; this.weak = ['spark']; this.resist = ['physical'];   // 幽靈：物理打不痛、怕電
    }
    onInhaleAttempt(p) { if (!this.angry) this.goAngry(); }
    goAngry() { this.angry = true; this.angryT = 120; this.setSpr('scarfy_angry'); KB.particles(this.cx, this.cy, '#ff4040', 6, { spread: 2 }); sfx('enemyhit'); }
    onReset() { super.onReset(); this.angry = false; this.angryT = 0; this.setSpr('scarfy_fly'); }
    think() {
      this.phase += 0.1; this.bob = Math.round(Math.sin(this.phase) * 2);
      if (!playerAlive()) { this.vx *= 0.9; this.vy *= 0.9; return; }
      const p = KB.player, dx = this.playerDx(), dy = this.playerDy();
      if (this.angry) {
        const d = Math.max(1, Math.hypot(dx, dy)), sp = 1.4;
        this.vx = dx / d * sp; this.vy = dy / d * sp;
        if (Math.abs(dx) > 2) this.dir = sign(dx);
        if (this.stateT % 4 === 0) KB.particles(this.cx, this.cy, '#ff6060', 1, { spread: 0.5, grav: 0, life: 10, up: 0 });
        if (--this.angryT <= 0 || this.overlaps(p)) this.explode();
      } else {
        // 停在玩家斜上方一段距離處徘徊
        const tx = p.cx - sign(dx || 1) * 28, ty = p.cy - 20;
        const ex = tx - this.cx, ey = ty - this.cy, d = Math.hypot(ex, ey);
        if (d > 4) { this.vx = ex / d * 0.35; this.vy = ey / d * 0.35; } else { this.vx = 0; this.vy = 0; }
        if (Math.abs(dx) > 2) this.dir = sign(dx);
      }
    }
    explode() {
      if (this.dead) return; this.dead = true;
      KB.hitbox({ x: this.cx - 12, y: this.cy - 12, w: 24, h: 24, dmg: 1, owner: 'enemy', type: 'bomb', life: 4, pierce: true, breakBlocks: false });
      KB.fx('fx_poof', this.cx, this.cy + 8); KB.particles(this.cx, this.cy, ['#ff8040', '#ffe040', '#ffffff'], 10, { spread: 2.5 });
      shake(3); sfx('hammer');
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
    }
    die(src) { if (this.dead) return; if (this.angry && this.freezeT <= 0) { this.explode(); return; } super.die(src); }
  }

  // Gordo：無敵刺球。a='v'|'h' 垂直/水平往返（單程 90 幀），b=距離（格，可為負）；預設不動
  class Gordo extends Baddie {
    constructor(x, y, a, b) {
      super(x, y); this.name = 'gordo'; this.spr = 'gordo'; this.w = 16; this.h = 16; this.hp = 999; this.maxHp = 999;
      this.inhalable = false; this.solid = false; this.grav = 0; this.score = 0; this.ability = null;
      this.mode = (a === 'v' || a === 'h') ? a : null; this.range = (b !== undefined && b !== null ? +b : 2) * T; this.moveT = 0; this.baseX = null; this.baseY = null;
    }
    hurt() { return false; }
    think() {
      if (this.baseX === null) {
        // 以關卡定義的格子為原點（手動生成則取第一次更新時的位置）
        if (this.spawnDef) { this.baseX = this.spawnDef.x * T; this.baseY = this.spawnDef.y * T + T - this.h; }
        else { this.baseX = this.x; this.baseY = this.y; }
      }
      this.vx = 0; this.vy = 0;
      if (!this.mode) return;
      this.moveT++;
      const ph = this.moveT % 180, lin = ph < 90 ? ph / 90 : 1 - (ph - 90) / 90;
      const f = (1 - Math.cos(lin * Math.PI)) / 2;    // 緩入緩出
      if (this.mode === 'h') { this.x = this.baseX + f * this.range; this.dir = (ph < 90 ? 1 : -1) * sign(this.range); }
      else this.y = this.baseY - f * this.range;
    }
  }

  // Cappy：走路；被吸入時只有帽子被吸走，本體變成無害的 cappy_bare 逃跑
  class Cappy extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'cappy'; this.spr = 'cappy_walk'; this.w = 14; this.h = 14; this.speed = 0.5; this.ability = null; }
    onInhaled(p) {
      this.killHitbox(); this.dead = true;
      p.mouth = { ability: null, name: 'cappy_hat', score: 100 };
      if (KB.game) KB.game.addScore(100, this.cx, this.y);
      const bare = new CappyBare(this.x, this.y); bare.bottom = this.bottom; bare.active = true;
      bare.dir = p.cx < this.cx ? 1 : -1; bare.vx = bare.dir * 1.2; bare.vy = -2;
      KB.spawn(bare);
    }
  }
  class CappyBare extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'cappy_bare'; this.spr = 'cappy_bare'; this.w = 12; this.h = 12; this.speed = 1.2; this.score = 100; this.ability = null;
      this.hurtsPlayer = false; this.contactDamage = false; this.inhalable = false; this.graceT = 40;
    }
    think() {
      if (this.graceT > 0 && --this.graceT === 0) this.inhalable = true;
      if (this.onGround && playerAlive() && this.playerDist() < 100) {
        const map = KB.game.map, save = this.dir;
        this.dir = KB.player.cx < this.cx ? 1 : -1;     // 背對玩家逃跑
        if (KB.physics.wallAhead(map, this) || KB.physics.edgeAhead(map, this)) this.dir = save;
      }
      this.walk(this.speed);
    }
  }

  // Twizzy：站著不動的小鳥，玩家靠近就往上斜飛離開畫面
  class Twizzy extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'twizzy'; this.spr = 'twizzy_fly'; this.w = 12; this.h = 12; this.state = 'perch'; this.ability = null; }
    onReset() { super.onReset(); this.setState('perch'); this.solid = true; this.grav = KB.GRAV; this.vx = 0; this.vy = 0; }
    think() {
      if (this.state === 'perch') {
        this.vx = 0; if (playerAlive()) this.facePlayer();
        // 觸發距離 40px < 吸入範圍 52px：卡比慢慢靠近再吸仍抓得到（原 56px 會在吸入範圍外就飛走，永遠吸不到）
        if (this.canSee(40, 32)) {
          this.setState('fly'); this.solid = false; this.grav = 0;
          this.dir = KB.player.cx < this.cx ? 1 : -1; this.vx = this.dir * 1.2; this.vy = -1.4;
          KB.particles(this.cx, this.bottom, '#f8f8f8', 3, { spread: 1, life: 12 });
        }
        return;
      }
      this.vx = this.dir * 1.2; this.vy = -1.4 + Math.sin(this.stateT * 0.3) * 0.5;
      if (KB.game && (this.y + this.h < KB.game.cam.y - 48 || this.stateT > 400)) this.dead = true;   // 飛出畫面：靜默移除
    }
    pickFrame() { return this.state === 'perch' ? 0 : undefined; }
  }

  // Shotzo：無敵大砲，定時朝玩家方向發射砲彈（速度 2.5、不受重力）
  class Shotzo extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'shotzo'; this.spr = 'shotzo'; this.w = 16; this.h = 16; this.hp = 999; this.maxHp = 999; this.inhalable = false; this.solid = false; this.grav = 0; this.score = 0; this.cool = 60; this.ability = null;
      this.element = 'metal'; this.weak = ['spark'];   // 機械：怕電（本體無敵，標籤供圖鑑 / 混合能力判定）
    }
    hurt() { return false; }
    // 射程 170 → 120px（QA R2-1 #2：w5 城門的斜坡上爬時無處可躲）；開火間隔 w1~w2 ×1.6、w3~w5 ×1.3（砲彈速度不變）
    get range() { return 120; }
    get fireCD() { return Math.round(100 * (this.tough ? 1.3 : 1.6)); }
    think() {
      this.vx = 0; this.vy = 0;
      if (!playerAlive()) return;
      this.facePlayer();
      if (this.cool <= 0 && this.playerDist() < this.range && this.onScreen(16)) {
        const p = KB.player, dx = p.cx - this.cx, dy = p.cy - (this.cy - 2), d = Math.max(1, Math.hypot(dx, dy));
        const mx = this.cx + dx / d * 10, my = this.cy - 2 + dy / d * 10;
        KB.shoot({ spr: 'proj_cannonball', x: mx, y: my, vx: dx / d * 2.5, vy: dy / d * 2.5, dmg: 1, owner: 'enemy', life: 160, w: 8, h: 8, grav: 0, solid: true, fxHit: 'fx_poof', type: 'cannon', breakBlocks: false, dir: this.dir, ownerEnt: this });
        KB.particles(mx, my, ['#ffffff', '#a0a0a8'], 5, { spread: 1.2, grav: -0.02, life: 18, up: 0 });
        sfx('hammer'); this.cool = this.fireCD;
      }
    }
  }

  // Squishy：水中上下游動，偶爾朝玩家衝；離開水就落下
  class Squishy extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'squishy'; this.spr = 'squishy_swim'; this.w = 14; this.h = 14; this.grav = 0; this.phase = Math.random() * Math.PI * 2; this.cool = 60; this.dashT = 0; this.hopT = 40; this.ability = null;
      this.weak = ['spark'];   // 水中生物：怕電
    }
    think() {
      const map = KB.game.map, inW = map.inWater(this.cx, this.cy);
      this.phase += 0.06;
      if (inW) {
        this.grav = 0;
        if (this.dashT > 0) {
          this.dashT--;
          const dx = this.playerDx(), dy = this.playerDy(), d = Math.max(1, Math.hypot(dx, dy));
          this.vx = dx / d * 1.3; this.vy = dy / d * 1.3;
          if (Math.abs(this.vx) > 0.1) this.dir = sign(this.vx);
          if (this.hitWall || !map.inWater(this.cx + this.vx * 4, this.cy + this.vy * 4)) this.dashT = 0;
        } else {
          if (this.hitWall || this.x <= 0 || this.x + this.w >= map.pw) this.dir *= -1;
          if (!map.inWater(this.cx + this.dir * 12, this.cy)) this.dir *= -1;   // 水域邊緣轉向
          this.vx = this.dir * 0.4; this.vy = Math.sin(this.phase) * 0.7;
          if (this.vy < 0 && !map.inWater(this.cx, this.y - 3)) this.vy = 0.3;         // 不浮出水面
          if (this.vy > 0 && !map.inWater(this.cx, this.bottom + 3)) this.vy = -0.3;  // 不游出水底
          if (this.cool <= 0 && playerAlive() && map.inWater(KB.player.cx, KB.player.cy) && this.playerDist() < 100) { this.dashT = 40; this.cool = 150; }
        }
      } else {
        this.grav = KB.GRAV;
        if (this.onGround) { this.vx *= 0.8; if (--this.hopT <= 0) { this.hopT = 60; this.vy = -2.2; this.vx = this.dir * 0.8; } }
      }
    }
  }

  // Glunk：固定不動，每 90 幀往上吐泡泡
  class Glunk extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'glunk'; this.spr = 'glunk'; this.w = 14; this.h = 14; this.cool = 45; this.ability = null;
      this.weak = ['spark'];   // 水中生物：怕電
    }
    think() {
      this.vx = 0;
      if (playerAlive()) this.facePlayer();
      if (this.cool <= 0 && playerAlive() && this.playerDist() < 130 && this.onScreen(8)) {
        KB.shoot({ spr: 'proj_airpuff', x: this.cx, y: this.y - 4, vx: 0, vy: -1.5, dmg: 1, owner: 'enemy', life: 60, w: 8, h: 8, grav: 0, solid: false, pierce: false, fxHit: 'fx_poof', type: 'bubble', breakBlocks: false, dir: this.dir, ownerEnt: this });
        KB.particles(this.cx, this.y, '#c0f0ff', 2, { spread: 0.6, grav: -0.02, life: 12 });
        sfx('float'); this.cool = 90;
      }
    }
  }

  // Kabu：石頭圖騰。定時消失 → 在玩家附近（±48px）重新出現 → 朝玩家滑行 20 幀。hp 3
  class Kabu extends Baddie {
    constructor(x, y) { super(x, y); this.name = 'kabu'; this.spr = 'kabu'; this.w = 16; this.h = 16; this.hp = 3; this.maxHp = 3; this.state = 'idle'; this.hidden = false; this.turnAtEdge = false; this.ability = null; }
    hurt(a, s) { if (this.hidden) return false; return super.hurt(a, s); }
    onReset() { super.onReset(); this.show(); this.setState('idle'); }
    hide() { this.hidden = true; this.hurtsPlayer = false; this.inhalable = false; this.vx = 0; }
    show() { this.hidden = false; this.hurtsPlayer = true; this.inhalable = true; }
    think() {
      const map = KB.game.map;
      if (this.state === 'idle') {
        this.vx = 0; if (playerAlive()) this.facePlayer();
        if (this.stateT >= 70 && playerAlive()) { KB.fx('fx_poof', this.cx, this.cy + 8); this.hide(); this.setState('gone'); }
      } else if (this.state === 'gone') {
        if (this.stateT >= 45) {
          const p = KB.player, side = Math.random() < 0.5 ? -1 : 1;
          for (const s of [side, -side]) {
            const nx = p.cx + s * 48 - this.w / 2, ny = p.bottom - this.h;
            const free = nx >= 0 && nx + this.w <= map.pw &&
              !map.isSolidPx(nx + 2, ny + 2) && !map.isSolidPx(nx + this.w - 3, ny + 2) && !map.isSolidPx(nx + 2, ny + this.h - 2) && !map.isSolidPx(nx + this.w - 3, ny + this.h - 2);
            if (free) { this.x = nx; this.y = ny; break; }
          }
          this.show(); this.vy = 0; this.facePlayer();
          KB.fx('fx_poof', this.cx, this.cy + 8); KB.particles(this.cx, this.cy, '#c0c0c8', 6, { spread: 2 });
          this.setState('slide');
        }
      } else if (this.state === 'slide') {
        this.vx = this.dir * 1.5;
        if (this.stateT >= 20 || this.hitWall) { this.vx = 0; this.setState('idle'); }
      }
    }
    draw(g) { if (this.hidden) return; super.draw(g); }
  }

  // =====================================================================
  //  原創新敵人（本作獨有）
  // =====================================================================
  // Spike Roller（滾刺球）：沿地面滾動的紫色刺球，不怕懸崖；察覺玩家就加速輾過去。無能力。
  class SpikeRoller extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'spikeball'; this.spr = 'spikeball_roll'; this.w = 14; this.h = 14;
      this.hp = 3; this.maxHp = 3; this.speed = 0.7; this.score = 400; this.ability = null;
      this.turnAtEdge = false; this.rot = 0; this.cool = 30; this.state = 'roll';
    }
    onReset() { super.onReset(); this.rot = 0; this.setSpr('spikeball_roll'); }
    think() {
      if (this.state === 'dash') {
        this.vx = this.dir * 2.3 * this.exK;   // Extra：衝撞速度 ×KB.exK('spd')
        if (this.stateT % 3 === 0) KB.particles(this.cx - this.dir * 7, this.bottom - 2, ['#c8b0f8', '#ffffff'], 1, { spread: 0.7, up: 0.4, life: 12, size: 1 });
        if (this.hitWall) { this.dir *= -1; shake(2); sfx('block'); KB.particles(this.cx, this.cy, '#c8b0f8', 6, { spread: 2, life: 14 }); }
        if (this.stateT >= 80 || !this.canSee(150, 60)) { this.setState('roll'); this.setSpr('spikeball_roll'); this.cool = 70; }
        return;
      }
      this.setSpr('spikeball_roll');
      this.walk();
      if (this.cool <= 0 && this.onGround && this.notice(96, 40)) {
        this.facePlayer(); this.setState('dash'); this.setSpr('spikeball_dash'); sfx('stone');
      }
    }
    draw(g) {
      if (this.freezeT > 0) { this.drawFrozen(g); return; }
      this.rot += this.vx * 0.1;
      this.drawGlow(g);
      const wx = KB.inhaleWobble(this);
      g.spr(this.spr, this.cx + wx, this.cy + (this.wobY || 0), this.sprOpts({ t: this.animT / 60, rot: this.rot, flip: false }));
    }
    drawFrozen(g) {
      g.spr(this.spr, this.cx, this.cy, { frame: 0, rot: this.rot, tint: '#a0e8ff' });
      g.rect(this.x - 2, this.y - 2, this.w + 4, this.h + 2, 'rgba(160,230,255,0.45)');
    }
  }

  // Dart Wing（飛羽鳥）：正弦飛行；察覺玩家後停在斜上方投擲羽刃（瞄準玩家）。無能力。
  class DartWing extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'dartwing'; this.spr = 'dartwing_fly'; this.w = 14; this.h = 12;
      this.grav = 0; this.solid = false; this.speed = 0.8; this.score = 300; this.ability = null;
      this.phase = Math.random() * Math.PI * 2; this.cool = 50; this.state = 'fly';
    }
    onReset() { super.onReset(); this.grav = 0; this.solid = false; this.setSpr('dartwing_fly'); }
    think() {
      this.phase += 0.09;
      if (this.state === 'throw') {
        this.vx *= 0.85; this.vy = Math.cos(this.phase) * 0.4;
        if (this.stateT === 10) {
          const dx = this.playerDx(), dy = this.playerDy(), d = Math.max(1, Math.hypot(dx, dy));
          KB.shoot({ spr: 'proj_feather', x: this.cx + dx / d * 9, y: this.cy + dy / d * 9, vx: dx / d * 2.8, vy: dy / d * 2.8,
            dmg: 1, owner: 'enemy', life: 110, w: 8, h: 6, grav: 0, solid: true, pierce: false, inhalable: true,
            type: 'feather', fxHit: 'fx_hit', breakBlocks: false, dir: dx < 0 ? -1 : 1, ownerEnt: this });
          sfx('cutter');
        }
        if (this.stateT >= 30) { this.setState('fly'); this.setSpr('dartwing_fly'); this.cool = 90; }
        return;
      }
      const map = KB.game.map;
      if (this.notice(120, 90)) {
        // 停在玩家斜上方 40px 處盤旋
        const p = KB.player, tx = p.cx - this.dir * 6, ty = p.cy - 44;
        const ex = tx - this.cx, ey = ty - this.cy, d = Math.hypot(ex, ey);
        if (d > 5) { this.vx = clamp(ex * 0.04, -1.3, 1.3); this.vy = clamp(ey * 0.04, -1.1, 1.1) + Math.cos(this.phase) * 0.3; }
        else { this.vx *= 0.8; this.vy = Math.cos(this.phase) * 0.4; }
        if (Math.abs(this.playerDx()) > 4) this.facePlayer();
        if (this.cool <= 0) { this.setState('throw'); this.setSpr('dartwing_throw'); }
      } else {
        if (this.x <= 0 && this.dir < 0) this.dir = 1;
        if (this.x + this.w >= map.pw && this.dir > 0) this.dir = -1;
        if (KB.physics.wallAhead(map, this)) this.dir *= -1;
        this.vx = this.dir * this.speed;
        this.vy = Math.cos(this.phase) * 0.8;
      }
    }
  }

  // Snowly（雪人）：走路；察覺玩家後噴出寒霧（帶凍結旗標）。吸入可得 ice。
  class Snowly extends Baddie {
    constructor(x, y) {
      super(x, y); this.name = 'snowly'; this.spr = 'snowly_walk'; this.w = 14; this.h = 17;
      this.hp = 3; this.maxHp = 3; this.speed = 0.45; this.score = 350; this.ability = 'ice'; this.cool = 50;
      this.element = 'ice'; this.weak = ['fire']; this.resist = ['ice'];   // 冰屬性：怕火、抗冰
    }
    think() {
      if (this.state === 'attack') {
        this.vx = 0;
        if (this.stateT === 8) { this.hitbox = KB.hitbox({ x: 0, y: 0, w: 34, h: 18, dmg: 1, owner: 'enemy', type: 'ice', follow: this, ox: 5, oy: 1, life: 40, rehit: 12, freeze: true, breakBlocks: false }); sfx('ice'); }
        if (this.stateT >= 8 && this.stateT < 48 && this.stateT % 4 === 0) {
          KB.fx('fx_ice', this.cx + this.dir * (12 + (this.stateT % 14)), this.cy + 4, { flip: this.dir < 0, vx: this.dir * 1.1, life: 12 });
          KB.particles(this.cx + this.dir * 18, this.cy + 4, ['#ffffff', '#c8f4ff'], 1, { spread: 0.6, grav: 0.02, life: 16, up: 0.1, vx: this.dir * 0.8, size: 1 });
        }
        if (this.stateT >= 56) { this.killHitbox(); this.setState('walk'); this.setSpr('snowly_walk'); this.cool = 110; }
        return;
      }
      this.setSpr('snowly_walk');
      const see = this.notice(96, 40);
      if (see && this.onGround) {
        if (this.playerDist() > 40) this.chase(this.speed * this.alertK); else { this.facePlayer(); this.vx = 0; }
      } else this.walk();
      if (this.cool <= 0 && this.onGround && this.canSee(72, 28)) { this.facePlayer(); this.vx = 0; this.setState('attack'); this.setSpr('snowly_attack'); }
    }
  }

  // =====================================================================
  //  註冊
  // =====================================================================
  Object.assign(KB.ENEMIES, {
    spikeball: SpikeRoller, dartwing: DartWing, snowly: Snowly, rollarmor: Rollarmor,
    waddledee: WaddleDee, waddledoo: WaddleDoo, brontoburt: BrontoBurt, hothead: HotHead, sirkibble: SirKibble,
    sparky: Sparky, rocky: Rocky, chilly: Chilly, bladeknight: BladeKnight, bonkers: Bonkers, mrfrosty: MrFrosty,
    poppybros: PoppyBros, scarfy: Scarfy, gordo: Gordo, cappy: Cappy, cappy_bare: CappyBare, twizzy: Twizzy,
    shotzo: Shotzo, squishy: Squishy, glunk: Glunk, kabu: Kabu,
  });
  KB.Baddie = Baddie; KB.MiniBoss = MiniBoss;
  KB.EnemyProj = { Boomerang, Bomb, Slider };
})();
