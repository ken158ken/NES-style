// 魔法系能力：mage 元素法師 / time 時間 / gravity 重力 / clone 分身（Round 5 變身大爆發）
// 介面與 src/abilities.js 相同：KB.ABILITIES[key] = { duration, hold, maxHold, lockMove, fps, onAttack, update, onEnd, onLose ... }
// 特效一律透過 V('xxx', ...) 呼叫 KB.VFX（vfx agent 實作中，未載入時自動略過，另有像素圖 / 粒子備援）。
(function () {
  'use strict';
  KB.ABILITIES = KB.ABILITIES || {};
  const P = KB.PHYS, T = KB.TILE;

  // ---------- 蓄力必殺的門檻（fix5b / R5-P1-03）----------
  // 這些數字就是招式表 / 圖鑑上寫給玩家看的「按住 N 幀放開」，
  // **從按下攻擊鍵的那一幀算起**。各招內部的計數器起點不同（有的要等收招動作演完才開始加），
  // 所以下面使用時會扣掉各自的偏移量；改數字時只改這裡，招式表文案也用同一個值。
  // 驗證：tools/test_magic.py 的「蓄力門檻」段（按住 N+2 幀觸發、N-6 幀不觸發）。
  const MAGIC_ULT = 60;   // mage 元素風暴 / gravity 奇點 / clone 百裂分身（招式表：按住 60 幀放開）
  // fix6：Lv3 蓄力時間 ×0.8（KB.PROG.holdMul）。招式表上的數字一律是 **Lv1** 的門檻，
  //   能力練到 Lv3 之後同一招會提早 20% 蓄滿（KB.PROG 未載入時回傳原值，行為完全不變）。
  //   mage / gravity / clone 共用 MAGIC_ULT，所以 key 直接讀 p.ability。
  const HOLD = (key, n) => (KB.PROG && KB.PROG.holdMul) ? Math.max(4, Math.round(n * KB.PROG.holdMul(key))) : n;


  // ---------- 共用工具 ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const data = p => p.abilityData || (p.abilityData = {});
  const down = k => KB.input.down(k);
  const shake = n => { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); };
  // 音效：audio5 尚未加入的新音效名自動退回既有音效
  function sfx(name, fallback) {
    try {
      const A = KB.audio; if (!A || !A.sfx) return;
      if (A.SFX_NAMES && A.SFX_NAMES.indexOf(name) < 0) { if (fallback) A.sfx(fallback); return; }
      A.sfx(name);
    } catch (e) { }
  }
  // KB.VFX 防呆呼叫
  function V(fn) {
    try {
      if (!KB.VFX || typeof KB.VFX[fn] !== 'function') return null;
      return KB.VFX[fn].apply(KB.VFX, Array.prototype.slice.call(arguments, 1));
    } catch (e) { return null; }
  }
  const beat = b => { if (b && !b.dead) b.life = 3; };
  const light = r => { const g = KB.game; if (g) { g.lightR = r; g.lightT = 180; g.lightF = g.frame; } };
  const slowFall = (p, v) => { if (!p.onGround && p.vy > v) p.vy = v; };
  function killBox(p) {
    const d = data(p);
    if (d.box) { d.box.dead = true; d.box = null; }
    if (d.box2) { d.box2.dead = true; d.box2 = null; }
  }
  function restartAttack(p) { p.setState('idle'); p.startAttack(); }
  function startMove(p, m) { data(p).next = m; restartAttack(p); }

  // ---------- Round 9：出招方向 / 優先序 ----------
  // player-input 會在 startAttack 當幀寫入 `p.atkDir = { up, down, air }`（KB.input 的快照）；
  // 舊版 player.js 沒有這個欄位時自動退回即時輸入，行為與 Round 5 相同。
  function atkDir(p) {
    const a = p.atkDir;
    return {
      up: a ? !!a.up : down('up'),
      down: a ? !!a.down : down('down'),
      air: a ? !!a.air : !p.onGround,
    };
  }
  /**
   * 招式優先序（Round 9 約定）：排隊的招 > ↑X > ↓X > 空中 X > X。
   * o = { up, down, air, ground, airUp, airDown }；airUp / airDown 是「空中專用變體」，
   * 沒填就沿用地面版（判定框位置跟著卡比走）。
   */
  function pickMode(p, o) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    const a = atkDir(p);
    if (a.up && o.up) return (a.air && o.airUp) || o.up;
    if (a.down && o.down) return (a.air && o.airDown) || o.down;
    if (a.air && o.air) return o.air;
    return o.ground;
  }
  /**
   * 空中出招的緩降：最多 lim 幀（預設 28 < 30 幀上限），之後恢復自然重力 —— 保證「空中出招仍會下墜」。
   * def.hover 的能力（重力浮空 / 龍化飛行）不套用這裡。
   */
  function airSlow(p, d, v, lim) {
    if (p.onGround) return;
    if (d.t <= (lim === undefined ? 28 : lim)) slowFall(p, v);
  }
  function setup(p, o) {
    const D = p.abilityDef;
    D.anim = o.anim || null; D.maxHold = o.maxHold || 0;
    p.attackTimer = o.dur; p.attackFps = o.fps || 10;
    p.attackLock = o.lock !== false;
  }
  const clearAnim = p => { const D = p.abilityDef; if (D) { D.anim = null; D.maxHold = D.maxHold0 || 0; } };

  const ents = () => (KB.game ? KB.game.entities : []);
  const isFoe = e => !e.dead && (e.type === 'enemy' || e.type === 'boss');
  const isFoeProj = e => !e.dead && e.type === 'proj' && e.owner === 'enemy';
  function nearestFoe(x, y, r) {
    let best = null, bd = r * r;
    for (const e of ents()) {
      if (!isFoe(e) || e.beingInhaled) continue;
      if (e.type === 'enemy' && e.active === false) continue;
      const dx = e.cx - x, dy = e.cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // 全畫面判定框（必殺用）
  function screenHit(kind, dmg, life) {
    if (!KB.game) return null;
    const c = KB.game.cam;
    return KB.hitbox({ x: c.x - 8, y: c.y - 8, w: KB.W + 16, h: KB.VIEW_H + 16, dmg: dmg, owner: 'player', type: kind,
      life: life || 10, rehit: 0, pierce: true, knock: 2, breakBlocks: false });
  }
  // 爆炸：判定框 + 粒子 + 環
  function boom(x, y, o) {
    o = o || {};
    const r = o.r || 30;
    KB.hitbox({ x: x - r / 2, y: y - r / 2, w: r, h: r, dmg: o.dmg === undefined ? 4 : o.dmg, owner: 'player', type: o.kind || 'fire',
      life: o.life || 8, rehit: 0, pierce: true, knock: o.knock === undefined ? 2 : o.knock, breakBlocks: o.breakBlocks !== false });
    const cols = o.colors || ['#ffe040', '#ff9020', '#ff4010', '#ffffff'];
    KB.particles(x, y, cols, o.n || 14, { spread: o.spread || 2.6, grav: 0.02, life: 22, up: 0.2 });
    KB.fx('fx_hit', x, y);
    V('ring', x, y, { r0: 4, r1: r, frames: 14, color: cols[0], width: 2 });
    V('burst', x, y, { n: 14, colors: cols, speed: 2.4, life: 22, size: 2 });
    V('shockwave', x, y, { dir: 1, speed: 3.2 }); V('shockwave', x, y, { dir: -1, speed: 3.2 });
    shake(o.shake === undefined ? 4 : o.shake);
  }

  // ---------- 每幀計時器（招式結束後仍需持續的效果） ----------
  // 注意：所有效果都必須是「每幀重新施加」而非一次性改寫玩家屬性，
  //       這樣切換房間 / 死亡時計時器被清掉也不會留下殘留狀態。
  class Ticker extends KB.Entity {
    constructor(p, o) {
      super(p.x, p.y);
      this.type = 'fx'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 1; this.h = 1; this.z = o.z || 7;
      this.p = p; this.life = o.life; this.fn = o.fn; this.endFn = o.end; this.drawFn = o.draw;
      this.key = o.key; this.tag = o.tag || ''; this.name = 'magic_' + (o.tag || 'ticker'); this.tick = 0;
    }
    update(dt) {
      this.baseUpdate(dt);
      const p = this.p;
      if (!p || p.dead || p.state === 'dead' || (this.key && p.ability !== this.key)) { this.finish(); return; }
      this.tick++; this.life--;
      if (this.fn) this.fn(p, this);
      if (this.life <= 0) this.finish();
    }
    finish() { if (this.dead) return; this.dead = true; if (this.endFn) this.endFn(this.p, this); }
    draw(g) { if (this.drawFn) this.drawFn(g, this); }
  }
  KB.MagicTicker = Ticker;
  function tick(p, tag, o) {
    const d = data(p);
    d.tickers = (d.tickers || []).filter(t => !t.dead);
    for (const t of d.tickers) if (t.tag === tag) t.finish();
    d.tickers = d.tickers.filter(t => !t.dead);
    const t = KB.spawn(new Ticker(p, Object.assign({ tag: tag, key: p.ability }, o)));
    d.tickers.push(t);
    return t;
  }
  // GameScene.loadRoom 換房時是直接 `entities = []`，被丟掉的 Ticker 不會被標成 dead，
  // 所以「還活著嗎」一定要連同「還在目前房間的實體表裡嗎」一起判斷（fix5）。
  function tickerAlive(t) { return !!t && !t.dead && ents().indexOf(t) >= 0; }
  function killTickers(p) {
    const d = data(p);
    for (const t of (d.tickers || [])) t.finish();
    d.tickers = [];
  }

  // ---------- 殘影（回溯 / 分身衝鋒共用） ----------
  class Ghost extends KB.Entity {
    constructor(x, y, o) {
      super(x, y); o = o || {};
      this.type = 'fx'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 14; this.h = 15; this.z = 2;
      this.spr = o.spr || 'kirby_idle'; this.life = o.life || 16; this.life0 = this.life;
      this.alpha = o.alpha === undefined ? 0.55 : o.alpha; this.tint = o.tint; this.dir = o.dir || 1;
      this.vx = o.vx || 0; this.vy = o.vy || 0; this.name = 'ghost'; this.frame = o.frame || 0;
    }
    update(dt) { this.baseUpdate(dt); this.x += this.vx; this.y += this.vy; this.life--; if (this.life <= 0) this.dead = true; }
    draw(g) {
      g.spr(this.spr, this.cx, this.bottom, { frame: this.frame, flip: this.dir < 0, alpha: this.alpha * Math.max(0.15, this.life / this.life0), tint: this.tint });
    }
  }
  KB.MagicGhost = Ghost;
  const ghost = (x, y, o) => KB.spawn(new Ghost(x - 7, y - 15, o));

  // ---------- 註冊 ----------
  const def = (key, o) => {
    o.key = key;
    KB.ABILITY_NAMES[key] = o.name = o.name || key;
    KB.ABILITY_HUD[key] = o.hudName = o.hudName || key.toUpperCase();
    o.hat = o.hat || ('hat_' + key); o.icon = o.icon || ('ui_ability_' + key);
    o.maxHold0 = o.maxHold || 0;
    KB.ABILITIES[key] = o;
    if (KB.ABILITY_KEYS.indexOf(key) < 0) KB.ABILITY_KEYS.push(key);
    return o;
  };

  // ======================================================================
  // 1. mage 元素法師（尖帽 + 法杖）
  //    X       火球      ：拋物線飛行，命中 / 落地爆炸（範圍 30px，dmg 4）
  //    ↑+X     冰牆      ：前方生成 3 格高冰牆（240 幀，可站上去、擋投射物，火焰可融）；空中＝腳邊「冰階」
  //    ↓+X     雷擊召喚  ：前方 48px 畫魔法陣，30 幀後天雷三連（每發 dmg 3）；空中一樣打到地面
  //    空中 X  風刃三連  ：三道穿透風刃（dmg 2）
  //    按住 60 幀放開 必殺：元素風暴（火 / 冰 / 雷 三波全畫面，每波 dmg 4）
  // ======================================================================
  class IceWall extends KB.Entity {
    constructor(p) {
      super(0, 0);
      this.type = 'fx'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 1; this.h = 1; this.z = 0;
      this.name = 'icewall'; this.life = 240; this.tiles = [];
      const map = KB.game.map;
      const tx = Math.floor((p.cx + p.dir * 20) / T), by = Math.floor((p.bottom - 1) / T);
      for (let i = 0; i < 3; i++) {
        const ty = by - i, ch = map.get(tx, ty);
        if (ch === '.' || ch === undefined) { map.set(tx, ty, 'I'); this.tiles.push([tx, ty]); }
      }
      this.x = tx * T; this.y = (by - 2) * T; this.w = T; this.h = T * 3;
      this.cxp = tx * T + T / 2; this.cyp = (by - 1) * T + T / 2;
      KB.fx('fx_icewall', this.cxp, this.cyp);
      for (let i = 0; i < 3; i++) KB.particles(this.cxp, (by - i) * T + 8, ['#ffffff', '#c0f0ff', '#80d0ff'], 6, { spread: 1.6, grav: 0.04, life: 20, up: 0.6 });
      V('ring', this.cxp, this.cyp, { r0: 4, r1: 28, frames: 14, color: '#c0f0ff', width: 2 });
      V('lightning', this.cxp, (by - 2) * T, this.cxp, (by + 1) * T, { color: '#ffffff', frames: 8, jitter: 3 });
      shake(3);
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--;
      if (!KB.game || this.life <= 0) { this.restore(); return; }
      if (this.life % 14 === 0) KB.particles(this.cxp + rnd(-7, 7), this.cyp + rnd(-22, 22), ['#ffffff', '#c0f0ff'], 1, { spread: 0.3, grav: 0, life: 14, up: 0.2, size: 1 });
    }
    restore() {
      if (this.dead) return;
      this.dead = true;
      const map = KB.game && KB.game.map; if (!map) return;
      for (const [tx, ty] of this.tiles) if (map.get(tx, ty) === 'I') map.set(tx, ty, '.');
      KB.particles(this.cxp, this.cyp, ['#ffffff', '#c0f0ff'], 10, { spread: 2, grav: 0.06, life: 18 });
    }
    draw(g) { }
  }
  KB.MageIceWall = IceWall;

  // 雷擊召喚：魔法陣 → 30 幀後三連天雷
  class ThunderCall extends KB.Entity {
    constructor(x, groundY) {
      super(x - 12, groundY - 8);
      this.type = 'fx'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 24; this.h = 8; this.z = 7;
      this.name = 'thundercall'; this.age = 0; this.life = 90; this.gy = groundY; this.x0 = x; this.strikes = 0; this.boltT = 0; this.bolt = [];
      V('circle', x, groundY - 4, { r: 26, frames: 78, color: '#a860f0', spin: 0.08, glyphs: 10 });
      sfx('magic_circle', 'beam');
    }
    update(dt) {
      this.baseUpdate(dt);
      this.age++; this.life--;
      if (this.life <= 0 || !KB.game) { this.dead = true; return; }
      if (this.age < 30) {
        if (this.age % 3 === 0) KB.particles(this.x0 + rnd(-22, 22), this.gy - rnd(0, 6), ['#a860f0', '#d8b0ff', '#ffe040'], 1, { spread: 0.3, grav: -0.04, life: 16, up: 0.5, size: 1 });
      } else if (this.age === 30 || this.age === 40 || this.age === 50) {
        this.strike();
      }
      if (this.boltT > 0) this.boltT--;
    }
    strike() {
      this.strikes++;
      const top = this.gy - 120;
      KB.hitbox({ x: this.x0 - 12, y: top, w: 24, h: 132, dmg: 3, owner: 'player', type: 'spark', life: 7, rehit: 0, pierce: true, knock: 2, breakBlocks: true });
      V('lightning', this.x0, top, this.x0, this.gy, { color: '#c0f0ff', frames: 10, jitter: 7, branches: 3 });
      V('flash', '#ffffff', 4);
      KB.particles(this.x0, this.gy - 6, ['#ffffff', '#c0f0ff', '#80d0ff'], 12, { spread: 2.4, grav: 0.05, life: 20, up: 0.8 });
      KB.fx('fx_hit', this.x0, this.gy - 8);
      // 備援閃電折線
      this.bolt = [];
      let y = top;
      while (y < this.gy) { this.bolt.push([this.x0 + rnd(-6, 6), y]); y += 10; }
      this.bolt.push([this.x0, this.gy]);
      this.boltT = 7;
      light(96); shake(4);
      sfx('thunder', 'spark');
    }
    draw(g) {
      // 魔法陣（VFX.circle 不在時的備援）
      if (this.age < 32) {
        const a = this.age * 0.14, n = 12;
        for (let i = 0; i < n; i++) {
          const t = a + i * Math.PI * 2 / n;
          g.rect(this.x0 + Math.cos(t) * 24 - 1, this.gy - 4 + Math.sin(t) * 9 - 1, 2, 2, i % 3 === 0 ? '#ffe040' : '#a860f0');
        }
      }
      if (this.boltT > 0) {
        for (let i = 1; i < this.bolt.length; i++) {
          g.line(this.bolt[i - 1][0], this.bolt[i - 1][1], this.bolt[i][0], this.bolt[i][1], (this.boltT & 1) ? '#ffffff' : '#c0f0ff', 3);
        }
      }
    }
  }
  KB.MageThunder = ThunderCall;

  function groundBelow(x, y) {
    const map = KB.game.map;
    for (let ty = Math.floor(y / T); ty < map.h; ty++) {
      const ch = map.get(Math.floor(x / T), ty);
      if (ch && ch !== '.' && ch !== '~' && ch !== 'H' && KB.TileMap.isGround(ch)) return ty * T;
    }
    return Math.min(y + 96, map.h * T);
  }

  def('mage', {
    name: '元素法師', hudName: 'MAGE', color: '#a860f0',
    duration: 22, hold: true, maxHold: 0, lockMove: true, canJump: false, fps: 10,
    desc: '戴上星辰尖帽、握住元素法杖，火冰雷風任你差遣；蓄滿魔力還能喚來元素風暴。',
    flavour: ['尖帽一戴，指尖就有火星。', '火冰雷風，想要哪個都行。'],
    moves: [['X', '火球（爆炸）'], ['↑+X', '冰牆（空中＝冰階）'], ['↓+X', '雷擊召喚'], ['空中 X', '風刃三連'], ['按住 60 幀放開', '必殺：元素風暴']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'bolt'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.t = 0; d.shot = false; d.charged = false; d.wave = 0; d.winds = 0;
      d.mode = pickMode(p, { up: 'wall', down: 'bolt', air: 'wind', ground: 'fire' });
      if (d.mode === 'wall') {
        setup(p, { anim: 'kirby_attack_mage_wall', dur: 26, fps: 10, lock: true });
        if (d.wall && !d.wall.dead) d.wall.restore();
        d.wall = KB.spawn(new IceWall(p));
        sfx('icewall', 'ice');
        // Round 9：冰牆是從地面「刺」出來的 —— 牆的位置本身就有一道冰屬性判定（dmg 3）
        KB.hitbox({ x: d.wall.x - 4, y: d.wall.y, w: T + 8, h: T * 3, dmg: 3, owner: 'player', type: 'ice',
          life: 10, rehit: 0, pierce: true, knock: 1.5, breakBlocks: false });
        // 空中變體「冰階」：冰牆蓋在腳邊高度，緩降 28 幀方便踩上去（之後照常下墜）
        if (!p.onGround) {
          slowFall(p, 0.4);
          V('textPop', p.cx, p.y - 14, '冰階', { color: '#c0f0ff', frames: 34 });
        }
      } else if (d.mode === 'bolt') {
        setup(p, { anim: 'kirby_attack_mage_bolt', dur: 34, fps: 10, lock: true });
        const x = p.cx + p.dir * 48;
        KB.spawn(new ThunderCall(x, groundBelow(x, p.cy)));
      } else if (d.mode === 'wind') {
        setup(p, { anim: 'kirby_attack_mage_wind', dur: 30, fps: 14, lock: false });
        slowFall(p, 0.5);
      } else if (d.mode === 'storm') {
        setup(p, { anim: 'kirby_attack_mage_storm', dur: 150, fps: 12, lock: true });
        V('letterbox', 150);
        V('zoom', 1.12, 40);
        V('circle', p.cx, p.cy + 6, { r: 60, frames: 150, color: '#a860f0', spin: 0.06, glyphs: 10 });
        V('textPop', p.cx, p.y - 18, '元素風暴', { color: '#ffe040', frames: 70 });
        V('aura', p, { color: '#d8b0ff', r: 26, frames: 150 });
        sfx('magic_big', 'charge_ready');
        shake(6);
      } else {
        setup(p, { anim: null, dur: 22, fps: 10, lock: true, maxHold: 300 });
        sfx('fireball', 'fire');
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      const D = p.abilityDef;

      if (d.mode === 'wall') {
        airSlow(p, d, 0.5);
        if (d.t < 10) KB.particles(p.cx + p.dir * rnd(10, 24), p.cy + rnd(-10, 10), ['#ffffff', '#c0f0ff'], 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
        return;
      }
      if (d.mode === 'bolt') {
        airSlow(p, d, 0.5);
        if (d.t % 4 === 0) KB.particles(p.cx + p.dir * 8, p.y - 6, ['#a860f0', '#ffe040'], 1, { spread: 0.6, grav: -0.03, life: 14, up: 0.6, size: 1 });
        return;
      }
      if (d.mode === 'wind') {
        slowFall(p, 0.6);
        if ((d.t === 3 || d.t === 11 || d.t === 19) && d.winds < 3) {
          d.winds++;
          const dy = (d.winds - 2) * 0.7;
          KB.shoot({ spr: 'proj_windblade', x: p.cx + p.dir * 12, y: p.cy + dy * 4, vx: p.dir * 3.8, vy: dy * 0.5, dmg: 2, owner: 'player', life: 42,
            w: 14, h: 10, grav: 0, solid: false, pierce: true, type: 'cutter', dir: p.dir, fxHit: 'fx_hit', trail: '#c8f050', knock: 1.2, fps: 14, breakBlocks: true });
          V('slash', p.cx + p.dir * 16, p.cy + dy * 4, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#c8f050', flip: p.dir < 0 });
          sfx('wind', 'cutter');
          KB.particles(p.cx + p.dir * 14, p.cy + dy * 4, ['#c8f050', '#ffffff'], 4, { spread: 1.2, grav: 0, life: 12, up: 0, vx: p.dir * 1.4, size: 1 });
        }
        return;
      }
      if (d.mode === 'storm') {
        p.vx *= 0.7;
        light(110);
        const waves = [[12, 'fire', ['#ffe040', '#ff9020', '#ff4010'], 'fire'], [58, 'ice', ['#ffffff', '#c0f0ff', '#80d0ff'], 'ice'], [104, 'spark', ['#ffffff', '#c0f0ff', '#ffe040'], 'spark']];
        for (const [at, kind, cols, snd] of waves) {
          if (d.t === at) {
            d.wave++;
            screenHit(kind, 4, 14);
            V('worldTint', cols[2], 0.35, 26);
            V('flash', '#ffffff', 5);
            V('shockwave', p.cx, p.bottom, { dir: 1, speed: 4 }); V('shockwave', p.cx, p.bottom, { dir: -1, speed: 4 });
            sfx(snd, 'fire');
            shake(6);
          }
          if (d.t >= at && d.t < at + 26) {
            const cam = KB.game.cam;
            for (let i = 0; i < 4; i++) {
              const x = cam.x + rnd(0, KB.W), y = cam.y + rnd(0, KB.VIEW_H);
              KB.particles(x, y, cols, 2, { spread: 1.6, grav: kind === 'ice' ? 0.05 : -0.03, life: 18, up: 0.2, size: 2 });
              if (i === 0) KB.fx(kind === 'ice' ? 'fx_ice' : kind === 'fire' ? 'fx_fire' : 'fx_spark_field', x, y, { life: 8 });
            }
            if (kind === 'spark' && d.t % 6 === 0) {
              const x = cam.x + rnd(20, KB.W - 20);
              V('lightning', x, cam.y, x, cam.y + KB.VIEW_H, { color: '#c0f0ff', frames: 8, jitter: 8, branches: 2 });
            }
          }
        }
        if (d.t % 5 === 0) KB.particles(p.cx + rnd(-20, 20), p.cy + rnd(-20, 20), ['#a860f0', '#d8b0ff'], 1, { spread: 0.5, grav: 0, life: 14, up: 0.3, size: 1 });
        return;
      }

      // ---- 火球 + 蓄力 ----
      light(56);
      if (d.t === 5 && !d.shot) {
        d.shot = true;
        const pr = KB.shoot({ spr: 'proj_magefire', x: p.cx + p.dir * 13, y: p.cy - 3, vx: p.dir * 3.4, vy: -1.5, dmg: 3, owner: 'player', life: 120,
          w: 10, h: 10, grav: 0.13, solid: true, pierce: false, type: 'fire', dir: p.dir, fxHit: 'fx_fire', trail: '#ff9020', knock: 2, fps: 12, breakBlocks: true });
        pr.onWallCb = q => boom(q.cx, q.cy, { r: 30, dmg: 4, kind: 'fire' });
        pr.onHitCb = (t2, q) => boom(q.cx, q.cy, { r: 30, dmg: 4, kind: 'fire' });
        V('slash', p.cx + p.dir * 14, p.cy - 3, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#ff9020', flip: p.dir < 0 });
        KB.particles(p.cx + p.dir * 13, p.cy - 3, ['#ffe040', '#ff9020'], 6, { spread: 1.4, grav: 0, life: 14, up: 0, vx: p.dir, size: 1 });
        sfx('fireball', 'fire');
      }
      if (d.t >= 18) {
        if (held) {
          D.anim = 'kirby_attack_mage_storm'; p.attackFps = 10;
          if (d.t >= HOLD(p.ability, MAGIC_ULT) - 1) {   // fix5b：實際 = 招式表的 60 幀（原本 >= 60 實測要 61 幀）
            if (!d.charged) { sfx('charge_ready'); V('aura', p, { color: '#d8b0ff', r: 22, frames: 240 }); }
            d.charged = true;
            if (d.t % 3 === 0) KB.particles(p.cx + rnd(-12, 12), p.y + rnd(-6, 10), ['#ffffff', '#a860f0', '#ffe040'], 2, { spread: 1.4, grav: 0, life: 14, up: 0.4, size: 1 });
          } else {
            if (d.t % 8 === 0) sfx('charge');
            if (d.t % 4 === 0) KB.particles(p.cx + p.dir * 10, p.cy - 2, '#a860f0', 1, { spread: 0.8, grav: 0, life: 12, up: 0.2, size: 1 });
          }
          p.vx *= 0.85;
        } else if (d.charged) { startMove(p, 'storm'); return; }
      }
      if (d.t >= 16 && !held && !d.charged && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) {
      killBox(p); clearAnim(p); killTickers(p);
      const d = data(p); if (d.wall && !d.wall.dead) d.wall.restore(); d.wall = null;
    },
  });

  // ======================================================================
  // 2. time 時間（懷錶帽 + 齒輪光環）
  //    X       時間停止  ：180 幀全場凍結（CD 600 幀）；時停中 X 改為近身拳，累積傷害在解除瞬間一次結算
  //    ↑+X     加速      ：120 幀自身移動速度 ×1.8，起手「時震環」dmg 3（Round 9）
  //    ↓+X     慢動作    ：240 幀敵方隔幀更新，起手「時之枷」dmg 3（Round 9）
  //    空中 X  回溯      ：回到 60 幀前的位置（殘影逆放）
  //    ※ Round 9：↑X / ↓X 在空中一樣出得來（優先於空中 X），空中版最多緩降 28 幀後照常下墜
  // ======================================================================
  const TIME_CD = 600;
  // 回溯的冷卻（fix5b）：回溯會把卡比拉回 60 幀前的座標，26 幀就能再放一次 ⇒
  // 空中連按 X 等於「自己把自己釘在原地」（playthrough 機器人每 30 幀按一次攻擊，
  // w1 要跑 32000 幀，其中大半是被自己回溯拉回去的）。冷卻中改成空中近身拳，按下去仍然有反應。
  const TIME_REWIND_CD = 240;

  // 位置歷史（回溯用）：取得能力時開始記錄；以 --ability 直接開場時，第一次攻擊會補開
  function timeHistory(p) {
    const d = data(p);
    if (d.hist && tickerAlive(d.histTicker)) return d.hist;
    d.hist = d.hist || [];
    d.hist.length = 0;                                   // fix5：換房後舊房間的座標不能拿來回溯
    d.histTicker = tick(p, 'hist', {
      life: 1e9, z: 0,
      fn: (pp, t) => {
        d.hist.push([pp.x, pp.y]);
        if (d.hist.length > 140) d.hist.shift();
      },
    });
    return d.hist;
  }

  // ---- 時停中的身體接觸傷害（fix5b / R5-P1-01）----
  // game.js 的「敵人身體接觸 → 玩家」判定不看 timeStopT，所以時停期間被凍結的敵人
  // 既不會移動也不會被推開，卻仍然每隔無敵幀就扣一次血；卡比又只能用 0 傷害的近身拳，
  // 於是「撞到 → 掉能力 → 撿回 → 再撞到」無限循環（playthrough w1 實測掉 25 顆能力星 → 卡在 r0）。
  // 修法：凍結期間把所有敵方的 hurtsPlayer 暫存起來關掉，時間恢復 / 計時器結束時還原。
  function timeFreezeContact() {
    for (const e of ents()) {
      if (!isFoe(e) || !e.hurtsPlayer || e._tsHurt) continue;
      e._tsHurt = true; e.hurtsPlayer = false;
    }
  }
  function timeRestoreContact() {
    for (const e of ents()) if (e._tsHurt) { e._tsHurt = false; e.hurtsPlayer = true; }
  }

  function timeStopResolve(p) {
    // 時停中累積的傷害一次結算 + 連鎖爆開
    let n = 0, delay = 0;
    for (const e of ents()) {
      if (!isFoe(e) || !e._pendDmg) continue;
      const dmg = e._pendDmg; e._pendDmg = 0; n++;
      const x = e.cx, y = e.cy;
      e.invuln = 0;   // 時停期間敵人不更新 → 無敵幀不會遞減，結算前先清掉
      e.hurt(dmg, { cx: p.cx, cy: p.cy, kind: 'time', knock: 2 });
      KB.particles(x, y, ['#ffffff', '#c0f0ff', '#ffe040'], 10 + dmg * 2, { spread: 2.6, grav: 0.02, life: 22 });
      KB.fx('fx_hit', x, y);
      V('burst', x, y, { n: 12, colors: ['#ffffff', '#c0f0ff'], speed: 2.6, life: 20, size: 2 });
      V('textPop', x, y - 10, String(dmg), { color: '#ffe040', frames: 30 });
      V('hitstop', 3);
      delay += 2;
    }
    if (n) { shake(6); V('flash', '#ffffff', 4); sfx('timeresume', 'clear'); }
    return n;
  }

  def('time', {
    name: '時間', hudName: 'TIME', color: '#60d8f8',
    // fix5：canJump 放開（時停演出中也能起跳），近身拳改成不鎖移動 —— 原本每一招都把腳釘住 14~34 幀，
    //       連打時卡比幾乎走不動（playthrough 機器人 w1 r0 要 18753 幀，是 sword 的 10 倍，最後超時卡關）。
    duration: 30, hold: false, maxHold: 0, lockMove: true, canJump: true, fps: 8,
    desc: '懷錶指針一停，世界就跟著停；時停中打出的傷害會在時間恢復的瞬間一起爆開。',
    flavour: ['喀。懷錶的指針停住了。', '接下來的事，等等再算。'],
    moves: [['X', '時間停止（180 幀）'], ['↑+X', '加速＋時震環'], ['↓+X', '慢動作＋時之枷'], ['空中 X', '回溯（60 幀前）'], ['時停中 X', '近身連拳（解除時結算）']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; timeHistory(p); },
    onCrouchAttack(p) { startMove(p, 'slow'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0;
      timeHistory(p);
      const g = KB.game;
      let mode = pickMode(p, { up: 'haste', down: 'slow', air: 'rewind', ground: 'stop' });
      if (mode === 'stop' && g && g.timeStopT > 0) mode = 'punch';
      if (mode === 'rewind' && g && d.rewindAt !== undefined && g.frame - d.rewindAt < TIME_REWIND_CD) {
        mode = 'punch';
        V('textPop', p.cx, p.y - 16, '充能中', { color: '#8090c0', frames: 40 });
      }
      if (mode === 'stop' && g && d.stopAt !== undefined && g.frame - d.stopAt < TIME_CD) {
        // 冷卻中：退回近身拳並提示
        mode = 'punch';
        V('textPop', p.cx, p.y - 16, '充能中', { color: '#8090c0', frames: 40 });
      }
      d.mode = mode;

      if (mode === 'stop') {
        setup(p, { anim: 'kirby_attack_time', dur: 34, fps: 10, lock: true });
        d.stopAt = g ? g.frame : 0;
        if (g) g.timeStopT = 180;
        for (const e of ents()) if (isFoe(e)) e._pendDmg = 0;
        V('flash', '#ffffff', 6);
        V('worldTint', '#8090c0', 0.42, 180);
        V('textPop', p.cx, p.y - 20, '時間停止', { color: '#ffffff', frames: 70 });
        V('circle', p.cx, p.cy, { r: 46, frames: 60, color: '#60d8f8', spin: -0.1, glyphs: 10 });
        V('ring', p.cx, p.cy, { r0: 6, r1: 130, frames: 22, color: '#ffffff', width: 2 });
        V('hitstop', 6);
        V('zoom', 1.08, 26);
        KB.fx('fx_gear', p.cx, p.cy - 20, { life: 50 });
        KB.particles(p.cx, p.cy, ['#ffffff', '#60d8f8', '#c0f0ff'], 22, { spread: 3.2, grav: 0, life: 26 });
        shake(4);
        sfx('timestop', 'charge_ready');
        // 解除瞬間結算
        tick(p, 'stop', {
          life: 260, key: null,
          fn: (pp, t) => {
            const gg = KB.game; if (!gg) { timeRestoreContact(); t.finish(); return; }
            if (gg.timeStopT > 0) {
              timeFreezeContact();   // 新啟動 / 剛進畫面的敵人也要一起關掉接觸傷害
              if (t.tick % 6 === 0) {
                const cam = gg.cam;
                KB.particles(cam.x + rnd(0, KB.W), cam.y + rnd(0, KB.VIEW_H), ['#ffffff', '#8090c0'], 1, { spread: 0.2, grav: 0, life: 20, up: 0, size: 1 });
              }
              if (t.tick % 20 === 0) KB.fx('fx_gear', pp.cx + rnd(-40, 40), pp.cy + rnd(-30, 20), { life: 20, alpha: 0.6 });
            } else { timeRestoreContact(); timeStopResolve(pp); t.finish(); }
          },
          end: () => { timeRestoreContact(); },
        });
        timeFreezeContact();   // tick() 會先結束上一個 stop 計時器（還原），所以要在它之後才凍結
      } else if (mode === 'punch') {
        setup(p, { anim: 'kirby_attack_time_punch', dur: 14, fps: 14, lock: false });
        const stopped = !!(g && g.timeStopT > 0);
        d.box = KB.hitbox({ x: 0, y: 0, w: 20, h: 16, dmg: stopped ? 0 : 3, owner: 'player', type: 'time', follow: p, ox: 4, oy: -2,
          life: 8, rehit: 0, knock: stopped ? 0 : 1.5,
          onHit: (b) => {
            if (!KB.game || KB.game.timeStopT <= 0) return;
            b._pendDmg = (b._pendDmg || 0) + 3;
            V('slash', b.cx, b.cy, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#ffffff', flip: p.dir < 0 });
            KB.particles(b.cx, b.cy, ['#ffffff', '#60d8f8'], 4, { spread: 1.2, grav: 0, life: 10, up: 0, size: 1 });
          },
        });
        V('slash', p.cx + p.dir * 14, p.cy, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#c0f0ff', flip: p.dir < 0 });
        sfx('sword');
      } else if (mode === 'slow') {
        setup(p, { anim: 'kirby_attack_time_slow', dur: 28, fps: 8, lock: true });
        if (g) g.slowMoT = 240;
        V('tint', '#c0a0ff', 0.3, 40);
        V('worldTint', '#b090e8', 0.25, 240);
        V('textPop', p.cx, p.y - 18, '慢動作', { color: '#d8b0ff', frames: 60 });
        V('circle', p.cx, p.cy + 4, { r: 34, frames: 50, color: '#a860f0', spin: 0.04 });
        KB.particles(p.cx, p.cy, ['#d8b0ff', '#a860f0', '#ffffff'], 14, { spread: 2.4, grav: 0, life: 26 });
        KB.fx('fx_gear', p.cx, p.cy - 16, { life: 40 });
        sfx('slowmo', 'charge');
        // Round 9：慢動作本身也是一招 —— 身邊 ±36px 的「時之枷」把敵人的時間直接擰斷（dmg 3）
        d.box = KB.hitbox({ x: p.cx - 36, y: p.cy - 24, w: 72, h: 48, dmg: 3, owner: 'player', type: 'time',
          life: 12, rehit: 0, pierce: true, knock: 1.4, breakBlocks: false });
        V('ring', p.cx, p.cy, { r0: 4, r1: 40, frames: 16, color: '#d8b0ff', width: 2 });
      } else if (mode === 'haste') {
        setup(p, { anim: 'kirby_attack_time_haste', dur: 18, fps: 16, lock: false });
        V('textPop', p.cx, p.y - 18, '加速', { color: '#ffe040', frames: 50 });
        V('aura', p, { color: '#ffe040', r: 18, frames: 120 });
        V('sparkTrail', p, { color: ['#ffe040', '#ffffff'], frames: 120 });
        V('afterimage', p, { color: '#ffe040', frames: 120, alpha: 0.4 });
        sfx('slowmo', 'charge_ready');
        // Round 9：起手的「時震環」—— 加速到旁人看不見的瞬間，周圍 ±28px 被時間亂流刮傷（dmg 3）
        d.box = KB.hitbox({ x: p.cx - 28, y: p.cy - 20, w: 56, h: 40, dmg: 3, owner: 'player', type: 'time',
          life: 10, rehit: 0, pierce: true, knock: 2, breakBlocks: false });
        V('ring', p.cx, p.cy, { r0: 2, r1: 34, frames: 14, color: '#ffe040', width: 2 });
        KB.particles(p.cx, p.cy, ['#ffe040', '#ffffff'], 10, { spread: 2.2, grav: 0, life: 16 });
        tick(p, 'haste', {
          life: 120,
          fn: (pp, t) => {
            // fix5：只放大「輸入速度上限」——把 player.js 的 walk(1.3) 上限換成 run(2.2)（×1.7），
            // 位移與牆壁碰撞完全交給 player.physics()。
            // 舊版是「每幀補上額外位移」，那條路徑不走物理、房間邊界外 isSolidPx 又一律回 false，
            // 所以會把卡比推出地圖（w1 r2 實測 x=6496 / 房寬 1024 → 軟鎖）。
            if (!pp.full) pp.running = true;
            if (pp.clampToRoom) pp.clampToRoom();   // 保險：任何情況都不讓加速把卡比留在房間外
            if (t.tick % 3 === 0) {
              ghost(pp.cx, pp.bottom, { spr: 'kirby_run', dir: pp.dir, alpha: 0.35, life: 10, tint: '#ffe040' });
              KB.particles(pp.cx, pp.bottom - 3, ['#ffe040', '#ffffff'], 1, { spread: 0.5, grav: 0, life: 10, up: 0, size: 1 });
            }
          },
        });
      } else if (mode === 'rewind') {
        setup(p, { anim: 'kirby_attack_time_rewind', dur: 26, fps: 14, lock: true });
        d.rewindAt = g ? g.frame : 0;
        const hist = timeHistory(p);
        const idx = Math.max(0, hist.length - 60);
        const tgt = hist.length > 8 ? hist[idx] : [p.x - p.dir * 42, p.y - 16];
        // 殘影逆放
        for (let i = hist.length - 1; i >= idx; i -= 6) {
          const h = hist[i];
          ghost(h[0] + 7, h[1] + 15, { spr: 'kirby_fall', dir: p.dir, alpha: 0.45, life: 8 + (hist.length - i) / 3, tint: '#60d8f8' });
        }
        KB.particles(p.cx, p.cy, ['#60d8f8', '#ffffff'], 12, { spread: 2.4, grav: 0, life: 20 });
        // Round 9：逆放的殘影會把路徑上的敵人一起「倒帶」掉（dmg 3）——空中 X 也是一招，不只是位移
        const bx0 = Math.min(p.cx, tgt[0] + 7), bx1 = Math.max(p.cx, tgt[0] + 7);
        const by0 = Math.min(p.cy, tgt[1] + 7), by1 = Math.max(p.cy, tgt[1] + 7);
        KB.hitbox({ x: bx0 - 14, y: by0 - 14, w: (bx1 - bx0) + 28, h: (by1 - by0) + 28, dmg: 3, owner: 'player', type: 'time',
          life: 8, rehit: 0, pierce: true, knock: 1.5, breakBlocks: false });
        p.x = tgt[0]; p.y = tgt[1]; p.vx = 0; p.vy = 0;
        if (p.clampToRoom) p.clampToRoom();               // fix5 保險：歷史座標若曾在房間外，回溯不把卡比送出地圖
        hist.length = 0;
        KB.particles(p.cx, p.cy, ['#60d8f8', '#ffffff'], 14, { spread: 2.6, grav: 0, life: 22 });
        V('ring', p.cx, p.cy, { r0: 26, r1: 4, frames: 14, color: '#60d8f8', width: 2 });
        V('circle', p.cx, p.cy, { r: 28, frames: 30, color: '#60d8f8', spin: -0.2 });
        V('textPop', p.cx, p.y - 16, '回溯', { color: '#60d8f8', frames: 40 });
        KB.fx('fx_gear', p.cx, p.cy, { life: 26 });
        sfx('rewind', 'swallow');
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      if (d.mode === 'punch') { if (d.box && !d.box.dead && d.t < 8) beat(d.box); return; }
      if (d.mode === 'stop') {
        p.vx *= 0.7;
        if (d.t % 4 === 0) KB.particles(p.cx + rnd(-16, 16), p.cy + rnd(-16, 16), ['#ffffff', '#60d8f8'], 1, { spread: 0.4, grav: 0, life: 14, up: 0.2, size: 1 });
        return;
      }
      if (d.mode === 'slow') {
        p.vx *= 0.8;
        airSlow(p, d, 0.5);
        if (d.t % 5 === 0) KB.particles(p.cx + rnd(-14, 14), p.cy + rnd(-14, 14), ['#d8b0ff', '#a860f0'], 1, { spread: 0.4, grav: 0, life: 16, up: 0.2, size: 1 });
        return;
      }
      if (d.mode === 'rewind') { airSlow(p, d, 0.3); return; }
      if (d.mode === 'haste') {
        airSlow(p, d, 0.6, 16);
        if (d.t % 2 === 0) KB.particles(p.cx - p.dir * 8, p.cy + rnd(-6, 6), ['#ffe040', '#ffffff'], 1, { spread: 0.5, grav: 0, life: 10, up: 0, size: 1 });
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); data(p).mode = null; },
    onLose(p) { killBox(p); clearAnim(p); killTickers(p); data(p).hist = null; },
  });

  // ======================================================================
  // 3. gravity 重力（黑洞頭盔 + 紫色能量）
  //    X       黑洞      ：前方 48px 生成 90 幀引力點（80px 內敵人 / 敵彈被吸入），結束爆炸
  //    ↑+X     浮空      ：240 幀自由上下飛（重力翻轉的簡化版，見 PROGRESS 跨檔需求）＋起手重力波 dmg 3
  //    ↓+X     反重力    ：範圍內敵人浮起失控 90 幀，±32px 內另有 dmg 2 的重力擠壓
  //    空中 X  隕石      ：上方落下 3 顆隕石，落地衝擊波
  //    按住 60 幀放開 必殺：奇點（全畫面吸引 + 內爆）
  // ======================================================================
  class BlackHole extends KB.Entity {
    constructor(x, y, o) {
      o = o || {};
      super(x - 12, y - 12);
      this.type = 'fx'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 24; this.h = 24; this.z = 5;
      this.name = 'blackhole'; this.life = o.life || 90; this.r = o.r || 80; this.pull = o.pull || 1.9; this.big = !!o.big;
      V('circle', x, y, { r: this.r * 0.6, frames: this.life, color: '#a860f0', spin: 0.16, glyphs: 10 });
      V('ring', x, y, { r0: 2, r1: this.r, frames: 18, color: '#d8b0ff', width: 2 });
      KB.particles(x, y, ['#a860f0', '#d8b0ff', '#ffffff'], 16, { spread: 3, grav: 0, life: 24 });
      shake(3);
      sfx('blackhole', 'beam');
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--;
      if (!KB.game) { this.dead = true; return; }
      const cx = this.cx, cy = this.cy, r = this.r;
      for (const e of ents()) {
        if (e.dead || e === this) continue;
        const foe = isFoe(e), fp = isFoeProj(e);
        if (!foe && !fp) continue;
        if (e.type === 'enemy' && e.active === false) continue;
        const dx = cx - e.cx, dy = cy - e.cy, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > r || dd < 0.5) continue;
        const k = this.pull * (1 - dd / r) + 0.35;
        e.x += dx / dd * k; e.y += dy / dd * k;
        if (e.type === 'enemy') { e.vy = Math.min(e.vy, 0.2); e.onGround = false; }
        if (fp) { e.vx += dx / dd * 0.35; e.vy += dy / dd * 0.35; }
        if (this.t * 60 % 6 < 1) KB.particles(e.cx, e.cy, '#d8b0ff', 1, { spread: 0.3, grav: 0, life: 10, up: 0, size: 1 });
      }
      // 卡比自身也會被輕微吸引
      const p = KB.player;
      if (p && !p.dead) {
        const dx = cx - p.cx, dy = cy - p.cy, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < r && dd > 1) { p.vx += dx / dd * 0.14; if (!p.onGround) p.vy += dy / dd * 0.1; }
      }
      // 吸積盤粒子
      const a = this.t * 60 * 0.3;
      for (let i = 0; i < 2; i++) {
        const ang = a + i * Math.PI, rr = r * 0.55;
        KB.particles(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.7, ['#a860f0', '#d8b0ff'], 1, { spread: 0.2, grav: 0, life: 12, up: 0, size: 1 });
      }
      if (this.t * 60 % 20 < 1) KB.hitbox({ x: cx - 14, y: cy - 14, w: 28, h: 28, dmg: 1, owner: 'player', type: 'gravity', life: 3, rehit: 0, pierce: true, knock: 0, breakBlocks: false });
      if (this.life <= 0) this.explode();
    }
    explode() {
      if (this.dead) return;
      this.dead = true;
      const r = this.big ? 90 : 56;
      KB.hitbox({ x: this.cx - r / 2, y: this.cy - r / 2, w: r, h: r, dmg: this.big ? 8 : 5, owner: 'player', type: 'gravity', life: 10, rehit: 0, pierce: true, knock: 3, breakBlocks: true });
      KB.particles(this.cx, this.cy, ['#a860f0', '#d8b0ff', '#ffffff', '#6028a8'], 26, { spread: 4, grav: 0.02, life: 28 });
      KB.fx('fx_hit', this.cx, this.cy);
      V('ring', this.cx, this.cy, { r0: 4, r1: r, frames: 16, color: '#d8b0ff', width: 3 });
      V('burst', this.cx, this.cy, { n: 24, colors: ['#a860f0', '#d8b0ff', '#ffffff'], speed: 3.4, life: 26, size: 2 });
      V('shockwave', this.cx, this.cy, { dir: 1, speed: 3.6 }); V('shockwave', this.cx, this.cy, { dir: -1, speed: 3.6 });
      V('flash', '#d8b0ff', 3);
      shake(7);
      sfx('blackhole', 'stone');
    }
    draw(g) {
      g.spr('proj_blackhole', this.cx, this.cy, { t: this.t, fps: 14 });
    }
  }
  KB.GravityHole = BlackHole;

  function meteorHit(pr) {
    boom(pr.cx, pr.bottom, { r: 36, dmg: 4, kind: 'fire', colors: ['#ffe040', '#ff9020', '#a860f0'], shake: 5 });
    sfx('meteor', 'stone');
  }

  def('gravity', {
    name: '重力', hudName: 'GRAVITY', color: '#a860f0',
    duration: 24, hold: true, maxHold: 0, lockMove: true, canJump: false, fps: 10,
    // Round 9：`hover` 是「這一招可以懸停」的旗標（player.js updateAttack 每幀讀 def.hover，
    //   true 時把重力交給 def 控制 p.vy）。重力只有 ↑+X 浮空需要，所以在 onAttack 依招式切換，
    //   不能寫死成 true —— 否則隕石 / 黑洞在空中也會不受重力停在原地。
    hover: false,

    desc: '把黑洞戴在頭上的瘋狂發明：吸進來、浮起來、砸下去，最後連空間一起壓成奇點。',
    flavour: ['頭上那顆，是真的黑洞。', '上跟下，由我來決定。'],
    moves: [['X', '黑洞（引力點）'], ['↑+X', '浮空 240 幀＋重力波'], ['↓+X', '反重力（敵人浮空）'], ['空中 X', '隕石三連'], ['按住 60 幀放開', '必殺：奇點']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; },
    onCrouchAttack(p) { startMove(p, 'lift'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.t = 0; d.charged = false; d.meteors = 0; d.done = false;
      d.mode = pickMode(p, { up: 'flip', down: 'lift', air: 'meteor', ground: 'hole' });
      p.abilityDef.hover = (d.mode === 'flip');   // 只有浮空是懸停招（見 def 上方註解）
      if (d.mode === 'lift') {
        setup(p, { anim: 'kirby_attack_gravity_lift', dur: 30, fps: 10, lock: true });
        const targets = [];
        for (const e of ents()) {
          if (!isFoe(e) || (e.type === 'enemy' && e.active === false)) continue;
          if (e.type === 'boss') continue;
          if (Math.abs(e.cx - p.cx) > 72 || Math.abs(e.cy - p.cy) > 56) continue;
          targets.push(e);
          e.vy = -3; e.onGround = false; e._liftT = 90;
          KB.particles(e.cx, e.bottom, ['#a860f0', '#d8b0ff'], 8, { spread: 1.8, grav: -0.04, life: 22, up: 1.2 });
          V('aura', e, { color: '#d8b0ff', r: 14, frames: 90 });
        }
        d.lifted = targets;
        // Round 9：近距離（±32px）的重力擠壓 dmg 2；遠一點的只被拉起來（既有手感不變）
        d.box = KB.hitbox({ x: p.cx - 32, y: p.cy - 28, w: 64, h: 56, dmg: 2, owner: 'player', type: 'gravity',
          life: 10, rehit: 0, pierce: true, knock: 0, breakBlocks: false });
        V('ring', p.cx, p.cy, { r0: 8, r1: 76, frames: 18, color: '#d8b0ff', width: 2 });
        V('textPop', p.cx, p.y - 16, '反重力', { color: '#d8b0ff', frames: 45 });
        shake(3);
        sfx('gravity_lift', 'beam');
        if (targets.length) {
          tick(p, 'lift', {
            life: 90,
            fn: () => {
              for (const e of targets) {
                if (e.dead || !e._liftT) continue;
                e._liftT--;
                e.vx *= 0.5;
                if (e.vy > -0.6) e.vy = -0.6;
                e.onGround = false;
                if (KB.game && KB.game.frame % 6 === 0) KB.particles(e.cx, e.bottom, '#d8b0ff', 1, { spread: 0.3, grav: 0, life: 12, up: 0.6, size: 1 });
              }
            },
            end: () => { for (const e of targets) e._liftT = 0; },
          });
        }
      } else if (d.mode === 'meteor') {
        setup(p, { anim: 'kirby_attack_gravity_meteor', dur: 40, fps: 10, lock: true });
        slowFall(p, 0.2);
        V('textPop', p.cx, p.y - 18, '隕石', { color: '#ff9020', frames: 40 });
        sfx('meteor', 'fire');
      } else if (d.mode === 'flip') {
        setup(p, { anim: 'kirby_attack_gravity_float', dur: 26, fps: 8, lock: false });
        V('worldTint', '#a860f0', 0.16, 240);
        V('aura', p, { color: '#d8b0ff', r: 22, frames: 240 });
        V('sparkTrail', p, { color: ['#d8b0ff', '#a860f0'], frames: 240 });
        V('textPop', p.cx, p.y - 18, '重力翻轉', { color: '#d8b0ff', frames: 60 });
        V('ring', p.cx, p.cy, { r0: 4, r1: 40, frames: 16, color: '#a860f0', width: 2 });
        KB.particles(p.cx, p.cy, ['#a860f0', '#d8b0ff'], 16, { spread: 2.6, grav: -0.05, life: 26, up: 1 });
        sfx('gravity_lift', 'beam');
        // Round 9：起手的重力波 —— 翻轉重力的瞬間，身邊 ±32px 的空間被壓扁（dmg 3）
        d.box = KB.hitbox({ x: p.cx - 32, y: p.cy - 24, w: 64, h: 48, dmg: 3, owner: 'player', type: 'gravity',
          life: 10, rehit: 0, pierce: true, knock: 2.4, breakBlocks: false });
        tick(p, 'flip', {
          life: 240,
          fn: (pp, t) => {
            // 重力反向（自由上下飛）：每幀重新指定速度，切房 / 死亡時不留殘影響
            let v = -0.55;
            if (down('up')) v = -1.9;
            else if (down('down')) v = 1.5;
            // 不要飛出畫面上緣（房間頂端 / 鏡頭上緣各留 4px）
            const topLimit = Math.max(4, (KB.game ? KB.game.cam.y : 0) + 4);
            if (pp.y <= topLimit && v < 0) v = 0.2;
            pp.vy = clamp(v - P.grav, -4, 4);
            if (pp.onGround && v < 0) pp.onGround = false;
            if (t.tick % 4 === 0) KB.particles(pp.cx + rnd(-8, 8), pp.bottom, ['#a860f0', '#d8b0ff'], 1, { spread: 0.4, grav: -0.05, life: 16, up: 0.8, size: 1 });
            if (t.tick % 10 === 0) ghost(pp.cx, pp.bottom, { spr: 'kirby_float', dir: pp.dir, alpha: 0.3, life: 10, tint: '#d8b0ff' });
          },
          end: (pp) => { KB.particles(pp.cx, pp.cy, ['#a860f0', '#d8b0ff'], 10, { spread: 2, grav: 0.05, life: 18 }); },
        });
      } else if (d.mode === 'singularity') {
        setup(p, { anim: 'kirby_attack_gravity_singularity', dur: 140, fps: 12, lock: true });
        V('letterbox', 140);
        V('zoom', 1.18, 60);
        V('worldTint', '#6028a8', 0.4, 140);
        V('circle', p.cx, p.cy, { r: 70, frames: 140, color: '#a860f0', spin: 0.2, glyphs: 10 });
        V('textPop', p.cx, p.y - 20, '奇點', { color: '#d8b0ff', frames: 70 });
        V('aura', p, { color: '#d8b0ff', r: 34, frames: 140 });
        shake(6);
        sfx('magic_big', 'charge_ready');
      } else {
        setup(p, { anim: null, dur: 24, fps: 10, lock: true, maxHold: 300 });
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      const D = p.abilityDef;
      if (d.mode === 'lift') { p.vx *= 0.8; airSlow(p, d, 0.5); return; }
      if (d.mode === 'flip') { slowFall(p, 0.4); return; }   // 浮空本來就是懸停招（def.hover）
      if (d.mode === 'meteor') {
        slowFall(p, 0.4);
        if ((d.t === 4 || d.t === 14 || d.t === 24) && d.meteors < 3) {
          d.meteors++;
          const ox = (d.meteors - 2) * 34 + p.dir * 14;
          const pr = KB.shoot({ spr: 'proj_meteor', x: p.cx + ox, y: p.cy - 104, vx: rnd(-0.4, 0.4), vy: 2.4, dmg: 4, owner: 'player', life: 150,
            w: 10, h: 12, grav: 0.34, solid: true, pierce: false, type: 'fire', dir: 1, fxHit: 'fx_fire', trail: '#ff9020', knock: 2.4, fps: 12, breakBlocks: true });
          pr.onWallCb = q => meteorHit(q);
          pr.onHitCb = (t2, q) => meteorHit(q);
          V('lightning', p.cx + ox, p.cy - 110, p.cx + ox, p.cy - 60, { color: '#ff9020', frames: 6, jitter: 4 });
          KB.particles(p.cx + ox, p.cy - 100, ['#ffe040', '#ff9020'], 6, { spread: 1.4, grav: 0, life: 14, up: 0 });
        }
        return;
      }
      if (d.mode === 'singularity') {
        p.vx *= 0.6;
        light(110);
        // 全畫面吸引
        if (d.t < 100) {
          for (const e of ents()) {
            if (e.dead) continue;
            const foe = isFoe(e) && e.type !== 'boss', fp = isFoeProj(e);
            if (!foe && !fp) continue;
            if (e.type === 'enemy' && e.active === false) continue;
            const dx = p.cx - e.cx, dy = (p.cy - 4) - e.cy, dd = Math.sqrt(dx * dx + dy * dy);
            if (dd < 1 || dd > 200) continue;
            const k = 2.6 * (1 - dd / 200) + 0.5;
            e.x += dx / dd * k; e.y += dy / dd * k;
            if (e.type === 'enemy') { e.onGround = false; e.vy = Math.min(e.vy, 0); }
          }
          if (d.t % 3 === 0) {
            const ang = rnd(0, Math.PI * 2), rr = rnd(60, 110);
            KB.particles(p.cx + Math.cos(ang) * rr, p.cy + Math.sin(ang) * rr, ['#a860f0', '#d8b0ff', '#ffffff'], 2,
              { spread: 0.3, grav: 0, life: 20, up: 0, vx: -Math.cos(ang) * 2.2, vy: -Math.sin(ang) * 2.2, size: 1 });
          }
        }
        if (d.t === 100 && !d.done) {
          d.done = true;
          screenHit('gravity', 6, 14);
          KB.spawn(new BlackHole(p.cx + p.dir * 20, p.cy, { life: 2, r: 120, pull: 3, big: true }));
          V('flash', '#ffffff', 6);
          V('shockwave', p.cx, p.bottom, { dir: 1, speed: 4.4 }); V('shockwave', p.cx, p.bottom, { dir: -1, speed: 4.4 });
          V('zoom', 0.9, 30);
          shake(9);
          sfx('magic_big', 'stone');
        }
        return;
      }
      // ---- 黑洞 + 蓄力 ----
      if (d.t === 6 && !d.done) {
        d.done = true;
        KB.spawn(new BlackHole(p.cx + p.dir * 48, p.cy - 2, { life: 90, r: 80 }));
        V('slash', p.cx + p.dir * 16, p.cy, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#a860f0', flip: p.dir < 0 });
        KB.particles(p.cx + p.dir * 16, p.cy, ['#a860f0', '#d8b0ff'], 6, { spread: 1.2, grav: 0, life: 14, up: 0, vx: p.dir * 1.4, size: 1 });
      }
      if (d.t >= 20) {
        if (held) {
          D.anim = 'kirby_attack_gravity_singularity'; p.attackFps = 10;
          if (d.t >= HOLD(p.ability, MAGIC_ULT) - 1) {   // fix5b：實際 = 招式表的 60 幀（原本 >= 60 實測要 61 幀）
            if (!d.charged) { sfx('charge_ready'); V('aura', p, { color: '#d8b0ff', r: 24, frames: 240 }); }
            d.charged = true;
            if (d.t % 3 === 0) KB.particles(p.cx + rnd(-14, 14), p.cy + rnd(-12, 12), ['#a860f0', '#ffffff'], 2, { spread: 1.2, grav: 0, life: 14, up: 0.2, size: 1 });
          } else {
            if (d.t % 8 === 0) sfx('charge');
            if (d.t % 4 === 0) KB.particles(p.cx, p.y - 4, '#a860f0', 1, { spread: 0.8, grav: 0, life: 12, up: 0.3, size: 1 });
          }
          p.vx *= 0.85;
        } else if (d.charged) { startMove(p, 'singularity'); return; }
      }
      if (d.t >= 18 && !held && !d.charged && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; p.abilityDef.hover = false; },
    onLose(p) { killBox(p); clearAnim(p); killTickers(p); const D = p.abilityDef; if (D) D.hover = false; },
  });

  // ======================================================================
  // 4. clone 分身（雙尾裝飾 + 2 個小卡比 companion）
  //    取得能力時生成 2 個分身（type 'ally'，跟隨後方 20 / 40px，自動朝最近敵人吐小星 dmg 1）
  //    X       全員吐星  ：本體 + 2 分身三道星
  //    ↑+X     分身塔    ：兩個分身疊成柱子頂著卡比往上打（Round 9 新招，26×60 向上判定 dmg 4）
  //    ↓+X     交換位置  ：與前方分身瞬間互換，原地留下星爆 dmg 3（Round 9）
  //    空中 X  分身墊腳  ：踩著分身再跳一次
  //    按住 60 幀放開 必殺：百裂分身（8 道殘影衝鋒）
  // ======================================================================
  class CloneKirby extends KB.Entity {
    constructor(p, idx) {
      super(p.x, p.y);
      this.type = 'ally'; this.owner = 'player'; this.solid = false; this.grav = 0; this.w = 12; this.h = 12; this.z = 2;
      this.p = p; this.idx = idx; this.off = 20 + idx * 20; this.cool = 30 + idx * 20;
      this.name = 'clone'; this.spr = 'kirby_clone'; this.flashT = 0; this.hp = 1; this.maxHp = 1;
      this.inhalable = false; this.hurtsPlayer = false; this.dir = p.dir;
      this.x = p.cx - p.dir * this.off - 6; this.y = p.cy - 6;
      KB.particles(this.cx, this.cy, ['#ffb0d0', '#ffffff'], 10, { spread: 2, grav: 0, life: 18 });
      KB.fx('fx_sparkle', this.cx, this.cy);
    }
    update(dt) {
      this.baseUpdate(dt);
      const p = this.p;
      if (!p || p.dead || p.state === 'dead' || p.ability !== 'clone') { this.vanish(); return; }
      const tx = p.cx - p.dir * this.off, ty = p.cy + Math.sin((this.t * 60 + this.idx * 30) * 0.09) * 2.5;
      this.x += ((tx - this.w / 2) - this.x) * 0.16;
      this.y += ((ty - this.h / 2) - this.y) * 0.16;
      this.dir = p.dir;
      if (this.flashT > 0) this.flashT--;
      if (p.invuln > 0 && p.hurtTimer > 0) this.flashT = 12;
      if (this.cool > 0) this.cool--;
      else {
        const e = nearestFoe(this.cx, this.cy, 96);
        if (e) { this.fire(e.cx, e.cy); this.cool = 45; }
      }
      if (Math.floor(this.t * 60) % 14 === 0) KB.particles(this.cx, this.cy + 4, '#ffd8e8', 1, { spread: 0.3, grav: 0, life: 10, up: 0.2, size: 1 });
    }
    fire(tx, ty) {
      const dx = tx - this.cx, dy = ty - this.cy, d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      KB.shoot({ spr: 'proj_ministar', x: this.cx, y: this.cy, vx: dx / d * 3.2, vy: dy / d * 3.2, dmg: 1, owner: 'player', life: 48,
        w: 8, h: 8, grav: 0, solid: false, pierce: false, type: 'star', dir: dx < 0 ? -1 : 1, fxHit: 'fx_hit', trail: '#ffe040', rotSpeed: 0.3, knock: 1 });
      KB.particles(this.cx, this.cy, ['#ffe040', '#ffffff'], 3, { spread: 0.8, grav: 0, life: 10, up: 0, size: 1 });
      sfx('clone_summon', 'spit');
    }
    shootDir(dir) {
      KB.shoot({ spr: 'proj_ministar', x: this.cx + dir * 6, y: this.cy, vx: dir * 3.6, vy: 0, dmg: 1, owner: 'player', life: 52,
        w: 8, h: 8, grav: 0, solid: false, pierce: false, type: 'star', dir: dir, fxHit: 'fx_hit', trail: '#ffe040', rotSpeed: 0.3 * dir, knock: 1 });
      this.cool = 30;
    }
    vanish() {
      if (this.dead) return;
      this.dead = true;
      KB.particles(this.cx, this.cy, ['#ffb0d0', '#ffffff'], 10, { spread: 2, grav: 0.02, life: 18 });
      KB.fx('fx_poof', this.cx, this.cy + 4);
    }
    draw(g) {
      const o = { t: this.t, flip: this.dir < 0, alpha: 0.92 };
      if (this.flashT > 0 && (this.flashT & 2)) o.tint = '#ffffff';
      g.spr('kirby_clone', this.cx, this.bottom, o);
    }
  }
  KB.CloneKirby = CloneKirby;

  function clones(p) {
    const d = data(p);
    d.clones = (d.clones || []).filter(c => !c.dead);
    return d.clones;
  }
  // 取得能力時生成；以 --ability clone 直接開場（不經 onGet）時，第一次攻擊補生成
  function ensureClones(p) {
    if (!KB.game) return [];
    cloneAir(p);
    const list = clones(p);
    while (list.length < 2) {
      const c = KB.spawn(new CloneKirby(p, list.length));
      list.push(c);
    }
    return list;
  }

  // ---- 墊腳安全閥（fix5）----------------------------------------------
  // 舊版「空中 X 分身墊腳」沒有次數上限：連按 X 就能無限往上疊（實測 y = -8343 → 軟鎖）。
  // 規則改成：① 每次離地只能墊 1 次，落地 / 抓梯子 / 入水才重置；
  //           ② 墊完的總高度不超過「起跳高度 ×2」（＝這一腳最多再給一次跳躍的份量）。
  // player.js 沒有「不分狀態的每幀能力鉤子」，所以用 Ticker（換房時被清掉 → 下次攻擊自動重建，
  // 而換房一定是站在地上，重置本來就該發生）。
  const JUMP_H = (P.jump * P.jump) / (2 * P.grav);   // 一次跳躍的理論高度 ≈ 40px
  function cloneAir(p) {
    const d = data(p);
    if (tickerAlive(d.airTicker)) return d;
    d.stepUsed = 0; d.groundY = p.bottom;
    d.airTicker = tick(p, 'cloneair', {
      life: 1e9, z: 0,
      fn: (pp) => {
        const dd = data(pp);
        const grounded = pp.onGround || pp.state === 'climb' || pp.state === 'swim' || pp.inWater || pp.state === 'ride' || pp.state === 'door';
        if (grounded) {
          dd.stepUsed = 0;
          if (pp.onGround || pp.state === 'climb') dd.groundY = pp.bottom;
        }
      },
    });
    return d;
  }
  /** 這一次墊腳還能往上多少 px（總高度上限 = 起跳高度 ×2） */
  function stepRoom(p) {
    const d = data(p);
    const gy = d.groundY === undefined ? p.bottom : d.groundY;
    return Math.max(0, JUMP_H * 2 - Math.max(0, gy - p.bottom));
  }

  def('clone', {
    name: '分身', hudName: 'CLONE', color: '#ffb0d0',
    duration: 20, hold: true, maxHold: 0, lockMove: true, canJump: false, fps: 12,
    desc: '一人分成三人打：兩個小分身會自動掩護射擊，還能踩著它們二段跳。',
    flavour: ['一個不夠，那就三個。', '兩個小分身，替我打。'],
    moves: [['X', '全員吐星（三道）'], ['↑+X', '分身塔（向上柱擊）'], ['↓+X', '交換位置（留下星爆）'], ['空中 X', '分身墊腳（再跳一次）'], ['按住 60 幀放開', '必殺：百裂分身'], ['被動', '分身自動射擊']],
    hatOffset: { attack: [0, 0] },
    onGet(p) { data(p).t = 0; ensureClones(p); sfx('clone_summon', 'ability'); },
    onCrouchAttack(p) { startMove(p, 'swap'); },
    onAttack(p) {
      const d = data(p); killBox(p);
      d.t = 0; d.charged = false; d.rush = 0; d.done = false;
      const list = ensureClones(p);
      d.mode = pickMode(p, { up: 'tower', down: 'swap', air: 'step', ground: 'star' });
      // 墊腳安全閥：這次滯空已經墊過 / 已經飛到上限高度 → 改成地面招（全員吐星），不會卡住手感也不會無限上升
      if (d.mode === 'step' && (d.stepUsed >= 1 || stepRoom(p) < 6)) d.mode = 'star';
      if (d.mode === 'swap') {
        setup(p, { anim: 'kirby_attack_clone_swap', dur: 20, fps: 12, lock: true });
        const c = list[0];
        if (c && !c.dead) {
          const ox = p.cx, oy = p.cy;
          KB.particles(ox, oy, ['#ffb0d0', '#ffffff', '#ffe040'], 14, { spread: 2.6, grav: 0, life: 20 });
          KB.particles(c.cx, c.cy, ['#ffb0d0', '#ffffff', '#ffe040'], 14, { spread: 2.6, grav: 0, life: 20 });
          V('burst', ox, oy, { n: 14, colors: ['#ffb0d0', '#ffffff'], speed: 2.6, life: 20, size: 2 });
          V('burst', c.cx, c.cy, { n: 14, colors: ['#ffb0d0', '#ffffff'], speed: 2.6, life: 20, size: 2 });
          KB.fx('fx_sparkle', ox, oy); KB.fx('fx_sparkle', c.cx, c.cy);
          ghost(ox, p.bottom, { spr: 'kirby_idle', dir: p.dir, alpha: 0.5, life: 12, tint: '#ffb0d0' });
          const nx = c.cx, ny = c.cy;
          c.x = ox - c.w / 2; c.y = oy - c.h / 2;
          p.x = nx - p.w / 2; p.y = ny - p.h / 2;
          p.vx = 0; p.vy = 0;
          // Round 9：交換不只是位移 —— 卡比離開的位置留下一顆星爆（dmg 3），空中一樣打得到
          KB.hitbox({ x: ox - 16, y: oy - 14, w: 32, h: 28, dmg: 3, owner: 'player', type: 'star',
            life: 10, rehit: 0, pierce: true, knock: 2, breakBlocks: true });
          V('ring', ox, oy, { r0: 2, r1: 30, frames: 14, color: '#ffe040', width: 2 });
          KB.fx('fx_hit', ox, oy);
          V('textPop', p.cx, p.y - 16, '交換', { color: '#ffb0d0', frames: 36 });
          sfx('clone_swap', 'swallow');
        }
      } else if (d.mode === 'tower') {
        // Round 9 新招「分身塔」：兩個分身疊成柱子把卡比頂上去，整根柱子都是判定
        setup(p, { anim: 'kirby_attack_clone_tower', dur: 30, fps: 12, lock: true });
        d.tower = 0;
        p.vx *= 0.3;
        if (!p.onGround) slowFall(p, 0.4);
        d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 60, dmg: 4, owner: 'player', type: 'clone', follow: p,
          ox: -13, oy: -48, life: 26, rehit: 10, pierce: true, knock: 2.2, breakBlocks: true, flipWithOwner: false });
        for (let i = 0; i < list.length; i++) {
          const c = list[i]; if (!c || c.dead) continue;
          c.cool = Math.max(c.cool, 24); c.flashT = 6;
        }
        V('textPop', p.cx, p.y - 22, '分身塔', { color: '#ffb0d0', frames: 40 });
        V('ring', p.cx, p.cy - 20, { r0: 4, r1: 30, frames: 14, color: '#ffb0d0', width: 2 });
        KB.particles(p.cx, p.cy - 10, ['#ffb0d0', '#ffffff', '#ffe040'], 12, { spread: 1.6, grav: -0.05, life: 22, up: 1.4 });
        sfx('clone_summon', 'jump');
        shake(3);
      } else if (d.mode === 'step') {
        setup(p, { anim: 'kirby_attack_clone_step', dur: 20, fps: 12, lock: false });
        const c = list[0];
        d.stepUsed = 1;                                   // 每次離地只能墊 1 次
        const up = Math.min(Math.abs(P.jump) * 0.95, Math.sqrt(2 * P.grav * stepRoom(p)));
        p.vy = -up; p.onGround = false;
        if (c && !c.dead) {
          c.x = p.cx - c.w / 2; c.y = p.bottom - 2; c.cool = Math.max(c.cool, 20); c.flashT = 10;
          KB.particles(p.cx, p.bottom + 4, ['#ffb0d0', '#ffffff'], 10, { spread: 2, grav: 0.05, life: 16, up: 0.6 });
          V('ring', p.cx, p.bottom + 4, { r0: 4, r1: 24, frames: 12, color: '#ffb0d0', width: 2 });
        }
        V('textPop', p.cx, p.y - 14, '墊腳', { color: '#ffe040', frames: 30 });
        // Round 9：被踩的分身會往腳下轟一發（dmg 3 + 一顆向下的小星），空中 X 也有判定
        KB.hitbox({ x: p.cx - 15, y: p.bottom - 4, w: 30, h: 20, dmg: 3, owner: 'player', type: 'star',
          life: 10, rehit: 0, pierce: true, knock: 2, breakBlocks: true });
        KB.shoot({ spr: 'proj_ministar', x: p.cx, y: p.bottom + 6, vx: 0, vy: 3.2, dmg: 2, owner: 'player', life: 36,
          w: 10, h: 10, grav: 0, solid: false, pierce: false, type: 'star', dir: p.dir, fxHit: 'fx_hit', trail: '#ffe040', rotSpeed: -0.3, knock: 1.5 });
        sfx('clone_swap', 'jump');
      } else if (d.mode === 'rush') {
        setup(p, { anim: 'kirby_attack_clone_rush', dur: 90, fps: 16, lock: true });
        V('letterbox', 90);
        V('zoom', 1.1, 30);
        V('textPop', p.cx, p.y - 20, '百裂分身', { color: '#ffb0d0', frames: 60 });
        shake(5);
        sfx('clone_rush', 'charge_ready');
      } else {
        setup(p, { anim: null, dur: 20, fps: 12, lock: true, maxHold: 300 });
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      const D = p.abilityDef;
      const list = clones(p);
      if (d.mode === 'swap') { p.vx *= 0.6; airSlow(p, d, 0.6); return; }
      if (d.mode === 'tower') {
        p.vx *= 0.7;
        airSlow(p, d, 0.5);
        // 分身疊在頭上（每幀重新指定，換房 / 死亡時不會留下奇怪位置）
        for (let i = 0; i < list.length; i++) {
          const c = list[i]; if (c.dead) continue;
          c.x = p.cx - c.w / 2; c.y = p.y - 14 - i * 14;
          c.dir = p.dir;
        }
        beat(d.box);
        if (d.t % 4 === 1) {
          const k = 1 + ((d.t / 4) | 0) % 3;
          KB.particles(p.cx + rnd(-8, 8), p.y - 12 * k, ['#ffffff', '#ffb0d0', '#ffe040'], 2, { spread: 0.8, grav: -0.04, life: 16, up: 1, size: 1 });
          V('slash', p.cx, p.y - 12 * k, 16, -Math.PI / 2, { color: '#ffe040' });
        }
        if (d.t === 6 && !d.tower) {
          d.tower = 1;
          KB.shoot({ spr: 'proj_ministar', x: p.cx, y: p.y - 44, vx: 0, vy: -3.4, dmg: 2, owner: 'player', life: 42,
            w: 10, h: 10, grav: 0, solid: false, pierce: false, type: 'star', dir: p.dir, fxHit: 'fx_hit', trail: '#ffe040', rotSpeed: 0.3, knock: 1.5 });
          sfx('spit');
        }
        return;
      }
      if (d.mode === 'step') { slowFall(p, 1.4); return; }
      if (d.mode === 'rush') {
        p.vx = p.dir * 2.2;
        if (d.t % 10 === 2 && d.rush < 8) {
          d.rush++;
          const ox = p.dir * (10 + d.rush * 6), oy = ((d.rush % 3) - 1) * 10;
          ghost(p.cx + ox, p.bottom + oy, { spr: 'kirby_run', dir: p.dir, alpha: 0.7, life: 14, vx: p.dir * 1.6, tint: d.rush % 2 ? '#ffb0d0' : '#ffffff' });
          KB.hitbox({ x: p.cx + ox - 12, y: p.cy + oy - 12, w: 26, h: 24, dmg: 3, owner: 'player', type: 'clone', life: 8, rehit: 0, pierce: true, knock: 1.6, breakBlocks: true });
          V('slash', p.cx + ox, p.cy + oy, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#ffffff', flip: p.dir < 0 });
          KB.particles(p.cx + ox, p.cy + oy, ['#ffffff', '#ffb0d0'], 6, { spread: 1.6, grav: 0, life: 12, up: 0, size: 1 });
          KB.fx('fx_hit', p.cx + ox, p.cy + oy);
          shake(3);
          sfx('clone_rush', 'sword');
        }
        if (d.t === 70) {
          boom(p.cx + p.dir * 18, p.cy, { r: 44, dmg: 5, kind: 'clone', colors: ['#ffffff', '#ffb0d0', '#ffe040'], shake: 6 });
          for (const c of list) { c.flashT = 20; c.cool = 0; }
        }
        return;
      }
      // ---- 全員吐星 + 蓄力 ----
      if (d.t === 4 && !d.done) {
        d.done = true;
        KB.shoot({ spr: 'proj_ministar', x: p.cx + p.dir * 12, y: p.cy - 1, vx: p.dir * 4, vy: 0, dmg: 2, owner: 'player', life: 60,
          w: 10, h: 10, grav: 0, solid: false, pierce: false, type: 'star', dir: p.dir, fxHit: 'fx_hit', trail: '#ffe040', rotSpeed: 0.3 * p.dir, knock: 1.5 });
        for (const c of list) if (!c.dead) c.shootDir(p.dir);
        KB.particles(p.cx + p.dir * 12, p.cy, ['#ffe040', '#ffffff'], 6, { spread: 1.2, grav: 0, life: 12, up: 0, vx: p.dir, size: 1 });
        V('slash', p.cx + p.dir * 14, p.cy, 18, p.dir > 0 ? -0.2 : Math.PI + 0.2, { color: '#ffe040', flip: p.dir < 0 });
        sfx('spit');
      }
      if (d.t >= 16) {
        if (held) {
          D.anim = 'kirby_attack_clone_rush'; p.attackFps = 10;
          if (d.t >= HOLD(p.ability, MAGIC_ULT) - 1) {   // fix5b：實際 = 招式表的 60 幀（原本 >= 60 實測要 61 幀）
            if (!d.charged) { sfx('charge_ready'); V('aura', p, { color: '#ffb0d0', r: 22, frames: 240 }); }
            d.charged = true;
            if (d.t % 3 === 0) {
              KB.particles(p.cx + rnd(-12, 12), p.cy + rnd(-10, 10), ['#ffffff', '#ffb0d0'], 2, { spread: 1.2, grav: 0, life: 14, up: 0.2, size: 1 });
              if (d.t % 9 === 0) ghost(p.cx + rnd(-14, 14), p.bottom, { spr: 'kirby_idle', dir: p.dir, alpha: 0.35, life: 10, tint: '#ffb0d0' });
            }
          } else {
            if (d.t % 8 === 0) sfx('charge');
            if (d.t % 4 === 0) KB.particles(p.cx, p.y - 4, '#ffb0d0', 1, { spread: 0.8, grav: 0, life: 12, up: 0.3, size: 1 });
          }
          p.vx *= 0.85;
        } else if (d.charged) { startMove(p, 'rush'); return; }
      }
      if (d.t >= 14 && !held && !d.charged && KB.input.pressed('attack')) restartAttack(p);
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) {
      killBox(p); clearAnim(p); killTickers(p);
      for (const c of clones(p)) c.vanish();
      data(p).clones = [];
    },
  });
})();
