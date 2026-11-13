/*
 * games/cart5/textdemo/main.js — CT.Text 示範頁（R9 C9-0；給第二批 adventure / escape / quiz agent 參考）
 * ---------------------------------------------------------------------------
 * 只在 `cart5.html?game=textdemo&debug=1`（或 ?game=textdemo）時註冊 ⇒ 正式選單不會出現。
 * 示範：對話框（框線 + 名牌 + 逐字 + ▼ 翻頁 + A 加速）→ 選項選單 → 捲動文字（↑↓、B 返回）/ 混排 / 2000 字長文。
 * 全部文字在 text_demo.js（CT.TextDemo.TEXT）；字形由 tools/cjk_glyphs.py 掃描產生。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  if (!CT.register || !CT.query || CT.query('game') !== 'textdemo') return;

  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var D = CT.TextDemo = CT.TextDemo || {};
  var X = function () { return D.TEXT; };

  // 2000 字以上的長文（原創段落重複接起來；測試也用這個）
  D.longText = function (min) {
    min = min || 2000;
    var src = X().long, s = '', i = 0;
    while (s.length < min) { s += src[i % src.length]; i++; }
    return s;
  };

  var G = { mode: 'boot', T: null, box: null, menu: null, scroll: null, pagesSeen: 0, longDone: false, visits: {}, botT: 0, botStep: 0 };

  function setup(nes) {
    var ppu = nes.ppu;
    var obj = {
      SP: ['........', '........', '........', '........', '........', '........', '........', '........'],
      STAR: ['........', '...1....', '...2....', '.12321..', '...2....', '...1....', '........', '........']
    };
    CT.Text.reserve(obj, 208);                       // 2 + 12 框線 + 208 池 = 222 磚
    var bank = NES.CHR.bank('textdemo_bg', obj);
    var spr = NES.CHR.bank('textdemo_spr', { SP: obj.SP });
    NES.CHR.setPattern(0, bank);
    NES.CHR.setPattern(1, spr);
    ppu.setPatternTables(0, 1);
    ppu.setBackdrop(0x0F);
    ppu.setBgPalette(0, [0x01, 0x21, 0x30]);    // 框暗藍 / 框亮藍 / 白字
    ppu.setBgPalette(1, [0x07, 0x27, 0x38]);    // 名牌 / 標題：棕框 / 橘框 / 淡黃字
    ppu.setBgPalette(2, [0x0B, 0x2B, 0x3B]);
    ppu.setBgPalette(3, [0x04, 0x24, 0x34]);
    for (var i = 0; i < 4; i++) ppu.setSprPalette(i, [0x16, 0x27, 0x30]);
    ppu.fillTiles(0, 0, 0, 32, 30, bank.index('SP'));
    ppu.fillAttr(0, 0, 0, 16, 15, 0);
    G.bank = bank;
    G.T = CT.Text.create(nes, { bank: bank });
    // 標題列（第 2~3 列，HUD 不貼 y=0）+ 星點
    G.T.print(2, 2, X().title);
    G.T.print(17, 2, X().hint);
    ppu.fillAttr(0, 0, 1, 16, 1, 1);
    var stars = [[1, 5], [29, 7], [6, 12], [26, 14], [3, 17]];
    for (i = 0; i < stars.length; i++) ppu.setTile(0, stars[i][0], stars[i][1], bank.index('STAR'));
    G.box = G.T.box({ x: 1, y: 20, w: 30, h: 8 });
    G.T.flush();                                     // init 在 CT.blank 裡 ⇒ 一次寫完
  }

  function say(text, next) {
    G.mode = 'talk';
    G.box.say(text, { name: X().speaker, onClose: next, onPage: function () { G.pagesSeen++; } });
  }
  function openMenu() {
    G.mode = 'menu';
    G.box.active = false;                            // 選單開著時 A 只給選單
    G.box.say(X().menuTitle, { name: X().speaker });
    G.menu = G.T.menu({ x: 9, y: 6, items: X().menu, cancel: false, onChoose: choose });
    G.menu.open();
  }
  function choose(k) {
    G.visits[k] = (G.visits[k] || 0) + 1;
    G.menu.close();
    G.T.remove(G.menu);
    G.menu = null;
    G.box.active = (k !== 1);
    if (k === 0) say(X().intro, openMenu);
    else if (k === 1) {
      G.mode = 'scroll';
      G.box.say(X().scrollHint, { name: X().speaker });
      // 第 6~13 列、3 行 × 11 字：最壞 132 磚 ≤ 池 208 − 標題 / 名牌 / 提示（約 76 磚）
      G.scroll = G.T.scroll({ x: 3, y: 6, w: 26, h: 8 });
      G.scroll.setText(X().log);
    } else if (k === 2) say(X().mixed, openMenu);
    else say(D.longText(2000) + '\f' + X().end, function () { G.longDone = true; openMenu(); });
  }

  var game = {
    id: 'textdemo', order: 99, title: '文字示範', legacy: [],
    init: function (nes) {
      G.mode = 'boot'; G.pagesSeen = 0; G.longDone = false; G.visits = {}; G.botT = 0; G.botStep = 0; G.menu = null; G.scroll = null;
      setup(nes);
      say(X().intro, openMenu);
    },
    update: function (nes) {
      if (G.mode === 'scroll' && G.scroll) {
        var I = nes.input || NES.Input;
        if (I && I.pressed && I.pressed(BTN.B)) {
          G.scroll.close(); G.T.remove(G.scroll); G.scroll = null;
          openMenu();
        }
      }
      G.T.update();
    },
    draw: function () { },
    state: function () {
      return {
        mode: G.mode, box: G.box && G.box.state(), menu: G.menu && G.menu.state(), scroll: G.scroll && G.scroll.state(),
        text: G.T && G.T.stats(), pagesSeen: G.pagesSeen, longDone: G.longDone, goal: G.longDone
      };
    },
    // 機器人：只看畫面上看得到的狀態（▼ 在閃 = 等翻頁；游標位置），反應延遲 ≥ 12 幀
    bot: function () {
      G.botT++;
      if (G.botT < 14) return null;
      var b = G.box && G.box.state();
      if (G.mode === 'menu' && G.menu && G.menu.state().phase === 'open') {
        var want = [1, 2, 3][Math.min(2, G.botStep)];
        if (G.menu.sel !== want) { G.botT = 0; return want > G.menu.sel ? BTN.DOWN : BTN.UP; }
        G.botT = 0; G.botStep++; return BTN.A;
      }
      if (G.mode === 'scroll' && G.scroll) {
        G.botT = 0;
        return G.scroll.state().atEnd ? BTN.B : BTN.DOWN;
      }
      if (b && (b.phase === 'wait' || b.phase === 'end')) { G.botT = 0; return BTN.A; }
      return null;
    },
    goal: function () { return G.longDone; },
    dev: G
  };
  CT.register(game);
})();
