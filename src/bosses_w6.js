// 第六世界「星之彼端」——新敵人 3 種 + 魔王「暗影卡比」（Round 6 world6 agent）
// ============================================================================
// 敵人（KB.ENEMIES）
//   meteorite 隕石   ：從上方滾落，撞牆 / 落地就燒紅爆炸；爆完回到起點重新落下（隕石帶的循環危險）。無能力。
//   starling  星靈   ：無重力飄浮追蹤，射出星彈。給 beam。
//   voidling  虛空   ：無重力遊蕩追蹤，會短暫隱形（隱形時只剩紫色殘粒可循）。給 ghost。
//   shadowclone 影分身：二階段由魔王分裂出來，hp 10，會自己攻擊；兩隻都倒下才會露出本體弱點。
//
// 魔王（KB.BOSSES.shadowkirby）暗影卡比 HP 70
//   一階段：複製 KB.player.ability（null → 'sword'）→ 依能力分類挑 3 種「影子招」；
//           另外固定會用「瞬移到玩家背後」與「影之吸入」（吸到就吐出，2 點傷害）。
//   6 種通用影子招：影劍氣 slash / 影火球 fireball / 影手裡劍 shuriken / 影雷擊 thunder / 影黑洞 blackhole / 影踩踏 stomp
//   二階段（HP < 50%）：分裂 2 個影分身（期間本體無敵），影分身倒下才露出弱點；
//           解除後加入必殺「暗星雨」（letterbox + 全畫面隕石 + 兩處安全區 ring 提示）。
//   登場：從玩家的影子中升起（影池擴散 → 剪影拔起 → 白眼睜開）。
//   擊敗：影子消散（往上飄散的黑紫碎片 + 白閃）。
// ============================================================================
(function () {
  'use strict';
  const T = KB.TILE;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const NO_PULL = { dead: 1, door: 1, stone: 1, dance: 1, hurt: 1, ride: 1 };

  function sfx(name, fallback) {
    try {
      const A = KB.audio; if (!A || !A.sfx) return;
      if (A.SFX_NAMES && A.SFX_NAMES.indexOf(name) < 0) { if (fallback) A.sfx(fallback); return; }
      A.sfx(name);
    } catch (e) { }
  }
  function music(key) {
    try {
      if (!KB.audio || !KB.audio.SONGS || !KB.audio.SONGS[key]) return false;
      if (KB.game && KB.game.playMusic) KB.game.playMusic(key); else KB.audio.music(key);
      return true;
    } catch (e) { return false; }
  }
  function V(fn) {
    try {
      if (!KB.VFX || typeof KB.VFX[fn] !== 'function') return null;
      return KB.VFX[fn].apply(KB.VFX, Array.prototype.slice.call(arguments, 1));
    } catch (e) { return null; }
  }
  // 從 fromY 往下找第一塊可站立磁磚的頂端 y（世界 px）
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

  // =====================================================================
  //  meteorite 隕石（無能力）：滾落 → 落地 / 撞牆爆炸 → 回到起點重來
  // =====================================================================
  class Meteorite extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'meteorite'; this.spr = 'meteorite_walk'; this.w = 14; this.h = 14;
      this.hp = 2; this.maxHp = 2; this.score = 250; this.ability = null;
      this.speed = 1.9; this.grav = KB.GRAV; this.maxFall = 5.2;
      this.turnAtEdge = false; this.turnAtWall = false; this.element = 'fire';
      this.weak = ['ice']; this.persistent = true; this.glow = 8;
      this.dropTable = { pointstar: 0.3 };
      this.fallFrom = y; this.setState('roll');
    }
    // 重新回到起點等一下再落（不是死亡，隕石帶要持續有威脅）
    respawn() {
      this.x = this.startX; this.bottom = this.startY + T; this.vx = 0; this.vy = 0;
      this.dir = (this.spawnDef && this.spawnDef.dir) || (this.rngDir = -(this.rngDir || -1));
      this.hp = this.maxHp; this.hidden = true; this.hurtsPlayer = false; this.inhalable = false;
      this.setState('wait'); this.setSpr('meteorite_walk');
    }
    boom() {
      if (this.state === 'wait') return;
      KB.audio.sfx('block');
      KB.hitbox({ x: this.cx - 20, y: this.cy - 18, w: 40, h: 36, dmg: 1, owner: 'enemy', type: 'fire', life: 8, pierce: true, breakBlocks: false });
      KB.particles(this.cx, this.cy, ['#ff8040', '#ffd060', '#ffffff', '#8890b8'], 16, { spread: 3, life: 28 });
      KB.fx('fx_hit', this.cx, this.cy);
      V('ring', this.cx, this.cy, { r0: 3, r1: 30, frames: 14, color: '#ff8040', width: 2 });
      V('shake', 4);
      this.respawn();
    }
    think() {
      if (this.state === 'wait') {
        // 等待期間釘在起點（ai 跑完還會呼叫 physics，不釘住會慢慢往下沉）
        this.vx = 0; this.vy = 0; this.x = this.startX; this.bottom = this.startY + T;
        if (this.stateT % 8 === 0) KB.particles(this.cx, this.cy, '#6a3ca8', 1, { spread: 0.6, grav: 0, life: 12, up: 0.2, size: 1 });
        if (this.stateT > 70) { this.hidden = false; this.hurtsPlayer = true; this.inhalable = true; this.fallFrom = this.y; this.setState('roll'); }
        return;
      }
      if (this.state === 'burn') {
        this.vx *= 0.7;
        if (this.stateT % 2 === 0) KB.particles(this.cx, this.cy, ['#ff8040', '#ffd060'], 2, { spread: 1.4, grav: -0.02, life: 14 });
        if (this.stateT >= 16) this.boom();
        return;
      }
      // roll：帶著重力往下滾，落差夠大的落地 / 撞牆就引爆
      if (!this.onGround) { this.fallFrom = Math.min(this.fallFrom, this.y); this.vx = this.dir * this.speed * 0.7; }
      else this.vx = this.dir * this.speed * (this.exK || 1);
      this.rotT = (this.rotT || 0) + Math.abs(this.vx) * 0.1;
      if ((Math.floor(this.t * 60) % 3) === 0) KB.particles(this.cx - this.dir * 5, this.cy - 3, ['#ff8040', '#ffd060'], 1, { spread: 0.5, grav: -0.03, life: 12, up: 0.2, size: 1 });
      if (this.hitWall || (this.onGround && this.y - this.fallFrom > 26) || this.stateT > 420) {
        this.setState('burn'); this.setSpr('meteorite_attack'); sfx('fuse', 'block');
      }
      if (this.fellOut) this.respawn();
    }
    hurt(a, src) {
      if (this.state === 'wait') return false;
      return super.hurt(a, src);
    }
    onInhaled(p) { super.onInhaled(p); }
    draw(g) {
      if (this.hidden) return;
      g.spr(this.spr, this.cx, this.bottom, { t: this.animT / 60, rot: (this.rotT || 0) * this.dir, flip: this.dir < 0 });
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)');
    }
  }
  KB.ENEMIES.meteorite = Meteorite;

  // =====================================================================
  //  starling 星靈（beam）：無重力飄浮追蹤 + 射星彈
  // =====================================================================
  class Starling extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'starling'; this.spr = 'starling_fly'; this.w = 14; this.h = 14;
      this.hp = 3; this.maxHp = 3; this.score = 350; this.ability = 'beam';
      this.grav = 0; this.solid = false; this.speed = 0.5; this.cool = 70;
      this.element = 'spark'; this.weak = ['ice']; this.glow = 9;
      this.homeX = x; this.homeY = y; this.ph = (x * 7 + y * 13) % 628 / 100;
    }
    get shotCD() { return this.tough ? 90 : 130; }
    think() {
      if (this.state === 'attack') {
        this.vx *= 0.6; this.vy *= 0.6;
        if (this.stateT === 14) {
          this.facePlayer();
          const p = KB.player;
          const dx = p ? p.cx - this.cx : this.dir * 60, dy = p ? p.cy - this.cy : 0;
          const d = Math.max(1, Math.hypot(dx, dy)), s = 2.2;
          KB.shoot({
            spr: 'proj_starshot', x: this.cx, y: this.cy, vx: dx / d * s, vy: dy / d * s, dmg: 1, owner: 'enemy',
            life: 150, w: 8, h: 8, grav: 0, solid: true, type: 'star', rotSpeed: 0.3, trail: '#ffe878',
            inhalable: true, ownerEnt: this, fxHit: 'fx_sparkle',
          });
          KB.particles(this.cx, this.cy, ['#ffe878', '#ffffff'], 6, { spread: 1.2, grav: 0, life: 14 });
          sfx('beam', 'enemyhit');
        }
        if (this.stateT >= 34) { this.setState('fly'); this.setSpr('starling_fly'); this.cool = this.shotCD; }
        return;
      }
      const p = KB.player;
      this.ph += 0.05;
      if (p && this.notice(170, 120)) {
        const dx = p.cx - this.cx, dy = (p.cy - 14) - this.cy;
        const d = Math.max(1, Math.hypot(dx, dy)), s = this.speed * this.alertK * (this.exK || 1);
        this.vx = dx / d * s; this.vy = dy / d * s + Math.sin(this.ph) * 0.16;
        this.facePlayer();
      } else {
        this.vx = (this.homeX - this.x) * 0.01; this.vy = (this.homeY - this.y) * 0.01 + Math.sin(this.ph) * 0.22;
      }
      if (this.cool <= 0 && this.canSee(170, 110)) { this.setState('attack'); this.setSpr('starling_attack'); }
    }
    draw(g) {
      if ((Math.floor(this.t * 60) % 6) === 0) KB.particles(this.cx, this.cy + 6, '#ffe878', 1, { spread: 0.3, grav: 0, life: 12, up: -0.2, size: 1 });
      super.draw(g);
    }
  }
  KB.ENEMIES.starling = Starling;

  // =====================================================================
  //  voidling 虛空（ghost）：飄浮追蹤，每隔一段時間短暫隱形
  // =====================================================================
  class Voidling extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'voidling'; this.spr = 'voidling_walk'; this.w = 14; this.h = 16;
      this.hp = 3; this.maxHp = 3; this.score = 400; this.ability = 'ghost';
      this.grav = 0; this.solid = false; this.speed = 0.55; this.cool = 120;
      this.element = 'ghost'; this.weak = ['spark']; this.glow = 7;
      this.fade = 1; this.homeY = y; this.ph = (x * 11) % 628 / 100;
    }
    get vanishCD() { return this.tough ? 140 : 200; }
    think() {
      const p = KB.player;
      this.ph += 0.045;
      if (this.state === 'vanish') {
        // 隱形 60 幀：alpha 降到 0，只留下紫色殘粒；仍然會撞到人、也打得到
        this.fade = this.stateT < 12 ? 1 - this.stateT / 12 : (this.stateT > 54 ? (this.stateT - 54) / 12 : 0);
        if (this.stateT % 4 === 0) KB.particles(this.cx, this.cy, ['#a862f0', '#3c1c68'], 1, { spread: 0.5, grav: 0, life: 14, up: 0, size: 1 });
        if (p) {
          const dx = p.cx - this.cx, dy = (p.cy - 6) - this.cy, d = Math.max(1, Math.hypot(dx, dy));
          const s = this.speed * 1.5 * (this.exK || 1);
          this.vx = dx / d * s; this.vy = dy / d * s;
        }
        if (this.stateT >= 66) { this.fade = 1; this.setState('fly'); this.setSpr('voidling_walk'); this.cool = this.vanishCD; }
        return;
      }
      if (p && this.notice(150, 110)) {
        const dx = p.cx - this.cx, dy = (p.cy - 6) - this.cy, d = Math.max(1, Math.hypot(dx, dy));
        const s = this.speed * this.alertK * (this.exK || 1);
        this.vx = dx / d * s; this.vy = dy / d * s + Math.sin(this.ph) * 0.12;
        this.facePlayer();
      } else {
        this.vx = this.dir * this.speed * 0.6;
        this.vy = Math.sin(this.ph) * 0.3 + (this.homeY - this.y) * 0.008;
        if (this.x < 8 || this.x > mapW() - this.w - 8) this.dir *= -1;
      }
      if (this.cool <= 0 && this.canSee(140, 90)) { this.setState('vanish'); this.setSpr('voidling_attack'); sfx('ghost_phase', 'swallow'); }
    }
    draw(g) {
      if (this.fade <= 0.02) { if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)'); return; }
      const o = { t: this.animT / 60, flip: this.dir < 0 };
      if (this.fade < 1) o.alpha = this.fade;
      if (this.freezeT > 0) { super.draw(g); return; }
      g.spr(this.spr, this.cx, this.bottom, o);
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)');
    }
  }
  KB.ENEMIES.voidling = Voidling;

  // =====================================================================
  //  shadowclone 影分身（二階段）：hp 10，會衝撞與丟影星
  // =====================================================================
  class ShadowClone extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'shadowclone'; this.spr = 'shadowclone_idle'; this.w = 16; this.h = 16;
      this.hp = 10; this.maxHp = 10; this.score = 800; this.ability = null; this.inhalable = false;
      this.grav = 0; this.solid = false; this.speed = 0.9; this.cool = 50; this.glow = 10;
      this.damage = 1; this.element = 'ghost'; this.persistent = true; this.dropTable = {};
      this.ph = (x * 13) % 628 / 100;
    }
    think() {
      const p = KB.player;
      this.ph += 0.06;
      if (this.state === 'dash') {
        if (this.stateT === 1 && p) {
          const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.max(1, Math.hypot(dx, dy));
          this.vx = dx / d * 3.0; this.vy = dy / d * 3.0; sfx('teleport', 'slide');
        }
        if (this.stateT % 2 === 0) KB.particles(this.cx, this.cy, ['#2c1a4a', '#a862f0'], 1, { spread: 0.5, grav: 0, life: 12, up: 0, size: 2 });
        if (this.stateT >= 26) { this.setState('fly'); this.cool = 90; }
        return;
      }
      if (this.state === 'shoot') {
        this.vx *= 0.7; this.vy *= 0.7;
        if (this.stateT === 12 && p) {
          const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.max(1, Math.hypot(dx, dy));
          KB.shoot({
            spr: 'proj_shadowstar', x: this.cx, y: this.cy, vx: dx / d * 2.6, vy: dy / d * 2.6, dmg: 1, owner: 'enemy',
            life: 150, w: 10, h: 10, grav: 0, solid: false, type: 'shadow', rotSpeed: 0.35, trail: '#a862f0', inhalable: true, ownerEnt: this,
          });
          sfx('shuriken', 'cutter');
        }
        if (this.stateT >= 30) { this.setState('fly'); this.cool = 80; }
        return;
      }
      if (p) {
        const dx = p.cx - this.cx, dy = (p.cy - 10) - this.cy, d = Math.max(1, Math.hypot(dx, dy));
        this.vx = dx / d * this.speed; this.vy = dy / d * this.speed + Math.sin(this.ph) * 0.2;
        this.facePlayer();
        if (this.cool <= 0) this.setState(this.playerDist() < 70 ? 'dash' : 'shoot');
      }
    }
    draw(g) {
      g.spr(this.spr, this.cx, this.bottom, { t: this.animT / 60, flip: this.dir < 0, alpha: 0.9 });
      if (this.flash > 0 && (this.flash & 2)) g.spr(this.spr, this.cx, this.bottom, { t: this.animT / 60, flip: this.dir < 0, tint: '#ffffff', alpha: 0.8 });
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)');
    }
    die(src) {
      if (this.dead) return;
      KB.particles(this.cx, this.cy, ['#2c1a4a', '#a862f0', '#ffffff'], 18, { spread: 2.6, grav: -0.02, life: 34 });
      V('ring', this.cx, this.cy, { r0: 2, r1: 26, frames: 14, color: '#a862f0', width: 2 });
      super.die(src);
    }
  }
  KB.ENEMIES.shadowclone = ShadowClone;

  // =====================================================================
  //  mirrordee 鏡子瓦豆（中魔王 / 鏡之間）：會複製卡比目前能力的「1 招」
  //  hp 12；被打倒後可吸入得 cutter（鏡子碎片）。
  //  複製的招式由 SHADOW_COPY[玩家能力][0] 決定（與魔王同一張表，但只會 1 招、威力較低）。
  // =====================================================================
  class MirrorDee extends KB.MiniBoss {
    constructor(x, y) {
      super(x, y);
      this.name = 'mirrordee'; this.spr = this.walkSpr = 'mirrordee_walk';
      this.w = 22; this.h = 26; this.hp = this.maxHp = 12; this.ability = 'cutter';
      this.speed = 0.62; this.cool = 60; this.score = 3600; this.stunH = 20;
      this.element = 'metal'; this.weak = ['spark']; this.glow = 10;
      this.mirrorOf = null; this.move = 'slash';
    }
    // 照鏡子：讀玩家目前能力 → 取該能力對應的第一招
    reflect() {
      const key = (KB.player && KB.player.ability) || 'sword';
      if (key === this.mirrorOf) return;
      this.mirrorOf = key;
      this.move = (COPY[key] || COPY.sword)[0];
      KB.particles(this.cx, this.cy, ['#66e4ff', '#ffffff', '#a862f0'], 10, { spread: 1.8, grav: 0, life: 20 });
      V('ring', this.cx, this.cy, { r0: 2, r1: 20, frames: 12, color: '#66e4ff', width: 2 });
      sfx('magic_circle', 'item');
      if (KB.game) KB.game.toast('鏡子瓦豆映出了『' + MOVE_NAME[this.move] + '』！');
    }
    // 招式的「鏡像版」（威力比魔王低：單發、沒有連段）
    castMirror() {
      const p = KB.player, dir = this.dir;
      switch (this.move) {
        case 'slash':
          KB.shoot({ spr: 'proj_shadowblade', x: this.cx + dir * 14, y: this.cy - 2, vx: dir * 2.8, dmg: 1, owner: 'enemy', life: 100, w: 14, h: 8, grav: 0, solid: false, type: 'sword', dir, trail: '#66e4ff' });
          V('slash', this.cx + dir * 16, this.cy - 2, 16, 0, { color: '#66e4ff', width: 3, frames: 10, flip: dir < 0 });
          sfx('sword');
          break;
        case 'fireball':
          KB.shoot({ spr: 'proj_shadowball', x: this.cx + dir * 12, y: this.cy - 4, vx: dir * 2.2, vy: -1.5, dmg: 1, owner: 'enemy', life: 170, w: 10, h: 10, grav: 0.1, solid: true, type: 'fire', dir, trail: '#66e4ff', inhalable: true, ownerEnt: this, fxHit: 'fx_fire' });
          sfx('fireball', 'fire');
          break;
        case 'shuriken':
          for (let k = -1; k <= 1; k += 2)
            KB.shoot({ spr: 'proj_shadowstar', x: this.cx + dir * 12, y: this.cy - 2, vx: dir * 2.6, vy: k * 0.8, dmg: 1, owner: 'enemy', life: 120, w: 10, h: 10, grav: 0, solid: false, type: 'shadow', rotSpeed: 0.4 * dir, trail: '#66e4ff', inhalable: true, ownerEnt: this });
          sfx('shuriken', 'cutter');
          break;
        case 'thunder': {
          const bx = p ? p.cx : this.cx + dir * 40, gy = groundY(bx, this.y - 8);
          KB.hitbox({ x: bx - 9, y: gy - 80, w: 18, h: 84, dmg: 1, owner: 'enemy', type: 'spark', life: 10, pierce: true, breakBlocks: false });
          V('lightning', bx, gy - 88, bx, gy - 2, { color: '#66e4ff', frames: 12, jitter: 5, branches: 1 });
          KB.particles(bx, gy - 6, ['#ffffff', '#66e4ff'], 10, { spread: 2, life: 20, up: 1.2 });
          sfx('thunder', 'spark');
          break;
        }
        case 'blackhole': {
          const hx = p ? p.cx : this.cx, hy = (p ? p.cy : this.cy) - 16;
          V('circle', hx, hy, { r: 22, frames: 50, color: '#66e4ff', spin: 0.1 });
          KB.hitbox({ x: hx - 12, y: hy - 12, w: 24, h: 24, dmg: 1, owner: 'enemy', type: 'shadow', life: 40, pierce: true, rehit: 40, breakBlocks: false });
          sfx('blackhole', 'charge');
          break;
        }
        default: {  // stomp
          const gy = this.bottom;
          KB.spawn(new KB.Shockwave(this.cx + dir * 10, gy, dir, { speed: 2.2, life: 100, dmg: 1, color: '#66e4ff' }));
          KB.particles(this.cx, gy, ['#66e4ff', '#ffffff'], 12, { spread: 2.2, up: 1.4, life: 22 });
          V('shake', 4); sfx('stomp', 'hammer');
          break;
        }
      }
    }
    think() {
      if (this.state === 'cast') {
        this.vx = 0;
        if (this.stateT === 1) this.facePlayer();
        if (this.stateT === 20) this.castMirror();
        if (this.stateT >= 46) { this.setState('walk'); this.setSpr('mirrordee_walk'); this.cool = this.tough ? 80 : 110; }
        return;
      }
      if (this.state === 'charge') {   // 貼身：舉起鏡子撞過來
        if (this.stateT === 1) { this.facePlayer(); sfx('slide'); }
        this.vx = this.dir * 2.4;
        if (this.stateT % 3 === 0) KB.particles(this.cx - this.dir * 8, this.cy, '#66e4ff', 1, { spread: 0.5, grav: 0, life: 12, up: 0, size: 1 });
        if (this.hitWall || this.stateT >= 22) { this.vx = 0; this.setState('walk'); this.setSpr('mirrordee_walk'); this.cool = 70; }
        return;
      }
      if ((this.stateT % 60) === 1) this.reflect();
      const see = this.notice(150, 70);
      if (see) { this.facePlayer(); this.vx = this.dir * this.speed * this.alertK * (this.exK || 1); }
      else this.walk();
      if (this.cool <= 0 && this.canSee(180, 90)) {
        this.reflect();
        this.setState(this.playerDist() < 48 ? 'charge' : 'cast');
        if (this.state === 'cast') this.setSpr('mirrordee_attack');
      }
    }
  }
  KB.ENEMIES.mirrordee = MirrorDee;

  // =====================================================================
  //  暗影卡比 SHADOW KIRBY
  // =====================================================================
  // 6 種通用影子招（不依賴能力的 def.onAttack，全部自己實作）
  const MOVES = ['slash', 'fireball', 'shuriken', 'thunder', 'blackhole', 'stomp'];
  // 玩家能力 → 挑 3 種影子招
  const COPY = {
    sword: ['slash', 'shuriken', 'stomp'],
    blade: ['slash', 'shuriken', 'stomp'],
    cutter: ['shuriken', 'slash', 'blackhole'],
    ninja: ['shuriken', 'slash', 'stomp'],
    fire: ['fireball', 'thunder', 'stomp'],
    dragon: ['fireball', 'stomp', 'thunder'],
    mage: ['fireball', 'blackhole', 'thunder'],
    ice: ['shuriken', 'blackhole', 'stomp'],
    beam: ['thunder', 'fireball', 'slash'],
    spark: ['thunder', 'blackhole', 'fireball'],
    mech: ['thunder', 'stomp', 'shuriken'],
    hammer: ['stomp', 'slash', 'blackhole'],
    stone: ['stomp', 'blackhole', 'fireball'],
    giant: ['stomp', 'slash', 'thunder'],
    gunner: ['shuriken', 'thunder', 'slash'],
    bow: ['shuriken', 'thunder', 'fireball'],
    gravity: ['blackhole', 'shuriken', 'fireball'],
    time: ['blackhole', 'thunder', 'slash'],
    clone: ['blackhole', 'shuriken', 'slash'],
    ghost: ['blackhole', 'fireball', 'shuriken'],
  };
  const MOVE_NAME = { slash: '影劍氣', fireball: '影火球', shuriken: '影手裡劍', thunder: '影雷擊', blackhole: '影黑洞', stomp: '影踩踏' };
  const RISE_POOL = 34, RISE_UP = 108, RISE_EYE = 124;   // 登場時序（總長 KB.BOSS_INTRO=150）

  class ShadowKirby extends KB.Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '暗影卡比'; this.subtitle = 'SHADOW KIRBY'; this.name = 'shadowkirby';
      this.hp = this.maxHp = 70; this.score = 12000; this.color = '#2c1a4a';
      this.solid = true; this.grav = KB.GRAV; this.spr = 'shadowkirby_idle'; this.setSize(22, 22);
      this.dir = -1; this.decisions = 0; this.warpCD = 0; this.copied = null; this.moves = COPY.sword.slice();
      this.clones = []; this.guardT = 0; this.rains = 0; this.rainCD = 0; this.safeX = [];
      this.rageColor = '#a862f0'; this.phase2Msg = '暗影卡比分裂出了影分身！';
      this.setState('idle');
    }

    // ---------- 能力複製 ----------
    copyAbility(quiet) {
      const key = (KB.player && KB.player.ability) || 'sword';
      if (key === this.copied) return false;
      this.copied = key;
      this.moves = (COPY[key] || COPY.sword).slice();
      const def = KB.ABILITIES && KB.ABILITIES[key];
      this.copyHat = def && def.hat ? def.hat : 'hat_' + key;
      if (!KB.has(this.copyHat)) this.copyHat = null;
      if (!quiet) {
        KB.fx('fx_sparkle', this.cx, this.y);
        KB.particles(this.cx, this.cy, ['#a862f0', '#ffffff', '#2c1a4a'], 14, { spread: 2.2, grav: -0.01, life: 26 });
        V('ring', this.cx, this.cy, { r0: 2, r1: 26, frames: 14, color: '#a862f0', width: 2 });
        sfx('transform', 'ability');
        if (KB.game) KB.game.toast('暗影卡比複製了『' + ((def && def.name) || key) + '』！');
      }
      return true;
    }

    // ---------- 登場：從玩家的影子中升起 ----------
    introUpdate(dt) {
      this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1;
      const k = this.introT;
      this.vx = 0; this.vy = 0;
      this.bottom = this.spawnY + T;
      if (k === 1) {
        this.solid = false; this.grav = 0; this.hidden = false;
        this.facePlayer(); sfx('ghost_phase', 'swallow');
        this.copyAbility(true);
      }
      if (k < RISE_POOL) {
        if (k % 3 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.bottom - 2, ['#2c1a4a', '#180c2a'], 1, { spread: 0.7, grav: 0, life: 20, up: 0.1, size: 2 });
      } else if (k === RISE_POOL) {
        sfx('possess', 'door');
        V('ring', this.cx, this.bottom - 2, { r0: 4, r1: 30, frames: 16, color: '#a862f0', width: 2 });
      } else if (k < RISE_UP) {
        if (k % 4 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 22, this.bottom - 2, ['#a862f0', '#2c1a4a'], 1, { spread: 0.5, grav: -0.03, life: 22, up: 0.6, size: 1 });
      } else if (k === RISE_EYE) {
        sfx('phase2', 'boss_hurt');
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 6);
        V('flash', '#a862f0', 6, 0.5);
        KB.particles(this.cx, this.cy, ['#ffffff', '#a862f0'], 18, { spread: 3, grav: 0, life: 28 });
      }
    }
    get risePct() {
      const k = this.introT || 0;
      if (k <= RISE_POOL) return 0;
      return Math.min(1, (k - RISE_POOL) / (RISE_UP - RISE_POOL));
    }
    drawIntro(g) {
      const k = this.introT || 0, rp = this.risePct;
      // 地面上的影池（隨時間擴散 → 隨剪影拔起而收束）
      const pool = k < RISE_POOL ? k / RISE_POOL : 1 - rp * 0.5;
      const rw = Math.max(2, Math.round(8 + 36 * pool));
      g.rect(this.cx - rw / 2, this.bottom - 4, rw, 4, '#0c0618');
      g.rect(this.cx - rw / 2 + 2, this.bottom - 4, rw - 4, 2, '#2c1a4a');
      g.rect(this.cx - rw / 2 + 4, this.bottom - 5, Math.max(1, rw - 8), 1, '#a862f0');
      if (rp <= 0) return;
      const base = { scaleY: rp, flip: this.dir < 0 };
      if (k < RISE_EYE) {
        // 拔起中：紫色外暈 + 稍亮的剪影（純黑會和深空背景糊在一起）
        g.spr('shadowkirby_idle', this.cx, this.bottom, { scaleX: 1.14, scaleY: rp * 1.06, flip: base.flip, tint: '#a862f0', alpha: 0.5 });
        g.spr('shadowkirby_idle', this.cx, this.bottom, Object.assign({}, base, { tint: '#503080', alpha: 0.96 }));
        if (k >= RISE_UP && ((k >> 1) & 1)) g.spr('shadowkirby_idle', this.cx, this.bottom, Object.assign({}, base, { tint: '#ffffff', alpha: 0.3 }));
      } else {
        g.spr('shadowkirby_idle', this.cx, this.bottom, base);
      }
    }
    onIntroEnd() {
      this.solid = true; this.grav = KB.GRAV;
      this.x = this.spawnX; this.bottom = this.spawnY + T; this.vx = 0; this.vy = 0;
      // 「影子要有東西可以複製」：玩家空手進王座（例如剛剛被打死重來）就先把一把劍還給他。
      // 沒有這一段的話，死過一次的玩家 / 機器人會完全打不動 70 HP 的魔王（boss_test 實測會卡到 6000 幀）。
      const p = this.player;
      if (p && !p.ability && !p.mouth && KB.ITEMS.abilitystar && KB.ABILITIES.sword) {
        const st = new KB.ITEMS.abilitystar(p.cx - 7, p.y - 20, 'sword', 1);
        st.vx = (this.cx > p.cx ? -1 : 1) * 1.2; st.vy = -2.6;
        KB.spawn(st);
        KB.particles(p.cx, p.cy - 16, ['#a862f0', '#ffffff'], 10, { spread: 2, life: 24 });
        if (KB.game) KB.game.toast('影子把一把劍丟了過來…');
      }
      this.copyAbility(true);
    }

    // ---------- 二階段 ----------
    enterPhase2() {
      if (this.phase >= 2) return;
      super.enterPhase2();
      music('shadowboss2');
    }
    onPhase2() {
      this.setState('split');
    }
    spawnClones() {
      this.clones = [];
      for (const s of [-1, 1]) {
        const cx = clamp(this.cx + s * 46, 20, mapW() - 36);
        const c = new ShadowClone(cx - 8, this.cy - 8);
        c.x = cx - 8; c.y = this.cy - 20; c.active = true; c.dir = -s;
        KB.spawn(c); this.clones.push(c);
        KB.fx('fx_poof', c.cx, c.cy + 6);
        KB.particles(c.cx, c.cy, ['#2c1a4a', '#a862f0'], 12, { spread: 2.2, grav: 0, life: 24 });
      }
      this.guardT = 900;   // 影分身撐不過 900 幀（保證戰鬥一定會往前推進）
    }
    get clonesAlive() { return this.clones.filter(c => c && !c.dead).length; }
    dismissClones(msg) {
      for (const c of this.clones) if (c && !c.dead) { KB.particles(c.cx, c.cy, ['#2c1a4a', '#a862f0'], 12, { spread: 2 }); c.dead = true; }
      this.clones = [];
      this.untouchable = false; this.hidden = false;
      sfx('unlock', 'enemydie');
      V('flash', '#a862f0', 5, 0.45);
      if (KB.game && msg) KB.game.toast(msg);
    }

    // ---------- 招式選擇 ----------
    decide() {
      const dist = this.playerDist(), r = this.rng();
      this.decisions++;
      if (this.phase === 2 && this.rainCD <= 0 && this.decisions % 4 === 0) return this.setState('starrain');
      if (this.warpCD <= 0 && (this.decisions % 3 === 0 || dist > 150)) return this.setState('warp');
      // 影之吸入：玩家會往反方向逃 ⇒ 出太多會讓整場變成追逐戰（實測佔掉 1577 幀）
      if (dist < 80 && r < 0.26) return this.setState('inhale');
      return this.setState(this.moves[Math.floor(r * this.moves.length) % this.moves.length]);
    }

    ai(dt) {
      const p = this.player; if (!p) return;
      if (this.warpCD > 0) this.warpCD--;
      if (this.rainCD > 0) this.rainCD--;
      // 本體只有「踩踏」落下時才有碰觸傷害。
      // （瞬移原本也算，但他是直接出現在玩家背後 40px ⇒ 等於無法迴避的固定傷害，
      //   boss_test 的普通玩家樣本有 6 次受傷來自這裡 → 拔掉。瞬移後的招式才是威脅。）
      this.contactDamage = this.state === 'stomp';
      // 玩家換了能力 → 重新複製（每 90 幀檢查一次）
      if (this.phase >= 1 && this.state === 'idle' && (KB.game.frame % 90) === 0) this.copyAbility(false);

      switch (this.state) {
        case 'idle':
          this.vx *= 0.72; this.facePlayer();
          if (this.stateT > this.iv(24)) this.decide();
          break;

        // ---- 二階段：分裂 → 影分身守護 ----
        case 'split':
          this.vx = 0;
          if (this.stateT === 1) { sfx('clone_summon', 'phase2'); V('letterbox', 60); V('zoom', 1.12, 8); }
          if (this.stateT === 18) { this.spawnClones(); this.untouchable = true; }
          if (this.stateT > 26) this.setState('guard');
          break;
        case 'guard': {
          // 本體無敵地飄在上空，影分身全滅（或 900 幀到）才落回地面
          this.vx = 0; this.grav = 0;
          this.y -= this.stateT < 30 ? 0.6 : 0;
          this.vy = 0;
          if (this.stateT % 5 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 24, this.cy, ['#2c1a4a', '#a862f0'], 1, { spread: 0.5, grav: 0, life: 18, up: 0.2, size: 1 });
          this.guardT--;
          if (this.clonesAlive === 0 || this.guardT <= 0) {
            this.dismissClones(this.guardT <= 0 ? '影分身撐不住了！' : '本體的弱點露出來了！');
            this.grav = KB.GRAV; this.setState('idle');
          }
          break;
        }

        // ---- 通用影子招 1：影劍氣（兩道不同高度的刀氣）----
        case 'slash':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          for (let k = 0; k < 2; k++) if (this.stateT === this.iv(14) + k * 12) {
            KB.shoot({
              spr: 'proj_shadowblade', x: this.cx + this.dir * 14, y: this.cy + (k ? 6 : -6), vx: this.dir * 2.8, dmg: 1, owner: 'enemy',
              life: 90, w: 14, h: 8, grav: 0, solid: false, type: 'sword', dir: this.dir, trail: '#a862f0', fxHit: 'fx_hit',
            });
            V('slash', this.cx + this.dir * 16, this.cy + (k ? 6 : -6), 18, k ? 0.5 : -0.5, { color: '#a862f0', width: 3, frames: 10, flip: this.dir < 0 });
            sfx('slash_big', 'sword');
          }
          if (this.stateT > this.iv(44)) this.setState('idle');
          break;

        // ---- 2：影火球（兩顆拋物線黑炎）----
        case 'fireball':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          for (let k = 0; k < 2; k++) if (this.stateT === this.iv(16) + k * 14) {
            KB.shoot({
              spr: 'proj_shadowball', x: this.cx + this.dir * 12, y: this.cy - 4, vx: this.dir * (2.0 + k * 0.5), vy: -1.6, dmg: 1, owner: 'enemy',
              life: 180, w: 10, h: 10, grav: 0.1, solid: true, type: 'fire', dir: this.dir, trail: '#a862f0', fxHit: 'fx_fire', inhalable: true, ownerEnt: this,
            });
            KB.particles(this.cx + this.dir * 12, this.cy - 4, ['#a862f0', '#503080'], 6, { spread: 1.4, grav: 0, life: 16 });
            sfx('fireball', 'fire');
          }
          if (this.stateT > this.iv(46)) this.setState('idle');
          break;

        // ---- 3：影手裡劍（三發扇形）----
        case 'shuriken':
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          if (this.stateT === this.iv(16)) {
            for (let k = -1; k <= 1; k++) {
              KB.shoot({
                spr: 'proj_shadowstar', x: this.cx + this.dir * 12, y: this.cy - 2, vx: this.dir * 3.0, vy: k * 1.1, dmg: 1, owner: 'enemy',
                life: 130, w: 10, h: 10, grav: 0, solid: false, type: 'shadow', rotSpeed: 0.4 * this.dir, trail: '#a862f0', inhalable: true, ownerEnt: this,
              });
            }
            sfx('shuriken', 'cutter');
          }
          if (this.stateT > this.iv(38)) this.setState('idle');
          break;

        // ---- 4：影雷擊（玩家頭上 30 幀預警 → 落雷）----
        case 'thunder': {
          this.vx *= 0.85;
          if (this.stateT === 1) { this.facePlayer(); this.boltX = p.cx; sfx('magic_circle', 'charge'); }
          if (this.stateT < 30 && this.stateT % 4 === 0)
            KB.particles(this.boltX + (this.rng() - 0.5) * 16, groundY(this.boltX, this.y) - 46, ['#a862f0', '#ffffff'], 2, { spread: 0.6, grav: 0, life: 14, up: -0.4 });
          if (this.stateT === 30) {
            const gy = groundY(this.boltX, this.y - 8);
            KB.hitbox({ x: this.boltX - 10, y: gy - 96, w: 20, h: 100, dmg: 1, owner: 'enemy', type: 'spark', life: 12, pierce: true, breakBlocks: false });
            V('lightning', this.boltX, gy - 104, this.boltX, gy - 2, { color: '#c8a0ff', frames: 14, jitter: 6, branches: 2 });
            KB.particles(this.boltX, gy - 6, ['#ffffff', '#a862f0'], 14, { spread: 2.4, life: 24, up: 1.4 });
            V('shake', 4); sfx('thunder', 'spark');
          }
          if (this.stateT > this.iv(52)) this.setState('idle');
          break;
        }

        // ---- 5：影黑洞（在玩家與本體之間放一顆黑洞，把人拉過去）----
        case 'blackhole': {
          this.vx *= 0.85;
          if (this.stateT === 1) {
            this.facePlayer();
            this.holeX = clamp((this.cx + p.cx) / 2, 24, mapW() - 24);
            this.holeY = p.cy - 20;
            sfx('blackhole', 'charge');
            V('circle', this.holeX, this.holeY, { r: 30, frames: 96, color: '#a862f0', spin: 0.08 });
          }
          if (this.stateT >= 24 && this.stateT < 96) {
            const dx = this.holeX - p.cx, dy = this.holeY - p.cy, d = Math.max(6, Math.hypot(dx, dy));
            if (d < 96 && !NO_PULL[p.state] && p.invincibleT <= 0) {
              const s = 0.85, nx = p.x + dx / d * s;
              if (!solidAt(dx > 0 ? nx + p.w - 1 : nx, p.y + 1, p.bottom - 1)) p.x = nx;
              p.y += dy / d * 0.35;
            }
            if (this.stateT % 3 === 0) {
              const a = this.rng() * 6.28, r = 30 + this.rng() * 16;
              KB.particles(this.holeX + Math.cos(a) * r, this.holeY + Math.sin(a) * r, ['#a862f0', '#503080', '#ffffff'], 1,
                { spread: 0.2, grav: 0, life: 16, up: 0, vx: -Math.cos(a) * 1.6, vy: -Math.sin(a) * 1.6, size: 1 });
            }
            if (this.stateT === 60) KB.hitbox({ x: this.holeX - 14, y: this.holeY - 14, w: 28, h: 28, dmg: 1, owner: 'enemy', type: 'shadow', life: 30, pierce: true, rehit: 40, breakBlocks: false });
          }
          if (this.stateT > this.iv(104)) this.setState('idle');
          break;
        }

        // ---- 6：影踩踏（高跳 → 砸地 → 左右兩道震波）----
        case 'stomp':
          if (this.stateT === 1) { this.facePlayer(); this.vy = -5.6; this.vx = this.dir * 1.7; sfx('jump'); }
          if (this.stateT > 4 && this.vy > 0 && !this.onGround) { this.vy = Math.min(this.vy + 0.35, 8); this.vx *= 0.9; }
          if (this.stateT > 6 && this.onGround) {
            const gy = this.bottom;
            KB.spawn(new KB.Shockwave(this.cx - 10, gy, -1, { speed: 2.2, life: 90, dmg: 1, color: '#a862f0' }));
            KB.spawn(new KB.Shockwave(this.cx + 10, gy, 1, { speed: 2.2, life: 90, dmg: 1, color: '#a862f0' }));
            KB.particles(this.cx, gy, ['#a862f0', '#ffffff', '#2c1a4a'], 16, { spread: 2.6, up: 1.6, life: 26 });
            V('shake', 6); V('shockwave', this.cx, gy, { w: 30, h: 10, dir: 0, color: '#a862f0' });
            sfx('stomp', 'hammer');
            this.vx = 0; this.setState('land');
          }
          if (this.stateT > 100) this.setState('idle');
          break;
        case 'land':
          this.vx *= 0.7;
          if (this.stateT > this.iv(26)) this.setState('idle');
          break;

        // ---- 瞬移到玩家背後 ----
        case 'warp':
          if (this.stateT === 1) {
            this.warpCD = 150; this.hidden = true; this.untouchable = true; this.invuln = 26; this.vx = 0; this.vy = 0; this.grav = 0;
            KB.fx('fx_poof', this.cx, this.cy);
            KB.particles(this.cx, this.cy, ['#2c1a4a', '#a862f0'], 12, { spread: 2.4, life: 22 });
            sfx('teleport', 'door');
          }
          if (this.stateT === 24) {
            const behind = -p.dir;   // 玩家的背後
            let nx = clamp(p.cx + behind * 40 - this.w / 2, 6, mapW() - this.w - 6);
            if (solidAt(nx + this.w / 2, p.y, p.bottom - 1)) nx = clamp(p.cx - behind * 40 - this.w / 2, 6, mapW() - this.w - 6);
            this.x = nx; this.bottom = groundY(nx + this.w / 2, p.bottom - 2); this.vy = 0; this.grav = KB.GRAV;
            this.hidden = false; this.untouchable = false; this.facePlayer();
            KB.fx('fx_poof', this.cx, this.cy);
            KB.particles(this.cx, this.cy, ['#2c1a4a', '#a862f0', '#ffffff'], 14, { spread: 2.4, life: 22 });
            V('afterimage', this, { frames: 20, color: '#a862f0', every: 3 });
            sfx('teleport', 'door');
          }
          if (this.stateT > 34) { this.grav = KB.GRAV; this.setState('idle'); }
          break;

        // ---- 影之吸入：拉扯 → 吸到就吐出（2 點傷害）----
        case 'inhale': {
          this.vx = 0; this.contactDamage = false;
          if (this.stateT === 1) { this.facePlayer(); KB.audio.sfx('inhale'); }
          if (this.stateT >= 20 && this.stateT < 84) {
            if (!this.inhaleFx || this.inhaleFx.dead) this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 70, fps: 10 });
            this.inhaleFx.x = this.cx + this.dir * 34; this.inhaleFx.y = this.cy + 8; this.inhaleFx.flip = this.dir < 0;
            const rx = this.dir > 0 ? this.x + this.w : this.x - 84, ry = this.y - 10, rw = 84, rh = this.h + 18;
            if (p.overlapsRect(rx, ry, rw, rh) && !NO_PULL[p.state] && p.invincibleT <= 0) {
              const pull = -this.dir * 1.05, nx = p.x + pull, edge = pull > 0 ? nx + p.w - 1 : nx;
              if (!solidAt(edge, p.y + 1, p.bottom - 1)) p.x = nx;
              if (this.stateT % 4 === 0) KB.particles(p.cx - pull * 6, p.cy, ['#a862f0', '#ffffff'], 1, { spread: 0.4, vx: pull * 1.5, grav: 0, life: 12, up: 0 });
            }
            // 吸到了 → 吐出去（2 點傷害 + 大擊退）
            if (p.overlaps(this) && p.invincibleT <= 0 && p.state !== 'dead' && p.state !== 'stone') {
              const away = p.cx < this.cx ? -1 : 1;
              if (p.hurt(2, { cx: this.cx, cy: this.cy, knock: 3.4, damage: 2 })) {
                p.vx = away * 3.4; p.vy = -3.0;
                KB.particles(p.cx, p.cy, ['#a862f0', '#ffffff'], 16, { spread: 3, life: 26 });
                V('flash', '#a862f0', 5, 0.4); V('shake', 5);
                sfx('spit', 'hurt');
                if (KB.game) KB.game.toast('被暗影卡比吐出來了！');
              }
              this.stopInhaleFx(); this.setState('land');
            }
          }
          if (this.stateT >= 84) { this.stopInhaleFx(); this.setState('idle'); }
          break;
        }

        // ---- 必殺・暗星雨（二階段）----
        case 'starrain': {
          this.vx = 0;
          if (this.stateT === 1) {
            this.rains++; this.rainCD = 420;
            const w = mapW();
            const base = clamp(p.cx, 48, w - 48);
            this.safeX = [clamp(base - 64 + this.rng() * 24, 28, w - 28), clamp(base + 64 - this.rng() * 24, 28, w - 28)];
            V('letterbox', 170); V('worldTint', '#2c1a4a', 0.3, 160);
            sfx('ultimate', 'charge');
            if (KB.game) { KB.game.toast('暗星雨！站進光環裡！'); KB.game.shake = Math.max(KB.game.shake || 0, 5); }
          }
          // 安全區提示環
          if (this.stateT < 46 && this.stateT % 12 === 0)
            for (const sx of this.safeX) V('ring', sx, groundY(sx, this.y) - 8, { r0: 4, r1: 26, frames: 14, color: '#66e4ff', width: 2 });
          // 隕石雨
          if (this.stateT >= 46 && this.stateT < 150 && this.stateT % 7 === 0) {
            const cam = KB.game.cam, map = KB.game.map;
            for (let k = 0; k < 2; k++) {
              const mx = cam.x + 8 + this.rng() * (KB.W - 16);
              if (this.safeX.some(sx => Math.abs(sx - mx) < 26)) continue;
              // 王座廳的天花板（row 0）是實心的 —— 直接生在畫面上緣會當場撞牆消失，
              // 所以往下找到第一個非實心的格子再生成。
              let my = cam.y + 14;
              for (let n = 0; n < 6 && KB.TileMap.isGround(map.get(Math.floor(mx / T), Math.floor(my / T))); n++) my += T;
              my += 12;
              KB.shoot({
                spr: 'proj_darkmeteor', x: mx, y: my, vx: (this.rng() - 0.5) * 0.6, vy: 3.4, dmg: 1, owner: 'enemy',
                life: 180, w: 10, h: 14, grav: 0.03, solid: true, type: 'shadow', trail: '#a862f0', fxHit: 'fx_hit', breakBlocks: false,
              });
              KB.particles(mx, my - 6, ['#a862f0', '#ffffff'], 3, { spread: 0.8, grav: 0, life: 12, up: 0.2, size: 1 });
            }
            if (this.stateT % 28 === 0) sfx('meteor', 'block');
          }
          if (this.stateT > 176) this.setState('idle');
          break;
        }

        case 'hurt':
          this.vx *= 0.86;
          if (this.stateT > this.iv(14)) this.setState('idle');
          break;
      }
    }

    stopInhaleFx() { if (this.inhaleFx) { this.inhaleFx.dead = true; this.inhaleFx = null; } }

    onHurt(amount, src) {
      // split / guard 是二階段的演出（enterPhase2 在 hurt() 裡先 setState('split')，
      // onHurt 緊接著被呼叫）—— 不能被「受傷後仰」蓋掉，否則影分身永遠不會出現。
      if (this.state === 'starrain' || this.state === 'guard' || this.state === 'warp' || this.state === 'split') return;
      const from = src && src.cx !== undefined ? src.cx : (this.player ? this.player.cx : this.cx);
      this.dir = from < this.cx ? -1 : 1;
      this.stopInhaleFx();
      if (this.state === 'stomp' || this.state === 'slash') return;   // 出招中有霸體
      if (this.stunCD > 0) { this.stunCD--; return; }
      this.stunCD = 40;
      this.vx = (from < this.cx ? 1 : -1) * 1.6;
      this.setState('hurt');
    }
    update(dt) {
      if (this.stunCD > 0 && !this.introducing) this.stunCD--;
      super.update(dt);
    }
    onDeath() {
      this.stopInhaleFx();
      this.dismissClones(null);
      // 影子消散
      KB.particles(this.cx, this.cy, ['#2c1a4a', '#503080', '#a862f0', '#ffffff'], 40, { spread: 3.6, grav: -0.045, life: 70, up: 1.2 });
      V('flash', '#ffffff', 10, 0.75);
      V('ring', this.cx, this.cy, { r0: 4, r1: 60, frames: 26, color: '#a862f0', width: 3 });
      V('shake', 8);
      for (const e of (KB.game ? KB.game.entities : [])) if (!e.dead && e.type === 'proj' && e.owner === 'enemy') e.dead = true;
      try { KB.session = KB.session || {}; KB.session.shadowDefeated = true; } catch (e) { }
    }

    draw(g) {
      if (this.introducing) { this.drawIntro(g); return; }
      if (this.hidden) return;
      // 暗星雨的安全區光環（畫在地面上）
      if (this.state === 'starrain' && this.stateT < 170) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
        for (const sx of this.safeX) {
          const gy = groundY(sx, this.y) - 2;
          // 地面上的橢圓光環
          for (let k = 0; k < 44; k++) {
            const a = k / 44 * Math.PI * 2;
            g.rect(sx + Math.cos(a) * 23 - 1, gy + Math.sin(a) * 7 - 1, 2, 2, (k + Math.floor(this.t * 12)) % 4 < 2 ? '#66e4ff' : '#ffffff');
          }
          // 兩側光柱（半透明，看得出「這一格是安全的」）
          const hh = 44 + pulse * 8;
          g.rect(sx - 23, gy - hh, 2, hh, 'rgba(102,228,255,0.30)');
          g.rect(sx + 21, gy - hh, 2, hh, 'rgba(102,228,255,0.30)');
          g.rect(sx - 21, gy - hh, 42, 2, 'rgba(255,255,255,' + (0.2 + pulse * 0.25).toFixed(2) + ')');
        }
      }
      let spr = 'shadowkirby_idle', o = {};
      if (this.hurtT > 0 || this.state === 'hurt') spr = 'shadowkirby_hurt';
      else if (this.state === 'inhale') spr = 'shadowkirby_inhale';
      else if (this.state === 'stomp' || this.state === 'guard') spr = 'shadowkirby_float';
      else if (this.state === 'slash' || this.state === 'fireball' || this.state === 'shuriken' || this.state === 'thunder' || this.state === 'blackhole' || this.state === 'starrain') {
        spr = 'shadowkirby_attack'; o.frame = this.stateT < 8 ? 0 : this.stateT < 18 ? 1 : 2;
      }
      // 無敵（分身守護）時半透明呼吸
      if (this.untouchable) o.alpha = 0.55 + 0.2 * Math.sin(this.t * 9);
      this.drawBody(g, spr, o);
      // 複製來的帽子（染黑）
      if (this.copyHat && KB.has(this.copyHat)) {
        const oy = this.state === 'guard' ? -1 : 0;
        g.spr(this.copyHat, this.cx, this.y + 3 + oy, { flip: this.dir < 0, t: this.t, tint: '#2c1a4a', alpha: o.alpha !== undefined ? o.alpha : 0.95 });
        g.spr(this.copyHat, this.cx, this.y + 3 + oy, { flip: this.dir < 0, t: this.t, tint: '#a862f0', alpha: 0.22 });
      }
    }
  }
  KB.BOSSES.shadowkirby = ShadowKirby;
  KB.SHADOW_MOVES = MOVES; KB.SHADOW_MOVE_NAMES = MOVE_NAME; KB.SHADOW_COPY = COPY;
})();
