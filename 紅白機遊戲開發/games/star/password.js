/*
 * games/star/password.js — 《星塵勇者》紅白機風「密碼存檔」編解碼（R4 star-meta）
 * ---------------------------------------------------------------------------
 * 擁有者：star-meta agent ｜ 依賴：無（純函式，零相依；沒有 DOM、沒有 PPU）
 * 契約：docs/TASKS.md「R4 star-meta」、docs/PLAN.md §4（SMB3 式地圖 + 密碼）
 *
 * 為什麼是「密碼」而不是存檔：紅白機卡匣沒電池就只能靠密碼（研究 03/02 §存檔：
 * SMB3 用笛子 / 地圖道具取代密碼；魂斗羅 / 洛克人用字母或點陣密碼）。本專案不碰
 * localStorage（還原標準：真機沒有這東西），所以進度一律經「10 個字母」往返。
 *
 *   位元配置（40 bit = 5 byte = 10 個 4-bit 字母）
 *   ┌ byte0 ┬ byte1 ┬ byte2 ───────────────────┬ byte3 ┬ byte4 ┐
 *   │ 通關位元 15..8 │ 通關位元 7..0 │ 命(4) 擁有(2) 選中(2) │ 分/1000 │ 校驗 │
 *   └───────┴───────┴─────────────────────────┴───────┴───────┘
 *   通關位元：bit i = 第 i 關（i = (世界 − 1) × 4 + (關 − 1)）已通關 ⇒ 世界 1..4 共 16 關，
 *             F4-1 / F4-2 的 W3 / W4 不必改這支檔。
 *   命：0..15（存 h.lives，> 15 夾到 15）
 *   擁有：bit0 = 火球、bit1 = 飛鏢；選中：0 無 / 1 火球 / 2 飛鏢
 *   分/1000：分數的千位（0..255 ⇒ 最多 255000；只是「回來時不會從 0 開始」的誠意值）
 *   校驗：(b0×3 + b1×5 + b2×7 + b3×11 + SALT) & 255 ⇒ 任何一個字母打錯都有 255/256 被擋掉
 *
 *   字母表刻意只有 16 個字（4 bit / 字）且**去掉 I O Q S U V W X Y Z**：
 *   I / 1、O / 0、S / 5 在 8×8 字型上容易看錯（研究 05 §字型易讀性），
 *   剩下的 Z / U / V / W / X / Y 不用是為了湊滿 2 的次方（16 個）。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};

  var ALPHABET = 'ABCDEFGHJKLMNPRT';     // 16 個字母 = 4 bit
  var LEN = 10;                          // 10 個字母 = 40 bit（任務書：8 ~ 12 字元）
  var GROUP = 5;                         // 顯示時每 5 個字一組（ABCDE FGHJK）
  var SALT = 0x5A;
  var WORLDS = 4, STAGES = 4;            // 通關位元涵蓋 4 世界 × 4 關
  var MAX_LIVES = 15, MAX_SCORE_K = 255;

  var INDEX = {};
  (function () { for (var i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET.charAt(i)] = i; })();

  /* ---------------------------------------------------------- 關卡 id ↔ 位元 */
  // '2-3' → 位元 6（(2−1)×4 + (3−1)）。認不出來的 id（'test'）回 −1。
  function idToBit(id) {
    var s = String(id || '');
    var m = /^(\d+)-(\d+)$/.exec(s);
    if (!m) return -1;
    var w = parseInt(m[1], 10), n = parseInt(m[2], 10);
    if (!(w >= 1 && w <= WORLDS) || !(n >= 1 && n <= STAGES)) return -1;
    return (w - 1) * STAGES + (n - 1);
  }
  function bitToId(i) {
    i = i | 0;
    if (i < 0 || i >= WORLDS * STAGES) return null;
    return ((i / STAGES) | 0) + 1 + '-' + ((i % STAGES) + 1);
  }
  function isCleared(mask, id) {
    var b = idToBit(id);
    return b < 0 ? false : !!(mask & (1 << b));
  }
  function setCleared(mask, id, on) {
    var b = idToBit(id);
    if (b < 0) return mask | 0;
    return (on === false) ? ((mask | 0) & ~(1 << b)) : ((mask | 0) | (1 << b));
  }
  function countCleared(mask) {
    var n = 0, i;
    for (i = 0; i < WORLDS * STAGES; i++) if (mask & (1 << i)) n++;
    return n;
  }

  /* ------------------------------------------------------------ 編碼 / 解碼 */
  function clamp(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  function bytesOf(st) {
    st = st || {};
    var mask = (st.cleared | 0) & 0xFFFF;
    var lives = clamp(st.lives === undefined ? 3 : st.lives, 0, MAX_LIVES);
    var owned = (st.owned | 0) & 3;
    var sel = (st.sel | 0) & 3;
    if (sel > 0 && !(owned & (1 << (sel - 1)))) sel = 0;      // 沒拿到的武器不能是「選中」
    if (sel > 2) sel = 0;
    var k = clamp(Math.floor((st.score | 0) / 1000), 0, MAX_SCORE_K);
    var b = [(mask >> 8) & 255, mask & 255, ((lives & 15) << 4) | (owned << 2) | sel, k, 0];
    b[4] = checksum(b);
    return b;
  }
  function checksum(b) {
    return ((b[0] * 3 + b[1] * 5 + b[2] * 7 + b[3] * 11 + SALT) & 255);
  }

  /** 狀態 → 10 個字母（大寫、無空白）。 */
  function encode(st) {
    var b = bytesOf(st), out = '', i;
    for (i = 0; i < b.length; i++) {
      out += ALPHABET.charAt((b[i] >> 4) & 15) + ALPHABET.charAt(b[i] & 15);
    }
    return out;
  }

  /** 去空白 / 轉大寫（玩家抄下來的 'abcde fghjk' 也收）。 */
  function normalize(code) {
    return String(code === undefined || code === null ? '' : code).toUpperCase().replace(/[\s\-_]/g, '');
  }

  /** 10 個字母 → 狀態物件；長度 / 字母 / 校驗任一不合 → null（壞碼拒絕）。 */
  function decode(code) {
    var s = normalize(code), i, v, b = [];
    if (s.length !== LEN) return null;
    for (i = 0; i < LEN; i++) {
      v = INDEX[s.charAt(i)];
      if (v === undefined) return null;                 // 不在字母表（含 I O Q S U V W X Y Z）
      if (i & 1) b[(i - 1) >> 1] |= v; else b[i >> 1] = v << 4;
    }
    if (b[4] !== checksum(b)) return null;              // 校驗不過
    var owned = (b[2] >> 2) & 3, sel = b[2] & 3;
    if (sel > 2) return null;                           // 選中值只有 0/1/2
    if (sel > 0 && !(owned & (1 << (sel - 1)))) return null;   // 選中沒擁有的武器 = 壞碼
    return {
      cleared: ((b[0] << 8) | b[1]) & 0xFFFF,
      lives: (b[2] >> 4) & 15,
      owned: owned,
      sel: sel,
      score: b[3] * 1000,
      code: s
    };
  }

  function valid(code) { return !!decode(code); }

  /** 顯示用：每 5 個字一組（'ABCDEFGHJK' → 'ABCDE FGHJK'）。 */
  function format(code) {
    var s = normalize(code), out = '', i;
    for (i = 0; i < s.length; i++) {
      if (i > 0 && (i % GROUP) === 0) out += ' ';
      out += s.charAt(i);
    }
    return out;
  }

  /** 下一關 id（通關位元用；'1-4' → '2-1'，最後一關 → null）。 */
  function nextId(id) {
    var b = idToBit(id);
    return b < 0 ? null : bitToId(b + 1);
  }

  ST.Password = {
    ALPHABET: ALPHABET, LEN: LEN, GROUP: GROUP, SALT: SALT,
    WORLDS: WORLDS, STAGES: STAGES, MAX_LIVES: MAX_LIVES, MAX_SCORE_K: MAX_SCORE_K,
    BITS: WORLDS * STAGES,
    idToBit: idToBit, bitToId: bitToId, nextId: nextId,
    isCleared: isCleared, setCleared: setCleared, countCleared: countCleared,
    encode: encode, decode: decode, valid: valid, normalize: normalize, format: format,
    checksum: checksum, bytesOf: bytesOf,
    /** 字母表的第 i 個字（密碼輸入畫面的 ↑ / ↓ 用）。 */
    charAt: function (i) { return ALPHABET.charAt(((i | 0) % ALPHABET.length + ALPHABET.length) % ALPHABET.length); },
    indexOf: function (ch) { var v = INDEX[String(ch).toUpperCase()]; return v === undefined ? -1 : v; },
    /** 空白密碼（輸入畫面的初始值）＝ 全 'A'。 */
    blank: function () { var s = '', i; for (i = 0; i < LEN; i++) s += ALPHABET.charAt(0); return s; }
  };

  /* =====================================================================
   * ST.PasswordUI — 密碼「輸入畫面」（標題選到 PASSWORD 後按 START 進來）
   * ---------------------------------------------------------------------
   * 只碰 PPU 的名稱表 / 屬性（和 main.js 的全屏文字同一條路），不碰 DOM。
   *   ← → 換字位、↑ ↓ 換字母、A 下一個字位、B 上一個字位（或離開）、START 確認、SELECT 離開
   * 確認：解得開 → { type:'ok', data }；解不開 → { type:'bad' }（畫面寫 BAD CODE，不離開）
   */
  var ROWS = { title: 6, code: 9, caret: 10, alpha: 13, hint1: 16, hint2: 17, hint3: 19, msg: 22 };
  var C0 = 6;                                  // 第一個字母的磚欄
  var U = { open: false, slots: [], at: 0, msg: '', msgT: 0, oks: 0, bads: 0 };

  function slotCol(i) { return C0 + (i | 0) * 2 + ((i >= GROUP) ? 1 : 0); }

  function uiText(ppu, col, row, s) {
    var t = (ST.textTiles && ST.bgBank) ? ST.textTiles(ST.bgBank, s) : null, i;
    if (!t) return 0;
    for (i = 0; i < t.length && col + i < 32; i++) ppu.setTile(0, col + i, row, t[i]);
    return t.length;
  }
  function uiBlank(ppu, row) {
    var b = ST.bgBank;
    ppu.fillTiles(0, 0, row, 32, 1, (b && b.has('SP')) ? b.index('SP') : 0);
  }

  function uiOpen(code) {
    var s = normalize(code || ST.Password.blank()), i, v;
    U.slots = [];
    for (i = 0; i < LEN; i++) {
      v = INDEX[s.charAt(i)];
      U.slots.push(v === undefined ? 0 : v);
    }
    U.at = 0; U.open = true; U.msg = ''; U.msgT = 0;
    return U.slots.slice();
  }
  function uiCode() {
    var s = '', i;
    for (i = 0; i < LEN; i++) s += ALPHABET.charAt(U.slots[i] | 0);
    return s;
  }
  function uiNote(text, frames) { U.msg = text || ''; U.msgT = (frames === undefined) ? 150 : (frames | 0); }

  function uiDraw(ppu) {
    var r, i, b = ST.bgBank;
    if (!ppu || !b) return false;
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [0x0F, 0x10, 0x30]);
    ppu.setBgPalette(1, [0x0F, 0x11, 0x21]);
    ppu.setBgPalette(2, [0x0F, 0x16, 0x27]);
    ppu.setBgPalette(3, [0x0F, 0x10, 0x30]);
    for (r = 4; r < 30; r++) uiBlank(ppu, r);
    ppu.fillAttr(0, 0, 2, 16, 13, 0);                  // 列 4..29 全部用 pal 0（白字）
    uiText(ppu, 12, ROWS.title, 'PASSWORD');
    for (i = 0; i < LEN; i++) {
      uiText(ppu, slotCol(i), ROWS.code, ALPHABET.charAt(U.slots[i] | 0));
      uiText(ppu, slotCol(i), ROWS.caret, (i === U.at) ? '^' : ' ');   // ^ = 主角頭像圖示（游標）
    }
    uiText(ppu, 8, ROWS.alpha, ALPHABET);
    uiText(ppu, 4, ROWS.hint1, 'UP DOWN = LETTER');
    uiText(ppu, 4, ROWS.hint2, 'LEFT RIGHT = SLOT');
    uiText(ppu, 4, ROWS.hint3, 'START = OK  B = BACK');
    uiText(ppu, 4, ROWS.msg, U.msgT > 0 ? U.msg : '                    ');
    return true;
  }

  function uiUpdate(g, input) {
    var BTN = (window.NES && NES.Input && NES.Input.BTN) || null;
    if (!U.open || !input || !BTN) return null;
    if (U.msgT > 0) U.msgT--;
    function sfx(n) { if (g && g.sfx) g.sfx(n); }
    if (input.pressed(BTN.RIGHT)) { U.at = (U.at + 1) % LEN; sfx('coin'); return { type: 'redraw' }; }
    if (input.pressed(BTN.LEFT)) { U.at = (U.at + LEN - 1) % LEN; sfx('coin'); return { type: 'redraw' }; }
    if (input.pressed(BTN.UP)) {
      U.slots[U.at] = (U.slots[U.at] + 1) % ALPHABET.length; sfx('bump'); return { type: 'redraw' };
    }
    if (input.pressed(BTN.DOWN)) {
      U.slots[U.at] = (U.slots[U.at] + ALPHABET.length - 1) % ALPHABET.length; sfx('bump'); return { type: 'redraw' };
    }
    if (input.pressed(BTN.A)) { U.at = (U.at + 1) % LEN; sfx('coin'); return { type: 'redraw' }; }
    if (input.pressed(BTN.START)) {
      var data = decode(uiCode());
      if (!data) { U.bads++; uiNote('BAD CODE'); sfx('bump'); return { type: 'bad', code: uiCode() }; }
      U.oks++;
      uiNote('OK!');
      sfx('powerup');
      return { type: 'ok', data: data, code: data.code };
    }
    if (input.pressed(BTN.B) || input.pressed(BTN.SELECT)) { U.open = false; return { type: 'exit' }; }
    return null;
  }

  ST.PasswordUI = {
    ROWS: ROWS, C0: C0, slotCol: slotCol,
    open: uiOpen, draw: uiDraw, update: uiUpdate, note: uiNote,
    code: uiCode,
    close: function () { U.open = false; return true; },
    state: function () {
      return {
        open: !!U.open, at: U.at | 0, code: uiCode(), slots: U.slots.slice(),
        msg: U.msgT > 0 ? U.msg : '', oks: U.oks | 0, bads: U.bads | 0,
        valid: !!decode(uiCode())
      };
    },
    /** 測試 / 機器人：直接把密碼填進畫面（不模擬按鍵）。 */
    set: function (code) { return uiOpen(code); },
    _u: U
  };
})();
