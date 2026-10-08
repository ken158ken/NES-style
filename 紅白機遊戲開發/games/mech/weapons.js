/*
 * games/mech/weapons.js — 《星塵機甲》武器系統：彈池 / 能量 / 傷害表 / 武器選單資料
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 依賴：engine/shmup.js（NES.SH.Pool / aabb）、games/mech/hero.js
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約 / 武器」
 *
 * 設計依據 `docs/research/03_經典遊戲深度解析/03_洛克人2.md` ⑩「可借鑑清單」：
 *   ② **武器剋制環**：N 個頭目、N 把武器，弱點武器 2~3 發秒殺、基礎武器要 28 發
 *   ③ **頭目 HP 統一 28**，平衡只維護一張 N×N 傷害表（本檔的 `MG.DMG`）
 *   ⑩ 避免「唯一解 + 不可逆資源」：弱點武器能量 28 格、每發耗 1~2 格，
 *      **而且基礎砲永遠打得死**（28 發），所以不會出現 Boobeam Trap 式的死局
 *
 * 武器表（本輪 R1：基礎砲 + 2 支頭目武器）
 * | key    | 畫面名      | 能量 | 每發 | 同屏上限 | 傷害（雜魚 / 非弱點頭目 / 弱點頭目） | 蓄力 |
 * |--------|-------------|------|------|----------|--------------------------------------|------|
 * | buster | MECH BUSTER | ∞    | 0    | 3        | 1 / 1 / 1（中段 2、全蓄力 3）        | 有   |
 * | frost  | FROST SHOT  | 28   | 1    | 3        | 2 / 1 / **10**（BLAZE 三發倒）       | 無   |
 * | blaze  | BLAZE BOMB  | 28   | 2    | 2        | 3 / 1 / **10**（FROST 三發倒）       | 無   |
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var MG = window.MG = window.MG || {};
  var SH = NES.SH;
  if (!SH || !SH.Pool) throw new Error('games/mech/weapons.js 需要 engine/shmup.js（NES.SH）');

  var ENERGY_MAX = 28;

  var DEFS = {
    buster: {
      key: 'buster', name: 'MECH BUSTER', hud: 'B', tile: 'M_SHOT', pal: 1,
      infinite: true, cost: 0, max: 3, speed: 5, dmg: 1, charge: true, arc: 0, w: 6, h: 6
    },
    frost: {
      key: 'frost', name: 'FROST SHOT', hud: 'F', tile: 'M_FROST', pal: 3,
      infinite: false, cost: 1, max: 3, speed: 4, dmg: 2, charge: false, arc: 0, w: 8, h: 8
    },
    blaze: {
      key: 'blaze', name: 'BLAZE BOMB', hud: 'Z', tile: 'M_BLAZE', pal: 1,
      infinite: false, cost: 2, max: 2, speed: 3, dmg: 3, charge: false, arc: 1, w: 8, h: 8
    }
  };
  var ORDER = ['buster', 'frost', 'blaze'];

  /* 傷害表（研究 ⑤ 的 N×N 表；頭目 HP 一律 28） */
  var DMG = {
    frost: { buster: 1, buster1: 2, buster2: 3, frost: 0, blaze: 10 },
    blaze: { buster: 1, buster1: 2, buster2: 3, frost: 10, blaze: 0 }
  };

  function mkShot() {
    return { x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, kind: 'buster', dmg: 1, lvl: 0, arc: 0, life: 0, tile: 'M_SHOT', pal: 1 };
  }
  function mkEShot() {
    return { x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, dmg: 2, life: 0, tile: 'M_EBULLET', pal: 2, arc: 0 };
  }

  var W = {
    ENERGY_MAX: ENERGY_MAX,
    DEFS: DEFS,
    ORDER: ORDER,
    DMG: DMG,
    shots: null,
    eshots: null,
    energy: null,
    unlocked: null,
    cur: 'buster',

    init: function () {
      W.shots = SH.Pool(8, mkShot);
      W.eshots = SH.Pool(16, mkEShot);
      W.energy = { buster: ENERGY_MAX, frost: ENERGY_MAX, blaze: ENERGY_MAX };
      W.unlocked = { buster: true, frost: false, blaze: false };
      W.cur = 'buster';
      return W;
    },
    resetShots: function () {
      if (W.shots) W.shots.freeAll();
      if (W.eshots) W.eshots.freeAll();
    },
    // 新的一命 / 續關：武器能量補滿（研究 ⑥「密碼不記錄武器能量 ⇒ 每次續關都是滿武器」）
    refill: function () {
      var k;
      for (k in W.energy) if (Object.prototype.hasOwnProperty.call(W.energy, k)) W.energy[k] = ENERGY_MAX;
      return W;
    },
    unlock: function (key) {
      if (!DEFS[key]) return false;
      W.unlocked[key] = true;
      W.energy[key] = ENERGY_MAX;
      return true;
    },
    list: function () {
      var out = [], i, k;
      for (i = 0; i < ORDER.length; i++) {
        k = ORDER[i];
        out.push({ key: k, name: DEFS[k].name, energy: DEFS[k].infinite ? ENERGY_MAX : W.energy[k],
                   infinite: !!DEFS[k].infinite, unlocked: !!W.unlocked[k], cur: W.cur === k });
      }
      return out;
    },
    unlockedList: function () {
      var out = [], i;
      for (i = 0; i < ORDER.length; i++) if (W.unlocked[ORDER[i]]) out.push(ORDER[i]);
      return out;
    },
    select: function (key) {
      if (!DEFS[key] || !W.unlocked[key]) return false;
      W.cur = key;
      return true;
    },
    // 暫停選單的上 / 下移動（只在已解鎖的武器之間循環）
    cycle: function (d) {
      var l = W.unlockedList(), i = l.indexOf(W.cur);
      if (l.length === 0) return W.cur;
      i = ((i < 0 ? 0 : i) + (d > 0 ? 1 : -1) + l.length) % l.length;
      W.cur = l[i];
      return W.cur;
    },
    def: function (key) { return DEFS[key || W.cur]; },
    countOf: function (key) {
      var n = 0;
      W.shots.each(function (s) { if (s.kind === key) n++; });
      return n;
    },
    canCharge: function () { return !!DEFS[W.cur].charge; },
    canFire: function () {
      var d = DEFS[W.cur];
      if (W.countOf(W.cur) >= d.max) return false;
      if (!d.infinite && W.energy[W.cur] < d.cost) return false;
      return true;
    },

    /* 發射：lvl 0 普通 / 1 中段蓄力 / 2 全蓄力（只有 buster 有蓄力） */
    fire: function (h, lvl, g) {
      var d = DEFS[W.cur];
      if (!W.canFire()) return false;
      var s = W.shots.alloc();
      if (!s) return false;
      lvl = d.charge ? (lvl | 0) : 0;
      s.kind = W.cur;
      s.lvl = lvl;
      s.dmg = d.dmg + (lvl > 0 ? lvl + (d.key === 'buster' ? 0 : 0) : 0);
      if (d.key === 'buster') s.dmg = lvl === 2 ? 3 : (lvl === 1 ? 2 : 1);
      s.tile = (d.key === 'buster' && lvl > 0) ? 'M_SHOT2' : d.tile;
      s.pal = d.pal;
      s.w = lvl > 0 ? 8 : d.w;
      s.h = lvl > 0 ? 8 : d.h;
      s.arc = d.arc;
      s.vx = h.facing * d.speed;
      s.vy = d.arc ? -3 : 0;
      s.x = h.facing > 0 ? (h.x + h.w) : (h.x - s.w);
      s.y = h.y + (h.state === 'slide' ? 4 : 10);
      s.life = 160;
      if (!d.infinite) {
        W.energy[W.cur] -= d.cost;
        if (W.energy[W.cur] < 0) W.energy[W.cur] = 0;
      }
      if (g && g.sfx) g.sfx(lvl === 2 ? 'charge' : (d.key === 'buster' ? 'shot' : 'wshot'));
      return true;
    },

    /* 敵 / 頭目共用的敵彈發射（整數 px/幀；arc = 每幀加 1 的重力） */
    efire: function (x, y, vx, vy, dmg, tile, pal, arc) {
      var s = W.eshots.alloc();
      if (!s) return null;
      s.x = x | 0; s.y = y | 0;
      s.vx = vx | 0; s.vy = vy | 0;
      s.w = 6; s.h = 6;
      s.dmg = dmg === undefined ? 2 : dmg;
      s.tile = tile || 'M_EBULLET';
      s.pal = pal === undefined ? 2 : pal;
      s.arc = arc ? 1 : 0;
      s.life = 240;
      return s;
    },

    /* 每幀：自機彈與敵彈的移動 + 撞地形消失（`solid(col,row)` 由 main 提供） */
    update: function (g) {
      var solid = g.solidAt;
      W.shots.each(function (s) {
        s.x += s.vx;
        if (s.arc) { s.vy += 1; if (s.vy > 6) s.vy = 6; s.y += s.vy; }
        if (--s.life <= 0) { s.alive = false; return; }
        if (s.x < -8 || s.x > 256 || s.y < -8 || s.y > 240) { s.alive = false; return; }
        if (solid && solid((s.x + (s.w >> 1)) >> 3, (s.y + (s.h >> 1)) >> 3)) {
          if (g.onShotHitWall) g.onShotHitWall(s);
          s.alive = false;
        }
      });
      W.eshots.each(function (s) {
        s.x += s.vx;
        if (s.arc) { s.vy += 1; if (s.vy > 6) s.vy = 6; }
        s.y += s.vy;
        if (--s.life <= 0) { s.alive = false; return; }
        if (s.x < -8 || s.x > 256 || s.y < -8 || s.y > 248) { s.alive = false; return; }
      });
    },

    draw: function (oam, tiles) {
      var n = 0;
      W.shots.each(function (s) {
        var t = tiles[s.tile];
        if (t === undefined) return;
        oam.add({ x: s.x, y: s.y, tile: t, pal: s.pal, prio: 1 });
        n++;
      });
      W.eshots.each(function (s) {
        var t = tiles[s.tile];
        if (t === undefined) return;
        oam.add({ x: s.x, y: s.y, tile: t, pal: s.pal, prio: 2 });
        n++;
      });
      return n;
    },

    // 對某個頭目 key 的實際傷害（研究 ⑤ 的 N×N 表；buster 依蓄力分 3 階）
    damageTo: function (bossKey, shot) {
      var row = DMG[bossKey];
      if (!row) return shot.dmg;
      var k = shot.kind;
      if (k === 'buster' && shot.lvl > 0) k = 'buster' + shot.lvl;
      var v = row[k];
      return (v === undefined) ? shot.dmg : v;
    },
    state: function () {
      return {
        cur: W.cur, energy: JSON.parse(JSON.stringify(W.energy)),
        unlocked: JSON.parse(JSON.stringify(W.unlocked)),
        shots: W.shots ? W.shots.count : 0, eshots: W.eshots ? W.eshots.count : 0
      };
    }
  };

  MG.Weapons = W;
})();
