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
//   KB.Helper.drawHUD(ctx)  HUD 右側的小夥伴臉 + HP（progression agent 請在 KB.drawHUD 末端呼叫）
//
// Round 7（helper2）新增：
//   KB.Helper.list          夥伴陣列（最多 KB.Helper.MAX = 2；current === list[0]，舊介面照常可用）
//   KB.Helper.all()/count() 目前活著的夥伴 / 數量；get(i) 取第 i 個（省略 i＝最舊的那個）
//   KB.Helper.MODES/mode    指令模式 'follow'（跟隨）/ 'stay'（待命）/ 'assault'（突擊）
//   KB.Helper.setMode(id) / cycleMode()   ↑＋SELECT 同時按下＝循環切換（tick 內自行偵測 KB.input）
//   KB.Helper.canUnion() / union(p)       合體技：↓＋SELECT，兩夥伴衝到玩家兩側同時放必殺（CD 600）
//   KB.Helper.unionCD       合體技剩餘冷卻幀數
//   夥伴等級：HP / 攻擊間隔繼承 KB.PROG.level(能力)（Lv1 4/90、Lv2 5/90、Lv3 6/70、Lv4 7/55）；
//             招式產生的判定框會帶上 abilityKey ⇒ game.js collisions 的 KB.PROG.scaleDmg 自動吃 dmgMul。
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
    // ---- Round 7（helper2）----
    maxHelpers: 2,            // 最多同時 2 個夥伴
    hpByLv: [4, 5, 6, 7],     // 夥伴 HP（KB.PROG.level(key) → Lv1~4）
    cdByLv: [90, 90, 70, 55], // 夥伴攻擊間隔（同上）
    stayLeash: 56,            // 待命：離崗位最遠 56px（打完會走回崗位）
    assaultR: 200,            // 突擊：偵測半徑（不管離卡比多遠）
    assaultCD: 0.6,           // 突擊：攻擊間隔 ×0.6（R7-P2-07 清怪效率）
    assaultSpd: 1.3,          // 突擊：追擊速度 ×1.3
    assaultFast: 40,          // 突擊：離目標 > 40px 就用跑的
    unionCD: 600,             // 合體技冷卻
    unionDash: 18,            // 衝到玩家兩側的最長幀數
    unionSide: 22,            // 合體技站位（玩家左右各 22px）
    unionCast: 10,            // 蓄力加速幀數（蓄滿後放開＝必殺）
    fade: 10,                 // 進門淡出 / 新房淡入幀數
  };

  // ---------------------------------------------------------------------------
  // 指令模式（↑＋SELECT 循環切換；對所有夥伴同時生效）
  // ---------------------------------------------------------------------------
  const MODES = [
    { id: 'follow', name: '跟隨', hud: 'FOLLOW', icon: 'ui_helper_mode_follow', color: '#70e070' },
    { id: 'stay', name: '待命', hud: 'STAY', icon: 'ui_helper_mode_stay', color: '#60c0ff' },
    { id: 'assault', name: '突擊', hud: 'ASSAULT', icon: 'ui_helper_mode_assault', color: '#ff6050' },
  ];
  const MODE_BY_ID = {};
  for (const m of MODES) MODE_BY_ID[m.id] = m;

  /** 夥伴等級：繼承 KB.PROG.level(key) → { lv, hp, cd } */
  function statsOf(key) {
    let lv = 1;
    try { if (KB.PROG && KB.PROG.level) lv = Math.max(1, KB.PROG.level(key) | 0); } catch (e) { lv = 1; }
    const i = Math.max(0, Math.min(CFG.hpByLv.length - 1, lv - 1));
    return { lv, hp: CFG.hpByLv[i], cd: CFG.cdByLv[i] };
  }

  // ---------------------------------------------------------------------------
  // R6-P2-05：變身系能力（def.transform = true：giant / dragon / mech / ghost）的「簡化版」
  // ---------------------------------------------------------------------------
  // 夥伴的 setForm() 只是把 form 存起來、不會真的變形，所以玩家版招式有兩種失效方式：
  //   giant  地面 X＝踩踏，會帶著 vx 往前跳 46 幀 → 還沒落地就撞進敵人吃接觸傷害（實測 0 判定框、打不死瓦豆）
  //   ghost  取得時 form.noclip = true ⇒ 地面 X 永遠被判成「穿牆開關」，完全沒有判定框
  //   dragon / mech 的地面 X（龍息 / 火箭拳）實測本來就能用，只要「指定走地面招」就穩定。
  // 因此：giant 用 helper.js 自己的簡化踩踏（原地小跳 + 落地雙向衝擊波，不往前衝），
  //       ghost / dragon / mech 用 abilityData.next 強制指定招式（abilities_forms.js 的 pickMode 會優先吃 next）。
  const SIMPLE = {
    giant: { scale: 1.5, own: 'stomp' },   // 放大 1.5 倍 + 踩踏
    dragon: { fly: true, next: 'breath' },  // 飛行跟隨 + 龍息
    mech: { next: 'fist' },                 // 火箭拳
    ghost: { next: 'wail' },                // 哀嚎
  };
  const simpleOf = key => {
    const d = key && KB.ABILITIES && KB.ABILITIES[key];
    if (!d || !d.transform) return null;
    return SIMPLE[key] || { fallback: true };     // 未知的變身能力 → 退化成吐星（保證每 90 幀有傷害）
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
    constructor(p, key, slot) {
      super(p.x, p.y);
      this.type = 'ally'; this.owner = 'player'; this.name = 'helper'; this.z = 2;
      this.w = 12; this.h = 13; this.stepH = 6;
      this.solid = true; this.grav = P.grav; this.maxFall = P.maxFall;
      // Round 7：HP / 攻擊間隔繼承能力等級（KB.PROG.level）
      const st = statsOf(key);
      this.lv = st.lv; this.hp = st.hp; this.maxHp = st.hp; this.atkCDFrames = st.cd;
      this.inhalable = true; this.hurtsPlayer = false; this.damage = 0; this.score = 0;
      this.dir = p.dir || 1;
      this.slot = slot | 0;                              // 0＝最舊的夥伴（站得比較近）
      this.cx = p.cx - this.dir * (16 + this.slot * 14); this.bottom = p.bottom;
      this.game = KB.game;
      // 淡入淡出（換房／重生）與合體技
      this.alpha = 1; this.alphaTo = 1;
      this.unionT = 0; this.unionDir = 0; this.unionCast = 0;
      this.anchorX = this.cx; this.anchorY = this.cy;    // 待命模式的崗位

      // ---- 假玩家介面（abilities.js 會讀 / 寫這些欄位）----
      this.ability = key; this.abilityData = {};
      this.simple = simpleOf(key);                       // 變身系 → 簡化版設定（見 SIMPLE）
      this.scaleMul = (this.simple && this.simple.scale) || 1;
      this.state = 'idle'; this.stateT = 0;
      this.attackTimer = 0; this.attackLock = false; this.attackFps = 12;
      this.form = null; this.possessed = null; this.sizeMul = 1; this.mouth = null;
      this.hitWall = false; this.hitCeil = false; this.onSlope = false;
      this.jumped = false; this.jumpHold = 0; this.hurtTimer = 0; this.inhaleT = 0;
      this.inWater = false; this.stoneBox = null; this.stoneT = 0; this.invincibleT = 0;
      this.keys = {};          // 假輸入（只有 attack 會被按住）

      // ---- AI ----
      this.atkCool = 30; this.holdT = 0; this.stuckT = 0; this.lastX = this.x;
      this.modeFlash = 0;                                // 剛換指令時頭上圖示閃一下
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
      if (s !== 'attack') { this.attackLock = false; this.attackTimer = 0; this.simpleMove = null; this.unionCast = 0; }
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
    // Round 10（貼身判定加倍）：夥伴的判定框一律維持 Round 9 尺寸。
    //   entity.js 的自動規則要求 follow.type === 'player'，夥伴是 'ally' → 不會被放大；
    //   夥伴用玩家能力定義出招時（callDef），abilities_* 的 mbox() 也會看 p.type 而傳 melee:false。
    startStone() {
      this.setState('attack'); this.attackTimer = 60; this.attackLock = true; this.stoneMode = 60;
      this.vx = 0; sfx('stone');
      KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      this.stoneBox = KB.hitbox({
        x: this.x, y: this.y, w: this.w + 4, h: this.h + 2, dmg: 6, owner: 'player', type: 'stone',
        follow: this, ox: -this.w / 2 - 2, oy: -1, life: 99999, rehit: 20, pierce: true, breakBlocks: true,
      });
      if (this.stoneBox) { this.stoneBox.fromHelper = true; this.stoneBox.abilityKey = this.ability; }
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
      // abilityKey：game.js 的 collisions 會用它算 KB.PROG.scaleDmg（夥伴的傷害吃「夥伴能力」的等級加成，
      // 而不是卡比手上那個能力——能力交給夥伴後卡比通常是沒有能力的）。
      KB.spawn = function (e) {
        if (e) { e.fromHelper = true; e.helperSrc = self; if (e.abilityKey === undefined) e.abilityKey = self.ability; }
        return realSpawn(e);
      };
      try { fn(); }
      catch (err) { if (KB.DEBUG) console.warn('[helper] ability error', err); }
      finally { KB.input = realInput; KB.spawn = realSpawn; }
    }

    /** 使用能力攻擊（可指定目標 → 先面向目標）；回傳是否真的出招 */
    useAbility(target) {
      const d = this.abilityDef;
      if (!d || this.dead || this.state === 'attack' || this.state === 'hurt') return false;
      if (target) this.dir = target.cx < this.cx ? -1 : 1;
      // R6-P2-05：變身系能力走簡化版
      const sp = this.simple;
      if (sp) {
        this.atkCool = this.cdNow();
        if (sp.own === 'stomp') { this.simpleStomp(); return this.state === 'attack'; }
        if (sp.fallback) { this.spitStar(); return this.state === 'attack'; }
        if (sp.next) this.abilityData.next = sp.next;    // pickMode 會優先吃 abilityData.next
      }
      this.keys.attack = true;
      this.holdT = d.hold ? CFG.holdFrames : 0;
      this.startAttack();
      this.atkCool = this.cdNow();
      return this.state === 'attack';
    }
    /** 這一次出招之後的冷卻幀數（突擊模式 ×CFG.assaultCD） */
    cdNow() {
      const base = this.atkCDFrames || CFG.atkCD;
      return H.mode === 'assault' ? Math.max(1, Math.round(base * CFG.assaultCD)) : base;
    }

    /** 簡化版踩踏（giant）：原地小跳（不往前衝，避免撞進敵人）→ 落地雙向衝擊波 */
    simpleStomp() {
      this.setState('attack');
      this.attackTimer = 40; this.attackLock = true; this.attackFps = 8;
      this.simpleMove = 'stomp'; this.simpleT = 0; this.simpleDone = false;
      this.vx = 0; this.vy = -2.6; this.onGround = false;
      sfx('giant_roar', 'stomp');
      V('afterimage', this, { frames: 26, every: 3, color: '#ffd080', alpha: 0.4 });
      KB.particles(this.cx, this.bottom, ['#f0e0c0', '#ffffff'], 6, { spread: 1.6, life: 18, up: 0.8 });
    }

    /** 落地雙向衝擊波（夥伴版 groundWave；判定框 owner 'player' + fromHelper）
     *  Round 10：絕對座標且 owner 'player'，但沒有 follow → entity.js 不會自動放大；夥伴維持原尺寸（40×18）。 */
    stompWave() {
      const g = KB.game;
      if (g) { g.shake = Math.max(g.shake || 0, 6); g.freezeT = Math.max(g.freezeT || 0, 3); }
      sfx('stomp', 'block');
      for (const s of [-1, 1]) {
        // 用 callDef 包住 → KB.spawn 的包裝會在生成當下就標上 fromHelper（測試 / 統計抓得到）
        this.callDef(() => KB.hitbox({
          x: this.cx + (s > 0 ? 2 : -2 - 40), y: this.bottom - 16, w: 40, h: 18, dmg: 5, owner: 'player',
          type: 'hammer', life: 12, rehit: 0, pierce: true, knock: 3, breakBlocks: true,
        }));
        V('shockwave', this.cx + s * 4, this.bottom, { dir: s, speed: 3.4, w: 12, h: 14, frames: 20, color: '#f0e0c0' });
        KB.particles(this.cx + s * 8, this.bottom, ['#f0e0c0', '#ffffff'], 6, { spread: 2, vx: s * 1.6, up: 1.1, life: 20 });
      }
      V('ring', this.cx, this.bottom - 2, { r0: 5, r1: 48, frames: 18, color: '#f0e0c0', width: 2 });
    }

    /** 退化招式：吐星（dmg 2）—— 任何簡化版都接不上時的保底，確保每 90 幀能造成傷害 */
    spitStar() {
      this.setState('attack');
      this.attackTimer = 20; this.attackLock = true; this.attackFps = 12;
      this.simpleMove = 'spit'; this.simpleT = 0; this.simpleDone = false;
      this.callDef(() => KB.shoot && KB.shoot({
        spr: KB.has('proj_star') ? 'proj_star' : 'proj_starshot', x: this.cx + this.dir * 8, y: this.cy,
        vx: this.dir * 4, vy: 0, dmg: 2, owner: 'player', life: 60, w: 10, h: 10, grav: 0,
        solid: true, type: 'star', rotSpeed: 0.4,
      }));
      sfx('spit', 'shoot');
    }

    /** 簡化版招式每幀推進（對應 updateAbility，但完全不碰 KB.ABILITIES） */
    updateSimple() {
      this.simpleT++;
      if (this.simpleMove === 'stomp') {
        this.vx *= 0.7;
        if (!this.simpleDone && ((this.onGround && this.simpleT > 4) || this.simpleT > 34)) {
          this.simpleDone = true;
          this.stompWave();
          this.attackTimer = Math.min(this.attackTimer, 12);
        }
      }
      this.attackTimer--;
      if (this.attackTimer <= 0) { this.simpleMove = null; this.setState(this.onGround ? 'idle' : 'fall'); }
    }

    /** 攻擊狀態每幀推進（對應 player.updateAttack，扣掉方向鍵 / 跳躍那段） */
    updateAbility() {
      if (this.simpleMove) { this.updateSimple(); return; }
      const d = this.abilityDef;
      if (!d) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      if (this.stoneMode > 0) {
        this.stoneMode--; this.vx *= 0.6;
        if (this.stoneBox && !this.stoneBox.dead) this.stoneBox.life = 3;
        if (--this.attackTimer <= 0) { this.killStone(); this.setState(this.onGround ? 'idle' : 'fall'); }
        return;
      }
      if (this.unionCast > 0) this.stepUnionCast();     // 合體技：蓄力加速 → 放開＝必殺
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
      this.stepFade();
      const g = this.game = KB.game, p = g && g.player;
      if (!g || !p) return;
      if (this.atkCool > 0) this.atkCool--;
      if (this.jumpCD > 0) this.jumpCD--;
      // 被卡比吸回去
      if (this.checkInhale(p)) return;
      this.beingInhaled = false;
      this.checkDamage();
      if (this.dead) return;
      // 卡比死亡：夥伴消失，但把能力記下來 → 重生時在重生點帶著同樣的能力回來（H.tick）
      if (p.state === 'dead') { H.rememberRespawn(g, p); this.vanish(); return; }
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

    /** 跟隨 / 待命 / 突擊 + 跳躍 / 漂浮 + 發現敵人就靠近並使用能力 */
    think(p) {
      const g = this.game, map = g.map, mode = H.mode;
      // 合體技：衝到玩家兩側（衝完就放必殺）
      if (this.unionT > 0) { this.unionStep(p); return; }
      const dx = p.cx - this.cx, dy = p.cy - this.cy, adx = Math.abs(dx), dist = hypot(dx, dy);
      // 掉隊 / 卡住 → 瞬移到卡比旁 + 煙（待命模式要留在崗位上，不瞬移）
      if (mode !== 'stay' && (dist > CFG.teleportDist || this.stuckT > CFG.stuckFrames)) { this.warpTo(p); return; }

      // ---- 目標：先找敵人 ----
      //   跟隨：96px 內，且自己離卡比不超過 leash 150px
      //   待命：96px 內，且敵人離「崗位」不超過 96px（不會被引走）
      //   突擊：200px 內，不管離卡比多遠
      let foe = null;
      if (mode === 'assault') foe = this.findFoe(CFG.assaultR);
      else if (mode === 'stay') {
        foe = this.findFoe(CFG.senseR);
        if (foe && Math.abs(foe.cx - this.anchorX) > CFG.senseR) foe = null;
      } else if (adx < CFG.leash) foe = this.findFoe(CFG.senseR);
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
        // 待命：離崗位太遠就不再追（打完自己走回去）
        if (mode === 'stay' && mv && Math.abs(this.cx + mv * 8 - this.anchorX) > CFG.stayLeash) { mv = 0; tgt = this; }
        if (mode === 'assault') fast = afd > CFG.assaultFast;
      } else if (mode === 'stay') {
        // 待命：回崗位站好（8px 內就不動）
        const adx0 = this.cx - this.anchorX;
        if (Math.abs(adx0) > 10) mv = adx0 > 0 ? -1 : 1;
        else mv = 0;
        tgt = { cx: this.anchorX, cy: this.anchorY };
      } else {
        // 跟隨（24~40px 之間維持原本的移動狀態，避免在邊界抖動）
        // 第 2 個夥伴（slot 1）跟得遠一點，兩人才不會疊在同一格上
        const near = CFG.followNear + this.slot * 12, far = CFG.followFar + this.slot * 12;
        if (adx > far) mv = dx > 0 ? 1 : -1;
        else if (adx < near) mv = 0;
        fast = adx > 110 || dy < -40;
      }
      this.mv = mv;
      // 突擊：追擊移動速度 ×1.3（R7-P2-07）
      const spd = (fast ? CFG.run : CFG.walk) * (mode === 'assault' && foe ? CFG.assaultSpd : 1);
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
        // R6-P2-05：dragon 夥伴＝飛行跟隨（空中一律漂浮，跟著卡比的高度走；追敵時照常落地才打得到）
        const fly = !!(this.simple && this.simple.fly) && !this.foe;
        const need = fly || tdy < -6 || (!ground && this.vy > 0.2);
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

    /** 半徑內最近的敵人 / 魔王（預設 96px；突擊模式 200px） */
    findFoe(r) {
      const g = this.game; let best = null, bd = r || CFG.senseR;
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
      H.remove(this);
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
      H.remove(this);
    }

    // ---------- 被卡比吸入 ----------
    pullTo(px, py, s) {
      const dx = px - this.cx, dy = py - this.cy, d = Math.max(1, hypot(dx, dy));
      this.x += dx / d * s; this.y += dy / d * s * 0.7;
    }
    onInhaled(p) {
      this.dead = true;
      p.mouth = { ability: this.ability, name: 'helper', score: 0 };
      H.remove(this);
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

    // =======================================================================
    //  Round 7（helper2）：淡入淡出 / 換房走門 / 合體技
    // =======================================================================
    /** alpha 往 alphaTo 收斂（換房淡出、新房淡入、重生） */
    stepFade() {
      if (this.alpha === this.alphaTo) return;
      const s = 1 / Math.max(1, CFG.fade), d = this.alphaTo - this.alpha;
      this.alpha += (d > 0 ? Math.min(s, d) : Math.max(-s, d));
      if (Math.abs(this.alphaTo - this.alpha) < 0.01) this.alpha = this.alphaTo;
    }

    /**
     * 換房：卡比進門的淡出期間（game.fadeDir > 0）游戲本體不更新實體，
     * 所以由 KB.Helper.tick 每幀呼叫這裡：夥伴走向門口（＝卡比位置）並跟著畫面一起淡出。
     */
    doorStep(p) {
      if (!p) return;
      this.stateT++;
      const dx = p.cx - this.cx;
      if (Math.abs(dx) > 4) {
        this.dir = dx < 0 ? -1 : 1;
        this.x += Math.max(-2.6, Math.min(2.6, dx));
        this.vx = this.dir * 1.6;                     // 只為了讓 currentAnim 走「走路」那格
      } else { this.vx = 0; this.state = 'idle'; }
      this.alphaTo = 0;
      this.stepFade();
      if (this.alpha <= 0.35 && !this._doorPoof) { this._doorPoof = true; KB.fx('fx_poof', this.cx, this.cy + 4); }
    }

    /** 在新房間（或重生點）現身：站到卡比身後 + 淡入 + 煙 */
    enterRoom(p, idx) {
      if (!p) return;
      this.game = KB.game;
      this.slot = idx === undefined ? this.slot : idx;
      this.cx = p.cx - (p.dir || 1) * (16 + this.slot * 14); this.bottom = p.bottom;
      this.vx = 0; this.vy = 0; this.stuckT = 0; this.floatT = 0; this.mv = 0; this.lastX = this.x;
      this.onGround = p.onGround; this.dir = p.dir || 1;
      this.anchorX = this.cx; this.anchorY = this.cy;
      this.unionT = 0; this.unionCast = 0;
      this._doorPoof = false;
      this.clampToRoom();
      this.alpha = 0; this.alphaTo = 1;
      KB.particles(this.cx, this.cy, ['#d0d0d8', '#ffffff'], 8, { spread: 1.8, grav: -0.02, life: 18 });
      KB.fx('fx_poof', this.cx, this.cy + 4);
    }

    /** 合體技：衝到玩家指定的一側 */
    unionStep(p) {
      this.unionT--;
      const tx = p.cx + this.unionDir * CFG.unionSide, dx = tx - this.cx;
      this.dir = -this.unionDir || 1;                 // 面向玩家外側（朝敵人）
      this.vx = Math.max(-5, Math.min(5, dx * 0.45));
      this.vy = Math.min(this.vy, 0.4);
      if (Math.abs(this.cy - p.cy) > 10) this.y += (p.cy - this.cy) * 0.35;
      this.mv = this.vx > 0 ? 1 : -1;
      if (Math.abs(dx) < 6 || this.unionT <= 0) { this.unionT = 0; this.unionFire(); }
    }

    /** 合體技的必殺：把 abilityData 蓄滿 → 放開（重用各能力自己的蓄力必殺）
     *  Round 10：合體衝擊框同樣不放大（無 follow、且合體技本來就是大招）。 */
    unionFire() {
      const d = this.abilityDef;
      this.dir = this.unionDir >= 0 ? 1 : -1;
      V('afterimage', this, { frames: 24, every: 2, color: (d && d.color) || '#a8d8f8', alpha: 0.45 });
      KB.particles(this.cx, this.cy, [(d && d.color) || '#a8d8f8', '#ffffff'], 10, { spread: 2.2, life: 20 });
      this.atkCool = 0;
      // 合體衝擊（兩側各一道）：必殺以外的保底傷害，確保「合體技」永遠打得到東西
      this.callDef(() => KB.hitbox({
        x: this.unionDir >= 0 ? this.cx : this.cx - 44, y: this.y - 10, w: 44, h: this.h + 20,
        dmg: 6, owner: 'player', type: 'union', life: 16, rehit: 0, pierce: true, knock: 3, breakBlocks: true,
      }));
      V('shockwave', this.cx, this.bottom, { dir: this.dir, speed: 3.6, w: 14, h: 18, frames: 22, color: (d && d.color) || '#ffe040' });
      this.unionCast = CFG.unionCast;
      if (!this.useAbility(this.findFoe(CFG.assaultR))) this.unionCast = 0;
    }

    /** 蓄力加速：每幀把各能力的蓄力欄位灌滿，unionCast 用完就「放開」→ 必殺 */
    stepUnionCast() {
      if (this.unionCast <= 0) return;
      this.unionCast--;
      const ad = this.abilityData;
      this.stateT += 3;                               // 以 stateT 當門檻的能力（beam / ice…）
      if (ad) {
        if (typeof ad.charge === 'number') ad.charge += 8;
        ad.charged = true; ad.ready = true; ad.full = true;
      }
      this.holdT = Math.max(this.holdT, 2);
      if (this.unionCast <= 0) { this.holdT = 0; this.keys.attack = false; }   // 放開 → 觸發必殺
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
      if (this.alpha <= 0.02) return;                         // 換房淡出完畢
      if (this.invuln > 0 && (this.invuln & 2)) return;       // 受傷閃爍
      const [anim, fps] = this.currentAnim();
      const wob = this.beingInhaled ? (Math.floor(this.t * 60 / 4) % 2 ? 2 : -2) : 0;
      const a = this.alpha < 1 ? this.alpha : undefined;
      const opts = { flip: this.dir < 0, fps, t: this.stateT / 60 };
      if (a !== undefined) opts.alpha = a;
      if (this.state === 'idle') opts.frame = (this.stateT % 200) > 190 ? 1 : 0;
      const sm = this.scaleMul || 1;                                  // R6-P2-05：giant 夥伴放大 1.5 倍
      if (sm !== 1) { opts.scaleX = sm; opts.scaleY = sm; }
      g.spr(KB.has(anim) ? anim : 'helper_idle', this.cx + wob, this.bottom, opts);
      // 能力帽子（重用 hat_<key>，縮到 0.78 倍）
      const d = this.abilityDef, hat = (d && d.hat) || ('hat_' + this.ability);
      if (this.ability && KB.has(hat)) {
        const hs = CFG.hatScale * sm;
        const ho = { flip: this.dir < 0, t: this.t, scaleX: hs, scaleY: hs };
        if (a !== undefined) ho.alpha = a;
        g.spr(hat, this.cx + wob, this.y + 1 - Math.round((sm - 1) * this.h), ho);
      }
      this.drawHpBar(g, wob);
      this.drawModeIcon(g, wob);
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,200,255,0.3)');
    }
    /** 頭上的指令小圖示（1 幀：跟隨綠三角 / 待命藍盾 / 突擊紅劍） */
    drawModeIcon(g, wob) {
      if (this.alpha < 0.6) return;
      const m = MODE_BY_ID[H.mode] || MODES[0];
      const hat = this.ability && KB.has((this.abilityDef && this.abilityDef.hat) || ('hat_' + this.ability));
      const x = Math.round(this.cx + (wob || 0)), y = Math.round(this.y - (hat ? 20 : 14) - (this.slot ? 5 : 0));
      // 剛換指令的 20 幀：圖示外圍閃一圈模式色（取代原本每人一份的 textPop）
      if (this.modeFlash > 0) {
        this.modeFlash--;
        if (this.modeFlash & 2) g.rect(x - 5, y - 5, 10, 10, m.color);
      }
      if (KB.has(m.icon)) g.spr(m.icon, x, y, this.alpha < 1 ? { alpha: this.alpha } : {});
      else { g.rect(x - 3, y - 3, 6, 6, '#101828'); g.rect(x - 2, y - 2, 4, 4, m.color); }
    }
    /** 頭上的 4 格小血條（HUD 版本見 KB.Helper.drawHUD） */
    drawHpBar(g, wob) {
      if (this.alpha < 0.6) return;                          // 淡出 / 淡入中不畫小血條
      const n = this.maxHp, bw = 3, gap = 1, tw = n * bw + (n - 1) * gap;
      const hat = this.ability && KB.has((this.abilityDef && this.abilityDef.hat) || ('hat_' + this.ability));
      // 第 2 個夥伴的血條再往上 5px：兩人站在一起時兩條 4~7 格的血條才不會連成一條
      const x0 = Math.round(this.cx + (wob || 0) - tw / 2), y0 = Math.round(this.y - (hat ? 13 : 7) - (this.slot ? 5 : 0));
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
    CFG, Entity: Helper, ReturnStar, MODES, MAX: CFG.maxHelpers,
    list: [],                    // 夥伴（最舊的在前）；current === list[0]（舊介面相容）
    mode: 'follow',              // 指令模式：follow / stay / assault
    unionCD: 0,                  // 合體技冷卻（幀）
    exists() { return H.all().length > 0; },
    /** 目前活著的夥伴（順序＝生成順序，最舊在前） */
    all() {
      if (H.list.some(h => !h || h.dead)) H.list = H.list.filter(h => h && !h.dead);
      return H.list;
    },
    count() { return H.all().length; },
    /** get() 取最舊的夥伴；get(i) 取第 i 個 */
    get(i) { const l = H.all(); return l[i || 0] || null; },
    full() { return H.count() >= H.MAX; },
    /** 從名單移除（die / vanish / 被吸入時呼叫） */
    remove(h) {
      const i = H.list.indexOf(h);
      if (i >= 0) H.list.splice(i, 1);
      H.list.forEach((e, n) => { e.slot = n; });
    },

    // ---------------------------------------------------------------- 指令
    modeDef(id) { return MODE_BY_ID[id || H.mode] || MODES[0]; },
    /** 切換指令（對所有夥伴同時生效）；quiet 為 true 時不跳 toast */
    setMode(id, quiet) {
      const m = MODE_BY_ID[id]; if (!m) return false;
      H.mode = m.id;
      for (const h of H.all()) {
        h.anchorX = h.cx; h.anchorY = h.cy;      // 待命：以「切換當下的位置」為崗位
        h.foe = null; h.mv = 0; h.stuckT = 0;
        h.modeFlash = 20;                        // 頭上的指令圖示閃一下（圖示本身每幀都在畫）
      }
      // R7-P1-03：模式是兩個夥伴共用的，textPop 只發一次（發在玩家頭上）。
      // 原本每個夥伴各發一次，兩人只差 14px 而字寬 40+px，會疊成「ASSAUULT」之類的亂碼。
      const pl = KB.player || (KB.game && KB.game.player);
      const src = pl || H.get(0);
      if (src) V('textPop', src.cx, src.y - 18, m.hud, { color: m.color, size: 8, frames: 30, rise: 8, outline: '#182038' });
      const g = KB.game;
      if (!quiet && g && g.toast) g.toast('夥伴指令：' + m.name);
      if (!quiet) sfx('menu', 'jump');
      return true;
    },
    cycleMode() {
      const i = MODES.findIndex(m => m.id === H.mode);
      return H.setMode(MODES[(i + 1 + MODES.length) % MODES.length].id);
    },

    /**
     * 長按 SELECT 的入口。
     *   還沒滿 2 人 + 卡比有能力 → 生成夥伴（卡比失去能力但不掉能力星），回傳 true
     *   已經 2 人（或卡比沒能力而有夥伴）→ 吸回最舊的那個，回傳 true
     *   其他                     → false（player.js 這時可以照原本流程丟能力星）
     */
    spawn(p) {
      p = p || KB.player;
      const g = KB.game;
      if (!p || !g || p.state === 'dead') return false;
      H._acted = g.frame;
      const key = p.ability;
      // 已經滿員 → 吸回最舊的；沒能力可交出去也只能吸回
      if (H.full() || !key || !KB.ABILITIES[key]) return H.exists() ? H.recall(p) : false;
      const def = KB.ABILITIES[key];
      // 卡比失去能力（不掉能力星）：與 player.dropAbility 相同的清理，只是不生成 abilitystar
      try { if (def.onLose) def.onLose(p); } catch (e) { }
      try { if (p.form && p.clearForm) p.clearForm(); } catch (e) { }
      p.ability = null; p.abilityData = {};
      if (p.state === 'attack' || p.state === 'stone') p.setState(p.onGround ? 'idle' : 'fall');
      if (p.stoneBox) { p.stoneBox.dead = true; p.stoneBox = null; }
      const h = new Helper(p, key, H.count());
      KB.spawn(h); H.list.push(h);
      h.summonFx();
      if (def.onGet) h.callDef(() => def.onGet(h));
      if (g.toast) g.toast(H.count() >= 2 ? '夥伴登場！（2 人）' : '夥伴登場！');
      return true;
    },

    /** 吸回：夥伴變回能力星飛向卡比，卡比重新取得該能力（預設吸回最舊的那個） */
    recall(p, which) {
      p = p || KB.player;
      const h = which || H.get(), g = KB.game;
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
    /** 全部吸回（能力依序飛回卡比；卡比手上有能力時多的會落地成能力星） */
    recallAll(p) { let n = 0; for (const h of H.all().slice()) if (H.recall(p, h)) n++; return n; },

    /** 移除夥伴（不留能力星）：換關 / 卡比死亡 */
    clear() {
      for (const h of H.list.slice()) if (h) h.vanish(false);
      H.list = []; H._respawn = null;
    },

    /**
     * 每幀維護：換房後把夥伴帶到新房間、SELECT 長按的相容路徑。
     * progression agent 請在 GameScene.update 末端呼叫；同一幀重複呼叫只會生效一次。
     */
    tick(game) {
      game = game || KB.game;
      if (!game) { H.list = []; return; }
      if (H._tickFrame === game.frame && H._tickGame === game) return;
      H._tickFrame = game.frame; H._tickGame = game;
      if (H.unionCD > 0) H.unionCD--;
      const p = game.player;
      // ---- 換房：卡比進門的淡出期間（game 本體不更新實體）→ 夥伴自己走到門口 + 淡出 ----
      if (game.fadeDir > 0) {
        for (const h of H.all()) if (game.entities.indexOf(h) >= 0) h.doorStep(p);
        return;
      }
      for (const h of H.all().slice()) {
        if (h.game !== game) { H.remove(h); continue; }
        if (game.entities.indexOf(h) >= 0) continue;
        // loadRoom 會把 entities 清空 → 夥伴跟著卡比進新房間（走完門後在這裡現身）
        if (p && p.state !== 'dead') { game.entities.push(h); h.enterRoom(p, H.list.indexOf(h)); }
        else H.remove(h);
      }
      H.checkRespawn(game);
      H.pollSelect(game);
    },

    // ------------------------------------------------- 卡比死亡 → 重生點帶著能力回來
    /** 卡比死亡當下把夥伴的能力記下來（helper.update 呼叫，同一次死亡只記一次） */
    rememberRespawn(game, p) {
      if (H._respawn && H._respawn.player === p) return;
      const keys = H.all().map(h => h.ability).filter(k => k);
      if (!keys.length) return;
      H._respawn = { keys, player: p, game };
    },
    /** 新的卡比出現（playerDied → loadRoom 會重建 Player）→ 在重生點重新生成夥伴 */
    checkRespawn(game) {
      const r = H._respawn;
      if (!r || r.game !== game) return;
      const p = game.player;
      if (!p || p === r.player || p.state === 'dead') return;
      H._respawn = null;
      for (const key of r.keys) {
        if (H.full() || !KB.ABILITIES[key]) break;
        const h = new Helper(p, key, H.count());
        KB.spawn(h); H.list.push(h);
        const def = KB.ABILITIES[key];
        if (def && def.onGet) h.callDef(() => def.onGet(h));
        h.enterRoom(p, h.slot);
      }
      if (H.count() && game.toast) game.toast('夥伴歸隊！');
      if (H.count()) sfx('clone_summon', 'ability');
    },

    // ------------------------------------------------------------------ 合體技
    /** 兩個夥伴都在、都不在攻擊中、冷卻結束 → 可以放合體技 */
    canUnion(p) {
      p = p || KB.player;
      const l = H.all();
      if (!p || p.state === 'dead' || H.unionCD > 0 || l.length < H.MAX) return false;
      return l.every(h => h.state !== 'attack' && h.state !== 'hurt' && !h.unionT && !h.beingInhaled && h.alpha >= 0.9);
    },
    /** 合體技：兩夥伴衝到玩家兩側 → 同時放各自能力的必殺 */
    union(p) {
      p = p || KB.player;
      if (!H.canUnion(p)) return false;
      const g = KB.game;
      H.unionCD = CFG.unionCD;
      H._acted = g ? g.frame : 0;
      const l = H.all();
      l.forEach((h, i) => {
        h.unionDir = i === 0 ? -1 : 1;
        h.unionT = CFG.unionDash;
        h.setState(h.onGround ? 'idle' : 'fall');
        h.atkCool = 0;
      });
      V('letterbox', 80); V('hitstop', 6); V('shake', 6); V('zoom', 1.12, 12);
      V('flash', '#ffffff', 8, 0.5);
      V('ring', p.cx, p.cy, { r0: 4, r1: 52, frames: 20, color: '#ffe040', width: 3 });
      V('ring', p.cx, p.cy, { r0: 10, r1: 34, frames: 14, color: '#ffffff', width: 2 });
      V('textPop', p.cx, p.cy - 26, '合體技!', { color: '#ffe040', size: 12, frames: 60, rise: 12, outline: '#182038' });
      KB.particles(p.cx, p.cy, ['#ffe040', '#ffffff', '#a8d8f8'], 18, { spread: 3, life: 26 });
      sfx('ultimate', 'clone_summon');
      // 「合體技!」已經用 textPop 畫在玩家頭上（世界座標），不再發 toast，避免上下兩行同樣的字
      return true;
    },

    /** 組合鍵吃掉這次 SELECT：否則 player.js 會在放開時把它當成「短按 → 丟掉能力」 */
    eatSelect(p) {
      if (p && p.selectHoldT !== undefined) { p.selectHoldT = 0; p.selectLock = true; }
      H._sel = 0; H._star = null;
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
      if (!p || !inp || game.paused || game.clearT >= 0 || p.state === 'dead') {
        H._sel = 0; H._star = null; H._cmdHeld = false; H._uniHeld = false; return;
      }
      // ---- Round 7：↑＋SELECT 切換指令 / ↓＋SELECT 合體技（player.js 不歸本 agent 管 → 自己讀 KB.input）----
      // 組合鍵按下的當幀把 player.js 的 SELECT 計時歸零並上鎖，否則放開時會被當成「短按 → 丟掉能力」。
      const sel = inp.down('select');
      const cmd = sel && inp.down('up'), uni = sel && inp.down('down');
      if (cmd && !H._cmdHeld) { H.cycleMode(); H.eatSelect(p); }
      if (uni && !H._uniHeld) { if (H.union(p)) H.eatSelect(p); else if (H.count() >= H.MAX) H.eatSelect(p); }
      H._cmdHeld = cmd; H._uniHeld = uni;
      if (cmd || uni) { H._sel = 0; H._star = null; return; }
      if (!sel) { H._sel = 0; H._star = null; return; }
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
      if (!ctx || !game) return;
      const list = H.all().filter(h => h.game === game);
      if (!list.length) return;
      // 魔王血條（x66~156）右側、生命數（x217~251）左側；分數列（y197~205）下方 → 每人 8px 一列
      const x = 158, y0 = 205, rowH = 8, mode = H.modeDef();
      KB.rect(ctx, x - 2, y0, 52, 2 + rowH * list.length + 1, '#0e1220');
      KB.rect(ctx, x - 2, y0, 52, 1, '#384058');
      list.forEach((h, i) => {
        const y = y0 + 1 + i * rowH;
        if (KB.has('ui_helper_face')) KB.drawSpr(ctx, 'ui_helper_face', x + 4, y + 4, {});
        else KB.rect(ctx, x, y, 8, 8, '#a8d8f8');
        // 能力小圖示
        const icon = 'ui_ability_' + h.ability + '_mini';
        // R7-P2-04：mini 圖示錨點是 bottom（8×8），畫在 y+4 會往上戳出面板 3px → 改成 y+8（與小臉同一帶）
        if (KB.has(icon)) KB.drawSpr(ctx, icon, x + 13, y + 8, {});
        // HP（依等級 4~7 格，寬度固定在面板內）
        const n = Math.max(1, h.maxHp), bw = n >= 6 ? 3 : 4, gap = 1, bx = x + 19;
        for (let k = 0; k < n; k++) {
          const px = bx + k * (bw + gap);
          KB.rect(ctx, px, y + 1, bw, 6, '#202838');
          KB.rect(ctx, px, y + 2, bw, 4, k < h.hp ? (h.hp <= 1 && ((game.frame >> 3) & 1) ? '#ffffff' : '#70e070') : '#485068');
        }
      });
      // 指令模式（兩人共用）：面板右緣一條色帶（圖示畫在夥伴頭上，HUD 這裡只留顏色，不跟 7 格 HP 搶空間）
      KB.rect(ctx, x + 47, y0 + 2, 2, rowH * list.length - 2, mode.color);
      // 合體技就緒（2 人 + CD 結束）：面板外框閃金色
      if (list.length >= H.MAX && H.unionCD <= 0 && ((game.frame >> 3) & 1)) {
        const hgt = 2 + rowH * list.length + 1;
        KB.rect(ctx, x - 2, y0, 52, 1, '#ffe040'); KB.rect(ctx, x - 2, y0 + hgt - 1, 52, 1, '#ffe040');
      }
    },
  };

  // 舊介面相容：H.current === 最舊的夥伴（Round 6 的程式碼 / 測試都讀這個欄位）
  Object.defineProperty(H, 'current', {
    get() { return H.get(); },
    set(v) { if (!v) H.list = []; else if (H.list.indexOf(v) < 0) H.list = [v]; },
  });

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
