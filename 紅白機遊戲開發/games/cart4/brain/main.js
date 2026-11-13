/*
 * games/cart4/brain/main.js — 《星塵腦力 STAR BRAIN》（合輯卡帶四 槽 7，id = brain）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-4 cart4-brain（R8）｜ 依賴：brain/{art,song,core,dual,multi,track,tilt}.js、games/cart1/registry.js
 * 舊作概念來源（只取玩法）：dual-hand-sync / multitask-challenge / time-space-tracker / gravity-sense。
 *
 * 四個訓練室（每個都有等級、合格線、結算評價 S/A/B/C/D、最佳評價存檔、可從已到達的等級開始）：
 *   1 TWIN SYNC  雙手同步  左半十字鍵開星艇閃隕石、右半 A/B 分揀晶礦 / 廢渣；8 級 × 20 秒（dual.js）
 *   2 JUGGLE     多工      四格控制台 DRIFT ←→ / PUMP A / SIGNAL ↑↓ / SHIELD B，2 → 3 → 4 件同時；
 *                          90 秒 = 任務達成（goal），之後加速撐到 150 秒（multi.js）
 *   3 TRACER     時空追蹤  記住彗星在星格盤上的移動軌跡，回答「現在在哪 / 第 N 步在哪」；盲段只給箭頭；8 級（track.js）
 *   4 TILT       重力感應  十字鍵傾斜星盤，星珠以定點數物理滾到星門，避開黑洞；8 張盤（tilt.js）
 * 畫面規格：一層背景 + 一條 split（HUD 固定、下方場地可捲動 / 傾斜位移）；分區靠名稱表 + 屬性（每區自己的調色盤組）。
 *   每線精靈由各模式設計保證 ≤ 8（見各檔檔頭），OAM 62 / 63 不用（shell 回選單提示）。
 * VBlank：名稱表 / 屬性全部走 core.js 佇列（每幀 ≤ 140 byte）；換畫面在 CT.blank 內整片重畫。
 * 流程：標題 → 說明頁（規則 + 手把圖 + 選起始等級）→ 每級 READY 倒數（A 可跳過）→ 遊玩 → 合格 / GAME OVER → 結算評價。
 * 密技（C / ★）：遊玩中 = 各模式「立刻補強」（補滿愛心 + 模式加料）；GAME OVER = 原地續關（同一級 / 同一時間點，愛心補滿）；
 *   標題 / 說明 / 結算無效。用過密技的那一局不算 goal。goal = JUGGLE 模式撐過 90 秒（5409 幀）且未用密技。
 * 機器人（?bot=1）：人類反應延遲 L 幀（預設 15，`&lag=N` 可改；測試另驗 0 與 24）——外界物件一律從 L 幀前的「畫面觀察」讀，
 *   自己的手（游標 / 星艇所在跑道）用目前值；記憶類只記展示當下畫面上看得到的東西。`&botmode=1..4` 指定機器人玩哪個模式。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var BR = CT.Brain = CT.Brain || {};
  var C = BR.C, AU = BR.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var GRADES = ['S', 'A', 'B', 'C', 'D'];
  var GOAL_FRAMES = Math.round(90 * 60.0988);   // 5409
  var HUD1 = 1, HUD2 = 2, HUD3 = 3;
  var READY_T = 40;                              // 3 2 1 每拍幀數
  var TITLE_PAL = {
    bd: 0x0F,
    bg: [[0x00, 0x10, 0x30], [0x04, 0x14, 0x34], [0x0B, 0x1B, 0x3B], [0x08, 0x28, 0x38]],
    spr: [[0x16, 0x27, 0x38], [0x04, 0x24, 0x34], [0x0B, 0x2B, 0x3B], [0x00, 0x10, 0x30]]
  };

  var g = null;
  function modes() { return BR.Modes || []; }
  function newState() {
    return {
      mode: 'title', t: 0, sel: 1, paused: false, cheatReq: false, run: null, sub: null,
      msg: '', msgT: 0, howLv: 0, overT: 0, newBest: false, runsTotal: 0,
      goal: false, flash: 0, bot: { t: 0, hist: [], mem: {}, lag: 15 }
    };
  }

  /* ---------------- 存檔 ---------------- */
  function gradeOf(key) { var v = CT.load('brain', 'grade_' + key, 5); return v === null ? 5 : v | 0; }
  function reachOf(key) { return CT.load('brain', 'reach_' + key, 0) | 0; }
  function saveBest() {
    if (!g || !g.run) return false;
    var best = CT.load('brain', 'best', 0) | 0;
    if (g.run.score > best) { CT.save('brain', 'best', g.run.score); return true; }
    return false;
  }
  function saveReach() {
    var R = g.run, M = modes()[R.m];
    if (!M.levelSelect) return;
    if (R.lv > reachOf(M.key)) CT.save('brain', 'reach_' + M.key, Math.min(R.lv, M.levels - 1));
  }

  /* ---------------- 共用 API（給模式用） ---------------- */
  C.say = function (s, t) { g.msg = s; g.msgT = t || 90; };
  C.addScore = function (n) { if (g.run) g.run.score = Math.min(999999, g.run.score + (n | 0)); };
  C.hurt = function (why) {
    var R = g.run;
    if (!R || R.hearts <= 0) return;
    R.hearts--; R.hurts++;
    g.flash = 12;
    AU.sfx('brain_hit');
    if (why) C.say(why, 80);
  };
  C.heal = function (n) { var R = g.run, M = modes()[R.m]; R.hearts = Math.min(M.hearts, R.hearts + (n || 1)); };
  C.run = function () { return g.run; };
  C.goalNow = function () {   // 由 multi.js 呼叫：撐過 90 秒
    if (g.run && !g.run.cheated) g.goal = true;
  };
  C.GOAL_FRAMES = GOAL_FRAMES;

  /* ---------------- 標題 ---------------- */
  // fix-r8（qa-r8 P3-2 / P3-3）：外框從名稱表列 2 起（不貼可見區 y = 0）；模式一列一個、之間空一列，副標只寫選中的那一項
  function titleRow(i) { return 11 + i * 2; }
  var TITLE_SUB_ROW = 19;
  function drawTitleSub() { C.text(3, TITLE_SUB_ROW, C.padR('', 26)); var s = '- ' + modes()[g.sel].sub + ' -'; C.center(TITLE_SUB_ROW, s); }
  function modeLine(i) {
    var M = modes()[i];
    return (i + 1) + ' ' + C.padR(M.name, 11) + 'BEST ' + (gradeOf(M.key) < 5 ? GRADES[gradeOf(M.key)] : '-');
  }
  // fix-r8（qa-r8 P2-7）：觸控十字鍵四方向 / 八方向。TILT 要斜向傾斜 → 8；其他（選單 / TWIN / JUGGLE 的 SIGNAL / TRACER 游標）→ 4。
  // engine 沒有 setWays 也不能報錯；exit 設回 8。
  function touchWays(n) { try { if (NES.Touch && NES.Touch.setWays) NES.Touch.setWays(n); } catch (e) { } }
  function enterTitle() {
    touchWays(4);
    g.mode = 'title'; g.t = 0; g.run = null; g.sub = null; g.paused = false;
    C.redraw(function () {
      C.frame(1, 2, 30, 26);
      C.big(6, 4, 'STAR BRAIN');
      C.center(7, 'SPLIT MIND TRAINING LAB');
      C.center(9, 'BEST SCORE ' + C.pad(CT.load('brain', 'best', 0) | 0, 6));
      for (var i = 0; i < modes().length; i++) C.text(6, titleRow(i), modeLine(i));
      drawTitleSub();
      C.text(4, 21, 'UP/DOWN MODE  A/START GO');
      C.text(4, 23, 'HOLD START+SELECT: MENU');
      C.text(4, 25, 'C/$ = CHEAT');
      // 標題大字紫、模式清單 + 副標青；選到的那一列橘
      C.fillA(1, 1, 14, 3, 1);
      C.fillA(1, 5, 14, 5, 2);
      selAttr(g.sel, 3);
    }, TITLE_PAL);
    AU.play('brain_title');
  }
  function selAttr(i, p) { var r = titleRow(i); for (var c = 2; c < 15; c++) C.putA(c, r >> 1, p); }

  /* ---------------- 說明頁：規則 + 手把圖 + 起始等級 ---------------- */
  function enterHowto(m) {
    var M = modes()[m];
    g.mode = 'howto'; g.t = 0; g.sel = m;
    g.howLv = M.levelSelect ? reachOf(M.key) : 0;
    C.redraw(function () {
      C.frame(1, 2, 30, 26);
      C.center(3, M.name);
      C.center(4, M.sub);
      for (var i = 0; i < M.rules.length; i++) C.text(3, 6 + i, M.rules[i]);
      // 手把圖（按鍵對照）：十字鍵 + SELECT/START + B A，下方寫各鍵的用途
      var py = 14;
      C.frame(3, py, 26, 6);
      C.put4(5, py + 1, 'PAD_');
      C.put(19, py + 2, C.t('BTN')); C.put(25, py + 2, C.t('BTN'));
      C.text(19, py + 1, 'B'); C.text(25, py + 1, 'A');
      C.text(10, py + 2, 'SEL STA');
      for (i = 0; i < M.pad.d.length; i++) C.text(4, py + 3 + i, M.pad.d[i]);
      C.text(19 - (M.pad.b.length >> 1), py + 3, M.pad.b);
      C.text(25 - (M.pad.a.length >> 1), py + 3, M.pad.a);
      C.text(3, 22, M.goalLine);
      C.text(3, 24, M.levelSelect ? 'A GO  B BACK  L/R LEVEL' : 'A GO  B BACK');
      C.text(3, 26, 'HOLD START+SELECT: MENU');
      C.fillA(1, 1, 14, 2, 3);
      C.fillA(2, 7, 12, 3, 2);
    }, TITLE_PAL);
    drawHowLv();
  }
  function drawHowLv() {
    var M = modes()[g.sel];
    if (M.levelSelect) C.text(3, 21, 'START LEVEL ' + (g.howLv + 1) + ' OF ' + M.levels + '   ');
    else C.text(3, 21, M.levelNote || '');
  }

  /* ---------------- 一局 / 一級 ---------------- */
  function startRun(m, lv) {
    var M = modes()[m];
    g.runsTotal++;
    touchWays(M.ways || 4);
    var qs = CT.query ? parseInt(CT.query('seed') || '', 10) : NaN;
    C.seed(isNaN(qs) ? (0x1357 + g.runsTotal * 7919 + m * 131) : qs);
    g.run = { m: m, key: M.key, lv: lv || 0, startLv: lv || 0, score: 0, hearts: M.hearts, hurts: 0, cheated: false, continues: 0, lvScores: [], stat: {} };
    startLevel();
  }
  function startLevel() {
    var R = g.run, M = modes()[R.m];
    g.mode = 'ready'; g.t = 0; g.paused = false; g.msg = ''; g.msgT = 0; g.flash = 0;
    g.sub = null;
    M.enter(R.lv);          // 模式自己 redraw 場地（含 HUD 列底與調色盤）
    g.bdNow = M.pal.bd;
    g.sub = C.g.sub;
    drawHud();
    AU.play(M.song);
  }
  function beginPlay() { g.mode = 'play'; g.t = 0; var M = modes()[g.run.m]; if (M.begin) M.begin(); }
  function levelPassed() {
    var R = g.run, M = modes()[R.m];
    g.mode = 'lvlend'; g.t = 0;
    R.lvScores[R.lv] = (R.lvScores[R.lv] || 0) + 1;
    AU.play('brain_clear');
    if (R.lv + 1 >= M.levels) { g.sub.last = true; C.say(M.finalMsg || 'ALL LEVELS CLEAR!', 120); }
    else C.say('LEVEL ' + (R.lv + 1) + ' CLEAR!', 120);
    if (M.onPass) M.onPass(R.lv);
  }
  function afterLevel() {
    var R = g.run, M = modes()[R.m];
    if (R.lv + 1 >= M.levels) { enterResult(); return; }
    R.lv++;
    saveReach();
    if (M.heartPerLevel) C.heal(M.heartPerLevel);
    startLevel();
  }
  function gradeNow() {
    var R = g.run, M = modes()[R.m];
    var gi = C.clamp(M.grade(R) | 0, 0, 4);
    if (R.startLv > 0 && gi < 2) gi = 2;          // 不是從第 1 級開始：評價最高 B
    return gi;
  }
  function enterOver(why) {
    var R = g.run, M = modes()[R.m];
    g.mode = 'over'; g.overT = 0; g.newBest = saveBest(); saveReach();
    AU.play('brain_over');
    C.redraw(function () {
      C.frame(3, 4, 26, 21);
      C.center(7, 'GAME OVER');
      C.center(9, why || '');
      C.text(6, 11, 'MODE   ' + M.name);
      C.text(6, 13, 'LEVEL  ' + (R.lv + 1) + ' OF ' + M.levels);
      C.text(6, 15, 'SCORE  ' + C.pad(R.score, 6) + (g.newBest ? ' NEW!' : ''));
      if (M.overLine) C.text(6, 17, M.overLine(R));
      C.text(5, 20, 'C/$ = CONTINUE HERE');
      C.text(5, 22, 'START = TITLE');
      C.fillA(2, 3, 12, 2, 3);
    }, TITLE_PAL);
  }
  function enterResult() {
    var R = g.run, M = modes()[R.m], gi = gradeNow();
    g.mode = 'result'; g.overT = 0; g.newBest = saveBest();
    R.grade = GRADES[gi];
    if (!R.cheated) {
      var old = gradeOf(M.key);
      if (gi < old) CT.save('brain', 'grade_' + M.key, gi);
      CT.save('brain', 'reach_' + M.key, M.levelSelect ? M.levels - 1 : 0);
    }
    AU.play('brain_clear');
    C.redraw(function () {
      C.frame(3, 3, 26, 23);
      C.center(5, M.name + ' COMPLETE');
      C.text(7, 8, 'GRADE');
      C.put4(14, 7, 'BIG_' + GRADES[gi]);
      C.center(10, M.titleOf ? M.titleOf(gi) : '');
      C.text(6, 12, 'SCORE  ' + C.pad(R.score, 6) + (g.newBest ? ' NEW!' : ''));
      var ls = M.resultLines ? M.resultLines(R) : [];
      for (var i = 0; i < ls.length; i++) C.text(6, 14 + i * 2, ls[i]);
      C.text(6, 22, R.cheated ? 'CHEAT USED: NOT SAVED' : 'GRADE SAVED');
      C.text(6, 24, 'START = TITLE');
      C.fillA(7, 3, 2, 2, 3);
    }, TITLE_PAL);
  }

  /* ---------------- HUD（第 1~3 列，固定不捲） ---------------- */
  function drawHud() {
    var R = g.run, M = R ? modes()[R.m] : null;
    if (!R) return;
    var HR = M.hudRows || [1, 2, 3];
    HUD1 = HR[0]; HUD2 = HR[1]; HUD3 = HR[2];
    C.text(1, HUD1, C.padR(M.short, 7) + 'LV' + (R.lv + 1) + ' SC' + C.pad(R.score, 6) + (R.cheated ? '$' : ' '));
    for (var i = 0; i < 5; i++) C.put(26 + i, HUD1, i < M.hearts ? C.t(i < R.hearts ? 'HT1' : 'HT0') : 0);
    var line2;
    if (g.mode === 'ready') line2 = M.levelTip ? M.levelTip(R.lv) : '';
    else line2 = M.hud2 ? M.hud2() : null;
    if (line2 !== null) C.text(1, HUD2, C.padR(line2, 30));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) line = g.msg;
    else if (g.mode === 'ready') {
      var n = 3 - Math.floor(g.t / READY_T);
      line = n > 0 ? 'READY ' + n + '   A = GO NOW' : 'GO!';
    } else line = M.hint ? M.hint() : '';
    C.text(1, HUD3, C.padR(line, 30));
  }

  /* ---------------- 主迴圈 ---------------- */
  function updateRun() {
    var I = NES.Input, M = modes()[g.run.m];
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    if (g.flash > 0) g.flash--;
    if (g.mode === 'ready') {
      if (M.idle) M.idle();
      if (g.t >= READY_T * 3 + 10 || (g.t > 15 && I.pressed(BTN.A))) beginPlay();
      return;
    }
    if (g.mode === 'lvlend') { if (M.idle) M.idle(); if (g.t > 110) afterLevel(); return; }
    var r = M.tick(I);
    if (g.run.hearts <= 0) { enterOver(M.overWhy || 'OUT OF HEARTS'); return; }
    if (r === 1) levelPassed();
    else if (r === -1) enterOver(M.failWhy ? M.failWhy() : 'NORM FAILED');
  }
  function doCheat() {
    var m = g.mode, R = g.run, M = R && modes()[R.m];
    if (!R) return;
    if (m === 'over') {
      R.cheated = true; R.continues++;
      R.hearts = M.hearts;
      startLevel();
      C.say('CONTINUE! LEVEL ' + (R.lv + 1), 90);
      return;
    }
    if (m === 'play' || m === 'ready' || m === 'lvlend') {
      R.cheated = true;
      R.hearts = M.hearts;
      if (M.cheat) M.cheat();
      C.say('STAR MIND! HEARTS FULL', 80);
      AU.sfx('brain_ok');
    }
  }

  /* ---------------- 機器人（反應延遲 L 幀；外界只讀 L 幀前的觀察） ---------------- */
  function botMask() {
    var B = g.bot, I = 0;
    B.t++;
    var want = parseInt(CT.query ? (CT.query('botmode') || '2') : '2', 10) - 1;
    if (!(want >= 0 && want < modes().length)) want = 1;
    if (g.mode === 'title') {
      B.hist = []; B.mem = {};
      if (g.sel !== want) return (B.t % 10 === 0) ? BTN.DOWN : 0;
      return (B.t % 30 === 15) ? BTN.A : 0;
    }
    if (g.mode === 'howto') return (B.t % 30 === 15) ? BTN.A : 0;
    if (g.mode === 'over' || g.mode === 'result') { B.hist = []; B.mem = {}; return (g.overT > 90 && B.t % 40 === 20) ? BTN.START : 0; }
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    var M = modes()[g.run.m];
    // 觀察（每幀一份，畫面上看得到的東西）
    var obs = (g.mode === 'play' && M.observe) ? M.observe() : null;
    B.hist.push(obs);
    var L = B.lag;
    while (B.hist.length > L + 1) B.hist.shift();
    if (g.mode !== 'play') return 0;
    var seen = B.hist.length > L ? B.hist[0] : null;
    if (!seen) return 0;
    I = M.bot(seen, B.mem, B.t) || 0;
    return I & ~(BTN.START | BTN.SELECT);
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'brain', order: 7, title: '星塵腦力',
    legacy: ['dual-hand-sync.html', 'multitask-challenge.html', 'time-space-tracker.html', 'gravity-sense.html'],
    init: function (nes) {
      C.nes = nes;
      C.art = BR.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'brain_bg');
      NES.CHR.setPattern(1, 'brain_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      GAME.backTile = { tile: C.s('STARS'), pal: 0 };
      AU.init(nes);
      g = newState();
      C.g = g;
      var lag = CT.query ? parseInt(CT.query('lag') || '', 10) : NaN;
      if (lag >= 0 && lag <= 60) g.bot.lag = lag;
      enterTitle();
      var qm = CT.query ? parseInt(CT.query('gmode') || '', 10) : NaN;
      if (qm >= 1 && qm <= modes().length) {
        g.sel = qm - 1;
        startRun(qm - 1, C.clamp((parseInt(CT.query('lv') || '1', 10) || 1) - 1, 0, modes()[qm - 1].levels - 1));
      }
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        var d = (I.pressed(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START))) ? 1 : (I.pressed(BTN.UP) ? -1 : 0);
        if (d) { selAttr(g.sel, 2); g.sel = (g.sel + d + modes().length) % modes().length; selAttr(g.sel, 3); drawTitleSub(); AU.sfx('brain_move'); }
        if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) { AU.sfx('brain_ok'); enterHowto(g.sel); }
      } else if (g.mode === 'howto') {
        g.t++;
        var M = modes()[g.sel];
        if (M.levelSelect) {
          var mx = reachOf(M.key);
          if (I.pressed(BTN.LEFT) && g.howLv > 0) { g.howLv--; drawHowLv(); AU.sfx('brain_move'); }
          if (I.pressed(BTN.RIGHT) && g.howLv < mx) { g.howLv++; drawHowLv(); AU.sfx('brain_move'); }
        }
        if (g.t > 8 && I.pressed(BTN.B)) { enterTitle(); }
        else if (g.t > 8 && ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A))) { AU.sfx('brain_ok'); startRun(g.sel, g.howLv); }
      } else if (g.mode === 'over' || g.mode === 'result') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updateRun();
      AU.tick();
    },
    draw: function () {
      C.sprBegin();
      C.oy = 0;
      if (g.mode === 'title') {
        if ((g.t & 15) < 12) C.spr(36, titleRow(g.sel) * 8, C.s('PTR'), 0);
      } else if (g.mode === 'ready' || g.mode === 'play' || g.mode === 'lvlend') {
        var M = modes()[g.run.m];
        C.oy = M.hudShift ? C.SHIFT : 0;
        drawHud();
        M.draw(g.mode, g.paused);
        var bd = (g.flash > 0 && (g.flash & 4)) ? 0x06 : M.pal.bd;
        if (bd !== g.bdNow) { C.nes.ppu.setBackdrop(bd); g.bdNow = bd; }
      }
      C.sprEnd();
      C.flush();
    },
    state: function () {
      var R = g.run, M = R ? modes()[R.m] : null;
      return {
        mode: g.mode, sel: g.sel, t: g.t, paused: g.paused, howLv: g.howLv, msg: g.msgT > 0 ? g.msg : '',
        run: R ? { m: R.m, key: R.key, lv: R.lv, score: R.score, hearts: R.hearts, hurts: R.hurts, cheated: R.cheated, continues: R.continues, grade: R.grade || null } : null,
        sub: (M && M.stateOf) ? M.stateOf() : null,
        goal: !!g.goal, queue: C.q.length + C.qa.length, peakQ: C.peakQ, sprUsed: C.sprUsed, lag: g.bot.lag
      };
    },
    exit: function () { saveBest(); AU.stop(); touchWays(8); },
    cheat: function () {
      if (!g || g.mode === 'title' || g.mode === 'howto' || g.mode === 'result') return false;
      g.cheatReq = true; return true;
    },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goal); },
    bestText: function () { return C.pad(Math.min(999999, CT.load('brain', 'best', 0) | 0), 6); }
  };
  BR.GRADES = GRADES;
  BR.GOAL_FRAMES = GOAL_FRAMES;
  BR.dev = {
    g: function () { return g; },
    start: function (m, lv) { startRun(m, lv || 0); }, begin: function () { beginPlay(); },
    title: function () { enterTitle(); }, howto: function (m) { enterHowto(m); },
    over: function () { enterOver('TEST'); }, result: function () { enterResult(); }, pass: function () { levelPassed(); },
    afterLevel: function () { afterLevel(); }
  };
  if (CT.register) CT.register(GAME);
})();
