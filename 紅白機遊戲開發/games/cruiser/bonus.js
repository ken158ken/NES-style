/*
 * games/cruiser/bonus.js — 《星塵巡航艦》R4：每關 1 個隱藏獎勵（CR.Bonus）
 * ---------------------------------------------------------------------------
 * 擁有者：cruiser-r4 agent（R4）｜ 只讀 CR.ship / CR.stage，缺席不致命
 * 研究依據：docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md §9-2
 *   [源] FC Gradius 的隱藏要素就是兩類：**打掉特定一組敵人**（4 個艙門 / 10 尊摩艾）
 *   與**飛到特定位置**（前四關各兩處「飛過去就拿到」的 5000 分 / 1UP 點）。
 *   本檔照這兩類各做一半，條件全部原創，獎勵只有兩種：**1UP** 或 **全消彈**。
 *
 * ── 七關的條件表（state().bonus 會回報進度，`?bonus=1` 之類的除錯旗標不需要）────
 * | 關 | 類型 | 條件 | 獎勵 |
 * |---|---|---|---|
 * | 1 | 位置 | 空戰段（欄 8..150）待在**畫面上緣帶**（y 16..44）連續 20 幀**不開火** | 1UP |
 * | 2 | 擊殺 | 打掉 **4 隻貼牆爬行砲（crawl）** | 全消彈 |
 * | 3 | 擊殺 | 打掉 **4 尊石像**（打嘴 = 打掉整隻，研究 §9-2 的「10 尊摩艾」致敬） | 1UP |
 * | 4 | 位置 | 減速區（欄 176..240）待在**畫面下緣帶**（y 150..184）連續 20 幀不開火 | 全消彈 |
 * | 5 | 擊殺 | 打掉 **3 根觸手（tent）** | 1UP |
 * | 6 | 擊殺 | 打掉 **5 座四方砲台（turret4）** | 全消彈 |
 * | 7 | 位置 | 魔王連戰開打前待在**畫面正中央**（x 96..160 / y 88..120）連續 20 幀不開火 | 1UP |
 *
 * 位置類一律要求「**不開火**」（`ship.fired` 20 幀沒有增加）＝ 原作「飛過去就拿到」的
 * 現代化版本：玩家必須刻意放手，不可能在亂按 A 的狀態下誤觸。
 * 一局之內每關**只能拿 1 次**（`found`）；第二輪（loop+1）由 main 的 newGame / startLoop 重設。
 */
(function () {
  'use strict';
  var CR = window.CR = window.CR || {};

  var HOLD_FRAMES = 20;
  var SCORE = 5000;                      // 隱藏獎勵一律附帶 5000 分（研究 §9-2 的 5000 分點）
  var MAX_LIVES = 9;                     // HUD 只有一位數

  // rect = 螢幕座標的允許區（船的碰撞框要整個在裡面）
  var DEFS = {
    1: { kind: 'hold', col0: 8, col1: 150, rect: { x: 12, y: 16, w: 140, h: 30 }, reward: '1up', label: 'TOP LANE' },
    2: { kind: 'kill', target: 'crawl', n: 4, reward: 'clear', label: 'CRAWLER HUNT' },
    3: { kind: 'kill', target: 'mouth', n: 4, reward: '1up', label: 'MOAI HUNT' },
    4: { kind: 'hold', col0: 176, col1: 240, rect: { x: 12, y: 148, w: 140, h: 38 }, reward: 'clear', label: 'LOW LANE' },
    5: { kind: 'kill', target: 'tent', n: 3, reward: '1up', label: 'TENTACLE HUNT' },
    6: { kind: 'kill', target: 'turret4', n: 5, reward: 'clear', label: 'QUAD GUN HUNT' },
    7: { kind: 'hold', col0: 2, col1: 60, rect: { x: 96, y: 86, w: 64, h: 36 }, reward: '1up', label: 'DEAD CENTER' }
  };

  var found = {}, kills = {}, holdT = 0, lastFired = 0, lastEvent = '', awards = 0, lastStage = 0;

  function def(n) { return DEFS[n | 0] || null; }
  function stage() { return CR.stage || null; }

  function sfx(name) { try { if (CR.Audio && CR.Audio.sfx) CR.Audio.sfx(name); } catch (e) { } }

  function inRect(ship, r) {
    var x = ship.x | 0, y = ship.y | 0, w = ship.w | 0, h = ship.h | 0;
    return x >= r.x && y >= r.y && (x + w) <= (r.x + r.w) && (y + h) <= (r.y + r.h);
  }

  // 實際發獎（1UP 給命、clear 清掉畫面上的雜魚）；分數交給 main 的 addScore
  function award(n, d) {
    found[n] = true; awards++;
    lastEvent = d.reward;
    var ship = CR.ship, st = stage();
    if (d.reward === '1up') {
      if (ship && ship.lives < MAX_LIVES) ship.lives++;
      sfx('extend');
    } else {
      if (st && typeof st.clearScreen === 'function') { try { st.clearScreen(); } catch (e) { } }
      sfx('capsule');
    }
    if (ship && typeof ship.addScore === 'function') ship.addScore(SCORE);
    return d.reward;
  }

  var B = {
    DEFS: DEFS, HOLD_FRAMES: HOLD_FRAMES, SCORE: SCORE,

    newGame: function () {
      found = {}; kills = {}; holdT = 0; awards = 0; lastEvent = ''; lastStage = 0;
      return B;
    },
    // 換關 / 復活：進度計數歸零（found 保留 ⇒ 一局每關只拿一次）
    reset: function (n) {
      kills = {}; holdT = 0; lastEvent = '';
      lastStage = n | 0;
      var s = CR.ship;
      lastFired = s ? (s.fired | 0) : 0;
      return B;
    },
    // main.js 的 hitEnemy 在敵人死亡時呼叫
    onKill: function (e) {
      if (!e || !e.kind) return;
      kills[e.kind] = (kills[e.kind] | 0) + 1;
    },

    // 每幀（只在 play 模式）；回傳 '' / '1up' / 'clear'
    update: function () {
      var st = stage(), ship = CR.ship;
      if (!st || !ship) return '';
      var n = st.index | 0, d = def(n);
      if (n !== lastStage) B.reset(n);
      if (!d || found[n]) { lastFired = ship.fired | 0; return ''; }
      if (ship.alive === false) { holdT = 0; lastFired = ship.fired | 0; return ''; }

      if (d.kind === 'kill') {
        if ((kills[d.target] | 0) >= d.n) return award(n, d);
        return '';
      }
      // 位置類：欄範圍 + 區塊內 + 20 幀沒有新的發射
      var col = st.camX >> 3;
      var okCol = (col >= d.col0 && col <= d.col1);
      // 「不開火」= 這 20 幀沒有新的發射 **而且畫面上沒有自機彈**。
      // 只看 `fired` 不夠：自動連射的間隔剛好是 20~23 幀（ship.js 的槽位凍結機制），
      // 一直按著 A 也會湊出 20 幀的空窗 ⇒ 機器人會「不小心」拿到隱藏獎勵（實測過）。
      var quiet = ((ship.fired | 0) === lastFired) &&
        (typeof ship.countAlive !== 'function' || ship.countAlive() === 0);
      lastFired = ship.fired | 0;
      if (okCol && quiet && inRect(ship, d.rect)) {
        holdT++;
        if (holdT >= HOLD_FRAMES) { holdT = 0; return award(n, d); }
      } else {
        holdT = 0;
      }
      return '';
    },

    progress: function () {
      var st = stage(), n = st ? (st.index | 0) : 0, d = def(n);
      if (!d) return { stage: n, kind: '', have: 0, need: 0 };
      if (d.kind === 'kill') return { stage: n, kind: 'kill', target: d.target, have: kills[d.target] | 0, need: d.n };
      return { stage: n, kind: 'hold', have: holdT, need: HOLD_FRAMES };
    },
    found: function (n) { return n === undefined ? found : !!found[n | 0]; },
    state: function () {
      var p = B.progress(), k = [], key;
      for (key in found) if (found.hasOwnProperty(key)) k.push(key | 0);
      k.sort(function (a, b) { return a - b; });
      return {
        awards: awards, last: lastEvent, found: k,
        kind: p.kind, have: p.have, need: p.need, target: p.target || '',
        label: (def(p.stage) || {}).label || '', reward: (def(p.stage) || {}).reward || ''
      };
    }
  };

  CR.Bonus = B;
})();
