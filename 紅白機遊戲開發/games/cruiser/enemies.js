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
    tank:   { w: 12, h: 12, hp: 3, score: 400, small: false, size: 16, pal: 3 },
    // fix3（使用者回饋「一開始還沒吃到強化就一堆撞了會死的礁石」）：
    // 小行星帶的小碎塊改成**可破壞的敵人**（hp 2、100 分），只有 16×16 大隕石維持地形。
    rock:   { w: 8,  h: 8,  hp: 2, score: 100, small: true,  size: 8,  pal: 3 }
  };
  var KINDS = ['fan', 'turret', 'zig', 'tank', 'rock'];
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
  var ROCK_VX = -FX.v88(1, 0);         // 小隕石 -1.0 px/幀（比捲動 0.5 快一倍，會「迎面飄來」）
  var TURRET_PERIOD = 90;              // 每 90 幀射 1 彈
  // QA R2 P2-3：連滿強化都過不去 ⇒ **砲台射擊週期 90 → 130 幀（敵彈密度 −30%）**。
  // fix3 三段式改版後**砲台只存在於要塞（世界欄 248 起）**，所以放寬區直接涵蓋 248..383；
  // 空戰段 / 小行星帶完全沒有砲台（＝沒有敵彈），`spawnTest` 生在別處的砲台維持 90（研究 §10 原值）。
  var EASY_PERIOD = 130;
  var EASY_COL0 = 248, EASY_COL1 = 383;          // 世界欄（含）；砲台站在這段裡就放寬（＝整個要塞）
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
    } else if (kind === 'rock') {
      e.vx = ROCK_VX;                                      // 直線飄，不追人、不開火
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

    } else if (e.kind === 'tank' || e.kind === 'rock') {
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
    } else if (e.kind === 'rock') {
      // hp 2 → 1 換成「裂開」那一張（研究 §10-6：每吃一點傷害換一張圖 = 最便宜的命中回饋）
      put(oam, e.x, e.y, (e.hp <= 1) ? S.MROCK1 : S.MROCK0, pal, false, PRIO_ENEMY);
    }
  }

  /* ---------------------------------------------------------- 出怪表 */
  // `NES.SH.Spawner` 的格式 `[{col, fn}]`，`fn(ctx, col, entry)`，camCol 走到 col 時單次觸發。
  // 捲動 0.5 px/幀 ⇒ **1 欄 = 16 幀**；事件欄 c 生成的敵人在畫面右緣外（＝世界欄 c + 34）。
  //
  // ── fix3：關卡 1 依研究 §7-1 改成「三段式」 ──────────────────────────────────
  // 使用者真機回饋：「一開始還沒吃到任何武器加強就一堆礁石（撞了會死）…宇宙巡航艦前半段是
  // 空曠的宇宙，會有小怪物打出來吃加強道具，最後才進到比較多怪物的地方。」
  //
  //   ① 空戰段  camX    0..1280（欄   0..160）：純星空。**無地形 / 無隕石 / 無砲台 ⇒ 敵彈 0 發**。
  //      只有 fan 編隊（全滅掉膠囊）11 波 + 紅色單體（必掉）3 隻 + 少量 zig；事件間隔 8~10 欄
  //      （128~160 幀）⇒ 玩家在進本關段前就能湊齊 SPEED / MISSILE / OPTION。
  //   ② 本關段  camX 1280..2560（欄 160..320）：先小行星帶（可破壞的 `rock` + 大隕石通道），
  //      再進要塞（天花板 / 地板凸起 + 砲台 7 座 + tank 硬殼）；強度逐段爬升（研究 11 §⑯）。
  //   ③ 魔王段  camX 2560..3072（欄 320..384）：核心室。欄 300..323 是魔王前的「呼吸區」。
  //
  // 硬規則（fix2 已驗收，本輪維持）：檢查點（欄 0 / 64 / 128 / 192 / 256 / 320）之後
  //   22 欄內不放砲台事件、14 欄內至少一隻紅色單體（死亡後的回血路徑）。
  function buildTable(stage) {
    var T = [];
    function at(col, fn) { T.push({ col: col, fn: fn }); }
    function fan(y) { return function () { spawnFan(272, y); }; }
    // zig(y, dir, red) / zigs(list, redIdx)：`red` 的那一隻 = **紅色單體**（hp 1，打掉必掉膠囊）
    function zig(y, dir, red) { return function () { spawn('zig', 268, y, { dir: dir, drop: red ? 1 : 0 }); }; }
    function redzig(y) { return zig(y, 1, true); }        // ★ 紅色單體
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
    // rocks([y…])：可破壞小隕石（hp 2 / 100 分）—— 只出現在小行星帶
    function rocks(list) {
      return function () {
        for (var i = 0; i < list.length; i++) spawn('rock', 268 + i * 12, list[i], {});
      };
    }
    // 砲台貼在「畫面右緣再往右 2 欄」的地形上（stage 依該欄的天花板 / 地板算 y）
    function turret(ceiling) {
      return function (c, col) { stage.spawnTurretAt(col + 34, ceiling); };
    }

    // ── ① 空戰段（欄 0..160 ＝ camX 0..1280）：純星空、零敵彈、膠囊提款機 ──────
    // 膠囊管道：fan 編隊 11 波（全滅各 1 顆）+ **紅色單體 7 隻**（1 發即掉）= 最多 18 顆。
    // 紅色單體是「保底」管道（hp 1、必掉），編隊全滅是「獎勵」管道 ⇒ 一般玩家自然可拿 7~10 顆，
    // 足夠買 SPEED(1) + MISSILE(2) + OPTION(5)（能量表格位越後面越貴，見研究 §3）。
    // 波距 14 欄 = 224 幀（一波 fan 在畫面上存活 ≈ 229 幀 ⇒ 同屏幾乎不會超過一波，不會撞到 10 隻上限）。
    // fan 的 y0 一律落在 56..128：正弦振幅 ±20 ⇒ 實際佔 36..148，上下各留 20 px 以上的逃生空間
    // （實測 y0 = 144 的那一波會把玩家壓在畫面底緣 y 169 附近，機器人連死 3 次）。
    at(12, fan(88));
    at(19, redzig(128));                  // ★ 紅色單體（1 發打掉、必掉膠囊）
    at(26, fan(56));
    at(33, redzig(112));                  // ★
    at(40, fan(128));
    at(47, zig(40, 1));
    at(54, fan(72));
    at(61, redzig(136));                  // ★
    at(68, fan(96));
    at(75, redzig(64));                   // ★（檢查點 欄 64 + 11）
    at(82, fan(120));
    at(89, zigs([48, 144]));
    at(96, fan(64));
    at(103, redzig(120));                 // ★
    at(110, fan(104));
    at(117, redzig(80));                  // ★
    at(124, fan(112));
    at(131, redzig(96));                  // ★（檢查點 欄 128 + 3）
    at(138, fan(72));
    at(145, zigs([56, 124]));
    at(152, fan(100));

    // ── ②A 本關段・小行星帶（欄 160..213 ＝ 世界欄 194..247）──────────────────
    // 大隕石是地形（stage1.js 的 BIG_ROCKS，永遠留 ≥ 18 列的中央通道）；
    // 這裡生的是**可打破的**小隕石，第一次出現時單獨出場（研究 11 §⑯「新元素只有它」）。
    at(162, rocks([64, 120]));
    at(170, fan(96));
    at(177, rocks([48, 104, 152]));
    at(184, zigs([72, 136]));
    at(191, rocks([56, 96, 144]));
    at(198, redzig(112));                 // ★（檢查點 欄 192 + 6）
    at(205, fan(72));
    at(211, rocks([40, 88, 128]));

    // ── ②B 本關段・星際要塞（欄 214..293 ＝ 世界欄 248..327）──────────────────
    // 砲台 7 座：世界欄 250 / 258 / 266 / 274 / 282 / 313 / 318（全部避開檢查點後 22 欄）。
    at(216, turret(false));               // 世界欄 250（地板）
    at(220, fan(128));
    at(224, turret(true));                // 世界欄 258（天花板）
    at(230, zigs([64, 104, 144], 1));
    at(232, turret(false));               // 世界欄 266
    at(238, tank(96));                    // 硬殼第一次登場（此前完全沒有）
    at(240, turret(true));                // 世界欄 274
    at(244, fan(112));
    at(248, turret(false));               // 世界欄 282
    at(252, zigs([56, 120]));
    at(258, redzig(80));                  // ★（檢查點 欄 256 + 2）
    at(264, fan(96));
    at(268, tank(72, true));              // ★ 紅色硬殼
    at(274, zigs([48, 96, 140], 2));
    at(279, turret(false));               // 世界欄 313
    at(281, fan(120));
    at(284, turret(true));                // 世界欄 318（上下對射 = 本關高潮）
    at(288, tank(120));
    at(293, zigs([72, 112, 148], 0));     // ★ 紅色單體（進呼吸區前最後一個）

    // ── ③ 呼吸區 + 魔王段（欄 300..352 ＝ camX 2400..2816）────────────────────
    // 研究 11 §⑯-2 第 ⑤ 段：魔王前要有一段幾乎沒有敵人的開闊區。
    at(300, fan(88));                     // 呼吸前最後一波補給
    at(324, redzig(96));                  // ★（檢查點 欄 320 + 4）＝ 魔王前回血點
    at(332, fan(120));                    // 最後補給（必掉）
    // 欄 333..352 完全淨空 ⇒ 玩家有 320 幀調整位置、看能量表，然後魔王進場
    return T;
  }

  /* ---------------------------------------------------------- 匯出 */
  CR.Enemies = {
    KINDS: KINDS,
    SPEC: SPEC,
    TURRET_PERIOD: TURRET_PERIOD, EASY_PERIOD: EASY_PERIOD, turretPeriod: turretPeriod, PAL_DROP: PAL_DROP,
    ZIG_PERIOD: ZIG_PERIOD,
    BULLET_BASE: BULLET_BASE,
    ROCK_VX: ROCK_VX,
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
