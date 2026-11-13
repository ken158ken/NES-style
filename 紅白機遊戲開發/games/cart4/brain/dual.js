/*
 * games/cart4/brain/dual.js — 模式 1 TWIN SYNC 雙手同步（左：十字鍵開星艇閃隕石；右：A / B 分揀晶礦）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/core.js、brain/main.js
 *
 * 畫面（一層背景 + 一條 split）：
 *   line 0..143 = 流動場地（名稱表列 0..18，每列相同 ⇒ 週期 8 px）：主捲動 y = 7..0 循環遞減，跑道虛線 / 星塵流線 / 中央柱往下流；
 *   split(144) 以下 = 固定區，捲動 y = 152（畫面列 18..28 顯示名稱表列 19..29，主捲動最多 +7 px 碰不到這幾列）：
 *   左半「星艇甲板」、右半「分揀區 + 閘門 + 兩側收集槽」、最下三列 HUD（名稱表列 27~29）。
 *   （HUD 放在下方：一條 split 只能切「上捲動 / 下固定」，這是 SMB3 式底部狀態列的做法。）
 *   分區靠屬性：左半 = 組 1（紫藍）、中央柱 = 組 3、右半 = 組 2（青綠）、HUD = 組 0。
 * 左半（十字鍵 ←→）：3 條跑道，隕石一排一排落下（每排至少留一條空道，第 2 級起有兩顆並排），撞到 = −1 心；星屑 +50。
 * 右半（A / B）：晶礦 GEM 與廢渣 JUNK 從滑槽落下，進到分揀區（兩條虛線之間）時按鍵：
 *   規則牌寫在兩側收集槽上（預設 GEM → 右槽 A、JUNK → 左槽 B）；第 5 級起規則會**對調**（先閃 2 秒預告）。
 *   分錯 / 沒分到 = −1 心；不在分揀區按鍵 = 不算（友善）。
 * 8 級 × 20 秒，每過一級回 1 心；隕石 / 晶礦越來越快、越來越密。
 * 每線精靈（設計保證）：同一排隕石 ≤ 2 顆（4）＋同排星屑只出現在單顆排（≤ 3）、星艇 2、右半同一高度最多 1 個晶礦（2）
 *   ⇒ 每線 ≤ 8；排與排間距 ≥ 40 px、晶礦間距 ≥ 40 px（生成時檢查），所以不同排不會疊在同一掃描線。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};
  var C = BR.C, AU = BR.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var LEVEL_T = C.sec(20);
  var LANES = [12, 48, 84];                 // 星艇 / 隕石左緣 x（16 寬；中心 20 / 56 / 92）
  var SHIP_Y = 160, SPLIT = 144;
  var CHUTE_X = 192, ZONE_Y0 = 144, ZONE_Y1 = 184, GATE_Y = 188;
  // fix-r8（qa-r8 建議表）：真人模型 A（lag 20 + 換組）在第 6 級隕石 448 處斷崖式失誤 ⇒ 第 6~8 級隕石速度 448/512/576 → 400/448/496（−11~14%）
  var LV = [
    { rv: 256, gap: 64, dbl: 0, iv: 160, igap: 120, flip: 0 },
    { rv: 288, gap: 58, dbl: 20, iv: 176, igap: 110, flip: 0 },
    { rv: 320, gap: 52, dbl: 35, iv: 192, igap: 100, flip: 0 },
    { rv: 352, gap: 48, dbl: 45, iv: 208, igap: 92, flip: 0 },
    { rv: 384, gap: 44, dbl: 50, iv: 224, igap: 86, flip: 1 },
    { rv: 400, gap: 40, dbl: 55, iv: 240, igap: 80, flip: 1 },
    { rv: 448, gap: 36, dbl: 60, iv: 272, igap: 74, flip: 1 },
    { rv: 496, gap: 32, dbl: 65, iv: 304, igap: 68, flip: 1 }
  ];
  var PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x10, 0x30], [0x02, 0x12, 0x22], [0x0A, 0x1A, 0x2A], [0x00, 0x2D, 0x3D]],
    spr: [[0x01, 0x21, 0x30], [0x07, 0x17, 0x28], [0x0B, 0x2B, 0x3A], [0x05, 0x15, 0x26]]
  };

  var M = {
    key: 'TWIN', name: 'TWIN SYNC', short: 'TWIN', sub: 'TWO HANDS TWO GAMES', song: 'brain_twin',
    levels: 8, hearts: 5, levelSelect: true, pal: PAL, heartPerLevel: 1, hudRows: [27, 28, 29],
    finalMsg: 'LEVEL 8 CLEAR! PERFECT SYNC',
    rules: [
      'LEFT: DPAD MOVES THE SHIP',
      '  DODGE ROCKS, GET DUST',
      '',
      'RIGHT: A / B SORTS ITEMS',
      '  IN THE ZONE BETWEEN THE',
      '  DOTTED LINES. FOLLOW THE',
      '  BIN SIGNS (LV5+ SWAP!)'
    ],
    pad: { d: ['SHIP L/R'], b: 'L BIN', a: 'R BIN' }, goalLine: 'SURVIVE 20 SEC A LEVEL'
  };
  function sub() { return C.g.sub; }
  function P() { return LV[C.clamp(sub().lv, 0, 7)]; }

  /* ---------------- 背景 ---------------- */
  // 名稱表列 r：0..18 = 流動場地（每列相同 ⇒ 週期 8 px，主捲動 0..7）；19..29 = 固定區（split 後畫面列 18..28 = 名稱表列 19..29）
  function fieldTile(c, r) {
    var deck = r >= 19;
    if (r >= 27) return 0;
    if (c <= 13) {
      if (c === 0) return C.t('FR_L');
      if (c === 13) return C.t('FR_R');
      if (r === 24) return C.t('FR_B');
      if (r > 24) return 0;
      if (c === 4 || c === 9) return deck ? C.t('CHU_L') : C.t('LN0');
      if (!deck && ((c * 7) % 5 === 1)) return C.t(c & 1 ? 'SD1' : 'SD0');
      return 0;
    }
    if (c <= 17) {
      if (c === 15 || c === 16) return C.t(deck ? 'DV1' : 'DV0');
      return C.t('SOL1');
    }
    if (r <= 23) {
      if (c === 23) return deck ? C.t('ZONE_L') : C.t('CHU_L');
      if (c === 26) return deck ? C.t('ZONE_R') : C.t('CHU_R');
    }
    if (c === 31) return C.t('FR_R');
    if (!deck && ((c * 5) % 7 === 2) && (c < 23 || c > 26)) return C.t(c & 1 ? 'SD0' : 'SD1');
    return 0;
  }
  function drawBins(flip, blink) {
    // 左槽 cols 19..22、右槽 cols 27..30：名稱表列 24 = 槽頂、25 = 規則牌、26 = 按鍵；閘門列 24 cols 24..25
    var L = flip ? 'GEM ' : 'JUNK', R = flip ? 'JUNK' : 'GEM ';
    var s = sub();
    for (var k = 0; k < 2; k++) {
      var c0 = k === 0 ? 19 : 27;
      C.put(c0, 24, C.t('BIN_T')); C.put(c0 + 3, 24, C.t('BIN_T'));
      C.put(c0 + 1, 24, C.t('FR_T')); C.put(c0 + 2, 24, C.t('FR_T'));
      C.text(c0, 25, blink ? '    ' : (k === 0 ? L : R));
      C.text(c0, 26, k === 0 ? ' B  ' : '  A ');
    }
    drawGate(s ? s.gate : 0);
  }
  function drawGate(dir) {
    C.put(24, 24, C.t(dir < 0 ? 'GATE_R0' : dir > 0 ? 'SP' : 'GATE_M'));
    C.put(25, 24, C.t(dir > 0 ? 'GATE_L0' : dir < 0 ? 'SP' : 'GATE_M'));
  }
  function deckText() {
    C.text(1, 25, 'SHIP DECK');
    C.text(1, 26, 'DPAD L/R');
  }

  M.enter = function (lv) {
    var s = C.g.sub = {
      t: 0, lv: lv, lane: 1, sx: LANES[1] * 256, inv: 0, rocks: [], picks: [], rowWait: 40, lastFree: 1,
      items: [], itemWait: 70, flip: false, flipAt: -1, flipBlink: 0, gate: 0, gateT: 0, flips: 0,
      scroll: 0, hits: 0, rowsOk: 0, sortOk: 0, sortNg: 0, stars: 0, streak: 0, repeat: 0, prevDir: 0
    };
    if (P().flip) s.flipAt = C.sec(5) + C.rint(C.sec(4));
    C.redraw(function () {
      for (var r = 0; r < 30; r++) for (var c = 0; c < 32; c++) C.put(c, r, fieldTile(c, r));
      // 甲板與分揀區的分界線（固定區頂端 = 名稱表列 19）
      for (c = 1; c < 13; c++) if (c !== 4 && c !== 9) C.put(c, 19, C.t('FR_T'));
      for (c = 18; c < 31; c++) if (c !== 23 && c !== 26) C.put(c, 19, C.t('FR_T'));
      drawBins(false, false);
      deckText();
      // 屬性：左半組 1、中央柱組 3、右半組 2；名稱表列 26~29（按鍵列 + HUD）組 0
      C.fillA(0, 0, 7, 13, 1); C.fillA(7, 0, 2, 13, 3); C.fillA(9, 0, 7, 13, 2);
      C.fillA(0, 13, 16, 2, 0);
    }, PAL);
  };
  M.begin = function () { };
  M.idle = function () { var s = sub(); s.scroll = (s.scroll + 64) & 0xFFF; };

  /* ---------------- 生成 ---------------- */
  function spawnRow(s, p) {
    // 空道：與上一排的空道相鄰（距離 ≤ 1），保證跟得上
    var free = C.clamp(s.lastFree + (C.rint(3) - 1), 0, 2);
    var blocked = [];
    for (var k = 0; k < 3; k++) if (k !== free) blocked.push(k);
    var two = C.rint(100) < p.dbl;
    var lanes = two ? blocked : [blocked[C.rint(2)]];
    var row = { y: -16 * 256, lanes: lanes, passed: false, id: s.t };
    lanes.forEach(function (ln) { s.rocks.push({ lane: ln, y: row.y, row: row.id, hit: false }); });
    if (!two && C.rint(100) < 35) {
      var empty = [0, 1, 2].filter(function (q) { return lanes.indexOf(q) < 0; });
      s.picks.push({ lane: empty[C.rint(empty.length)], y: row.y + 4 * 256 });
    }
    s.lastFree = free;
  }
  function spawnItem(s) {
    var last = s.items.length ? s.items[s.items.length - 1] : null;
    if (last && (last.y >> 8) < 40) return false;
    s.items.push({ type: C.rint(2), y: -16 * 256, dec: 0, fly: 0, x: CHUTE_X });
    return true;
  }

  /* ---------------- 每幀 ---------------- */
  M.tick = function (I) {
    var s = sub(), p = P(), i;
    s.t++;
    s.scroll = (s.scroll + p.rv) & 0xFFF;
    if (s.inv > 0) s.inv--;
    // ---- 左：星艇 ----
    var d = 0;
    if (I.pressed(BTN.LEFT)) d = -1; else if (I.pressed(BTN.RIGHT)) d = 1;
    else if (I.held(BTN.LEFT) || I.held(BTN.RIGHT)) { if (++s.repeat >= 14) { s.repeat = 10; d = I.held(BTN.LEFT) ? -1 : 1; } }
    else s.repeat = 0;
    if (I.pressed(BTN.LEFT) || I.pressed(BTN.RIGHT)) s.repeat = 0;
    if (d) { var nl = C.clamp(s.lane + d, 0, 2); if (nl !== s.lane) { s.lane = nl; AU.sfx('brain_move'); } }
    var tx = LANES[s.lane] * 256;
    if (s.sx < tx) s.sx = Math.min(tx, s.sx + 6 * 256); else if (s.sx > tx) s.sx = Math.max(tx, s.sx - 6 * 256);
    if (--s.rowWait <= 0) { spawnRow(s, p); s.rowWait = p.gap; }
    var shipX = s.sx >> 8;
    for (i = s.rocks.length - 1; i >= 0; i--) {
      var r = s.rocks[i];
      r.y += p.rv;
      var ry = r.y >> 8;
      if (!r.hit && s.inv === 0 && ry + 14 > SHIP_Y + 2 && ry < SHIP_Y + 14 && Math.abs(LANES[r.lane] - shipX) < 12) {
        r.hit = true; s.hits++; s.inv = 60; s.streak = 0;
        C.hurt('ROCK HIT!');
        if (C.g.run.hearts <= 0) return 0;
      }
      if (ry > 200) s.rocks.splice(i, 1);
    }
    // 排通過星艇 ⇒ 加分（該排沒撞到）
    var rowsSeen = {};
    s.rocks.forEach(function (q) { if ((q.y >> 8) > SHIP_Y + 16) { rowsSeen[q.row] = rowsSeen[q.row] || { hit: false }; if (q.hit) rowsSeen[q.row].hit = true; } });
    for (var id in rowsSeen) if (Object.prototype.hasOwnProperty.call(rowsSeen, id)) {
      if (!s.scored) s.scored = {};
      if (!s.scored[id]) { s.scored[id] = 1; if (!rowsSeen[id].hit) { s.rowsOk++; C.addScore(5 * (s.lv + 1)); } }
    }
    for (i = s.picks.length - 1; i >= 0; i--) {
      var pk = s.picks[i];
      pk.y += p.rv;
      var py = pk.y >> 8;
      if (py + 8 > SHIP_Y + 2 && py < SHIP_Y + 14 && Math.abs(LANES[pk.lane] + 4 - (shipX + 4)) < 10) {
        s.picks.splice(i, 1); s.stars++; C.addScore(50); AU.sfx('brain_pick'); continue;
      }
      if (py > 200) s.picks.splice(i, 1);
    }
    // ---- 右：分揀 ----
    if (s.flipAt >= 0) {
      if (s.t === s.flipAt - 120) { C.say('BINS SWAP SOON!', 120); AU.sfx('brain_alarm'); }
      if (s.t >= s.flipAt - 120 && s.t < s.flipAt) { var bl = ((s.t >> 4) & 1) === 1; if (bl !== s.flipBlink) { s.flipBlink = bl; drawBins(s.flip, bl); } }
      if (s.t === s.flipAt) {
        s.flip = !s.flip; s.flips++; s.flipBlink = false; drawBins(s.flip, false);
        C.say(s.flip ? 'SWAP! GEM = B  JUNK = A' : 'SWAP! GEM = A  JUNK = B', 100);
        s.flipAt = s.t + C.sec(6) + C.rint(C.sec(4));
      }
    }
    if (--s.itemWait <= 0) { if (spawnItem(s)) s.itemWait = p.igap; else s.itemWait = 8; }
    var a = I.pressed(BTN.A), b = I.pressed(BTN.B);
    var target = -1;
    for (i = 0; i < s.items.length; i++) {
      var it = s.items[i], cy = (it.y >> 8) + 8;
      if (!it.dec && cy >= ZONE_Y0 && cy <= ZONE_Y1) { target = i; break; }
    }
    if ((a || b) && target >= 0) {
      var t0 = s.items[target];
      t0.dec = a ? 1 : -1;            // +1 = 右槽（A）、−1 = 左槽（B）
      var wantRight = (t0.type === 0) !== s.flip;   // GEM（type 0）預設進右槽
      t0.ok = (t0.dec > 0) === wantRight;
      s.gate = t0.dec; s.gateT = 20; drawGate(s.gate);
      if (t0.ok) { s.sortOk++; s.streak++; C.addScore(10 * (s.lv + 1) + Math.min(50, s.streak)); AU.sfx('brain_sort'); }
      else { s.sortNg++; s.streak = 0; C.hurt('WRONG BIN!'); if (C.g.run.hearts <= 0) return 0; }
    }
    if (s.gateT > 0 && --s.gateT === 0) { s.gate = 0; drawGate(0); }
    for (i = s.items.length - 1; i >= 0; i--) {
      var q = s.items[i];
      if (q.dec) {
        q.fly++;
        q.x += q.dec * 3;
        q.y += 256;
        if (q.fly > 18) s.items.splice(i, 1);
        continue;
      }
      q.y += p.iv;
      if ((q.y >> 8) + 8 > GATE_Y) {
        s.items.splice(i, 1); s.sortNg++; s.streak = 0;
        C.hurt('MISSED THE SORT!');
        if (C.g.run.hearts <= 0) return 0;
      }
    }
    if (s.t >= LEVEL_T) { s.rocks = []; s.picks = []; s.items = []; return 1; }
    return 0;
  };

  /* ---------------- 繪製 ---------------- */
  M.draw = function () {
    var s = sub(), ppu = C.nes.ppu, i;
    // 主捲動：y 從 7 往 0 遞減（畫面往下流，週期 8 px）；split 以下固定，顯示名稱表列 19 起（world y 152）
    var off = 7 - ((s.scroll >> 8) & 7);
    ppu.scroll(0, off);
    ppu.split(SPLIT, { x: 0, y: SPLIT + 8, nt: 0 });
    for (i = 0; i < s.rocks.length; i++) {
      var r = s.rocks[i];
      if (r.hit) { if ((s.t & 2) === 0) C.spr16(LANES[r.lane], r.y >> 8, 'BURST_', 3); }
      else C.spr16(LANES[r.lane], r.y >> 8, 'ROCK_', 1);
    }
    for (i = 0; i < s.picks.length; i++) C.spr(LANES[s.picks[i].lane] + 4, s.picks[i].y >> 8, C.s('PICK'), 2);
    if (s.inv === 0 || (s.t & 4)) C.spr16(s.sx >> 8, SHIP_Y, 'SHIP_', 0);
    for (i = 0; i < s.items.length; i++) {
      var it = s.items[i];
      C.spr16(it.x, it.y >> 8, it.type === 0 ? 'GEM_' : 'JUNK_', it.type === 0 ? 2 : 3);
    }
  };
  M.hud2 = function () {
    var s = sub(), left = Math.max(0, LEVEL_T - s.t);
    return 'TIME ' + C.timeText(left) + 'S  SORT ' + C.pad(s.sortOk, 3) + ' DUST ' + C.pad(s.stars, 2);
  };
  M.hint = function () {
    var s = sub();
    return s.flip ? 'RULE: GEM=B LEFT  JUNK=A RIGHT' : 'RULE: GEM=A RIGHT  JUNK=B LEFT';
  };
  M.levelTip = function (lv) {
    return ['WARM UP: ONE ROCK A ROW', 'ROCK PAIRS APPEAR', 'FASTER ROCKS', 'FASTER SORTING', 'BINS WILL SWAP!',
            'SWAP + SPEED', 'STORM', 'FINAL STORM'][lv] || '';
  };
  M.cheat = function () { var s = sub(); s.rocks = []; s.picks = []; s.items = []; s.inv = 90; };
  M.grade = function (R) { var h = R.hurts; return h <= 1 ? 0 : h <= 3 ? 1 : h <= 6 ? 2 : h <= 10 ? 3 : 4; };
  M.titleOf = function (gi) { return ['MIRROR MIND', 'TWIN STAR', 'GOOD SYNC', 'OUT OF STEP', 'TANGLED HANDS'][gi]; };
  M.resultLines = function (R) { return ['HEARTS LOST ' + R.hurts, 'LEVELS 8 OF 8']; };
  M.overLine = function () { var s = sub(); return 'SORTED ' + C.pad(s.sortOk, 3) + '  DUST ' + C.pad(s.stars, 2); };
  M.stateOf = function () {
    var s = sub();
    if (!s) return null;
    return {
      t: s.t, lv: s.lv, lane: s.lane, sx: s.sx >> 8, inv: s.inv, hits: s.hits, rowsOk: s.rowsOk, sortOk: s.sortOk, sortNg: s.sortNg,
      stars: s.stars, flip: s.flip, flips: s.flips, rocks: s.rocks.length, items: s.items.length, scroll: s.scroll
    };
  };

  /* ---------------- 機器人 ---------------- */
  M.observe = function () {
    var s = sub();
    return {
      t: s.t, rocks: s.rocks.filter(function (r) { return !r.hit; }).map(function (r) { return { lane: r.lane, y: r.y >> 8, row: r.row }; }),
      picks: s.picks.map(function (q) { return { lane: q.lane, y: q.y >> 8 }; }),
      items: s.items.filter(function (q) { return !q.dec; }).map(function (q) { return { type: q.type, y: q.y >> 8 }; }),
      flip: s.flip, rv: P().rv, iv: P().iv
    };
  };
  M.bot = function (o, mem, now) {
    var s = sub(), m = 0, lag = C.g.bot.lag, prev = mem.prev || 0;
    mem.taps = mem.taps || {};
    function tap(b) { if (prev & b) return 0; if (now - (mem.taps[b] || -99) < 5) return 0; mem.taps[b] = now; return b; }
    // 左：看「還沒通過星艇」的最近兩排，挑空道（自己所在跑道用目前值）
    var adv = (o.rv * lag) >> 8, rows = {};
    o.rocks.forEach(function (r) {
      var y = r.y + adv;
      if (y > SHIP_Y + 16) return;
      (rows[r.row] = rows[r.row] || { y: y, lanes: [] }).lanes.push(r.lane);
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.y - a.y; });
    // fix-r8：「傳出副本」——人記得自己剛按了換道，在手還沒反映到畫面前（≤ 40 幀）以「按下去之後的跑道」思考，不會連按兩次衝過頭
    var lane = s.lane;
    if (mem.pend !== undefined) { if (s.lane === mem.pend || now - mem.pendT > 40) mem.pend = undefined; else lane = mem.pend; }
    var want = lane;
    if (list.length) {
      var r0 = list[0], free0 = [0, 1, 2].filter(function (q) { return r0.lanes.indexOf(q) < 0; });
      var r1 = list[1], free1 = r1 ? [0, 1, 2].filter(function (q) { return r1.lanes.indexOf(q) < 0; }) : [0, 1, 2];
      var best = null, bd = 99;
      free0.forEach(function (q) {
        var d = Math.abs(q - lane) * 2 + (free1.indexOf(q) >= 0 ? 0 : 1);
        if (r0.y < SHIP_Y - 70 && free1.indexOf(q) < 0) d += 2;
        if (d < bd) { bd = d; best = q; }
      });
      if (best !== null) want = best;
    }
    var lt = 0;
    if (want < lane) lt = tap(BTN.LEFT); else if (want > lane) lt = tap(BTN.RIGHT);
    if (lt) { m |= lt; mem.pend = lane + (lt === BTN.LEFT ? -1 : 1); mem.pendT = now; }
    // 右：預測目前位置（看到的 + 速度 × 延遲），在分揀區中段才按
    for (var i = 0; i < o.items.length; i++) {
      var it = o.items[i], cy = it.y + ((o.iv * lag) >> 8) + 8;
      if (cy >= ZONE_Y0 + 8 && cy <= ZONE_Y1 - 4) {
        if (mem.lastItemY !== undefined && mem.lastType === it.type && Math.abs(mem.lastItemY - it.y) < 30 && now - mem.lastSort < 30) break;
        var right = (it.type === 0) !== o.flip;
        var b = tap(right ? BTN.A : BTN.B);
        if (b) { m |= b; mem.lastItemY = it.y; mem.lastType = it.type; mem.lastSort = now; }
        break;
      }
    }
    mem.prev = m;
    return m;
  };

  BR.Modes = BR.Modes || [];
  BR.Modes[0] = M;
  BR.Dual = { M: M, LV: LV, LANES: LANES, LEVEL_T: LEVEL_T, ZONE: [ZONE_Y0, ZONE_Y1], SHIP_Y: SHIP_Y, SPLIT: SPLIT };
})();
