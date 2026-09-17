// 混合能力第二批（12 組）（Round 7 覺醒與挑戰）
// ---------------------------------------------------------------------------
// 介面完全沿用第一批的 KB.MIX（abilities_mix.js）：
//   ‧ 組合表直接寫進 KB.MIX.table（key = 排序後的 'a|b'，KB.MIX.keyOf 會無序查表）
//   ‧ 混合能力本身是一般的 KB.ABILITIES 條目（moves / desc / flavour / color / icon / hat），
//     `.mix = [A, B]` 讓 KB.MIX.isMix / parts / player.dropAbility（掉主成分 A 的星）自動生效
//   ‧ 混合能力不能再混（KB.MIX.keyOf 會擋），吞下第三個直接替換
// 每組 3 招：地面 X / 方向鍵（或空中）/ 按住 X 50 幀放開的蓄力必殺。
// 蓄力門檻吃 KB.PROG.holdMul（Lv3 ×0.8），招式表上的數字一律是 Lv1 的門檻。
// 特效一律透過 vx()（KB.VFX 沒載入時整組 no-op），判定一律走 KB.hitbox / KB.shoot。
// 美術在 src/art/kirby_mix2.js（KB.MIXART2.build）。
// ---------------------------------------------------------------------------
// Round 10（貼身判定加倍）：使用者回饋「貼身招判定太小常被打死」→ 卡比本體的貼身招判定 ×2
//   ‧ fbox()（跟隨卡比、原尺寸 ≤ 48×48）由 entity.js Hitbox 建構子自動 ×KB.PHYS.meleeScale，這裡不用動；
//   ‧ mbox()（絕對座標的貼身招：↑X 直立框、↓X 地面斬、空中 X 落地衝擊、echo 餘波）明確帶 melee:true → ×2；
//   ‧ 維持原樣（不放大）：KB.shoot / MixHoming / MixOrbit / Mix2Return 等投射物、投射物命中 / 撞牆的爆炸框、
//     以敵人或遠處座標生成的框、持續場地框（火海 / 火牆 / 冰霧 / 電網 / 魔法陣 / 時間裂縫）、
//     全畫面與蓄力必殺的大框（已經很大）、starmage 96px 光束（固定長度的遠程框）；
//   ‧ 陷阱：每幀重建且尺寸會變的框（龍吐息 len 隨時間變長）不能靠自動門檻——len 跨過 48 就突然不放大，
//     會出現「吐得越久判定越小」，所以那三招明確寫 melee: p.type === 'player'；
//     本檔沒有「逐幀改寫 b.w / b.h / b.ox / b.oy」的招（已全文核對），所以不需要 abilities.js 的 fitBox()；
//   ‧ 夥伴（KB.Helper，type 'ally'）用同一份招式定義時 melee 為 false，判定維持 Round 9 尺寸。
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  KB.ABILITIES = KB.ABILITIES || {};

  // 蓄力必殺門檻：**從按下攻擊鍵那一幀算起**按住 50 幀放開（招式表寫的就是這個數字）
  const CHARGE = 50;
  const HOLD = key => (KB.PROG && KB.PROG.holdMul) ? Math.max(4, Math.round(CHARGE * KB.PROG.holdMul(key))) : CHARGE;

  // ======================================================================
  //  組合表：[混合 key, 成分 A, 成分 B, 視覺元素, 中文名, HUD 名（≤7）, 能力色]
  // ======================================================================
  const COMBOS = [
    ['flamebow', 'fire', 'bow', 'fire', '焰弓', 'PYREBOW', '#ff7a30'],
    ['frosthammer', 'ice', 'hammer', 'ice', '冰鎚', 'CRYMAUL', '#6fd0f8'],
    ['thundersword', 'spark', 'sword', 'spark', '雷劍', 'VOLTEDG', '#ffe860'],
    ['flameninja', 'fire', 'ninja', 'fire', '火忍', 'PYRONIN', '#ff5828'],
    ['frostninja', 'ice', 'ninja', 'ice', '冰忍', 'CRYONIN', '#a8e8ff'],
    ['thundergun', 'spark', 'gunner', 'spark', '雷槍', 'VOLTGUN', '#ffc830'],
    ['stonegiant', 'stone', 'giant', 'stone', '岩巨人', 'GOLEM', '#a89078'],
    ['flamedragon', 'fire', 'dragon', 'fire', '炎龍', 'PYRWYRM', '#ff5030'],
    ['thunderdragon', 'spark', 'dragon', 'spark', '雷龍', 'VOLWYRM', '#b0d8ff'],
    ['timebeam', 'beam', 'time', 'time', '時光束', 'CHRONOS', '#c0a8ff'],
    ['gravityblade', 'cutter', 'gravity', 'void', '重力刃', 'GRAVEDG', '#9060e0'],
    ['hammermech', 'hammer', 'mech', 'steel', '鎚機甲', 'MEKMAUL', '#ff9850'],
  ];

  // ---------- 註冊（照 KB.MIX.keyOf 的 key 正規化規則：排序後的 a|b）----------
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  if (KB.MIX && KB.MIX.table) {
    for (const c of COMBOS) KB.MIX.table[pairKey(c[1], c[2])] = c[0];
    KB.MIX.combos2 = COMBOS;
  }
  for (const [key, a, b, el, cn, hud] of COMBOS) {
    if (KB.ABILITY_KEYS.indexOf(key) < 0) KB.ABILITY_KEYS.push(key);
    KB.ABILITY_NAMES[key] = cn; KB.ABILITY_HUD[key] = hud;
    try { if (KB.MIXART2) KB.MIXART2.build(key, a, b, el); } catch (e) { }
  }

  // ======================================================================
  //  共用工具（與 abilities_mix.js 同一套慣例）
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
  // Round 9 招式優先序：↑X > ↓X > 空中 X > X
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
  // Round 10 貼身判定框（絕對座標）：entity.js 的自動加倍規則只認「follow 卡比本體」的框，
  //   所以絕對座標的貼身招要自己標明 melee。夥伴（KB.Helper，type 'ally'）用同一份招式定義時
  //   p.type !== 'player' → melee 為 false，判定框維持 Round 9 尺寸（使用者只要求卡比本體變大）。
  const mbox = (p, x, y, w, h, o) => abox(x, y, w, h, Object.assign({ melee: !!p && p.type === 'player' }, o || {}));
  const shoot = o => KB.shoot(Object.assign({ owner: 'player', life: 60, w: 10, h: 10, grav: 0, solid: true, fxHit: 'fx_hit', knock: 1.6 }, o));
  const parts = (x, y, cols, n, o) => KB.particles(x, y, cols, n, o);

  // 最近的敵人 / 魔王
  function nearest(x, y, r, skip) {
    const g = KB.game; if (!g) return null;
    let best = null, bd = r * r;
    for (const e of g.entities) {
      if (e.dead || (e.type !== 'enemy' && e.type !== 'boss')) continue;
      if (e.active === false || e === skip) continue;
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
  // 往面向方向瞬移（會被牆擋住），回傳實際位移
  function dash(p, max) {
    const g = KB.game; let dx = 0;
    for (let i = 4; i <= max; i += 4) { if (g && g.map && g.map.isSolidPx(p.cx + p.dir * i, p.cy)) break; dx = i; }
    p.x += p.dir * dx; return dx;
  }
  // 麻痺（電系專用；魔王免疫時自動跳過）
  const para = (e, f) => { try { if (KB.ELEM && KB.ELEM.paralyze) KB.ELEM.paralyze(e, f || 90); } catch (_) { } };

  // ======================================================================
  //  專屬投射物
  // ======================================================================
  // 追蹤彈（飛彈 / 追蹤箭）
  class Mix2Homing extends KB.Projectile {
    constructor(o) {
      super(o);
      this.turn = o.turn || 0.15; this.spd = Math.hypot(this.vx, this.vy) || 4;
      this.delayT = o.delay || 8; this.seek = o.seek || 200; this.trailCol = o.trailCol || ['#fff8c0'];
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
  // 軌道刃：繞著宿主轉，半徑會慢慢外擴
  class Mix2Orbit extends KB.Projectile {
    constructor(o) {
      super(o);
      this.host = o.host || null; this.ang = o.ang || 0;
      this.rad = o.rad || 16; this.radMax = o.radMax || 46; this.radStep = o.radStep || 0.5;
      this.spin = o.spin || 0.2; this.solid = false; this.offscreenKill = false;
      this.trailCol = o.trailCol || ['#9060e0', '#40204a'];
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.ang += this.spin; this.rot += 0.36;
      if (this.rad < this.radMax) this.rad = Math.min(this.radMax, this.rad + this.radStep);
      const h = this.host;
      if (!h || h.dead) { this.dead = true; return; }
      this.x = h.cx + Math.cos(this.ang) * this.rad - this.w / 2;
      this.y = h.cy + Math.sin(this.ang) * this.rad - this.h / 2;
      if ((Math.floor(this.t * 60) % 3) === 0) parts(this.cx, this.cy, this.trailCol, 1, { spread: 0.3, grav: 0, life: 10, up: 0, size: 1 });
    }
  }
  // 引力回收刃：飛出去 → 回收，沿路把敵人往自己身上拉
  class Mix2Return extends KB.Projectile {
    constructor(o) {
      super(o);
      this.host = o.host || null; this.outT = o.outT || 24; this.pullR = o.pullR || 58; this.pullK = o.pullK || 0.7;
      this.solid = false; this.offscreenKill = false; this.back = false;
      this.trailCol = o.trailCol || ['#c0a8ff', '#7a30d8'];
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.rot += 0.42;
      const tf = Math.floor(this.t * 60);
      const h = this.host;
      if (tf > this.outT && h && !h.dead) {
        this.back = true;
        const dx = h.cx - this.cx, dy = h.cy - this.cy, d = Math.hypot(dx, dy) || 1;
        this.vx += dx / d * 0.6; this.vy += dy / d * 0.6;
        const s = Math.hypot(this.vx, this.vy);
        if (s > 7) { this.vx *= 7 / s; this.vy *= 7 / s; }
        if (d < 12) { this.dead = true; return; }
      }
      this.x += this.vx; this.y += this.vy;
      const g = KB.game;
      if (g) for (const e of g.entities) {
        if (e.dead || (e.type !== 'enemy' && e.type !== 'boss')) continue;
        if (e.type === 'boss' || e.tough) continue;
        const dx = this.cx - e.cx, dy = this.cy - e.cy, d = Math.hypot(dx, dy);
        if (d > 3 && d < this.pullR) { e.x += dx / d * this.pullK; e.y += dy / d * this.pullK * 0.45; }
      }
      if ((Math.floor(this.t * 60) % 2) === 0) parts(this.cx, this.cy, this.trailCol, 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
    }
  }
  KB.Mix2Homing = Mix2Homing; KB.Mix2Orbit = Mix2Orbit; KB.Mix2Return = Mix2Return;

  // ======================================================================
  //  定義工廠（與 abilities_mix.js 的 build 同構）
  // ======================================================================
  function build(row, spec) {
    const [key, a, b, el, cn, hud, color] = row;
    // Round 9：五招槽（m1 = X、up = ↑X、dn = ↓X、air = 空中 X、ult = 蓄力）。
    const MV = {
      m1: spec.m1, ult: spec.ult,
      up: spec.up || (spec.m2 === 'up' ? spec.m2move : null),
      dn: spec.dn || (spec.m2 === 'down' ? spec.m2move : null),
      air: spec.air || (spec.m2 === 'air' ? spec.m2move : null),
    };
    const animOf = m => 'kirby_attack_' + key + (m === 'up' ? '_up' : m === 'dn' ? '_dn' : '');
    const o = {
      key, name: cn, hudName: hud, color,
      mix: [a, b], mixEl: el, transform: true,
      hat: 'hat_' + key, icon: 'ui_ability_' + key,
      duration: spec.m1.dur, fps: spec.m1.fps || 14, hold: true, maxHold: 600,
      lockMove: spec.m1.lock !== false, canJump: false,
      desc: spec.desc, flavour: Array.isArray(spec.flavour) ? spec.flavour : (spec.flavour ? [String(spec.flavour)] : []), moves: spec.moves,
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
        if (d.t === HOLD(p.ability)) { d.charged = true; sfx('charge_ready'); vx('chargeReady', p.cx, p.cy - 14, color); }
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
  // 地面火海（燃燒彈 / 火雨共用）
  const firePool = (x, y, life, dmg) => abox(x, y - 8, 44, 22, {
    dmg, type: 'fire', life, rehit: 12, knock: 1,
    onUpdate(h) {
      if ((h.life & 3) === 0) {
        KB.fx('fx_fire', h.x + rnd(2, h.w - 2), h.y + h.h - 2, { life: 14, fps: 12 });
        parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.5, grav: -0.07, life: 16, up: 0.5, size: 1 });
      }
    },
  });

  // ======================================================================
  // 1. flamebow 焰弓（fire + bow）
  // ======================================================================
  build(COMBOS[0], {
    m2: 'air',
    desc: '弓弦上綁的是點著引信的火箭，射出去才開始加速。',
    flavour: '「別瞄準，看火光往哪飛就對了。」',
    moves: [['X', '火箭（命中爆炸）'], ['空中 X', '火雨（落地留火海）'], ['按住 50 幀放開', '蓄力・鳳凰箭']],
    m1: {
      dur: 26, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 5 || t === 15) {
          const boom = pr => {
            abox(pr.cx, pr.cy, 48, 38, { dmg: 6, type: 'fire', life: 10, rehit: 0, knock: 2.2 });
            vx('ring', pr.cx, pr.cy, { r0: 4, r1: 32, frames: 14, color: '#ffe040', width: 3 });
            vx('burst', pr.cx, pr.cy, { n: 20, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.2, life: 24, grav: 0.04, size: 2 });
            vx('flash', '#ff9020', 5, 0.35); shake(5); sfx('fireball');
          };
          shoot({
            spr: 'proj_mix2_arrow_fire', x: p.cx + p.dir * 14, y: p.cy - 3, vx: p.dir * 6, dmg: 4, w: 16, h: 8,
            life: 72, type: 'fire', dir: p.dir, trail: '#ff9020', breakBlocks: true, knock: 2,
            onHit(_t, pr) { boom(pr); }, onWall(pr) { boom(pr); },
          });
          vx('line', p.cx + p.dir * 10, p.cy - 3, p.cx + p.dir * 62, p.cy - 3, { color: '#ffe040', width: 1, frames: 5 });
          parts(p.cx + p.dir * 16, p.cy - 3, ['#ffe040', '#ff9020'], 6, { spread: 0.8, grav: -0.04, life: 14, up: 0.2, size: 1 });
          sfx('bow'); shake(2);
        }
      },
    },
    m2move: {
      dur: 44, fps: 12, lock: false,
      start(p) { slowFall(p, 0.6); vx('aura', p, { color: '#ff8030', r: 18, frames: 30 }); sfx('arrow_rain'); },
      tick(p, d, t) {
        slowFall(p, 0.8);
        if (t === 6 || t === 16 || t === 26) {
          for (let i = -1; i <= 1; i++) {
            shoot({
              spr: 'proj_mix2_arrow_fire', x: p.cx + i * 6, y: p.cy + 6, vx: i * 1.7, vy: 5.6, rot: Math.PI / 2,
              dmg: 4, w: 10, h: 14, life: 54, type: 'fire', dir: p.dir, trail: '#ff9020',
              onWall(pr) { firePool(pr.cx, pr.bottom, 50, 3); vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 2.4, life: 18, grav: 0.05 }); },
              onHit(_t, pr) { firePool(pr.cx, pr.bottom, 50, 3); vx('ring', pr.cx, pr.cy, { r0: 2, r1: 20, frames: 12, color: '#ff9020', width: 2 }); },
            });
          }
          vx('flash', '#ff9020', 4, 0.22); sfx('bow');
        }
        if (t % 4 === 0) parts(p.cx + rnd(-14, 14), p.cy + rnd(-8, 8), ['#ffe040', '#ff9020'], 1, { spread: 0.4, grav: -0.04, life: 14, up: 0.3, size: 1 });
      },
    },
    ult: {
      anim: 'kirby_attack_flamebow_ult', dur: 56, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ff7a30', '鳳凰箭'); vx('worldTint', '#ff6020', 0.3, 50); d.ph = null; sfx('bow'); },
      tick(p, d, t) {
        p.vx *= 0.82;
        if (t < 14 && t % 2 === 0) {
          const a = t * 0.55, r = 30 - t;
          parts(p.cx + p.dir * 16 + Math.cos(a) * Math.abs(r), p.cy - 2 + Math.sin(a) * Math.abs(r) * 0.7,
            ['#ffffff', '#ffe040', '#ff9020'], 2, { spread: 0.3, grav: 0, life: 16, up: 0, size: 2 });
        }
        if (t === 14 && !d.ph) {
          d.ph = shoot({
            spr: 'proj_mix2_rocket_fire', x: p.cx + p.dir * 20, y: p.cy - 6, vx: p.dir * 5, dmg: 14, w: 34, h: 20,
            life: 110, pierce: true, type: 'fire', dir: p.dir, trail: '#ff9020', scale: 2.2, knock: 3,
            destructible: false, breakBlocks: true,
            onHit(_t, pr) {
              abox(pr.cx, pr.cy, 72, 60, { dmg: 8, type: 'fire', life: 8, rehit: 0, knock: 2.6 });
              vx('ring', pr.cx, pr.cy, { r0: 6, r1: 44, frames: 14, color: '#ffe040', width: 3 });
              shake(5);
            },
            onWall(pr) {
              abox(pr.cx, pr.cy, 90, 72, { dmg: 10, type: 'fire', life: 12, rehit: 0, knock: 3 });
              vx('ring', pr.cx, pr.cy, { r0: 6, r1: 64, frames: 20, color: '#ffe040', width: 4 });
              vx('burst', pr.cx, pr.cy, { n: 34, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 4.2, life: 30, grav: 0.04, size: 2 });
              vx('flash', '#ff9020', 10, 0.6); shake(10);
            },
          });
          // 鳳凰展翼：兩道上下火翼
          for (const s of [-1, 1]) vx('slash', p.cx + p.dir * 26, p.cy - 2 + s * 10, 22, s * 0.6, { color: '#ffe040', width: 3, frames: 14, arc: 2.4, flip: p.dir < 0 });
          vx('beam', p.cx + p.dir * 16, p.cy - 4, p.dir, 120, { width: 20, color: '#ff9020', frames: 14, taper: true });
          vx('flash', '#ffe040', 8, 0.55); vx('zoom', 1.12, 14);
          p.vx = -p.dir * 2.6; shake(8); hitstop(4); sfx('meteor');
        }
        // 鳳凰飛過的地方留下火羽
        if (d.ph && !d.ph.dead && t % 4 === 0) {
          firePool(d.ph.cx, d.ph.bottom + 6, 34, 3);
          parts(d.ph.cx, d.ph.cy, ['#ffffff', '#ffe040', '#ff9020'], 3, { spread: 1, grav: -0.05, life: 20, up: 0.4, size: 2 });
        }
      },
    },
  });

  // ======================================================================
  // 2. frosthammer 冰鎚（ice + hammer）
  // ======================================================================
  build(COMBOS[1], {
    m2: 'down',
    desc: '鎚頭是一整塊萬年冰，砸下去地面會沿路凍成一條冰河。',
    flavour: '地面比敵人先投降。',
    moves: [['X', '凍地衝擊'], ['↓+X', '冰柱群'], ['按住 50 幀放開', '蓄力・冰河期']],
    m1: {
      dur: 30, fps: 12, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 10) {
          const gy = groundY(p);
          d.box = fbox(p, { w: 38, h: 32, dmg: 6, type: 'ice', ox: -2, oy: -16, life: 6, rehit: 0, knock: 2.2, freeze: true, breakBlocks: true, flipWithOwner: true });
          // 沿地面擴散的凍結區
          abox(p.cx + p.dir * 34, gy - 14, 76, 30, {
            dmg: 5, type: 'ice', life: 32, rehit: 12, freeze: true, knock: 1.4,
            onUpdate(h) {
              if ((h.life & 3) === 0) {
                KB.fx('fx_ice', h.x + rnd(2, h.w - 2), h.y + h.h - 4);
                parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffffff', '#b8f0ff', '#3f96d8'], 2, { spread: 0.5, grav: -0.05, life: 20, up: 0.4, size: 1 });
              }
            },
          });
          for (const s of [1, -1]) vx('shockwave', p.cx, gy, { w: 34, h: 14, dir: s, speed: 4.6, frames: 18, color: '#b8f0ff' });
          for (let i = 0; i < 2; i++) {
            shoot({ spr: 'proj_mix2_shard_ice', x: p.cx + p.dir * (26 + i * 26), y: gy - 14, vx: p.dir * 2.4, vy: 0, dmg: 4, w: 12, h: 26, life: 34, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          }
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 40, frames: 16, color: '#d8f4ff', width: 3 });
          vx('burst', p.cx + p.dir * 18, gy - 8, { n: 22, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3.2, life: 24, grav: 0.05, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'FROST!', { color: '#b8f0ff', size: 8, frames: 28, rise: 0.5 });
          shake(8); hitstop(4); sfx('hammer'); sfx('ice');
        }
      },
    },
    m2move: {
      dur: 42, fps: 12, lock: true,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#b8f0ff', r: 18, frames: 34 }); sfx('icewall'); },
      tick(p, d, t) {
        if (t % 6 === 4 && d.n < 5) {
          const i = d.n++, x = p.cx + p.dir * (16 + i * 22), gy = groundY(p);
          shoot({ spr: 'proj_mix2_shard_ice', x, y: gy - 20, vx: 0, vy: 0, dmg: 5, w: 14, h: 38, life: 30, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false, scale: 1.2 });
          mbox(p, x, gy - 22, 18, 46, { dmg: 5, type: 'ice', life: 10, rehit: 0, freeze: true, knock: 1.4, onHit: e => { e.vy = -4.2; } });
          vx('burst', x, gy - 8, { n: 12, colors: ['#ffffff', '#b8f0ff'], speed: 2.4, life: 20, grav: 0.05, dir: -Math.PI / 2, spread: 0.8 });
          vx('ring', x, gy - 10, { r0: 2, r1: 22, frames: 12, color: '#b8f0ff', width: 2 });
          shake(3); sfx('ice');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_frosthammer_ult', dur: 64, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#6fd0f8', '冰河期'); vx('worldTint', '#5090d8', 0.42, 58); d.n = 0; sfx('icewall'); },
      tick(p, d, t) {
        p.vx *= 0.84;
        if (t < 20 && t % 3 === 0) parts(p.cx + rnd(-30, 30), p.cy + rnd(-26, 18), ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: -0.02, life: 26, up: 0.2, size: 1 });
        if (t === 20) {
          const g = KB.game, cx = g && g.cam ? g.cam.x + 128 : p.cx, cy = g && g.cam ? g.cam.y + 88 : p.cy;
          abox(cx, cy, 272, 160, { dmg: 11, type: 'ice', life: 30, rehit: 20, freeze: true, knock: 2, pierce: true });
          vx('flash', '#ffffff', 12, 0.85); vx('zoom', 1.16, 18);
          for (let i = 0; i < 4; i++) vx('ring', p.cx, p.cy, { r0: 6 + i * 8, r1: 130, frames: 22 + i * 3, color: i % 2 ? '#d8f4ff' : '#ffffff', width: 3 });
          vx('burst', p.cx, p.cy, { n: 38, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 4.4, life: 32, grav: 0.02, size: 2 });
          shake(12); hitstop(6); sfx('ice');
        }
        if (t > 20 && t % 4 === 2 && d.n < 9) {
          const i = d.n++, gy = groundY(p), x = p.cx + (i - 4) * 26;
          shoot({ spr: 'proj_mix2_shard_ice', x, y: gy - 24, vx: 0, vy: 0, dmg: 6, w: 16, h: 44, life: 40, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false, scale: 1.4 });
          abox(x, gy - 26, 22, 52, { dmg: 6, type: 'ice', life: 12, rehit: 0, freeze: true });
          parts(x, gy - 10, ['#ffffff', '#b8f0ff'], 6, { spread: 1.2, grav: 0.04, life: 24, up: 0.8, size: 2 });
          shake(3);
        }
      },
    },
  });

  // ======================================================================
  // 3. thundersword 雷劍（spark + sword）
  // ======================================================================
  build(COMBOS[2], {
    m2: 'air',
    desc: '闊劍整把泡在雷裡，砍中的東西會麻到動不了。',
    flavour: '劍還沒落下，敵人的頭髮已經站起來了。',
    moves: [['X', '帶電斬（麻痺）'], ['空中 X', '雷擊落下斬'], ['按住 50 幀放開', '蓄力・雷神劍']],
    m1: {
      dur: 28, fps: 16, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 4 || t === 14) {
          const n = (t - 4) / 10;
          d.box = fbox(p, {
            w: 34, h: 30, dmg: 5 + n, type: 'spark', ox: -3, oy: -16, life: 5, rehit: 0, knock: 2, flipWithOwner: true,
            onHit(e) { para(e, 120); vx('lightning', e.cx, e.cy - 26, e.cx, e.cy, { color: '#fff8c0', frames: 10, jitter: 5, branches: 2 }); },
          });
          const tgt = nearest(p.cx, p.cy, 110);
          if (tgt) { vx('lightning', p.cx + p.dir * 14, p.cy - 2, tgt.cx, tgt.cy, { color: '#fff8c0', frames: 12, jitter: 6, branches: 3 }); para(tgt, 120); }
          vx('slash', p.cx + p.dir * 12, p.cy - 2, 22 + n * 4, -0.3 + n * 0.6, { color: '#fff8c0', width: 3, frames: 10, arc: 2.3, flip: p.dir < 0 });
          vx('burst', p.cx + p.dir * 20, p.cy - 2, { n: 14, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 2.8, life: 18, grav: 0 });
          vx('flash', '#fff8c0', 4, 0.28);
          shake(4); hitstop(2); sfx('sword'); sfx('spark');
        }
      },
    },
    m2move: {
      dur: 52, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 7.4; p.vx = p.dir * 1.4;
        vx('afterimage', p, { frames: 44, color: '#fff8c0', every: 2, alpha: 0.6 });
        vx('sparkTrail', p, { color: ['#ffffff', '#fff8c0'], every: 2, life: 14, frames: 44 });
        sfx('iai');
      },
      tick(p, d, t) {
        if (!d.landed) {
          p.vy = Math.max(p.vy, 6.8);
          if (!d.box || d.box.dead) d.box = fbox(p, { w: 28, h: 30, dmg: 5, type: 'spark', ox: -14, oy: -8, life: 3, rehit: 8, flipWithOwner: false });
          else beat(d.box);
          if (t % 2 === 0) parts(p.cx + rnd(-6, 6), p.cy, ['#fff8c0', '#ffffff'], 2, { spread: 0.6, grav: -0.04, life: 12, up: 0.2, size: 1 });
          if (p.onGround && t > 3) {
            d.landed = true; killBox(p);
            const gy = p.bottom;
            mbox(p, p.cx, gy - 18, 80, 40, { dmg: 9, type: 'spark', life: 14, rehit: 0, knock: 2.8, breakBlocks: true, onHit: e => para(e, 120) });
            vx('lightning', p.cx, gy - 180, p.cx, gy, { color: '#ffffff', frames: 16, jitter: 10, branches: 5 });
            for (const s of [1, -1]) vx('shockwave', p.cx, gy, { w: 40, h: 16, dir: s, speed: 5.2, frames: 18, color: '#fff8c0' });
            vx('ring', p.cx, gy - 8, { r0: 4, r1: 50, frames: 18, color: '#ffffff', width: 3 });
            vx('burst', p.cx, gy - 8, { n: 28, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3.8, life: 26, grav: 0.05, size: 2 });
            vx('flash', '#fff8c0', 8, 0.55);
            vx('textPop', p.cx, p.y - 12, 'BOLT!', { color: '#fff8c0', size: 8, frames: 30, rise: 0.5 });
            shake(9); hitstop(4); sfx('thunder');
            p.attackTimer = Math.min(p.attackTimer, 18);
          }
        } else p.vx *= 0.8;
      },
    },
    ult: {
      anim: 'kirby_attack_thundersword_ult', dur: 62, fps: 12, lock: true,
      start(p, d) {
        ultIntro(p, '#ffe860', '雷神劍');
        vx('worldTint', '#26285e', 0.46, 56);
        vx('circle', p.cx, p.cy, { r: 44, frames: 44, color: '#fff8c0', spin: 0.3 });
        d.n = 0; sfx('charge');
      },
      tick(p, d, t) {
        p.vx *= 0.82;
        if (t < 20 && t % 3 === 0) {
          const a = rnd(0, Math.PI * 2), r = rnd(18, 44);
          vx('lightning', p.cx, p.cy, p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, { color: '#fff8c0', frames: 8, jitter: 4, branches: 1 });
        }
        if (t === 20) {
          // 巨大雷劍劈下
          const x = p.cx + p.dir * 70;
          abox(x, p.cy - 10, 150, 200, { dmg: 13, type: 'spark', life: 16, rehit: 0, knock: 3, pierce: true, onHit: e => para(e, 150) });
          vx('beam', x, p.bottom + 6, -Math.PI / 2, 210, { width: 40, color: '#fff8c0', frames: 20 });
          for (let i = 0; i < 5; i++) vx('lightning', x + (i - 2) * 22, p.bottom - 200, x + (i - 2) * 16, p.bottom, { color: i & 1 ? '#ffffff' : '#fff8c0', frames: 18, jitter: 11, branches: 4 });
          vx('slash', x, p.cy - 6, 46, -0.2, { color: '#ffffff', width: 5, frames: 16, arc: 2.6, flip: p.dir < 0 });
          vx('flash', '#ffffff', 14, 0.9); vx('zoom', 1.2, 20);
          vx('ring', x, p.cy, { r0: 8, r1: 120, frames: 24, color: '#fff8c0', width: 4 });
          vx('burst', x, p.cy, { n: 38, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 4.6, life: 30, grav: 0 });
          shake(13); hitstop(6); sfx('thunder');
        }
        if (t > 20 && t % 6 === 0 && d.n < 4) {
          const i = d.n++, tgt = nearest(p.cx, p.cy, 220);
          const x = tgt ? tgt.cx : p.cx + p.dir * (40 + i * 26), gy = p.bottom + 4;
          vx('lightning', x, gy - 190, x, gy, { color: '#fff8c0', frames: 12, jitter: 9, branches: 3 });
          abox(x, gy - 96, 28, 200, { dmg: 5, type: 'spark', life: 6, rehit: 0, onHit: e => para(e, 90) });
          shake(4); sfx('spark');
        }
      },
    },
  });

  // ======================================================================
  // 4. flameninja 火忍（fire + ninja）
  // ======================================================================
  build(COMBOS[3], {
    m2: 'down',
    desc: '手裡劍點著火，連替身都是一顆會爆的火藥木頭。',
    flavour: '看到他的時候，那已經是留下來的火。',
    moves: [['X', '火遁手裡劍'], ['↓+X', '火焰替身爆'], ['按住 50 幀放開', '蓄力・火遁大炎']],
    m1: {
      dur: 24, fps: 16, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 4) {
          for (let i = -1; i <= 1; i++) {
            shoot({
              spr: 'proj_mix2_star_fire', x: p.cx + p.dir * 12, y: p.cy - 2, vx: p.dir * 6, vy: i * 1.3,
              dmg: 4, w: 12, h: 12, life: 60, type: 'fire', dir: p.dir, rotSpeed: 0.45 * p.dir, trail: '#ff9020', breakBlocks: true,
              onHit(_t, pr) { vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 2.4, life: 18, grav: 0.04 }); },
              onWall(pr) { firePool(pr.cx, pr.bottom, 36, 3); vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#ffe040', '#ff9020'], speed: 2.2, life: 16, grav: 0.05 }); },
            });
          }
          vx('line', p.cx + p.dir * 8, p.cy - 2, p.cx + p.dir * 50, p.cy - 2, { color: '#ffe040', width: 1, frames: 4 });
          vx('burst', p.cx + p.dir * 14, p.cy - 2, { n: 8, colors: ['#ffe040', '#ff9020'], speed: 2, life: 12, grav: 0 });
          sfx('shuriken');
        }
      },
    },
    m2move: {
      dur: 40, fps: 14, lock: true,
      start(p, d) {
        const ox = p.cx, oy = p.cy;
        d.subX = ox; d.subY = oy; d.blown = false;
        vx('afterimage', p, { frames: 26, color: '#ff8030', every: 1, alpha: 0.6 });
        const dx = dash(p, 52);
        vx('burst', ox, oy, { n: 14, colors: ['#ffe040', '#ff9020', '#c88850'], speed: 2.6, life: 18, grav: 0.05 });
        // 落點爆炎
        mbox(p, p.cx, p.cy - 2, 60, 48, { dmg: 7, type: 'fire', life: 12, rehit: 0, knock: 2.4, breakBlocks: true });
        vx('ring', p.cx, p.cy, { r0: 4, r1: 38, frames: 16, color: '#ffe040', width: 3 });
        vx('burst', p.cx, p.cy, { n: 22, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.4, life: 24, grav: 0.04, size: 2 });
        vx('flash', '#ff9020', 6, 0.45);
        // Round 9 空中變體：在空中施展時，替身的火會直接炸到腳下的地面
        if (!p.onGround) {
          const gy = groundY(p);
          mbox(p, p.cx, gy - 24, 60, 48, { dmg: 7, type: 'fire', life: 12, rehit: 0, knock: 2.4 });
          firePool(p.cx, gy, 44, 3);
          vx('ring', p.cx, gy - 10, { r0: 4, r1: 36, frames: 16, color: '#ffe040', width: 3 });
          vx('burst', p.cx, gy - 8, { n: 18, colors: ['#ffe040', '#ff9020', '#c88850'], speed: 3, life: 22, grav: 0.05 });
        }
        shake(6); hitstop(3); sfx('teleport'); sfx('fire');
        d.dashed = dx;
      },
      tick(p, d, t) {
        p.vx *= 0.7;
        if (t === 12 && !d.blown) {
          d.blown = true;
          // 替身（燒起來的木頭）在原地引爆
          mbox(p, d.subX, d.subY, 54, 46, { dmg: 6, type: 'fire', life: 12, rehit: 0, knock: 2.2, breakBlocks: true });
          vx('ring', d.subX, d.subY, { r0: 4, r1: 34, frames: 16, color: '#ff9020', width: 3 });
          vx('burst', d.subX, d.subY, { n: 24, colors: ['#ffe040', '#ff9020', '#c88850'], speed: 3.2, life: 24, grav: 0.06, size: 2 });
          vx('textPop', d.subX, d.subY - 16, '替身!', { color: '#ffe040', size: 8, frames: 30, rise: 0.5 });
          firePool(d.subX, d.subY + 10, 44, 3);
          shake(6); sfx('fireball');
        }
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-10, 10), ['#ffe040', '#ff9020'], 1, { spread: 0.4, grav: -0.05, life: 12, up: 0.3, size: 1 });
      },
    },
    ult: {
      anim: 'kirby_attack_flameninja_ult', dur: 58, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ff5828', '火遁大炎'); vx('worldTint', '#a02810', 0.4, 52); d.n = 0; sfx('fire'); },
      tick(p, d, t) {
        p.vx *= 0.86;
        if (t < 18 && t % 2 === 0) parts(p.cx + rnd(-18, 18), p.cy + rnd(-16, 12), ['#ffffff', '#ffe040', '#ff9020'], 2, { spread: 0.4, grav: -0.08, life: 18, up: 0.6, size: 2 });
        if (t === 18) {
          // 一整面往前推的大炎
          abox(p.cx + p.dir * 80, p.cy - 4, 170, 120, {
            dmg: 12, type: 'fire', life: 28, rehit: 18, knock: 2.6, pierce: true, breakBlocks: true,
            onUpdate(h) {
              if ((h.life & 1) === 0) {
                KB.fx('fx_fire', h.x + rnd(2, h.w - 2), h.y + rnd(10, h.h), { life: 12, fps: 12 });
                parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.6, grav: -0.12, life: 22, up: 1, size: 2 });
              }
            },
          });
          for (let i = 0; i < 3; i++) {
            shoot({
              spr: 'proj_mix2_rocket_fire', x: p.cx + p.dir * 18, y: p.cy - 14 + i * 14, vx: p.dir * (4.2 + i * 0.4), dmg: 6,
              w: 20, h: 12, life: 70, pierce: true, type: 'fire', dir: p.dir, trail: '#ff9020', scale: 1.4, destructible: false,
            });
          }
          vx('beam', p.cx + p.dir * 14, p.cy - 2, p.dir, 180, { width: 44, color: '#ff9020', frames: 20, taper: true });
          vx('flash', '#ffe040', 12, 0.75); vx('zoom', 1.16, 18);
          vx('textPop', p.cx, p.y - 18, '大炎!', { color: '#ffe040', size: 8, frames: 40, rise: 0.4 });
          p.vx = -p.dir * 3; shake(12); hitstop(5); sfx('meteor');
        }
        if (t > 18 && t % 5 === 0) { shake(3); sfx('fire'); }
      },
    },
  });

  // ======================================================================
  // 5. frostninja 冰忍（ice + ninja）
  // ======================================================================
  build(COMBOS[4], {
    m2: 'down',
    desc: '踩過的地方結霜，出手的是三根看不見的冰針。',
    flavour: '腳印比人更早消失。',
    moves: [['X', '冰針三連'], ['↓+X', '冰鏡瞬移'], ['按住 50 幀放開', '蓄力・吹雪']],
    m1: {
      dur: 28, fps: 16, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 3 || t === 10 || t === 17) {
          const i = (t - 3) / 7;
          shoot({
            spr: 'proj_mix2_arrow_ice', x: p.cx + p.dir * 13, y: p.cy - 4 + i * 3, vx: p.dir * (6.4 + i * 0.4), vy: (i - 1) * 0.5,
            dmg: 3, w: 14, h: 8, life: 60, type: 'ice', dir: p.dir, freeze: true, trail: '#b8f0ff',
            onHit(_t, pr) {
              vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 2.4, life: 18, grav: 0.04 });
              vx('ring', pr.cx, pr.cy, { r0: 2, r1: 16, frames: 10, color: '#b8f0ff', width: 2 });
            },
          });
          vx('line', p.cx + p.dir * 10, p.cy - 3, p.cx + p.dir * 66, p.cy - 3, { color: '#d8f4ff', width: 1, frames: 4 });
          sfx('shuriken');
        }
      },
    },
    m2move: {
      dur: 38, fps: 16, lock: true,
      start(p, d) {
        const ox = p.cx, oy = p.cy;
        vx('afterimage', p, { frames: 28, color: '#b8f0ff', every: 1, alpha: 0.6 });
        dash(p, 60);
        // 原地留下一面碎裂的冰鏡
        vx('circle', ox, oy, { r: 20, frames: 16, color: '#d8f4ff', spin: -0.24 });
        vx('burst', ox, oy, { n: 16, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3, life: 22, grav: 0.06, size: 2 });
        for (const s of [-1, 1]) {
          shoot({ spr: 'proj_mix2_shard_ice', x: ox + s * 8, y: oy - 4, vx: s * 2.6, vy: -1.6, grav: 0.2, dmg: 3, w: 10, h: 20, life: 40, type: 'ice', freeze: true, destructible: false, rotSpeed: 0.2 * s });
        }
        // 落點斬擊
        mbox(p, p.cx, p.cy - 2, 44, 32, { dmg: 7, type: 'ice', life: 10, rehit: 0, freeze: true, knock: 2 });
        vx('slash', p.cx, p.cy - 2, 24, 0.1, { color: '#d8f4ff', width: 3, frames: 10, arc: 2.4, flip: p.dir < 0 });
        vx('flash', '#d8f4ff', 5, 0.4);
        // Round 9 空中變體：空中瞬移時在落點的地面立起兩片碎鏡冰刃
        if (!p.onGround) {
          const gy = groundY(p);
          mbox(p, p.cx, gy - 16, 44, 32, { dmg: 7, type: 'ice', life: 12, rehit: 0, freeze: true, knock: 2 });
          for (const s2 of [-1, 1]) {
            shoot({ spr: 'proj_mix2_shard_ice', x: p.cx + s2 * 14, y: gy - 14, vx: 0, vy: 0, dmg: 5, w: 12, h: 26, life: 26, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          }
          vx('ring', p.cx, gy - 8, { r0: 3, r1: 30, frames: 14, color: '#b8f0ff', width: 2 });
        }
        shake(5); hitstop(2); sfx('teleport'); sfx('ice');
      },
      tick(p, d, t) {
        p.vx *= 0.72;
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy + rnd(-10, 10), ['#ffffff', '#b8f0ff'], 1, { spread: 0.4, grav: 0, life: 14, up: 0, size: 1 });
      },
    },
    ult: {
      anim: 'kirby_attack_frostninja_ult', dur: 60, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#a8e8ff', '吹雪'); vx('worldTint', '#6098d0', 0.4, 56); d.n = 0; sfx('wind'); },
      tick(p, d, t) {
        p.vx *= 0.88;
        if (t >= 10 && t <= 46 && t % 4 === 2) {
          abox(p.cx + p.dir * 90, p.cy - 4, 200, 140, { dmg: 4, type: 'ice', life: 6, rehit: 0, freeze: true, knock: 1, pierce: true });
          vx('beam', p.cx + p.dir * 12, p.cy - 2, p.dir, 200, { width: 60, color: '#d8f4ff', frames: 8, taper: true });
          sfx('wind');
        }
        if (t >= 10 && t <= 50 && t % 2 === 0) {
          for (let i = 0; i < 3; i++) {
            parts(p.cx + p.dir * rnd(10, 200), p.cy + rnd(-60, 60), ['#ffffff', '#b8f0ff', '#3f96d8'], 1,
              { spread: 0.4, grav: 0.02, life: 26, up: 0, vx: p.dir * 3.4, size: 2 });
          }
        }
        if (t % 8 === 4 && d.n < 6) {
          const i = d.n++, x = p.cx + p.dir * (30 + i * 26), gy = groundY(p);
          shoot({ spr: 'proj_mix2_shard_ice', x, y: gy - 18, vx: 0, vy: 0, dmg: 5, w: 12, h: 34, life: 26, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          vx('burst', x, gy - 8, { n: 10, colors: ['#ffffff', '#b8f0ff'], speed: 2.2, life: 18, grav: 0.05 });
          shake(3);
        }
        if (t === 50) { vx('flash', '#ffffff', 10, 0.65); vx('ring', p.cx + p.dir * 60, p.cy, { r0: 6, r1: 90, frames: 20, color: '#d8f4ff', width: 3 }); shake(8); }
      },
    },
  });

  // ======================================================================
  // 6. thundergun 雷槍（spark + gunner）
  // ======================================================================
  build(COMBOS[5], {
    m2: 'down',
    desc: '打出去的不是子彈，是會在敵人之間跳來跳去的電。',
    flavour: '一發命中，整排都在抖。',
    moves: [['X', '電擊彈（鎖鏈電）'], ['↓+X', '電網霰彈'], ['按住 50 幀放開', '蓄力・雷射砲']],
    m1: {
      dur: 24, fps: 14, lock: false, maxHold: 600,
      tick(p, d, t) {
        if (t % 8 === 1 && t <= 44) {
          const mx = p.cx + p.dir * 14, my = p.cy - 3;
          shoot({
            spr: 'proj_mix2_orb_spark', x: mx, y: my, vx: p.dir * 6, dmg: 3, w: 10, h: 10, life: 58,
            type: 'spark', dir: p.dir, trail: '#fff8c0',
            onHit(tg, pr) {
              para(tg, 90);
              // 鎖鏈電：往最近的另外兩隻跳
              let from = tg;
              for (let i = 0; i < 2; i++) {
                const nx = nearest(from.cx, from.cy, 72, from);
                if (!nx) break;
                vx('lightning', from.cx, from.cy, nx.cx, nx.cy, { color: '#fff8c0', frames: 10, jitter: 5, branches: 2 });
                abox(nx.cx, nx.cy, 26, 26, { dmg: 3, type: 'spark', life: 5, rehit: 0, onHit: e => para(e, 90) });
                from = nx;
              }
              vx('ring', pr.cx, pr.cy, { r0: 2, r1: 22, frames: 12, color: '#fff8c0', width: 2 });
            },
            onWall(pr) { vx('burst', pr.cx, pr.cy, { n: 10, colors: ['#fff8c0', '#ffffff'], speed: 2.4, life: 16, grav: 0 }); },
          });
          vx('line', mx, my, mx + p.dir * 80, my, { color: '#fff8c0', width: 1, frames: 4 });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          sfx('gun'); shake(1);
        }
      },
    },
    m2move: {
      dur: 38, fps: 12, lock: true,
      start(p) { vx('aura', p, { color: '#ffc830', r: 16, frames: 14 }); },
      tick(p, d, t) {
        if (t === 10) {
          for (let i = -3; i <= 3; i++) {
            shoot({
              spr: 'proj_mix2_star_spark', x: p.cx + p.dir * 14, y: p.cy - 2, vx: p.dir * (5 - Math.abs(i) * 0.25), vy: i * 0.95,
              dmg: 3, w: 12, h: 12, life: 34, type: 'spark', dir: p.dir, rotSpeed: 0.4, trail: '#fff8c0',
              onHit: (tg) => para(tg, 90),
            });
          }
          // 前方張開的電網
          abox(p.cx + p.dir * 42, p.cy - 2, 70, 58, {
            dmg: 4, type: 'spark', life: 54, rehit: 12, knock: 1.2,
            onHit: e => para(e, 90),
            onUpdate(h) {
              if ((h.life & 3) === 0) {
                vx('lightning', h.x, h.y + rnd(0, h.h), h.x + h.w, h.y + rnd(0, h.h), { color: '#fff8c0', frames: 6, jitter: 5, branches: 1 });
                parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#fff8c0', '#ffffff'], 1, { spread: 0.4, grav: 0, life: 14, up: 0, size: 1 });
              }
            },
          });
          p.vx = -p.dir * 2.6;
          vx('flash', '#fff8c0', 6, 0.5); vx('ring', p.cx + p.dir * 22, p.cy, { r0: 4, r1: 32, frames: 14, color: '#fff8c0', width: 2 });
          shake(6); hitstop(3); sfx('shotgun');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_thundergun_ult', dur: 58, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ffc830', '雷射砲'); vx('worldTint', '#26285e', 0.42, 54); sfx('charge'); },
      tick(p, d, t) {
        p.vx *= 0.72;
        if (t < 12 && t % 2 === 0) parts(p.cx + p.dir * 16 + rnd(-8, 8), p.cy + rnd(-10, 10), ['#fff8c0', '#ffffff'], 2, { spread: 0.3, grav: 0, life: 14, up: 0, size: 1 });
        if (t >= 12 && t <= 48) {
          if (t % 6 === 0) {
            vx('beam', p.cx + p.dir * 14, p.cy - 2, p.dir, 220, { width: 20, color: '#fff8c0', frames: 10, taper: false });
            vx('line', p.cx + p.dir * 14, p.cy - 2, p.cx + p.dir * 232, p.cy - 2, { color: '#ffffff', width: 3, frames: 8 });
            abox(p.cx + p.dir * 118, p.cy - 2, 220, 26, { dmg: 8, type: 'spark', life: 6, rehit: 0, knock: 1.6, onHit: e => para(e, 90) });
            vx('flash', '#fff8c0', 4, 0.3);
            shake(4); sfx('beam');
          }
          if (t % 3 === 0) parts(p.cx + p.dir * rnd(20, 210), p.cy + rnd(-10, 10), ['#ffffff', '#fff8c0'], 2, { spread: 0.5, grav: 0, life: 16, up: 0, size: 1 });
        }
        if (t === 50) { vx('flash', '#ffffff', 10, 0.7); vx('ring', p.cx + p.dir * 70, p.cy, { r0: 6, r1: 80, frames: 20, color: '#fff8c0', width: 3 }); shake(9); }
      },
    },
  });

  // ======================================================================
  // 7. stonegiant 岩巨人（stone + giant）
  // ======================================================================
  build(COMBOS[6], {
    m2: 'down',
    desc: '整隻卡比外面又長了一層山，拳頭落地就是一次小地震。',
    flavour: '走路要小心，會踩壞關卡。',
    moves: [['X', '岩拳踩踏'], ['↓+X', '滾石衝撞'], ['按住 50 幀放開', '蓄力・山崩']],
    m1: {
      dur: 34, fps: 12, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 8) {
          d.box = fbox(p, { w: 44, h: 34, dmg: 7, type: 'stone', ox: 0, oy: -18, life: 6, rehit: 0, knock: 2.4, breakBlocks: true, flipWithOwner: true });
          vx('burst', p.cx + p.dir * 22, p.cy - 4, { n: 16, colors: ['#c0b098', '#8a7a66', '#605448'], speed: 2.8, life: 22, grav: 0.12, size: 2 });
          vx('slash', p.cx + p.dir * 18, p.cy - 4, 24, 0, { color: '#c0b098', width: 4, frames: 10, arc: 1.8, flip: p.dir < 0 });
          shake(5); hitstop(2); sfx('rocket_punch');
        }
        if (t === 20) {
          const gy = groundY(p);
          mbox(p, p.cx, gy - 14, 90, 32, { dmg: 6, type: 'stone', life: 14, rehit: 0, knock: 2.6, breakBlocks: true });
          for (const s of [1, -1]) {
            vx('shockwave', p.cx, gy, { w: 40, h: 16, dir: s, speed: 5, frames: 20, color: '#b0a090' });
            shoot({ spr: 'proj_mix2_shard_stone', x: p.cx + s * 30, y: gy - 14, vx: s * 1.2, vy: -3.2, grav: 0.26, dmg: 5, w: 12, h: 24, life: 50, type: 'stone', destructible: false, rotSpeed: 0.18 * s, breakBlocks: true });
          }
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 48, frames: 18, color: '#c0b098', width: 3 });
          vx('burst', p.cx, gy - 6, { n: 26, colors: ['#c0b098', '#8a7a66', '#605448'], speed: 3.4, life: 26, grav: 0.14, size: 2 });
          vx('textPop', p.cx, p.y - 14, 'STOMP!', { color: '#c0b098', size: 8, frames: 30, rise: 0.5 });
          shake(10); hitstop(4); sfx('stomp'); sfx('giant_roar');
        }
      },
    },
    m2move: {
      dur: 46, fps: 12, lock: true,
      start(p, d) {
        d.n = 0; p.vx = p.dir * 5.4;
        vx('afterimage', p, { frames: 42, color: '#c0b098', every: 2, alpha: 0.5 });
        vx('aura', p, { color: '#c0b098', r: 20, frames: 42, pulse: 0.4 });
        sfx('giant_grow');
      },
      tick(p, d, t) {
        if (t < 34) p.vx = p.dir * 5.4; else p.vx *= 0.82;
        if (t % 6 === 1 && t < 36) {
          d.box = fbox(p, { w: 34, h: 32, dmg: 6, type: 'stone', ox: -17, oy: -16, life: 8, rehit: 0, knock: 2.4, breakBlocks: true, flipWithOwner: false });
          d.n++;
        }
        if (t % 3 === 0) {
          parts(p.cx - p.dir * 10, p.bottom - 4, ['#c0b098', '#8a7a66', '#605448'], 2, { spread: 0.8, grav: 0.14, life: 20, up: 0.5, size: 2 });
          vx('ring', p.cx, p.cy, { r0: 10, r1: 24, frames: 8, color: '#b0a090', width: 2 });
        }
        if (t % 10 === 0) { shake(4); sfx('mech_step'); }
      },
    },
    ult: {
      anim: 'kirby_attack_stonegiant_ult', dur: 66, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#a89078', '山崩'); vx('worldTint', '#6a5a48', 0.36, 60); d.n = 0; sfx('giant_roar'); },
      tick(p, d, t) {
        p.vx *= 0.86;
        if (t % 5 === 2 && d.n < 7) {
          const i = d.n++, x = p.cx + p.dir * (6 + i * 26) + rnd(-8, 8);
          shoot({
            spr: 'proj_mix2_orb_stone', x, y: p.cy - 150, vx: rnd(-0.4, 0.4), vy: 6.2, grav: 0.14, dmg: 7, w: 20, h: 20,
            life: 90, type: 'stone', trail: '#8a7a66', scale: 2, breakBlocks: true, rotSpeed: 0.14,
            onWall(pr) {
              abox(pr.cx, pr.cy, 60, 46, { dmg: 7, type: 'stone', life: 10, rehit: 0, knock: 2.4 });
              for (const s of [1, -1]) vx('shockwave', pr.cx, pr.bottom, { w: 34, h: 14, dir: s, speed: 4.2, frames: 16, color: '#b0a090' });
              vx('burst', pr.cx, pr.cy, { n: 22, colors: ['#c0b098', '#8a7a66', '#605448'], speed: 3.4, life: 26, grav: 0.16, size: 2 });
              shake(7); sfx('hardblock');
            },
            onHit(_t, pr) { abox(pr.cx, pr.cy, 60, 46, { dmg: 7, type: 'stone', life: 8, rehit: 0 }); vx('burst', pr.cx, pr.cy, { n: 16, colors: ['#c0b098', '#8a7a66'], speed: 3, life: 22, grav: 0.16, size: 2 }); shake(5); },
          });
          vx('line', x, p.cy - 150, x, p.cy - 50, { color: '#8a7a66', width: 2, frames: 8 });
        }
        if (t === 44) {
          const g = KB.game, cx = g && g.cam ? g.cam.x + 128 : p.cx, gy = groundY(p);
          abox(cx, gy - 22, 272, 44, { dmg: 9, type: 'stone', life: 22, rehit: 20, knock: 2.4, pierce: true, breakBlocks: true });
          vx('flash', '#c0b098', 10, 0.6); vx('zoom', 1.14, 18);
          for (let i = 0; i < 8; i++) parts(cx - 128 + i * 34, gy - rnd(4, 30), ['#c0b098', '#8a7a66', '#605448'], 4, { spread: 1.4, grav: 0.16, life: 28, up: 1.2, size: 2 });
          shake(14); hitstop(6); sfx('stomp');
        }
        if (t % 6 === 0) shake(3);
      },
    },
  });

  // ======================================================================
  // 8. flamedragon 炎龍（fire + dragon）
  // ======================================================================
  build(COMBOS[7], {
    m2: 'air',
    desc: '龍的喉嚨直接連到一顆小太陽，吐一口就是一條走廊的火。',
    flavour: '牠上次打噴嚏，燒出了一整座火山。',
    moves: [['X', '炎息加強'], ['空中 X', '炎翼衝'], ['按住 50 幀放開', '蓄力・太陽炎']],
    m1: {
      dur: 38, fps: 12, lock: true, maxHold: 600,
      start(p, d) { d.box = null; sfx('dragon_breath'); },
      tick(p, d, t) {
        if (t <= 34) {
          const len = Math.round(Math.min(78, 20 + t * 2.2));   // Round 10：取整數，判定框放大後才會剛好 ×2（不出現半像素框）
          if (d.box) d.box.dead = true;
          // Round 10：吐息框每幀重建且 len 會跨過 entity.js 的 48px 自動門檻（越吐越長 → 反而不再放大 = 突然縮水），
          //   所以這裡明確標明 melee：卡比本體一律 ×2（和 abilities.js 的基本火焰吐息同步，混合版不能比成分還短），
          //   夥伴（type 'ally'）維持 Round 9 長度。
          d.box = fbox(p, { melee: p.type === 'player', w: len, h: 30, dmg: 3, type: 'fire', ox: 6, oy: -16, life: 3, rehit: 6, knock: 1 });
          for (let i = 0; i < 3; i++) {
            const dx = rnd(10, len + 10);
            parts(p.cx + p.dir * dx, p.cy - 2 + rnd(-1, 1) * dx * 0.2, ['#ffffff', '#ffe040', '#ff9020', '#ff4010'], 1,
              { spread: 0.5, grav: -0.02, life: 20, up: 0.1, vx: p.dir * 2, size: 2 });
          }
          if (t % 8 === 0) { KB.fx('fx_fire', p.cx + p.dir * (len * 0.7), p.cy - 2, { life: 14, fps: 12 }); sfx('fire'); }
          if (t % 12 === 0) {
            vx('circle', p.cx + p.dir * 20, p.cy - 2, { r: 15, frames: 12, color: '#ff9020', spin: 0.24 });
            shoot({ spr: 'proj_mix2_orb_fire', x: p.cx + p.dir * 20, y: p.cy - 2, vx: p.dir * 4.6, vy: rnd(-0.6, 0.6), dmg: 3, w: 10, h: 10, life: 40, type: 'fire', dir: p.dir, trail: '#ff9020' });
          }
        }
      },
    },
    m2move: {
      dur: 48, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vx = p.dir * 5.6; p.vy = 4.8;
        vx('afterimage', p, { frames: 42, color: '#ff8030', every: 2, alpha: 0.55 });
        vx('sparkTrail', p, { color: ['#ffe040', '#ff9020'], every: 2, life: 16, frames: 42 });
        sfx('dragon_dash'); sfx('wing_flap');
      },
      tick(p, d, t) {
        if (!d.landed) {
          p.vx = p.dir * 5.6; p.vy = Math.max(p.vy, 4.6);
          if (!d.box || d.box.dead) d.box = fbox(p, { w: 34, h: 30, dmg: 6, type: 'fire', ox: -17, oy: -9, life: 3, rehit: 10, knock: 2.2, flipWithOwner: false });
          else beat(d.box);
          if (t % 2 === 0) parts(p.cx - p.dir * 8, p.cy + rnd(-6, 6), ['#ffe040', '#ff9020'], 2, { spread: 0.6, grav: -0.05, life: 16, up: 0.3, size: 2 });
          if (p.onGround && t > 3) {
            d.landed = true; killBox(p);
            const gy = p.bottom;
            mbox(p, p.cx, gy - 18, 74, 38, { dmg: 7, type: 'fire', life: 14, rehit: 0, knock: 2.4, breakBlocks: true });
            for (const s of [-1, 1]) {
              const x = p.cx + s * 28;
              abox(x, gy - 24, 18, 48, { dmg: 5, type: 'fire', life: 26, rehit: 10, onUpdate(h) { if ((h.life & 3) === 0) { KB.fx('fx_fire', h.x + h.w / 2, h.y + h.h, { life: 12, fps: 12 }); parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020'], 2, { spread: 0.4, grav: -0.12, life: 20, up: 1, size: 2 }); } } });
              vx('shockwave', p.cx, gy, { w: 34, h: 14, dir: s, speed: 4.6, frames: 16, color: '#ff9020' });
            }
            vx('ring', p.cx, gy - 8, { r0: 4, r1: 46, frames: 16, color: '#ffe040', width: 3 });
            vx('burst', p.cx, gy - 8, { n: 26, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.6, life: 26, grav: 0.05, size: 2 });
            vx('flash', '#ff9020', 7, 0.5);
            shake(9); hitstop(4); sfx('fire');
            p.attackTimer = Math.min(p.attackTimer, 18);
          }
        } else p.vx *= 0.8;
      },
    },
    ult: {
      anim: 'kirby_attack_flamedragon_ult', dur: 62, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#ff5030', '太陽炎'); vx('worldTint', '#ff7020', 0.44, 58); d.sun = null; sfx('dragon_breath'); },
      tick(p, d, t) {
        p.vx *= 0.84;
        if (t < 20 && t % 2 === 0) {
          const a = t * 0.5, r = 40 - t;
          parts(p.cx + p.dir * 34 + Math.cos(a) * Math.abs(r), p.cy - 4 + Math.sin(a) * Math.abs(r) * 0.8,
            ['#ffffff', '#ffe040', '#ff9020'], 2, { spread: 0.3, grav: 0, life: 18, up: 0, size: 2 });
        }
        if (t === 20 && !d.sun) {
          d.sun = shoot({
            spr: 'proj_mix2_orb_fire', x: p.cx + p.dir * 40, y: p.cy - 10, vx: p.dir * 2.2, dmg: 14, w: 40, h: 40,
            life: 110, pierce: true, type: 'fire', dir: p.dir, trail: '#ff9020', scale: 3.2, knock: 3,
            destructible: false, solid: false,
          });
          abox(p.cx + p.dir * 50, p.cy - 4, 140, 130, {
            dmg: 9, type: 'fire', life: 32, rehit: 16, knock: 2.4, pierce: true,
            onUpdate(h) { if ((h.life & 1) === 0) parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#ffffff', '#ffe040', '#ff9020'], 2, { spread: 0.8, grav: -0.1, life: 22, up: 0.8, size: 2 }); },
          });
          for (let i = 0; i < 5; i++) vx('ring', p.cx + p.dir * 50, p.cy - 4, { r0: 6 + i * 8, r1: 90, frames: 22 + i * 3, color: i % 2 ? '#ffe040' : '#ffffff', width: 3 });
          vx('circle', p.cx + p.dir * 50, p.cy - 4, { r: 46, frames: 44, color: '#ffe040', spin: 0.26 });
          vx('flash', '#ffe040', 14, 0.9); vx('zoom', 1.18, 20);
          shake(13); hitstop(6); sfx('meteor');
        }
        if (d.sun && !d.sun.dead && t % 5 === 0) {
          for (let i = 0; i < 4; i++) {
            const a = rnd(0, Math.PI * 2);
            parts(d.sun.cx + Math.cos(a) * 22, d.sun.cy + Math.sin(a) * 22, ['#ffffff', '#ffe040', '#ff9020'], 1, { spread: 0.4, grav: -0.04, life: 18, up: 0.3, size: 2 });
          }
          shake(3);
        }
      },
    },
  });

  // ======================================================================
  // 9. thunderdragon 雷龍（spark + dragon）
  // ======================================================================
  build(COMBOS[8], {
    m2: 'air',
    desc: '鱗片之間全是放電的縫隙，吐出來的是一整段被壓縮的雷雲。',
    flavour: '牠飛過之後，天空要重新充電。',
    moves: [['X', '雷息'], ['空中 X', '雷翼俯衝'], ['按住 50 幀放開', '蓄力・雷雲']],
    m1: {
      dur: 36, fps: 12, lock: true, maxHold: 600,
      start(p, d) { d.box = null; sfx('dragon_breath'); },
      tick(p, d, t) {
        if (t <= 32) {
          const len = Math.min(70, 18 + t * 2);
          if (d.box) d.box.dead = true;
          // Round 10：吐息框每幀重建且 len 會跨過 entity.js 的 48px 自動門檻（越吐越長 → 反而不再放大 = 突然縮水），
          //   所以這裡明確標明 melee：卡比本體一律 ×2（和 abilities.js 的基本火焰吐息同步，混合版不能比成分還短），
          //   夥伴（type 'ally'）維持 Round 9 長度。
          d.box = fbox(p, { melee: p.type === 'player', w: len, h: 28, dmg: 3, type: 'spark', ox: 6, oy: -15, life: 3, rehit: 6, knock: 0.8, onHit: e => para(e, 60) });
          if (t % 4 === 0) vx('lightning', p.cx + p.dir * 12, p.cy - 2, p.cx + p.dir * (len + 10), p.cy - 2 + rnd(-10, 10), { color: '#fff8c0', frames: 8, jitter: 6, branches: 2 });
          for (let i = 0; i < 2; i++) {
            const dx = rnd(10, len + 8);
            parts(p.cx + p.dir * dx, p.cy - 2 + rnd(-1, 1) * dx * 0.2, ['#ffffff', '#fff8c0', '#4878f8'], 1, { spread: 0.4, grav: 0, life: 16, up: 0, vx: p.dir * 2, size: 1 });
          }
          if (t % 10 === 0) { sfx('spark'); shake(2); }
        }
      },
    },
    m2move: {
      dur: 48, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vx = p.dir * 6; p.vy = 5;
        vx('afterimage', p, { frames: 44, color: '#fff8c0', every: 1, alpha: 0.6 });
        vx('sparkTrail', p, { color: ['#ffffff', '#fff8c0'], every: 2, life: 14, frames: 44 });
        sfx('dragon_dash'); sfx('wing_flap');
      },
      tick(p, d, t) {
        if (!d.landed) {
          p.vx = p.dir * 6; p.vy = Math.max(p.vy, 4.8);
          if (!d.box || d.box.dead) d.box = fbox(p, { w: 32, h: 30, dmg: 6, type: 'spark', ox: -16, oy: -9, life: 3, rehit: 10, knock: 2.2, flipWithOwner: false, onHit: e => para(e, 90) });
          else beat(d.box);
          if (t % 3 === 0) vx('lightning', p.cx, p.cy, p.cx + rnd(-14, 14), p.cy + rnd(-14, 14), { color: '#fff8c0', frames: 6, jitter: 3, branches: 1 });
          if (p.onGround && t > 3) {
            d.landed = true; killBox(p);
            const gy = p.bottom;
            mbox(p, p.cx, gy - 18, 70, 36, { dmg: 7, type: 'spark', life: 14, rehit: 0, knock: 2.4, onHit: e => para(e, 120) });
            for (const s of [-1, 1]) {
              const x = p.cx + s * 32;
              vx('lightning', x, gy - 190, x, gy, { color: '#fff8c0', frames: 14, jitter: 9, branches: 3 });
              abox(x, gy - 94, 26, 200, { dmg: 5, type: 'spark', life: 8, rehit: 0, onHit: e => para(e, 90) });
              vx('shockwave', p.cx, gy, { w: 34, h: 14, dir: s, speed: 4.8, frames: 16, color: '#fff8c0' });
            }
            vx('ring', p.cx, gy - 8, { r0: 4, r1: 46, frames: 16, color: '#ffffff', width: 3 });
            vx('burst', p.cx, gy - 8, { n: 26, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3.6, life: 26, grav: 0.04, size: 2 });
            vx('flash', '#fff8c0', 8, 0.55);
            shake(9); hitstop(4); sfx('thunder');
            p.attackTimer = Math.min(p.attackTimer, 18);
          }
        } else p.vx *= 0.8;
      },
    },
    ult: {
      anim: 'kirby_attack_thunderdragon_ult', dur: 66, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#b0d8ff', '雷雲');
        vx('worldTint', '#1c2050', 0.5, 62);
        vx('circle', p.cx, p.cy - 40, { r: 48, frames: 60, color: '#b0d8ff', spin: 0.2 });
        d.n = 0; sfx('thunder');
      },
      tick(p, d, t) {
        p.vx *= 0.86;
        // 頭頂雷雲
        if (t % 2 === 0) parts(p.cx + rnd(-56, 56), p.cy - 52 + rnd(-8, 8), ['#b0d8ff', '#ffffff', '#4878f8'], 2, { spread: 0.5, grav: 0, life: 20, up: 0, size: 2 });
        if (t >= 12 && t % 5 === 2 && d.n < 9) {
          const i = d.n++;
          const tgt = nearest(p.cx, p.cy, 230);
          const x = tgt ? tgt.cx : p.cx + p.dir * (24 + i * 22);
          const gy = p.bottom + 4;
          vx('lightning', x, gy - 200, x, gy, { color: i & 1 ? '#ffffff' : '#fff8c0', frames: 14, jitter: 10, branches: 4 });
          abox(x, gy - 96, 28, 200, { dmg: 6, type: 'spark', life: 8, rehit: 0, knock: 2, onHit: e => para(e, 120) });
          vx('burst', x, gy - 6, { n: 14, colors: ['#fff8c0', '#ffffff', '#4878f8'], speed: 3, life: 20, grav: 0.04 });
          vx('flash', '#fff8c0', 4, 0.3);
          shake(5); sfx('thunder');
        }
        if (t === 56) { vx('flash', '#ffffff', 12, 0.8); vx('zoom', 1.16, 18); shake(11); }
      },
    },
  });

  // ======================================================================
  // 10. timebeam 時光束（beam + time）
  // ======================================================================
  build(COMBOS[9], {
    m2: 'up',
    desc: '光束裡摻了停住的時間，被照到的東西會卡在上一秒。',
    flavour: '「等一下」在這裡是攻擊指令。',
    moves: [['X', '凍結光束'], ['↑+X', '時間裂縫'], ['按住 50 幀放開', '蓄力・時停爆']],
    m1: {
      dur: 30, fps: 12, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 6 || t === 18) {
          const x = p.cx + p.dir * 58;
          abox(x, p.cy - 2, 110, 20, {
            dmg: 5, type: 'beam', life: 10, rehit: 0, knock: 1, pierce: true,
            onHit(e) { para(e, 150); e.vx = 0; vx('circle', e.cx, e.cy, { r: 16, frames: 18, color: '#c0a8ff', spin: -0.3 }); },
          });
          vx('beam', p.cx + p.dir * 12, p.cy - 2, p.dir, 110, { width: 12, color: '#c0a8ff', frames: 12, taper: true });
          vx('line', p.cx + p.dir * 12, p.cy - 2, p.cx + p.dir * 118, p.cy - 2, { color: '#40ffd0', width: 2, frames: 8 });
          vx('circle', p.cx + p.dir * 18, p.cy - 2, { r: 14, frames: 14, color: '#40ffd0', spin: -0.26 });
          parts(p.cx + p.dir * rnd(20, 110), p.cy + rnd(-8, 8), ['#ffffff', '#c0a8ff', '#40ffd0'], 4, { spread: 0.4, grav: 0, life: 18, up: 0, size: 1 });
          shake(2); sfx('beam'); sfx('slowmo');
        }
      },
    },
    m2move: {
      dur: 44, fps: 12, lock: true,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#c0a8ff', r: 18, frames: 40 }); sfx('rewind'); },
      tick(p, d, t) {
        p.vx *= 0.8;
        if (t % 8 === 4 && d.n < 3) {
          const i = d.n++, x = p.cx + p.dir * (28 + i * 30), y = p.cy - 6;
          shoot({
            spr: 'proj_mix2_ring_time', x, y, vx: 0, vy: 0, dmg: 5, w: 22, h: 22, life: 46, solid: false, pierce: true,
            type: 'beam', destructible: false, rotSpeed: 0.18, scale: 1.3,
          });
          abox(x, y, 40, 84, {
            dmg: 6, type: 'beam', life: 40, rehit: 12, knock: 1.2, pierce: true,
            onHit(e) { para(e, 120); },
            onUpdate(h) { if ((h.life & 3) === 0) parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#c0a8ff', '#40ffd0', '#ffffff'], 1, { spread: 0.3, grav: 0, life: 18, up: 0, size: 1 }); },
          });
          vx('circle', x, y, { r: 26, frames: 24, color: '#c0a8ff', spin: 0.3 });
          vx('ring', x, y, { r0: 4, r1: 30, frames: 16, color: '#40ffd0', width: 2 });
          vx('line', x, y - 42, x, y + 42, { color: '#ffffff', width: 2, frames: 12 });
          shake(3); sfx('magic_circle');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_timebeam_ult', dur: 70, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#c0a8ff', '時停爆');
        vx('worldTint', '#2a2060', 0.5, 66);
        d.stopped = false; sfx('timestop');
      },
      tick(p, d, t) {
        p.vx *= 0.86;
        if (t === 12 && !d.stopped) {
          d.stopped = true;
          const g = KB.game;
          if (g) for (const e of g.entities) { if (!e.dead && e.type === 'enemy') { para(e, 200); e.vx = 0; vx('circle', e.cx, e.cy, { r: 14, frames: 40, color: '#c0a8ff', spin: -0.2 }); } }
          vx('flash', '#c0a8ff', 10, 0.7); vx('letterbox', 60);
          vx('textPop', p.cx, p.y - 26, 'TIME STOP', { color: '#40ffd0', size: 8, frames: 44, rise: 0.3 });
          for (let i = 0; i < 3; i++) vx('ring', p.cx, p.cy, { r0: 8 + i * 10, r1: 120, frames: 30 + i * 4, color: i % 2 ? '#c0a8ff' : '#40ffd0', width: 2 });
          shake(6);
        }
        if (t > 12 && t < 40 && t % 3 === 0) {
          const a = rnd(0, Math.PI * 2), r = rnd(20, 90);
          parts(p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r * 0.8, ['#ffffff', '#c0a8ff', '#40ffd0'], 1, { spread: 0.2, grav: 0, life: 30, up: 0, size: 1 });
        }
        if (t === 40) {
          const g = KB.game, cx = g && g.cam ? g.cam.x + 128 : p.cx, cy = g && g.cam ? g.cam.y + 92 : p.cy;
          abox(cx, cy, 260, 190, { dmg: 13, type: 'beam', life: 24, rehit: 20, knock: 2.6, pierce: true });
          vx('flash', '#ffffff', 14, 0.95); vx('zoom', 1.2, 20);
          for (let i = 0; i < 5; i++) vx('ring', p.cx, p.cy, { r0: 6 + i * 8, r1: 140, frames: 22 + i * 3, color: i % 2 ? '#c0a8ff' : '#ffffff', width: 3 });
          vx('burst', p.cx, p.cy, { n: 42, colors: ['#ffffff', '#c0a8ff', '#40ffd0'], speed: 4.6, life: 34, grav: 0 });
          vx('textPop', p.cx, p.y - 18, '時間再開!', { color: '#c0a8ff', size: 8, frames: 40, rise: 0.4 });
          shake(14); hitstop(6); sfx('timeresume'); sfx('magic_big');
        }
        if (t > 40 && t % 4 === 0) KB.fx('fx_sparkle', p.cx + rnd(-70, 70), p.cy + rnd(-50, 50));
      },
    },
  });

  // ======================================================================
  // 11. gravityblade 重力刃（cutter + gravity）
  // ======================================================================
  build(COMBOS[10], {
    m2: 'down',
    desc: '刀刃不用手拿，用重力場掛在身邊自己繞。',
    flavour: '掉下去的不是刃，是你。',
    moves: [['X', '軌道刃環繞'], ['↓+X', '引力回收刃'], ['按住 50 幀放開', '蓄力・刃之奇點']],
    m1: {
      dur: 30, fps: 14, lock: true, maxHold: 600,
      tick(p, d, t) {
        if (t === 3) {
          for (let i = 0; i < 4; i++) {
            KB.spawn(new Mix2Orbit({
              spr: 'proj_mix2_ring_void', x: p.cx, y: p.cy, vx: 0, vy: 0, dmg: 4, w: 14, h: 14,
              life: 96, owner: 'player', type: 'cutter', pierce: true, destructible: false,
              host: p, ang: i * Math.PI / 2, rad: 16, radMax: 54, radStep: 0.58, spin: 0.22,
            }));
          }
          vx('circle', p.cx, p.cy, { r: 30, frames: 30, color: '#9060e0', spin: 0.3 });
          vx('ring', p.cx, p.cy, { r0: 4, r1: 34, frames: 16, color: '#c0a8ff', width: 2 });
          sfx('cutter'); sfx('gravity_lift');
        }
        if (t % 6 === 0) parts(p.cx + rnd(-22, 22), p.cy + rnd(-18, 18), ['#9060e0', '#c0a8ff'], 1, { spread: 0.3, grav: 0, life: 14, up: 0, size: 1 });
      },
    },
    m2move: {
      dur: 46, fps: 12, lock: true,
      start(p, d) {
        d.blade = KB.spawn(new Mix2Return({
          spr: 'proj_mix2_star_void', x: p.cx + p.dir * 12, y: p.cy - 2, vx: p.dir * 5.4, vy: -0.4,
          dmg: 6, w: 14, h: 14, life: 70, owner: 'player', type: 'cutter', pierce: true, destructible: false,
          host: p, outT: 26, pullR: 62, pullK: 0.9, knock: 1,
        }));
        vx('ring', p.cx + p.dir * 12, p.cy - 2, { r0: 3, r1: 24, frames: 12, color: '#c0a8ff', width: 2 });
        sfx('cutter'); sfx('gravity_lift');
      },
      tick(p, d, t) {
        p.vx *= 0.86;
        const b = d.blade;
        if (b && !b.dead) {
          if (t % 4 === 0) vx('line', p.cx, p.cy - 2, b.cx, b.cy, { color: '#9060e0', width: 1, frames: 5 });
          if (t % 6 === 0) vx('circle', b.cx, b.cy, { r: 18, frames: 10, color: '#c0a8ff', spin: -0.3 });
        }
        if (t === 30) { vx('flash', '#9060e0', 4, 0.25); sfx('gravity_lift'); }
      },
    },
    ult: {
      anim: 'kirby_attack_gravityblade_ult', dur: 68, fps: 10, lock: true,
      start(p, d) { ultIntro(p, '#9060e0', '刃之奇點'); vx('worldTint', '#1a0e30', 0.52, 64); d.n = 0; sfx('blackhole'); },
      tick(p, d, t) {
        p.vx *= 0.88;
        const sx = p.cx + p.dir * 60, sy = p.cy - 4;
        if (t === 16) {
          // 奇點：把敵人吸進來再絞碎
          abox(sx, sy, 120, 110, {
            dmg: 11, type: 'cutter', life: 36, rehit: 12, knock: 0.4, pierce: true,
            onUpdate(h) {
              const g = KB.game; if (!g) return;
              const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
              for (const e of g.entities) {
                if (e.dead || e.type !== 'enemy') continue;
                const dx = cx - e.cx, dy = cy - e.cy, dd = Math.hypot(dx, dy);
                if (dd > 3 && dd < 90) { e.x += dx / dd * 1.1; e.y += dy / dd * 0.55; }
              }
              if ((h.life & 1) === 0) {
                const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 60;
                parts(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, ['#ffffff', '#c0a8ff', '#9060e0'], 1,
                  { spread: 0.2, grav: 0, life: 16, up: 0, vx: -Math.cos(a) * 2.4, vy: -Math.sin(a) * 2, size: 1 });
              }
            },
          });
          vx('circle', sx, sy, { r: 46, frames: 52, color: '#9060e0', spin: 0.34 });
          for (let i = 0; i < 4; i++) vx('ring', sx, sy, { r0: 70 - i * 12, r1: 6, frames: 24 + i * 3, color: i % 2 ? '#c0a8ff' : '#ffffff', width: 3 });
          vx('flash', '#9060e0', 10, 0.6); vx('zoom', 1.18, 20);
          shake(11); hitstop(5); sfx('blackhole');
        }
        // 16 道刃往奇點收束
        if (t >= 18 && t % 2 === 0 && d.n < 16) {
          const i = d.n++, a = i * (Math.PI * 2 / 16) + t * 0.02, r = 92;
          const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r * 0.8;
          shoot({
            spr: 'proj_mix2_ring_void', x: px, y: py, vx: -Math.cos(a) * 5.2, vy: -Math.sin(a) * 4.2,
            dmg: 5, w: 14, h: 14, life: 34, type: 'cutter', pierce: true, solid: false, destructible: false, rotSpeed: 0.4,
          });
        }
        if (t === 54) {
          abox(sx, sy, 150, 130, { dmg: 10, type: 'cutter', life: 14, rehit: 0, knock: 3.2, pierce: true });
          vx('flash', '#ffffff', 14, 0.9);
          vx('burst', sx, sy, { n: 44, colors: ['#ffffff', '#c0a8ff', '#9060e0', '#2a1040'], speed: 5, life: 32, grav: 0 });
          for (let i = 0; i < 4; i++) vx('ring', sx, sy, { r0: 6 + i * 10, r1: 140, frames: 22 + i * 3, color: '#c0a8ff', width: 3 });
          shake(14); hitstop(6); sfx('magic_big');
        }
      },
    },
  });

  // ======================================================================
  // 12. hammermech 鎚機甲（hammer + mech）
  // ======================================================================
  build(COMBOS[11], {
    m2: 'up',
    desc: '鎚柄裝了固體燃料火箭，揮下去之前會先加速一次。',
    flavour: '維修手冊第一頁：請勿在室內使用。',
    moves: [['X', '火箭鎚'], ['↑+X', '飛彈鎚'], ['按住 50 幀放開', '蓄力・軌道砲鎚']],
    m1: {
      dur: 32, fps: 12, lock: true, maxHold: 600,
      start(p) { sfx('jet'); },
      tick(p, d, t) {
        if (t >= 4 && t <= 9) {
          parts(p.cx - p.dir * 14, p.cy - 14, ['#ffd8a0', '#ff9850', '#ff4010'], 2, { spread: 0.6, grav: -0.1, life: 14, up: 0.6, size: 2 });
          if (t === 6) { vx('aura', p, { color: '#ff9850', r: 18, frames: 16, pulse: 0.5 }); }
        }
        if (t === 10) {
          const gy = groundY(p);
          d.box = fbox(p, { w: 46, h: 36, dmg: 9, type: 'mech', ox: -2, oy: -19, life: 6, rehit: 0, knock: 3, breakBlocks: true, flipWithOwner: true });
          mbox(p, p.cx + p.dir * 24, gy - 14, 60, 30, { dmg: 6, type: 'mech', life: 12, rehit: 0, knock: 2.4, breakBlocks: true });
          for (const s of [1, -1]) vx('shockwave', p.cx, gy, { w: 38, h: 16, dir: s, speed: 5, frames: 18, color: '#ff9850' });
          vx('ring', p.cx + p.dir * 14, p.cy - 4, { r0: 4, r1: 40, frames: 16, color: '#ffd8a0', width: 3 });
          vx('burst', p.cx + p.dir * 20, p.cy - 4, { n: 24, colors: ['#ffd8a0', '#ff9850', '#d8dce8'], speed: 3.4, life: 24, grav: 0.06, size: 2 });
          vx('flash', '#ff9850', 6, 0.45);
          vx('textPop', p.cx, p.y - 14, 'ROCKET!', { color: '#ffd8a0', size: 8, frames: 30, rise: 0.5 });
          KB.fx('fx_gear', p.cx + p.dir * 20, p.cy - 6);
          shake(9); hitstop(4); sfx('hammer'); sfx('rocket_punch');
        }
      },
    },
    m2move: {
      dur: 42, fps: 12, lock: true,
      start(p) { sfx('reload'); },
      tick(p, d, t) {
        if (t === 6 || t === 16) {
          const s = t === 6 ? -1 : 1;
          KB.spawn(new Mix2Homing({
            spr: 'proj_mix2_rocket_steel', x: p.cx + s * 6, y: p.cy - 12, vx: p.dir * 2.4, vy: -4.6,
            dmg: 6, w: 18, h: 10, life: 90, owner: 'player', type: 'mech', dir: p.dir,
            turn: 0.15, seek: 220, delay: 14, trailCol: ['#ffd8a0', '#d8dce8'], breakBlocks: true,
            onHit(_t, q) {
              abox(q.cx, q.cy, 46, 38, { dmg: 5, type: 'mech', life: 8, rehit: 0, knock: 2.4 });
              vx('ring', q.cx, q.cy, { r0: 3, r1: 32, frames: 14, color: '#ffd8a0', width: 2 });
              vx('burst', q.cx, q.cy, { n: 18, colors: ['#ffd8a0', '#ff9850', '#d8dce8'], speed: 3.2, life: 22, grav: 0.05, size: 2 });
              shake(5);
            },
            onWall(q) {
              abox(q.cx, q.cy, 46, 38, { dmg: 5, type: 'mech', life: 8, rehit: 0 });
              vx('burst', q.cx, q.cy, { n: 16, colors: ['#ffd8a0', '#ff9850'], speed: 3, life: 20, grav: 0.05, size: 2 });
              shake(4);
            },
          }));
          vx('line', p.cx, p.cy - 8, p.cx + s * 12, p.cy - 32, { color: '#ffd8a0', width: 1, frames: 5 });
          KB.fx('fx_gear', p.cx + s * 8, p.cy - 10);
          sfx('missile');
        }
        if (t === 26) {
          // 收尾：把鎚子砸回地面，順便把飛彈的煙壓下去
          const gy = groundY(p);
          mbox(p, p.cx + p.dir * 18, gy - 12, 48, 26, { dmg: 5, type: 'mech', life: 10, rehit: 0, knock: 2, breakBlocks: true });
          vx('shockwave', p.cx, gy, { w: 30, h: 14, dir: p.dir, speed: 4.4, frames: 14, color: '#ff9850' });
          shake(5); sfx('hammer');
        }
      },
    },
    ult: {
      anim: 'kirby_attack_hammermech_ult', dur: 70, fps: 10, lock: true,
      start(p, d) {
        ultIntro(p, '#ff9850', '軌道砲鎚');
        vx('worldTint', '#2c1c38', 0.42, 66);
        d.tx = null; d.fired = false; sfx('charge');
      },
      tick(p, d, t) {
        p.vx *= 0.86;
        if (t === 10) {
          const tgt = nearest(p.cx, p.cy, 230);
          d.tx = tgt ? tgt.cx : p.cx + p.dir * 60;
          vx('circle', d.tx, groundY(p) - 10, { r: 30, frames: 40, color: '#ff9850', spin: 0.3 });
          vx('ring', d.tx, groundY(p) - 10, { r0: 34, r1: 8, frames: 20, color: '#ffd8a0', width: 2 });
          sfx('reload');
        }
        if (t > 10 && t < 30 && t % 3 === 0 && d.tx !== null) {
          vx('line', d.tx, p.cy - 150, d.tx, groundY(p), { color: '#ffd8a0', width: 1, frames: 6 });
        }
        if (t === 30 && !d.fired) {
          d.fired = true;
          const x = d.tx === null ? p.cx + p.dir * 60 : d.tx, gy = groundY(p);
          abox(x, gy - 115, 70, 230, { dmg: 15, type: 'mech', life: 20, rehit: 0, knock: 3.2, pierce: true, breakBlocks: true });
          vx('beam', x, gy + 4, -Math.PI / 2, 230, { width: 54, color: '#ffd8a0', frames: 22 });
          vx('beam', x, gy + 4, -Math.PI / 2, 230, { width: 26, color: '#ffffff', frames: 18 });
          shoot({
            spr: 'proj_mix2_rocket_steel', x, y: gy - 150, vx: 0, vy: 8, rot: Math.PI / 2, dmg: 10, w: 24, h: 24,
            life: 40, pierce: true, type: 'mech', trail: '#ffd8a0', scale: 2, destructible: false, breakBlocks: true, solid: false,
          });
          for (const s of [1, -1]) vx('shockwave', x, gy, { w: 44, h: 18, dir: s, speed: 5.4, frames: 22, color: '#ff9850' });
          for (let i = 0; i < 4; i++) vx('ring', x, gy - 10, { r0: 6 + i * 10, r1: 120, frames: 22 + i * 3, color: i % 2 ? '#ffd8a0' : '#ffffff', width: 3 });
          vx('burst', x, gy - 10, { n: 40, colors: ['#ffd8a0', '#ff9850', '#d8dce8', '#ffffff'], speed: 4.8, life: 32, grav: 0.05, size: 2 });
          vx('flash', '#ffffff', 14, 0.9); vx('zoom', 1.2, 20);
          vx('textPop', p.cx, p.y - 18, 'ORBITAL!', { color: '#ffd8a0', size: 8, frames: 40, rise: 0.4 });
          shake(15); hitstop(6); sfx('meteor'); sfx('rocket_punch');
        }
        if (t > 30 && t % 5 === 0) { shake(3); parts(d.tx === null ? p.cx : d.tx, groundY(p) - rnd(4, 40), ['#ffd8a0', '#ff9850', '#d8dce8'], 3, { spread: 1.2, grav: 0.08, life: 24, up: 0.8, size: 2 }); }
      },
    },
  });

  // ======================================================================
  //  Round 9：補齊 ↑+X / ↓+X / 空中 X（每組五招：X / ↑X / ↓X / 空中 X / 蓄力）
  //  規則與第一批相同：↑X 是對空升招（空中出招時用 echo() 把餘波打到腳下地面），
  //  ↓X 一律以 groundY(p) 為基準（地面 / 空中演出一致），空中 X 是俯衝或滯空射擊
  //  （滯空一律 slowFall 且招式長度 ≤ 30 幀，不會變成懸停）。
  // ======================================================================
  function echo(p, o) {
    const air = !p.onGround, gy = groundY(p), x = p.cx + p.dir * 6;
    const w = air ? (o.w || 48) : Math.round((o.w || 48) * 0.75);
    const h = mbox(p, x, gy - 11, w, o.h || 24, {
      dmg: air ? (o.dmg || 4) : Math.max(2, (o.dmg || 4) - 2), type: o.type, life: 12, rehit: 0, knock: 1.2, freeze: !!o.freeze,
      onHit: o.para ? (e => para(e, 100)) : undefined,
    });
    vx('ring', x, gy - 6, { r0: 3, r1: 26, frames: 12, color: o.color, width: 2 });
    vx('burst', x, gy - 6, { n: 12, colors: o.cols, speed: 2.6, life: 18, grav: 0.05 });
    parts(x + rnd(-16, 16), gy - 4, o.cols, 3, { spread: 0.7, grav: -0.04, life: 18, up: 0.5, size: 1 });
    shake(3);
    return h;
  }
  const hop = (p, v) => { if (p.onGround) { p.vy = v; p.onGround = false; } };

  // ---------- 1. flamebow 焰弓 ----------
  addMoves('flamebow', {
    up: {
      dur: 32, fps: 14, lock: true,
      start(p, d) {
        d.burst = false;
        shoot({ spr: 'proj_mix2_arrow_fire', x: p.cx + p.dir * 8, y: p.cy - 8, vx: p.dir * 0.8, vy: -7, rot: -Math.PI / 2, dmg: 4, w: 10, h: 18, life: 18, type: 'fire', trail: '#ff9020', solid: false });
        vx('line', p.cx, p.cy - 4, p.cx + p.dir * 6, p.cy - 56, { color: '#ffe040', width: 1, frames: 8 });
        sfx('bow');
      },
      tick(p, d, t) {
        if (t === 13 && !d.burst) {
          d.burst = true;
          const x = p.cx + p.dir * 10, y = p.cy - 46;
          abox(x, y, 50, 50, { dmg: 7, type: 'fire', life: 16, rehit: 0, knock: 2 });
          for (let i = -2; i <= 2; i++) {
            shoot({ spr: 'proj_mix2_arrow_fire', x, y, vx: i * 1.5, vy: 2.6 + Math.abs(i) * 0.3, rot: Math.PI / 2, grav: 0.16, dmg: 4, w: 12, h: 8, life: 60, type: 'fire', trail: '#ff9020', onWall(pr) { firePool(pr.cx, pr.bottom, 40, 3); } });
          }
          for (let i = 0; i < 3; i++) vx('ring', x, y, { r0: 4 + i * 8, r1: 40, frames: 16 + i * 2, color: i & 1 ? '#ffe040' : '#ff9020', width: 2 });
          vx('burst', x, y, { n: 24, colors: ['#ffffff', '#ffe040', '#ff9020'], speed: 3.4, life: 26, grav: 0.04 });
          vx('flash', '#ffe040', 6, 0.45);
          echo(p, { type: 'fire', color: '#ff9020', cols: ['#ffe040', '#ff9020'], dmg: 5 });
          shake(5); sfx('fireball');
        }
      },
    },
    dn: {
      dur: 36, fps: 14, lock: true,
      start(p, d) { d.n = 0; sfx('bow'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 3.6);
        if (t % 6 === 2 && d.n < 3) {
          const i = d.n++, gy = groundY(p), x = p.cx + p.dir * (20 + i * 24);
          shoot({ spr: 'proj_mix2_arrow_fire', x: p.cx + p.dir * 10, y: p.cy, vx: p.dir * 3.4, vy: 3.8, rot: p.dir > 0 ? 0.85 : Math.PI - 0.85, dmg: 3, w: 12, h: 8, life: 22, type: 'fire', trail: '#ff9020', solid: false });
          abox(x, gy - 25, 18, 46, {
            dmg: 5, type: 'fire', life: 26, rehit: 10, knock: 1.4,
            onUpdate(h) { if ((h.life & 3) === 0) { KB.fx('fx_fire', h.x + rnd(2, h.w - 2), h.y + rnd(10, h.h), { life: 12, fps: 12 }); parts(h.x + rnd(0, h.w), h.y + h.h - 4, ['#ffe040', '#ff9020'], 2, { spread: 0.3, grav: -0.12, life: 18, up: 1, size: 1 }); } },
          });
          vx('ring', x, gy - 6, { r0: 2, r1: 20, frames: 12, color: '#ffe040', width: 2 });
          shake(3); sfx('fire');
        }
      },
    },
  }, [['X', '火箭（命中爆炸）'], ['↑+X', '烈陽仰射'], ['↓+X', '地火箭列'], ['空中 X', '火雨（落地留火海）'], ['按住 50 幀放開', '蓄力・鳳凰箭']]);

  // ---------- 2. frosthammer 冰鎚 ----------
  addMoves('frosthammer', {
    up: {
      dur: 30, fps: 12, lock: true,
      start(p, d) {
        hop(p, -4.4);
        const x = p.cx + p.dir * 8;
        d.box = mbox(p, x, p.cy - 20, 32, 54, { dmg: 7, type: 'ice', life: 12, rehit: 0, freeze: true, knock: 2.4, onHit: e => { e.vy = -5; } });
        for (const s of [-1, 1]) {
          shoot({ spr: 'proj_mix2_shard_ice', x, y: p.cy - 22, vx: s * 1.6, vy: -4.6, grav: 0.2, dmg: 4, w: 10, h: 20, life: 44, type: 'ice', freeze: true, destructible: false, rotSpeed: 0.22 * s });
        }
        vx('slash', x, p.cy - 12, 26, -1.5, { color: '#b8f0ff', width: 4, frames: 12, arc: 2.5, flip: p.dir < 0 });
        vx('burst', x, p.cy - 18, { n: 20, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3, life: 24, grav: -0.04, dir: -Math.PI / 2, spread: 0.8 });
        echo(p, { type: 'ice', color: '#b8f0ff', cols: ['#ffffff', '#b8f0ff'], dmg: 5, freeze: true });
        shake(5); hitstop(2); sfx('hammer'); sfx('ice');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + p.dir * 8 + rnd(-10, 10), p.cy - rnd(0, 30), ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: -0.08, life: 18, up: 0.8, size: 1 });
        if (t === 14) killBox(p);
      },
    },
    air: {
      dur: 44, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 7; p.vx = p.dir * 1;
        vx('afterimage', p, { frames: 30, color: '#6fd0f8', every: 2, alpha: 0.55 });
        sfx('hammer');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 6.4);
        d.box = fbox(p, { w: 28, h: 28, dmg: 5, type: 'ice', ox: -14, oy: -6, life: 3, rehit: 8, freeze: true, flipWithOwner: false });
        if (t % 3 === 0) parts(p.cx + rnd(-8, 8), p.cy, ['#ffffff', '#b8f0ff'], 2, { spread: 0.5, grav: 0, life: 14, up: 0, size: 1 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          mbox(p, p.cx, p.bottom - 15, 68, 34, { dmg: 8, type: 'ice', life: 16, rehit: 0, freeze: true, knock: 2.4 });
          for (const s of [-1, 1]) {
            shoot({ spr: 'proj_mix2_shard_ice', x: p.cx + s * 26, y: p.bottom - 14, vx: 0, vy: 0, dmg: 5, w: 12, h: 26, life: 26, solid: false, pierce: true, freeze: true, type: 'ice', destructible: false });
          }
          vx('ring', p.cx, p.bottom - 6, { r0: 4, r1: 44, frames: 16, color: '#b8f0ff', width: 3 });
          vx('burst', p.cx, p.bottom - 6, { n: 24, colors: ['#ffffff', '#b8f0ff', '#3f96d8'], speed: 3.4, life: 26, grav: 0.05, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'FREEZE!', { color: '#b8f0ff', size: 8, frames: 30, rise: 0.5 });
          shake(8); hitstop(4); sfx('icewall');
          p.attackTimer = Math.min(p.attackTimer, 16);
        }
      },
    },
  }, [['X', '凍地衝擊'], ['↑+X', '冰鎚上擊'], ['↓+X', '冰柱群'], ['空中 X', '霜墜鎚'], ['按住 50 幀放開', '蓄力・冰河期']]);

  // ---------- 3. thundersword 雷劍 ----------
  addMoves('thundersword', {
    up: {
      dur: 28, fps: 16, lock: true,
      start(p, d) {
        hop(p, -4.6);
        const x = p.cx + p.dir * 8;
        d.box = mbox(p, x, p.cy - 26, 24, 68, { dmg: 6, type: 'spark', life: 12, rehit: 0, knock: 2.4, onHit: e => { e.vy = -4.8; para(e, 110); } });
        vx('lightning', x, p.cy + 8, x, p.cy - 58, { color: '#ffe860', frames: 14, jitter: 6, branches: 4 });
        vx('slash', x, p.cy - 14, 25, -1.6, { color: '#ffe860', width: 3, frames: 12, arc: 2.6, flip: p.dir < 0 });
        vx('flash', '#ffe860', 5, 0.4);
        echo(p, { type: 'spark', color: '#ffe860', cols: ['#ffe860', '#ffffff', '#4878f8'], dmg: 5, para: true });
        shake(4); sfx('sword'); sfx('spark');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-8, 8), p.cy - rnd(0, 38), ['#ffe860', '#ffffff'], 1, { spread: 0.3, grav: 0, life: 12, up: 0.5, size: 1 });
        if (t === 13) killBox(p);
      },
    },
    dn: {
      dur: 34, fps: 14, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4.2); sfx('sword'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5);
        if (t === 9 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          mbox(p, p.cx + p.dir * 18, gy - 12, 84, 22, { dmg: 7, type: 'spark', life: 18, rehit: 0, knock: 2, onHit: e => para(e, 130) });
          for (let i = 0; i < 3; i++) {
            const x = p.cx + p.dir * (14 + i * 26);
            vx('lightning', x, gy - 4, x, gy - 34, { color: i & 1 ? '#ffffff' : '#ffe860', frames: 12, jitter: 6, branches: 3 });
            parts(x, gy - 4, ['#ffe860', '#ffffff'], 4, { spread: 0.8, grav: -0.05, life: 18, up: 0.7, size: 1 });
          }
          vx('shockwave', p.cx, gy, { w: 36, h: 16, dir: p.dir, speed: 5, frames: 18, color: '#ffe860' });
          vx('flash', '#ffe860', 5, 0.4);
          shake(7); hitstop(3); sfx('thunder');
        }
      },
    },
  }, [['X', '帶電斬（麻痺）'], ['↑+X', '雷昇斬'], ['↓+X', '落雷插劍'], ['空中 X', '雷擊落下斬'], ['按住 50 幀放開', '蓄力・雷神劍']]);

  // ---------- 4. flameninja 火忍 ----------
  addMoves('flameninja', {
    up: {
      dur: 28, fps: 16, lock: true,
      start(p, d) {
        hop(p, -4.2);
        const x = p.cx + p.dir * 6;
        d.box = mbox(p, x, p.cy - 22, 30, 56, { dmg: 6, type: 'fire', life: 10, rehit: 0, knock: 2, onHit: e => { e.vy = -4.4; } });
        for (let i = -1; i <= 1; i++) {
          shoot({ spr: 'proj_mix2_star_fire', x, y: p.cy - 14, vx: i * 1.8, vy: -5.4, dmg: 4, w: 12, h: 12, life: 40, type: 'fire', pierce: true, solid: false, rotSpeed: 0.4, trail: '#ff9020' });
        }
        vx('circle', x, p.cy - 18, { r: 24, frames: 18, color: '#ff5828', spin: 0.42 });
        vx('burst', x, p.cy - 20, { n: 18, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3, life: 22, grav: -0.05, dir: -Math.PI / 2, spread: 0.7 });
        echo(p, { type: 'fire', color: '#ff5828', cols: ['#ffe040', '#ff5828'], dmg: 5 });
        shake(3); sfx('shuriken'); sfx('fire');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy - rnd(0, 30), ['#ffe040', '#ff5828'], 1, { spread: 0.4, grav: -0.06, life: 14, up: 0.6, size: 1 });
        if (t === 12) killBox(p);
      },
    },
    air: {
      dur: 28, fps: 16, lock: false,
      start(p, d) {
        d.n = 0;
        vx('afterimage', p, { frames: 24, color: '#ff5828', every: 2, alpha: 0.5 });
        sfx('shuriken');
      },
      tick(p, d, t) {
        slowFall(p, 1.3);
        if (t % 4 === 1 && d.n < 5) {
          const i = d.n++;
          const a = 0.85 + i * 0.22;
          shoot({ spr: 'proj_mix2_star_fire', x: p.cx + p.dir * 8, y: p.cy + 2, vx: Math.cos(a) * 5 * (p.dir < 0 ? -1 : 1), vy: Math.sin(a) * 5, dmg: 4, w: 12, h: 12, life: 50, type: 'fire', pierce: true, rotSpeed: 0.5, trail: '#ff9020', onWall(pr) { firePool(pr.cx, pr.bottom, 36, 3); } });
          parts(p.cx, p.cy + 2, ['#ffe040', '#ff5828'], 2, { spread: 0.5, grav: 0.02, life: 14, up: 0, size: 1 });
          sfx('shuriken');
        }
      },
    },
  }, [['X', '火遁手裡劍'], ['↑+X', '火遁・天輪手裡劍'], ['↓+X', '火焰替身爆'], ['空中 X', '炎舞亂投'], ['按住 50 幀放開', '蓄力・火遁大炎']]);

  // ---------- 5. frostninja 冰忍 ----------
  addMoves('frostninja', {
    up: {
      dur: 30, fps: 16, lock: true,
      start(p, d) {
        hop(p, -4.2);
        const x = p.cx + p.dir * 6;
        d.box = mbox(p, x, p.cy - 24, 28, 58, { dmg: 6, type: 'ice', life: 12, rehit: 0, freeze: true, knock: 1.8, onHit: e => { e.vy = -4.2; } });
        for (let i = 0; i < 3; i++) {
          shoot({ spr: 'proj_mix2_shard_ice', x: x + (i - 1) * 7, y: p.cy - 10 - i * 8, vx: (i - 1) * 0.9, vy: -5, dmg: 4, w: 10, h: 22, life: 38, type: 'ice', freeze: true, solid: false, pierce: true, destructible: false });
        }
        vx('slash', x, p.cy - 16, 22, -1.6, { color: '#a8e8ff', width: 3, frames: 12, arc: 2.6, flip: p.dir < 0 });
        vx('burst', x, p.cy - 22, { n: 18, colors: ['#ffffff', '#a8e8ff', '#3f96d8'], speed: 2.8, life: 24, grav: -0.03, dir: -Math.PI / 2, spread: 0.7 });
        echo(p, { type: 'ice', color: '#a8e8ff', cols: ['#ffffff', '#a8e8ff'], dmg: 5, freeze: true });
        shake(3); sfx('ice');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy - rnd(0, 34), ['#ffffff', '#a8e8ff'], 1, { spread: 0.4, grav: -0.04, life: 16, up: 0.6, size: 1 });
        if (t === 14) killBox(p);
      },
    },
    air: {
      dur: 28, fps: 16, lock: false,
      start(p, d) { d.n = 0; vx('afterimage', p, { frames: 24, color: '#a8e8ff', every: 2, alpha: 0.5 }); sfx('ice'); },
      tick(p, d, t) {
        slowFall(p, 1.3);
        if (t % 3 === 1 && d.n < 6) {
          const i = d.n++;
          const a = 0.8 + (i % 3) * 0.3;
          shoot({ spr: 'proj_mix2_arrow_ice', x: p.cx + p.dir * 8, y: p.cy + 2, vx: Math.cos(a) * 5.4 * (p.dir < 0 ? -1 : 1), vy: Math.sin(a) * 5.4, rot: a * (p.dir < 0 ? -1 : 1), dmg: 4, w: 12, h: 8, life: 50, type: 'ice', freeze: true, trail: '#a8e8ff' });
          parts(p.cx, p.cy + 2, ['#ffffff', '#a8e8ff'], 2, { spread: 0.5, grav: 0.02, life: 14, up: 0, size: 1 });
          sfx('shuriken');
        }
      },
    },
  }, [['X', '冰針三連'], ['↑+X', '冰柱天梯'], ['↓+X', '冰鏡瞬移'], ['空中 X', '霰針亂舞'], ['按住 50 幀放開', '蓄力・吹雪']]);

  // ---------- 6. thundergun 雷槍 ----------
  addMoves('thundergun', {
    up: {
      dur: 30, fps: 14, lock: true,
      start(p, d) {
        d.burst = false;
        shoot({ spr: 'proj_mix2_orb_spark', x: p.cx + p.dir * 8, y: p.cy - 8, vx: p.dir * 0.6, vy: -6.6, dmg: 4, w: 10, h: 10, life: 18, type: 'spark', trail: '#ffc830', solid: false });
        KB.fx('fx_muzzle', p.cx + p.dir * 12, p.cy - 6, { flip: p.dir < 0 });
        sfx('gun');
      },
      tick(p, d, t) {
        if (t === 12 && !d.burst) {
          d.burst = true;
          const x = p.cx + p.dir * 8, y = p.cy - 42;
          abox(x, y, 46, 46, {
            dmg: 6, type: 'spark', life: 28, rehit: 10, knock: 1.6, onHit: e => para(e, 120),
            onUpdate(h) {
              if ((h.life & 3) === 0) {
                vx('lightning', h.x + 2, h.y + rnd(2, h.h - 2), h.x + h.w - 2, h.y + rnd(2, h.h - 2), { color: '#ffc830', frames: 6, jitter: 4, branches: 2 });
                parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#fff8c0', '#ffc830'], 1, { spread: 0.4, grav: 0, life: 12, up: 0, size: 1 });
              }
            },
          });
          vx('circle', x, y, { r: 26, frames: 26, color: '#ffc830', spin: 0.3 });
          vx('flash', '#ffc830', 5, 0.4);
          echo(p, { type: 'spark', color: '#ffc830', cols: ['#fff8c0', '#ffc830'], dmg: 4, para: true });
          shake(4); sfx('spark');
        }
      },
    },
    air: {
      dur: 28, fps: 14, lock: false,
      start(p, d) { d.n = 0; vx('aura', p, { color: '#ffc830', r: 16, frames: 26 }); },
      tick(p, d, t) {
        slowFall(p, 1.3);
        if (t % 6 === 1 && d.n < 4) {
          d.n++;
          const mx = p.cx + p.dir * 10, my = p.cy + 3;
          shoot({ spr: 'proj_mix2_orb_spark', x: mx, y: my, vx: p.dir * 3.4, vy: 3.4, dmg: 4, w: 10, h: 10, life: 50, type: 'spark', dir: p.dir, trail: '#ffc830', onHit: e => para(e, 100) });
          vx('line', mx, my, mx + p.dir * 34, my + 34, { color: '#ffc830', width: 1, frames: 5 });
          KB.fx('fx_muzzle', mx, my, { flip: p.dir < 0 });
          sfx('gun'); shake(1);
        }
      },
    },
  }, [['X', '電擊彈（鎖鏈電）'], ['↑+X', '對空電漿彈'], ['↓+X', '電網霰彈'], ['空中 X', '滯空掃射'], ['按住 50 幀放開', '蓄力・雷射砲']]);

  // ---------- 7. stonegiant 岩巨人 ----------
  addMoves('stonegiant', {
    up: {
      dur: 32, fps: 12, lock: true,
      start(p, d) {
        hop(p, -4);
        const x = p.cx + p.dir * 10;
        d.box = mbox(p, x, p.cy - 22, 32, 62, { dmg: 7, type: 'stone', life: 14, rehit: 0, knock: 2.6, onHit: e => { e.vy = -5.2; } });
        for (const s of [-1, 1]) {
          shoot({ spr: 'proj_mix2_shard_stone', x: x + s * 8, y: p.cy - 24, vx: s * 1.4, vy: -4.8, grav: 0.24, dmg: 5, w: 12, h: 24, life: 50, type: 'stone', destructible: false, rotSpeed: 0.18 * s });
        }
        vx('ring', x, p.cy - 14, { r0: 4, r1: 34, frames: 16, color: '#c0b098', width: 3 });
        vx('burst', x, p.cy - 20, { n: 22, colors: ['#d8ccb8', '#c0b098', '#8a7a62'], speed: 3.2, life: 26, grav: 0.06, dir: -Math.PI / 2, spread: 0.8, size: 2 });
        echo(p, { type: 'stone', color: '#c0b098', cols: ['#d8ccb8', '#c0b098'], dmg: 5, w: 54 });
        shake(6); hitstop(2); sfx('rocket_punch'); sfx('hardblock');
      },
      tick(p, d, t) {
        if (t % 3 === 0) parts(p.cx + p.dir * 10 + rnd(-10, 10), p.cy - rnd(0, 34), ['#d8ccb8', '#c0b098'], 2, { spread: 0.5, grav: 0.06, life: 20, up: 0.8, size: 1 });
        if (t === 15) killBox(p);
      },
    },
    air: {
      dur: 46, fps: 12, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 7.6; p.vx = p.dir * 0.6;
        vx('afterimage', p, { frames: 30, color: '#a89078', every: 2, alpha: 0.5 });
        sfx('giant_roar');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 7);
        d.box = fbox(p, { w: 32, h: 26, dmg: 6, type: 'stone', ox: -16, oy: -4, life: 3, rehit: 8, flipWithOwner: false });
        if (t % 3 === 0) parts(p.cx + rnd(-10, 10), p.cy, ['#d8ccb8', '#a89078'], 2, { spread: 0.5, grav: -0.04, life: 14, up: 0.3, size: 2 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          mbox(p, p.cx, p.bottom - 16, 96, 36, { dmg: 9, type: 'stone', life: 16, rehit: 0, knock: 2.8, breakBlocks: true });
          for (const s of [-1, 1]) {
            vx('shockwave', p.cx, p.bottom, { w: 48, h: 20, dir: s, speed: 5.4, frames: 20, color: '#c0b098' });
            shoot({ spr: 'proj_mix2_shard_stone', x: p.cx + s * 16, y: p.bottom - 12, vx: s * 2.6, vy: -3.6, grav: 0.26, dmg: 5, w: 12, h: 24, life: 50, type: 'stone', destructible: false, rotSpeed: 0.2 * s });
          }
          vx('ring', p.cx, p.bottom - 6, { r0: 4, r1: 52, frames: 18, color: '#d8ccb8', width: 3 });
          vx('burst', p.cx, p.bottom - 6, { n: 28, colors: ['#d8ccb8', '#c0b098', '#8a7a62'], speed: 3.8, life: 28, grav: 0.1, size: 2 });
          vx('textPop', p.cx, p.y - 12, 'QUAKE!', { color: '#d8ccb8', size: 8, frames: 30, rise: 0.5 });
          shake(11); hitstop(5); sfx('stomp');
          p.attackTimer = Math.min(p.attackTimer, 18);
        }
      },
    },
  }, [['X', '岩拳踩踏'], ['↑+X', '擎天岩柱'], ['↓+X', '滾石衝撞'], ['空中 X', '巨人墜擊'], ['按住 50 幀放開', '蓄力・山崩']]);

  // ---------- 8. flamedragon 炎龍 ----------
  addMoves('flamedragon', {
    up: {
      dur: 34, fps: 12, lock: true,
      start(p, d) { d.box = null; vx('aura', p, { color: '#ff5030', r: 18, frames: 32 }); sfx('dragon_breath'); },
      tick(p, d, t) {
        if (t === 4) {
          const x = p.cx + p.dir * 4;
          d.box = mbox(p, x, p.cy - 32, 28, 68, { dmg: 6, type: 'fire', life: 24, rehit: 8, knock: 1.4, onHit: e => { e.vy = -3.6; } });
          vx('circle', x, p.cy - 28, { r: 22, frames: 22, color: '#ff9020', spin: 0.24 });
        }
        if (t >= 4 && t <= 28 && t % 2 === 0) {
          const x = p.cx + p.dir * 4;
          KB.fx('fx_fire', x + rnd(-8, 8), p.cy - rnd(4, 56), { life: 14, fps: 12 });
          parts(x + rnd(-10, 10), p.cy - rnd(0, 58), ['#ffe040', '#ff9020', '#ff4010'], 2, { spread: 0.5, grav: -0.12, life: 22, up: 1.2, size: 1 });
        }
        if (t === 8) echo(p, { type: 'fire', color: '#ff9020', cols: ['#ffe040', '#ff9020'], dmg: 5 });
        if (t === 28) killBox(p);
      },
    },
    dn: {
      dur: 32, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 3.8); sfx('tail_whip'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 4.6);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          mbox(p, p.cx + p.dir * 24, gy - 13, 72, 24, { dmg: 7, type: 'fire', life: 18, rehit: 0, knock: 2, onHit: e => { e.vy = -3; } });
          firePool(p.cx + p.dir * 18, gy, 50, 3); firePool(p.cx + p.dir * 48, gy, 50, 3);
          for (let i = 0; i < 3; i++) vx('line', p.cx, gy - 4 - i * 4, p.cx + p.dir * 60, gy - 4 - i * 4, { color: i === 1 ? '#ffe040' : '#ff5030', width: 1, frames: 12 });
          vx('burst', p.cx + p.dir * 24, gy - 6, { n: 20, colors: ['#ffe040', '#ff9020', '#ff4010'], speed: 3.2, life: 24, grav: 0.04 });
          shake(6); hitstop(2); sfx('fire');
        }
      },
    },
  }, [['X', '炎息加強'], ['↑+X', '焚天吐息'], ['↓+X', '熔岩爪痕'], ['空中 X', '炎翼衝'], ['按住 50 幀放開', '蓄力・太陽炎']]);

  // ---------- 9. thunderdragon 雷龍 ----------
  addMoves('thunderdragon', {
    up: {
      dur: 32, fps: 12, lock: true,
      start(p, d) { d.box = null; vx('aura', p, { color: '#b0d8ff', r: 18, frames: 30 }); sfx('giant_roar'); },
      tick(p, d, t) {
        if (t === 4) {
          const x = p.cx + p.dir * 4;
          d.box = mbox(p, x, p.cy - 33, 26, 70, { dmg: 6, type: 'spark', life: 22, rehit: 8, knock: 1.4, onHit: e => { e.vy = -3.8; para(e, 110); } });
          vx('lightning', x, p.cy + 6, x, p.cy - 62, { color: '#b0d8ff', frames: 16, jitter: 7, branches: 4 });
        }
        if (t >= 4 && t <= 26 && t % 3 === 0) {
          const x = p.cx + p.dir * 4;
          vx('lightning', x + rnd(-8, 8), p.cy - 10, x + rnd(-10, 10), p.cy - rnd(30, 60), { color: '#ffffff', frames: 8, jitter: 5, branches: 2 });
          parts(x + rnd(-10, 10), p.cy - rnd(0, 60), ['#ffffff', '#b0d8ff', '#4878f8'], 2, { spread: 0.5, grav: -0.1, life: 20, up: 1, size: 1 });
        }
        if (t === 8) echo(p, { type: 'spark', color: '#b0d8ff', cols: ['#ffffff', '#b0d8ff'], dmg: 5, para: true });
        if (t === 26) killBox(p);
      },
    },
    dn: {
      dur: 32, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 3.8); sfx('tail_whip'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 4.6);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          mbox(p, p.cx + p.dir * 24, gy - 13, 76, 24, { dmg: 7, type: 'spark', life: 20, rehit: 0, knock: 2, onHit: e => para(e, 130) });
          for (let i = 0; i < 4; i++) {
            const x = p.cx + p.dir * (10 + i * 20);
            vx('lightning', x, gy - 3, x + p.dir * 18, gy - 3, { color: i & 1 ? '#ffffff' : '#b0d8ff', frames: 10, jitter: 5, branches: 2 });
            parts(x, gy - 4, ['#ffffff', '#b0d8ff'], 3, { spread: 0.7, grav: -0.05, life: 18, up: 0.6, size: 1 });
          }
          vx('shockwave', p.cx, gy, { w: 34, h: 16, dir: p.dir, speed: 5, frames: 18, color: '#b0d8ff' });
          shake(6); hitstop(2); sfx('spark');
        }
      },
    },
  }, [['X', '雷息'], ['↑+X', '雷鳴嘶吼'], ['↓+X', '地脈雷爪'], ['空中 X', '雷翼俯衝'], ['按住 50 幀放開', '蓄力・雷雲']]);

  // ---------- 10. timebeam 時光束 ----------
  addMoves('timebeam', {
    dn: {
      dur: 38, fps: 12, lock: true,
      start(p, d) { d.done = false; sfx('slowmo'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 3);
        if (t === 8 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          abox(p.cx + p.dir * 14, gy - 22, 66, 42, {
            dmg: 6, type: 'beam', life: 40, rehit: 12, knock: 0.8, onHit: e => para(e, 150),
            onUpdate(h) {
              if ((h.life & 3) === 0) parts(h.x + rnd(0, h.w), h.y + rnd(0, h.h), ['#c0a8ff', '#ffffff', '#7a30d8'], 2, { spread: 0.3, grav: -0.02, life: 24, up: 0.2, size: 1 });
            },
          });
          for (let i = 0; i < 3; i++) vx('ring', p.cx + p.dir * 14, gy - 18, { r0: 4 + i * 8, r1: 40, frames: 22 + i * 4, color: '#c0a8ff', width: 2 });
          vx('circle', p.cx + p.dir * 14, gy - 18, { r: 28, frames: 36, color: '#ffffff', spin: -0.16 });
          shoot({ spr: 'proj_mix2_ring_time', x: p.cx + p.dir * 14, y: gy - 18, vx: 0, vy: 0, dmg: 4, w: 20, h: 20, life: 40, solid: false, pierce: true, type: 'beam', destructible: false, rotSpeed: -0.12 });
          vx('worldTint', '#302060', 0.2, 24);
          shake(4); sfx('timestop');
        }
      },
    },
    air: {
      dur: 30, fps: 12, lock: false,
      start(p, d) {
        vx('circle', p.cx, p.cy, { r: 26, frames: 30, color: '#c0a8ff', spin: -0.28 });
        shoot({ spr: 'proj_mix2_ring_time', x: p.cx, y: p.cy, vx: 0, vy: 0, dmg: 3, w: 16, h: 16, life: 30, solid: false, pierce: true, type: 'beam', destructible: false, rotSpeed: -0.2 });
        sfx('rewind');
      },
      tick(p, d, t) {
        slowFall(p, 1.1);
        d.box = fbox(p, { w: 44, h: 44, dmg: 4, type: 'beam', ox: -22, oy: -22, life: 3, rehit: 10, flipWithOwner: false, onHit: e => para(e, 140) });
        if (t % 3 === 0) {
          const a = t * 0.24;
          parts(p.cx + Math.cos(a) * 20, p.cy + Math.sin(a) * 20, ['#c0a8ff', '#ffffff'], 1, { spread: 0.2, grav: 0, life: 16, up: 0, size: 1 });
        }
        if (t === 20) { vx('ring', p.cx, p.cy, { r0: 6, r1: 40, frames: 16, color: '#ffffff', width: 2 }); sfx('timeresume'); }
      },
    },
  }, [['X', '凍結光束'], ['↑+X', '時間裂縫'], ['↓+X', '時砂沙漏'], ['空中 X', '逆行光環'], ['按住 50 幀放開', '蓄力・時停爆']]);

  // ---------- 11. gravityblade 重力刃 ----------
  addMoves('gravityblade', {
    up: {
      dur: 30, fps: 14, lock: true,
      start(p, d) {
        hop(p, -4.2);
        const x = p.cx + p.dir * 8;
        d.box = mbox(p, x, p.cy - 22, 30, 58, { dmg: 6, type: 'cutter', life: 14, rehit: 0, knock: 1.4, onHit: e => { e.vy = -5.4; } });
        for (const s of [-1, 1]) {
          shoot({ spr: 'proj_mix2_star_void', x, y: p.cy - 16, vx: s * 1.6, vy: -5, dmg: 4, w: 12, h: 12, life: 44, type: 'cutter', pierce: true, solid: false, rotSpeed: 0.36, trail: '#9060e0' });
        }
        vx('ring', x, p.cy - 16, { r0: 4, r1: 34, frames: 18, color: '#9060e0', width: 2 });
        vx('burst', x, p.cy - 20, { n: 18, colors: ['#ffffff', '#c0a8ff', '#9060e0'], speed: 3, life: 24, grav: -0.06, dir: -Math.PI / 2, spread: 0.8 });
        echo(p, { type: 'cutter', color: '#9060e0', cols: ['#c0a8ff', '#9060e0'], dmg: 5 });
        shake(4); sfx('gravity_lift');
      },
      tick(p, d, t) {
        // 反重力：把附近的敵人往上抬（只抬小怪）
        const g = KB.game;
        if (g && t < 18) for (const e of g.entities) {
          if (e.dead || e.type !== 'enemy' || e.tough) continue;
          if (Math.abs(e.cx - p.cx) < 42 && Math.abs(e.cy - p.cy) < 48) e.y -= 0.9;
        }
        if (t % 3 === 0) parts(p.cx + rnd(-12, 12), p.cy - rnd(0, 34), ['#c0a8ff', '#9060e0'], 1, { spread: 0.3, grav: -0.06, life: 18, up: 0.7, size: 1 });
        if (t === 14) killBox(p);
      },
    },
    air: {
      dur: 38, fps: 14, lock: true,
      start(p, d) {
        d.landed = false; p.vy = 6.6; p.vx = p.dir * 0.8;
        vx('afterimage', p, { frames: 28, color: '#9060e0', every: 2, alpha: 0.55 });
        vx('circle', p.cx, p.cy, { r: 24, frames: 24, color: '#c0a8ff', spin: 0.4 });
        sfx('blackhole');
      },
      tick(p, d, t) {
        if (d.landed) return;
        p.vy = Math.max(p.vy, 6.2);
        d.box = fbox(p, { w: 30, h: 30, dmg: 5, type: 'cutter', ox: -15, oy: -15, life: 3, rehit: 8, flipWithOwner: false });
        const g = KB.game;
        if (g) for (const e of g.entities) {
          if (e.dead || e.type !== 'enemy' || e.tough) continue;
          const dx = p.cx - e.cx, dy = p.cy - e.cy, dd = Math.hypot(dx, dy);
          if (dd > 4 && dd < 54) { e.x += dx / dd * 0.8; e.y += dy / dd * 0.4; }
        }
        if (t % 2 === 0) parts(p.cx + rnd(-12, 12), p.cy + rnd(-12, 12), ['#c0a8ff', '#9060e0'], 1, { spread: 0.4, grav: 0, life: 14, up: 0, size: 1 });
        if (p.onGround && t > 3) {
          d.landed = true; killBox(p);
          mbox(p, p.cx, p.bottom - 15, 64, 32, { dmg: 8, type: 'cutter', life: 14, rehit: 0, knock: 2.4 });
          for (let i = 0; i < 3; i++) vx('ring', p.cx, p.bottom - 8, { r0: 4 + i * 10, r1: 44, frames: 16 + i * 3, color: '#c0a8ff', width: 2 });
          vx('burst', p.cx, p.bottom - 6, { n: 24, colors: ['#ffffff', '#c0a8ff', '#9060e0', '#2a1040'], speed: 3.6, life: 26, grav: 0.04 });
          vx('textPop', p.cx, p.y - 12, 'CRUSH!', { color: '#c0a8ff', size: 8, frames: 30, rise: 0.5 });
          shake(8); hitstop(4); sfx('blackhole');
          p.attackTimer = Math.min(p.attackTimer, 14);
        }
      },
    },
  }, [['X', '軌道刃環繞'], ['↑+X', '反重力昇刃'], ['↓+X', '引力回收刃'], ['空中 X', '墜壓刃'], ['按住 50 幀放開', '蓄力・刃之奇點']]);

  // ---------- 12. hammermech 鎚機甲 ----------
  addMoves('hammermech', {
    dn: {
      dur: 36, fps: 12, lock: true,
      start(p, d) { d.done = false; if (!p.onGround) p.vy = Math.max(p.vy, 4.8); sfx('jet'); },
      tick(p, d, t) {
        if (!p.onGround) slowFall(p, 5.6);
        if (t === 10 && !d.done) {
          d.done = true;
          const gy = groundY(p);
          mbox(p, p.cx, gy - 15, 80, 28, { dmg: 8, type: 'mech', life: 18, rehit: 0, knock: 2.6, breakBlocks: true, onHit: e => { e.vy = -3.2; } });
          for (const s of [-1, 1]) {
            vx('shockwave', p.cx, gy, { w: 42, h: 18, dir: s, speed: 5, frames: 18, color: '#ff9850' });
            shoot({ spr: 'proj_mix2_rocket_steel', x: p.cx + s * 20, y: gy - 10, vx: s * 3.6, vy: -1.2, grav: 0.2, dmg: 5, w: 16, h: 10, life: 46, type: 'mech', dir: s, trail: '#ffd8a0' });
          }
          vx('ring', p.cx, gy - 6, { r0: 4, r1: 46, frames: 16, color: '#ffd8a0', width: 3 });
          vx('burst', p.cx, gy - 6, { n: 24, colors: ['#ffd8a0', '#ff9850', '#d8dce8'], speed: 3.4, life: 26, grav: 0.08, size: 2 });
          shake(9); hitstop(4); sfx('mech_step');
        }
      },
    },
    air: {
      dur: 30, fps: 14, lock: false,
      start(p, d) {
        d.n = 0;
        vx('aura', p, { color: '#ff9850', r: 18, frames: 28 });
        sfx('jet');
      },
      tick(p, d, t) {
        slowFall(p, 1.2);
        d.box = fbox(p, { w: 44, h: 40, dmg: 5, type: 'mech', ox: -22, oy: -20, life: 3, rehit: 9, flipWithOwner: false });
        if (t % 2 === 0) {
          const a = t * 0.42;
          parts(p.cx + Math.cos(a) * 22, p.cy + Math.sin(a) * 18, ['#ffd8a0', '#ff9850', '#d8dce8'], 2, { spread: 0.3, grav: 0, life: 14, up: 0, size: 1 });
        }
        if (t === 10 || t === 22) {
          const s = t === 10 ? 1 : -1;
          shoot({ spr: 'proj_mix2_rocket_steel', x: p.cx + s * p.dir * 10, y: p.cy + 6, vx: s * p.dir * 4.4, vy: 1.6, dmg: 5, w: 16, h: 10, life: 48, type: 'mech', dir: s * p.dir, trail: '#ffd8a0' });
          vx('line', p.cx, p.cy + 6, p.cx + s * p.dir * 36, p.cy + 18, { color: '#ffd8a0', width: 1, frames: 5 });
          sfx('missile'); shake(2);
        }
      },
    },
  }, [['X', '火箭鎚'], ['↑+X', '飛彈鎚'], ['↓+X', '地錨衝擊'], ['空中 X', '噴射迴旋鎚'], ['按住 50 幀放開', '蓄力・軌道砲鎚']]);

})();
