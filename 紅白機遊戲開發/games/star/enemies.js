/*
 * games/star/enemies.js — 《星塵勇者》W1 的三種原創敵人
 * ---------------------------------------------------------------------------
 * 擁有者：star-world agent ｜ 依賴：engine/fixed.js（NES.FX）、engine/shmup.js（NES.SH，選用）
 *                                  games/star/chr_world.js（ST.World.oam16）、levels_w1.js（ST.solidKind）
 * 契約：docs/TASKS.md「R2b §契約 敵人」
 *
 *   ① roller  岩球     0.5 px/幀 走路、撞牆轉向、可選「坑邊不掉」、**可踩**（壓扁 30 幀後消失）
 *   ② bouncer 彈跳球   原地每 60 幀彈一次（vy = −4 px/幀、SMB 重力）、**可踩**（停 60 幀再彈）
 *   ③ flyer   飛行體   正弦 y ±24 px、x 0.75 px/幀 向左、**不可踩**（踩到 = 受傷）
 *
 * 共通：出「畫面右緣 +16 px」時啟動；被無敵星塵撞到 → 死亡飛出；掉出畫面 / 落後相機 → 回收。
 * 速度全部走 NES.FX 定點數（8.8），位置 1/16 px，零浮點累加。
 *
 * ── main.js 的用法 ────────────────────────────────────────────────────────
 *   ST.Enemies.init(level);                       // 換關 / 重開
 *   ST.Enemies.seek(camX);                        // 檢查點復活（前方的敵人重新排隊）
 *   ST.Enemies.update({ hero, camX, level,        // 每幀
 *                       onStomp: e => hero.bounce(),   // ← 有給 callback 才會自動判定主角碰撞
 *                       onHurt:  e => hero.hurt() });
 *   ST.Enemies.draw(oam);                         // NES.SH.OAM：prio 3（壓扁 / 死亡 prio 4）
 *
 * 跨模組防禦：ST.World 還沒 bind（CHR 未合併）時 draw 會靜默跳過；level 沒給就用 g.solidAt。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/enemies.js 需要 engine/fixed.js');

  var SMB = FX.SMB;
  var POOL_SIZE = 12;                       // 同時最多 12 隻（NES 風：沒槽就不生成）
  var SPAWN_MARGIN = 16;                    // 「出畫面右 16 px」啟動
  var DESPAWN_LEFT = 48;                    // 落後相機 48 px 回收
  var WORLD_BOTTOM = 30 * 8 + 48;

  var SPD_ROLL = SMB.enemySlow;             // 0.5  px/幀（$f8）
  var SPD_FLY = SMB.enemyFast;              // 0.75 px/幀（$f4）
  var GRAV = SMB.jump[0].gFall;             // 落下：SMB 的大重力（放開 A）
  var GRAV_UP = SMB.jump[0].gHold;          // 上升：SMB 的小重力（按住 A）⇒ vy −4 剛好 4 格 = 64 px
  var MAXFALL = FX.v88(4, 0);
  var JUMP_VY = -FX.v88(4, 0);              // 彈跳球 vy = −4 px/幀
  var BOUNCE_PERIOD = 60;                   // 每 60 幀跳一次
  var STUN_FRAMES = 60;                     // 踩了停 60 幀
  var SQUASH_FRAMES = 30;                   // 壓扁 30 幀
  var FLY_AMP = 24;                         // 正弦振幅 ±24 px
  var FLY_STEP = 2;                         // 相位速度（256 = 一圈 ⇒ 週期 128 幀）

  // 沒有 engine/shmup.js 時的正弦表退路（8.8 定點、一圈 256）
  var SIN = (NES.SH && NES.SH.SIN) || (function () {
    var t = new Int16Array(256), i;
    for (i = 0; i < 256; i++) t[i] = Math.round(Math.sin(i * Math.PI / 128) * 256);
    return t;
  })();
  function sin8(a) { return SIN[a & 255]; }

  // 沒有 NES.SH.Pool 時的退路（同樣是預先配置、零 GC）
  function makePool(n, factory) {
    if (NES.SH && NES.SH.Pool) return NES.SH.Pool(n, factory);
    var items = [], i;
    for (i = 0; i < n; i++) { items.push(factory(i)); items[i].alive = false; }
    return {
      items: items, size: n, count: 0,
      alloc: function () {
        for (var j = 0; j < n; j++) if (!items[j].alive) { items[j].alive = true; this.count++; return items[j]; }
        return null;
      },
      free: function (o) { if (o && o.alive) { o.alive = false; this.count--; return true; } return false; },
      each: function (fn) {
        for (var j = 0; j < n; j++) if (items[j].alive) { fn(items[j], j); if (!items[j].alive) this.count--; }
      },
      freeAll: function () { for (var j = 0; j < n; j++) items[j].alive = false; this.count = 0; }
    };
  }

  function newEnemy() {
    return {
      kind: 'roller', alive: false,
      x: 0, y: 0, w: 14, h: 14,
      px: FX.Vec(0), py: FX.Vec(0), vx: FX.Acc(0), vy: FX.Acc(0),
      dir: -1, onGround: false, edge: false,
      stompable: true, squash: 0, stun: 0, dying: false,
      t: 0, phase: 0, baseY: 0, amp: FLY_AMP,
      score: 100, hp: 1, src: null,
      // 契約：敵人物件自帶 hit()；main.js 的通用碰撞路徑是
      //   `if (e.stomp) e.stomp(g); else if (e.hit) e.hit(1, g); else e.alive = false;`
      // 沒有這兩個方法的話 main 會直接 `alive = false`，壓扁 / 暈眩就整個消失了。
      stomp: function () { return stomp(this); },
      hit: function () { return kill(this); }
    };
  }

  var pool = makePool(POOL_SIZE, newEnemy);
  var level = null, sorted = [], ptr = 0, tiles = null, camXCache = 0;

  /* R3 star-w2：敵人種類登記表。
   * W1 的三種（roller / bouncer / flyer）維持原本的硬寫分支不動；新世界的敵人用
   *   ST.Enemies.register('bat', { w, h, stompable, score, setup, step, art|draw })
   * 掛進來（見 games/star/enemies_w2.js），本檔不必再長。 */
  var EXT = {};

  // ---- 磚索引快取（ST.World.bind 之後才有值）------------------------------
  function ensureTiles() {
    if (tiles) return tiles;
    var W = ST.World;
    if (!W || !W.bound) return null;
    tiles = {
      roller: [[W.oam16('W_ROLL0_L'), W.oam16('W_ROLL0_R')], [W.oam16('W_ROLL1_L'), W.oam16('W_ROLL1_R')]],
      bouncer: [[W.oam16('W_BOUNCE0_L'), W.oam16('W_BOUNCE0_R')], [W.oam16('W_BOUNCE1_L'), W.oam16('W_BOUNCE1_R')]],
      flyer: [[W.oam16('W_FLY0_L'), W.oam16('W_FLY0_R')], [W.oam16('W_FLY1_L'), W.oam16('W_FLY1_R')]],
      squash: [W.oam16('W_SQUASH_L'), W.oam16('W_SQUASH_R')]
    };
    return tiles;
  }

  // ---- 地形查詢（優先用 g.solidAt，其次 level）----------------------------
  var solidFn = null;
  function kindAtPx(x, y) {
    if (!level) return 'none';
    return level.kindAt(x, y);
  }
  function blocked(x, y) {
    if (solidFn) return !!solidFn(x, y);
    return kindAtPx(x, y) === 'solid';
  }
  // 由上往下才擋的單向平台
  function floorAt(x, y, prevBottom) {
    var k = kindAtPx(x, y);
    if (k === 'solid') return true;
    if (k === 'oneway') return prevBottom <= ((y >> 3) << 3);
    return false;
  }

  // ============================================================ 生成
  function configure(e, kind, x, y, opt) {
    opt = opt || {};
    e.kind = kind;
    e.fragile = false;
    FX.vsetPx(e.px, x); FX.vsetPx(e.py, y);
    e.x = x | 0; e.y = y | 0;
    FX.aset(e.vx, 0); FX.aset(e.vy, 0);
    e.dir = opt.dir === undefined ? -1 : (opt.dir < 0 ? -1 : 1);
    e.edge = !!opt.edge;
    e.onGround = false; e.squash = 0; e.stun = 0; e.dying = false;
    e.t = 0; e.hp = opt.hp || 1;
    e.src = opt.src || null;
    e.amp = opt.amp === undefined ? FLY_AMP : opt.amp;
    e.phase = opt.phase || 0;
    e.baseY = y | 0;
    var ex = EXT[kind];
    if (ex) {
      e.w = ex.w || 14; e.h = ex.h || 14;
      e.stompable = ex.stompable !== false;
      e.score = ex.score || 100;
      e.fragile = !!ex.fragile;
      e.awake = false; e.t2 = 0; e.targetY = 0;
      if (ex.setup) ex.setup(e, opt, API);
      return e;
    }
    if (kind === 'roller') {
      e.w = 14; e.h = 14; e.stompable = true; e.score = 100;
      FX.aset(e.vx, e.dir * SPD_ROLL);
    } else if (kind === 'bouncer') {
      e.w = 14; e.h = 14; e.stompable = true; e.score = 200;
      e.t = opt.phase || 0;
    } else {                                    // flyer
      e.w = 14; e.h = 12; e.stompable = false; e.score = 200;
      FX.aset(e.vx, -SPD_FLY);
    }
    return e;
  }

  function spawn(kind, x, y, opt) {
    var e = pool.alloc();
    if (!e) return null;                        // 沒槽就不生成（真機做法）
    return configure(e, kind, x, y, opt);
  }

  // ============================================================ 各型態 update
  function stepRoller(e) {
    var lead, foot;
    FX.aset(e.vx, e.dir * SPD_ROLL);
    // 水平：先試著走，撞牆就轉向
    FX.vadd(e.px, e.vx.v);
    e.x = FX.vpx(e.px);
    lead = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
    if (blocked(lead, e.y + 2) || blocked(lead, e.y + e.h - 2)) {
      e.dir = -e.dir;
      FX.vsetPx(e.px, e.x - e.dir * 1);        // 退出牆面（−dir 是原本的前進方向）
      e.x = FX.vpx(e.px);
      FX.aset(e.vx, e.dir * SPD_ROLL);
    } else if (e.edge && e.onGround) {
      // 坑邊不掉：前腳下方沒有地板就轉向
      foot = (e.dir > 0) ? (e.x + e.w) : (e.x - 1);
      if (!floorAt(foot, e.y + e.h + 1, e.y + e.h)) {
        e.dir = -e.dir;
        FX.aset(e.vx, e.dir * SPD_ROLL);
      }
    }
    fall(e);
  }

  function stepBouncer(e) {
    if (e.stun > 0) { e.stun--; fall(e); return; }
    e.t++;
    if (e.onGround && (e.t % BOUNCE_PERIOD) === 0) {
      FX.aset(e.vy, JUMP_VY);
      e.onGround = false;
    }
    fall(e);
  }

  function stepFlyer(e) {
    e.t++;
    e.phase = (e.phase + FLY_STEP) & 255;
    FX.vadd(e.px, -SPD_FLY);
    e.x = FX.vpx(e.px);
    e.y = e.baseY + ((sin8(e.phase) * e.amp) >> 8);
    FX.vsetPx(e.py, e.y);
  }

  // 共用重力 + 落地（單向平台只從上方擋）
  function fall(e) {
    var prevBottom = e.y + e.h, ny, foot;
    // 彈跳球的上升段用 gHold（與主角長按 A 的跳躍同一條弧線 ⇒ 4 格 = 64 px）
    FX.aadd(e.vy, (e.kind === 'bouncer' && e.vy.v < 0) ? GRAV_UP : GRAV);
    if (e.vy.v > MAXFALL) FX.aset(e.vy, MAXFALL);
    FX.vadd(e.py, e.vy.v);
    ny = FX.vpx(e.py);
    e.onGround = false;
    if (e.vy.v >= 0) {
      foot = ny + e.h;
      if (floorAt(e.x + 2, foot, prevBottom) || floorAt(e.x + e.w - 2, foot, prevBottom)) {
        ny = ((foot >> 3) << 3) - e.h;
        FX.vsetPx(e.py, ny);
        FX.aset(e.vy, 0);
        e.onGround = true;
      }
    } else if (blocked(e.x + 2, ny) || blocked(e.x + e.w - 2, ny)) {
      ny = (((ny >> 3) + 1) << 3);
      FX.vsetPx(e.py, ny);
      FX.aset(e.vy, 0);
    }
    e.y = ny;
  }

  function stepDying(e) {
    FX.aadd(e.vy, GRAV);
    FX.vadd(e.py, e.vy.v);
    FX.vadd(e.px, e.vx.v);
    e.x = FX.vpx(e.px); e.y = FX.vpx(e.py);
  }

  // ============================================================ 受擊
  function stomp(e) {
    if (!e || !e.alive || e.dying) return false;
    if (!e.stompable) return false;
    if (e.kind === 'bouncer') {                 // 踩了停 60 幀，不會死
      e.stun = STUN_FRAMES;
      e.t = 0;
      FX.aset(e.vy, 0);
      return true;
    }
    e.squash = SQUASH_FRAMES;                   // 岩球：壓扁 30 幀後消失
    FX.aset(e.vx, 0);
    e.stompable = false;
    return true;
  }
  function kill(e, dir) {                       // 死亡飛出（無敵星 / 魔王碎片 / 頂磚）
    if (!e || !e.alive || e.dying) return false;
    e.dying = true;
    e.stompable = false;
    FX.aset(e.vy, -FX.v88(3, 0));
    FX.aset(e.vx, (dir === undefined ? (e.dir || 1) : dir) * FX.v88(1, 0));
    return true;
  }
  function hit(e) { return kill(e); }

  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function overlap(box) {
    var found = null;
    pool.each(function (e) {
      if (found || e.squash > 0 || e.dying) return;
      if (aabb(box, e)) found = e;
    });
    return found;
  }

  // ============================================================ 對外
  // 登記的敵人可以用的共用工具（不必自己重寫重力 / 地形查詢）
  var API = {
    FX: FX, SMB: SMB, sin8: sin8,
    fall: fall, blocked: blocked, kindAtPx: kindAtPx, floorAt: floorAt,
    spawn: function (kind, x, y, opt) { return spawn(kind, x, y, opt); },
    level: function () { return level; },
    camX: function () { return camXCache; },
    GRAV: GRAV, MAXFALL: MAXFALL, SPD_ROLL: SPD_ROLL, SPD_FLY: SPD_FLY
  };

  var Enemies = {
    KINDS: ['roller', 'bouncer', 'flyer'],
    EXT: EXT,
    API: API,
    register: function (kind, def) {
      EXT[kind] = def;
      if (Enemies.KINDS.indexOf(kind) < 0) Enemies.KINDS.push(kind);
      return def;
    },
    pool: pool,
    level: null,
    frame: 0,

    init: function (lv, opts) {
      opts = opts || {};
      level = lv || null;
      Enemies.level = level;
      solidFn = opts.solidAt || null;
      pool.freeAll();
      sorted = [];
      ptr = 0;
      Enemies.frame = 0;
      if (level && level.spawns) {
        sorted = level.spawns.slice().sort(function (a, b) { return a.x - b.x; });
      }
      return Enemies;
    },
    reset: function () { pool.freeAll(); ptr = 0; Enemies.frame = 0; return Enemies; },

    // 檢查點復活：相機左邊的視為已出過，右邊的重新排隊
    seek: function (camX) {
      pool.freeAll();
      ptr = 0;
      while (ptr < sorted.length && sorted[ptr].x < camX) ptr++;
      return ptr;
    },

    spawn: function (kind, x, y, opt) { return spawn(kind, x, y, opt); },
    // 測試用別名（與 R2 stage agent 的 spawnTest 同名慣例）
    spawnTest: function (kind, x, y, opt) { return spawn(kind, x, y, opt); },

    stomp: stomp,
    kill: kill,
    hit: hit,
    starKill: function (e) { return kill(e); },
    overlap: overlap,
    aabb: aabb,
    get count() { return pool.count; },
    // main.js 呼叫的是 `E.each(g, visit)`，本模組內部用 `each(fn)` ⇒ 兩種都吃。
    // 魔王與錘子也一起列舉（main 的碰撞迴圈只走 ST.Enemies），
    // star-hero 若改成自己處理魔王，設 `ST.Enemies.includeBoss = false` 即可關掉。
    includeBoss: true,
    each: function (a, b) {
      var fn = (typeof a === 'function') ? a : b;
      if (typeof fn !== 'function') return 0;
      var n = 0;
      pool.each(function (e) { fn(e); n++; });
      var B = ST.ActiveBoss || ST.Boss;
      if (Enemies.includeBoss && B && B.active && B.alive) { fn(B); n++; }
      if (Enemies.includeBoss && B && B.hammers) B.hammers.each(function (h) { fn(h); n++; });
      return n;
    },
    pending: function () { return sorted.length - ptr; },

    update: function (g) {
      g = g || {};
      Enemies.frame++;
      var camX = (g.camX === undefined) ? camXCache : g.camX;
      camXCache = camX;
      if (g.level && g.level !== level) { level = g.level; Enemies.level = level; }
      if (g.solidAt) solidFn = g.solidAt;

      // ① 出畫面右 16 px 就啟動
      var edge = camX + 256 + SPAWN_MARGIN, s;
      while (ptr < sorted.length && sorted[ptr].x <= edge) {
        s = sorted[ptr++];
        spawn(s.kind, s.x, s.y, s);
      }

      // ② 逐隻推進
      pool.each(function (e) {
        if (e.dying) {
          stepDying(e);
          if (e.y > WORLD_BOTTOM) e.alive = false;
          return;
        }
        if (e.squash > 0) {
          e.squash--;
          if (e.squash === 0) { e.alive = false; return; }
          fall(e);
          return;
        }
        var ex2 = EXT[e.kind];
        if (ex2) ex2.step(e, g, API);
        else if (e.kind === 'roller') stepRoller(e);
        else if (e.kind === 'bouncer') stepBouncer(e);
        else stepFlyer(e);

        if (e.y > WORLD_BOTTOM || e.x + e.w < camX - DESPAWN_LEFT) { e.alive = false; return; }
      });

      // ③ 主角碰撞（給了 callback 才做；star-hero 想自己算就別傳）
      if (g.hero && (g.onStomp || g.onHurt || g.onStar)) collideHero(g);
      return pool.count;
    },

    draw: function (oam) {
      if (!oam || !oam.add) return 0;
      var T = ensureTiles();
      if (!T) return 0;
      var n = 0, cam = camXCache;
      pool.each(function (e) {
        var prio = (e.squash > 0 || e.dying) ? 4 : 3;
        var ex = EXT[e.kind];
        if (ex && e.squash <= 0) {                     // R3 star-w2 的敵人自己畫
          if (typeof ex.draw === 'function') { n += ex.draw(e, oam, cam, prio); return; }
          var p2 = ex.art(e);
          var pal2 = (ex.pal === undefined) ? 3 : ex.pal;
          // 16×16 水平翻轉 = 兩塊**各自翻 + 左右對調**（只翻不調會把左右半邊接反）
          var fl = !!p2[2];
          oam.add({ x: e.x - 1 - cam, y: e.y - 2, tile: fl ? p2[1] : p2[0], pal: pal2, prio: prio, flipH: fl });
          oam.add({ x: e.x + 7 - cam, y: e.y - 2, tile: fl ? p2[0] : p2[1], pal: pal2, prio: prio, flipH: fl });
          n += 2;
          return;
        }
        var pal = (e.kind === 'flyer') ? 3 : 2;
        var sx = e.x - 1 - cam, sy = e.y - 2, pair;
        if (e.squash > 0) pair = T.squash;
        else pair = (T[e.kind] || T.roller)[(e.t >> 3) & 1];
        oam.add({ x: sx, y: sy, tile: pair[0], pal: pal, prio: prio });
        oam.add({ x: sx + 8, y: sy, tile: pair[1], pal: pal, prio: prio });
        n += 2;
      });
      return n;
    },

    // 除錯 / 測試快照
    state: function () {
      var out = [];
      pool.each(function (e) {
        out.push({
          kind: e.kind, x: e.x, y: e.y, dir: e.dir, onGround: e.onGround,
          stompable: e.stompable, squash: e.squash, stun: e.stun, dying: e.dying,
          vx: e.vx.v, vy: e.vy.v, phase: e.phase, baseY: e.baseY
        });
      });
      return { count: pool.count, pending: sorted.length - ptr, frame: Enemies.frame, list: out };
    },

    CONST: {
      SPD_ROLL: SPD_ROLL, SPD_FLY: SPD_FLY, GRAV: GRAV, JUMP_VY: JUMP_VY,
      GRAV_UP: GRAV_UP, BOUNCE_PERIOD: BOUNCE_PERIOD, STUN_FRAMES: STUN_FRAMES, SQUASH_FRAMES: SQUASH_FRAMES,
      FLY_AMP: FLY_AMP, FLY_STEP: FLY_STEP, POOL_SIZE: POOL_SIZE, SPAWN_MARGIN: SPAWN_MARGIN
    }
  };

  function collideHero(g) {
    var h = g.hero;
    var box = { x: h.x, y: h.y, w: h.w || 12, h: h.h || 22 };
    pool.each(function (e) {
      if (e.dying || e.squash > 0 || e.stun > 0 && false) return;
      if (!aabb(box, e)) return;
      if (h.star || h.invincible) { kill(e); if (g.onStar) g.onStar(e); return; }
      // 由上往下、且腳落在敵人上緣 8 px 內 ⇒ 踩
      var falling = (h.vy === undefined) ? true : (h.vy > 0);
      var footIn = (box.y + box.h) - e.y <= 10;
      if (falling && footIn && e.stompable) {
        stomp(e);
        if (g.onStomp) g.onStomp(e);
      } else if (!(h.inv > 0) && !(h.star > 0)) {
        if (g.onHurt) g.onHurt(e);
        if (e.fragile) e.alive = false;
      }
    });
  }

  ST.Enemies = Enemies;
})();
