/*
 * games/cart5/adventure/main.js — 《星塵冒險　消失的星燈》（合輯卡帶五，id = adventure，全域 CT.Adv）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-3 cart5-adventure（R9）｜ 依賴：engine/*、games/cart1/registry.js、games/cart5/text.js（CT.Text）、
 *   adventure/{text_story,art,song}.js。舊作 legacy text-adventure.html 只取「選擇 + 物品」玩法，故事 / 美術 / 音樂全部原創。
 *
 * 紅白機指令選單式文字冒險：
 *   上半 = 場景圖（144×112，程式化像素畫，每張圖換場景時在 CT.blank 裡寫進背景 bank 的 PIC 保留區 = CHR-RAM 式）+ 人物 / 道具精靈；
 *   右側 = 位置名 + 指令選單（T.menu：調查 / 移動 / 交談 / 拿取 / 使用 / 物品 / 系統，子選單也在同一欄）；
 *   下方 = 對話框（T.box：逐字、名牌、▼ 翻頁），選擇題的選項出現在右側選單。
 * 10 個地點、8 種物品、旗標、3 格存檔、依進度的提示、5 種結局（真 / 另一 / 一般 / 壞 ×2）。
 * §6：START 暫停（BGM pause）、HOLD START+SELECT 回選單（說明頁有寫）、C/★ 密技 = 立即提示；
 *     壞結局畫面按密技 = 回到上一個決策點（最後一次打開指令選單時的狀態）原地續玩；標題 / 說明無效；用過密技 goal false。
 * 網址：`cart5.html?game=adventure&debug=1[&bot=1][&lag=N]`
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var A = CT.Adv = CT.Adv || {};
  var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };

  var ID = 'adventure';
  var PIC_X = 2, PIC_Y = 2, TITLE_X = 8;
  var MENU = { x: 20, y: 4, w: 11, h: 16 };
  var BOX = { x: 1, y: 20, w: 30, h: 8 };
  var LOC = { x: 21, y: 2 };
  var POOL = 159, SLOTS = 3;
  var SPR_UI_PAL = [0x21, 0x28, 0x30];

  var nes0 = null, ppu0 = null, T = null, box = null, menu = null, scroll = null, bankBg = null, SB = null, Au = null;
  var g = null;

  /* ============================== 小工具 ============================== */
  function S() { return A.SCENES[g.scene]; }
  function U() { return A.UI; }
  function sfx(n) { Au.sfx(n); }
  function pressed(b) { return NES.Input.pressed(b); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function resolve(x) { return typeof x === 'function' ? (x(api()) || []) : (x || []); }
  function api() {
    return {
      f: g.f, scene: g.scene, visits: g.visits,
      has: function (id) { return g.items.indexOf(id) >= 0; }
    };
  }
  function visibleObjs() { return (S().objs || []).filter(function (o) { return !o.if || o.if(api()); }); }
  function visiblePeople() {
    var list = (S().people || []).filter(function (p) { return !p.if || p.if(api()); });
    if (g.f.follow && g.scene !== 'bridge' && A.KID_CHAT[g.scene]) {
      var scene = g.scene;
      list = list.concat([{ n: A.NAMES.KID, id: 'kid', companion: true, talk: function () { return A.KID_CHAT[scene]; } }]);
    }
    return list;
  }
  function progress() { return { scene: g.scene, items: g.items.slice(), f: clone(g.f), visits: clone(g.visits) }; }
  function restore(p) { g.scene = p.scene; g.items = p.items.slice(); g.f = clone(p.f); g.visits = clone(p.visits); }
  function variantOf(sceneId) {
    if ((sceneId === 'tower' || sceneId === 'top') && g.f.relit) return 'lit';
    if (sceneId === 'woods' && g.f.lit) return 'lit';
    return '';
  }

  /* ============================== 狀態 ============================== */
  function newState() {
    return {
      mode: 'title', sub: '', scene: 'room', items: [], f: {}, visits: {}, q: [], after: null,
      paused: false, t: 0, cheats: 0, runCheats: 0, goalHit: false, snap: null, ending: null, endT: 0,
      prompting: false, ask: null, hints: 0, lastMsg: '', picInfo: null, sprites: [], menuKind: '', loc: '',
      bot: { wait: 0, i: 0, part: 0, typeT: 0 }, autoKey: '', autoSaves: 0, retries: 0
    };
  }

  /* ============================== 畫面：bank / 場景圖 / 精靈 ============================== */
  function buildBanks(nes) {
    var blank = ['........', '........', '........', '........', '........', '........', '........', '........'];
    var obj = { SP: blank };
    for (var i = 0; i < A.Art.PIC_SLOTS; i++) obj['PIC' + i] = blank;
    CT.Text.reserve(obj, POOL);
    bankBg = NES.CHR.bank('adventure_bg', obj);
    SB = A.Art.sprBank();
    NES.CHR.setPattern(0, 'adventure_bg');
    NES.CHR.setPattern(1, 'adventure_spr');
    ppu0.setPatternTables(0, 1);
    ppu0.spriteMode(8);
    ppu0.flicker = 'none';
    T = CT.Text.create(nes, { bank: bankBg, nt: 0, fg: 3, bg: 0, shadow: 0, frame1: 1, frame2: 2 });
    box = T.box({ x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h, speed: 2 });
  }
  function drawPic(pic, x0, y0) {
    var base = bankBg.index('PIC0'), i;
    for (i = 0; i < pic.tiles.length; i++) {
      var t = bankBg.tiles[base + i], src = pic.tiles[i];
      for (var k = 0; k < 64; k++) t[k] = src[k];
    }
    for (var cy = 0; cy < pic.h; cy++) for (var cx = 0; cx < pic.w; cx++) ppu0.setTile(0, x0 + cx, y0 + cy, base + pic.map[cy * pic.w + cx]);
    var bw = pic.w >> 1, bh = pic.h >> 1;
    for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) ppu0.setAttr(0, (x0 >> 1) + bx, (y0 >> 1) + by, pic.attr[by * bw + bx]);
    ppu0.setBgPalette(0, A.Art.TEXT_PAL);
    for (i = 0; i < 3; i++) ppu0.setBgPalette(i + 1, pic.pals[i]);
  }
  // 整片重畫（關畫面）：清名稱表 / 屬性 → 場景圖 → 位置名
  function repaint(picId, variant, loc, x0) {
    var pic = A.Art.picture(picId, variant);
    g.picInfo = { id: picId, variant: variant || '', unique: pic.unique, merged: pic.merged, tiles: pic.tiles.length };
    CT.blank(nes0, function () {
      ppu0.setBackdrop(0x0F);
      ppu0.fillTiles(0, 0, 0, 32, 30, 0);
      ppu0.fillAttr(0, 0, 0, 16, 15, 0);
      T.reset();
      box.close({ erase: false });
      box.active = true;
      if (menu) { T.remove(menu); menu = null; }
      if (scroll) { T.remove(scroll); scroll = null; }
      drawPic(pic, x0 === undefined ? PIC_X : x0, PIC_Y);
      g.loc = loc || '';
      if (loc) T.print(LOC.x, LOC.y, loc);
      T.flush();
    });
    g.prompting = false;
  }
  function paintScene() { repaint(S().pic, variantOf(g.scene), S().name); setSprites(); }

  // 場景精靈：[{k, x, y, behind}]（x / y = 場景圖內 px）
  function sceneSprites() {
    var f = g.f, L = [], sc = g.scene;
    if (sc === 'room') { if (!f.lampTaken) L.push({ k: 'lamp', x: 100, y: 64 }); if (!f.letterTaken) L.push({ k: 'bag', x: 116, y: 65 }); }
    if (sc === 'plaza') { L.push({ k: 'cat', x: 24, y: 84 }); if (!f.gotGear) L.push({ k: 'glint', x: 92, y: 90, blink: true }); }
    if (sc === 'dock') L.push({ k: 'ou', x: 22, y: 58 });
    if (sc === 'tower') L.push({ k: 'xia', x: 58, y: 74 });
    if (sc === 'top' && !f.lit && !f.relit) { L.push({ k: 'glint', x: 64, y: 62, blink: true }); }
    if (sc === 'clock') { L.push({ k: 'gear', x: 64, y: 57 }); if (!f.fixed) L.push({ k: 'mbox', x: 32, y: 72 }); }
    if (sc === 'obs') L.push({ k: 'lila', x: 116, y: 72 });
    if (sc === 'woods' && f.lit) { L.push({ k: 'glint', x: 70, y: 70, blink: true }); }
    if (sc === 'deep') {
      if (!f.calm && !f.grab) L.push({ k: 'glow', x: 106, y: 62, blink: true });
      else if (f.calm && !f.follow && !f.grab) L.push({ k: 'kid', x: 114, y: 58, anim: true });
    }
    if (sc === 'bridge') L.push({ k: 'kid', x: 58, y: 34, anim: true });
    if (f.follow && sc !== 'bridge') L.push({ k: 'kid', x: 124, y: 84, anim: true });
    if (g.items.indexOf('lamp') >= 0 && f.lit && sc !== 'bridge') L.push({ k: 'lampLit', x: 4, y: 100 });
    return L;
  }
  var UI_SPR = { glint: 1, dot: 1, star: 1, core: 1 };
  function setSprites(list) {
    list = list || sceneSprites();
    var slots = [], out = [];
    list.forEach(function (s) {
      var def = A.Art.SPR[s.k], pal;
      if (UI_SPR[s.k]) pal = 3;
      else {
        var key = def.pal.join(',');
        pal = slots.indexOf(key);
        if (pal < 0) { if (slots.length < 3) { slots.push(key); pal = slots.length - 1; } else pal = 2; }
      }
      out.push({ k: s.k, x: s.x, y: s.y, pal: pal, behind: !!s.behind, blink: !!s.blink, anim: !!s.anim });
    });
    g.sprites = out;
    CT.blank(nes0, function () {
      for (var i = 0; i < 3; i++) {
        ppu0.setSprPalette(i, slots[i] ? slots[i].split(',').map(Number) : SPR_UI_PAL);
      }
      ppu0.setSprPalette(3, SPR_UI_PAL);
    });
  }
  function drawSprites() {
    ppu0.clearSprites();
    if (!g || !SB) return;
    var n = 0, ox = (g.mode === 'title' ? TITLE_X : PIC_X) * 8, oy = PIC_Y * 8;
    for (var i = 0; i < g.sprites.length; i++) {
      var s = g.sprites[i];
      if (s.blink && ((g.t >> 4) & 3) === 3) continue;
      var k = s.k;
      if (s.anim && k === 'kid' && ((g.t >> 4) & 1)) k = 'kid2';
      var parts = SB.parts[k] || [];
      for (var j = 0; j < parts.length && n < 60; j++) {
        var q = parts[j];
        ppu0.sprite(n++, { x: ox + s.x + q.dx, y: oy + s.y + q.dy + ((s.anim && ((g.t >> 5) & 1)) ? -1 : 0), tile: q.tile, pal: s.pal, behind: s.behind });
      }
    }
  }

  /* ============================== 選單 ============================== */
  function closeMenu() {
    if (!menu) return;
    menu.close(); T.remove(menu); menu = null; g.menuKind = '';
  }
  function openMenu(kind, items, onChoose, opt) {
    opt = opt || {};
    closeMenu();
    g.menuKind = kind;
    var m = T.menu({ x: opt.x === undefined ? MENU.x : opt.x, y: opt.y === undefined ? MENU.y : opt.y, w: opt.w || MENU.w, h: opt.h || MENU.h,
      items: items, cancel: opt.cancel !== false, sel: opt.sel | 0,
      onMove: function (k) { sfx('adv_move'); if (opt.onMove) opt.onMove(k); },
      onChoose: function (k) {
        if (k < 0) { sfx('adv_cancel'); closeMenu(); if (opt.onCancel) opt.onCancel(); return; }
        sfx('adv_ok'); closeMenu(); onChoose(k);
      } });
    m.open();
    menu = m;
    return m;
  }

  /* ============================== 劇本直譯器 ============================== */
  function run(steps, after) {
    closeMenu();
    g.sub = 'script'; g.prompting = false;
    g.q = resolve(steps).slice();
    g.after = after || null;
    next();
  }
  function say(text, name) {
    box.active = true;
    g.lastMsg = text;
    box.say(text, { name: name || null, onClose: next });
  }
  function next() {
    while (g.q.length) {
      var s = g.q.shift();
      if (typeof s === 'function') { g.q = resolve(s).concat(g.q); continue; }
      if (typeof s === 'string') { say(s, null); return; }
      if (Array.isArray(s)) { say(s[1], s[0]); return; }
      if (!s) continue;
      if (s.give) {
        if (g.items.indexOf(s.give) < 0) g.items.push(s.give);
        sfx('adv_item');
        say(U().gotItem(A.ITEMS[s.give].name), null);
        setSprites();
        return;
      }
      if (s.take) { var k = g.items.indexOf(s.take); if (k >= 0) g.items.splice(k, 1); setSprites(); continue; }
      if (s.set) { g.f[s.set] = true; setSprites(); continue; }
      if (s.clr) { delete g.f[s.clr]; continue; }
      if (s.sfx) { sfx(s.sfx); continue; }
      if (s.bgm) { Au.play(s.bgm); continue; }
      if (s.pic) { paintScene(); continue; }
      if (s.ask) { g.sub = 'askwait'; g.ask = s; say(s.ask, s.name); return; }
      if (s.go) { goScene(s.go); continue; }
      if (s.end) { g.q = []; g.after = null; startEnding(s.end); return; }
      if (s.fn) { var r = s.fn(api()); if (r) g.q = resolve(r).concat(g.q); continue; }
    }
    var a = g.after; g.after = null;
    if (a) a(); else toCmd();
  }
  function goScene(id) {
    g.scene = id;
    var first = !g.visits[id];
    g.visits[id] = (g.visits[id] || 0) + 1;
    paintScene();
    sfx('adv_door');
    if (!(g.ending) && S().bgm && !(g.scene === 'top' && g.f.relit)) Au.play(S().bgm);
    if (first && S().enter) g.q = resolve(S().enter).concat(g.q);
  }
  function openAsk() {
    var s = g.ask;
    g.sub = 'ask';
    openMenu('ask', s.opts, function (k) {
      g.sub = 'script'; g.ask = null;
      g.q = resolve(s.then[k] || []).concat(g.q);
      next();
    }, { cancel: false });
  }

  /* ============================== 指令 ============================== */
  function promptBox() {
    box.active = false;
    g.prompting = true;
    box.say(U().prompt, { name: null, speed: 1 });
  }
  function toCmd(sel) {
    g.sub = 'cmd';
    g.snap = progress();
    autoSave(g.snap);
    promptBox();
    openMenu('cmd', U().cmds, doCmd, { cancel: false, sel: sel === undefined ? g.lastCmd | 0 : sel });
  }
  function sub(kind, items, fn, cmdIdx) {
    g.sub = 'sub';
    openMenu(kind, items, fn, { onCancel: function () { toCmd(cmdIdx); } });
  }
  function doCmd(k) {
    g.lastCmd = k;
    var sc = S(), G = api();
    if (k === 0) {                     // 調查
      var objs = visibleObjs();
      sub('look', [U().around].concat(objs.map(function (o) { return o.n; })), function (i) {
        if (i === 0) run(sc.look); else run(objs[i - 1].look || [U().noUse]);
      }, k);
    } else if (k === 1) {              // 移動
      var ex = sc.exits;
      sub('move', ex.map(function (e) { return A.SCENES[e.to].label; }), function (i) {
        var e = ex[i], block = e.need ? e.need(G) : null;
        if (block) run(block); else run([{ go: e.to }]);
      }, k);
    } else if (k === 2) {              // 交談
      var ppl = visiblePeople();
      if (!ppl.length) { run([U().noTalk]); return; }
      if (ppl.length === 1) { run(ppl[0].talk); return; }
      sub('talk', ppl.map(function (p) { return p.n; }), function (i) { run(ppl[i].talk); }, k);
    } else if (k === 3) {              // 拿取
      var tk = visibleObjs().concat(visiblePeople());
      sub('take', tk.map(function (o) { return o.n; }), function (i) {
        var o = tk[i];
        if (o.take) run(o.take);
        else if (o.talk) run(['不能把人帶走啦。']);
        else run([U().noTake[g.t % U().noTake.length]]);
      }, k);
    } else if (k === 4 || k === 5) {   // 使用 / 物品
      if (!g.items.length) { run([U().noItem]); return; }
      var its = g.items.slice();
      sub(k === 4 ? 'use' : 'item', its.map(function (id) { return A.ITEMS[id].name; }), function (i) {
        var id = its[i], it = A.ITEMS[id];
        if (k === 5) { run([typeof it.desc === 'function' ? it.desc(G) : it.desc]); return; }
        var r = sc.use ? sc.use(G, id) : null;
        if (r) run(r);
        else run([typeof it.nouse === 'function' ? it.nouse(G) : (it.nouse || U().noUse)]);
      }, k);
    } else {                           // 系統
      sub('sys', U().sys, function (i) {
        if (i === 0) showHint();
        else if (i === 1) slotMenu(true);
        else {
          g.sub = 'askwait';
          g.ask = { ask: U().toTitle, opts: U().yesNo, then: [[{ fn: function () { toTitle(); return null; } }], []] };
          g.q = []; g.after = null;
          say(U().toTitle, null);
        }
      }, k);
    }
  }
  function hintText() {
    var G = api();
    for (var i = 0; i < A.HINTS.length; i++) if (!A.HINTS[i].done(G)) return A.HINTS[i].text;
    return A.HINTS[A.HINTS.length - 1].text;
  }
  function showHint() {
    g.hints++;
    sfx('adv_hint');
    run([[A.HINT_HEAD, hintText()]]);
  }
  // 自動存檔（fix-r9-text，qa-r9 P3-2）：回到指令選單時（= 穩定的決策點），只要「地點 / 物品 / 旗標」跟上次自動存的不同
  // （進了新地點、拿到東西、劇情推進）就存到 auto 格；標題「繼續遊戲」→「自動」讀取。結局 / 選擇題中途不存。
  function progressKey(p) { return p.scene + '|' + p.items.join(',') + '|' + Object.keys(p.f).filter(function (k) { return p.f[k]; }).sort().join(','); }
  function autoSave(p) {
    if (g.mode !== 'play' || g.ending) return false;
    var key = progressKey(p);
    if (key === g.autoKey) return false;
    g.autoKey = key; g.autoSaves++;
    CT.save(ID, 'auto', p);
    return true;
  }
  function slotKey(k) { return k === 0 ? 'auto' : 'slot' + k; }     // 讀檔選單：0 = 自動、1~3 = 手動格
  function slotLabel(n) {
    var d = CT.load(ID, 'slot' + n, null);
    return d && A.SCENES[d.scene] ? '第' + n + '格：' + A.SCENES[d.scene].name : '第' + n + '格：' + U().slotEmpty;
  }
  function slotMenu(saving) {
    g.sub = 'sub';
    var items = [], n;
    for (n = 1; n <= SLOTS; n++) items.push('第' + n + '格');
    var info = function (k) {
      box.say(slotLabel(k + 1), { name: null, speed: 1 });
      box.active = false; g.prompting = true;
    };
    openMenu('slot', items, function (k) {
      if (saving) {
        CT.save(ID, 'slot' + (k + 1), g.snap || progress());
        sfx('adv_save');
        run([U().saved(k + 1)]);
      }
    }, { onCancel: function () { toCmd(6); }, onMove: info });
    info(0);
  }

  /* ============================== 結局 ============================== */
  function endingDef(id) { return A.ENDINGS.filter(function (e) { return e.id === id; })[0]; }
  function startEnding(id) {
    var e = endingDef(id);
    closeMenu();
    g.ending = e; g.mode = 'ending'; g.sub = 'script'; g.endT = 0;
    var mask = CT.load(ID, 'endings', 0) | (1 << (e.no - 1));
    CT.save(ID, 'endings', mask);
    repaint(e.pic, e.variant, U().endHead);
    var spr = [];
    if (e.id === 'travel') spr.push({ k: 'kid', x: 74, y: 26, anim: true });
    if (e.id === 'true') spr.push({ k: 'star', x: 100, y: 22, blink: true });
    setSprites(spr);
    Au.stop(); Au.play(e.bgm);
    run(e.steps, function () {
      if (e.id === 'true' && g.runCheats === 0) g.goalHit = true;
      g.mode = 'card'; g.sub = 'card';
      // 壞結局：A = 回到剛才的選擇（不算密技、goal 照算）、B = 回標題；其他結局 A = 片尾 / 標題
      var retry = e.kind === 'bad' && g.snap;
      var tail = retry ? U().retryTail : U().theEnd;
      say(U().endHead + ' ' + e.no + '／' + A.ENDINGS.length + '\n' + e.name + '\n' + tail, U().endHead);
      g.q = []; g.after = function () { if (e.id === 'true') startCredits(); else if (retry) backToChoice(false); else toTitle(); };
    });
  }
  function startCredits() {
    g.mode = 'credits'; g.sub = 'credits'; g.endT = 0;
    box.close({ erase: true });
    scroll = T.scroll({ x: 4, y: 20, w: 24, h: 8, auto: 22, input: false });
    scroll.setText(A.CREDITS);
  }

  /* ============================== 標題 / 說明 / 結局一覽 ============================== */
  function endingsMask() { return CT.load(ID, 'endings', 0) | 0; }
  function endingsCount() { var m = endingsMask(), n = 0; for (var i = 0; i < 8; i++) if (m & (1 << i)) n++; return n; }
  function toTitle() {
    g.mode = 'title'; g.sub = 'title'; g.paused = false; g.ending = null; g.q = []; g.after = null;
    repaint('title', '', '', TITLE_X);
    setSprites([{ k: 'star', x: 96, y: 54 }]);
    T.print(9, 16, U().subtitle);
    T.print(22, 21, U().endHead);
    T.print(22, 23, endingsCount() + '/' + A.ENDINGS.length);
    Au.stop(); Au.play('adv_title');
    titleMenu();
  }
  function titleMenu(sel) {
    openMenu('title', U().titleMenu, function (k) {
      if (k === 0) newGame();
      else if (k === 1) loadMenu();
      else if (k === 2) showEndings();
      else showHelp();
    }, { x: 7, y: 18, w: 13, h: 10, cancel: false, sel: sel | 0 });
  }
  function loadMenu() {
    var items = [U().autoSlot], n;
    for (n = 1; n <= SLOTS; n++) items.push('第' + n + '格');
    var info = function (k) { T.clear(22, 25, 10, 2); var d = CT.load(ID, slotKey(k), null); T.print(22, 25, d && A.SCENES[d.scene] ? A.SCENES[d.scene].label : U().slotEmpty); };
    T.clear(22, 21, 10, 4);
    openMenu('load', items, function (k) {
      var d = CT.load(ID, slotKey(k), null);
      if (!d || !A.SCENES[d.scene]) { sfx('adv_bad'); toTitle(); return; }
      startPlay(d, [k === 0 ? U().autoLoaded : U().loaded]);
    }, { x: 7, y: 18, w: 13, h: 10, onMove: info, onCancel: function () { toTitle(); } });
    info(0);
  }
  function blankPage() {
    CT.blank(nes0, function () {
      ppu0.fillTiles(0, 0, 0, 32, 30, 0); ppu0.fillAttr(0, 0, 0, 16, 15, 0);
      T.reset(); box.close({ erase: false });
      if (menu) { T.remove(menu); menu = null; }
    });
    setSprites([]);
  }
  // 說明頁分 2 頁（字形池 159 磚 ≈ 一頁 36 個不同全形字）：A = 下一頁 / 最後一頁回標題，B = 回標題
  function showHelp(pg) {
    g.mode = 'help'; g.sub = 'help'; g.helpPage = pg | 0;
    blankPage();
    var row = 3;
    U().help[g.helpPage].forEach(function (para) {
      para.forEach(function (line) { T.print(4, row, line); row += 2; });
      row += 1;
    });
  }
  function showEndings() {
    g.mode = 'endings'; g.sub = 'endings';
    blankPage();
    var m = endingsMask();
    T.print(4, 3, U().endingsTitle);
    A.ENDINGS.forEach(function (e, i) { T.print(4, 7 + i * 3, e.no + '  ' + ((m & (1 << i)) ? e.name : U().unknown)); });
    T.print(4, 24, U().back);
  }

  /* ============================== 開始遊玩 ============================== */
  function startPlay(prog, intro) {
    g.mode = 'play'; g.ending = null; g.runCheats = 0; g.hints = 0; g.snap = null;
    restore(prog); g.autoKey = progressKey(prog);
    paintScene();
    Au.stop(); Au.play(S().bgm && !(g.scene === 'top' && g.f.relit) ? S().bgm : 'adv_title');
    run(intro || []);
  }
  function newGame() {
    g.mode = 'play'; g.ending = null; g.runCheats = 0; g.hints = 0; g.snap = null; g.autoKey = '';
    restore({ scene: 'room', items: [], f: {}, visits: { room: 1 } });
    paintScene();
    Au.stop();
    run(A.PROLOGUE);
  }

  /* ============================== 暫停 ============================== */
  function setPause(on) {
    if (g.paused === on) return;
    g.paused = on;
    if (on) Au.pause(); else if (!Au.resume() && Au.current) Au.play(Au.current);
    T.clear(LOC.x, LOC.y, 10, 2);
    T.print(LOC.x, LOC.y, on ? U().paused : g.loc);
    sfx('adv_ok');
  }

  /* ============================== 每幀 ============================== */
  function update() {
    g.t++;
    if ((g.mode === 'play' || g.mode === 'ending' || g.mode === 'card') && pressed(BTN.START) && !NES.Input.held(BTN.SELECT)) setPause(!g.paused);
    if (g.paused) { T.pump(); return; }
    // 壞結局卡片寫完（■）：B = 回標題（A 由對話框收掉 → g.after 回到選擇前）
    if (g.mode === 'card' && g.ending && g.ending.kind === 'bad' && box.phase === 'end' && pressed(BTN.B)) { sfx('adv_cancel'); toTitle(); return; }
    if (g.mode === 'help' && pressed(BTN.A) && g.helpPage + 1 < U().help.length) { sfx('adv_ok'); showHelp(g.helpPage + 1); return; }
    if (g.mode === 'help' || g.mode === 'endings') {
      if (pressed(BTN.B) || pressed(BTN.A)) { sfx('adv_cancel'); toTitle(); return; }
    }
    if (g.mode === 'credits') {
      g.endT++;
      if (scroll && scroll.state().atEnd && T.pending() === 0) { if (++g.creditsWait > 120 || pressed(BTN.A)) { toTitle(); return; } }
      else g.creditsWait = 0;
      if (pressed(BTN.A) && g.endT > 30) { toTitle(); return; }
    }
    // 提示文字 / 選擇題的問句寫完：不出 ■（狀態直接收掉），選擇題接著開選單
    if (g.prompting && box.phase === 'end') { box.phase = 'closed'; g.prompting = false; }
    if (g.sub === 'askwait' && box.phase === 'end') { box.phase = 'closed'; openAsk(); }
    T.update();
  }

  // 回到最後一個決策點（最後一次打開指令選單時的狀態）。壞結局卡片按 A = 正常功能（不算密技）；結局中途按密技也走這裡（算密技）
  function backToChoice(byCheat) {
    var snap = g.snap;
    g.mode = 'play'; g.ending = null; g.q = []; g.after = null;
    restore(snap);
    paintScene();
    Au.stop(); Au.play(S().bgm);
    sfx(byCheat ? 'adv_hint' : 'adv_ok');
    g.retries++;
    toCmd();
  }

  /* ============================== 密技 ============================== */
  function cheat() {
    if (!g) return false;
    if ((g.mode === 'card' || g.mode === 'ending') && g.ending && g.ending.kind === 'bad' && g.snap) {
      g.cheats++; g.runCheats++;
      backToChoice(true);
      return true;
    }
    if (g.mode !== 'play') return false;
    if (g.sub !== 'cmd' && g.sub !== 'sub') return false;
    g.cheats++; g.runCheats++;
    if (g.paused) setPause(false);
    showHint();
    return true;
  }

  /* ============================== 機器人（只看畫面：選單文字 / 游標 / ▼■） ============================== */
  // 最短真結局路線：[指令, 對象]（對象 null = 沒有子選單）
  var ROUTE = [
    ['拿取', '提燈'], ['拿取', '郵差包'], ['移動', '廣場'],
    ['調查', '噴水池'], ['拿取', '閃光'], ['移動', '燈塔'],
    ['使用', '信'], ['使用', '鑰匙'], ['移動', '燈室'], ['使用', '提燈'],
    ['移動', '燈塔'], ['移動', '廣場'], ['移動', '鐘錶店'], ['使用', '小齒輪'],
    ['移動', '廣場'], ['移動', '天文台'], ['交談', null],
    ['移動', '廣場'], ['移動', '森林'], ['移動', '林地'], ['使用', '音樂盒'], ['交談', null],
    ['移動', '森林'], ['移動', '廣場'], ['移動', '燈塔'], ['移動', '燈室'], ['使用', '星核'],
    ['移動', '星橋'], ['交談', null]
  ];
  var BOT_PREF = ['幫忙', '送它走', '起床', '不用', '算了', '否'];
  A.ROUTE = ROUTE;
  function botLag() { var q = parseInt((CT.query && CT.query('lag')) || '', 10); return isFinite(q) && q >= 0 ? q : 14; }
  function botMenuTo(label) {
    var st = menu.state(), idx = st.items.indexOf(label);
    if (idx < 0) return -1;
    if (st.sel !== idx) return idx > st.sel ? BTN.DOWN : BTN.UP;
    return BTN.A;
  }
  function bot() {
    var b = g.bot;
    if (b.wait > 0) { b.wait--; return 0; }
    var m = botDecide();
    if (m) b.wait = Math.max(1, (m === BTN.A) ? botLag() : 8);   // 至少放開 1 幀（按下邊緣）
    return m;
  }
  function botDecide() {
    var b = g.bot;
    if (g.paused) return BTN.START;
    if (g.mode === 'card' || g.mode === 'credits') return 0;
    var mo = menu && menu.state().phase === 'open';
    if (g.mode === 'title') return mo ? botMenuTo(U().titleMenu[0]) : 0;
    if (g.mode === 'help' || g.mode === 'endings') return BTN.B;
    if (mo && g.menuKind === 'ask') {
      var items = menu.state().items, want = null;
      for (var i = 0; i < BOT_PREF.length && !want; i++) if (items.indexOf(BOT_PREF[i]) >= 0) want = BOT_PREF[i];
      return botMenuTo(want || items[items.length - 1]);
    }
    if (mo && g.menuKind === 'cmd') {
      if (b.part === 1) { b.i++; b.part = 0; }        // 上一步沒出子選單（直接交談）
      var step = ROUTE[b.i];
      if (!step) return 0;
      var r = botMenuTo(step[0]);
      if (r === BTN.A) b.part = step[1] ? 1 : 2;
      if (r === BTN.A && !step[1]) { b.i++; b.part = 0; }
      return r < 0 ? 0 : r;
    }
    if (mo && g.menuKind !== 'cmd') {
      var st2 = ROUTE[b.i];
      if (!st2 || !st2[1]) return BTN.B;
      var r2 = botMenuTo(st2[1]);
      if (r2 < 0) return BTN.B;                          // 不在清單（例如尚未出現）⇒ 退回
      if (r2 === BTN.A) { b.i++; b.part = 0; }
      return r2;
    }
    // 對話框：打字中 → 讀一下再按 A 加速；▼ / ■ → 按 A
    var ph = box.phase;
    if (g.prompting) return 0;
    if (ph === 'type' || ph === 'clear') { b.typeT++; if (b.typeT > 20) { b.typeT = 0; return BTN.A; } return 0; }
    b.typeT = 0;
    if (ph === 'wait' || ph === 'end') return BTN.A;
    return 0;
  }

  /* ============================== 註冊 ============================== */
  var GAME = {
    id: ID, order: 1, title: '星塵冒險', legacy: ['text-adventure.html'],
    init: function (nes) {
      nes0 = nes; ppu0 = nes.ppu; Au = A.Audio;
      g = newState();
      buildBanks(nes);
      Au.init(nes);
      toTitle();
    },
    update: function (nes) { update(); Au.tick(); },
    draw: function (nes) { drawSprites(); },
    exit: function (nes) { if (Au) Au.stop(); },
    get backTile() { var sb = A.Art.sprBank(); return { tile: sb.parts.dot[0].tile, pal: 3 }; },
    state: function () {
      if (!g) return null;
      return {
        mode: g.mode, sub: g.sub, scene: g.scene, items: g.items.slice(), flags: Object.keys(g.f).filter(function (k) { return g.f[k]; }),
        paused: g.paused, t: g.t, cheats: g.cheats, runCheats: g.runCheats, hints: g.hints,
        menu: menu ? menu.state() : null, menuKind: g.menuKind, box: box ? box.state() : null, boxPhase: box ? box.phase : null,
        prompting: g.prompting, ending: g.ending ? g.ending.id : null, endings: endingsMask(), goal: GAME.goal(),
        loc: g.loc, pic: g.picInfo, sprites: g.sprites.map(function (s) { return s.k; }), music: Au && Au.current, lastSfx: Au && Au.lastSfx,
        text: T ? T.stats() : null, lastMsg: g.lastMsg, autoSaves: g.autoSaves, retries: g.retries, hasAuto: !!CT.load(ID, 'auto', null), bot: { i: g.bot.i, part: g.bot.part, of: ROUTE.length }
      };
    },
    cheat: cheat,
    bot: function () { return g ? bot() : 0; },
    goal: function () { return !!(g && g.goalHit); },
    // 選單：收集到的結局數（6 字元，例如 `ED 2/5`）
    bestText: function () { return 'ED ' + endingsCount() + '/' + A.ENDINGS.length; }
  };

  A.dev = {
    g: function () { return g; },
    T: function () { return T; },
    box: function () { return box; },
    menu: function () { return menu; },
    newGame: function () { newGame(); },
    toTitle: function () { toTitle(); },
    goto: function (id) { g.mode = 'play'; run([{ go: id }]); },
    give: function (id) { if (g.items.indexOf(id) < 0) g.items.push(id); },
    set: function (k) { g.f[k] = true; },
    hint: hintText,
    toCmd: function () { toCmd(); },
    load: function (p) { startPlay(p, []); },
    progress: progress,
    ending: function (id) { startEnding(id); },
    cheat: cheat,
    ROUTE: ROUTE
  };

  if (CT.register) CT.register(GAME);
  A.GAME = GAME;
})();
