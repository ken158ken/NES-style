// 第七世界「夢幻迴廊」——新敵人 2 種 + 真最終魔王「夢魘之核」（Round 7 world7 agent）
// ============================================================================
// 敵人（KB.ENEMIES）
//   dreameater 食夢獸：張嘴把卡比的能力星 / 玩家投射物吸進肚子裡，再吐回來（吐回的夢泡可以再被吸走）。
//                      吃掉的是能力星 → 吐出來的還是那顆能力星（撿得回來，不會整場失去能力）。
//   nightlight 夢燈  ：暗房裡會移動的光源（glow 30）。打倒 → 燈熄滅 5 秒（300 幀）後重新亮起；
//                      熄滅期間不會傷人也打不到，房間會暗下來 —— 「這盞燈不能打掉」的教學。給 fire。
//
// 魔王（KB.BOSSES.nightmarecore）夢魘之核 —— 三階段，各自一條血（40 / 40 / 50）
//   一階段「核心」（32×32 懸浮球體）：4 片護盾碎片繞行，攻擊核心會被碎片擋下（傷害轉給最近的碎片）；
//        4 片全破 → 核心裸露 200 幀（真正扣血的窗口）→ 碎片重組。招式：夢彈扇形 / 召喚 2 隻食夢獸 / 漂移。
//   二階段「夢魘騎士」（24×32 披風劍士）：劍氣三連 / 瞬移斬 / 夢境黑洞 /
//        「幻影招」＝過往 6 魔王的招式各一（威斯比蘋果、洛洛洛箱、克拉寇雷、魅塔龍捲、迪迪迪震波、暗影星雨）隨機。
//   三階段「終焉之翼」（64×48 巨翼，平時停在畫面上方）：全畫面羽毛雨（地面有安全區光環）/ 俯衝 /
//        必殺「永夜」（letterbox + 全暗只剩卡比光圈 + 左 / 右 / 上三個方向的衝擊波）。
//        每次出招後會降到低空「喘息」80 幀 —— 那是玩家的攻擊窗。
//   階段轉換：碎裂（身體炸成碎片 + 停格 + 白閃）→ 重組（碎片聚攏成新形態）；音樂 nightmare → nightmare2。
//   登場：坐在王座上睡著 → 夢境泡泡 → 睜眼 → 浮起。
//   擊敗：光芒四射 + KB.session.trueEnd = true + music('trueend')。
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
  function toast(msg) { try { if (KB.game && msg) KB.game.toast(msg); } catch (e) { } }
  function banner(name, sub, color) {
    if (KB.VFX && KB.VFX.banner) KB.VFX.banner(name, sub, color); else toast(name + '！' + (sub || ''));
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
  //  dreameater 食夢獸：吞掉玩家的投射物 / 能力星，再吐回來
  // =====================================================================
  class DreamEater extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'dreameater'; this.spr = 'dreameater_walk'; this.w = 16; this.h = 16;
      this.hp = 4; this.maxHp = 4; this.score = 600; this.ability = null;
      this.speed = 0.5; this.cool = 40; this.element = 'ghost'; this.weak = ['spark']; this.glow = 8;
      this.dropTable = { pointstar: 0.3, food: 0.1 };
      this.stored = null;              // { kind:'ability'|'proj', a:'sword'|null }
    }
    // 射程內「吃得到」的東西：玩家的投射物 / 掉在地上的能力星
    prey() {
      const g = KB.game; if (!g) return null;
      let best = null, bd = 1e9;
      for (const e of g.entities) {
        if (e.dead) continue;
        const isStar = e.name === 'abilitystar';
        const isProj = e.type === 'proj' && e.owner === 'player';
        if (!isStar && !isProj) continue;
        const dx = Math.abs(e.cx - this.cx), dy = Math.abs(e.cy - this.cy);
        if (dx > 76 || dy > 44) continue;
        const d = dx + dy; if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    mouthX() { return this.cx + this.dir * 10; }
    swallow(e) {
      this.stored = (e.name === 'abilitystar') ? { kind: 'ability', a: e.ability || (e.a || null) } : { kind: 'proj', a: null };
      e.dead = true;
      KB.particles(this.mouthX(), this.cy, ['#b672f0', '#ffffff', '#7ce4ff'], 12, { spread: 1.8, grav: 0, life: 20 });
      V('ring', this.mouthX(), this.cy, { r0: 2, r1: 18, frames: 12, color: '#b672f0', width: 2 });
      sfx('swallow');
      this.setState('spit'); this.stateT = 0;
    }
    doSpit() {
      const p = KB.player;
      const st = this.stored; this.stored = null;
      const mx = this.mouthX(), my = this.cy;
      if (st && st.kind === 'ability' && st.a && KB.ITEMS && KB.ITEMS.abilitystar) {
        // 吃掉的是能力星 → 原封不動吐回來（玩家撿得回去）
        const s = new KB.ITEMS.abilitystar(mx - 7, my - 8, st.a, 1);
        s.vx = this.dir * 1.8; s.vy = -2.4; KB.spawn(s);
        toast('食夢獸把能力吐回來了！');
      } else {
        const dx = p ? p.cx - mx : this.dir * 60, dy = p ? (p.cy - 4) - my : 0;
        const d = Math.max(1, Math.hypot(dx, dy));
        KB.shoot({
          spr: 'proj_dreamspit', x: mx, y: my, vx: dx / d * 2.6, vy: dy / d * 2.6, dmg: 1, owner: 'enemy',
          life: 140, w: 10, h: 10, grav: 0, solid: false, type: 'shadow', rotSpeed: 0.24, trail: '#b672f0',
          inhalable: true, ownerEnt: this, fxHit: 'fx_poof',
        });
      }
      KB.particles(mx, my, ['#b672f0', '#ff9ede'], 10, { spread: 2, grav: 0, life: 18 });
      sfx('spit', 'exhale');
    }
    think() {
      if (this.state === 'eat') {
        this.vx *= 0.7;
        // 吸力：把獵物往嘴邊拉
        const mx = this.mouthX(), my = this.cy;
        for (const e of KB.game.entities) {
          if (e.dead) continue;
          const isStar = e.name === 'abilitystar', isProj = e.type === 'proj' && e.owner === 'player';
          if (!isStar && !isProj) continue;
          const dx = mx - e.cx, dy = my - e.cy, d = Math.hypot(dx, dy);
          if (d > 74) continue;
          if (d < 10) { this.swallow(e); return; }
          e.x += dx / d * 2.0; e.y += dy / d * 2.0; if (e.vx !== undefined) { e.vx *= 0.8; e.vy *= 0.8; }
        }
        if (this.stateT % 4 === 0) KB.particles(mx + this.dir * 14, my, ['#b672f0', '#ffffff'], 1, { spread: 0.6, grav: 0, life: 12, vx: -this.dir * 1.4, size: 1 });
        if (this.stateT >= 54) { this.setState('walk'); this.setSpr('dreameater_walk'); this.cool = 90; }
        return;
      }
      if (this.state === 'spit') {
        this.vx = 0;
        if (this.stateT === 18) this.doSpit();
        if (this.stateT >= 40) { this.setState('walk'); this.setSpr('dreameater_walk'); this.cool = 70; }
        return;
      }
      const see = this.notice(120, 50);
      if (see && this.onGround) {
        if (this.playerDist() > 36) this.chase(this.speed * this.alertK); else { this.facePlayer(); this.vx = 0; }
      } else this.walk();
      const q = this.cool <= 0 ? this.prey() : null;
      if (q) { this.dir = q.cx < this.cx ? -1 : 1; this.setState('eat'); this.setSpr('dreameater_attack'); sfx('inhale'); }
      else if (this.cool <= 0 && this.canSee(84, 30)) { this.facePlayer(); this.setState('eat'); this.setSpr('dreameater_attack'); sfx('inhale'); }
    }
    draw(g) {
      super.draw(g);
      if (this.stored) {   // 肚子裡有東西 → 發光
        const a = 0.3 + 0.25 * Math.sin(this.t * 8);
        g.spr(this.spr, this.cx, this.bottom, { t: this.animT / 60, flip: this.dir < 0, tint: '#ff9ede', alpha: a });
      }
    }
  }
  KB.ENEMIES.dreameater = DreamEater;

  // =====================================================================
  //  nightlight 夢燈：暗房裡的移動光源，打倒後光消失 5 秒
  // =====================================================================
  const NL_OUT = 300;   // 熄滅幀數（5 秒）
  class NightLight extends KB.Baddie {
    constructor(x, y) {
      super(x, y);
      this.name = 'nightlight'; this.spr = 'nightlight_fly'; this.w = 14; this.h = 18;
      this.hp = 3; this.maxHp = 3; this.score = 400; this.ability = 'fire';
      this.grav = 0; this.solid = false; this.speed = 0.55; this.element = 'fire'; this.weak = ['ice'];
      this.glow = 30; this.persistent = true; this.dropTable = { pointstar: 0.3 };
      this.homeX = x; this.homeY = y; this.ph = (x * 9 + y * 5) % 628 / 100;
      this.outT = 0;
    }
    get lit() { return this.outT <= 0; }
    // 打倒 → 不是死亡，而是「熄滅 5 秒」
    hurt(a, src) {
      if (this.outT > 0) return false;
      return super.hurt(a, src);
    }
    die(src) {
      if (this.outT > 0 || this.dead) return;
      this.outT = NL_OUT; this.glow = 0; this.hurtsPlayer = false; this.inhalable = false;
      this.hp = this.maxHp; this.setSpr('nightlight_off'); this.setState('out');
      KB.particles(this.cx, this.cy, ['#ffd85c', '#ffffff', '#5a5a92'], 16, { spread: 2.4, grav: 0, life: 28 });
      V('ring', this.cx, this.cy, { r0: 2, r1: 26, frames: 14, color: '#ffd85c', width: 2 });
      sfx('melt', 'enemyhit');
      toast('夢燈熄滅了…（5 秒後會重新亮起）');
      if (KB.game) KB.game.addScore(this.score, this.cx, this.y);
    }
    relight() {
      this.outT = 0; this.glow = 30; this.hurtsPlayer = true; this.inhalable = true;
      this.setSpr('nightlight_fly'); this.setState('fly');
      KB.particles(this.cx, this.cy, ['#ffd85c', '#ffffff'], 14, { spread: 2, grav: 0, life: 22 });
      V('ring', this.cx, this.cy, { r0: 2, r1: 24, frames: 14, color: '#ffd85c', width: 2 });
      V('flash', '#ffd85c', 4, 0.22);
      sfx('torch', 'item');
    }
    think() {
      this.ph += 0.04;
      if (this.outT > 0) {
        this.outT--;
        this.vx *= 0.9; this.vy = Math.sin(this.ph) * 0.14;
        if (this.outT <= 0) this.relight();
        return;
      }
      const p = KB.player;
      if (p && this.notice(140, 100)) {
        // 會「靠近但不貼身」：保持 46px，當成一盞跟著你走的燈
        const dx = p.cx - this.cx, dy = (p.cy - 18) - this.cy, d = Math.max(1, Math.hypot(dx, dy));
        const k = d > 46 ? 1 : -0.6;
        const s = this.speed * this.alertK * (this.exK || 1) * k;
        this.vx = dx / d * s; this.vy = dy / d * s + Math.sin(this.ph) * 0.14;
        this.facePlayer();
      } else {
        this.vx = (this.homeX - this.x) * 0.008;
        this.vy = (this.homeY - this.y) * 0.008 + Math.sin(this.ph) * 0.24;
      }
    }
    draw(g) {
      if (this.lit && (Math.floor(this.t * 60) % 6) === 0)
        KB.particles(this.cx, this.cy + 8, ['#ffd85c', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 14, up: -0.2, size: 1 });
      super.draw(g);
    }
  }
  KB.ENEMIES.nightlight = NightLight;

  // =====================================================================
  //  dreamswitch 夢之開關（依序）：{ t:'dreamswitch', x, y, a:順序 0,1,2,… }
  //  —— 與 KB.ITEMS.switchblock 的差別：要「照順序」按，按到最後一顆才 KB.unlockDoors。
  //     順序不對只會「鏘」一聲（不會重來），所以摸黑亂打也不會把自己鎖死。
  //     目前亮著的那一顆＝房內已按下的數量（狀態直接從場上實體算，房間重載也不會錯亂）。
  // =====================================================================
  KB.ITEMS.dreamswitch = class extends KB.Enemy {
    constructor(x, y, a) {
      super(x, y);
      this.name = 'dreamswitch'; this.spr = 'item_dreamswitch'; this.w = 16; this.h = 16;
      this.hp = this.maxHp = 1; this.score = 0; this.grav = 0; this.solid = false;
      this.inhalable = false; this.hurtsPlayer = false; this.contactDamage = false; this.damage = 0;
      this.turnAtEdge = false; this.turnAtWall = false; this.walkAnim = false; this.persistent = true; this.z = 1;
      this.order = a === undefined ? 0 : (+a || 0); this.pressed = false; this.glow = 14;
    }
    all() {
      const g = KB.game; if (!g) return [];
      return g.entities.filter(e => !e.dead && e.name === 'dreamswitch');
    }
    get pressedCount() { return this.all().filter(e => e.pressed).length; }
    get isNext() { return !this.pressed && this.order === this.pressedCount; }
    ai(dt) { this.vx = 0; this.vy = 0; }
    hurt(amount, src) {
      if (this.pressed || this.dead) return false;
      if (!this.isNext) {
        if (this.nagT > 0) { this.nagT--; return true; }
        this.nagT = 40;
        sfx('hardblock', 'block');
        KB.particles(this.cx, this.cy, ['#5a5a92', '#ffffff'], 6, { spread: 1.4, life: 14 });
        toast('順序不對…先按亮著的那一顆');
        return true;
      }
      this.pressed = true; this.glow = 6;
      KB.audio.sfx('unlock');
      KB.fx('fx_sparkle', this.cx, this.cy);
      KB.particles(this.cx, this.cy, ['#ffffff', '#ffd85c', '#b672f0'], 14, { spread: 2.5 });
      V('ring', this.cx, this.cy, { r0: 2, r1: 22, frames: 14, color: '#ffd85c', width: 2 });
      if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 4);
      const list = this.all(), n = list.filter(e => e.pressed).length;
      if (n >= list.length) { if (KB.game) KB.unlockDoors(KB.game, '夢之鎖解開了！'); }
      else toast('夢之開關 ' + n + ' / ' + list.length);
      return true;
    }
    die() { }
    update(dt) { if (this.nagT > 0) this.nagT--; super.update(dt); }
    draw(g) {
      if (this.isNext) {
        const r = 8 + Math.sin(this.t * 5) * 2;
        g.circle(this.cx, this.cy, r, 'rgba(255,216,92,0.20)');
        KB.drawDoorLocks(g);
      }
      g.spr(this.spr, this.cx, this.bottom, { frame: this.pressed ? 2 : (this.isNext ? 1 : 0), t: this.t });
    }
  };

  // =====================================================================
  //  夢魘之核 NIGHTMARE CORE
  // =====================================================================
  const PHASE_HP = [40, 40, 50];
  const PHASE_NAME = ['核心', '夢魘騎士', '終焉之翼'];
  // 幻影招（過往 6 魔王）
  const PHANTOMS = ['apple', 'box', 'thunder', 'tornado', 'quake', 'starrain'];
  const PHANTOM_NAME = {
    apple: '幻影・威斯比的蘋果', box: '幻影・洛洛洛的箱子', thunder: '幻影・克拉寇的落雷',
    tornado: '幻影・魅塔的龍捲', quake: '幻影・迪迪迪的震波', starrain: '幻影・暗影的星雨',
  };
  const SLEEP = 46, WAKE = 92, RISE = 132;   // 登場時序（總長 KB.BOSS_INTRO = 150）

  class NightmareCore extends KB.Boss {
    constructor(x, y) {
      super(x, y);
      this.displayName = '夢魘之核'; this.subtitle = 'NIGHTMARE CORE'; this.name = 'nightmarecore';
      this.hp = this.maxHp = PHASE_HP[0]; this.score = 30000; this.color = '#4a2e96';
      this.solid = false; this.grav = 0; this.spr = 'nightmarecore_idle'; this.setSize(28, 28);
      this.dir = -1; this.decisions = 0; this.phase = 1; this.changing = false;
      this.rageColor = '#ff4a86'; this.contactDamage = true;
      // 一階段：4 片護盾碎片
      this.shards = [0, 1, 2, 3].map(i => ({ a: i * Math.PI / 2, hp: 3, maxHp: 3, alive: true, flash: 0 }));
      this.orbit = 0; this.bareT = 0;
      this.eaters = []; this.holeT = 0;
      this.safeX = []; this.nightT = 0; this.nightFx = null;
      this.restT = 0;
      this.setState('idle');
    }

    // ---------- 共用 ----------
    get shieldUp() { return this.phase === 1 && this.bareT <= 0 && this.shards.some(s => s.alive); }
    get shardsAlive() { return this.shards.filter(s => s.alive).length; }
    iv(n) { return Math.max(1, Math.round(n * (this.phase === 1 ? 1 : this.phase === 2 ? 0.82 : 0.74))); }
    // 瞬移斬的「消失」期間會設 hidden / untouchable / grav=0；招式被任何外力打斷（階段轉換、
    // 測試工具直接改 state…）時要還原，否則魔王會永遠隱形又打不到。
    setState(s) {
      if (this.state === 'warpslash' && s !== 'warpslash') {
        this.hidden = false; this.untouchable = false;
        this.grav = this.phase === 2 ? KB.GRAV : 0;
      }
      super.setState(s);
    }
    maybePhase2() { }          // 三階段各自一條血，不走基底的 50% 門檻
    get half() { return -1; }  // 同上（基底的 get half 只被 maybePhase2 用到）
    get floor() { return groundY(this.cx, Math.min(this.bottom + 8, (KB.game && KB.game.map ? KB.game.map.ph : 999))); }
    hoverTo(targetBottom, k) {
      this.bottom += (targetBottom - this.bottom) * (k || 0.08);
    }

    // ---------- 登場：從王座上的睡夢中醒來 ----------
    introUpdate(dt) {
      this.ensureExtra(); this.t += dt; this.introT = (this.introT || 0) + 1;
      const k = this.introT;
      this.vx = 0; this.vy = 0;
      if (k === 1) { this.solid = false; this.grav = 0; this.hidden = false; this.facePlayer(); this.bottom = this.spawnY + T; }
      if (k < SLEEP) {
        // 睡著：頭上冒夢泡
        if (k % 14 === 0) {
          KB.particles(this.cx + 12, this.y - 2, ['#b672f0', '#ffffff'], 2, { spread: 0.5, grav: -0.02, life: 40, up: 0.7, size: 2 });
          sfx('bubble', 'float');
        }
      } else if (k === SLEEP) {
        sfx('charge'); V('ring', this.cx, this.cy, { r0: 4, r1: 30, frames: 18, color: '#b672f0', width: 2 });
      } else if (k < WAKE) {
        if (k % 5 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.cy + 10, ['#b672f0', '#4a2e96'], 1, { spread: 0.5, grav: -0.03, life: 24, up: 0.5, size: 1 });
      } else if (k === WAKE) {
        // 睜眼
        sfx('phase2', 'boss_hurt');
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 7);
        V('flash', '#ff4a86', 7, 0.55);
        V('ring', this.cx, this.cy, { r0: 3, r1: 46, frames: 20, color: '#ff4a86', width: 3 });
        KB.particles(this.cx, this.cy, ['#ffffff', '#ff4a86', '#b672f0'], 22, { spread: 3.2, grav: 0, life: 32 });
      } else if (k > WAKE && k < RISE) {
        // 浮起
        this.bottom -= 0.5;
        if (k % 4 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 26, this.bottom, ['#b672f0', '#7ce4ff'], 1, { spread: 0.4, grav: 0, life: 18, up: -0.5, size: 1 });
      } else if (k === RISE) {
        sfx('ultimate', 'charge');
        V('zoom', 1.1, 10);
      }
    }
    drawIntro(g) {
      const k = this.introT || 0;
      const spr = k < WAKE ? 'nightmarecore_hurt' : 'nightmarecore_idle';
      // 睡夢中的光暈
      const a = 0.25 + 0.15 * Math.sin(this.t * 3);
      g.spr(spr, this.cx, this.bottom, { t: this.t, flip: this.dir < 0, tint: '#b672f0', alpha: a, scaleX: 1.12, scaleY: 1.12 });
      g.spr(spr, this.cx, this.bottom, { t: this.t, flip: this.dir < 0 });
      if (k < SLEEP) {   // 「Z」的替代：三顆往上飄的夢泡
        for (let i = 0; i < 3; i++) {
          const ph = ((this.t * 22 + i * 14) % 42) / 42;
          g.rect(this.cx + 12 + i * 3 + Math.sin(ph * 6) * 2, this.y - 2 - ph * 22, 2 + i, 2 + i, i ? '#b672f0' : '#ffffff');
        }
      }
    }
    onIntroEnd() {
      this.x = this.spawnX; this.vx = 0; this.vy = 0;
      this.bottom = this.floor - 12;
      music('nightmare');
      // 三階段共 130 點血：空手（例如剛剛被打死重來）進王座是打不完的 →
      // 比照 w6 暗影卡比，先把一把劍丟回給玩家。
      const p = this.player;
      if (p && !p.ability && !p.mouth && KB.ITEMS.abilitystar && KB.ABILITIES.sword) {
        const st = new KB.ITEMS.abilitystar(p.cx - 7, p.y - 20, 'sword', 1);
        st.vx = (this.cx > p.cx ? -1 : 1) * 1.2; st.vy = -2.6;
        KB.spawn(st);
        KB.particles(p.cx, p.cy - 16, ['#b672f0', '#ffffff'], 10, { spread: 2, life: 24 });
        toast('夢境把一把劍還了回來…');
      }
      // Extra（超難）：跳過「核心」形態，夢魘騎士直接登場（基底 Boss.update 的自動二階段
      // 因為 `get half()` 回 -1 而不會觸發 —— 三階段各自一條血，門檻式的二階段不適用）
      if (KB.extraOn && KB.extraOn() && this.phase === 1) {
        this.applyPhase(2);
        V('flash', '#ff4a86', 8, 0.6); V('shake', 6);
        KB.particles(this.cx, this.cy, ['#ffffff', '#ff4a86', '#b672f0'], 26, { spread: 3.4, grav: 0, life: 34 });
        banner(PHASE_NAME[1], 'EXTRA', '#ff4a86');
        music('nightmare2');
      }
      this.setState('idle');
    }

    // ---------- 階段轉換 ----------
    applyPhase(n) {
      this.phase = n;
      // Extra（超難）：每個形態的血量都 ×KB.exK('bossHp')（= KB.EXTRA.bossHp，一般難度回傳 1）
      this.maxHp = Math.max(1, Math.round(PHASE_HP[n - 1] * (KB.exK ? KB.exK('bossHp') : 1)));
      this.hp = this.maxHp;
      this.invuln = 20; this.hurtT = 0;
      this.dismissEaters();
      if (n === 2) {
        this.solid = true; this.grav = KB.GRAV; this.setSize(20, 30);
        this.bottom = this.floor; this.spr = 'nightknight_idle';
        music('nightmare2');
      } else if (n === 3) {
        this.solid = false; this.grav = 0; this.setSize(48, 34);
        this.bottom = this.floor - 40; this.spr = 'nmwing_idle';
      }
      this.setState('idle');
    }
    beginPhaseChange() {
      if (this.changing) return;
      this.changing = true; this.untouchable = true; this.contactDamage = false;
      this.vx = 0; this.vy = 0; this.grav = 0; this.solid = false;
      this.setState('morph');
      V('hitstop', 14); V('shake', 9); V('flash', '#ffffff', 10, 0.8); V('letterbox', 120);
      sfx('boss_hurt'); sfx('phase2', 'boss_hurt');
      // 碎裂
      KB.particles(this.cx, this.cy, ['#1a1550', '#4a2e96', '#b672f0', '#ffffff'], 48, { spread: 4.2, grav: -0.02, life: 56 });
      V('ring', this.cx, this.cy, { r0: 4, r1: 70, frames: 26, color: '#b672f0', width: 3 });
      for (const e of (KB.game ? KB.game.entities : [])) if (!e.dead && e.type === 'proj' && e.owner === 'enemy') e.dead = true;
    }
    finishPhaseChange() {
      this.changing = false; this.untouchable = false; this.contactDamage = true;
      this.applyPhase(this.phase + 1);
      V('flash', '#ff4a86', 8, 0.6); V('shake', 7); V('zoom', 1.14, 10);
      KB.particles(this.cx, this.cy, ['#ffffff', '#ff4a86', '#b672f0'], 30, { spread: 3.4, grav: 0, life: 34 });
      banner(PHASE_NAME[this.phase - 1], '第 ' + this.phase + ' 形態', '#ff4a86');
      sfx('ultimate', 'charge');
    }
    // 測試用（tools/boss_test.py）：直接跳到第 n 形態
    forcePhase(n) {
      while (this.phase < n && this.phase < PHASE_HP.length) { this.changing = false; this.finishPhaseChange(); }
      return this.phase;
    }

    // ---------- 受傷：三階段各一條血 ----------
    hurt(amount, src) {
      this.ensureExtra();
      if (this.dead || this.invuln > 0 || this.introducing || this.untouchable || this.changing) return false;
      // 護盾碎片：傷害轉給最靠近攻擊來源的碎片
      if (this.shieldUp) {
        const sx = src && src.cx !== undefined ? src.cx : this.cx, sy = src && src.cy !== undefined ? src.cy : this.cy;
        let best = null, bd = 1e9;
        for (const s of this.shards) {
          if (!s.alive) continue;
          const d = Math.hypot(this.shardPos(s).x - sx, this.shardPos(s).y - sy);
          if (d < bd) { bd = d; best = s; }
        }
        if (best) {
          best.hp -= Math.max(1, amount); best.flash = 8; this.invuln = 8;
          const pos = this.shardPos(best);
          KB.audio.sfx('hardblock');
          KB.particles(pos.x, pos.y, ['#ffd85c', '#ffffff', '#b672f0'], 6, { spread: 1.6, grav: 0, life: 16 });
          if (best.hp <= 0) {
            best.alive = false;
            KB.particles(pos.x, pos.y, ['#ffd85c', '#ffffff', '#4a2e96'], 18, { spread: 2.8, grav: 0.02, life: 30 });
            V('ring', pos.x, pos.y, { r0: 2, r1: 26, frames: 14, color: '#ffd85c', width: 2 });
            V('shake', 4); sfx('block');
            if (this.shardsAlive === 0) {
              this.bareT = 240; this.invuln = 0;
              V('flash', '#ff4a86', 6, 0.4);
              banner('核心裸露', '趁現在！', '#ff4a86');
              sfx('unlock', 'item');
            } else toast('護盾碎片破了一片！（剩 ' + this.shardsAlive + ' 片）');
          }
        }
        return true;
      }
      amount = KB.ELEM ? KB.ELEM.applyHit(this, amount, src) : amount;
      this.hp -= amount; this.flash = 10; this.invuln = 12; this.hurtT = 20;
      KB.audio.sfx('boss_hurt');
      const hx = src && src.cx !== undefined ? clamp(src.cx, this.x, this.x + this.w) : this.cx;
      const hy = src && src.cy !== undefined ? clamp(src.cy, this.y, this.bottom) : this.cy;
      KB.fx('fx_hit', hx, hy + 6);
      if (this.hp <= 0) {
        this.hp = 0;
        if (this.phase < PHASE_HP.length) { this.beginPhaseChange(); return true; }
        this.die(src); return true;
      }
      this.onHurt(amount, src);
      return true;
    }
    onHurt(amount, src) {
      if (this.phase !== 2) return;              // 只有騎士形態會被打退
      if (this.state === 'morph' || this.state === 'warpslash' || this.state === 'voidhole') return;
      const from = src && src.cx !== undefined ? src.cx : (this.player ? this.player.cx : this.cx);
      this.dir = from < this.cx ? -1 : 1;
      if (this.stunCD > 0) { this.stunCD--; return; }
      this.stunCD = 40; this.vx = (from < this.cx ? 1 : -1) * 1.4;
      this.setState('hurt');
    }

    // ---------- 護盾碎片 ----------
    shardPos(s) {
      const a = s.a + this.orbit;
      return { x: this.cx + Math.cos(a) * 34, y: this.cy + Math.sin(a) * 20 };
    }
    resetShards() {
      for (const s of this.shards) { s.alive = true; s.hp = s.maxHp; s.flash = 0; }
      KB.particles(this.cx, this.cy, ['#ffd85c', '#ffffff'], 20, { spread: 3, grav: 0, life: 26 });
      V('ring', this.cx, this.cy, { r0: 34, r1: 6, frames: 16, color: '#ffd85c', width: 2 });
      sfx('clone_summon', 'phase2');
      toast('護盾碎片重組了！');
    }
    dismissEaters() {
      for (const e of this.eaters) if (e && !e.dead) { KB.particles(e.cx, e.cy, ['#b672f0'], 8, { spread: 2 }); e.dead = true; }
      this.eaters = [];
    }

    // ---------- 招式選擇 ----------
    decide() {
      const r = this.rng(), dist = this.playerDist();
      this.decisions++;
      if (this.phase === 1) {
        if (this.decisions % 4 === 0 && this.eaters.filter(e => e && !e.dead).length === 0) return this.setState('summon');
        if (r < 0.62 || dist > 150) return this.setState('fan');
        return this.setState('drift');
      }
      if (this.phase === 2) {
        // Extra 專屬新招：幻影亂舞（過往魔王的招式連放 3 個）
        if (KB.extraOn && KB.extraOn() && this.decisions % 4 === 0) return this.setState('phantomrush');
        if (this.decisions % 3 === 0) return this.setState('phantom');
        if (dist > 110 || r < 0.3) return this.setState('warpslash');
        if (r < 0.66) return this.setState('slash3');
        return this.setState('voidhole');
      }
      // 三階段
      if (this.decisions % 5 === 0) return this.setState('eternalnight');
      if (r < 0.5) return this.setState('featherrain');
      return this.setState('dive');
    }

    // ---------- 幻影招（過往 6 魔王）----------
    castPhantom(kind) {
      const p = this.player, g = KB.game;
      const px = p ? p.cx : this.cx + this.dir * 60;
      banner(PHANTOM_NAME[kind], '', '#b672f0');
      switch (kind) {
        case 'apple': {           // 威斯比：頭上掉 3 顆蘋果（可吸入吐回）
          for (let k = 0; k < 3; k++) {
            const x = clamp(px + (k - 1) * 26, 20, mapW() - 20);
            KB.spawn(new KB.BossAmmo({
              spr: 'proj_apple', x, y: Math.max(12, this.cy - 70), vx: 0, vy: 0.6, grav: 0.18, maxFall: 3.4,
              dmg: 1, owner: 'enemy', life: 400, w: 12, h: 12, solid: true, dieOnGround: true,
              name: 'apple', score: 120, fxHit: 'fx_poof', type: 'apple', color: '#e83030',
            }));
          }
          sfx('block'); break;
        }
        case 'box': {             // 洛洛洛：推一顆箱子滑過來
          const dir = p && p.cx < this.cx ? -1 : 1;
          KB.spawn(new KB.BossAmmo({
            spr: 'proj_box', x: this.cx + dir * 22, y: this.floor - 10, vx: dir * 2.4, vy: 0, grav: 0.2, maxFall: 4,
            dmg: 1, owner: 'enemy', life: 300, w: 16, h: 16, solid: true, breakOnWall: true, friction: 1,
            name: 'box', score: 150, fxHit: 'fx_poof', type: 'box', color: '#c88850',
          }));
          sfx('slide'); break;
        }
        case 'thunder': {         // 克拉寇：預警 30 幀後落雷
          this.boltX = px; this.boltT = 30; sfx('magic_circle', 'charge'); break;
        }
        case 'tornado': {         // 魅塔：貼地龍捲追過去
          const dir = p && p.cx < this.cx ? -1 : 1;
          KB.spawn(new KB.Shockwave(this.cx + dir * 18, this.floor, dir, { speed: 2.2, life: 160, dmg: 1, color: '#c0b0ff' }));
          sfx('cutter'); break;
        }
        case 'quake': {           // 迪迪迪：砸地 → 左右兩道震波
          const gy = this.floor;
          KB.spawn(new KB.Shockwave(this.cx - 12, gy, -1, { speed: 2.3, life: 110, dmg: 1, color: '#ffd85c' }));
          KB.spawn(new KB.Shockwave(this.cx + 12, gy, 1, { speed: 2.3, life: 110, dmg: 1, color: '#ffd85c' }));
          KB.particles(this.cx, gy, ['#ffd85c', '#ffffff'], 16, { spread: 2.6, up: 1.6, life: 24 });
          V('shockwave', this.cx, gy, { w: 30, h: 10, dir: 0, color: '#ffd85c' });
          V('shake', 6); sfx('stomp', 'hammer'); break;
        }
        default: {                // 暗影卡比：小規模星雨（6 顆）
          const cam = g.cam, map = g.map;
          for (let k = 0; k < 6; k++) {
            const mx = clamp(cam.x + 16 + this.rng() * (KB.W - 32), 12, mapW() - 12);
            let my = cam.y + 14;
            for (let n = 0; n < 6 && KB.TileMap.isGround(map.get(Math.floor(mx / T), Math.floor(my / T))); n++) my += T;
            my += 12;
            KB.shoot({
              spr: 'proj_darkmeteor', x: mx, y: my, vx: 0, vy: 2.8 + this.rng() * 0.8, dmg: 1, owner: 'enemy',
              life: 180, w: 10, h: 14, grav: 0.03, solid: true, type: 'shadow', trail: '#b672f0', fxHit: 'fx_hit', breakBlocks: false,
            });
          }
          sfx('meteor', 'block'); break;
        }
      }
    }

    // ---------- 永夜：全畫面壓黑、只留卡比的光圈 ----------
    // 用 KB.VFX 的視窗層（'v'）自訂效果，**不去動 room.dark** ——
    // room 物件是關卡資料本身，玩家中途死掉重載房間就再也還原不回來了。
    startNight(frames) {
      this.endNight();
      if (!KB.VFX || !KB.VFX.push) return;
      this.nightFx = KB.VFX.push({
        layer: 'v', life: frames || 300,
        draw(ctx, cam) {
          const g = KB.game; if (!g) return;
          const cv = this.cv || (this.cv = KB.makeCanvas(KB.W, KB.VIEW_H));
          const x = cv.getContext('2d');
          const fade = Math.min(1, this.t / 18) * Math.min(1, (this.life - this.t) / 24);
          if (fade <= 0) return;
          x.globalCompositeOperation = 'source-over';
          x.clearRect(0, 0, KB.W, KB.VIEW_H);
          x.fillStyle = 'rgba(2,0,14,0.97)';
          x.fillRect(0, 0, KB.W, KB.VIEW_H);
          x.globalCompositeOperation = 'destination-out';
          const p = g.player;
          if (p) {
            const px = Math.round(p.cx - cam.x), py = Math.round(p.cy - cam.y), r = 44;
            const gr = x.createRadialGradient(px, py, 0, px, py, r);
            gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.92)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
          }
          x.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fade;
          ctx.drawImage(cv, 0, 0);
          ctx.globalAlpha = 1;
        },
      });
    }
    endNight() {
      if (this.nightFx) { this.nightFx.dead = true; this.nightFx = null; }
    }

    ai(dt) {
      const p = this.player; if (!p) return;
      if (this.stunCD > 0) this.stunCD--;
      // 本體碰觸傷害只留在「主動撞過來」的招式（其餘時間貼身打不會被無條件扣血）
      this.contactDamage = (this.state === 'drift' || this.state === 'dive');
      if (this.bareT > 0) { if (--this.bareT === 0 && this.phase === 1 && this.hp > 0) this.resetShards(); }
      for (const s of this.shards) if (s.flash > 0) s.flash--;
      this.orbit += this.phase === 1 ? 0.028 : 0;
      // 落雷預警（幻影・克拉寇）
      if (this.boltT > 0) {
        this.boltT--;
        if (this.boltT % 4 === 0) KB.particles(this.boltX + (this.rng() - 0.5) * 16, groundY(this.boltX, this.y) - 46, ['#7ce4ff', '#ffffff'], 2, { spread: 0.6, grav: 0, life: 14, up: -0.4 });
        if (this.boltT === 0) {
          const gy = groundY(this.boltX, this.y - 8);
          KB.hitbox({ x: this.boltX - 10, y: gy - 100, w: 20, h: 104, dmg: 1, owner: 'enemy', type: 'spark', life: 12, pierce: true, breakBlocks: false });
          V('lightning', this.boltX, gy - 108, this.boltX, gy - 2, { color: '#9ff0ff', frames: 14, jitter: 6, branches: 2 });
          KB.particles(this.boltX, gy - 6, ['#ffffff', '#7ce4ff'], 14, { spread: 2.4, life: 24, up: 1.4 });
          V('shake', 4); sfx('thunder', 'spark');
        }
      }

      switch (this.state) {
        // ---------------- 階段轉換演出 ----------------
        case 'morph':
          this.vx = 0; this.vy = 0;
          if (this.stateT < 40) {   // 碎裂：往外炸
            if (this.stateT % 3 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 30, this.cy + (this.rng() - 0.5) * 30, ['#1a1550', '#b672f0'], 2, { spread: 2.4, grav: 0, life: 40 });
          } else if (this.stateT === 40) {
            sfx('charge'); V('circle', this.cx, this.cy, { r: 40, frames: 60, color: '#b672f0', spin: 0.12 });
          } else if (this.stateT < 96) {   // 重組：碎片聚攏
            if (this.stateT % 2 === 0) {
              const a = this.rng() * 6.28, r = 40 + this.rng() * 26;
              KB.particles(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, ['#b672f0', '#ffffff', '#ff4a86'], 1,
                { spread: 0.2, grav: 0, life: 22, vx: -Math.cos(a) * 2.2, vy: -Math.sin(a) * 2.2, size: 2 });
            }
          } else if (this.stateT === 96) this.finishPhaseChange();
          break;

        // ================= 一階段：核心 =================
        case 'idle':
          if (this.phase === 1) {
            this.hoverTo(this.floor - 12 + Math.sin(this.t * 2) * 3, 0.06);
            this.vx *= 0.9; this.facePlayer();
          } else if (this.phase === 2) { this.vx *= 0.72; this.facePlayer(); }
          else { this.wingIdle(); }
          if (this.stateT > this.iv(this.phase === 1 ? 32 : this.phase === 3 ? 34 : 26)) this.decide();
          break;

        case 'fan': {            // 夢彈扇形
          this.hoverTo(this.floor - 16, 0.06); this.vx *= 0.9;
          if (this.stateT === 1) { this.facePlayer(); sfx('charge'); }
          if (this.stateT === this.iv(24)) {
            const n = this.bareT > 0 ? 4 : 5;
            const base = Math.atan2((p.cy - 6) - this.cy, p.cx - this.cx);
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.22;
              KB.shoot({
                spr: 'proj_dreambullet', x: this.cx + Math.cos(a) * 18, y: this.cy + Math.sin(a) * 18,
                vx: Math.cos(a) * 2.1, vy: Math.sin(a) * 2.1, dmg: 1, owner: 'enemy', life: 170, w: 8, h: 8,
                grav: 0, solid: false, type: 'shadow', rotSpeed: 0.2, trail: '#b672f0',
                inhalable: true, ownerEnt: this, fxHit: 'fx_poof',
              });
            }
            KB.particles(this.cx, this.cy, ['#b672f0', '#ffffff'], 12, { spread: 2, grav: 0, life: 18 });
            sfx('beam', 'enemyhit');
          }
          if (this.stateT > this.iv(66)) this.setState('idle');
          break;
        }
        case 'summon': {         // 召喚 2 隻食夢獸
          this.hoverTo(this.floor - 18, 0.06); this.vx *= 0.9;
          if (this.stateT === 1) { sfx('clone_summon', 'phase2'); V('circle', this.cx, this.cy, { r: 30, frames: 44, color: '#b672f0', spin: 0.1 }); }
          if (this.stateT === 26) {
            this.dismissEaters();
            for (const s of [-1, 1]) {
              const ex = clamp(this.cx + s * 52, 24, mapW() - 36);
              const gy = groundY(ex, this.cy);
              const e = new DreamEater(ex - 8, gy - 16);
              e.x = ex - 9; e.bottom = gy; e.active = true; e.dir = -s;
              KB.spawn(e); this.eaters.push(e);
              KB.fx('fx_poof', e.cx, e.cy);
              KB.particles(e.cx, e.cy, ['#b672f0', '#ff9ede'], 12, { spread: 2.2, grav: 0, life: 24 });
            }
            toast('夢魘之核召喚了食夢獸！');
          }
          if (this.stateT > this.iv(56)) this.setState('idle');
          break;
        }
        case 'drift': {          // 漂到玩家上方（碰觸傷害）
          const ty = this.floor - 30;
          this.hoverTo(ty, 0.05);
          const dx = p.cx - this.cx;
          this.x += clamp(dx * 0.02, -1.3, 1.3);
          if (this.stateT % 6 === 0) KB.particles(this.cx + (this.rng() - 0.5) * 24, this.cy + 12, ['#b672f0'], 1, { spread: 0.4, grav: 0, life: 16, up: -0.3, size: 1 });
          if (this.stateT > this.iv(62)) this.setState('idle');
          break;
        }

        // ================= 二階段：夢魘騎士 =================
        case 'slash3':           // 劍氣三連（高 / 中 / 低）
          this.vx *= 0.8;
          if (this.stateT === 1) this.facePlayer();
          for (let k = 0; k < 3; k++) if (this.stateT === this.iv(12) + k * 10) {
            const oy = [-12, -2, 8][k];
            KB.shoot({
              spr: 'proj_nightslash', x: this.cx + this.dir * 14, y: this.cy + oy, vx: this.dir * 3.1, dmg: 1, owner: 'enemy',
              life: 100, w: 16, h: 8, grav: 0, solid: false, type: 'sword', dir: this.dir, trail: '#b672f0', fxHit: 'fx_hit',
            });
            V('slash', this.cx + this.dir * 18, this.cy + oy, 18, k === 0 ? -0.6 : k === 1 ? 0 : 0.6, { color: '#b672f0', width: 3, frames: 10, flip: this.dir < 0 });
            sfx('slash_big', 'sword');
          }
          if (this.stateT > this.iv(52)) this.setState('idle');
          break;

        case 'warpslash':        // 瞬移斬：消失 → 出現在玩家背後 → 大斬擊
          if (this.stateT === 1) {
            this.hidden = true; this.untouchable = true; this.invuln = 30; this.vx = 0; this.vy = 0; this.grav = 0;
            KB.fx('fx_poof', this.cx, this.cy);
            KB.particles(this.cx, this.cy, ['#1a1550', '#b672f0'], 12, { spread: 2.4, life: 22 });
            sfx('teleport', 'door');
          }
          if (this.stateT === 22) {
            const behind = -p.dir;
            let nx = clamp(p.cx + behind * 42 - this.w / 2, 6, mapW() - this.w - 6);
            if (solidAt(nx + this.w / 2, p.y, p.bottom - 1)) nx = clamp(p.cx - behind * 42 - this.w / 2, 6, mapW() - this.w - 6);
            this.x = nx; this.bottom = groundY(nx + this.w / 2, p.bottom - 2); this.vy = 0; this.grav = KB.GRAV;
            this.hidden = false; this.untouchable = false; this.facePlayer();
            KB.fx('fx_poof', this.cx, this.cy);
            V('afterimage', this, { frames: 22, color: '#b672f0', every: 3 });
            sfx('teleport', 'door');
          }
          if (this.stateT === 40) {
            KB.hitbox({ x: this.cx + (this.dir > 0 ? 2 : -34), y: this.cy - 16, w: 32, h: 30, dmg: 1, owner: 'enemy', type: 'sword', life: 10, pierce: true, breakBlocks: false });
            V('slash', this.cx + this.dir * 18, this.cy - 2, 26, 0, { color: '#ffd85c', width: 4, frames: 12, flip: this.dir < 0 });
            sfx('sword'); V('shake', 3);
          }
          if (this.stateT > this.iv(64)) { this.grav = KB.GRAV; this.setState('idle'); }
          break;

        case 'voidhole': {       // 夢境黑洞：把玩家拉過去
          this.vx *= 0.85;
          if (this.stateT === 1) {
            this.facePlayer();
            this.holeX = clamp((this.cx + p.cx) / 2, 26, mapW() - 26);
            this.holeY = p.cy - 22;
            sfx('blackhole', 'charge');
            V('circle', this.holeX, this.holeY, { r: 32, frames: 100, color: '#b672f0', spin: 0.09 });
          }
          if (this.stateT >= 24 && this.stateT < 100) {
            const dx = this.holeX - p.cx, dy = this.holeY - p.cy, d = Math.max(6, Math.hypot(dx, dy));
            if (d < 100 && !NO_PULL[p.state] && p.invincibleT <= 0) {
              const s = 0.9, nx = p.x + dx / d * s;
              if (!solidAt(dx > 0 ? nx + p.w - 1 : nx, p.y + 1, p.bottom - 1)) p.x = nx;
              p.y += dy / d * 0.35;
            }
            if (this.stateT % 3 === 0) {
              const a = this.rng() * 6.28, r = 30 + this.rng() * 18;
              KB.particles(this.holeX + Math.cos(a) * r, this.holeY + Math.sin(a) * r, ['#b672f0', '#4a2e96', '#ffffff'], 1,
                { spread: 0.2, grav: 0, life: 16, vx: -Math.cos(a) * 1.7, vy: -Math.sin(a) * 1.7, size: 1 });
            }
            if (this.stateT === 62) KB.hitbox({ x: this.holeX - 15, y: this.holeY - 15, w: 30, h: 30, dmg: 1, owner: 'enemy', type: 'shadow', life: 30, pierce: true, rehit: 40, breakBlocks: false });
          }
          if (this.stateT > this.iv(110)) this.setState('idle');
          break;
        }

        case 'phantom':          // 幻影招（過往 6 魔王隨機一招）
          this.vx *= 0.8;
          if (this.stateT === 1) { this.facePlayer(); this.pk = PHANTOMS[Math.floor(this.rng() * PHANTOMS.length) % PHANTOMS.length]; sfx('magic_circle', 'charge'); V('circle', this.cx, this.cy - 4, { r: 24, frames: 40, color: '#ffd85c', spin: 0.14 }); }
          if (this.stateT === this.iv(26)) this.castPhantom(this.pk);
          if (this.stateT > this.iv(66)) this.setState('idle');
          break;

        case 'phantomrush':      // 【Extra】幻影亂舞：過往魔王的招式連放 3 個（每 34 幀一個，不重複）
          this.vx *= 0.8;
          if (this.stateT === 1) {
            this.facePlayer();
            this.rushPool = PHANTOMS.slice();
            banner('幻影亂舞', 'PHANTOM RUSH', '#ffd85c');
            sfx('ultimate', 'charge'); V('letterbox', 150); V('shake', 5);
            V('circle', this.cx, this.cy - 4, { r: 30, frames: 120, color: '#ffd85c', spin: 0.16 });
          }
          for (let k = 0; k < 3; k++) if (this.stateT === 22 + k * 34) {
            const i = Math.floor(this.rng() * this.rushPool.length) % this.rushPool.length;
            this.castPhantom(this.rushPool.splice(i, 1)[0]);
          }
          if (this.stateT > 140) this.setState('idle');
          break;

        // ================= 三階段：終焉之翼 =================
        case 'featherrain': {    // 全畫面羽毛雨（地面有一處安全區）
          this.wingHigh();
          if (this.stateT === 1) {
            const w = mapW(), base = clamp(p.cx, 44, w - 44);
            this.safeX = [clamp(base + (this.rng() < 0.5 ? -60 : 60), 26, w - 26)];
            V('letterbox', 190); V('worldTint', '#1a1550', 0.26, 180);
            banner('羽毛雨', '站進光環裡！', '#b672f0');
            sfx('ultimate', 'charge'); V('shake', 5);
          }
          if (this.stateT < 48 && this.stateT % 12 === 0)
            for (const sx of this.safeX) V('ring', sx, groundY(sx, this.cy) - 8, { r0: 4, r1: 28, frames: 14, color: '#ffd85c', width: 2 });
          if (this.stateT >= 48 && this.stateT < 170 && this.stateT % 6 === 0) {
            const cam = KB.game.cam, map = KB.game.map;
            for (let k = 0; k < 2; k++) {
              const mx = cam.x + 8 + this.rng() * (KB.W - 16);
              if (this.safeX.some(sx => Math.abs(sx - mx) < 28)) continue;
              let my = cam.y + 12;
              for (let n = 0; n < 6 && KB.TileMap.isGround(map.get(Math.floor(mx / T), Math.floor(my / T))); n++) my += T;
              my += 10;
              KB.shoot({
                spr: 'proj_feather', x: mx, y: my, vx: (this.rng() - 0.5) * 0.8, vy: 2.2, dmg: 1, owner: 'enemy',
                life: 200, w: 8, h: 12, grav: 0.02, solid: true, type: 'wind', trail: '#b672f0', fxHit: 'fx_poof',
                breakBlocks: false, inhalable: true, ownerEnt: this,
              });
            }
            if (this.stateT % 30 === 0) sfx('wind', 'float');
          }
          if (this.stateT > 196) { this.restT = 120; this.setState('rest'); }
          break;
        }
        case 'dive': {           // 俯衝：拉高 → 衝到玩家所在的高度橫掃 → 拉回
          if (this.stateT === 1) { this.facePlayer(); this.diveY = p.bottom - 6; sfx('slide'); }
          if (this.stateT < 26) { this.wingHigh(); this.x += clamp((p.cx - this.cx) * 0.05, -2.4, 2.4); }
          else if (this.stateT < 40) { this.hoverTo(this.diveY, 0.24); V('afterimage', this, { frames: 10, color: '#b672f0', every: 4 }); }
          else if (this.stateT < 96) {
            this.hoverTo(this.diveY, 0.2);
            this.x += this.dir * 3.0;
            if (this.stateT % 3 === 0) KB.particles(this.cx - this.dir * 20, this.cy, ['#b672f0', '#ffffff'], 2, { spread: 1.2, grav: 0, life: 16 });
            if (this.x < 4 || this.x + this.w > mapW() - 4) this.stateT = 96;
          }
          if (this.stateT >= 96) { this.restT = 120; this.setState('rest'); }
          break;
        }
        case 'eternalnight': {   // 必殺「永夜」：全暗 + 三個方向的衝擊波
          this.wingHigh();
          if (this.stateT === 1) {
            this.nightT = 300;
            V('letterbox', 320); V('shake', 8); V('flash', '#000000', 10, 0.9);
            banner('永夜', 'ETERNAL NIGHT', '#ff4a86');
            sfx('ultimate', 'charge'); music('nightmare2');
            this.startNight(300);
          }
          if (this.stateT > 4 && this.stateT < 290) {
            // 三個方向的衝擊波：左、右（貼地）、上（從天而降的羽刃）
            if (this.stateT % 76 === 30) {
              const gy = groundY(this.cx, this.cy);
              KB.spawn(new KB.Shockwave(20, gy, 1, { speed: 2.1, life: 220, dmg: 1, color: '#7ce4ff' }));
              KB.spawn(new KB.Shockwave(mapW() - 20, gy, -1, { speed: 2.1, life: 220, dmg: 1, color: '#7ce4ff' }));
              sfx('stomp', 'hammer'); V('shake', 4);
            }
            if (this.stateT % 76 === 56) {
              const px = clamp(p.cx, 20, mapW() - 20);
              KB.shoot({
                spr: 'proj_feather', x: px, y: Math.max(10, this.cy + 10), vx: 0, vy: 3.4, dmg: 1, owner: 'enemy',
                life: 200, w: 10, h: 14, grav: 0.04, solid: true, type: 'shadow', trail: '#ff4a86', fxHit: 'fx_hit', breakBlocks: false,
              });
              sfx('cutter');
            }
            if (this.stateT % 10 === 0) KB.particles(p.cx + (this.rng() - 0.5) * 60, p.cy - 40, ['#b672f0'], 1, { spread: 0.4, grav: 0, life: 20, up: -0.4, size: 1 });
          }
          if (this.stateT === 296) { this.endNight(); this.glow = 0; V('flash', '#ffffff', 8, 0.6); sfx('unlock', 'item'); }
          if (this.stateT > 320) { this.restT = 140; this.setState('rest'); }
          break;
        }
        case 'rest': {           // 低空喘息（玩家的攻擊窗）
          this.hoverTo(this.floor - 14, 0.12);
          this.x += clamp((p.cx - this.cx) * 0.01, -0.5, 0.5);
          this.facePlayer();
          if (--this.restT <= 0) this.setState('idle');
          break;
        }

        case 'hurt':
          this.vx *= 0.86;
          if (this.stateT > this.iv(14)) this.setState('idle');
          break;
        case 'land':
          this.vx *= 0.7;
          if (this.stateT > this.iv(24)) this.setState('idle');
          break;
      }
    }
    // 三階段：停在畫面上方（背景化）
    wingHigh() {
      const cam = KB.game ? KB.game.cam : { y: 0 };
      const ty = Math.max(cam.y + 54, this.floor - 120);
      this.hoverTo(ty, 0.06);
      this.vx = 0;
    }
    wingIdle() {
      this.wingHigh();
      const p = this.player;
      if (p) this.x += clamp((p.cx - this.cx) * 0.02, -1.1, 1.1);
      this.facePlayer();
    }

    update(dt) {
      super.update(dt);
      // 三階段的巨翼不吃物理，但要夾在地圖內
      if (!this.solid) this.x = clamp(this.x, 4, mapW() - this.w - 4);
      if (this.phase === 3 && this.state !== 'eternalnight' && this.nightT > 0) { this.nightT = 0; this.endNight(); }
    }

    onDeath() {
      this.endNight();
      this.dismissEaters();
      // 光芒四射
      V('hitstop', 16); V('flash', '#ffffff', 26, 0.95); V('shake', 10); V('letterbox', 150);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        V('beam', this.cx, this.cy, a, 150, { width: 6, color: i % 2 ? '#ffd85c' : '#ffffff', frames: 70, taper: true });
      }
      V('ring', this.cx, this.cy, { r0: 4, r1: 96, frames: 40, color: '#ffd85c', width: 4 });
      V('ring', this.cx, this.cy, { r0: 4, r1: 150, frames: 60, color: '#ffffff', width: 2 });
      KB.particles(this.cx, this.cy, ['#ffffff', '#ffd85c', '#b672f0', '#7ce4ff'], 60, { spread: 4.4, grav: -0.03, life: 90 });
      banner('夢醒了', 'TRUE END', '#ffd85c');
      for (const e of (KB.game ? KB.game.entities : [])) if (!e.dead && e.type === 'proj' && e.owner === 'enemy') e.dead = true;
      try { KB.session = KB.session || {}; KB.session.trueEnd = true; } catch (e) { }
      music('trueend');
    }

    // ---------- 繪製 ----------
    body(g, spr, o) {
      this.ensureExtra();
      if (this.hidden) return;
      o = this.sprOpts(o || {});
      if (!KB.has(spr)) g.rect(this.x, this.y, this.w, this.h, (this.flash > 0 && (this.flash & 2)) ? '#ffffff' : this.color);
      g.spr(spr, this.cx + (o.ox || 0), this.bottom + (o.oy || 0), o);
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(255,128,0,0.3)');
    }
    drawShards(g) {
      if (this.phase !== 1) return;
      for (const s of this.shards) {
        if (!s.alive) continue;
        const pos = this.shardPos(s);
        const o = { t: this.t, rot: this.orbit * 1.6 + s.a, frame: s.hp <= s.maxHp / 2 ? 1 : 0 };
        if (s.flash > 0 && (s.flash & 2)) o.tint = '#ffffff';
        g.spr('nm_shard', pos.x, pos.y + 6, o);
      }
      // 護盾環（還有碎片時）
      if (this.shieldUp) {
        const a = 0.18 + 0.08 * Math.sin(this.t * 5);
        for (let k = 0; k < 36; k++) {
          const ang = k / 36 * Math.PI * 2 + this.orbit * 0.4;
          g.rect(this.cx + Math.cos(ang) * 34 - 1, this.cy + Math.sin(ang) * 20 - 1, 2, 2,
            'rgba(255,216,92,' + (a + (k % 4 < 2 ? 0.1 : 0)).toFixed(2) + ')');
        }
      }
    }
    draw(g) {
      if (this.introducing) { this.drawIntro(g); return; }
      if (this.hidden) return;
      // 羽毛雨的安全區光環
      if (this.state === 'featherrain' && this.stateT < 190) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
        for (const sx of this.safeX) {
          const gy = groundY(sx, this.cy) - 2;
          for (let k = 0; k < 46; k++) {
            const a = k / 46 * Math.PI * 2;
            g.rect(sx + Math.cos(a) * 24 - 1, gy + Math.sin(a) * 7 - 1, 2, 2, (k + Math.floor(this.t * 12)) % 4 < 2 ? '#ffd85c' : '#ffffff');
          }
          const hh = 46 + pulse * 8;
          g.rect(sx - 24, gy - hh, 2, hh, 'rgba(255,216,92,0.30)');
          g.rect(sx + 22, gy - hh, 2, hh, 'rgba(255,216,92,0.30)');
          g.rect(sx - 22, gy - hh, 44, 2, 'rgba(255,255,255,' + (0.2 + pulse * 0.25).toFixed(2) + ')');
        }
      }
      let spr, o = {};
      if (this.phase === 1) {
        spr = 'nightmarecore_idle';
        if (this.hurtT > 0 || this.state === 'hurt') spr = 'nightmarecore_hurt';
        else if (this.bareT > 0) spr = 'nightmarecore_bare';
        else if (this.state === 'fan' || this.state === 'summon') spr = 'nightmarecore_attack';
        if (this.state === 'morph') o.alpha = 0.4 + 0.35 * Math.sin(this.t * 14);
      } else if (this.phase === 2) {
        spr = 'nightknight_idle';
        if (this.hurtT > 0 || this.state === 'hurt') spr = 'nightknight_hurt';
        else if (this.state === 'slash3' || this.state === 'warpslash') { spr = 'nightknight_attack'; o.frame = this.stateT < 14 ? 0 : this.stateT < 26 ? 1 : 2; }
        else if (this.state === 'phantom' || this.state === 'voidhole') spr = 'nightknight_cape';
        if (this.state === 'morph') o.alpha = 0.4 + 0.35 * Math.sin(this.t * 14);
      } else {
        spr = 'nmwing_idle';
        if (this.hurtT > 0 || this.state === 'hurt') spr = 'nmwing_hurt';
        else if (this.state === 'dive') spr = 'nmwing_dive';
        else if (this.state === 'featherrain' || this.state === 'eternalnight') spr = 'nmwing_attack';
      }
      // 常駐夢紫光暈（深色身體在夢境背景前才看得出位置）
      if (KB.VFX && KB.VFX.aura && !this.hidden) {
        if (!this.auraFx || this.auraFx.dead) // 半徑要比本體大：aura 畫的是 3 圈「描邊圓環」，半徑太小會直接壓在身上變成一團光暈
        this.auraFx = KB.VFX.aura(this, { r: this.phase === 3 ? 38 : 22, color: '#b672f0', frames: 120, pulse: Math.PI / 24 });
        else if (this.auraFx.t >= 60) this.auraFx.t -= 48;
      }
      if (this.phase === 1) this.drawShards(g);
      this.body(g, spr, o);
      // 二 / 三階段的怒氣色調（基底的 phase===2 自動染色被 body() 取代，這裡自己畫）
      if (this.phase >= 2 && !o.tint) {
        const a = (this.phase === 3 ? 0.20 : 0.13) + 0.07 * Math.sin(this.t * 7);
        const ro = Object.assign({}, this.sprOpts({}), { tint: this.rageColor, alpha: a });
        if (o.frame !== undefined) ro.frame = o.frame;
        g.spr(spr, this.cx, this.bottom, ro);
      }
    }
  }
  KB.BOSSES.nightmarecore = NightmareCore;
  KB.NIGHTMARE_PHASE_HP = PHASE_HP;
  KB.NIGHTMARE_PHANTOMS = PHANTOMS;
})();
