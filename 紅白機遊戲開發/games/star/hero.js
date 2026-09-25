/*
 * games/star/hero.js — 《星塵勇者》主角：狀態機 + 物理 + 碰撞 + 動畫
 * ---------------------------------------------------------------------------
 * 擁有者：star-hero agent ｜ 依賴：engine/fixed.js（NES.FX / NES.FX.SMB）、engine/input.js
 * 契約：docs/TASKS.md「R2b §契約 / 主角」、docs/ENGINE_API.md §3（FX 與 SMB 跳躍規則）、§4（Input）
 *
 * 物理**全部**走 `NES.FX.SMB`（SMBDIS.ASM 反組譯常數 + R1 fix1 定案的唯一一套跳躍規則）：
 *   長按靜止跳 64.00 px（4 格）、全速跑跳 80.00 px（5 格）、點按 1 幀 19.6875 px
 *   （起跳首幀半格重力 `skipGravityFirstFrame`；games/demo 與 tools/test_core.py 量到同一組數字）
 *
 * 每幀順序（與 games/demo/main.js 相同，手感才會一致）：
 *   ① 讀輸入 → ② 水平加速 / 摩擦（B 跑、轉身 ×2）→ ③ 起跳 `SMB.jumpStart`
 *   → ④ 重力 `SMB.jumpGravity`（首幀半格）→ ⑤ 移動 X + 磚碰撞 → ⑥ 移動 Y + 磚碰撞
 *      （單向平台只在「下墜且前一幀腳在平台面之上」時擋；蹲 + A 可穿下）
 *   → ⑦ 危險磚（尖刺受傷 / 熔岩死亡）與互動磚（金幣 / GOAL）掃描 → ⑧ 狀態機 → ⑨ 動畫
 *
 * 斜坡：`ST.solidKind` 若回報 'slopeL' / 'slopeR'，本版**一律當成整塊 solid**處理
 *   （不做逐像素爬坡）。理由與追蹤見 docs/PROGRESS.md「star-hero（R2b）§已知問題」。
 *
 * 與 main.js 的介面：`update(h, g)` 的 `g` 必須提供
 *   input, cols, tileAt(col,row), kindAt(col,row), isLava(tile),
 *   onTouch(col,row,tile)（金幣 / GOAL 等互動，由 main 處理），
 *   onBump(col,row)（頂到磚的那一格），sfx(name)（音效，可為 no-op）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var ST = window.ST = window.ST || {};
  var FX = NES.FX;
  if (!FX || !FX.SMB) throw new Error('games/star/hero.js 需要 engine/fixed.js（NES.FX.SMB）');
  var SMB = FX.SMB;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var W = 12, H = 22, CROUCH_H = 14, DH = H - CROUCH_H;   // 蹲下時碰撞框變矮 8 px（腳不動 ⇒ y 下移 8）
  var SPR_W = 16, SPR_H = 24;
  var OFF_X = -2, OFF_Y = -2;                    // 碰撞框 → 精靈左上角的偏移
  var MAX_FALL = FX.v88(4, 0);                   // 下墜上限 4 px/幀（同 demo / SMB）
  var BOUNCE = -FX.v88(3, 0);                    // 踩敵回彈 −3 px/幀（契約：R2b「踩敵（回彈 -3）」）
  var HURT_VY = -FX.v88(1, 128);                 // 受傷彈起 1.5 px/幀（只有站在地上時才彈）
  var HURT_VX = FX.v88(0, 160);                  // 受傷擊退 0.625 px/幀（夠有感、又不會被推進坑裡）
  var INV_FRAMES = 120;                          // 契約 R2b：受傷無敵 120 幀（SMB 原版是 8×21 = 168）
  var HURT_FRAMES = 12;                          // 受傷硬直（無法操作）
  var DEATH_FRAMES = 60;                         // 死亡動畫：跳起 → 落出畫面
  var DROP_FRAMES = 10;                          // 蹲 + A 穿過單向平台的無視幀數
  var COIN_1UP = 100;                            // 100 金幣 → 1UP
  var ROWS = 30, TOP_ROW = 4;                    // 名稱表 30 列；列 0..3 是 HUD（split 上段）

  function create() {
    var h = {
      // --- 契約欄位（整數 px / 對外唯讀）---
      x: 0, y: 0, w: W, h: H, vx: 0, vy: 0,
      state: 'idle', facing: 1, onGround: true,
      inv: 0, coins: 0, lives: 3, score: 0, power: 0,
      // R3 star-w2：無敵星（熔岩 / 尖刺 / 火柱 / 坑都不致命，撞到敵人直接打倒）
      star: 0, stars: 0, onMover: null, pitSaves: 0,
      // --- 內部（定點數）---
      px: FX.Vec(0), py: FX.Vec(0), vxA: FX.Acc(0), vyA: FX.Acc(0),
      jumpS: null,
      crouch: false, sliding: false, turning: false,
      anim: 0, animTimer: 0,
      prevFeet: 0, jumpApexSub: 0, jumpStartSub: 0,
      hurtTimer: 0, deadTimer: 0, deadDone: false, dropThru: 0,
      stomps: 0, hits: 0, bumps: 0, deaths: 0, oneUps: 0,
      frames: 0, lastJumpFrame: -1
    };
    h.jumpS = SMB.jumpState(h.vyA);
    return h;
  }

  function reset(h, x, y, facing) {
    FX.vsetPx(h.px, x | 0); FX.vsetPx(h.py, y | 0);
    FX.aset(h.vxA, 0); FX.aset(h.vyA, 0);
    h.jumpS = SMB.jumpState(h.vyA);
    h.state = 'idle'; h.facing = facing || 1; h.onGround = false;
    h.crouch = false; h.sliding = false; h.turning = false;
    h.anim = 0; h.animTimer = 0;
    h.inv = 0; h.hurtTimer = 0; h.deadTimer = 0; h.deadDone = false; h.dropThru = 0;
    h.star = 0; h.onMover = null;
    h.prevFeet = (y | 0) + H;
    h.jumpApexSub = h.py.sub; h.jumpStartSub = h.py.sub;
    sync(h);
    return h;
  }

  function boxH(h) { return h.crouch ? CROUCH_H : H; }

  function sync(h) {
    h.x = FX.floorPx(h.px.sub);
    h.y = FX.floorPx(h.py.sub);
    h.h = boxH(h);
    h.vx = h.vxA.v;
    h.vy = h.vyA.v;
  }

  /* ------------------------------------------------------------ 磚查詢 */

  // 關卡外的語意：左右牆 = solid（擋住）；上方 = none（不擋頭）；下方 = none（掉出畫面 → 死）
  function kindAt(g, col, row) {
    if (col < 0 || col >= g.cols) return 'solid';
    if (row < TOP_ROW || row >= ROWS) return 'none';
    var k = g.kindAt(col, row);
    if (k === 'slopeL' || k === 'slopeR') return 'solid';   // 本版斜坡當整塊（見檔頭）
    return k || 'none';
  }

  function blocksH(g, x, y, hh) {
    var col0 = x >> 3, col1 = (x + 0) >> 3;
    var r, rows = [y, y + ((hh / 2) | 0), y + hh - 1];
    for (r = 0; r < rows.length; r++) {
      if (kindAt(g, x >> 3, rows[r] >> 3) === 'solid') return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- 動作 */

  function setCrouch(h, g, on) {
    if (on === h.crouch) return;
    if (on) {
      FX.vsetSub(h.py, h.py.sub + DH * FX.SUB);
      h.crouch = true;
    } else {
      // 站起來要有空間（頭上 8 px 內不能有 solid）
      var x = FX.floorPx(h.px.sub), ny = FX.floorPx(h.py.sub) - DH;
      if (kindAt(g, x >> 3, ny >> 3) === 'solid' || kindAt(g, (x + W - 1) >> 3, ny >> 3) === 'solid') return;
      FX.vsetSub(h.py, h.py.sub - DH * FX.SUB);
      h.crouch = false;
    }
  }

  function stomp(h) {
    SMB.jumpBounce(h.jumpS, BOUNCE, h.py.sub);
    h.onGround = false;
    h.stomps++;
    return true;
  }

  /* R3 star-w2：被機關彈飛（蒸氣彈簧）。
   * 先用 `jumpStart` 依當下水平速度選好 SMB 的那一段重力（不然會沿用上一次跳躍的段，
   * 高度會隨「上一次怎麼跳的」而變 ⇒ 不可重現），再把初速覆寫成機關給的值。
   * 按住 A ⇒ gHold（彈更高）、放開 ⇒ gFall，手感與一般跳躍一致。 */
  // 機關彈飛專用的跳躍段：上升 / 下降都用 SMB 的「按住 A」小重力（0.125 px/幀²）
  //   ⇒ 高度 = v²/2g，只跟機關給的初速有關（−5 px/幀 = 100 px ≈ 12 格），
  //     不會因為玩家有沒有按住 A 而變，機器人也推得準。
  var LAUNCH_SEG = { belowSpeed: Infinity, vy0: 0, gHold: SMB.jump[0].gHold, gFall: SMB.jump[0].gHold, h: 0 };
  function launch(h, vel) {
    h.jumpS.seg = LAUNCH_SEG;
    FX.aset(h.vyA, vel | 0);
    h.jumpS.fastFall = false;
    h.jumpS.first = true;
    h.jumpS.startSub = h.py.sub;
    h.onGround = false;
    h.crouch = false;
    h.jumpStartSub = h.py.sub;
    h.jumpApexSub = h.py.sub;
    return h;
  }

  function hurt(h, g, fromX) {
    if (h.inv > 0 || h.star > 0 || h.state === 'dead') return false;
    h.inv = INV_FRAMES;
    h.hurtTimer = HURT_FRAMES;
    h.hits++;
    var dir = (fromX === undefined || fromX === null) ? -h.facing : (h.x < fromX ? -1 : 1);
    if (h.onGround) {
      // 站在地上被打：往後擊退 + 彈起（看得出來被打到）
      FX.aset(h.vxA, dir * HURT_VX);
      SMB.jumpBounce(h.jumpS, HURT_VY, h.py.sub);
      h.onGround = false;
    }
    // **空中被打完全不動水平動量**（不反推、也不減速）：空中無法再加速（SMB 規則），
    // 在坑 / 熔岩 / 天空關的空中被反推就是必死，會把關卡變成運氣遊戲。
    // 代價只有「無敵 120 幀 + 閃爍」，跟站在地上被打一樣。
    h.state = 'hurt';
    if (g && g.sfx) g.sfx('hurt');
    return true;
  }

  function kill(h, g) {
    if (h.state === 'dead') return false;
    if (h.crouch) setCrouch(h, g, false);
    h.state = 'dead';
    h.deadTimer = 0;
    h.deadDone = false;
    h.deaths++;
    h.inv = 0; h.hurtTimer = 0;
    FX.aset(h.vxA, 0);
    SMB.jumpBounce(h.jumpS, -FX.v88(4, 0), h.py.sub);
    h.onGround = false;
    if (g && g.sfx) g.sfx('death');    // ST.Audio 的音效名是 death（舊版寫 die ⇒ 靜默失敗，qa2-star P2-2 的 warn 抓到）
    return true;
  }

  function addCoin(h, g, n) {
    h.coins += (n === undefined ? 1 : n);
    while (h.coins >= COIN_1UP) { h.coins -= COIN_1UP; h.lives++; h.oneUps++; if (g && g.sfx) g.sfx('powerup'); }
  }

  /* -------------------------------------------------------------- 每幀 */

  function deathStep(h, g) {
    h.deadTimer++;
    SMB.jumpGravity(h.jumpS, false, h.py.sub, MAX_FALL);
    FX.vadd(h.py, h.vyA.v);
    if (h.deadTimer >= DEATH_FRAMES) h.deadDone = true;
    sync(h);
  }

  function update(h, g) {
    h.frames++;
    if (h.state === 'dead') { deathStep(h, g); return h; }

    var input = g.input || NES.Input;
    var hurting = h.hurtTimer > 0;
    if (hurting) h.hurtTimer--;

    var right = !hurting && input.held(BTN.RIGHT);
    var left = !hurting && input.held(BTN.LEFT);
    var down = !hurting && input.held(BTN.DOWN);
    var runBtn = !hurting && input.held(BTN.B);
    var aHeld = !hurting && input.held(BTN.A);
    var aPress = !hurting && input.pressed(BTN.A);
    var dir = (right ? 1 : 0) - (left ? 1 : 0);

    if (h.dropThru > 0) h.dropThru--;

    // ---- ① 蹲 / 站（只在地面切換）----
    if (h.onGround) setCrouch(h, g, down);
    else if (h.crouch) setCrouch(h, g, false);

    // ---- ② 水平加速 / 摩擦（SMB：空中要 |vx| ≥ $19 才沿用跑步參數）----
    var maxSpd, acc;
    if (h.onGround) {
      maxSpd = runBtn ? SMB.maxRun : SMB.maxWalk;
      acc = runBtn ? SMB.accRun : SMB.accWalk;
    } else if (FX.abs(h.vxA.v) >= SMB.airRunSpeed) {
      maxSpd = SMB.maxRun; acc = SMB.accRun;
    } else {
      maxSpd = SMB.maxWalk; acc = SMB.accWalk;
    }
    h.turning = false;
    if (dir !== 0 && !h.crouch) {
      if (h.vxA.v !== 0 && FX.sign(h.vxA.v) === -dir) { acc = acc << SMB.turnShift; h.turning = true; }
      FX.aapproach(h.vxA, dir * maxSpd, acc);
      h.facing = dir;
    } else if (h.onGround) {
      FX.aapproach(h.vxA, 0, SMB.friction);
    }

    // ---- ③ 起跳（蹲著按 A 且腳下是單向平台 ⇒ 穿下去）----
    if (h.onGround && aPress) {
      if (h.crouch && onewayBelow(h, g)) {
        h.dropThru = DROP_FRAMES;
        h.onGround = false;
        FX.vsetSub(h.py, h.py.sub + FX.SUB);          // 先沉 1 px 脫離平台面
      } else {
        SMB.jumpStart(h.jumpS, FX.abs(h.vxA.v), h.py.sub);
        h.onGround = false;
        h.jumpStartSub = h.py.sub;
        h.jumpApexSub = h.py.sub;
        h.lastJumpFrame = h.frames;
        if (g.sfx) g.sfx('jump');
      }
    }

    // ---- ④ 重力（按住 A = 小重力；放開且離地 ≥ 1px = 大重力；起跳首幀半格）----
    if (!h.onGround) SMB.jumpGravity(h.jumpS, aHeld, h.py.sub, MAX_FALL);

    // ---- ⑤ 移動 X + 磚碰撞 ----
    var hh = boxH(h);
    h.prevFeet = FX.floorPx(h.py.sub) + hh;
    FX.vadd(h.px, h.vxA.v);
    var x = FX.floorPx(h.px.sub), y = FX.floorPx(h.py.sub);
    if (h.vxA.v > 0) {
      if (blocksH(g, x + W - 1, y, hh)) {
        x = ((((x + W - 1) >> 3) << 3) - W);
        FX.vsetPx(h.px, x); FX.aset(h.vxA, 0);
      }
    } else if (h.vxA.v < 0) {
      if (blocksH(g, x, y, hh)) {
        x = (((x >> 3) + 1) << 3);
        FX.vsetPx(h.px, x); FX.aset(h.vxA, 0);
      }
    }
    if (x < 0) { x = 0; FX.vsetPx(h.px, 0); if (h.vxA.v < 0) FX.aset(h.vxA, 0); }
    var maxX = g.cols * 8 - W;
    if (x > maxX) { x = maxX; FX.vsetPx(h.px, x); FX.aset(h.vxA, 0); }

    // ---- ⑥ 移動 Y + 磚碰撞 ----
    FX.vadd(h.py, h.vyA.v);
    y = FX.floorPx(h.py.sub);
    if (h.vyA.v >= 0) {
      var feet = y + hh, frow = feet >> 3, hitFloor = false;
      if (solidFoot(g, x, frow, h) || solidFoot(g, x + W - 1, frow, h)) hitFloor = true;
      if (hitFloor) {
        y = (frow << 3) - hh;
        FX.vsetPx(h.py, y); FX.aset(h.vyA, 0);
        h.onGround = true;
      } else {
        h.onGround = false;
      }
    } else {
      h.onGround = false;
      var hrow = y >> 3;
      var c0 = x >> 3, c1 = (x + W - 1) >> 3;
      var hitL = kindAt(g, c0, hrow) === 'solid', hitR = kindAt(g, c1, hrow) === 'solid';
      if (hitL || hitR) {
        y = ((hrow + 1) << 3);
        FX.vsetPx(h.py, y); FX.aset(h.vyA, 0);
        // 頂磚：以主角中心所在的那一欄優先（SMB 的判定方式）
        var cc = (x + (W >> 1)) >> 3;
        if (kindAt(g, cc, hrow) !== 'solid') cc = hitL ? c0 : c1;
        h.bumps++;
        if (g.onBump) g.onBump(cc, hrow);
      }
    }
    if (h.py.sub < h.jumpApexSub) h.jumpApexSub = h.py.sub;

    // ---- ⑦ 危險 / 互動磚 ----
    sync(h);
    scanTiles(h, g);
    if (h.state === 'dead') return h;
    if (h.y > 240) {                               // 掉出畫面（坑）
      // R3 star-w2：無敵星（含一鍵密技的無敵）時交給 main 的 onPitSave 拉回來，不扣命。
      // 收掉 R2c fix5「留給後續」的「一鍵無敵擋不住熔岩 / 掉坑」。
      if (h.star > 0 && g.onPitSave && g.onPitSave(h)) { h.pitSaves++; sync(h); return h; }
      kill(h, g); return h;
    }

    // ---- ⑧ 狀態機 ----
    if (h.inv > 0) h.inv--;
    if (h.star > 0 && --h.star === 0 && g.onStarEnd) g.onStarEnd(h);
    var absv = FX.abs(h.vxA.v);
    if (h.hurtTimer > 0) {
      h.state = 'hurt';
    } else if (!h.onGround) {
      h.state = h.vyA.v < 0 ? 'jump' : 'fall';
    } else if (h.crouch) {
      h.state = (absv >= SMB.maxWalk) ? 'slide' : 'crouch';
    } else if (absv === 0) {
      h.state = 'idle';
    } else {
      h.state = (absv > SMB.maxWalk) ? 'run' : 'walk';
    }
    h.sliding = (h.state === 'slide');

    // ---- ⑨ 動畫 ----
    if (h.state === 'walk' || h.state === 'run') {
      var delay = absv >= SMB.maxWalk ? 2 : 4;
      if (++h.animTimer >= delay) { h.animTimer = 0; h.anim = (h.anim + 1) & 3; }
    } else if (h.state === 'idle' || h.state === 'crouch') {
      h.anim = 0; h.animTimer = 0;
    }

    sync(h);
    return h;
  }

  // 腳下這一欄能不能站（solid 永遠可；單向平台只在「前一幀腳在平台面之上」且沒在穿越時可）
  function solidFoot(g, px, frow, h) {
    var col = px >> 3, k = kindAt(g, col, frow);
    if (k === 'solid') return true;
    if (k === 'oneway') {
      if (h.dropThru > 0) return false;
      if (h.vyA.v < 0) return false;            // 上升中一律穿過
      return h.prevFeet <= (frow << 3);         // 站著不動（vy = 0）也要撐住
    }
    return false;
  }

  function onewayBelow(h, g) {
    var x = FX.floorPx(h.px.sub), frow = (FX.floorPx(h.py.sub) + boxH(h)) >> 3;
    return kindAt(g, x >> 3, frow) === 'oneway' || kindAt(g, (x + W - 1) >> 3, frow) === 'oneway';
  }

  // 掃描碰撞框覆蓋到的每一格：危險磚（尖刺 = 受傷、熔岩 = 死亡）與互動磚（交給 main）
  function scanTiles(h, g) {
    var hh = boxH(h);
    var c0 = h.x >> 3, c1 = (h.x + W - 1) >> 3;
    var r0 = h.y >> 3, r1 = (h.y + hh - 1) >> 3;
    var col, row, k, t, lava = false, spike = false;
    for (col = c0; col <= c1; col++) {
      if (col < 0 || col >= g.cols) continue;
      for (row = r0; row <= r1; row++) {
        if (row < TOP_ROW || row >= ROWS) continue;
        t = g.tileAt(col, row);
        k = g.kindAt(col, row);
        if (k === 'hurt') { if (g.isLava && g.isLava(t)) lava = true; else spike = true; }
        if (g.onTouch) g.onTouch(col, row, t);
      }
    }
    if (h.star > 0) return;                    // R3 star-w2：無敵星無視熔岩 / 尖刺
    if (lava) { kill(h, g); return; }
    if (spike) hurt(h, g, null);
  }

  /* -------------------------------------------------------------- 繪製 */

  // 依狀態挑「上半身 + 腳」的磚名；蹲 / 滑只有一組 16×16
  function frameNames(h) {
    var A = ST.HERO_ART || null;
    var walk = A ? A.walk : [0, 1, 0, 2];
    // 走路 3 幀**上半身也換**（手臂前後擺動 ±1 px，qa2-star P2-4 ④）
    var bodies = (A && A.bodies) || ['H_BODY', 'H_BW1', 'H_BW2'];
    switch (h.state) {
      case 'dead': return { body: 'H_BDEAD', leg: 'H_LD' };
      case 'pole': return { body: 'H_BJUMP', leg: 'H_LJ' };   // R3：抓旗桿下滑
      case 'hurt': return { body: 'H_BHURT', leg: 'H_LH' };
      case 'crouch': return { single: 'H_CR' };
      case 'slide': return { single: 'H_SL' };
      case 'jump': return { body: 'H_BJUMP', leg: 'H_LJ' };
      case 'fall': return { body: 'H_BJUMP', leg: 'H_LF' };
      case 'idle': return { body: 'H_BODY', leg: 'H_L0' };
      default:
        if (h.turning) return { body: 'H_BODY', leg: 'H_LT' };
        var f = walk[h.anim & 3];
        return { body: bodies[f] || bodies[0], leg: 'H_L' + f };
    }
  }

  // oam：main.js 的 OAM 配置器（begin/add/end，同 NES.SH.OAM 契約）
  // tiles：{ 磚名 → OAM tile 值 }（main.js 在 init 時用 bank.index(name)|1 算好）
  function draw(h, g, oam, tiles, camX) {
    if (h.state === 'dead' && h.deadDone) return 0;
    if (h.inv > 0 && (h.inv & 2) !== 0) return 0;          // 無敵閃爍：2 幀顯示 / 2 幀隱藏
    var f = frameNames(h);
    var flip = h.facing < 0;
    var sx = h.x + OFF_X - camX;
    var sy = h.y + OFF_Y;
    var n = 0;
    // R3 star-w2：無敵星期間調色盤輪替（SMB 的閃色做法；不增加同屏色數）
    var pal = (h.star > 0) ? ((h.frames >> 2) & 3) : 0;
    function put(name, dx, dy) {
      var t = tiles[name];
      if (t === undefined) return;
      oam.add({ x: sx + dx, y: sy + dy, tile: t, pal: pal, flipH: flip, prio: 0 });
      n++;
    }
    if (f.single) {
      // 蹲 / 滑：16×16，腳對齊碰撞框底部
      var dy = boxH(h) + 2 - 16;
      put(f.single + (flip ? '_TR' : '_TL'), 0, dy);
      put(f.single + (flip ? '_TL' : '_TR'), 8, dy);
    } else {
      put(f.body + (flip ? '_TR' : '_TL'), 0, 0);
      put(f.body + (flip ? '_TL' : '_TR'), 8, 0);
      put(f.leg + (flip ? '_R' : '_L'), 0, 16);
      put(f.leg + (flip ? '_L' : '_R'), 8, 16);
    }
    return n;
  }

  // 本模組會用到的所有磚名（main.js 據此把名稱 → OAM tile 值算好）
  function tileNames() {
    var out = [], bodies = ['H_BODY', 'H_BW1', 'H_BW2', 'H_BJUMP', 'H_BHURT', 'H_BDEAD', 'H_CR', 'H_SL'];
    var legs = ['H_L0', 'H_L1', 'H_L2', 'H_LJ', 'H_LF', 'H_LT', 'H_LH', 'H_LD'];
    var i;
    for (i = 0; i < bodies.length; i++) { out.push(bodies[i] + '_TL'); out.push(bodies[i] + '_TR'); }
    for (i = 0; i < legs.length; i++) { out.push(legs[i] + '_L'); out.push(legs[i] + '_R'); }
    out.push('H_COIN');
    return out;
  }

  ST.Hero = {
    W: W, H: H, CROUCH_H: CROUCH_H, SPR_W: SPR_W, SPR_H: SPR_H,
    OFF_X: OFF_X, OFF_Y: OFF_Y, LAUNCH_SEG: LAUNCH_SEG,
    MAX_FALL: MAX_FALL, BOUNCE: BOUNCE,
    INV_FRAMES: INV_FRAMES, HURT_FRAMES: HURT_FRAMES, DEATH_FRAMES: DEATH_FRAMES,
    DROP_FRAMES: DROP_FRAMES, COIN_1UP: COIN_1UP,
    ROWS: ROWS, TOP_ROW: TOP_ROW,
    create: create, reset: reset, update: update, draw: draw,
    stomp: stomp, hurt: hurt, kill: kill, addCoin: addCoin, launch: launch,
    setCrouch: setCrouch, boxH: boxH, sync: sync,
    frameNames: frameNames, tileNames: tileNames
  };
})();
