// 卡比 —— 玩家狀態機
(function () {
  const P = KB.PHYS, T = KB.TILE;
  // Round 6（mix）：SELECT 長按門檻（幀）。按住 ≥ 這個幀數放開 → 呼叫夥伴（KB.Helper.spawn）；
  //   短於這個幀數 → 維持原本的「丟棄能力」。不動 KB.PHYS（那是 player-feel 的檔案）。
  const SELECT_HOLD = 45;
  KB.HAT_OFFSET = { default: [0, 0], crouch: [0, -1], slide: [2, 1], full: [0, -1], float: [0, -2],
    inhale: [0, -1], spit: [0, -1], swallow: [0, -1], exhale: [0, -1], dance: [0, -1],
    swim: [2, 1], hurt: [0, 0], climb: [0, 0], attack: [0, 0], ride: [0, -2],
    stone: [0, 99], door: [0, 99], dead: [0, 99] };

  class Player extends KB.Entity {
    constructor(x, y) {
      super(x, y);
      this.type = 'player'; this.w = 14; this.h = 15; this.z = 3; this.stepH = 8;
      // Extra 模式（KB.session.extra）：最大 HP 3
      this.maxHp = (KB.session && KB.session.extra) ? P.extraMaxHp : KB.MAX_HP;
      this.hp = this.maxHp;
      this.state = 'idle'; this.stateT = 0;
      this.ability = null; this.mouth = null; this.abilityData = {};
      this.attackTimer = 0; this.attackLock = false; this.hurtTimer = 0; this.slideT = 0;
      this.running = false; this.lastTapDir = 0; this.tapT = 0;
      this.flipT = 0; this.jumped = false; this.jumpHold = 0;
      this.invincibleT = 0; this.stoneT = 0; this.mouthFull = false;
      this.inhaleT = 0; this.floatFrame = 0; this.floatAnimT = 0;
      this.ctl = true;        // 是否接受輸入
      this.deadT = 0; this.doorT = 0; this.doorTarget = null; this.danceT = 0;
      this.inWater = false; this.wasInWater = false;
      this.inhaleFx = null; this.anim = 'kirby_idle'; this.animT = 0; this.animFps = null;
      this.hitboxes = [];
      this.faceAnimCache = null; this.landT = 0;
      // 手感輔助
      this.coyoteT = 0; this.jumpBufT = 0; this.dustCd = 0; this.skidT = 0;
      this.exhaleLockT = 0; this.hurtFlashT = 0; this.dropT = 0; this.dropThrough = false;
      this.slideBounceT = 0; this.slideBox = null; this.landImpact = 0;
      // Round 2：游泳 / 騎星 / 梯子
      this.bubbleT = 0; this.swimInhaleT = 0; this.swimActT = 0;
      this.ridePath = null; this.rideIdx = 0; this.rideT = 0; this.rideVx = 0; this.rideVy = 0;
      this.rideArrive = null; this.rideStuck = 0; this.rideLastD = 1e9;
      this.climbTopT = 0; this.ladderAtkT = 0;
      // Round 5（forms）：整體變身。詳見 setForm()
      this.form = null; this.sizeMul = 1; this.possessed = null;
      // Round 6（mix）：SELECT 按住幀數（放開時決定「丟棄能力」還是「呼叫夥伴」）
      this.selectHoldT = 0; this.selectLock = false;
      // Round 9（player-input）：按住 ↑ ＝ 飛行 / 出招方向快照
      this.flyHoldT = 0;      // ↑ 連續按住幀數（每幀維護；放開歸零）
      this.flyFlapT = 0;      // 漂浮中自動拍動計時
      this.flyFlapN = 0;      // 自動拍動次數（音效節流用）
      this.swimUpN = 0;       // fix9：水中按住 ↑ 的輕划次數（音效節流用）
      this.dirHold = { up: false, down: false };                 // 每幀方向鍵狀態（hold 型招式讀）
      this.atkDir = { up: false, down: false, air: false };      // startAttack 當幀的方向快照
      this.name = 'kirby';
    }

    // ---------- 狀態 ----------
    setState(s) {
      if (this.state === s) return;
      const prev = this.state;
      if (prev === 'attack' && s !== 'attack') { const d = this.abilityDef; if (d && d.onEnd) d.onEnd(this); }
      this.state = s; this.stateT = 0; this.animT = 0;
      if (prev === 'crouch' || prev === 'slide') this.setCrouchBox(false);
      if (prev === 'slide' && this.slideBox) { this.slideBox.dead = true; this.slideBox = null; }
      if (s === 'crouch' || s === 'slide') this.setCrouchBox(true);
      if (s !== 'inhale') this.stopInhale();
      if (s !== 'attack' && s !== 'stone') { this.attackLock = false; this.attackTimer = 0; }
      if (s === 'float') { this.floatAnimT = 0; }
    }
    setCrouchBox(on) {
      const nb = Math.round((on ? 9 : 15) * this.formScale); const b = this.bottom; this.h = nb; this.bottom = b;
    }

    // ---------- 整體變身（Round 5 forms）----------
    // p.form = null | {
    //   key      能力 key（純資訊）
    //   scale    體型倍率：繪製用 g.spr 的 scaleX/scaleY（錨點＝底部中央），碰撞框 w/h/stepH 等比例（bottom 不變）
    //   noclip   不與磁磚碰撞（physics 改為直接位移 + clamp 在房間內，不會掉出地圖）
    //   fly      飛行：忽略重力（由 def.formUpdate 控制 vy），空中按跳不會變成漂浮
    //   armor    裝甲減傷：hurt(amount) 改扣 form.hp（扣 max(1, amount-armor)），不扣 HP、不掉能力；form.hp 歸零 → breakArmor()
    //   hp       裝甲值
    //   alpha / hidden  繪製透明度 / 完全不畫本體（附身用）
    //   inhaleAll 吸入時忽略敵人的 inhalable（巨大化可直接吞中魔王）
    //   spr(p, anim, opts)  整體替換精靈：回傳精靈名稱（可順便改寫 opts.frame / opts.fps）
    //   draw(g, p)          本體之後的額外繪製（翅膀 / 噴射火 / 幽靈殘影…）
    // 每幀鉤子：KB.ABILITIES[key].formUpdate(p)，回傳 true 代表本幀由變身完全接管（附身）。
    get formScale() { const f = this.form; return f && f.scale ? f.scale : 1; }
    /** 設定 / 清除變身；碰撞框依 scale 等比例調整（保持 bottom 與 cx 不變） */
    setForm(f) {
      const cx = this.cx, b = this.bottom;
      this.form = f || null;
      const s = this.formScale;
      const crouched = (this.state === 'crouch' || this.state === 'slide');
      this.w = Math.round(14 * s); this.h = Math.round((crouched ? 9 : 15) * s); this.stepH = Math.round(8 * s);
      this.cx = cx; this.bottom = b;
      this.sizeMul = s;
      if (!this.form) { this.solid = true; this.grav = P.grav; this.maxFall = P.maxFall; }
      this.clampToRoom();
      return this.form;
    }
    /** 解除變身（含 KB.VFX.untransform 演出） */
    clearForm(quiet) {
      if (!this.form) return;
      const key = this.form.key;
      this.possessed = null;
      this.setForm(null);
      if (!quiet) { try { if (KB.VFX && KB.VFX.untransform) KB.VFX.untransform(this, key); } catch (e) { } }
    }
    /** 裝甲被打光：armor_break → 解除變身並失去能力 */
    breakArmor() {
      KB.audio.sfx('armor_break');
      KB.particles(this.cx, this.cy, ['#ffffff', '#c0c8d8', '#889098', '#ffe040'], 16, { spread: 3, life: 30 });
      if (KB.game) { KB.game.shake = Math.max(KB.game.shake || 0, 7); }
      this.clearForm();
      this.dropAbility(false);
    }
    /** 夾在房間內（noclip / 變大時不掉出地圖） */
    clampToRoom() {
      const map = KB.game && KB.game.map; if (!map) return;
      if (this.x < 0) { this.x = 0; if (this.vx < 0) this.vx = 0; }
      if (this.x + this.w > map.pw) { this.x = map.pw - this.w; if (this.vx > 0) this.vx = 0; }
      if (this.y < 0) { this.y = 0; if (this.vy < 0) this.vy = 0; }
      // 底部留 1 格（fix5b / R5-P1-02）：原本只夾到房間框（bottom ≤ ph），幽靈按住 ↓ 會沉進最底下那排
      // 地板磁磚裡，noclip 一到期人就在地形外 → 直接墜落 state=dead。房間最底一排一律當成「不可進入」。
      const maxB = map.ph - T;
      if (this.bottom > maxB) { this.bottom = maxB; if (this.vy > 0) this.vy = 0; }
    }
    physics() {
      const f = this.form;
      if (f && f.noclip) {
        // 穿牆模式：完全不與磁磚碰撞，只夾在房間內
        this.hitWall = false; this.hitCeil = false; this.onSlope = false;
        if (this.grav) this.vy = Math.min(this.vy + this.grav, this.maxFall !== undefined ? this.maxFall : KB.MAXFALL);
        this.x += this.vx; this.y += this.vy;
        const map = KB.game && KB.game.map;
        this.clampToRoom();
        this.onGround = !!(map && this.bottom >= map.ph - T - 0.5);
        this.fellOut = false;
        return;
      }
      super.physics();
    }
    get full() { return !!this.mouth; }
    get airborne() { return !this.onGround; }
    get canControl() { return this.ctl && !['dead', 'door', 'dance', 'hurt', 'ride'].includes(this.state); }
    get abilityDef() { return this.ability ? KB.ABILITIES[this.ability] : null; }
    get invincible() { return this.invincibleT > 0 || this.state === 'ride'; }
    isAttackState() { return this.state === 'attack'; }

    // ---------- 主更新 ----------
    update(dt) {
      this.baseUpdate(dt);
      this.stateT++;
      if (this.invincibleT > 0) { this.invincibleT--; if (this.invincibleT === 0 && KB.game) KB.game.resumeMusic(); }
      if (this.landT > 0) this.landT--;
      const map = KB.game.map, inp = KB.input;
      // ---- 手感計時器：coyote time / jump buffer / 其他 ----
      if (this.onGround && this.state !== 'dead' && this.state !== 'door') this.coyoteT = P.coyote;
      else if (this.coyoteT > 0) this.coyoteT--;
      if (inp.pressed('jump')) this.jumpBufT = P.jumpBuffer;
      else if (this.jumpBufT > 0) this.jumpBufT--;
      if (this.exhaleLockT > 0) this.exhaleLockT--;
      if (this.hurtFlashT > 0) this.hurtFlashT--;
      if (this.dustCd > 0) this.dustCd--;
      if (this.skidT > 0) this.skidT--;
      if (this.dropT > 0) { this.dropT--; this.dropThrough = true; } else this.dropThrough = false;
      if (this.climbTopT > 0) this.climbTopT--;
      if (this.ladderAtkT > 0) this.ladderAtkT--;
      if (this.swimActT > 0) this.swimActT--;
      // ---- Round 9：方向鍵狀態（hold 型招式讀 p.dirHold）與 ↑ 連續按住幀數（飛行用）----
      const upDown = inp.down('up'), dnDown = inp.down('down');
      this.dirHold.up = upDown; this.dirHold.down = dnDown;
      if (upDown) this.flyHoldT++; else { this.flyHoldT = 0; this.flyFlapT = 0; this.flyFlapN = 0; }
      this.wasInWater = this.inWater;
      this.inWater = map.inWater(this.cx, this.cy);
      // 入水 / 出水水花
      if (this.inWater !== this.wasInWater && this.state !== 'dead' && this.state !== 'door') {
        this.waterSplash(this.inWater);
        if (this.inWater) this.bubbleT = 0;
      }

      // ---- 變身能力補初始化：能力可能被外部直接指派（game.js 的 opts.ability / 競技場 / 除錯），
      //      沒有經過 giveAbility → 這裡補呼叫一次 onGet，變身才會生效（一般能力不受影響）----
      if (this.ability !== this._abilityKey) {
        this._abilityKey = this.ability;
        const nd = this.abilityDef;
        if (nd && nd.transform && !this.form && nd.onGet) { try { nd.onGet(this); } catch (e) { } }
      }
      // ---- 變身鉤子（Round 5 forms）：每幀呼叫 def.formUpdate(p)；回傳 true = 本幀由變身接管 ----
      if (this.form && this.state !== 'dead' && this.state !== 'door') {
        const fd = this.abilityDef;
        if (fd && fd.formUpdate && fd.formUpdate(this) === true) return;
      }

      switch (this.state) {
        case 'dead': this.updateDead(); return;
        case 'door': this.updateDoor(); return;
        case 'dance': this.vx = 0; this.physics(); return;
        case 'hurt': this.updateHurt(); return;
        case 'stone': this.updateStone(); return;
        case 'climb': this.updateClimb(); return;
        case 'ride': this.updateRide(); return;
      }
      if (this.inWater && this.state !== 'swim' && this.state !== 'attack') { this.setState('swim'); this.vy = Math.min(this.vy, 1); }
      if (!this.inWater && this.state === 'swim') this.setState('fall');
      if (this.state === 'swim') { this.updateSwim(); return; }

      // 攻擊狀態（能力）
      if (this.state === 'attack') { this.updateAttack(); return; }
      if (this.state === 'inhale') { this.updateInhale(); return; }
      if (this.state === 'spit' || this.state === 'swallow' || this.state === 'exhale') {
        const wasExhale = this.state === 'exhale';
        this.vx *= 0.8; this.physics();
        if (this.stateT > 14) {
          if (wasExhale) this.exhaleLockT = P.exhaleLock;   // 吐氣結束後仍有 8 幀不能再漂浮
          this.setState(this.onGround ? 'idle' : 'fall');
        }
        return;
      }
      if (this.state === 'slide') { this.updateSlide(); return; }
      if (this.state === 'float') { this.updateFloat(); return; }

      // ---- 一般地面 / 空中 ----
      const left = inp.down('left'), right = inp.down('right'), dirIn = (right ? 1 : 0) - (left ? 1 : 0);
      const speed = this.full ? P.fullWalk : (this.running ? P.run : P.walk);
      // 雙擊跑步
      if (inp.pressed('left') || inp.pressed('right')) {
        const d = inp.pressed('right') ? 1 : -1;
        if (this.lastTapDir === d && this.tapT > 0 && this.onGround && !this.full) this.running = true;
        this.lastTapDir = d; this.tapT = 14;
      }
      if (this.tapT > 0) this.tapT--;
      if (dirIn === 0 && this.onGround) this.running = false;
      // 起跑 / 急轉身煞車：腳下揚塵
      if (this.onGround && dirIn !== 0 && this.dustCd <= 0) {
        if (Math.sign(this.vx) === -dirIn && Math.abs(this.vx) > 1.0) { this.skidT = 6; this.footDust(5, -dirIn, 1.4); this.dustCd = 4; }
        else if (Math.abs(this.vx) < 0.12) { this.footDust(3, -dirIn); this.dustCd = 12; }
      }
      if (dirIn !== 0) {
        this.dir = dirIn;
        const acc = this.onGround ? P.accel : P.airAccel;
        if (Math.abs(this.vx) < speed || Math.sign(this.vx) !== dirIn) this.vx += dirIn * acc * (this.onGround ? 1 : 1);
        if (Math.abs(this.vx) > speed) this.vx = Math.max(-speed, Math.min(speed, this.vx * 0.9 + dirIn * speed * 0.1));
      } else {
        if (this.onGround) { this.vx *= (1 - P.friction); if (Math.abs(this.vx) < 0.1) this.vx = 0; }
        else this.vx *= 0.98;
      }

      // 門 / 梯子
      if (inp.pressed('up') && this.onGround) {
        const door = KB.game.doorAt(this); if (door) { this.enterDoor(door); return; }
      }
      if (!this.full) {
        if (inp.down('up') && map.onLadder(this.cx, this.cy)) { this.startClimb(); return; }
        if (inp.down('down') && map.onLadder(this.cx, this.bottom + 1) && !map.onLadder(this.cx, this.cy)) { this.startClimb(); this.y += 2; return; }
        if (inp.down('down') && !this.onGround && map.onLadder(this.cx, this.cy)) { this.startClimb(); return; }
      }

      // Round 7（awaken）：跳 + 攻擊（同幀或 3 幀內先後）且覺醒量表滿 → 覺醒。
      //   KB.AWAKEN.tryTrigger 只有在「真的發動覺醒」時才回 true；未 Lv4 / 量表沒滿一律回 false，
      //   所以跳 + 攻擊在平常完全是原本的普通跳躍與普通攻擊（engine_test 的既有行為不受影響）。
      if (KB.AWAKEN && KB.AWAKEN.tryTrigger && KB.AWAKEN.tryTrigger(this)) return;

      // 蹲下 / 滑鏟
      if (this.onGround && inp.down('down') && !this.full) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.vx *= 0.7;
        // ↓+跳：站在單向平台上＝穿下去；實心地面＝滑鏟
        if (this.jumpBufT > 0) {
          this.jumpBufT = 0;
          if (KB.physics.onPlatformOnly(map, this)) { this.dropDown(); return; }
          this.startSlide(); return;
        }
        // Round 9：蹲下 + 攻擊。def 有 onCrouchAttack 就走原本的路徑（既有 ↓+X 招式不變）；
        //   沒有的話一律走 startAttack，由 abilities 內部讀 p.atkDir.down 決定要放哪一招。
        if (inp.pressed('attack') && this.abilityDef) {
          const cd = this.abilityDef;
          if (cd.onCrouchAttack) cd.onCrouchAttack(this);
          else { this.startAttack(); return; }
        }
        this.physics(); return;
      } else if (this.state === 'crouch') this.setState('idle');

      // 跳躍（coyote time + jump buffer）
      if (this.jumpBufT > 0 && (this.onGround || this.coyoteT > 0)) {
        this.doJump();
      } else if (inp.pressed('jump') && !this.onGround && !this.full && this.exhaleLockT <= 0 && !(this.form && this.form.fly) && !this.landingSoon()) {
        this.startFloat(); return;
      }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }

      // 攻擊鍵
      if (inp.pressed('attack')) {
        if (this.full) { this.spit(); return; }
        if (this.ability) { this.startAttack(); return; }
        this.setState('inhale'); this.inhaleT = 0; KB.audio.sfx('inhale'); this.updateInhale(); return;
      }
      if (inp.down('attack') && !this.full && !this.ability && this.state !== 'inhale' && this.stateT > 2 && !inp.pressed('jump')) {
        // 按住攻擊鍵持續吸
        this.setState('inhale'); this.inhaleT = 0; this.updateInhale(); return;
      }
      // 吞下
      if (this.full && inp.pressed('down')) { this.swallow(); return; }
      // 丟棄能力 / 長按 select 呼叫夥伴（Round 6：helper agent 實作 KB.Helper）
      //   短按（放開時 selectHoldT < 45）＝原本的「丟棄能力 → 掉能力星」；
      //   長按 45 幀以上放開 → KB.Helper.spawn(p)：沒有夥伴就把能力變成夥伴、已經有夥伴就吸回；
      //   回傳 true 代表夥伴系統接手了，這裡不再丟能力。
      //   ※ 能力交給夥伴後 this.ability 是 null，所以「有夥伴時」也要繼續累加 selectHoldT（才能長按吸回）。
      //   ※ fix6（QA R6-P1-02）：一次按住只處理一次。長按吸回時，夥伴在第 45 幀就變回能力星飛走，
      //     下一幀 selOk 會變 false（沒能力也沒夥伴）→ 舊版會立刻結算一次，等能力星飛回來又從 0 開始數，
      //     於是玩家只是「還按著」就被當成新的短按，把剛拿回的能力又丟出去。
      //     改成結算後上鎖（selectLock），一定要放開 SELECT 才會開始數下一次。
      const selDown = inp.down('select');
      if (!selDown) this.selectLock = false;
      const selOk = !!(this.ability || (KB.Helper && KB.Helper.exists && KB.Helper.exists()));
      if (selDown && selOk && !this.selectLock) this.selectHoldT++;
      else if (this.selectHoldT > 0) {
        const held = this.selectHoldT; this.selectHoldT = 0;
        if (selDown) this.selectLock = true;
        let toHelper = false;
        if (held >= SELECT_HOLD) {
          try { toHelper = !!(KB.Helper && KB.Helper.spawn && KB.Helper.spawn(this) === true); } catch (e) { toHelper = false; }
        }
        // 長按（>= SELECT_HOLD）而夥伴系統沒接手時，維持原本的「掉在腳邊」；
        // 只有真正的短按才是「往前拋出去砸敵人」。
        if (!toHelper && this.ability) this.dropAbility(true, held < SELECT_HOLD);
      }

      // ---- Round 9：按住 ↑ ＝ 持續飛行（放在攻擊之後 → ↑+X / 空中 X 一律先出招）----
      //   地面：連續按住 P.flyHoldGround 幀才起飛，且該幀腳下不能有門 / 梯（門與梯優先，
      //         避免玩家一路按著 ↑ 找門時走過門口就飛起來）。
      //   空中（jump / fall）：按住 ↑ 立即起飛（條件與空中按跳漂浮相同）。
      //   fix9 / R9-P1-01：form.jet（機甲）自己用噴射處理 ↑，不走漂浮 —— 否則同一顆鍵
      //         會有「漂浮」與「噴射」兩種上升速度。
      if (inp.down('up') && this.canFloatNow() && !(this.form && this.form.jet)) {
        if (!this.onGround) {
          if ((this.state === 'jump' || this.state === 'fall') && !this.landingSoon()) { this.startFloat(); return; }
        } else if (this.flyHoldT >= P.flyHoldGround && !KB.game.doorAt(this)
          && !map.onLadder(this.cx, this.cy) && !map.onLadder(this.cx, this.bottom + 1)) {
          this.startFloat(); return;
        }
      }

      const vyPre = this.vy;
      this.physics();
      this.afterPhysics();
      if (this.state === 'dead' || this.state === 'hurt') return;

      // 狀態判定
      if (this.onGround) {
        if (this.state === 'jump' || this.state === 'fall') { this.setState('idle'); this.onLand(vyPre); this.jumped = false; }
        if (Math.abs(this.vx) > 0.2 && dirIn !== 0) this.setState(this.running ? 'run' : 'walk');
        else if (this.state === 'walk' || this.state === 'run') this.setState('idle');
      } else {
        if (this.vy < 0) { if (this.state !== 'jump') this.setState('jump'); }
        else if (this.state !== 'fall') { this.setState('fall'); this.flipT = this.jumped ? 22 : 0; }
        if (this.state === 'fall' && this.flipT > 0) this.flipT--;
      }
    }

    /** fix9 / R9-P1-02：房間頂高度夾制 —— 沒有天花板的房間（開放天空）也不能飛出畫面。
     *  卡比 top ≤ P.flyCeilY 就像撞到天花板一樣被壓住（vy ≥ P.flyCeilVy），仍可懸停在頂端；
     *  鏡頭本來就夾在 y ≥ 0，不需要跟著動。回傳 true = 本幀被頂住。
     *  漂浮 / 龍化飛行 / 機甲噴射 / 重力浮空（def.hover）都走 physics → afterPhysics，共用這一道。 */
    clampTop() {
      if (this.state === 'ride' || this.state === 'dead' || this.y > P.flyCeilY) return false;
      this.y = P.flyCeilY;
      if (this.vy < P.flyCeilVy) this.vy = P.flyCeilVy;
      return true;
    }
    /** 已經頂在房間上緣（拍動 / 噴射不再給上升力） */
    atRoomTop() { return this.y <= P.flyCeilY; }

    afterPhysics() {
      this.clampTop();
      if (this.fellOut && this.state !== 'dead') { this.hp = 0; this.die(true); }
      // 尖刺
      const map = KB.game.map;
      if (map.isSpike(this.cx, this.bottom - 1) || map.isSpike(this.cx, this.bottom + 1) && this.onGround) {
        if (this.state !== 'stone') this.hurt(1, { cx: this.cx, cy: this.cy + 20, spike: true });
      }
    }

    // ---------- 跳躍 / 落地手感 ----------
    doJump() {
      this.jumpBufT = 0; this.coyoteT = 0;
      this.vy = this.full ? P.fullJump : P.jump; this.jumped = true; this.jumpHold = 10; this.onGround = false;
      this.setState('jump'); KB.audio.sfx('jump');
      this.footDust(2, -this.dir);
    }
    /** 是否即將落地（jump buffer 幀數內）：此時按跳要暫存，不要變成漂浮 */
    landingSoon() {
      if (this.vy < 0) return false;
      // 之後 n 幀的落下距離；上限 12px —— 卡比在空中按跳原則上是「漂浮」，
      // 只有真的快貼地（漂浮已無意義）時才改成暫存跳躍。
      const n = P.jumpBuffer;
      const d = Math.min(12, this.vy * n + P.grav * n * (n + 1) / 2);
      return KB.physics.groundWithin(KB.game.map, this, d);
    }
    /** 落地：擠壓 + 揚塵 */
    onLand(vy) {
      this.landT = P.landFrames;
      this.landImpact = Math.max(0.4, Math.min(1, (vy || 0) / P.maxFall));
      KB.audio.sfx('land');
      KB.particles(this.cx, this.bottom, ['#f0f0f0', '#d0d0d8', '#b8b8c0', '#e8e8f0'], this.landImpact > 0.7 ? 4 : 3,
        { spread: 1.1, grav: 0.05, life: 18, up: 0.25 });
    }
    /** 腳下揚塵（起跑 / 煞車 / 起跳）；d 為塵土噴出方向 */
    footDust(n, d, power) {
      d = d || 0; power = power || 1;
      KB.particles(this.cx + d * 4, this.bottom - 2, ['#f0f0f0', '#d8d8e0', '#ffffff'], n,
        { spread: 0.8 * power, grav: 0.04, life: 15 + 6 * power, up: 0.35, vx: d * 0.6 * power, size: 2 });
    }
    /** 單向平台下穿 */
    dropDown() {
      this.dropT = P.dropFrames; this.dropThrough = true;
      this.setState('fall'); this.onGround = false; this.coyoteT = 0;
      this.vy = P.dropVy; this.y += 1; this.jumped = false;
      this.footDust(3, 0); KB.audio.sfx('slide');
    }

    // ---------- 漂浮 ----------
    /** 現在可以進入 / 維持漂浮嗎（含物、吐氣鎖、變身飛行、水中一律不行） */
    canFloatNow() {
      if (this.full || this.exhaleLockT > 0) return false;
      if (this.form && this.form.fly) return false;          // dragon / mech 的按住跳飛行交給 form 自己控制
      if (this.inWater) return false;
      return true;
    }
    startFloat() {
      this.setState('float'); this.vy = P.floatUp; this.floatFrame = 0; this.floatAnimT = 0; KB.audio.sfx('float');
      this.running = false; this.jumpBufT = 0;
      this.flyFlapT = 0; this.flyFlapN = 0;
      this.floatPuff();
    }
    /** 拍動一次（按跳 / 按住 ↑ 自動拍動共用）；quietEvery > 1 時音效節流 */
    floatFlap(auto) {
      this.vy = P.floatUp; this.floatAnimT = 0;
      if (!auto || (this.flyFlapN++ % Math.max(1, P.flyFlapSfxEvery)) === 0) KB.audio.sfx('float');
      this.floatPuff(); this.jumpBufT = 0;
    }
    /** 每次拍動吐出 1~2 顆小空氣粒子 */
    floatPuff() {
      KB.particles(this.cx - this.dir * 5, this.cy + 5, ['#ffffff', '#dcf0ff', '#eef6ff'], 1 + (Math.random() < 0.5 ? 1 : 0),
        { spread: 0.7, grav: -0.015, life: 20, up: 0.2, vx: -this.dir * 0.35 });
    }
    updateFloat() {
      const inp = KB.input;
      // fix9 / R9-P2-01：漂浮中一樣可以用「跳 + 攻擊」發動覺醒（量表沒滿時不攔截）
      if (KB.AWAKEN && KB.AWAKEN.tryTrigger && KB.AWAKEN.tryTrigger(this)) return;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (dirIn) { this.dir = dirIn; this.vx += dirIn * 0.1; }
      else this.vx *= 0.92;
      this.vx = Math.max(-1.0, Math.min(1.0, this.vx));
      // fix9 / R9-P1-02：頂到房間上緣就不再拍動上升（維持懸停，不會飛出畫面）
      const topped = this.atRoomTop();
      if (topped) { this.flyFlapT = 0; if (this.vy < P.flyCeilVy) this.vy = P.flyCeilVy; }
      // 每按一次跳＝拍動一次（動畫重播 + 吐氣粒子）
      else if (inp.pressed('jump')) { this.floatFlap(false); this.flyFlapT = 0; }
      // Round 9：按住 ↑ → 每 P.flyFlapEvery 幀自動拍動一次（＝持續上升）；放開 ↑ 就回一般漂浮下降
      else if (inp.down('up') && !(this.form && (this.form.fly || this.form.jet))) {
        this.flyFlapT++;
        if (this.flyFlapT >= P.flyFlapEvery) { this.flyFlapT = 0; this.floatFlap(true); }
      } else { this.flyFlapT = 0; }
      // Round 9：漂浮中按 X —— 有能力就直接出招（離開 float，不吐氣，不論有沒有按 ↓）；
      //   沒有能力才是原本的吐氣（且按 ↓ 或 ↓+攻擊不吐氣，避免誤觸）。
      if (inp.pressed('attack')) {
        if (this.ability && !this.full) { this.startAttack(); return; }
        if (!inp.down('down')) { this.exhale(); return; }
      }
      if (inp.pressed('up') && this.onGround) { const d = KB.game.doorAt(this); if (d) { this.enterDoor(d); return; } }
      this.floatAnimT++;
      this.grav = P.floatGrav; this.maxFall = P.floatMaxFall;
      const vyPre = this.vy;
      this.physics();
      this.grav = P.grav; this.maxFall = P.maxFall;
      if (this.hitCeil) this.vy = 0.2;
      this.afterPhysics();
      if (this.inWater) { this.setState('swim'); return; }
      // 輕輕落地：回到站立（保留擠壓 / 揚塵）
      if (this.onGround && this.stateT > 2) { this.setState('idle'); this.onLand(vyPre); this.jumped = false; }
    }
    exhale() {
      this.setState('exhale'); KB.audio.sfx('exhale');
      KB.shoot({ spr: 'proj_airpuff', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 2.6, dmg: 1, owner: 'player', life: 22, w: 10, h: 10, dir: this.dir, solid: true, fxHit: 'fx_poof' });
      this.vy = 0.5;
      this.exhaleLockT = P.exhaleLock;   // 吐氣後短暫不可再漂浮
      this.jumpBufT = 0;
    }

    // ---------- 吸入 ----------
    stopInhale() { if (this.inhaleFx) { this.inhaleFx.dead = true; this.inhaleFx = null; } this.releaseInhaled(); }
    releaseInhaled() {
      for (const e of KB.game.entities) if (e.beingInhaled && e.inhaleSrc === this) { e.beingInhaled = false; e.inhaleSrc = null; }
    }
    updateInhale() {
      const inp = KB.input;
      this.inhaleT++;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (this.onGround) { this.vx *= 0.7; } else { if (dirIn) this.vx += dirIn * 0.05; this.vx *= 0.96; }
      if (!inp.down('attack')) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      if (inp.pressed('jump') && this.onGround) { this.vy = P.jump; this.jumped = true; this.jumpHold = 10; this.onGround = false; KB.audio.sfx('jump'); }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }
      // 吸力範圍（p.sizeMul：變身體型倍率，巨大化為 2）
      const M = this.sizeMul || 1, RW = 52 * M;
      const mx = this.cx + this.dir * 8 * M, my = this.cy;
      const rx = this.dir > 0 ? this.cx + 4 : this.cx - 4 - RW, ry = this.cy - 16 * M, rw = RW, rh = 32 * M;
      const mouth = { x: this.dir > 0 ? this.cx + 2 : this.cx - 12 * M, y: this.cy - 6 * M, w: 10 * M, h: 12 * M };
      if (!this.inhaleFx || this.inhaleFx.dead) { this.inhaleFx = KB.fx('fx_inhale_wind', 0, 0, { loop: true, life: 99999, fps: 10 }); }
      this.inhaleFx.x = this.cx + this.dir * 30; this.inhaleFx.y = this.cy + 10; this.inhaleFx.flip = this.dir < 0;
      // 嘴前方持續有小粒子被吸進嘴巴（每 2 幀 1 顆，從 40px 外飛向嘴）
      if (this.inhaleT % 2 === 0) {
        const px = this.cx + this.dir * 40, py = this.cy + (Math.random() - 0.5) * 26;
        KB.particles(px, py, ['#ffffff', '#d8f0ff', '#e8e8f8'], 1,
          { spread: 0.15, grav: 0, life: 20, up: 0, vx: -this.dir * 2.0, vy: (my - py) / 18 });
      }
      const map = KB.game.map;
      for (const e of KB.game.entities) {
        if (e.dead || e === this) continue;
        if (!(e.type === 'enemy' || (e.type === 'proj' && e.inhalable) || e.type === 'item' && e.inhalable)) continue;
        if (!e.overlapsRect(rx, ry, rw, rh)) { if (e.inhaleSrc === this) { e.beingInhaled = false; e.inhaleSrc = null; } continue; }
        // 巨大化（form.inhaleAll）：連平常吸不動的敵人 / 中魔王都能直接吞下
        const big = !!(this.form && this.form.inhaleAll) && e.type === 'enemy';
        if (!e.inhalable && !big) { if (e.onInhaleAttempt) e.onInhaleAttempt(this); continue; }
        if (e.freezeT > 0) continue;
        e.beingInhaled = true; e.inhaleSrc = this;
        e.pullTo ? e.pullTo(mx, my, 2.4 * M) : (e.x += (mx - e.cx) * 0.15, e.y += (my - e.cy) * 0.15);
        if (e.overlapsRect(mouth.x, mouth.y, mouth.w, mouth.h)) {
          e.beingInhaled = false; e.inhaleSrc = null;
          e.onInhaled(this);
          if (this.mouth) {
            this.setState('full'); KB.audio.sfx('swallow'); KB.fx('fx_sparkle', this.cx, this.cy);
            KB.particles(mx, my, ['#ffffff', '#ffe040'], 5, { spread: 1.6, grav: 0.05, life: 18 });
            if (KB.game) KB.game.freezeT = Math.max(KB.game.freezeT, P.inhaleFreeze);   // 吸到東西 hit-stop
            this.stopInhale(); this.physics(); return;
          }
        }
      }
      // 星星方塊
      const bx = Math.floor((this.cx + this.dir * 20) / 16), by = Math.floor(this.cy / 16);
      for (const [tx, ty] of [[bx, by], [bx + this.dir, by]]) {
        const ch = map.get(tx, ty);
        if (ch === '*') {
          map.set(tx, ty, '.'); KB.particles(tx * 16 + 8, ty * 16 + 8, '#ffd040', 5, { spread: 1.5 });
          this.mouth = { ability: null, name: 'star', score: 10 }; this.setState('full'); KB.audio.sfx('swallow');
          if (KB.game) KB.game.freezeT = Math.max(KB.game.freezeT, P.inhaleFreeze);
          this.stopInhale(); this.physics(); return;
        }
      }
      this.physics();
      this.afterPhysics();
      if (this.onGround && this.vy === 0 && this.state === 'inhale') { /* keep */ }
    }
    spit() {
      const m = this.mouth; this.mouth = null;
      this.setState('spit'); KB.audio.sfx('spit');
      const dmg = 4;
      KB.shoot({ spr: 'proj_star', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 4, dmg, owner: 'player', life: 70, w: 12, h: 12, dir: this.dir, solid: true, fxHit: 'fx_hit', rotSpeed: 0.3 * this.dir, type: 'star' });
    }
    swallow() {
      const m = this.mouth; this.mouth = null;
      this.setState('swallow');
      if (m && m.ability && KB.ABILITIES[m.ability]) {
        // Round 6（mix）：持有能力 A 時吞下帶能力 B 的敵人 → 混合能力。
        //   判斷與演出（KB.VFX.transform + textPop「MIX!」+ sfx('transform')）統一放在 giveAbility()，
        //   這樣「吞下敵人 / 撿能力星 / 踩能力台座 / 夥伴吸回」四條路徑的行為完全一致；
        //   沒有組合（或已經是混合能力）時 giveAbility 會照舊單純替換。
        this.giveAbility(m.ability);
      } else KB.audio.sfx('swallow');
    }
    giveAbility(key) {
      // Round 6（mix）：已經持有能力 A 時又取得能力 B（吞下敵人 / 撿能力星 / 能力台座 / 夥伴吸回）
      //   → 若 KB.MIX.table 有 [A,B]（無序）就直接變成混合能力；沒有組合就照舊替換。
      //   混合能力本身 isMix → keyOf 會回 null，所以「吞下第三個」一定是單純替換。
      //   ※ 函式簽章保持 giveAbility(key) 不變（progression agent 會 monkeypatch 這個方法）。
      let mixedFrom = null;
      try {
        if (KB.MIX && KB.MIX.keyOf) {
          const mk = KB.MIX.keyOf(this.ability, key);
          if (mk && KB.ABILITIES[mk]) { mixedFrom = this.ability; key = mk; }
        }
      } catch (e) { }
      if (this.ability) this.dropAbility(false);
      this.ability = key; this.abilityData = {};
      KB.audio.sfx('ability');
      KB.fx('fx_sparkle', this.cx, this.cy - 4); KB.particles(this.cx, this.cy, ['#fff', '#ffe040', '#ffb0d0'], 12, { spread: 2.5 });
      if (KB.game) { KB.game.abilityFlash = 60; }
      // Round 5：變身演出（KB.VFX 由 vfx agent 提供，未載入時安靜跳過）＋ 圖鑑「已見過」紀錄
      //   KB.VFX.transform 會 hitstop 10 幀 + letterbox 70 幀，只適合「整體變身」等級的能力，
      //   因此以 def.transform 旗標開關（Round 1 的 8 種能力不設 → 取得節奏完全不變）。
      const td = KB.ABILITIES[key];
      // 總控：所有能力都播變身演出；只有整體變身（def.transform）才加 10 幀停格，避免影響取得節奏
      try { if (KB.VFX && KB.VFX.transform) KB.VFX.transform(this, key, { hitstop: !!(td && td.transform) }); } catch (e) { } 
      try {
        KB.save.seen = KB.save.seen || {};
        if (!KB.save.seen[key]) { KB.save.seen[key] = true; KB.saveGame(); }
      } catch (e) { }
      const d = KB.ABILITIES[key]; if (d && d.onGet) d.onGet(this);
      // 混合成功的專屬演出：MIX! + 變身音（KB.VFX.transform 已在上面播過）
      if (mixedFrom) {
        KB.audio.sfx('transform');
        try {
          if (KB.VFX && KB.VFX.textPop) KB.VFX.textPop(this.cx, this.y - 20, 'MIX!', { color: (d && d.color) || '#ffe040', size: 10, frames: 54, rise: 0.4, outline: '#000' });
        } catch (e) { }
      }
    }
    // thrown = true：短按 SELECT 主動丟出（往面向方向明顯拋出，可以瞄準帶能力的敵人做混合）
    dropAbility(spawnStar, thrown) {
      const key = this.ability; if (!key) return;
      const d = KB.ABILITIES[key]; if (d && d.onLose) d.onLose(this);
      if (this.form) this.clearForm();
      this.ability = null; this.abilityData = {};
      if (this.state === 'attack' || this.state === 'stone') this.setState(this.onGround ? 'idle' : 'fall');
      // Round 6（mix）：掉落混合能力時，能力星給回「主成分 A」（撿回去只會拿回原本的能力）
      let starKey = key;
      try { if (KB.MIX && KB.MIX.isMix(key)) { const ps = KB.MIX.parts(key); if (ps && ps[0]) starKey = ps[0]; } } catch (e) { }
      if (spawnStar && KB.ITEMS.abilitystar) {
        const st = KB.spawn(new KB.ITEMS.abilitystar(this.cx - 8, this.y - 8, starKey, -this.dir));
        if (thrown && st && st.throwForward) { st.throwForward(this.dir); KB.audio.sfx('spit'); }
      }
    }

    // ---------- 覺醒（Round 7 awaken；實作在 src/awaken.js）----------
    /** 發動覺醒：hitstop + 金色演出 + 300 幀覺醒狀態 + 立刻放出該能力的覺醒招 */
    startAwaken() {
      if (!KB.AWAKEN || !KB.AWAKEN.start) return false;
      try { return KB.AWAKEN.start(this) === true; } catch (e) { return false; }
    }
    /** 覺醒中？（繪製 / 其他系統可直接讀 p.awakenT） */
    get awakening() { return !!(KB.AWAKEN && KB.AWAKEN.active && KB.AWAKEN.active()); }

    // ---------- 能力攻擊 ----------
    startAttack() {
      const d = this.abilityDef; if (!d) return;
      // Round 9：出招方向快照（abilities 的 onAttack / update 讀 p.atkDir 決定放哪一招）
      //   up / down = 按下攻擊當幀的方向鍵狀態；air = 當幀不在地面（空中版招式）
      const inp = KB.input;
      this.atkDir = { up: inp.down('up'), down: inp.down('down'), air: !this.onGround };
      if (d.key === 'stone' || d.stoneLike) { this.startStone(); return; }
      this.setState('attack'); this.attackTimer = d.duration || 20; this.attackLock = d.lockMove !== false;
      this.attackFps = d.fps || 12;
      if (d.onAttack) d.onAttack(this);
    }
    restartAttack() { this.setState('idle'); this.startAttack(); }
    updateAttack() {
      const d = this.abilityDef, inp = KB.input;
      if (!d) { this.setState(this.onGround ? 'idle' : 'fall'); return; }
      // Round 7（awaken）：出招中一樣可以用「跳 + 攻擊」發動覺醒（量表沒滿時不攔截）
      if (KB.AWAKEN && KB.AWAKEN.tryTrigger && KB.AWAKEN.tryTrigger(this)) return;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (!this.attackLock) {
        if (dirIn) { this.dir = dirIn; this.vx += dirIn * (this.onGround ? P.accel : P.airAccel); }
        const sp = d.moveSpeed || P.walk; this.vx = Math.max(-sp, Math.min(sp, this.vx));
        if (!dirIn && this.onGround) this.vx *= 0.8;
      } else if (this.onGround) this.vx *= 0.75;
      if (inp.pressed('jump') && this.onGround && d.canJump !== false) { this.vy = P.jump; this.jumped = true; this.jumpHold = 10; KB.audio.sfx('jump'); }
      if (this.jumpHold > 0) { this.jumpHold--; if (!inp.down('jump') && this.vy < P.jumpCut) { this.vy = P.jumpCut; this.jumpHold = 0; } }
      if (d.update) d.update(this, dt1(), inp.down('attack'));
      this.attackTimer--;
      if (d.hold && inp.down('attack') && (d.maxHold === undefined || this.stateT < d.maxHold)) this.attackTimer = Math.max(this.attackTimer, 2);
      let resumeFly = false;
      if (this.attackTimer <= 0) {
        if (d.onEnd) d.onEnd(this);
        this.setState(this.onGround ? 'idle' : 'fall');
        resumeFly = this.state === 'fall';
      }
      // Round 9：空中出招期間重力照常（不因 attackLock 停住垂直）；
      //   只有 def.hover === true 才把重力交給 def 自己控制 p.vy（懸停型招式）。
      const hover = !!d.hover && !this.onGround;
      const g0 = this.grav;
      if (hover) this.grav = 0;
      this.physics(); this.afterPhysics();
      if (hover) this.grav = g0;
      // 招式結束回到 fall：↑ 仍按著（或跳鍵剛按）→ 自動接回漂浮，可以一路飛一路出招
      if (resumeFly && this.state === 'fall' && !this.onGround && this.canFloatNow()
        && (inp.down('up') || inp.pressed('jump') || this.jumpBufT > 0) && !this.landingSoon()) {
        this.startFloat();
      }
    }
    startStone() {
      this.setState('stone'); this.vx = 0; this.stoneT = 0; KB.audio.sfx('stone');
      KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      this.stoneBox = KB.hitbox({ x: this.x, y: this.y, w: this.w + 4, h: this.h + 2, dmg: 6, owner: 'player', type: 'stone', follow: this, ox: -this.w / 2 - 2, oy: -1, life: 99999, rehit: 20, pierce: true, stone: true, breakBlocks: true });
    }
    updateStone() {
      const inp = KB.input;
      this.stoneT++;
      this.grav = 0.6; this.maxFall = 7; this.vx *= 0.6;
      if (this.onSlope) { this.vx += (KB.game.map.get(Math.floor(this.cx / 16), Math.floor(this.bottom / 16)) === '/' ? -1 : 1) * 0.5; }
      const wasAir = !this.onGround;
      this.physics();
      if (wasAir && this.onGround) { KB.game.shake = 5; KB.audio.sfx('hammer'); KB.particles(this.cx, this.bottom, '#c0c0c8', 8, { spread: 2 }); }
      this.grav = P.grav; this.maxFall = P.maxFall;
      if ((inp.pressed('attack') && this.stoneT > 12) || this.stoneT > 900 || inp.pressed('select')) {
        if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
        if (inp.pressed('select')) { this.dropAbility(true, true); }
        this.setState(this.onGround ? 'idle' : 'fall');
        KB.particles(this.cx, this.cy, '#a0a0a8', 6, { spread: 1.5 });
      }
      this.afterPhysics();
    }

    // ---------- 滑鏟 ----------
    startSlide() {
      this.setState('slide'); this.slideT = P.slideFrames; this.slideBounceT = 0; this.vx = this.dir * P.slide; KB.audio.sfx('slide');
      this.footDust(3, -this.dir);
      this.slideBox = KB.hitbox({ x: this.x, y: this.y, w: this.w + 6, h: this.h, dmg: 2, owner: 'player', type: 'slide', follow: this, ox: -this.w / 2 - 3, oy: 0, life: P.slideFrames, rehit: 0, pierce: true, knock: 2 });
    }
    endSlide() {
      if (this.slideBox) { this.slideBox.dead = true; this.slideBox = null; }
    }
    updateSlide() {
      // 撞牆回彈：0.8px/frame，3 幀
      if (this.slideBounceT > 0) {
        this.slideBounceT--;
        this.vx = -this.dir * P.slideBounce;
        this.physics(); this.afterPhysics();
        if (this.slideBounceT <= 0) { this.setState(KB.input.down('down') && this.onGround ? 'crouch' : 'idle'); this.vx = 0; }
        return;
      }
      // 滑鏟中按跳＝取消成跳躍（保留 70% 水平速度）
      if (this.jumpBufT > 0 && (this.onGround || this.coyoteT > 0)) {
        const keep = this.vx * P.slideCancelKeep;
        this.endSlide(); this.doJump(); this.vx = keep;
        return;
      }
      this.slideT--;
      this.vx = this.dir * P.slide * Math.max(0.35, this.slideT / P.slideFrames);
      this.physics(); this.afterPhysics();
      if (this.hitWall) {
        this.endSlide(); this.slideT = 0; this.slideBounceT = P.slideBounceFrames; this.vx = -this.dir * P.slideBounce;
        KB.particles(this.cx + this.dir * 7, this.cy + 3, ['#e8e8e8', '#c8c8d0'], 4, { spread: 1.2, grav: 0.05, life: 16, vx: -this.dir * 0.6 });
        return;
      }
      if (this.slideT <= 0) { this.endSlide(); this.setState(KB.input.down('down') && this.onGround ? 'crouch' : 'idle'); this.vx *= 0.3; }
    }

    // ---------- 游泳 ----------
    /** 水面 y（從目前位置往上找水柱頂端）；不在水裡時回傳目前 cy */
    waterTopY() {
      const map = KB.game && KB.game.map; if (!map) return this.cy;
      let ty = Math.floor(this.cy / 16);
      if (!map.inWater(this.cx, ty * 16 + 8)) {
        // 剛出水：往下找第一格水
        for (let k = 0; k < 3 && !map.inWater(this.cx, (ty + 1) * 16 + 8); k++) ty++;
        return (ty + 1) * 16;
      }
      for (let k = 0; k < 24 && ty > 0 && map.inWater(this.cx, (ty - 1) * 16 + 8); k++) ty--;
      return ty * 16;
    }
    /** 入水 / 出水水花（藍白，往上噴）；enter=true 為入水 */
    waterSplash(enter) {
      const y = this.waterTopY();
      const n = enter ? P.splashParts : Math.max(3, Math.round(P.splashParts / 2));
      KB.particles(this.cx, y - 1, ['#ffffff', '#80d8ff', '#ffffff', '#c0f0ff'], n,
        { spread: enter ? 1.7 : 1.2, grav: 0.16, life: 26, up: enter ? 2.2 : 1.4, size: 3, vx: this.vx * 0.3 });
      KB.audio.sfx('splash');
    }
    /** 嘴邊氣泡（水中每 P.bubbleEvery 幀 1 顆） */
    waterBubble() {
      KB.particles(this.cx + this.dir * 7, this.cy - 2, ['#ffffff', '#e8ffff'], 1,
        { spread: 0.25, grav: -0.04, life: 46, up: 0.4, size: 3 });
      KB.audio.sfx('bubble');
    }
    updateSwim() {
      const inp = KB.input;
      const dirIn = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (dirIn) { this.dir = dirIn; this.vx += dirIn * 0.12; } else this.vx *= 0.9;
      this.vx = Math.max(-P.swimSpeed, Math.min(P.swimSpeed, this.vx));
      if (inp.pressed('jump')) { this.vy = P.swimUp; KB.audio.sfx('float'); KB.particles(this.cx, this.cy, '#c0f0ff', 3, { spread: 1, grav: -0.05, life: 15 }); }
      // fix9 / R9-P2-04：水中按住 ↑ 也會上浮 —— 每 P.swimUpEvery 幀輕划一次（swimUp 的 70%），
      //   與按跳並存（↑ 仍然不會起飛，canFloatNow 在水中照樣回 false）。
      else if (inp.down('up') && (this.flyHoldT % P.swimUpEvery) === 1) {
        this.vy = Math.min(this.vy, P.swimUp * P.swimUpHoldMul);
        if ((this.swimUpN++ % Math.max(1, P.flyFlapSfxEvery)) === 0) KB.audio.sfx('float');
        KB.particles(this.cx, this.cy, '#c0f0ff', 2, { spread: 0.8, grav: -0.05, life: 14 });
      }
      if (inp.down('down')) this.vy += 0.1;
      // 嘴邊氣泡
      this.bubbleT++;
      if (this.bubbleT % P.bubbleEvery === 0) this.waterBubble();
      // 攻擊鍵：含物＝吐星；無能力＝吸入（範圍減半）；有能力＝吐氣彈
      if (this.full) {
        this.swimInhaleT = 0;
        if (inp.pressed('attack')) { this.spitWater(); }
      } else if (this.ability) {
        this.swimInhaleT = 0;
        if (inp.pressed('attack')) {
          KB.audio.sfx('spit');
          KB.shoot({ spr: 'proj_airpuff', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 2.5, dmg: 1, owner: 'player', life: 24, w: 8, h: 8, dir: this.dir, solid: true, fxHit: 'fx_poof' });
        }
      } else if (inp.down('attack')) {
        if (this.swimInhaleT === 0) KB.audio.sfx('inhale');
        this.swimInhaleT++;
        this.waterInhale();
        if (this.full) { this.physics(); return; }
      } else {
        if (this.swimInhaleT > 0) this.releaseInhaled();
        this.swimInhaleT = 0;
      }
      if (inp.pressed('up') && this.onGround) { const d = KB.game.doorAt(this); if (d) { this.enterDoor(d); return; } }
      this.grav = P.swimGrav; this.maxFall = P.swimMaxFall;
      this.physics();
      this.grav = P.grav; this.maxFall = P.maxFall;
      this.afterPhysics();
      if (!this.inWater) { if (this.vy < 0) this.vy = Math.max(this.vy, -3.2); this.setState('jump'); }
    }
    /** 水中吸入：吸力範圍 P.waterInhaleRange（陸上一半），只吸 inhalable 的敵人 / 物件 */
    waterInhale() {
      const R = P.waterInhaleRange;
      const mx = this.cx + this.dir * 8, my = this.cy;
      const rx = this.dir > 0 ? this.cx + 4 : this.cx - 4 - R, ry = this.cy - 12, rw = R, rh = 26;
      const mouth = { x: this.dir > 0 ? this.cx + 2 : this.cx - 12, y: this.cy - 6, w: 10, h: 12 };
      // 吸力氣泡（往嘴巴飛）
      if (this.swimInhaleT % 3 === 0) {
        const px = this.cx + this.dir * R, py = this.cy + (Math.random() - 0.5) * 20;
        KB.particles(px, py, ['#ffffff', '#c0f0ff'], 1,
          { spread: 0.15, grav: 0, life: 16, up: 0, vx: -this.dir * 1.4, vy: (my - py) / 16 });
      }
      for (const e of KB.game.entities) {
        if (e.dead || e === this) continue;
        if (!(e.type === 'enemy' || e.type === 'proj' || e.type === 'item')) continue;
        if (!e.overlapsRect(rx, ry, rw, rh)) { if (e.inhaleSrc === this) { e.beingInhaled = false; e.inhaleSrc = null; } continue; }
        if (!e.inhalable) { if (e.onInhaleAttempt) e.onInhaleAttempt(this); continue; }
        if (e.freezeT > 0) continue;
        e.beingInhaled = true; e.inhaleSrc = this;
        e.pullTo ? e.pullTo(mx, my, 1.8) : (e.x += (mx - e.cx) * 0.12, e.y += (my - e.cy) * 0.12);
        if (e.overlapsRect(mouth.x, mouth.y, mouth.w, mouth.h)) {
          e.beingInhaled = false; e.inhaleSrc = null;
          e.onInhaled(this);
          if (this.mouth) {
            KB.audio.sfx('swallow'); KB.fx('fx_sparkle', this.cx, this.cy);
            KB.particles(mx, my, ['#ffffff', '#c0f0ff', '#ffe040'], 5, { spread: 1.4, grav: -0.02, life: 20 });
            if (KB.game) KB.game.freezeT = Math.max(KB.game.freezeT, P.inhaleFreeze);
            this.swimInhaleT = 0; this.releaseInhaled();
            return;
          }
        }
      }
    }
    /** 水中吐星（含物時按攻擊） */
    spitWater() {
      this.mouth = null; this.swimActT = 10;
      KB.audio.sfx('spit');
      KB.shoot({ spr: 'proj_star', x: this.cx + this.dir * 10, y: this.cy, vx: this.dir * 3.2, dmg: 4, owner: 'player', life: 60, w: 12, h: 12, dir: this.dir, solid: true, fxHit: 'fx_hit', rotSpeed: 0.3 * this.dir, type: 'star' });
      KB.particles(this.cx + this.dir * 8, this.cy, ['#c0f0ff', '#ffffff'], 3, { spread: 0.8, grav: -0.03, life: 24, up: 0.4 });
    }

    // ---------- 騎乘傳送星 ----------
    /** 以中心座標定位（Entity 只有 cx 的 setter） */
    setCenter(x, y) { this.x = x - this.w / 2; this.y = y - this.h / 2; }
    /**
     * 騎傳送星沿折線飛行（世界座標）。
     * @param {Array<[number,number]>} path 路徑點（卡比中心會依序經過）
     * @param {function(Player)} [onArrive] 抵達最後一點時呼叫；若沒有換場景 / 換房就自動落地
     */
    rideStar(path, onArrive) {
      if (!Array.isArray(path) || !path.length) return false;
      this.ridePath = path.map(pt => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : { x: pt.x, y: pt.y }));
      this.rideIdx = 0; this.rideT = 0; this.rideStuck = 0; this.rideLastD = 1e9;
      this.rideArrive = typeof onArrive === 'function' ? onArrive : null;
      this.mouth = null; this.stopInhale(); this.endSlide();
      if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
      this.setState('ride');
      this.vx = 0; this.vy = 0; this.onGround = false; this.jumped = false;
      this.running = false; this.jumpBufT = 0; this.coyoteT = 0;
      const t0 = this.ridePath[0];
      this.rideVx = 0; this.rideVy = 0;
      const dx = t0.x - this.cx, dy = t0.y - this.cy, d = Math.hypot(dx, dy) || 1;
      this.rideVx = dx / d * P.rideSpeed; this.rideVy = dy / d * P.rideSpeed;
      this.dir = this.rideVx < 0 ? -1 : 1;
      KB.audio.sfx('warp'); KB.fx('fx_sparkle', this.cx, this.cy);
      return true;
    }
    updateRide() {
      const path = this.ridePath;
      if (!path || this.rideIdx >= path.length) { this.rideFinish(); return; }
      this.rideT++;
      if (this.rideT > 3000) { this.rideFinish(); return; }   // 安全閥
      const spd = P.rideSpeed, last = this.rideIdx === path.length - 1;
      const tgt = path[this.rideIdx];
      let dx = tgt.x - this.cx, dy = tgt.y - this.cy, d = Math.hypot(dx, dy);
      // 抵達判定（非最後一點放寬，讓轉角平滑）
      const reach = last ? spd : spd * 1.5;
      if (d > this.rideLastD + 0.01) this.rideStuck++; else this.rideStuck = 0;
      this.rideLastD = d;
      if (d <= reach || this.rideStuck > 20) {
        if (last) { this.setCenter(tgt.x, tgt.y); this.rideIdx++; this.rideFinish(); return; }
        this.rideIdx++; this.rideStuck = 0; this.rideLastD = 1e9;
        const nx = path[this.rideIdx];
        dx = nx.x - this.cx; dy = nx.y - this.cy; d = Math.hypot(dx, dy) || 1;
      }
      // 目標方向 → 以 lerp 平滑轉向，再正規化成固定速度
      const wx = dx / (d || 1) * spd, wy = dy / (d || 1) * spd;
      const k = P.rideTurn;
      this.rideVx += (wx - this.rideVx) * k; this.rideVy += (wy - this.rideVy) * k;
      const m = Math.hypot(this.rideVx, this.rideVy) || 1;
      this.rideVx = this.rideVx / m * spd; this.rideVy = this.rideVy / m * spd;
      this.setCenter(this.cx + this.rideVx, this.cy + this.rideVy);
      this.vx = this.rideVx; this.vy = 0;
      if (Math.abs(this.rideVx) > 0.4) this.dir = this.rideVx < 0 ? -1 : 1;
      this.onGround = false;
      // 黃白拖尾
      if (this.rideT % P.rideTrailEvery === 0) {
        KB.particles(this.cx - this.rideVx * 1.5, this.cy + 5, ['#ffe040', '#ffffff', '#fff8c0'], 1,
          { spread: 0.35, grav: 0.01, life: 18, up: 0, size: 2 });
      }
    }
    rideFinish() {
      const cb = this.rideArrive; this.rideArrive = null;
      this.ridePath = null;
      const scn = KB.scene, room = KB.game ? KB.game.roomIdx : -1;
      if (cb) { try { cb(this); } catch (e) { try { console.warn('[rideStar onArrive]', e); } catch (e2) { } } }
      const samePlace = (KB.scene === scn) && (!KB.game || KB.game.roomIdx === room);
      if (this.state === 'ride') {
        this.setState('fall'); this.vx = 0; this.vy = 0; this.jumped = false;
        if (samePlace) { KB.fx('fx_sparkle', this.cx, this.cy); KB.particles(this.cx, this.cy, ['#ffe040', '#ffffff'], 6, { spread: 1.6, grav: 0.04, life: 20 }); }
      }
    }

    // ---------- 梯子 ----------
    startClimb() { this.setState('climb'); this.vx = 0; this.vy = 0; this.cx = Math.floor(this.cx / 16) * 16 + 8; }
    /** 爬到頂 / 底的過渡（1 個過渡幀 kirby_climb_top，共 P.climbTopFrames 幀） */
    endClimbTop() {
      this.bottom = Math.floor((this.bottom + 1) / 16) * 16;
      this.setState('idle'); this.onGround = true; this.climbTopT = P.climbTopFrames;
      this.footDust(2, 0);
    }
    /** 梯子上吐氣彈（不離開梯子） */
    ladderPuff() {
      this.ladderAtkT = P.ladderAtkCd;
      KB.audio.sfx('exhale');
      // fix9 / R9-P2-07：貼牆的梯子（如 w2 r1）出生點會落在實心磁磚裡 → solid 的吐氣彈
      //   當幀就判定撞牆而消失。先往卡比這側退 8px；退完仍在牆內就改成不 solid（穿牆約 1 格後消失）。
      const map = KB.game.map;
      // 出生框（10×10）四角有任何一角在實心磁磚裡就算被擋
      const blocked = px => {
        for (const ox of [-5, 5]) for (const oy of [-4, 4]) if (map.isSolidPx(px + ox, this.cy + oy)) return true;
        return false;
      };
      let sx = this.cx + this.dir * 10, solid = true;
      if (blocked(sx)) {
        sx = this.cx + this.dir * 2;                 // 退 8px（貼身）
        solid = false;                               // 前方就是牆 → 不 solid，穿牆約 1 格後消失
      }
      KB.shoot({ spr: 'proj_airpuff', x: sx, y: this.cy, vx: this.dir * 2.6, dmg: 1, owner: 'player', life: solid ? 22 : 10, w: 10, h: 10, dir: this.dir, solid: solid, fxHit: 'fx_poof' });
      KB.particles(this.cx + this.dir * 8, this.cy, ['#ffffff', '#dcf0ff'], 2, { spread: 0.6, grav: 0, life: 14, up: 0.1, vx: this.dir * 0.4 });
    }
    updateClimb() {
      const inp = KB.input, map = KB.game.map;
      let dy = 0; if (inp.down('up')) dy = -P.climb; if (inp.down('down')) dy = P.climb;
      this.vy = 0; this.vx = 0; this.y += dy;
      this.climbing = dy !== 0; this.onGround = false;
      // 梯子上按攻擊：吐氣彈（面向左右可用 ←/→ 切換，但不離開梯子）
      if (inp.down('left')) this.dir = -1; else if (inp.down('right')) this.dir = 1;
      if (inp.pressed('attack') && this.ladderAtkT <= 0) { this.ladderPuff(); }
      if (inp.pressed('jump')) { this.setState('fall'); this.vy = -2.5; this.jumped = false; return; }
      const midOn = map.onLadder(this.cx, this.cy), feetOn = map.onLadder(this.cx, this.bottom - 1), belowOn = map.onLadder(this.cx, this.bottom + 1);
      if (dy < 0 && !midOn && !feetOn) {
        // 爬到頂：站在梯子頂端（視為平台）
        this.endClimbTop(); return;
      }
      if (dy > 0) {
        if (!feetOn && !belowOn) { this.setState('fall'); return; }
        if (!belowOn && KB.physics.groundBelow(map, this)) { this.endClimbTop(); return; }
      }
      if (dy === 0 && !midOn && !feetOn && !belowOn) this.setState('fall');
    }

    // ---------- 門 ----------
    enterDoor(door) {
      this.setState('door'); this.doorT = 0; this.doorTarget = door; this.vx = 0; this.cx = door.cx; KB.audio.sfx('door');
    }
    updateDoor() {
      this.doorT++; this.vx = 0; this.physics();
      if (this.doorT === 24) KB.game.useDoor(this.doorTarget);
    }

    // ---------- 受傷 / 死亡 ----------
    hurt(amount, src) {
      if (this.dead || this.invuln > 0 || this.invincibleT > 0) return false;
      if (['dead', 'stone', 'door', 'dance', 'ride'].includes(this.state)) return false;
      // 機甲裝甲（form.armor）：傷害改扣裝甲值，不扣 HP、不掉能力；裝甲歸零才解除變身
      const fm = this.form;
      if (fm && fm.armor > 0 && fm.hp > 0) {
        fm.hp -= Math.max(1, amount - fm.armor);
        KB.audio.sfx('hurt');
        const from0 = src && src.cx !== undefined ? src.cx : this.cx - this.dir;
        this.vx = (this.cx < from0 ? -1 : 1) * P.knockback * 0.6; this.vy = -1.6;
        this.invuln = P.invulnFrames; this.hurtTimer = P.hurtFrames;
        this.hurtFlashT = 2; this.jumpBufT = 0; this.coyoteT = 0;
        this.mouth = null; this.stopInhale(); this.endSlide();
        if (KB.game) {
          KB.game.freezeT = Math.max(KB.game.freezeT || 0, P.hurtFreeze);
          KB.game.shake = Math.max(KB.game.shake || 0, P.hurtShake);
        }
        KB.particles(this.cx, this.cy, ['#ffffff', '#c8d0e0', '#ffe040'], 8, { spread: 2.2, life: 20 });
        KB.fx('fx_hit', this.cx, this.cy + 6);
        if (fm.hp <= 0) this.breakArmor();
        this.setState('hurt');
        return true;
      }
      this.hp -= amount;
      KB.audio.sfx('hurt');
      const from = src && src.cx !== undefined ? src.cx : this.cx - this.dir;
      const kdir = this.cx < from ? -1 : 1;
      const km = this.inWater ? P.waterKnock : 1;   // 水中擊退減半
      this.vx = kdir * P.knockback * km; this.vy = -2.2 * km;
      this.invuln = P.invulnFrames; this.hurtTimer = P.hurtFrames;
      this.mouth = null; this.stopInhale(); this.endSlide();
      // 受傷反饋：hit-stop + 畫面微震 + 閃白
      this.hurtFlashT = 2; this.jumpBufT = 0; this.coyoteT = 0;
      if (KB.game) {
        KB.game.freezeT = Math.max(KB.game.freezeT || 0, P.hurtFreeze);
        KB.game.shake = Math.max(KB.game.shake || 0, P.hurtShake);
      }
      if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
      if (this.ability) this.dropAbility(true);
      KB.fx('fx_hit', this.cx, this.cy + 6);
      if (this.hp <= 0) { this.die(false); return true; }
      this.setState('hurt');
      return true;
    }
    updateHurt() {
      this.hurtTimer--; this.vx *= 0.94; this.physics(); this.afterPhysics();
      if (this.hurtTimer <= 0) this.setState(this.onGround ? 'idle' : 'fall');
    }
    die(fell) {
      if (this.state === 'dead') return;
      if (this.ability) { const d = KB.ABILITIES[this.ability]; if (d && d.onLose) d.onLose(this); }
      if (this.form) this.clearForm();
      this.hp = 0; this.setState('dead'); this.deadT = 0; this.solid = false; this.vx = 0; this.vy = fell ? 0 : -3;
      this.mouth = null; this.ability = null; this.stopInhale();
      if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; }
      KB.audio.music(null); KB.audio.sfx('die');
      if (fell) this.y = KB.game.cam.y + KB.VIEW_H + 20;
    }
    updateDead() {
      this.deadT++;
      if (this.deadT < 30) { this.vx = 0; this.vy = 0; }
      else { this.vy += 0.15; this.y += this.vy; if (this.deadT === 30) this.vy = -4; }
      if (this.deadT === 110) KB.game.playerDied();
    }

    // ---------- 過關 ----------
    startDance() { this.setState('dance'); this.danceT = 0; this.vx = 0; this.mouth = null; this.stopInhale(); if (this.stoneBox) { this.stoneBox.dead = true; this.stoneBox = null; } }

    // ---------- 動畫 ----------
    currentAnim() {
      const s = this.state, d = this.abilityDef;
      switch (s) {
        case 'idle': return this.full ? ['kirby_full_idle', 2] : ['kirby_idle', 1];
        case 'walk': return this.full ? ['kirby_full_walk', 8] : ['kirby_walk', 8];
        case 'run': return ['kirby_run', 12];
        case 'jump': return this.full ? ['kirby_full_jump', 1] : ['kirby_jump', 1];
        case 'fall': if (this.full) return ['kirby_full_jump', 1]; return this.flipT > 0 ? ['kirby_flip', 12] : ['kirby_fall', 1];
        case 'float': return ['kirby_float', 5];
        case 'inhale': return ['kirby_inhale', 8];
        case 'full': return ['kirby_full_idle', 2];
        case 'spit': return ['kirby_spit', 10];
        case 'swallow': return ['kirby_swallow', 10];
        case 'exhale': return ['kirby_exhale', 10];
        case 'slide': return ['kirby_slide', 1];
        case 'crouch': return ['kirby_crouch', 1];
        case 'hurt': return ['kirby_hurt', 1];
        case 'dead': return ['kirby_dead', 8];
        case 'swim':
          if ((this.swimInhaleT > 0 || this.swimActT > 0) && KB.has('kirby_swim_inhale')) return ['kirby_swim_inhale', 8];
          return ['kirby_swim', 4];
        case 'ride': return [KB.has('kirby_ride') ? 'kirby_ride' : 'kirby_jump', 6];
        case 'climb': return ['kirby_climb', this.climbing ? 6 : 0];
        case 'door': return ['kirby_door', 6];
        case 'dance': return ['kirby_dance', 6];
        case 'stone': return ['kirby_stone', 1];
        case 'attack': return [(d && d.anim) || ('kirby_attack_' + this.ability), this.attackFps || 12];
      }
      return ['kirby_idle', 1];
    }
    draw(g) {
      if (this.state === 'dead' && this.deadT < 30 && (this.deadT & 2)) return;
      if (this.invuln > 0 && this.state !== 'dead' && (this.invuln & 2) && this.hurtFlashT <= 0) return; // 閃爍
      let [anim, fps] = this.currentAnim();
      const opts = { flip: this.dir < 0, fps };
      // 爬梯上 / 下端的過渡幀
      if (this.climbTopT > 0 && (this.state === 'idle' || this.state === 'walk') && KB.has('kirby_climb_top')) { anim = 'kirby_climb_top'; fps = 0; opts.fps = 0; opts.frame = 0; }
      if (this.state === 'idle') opts.frame = (this.stateT % 200) > 190 ? 1 : 0;
      else if (this.state === 'climb' && !this.climbing) opts.frame = 0;
      else if (this.state === 'float') opts.frame = Math.min(3, Math.floor(this.floatAnimT / 5)) ;
      else if (this.state === 'fall' && this.flipT > 0) opts.frame = Math.floor((22 - this.flipT) / 5.5) % 4;
      else if (this.state === 'attack') opts.t = this.stateT / 60;
      else opts.t = this.stateT / 60;
      // 整體變身：完整替換精靈（form.spr 可順便改寫 opts.frame / opts.fps）
      if (this.form && this.form.spr) {
        const a2 = this.form.spr(this, anim, opts);
        if (a2 && KB.has(a2)) anim = a2;
      }
      if (this.invincibleT > 0) { const hues = ['#ffffff', '#ffe040', '#ff80c0', '#80e0ff']; if ((this.stateT >> 1) & 1) opts.tint = hues[(this.stateT >> 2) % 4]; }
      // Round 7（awaken）：覺醒中全身金色。無敵糖是「每 2 幀整隻變成單色剪影」，覺醒改成
      //   「原本的卡比 + 金色釉光脈動（alpha 0.3~0.62）」—— 看得到表情，閃法明顯不同。
      const awk = !!(KB.AWAKEN && KB.AWAKEN.active && KB.AWAKEN.active());
      let awkA = 0;
      if (awk) {
        opts.tint = undefined;                                  // 蓋掉無敵糖的彩虹閃
        awkA = 0.46 + Math.sin(this.t * 14) * 0.16;
      }
      // 落地擠壓：gfx 支援 scaleX/scaleY（anchor=bottom，擠壓以腳底為基準）
      let squash = 0;
      if (this.landT > 0 && ['idle', 'walk', 'run', 'crouch'].indexOf(this.state) >= 0) {
        const k = (this.landT / P.landFrames) * (this.landImpact || 1);
        if (KB.SPR[anim]) { squash = P.landSquash * k; opts.scaleX = 1 + squash; opts.scaleY = 1 - squash; }
        else { anim = 'kirby_crouch'; opts.frame = 0; }   // 無 scale 支援時退回蹲下幀
      }
      // 受傷瞬間閃白一幀
      if (this.hurtFlashT > 0) opts.tint = '#ffffff';
      // Round 8（skins）：可解鎖配色 —— 在這裡把精靈名換成配色版（kirby_* 才換，帽子不換）。
      // 覺醒金身 / 無敵糖的 tint 照舊疊在配色版上。
      if (KB.SKINS && KB.SKINS.spr) anim = KB.SKINS.spr(anim);
      let bob = 0;
      if (this.state === 'float') bob = Math.round(Math.sin(this.t * 6) * 1);
      if (this.state === 'ride') {
        bob = Math.round(Math.sin(this.t * 8) * 1);
        // 傳送星畫在卡比腳下（沒有 item_warpstar 就退回 proj_star）
        const star = KB.has('item_warpstar') ? 'item_warpstar' : 'proj_star';
        if (KB.has(star)) g.spr(star, this.cx, this.bottom + 12 + bob, { t: this.t, flip: this.dir < 0, fps: 8 });
      }
      if (this.state === 'swim' && this.swimActT > 0) opts.frame = 1;
      // 變身體型：以腳底中央為錨點放大（帽子同步放大），並套用變身透明度
      const fsc = this.formScale;
      if (fsc !== 1) { opts.scaleX = (opts.scaleX || 1) * fsc; opts.scaleY = (opts.scaleY || 1) * fsc; }
      if (this.form && this.form.alpha !== undefined && opts.alpha === undefined) opts.alpha = this.form.alpha;
      // 覺醒光環（畫在本體之後方＝先畫）
      if (awk && KB.has('fx_awaken_aura')) {
        const fr = ((this.t * 60 / 5) | 0) % 3;
        g.spr('fx_awaken_aura', this.cx, this.cy + bob, { frame: fr, fps: 0, alpha: 0.85, scaleX: fsc, scaleY: fsc });
      }
      if (!(this.form && this.form.hidden)) {
        g.spr(anim, this.cx, this.bottom + bob, opts);
        // 金色釉光：把同一幀用金色剪影半透明疊上去
        if (awk) g.spr(anim, this.cx, this.bottom + bob, Object.assign({}, opts, { tint: ((this.t * 60) >> 2) & 1 ? '#fffce0' : '#ffe040', alpha: awkA }));
      }
      // 帽子
      if (this.ability && this.state !== 'stone' && this.state !== 'door' && this.state !== 'dead' && !(this.form && this.form.hidden)) {
        const d = this.abilityDef; const hat = d && d.hat ? d.hat : 'hat_' + this.ability;
        if (KB.has(hat)) {
          const off = KB.HAT_OFFSET[this.state] || (this.full ? KB.HAT_OFFSET.full : KB.HAT_OFFSET.default);
          const ho = d && d.hatOffset && d.hatOffset[this.state] ? d.hatOffset[this.state] : null;
          const ox = ho ? ho[0] : off[0], oy = ho ? ho[1] : off[1];
          if (oy < 90) {
            const hx = this.cx + ox * this.dir * fsc, hy2 = this.y + oy * fsc + bob + Math.round(squash * 18 * fsc);
            const ho2 = { flip: this.dir < 0, t: this.t, tint: opts.tint, alpha: opts.alpha, scaleX: fsc !== 1 ? fsc : undefined, scaleY: fsc !== 1 ? fsc : undefined };
            g.spr(hat, hx, hy2, ho2);
            if (awk) g.spr(hat, hx, hy2, Object.assign({}, ho2, { tint: '#ffe040', alpha: awkA }));
          }
        }
      }
      // 覺醒冠冕（帽子上方；沒有帽子時直接戴在頭上）
      if (awk && KB.has('hat_awaken_crown') && this.state !== 'stone' && this.state !== 'door' && this.state !== 'dead' && !(this.form && this.form.hidden)) {
        const hy = this.y + bob - (this.ability ? 5 : 0) * fsc;
        g.spr('hat_awaken_crown', this.cx, hy, { flip: this.dir < 0, t: this.t, scaleX: fsc !== 1 ? fsc : undefined, scaleY: fsc !== 1 ? fsc : undefined });
      }
      if (this.form && this.form.draw) { try { this.form.draw(g, this); } catch (e) { } }
      if (KB.DEBUG && KB.showHitbox) g.rect(this.x, this.y, this.w, this.h, 'rgba(0,255,0,0.3)');
    }
  }
  function dt1() { return 1 / 60; }
  KB.Player = Player;
})();
