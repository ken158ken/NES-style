/*
 * games/star/subweapon.js — 《星塵勇者》副武器（火球 / 飛鏢）（R4 star-meta）
 * ---------------------------------------------------------------------------
 * 擁有者：star-meta agent
 * 依賴：engine/fixed.js（NES.FX）、games/star/enemies.js（ST.Enemies.each / starKill / EXT）
 *       games/star/hero.js（只讀 h 的欄位；hero.js 那邊只插一行 hook）
 * 契約：docs/TASKS.md「R4 star-meta」；研究 04 §2「必須用別的手段處理的敵人」＝
 *       **護甲礦兵的第二解法**（R3 的「留給後續」第 4 條）。
 *
 *   操作（研究 03/02 SMB3：火花衣的 B 鍵就是「跑 + 丟」共用，按下的瞬間才發射）
 *     B（按下瞬間）        發射目前選中的副武器（彈藥 −1；按住 B 仍然是跑步，手感不變）
 *     ↓ + B / SELECT       切換副武器（只在「已取得」的之間輪替）
 *   取得
 *     ① 關卡隱藏道具：每關有一個「指定的 ? 磚」（關卡裡第 ⌊n/2⌋ 個 ? 磚，純函式 ⇒ 可測）
 *        頂出來就是副武器，不是金幣（金幣照給）
 *     ② 世界地圖的道具屋節點（games/star/worldmap.js 的 shop）用金幣買
 *   彈藥
 *     預設有限（每次取得 +15），地圖道具屋可以買「無限」（`infinite`）⇒ 任務書的「彈藥 / 無限自選」
 *   傷害
 *     火球 / 飛鏢都是 1 發打倒一般敵人；**護甲礦兵 armor 要 2 發**（甲要先被打裂，
 *     `enemies_w2.js` 的 setup 裡插了 `e.subHp = 2`）。魔王與鐵鎚免疫（踩頭仍是魔王的解法）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var ST = window.ST = window.ST || {};
  var FX = NES.FX;
  if (!FX) throw new Error('games/star/subweapon.js 需要 engine/fixed.js（NES.FX）');

  var MAX_SHOTS = 3;                     // 同時最多 3 發（真機 OAM / 邏輯預算的自我約束）
  var COOL = 16;                         // 連發間隔 16 幀
  var LIFE = 140;                        // 最長存活幀數
  var AMMO_PICK = 15;                    // 取得 / 補彈一次 +15
  var AMMO_MAX = 99;
  var KIND = { NONE: 0, FIRE: 1, DART: 2 };
  var NAMES = ['', 'FIRE', 'DART'];
  var MSG_FRAMES = 90;                   // 切換 / 取得的提示字顯示 1.5 秒

  // 火球：平拋（起飛 −0.5 px/幀、重力 0.0625 px/幀² ⇒ 升 8 幀 / 高 2 px，約 33 幀後落地 ⇒ 射程約 80 px）
  //        刻意壓得很平：拋太高會從敵人頭上飛過去（R4 第一版踩過）
  // 飛鏢：直線、快（4 px/幀）、不受重力 ⇒ 打遠處的飛行敵人
  // 重力單位是 **acc**（1/16 vel/幀，見 engine/fixed.js 的 aadd）；寫成 v88 會差 16 倍（R3 踩過這個坑）
  var GRAV_FIRE = (FX.pxToAcc ? FX.pxToAcc(0.0625) : 256);
  var SPEC = {
    1: { vx: FX.v88(2, 128), vy: -FX.v88(0, 128), g: GRAV_FIRE, w: 8, h: 8, pal: 1 },
    2: { vx: FX.v88(4, 0), vy: 0, g: 0, w: 8, h: 8, pal: 0 }
  };
  // 調色盤刻意**避開敵人的 pal 2**：岩漿噴吐者的火球用的就是同一組磚 + pal 2，
  // 主角的火球改用 pal 1（金 / 橘）、飛鏢用 pal 0（主角的藍）⇒ 一眼分得出誰的彈
  var IMMUNE = { boss: 1, hammer: 1, axe: 1 };     // 魔王 / 鐵鎚：副武器無效（踩頭才算）

  var pool = [];
  (function () {
    var i;
    for (i = 0; i < MAX_SHOTS; i++) {
      pool.push({ alive: false, kind: 0, x: 0, y: 0, dir: 1, t: 0, px: FX.Vec(0), py: FX.Vec(0), vx: FX.Acc(0), vy: FX.Acc(0) });
    }
  })();

  var SW = {
    KIND: KIND, NAMES: NAMES, MAX_SHOTS: MAX_SHOTS, COOL: COOL, LIFE: LIFE,
    AMMO_PICK: AMMO_PICK, AMMO_MAX: AMMO_MAX, SPEC: SPEC, MSG_FRAMES: MSG_FRAMES,
    infinite: false,
    shots: 0, kills: 0, switches: 0, picks: 0,
    hidden: null,                         // 本關的「指定 ? 磚」{col,row,used}
    msg: '', msgT: 0,
    pool: pool
  };

  /* ------------------------------------------------------------ 小工具 */
  function blocked(g, x, y) {
    if (!g) return false;
    if (typeof g.solidAt === 'function') { try { return !!g.solidAt(x, y); } catch (e) { } }
    var lv = g.lv || g.level;
    if (lv && typeof lv.kindAt === 'function') { try { return lv.kindAt(x, y) === 'solid'; } catch (e2) { } }
    return false;
  }
  function owned(h, k) { return !!((h.subOwned | 0) & (1 << (k - 1))); }
  function ownedList(h) {
    var out = [], k;
    for (k = 1; k <= 2; k++) if (owned(h, k)) out.push(k);
    return out;
  }
  function tiles() {
    var b = ST.sprBank;
    if (!b || !ST.oam16) return null;
    function has(n) { return b.has ? b.has(n) : false; }
    if (has('W2_FIRE0') && has('W2_FIRE1')) return [ST.oam16(b, 'W2_FIRE0'), ST.oam16(b, 'W2_FIRE1')];
    if (has('H_COIN')) return [ST.oam16(b, 'H_COIN'), ST.oam16(b, 'H_COIN')];
    return null;
  }

  function note(g, text) {
    SW.msg = text;
    SW.msgT = MSG_FRAMES;
    if (g && typeof g.subNote === 'function') { try { g.subNote(text); } catch (e) { } }
  }

  /* ------------------------------------------------------------ 取得 / 切換 */
  /** 武器代號正規化：吃數字（1 / 2）也吃名字（'fire' / 'dart'，不分大小寫）。
   *  fix-r4（qa-r4 P2-4）：`GAME.dev.giveSub('fire')` 會被 `kind | 0` 轉成 0 然後**靜默失敗**，
   *  但這個 dev 介面叫 giveSub('fire') 本來就很自然 ⇒ 在源頭接受字串，回 0 代表不認得。 */
  function kindOf(kind) {
    var i;
    if (typeof kind === 'string') {
      for (i = 1; i < NAMES.length; i++) if (NAMES[i].toLowerCase() === kind.toLowerCase()) return i;
      return 0;
    }
    return kind | 0;
  }

  /** 給一把副武器（kind = 1 火球 / 2 飛鏢，或 'fire' / 'dart'）。已經有了就只補彈藥。 */
  function give(h, kind, ammo, g) {
    if (!h) return false;
    kind = kindOf(kind);
    if (kind !== KIND.FIRE && kind !== KIND.DART) return false;
    var had = owned(h, kind);
    h.subOwned = (h.subOwned | 0) | (1 << (kind - 1));
    h.subAmmo = Math.min(AMMO_MAX, (h.subAmmo | 0) + ((ammo === undefined) ? AMMO_PICK : (ammo | 0)));
    h.sub = kind;                                     // 剛拿到的自動選中（SMB 拿到火花衣就能丟）
    SW.picks++;
    note(g, NAMES[kind] + (had ? ' +' + AMMO_PICK : '!'));
    if (g && g.sfx) g.sfx('powerup');
    return true;
  }

  /** 無限彈藥開關（地圖道具屋「INFINITE」買下來就開）。 */
  function setInfinite(on, g) {
    SW.infinite = !!on;
    note(g, SW.infinite ? 'AMMO INFINITE' : 'AMMO LIMITED');
    return SW.infinite;
  }

  /** 在「已取得」的副武器之間輪替（↓ + B 或 SELECT）。 */
  function toggle(h, g) {
    if (!h) return 0;
    var list = ownedList(h);
    if (!list.length) { note(g, 'NO SUB WEAPON'); return 0; }
    var at = list.indexOf(h.sub | 0);
    h.sub = list[(at + 1) % list.length];
    SW.switches++;
    note(g, NAMES[h.sub] + ' ' + (SW.infinite ? 'INF' : 'x' + (h.subAmmo | 0)));
    if (g && g.sfx) g.sfx('coin');
    return h.sub;
  }

  /* ------------------------------------------------------------ 發射 */
  function freeSlot() {
    var i;
    for (i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
    return null;
  }

  function fire(h, g) {
    if (!h || !h.sub || !owned(h, h.sub)) return false;
    if (h.state === 'dead' || h.hurtTimer > 0) return false;
    if ((h.subCool | 0) > 0) return false;
    if (!SW.infinite && (h.subAmmo | 0) <= 0) { note(g, 'NO AMMO'); if (g && g.sfx) g.sfx('bump'); return false; }
    var p = freeSlot();
    if (!p) return false;
    var sp = SPEC[h.sub], dir = (h.facing < 0) ? -1 : 1;
    var x = (dir > 0) ? (h.x + (h.w | 0)) : (h.x - sp.w);
    var y = h.y + (h.crouch ? 6 : 4);
    p.alive = true; p.kind = h.sub | 0; p.dir = dir; p.t = 0;
    p.x = x | 0; p.y = y | 0;
    FX.vsetPx(p.px, p.x); FX.vsetPx(p.py, p.y);
    FX.aset(p.vx, dir * sp.vx);
    FX.aset(p.vy, sp.vy);
    h.subCool = COOL;
    if (!SW.infinite) h.subAmmo = (h.subAmmo | 0) - 1;
    h.subShots = (h.subShots | 0) + 1;
    SW.shots++;
    if (g && g.sfx) g.sfx('bump');
    return true;
  }

  /** hero.js 每幀插的 hook（io = { down, bPress, selectPress }）。 */
  function heroStep(h, g, io) {
    if (!h || !io) return 0;
    if ((h.subCool | 0) > 0) h.subCool--;
    if (SW.msgT > 0 && --SW.msgT === 0) SW.msg = '';
    if (io.selectPress || (io.down && io.bPress)) return toggle(h, g) ? 1 : 0;
    if (io.bPress) return fire(h, g) ? 2 : 0;
    return 0;
  }

  /* ------------------------------------------------------------ 命中判定 */
  function hittable(e) {
    if (!e || e.alive === false || e.dying) return false;
    if (typeof e.kind !== 'string' || !e.kind) return false;      // 魔王模組本體沒有 kind
    if (IMMUNE[e.kind]) return false;
    var def = ST.Enemies && ST.Enemies.EXT ? ST.Enemies.EXT[e.kind] : null;
    if (def && def.sub === false) return false;
    return true;
  }

  function damage(e, g) {
    if (e.fragile) { e.alive = false; return 'pop'; }              // 敵人的火球：對撞消掉
    if (e.subHp === undefined || e.subHp === null) {
      var def = ST.Enemies && ST.Enemies.EXT ? ST.Enemies.EXT[e.kind] : null;
      e.subHp = (def && def.subHits) ? (def.subHits | 0) : 1;
    }
    e.subHp = (e.subHp | 0) - 1;
    if (e.subHp > 0) {
      e.subFlash = 10;                                             // 打裂了（armor 第一發）
      if (g && g.sfx) g.sfx('bump');
      return 'crack';
    }
    if (ST.Enemies && typeof ST.Enemies.starKill === 'function') ST.Enemies.starKill(e);
    else e.alive = false;
    SW.kills++;
    if (g && g.hero) { g.hero.score += (e.score | 0) || 100; g.hudDirty = true; }
    if (g && g.sfx) g.sfx('stomp');
    return 'kill';
  }

  function sweep(g, p) {
    var hitKind = null;
    if (!ST.Enemies || typeof ST.Enemies.each !== 'function') return null;
    ST.Enemies.each(g, function (e) {
      if (hitKind || !hittable(e)) return;
      var ew = e.w | 0, eh = e.h | 0;
      if (p.x < e.x + ew && e.x < p.x + 8 && p.y < e.y + eh && e.y < p.y + 8) {
        hitKind = damage(e, g);
      }
    });
    return hitKind;
  }

  /* ------------------------------------------------------------ 每幀 */
  function update(g) {
    var i, p, sp, n = 0, cam = (g && g.camX) | 0;
    for (i = 0; i < pool.length; i++) {
      p = pool[i];
      if (!p.alive) continue;
      sp = SPEC[p.kind] || SPEC[1];
      p.t++;
      if (sp.g) FX.aadd(p.vy, sp.g);
      FX.vadd(p.px, p.vx.v);
      FX.vadd(p.py, p.vy.v);
      p.x = FX.vpx(p.px); p.y = FX.vpx(p.py);
      if (sweep(g, p)) { p.alive = false; continue; }
      if (blocked(g, p.x + 4, p.y + 7) || blocked(g, p.x + (p.dir > 0 ? 7 : 0), p.y + 4)) { p.alive = false; continue; }
      if (p.t >= LIFE || p.y > 248 || p.x + 8 < cam - 16 || p.x > cam + 272) { p.alive = false; continue; }
      n++;
    }
    return n;
  }

  function draw(oam, g) {
    var T = tiles();
    if (!T || !oam || !oam.add) return 0;
    var cam = (g && g.camX) | 0, i, p, n = 0, f;
    for (i = 0; i < pool.length; i++) {
      p = pool[i];
      if (!p.alive) continue;
      f = (p.t >> 2) & 1;
      // 飛鏢用「水平 / 垂直翻轉輪替」做旋轉感（不多花精靈磚，W2_FIRE 兩幀共用）
      oam.add({
        x: p.x - cam, y: p.y - 4, tile: T[f], pal: (SPEC[p.kind] || SPEC[1]).pal, prio: 1,
        flipH: (p.kind === KIND.DART) ? !!(p.t & 4) : (p.dir < 0),
        flipV: (p.kind === KIND.DART) ? !!(p.t & 8) : false
      });
      n++;
    }
    return n;
  }

  function clear() {
    var i;
    for (i = 0; i < pool.length; i++) pool[i].alive = false;
    SW.msg = ''; SW.msgT = 0;
    return true;
  }

  /* ------------------------------------------------------------ 關卡隱藏道具 */
  // 每關的「指定 ? 磚」= 關卡裡所有 ? 磚裡**最中間**那一個（純函式 ⇒ 測試與機器人都算得出來）。
  function findHidden(g) {
    var lv = g && (g.lv || g.level);
    if (!lv || typeof lv.tileAt !== 'function' || !ST.TILE) return null;
    var Q = ST.TILE.QBLOCK, cols = (lv.cols | 0) || (g.cols | 0), list = [], c, r, t;
    for (c = 0; c < cols; c++) {
      for (r = 4; r < 30; r++) {
        try { t = lv.tileAt(c, r); } catch (e) { t = 0; }
        if (t === Q) list.push({ col: c, row: r });
      }
    }
    if (!list.length) return null;
    var pick = list[(list.length / 2) | 0];
    return { col: pick.col, row: pick.row, used: false, total: list.length };
  }

  function initLevel(g) {
    clear();
    SW.hidden = findHidden(g);
    if (g && g.hero) g.hero.subCool = 0;
    return SW.hidden;
  }

  /** main.js 的 onBump 插的 hook：頂到指定 ? 磚 ⇒ 給副武器（回 true 表示有給）。 */
  function hiddenHit(g, col, row) {
    var hd = SW.hidden, h = g && g.hero;
    if (!hd || hd.used || !h) return false;
    if ((col | 0) !== hd.col || (row | 0) !== hd.row) return false;
    hd.used = true;
    var want = !owned(h, KIND.FIRE) ? KIND.FIRE : (!owned(h, KIND.DART) ? KIND.DART : (h.sub || KIND.FIRE));
    return give(h, want, AMMO_PICK, g);
  }

  function state() {
    var live = 0, i, list = [];
    for (i = 0; i < pool.length; i++) {
      if (!pool[i].alive) continue;
      live++;
      list.push({ kind: pool[i].kind, x: pool[i].x, y: pool[i].y, dir: pool[i].dir, t: pool[i].t });
    }
    return {
      live: live, list: list, shots: SW.shots, kills: SW.kills, switches: SW.switches,
      picks: SW.picks, infinite: SW.infinite, msg: SW.msg, msgT: SW.msgT,
      hidden: SW.hidden ? { col: SW.hidden.col, row: SW.hidden.row, used: SW.hidden.used, total: SW.hidden.total } : null
    };
  }

  ST.SubWeapon = {
    KIND: KIND, NAMES: NAMES, SPEC: SPEC, IMMUNE: IMMUNE,
    MAX_SHOTS: MAX_SHOTS, COOL: COOL, LIFE: LIFE, AMMO_PICK: AMMO_PICK, AMMO_MAX: AMMO_MAX,
    MSG_FRAMES: MSG_FRAMES,
    give: give, kindOf: kindOf, toggle: toggle, fire: fire, heroStep: heroStep,
    update: update, draw: draw, clear: clear, initLevel: initLevel,
    hidden: hiddenHit, findHidden: findHidden, owned: owned, ownedList: ownedList,
    setInfinite: setInfinite, state: state,
    get infinite() { return SW.infinite; },
    set infinite(v) { SW.infinite = !!v; },
    get msg() { return SW.msg; },
    get shots() { return SW.shots; },
    get kills() { return SW.kills; },
    get switches() { return SW.switches; },
    get picks() { return SW.picks; },
    get hiddenBlock() { return SW.hidden; },
    pool: pool,
    _sw: SW
  };
})();
