/*
 * games/cart1/pinball/phys.js — 《星塵彈珠台》桌面幾何 + 定點數物理（全域只掛 CT.Pinball.Phys）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 零相依（不碰 PPU / APU）⇒ 測試可單獨載入本檔。
 *
 * 單位：位置 / 速度一律 **Q8**（1 px = 256，速度 = 1/256 px/幀），全部整數；
 *       角度 = 1/1024 圈（0 = +x、256 = +y 向下），三角函數查表（Q8，只在載入時建表）。
 *
 * 防穿模（測試 test_pinball.py 有專項證明）：
 *   1. 每幀固定 SUB = 8 個子步；球速上限 MAXV = 9 px/幀 ⇒ 每子步位移 ≤ 1.13 px，
 *      遠小於「球半徑 + 牆半徑」(3.5 + 1 = 4.5 px) ⇒ 球心不可能一步越過任何線段。
 *   2. 擋板角度也在子步內推進（每子步 ≤ 5 單位 ≈ 1.76°），擋板尖端每子步位移 ≤ 0.6 px
 *      ⇒ 擋板掃過的距離同樣 < 接觸厚度（3.5 + 3 = 6.5 px），推出方向永遠取對的那一側。
 *   3. 推出方向 = 球心減去線段最近點（不是線段法線）⇒ 端點 / 尖端也是圓角，不會卡進縫。
 *
 * 桌面（直向 256 × 448 px，世界座標；> 一個畫面高 ⇒ 遊戲用垂直捲動 + split 狀態列）：
 *   上方拱頂 + 4 條 S T A R 滾道、3 顆保險桿（pop bumper）、左側 3 顆落下靶、
 *   中央 3 顆立靶、右側星洞（saucer）、兩組彈弓（slingshot）、引導軌、左右擋板、右側發射道。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var PB = CT.Pinball = CT.Pinball || {};

  var Q = 256;                       // 1 px
  var SUB = 8;                       // 每幀子步數
  var MAXV = 9 * Q;                  // 速度上限（px/幀）
  var GRAV = 20;                     // 每幀重力（Q8 px/幀²）≈ 0.078
  var BALL_R = 896;                  // 3.5 px

  /* ---------------- 三角函數表（Q8，1024 分度；只在載入時呼叫 Math.sin 建表） ---------------- */
  var SIN = new Int16Array(1024);
  (function () { for (var i = 0; i < 1024; i++) SIN[i] = Math.round(Math.sin(i * 2 * Math.PI / 1024) * 256); })();
  function sin(a) { return SIN[a & 1023]; }
  function cos(a) { return SIN[(a + 256) & 1023]; }

  // 整數平方根（floor）：Math.sqrt 只當初值，再整數修正 ⇒ 結果保證是 floor(√n)
  function isqrt(n) {
    if (n <= 0) return 0;
    var r = Math.floor(Math.sqrt(n));
    while (r * r > n) r--;
    while ((r + 1) * (r + 1) <= n) r++;
    return r;
  }
  function fdiv(a, b) { return Math.floor(a / b); }   // 整數除法（向下取整）

  /* ---------------- 擋板常數 ---------------- */
  var FL = {
    L: 18 * Q,          // 支點到尖端
    R: 3 * Q,           // 擋板半徑（膠囊）
    REST: 85,           // 靜止：往下 30°
    UP: -85,            // 舉起：往上 30°
    W_UP: 64,           // 舉起角速度（單位 / 幀）= 每子步 8（尖端每子步 0.9 px）
    W_DOWN: 16,         // 放下角速度 = 每子步 2
    E: 72               // 恢復係數 0.28（擋板吸球、好接）
  };

  /* ---------------- 桌面幾何（px；畫圖 art.js 與物理共用同一份資料） ---------------- */
  // seg: [x1,y1,x2,y2, r(px), kind]；kind: wall / sling / post / guide
  var WALLS = [
    // 外框（順時針）：左牆 → 左上斜角 → 頂 → 右上斜角 → 右牆
    [12, 448, 12, 64, 1, 'wall'],
    [12, 64, 28, 32, 1, 'wall'], [28, 32, 60, 16, 1, 'wall'],
    [60, 16, 180, 16, 1, 'wall'],
    [180, 16, 212, 32, 1, 'wall'], [212, 32, 244, 64, 1, 'wall'],
    [244, 64, 244, 448, 1, 'wall'],
    // 發射道內牆
    [228, 448, 228, 120, 1, 'wall'],
    // 下方引導軌（斜率 1:2）
    [12, 356, 92, 396, 1, 'guide'],
    [228, 356, 148, 396, 1, 'guide'],
    // 滾道分隔柱
    [60, 28, 60, 44, 2, 'post'], [92, 28, 92, 44, 2, 'post'], [124, 28, 124, 44, 2, 'post'],
    [156, 28, 156, 44, 2, 'post'], [188, 28, 188, 44, 2, 'post'],
    // 左彈弓（直邊 / 下邊 / 踢擊斜邊）
    [40, 312, 40, 348, 1, 'wall'], [40, 348, 64, 360, 1, 'wall'], [40, 312, 64, 360, 1, 'sling'],
    // 右彈弓（鏡像）
    [200, 312, 200, 348, 1, 'wall'], [200, 348, 176, 360, 1, 'wall'], [200, 312, 176, 360, 1, 'sling']
  ];
  // 保險桿（pop bumper）
  var BUMPERS = [[96, 88, 10], [144, 88, 10], [120, 128, 10]];
  // 落下靶（左側直立三片）
  var DROPS = [[20, 185, 20, 197], [20, 201, 20, 213], [20, 217, 20, 229]];
  // 立靶（中央橫向三片）
  var STANDUPS = [[92, 248, 104, 248], [114, 248, 126, 248], [136, 248, 148, 248]];
  // 星洞（saucer）
  var SAUCER = { x: 204, y: 192, r: 5 };
  // 滾道感應區（S T A R），中心 x
  var LANES = [76, 108, 140, 172];
  var LANE_Y0 = 28, LANE_Y1 = 46;
  // 擋板支點
  var FLIPPERS = [{ x: 96, y: 400, side: 1 }, { x: 144, y: 400, side: -1 }];
  // 發射道
  var PLUNGER = { x: 236, y: 436, laneX: 228, minV: 1408, maxV: 2304, maxPull: 48 };
  var DRAIN_Y = 452;

  function mkSeg(a, kind) {
    var s = { x1: a[0] * Q, y1: a[1] * Q, x2: a[2] * Q, y2: a[3] * Q, r: a[4] * Q, kind: kind || a[5] || 'wall',
              on: true, id: 0, e: 112, kick: 0 };
    s.dx = s.x2 - s.x1; s.dy = s.y2 - s.y1; s.len2 = s.dx * s.dx + s.dy * s.dy;
    if (s.kind === 'sling') { s.e = 160; s.kick = 640; }
    if (s.kind === 'post') s.e = 128;
    if (s.kind === 'drop' || s.kind === 'standup') s.e = 96;
    return s;
  }

  function buildShapes() {
    var segs = [], i, s;
    for (i = 0; i < WALLS.length; i++) { s = mkSeg(WALLS[i]); s.id = i; segs.push(s); }
    for (i = 0; i < DROPS.length; i++) { s = mkSeg(DROPS[i].concat([2]), 'drop'); s.id = i; segs.push(s); }
    for (i = 0; i < STANDUPS.length; i++) { s = mkSeg(STANDUPS[i].concat([2]), 'standup'); s.id = i; segs.push(s); }
    var circs = [];
    for (i = 0; i < BUMPERS.length; i++) {
      circs.push({ x: BUMPERS[i][0] * Q, y: BUMPERS[i][1] * Q, r: BUMPERS[i][2] * Q, kind: 'bumper', id: i, on: true });
    }
    return { segs: segs, circs: circs };
  }

  /* ---------------- 擋板 ---------------- */
  function newFlipper(def) {
    return { px: def.x * Q, py: def.y * Q, side: def.side, a: FL.REST, w: 0, held: false };
  }
  // 尖端座標（Q8）
  function flipTip(f, out) {
    out = out || {};
    out.x = f.px + f.side * fdiv(FL.L * cos(f.a), 256);
    out.y = f.py + fdiv(FL.L * sin(f.a), 256);
    return out;
  }

  /* ---------------- 世界 ---------------- */
  function World() {
    var sh = buildShapes();
    this.segs = sh.segs;
    this.circs = sh.circs;
    this.flips = [newFlipper(FLIPPERS[0]), newFlipper(FLIPPERS[1])];
    this.ball = { x: PLUNGER.x * Q, y: PLUNGER.y * Q, vx: 0, vy: 0, r: BALL_R, parked: true, live: true, held: 0 };
    this.events = [];             // 本幀碰撞事件 {type, id}
    this.hitCool = {};            // 同一物件連續觸發冷卻（幀）
    this.frame = 0;
    this.maxPen = 0;              // 解算後殘留穿透量（測試用）
    this._tip = {};
  }

  World.prototype.ev = function (type, id) {
    var key = type + id;
    if (this.hitCool[key] > 0) return;
    this.hitCool[key] = 6;
    this.events.push({ type: type, id: id });
  };

  World.prototype.park = function () {
    var b = this.ball;
    b.x = PLUNGER.x * Q; b.y = PLUNGER.y * Q; b.vx = 0; b.vy = 0; b.parked = true; b.live = true; b.held = 0;
  };
  World.prototype.launch = function (pull) {
    var b = this.ball;
    if (!b.parked) return false;
    var p = Math.max(0, Math.min(PLUNGER.maxPull, pull | 0));
    b.parked = false;
    b.vx = 0;
    b.vy = -(PLUNGER.minV + fdiv((PLUNGER.maxV - PLUNGER.minV) * p, PLUNGER.maxPull));
    return true;
  };
  World.prototype.setFlip = function (i, held) { this.flips[i].held = !!held; };

  // 擋板角速度（本幀）
  function flipW(f) {
    if (f.held) return f.a > FL.UP ? -FL.W_UP : 0;
    return f.a < FL.REST ? FL.W_DOWN : 0;
  }

  // 球對線段（含半徑）碰撞；vsx/vsy = 接觸點表面速度（擋板用，其他 0）
  World.prototype.resolveSeg = function (b, x1, y1, dx, dy, len2, rad, e, kick, vsx, vsy) {
    var px = b.x - x1, py = b.y - y1;
    var t = px * dx + py * dy;
    var cx, cy;
    if (t <= 0 || len2 === 0) { cx = x1; cy = y1; }
    else if (t >= len2) { cx = x1 + dx; cy = y1 + dy; }
    else { cx = x1 + fdiv(dx * t, len2); cy = y1 + fdiv(dy * t, len2); }
    var ox = b.x - cx, oy = b.y - cy;
    var R = b.r + rad;
    var d2 = ox * ox + oy * oy;
    if (d2 >= R * R) return false;
    var d = isqrt(d2), nx, ny;
    if (d === 0) {                     // 正好壓在線上：取線段法線（往上那側）
      var L = isqrt(len2) || 1;
      nx = fdiv(-dy * 256, L); ny = fdiv(dx * 256, L);
      if (ny > 0) { nx = -nx; ny = -ny; }
    } else { nx = fdiv(ox * 256, d); ny = fdiv(oy * 256, d); }
    var pen = R - d;
    b.x += fdiv(nx * pen + 128, 256) + (nx > 0 ? 1 : (nx < 0 ? -1 : 0));
    b.y += fdiv(ny * pen + 128, 256) + (ny > 0 ? 1 : (ny < 0 ? -1 : 0));
    var rvx = b.vx - vsx, rvy = b.vy - vsy;
    var vn = fdiv(rvx * nx + rvy * ny, 256);
    if (vn < 0) {
      var j = fdiv(-(256 + e) * vn, 256);
      b.vx += fdiv(j * nx, 256);
      b.vy += fdiv(j * ny, 256);
      if (kick && vn < -96) { b.vx += fdiv(kick * nx, 256); b.vy += fdiv(kick * ny, 256); }
      // 切向小摩擦
      b.vx -= fdiv(b.vx, 1024); b.vy -= fdiv(b.vy, 1024);
    }
    return vn < -48 ? 2 : 1;           // 2 = 有力撞擊（觸發得分 / 音效）
  };

  World.prototype.resolveCirc = function (b, c) {
    var ox = b.x - c.x, oy = b.y - c.y, R = b.r + c.r;
    var d2 = ox * ox + oy * oy;
    if (d2 >= R * R) return false;
    var d = isqrt(d2) || 1;
    var nx = fdiv(ox * 256, d), ny = fdiv(oy * 256, d);
    var pen = R - d;
    b.x += fdiv(nx * pen, 256) + (nx > 0 ? 1 : -1);
    b.y += fdiv(ny * pen, 256) + (ny > 0 ? 1 : -1);
    var vn = fdiv(b.vx * nx + b.vy * ny, 256);
    if (vn < 0) {
      // pop bumper：法向分量直接換成固定踢出速度
      var kickV = 1152;
      b.vx += fdiv((kickV - vn) * nx, 256);
      b.vy += fdiv((kickV - vn) * ny, 256);
    }
    return true;
  };

  World.prototype.resolveFlip = function (b, f, w) {
    var t = flipTip(f, this._tip);
    var dx = t.x - f.px, dy = t.y - f.py;
    var len2 = dx * dx + dy * dy;
    // 先粗判（省事）
    var mx = b.x - f.px, my = b.y - f.py, lim = FL.L + FL.R + b.r + 512;
    if (mx > lim || mx < -lim || my > lim || my < -lim) return false;
    // 接觸點表面速度：v = ω × r（ω：單位/幀 → 弧度 = ω·2π/1024 ≈ ω·1608/2^18）
    var px = b.x - f.px, py = b.y - f.py;
    var tt = px * dx + py * dy, rx, ry;
    if (tt <= 0) { rx = 0; ry = 0; } else if (tt >= len2) { rx = dx; ry = dy; }
    else { rx = fdiv(dx * tt, len2); ry = fdiv(dy * tt, len2); }
    var k = w * 1608 * f.side;
    var vsx = fdiv(-ry * k, 262144), vsy = fdiv(rx * k, 262144);
    return this.resolveSeg(b, f.px, f.py, dx, dy, len2, FL.R, FL.E, 0, vsx, vsy);
  };

  // 一幀：輸入已用 setFlip 設好
  World.prototype.step = function () {
    var b = this.ball, i, k, s, r;
    this.events.length = 0;
    this.frame++;
    for (k in this.hitCool) if (this.hitCool[k] > 0) this.hitCool[k]--;
    var w0 = flipW(this.flips[0]), w1 = flipW(this.flips[1]);
    if (b.held > 0) {                  // 星洞吸住
      b.held--;
      b.vx = 0; b.vy = 0;
      if (b.held === 0) { b.vx = -640; b.vy = 384; b.y += 3 * Q; b.x -= 3 * Q; this.events.push({ type: 'eject', id: 0 }); }
      this.stepFlippers(w0, w1, true);
      return;
    }
    if (b.parked || !b.live) { this.stepFlippers(w0, w1, true); return; }
    b.vy += GRAV;
    // 速度上限
    var sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > MAXV * MAXV) {
      var sp = isqrt(sp2);
      b.vx = fdiv(b.vx * MAXV, sp); b.vy = fdiv(b.vy * MAXV, sp);
    }
    var ax = 0, ay = 0, ex, ey;
    for (var n = 1; n <= SUB; n++) {
      // 擋板先轉（子步）
      this.stepFlippers(w0, w1, false);
      ex = fdiv(b.vx * n, SUB); ey = fdiv(b.vy * n, SUB);
      b.x += ex - ax; b.y += ey - ay; ax = ex; ay = ey;
      for (i = 0; i < this.segs.length; i++) {
        s = this.segs[i];
        if (!s.on) continue;
        r = this.resolveSeg(b, s.x1, s.y1, s.dx, s.dy, s.len2, s.r, s.e, s.kick, 0, 0);
        if (r) {
          if (s.kind === 'sling' && r === 2) this.ev('sling', s.id);
          else if (s.kind === 'drop') this.ev('drop', s.id);
          else if (s.kind === 'standup' && r === 2) this.ev('standup', s.id);
          else if (r === 2 && s.kind === 'wall') this.ev('wall', s.id);
          // 速度被改了 ⇒ 重算剩下子步的分配
          ax = fdiv(b.vx * n, SUB); ay = fdiv(b.vy * n, SUB);
        }
      }
      for (i = 0; i < this.circs.length; i++) {
        if (this.resolveCirc(b, this.circs[i])) {
          this.ev('bumper', i);
          ax = fdiv(b.vx * n, SUB); ay = fdiv(b.vy * n, SUB);
        }
      }
      for (i = 0; i < 2; i++) {
        if (this.resolveFlip(b, this.flips[i], i === 0 ? w0 : w1)) {
          ax = fdiv(b.vx * n, SUB); ay = fdiv(b.vy * n, SUB);
        }
      }
    }
    this.maxPen = Math.max(this.maxPen, this.penetration());
    // 感應區
    var bx = b.x >> 8, by = b.y >> 8;
    if (by >= LANE_Y0 && by <= LANE_Y1) {
      for (i = 0; i < LANES.length; i++) if (bx >= LANES[i] - 9 && bx <= LANES[i] + 9) this.ev('lane', i);
    }
    var sx = b.x - SAUCER.x * Q, sy = b.y - SAUCER.y * Q;
    if (sx * sx + sy * sy < (SAUCER.r * Q) * (SAUCER.r * Q) && !this.hitCool.saucer0) {
      b.held = 50; b.x = SAUCER.x * Q; b.y = SAUCER.y * Q; b.vx = 0; b.vy = 0;
      this.ev('saucer', 0);
      this.hitCool.saucer0 = 90;
    }
    // 發射道底部：球回到發射桿上 ⇒ 重新停靠
    if (b.x > PLUNGER.laneX * Q && b.y >= PLUNGER.y * Q && b.vy >= 0) { this.park(); this.events.push({ type: 'repark', id: 0 }); }
    if (by > DRAIN_Y) { b.live = false; this.events.push({ type: 'drain', id: 0 }); }
  };

  World.prototype.stepFlippers = function (w0, w1, whole) {
    var div = whole ? 1 : SUB;
    var f0 = this.flips[0], f1 = this.flips[1];
    f0.w = w0; f1.w = w1;
    f0.a = clampA(f0.a + fdiv(w0, div));
    f1.a = clampA(f1.a + fdiv(w1, div));
  };
  function clampA(a) { return a < FL.UP ? FL.UP : (a > FL.REST ? FL.REST : a); }

  // 殘留穿透量（Q8）：球與所有實體的最大重疊（解算後應 ≈ 0）
  World.prototype.penetration = function () {
    var b = this.ball, worst = 0, i, s, pen;
    for (i = 0; i < this.segs.length; i++) {
      s = this.segs[i];
      if (!s.on) continue;
      pen = segPen(b, s.x1, s.y1, s.dx, s.dy, s.len2, s.r);
      if (pen > worst) worst = pen;
    }
    for (i = 0; i < 2; i++) {
      var f = this.flips[i], t = flipTip(f, {});
      var dx = t.x - f.px, dy = t.y - f.py;
      pen = segPen(b, f.px, f.py, dx, dy, dx * dx + dy * dy, FL.R);
      if (pen > worst) worst = pen;
    }
    return worst;
  };
  function segPen(b, x1, y1, dx, dy, len2, rad) {
    var px = b.x - x1, py = b.y - y1, t = px * dx + py * dy, cx, cy;
    if (t <= 0) { cx = x1; cy = y1; } else if (t >= len2) { cx = x1 + dx; cy = y1 + dy; }
    else { cx = x1 + fdiv(dx * t, len2); cy = y1 + fdiv(dy * t, len2); }
    var ox = b.x - cx, oy = b.y - cy, d = isqrt(ox * ox + oy * oy), R = b.r + rad;
    return R - d;
  }

  // 球心在擋板線的哪一側（>0 = 上方 / 正常側）；測試防穿模用
  World.prototype.flipSide = function (i) {
    var f = this.flips[i], b = this.ball, t = flipTip(f, {});
    var dx = t.x - f.px, dy = t.y - f.py;
    var cr = dx * (b.y - f.py) - dy * (b.x - f.px);   // 叉積
    return -cr * f.side;
  };

  PB.Phys = {
    Q: Q, SUB: SUB, MAXV: MAXV, GRAV: GRAV, BALL_R: BALL_R, FL: FL,
    WALLS: WALLS, BUMPERS: BUMPERS, DROPS: DROPS, STANDUPS: STANDUPS, SAUCER: SAUCER,
    LANES: LANES, LANE_Y0: LANE_Y0, LANE_Y1: LANE_Y1, FLIPPERS: FLIPPERS, PLUNGER: PLUNGER, DRAIN_Y: DRAIN_Y,
    sin: sin, cos: cos, isqrt: isqrt, flipTip: flipTip,
    World: World,
    create: function () { return new World(); }
  };
})();
