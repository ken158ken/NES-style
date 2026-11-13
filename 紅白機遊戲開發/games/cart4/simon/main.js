/*
 * games/cart4/simon/main.js — 《星塵跟我做 STAR ECHO》（合輯卡帶四，id = simon，全域 CT.Simon）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-2 cart4-sound（R8）｜ 依賴：engine/*、games/cart1/registry.js、simon/{art,song}.js
 * 舊作概念：memory-simon / sound-simon / color-sequence-memory / tap-sequence（只取「看 / 聽一串 → 照順序按回去、
 *           每回合加一步」的玩法；外觀不是圓盤四色扇形，而是十字排列的四顆星標天體，名稱 / 美術 / 配樂全原創）。
 *
 * 操作：十字鍵 = 四顆星標（↑ 星 / → 月 / ↓ 行星 / ← 彗星）；OCTET 模式按住 B + 方向 = 第二組四音。
 *       SELECT（4 鍵模式也可用 B）= 輸入中「重看一次」（每回合一次，扣分不扣命）。START = 暫停。
 * 模式：CLASSIC 經典（光 + 聲）/ EAR 只聽聲音（展示時不亮燈）/ EYE 只看顏色（全程靜音）/
 *       REVERSE 倒著輸入 / OCTET 8 鍵（十字鍵 + 按住 B）。
 * 規則：3 條命；按錯或 6 秒沒按 = MISS（亮出正確的那顆、扣 1 命、同一串重放）；命用完 GAME OVER。
 *       每完成 5 的倍數步回 1 命（上限 5）。goal = 經典模式完成 15 步（不開密技）。15 步之後可以繼續挑戰到 99 步。
 * 時間一律以幀計：展示亮燈 30/24/19/15 幀（序列越長越快；最快那段從第 16 步起，goal 前不到最快）、
 *       間隔 12/10/8/7 幀；輸入逾時 360 幀（6.0 秒）。
 * fix-r8（qa-r8）：OCTET 方向鍵比 B 早按 ≤ 4 幀仍判第二組（B_GRACE：方向按下後暫緩判定，B 一到立刻判高音組，
 *       4 幀沒等到才判第一組）；同一幀兩個方向一起按下（觸控斜方向）不判定；遊玩中 NES.Touch.setWays(4)；
 *       EAR（只靠聲音）開局前先 SOUND CHECK（提示 iPhone 靜音開關）；鍵音改成原創的四度堆疊（不是大三和弦）。
 * 聲音也是玩法：每顆音高 + 音色都不同（song.js 檔頭表），而且一律有視覺提示（EAR 模式例外，那是進階模式）；
 *       遊玩中 BGM 只用 tri + noi，鍵音固定走 p1、系統音效走 p2 ⇒ 鍵音和 BGM 同時響、互不搶聲道。
 * 網址：`cart4.html?game=simon&debug=1[&bot=1][&mode=0..4][&seed=N][&lag=N][&autostart=1]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var SM = CT.Simon = CT.Simon || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ============================== 常數 ============================== */
  var NT_LIMIT = 140, GOAL_LEN = 15, MAX_LEN = 99, LIVES = 3, MAX_LIVES = 5, LIFE_EVERY = 5, B_GRACE = 4, CHECK_STEP = 24;
  var INPUT_TIMEOUT = 360, PRESS_LIGHT = 14, READY_F = 120, INTRO_F = 45, GOOD_F = 50, MISS_F = 110;
  var MODES = [
    { id: 'classic', name: 'CLASSIC', keys: 4, light: true, sound: true, rev: false, key: 'best', mult: 1, desc: ['THE CHAIN GROWS BY ONE', 'EACH ROUND. LIGHT + SOUND'] },
    { id: 'ear', name: 'EAR', keys: 4, light: false, sound: true, rev: false, key: 'best_ear', mult: 2, desc: ['SOUND ONLY: THE STARS', 'SING BUT DO NOT GLOW'] },
    { id: 'eye', name: 'EYE', keys: 4, light: true, sound: false, rev: false, key: 'best_eye', mult: 1, desc: ['LIGHTS ONLY: THE WHOLE', 'GAME IS SILENT'] },
    { id: 'reverse', name: 'REVERSE', keys: 4, light: true, sound: true, rev: true, key: 'best_rev', mult: 2, desc: ['WATCH, THEN PLAY THE', 'CHAIN BACKWARDS'] },
    { id: 'octet', name: 'OCTET', keys: 8, light: true, sound: true, rev: false, key: 'best_oct', mult: 2, desc: ['8 STARS: HOLD B + DIR', 'FOR THE HIGH SET'] }
  ];
  var RANKS = [[0, 'SPARK'], [5, 'COMET'], [10, 'NOVA'], [15, 'PULSAR'], [20, 'QUASAR'], [30, 'GALAXY']];
  // 版面（磚座標）：四顆 6×6 星標十字排列 + 中央核心 6×6；箭頭 2×2
  var PAD = [{ c: 10, r: 4 }, { c: 18, r: 12 }, { c: 10, r: 20 }, { c: 2, r: 12 }];
  var CORE = { c: 10, r: 12 };
  var ARW = [{ c: 12, r: 10 }, { c: 16, r: 14 }, { c: 12, r: 18 }, { c: 8, r: 14 }];
  var HUDC = 25;
  // 調色盤：四組 BG = 四顆星標（色 3 一律白 = 文字）；dim / lit（第一組）/ lit2（第二組，粉彩 + B 徽章）
  var DIM = [[0x1C, 0x0C, 0x30], [0x17, 0x07, 0x30], [0x14, 0x04, 0x30], [0x1A, 0x0A, 0x30]];
  var LIT = [[0x30, 0x2C, 0x30], [0x30, 0x28, 0x30], [0x30, 0x24, 0x30], [0x30, 0x2A, 0x30]];
  var LIT2 = [[0x2C, 0x3C, 0x30], [0x27, 0x38, 0x30], [0x24, 0x34, 0x30], [0x2A, 0x3A, 0x30]];
  var PAL_SPR = [[0x30, 0x38, 0x28], [0x16, 0x27, 0x30], [0x21, 0x31, 0x30], [0x30, 0x28, 0x38]];
  var DIR_BTN = [BTN.UP, BTN.RIGHT, BTN.DOWN, BTN.LEFT];
  var DIR_NAME = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
  SM.MODES = MODES; SM.DIM = DIM; SM.LIT = LIT; SM.LIT2 = LIT2;

  function showTiming(len) {
    if (len <= 5) return [30, 12];
    if (len <= 9) return [24, 10];
    if (len <= 15) return [19, 8];      // goal（15 步）之前最快就是 19 + 8
    return [15, 7];
  }

  var A = null, Au = null;

  /* ============================== 影子名稱表 + 屬性表 + 差異佇列 ============================== */
  var want = new Uint8Array(960 + 240), have = new Uint8Array(960 + 240), dirty = new Uint8Array(960 + 240);
  var queue = [], qi = 0, ntWrites = 0, ntPeak = 0;
  function put(c, r, t) {
    if (c < 0 || c > 31 || r < 0 || r > 29) return;
    var i = r * 32 + c;
    want[i] = t;
    if (have[i] !== t && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function putA(bx, by, p) {
    if (bx < 0 || bx > 15 || by < 0 || by > 14) return;
    var i = 960 + by * 16 + bx;
    want[i] = p;
    if (have[i] !== p && !dirty[i]) { dirty[i] = 1; queue.push(i); }
  }
  function text(c, r, s) { s = String(s); for (var i = 0; i < s.length; i++) put(c + i, r, A.ch(s.charAt(i))); }
  function num(v, n) { var s = String(Math.max(0, Math.floor(v))); while (s.length < n) s = '0' + s; return s.length > n ? s.substring(s.length - n) : s; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.substring(0, n); }
  function ctr(s, n) { s = String(s); var l = (n - s.length) >> 1; while (l-- > 0) s = ' ' + s; return pad(s, n); }
  function flush(ppu, unlimited) {
    var bud = nes0 && nes0.timing && nes0.timing.budget;
    var base = (bud && !bud.mute) ? (bud.used | 0) : 0, n = 0;
    while (qi < queue.length) {
      if (!unlimited && base + n >= NT_LIMIT) break;
      var i = queue[qi++];
      dirty[i] = 0;
      if (want[i] !== have[i]) {
        if (i < 960) ppu.setTile(0, i & 31, i >> 5, want[i]);
        else ppu.setAttr(0, (i - 960) & 15, (i - 960) >> 4, want[i]);
        have[i] = want[i]; n++;
      }
    }
    if (qi >= queue.length) { queue.length = 0; qi = 0; }
    ntWrites = n; if (!unlimited && n > ntPeak) ntPeak = n;
    return n;
  }
  function ntReset() { want.fill(0); have.fill(0); dirty.fill(0); queue.length = 0; qi = 0; }
  function pending() { return queue.length - qi; }

  /* ============================== 亂數（xorshift32） ============================== */
  var rs = 0x2545F491;
  function rnd() { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs; }
  function makeSeq(seed, keys) {
    rs = (seed >>> 0) || 0x1234567;
    var out = [], i;
    for (i = 0; i < MAX_LEN; i++) {
      var k;
      do { k = rnd() % keys; } while (i >= 2 && out[i - 1] === k && out[i - 2] === k);   // 不連續三次同一顆
      out.push(k);
    }
    return out;
  }
  SM.makeSeq = makeSeq;

  /* ============================== 狀態 ============================== */
  var nes0 = null, ppu0 = null, g = null;
  function newState() {
    return {
      mode: 'title', frames: 0, menu: 0, blink: 0, m: MODES[0],
      phase: 'ready', pt: 0, seq: [], len: 1, pos: 0, showI: 0, showOn: false,
      lit: -1, litT: 0, litVis: true, lives: LIVES, score: 0, best: 0, maxDone: 0,
      replayUsed: false, replays: 0, misses: 0, idle: 0, missKey: -1, goal: false, cleared15: false,
      cheats: 0, continues: 0, paused: false, msg: '', msgT: 0, musicBack: 0, seed: 0, goodWait: 0,
      palNow: [-1, -1, -1, -1], bheld: false, pend: null, lifeUps: 0,
      soundOk: false, ct: 0, titleMsgT: 0
    };
  }
  function expectKey() { return g.m.rev ? g.seq[g.len - 1 - g.pos] : g.seq[g.pos]; }

  /* ============================== 流程 ============================== */
  function sfx(n) { Au.sfx(n); }
  // 觸控十字鍵：遊玩中四方向（±45°、只輸出單一方向）；API 還沒有也不報錯
  function touchWays(n) { try { if (NES.Touch && NES.Touch.setWays) NES.Touch.setWays(n); } catch (e) { } }
  SM.touchWays = touchWays;
  function soundOnly(m) { return m.sound && !m.light; }
  function startGame() {
    g.m = MODES[g.menu];
    if (soundOnly(g.m) && !g.soundOk) { enterCheck(); return; }
    touchWays(4);
    var seedQ = parseInt((CT.query && CT.query('seed')) || '', 10);
    g.seed = (isFinite(seedQ) && seedQ > 0) ? (seedQ >>> 0) : (((g.frames + 7) * 2654435761) >>> 0) || 0x1234567;
    g.seq = makeSeq(g.seed, g.m.keys);
    if (guardOn) g.seq = guardWrap(g.seq);
    g.len = 1; g.pos = 0; g.lives = LIVES; g.score = 0; g.maxDone = 0;
    g.replays = 0; g.misses = 0; g.goal = false; g.cleared15 = false; g.cheats = 0; g.continues = 0; g.pend = null; g.lifeUps = 0;
    g.paused = false; g.lit = -1; g.litT = 0; g.msg = ''; g.msgT = 0; g.musicBack = 0;
    g.best = CT.load('simon', g.m.key, 0);
    g.mode = 'play';
    setPhase('ready');
    CT.blank(nes0, function () { drawPlayScreen(); });
    Au.stop(); Au.play('simon_play');
  }
  function toTitle() {
    saveBest();
    touchWays(8);
    g.mode = 'title'; g.paused = false; g.pend = null;
    CT.blank(nes0, function () { drawTitleScreen(); });
    Au.stop(); Au.play('simon_title');
  }
  // SOUND CHECK（只靠聲音的模式開局前）：由低到高輪播四個鍵音，A = 聽得到、B = 回標題（提示靜音開關 / 音量）
  function enterCheck() {
    g.mode = 'check'; g.ct = 0; g.lit = -1;
    Au.stop();
    CT.blank(nes0, function () { drawCheckScreen(); });
  }
  var CHECK_ORDER = [2, 3, 1, 0];          // ↓ ← → ↑（低 → 高）
  function updateCheck() {
    g.ct++;
    if (g.ct % CHECK_STEP === 1) { var k = CHECK_ORDER[((g.ct / CHECK_STEP) | 0) % 4]; Au.tone(k, 16); g.checkKey = k; }
    if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) { g.soundOk = true; sfx('simon_ok'); startGame(); return; }
    if (pressed(BTN.B)) { g.titleMsgT = 240; toTitle(); }
  }
  function setPhase(p) {
    g.phase = p; g.pt = 0;
    if (p === 'intro') { g.pos = 0; g.showI = 0; g.showOn = false; }
    if (p === 'input') { g.pos = 0; g.idle = 0; g.pend = null; g.goodWait = 0; }   // goodWait 也清掉（重開局時不會帶進上一局的過關）
  }
  function light(k, t, vis) { g.lit = k; g.litT = t; g.litVis = vis; }

  function updateReady() {
    if (g.pt === 1) sfx('simon_tick');
    if (g.pt === 30 || g.pt === 60 || g.pt === 90) sfx('simon_tick');
    if (g.pt >= READY_F) { sfx('simon_go'); g.replayUsed = false; setPhase('intro'); }
  }
  function updateIntro() {
    if (g.pt >= INTRO_F) { setPhase('show'); }
  }
  function updateShow() {
    var tm = showTiming(g.len), cyc = tm[0] + tm[1];
    var t0 = g.pt - 1, i = Math.floor(t0 / cyc), f = t0 % cyc;
    if (i >= g.len) { g.lit = -1; setPhase('input'); return; }
    g.showI = i;
    if (f === 0) {
      var k = g.seq[i];
      light(k, tm[0], g.m.light);
      if (g.m.sound) Au.tone(k, tm[0]);
      g.showOn = true;
    }
    if (f === tm[0]) g.showOn = false;
  }
  function replay() {
    if (g.replayUsed) { sfx('simon_menu'); return false; }
    g.replayUsed = true; g.replays++;
    g.score = Math.max(0, g.score - 10 * g.len);
    g.msg = 'WATCH AGAIN  -' + (10 * g.len); g.msgT = 90;
    sfx('simon_replay');
    g.lit = -1;
    setPhase('intro');
    g.pt = INTRO_F - 20;
    return true;
  }
  function press(k) {
    light(k, PRESS_LIGHT, true);
    if (g.m.sound) Au.tone(k, PRESS_LIGHT + 2);
    g.idle = 0;
    if (k !== expectKey()) { miss(expectKey()); return; }
    g.pos++;
    g.score = Math.min(999999, g.score + 5 * g.len);
    if (g.pos >= g.len) { g.goodWait = PRESS_LIGHT + 2; }
  }
  function miss(correct) {
    g.misses++; g.lives--; g.missKey = correct;
    g.lit = -1;
    sfx('simon_miss');
    setPhase('miss');
  }
  function roundClear() {
    var bonus = 20 * g.len * g.m.mult + (g.replayUsed ? 0 : 10 * g.len);
    g.score = Math.min(999999, g.score + bonus);
    g.maxDone = Math.max(g.maxDone, g.len);
    if (g.maxDone > g.best) g.best = g.maxDone;
    var lifeUp = g.len % LIFE_EVERY === 0 && g.lives < MAX_LIVES;
    if (lifeUp) { g.lives++; g.lifeUps++; }
    g.msg = 'GOOD! +' + bonus + (lifeUp ? ' LIFE+1' : ''); g.msgT = GOOD_F;
    setPhase('good');
    if (g.len === GOAL_LEN && !g.cleared15) {
      g.cleared15 = true;
      if (g.m.id === 'classic' && g.cheats === 0) g.goal = true;
      g.msg = lifeUp ? 'ECHO MASTER! LIFE+1' : 'ECHO MASTER! 15 STEPS'; g.msgT = 150;
      Au.play('simon_clear'); g.musicBack = 70;
      g.pt = -40;
    } else sfx('simon_good');
  }
  function gameOver() {
    setPhase('over');
    saveBest();
    Au.stop(); Au.play('simon_over');
  }
  function rankOf(n) { var r = RANKS[0][1]; for (var i = 0; i < RANKS.length; i++) if (n >= RANKS[i][0]) r = RANKS[i][1]; return r; }
  function saveBest() {
    if (!g || g.mode !== 'play') return;
    if (g.maxDone > CT.load('simon', g.m.key, 0)) CT.save('simon', g.m.key, g.maxDone);
    if (g.score > CT.load('simon', g.m.key + '_sc', 0)) CT.save('simon', g.m.key + '_sc', g.score);
  }

  function held(b) { return NES.Input.held(b); }
  function pressed(b) { return NES.Input.pressed(b); }
  // 這一幀按下的方向：剛好一個才算；同一幀兩個方向一起按下（觸控斜方向）= 不判定，等下一個單一方向
  function dirEdge() {
    var d = -1, n = 0;
    for (var i = 0; i < 4; i++) if (pressed(DIR_BTN[i])) { d = i; n++; }
    return n === 1 ? d : -1;
  }

  function updateTitle() {
    g.blink++;
    if (pressed(BTN.UP)) { g.menu = (g.menu + MODES.length - 1) % MODES.length; sfx('simon_menu'); }
    if (pressed(BTN.DOWN)) { g.menu = (g.menu + 1) % MODES.length; sfx('simon_menu'); }
    if ((pressed(BTN.START) && !held(BTN.SELECT)) || pressed(BTN.A)) { sfx('simon_ok'); startGame(); }
  }
  function updatePlay() {
    if (pressed(BTN.START) && !held(BTN.SELECT) && g.phase !== 'over') {
      g.paused = !g.paused;
      if (g.paused) Au.pause(); else if (!Au.resume()) Au.play('simon_play');
      sfx('simon_menu');
    }
    if (g.paused) return;
    if (g.msgT > 0) g.msgT--;
    if (g.musicBack > 0 && --g.musicBack === 0 && g.phase !== 'over') { Au.stop(); Au.play('simon_play'); }
    if (g.litT > 0 && --g.litT === 0) g.lit = -1;
    g.bheld = g.m.keys === 8 && held(BTN.B);
    g.pt++;
    switch (g.phase) {
      case 'ready': updateReady(); break;
      case 'intro': updateIntro(); break;
      case 'show': updateShow(); break;
      case 'input':
        if (g.goodWait > 0) { if (--g.goodWait === 0) roundClear(); break; }
        if (g.pend) {
          // OCTET：方向先到、B 晚到 ≤ B_GRACE 幀 ⇒ 仍是第二組（鍵音 / 判定延後到 B 到或時限到）
          g.pend.t++;
          var pd = g.pend.d, nd = dirEdge();
          if (held(BTN.B)) { g.pend = null; press(pd + 4); break; }
          if (nd >= 0 || g.pend.t >= B_GRACE) {
            g.pend = null; press(pd);
            if (nd >= 0 && g.phase === 'input' && !g.goodWait) g.pend = { d: nd, t: 0 };
          }
          break;
        }
        if (pressed(BTN.SELECT) || (g.m.keys === 4 && pressed(BTN.B))) { replay(); break; }
        var d = dirEdge();
        if (d >= 0) {
          if (g.m.keys === 8 && !held(BTN.B) && B_GRACE > 0) g.pend = { d: d, t: 0 };
          else press(d + (g.m.keys === 8 && held(BTN.B) ? 4 : 0));
          break;
        }
        if (++g.idle >= INPUT_TIMEOUT) miss(expectKey());
        break;
      case 'good':
        if (g.pt >= GOOD_F) {
          if (g.len >= MAX_LEN) { gameOver(); break; }
          g.len++; g.replayUsed = false; setPhase('intro');
        }
        break;
      case 'miss':
        // 正確那顆閃 3 下（每 16 幀）
        if (g.pt % 32 === 4 && g.pt < 100) light(g.missKey, 14, true);
        if (g.pt >= MISS_F) {
          if (g.lives <= 0) gameOver();
          else { g.replayUsed = false; setPhase('intro'); }
        }
        break;
      case 'over':
        if (pressed(BTN.A) || (pressed(BTN.START) && !held(BTN.SELECT))) toTitle();
        break;
    }
  }

  /* ============================== 畫面 ============================== */
  function padPal(i) {
    if (g.mode === 'check') return g.checkKey === i && (g.ct % CHECK_STEP) < 16 && (g.ct % CHECK_STEP) > 0 ? LIT[i] : DIM[i];
    if (g.mode !== 'play') return LIT[i];
    if (g.lit >= 0 && g.litVis && (g.lit & 3) === i && !g.paused) return g.lit >= 4 ? LIT2[i] : LIT[i];
    return DIM[i];
  }
  function setPalettes(force) {
    for (var i = 0; i < 4; i++) {
      var p = padPal(i), code = p[0] * 4096 + p[1] * 64 + p[2];
      if (force || g.palNow[i] !== code) { ppu0.setBgPalette(i, p); g.palNow[i] = code; }
    }
  }
  function initPalettes() {
    ppu0.setBackdrop(0x0F);
    g.palNow = [-1, -1, -1, -1];
    setPalettes(true);
    for (var i = 0; i < 4; i++) ppu0.setSprPalette(i, PAL_SPR[i]);
  }
  function stars(seed, count, avoid) {
    var s = seed, i;
    for (i = 0; i < count; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7FFFFFFF;
      var c = (s >> 10) & 31, r = 1 + ((s >> 16) % 28);
      if (avoid && avoid(c, r)) continue;
      put(c, r, A.t((s >> 4) & 1 ? 'ST1' : 'ST2'));
    }
  }
  function block(c, r, w, h, prefix, pal) {
    for (var j = 0; j < w * h; j++) put(c + (j % w), r + ((j / w) | 0), A.t(prefix + j));
    if (pal !== undefined) for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) putA((c + x) >> 1, (r + y) >> 1, pal);
  }
  function bigText(c, r, s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      for (var j = 0; j < 4; j++) put(c + i * 2 + (j & 1), r + (j >> 1), A.t('BIG_' + ch + j));
    }
  }
  function blankAll() { ntReset(); ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0); initPalettes(); }

  function drawTitleScreen() {
    blankAll();
    // fix-r8 P3-2 / P3-3：內容從名稱表第 2 列起（第 0、1 列留白不貼頂）；段落之間一律空一列
    stars(23, 70, function (c, r) { return r <= 6 || (r >= 7 && r <= 28 && c >= 1 && c <= 30); });
    text(4, 3, 'STARDUST');
    bigText(13, 2, 'ECHO');
    text(4, 5, 'FOLLOW THE STARS');
    // 對照圖：迷你十字（各自的調色盤）+ 方向 / 名稱 / 音高
    block(4, 16, 2, 2, 'M0_', 0); block(6, 18, 2, 2, 'M1_', 1); block(4, 20, 2, 2, 'M2_', 2); block(2, 18, 2, 2, 'M3_', 3);
    text(10, 16, 'UP    STAR    HIGH');
    text(10, 17, 'RIGHT MOON');
    text(10, 18, 'LEFT  COMET');
    text(10, 19, 'DOWN  PLANET  LOW');
    text(10, 21, 'OCTET: HOLD B + DIR');
    text(2, 23, 'SELECT/B: WATCH AGAIN (-PTS)');
    text(2, 25, 'START PAUSE  C/$ = CHEAT');
    text(2, 26, 'HOLD START+SELECT: MENU');
    flush(ppu0, true);
    drawTitleValues();
    flush(ppu0, true);
  }
  function drawTitleValues() {
    for (var i = 0; i < MODES.length; i++) {
      var m = MODES[i];
      text(6, 7 + i, pad(m.name, 8));
      text(15, 7 + i, 'BEST ' + num(CT.load('simon', m.key, 0), 2));
    }
    var m0 = MODES[g.menu];
    text(4, 13, pad(m0.desc[0], 26)); text(4, 14, pad(m0.desc[1], 26));
    if (g.titleMsgT > 0) { g.titleMsgT--; text(2, 28, ctr(((g.titleMsgT >> 5) & 1) ? 'NO SOUND? CHECK SILENT' : 'SWITCH AND VOLUME', 28)); }
    else text(2, 28, ctr((g.blink >> 5) & 1 ? '' : 'PUSH START', 28));
  }

  function drawPlayScreen() {
    blankAll();
    stars(5, 70, function (c, r) { return (c <= 24 && r >= 3 && r <= 27) || c >= HUDC - 1 || r <= 2; });
    for (var i = 0; i < 4; i++) {
      block(PAD[i].c, PAD[i].r, 6, 6, 'P' + i + '_', i);
      block(ARW[i].c, ARW[i].r, 2, 2, 'AW' + i + '_', 0);
    }
    put(CORE.c, CORE.r, A.t('CR_TL')); put(CORE.c + 5, CORE.r, A.t('CR_TR'));
    put(CORE.c, CORE.r + 5, A.t('CR_BL')); put(CORE.c + 5, CORE.r + 5, A.t('CR_BR'));
    text(2, 2, 'STAR ECHO');
    text(HUDC, 7, 'STEP'); text(HUDC, 10, 'SCORE'); text(HUDC, 13, 'BEST'); text(HUDC, 16, 'LIFE'); text(HUDC, 19, 'AGAIN');
    renderPlay();
    flush(ppu0, true);
  }
  function drawCheckScreen() {
    blankAll();
    stars(9, 50, function (c, r) { return r <= 1 || (r >= 3 && r <= 27 && c >= 1 && c <= 30); });
    text(10, 3, 'SOUND CHECK');
    text(4, 5, 'EAR MODE IS SOUND ONLY.');
    // 中央一顆迷你十字：正在響的那顆跟著亮（這頁是檢查，所以可以看）
    block(14, 8, 2, 2, 'M0_', 0); block(16, 10, 2, 2, 'M1_', 1); block(14, 12, 2, 2, 'M2_', 2); block(12, 10, 2, 2, 'M3_', 3);
    text(4, 16, 'YOU SHOULD HEAR 4 NOTES,');
    text(4, 17, 'LOW TO HIGH, OVER AND OVER.');
    text(4, 19, 'HEAR THEM?');
    text(6, 20, 'A = YES, START');
    text(6, 21, 'B = NO, BACK');
    text(4, 24, 'NO SOUND? CHECK THE PHONE');
    text(4, 25, 'SILENT SWITCH AND VOLUME.');
    flush(ppu0, true);
  }
  function coreText() {
    if (g.paused) return ['PAUSE', ''];
    var cnt = num(Math.min(g.len, 99), 2);
    switch (g.phase) {
      case 'ready': return ['READY', g.pt < 30 ? '' : String(3 - Math.floor((g.pt - 30) / 30)).replace(/^0$|^-.*/, 'GO')];
      case 'intro': return [g.m.light ? 'WATCH' : 'LISTEN', cnt];
      case 'show': return [g.m.light ? 'WATCH' : 'LISTEN', num(g.showI + 1, 2) + '/' + cnt];
      case 'input': return [g.m.rev ? 'BACK' : 'PLAY', num(g.pos, 2) + '/' + cnt];
      case 'good': return ['GOOD', cnt];
      case 'miss': return ['MISS', g.lives > 0 ? 'LIFE-1' : ''];
      case 'over': return ['OVER', num(g.maxDone, 2)];
    }
    return ['', ''];
  }
  function statusLines() {
    if (g.paused) return ['', 'HOLD START+SELECT: MENU'];
    if (g.msgT > 0 && g.msg) return ['', g.msg];
    switch (g.phase) {
      case 'ready': return ['', 'GET READY'];
      case 'intro': case 'show':
        return ['', g.m.id === 'ear' ? 'LISTEN - NO LIGHTS' : (g.m.id === 'eye' ? 'WATCH - SILENT' : (g.m.rev ? 'WATCH, THEN BACKWARDS' : 'WATCH AND LISTEN'))];
      case 'input': return [null, g.replayUsed ? 'YOUR TURN' : (g.m.keys === 8 ? 'YOUR TURN  SEL=AGAIN' : 'YOUR TURN  B=AGAIN')];
      case 'miss': return ['', 'THAT STAR WAS ' + SM.PADS[g.missKey & 3].key + (g.missKey >= 4 ? '+B' : '')];
      case 'over': return ['RANK ' + rankOf(g.maxDone), 'A TITLE   $ CONTINUE'];
    }
    return ['', ''];
  }
  function renderPlay() {
    var ct = coreText();
    text(CORE.c, CORE.r + 2, ctr(ct[0], 6));
    text(CORE.c, CORE.r + 3, ctr(ct[1], 6));
    text(13, 2, '- ' + pad(g.m.name, 7));            // 模式名放上方標題列（不再貼到第 31 欄）
    text(HUDC, 8, num(Math.min(g.len, 99), 2) + (g.m.id === 'classic' ? '/' + GOAL_LEN : '   '));
    text(HUDC, 11, num(g.score, 6));
    text(HUDC, 14, num(Math.max(g.best, g.maxDone), 2));
    for (var i = 0; i < MAX_LIVES; i++) put(HUDC + i, 17, i < g.lives ? A.t('F_HEART') : 0);
    text(HUDC, 20, g.replayUsed ? 'USED ' : 'READY');
    var st = statusLines();
    if (st[0] === null) {        // 輸入中：計時條
      text(2, 26, 'TIME ');
      var left = Math.max(0, INPUT_TIMEOUT - g.idle), px = Math.ceil(left * 64 / INPUT_TIMEOUT);
      for (i = 0; i < 8; i++) put(7 + i, 26, A.t('BAR' + Math.max(0, Math.min(8, px - i * 8))));
      text(15, 26, ' ' + (left / 60).toFixed(1) + 'S  ');
    } else text(2, 26, pad(st[0], 22));
    text(2, 27, pad(st[1], 22));
  }

  function drawSprites() {
    var slot = 0, i;
    if (g.mode === 'play' && !g.paused && g.lit >= 0 && g.litVis) {
      var p = PAD[g.lit & 3], x0 = p.c * 8, y0 = p.r * 8, ph = (g.frames >> 2) & 1;
      var sp = A.s(ph ? 'SPK1' : 'SPK0');
      ppu0.sprite(slot++, { x: x0 - 4, y: y0 - 4, tile: sp, pal: 0 });
      ppu0.sprite(slot++, { x: x0 + 44, y: y0 - 4, tile: sp, pal: 0 });
      ppu0.sprite(slot++, { x: x0 - 4, y: y0 + 44, tile: sp, pal: 0 });
      ppu0.sprite(slot++, { x: x0 + 44, y: y0 + 44, tile: sp, pal: 0 });
      if (g.lit >= 4) {
        ppu0.sprite(slot++, { x: x0 + 20, y: y0 + 20, tile: A.s('BADGE'), pal: 1 });
        for (i = 0; i < 2; i++) {
          var a = (g.frames * 0.12) + i * Math.PI;
          ppu0.sprite(slot++, { x: x0 + 20 + Math.round(Math.cos(a) * 26), y: y0 + 20 + Math.round(Math.sin(a) * 26), tile: A.s('ORB'), pal: 2 });
        }
      }
    }
    if (g.mode === 'play' && g.bheld && !g.paused && g.phase === 'input') {
      ppu0.sprite(slot++, { x: CORE.c * 8 + 20, y: CORE.r * 8 + 4, tile: A.s('BADGE'), pal: 1 });
    }
    if (g.mode === 'title') ppu0.sprite(slot++, { x: 3 * 8, y: (7 + g.menu) * 8, tile: A.s('CUR'), pal: 3 });
    for (i = slot; i < 48; i++) ppu0.sprite(i, null);
  }

  /* ============================== 機器人（?bot=1）==============================
   * 只從「展示當下的畫面 / 聲音」讀序列：
   *   看 = 讀 PPU 目前四組 BG 調色盤（哪顆星標正在亮、是 LIT 還是 LIT2）——就是螢幕上看得到的東西；
   *   聽 = EAR 模式改讀 APU 驅動 p1 聲道目前的音高（midi → 哪顆星標），等於「聽音辨位」。
   * 從不讀 g.seq。輸入時有人類延遲：進入輸入後等 lag 幀（預設 14，?lag=N），每按一下之間也隔 lag 幀（最少 1 幀放開）。 */
  // 測試用防偷看：dev.guard(true) 之後開局的 g.seq 包成 Proxy，bot() 執行期間任何讀取都計數（應為 0）
  var guardOn = false, inBot = false, guardReads = 0;
  function guardWrap(arr) {
    return new Proxy(arr, { get: function (t, k) { if (inBot) guardReads++; return t[k]; } });
  }
  var bm = null;
  function botReset() { bm = { t: 0, mem: [], prev: -1, prevSnd: false, inPhase: '', q: [], wait: 0, idx: 0, lag: 14 }; var l = parseInt((CT.query && CT.query('lag')) || '', 10); if (isFinite(l) && l >= 0) bm.lag = l; }
  var MIDI2K = null;
  function seeLit() {
    for (var i = 0; i < 4; i++) {
      var p = ppu0.getBgPalette(i);
      if (p[2] === LIT[i][1] && p[1] === LIT[i][0]) return i;
      if (p[2] === LIT2[i][1] && p[1] === LIT2[i][0]) return i + 4;
    }
    return -1;
  }
  // 「聽」：讀 APU 方波 1 的實際輸出（timer 週期 → 頻率 → 最近的半音）。遊玩 BGM 不用 p1，所以 p1 有聲 = 鍵音。
  function hearTone() {
    if (!MIDI2K) { MIDI2K = {}; Au.KEYS.forEach(function (K, k) { MIDI2K[K.midi] = k; if (K.shimmer) MIDI2K[K.midi + 12] = k; }); }
    var apu = nes0.apu, st = apu && apu.state && apu.state();
    if (!st) return -1;
    var p = st.pulse1;
    if (!p.enabled || p.muted || !(p.volume > 0) || !(p.length > 0)) return -1;
    var f = 1789773 / (16 * (p.timer + 1)), m = Math.round(69 + 12 * Math.log(f / 440) / Math.LN2);
    var k = MIDI2K[m];
    return k === undefined ? -1 : k;
  }
  function bot() {
    if (!bm) botReset();
    bm.t++;
    if (g.mode === 'check') return (bm.t & 15) === 0 ? BTN.A : 0;     // 聽得到（機器人有讀 APU）
    if (g.mode === 'title') {
      var want0 = parseInt((CT.query && CT.query('mode')) || '0', 10) || 0;
      if (g.menu !== want0) return (bm.t & 7) === 0 ? BTN.DOWN : 0;
      return (bm.t & 15) === 0 ? BTN.START : 0;
    }
    if (g.paused) return (bm.t & 15) === 0 ? BTN.START : 0;
    if (g.phase === 'over') return (!g.goal && (bm.t & 31) === 0) ? BTN.A : 0;
    var ph = g.phase;      // 畫面核心字（WATCH / LISTEN / PLAY …）
    if (ph !== bm.inPhase) {
      if (ph === 'intro') { bm.mem = []; bm.prev = -1; bm.prevSnd = -1; }
      if (ph === 'input') { bm.wait = bm.lag; bm.idx = 0; bm.q = []; }
      bm.inPhase = ph;
    }
    if (ph === 'show' || ph === 'intro') {
      var k = MODES[g.menu].light ? seeLit() : hearTone();
      if (k >= 0 && bm.prev < 0) bm.mem.push(k);      // 亮起 / 響起的那一刻（上升緣）記一顆
      bm.prev = k;
      return 0;
    }
    if (ph === 'input') {
      if (bm.q.length) return bm.q.shift();
      if (bm.wait > 0) { bm.wait--; return 0; }
      var order = g.m.rev ? bm.mem.slice().reverse() : bm.mem;
      if (bm.idx >= order.length) return 0;
      var kk = order[bm.idx++], d = DIR_BTN[kk & 3];
      if (kk >= 4) { bm.q = [BTN.B, BTN.B | d]; for (var hb = 0; hb < 10; hb++) bm.q.push(BTN.B); bm.q.push(0); }   // 像人一樣按住 B 到方向放開之後
      else bm.q = [d, 0];
      bm.wait = Math.max(0, bm.lag - 1);
      return bm.q.shift();
    }
    return 0;
  }

  /* ============================== 密技 ============================== */
  // 遊玩中：命 +1（上限 5）；GAME OVER：原地續關（同一步數、命補回 3）。標題無效；用過密技 goal() 一律 false。
  function cheat() {
    if (!g || g.mode !== 'play') return false;
    g.cheats++; g.goal = false;
    if (g.phase === 'over') {
      g.lives = LIVES; g.continues++; g.replayUsed = false;
      g.msg = 'CONTINUE'; g.msgT = 60;
      Au.stop(); Au.play('simon_play');
      setPhase('intro');
    } else {
      g.lives = Math.min(MAX_LIVES, g.lives + 1);
      g.msg = 'EXTRA LIFE'; g.msgT = 60;
    }
    sfx('simon_good');
    return true;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: 'simon', order: 2, title: '星塵跟我做', legacy: ['memory-simon.html', 'sound-simon.html', 'color-sequence-memory.html', 'tap-sequence.html'],
    init: function (nes, opt) {
      nes0 = nes; ppu0 = nes.ppu;
      A = SM.Art.make(); Au = SM.Audio;
      NES.CHR.setPattern(0, 'simon_bg');
      NES.CHR.setPattern(1, 'simon_spr');
      ppu0.setPatternTables(0, 1);
      ppu0.spriteMode(8);
      ppu0.flicker = 'none';
      g = newState(); bm = null;
      Au.init(nes);
      var q = CT.query || function () { return null; };
      var mq = parseInt(q('mode') || '', 10);
      if (mq >= 0 && mq < MODES.length) g.menu = mq;
      drawTitleScreen();
      Au.play('simon_title');
      if (q('autostart') === '1') startGame();
    },
    update: function (nes) {
      g.frames++;
      if (g.mode === 'title') updateTitle();
      else if (g.mode === 'check') updateCheck();
      else updatePlay();
      Au.tick();
    },
    draw: function (nes) {
      if (g.mode === 'title') drawTitleValues();
      else if (g.mode === 'play') renderPlay();
      setPalettes(false);
      flush(ppu0, false);
      drawSprites();
    },
    exit: function (nes) { saveBest(); Au.stop(); touchWays(8); },
    get backTile() { if (!A) A = SM.Art.make(); return { tile: A.s('DOT'), pal: 0 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, gameMode: g.m.id, menu: g.menu, phase: g.phase, pt: g.pt, len: g.len, pos: g.pos, showI: g.showI,
        lit: g.lit, litVis: g.litVis, lives: g.lives, score: g.score, best: g.best, maxDone: g.maxDone,
        replayUsed: g.replayUsed, replays: g.replays, misses: g.misses, idle: g.idle, goal: g.goal, cleared15: g.cleared15,
        cheats: g.cheats, continues: g.continues, paused: g.paused, msg: g.msgT > 0 ? g.msg : '', bheld: g.bheld,
        pend: g.pend ? g.pend.d : -1, lifeUps: g.lifeUps, soundOk: g.soundOk, titleMsgT: g.titleMsgT,
        music: Au.current, lastSfx: Au.lastSfx, lastTone: Au.lastTone, toneCount: Au.toneCount,
        queue: pending(), ntWrites: ntWrites, ntPeak: ntPeak, frames: g.frames, seed: g.seed
      };
    },
    cheat: cheat,
    bot: function () { if (!g) return 0; inBot = true; try { return bot(); } finally { inBot = false; } },
    goal: function () { return !!(g && g.goal && g.cheats === 0); },
    bestText: function () { return num(Math.min(99, CT.load('simon', 'best', 0)), 2) + 'STEP'; }
  };

  // 測試鉤子（只讀寫本遊戲狀態；機器人不用）
  SM.dev = {
    start: function (mode, seed) { g.menu = mode || 0; var s0 = CT.query; CT.query = function (k) { return k === 'seed' ? String(seed || 77) : (s0 ? s0(k) : null); }; startGame(); CT.query = s0; },
    seq: function () { return g.seq.slice(0, g.len); },
    setLen: function (n) { g.len = n; g.maxDone = n - 1; },
    phase: function (p) { setPhase(p); },
    press: function (k) { press(k); },
    timing: showTiming, expect: function () { return expectKey(); },
    consts: { GOAL_LEN: GOAL_LEN, INPUT_TIMEOUT: INPUT_TIMEOUT, LIVES: LIVES, MAX_LIVES: MAX_LIVES, LIFE_EVERY: LIFE_EVERY, B_GRACE: B_GRACE, READY_F: READY_F, INTRO_F: INTRO_F, NT_LIMIT: NT_LIMIT },
    soundOk: function (v) { g.soundOk = !!v; },
    grace: function (n) { B_GRACE = n | 0; },          // 測試用：0 = 舊版（方向按下那一幀就判組別）
    guard: function (on) { guardOn = !!on; guardReads = 0; }, guardReads: function () { return guardReads; },
    pending: pending, rank: rankOf, seeLit: function () { return seeLit(); }, hear: function () { return hearTone(); },
    flushAll: function () { CT.blank(nes0, function () { flush(ppu0, true); }); }
  };

  if (CT.register) CT.register(GAME);
  SM.GAME = GAME;
})();
