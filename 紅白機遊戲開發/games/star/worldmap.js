/*
 * games/star/worldmap.js — 《星塵勇者》SMB3 式世界地圖（R4 star-meta）
 * ---------------------------------------------------------------------------
 * 擁有者：star-meta agent
 * 依賴：games/star/levels_w1.js（ST.LEVELS / ST.Levels.ids）、chr_hero.js（ST.textTiles / ST.bgBank）
 *       hero.js（ST.Hero.draw：地圖上的玩家棋子直接用主角精靈，**不多花一個精靈磚**）
 *       password.js（通關位元 ↔ 關卡 id）、subweapon.js（道具屋賣副武器）
 * 契約：docs/TASKS.md「R4 star-meta」、研究 `03_經典遊戲深度解析/02_超級瑪利歐兄弟3.md`
 *       §世界地圖（節點式路徑、分岔、鎖住的節點、蘑菇屋 / 道具屋、地圖上做決策）
 *
 *   ① 一個世界一張 **8 × 5 格**節點圖（格 = 4×4 磚 = 32×32 px，正好對齊 16×16 屬性區塊）
 *   ② 節點照「蛇行」排（slot 0..7）：關卡依 stage 排前面，接著是道具屋，再接支線 / 隱藏節點
 *   ③ 節點來源 = `ST.LEVELS`（F4-1 / F4-2 用 `ST.Levels.register` 註冊 W3 / W4 ⇒ **節點自動出現**，
 *      本檔一行都不必改；stage ≥ 5 的 id（如 '3-5'）自動變成「支線節點」，要全關通關才解鎖）
 *   ④ 走格子動畫：相鄰節點之間沿路徑走 2 px/幀，主角精靈播走路幀
 *   ⑤ 已通關打勾（✓ 節點）／鎖住的節點用灰色調色盤（屬性區塊換 pal 2，不多花磚）
 *   ⑥ 道具屋節點：用金幣買副武器 / 補彈 / 無限彈藥（= 任務書「彈藥 / 無限自選」）
 *
 *   調色盤（同屏 13 色，遠低於 25 色上限）
 *     底色 0x0F 黑／pal0 文字（白）／pal1 地形（綠 / 深綠 / 沙）／pal2 鎖住（灰）／pal3 節點（紅 / 沙 / 白）
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};

  /* ===================================================================== CHR
   * 原創 8×8 背景磚（`M_` 前綴）。背景 bank 在 R3 之後只用了 141 / 256 磚，
   * 這 23 磚由 main.js 合併（ST.BG_MAP），不動 chr_hero / chr_world / chr_w2。
   * 文字格式見 engine/chr.js：'.' = 底色、'1' '2' '3' = 該組調色盤的三色。
   */
  var BG = {};

  // ---- 地形 / 路徑 -------------------------------------------------------
  BG.M_GRASS = ['11111111', '11111111', '11111121', '11111111', '11111111', '11211111', '11111111', '11111111'];
  BG.M_TREE = ['11122111', '11222211', '12222221', '12222221', '11222211', '11132111', '11132111', '11111111'];
  BG.M_MTN = ['11122111', '11222211', '12233221', '12222221', '12222221', '22222222', '22222222', '11111111'];
  BG.M_DIRT = ['22222222', '22222222', '22222222', '22222222', '22222222', '22222222', '22222222', '22222222'];
  BG.M_PATH_H = ['11111111', '11111111', '33333333', '33333333', '33333333', '11111111', '11111111', '11111111'];
  BG.M_PATH_V = ['11333311', '11333311', '11333311', '11333311', '11333311', '11333311', '11333311', '11333311'];
  BG.M_PATH_X = ['11333311', '11333311', '33333333', '33333333', '33333333', '11333311', '11333311', '11333311'];

  // ---- 16×16 節點（切成 4 磚 TL / TR / BL / BR）----------------------------
  function quad(name, rows) {
    var i, t = { TL: [], TR: [], BL: [], BR: [] };
    if (rows.length !== 16) throw new Error('worldmap: ' + name + ' 需要 16 列');
    for (i = 0; i < 16; i++) {
      if (rows[i].length !== 16) throw new Error('worldmap: ' + name + ' 第 ' + i + ' 列長度要 16');
      (i < 8 ? t.TL : t.BL).push(rows[i].slice(0, 8));
      (i < 8 ? t.TR : t.BR).push(rows[i].slice(8, 16));
    }
    BG[name + '_TL'] = t.TL; BG[name + '_TR'] = t.TR;
    BG[name + '_BL'] = t.BL; BG[name + '_BR'] = t.BR;
  }

  // 一般節點（白框圓盤 + 實心）；鎖住時只換屬性 → 同一組磚自動變灰
  quad('M_NODE', [
    '2222222222222222',
    '2222233333322222',
    '2223333333333222',
    '2233311111133222',
    '2333111111113332',
    '2331111111111332',
    '3311111111111133',
    '3311111111111133',
    '3311111111111133',
    '3311111111111133',
    '2331111111111332',
    '2333111111113332',
    '2233311111133222',
    '2223333333333222',
    '2222233333322222',
    '2222222222222222'
  ]);

  // 已通關：圓盤中間一個白色勾
  quad('M_DONE', [
    '2222222222222222',
    '2222233333322222',
    '2223333333333222',
    '2233311111133222',
    '2333111111133332',
    '2331111111331332',
    '3311111113311133',
    '3311331133111133',
    '3311133331111133',
    '3311113311111133',
    '2331111111111332',
    '2333111111113332',
    '2233311111133222',
    '2223333333333222',
    '2222233333322222',
    '2222222222222222'
  ]);

  // 道具屋（小屋：紅屋頂 + 白牆 + 門）
  quad('M_SHOP', [
    '2222222222222222',
    '2222222222222222',
    '2222221111222222',
    '2222211111122222',
    '2222111111112222',
    '2221111111111222',
    '2211111111111122',
    '2133333333333312',
    '2133333333333312',
    '2133311111333312',
    '2133311111333312',
    '2133311111333312',
    '2133311111333312',
    '2133333333333312',
    '2222222222222222',
    '2222222222222222'
  ]);

  // 支線 / 隱藏節點（圓盤 + 問號）
  quad('M_HIDE', [
    '2222222222222222',
    '2222233333322222',
    '2223333333333222',
    '2233311111133222',
    '2333113333113332',
    '2331133113311332',
    '3311133113311133',
    '3311111133111133',
    '3311111331111133',
    '3311111331111133',
    '2331111111111332',
    '2333111331113332',
    '2233311331133222',
    '2223333333333222',
    '2222233333322222',
    '2222222222222222'
  ]);

  ST.BG_MAP = BG;

  /* ================================================================== 版面 */
  var ROW0 = 6, GRID_COLS = 8, GRID_ROWS = 5, CELL = 4;
  var HEAD_ROW = 4, FOOT_ROW = 26, SHOP_ROW = 10;
  var SLOTS = [[1, 1], [3, 1], [5, 1], [7, 1], [7, 3], [5, 3], [3, 3], [1, 3]];
  var WALK_SPD = 2;                       // 走格子 2 px/幀
  var PAL = {
    backdrop: 0x0F,
    bg: [[0x0F, 0x10, 0x30], [0x1A, 0x09, 0x27], [0x00, 0x10, 0x2D], [0x16, 0x27, 0x30]]
  };
  var COST = { fire: 10, dart: 15, ammo: 5, inf: 40 };
  var SHOP_ITEMS = [
    { key: 'fire', text: 'FIRE BALL', cost: COST.fire },
    { key: 'dart', text: 'DART', cost: COST.dart },
    { key: 'ammo', text: 'AMMO +15', cost: COST.ammo },
    { key: 'inf', text: 'AMMO INFINITE', cost: COST.inf },
    { key: 'exit', text: 'LEAVE SHOP', cost: 0 }
  ];

  function cellCol(cx) { return cx * CELL + 1; }           // 16×16 圖示的左上角磚欄
  function cellRow(cy) { return ROW0 + cy * CELL + 1; }
  function iconX(cx) { return cellCol(cx) * 8; }
  function iconY(cy) { return cellRow(cy) * 8; }

  /* -------------------------------------------------------------- 節點清單 */
  function levelIds() {
    var out = [], k, src = (ST.Levels && ST.Levels.ids) || null;
    if (src && src.length) { for (k = 0; k < src.length; k++) out.push(src[k]); }
    else if (ST.LEVELS) { for (k in ST.LEVELS) if (Object.prototype.hasOwnProperty.call(ST.LEVELS, k)) out.push(k); }
    return out;
  }

  function parseId(id) {
    var m = /^(\d+)-(\d+)$/.exec(String(id));
    return m ? { world: parseInt(m[1], 10), stage: parseInt(m[2], 10) } : null;
  }

  /** 這份 ST.LEVELS 裡有哪些世界（標題的世界選擇與地圖共用）。 */
  function worlds() {
    var ids = levelIds(), out = [], i, p;
    for (i = 0; i < ids.length; i++) {
      p = parseId(ids[i]);
      if (p && out.indexOf(p.world) < 0) out.push(p.world);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /**
   * 組一個世界的地圖版面。回傳 { world, nodes[], links[] }。
   * nodes[i] = { kind:'level'|'shop'|'branch', id, stage, slot, cx, cy, label }
   */
  function build(world, opts) {
    opts = opts || {};
    world = world | 0;
    var ids = levelIds(), mine = [], i, p, n, nodes = [], links = [];
    for (i = 0; i < ids.length; i++) {
      p = parseId(ids[i]);
      if (p && p.world === world) mine.push({ id: ids[i], stage: p.stage });
    }
    mine.sort(function (a, b) { return a.stage - b.stage; });
    var main = [], branch = [];
    for (i = 0; i < mine.length; i++) (mine[i].stage <= 4 ? main : branch).push(mine[i]);

    for (i = 0; i < main.length && nodes.length < SLOTS.length; i++) {
      nodes.push({ kind: 'level', id: main[i].id, stage: main[i].stage, label: String(main[i].stage) });
    }
    if (opts.shop !== false && nodes.length < SLOTS.length) {
      nodes.push({ kind: 'shop', id: null, stage: 0, label: '$' });
    }
    for (i = 0; i < branch.length && nodes.length < SLOTS.length; i++) {
      nodes.push({ kind: 'branch', id: branch[i].id, stage: branch[i].stage, label: '?' });
    }
    for (n = 0; n < nodes.length; n++) {
      nodes[n].slot = n;
      nodes[n].cx = SLOTS[n][0];
      nodes[n].cy = SLOTS[n][1];
      nodes[n].x = iconX(nodes[n].cx);
      nodes[n].y = iconY(nodes[n].cy);
      if (n > 0) links.push([n - 1, n]);
    }
    return { world: world, nodes: nodes, links: links, levels: main.length, branches: branch.length };
  }

  /** 節點是否解鎖（cleared = 通關位元）。 */
  function unlocked(layout, i, cleared) {
    var P = ST.Password, nd = layout.nodes[i];
    if (!nd) return false;
    if (nd.kind === 'shop') return true;                       // 道具屋永遠開（友善版）
    if (!P) return true;
    if (nd.kind === 'branch') {                                // 支線：主線四關全清才開
      var k, all = true;
      for (k = 0; k < layout.nodes.length; k++) {
        if (layout.nodes[k].kind === 'level' && !P.isCleared(cleared, layout.nodes[k].id)) all = false;
      }
      return all;
    }
    if (P.isCleared(cleared, nd.id)) return true;              // 打過的關可以重玩
    if (nd.stage <= 1) return true;
    return P.isCleared(cleared, layout.world + '-' + (nd.stage - 1));
  }

  function isDone(layout, i, cleared) {
    var P = ST.Password, nd = layout.nodes[i];
    return !!(P && nd && nd.id && P.isCleared(cleared, nd.id));
  }

  /* ------------------------------------------------------------ 執行期狀態 */
  var M = {
    open: false, layout: null, at: 0, cleared: 0,
    walk: null, anim: 0, animT: 0, facing: 1, frames: 0,
    shop: null, msg: '', msgT: 0, enters: 0, steps: 0,
    hero: null
  };

  function fakeHero() {
    if (!M.hero) {
      M.hero = {
        x: 0, y: 0, w: 12, h: 22, state: 'idle', facing: 1, onGround: true,
        crouch: false, turning: false, anim: 0, inv: 0, star: 0, frames: 0, deadDone: false
      };
    }
    return M.hero;
  }

  function nodeAt(i) { return (M.layout && M.layout.nodes[i]) || null; }
  function heroPos() {
    var nd = nodeAt(M.at);
    if (!nd) return { x: 0, y: 0 };
    if (M.walk) return { x: M.walk.x, y: M.walk.y };
    return { x: nd.x, y: nd.y };
  }

  function note(text, frames) {
    M.msg = text || '';
    M.msgT = M.msg ? ((frames === undefined) ? 120 : (frames | 0)) : 0;   // note('') = 收回提示
  }

  /* ------------------------------------------------------------------ 繪製 */
  function idx(name) {
    var b = ST.bgBank;
    if (!b) return 0;
    return b.has && b.has(name) ? b.index(name) : 0;
  }
  function text(ppu, col, row, s) {
    var t = (ST.textTiles && ST.bgBank) ? ST.textTiles(ST.bgBank, s) : null, i;
    if (!t) return 0;
    for (i = 0; i < t.length && col + i < 32; i++) ppu.setTile(0, col + i, row, t[i]);
    return t.length;
  }
  function blankRow(ppu, row) { ppu.fillTiles(0, 0, row, 32, 1, idx('SP')); }

  function hash(a, b, c) {
    var v = (a * 1103515245 + b * 12345 + c * 7919) & 0x7FFFFFFF;
    v ^= v >> 13;
    return v & 0x7FFFFFFF;
  }

  function drawTerrain(ppu, layout) {
    var r, c, h, bot = ROW0 + GRID_ROWS * CELL;              // 6 .. 25
    ppu.fillTiles(0, 0, ROW0, 32, GRID_ROWS * CELL, idx('M_GRASS'));
    for (r = ROW0; r < bot; r++) {
      for (c = 0; c < 32; c++) {
        h = hash(c, r, layout.world + 1);
        if (h % 19 === 0) ppu.setTile(0, c, r, idx('M_TREE'));
        else if (h % 29 === 0) ppu.setTile(0, c, r, idx('M_MTN'));
      }
    }
  }

  function drawPaths(ppu, layout) {
    var i, a, b, c, r, lo, hi;
    for (i = 0; i < layout.links.length; i++) {
      a = layout.nodes[layout.links[i][0]];
      b = layout.nodes[layout.links[i][1]];
      if (a.cy === b.cy) {                                    // 水平路徑（走圖示的下半列）
        r = cellRow(a.cy) + 1;
        lo = Math.min(a.cx, b.cx); hi = Math.max(a.cx, b.cx);
        for (c = cellCol(lo) + 2; c < cellCol(hi); c++) ppu.setTile(0, c, r, idx('M_PATH_H'));
      } else {                                                // 垂直路徑
        c = cellCol(a.cx);
        lo = Math.min(a.cy, b.cy); hi = Math.max(a.cy, b.cy);
        for (r = cellRow(lo) + 2; r < cellRow(hi); r++) ppu.setTile(0, c, r, idx('M_PATH_V'));
      }
    }
  }

  function nodeArt(layout, i, cleared) {
    var nd = layout.nodes[i];
    if (nd.kind === 'shop') return 'M_SHOP';
    if (isDone(layout, i, cleared)) return 'M_DONE';
    if (nd.kind === 'branch') return 'M_HIDE';
    return 'M_NODE';
  }

  function drawNode(ppu, layout, i, cleared) {
    var nd = layout.nodes[i], c0 = cellCol(nd.cx), r0 = cellRow(nd.cy);
    var art = nodeArt(layout, i, cleared), open = unlocked(layout, i, cleared);
    var cellC = nd.cx * CELL, cellR = ROW0 + nd.cy * CELL;
    ppu.fillTiles(0, cellC, cellR, CELL, CELL, idx('M_DIRT'));
    ppu.setTile(0, c0, r0, idx(art + '_TL'));
    ppu.setTile(0, c0 + 1, r0, idx(art + '_TR'));
    ppu.setTile(0, c0, r0 + 1, idx(art + '_BL'));
    ppu.setTile(0, c0 + 1, r0 + 1, idx(art + '_BR'));
    text(ppu, c0, r0 + 2, nd.label);                          // 圖示下方的標籤（關號 / $ / ?）
    // 屬性：解鎖 = pal 3（紅 / 沙 / 白）、鎖住 = pal 2（灰）
    ppu.fillAttr(0, nd.cx * 2, (ROW0 + nd.cy * CELL) >> 1, 2, 2, open ? 3 : 2);
  }

  function drawHead(ppu, layout, cleared) {
    var P = ST.Password, n = P ? P.countCleared(cleared) : 0;
    blankRow(ppu, HEAD_ROW);
    blankRow(ppu, HEAD_ROW + 1);
    text(ppu, 2, HEAD_ROW, 'WORLD ' + layout.world + ' MAP');
    text(ppu, 19, HEAD_ROW, 'CLEAR ' + (n < 10 ? '0' : '') + n + '/16');
  }

  function drawFoot(ppu, layout, g) {
    var h = g && g.hero, i;
    for (i = 0; i < 4; i++) blankRow(ppu, FOOT_ROW + i);
    var nd = nodeAt(M.at);
    var name = !nd ? '' : (nd.kind === 'shop' ? 'ITEM SHOP' : ('LEVEL ' + nd.id));
    text(ppu, 2, FOOT_ROW, name);
    if (h) {
      var SWp = ST.SubWeapon;
      var sub = (SWp && h.sub) ? SWp.NAMES[h.sub] : 'NONE';
      var ammo = (SWp && SWp.infinite) ? 'INF' : String(h.subAmmo | 0);
      text(ppu, 2, FOOT_ROW + 1, 'SUB ' + sub + ' ' + ammo + '  @x' + (h.coins | 0));
    }
    text(ppu, 2, FOOT_ROW + 2, M.msgT > 0 ? M.msg : '+ MOVE  A ENTER  B TITLE');
  }

  /** 整張地圖重畫（換世界 / 進地圖 / 離開道具屋）。呼叫端負責靜音 VBlank 預算。 */
  function drawScreen(ppu, g) {
    if (!ppu || !M.layout) return false;
    var layout = M.layout, i;
    ppu.setBackdrop(PAL.backdrop);
    for (i = 0; i < 4; i++) ppu.setBgPalette(i, PAL.bg[i]);
    ppu.fillAttr(0, 0, HEAD_ROW >> 1, 16, 1, 0);
    ppu.fillAttr(0, 0, ROW0 >> 1, 16, (GRID_ROWS * CELL) >> 1, 1);
    ppu.fillAttr(0, 0, FOOT_ROW >> 1, 16, 2, 0);
    drawTerrain(ppu, layout);
    drawPaths(ppu, layout);
    for (i = 0; i < layout.nodes.length; i++) drawNode(ppu, layout, i, M.cleared);
    drawHead(ppu, layout, M.cleared);
    drawFoot(ppu, layout, g);
    if (M.shop) drawShop(ppu, g);
    return true;
  }

  /** 只重畫會變的兩列（走一步 / 訊息變了），省掉整片重寫。 */
  function refresh(ppu, g) {
    if (!ppu || !M.layout) return false;
    drawFoot(ppu, M.layout, g);
    return true;
  }

  /* -------------------------------------------------------------- 道具屋 UI */
  // 店面蓋住地圖的下 16 列（列 10..25），屬性全部切成 pal 0 ⇒ 白字黑底，不跟地形搶色
  // fix-r4（qa-r4 P3-3）：原本只清列 10 起，列 6..9 的地圖草地會殘留一條在「ITEM SHOP」上面，
  // 看起來像沒清乾淨（店面不是半透明的疊窗）⇒ 連地形的頭四列一起清掉（列 6..25 全黑底）。
  // 列 4..5 的 `WORLD n MAP` / `CLEAR nn/16` 留著（店在哪個世界是有用的資訊）。
  function drawShop(ppu, g) {
    var h = g && g.hero, i, it, row = SHOP_ROW, cost;
    for (i = ROW0; i < row + 16; i++) blankRow(ppu, i);
    ppu.fillAttr(0, 0, ROW0 >> 1, 16, ((row + 16 - ROW0) >> 1), 0);
    text(ppu, 11, row, 'ITEM SHOP');
    text(ppu, 3, row + 2, 'COINS @x' + (h ? (h.coins | 0) : 0));
    for (i = 0; i < SHOP_ITEMS.length; i++) {
      it = SHOP_ITEMS[i];
      cost = it.cost ? (' ' + it.cost + '@') : '';
      text(ppu, 3, row + 4 + i, (M.shop.at === i ? '> ' : '  ') + it.text + cost);
    }
    text(ppu, 3, row + 11, M.msgT > 0 ? M.msg : 'A BUY   B LEAVE');
  }

  function buy(g, key) {
    var h = g && g.hero, SWp = ST.SubWeapon, cost = COST[key] | 0;
    if (key === 'exit') return 'exit';
    if (!h || !SWp) return 'none';
    if ((h.coins | 0) < cost) { note('NOT ENOUGH COINS'); if (g.sfx) g.sfx('bump'); return 'poor'; }
    if (key === 'inf' && SWp.infinite) { note('ALREADY INFINITE'); if (g.sfx) g.sfx('bump'); return 'dup'; }
    h.coins = (h.coins | 0) - cost;
    if (g) g.hudDirty = true;
    if (key === 'fire') SWp.give(h, SWp.KIND.FIRE, SWp.AMMO_PICK, g);
    else if (key === 'dart') SWp.give(h, SWp.KIND.DART, SWp.AMMO_PICK, g);
    else if (key === 'ammo') {
      if (!h.sub) { h.coins = (h.coins | 0) + cost; note('NO SUB WEAPON YET'); if (g.sfx) g.sfx('bump'); return 'none'; }
      SWp.give(h, h.sub, SWp.AMMO_PICK, g);
    } else if (key === 'inf') SWp.setInfinite(true, g);
    note('THANK YOU!');
    return 'ok';
  }

  /* ---------------------------------------------------------------- 進 / 出 */
  /** 開地圖：world = 世界編號、cleared = 通關位元；游標落在「第一個沒通關的解鎖節點」。 */
  function openMap(world, cleared, opts) {
    opts = opts || {};
    M.layout = build(world, opts);
    M.cleared = cleared | 0;
    M.open = true;
    M.walk = null; M.shop = null; M.msg = ''; M.msgT = 0;
    M.anim = 0; M.animT = 0; M.facing = 1; M.frames = 0;
    var i, want = 0;
    for (i = 0; i < M.layout.nodes.length; i++) {
      if (M.layout.nodes[i].kind !== 'level') continue;
      if (!unlocked(M.layout, i, M.cleared)) continue;
      want = i;
      if (!isDone(M.layout, i, M.cleared)) break;
    }
    if (opts.at !== undefined && opts.at !== null) {
      var at = opts.at | 0;
      if (at >= 0 && at < M.layout.nodes.length && unlocked(M.layout, at, M.cleared)) want = at;
    }
    M.at = want;
    return M.layout;
  }
  function closeMap() { M.open = false; M.walk = null; M.shop = null; return true; }

  /* ------------------------------------------------------------------ 每幀 */
  function neighbour(dir) {
    // dir: 'left' / 'right' / 'up' / 'down' → 有路徑相連、方向相符的節點
    var layout = M.layout, i, a, b, other, nd = nodeAt(M.at);
    if (!layout || !nd) return -1;
    for (i = 0; i < layout.links.length; i++) {
      a = layout.links[i][0]; b = layout.links[i][1];
      if (a !== M.at && b !== M.at) continue;
      other = (a === M.at) ? b : a;
      var o = layout.nodes[other];
      if (dir === 'right' && o.cx > nd.cx && o.cy === nd.cy) return other;
      if (dir === 'left' && o.cx < nd.cx && o.cy === nd.cy) return other;
      if (dir === 'down' && o.cy > nd.cy) return other;
      if (dir === 'up' && o.cy < nd.cy) return other;
    }
    return -1;
  }

  function startWalk(to) {
    var from = nodeAt(M.at), nd = nodeAt(to);
    if (!from || !nd) return false;
    if (!unlocked(M.layout, to, M.cleared)) { note('LOCKED'); return false; }
    M.walk = { to: to, x: from.x, y: from.y, tx: nd.x, ty: nd.y };
    M.facing = (nd.x > from.x) ? 1 : (nd.x < from.x ? -1 : M.facing);
    M.steps++;
    return true;
  }

  function stepWalk() {
    var w = M.walk, dx, dy, s = WALK_SPD;
    if (!w) return false;
    dx = w.tx - w.x; dy = w.ty - w.y;
    if (dx !== 0) w.x += (dx > 0) ? Math.min(s, dx) : Math.max(-s, dx);
    else if (dy !== 0) w.y += (dy > 0) ? Math.min(s, dy) : Math.max(-s, dy);
    if (w.x === w.tx && w.y === w.ty) { M.at = w.to; M.walk = null; return 'arrive'; }
    return true;
  }

  /**
   * 地圖 / 道具屋的每幀輸入處理。
   * 回傳 null（沒事）或動作物件：
   *   { type:'level', id } 進關卡 ／ { type:'shop' } 開道具屋 ／ { type:'exit' } 回標題
   *   { type:'redraw' } 需要整片重畫（離開道具屋）／ { type:'refresh' } 只重畫底部兩列
   */
  function update(g, input) {
    var BTN = (window.NES && NES.Input && NES.Input.BTN) || null;
    if (!M.open || !M.layout || !input || !BTN) return null;
    M.frames++;
    if (M.msgT > 0) M.msgT--;
    var h = fakeHero();
    h.frames++;

    // ---- 道具屋 ----
    if (M.shop) {
      if (input.pressed(BTN.UP)) { M.shop.at = (M.shop.at + SHOP_ITEMS.length - 1) % SHOP_ITEMS.length; if (g.sfx) g.sfx('coin'); return { type: 'shop_draw' }; }
      if (input.pressed(BTN.DOWN)) { M.shop.at = (M.shop.at + 1) % SHOP_ITEMS.length; if (g.sfx) g.sfx('coin'); return { type: 'shop_draw' }; }
      if (input.pressed(BTN.A) || input.pressed(BTN.START)) {
        var r = buy(g, SHOP_ITEMS[M.shop.at].key);
        if (r === 'exit') { M.shop = null; return { type: 'redraw' }; }
        return { type: 'shop_draw' };
      }
      if (input.pressed(BTN.B)) { M.shop = null; return { type: 'redraw' }; }
      return null;
    }

    // ---- 走格子動畫中：不收方向鍵 ----
    if (M.walk) {
      h.state = 'walk';
      if (++M.animT >= 5) { M.animT = 0; M.anim = (M.anim + 1) & 3; }
      var done = stepWalk();
      if (done === 'arrive') { note(''); return { type: 'refresh' }; }
      return null;
    }

    h.state = 'idle';
    var dir = input.pressed(BTN.RIGHT) ? 'right'
      : input.pressed(BTN.LEFT) ? 'left'
        : input.pressed(BTN.DOWN) ? 'down'
          : input.pressed(BTN.UP) ? 'up' : null;
    if (dir) {
      var to = neighbour(dir);
      if (to < 0) { if (g.sfx) g.sfx('bump'); return null; }
      if (startWalk(to)) { if (g.sfx) g.sfx('jump'); return { type: 'refresh' }; }
      return { type: 'refresh' };
    }
    if (input.pressed(BTN.A) || input.pressed(BTN.START)) {
      var nd = nodeAt(M.at);
      if (!nd) return null;
      if (!unlocked(M.layout, M.at, M.cleared)) { note('LOCKED'); if (g.sfx) g.sfx('bump'); return { type: 'refresh' }; }
      if (nd.kind === 'shop') { M.shop = { at: 0 }; if (g.sfx) g.sfx('powerup'); return { type: 'shop' }; }
      if (!nd.id || !(ST.LEVELS && ST.LEVELS[nd.id])) { note('COMING SOON'); if (g.sfx) g.sfx('bump'); return { type: 'refresh' }; }
      M.enters++;
      return { type: 'level', id: nd.id };
    }
    if (input.pressed(BTN.B) || input.pressed(BTN.SELECT)) return { type: 'exit' };
    return null;
  }

  /** 玩家棋子（直接用主角精靈，所以不佔新的精靈磚）。 */
  function drawSprites(oam, g) {
    var h = fakeHero(), p = heroPos();
    if (!ST.Hero || !ST.heroTiles || !oam) return 0;
    if (M.shop) return 0;                 // 開店時棋子會壓在店面文字上 ⇒ 先收起來
    h.x = p.x + 2;                        // 16×16 圖示中央（圖示寬 16、主角寬 12）
    h.y = p.y - 20;                       // 站在圖示上緣（整個節點圓盤 / 打勾都看得見）
    h.facing = M.facing;
    h.state = M.walk ? 'walk' : 'idle';
    h.turning = false;
    return ST.Hero.draw(h, g, oam, ST.heroTiles, 0);
  }

  function state() {
    var nd = nodeAt(M.at), p = heroPos();
    return {
      open: !!M.open, world: M.layout ? M.layout.world : 0,
      at: M.at, node: nd ? { kind: nd.kind, id: nd.id, label: nd.label, cx: nd.cx, cy: nd.cy } : null,
      nodes: M.layout ? M.layout.nodes.length : 0,
      levels: M.layout ? M.layout.levels : 0,
      branches: M.layout ? M.layout.branches : 0,
      cleared: M.cleared | 0, walking: !!M.walk,
      x: p.x, y: p.y, steps: M.steps, enters: M.enters,
      shop: M.shop ? { at: M.shop.at, item: SHOP_ITEMS[M.shop.at].key } : null,
      msg: M.msgT > 0 ? M.msg : '',
      locked: (function () {
        var out = [], i;
        if (!M.layout) return out;
        for (i = 0; i < M.layout.nodes.length; i++) if (!unlocked(M.layout, i, M.cleared)) out.push(i);
        return out;
      })(),
      done: (function () {
        var out = [], i;
        if (!M.layout) return out;
        for (i = 0; i < M.layout.nodes.length; i++) if (isDone(M.layout, i, M.cleared)) out.push(i);
        return out;
      })()
    };
  }

  ST.WorldMap = {
    ROW0: ROW0, GRID_COLS: GRID_COLS, GRID_ROWS: GRID_ROWS, CELL: CELL,
    SLOTS: SLOTS, WALK_SPD: WALK_SPD, PAL: PAL, COST: COST, SHOP_ITEMS: SHOP_ITEMS,
    HEAD_ROW: HEAD_ROW, FOOT_ROW: FOOT_ROW, SHOP_ROW: SHOP_ROW,
    build: build, worlds: worlds, unlocked: unlocked, isDone: isDone,
    open: openMap, close: closeMap, update: update,
    drawScreen: drawScreen, refresh: refresh, drawShop: drawShop, drawSprites: drawSprites,
    buy: buy, note: note, state: state,
    cellCol: cellCol, cellRow: cellRow, iconX: iconX, iconY: iconY,
    /** 測試 / 機器人：直接把游標放到某個節點（不跑動畫）。 */
    goto: function (i) {
      if (!M.layout) return false;
      i = i | 0;
      if (i < 0 || i >= M.layout.nodes.length) return false;
      M.at = i; M.walk = null;
      return true;
    },
    /** 測試 / 機器人：某個關卡 id 在第幾個節點（找不到回 −1）。 */
    slotOf: function (id) {
      var i;
      if (!M.layout) return -1;
      for (i = 0; i < M.layout.nodes.length; i++) if (M.layout.nodes[i].id === id) return i;
      return -1;
    },
    get layout() { return M.layout; },
    get at() { return M.at; },
    get isOpen() { return !!M.open; },
    _m: M
  };
})();
