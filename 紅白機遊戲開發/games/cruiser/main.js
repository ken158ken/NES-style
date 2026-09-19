/*
 * games/cruiser/main.js — 《星塵巡航艦》主程式（window.GAME）
 * ---------------------------------------------------------------------------
 * 擁有者：ship agent ｜ 依賴：engine/*、games/cruiser/{chr_ship,ship}.js
 *                     選用（缺席也能跑）：chr_world.js / enemies.js / boss.js / stage1.js（CR.stage）、
 *                                         song.js（CR.Audio）、engine/shmup.js（NES.SH）
 * 契約：docs/TASKS.md「R2 → games/cruiser（ship agent）→ main.js」
 *
 * ── 畫面配置 ──────────────────────────────────────────────────────────────
 *   遊戲區 = 掃描線 0..207（可見 8..207）；HUD = 掃描線 208..239（可見 208..231 = 名稱表列 26..28）
 *   作法：遊戲區用 `ppu.scroll(camX, 0)`（由 CR.stage 的 Scroller 設定），
 *         `ppu.split(208, { x: 0, y: 208, nt: 0 })` 把下半段釘死在名稱表 0 的列 26 起、x 不捲動。
 *         engine/ppu.js 的 split 是「scanline 起改用另一組捲動值」，因此**下方固定 HUD 可行**
 *         （不需要改成上方 HUD）。
 *   ⇒ **跨檔需求（stage）**：名稱表捲動串流只能寫列 0..25（`CR.PLAY_ROWS = 26`），
 *     列 26..29 是 HUD 的地盤；屬性列 16 的 row16 13 / 14 也請留給 HUD（本檔在 init 設成調色盤 0）。
 *
 *   HUD（名稱表 0）：
 *     列 26  `1P <7 位分數>  HI <7 位紀錄>            <船圖示> x <剩餘數>`
 *     列 27  能量表標籤 6 格 × 5 欄：SPEED MISSL DOUBL LASER OPTON  ?
 *     列 28  能量表格框 6 格 × 5 欄（未選 = 灰空框、選中 = 白框填滿）
 *   每幀只重寫「有變的格」⇒ 最壞情況 25 byte，遠低於 VBlank 160 byte 預算。
 *
 * ── 每幀順序（契約）──────────────────────────────────────────────────────
 *   update: 讀輸入 → 船 / 選項 / 自機彈 → CR.stage.update(g) → 碰撞（自機彈×敵 / 敵・敵彈・地形×船）
 *           → 撿膠囊 → HUD → CR.Audio.tick()
 *   draw  : split → OAM begin → 船(prio0) / 選項(0) / 自機彈(1) → CR.stage.draw(oam)（敵彈 2 / 敵 3）
 *           → 爆炸・碎片(4) → OAM end（依 prio 排序 + 同 prio 每幀輪替起點 = 軟體 sprite cycling）
 *
 * ── 跨模組防禦 ───────────────────────────────────────────────────────────
 *   engine/shmup.js（NES.SH）尚未實作時，本檔用 `CR._fallback`（aabb / OAM / Pool 的最小版）頂替，
 *   總控整合時只要 NES.SH 到位就會自動改用 NES.SH（見 resolveSH()）。CR.stage / CR.Audio 全部
 *   以 `x && x.f && x.f()` 形式呼叫，缺席不致命。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CR = window.CR = window.CR || {};
  var FX = NES.FX;
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  /* ===================================================== 版面常數（公開） */
  var PLAY_ROWS = 26;                       // 名稱表列 0..25 = 遊戲區（stage 只能寫這裡）
  var HUD_ROW = 26;                         // HUD 從名稱表列 26 起
  var SPLIT_LINE = 208;                     // 掃描線 208 起 = HUD
  var GAUGE_COL = [1, 6, 11, 16, 21, 26];   // 6 格能量表，每格 5 欄
  var GAUGE_W = 5;
  CR.PLAY_ROWS = PLAY_ROWS;
  CR.PLAY_H = SPLIT_LINE;                   // 遊戲區高度（線）
  CR.HUD_ROW = HUD_ROW;
  CR.SPLIT_LINE = SPLIT_LINE;

  /* ============================================ NES.SH 缺席時的最小替代品 */
  function fbAabb(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  // 每幀精靈配置：prio 0 最高；同 prio 之間每幀輪替起點（軟體 sprite cycling）
  function fbOAM(ppu, opt) {
    var reserve = (opt && opt.reserve) | 0;
    var items = [], rot = 0;
    var buckets = [[], [], [], [], [], [], [], []];
    var o = {
      dropped: 0, used: 0,
      begin: function () { items.length = 0; o.dropped = 0; o.used = 0; },
      add: function (s) {
        if (!s) return;
        var x = s.x | 0, y = s.y | 0;
        if (y >= 240 || y <= -8 || x <= -8 || x >= 256) return;   // 畫面外直接略過
        items.push(s);
      },
      end: function () {
        var i, b;
        for (i = 0; i < 8; i++) buckets[i].length = 0;
        for (i = 0; i < items.length; i++) {
          var p = items[i].prio | 0;
          if (p < 0) p = 0; else if (p > 7) p = 7;
          buckets[p].push(items[i]);
        }
        var slot = reserve;
        for (b = 0; b < 8; b++) {
          var arr = buckets[b], n = arr.length;
          if (!n) continue;
          var st = rot % n;
          for (i = 0; i < n; i++) {
            if (slot > 63) { o.dropped++; continue; }
            var it = arr[(i + st) % n];
            ppu.sprite(slot++, {
              x: it.x | 0, y: it.y | 0, tile: it.tile | 0, pal: it.pal | 0,
              flipH: !!it.flipH, flipV: !!it.flipV, behind: !!it.behind
            });
          }
        }
        o.used = slot;
        for (; slot < 64; slot++) ppu.sprite(slot, null);
        rot = (rot + 1) & 0xFFFF;
        return o.used;
      },
      rot: function () { return rot; }
    };
    return o;
  }

  function fbPool(n, factory) {
    var items = [], i;
    for (i = 0; i < n; i++) { var o = factory(i); o.alive = false; items.push(o); }
    return {
      items: items, count: 0,
      alloc: function () {
        for (var j = 0; j < items.length; j++) if (!items[j].alive) { items[j].alive = true; return items[j]; }
        return null;
      },
      free: function (o) { o.alive = false; },
      each: function (fn) { for (var j = 0; j < items.length; j++) if (items[j].alive) fn(items[j], j); }
    };
  }

  CR._fallback = { aabb: fbAabb, OAM: fbOAM, Pool: fbPool };

  var SH = null;                       // 實際採用的實作（NES.SH 優先）
  function resolveSH() {
    var sh = NES.SH;
    SH = {
      aabb: (sh && typeof sh.aabb === 'function') ? sh.aabb : fbAabb,
      OAM: (sh && typeof sh.OAM === 'function') ? sh.OAM : fbOAM,
      Pool: (sh && typeof sh.Pool === 'function') ? sh.Pool : fbPool,
      usingEngine: !!(sh && typeof sh.OAM === 'function')
    };
    CR.SH = SH;
    return SH;
  }

  /* ======================================================= CHR bank 合併 */
  // 把 obj 用空白磚補到 n 格（讓 stage 的磚固定從 n 起；超量時自動少補）
  function padTo(obj, n, prefix, room) {
    var out = {}, k, cnt = 0;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) { out[k] = obj[k]; cnt++; }
    var want = Math.min(n, room);
    var blank = ['........', '........', '........', '........', '........', '........', '........', '........'];
    while (cnt < want) { out[prefix + cnt] = blank; cnt++; }
    return out;
  }
  function size(o) { return o ? Object.keys(o).length : 0; }

  function buildBanks() {
    var CHR = NES.CHR;
    var sprWorld = CR.SPR_WORLD || {}, bgWorld = CR.BG_WORLD || {};
    var sprRoom = 256 - size(sprWorld), bgRoom = 256 - size(bgWorld);
    var sprObj = padTo(CR.SPR_SHIP, 128, 'S_PAD', sprRoom);
    var bgObj = padTo(CR.BG_HUD, 64, 'H_PAD', bgRoom);
    var k;
    for (k in sprWorld) if (Object.prototype.hasOwnProperty.call(sprWorld, k)) sprObj[k] = sprWorld[k];
    for (k in bgWorld) if (Object.prototype.hasOwnProperty.call(bgWorld, k)) bgObj[k] = bgWorld[k];
    var spr = CHR.bank('cr_spr', sprObj);
    var bg = CHR.bank('cr_bg', bgObj);
    CHR.setPattern(0, bg);
    CHR.setPattern(1, spr);
    CR.sprBank = spr; CR.bgBank = bg;
    // 名稱 → 索引查表（stage / audio / 測試都可以直接用）
    var T = {}, i;
    for (i = 0; i < spr.names.length; i++) T[spr.names[i]] = spr.index(spr.names[i]);
    CR.TILE = T;
    var B = {};
    for (i = 0; i < bg.names.length; i++) B[bg.names[i]] = bg.index(bg.names[i]);
    CR.BGTILE = B;
    return { spr: spr, bg: bg };
  }

  /* ================================================================= HUD */
  var T = null;          // 精靈磚索引（S_*）
  var B = null;          // 背景磚索引（H_*）
  var REV = null;        // 背景磚索引 → 字元（state().hud 反查用）

  function bgTileOf(ch) {
    var n = CR.tileNameFor(ch);
    return (B && B[n] !== undefined) ? B[n] : 0;
  }

  function buildRev() {
    REV = {};
    var c, n;
    for (c in CR.CHARMAP) {
      if (!Object.prototype.hasOwnProperty.call(CR.CHARMAP, c)) continue;
      n = CR.CHARMAP[c];
      if (B[n] === undefined) continue;
      if (REV[B[n]] === undefined) REV[B[n]] = c;
    }
    REV[B.H_SP] = ' ';
    REV[B.H_GL] = '['; REV[B.H_GM] = '-'; REV[B.H_GR] = ']';
    REV[B.H_GLON] = '<'; REV[B.H_GMON] = '='; REV[B.H_GRON] = '>';
    REV[B.H_SHIP] = '^';
  }

  function pad0(n, w) { var s = String(n | 0); while (s.length < w) s = '0' + s; return s; }

  function writeText(ppu, col, row, str, nt) {
    for (var i = 0; i < str.length && col + i < 32; i++) ppu.setTile(nt || 0, col + i, row, bgTileOf(str.charAt(i)));
  }
  // 只寫和上一次不同的格（VBlank 預算）
  function writeDiff(ppu, col, row, str, prev) {
    for (var i = 0; i < str.length && col + i < 32; i++) {
      if (prev !== null && prev !== undefined && prev.charAt(i) === str.charAt(i)) continue;
      ppu.setTile(0, col + i, row, bgTileOf(str.charAt(i)));
    }
  }

  function gaugeCell(ppu, idx, on) {
    var c = GAUGE_COL[idx], r = HUD_ROW + 2;
    ppu.setTile(0, c, r, on ? B.H_GLON : B.H_GL);
    ppu.setTile(0, c + 1, r, on ? B.H_GMON : B.H_GM);
    ppu.setTile(0, c + 2, r, on ? B.H_GMON : B.H_GM);
    ppu.setTile(0, c + 3, r, on ? B.H_GMON : B.H_GM);
    ppu.setTile(0, c + 4, r, on ? B.H_GRON : B.H_GR);
  }

  var hud = { score: null, hi: null, lives: null, gauge: -1 };
  var hudOn = true;                  // P3-1：標題畫面不掛能量表 HUD

  // HUD 三列（+ 裁掉的列 29）整個清空；hudOn = false 時 draw 也不會再同步
  function hudHide(ppu) {
    var r0 = HUD_ROW, i;
    for (i = 0; i < 4; i++) { ppu.fillTiles(0, 0, r0 + i, 32, 1, B.H_SP); ppu.fillTiles(1, 0, r0 + i, 32, 1, B.H_SP); }
    hudOn = false;
  }

  function hudStatic(ppu) {
    var r0 = HUD_ROW, i;
    // HUD 三列清空（兩張名稱表都清，避免 stage 補欄時殘留）
    for (i = 0; i < 4; i++) { ppu.fillTiles(0, 0, r0 + i, 32, 1, B.H_SP); ppu.fillTiles(1, 0, r0 + i, 32, 1, B.H_SP); }
    ppu.fillAttr(0, 0, 13, 16, 2, 0);          // 屬性列 13/14（名稱表列 26..29）= 調色盤 0
    ppu.fillAttr(1, 0, 13, 16, 2, 0);
    writeText(ppu, 1, r0, '1P');
    writeText(ppu, 13, r0, 'HI');
    ppu.setTile(0, 25, r0, B.H_SHIP);
    writeText(ppu, 26, r0, 'x');
    for (i = 0; i < 6; i++) {
      writeText(ppu, GAUGE_COL[i], r0 + 1, CR.Ship.GAUGE_LABEL[i]);
      gaugeCell(ppu, i, false);
    }
    hud.score = null; hud.hi = null; hud.lives = null; hud.gauge = 0;
    hudOn = true;
  }

  function hudSync(ppu, s) {
    var r0 = HUD_ROW;
    var sc = pad0(s.score, 7);
    if (sc !== hud.score) { writeDiff(ppu, 4, r0, sc, hud.score); hud.score = sc; }
    var hi = pad0(s.hi, 7);
    if (hi !== hud.hi) { writeDiff(ppu, 16, r0, hi, hud.hi); hud.hi = hi; }
    var lv = String(Math.max(0, Math.min(9, s.lives)));
    if (lv !== hud.lives) { writeDiff(ppu, 27, r0, lv, hud.lives); hud.lives = lv; }
    if (s.gauge !== hud.gauge) {
      if (hud.gauge > 0) gaugeCell(ppu, hud.gauge - 1, false);
      if (s.gauge > 0) gaugeCell(ppu, s.gauge - 1, true);
      hud.gauge = s.gauge;
    }
  }

  function hudString(ppu) {
    var out = [], r, c, line, t;
    for (r = 0; r < 3; r++) {
      line = '';
      for (c = 0; c < 32; c++) {
        t = ppu.getTile(0, c, HUD_ROW + r);
        line += (REV[t] !== undefined ? REV[t] : '?');
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out.join('|');
  }

  /* ========================================================== 標題 / 訊息 */
  var TITLE = [
    { row: 8, col: 8, text: 'STARDUST CRUISER' },
    { row: 11, col: 7, text: 'ORIGINAL NES SHMUP' },
    { row: 15, col: 10, text: 'PRESS START' },
    { row: 18, col: 5, text: 'SECRET: C KEY OR $ BTN' },
    { row: 21, col: 8, text: '$ 2026 ORIGINAL' }
  ];
  // fix3：START 暫停（研究 §7-3「暫停」）＋ 暫停中的 Konami 指令（研究 §9-1）
  // fix4：一鍵密技 —— 暫停畫面兩行，第二行明示 SELECT；GAME OVER 多一行 SELECT = CONTINUE
  var PAUSE = [
    { row: 11, col: 13, text: 'PAUSE' },
    { row: 13, col: 8, text: 'C OR $ = SECRET' }
  ];
  var SECRET = [
    { row: 11, col: 13, text: 'PAUSE' },
    { row: 13, col: 8, text: 'C OR $ = SECRET' },
    { row: 15, col: 12, text: 'SECRET!' }
  ];
  // fix5：不暫停也能發動 ⇒ 遊戲進行中只疊「SECRET!」這一行（列 15，與暫停版同一列）
  var SECRET_ONLY = [
    { row: 15, col: 12, text: 'SECRET!' }
  ];
  var OVER = [
    { row: 11, col: 11, text: 'GAME OVER' },
    { row: 15, col: 10, text: 'PRESS START' },
    { row: 17, col: 7, text: 'C OR $ = CONTINUE' }
  ];
  var CLEAR = [
    { row: 11, col: 10, text: 'STAGE CLEAR' },
    { row: 15, col: 10, text: 'PRESS START' }
  ];

  /* ---- 訊息文字（TITLE / GAME OVER / STAGE CLEAR）------------------------
   * QA R2 P1-2：遊戲區捲動是 `ppu.scroll(camX % 512, 0, 0)` 的**兩張名稱表**，
   * 只寫 nt0 的話 `camX % 512 >= 256` 時整段文字都在畫面外（魔王固定在 camX 2816
   * ⇒ 2816 % 512 = 256 ⇒ STAGE CLEAR 100% 看不到）。
   * 作法：依目前捲動值算出畫面左緣的「全域欄」（0..63），逐字換算 nt 與欄，
   *       跨兩張名稱表時自動分段；寫過的格記在 msgCells 供精準清除。
   */
  var msgCells = [];                 // [[nt, col, row], …] 實際寫過的格

  function scrollCol() { return ((((camX() % 512) + 512) % 512) >> 3) & 63; }

  function clearMsg(ppu) {
    for (var i = 0; i < msgCells.length; i++) {
      ppu.setTile(msgCells[i][0], msgCells[i][1], msgCells[i][2], B.H_SP);
    }
    msgCells.length = 0;
  }

  // 文字用調色盤 0（白字）；覆蓋到的屬性列先改成 0（兩張名稱表都改，因為文字可能跨張），
  // 離開時由 stage.restart 重畫回來。
  function drawMsg(ppu, arr, pal) {
    clearMsg(ppu);
    var base = scrollCol(), i, j, gc, nt, rows = {};
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      for (j = 0; j < it.text.length && it.col + j < 32; j++) {
        gc = (base + it.col + j) & 63;
        nt = (gc >= 32) ? 1 : 0;
        ppu.setTile(nt, gc & 31, it.row, bgTileOf(it.text.charAt(j)));
        msgCells.push([nt, gc & 31, it.row]);
      }
      rows[it.row >> 1] = 1;
    }
    for (var r16 in rows) {
      if (!rows.hasOwnProperty(r16)) continue;
      ppu.fillAttr(0, 0, r16 | 0, 16, 1, pal | 0);
      ppu.fillAttr(1, 0, r16 | 0, 16, 1, pal | 0);
    }
  }

  // 畫面上「看得到的」某一列 32 欄文字（測試 / QA 用；與 hudString 同一套反查表）
  function screenText(row) {
    var ppu = g.ppu, base = scrollCol(), out = '', c, gc, t;
    if (!ppu) return '';
    for (c = 0; c < 32; c++) {
      gc = (base + c) & 63;
      t = ppu.getTile(gc >= 32 ? 1 : 0, gc & 31, row | 0);
      out += (REV[t] !== undefined ? REV[t] : '?');
    }
    return out.replace(/\s+$/, '');
  }

  /* ================================================================ 狀態 */
  var g = {
    nes: null, ppu: null, input: null, oam: null,
    mode: 'title', frames: 0, playFrames: 0,
    ship: null, camX: 0, hits: 0, kills: 0, bossOn: false,
    lastEvent: '', noStageWarn: false,
    // fix3：暫停 / Konami 秘技 / GAME OVER 續關
    paused: false, secretLeft: 1, secrets: 0, secretMsg: 0,
    continues: 0, continueCam: 0, lastCode: '',
    // fix4：一鍵密技（SELECT）。selectUsed = 這一次暫停已經用過（防連按重複觸發）
    selectUsed: false, selectSecrets: 0, selectContinues: 0,
    // fix5：真·一鍵（鍵盤 C / 觸控 ★密技 / nes-cheat 事件），不必先暫停
    cheatReq: false, cheatCool: 0, cheats: 0, cheatContinues: 0, lastCheat: ''
  };
  CR.g = g;

  function muteBudget(on) {
    var b = g.nes && g.nes.timing && g.nes.timing.budget;
    if (b) b.mute = !!on;
  }

  function st() { return CR.stage || null; }
  function call(obj, fn, a, b2) {
    if (obj && typeof obj[fn] === 'function') { try { return obj[fn](a, b2); } catch (e) { g.lastEvent = fn + ':' + e.message; return undefined; } }
    return undefined;
  }
  function eachOf(pool, fn) {
    if (!pool) return;
    if (typeof pool.each === 'function') { pool.each(fn); return; }
    if (typeof pool.length === 'number') {
      for (var i = 0; i < pool.length; i++) if (pool[i] && pool[i].alive) fn(pool[i], i);
      return;
    }
    if (pool.items && pool.items.length) {
      for (var j = 0; j < pool.items.length; j++) if (pool.items[j].alive) fn(pool.items[j], j);
    }
  }
  function camX() {
    var s2 = st();
    return (s2 && typeof s2.camX === 'number') ? s2.camX : 0;
  }

  /* ================================================ 暫停 + Konami 指令（fix3）
   * 研究 §9-1 [源]：FC《宇宙巡航艦》**暫停中**輸入 ↑↑↓↓←→←→BA →
   *   1 次 SPEED UP、MISSILE、2 顆 OPTION、護盾（**不含 DOUBLE / LASER**）；
   *   一場遊戲 1 次，每打掉一隻 Big Core 多 1 次；
   *   GAME OVER 畫面輸入同一組 → 給 3 條命並回到剛才的檢查點（分數不清）。
   * 使用者記憶的變體（↑↑↓↓←←→→AB / …ABAB / ABAB）一併接受：
   *   比對「最近 12 個按鍵邊緣」的**字尾**，任一組命中即可。觸控走 `Input.setExternal`，
   *   一樣會進 `pressed()` 的邊緣判定，所以搖桿方向 + A / B 也輸得進來。
   */
  var KONAMI_N = 12;
  var KONAMI_BUF = [];
  var KONAMI_CODES = [
    'UUDDLRLRBA',       // [源] FC 原版（ROM $9793 = 08 08 04 04 02 01 02 01 40 80）
    'UUDDLLRRAB',       // 使用者記憶的變體
    'UUDDLLRRABAB',     //   同上 + ABAB
    'ABAB'              //   只按 ABAB（暫停畫面沒有別的用途，寬容處理）
  ];
  // 同一幀多鍵時的固定順序（讓「同時按」也有決定性的結果）
  var KONAMI_EDGE = [[BTN.UP, 'U'], [BTN.DOWN, 'D'], [BTN.LEFT, 'L'], [BTN.RIGHT, 'R'], [BTN.B, 'B'], [BTN.A, 'A']];

  function konamiClear() { KONAMI_BUF.length = 0; }
  function konamiPush(input) {
    var m = 0, i;
    if (input && typeof input.pressedMask === 'function') m = input.pressedMask() | 0;
    else if (input) { for (i = 0; i < KONAMI_EDGE.length; i++) if (input.pressed(KONAMI_EDGE[i][0])) m |= KONAMI_EDGE[i][0]; }
    if (!m) return;
    for (i = 0; i < KONAMI_EDGE.length; i++) if (m & KONAMI_EDGE[i][0]) KONAMI_BUF.push(KONAMI_EDGE[i][1]);
    while (KONAMI_BUF.length > KONAMI_N) KONAMI_BUF.shift();
  }
  function konamiHit() {
    var s2 = KONAMI_BUF.join(''), i, c;
    for (i = 0; i < KONAMI_CODES.length; i++) {
      c = KONAMI_CODES[i];
      if (s2.length >= c.length && s2.slice(s2.length - c.length) === c) return c;
    }
    return '';
  }
  CR.konamiBuffer = function () { return KONAMI_BUF.join(''); };
  CR.KONAMI_CODES = KONAMI_CODES;

  // [源] §9-1：SPEED UP ×1 / MISSILE / OPTION ×2 / 護盾；**不給 DOUBLE、不給 LASER**
  function secretGrant() {
    var s2 = g.ship, P = CR.Ship;
    if (s2.speed < P.MAX_SPEED) s2.speed++;
    s2.power.missile = true;
    s2.power.option = P.MAX_OPTION;
    s2.power.shield = P.SHIELD_HP;
    s2.syncOptions();
  }
  // 實際發動（三條路共用）：強化 + 畫 SECRET! + 音效
  // lines 省略 = 暫停版（PAUSE 兩行 + SECRET!）；遊戲進行中傳 SECRET_ONLY（只有一行）
  function fireSecret(code, lines) {
    g.lastCode = code;
    secretGrant();
    muteBudget(true); drawMsg(g.ppu, lines || SECRET, 0); muteBudget(false);
    g.secretMsg = 60;                                  // 「SECRET!」顯示 1 秒
    call(CR.Audio, 'sfx', 'powerup');
  }
  function trySecret(code) {
    if (g.secretLeft <= 0) return false;              // [源] 一場 1 次（打掉魔王再 +1）
    g.secretLeft--; g.secrets++;
    fireSecret(code);
    return true;
  }
  // fix4（使用者回饋「多個一鍵密技」）：暫停中按 SELECT = 同一組效果，**不限次數**，
  // 但每一次暫停只吃一次（避免長按 / 連按在同一個暫停畫面重複觸發），且**不動 Konami 的一次限制**。
  function trySelectSecret() {
    if (g.selectUsed) return false;
    g.selectUsed = true; g.secrets++; g.selectSecrets++;
    fireSecret('SELECT');
    return true;
  }

  /* ============================================ fix5：真·一鍵密技（不必暫停）
   * 使用者回饋（2026-09-20）：「電腦版也要有一鍵密技，巡航艦一定要，不然很難玩。
   *   手機跟電腦都要，盡量一鍵，比較直觀。」
   * 三個入口共用同一個效果函式：
   *   ① 觸控 ★密技 鍵（engine/touch.js 派發 window 的 `nes-cheat`）
   *   ② 鍵盤 C（本檔自己監聽 window keydown KeyC → 派發同一個事件）
   *   ③ 程式 / 測試（`window.dispatchEvent(new CustomEvent('nes-cheat'))` 或 NES.Touch.cheat()）
   * 事件只把旗標立起來，真正的處理放在 update() 開頭 ⇒ 一定落在幀邊界上（可重現、可測試）。
   */
  var CHEAT_COOL = 30;                                 // 連按間隔 ≥ 30 幀

  function doCheat() {
    if (g.cheatCool > 0) return false;                 // 防連按
    if (g.mode === 'play') {                           // 含暫停中：立刻套用，不限次數
      g.cheatCool = CHEAT_COOL;
      g.secrets++; g.cheats++; g.lastCheat = 'secret';
      // 已經滿強化時 secretGrant() 仍會把護盾補滿（speed 到 MAX_SPEED 就不再加）
      fireSecret('ONEKEY', g.paused ? SECRET : SECRET_ONLY);
      return true;
    }
    if (g.mode === 'gameover') {                       // 立即 3 條命續關回檢查點（分數保留）
      g.cheatCool = CHEAT_COOL;
      g.cheats++; g.cheatContinues++; g.lastCheat = 'continue';
      konamiClear();
      continueGame();
      return true;
    }
    g.lastCheat = 'none';                              // title / dead / stageclear：無作用
    return false;
  }
  function requestCheat() { g.cheatReq = true; return true; }
  CR.cheat = requestCheat;                             // 測試 / 機器人可直接呼叫

  (function bindCheat() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('nes-cheat', function () { requestCheat(); }, false);
    // 鍵盤 C（不在 NES.Input 的映射表裡 ⇒ 不會跟八鍵打架）
    window.addEventListener('keydown', function (e) {
      if (!e || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      var code = e.code || '';
      var isC = (code === 'KeyC') || (!code && (e.keyCode === 67 || String(e.key || '').toLowerCase() === 'c'));
      if (!isC) return;
      var ev = null;
      try { ev = new window.CustomEvent('nes-cheat', { detail: { source: 'key' } }); }
      catch (e2) {
        try { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('nes-cheat', false, false, { source: 'key' }); }
        catch (e3) { ev = null; }
      }
      if (ev) window.dispatchEvent(ev); else requestCheat();
    }, false);
  })();

  // fix5：遊戲進行中的 SECRET! 還掛著的時候切畫面 —— 先把地形整片重畫回來，
  // 不然 clearMsg 留下的空白磚會變成畫面上的洞（要等下一次 redraw 才補得回來）。
  function restorePlayMsg() {
    if (g.secretMsg <= 0) return false;
    g.secretMsg = 0;
    clearMsg(g.ppu);
    call(st(), 'redraw');
    return true;
  }

  function pauseGame() {
    muteBudget(true); restorePlayMsg(); drawMsg(g.ppu, PAUSE, 0); muteBudget(false);
    g.paused = true; g.secretMsg = 0;
    g.selectUsed = false;                              // fix4：每次暫停重新給一次 SELECT 機會
    konamiClear();
  }
  function unpauseGame() {
    muteBudget(true);
    clearMsg(g.ppu);
    call(st(), 'redraw');                              // 還原被 PAUSE / SECRET! 蓋掉的地形磚 + 屬性
    muteBudget(false);
    g.paused = false; g.secretMsg = 0;
    konamiClear();
  }

  // [源] §9-1：GAME OVER 畫面輸入指令 → 3 條命 + 回到剛才的檢查點（**分數不清**）
  function continueGame() {
    var ppu = g.ppu, ship = g.ship;
    muteBudget(true);
    clearMsg(ppu);
    call(st(), 'restart', g.continueCam | 0);
    hudStatic(ppu);
    muteBudget(false);
    ship.lives = CR.Ship.START_LIVES;
    ship.reset(true);                                  // 強化歸零（與死亡一致）
    ship.invul = CR.Ship.INVUL_FRAMES;
    g.mode = 'play'; g.paused = false; g.bossOn = false;
    g.secretLeft = 1; g.secretMsg = 0; g.continues++;
    g.selectUsed = false; g.cheatCool = 0;
    hud.score = null; hud.hi = null; hud.lives = null; hud.gauge = -1;
    if (CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'stage1');
  }

  /* ---------------------------------------------------------- 模式切換 */
  function toPlay() {
    var ppu = g.ppu;
    muteBudget(true);
    clearMsg(ppu);
    call(st(), 'restart', 0);
    hudStatic(ppu);                      // P3-1：標題把 HUD 收起來了 ⇒ 進遊戲重建
    muteBudget(false);
    g.ship.newGame();
    g.mode = 'play'; g.playFrames = 0; g.hits = 0; g.kills = 0; g.bossOn = false;
    g.paused = false; g.secretLeft = 1; g.secrets = 0; g.secretMsg = 0;
    g.continues = 0; g.continueCam = 0; g.lastCode = '';
    g.selectUsed = false; g.selectSecrets = 0; g.selectContinues = 0;
    g.cheatReq = false; g.cheatCool = 0; g.cheats = 0; g.cheatContinues = 0; g.lastCheat = '';
    konamiClear();
    hud.score = null; hud.hi = null; hud.lives = null; hud.gauge = -1;
    if (CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'stage1');
  }
  function toTitle() {
    var ppu = g.ppu;
    muteBudget(true);
    clearMsg(ppu);
    call(st(), 'restart', 0);            // 標題回到關卡起點的星空（不然會停在死亡地點的要塞 / 魔王室）
    hudHide(ppu);                        // P3-1：標題畫面沒有能量表
    drawMsg(ppu, TITLE, 0);
    muteBudget(false);
    g.mode = 'title'; g.bossOn = false; g.paused = false; g.secretMsg = 0;
    konamiClear();
    if (CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'title');
  }
  function toGameOver() {
    muteBudget(true);
    restorePlayMsg();                    // fix5：先還原進行中的 SECRET!
    drawMsg(g.ppu, OVER, 0);             // P1-2：寫到目前捲動位置對應的名稱表
    muteBudget(false);
    g.mode = 'gameover'; g.paused = false; g.secretMsg = 0;
    konamiClear();                       // GAME OVER 畫面重新開始收指令
    if (CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'gameover');
  }
  function toStageClear() {
    muteBudget(true);
    restorePlayMsg();                    // fix5：先還原進行中的 SECRET!
    drawMsg(g.ppu, CLEAR, 0);            // P1-2：魔王在 camX 2816（% 512 = 256）⇒ 文字其實在 nt1
    muteBudget(false);
    g.mode = 'stageclear'; g.paused = false; g.secretMsg = 0;
    g.secretLeft++;                      // [源] 每打掉一隻 Big Core，秘技可再用 1 次
    if (CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'clear');
  }

  /* -------------------------------------------------------------- 碰撞 */
  function enemyBox(e) {
    return { x: e.x | 0, y: e.y | 0, w: (e.w || 16) | 0, h: (e.h || 16) | 0 };
  }

  // 命中一隻敵人 / 魔王。雷射貫通（同一道對同一隻只算一次傷害），其餘子彈命中即消失。
  // 敵人若自己畫爆炸，設 `e.fx = false` 可以叫本檔不要再補一顆（跨檔約定）。
  function hitEnemy(e, shot) {
    var dmg = shot.dmg || 1;
    if (shot.kind === CR.Ship.K.LASER) {
      if (e._lz === shot.id) return;
      e._lz = shot.id;
    } else {
      shot.alive = false;
    }
    if (typeof e.hit === 'function') e.hit(dmg);
    else { e.hp = (e.hp === undefined ? 1 : e.hp) - dmg; if (e.hp <= 0) e.alive = false; }
    if (e.alive === false) {
      g.kills++;
      // stage 自己記分 + 自己畫爆炸（`CR.stage.takeScore()` 在場即代表）⇒ 這裡不要重複加
      if (!stageScores()) {
        g.ship.addScore(e.score || 100);
        if (e.fx !== false) CR.Fx.boom((e.x | 0) + ((e.w || 16) >> 1), (e.y | 0) + ((e.h || 16) >> 1));
      }
    }
  }

  function stageScores() { var s2 = st(); return !!(s2 && typeof s2.takeScore === 'function'); }
  function drainScore() {
    var s2 = st();
    if (!s2 || typeof s2.takeScore !== 'function') return;
    var pts = s2.takeScore() | 0;
    if (pts) g.ship.addScore(pts);
  }

  function collide() {
    var s2 = st(), ship = g.ship, i;
    // ① 自機彈 × 敵 / 魔王
    for (i = 0; i < ship.shots.length; i++) {
      var t = ship.shots[i];
      if (!t.alive) continue;
      var box = { x: t.x, y: t.y, w: t.w, h: t.h };
      if (s2) {
        eachOf(s2.enemies, function (e) {
          if (!t.alive || !e.alive) return;
          if (SH.aabb(box, enemyBox(e))) hitEnemy(e, t);
        });
        var boss = s2.boss;
        if (t.alive && boss && boss.alive && SH.aabb(box, enemyBox(boss))) hitEnemy(boss, t);
      }
    }
    if (!ship.alive) return;
    var sb = ship.rect();
    // ② 敵 / 敵彈 / 地形 × 船
    if (s2) {
      eachOf(s2.enemies, function (e) {
        if (ship.alive && e.alive && SH.aabb(sb, enemyBox(e))) { if (ship.hit()) g.hits++; }
      });
      eachOf(s2.bullets, function (b2) {
        if (ship.alive && b2.alive && SH.aabb(sb, { x: b2.x | 0, y: b2.y | 0, w: (b2.w || 4) | 0, h: (b2.h || 4) | 0 })) {
          if (ship.hit()) g.hits++;
        }
      });
      if (ship.alive && s2.boss && s2.boss.alive && SH.aabb(sb, enemyBox(s2.boss))) { if (ship.hit()) g.hits++; }
      if (ship.alive && typeof s2.solidAt === 'function') {
        if (s2.solidAt(sb.x, sb.y) || s2.solidAt(sb.x + sb.w - 1, sb.y) ||
          s2.solidAt(sb.x, sb.y + sb.h - 1) || s2.solidAt(sb.x + sb.w - 1, sb.y + sb.h - 1)) {
          if (ship.hit(true)) g.hits++;             // [源] 護盾不擋地形，撞到必死
        }
      }
      // ③ 撿膠囊
      eachOf(s2.capsules, function (c) {
        if (!ship.alive || !c.alive) return;
        if (!SH.aabb(sb, { x: c.x | 0, y: c.y | 0, w: (c.w || 8) | 0, h: (c.h || 8) | 0 })) return;
        c.alive = false;
        if (typeof c.take === 'function') c.take();
        // stage 沒指定顏色 ⇒ 交給 ship 計數（[源] 每第 16 顆 = 清屏膠囊）
        var blue = (c.blue !== undefined) ? !!c.blue : (c.kind === 'blue' ? true : undefined);
        ship.capsule(blue);
      });
    }
  }

  /* ---------------------------------------------------------- 死亡處理 */
  function respawn() {
    var ship = g.ship;
    ship.lives--;
    if (ship.lives <= 0) {
      ship.lives = 0; ship.reset(true); ship.alive = false;
      // fix3：GAME OVER 的 Konami 續關要「回到剛才的關卡位置」⇒ 先把檢查點記下來
      var s0 = st(), cc = 0;
      if (s0) {
        cc = call(s0, 'checkpoint', camX());
        if (typeof cc !== 'number') cc = ship.checkpointOf(camX());
        if (s0.bossActive && typeof s0.BOSS_RESPAWN === 'number' && s0.BOSS_RESPAWN > cc) cc = s0.BOSS_RESPAWN;
      }
      g.continueCam = cc | 0;
      toGameOver();
      return;
    }
    var s2 = st();
    var cp = 0;
    var wasBoss = !!(s2 && s2.bossActive);
    if (s2) {
      cp = call(s2, 'checkpoint', camX());
      if (typeof cp !== 'number') cp = g.ship.checkpointOf(camX());   // [源] 每 512 px 一個檢查點
      // QA P3-2：死在魔王戰時，一般檢查點（2560）要空捲 440 幀（7.4 秒）才會再遇到魔王
      //          ⇒ 改用 stage 的魔王復活點（2760 ⇒ 112 幀 ≈ 1.9 秒）
      if (wasBoss && typeof s2.BOSS_RESPAWN === 'number' && s2.BOSS_RESPAWN > cp) cp = s2.BOSS_RESPAWN;
      muteBudget(true);
      call(s2, 'restart', cp);
      muteBudget(false);
    }
    ship.reset(true);                        // 失去全部強化
    ship.invul = CR.Ship.INVUL_FRAMES;       // 復活無敵 90 幀（閃爍）
    g.bossOn = false;                        // restart 會把魔王收掉 ⇒ 重新進場時再播 boss 曲
    // QA P1-3：`die` 音效會停掉音樂（song.js 的設計），復活後要自己重播
    if (CR.Audio && CR.Audio.play) {
      call(CR.Audio, 'play', (st() && st().bossActive) ? 'boss' : 'stage1');
    }
  }

  /* ================================================================ draw */
  function drawShip(oam) {
    var s2 = g.ship;
    if (g.mode === 'title' || g.mode === 'gameover') return;   // 標題 / GAME OVER 畫面不畫船
    if (!s2.alive) return;
    if (s2.blink()) return;                  // 無敵閃爍
    var a = s2.anim;
    oam.add({ x: s2.sx, y: s2.sy, tile: a ? T.S_SHIP_L1 : T.S_SHIP_L0, pal: 0, prio: 0 });
    oam.add({ x: s2.sx + 8, y: s2.sy, tile: a ? T.S_SHIP_R1 : T.S_SHIP_R0, pal: 0, prio: 0 });
    if (s2.power.shield > 0) {
      var sh = a ? T.S_SHIELD1 : T.S_SHIELD0;
      oam.add({ x: s2.sx + 15, y: s2.sy - 5, tile: sh, pal: 0, prio: 0 });
      oam.add({ x: s2.sx + 15, y: s2.sy + 5, tile: sh, pal: 0, prio: 0 });
    }
  }

  function drawOptions(oam) {
    var s2 = g.ship, i;
    if (g.mode === 'title' || g.mode === 'gameover') return;
    if (!s2.alive) return;
    for (i = 0; i < s2.options.length; i++) {
      var o = s2.options[i];
      if (!o.on) continue;
      oam.add({ x: o.x + 4, y: o.y, tile: s2.optAnim ? T.S_OPT1 : T.S_OPT0, pal: 0, prio: 0 });
    }
  }

  function drawShots(oam) {
    var s2 = g.ship, i, j;
    for (i = 0; i < s2.shots.length; i++) {
      var t = s2.shots[i];
      if (!t.alive) continue;
      if (t.kind === CR.Ship.K.LASER) {
        for (j = 0; j < t.len; j++) {
          var last = (j === t.len - 1);
          oam.add({ x: t.x + j * 8, y: t.y - 2, tile: last ? T.S_LASER_H : T.S_LASER, pal: 1, prio: 1 });
        }
      } else if (t.kind === CR.Ship.K.DIAG) {
        oam.add({ x: t.x - 2, y: t.y - 2, tile: T.S_BULLET_D, pal: 1, prio: 1 });
      } else if (t.kind === CR.Ship.K.MISSILE) {
        oam.add({ x: t.x - 2, y: t.y - 2, tile: t.anim ? T.S_MISSILE1 : T.S_MISSILE0, pal: 1, prio: 1 });
      } else {
        oam.add({ x: t.x - 2, y: t.y - 2, tile: T.S_BULLET, pal: 1, prio: 1 });
      }
    }
  }

  var EXP_PART = ['TL', 'TR', 'BL', 'BR'];
  function drawFx(oam) {
    var i, j, b2, f;
    for (i = 0; i < CR.Fx.booms.length; i++) {
      b2 = CR.Fx.booms[i];
      if (!b2.alive) continue;
      f = (b2.t / CR.Ship.BOOM_FRAME) | 0;
      if (f > 3) f = 3;
      for (j = 0; j < 4; j++) {
        oam.add({
          x: b2.x - 8 + (j & 1) * 8, y: b2.y - 8 + ((j >> 1) & 1) * 8,
          tile: T['S_EXP' + f + '_' + EXP_PART[j]], pal: 1, prio: 4
        });
      }
    }
    var d;
    for (i = 0; i < g.ship.debris.length; i++) {
      d = g.ship.debris[i];
      if (!d.alive) continue;
      oam.add({ x: d.x, y: d.y, tile: d.tile ? T.S_DEBRIS1 : T.S_DEBRIS0, pal: 0, prio: 4 });
    }
  }

  /* ================================================================ GAME */
  var GAME = {
    init: function (nes) {
      var ppu = nes.ppu;
      g.nes = nes; g.ppu = ppu; g.input = nes.input || NES.Input;
      resolveSH();
      buildBanks();
      T = CR.TILE; B = CR.BGTILE;
      buildRev();

      // 調色盤（契約：底色 $0F；spr0 船 / spr1 自機彈；bg0 HUD。bg1..3 / spr2..3 由 stage 覆蓋）
      var P = CR.PAL, i;
      ppu.setBackdrop(P.backdrop);
      for (i = 0; i < 4; i++) { ppu.setSprPalette(i, P.spr[i]); ppu.setBgPalette(i, P.bg[i]); }

      ppu.mirroring('v');                 // 水平捲動 ⇒ 左右兩張名稱表不同
      ppu.spriteMode(8);                  // 8×8：船 16×8 = 2 顆精靈
      ppu.setPatternTables(0, 1);
      ppu.flicker = 'rotate';
      ppu.flickerStep = 0;                // OAM 輪替由 NES.SH.OAM（或 fallback）自己做 ⇒ 可重現

      g.ship = CR.Ship.create();
      CR.ship = g.ship;                   // 契約：CR.ship
      g.oam = SH.OAM(ppu, { reserve: 0 });

      call(st(), 'init', ppu);            // stage 建地形 / Scroller（缺席則整片底色）
      if (!st()) g.noStageWarn = true;

      hudStatic(ppu);
      hudHide(ppu);                     // P3-1：標題畫面不掛能量表（進遊戲時 toPlay 會重建）
      drawMsg(ppu, TITLE, 0);

      ppu.scroll(0, 0, 0);                // 捲動 / 分割由遊戲設（engine 契約異動①）
      ppu.split(SPLIT_LINE, { x: 0, y: SPLIT_LINE, nt: 0 });

      call(CR.Audio, 'init', nes);
      call(CR.Audio, 'play', 'title');
      g.mode = 'title'; g.frames = 0;
    },

    update: function (nes) {
      var input = nes.input || NES.Input;
      g.input = input;
      g.frames++;

      // fix5：一鍵密技在幀邊界處理（觸控 / 鍵盤 / 事件三條路共用）
      if (g.cheatCool > 0) g.cheatCool--;
      if (g.cheatReq) { g.cheatReq = false; doCheat(); }
      // 不在暫停畫面時的「SECRET!」倒數（暫停版由 paused 分支自己收回 PAUSE 兩行）
      if (!g.paused && g.secretMsg > 0 && --g.secretMsg === 0) {
        muteBudget(true); clearMsg(g.ppu); call(st(), 'redraw'); muteBudget(false);
      }

      if (g.mode === 'title') {
        if (input.pressed(BTN.START) || input.pressed(BTN.A)) toPlay();
      } else if (g.mode === 'gameover') {
        // [源] §9-1：GAME OVER 畫面的 Konami 指令 = 3 條命續關（分數保留）；START 才是回標題
        // fix4：**SELECT = 一鍵續關**（同樣效果、不限次數），Konami 序列照舊保留
        konamiPush(input);
        if (input.pressed(BTN.SELECT)) { konamiClear(); g.selectContinues++; continueGame(); }
        else if (konamiHit()) { konamiClear(); continueGame(); }
        else if (input.pressed(BTN.START)) toTitle();
      } else if (g.mode === 'stageclear') {
        if (input.pressed(BTN.START)) toTitle();
      } else if (g.paused) {
        // 暫停中：遊戲完全凍結，只收 SELECT（fix4 一鍵密技）、Konami 指令與 START（研究 §7-3「暫停」）
        if (input.pressed(BTN.SELECT)) trySelectSecret();
        konamiPush(input);
        var code = konamiHit();
        if (code) { konamiClear(); trySecret(code); }
        if (g.secretMsg > 0 && --g.secretMsg === 0) {
          muteBudget(true); drawMsg(g.ppu, PAUSE, 0); muteBudget(false);
        }
        if (input.pressed(BTN.START)) unpauseGame();
      } else if (g.mode === 'play' && input.pressed(BTN.START)) {
        pauseGame();
      } else {
        g.playFrames++;
        var ev = g.ship.update(g);                  // 船 / 選項 / 自機彈
        if (g.mode === 'play') {
          call(st(), 'update', g);                  // 關卡：捲動 / 出怪 / 敵彈 / 膠囊
          // QA P2-2：魔王進場（bossActive false→true）換魔王曲；擊破後由 toStageClear 換 clear
          var bossNow = !!(st() && st().bossActive);
          if (bossNow && !g.bossOn && CR.Audio && CR.Audio.play) call(CR.Audio, 'play', 'boss');
          g.bossOn = bossNow;
          collide();                                // 碰撞 + 撿膠囊
          drainScore();                             // 收 stage 記的分（EXTEND / HI 一併處理）
          if (!g.ship.alive) g.mode = 'dead';
          else if (st() && st().cleared) toStageClear();
        } else if (g.mode === 'dead') {
          if (ev === 'deathdone') { respawn(); if (g.mode === 'dead') g.mode = 'play'; }
        }
      }
      if (CR.Audio && typeof CR.Audio.tick === 'function') call(CR.Audio, 'tick', nes);
      else if (nes.music && nes.music.tick) nes.music.tick();     // song.js 還沒到位時的保底
    },

    draw: function (nes) {
      var ppu = nes.ppu;
      if (hudOn) hudSync(ppu, g.ship);
      // engine 契約異動①：Scroller 不碰 ppu.scroll / split，捲動由遊戲自己設（% 512，不是 & 255）
      ppu.scroll(((camX() % 512) + 512) % 512, 0, 0);
      ppu.split(SPLIT_LINE, { x: 0, y: SPLIT_LINE, nt: 0 });

      var oam = g.oam;
      oam.begin();
      drawShip(oam);                                // prio 0
      drawOptions(oam);                             // prio 0
      drawShots(oam);                               // prio 1
      call(st(), 'draw', oam);                      // 敵彈 prio 2 / 敵 prio 3（stage 自己 add）
      drawFx(oam);                                  // prio 4
      oam.end();
    },

    state: function () {
      var s2 = g.ship.state();
      var stg = st();
      var n = 0;
      eachOf(stg && stg.enemies, function () { n++; });
      return {
        mode: g.mode, frame: g.frames, playFrames: g.playFrames,
        x: s2.x, y: s2.y, bx: s2.bx, by: s2.by,
        alive: s2.alive, speed: s2.speed, speedPx: s2.speedPx,
        gauge: s2.gauge, gaugeName: s2.gaugeName, power: s2.power, rank: s2.rank,
        options: s2.options, shots: s2.shots, shotCount: s2.shotCount, timers: s2.timers,
        capsules: s2.capsules, ringSteps: s2.ringSteps, moved: s2.moved,
        invul: s2.invul, lives: s2.lives, score: s2.score, hi: s2.hi,
        deathTimer: s2.deathTimer, deaths: s2.deaths, booms: s2.booms,
        camX: camX(), enemies: n, kills: g.kills, hits: g.hits,
        stage: stg ? {
          present: true, camX: camX(), cleared: !!stg.cleared, bossActive: !!stg.bossActive,
          length: stg.length || 0
        } : { present: false },
        oam: { dropped: (g.oam && g.oam.dropped) | 0, used: (g.oam && g.oam.used) | 0, engine: SH ? SH.usingEngine : false },
        hud: hudOn && g.ppu ? hudString(g.ppu) : '',
        hudOn: hudOn,
        // 畫面上看得到的訊息文字（列 11 / 15）—— QA P1-2 的驗收欄位
        msg: g.ppu ? (screenText(11).trim() + '|' + screenText(15).trim()) : '',
        // fix4：暫停第二行（列 13）與 GAME OVER 第三行（列 17）
        msg2: g.ppu ? (screenText(13).trim() + '|' + screenText(17).trim()) : '',
        bossSong: !!g.bossOn,
        // fix3：暫停 / 秘技 / 續關
        paused: !!g.paused, secretLeft: g.secretLeft | 0, secrets: g.secrets | 0,
        secretMsg: g.secretMsg | 0, continues: g.continues | 0, continueCam: g.continueCam | 0,
        konami: KONAMI_BUF.join(''), lastCode: g.lastCode,
        selectUsed: !!g.selectUsed, selectSecrets: g.selectSecrets | 0,
        selectContinues: g.selectContinues | 0,
        // fix5：一鍵密技
        cheats: g.cheats | 0, cheatContinues: g.cheatContinues | 0,
        cheatCool: g.cheatCool | 0, lastCheat: g.lastCheat || '',
        lastEvent: g.lastEvent
      };
    }
  };

  CR.GAME = GAME;
  CR.hudString = function () { return hudString(g.ppu); };
  CR.screenText = screenText;
  window.GAME = GAME;
})();
