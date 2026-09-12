// 武器系能力：gunner ninja blade bow（Round 5 變身大爆發）
// 介面與 abilities.js 相同：KB.ABILITIES[key] = { ... onAttack / update / onEnd / onCrouchAttack }
// 特效一律透過 vfx()（內部 KB.VFX && KB.VFX.xxx 防呆），KB.VFX 尚未載入時自動退回粒子 / 震動。
(function () {
  'use strict';
  const P = KB.PHYS;

  // ---------- 蓄力必殺的門檻（fix5b / R5-P1-03）----------
  // 這些數字就是招式表 / 圖鑑上寫給玩家看的「按住 N 幀放開」，
  // **從按下攻擊鍵的那一幀算起**。各招內部的計數器起點不同（有的要等收招動作演完才開始加），
  // 所以下面使用時會扣掉各自的偏移量；改數字時只改這裡，招式表文案也用同一個值。
  // 驗證：tools/test_weapons.py 的「蓄力門檻」段（按住 N+2 幀觸發、N-6 幀不觸發）。
  const GUNNER_ULT = 60;   // 槍手・子彈時間（招式表：按住 60 幀放開）
  const BLADE_IAI = 50;   // 居合・居合一閃（招式表：按住 50 幀放開）
  const BOW_PIERCE = 40;   // 弓・貫穿箭（招式表：蓄力 40）
  const BOW_METEOR = 80;   // 弓・流星箭（招式表：蓄力 80）
  // fix6：Lv3 蓄力時間 ×0.8（KB.PROG.holdMul）。招式表上的數字一律是 **Lv1** 的門檻，
  //   能力練到 Lv3 之後同一招會提早 20% 蓄滿（KB.PROG 未載入時回傳原值，行為完全不變）。
  const HOLD = (key, n) => (KB.PROG && KB.PROG.holdMul) ? Math.max(4, Math.round(n * KB.PROG.holdMul(key))) : n;


  // ---------- 註冊表 ----------
  const NEW_KEYS = [
    ['gunner', '槍手', 'GUNNER'],
    ['ninja', '忍者', 'NINJA'],
    ['blade', '居合', 'BLADE'],
    ['bow', '弓', 'BOW'],
  ];
  for (const [k, cn, hud] of NEW_KEYS) {
    if (KB.ABILITY_KEYS.indexOf(k) < 0) KB.ABILITY_KEYS.push(k);
    KB.ABILITY_NAMES[k] = cn; KB.ABILITY_HUD[k] = hud;
  }
  KB.ABILITIES = KB.ABILITIES || {};
  const def = (key, o) => {
    o.key = key; o.name = o.name || KB.ABILITY_NAMES[key]; o.hudName = o.hudName || KB.ABILITY_HUD[key];
    o.hat = o.hat || ('hat_' + key); o.icon = o.icon || ('ui_ability_' + key);
    KB.ABILITIES[key] = o; return o;
  };

  // ---------- 共用工具（與 abilities.js 同一套慣例）----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const data = p => p.abilityData || (p.abilityData = {});
  const down = k => KB.input.down(k);
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
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
  function holding(p, held) { const d = p.abilityDef; return (held && d.maxHold > 0 && p.stateT < d.maxHold) || p.attackTimer > 2; }
  function pickMode(p, air, upMode, ground) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    if (!p.onGround && air) return air;
    if (down('up') && upMode) return upMode;
    return ground;
  }
  function setup(p, o) {
    const D = p.abilityDef;
    D.anim = o.anim || null; D.maxHold = o.maxHold || 0;
    p.attackTimer = o.dur; p.attackFps = o.fps || 10;
    p.attackLock = o.lock !== false;
  }
  const clearAnim = p => { const D = p.abilityDef; if (D) { D.anim = null; D.maxHold = 0; } };
  const setAnim = (p, a, fps) => { const D = p.abilityDef; if (D) { D.anim = a; if (fps) p.attackFps = fps; } };

  // ---------- KB.VFX 包裝（vfx agent 尚未載入時退回基本表現）----------
  function vfx(fn) {
    const a = Array.prototype.slice.call(arguments, 1);
    try { if (KB.VFX && typeof KB.VFX[fn] === 'function') { KB.VFX[fn].apply(KB.VFX, a); return true; } } catch (e) { }
    return false;
  }
  function shake(n) { if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, n); vfx('shake', n); }
  function hitstop(n) {
    if (vfx('hitstop', n)) return;
    if (KB.game) KB.game.freezeT = Math.max(KB.game.freezeT || 0, Math.min(4, n));   // 退回：極短全域凍結
  }
  function flash(color, frames, alpha) {
    if (vfx('flash', color, frames, alpha)) return;
    if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 2);
  }
  function burst(x, y, o) {
    if (!vfx('burst', x, y, o)) {
      o = o || {};
      KB.particles(x, y, o.colors || ['#ffffff'], o.n || 8, { spread: o.speed || 2, grav: o.grav !== undefined ? o.grav : 0.06, life: o.life || 16, up: 0, size: o.size || 1 });
    } else {
      KB.particles(x, y, (o && o.colors) || ['#ffffff'], 3, { spread: 1.2, grav: 0.04, life: 12, up: 0, size: 1 });
    }
  }
  const line = (x1, y1, x2, y2, o) => vfx('line', x1, y1, x2, y2, o);
  const slash = (x, y, r, ang, o) => vfx('slash', x, y, r, ang, o);
  const ring = (x, y, o) => vfx('ring', x, y, o);
  const afterimage = (e, o) => vfx('afterimage', e, o);
  const aura = (e, o) => vfx('aura', e, o);
  const textPop = (x, y, t, o) => vfx('textPop', x, y, t, o);
  const letterbox = n => vfx('letterbox', n);
  const worldTint = (c, n, a) => vfx('worldTint', c, n, a);
  const zoom = (s, n) => vfx('zoom', s, n);
  const shockwave = (x, y, o) => vfx('shockwave', x, y, o);
  const sparkTrail = (e, o) => vfx('sparkTrail', e, o);
  const beam = (x, y, dir, len, o) => vfx('beam', x, y, dir, len, o);
  const circlefx = (x, y, o) => vfx('circle', x, y, o);
  const lightning = function () { return vfx.apply(null, ['lightning'].concat(Array.prototype.slice.call(arguments))); };

  const solidAt = (x, y) => { const m = KB.game && KB.game.map; return m ? m.isSolidPx(x, y) : false; };

  // ======================================================================
  // 1. GUNNER 槍手
  //    X（按住）   雙槍連射：每 6 幀一發，彈道 line + 槍口 burst + 微震
  //    ↓+X        蓄力霰彈：8 幀架槍後扇形 7 發，後座力把卡比推退
  //    空中 X      俯衝掃射：朝斜下連射，反作用力讓卡比滯空 / 微升
  //    ↑+X        對空三連：朝上三連發
  //    按住 60 放開 必殺・子彈時間：letterbox + 世界灰化 + slowMo 60 幀 + 全方位 16 發
  // ======================================================================
  function gunShot(p, ang, spd, dmg, off) {
    off = off || 12;
    const mx = p.cx + Math.cos(ang) * off, my = p.cy - 2 + Math.sin(ang) * off * 0.8;
    KB.shoot({
      spr: 'proj_bullet', x: mx, y: my, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      dmg: dmg, owner: 'player', life: 46, w: 6, h: 5, grav: 0, solid: true, pierce: false,
      type: 'gun', dir: Math.cos(ang) < 0 ? -1 : 1, fxHit: 'fx_hit', knock: 1.2, trail: '#fff8c0',
    });
    line(mx, my, mx + Math.cos(ang) * 96, my + Math.sin(ang) * 96, { color: '#fff8c0', width: 1, frames: 4 });
    burst(mx, my, { n: 6, colors: ['#fff8c0', '#ff9028', '#ffffff'], speed: 2.2, life: 9, size: 1, grav: 0 });
    KB.fx('fx_muzzle', mx, my, { flip: Math.cos(ang) < 0 });
    sfx('gun'); shake(1);
  }

  def('gunner', {
    color: '#d8dce8', duration: 10, hold: true, maxHold: 600, lockMove: false, moveSpeed: P.walk, fps: 14, canJump: true,
    desc: '雙手各握一把星塵左輪，一邊走一邊把彈幕鋪滿整個房間。',
    flavour: '彈匣裡裝的是勇氣，退膛的是恐懼。',
    moves: [['X 按住', '雙槍連射'], ['↓+X', '蓄力霰彈'], ['空中 X', '俯衝掃射'], ['↑+X', '對空三連'], ['按住 60 幀放開', '必殺・子彈時間']],
    onGet(p) { const d = data(p); d.t = 0; d.charged = false; },
    onCrouchAttack(p) { startMove(p, 'shotgun'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.charged = false; d.fired = 0;
      d.mode = pickMode(p, 'air', 'up', 'rapid');
      if (d.mode === 'rapid') setup(p, { anim: 'kirby_attack_gunner', dur: 10, fps: 14, lock: false, maxHold: 600 });
      else if (d.mode === 'up') setup(p, { anim: 'kirby_attack_gunner_up', dur: 26, fps: 14, lock: true, maxHold: 0 });
      else if (d.mode === 'air') setup(p, { anim: 'kirby_attack_gunner_air', dur: 36, fps: 14, lock: false, maxHold: 36 });
      else if (d.mode === 'shotgun') setup(p, { anim: 'kirby_attack_gunner_shot', dur: 34, fps: 12, lock: true, maxHold: 0 });
      else if (d.mode === 'time') setup(p, { anim: 'kirby_attack_gunner_time', dur: 72, fps: 12, lock: true, maxHold: 0 });
    },
    update(p, dt, held) {
      const d = data(p); d.t++; light(52);
      const A = p.dir > 0 ? 0 : Math.PI;
      if (d.mode === 'rapid') {
        if (d.t <= 60 && d.t % 6 === 1) { gunShot(p, A, 6.4, 2); d.fired++; }
        if (d.t === HOLD('gunner', GUNNER_ULT) + 1) { d.charged = true; sfx('reload'); textPop(p.cx, p.y - 14, 'LOAD!', { color: '#fff8c0', size: 8, frames: 30, rise: 0.5 }); }
        if (d.charged) {
          if (d.t % 8 === 0) aura(p, { color: '#fff8c0', r: 18, frames: 12 });
          if (d.t % 3 === 0) KB.particles(p.cx + rnd(-11, 11), p.cy + rnd(-10, 10), ['#fff8c0', '#ffffff'], 1, { spread: 0.3, grav: -0.05, life: 12, up: 0.4, size: 1 });
        }
        if (!held) { if (d.charged) { startMove(p, 'time'); return; } }
        return;
      }
      if (d.mode === 'up') {
        if (d.t === 3 || d.t === 9 || d.t === 15) gunShot(p, -Math.PI / 2 + (d.t - 9) * 0.055 * p.dir, 6.6, 2, 14);
        slowFall(p, 1.2);
        return;
      }
      if (d.mode === 'air') {
        slowFall(p, 0.9);
        if (holding(p, held) && d.t % 5 === 1) {
          gunShot(p, Math.PI / 2 + rnd(-0.45, 0.45), 6.2, 2, 12);
          if (p.vy > -1.6) p.vy -= 0.62;                 // 後座力：小幅上升
        }
        return;
      }
      if (d.mode === 'shotgun') {
        if (d.t === 1) aura(p, { color: '#ff9028', r: 14, frames: 10 });
        if (d.t < 9) { if (d.t % 3 === 1) KB.particles(p.cx + p.dir * 16, p.cy, ['#ff9028', '#fff8c0'], 1, { spread: 0.4, grav: 0, life: 10, up: 0.2, size: 1 }); }
        if (d.t === 9) {
          for (let i = -3; i <= 3; i++) gunShot(p, A + i * 0.15 * (p.dir > 0 ? 1 : -1), 5.8 - Math.abs(i) * 0.25, 3, 16);
          p.vx = -p.dir * 3.4; if (p.onGround) p.vy = -1.6;
          flash('#ffffff', 6, 0.55); shake(6); hitstop(3); zoom(1.06, 12);
          ring(p.cx + p.dir * 18, p.cy - 2, { r0: 4, r1: 26, frames: 12, color: '#fff8c0', width: 2 });
          sfx('shotgun');
        }
        if (d.t > 9 && d.t < 22) p.vx += p.dir * 0.18;
        return;
      }
      if (d.mode === 'time') {
        if (d.t === 1) {
          letterbox(72); worldTint('#8890a8', 0.55, 66); zoom(1.12, 30); shake(7); hitstop(6);
          if (KB.game) KB.game.slowMoT = Math.max(KB.game.slowMoT || 0, 60);
          textPop(p.cx, p.y - 18, 'BULLET TIME', { color: '#fff8c0', size: 8, frames: 60, rise: 0.35 });
          sfx('reload');
        }
        if (d.t === 4) { aura(p, { color: '#ffffff', r: 26, frames: 22 }); afterimage(p, { frames: 24, color: '#8890a8', every: 2, alpha: 0.5 }); }
        if (d.t === 12) {
          circlefx(p.cx, p.cy, { r: 30, frames: 20, color: '#fff8c0', spin: 0.2 });
          ring(p.cx, p.cy, { r0: 6, r1: 46, frames: 16, color: '#ffffff', width: 2 });
          for (let i = 0; i < 16; i++) gunShot(p, i * Math.PI / 8, 5.6, 3, 10);
          flash('#ffffff', 8, 0.7); shake(8); sfx('shotgun');
        }
        if (d.t > 12 && d.t % 6 === 0) burst(p.cx + rnd(-20, 20), p.cy + rnd(-16, 16), { n: 4, colors: ['#fff8c0', '#ffffff'], speed: 1.6, life: 12, grav: 0 });
        p.vx *= 0.8;
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) { killBox(p); clearAnim(p); },
  });

  // ======================================================================
  // 2. NINJA 忍者
  //    X          手裡剎三連：三枚旋轉手裡劍 + 火花拖尾
  //    ↓+X        替身瞬移：原地留木頭 + 煙霧，瞬間移動到前方 64px
  //    空中 X      飛踢：斜下全身判定 + 紫色殘影
  //    貼牆 + 跳    壁跳：貼牆滑行減速，按跳往反方向彈起
  //    按住放開     必殺・影分身斬：三道分身同時前衝三段斬
  // ======================================================================
  function ninjaWallKick(p, wallDir) {
    p.dir = -(wallDir || p.dir); p.vy = -4.3; p.vx = p.dir * 3.1;
    p.jumped = true; p.jumpHold = 8;
    const d = data(p); d.wallT = 0;
    if (p.state === 'attack') p.attackTimer = 0;
    else if (p.state !== 'jump') p.setState('jump');       // 蓋掉同一幀觸發的漂浮
    sfx('wallkick'); shake(2);
    burst(p.cx - p.dir * 7, p.cy + 4, { n: 10, colors: ['#ffffff', '#b070f0', '#5460a0'], speed: 2.4, life: 14, grav: 0.05 });
    ring(p.cx - p.dir * 7, p.cy + 4, { r0: 2, r1: 14, frames: 10, color: '#b070f0', width: 1 });
    afterimage(p, { frames: 14, color: '#b070f0', every: 2, alpha: 0.5 });
  }
  // 身體側面探測（fix5b / R5-P2-12）：只靠 physics 的 hitWall 判「貼牆」，主線幾乎沒有牆可用 ——
  // qa5 掃過全部 25 個房間，符合「連續 ≥5 格實心 + 側面淨空」的直牆只有 w3 r1 一處。
  // 改成主動探測：**任何實心磁磚的側面（硬磚 / 冰磚 / 斜坡的實心半邊）與單向平台 '=' 的側面都算牆**，
  // 一格高的平台邊、台階邊、房間左右邊界都踢得到，不必動關卡。
  // 只認「玩家正在推的方向」或「面向」那一側，背後的牆不會誤觸發。
  function ninjaWallSide(p) {
    const map = KB.game && KB.game.map; if (!map) return 0;
    const at = (dir) => {
      const px = dir > 0 ? p.x + p.w + 1 : p.x - 1;
      for (const py of [p.y + 2, p.cy, p.bottom - 3]) {
        if (map.at(px, py) === '=' || map.isSolidPx(px, py)) return dir;
      }
      return 0;
    };
    const inp = KB.input;
    const want = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
    return (want && at(want)) || at(p.dir) || 0;
  }
  // 貼牆偵測：physics 的 hitWall 只有「真的被牆擋住那一幀」才是 true（推牆會每 2~3 幀出現一次），
  // 所以用 wallT 做 8 幀的記憶窗，窗內按跳就能壁跳。
  function ninjaTick(p) {
    const d = data(p);
    if (p.onGround || p.state === 'stone' || p.state === 'dead' || p.state === 'door' || p.state === 'ride') { d.wallT = 0; d.wallDir = 0; d.airT = 0; return; }
    d.airT = (d.airT || 0) + 1;
    if (p.hitWall) { d.wallT = 8; d.wallDir = p.dir; }
    else {
      // 起跳後前 2 幀不做主動探測：貼著牆站著起跳時，同一幀的「跳」會被吃成壁跳（跳不起來）
      const ws = d.airT >= 3 ? ninjaWallSide(p) : 0;
      if (ws) { d.wallT = 8; d.wallDir = ws; }
      else if (d.wallT > 0) d.wallT--;
    }
    if (d.wallT <= 0) return;
    if (p.vy > 1.1) p.vy = 1.1;                                  // 貼牆滑行
    if (KB.game && KB.game.frame % 4 === 0) KB.particles(p.cx + (d.wallDir || p.dir) * 7, p.cy + rnd(-4, 6), ['#ffffff', '#b070f0'], 1, { spread: 0.4, grav: 0.05, life: 10, up: 0.3, size: 1 });
    if (KB.input.pressed('jump')) ninjaWallKick(p, d.wallDir);
  }
  // 攻擊以外的時間也要能壁跳 → 掛一個看不見的跟隨實體（換房後由下一次攻擊補上）
  class NinjaTicker extends KB.Entity {
    constructor(p) { super(p.x, p.y); this.type = 'fx'; this.name = 'ninjaticker'; this.solid = false; this.grav = 0; this.w = 1; this.h = 1; this.z = -1; this.pl = p; }
    update(dt) {
      this.baseUpdate(dt);
      const p = this.pl;
      if (!p || p.dead || p.ability !== 'ninja' || KB.player !== p) { this.dead = true; return; }
      this.x = p.x; this.y = p.y;
      if (p.state !== 'attack') ninjaTick(p);
    }
    draw() { }
  }
  // onGet 有可能在 KB.game 指派前被呼叫（關卡載入時直接給能力），換房也會把實體清空 →
  // 用一個低頻 watchdog 自動補回跟隨實體（沒有 ninja 時立刻 return，成本極低）。
  let ninjaWatch = null;
  function ensureTicker(p) {
    const d = data(p);
    if (!(d.ticker && !d.ticker.dead && KB.game && KB.game.entities.indexOf(d.ticker) >= 0)) {
      if (KB.game) d.ticker = KB.spawn(new NinjaTicker(p));
    }
    if (ninjaWatch === null) {
      ninjaWatch = setInterval(function () {
        const pl = KB.player;
        if (!pl || pl.dead || pl.ability !== 'ninja' || !KB.game) return;
        const dd = pl.abilityData || (pl.abilityData = {});
        if (!dd.ticker || dd.ticker.dead || KB.game.entities.indexOf(dd.ticker) < 0) dd.ticker = KB.spawn(new NinjaTicker(pl));
      }, 250);
    }
  }
  function throwShuriken(p, vy) {
    const sp = KB.shoot({
      spr: 'proj_shuriken', x: p.cx + p.dir * 10, y: p.cy - 2, vx: p.dir * 5.2, vy: vy || 0,
      dmg: 2, owner: 'player', life: 70, w: 9, h: 9, grav: 0, solid: true, pierce: false,
      type: 'shuriken', dir: p.dir, fxHit: 'fx_hit', knock: 1.2, rotSpeed: 0.5 * p.dir, trail: '#b070f0',
    });
    sparkTrail(sp, { color: '#eef2ff', every: 2, life: 10 });
    burst(p.cx + p.dir * 10, p.cy - 2, { n: 4, colors: ['#eef2ff', '#b070f0'], speed: 1.4, life: 8, grav: 0 });
    sfx('shuriken');
    return sp;
  }

  def('ninja', {
    color: '#5460a0', duration: 26, hold: true, maxHold: 600, lockMove: false, moveSpeed: P.walk, fps: 14, canJump: true,
    desc: '身法快得只看得見殘影，手裡劍與替身術一氣呵成。',
    flavour: '影子先到，本體後到。',
    moves: [['X', '手裡剎三連'], ['↓+X', '替身瞬移'], ['空中 X', '飛踢'], ['貼牆＋跳', '壁跳（任何牆面）'], ['蓄力放開', '必殺・影分身斬']],
    onGet(p) { const d = data(p); d.t = 0; d.wallT = 0; ensureTicker(p); },
    onCrouchAttack(p) { startMove(p, 'warp'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.charged = false; ensureTicker(p);
      d.mode = pickMode(p, 'kick', null, 'shuriken');
      if (d.mode === 'shuriken') setup(p, { anim: 'kirby_attack_ninja', dur: 26, fps: 14, lock: false, maxHold: 600 });
      else if (d.mode === 'kick') {
        setup(p, { anim: 'kirby_attack_ninja_kick', dur: 34, fps: 12, lock: true, maxHold: 0 });
        p.vx = p.dir * 3.6; p.vy = 2.2;
        d.box = KB.hitbox({ x: 0, y: 0, w: 24, h: 22, dmg: 3, owner: 'player', type: 'ninja', follow: p, ox: -4, oy: -4, life: 3, rehit: 8, knock: 2, flipWithOwner: false });
        sfx('sword');
      } else if (d.mode === 'warp') setup(p, { anim: 'kirby_attack_ninja_warp', dur: 26, fps: 12, lock: true, maxHold: 0 });
      else if (d.mode === 'clone') {
        setup(p, { anim: 'kirby_attack_ninja_clone', dur: 48, fps: 14, lock: true, maxHold: 0 });
        d.box = KB.hitbox({ x: 0, y: 0, w: 34, h: 28, dmg: 4, owner: 'player', type: 'ninja', follow: p, ox: -6, oy: -8, life: 3, rehit: 6, knock: 2.4, flipWithOwner: false, pierce: true });
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++; light(48);
      ninjaTick(p);
      if (d.mode === 'shuriken') {
        if (d.t === 3) throwShuriken(p, -0.6);
        if (d.t === 9) throwShuriken(p, 0);
        if (d.t === 15) throwShuriken(p, 0.6);
        if (d.t === 50) { d.charged = true; sfx('teleport'); textPop(p.cx, p.y - 14, '影', { color: '#b070f0', size: 10, frames: 30, rise: 0.4 }); }
        if (d.charged) {
          if (d.t % 8 === 0) aura(p, { color: '#b070f0', r: 18, frames: 12 });
          if (d.t % 3 === 0) KB.particles(p.cx + rnd(-11, 11), p.cy + rnd(-10, 10), ['#b070f0', '#eef2ff'], 1, { spread: 0.3, grav: -0.05, life: 12, up: 0.4, size: 1 });
        }
        if (!held && d.charged) { startMove(p, 'clone'); return; }
        return;
      }
      if (d.mode === 'kick') {
        p.vx = p.dir * 3.6; if (p.vy < 3.4) p.vy += 0.28;
        beat(d.box);
        if (d.t === 1) afterimage(p, { frames: 34, color: '#b070f0', every: 2, alpha: 0.45 });
        if (d.t % 3 === 1) KB.particles(p.cx - p.dir * 6, p.cy - 2, ['#b070f0', '#eef2ff'], 1, { spread: 0.5, grav: 0, life: 10, up: 0, size: 1 });
        if (p.onGround && d.t > 3) {
          burst(p.cx, p.bottom, { n: 10, colors: ['#ffffff', '#b070f0'], speed: 2.2, life: 14, grav: 0.08 });
          shake(3); p.attackTimer = Math.min(p.attackTimer, 4);
        }
        if (p.hitWall && d.t > 3) p.attackTimer = Math.min(p.attackTimer, 4);
        return;
      }
      if (d.mode === 'warp') {
        p.vx = 0;
        if (d.t === 2) {
          KB.fx('fx_ninjalog', p.cx, p.cy + 2, { life: 34 });
          burst(p.cx, p.cy, { n: 14, colors: ['#ffffff', '#c8c8d0', '#5460a0'], speed: 2.6, life: 18, grav: -0.02 });
          ring(p.cx, p.cy, { r0: 3, r1: 22, frames: 12, color: '#ffffff', width: 2 });
          sfx('teleport');
        }
        if (d.t === 9) {
          const x0 = p.x;
          let nx = p.x;
          for (let i = 0; i < 8; i++) {
            const tx = nx + p.dir * 8, probe = p.dir > 0 ? tx + p.w : tx;
            if (solidAt(probe, p.cy) || solidAt(probe, p.y + 2) || solidAt(probe, p.bottom - 2)) break;
            nx = tx;
          }
          p.x = nx;
          line(x0 + p.w / 2, p.cy, p.cx, p.cy, { color: '#b070f0', width: 3, frames: 8 });
          afterimage(p, { frames: 16, color: '#b070f0', every: 1, alpha: 0.5 });
          burst(p.cx, p.cy, { n: 12, colors: ['#b070f0', '#ffffff'], speed: 2.2, life: 16, grav: -0.02 });
          ring(p.cx, p.cy, { r0: 2, r1: 18, frames: 10, color: '#b070f0', width: 1 });
          zoom(1.05, 10); shake(2);
          d.box = KB.hitbox({ x: p.cx - 14, y: p.cy - 12, w: 28, h: 24, dmg: 2, owner: 'player', type: 'ninja', life: 6, rehit: 0, pierce: true, knock: 2 });
        }
        return;
      }
      if (d.mode === 'clone') {
        if (d.t === 1) {
          letterbox(48); zoom(1.08, 24); shake(5); hitstop(4);
          textPop(p.cx, p.y - 18, '影分身斬', { color: '#b070f0', size: 8, frames: 46, rise: 0.35 });
          sfx('slash_big');
        }
        if (d.t >= 3 && d.t <= 32) {
          p.vx = p.dir * 4.2;
          beat(d.box);
          if (d.t === 3) afterimage(p, { frames: 32, color: '#b070f0', every: 1, alpha: 0.55 });
          if (d.t % 2 === 0) {
            for (const oy of [-12, 0, 12]) KB.particles(p.cx - p.dir * rnd(4, 16), p.cy + oy, ['#b070f0', '#eef2ff'], 1, { spread: 0.4, grav: 0, life: 10, up: 0, size: 1 });
          }
        }
        if (d.t === 8 || d.t === 16 || d.t === 24) {
          const oy = (d.t === 8 ? -12 : d.t === 16 ? 0 : 12);
          slash(p.cx + p.dir * 14, p.cy + oy, 20, d.t === 16 ? 0 : (d.t === 8 ? -0.7 : 0.7), { color: '#eef2ff', width: 3, frames: 10, arc: 2.1, flip: p.dir < 0 });
          burst(p.cx + p.dir * 18, p.cy + oy, { n: 8, colors: ['#eef2ff', '#b070f0'], speed: 2.4, life: 12, grav: 0 });
          hitstop(2); shake(3); sfx('sword');
        }
        if (d.t > 32) p.vx *= 0.8;
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charged = false; },
    onLose(p) { killBox(p); clearAnim(p); const d = data(p); if (d.ticker) { d.ticker.dead = true; d.ticker = null; } },
  });

  // ======================================================================
  // 3. BLADE 居合
  //    X          三段連斬：橫斬 → 逆袈裟 → 上段斬，每段角度不同並帶 hitstop
  //    按住 50 放開 居合一閃：全畫面白閃 + 水平斬線，前方 160px 判定，被斬的敵人 10 幀後才倒下
  //    空中 X      落下斬：垂直俯衝，落地向左右各放一道衝擊波
  //    ↑+X        上撩斬：把敵人挑到空中
  // ======================================================================
  def('blade', {
    color: '#eef2ff', duration: 20, hold: true, maxHold: 600, lockMove: false, moveSpeed: P.walk, fps: 12, canJump: true,
    desc: '一柄比身體還長的大太刀，出鞘的瞬間連空氣都被切開。',
    flavour: '刀在鞘中時最快。',
    moves: [['X', '三段連斬'], ['按住 X', '居合蓄力'], ['按住 50 幀放開', '必殺・居合一閃'], ['空中 X', '落下斬'], ['↑+X', '上撩斬']],
    onGet(p) { const d = data(p); d.combo = 0; d.cut = []; },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.charging = false; d.charged = false; d.chargeT = 0;
      d.cut = d.cut || [];
      d.mode = pickMode(p, 'fall', 'upcut', 'combo');
      const f = KB.game ? KB.game.frame : 0;
      if (d.mode === 'combo') {
        if (f - (d.lastCombo || -999) > 46) d.combo = 0;
        d.combo = (d.combo % 3) + 1; d.lastCombo = f;
        if (d.combo === 1) {
          setup(p, { anim: 'kirby_attack_blade', dur: 20, fps: 12, lock: false, maxHold: 600 });
          d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 20, dmg: 3, owner: 'player', type: 'blade', follow: p, ox: 2, oy: -14, life: 14, rehit: 0, knock: 1.6 });
        } else if (d.combo === 2) {
          setup(p, { anim: 'kirby_attack_blade2', dur: 20, fps: 12, lock: false, maxHold: 0 });
          d.box = KB.hitbox({ x: 0, y: 0, w: 26, h: 26, dmg: 3, owner: 'player', type: 'blade', follow: p, ox: 2, oy: -20, life: 14, rehit: 0, knock: 1.8 });
        } else {
          setup(p, { anim: 'kirby_attack_blade3', dur: 28, fps: 10, lock: false, maxHold: 0 });
          d.box = KB.hitbox({ x: 0, y: 0, w: 30, h: 32, dmg: 5, owner: 'player', type: 'blade', follow: p, ox: 0, oy: -24, life: 18, rehit: 0, knock: 2.6 });
        }
        sfx('sword');
      } else if (d.mode === 'upcut') {
        setup(p, { anim: 'kirby_attack_blade_up', dur: 24, fps: 12, lock: true, maxHold: 0 });
        d.box = KB.hitbox({
          x: 0, y: 0, w: 24, h: 34, dmg: 3, owner: 'player', type: 'blade', follow: p, ox: -4, oy: -34, life: 18, rehit: 0, knock: 1.2, flipWithOwner: false,
          onHit(b) { if (b && b.solid !== false && b.type !== 'boss') { b.vy = -4; } burst(b.cx, b.cy, { n: 8, colors: ['#eef2ff', '#ffffff'], speed: 2, life: 12, grav: 0.05 }); },
        });
        if (p.onGround) { p.vy = -2.6; p.onGround = false; }
        sfx('sword');
      } else if (d.mode === 'fall') {
        setup(p, { anim: 'kirby_attack_blade_fall', dur: 60, fps: 12, lock: true, maxHold: 0 });
        p.vy = 6; p.vx = 0;
        d.box = KB.hitbox({ x: 0, y: 0, w: 18, h: 26, dmg: 4, owner: 'player', type: 'blade', follow: p, ox: -9, oy: 0, life: 3, rehit: 8, knock: 2, flipWithOwner: false });
        sfx('sword');
      } else if (d.mode === 'iai') {
        setup(p, { anim: 'kirby_attack_blade_iai', dur: 44, fps: 10, lock: true, maxHold: 0 });
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++; light(50);
      // 延遲斬殺名單（居合一閃）
      if (d.cut && d.cut.length) {
        for (let i = d.cut.length - 1; i >= 0; i--) {
          const c = d.cut[i];
          c.t--;
          if (c.e && !c.e.dead && c.t <= 0) {
            slash(c.e.cx, c.e.cy, 16, 0.2, { color: '#ffffff', width: 2, frames: 10, arc: 2.4 });
            burst(c.e.cx, c.e.cy, { n: 12, colors: ['#ffffff', '#eef2ff'], speed: 2.6, life: 16, grav: 0.05 });
            try { c.e.hurt(8, { cx: p.cx, cy: p.cy, knock: 2 }); } catch (e) { }
          }
          if (c.t <= 0) d.cut.splice(i, 1);
        }
      }
      if (d.mode === 'combo') {
        const t = d.t;
        if (d.box && !d.box.dead) {
          if (d.combo === 1) { if (t <= 3) { d.box.ox = 0; d.box.oy = -20; } else { d.box.ox = 4; d.box.oy = -12; } }
          else if (d.combo === 2) { if (t <= 3) { d.box.oy = -6; } else { d.box.oy = -24; } }
        }
        if (t === 3) {
          const ang = d.combo === 1 ? -0.5 : d.combo === 2 ? 0.9 : -1.5;
          slash(p.cx + p.dir * 14, p.cy - (d.combo === 3 ? 12 : 4), d.combo === 3 ? 24 : 19, ang, { color: '#eef2ff', width: 2, frames: 9, arc: 2.2, flip: p.dir < 0 });
          hitstop(2); shake(d.combo === 3 ? 4 : 2);
          if (d.combo === 3) { flash('#ffffff', 3, 0.3); burst(p.cx + p.dir * 16, p.cy - 10, { n: 10, colors: ['#eef2ff', '#ffffff'], speed: 2.4, life: 14, grav: 0.04 }); }
        }
        if (t >= 2 && t <= 10) KB.particles(p.cx + p.dir * rnd(8, 22), p.cy - rnd(0, 18), ['#ffffff', '#eef2ff'], 1, { spread: 0.2, grav: 0, life: 8, up: 0, size: 1 });
        // 連段：第 1、2 段可再按 X 接續
        if (d.combo < 3 && t >= 9 && KB.input.pressed('attack')) { restartAttack(p); return; }
        // 蓄力：第 1 段按住不放 → 進入居合架式
        if (d.combo === 1) {
          if (!d.charging && held && t > 12) { d.charging = true; d.chargeT = 0; if (d.box) { d.box.dead = true; d.box = null; } setAnim(p, 'kirby_attack_blade_charge', 8); sfx('sword'); }
          if (d.charging) {
            d.chargeT++;
            p.vx *= 0.82;
            if (d.chargeT % 8 === 1) aura(p, { color: d.charged ? '#ffffff' : '#9aa6c0', r: 16, frames: 12 });
            if (d.chargeT % 3 === 0) KB.particles(p.cx + rnd(-12, 12), p.cy + rnd(-10, 12), d.charged ? ['#ffffff', '#eef2ff'] : ['#9aa6c0', '#eef2ff'], 1, { spread: 0.3, grav: -0.06, life: 14, up: 0.5, size: 1 });
            // fix5b / R5-P1-03：居合架式是從 t=13（第 1 段斬揮完）才開始計 chargeT，
            // 所以原本的 chargeT === 50 實測要按住 63 幀。扣掉那 13 幀，實際 = 招式表的 50 幀。
            if (d.chargeT === HOLD('blade', BLADE_IAI) - 13) {
              d.charged = true; flash('#ffffff', 4, 0.3); sfx('sword');
              textPop(p.cx, p.y - 14, '居合', { color: '#ffffff', size: 8, frames: 30, rise: 0.4 });
            }
            if (!held) { if (d.charged) { startMove(p, 'iai'); return; } p.attackTimer = Math.min(p.attackTimer, 6); }
          }
        }
        return;
      }
      if (d.mode === 'upcut') { if (d.t === 3) { slash(p.cx + p.dir * 8, p.cy - 16, 22, -1.4, { color: '#eef2ff', width: 2, frames: 10, arc: 1.8, flip: p.dir < 0 }); hitstop(2); } return; }
      if (d.mode === 'fall') {
        if (!p.onGround) {
          p.vy = Math.max(p.vy, 6); p.vx = 0; beat(d.box);
          if (d.t === 1) afterimage(p, { frames: 40, color: '#eef2ff', every: 2, alpha: 0.4 });
          KB.particles(p.cx + rnd(-5, 5), p.cy - 8, ['#ffffff', '#eef2ff'], 1, { spread: 0.3, grav: -0.1, life: 10, up: 0.6, size: 1 });
        } else if (!d.landed) {
          d.landed = true;
          killBox(p);
          shake(7); hitstop(3); flash('#ffffff', 4, 0.35);
          shockwave(p.cx, p.bottom, { w: 40, h: 16, dir: 1, speed: 4, frames: 20, color: '#eef2ff' });
          shockwave(p.cx, p.bottom, { w: 40, h: 16, dir: -1, speed: 4, frames: 20, color: '#eef2ff' });
          ring(p.cx, p.bottom, { r0: 4, r1: 40, frames: 14, color: '#ffffff', width: 2 });
          burst(p.cx, p.bottom, { n: 16, colors: ['#ffffff', '#eef2ff', '#9aa6c0'], speed: 3, life: 18, grav: 0.12 });
          for (const s of [1, -1]) KB.hitbox({ x: p.cx + (s > 0 ? 6 : -46), y: p.bottom - 16, w: 40, h: 18, dmg: 5, owner: 'player', type: 'blade', life: 10, rehit: 0, pierce: true, knock: 3 });
          sfx('slash_big');
          p.attackTimer = Math.min(p.attackTimer, 14);
        }
        return;
      }
      if (d.mode === 'iai') {
        if (d.t === 1) {
          letterbox(44); zoom(1.1, 22); shake(8); hitstop(6); flash('#ffffff', 10, 0.85);
          textPop(p.cx, p.y - 18, '居合一閃', { color: '#ffffff', size: 8, frames: 44, rise: 0.3 });
          sfx('iai');
          const cam = KB.game ? KB.game.cam : { x: 0, y: 0 };
          line(cam.x - 20, p.cy, cam.x + KB.W + 20, p.cy, { color: '#ffffff', width: 4, frames: 16 });
          line(cam.x - 20, p.cy - 3, cam.x + KB.W + 20, p.cy - 3, { color: '#eef2ff', width: 1, frames: 20 });
          beam(p.cx, p.cy, p.dir, 200, { width: 10, color: '#ffffff', frames: 14 });
          slash(p.cx + p.dir * 40, p.cy, 46, 0, { color: '#ffffff', width: 4, frames: 14, arc: 1.2, flip: p.dir < 0 });
          const me = p;
          d.box = KB.hitbox({
            x: p.cx + (p.dir > 0 ? 6 : -166), y: p.cy - 18, w: 160, h: 36, dmg: 0, owner: 'player', type: 'blade',
            life: 8, rehit: 0, pierce: true, knock: 0, breakBlocks: true,
            onHit(b) {
              const dd = data(me);
              dd.cut = dd.cut || [];
              if (!dd.cut.some(c => c.e === b)) dd.cut.push({ e: b, t: 10 });
              line(b.cx - 14, b.cy, b.cx + 14, b.cy, { color: '#ffffff', width: 1, frames: 12 });
            },
          });
        }
        if (d.t >= 2 && d.t <= 20 && d.t % 2 === 0) KB.particles(p.cx + p.dir * rnd(10, 140), p.cy + rnd(-6, 6), ['#ffffff', '#eef2ff'], 1, { spread: 0.3, grav: 0, life: 12, up: 0, size: 1 });
        p.vx *= 0.85;
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charging = false; d.charged = false; d.landed = false; },
    onLose(p) { killBox(p); clearAnim(p); const d = data(p); d.cut = []; d.combo = 0; },
  });

  // ======================================================================
  // 4. BOW 弓
  //    X          射箭：拋物線箭矢，射中牆壁會插在牆上
  //    按住 40 放開 貫穿箭：直線高速、可貫穿、白色拖尾
  //    按住 80 放開 必殺・流星箭：letterbox + 一支巨箭 beam 穿越全畫面
  //    空中 X      箭雨：朝下扇形 5 支
  //    ↓+X        陷阱箭：插在地上 180 幀，敵人踩到爆炸
  // ======================================================================
  class BowTrap extends KB.Entity {
    constructor(x, y, dir) {
      super(x, y);
      this.type = 'fx'; this.name = 'bowtrap'; this.spr = 'proj_arrowtrap';
      this.w = 10; this.h = 8; this.z = 1; this.grav = 0.3; this.maxFall = 5; this.solid = true;
      this.life = 180; this.dir = dir || 1; this.armed = 0;
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--;
      if (this.life <= 0) { this.pop(false); return; }
      if (!this.onGround) this.physics(); else this.vx = 0;
      if (this.fellOut) { this.dead = true; return; }
      this.armed++;
      if (this.armed % 20 === 0) KB.particles(this.cx, this.cy, ['#fff8c0', '#48c048'], 1, { spread: 0.3, grav: -0.04, life: 12, up: 0.3, size: 1 });
      if (this.armed < 6) return;
      const ents = KB.game ? KB.game.entities : [];
      for (const e of ents) {
        if (e.dead || e === this) continue;
        if (e.type !== 'enemy' && e.type !== 'boss') continue;
        if (!this.overlaps(e)) continue;
        this.pop(true); return;
      }
    }
    pop(hit) {
      if (this.dead) return; this.dead = true;
      if (hit) {
        KB.hitbox({ x: this.cx - 20, y: this.cy - 18, w: 40, h: 34, dmg: 5, owner: 'player', type: 'bow', life: 6, rehit: 0, pierce: true, knock: 2.4 });
        burst(this.cx, this.cy, { n: 18, colors: ['#fff8c0', '#48c048', '#ffffff'], speed: 3, life: 18, grav: 0.1 });
        ring(this.cx, this.cy, { r0: 3, r1: 30, frames: 12, color: '#fff8c0', width: 2 });
        KB.fx('fx_poof', this.cx, this.cy + 6);
        shake(4); sfx('arrow');
      } else {
        KB.particles(this.cx, this.cy, ['#c88850'], 4, { spread: 1, grav: 0.1, life: 14, up: 0, size: 1 });
      }
    }
    draw(g) { g.spr(this.spr, this.cx, this.bottom, { t: this.t, fps: this.life < 40 ? 10 : 3, flip: this.dir < 0 }); }
  }
  KB.BowTrap = BowTrap;

  function fireArrow(p, vx, vy, o) {
    o = o || {};
    const a = KB.shoot({
      spr: o.spr || 'proj_arrow', x: p.cx + p.dir * 10, y: p.cy - 2 + (o.oy || 0), vx: vx, vy: vy,
      dmg: o.dmg !== undefined ? o.dmg : 3, owner: 'player', life: o.life || 90,
      w: o.w || 12, h: o.h || 6, grav: o.grav !== undefined ? o.grav : 0.09, solid: true,
      pierce: !!o.pierce, type: 'bow', dir: p.dir, fxHit: 'fx_hit', knock: o.knock || 1.4, trail: o.trail || null,
      onWall(pr) {
        // 插在牆上：留下 30 幀的箭身 + 木屑
        pr.dead = true;
        KB.fx(o.spr || 'proj_arrow', pr.cx, pr.cy, { life: o.stick || 30, flip: pr.vx < 0 });
        KB.particles(pr.cx, pr.cy, ['#c88850', '#ffffff'], 5, { spread: 1.4, grav: 0.14, life: 16, up: 0.2, size: 1 });
        burst(pr.cx, pr.cy, { n: 5, colors: ['#c88850', '#eef2ff'], speed: 1.6, life: 10, grav: 0.1 });
        sfx('arrow');
      },
    });
    a.rot = Math.atan2(vy, vx) * (p.dir > 0 ? 1 : -1);
    return a;
  }

  def('bow', {
    color: '#48c048', duration: 22, hold: true, maxHold: 600, lockMove: false, moveSpeed: P.walk, fps: 12, canJump: true,
    desc: '精靈之弓拉滿時會把周圍的光都吸進箭尖，放手就是一道流星。',
    flavour: '風會告訴你該瞄哪裡。',
    moves: [['X', '射箭'], ['蓄力 40', '貫穿箭'], ['蓄力 80', '必殺・流星箭'], ['空中 X', '箭雨'], ['↓+X', '陷阱箭']],
    onGet(p) { const d = data(p); d.lv = 0; },
    onCrouchAttack(p) { startMove(p, 'trap'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.lv = 0;
      d.mode = pickMode(p, 'rain', null, 'shot');
      if (d.mode === 'shot') setup(p, { anim: 'kirby_attack_bow', dur: 22, fps: 12, lock: false, maxHold: 600 });
      else if (d.mode === 'rain') setup(p, { anim: 'kirby_attack_bow_rain', dur: 34, fps: 12, lock: false, maxHold: 0 });
      else if (d.mode === 'trap') setup(p, { anim: 'kirby_attack_bow_trap', dur: 26, fps: 10, lock: true, maxHold: 0 });
      else if (d.mode === 'pierce') setup(p, { anim: 'kirby_attack_bow_charge', dur: 28, fps: 10, lock: true, maxHold: 0 });
      else if (d.mode === 'meteor') setup(p, { anim: 'kirby_attack_bow_meteor', dur: 64, fps: 10, lock: true, maxHold: 0 });
    },
    update(p, dt, held) {
      const d = data(p); d.t++; light(46);
      if (d.mode === 'shot') {
        if (d.t === 4) { fireArrow(p, p.dir * 5.4, -0.9, { oy: 2, grav: 0.085 }); sfx('bow'); burst(p.cx + p.dir * 12, p.cy - 2, { n: 5, colors: ['#48c048', '#ffffff'], speed: 1.6, life: 9, grav: 0 }); }
        if (d.t === BOW_PIERCE) { d.lv = 1; setAnim(p, 'kirby_attack_bow_charge', 10); flash('#fff8c0', 3, 0.25); sfx('bow'); textPop(p.cx, p.y - 14, '貫穿', { color: '#fff8c0', size: 8, frames: 26, rise: 0.4 }); }
        if (d.t === HOLD('bow', BOW_METEOR)) { d.lv = 2; setAnim(p, 'kirby_attack_bow_meteor', 10); flash('#ffffff', 5, 0.4); textPop(p.cx, p.y - 16, '流星', { color: '#ffffff', size: 8, frames: 30, rise: 0.4 }); }
        if (d.lv > 0) {
          if (d.t % 8 === 0) aura(p, { color: d.lv > 1 ? '#ffffff' : '#fff8c0', r: 14 + d.lv * 4, frames: 12 });
          p.vx *= 0.86;
          if (d.t % 3 === 0) KB.particles(p.cx + rnd(-14, 14), p.cy + rnd(-12, 12), d.lv > 1 ? ['#ffffff', '#fff8c0'] : ['#fff8c0', '#48c048'], 1, { spread: 0.3, grav: -0.06, life: 14, up: 0.5, size: 1 });
        }
        if (!held && d.lv > 0) { startMove(p, d.lv > 1 ? 'meteor' : 'pierce'); return; }
        return;
      }
      if (d.mode === 'rain') {
        slowFall(p, 0.9);
        if (d.t === 6) {
          for (let i = 0; i < 5; i++) {
            const a = Math.PI / 2 + (i - 2) * 0.26;
            const ar = fireArrow(p, Math.cos(a) * 4.6 + p.dir * 0.8, Math.sin(a) * 4.6, { grav: 0.12, oy: 6, dmg: 3 });
            ar.rot = a;
          }
          burst(p.cx, p.cy + 8, { n: 8, colors: ['#48c048', '#ffffff'], speed: 2, life: 12, grav: 0 });
          shake(2); sfx('arrow_rain');
        }
        return;
      }
      if (d.mode === 'trap') {
        if (d.t === 8) {
          if (KB.game) KB.spawn(new BowTrap(p.cx + p.dir * 14 - 5, p.cy + 2, p.dir));
          burst(p.cx + p.dir * 14, p.cy + 6, { n: 6, colors: ['#48c048', '#c88850'], speed: 1.4, life: 12, grav: 0.05 });
          sfx('bow');
        }
        return;
      }
      if (d.mode === 'pierce') {
        if (d.t === 1) aura(p, { color: '#fff8c0', r: 18, frames: 10 });
        if (d.t === 6) {
          const a = fireArrow(p, p.dir * 7.6, 0, { spr: 'proj_arrow_big', dmg: 5, grav: 0, pierce: true, life: 90, w: 16, h: 7, knock: 2, trail: '#fff8c0', stick: 40 });
          a.rot = 0;
          line(p.cx, p.cy - 2, p.cx + p.dir * 180, p.cy - 2, { color: '#fff8c0', width: 2, frames: 12 });
          beam(p.cx, p.cy - 2, p.dir, 150, { width: 5, color: '#fff8c0', frames: 10 });
          flash('#fff8c0', 6, 0.45); shake(5); hitstop(3); zoom(1.05, 12);
          burst(p.cx + p.dir * 14, p.cy - 2, { n: 12, colors: ['#fff8c0', '#ffffff'], speed: 2.6, life: 14, grav: 0 });
          sfx('bow'); sfx('arrow');
        }
        return;
      }
      if (d.mode === 'meteor') {
        if (d.t === 1) {
          letterbox(64); worldTint('#303048', 0.4, 50); zoom(1.14, 30); shake(8); hitstop(6);
          textPop(p.cx, p.y - 18, '流星箭', { color: '#ffffff', size: 8, frames: 60, rise: 0.3 });
          sfx('bow');
        }
        if (d.t >= 2 && d.t <= 13) {
          if (d.t % 4 === 2) aura(p, { color: '#ffffff', r: 16 + d.t, frames: 10 });
          KB.particles(p.cx + rnd(-20, 20), p.cy + rnd(-18, 18), ['#ffffff', '#fff8c0'], 2, { spread: 0.4, grav: 0, life: 12, up: 0, vx: -p.dir * 0.6, size: 1 });
        }
        if (d.t === 14) {
          const a = KB.shoot({
            spr: 'proj_arrow_meteor', x: p.cx + p.dir * 16, y: p.cy - 2, vx: p.dir * 9, vy: 0,
            dmg: 10, owner: 'player', life: 120, w: 34, h: 12, grav: 0, solid: false, pierce: true,
            type: 'bow', dir: p.dir, fxHit: 'fx_hit', knock: 3, trail: '#fff8c0', fps: 12,
          });
          a.rot = 0;
          const cam = KB.game ? KB.game.cam : { x: 0, y: 0 };
          beam(p.cx, p.cy - 2, p.dir, 320, { width: 16, color: '#ffffff', frames: 22 });
          line(cam.x - 20, p.cy - 2, cam.x + KB.W + 20, p.cy - 2, { color: '#fff8c0', width: 5, frames: 20 });
          ring(p.cx, p.cy - 2, { r0: 6, r1: 48, frames: 18, color: '#ffffff', width: 3 });
          flash('#ffffff', 10, 0.8); shake(10); hitstop(4);
          burst(p.cx, p.cy - 2, { n: 20, colors: ['#ffffff', '#fff8c0', '#ff9028'], speed: 3.4, life: 20, grav: 0 });
          sfx('arrow'); sfx('arrow_rain');
          p.vx = -p.dir * 2.2;
        }
        if (d.t > 14 && d.t % 5 === 0) KB.particles(p.cx + rnd(-16, 16), p.cy + rnd(-14, 14), ['#ffffff', '#fff8c0'], 1, { spread: 0.6, grav: 0, life: 14, up: 0, size: 1 });
        p.vx *= 0.88;
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.lv = 0; },
    onLose(p) { killBox(p); clearAnim(p); },
  });
})();
