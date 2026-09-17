/*
 * games/demo/main.js — 測試房主程式（window.GAME）
 * ---------------------------------------------------------------------------
 * 擁有者：demo agent ｜ 依賴：games/demo/{chr,song,room}.js、engine/*
 *
 * 目的：在 PPU / APU 的真限制下跑一個「可玩畫面」，證明 R1 引擎可用。
 *   ① 8 畫面寬的水平捲動關卡、名稱表 ×2 垂直鏡像、16×16 屬性配色、split 狀態列
 *   ② 主角 16×24（8×16 精靈模式）三幀走路，物理完全走 `NES.FX` 定點數 + `NES.FX.SMB` 常數
 *      （走 1.5 / 跑 2.5 px/f、加速度表、轉身 ×2、雙重力跳、磁磚 AABB、相機單向鎖）
 *   ③ 12 隻敵人分兩條掃描線帶 → 每線 > 8 精靈 → PPU 丟棄 + 軟體 sprite cycling 閃爍
 *   ④ 開場 `NES.Music.DEMO` 短曲循環；跳躍 jump、踩敵 coin 音效搶聲道
 *
 * 手感常數與**跳躍規則**全部來自 `NES.FX.SMB`（SMBDIS.ASM 反組譯，見 docs/research/03 §②）：
 *   每幀順序 = 讀輸入 → 水平加速 / 摩擦 → 起跳 → 重力 → 移動 X（碰撞）→ 移動 Y（碰撞）
 *              → 敵人 → 踩 / 撞判定 → 相機（單向）→ 補名稱表欄 → HUD → 音樂 tick
 *   跳躍走引擎的共用函式 `SMB.jumpState / jumpStart / jumpGravity / jumpBounce`
 *   （R1 fix1：QA P1-4 / P1-5 定案，起跳首幀半格重力）⇒ 本檔與 tools/test_core.py
 *   的 `SMB.jumpSim()` 是**同一套規則、同一組數字**：長按靜止跳 64.00 px（4 格）、
 *   全速跳 80.00 px（5 格）、點按 1 幀 19.6875 px。
 *
 * VBlank 寫入預算：每幀補一欄名稱表 26 byte + 屬性 13 byte（+ 狀態列更新 12 byte）
 *   ⇒ 單幀最高 51 byte，在 timing.budget 的 160 byte 之內（`__nes.stats().budget` 可查）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var DEMO = window.DEMO = window.DEMO || {};

  var FX = NES.FX, SMB = FX.SMB, BTN = NES.Input.BTN;
  var C = DEMO.CHR, Room = DEMO.Room, Audio = DEMO.Audio;

  var HERO_W = 16, HERO_H = 24, ENEMY_W = 16, ENEMY_H = 16;
  var SCREEN_W = 256;
  var CAM_TRIGGER = 102;               // 畫面 40%（0.4 × 256 = 102.4 → 102 px）
  var MAX_FALL = FX.v88(4, 0);         // 下墜速度上限 4 px/幀
  var INV_FRAMES = 60;                 // 撞到敵人側面的無敵幀
  var BOUNCE = -FX.v88(3, 0);          // 踩敵回彈 -3 px/幀
  var STOMP_SCORE = 100;
  var ROT_STEP = 3;                    // 每幀把同一帶的敵人在 OAM 內旋轉 3 隻（軟體 sprite cycling）

  var g = null;

  function newState() {
    return {
      mode: 'title',
      frames: 0,
      px: FX.Vec(Room.START_X), py: FX.Vec(Room.START_Y),
      vx: FX.Acc(0), vy: FX.Acc(0),
      onGround: true, facing: 1,
      // 跳躍狀態一律走 NES.FX.SMB 的共用規則（QA P1-4 / P1-5 定案；vy 是同一個 Acc 物件）
      jumpS: null,
      jumpApexSub: FX.toSub(Room.START_Y),
      anim: 0, animTimer: 0, inv: 0,
      prevFeet: Room.START_Y + HERO_H,
      camX: 0, writtenTo: -1,
      score: 0, time: 400, timeTick: 0, world: '1-1',
      hudDirty: true,
      stomps: 0, hits: 0,
      enemies: [],
      lastSfx: null
    };
  }

  function resetState() {
    g = newState();
    g.jumpS = SMB.jumpState(g.vy);     // 綁在自己的 Acc 上 ⇒ 沒有任何全域餘數
    return g;
  }

  function spawnEnemies() {
    var src = Room.enemySpawns(), out = [], i;
    for (i = 0; i < src.length; i++) {
      var s = src[i];
      out.push({
        id: i, x: FX.Vec(s.x), y: s.y, band: s.band,
        min: s.min, max: s.max, dir: s.dir, alive: true
      });
    }
    return out;
  }

  /* ------------------------------------------------------------ 碰撞工具 */

  function solid(x, y) { return Room.solidAtPx(x, y); }

  // 主角矩形（左上角 x,y、16×24）在水平方向是否卡到磁磚
  function hitsH(x, y) {
    return solid(x, y) || solid(x, y + 11) || solid(x, y + HERO_H - 1);
  }

  /* -------------------------------------------------------------- update */

  function stepPlayer(nes) {
    var input = nes.input || NES.Input;
    var right = input.held(BTN.RIGHT), left = input.held(BTN.LEFT);
    var runBtn = input.held(BTN.B), aHeld = input.held(BTN.A);
    var dir = (right ? 1 : 0) - (left ? 1 : 0);

    // --- 水平加速 / 摩擦（SMB：空中要 |vx| ≥ $19 才沿用跑步參數）---
    var maxSpd, acc;
    if (g.onGround) {
      maxSpd = runBtn ? SMB.maxRun : SMB.maxWalk;
      acc = runBtn ? SMB.accRun : SMB.accWalk;
    } else if (FX.abs(g.vx.v) >= SMB.airRunSpeed) {
      maxSpd = SMB.maxRun; acc = SMB.accRun;
    } else {
      maxSpd = SMB.maxWalk; acc = SMB.accWalk;
    }
    if (dir !== 0) {
      if (g.vx.v !== 0 && FX.sign(g.vx.v) === -dir) acc = acc << SMB.turnShift;  // 轉身 / 煞車 ×2
      FX.aapproach(g.vx, dir * maxSpd, acc);
      g.facing = dir;
    } else if (g.onGround) {
      FX.aapproach(g.vx, 0, SMB.friction);
    }

    // --- 起跳（依水平速度選 5 段之一；規則在 NES.FX.SMB，core 測試用同一份）---
    if (g.onGround && input.pressed(BTN.A)) {
      SMB.jumpStart(g.jumpS, FX.abs(g.vx.v), g.py.sub);
      g.onGround = false;
      g.jumpApexSub = g.py.sub;
      Audio.jump(nes);
      g.lastSfx = 'jump';
    }

    // --- 重力（按住 A = 小重力；放開且已離地 ≥ 1px = 大重力；起跳首幀半格重力）---
    if (!g.onGround) SMB.jumpGravity(g.jumpS, aHeld, g.py.sub, MAX_FALL);

    // --- 移動 X + 磁磚碰撞（位置單位 1/16 px）---
    g.prevFeet = FX.floorPx(g.py.sub) + HERO_H;
    FX.vadd(g.px, g.vx.v);
    var x = FX.floorPx(g.px.sub), y = FX.floorPx(g.py.sub);
    if (g.vx.v > 0) {
      if (hitsH(x + HERO_W - 1, y)) {
        x = (((x + HERO_W - 1) >> 3) << 3) - HERO_W;
        FX.vsetPx(g.px, x); FX.aset(g.vx, 0);
      }
    } else if (g.vx.v < 0) {
      if (hitsH(x, y)) {
        x = ((x >> 3) + 1) << 3;
        FX.vsetPx(g.px, x); FX.aset(g.vx, 0);
      }
    }
    // 相機單向鎖 ⇒ 主角被螢幕左緣擋住（SMB 行為）；右邊是關卡盡頭
    if (x < g.camX) { x = g.camX; FX.vsetPx(g.px, x); if (g.vx.v < 0) FX.aset(g.vx, 0); }
    if (x > Room.W_PX - HERO_W) { x = Room.W_PX - HERO_W; FX.vsetPx(g.px, x); FX.aset(g.vx, 0); }

    // --- 移動 Y + 磁磚碰撞 ---
    FX.vadd(g.py, g.vy.v);
    y = FX.floorPx(g.py.sub);
    if (g.vy.v >= 0) {
      var feet = y + HERO_H;
      if (solid(x, feet) || solid(x + HERO_W - 1, feet)) {
        y = ((feet >> 3) << 3) - HERO_H;
        FX.vsetPx(g.py, y); FX.aset(g.vy, 0);
        g.onGround = true;
      } else {
        g.onGround = false;
      }
    } else {
      g.onGround = false;
      if (solid(x, y) || solid(x + HERO_W - 1, y)) {
        y = ((y >> 3) + 1) << 3;
        FX.vsetPx(g.py, y); FX.aset(g.vy, 0);
      }
    }
    if (g.py.sub < g.jumpApexSub) g.jumpApexSub = g.py.sub;

    // --- 走路動畫（1→2→1→3；速度越快換格越快）---
    if (!g.onGround) {
      g.anim = 2;
    } else if (g.vx.v !== 0) {
      var delay = FX.abs(g.vx.v) >= SMB.maxWalk ? 2 : 4;
      if (++g.animTimer >= delay) { g.animTimer = 0; g.anim = (g.anim + 1) & 3; }
    } else {
      g.anim = 0; g.animTimer = 0;
    }

    if (g.inv > 0) g.inv--;
  }

  function stepEnemies(nes) {
    var camL = g.camX - 96, camR = g.camX + SCREEN_W + 96;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive) continue;
      var ex = FX.floorPx(e.x.sub);
      if (ex < camL || ex > camR) continue;              // 畫面外不更新（真機也只跑畫面附近）
      FX.vadd(e.x, e.dir * SMB.enemySlow);
      ex = FX.floorPx(e.x.sub);
      if (ex <= e.min) { FX.vsetPx(e.x, e.min); e.dir = 1; }
      else if (ex >= e.max) { FX.vsetPx(e.x, e.max); e.dir = -1; }
    }
  }

  function stepCollisions(nes) {
    var hx = FX.floorPx(g.px.sub), hy = FX.floorPx(g.py.sub);
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive) continue;
      var ex = FX.floorPx(e.x.sub);
      if (hx + HERO_W <= ex || ex + ENEMY_W <= hx) continue;
      if (hy + HERO_H <= e.y || e.y + ENEMY_H <= hy) continue;
      if (g.vy.v > 0 && g.prevFeet <= e.y + 8) {
        // 踩到 → 消失 + 計分 + coin 音效（搶 p2 聲道）
        e.alive = false;
        g.stomps++;
        g.score += STOMP_SCORE;
        g.hudDirty = true;
        SMB.jumpBounce(g.jumpS, BOUNCE, g.py.sub);   // 回彈不是新的一次跳躍（不套首幀半重力）
        g.onGround = false;
        Audio.coin(nes);
        g.lastSfx = 'coin';
      } else if (g.inv === 0) {
        g.inv = INV_FRAMES;                              // 側面接觸 → 閃爍無敵 60 幀
        g.hits++;
      }
    }
  }

  function stepCamera(nes) {
    var hx = FX.floorPx(g.px.sub);
    var want = hx - CAM_TRIGGER;
    if (want > g.camX) g.camX = want;                    // 單向鎖：永不往左捲
    if (g.camX > Room.CAM_MAX) g.camX = Room.CAM_MAX;
    if (g.camX < 0) g.camX = 0;
  }

  // 相機往右走時補名稱表欄（每幀最多 1~2 欄，模擬 VBlank 寫入預算）
  function feedColumns(ppu) {
    var target = (g.camX >> 3) + 34;
    if (target > Room.COLS - 1) target = Room.COLS - 1;
    while (g.writtenTo < target) {
      g.writtenTo++;
      Room.writeColumn(ppu, g.writtenTo);
    }
  }

  /* ---------------------------------------------------------------- draw */

  function drawHero(ppu) {
    var hidden = g.inv > 0 && (g.inv & 2) !== 0;         // 無敵閃爍：2 幀顯示 / 2 幀隱藏
    if (hidden) {
      for (var i = 0; i < 4; i++) ppu.sprite(i, null);
      return;
    }
    var sx = FX.floorPx(g.px.sub) - g.camX;
    var sy = FX.floorPx(g.py.sub);
    var f = C.walk[g.anim & 3];
    var tl = C.S.HERO_TOP_L, tr = C.S.HERO_TOP_R;
    var bl = C.S.HERO_LEG_L[f], br = C.S.HERO_LEG_R[f];
    var flip = g.facing < 0;
    ppu.sprite(0, { x: sx, y: sy, tile: flip ? tr : tl, pal: 0, flipH: flip });
    ppu.sprite(1, { x: sx + 8, y: sy, tile: flip ? tl : tr, pal: 0, flipH: flip });
    ppu.sprite(2, { x: sx, y: sy + 16, tile: flip ? br : bl, pal: 0, flipH: flip });
    ppu.sprite(3, { x: sx + 8, y: sy + 16, tile: flip ? bl : br, pal: 0, flipH: flip });
  }

  // 敵人：依掃描線帶分組，組內每幀旋轉 ROT_STEP 隻再寫 OAM。
  // PPU 每線只畫 8 個 ⇒ 同一帶（12 個精靈）每幀只畫得下 3~4 隻，
  // 旋轉讓「連續兩幀的聯集」涵蓋整組 ⇒ 真機式閃爍。
  var bandBuf = [[], []];
  function drawEnemies(ppu) {
    bandBuf[0].length = 0; bandBuf[1].length = 0;
    var i, e, sx;
    for (i = 0; i < g.enemies.length; i++) {
      e = g.enemies[i];
      if (!e.alive) continue;
      sx = FX.floorPx(e.x.sub) - g.camX;
      if (sx <= -ENEMY_W || sx >= SCREEN_W) continue;
      bandBuf[e.band].push(e);
    }
    var slot = 4, rot = g.frames * ROT_STEP;
    for (var b = 0; b < 2; b++) {
      var arr = bandBuf[b], n = arr.length;
      for (var k = 0; k < n && slot <= 62; k++) {
        e = arr[(k + rot) % n];
        sx = FX.floorPx(e.x.sub) - g.camX;
        ppu.sprite(slot++, { x: sx, y: e.y, tile: C.S.ENEMY_L, pal: 1 });
        ppu.sprite(slot++, { x: sx + 8, y: e.y, tile: C.S.ENEMY_R, pal: 1 });
      }
    }
    for (; slot < 64; slot++) ppu.sprite(slot, null);
  }

  /* ---------------------------------------------------------------- GAME */

  var GAME = {
    init: function (nes) {
      var ppu = nes.ppu;
      resetState();
      C.setPatterns();
      C.applyPalettes(ppu);
      ppu.mirroring('v');                 // 水平捲動 ⇒ 左右兩張名稱表不同
      ppu.spriteMode(16);                 // 8×16：主角 16×24、敵人 16×16
      ppu.flicker = 'rotate';
      ppu.flickerStep = 0;                // OAM 輪替改由遊戲自己做（真機驅動的作法，可重現）
      ppu.setPatternTables(0, 1);

      Room.init();
      g.enemies = spawnEnemies();

      Room.drawHudStatic(ppu);
      Room.drawHudValues(ppu, g.score, g.time, g.world);
      g.hudDirty = false;

      g.writtenTo = -1;
      feedColumns(ppu);
      Room.drawTitle(ppu);

      ppu.scroll(0, 0, 0);
      ppu.split(Room.SPLIT_LINE, { x: 0, y: Room.SPLIT_LINE, nt: 0 });

      Audio.init(nes);
      Audio.play(nes);
    },

    update: function (nes) {
      var input = nes.input || NES.Input;
      g.frames++;
      if (g.mode === 'title') {
        if (input.pressed(BTN.START) || input.pressed(BTN.A)) {
          g.mode = 'play';
          Room.clearTitle(nes.ppu);
        }
      } else {
        stepPlayer(nes);
        stepEnemies(nes);
        stepCollisions(nes);
        stepCamera(nes);
        feedColumns(nes.ppu);
        if (++g.timeTick >= SMB.intervalTimer) {          // 21 幀一跳（SMB framerule）
          g.timeTick = 0;
          if (g.time > 0) { g.time--; g.hudDirty = true; }
        }
      }
      Audio.tick(nes);                                    // 契約：music.tick() 由遊戲呼叫
    },

    draw: function (nes) {
      var ppu = nes.ppu;
      if (g.hudDirty) {
        Room.drawHudValues(ppu, g.score, g.time, g.world);
        g.hudDirty = false;
      }
      ppu.scroll(0, 0, 0);                                // 上段（狀態列）固定
      ppu.split(Room.SPLIT_LINE, { x: g.camX % 512, y: Room.SPLIT_LINE, nt: 0 });
      drawHero(ppu);
      drawEnemies(ppu);
    },

    state: function () {
      var alive = 0, list = [], i;
      for (i = 0; i < g.enemies.length; i++) {
        var e = g.enemies[i];
        if (!e.alive) continue;
        alive++;
        var ex = FX.floorPx(e.x.sub);
        list.push({ id: e.id, x: ex, y: e.y, band: e.band, sx: ex - g.camX });
      }
      return {
        mode: g.mode,
        gameFrames: g.frames,
        x: FX.floorPx(g.px.sub), y: FX.floorPx(g.py.sub),
        xSub: g.px.sub, ySub: g.py.sub,
        vx: g.vx.v, vy: g.vy.v,
        vxPx: FX.velToPx(g.vx.v), vyPx: FX.velToPx(g.vy.v),
        onGround: g.onGround, facing: g.facing,
        fastFall: g.jumpS.fastFall, skipFirstGravity: g.jumpS.skipFirst,
        inv: g.inv, anim: g.anim,
        apexSub: g.jumpApexSub, apexPx: FX.toPx(g.jumpApexSub),
        camX: g.camX, screenX: FX.floorPx(g.px.sub) - g.camX,
        enemies: alive, enemyList: list,
        score: g.score, time: g.time, world: g.world,
        stomps: g.stomps, hits: g.hits, lastSfx: g.lastSfx,
        music: Audio.state(nes0)
      };
    }
  };

  // state() 需要 nes 才能問 music driver；boot 時記下來
  var nes0 = null;
  var _init = GAME.init;
  GAME.init = function (nes) { nes0 = nes; _init(nes); };

  DEMO.GAME = GAME;
  window.GAME = GAME;
})();
