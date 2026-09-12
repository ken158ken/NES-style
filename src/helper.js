// 夥伴系統 KB.Helper（Round 6 系統深度）
// ---------------------------------------------------------------------------
// 長按 SELECT → 把身上的能力交給一個 AI 夥伴（超級豪華風的 Helper）。
//
// 對外 API（player.js / game.js / 測試都只需要這幾個）：
//   KB.Helper.spawn(p)      沒有夥伴且 p.ability 存在 → 生成夥伴（卡比失去能力、不掉能力星）並回傳 true；
//                           已經有夥伴 → 轉呼叫 recall()（吸回）並回傳 true；兩者都不成立回傳 false。
//                           ★ mix agent 的鉤子：「按住 select 45 幀 → KB.Helper.spawn(p)，回傳 true 則不丟能力」
//   KB.Helper.recall(p)     夥伴變回能力星飛向卡比，卡比重新取得該能力（回傳 true / false）
//   KB.Helper.exists()      目前有沒有夥伴
//   KB.Helper.get()         夥伴實體（沒有時 null）
//   KB.Helper.tick(game)    每幀維護（換房重新跟上、SELECT 長按相容路徑）；同一幀重複呼叫只會生效一次
//   KB.Helper.drawHUD(ctx)  HUD 右側的小夥伴臉 + 4 格 HP（progression agent 請在 KB.drawHUD 末端呼叫）
//
// 夥伴實體本身就是「假玩家介面」：type 'ally'、owner 'player'，並實作 abilities.js 需要的最小玩家介面
//（cx/cy/dir/x/y/w/h/onGround/vx/vy/state/stateT/attackTimer/attackLock/attackFps/abilityData/abilityDef/
//  setState/startAttack/form/possessed/sizeMul/hitWall/grav/maxFall…），所以 KB.ABILITIES[key] 的
//  onGet / onAttack / update / onEnd 可以原封不動重用，判定框沿用 owner 'player' → game.js 的 collisions
//  直接生效（game.js 一行都沒改）。招式期間產生的實體會被標上 e.fromHelper = true。
//
// 跨檔需求（寫在 docs/PROGRESS.md「## helper」）：
//   1. player.js（mix）：SELECT 長按 45 幀 → KB.Helper.spawn(p)，回傳 true 就不要 dropAbility。
//   2. game.js（progression）：GameScene.update 末端呼叫 KB.Helper.tick(this)；
//      ui.js / game.js 的 HUD 末端呼叫 KB.Helper.drawHUD(ctx)。
//      在這兩個呼叫接上之前，本檔會在載入後自行包裝 GameScene.prototype.update / draw（見檔尾 install()），
//      tick / drawHUD 皆為冪等，正式接上後不會重複作用。
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  const P = KB.PHYS;

  const CFG = {
    hp: 4,                 // 夥伴 HP
    followFar: 40,         // 距離 > 40px 追
    followNear: 24,        // 距離 < 24px 停
    teleportDist: 200,     // 掉隊 > 200px 瞬移
    stuckFrames: 90,       // 卡住 90 幀瞬移
    senseR: 96,            // 96px 內發現敵人
    strikeR: 40,           // 靠近到 40px 內才出招（短射程能力也打得到）
    leash: 150,            // 離卡比超過這個距離就不再追敵人，先回去跟隨
    atkCD: 90,             // 每 90 幀最多攻擊 1 次
    holdFrames: 20,        // hold 型能力按住 20 幀
    invuln: 60,            // 受傷無敵 / 閃爍幀數
    holdSelect: 45,        // SELECT 長按門檻（與 mix 的鉤子同值）
    walk: 1.6, run: 2.4,   // 跟隨速度（卡比 walk 1.3 / run 2.2，夥伴要略快才追得上）
    hatScale: 0.78,        // 帽子縮小倍率（夥伴比卡比小一號）
  };

  const sfx = (n, fb) => {
    try {
      if (!KB.audio || !KB.audio.sfx) return;
      const ok = !KB.audio.SFX_NAMES || KB.audio.SFX_NAMES.indexOf(n) >= 0;
      KB.audio.sfx(ok ? n : (fb || n));
    } catch (e) { }
  };
  // KB.VFX 未載入 / 丟例外時整組 no-op
  const V = function (name) {
    const X = KB.VFX;
    if (!X || typeof X[name] !== 'function') return null;
    try { return X[name].apply(X, Array.prototype.slice.call(arguments, 1)); } catch (e) { return null; }
  };
  const hypot = (a, b) => Math.sqrt(a * a + b * b);

  // =========================================================================
  //  夥伴實體
  // =========================================================================
  class Helper extends KB.Entity {
    constructor(p, key) {
      super(p.x, p.y);
      this.type = 'ally'; this.owner = 'player'; this.name = 'helper'; this.z = 2;
      this.w = 12; this.h = 13; this.stepH = 6;
      this.solid = true; this.grav = P.grav; this.maxFall = P.maxFall;
      this.hp = CFG.hp; this.maxHp = CFG.hp;
      this.inhalable = true; this.hurtsPlayer = false; this.damage = 0; this.score = 0;
      this.dir = p.dir || 1;
      this.cx = p.cx - this.dir * 16; this.bottom = p.bottom;
      this.game = KB.game;

      // ---- 假玩家介面（abilities.js 會讀 / 寫這些欄位）----
      this.ability = key; this.abilityData = {};
      this.state = 'idle'; this.stateT = 0;
      this.attackTimer = 0; this.attackLock = false; this.attackFps = 12;
      this.form = null; this.possessed = null; this.sizeMul = 1; this.mouth = null;
      this.hitWall = false; this.hitCeil = false; this.onSlope = false;
      this.jumped = false; this.jumpHold = 0; this.hurtTimer = 0; this.inhaleT = 0;
      this.inWater = false; this.stoneBox = null; this.stoneT = 0; this.invincibleT = 0;
      this.keys = {};          // 假輸入（只有 attack 會被按住）

      // ---- AI ----
      this.atkCool = 30; this.holdT = 0; this.stuckT = 0; this.lastX = this.x;
      this.floatT = 0; this.jumpCD = 0; this.mv = 0; this.foe = null; this.stoneMode = 0;
      this.beingInhaled = false; this.inhaleSrc = null;
    }

    // ---------- 假玩家介面 ----------
    get abilityDef() { return this.ability ? KB.ABILITIES[this.ability] : null; }
    get formScale() { return (this.form && this.form.scale) || 1; }
    get full() { return !!this.mouth; }
    isAttackState() { return this.state === 'attack'; }
    setCenter(x, y) { this.cx = x; this.cy = y; }
    clampToRoom() {
      const m = this.game && this.game.map; if (!m) return;
      this.x = Math.max(0, Math.min(m.pw - this.w, this.x));
      this.y = Math.max(-32, Math.min(m.ph - this.h, this.y));
    }
    setForm(f) { this.form = f || null; }
    clearForm() { this.form = null; }
    breakArmor() { this.form = null; }
    dropAbility() { /* 夥伴不會自己丟能力（死亡才變回能力星）*/ }
    setState(s) {
      if (this.state === s) return;
      const prev = this.state;
      if (prev === 'attack' && s !== 'attack') {
        const d = this.abilityDef;
        if (d && d.onEnd) this.callDef(() => d.onEnd(this));
        this.killStone();
      }
      this.state = s; this.stateT = 0;
      if (s !== 'attack') { this.attackLock = false; this.attackTimer = 0; }
    }
    startAttack() {
      const d = this.abilityDef; if (!d) return;
      if (d.key === 'stone' || d.stoneLike) { this.startStone(); return; }
      this.setState('attack');
      this.attackTimer = d.duration || 20;
      this.attackLock = d.lockMove !== false;
      this.attackFps = d.fps || 12;
      if (d.onAttack) this.callDef(() => d.onAttack(this));
    }
    restartAttack() { this.setState('idle'); this.startAttack(); }

    // 石頭系（player.js 的 startStone 走的是玩家專屬狀態機）：夥伴改成 60 幀的原地石化判定框
    startStone() {
      this.setState('attack'); this.attackTimer = 60; this.attackLock = true; this.stoneMode = 60;
      this.vx = 0; sfx('stone');
      KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      this.stoneBox = KB.hitbox({
        x: this.x, y: this.y, w: this.w + 4, h: this.h + 2, dmg: 6, owner: 'player', type: 'stone',
        follow: this, ox: -this.w / 2 - 2, oy: -1, life: 99999, rehit: 20, pierce: true, breakBlocks: true,
      });
      if (this.stoneBox) this.stoneBox.fromHelper = true;
    }
    killStone() { if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; } this.stoneMode = 0; }

    /** 以「假玩家介面 + 假輸入」呼叫能力定義；期間 KB.spawn 產生的實體都標上 fromHelper */
    callDef(fn) {
      const realInput = KB.input, realSpawn = KB.spawn, self = this;
      if (!this._stub) {
        const keys = this.keys;
        this._stub = {
          down: k => !!keys[k], pressed: () => false, released: () => false,
          setVirtual() { }, clearVirtual() { }, update() { },
        };
      }
      KB.input = this._stub;
      KB.spawn = function (e) { if (e) { e.fromHelper = true; e.helperSrc = self; } return realSpawn(e); };
      try { fn(); }
      catch (err) { if (KB.DEBUG) console.warn('[helper] ability error', err); }
      finally { KB.input = realInput; KB.spawn = realSpawn; }
    }

    /** 使用能力攻擊（可指定目標 → 先面向目標）；回傳是否真的出招 */
    useAbility(target) {
      const d = this.abilityDef;
      if (!d || this.dead || this.state === 'attack' || this.state === 'hurt') return false;
      if (target) this.dir = target.cx < this.cx ? -1 : 1;
      this.keys.attack = true;
      this.holdT = d.hold ? CFG.holdFrames : 0;
      this.startAttack();
      this.atkCool = CFG.atkCD;
      return this.state === 'attack';
    }

    /** 攻擊狀態每幀推進（對應 player.updateAttack，扣掉方向鍵 / 跳躍那段） */
    updateAbility() {
      const d = this.abilityDef;
      if (!d) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      if (this.stoneMode > 0) {
        this.stoneMode--; this.vx *= 0.6;
        if (this.stoneBox && !this.stoneBox.dead) this.stoneBox.life = 3;
        if (--this.attackTimer <= 0) { this.killStone(); this.setState(this.onGround ? 'idle' : 'fall'); }
        return;
      }
      const held = this.holdT > 0;
      this.keys.attack = held;
      if (this.holdT > 0) this.holdT--;
      if (d.update) this.callDef(() => d.update(this, 1 / 60, held));
      this.attackTimer--;
      if (d.hold && held && (d.maxHold === undefined || this.stateT < d.maxHold)) this.attackTimer = Math.max(this.attackTimer, 2);
      if (this.attackTimer <= 0) this.setState(this.onGround ? 'idle' : 'fall');   // setState 會呼叫 onEnd
    }

    // ---------- 每幀 ----------
    update(dt) {
      this.baseUpdate(dt);
      this.stateT++;
      const g = this.game = KB.game, p = g && g.player;
      if (!g || !p) return;
      if (this.atkCool > 0) this.atkCool--;
      if (this.jumpCD > 0) this.jumpCD--;
      // 被卡比吸回去
      if (this.checkInhale(p)) return;
      this.beingInhaled = false;
      this.checkDamage();
      if (this.dead) return;
      if (p.state === 'dead') { this.vanish(); return; }
      this.inWater = !!(g.map.inWater && g.map.inWater(this.cx, this.cy));
      if (this.state === 'hurt') {
        this.hurtTimer--; this.vx *= 0.88;
        if (this.hurtTimer <= 0) this.setState(this.onGround ? 'idle' : 'fall');
        this.mv = 0;
      } else if (this.state === 'attack') {
        this.updateAbility(); this.mv = 0;
      } else {
        this.think(p);
      }
      this.physics();
      this.afterPhysics(p);
    }

    /** 跟隨 + 跳躍 / 漂浮 + 發現敵人就靠近並使用能力 */
    think(p) {
      const g = this.game, map = g.map;
      const dx = p.cx - this.cx, dy = p.cy - this.cy, adx = Math.abs(dx), dist = hypot(dx, dy);
      // 掉隊 / 卡住 → 瞬移到卡比旁 + 煙
      if (dist > CFG.teleportDist || this.stuckT > CFG.stuckFrames) { this.warpTo(p); return; }

      // ---- 目標：96px 內有敵人就先打，但不會離卡比太遠（leash 150px）----
      const foe = (adx < CFG.leash) ? this.findFoe() : null;
      this.foe = foe;
      let mv = this.mv, tgt = p, fast = false;
      if (foe) {
        const fdx = foe.cx - this.cx, afd = Math.abs(fdx);
        tgt = foe;
        this.dir = fdx < 0 ? -1 : 1;
        if (afd <= CFG.strikeR) {
          // 進入招式距離 → 出招（冷卻中就原地等）
          if (this.atkCool <= 0 && this.useAbility(foe)) return;
          mv = 0;
        } else mv = fdx > 0 ? 1 : -1;      // 還太遠 → 靠近敵人
      } else {
        // 跟隨（24~40px 之間維持原本的移動狀態，避免在邊界抖動）
        if (adx > CFG.followFar) mv = dx > 0 ? 1 : -1;
        else if (adx < CFG.followNear) mv = 0;
        fast = adx > 110 || dy < -40;
      }
      this.mv = mv;
      const spd = fast ? CFG.run : CFG.walk;
      if (mv) {
        this.vx += (mv * spd - this.vx) * 0.4;
        if (!foe) this.dir = mv;
      } else this.vx *= this.onGround ? 0.55 : 0.94;

      // ---- 垂直：跳過坑 / 1 格障礙、漂浮越過大坑（無限）----
      const tdy = tgt.cy - this.cy, tdx = Math.abs(tgt.cx - this.cx);
      const probe = { x: this.x, y: this.y, w: this.w, h: this.h, dir: mv || this.dir };
      if (this.inWater) {
        this.grav = P.swimGrav; this.maxFall = P.swimMaxFall;
        if (tdy < -4) this.vy = Math.min(this.vy, P.swimUp * 0.6);
        this.floatT = 0;
        return;
      }
      if (this.onGround) {
        this.grav = P.grav; this.maxFall = P.maxFall; this.floatT = 0;
        const wall = mv && KB.physics.wallAhead(map, probe);
        const edge = mv && KB.physics.edgeAhead(map, probe);
        const above = tdy < -14 && tdx < 72;
        if (this.jumpCD <= 0 && (wall || (edge && tdx > 14) || above)) {
          this.vy = P.jump; this.jumped = true; this.onGround = false; this.jumpCD = 12;
          KB.particles(this.cx, this.bottom, '#e8e8f0', 3, { spread: 0.9, grav: 0.05, life: 12, size: 1 });
        }
      } else {
        const ground = KB.physics.groundWithin(map, this, 44);
        const need = tdy < -6 || (!ground && this.vy > 0.2);
        if (need) {
          this.floatT++;
          this.grav = P.floatGrav; this.maxFall = P.floatMaxFall;
          if (this.floatT % 18 === 1) {
            this.vy = P.floatUp;
            KB.particles(this.cx, this.cy + 6, '#e8f4ff', 2, { spread: 0.6, grav: 0, life: 12, up: -0.2, size: 1 });
          }
          if (this.vy > P.floatMaxFall) this.vy = P.floatMaxFall;
        } else { this.grav = P.grav; this.maxFall = P.maxFall; }
      }
    }

    afterPhysics(p) {
      const map = this.game.map;
      if (this.fellOut || this.y > map.ph + 16) { this.warpTo(p); return; }
      if (this.mv && Math.abs(this.x - this.lastX) < 0.25 && this.onGround) this.stuckT++;
      else this.stuckT = 0;
      this.lastX = this.x;
    }

    /** 96px 內最近的敵人 / 魔王 */
    findFoe() {
      const g = this.game; let best = null, bd = CFG.senseR;
      for (const e of g.entities) {
        if (e.dead || e === this) continue;
        if (e.type !== 'enemy' && e.type !== 'boss') continue;
        if (e.beingInhaled || e.introducing) continue;
        if (e.type === 'enemy' && e.active === false) continue;
        const d = hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /** 敵人接觸 / 敵方投射物・判定框 → 扣血（無敵 60 幀閃爍） */
    checkDamage() {
      if (this.invuln > 0 || this.dead) return;
      for (const e of this.game.entities) {
        if (e.dead || e === this) continue;
        let dmg = 0;
        if ((e.type === 'enemy' || e.type === 'boss') && e.hurtsPlayer && !e.beingInhaled &&
          !(e.freezeT > 0) && !e.introducing && e.contactDamage !== false && this.overlaps(e)) {
          dmg = e.damage || 1;
        } else if (((e.type === 'proj' && e.owner === 'enemy') || (e.type === 'hitbox' && e.owner === 'enemy')) &&
          !e.beingInhaled && this.overlaps(e)) {
          dmg = e.dmg || 1;
          if (e.type === 'proj' && !e.pierce) { e.dead = true; KB.fx('fx_hit', e.cx, e.cy + 4); }
        }
        if (dmg) { this.hurt(dmg, e); return; }
      }
    }

    hurt(amount, src) {
      if (this.dead || this.invuln > 0) return false;
      this.hp -= (amount || 1);
      this.invuln = CFG.invuln;
      this.killStone();
      if (src && src.cx !== undefined) this.vx = (this.cx < src.cx ? -1 : 1) * 1.8;
      this.vy = Math.min(this.vy, -1.8);
      KB.particles(this.cx, this.cy, ['#ffffff', '#a8d8f8'], 6, { spread: 2, life: 18 });
      sfx('hurt');
      if (this.hp <= 0) { this.die(); return true; }
      this.setState('hurt'); this.hurtTimer = 16;
      return true;
    }

    /** HP 0 → 變回能力星掉在原地（卡比可撿回）+ burst */
    die() {
      if (this.dead) return;
      this.dead = true;
      const key = this.ability;
      KB.particles(this.cx, this.cy, ['#a8d8f8', '#ffffff', '#f8d040'], 16, { spread: 2.8, life: 26 });
      V('burst', this.cx, this.cy, { n: 20, colors: ['#a8d8f8', '#ffffff', '#f8d040'], speed: 3, life: 28, grav: 0.05, size: 2 });
      V('ring', this.cx, this.cy, { r0: 3, r1: 30, frames: 16, color: '#a8d8f8', width: 2 });
      KB.fx('fx_poof', this.cx, this.cy + 4);
      sfx('enemydie');
      if (key && KB.ITEMS && KB.ITEMS.abilitystar) {
        const st = KB.spawn(new KB.ITEMS.abilitystar(this.cx - 7, this.cy - 7, key, this.dir));
        if (st) { st.vx = 0; st.vy = -2.2; }
      }
      if (H.current === this) H.current = null;
    }

    /** 消失（不留能力星）：吸回 / 卡比死亡 */
    vanish(fx) {
      if (this.dead) return;
      this.dead = true;
      this.killStone();
      const d = this.abilityDef;
      if (d && d.onLose) this.callDef(() => d.onLose(this));
      if (fx !== false) {
        KB.particles(this.cx, this.cy, ['#a8d8f8', '#ffffff'], 10, { spread: 2, grav: 0.02, life: 18 });
        KB.fx('fx_poof', this.cx, this.cy + 4);
      }
      if (H.current === this) H.current = null;
    }

    // ---------- 被卡比吸入 ----------
    pullTo(px, py, s) {
      const dx = px - this.cx, dy = py - this.cy, d = Math.max(1, hypot(dx, dy));
      this.x += dx / d * s; this.y += dy / d * s * 0.7;
    }
    onInhaled(p) {
      this.dead = true;
      p.mouth = { ability: this.ability, name: 'helper', score: 0 };
      if (H.current === this) H.current = null;
    }
    // player.js 的 updateInhale 只會拉 enemy / proj / item，type 'ally' 不在名單內
    //（player.js 不歸本 agent 管）→ 夥伴自己做吸力與入嘴判定，效果與敵人被吸入完全相同。
    checkInhale(p) {
      if (this.dead || p.state !== 'inhale') return false;
      const M = p.sizeMul || 1, RW = (p.inWater ? P.waterInhaleRange : 52) * M;
      const rx = p.dir > 0 ? p.cx + 4 : p.cx - 4 - RW, ry = p.cy - 16 * M;
      if (!this.overlapsRect(rx, ry, RW, 32 * M)) return false;
      this.beingInhaled = true; this.inhaleSrc = p;
      const mx = p.cx + p.dir * 8 * M, my = p.cy;
      this.pullTo(mx, my, 2.4 * M);
      const m = { x: p.dir > 0 ? p.cx + 2 : p.cx - 12 * M, y: p.cy - 6 * M, w: 10 * M, h: 12 * M };
      if (this.overlapsRect(m.x, m.y, m.w, m.h)) {
        this.beingInhaled = false; this.inhaleSrc = null;
        this.onInhaled(p);
        p.setState('full'); sfx('swallow'); KB.fx('fx_sparkle', p.cx, p.cy);
        KB.particles(mx, my, ['#ffffff', '#a8d8f8'], 6, { spread: 1.6, grav: 0.05, life: 18 });
        p.stopInhale();
        if (this.game) this.game.freezeT = Math.max(this.game.freezeT || 0, P.inhaleFreeze);
      }
      return true;
    }

    /** 瞬移到卡比旁 + 煙 */
    warpTo(p, quiet) {
      if (!p) return;
      KB.particles(this.cx, this.cy, ['#d0d0d8', '#ffffff'], 8, { spread: 1.8, grav: -0.02, life: 20 });
      KB.fx('fx_poof', this.cx, this.cy + 4);
      this.cx = p.cx - p.dir * 18; this.bottom = p.bottom;
      this.vx = 0; this.vy = 0; this.stuckT = 0; this.floatT = 0; this.mv = 0; this.lastX = this.x;
      this.onGround = p.onGround; this.dir = p.dir;
      this.clampToRoom();
      KB.particles(this.cx, this.cy, ['#d0d0d8', '#ffffff'], 10, { spread: 2, grav: -0.02, life: 20 });
      KB.fx('fx_poof', this.cx, this.cy + 4);
      if (!quiet) sfx('teleport', 'jump');
    }

    /** 生成演出（VFX transform 風格：停格 + 光環 + 魔法陣 + 粒子 + 名稱） */
    summonFx() {
      const d = this.abilityDef, col = (d && d.color) || '#a8d8f8';
      const x = this.cx, y = this.cy;
      V('hitstop', 4); V('shake', 5); V('zoom', 1.1, 10);
      V('flash', '#ffffff', 8, 0.55);
      V('ring', x, y, { r0: 3, r1: 44, frames: 20, color: col, width: 3 });
      V('ring', x, y, { r0: 8, r1: 26, frames: 14, color: '#ffffff', width: 2 });
      V('circle', x, y + 6, { r: 26, frames: 34, color: col, spin: 0.09, glyphs: 8 });
      V('burst', x, y, { n: 22, colors: [col, '#ffffff', '#a8d8f8'], speed: 3, life: 28, grav: 0.03, size: 2 });
      V('textPop', x, y - 20, 'HELPER!', { color: col, size: 8, frames: 44, rise: 10, outline: '#182038' });
      KB.particles(x, y, ['#a8d8f8', '#ffffff', '#f8d040'], 14, { spread: 2.6, life: 24 });
      KB.fx('fx_sparkle', x, y);
      sfx('clone_summon', 'ability');
    }

    // ---------- 繪製 ----------
    currentAnim() {
      if (this.state === 'hurt') return ['helper_hurt', 1];
      if (this.state === 'attack') return ['helper_attack', this.attackFps || 12];
      if (!this.onGround) return ['helper_jump', 1];
      if (Math.abs(this.vx) > 0.25) return ['helper_walk', 8];
      return ['helper_idle', 2];
    }
    draw(g) {
      if (this.invuln > 0 && (this.invuln & 2)) return;       // 受傷閃爍
      const [anim, fps] = this.currentAnim();
      const wob = this.beingInhaled ? (Math.floor(this.t * 60 / 4) % 2 ? 2 : -2) : 0;
      const opts = { flip: this.dir < 0, fps, t: this.stateT / 60 };
      if (this.state === 'idle') opts.frame = (this.stateT % 200) > 190 ? 1 : 0;
      g.spr(KB.has(anim) ? anim : 'helper_idle', this.cx + wob, this.bottom, opts);
      // 能力帽子（重用 hat_<key>，縮到 0.78 倍）
      const d = this.abilityDef, hat = (d && d.hat) || ('hat_' + this.ability);
      if (this.ability && KB.has(hat)) {
        g.spr(hat, this.cx + wob, this.y + 1, { flip: this.dir < 0, t: this.t, scaleX: CFG.hatScale, scaleY: CFG.hatScale });
      }
      this.drawHpBar(g, wob);
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,200,255,0.3)');
    }
    /** 頭上的 4 格小血條（HUD 版本見 KB.Helper.drawHUD） */
    drawHpBar(g, wob) {
      const n = this.maxHp, bw = 3, gap = 1, tw = n * bw + (n - 1) * gap;
      const hat = this.ability && KB.has((this.abilityDef && this.abilityDef.hat) || ('hat_' + this.ability));
      const x0 = Math.round(this.cx + (wob || 0) - tw / 2), y0 = Math.round(this.y - (hat ? 13 : 7));
      g.rect(x0 - 1, y0 - 1, tw + 2, 4, 'rgba(16,20,32,0.75)');
      for (let i = 0; i < n; i++) {
        g.rect(x0 + i * (bw + gap), y0, bw, 2, i < this.hp ? (this.hp <= 1 ? '#ff7070' : '#70e070') : '#404858');
      }
    }
  }
  KB.HelperEntity = Helper;

  // =========================================================================
  //  吸回用的能力星（夥伴 → 飛向卡比 → 卡比重新取得能力）
  // =========================================================================
  class ReturnStar extends KB.Entity {
    constructor(x, y, key, p) {
      super(x - 7, y - 7);
      this.type = 'fx'; this.name = 'helper_returnstar'; this.w = 14; this.h = 14;
      this.solid = false; this.grav = 0; this.z = 7; this.key = key; this.p = p; this.life = 180;
      this.spr = KB.has('item_abilitystar') ? 'item_abilitystar' : 'proj_star';
    }
    update(dt) {
      this.baseUpdate(dt);
      const p = this.p || KB.player;
      this.life--;
      if (!p || p.dead || this.life <= 0) { this.arrive(p); return; }
      const dx = p.cx - this.cx, dy = (p.cy - 4) - this.cy, d = Math.max(1, hypot(dx, dy));
      const sp = Math.min(6, 2 + (180 - this.life) * 0.25);
      this.x += dx / d * sp; this.y += dy / d * sp;
      if (Math.floor(this.t * 60) % 2 === 0) KB.particles(this.cx, this.cy, ['#ffe040', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
      if (d < 8) this.arrive(p);
    }
    arrive(p) {
      if (this.dead) return;
      this.dead = true;
      if (!p || p.dead || p.state === 'dead') return;
      KB.particles(p.cx, p.cy, ['#ffffff', '#ffe040', '#a8d8f8'], 14, { spread: 2.4, life: 22 });
      V('ring', p.cx, p.cy, { r0: 2, r1: 26, frames: 14, color: '#ffe040', width: 2 });
      if (!p.ability && KB.ABILITIES[this.key]) p.giveAbility(this.key);
      else if (KB.ITEMS && KB.ITEMS.abilitystar) KB.spawn(new KB.ITEMS.abilitystar(p.cx - 8, p.y - 8, this.key, -p.dir));
    }
    draw(g) {
      const d = KB.ABILITIES[this.key], col = (d && d.color) || '#ffe040';
      g.spr(this.spr, this.cx, this.bottom, { t: this.t, fps: 8 });
      const icon = 'ui_ability_' + this.key + '_mini';
      if (KB.has(icon)) g.spr(icon, this.cx, this.cy + 4, {});
      else g.rect(this.cx - 2, this.cy - 2, 4, 4, col);
    }
  }

  // =========================================================================
  //  KB.Helper：對外 API
  // =========================================================================
  const H = KB.Helper = {
    CFG, Entity: Helper, ReturnStar,
    current: null,
    exists() { return !!(H.current && !H.current.dead); },
    get() { return H.exists() ? H.current : null; },

    /**
     * 長按 SELECT 的入口。
     *   沒有夥伴 + 有能力 → 生成夥伴（卡比失去能力但不掉能力星），回傳 true
     *   已經有夥伴       → 吸回（夥伴變回能力星飛向卡比），回傳 true
     *   其他             → false（player.js 這時可以照原本流程丟能力星）
     */
    spawn(p) {
      p = p || KB.player;
      const g = KB.game;
      if (!p || !g || p.state === 'dead') return false;
      H._acted = g.frame;
      if (H.exists()) return H.recall(p);
      const key = p.ability;
      if (!key || !KB.ABILITIES[key]) return false;
      const def = KB.ABILITIES[key];
      // 卡比失去能力（不掉能力星）：與 player.dropAbility 相同的清理，只是不生成 abilitystar
      try { if (def.onLose) def.onLose(p); } catch (e) { }
      try { if (p.form && p.clearForm) p.clearForm(); } catch (e) { }
      p.ability = null; p.abilityData = {};
      if (p.state === 'attack' || p.state === 'stone') p.setState(p.onGround ? 'idle' : 'fall');
      if (p.stoneBox) { p.stoneBox.dead = true; p.stoneBox = null; }
      const h = new Helper(p, key);
      KB.spawn(h); H.current = h;
      h.summonFx();
      if (def.onGet) h.callDef(() => def.onGet(h));
      if (g.toast) g.toast('夥伴登場！');
      return true;
    },

    /** 吸回：夥伴變回能力星飛向卡比，卡比重新取得該能力 */
    recall(p) {
      p = p || KB.player;
      const h = H.current, g = KB.game;
      if (!h || h.dead || !g || !p) return false;
      H._acted = g.frame;
      const key = h.ability, x = h.cx, y = h.cy;
      h.vanish();
      V('ring', x, y, { r0: 2, r1: 28, frames: 14, color: '#a8d8f8', width: 2 });
      V('burst', x, y, { n: 14, colors: ['#a8d8f8', '#ffffff'], speed: 2.4, life: 22, size: 2 });
      KB.spawn(new ReturnStar(x, y, key, p));
      sfx('clone_summon', 'ability');
      return true;
    },

    /** 移除夥伴（不留能力星）：換關 / 卡比死亡 */
    clear() { if (H.current) { H.current.vanish(false); } H.current = null; },

    /**
     * 每幀維護：換房後把夥伴帶到新房間、SELECT 長按的相容路徑。
     * progression agent 請在 GameScene.update 末端呼叫；同一幀重複呼叫只會生效一次。
     */
    tick(game) {
      game = game || KB.game;
      if (!game) { H.current = null; return; }
      if (H._tickFrame === game.frame && H._tickGame === game) return;
      H._tickFrame = game.frame; H._tickGame = game;
      const h = H.current;
      if (h) {
        if (h.dead || h.game !== game) H.current = null;
        else if (game.entities.indexOf(h) < 0) {
          // loadRoom 會把 entities 清空 → 夥伴跟著卡比進新房間
          const p = game.player;
          if (p && p.state !== 'dead') { game.entities.push(h); h.warpTo(p, true); }
          else H.current = null;
        }
      }
      H.pollSelect(game);
    },

    /**
     * SELECT 長按的相容路徑（player.js 的鉤子尚未接上時仍可用）：
     *   ① 按住 45 幀且卡比還有能力 → spawn()
     *   ② player.js 在按下那一幀就把能力丟成能力星了 → 找回那顆星，改成夥伴
     *   ③ 已經有夥伴 → recall()
     * player.js 的鉤子接上後，spawn / recall 會在同一幀先被呼叫（H._acted），這裡就不會重複動作。
     */
    pollSelect(game) {
      const p = game.player, inp = KB.input;
      if (!p || !inp || game.paused || game.clearT >= 0 || p.state === 'dead') { H._sel = 0; H._star = null; return; }
      if (!inp.down('select')) { H._sel = 0; H._star = null; return; }
      H._sel = (H._sel || 0) + 1;
      // player.js（mix）已經接上長按鉤子（p.selectHoldT）：
      //   卡比身上有能力 → 由 player.js 在放開時呼叫 spawn()，這裡完全不介入；
      //   卡比沒有能力（能力在夥伴身上）→ player.js 的計數條件是「&& this.ability」不會成立，
      //   所以「再長按一次把夥伴吸回」仍由這裡負責（按滿 45 幀當下觸發）。
      if (p.selectHoldT !== undefined) {
        if (p.ability || !H.exists()) { H._sel = 0; H._star = null; return; }
        if (H._sel === CFG.holdSelect && H._acted !== game.frame) H.recall(p);
        return;
      }
      if (H._sel <= 3 && !H._star) {
        if (p.ability) H._star = { key: p.ability, ent: null };
        else {
          // 剛剛被 dropAbility 丟出來的能力星（graceT 幾乎滿）
          let best = null, bd = 56;
          for (const e of game.entities) {
            if (e.dead || e.name !== 'abilitystar' || !(e.graceT >= 26)) continue;
            const d = hypot(e.cx - p.cx, e.cy - p.cy);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) H._star = { key: best.ability, ent: best };
        }
      }
      if (H._sel !== CFG.holdSelect) return;
      if (H._acted === game.frame) return;          // player.js 的鉤子已處理
      if (H.exists()) { H.recall(p); return; }
      if (p.ability) { H.spawn(p); return; }
      const s = H._star;
      if (!s || !s.key) return;
      if (s.ent && !s.ent.dead) s.ent.dead = true;
      p.ability = s.key; p.abilityData = {};
      H.spawn(p);
      H._star = null;
    },

    /**
     * HUD：夥伴存在時在右側生命旁畫小夥伴臉 + 4 格 HP。
     * ui.js 不歸本 agent 管 → 由這裡提供，progression agent 請在 KB.drawHUD 末端呼叫 KB.Helper.drawHUD(ctx)。
     * 重複呼叫只是把同樣的像素再畫一次（冪等）。
     */
    drawHUD(ctx, game) {
      game = game || KB.game;
      if (!ctx || !game || !H.exists() || H.current.game !== game) return;
      const h = H.current;
      const x = 158, y = 206;                       // 魔王血條（x66~156）右側、生命數（x217~251）左側
      KB.rect(ctx, x - 2, y - 2, 52, 14, '#0e1220');
      KB.rect(ctx, x - 2, y - 2, 52, 1, '#384058');
      if (KB.has('ui_helper_face')) KB.drawSpr(ctx, 'ui_helper_face', x + 4, y + 5, {});
      else KB.rect(ctx, x, y + 1, 8, 8, '#a8d8f8');
      // 能力小圖示
      const icon = 'ui_ability_' + h.ability + '_mini';
      if (KB.has(icon)) KB.drawSpr(ctx, icon, x + 13, y + 5, {});
      const n = h.maxHp, bw = 6, gap = 2, bx = x + 19;
      for (let i = 0; i < n; i++) {
        const px = bx + i * (bw + gap);
        KB.rect(ctx, px, y + 2, bw, 6, '#202838');
        KB.rect(ctx, px + 1, y + 3, bw - 2, 4, i < h.hp ? (h.hp <= 1 && ((game.frame >> 3) & 1) ? '#ffffff' : '#70e070') : '#485068');
      }
    },
  };

  // =========================================================================
  //  自動接線（在 game.js 正式加上 tick / drawHUD 呼叫之前的過渡作法）
  //  —— 只包裝 GameScene.prototype 的 update / draw 各一次，不修改 game.js 檔案本身。
  // =========================================================================
  function install() {
    if (H._installed) return true;
    const GS = KB.GameScene;
    if (!GS || !GS.prototype) return false;
    const up = GS.prototype.update, dr = GS.prototype.draw;
    GS.prototype.update = function (dt) { up.call(this, dt); try { H.tick(this); } catch (e) { } };
    // ui.js 的 KB.drawHUD 若已經呼叫 KB.Helper.drawHUD 就不再補畫（否則會蓋在暫停遮罩 / 淡出之上）
    GS.prototype.draw = function (ctx) {
      dr.call(this, ctx);
      if (H._uiHud === undefined) { try { H._uiHud = !!(KB.drawHUD && /Helper/.test(KB.drawHUD.toString())); } catch (e) { H._uiHud = false; } }
      if (!H._uiHud) { try { H.drawHUD(ctx, this); } catch (e) { } }
    };
    H._installed = true;
    return true;
  }
  H.install = install;
  if (!install()) setTimeout(install, 0);
})();
