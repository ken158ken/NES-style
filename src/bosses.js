// 魔王：大樹威斯比 / 洛洛洛與拉拉拉 / 克拉寇 / 魅塔騎士 / 迪迪迪大王
// 行為以 Kirby's Dream Land / Adventure 為藍本的原創實作。一切以幀計時（60fps），不用 setTimeout。
//
// 與 game.js 的約定：
//   - loadRoom 以 new B(bx, by) 生成，(bx,by) 為「腳站的磁磚」左上角（與 spawnDef 相同慣例）：基底把 bottom 對齊 by+16。
//   - 登場期間 game 只呼叫 boss.introUpdate(dt)；bossIntroT 歸零時 game 設 introducing=false，
//     基底在第一次 update() 觸發 onIntroEnd()（魅塔騎士在此丟劍）。
//   - 受傷由 game.collisions 呼叫 hurt()；hp<=0 → die()：先 sfx('boss_die') 再 dead=true，game 會做爆星演出並生成過關門。
//   - 本體碰觸傷害由 hurtsPlayer / contactDamage 控制；投射物一律 owner:'enemy'；可吸入的彈藥用 Ammo（inhalable=true）。
//   - 精靈全部「面向右」繪製，dir<0 時翻轉（威斯比 dir=-1 固定面向左）。找不到精靈時額外畫出碰撞框顏色方便 QA。
//
// 平衡原則（tools/boss_test.py 的「普通玩家」策略每一場都要能打贏）：
//   - 卡比一受傷就掉能力，所以「本體碰觸傷害」只留在魔王主動撞過來的招式：威斯比（不動的樹）與洛洛洛全程有；
//     克拉寇除了低空盤旋（給玩家打的窗口）外都有；魅塔騎士只有衝刺斬；迪迪迪只有跳躍砸地與吸入拉人。
//   - 每個魔王都有不靠能力也打得到的手段：蘋果 / 箱子 / 雨滴與小兵 / 丟給你的劍 / 落地衝擊星（都可吸入吐回）。
//   - 瞄準玩家的招式都有預警（竄根 36 幀、閃電 30 幀、吸入 16 幀），且站著不動才會中；被連段時魔王會反擊（硬直冷卻 / 霸體）。
//   - 魔王不會站在玩家身上壓著打（迪迪迪 hop）、被打飛的搭檔會回來（洛洛洛），避免卡死或打不到。
(function () {
  KB.BOSSES = KB.BOSSES || {};
  const T = KB.TILE;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const NO_PULL = { dead: 1, door: 1, stone: 1, dance: 1, hurt: 1 };

  // 從 fromY 所在格往下找第一塊可站立磁磚（實心 / 斜坡 / 單向平台）的頂端 y（世界 px）；找不到回傳地圖底
  function groundY(x, fromY) {
    const map = KB.game && KB.game.map; if (!map) return fromY;
    const tx = Math.floor(x / T);
    for (let ty = Math.max(0, Math.floor(fromY / T)); ty < map.h; ty++) {
      const ch = map.get(tx, ty);
      if (KB.TileMap.isGround(ch) || ch === '=') return ty * T;
    }
    return map.ph;
  }
  const mapW = () => (KB.game && KB.game.map ? KB.game.map.pw : 512);
  const solidAt = (px, y0, y1) => !!(KB.game && KB.physics.columnSolid(KB.game.map, px, y0, y1));
  const standable = ch => KB.TileMap.isGround(ch) || ch === '=';

  // ---------- 可吸入的魔王彈藥（蘋果 / 箱子 / 雨滴）----------
  // 與一般 Projectile 差異：被吸入時凍結物理並提供 pullTo；落地可選擇是否消失；可被魔王推著走（pusher）。
  class Ammo extends KB.Projectile {
    constructor(o) {
      super(o);
      this.inhalable = true; this.beingInhaled = false; this.inhaleSrc = null;
      this.name = o.name || 'ammo'; this.score = o.score || 50; this.color = o.color || '#ffe040';
      this.dieOnGround = !!o.dieOnGround; this.breakOnWall = o.breakOnWall !== false;
      this.friction = o.friction !== undefined ? o.friction : 0.9;
      this.maxFall = o.maxFall || 4; this.pusher = null;
      this.restBreak = o.restBreak || 0; this.restT = 0;   // 靜止在地上超過 restBreak 幀就碎掉（0=不會）
      this.bounceY = o.bounceY || 0; this.bounces = 0;     // 落地彈跳（衝擊星）
      // harmless：純彈藥（迪迪迪的衝擊星）。game.collisions 對 owner:'enemy' 的 proj 一律判傷害，
      // 所以改掛 type:'item'（仍可被吸入；不會被玩家攻擊打碎、也不會傷到玩家）。
      this.harmless = !!o.harmless;
      if (this.harmless) { this.type = 'item'; this.hurtsPlayer = false; this.dmg = 0; this.damage = 0; }
    }
    pullTo(px, py, s) {
      const dx = px - this.cx, dy = py - this.cy, d = Math.max(1, Math.hypot(dx, dy));
      this.x += dx / d * s; this.y += dy / d * s; this.vx = 0; this.vy = 0;
    }
    onInhaled(p) {
      this.dead = true; p.mouth = { ability: null, name: this.name, score: this.score };
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
    }
    shatter() {
      if (this.dead) return; this.dead = true;
      KB.fx(this.fxHit, this.cx, this.cy + 6); KB.particles(this.cx, this.cy, this.color, 5, { spread: 1.5 });
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.shatter(); return; }
      // 被吸入中：暫時掛 type:'item'。game.collisions 對 owner:'enemy' 的 proj 不會排除 beingInhaled，
      // 而彈藥被拉到嘴巴判定前一定會先跟卡比身體重疊，否則卡比會被自己正在吸的蘋果打到。
      if (this.beingInhaled) { if (!this.harmless) this.type = 'item'; return; }
      if (!this.harmless && this.type === 'item') this.type = 'proj';
      if (this.pusher) { if (this.pusher.dead || this.pusher.box !== this) this.pusher = null; else return; }
      this.rot += this.rotSpeed;
      this.physics();
      if (this.hitWall) { if (this.breakOnWall) { this.shatter(); return; } this.vx = 0; }
      if (this.onGround) {
        if (this.dieOnGround) { this.shatter(); return; }
        if (this.bounceY && this.bounces < 3) { this.bounces++; this.vy = -this.bounceY / this.bounces; this.onGround = false; }
        this.vx *= this.friction; if (Math.abs(this.vx) < 0.05) this.vx = 0;
        if (this.restBreak && this.vx === 0) { if (++this.restT > this.restBreak) { this.shatter(); return; } }
        else this.restT = 0;
      }
      if (this.fellOut) this.dead = true;
    }
    draw(g) {
      if (!KB.has(this.spr)) g.rect(this.x, this.y, this.w, this.h, this.color);
      super.draw(g);
    }
  }
  KB.BossAmmo = Ammo;
  // 雨滴：沒有專用精靈，直接畫（不觸發 missing sprite）
  class Raindrop extends Ammo {
    draw(g) {
      g.rect(this.x + 1, this.y + 2, this.w - 2, this.h - 2, '#80c0ff'); g.rect(this.x + 2, this.y, this.w - 4, 2, '#c0e8ff'); g.rect(this.x + 2, this.y + 3, 1, 2, '#ffffff');
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(255,0,0,0.3)');
    }
  }

  // ---------- 地面震波（迪迪迪落地）：沿地面前進的敵方判定框 ----------
  class Shockwave extends KB.Hitbox {
    constructor(x, gy, dir, o) {
      o = o || {};
      super({ x: x - 6, y: gy - 10, w: 12, h: 10, dmg: o.dmg || 1, owner: 'enemy', type: 'shock', life: o.life || 45, pierce: true, rehit: 0, breakBlocks: false });
      this.vx = dir * (o.speed || 2.5); this.dir = dir; this.color = o.color || '#ffe080';
    }
    update(dt) {
      super.update(dt); if (this.dead) return;
      this.x += this.vx;
      if (solidAt(this.dir > 0 ? this.x + this.w : this.x, this.y + 2, this.y + this.h - 2)) { this.dead = true; return; }
      const gy = groundY(this.cx, this.y + this.h - 4);
      if (gy - (this.y + this.h) > 24) { this.dead = true; return; } // 掉下懸崖就消散
      this.y = gy - this.h;
      if ((this.life & 1) === 0) KB.particles(this.cx, this.y + this.h, this.color, 2, { spread: 1, up: 1.5, life: 14 });
    }
    draw(g) {
      g.rect(this.x, this.y + 4, this.w, this.h - 4, this.color); g.rect(this.x + 2, this.y, this.w - 4, 4, '#ffffff');
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(255,0,0,0.3)');
    }
  }
  KB.Shockwave = Shockwave;

  // ---------- 魔王基底 ----------
  class Boss extends KB.Enemy {
    constructor(x, y) {
      super(x, y);
      this.type = 'boss'; this.hp = 40; this.maxHp = 40; this.inhalable = false; this.score = 5000;
      this.w = 40; this.h = 40; this.state = 'idle'; this.stateT = 0; this.introducing = true;
      this.displayName = 'BOSS'; this.subtitle = 'BOSS'; this.z = 2; this.active = true;
      this.hurtsPlayer = true; this.damage = 1; this.contactDamage = true; this.untouchable = false; this.hidden = false;
      this.turnAtEdge = false; this.turnAtWall = false; this.hurtT = 0; this.started = false; this.walkAnim = false;
      this.spr = ''; this.color = '#f000f0';
      this.spawnX = x; this.spawnY = y; this.bottom = y + T;   // (x,y) = 腳站的磁磚 → 底部貼齊格子底
      this.rngS = (1234567 + Math.floor(x * 7 + y * 13)) & 0x7fffffff;
      // game.loadRoom 會在載入時就把 room.exit 的過關門放進房間（玩家可直接跳過魔王）；
      // 魔王房的過關門應由 game.spawnExitDoor 在魔王死後生成，這裡先把它收掉（門在登場期間也不可用）。
      if (KB.game && KB.game.entities) for (const e of KB.game.entities) if (e.type === 'door' && e.exit && !e.dead) { e.dead = true; e.locked = true; }
    }
    setSize(w, h) { this.w = w; this.h = h; this.bottom = this.spawnY + T; }
    rng() { this.rngS = (Math.imul(this.rngS, 1103515245) + 12345) & 0x7fffffff; return this.rngS / 0x7fffffff; }
    setState(s) { this.state = s; this.stateT = 0; }
    get floorY() { return groundY(this.cx, this.bottom); }
    // 登場期間（game 只呼叫這個）：動畫計時、有物理的魔王落到地面
    introUpdate(dt) { this.t += dt; if (this.solid) { this.vx = 0; this.physics(); } }
    update(dt) {
      this.baseUpdate(dt);
      this.stateT++; if (this.hurtT > 0) this.hurtT--;
      if (this.introducing) { this.introUpdate(dt); return; }
      if (!this.started) { this.started = true; this.onIntroEnd(); }
      this.ai(dt);
      if (this.solid) this.physics();
      if (this.fellOut) { this.x = this.spawnX; this.bottom = this.spawnY + T; this.vy = 0; } // 安全：不讓魔王掉出地圖
    }
    onIntroEnd() { }
    ai(dt) { }
    hurt(amount, src) {
      if (this.dead || this.invuln > 0 || this.introducing || this.untouchable) return false;
      this.hp -= amount; this.flash = 10; this.invuln = 12; this.hurtT = 20;
      KB.audio.sfx('boss_hurt');
      const hx = src && src.cx !== undefined ? clamp(src.cx, this.x, this.x + this.w) : this.cx;
      const hy = src && src.cy !== undefined ? clamp(src.cy, this.y, this.bottom) : this.cy;
      KB.fx('fx_hit', hx, hy + 6);
      if (this.hp <= 0) { this.hp = 0; this.die(src); return true; }
      this.onHurt(amount, src);
      return true;
    }
    onHurt(amount, src) { }
    die(src) {
      if (this.dead) return;
      KB.audio.sfx('boss_die');
      this.onDeath(src);
      this.dead = true;
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
    }
    onDeath(src) { }
    // 繪製：找不到精靈時額外畫出碰撞框（QA 用），受傷閃白由 sprOpts 處理
    drawBody(g, spr, opts) {
      if (this.hidden) return;
      opts = this.sprOpts(opts || {});
      if (!KB.has(spr)) g.rect(this.x, this.y, this.w, this.h, (this.flash > 0 && (this.flash & 2)) ? '#ffffff' : this.color);
      g.spr(spr, this.cx, this.bottom, opts);
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(255,128,0,0.3)');
    }
    draw(g) { this.drawBody(g, this.spr); }
  }
  KB.Boss = Boss;

  // =====================================================================
  // W1 大樹威斯比：固定不動的大樹。吹氣 → 掉蘋果（可吸入吐回，主要攻擊手段）→ 偶爾竄根。
  // =====================================================================
  class WhispyWoods extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '大樹威斯比'; this.subtitle = 'WHISPY WOODS'; this.name = 'whispywoods';
      this.hp = this.maxHp = 40; this.score = 5000; this.color = '#8a5a30';
      this.solid = false; this.grav = 0; this.dir = -1; this.spr = 'whispy_idle';
      this.setSize(40, 96);
      this.cycle = 0; this.puffs = 0; this.apples = 0; this.rootX = 0; this.rootY = 0;
      this.setState('idle');
    }
    snap() { this.bottom = groundY(this.cx, this.bottom - 1); }
    introUpdate(dt) { this.t += dt; this.snap(); }
    onIntroEnd() { this.snap(); }
    nextAttack() {
      const seq = ['blow', 'apple', 'root'];
      this.cycle++; this.puffs = 0; this.apples = 0;
      this.setState(seq[(this.cycle - 1) % seq.length]);
    }
    // 氣團：第 1、3 顆貼地（站著會中，要跳過去），第 2 顆在跳躍高度（跳起來會中）
    blow() {
      const low = this.puffs !== 2;
      const mx = this.x - 4, my = low ? this.bottom - 11 : this.bottom - 44;
      KB.shoot({ spr: 'proj_airpuff', x: mx, y: my, vx: -2, dmg: 1, owner: 'enemy', life: 220, w: 14, h: 14, dir: -1, solid: true, fxHit: 'fx_poof', type: 'airpuff' });
      KB.particles(mx, my, '#e8f8ff', 4, { spread: 1.2, vx: -1, grav: 0, life: 14, up: 0 });
    }
    // 蘋果在樹左側的地面上方隨機落下（不瞄準玩家）：是主要的可吸入彈藥
    dropApple() {
      const x = clamp(this.x - 16 - this.rng() * Math.min(200, this.x - 28), 12, this.x - 10);
      const y = Math.max(6, this.y - 12);
      KB.spawn(new Ammo({ spr: 'proj_apple', x, y, vx: 0, vy: 0.5, grav: 0.16, maxFall: 3.2, dmg: 1, owner: 'enemy', life: 400, w: 12, h: 12, solid: true, dieOnGround: true, name: 'apple', score: 100, fxHit: 'fx_poof', type: 'apple', color: '#e83030' }));
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      if (this.hurtT > 0 && this.stateT % 4 === 0) KB.particles(this.x + 12, this.y + 34, '#80c0ff', 1, { spread: 0.3, grav: 0.2, life: 22, up: 0.4 }); // 流淚
      switch (this.state) {
        case 'idle':
          if (this.stateT > 50) this.nextAttack();
          break;
        case 'blow':
          if (this.stateT % 24 === 6 && this.puffs < 3) { this.puffs++; this.blow(); }
          if (this.stateT > 84) this.setState('idle');
          break;
        case 'apple':
          if (this.stateT % 30 === 10 && this.apples < 3) { this.apples++; this.dropApple(); }
          if (this.stateT > 104) this.setState('idle');
          break;
        case 'root':   // 竄根：瞄準玩家腳下，36 幀泥土噴起預警後竄出（站著不動會被打到，走開就沒事）
          if (this.stateT === 1) { this.rootX = clamp(p.cx, 8, this.x - 14); this.rootY = groundY(this.rootX, p.bottom - 2); }
          if (this.stateT < 36 && this.stateT % 3 === 0) KB.particles(this.rootX + (this.rng() - 0.5) * 10, this.rootY, '#8a5a30', 1, { spread: 0.6, grav: 0.1, life: 14, up: 1.2 }); // 預警：泥土噴起
          if (this.stateT === 36) {
            KB.hitbox({ x: this.rootX - 6, y: this.rootY - 22, w: 12, h: 22, dmg: 1, owner: 'enemy', type: 'root', life: 24, pierce: true });
            KB.particles(this.rootX, this.rootY, '#8a5a30', 8, { spread: 1.8 }); KB.audio.sfx('block');
          }
          if (this.stateT > 84) this.setState('idle');
          break;
      }
    }
    draw(g) {
      const spr = this.hurtT > 0 ? 'whispy_hurt' : (this.state === 'blow' ? 'whispy_blow' : 'whispy_idle');
      this.drawBody(g, spr);
      if (this.state === 'root' && this.stateT >= 36 && this.stateT < 66) {
        if (!KB.has('whispy_root')) g.rect(this.rootX - 6, this.rootY - 22, 12, 22, '#8a5a30');
        g.spr('whispy_root', this.rootX, this.rootY, { t: this.t });
      }
    }
  }
  KB.BOSSES.whispywoods = WhispyWoods;

  // =====================================================================
  // W2 洛洛洛與拉拉拉：兩人各在自己的平台左右來回推箱子（箱子可吸入吐回）。
  // 血量共用 30（主實體 lololo 的 hp 為總池；每人各自 15 點，歸零者先被打飛）。
  // =====================================================================
  class LoloBase extends Boss {
    constructor(x, y) {
      super(x, y);
      this.solid = true; this.grav = KB.GRAV; this.speed = 0.9; this.box = null; this.selfHp = this.maxSelfHp = 15;
      this.hopOnPush = false; this.ko = false; this.koT = 0; this.color = '#4060e0'; this.spr = 'lololo_walk';
      this.setSize(18, 22); this.dir = -1; this.setState('idle');
    }
    get leader() { return this; }
    frontX(ent) { return this.dir > 0 ? ent.x + ent.w + 1 : ent.x - 1; }
    releaseBox(push) {
      const b = this.box; this.box = null; if (!b || b.dead) return;
      b.pusher = null; b.vx = push ? this.dir * 2.5 : 0; b.friction = push ? 0.96 : 0.9;
    }
    spawnBox() {
      if (solidAt(this.dir > 0 ? this.x + this.w + 17 : this.x - 17, this.y + 2, this.bottom - 2)) { this.dir *= -1; this.setState('idle'); return; }
      const b = new Ammo({ spr: 'proj_box', x: this.dir > 0 ? this.x + this.w + 8 : this.x - 8, y: this.bottom - 8, w: 16, h: 16, dmg: 1, owner: 'enemy', life: 900, grav: KB.GRAV, solid: true, pierce: true, breakOnWall: true, restBreak: 60, name: 'box', score: 100, fxHit: 'fx_blockbreak', type: 'box', color: '#c08040' });
      b.pusher = this; b.flip = this.dir < 0; this.box = b; KB.spawn(b);
    }
    // 個人血量歸零：被打飛出場，150 幀後回到自己的起點（共用血池不變）——確保打得到的那一位永遠會回來
    knockOut() {
      KB.fx('fx_poof', this.cx, this.cy); KB.particles(this.cx, this.cy, ['#ffffff', this.color], 10, { spread: 2.5 });
      this.releaseBox(false);
      this.ko = true; this.koT = 150; this.contactDamage = false; this.hurtsPlayer = false; this.untouchable = true;
      this.solid = false; this.grav = 0; this.vx = 0; this.vy = 0; this.x = -200; this.y = -200;
    }
    comeBack() {
      this.ko = false; this.selfHp = this.maxSelfHp; this.contactDamage = true; this.hurtsPlayer = true; this.untouchable = false;
      this.solid = true; this.grav = KB.GRAV; this.vx = 0; this.vy = 0; this.x = this.spawnX; this.bottom = this.spawnY + T; this.invuln = 20;
      KB.fx('fx_poof', this.cx, this.cy); this.setState('idle');
    }
    ai(dt) {
      if (this.ko) { if (--this.koT <= 0) this.comeBack(); return; }
      const map = KB.game.map;
      switch (this.state) {
        case 'idle':
          this.vx = 0;
          if (this.stateT > 30) { this.spawnBox(); if (this.box) { this.setState('push'); if (this.hopOnPush) this.vy = -2.4; } }
          break;
        case 'push': case 'walk': {
          if (this.box && (this.box.dead || this.box.beingInhaled || this.box.pusher !== this)) { if (!this.box.dead) this.box.pusher = null; this.box = null; this.setState('walk'); }
          const front = this.box || this, fx = this.frontX(front);
          const wall = solidAt(fx, this.y + 2, this.bottom - 2);
          const edge = this.onGround && !standable(map.at(fx, this.bottom + 2));
          if (wall) { if (this.box) this.box.shatter(); this.box = null; this.dir *= -1; this.setState('idle'); break; }
          if (edge) {
            if (this.box) { this.releaseBox(true); this.setState('walk'); }   // 箱子推下平台
            else { this.dir *= -1; this.setState('idle'); break; }
          }
          this.vx = this.dir * this.speed;
          if (this.box) { this.box.x = this.dir > 0 ? this.x + this.w : this.x - this.box.w; this.box.bottom = this.bottom; this.box.vx = this.vx; this.box.dir = this.dir; this.box.flip = this.dir < 0; }
          if (this.stateT > 420) { this.releaseBox(false); this.dir *= -1; this.setState('idle'); }
          break;
        }
        case 'hurt':
          this.vx *= 0.85;
          if (this.stateT > 14) this.setState('idle');
          break;
      }
    }
    draw(g) {
      if (this.ko) return;
      const moving = (this.state === 'push' || this.state === 'walk') && !this.ko;
      this.drawBody(g, this.spr, { t: moving ? this.t : 0, fps: 8 });
    }
  }
  class Lalala extends LoloBase {
    constructor(x, y, leader) {
      super(x, y);
      this.leaderRef = leader; this.displayName = '拉拉拉'; this.subtitle = 'LALALA'; this.name = 'lalala';
      this.hp = this.maxHp = 15; this.score = 0; this.spr = 'lalala_walk'; this.color = '#f070b0';
      this.speed = 1.0; this.hopOnPush = true; this.dir = 1;
    }
    get leader() { return this.leaderRef; }
    hurt(amount, src) { return this.leader ? this.leader.damageFrom(this, amount, src) : false; }
    update(dt) {
      super.update(dt);
      this.hp = Math.max(0, this.selfHp);
      if (this.leader && this.leader.dead) this.dead = true;
    }
  }
  class Lololo extends LoloBase {
    constructor(x, y) {
      super(x, y);
      this.displayName = '洛洛洛與拉拉拉'; this.subtitle = 'LOLOLO & LALALA'; this.name = 'lololo';
      this.hp = this.maxHp = 30; this.score = 6000; this.partner = null;
    }
    ensurePartner() {
      if (this.partner || !KB.game) return;
      let px = this.spawnX - 48, py = this.spawnY - 64;   // 預設在左上方的平台（沒有平台就落到地面）
      if (px < 8 || solidAt(px + 9, py + 2, py + 14)) { px = clamp(this.spawnX + 40, 8, mapW() - 26); py = this.spawnY; }
      const P = new Lalala(px, py, this);
      P.type = 'boss'; P.z = 2; P.introducing = this.introducing;
      this.partner = P; KB.spawn(P);
    }
    introUpdate(dt) {
      this.ensurePartner(); super.introUpdate(dt);
      if (this.partner) { this.partner.introducing = true; this.partner.introUpdate(dt); }
    }
    update(dt) {
      this.ensurePartner();
      if (this.partner) this.partner.introducing = this.introducing;
      super.update(dt);
    }
    hurt(amount, src) { return this.damageFrom(this, amount, src); }
    // 共用血池：who 為實際被打到的那一位
    damageFrom(who, amount, src) {
      if (this.dead || this.introducing || who.invuln > 0 || who.ko || who.untouchable) return false;
      who.invuln = 12; who.flash = 10; who.hurtT = 20; who.selfHp -= amount;
      this.hp = Math.max(0, this.hp - amount);
      KB.audio.sfx('boss_hurt'); KB.fx('fx_hit', who.cx, who.cy);
      if (this.hp <= 0) { if (who !== this) { this.x = who.x; this.y = who.y; } this.die(src); return true; }
      if (who.selfHp <= 0) { who.knockOut(); return true; }
      const from = src && src.cx !== undefined ? src.cx : who.cx + who.dir;
      who.releaseBox(false);
      who.vx = (who.cx < from ? -1 : 1) * 1.6; who.vy = -1.5; who.setState('hurt');
      return true;
    }
    onDeath() {
      this.releaseBox(false);
      if (this.partner && !this.partner.dead) { KB.fx('fx_poof', this.partner.cx, this.partner.cy); this.partner.releaseBox(false); this.partner.dead = true; }
    }
  }
  KB.BOSSES.lololo = Lololo;
  KB.Lalala = Lalala;

  // =====================================================================
  // W3 克拉寇：在房間上方左右緩慢飄移的雲。閃電 → 俯衝 → 灑雨（雨滴可吸入）循環；偶爾丟一隻小兵當彈藥。
  // =====================================================================
  class Kracko extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '克拉寇'; this.subtitle = 'KRACKO'; this.name = 'kracko';
      this.hp = this.maxHp = 40; this.score = 7000; this.color = '#f0f0ff';
      this.solid = false; this.grav = 0; this.spr = 'kracko_idle';
      this.setSize(56, 36);
      this.baseY = this.y; this.hoverY = this.y; this.lowY = this.y; this.floor = this.bottom + 64; this.phase = 0; this.attackIdx = 0;
      this.minion = null; this.minionT = 150; this.boltY = 0; this.sx = 0; this.sy = 0; this.tx = 0; this.ty = 0; this.sub = 0; this.subT = 0; this.swoopDir = -1;
      this.setState('idle');
    }
    // 巡航高度：底部離地 52px（卡比跳起來揮劍剛好打得到）；關卡若把他放得更低就用更低的那個。
    // lowY：低空盤旋高度（底部離地 30px，站著舉劍就打得到）。
    calcHover() {
      const fl = groundY(this.cx, this.bottom); this.floor = fl;
      this.hoverY = clamp(Math.max(this.baseY, fl - this.h - 58), 4, Math.max(4, fl - this.h - 24));
      this.lowY = Math.max(4, fl - this.h - 30);
    }
    introUpdate(dt) { this.t += dt; this.calcHover(); this.y += (this.hoverY - this.y) * 0.1; }
    hoverTo(tx, ty, k) {
      tx = clamp(tx, 4, mapW() - this.w - 4); ty = clamp(ty, 4, Math.max(4, this.floor - this.h - 8));
      this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    }
    // 循環：閃電 → 貼地橫掃（可打到）→ 灑雨（雨滴可吸入吐回）→ 低空盤旋（可打到）
    chooseAttack() { const seq = ['lightning', 'swoop', 'rain', 'low']; this.setState(seq[this.attackIdx++ % seq.length]); }
    drop() {
      KB.spawn(new Raindrop({ spr: 'raindrop', x: this.cx + (this.rng() * 2 - 1) * 44, y: this.bottom, vx: (this.rng() - 0.5) * 0.8, vy: 1, grav: 0.06, maxFall: 2.4, dmg: 1, owner: 'enemy', life: 240, w: 6, h: 8, solid: true, dieOnGround: true, name: 'raindrop', score: 30, fxHit: 'fx_poof', type: 'rain', color: '#80c0ff' }));
    }
    trySpawnMinion() {
      const C = KB.ENEMIES.waddledoo || KB.ENEMIES.waddledee; if (!C) return;
      if (this.minion && !this.minion.dead) return;
      if (--this.minionT > 0) return;
      this.minionT = 420;
      const m = new C(this.cx - 7, this.bottom); m.bottom = this.bottom + 4; m.startX = m.x; m.startY = m.y;
      m.active = true; m.dir = this.player && this.player.cx < this.cx ? -1 : 1; m.vy = 1;
      this.minion = m; KB.spawn(m); KB.fx('fx_poof', m.cx, m.cy);
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      this.phase += 0.02; this.calcHover();
      this.contactDamage = this.state !== 'low';   // 低空盤旋是給玩家打的窗口：那時碰到雲不會受傷
      switch (this.state) {
        case 'idle':
          this.hoverTo(p.cx - this.w / 2 + Math.sin(this.phase) * 72, this.hoverY + Math.sin(this.t * 3) * 5, 0.05);
          if (this.stateT > 90) this.chooseAttack();
          break;
        case 'lightning':   // 從目前位置垂直劈下（不追蹤玩家）：30 幀電火花預警，站在雲正下方才會被劈到
          if (this.stateT < 30) {
            this.hoverTo(this.x, this.hoverY, 0.08);
            if (this.stateT % 3 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.bottom, '#ffff80', 1, { spread: 0.4, grav: 0, life: 8, up: 0 });
          }
          if (this.stateT === 30) {
            const fl = groundY(this.cx, this.bottom); this.boltY = fl;
            KB.hitbox({ x: this.cx - 5, y: this.bottom, w: 10, h: Math.max(8, fl - this.bottom), dmg: 1, owner: 'enemy', type: 'lightning', life: 20, pierce: true });
            KB.audio.sfx('spark'); KB.game.shake = 3;
          }
          if (this.stateT > 64) this.setState('idle');
          break;
        case 'swoop': {  // 貼地橫掃：先垂直降到地面上方，再朝玩家方向橫掃過整個房間，最後升回巡航高度
          if (this.stateT === 1) { this.sub = 0; this.subT = 0; this.sx = this.x; this.sy = this.y; this.ty = groundY(p.cx, p.bottom - 2) - this.h - 6; this.swoopDir = p.cx < this.cx ? -1 : 1; }
          if (this.sub === 0) {
            const u = Math.min(1, this.stateT / 32); this.y = this.sy + (this.ty - this.sy) * Math.sin(u * Math.PI / 2);
            if (u >= 1) { this.sub = 1; this.subT = 0; KB.audio.sfx('slide'); }
          } else if (this.sub === 1) {
            this.x += this.swoopDir * 3.2; this.subT++;
            const edge = this.swoopDir < 0 ? this.x <= 4 : this.x + this.w >= mapW() - 4;
            const passed = (this.cx - p.cx) * this.swoopDir > 72;
            if (edge || passed || this.subT > 150) { this.sub = 2; this.subT = 0; this.sy = this.y; }
          } else {
            const u = Math.min(1, ++this.subT / 30); this.y = this.sy + (this.hoverY - this.sy) * (1 - Math.cos(u * Math.PI / 2));
            if (u >= 1) this.setState('idle');
          }
          this.x = clamp(this.x, 4, mapW() - this.w - 4);
          if (this.stateT % 4 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 20, this.bottom, '#ffffff', 1, { spread: 0.5, grav: 0, life: 10, up: 0 });
          break;
        }
        case 'rain':
          this.hoverTo(p.cx - this.w / 2, this.hoverY, 0.03);
          if (this.stateT % 9 === 0 && this.stateT < 50) this.drop();
          if (this.stateT > 70) this.setState('idle');
          break;
        case 'low':   // 低空盤旋 130 幀：在玩家附近左右漂，讓玩家有揮劍的機會（雲的下緣冒電火花警示）
          this.hoverTo(p.cx - this.w / 2 + Math.sin(this.phase * 3) * 40, this.lowY, 0.06);
          if (this.stateT % 6 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 40, this.bottom, '#ffff80', 1, { spread: 0.3, grav: 0, life: 8, up: 0.3 });
          if (this.stateT > 130) this.setState('idle');
          break;
      }
      this.trySpawnMinion();
    }
    draw(g) {
      if (this.state === 'lightning' && this.stateT >= 30 && this.stateT < 50) {
        const bright = (this.stateT & 2) ? '#ffffa0' : '#ffffff';
        if (!KB.has('proj_lightning')) g.rect(this.cx - 3, this.bottom, 6, this.boltY - this.bottom, bright);
        else for (let y = this.bottom + 16; y <= this.boltY + 15; y += 16) g.spr('proj_lightning', this.cx, Math.min(y, this.boltY), { t: this.t, fps: 12 });
      }
      const spr = this.hurtT > 0 ? 'kracko_hurt' : ((this.state === 'idle' || this.state === 'low') ? 'kracko_idle' : 'kracko_attack');
      this.drawBody(g, spr, { flip: false });
    }
  }
  KB.BOSSES.kracko = Kracko;

  // =====================================================================
  // W4 魅塔騎士：登場先丟一把劍給卡比（沒有能力時）。走向玩家、揮劍、衝刺斬、跳躍、劍氣、披風消失後出現在另一側。
  // =====================================================================
  class MetaKnight extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '魅塔騎士'; this.subtitle = 'META KNIGHT'; this.name = 'metaknight';
      this.hp = this.maxHp = 45; this.score = 8000; this.color = '#3040a0';
      this.solid = true; this.grav = KB.GRAV; this.spr = 'metaknight_idle'; this.setSize(20, 26);
      this.swordStar = null; this.decisions = 0; this.dashBox = null; this.dir = -1; this.stunCD = 0;
      this.setState('idle');
    }
    onIntroEnd() {
      const p = this.player;
      if (p && !p.ability && !p.mouth && KB.ITEMS.abilitystar && KB.ABILITIES.sword) {
        this.facePlayer();
        const s = new KB.ITEMS.abilitystar(this.cx - 7, this.y - 4, 'sword', this.dir);
        s.vx = this.dir * 2.2; s.vy = -3.2; this.swordStar = KB.spawn(s);
        this.contactDamage = false; this.setState('wait');
        if (KB.game) KB.game.toast('魅塔騎士丟出了一把劍！');
      } else this.setState('idle');
    }
    decide() {
      const p = this.player, dist = this.playerDist(), r = this.rng();
      this.decisions++;
      if (this.decisions % 5 === 0 && r < 0.7) return this.setState('vanish');
      if (p && p.cy < this.y - 24 && dist < 60) return this.setState('jump');
      if (dist < 34) return this.setState(r < 0.6 ? 'slash' : 'backstep');
      if (dist < 120) { if (r < 0.35) return this.setState('dash'); if (r < 0.6) return this.setState('cutter'); return this.setState('walk'); }
      if (r < 0.5) return this.setState('walk'); if (r < 0.8) return this.setState('cutter'); return this.setState('vanish');
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      const dist = this.playerDist();
      if (this.stunCD > 0) this.stunCD--;
      // 這是一場劍鬥：只有招式（揮劍 / 劍氣 / 衝刺斬）會傷人，身體只在衝刺時有碰觸傷害，
      // 否則貼身互砍時光是走進他就掉劍，簡單玩家打不贏。
      this.contactDamage = this.state === 'dash';
      switch (this.state) {
        case 'wait': {  // 等卡比撿劍
          this.vx = 0; this.facePlayer();
          const gone = !this.swordStar || this.swordStar.dead;
          if (p.ability || this.stateT > 360 || (gone && this.stateT > 60)) {
            if (!p.ability && !p.mouth) { p.giveAbility('sword'); if (this.swordStar) this.swordStar.dead = true; }
            this.swordStar = null; this.contactDamage = true; this.setState('idle');
          }
          break;
        }
        case 'idle':
          this.vx *= 0.7; this.facePlayer();
          if (this.stateT > 18) this.decide();
          break;
        case 'walk':
          this.facePlayer(); this.vx = this.dir * 1.3;
          if (this.hitWall || dist < 26 || this.stateT > 70) this.setState('idle');
          break;
        case 'slash':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          if (this.stateT === 8) { KB.hitbox({ x: 0, y: 0, w: 24, h: 24, dmg: 1, owner: 'enemy', type: 'sword', follow: this, ox: 2, oy: 0, life: 10, pierce: true }); KB.audio.sfx('sword'); }
          if (this.stateT > 26) this.setState(this.rng() < 0.6 ? 'backstep' : 'idle');   // 砍完多半往後跳開，留出空檔
          break;
        case 'backstep':   // 往後跳開一小段
          if (this.stateT === 1) { this.facePlayer(); this.vx = -this.dir * 2.0; this.vy = -3.0; }
          if (this.stateT > 6 && this.onGround) { this.vx = 0; this.setState('idle'); }
          if (this.stateT > 60) this.setState('idle');
          break;
        case 'dash':
          if (this.stateT === 1) {
            this.facePlayer();
            this.dashBox = KB.hitbox({ x: 0, y: 0, w: this.w + 8, h: this.h, dmg: 1, owner: 'enemy', type: 'dash', follow: this, ox: -(this.w + 8) / 2, oy: 0, life: 13, pierce: true });
            KB.audio.sfx('slide');
          }
          this.vx = this.dir * 5;
          if (this.stateT % 2 === 0) KB.particles(this.cx - this.dir * 8, this.bottom - 4, '#a0a0ff', 1, { spread: 0.5, grav: 0, life: 10, up: 0 });
          if (this.stateT >= 12 || this.hitWall) { this.vx = 0; if (this.dashBox) this.dashBox.dead = true; this.dashBox = null; this.setState('idle'); }
          break;
        case 'jump':
          if (this.stateT === 1) { this.facePlayer(); this.vy = -4.6; this.vx = this.dir * 1.8; KB.audio.sfx('jump'); }
          if (this.stateT === 14 && this.rng() < 0.5) { KB.shoot({ spr: 'proj_cutter', x: this.cx + this.dir * 12, y: this.cy, vx: this.dir * 3.2, dmg: 1, owner: 'enemy', life: 90, w: 12, h: 12, solid: false, pierce: false, rotSpeed: 0.4 * this.dir, type: 'cutter', dir: this.dir }); KB.audio.sfx('cutter'); }
          if (this.stateT > 6 && this.onGround) { this.vx = 0; this.setState('idle'); }
          break;
        case 'cutter':
          this.vx *= 0.7;
          if (this.stateT === 8) {
            this.facePlayer();
            KB.shoot({ spr: 'proj_cutter', x: this.cx + this.dir * 12, y: this.cy - 2, vx: this.dir * 3.2, dmg: 1, owner: 'enemy', life: 90, w: 12, h: 12, solid: false, pierce: false, rotSpeed: 0.4 * this.dir, type: 'cutter', dir: this.dir });
            KB.audio.sfx('cutter');
          }
          if (this.stateT > 24) this.setState('idle');
          break;
        case 'vanish': {  // 披風消失 40 幀（無敵）→ 出現在玩家另一側
          if (this.stateT === 1) {
            this.hidden = true; this.untouchable = true; this.contactDamage = false; this.invuln = 40; this.vx = 0;
            KB.fx('fx_poof', this.cx, this.cy); KB.particles(this.cx, this.cy, ['#6040c0', '#a080ff'], 10, { spread: 2 });
          }
          if (this.stateT === 40) {
            const map = KB.game.map, side = this.cx > p.cx ? -1 : 1;   // 目前在右側 → 出現在左側
            let nx = clamp(p.cx + side * 52 - this.w / 2, 4, mapW() - this.w - 4);
            if (solidAt(nx + this.w / 2, p.y, p.bottom - 1)) nx = clamp(p.cx - side * 52 - this.w / 2, 4, mapW() - this.w - 4);
            this.x = nx; this.bottom = groundY(nx + this.w / 2, p.bottom - 2); this.vy = 0;
            this.hidden = false; this.untouchable = false; this.contactDamage = true; this.facePlayer();
            KB.fx('fx_poof', this.cx, this.cy); KB.particles(this.cx, this.cy, ['#6040c0', '#a080ff'], 10, { spread: 2 }); KB.audio.sfx('door');
            void map;
          }
          if (this.stateT > 52) this.setState(this.playerDist() < 40 ? 'slash' : 'idle');
          break;
        }
        case 'hurt':
          this.vx *= 0.85;
          if (this.stateT > 14) this.setState('idle');
          break;
      }
    }
    onHurt(amount, src) {
      if (this.state === 'vanish') return;
      const from = src && src.cx !== undefined ? src.cx : (this.player ? this.player.cx : this.cx);
      this.dir = from < this.cx ? -1 : 1;             // 面向攻擊者
      // 硬直有冷卻、出招中有霸體：被連段時不會一直後仰，會照常出招反擊（否則站著揮劍就能鎖死他）
      if (this.state === 'slash' || this.state === 'dash') return;
      if (this.stunCD > 0) { if (this.state === 'idle' || this.state === 'walk') this.vx = -this.dir * 0.8; return; }
      this.stunCD = 50;
      this.vx = -this.dir * 2.2; this.vy = Math.min(this.vy, -1.2);  // 後退
      if (this.dashBox) { this.dashBox.dead = true; this.dashBox = null; }
      this.setState('hurt');
    }
    draw(g) {
      if (this.hidden) return;
      let spr = 'metaknight_idle', o = {};
      if (this.hurtT > 0 || this.state === 'hurt') spr = 'metaknight_hurt';
      else if (this.state === 'slash') { spr = 'metaknight_attack'; o.frame = this.stateT < 8 ? 0 : this.stateT < 16 ? 1 : 2; }
      else if (this.state === 'dash') spr = 'metaknight_dash';
      this.drawBody(g, spr, o);
    }
  }
  KB.BOSSES.metaknight = MetaKnight;

  // =====================================================================
  // W5 迪迪迪大王：走向玩家、跳躍砸地（震波）、掄鎚（dmg 2）、吸入拉人、超高跳重落。
  // 被打會後退並短暫暈眩（有冷卻）；hp<50% 加速。
  // =====================================================================
  class KingDedede extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '迪迪迪大王'; this.subtitle = 'KING DEDEDE'; this.name = 'dedede';
      this.hp = this.maxHp = 60; this.score = 10000; this.color = '#d04040';
      this.solid = true; this.grav = KB.GRAV; this.maxFall = 6; this.spr = 'dedede_idle'; this.setSize(40, 52);
      this.actions = 0; this.dizzyCD = 0; this.inhaleFx = null; this.dir = -1;
      this.setState('idle');
    }
    get enraged() { return this.hp < this.maxHp * 0.5; }
    moveSpeed() { return this.enraged ? 1.3 : 0.85; }
    stopInhaleFx() { if (this.inhaleFx) { this.inhaleFx.dead = true; this.inhaleFx = null; } }
    // 衝擊星：落地 / 掄鎚時彈出的可吸入星星（Dream Land 的迪迪迪戰就是靠吸這個吐回去打他）
    impactStar(x, y, vx, vy) {
      KB.spawn(new Ammo({ spr: 'proj_star', x, y, vx, vy, grav: 0.2, maxFall: 3.5, dmg: 0, owner: 'enemy', life: 480, w: 10, h: 10, solid: true, breakOnWall: false, bounceY: 2.4, restBreak: 360, harmless: true, name: 'star', score: 100, fxHit: 'fx_sparkle', type: 'impactstar', color: '#ffe040', rotSpeed: 0.2 * (vx < 0 ? -1 : 1) }));
    }
    land(speed, shake) {
      KB.game.shake = shake; KB.audio.sfx('hammer');
      KB.particles(this.cx, this.bottom, '#c0a060', 10, { spread: 2 });
      KB.spawn(new Shockwave(this.x, this.bottom, -1, { speed })); KB.spawn(new Shockwave(this.x + this.w, this.bottom, 1, { speed }));
      this.impactStar(this.x - 4, this.bottom - 8, -2.4, -4.2); this.impactStar(this.x + this.w + 4, this.bottom - 8, 2.4, -4.2);
    }
    decide(dist) {
      this.actions++; const r = this.rng();
      if (this.actions % 5 === 0) return this.setState('superjump');
      if (dist < 52) return this.setState(r < 0.65 ? 'hammer' : 'inhale');
      if (dist < 130) { if (r < 0.4) return this.setState('walk'); if (r < 0.7) return this.setState('jump'); return this.setState('inhale'); }
      if (r < 0.55) return this.setState('walk'); if (r < 0.8) return this.setState('jump'); return this.setState('superjump');
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      const dist = this.playerDist(), map = KB.game.map;
      if (this.dizzyCD > 0) this.dizzyCD--;
      // 不可以站在玩家身上壓著打（角落會變成每 90 幀一次的碰觸傷害死亡迴圈）：玩家在身體範圍內就往後跳開
      if (this.onGround && (this.state === 'idle' || this.state === 'walk' || this.state === 'inhale') && dist < this.w / 2 + 4 && this.stateT > 4) { this.stopInhaleFx(); this.setState('hop'); }
      // 身體只在「撞過來」的招式（跳躍砸地 / 吸入拉人）有碰觸傷害；站著、走路、掄鎚（有自己的判定框）、暈眩時貼身不會受傷，
      // 否則貼身互砍時光是被他走到就掉劍，簡單玩家打不贏最終魔王。
      this.contactDamage = this.state === 'jump' || this.state === 'superjump' || (this.state === 'inhale' && this.stateT >= 16);
      switch (this.state) {
        case 'idle':
          this.vx *= 0.7; this.facePlayer();
          if (this.stateT > (this.enraged ? 14 : 26)) this.decide(dist);
          break;
        case 'hop':   // 往後小跳離開玩家；若背後是牆就跳過玩家頭頂到另一側
          if (this.stateT === 1) {
            this.facePlayer();
            const back = -this.dir, wallBehind = solidAt(back > 0 ? this.x + this.w + 24 : this.x - 24, this.y + 4, this.bottom - 4);
            this.vx = (wallBehind ? this.dir : back) * (wallBehind ? 2.4 : 2.0); this.vy = wallBehind ? -5.6 : -4.2; KB.audio.sfx('jump');
          }
          if (this.stateT > 4 && this.onGround) { this.vx = 0; this.setState('idle'); }
          break;
        case 'walk':
          this.facePlayer(); this.vx = this.dir * this.moveSpeed();
          if (this.stateT % 18 === 9) { KB.audio.sfx('land'); KB.particles(this.cx - this.dir * 10, this.bottom, '#c0a060', 2, { spread: 0.8, life: 12 }); }
          if (dist < 40 || this.hitWall || this.stateT > 90) this.setState('idle');
          break;
        case 'hammer':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          if (this.stateT === 16) {
            KB.hitbox({ x: 0, y: 0, w: 40, h: 48, dmg: 2, owner: 'enemy', type: 'hammer', follow: this, ox: 6, oy: 4, life: 12, pierce: true });
            KB.audio.sfx('hammer'); KB.game.shake = 4; KB.particles(this.cx + this.dir * 30, this.bottom, '#c0a060', 6, { spread: 1.5 });
            this.impactStar(this.cx + this.dir * 34, this.bottom - 8, this.dir * 2.0, -3.2);
          }
          if (this.stateT > 44) this.setState('idle');
          break;
        case 'jump':   // 跳向玩家前方約 36px 落地（威脅是震波與衝擊星，不是直接壓人；站在原地會被震波掃到）
          if (this.stateT === 1) { this.facePlayer(); this.vy = -5.4; this.vx = this.dir * clamp((Math.abs(this.playerDx()) - 36) / 45, 0.3, 2.0); KB.audio.sfx('jump'); }
          if (this.stateT > 4 && this.onGround) { this.vx = 0; this.land(2.5, 6); this.setState('idle'); }
          break;
        case 'superjump':   // 像卡比一樣跳很高再重落：下落的前 24 幀追蹤玩家位置，之後鎖定落點（走開就躲得掉）
          if (this.stateT === 1) { this.facePlayer(); this.vy = -8; this.vx = this.dir * 1.0; this.trackT = 0; KB.audio.sfx('jump'); }
          if (this.stateT > 4 && this.vy > 0) { this.grav = 0.55; this.maxFall = 8; if (this.trackT++ < 24) this.vx = clamp(this.playerDx(), -1.2, 1.2); }
          if (this.stateT > 4 && this.onGround) { this.grav = KB.GRAV; this.maxFall = 6; this.vx = 0; this.land(3.2, 10); this.setState('idle'); }
          break;
        case 'inhale': {  // 張嘴 16 幀預警後，前方吸力把玩家拉過來到 64 幀；碰到本體就受傷彈開（由 game 的碰觸傷害處理）
          this.vx = 0;
          if (this.stateT === 1) { this.facePlayer(); KB.audio.sfx('inhale'); }
          if (!this.inhaleFx || this.inhaleFx.dead) this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 64, fps: 10 });
          this.inhaleFx.x = this.cx + this.dir * 44; this.inhaleFx.y = this.cy + 14; this.inhaleFx.flip = this.dir < 0;
          // 吸力 1.1 px/f < 走路 1.3：往反方向走就能掙脫；站著不動才會被拉到身上（碰觸傷害）
          const rx = this.dir > 0 ? this.x + this.w : this.x - 88, ry = this.y - 8, rw = 88, rh = this.h + 16;
          if (this.stateT >= 16 && p.overlapsRect(rx, ry, rw, rh) && !NO_PULL[p.state] && p.invincibleT <= 0) {
            const pull = -this.dir * 1.1, nx = p.x + pull, edge = pull > 0 ? nx + p.w - 1 : nx;
            if (!KB.physics.columnSolid(map, edge, p.y + 1, p.bottom - 1)) p.x = nx;
            if (this.stateT % 5 === 0) KB.particles(p.cx - pull * 6, p.cy, '#e0f0ff', 1, { spread: 0.4, vx: pull, grav: 0, life: 10, up: 0 });
          }
          if (this.stateT >= 64) { this.stopInhaleFx(); this.setState('idle'); }
          break;
        }
        case 'dizzy':
          this.vx *= 0.88;
          if (this.stateT % 6 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 24, this.y - 4, '#ffe040', 1, { spread: 0.3, grav: 0, life: 12, up: 0.3 });
          if (this.stateT > 24) this.setState('idle');
          break;
      }
    }
    onHurt(amount, src) {
      const from = src && src.cx !== undefined ? src.cx : (this.player ? this.player.cx : this.cx);
      const away = from < this.cx ? 1 : -1;
      const airborne = this.state === 'jump' || this.state === 'superjump';
      if (airborne) { this.vx += away * 0.6; return; }
      this.stopInhaleFx();
      if (this.dizzyCD === 0) { this.vx = away * 1.6; this.dizzyCD = 90; this.setState('dizzy'); }
      else { this.vx = away * 1.2; this.setState('idle'); }
    }
    onDeath() { this.stopInhaleFx(); for (const e of KB.game.entities) if (e.kind === 'impactstar') e.dead = true; }
    draw(g) {
      let spr = 'dedede_idle', o = {};
      switch (this.state) {
        case 'walk': spr = 'dedede_walk'; o.fps = this.enraged ? 10 : 7; break;
        case 'jump': case 'superjump': case 'hop': spr = 'dedede_jump'; break;
        case 'hammer': spr = 'dedede_hammer'; o.frame = this.stateT < 16 ? 0 : this.stateT < 30 ? 1 : 2; break;
        case 'inhale': spr = 'dedede_inhale'; break;
        case 'dizzy': spr = 'dedede_hurt'; break;
      }
      if (this.hurtT > 0 && this.state !== 'hammer') spr = 'dedede_hurt';
      this.drawBody(g, spr, o);
    }
  }
  KB.BOSSES.dedede = KingDedede;
})();
