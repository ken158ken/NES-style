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
    constructor(x, y) { super(x, y); this.spr = 'item_1up'; this.name = 'oneup'; this.score = 0; this.sfx = 'oneup'; }
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
  // ---------- 收集品：大星星（每關 3 顆，存 KB.save.stars[levelId] = [bool×3]）----------
  // 關卡以 { t:'bigstar', x, y, a:0|1|2 } 生成；a 為該關的第幾顆（0/1/2，不可重複）。
  // 已拿過的在 loadRoom 時就直接 dead（建構時檢查存檔），所以不需要 game.js 的鉤子。
  KB.ITEMS.bigstar = class extends Item {
    constructor(x, y, idx) {
      super(x, y);
      this.spr = 'item_bigstar'; this.name = 'bigstar'; this.w = 16; this.h = 16; this.score = 2000; this.sfx = 'bigstar'; this.z = 3;
      this.idx = Math.max(0, Math.min(2, idx | 0));
      this.levelId = KB.game ? KB.game.levelId : '';
      const got = KB.save && KB.save.stars && KB.save.stars[this.levelId];
      if (got && got[this.idx]) this.dead = true;   // 已收集：不再生成
    }
    onCollect(p) {
      KB.save.stars = KB.save.stars || {};
      const a = KB.save.stars[this.levelId] = KB.save.stars[this.levelId] || [false, false, false];
      a[this.idx] = true;
      try { KB.saveGame(); } catch (e) { }
      const n = a.filter(Boolean).length;
      KB.particles(this.cx, this.cy, ['#ffffff', '#ffe040', '#fff8b0'], 18, { spread: 3, life: 45 });
      KB.fx('fx_sparkle', this.cx, this.cy);
      if (KB.game.shake !== undefined) KB.game.shake = Math.max(KB.game.shake, 3);
      KB.game.toast('大星星 ' + n + '/3');
    }
    draw(g) {
      const bob = Math.round(Math.sin(this.t * 3) * 2);
      // 背後的光暈（讓它在關卡裡一眼看得出來）
      const r = 10 + Math.sin(this.t * 4) * 1.5;
      g.circle(this.cx, this.cy + bob, r, 'rgba(255,232,120,0.20)');
      g.spr(this.spr, this.cx, this.bottom + bob, { t: this.t });
    }
  };

  // ---------- 開關方塊：被攻擊後解鎖同房所有 locked 門 ----------
  // 掛成 enemy（game.collisions 只對 enemy/boss/敵方投射物判定玩家攻擊），但不會傷人也不能被吸入。
  KB.ITEMS.switchblock = class extends KB.Enemy {
    constructor(x, y) {
      super(x, y);
      this.name = 'switchblock'; this.spr = 'item_switch'; this.w = 16; this.h = 16;
      this.hp = this.maxHp = 1; this.score = 0; this.grav = 0; this.solid = false;
      this.inhalable = false; this.hurtsPlayer = false; this.contactDamage = false; this.damage = 0;
      this.turnAtEdge = false; this.turnAtWall = false; this.walkAnim = false; this.persistent = true; this.z = 1;
      this.pressed = false;
    }
    ai(dt) { this.vx = 0; this.vy = 0; }
    hurt(amount, src) {
      if (this.pressed || this.dead) return false;
      this.pressed = true;
      KB.audio.sfx('unlock');
      KB.fx('fx_sparkle', this.cx, this.cy);
      KB.particles(this.cx, this.cy, ['#ffffff', '#ffe040'], 12, { spread: 2.5 });
      if (KB.game) { KB.game.shake = Math.max(KB.game.shake || 0, 5); KB.unlockDoors(KB.game, '開關被按下了！'); }
      return true;
    }
    die() { }
    draw(g) {
      if (!this.pressed) { const glow = 6 + Math.sin(this.t * 5) * 2; g.circle(this.cx, this.cy, glow, 'rgba(255,224,64,0.18)'); KB.drawDoorLocks(g); }
      g.spr(this.spr, this.cx, this.bottom, { frame: this.pressed ? 2 : (Math.floor(this.t * 3) & 1) });
    }
  };

  // ---------- 門鎖：房內還有活著的中魔王時，locked 門維持鎖上（畫鎖鏈）；中魔王倒下就解鎖 ----------
  KB.ITEMS.gatekeeper = class extends KB.Entity {
    constructor(x, y) {
      super(x, y);
      this.type = 'fx'; this.name = 'gatekeeper'; this.w = 1; this.h = 1; this.z = 7;
      this.solid = false; this.grav = 0; this.hurtsPlayer = false; this.inhalable = false;
      this.opened = false; this.warnT = 0; this.musicSet = false;
    }
    aliveMinis() {
      const g = KB.game; if (!g) return 0;
      let n = 0;
      for (const e of g.entities) if (!e.dead && KB.MiniBoss && e instanceof KB.MiniBoss && !e.stunned) n++;
      return n;
    }
    update(dt) {
      this.baseUpdate(dt);
      if (this.opened) return;
      // 中魔王房專用曲（audio agent 提供 'miniboss'；沒有的話 audio.js 會 warnOnce）
      if (!this.musicSet && KB.game) { this.musicSet = true; if (this.aliveMinis() > 0) KB.game.playMusic('miniboss'); }
      if (this.aliveMinis() > 0) {
        // 玩家想開鎖門時給提示
        const p = KB.player;
        if (p && this.warnT <= 0 && KB.game) {
          for (const e of KB.game.entities) {
            if (e.type === 'door' && e.locked && !e.dead && p.overlapsRect(e.x, e.y, e.w, e.h)) {
              this.warnT = 150; KB.game.toast('門被鎖住了…'); break;
            }
          }
        }
        if (this.warnT > 0) this.warnT--;
        return;
      }
      this.opened = true;
      if (KB.game) KB.game.playMusic(KB.game.room.music || KB.game.level.music || KB.game.theme);
      KB.unlockDoors(KB.game, '出口解鎖了！');
    }
    draw(g) { if (!this.opened) KB.drawDoorLocks(g); }
  };

  // 在所有 locked 門上畫鎖鏈與掛鎖（開關方塊 / 中魔王門鎖共用）
  KB.drawDoorLocks = function (g) {
    if (!KB.game) return;
    for (const e of KB.game.entities) {
      if (e.dead || e.type !== 'door' || !e.locked) continue;
      const y = e.y - 8;   // 門的精靈高 24px，畫在門框的中段
      g.rect(e.x - 3, y + 6, e.w + 6, 3, '#b0b0bc');
      g.rect(e.x - 3, y + 9, e.w + 6, 1, '#5c5c68');
      g.rect(e.x - 3, y + 15, e.w + 6, 3, '#b0b0bc');
      g.rect(e.x - 3, y + 18, e.w + 6, 1, '#5c5c68');
      g.rect(e.cx - 4, y + 8, 8, 9, '#f8e040');
      g.rect(e.cx - 4, y + 8, 8, 2, '#fff8b0');
      g.rect(e.cx - 3, y + 5, 6, 4, '#d0d0dc');
      g.rect(e.cx - 1, y + 5, 2, 3, '#5c5c68');
      g.rect(e.cx - 1, y + 11, 2, 4, '#604818');
    }
  };

  // 解鎖目前房間所有 locked 門（開關方塊 / 門鎖共用）
  KB.unlockDoors = function (game, msg) {
    if (!game) return 0;
    let n = 0;
    for (const e of game.entities) {
      if (e.type !== 'door' || !e.locked || e.dead) continue;
      e.locked = false; n++;
      KB.fx('fx_sparkle', e.cx, e.cy);
      KB.particles(e.cx, e.cy, ['#ffffff', '#ffe040'], 10, { spread: 2 });
    }
    if (n) { KB.audio.sfx('unlock'); if (msg) game.toast(msg); }
    return n;
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
