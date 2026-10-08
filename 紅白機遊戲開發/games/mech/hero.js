/*
 * games/mech/hero.js — 《星塵機甲》主角：狀態機 + 物理 + 碰撞 + 射擊 / 蓄力 + 梯子 + 滑行
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 依賴：engine/fixed.js（NES.FX）、engine/input.js
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約 / 主角」、docs/ENGINE_API.md §3（FX）、§4（Input）
 *
 * 手感來源：`docs/research/03_經典遊戲深度解析/03_洛克人2.md` ②「手感規則」
 *   ① **沒有加速度**：按下方向鍵立即達到定速 1.375 px/幀，放開立即停止（與 SMB 的慣性相反）[源]
 *   ② 空中可完全轉向、完全控制水平移動（無空中慣性）[源]
 *   ③ 跳躍高度可變：按住 A 跳滿 ≈ 3.5 格磚（56 px）；**放開 A 立刻停止上升**（不是減速）[源]
 *   ④ 普通彈畫面上同時最多 **3 發**[源]
 *   ⑤ 受傷 = 強制後退（knockback）+ 短暫無敵（本作 90 幀）[源]
 *   ⑥ 梯子：爬梯時可射擊（面向固定）、按 A 可直接鬆手落下、梯頂要完整爬出才算落地 [源]
 *   ⑦ 尖刺即死 [源]
 *
 * 數字（全部整數定點數，與引擎同單位；`tools/../games/mech/test_mech.py` 逐項對照）：
 *   WALK 1.375 px/幀 = `v88(1, 96)`　SLIDE 2.5 px/幀 = `v88(2, 128)`，滑行 26 幀
 *   GRAV 0.25 px/幀² = 64 vel/幀（起跳首幀半格 = 32，同 engine 的 leapfrog 定案）
 *   JUMP_VY −5.293 px/幀 = `−v88(5, 75)` ⇒ 跳高 = v²/2g = **56.03 px**（3.5 格，研究 ③）
 *   MAX_FALL 6 px/幀　CLIMB 1.25 px/幀　無敵 90 幀　受傷硬直 16 幀
 *   蓄力：按住 B **30 幀 = 中段（2 傷）**、**60 幀 = 全蓄力（3 傷）**（研究 ⑤ Atomic Fire 的家族規則）
 *
 * 與 main.js 的介面：`update(h, g)` 的 `g` 必須提供
 *   input, cols, rows, kindAt(col,row), tileAt(col,row),
 *   fire(h, charge)（發射，由 weapons.js 決定彈種 / 耗能，回傳是否真的發射），
 *   canFire(h)（武器能量夠不夠 / 彈數上限），
 *   onLand(h)、sfx(name)
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var MG = window.MG = window.MG || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/mech/hero.js 需要 engine/fixed.js（NES.FX）');
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var W = 12, H = 24, SLIDE_H = 16, DH = H - SLIDE_H;
  var SPR_W = 16, SPR_H = 24, OFF_X = -2, OFF_Y = 0;
  var WALK = FX.v88(1, 96);            // 1.375 px/幀（研究 ①）
  var SLIDE_V = FX.v88(2, 128);        // 2.5 px/幀
  var SLIDE_FRAMES = 26;
  var GRAV = 64;                       // 0.25 px/幀²（vel 單位）
  var GRAV_HALF = 32;                  // 起跳首幀半格（engine leapfrog 定案，ENGINE_API §3）
  var JUMP_VY = -FX.v88(5, 75);        // −5.2930 px/幀 ⇒ 56.03 px
  var MAX_FALL = FX.v88(6, 0);
  var CLIMB = FX.v88(1, 64);           // 1.25 px/幀
  var INV_FRAMES = 90;
  var HURT_FRAMES = 16;
  var KNOCK_VX = FX.v88(1, 0);         // 受傷擊退 1 px/幀（研究 ⑤：足以把玩家推下懸崖）
  var DEATH_FRAMES = 72;
  var SHOOT_HOLD = 14;                 // 手臂砲前伸幀數
  var CHARGE_MID = 30, CHARGE_FULL = 60;
  var LIFE_MAX = 28;                   // 研究 ③「魔王 HP 統一 28」⇒ 主角血條也用 28
  var ROWS = 30, COLS = 32;

  function create() {
    var h = {
      x: 0, y: 0, w: W, h: H, vx: 0, vy: 0,
      state: 'idle', facing: 1, onGround: false,
      inv: 0, life: LIFE_MAX, lives: 3, tanks: 0,
      sliding: false, slideT: 0, climbing: false, climbCol: -1,
      shootT: 0, chargeT: 0, charging: false, chargeReady: 0,
      hurtT: 0, deadT: 0, deadDone: false, jumpHeld: false, prevFeet: 0,
      anim: 0, animTimer: 0, frames: 0,
      // 統計（測試 / 機器人用）
      shots: 0, hits: 0, deaths: 0, jumps: 0, slides: 0, climbs: 0, lastJumpFrame: -1,
      apexSub: 0, jumpStartSub: 0,
      px: FX.Vec(0), py: FX.Vec(0), vxA: FX.Acc(0), vyA: FX.Acc(0)
    };
    return h;
  }

  function reset(h, x, y, facing) {
    FX.vsetPx(h.px, x | 0); FX.vsetPx(h.py, y | 0);
    FX.aset(h.vxA, 0); FX.aset(h.vyA, 0);
    h.state = 'idle'; h.facing = facing || 1; h.onGround = false;
    h.sliding = false; h.slideT = 0; h.climbing = false; h.climbCol = -1;
    h.shootT = 0; h.chargeT = 0; h.charging = false; h.chargeReady = 0;
    h.inv = 0; h.hurtT = 0; h.deadT = 0; h.deadDone = false; h.jumpHeld = false;
    h.anim = 0; h.animTimer = 0;
    h.prevFeet = (y | 0) + H;
    h.apexSub = h.py.sub; h.jumpStartSub = h.py.sub;
    sync(h);
    return h;
  }

  function boxH(h) { return h.sliding ? SLIDE_H : H; }
  function sync(h) {
    h.x = FX.floorPx(h.px.sub);
    h.y = FX.floorPx(h.py.sub);
    h.h = boxH(h);
    h.vx = h.vxA.v;
    h.vy = h.vyA.v;
  }

  /* ------------------------------------------------------------ 磚查詢 */
  // 房間外的語意：左右 = none（讓 main 判房間切換）、上 = solid（不能跳出去）、下 = none（掉出去）
  function kindAt(g, col, row) {
    if (col < 0 || col >= COLS) return 'none';
    if (row < 0) return 'solid';
    if (row >= ROWS) return 'none';
    return g.kindAt(col, row) || 'none';
  }
  function solidAt(g, col, row) { return kindAt(g, col, row) === 'solid'; }
  function ladderAt(g, col, row) { return kindAt(g, col, row) === 'ladder'; }
  function blocksH(g, x, y, hh) {
    var col = x >> 3;
    return solidAt(g, col, y >> 3) || solidAt(g, col, (y + (hh >> 1)) >> 3) || solidAt(g, col, (y + hh - 1) >> 3);
  }
  function centerCol(h) { return (h.x + (W >> 1)) >> 3; }

  /* -------------------------------------------------------------- 動作 */

  function startSlide(h, g) {
    if (h.sliding) return false;
    h.sliding = true;
    h.slideT = SLIDE_FRAMES;
    h.slides++;
    FX.vsetSub(h.py, h.py.sub + DH * FX.SUB);      // 碰撞框變矮 8 px（腳不動 ⇒ y 下移）
    if (g && g.sfx) g.sfx('slide');
    return true;
  }
  // 站起來要有空間（頭上 8 px 內不能有 solid）；站不起來就繼續滑
  function endSlide(h, g) {
    if (!h.sliding) return true;
    var x = FX.floorPx(h.px.sub), ny = FX.floorPx(h.py.sub) - DH;
    if (solidAt(g, x >> 3, ny >> 3) || solidAt(g, (x + W - 1) >> 3, ny >> 3)) return false;
    FX.vsetSub(h.py, h.py.sub - DH * FX.SUB);
    h.sliding = false;
    h.slideT = 0;
    return true;
  }

  function jump(h, g) {
    FX.aset(h.vyA, JUMP_VY);
    h.onGround = false;
    h.jumpHeld = true;
    h.jumpStartSub = h.py.sub;
    h.apexSub = h.py.sub;
    h.jumps++;
    h.lastJumpFrame = h.frames;
    h.firstGravFrame = true;
    if (g && g.sfx) g.sfx('jump');
    return true;
  }

  function grabLadder(h, g, col) {
    h.climbing = true;
    h.climbCol = col;
    h.climbs++;
    if (h.sliding) endSlide(h, g);
    FX.vsetPx(h.px, col * 8 - ((W - 8) >> 1));     // 對齊梯子中心
    FX.aset(h.vxA, 0); FX.aset(h.vyA, 0);
    h.onGround = false;
    h.state = 'climb';
    return true;
  }
  function releaseLadder(h) {
    h.climbing = false;
    h.climbCol = -1;
    FX.aset(h.vyA, 0);
    h.firstGravFrame = true;
    return true;
  }

  function hurt(h, g, dmg, fromX) {
    if (h.inv > 0 || h.state === 'dead') return false;
    h.life -= (dmg === undefined ? 2 : dmg) | 0;
    h.hits++;
    if (h.life <= 0) { h.life = 0; kill(h, g); return true; }
    h.inv = INV_FRAMES;
    h.hurtT = HURT_FRAMES;
    if (h.climbing) releaseLadder(h);
    if (h.sliding) endSlide(h, g);
    var dir = (fromX === undefined || fromX === null) ? -h.facing : (h.x < fromX ? -1 : 1);
    FX.aset(h.vxA, dir * KNOCK_VX);
    FX.aset(h.vyA, 0);
    h.firstGravFrame = false;
    h.state = 'hurt';
    h.chargeT = 0; h.charging = false;
    if (g && g.sfx) g.sfx('hurt');
    return true;
  }

  function kill(h, g) {
    if (h.state === 'dead') return false;
    h.state = 'dead';
    h.life = 0;
    h.deadT = 0;
    h.deadDone = false;
    h.deaths++;
    h.inv = 0; h.hurtT = 0;
    h.climbing = false;
    if (h.sliding) { h.sliding = false; h.slideT = 0; }
    FX.aset(h.vxA, 0); FX.aset(h.vyA, 0);
    if (g && g.sfx) g.sfx('die');
    return true;
  }

  function heal(h, n) {
    h.life += n | 0;
    if (h.life > LIFE_MAX) h.life = LIFE_MAX;
    return h.life;
  }

  /* -------------------------------------------------------------- 每幀 */

  function gravity(h) {
    var g1 = h.firstGravFrame ? GRAV_HALF : GRAV;
    h.firstGravFrame = false;
    var v = h.vyA.v + g1;
    if (v > MAX_FALL) v = MAX_FALL;
    FX.aset(h.vyA, v);
  }

  function update(h, g) {
    h.frames++;
    if (h.state === 'dead') {
      h.deadT++;
      if (h.deadT >= DEATH_FRAMES) h.deadDone = true;
      sync(h);
      return h;
    }

    var input = g.input || NES.Input;
    var hurting = h.hurtT > 0;
    if (hurting) h.hurtT--;

    var right = !hurting && input.held(BTN.RIGHT);
    var left = !hurting && input.held(BTN.LEFT);
    var up = !hurting && input.held(BTN.UP);
    var down = !hurting && input.held(BTN.DOWN);
    var aHeld = !hurting && input.held(BTN.A);
    var aPress = !hurting && input.pressed(BTN.A);
    var bHeld = !hurting && input.held(BTN.B);
    var bPress = !hurting && input.pressed(BTN.B);
    var bRel = input.released(BTN.B);
    var dir = (right ? 1 : 0) - (left ? 1 : 0);

    if (h.shootT > 0) h.shootT--;

    /* ---- ① 射擊 / 蓄力（蓄力只在「有蓄力能力的武器」上成立，由 g.canCharge 決定）---- */
    if (bHeld && !h.charging && g.canCharge && g.canCharge(h)) { h.charging = true; h.chargeT = 0; }
    if (h.charging) {
      if (bHeld) { if (h.chargeT < CHARGE_FULL) h.chargeT++; }
      else {
        var lvl = h.chargeT >= CHARGE_FULL ? 2 : (h.chargeT >= CHARGE_MID ? 1 : 0);
        h.charging = false; h.chargeT = 0;
        if (g.fire && g.fire(h, lvl)) { h.shootT = SHOOT_HOLD; h.shots++; }
      }
    } else if (bPress) {
      if (g.fire && g.fire(h, 0)) { h.shootT = SHOOT_HOLD; h.shots++; }
    }
    void bRel;

    /* ---- ② 梯子 ---- */
    var cc = centerCol(h);
    if (h.climbing) {
      // 爬梯時可射擊（面向固定，研究 ⑥）；A = 鬆手落下
      if (aPress) {
        releaseLadder(h);
      } else {
        if (up) FX.vadd(h.py, -CLIMB);
        else if (down) FX.vadd(h.py, CLIMB);
        sync(h);
        var feetRow = (h.y + H - 1) >> 3, cl = centerCol(h);
        if (!ladderAt(g, cl, feetRow) && !ladderAt(g, cl, (h.y + 12) >> 3)) {
          // 爬出梯頂：腳已離開梯子 ⇒ 若腳下是 solid 就站上去，否則改成落下
          var belowRow = (h.y + H) >> 3;
          if (solidAt(g, h.x >> 3, belowRow) || solidAt(g, (h.x + W - 1) >> 3, belowRow)) {
            FX.vsetPx(h.py, (belowRow << 3) - H);
            h.onGround = true;
            releaseLadder(h);
            h.state = 'idle';
          } else if (!ladderAt(g, cl, feetRow)) {
            releaseLadder(h);
          }
        } else if (down) {
          // 往下爬到地面
          var br = (h.y + H) >> 3;
          if (solidAt(g, h.x >> 3, br) || solidAt(g, (h.x + W - 1) >> 3, br)) {
            FX.vsetPx(h.py, (br << 3) - H);
            h.onGround = true;
            releaseLadder(h);
            h.state = 'idle';
          }
        }
        if (h.climbing) {
          if (dir !== 0) h.facing = dir;
          h.animTimer++;
          if (h.animTimer >= 8) { h.animTimer = 0; h.anim ^= 1; }
          h.state = 'climb';
          sync(h);
          scanTiles(h, g);
          return h;
        }
      }
    } else if (!hurting && h.onGround && up && (ladderAt(g, cc, (h.y + 4) >> 3) || ladderAt(g, cc, (h.y + 12) >> 3))) {
      grabLadder(h, g, cc);
      sync(h);
      return h;
    } else if (!hurting && h.onGround && down && !h.sliding && ladderAt(g, cc, (h.y + H) >> 3)) {
      grabLadder(h, g, cc);
      FX.vadd(h.py, CLIMB);
      sync(h);
      return h;
    } else if (!hurting && !h.onGround && up && ladderAt(g, cc, (h.y + 12) >> 3)) {
      grabLadder(h, g, cc);
      sync(h);
      return h;
    }

    /* ---- ③ 滑行（↓ + A，研究：洛克人 3 起的動作；本作列為標配）---- */
    if (h.sliding) {
      if (h.slideT > 0) h.slideT--;
      if ((h.slideT === 0 || (!down && !aHeld)) && endSlide(h, g)) { /* 站起來 */ }
    } else if (h.onGround && down && aPress) {
      startSlide(h, g);
    }

    /* ---- ④ 水平速度：沒有加速度（研究 ①②）---- */
    if (h.sliding) {
      FX.aset(h.vxA, h.facing * SLIDE_V);
    } else if (hurting) {
      /* 受傷硬直期間保留擊退速度 */
    } else if (dir !== 0) {
      h.facing = dir;
      FX.aset(h.vxA, dir * WALK);
    } else {
      FX.aset(h.vxA, 0);                      // 放開立即停止
    }

    /* ---- ⑤ 起跳 / 重力（跳躍高度可變：放開 A 立刻停止上升，研究 ③）---- */
    if (h.onGround && aPress && !h.sliding && !down) jump(h, g);
    if (!h.onGround) {
      if (h.jumpHeld && !aHeld && h.vyA.v < 0) { FX.aset(h.vyA, 0); h.jumpHeld = false; }
      if (aHeld === false) h.jumpHeld = false;
      gravity(h);
    } else {
      h.jumpHeld = false;
    }

    /* ---- ⑥ 移動 X + 碰撞 ---- */
    var hh = boxH(h);
    h.prevFeet = FX.floorPx(h.py.sub) + hh;
    FX.vadd(h.px, h.vxA.v);
    var x = FX.floorPx(h.px.sub), y = FX.floorPx(h.py.sub);
    if (h.vxA.v > 0) {
      if (blocksH(g, x + W - 1, y, hh)) {
        x = ((((x + W - 1) >> 3) << 3) - W);
        FX.vsetPx(h.px, x); FX.aset(h.vxA, 0);
        if (h.sliding) h.slideT = 0;
      }
    } else if (h.vxA.v < 0) {
      if (blocksH(g, x, y, hh)) {
        x = (((x >> 3) + 1) << 3);
        FX.vsetPx(h.px, x); FX.aset(h.vxA, 0);
        if (h.sliding) h.slideT = 0;
      }
    }

    /* ---- ⑦ 移動 Y + 碰撞 ---- */
    FX.vadd(h.py, h.vyA.v);
    y = FX.floorPx(h.py.sub);
    x = FX.floorPx(h.px.sub);
    if (h.vyA.v >= 0) {
      var feet = y + hh, frow = feet >> 3;
      if (solidAt(g, x >> 3, frow) || solidAt(g, (x + W - 1) >> 3, frow)) {
        y = (frow << 3) - hh;
        FX.vsetPx(h.py, y); FX.aset(h.vyA, 0);
        if (!h.onGround && g.onLand) g.onLand(h);
        h.onGround = true;
      } else {
        h.onGround = false;
      }
    } else {
      h.onGround = false;
      var hrow = y >> 3;
      if (solidAt(g, x >> 3, hrow) || solidAt(g, (x + W - 1) >> 3, hrow)) {
        y = ((hrow + 1) << 3);
        FX.vsetPx(h.py, y); FX.aset(h.vyA, 0);
      }
    }
    if (h.py.sub < h.apexSub) h.apexSub = h.py.sub;

    /* ---- ⑧ 危險磚（尖刺 / 熔岩 = 即死，研究 ⑦）---- */
    sync(h);
    scanTiles(h, g);
    if (h.state === 'dead') return h;

    /* ---- ⑨ 狀態機 ---- */
    if (h.inv > 0) h.inv--;
    if (h.hurtT > 0) {
      h.state = 'hurt';
    } else if (h.sliding) {
      h.state = 'slide';
    } else if (!h.onGround) {
      h.state = h.vyA.v < 0 ? 'jump' : 'fall';
    } else if (h.vxA.v === 0) {
      h.state = 'idle';
    } else {
      h.state = 'run';
    }

    /* ---- ⑩ 動畫 ---- */
    if (h.state === 'run') {
      if (++h.animTimer >= 6) { h.animTimer = 0; h.anim = (h.anim + 1) & 3; }
    } else if (h.state === 'idle') {
      h.anim = 0; h.animTimer = 0;
    }
    sync(h);
    return h;
  }

  // 掃描碰撞框覆蓋到的每一格：即死磚（尖刺 / 熔岩）；互動磚交給 main
  function scanTiles(h, g) {
    var hh = boxH(h);
    var c0 = h.x >> 3, c1 = (h.x + W - 1) >> 3;
    var r0 = h.y >> 3, r1 = (h.y + hh - 1) >> 3;
    var col, row, k, killed = false;
    for (col = c0; col <= c1; col++) {
      if (col < 0 || col >= COLS) continue;
      for (row = r0; row <= r1; row++) {
        if (row < 0 || row >= ROWS) continue;
        k = g.kindAt(col, row);
        if (k === 'kill') killed = true;
        if (g.onTouch) g.onTouch(col, row);
      }
    }
    if (killed && h.inv <= 0 && !(g.noSpike && g.noSpike())) kill(h, g);
  }

  /* -------------------------------------------------------------- 繪製 */

  function poseName(h) {
    switch (h.state) {
      case 'hurt': return 'M_HURT';
      case 'climb': return h.anim ? 'M_CLIMB1' : 'M_CLIMB0';
      case 'jump': case 'fall': return 'M_JUMP';
      case 'slide': return 'M_SLIDE';
      case 'idle': return 'M_IDLE';
      default:
        var A = MG.MECH_ART;
        return A.runPoses[A.run[h.anim & 3]] || 'M_RUN0';
    }
  }

  /* oam：main.js 的 OAM 配置器（begin/add/end，同 NES.SH.OAM 契約）
     tiles：{ 磚名 → OAM tile 值 }（8×8 精靈模式 ⇒ 直接用 bank.index(name)） */
  function draw(h, g, oam, tiles) {
    if (h.state === 'dead') return drawDeath(h, oam, tiles);
    if (h.inv > 0 && (h.inv & 2) !== 0) return 0;        // 無敵閃爍：2 幀顯示 / 2 幀隱藏
    var name = poseName(h), flip = h.facing < 0, n = 0;
    var sx = h.x + OFF_X, sy = h.y + OFF_Y;
    var i, c, r, t, rowsN = (name === 'M_SLIDE') ? 2 : 3;
    if (name === 'M_SLIDE') sy = h.y - (H - SLIDE_H);     // 滑行圖 16×16 對齊腳底
    for (r = 0; r < rowsN; r++) {
      for (c = 0; c < 2; c++) {
        i = r * 2 + (flip ? 1 - c : c);
        t = tiles[name + i];
        if (t === undefined) continue;
        oam.add({ x: sx + c * 8, y: sy + r * 8, tile: t, pal: 0, flipH: flip, prio: 0 });
        n++;
      }
    }
    // 手臂砲（射擊 14 幀內前伸）；爬梯時不畫（研究 ⑥ 面向固定、手抓梯）
    if (h.shootT > 0 && tiles.M_ARM !== undefined && h.state !== 'slide') {
      oam.add({ x: h.x + (flip ? -8 : W), y: h.y + 10, tile: tiles.M_ARM, pal: 0, flipH: flip, prio: 0 });
      n++;
    }
    // 蓄力光環（全蓄力閃更快）
    if (h.charging && h.chargeT >= CHARGE_MID && tiles.M_CHG_L !== undefined) {
      var fast = h.chargeT >= CHARGE_FULL;
      if (((h.frames >> (fast ? 1 : 2)) & 1) === 0) {
        oam.add({ x: h.x - 6, y: h.y + 8, tile: tiles.M_CHG_L, pal: 1, prio: 1 });
        oam.add({ x: h.x + W - 2, y: h.y + 8, tile: tiles.M_CHG_R, pal: 1, prio: 1 });
        n += 2;
      }
    }
    return n;
  }

  // 死亡：8 個對稱飛散的能量球（研究 ⑨「受傷音與死亡爆炸（8 個對稱飛散的能量球）成為系列標誌」）
  var DEATH_DIR = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  function drawDeath(h, oam, tiles) {
    var t = tiles.M_PELLET;
    if (t === undefined || h.deadDone) return 0;
    var d = h.deadT, n = 0, i, cx = h.x + (W >> 1) - 4, cy = h.y + 8;
    var r1 = d * 2, r2 = (d * 2) >> 1;
    for (i = 0; i < 8; i++) {
      oam.add({ x: cx + DEATH_DIR[i][0] * r1, y: cy + DEATH_DIR[i][1] * r1, tile: t, pal: 1, prio: 1 });
      oam.add({ x: cx + DEATH_DIR[i][0] * r2, y: cy + DEATH_DIR[i][1] * r2, tile: t, pal: 0, prio: 1 });
      n += 2;
    }
    return n;
  }

  function tileNames() {
    var out = [], poses = ['M_IDLE', 'M_RUN0', 'M_RUN1', 'M_RUN2', 'M_JUMP', 'M_CLIMB0', 'M_CLIMB1', 'M_HURT'];
    var i, j;
    for (i = 0; i < poses.length; i++) for (j = 0; j < 6; j++) out.push(poses[i] + j);
    for (j = 0; j < 4; j++) out.push('M_SLIDE' + j);
    out.push('M_ARM', 'M_CHG_L', 'M_CHG_R', 'M_SHOT', 'M_SHOT2', 'M_FROST', 'M_BLAZE',
             'M_EBULLET', 'M_BOOM0', 'M_BOOM1', 'M_BOOM2', 'M_BOOM3',
             'M_PELLET', 'M_PBIG_L', 'M_PBIG_R', 'M_ETANK_L', 'M_ETANK_R', 'M_1UP_L', 'M_1UP_R',
             'M_BAR0', 'M_BAR1', 'M_BAR2', 'M_BAR3', 'M_BAR4', 'M_BARF');
    return out;
  }

  MG.Hero = {
    W: W, H: H, SLIDE_H: SLIDE_H, SPR_W: SPR_W, SPR_H: SPR_H, OFF_X: OFF_X, OFF_Y: OFF_Y,
    WALK: WALK, SLIDE_V: SLIDE_V, SLIDE_FRAMES: SLIDE_FRAMES,
    GRAV: GRAV, GRAV_HALF: GRAV_HALF, JUMP_VY: JUMP_VY, MAX_FALL: MAX_FALL, CLIMB: CLIMB,
    INV_FRAMES: INV_FRAMES, HURT_FRAMES: HURT_FRAMES, KNOCK_VX: KNOCK_VX,
    DEATH_FRAMES: DEATH_FRAMES, SHOOT_HOLD: SHOOT_HOLD,
    CHARGE_MID: CHARGE_MID, CHARGE_FULL: CHARGE_FULL, LIFE_MAX: LIFE_MAX,
    ROWS: ROWS, COLS: COLS,
    create: create, reset: reset, update: update, draw: draw,
    hurt: hurt, kill: kill, heal: heal, jump: jump, startSlide: startSlide, endSlide: endSlide,
    grabLadder: grabLadder, releaseLadder: releaseLadder,
    boxH: boxH, sync: sync, poseName: poseName, tileNames: tileNames,
    // 純函式：跳躍高度的理論值（測試對照用）= v0² / 2g
    jumpApexPx: function () { return (JUMP_VY * JUMP_VY) / (256 * 256 * 2 * (GRAV / 256)); }
  };
})();
