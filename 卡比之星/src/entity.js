// Entity 基底、敵人基底、攻擊判定框、特效、投射物、粒子
(function () {
  let NEXT_ID = 1;

  class Entity {
    constructor(x, y) {
      this.id = NEXT_ID++;
      this.x = x || 0; this.y = y || 0; this.w = 16; this.h = 16;
      this.vx = 0; this.vy = 0; this.dir = 1;
      this.type = 'enemy';
      this.hp = 1; this.maxHp = 1; this.dead = false; this.t = 0; this.frame = 0;
      this.invuln = 0; this.flash = 0;
      this.grav = KB.GRAV; this.maxFall = KB.MAXFALL; this.solid = true; this.onGround = false;
      this.inhalable = false; this.ability = null; this.hurtsPlayer = false; this.damage = 1;
      this.score = 0; this.z = 0; // z: 繪製順序（大者在上）
      this.persistent = false;   // 房間切換不移除（一般不用）
      this.offscreenKill = false; // 離開畫面很遠時移除（投射物用）
      this.name = '';
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get top() { return this.y; }
    get bottom() { return this.y + this.h; }
    set cx(v) { this.x = v - this.w / 2; }
    set bottom(v) { this.y = v - this.h; }
    overlaps(o) { return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y; }
    overlapsRect(x, y, w, h) { return this.x < x + w && this.x + this.w > x && this.y < y + h && this.y + this.h > y; }
    distTo(o) { const dx = o.cx - this.cx, dy = o.cy - this.cy; return Math.sqrt(dx * dx + dy * dy); }
    physics() { if (this.solid && KB.game) KB.physics.step(this, KB.game.map); else { this.x += this.vx; this.y += this.vy; } }
    baseUpdate(dt) { this.t += dt; if (this.invuln > 0) this.invuln--; if (this.flash > 0) this.flash--; if (this.invincibleHitT > 0) this.invincibleHitT--; }
    update(dt) { this.baseUpdate(dt); }
    draw(g) { g.rect(this.x, this.y, this.w, this.h, '#f0f'); }
    hurt(amount, src) {
      if (this.dead || this.invuln > 0) return false;
      this.hp -= amount; this.flash = 6; this.invuln = 4;
      if (this.hp <= 0) { this.die(src); return true; }
      if (KB.audio) KB.audio.sfx('enemyhit');
      return true;
    }
    die(reason) {
      if (this.dead) return; this.dead = true;
    }
    onInhaled(player) { this.dead = true; }
    onScreen(margin) {
      margin = margin || 0; const c = KB.game ? KB.game.cam : { x: 0, y: 0 };
      return this.x + this.w > c.x - margin && this.x < c.x + KB.W + margin && this.y + this.h > c.y - margin && this.y < c.y + KB.VIEW_H + margin;
    }
    // 繪製輔助：受傷閃白
    sprOpts(extra) {
      const o = extra || {};
      if (this.flash > 0 && (this.flash & 2)) o.tint = '#ffffff';
      if (o.t === undefined) o.t = this.t;
      if (o.flip === undefined) o.flip = this.dir < 0;
      return o;
    }
  }
  KB.Entity = Entity;

  // ---------- Extra（超難）難度鉤子 ----------
  // 開關：KB.session.extra === true（由選單 / 存檔設定，本檔只讀）。
  // 所有倍率集中在這裡，敵人 / 魔王端一律透過 KB.exK() 取值，不要在各自的檔案裡再寫死 1.2 / 1.25。
  //   spd     敵人移動速度（Enemy.walk / Baddie.chase）
  //   proj    敵方投射物初速（Projectile 建構）
  //   bossHp  魔王 maxHp（Boss.ensureExtra）
  //   miniHp  中魔王 maxHp（Baddie.applyExtra）
  //   phase2  魔王二階段門檻（佔 maxHp 的比例；一般難度 0.5）
  KB.EXTRA = { spd: 1.2, proj: 1.2, bossHp: 1.25, miniHp: 1.25, phase2: 0.6 };
  KB.extraOn = () => !!(KB.session && KB.session.extra);
  KB.exK = k => (KB.extraOn() ? KB.EXTRA[k] : 1);
  KB.exPhase2 = () => (KB.extraOn() ? KB.EXTRA.phase2 : 0.5);

  // ---------- 敵人基底 ----------
  class Enemy extends Entity {
    constructor(x, y) {
      super(x, y);
      this.type = 'enemy'; this.hp = 2; this.maxHp = 2;
      this.inhalable = true; this.hurtsPlayer = true; this.damage = 1; this.score = 200;
      this.spr = 'waddledee_walk'; this.speed = 0.5;
      this.turnAtEdge = true; this.turnAtWall = true;
      this.beingInhaled = false; this.inhaleSrc = null;
      this.freezeT = 0;  // 被冰凍幀數
      // ---- 元素標籤（Round 6 elements；規則見 src/elements.js）----
      // element: 'fire'|'ice'|'spark'|'metal'|'ghost'|null（火屬性不會被點燃）
      // weak / resist: ['fire','ice','spark','wind','physical'] —— 命中元素在表內 → ×2 / ×resistK（預設 0.5）
      this.element = null; this.weak = null; this.resist = null;
      this.status = null;   // { burn, para }：被火打到燃燒 3 秒、被電打到麻痺 60 幀
      this.z = 1; this.walkAnim = true;
      this.dropItem = null; // 死亡掉落道具 key（spawnDef 的 drop，優先於 dropTable）
      // 掉落表：{道具 key: 機率}，由 die() 統一 roll（見 rollDrop）。
      this.dropTable = { pointstar: 0.25, food: 0.05 };
      this.exK = 1;         // Extra 難度的移動速度倍率（Baddie.applyExtra 設定）
      this.startX = x; this.startY = y; this.stepH = 8;
      this.active = false;   // 進入畫面後才啟動
    }
    get player() { return KB.player; }
    // ---- 世界強度分級（Round 3 balance-enemies）----------------------------
    // tier 1~5 對應 w1~w5（取 KB.game.level.id 裡的數字）；關卡定義的 spawnDef.a 若是 1~5 的數字就覆寫，
    // 例如 `{ t:'sirkibble', x:75, y:9, a:4 }` 可以在 w1 就放一隻「w4 強度」的 Sir Kibble。
    // 認不出世界的關卡（競技場 / boss_test 注入的測試房）用 3＝完整行為，避免測試被削弱。
    // 敵人一律讀 this.tier / this.tough，不要各自去讀 KB.game.level。
    get tier() {
      if (this._tier === undefined) {
        let t = 0;
        const a = this.spawnDef ? this.spawnDef.a : undefined;
        if (typeof a === 'number' && a >= 1 && a <= 5) t = Math.round(a);
        else {
          const id = KB.game && KB.game.level ? String(KB.game.level.id || '') : '';
          const m = /(\d+)/.exec(id);
          if (m) t = Math.max(1, Math.min(5, parseInt(m[1], 10)));
        }
        this._tier = t || 3;
      }
      return this._tier;
    }
    get tough() { return this.tier >= 3; }          // w3 起才開啟強化行為（接刃 / 6 道掃射 / 短冷卻）
    // 察覺玩家（notice）後的移動加速倍率。Round 1 各敵人各自寫死 1.4~1.8，w1 第一房就被追著跑（QA R2-1）；
    // Round 3 統一成 w1~w2 ×1.1、w3 起 ×1.25。
    get alertK() { return this.tough ? 1.25 : 1.1; }
    facePlayer() { if (KB.player) this.dir = KB.player.cx < this.cx ? -1 : 1; }
    playerDist() { return KB.player ? Math.abs(KB.player.cx - this.cx) : 9999; }
    playerDx() { return KB.player ? KB.player.cx - this.cx : 0; }
    playerDy() { return KB.player ? KB.player.cy - this.cy : 0; }
    // 走路 AI：遇牆 / 懸崖轉向
    walk(speed) {
      speed = speed !== undefined ? speed : this.speed;
      if (this.onGround) {
        if (this.turnAtWall && KB.physics.wallAhead(KB.game.map, this)) this.dir *= -1;
        else if (this.turnAtEdge && KB.physics.edgeAhead(KB.game.map, this)) this.dir *= -1;
      }
      this.vx = speed * this.dir * (this.exK || 1);
    }
    // 被吸入中（player 呼叫）：往嘴巴移動
    pullTo(px, py, strength) {
      const dx = px - this.cx, dy = py - this.cy, d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      this.x += dx / d * strength; this.y += dy / d * strength * 0.6;
    }
    update(dt) {
      this.baseUpdate(dt);
      if (KB.ELEM) KB.ELEM.updateStatus(this);       // 燃燒 DoT / 連鎖點燃 / 麻痺粒子
      if (this.dead) return;
      if (this.freezeT > 0) { this.freezeT--; this.vx = 0; this.physics(); if (this.freezeT === 0) this.vx = 0; return; }
      if (this.beingInhaled) { return; }
      // 麻痺：不能行動（重力照走），到期自動恢復
      if (this.status && this.status.para > 0) { this.vx = 0; this.physics(); return; }
      this.ai(dt);
      this.physics();
      if (this.fellOut) this.dead = true;
    }
    ai(dt) { this.walk(); }
    // 暗房（room.dark）裡的敵人可見度（Round 3 balance-enemies）：
    //   ① this.glow = 10 —— 給 game.js 的 drawDark 讀的「要挖洞的半徑」（見 PROGRESS 跨檔需求，polish-ui 負責）；
    //   ② 先畫一圈半徑 10px 的暗黃色徑向光暈（alpha 0.25）＋ 眼睛兩顆 1px 亮點。
    // 注意：drawDark 的黑幕是畫在所有實體之後（destination-out 只挖玩家 / 火把），
    //       所以在 drawDark 補上 glow 挖洞之前，這裡畫的東西在黑幕最暗處只會透出約 6%。
    //       眼睛亮點用純白、畫在光暈上面，是在「玩家光圈邊緣」最先看得見的部分。
    drawGlow(g) {
      const room = KB.game && KB.game.room;
      if (!room || !room.dark) { if (this.glow) this.glow = 0; return; }
      this.glow = 10;
      const c = g.ctx, x = Math.round(this.cx - g.cam.x), y = Math.round(this.cy - g.cam.y);
      c.save();
      c.globalAlpha = 0.25;
      const gr = c.createRadialGradient(x, y, 0, x, y, 10);
      gr.addColorStop(0, '#ffe080'); gr.addColorStop(0.5, 'rgba(200,160,48,0.55)'); gr.addColorStop(1, 'rgba(120,96,16,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill();
      c.restore();
      // 眼睛：兩顆 1px 亮點（朝著面向的方向偏 1px）
      const ex = x + (this.dir < 0 ? -1 : 1), ey = Math.round(this.y - g.cam.y + this.h * 0.35);
      c.save(); c.fillStyle = '#fffff0'; c.fillRect(ex - 2, ey, 1, 1); c.fillRect(ex + 2, ey, 1, 1); c.restore();
    }
    draw(g) {
      if (this.freezeT > 0) { this.drawFrozen(g); return; }
      const wx = KB.inhaleWobble(this);
      this.drawGlow(g);
      g.spr(this.spr, this.cx + wx, this.bottom + (this.wobY || 0), this.sprOpts({ t: this.beingInhaled ? 0 : this.t }));
    }
    drawFrozen(g) {
      g.spr(this.spr, this.cx, this.bottom, { frame: 0, flip: this.dir < 0, tint: '#a0e8ff' });
      g.rect(this.x - 2, this.y - 2, this.w + 4, this.h + 2, 'rgba(160,230,255,0.45)');
    }
    hurt(amount, src) {
      if (this.dead) return false;
      if (this.invuln > 0) return false;
      // 屬性弱點 ×2 / 抗性 ×0.5（含「弱點!」「抗性」演出），統一在這裡乘算
      const dmg = KB.ELEM ? KB.ELEM.applyHit(this, amount, src) : amount;
      this.hp -= dmg; this.flash = 8; this.invuln = 6;
      if (src && src.freeze) { this.freezeT = 120; }
      if (KB.ELEM) KB.ELEM.onHit(this, src);         // 火＝燃燒 3 秒 / 電＝麻痺 60 幀
      if (this.hp <= 0) { this.die(src); return true; }
      if (KB.audio) KB.audio.sfx('enemyhit');
      return true;
    }
    die(src) {
      if (this.dead) return; this.dead = true;
      if (this.freezeT > 0) {
        // 冰塊滑出
        if (KB.IceBlock) KB.spawn(new KB.IceBlock(this.x, this.y, src && src.cx !== undefined ? (this.cx < src.cx ? -1 : 1) : this.dir));
      } else if (this.status && this.status.burn > 0) {
        // 燒死：灰燼 + 火星（元素死亡反應）
        KB.fx('fx_poof', this.cx, this.cy + 8);
        KB.particles(this.cx, this.cy, ['#ffe040', '#ff9020', '#404048'], 10, { spread: 2.4, life: 30 });
      } else {
        KB.fx('fx_poof', this.cx, this.cy + 8);
        KB.particles(this.cx, this.cy, '#ffe040', 6, { spread: 2 });
      }
      if (KB.audio) KB.audio.sfx('enemydie');
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
      this.rollDrop(src);
    }
    // 掉落：只有「被攻擊打死」才會走到這裡 ——
    //   被吸入吞下 → onInhaled 直接 dead=true（不經 die）；掉出地圖 → update 裡 dead=true（不經 die）。
    // 規則：spawnDef 的 drop 指定優先（機率 100%）；魔王房不掉（免得魔王戰變成補品大放送）；
    //       dropTable 依序 roll，命中第一個就停（一次最多掉一個，機率 0 / 1 時為確定性行為）。
    rollDrop(src) {
      if (!KB.game || !KB.ITEMS) return null;
      if (this.dropItem) {
        if (!KB.ITEMS[this.dropItem]) return null;
        return KB.spawn(new KB.ITEMS[this.dropItem](this.x, this.y));
      }
      if (KB.game.isBossRoom) return null;
      const tbl = this.dropTable; if (!tbl) return null;
      for (const k in tbl) {
        const pr = tbl[k];
        if (!(pr > 0) || !KB.ITEMS[k]) continue;
        if (Math.random() >= pr) continue;
        const It = KB.ITEMS[k];
        return KB.spawn(k === 'pointstar' ? new It(this.cx - 4, this.cy - 4, { pop: true }) : new It(this.cx - 6, this.cy - 6));
      }
      return null;
    }
    onInhaled(player) {
      this.dead = true;
      player.mouth = { ability: this.ability, name: this.name || this.constructor.name, score: this.score };
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
    }
  }
  KB.Enemy = Enemy;
  // 被吸入中的掙扎：每 4 幀左右擺動 ±2px（回傳值），並以 e.wobY 做垂直 ±1 隨機抖動。
  // 這是「只影響繪製」的偏移，不會動到 x / y / 碰撞框 —— player.js 不需要再自行位移敵人；
  // 其他 agent 若要加吸力表現，請共用這個函式，不要各自再加一份位移。
  KB.inhaleWobble = function (e) {
    if (!e || !e.beingInhaled) { if (e) e.wobY = 0; return 0; }
    e.wobT = (e.wobT || 0) + 1;
    e.wobY = (e.wobT % 3 === 0) ? (Math.random() < 0.5 ? -1 : 1) : (e.wobY || 0);
    return (Math.floor(e.wobT / 4) % 2 ? 2 : -2);
  };
  KB.ENEMIES = KB.ENEMIES || {};
  KB.BOSSES = KB.BOSSES || {};
  KB.ITEMS = KB.ITEMS || {};

  // ---------- 攻擊判定框 ----------
  // opts: {x,y,w,h,dmg,owner:'player'|'enemy',type,life(幀),pierce,follow:entity,ox,oy,rehit(幀，0=只打一次),freeze,knock,breakBlocks,inhaleStop}
  class Hitbox extends Entity {
    constructor(o) {
      super(o.x, o.y);
      this.type = 'hitbox'; this.solid = false; this.grav = 0;
      this.w = o.w; this.h = o.h; this.dmg = o.dmg !== undefined ? o.dmg : 1;
      this.owner = o.owner || 'player'; this.ownerEnt = o.ownerEnt || null; this.kind = o.type || 'melee';
      this.life = o.life || 1; this.pierce = o.pierce !== false; this.follow = o.follow || null;
      this.ox = o.ox || 0; this.oy = o.oy || 0; this.flipWithOwner = o.flipWithOwner !== false;
      this.rehit = o.rehit || 0; this.hitSet = new Map(); this.freeze = !!o.freeze; this.knock = o.knock || 0;
      this.breakBlocks = o.breakBlocks !== false; this.z = 5;
      this.onHit = o.onHit || null; this.dir = o.dir || 1;
      this.onUpdate = o.onUpdate || null;   // 每幀回呼（判定框在擁有者之後更新，可安全改寫擁有者速度）
      this.stone = !!o.stone;
      // Round 10：近戰判定加倍（使用者回饋：劍 / 雷擊等貼身招範圍太小常被打死；遠程維持）。
      //   自動規則：owner 'player'、跟隨卡比本體（follow.type === 'player'）、原尺寸 ≤ 48×48、非 stone → 乘 KB.PHYS.meleeScale。
      //   建立時傳 melee:true / false 可強制開 / 關：絕對座標（不 follow）的貼身招請傳 melee:true；
      //   全畫面 / 持續光環 / 分身本體之類不該放大的傳 melee:false。
      //   放大方式：方向框（flipWithOwner）3/4 往前、1/4 往後；對稱框左右置中；高度一律置中；絕對框以原中心置中。
      //   保留 w0 / h0（原尺寸）與 meleeScaled（倍率）給測試與除錯 API 查驗。
      this.w0 = this.w; this.h0 = this.h; this.meleeScaled = 0;
      {
        const ms = (KB.PHYS && KB.PHYS.meleeScale) || 1;
        let melee = o.melee;
        if (melee === undefined) melee = this.owner === 'player' && !!o.follow && o.follow.type === 'player' && !this.stone && o.w <= 48 && o.h <= 48;
        if (melee && ms !== 1) {
          const w2 = Math.round(o.w * ms), h2 = Math.round(o.h * ms), dw = w2 - o.w, dh = h2 - o.h;
          if (o.follow) { this.ox = this.flipWithOwner ? this.ox - Math.round(dw / 4) : this.ox - Math.round(dw / 2); this.oy -= Math.round(dh / 2); }
          else { this.x -= Math.round(dw / 2); this.y -= Math.round(dh / 2); }
          this.w = w2; this.h = h2; this.meleeScaled = ms;
        }
      }
      // 石頭變身掛勾：player.js 的 startStone 會產生 {stone:true, owner:'player'} 判定框，
      // 以此通知 abilities.js（隨機外觀 / 斜坡滾動），避免動到 player.js
      if (this.stone && this.owner === 'player' && KB.ABILITIES && KB.ABILITIES.stone && KB.ABILITIES.stone.onStoneStart) {
        try { KB.ABILITIES.stone.onStoneStart(this.follow || KB.player, this); } catch (e) { }
      }
    }
    update(dt) {
      this.baseUpdate(dt);
      if (this.follow) {
        const f = this.follow; const d = this.flipWithOwner ? f.dir : 1;
        this.x = f.cx + (d > 0 ? this.ox : -this.ox - this.w); this.y = f.y + this.oy;
        this.dir = d;
        if (f.dead || (f.type === 'enemy' && f.active === false)) this.dead = true;
      }
      if (this.onUpdate) this.onUpdate(this);
      if (KB.ELEM) KB.ELEM.scanTiles(this);   // 元素環境反應（燒草 / 燒木箱 / 結冰 / 電擊水域 / 吹熄）
      this.life--; if (this.life <= 0) this.dead = true;
    }
    canHit(e) {
      const last = this.hitSet.get(e.id);
      if (last === undefined) return true;
      return this.rehit > 0 && (this.t * 60 - last) >= this.rehit;
    }
    markHit(e) { this.hitSet.set(e.id, this.t * 60); if (!this.pierce) this.dead = true; }
    draw(g) { if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(255,0,0,0.3)'); }
  }
  KB.Hitbox = Hitbox;
  KB.hitbox = o => { const h = new Hitbox(o); KB.spawn(h); return h; };

  // ---------- 特效 ----------
  class Fx extends Entity {
    constructor(name, x, y, o) {
      super(x, y); o = o || {};
      this.type = 'fx'; this.solid = false; this.grav = 0; this.spr = name; this.z = o.z !== undefined ? o.z : 6;
      const s = KB.SPR[name]; const n = s ? s.n : 1, fps = o.fps || (s ? s.fps : 8);
      this.fps = fps; this.life = o.life || Math.ceil(n * 60 / fps); this.flip = !!o.flip;
      this.vx = o.vx || 0; this.vy = o.vy || 0; this.w = 1; this.h = 1; this.loop = !!o.loop; this.alpha = o.alpha;
      this.anchorCenter = o.center !== false; this.tint = o.tint;
    }
    update(dt) { this.baseUpdate(dt); this.x += this.vx; this.y += this.vy; this.life--; if (this.life <= 0) this.dead = true; }
    draw(g) { g.spr(this.spr, this.x, this.y, { t: this.t, fps: this.fps, flip: this.flip, alpha: this.alpha, tint: this.tint }); }
  }
  KB.Fx = Fx;
  KB.fx = (name, x, y, o) => { if (!KB.game) return null; const f = new Fx(name, x, y, o); KB.spawn(f); return f; };

  // ---------- 粒子（輕量，不走 Entity） ----------
  KB.particles = function (x, y, color, n, o) {
    if (!KB.game) return; o = o || {};
    const sp = o.spread || 1.5, g = o.grav !== undefined ? o.grav : 0.15, life = o.life || 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * sp + 0.3;
      KB.game.parts.push({ x, y, vx: Math.cos(a) * s + (o.vx || 0), vy: Math.sin(a) * s - (o.up || 1) + (o.vy || 0), g, life: life + Math.random() * 10, color: Array.isArray(color) ? color[i % color.length] : color, size: o.size || (Math.random() < 0.5 ? 1 : 2) });
    }
  };

  // ---------- 投射物 ----------
  // o: {spr, x,y, vx,vy, dmg, owner, life, grav, bounce, pierce, w,h, onHit(target), onWall(), freeze, hurtsPlayer, destructible, rot, breakBlocks, flip}
  class Projectile extends Entity {
    constructor(o) {
      super(o.x, o.y);
      this.type = 'proj'; this.spr = o.spr || 'proj_star'; this.vx = o.vx || 0; this.vy = o.vy || 0;
      // Extra 難度：敵方投射物初速 ×1.2（在子類讀 vx 之前先乘，例如 Boomerang 的 maxV）
      if ((o.owner || 'enemy') === 'enemy' && KB.extraOn()) { const k = KB.EXTRA.proj; this.vx *= k; this.vy *= k; }
      this.w = o.w || 8; this.h = o.h || 8; this.x = o.x - this.w / 2; this.y = o.y - this.h / 2;
      this.dmg = o.dmg !== undefined ? o.dmg : 1; this.owner = o.owner || 'enemy';
      this.life = o.life || 120; this.grav = o.grav || 0; this.bounce = o.bounce || 0; this.pierce = !!o.pierce;
      this.onHitCb = o.onHit || null; this.onWallCb = o.onWall || null; this.freeze = !!o.freeze;
      this.hurtsPlayer = this.owner === 'enemy'; this.damage = this.dmg; this.destructible = o.destructible !== false;
      this.solid = o.solid !== false; this.maxFall = 6; this.z = 4; this.rot = o.rot || 0; this.rotSpeed = o.rotSpeed || 0;
      this.dir = o.dir || (this.vx < 0 ? -1 : 1); this.flip = o.flip !== undefined ? o.flip : this.dir < 0;
      this.breakBlocks = o.breakBlocks !== false; this.hitSet = new Set(); this.kind = o.type || 'proj'; this.offscreenKill = true;
      this.inhalable = !!o.inhalable; this.ownerEnt = o.ownerEnt || null; this.fxHit = o.fxHit || 'fx_hit'; this.knock = o.knock || 1.5;
      this.trail = o.trail || null; this.fps = o.fps; this.scale = o.scale;
    }
    update(dt) {
      this.baseUpdate(dt);
      if (this.beingInhaled) return;
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.rot += this.rotSpeed;
      const pvx = this.vx, pvy = this.vy;
      // 先破壞前方的星星 / 炸彈方塊（否則物理會先把投射物當撞牆殺掉）
      if (this.breakBlocks && this.solid && this.owner === 'player' && KB.game) {
        const map = KB.game.map, T = KB.TILE;
        const leadX = this.vx > 0 ? this.x + this.w + this.vx : (this.vx < 0 ? this.x + this.vx : null);
        const leadY = this.vy > 0 ? this.y + this.h + this.vy : (this.vy < 0 ? this.y + this.vy : null);
        let broke = false;
        if (leadX !== null) for (const py of [this.y + 1, this.cy, this.bottom - 1]) { const tx = Math.floor(leadX / T), ty = Math.floor(py / T), ch = map.get(tx, ty); if (ch === '*' || ch === 'B') { map.breakBlock(tx, ty); broke = true; } }
        if (leadY !== null) for (const px of [this.x + 1, this.cx, this.x + this.w - 1]) { const tx = Math.floor(px / T), ty = Math.floor(leadY / T), ch = map.get(tx, ty); if (ch === '*' || ch === 'B') { map.breakBlock(tx, ty); broke = true; } }
        if (broke && !this.pierce) { this.dead = true; KB.fx(this.fxHit, this.cx, this.cy + 6); return; }
      }
      this.physics();
      if (this.solid) {
        if (this.hitWall || this.hitCeil || (this.onGround && this.bounce === 0)) {
          if (this.bounce > 0 && this.hitWall) { this.vx = -pvx * this.bounce; this.dir *= -1; this.flip = this.dir < 0; }
          else if (this.onWallCb) { this.onWallCb(this); if (!this.dead) this.dead = true; }
          else { this.dead = true; KB.fx(this.fxHit, this.cx, this.cy + 6); }
        } else if (this.onGround && this.bounce > 0) { this.vy = -Math.abs(pvy) * this.bounce; if (Math.abs(this.vy) < 0.8) this.vy = -1.2; }
      }
      if (this.fellOut) this.dead = true;
      if (KB.ELEM) KB.ELEM.scanTiles(this);   // 元素環境反應（燒草 / 燒木箱 / 結冰 / 電擊水域 / 吹熄）
      if (this.trail && (Math.floor(this.t * 60) % 3 === 0)) KB.particles(this.cx, this.cy, this.trail, 1, { spread: 0.5, grav: 0, life: 12, up: 0 });
    }
    draw(g) { g.spr(this.spr, this.cx, this.bottom, { t: this.t, flip: this.flip, rot: this.rot, fps: this.fps }); }
    hurt(amount, src) { if (this.destructible) { this.dead = true; KB.fx('fx_hit', this.cx, this.cy + 6); return true; } return false; }
    onInhaled(player) { this.dead = true; player.mouth = { ability: null, name: 'proj', score: 10 }; }
  }
  KB.Projectile = Projectile;
  KB.shoot = o => { const p = new Projectile(o); KB.spawn(p); return p; };

  KB.spawn = function (e) { if (KB.game) KB.game.entities.push(e); return e; };
})();
