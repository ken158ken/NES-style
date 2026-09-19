/*
 * games/cruiser/enemies.js — 《星塵巡航艦》敵人原型 + 出怪表
 * ---------------------------------------------------------------------------
 * 擁有者：stage agent ｜ 依賴：engine/fixed.js（NES.FX）、engine/shmup.js（NES.SH）
 *                      、games/cruiser/chr_world.js（CR.SPR_WORLD）
 * 由 games/cruiser/stage1.js 驅動（stage 擁有物件池、相機、爆炸 / 膠囊）。
 *
 * 座標慣例（契約）：敵人的 `x, y, w, h` 是**畫面座標整數碰撞框**（與船同一套，
 * main.js 直接拿去 `NES.SH.aabb`）。世界座標只有「貼地形」的砲台需要（`wx`），
 * 每幀換算 `x = wx - camX`。內部位移用 8.8 定點（`NES.FX.Vec` / `vadd`）。
 * 角度依 `NES.SH` 契約：**0 = 右、64 = 下、128 = 左、192 = 上**（一圈 256）。
 *
 * 四種原創敵人：
 *   ① fan    蛇行小蜂（8×8）：編隊 5 隻、正弦上下、**全滅掉紅膠囊**（第 3 隻是標記個體）
 *   ② turret 地面砲台（16×16 兩幀）：貼地板 / 貼天花板（flipV），每 90 幀 `NES.SH.aim` 射 1 彈
 *   ③ zig    之字型飛行體（16×16 兩幀）：每 32 幀換垂直方向
 *   ④ tank   直衝硬殼（16×16）：hp 3、鎖定船的高度直衝、撞船
 *
 * 手感數字來源：docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §10
 *   捲動 0.5 px/幀、敵彈基礎 2.0 px/幀（rank ≥ 2 時 ×1.25 = 2.5）。
 * rank（0..3）由 ship 提供：`CR.ship.rank && CR.ship.rank()`；
 *   rank ≥ 2 → 敵彈速度 ×1.25；rank ≥ 3 → 砲台改「預判射擊」（用船的位移補償）。
 *   **rank 不影響出怪表**（同一關的敵人配置永遠一樣，只有彈速 / 瞄準法改變）。
 *
 * 碰撞框：16×16 的敵人用契約的 12×12（置中），8×8 的小蜂用 8×8；敵彈 4×4（精靈 8×8）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX, SH = NES.SH;
  if (!FX) throw new Error('games/cruiser/enemies.js 需要 engine/fixed.js');
  if (!SH || !SH.aim) throw new Error('games/cruiser/enemies.js 需要 engine/shmup.js（NES.SH）');

  /* ---------------------------------------------------------- 規格表 */
  var SPEC = {
    fan:    { w: 8,  h: 8,  hp: 1, score: 100, small: true,  size: 8,  pal: 2 },
    turret: { w: 12, h: 12, hp: 2, score: 200, small: true,  size: 16, pal: 3 },
    zig:    { w: 12, h: 12, hp: 1, score: 150, small: true,  size: 16, pal: 2 },
    tank:   { w: 12, h: 12, hp: 3, score: 400, small: false, size: 16, pal: 3 }
  };
  var KINDS = ['fan', 'turret', 'zig', 'tank'];
  // 研究 §3-3 [源]「**紅色單體**：一般敵人多是灰 / 藍配色，紅色版本必掉膠囊」。
  // R2 原本只實作「編隊全滅掉膠囊」⇒ qa2 的機器人 2400 幀 0 顆膠囊、全程速度 1（`capsuleSeq()` 恆 0），
  // 等於沒有強化管道。改用 spr1（ship 的 紅 $16 / 橘 $28 / 白 $30，已在場上）畫紅色版本，0 新顏色、0 新磚。
  var PAL_DROP = 1;

  var FAN_VX = -FX.v88(1, 128);        // -1.5 px/幀
  var FAN_AMP = 20;                    // 正弦振幅（px）
  var FAN_STEP = 3;                    // 每幀相位（256 = 一圈 ⇒ 約 85 幀一圈）
  var ZIG_VX = -FX.v88(1, 64);         // -1.25 px/幀
  var ZIG_VY = FX.v88(1, 0);           // ±1.0 px/幀
  var ZIG_PERIOD = 32;                 // 每 32 幀換向
  var TANK_VX = -FX.v88(2, 128);       // -2.5 px/幀
  var TURRET_PERIOD = 90;              // 每 90 幀射 1 彈
  // QA R2 P2-3：要塞入口（欄 144~158）與天地反轉段（欄 194~210）連滿強化都過不去 ⇒
  // **砲台射擊週期 90 → 130 幀（敵彈密度 −30%）**。實測後把範圍從那兩段擴到整個要塞
  // （世界欄 150~300）：機器人在欄 228 的第三座砲台一樣被瞄準彈鎖死，難點不只兩處。
  // 核心室前（欄 > 300）與小行星帶維持 90（研究 §10 原值）。
  var EASY_PERIOD = 130;
  var EASY_COL0 = 150, EASY_COL1 = 300;          // 世界欄（含）；砲台站在這段裡就放寬（＝整個要塞）
  function turretPeriod(wx) {
    var c = (wx | 0) >> 3;
    return (c >= EASY_COL0 && c <= EASY_COL1) ? EASY_PERIOD : TURRET_PERIOD;
  }
  var BULLET_BASE = FX.v88(2, 0);      // 敵彈基礎 2.0 px/幀（研究 16 §10）
  var LEAD_FRAMES = 20;                // rank ≥ 3 預判：往船的位移方向外推 20 幀

  var GAME_H = 208;                    // 遊戲區高（HUD 在下方 32 線）

  var ctx = null;          // stage 注入的介面
  var tmpV = { vx: 0, vy: 0, a: 0 };   // aim 的重複使用物件（每幀零配置）

  function rank() {
    var s = CR.ship;
    if (s && typeof s.rank === 'function') { var r = s.rank() | 0; return r < 0 ? 0 : (r > 3 ? 3 : r); }
    return 0;
  }
  function bulletSpeed() { return (rank() >= 2) ? ((BULLET_BASE * 5) >> 2) : BULLET_BASE; }   // ×1.25

  /* ---------------------------------------------------------- 編隊記帳 */
  // fan 編隊：5 隻同一個 grp；全滅（left === 0）→ 在標記個體（第 3 隻）的死亡位置掉紅膠囊。
  var groups = {};
  var nextGrp = 1;
  function resetGroups() { groups = {}; nextGrp = 1; }

  /* ---------------------------------------------------------- 物件 */
  function make(i) {
    var e = {
      i: i, kind: 'fan', alive: false,
      x: 0, y: 0, w: 8, h: 8, hp: 1, score: 0, small: true,
      size: 8, pal: 2, flipV: false,
      xs: FX.Vec(0), ys: FX.Vec(0), vx: 0, vy: 0,
      wx: 0, anchored: false, slot: 0,
      t: 0, phase: 0, y0: 0, grp: 0, marked: false, drop: 0, fireT: 0, period: TURRET_PERIOD, flash: 0,
      boss: false, onHit: null, onKill: null, customStep: null, customDraw: null,
      hit: null, kill: null
    };
    e.hit = function (dmg) {
      if (!e.alive) return false;
      dmg = (dmg === undefined ? 1 : dmg) | 0;
      if (e.onHit) return e.onHit(dmg);                    // 魔王部位自己算傷害
      e.hp -= dmg;
      e.flash = 4;
      if (e.hp <= 0) { e.kill(); return true; }
      return false;
    };
    e.kill = function () {
      if (!e.alive) return;
      if (e.onKill) { e.onKill(); return; }                // 魔王部位自己處理死亡
      e.alive = false;
      ctx.boom(e.x + (e.size >> 1), e.y + (e.size >> 1));
      ctx.addScore(e.score);
      if (e.drop) ctx.dropCapsule(e.x, e.y);
      var g = groups[e.grp];
      if (g) {
        g.left--;
        if (e.marked) { g.dropX = e.x; g.dropY = e.y; }
        if (g.left <= 0 && !g.dropped) {
          g.dropped = true;
          ctx.dropCapsule(g.dropX, g.dropY);               // 編隊全滅 → 掉膠囊
        }
      }
      ctx.freeEnemy(e);
    };
    return e;
  }

  /* ---------------------------------------------------------- 生成 */
  function clampY(y) { return SH.clamp(y | 0, 0, GAME_H - 16); }

  // spawn(kind, x, y, opt) → enemy | null（池滿 / 同屏上限 → null，NES 風：沒槽就不生成）
  function spawn(kind, x, y, opt) {
    if (!ctx) return null;
    var sp = SPEC[kind];
    if (!sp) throw new Error('CR.Enemies.spawn：未知敵人種類 ' + kind);
    var e = ctx.allocEnemy();
    if (!e) return null;
    opt = opt || {};
    e.kind = kind;
    e.size = sp.size; e.pal = sp.pal; e.small = sp.small;
    e.hp = (opt.hp === undefined ? sp.hp : opt.hp) | 0;
    e.score = sp.score;
    e.w = sp.w; e.h = sp.h;
    e.x = x | 0; e.y = y | 0;
    FX.vsetPx(e.xs, x | 0); FX.vsetPx(e.ys, y | 0);
    e.t = 0; e.flash = 0; e.flipV = false; e.anchored = false;
    e.grp = opt.grp || 0; e.marked = !!opt.marked; e.drop = opt.drop || 0;
    if (e.drop) e.pal = PAL_DROP;                          // [源] 紅色單體 = 必掉膠囊的視覺訊號
    e.phase = (opt.phase || 0) & 255;
    e.y0 = y | 0;
    e.vx = 0; e.vy = 0; e.fireT = 0;
    e.boss = false; e.onHit = null; e.onKill = null; e.customStep = null; e.customDraw = null;

    if (kind === 'fan') {
      e.vx = FAN_VX;
    } else if (kind === 'turret') {
      e.anchored = true;
      e.wx = (opt.wx === undefined ? (ctx.stage.camX + x) : opt.wx) | 0;
      e.flipV = !!opt.ceiling;                             // 貼天花板：上下翻轉
      e.period = turretPeriod(e.wx);
      e.fireT = (opt.fireT === undefined ? e.period : opt.fireT) | 0;
    } else if (kind === 'zig') {
      e.vx = ZIG_VX;
      e.vy = (opt.dir === -1 ? -ZIG_VY : ZIG_VY);
    } else if (kind === 'tank') {
      e.vx = TANK_VX;
      var sh = ctx.ship();
      if (sh && sh.alive !== false) { e.y = e.y0 = clampY(sh.y - 6); FX.vsetPx(e.ys, e.y); }
    }
    e.alive = true;
    return e;
  }

  // 編隊：n 隻蛇行小蜂，相位錯開；第 3 隻（index 2）是標記個體，全滅時在它的死亡位置掉膠囊
  function spawnFan(x, y, opt) {
    opt = opt || {};
    var n = opt.n || 5, made = [], i, grp = nextGrp++;
    groups[grp] = { left: 0, dropped: false, dropX: x, dropY: y, total: n, id: grp };
    for (i = 0; i < n; i++) {
      var e = spawn('fan', x + i * 12, y, { grp: grp, marked: (i === 2), phase: (i * 20) & 255 });
      if (!e) break;
      groups[grp].left++;
      made.push(e);
    }
    groups[grp].total = made.length;
    if (!made.length) delete groups[grp];
    made.grp = grp;
    return made;
  }

  /* ---------------------------------------------------------- 每幀 */
  function turretFire(e) {
    var sh = ctx.ship();
    if (!sh || sh.alive === false) return null;
    if (e.x < -16 || e.x > 272) return null;
    var tx = sh.x + (sh.w >> 1), ty = sh.y + (sh.h >> 1);
    if (rank() >= 3) {                                     // rank 3：預判射擊
      var v = ctx.shipVel();
      tx += (v.vx * LEAD_FRAMES) >> 4;                     // shipVel 以 1/16 px/幀 回報
      ty += (v.vy * LEAD_FRAMES) >> 4;
      tx = SH.clamp(tx, 0, 255); ty = SH.clamp(ty, 0, GAME_H - 1);
    }
    SH.aim(e.x + 6, e.y + 6, tx, ty, bulletSpeed(), tmpV);
    return ctx.fire(e.x + 6, e.y + 6, tmpV.vx, tmpV.vy);
  }

  function step(e) {
    if (e.customStep) { e.customStep(e); return; }         // 魔王部位（boss.js）自己走
    e.t++;
    if (e.flash > 0) e.flash--;

    if (e.kind === 'fan') {
      FX.vadd(e.xs, e.vx);
      e.x = FX.vpx(e.xs);
      e.phase = (e.phase + FAN_STEP) & 255;
      e.y = e.y0 + ((SH.sin(e.phase) * FAN_AMP) >> 8);

    } else if (e.kind === 'turret') {
      e.x = e.wx - ctx.stage.camX;                         // 貼地形：隨捲動往左
      if (--e.fireT <= 0) { e.fireT = e.period || TURRET_PERIOD; turretFire(e); }

    } else if (e.kind === 'zig') {
      FX.vadd(e.xs, e.vx);
      FX.vadd(e.ys, e.vy);
      e.x = FX.vpx(e.xs); e.y = FX.vpx(e.ys);
      if (e.t % ZIG_PERIOD === 0) e.vy = -e.vy;            // 每 32 幀換向
      if (e.y < 0) { e.y = 0; FX.vsetPx(e.ys, 0); e.vy = ZIG_VY; }
      if (e.y > GAME_H - 16) { e.y = GAME_H - 16; FX.vsetPx(e.ys, e.y); e.vy = -ZIG_VY; }

    } else if (e.kind === 'tank') {
      FX.vadd(e.xs, e.vx);
      e.x = FX.vpx(e.xs);
    }

    // 離開畫面（或砲台被捲走）→ 回收，不計分、不算「編隊全滅」
    if (e.x < -24 || e.x > 320) {
      e.alive = false;
      var g = groups[e.grp];
      if (g) g.left--;
      ctx.freeEnemy(e);
    }
  }

  /* ---------------------------------------------------------- 繪製 */
  var sp = { x: 0, y: 0, tile: 0, pal: 0, flipH: false, flipV: false, behind: false, prio: 3 };
  function put(oam, x, y, tile, pal, flipV, prio) {
    sp.x = x; sp.y = y; sp.tile = tile; sp.pal = pal;
    sp.flipH = false; sp.flipV = !!flipV; sp.behind = false; sp.prio = prio;
    oam.add(sp);
  }
  // 16×16 = 4 顆 8×8 精靈；flipV 時上下對調並各自翻轉（砲台貼天花板用）
  function draw16(oam, t, x, y, pal, flipV, prio) {
    if (!flipV) {
      put(oam, x, y, t[0], pal, false, prio);
      put(oam, x + 8, y, t[1], pal, false, prio);
      put(oam, x, y + 8, t[2], pal, false, prio);
      put(oam, x + 8, y + 8, t[3], pal, false, prio);
    } else {
      put(oam, x, y, t[2], pal, true, prio);
      put(oam, x + 8, y, t[3], pal, true, prio);
      put(oam, x, y + 8, t[0], pal, true, prio);
      put(oam, x + 8, y + 8, t[1], pal, true, prio);
    }
  }

  var PRIO_ENEMY = 3;

  function draw(e, oam, frame) {
    if (e.customDraw) { e.customDraw(e, oam, frame); return; }
    var S = ctx.S, f = ((frame >> 3) & 1);
    var pal = e.pal;
    if (e.flash > 0 && (e.flash & 1)) pal = (pal === 2) ? 3 : 2;   // 受擊換色組＝反白
    if (e.kind === 'fan') {
      put(oam, e.x, e.y, f ? S.BEE1 : S.BEE0, pal, false, PRIO_ENEMY);
    } else if (e.kind === 'turret') {
      var open = (e.fireT <= 20);                          // 射擊前 20 幀砲管伸出
      draw16(oam, open ? S.TUR1 : S.TUR0, e.x - 2, e.y - 2, pal, e.flipV, PRIO_ENEMY);
    } else if (e.kind === 'zig') {
      draw16(oam, f ? S.ZIG1 : S.ZIG0, e.x - 2, e.y - 2, pal, false, PRIO_ENEMY);
    } else if (e.kind === 'tank') {
      draw16(oam, (e.flash > 0) ? S.TANK1 : S.TANK0, e.x - 2, e.y - 2, pal, false, PRIO_ENEMY);
    }
  }

  /* ---------------------------------------------------------- 出怪表 */
  // `NES.SH.Spawner` 的格式 `[{col, fn}]`，`fn(ctx, col, entry)`，camCol 走到 col 時單次觸發。
  // 捲動 0.5 px/幀 ⇒ **1 欄 = 16 幀**；全關 352 欄捲動 ≈ 5632 幀 ≈ 94 秒。
  // 節奏：① 小行星帶（欄 0..127，每 6~10 欄一波）→ ② 要塞（128..287，砲台 + 混編，每 4~6 欄）
  //       → ③ 核心室前（288..350，每 3~5 欄，逼近魔王）。共 56 個事件。
  function buildTable(stage) {
    var T = [];
    function at(col, fn) { T.push({ col: col, fn: fn }); }
    function fan(y) { return function () { spawnFan(272, y); }; }
    // zig(y, dir, red) / zigs(list, redIdx)：`red` 的那一隻 = **紅色單體**（hp 1，打掉必掉膠囊）
    function zig(y, dir, red) { return function () { spawn('zig', 268, y, { dir: dir, drop: red ? 1 : 0 }); }; }
    function zigs(list, redIdx) {
      if (redIdx === undefined) redIdx = -1;
      return function () {
        for (var i = 0; i < list.length; i++) {
          spawn('zig', 268 + i * 10, list[i], { dir: (i & 1) ? -1 : 1, drop: (i === redIdx) ? 1 : 0 });
        }
      };
    }
    // tank(y) 一般硬殼（藍白）；tank(y, true) = **紅色單體**，打掉必掉膠囊（研究 §3-3 [源]）
    function tank(y, red) { return function () { spawn('tank', 268, y, red ? { drop: 1 } : {}); }; }
    // 砲台貼在「畫面右緣再往右 2 欄」的地形上（stage 依該欄的天花板 / 地板算 y）
    function turret(ceiling) {
      return function (c, col) { stage.spawnTurretAt(col + 34, ceiling); };
    }

    // ── ① 小行星帶（稀疏 → 起步）────────────────────────────────
    at(20, fan(56));
    at(30, zig(96, 1));
    at(40, fan(120));
    at(50, zigs([64, 128]));
    at(60, fan(80));
    at(68, tank(96, true));
    at(76, zigs([48, 104]));
    at(84, fan(140));
    at(92, tank(72));
    at(100, zigs([60, 100, 140], 1));
    at(108, fan(96));              // QA P2-3：原本 y = 64（貼天花板），欄 100~127 通道正在收窄，
                                  //          機器人會被逼進左上角撞死 ⇒ 移到通道中央
    at(116, tank(120));
    at(122, zigs([72, 132]));

    // ── ② 要塞入口（砲台 + 混編，漸強）──────────────────────────
    // QA R2 P2-3 的三項放寬（每一項都對應一個實測死因）：
    //   ① 砲台 15 座 → **7 座**，且**每個檢查點（欄 128 / 192 / 256）之後 24 欄內不會遇到砲台**
    //      （砲台站在「事件欄 + 34」、進畫面時相機在「世界欄 − 32」⇒ 事件欄 ≥ 檢查點 + 22）。
    //      依據：qa2 機器人在檢查點 1024 復活後，逐幀追蹤顯示它在欄 149 被世界欄 170 的砲台
    //      瞄準彈鎖死（速度 1 = 1 px/幀，追不開 2 px/幀 的瞄準彈）。
    //   ② 兩個難點段（世界欄 150~240）的砲台週期 90 → 130 幀（敵彈密度 −30%，見 EASY_PERIOD）。
    //   ③ **每個檢查點之後 10 欄內放一隻紅色單體**（打掉必掉膠囊，研究 §3-3 [源]），
    //      讓「死亡 → 全部強化歸零 → 速度 1」的複利懲罰有一條回血路徑。
    at(132, fan(72));
    at(138, zigs([80, 120], 0));          // ★ 紅色單體（檢查點 128 + 10）
    at(146, tank(104));
    at(152, turret(false));               // 世界欄 186
    at(160, zigs([64, 96, 128], 1));
    at(166, turret(true));                // 世界欄 200
    at(172, fan(56));
    at(180, tank(80));
    at(182, turret(false));               // 世界欄 216
    at(196, fan(112));
    at(202, zigs([72, 136], 0));          // ★ 紅色單體（檢查點 192 + 10）
    at(210, tank(64, true));              // ★ 紅色硬殼
    at(216, turret(true));                // 世界欄 250
    at(226, fan(96));
    at(232, turret(false));               // 世界欄 266
    at(242, zigs([56, 88, 120, 152], 1));
    at(248, turret(true));                // 世界欄 282
    at(254, fan(72));
    at(260, tank(112));
    at(266, zigs([64, 104, 144], 0));     // ★ 紅色單體（檢查點 256 + 10）
    at(274, fan(128));
    at(280, turret(false));               // 世界欄 314

    // ── ③ 核心室前（密集，逼近魔王）────────────────────────────
    // QA R2 P2-3：原本 14 個事件塞在 54 欄（每 3.9 欄 = 62 幀），連滿強化都死 2 次；
    //             改成 11 個事件、間隔 ≥ 4 欄，且檢查點（欄 320）之後 6 欄（96 幀）內不出怪。
    at(290, zigs([56, 96, 136]));
    at(296, tank(72));
    at(302, fan(104));
    at(308, zigs([64, 128], 0));
    at(314, tank(96));
    at(319, fan(80));
    at(326, zigs([48, 88, 128, 160], 1));
    at(332, tank(144, true));
    at(338, fan(120));
    at(344, zigs([72, 112, 152], 1));
    at(348, tank(104));
    return T;
  }

  /* ---------------------------------------------------------- 匯出 */
  CR.Enemies = {
    KINDS: KINDS,
    SPEC: SPEC,
    TURRET_PERIOD: TURRET_PERIOD, EASY_PERIOD: EASY_PERIOD, turretPeriod: turretPeriod, PAL_DROP: PAL_DROP,
    ZIG_PERIOD: ZIG_PERIOD,
    BULLET_BASE: BULLET_BASE,
    FAN_AMP: FAN_AMP,
    bulletSpeed: bulletSpeed,
    rank: rank,
    make: make,
    init: function (c) { ctx = c; resetGroups(); },
    reset: resetGroups,
    groups: function () { return groups; },
    groupOf: function (id) { return groups[id] || null; },
    spawn: spawn,
    spawnFan: spawnFan,
    step: step,
    draw: draw,
    draw16: draw16,
    put: put,
    buildTable: buildTable
  };
})();
