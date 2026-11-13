/*
 * games/cart5/quiz/math.js — 《星塵問答》心算題目產生器（純函式、可重現）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-5 cart5-quiz（R9）
 * CT.Quiz.Math.gen(level 1..8, rnd) → { level, text: '３７＋４８＝', ans: 85 }
 *   text 用全形數字與運算子（16×16 字形，cjk_glyphs.py 從 text_ui.js 的 MATH_CHARS 收字）。
 *   保證：答案為 0..9999 的整數；除法一律整除；混合運算照先乘除後加減（含括號的題型明寫括號）。
 * | 級 | 題型 |
 * |----|------|
 * | 1 | 個位數加法、20 以內減法 |
 * | 2 | 二位數 ± 一位數（50 以內） |
 * | 3 | 二位數 ± 二位數（100 以內，不為負） |
 * | 4 | 九九乘法 |
 * | 5 | 整除除法（九九反推） |
 * | 6 | 混合：a ＋ b × c、a × b − c |
 * | 7 | 二位數 × 一位數、三位數 ± 二位數 |
 * | 8 | 括號：(a ＋ b) × c、a × b ÷ c（整除）|
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var QZ = CT.Quiz = CT.Quiz || {};

  var FW = '０１２３４５６７８９';
  function fw(n) {
    var s = String(n), o = '';
    for (var i = 0; i < s.length; i++) o += FW.charAt(s.charCodeAt(i) - 48);
    return o;
  }
  function ri(rnd, a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  var OPS = { '+': '＋', '-': '－', '*': '×', '/': '÷', '(': '（', ')': '）', '=': '＝' };
  // 由 token 陣列組字串（數字轉全形）
  function show(tokens) {
    var s = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      s += typeof t === 'number' ? fw(t) : (OPS[t] || t);
    }
    return s + OPS['='];
  }

  function gen(level, rnd) {
    level = Math.max(1, Math.min(8, level | 0));
    var a, b, c, tk, ans;
    switch (level) {
      case 1:
        if (rnd() < 0.5) { a = ri(rnd, 1, 9); b = ri(rnd, 1, 9); tk = [a, '+', b]; ans = a + b; }
        else { a = ri(rnd, 5, 18); b = ri(rnd, 1, Math.min(9, a)); tk = [a, '-', b]; ans = a - b; }
        break;
      case 2:
        if (rnd() < 0.5) { a = ri(rnd, 10, 41); b = ri(rnd, 2, 9); tk = [a, '+', b]; ans = a + b; }
        else { a = ri(rnd, 12, 50); b = ri(rnd, 2, 9); tk = [a, '-', b]; ans = a - b; }
        break;
      case 3:
        if (rnd() < 0.5) { a = ri(rnd, 11, 69); b = ri(rnd, 11, 99 - a); tk = [a, '+', b]; ans = a + b; }
        else { a = ri(rnd, 30, 99); b = ri(rnd, 11, a - 1); tk = [a, '-', b]; ans = a - b; }
        break;
      case 4:
        a = ri(rnd, 2, 9); b = ri(rnd, 2, 9); tk = [a, '*', b]; ans = a * b;
        break;
      case 5:
        b = ri(rnd, 2, 9); ans = ri(rnd, 2, 9); a = b * ans; tk = [a, '/', b];
        break;
      case 6:
        if (rnd() < 0.5) { a = ri(rnd, 1, 20); b = ri(rnd, 2, 9); c = ri(rnd, 2, 9); tk = [a, '+', b, '*', c]; ans = a + b * c; }
        else { a = ri(rnd, 2, 9); b = ri(rnd, 2, 9); c = ri(rnd, 1, a * b); tk = [a, '*', b, '-', c]; ans = a * b - c; }
        break;
      case 7:
        if (rnd() < 0.5) { a = ri(rnd, 12, 49); b = ri(rnd, 2, 9); tk = [a, '*', b]; ans = a * b; }
        else if (rnd() < 0.5) { a = ri(rnd, 100, 899); b = ri(rnd, 11, 99); tk = [a, '+', b]; ans = a + b; }
        else { a = ri(rnd, 120, 999); b = ri(rnd, 11, 99); tk = [a, '-', b]; ans = a - b; }
        break;
      default:
        if (rnd() < 0.5) { a = ri(rnd, 2, 15); b = ri(rnd, 2, 15); c = ri(rnd, 2, 9); tk = ['(', a, '+', b, ')', '*', c]; ans = (a + b) * c; }
        else { c = ri(rnd, 2, 9); a = c * ri(rnd, 1, 3); b = ri(rnd, 2, 9); tk = [a, '*', b, '/', c]; ans = a * b / c; }
    }
    return { level: level, text: show(tk), ans: ans, tokens: tk };
  }

  QZ.Math = { gen: gen, fw: fw, show: show, LEVELS: 8, PER_LEVEL: 5 };
})();
