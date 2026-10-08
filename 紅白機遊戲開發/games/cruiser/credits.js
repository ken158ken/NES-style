/*
 * games/cruiser/credits.js — 《星塵巡航艦》R4：結局工作人員名單捲動（CR.Credits）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-r4 agent（R4）｜ 依賴：engine/ppu.js（名稱表 + 垂直捲動）
 *
 * ── 怎麼做到「真機式」垂直捲動 ────────────────────────────────────────────────
 *   `engine/ppu.js` 的 `_bgLine` 對 world y 取 `% 480`，再用 `y >= 240 → ntRow ^= 1`；
 *   本作是**垂直鏡像（mirroring('v')，左右兩張不同）**⇒ ntRow 不改實體名稱表
 *   ⇒ **垂直捲動每 240 px 繞一圈，剛好是 30 列的環形緩衝**。
 *   所以名單就是真機的標準作法：
 *     ① 進場時把 30 列一次寫滿（rendering 關閉 ⇒ budget.mute）
 *     ② 之後每幀 y += 1/4 px；**每跨過 8 px 寫 1 列**（32 byte，遠低於 160 byte 預算）
 *        寫的那一列是「即將從下緣捲進來」的 (k+29) % 30 —— 寫的那一瞬間它落在
 *        掃描線 232..239（**overscan 裁掉的 8 線**）⇒ 玩家看不到寫入過程，不會撕裂。
 *     ③ 捲到最後一屏（y = (N-30) × 8）就停住，畫面停在 THE END。
 *   捲動期間 **`ppu.split(null)`**（HUD 收起來 ⇒ 列 26..29 讓給名單當內容列），
 *   `ppu.scroll(0, y, 0)` 只用名稱表 0。離場由 main.js 還原 split / HUD / 地形。
 *
 * 名單內容全部原創，**沒有真人姓名**（職稱 + 本專案自創的組名）。
 */
(function () {
  'use strict';
  var CR = window.CR = window.CR || {};

  var ROWS_NT = 30;                      // 名稱表列數（= 垂直繞一圈 240 px）
  var VIEW_ROWS = 30;
  var SPEED_NUM = 1, SPEED_DEN = 4;      // 1/4 px/幀（240 px ≈ 960 幀 ≈ 16 秒）
  var TOTAL_ROWS = 60;                   // 名單總列數（含前後留白）

  var LINES = [
    'STARDUST CRUISER', '', 'ALL STAGES CLEAR', '', '',
    '- STAFF -', '',
    'GAME DESIGN', 'STARDUST TEAM', '',
    'PROGRAM', 'NES CORE ENGINE', '',
    'GRAPHICS', 'CHR WORKSHOP', '',
    'MUSIC AND SOUND', '2A03 AUDIO LAB', '',
    'STAGE DESIGN', 'SEVEN WORLDS CREW', '',
    'BOSS DESIGN', 'CORE FORTRESS CREW', '',
    'BALANCE AND QA', 'PLAYTHROUGH ROBOT', '', '',
    'NO ROM WAS USED', 'ALL ART IS ORIGINAL', '', '',
    'SPECIAL THANKS', 'ALL 8 BIT FANS', '', '',
    'THANK YOU FOR PLAYING', '',
    'THE END'
  ];

  // 讓 'THE END' 落在最後一屏的中央（世界列 44 ⇒ 最後一屏 30..59 的第 14 列）
  function buildSeq() {
    var endAt = 44, lead = Math.max(2, endAt - (LINES.length - 1)), out = [], i;
    for (i = 0; i < lead; i++) out.push('');
    for (i = 0; i < LINES.length; i++) out.push(LINES[i]);
    while (out.length < TOTAL_ROWS) out.push('');
    return out.slice(0, Math.max(TOTAL_ROWS, out.length));
  }
  var SEQ = buildSeq();
  var STOP_Y = Math.max(0, (SEQ.length - VIEW_ROWS) * 8);

  var ppu0 = null, y = 0, frac = 0, nextRow = 0, running = false, done = false, holdT = 0;

  function blankTile() {
    var B = CR.BGTILE || {};
    return (B.H_SP === undefined) ? 0 : B.H_SP;
  }
  function tileOf(ch) {
    var B = CR.BGTILE || {}, n = CR.tileNameFor ? CR.tileNameFor(ch) : 'H_SP';
    return (B[n] === undefined) ? blankTile() : B[n];
  }
  function centerCol(text) {
    var c = 16 - ((text.length + 1) >> 1);
    return c < 0 ? 0 : c;
  }
  // 把世界列 wr 的內容寫進名稱表列 wr % 30（只寫名稱表 0；scroll x = 0 ⇒ 只看得到它）
  function writeRow(wr) {
    if (!ppu0) return 0;
    var r = ((wr % ROWS_NT) + ROWS_NT) % ROWS_NT;
    var text = (wr >= 0 && wr < SEQ.length) ? SEQ[wr] : '';
    var col = text ? centerCol(text) : 0, c, bytes = 0;
    for (c = 0; c < 32; c++) {
      var ch = (text && c >= col && c < col + text.length) ? text.charAt(c - col) : ' ';
      ppu0.setTile(0, c, r, ch === ' ' ? blankTile() : tileOf(ch));
      bytes++;
    }
    return bytes;
  }

  var C = {
    LINES: LINES, SEQ: SEQ, STOP_Y: STOP_Y, ROWS_NT: ROWS_NT,
    SPEED: SPEED_NUM / SPEED_DEN,
    // 預估長度（幀）：捲到底 + 停 2 秒
    FRAMES: STOP_Y * SPEED_DEN / SPEED_NUM + 120,

    start: function (ppu) {
      ppu0 = ppu || ppu0;
      y = 0; frac = 0; done = false; running = true; holdT = 0;
      if (!ppu0) return C;
      var r;
      for (r = 0; r < ROWS_NT; r++) writeRow(r);
      ppu0.fillAttr(0, 0, 0, 16, 15, 0);        // 整張屬性 = 調色盤 0（白字）
      ppu0.fillAttr(1, 0, 0, 16, 15, 0);
      nextRow = ROWS_NT;                         // 下一個要寫的世界列
      return C;
    },

    // 每幀一次；回傳 true = 名單已經捲到底（main 可以收尾了）
    update: function () {
      if (!running) return done;
      if (y < STOP_Y) {
        frac += SPEED_NUM;
        while (frac >= SPEED_DEN) {
          frac -= SPEED_DEN;
          y++;
          if ((y & 7) === 0) {                   // 跨過 8 px ⇒ 補一列（在下緣 overscan 裡）
            writeRow(nextRow);
            nextRow++;
          }
        }
        if (y >= STOP_Y) y = STOP_Y;
      } else {
        holdT++;
        if (holdT >= 120) done = true;
      }
      return done;
    },

    // 每幀 draw 時套用（取代 main 的 scroll / split）
    apply: function (ppu) {
      var p = ppu || ppu0;
      if (!p) return;
      p.scroll(0, y | 0, 0);
      p.split(null);
    },
    stop: function () { running = false; return C; },
    skip: function () {                          // START 快轉到最後一屏
      if (!running) return C;
      // fix-r4（qa-r4 P2-3）：剩下的列（最多 60 列 = 960 byte）是一幀寫完的**轉場**，
      // 跟 main 其他 16 處轉場一樣要把 VBlank 計帳 mute 起來 —— 不包的話這是整局唯一一次超支。
      var mute = CR.muteBudget;
      if (mute) mute(true);
      while (nextRow < SEQ.length) { writeRow(nextRow); nextRow++; }
      if (mute) mute(false);
      y = STOP_Y; frac = 0; holdT = 120; done = true;
      return C;
    },
    done: function () { return done; },
    y: function () { return y | 0; },
    state: function () {
      return { running: running, done: done, y: y | 0, stopY: STOP_Y, row: y >> 3,
        nextRow: nextRow, rows: SEQ.length, hold: holdT };
    },
    rowText: function (r) {                      // 測試用：讀名稱表上第 r 列的字
      if (!ppu0) return '';
      var out = '', c, t, REV = CR.BGREV || null;
      for (c = 0; c < 32; c++) {
        t = ppu0.getTile(0, c, ((r % ROWS_NT) + ROWS_NT) % ROWS_NT);
        out += (REV && REV[t] !== undefined) ? REV[t] : '?';
      }
      return out.replace(/\s+$/, '');
    }
  };

  CR.Credits = C;
})();
