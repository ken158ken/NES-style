/*
 * games/star/boss_w3.js — 《星塵勇者》世界 3 魔王「樹心魔」（3-4 樹心空洞盡頭）
 * ---------------------------------------------------------------------------
 * 擁有者：star-w3 agent（R4 F4-1）｜依賴：engine/fixed.js、chr_w3.js、levels_w1.js
 * 契約：docs/R4_BRIEF.md F4-1 ＋ 研究 04 §3（模式循環 / 預警幀 / 弱點窗口 / 階段升級）
 *
 * 32×32、五格血、**三階段**，招式循環：
 *   walk（緩慢靠近）→ slam（地面長出兩叢根刺，**預警 24 幀**）
 *   → [階段 2 起] spit（吐毒果，拋物線）→ open（樹心張開 = 弱點窗口）→ walk
 *
 * ── 兩條打法（任務書要求）────────────────────────────────────────────────
 *   ① 踩樹心：只有 `open`（樹心張開）時踩頭才算傷害（1 格），其餘時間樹皮是護甲
 *      ——踩上去只會被彈開（不受傷、也不扣血）⇒ 5 次。
 *   ② 藤蔓衝撞：抓魔王房的藤蔓鞦韆、按 A 放手（`hero.vineStrike > 0`，objects_w3.js 給的 20 幀窗口）
 *      撞上去 **一次扣 2 格**，而且**不必等 open** ⇒ 3 次（2+2+1）。
 *   （第三條友善路線沿用 W1 / W2 的慣例：魔王房盡頭有旗桿，繞過去碰到旗桿也算過關。）
 *
 * main.js 的用法與 ST.Boss / ST.BossW2 完全同介面：
 *   ST.BossW3.init(level); ST.BossW3.update(g); ST.BossW3.draw(oam); ST.BossW3.dead
 *   （main.js 只插入一行「bossKind === 'treelord' ⇒ g.bossMod = ST.BossW3」）
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};
  var NES = window.NES = window.NES || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/boss_w3.js 需要 engine/fixed.js');
  var SMB = FX.SMB;

  var W = 28, H = 30;
  var MAX_HP = 5;
  var INV_FRAMES = 50;
  var KNOCKBACK = 12;
  var GRAV = SMB.jump[0].gFall;
  var MAXFALL = FX.v88(4, 0);
  var WORLD_BOTTOM = 30 * 8 + 64;
  var ACTIVATE_AHEAD = 48;
  var VINE_DAMAGE = 2;                      // 藤蔓衝撞一次 2 格血（第二條打法）

  // 階段參數（研究 04 §3.2：同一套招、節奏加碼）
  var PHASE = [
    null,
    { walk: SMB.enemySlow, walkFrames: 90, open: 72, slamWarn: 24, slamHold: 48, roots: 2, spit: 0 },
    { walk: SMB.enemyFast, walkFrames: 74, open: 54, slamWarn: 22, slamHold: 44, roots: 2, spit: 2 },
    { walk: FX.v88(1, 0), walkFrames: 58, open: 40, slamWarn: 18, slamHold: 40, roots: 3, spit: 3 }
  ];
  // fix-r4（qa-r4 P3-2）：魔王本體 32 px 寬 = 每線 4 顆精靈，加上主角 2 顆只剩 2 顆額度，
  // 原本一次 4 叢根刺（全部同一個 y）就把那條線撐到 10。改成「少一叢、間距拉開」：
  // 覆蓋寬度（3 × 34 = 102 px）跟原本（4 × 28 = 112 px）差不多，閃避難度幾乎不變。
  var ROOT_GAP = 34;                        // 根刺之間的間距（px）
  var ROOT_LIFE = 48;                       // 伸出後存活 48 幀
  var SPIT_GAP = 22;
  var SHOT_N = 10;
  var NUT_VY = -FX.v88(3, 0);
  var NUT_VX = FX.v88(1, 64);
  var NUT_G = SMB.jump[0].gHold;            // acc 單位（0.125 px/幀²）

  function newShot() {
    var s = {
      alive: false, kind: 'nut', stompable: false, root: false, warn: 0,
      x: 0, y: 0, w: 8, h: 10,
      px: FX.Vec(0), py: FX.Vec(0), vx: FX.Acc(0), vy: FX.Acc(0), t: 0
    };
    s.hit = function () { s.alive = false; return true; };
    return s;
  }
  function makePool(n, f) {
    if (NES.SH && NES.SH.Pool) return NES.SH.Pool(n, f);
    var items = [], i;
    for (i = 0; i < n; i++) { items.push(f(i)); items[i].alive = false; }
    return {
      items: items, size: n, count: 0,
      alloc: function () { for (var j = 0; j < n; j++) if (!items[j].alive) { items[j].alive = true; this.count++; return items[j]; } return null; },
      free: function (o) { if (o && o.alive) { o.alive = false; this.count--; return true; } return false; },
      each: function (fn) { for (var j = 0; j < n; j++) if (items[j].alive) { fn(items[j], j); if (!items[j].alive) this.count--; } },
      freeAll: function () { for (var j = 0; j < n; j++) items[j].alive = false; this.count = 0; }
    };
  }

  var shots = makePool(SHOT_N, newShot);
  var level = null, tiles = null, tilesBank = null, camXCache = 0;
  var px = FX.Vec(0), py = FX.Vec(0), vx = FX.Acc(0), vy = FX.Acc(0);

  function ensureTiles() {
    var Wd = ST.W3;                                 // st_spr_w3 分頁（chr_w3.js）
    if (!Wd || !Wd.oam16) return null;
    var bank = Wd.bank ? Wd.bank() : null;
    if (tiles && tilesBank === bank) return tiles;
    if (!bank) return null;
    function half(p) {
      return [
        [Wd.oam16(p + '_C0T'), Wd.oam16(p + '_C1T')],
        [Wd.oam16(p + '_C0B'), Wd.oam16(p + '_C1B')]
      ];
    }
    tiles = {
      bark: half('W3_TRE_ST'), open: half('W3_TRE_OP'),
      nut: [Wd.oam16('W3_NUT0'), Wd.oam16('W3_NUT1')],
      root: Wd.oam16('W3_ROOT')
    };
    tilesBank = bank;
    return tiles;
  }

  function kindAt(x, y) { return level ? level.kindAt(x, y) : 'none'; }
  function solid(x, y) { return kindAt(x, y) === 'solid'; }
  function aabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function phaseOf() {
    if (Boss.hp <= 1) return 3;
    if (Boss.hp <= 3) return 2;
    return 1;
  }
  // 地面列（根刺從主角腳下的地面長出來）
  function groundYAt(x) {
    var c = x >> 3, r;
    for (r = 14; r < 30; r++) {
      if (kindAt(c * 8 + 4, r * 8 + 1) === 'solid') return r * 8;
    }
    return 24 * 8;
  }

  var Boss = {
    active: false, dead: false, alive: false, stompable: true, kind: 'boss',
    hp: MAX_HP, x: 0, y: 0, w: W, h: H,
    phase: 'idle', stage: 1,
    facing: -1, inv: 0, t: 0, shots: 0, frame: 0,
    opened: false, bounces: 0, vineHits: 0, stomps: 0,
    hammers: shots,                         // 名字沿用 ST.Boss 的契約（投射物列舉）
    MAX_HP: MAX_HP, spawnX: -1, spawnY: 0,

    init: function (lv) {
      level = lv || null;
      Boss.reset();
      if (!level || !level.boss) { Boss.spawnX = -1; return Boss; }
      Boss.spawnX = level.boss.x;
      Boss.spawnY = level.boss.y;
      return Boss;
    },

    reset: function () {
      shots.freeAll();
      Boss.active = false; Boss.dead = false; Boss.alive = false;
      Boss.hp = MAX_HP; Boss.phase = 'idle'; Boss.stage = 1; Boss.facing = -1;
      Boss.inv = 0; Boss.t = 0; Boss.shots = 0; Boss.frame = 0;
      Boss.opened = false; Boss.bounces = 0; Boss.vineHits = 0; Boss.stomps = 0;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    box: function () { return Boss.active && Boss.alive ? { x: Boss.x, y: Boss.y, w: W, h: H } : null; },
    hit: function () { return Boss.damage(1); },

    spawn: function (x, y) {
      FX.vsetPx(px, x); FX.vsetPx(py, y);
      Boss.x = x | 0; Boss.y = y | 0;
      Boss.active = true; Boss.alive = true; Boss.dead = false;
      Boss.hp = MAX_HP; Boss.phase = 'walk'; Boss.stage = 1;
      Boss.t = 0; Boss.shots = 0; Boss.inv = 0; Boss.opened = false;
      FX.aset(vx, 0); FX.aset(vy, 0);
      return Boss;
    },

    // 扣血（n = 1 踩樹心 / 2 藤蔓衝撞）
    damage: function (n) {
      if (!Boss.active || Boss.dead || Boss.inv > 0 || Boss.phase === 'falling') return false;
      Boss.hp -= (n | 0) || 1;
      Boss.inv = INV_FRAMES;
      FX.vsetPx(px, Boss.x + Boss.facing * -KNOCKBACK);
      Boss.x = FX.vpx(px);
      if (Boss.hp <= 0) { Boss.hp = 0; Boss.die(); return true; }
      Boss.stage = phaseOf();
      Boss.phase = 'open'; Boss.t = 0; Boss.opened = true;
      shots.freeAll();                      // 被打 ⇒ 場面清乾淨（弱點窗口要看得清楚）
      return true;
    },
    stomp: function () { return Boss.damage(1); },

    die: function () {
      if (Boss.dead || Boss.phase === 'falling') return false;
      Boss.hp = 0;
      Boss.phase = 'falling';
      Boss.t = 0;
      Boss.inv = 0;
      shots.freeAll();
      FX.aset(vy, -FX.v88(2, 0));
      FX.aset(vx, 0);
      Boss.alive = false;
      return true;
    },

    // 根刺：從主角腳下的地面長出 n 叢（先 warn 幀，再變成危險）
    slamRoots: function (targetX) {
      var P = PHASE[Boss.stage], i, s, bx = (targetX === undefined ? Boss.x : targetX);
      for (i = 0; i < P.roots; i++) {
        s = shots.alloc();
        if (!s) continue;
        var sx = bx + (i - ((P.roots - 1) / 2)) * ROOT_GAP;
        if (sx < 8) sx = 8;
        var sy = groundYAt(sx + 4) - 16;
        FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
        s.x = sx | 0; s.y = sy | 0; s.t = 0;
        s.root = true; s.kind = 'root'; s.w = 8; s.h = 16;
        s.warn = P.slamWarn;
        FX.aset(s.vx, 0); FX.aset(s.vy, 0);
      }
      return true;
    },

    shoot: function (targetX) {
      var s = shots.alloc();
      if (!s) return null;
      var sx = Boss.x + (Boss.facing < 0 ? -4 : Boss.w - 4), sy = Boss.y + 4;
      FX.vsetPx(s.px, sx); FX.vsetPx(s.py, sy);
      s.x = sx; s.y = sy; s.t = 0;
      s.root = false; s.kind = 'nut'; s.w = 8; s.h = 8; s.warn = 0;
      var dir = (targetX === undefined) ? Boss.facing : (targetX < Boss.x ? -1 : 1);
      FX.aset(s.vx, dir * NUT_VX);
      FX.aset(s.vy, NUT_VY);
      return s;
    },

    update: function (g) {
      g = g || {};
      Boss.frame++;
      var camX = (g.camX === undefined) ? camXCache : g.camX;
      camXCache = camX;
      if (g.level && g.level !== level) level = g.level;
      var hero = g.hero || null;

      if (!Boss.active && !Boss.dead && Boss.phase === 'idle' && Boss.spawnX >= 0
          && camX + 256 + ACTIVATE_AHEAD >= Boss.spawnX) {
        Boss.spawn(Boss.spawnX, Boss.spawnY);
      }
      if (!Boss.active) return Boss.phase;

      if (Boss.inv > 0) Boss.inv--;
      Boss.t++;
      var P = PHASE[Boss.stage] || PHASE[1];

      if (Boss.phase === 'falling') {
        FX.aadd(vy, GRAV);
        FX.vadd(py, vy.v);
        Boss.y = FX.vpx(py);
        if (Boss.y > WORLD_BOTTOM) {
          Boss.active = false; Boss.alive = false; Boss.dead = true; Boss.phase = 'dead';
          if (g.onDie) g.onDie('fall');
        }
        stepShots(g);
        return Boss.phase;
      }

      if (hero) Boss.facing = (hero.x < Boss.x) ? -1 : 1;
      Boss.opened = (Boss.phase === 'open');

      switch (Boss.phase) {
        case 'walk':
          FX.aset(vx, Boss.facing * P.walk);
          FX.vadd(px, vx.v);
          Boss.x = FX.vpx(px);
          if (solid(Boss.facing < 0 ? Boss.x - 1 : Boss.x + Boss.w, Boss.y + 8)) {
            FX.vsetPx(px, Boss.x - Boss.facing);
            Boss.x = FX.vpx(px);
          }
          landed();
          if (Boss.t >= P.walkFrames) {
            Boss.phase = 'slam'; Boss.t = 0;
            Boss.slamRoots(hero ? hero.x : Boss.x);
            if (g.onSlam) g.onSlam();
            if (g.sfx) g.sfx('bump');
          }
          break;
        case 'slam':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= P.slamHold) {
            if (P.spit > 0) { Boss.phase = 'spit'; Boss.t = 0; Boss.shots = 0; }
            else { Boss.phase = 'open'; Boss.t = 0; }
          }
          break;
        case 'spit':
          FX.aset(vx, 0);
          landed();
          if (Boss.shots < P.spit && (Boss.t - 1) % SPIT_GAP === 0) {
            Boss.shoot(hero ? hero.x : undefined);
            Boss.shots++;
          }
          if (Boss.shots >= P.spit && Boss.t >= P.spit * SPIT_GAP) { Boss.phase = 'open'; Boss.t = 0; }
          break;
        case 'open':
          FX.aset(vx, 0);
          landed();
          if (Boss.t >= P.open) { Boss.phase = 'walk'; Boss.t = 0; Boss.opened = false; }
          break;
        default:
          break;
      }

      stepShots(g);

      if (hero && (g.onStomp || g.onHurt)) {
        var hb = { x: hero.x, y: hero.y, w: hero.w || 12, h: hero.h || 22 };
        if (aabb(hb, Boss)) {
          var falling = (hero.vy === undefined) ? true : (hero.vy > 0);
          var footIn = (hb.y + hb.h) - Boss.y <= 12;
          if (hero.vineStrike > 0 && Boss.inv <= 0) {
            // 打法② 藤蔓衝撞：不必等 open，一次 2 格
            Boss.vineHits++;
            hero.vineStrike = 0;
            Boss.damage(VINE_DAMAGE);
            if (g.onStomp) g.onStomp(Boss);
          } else if (falling && footIn) {
            if (Boss.phase === 'open' && Boss.inv <= 0) {
              // 打法① 踩樹心
              Boss.stomps++;
              Boss.damage(1);
              if (g.onStomp) g.onStomp(Boss);
            } else {
              // 樹皮護甲：只彈開，不扣血、也不受傷（研究 04 §2「可讀的無效打擊」）
              Boss.bounces++;
              if (ST.Hero && ST.Hero.stomp) ST.Hero.stomp(hero);
              if (g.sfx) g.sfx('bump');
            }
          } else if (!(hero.inv > 0)) {
            if (hero.star) { /* 無敵星：撞不死魔王，只是不受傷 */ }
            else if (g.onHurt) g.onHurt(Boss);
          }
        }
        shots.each(function (s) {
          if (s.warn > 0) return;                 // 預警中不傷人
          if (!aabb(hb, s)) return;
          if (hero.star) { if (!s.root) s.alive = false; return; }
          if (!s.root) s.alive = false;
          if (!(hero.inv > 0) && g.onHurt) g.onHurt(s);
        });
      }
      return Boss.phase;
    },

    draw: function (oam) {
      if (!oam || !oam.add) return 0;
      var T = ensureTiles();
      if (!T) return 0;
      var n = 0, cam = camXCache, i;
      if (Boss.active) {
        if (!(Boss.inv > 0 && (Boss.frame & 4))) {
          var art = (Boss.phase === 'open') ? T.open : T.bark;
          var bx = Boss.x - 2 - cam, by = Boss.y - 2;
          // 32×32 = 左半身 2 欄 + 鏡像 2 欄（精靈只存左半身 ⇒ 省 8 磚）
          for (i = 0; i < 4; i++) {
            var col = (i < 2) ? i : (3 - i);
            var fl = i >= 2;
            oam.add({ x: bx + i * 8, y: by, tile: art[0][col], pal: 1, prio: 3, flipH: fl });
            oam.add({ x: bx + i * 8, y: by + 16, tile: art[1][col], pal: 1, prio: 3, flipH: fl });
            n += 2;
          }
        }
      }
      shots.each(function (s) {
        if (s.root) {
          if (s.warn > 0 && (s.t & 2)) return;        // 預警：閃爍
          oam.add({ x: s.x - cam, y: s.y, tile: T.root, pal: 1, prio: 2 });
        } else {
          oam.add({ x: s.x - cam, y: s.y, tile: T.nut[(s.t >> 2) & 1], pal: 2, prio: 2 });
        }
        n++;
      });
      return n;
    },

    state: function () {
      var list = [];
      shots.each(function (s) { list.push({ x: s.x, y: s.y, root: !!s.root, warn: s.warn, vx: s.vx.v, vy: s.vy.v }); });
      return {
        active: Boss.active, dead: Boss.dead, hp: Boss.hp, phase: Boss.phase, stage: Boss.stage,
        x: Boss.x, y: Boss.y, inv: Boss.inv, t: Boss.t, facing: Boss.facing,
        opened: Boss.phase === 'open', bounces: Boss.bounces, vineHits: Boss.vineHits,
        stomps: Boss.stomps, shots: list
      };
    },

    CONST: {
      W: W, H: H, MAX_HP: MAX_HP, INV_FRAMES: INV_FRAMES, KNOCKBACK: KNOCKBACK,
      PHASE: PHASE, ROOT_GAP: ROOT_GAP, ROOT_LIFE: ROOT_LIFE, SPIT_GAP: SPIT_GAP,
      SHOT_N: SHOT_N, VINE_DAMAGE: VINE_DAMAGE, NUT_VY: NUT_VY, NUT_VX: NUT_VX
    }
  };

  function landed() {
    FX.aadd(vy, GRAV);
    if (vy.v > MAXFALL) FX.aset(vy, MAXFALL);
    var prevBottom = Boss.y + Boss.h;
    FX.vadd(py, vy.v);
    var ny = FX.vpx(py), foot = ny + Boss.h, on = false;
    if (vy.v >= 0) {
      var k1 = kindAt(Boss.x + 4, foot), k2 = kindAt(Boss.x + Boss.w - 4, foot);
      var hit1 = k1 === 'solid' || (k1 === 'oneway' && prevBottom <= ((foot >> 3) << 3));
      var hit2 = k2 === 'solid' || (k2 === 'oneway' && prevBottom <= ((foot >> 3) << 3));
      if (hit1 || hit2) {
        ny = ((foot >> 3) << 3) - Boss.h;
        FX.vsetPx(py, ny); FX.aset(vy, 0); on = true;
      }
    }
    Boss.y = ny;
    if (!on && Boss.y > 30 * 8 - Boss.h - 8 && Boss.phase !== 'falling') Boss.die();
    return on;
  }

  function stepShots(g) {
    shots.each(function (s) {
      s.t++;
      if (s.root) {
        if (s.warn > 0) { s.warn--; return; }
        if (s.t > s.h + ROOT_LIFE) s.alive = false;
        return;
      }
      FX.aadd(s.vy, NUT_G);
      FX.vadd(s.px, s.vx.v);
      FX.vadd(s.py, s.vy.v);
      s.x = FX.vpx(s.px); s.y = FX.vpx(s.py);
      if (solid(s.x + 4, s.y + s.h)) s.alive = false;
      if (s.y > WORLD_BOTTOM || s.x < camXCache - 40 || s.x > camXCache + 296) s.alive = false;
    });
  }

  ST.BossW3 = Boss;
})();
