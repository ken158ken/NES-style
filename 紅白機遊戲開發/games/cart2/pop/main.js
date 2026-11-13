/*
 * games/cart2/pop/main.js — 《星塵泡泡 STAR POP》（合輯卡帶二 槽 6，id = pop）
 * ---------------------------------------------------------------------------
 * 擁有者：C6-3 cart2-pop（R6）｜ 依賴：pop/art.js、pop/song.js、games/cart1/registry.js
 * 舊作概念來源：legacy/ken-ai-webgames/bubble-pop.html、balloon-pop-challenge.html、whack-a-mole.html
 *   （只取「戳上升泡泡 / 限時射氣球 / 敲冒出來的東西」三種玩法；角色、造型、配色、音樂全部原創）
 *
 * 三個模式（標題 ↑↓ 選）：
 *   BUBBLE RISE  戳泡泡：整片泡泡牆往上漂（背景磚 + 垂直捲動，狀態列用 split），游標戳一顆 ⇒ 相連同色一起連鎖破；
 *                連續戳同一色 = 色彩連鎖倍率（最高 ×4）；冰殼泡泡要戳兩次、星泡炸開 3×3；漂出頂端 = 壓力 +1（一次連鎖 ≥ 3 顆 −1），滿 20 結束。
 *   BALLOON SHOT 氣球射擊：每關 40 秒、達到配額才過關（6 關後循環加速）；金氣球 +3 秒、黑氣球（雷雲氣球）不能打（−5 秒）。
 *   BURROW BOP   敲噗噗芽：3×3 坑，十字鍵 8 方向 + 不按 = 中央 共 9 個位置、A 敲；60 秒一局。
 *                噗噗芽家族（原創）：BLIP 綠 100 / GOLDY 金 300 / THORN 紅刺（不能敲：−200 + 槌子暈 45 幀）/
 *                FAKER 面罩（先探頭假動作再真的冒出來，探頭時敲 = 揮空）/ SPITTER 吸管嘴（太久沒敲會朝槌子吐孢子反擊）。
 *                **goal = 敲噗噗芽一局 ≥ 3000 分（未用密技）**。
 * 游標（R6 brief §1-4）：十字鍵按住加速（前 8 幀 1 px/幀、之後 3 px/幀），B 按住 = 精細 1 px；A = 戳 / 射擊（只認按下邊緣）。
 * 每線精靈：泡泡全部是背景磚（只有游標 2 + 火花 ≤ 2）；氣球同速上升、生成時保證任一 24 px 帶最多 3 顆
 *   ⇒ 3×2 + 游標 2 = 8；坑裡的噗噗芽也是背景磚（每坑 4 磚 + 1 屬性），精靈只有槌子 2 + 孢子 1 + 暈星 1。
 * 密技（C / ★）：遊玩中 = 泡泡壓力歸零 / 氣球 +15 秒 / 敲噗噗芽 +15 秒；GAME OVER = 原地續關（同一關、分數保留）；標題無效。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var PO = CT.Pop = CT.Pop || {};
  var AU = PO.Audio;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var Q = 256;
  var MODES = ['bubble', 'balloon', 'burrow'];
  var MODE_NAME = { bubble: 'BUBBLE RISE', balloon: 'BALLOON SHOT', burrow: 'BURROW BOP' };
  var GOAL_SCORE = 8000;                // 敲噗噗芽 goal（完美機器人約 3 萬；人類 50~70% 命中約 1 萬）
  var FEVER = 10;                      // 連擊 ≥ 10 = 分數 ×2
  var ROUND = 3600;                    // 敲噗噗芽 60 秒
  var B_SPLIT = 200;                   // 泡泡模式：狀態列分割線
  var P_MAX = 20;                      // 泡泡壓力上限
  var BAL_TIME = 2400, BAL_MAX = 10;

  var PAL = {
    title: { bd: 0x0F, bg: [[0x00, 0x10, 0x30], [0x0C, 0x1C, 0x3C], [0x04, 0x14, 0x34], [0x06, 0x16, 0x28]] },
    bubble: { bd: 0x0F, bg: [[0x00, 0x10, 0x30], [0x15, 0x25, 0x35], [0x1C, 0x2C, 0x3C], [0x18, 0x28, 0x38]] },
    // fix-r6 P3-4：黃昏星港——bd 靛夜空；1 = 紫 / 粉 / 星白；2 = 粉 / 橘霞 / 剪影；3 = 剪影 / 燈 / 橘霞
    balloon: { bd: 0x02, bg: [[0x12, 0x22, 0x30], [0x13, 0x24, 0x30], [0x24, 0x27, 0x0C], [0x0C, 0x38, 0x27]] },
    burrow: { bd: 0x07, bg: [[0x0F, 0x17, 0x30], [0x0F, 0x1A, 0x3A], [0x0F, 0x28, 0x38], [0x0F, 0x16, 0x36]] },
    spr: [[0x0F, 0x28, 0x30], [0x06, 0x16, 0x30], [0x09, 0x1A, 0x30], [0x0F, 0x00, 0x10]]
  };
  var COLOR_NAME = ['', 'PINK', 'AQUA', 'GOLD'];
  var CREATURE_PAL = { BLIP: 1, FAKER: 1, GOLDY: 2, SPITTER: 2, THORN: 3 };
  var CREATURE_PTS = { BLIP: 100, GOLDY: 300, FAKER: 200, SPITTER: 150, THORN: -200 };

  var art = null, nes0 = null, g = null;

  function newState() {
    return {
      mode: 'title', sel: 2, sub: 'burrow', t: 0, paused: false, hud: {}, sprUsed: 0,
      score: 0, cheated: false, cheatReq: false, goalHit: false, overT: 0, msg: '', msgT: 0, seed: 11, runs: 0, continues: 0,
      cur: { x: 128, y: 112, hx: 0, hy: 0, fire: 0 }, fx: [],
      // 泡泡
      sq: 0, S: 0, grid: [], made: 0, esc: 0, lv: 1, popped: 0, pressure: 0, cool: 0, wq: [], anims: [],
      lastColor: 0, cchain: 1, chainT: 0, bestGroup: 0, escaped: 0, wqPeak: 0,
      // 氣球
      stage: 1, bals: [], timer: 0, quota: 0, pops: 0, spawnT: 0, shots: 0, blacks: 0,
      // 敲
      pods: [], selPod: 4, mal: 0, stun: 0, spore: null, combo: 0, maxCombo: 0, hitsN: 0, whiffs: 0, thorns: 0, spawnK: 0, elapsed: 0,
      bot: { t: 0, lastA: false, tgt: -1, seen: {}, lag: 6 }
    };
  }
  function rnd() { g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff; return g.seed >> 8; }

  /* ---------------- 文字 ---------------- */
  function text(nt, col, row, s) {
    var t = art.text(s);
    for (var i = 0; i < t.length && col + i < 32; i++) nes0.ppu.setTile(nt, col + i, row, t[i]);
  }
  function hud(nt, row, col, s) {
    var t = art.text(s), i, k;
    for (i = 0; i < t.length && col + i < 32; i++) {
      k = nt * 1024 + row * 32 + col + i;
      if (g.hud[k] === t[i]) continue;
      g.hud[k] = t[i];
      nes0.ppu.setTile(nt, col + i, row, t[i]);
    }
  }
  function pad(n, w) { var s = String(Math.max(0, n | 0)); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s += ' '; return s.substring(0, w); }
  function say(s, t) { g.msg = s; g.msgT = t || 90; }

  var BIG = { P: '111,101,111,100,100', O: '111,101,101,101,111' };
  function bigWord(word, col, row) {
    for (var i = 0; i < word.length; i++) {
      var rows = BIG[word.charAt(i)].split(',');
      for (var y = 0; y < 5; y++) for (var x = 0; x < 3; x++) if (rows[y].charAt(x) === '1') nes0.ppu.setTile(0, col + i * 4 + x, row + y, art.t('BLK'));
    }
  }
  function setPals(name) {
    var P = PAL[name], ppu = nes0.ppu;
    ppu.setBackdrop(P.bd);
    for (var i = 0; i < 4; i++) { ppu.setBgPalette(i, P.bg[i]); ppu.setSprPalette(i, PAL.spr[i]); }
  }
  function clearScreen() {
    var ppu = nes0.ppu;
    ppu.split(null); ppu.scroll(0, 0, 0); ppu.mirroring('v');
    ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillAttr(0, 0, 0, 16, 15, 0);
    ppu.fillTiles(1, 0, 0, 32, 30, 0); ppu.fillAttr(1, 0, 0, 16, 15, 0);
    ppu.clearSprites(); g.sprUsed = 0; g.hud = {};
  }
  function frameBox(nt, top, bottom) {
    var ppu = nes0.ppu, c, r;
    for (c = 0; c < 32; c++) { ppu.setTile(nt, c, top, art.t('FR_T')); if (bottom >= 0) ppu.setTile(nt, c, bottom, art.t('FR_T')); }
    for (r = top + 1; r < (bottom >= 0 ? bottom : 30); r++) { ppu.setTile(nt, 0, r, art.t('FR_L')); ppu.setTile(nt, 31, r, art.t('FR_L')); }
    ppu.setTile(nt, 0, top, art.t('FR_C')); ppu.setTile(nt, 31, top, art.t('FR_C'));
  }

  /* ---------------- 最高分 ---------------- */
  function bestOf(m) { return CT.load('pop', 'best_' + m, 0); }
  function saveBest() {
    if (!g || g.mode === 'title') return;
    if (g.score > bestOf(g.sub)) CT.save('pop', 'best_' + g.sub, g.score);
    if (g.sub === 'burrow' && g.score > CT.load('pop', 'best', 0)) CT.save('pop', 'best', g.score);
  }

  /* ---------------- 標題 ---------------- */
  var DESC = {
    bubble: ['POP LINKED BUBBLES OF ONE', 'COLOR. SAME COLOR = CHAIN'],
    balloon: ['SHOOT BALLOONS BEFORE TIME', 'IS UP. NEVER HIT THE BLACK'],
    burrow: ['BOP THE POP-UP SPROUTS!', 'DPAD AIMS 9 HOLES  A BOPS']
  };
  function drawMenu() {
    for (var i = 0; i < 3; i++) {
      var m = MODES[i];
      hud(0, 14 + i * 2, 3, (g.sel === i ? '>' : ' ') + ' ' + padR(MODE_NAME[m], 13) + 'BEST ' + pad(bestOf(m), 6));
    }
    hud(0, 21, 3, padR(DESC[MODES[g.sel]][0], 27));
    hud(0, 23, 3, padR(DESC[MODES[g.sel]][1], 27));
  }
  function enterTitle() {
    g.mode = 'title'; g.t = 0; g.paused = false;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals('title');
      frameBox(0, 3, 28);
      ppu.fillAttr(0, 0, 0, 16, 2, 1); ppu.fillAttr(0, 0, 2, 1, 13, 1); ppu.fillAttr(0, 15, 2, 1, 13, 1); ppu.fillAttr(0, 0, 14, 16, 1, 1);
      text(0, 12, 5, 'STARDUST');
      bigWord('POP', 10, 7);
      ppu.fillAttr(0, 1, 2, 14, 4, 3);
      // 吉祥物（背景磚）：左邊一顆泡泡、右邊一隻噗噗芽
      for (var q = 0; q < 4; q++) {
        ppu.setTile(0, 4 + (q & 1), 8 + (q >> 1), art.t('BUB' + q));
        ppu.setTile(0, 26 + (q & 1), 8 + (q >> 1), art.t('BLIP_3_' + q));
      }
      ppu.setAttr(0, 2, 4, 2); ppu.setAttr(0, 13, 4, 1);
      text(0, 3, 25, 'START GO  C/* = CHEAT');            // P3-5：CHEAT 說明固定顯示，只有 START GO 會閃
      text(0, 4, 27, 'HOLD START+SELECT: MENU');
      g.hud = {};
      drawMenu();
    });
    AU.play('pop_title');
  }
  function startMode(m) {
    var keepBot = g.bot, runs = g.runs + 1, sel = g.sel;
    g = newState(); g.bot = keepBot; g.runs = runs; g.sel = sel; g.sub = m; g.mode = 'play';
    g.seed = 307 + runs * 7919;
    if (m === 'bubble') { initBubble(); AU.play('pop_title'); }
    else if (m === 'balloon') { initBalloon(1); AU.play('pop_rush'); }
    else { initBurrow(); AU.play('pop_rush'); }
  }

  /* ---------------- 游標（§1-4） ---------------- */
  function updateCursor(x0, x1, y0, y1) {
    var I = NES.Input, c = g.cur, fine = I.held(BTN.B);
    var dx = I.held(BTN.LEFT) ? -1 : (I.held(BTN.RIGHT) ? 1 : 0), dy = I.held(BTN.UP) ? -1 : (I.held(BTN.DOWN) ? 1 : 0);
    if (dx) { c.hx++; c.x += dx * (fine || c.hx <= 8 ? 1 : 3); } else c.hx = 0;
    if (dy) { c.hy++; c.y += dy * (fine || c.hy <= 8 ? 1 : 3); } else c.hy = 0;
    c.x = Math.max(x0, Math.min(x1, c.x)); c.y = Math.max(y0, Math.min(y1, c.y));
    if (c.fire > 0) c.fire--;
  }
  function fx(x, y, name, pal, t) { g.fx.push({ x: x, y: y, tile: art.s(name), pal: pal, t: t || 12 }); if (g.fx.length > 2) g.fx.shift(); }

  /* ================= 戳泡泡 ================= */
  function cell(k, cc) { var r = g.grid[k % 15]; return r ? r[cc] : null; }
  function live(k) { return k >= g.esc && k < g.made; }
  function bspeed() { return 40 + Math.min(12, g.lv) * 8; }
  function initBubble() {
    g.grid = []; for (var i = 0; i < 15; i++) g.grid.push([]);
    g.S = 0; g.sq = 0; g.made = 0; g.esc = 0; g.wq = []; g.anims = [];
    g.cur.x = 128; g.cur.y = 120;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals('bubble');
      var r;
      for (r = 0; r < 30; r++) { ppu.setTile(0, 0, r, art.t('FR_L')); ppu.setTile(0, 31, r, art.t('FR_L')); }
      frameBox(1, 25, -1);
      while (g.made < 15) genRow(g.made < 8);
      flushAll();
      g.hud = {};
      drawHud();
    });
  }
  // 產生第 k 列（絕對列號），寫入佇列；empty = 開場空白區
  function genRow(empty) {
    var k = g.made++, row = g.grid[k % 15], cc;
    var dens = Math.min(44, 18 + g.lv * 2);
    for (cc = 1; cc <= 14; cc++) {
      var v = null;
      if (!empty && (rnd() % 100) < dens) {
        var above = k > 0 ? cell(k - 1, cc) : null, left = row[cc - 1];
        var col = 1 + rnd() % 3;
        if ((rnd() % 100) < 60) { if (above && above.c && live(k - 1)) col = above.c; else if (left && cc > 1) col = left.c; }
        var tp = 'n', r2 = rnd() % 100;
        if (g.lv >= 2 && r2 < 8) tp = 'i'; else if (r2 >= 97) tp = 's';
        v = { c: col, t: tp };
      }
      row[cc] = v;
      queueCell(k, cc, v ? (v.t === 'i' ? 'IBU' : (v.t === 's' ? 'SBU' : 'BUB')) : null, v ? v.c : 0);
    }
  }
  function queueCell(k, cc, prefix, pal) {
    var r = (k % 15) * 2, c = cc * 2, q = g.wq;
    for (var i = 0; i < 4; i++) q.push([c + (i & 1), r + (i >> 1), prefix ? art.t(prefix + i) : 0]);
    if (pal) q.push(['a', cc, k % 15, pal]);
  }
  function flushQueue(limit) {
    var ppu = nes0.ppu, n = 0, q = g.wq;
    while (q.length && n < limit) {
      var o = q.shift();
      if (o[0] === 'a') ppu.setAttr(0, o[1], o[2], o[3]); else ppu.setTile(0, o[0], o[1], o[2]);
      n++;
    }
    if (q.length > g.wqPeak) g.wqPeak = q.length;
  }
  function flushAll() { flushQueue(100000); }
  function popCell(k, cc, delay) {
    var r = g.grid[k % 15];
    r[cc] = null;
    g.anims.push({ k: k, cc: cc, t: delay, st: 0 });
  }
  function group(k, cc) {
    var c0 = cell(k, cc), out = [], seen = {}, q = [[k, cc, 0]];
    seen[k + ',' + cc] = 1;
    while (q.length) {
      var p = q.shift(); out.push(p);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nk = p[0] + d[0], nc = p[1] + d[1], key = nk + ',' + nc;
        if (seen[key] || nc < 1 || nc > 14 || !live(nk)) return;
        var v = cell(nk, nc);
        if (!v || v.t === 'i' || v.c !== c0.c) return;
        seen[key] = 1; q.push([nk, nc, p[2] + 1]);
      });
    }
    return out;
  }
  function cursorCell() {
    var wy = g.S + g.cur.y, k = Math.floor(wy / 16), cc = Math.floor(g.cur.x / 16);
    if (cc < 1 || cc > 14 || !live(k) || g.cur.y >= B_SPLIT) return null;
    return { k: k, cc: cc, v: cell(k, cc) };
  }
  function pokeBubble() {
    var hit = cursorCell();
    g.cur.fire = 6;
    if (!hit || !hit.v) { AU.sfx('pop_move'); return; }
    var v = hit.v, n = 0, i;
    if (v.t === 'i') {
      v.t = 'n'; queueCell(hit.k, hit.cc, 'BUB', v.c); g.score += 5; AU.sfx('pop_ice'); return;
    }
    if (v.t === 's') {
      for (var dk = -1; dk <= 1; dk++) for (var dc = -1; dc <= 1; dc++) {
        var k = hit.k + dk, c = hit.cc + dc;
        if (c < 1 || c > 14 || !live(k) || !cell(k, c)) continue;
        popCell(k, c, (Math.abs(dk) + Math.abs(dc)) * 3); n++;
      }
      g.score += n * 30 * g.lv; g.popped += n; AU.sfx('pop_chain');
      say('STAR BURST x' + n, 60);
    } else {
      var grp = group(hit.k, hit.cc);
      n = grp.length;
      for (i = 0; i < grp.length; i++) popCell(grp[i][0], grp[i][1], grp[i][2] * 3);
      if (v.c === g.lastColor && g.chainT > 0) g.cchain = Math.min(4, g.cchain + 1); else g.cchain = 1;
      g.lastColor = v.c; g.chainT = 150;
      var pts = 10 * n * n * g.cchain;
      g.score += pts; g.popped += n;
      if (n > g.bestGroup) g.bestGroup = n;
      if (n >= 3 && g.pressure > 0) g.pressure--;
      AU.sfx(n >= 3 ? 'pop_chain' : 'pop_pop');
      if (n >= 3 || g.cchain > 1) say(n + ' LINKED ' + COLOR_NAME[v.c] + (g.cchain > 1 ? '  CHAIN x' + g.cchain : '') + '  +' + pts, 70);
    }
    fx(g.cur.x - 4, g.cur.y - 4, 'SPARK', 0, 10);
    var need = 30 + g.lv * 10;
    if (g.popped >= need) { g.popped -= need; g.lv++; AU.sfx('pop_level'); say('LEVEL ' + g.lv + '  FASTER!', 100); }
  }
  function updateBubble() {
    var I = NES.Input;
    updateCursor(12, 243, 12, B_SPLIT - 4);
    if (g.chainT > 0) g.chainT--;
    if (I.pressed(BTN.A)) pokeBubble();
    g.sq += bspeed();
    g.S = g.sq >> 8;
    // 漂出頂端
    while (g.esc * 16 < g.S) {
      var row = g.grid[g.esc % 15], n = 0;
      for (var cc = 1; cc <= 14; cc++) if (row[cc]) { n++; row[cc] = null; }
      g.esc++;
      if (n) {
        g.escaped += n; g.pressure += n; AU.sfx('pop_bad');
        if (g.pressure >= P_MAX) { g.pressure = P_MAX; enterOver(); return; }
      }
    }
    while (g.made * 16 - g.S < 240) genRow(false);
    // 破裂動畫：延遲 t 幀後畫破片、再 6 幀清空
    for (var i = g.anims.length - 1; i >= 0; i--) {
      var a = g.anims[i];
      if (a.t > 0) { a.t--; continue; }
      if (a.st === 0) { queueCell(a.k, a.cc, 'PB', 0); a.st = 1; a.t = 6; }
      else { if (!cell(a.k, a.cc) && a.k >= g.made - 15) queueCell(a.k, a.cc, null, 0); g.anims.splice(i, 1); }
    }
    flushQueue(110);
  }

  /* ================= 氣球射擊 ================= */
  function initBalloon(stage) {
    g.stage = stage; g.bals = []; g.timer = BAL_TIME; g.quota = 16 + stage * 3; g.pops = 0; g.spawnT = 0;   // fix-r6：配額 16 + 3 × 關數
    g.cur.x = 128; g.cur.y = 112;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals('balloon');
      // fix-r6 P3-4：黃昏星港（夜空星星 + 新月 → 紫 → 粉 → 橘霞，底部星港城牆 / 發射塔剪影；氣球從畫面下緣外升起）
      var c, r, SKY = [null, null, null, null, 0, 0, 0, 0, 0, 0, 'D01a', 'D01b', 'D01c', 'SK1', 'SK1', 'SK1',
        'D12a', 'D12b', 'D12c', 'SK2', 'D12a', 'D12b', 'D12c', 'SK2', 'SK2', 'SK2'];
      for (c = 0; c < 32; c++) ppu.setTile(0, c, 3, art.t('FR_T'));
      for (r = 4; r < 24; r++) for (c = 0; c < 32; c++) if (SKY[r]) ppu.setTile(0, c, r, art.t(SKY[r]));
      var STARS = [[1, 4], [5, 7], [8, 5], [11, 9], [14, 4], [17, 8], [20, 6], [22, 9], [27, 8], [30, 5], [3, 9], [9, 8], [15, 6], [19, 4], [29, 7], [12, 6]];
      for (var k = 0; k < STARS.length; k++)              // 星星只撒在夜空帶（列 4~9），位置固定
        ppu.setTile(0, STARS[k][0], STARS[k][1], art.t(['STA', 'STB', 'STC'][k % 3]));
      ppu.setTile(0, 24, 5, art.t('MOON0')); ppu.setTile(0, 25, 5, art.t('MOON1'));
      ppu.setTile(0, 24, 6, art.t('MOON2')); ppu.setTile(0, 25, 6, art.t('MOON3'));
      var SIL = CT.Pop.Art.SIL;
      for (r = 0; r < 6; r++) for (c = 0; c < 32; c++) ppu.setTile(0, c, 24 + r, art.t(SIL[r][c]));
      ppu.fillAttr(0, 0, 0, 16, 2, 0);
      ppu.fillAttr(0, 0, 2, 16, 8, 1);                     // 列 4~19：調色盤 1（夜空 / 紫 / 粉）
      ppu.fillAttr(0, 0, 10, 16, 3, 2);                    // 列 20~25：調色盤 2（粉 → 橘霞 + 塔尖）
      ppu.fillAttr(0, 0, 13, 16, 2, 3);                    // 列 26~29：調色盤 3（城牆 + 燈）
      drawHud();
    });
    say('STAGE ' + stage + '  POP ' + g.quota + '!', 120);
  }
  function balSpeed() { return 96 + Math.min(9, g.stage) * 22; }
  function balX(b) {
    var t = (g.t + b.ph) & 255;
    if (b.pat === 1) return b.x + (((t < 128 ? t : 255 - t) >> 3) - 8);
    if (b.pat === 2) return b.x + ((g.t + b.ph) % 160 < 80 ? (((g.t + b.ph) % 80) >> 2) : 20 - (((g.t + b.ph) % 80) >> 2)) - 10;
    return b.x;
  }
  function spawnBalloon() {
    if (g.bals.length >= BAL_MAX) return false;
    var y0 = 240, n = 0;               // fix-r6 P3-4：從畫面下緣外升起（不是從地面草叢飛出）
    for (var i = 0; i < g.bals.length; i++) if (Math.abs((g.bals[i].y >> 8) - y0) < 24) n++;
    if (n >= 2) return false;
    var r = rnd() % 100, black = Math.min(30, 8 + g.stage * 4), type = 'red';
    if (r < black) type = 'black';
    else if (r < black + 6) type = 'gold';
    else if (r < black + 40) type = 'green';
    g.bals.push({ x: 28 + rnd() % 184, y: y0 * Q, type: type, pat: rnd() % 3, ph: rnd() & 255, popT: 0 });
    return true;
  }
  function shootBalloon() {
    var cx = g.cur.x, cy = g.cur.y, hit = -1, i;
    g.cur.fire = 10; g.shots++;
    AU.sfx('pop_shot');
    for (i = g.bals.length - 1; i >= 0; i--) {
      var b = g.bals[i];
      if (b.popT) continue;
      var x = balX(b), y = b.y >> 8;
      if (cx >= x - 1 && cx <= x + 16 && cy >= y - 1 && cy <= y + 15) { hit = i; break; }
    }
    if (hit < 0) return;
    var B = g.bals[hit];
    B.popT = 12;
    if (B.type === 'black') {
      g.timer = Math.max(0, g.timer - 300); g.score = Math.max(0, g.score - 30); g.blacks++; g.combo = 0;
      AU.sfx('pop_bad'); say('STORM BALLOON!  -5 SEC', 80);
      return;
    }
    g.pops++; g.combo++;
    var pts = B.type === 'gold' ? 50 : (B.type === 'green' ? 20 : 10);
    pts *= g.stage;
    if (g.combo >= 5) pts *= 2;
    g.score += pts;
    if (B.type === 'gold') { g.timer += 180; say('GOLD!  +3 SEC', 60); }
    AU.sfx('pop_burst');
    if (g.pops === g.quota) { AU.sfx('pop_level'); say('QUOTA CLEAR!  KEEP GOING', 90); }
  }
  function updateBalloon() {
    var I = NES.Input;
    updateCursor(12, 243, 36, 210);
    if (I.pressed(BTN.A) && g.cur.fire === 0) shootBalloon();
    if (g.timer > 0) g.timer--;
    if (g.timer === 0) {
      if (g.pops >= g.quota) {
        var bonus = (g.pops - g.quota) * 20 * g.stage + 200 * g.stage;
        g.score += bonus; AU.sfx('pop_level');
        initBalloon(g.stage + 1);
        say('STAGE CLEAR!  BONUS ' + bonus, 120);
      } else enterOver();
      return;
    }
    if (++g.spawnT >= Math.max(18, 44 - g.stage * 4)) { if (spawnBalloon()) g.spawnT = 0; }
    var vy = balSpeed();
    for (var i = g.bals.length - 1; i >= 0; i--) {
      var b = g.bals[i];
      b.y -= vy;
      if (b.popT && --b.popT === 0) { g.bals.splice(i, 1); continue; }
      if ((b.y >> 8) < 24) g.bals.splice(i, 1);     // 飄進上框 = 飛走
    }
  }

  /* ================= 敲噗噗芽 ================= */
  function podGeo(i) { var c0 = 5 + (i % 3) * 8, r0 = 6 + ((i / 3) | 0) * 6; return { c0: c0, r0: r0, x: (c0 + 1) * 8, y: r0 * 8 }; }
  function initBurrow() {
    g.pods = []; for (var i = 0; i < 9; i++) g.pods.push({ type: null, lvl: 0, ph: '', t: 0, upT: 0, drawn: '', cool: 0, fake: 0, spat: false });
    g.timer = ROUND; g.elapsed = 0; g.spawnK = 30;
    var ppu = nes0.ppu;
    CT.blank(nes0, function () {
      clearScreen(); setPals('burrow');
      frameBox(0, 3, 28);
      var r, c;
      for (r = 4; r < 28; r++) for (c = 1; c < 31; c++) if (((c * 7 + r * 13) % 5) === 0) ppu.setTile(0, c, r, art.t(((c + r) & 1) ? 'SOIL1' : 'SOIL2'));
      for (i = 0; i < 9; i++) {
        var G = podGeo(i);
        for (var q = 0; q < 4; q++) { ppu.setTile(0, G.c0 + q, G.r0 + 2, art.t('RIM_' + q)); ppu.setTile(0, G.c0 + 1 + (q & 1), G.r0 + (q >> 1), 0); }
      }
      drawHud();
    });
    g.selPod = 4;
    say('BOP ' + GOAL_SCORE + ' POINTS!  GO!', 120);
  }
  function burrowPhase() { return Math.min(3, (g.elapsed / 900) | 0); }
  function pickType() {
    var ph = burrowPhase(), r = rnd() % 100;
    var table = [[['BLIP', 85], ['GOLDY', 15]],
                 [['BLIP', 62], ['GOLDY', 13], ['THORN', 25]],
                 [['BLIP', 45], ['GOLDY', 12], ['THORN', 22], ['FAKER', 21]],
                 [['BLIP', 33], ['GOLDY', 12], ['THORN', 20], ['FAKER', 18], ['SPITTER', 17]]][ph];
    for (var i = 0; i < table.length; i++) { if (r < table[i][1]) return table[i][0]; r -= table[i][1]; }
    return 'BLIP';
  }
  function spawnPod() {
    var empty = [], i;
    for (i = 0; i < 9; i++) if (!g.pods[i].type && g.pods[i].cool === 0) empty.push(i);
    if (!empty.length) return;
    var p = g.pods[empty[rnd() % empty.length]], tp = pickType();
    p.type = tp; p.t = 0; p.lvl = 0; p.spat = false;
    p.upT = Math.max(34, 74 - burrowPhase() * 10 - ((g.elapsed / 300) | 0));
    if (tp === 'GOLDY') p.upT = (p.upT * 2 / 3) | 0;
    p.ph = tp === 'FAKER' ? 'peek' : 'rise';
  }
  function podTick(i) {
    var p = g.pods[i];
    if (p.cool > 0) p.cool--;
    if (!p.type) return;
    p.t++;
    switch (p.ph) {
      case 'peek': p.lvl = 1; if (p.t >= 24) { p.ph = 'dip'; p.t = 0; } break;
      case 'dip': p.lvl = 0; if (p.t >= 14) { p.ph = 'rise'; p.t = 0; p.upT = Math.max(24, (p.upT * 0.6) | 0); } break;
      case 'rise': p.lvl = p.t < 4 ? 1 : (p.t < 8 ? 2 : 3); if (p.t >= 8) { p.ph = 'up'; p.t = 0; } break;
      case 'up':
        p.lvl = 3;
        if (p.type === 'SPITTER' && !p.spat && p.t >= 36 && !g.spore) {
          p.spat = true;
          var a = podGeo(i), b = podGeo(g.selPod);
          g.spore = { x0: a.x + 4, y0: a.y + 4, x1: b.x + 4, y1: b.y + 4, t: 0, T: 30, target: g.selPod, from: i };
          AU.sfx('pop_shot'); say('SPORE INCOMING!', 50); g.combo = 0;
          p.ph = 'sink'; p.t = 0;
        } else if (p.t >= p.upT) { p.ph = 'sink'; p.t = 0; if (p.type !== 'THORN' && g.combo) { g.combo = 0; } }
        break;
      case 'sink': p.lvl = p.t < 4 ? 2 : (p.t < 8 ? 1 : 0); if (p.t >= 8) { p.type = null; p.lvl = 0; p.cool = 12; } break;
      case 'hit': p.lvl = 4; if (p.t >= 18) { p.type = null; p.lvl = 0; p.cool = 14; } break;
      case 'laugh': p.lvl = 3; if (p.t >= 30) { p.ph = 'sink'; p.t = 0; } break;
    }
  }
  function podDraw(i) {
    var p = g.pods[i], key = p.type && p.lvl ? p.type + p.lvl : '', ppu = nes0.ppu;
    if (key === p.drawn) return;
    var G = podGeo(i);
    if (p.type && CREATURE_PAL[p.type] !== p.pal) { p.pal = CREATURE_PAL[p.type]; ppu.setAttr(0, (G.c0 + 1) >> 1, G.r0 >> 1, p.pal); }
    for (var q = 0; q < 4; q++) ppu.setTile(0, G.c0 + 1 + (q & 1), G.r0 + (q >> 1), key ? art.t(p.type + '_' + p.lvl + '_' + q) : 0);
    p.drawn = key;
  }
  function selFromPad() {
    var I = NES.Input;
    var dx = I.held(BTN.LEFT) ? -1 : (I.held(BTN.RIGHT) ? 1 : 0), dy = I.held(BTN.UP) ? -1 : (I.held(BTN.DOWN) ? 1 : 0);
    return (1 + dy) * 3 + (1 + dx);
  }
  function hittable(p) { return p.type && p.lvl >= 2 && p.ph !== 'hit' && p.ph !== 'laugh'; }
  function bop() {
    var p = g.pods[g.selPod];
    g.mal = 10;
    if (!hittable(p)) { g.combo = 0; g.whiffs++; AU.sfx('pop_whiff'); return; }
    if (p.type === 'THORN') {
      g.score = Math.max(0, g.score - 200); g.stun = 45; g.combo = 0; g.thorns++;
      p.ph = 'laugh'; p.t = 0; AU.sfx('pop_stun'); say('OUCH! THORN  -200', 70);
      return;
    }
    g.combo++; g.hitsN++;
    if (g.combo > g.maxCombo) g.maxCombo = g.combo;
    var pts = CREATURE_PTS[p.type] * (g.combo >= FEVER ? 2 : 1);
    g.score += pts;
    p.ph = 'hit'; p.t = 0;
    if (p.type === 'SPITTER' && g.spore && g.spore.from === g.selPod) g.spore = null;
    var G = podGeo(g.selPod);
    fx(G.x + 4, G.y - 6, 'SPARK', 0, 10);
    AU.sfx('pop_whack');
    if (g.combo === FEVER) say('FEVER! POINTS x2', 70);
    if (!g.cheated && g.score >= GOAL_SCORE && !g.goalHit) { g.goalHit = true; say('TARGET ' + GOAL_SCORE + ' CLEAR!', 100); AU.sfx('pop_level'); }
  }
  function updateBurrow() {
    var I = NES.Input, i;
    g.selPod = selFromPad();
    if (g.mal > 0) g.mal--;
    if (g.stun > 0) g.stun--;
    else if (I.pressed(BTN.A) && g.mal <= 4) bop();
    g.elapsed++;
    if (g.timer > 0) g.timer--;
    if (g.timer === 0) { enterOver(); return; }
    var every = Math.max(16, 44 - burrowPhase() * 7 - ((g.elapsed / 600) | 0));
    if (--g.spawnK <= 0) { spawnPod(); g.spawnK = every; if (burrowPhase() >= 2 && (rnd() % 100) < 30) spawnPod(); }
    for (i = 0; i < 9; i++) podTick(i);
    if (g.spore) {
      var s = g.spore;
      if (++s.t >= s.T) {
        if (g.selPod === s.target && g.stun === 0) { g.stun = 45; g.score = Math.max(0, g.score - 50); g.combo = 0; AU.sfx('pop_stun'); say('SPORED!  DIZZY', 60); }
        g.spore = null;
      }
    }
    for (i = 0; i < 9; i++) podDraw(i);
  }

  /* ---------------- HUD ---------------- */
  function bar(n, max, w) { var s = '', k = Math.round(n * w / max); for (var i = 0; i < w; i++) s += i < k ? '*' : '-'; return s; }
  function drawHud() {
    var l1, l2, nt = 0, r1 = 1, r2 = 2;
    if (g.sub === 'bubble') {
      nt = 1; r1 = 26; r2 = 27;
      l1 = 'SCORE ' + pad(g.score, 6) + '  LV ' + pad(g.lv, 2) + '  CHAIN x' + g.cchain;
      l2 = 'PRESSURE ' + bar(g.pressure, P_MAX, 12) + (g.pressure >= P_MAX - 3 && (g.t & 16) ? ' !!' : '   ');
    } else if (g.sub === 'balloon') {
      l1 = 'SCORE ' + pad(g.score, 6) + '  STAGE ' + g.stage + '  TIME ' + pad(Math.ceil(g.timer / 60), 2);
      l2 = 'POP ' + pad(g.pops, 2) + '/' + pad(g.quota, 2) + (g.pops >= g.quota ? ' OK' : '   ') + (g.combo >= 5 ? '  FEVER x2' : '');
    } else {
      l1 = 'SCORE ' + pad(g.score, 6) + ' TIME ' + pad(Math.ceil(g.timer / 60), 2) + ' GOAL ' + GOAL_SCORE;
      l2 = 'COMBO ' + pad(g.combo, 2) + (g.combo >= FEVER ? '  FEVER x2' : '') + (g.score >= GOAL_SCORE ? '  CLEAR!' : '');
    }
    if (g.paused) l2 = 'PAUSE  HOLD START+SELECT: MENU';
    else if (g.msgT > 0) l2 = g.msg;
    hud(nt, r1, 1, padR(l1, 30));
    hud(nt, r2, 1, padR(l2, 30));
  }

  /* ---------------- 結束 / 續關 ---------------- */
  function rankOf(s) { return s >= 20000 ? 'S' : (s >= 14000 ? 'A' : (s >= GOAL_SCORE ? 'B' : 'C')); }
  function enterOver() {
    g.mode = 'over'; g.overT = 0;
    var nb = g.score > bestOf(g.sub);
    saveBest();
    CT.blank(nes0, function () {
      clearScreen(); setPals('title');
      frameBox(0, 3, 28);
      var ppu = nes0.ppu;
      ppu.fillAttr(0, 0, 0, 16, 2, 1); ppu.fillAttr(0, 0, 2, 1, 13, 1); ppu.fillAttr(0, 15, 2, 1, 13, 1); ppu.fillAttr(0, 0, 14, 16, 1, 1);
      text(0, g.sub === 'burrow' ? 11 : 11, 6, g.sub === 'balloon' || g.sub === 'bubble' ? 'GAME OVER' : 'TIME UP!');
      ppu.fillAttr(0, 1, 3, 14, 1, 3);
      text(0, 6, 9, MODE_NAME[g.sub]);
      text(0, 6, 11, 'SCORE      ' + pad(g.score, 6) + (nb ? ' NEW!' : ''));
      if (g.sub === 'burrow') {
        text(0, 6, 13, 'HITS ' + pad(g.hitsN, 3) + '  MAX COMBO ' + pad(g.maxCombo, 2));
        text(0, 6, 15, 'RANK       ' + rankOf(g.score) + (g.score >= GOAL_SCORE ? '  TARGET OK' : ''));
      } else if (g.sub === 'balloon') {
        text(0, 6, 13, 'STAGE      ' + g.stage + '   POP ' + pad(g.pops, 2) + '/' + pad(g.quota, 2));
        text(0, 6, 15, 'SHOTS      ' + pad(g.shots, 3));
      } else {
        text(0, 6, 13, 'LEVEL      ' + pad(g.lv, 2) + '   LINK ' + pad(g.bestGroup, 2));
        text(0, 6, 15, 'ESCAPED    ' + pad(g.escaped, 3));
      }
      text(0, 6, 17, 'RECORD     ' + pad(bestOf(g.sub), 6));
      text(0, 6, 20, 'START  TITLE');
      text(0, 6, 22, 'C/*    CONTINUE HERE');
    });
    AU.play('pop_over');
  }
  function continueHere() {
    g.cheated = true; g.continues++; g.mode = 'play'; g.paused = false; g.msgT = 0;
    var sc = g.score;
    if (g.sub === 'bubble') {
      var lv = g.lv; initBubble(); g.lv = lv; g.pressure = 0; AU.play('pop_title'); say('CONTINUE!  LEVEL ' + lv, 90);
    } else if (g.sub === 'balloon') {
      initBalloon(g.stage); AU.play('pop_rush'); say('CONTINUE!  STAGE ' + g.stage, 90);
    } else {
      initBurrow(); g.timer = 1200; AU.play('pop_rush'); say('CONTINUE!  +20 SEC', 90);
    }
    g.score = sc;
    AU.sfx('pop_level');
  }
  function doCheat() {
    if (g.mode === 'over') { continueHere(); return; }
    if (g.mode !== 'play') return;
    g.cheated = true;
    if (g.sub === 'bubble') { g.pressure = 0; say('STAR POWER!  PRESSURE 0', 90); }
    else { g.timer += 900; say('STAR POWER!  +15 SEC', 90); }
    AU.sfx('pop_level');
  }

  /* ---------------- 主迴圈 ---------------- */
  function updatePlay() {
    var I = NES.Input;
    if (I.pressed(BTN.START) && !I.held(BTN.SELECT)) {
      g.paused = !g.paused;
      if (g.paused) AU.pause(); else AU.resume();
      drawHud();
    }
    if (g.paused) return;
    g.t++;
    if (g.msgT > 0) g.msgT--;
    for (var i = g.fx.length - 1; i >= 0; i--) if (--g.fx[i].t <= 0) g.fx.splice(i, 1);
    if (g.sub === 'bubble') updateBubble();
    else if (g.sub === 'balloon') updateBalloon();
    else updateBurrow();
  }

  /* ---------------- 精靈 ---------------- */
  function drawSprites() {
    var ppu = nes0.ppu, n = 0, i;
    function spr(x, y, tile, pal, fh) {
      if (n >= 64 || y > 231 || y < -7 || x < -7 || x > 255) return;
      ppu.sprite(n++, { x: x, y: y, tile: tile, pal: pal, flipH: !!fh });
    }
    function quad(x, y, name, pal) { for (var q = 0; q < 4; q++) spr(x + (q & 1) * 8, y + (q >> 1) * 8, art.s(name + q), pal); }
    if (g.mode === 'title') {
      // 標題：星環游標在左邊的泡泡上晃
      quad(32 + ((g.t >> 4) & 1), 64 + ((g.t >> 5) & 1), (g.t & 63) < 8 ? 'RINGF' : 'RING', 0);
    } else if (g.mode === 'play') {
      if (g.sub === 'bubble' || g.sub === 'balloon') {
        quad(g.cur.x - 8, g.cur.y - 8, g.cur.fire > 0 ? 'RINGF' : 'RING', 0);
        if (g.sub === 'balloon') {
          for (i = 0; i < g.bals.length; i++) {
            var b = g.bals[i], x = balX(b), y = b.y >> 8, pal = b.type === 'black' ? 3 : (b.type === 'gold' ? 0 : (b.type === 'green' ? 2 : 1));
            if (b.popT) { quad(x, y, 'BURST', pal); continue; }
            quad(x, y, 'BAL', pal); spr(x + 4, y + 16, art.s('BALS'), pal, ((g.t + b.ph) >> 4) & 1);
          }
        }
      } else {
        var G = podGeo(g.selPod);
        if (g.mal > 4) quad(G.x + 4, G.y - 6, 'MALS', 0);
        else quad(G.x + 10, G.y - 14, 'MAL', 0);
        if (g.stun > 0) spr(G.x + 12, G.y - 20 + ((g.t >> 2) & 3), art.s('DIZZY'), 0);
        if (g.spore) {
          var s = g.spore, k = s.t / s.T;
          spr(Math.round(s.x0 + (s.x1 - s.x0) * k), Math.round(s.y0 + (s.y1 - s.y0) * k - Math.sin(k * Math.PI) * 24), art.s('SPORE'), 2);
        }
      }
      for (i = 0; i < g.fx.length; i++) spr(g.fx[i].x, g.fx[i].y, g.fx[i].tile, g.fx[i].pal);
    }
    for (i = n; i < g.sprUsed; i++) ppu.sprite(i, null);
    g.sprUsed = n;
  }

  /* ================= 機器人 ================= */
  function cursorTo(tx, ty) {
    var c = g.cur, m = 0, dx = tx - c.x, dy = ty - c.y;
    // 加速後一步 3 px：剩 ≤ 3 px 就放開（下次重新從 1 px 起步）
    if (dx > 0) m |= (dx > 3 || c.hx === 0) ? BTN.RIGHT : 0; else if (dx < 0) m |= (dx < -3 || c.hx === 0) ? BTN.LEFT : 0;
    if (dy > 0) m |= (dy > 3 || c.hy === 0) ? BTN.DOWN : 0; else if (dy < 0) m |= (dy < -3 || c.hy === 0) ? BTN.UP : 0;
    return m;
  }
  function pressA(B, ok) {           // 只在「上一幀沒按」時按（按下邊緣；不每幀狂按）
    if (ok && !B.lastA) { B.lastA = true; return BTN.A; }
    B.lastA = false; return 0;
  }
  function botMask() {
    var B = g.bot, want = (CT.query && CT.query('mode')) || 'burrow';
    B.t++;
    if (g.mode === 'title') {
      var idx = MODES.indexOf(want); if (idx < 0) idx = 2;
      if (g.sel !== idx) return (B.t % 8 === 4) ? (g.sel < idx ? BTN.DOWN : BTN.UP) : 0;
      return (B.t % 30 === 15) ? BTN.START : 0;
    }
    if (g.mode === 'over') return (g.overT > 60 && B.t % 40 === 20) ? BTN.START : 0;
    if (g.paused) return (B.t % 40 === 20) ? BTN.START : 0;
    if (g.sub === 'burrow') return botBurrow(B);
    if (g.sub === 'bubble') return botBubble(B);
    return botBalloon(B);
  }
  var DIRS = [BTN.UP | BTN.LEFT, BTN.UP, BTN.UP | BTN.RIGHT, BTN.LEFT, 0, BTN.RIGHT, BTN.DOWN | BTN.LEFT, BTN.DOWN, BTN.DOWN | BTN.RIGHT];
  function botBurrow(B) {
    var best = -1, bs = -1, i;
    for (i = 0; i < 9; i++) {
      var p = g.pods[i];
      // 反應時間：冒出來（可敲）≥ 6 幀才出手
      if (hittable(p) && p.type !== 'THORN') B.seen[i] = (B.seen[i] || 0) + 1; else B.seen[i] = 0;
      if (B.seen[i] < B.lag) continue;
      if (g.spore && g.spore.target === i && g.spore.t > 14) continue;
      var sc = CREATURE_PTS[p.type] + (p.type === 'SPITTER' ? 150 : 0) - p.t;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) {
      // 沒得敲：躲開孢子 / 回中央待命
      var idle = 4;
      if (g.spore && g.spore.target === 4) idle = 1;
      B.lastA = false;
      return DIRS[idle];
    }
    return DIRS[best] | pressA(B, g.stun === 0 && g.mal <= 4 && g.selPod === best);
  }
  function botBubble(B) {
    // 目標：靠近頂端（快漂走）的最大同色群
    var best = null, k, cc;
    for (k = g.esc; k < g.made; k++) {
      var sy = k * 16 - g.S;
      if (sy < 4 || sy > B_SPLIT - 20) continue;
      for (cc = 1; cc <= 14; cc++) {
        var v = cell(k, cc);
        if (!v) continue;
        var n = v.t === 'n' ? group(k, cc).length : (v.t === 's' ? 5 : 2);
        var sc = n * 25 - sy * 2 + (v.c === g.lastColor && g.chainT > 0 ? 40 : 0);
        if (!best || sc > best.sc) best = { sc: sc, x: cc * 16 + 8, y: sy + 8 + 2 };
      }
    }
    if (!best) { B.lastA = false; return cursorTo(128, 100); }
    var m = cursorTo(best.x, best.y);
    var hc = cursorCell(), here = Math.abs(g.cur.x - best.x) <= 5 && Math.abs(g.cur.y - best.y) <= 5;
    return m | pressA(B, here && hc && hc.v && g.cur.fire === 0);
  }
  function botBalloon(B) {
    var best = null, i;
    for (i = 0; i < g.bals.length; i++) {
      var b = g.bals[i];
      if (b.popT || b.type === 'black') continue;
      var x = balX(b) + 8, y = (b.y >> 8) + 8 - 6, d = Math.abs(x - g.cur.x) + Math.abs(y - g.cur.y);
      var sc = d - (b.type === 'gold' ? 60 : 0) + (y < 50 ? 80 : 0);
      if (!best || sc < best.sc) best = { sc: sc, x: x, y: y };
    }
    if (!best) { B.lastA = false; return cursorTo(128, 150); }
    var m = cursorTo(best.x, best.y);
    // 射擊前確認準星下最上層的那顆不是黑氣球
    var top = null;
    for (i = g.bals.length - 1; i >= 0; i--) {
      var c = g.bals[i];
      if (c.popT) continue;
      var bx = balX(c), by = c.y >> 8;
      if (g.cur.x >= bx - 1 && g.cur.x <= bx + 16 && g.cur.y >= by - 1 && g.cur.y <= by + 15) { top = c; break; }
    }
    return m | pressA(B, top && top.type !== 'black' && g.cur.fire === 0);
  }

  /* ---------------- 註冊 ---------------- */
  var GAME = {
    id: 'pop', order: 6, title: '星塵泡泡', legacy: ['bubble-pop.html', 'balloon-pop-challenge.html', 'whack-a-mole.html'],
    init: function (nes) {
      nes0 = nes;
      art = PO.Art.make();
      var ppu = nes.ppu;
      NES.CHR.setPattern(0, 'pop_bg');
      NES.CHR.setPattern(1, 'pop_spr');
      if (ppu.setPatternTables) ppu.setPatternTables(0, 1);
      ppu.spriteMode(8);
      ppu.flickerStep = 0;
      AU.init(nes);
      g = newState();
      g.bot.lag = Math.max(1, parseInt((CT.query && CT.query('lag')) || '6', 10) || 6);   // 機器人反應幀數（測人類節奏用）
      GAME.backTile = { tile: art.s('SOLID'), pal: 0 };      // §6-4
      var qi = MODES.indexOf(CT.query ? CT.query('mode') : null);
      if (qi >= 0) g.sel = qi;
      enterTitle();
    },
    update: function () {
      var I = NES.Input;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      if (g.mode === 'title') {
        g.t++;
        if (I.pressed(BTN.UP)) { g.sel = (g.sel + 2) % 3; drawMenu(); AU.sfx('pop_move'); }
        if (I.pressed(BTN.DOWN) || (I.pressed(BTN.SELECT) && !I.held(BTN.START))) { g.sel = (g.sel + 1) % 3; drawMenu(); AU.sfx('pop_move'); }
        if ((I.pressed(BTN.START) && !I.held(BTN.SELECT)) || I.pressed(BTN.A)) startMode(MODES[g.sel]);
      } else if (g.mode === 'over') {
        g.overT++;
        if (g.overT > 40 && I.pressed(BTN.START) && !I.held(BTN.SELECT)) enterTitle();
      } else updatePlay();
      AU.tick();
    },
    draw: function () {
      var ppu = nes0.ppu;
      if (g.mode === 'play') {
        if (g.sub === 'bubble') { ppu.scroll(0, g.S % 240, 0); ppu.split(B_SPLIT, { x: 0, y: B_SPLIT, nt: 1 }); }
        if (!g.paused) drawHud();
      }
      if (g.mode === 'title' && (g.t & 31) === 0) hud(0, 25, 3, (g.t & 32) ? '        ' : 'START GO');   // P3-5：只閃 START GO
      drawSprites();
    },
    state: function () {
      return {
        mode: g.mode, sub: g.sub, sel: g.sel, paused: g.paused, score: g.score,
        lv: g.lv, pressure: g.pressure, escaped: g.escaped, S: g.S, wq: g.wq.length, wqPeak: g.wqPeak,
        stage: g.stage, pops: g.pops, quota: g.quota, bals: g.bals.length, timer: g.timer,
        selPod: g.selPod, combo: g.combo, hits: g.hitsN, whiffs: g.whiffs, thorns: g.thorns, stun: g.stun,
        cheated: g.cheated, continues: g.continues, goal: !!(g.goalHit && !g.cheated)
      };
    },
    exit: function () { saveBest(); AU.stop(); },
    cheat: function () { if (!g || g.mode === 'title') return false; g.cheatReq = true; return true; },
    bot: function () { return botMask(); },
    goal: function () { return !!(g && g.goalHit && !g.cheated); },
    bestText: function () { return pad(CT.load('pop', 'best', 0), 6); }
  };
  PO.GOAL_SCORE = GOAL_SCORE;
  PO.dev = {
    g: function () { return g; },
    start: function (m) { startMode(m); },
    initBalloon: function (n) { initBalloon(n); },
    group: group, cell: cell, podGeo: podGeo, cursorCell: cursorCell, rankOf: rankOf,
    spawn: function (i, tp) { var p = g.pods[i]; p.type = tp; p.t = 0; p.lvl = 0; p.ph = 'rise'; p.upT = 200; p.spat = false; p.cool = 0; }
  };
  if (CT.register) CT.register(GAME);
})();
