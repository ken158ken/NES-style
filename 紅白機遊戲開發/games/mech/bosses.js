/*
 * games/mech/bosses.js — 《星塵機甲》兩個機器人頭目（原創）
 * ---------------------------------------------------------------------------
 * 擁有者：mech-r1 agent ｜ 依賴：engine/shmup.js、games/mech/weapons.js
 * 契約：docs/TASKS.md「R4 《星塵機甲》契約 / 頭目」
 *
 * 設計依據 `docs/research/03_經典遊戲深度解析/03_洛克人2.md`：
 *   §⑤「每位魔王 HP = 28」⇒ 兩隻都是 28；弱點武器 10 傷害 = **3 發倒**，基礎砲 1 傷 = 28 發 [源]
 *   §⑤ 招式家族：Heat Man 的「火柱三連 + 全螢幕衝刺（附無敵）」、Air Man 的「固定生成模式彈幕」
 *   §⑦ 難度曲線：血量降低後（≤ 14）進入第二階段，多一招衝刺、間隔縮短
 *   §⑩⑩ 避免「唯一解」：**基礎砲永遠打得死**，弱點只是快 9 倍
 *
 * | key   | 名稱             | 招式循環 | 弱點 | 階段 |
 * |-------|------------------|----------|------|------|
 * | frost | 霜棱機兵 FROST   | 等待 → **冰棱三連（扇形）** → 等待 → **跳躍落地兩道冰震波** → [階段 2] 滑行衝撞（無敵） | 爆焰彈（10） | 2 |
 * | blaze | 爆焰機兵 BLAZE   | 等待 → **三道火柱（固定 x，預警 24 幀）** → 等待 → **八方火環** → [階段 2] 衝刺（無敵） | 冰棱彈（10） | 2 |
 *
 * 公平性（讓「純實力通關」成立，也是機器人能 0 死的原因）：
 *   火柱固定在 x = 60 / 120 / 180 ⇒ **左右兩個角落永遠安全**（研究 ⑩⑦ 的「給玩家一個活路」）；
 *   每一招前都有 20 幀的預備姿勢（anim 切換）＝ 可觀察的開窗期。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var MG = window.MG = window.MG || {};
  var SH = NES.SH;
  if (!SH) throw new Error('games/mech/bosses.js 需要 engine/shmup.js');

  var HP_MAX = 28;
  var FLOOR_ROW = 24;
  var BOSS_W = 24, BOSS_H = 30;          // 碰撞框比 32×32 的圖小（研究：判定框縮小原則）
  var TELL = 20;                         // 招式前的預備姿勢幀數
  var PILLAR_X = [60, 120, 180];
  var PILLAR_WARN = 24;

  var DEFS = {
    frost: {
      key: 'frost', name: 'FROST', art: 'B_FROST', pal: 3, weapon: 'frost',
      waitA: 70, waitB: 60, waitA2: 48, waitB2: 40, contact: 4
    },
    blaze: {
      key: 'blaze', name: 'BLAZE', art: 'B_BLAZE', pal: 3, weapon: 'blaze',
      waitA: 70, waitB: 60, waitA2: 48, waitB2: 40, contact: 4
    }
  };

  function create(key) {
    var d = DEFS[key];
    if (!d) throw new Error('games/mech/bosses.js: 沒有這隻頭目 ' + key);
    return {
      key: key, def: d, name: d.name,
      x: 196, y: -40, w: BOSS_W, h: BOSS_H,
      hp: HP_MAX, maxHp: HP_MAX,
      mode: 'drop', t: 0, phase: 1, facing: -1, anim: 0, animT: 0,
      invuln: true, active: false, dead: false, deadT: 0, flash: 0,
      vy: 0, ay: 0, pillars: [], hits: 0, cycles: 0
    };
  }

  function box(b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }

  function hit(b, dmg, g) {
    if (b.invuln || b.dead || !b.active) return false;
    b.hp -= dmg | 0;
    b.hits++;
    b.flash = 6;
    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      b.deadT = 0;
      b.mode = 'die';
      b.invuln = true;
      if (g && g.sfx) g.sfx('bossdie');
      return true;
    }
    if (b.hp <= 14 && b.phase === 1) b.phase = 2;
    if (g && g.sfx) g.sfx('ehit');
    return false;
  }

  function floorY() { return FLOOR_ROW * 8 - BOSS_H; }

  function setMode(b, m, t) { b.mode = m; b.t = t | 0; }

  function update(b, g) {
    var h = g.hero;
    b.t++;
    if (b.flash > 0) b.flash--;
    if (++b.animT >= 10) { b.animT = 0; }

    if (b.mode === 'drop') {
      b.vy += 1;
      if (b.vy > 5) b.vy = 5;
      b.y += b.vy;
      b.anim = 1;
      if (b.y >= floorY()) {
        b.y = floorY();
        b.vy = 0;
        setMode(b, 'ready', 0);
        if (g.sfx) g.sfx('land');
      }
      return b;
    }
    if (b.mode === 'ready') {               // 落地後的靜止：玩家有時間看清楚（研究 ⑦）
      b.anim = 0;
      b.invuln = true;
      if (b.t >= 50) { b.active = true; b.invuln = false; setMode(b, 'wait', 0); }
      return b;
    }
    if (b.mode === 'die') {
      b.deadT++;
      b.anim = (b.deadT >> 2) & 1;
      return b;
    }

    if (h) b.facing = (h.x + 6 < b.x) ? -1 : 1;
    var p2 = b.phase === 2;
    var wA = p2 ? b.def.waitA2 : b.def.waitA;
    var wB = p2 ? b.def.waitB2 : b.def.waitB;

    switch (b.mode) {
      case 'wait':
        b.anim = (b.t > wA - TELL) ? 1 : 0;
        if (b.t >= wA) { setMode(b, b.key === 'frost' ? 'fan' : 'pillar', 0); }
        break;
      case 'wait2':
        b.anim = (b.t > wB - TELL) ? 1 : 0;
        if (b.t >= wB) {
          if (p2 && (b.cycles & 1)) setMode(b, 'dash', 0);
          else setMode(b, b.key === 'frost' ? 'hop' : 'ring', 0);
        }
        break;

      /* ---------------- FROST：冰棱三連（扇形） ---------------- */
      case 'fan':
        b.anim = 1;
        if (b.t === 2 || b.t === 14 || b.t === 26) {
          var k = (b.t - 2) / 12;
          MG.Weapons.efire(b.x + (b.facing > 0 ? b.w : -6), b.y + 12,
                           b.facing * 3, (k - 1) * 2, 2, 'B_ICE', 3, 0);
          if (g.sfx) g.sfx('eshot');
        }
        if (b.t >= 40) { setMode(b, 'wait2', 0); }
        break;

      /* ---------------- FROST：跳躍 + 落地兩道冰震波 ---------------- */
      case 'hop':
        b.anim = 1;
        if (b.t === 1) { b.vy = -5; b.ay = 0; }
        b.vy += 1;
        if (b.vy > 6) b.vy = 6;
        b.y += b.vy;
        b.x -= b.facing * 1;          // 遠離主角（保持距離，友善版：不把玩家壓在角落）
        if (b.x < 16) b.x = 16;
        if (b.x > 256 - b.w - 16) b.x = 256 - b.w - 16;
        if (b.y >= floorY() && b.vy > 0) {
          b.y = floorY();
          b.vy = 0;
          MG.Weapons.efire(b.x - 6, floorY() + b.h - 8, -3, 0, 2, 'B_ICE', 3, 0);
          MG.Weapons.efire(b.x + b.w, floorY() + b.h - 8, 3, 0, 2, 'B_ICE', 3, 0);
          if (g.sfx) g.sfx('land');
          b.cycles++;
          setMode(b, 'wait', 0);
        }
        break;

      /* ---------------- BLAZE：三道火柱（固定 x，先預警） ---------------- */
      case 'pillar':
        b.anim = 1;
        if (b.t === 1) {
          b.pillars = [{ x: PILLAR_X[0], t: 0 }, { x: PILLAR_X[1], t: 0 }, { x: PILLAR_X[2], t: 0 }];
          if (g.sfx) g.sfx('warn');
        }
        var i;
        for (i = 0; i < b.pillars.length; i++) b.pillars[i].t = b.t;
        if (b.t === PILLAR_WARN) {
          for (i = 0; i < b.pillars.length; i++) {
            MG.Weapons.efire(b.pillars[i].x, FLOOR_ROW * 8 - 8, 0, -4, 2, 'B_FIRE', 1, 0);
            MG.Weapons.efire(b.pillars[i].x, FLOOR_ROW * 8 - 8, 0, -3, 2, 'B_FIRE', 1, 0);
          }
          if (g.sfx) g.sfx('fire');
        }
        if (b.t >= PILLAR_WARN + 20) { b.pillars = []; setMode(b, 'wait2', 0); }
        break;

      /* ---------------- BLAZE：八方火環 ---------------- */
      case 'ring':
        b.anim = 1;
        if (b.t === 4) {
          var a;
          for (a = 0; a < 8; a++) {
            var ang = a * 32;
            MG.Weapons.efire(b.x + (b.w >> 1) - 3, b.y + 12,
                             (SH.cos(ang) * 2) >> 8, (SH.sin(ang) * 2) >> 8, 2, 'B_RING', 1, 0);
          }
          if (g.sfx) g.sfx('fire');
        }
        if (b.t >= 36) { b.cycles++; setMode(b, 'wait', 0); }
        break;

      /* ---------------- 共用：全螢幕衝刺（附無敵，研究 ⑤ Heat Man） ---------------- */
      case 'dash':
        b.anim = 1;
        b.invuln = true;
        if (b.t <= TELL) break;                  // 預備
        b.x += b.facing * 3;
        if (b.x < 12 || b.x > 256 - b.w - 12) {
          b.x = b.x < 12 ? 12 : 256 - b.w - 12;
          b.facing = -b.facing;
          b.invuln = false;
          b.cycles++;
          setMode(b, 'wait', 0);
        }
        break;
    }
    return b;
  }

  function draw(b, oam, tiles) {
    if (!b) return 0;
    if (b.dead && b.deadT > 60) return 0;
    var n = 0, r, c, i, t;
    if (b.dead) {
      // 大爆炸：同心的 8 方向能量球（與主角死亡同一套語彙）
      var names = ['M_BOOM0', 'M_BOOM1', 'M_BOOM2', 'M_BOOM3'];
      var tb = tiles[names[(b.deadT >> 3) & 3]];
      if (tb === undefined) return 0;
      for (r = 0; r < 4; r++) {
        for (c = 0; c < 4; c++) {
          if (((r + c + (b.deadT >> 2)) & 1) === 0) continue;
          oam.add({ x: b.x - 4 + c * 8, y: b.y + r * 8, tile: tb, pal: 1, prio: 2 });
          n++;
        }
      }
      return n;
    }
    if (b.flash > 0 && (b.flash & 1)) return 0;
    var base = b.def.art + (b.anim & 1) + '_';
    var sx = b.x - 4, sy = b.y - 2, flip = b.facing > 0;
    for (r = 0; r < 4; r++) {
      for (c = 0; c < 4; c++) {
        i = r * 4 + (flip ? 3 - c : c);
        t = tiles[base + i];
        if (t === undefined) continue;
        oam.add({ x: sx + c * 8, y: sy + r * 8, tile: t, pal: b.def.pal, flipH: flip, prio: 3 });
        n++;
      }
    }
    // 火柱預警：地板上先冒小火（研究 ⑦「每關第一個房間都是安全教室」的同一個精神：先給提示）
    if (b.pillars && b.pillars.length && tiles.B_FIRE !== undefined) {
      var p;
      for (p = 0; p < b.pillars.length; p++) {
        if (b.pillars[p].t >= PILLAR_WARN) continue;
        if (((b.pillars[p].t >> 2) & 1) === 0) continue;
        oam.add({ x: b.pillars[p].x, y: FLOOR_ROW * 8 - 8, tile: tiles.B_FIRE, pal: 1, prio: 2 });
        n++;
      }
    }
    return n;
  }

  MG.Bosses = {
    HP_MAX: HP_MAX, DEFS: DEFS, FLOOR_ROW: FLOOR_ROW, PILLAR_X: PILLAR_X, TELL: TELL,
    BOSS_W: BOSS_W, BOSS_H: BOSS_H,
    create: create, update: update, draw: draw, hit: hit, box: box, floorY: floorY,
    state: function (b) {
      if (!b) return null;
      return { key: b.key, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp, maxHp: b.maxHp,
               mode: b.mode, phase: b.phase, active: b.active, dead: b.dead, deadT: b.deadT,
               invuln: b.invuln, facing: b.facing, hits: b.hits, cycles: b.cycles };
    }
  };
})();
