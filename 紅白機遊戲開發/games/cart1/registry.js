/*
 * games/cart1/registry.js — 合輯卡帶共用的遊戲註冊表與工具（全域 `CT`；R5《星塵 8 合 1》起，R6 起各卡帶共用，靠 window.CART_ID 區分）
 * ---------------------------------------------------------------------------
 * 擁有者：總控（R5 開工骨架）。**只准 Edit 插入**，契約見 docs/R5_BRIEF.md §2。
 * 載入順序：engine/* → games/cart1/registry.js → 各遊戲檔（CT.register）→ shell.js（選單，可缺）→ boot.js
 *
 * 每款遊戲 = 一個與 window.GAME 同介面的物件，加上合輯要的幾個欄位：
 *   CT.register({
 *     id: 'maze', order: 1, title: '星塵迷宮', legacy: ['pacman.html'],
 *     init(nes, opt), update(nes), draw(nes), state(),   // 同 ENGINE_API §12
 *     exit(nes),          // 可省略：離開前停音樂 / 收拾自己的監聽
 *     cheat(),            // 一鍵密技（C 鍵 / ★ / nes-cheat 事件），回傳 true = 有生效
 *     bot(nes) → mask,    // ?bot=1 自動駕駛：回傳「下一幀」要按的鍵；null = 不按
 *     goal() → bool       // 機器人驗收條件已達成（例如過 3 關 / 分數 ≥ N）
 *   });
 *
 * 沒有 shell.js 時（R5 平行開發期間），boot 直接跑 `?game=<id>`（或第一款）。
 * shell.js 在場時由它接管：設 `CT.Shell = { init, update, draw, state }`，透過 CT.launch / CT.back 切換。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};

  CT.games = CT.games || [];
  CT.current = null;          // 目前執行中的遊戲物件（選單時 = null）
  // R6 起多卡帶共用本檔：入口頁在載入本檔前設 `window.CART_ID = 'cart2'`（缺省 = 'cart1'，行為與 R5 相同）
  CT.CART = String(window.CART_ID || 'cart1');
  CT.KEY = 'nes.' + CT.CART + '.';      // localStorage 前綴（cart1 = 'nes.cart1.'，舊存檔不變）

  CT.register = function (g) {
    if (!g || !g.id) throw new Error('CT.register: 缺 id');
    for (var i = 0; i < CT.games.length; i++) {
      if (CT.games[i].id === g.id) { CT.games[i] = g; sort(); return g; }
    }
    CT.games.push(g); sort();
    return g;
  };
  function sort() { CT.games.sort(function (a, b) { return (a.order || 99) - (b.order || 99); }); }
  CT.get = function (id) {
    for (var i = 0; i < CT.games.length; i++) if (CT.games[i].id === id) return CT.games[i];
    return null;
  };

  /* ---------------- 換遊戲時的 PPU / APU 歸零（= 關 rendering 重寫，不計 VBlank 預算） ---------------- */
  CT.blank = function (nes, fn) {
    var bud = nes && nes.timing && nes.timing.budget;
    var muted = bud ? bud.mute : false;
    if (bud) bud.mute = true;
    try { fn(); } finally { if (bud) bud.mute = muted; }
  };
  CT.resetHW = function (nes) {
    var ppu = nes.ppu;
    CT.blank(nes, function () {
      try { if (nes.music && nes.music.stop) nes.music.stop(); } catch (e) { }
      try { if (nes.music && nes.music.stopSfx) nes.music.stopSfx(); } catch (e) { }
      // R8 qa P2-7：遊戲可用 NES.Touch.setWays(4) 改成四方向十字鍵；換遊戲時一律回預設 8 方向
      try { if (NES.Touch && NES.Touch.setWays) NES.Touch.setWays(8); } catch (e) { }
      if (!ppu) return;
      if (ppu.split) ppu.split(null);
      if (ppu.scroll) ppu.scroll(0, 0);
      if (ppu.spriteMode) ppu.spriteMode(8);
      ppu.flicker = 'rotate'; ppu.flickerStep = 8;
      if (ppu.clearSprites) ppu.clearSprites();
      // 先切回垂直鏡像再清兩張表：前一款若是水平鏡像，先清後切會露出另一張表的殘影（shell 實測屬性表殘 240 格）
      if (ppu.mirroring) ppu.mirroring('v');
      if (ppu.fillTiles) { ppu.fillTiles(0, 0, 0, 32, 30, 0); ppu.fillTiles(1, 0, 0, 32, 30, 0); }
      if (ppu.fillAttr) { ppu.fillAttr(0, 0, 0, 16, 15, 0); ppu.fillAttr(1, 0, 0, 16, 15, 0); }
      if (ppu.setBackdrop) ppu.setBackdrop(0x0F);
    });
  };

  /* ---------------- 存檔（每款自己的 key；排行 / 最高分 / 解鎖） ---------------- */
  CT.load = function (id, key, dflt) {
    try {
      var s = window.localStorage.getItem(CT.KEY + id + '.' + key);
      return s == null ? dflt : JSON.parse(s);
    } catch (e) { return dflt; }
  };
  CT.save = function (id, key, val) {
    try { window.localStorage.setItem(CT.KEY + id + '.' + key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  };

  /* ---------------- 切換 ---------------- */
  var nes0 = null;
  CT.nes = function () { return nes0; };
  CT.launch = function (id, opt) {
    var g = CT.get(id);
    if (!g || !nes0) return false;
    if (CT.current && CT.current.exit) { try { CT.current.exit(nes0); } catch (e) { } }
    CT.resetHW(nes0);
    CT.current = g;
    CT.blank(nes0, function () { g.init(nes0, opt || {}); });
    return true;
  };
  // 回選單（shell 不在 = 重新開始同一款）
  CT.back = function () {
    if (!nes0) return;
    var g = CT.current;
    if (g && g.exit) { try { g.exit(nes0); } catch (e) { } }
    CT.current = null;
    CT.resetHW(nes0);
    if (CT.Shell) CT.blank(nes0, function () { CT.Shell.init(nes0, { from: g && g.id }); });
    else if (g) CT.launch(g.id);
  };

  /* ---------------- 共用熱鍵：START+SELECT 一起按住 60 幀 = 回選單（遊戲內不得佔用此組合） ---------------- */
  var BTN = (NES.Input && NES.Input.BTN) || { SELECT: 4, START: 8 };
  var backHold = 0;
  CT.BACK_FRAMES = 60;
  function checkBack() {
    var I = NES.Input;
    if (!I || !I.held || !CT.current) { backHold = 0; return false; }
    if (I.held(BTN.START) && I.held(BTN.SELECT)) {
      if (++backHold >= CT.BACK_FRAMES) { backHold = 0; CT.back(); return true; }
    } else backHold = 0;
    return false;
  }
  CT.backProgress = function () { return backHold / CT.BACK_FRAMES; };

  /* ---------------- 一鍵密技：C 鍵 / 觸控 ★ / nes-cheat 事件 → 目前遊戲的 cheat() ---------------- */
  CT.cheat = function () {
    var g = CT.current;
    return !!(g && g.cheat && g.cheat());
  };
  if (window.addEventListener) {
    window.addEventListener('nes-cheat', function () { CT.cheat(); }, false);
    window.addEventListener('keydown', function (e) {
      if (!e || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if ((e.code || '') !== 'KeyC') return;
      var ev = null;
      try { ev = new window.CustomEvent('nes-cheat', { detail: { source: 'key' } }); } catch (e2) { ev = null; }
      if (ev) window.dispatchEvent(ev); else CT.cheat();
    }, false);
  }

  /* ---------------- 自動駕駛 ?bot=1（tools/playthrough_cart.py 用） ---------------- */
  var q = null;
  try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  CT.query = function (k) { return q ? q.get(k) : null; };
  CT.botOn = CT.query('bot') === '1';
  function botTick() {
    var g = CT.current;
    if (!CT.botOn || !g || !g.bot || !NES.Input || !NES.Input.inject) return;
    var m = g.bot(nes0);
    if (m) NES.Input.inject(m & 255, 1);
  }

  /* ---------------- 給入口頁的 window.GAME：分派給 shell 或目前遊戲 ---------------- */
  window.GAME = {
    init: function (nes) {
      nes0 = nes;
      var want = CT.query('game');
      if (want && CT.get(want)) { CT.launch(want); return; }
      if (CT.Shell) { CT.current = null; CT.blank(nes, function () { CT.Shell.init(nes, {}); }); return; }
      if (CT.games.length) CT.launch(CT.games[0].id);
    },
    update: function (nes) {
      if (checkBack()) return;
      if (CT.current) { CT.current.update(nes); botTick(); }
      else if (CT.Shell) CT.Shell.update(nes);
    },
    draw: function (nes) {
      if (CT.current) CT.current.draw(nes);
      else if (CT.Shell) CT.Shell.draw(nes);
    },
    state: function () {
      var g = CT.current, s = null;
      if (g && g.state) s = g.state();
      else if (!g && CT.Shell && CT.Shell.state) s = CT.Shell.state();
      return {
        cart: CT.CART, game: g ? g.id : null, goal: !!(g && g.goal && g.goal()),
        games: CT.games.map(function (x) { return x.id; }), bot: CT.botOn, s: s
      };
    }
  };
})();
