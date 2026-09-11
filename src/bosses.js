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
  KB.BOSS_INTRO = 150;   // game.js 的 bossIntroT 起始值（登場演出總幀數）
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
  // 二階段變奏曲（audio agent 提供 boss2 / finalboss2）；沒有這首時保持原曲不動，避免整首音樂被關掉
  function phase2Music() {
    try {
      const key = (KB.game && KB.game.level && KB.game.level.id === 'w5') ? 'finalboss2' : 'boss2';
      if (KB.audio && KB.audio.SONGS && !KB.audio.SONGS[key]) return;
      if (KB.game && KB.game.playMusic) KB.game.playMusic(key); else KB.audio.music(key);
    } catch (e) { }
  }
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
      if (this.scale && this.scale !== 1) { g.spr(this.spr, this.cx, this.bottom, { t: this.t, flip: this.flip, rot: this.rot, fps: this.fps, scaleX: this.scale, scaleY: this.scale }); return; }
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
      // 二階段：hp < 50% 時進入（變色 + 攻擊間隔 -30% + 新招）
      this.phase = 1; this.rageColor = '#ff4020'; this.phase2Msg = '';
      this.spawnX = x; this.spawnY = y; this.bottom = y + T;   // (x,y) = 腳站的磁磚 → 底部貼齊格子底
      this.rngS = (1234567 + Math.floor(x * 7 + y * 13)) & 0x7fffffff;
      // game.loadRoom 會在載入時就把 room.exit 的過關門放進房間（玩家可直接跳過魔王）；
      // 魔王房的過關門應由 game.spawnExitDoor 在魔王死後生成，這裡先把它收掉（門在登場期間也不可用）。
      if (KB.game && KB.game.entities) for (const e of KB.game.entities) if (e.type === 'door' && e.exit && !e.dead) { e.dead = true; e.locked = true; }
    }
    setSize(w, h) { this.w = w; this.h = h; this.bottom = this.spawnY + T; }
    rng() { this.rngS = (Math.imul(this.rngS, 1103515245) + 12345) & 0x7fffffff; return this.rngS / 0x7fffffff; }
    setState(s) { this.state = s; this.stateT = 0; }
    // 招式間隔：二階段縮短 30%
    iv(n) { return this.phase === 2 ? Math.max(1, Math.round(n * 0.7)) : n; }
    // Extra（超難）難度：魔王 maxHp ×1.25、二階段門檻改成 60%（倍率集中在 entity.js 的 KB.EXTRA）。
    // 子類建構式在 super() 之後才設定 hp / maxHp，所以只能延後套用；ensureExtra() 在
    // update / introUpdate / hurt / drawBody 開頭各呼叫一次（子類可能覆寫其中任何一個，但一定會經過 drawBody）。
    ensureExtra() {
      if (this.extraApplied) return; this.extraApplied = true;
      if (!KB.extraOn()) return;
      const k = KB.EXTRA.bossHp;
      this.maxHp = Math.max(1, Math.round(this.maxHp * k));
      this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.hp * k)));
      if (this.maxSelfHp !== undefined) { this.maxSelfHp = Math.max(1, Math.round(this.maxSelfHp * k)); this.selfHp = this.maxSelfHp; }
    }
    get half() { return this.maxHp * KB.exPhase2(); }
    maybePhase2() { if (this.phase === 1 && this.hp > 0 && this.hp < this.half) this.enterPhase2(); }
    enterPhase2() {
      if (this.phase >= 2) return;
      this.phase = 2;
      if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 6);
      KB.audio.sfx('phase2'); KB.audio.sfx('boss_hurt');
      phase2Music();
      KB.fx('fx_sparkle', this.cx, this.cy);
      KB.particles(this.cx, this.cy, ['#ffffff', '#ff8040', this.rageColor], 22, { spread: 3.5, life: 40 });
      if (KB.game) KB.game.toast(this.phase2Msg || (this.displayName + ' 認真了！'));
      this.onPhase2();
    }
    onPhase2() { }
    get floorY() { return groundY(this.cx, this.bottom); }
    // 登場期間（game 只呼叫這個，共 150 幀）：動畫計時、有物理的魔王落到地面。
    // this.introT 是「已經過的登場幀數」，各魔王的登場演出都依它排時序。
    introUpdate(dt) { this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1; if (this.solid) { this.vx = 0; this.physics(); } }
    get introP() { return Math.min(1, (this.introT || 0) / KB.BOSS_INTRO); }   // 登場進度 0~1
    update(dt) {
      this.ensureExtra();
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
      this.ensureExtra();
      if (this.dead || this.invuln > 0 || this.introducing || this.untouchable) return false;
      this.hp -= amount; this.flash = 10; this.invuln = 12; this.hurtT = 20;
      KB.audio.sfx('boss_hurt');
      const hx = src && src.cx !== undefined ? clamp(src.cx, this.x, this.x + this.w) : this.cx;
      const hy = src && src.cy !== undefined ? clamp(src.cy, this.y, this.bottom) : this.cy;
      KB.fx('fx_hit', hx, hy + 6);
      if (this.hp <= 0) { this.hp = 0; this.die(src); return true; }
      this.maybePhase2();
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
      this.ensureExtra();
      if (this.hidden) return;
      opts = this.sprOpts(opts || {});
      const ox = opts.ox || 0, oy = opts.oy || 0;
      if (!KB.has(spr)) g.rect(this.x + ox, this.y + oy, this.w, this.h, (this.flash > 0 && (this.flash & 2)) ? '#ffffff' : this.color);
      g.spr(spr, this.cx + ox, this.bottom + oy, opts);
      // 二階段變色：同一張精靈疊一層會呼吸的色調（不是整片剪影，看得出原本的圖）
      if (this.phase === 2 && !opts.tint) {
        const a = 0.32 + 0.12 * Math.sin(this.t * 7);
        g.spr(spr, this.cx + ox, this.bottom + oy, Object.assign({}, opts, { tint: this.rageColor, alpha: a }));
        if ((Math.floor(this.t * 60) % 7) === 0) KB.particles(this.cx + (Math.random() - 0.5) * this.w, this.y + this.h * 0.3, this.rageColor, 1, { spread: 0.4, grav: -0.02, life: 16, up: 0.4 });
      }
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
      this.contactCD = 0;   // 接觸傷害的自身冷卻（玩家 invuln 之外再加一層，見 get contactDamage）
      this.blowCD = 0;      // R4：吹風期間的接觸傷害冷卻（60 幀 1 點，見 get contactDamage）
      this.roots = []; this.rageColor = '#ff3020'; this.phase2Msg = '威斯比的樹根開始暴走！';
      this.setState('idle');
    }
    snap() { this.bottom = groundY(this.cx, this.bottom - 1); }
    // QA R2-P1-03：w1 魔王房 8 次死亡全發生在「玩家被推進樹身裡、在裡面被連續扣血」。
    // Round 3 的修法有三層：
    //   ① 接觸傷害框只算「樹幹」——寬 24px、離地 0~48px（樹冠與樹身上半部碰到不扣血）；
    //   ② 除了玩家自己的 invuln 之外，威斯比再帶一個 45 幀的 contactCD；
    //   ③ 吹風（blow）期間完全不扣接觸傷害，改成把玩家往樹外推（給玩家「脫離」的動作提示）。
    // 實作成 getter：game.js 的碰觸傷害判定會在「玩家確實重疊、而且沒有無敵」時才讀這個值。
    // Round 4（QA R3-P1-02「曲線不遞增：w1 反而是最好打的一隻」）：②③ 兩層各放寬一級 ——
    //   ② contactCD 45 → 30 幀；
    //   ③ 吹風期間恢復接觸傷害，但用獨立的 60 幀冷卻（推開仍然照做）。
    //   ⇒ 貼著樹幹站著砍不再是零風險，但比 Round 2「每 12 幀被扣一次血」還是溫和很多（①的 24px 樹幹框不動）。
    get trunk() { const w = 24; return { x: this.cx - w / 2, y: this.bottom - 48, w: w, h: 48 }; }
    get contactDamage() {
      if (this.dead || this.introducing) return false;
      const p = this.player; if (!p || p.state === 'dead') return false;
      const t = this.trunk;
      if (!p.overlapsRect(t.x, t.y, t.w, t.h)) return false;
      // R4：吹風時仍然以推開為主，但每 60 幀會扣 1 點（站在樹幹裡不動就會慢慢掉血）
      if (this.state === 'blow') { if (this.blowCD > 0) return false; this.blowCD = 60; return true; }
      if (this.contactCD > 0) return false;
      this.contactCD = 30;   // R4：45 → 30
      return true;
    }
    set contactDamage(v) { /* Boss 建構式會寫 true；這裡改用 getter 算，忽略寫入 */ }
    // 吹風把玩家推離樹幹（1px/f，比走路慢 → 想靠近還是靠得過去，但站著不動會被吹出來）
    blowPush(p) {
      if (!p || p.state === 'dead' || p.invincibleT > 0) return;
      if (Math.abs(p.cx - this.cx) > 96) return;
      const d = p.cx < this.cx ? -1 : 1;
      const nx = p.x + d, edge = d > 0 ? nx + p.w - 1 : nx;
      if (!KB.physics.columnSolid(KB.game.map, edge, p.y + 1, p.bottom - 1)) p.x = nx;
      if (this.stateT % 6 === 0) KB.particles(p.cx - d * 6, p.cy, '#e8f8ff', 1, { spread: 0.4, vx: d * 1.2, grav: 0, life: 10, up: 0 });
    }
    // 【登場】整棵樹左右搖晃，樹冠不斷飄下葉子（搖晃幅度隨時間收斂）
    introUpdate(dt) {
      super.introUpdate(dt); this.snap();
      const k = this.introT;
      this.introSway = Math.sin(k * 0.30) * (1 - this.introP) * 5;
      if (k % 3 === 0) {
        const lx = this.cx + (this.rng() - 0.5) * 40, ly = this.y + 6 + this.rng() * 34;
        KB.particles(lx, ly, ['#90e858', '#48c048', '#207820'], 1, { spread: 0.4, grav: 0.03, life: 110, up: -0.15, vx: -0.5 - this.rng() * 0.7, size: 2 });
      }
      if (k === 1) KB.audio.sfx('block');
      if (k % 46 === 24) { KB.audio.sfx('enemyhit'); if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 3); }
    }
    onIntroEnd() { this.snap(); this.introSway = 0; }
    nextAttack() {
      // 二階段多一招「暴風」：大蘋果三連 + 地面三處竄根
      // 二階段的循環裡「暴風」只放一次：放兩次的話貼著樹砍的玩家會一直掉能力（boss_test 的普通玩家樣本會輸）
      const seq = this.phase === 2 ? ['blow', 'apple', 'storm', 'root'] : ['blow', 'apple', 'root'];
      this.cycle++; this.puffs = 0; this.apples = 0;
      this.setState(seq[(this.cycle - 1) % seq.length]);
    }
    onPhase2() { this.roots.length = 0; this.setState('storm'); }
    // 竄根：先在 (x, 地面) 噴土預警 warn 幀，再冒出判定框
    spawnRoot(x, warn, big) {
      const rx = clamp(x, 8, this.x - 14), ry = groundY(rx, (this.player ? this.player.bottom : this.bottom) - 2);
      this.roots.push({ x: rx, y: ry, t: 0, warn: warn, big: !!big });
    }
    updateRoots() {
      for (const r of this.roots) {
        r.t++;
        if (r.t < r.warn) { if (r.t % 3 === 0) KB.particles(r.x + (this.rng() - 0.5) * 12, r.y, '#8a5a30', 1, { spread: 0.6, grav: 0.1, life: 14, up: 1.2 }); continue; }
        if (r.t === r.warn) {
          const w = r.big ? 16 : 12, h = r.big ? 30 : 22;
          KB.hitbox({ x: r.x - w / 2, y: r.y - h, w: w, h: h, dmg: 1, owner: 'enemy', type: 'root', life: 24, pierce: true });
          KB.particles(r.x, r.y, '#8a5a30', 10, { spread: 2 }); KB.audio.sfx('block');
        }
      }
      this.roots = this.roots.filter(r => r.t < r.warn + 30);
    }
    // 氣團：第 1、3 顆貼地（站著會中，要跳過去），第 2 顆在跳躍高度（跳起來會中）
    blow() {
      const low = this.puffs !== 2;
      const mx = this.x - 4, my = low ? this.bottom - 11 : this.bottom - 44;
      KB.shoot({ spr: 'proj_airpuff', x: mx, y: my, vx: -2, dmg: 1, owner: 'enemy', life: 220, w: 14, h: 14, dir: -1, solid: true, fxHit: 'fx_poof', type: 'airpuff' });
      KB.particles(mx, my, '#e8f8ff', 4, { spread: 1.2, vx: -1, grav: 0, life: 14, up: 0 });
    }
    // 蘋果在樹左側的地面上方隨機落下（不瞄準玩家）：是主要的可吸入彈藥
    dropApple(big) {
      const x = clamp(this.x - 16 - this.rng() * Math.min(200, this.x - 28), 12, this.x - 10);
      const y = Math.max(6, this.y - 12);
      const sz = big ? 16 : 12;
      KB.spawn(new Ammo({ spr: 'proj_apple', x, y, vx: 0, vy: big ? 1.0 : 0.5, grav: big ? 0.22 : 0.16, maxFall: big ? 4 : 3.2, dmg: 1, owner: 'enemy', life: 400, w: sz, h: sz, solid: true, dieOnGround: true, name: 'apple', score: big ? 150 : 100, fxHit: 'fx_poof', type: 'apple', color: '#e83030', scale: big ? 1.35 : undefined }));
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      if (this.hurtT > 0 && this.stateT % 4 === 0) KB.particles(this.x + 12, this.y + 34, '#80c0ff', 1, { spread: 0.3, grav: 0.2, life: 22, up: 0.4 }); // 流淚
      if (this.contactCD > 0) this.contactCD--;
      if (this.blowCD > 0) this.blowCD--;
      this.updateRoots();
      switch (this.state) {
        case 'idle':
          if (this.stateT > this.iv(50)) this.nextAttack();
          break;
        case 'blow':
          this.blowPush(p);   // 吹風期間把玩家往樹外推（不扣血）
          if (this.stateT % this.iv(24) === 6 && this.puffs < 3) { this.puffs++; this.blow(); }
          if (this.stateT > this.iv(84)) this.setState('idle');
          break;
        case 'apple':
          if (this.stateT % this.iv(30) === 10 && this.apples < 3) { this.apples++; this.dropApple(); }
          if (this.stateT > this.iv(104)) this.setState('idle');
          break;
        case 'root':   // 竄根：瞄準玩家腳下，36 幀泥土噴起預警後竄出（站著不動會被打到，走開就沒事）
          if (this.stateT === 1) this.spawnRoot(p.cx, 36, false);
          if (this.stateT > this.iv(84)) this.setState('idle');
          break;
        case 'storm':  // 【二階段新招】大蘋果三連 + 地面三處竄根（預警 26 幀，走位就躲得掉）
          if (this.stateT === 1) { KB.audio.sfx('boss_hurt'); if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 3); }
          if (this.stateT % 14 === 4 && this.apples < 3) { this.apples++; this.dropApple(true); }
          // 兩處竄根（預警 32 幀，比一階段的 36 稍快但還來得及走開）；三處會讓貼著樹砍的玩家幾乎躲不掉
          // 兩處竄根（預警 32 幀，比一階段的 36 稍快但還來得及走開）；三處會讓貼著樹砍的玩家幾乎躲不掉
          if (this.stateT === 6) this.spawnRoot(p.cx, 32, true);
          if (this.stateT === 40) this.spawnRoot(p.cx - 40 + this.rng() * 80, 32, true);
          if (this.stateT > 110) this.setState('idle');
          break;
      }
    }
    draw(g) {
      const spr = this.hurtT > 0 ? 'whispy_hurt' : (this.state === 'blow' ? 'whispy_blow' : 'whispy_idle');
      this.drawBody(g, spr, this.introducing ? { ox: Math.round(this.introSway || 0) } : undefined);
      for (const r of this.roots) {
        if (r.t < r.warn || r.t > r.warn + 30) continue;
        const w = r.big ? 16 : 12, h = r.big ? 30 : 22;
        if (!KB.has('whispy_root')) g.rect(r.x - w / 2, r.y - h, w, h, '#8a5a30');
        else g.spr('whispy_root', r.x, r.y, { t: this.t, scaleY: r.big ? 1.3 : 1, scaleX: r.big ? 1.2 : 1 });
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
      this.rage = false; this.baseSpeed = 0.9; this.shoveT = 0;
      this.introSide = 1;   // 登場從哪一側推箱進來（+1 右側 / -1 左側）
      this.setSize(18, 22); this.dir = -1; this.setState('idle');
    }
    get leader() { return this; }
    frontX(ent) { return this.dir > 0 ? ent.x + ent.w + 1 : ent.x - 1; }
    // 【登場】從房間左右兩側「推著箱子」走進自己的定位（登場期間不吃物理，結束時歸位）
    introUpdate(dt) {
      this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1;
      const N = KB.BOSS_INTRO, k = this.introT;
      if (k === 1) {
        this.introFrom = clamp(this.spawnX + this.introSide * 76, 4, Math.max(4, mapW() - this.w - 4));
        this.dir = this.introSide > 0 ? -1 : 1;
        this.solid = false; this.grav = 0; this.vx = 0; this.vy = 0;
      }
      const u = Math.min(1, k / (N - 26));
      this.x = this.introFrom + (this.spawnX - this.introFrom) * u;
      this.bottom = this.spawnY + T;
      if (u < 1) {
        if (k % 12 === 0) { KB.audio.sfx('land'); KB.particles(this.cx, this.bottom, ['#d8d8e0', '#a0a0b0'], 2, { spread: 0.7, grav: 0.1, life: 14, up: 0.4, size: 1 }); }
        const bx = this.dir > 0 ? this.x + this.w + 8 : this.x - 8;
        if (k % 8 === 0) KB.particles(bx, this.bottom - 1, '#c08040', 1, { spread: 0.5, grav: 0.1, life: 12, up: 0.3, size: 1 });
      } else if (!this.introDone) {
        this.introDone = true;
        KB.fx('fx_poof', this.dir > 0 ? this.x + this.w + 8 : this.x - 8, this.bottom - 8); KB.audio.sfx('block');
      }
    }
    // 注意：這裡不呼叫 setState —— 登場期間 stateT 已經累積到 150，魔王一開打就會出招，
    // 那是原本的戰鬥節奏（boss_test 的普通玩家樣本對節奏很敏感），重設會讓整場平衡跑掉。
    onIntroEnd() {
      this.solid = true; this.grav = KB.GRAV;
      this.x = this.spawnX; this.bottom = this.spawnY + T; this.vx = 0; this.vy = 0;
    }
    // 登場時手上那顆箱子（純繪製，不生實體 —— 免得登場期間就打到卡比）
    drawIntroBox(g) {
      if (this.introDone) return;
      const bx = this.dir > 0 ? this.x + this.w + 8 : this.x - 8;
      g.spr('proj_box', bx, this.bottom, { t: 0, flip: this.dir < 0 });
    }
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
    // 二階段：兩人同時開始推箱、速度 +35%，推到一半會把箱子直接射出去
    goRage() {
      if (this.rage) return;
      this.rage = true; this.phase = 2; this.speed = this.baseSpeed * 1.35;
      this.releaseBox(false); this.setState('idle'); this.stateT = 20;   // 兩人同時 → 同一拍生出箱子
      KB.particles(this.cx, this.cy, ['#ffffff', this.color], 10, { spread: 2 });
    }
    ai(dt) {
      if (this.ko) { if (--this.koT <= 0) this.comeBack(); return; }
      const map = KB.game.map;
      switch (this.state) {
        case 'idle':
          this.vx = 0;
          if (this.stateT > this.iv(30)) { this.spawnBox(); if (this.box) { this.setState('push'); if (this.hopOnPush) this.vy = -2.4; } }
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
          // 【二階段新招】推到第 80 幀把箱子朝前方射出去（原本只會慢慢推）
          if (this.rage && this.box && this.stateT >= 80 && this.stateT % 80 === 0) {
            const b = this.box; this.releaseBox(true); if (b && !b.dead) { b.vx = this.dir * 3.6; b.friction = 0.99; }
            KB.audio.sfx('spit'); KB.particles(this.cx + this.dir * 12, this.cy, '#ffffff', 6, { spread: 1.5 });
            this.setState('idle'); break;
          }
          if (this.stateT > 420) { this.releaseBox(false); this.dir *= -1; this.setState('idle'); }
          break;
        }
        case 'hurt':
          this.vx *= 0.85;
          if (this.stateT > this.iv(14)) this.setState('idle');
          break;
      }
    }
    draw(g) {
      if (this.ko) return;
      const moving = this.introducing || ((this.state === 'push' || this.state === 'walk') && !this.ko);
      if (this.introducing) this.drawIntroBox(g);
      this.drawBody(g, this.spr, { t: moving ? this.t : 0, fps: 8 });
    }
  }
  class Lalala extends LoloBase {
    constructor(x, y, leader) {
      super(x, y);
      this.leaderRef = leader; this.displayName = '拉拉拉'; this.subtitle = 'LALALA'; this.name = 'lalala';
      this.hp = this.maxHp = 15; this.score = 0; this.spr = 'lalala_walk'; this.color = '#f070b0';
      this.speed = this.baseSpeed = 1.0; this.hopOnPush = true; this.dir = 1; this.rageColor = '#ff3060';
      this.introSide = -1;   // 拉拉拉從左側進場（洛洛洛從右側）
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
      this.rageColor = '#ff3060'; this.phase2Msg = '洛洛洛與拉拉拉同時推箱！';
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
      this.maybePhase2();
      if (who.selfHp <= 0) { who.knockOut(); return true; }
      const from = src && src.cx !== undefined ? src.cx : who.cx + who.dir;
      who.releaseBox(false);
      who.vx = (who.cx < from ? -1 : 1) * 1.6; who.vy = -1.5; who.setState('hurt');
      return true;
    }
    onPhase2() { this.goRage(); if (this.partner && !this.partner.dead) this.partner.goRage(); }
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
      this.baseY = this.y; this.hoverY = this.y; this.lowY = this.y; this.floor = this.bottom + 64; this.wob = 0; this.attackIdx = 0;
      this.minion = null; this.minionT = 150; this.boltY = 0; this.sx = 0; this.sy = 0; this.tx = 0; this.ty = 0; this.sub = 0; this.subT = 0; this.swoopDir = -1;
      this.boltX = 0; this.boltT = 0; this.restT = 0; this.bolted = false; this.rageColor = '#4060ff'; this.phase2Msg = '克拉寇捲起雷雨！';
      this.setState('idle');
    }
    // 巡航高度：底部離地 52px（卡比跳起來揮劍剛好打得到）；關卡若把他放得更低就用更低的那個。
    // lowY：低空盤旋高度（底部離地 30px，站著舉劍就打得到）。
    calcHover() {
      const fl = groundY(this.cx, this.bottom); this.floor = fl;
      this.hoverY = clamp(Math.max(this.baseY, fl - this.h - 58), 4, Math.max(4, fl - this.h - 24));
      this.lowY = Math.max(4, fl - this.h - 30);
    }
    // 【登場】四面八方的小雲往中心聚集，本體由淡到實（alpha 漸顯），成形時閃一下
    introUpdate(dt) {
      this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1;
      this.calcHover(); this.y += (this.hoverY - this.y) * 0.1;
      const N = KB.BOSS_INTRO, k = this.introT, form = N - 18;
      if (k < form && k % 2 === 0) {
        const a = this.rng() * Math.PI * 2, R = 72 + this.rng() * 54, life = 26;
        const px = this.cx + Math.cos(a) * R, py = this.cy + Math.sin(a) * R * 0.55;
        KB.particles(px, py, ['#ffffff', '#d0d4e6', '#aeb4cc'], 1, { spread: 0, grav: 0, life, up: 0, vx: (this.cx - px) / life, vy: (this.cy - py) / life, size: 2 });
      }
      if (k === form) {
        KB.fx('fx_sparkle', this.cx, this.cy); KB.audio.sfx('unlock');
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 5);
        KB.particles(this.cx, this.cy, ['#ffffff', '#ffff80'], 18, { spread: 3.2, grav: 0, life: 30 });
      }
      this.introAlpha = clamp(Math.pow(k / (N - 24), 2), 0.06, 1);
    }
    hoverTo(tx, ty, k) {
      tx = clamp(tx, 4, mapW() - this.w - 4); ty = clamp(ty, 4, Math.max(4, this.floor - this.h - 8));
      this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    }
    // 循環：閃電 → 貼地橫掃（可打到）→ 灑雨（雨滴可吸入吐回）→ 低空盤旋（可打到）
    chooseAttack() {
      // 二階段多一招「雷雨」：灑雨 + 三道閃電，接著直接俯衝
      // 二階段：多一招「雷雨」，但雷雨結束會直接接俯衝，所以循環裡只放一次，
      // 而且每招之間都留一次低空盤旋（low = 給玩家打的窗口），否則普通玩家會被連段打死。
      const seq = this.phase === 2 ? ['storm', 'low', 'lightning', 'low', 'rain', 'swoop'] : ['lightning', 'swoop', 'rain', 'low'];
      this.setState(seq[this.attackIdx++ % seq.length]);
    }
    onPhase2() { this.attackIdx = 0; this.setState('storm'); }
    // 垂直閃電：從 x 劈到地面
    bolt(x) {
      const fl = groundY(x, this.bottom);
      this.boltX = x; this.boltY = fl; this.boltT = 20;
      KB.hitbox({ x: x - 5, y: this.bottom, w: 10, h: Math.max(8, fl - this.bottom), dmg: 1, owner: 'enemy', type: 'lightning', life: 20, pierce: true });
      KB.audio.sfx('spark'); if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 3);
    }
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
      this.wob += 0.02; this.calcHover();
      if (this.boltT > 0) this.boltT--;
      // 低空盤旋、以及俯衝後的低空停留，都是給玩家打的窗口：那時碰到雲不會受傷
      this.contactDamage = this.state !== 'low' && !(this.state === 'swoop' && this.sub === 2);
      if (this.restT > 0) this.restT--;
      switch (this.state) {
        case 'idle':
          this.hoverTo(p.cx - this.w / 2 + Math.sin(this.wob) * 72, this.hoverY + Math.sin(this.t * 3) * 5, 0.05);
          // restT：灑完雨會多留 20 幀再出下一招（雨與閃電之間的間隔 +20 幀）
          if (this.stateT > this.iv(90) && this.restT <= 0) this.chooseAttack();
          break;
        case 'lightning': {  // 從目前位置垂直劈下（不追蹤玩家）：預警後劈，站在雲正下方才會被劈到
          const warn = 30;   // 閃電的電火花預警不縮短（那是玩家唯一的反應時間）
          if (this.stateT < warn) {
            this.hoverTo(this.x, this.hoverY, 0.08);
            if (this.stateT % 3 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.bottom, '#ffff80', 1, { spread: 0.4, grav: 0, life: 8, up: 0 });
          }
          // 一階段的閃電只鎖定 1 道（二階段的 storm 才有兩道）
          if (this.stateT === warn && !this.bolted) { this.bolted = true; this.bolt(this.cx); }
          if (this.stateT > this.iv(64)) { this.bolted = false; this.setState('idle'); }
          break;
        }
        case 'storm': {  // 【二階段新招】閃電雨：一邊灑雨一邊劈兩道閃電，結束接俯衝
          // 雷位置在進招時就鎖定（不追蹤玩家）：站著不動才會被劈到，走開就躲得掉
          if (this.stateT === 1) this.tx = clamp(p.cx, 40, mapW() - 40);
          this.hoverTo(this.tx - this.w / 2 + Math.sin(this.wob * 2) * 24, this.hoverY, 0.04);
          if (this.stateT % 12 === 0 && this.stateT < 80) this.drop();
          // 兩道雷往後挪 20 幀（32/70 → 52/90）：雨與閃電之間留出 +20 幀的反應時間
          for (const f of [52, 90]) {
            if (this.stateT >= f - 26 && this.stateT < f && this.stateT % 3 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 36, this.bottom, '#ffff80', 1, { spread: 0.4, grav: 0, life: 8, up: 0 });
            if (this.stateT === f) this.bolt(this.cx);
          }
          if (this.stateT > 116) this.setState('swoop');
          break;
        }
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
          } else if (this.sub === 2) {
            // Round 3：俯衝結束後在低空多停 24 幀（不上升、沒有碰觸傷害）＝ 給玩家的攻擊窗
            this.y += (Math.max(this.lowY, this.ty) - this.y) * 0.15;
            if (this.subT % 6 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 44, this.bottom, '#ffff80', 1, { spread: 0.3, grav: 0, life: 8, up: 0.3 });
            if (++this.subT >= 24) { this.sub = 3; this.subT = 0; this.sy = this.y; }
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
          if (this.stateT % this.iv(9) === 0 && this.stateT < 50) this.drop();
          if (this.stateT > this.iv(70)) { this.restT = 20; this.setState('idle'); }   // 灑完雨多喘 20 幀
          break;
        case 'low':   // 低空盤旋 130 幀：在玩家附近左右漂，讓玩家有揮劍的機會（雲的下緣冒電火花警示）
          this.hoverTo(p.cx - this.w / 2 + Math.sin(this.wob * 3) * 40, this.lowY, 0.06);
          if (this.stateT % 6 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 40, this.bottom, '#ffff80', 1, { spread: 0.3, grav: 0, life: 8, up: 0.3 });
          if (this.stateT > 130) this.setState('idle');
          break;
      }
      this.trySpawnMinion();
    }
    draw(g) {
      if (this.boltT > 0) {
        const bright = (this.boltT & 2) ? '#ffffa0' : '#ffffff';
        if (!KB.has('proj_lightning')) g.rect(this.boltX - 3, this.bottom, 6, this.boltY - this.bottom, bright);
        else for (let y = this.bottom + 16; y <= this.boltY + 15; y += 16) g.spr('proj_lightning', this.boltX, Math.min(y, this.boltY), { t: this.t, fps: 12 });
      }
      const spr = this.hurtT > 0 ? 'kracko_hurt' : ((this.state === 'idle' || this.state === 'low') ? 'kracko_idle' : 'kracko_attack');
      if (this.state === 'storm' && (Math.floor(this.t * 60) % 6) === 0) KB.particles(this.cx + (this.rng() - 0.5) * 50, this.bottom - 4, '#8090ff', 1, { spread: 0.5, grav: 0, life: 12, up: 0 });
      this.drawBody(g, spr, this.introducing ? { flip: false, alpha: this.introAlpha } : { flip: false });
    }
  }
  KB.BOSSES.kracko = Kracko;

  // =====================================================================
  // W4 魅塔騎士：登場先丟一把劍給卡比（沒有能力時）。走向玩家、揮劍、衝刺斬、跳躍、劍氣、披風消失後出現在另一側。
  // =====================================================================
  const CAPE_OPEN = 40, CAPE_SHUT = 104;   // 魅塔騎士登場：披風展開 / 收攏的幀
  class MetaKnight extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '魅塔騎士'; this.subtitle = 'META KNIGHT'; this.name = 'metaknight';
      // R4（QA R3-P1-02）：兩種玩家模型 10/10 樣本都 100%、平均 838 幀就被殺完（比 w2 的 1225 幀還快）
      //   ⇒ maxHp 45 → 55（拉長戰鬥），二階段的揮劍改成 2 點（見 case 'slash'）。
      this.hp = this.maxHp = 55; this.score = 8000; this.color = '#3040a0';
      this.solid = true; this.grav = KB.GRAV; this.spr = 'metaknight_idle'; this.setSize(20, 26);
      this.swordStar = null; this.decisions = 0; this.dashBox = null; this.dir = -1; this.stunCD = 0;
      // QA P0-01：迴避（vanish / backstep）不能無限連發，否則普通玩家永遠打不到他
      // Round 3 balance-enemies：Round 1 為了修 P0-01 疊了三個限制，結果魅塔騎士變成 5 個魔王裡最弱的
      // （QA R2-2 / R2-P1-02：sword 機器人零傷通關）。三個值一起往回收，但保留「迴避後一定有攻擊窗」的結構。
      this.vanishCD = 0;      // 消失後 120 幀內不能再消失（原 180）
      this.evadeLock = 0;     // 受傷後 20 幀內不能迴避（原 30）
      this.rageColor = '#8040ff'; this.phase2Msg = '魅塔騎士拔出了真劍！';
      this.setState('idle');
    }
    // 【登場】披風整件裹著站定 → 猛然展開成雙翼（風壓粒子）→ 再收攏 → 換回一般站姿
    introUpdate(dt) {
      super.introUpdate(dt);
      const k = this.introT;
      if (k === 1) { this.facePlayer(); KB.audio.sfx('slide'); }
      if (k === CAPE_OPEN) {
        KB.audio.sfx('cutter');
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 4);
        KB.particles(this.cx, this.cy, ['#8040ff', '#c0b0ff', '#ffffff'], 14, { spread: 3, grav: -0.01, life: 26 });
      }
      if (k > CAPE_OPEN && k < CAPE_SHUT && k % 3 === 0)
        KB.particles(this.cx + (this.rng() - 0.5) * 34, this.cy - 6 + this.rng() * 16, ['#8040ff', '#4050b0', '#ffffff'], 1,
          { spread: 0.4, grav: -0.012, life: 24, up: 0.3, vx: (this.rng() - 0.5) * 1.6, size: 1 });
      if (k === CAPE_SHUT) { KB.audio.sfx('slide'); KB.fx('fx_poof', this.cx, this.cy + 6); }
    }
    drawIntro(g) {
      const k = this.introT || 0;
      if (k >= CAPE_SHUT + 14) { this.drawBody(g, 'metaknight_idle'); return; }
      this.drawBody(g, 'metaknight_cape', { frame: (k >= CAPE_OPEN && k < CAPE_SHUT) ? 1 : 0 });
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
    get canVanish() { return this.vanishCD <= 0 && this.evadeLock <= 0; }
    // R4（QA R3-P1-02）：二階段「拔出真劍」之後揮劍 1 → 2 點（一階段維持 1 點，仍是學招式的階段）。
    //   只有揮劍（slash）吃這個加成 —— 實測把 dash / 劍氣 / 龍捲一起加到 2 點，
    //   中距離（刀刃）玩家模型會被遠程彈幕直接三振（boss_test [mid] 0/1），那是「打不到也躲不掉」而不是難度。
    get rageDmg() { return this.phase === 2 ? 2 : 1; }
    // 二階段門檻維持基底的 40%（改成 50% / 65% 都實測過：曲線沒變、但 fight / mid 會開始 FAIL）
    onPhase2() { this.vanishCD = Math.max(this.vanishCD, 90); this.setState('tornado'); }
    decide() {
      const p = this.player, dist = this.playerDist(), r = this.rng();
      this.decisions++;
      const rage = this.phase === 2;
      // 二階段新招：龍捲（貼地追過來）與劍氣三連
      if (rage && this.decisions % 3 === 0) return this.setState(r < 0.5 ? 'tornado' : 'tricutter');
      if (this.decisions % 5 === 0 && r < 0.7 && this.canVanish) return this.setState('vanish');
      if (p && p.cy < this.y - 24 && dist < 60) return this.setState('jump');
      if (dist < 34) return this.setState(r < 0.6 ? 'slash' : (this.evadeLock > 0 ? 'slash' : 'backstep'));
      if (dist < 120) { if (r < 0.35) return this.setState('dash'); if (r < 0.6) return this.setState(rage ? 'tricutter' : 'cutter'); return this.setState('walk'); }
      if (r < 0.5) return this.setState('walk'); if (r < 0.8) return this.setState('cutter');
      return this.setState(this.canVanish ? 'vanish' : 'walk');
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      const dist = this.playerDist();
      if (this.stunCD > 0) this.stunCD--;
      if (this.vanishCD > 0) this.vanishCD--;
      if (this.evadeLock > 0) this.evadeLock--;
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
          if (this.stateT > this.iv(18)) this.decide();
          break;
        case 'recover':   // QA P0-01：每次迴避後的硬直（不反擊、也不會撞傷人，是玩家的攻擊窗）
          // Round 3：40 → 16 幀（40 幀等於站著讓人砍，見 QA R2-P1-02）
          this.vx *= 0.8; this.contactDamage = false;
          if (this.stateT % 8 === 0) KB.particles(this.cx, this.y - 2, '#a080ff', 1, { spread: 0.4, grav: 0, life: 14, up: 0.5 });
          if (this.stateT > 16) { this.facePlayer(); this.setState('idle'); }
          break;
        case 'walk':
          this.facePlayer(); this.vx = this.dir * (this.phase === 2 ? 1.7 : 1.3);
          if (this.hitWall || dist < 26 || this.stateT > this.iv(70)) this.setState('idle');
          break;
        case 'slash': {
          // R4：二階段的「真劍」揮砍 1 → 2 點（貼身互砍的玩家必須開始閃，不能站著對砍）
          const sdmg = this.rageDmg;
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          if (this.stateT === 8) { KB.hitbox({ x: 0, y: 0, w: 24, h: 24, dmg: sdmg, owner: 'enemy', type: 'sword', follow: this, ox: 2, oy: 0, life: 10, pierce: true }); KB.audio.sfx('sword'); }
          if (this.phase === 2 && this.stateT === 20) { KB.hitbox({ x: 0, y: 0, w: 26, h: 24, dmg: sdmg, owner: 'enemy', type: 'sword', follow: this, ox: 2, oy: 0, life: 10, pierce: true }); KB.audio.sfx('sword'); }
          // R4：二階段的揮劍變成 2 點，相對地「砍完一定往後跳開」（backstep → recover 的 16 幀是玩家的固定攻擊窗），
          //   否則貼身互砍會變成純粹的比血量長短，而不是「看準破綻再上」。
          if (this.stateT > this.iv(26)) this.setState(((this.phase === 2 || this.rng() < 0.6) && this.evadeLock <= 0) ? 'backstep' : 'idle');
          break;
        }
        case 'backstep':   // 往後跳開一小段，落地後有硬直
          if (this.stateT === 1) { this.facePlayer(); this.vx = -this.dir * 2.0; this.vy = -3.0; }
          if (this.stateT > 6 && this.onGround) { this.vx = 0; this.setState('recover'); }
          if (this.stateT > 60) this.setState('recover');
          break;
        case 'tornado': {  // 【二階段新招】旋身放出貼地龍捲，沿地面追過去（可以跳過）
          this.vx *= 0.7;
          if (this.stateT === 1) { this.facePlayer(); KB.audio.sfx('slide'); }
          if (this.stateT === 14) {
            const gy = groundY(this.cx, this.bottom - 2);
            KB.spawn(new Shockwave(this.cx + this.dir * 18, gy, this.dir, { speed: 2.2, life: 150, dmg: 1, color: '#b0a0ff' }));
            KB.audio.sfx('cutter');
          }
          if (this.stateT % 4 === 0 && this.stateT < 16) KB.particles(this.cx, this.cy, '#c0b0ff', 2, { spread: 1.6, grav: 0, life: 16, up: 0 });
          if (this.stateT > 40) this.setState('idle');
          break;
        }
        case 'tricutter':   // 【二階段新招】劍氣三連（高 / 中 / 低三道）
          this.vx *= 0.7;
          if (this.stateT === 1) this.facePlayer();
          for (let k = 0; k < 3; k++) if (this.stateT === 8 + k * 9) {
            const oy = [-10, 0, 8][k];
            KB.shoot({ spr: 'proj_cutter', x: this.cx + this.dir * 12, y: this.cy + oy, vx: this.dir * 3.4, dmg: 1, owner: 'enemy', life: 100, w: 12, h: 12, solid: false, pierce: false, rotSpeed: 0.4 * this.dir, type: 'cutter', dir: this.dir });
            KB.audio.sfx('cutter');
          }
          if (this.stateT > 44) this.setState('idle');
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
          if (this.stateT === this.iv(8)) {
            this.facePlayer();
            KB.shoot({ spr: 'proj_cutter', x: this.cx + this.dir * 12, y: this.cy - 2, vx: this.dir * 3.2, dmg: 1, owner: 'enemy', life: 90, w: 12, h: 12, solid: false, pierce: false, rotSpeed: 0.4 * this.dir, type: 'cutter', dir: this.dir });
            KB.audio.sfx('cutter');
          }
          if (this.stateT > this.iv(24)) this.setState('idle');
          break;
        case 'vanish': {  // 披風消失 40 幀（無敵）→ 出現在玩家另一側 → 40 幀硬直
          if (this.stateT === 1) {
            this.vanishCD = 120;
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
          if (this.stateT > 46) this.setState('recover');
          break;
        }
        case 'hurt':
          this.vx *= 0.85;
          if (this.stateT > this.iv(14)) this.setState('idle');
          break;
      }
    }
    onHurt(amount, src) {
      this.evadeLock = 20;   // QA P0-01：剛被打到就不准馬上消失 / 後跳（Round 3：30 → 20）
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
      if (this.introducing) { this.drawIntro(g); return; }
      let spr = 'metaknight_idle', o = {};
      if (this.hurtT > 0 || this.state === 'hurt') spr = 'metaknight_hurt';
      else if (this.state === 'slash' || this.state === 'tricutter') { spr = 'metaknight_attack'; o.frame = this.stateT < 8 ? 0 : this.stateT < 16 ? 1 : 2; }
      else if (this.state === 'dash') spr = 'metaknight_dash';
      else if (this.state === 'tornado') { spr = 'metaknight_attack'; o.frame = (this.stateT >> 2) % 3; }
      this.drawBody(g, spr, o);
    }
  }
  KB.BOSSES.metaknight = MetaKnight;

  // =====================================================================
  // W5 迪迪迪大王：走向玩家、跳躍砸地（震波）、掄鎚（dmg 2）、吸入拉人、超高跳重落。
  // 被打會後退並短暫暈眩（有冷卻）；hp<50% 加速。
  // =====================================================================
  // Round 3 balance-enemies：迪迪迪的三個「反應時間」常數
  const DEDEDE_LAND_STUN = 20;    // 跳躍 / 超級跳落地硬直（新增）
  const DEDEDE_INHALE_WARN = 28;  // 張嘴到產生吸力的預警幀（原 16，+12）
  const DEDEDE_TRIPLE_GAP = 32;   // 二階段震波三連的每跳間隔（原 24，+8）
  class KingDedede extends Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '迪迪迪大王'; this.subtitle = 'KING DEDEDE'; this.name = 'dedede';
      this.hp = this.maxHp = 60; this.score = 10000; this.color = '#d04040';
      this.solid = true; this.grav = KB.GRAV; this.maxFall = 6; this.spr = 'dedede_idle'; this.setSize(40, 52);
      this.actions = 0; this.dizzyCD = 0; this.inhaleFx = null; this.dir = -1; this.jumps = 0;
      this.rageColor = '#ff2020'; this.phase2Msg = '迪迪迪大王怒了！';
      this.setState('idle');
    }
    get enraged() { return this.phase === 2; }
    // 【登場】王座後的大門打開 → 大搖大擺走出來 → 舉鎚敲兩下示威
    introUpdate(dt) {
      this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1;
      const N = KB.BOSS_INTRO, k = this.introT, walkEnd = N - 56;
      if (k === 1) {
        this.introDoorX = clamp(this.spawnX + 36, 4, Math.max(4, mapW() - this.w - 4));
        this.dir = -1; this.solid = false; this.grav = 0; this.vx = 0; this.vy = 0;
        KB.audio.sfx('door');
      }
      this.bottom = this.spawnY + T;
      if (k <= walkEnd) {
        this.x = this.introDoorX + (this.spawnX - this.introDoorX) * (k / walkEnd);
        if (k % 14 === 0) { KB.audio.sfx('land'); KB.particles(this.cx + 10, this.bottom, '#c0a060', 2, { spread: 0.8, grav: 0.12, life: 14, up: 0.4 }); }
      } else {
        this.x = this.spawnX;
        const j = k - walkEnd;
        if (j === 14 || j === 38) {   // 掄鎚敲地示威（純演出，沒有判定框）
          KB.audio.sfx('hammer');
          if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 5);
          KB.particles(this.cx - 22, this.bottom, ['#c0a060', '#f0e0c0', '#ffffff'], 9, { spread: 2.2, up: 1.4, life: 24 });
          KB.fx('fx_hit', this.cx - 26, this.bottom - 6);
        }
      }
    }
    onIntroEnd() {   // 同上：不重設 state / stateT，保留原本的開場節奏
      this.solid = true; this.grav = KB.GRAV;
      this.x = this.spawnX; this.bottom = this.spawnY + T; this.vx = 0; this.vy = 0;
    }
    // 王座後的大門（登場前 70 幀慢慢淡出）
    drawIntroDoor(g) {
      const k = this.introT || 0, a = Math.max(0, 1 - k / 70);
      if (a <= 0 || this.introDoorX === undefined) return;
      const w = this.w + 10, h = this.h + 12, gy = this.spawnY + T, x = this.introDoorX - 5;
      g.rect(x, gy - h, w, h, 'rgba(16,10,26,' + (0.92 * a).toFixed(2) + ')');
      g.rect(x - 3, gy - h - 4, w + 6, 4, 'rgba(208,164,64,' + a.toFixed(2) + ')');
      g.rect(x - 3, gy - h, 3, h, 'rgba(208,164,64,' + a.toFixed(2) + ')');
      g.rect(x + w, gy - h, 3, h, 'rgba(208,164,64,' + a.toFixed(2) + ')');
      g.rect(x + 2, gy - h + 3, w - 4, 2, 'rgba(120,88,32,' + a.toFixed(2) + ')');
    }
    drawIntro(g) {
      const N = KB.BOSS_INTRO, k = this.introT || 0, walkEnd = N - 56;
      this.drawIntroDoor(g);
      if (k <= walkEnd) { this.drawBody(g, 'dedede_walk', { fps: 6 }); return; }
      const j = k - walkEnd;
      const fr = j < 14 ? 0 : j < 26 ? 2 : j < 38 ? 0 : j < 48 ? 2 : 1;
      this.drawBody(g, 'dedede_hammer', { frame: fr });
    }
    onPhase2() { this.stopInhaleFx(); this.setState('inhale'); }
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
      // 張嘴吸不可以連續出：沒有武器的玩家會被「吸→碰觸傷害→再吸」鎖死（boss_test 的無劍樣本會卡到時間用完）
      const noInhale = this.lastAction === 'inhale' || this.lastAction === 'rampage';
      const act = s => { this.lastAction = s; return this.setState(s); };
      // 【二階段新招】吸入 → 跳躍震波三連
      if (this.phase === 2 && this.actions % 4 === 0 && !noInhale) return act('rampage');
      if (this.actions % 5 === 0) return act('superjump');
      if (dist < 52) return act(r < 0.65 || noInhale ? 'hammer' : 'inhale');
      if (dist < 130) { if (r < 0.4) return act('walk'); if (r < 0.7 || noInhale) return act('jump'); return act('inhale'); }
      if (r < 0.55) return act('walk'); if (r < 0.8) return act('jump'); return act('superjump');
    }
    ai(dt) {
      const p = this.player; if (!p) return;
      const dist = this.playerDist(), map = KB.game.map;
      if (this.dizzyCD > 0) this.dizzyCD--;
      // 不可以站在玩家身上壓著打（角落會變成每 90 幀一次的碰觸傷害死亡迴圈）：玩家在身體範圍內就往後跳開
      if (this.onGround && (this.state === 'idle' || this.state === 'walk' || this.state === 'inhale') && dist < this.w / 2 + 4 && this.stateT > 4) { this.stopInhaleFx(); this.setState('hop'); }
      // 身體只在「撞過來」的招式（跳躍砸地 / 吸入拉人）有碰觸傷害；站著、走路、掄鎚（有自己的判定框）、暈眩時貼身不會受傷，
      // 否則貼身互砍時光是被他走到就掉劍，簡單玩家打不贏最終魔王。
      // rampage（二階段的吸入起手）只負責把玩家拉過來，本體不帶碰觸傷害：
      // 拳擊台那種兩側有牆的窄場地，若「吸過來 + 碰到就受傷 + 接著三連跳」全開，普通玩家會被鎖死。
      // DEDEDE_INHALE_WARN：張嘴到真的產生吸力的預警幀（Round 3：16 → 28）
      // 'land'（落地硬直）是玩家的攻擊窗：本體不帶碰觸傷害
      this.contactDamage = this.state === 'jump' || this.state === 'superjump' || this.state === 'triplejump' || (this.state === 'inhale' && this.stateT >= DEDEDE_INHALE_WARN);
      switch (this.state) {
        case 'idle':
          this.vx *= 0.7; this.facePlayer();
          if (this.stateT > this.iv(this.enraged ? 20 : 26)) this.decide(dist);
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
        case 'rampage': {  // 【二階段新招】先吸一口氣把玩家拉近（40 幀），接著跳躍震波三連
          this.vx = 0;
          if (this.stateT === 1) { this.facePlayer(); KB.audio.sfx('inhale'); }
          if (!this.inhaleFx || this.inhaleFx.dead) this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 44, fps: 10 });
          this.inhaleFx.x = this.cx + this.dir * 44; this.inhaleFx.y = this.cy + 14; this.inhaleFx.flip = this.dir < 0;
          if (this.stateT >= DEDEDE_INHALE_WARN && p.overlapsRect(this.dir > 0 ? this.x + this.w : this.x - 88, this.y - 8, 88, this.h + 16) && !NO_PULL[p.state] && p.invincibleT <= 0) {
            const pull = -this.dir * 1.1, nx = p.x + pull, edge = pull > 0 ? nx + p.w - 1 : nx;
            if (!KB.physics.columnSolid(map, edge, p.y + 1, p.bottom - 1)) p.x = nx;
          }
          if (this.stateT >= 40 + 12) { this.stopInhaleFx(); this.setState('triplejump'); }
          break;
        }
        case 'triplejump':   // 連跳三次，每次落地都放雙向震波 + 衝擊星（可吸入吐回）
          // 每跳之間留 24 幀的落地硬直：拳擊台那種 14 格寬的窄場地若連續起跳，普通玩家沒有反應空間（會被震波夾死）
          if (this.stateT === 1) { this.facePlayer(); this.jumps = 0; this.hangT = 0; this.vy = -5.2; this.vx = this.dir * 1.3; KB.audio.sfx('jump'); }
          if (this.hangT > 0) {
            this.vx *= 0.8;
            if (--this.hangT === 0) { this.facePlayer(); this.vy = -5.2; this.vx = this.dir * clamp(Math.abs(this.playerDx()) / 60, 0.4, 1.4); KB.audio.sfx('jump'); this.stateT = 1; }
            break;
          }
          if (this.stateT > 4 && this.onGround) {
            this.land(2.6, 6);
            if (++this.jumps >= 3) { this.vx = 0; this.setState('land'); }   // 三連跳打完也有落地硬直
            else this.hangT = DEDEDE_TRIPLE_GAP;   // Round 3：24 → 32 幀
          }
          if (this.stateT > 260) { this.vx = 0; this.setState('idle'); }
          break;
        case 'hammer':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          if (this.stateT === 16) {   // 掄鎚的預備動作不縮短（16 幀是玩家的反應時間）
            KB.hitbox({ x: 0, y: 0, w: 40, h: 48, dmg: 2, owner: 'enemy', type: 'hammer', follow: this, ox: 6, oy: 4, life: 12, pierce: true });
            KB.audio.sfx('hammer'); KB.game.shake = 4; KB.particles(this.cx + this.dir * 30, this.bottom, '#c0a060', 6, { spread: 1.5 });
            this.impactStar(this.cx + this.dir * 34, this.bottom - 8, this.dir * 2.0, -3.2);
          }
          if (this.stateT > this.iv(44)) this.setState('idle');
          break;
        case 'jump':   // 跳向玩家前方約 36px 落地（威脅是震波與衝擊星，不是直接壓人；站在原地會被震波掃到）
          if (this.stateT === 1) { this.facePlayer(); this.vy = -5.4; this.vx = this.dir * clamp((Math.abs(this.playerDx()) - 36) / 45, 0.3, 2.0); KB.audio.sfx('jump'); }
          if (this.stateT > 4 && this.onGround) { this.vx = 0; this.land(2.5, 6); this.setState('land'); }
          break;
        case 'land':   // 【Round 3】跳躍 / 超級跳落地後的 20 幀硬直：不動、沒有碰觸傷害，是玩家的攻擊窗
          this.vx *= 0.7;
          if (this.stateT % 7 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.bottom, '#c0a060', 1, { spread: 0.5, grav: 0.1, life: 12, up: 0.3 });
          if (this.stateT > DEDEDE_LAND_STUN) { this.vx = 0; this.facePlayer(); this.setState('idle'); }
          break;
        case 'superjump':   // 像卡比一樣跳很高再重落：下落的前 24 幀追蹤玩家位置，之後鎖定落點（走開就躲得掉）
          if (this.stateT === 1) { this.facePlayer(); this.vy = -8; this.vx = this.dir * 1.0; this.trackT = 0; KB.audio.sfx('jump'); }
          if (this.stateT > 4 && this.vy > 0) { this.grav = 0.55; this.maxFall = 8; if (this.trackT++ < 24) this.vx = clamp(this.playerDx(), -1.2, 1.2); }
          if (this.stateT > 4 && this.onGround) { this.grav = KB.GRAV; this.maxFall = 6; this.vx = 0; this.land(3.2, 10); this.setState('land'); }
          break;
        case 'inhale': {  // 張嘴 28 幀預警（Round 3：16 +12）後，前方吸力把玩家拉過來到 76 幀；碰到本體就受傷彈開（由 game 的碰觸傷害處理）
          this.vx = 0;
          if (this.stateT === 1) { this.facePlayer(); KB.audio.sfx('inhale'); }
          if (!this.inhaleFx || this.inhaleFx.dead) this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 64 + 12, fps: 10 });
          this.inhaleFx.x = this.cx + this.dir * 44; this.inhaleFx.y = this.cy + 14; this.inhaleFx.flip = this.dir < 0;
          // 吸力 1.1 px/f < 走路 1.3：往反方向走就能掙脫；站著不動才會被拉到身上（碰觸傷害）
          const rx = this.dir > 0 ? this.x + this.w : this.x - 88, ry = this.y - 8, rw = 88, rh = this.h + 16;
          if (this.stateT >= DEDEDE_INHALE_WARN && p.overlapsRect(rx, ry, rw, rh) && !NO_PULL[p.state] && p.invincibleT <= 0) {
            const pull = -this.dir * 1.1, nx = p.x + pull, edge = pull > 0 ? nx + p.w - 1 : nx;
            if (!KB.physics.columnSolid(map, edge, p.y + 1, p.bottom - 1)) p.x = nx;
            if (this.stateT % 5 === 0) KB.particles(p.cx - pull * 6, p.cy, '#e0f0ff', 1, { spread: 0.4, vx: pull, grav: 0, life: 10, up: 0 });
          }
          if (this.stateT >= 64 + 12) { this.stopInhaleFx(); this.setState('idle'); }
          break;
        }
        case 'dizzy':
          // 暈眩是玩家的攻擊窗，二階段不縮短（縮短等於把最終魔王的唯一空檔拿掉）
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
    onHurtPhaseGuard() { }
    draw(g) {
      if (this.introducing) { this.drawIntro(g); return; }
      let spr = 'dedede_idle', o = {};
      switch (this.state) {
        case 'walk': spr = 'dedede_walk'; o.fps = this.enraged ? 10 : 7; break;
        case 'jump': case 'superjump': case 'hop': case 'triplejump': spr = 'dedede_jump'; break;
        case 'land': spr = this.stateT < 8 ? 'dedede_jump' : 'dedede_idle'; break;   // 落地硬直：先保持落地姿勢再站直
        case 'hammer': spr = 'dedede_hammer'; o.frame = this.stateT < 16 ? 0 : this.stateT < 30 ? 1 : 2; break;
        case 'inhale': case 'rampage': spr = 'dedede_inhale'; break;
        case 'dizzy': spr = 'dedede_hurt'; break;
      }
      if (this.hurtT > 0 && this.state !== 'hammer') spr = 'dedede_hurt';
      this.drawBody(g, spr, o);
    }
  }
  KB.BOSSES.dedede = KingDedede;
})();
