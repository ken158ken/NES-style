/*
 * games/cart4/brain/multi.js — 模式 2 JUGGLE 多工（四格控制台）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/core.js、brain/main.js（C.hurt / C.addScore / C.say / C.goalNow）
 *
 * 畫面：HUD 第 1~3 列固定；下方 2×2 四格（每格 16×12 磚 = 8×6 個屬性區塊），**分區只靠屬性**：
 *   待命格 = 組 0（灰）、運作中 = 組 1（青，左上 / 右下）或組 2（金，右上 / 左下）、失誤閃 = 組 3（紅）。
 *   split(32)：HUD 以下的場地用第二組捲動值，失誤時整片場地橫向震 ±2 px（HUD 不動）。
 * 四件任務（各用不同的鍵，彼此獨立）：
 *   DRIFT  左上 ←→  星艇在軌道上被風吹，留在中央亮區；碰到軌道盡頭 = 失誤（風向 / 風力畫在軌道上方）
 *   PUMP   右上 A   油槽一直漏，按 A 打油（每下 +6 px）；空了或滿出來 = 失誤（綠區記號 24~52）
 *   SIGNAL 左下 ↑↓  信號燈亮出箭頭（第 4 級起一次兩個），在倒數條用完前按對應方向；按錯 / 逾時 = 失誤
 *   SHIELD 右下 B   流星從右邊飛向行星，進到護盾環（兩條虛線之間）時按 B 擊碎；撞上行星 = 失誤；空揮冷卻 30 幀
 * 時間軸（幀，60.0988 Hz）：第 1 級 0~20 秒 DRIFT + PUMP、第 2 級 20~45 秒 + SIGNAL、第 3 級 45~90 秒 + SHIELD，
 *   **90 秒 = 任務達成（goal）**；第 4 級 90~120 秒、第 5 級 120~150 秒全部加速，150 秒 = 結算。
 *   新任務開放前 3 秒，待命格閃「NEXT」並寫出要用的鍵。失誤 = −1 心，該任務暫停 60 幀後從安全狀態重來，其他照跑。
 * 每線精靈：DRIFT 星艇 16×8 = 2（只在左上格的軌道列）；SHIELD 流星 ≤ 2 顆同一列 = 4 + 爆光 2 ⇒ 每線 ≤ 6。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};
  var C = BR.C, AU = BR.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var STAGE = [0, C.sec(20), C.sec(45), C.sec(90), C.sec(120), C.sec(150)];
  var OPENS = [0, 0, 1, 2];                       // 任務 i 在第幾級開放（DRIFT / PUMP / SIGNAL / SHIELD）
  // 每級參數（8.8 定點）
  var LV = [
    { wind: 5, thrust: 24, leak: 18, tap: 6, sigWin: 150, sigGap: [90, 160], sig2: 0, met: 112, metGap: [150, 230] },
    { wind: 7, thrust: 24, leak: 22, tap: 6, sigWin: 140, sigGap: [80, 150], sig2: 0, met: 120, metGap: [140, 220] },
    { wind: 9, thrust: 24, leak: 26, tap: 6, sigWin: 120, sigGap: [70, 140], sig2: 0, met: 128, metGap: [130, 200] },
    { wind: 11, thrust: 26, leak: 30, tap: 6, sigWin: 130, sigGap: [70, 130], sig2: 1, met: 160, metGap: [110, 180] },
    { wind: 13, thrust: 28, leak: 36, tap: 6, sigWin: 120, sigGap: [60, 120], sig2: 1, met: 192, metGap: [100, 160] }
  ];
  var Q = [{ c: 0, r: 4, pal: 1 }, { c: 16, r: 4, pal: 2 }, { c: 0, r: 16, pal: 2 }, { c: 16, r: 16, pal: 1 }];
  var NAMES = ['DRIFT', 'PUMP', 'SIGNAL', 'SHIELD'];
  var KEYS = ['LEFT RIGHT', 'A TAP', 'UP DOWN', 'B BLAST'], TAGS = ['L/R', 'A', 'U/D', 'B'];
  // DRIFT 軌道（左上格）：軌道列 10，x 16..111，中心 64；安全亮區 ±20；盡頭 ±46
  var TR_ROW = 10, TR_X0 = 64, TR_SAFE = 20, TR_EDGE = 46;
  // PUMP 油槽（右上格）：第 23 列直條，6..13 列（64 px）
  var TK_COL = 23, TK_TOP = 6, TK_H = 64, TK_LO = 24, TK_HI = 52;
  // SIGNAL（左下格）：箭頭 2×2 於 (5,19) / (9,19)，倒數條第 23 列 3..12
  // SHIELD（右下格）：行星 (17..19, 19..21)，流星 y = 152，護盾環 x 164..204
  var MET_Y = 152, ZONE0 = 164, ZONE1 = 204, PLANET_X = 158;
  var PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x10, 0x30], [0x0C, 0x1C, 0x3C], [0x07, 0x27, 0x38], [0x06, 0x16, 0x36]],
    spr: [[0x11, 0x21, 0x30], [0x17, 0x27, 0x37], [0x16, 0x28, 0x30], [0x06, 0x16, 0x30]]
  };

  var M = {
    key: 'JUGGLE', name: 'JUGGLE', short: 'JUGGLE', sub: '4 TASKS AT ONCE', song: 'brain_juggle',
    levels: 5, hearts: 5, levelSelect: false, pal: PAL, heartPerLevel: 0,
    levelNote: 'STAGES 1-5 BY TIME',
    finalMsg: '150 SEC! ALL STAGES CLEAR',
    rules: [
      '4 TASKS, 4 KEYS, 1 BRAIN.',
      '',
      'DRIFT  KEEP SHIP IN GLOW',
      'PUMP   KEEP FUEL IN MARKS',
      'SIGNAL PRESS THE ARROW',
      'SHIELD B WHEN IN THE RING',
      'NEW TASK EVERY STAGE'
    ],
    pad: { d: ['L/R DRIFT', 'U/D SIGNAL'], b: 'SHIELD', a: 'PUMP' }, goalLine: 'SURVIVE 90 SEC = CLEAR',
    overWhy: 'OUT OF HEARTS'
  };

  function sub() { return C.g.sub; }
  function lvOf(t) { for (var i = STAGE.length - 2; i >= 0; i--) if (t >= STAGE[i]) return i; return 0; }
  function P() { return LV[C.clamp(sub().lv, 0, 4)]; }

  /* ---------------- 畫格 ---------------- */
  function quadFrame(i) { var q = Q[i]; C.frame(q.c, q.r, 16, 12); C.text(q.c + 2, q.r + 1, NAMES[i]); C.text(q.c + 14 - TAGS[i].length, q.r + 1, TAGS[i]); }
  function clearInside(i) { var q = Q[i]; C.fill(q.c + 1, q.r + 2, 14, 9, 0); }
  function quadAttr(i, p) { var q = Q[i]; C.fillA(q.c >> 1, q.r >> 1, 8, 6, p); }
  function drawStandby(i, next) {
    var q = Q[i];
    clearInside(i);
    C.text(q.c + 4, q.r + 5, next ? '  NEXT!  ' : 'STANDBY');
    C.text(q.c + 8 - (KEYS[i].length >> 1), q.r + 7, KEYS[i]);
  }
  function drawTask(i) {
    var q = Q[i], c;
    clearInside(i);
    if (i === 0) {
      for (c = 1; c < 15; c++) {
        var x = c * 8 + 4 - TR_X0;
        C.put(c, TR_ROW, C.t(Math.abs(x) <= TR_SAFE ? 'RAILZ' : 'RAIL'));
      }
      C.put(1, TR_ROW - 1, C.t('MARK')); C.put(14, TR_ROW - 1, C.t('MARKR'));
      C.text(3, 13, 'STAY IN GLOW');
    } else if (i === 1) {
      C.put(TK_COL, TK_TOP - 1, C.t('VBT'));
      C.put(TK_COL, TK_TOP + 8, C.t('VBB'));
      C.put(TK_COL - 1, TK_TOP + 8 - (TK_HI >> 3), C.t('MARKR'));
      C.put(TK_COL + 1, TK_TOP + 8 - (TK_HI >> 3), C.t('MARK'));
      C.put(TK_COL - 1, TK_TOP + 8 - (TK_LO >> 3), C.t('MARKR'));
      C.put(TK_COL + 1, TK_TOP + 8 - (TK_LO >> 3), C.t('MARK'));
      C.text(17, 8, 'FUEL');
      C.text(26, 8, 'TAP');
      C.text(27, 9, 'A');
    } else if (i === 2) {
      C.text(2, 23, 'TIME');
      C.text(3, 25, 'PRESS ARROW');
    } else {
      for (var r = 18; r <= 22; r++) { C.put(ZONE0 >> 3, r, C.t('RING')); C.put(ZONE1 >> 3, r, C.t('RING')); }
      C.text(21, 25, 'RING = B');
    }
    if (i === 3) { for (var k = 0; k < 9; k++) C.put(17 + (k % 3), 19 + ((k / 3) | 0), C.t('PL_' + k)); }
    void q;
  }
  function redrawAll(s) {
    C.redraw(function () {
      for (var i = 0; i < 4; i++) {
        quadFrame(i);
        if (s.on[i]) { drawTask(i); quadAttr(i, Q[i].pal); }
        else { drawStandby(i, false); quadAttr(i, 0); }
      }
    }, PAL);
  }

  /* ---------------- 任務狀態 ---------------- */
  function resetTask(s, i) {
    if (i === 0) { s.dp = 0; s.dv = 0; s.wind = 0; s.windT = 0; s.windTo = 0; s.windHold = 60; }
    else if (i === 1) { s.fuel = 40 * 256; s.crack = 0; s.crackWait = 400; }
    else if (i === 2) { s.sig = null; s.sigWait = 60; }
    else { s.mets = []; s.metWait = 80; s.cool = 0; s.burst = null; }
  }
  function openTask(s, i) {
    s.on[i] = true; resetTask(s, i);
    drawTask(i); quadAttr(i, Q[i].pal);
    C.say('NEW TASK: ' + NAMES[i] + ' (' + KEYS[i] + ')', 120);
    AU.sfx('brain_alarm');
  }
  function fail(s, i, why) {
    s.freeze[i] = 60; s.alert[i] = 60;
    s.fails[i]++;
    resetTask(s, i);
    if (i === 1) drawTank(s, true);
    if (i === 2) drawSignal(s);
    quadAttr(i, 3);
    s.shake = 10;
    C.hurt(why);
  }

  M.enter = function (lv) {
    var t0 = STAGE[C.clamp(lv, 0, 4)];
    var s = C.g.sub = {
      t: t0, lv: lv, on: [false, false, false, false], freeze: [0, 0, 0, 0], alert: [0, 0, 0, 0], fails: [0, 0, 0, 0],
      okSig: 0, okMet: 0, shake: 0, goalSaid: lv >= 3, nextShown: [false, false, false, false], tankDrawn: -1
    };
    for (var i = 0; i < 4; i++) { resetTask(s, i); if (OPENS[i] <= lv) s.on[i] = true; }
    redrawAll(s);
    drawTank(s, true);
  };
  M.begin = function () { };

  /* ---------------- 每幀 ---------------- */
  M.tick = function (I) {
    var s = sub(), i;
    s.t++;
    var lv = lvOf(s.t);
    if (lv !== s.lv) {
      s.lv = lv; C.g.run.lv = lv;
      for (i = 0; i < 4; i++) if (!s.on[i] && OPENS[i] <= lv) openTask(s, i);
      if (lv >= 3) C.say('OVERTIME! EVERYTHING FASTER', 120);
      else AU.sfx('brain_ok');
    }
    // 下一件任務的預告（開放前 3 秒）
    for (i = 0; i < 4; i++) if (!s.on[i] && OPENS[i] === s.lv + 1 && s.t >= STAGE[s.lv + 1] - C.sec(3)) {
      var blink = ((s.t >> 4) & 1) === 0;
      if (blink !== s.nextShown[i]) { s.nextShown[i] = blink; drawStandby(i, blink); quadAttr(i, blink ? Q[i].pal : 0); }
    }
    if (!s.goalSaid && s.t >= STAGE[3]) { s.goalSaid = true; C.goalNow(); C.say('90 SEC! MISSION CLEAR!', 150); AU.sfx('brain_goal'); }
    if (s.shake > 0) s.shake--;
    var p = P();
    for (i = 0; i < 4; i++) {
      if (!s.on[i]) continue;
      if (s.alert[i] > 0 && --s.alert[i] === 0) quadAttr(i, Q[i].pal);
      if (s.freeze[i] > 0) { s.freeze[i]--; continue; }
      if (i === 0) tickDrift(s, p, I);
      else if (i === 1) tickPump(s, p, I);
      else if (i === 2) tickSignal(s, p, I);
      else tickShield(s, p, I);
      if (C.g.run.hearts <= 0) return 0;
    }
    // 計分：每秒 +5 × 運作中任務數（第 4 級起 ×2）
    if (s.t % 60 === 0) {
      var n = 0; for (i = 0; i < 4; i++) if (s.on[i] && s.freeze[i] === 0) n++;
      C.addScore(n * 5 * (s.lv >= 3 ? 2 : 1));
    }
    if (s.t >= STAGE[5]) return 1;
    return 0;
  };

  function tickDrift(s, p, I) {
    if (--s.windHold <= 0) {
      var w = p.wind;
      s.windTo = (C.rint(2 * w + 1) - w);
      if (Math.abs(s.windTo) < (w >> 1)) s.windTo = s.windTo < 0 ? -(w >> 1) : (w >> 1);
      s.windHold = 70 + C.rint(90);
    }
    if (s.wind < s.windTo) s.wind++; else if (s.wind > s.windTo) s.wind--;
    s.dv += s.wind;
    if (I.held(BTN.LEFT) && !I.held(BTN.RIGHT)) s.dv -= p.thrust;
    if (I.held(BTN.RIGHT) && !I.held(BTN.LEFT)) s.dv += p.thrust;
    s.dv -= (s.dv / 16) | 0;
    s.dp += s.dv;
    if (Math.abs(s.dp) > TR_EDGE * 256) { fail(s, 0, 'DRIFT HIT THE END!'); return; }
    s.inZone = Math.abs(s.dp) <= TR_SAFE * 256;
    if (s.inZone && s.t % 60 === 30) C.addScore(2);
    // 風向指示（第 7 列 3 格）：一格 = 1/3 最大風
    var str = Math.min(3, Math.ceil(Math.abs(s.wind) * 3 / Math.max(1, p.wind)));
    var want = s.wind < 0 ? -str : str;
    if (want !== s.windShown) {
      s.windShown = want;
      for (var k = 0; k < 3; k++) {
        C.put(6 + k, 7, k < Math.abs(want) ? C.t(want < 0 ? 'WND_L' : 'WND_R') : 0);
      }
      C.text(2, 7, 'WIND');
    }
  }
  function drawTank(s, force) {
    var lvpx = Math.floor(s.fuel / 256);
    if (!force && lvpx === s.tankDrawn) return;
    s.tankDrawn = lvpx;
    for (var k = 0; k < 8; k++) {
      var fillPx = C.clamp(lvpx - (7 - k) * 8, 0, 8);
      C.put(TK_COL, TK_TOP + k, C.t('VB' + fillPx));
    }
  }
  function tickPump(s, p, I) {
    var leak = p.leak;
    if (s.crack > 0) { leak *= 2; if (--s.crack === 0) C.put(21, 11, 0); }
    else if (--s.crackWait <= 0) {
      s.crack = 150; s.crackWait = 500 + C.rint(400);
      C.put(21, 11, C.t('CRACK'));
      C.say('LEAK! PUMP FASTER', 80);
    }
    s.fuel -= leak;
    if (I.pressed(BTN.A)) { s.fuel += p.tap * 256; AU.sfx('brain_pump'); }
    if (s.fuel <= 0) { fail(s, 1, 'FUEL RAN DRY!'); return; }
    if (s.fuel >= TK_H * 256) { fail(s, 1, 'FUEL OVERFLOW!'); return; }
    var lp = s.fuel >> 8;
    if (lp >= TK_LO && lp <= TK_HI && s.t % 60 === 45) C.addScore(2);
    drawTank(s, false);
  }
  function drawSignal(s) {
    var sg = s.sig;
    for (var k = 0; k < 2; k++) {
      var cx = 5 + k * 4;
      if (sg && k < sg.dirs.length && k >= sg.idx) C.put4(cx, 19, sg.dirs[k] === 0 ? 'BAU_' : 'BAD_');
      else { C.put(cx, 19, 0); C.put(cx + 1, 19, 0); C.put(cx, 20, 0); C.put(cx + 1, 20, 0); }
    }
    s.sigBar = -1;
  }
  function tickSignal(s, p, I) {
    var up = I.pressed(BTN.UP), dn = I.pressed(BTN.DOWN);
    if (!s.sig) {
      if (--s.sigWait <= 0) {
        var n = (p.sig2 && C.rint(2) === 0) ? 2 : 1, dirs = [];
        for (var k = 0; k < n; k++) dirs.push(C.rint(2));
        s.sig = { dirs: dirs, idx: 0, left: p.sigWin + (n - 1) * 40, max: p.sigWin + (n - 1) * 40 };
        drawSignal(s);
        AU.sfx('brain_tick');
      }
    } else {
      var sg = s.sig;
      if (up || dn) {
        var d = up ? 0 : 1;
        if (d === sg.dirs[sg.idx]) {
          sg.idx++;
          if (sg.idx >= sg.dirs.length) {
            s.okSig++; C.addScore(30); AU.sfx('brain_ok');
            s.sig = null; s.sigWait = p.sigGap[0] + C.rint(p.sigGap[1] - p.sigGap[0]);
          } else AU.sfx('brain_step');
          drawSignal(s);
        } else { fail(s, 2, 'WRONG SIGNAL!'); return; }
      } else if (--sg.left <= 0) { fail(s, 2, 'SIGNAL TIMED OUT!'); return; }
    }
    var frac = s.sig ? Math.ceil(s.sig.left * 64 / s.sig.max) : 0;
    if (frac !== s.sigBar) { s.sigBar = frac; C.bar(6, 23, 8, frac); }
  }
  function tickShield(s, p, I) {
    if (s.cool > 0) s.cool--;
    if (s.burst && --s.burst.t <= 0) s.burst = null;
    if (--s.metWait <= 0) {
      var sp = p.met + C.rint(32);
      var last = s.mets.length ? s.mets[s.mets.length - 1] : null;
      if (!last || last.x < 220 * 256) s.mets.push({ x: 248 * 256, v: sp });
      s.metWait = p.metGap[0] + C.rint(p.metGap[1] - p.metGap[0]);
    }
    var blast = I.pressed(BTN.B);
    for (var i = 0; i < s.mets.length; i++) {
      var m = s.mets[i];
      m.x -= m.v;
      if ((m.x >> 8) < PLANET_X) { s.mets.splice(i, 1); fail(s, 3, 'METEOR HIT THE PLANET!'); return; }
    }
    if (blast) {
      var hit = -1;
      for (i = 0; i < s.mets.length; i++) { var mx = (s.mets[i].x >> 8) + 4; if (mx >= ZONE0 && mx <= ZONE1) { hit = i; break; } }
      if (s.cool > 0) { AU.sfx('brain_ng'); }
      else if (hit >= 0) {
        s.burst = { x: s.mets[hit].x >> 8, t: 16 };
        s.mets.splice(hit, 1); s.okMet++; C.addScore(30); AU.sfx('brain_zap');
      } else { s.cool = 30; AU.sfx('brain_ng'); C.say('SHIELD MISSED - COOLING', 40); }
    }
  }

  /* ---------------- 繪製 ---------------- */
  M.draw = function (mode) {
    var s = sub(), ppu = C.nes.ppu, i;
    var sx = s.shake > 0 ? ((s.shake & 2) ? 2 : -2) : 0;
    ppu.scroll(0, 0);
    ppu.split(32, { x: (sx + 512) & 511, y: 32, nt: 0 });
    void mode;
    if (s.on[0]) {
      var x = TR_X0 + (s.dp >> 8) - 8 - sx;
      var fl = s.freeze[0] > 0 && (s.t & 4);
      if (!fl) { C.spr(x, TR_ROW * 8 - 3, C.s('DRIFT_0'), 0); C.spr(x + 8, TR_ROW * 8 - 3, C.s('DRIFT_1'), 0); }
    }
    if (s.on[3]) {
      for (i = 0; i < s.mets.length; i++) C.spr16((s.mets[i].x >> 8) - sx, MET_Y, 'MET_', 1);
      if (s.burst) C.spr16(s.burst.x - sx, MET_Y, 'BURST_', 2);
      if (s.cool > 0 && (s.t & 8)) C.spr(184 - sx, 136, C.s('ALERT'), 3);
    }
    for (i = 0; i < 4; i++) if (s.alert[i] > 0 && (s.alert[i] & 8)) C.spr(Q[i].c * 8 + 60 - sx, Q[i].r * 8 + 44, C.s('ALERT'), 3);
  };
  M.hud2 = function () {
    var s = sub();
    var t = s.t, nextAt = s.lv < 4 ? STAGE[s.lv + 1] : STAGE[5];
    var line = 'TIME ' + C.timeText(t) + 'S';
    if (t < STAGE[3]) line += '  GOAL ' + C.timeText(Math.max(0, STAGE[3] - t)) + 'S';
    else line += '  END ' + C.timeText(Math.max(0, STAGE[5] - t)) + 'S';
    void nextAt;
    return line;
  };
  M.hint = function () { return 'STAGE ' + (sub().lv + 1) + ' OF 5   ' + (sub().t >= STAGE[3] ? 'OVERTIME' : 'HOLD ON!'); };
  M.levelTip = function (lv) {
    return ['DRIFT + PUMP', '+ SIGNAL UP/DOWN', '+ SHIELD B', 'OVERTIME: FASTER', 'FINAL: FASTEST'][lv] || '';
  };
  M.idle = function () { };
  M.cheat = function () {
    var s = sub();
    for (var i = 0; i < 4; i++) { s.freeze[i] = 0; s.alert[i] = 0; if (s.on[i]) quadAttr(i, Q[i].pal); }
    s.dp = 0; s.dv = 0; s.fuel = 40 * 256; s.mets = []; s.cool = 0;
    if (s.sig) s.sig.left = s.sig.max;
  };
  M.grade = function (R) {
    if (R.hurts <= 1) return 0;
    if (R.hurts <= 2) return 1;
    if (R.hurts <= 3) return 2;
    return 3;
  };
  M.titleOf = function (gi) { return ['OCTOPUS MIND', 'FOUR HANDS', 'STEADY JUGGLER', 'BUSY BEE', 'ONE THING AT A TIME'][gi]; };
  M.resultLines = function (R) {
    var s = sub();
    return ['HEARTS LOST ' + R.hurts, 'SIGNALS ' + C.pad(s.okSig, 3) + '  METEORS ' + C.pad(s.okMet, 3), 'TIME 150.0S'];
  };
  M.overLine = function () { return 'TIME   ' + C.timeText(sub().t) + 'S'; };
  M.stateOf = function () {
    var s = sub();
    if (!s) return null;
    return {
      t: s.t, lv: s.lv, on: s.on.slice(), fails: s.fails.slice(), freeze: s.freeze.slice(), dp: s.dp, dv: s.dv, wind: s.wind,
      fuel: s.fuel, crack: s.crack, sig: s.sig ? { dirs: s.sig.dirs.slice(), idx: s.sig.idx, left: s.sig.left } : null,
      mets: s.mets.map(function (m) { return { x: m.x, v: m.v }; }), cool: s.cool, okSig: s.okSig, okMet: s.okMet
    };
  };

  /* ---------------- 機器人：只用畫面上看得到的（L 幀前） ---------------- */
  M.observe = function () {
    var s = sub();
    return {
      t: s.t, on: s.on.slice(), fr: s.freeze.slice(), dp: s.dp, dv: s.dv, wind: s.windShown | 0, fuel: s.fuel, crack: s.crack > 0,
      sig: s.sig ? { dirs: s.sig.dirs.slice(), idx: s.sig.idx } : null,
      mets: s.mets.map(function (m) { return { x: m.x, v: m.v }; }), cool: s.cool
    };
  };
  M.bot = function (o, mem, now) {
    var m = 0, lag = C.g.bot.lag, prev = mem.prev || 0;
    mem.taps = mem.taps || {};
    function tap(b) {   // 按下邊緣：上一幀放開才能再按；同一鍵最少隔 6 幀
      if (prev & b) return 0;
      if (now - (mem.taps[b] || -99) < 6) return 0;
      mem.taps[b] = now; return b;
    }
    if (o.on[0] && !o.fr[0]) {
      var pred = o.dp + o.dv * Math.min(lag, 20);
      if (pred > 6 * 256) m |= BTN.LEFT; else if (pred < -6 * 256) m |= BTN.RIGHT;
    }
    if (o.on[1] && !o.fr[1]) {
      // 自己按過、但畫面還沒反映（L 幀內）的打油次數要算進去
      mem.pumps = (mem.pumps || []).filter(function (t) { return now - t <= lag; });
      var f = (o.fuel >> 8) - ((o.crack ? 72 : 36) * lag >> 8) + mem.pumps.length * 6;
      if (f < 34) { var ta = tap(BTN.A); if (ta) { m |= ta; mem.pumps.push(now); } }
    }
    if (o.on[2] && !o.fr[2] && o.sig) {
      // 同一個信號、同一格只按一次（等畫面更新到下一格再按）
      var key = o.t - 0;
      if (mem.sigIdx !== o.sig.idx || mem.sigLen !== o.sig.dirs.length || mem.sigT === undefined || o.t - mem.sigT > 30) {
        var b = o.sig.dirs[o.sig.idx] === 0 ? BTN.UP : BTN.DOWN;
        var tb = tap(b);
        if (tb) { m |= tb; mem.sigIdx = o.sig.idx; mem.sigLen = o.sig.dirs.length; mem.sigT = o.t; }
      }
      void key;
    } else if (!o.sig) { mem.sigIdx = -1; }
    if (o.on[3] && !o.fr[3] && o.cool === 0 && o.mets.length && now - (mem.blastT || -99) > lag + 4) {
      var mt = o.mets[0];
      var px = ((mt.x - mt.v * lag) >> 8) + 4;
      if (px >= ZONE0 + 8 && px <= ZONE1 - 6) { var tb2 = tap(BTN.B); if (tb2) { m |= tb2; mem.blastT = now; } }
    }
    // 十字鍵不能同時按上下 / 左右以外的矛盾組合：↑↓ 時暫時放開 ←→ 中與之衝突者無妨（斜向可按）
    mem.prev = m;
    return m;
  };

  BR.Modes = BR.Modes || [];
  BR.Modes[1] = M;
  BR.Multi = { M: M, STAGE: STAGE, LV: LV, OPENS: OPENS, ZONE: [ZONE0, ZONE1], TR: { safe: TR_SAFE, edge: TR_EDGE }, TK: { lo: TK_LO, hi: TK_HI, h: TK_H } };
})();
