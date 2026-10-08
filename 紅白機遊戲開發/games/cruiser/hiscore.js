/*
 * games/cruiser/hiscore.js — 《星塵巡航艦》R4：分數排行榜（CR.HiScore）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-r4 agent（R4）
 * 前 10 名存 `localStorage.cruiser_scores`（JSON）；名字是**紅白機風的 3 字母**
 *   （A..Z 加一個 `.`），↑↓ 換字母、←→ 移游標、A / START 確定。
 *
 * 真機其實是存在卡帶的電池 SRAM 裡（研究 02「電池」欄）；瀏覽器用 localStorage 等價，
 * 讀不到 / 壞掉就退回預設榜（下表），**永遠不會 throw**（私密視窗、關掉 cookie 都能玩）。
 *
 * 預設榜（原創，數字刻意訂高：讓隨手一局不會污染榜單，也讓既有測試的 GAME OVER
 *   流程維持「按 START 直接回標題」—— 沒上榜就不會跳名字輸入）：
 *   ACE 200000 / NES 180000 / CRU 160000 / OPT 140000 / LSR 120000 /
 *   RPL 100000 / FAN  80000 / MOA  60000 / BIO  40000 / CRS  20000
 */
(function () {
  'use strict';
  var CR = window.CR = window.CR || {};

  var KEY = 'cruiser_scores';
  var TOP = 10;
  var NAME_LEN = 3;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.';
  var MAX_SCORE = 9999999;

  var DEFAULTS = [
    { n: 'ACE', s: 200000, st: 7, l: 1 }, { n: 'NES', s: 180000, st: 6, l: 1 },
    { n: 'CRU', s: 160000, st: 6, l: 0 }, { n: 'OPT', s: 140000, st: 5, l: 0 },
    { n: 'LSR', s: 120000, st: 5, l: 0 }, { n: 'RPL', s: 100000, st: 4, l: 0 },
    { n: 'FAN', s: 80000, st: 4, l: 0 }, { n: 'MOA', s: 60000, st: 3, l: 0 },
    { n: 'BIO', s: 40000, st: 2, l: 0 }, { n: 'CRS', s: 20000, st: 1, l: 0 }
  ];

  function defaults() {
    var out = [], i;
    for (i = 0; i < DEFAULTS.length; i++) {
      out.push({ n: DEFAULTS[i].n, s: DEFAULTS[i].s, st: DEFAULTS[i].st, l: DEFAULTS[i].l });
    }
    return out;
  }

  function cleanName(v) {
    var s = String(v === undefined || v === null ? '' : v).toUpperCase(), out = '', i, c;
    for (i = 0; i < s.length && out.length < NAME_LEN; i++) {
      c = s.charAt(i);
      if (LETTERS.indexOf(c) >= 0) out += c;
    }
    while (out.length < NAME_LEN) out += '.';
    return out;
  }

  function sanitize(list) {
    var out = [], i, e, s;
    if (!list || typeof list.length !== 'number') return defaults();
    for (i = 0; i < list.length && out.length < TOP; i++) {
      e = list[i];
      if (!e) continue;
      s = parseInt(e.s, 10);
      if (!isFinite(s) || s < 0) continue;
      out.push({ n: cleanName(e.n), s: Math.min(MAX_SCORE, s | 0), st: (e.st | 0) || 1, l: (e.l | 0) || 0 });
    }
    if (!out.length) return defaults();
    out.sort(function (a, b) { return b.s - a.s; });
    while (out.length < TOP) out.push({ n: '...', s: 0, st: 1, l: 0 });
    return out.slice(0, TOP);
  }

  var table = null;

  function load() {
    if (table) return table;
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { table = defaults(); return table; }
    try { table = sanitize(JSON.parse(raw)); } catch (e2) { table = defaults(); }
    return table;
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(table || defaults())); } catch (e) { }
    return table;
  }

  function rankOf(score) {                 // 0..TOP-1 = 第幾名；-1 = 沒上榜
    var t = load(), i;
    score = score | 0;
    for (i = 0; i < t.length; i++) if (score > t[i].s) return i;
    return -1;
  }
  function insert(name, score, st, loop) {
    var t = load(), r = rankOf(score);
    if (r < 0) return -1;
    t.splice(r, 0, { n: cleanName(name), s: Math.min(MAX_SCORE, score | 0), st: (st | 0) || 1, l: loop | 0 });
    while (t.length > TOP) t.pop();
    save();
    return r;
  }

  function pad0(v, w) { var s = String(v | 0); while (s.length < w) s = '0' + s; return s; }
  function pad2(v) { return pad0(v, 2); }

  /* ---------------------------------------------- 排行榜畫面（drawMsg 的行物件） */
  function tableLines(markIdx) {
    var t = load(), out = [{ row: 2, col: 10, text: 'HIGH SCORES' }], i, e, mk;
    for (i = 0; i < t.length; i++) {
      e = t[i];
      mk = (i === markIdx) ? '>' : ' ';
      out.push({
        row: 5 + i * 2, col: 5,
        text: mk + pad2(i + 1) + ' ' + e.n + ' ' + pad0(e.s, 7) + ' ST' + (e.st | 0)
      });
    }
    return out;
  }

  /* ---------------------------------------------- 名字輸入（3 字母） */
  var entry = { active: false, chars: [0, 0, 0], pos: 0, score: 0, st: 1, loop: 0, rank: -1, blink: 0 };

  function begin(score, st, loop) {
    entry.active = true;
    entry.chars = [0, 0, 0]; entry.pos = 0; entry.blink = 0;
    entry.score = score | 0; entry.st = (st | 0) || 1; entry.loop = loop | 0;
    entry.rank = rankOf(score);
    return entry.rank;
  }
  function name() {
    var s = '', i;
    for (i = 0; i < NAME_LEN; i++) s += LETTERS.charAt(entry.chars[i] % LETTERS.length);
    return s;
  }
  function bump(d) {
    var n = LETTERS.length;
    entry.chars[entry.pos] = ((entry.chars[entry.pos] + (d | 0)) % n + n) % n;
    return name();
  }
  function move(d) {
    entry.pos = ((entry.pos + (d | 0)) % NAME_LEN + NAME_LEN) % NAME_LEN;
    return entry.pos;
  }
  function commit() {
    var r = insert(name(), entry.score, entry.st, entry.loop);
    entry.active = false;
    entry.rank = r;
    return r;
  }
  function entryLines() {
    var nm = name(), spaced = nm.charAt(0) + ' ' + nm.charAt(1) + ' ' + nm.charAt(2);
    var caret = '     ';
    caret = (entry.pos === 0 ? '-' : ' ') + ' ' + (entry.pos === 1 ? '-' : ' ') + ' ' + (entry.pos === 2 ? '-' : ' ');
    return [
      { row: 6, col: 9, text: 'NEW RECORD' },
      { row: 8, col: 8, text: 'RANK ' + pad2((entry.rank < 0 ? 0 : entry.rank) + 1) +
        '  ST' + (entry.st | 0) },
      { row: 10, col: 8, text: 'SCORE ' + pad0(entry.score, 7) },
      { row: 14, col: 13, text: spaced },
      { row: 15, col: 13, text: caret },
      { row: 19, col: 5, text: 'UP DOWN = LETTER' },
      { row: 21, col: 5, text: 'LEFT RIGHT = MOVE' },
      { row: 23, col: 6, text: 'A OR START = OK' }
    ];
  }

  CR.HiScore = {
    KEY: KEY, TOP: TOP, NAME_LEN: NAME_LEN, LETTERS: LETTERS, DEFAULTS: DEFAULTS,
    load: load, list: function () { return load().slice(); }, save: save,
    reload: function () { table = null; return load(); },
    clear: function () { table = defaults(); save(); return table; },
    rankOf: rankOf, qualifies: function (s) { return rankOf(s) >= 0; }, insert: insert,
    tableLines: tableLines,
    begin: begin, name: name, bump: bump, move: move, commit: commit,
    entryLines: entryLines, cleanName: cleanName,
    entry: function () {
      return { active: entry.active, pos: entry.pos, name: name(), score: entry.score,
        rank: entry.rank, st: entry.st, loop: entry.loop };
    },
    state: function () {
      var t = load();
      return { top: t.length, best: t[0] ? t[0].s : 0, last: t[t.length - 1] ? t[t.length - 1].s : 0,
        names: t.map(function (e) { return e.n; }),
        scores: t.map(function (e) { return e.s; }), entry: CR.HiScore.entry() };
    }
  };
})();
