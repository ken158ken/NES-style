/*
 * games/cruiser/ship.js — 《星塵巡航艦》自機 / 武器 / 選項 / 能量表 / 爆炸特效
 * ---------------------------------------------------------------------------
 * 擁有者：ship agent ｜ 依賴：engine/fixed.js（定點數）、engine/input.js、games/cruiser/chr_ship.js
 * 契約：docs/TASKS.md「R2 → games/cruiser（ship agent）」
 * 數字來源：docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md
 *           **§⑩ 手感數字表（byte-level 逆向）** ⇒ 下表每一條都標了 [源] / [推論]
 *
 * 全部整數 / 定點數運算（位置 1/16 px、速度 8.8 = 1/256 px/幀），對外只暴露整數 x / y / w / h。
 *
 * ┌ 本機 ─────────────────────────────────────────────────────────────────┐
 * │ 速度 5 級 = 1.0 / 1.5 / 2.0 / 2.5 / 3.0 px/幀（等差 0.5）           [源] │
 * │ **完全沒有加速度**：瞬間到目標速度、瞬間停止（Gradius 手感的關鍵） [源] │
 * │ 斜向**不正規化**（速度 × √2）                                       [源] │
 * │ 左右同按 = 淨位移 0；上下同按 = 下優先                              [源] │
 * │ 邊界 X [8, 240]、Y [16, 184]（遊戲區 0..207 線的等比換算）          [源] │
 * │ 碰撞框 12×6（精靈 16×8 置中）；**護盾不擋地形，撞到必死**           [源] │
 * └──────────────────────────────────────────────────────────────────────┘
 * ┌ 武器 ─────────────────────────────────────────────────────────────────┐
 * │ 標準彈 7 px/幀、雷射 12 px/幀、DOUBLE 斜上 (+4, −4)                 [源] │
 * │ 飛彈 空中 (+0.5, +2) → 落地爬行 (+2, 0)；傷害 自機彈 1 / 飛彈 2     [源] │
 * │ **每個發射體 2 槽（A / B）**：本體 + 每顆 Option 各 2 ⇒ 滿配 6 發   [源] │
 * │ 連射間隔 20 幀，**兩槽都被占用時計時器凍結** ⇒ 實測 21 / 23 交替    [源] │
 * │ 子彈消滅 X = 248                                                    [源] │
 * └──────────────────────────────────────────────────────────────────────┘
 * ┌ Option ───────────────────────────────────────────────────────────────┐
 * │ 位置環 **24 筆**、延遲 **11 / 22 筆**                               [源] │
 * │ **只有「按著方向鍵」那一幀環才前進** ⇒ 停手時 Option 凍結成一排     [源] │
 * │ 沒有 Option 時兩個槽仍每幀更新座標；動畫 2 張每 8 幀，自由跑        [源] │
 * │ 復活時環的 24 筆全部填成重生座標                                    [源] │
 * └──────────────────────────────────────────────────────────────────────┘
 * ┌ 能量表 / 膠囊 ────────────────────────────────────────────────────────┐
 * │ 1 SPEED / 2 MISSILE / 3 DOUBLE / 4 LASER / 5 OPTION / 6 ?（護盾）   [源] │
 * │ 第 7 顆膠囊回捲到格 1；**已經擁有的能力按 B 不消耗膠囊**            [源] │
 * │ DOUBLE / LASER 互斥（同一個變數）；OPTION ≤ 2；護盾 5 下           [源] │
 * │ 每第 16 顆膠囊 = 清屏膠囊（stage 沒指定顏色時由本檔計數）           [源] │
 * │ B 鍵改成**按下瞬間**（原作是按住，會一次吃掉數顆，是設計瑕疵）    [推論] │
 * └──────────────────────────────────────────────────────────────────────┘
 * ┌ 死亡 / 難度 ──────────────────────────────────────────────────────────┐
 * │ 死亡停頓 90 幀（原作 147，對現代玩家太長）                        [推論] │
 * │ 強化全失 + 回 **512 px** 為單位的檢查點；剩餘船 -1                  [源] │
 * │ 重生無敵 90 幀、每 4 幀閃一次（原作沒有重生無敵）                 [推論] │
 * │ rank = (laser||double) + options + (shield ? 1 : 0)，0..4；死亡歸 0  [源] │
 * │   rank ≥ 2 → 敵彈 ×1.25；rank ≥ 3 → 預判射擊（由 stage 讀 rank()）  [源] │
 * │ EXTEND 每 20000 分 +1 船                                        [TASKS] │
 * └──────────────────────────────────────────────────────────────────────┘
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/cruiser/ship.js 需要 engine/fixed.js');
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ------------------------------------------------------------------ 常數 */
  var SHIP_W = 16, SHIP_H = 8;                          // 精靈尺寸
  var BOX_DX = 2, BOX_DY = 1, BOX_W = 12, BOX_H = 6;    // 碰撞框（比精靈小，契約）
  var PLAY = { X0: 8, X1: 240, Y0: 16, Y1: 184 };       // [源] 本機邊界
  var SPAWN_X = 40, SPAWN_Y = 100;

  var SPEED_PX = [1.0, 1.5, 2.0, 2.5, 3.0];             // [源] 等差 0.5，無加速度
  var SPEED_V = [FX.v88(1, 0), FX.v88(1, 128), FX.v88(2, 0), FX.v88(2, 128), FX.v88(3, 0)];
  var MAX_SPEED = 5;

  var SHOT_V = FX.v88(7, 0);                            // [源] 標準彈 7 px/幀
  var LASER_V = FX.v88(12, 0);                          // [源] 雷射 12 px/幀
  var DIAG_VX = FX.v88(4, 0), DIAG_VY = -FX.v88(4, 0);  // [源] DOUBLE (+4, −4)
  var MIS_FLY_VX = FX.v88(0, 128), MIS_FLY_VY = FX.v88(2, 0);   // [源] 空中 (+0.5, +2)
  var MIS_CRAWL_VX = FX.v88(2, 0);                      // [源] 爬地 (+2, 0)
  var KILL_X = 248;                                     // [源] 子彈消滅 X

  var SLOTS_PER_EMITTER = 2;                            // [源] 每個發射體 A / B 兩槽
  var FIRE_DELAY = 20;                                  // [源] 連射間隔 20 幀（槽滿時凍結）
  var LASER_MAX_SEG = 4;                                // 雷射最長 4 段（TASKS）
  var LASER_STEP = 8;                                   // 一段 = 8 px

  var MAX_OPTION = 2, RING = 24, OPT_LAG = [11, 22], OPT_ANIM = 8;   // [源]
  var EMITTERS = 1 + MAX_OPTION;

  var SHOTS = 16, MISSILES = 4, DEBRIS = 6, BOOMS = 8;
  var DMG_SHOT = 1, DMG_MISSILE = 2;                    // [源]

  var DEATH_FRAMES = 90, INVUL_FRAMES = 90, BLINK = 4;  // [推論]
  var SHIELD_HP = 5;                                    // [源]
  var CHECKPOINT_PX = 512;                              // [源]
  var START_LIVES = 3;                                  // [源]
  var EXTEND_EVERY = 20000;
  var CLEAR_CAPSULE_EVERY = 16;                         // [源] 每第 16 顆 = 清屏
  var HI_KEY = 'cruiser_hi';

  var K = { SHOT: 0, DIAG: 1, LASER: 2, MISSILE: 3 };
  var GAUGE_MAX = 6;
  var GAUGE_NAME = ['', 'SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?'];
  // QA R2 P2-1：5 字標籤 6 格相連會擠成 `SPEEDMISSLDOUBL…`；改成 4 欄一格（3 字 + 1 空欄），
  // 每格對齊下一列的格框 `[---]`，整列讀作 ` SPD MSL DBL LSR OPT  ?`
  var GAUGE_LABEL = ['SPD ', 'MSL ', 'DBL ', 'LSR ', 'OPT ', ' ?  '];

  /* --------------------------------------------------------- 小工具 / 防禦 */
  function stage() { return CR.stage || null; }
  // 契約補充：CR.stage.solidAt(x, y) 以「螢幕座標」為準（x 0..255、y 0..207）
  function solidAt(x, y) {
    var st = stage();
    if (st && typeof st.solidAt === 'function') { try { return !!st.solidAt(x | 0, y | 0); } catch (e) { return false; } }
    return false;
  }
  function sfx(name) { try { if (CR.Audio && CR.Audio.sfx) CR.Audio.sfx(name); } catch (e) { } }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function loadHi() {
    try { var v = parseInt(window.localStorage.getItem(HI_KEY) || '0', 10); return (v > 0 && v < 10000000) ? v : 0; }
    catch (e) { return 0; }
  }
  function saveHi(v) { try { window.localStorage.setItem(HI_KEY, String(v)); } catch (e) { } }

  /* ==================================================== 爆炸特效池（共用） */
  var BOOM_FRAME = 6;                                   // [源] 4 張 × 6 幀 = 24 幀（雜魚）
  var booms = [];
  (function () { for (var i = 0; i < BOOMS; i++) booms.push({ alive: false, x: 0, y: 0, t: 0 }); })();
  function boom(x, y) {
    for (var i = 0; i < booms.length; i++) {
      var b = booms[i];
      if (!b.alive) { b.alive = true; b.x = x | 0; b.y = y | 0; b.t = 0; return b; }
    }
    return null;                                        // 沒槽就不生成（NES 風）
  }
  function boomUpdate() {
    for (var i = 0; i < booms.length; i++) { var b = booms[i]; if (b.alive && ++b.t >= BOOM_FRAME * 4) b.alive = false; }
  }
  function boomCount() { var n = 0, i; for (i = 0; i < booms.length; i++) if (booms[i].alive) n++; return n; }
  CR.Fx = { boom: boom, booms: booms, count: boomCount, FRAME: BOOM_FRAME,
    reset: function () { for (var i = 0; i < booms.length; i++) booms[i].alive = false; } };

  /* ================================================================== 自機 */
  function newShot() {
    return { alive: false, kind: 0, src: 0, id: 0,
      px: FX.Vec(0), py: FX.Vec(0), vx: 0, vy: 0,
      x: 0, y: 0, w: 4, h: 4, dmg: 1, len: 1, crawl: false, anim: 0 };
  }

  function create() {
    var i;
    var s = {
      // ---- 契約欄位 ----
      x: 0, y: 0, w: BOX_W, h: BOX_H,
      alive: true, speed: 1,
      power: { missile: false, double: false, laser: false, option: 0, shield: 0 },
      gauge: 0, shots: [], options: [],
      invul: 0, lives: START_LIVES, score: 0, hi: loadHi(),
      // ---- 內部 ----
      sx: SPAWN_X, sy: SPAWN_Y,
      px: FX.Vec(SPAWN_X), py: FX.Vec(SPAWN_Y),
      ring: new Int16Array(RING * 2), head: 0, ringSteps: 0,
      emit: [], moved: false,
      deathTimer: 0, deathDone: false, debris: [],
      frames: 0, anim: 0, optAnim: 0,
      extendAt: EXTEND_EVERY, shotId: 1,
      capsules: 0, deaths: 0, fired: 0
    };
    for (i = 0; i < SHOTS + MISSILES; i++) s.shots.push(newShot());
    for (i = 0; i < DEBRIS; i++) s.debris.push({ alive: false, px: FX.Vec(0), py: FX.Vec(0), vx: 0, vy: 0, t: 0, tile: 0, x: 0, y: 0 });
    for (i = 0; i < MAX_OPTION; i++) s.options.push({ x: SPAWN_X, y: SPAWN_Y, on: false });
    for (i = 0; i < EMITTERS; i++) s.emit.push({ timer: 0 });

    /* ---------------------------------------------------------- 重置 */
    s.place = function (x, y) {
      s.sx = clamp(x | 0, PLAY.X0, PLAY.X1); s.sy = clamp(y | 0, PLAY.Y0, PLAY.Y1);
      FX.vsetPx(s.px, s.sx); FX.vsetPx(s.py, s.sy);
      s.x = s.sx + BOX_DX; s.y = s.sy + BOX_DY;
      for (var j = 0; j < RING; j++) { s.ring[j * 2] = s.sx; s.ring[j * 2 + 1] = s.sy; }  // [源] 復活時環全填重生座標
      s.head = 0;
      s.syncOptions();
    };
    s.reset = function (hard) {
      s.alive = true; s.deathTimer = 0; s.deathDone = false;
      s.clearShots(); CR.Fx.reset();
      for (var j = 0; j < DEBRIS; j++) s.debris[j].alive = false;
      for (j = 0; j < EMITTERS; j++) s.emit[j].timer = 0;
      if (hard) {
        s.speed = 1; s.gauge = 0;
        s.power.missile = false; s.power.double = false; s.power.laser = false;
        s.power.option = 0; s.power.shield = 0;
      }
      s.place(SPAWN_X, SPAWN_Y);
    };
    s.newGame = function () {
      s.lives = START_LIVES; s.score = 0; s.deaths = 0; s.fired = 0; s.capsules = 0;
      s.extendAt = EXTEND_EVERY; s.invul = 0;
      s.reset(true);
    };
    s.clearShots = function () { for (var j = 0; j < s.shots.length; j++) s.shots[j].alive = false; };

    /* ------------------------------------------------------ Option 位置 */
    // [源] 沒有 Option 時兩個槽仍每幀更新座標（撿到當下就位）
    s.syncOptions = function () {
      for (var j = 0; j < MAX_OPTION; j++) {
        var o = s.options[j];
        o.on = j < s.power.option;
        var h = (s.head - OPT_LAG[j]) % RING; if (h < 0) h += RING;
        o.x = s.ring[h * 2]; o.y = s.ring[h * 2 + 1];
      }
    };

    /* ------------------------------------------------------------ 移動 */
    // [源] 無加速度、斜向不正規化、左右同按淨 0、上下同按下優先、邊界先檢查
    s.move = function (input) {
      var v = SPEED_V[clamp(s.speed, 1, MAX_SPEED) - 1];
      var right = input.held(BTN.RIGHT), left = input.held(BTN.LEFT);
      var down = input.held(BTN.DOWN), up = input.held(BTN.UP);
      var dx = (right ? 1 : 0) - (left ? 1 : 0);
      var dy = down ? 1 : (up ? -1 : 0);                 // 下優先
      s.moved = (dx !== 0 || dy !== 0);
      if (dx) {
        FX.vadd(s.px, dx * v);
        var nx = FX.floorPx(s.px.sub);
        if (nx < PLAY.X0) FX.vsetPx(s.px, PLAY.X0);
        else if (nx > PLAY.X1) FX.vsetPx(s.px, PLAY.X1);
      } else { s.px.frac = 0; }
      if (dy) {
        FX.vadd(s.py, dy * v);
        var ny = FX.floorPx(s.py.sub);
        if (ny < PLAY.Y0) FX.vsetPx(s.py, PLAY.Y0);
        else if (ny > PLAY.Y1) FX.vsetPx(s.py, PLAY.Y1);
      } else { s.py.frac = 0; }
      s.sx = FX.floorPx(s.px.sub); s.sy = FX.floorPx(s.py.sub);
      s.x = s.sx + BOX_DX; s.y = s.sy + BOX_DY;
    };

    /* ------------------------------------------------------------ 射擊 */
    // 主武器槽（標準彈 / 斜彈 / 雷射）每個發射體 2 個；飛彈另外 1 個
    function mainUsed(src) {
      var n = 0;
      for (var j = 0; j < s.shots.length; j++) {
        var t = s.shots[j];
        if (t.alive && t.src === src && t.kind !== K.MISSILE) n++;
      }
      return n;
    }
    function missileUsed(src) {
      for (var j = 0; j < s.shots.length; j++) {
        var t = s.shots[j];
        if (t.alive && t.src === src && t.kind === K.MISSILE) return 1;
      }
      return 0;
    }
    s.mainUsed = mainUsed; s.missileUsed = missileUsed;
    s.countAlive = function (kind) {
      var n = 0;
      for (var j = 0; j < s.shots.length; j++) {
        var t = s.shots[j];
        if (t.alive && (kind === undefined || t.kind === kind)) n++;
      }
      return n;
    };
    function alloc() { for (var j = 0; j < s.shots.length; j++) if (!s.shots[j].alive) return s.shots[j]; return null; }
    function spawn(kind, src, x, y, vx, vy) {
      var t = alloc();
      if (!t) return null;
      t.alive = true; t.kind = kind; t.src = src; t.id = s.shotId++;
      FX.vsetPx(t.px, x); FX.vsetPx(t.py, y);
      t.vx = vx; t.vy = vy; t.x = x | 0; t.y = y | 0;
      t.w = 4; t.h = 4; t.dmg = DMG_SHOT; t.len = 1; t.crawl = false; t.anim = 0;
      if (kind === K.LASER) { t.w = LASER_STEP; t.h = 4; }
      if (kind === K.MISSILE) { t.dmg = DMG_MISSILE; }
      return t;
    }

    function fireFrom(src, ox, oy) {
      var e = s.emit[src], made = 0, free;
      if (e.timer <= 0) {
        free = SLOTS_PER_EMITTER - mainUsed(src);
        if (free > 0) {
          if (s.power.laser) {
            spawn(K.LASER, src, ox + 16, oy + 2, LASER_V, 0); made++;
            if (src === 0) sfx('laser');
          } else {
            spawn(K.SHOT, src, ox + 14, oy + 2, SHOT_V, 0); made++;
            if (src === 0) sfx('shot');
            if (s.power.double && free > 1) spawn(K.DIAG, src, ox + 12, oy, DIAG_VX, DIAG_VY);
          }
          e.timer = FIRE_DELAY;
        }
      }
      if (s.power.missile && missileUsed(src) === 0) {
        spawn(K.MISSILE, src, ox + 6, oy + 5, MIS_FLY_VX, MIS_FLY_VY); made++;
        if (src === 0) sfx('missile');
      }
      return made;
    }

    s.fire = function () {
      if (!s.alive) return 0;
      var n = fireFrom(0, s.sx, s.sy), j;
      for (j = 0; j < MAX_OPTION; j++) {
        if (!s.options[j].on) continue;
        n += fireFrom(j + 1, s.options[j].x + 4, s.options[j].y);
      }
      if (n) s.fired++;
      return n;
    };

    /* -------------------------------------------------------- 能量表 / B */
    // [源] 每第 16 顆膠囊 = 清屏。stage 可在膠囊物件上指定 blue 覆寫。
    s.capsule = function (blue) {
      s.capsules++;
      if (blue === undefined || blue === null) blue = (s.capsules % CLEAR_CAPSULE_EVERY) === 0;
      if (blue) {
        var st = stage();
        if (st && typeof st.clearScreen === 'function') { try { st.clearScreen(); } catch (e) { } }
        sfx('capsule');
        return 'clear';
      }
      s.gauge = (s.gauge >= GAUGE_MAX) ? 1 : s.gauge + 1;   // [源] 第 7 顆回捲到格 1
      sfx('capsule');
      return s.gauge;
    };

    // [源] 已經擁有的能力 → **不消耗膠囊**（gauge 不歸零），回傳 ''
    s.activate = function () {
      var sel = s.gauge;
      if (sel <= 0) return '';
      var got = '';
      switch (sel) {
        case 1: if (s.speed < MAX_SPEED) { s.speed++; got = 'SPEED'; } break;
        case 2: if (!s.power.missile) { s.power.missile = true; got = 'MISSILE'; } break;
        case 3: if (!s.power.double) { s.power.double = true; s.power.laser = false; got = 'DOUBLE'; } break;
        case 4: if (!s.power.laser) { s.power.laser = true; s.power.double = false; got = 'LASER'; } break;
        case 5: if (s.power.option < MAX_OPTION) { s.power.option++; got = 'OPTION'; } break;
        case 6: if (s.power.shield <= 0) { s.power.shield = SHIELD_HP; got = 'SHIELD'; } break;
      }
      if (!got) return '';                 // 已擁有 → 膠囊保留
      s.gauge = 0;
      s.syncOptions();
      sfx('powerup');
      return got;
    };

    /* ------------------------------------------------------------ 受擊 */
    // terrain = true 時護盾無效（[源] 護盾不擋地形）。回傳 true = 這次真的死了
    s.hit = function (terrain) {
      if (!s.alive || s.invul > 0) return false;
      if (!terrain && s.power.shield > 0) { s.power.shield--; sfx('hit'); return false; }
      s.die();
      return true;
    };

    s.die = function () {
      if (!s.alive) return;
      s.alive = false; s.deathTimer = DEATH_FRAMES; s.deathDone = false; s.deaths++;
      boom(s.sx + 8, s.sy + 4);
      var dirs = [[-3, -2], [-1, -3], [2, -3], [3, 1], [-2, 3], [1, 3]], j;
      for (j = 0; j < DEBRIS; j++) {
        var d = s.debris[j];
        d.alive = true; d.t = 0; d.tile = j & 1;
        FX.vsetPx(d.px, s.sx + 4); FX.vsetPx(d.py, s.sy);
        d.vx = FX.v88(dirs[j][0], 0) >> 1; d.vy = FX.v88(dirs[j][1], 0) >> 1;
        d.x = s.sx + 4; d.y = s.sy;
      }
      sfx('die');
    };

    s.addScore = function (n) {
      if (!n) return;
      s.score += n | 0;
      if (s.score > 9999999) s.score = 9999999;
      while (s.score >= s.extendAt) { s.extendAt += EXTEND_EVERY; s.lives++; sfx('extend'); }
      if (s.score > s.hi) { s.hi = s.score; saveHi(s.hi); }
    };

    // [源] rank = (主武器) + Option 數 + (護盾)，0..4；死亡自動歸 0（強化清空）
    s.rank = function () {
      return ((s.power.laser || s.power.double) ? 1 : 0) + s.power.option + (s.power.shield > 0 ? 1 : 0);
    };

    /* ----------------------------------------------------- 每幀：子彈 */
    function stepShots() {
      for (var j = 0; j < s.shots.length; j++) {
        var t = s.shots[j];
        if (!t.alive) continue;
        if (t.kind === K.LASER) {
          if (t.len < LASER_MAX_SEG) t.len++;
          FX.vadd(t.px, t.vx);
          var head = FX.floorPx(t.px.sub);
          t.x = head - t.len * LASER_STEP;               // 碰撞框 = 整條光束（貫通）
          t.y = FX.floorPx(t.py.sub);
          t.w = t.len * LASER_STEP; t.h = 4;
          if (t.x > KILL_X) t.alive = false;
          continue;
        }
        if (t.kind === K.MISSILE) {
          t.anim ^= 1;
          if (!t.crawl) {
            FX.vadd(t.px, t.vx); FX.vadd(t.py, t.vy);
            t.x = FX.floorPx(t.px.sub); t.y = FX.floorPx(t.py.sub);
            if (solidAt(t.x + 2, t.y + 5)) {             // 落地 → 爬行
              t.crawl = true; t.vx = MIS_CRAWL_VX; t.vy = 0;
              var guard = 0;
              while (solidAt(t.x + 2, t.y + 5) && t.y > 0 && guard++ < 16) t.y--;
              FX.vsetPx(t.py, t.y);
            }
          } else {
            FX.vadd(t.px, t.vx);
            t.x = FX.floorPx(t.px.sub);
            var climbed = 0;
            while (solidAt(t.x + 2, t.y + 3) && climbed < 8) { t.y--; climbed++; }
            if (climbed >= 8) { t.alive = false; boom(t.x + 2, t.y + 2); continue; }   // 撞牆
            var drop = 0;
            while (!solidAt(t.x + 2, t.y + 6) && drop < 4) { t.y++; drop++; }          // 跟著地面下坡
            FX.vsetPx(t.py, t.y);
          }
          if (t.x > KILL_X || t.y > 208) t.alive = false;
          continue;
        }
        FX.vadd(t.px, t.vx);
        if (t.vy) FX.vadd(t.py, t.vy);
        t.x = FX.floorPx(t.px.sub); t.y = FX.floorPx(t.py.sub);
        if (t.x > KILL_X || t.x < -8 || t.y < -8 || t.y > 208) t.alive = false;
      }
    }

    function stepDebris() {
      for (var j = 0; j < DEBRIS; j++) {
        var d = s.debris[j];
        if (!d.alive) continue;
        FX.vadd(d.px, d.vx); FX.vadd(d.py, d.vy);
        d.x = FX.floorPx(d.px.sub); d.y = FX.floorPx(d.py.sub);
        if (++d.t >= 60) d.alive = false;
      }
    }

    // [源] 計時器只在「還有空槽」時前進；兩槽都被占用就凍結 ⇒ 實測 21 / 23 交替節奏
    function stepTimers() {
      for (var j = 0; j < EMITTERS; j++) {
        var e = s.emit[j];
        if (e.timer > 0 && mainUsed(j) < SLOTS_PER_EMITTER) e.timer--;
      }
    }

    /* ------------------------------------------------------------ update */
    // 回傳 '' 或 'deathdone'（停頓播完，等 main 決定復活或 GAME OVER）
    s.update = function (g) {
      var input = (g && g.input) || NES.Input;
      s.frames++;
      s.anim = (s.frames >> 2) & 1;
      s.optAnim = ((s.frames / OPT_ANIM) | 0) & 1;       // [源] 2 張、每 8 幀、自由跑
      var ev = '';

      if (s.alive) {
        s.move(input);
        if (s.moved) {                                   // [源] 只有按方向鍵那一幀環才前進
          s.head = (s.head + 1) % RING;
          s.ring[s.head * 2] = s.sx; s.ring[s.head * 2 + 1] = s.sy;
          s.ringSteps++;
        }
        s.syncOptions();
        stepTimers();                                    // 先冷卻遞減，再判斷能不能射（間隔剛好 20 幀）
        // [源] §5-3：A 鍵「邊緣（$05）」**或**「計時器歸零 + 按住（$07）」都能發射 ⇒ 按住 = 自動連射。
        //      發射閘門仍在 fireFrom（`e.timer <= 0` + 該發射體還有空槽），所以連射間隔維持 20 幀，
        //      且子彈還在畫面上時 stepTimers 會凍結計時器 ⇒ 實際節奏 = 子彈壽命 + 20（21 / 23 交替）。
        if (input.pressed(BTN.A) || input.held(BTN.A)) s.fire();
        if (input.pressed(BTN.B)) s.activate();          // [推論] edge 觸發
        if (s.invul > 0) s.invul--;
      } else if (s.deathTimer > 0) {
        stepTimers();
        if (--s.deathTimer === 0) { s.deathDone = true; ev = 'deathdone'; }
      }
      stepShots();
      stepDebris();
      boomUpdate();
      return ev;
    };

    /* -------------------------------------------------------------- 查詢 */
    s.blink = function () { return s.invul > 0 && (((s.invul / BLINK) | 0) & 1) === 1; };
    s.rect = function () { return { x: s.x, y: s.y, w: BOX_W, h: BOX_H }; };
    s.gaugeName = function () { return GAUGE_NAME[s.gauge] || ''; };
    s.speedPx = function () { return SPEED_PX[clamp(s.speed, 1, MAX_SPEED) - 1]; };
    s.checkpointOf = function (camX) { return Math.floor((camX | 0) / CHECKPOINT_PX) * CHECKPOINT_PX; };
    s.state = function () {
      var list = [], j;
      for (j = 0; j < s.shots.length; j++) {
        var t = s.shots[j];
        if (t.alive) list.push({ k: t.kind, x: t.x, y: t.y, w: t.w, h: t.h, src: t.src, len: t.len, crawl: t.crawl });
      }
      var opts = [];
      for (j = 0; j < MAX_OPTION; j++) if (s.options[j].on) opts.push({ x: s.options[j].x, y: s.options[j].y });
      return {
        x: s.sx, y: s.sy, bx: s.x, by: s.y, w: BOX_W, h: BOX_H,
        alive: s.alive, speed: s.speed, speedPx: s.speedPx(),
        gauge: s.gauge, gaugeName: s.gaugeName(),
        power: { missile: s.power.missile, double: s.power.double, laser: s.power.laser,
          option: s.power.option, shield: s.power.shield },
        rank: s.rank(), options: opts, shots: list, shotCount: list.length,
        timers: [s.emit[0].timer, s.emit[1].timer, s.emit[2].timer],
        invul: s.invul, lives: s.lives, score: s.score, hi: s.hi,
        deathTimer: s.deathTimer, deaths: s.deaths, booms: boomCount(),
        capsules: s.capsules, ringSteps: s.ringSteps, moved: s.moved
      };
    };

    s.place(SPAWN_X, SPAWN_Y);
    return s;
  }

  CR.Ship = {
    create: create, K: K, KIND: K,
    SPEED_PX: SPEED_PX, SPEED_V: SPEED_V, MAX_SPEED: MAX_SPEED,
    SHIP_W: SHIP_W, SHIP_H: SHIP_H, BOX_DX: BOX_DX, BOX_DY: BOX_DY, BOX_W: BOX_W, BOX_H: BOX_H,
    PLAY: PLAY, SPAWN_X: SPAWN_X, SPAWN_Y: SPAWN_Y,
    SHOT_V: SHOT_V, LASER_V: LASER_V, KILL_X: KILL_X,
    SLOTS_PER_EMITTER: SLOTS_PER_EMITTER, FIRE_DELAY: FIRE_DELAY,
    LASER_MAX_SEG: LASER_MAX_SEG, LASER_STEP: LASER_STEP,
    MAX_OPTION: MAX_OPTION, RING: RING, OPT_LAG: OPT_LAG, OPT_ANIM: OPT_ANIM,
    DEATH_FRAMES: DEATH_FRAMES, INVUL_FRAMES: INVUL_FRAMES, BLINK: BLINK,
    SHIELD_HP: SHIELD_HP, CHECKPOINT_PX: CHECKPOINT_PX,
    START_LIVES: START_LIVES, EXTEND_EVERY: EXTEND_EVERY, HI_KEY: HI_KEY,
    CLEAR_CAPSULE_EVERY: CLEAR_CAPSULE_EVERY,
    GAUGE_MAX: GAUGE_MAX, GAUGE_NAME: GAUGE_NAME, GAUGE_LABEL: GAUGE_LABEL,
    BOOM_FRAME: BOOM_FRAME, DMG_SHOT: DMG_SHOT, DMG_MISSILE: DMG_MISSILE
  };
})();
