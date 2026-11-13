/*
 * games/cart1/pinball/main.js — 《星塵彈珠台 STARDUST PINBALL》（合輯卡帶一 槽 4，id = pinball）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-3 cart1-arcade（R5）｜ 依賴：pinball/phys.js、art.js、song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/pinball.html（只取「擋板 / 保險桿 / 目標 / 倍率」玩法概念）
 *
 * 桌面「星雲燈塔」：256 × 448 px（兩張名稱表上下排：mirroring 'h'），畫面只看得到 200 px
 *   ⇒ 上方 24 線狀態列（scroll y = 440 顯示名稱表最底 3 列）+ 第 32 線 split 成桌面（y = 相機）。
 *   整張桌面在 init 時一次寫好（CT.blank 內），遊玩中只改燈號磚 / 狀態列數字 / 調色盤（每幀 < 40 byte）。
 *
 * 操作：← = 左擋板、A = 右擋板、↓ 或 B 按住蓄力 → 放開發射；球在場上時 B = 輕推台面（冷卻 1 秒）；START 暫停。
 *       球卡住 4 秒不動會自動輕推。
 * 規則：3 顆球。S-T-A-R 四條滾道全亮 → 倍率 +1（最高 x5；擋板可輪換已亮的滾道）。
 *       落下靶 3 片全倒 → 點亮 SAVE（下一次漏球救回）。立靶 3 片全亮 → 星洞大獎點亮。
 *       任務組合（依序）：M1 點亮 STAR / M2 保險桿 N 次 / M3 落下靶全倒 / M4 立靶全亮 / M5 進星洞
 *       ⇒ 全部完成 RANK +1（任務門檻與獎勵提高、開局救球時間縮短）。每顆新球開局有救球時間。
 * 密技（C / ★）：遊玩中 +1 顆球並點亮 SAVE；GAME OVER 時 = 原地續關（補回 3 顆球、保留分數與任務）；標題無效。機器人 goal：同一局 3 顆球內 ≥ GOAL_SCORE 分且未用密技。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PB = CT.Pinball = CT.Pinball || {};
  var P = PB.Phys, AU = PB.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var GOAL_SCORE = 30000;
  var BALLS = 3;
  var CAM_MAX = 448 - 200;
  var HUD_Y = 440;          // 上半段 scroll y（第 8 線 = 世界 y 448 = 狀態列第 1 列）
  var SPLIT = 32;           // 第 32 線起顯示桌面
  var PAL_BG = [[0x01, 0x11, 0x31], [0x06, 0x16, 0x26], [0x00, 0x14, 0x38], [0x00, 0x10, 0x30]];
  var PAL_FLASH = [0x16, 0x27, 0x30];
  var PAL_SPR = [[0x00, 0x10, 0x30], [0x07, 0x27, 0x37], [0x02, 0x22, 0x30], [0x05, 0x16, 0x28]];
  var MISSIONS = ['LIGHT S-T-A-R', 'BUMPERS', 'DROP ALL 3', 'MOON TARGETS', 'STAR HOLE'];

  var art = null, nes0 = null, g = null;

  function newGame() {
    return {
      mode: 'title', t: 0, titlePage: 0,
      w: null, score: 0, ball: 1, balls: BALLS, mult: 1, rank: 1,
      mission: 0, mprog: 0, missionsDone: 0,
      lanes: [0, 0, 0, 0], drops: [1, 1, 1], stands: [0, 0, 0], saveLit: false, jackpot: false,
      autoSave: 0, dropReset: 0, flash: 0, drainT: 0, pull: 0, pullHeld: false, paused: false,
      cam: CAM_MAX, bumps: 0, lanesDone: 0, bonusShow: 0, bonus: 0, msg: '', msgT: 0,
      cheated: false, cheatReq: false, nudgeCool: 0, nudges: 0, autoNudges: 0, lastX: 0, lastY: 0, stuck: 0, goalHit: false, overT: 0, played: 0,
      lightState: {}, hud: [], sprUsed: 0, bot: { t: 0, pull: 40, hold: [0, 0] }
    };
  }

  /* ---------------- 名稱表工具 ---------------- */
  function ntOf(row) { return row < 30 ? 0 : 2; }
  function setCell(col, row, tile) { nes0.ppu.setTile(ntOf(row), col, row % 30, tile); }
  function writeTableAll() {
    var ppu = nes0.ppu, T = art.T, r, c;
    ppu.mirroring('h');
    for (r = 0; r < 60; r++) for (c = 0; c < 32; c++) {
      var name = r < art.TABLE_ROWS ? T.map[r * 32 + c] : 'BLANK';
      setCell(c, r, art.tileOf(name));
    }
    for (r = 0; r < 30; r++) for (c = 0; c < 16; c++) ppu.setAttr(r < 15 ? 0 : 2, c, r % 15, T.attr[r * 16 + c]);
    // 狀態列底線（world row 58）
    for (c = 0; c < 32; c++) setCell(c, 58, art.tileOf('HUDBAR'));
    g.hud = [];
    g.lightState = {};
    art.LIGHTS.forEach(function (L) { g.lightState[L.id] = false; });
  }
  // 狀態列：只寫有變的格
  function hudText(row, col, str) {
    var t = art.textTiles(str), i, k;
    for (i = 0; i < t.length; i++) {
      k = row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      setCell(col + i, row, t[i]);
    }
  }
  function setLight(id, on) {
    on = !!on;
    if (g.lightState[id] === on) return;
    g.lightState[id] = on;
    var L = art.light(id);
    if (!L) return;
    for (var i = 0; i < L.cells.length; i++) setCell(L.cells[i][0], L.cells[i][1], art.tileOf(on ? L.on[i] : L.off[i]));
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }

  /* ---------------- 標題 ---------------- */
  function drawTitle() {
    var ppu = nes0.ppu, c, r, i;
    CT.blank(nes0, function () {
      ppu.split(null);
      ppu.scroll(0, 0, 0);
      ppu.mirroring('h');
      ppu.fillTiles(0, 0, 0, 32, 30, 0);
      ppu.fillAttr(0, 0, 0, 16, 15, 3);
      ppu.clearSprites();
      // 框
      ppu.setTile(0, 1, 2, art.tileOf('FR_TL')); ppu.setTile(0, 30, 2, art.tileOf('FR_TR'));
      ppu.setTile(0, 1, 27, art.tileOf('FR_BL')); ppu.setTile(0, 30, 27, art.tileOf('FR_BR'));
      for (c = 2; c < 30; c++) { ppu.setTile(0, c, 2, art.tileOf('FR_H')); ppu.setTile(0, c, 27, art.tileOf('FR_H')); }
      for (r = 3; r < 27; r++) { ppu.setTile(0, 1, r, art.tileOf('FR_V')); ppu.setTile(0, 30, r, art.tileOf('FR_V')); }
      text0(12, 4, 'STARDUST');
      var word = 'PINBALL';
      for (i = 0; i < word.length; i++) {
        var t = art.bigTiles(word.charAt(i)), x = 2 + 4 + i * 3, y = 6;
        ppu.setTile(0, x, y, t[0]); ppu.setTile(0, x + 1, y, t[1]); ppu.setTile(0, x, y + 1, t[2]); ppu.setTile(0, x + 1, y + 1, t[3]);
      }
      ppu.fillAttr(0, 1, 3, 14, 1, 2);
      text0(8, 9, 'NEBULA LIGHTHOUSE');
      // fix-r5 P3-5：說明每行之間空一列；§6-5：寫出回選單的方法
      text0(4, 11, 'LEFT/A  FLIPPERS  B NUDGE');
      text0(4, 13, 'DOWN/B LAUNCH  START PAUSE');
      text0(4, 15, 'STAR LANES   MULTIPLY');
      text0(4, 17, 'DROP ALL 3   BALL SAVE');
      text0(4, 19, '5 MISSIONS   RANK UP');
      text0(4, 21, 'HOLD START+SELECT: MENU');
      text0(4, 23, 'HI ' + pad(CT.load('pinball', 'best', 0), 7));
      text0(11, 25, 'PUSH START');
    });
  }
  function text0(col, row, s) {
    var t = art.textTiles(s);
    for (var i = 0; i < t.length; i++) nes0.ppu.setTile(0, col + i, row, t[i]);
  }

  function enterTitle() {
    g.mode = 'title'; g.t = 0;
    drawTitle();
    AU.play('pinball_title');
  }

  /* ---------------- 遊戲開始 / 球 ---------------- */
  function startGame() {
    var keepPlayed = g.played;
    var bot = g.bot;
    g = newGame();
    g.played = keepPlayed + 1;
    g.bot = bot;
    g.mode = 'play';
    g.w = P.create();
    CT.blank(nes0, function () {
      nes0.ppu.clearSprites();
      writeTableAll();
      applyLights();
      drawHud(true);
    });
    newBall();
    AU.play('pinball_play');
  }
  function newBall() {
    g.w.park();
    g.autoSave = 0;
    g.pull = 0;
    g.cam = CAM_MAX;
  }
  function applyLights() {
    var i;
    for (i = 0; i < 4; i++) setLight('lane' + i, g.lanes[i]);
    for (i = 0; i < 3; i++) setLight('drop' + i, g.drops[i]);
    for (i = 0; i < 3; i++) setLight('stand' + i, g.stands[i]);
    for (i = 2; i <= 5; i++) setLight('mult' + i, g.mult >= i);
    setLight('saucer', g.jackpot);
    setLight('save', g.saveLit || (g.autoSave > 0 && (g.t & 16)));
  }
  function missionNeed() {
    if (g.mission === 1) return 10 + g.rank * 5;
    return 1;
  }
  function drawHud(force) {
    if (force) g.hud = [];
    hudText(56, 1, 'SC ' + pad(g.score, 7));
    hudText(56, 12, 'x' + g.mult);
    hudText(56, 15, 'BALL' + Math.min(9, g.ball) + '/' + Math.min(9, g.balls));
    hudText(56, 24, 'RANK' + Math.min(9, g.rank));
    var line;
    if (g.paused) line = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.mode === 'over') line = (g.overT & 32) ? 'GAME OVER   PUSH START' : 'GAME OVER   ' + pad(g.score, 7);
    else if (g.msgT > 0) line = g.msg;
    else {
      line = 'M' + (g.mission + 1) + ' ' + MISSIONS[g.mission];
      if (g.mission === 1) line += ' ' + Math.min(g.mprog, missionNeed()) + '/' + missionNeed();
      if (g.w && g.w.ball.parked) line = padR(line, 21) + ((g.t & 32) ? 'LAUNCH' : '      ');
    }
    hudText(57, 1, padR(line, 30));
  }
  function message(s, t) { g.msg = s; g.msgT = t || 90; }

  function award(n) {
    g.score += n * g.mult;
    if (g.score > 9999999) g.score = 9999999;
    if (!g.cheated && g.score >= GOAL_SCORE && g.ball <= BALLS) g.goalHit = true;
  }
  function missionEvent(kind) {
    var m = g.mission, done = false;
    if (m === 0 && kind === 'star') done = true;
    else if (m === 1 && kind === 'bump') { g.mprog++; done = g.mprog >= missionNeed(); }
    else if (m === 2 && kind === 'drops') done = true;
    else if (m === 3 && kind === 'stands') done = true;
    else if (m === 4 && kind === 'hole') done = true;
    if (!done) return;
    award(5000 * g.rank);
    g.missionsDone++;
    AU.sfx('pinball_mission');
    g.mission++; g.mprog = 0;
    if (g.mission >= MISSIONS.length) {
      g.mission = 0; g.rank++;
      message('ALL MISSIONS!  RANK ' + g.rank, 150);
    } else message('MISSION CLEAR  +' + (5000 * (g.rank)) * g.mult, 100);
  }

  function handleEvents() {
    var ev = g.w.events, i, e, w = g.w;
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      switch (e.type) {
        case 'bumper':
          award(100 * g.rank); g.bumps++; g.flash = 5; AU.sfx('pinball_bump'); missionEvent('bump'); break;
        case 'sling': award(10); AU.sfx('pinball_sling'); break;
        case 'lane':
          if (!g.lanes[e.id]) {
            g.lanes[e.id] = 1; award(200); AU.sfx('pinball_lane');
            if (g.lanes[0] && g.lanes[1] && g.lanes[2] && g.lanes[3]) {
              g.lanes = [0, 0, 0, 0]; g.lanesDone++;
              award(1000);
              if (g.mult < 5) g.mult++;
              message('S-T-A-R!  MULTIPLIER x' + g.mult, 90);
              missionEvent('star');
            }
          }
          break;
        case 'drop':
          if (g.drops[e.id]) {
            g.drops[e.id] = 0; w.segs[dropSeg(e.id)].on = false; award(500); AU.sfx('pinball_drop');
            if (!g.drops[0] && !g.drops[1] && !g.drops[2]) {
              award(2500); g.saveLit = true; g.dropReset = 150;
              message('DROP BANK!  SAVE LIT', 90); missionEvent('drops');
            }
          }
          break;
        case 'standup':
          if (!g.stands[e.id]) {
            g.stands[e.id] = 1; award(300); AU.sfx('pinball_lane');
            if (g.stands[0] && g.stands[1] && g.stands[2]) {
              g.stands = [0, 0, 0]; g.jackpot = true; award(1500);
              message('MOONS!  STAR HOLE LIT', 90); missionEvent('stands');
            }
          } else award(50);
          break;
        case 'saucer':
          AU.sfx('pinball_hole');
          if (g.jackpot) { g.jackpot = false; award(10000 * g.rank); message('JACKPOT  ' + 10000 * g.rank * g.mult, 120); }
          else award(1000);
          missionEvent('hole');
          break;
        case 'eject': AU.sfx('pinball_sling'); break;
        case 'repark': g.pull = 0; break;
        case 'drain': onDrain(); break;
      }
    }
  }
  function dropSeg(i) {
    var s = g.w.segs, k;
    for (k = 0; k < s.length; k++) if (s[k].kind === 'drop' && s[k].id === i) return k;
    return 0;
  }
  function onDrain() {
    if (g.autoSave > 0 || g.saveLit) {
      if (g.autoSave <= 0) g.saveLit = false;
      g.autoSave = 0;
      AU.sfx('pinball_save');
      message('BALL SAVED!', 90);
      newBall();
      return;
    }
    AU.sfx('pinball_drain');
    g.bonus = (g.bumps * 10 + g.lanesDone * 500 + g.missionsDone * 1000) * g.mult;
    g.score = Math.min(9999999, g.score + g.bonus);
    if (!g.cheated && g.score >= GOAL_SCORE && g.ball <= BALLS) g.goalHit = true;
    message('BONUS ' + g.bonus, 120);
    g.drainT = 120;
  }
  function afterDrain() {
    g.ball++;
    g.mult = 1; g.bumps = 0; g.lanesDone = 0;
    if (g.ball > g.balls) { enterOver(); return; }
    newBall();
  }
  function saveBest() {
    if (!g) return;
    var best = CT.load('pinball', 'best', 0);
    if (g.score > best) CT.save('pinball', 'best', g.score);
  }
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    saveBest();
    AU.play('pinball_over');
  }

  /* ---------------- 每幀 ---------------- */
  function saveFrames() { return Math.max(180, 600 - (g.rank - 1) * 120); }

  function updatePlay() {
    var I = NES.Input, w = g.w, b = w.ball;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused; drawHud();
      if (g.paused) AU.pause(); else AU.resume();     // fix-r5 §6-2：暫停 = BGM 停，恢復接續
    }
    if (g.paused) return;
    g.t++;
    var left = I.held(BTN.LEFT), right = I.held(BTN.A);
    if (I.pressed(BTN.LEFT) || I.pressed(BTN.A)) {
      AU.sfx('pinball_flip');
      // 滾道輪換（亮燈左右移）
      if (!b.parked) {
        var L = g.lanes;
        g.lanes = I.pressed(BTN.LEFT) ? [L[1], L[2], L[3], L[0]] : [L[3], L[0], L[1], L[2]];
      }
    }
    w.setFlip(0, left); w.setFlip(1, right);
    // 發射桿
    if (b.parked && g.drainT === 0) {
      var pullKey = I.held(BTN.DOWN) || I.held(BTN.B);
      if (pullKey) { if (g.pull < P.PLUNGER.maxPull) g.pull++; }
      else if (g.pull > 0) {
        w.launch(g.pull);
        AU.sfx('pinball_launch');
        g.pull = 0;
        if (g.autoSave <= 0) g.autoSave = saveFrames();
      }
    }
    if (g.drainT > 0) {
      if (--g.drainT === 0) afterDrain();
    } else {
      w.step();
      handleEvents();
    }
    if (g.autoSave > 0 && !b.parked) g.autoSave--;
    // B = 輕推台面（冷卻 60 幀）；球卡住 240 幀不動 ⇒ 自動輕推（不讓遊戲卡死）
    if (g.nudgeCool > 0) g.nudgeCool--;
    if (!b.parked && b.live && b.held === 0) {
      var still = Math.abs(b.x - g.lastX) < 512 && Math.abs(b.y - g.lastY) < 512;
      if (!still) { g.lastX = b.x; g.lastY = b.y; g.stuck = 0; }
      else if (++g.stuck > 240 && !(left || right)) { g.stuck = 0; nudge(b, true); }
      if (I.pressed(BTN.B) && g.nudgeCool === 0) nudge(b, false);
    }
    if (g.dropReset > 0 && --g.dropReset === 0) {
      g.drops = [1, 1, 1];
      for (var i = 0; i < 3; i++) w.segs[dropSeg(i)].on = true;
      if (w.penetration() > 0) { for (i = 0; i < 3; i++) w.segs[dropSeg(i)].on = false; g.drops = [0, 0, 0]; g.dropReset = 20; }
    }
    if (g.msgT > 0) g.msgT--;
    if (g.flash > 0) g.flash--;
    // 相機
    var target = b.parked ? CAM_MAX : (b.y >> 8) - 110;
    if (target < 0) target = 0;
    if (target > CAM_MAX) target = CAM_MAX;
    var d = target - g.cam;
    if (d > 24 || d < -24) g.cam += d > 0 ? d - 24 : d + 24;
    else g.cam += (d > 0 ? (d + 1) >> 1 : -((-d + 1) >> 1));
  }

  function drawPlaySprites() {
    var ppu = nes0.ppu, w = g.w, b = w.ball, n = 0, cam = g.cam;
    function spr(x, y, tile, pal, flipH) {
      var sy = y - cam + SPLIT;
      if (sy < SPLIT - 2 || sy > 239 || x < -8 || x > 255) return;
      ppu.sprite(n++, { x: x, y: sy, tile: tile, pal: pal, flipH: !!flipH });
    }
    // 球
    if (b.live || g.drainT > 0) {
      var bx = (b.x >> 8) - 4, by = (b.y >> 8) - 4;
      if (by - cam + SPLIT >= SPLIT) spr(bx, by, art.spr.index('BALL'), 0);
    }
    // 發射桿
    var pl = g.pull > 32 ? 2 : (g.pull > 12 ? 1 : 0);
    spr(232, 440 + (pl * 2), art.spr.index('PL' + pl), 3);
    // 擋板
    for (var k = 0; k < 2; k++) {
      var f = w.flips[k], fr = art.flipFrameFor(f.a), tiles = art.flipTiles[fr];
      var px = f.px >> 8, py = f.py >> 8;
      var ox = k === 0 ? px - art.FLIP_PX : px - (24 - art.FLIP_PX), oy = py - art.FLIP_PY;
      for (var t = 0; t < 9; t++) {
        if (tiles[t] < 0) continue;
        var tx = t % 3, ty = (t / 3) | 0;
        if (k === 0) spr(ox + tx * 8, oy + ty * 8, tiles[t], 1, false);
        else spr(ox + (2 - tx) * 8, oy + ty * 8, tiles[t], 1, true);
      }
    }
    for (var i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
  }

  function nudge(b, auto) {
    b.vy -= 384; b.vx += (g.t & 1) ? 256 : -256;
    g.nudgeCool = 60; g.nudges++;
    if (auto) g.autoNudges++;
    AU.sfx('pinball_sling');
  }

  // 密技（fix-r5 §6-1）：遊玩中 = +1 顆球並點亮 SAVE；GAME OVER = 原地續關（球數補回 3 顆，分數 / 任務 / RANK / 燈號全保留）
  function doCheat() {
    if (g.mode === 'over') {
      g.mode = 'play'; g.overT = 0; g.paused = false;
      g.ball = 1; g.balls = BALLS; g.drainT = 0; g.cheated = true; g.continues = (g.continues || 0) + 1;
      newBall();
      message('STAR POWER!  CONTINUE', 120);
      AU.sfx('pinball_save');
      AU.play('pinball_play');
      return true;
    }
    if (g.mode !== 'play') return false;
    g.balls++; g.saveLit = true; g.cheated = true;
    message('STAR POWER!  +1 BALL', 90);
    AU.sfx('pinball_save');
    return true;
  }

  /* ---------------- 機器人 ---------------- */
  function botMask() {
    var B = g.bot, m = 0;
    B.t++;
    if (g.mode === 'title') return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.mode === 'over') return (g.overT > 90 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    var w = g.w, b = w.ball;
    if (b.parked) {
      if (g.drainT > 0) return 0;
      if (g.pull < B.pull) return BTN.DOWN;
      B.pull = 30 + ((B.t * 7) % 19);
      return 0;
    }
    var bx = b.x >> 8, by = b.y >> 8, vy = b.vy;
    for (var k = 0; k < 2; k++) {
      var f = P.FLIPPERS[k];
      var near = k === 0 ? (bx >= f.x - 6 && bx <= f.x + 22) : (bx >= f.x - 22 && bx <= f.x + 6);
      var hit = near && by >= 376 && by <= 410 && vy > -256;
      // 依球的位置挑時機：靠尖端早打、靠支點晚打（讓球射向不同方向）
      if (hit && B.hold[k] === 0) B.hold[k] = 10;
      if (B.hold[k] > 0) { B.hold[k]--; if (B.hold[k] > 2) m |= (k === 0 ? BTN.LEFT : BTN.A); }
    }
    return m;
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'pinball', order: 4, title: '星塵彈珠台', legacy: ['pinball.html'],
    init: function (nes, opt) {
      nes0 = nes;
      art = PB.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'pinball_bg');
      NES.CHR.setPattern(1, 'pinball_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      ppu.setBackdrop(0x0F);
      for (var i = 0; i < 4; i++) { ppu.setBgPalette(i, PAL_BG[i]); ppu.setSprPalette(i, PAL_SPR[i]); }
      GAME.backTile = { tile: art.spr.index('BALL'), pal: 0 };   // fix-r5 §6-4：回選單提示用銀色彈珠
      AU.init(nes);
      g = newGame();
      if (opt && opt.start) startGame(); else enterTitle();
    },
    update: function (nes) {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) startGame();
      } else if (g.mode === 'play') {
        updatePlay();
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 60 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) { AU.stop(); enterTitle(); }
      }
      AU.tick();
    },
    draw: function (nes) {
      var ppu = nes.ppu;
      if (g.mode === 'title') {
        // 標題：PUSH START 閃爍（調色盤 3 的亮色切換 1 byte）
        if ((g.t & 31) === 0) text0(11, 25, (g.t & 32) ? '          ' : 'PUSH START');
        return;
      }
      ppu.scroll(0, HUD_Y, 0);
      ppu.split(SPLIT, { x: 0, y: g.cam, nt: 0 });
      if (!g.paused) {
        applyLights();
        ppu.setBgPalette(1, g.flash > 0 ? PAL_FLASH : PAL_BG[1]);
        drawHud();
      }
      drawPlaySprites();
    },
    state: function () {
      var b = g.w ? g.w.ball : null;
      return {
        mode: g.mode, score: g.score, ball: g.ball, balls: g.balls, mult: g.mult, rank: g.rank,
        mission: g.mission, missionsDone: g.missionsDone, cam: g.cam, paused: g.paused,
        bx: b ? b.x >> 8 : null, by: b ? b.y >> 8 : null, parked: b ? b.parked : null,
        saveLit: g.saveLit, autoSave: g.autoSave, goal: g.goalHit && !g.cheated, cheated: g.cheated, continues: g.continues || 0, goalScore: GOAL_SCORE,
        maxPen: g.w ? g.w.maxPen : 0, nudges: g.nudges, autoNudges: g.autoNudges
      };
    },
    exit: function () { saveBest(); AU.stop(); },     // fix-r5 §6-3：中途離開也存最高分
    cheat: function () { if (!g || (g.mode !== 'play' && g.mode !== 'over')) return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return pad(Math.min(999999, Math.max(0, CT.load('pinball', 'best', 0) | 0)), 6); }   // R6 §1-6：右對齊 6 字元
  };
  PB.GOAL_SCORE = GOAL_SCORE;
  PB.dev = {
    g: function () { return g; },
    world: function () { return g && g.w; },
    start: function () { startGame(); },
    award: award,
    missionEvent: missionEvent
  };
  if (CT.register) CT.register(GAME);
})();
