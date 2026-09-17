// 混合能力 KB.MIX（Round 6 系統深度）
// ---------------------------------------------------------------------------
// 規則：卡比持有能力 A 時吞下帶能力 B 的敵人 →
//   若 KB.MIX.table 有 [A,B]（無序）→ 變成混合能力（player.js 的 swallow 判斷），
//   否則照舊替換。混合能力本身是一般的 KB.ABILITIES 條目（moves / desc / flavour /
//   color / icon / hat），**不能再混合**（吞下第三個直接替換）。
//   受傷掉落混合能力時，能力星給回「主成分 A」（player.js 的 dropAbility）。
//
// 對外介面（player.js / ui / 測試都只用這四個）：
//   KB.MIX.table          { 'fire|sword': 'flamesword', ... }（key 為排序後的 a|b）
//   KB.MIX.keyOf(a, b)    無序查表，查不到回 null
//   KB.MIX.isMix(key)     該 key 是否為混合能力
//   KB.MIX.parts(key)     回傳 [a, b]（非混合能力回 null）
//
// 每個組合 3 招：地面 X / 方向鍵招 / 按住 X 50 幀放開的蓄力必殺。
// 特效一律透過 vx()（KB.VFX 沒載入時整組 no-op），判定一律走 KB.hitbox / KB.shoot。
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const P = KB.PHYS;
  KB.ABILITIES = KB.ABILITIES || {};

  // 蓄力必殺門檻：**從按下攻擊鍵那一幀算起**按住 50 幀放開（招式表寫的就是這個數字）
  const CHARGE = 50;

  // ======================================================================
  //  組合表：[混合 key, 成分 A, 成分 B, 視覺元素, 中文名, HUD 名, 能力色]
  // ======================================================================
  const COMBOS = [
    ['flamesword', 'fire', 'sword', 'fire', '炎劍', 'PYREDGE', '#ff5a20'],
    ['frostsword', 'ice', 'sword', 'ice', '冰劍', 'CRYEDGE', '#78d8ff'],
    ['thunderblade', 'spark', 'blade', 'spark', '雷刀', 'VOLTIAI', '#ffe040'],
    ['flamegun', 'fire', 'gunner', 'fire', '火焰槍', 'PYROGUN', '#ff8828'],
    ['frostgun', 'ice', 'gunner', 'ice', '冰彈槍', 'CRYOGUN', '#9fe8ff'],
    ['thunderbow', 'spark', 'bow', 'spark', '雷弓', 'VOLTBOW', '#ffd020'],
    ['flamehammer', 'fire', 'hammer', 'fire', '火鎚', 'MAGMAUL', '#ff6a10'],
    ['stonehammer', 'stone', 'hammer', 'stone', '岩鎚', 'GEOMAUL', '#c0b098'],
    ['shadowblade', 'cutter', 'ninja', 'shadow', '影刃', 'UMBRA', '#b070f0'],
    ['starmage', 'beam', 'mage', 'star', '星光法師', 'ASTRAL', '#fff0a0'],
    ['frostdragon', 'ice', 'dragon', 'ice', '冰龍', 'CRYWYRM', '#8fdcff'],
    ['thundermech', 'spark', 'mech', 'spark', '雷電機甲', 'VOLTMEK', '#80c8ff'],
  ];

  // ---------- KB.MIX ----------
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const MIX = {
    table: {},
    keyOf(a, b) {
      if (!a || !b || a === b) return null;
      if (MIX.isMix(a) || MIX.isMix(b)) return null;      // 混合能力不能再混
      return MIX.table[pairKey(a, b)] || null;
    },
    isMix(key) { const d = key && KB.ABILITIES[key]; return !!(d && d.mix); },
    parts(key) { const d = key && KB.ABILITIES[key]; return d && d.mix ? d.mix.slice() : null; },
    combos: COMBOS,
  };
  KB.MIX = MIX;
  for (const c of COMBOS) MIX.table[pairKey(c[1], c[2])] = c[0];

  // ---------- 註冊（KB.ABILITY_KEYS 會從 20 變成 32）----------
  for (const [key, a, b, el, cn, hud] of COMBOS) {
    if (KB.ABILITY_KEYS.indexOf(key) < 0) KB.ABILITY_KEYS.push(key);
    KB.ABILITY_NAMES[key] = cn; KB.ABILITY_HUD[key] = hud;
    try { if (KB.MIXART) KB.MIXART.build(key, a, b, el); } catch (e) { }
  }

  // ======================================================================
  //  共用工具（與 abilities.js / abilities_weapons.js 同一套慣例）
  // ======================================================================
  const rnd = (a, b) => a + Math.random() * (b - a);
  const data = p => p.abilityData || (p.abilityData = {});
  const down = k => KB.input.down(k);
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  const vx = function (name) {
    const V = KB.VFX;
    if (!V || typeof V[name] !== 'function') return null;
    try { return V[name].apply(V, Array.prototype.slice.call(arguments, 1)); } catch (e) { return null; }
  };
  const shake = n => { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); vx('shake', n); };
  const hitstop = n => { if (vx('hitstop', n) === null && KB.game) KB.game.freezeT = Math.max(KB.game.freezeT || 0, Math.min(4, n)); };
  const light = r => { const g = KB.game; if (g) { g.lightR = r; g.lightT = 180; g.lightF = g.frame; } };
  const slowFall = (p, v) => { if (!p.onGround && p.vy > v) p.vy = v; };
  const beat = b => { if (b && !b.dead) b.life = 3; };
  function killBox(p) {
    const d = data(p);
    for (const k of ['box', 'box2', 'box3']) if (d[k]) { d[k].dead = true; d[k] = null; }
  }
  function restartAttack(p) { p.setState('idle'); p.startAttack(); }
  function startMove(p, m) { data(p).next = m; restartAttack(p); }
  // Round 9：攻擊方向快照。player-input 會在 startAttack 當幀把 { up, down, air } 存進 p.atkDir；
  //   舊版 player.js 沒有這個欄位時自己讀 KB.input（行為相同）。
  function atkDir(p) {
    const a = p.atkDir;
    if (a && typeof a === 'object') return { up: !!a.up, down: !!a.down, air: !!a.air };
    return { up: down('up'), down: down('down'), air: !p.onGround };
  }
  // Round 9 招式優先序：↑X > ↓X > 空中 X > X（空中一樣吃這個順序；
  //   某個方向沒有專用招時自動往下一順位退，地面 / 空中都不會出現「按了沒反應」）。
  function pickMode(p, MV) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    const a = atkDir(p);
    if (a.up && MV.up) return 'up';
    if (a.down && MV.dn) return 'dn';
    if (a.air && MV.air) return 'air';
    return 'm1';
  }
  function setup(p, o) {
    const D = p.abilityDef;
    D.anim = o.anim || null; D.maxHold = o.maxHold || 0;
    p.attackTimer = o.dur; p.attackFps = o.fps || 12;
    p.attackLock = o.lock !== false;
  }
  const clearAnim = p => { const D = p.abilityDef; if (D) { D.anim = null; D.maxHold = 0; } };

  // 判定框：跟隨卡比
  const fbox = (p, o) => KB.hitbox(Object.assign({ x: 0, y: 0, owner: 'player', follow: p, life: 3, rehit: 8, pierce: true }, o));
  // 判定框：固定在世界座標（x / y 給中心點）
  const abox = (x, y, w, h, o) => KB.hitbox(Object.assign({ x: x - w / 2, y: y - h / 2, w, h, owner: 'player', life: 10, rehit: 0, pierce: true }, o || {}));
  const shoot = o => KB.shoot(Object.assign({ owner: 'player', life: 60, w: 10, h: 10, grav: 0, solid: true, fxHit: 'fx_hit', knock: 1.6 }, o));
  const parts = (x, y, cols, n, o) => KB.particles(x, y, cols, n, o);

  // 最近的敵人 / 魔王（追蹤彈 / 雷擊落點用）
  function nearest(x, y, r) {
    const g = KB.game; if (!g) return null;
    let best = null, bd = r * r;
    for (const e of g.entities) {
      if (e.dead || (e.type !== 'enemy' && e.type !== 'boss')) continue;
      if (e.active === false) continue;
      const dx = e.cx - x, dy = e.cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const groundY = p => {
    const g = KB.game; if (!g || !g.map) return p.bottom;
    let y = p.bottom;
    for (let i = 0; i < 14; i++) { if (g.map.isSolidPx(p.cx, y + 2)) break; y += 8; }
    return y;
  };

  // ---------- 追蹤彈 ----------
  class MixHoming extends KB.Projectile {
    constructor(o) {
      super(o);
      this.turn = o.turn || 0.16; this.spd = Math.hypot(this.vx, this.vy) || 4;
      this.delayT = o.delay || 8; this.seek = o.seek || 190; this.trailCol = o.trailCol || ['#fff8c0'];
    }
    update(dt) {
      if (this.delayT > 0) this.delayT--;
      else {
        const t = nearest(this.cx, this.cy, this.seek);
        if (t) {
          const want = Math.atan2(t.cy - this.cy, t.cx - this.cx);
          let cur = Math.atan2(this.vy, this.vx);
          const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          cur += Math.max(-this.turn, Math.min(this.turn, diff));
          this.vx = Math.cos(cur) * this.spd; this.vy = Math.sin(cur) * this.spd;
          this.rot = cur; this.flip = false;
        }
      }
      if ((Math.floor(this.t * 60) & 1) === 0) parts(this.cx, this.cy, this.trailCol, 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
      super.update(dt);
    }
  }
  // ---------- 環繞刃 ----------
  class MixOrbit extends KB.Projectile {
    constructor(o) {
      super(o);
      this.host = o.host || null; this.ang = o.ang || 0; this.rad = o.rad || 26;
      this.spin = o.spin || 0.13; this.solid = false; this.offscreenKill = false;
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.ang += this.spin; this.rot += 0.3;
      const h = this.host;
      if (!h || h.dead) { this.dead = true; return; }
      this.x = h.cx + Math.cos(this.ang) * this.rad - this.w / 2;
      this.y = h.cy + Math.sin(this.ang) * this.rad - this.h / 2;
      if ((Math.floor(this.t * 60) % 3) === 0) parts(this.cx, this.cy, ['#b070f0', '#6a30a8'], 1, { spread: 0.3, grav: 0, life: 10, up: 0, size: 1 });
    }
  }
  KB.MixHoming = MixHoming; KB.MixOrbit = MixOrbit;

  // ======================================================================
  //  定義工廠
  //  spec = { m2: 'air'|'up'|'down', m1:{...}, m2move:{...}, ult:{...} }
  //  每個 move = { anim, dur, fps, lock, maxHold, start(p,d), tick(p,d,t,held) }
  // ======================================================================
  function build(row, spec) {
    const [key, a, b, el, cn, hud, color] = row;
    const moves = spec.moves;
    // Round 9：五招槽（m1 = X、up = ↑X、dn = ↓X、air = 空中 X、ult = 蓄力）。
    //   舊寫法 m2 + m2move 會自動塞進對應的槽；補招（addMoves）之後直接塞進同一個物件。
    const MV = {
      m1: spec.m1, ult: spec.ult,
      up: spec.up || (spec.m2 === 'up' ? spec.m2move : null),
      dn: spec.dn || (spec.m2 === 'down' ? spec.m2move : null),
      air: spec.air || (spec.m2 === 'air' ? spec.m2move : null),
    };
    // ↑X / ↓X 用自己的 2 幀姿勢（art 檔 kirby_attack_<key>_up / _dn）
    const animOf = m => 'kirby_attack_' + key + (m === 'up' ? '_up' : m === 'dn' ? '_dn' : '');
    const o = {
      key, name: cn, hudName: hud, color,
      mix: [a, b], mixEl: el, transform: true,
      hat: 'hat_' + key, icon: 'ui_ability_' + key,
      duration: spec.m1.dur, fps: spec.m1.fps || 14, hold: true, maxHold: 600,
      lockMove: spec.m1.lock !== false, canJump: false,
      desc: spec.desc, flavour: Array.isArray(spec.flavour) ? spec.flavour : (spec.flavour ? [String(spec.flavour)] : []), moves,
      onGet(p) { const d = data(p); d.t = 0; d.charged = false; d.next = null; },
      onLose(p) { killBox(p); clearAnim(p); },
      // 地面 ↓+X 走 player.js 的蹲下分支（crouch 時按攻擊），所以一定要掛這個鉤子
      onCrouchAttack(p) { if (MV.dn) startMove(p, 'dn'); else startMove(p, 'm1'); },
      onAttack(p) {
        const d = data(p);
        killBox(p); d.t = 0; d.charged = false;
        d.mode = pickMode(p, MV);
        const mv = MV[d.mode] || MV.m1;
        setup(p, { anim: mv.anim || animOf(d.mode), dur: mv.dur, fps: mv.fps || 14, lock: mv.lock, maxHold: mv.maxHold || 0 });
        if (mv.start) mv.start(p, d);
      },
      update(p, dt, held) {
        const d = data(p); d.t++;
        light(64);
        const mv = MV[d.mode] || MV.m1;
        if (mv.tick) mv.tick(p, d, d.t, held);
        if (d.mode !== 'm1') return;
        // 蓄力：X 招式打完後繼續按住 → 第 CHARGE 幀蓄滿 → 放開放必殺
        if (d.t === Math.round(CHARGE * ((KB.PROG && KB.PROG.holdMul) ? KB.PROG.holdMul(p.ability) : 1))) { d.charged = true; sfx('charge_ready'); vx('chargeReady', p.cx, p.cy - 14, color); }
        if (d.charged) {
          if (d.t % 8 === 0) vx('aura', p, { color, r: 19, frames: 12, pulse: 0.4 });
          if (d.t % 3 === 0) parts(p.cx + rnd(-12, 12), p.cy + rnd(-11, 11), [color, '#ffffff'], 1, { spread: 0.3, grav: -0.05, life: 12, up: 0.4, size: 1 });
        } else if (d.t > 14 && d.t % 6 === 0) {
          parts(p.cx + rnd(-9, 9), p.cy + rnd(-8, 8), [color], 1, { spread: 0.2, grav: -0.03, life: 10, up: 0.3, size: 1 });
        }
        if (!held && d.charged) { sfx('mix_' + p.ability); startMove(p, 'ult'); }
      },
      onEnd(p) { killBox(p); clearAnim(p); },
    };
    o.mv = MV;                       // Round 9：補招用（addMoves）
    KB.ABILITIES[key] = o;
    return o;
  }
  // Round 9：把 ↑X / ↓X / 空中 X 補進既有定義，並換上 5 招的招式表（固定順序）
  function addMoves(key, extra, moves) {
    const o = KB.ABILITIES[key];
    if (!o || !o.mv) return null;
    Object.assign(o.mv, extra);
    if (moves) o.moves = moves;
    return o;
  }
  // 必殺共用開場（黑邊 + zoom + 招式名橫幅）
  function ultIntro(p, color, name) {
    vx('letterbox', 66); vx('zoom', 1.1, 16); shake(6); hitstop(4);
    vx('textPop', p.cx, p.y - 18, name, { color, size: 8, frames: 54, rise: 0.35 });
    sfx('ultimate');
  }

  // ======================================================================
  // 1. flamesword 炎劍（fire + sword）
  // ======================================================================
  build(COMBOS[0], {
    m2: 'air',
    desc: '火焰之心熔進劍身，每一次揮斬都甩出灼熱的半月劍氣。',
    flavour: '劍鋒過處，空氣先燒起來。',
    moves: [['X', '火焰劍氣三連'], ['空中 X', '落下爆炎斬'], ['按住 50 幀放開', '蓄力・火龍捲']],
    m1: {
      dur: 28, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 2 || t === 10 || t === 18) {
          const n = (t - 2) / 8;
          d.box = fbox(p, { w: 30, h: 26, dmg: 4, type: 'fire', ox: -4, oy: -14, life: 4, rehit: 0, knock: 1.6, flipWithOwner: true });
          shoot({ spr: 'proj_mix_wave_fire', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * (4.4 + n * 0.6), dmg: 3, w: 14, h: 16, life: 44, type: 'fire', dir: p.dir, trail: '#ff9020' });
          vx('slash', p.cx + p.dir * 12, p.cy - 2, 20 + n * 3, -0.5 + n * 0.5, { color: '#ffb040', width: 3, frames: 9, arc: 2.1, flip: p.dir < 0 });
          vx('burst', p.cx + p.dir * 18, p.cy - 2, { n: 8, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 2.2, life: 16, grav: -0.02 });
          sfx('sword'); shake(2);
        }
      },
    },
    m2move: {
      dur: 54, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 7; p.vx = p.dir * 1.2;
        vx('afterimage', p, { frames: 40, color: '#ff8030', every: 2, alpha: 0.55 });
        sfx('sword');
      },
      tick(p, d, t) {
        if (!d.landed) {
          p.vy = Math.max(p.vy, 6.4);
          parts(p.cx + rnd(-6, 6), p.cy, ['#ffe040', '#ff9020'], 2, { spread: 0.6, grav: -0.06, life: 12, up: 0.3, size: 1 });
          d.box = fbox(p, { w: 26, h: 26, dmg: 4, type: 'fire', ox: -13, oy: -6, life: 3, rehit: 8, flipWithOwner: false });
          if (p.onGround && t > 3) {
            d.landed = true; killBox(p);
            abox(p.cx, p.bottom - 14, 70, 36, { dmg: 7, type: 'fire', life: 14, rehit: 0, knock: 2.4, breakBlocks: true });
            vx('shockwave', p.cx, p.bottom, { w: 40, h: 16, dir: 1, speed: 5, frames: 18, color: '#ff9020' });
            vx('shockwave', p.cx, p.bottom, { w: 40, h: 16, dir: -1, speed: 5, frames: 18, color: '#ff9020' });
            vx('ring', p.cx, p.bottom - 6, { r0: 4, r1: 44, frames: 16, color: '#ffe040', width: 3 });
            vx('burst', p.cx, p.bottom - 6, { n: 24, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.4, life: 26, grav: 0.05, size: 2 });
            vx('flash', '#ff9020', 6, 0.45); vx('textPop', p.cx, p.y - 12, 'BURST!', { color: '#ffe040', size: 8, frames: 30, rise: 0.5 });
            shake(8); hitstop(4); sfx('hammer');
            p.attackTimer = Math.min(p.attackTimer, 16);
          }
        }
      },
    },
    ult: {
      anim: 'kirby_attack_flamesword_ult', dur: 48, fps: 10, lock: true,
      start(p) {
        ultIntro(p, '#ff5a20', '火龍捲');
        vx('worldTint', '#ff6020', 0.28, 40);
        for (let i = 0; i < 2; i++) {
          const pr = shoot({
            spr: 'proj_mix_tornado_fire', x: p.cx + p.dir * (18 + i * 22), y: groundY(p) - 18, vx: p.dir * (2.2 + i * 0.5), vy: 0,
            dmg: 5, w: 20, h: 44, life: 96, pierce: true, solid: false, type: 'fire', dir: p.dir, destructible: false,
          });
          pr.z = 4;
        }
        vx('circle', p.cx, p.cy, { r: 34, frames: 26, color: '#ffb040', spin: 0.22 });
        sfx('fire');
      },
      tick(p, d, t) {
        if (t % 4 === 0) parts(p.cx + p.dir * rnd(10, 70), groundY(p) - rnd(4, 40), ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.8, grav: -0.1, life: 20, up: 0.6, size: 2 });
        if (t % 10 === 0) { shake(3); sfx('fire'); }
        p.vx *= 0.8;
      },
    },
  });

  // ======================================================================
  // 2. frostsword 冰劍（ice + sword）
  // ======================================================================
  build(COMBOS[1], {
    m2: 'up',
    desc: '劍身結滿霜花，斬過的地方連空氣都凍成碎晶。',
    flavour: '被凍住的不是身體，是時間。',
    moves: [['X', '冰晶斬・凍結'], ['↑+X', '冰柱上挑'], ['按住 50 幀放開', '蓄力・冰河']],
    m1: {
      dur: 26, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 3) {
          d.box = fbox(p, { w: 32, h: 28, dmg: 4, type: 'ice', ox: -4, oy: -15, life: 6, rehit: 0, knock: 1.2, freeze: true, flipWithOwner: true });
          vx('slash', p.cx + p.dir * 12, p.cy - 2, 22, -0.4, { color: '#d8f4ff', width: 3, frames: 10, arc: 2.2, flip: p.dir < 0 });
          vx('burst', p.cx + p.dir * 18, p.cy - 4, { n: 12, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 2.4, life: 20, grav: 0.03, size: 2 });
          sfx('ice'); shake(2);
        }
        if (t === 9) {
          shoot({ spr: 'proj_mix_wave_ice', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * 4.2, dmg: 3, w: 14, h: 16, life: 46, type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff' });
          vx('circle', p.cx + p.dir * 16, p.cy, { r: 16, frames: 14, color: '#b8f0ff', spin: -0.2 });
        }
      },
    },
    m2move: {
      dur: 40, fps: 12, lock: true,
      start(p, d) { d.n = 0; sfx('ice'); vx('aura', p, { color: '#b8f0ff', r: 17, frames: 28 }); },
      tick(p, d, t) {
        if (t === 4 || t === 12 || t === 20) {
          const i = d.n++, x = p.cx + p.dir * (18 + i * 20), gy = groundY(p);
          shoot({ spr: 'proj_mix_spike_ice', x, y: gy - 18, vx: 0, vy: 0, dmg: 5, w: 12, h: 34, life: 24, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          abox(x, gy - 20, 16, 40, { dmg: 5, type: 'ice', life: 8, rehit: 0, freeze: true, knock: 1.2, onHit: e => { e.vy = -4; } });
          vx('burst', x, gy - 6, { n: 10, colors: ['#ffffff', '#b8f0ff'], speed: 2.2, life: 18, grav: 0.06, dir: -Math.PI / 2, spread: 0.8 });
          vx('ring', x, gy - 8, { r0: 2, r1: 20, frames: 12, color: '#b8f0ff', width: 2 });
          shake(3); sfx('ice');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_frostsword_ult', dur: 56, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#78d8ff', '冰河');
        vx('worldTint', '#60a8e0', 0.34, 50);
        d.n = 0; sfx('ice');
      },
      tick(p, d, t) {
        p.vx *= 0.82;
        if (t % 6 === 2 && d.n < 7) {
          const i = d.n++, x = p.cx + p.dir * (20 + i * 24), gy = groundY(p);
          shoot({ spr: 'proj_mix_spike_ice', x, y: gy - 20, vx: 0, vy: 0, dmg: 6, w: 14, h: 38, life: 40, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false, scale: 1.2 });
          abox(x, gy - 22, 20, 46, { dmg: 6, type: 'ice', life: 12, rehit: 0, freeze: true, knock: 1.6 });
          vx('burst', x, gy - 10, { n: 12, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 2.6, life: 22, grav: 0.05 });
          shake(4); sfx('ice');
        }
        if (t % 5 === 0) parts(p.cx + rnd(-40, 90) * p.dir, p.cy + rnd(-30, 20), ['#ffffff', '#b8f0ff'], 2, { spread: 0.6, grav: 0.02, life: 24, up: 0, size: 1 });
      },
    },
  });

  // ======================================================================
  // 3. thunderblade 雷刀（spark + blade）
  // ======================================================================
  build(COMBOS[2], {
    m2: 'down',
    desc: '刀身導著雷，出鞘的瞬間整個房間都被閃光吃掉。',
    flavour: '你看到的光，是他已經收刀了。',
    moves: [['X', '雷光一閃（全畫面）'], ['↓+X', '雷步瞬移斬'], ['按住 50 幀放開', '蓄力・雷神']],
    m1: {
      dur: 26, fps: 16, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 4) {
          const g = KB.game, y = p.cy - 2;
          const x0 = g && g.cam ? g.cam.x : p.cx - 128;
          abox(x0 + 128, y, 272, 28, { dmg: 5, type: 'spark', life: 8, rehit: 0, knock: 2, pierce: true });
          vx('lightning', x0 - 8, y, x0 + 264, y, { color: '#fff8c0', frames: 14, jitter: 7, branches: 5 });
          vx('line', x0 - 8, y, x0 + 264, y, { color: '#ffffff', width: 2, frames: 8 });
          vx('flash', '#fff8c0', 8, 0.7); vx('worldTint', '#ffe040', 0.3, 10);
          vx('burst', p.cx + p.dir * 18, y, { n: 14, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3, life: 16, grav: 0 });
          shake(6); hitstop(3); sfx('spark');
        }
      },
    },
    m2move: {
      dur: 34, fps: 16, lock: true,
      start(p, d) {
        const g = KB.game, x0 = p.cx, y0 = p.cy;
        let dx = 0;
        for (let i = 4; i <= 56; i += 4) { if (g && g.map && g.map.isSolidPx(p.cx + p.dir * i, p.cy)) break; dx = i; }
        p.x += p.dir * dx;
        d.box = null;
        vx('afterimage', p, { frames: 24, color: '#fff8c0', every: 1, alpha: 0.6 });
        vx('lightning', x0, y0, p.cx, p.cy, { color: '#fff8c0', frames: 12, jitter: 6, branches: 3 });
        vx('burst', x0, y0, { n: 12, colors: ['#fff8c0', '#ffffff'], speed: 2.6, life: 14, grav: 0 });
        abox(p.cx, p.cy - 2, 40, 30, { dmg: 6, type: 'spark', life: 8, rehit: 0, knock: 2.2 });
        vx('slash', p.cx, p.cy - 2, 22, 0, { color: '#fff8c0', width: 3, frames: 10, arc: 2.4, flip: p.dir < 0 });
        // Round 9 空中變體：雷步在空中會沿著身體把電導到腳下的地面（否則空中 ↓X 打不到地面敵人）
        if (!p.onGround) {
          const gy = groundY(p);
          vx('lightning', p.cx, p.cy, p.cx, gy, { color: '#fff8c0', frames: 12, jitter: 6, branches: 3 });
          abox(p.cx, gy - 15, 40, 30, { dmg: 6, type: 'spark', life: 8, rehit: 0, knock: 2.2 });
          vx('burst', p.cx, gy - 6, { n: 12, colors: ['#fff8c0', '#ffffff'], speed: 2.6, life: 16, grav: 0.04 });
        }
        shake(4); hitstop(2); sfx('teleport');
      },
      tick(p, d, t) {
        p.vx *= 0.7;
        if (t % 4 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-10, 10), ['#fff8c0', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 10, up: 0, size: 1 });
      },
    },
    ult: {
      anim: 'kirby_attack_thunderblade_ult', dur: 62, fps: 12, lock: true,
      start(p, d) {
        ultIntro(p, '#ffe040', '雷神');
        vx('worldTint', '#3a3e88', 0.42, 56);
        vx('circle', p.cx, p.cy, { r: 40, frames: 40, color: '#fff8c0', spin: 0.3 });
        d.n = 0; sfx('spark');
      },
      tick(p, d, t) {
        p.vx *= 0.8;
        if (t % 6 === 1 && d.n < 8) {
          const i = d.n++;
          const tgt = nearest(p.cx, p.cy, 220);
          const x = tgt ? tgt.cx : p.cx + p.dir * (24 + i * 18);
          const gy = p.bottom + 4;
          vx('lightning', x, gy - 190, x, gy, { color: '#fff8c0', frames: 14, jitter: 9, branches: 4 });
          abox(x, gy - 96, 26, 200, { dmg: 5, type: 'spark', life: 8, rehit: 0, knock: 1.8 });
          vx('burst', x, gy - 6, { n: 12, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3, life: 18, grav: 0.04 });
          vx('flash', '#fff8c0', 4, 0.35);
          shake(5); sfx('spark');
        }
      },
    },
  });

  // ======================================================================
  // 4. flamegun 火焰槍（fire + gunner）
  // ======================================================================
  const firePool = (x, y, life, dmg) => abox(x, y - 8, 44, 22, {
    dmg, type: 'fire', life, rehit: 12, knock: 1,
    onUpdate(h) {
      if ((h.life & 3) === 0) {
        KB.fx('fx_fire', h.x + rnd(2, h.w - 2), h.y + h.h - 2, { life: 14, fps: 12 });
        parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.5, grav: -0.07, life: 16, up: 0.5, size: 1 });
      }
    },
  });
  build(COMBOS[3], {
    m2: 'down',
    desc: '槍管裡燒著岩漿，打出去的每一發都在地上留下一片火海。',
    flavour: '「彈藥？我這把槍只吃柴火。」',
    moves: [['X', '燃燒彈 + 地面火海'], ['↓+X', '霰彈火牆'], ['按住 50 幀放開', '蓄力・火箭砲']],
    m1: {
      dur: 24, fps: 14, lock: false, maxHold: 600,
      tick(p, d, t) {
        if (t % 9 === 1 && t <= 46) {
          const mx = p.cx + p.dir * 14, my = p.cy - 3;
          shoot({
            spr: 'proj_mix_orb_fire', x: mx, y: my, vx: p.dir * 4.4, vy: -1.1, grav: 0.16,
            dmg: 3, w: 10, h: 10, life: 70, type: 'fire', dir: p.dir, trail: '#ff9020', breakBlocks: true,
            onWall(pr) { firePool(pr.cx, pr.bottom, 54, 3); vx('burst', pr.cx, pr.cy, { n: 12, colors: ['#ffe040', '#ff9020'], speed: 2.4, life: 18, grav: 0.05 }); sfx('fire'); },
            onHit(_t, pr) { firePool(pr.cx, pr.bottom, 54, 3); vx('ring', pr.cx, pr.cy, { r0: 2, r1: 22, frames: 12, color: '#ff9020', width: 2 }); },
          });
          vx('line', mx, my, mx + p.dir * 60, my - 12, { color: '#ffe040', width: 1, frames: 4 });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          sfx('gun'); shake(1);
        }
      },
    },
    m2move: {
      dur: 36, fps: 12, lock: true,
      start(p) { vx('aura', p, { color: '#ff9028', r: 15, frames: 12 }); },
      tick(p, d, t) {
        if (t === 10) {
          for (let i = -3; i <= 3; i++) {
            shoot({
              spr: 'proj_mix_wave_fire', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * (5.2 - Math.abs(i) * 0.3), vy: i * 0.9,
              dmg: 3, w: 12, h: 18, life: 26, type: 'fire', dir: p.dir, trail: '#ff9020',
            });
          }
          // 前方立起一道火牆
          abox(p.cx + p.dir * 26, p.cy - 2, 26, 46, {
            dmg: 4, type: 'fire', life: 56, rehit: 10, knock: 1.4,
            onUpdate(h) { if ((h.life & 3) === 0) { KB.fx('fx_fire', h.x + rnd(2, h.w - 2), h.y + rnd(8, h.h), { life: 12, fps: 12 }); parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020'], 2, { spread: 0.4, grav: -0.1, life: 18, up: 0.8, size: 1 }); } },
          });
          p.vx = -p.dir * 2.8;
          vx('flash', '#ff9020', 6, 0.5); vx('ring', p.cx + p.dir * 20, p.cy, { r0: 4, r1: 30, frames: 14, color: '#ffe040', width: 2 });
          shake(6); hitstop(3); sfx('shotgun');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_flamegun_ult', dur: 46, fps: 10, lock: true,
      start(p) {
        ultIntro(p, '#ff8828', '火箭砲');
        shoot({
          spr: 'proj_mix_bolt_fire', x: p.cx + p.dir * 16, y: p.cy - 2, vx: p.dir * 5, dmg: 10, w: 22, h: 12,
          life: 90, pierce: true, type: 'fire', dir: p.dir, trail: '#ff9020', knock: 3, breakBlocks: true, scale: 1.4,
          onHit(_t, pr) {
            abox(pr.cx, pr.cy, 68, 54, { dmg: 8, type: 'fire', life: 10, rehit: 0, knock: 2.6 });
            vx('ring', pr.cx, pr.cy, { r0: 4, r1: 46, frames: 16, color: '#ffe040', width: 3 });
            vx('burst', pr.cx, pr.cy, { n: 26, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.6, life: 26, grav: 0.05, size: 2 });
            vx('flash', '#ff9020', 8, 0.55); shake(8);
          },
          onWall(pr) {
            abox(pr.cx, pr.cy, 68, 54, { dmg: 8, type: 'fire', life: 10, rehit: 0 });
            vx('ring', pr.cx, pr.cy, { r0: 4, r1: 46, frames: 16, color: '#ffe040', width: 3 });
            vx('burst', pr.cx, pr.cy, { n: 26, colors: ['#ffe040', '#ff9020'], speed: 3.6, life: 26, grav: 0.05, size: 2 });
            shake(8);
          },
        });
        p.vx = -p.dir * 3.6;
        vx('beam', p.cx + p.dir * 16, p.cy - 2, p.dir, 120, { width: 10, color: '#ff9020', frames: 12, taper: true });
        shake(8); sfx('shotgun');
      },
      tick(p, d, t) { if (t < 14) p.vx += p.dir * 0.22; if (t % 5 === 0) parts(p.cx - p.dir * 14, p.cy, ['#ffe040', '#ff9020'], 2, { spread: 0.8, grav: -0.05, life: 16, up: 0.3, size: 1 }); },
    },
  });

  // ======================================================================
  // 5. frostgun 冰彈槍（ice + gunner）
  // ======================================================================
  build(COMBOS[4], {
    m2: 'down',
    desc: '壓縮的寒氣裝進彈匣，中彈的敵人會當場結成一塊冰。',
    flavour: '冷卻時間？這把槍只有冷。',
    moves: [['X', '凍結彈'], ['↓+X', '冰霧散彈'], ['按住 50 幀放開', '蓄力・絕對零度光束']],
    m1: {
      dur: 24, fps: 14, lock: false, maxHold: 600,
      tick(p, d, t) {
        if (t % 8 === 1 && t <= 48) {
          const mx = p.cx + p.dir * 14, my = p.cy - 3;
          shoot({
            spr: 'proj_mix_orb_ice', x: mx, y: my, vx: p.dir * 5.2, dmg: 3, w: 10, h: 10, life: 60,
            type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff',
            onHit(_t, pr) { vx('burst', pr.cx, pr.cy, { n: 12, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 2.4, life: 20, grav: 0.04 }); vx('ring', pr.cx, pr.cy, { r0: 2, r1: 20, frames: 12, color: '#b8f0ff', width: 2 }); },
          });
          vx('line', mx, my, mx + p.dir * 80, my, { color: '#d8f4ff', width: 1, frames: 4 });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          sfx('gun'); shake(1);
        }
      },
    },
    m2move: {
      dur: 36, fps: 12, lock: true,
      tick(p, d, t) {
        if (t === 10) {
          for (let i = -4; i <= 4; i++) {
            shoot({
              spr: 'proj_mix_wave_ice', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * (4.6 - Math.abs(i) * 0.22), vy: i * 0.8,
              dmg: 2, w: 12, h: 18, life: 24, type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff',
            });
          }
          // 冰霧：前方一團持續凍結的霧
          abox(p.cx + p.dir * 34, p.cy - 2, 62, 40, {
            dmg: 3, type: 'ice', life: 44, rehit: 14, freeze: true, knock: 0.6,
            onUpdate(h) { if ((h.life & 1) === 0) parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#ffffff', '#b8f0ff'], 1, { spread: 0.3, grav: -0.01, life: 26, up: 0.1, size: 2 }); },
          });
          p.vx = -p.dir * 2.4;
          vx('flash', '#b8f0ff', 6, 0.45); vx('circle', p.cx + p.dir * 24, p.cy, { r: 26, frames: 18, color: '#b8f0ff', spin: -0.18 });
          shake(5); hitstop(2); sfx('shotgun');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_frostgun_ult', dur: 54, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#9fe8ff', '絕對零度光束');
        vx('worldTint', '#60a8e0', 0.38, 48);
        d.beamBox = null; sfx('beam');
      },
      tick(p, d, t) {
        p.vx *= 0.7;
        if (t >= 8 && t <= 44) {
          if (t % 6 === 2) {
            vx('beam', p.cx + p.dir * 14, p.cy - 2, p.dir, 210, { width: 16, color: '#d8f4ff', frames: 10, taper: false });
            vx('line', p.cx + p.dir * 14, p.cy - 2, p.cx + p.dir * 220, p.cy - 2, { color: '#ffffff', width: 3, frames: 8 });
            abox(p.cx + p.dir * 112, p.cy - 2, 210, 22, { dmg: 8, type: 'ice', life: 6, rehit: 0, freeze: true, knock: 1.2 });
            shake(3); sfx('beam');
          }
          if (t % 3 === 0) parts(p.cx + p.dir * rnd(20, 200), p.cy + rnd(-10, 10), ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: 0, life: 18, up: 0, size: 1 });
        }
        if (t === 46) { vx('flash', '#ffffff', 8, 0.6); vx('ring', p.cx + p.dir * 60, p.cy, { r0: 6, r1: 70, frames: 18, color: '#b8f0ff', width: 3 }); }
      },
    },
  });

  // ======================================================================
  // 6. thunderbow 雷弓（spark + bow）
  // ======================================================================
  build(COMBOS[5], {
    m2: 'air',
    desc: '搭在弦上的不是箭，是一整條被折彎的閃電。',
    flavour: '瞄準只是禮貌，雷自己會找路。',
    moves: [['X', '追蹤雷箭'], ['空中 X', '箭雨閃電'], ['按住 50 幀放開', '蓄力・天雷之矢']],
    m1: {
      dur: 26, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 6 || t === 16) {
          const pr = new MixHoming({
            spr: 'proj_mix_bolt_spark', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * 4.6, vy: 0,
            dmg: 4, w: 14, h: 8, life: 76, owner: 'player', type: 'spark', dir: p.dir, turn: 0.16, seek: 200,
            trailCol: ['#fff8c0', '#ffffff'],
          });
          KB.spawn(pr);
          vx('line', p.cx + p.dir * 10, p.cy - 2, p.cx + p.dir * 54, p.cy - 2, { color: '#fff8c0', width: 1, frames: 5 });
          vx('burst', p.cx + p.dir * 14, p.cy - 2, { n: 8, colors: ['#fff8c0', '#ffffff'], speed: 2, life: 12, grav: 0 });
          sfx('bow');
        }
      },
    },
    m2move: {
      dur: 40, fps: 12, lock: false,
      start(p) { slowFall(p, 0.6); sfx('arrow_rain'); },
      tick(p, d, t) {
        slowFall(p, 0.8);
        if (t === 6 || t === 14 || t === 22) {
          for (let i = -2; i <= 2; i++) {
            shoot({
              spr: 'proj_mix_bolt_spark', x: p.cx + i * 5, y: p.cy + 6, vx: i * 1.5, vy: 5.4, rot: Math.PI / 2,
              dmg: 3, w: 10, h: 10, life: 50, type: 'spark', dir: p.dir, trail: '#fff8c0',
              onWall(pr) {
                vx('lightning', pr.cx, pr.cy - 40, pr.cx, pr.cy, { color: '#fff8c0', frames: 10, jitter: 5, branches: 2 });
                abox(pr.cx, pr.cy - 8, 26, 34, { dmg: 3, type: 'spark', life: 6, rehit: 0 });
                vx('burst', pr.cx, pr.cy, { n: 8, colors: ['#fff8c0', '#ffffff'], speed: 2.2, life: 14, grav: 0.04 });
              },
              onHit(_t, pr) { vx('lightning', pr.cx, pr.cy - 36, pr.cx, pr.cy, { color: '#fff8c0', frames: 10, jitter: 5, branches: 2 }); },
            });
          }
          vx('flash', '#fff8c0', 4, 0.25); sfx('bow');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_thunderbow_ult', dur: 56, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ffd020', '天雷之矢'); vx('worldTint', '#3a3e88', 0.4, 50); d.fired = false; sfx('bow'); },
      tick(p, d, t) {
        p.vx *= 0.8;
        if (t < 16 && t % 3 === 0) parts(p.cx + rnd(-16, 16), p.cy + rnd(-14, 14), ['#fff8c0', '#ffffff'], 2, { spread: 0.4, grav: -0.06, life: 16, up: 0.5, size: 1 });
        if (t === 16) {
          vx('beam', p.cx, p.cy - 10, -Math.PI / 2, 180, { width: 14, color: '#fff8c0', frames: 14 });
          shake(5); vx('flash', '#ffffff', 6, 0.5);
        }
        if (t === 26 && !d.fired) {
          d.fired = true;
          const tgt = nearest(p.cx, p.cy, 240);
          const x = tgt ? tgt.cx : p.cx + p.dir * 56, gy = p.bottom + 4;
          vx('lightning', x, gy - 200, x, gy, { color: '#ffffff', frames: 20, jitter: 12, branches: 6 });
          vx('lightning', x - 10, gy - 200, x, gy, { color: '#fff8c0', frames: 18, jitter: 10, branches: 4 });
          vx('beam', x, gy, -Math.PI / 2, 200, { width: 30, color: '#fff8c0', frames: 18 });
          abox(x, gy - 100, 44, 210, { dmg: 12, type: 'spark', life: 14, rehit: 0, knock: 3 });
          vx('ring', x, gy - 8, { r0: 6, r1: 66, frames: 20, color: '#ffffff', width: 3 });
          vx('burst', x, gy - 8, { n: 30, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 4, life: 28, grav: 0.05, size: 2 });
          vx('flash', '#ffffff', 10, 0.8); vx('zoom', 1.14, 14);
          shake(10); hitstop(5); sfx('spark');
        }
      },
    },
  });

  // ======================================================================
  // 7. flamehammer 火鎚（fire + hammer）
  // ======================================================================
  build(COMBOS[6], {
    m2: 'air',
    desc: '鎚頭燒成暗紅，砸下去的地面會裂開噴出火柱。',
    flavour: '一鎚下去，連地板都要退燒。',
    moves: [['X', '爆炎鎚・落地火柱'], ['空中 X', '火焰迴旋'], ['按住 50 幀放開', '蓄力・隕石鎚']],
    m1: {
      dur: 32, fps: 12, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 12) {
          d.box = fbox(p, { w: 36, h: 32, dmg: 6, type: 'fire', ox: -2, oy: -16, life: 6, rehit: 0, knock: 2.4, breakBlocks: true, flipWithOwner: true });
          const gy = groundY(p);
          for (let i = 0; i < 3; i++) {
            const x = p.cx + p.dir * (22 + i * 20);
            abox(x, gy - 24, 18, 48, { dmg: 4, type: 'fire', life: 26, rehit: 10, knock: 1.6, onUpdate(h) { if ((h.life & 3) === 0) { KB.fx('fx_fire', h.x + h.w / 2, h.y + h.h, { life: 12, fps: 12 }); parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020'], 2, { spread: 0.4, grav: -0.12, life: 20, up: 1, size: 2 }); } } });
            vx('ring', x, gy - 8, { r0: 2, r1: 24, frames: 12, color: '#ff9020', width: 2 });
          }
          vx('shockwave', p.cx, p.bottom, { w: 36, h: 14, dir: p.dir, speed: 4.5, frames: 16, color: '#ff9020' });
          vx('burst', p.cx + p.dir * 18, p.bottom - 8, { n: 20, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.2, life: 24, grav: 0.05, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'SMASH!', { color: '#ffe040', size: 8, frames: 28, rise: 0.5 });
          shake(8); hitstop(4); sfx('hammer');
        }
      },
    },
    m2move: {
      dur: 38, fps: 14, lock: false,
      start(p) {
        vx('aura', p, { color: '#ff8030', r: 20, frames: 38, pulse: 0.4 });
        vx('afterimage', p, { frames: 38, color: '#ff8030', every: 3, alpha: 0.45 });
        sfx('hammer');
      },
      tick(p, d, t) {
        slowFall(p, 1.1);
        if (!d.box || d.box.dead) d.box = fbox(p, { w: 46, h: 42, dmg: 3, type: 'fire', ox: -23, oy: -22, life: 3, rehit: 8, knock: 1.4, flipWithOwner: false });
        else beat(d.box);
        if (t % 3 === 0) {
          const a = t * 0.45;
          parts(p.cx + Math.cos(a) * 20, p.cy + Math.sin(a) * 18, ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.4, grav: 0, life: 14, up: 0, size: 2 });
        }
        if (t % 12 === 0) vx('ring', p.cx, p.cy, { r0: 8, r1: 28, frames: 12, color: '#ffb040', width: 2 });
      },
    },
    ult: {
      anim: 'kirby_attack_flamehammer_ult', dur: 62, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ff6a10', '隕石鎚'); vx('worldTint', '#903018', 0.3, 56); d.n = 0; sfx('hammer'); },
      tick(p, d, t) {
        p.vx *= 0.85;
        if (t % 8 === 2 && d.n < 5) {
          const i = d.n++, x = p.cx + p.dir * (10 + i * 26) + rnd(-8, 8);
          shoot({
            spr: 'proj_mix_orb_fire', x, y: p.cy - 150, vx: rnd(-0.4, 0.4), vy: 6.4, grav: 0.12, dmg: 6, w: 18, h: 18,
            life: 90, type: 'fire', trail: '#ff9020', scale: 1.6, breakBlocks: true,
            onWall(pr) {
              abox(pr.cx, pr.cy, 56, 44, { dmg: 7, type: 'fire', life: 10, rehit: 0, knock: 2.4 });
              vx('shockwave', pr.cx, pr.bottom, { w: 32, h: 14, dir: 1, speed: 4, frames: 14, color: '#ff9020' });
              vx('shockwave', pr.cx, pr.bottom, { w: 32, h: 14, dir: -1, speed: 4, frames: 14, color: '#ff9020' });
              vx('ring', pr.cx, pr.cy, { r0: 4, r1: 40, frames: 16, color: '#ffe040', width: 3 });
              vx('burst', pr.cx, pr.cy, { n: 22, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.4, life: 26, grav: 0.06, size: 2 });
              shake(7); sfx('fire');
            },
            onHit(_t, pr) { abox(pr.cx, pr.cy, 56, 44, { dmg: 7, type: 'fire', life: 8, rehit: 0 }); vx('ring', pr.cx, pr.cy, { r0: 4, r1: 40, frames: 16, color: '#ffe040', width: 3 }); shake(6); },
          });
          vx('line', x, p.cy - 150, x, p.cy - 40, { color: '#ff9020', width: 2, frames: 8 });
        }
        if (t % 6 === 0) shake(3);
      },
    },
  });

  // ======================================================================
  // 8. stonehammer 岩鎚（stone + hammer）
  // ======================================================================
  build(COMBOS[7], {
    m2: 'up',
    desc: '鎚頭本身就是一塊山岩，敲地會把地裂沿著地面推出去。',
    flavour: '不是他重，是地面太脆。',
    moves: [['X', '地裂衝擊波三段'], ['↑+X', '岩石投擲（落地彈跳）'], ['按住 50 幀放開', '蓄力・地震']],
    m1: {
      dur: 34, fps: 12, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 6 || t === 16 || t === 26) {
          const n = (t - 6) / 10, gy = groundY(p);
          d.box = fbox(p, { w: 34, h: 30, dmg: 4, type: 'stone', ox: -2, oy: -15, life: 5, rehit: 0, knock: 2, breakBlocks: true, flipWithOwner: true });
          shoot({
            spr: 'proj_mix_wave_stone', x: p.cx + p.dir * 16, y: gy - 12, vx: p.dir * (3.2 + n * 0.6), vy: 0,
            dmg: 4 + n, w: 14 + n * 4, h: 22, life: 60, type: 'stone', dir: p.dir, solid: false, pierce: true, destructible: false,
          });
          vx('shockwave', p.cx, gy, { w: 30 + n * 8, h: 14, dir: p.dir, speed: 4 + n, frames: 18, color: '#b0a090' });
          vx('burst', p.cx + p.dir * 16, gy - 6, { n: 12 + n * 4, colors: ['#c0b098', '#8a7a66', '#605448'], speed: 2.6, life: 22, grav: 0.12, size: 2 });
          shake(4 + n * 2); sfx('hammer');
        }
      },
    },
    m2move: {
      dur: 34, fps: 12, lock: true,
      tick(p, d, t) {
        if (t === 8 || t === 18) {
          const i = (t - 8) / 10;
          shoot({
            spr: 'proj_mix_orb_stone', x: p.cx + p.dir * 12, y: p.cy - 12, vx: p.dir * (3.4 + i), vy: -2.6 + i * 0.5, grav: 0.26,
            dmg: 5, w: 14, h: 14, life: 90, type: 'stone', dir: p.dir, rotSpeed: 0.22 * p.dir, breakBlocks: true, bounce: 0.45,
            onWall(pr) { vx('burst', pr.cx, pr.cy, { n: 14, colors: ['#c0b098', '#8a7a66'], speed: 2.6, life: 22, grav: 0.14, size: 2 }); abox(pr.cx, pr.cy, 34, 28, { dmg: 4, type: 'stone', life: 6, rehit: 0 }); shake(3); sfx('hardblock'); },
            onHit(_t, pr) { vx('burst', pr.cx, pr.cy, { n: 12, colors: ['#c0b098', '#8a7a66'], speed: 2.4, life: 20, grav: 0.14, size: 2 }); },
          });
          vx('ring', p.cx + p.dir * 12, p.cy - 10, { r0: 2, r1: 18, frames: 10, color: '#c0b098', width: 2 });
          sfx('hammer'); shake(2);
        }
      },
    },
    ult: {
      anim: 'kirby_attack_stonehammer_ult', dur: 64, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#c0b098', '地震');
        const gy = groundY(p), g = KB.game, x0 = g && g.cam ? g.cam.x + 128 : p.cx;
        abox(x0, gy - 22, 272, 44, {
          dmg: 6, type: 'stone', life: 56, rehit: 14, knock: 2,
          onUpdate(h) { if ((h.life & 3) === 0) parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#c0b098', '#8a7a66', '#605448'], 2, { spread: 1.2, grav: 0.16, life: 22, up: 1.4, size: 2 }); },
        });
        d.n = 0; sfx('hammer');
      },
      tick(p, d, t) {
        p.vx *= 0.9; shake(5);
        if (t % 7 === 1 && d.n < 8) {
          const i = d.n++, gy = groundY(p), x = p.cx + (i % 2 ? 1 : -1) * (20 + i * 14);
          shoot({ spr: 'proj_mix_spike_stone', x, y: gy - 18, vx: 0, vy: 0, dmg: 5, w: 14, h: 34, life: 30, solid: false, pierce: true, type: 'stone', destructible: false });
          abox(x, gy - 20, 18, 40, { dmg: 5, type: 'stone', life: 10, rehit: 0, knock: 1.8, onHit: e => { e.vy = -3.4; } });
          vx('burst', x, gy - 6, { n: 12, colors: ['#c0b098', '#8a7a66'], speed: 2.6, life: 22, grav: 0.16, dir: -Math.PI / 2, spread: 0.9, size: 2 });
          sfx('hardblock');
        }
        if (t === 50) { vx('flash', '#c0b098', 8, 0.4); vx('ring', p.cx, p.bottom - 6, { r0: 8, r1: 90, frames: 18, color: '#e0d8c8', width: 3 }); }
      },
    },
  });

  // ======================================================================
  // 9. shadowblade 影刃（cutter + ninja）
  // ======================================================================
  build(COMBOS[8], {
    m2: 'down',
    desc: '迴旋刃沾上忍者的影子，會從三個你沒看的方向飛回來。',
    flavour: '影子不會發出聲音，刃也是。',
    moves: [['X', '三方向迴旋刃'], ['↓+X', '影分身刃陣'], ['按住 50 幀放開', '蓄力・千刃']],
    m1: {
      dur: 24, fps: 16, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 5) {
          for (const ang of [-0.55, 0, 0.55]) {
            shoot({
              spr: 'proj_mix_wave_shadow', x: p.cx + p.dir * 12, y: p.cy - 2,
              vx: p.dir * Math.cos(ang) * 5, vy: Math.sin(ang) * 5,
              dmg: 3, w: 12, h: 16, life: 52, type: 'cutter', dir: p.dir, trail: '#b070f0', rotSpeed: 0.3 * p.dir,
            });
          }
          vx('slash', p.cx + p.dir * 12, p.cy - 2, 20, 0, { color: '#d0a0ff', width: 3, frames: 9, arc: 2.4, flip: p.dir < 0 });
          vx('burst', p.cx + p.dir * 14, p.cy - 2, { n: 10, colors: ['#d0a0ff', '#b070f0', '#6a30a8'], speed: 2.4, life: 16, grav: 0 });
          sfx('cutter'); shake(2);
        }
      },
    },
    m2move: {
      dur: 44, fps: 14, lock: false,
      start(p, d) {
        d.orbs = [];
        for (let i = 0; i < 4; i++) {
          const o = new MixOrbit({
            spr: 'proj_mix_wave_shadow', x: p.cx, y: p.cy, vx: 0, vy: 0, dmg: 4, w: 12, h: 18,
            life: 56, owner: 'player', type: 'cutter', pierce: true, host: p, ang: i * Math.PI / 2, rad: 28, spin: 0.15,
          });
          o.destructible = false;
          KB.spawn(o); d.orbs.push(o);
        }
        vx('afterimage', p, { frames: 44, color: '#b070f0', every: 3, alpha: 0.5 });
        vx('circle', p.cx, p.cy, { r: 30, frames: 40, color: '#b070f0', spin: 0.24 });
        sfx('shuriken');
      },
      tick(p, d, t) {
        slowFall(p, 1.3);
        if (t % 6 === 0) vx('ring', p.cx, p.cy, { r0: 10, r1: 30, frames: 10, color: '#b070f0', width: 1 });
      },
    },
    ult: {
      anim: 'kirby_attack_shadowblade_ult', dur: 58, fps: 12, lock: true,
      start(p, d) { ultIntro(p, '#b070f0', '千刃'); vx('worldTint', '#2a1040', 0.42, 52); d.n = 0; sfx('shuriken'); },
      tick(p, d, t) {
        p.vx *= 0.85;
        if (t % 2 === 1 && d.n < 18) {
          const i = d.n++, a = i * 0.85, r = 92;
          const sx = p.cx + Math.cos(a) * r, sy = p.cy + Math.sin(a) * r;
          shoot({
            spr: 'proj_mix_wave_shadow', x: sx, y: sy, vx: -Math.cos(a) * 6, vy: -Math.sin(a) * 6,
            dmg: 4, w: 12, h: 20, life: 34, type: 'cutter', pierce: true, solid: false, destructible: false,
            rotSpeed: 0.4, trail: '#b070f0',
          });
          vx('line', sx, sy, p.cx, p.cy, { color: '#d0a0ff', width: 1, frames: 6 });
          if (i % 4 === 0) sfx('cutter');
        }
        if (t === 40) {
          abox(p.cx, p.cy, 120, 96, { dmg: 6, type: 'cutter', life: 10, rehit: 0, knock: 2.2 });
          vx('flash', '#d0a0ff', 8, 0.6); vx('ring', p.cx, p.cy, { r0: 8, r1: 80, frames: 18, color: '#b070f0', width: 3 });
          vx('burst', p.cx, p.cy, { n: 28, colors: ['#d0a0ff', '#b070f0', '#6a30a8'], speed: 3.6, life: 26, grav: 0 });
          shake(8); hitstop(4);
        }
      },
    },
  });

  // ======================================================================
  // 10. starmage 星光法師（beam + mage）
  // ======================================================================
  build(COMBOS[9], {
    m2: 'up',
    desc: '把整條銀河揉進法杖，杖尖流出來的是星星做的光。',
    flavour: '許願吧——反正都會實現。',
    moves: [['X', '星光束'], ['↑+X', '星雨'], ['按住 50 幀放開', '蓄力・銀河爆']],
    m1: {
      dur: 30, fps: 12, lock: true, maxHold: 600,
      start(p, d) { d.box = null; },
      tick(p, d, t) {
        if (t >= 4 && t <= 24) {
          if (!d.box || d.box.dead) d.box = fbox(p, { w: 96, h: 18, dmg: 2, type: 'beam', ox: 6, oy: -10, life: 3, rehit: 6, knock: 1, pierce: true });
          else beat(d.box);
          if (t % 5 === 0) {
            vx('beam', p.cx + p.dir * 8, p.cy - 2, p.dir, 98, { width: 12, color: '#fff0a0', frames: 9, taper: true });
            vx('line', p.cx + p.dir * 8, p.cy - 2, p.cx + p.dir * 104, p.cy - 2, { color: '#ffffff', width: 2, frames: 6 });
            sfx('beam');
          }
          if (t % 2 === 0) {
            const x = p.cx + p.dir * rnd(14, 100);
            parts(x, p.cy - 2 + rnd(-6, 6), ['#ffffff', '#fff0a0', '#ffe040'], 1, { spread: 0.4, grav: 0, life: 14, up: 0, size: 1 });
            if (t % 8 === 0) KB.fx('fx_sparkle', x, p.cy - 2);
          }
        }
      },
    },
    m2move: {
      dur: 46, fps: 12, lock: false,
      start(p, d) { d.n = 0; vx('circle', p.cx, p.cy - 30, { r: 34, frames: 44, color: '#fff0a0', spin: 0.2 }); sfx('magic_circle'); },
      tick(p, d, t) {
        if (t % 5 === 2 && d.n < 8) {
          d.n++;
          const x = p.cx + rnd(-64, 64);
          shoot({
            spr: 'proj_mix_orb_star', x, y: p.cy - 120, vx: rnd(-0.6, 0.6), vy: 4.6, grav: 0.1,
            dmg: 4, w: 12, h: 12, life: 80, type: 'beam', trail: '#fff0a0', rotSpeed: 0.2,
            onWall(pr) { vx('burst', pr.cx, pr.cy, { n: 12, colors: ['#ffffff', '#fff0a0', '#ffe040'], speed: 2.4, life: 20, grav: 0.04 }); abox(pr.cx, pr.cy, 30, 26, { dmg: 3, type: 'beam', life: 6, rehit: 0 }); KB.fx('fx_sparkle', pr.cx, pr.cy); },
            onHit(_t, pr) { KB.fx('fx_sparkle', pr.cx, pr.cy); vx('ring', pr.cx, pr.cy, { r0: 2, r1: 18, frames: 10, color: '#fff0a0', width: 2 }); },
          });
          vx('line', x, p.cy - 120, x, p.cy - 70, { color: '#fff0a0', width: 1, frames: 6 });
        }
      },
    },
    ult: {
      anim: 'kirby_attack_starmage_ult', dur: 62, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#fff0a0', '銀河爆');
        vx('worldTint', '#201850', 0.44, 56);
        vx('circle', p.cx, p.cy, { r: 46, frames: 50, color: '#fff0a0', spin: 0.26 });
        d.n = 0; sfx('magic_big');
      },
      tick(p, d, t) {
        p.vx *= 0.82;
        if (t < 34 && t % 2 === 0) {
          const a = t * 0.6, r = 54 - t;
          parts(p.cx + Math.cos(a) * Math.abs(r), p.cy + Math.sin(a) * Math.abs(r) * 0.8, ['#ffffff', '#fff0a0', '#ffe040'], 2, { spread: 0.3, grav: 0, life: 18, up: 0, size: 1 });
        }
        if (t === 36) {
          abox(p.cx, p.cy, 230, 180, { dmg: 10, type: 'beam', life: 20, rehit: 20, knock: 2.4, pierce: true });
          vx('flash', '#ffffff', 12, 0.85); vx('zoom', 1.16, 18);
          for (let i = 0; i < 5; i++) vx('ring', p.cx, p.cy, { r0: 6 + i * 6, r1: 120, frames: 22 + i * 3, color: i % 2 ? '#fff0a0' : '#ffffff', width: 3 });
          vx('burst', p.cx, p.cy, { n: 40, colors: ['#ffffff', '#fff0a0', '#ffe040', '#b0a0ff'], speed: 4.2, life: 34, grav: 0 });
          shake(10); hitstop(6); sfx('magic_big');
        }
        if (t > 36 && t % 4 === 0) KB.fx('fx_sparkle', p.cx + rnd(-70, 70), p.cy + rnd(-50, 50));
      },
    },
  });

  // ======================================================================
  // 11. frostdragon 冰龍（ice + dragon）
  // ======================================================================
  build(COMBOS[10], {
    m2: 'air',
    desc: '龍的肺裡裝的是暴風雪，一口氣就能把整條走廊封起來。',
    flavour: '牠打噴嚏的那天，湖面到現在還沒化。',
    moves: [['X', '冰息凍結'], ['空中 X', '冰翼俯衝'], ['按住 50 幀放開', '蓄力・冰龍彈']],
    m1: {
      dur: 34, fps: 12, lock: true, maxHold: 600,
      start(p, d) { d.box = null; sfx('dragon_breath'); },
      tick(p, d, t) {
        if (t <= 30) {
          const len = Math.min(62, 18 + t * 2);
          if (d.box) d.box.dead = true;
          d.box = fbox(p, { w: len, h: 26, dmg: 2, type: 'ice', ox: 6, oy: -14, life: 3, rehit: 6, freeze: true, knock: 0.8 });
          for (let i = 0; i < 2; i++) {
            const dx = rnd(10, len + 8);
            parts(p.cx + p.dir * dx, p.cy - 2 + rnd(-1, 1) * dx * 0.18, ['#ffffff', '#b8f0ff', '#3f96d8'], 1, { spread: 0.4, grav: 0, life: 18, up: 0, vx: p.dir * 1.6, size: 2 });
          }
          if (t % 8 === 0) { KB.fx('fx_ice', p.cx + p.dir * (len * 0.7), p.cy - 2); sfx('ice'); }
          if (t % 12 === 0) vx('circle', p.cx + p.dir * 18, p.cy - 2, { r: 14, frames: 12, color: '#b8f0ff', spin: -0.2 });
        }
      },
    },
    m2move: {
      dur: 46, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vx = p.dir * 5; p.vy = 4.6;
        vx('afterimage', p, { frames: 40, color: '#b8f0ff', every: 2, alpha: 0.55 });
        vx('sparkTrail', p, { color: ['#ffffff', '#b8f0ff'], every: 2, life: 16, frames: 40 });
        sfx('dragon_dash');
      },
      tick(p, d, t) {
        if (!d.landed) {
          p.vx = p.dir * 5; p.vy = Math.max(p.vy, 4.4);
          if (!d.box || d.box.dead) d.box = fbox(p, { w: 32, h: 28, dmg: 6, type: 'ice', ox: -16, oy: -8, life: 3, rehit: 10, freeze: true, knock: 2, flipWithOwner: false });
          else beat(d.box);
          if (p.onGround && t > 3) {
            d.landed = true; killBox(p);
            const gy = p.bottom;
            abox(p.cx, gy - 16, 66, 36, { dmg: 6, type: 'ice', life: 12, rehit: 0, freeze: true, knock: 2 });
            for (const s of [-1, 1]) {
              const x = p.cx + s * 26;
              shoot({ spr: 'proj_mix_spike_ice', x, y: gy - 16, vx: 0, vy: 0, dmg: 4, w: 12, h: 30, life: 22, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
              vx('shockwave', p.cx, gy, { w: 32, h: 14, dir: s, speed: 4.4, frames: 16, color: '#b8f0ff' });
            }
            vx('ring', p.cx, gy - 8, { r0: 4, r1: 44, frames: 16, color: '#d8f4ff', width: 3 });
            vx('burst', p.cx, gy - 8, { n: 24, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3.4, life: 26, grav: 0.05, size: 2 });
            shake(8); hitstop(4); sfx('ice');
            p.attackTimer = Math.min(p.attackTimer, 16);
          }
        } else p.vx *= 0.8;
      },
    },
    ult: {
      anim: 'kirby_attack_frostdragon_ult', dur: 52, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#8fdcff', '冰龍彈'); vx('worldTint', '#60a8e0', 0.36, 46); d.fired = false; sfx('dragon_breath'); },
      tick(p, d, t) {
        p.vx *= 0.8;
        if (t < 18 && t % 2 === 0) {
          const a = t * 0.5, r = 26 - t * 0.8;
          parts(p.cx + p.dir * 20 + Math.cos(a) * r, p.cy - 2 + Math.sin(a) * r, ['#ffffff', '#b8f0ff'], 2, { spread: 0.2, grav: 0, life: 14, up: 0, size: 2 });
        }
        if (t === 18 && !d.fired) {
          d.fired = true;
          shoot({
            spr: 'proj_mix_orb_ice', x: p.cx + p.dir * 20, y: p.cy - 11, vx: p.dir * 3.4, dmg: 12, w: 28, h: 28,
            life: 110, pierce: true, type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff', scale: 2.4, knock: 3,
            destructible: false, breakBlocks: true,
            onHit(_t, pr) { vx('ring', pr.cx, pr.cy, { r0: 6, r1: 40, frames: 14, color: '#d8f4ff', width: 3 }); vx('burst', pr.cx, pr.cy, { n: 16, colors: ['#ffffff', '#b8f0ff'], speed: 3, life: 22, grav: 0.03 }); shake(4); },
            onWall(pr) {
              abox(pr.cx, pr.cy, 70, 60, { dmg: 8, type: 'ice', life: 10, rehit: 0, freeze: true });
              vx('ring', pr.cx, pr.cy, { r0: 6, r1: 56, frames: 18, color: '#d8f4ff', width: 3 });
              vx('burst', pr.cx, pr.cy, { n: 28, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3.8, life: 28, grav: 0.04, size: 2 });
              vx('flash', '#d8f4ff', 8, 0.55); shake(8);
            },
          });
          vx('beam', p.cx + p.dir * 16, p.cy - 2, p.dir, 110, { width: 22, color: '#b8f0ff', frames: 14, taper: true });
          vx('flash', '#d8f4ff', 8, 0.5); vx('zoom', 1.1, 14);
          p.vx = -p.dir * 2.4; shake(7); hitstop(4);
        }
        if (t > 18 && t % 5 === 0) parts(p.cx + p.dir * rnd(20, 120), p.cy + rnd(-14, 14), ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: 0, life: 18, up: 0, size: 1 });
      },
    },
  });

  // ======================================================================
  // 12. thundermech 雷電機甲（spark + mech）
  // ======================================================================
  build(COMBOS[11], {
    m2: 'up',
    desc: '裝甲接上高壓線圈，拳頭落點會拉出一整束電弧。',
    flavour: '啟動音：嗶——啵。然後房間就沒電了。',
    moves: [['X', '電磁拳'], ['↑+X', '雷射飛彈'], ['按住 50 幀放開', '蓄力・EMP 全畫面']],
    m1: {
      dur: 26, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 5 || t === 15) {
          const x = p.cx + p.dir * 22, y = p.cy - 2;
          d.box = fbox(p, { w: 38, h: 28, dmg: 6, type: 'spark', ox: 2, oy: -15, life: 5, rehit: 0, knock: 2.6, flipWithOwner: true });
          const tgt = nearest(x, y, 120);
          vx('lightning', x, y, tgt ? tgt.cx : x + p.dir * 70, tgt ? tgt.cy : y, { color: '#fff8c0', frames: 12, jitter: 6, branches: 3 });
          if (tgt) abox(tgt.cx, tgt.cy, 26, 26, { dmg: 3, type: 'spark', life: 5, rehit: 0 });
          vx('ring', x, y, { r0: 3, r1: 26, frames: 12, color: '#fff8c0', width: 2 });
          vx('burst', x, y, { n: 14, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 2.8, life: 18, grav: 0 });
          KB.fx('fx_gear', x, y);
          shake(5); hitstop(2); sfx('rocket_punch');
        }
      },
    },
    m2move: {
      dur: 38, fps: 12, lock: true,
      tick(p, d, t) {
        if (t === 6 || t === 16) {
          const s = t === 6 ? -1 : 1;
          const pr = new MixHoming({
            spr: 'proj_mix_bolt_spark', x: p.cx + s * 6, y: p.cy - 10, vx: p.dir * 2.2, vy: -4.4,
            dmg: 5, w: 14, h: 10, life: 86, owner: 'player', type: 'spark', dir: p.dir,
            turn: 0.14, seek: 210, delay: 14, trailCol: ['#fff8c0', '#c8d0e0'],
            onHit(_t, q) {
              abox(q.cx, q.cy, 40, 34, { dmg: 4, type: 'spark', life: 6, rehit: 0, knock: 2 });
              vx('ring', q.cx, q.cy, { r0: 3, r1: 30, frames: 14, color: '#fff8c0', width: 2 });
              vx('burst', q.cx, q.cy, { n: 16, colors: ['#fff8c0', '#ffffff'], speed: 3, life: 20, grav: 0.04 });
              shake(4);
            },
            onWall(q) {
              abox(q.cx, q.cy, 40, 34, { dmg: 4, type: 'spark', life: 6, rehit: 0 });
              vx('burst', q.cx, q.cy, { n: 14, colors: ['#fff8c0', '#ffffff'], speed: 2.8, life: 18, grav: 0.04 });
              shake(3);
            },
          });
          KB.spawn(pr);
          vx('line', p.cx, p.cy - 8, p.cx + s * 10, p.cy - 30, { color: '#fff8c0', width: 1, frames: 5 });
          sfx('missile');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_thundermech_ult', dur: 62, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#80c8ff', 'EMP');
        vx('worldTint', '#102048', 0.5, 56);
        vx('circle', p.cx, p.cy, { r: 42, frames: 48, color: '#80c8ff', spin: 0.3 });
        d.n = 0; sfx('spark');
      },
      tick(p, d, t) {
        p.vx *= 0.85;
        if (t < 30 && t % 3 === 0) {
          const a = rnd(0, Math.PI * 2), r = rnd(16, 40);
          vx('lightning', p.cx, p.cy, p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, { color: '#80c8ff', frames: 8, jitter: 4, branches: 1 });
        }
        if (t === 30) {
          const g = KB.game, cx = g && g.cam ? g.cam.x + 128 : p.cx, cy = g && g.cam ? g.cam.y + 96 : p.cy;
          abox(cx, cy, 272, 200, { dmg: 8, type: 'spark', life: 36, rehit: 20, knock: 2, pierce: true });
          for (let i = 0; i < 12; i++) {
            const x = cx - 128 + i * 22;
            vx('lightning', x, cy - 100, x + rnd(-18, 18), cy + 100, { color: '#fff8c0', frames: 16, jitter: 10, branches: 3 });
          }
          vx('flash', '#ffffff', 14, 0.9); vx('zoom', 1.18, 20);
          vx('ring', p.cx, p.cy, { r0: 8, r1: 150, frames: 24, color: '#80c8ff', width: 4 });
          vx('burst', p.cx, p.cy, { n: 36, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 4.4, life: 30, grav: 0 });
          shake(12); hitstop(6); sfx('spark');
        }
        if (t > 30 && t % 5 === 0) { vx('worldTint', '#4878f8', 0.18, 6); parts(p.cx + rnd(-90, 90), p.cy + rnd(-70, 70), ['#fff8c0', '#80c8ff'], 2, { spread: 0.5, grav: 0, life: 16, up: 0, size: 1 }); }
      },
    },
  });

  // ======================================================================
  //  Round 9：補齊 ↑+X / ↓+X / 空中 X（每組五招：X / ↑X / ↓X / 空中 X / 蓄力）
  //  規則：
  //   ‧ ↑X = 對空升招（判定框從腳邊掃到頭頂上方）；在空中使用時用 echo() 把餘波
  //     打到腳下地面，所以「空中 ↑X」一樣打得到地面上的敵人（不合理者的空中變體）。
  //   ‧ ↓X = 對地招（一律以 groundY(p) 為基準），在地面與空中的演出一致，
  //     空中使用時只加一點點緩降（slowFall，不超過招式長度且 ≤ 30 幀）。
  //   ‧ 空中 X = 俯衝 / 滯空射擊；滯空一律用 slowFall 且招式長度 ≤ 30 幀。
  // ======================================================================
  // ↑X 的「地面餘波」：升招一定會震到腳下的地面（空中出招時打在下方地面上，範圍 / 傷害較大）
  function echo(p, o) {
    const air = !p.onGround, gy = groundY(p), x = p.cx + p.dir * 6;
    const w = air ? (o.w || 48) : Math.round((o.w || 48) * 0.75);
    const h = abox(x, gy - 11, w, o.h || 24, {
      dmg: air ? (o.dmg || 4) : Math.max(2, (o.dmg || 4) - 2), type: o.type, life: 12, rehit: 0, knock: 1.2, freeze: !!o.freeze,
    });
    vx('ring', x, gy - 6, { r0: 3, r1: 26, frames: 12, color: o.color, width: 2 });
    vx('burst', x, gy - 6, { n: 12, colors: o.cols, speed: 2.6, life: 18, grav: 0.05 });
    parts(x + rnd(-16, 16), gy - 4, o.cols, 3, { spread: 0.7, grav: -0.04, life: 18, up: 0.5, size: 1 });
    shake(3);
    return h;
  }
  // 升招起跳（站在地上才彈起來；空中出招不再加速度，重力照常）
  const hop = (p, v) => { if (p.onGround) { p.vy = v; p.onGround = false; } };
  const para9 = (e, f) => { try { if (KB.ELEM && KB.ELEM.paralyze) KB.ELEM.paralyze(e, f || 90); } catch (_) { } };

  // ---------- 1. flamesword 炎劍 ----------
  addMoves('flamesword', {
    up: {
      dur: 28, fps: 14, lock: true,
      start(p, d) {
        hop(p, -4.2); p.vx = p.dir * 1.1;
        d.box = abox(p.cx + p.dir * 10, p.cy - 20, 32, 58, { dmg: 6, type: 'fire', life: 10, rehit: 0, knock: 2.2, onHit: e => { e.vy = -4.4; } });
        shoot({ spr: 'proj_mix_spike_fire', x: p.cx + p.dir * 10, y: p.cy - 26, vx: p.dir * 0.6, vy: -5.2, dmg: 4, w: 12, h: 30, life: 34, solid: false, pierce: true, type: 'fire', trail: '#ff9020' });
        vx('slash', p.cx + p.dir * 10, p.cy - 12, 24, -1.6, { color: '#ffb040', width: 3, frames: 12, arc: 2.4, flip: p.dir < 0 });
        vx('burst', p.cx + p.dir * 10, p.cy - 20, { n: 16, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3, life: 22, grav: -0.04, dir: -Math.PI / 2, spread: 0.7 });
        echo(p, { type: 'fire', color: '#ff9020', cols: ['#ffe040', '#ff9020'], dmg: 5 });
        shake(4); sfx('sword'); sfx('fire');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-8, 8), p.cy - rnd(0, 26), ['#ffe040', '#ff9020'], 2, { spread: 0.4, grav: -0.08, life: 16, up: 0.7, size: 1 });
        if (t === 14) killBox(p);
      },
    },
    dn: {
      dur: 32, fps: 14, lock: true,
      start(p, d) {
        d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4);
        vx('afterimage', p, { frames: 18, color: '#ff8030', every: 2, alpha: 0.5 });
        sfx('sword');
      },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p), x = p.cx + p.dir * 28;
          abox(x, gy - 13, 78, 22, { dmg: 6, type: 'fire', life: 16, rehit: 0, knock: 2, onHit: e => { e.vy = -3.2; } });
          firePool(p.cx + p.dir * 16, gy, 48, 3);
          for (let i = 0; i < 3; i++) {
            vx('shockwave', p.cx + p.dir * (10 + i * 22), gy, { w: 30, h: 14, dir: p.dir, speed: 4.4, frames: 16, color: '#ff9020' });
            parts(p.cx + p.dir * (12 + i * 22), gy - 4, ['#ffe040', '#ff9020', '#ff4010'], 4, { spread: 0.8, grav: -0.05, life: 20, up: 0.8, size: 1 });
          }
          vx('line', p.cx, gy - 4, p.cx + p.dir * 64, gy - 4, { color: '#ffe040', width: 2, frames: 10 });
          vx('flash', '#ff9020', 5, 0.35);
          shake(6); hitstop(3); sfx('hammer');
        }
      },
    },
  }, [['X', '火焰劍氣三連'], ['↑+X', '昇炎斬'], ['↓+X', '熔劍・地脈斬'], ['空中 X', '落下爆炎斬'], ['按住 50 幀放開', '蓄力・火龍捲']]);

  // ---------- 2. frostsword 冰劍 ----------
  addMoves('frostsword', {
    dn: {
      dur: 34, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 3.6); sfx('ice'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 4.6);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p), x = p.cx + p.dir * 26;
          abox(x, gy - 12, 74, 20, { dmg: 5, type: 'ice', life: 18, rehit: 0, freeze: true, knock: 1.2 });
          for (let i = 0; i < 3; i++) {
            const sx = p.cx + p.dir * (16 + i * 20);
            shoot({ spr: 'proj_mix_spike_ice', x: sx, y: gy - 14, vx: 0, vy: 0, dmg: 4, w: 10, h: 26, life: 30, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false, scale: 0.9 });
            parts(sx, gy - 6, ['#ffffff', '#b8f0ff'], 3, { spread: 0.7, grav: 0.05, life: 18, up: 0.6, size: 1 });
          }
          vx('line', p.cx, gy - 3, p.cx + p.dir * 62, gy - 3, { color: '#b8f0ff', width: 2, frames: 12 });
          vx('shockwave', p.cx, gy, { w: 34, h: 14, dir: p.dir, speed: 4.6, frames: 18, color: '#b8f0ff' });
          shake(5); hitstop(2); sfx('icewall');
        }
      },
    },
    air: {
      dur: 40, fps: 14, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 5.6; p.vx = p.dir * 1.4;
        vx('afterimage', p, { frames: 30, color: '#b8f0ff', every: 2, alpha: 0.55 });
        vx('circle', p.cx, p.cy, { r: 22, frames: 22, color: '#d8f4ff', spin: -0.34 });
        sfx('ice');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 5.2);
        d.box = fbox(p, { w: 30, h: 30, dmg: 4, type: 'ice', ox: -15, oy: -15, life: 3, rehit: 8, freeze: true, flipWithOwner: false });
        if (t % 2 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-8, 8), ['#ffffff', '#b8f0ff'], 2, { spread: 0.6, grav: 0.02, life: 14, up: 0, size: 1 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          abox(p.cx, p.bottom - 13, 64, 32, { dmg: 7, type: 'ice', life: 14, rehit: 0, freeze: true, knock: 2 });
          shoot({ spr: 'proj_mix_spike_ice', x: p.cx + p.dir * 22, y: p.bottom - 16, vx: 0, vy: 0, dmg: 5, w: 12, h: 30, life: 26, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          vx('ring', p.cx, p.bottom - 6, { r0: 4, r1: 40, frames: 16, color: '#b8f0ff', width: 3 });
          vx('burst', p.cx, p.bottom - 6, { n: 22, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3.2, life: 24, grav: 0.05, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'FROST!', { color: '#b8f0ff', size: 8, frames: 28, rise: 0.5 });
          shake(7); hitstop(3); sfx('icewall');
          p.attackTimer = Math.min(p.attackTimer, 14);
        }
      },
    },
  }, [['X', '冰晶斬・凍結'], ['↑+X', '冰柱上挑'], ['↓+X', '霜牙裂地'], ['空中 X', '冰華回旋墜'], ['按住 50 幀放開', '蓄力・冰河']]);

  // ---------- 3. thunderblade 雷刀 ----------
  addMoves('thunderblade', {
    up: {
      dur: 26, fps: 16, lock: true,
      start(p, d) {
        hop(p, -4.6);
        const x = p.cx + p.dir * 8;
        d.box = abox(x, p.cy - 28, 26, 74, { dmg: 6, type: 'spark', life: 10, rehit: 0, knock: 2.4, onHit: e => { e.vy = -5; para9(e, 90); } });
        vx('lightning', x, p.cy + 8, x, p.cy - 62, { color: '#fff8c0', frames: 14, jitter: 6, branches: 4 });
        vx('slash', x, p.cy - 14, 24, -1.7, { color: '#fff8c0', width: 3, frames: 12, arc: 2.6, flip: p.dir < 0 });
        vx('flash', '#fff8c0', 5, 0.4);
        echo(p, { type: 'spark', color: '#fff8c0', cols: ['#fff8c0', '#ffffff', '#4878f8'], dmg: 5 });
        shake(4); sfx('iai');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-8, 8), p.cy - rnd(0, 40), ['#fff8c0', '#ffffff'], 1, { spread: 0.3, grav: 0, life: 12, up: 0.4, size: 1 });
        if (t === 12) killBox(p);
      },
    },
    air: {
      dur: 30, fps: 16, lock: true,
      start(p, d) {
        const x0 = p.cx, y0 = p.cy, gy = groundY(p);
        const ty = Math.min(gy - 10, p.cy + 56);
        p.y += Math.max(0, ty - p.cy); p.vy = 2;
        vx('afterimage', p, { frames: 22, color: '#fff8c0', every: 1, alpha: 0.6 });
        vx('lightning', x0, y0, p.cx, p.cy, { color: '#fff8c0', frames: 12, jitter: 7, branches: 3 });
        vx('lightning', p.cx, p.cy, p.cx + p.dir * 20, gy, { color: '#ffffff', frames: 10, jitter: 5, branches: 2 });
        abox(p.cx + p.dir * 12, gy - 16, 46, 34, { dmg: 6, type: 'spark', life: 12, rehit: 0, knock: 2.2, onHit: e => para9(e, 100) });
        vx('slash', p.cx + p.dir * 10, gy - 16, 22, 0.5, { color: '#fff8c0', width: 3, frames: 10, arc: 2.4, flip: p.dir < 0 });
        vx('burst', p.cx + p.dir * 12, gy - 12, { n: 16, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3, life: 18, grav: 0.04 });
        shake(5); hitstop(2); sfx('teleport');
      },
      tick(p, d, t) {
        slowFall(p, 2.4);
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-10, 10), ['#fff8c0', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 10, up: 0, size: 1 });
      },
    },
  }, [['X', '雷光一閃（全畫面）'], ['↑+X', '天雷居合'], ['↓+X', '雷步瞬移斬'], ['空中 X', '空蟬雷斬'], ['按住 50 幀放開', '蓄力・雷神']]);

  // ---------- 4. flamegun 火焰槍 ----------
  addMoves('flamegun', {
    up: {
      dur: 30, fps: 14, lock: true,
      start(p, d) {
        d.burst = false;
        shoot({ spr: 'proj_mix_bolt_fire', x: p.cx + p.dir * 6, y: p.cy - 10, vx: p.dir * 0.8, vy: -6.4, rot: -Math.PI / 2, dmg: 4, w: 10, h: 18, life: 20, type: 'fire', trail: '#ff9020', solid: false });
        KB.fx('fx_muzzle', p.cx + p.dir * 10, p.cy - 8, { flip: p.dir < 0 });
        sfx('gun');
      },
      tick(p, d, t) {
        if (t === 12 && !d.burst) {
          d.burst = true;
          const x = p.cx + p.dir * 12, y = p.cy - 44;
          abox(x, y, 46, 38, { dmg: 6, type: 'fire', life: 14, rehit: 0, knock: 1.8 });
          for (let i = -1; i <= 2; i++) {
            shoot({ spr: 'proj_mix_orb_fire', x: x + i * 8, y, vx: i * 1.1, vy: 1.4, grav: 0.2, dmg: 4, w: 10, h: 10, life: 60, type: 'fire', trail: '#ff9020', onWall(pr) { firePool(pr.cx, pr.bottom, 40, 3); }, onHit(_t, pr) { firePool(pr.cx, pr.bottom, 40, 3); } });
          }
          vx('ring', x, y, { r0: 4, r1: 30, frames: 14, color: '#ffe040', width: 2 });
          vx('burst', x, y, { n: 20, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.2, life: 24, grav: 0.06 });
          vx('flash', '#ff9020', 5, 0.4);
          echo(p, { type: 'fire', color: '#ff9020', cols: ['#ffe040', '#ff9020'], dmg: 4 });
          shake(4); sfx('fireball');
        }
      },
    },
    air: {
      dur: 28, fps: 14, lock: false,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#ff9028', r: 16, frames: 26 }); },
      tick(p, d, t) {
        slowFall(p, 1.4);
        if (t % 5 === 1 && d.n < 5) {
          d.n++;
          const mx = p.cx + p.dir * 10, my = p.cy + 4;
          shoot({
            spr: 'proj_mix_orb_fire', x: mx, y: my, vx: p.dir * (2.2 + d.n * 0.3), vy: 2.6, grav: 0.22,
            dmg: 4, w: 10, h: 10, life: 60, type: 'fire', dir: p.dir, trail: '#ff9020',
            onWall(pr) { firePool(pr.cx, pr.bottom, 46, 3); vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 2.2, life: 16, grav: 0.05 }); },
            onHit(_t, pr) { firePool(pr.cx, pr.bottom, 46, 3); },
          });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          parts(mx, my, ['#ffe040', '#ff9020'], 2, { spread: 0.5, grav: -0.05, life: 14, up: 0.3, size: 1 });
          sfx('gun'); shake(1);
        }
      },
    },
  }, [['X', '燃燒彈 + 地面火海'], ['↑+X', '曳火信號彈'], ['↓+X', '霰彈火牆'], ['空中 X', '浮空火力壓制'], ['按住 50 幀放開', '蓄力・火箭砲']]);

  // ---------- 5. frostgun 冰彈槍 ----------
  addMoves('frostgun', {
    up: {
      dur: 30, fps: 14, lock: true,
      start(p, d) {
        d.burst = false;
        shoot({ spr: 'proj_mix_bolt_ice', x: p.cx + p.dir * 6, y: p.cy - 10, vx: p.dir * 0.6, vy: -6.2, rot: -Math.PI / 2, dmg: 4, w: 10, h: 18, life: 20, type: 'ice', trail: '#b8f0ff', solid: false, freeze: true });
        KB.fx('fx_muzzle', p.cx + p.dir * 10, p.cy - 8, { flip: p.dir < 0 });
        sfx('gun');
      },
      tick(p, d, t) {
        if (t === 12 && !d.burst) {
          d.burst = true;
          const x = p.cx + p.dir * 10, y = p.cy - 42;
          abox(x, y, 48, 46, {
            dmg: 5, type: 'ice', life: 34, rehit: 12, freeze: true, knock: 1,
            onUpdate(h) { if ((h.life & 3) === 0) parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#ffffff', '#b8f0ff'], 2, { spread: 0.4, grav: 0.01, life: 20, up: 0, size: 1 }); },
          });
          vx('circle', x, y, { r: 26, frames: 26, color: '#b8f0ff', spin: 0.18 });
          vx('burst', x, y, { n: 20, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 2.8, life: 26, grav: 0.02 });
          echo(p, { type: 'ice', color: '#b8f0ff', cols: ['#ffffff', '#b8f0ff'], dmg: 4, freeze: true });
          shake(3); sfx('icewall');
        }
      },
    },
    air: {
      dur: 28, fps: 14, lock: false,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#9fe8ff', r: 16, frames: 26 }); },
      tick(p, d, t) {
        slowFall(p, 1.4);
        if (t % 5 === 1 && d.n < 5) {
          d.n++;
          const mx = p.cx + p.dir * 10, my = p.cy + 4;
          shoot({ spr: 'proj_mix_orb_ice', x: mx, y: my, vx: p.dir * (1.8 + d.n * 0.3), vy: 2.8, grav: 0.2, dmg: 4, w: 10, h: 10, life: 60, type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff' });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          parts(mx, my, ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: 0.02, life: 16, up: 0, size: 1 });
          sfx('gun');
        }
        if (t === 24) {
          const gy = groundY(p);
          abox(p.cx + p.dir * 10, gy - 10, 50, 20, { dmg: 4, type: 'ice', life: 20, rehit: 0, freeze: true, knock: 1 });
          vx('line', p.cx - 24, gy - 3, p.cx + p.dir * 34, gy - 3, { color: '#b8f0ff', width: 2, frames: 12 });
        }
      },
    },
  }, [['X', '凍結彈'], ['↑+X', '凍空曳彈'], ['↓+X', '冰霧散彈'], ['空中 X', '霜降掃射'], ['按住 50 幀放開', '蓄力・絕對零度光束']]);

  // ---------- 6. thunderbow 雷弓 ----------
  addMoves('thunderbow', {
    up: {
      dur: 32, fps: 14, lock: true,
      start(p, d) {
        d.fired = false;
        shoot({ spr: 'proj_mix_bolt_spark', x: p.cx + p.dir * 6, y: p.cy - 10, vx: p.dir * 0.4, vy: -7, rot: -Math.PI / 2, dmg: 3, w: 10, h: 16, life: 18, type: 'spark', trail: '#fff8c0', solid: false });
        vx('line', p.cx, p.cy - 6, p.cx + p.dir * 4, p.cy - 60, { color: '#fff8c0', width: 1, frames: 8 });
        sfx('bow');
      },
      tick(p, d, t) {
        if (t === 14 && !d.fired) {
          d.fired = true;
          const tgt = nearest(p.cx, p.cy, 190);
          const x = tgt ? tgt.cx : p.cx + p.dir * 30;
          const gy = tgt ? tgt.bottom + 2 : groundY(p);
          vx('lightning', x, gy - 116, x, gy, { color: '#fff8c0', frames: 16, jitter: 8, branches: 4 });
          abox(x, gy - 58, 24, 120, { dmg: 6, type: 'spark', life: 12, rehit: 0, knock: 1.8, onHit: e => para9(e, 110) });
          vx('burst', x, gy - 6, { n: 16, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3, life: 20, grav: 0.04 });
          vx('flash', '#fff8c0', 5, 0.42);
          shake(5); sfx('thunder');
        }
      },
    },
    dn: {
      dur: 34, fps: 14, lock: true,
      start(p, d) {
        d.n = 0;
        const gy = groundY(p);
        shoot({ spr: 'proj_mix_bolt_spark', x: p.cx + p.dir * 8, y: p.cy + 2, vx: p.dir * 2.2, vy: 4.6, dmg: 3, w: 10, h: 16, life: 24, type: 'spark', trail: '#fff8c0', solid: false });
        vx('line', p.cx, p.cy, p.cx + p.dir * 16, gy - 2, { color: '#fff8c0', width: 1, frames: 8 });
        sfx('bow');
      },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 3.4);
        if (t % 6 === 2 && d.n < 3) {
          const i = d.n++, gy = groundY(p), x = p.cx + p.dir * (20 + i * 26);
          abox(x, gy - 12, 30, 22, { dmg: 5, type: 'spark', life: 10, rehit: 0, knock: 1.6, onHit: e => para9(e, 100) });
          vx('lightning', x - p.dir * 24, gy - 4, x, gy - 4, { color: '#fff8c0', frames: 10, jitter: 5, branches: 2 });
          vx('shockwave', x, gy, { w: 22, h: 12, dir: p.dir, speed: 4, frames: 12, color: '#ffe040' });
          parts(x, gy - 4, ['#fff8c0', '#ffffff'], 3, { spread: 0.7, grav: -0.04, life: 16, up: 0.5, size: 1 });
          shake(2); sfx('spark');
        }
      },
    },
  }, [['X', '追蹤雷箭'], ['↑+X', '穿雲雷矢'], ['↓+X', '地走雷弦'], ['空中 X', '箭雨閃電'], ['按住 50 幀放開', '蓄力・天雷之矢']]);

  // ---------- 7. flamehammer 火鎚 ----------
  addMoves('flamehammer', {
    up: {
      dur: 30, fps: 12, lock: true,
      start(p, d) {
        hop(p, -4.4);
        const x = p.cx + p.dir * 10;
        d.box = abox(x, p.cy - 20, 36, 56, { dmg: 7, type: 'fire', life: 12, rehit: 0, knock: 2.6, onHit: e => { e.vy = -5; } });
        vx('slash', x, p.cy - 12, 26, -1.5, { color: '#ffb040', width: 4, frames: 12, arc: 2.5, flip: p.dir < 0 });
        vx('ring', x, p.cy - 10, { r0: 4, r1: 32, frames: 14, color: '#ffe040', width: 3 });
        vx('burst', x, p.cy - 18, { n: 20, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.2, life: 24, grav: -0.06, dir: -Math.PI / 2, spread: 0.8 });
        echo(p, { type: 'fire', color: '#ff9020', cols: ['#ffe040', '#ff9020'], dmg: 5, w: 52 });
        shake(5); hitstop(2); sfx('hammer'); sfx('fire');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + p.dir * 10 + rnd(-10, 10), p.cy - rnd(0, 30), ['#ffe040', '#ff9020'], 2, { spread: 0.5, grav: -0.1, life: 18, up: 0.9, size: 1 });
        if (t === 14) killBox(p);
      },
    },
    dn: {
      dur: 34, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4.4); sfx('hammer'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5.2);
        if (t === 9 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx, gy - 14, 90, 26, { dmg: 8, type: 'fire', life: 16, rehit: 0, knock: 2.6, onHit: e => { e.vy = -3.4; } });
          firePool(p.cx - 32, gy, 50, 3); firePool(p.cx + 32, gy, 50, 3);
          vx('shockwave', p.cx, gy, { w: 44, h: 18, dir: 1, speed: 5.2, frames: 18, color: '#ff9020' });
          vx('shockwave', p.cx, gy, { w: 44, h: 18, dir: -1, speed: 5.2, frames: 18, color: '#ff9020' });
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 48, frames: 16, color: '#ffe040', width: 3 });
          vx('burst', p.cx, gy - 6, { n: 26, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.6, life: 26, grav: 0.05, size: 2 });
          vx('flash', '#ff9020', 6, 0.45);
          shake(8); hitstop(4); sfx('meteor');
        }
      },
    },
  }, [['X', '爆炎鎚・落地火柱'], ['↑+X', '噴焰昇鎚'], ['↓+X', '熔岩震地'], ['空中 X', '火焰迴旋'], ['按住 50 幀放開', '蓄力・隕石鎚']]);

  // ---------- 8. stonehammer 岩鎚 ----------
  addMoves('stonehammer', {
    dn: {
      dur: 34, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4.2); sfx('hammer'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5);
        if (t === 9 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx + p.dir * 20, gy - 15, 64, 28, { dmg: 7, type: 'stone', life: 16, rehit: 0, knock: 2.2, onHit: e => { e.vy = -3.6; } });
          for (let i = 0; i < 3; i++) {
            const x = p.cx + p.dir * (16 + i * 20);
            shoot({ spr: 'proj_mix_spike_stone', x, y: gy - 16, vx: 0, vy: 0, dmg: 5, w: 12, h: 30, life: 28, solid: false, pierce: true, type: 'stone', destructible: false });
            parts(x, gy - 6, ['#c0b098', '#8a7a62'], 4, { spread: 0.8, grav: 0.08, life: 22, up: 0.8, size: 2 });
          }
          vx('shockwave', p.cx, gy, { w: 40, h: 16, dir: p.dir, speed: 5, frames: 20, color: '#c0b098' });
          vx('ring', p.cx, gy - 6, { r0: 3, r1: 40, frames: 16, color: '#d8ccb8', width: 3 });
          shake(8); hitstop(3); sfx('hardblock');
        }
      },
    },
    air: {
      dur: 44, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 7.4; p.vx = p.dir * 0.8;
        vx('afterimage', p, { frames: 30, color: '#c0b098', every: 2, alpha: 0.5 });
        sfx('hammer');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 6.8);
        d.box = fbox(p, { w: 28, h: 26, dmg: 5, type: 'stone', ox: -14, oy: -4, life: 3, rehit: 8, flipWithOwner: false });
        if (t % 3 === 0) parts(p.cx + rnd(-8, 8), p.cy, ['#c0b098', '#8a7a62'], 2, { spread: 0.5, grav: -0.04, life: 14, up: 0.3, size: 1 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          abox(p.cx, p.bottom - 16, 84, 36, { dmg: 8, type: 'stone', life: 14, rehit: 0, knock: 2.6, breakBlocks: true });
          for (const s of [-1, 1]) {
            shoot({ spr: 'proj_mix_orb_stone', x: p.cx + s * 12, y: p.bottom - 10, vx: s * 3.4, vy: -3.2, grav: 0.26, dmg: 5, w: 12, h: 12, life: 70, type: 'stone', bounce: 0.6, trail: '#c0b098' });
          }
          vx('shockwave', p.cx, p.bottom, { w: 44, h: 18, dir: 1, speed: 5, frames: 18, color: '#c0b098' });
          vx('shockwave', p.cx, p.bottom, { w: 44, h: 18, dir: -1, speed: 5, frames: 18, color: '#c0b098' });
          vx('burst', p.cx, p.bottom - 6, { n: 24, colors: ['#d8ccb8', '#c0b098', '#8a7a62'], speed: 3.4, life: 26, grav: 0.1, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'CRASH!', { color: '#d8ccb8', size: 8, frames: 30, rise: 0.5 });
          shake(9); hitstop(4); sfx('hardblock');
          p.attackTimer = Math.min(p.attackTimer, 16);
        }
      },
    },
  }, [['X', '地裂衝擊波三段'], ['↑+X', '岩石投擲（落地彈跳）'], ['↓+X', '碎岩斷層'], ['空中 X', '落磐衝擊'], ['按住 50 幀放開', '蓄力・地震']]);

  // ---------- 9. shadowblade 影刃 ----------
  addMoves('shadowblade', {
    up: {
      dur: 28, fps: 16, lock: true,
      start(p, d) {
        hop(p, -4);
        const x = p.cx + p.dir * 8;
        d.box = abox(x, p.cy - 22, 34, 60, { dmg: 6, type: 'cutter', life: 10, rehit: 0, knock: 2, onHit: e => { e.vy = -4.2; } });
        for (const a of [-1.25, -1.6]) {
          shoot({ spr: 'proj_mix_wave_shadow', x, y: p.cy - 10, vx: Math.cos(a) * 4.2 * (p.dir < 0 ? -1 : 1), vy: Math.sin(a) * 4.6, dmg: 4, w: 12, h: 16, life: 40, type: 'cutter', pierce: true, solid: false, trail: '#b070f0' });
        }
        vx('slash', x, p.cy - 14, 24, -1.6, { color: '#b070f0', width: 3, frames: 12, arc: 2.6, flip: p.dir < 0 });
        vx('circle', x, p.cy - 16, { r: 24, frames: 18, color: '#b070f0', spin: 0.4 });
        echo(p, { type: 'cutter', color: '#b070f0', cols: ['#b070f0', '#6a30a8'], dmg: 5 });
        shake(3); sfx('cutter');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy - rnd(0, 30), ['#b070f0', '#6a30a8'], 1, { spread: 0.4, grav: -0.05, life: 14, up: 0.5, size: 1 });
        if (t === 12) killBox(p);
      },
    },
    air: {
      dur: 34, fps: 16, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 5.2; p.vx = p.dir * 2;
        vx('afterimage', p, { frames: 26, color: '#b070f0', every: 1, alpha: 0.6 });
        for (const s of [-1, 1]) {
          shoot({ spr: 'proj_mix_wave_shadow', x: p.cx, y: p.cy, vx: s * 3.2, vy: 4.4, dmg: 4, w: 12, h: 16, life: 40, type: 'cutter', pierce: true, solid: false, trail: '#b070f0' });
        }
        vx('slash', p.cx, p.cy, 22, 0.8, { color: '#d8b0ff', width: 3, frames: 10, arc: 2.6, flip: p.dir < 0 });
        sfx('cutter');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 4.8);
        d.box = fbox(p, { w: 36, h: 36, dmg: 5, type: 'cutter', ox: -18, oy: -18, life: 3, rehit: 8, flipWithOwner: false });
        if (t % 2 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-10, 10), ['#b070f0', '#6a30a8'], 1, { spread: 0.5, grav: 0, life: 12, up: 0, size: 1 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          abox(p.cx, p.bottom - 13, 56, 26, { dmg: 6, type: 'cutter', life: 12, rehit: 0, knock: 2 });
          vx('ring', p.cx, p.bottom - 6, { r0: 3, r1: 34, frames: 14, color: '#b070f0', width: 2 });
          vx('burst', p.cx, p.bottom - 6, { n: 18, colors: ['#d8b0ff', '#b070f0', '#6a30a8'], speed: 3, life: 22, grav: 0.05 });
          shake(5); hitstop(2); sfx('cutter');
          p.attackTimer = Math.min(p.attackTimer, 12);
        }
      },
    },
  }, [['X', '三方向迴旋刃'], ['↑+X', '影月輪'], ['↓+X', '影分身刃陣'], ['空中 X', '暗墜十字斬'], ['按住 50 幀放開', '蓄力・千刃']]);

  // ---------- 10. starmage 星光法師 ----------
  addMoves('starmage', {
    dn: {
      dur: 40, fps: 12, lock: true,
      start(p, d) {
        d.done = false;
        vx('circle', p.cx, p.cy + 6, { r: 30, frames: 36, color: '#fff0a0', spin: 0.22 });
        sfx('magic_circle');
      },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 2.6);
        if (t === 10 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx + p.dir * 18, gy - 16, 88, 30, {
            dmg: 6, type: 'beam', life: 30, rehit: 12, knock: 1.4,
            onUpdate(h) { if ((h.life & 3) === 0) parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#fff0a0', '#ffffff', '#ffd040'], 2, { spread: 0.5, grav: -0.08, life: 20, up: 0.7, size: 1 }); },
          });
          for (let i = 0; i < 4; i++) {
            shoot({ spr: 'proj_mix_orb_star', x: p.cx + p.dir * (10 + i * 22), y: gy - 8, vx: p.dir * 0.4, vy: -3.6, grav: 0.1, dmg: 4, w: 10, h: 10, life: 60, type: 'beam', pierce: true, solid: false, trail: '#fff0a0' });
          }
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 46, frames: 18, color: '#fff0a0', width: 2 });
          vx('flash', '#fff0a0', 5, 0.35);
          shake(4); sfx('magic_big');
        }
      },
    },
    air: {
      dur: 30, fps: 12, lock: false,
      start(p, d) { d.n = 0; vx('circle', p.cx, p.cy, { r: 20, frames: 28, color: '#fff0a0', spin: -0.3 }); sfx('magic_circle'); },
      tick(p, d, t) {
        slowFall(p, 1.2);
        if (t % 3 === 1 && d.n < 8) {
          const i = d.n++;
          const a = 1.0 + (i % 4) * 0.28;
          shoot({ spr: 'proj_mix_orb_star', x: p.cx + rnd(-8, 8), y: p.cy + 6, vx: Math.cos(a) * 3.2 * (p.dir < 0 ? -1 : 1), vy: Math.sin(a) * 4, grav: 0.08, dmg: 4, w: 10, h: 10, life: 60, type: 'beam', pierce: true, solid: false, trail: '#fff0a0' });
          parts(p.cx, p.cy + 6, ['#fff0a0', '#ffffff'], 2, { spread: 0.5, grav: 0.02, life: 14, up: 0, size: 1 });
          sfx('beam');
        }
      },
    },
  }, [['X', '星光束'], ['↑+X', '星雨'], ['↓+X', '星塵魔法陣'], ['空中 X', '墜星彈幕'], ['按住 50 幀放開', '蓄力・銀河爆']]);

  // ---------- 11. frostdragon 冰龍 ----------
  addMoves('frostdragon', {
    up: {
      dur: 32, fps: 12, lock: true,
      start(p, d) {
        d.box = null;
        vx('aura', p, { color: '#8fdcff', r: 18, frames: 30 });
        sfx('dragon_breath');
      },
      tick(p, d, t) {
        if (t === 4) {
          const x = p.cx + p.dir * 4;
          d.box = abox(x, p.cy - 30, 28, 66, { dmg: 6, type: 'ice', life: 22, rehit: 8, freeze: true, knock: 1.2, onHit: e => { e.vy = -3.4; } });
          vx('circle', x, p.cy - 26, { r: 22, frames: 20, color: '#b8f0ff', spin: 0.2 });
        }
        if (t >= 4 && t <= 26 && t % 2 === 0) {
          const x = p.cx + p.dir * 4;
          parts(x + rnd(-10, 10), p.cy - rnd(0, 56), ['#ffffff', '#b8f0ff', '#3f96d8'], 2, { spread: 0.5, grav: -0.1, life: 22, up: 1.1, size: 1 });
          KB.fx('fx_ice', x + rnd(-8, 8), p.cy - rnd(6, 50), { life: 12, fps: 12 });
        }
        if (t === 8) echo(p, { type: 'ice', color: '#b8f0ff', cols: ['#ffffff', '#b8f0ff'], dmg: 5, freeze: true });
        if (t === 26) killBox(p);
      },
    },
    dn: {
      dur: 32, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 3.4); sfx('tail_whip'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 4.4);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx + p.dir * 24, gy - 13, 70, 24, { dmg: 6, type: 'ice', life: 20, rehit: 0, freeze: true, knock: 1.6 });
          for (let i = 0; i < 3; i++) {
            const x = p.cx + p.dir * (18 + i * 22);
            shoot({ spr: 'proj_mix_spike_ice', x, y: gy - 13, vx: 0, vy: 0, dmg: 4, w: 10, h: 24, life: 26, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false, scale: 0.85 });
          }
          for (let i = 0; i < 3; i++) vx('line', p.cx, gy - 4 - i * 3, p.cx + p.dir * 58, gy - 4 - i * 3, { color: i === 1 ? '#ffffff' : '#b8f0ff', width: 1, frames: 12 });
          vx('burst', p.cx + p.dir * 20, gy - 6, { n: 18, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3, life: 22, grav: 0.04 });
          shake(5); hitstop(2); sfx('icewall');
        }
      },
    },
  }, [['X', '冰息凍結'], ['↑+X', '凍天吐息'], ['↓+X', '霜爪裂地'], ['空中 X', '冰翼俯衝'], ['按住 50 幀放開', '蓄力・冰龍彈']]);

  // ---------- 12. thundermech 雷電機甲 ----------
  addMoves('thundermech', {
    dn: {
      dur: 34, fps: 14, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4.6); sfx('mech_step'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5.4);
        if (t === 9 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx, gy - 14, 78, 26, {
            dmg: 7, type: 'spark', life: 26, rehit: 10, knock: 2, onHit: e => para9(e, 110),
            onUpdate(h) { if ((h.life & 3) === 0) vx('lightning', h.x + 2, h.y + h.h - 3, h.x + h.w - 2, h.y + h.h - 3, { color: '#fff8c0', frames: 6, jitter: 5, branches: 2 }); },
          });
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 44, frames: 16, color: '#80c8ff', width: 3 });
          vx('burst', p.cx, gy - 6, { n: 22, colors: ['#fff8c0', '#80c8ff', '#4878f8'], speed: 3.2, life: 24, grav: 0.05 });
          vx('flash', '#fff8c0', 5, 0.4);
          shake(7); hitstop(3); sfx('stomp');
        }
      },
    },
    air: {
      dur: 28, fps: 14, lock: false,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#80c8ff', r: 17, frames: 26 }); sfx('jet'); },
      tick(p, d, t) {
        slowFall(p, 1.1);
        if (t % 8 === 2 && d.n < 3) {
          d.n++;
          const mx = p.cx + p.dir * 10, my = p.cy + 2;
          shoot({ spr: 'proj_mix_bolt_spark', x: mx, y: my, vx: p.dir * 4.6, vy: 2.4, rot: p.dir > 0 ? 0.48 : Math.PI - 0.48, dmg: 5, w: 14, h: 10, life: 50, type: 'spark', dir: p.dir, trail: '#fff8c0', onHit: t2 => para9(t2, 90) });
          vx('line', mx, my, mx + p.dir * 40, my + 20, { color: '#fff8c0', width: 1, frames: 5 });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          sfx('missile'); shake(1);
        }
        if (t % 3 === 0) parts(p.cx - p.dir * 8, p.cy + 8, ['#fff8c0', '#80c8ff'], 2, { spread: 0.5, grav: 0.04, life: 14, up: -0.4, size: 1 });
      },
    },
  }, [['X', '電磁拳'], ['↑+X', '雷射飛彈'], ['↓+X', '磁軌踏擊'], ['空中 X', '浮空推進炮'], ['按住 50 幀放開', '蓄力・EMP 全畫面']]);

})();
