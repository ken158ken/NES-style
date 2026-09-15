// 變身系能力：giant dragon mech ghost（Round 5 變身大爆發）
// ---------------------------------------------------------------------------
// 這四種是「整體變身」：不是戴帽子，而是換掉整隻卡比（體型 / 精靈 / 物理）。
// 與 player.js 的介面（player.js 的變身鉤子，詳見該檔 setForm 上方註解）：
//   p.setForm({ key, scale, noclip, fly, armor, hp, alpha, hidden, inhaleAll, spr(p,anim,opts), draw(g,p) })
//   p.clearForm() / p.formScale / p.sizeMul / p.possessed / p.breakArmor()
//   def.formUpdate(p)  每幀呼叫（不論狀態）；回傳 true = 本幀由變身完全接管（幽靈附身用）
//   def.transform = true  取得能力時播放 KB.VFX.transform 大演出（一般能力不設，取得節奏不變）
// 特效一律透過 vf() 包一層，KB.VFX 未載入時安靜跳過；音效透過 sfx()（未定義的名稱只會 console.warn）。
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const P = KB.PHYS;
  const T = KB.TILE;

  // ---------- 蓄力必殺的門檻（fix5b / R5-P1-03）----------
  // 這些數字就是招式表 / 圖鑑上寫給玩家看的「按住 N 幀放開」，
  // **從按下攻擊鍵的那一幀算起**。各招內部的計數器起點不同（有的要等收招動作演完才開始加），
  // 所以下面使用時會扣掉各自的偏移量；改數字時只改這裡，招式表文案也用同一個值。
  // 驗證：tools/test_forms.py 的「蓄力門檻」段（按住 N+2 幀觸發、N-6 幀不觸發）。
  const DRAGON_NOVA = 60;   // 龍化・龍炎彈（招式表：按住 60 幀放開）
  const MECH_BARRAGE = 50;   // 機甲・全彈發射（招式表：按住 50 幀放開）
  // fix6：Lv3 蓄力時間 ×0.8（KB.PROG.holdMul）。招式表上的數字一律是 **Lv1** 的門檻，
  //   能力練到 Lv3 之後同一招會提早 20% 蓄滿（KB.PROG 未載入時回傳原值，行為完全不變）。
  const HOLD = (key, n) => (KB.PROG && KB.PROG.holdMul) ? Math.max(4, Math.round(n * KB.PROG.holdMul(key))) : n;


  // ---------- 註冊表 ----------
  const NAMES = { giant: '巨大化', dragon: '龍化', mech: '機甲', ghost: '幽靈' };
  const HUD = { giant: 'GIANT', dragon: 'DRAGON', mech: 'MECH', ghost: 'GHOST' };
  KB.ABILITIES = KB.ABILITIES || {};
  for (const k of ['giant', 'dragon', 'mech', 'ghost']) {
    if (KB.ABILITY_KEYS.indexOf(k) < 0) KB.ABILITY_KEYS.push(k);
    KB.ABILITY_NAMES[k] = NAMES[k];
    KB.ABILITY_HUD[k] = HUD[k];
  }
  const def = (key, o) => {
    o.key = key; o.name = o.name || NAMES[key]; o.hudName = o.hudName || HUD[key];
    o.icon = o.icon || ('ui_ability_' + key);
    o.transform = true;                       // 取得時播放變身大演出
    KB.ABILITIES[key] = o; return o;
  };

  // ---------- 共用工具 ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const data = p => p.abilityData || (p.abilityData = {});
  const down = k => KB.input.down(k);
  const sfx = n => { try { if (KB.audio && KB.audio.sfx) KB.audio.sfx(n); } catch (e) { } };
  /** KB.VFX 防呆呼叫：vf('ring', x, y, o) */
  const vf = function (fn) {
    try {
      if (KB.VFX && typeof KB.VFX[fn] === 'function') return KB.VFX[fn].apply(KB.VFX, Array.prototype.slice.call(arguments, 1));
    } catch (e) { }
    return null;
  };
  const shake = n => { const g = KB.game; if (g) g.shake = Math.max(g.shake || 0, n); };
  const hitstop = n => { const g = KB.game; if (g) g.freezeT = Math.max(g.freezeT || 0, n); };
  const light = r => { const g = KB.game; if (g) { g.lightR = r; g.lightT = 180; g.lightF = g.frame; } };
  const beat = b => { if (b && !b.dead) b.life = 3; };
  function killBox(p) {
    const d = data(p);
    for (const k of ['box', 'box2', 'box3']) if (d[k]) { d[k].dead = true; d[k] = null; }
  }
  function setup(p, o) {
    const D = p.abilityDef;
    D.anim = o.anim || null; D.maxHold = o.maxHold || 0;
    p.attackTimer = o.dur; p.attackFps = o.fps || 10;
    p.attackLock = o.lock !== false;
  }
  const clearAnim = p => { const D = p.abilityDef; if (D) { D.anim = null; D.maxHold = 0; } };
  function restartAttack(p) { p.setState('idle'); p.startAttack(); }
  function startMove(p, m) { data(p).next = m; restartAttack(p); }

  // ---------- Round 9：出招方向 / 優先序（與 abilities_magic.js 同一套約定）----------
  // player-input 在 startAttack 當幀寫入 `p.atkDir = { up, down, air }`；舊版 player.js 沒這欄位時退回即時輸入。
  function atkDir(p) {
    const a = p.atkDir;
    return {
      up: a ? !!a.up : down('up'),
      down: a ? !!a.down : down('down'),
      air: a ? !!a.air : !p.onGround,
    };
  }
  /**
   * 優先序：排隊的招 > ↑X > ↓X > 空中 X > X。
   * o = { up, down, air, ground, airUp, airDown, airOk }
   *   airUp / airDown：空中專用變體（沒填就沿用地面版，判定框跟著卡比走）
   *   airOk：回傳 false 代表「這個狀態不算空中」（幽靈穿牆時 onGround 恆 false）
   */
  function pickMode(p, o) {
    const d = data(p), q = d.next; d.next = null;
    if (q) return q;
    const a = atkDir(p);
    const air = a.air && (!o.airOk || o.airOk(p));
    if (a.up && o.up) return (air && o.airUp) || o.up;
    if (a.down && o.down) return (air && o.airDown) || o.down;
    if (air && o.air) return o.air;
    return o.ground;
  }
  const slowFall = (p, v) => { if (!p.onGround && p.vy > v) p.vy = v; };
  /** 空中出招的緩降：最多 lim 幀（預設 28 < 30 幀上限），之後恢復自然重力 ⇒ 空中出招一定會下墜 */
  function airSlow(p, d, v, lim) {
    if (p.onGround) return;
    if (d.t <= (lim === undefined ? 28 : lim)) slowFall(p, v);
  }
  function holding(p, held) { const d = p.abilityDef; return (held && d.maxHold > 0 && p.stateT < d.maxHold) || p.attackTimer > 2; }
  /** 場上最近的敵人（飛彈追蹤用） */
  function nearestEnemy(x, y, range) {
    let best = null, bd = range === undefined ? 1e9 : range;
    const g = KB.game; if (!g) return null;
    for (const e of g.entities) {
      if (e.dead || (e.type !== 'enemy' && e.type !== 'boss')) continue;
      if (e.type === 'enemy' && e.active === false) continue;
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** 以卡比為中心的地面雙向衝擊波（踩踏 / 墜落 / 噴射踩共用） */
  function groundWave(p, o) {
    o = o || {};
    const dmg = o.dmg === undefined ? 5 : o.dmg, w = o.w || 40, color = o.color || '#f0e0c0';
    shake(o.shake || 7); hitstop(o.stop || 4);
    sfx(o.sfx || 'stomp');
    for (const s of [-1, 1]) {
      KB.hitbox({
        x: p.cx + (s > 0 ? 2 : -2 - w), y: p.bottom - 16, w, h: 18, dmg, owner: 'player', type: o.type || 'hammer',
        life: 12, rehit: 0, pierce: true, knock: 3, breakBlocks: true,
      }).breakHard = !!o.breakHard;
      vf('shockwave', p.cx + s * 4, p.bottom, { dir: s, speed: 3.6, w: 14, h: 16, frames: 22, color });
      KB.particles(p.cx + s * 10, p.bottom, [color, '#ffffff', '#d8d0c0'], 8, { spread: 2.2, vx: s * 1.8, up: 1.3, life: 24 });
    }
    vf('ring', p.cx, p.bottom - 2, { r0: 6, r1: o.ring || 56, frames: 20, color, width: 3 });
  }

  // ======================================================================
  //  1. 巨大化 GIANT —— 限時 900 幀的破壞狂歡
  //     X      巨腳踩踏：躍起後落地，兩側各一道衝擊波（hit-stop）
  //     ↑+X    巨人上勾拳：頭頂 40×46 判定 dmg 6（Round 9 新招）；**按住不放** 會接到原本的「大口吸」
  //     ↓+X    巨人衝撞：前衝 30 幀全身判定 dmg 6，可撞破硬磚 X（空中照樣使得出來，重力照常）
  //     空中 X  屁股墜落：vy 8 直落，落地大衝擊環
  //     被動    體型 ×2、吸入範圍 ×2、可直接吞下中魔王、裝甲 3（armor 1）
  // ======================================================================
  const GIANT_TIME = 900, GIANT_WARN = 120;
  /** 巨大化的「大口吸」：直接切進 player.js 的吸入狀態（吸力範圍 / 嘴巴判定都乘上 p.sizeMul = 2）*/
  function bigInhale(p) {
    p.setState('inhale'); p.inhaleT = 0; sfx('inhale');
    vf('ring', p.cx, p.cy + 4, { r0: 12, r1: 76, frames: 18, color: '#ffd080', width: 2 });
    KB.particles(p.cx + p.dir * 40, p.cy, ['#ffffff', '#ffd080'], 8, { spread: 1.2, grav: 0, life: 18, vx: -p.dir * 2 });
  }
  def('giant', {
    color: '#ff8040', duration: 20, lockMove: true, canJump: false, fps: 8,
    hat: 'hat_giant',
    desc: '吞下巨大花的花粉，身體膨脹成兩倍大；撐得住三下攻擊，走一步地都在抖。',
    flavour: ['吸一大口氣——啵！整隻膨脹成兩倍。', '這個大小，連中魔王都能一口吞掉。'],
    moves: [['X', '巨腳踩踏'], ['↑+X', '上勾拳（按住＝大口吸）'], ['↓+X', '巨人衝撞（破硬磚）'], ['空中 X', '屁股墜落'], ['被動', '裝甲 3・受傷不掉能力'], ['限時', '900 幀後自動縮小']],
    onGet(p) {
      const d = data(p);
      d.timer = GIANT_TIME; d.step = 0; d.warned = false; d.mode = null;
      p.setForm({
        // fix5b / R5-P2-13：原本 armor 0 ⇒ 隨便被 waddledee 碰一下就 clearForm + 掉能力，
        // 900 幀的限時與「最後 120 幀閃爍」在實戰裡根本走不到。改成和 mech 同樣的裝甲機制：
        // armor 1（每下只扣 1 點裝甲、不扣 HP、不掉能力），裝甲 3 點打光才提前解除。
        key: 'giant', scale: 2, inhaleAll: true, armor: 1, hp: 3,
        // 巨大化沿用既有卡比精靈（scale 2）；攻擊幀：衝撞＝跑步、屁股墜落＝蹲下、
        // 踩踏＝專用的 kirby_attack_giant（fix5 新增，art/kirby_forms.js）
        spr(pp, anim, opts) {
          if (pp.state !== 'attack') return null;
          const m = (pp.abilityData || {}).mode;
          opts.t = pp.t;
          if (m === 'charge') { opts.frame = undefined; opts.fps = 12; return 'kirby_run'; }
          if (m === 'butt') { opts.frame = 0; return 'kirby_crouch'; }
          if (m === 'upper') { opts.frame = undefined; opts.fps = 10; return 'kirby_attack_giant_up'; }
          opts.frame = undefined; opts.fps = 8; return 'kirby_attack_giant';
        },
      });
      sfx('giant_grow'); sfx('giant_roar');
      shake(9); hitstop(6);
      vf('zoom', 1.25, 22);
      vf('ring', p.cx, p.cy, { r0: 6, r1: 70, frames: 26, color: '#ffd080', width: 3 });
      vf('burst', p.cx, p.cy, { n: 26, colors: ['#ffd080', '#ffffff', '#ff8040'], speed: 3.4, life: 32, grav: 0.03, size: 3 });
      KB.particles(p.cx, p.bottom, ['#f0e0c0', '#ffffff', '#d8d0c0'], 16, { spread: 2.8, up: 1.4, life: 28 });
    },
    /** 時間到 / 主動結束：縮小並失去能力 */
    shrink(p) {
      sfx('shrink');
      vf('ring', p.cx, p.cy, { r0: 48, r1: 4, frames: 16, color: '#ffd080', width: 2 });
      vf('burst', p.cx, p.cy, { n: 16, colors: ['#ffd080', '#ffffff'], speed: 1.6, life: 22 });
      KB.particles(p.cx, p.cy, ['#ffd080', '#ffffff'], 12, { spread: 2, life: 22 });
      p.dropAbility(false);
    },
    formUpdate(p) {
      const d = data(p), f = p.form; if (!f) return false;
      if (p.state === 'dead' || p.state === 'door' || p.state === 'dance') return false;
      d.timer--;
      // 走路每步震動 + 塵土
      if (p.onGround && Math.abs(p.vx) > 0.6) {
        d.step++;
        if (d.step % 10 === 0) {
          shake(2); sfx('mech_step');
          KB.particles(p.cx - Math.sign(p.vx) * 12, p.bottom - 2, ['#f0e0c0', '#ffffff', '#d8d0c0'], 3,
            { spread: 1.3, grav: 0.06, life: 18, up: 0.45, vx: -Math.sign(p.vx) * 0.7, size: 2 });
        }
      } else d.step = 0;
      // 最後 120 幀：閃爍 + 提示
      if (d.timer === GIANT_WARN && !d.warned) {
        d.warned = true;
        vf('textPop', p.cx, p.y - 6, '快變回去了', { color: '#ffd080', frames: 80, size: 12 });
        if (KB.game) KB.game.toast('快變回去了！');
        sfx('charge_ready');
      }
      f.alpha = (d.timer <= GIANT_WARN && (Math.floor(d.timer / 4) & 1)) ? 0.45 : undefined;
      if (d.timer <= 0) { this.shrink(p); return false; }
      return false;
    },
    onCrouchAttack(p) { startMove(p, 'charge'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.landed = false;
      d.mode = pickMode(p, { up: 'upper', down: 'charge', air: 'butt', ground: 'stomp' });
      if (d.mode === 'inhale') { bigInhale(p); return; }
      if (d.mode === 'upper') {
        // Round 9 新招「巨人上勾拳」：往上一記大拳，頭頂 40×46 判定；按住不放接大口吸
        setup(p, { dur: 26, fps: 10, lock: true });
        p.vy = Math.min(p.vy, -2.4); p.onGround = false;
        sfx('giant_roar'); shake(4);
        d.box = KB.hitbox({
          x: 0, y: 0, w: 40, h: 64, dmg: 6, owner: 'player', type: 'hammer', follow: p,
          ox: -20, oy: -40, life: 16, rehit: 10, knock: 3.4, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
        vf('ring', p.cx, p.y - 12, { r0: 6, r1: 48, frames: 18, color: '#ffd080', width: 3 });
        vf('slash', p.cx + p.dir * 6, p.y - 10, 26, -Math.PI / 2, { frames: 12, color: '#ffffff', width: 3 });
        KB.particles(p.cx, p.y - 6, ['#ffd080', '#ffffff', '#f0e0c0'], 12, { spread: 2.2, up: 1.6, life: 24 });
        return;
      }
      if (d.mode === 'charge') {
        setup(p, { dur: 30, fps: 10, lock: true });
        d.box = KB.hitbox({
          x: 0, y: 0, w: p.w + 10, h: p.h, dmg: 6, owner: 'player', type: 'hammer', follow: p,
          ox: -p.w / 2 - 5, oy: 0, life: 3, rehit: 8, knock: 3.5, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
        d.box.breakHard = true;                        // 可撞破硬磚 X
        p.vx = p.dir * 4;
        sfx('giant_roar'); shake(4);
        vf('afterimage', p, { frames: 32, every: 3, color: '#ffd080', alpha: 0.45 });
      } else if (d.mode === 'butt') {
        setup(p, { dur: 80, fps: 8, lock: true });
        p.vy = 8; p.vx = 0; p.maxFall = 9;
        sfx('stomp');
        d.box = KB.hitbox({
          x: 0, y: 0, w: p.w + 6, h: p.h, dmg: 5, owner: 'player', type: 'hammer', follow: p,
          ox: -p.w / 2 - 3, oy: 0, life: 3, rehit: 10, knock: 2, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
      } else {
        setup(p, { dur: 46, fps: 8, lock: true });
        p.vy = -4.2; p.vx = p.dir * 1.2; p.onGround = false;
        sfx('giant_roar');
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      if (d.mode === 'upper') {
        beat(d.box);
        if (d.t % 3 === 1) KB.particles(p.cx + rnd(-10, 10), p.y - 10, ['#ffd080', '#ffffff'], 1, { spread: 0.8, grav: 0.04, life: 14, up: 0.8, size: 2 });
        // 按住不放 → 接大口吸（原本的 ↑+X 招式，吸力範圍 ×2、可直接吞中魔王）
        if (held && d.t >= 12) {
          killBox(p);
          d.mode = null;
          bigInhale(p);
          // setState('inhale') 會把 attackTimer 歸零，而外層 updateAttack 接著還會 `attackTimer--`
          // 然後在 <= 0 時把狀態拉回 idle/fall —— 這裡先墊高一格，讓本幀的遞減不會取消吸入。
          p.attackTimer = 2;
        }
        return;
      }
      if (d.mode === 'charge') {
        p.vx = p.dir * 4;
        beat(d.box);
        if (d.t % 3 === 1) KB.particles(p.cx - p.dir * 14, p.bottom - 6, ['#f0e0c0', '#ffffff'], 2, { spread: 1, grav: 0.05, life: 14, vx: -p.dir * 1.4, size: 2 });
        if (d.t % 12 === 0) { shake(2); sfx('stomp'); }
        if (p.hitWall) { p.attackTimer = Math.min(p.attackTimer, 4); groundWave(p, { dmg: 6, breakHard: true, ring: 44 }); }
        return;
      }
      if (d.mode === 'butt') {
        beat(d.box);
        if (!d.landed) {
          p.vy = Math.max(p.vy, 6);
          if (d.t % 2 === 0) KB.particles(p.cx + rnd(-10, 10), p.y + 4, ['#ffffff', '#f0e0c0'], 1, { spread: 0.5, grav: -0.04, life: 12, size: 2 });
          if (p.onGround && d.t > 3) {
            d.landed = true; killBox(p); p.maxFall = P.maxFall;
            groundWave(p, { dmg: 6, w: 48, shake: 10, stop: 6, ring: 72 });
            vf('ring', p.cx, p.bottom - 4, { r0: 10, r1: 96, frames: 26, color: '#ffffff', width: 2 });
            p.attackTimer = Math.min(p.attackTimer, 16);
          }
        }
        return;
      }
      // 踩踏：跳起 → 落地雙向衝擊波
      if (!d.landed && p.onGround && d.t > 6) {
        d.landed = true;
        groundWave(p, { dmg: 5, w: 44, shake: 8, stop: 4, ring: 60 });
        p.attackTimer = Math.min(p.attackTimer, 14);
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; p.maxFall = P.maxFall; },
    onLose(p) { killBox(p); clearAnim(p); p.maxFall = P.maxFall; if (p.form) p.clearForm(); },
  });

  // ======================================================================
  //  2. 龍化 DRAGON —— 翅膀 + 尾巴 + 角，按住跳可飛行
  //     X      龍息    ：前方 56px 持續火焰（按住最多 90 幀）；按滿 60 幀放開 → 必殺
  //     ↑+X    升龍尾撩：躍起 + 頭頂 30×44 火焰判定 dmg 5（Round 9 新招，空中也能接）
  //     ↓+X    尾擊    ：前後雙向斬擊
  //     空中 X  俯衝    ：斜下衝 40 幀（紅色殘影）+ 落地衝擊波
  //     蓄力    龍炎彈  ：letterbox + 巨大貫穿火球
  // ======================================================================
  def('dragon', {
    color: '#e83818', duration: 14, hold: true, maxHold: 90, lockMove: true, canJump: true, fps: 10,
    hat: null,
    desc: '長出蝠翼、尾巴與金角；按住跳就能一直飛，張口就是一條火河。',
    flavour: ['背後「啪」地張開一對紅色蝠翼，', '吸一口氣，喉嚨深處已經燒起來了。'],
    moves: [['X（可按住）', '龍息'], ['↑+X', '升龍尾撩'], ['↓+X', '尾擊（前後）'], ['空中 X', '俯衝'], ['按住 60 幀放開', '必殺：龍炎彈'], ['按住跳', '飛行']],
    onGet(p) {
      const d = data(p); d.flap = 0;
      p.setForm({
        key: 'dragon', fly: true,
        spr(pp, anim, opts) {
          opts.frame = undefined; opts.t = pp.t;
          if (pp.state === 'attack') {
            opts.fps = 10;
            return ((pp.abilityData || {}).mode === 'rise') ? 'kirby_dragon_rise' : 'kirby_dragon_attack';
          }
          if (!pp.onGround) { opts.fps = 8; return 'kirby_dragon_fly'; }
          if (Math.abs(pp.vx) > 0.3) { opts.fps = 7; return 'kirby_dragon_walk'; }
          opts.fps = 3; return 'kirby_dragon_idle';
        },
      });
      sfx('dragon_breath');
      vf('aura', p, { frames: 40, r: 20, color: '#e83818' });
    },
    formUpdate(p) {
      const d = data(p), f = p.form; if (!f) return false;
      const s = p.state;
      if (s === 'dead' || s === 'door' || s === 'dance' || s === 'ride' || s === 'climb') return false;
      if (p.inWater || s === 'swim') { p.grav = P.grav; return false; }
      // 飛行：忽略重力，按住跳持續上升、放開緩降
      p.grav = 0;
      const am = data(p).mode;
      if (s === 'attack' && (am === 'dive' || am === 'rise')) return false;   // 俯衝 / 升龍時由招式自己控制 vy
      if (p.onGround) { if (p.vy > 0) p.vy = 0; return false; }
      // Round 9：按住跳 **或** 按住 ↑ 都能持續拍翅上升（player.js 的 ↑ 長按飛行會排除 form.fly，
      //   所以龍化要自己讀 p.dirHold.up，手感才和其他能力一致）
      if (KB.input.down('jump') || (p.dirHold && p.dirHold.up)) {
        p.vy = p.vy < -1.2 ? Math.min(p.vy + 0.18, -1.2) : -1.2;
        d.flap++;
        if (d.flap % 12 === 0) {
          sfx('wing_flap');
          KB.particles(p.cx - p.dir * 12, p.cy + 2, ['#ffffff', '#ffc0c0', '#e88080'], 2,
            { spread: 0.9, grav: -0.02, life: 18, up: 0.2, vx: -p.dir * 0.5, size: 2 });
        }
      } else {
        d.flap = 0;
        p.vy = Math.min(0.6, p.vy + 0.09);
      }
      return false;
    },
    onCrouchAttack(p) { startMove(p, 'tail'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.landed = false;
      d.mode = pickMode(p, { up: 'rise', down: 'tail', air: 'dive', ground: 'breath' });
      if (d.mode === 'rise') {
        // Round 9 新招「升龍尾撩」：翅膀一拍躍起，尾巴帶著火焰由下往上撩
        setup(p, { dur: 30, fps: 12, lock: true });
        p.vy = -5.4; p.onGround = false; p.vx = p.dir * 1.2;
        sfx('tail_whip'); sfx('wing_flap');
        d.box = KB.hitbox({
          x: 0, y: 0, w: 30, h: 44, dmg: 5, owner: 'player', type: 'fire', follow: p,
          ox: -15, oy: -30, life: 24, rehit: 8, knock: 3.2, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
        vf('slash', p.cx, p.y - 8, 26, -Math.PI / 2, { frames: 14, color: '#ff9020', width: 3 });
        vf('ring', p.cx, p.cy - 6, { r0: 4, r1: 34, frames: 16, color: '#ffe040', width: 2 });
        vf('afterimage', p, { frames: 30, every: 3, color: '#ff4040', alpha: 0.5 });
        KB.particles(p.cx, p.cy, ['#ffe040', '#ff9020', '#ff4010'], 12, { spread: 2, grav: -0.02, life: 22, up: 1.4 });
        shake(4);
      } else if (d.mode === 'tail') {
        setup(p, { dur: 26, fps: 12, lock: true });
        sfx('tail_whip');
        for (const s of [-1, 1]) {
          KB.hitbox({ x: p.cx + (s > 0 ? 4 : -4 - 30), y: p.cy - 10, w: 30, h: 22, dmg: 4, owner: 'player', type: 'sword', life: 12, rehit: 0, pierce: true, knock: 3 });
          vf('slash', p.cx + s * 16, p.cy, 20, s > 0 ? 0 : Math.PI, { frames: 12, color: '#ff8080', width: 3, flip: s < 0 });
        }
        KB.particles(p.cx, p.cy, ['#ffffff', '#ff8080'], 8, { spread: 2, life: 18 });
        shake(3);
      } else if (d.mode === 'dive') {
        setup(p, { dur: 40, fps: 10, lock: true });
        p.vx = p.dir * 4.2; p.vy = 4.2; p.maxFall = 8;
        sfx('dragon_dash');
        d.box = KB.hitbox({
          x: 0, y: 0, w: p.w + 10, h: p.h + 4, dmg: 5, owner: 'player', type: 'fire', follow: p,
          ox: -p.w / 2 - 5, oy: -2, life: 3, rehit: 10, knock: 3, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
        vf('afterimage', p, { frames: 44, every: 2, color: '#ff4040', alpha: 0.55 });
        vf('sparkTrail', p, { frames: 44, every: 2, color: ['#ffe040', '#ff9020', '#ff4010'] });
      } else if (d.mode === 'nova') {
        // 必殺：龍炎彈
        setup(p, { dur: 54, fps: 8, lock: true });
        p.vx = -p.dir * 1.2; p.vy = Math.min(p.vy, -0.4);
        sfx('dragon_breath'); sfx('giant_roar');
        vf('letterbox', 86); vf('zoom', 1.12, 26); hitstop(6); shake(9);
        vf('flash', '#ffe0a0', 8, 0.55);
        d.nova = 12;
      } else {
        setup(p, { dur: 14, fps: 10, lock: true, maxHold: 90 });
        d.charge = 0; d.ready = false;
        d.box = KB.hitbox({
          x: 0, y: 0, w: 20, h: 18, dmg: 2, owner: 'player', type: 'fire', follow: p,
          ox: 8, oy: -2, life: 3, rehit: 8, knock: 1, pierce: true,
        });
        sfx('dragon_breath');
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      light(72);
      if (d.mode === 'tail') { airSlow(p, d, 0.6); return; }
      if (d.mode === 'rise') {
        // 自己的重力（form.fly 期間 p.grav = 0）：先衝上去，之後照樣落下來
        p.vy += 0.42; p.vx *= 0.9;
        beat(d.box);
        if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + rnd(-8, 8), p.y - rnd(2, 22), { life: 10, fps: 12, flip: p.dir < 0 });
        if (d.t % 3 === 0) KB.particles(p.cx + rnd(-10, 10), p.y - rnd(0, 26), ['#ffe040', '#ff9020'], 2, { spread: 0.8, grav: -0.03, life: 16, up: 0.6, size: 1 });
        return;
      }
      if (d.mode === 'dive') {
        beat(d.box);
        if (!d.landed) {
          p.vx = p.dir * 4.2; p.vy = Math.max(p.vy, 4.2);
          if (d.t % 2 === 0) KB.fx('fx_fire', p.cx - p.dir * 6, p.cy - 4, { vx: -p.dir * 1.2, life: 10, flip: p.dir > 0, fps: 12 });
          if (p.onGround || p.hitWall) {
            d.landed = true; killBox(p); p.maxFall = P.maxFall;
            groundWave(p, { dmg: 6, w: 42, color: '#ff9020', shake: 8, sfx: 'dragon_dash', ring: 64 });
            p.attackTimer = Math.min(p.attackTimer, 12);
          }
        }
        return;
      }
      if (d.mode === 'nova') {
        p.vx *= 0.85;
        if (d.nova > 0) {
          d.nova--;
          KB.particles(p.cx + p.dir * 18 + rnd(-8, 8), p.cy + rnd(-10, 10), ['#ffe040', '#ff9020', '#ff4010'], 3,
            { spread: 0.6, grav: 0, life: 14, up: 0, vx: -p.dir * 1.2, size: 2 });
          if (d.nova === 0) {
            // 發射：巨大貫穿火球 + 光束
            const px = p.cx + p.dir * 18, py = p.cy - 4;
            // solid:false —— 20px 的大火球貼著地面飛，走物理會被地板判定成撞牆而立刻消失；
            // 「貫穿」本來就該無視地形，方塊破壞仍由 game.js 的 breakBlocksIn 處理。
            KB.shoot({
              spr: 'proj_dragonball', x: px, y: py, vx: p.dir * 3.6, dmg: 10, owner: 'player', life: 110,
              w: 20, h: 20, dir: p.dir, solid: false, pierce: true, breakBlocks: true, fxHit: 'fx_fire',
              type: 'fire', trail: ['#ffe040', '#ff9020'], knock: 4,
            });
            vf('beam', px, py, p.dir, 150, { frames: 18, width: 26, color: '#ff9020' });
            vf('burst', px, py, { n: 22, colors: ['#ffe040', '#ff9020', '#ffffff'], speed: 3.4, life: 30, dir: p.dir > 0 ? 0 : Math.PI, spread: 0.9 });
            shake(8); sfx('dragon_breath');
          }
        }
        return;
      }
      // 龍息（按住）
      const on = holding(p, held), b = d.box;
      if (!p.onGround) p.vy = Math.min(p.vy, 0.4);
      if (b && !b.dead) {
        if (!on) { b.dead = true; d.box = null; }
        else {
          b.w = Math.min(56, 20 + d.t * 3); beat(b);
          if (d.t % 2 === 1) KB.fx('fx_fire', p.cx + p.dir * (12 + rnd(0, 30)), p.cy + rnd(-2, 8), { vx: p.dir * 2.6, vy: rnd(-0.4, 0.2), life: 13, flip: p.dir < 0, fps: 12 });
          KB.particles(p.cx + p.dir * rnd(12, 52), p.cy + rnd(-8, 10), ['#ffe040', '#ff9020', '#ff4010'], 2,
            { spread: 0.6, grav: -0.04, life: 14, up: 0.2, vx: p.dir * 1.8, size: 1 });
          if (d.t % 20 === 0) sfx('dragon_breath');
        }
      }
      if (held) {
        d.charge = (d.charge || 0) + 1;
        if (d.charge === HOLD('dragon', DRAGON_NOVA) - 1) { d.ready = true; sfx('charge_ready'); vf('chargeReady', p.cx, p.cy, '#ff9020'); }
        if (d.ready && d.charge % 4 === 0) KB.particles(p.cx + rnd(-12, 12), p.y - 2, ['#ffffff', '#ffe040'], 2, { spread: 1, grav: 0, life: 12, up: 0.5, size: 1 });
      } else if (d.ready) { startMove(p, 'nova'); return; }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charge = 0; d.ready = false; p.maxFall = P.maxFall; },
    onLose(p) { killBox(p); clearAnim(p); p.maxFall = P.maxFall; p.grav = P.grav; if (p.form) p.clearForm(); },
  });

  // ======================================================================
  //  3. 機甲 MECH —— 裝甲值 6（armor 1），走路噴蒸氣
  //     X      火箭拳：拳頭飛出 100px 再飛回，來回各一次判定
  //     ↑+X    飛彈  ：2 枚拋物線追蹤飛彈（空中一樣射得出來）
  //     ↓+X    鑽頭突進：右臂變鑽頭前突 34 幀，dmg 3 / rehit 6、破磚（Round 9 新招；空中＝斜下鑽擊）
  //     空中 X  噴射墜踩
  //     跳躍    噴射跳（按住跳額外上升 30 幀）
  //     蓄力    必殺：全彈發射（6 枚飛彈 + 火箭拳）
  // ======================================================================
  /** 火箭拳：飛出 100px → 折返回主人身上；來回各判定一次 */
  class RocketFist extends KB.Projectile {
    constructor(o) {
      super(Object.assign({
        spr: 'proj_rocketfist', w: 12, h: 10, dmg: 4, owner: 'player', life: 150, solid: false,
        pierce: true, type: 'mech', fxHit: 'fx_hit', breakBlocks: true, knock: 3,
      }, o));
      this.home = o.ownerEnt || KB.player; this.travel = 0; this.back = false; this.reach = o.reach || 100;
      this.px = this.cx; this.py = this.cy;
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; return; }
      this.px = this.cx; this.py = this.cy;
      if (!this.back) {
        this.travel += Math.abs(this.vx) + Math.abs(this.vy);
        if (this.travel >= this.reach) {
          this.back = true; this.hitSet.clear();
          KB.particles(this.cx, this.cy, ['#ffffff', '#c0d0e0'], 5, { spread: 1.4, grav: 0, life: 14, size: 2 });
        }
      } else {
        const h = this.home;
        if (!h || h.dead) { this.dead = true; return; }
        const dx = h.cx - this.cx, dy = h.cy - this.cy, m = Math.hypot(dx, dy) || 1;
        this.vx = dx / m * 5; this.vy = dy / m * 5;
        if (m < 12) { this.dead = true; KB.particles(h.cx, h.cy, ['#ffffff', '#c0d0e0'], 5, { spread: 1.2, life: 12 }); return; }
      }
      this.x += this.vx; this.y += this.vy;
      this.flip = this.vx < 0;          // 拳頭不旋轉，只跟著飛行方向翻面（比較看得出是拳頭）
      if ((Math.floor(this.t * 60) & 1) === 0) vf('line', this.px, this.py, this.cx, this.cy, { color: '#c0d0e0', frames: 7, width: 2 });
      if (KB.game && (this.x < KB.game.map.pw + 200) === false) this.dead = true;
    }
  }
  /** 追蹤飛彈：拋物線起手 + 朝最近敵人修正 + 煙粒子 */
  class Missile extends KB.Projectile {
    constructor(o) {
      super(Object.assign({
        spr: 'proj_missile', w: 12, h: 7, dmg: 4, owner: 'player', life: 140, solid: false,
        pierce: false, type: 'mech', fxHit: 'fx_hit', breakBlocks: true, knock: 2.5,
      }, o));
      this.homeT = o.homeT === undefined ? 18 : o.homeT;     // 先拋物線幾幀再開始追蹤
      this.spd = o.spd || 3.2; this.target = null;
    }
    update(dt) {
      this.baseUpdate(dt);
      this.life--; if (this.life <= 0) { this.dead = true; this.boom(); return; }
      if (this.homeT > 0) { this.homeT--; this.vy += 0.24; }
      else {
        if (!this.target || this.target.dead) this.target = nearestEnemy(this.cx, this.cy, 220);
        const t = this.target;
        if (t) {
          const dx = t.cx - this.cx, dy = t.cy - this.cy, m = Math.hypot(dx, dy) || 1;
          this.vx += (dx / m * this.spd - this.vx) * 0.18;
          this.vy += (dy / m * this.spd - this.vy) * 0.18;
        } else this.vy += 0.12;
      }
      const m2 = Math.hypot(this.vx, this.vy) || 1;
      if (m2 > this.spd) { this.vx = this.vx / m2 * this.spd; this.vy = this.vy / m2 * this.spd; }
      this.x += this.vx; this.y += this.vy;
      this.dir = this.vx < 0 ? -1 : 1; this.flip = this.dir < 0;
      this.rot = Math.atan2(this.vy, Math.abs(this.vx)) * (this.dir > 0 ? 1 : -1);
      if ((Math.floor(this.t * 60) % 2) === 0) {
        KB.particles(this.cx - this.vx * 1.5, this.cy - this.vy * 1.5, ['#e8e8f0', '#b8c0d0', '#8890a0'], 1,
          { spread: 0.4, grav: -0.02, life: 18, up: 0.1, size: 2 });
      }
      const map = KB.game && KB.game.map;
      if (map && map.isSolidPx(this.cx, this.cy)) { this.dead = true; this.boom(); }
      if (map && (this.cy > map.ph + 40)) this.dead = true;
    }
    boom() {
      sfx('missile');
      KB.hitbox({ x: this.cx - 16, y: this.cy - 14, w: 32, h: 28, dmg: this.dmg, owner: 'player', type: 'mech', life: 6, rehit: 0, pierce: true, knock: 3 });
      vf('ring', this.cx, this.cy, { r0: 3, r1: 26, frames: 14, color: '#ffd080', width: 2 });
      vf('burst', this.cx, this.cy, { n: 12, colors: ['#ffe040', '#ff9020', '#ffffff'], speed: 2.4, life: 22 });
      KB.fx('fx_hit', this.cx, this.cy + 4);
    }
    onHit() { this.boom(); }
  }
  function fireMissile(p, n) {
    for (let i = 0; i < n; i++) {
      const up = -3.4 - i * 0.5;
      KB.spawn(new Missile({
        x: p.cx + p.dir * 6, y: p.cy - 4, vx: p.dir * (1.4 + i * 0.3), vy: up,
        homeT: 14 + i * 5, ownerEnt: p, dir: p.dir,
      }));
      KB.particles(p.cx + p.dir * 6, p.cy - 4, ['#ffffff', '#c0d0e0'], 4, { spread: 1.2, grav: 0.03, life: 16 });
    }
    sfx('missile');
  }
  def('mech', {
    color: '#78e8ff', duration: 22, lockMove: true, canJump: true, fps: 10,
    hat: null,
    desc: '穿上重裝甲：裝甲值 6，受傷先扣裝甲不掉能力；火箭拳、追蹤飛彈與噴射一應俱全。',
    flavour: ['「喀鏘」一聲，整組裝甲扣上身。', '胸口的動力爐亮起來——全系統正常。'],
    moves: [['X', '火箭拳（來回判定）'], ['↑+X', '追蹤飛彈 ×2'], ['↓+X', '鑽頭突進（破磚）'], ['空中 X', '噴射墜踩'], ['按住 50 幀放開', '必殺：全彈發射'], ['按住跳', '噴射跳']],
    onGet(p) {
      const d = data(p); d.jetT = 0; d.stepT = 0;
      p.setForm({
        key: 'mech', armor: 1, hp: 6,
        spr(pp, anim, opts) {
          opts.frame = undefined; opts.t = pp.t;
          if (pp.state === 'attack') {
            opts.fps = 10;
            return ((pp.abilityData || {}).mode === 'drill') ? 'kirby_mech_drill' : 'kirby_mech_attack';
          }
          if (!pp.onGround) { opts.fps = 6; return 'kirby_mech_jump'; }
          if (Math.abs(pp.vx) > 0.3) { opts.fps = 7; return 'kirby_mech_walk'; }
          opts.fps = 3; return 'kirby_mech_idle';
        },
      });
      sfx('jet'); shake(4);
      vf('ring', p.cx, p.cy, { r0: 4, r1: 44, frames: 18, color: '#78e8ff', width: 2 });
      vf('aura', p, { frames: 40, r: 18, color: '#78e8ff' });
    },
    formUpdate(p) {
      const d = data(p), f = p.form; if (!f) return false;
      const s = p.state;
      if (s === 'dead' || s === 'door' || s === 'dance') return false;
      // 走路：每 10 幀 mech_step + 微震
      if (p.onGround && Math.abs(p.vx) > 0.5) {
        d.stepT++;
        if (d.stepT % 10 === 0) {
          sfx('mech_step'); shake(1);
          KB.particles(p.cx - Math.sign(p.vx) * 8, p.bottom - 1, ['#e8e8f0', '#b8c0d0'], 2, { spread: 0.8, grav: 0.05, life: 14, up: 0.3, size: 1 });
        }
      } else d.stepT = 0;
      // 噴射跳：離地後按住跳最多 30 幀持續上升
      if (p.onGround) d.jetT = 0;
      // Round 9：按住跳（原本）或按住 ↑（新的飛行鍵）都會噴射；漂浮中除外 —— 那時 player.js
      //   的「↑ 長按飛行」已經在負責上升，再加噴射會變成兩份推力。
      else if ((KB.input.down('jump') || (p.dirHold && p.dirHold.up && s !== 'float'))
        && p.vy < 1.2 && d.jetT < 30 && s !== 'attack') {
        d.jetT++;
        p.vy -= 0.17;
        if (d.jetT % 4 === 1) KB.particles(p.cx + rnd(-4, 4), p.bottom - 1, ['#78e8ff', '#ffffff', '#1888c8'], 2, { spread: 0.7, grav: 0.02, life: 12, up: -0.6, size: 2 });
        if (d.jetT % 10 === 1) sfx('jet');
      }
      return false;
    },
    onCrouchAttack(p) { startMove(p, 'drill'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.landed = false;
      d.mode = pickMode(p, { up: 'missile', down: 'drill', air: 'jetdrop', ground: 'fist' });
      if (d.mode === 'drill') {
        // Round 9 新招「鑽頭突進」：右臂換成鑽頭往前鑽，地面沿地板推進、空中斜下鑽擊
        setup(p, { dur: 34, fps: 14, lock: true });
        p.vx = p.dir * 2.8;
        if (!p.onGround) p.vy = Math.max(p.vy, 1.6);
        sfx('jet'); sfx('mech_step'); shake(3);
        d.box = KB.hitbox({
          x: 0, y: 0, w: 24, h: 16, dmg: 3, owner: 'player', type: 'mech', follow: p,
          ox: 2, oy: 2, life: 4, rehit: 6, knock: 2, pierce: true, breakBlocks: true,
        });
        vf('sparkTrail', p, { frames: 34, every: 3, color: ['#ffe040', '#ffffff', '#78e8ff'] });
        KB.particles(p.cx + p.dir * 14, p.cy + 4, ['#ffe040', '#ffffff', '#b8c0d0'], 8, { spread: 1.6, grav: 0.05, life: 16, vx: p.dir * 1.2 });
      } else if (d.mode === 'missile') {
        setup(p, { dur: 26, fps: 10, lock: true });
        fireMissile(p, 2);
        shake(3);
      } else if (d.mode === 'jetdrop') {
        setup(p, { dur: 70, fps: 8, lock: true });
        p.vy = 7.5; p.vx = 0; p.maxFall = 9;
        sfx('jet');
        d.box = KB.hitbox({
          x: 0, y: 0, w: p.w + 6, h: p.h, dmg: 4, owner: 'player', type: 'mech', follow: p,
          ox: -p.w / 2 - 3, oy: 0, life: 3, rehit: 10, knock: 2, pierce: true, flipWithOwner: false, breakBlocks: true,
        });
      } else if (d.mode === 'barrage') {
        // 必殺：全彈發射
        setup(p, { dur: 60, fps: 8, lock: true });
        p.vx = 0;
        vf('letterbox', 90); vf('zoom', 1.1, 24); hitstop(6); shake(9);
        vf('flash', '#c0f0ff', 8, 0.5);
        sfx('rocket_punch');
        d.salvo = 0;
      } else {
        setup(p, { dur: 26, fps: 10, lock: true, maxHold: 0 });
        d.charge = 0; d.ready = false;
        sfx('rocket_punch');
        KB.spawn(new RocketFist({ x: p.cx + p.dir * 10, y: p.cy, vx: p.dir * 5, vy: 0, ownerEnt: p, dir: p.dir }));
        KB.particles(p.cx + p.dir * 10, p.cy, ['#ffffff', '#c0d0e0', '#78e8ff'], 6, { spread: 1.6, grav: 0, life: 14 });
        shake(2);
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      if (d.mode === 'drill') {
        beat(d.box);
        if (p.onGround) p.vx = p.dir * 2.8;
        else { p.vx = p.dir * 2.2; p.vy = Math.max(p.vy, 1.8); }   // 空中＝斜下鑽擊（照樣下墜）
        if (d.t % 2 === 0) {
          KB.particles(p.cx + p.dir * (12 + rnd(0, 8)), p.cy + rnd(0, 8), ['#ffe040', '#ffffff', '#b8c0d0'], 2,
            { spread: 1.2, grav: 0.06, life: 14, vx: -p.dir * 0.8, size: 1 });
        }
        if (d.t % 8 === 0) { sfx('mech_step'); shake(1); }
        if (p.hitWall) { p.attackTimer = Math.min(p.attackTimer, 6); groundWave(p, { dmg: 4, w: 30, color: '#c0e8ff', shake: 5, sfx: 'jet', ring: 40 }); }
        return;
      }
      if (d.mode === 'jetdrop') {
        beat(d.box);
        if (!d.landed) {
          p.vy = Math.max(p.vy, 6);
          if (d.t % 2 === 0) KB.particles(p.cx + rnd(-5, 5), p.y + 6, ['#78e8ff', '#ffffff'], 2, { spread: 0.6, grav: -0.05, life: 12, up: -0.8, size: 2 });
          if (d.t % 8 === 0) sfx('jet');
          if (p.onGround && d.t > 3) {
            d.landed = true; killBox(p); p.maxFall = P.maxFall;
            groundWave(p, { dmg: 5, w: 44, color: '#c0e8ff', shake: 8, sfx: 'jet', ring: 64 });
            p.attackTimer = Math.min(p.attackTimer, 14);
          }
        }
        return;
      }
      if (d.mode === 'barrage') {
        if (d.t % 6 === 0 && d.salvo < 6) { d.salvo++; fireMissile(p, 1); shake(3); }
        if (d.t === 40) {
          sfx('rocket_punch');
          KB.spawn(new RocketFist({ x: p.cx + p.dir * 10, y: p.cy, vx: p.dir * 6, vy: 0, ownerEnt: p, dir: p.dir, dmg: 6, reach: 130 }));
          shake(5);
        }
        return;
      }
      if (d.mode === 'missile') { airSlow(p, d, 0.6); return; }
      // 火箭拳：打完仍按住 → 蓄力，放開時放全彈發射
      if (d.t >= 18) {
        if (held) {
          d.charge = (d.charge || 0) + 1;
          if (d.charge === HOLD('mech', MECH_BARRAGE) - 18) { d.ready = true; sfx('charge_ready'); vf('chargeReady', p.cx, p.cy, '#78e8ff'); }
          if (d.ready && d.charge % 4 === 0) KB.particles(p.cx + rnd(-10, 10), p.y - 2, ['#ffffff', '#78e8ff'], 2, { spread: 1, grav: 0, life: 12, up: 0.5, size: 1 });
          else if (d.charge % 8 === 1) sfx('charge');
          p.attackTimer = Math.max(p.attackTimer, 2);
          p.vx *= 0.8;
        } else if (d.ready) { startMove(p, 'barrage'); return; }
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); const d = data(p); d.mode = null; d.charge = 0; d.ready = false; p.maxFall = P.maxFall; },
    onLose(p) { killBox(p); clearAnim(p); p.maxFall = P.maxFall; if (p.form) p.clearForm(); },
  });

  // ======================================================================
  //  4. 幽靈 GHOST —— 半透明，穿牆 / 附身 / 哀嚎 / 隱身
  //     X      穿牆開關：noclip 期間只能穿「最多 2 格厚」的牆，太厚會被推回
  //     ↑+X    隱身    ：180 幀內敵人察覺不到；起手 56px 內的敵人會嚇愣 freezeT 40（Round 9）
  //     ↓+X    附身    ：與敵人重疊時附身（方向鍵移動、X 觸發攻擊、再按 ↓+X 解除）
  //                     沒有目標時改出「怨靈墜擊」（Round 9 新的空中 / 地面通用變體，dmg 4）
  //     空中 X  幽靈哀嚎：範圍內敵人 stun 60 幀
  // ======================================================================
  const GHOST_PHASE = 240, GHOST_POSSESS = 300, GHOST_INVIS = 180;
  /** 水平方向連續實心磁磚的厚度（含所在格），上限 8 */
  function wallRun(map, tx, ty) {
    if (!KB.TileMap.isSolid(map.get(tx, ty))) return 0;
    let n = 1, x = tx - 1;
    while (n < 8 && KB.TileMap.isSolid(map.get(x, ty))) { n++; x--; }
    x = tx + 1;
    while (n < 8 && KB.TileMap.isSolid(map.get(x, ty))) { n++; x++; }
    return n;
  }
  /**
   * noclip 結束時把卡比從實心磁磚裡推出來（fix5b / R5-P1-02）。
   * 原本只往左右各找 64px，按住 ↓ 沉進地板時左右都是實心 → 迴圈跑完人還在地形裡，
   * noclip 一關掉就直接墜落 state=dead（掉一條命 + 掉能力）。
   * 現在改成：先左右 24px（保留「穿薄牆被推回來」的手感）→ 再一格一格往上找最近的空位 → 最後往下找。
   */
  function unstickFromWall(p) {
    const map = KB.game && KB.game.map; if (!map) return;
    const freeAt = (cx, bottom) => {
      if (bottom - p.h < 0) return false;
      const x0 = Math.floor((cx - p.w / 2) / T), x1 = Math.floor((cx + p.w / 2 - 1) / T);
      const y0 = Math.floor((bottom - p.h) / T), y1 = Math.floor((bottom - 1) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || tx >= map.w || ty >= map.h) return false;
        if (KB.TileMap.isSolid(map.get(tx, ty))) return false;
      }
      return true;
    };
    if (freeAt(p.cx, p.bottom)) return;
    for (let k = 1; k <= 24; k++) {
      if (freeAt(p.cx + k, p.bottom)) { p.x += k; return; }
      if (freeAt(p.cx - k, p.bottom)) { p.x -= k; return; }
    }
    for (let k = 1; k <= map.h; k++) {                   // 往上找最近的空格（沉進地板時走這條）
      const b = p.bottom - k * T;
      if (b - p.h < 0) break;
      if (freeAt(p.cx, b)) { p.bottom = b; p.vy = 0; return; }
    }
    for (let k = 1; k <= map.h; k++) {                   // 保險：上面全是實心就往下找
      const b = p.bottom + k * T;
      if (b > map.ph - T) break;
      if (freeAt(p.cx, b)) { p.bottom = b; p.vy = 0; return; }
    }
  }
  def('ghost', {
    color: '#c4ccec', duration: 20, lockMove: false, moveSpeed: P.walk, canJump: true, fps: 8,
    hat: null,
    desc: '變成半透明的白色被單；能穿過薄牆、附身敵人，還能發出讓人僵直的哀嚎。',
    flavour: ['身體變得輕飄飄、涼颼颼的，', '牆壁看起來也沒那麼硬了。'],
    moves: [['X', '穿牆開關（2 格內）'], ['↑+X', '隱身 180 幀（嚇愣）'], ['↓+X', '附身（無目標＝墜擊）'], ['空中 X', '幽靈哀嚎（stun）'], ['穿牆中 ↑↓', '上下飄浮']],
    onGet(p) {
      const d = data(p);
      d.phaseT = GHOST_PHASE; d.invisT = 0; d.possessT = 0; d.guard = null;
      p.possessed = null;
      p.setForm({
        key: 'ghost', noclip: true, alpha: 0.6,
        spr(pp, anim, opts) {
          opts.frame = undefined; opts.t = pp.t;
          if (pp.state === 'attack') {
            opts.fps = 10;
            return ((pp.abilityData || {}).mode === 'plunge') ? 'kirby_ghost_plunge' : 'kirby_ghost_attack';
          }
          if (Math.abs(pp.vx) > 0.3) { opts.fps = 6; return 'kirby_ghost_walk'; }
          opts.fps = 4; return 'kirby_ghost_idle';
        },
      });
      sfx('ghost_phase');
      vf('afterimage', p, { frames: 50, every: 3, color: '#c4ccec', alpha: 0.45 });
      vf('ring', p.cx, p.cy, { r0: 4, r1: 40, frames: 20, color: '#c4ccec', width: 2 });
    },
    /** 切換穿牆模式；關閉時若卡在牆裡會往最近的空位推出來 */
    setPhase(p, on) {
      const f = p.form, d = data(p); if (!f) return;
      f.noclip = !!on;
      f.alpha = on ? 0.5 : 0.6;
      if (on) {
        d.phaseT = GHOST_PHASE; sfx('ghost_phase');
        vf('afterimage', p, { frames: 50, every: 3, color: '#c4ccec', alpha: 0.45 });
        vf('ring', p.cx, p.cy, { r0: 2, r1: 34, frames: 16, color: '#ffffff', width: 2 });
      } else {
        if (p.clampToRoom) p.clampToRoom();
        unstickFromWall(p);
        p.grav = P.grav;
        sfx('unpossess');
        KB.particles(p.cx, p.cy, ['#ffffff', '#c4ccec'], 6, { spread: 1.4, life: 16 });
      }
    },
    /** 附身：卡比隱形跟著敵人跑 */
    possess(p, e) {
      const d = data(p);
      p.possessed = e; d.possessT = GHOST_POSSESS;
      if (p.form) p.form.hidden = true;
      // fix5b / R5-P1-04：附身期間卡比不受傷。原本只在 formUpdate 裡補 invuln 3，
      // 附身「那一幀」還是 0 ⇒ 貼在敵人身上按 ↓+X 會先吃接觸傷害 → 掉能力 → onLose → 附身 <8 幀就解除。
      p.invuln = Math.max(p.invuln, 12);
      p.setState(p.onGround ? 'idle' : 'fall');
      sfx('possess');
      hitstop(4); shake(4);
      vf('burst', e.cx, e.cy, { n: 18, colors: ['#ffffff', '#c4ccec', '#7d86b4'], speed: 2.6, life: 26 });
      vf('aura', e, { frames: GHOST_POSSESS, r: 16, color: '#c4ccec' });
      vf('textPop', e.cx, e.y - 4, '附身！', { color: '#c4ccec', frames: 40, size: 10 });
    },
    unpossess(p, kill) {
      const e = p.possessed; p.possessed = null;
      const d = data(p); d.possessT = 0;
      if (p.form) p.form.hidden = false;
      sfx('unpossess');
      if (e) {
        p.setCenter(e.cx, e.cy - 4);
        if (kill && !e.dead) {
          vf('burst', e.cx, e.cy, { n: 22, colors: ['#ffffff', '#c4ccec', '#8080ff'], speed: 3.2, life: 30 });
          vf('ring', e.cx, e.cy, { r0: 4, r1: 40, frames: 18, color: '#ffffff', width: 2 });
          KB.particles(e.cx, e.cy, ['#ffffff', '#c4ccec'], 10, { spread: 2.2, life: 22 });
          if (e.hurt) e.hurt(999, { cx: p.cx, cy: p.cy, kind: 'ghost' });
          if (!e.dead) { if (e.die) e.die({ cx: p.cx, cy: p.cy }); e.dead = true; }
        }
      }
      p.vx = 0; p.vy = 0;
      p.setState(p.onGround ? 'idle' : 'fall');
    },
    formUpdate(p) {
      const d = data(p), f = p.form; if (!f) return false;
      const inp = KB.input;
      const s = p.state;
      if (s === 'dead' || s === 'door' || s === 'dance' || s === 'ride') { if (p.possessed) this.unpossess(p, false); return false; }
      // ---- 附身中：本幀完全接管 ----
      if (p.possessed) {
        const e = p.possessed;
        d.possessT--;
        if (e.dead || d.possessT <= 0 || inp.pressed('select')) { this.unpossess(p, !e.dead && d.possessT <= 0); return true; }
        p.setCenter(e.cx, e.cy);
        p.vx = 0; p.vy = 0; p.onGround = e.onGround;
        p.invuln = Math.max(p.invuln, 12);   // 附身期間完全不受傷（fix5b / R5-P1-04）
        e.beingInhaled = false;
        const dx = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
        if (dx) { e.dir = dx; p.dir = dx; e.vx = dx * 1.5; } else e.vx *= 0.6;
        if (inp.pressed('jump') && e.onGround) { e.vy = -4; e.onGround = false; }
        if (inp.pressed('attack')) {
          if (inp.down('down')) { this.unpossess(p, true); return true; }
          try {
            if (typeof e.attack === 'function') e.attack();
            else if (e.setState) { e.setState('attack'); e.cool = 0; }
          } catch (err) { }
          KB.particles(e.cx, e.cy, ['#ffffff', '#c4ccec'], 4, { spread: 1.4, life: 14 });
        }
        if (d.possessT % 6 === 0) KB.particles(e.cx + rnd(-6, 6), e.cy + rnd(-6, 6), ['#ffffff', '#c4ccec'], 1, { spread: 0.4, grav: -0.02, life: 16, size: 1 });
        return true;
      }
      // ---- 隱身計時（敵人的 alert 由尾隨的 0 傷害判定框在敵人之後清除）----
      if (d.invisT > 0) {
        d.invisT--;
        f.alpha = 0.3;
        if (d.invisT === 0) { f.alpha = f.noclip ? 0.5 : 0.6; if (d.guard) { d.guard.dead = true; d.guard = null; } }
      }
      // ---- 穿牆模式 ----
      if (f.noclip) {
        d.phaseT--;
        if (d.phaseT <= 0) {
          this.setPhase(p, false);
          if (KB.game) KB.game.toast('穿牆時間結束');
        } else {
          p.grav = 0;
          if (s !== 'attack') {
            const vy = (inp.down('down') ? 1 : 0) - (inp.down('up') ? 1 : 0);
            if (vy) p.vy = vy * 1.4; else p.vy *= 0.7;
          }
          if ((d.phaseT & 7) === 0) KB.particles(p.cx + rnd(-6, 6), p.cy + rnd(-8, 8), ['#ffffff', '#c4ccec'], 1, { spread: 0.3, grav: -0.02, life: 18, size: 1 });
          // 牆太厚（> 2 格）就被推回來時路
          const map = KB.game && KB.game.map;
          if (map) {
            const tx = Math.floor(p.cx / T), ty = Math.floor(p.cy / T);
            if (wallRun(map, tx, ty) > 2) {
              const dir = p.vx !== 0 ? (p.vx > 0 ? 1 : -1) : p.dir;
              let guard = 0;
              while (guard++ < 48 && map.isSolidPx(p.cx, p.cy)) p.x -= dir;
              p.x -= dir; p.vx = 0; p.hitWall = true;
              sfx('hardblock');
              KB.particles(p.cx + dir * 6, p.cy, ['#ffffff', '#c4ccec'], 4, { spread: 1.2, life: 14, size: 1 });
            }
          }
        }
      } else p.grav = P.grav;
      return false;
    },
    onCrouchAttack(p) { startMove(p, 'possess'); },
    onAttack(p) {
      const d = data(p); killBox(p); d.t = 0; d.landed = false;
      // 招式選擇（Round 9 統一優先序：↑ 隱身 > ↓ 附身 > 空中哀嚎 > X 穿牆開關）。
      // 穿牆中 p.onGround 幾乎恆為 false（不與磁磚碰撞），所以「空中」要排除穿牆狀態，
      // 否則穿牆時 X 會一直變成哀嚎、再也關不掉穿牆（airOk）。
      const phasing = !!(p.form && p.form.noclip);
      d.mode = pickMode(p, { up: 'invis', down: 'possess', air: 'wail', ground: 'phase', airOk: () => !phasing });
      if (d.mode === 'possess') {
        setup(p, { dur: 18, fps: 10, lock: true });
        // 找目標：**判定框重疊就一定成立**（fix5b / R5-P1-04 —— 原本只看中心距 < 26px，
        // 高瘦 / 巨大的敵人明明整隻疊在卡比身上卻會跳「沒有目標」），重疊的優先，
        // 其次才是 26px 內最近的那隻。
        let tgt = null, bd = 26, over = null, od = 1e9;
        for (const e of KB.game.entities) {
          if (e.dead || e.type !== 'enemy' || e.active === false) continue;
          const dd = Math.hypot(e.cx - p.cx, e.cy - p.cy);
          if (p.overlaps(e)) { if (dd < od) { od = dd; over = e; } continue; }
          if (dd < bd) { bd = dd; tgt = e; }
        }
        if (over) tgt = over;
        if (tgt) { this.possess(p, tgt); return; }
        d.mode = 'plunge';        // Round 9：附不到身就改出「怨靈墜擊」（空中 ↓X 主要走這條）
      }
      if (d.mode === 'plunge') {
        setup(p, { anim: 'kirby_ghost_plunge', dur: 30, fps: 10, lock: true });
        p.vx *= 0.3; p.vy = Math.max(p.vy, 5.4);
        sfx('ghost_wail');
        d.box = KB.hitbox({
          x: 0, y: 0, w: 28, h: 28, dmg: 4, owner: 'player', type: 'ghost', follow: p,
          ox: -14, oy: -2, life: 26, rehit: 8, knock: 2, pierce: true, flipWithOwner: false, breakBlocks: false,
        });
        vf('ring', p.cx, p.cy, { r0: 20, r1: 2, frames: 14, color: '#c4ccec', width: 2 });
        vf('afterimage', p, { frames: 30, every: 2, color: '#c4ccec', alpha: 0.5 });
        vf('textPop', p.cx, p.y - 4, '怨靈墜擊', { color: '#c4ccec', frames: 34, size: 9 });
        KB.particles(p.cx, p.y - 2, ['#ffffff', '#c4ccec'], 10, { spread: 1.8, grav: -0.02, life: 20 });
      } else if (d.mode === 'wail') {
        setup(p, { dur: 34, fps: 10, lock: true });
        sfx('ghost_wail');
        p.vy = Math.min(p.vy, 0.2);
        shake(4);
        vf('ring', p.cx, p.cy, { r0: 6, r1: 86, frames: 26, color: '#ffffff', width: 3 });
        vf('ring', p.cx, p.cy, { r0: 2, r1: 60, frames: 20, color: '#c4ccec', width: 2 });
        vf('burst', p.cx, p.cy, { n: 20, colors: ['#ffffff', '#c4ccec', '#7d86b4'], speed: 2.6, life: 28, grav: -0.02 });
        let n = 0;
        for (const e of KB.game.entities) {
          if (e.dead || e.type !== 'enemy' || e.active === false) continue;
          if (Math.hypot(e.cx - p.cx, e.cy - p.cy) > 76) continue;
          e.freezeT = Math.max(e.freezeT || 0, 60); e.vx = 0; n++;
          KB.particles(e.cx, e.y - 2, ['#ffffff', '#c4ccec'], 4, { spread: 1.2, up: 0.8, life: 20 });
        }
        // 判定框：哀嚎本身也有 2 點傷害
        d.box = KB.hitbox({ x: p.cx - 40, y: p.cy - 34, w: 80, h: 68, dmg: 2, owner: 'player', type: 'ghost', life: 10, rehit: 0, pierce: true, knock: 1, breakBlocks: false });
        if (n) vf('textPop', p.cx, p.y - 6, '哀嚎！', { color: '#ffffff', frames: 34, size: 10 });
      } else if (d.mode === 'invis') {
        setup(p, { dur: 20, fps: 10, lock: true });
        d.invisT = GHOST_INVIS;
        sfx('ghost_phase');
        if (p.form) p.form.alpha = 0.3;
        vf('ring', p.cx, p.cy, { r0: 30, r1: 2, frames: 16, color: '#c4ccec', width: 2 });
        vf('textPop', p.cx, p.y - 4, '隱身', { color: '#c4ccec', frames: 36, size: 10 });
        // Round 9：卡比在眼前「啪」地消失 —— 56px 內的敵人會嚇愣（freezeT 40），隱身也算一招
        for (const e of KB.game.entities) {
          if (e.dead || e.type !== 'enemy' || e.active === false) continue;
          if (Math.hypot(e.cx - p.cx, e.cy - p.cy) > 56) continue;
          e.freezeT = Math.max(e.freezeT || 0, 40); e.vx = 0;
          e.alert = false; e.alertT = 0;
          KB.particles(e.cx, e.y - 2, ['#ffffff', '#c4ccec'], 5, { spread: 1.2, up: 0.9, life: 20 });
          vf('textPop', e.cx, e.y - 6, '？', { color: '#ffffff', frames: 28, size: 9 });
        }
        // 尾隨的 0 傷害判定框：排在敵人之後更新，負責把敵人的 alert 清掉
        if (d.guard) d.guard.dead = true;
        d.guard = KB.hitbox({
          x: p.cx, y: p.cy, w: 0, h: 0, dmg: 0, owner: 'player', type: 'ghost', life: GHOST_INVIS + 4,
          pierce: true, breakBlocks: false, follow: p, ox: 0, oy: 0,
          // 判定框排在敵人之後更新（KB.spawn 推到陣列尾端），所以這裡清掉的 alert
          // 是敵人「本幀剛設起來」的那一份 → 效果上就是「察覺不到卡比」，也不會冒驚嘆火花。
          // 同時壓住攻擊冷卻，隱身期間不會被突然開火。
          onUpdate() {
            const g = KB.game; if (!g) return;
            for (const e of g.entities) {
              if (e.dead || e.type !== 'enemy') continue;
              if (e.alert) { e.alert = false; e.alertT = 0; }
              if (e.cool !== undefined && e.cool < 12) e.cool = 12;
            }
          },
        });
      } else {
        // 穿牆開關
        setup(p, { dur: 16, fps: 10, lock: false });
        this.setPhase(p, !(p.form && p.form.noclip));
      }
    },
    update(p, dt, held) {
      const d = data(p); d.t++;
      if (d.mode === 'wail') {
        airSlow(p, d, 0.3);
        if (d.t % 3 === 0) KB.particles(p.cx + rnd(-20, 20), p.cy + rnd(-18, 18), ['#ffffff', '#c4ccec'], 1, { spread: 0.4, grav: -0.03, life: 16, size: 1 });
        return;
      }
      if (d.mode === 'plunge') {
        beat(d.box);
        p.vy = Math.max(p.vy, 5.4);
        // 穿牆模式下沒有地形碰撞（form.noclip）→ 自己看腳下那格，免得一路沉到房間底部
        const map = KB.game && KB.game.map;
        const blocked = p.form && p.form.noclip && map && map.isSolidPx(p.cx, p.bottom + 2);
        if (blocked || p.onGround) {
          if (blocked) p.vy = 0;
          if (!d.landed) {
            d.landed = true;
            vf('ring', p.cx, p.bottom - 2, { r0: 4, r1: 44, frames: 18, color: '#ffffff', width: 2 });
            KB.hitbox({ x: p.cx - 24, y: p.bottom - 20, w: 48, h: 22, dmg: 3, owner: 'player', type: 'ghost',
              life: 8, rehit: 0, pierce: true, knock: 2, breakBlocks: false });
            KB.particles(p.cx, p.bottom, ['#ffffff', '#c4ccec'], 10, { spread: 2.2, life: 20 });
            sfx('unpossess'); shake(4);
            p.attackTimer = Math.min(p.attackTimer, 10);
          }
        }
        if (d.t % 3 === 0) KB.particles(p.cx + rnd(-8, 8), p.y + rnd(0, 10), ['#ffffff', '#c4ccec'], 1, { spread: 0.4, grav: -0.04, life: 14, size: 1 });
        return;
      }
    },
    onEnd(p) { killBox(p); clearAnim(p); data(p).mode = null; },
    onLose(p) {
      const d = data(p);
      if (p.possessed) this.unpossess(p, false);
      if (d.guard) { d.guard.dead = true; d.guard = null; }
      killBox(p); clearAnim(p); d.invisT = 0; p.grav = P.grav;
      if (p.form) p.clearForm();
    },
  });

  KB.FORM_PROJ = { RocketFist, Missile };
})();
