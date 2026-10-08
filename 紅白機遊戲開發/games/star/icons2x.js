/*
 * games/star/icons2x.js — 《星塵勇者》互動物件 / 道具圖示 2× 放大（R4 star-meta 追加）
 * ---------------------------------------------------------------------------
 * 擁有者：star-meta agent（F4-3）｜ 依賴：chr_world.js（`ST.BG_WORLD` 的既有 8×8 art）、
 *                                      levels_w1.js（`ST.TILE`）；main.js 負責接線
 * 起因：使用者回饋（2026-10-08）「整體圖示太小、人太大；圖示可以變大一倍，例如問號箱等等；
 *       怪物好像還好。」——敵人 / 無敵星本來就是 16×16 精靈，主角 16×24；**小的是背景磚**
 *       （金幣 / ? 磚 / 磚塊 / 旗桿頂端都只有 8×8）。本檔把這些「互動物件」放大到 2 倍。
 *
 *   做法：**地形仍然是單格 8×8，只有「畫面」佔 2 格**（任務指示：視覺 2×2、地形單格）。
 *     ① 金幣 / 旗桿頂端：16×16（2×2 磚），往**上 + 右**長。兩者都不是固體 ⇒ 碰撞完全不變。
 *        旗子（fix-r4 / qa-r4 P3-6）也 16×16，但往**下 + 右**長（往上會跟球搶同一格）。
 *     ② ? 磚 / 用過的磚 / 磚塊：8×16（1×2 磚），往**上**長。長出來的那一格在主角的碰撞裡
 *        被當成**單向平台（oneway）**：從下面頂得過去（頂磚照舊打在原本那一格）、
 *        從上面踩得到（站在視覺的頂端，不會「站進磚裡」）⇒ **可達性只會增加、不會減少**。
 *     ③ 放不下（旁邊 / 上面不是空的、也不是純背景紋）就自動退回原本的 8×8，畫面不會破；
 *        **同一排相鄰的同種圖示會一起退**（fix-r4 / qa-r4 P3-5：一排裡不混兩種大小）。
 *   圖：直接把既有 8×8 art 等比放大（金幣 / 旗桿球是 2×2 像素放大再修圓角；磚類是兩段堆疊），
 *       所以主題換色（`ST.World.applyPalettes`）後顏色自動跟著對。
 */
(function () {
  'use strict';
  var ST = window.ST = window.ST || {};

  var BG = {};
  var ROWS = 30, TOP_ROW = 4;

  /* ------------------------------------------------------------ art 工具 */
  function src(name) {
    var o = ST.BG_WORLD || ST.BG_FALLBACK || null;
    return (o && o[name]) ? o[name] : null;
  }
  // 8×8 → 16×16（像素 2 倍）
  function scale2(rows) {
    var out = [], y, x, s, line;
    for (y = 0; y < 8; y++) {
      line = '';
      for (x = 0; x < 8; x++) { s = rows[y].charAt(x); line += s + s; }
      out.push(line); out.push(line);
    }
    return out;
  }
  // 16×16 → 四塊 8×8（TL / TR / BL / BR）
  function quad(key, rows16) {
    var i, t = { TL: [], TR: [], BL: [], BR: [] };
    for (i = 0; i < 16; i++) {
      (i < 8 ? t.TL : t.BL).push(rows16[i].slice(0, 8));
      (i < 8 ? t.TR : t.BR).push(rows16[i].slice(8, 16));
    }
    BG[key + '_TL'] = t.TL; BG[key + '_TR'] = t.TR;
    BG[key + '_BL'] = t.BL; BG[key + '_BR'] = t.BR;
    return [[key + '_TL', key + '_TR'], [key + '_BL', key + '_BR']];
  }
  // 8×16（上下兩塊）
  function tall(key, rows16) {
    BG[key + '_T'] = rows16.slice(0, 8);
    BG[key + '_B'] = rows16.slice(8, 16);
    return [[key + '_T'], [key + '_B']];
  }

  // 金幣：像素 2 倍之後把四個角修圓（2 倍放大的圓會變成方角）
  function coin16() {
    var a = src('BG_COIN');
    if (!a) return null;
    var r = scale2(a), i, y;
    function put(y2, x2, ch) { r[y2] = r[y2].slice(0, x2) + ch + r[y2].slice(x2 + 1); }
    for (i = 0; i < 2; i++) {
      y = i;                                   // 上面兩列：左右各再縮一格
      put(y, 4 + i, '.'); put(y, 11 - i, '.');
      y = 15 - i;                              // 下面兩列
      put(y, 4 + i, '.'); put(y, 11 - i, '.');
    }
    return r;
  }
  // 旗桿頂端的球：2 倍放大即可（本來就是圓的）
  function ball16() {
    var a = src('BG_POLE_TOP');
    return a ? scale2(a) : null;
  }
  // ? 磚 / 用過的磚：做成「上下邊框 + 內部填色 + **原本的圖樣置中**」的 8×16 盒子。
  // （把 8×8 的圖樣直接拉長兩倍會糊掉，? 會變得認不出來 —— 第一版踩過）
  function box16(name) {
    var a = src(name);
    if (!a) return null;
    var fill = a[1].charAt(1), left = a[1].charAt(0), right = a[1].charAt(7);
    var blank = left, i;
    for (i = 0; i < 6; i++) blank += fill;
    blank += right;
    var out = [a[0]];
    for (i = 0; i < 4; i++) out.push(blank);        // 上半的空白內部
    for (i = 1; i <= 6; i++) out.push(a[i]);        // 原本的圖樣（6 列，置中）
    for (i = 0; i < 4; i++) out.push(blank);        // 下半的空白內部
    out.push(a[7]);
    return out.slice(0, 16);
  }
  // 磚塊：上下各一層原本的磚（兩段式，看起來像兩層磚牆而不是被拉長）
  function stack16(name) {
    var a = src(name);
    if (!a) return null;
    return a.concat(a);
  }

  // 旗子：和球一樣 2 倍放大即可（三角形放大後還是三角形）。fix-r4（qa-r4 P3-6）
  function flag16() {
    var a = src('BG_FLAG');
    return a ? scale2(a) : null;
  }

  /* ---------------------------------------------------------------- 規格表 */
  // code → { w, h, ox, oy, names[row][col], oneway }
  //   圖示佔 (ac+ox .. ac+ox+w-1) × (ar+oy .. ar+oy+h-1)；(ox,oy) 是「錨點在圖示裡的位置」的負偏移。
  //   ox=0 / oy=-(h-1) ⇒ 錨點在**左下**（往上 + 往右長，金幣 / 球 / ? 磚 / 磚塊）。
  //   ox=0 / oy=0      ⇒ 錨點在**左上**（往下 + 往右長，只有旗子：往上會跟旗桿頂端的球搶格）。
  var SPEC = null;

  function spec(w, h, key, names, oneway, kind, ox, oy) {
    return {
      w: w, h: h, key: key, names: names, oneway: oneway, kind: kind,
      ox: ox || 0, oy: (oy === undefined) ? -(h - 1) : oy
    };
  }
  function build() {
    if (SPEC || !ST.TILE) return SPEC;
    var T = ST.TILE, s;
    SPEC = {};
    s = coin16();
    if (s) SPEC[T.COIN] = spec(2, 2, 'I2_COIN', quad('I2_COIN', s), false, 'coin');
    s = ball16();
    if (s && T.GOAL_TOP !== undefined) {
      SPEC[T.GOAL_TOP] = spec(2, 2, 'I2_BALL', quad('I2_BALL', s), false, 'ball');
    }
    // fix-r4（qa-r4 P3-6）：旗子也 2× —— 否則 16×16 的球配 8×8 的小旗子，比例落差看得出來。
    // 旗子在 (旗桿欄+1, 旗桿頂+1)，**往上就是球的右下塊** ⇒ 改成往「下 + 右」長（oy = 0）。
    s = flag16();
    if (s && T.FLAG !== undefined) {
      SPEC[T.FLAG] = spec(2, 2, 'I2_FLAG', quad('I2_FLAG', s), false, 'flag', 0, 0);
    }
    s = box16('BG_QBLOCK');
    if (s) SPEC[T.QBLOCK] = spec(1, 2, 'I2_QB', tall('I2_QB', s), true, 'block');
    s = box16('BG_USED');
    if (s && T.USED !== undefined) SPEC[T.USED] = spec(1, 2, 'I2_US', tall('I2_US', s), true, 'block');
    s = stack16('BG_BRICK');
    if (s && T.BRICK !== undefined) SPEC[T.BRICK] = spec(1, 2, 'I2_BR', tall('I2_BR', s), true, 'block');
    ST.BG_ICON2X = BG;
    return SPEC;
  }

  /* ------------------------------------------- 可以被圖示蓋掉的「背景紋」 */
  /* fix-r4（qa-r4 P2-2）：原本只接受 `TILE.EMPTY`，所以 16 關裡有 7 關的旗桿頂端球長不出來
   * （1-2 / 2-1 / 2-2 上方是 VEIN、3-1 / 3-2 是 CSEA_T、4-1 / 4-2 是 MBG）——全部是
   * **貼在天空 / 岩層上的純背景紋**，`kind` 都是 'none'。這些紋路被圖示蓋掉：
   *   ① 可達性一個位元都沒動（本來就不是地形）；② 看不出「少了東西」（它只是底紋）。
   * 反過來，**看得出是物件**的 none 磚一律不蓋（雲 / 山 / 樹 / 草叢 / 火把 / 礦燈 / 齒輪 /
   * 坑道支撐梁 / 結晶 / 旗桿本體 / 鎖鏈 / 斧頭 …）——蓋掉會變成「畫壞了」。
   */
  var COVER_NAMES = ['VEIN', 'CAVEBG', 'MBG', 'CSEA_T', 'CSEA_B', 'STAR_S', 'STAR_B', 'STAR_T', 'RAIL'];
  var COVER = null;
  function buildCover() {
    var T = ST.TILE, i, c;
    COVER = {};
    if (!T) return COVER;
    for (i = 0; i < COVER_NAMES.length; i++) {
      c = T[COVER_NAMES[i]];
      if (c === undefined) continue;
      // 保險：語意不是 'none' 的一律不蓋（主題換色不會改語意，但別人改表時這行會擋住）
      if (typeof ST.solidKind === 'function' && ST.solidKind(c) !== 'none') continue;
      COVER[c] = 1;
    }
    return COVER;
  }
  /** 這個磚碼可以被圖示的延伸格蓋掉嗎？（空白 / 白名單背景紋 ⇒ 可以；圖示錨點 ⇒ 不行） */
  function coverable(t) {
    if (t === undefined || t === null) return false;
    if (t === ST.TILE.EMPTY) return true;
    if (SPEC && SPEC[t]) return false;                       // 另一個圖示的錨點不能被蓋
    if (!COVER) buildCover();
    return !!COVER[t];
  }

  /* ------------------------------------------------------------ 幾何判斷 */
  function anchorDx(sp) { return -sp.ox; }
  function anchorDy(sp) { return -sp.oy; }

  function fits(ac, ar, sp, tileAt, cols) {
    var dx, dy, c, r, adx, ady;
    if (!sp) return false;
    adx = anchorDx(sp); ady = anchorDy(sp);
    for (dy = 0; dy < sp.h; dy++) {
      for (dx = 0; dx < sp.w; dx++) {
        if (dx === adx && dy === ady) continue;              // 錨點本身
        c = ac + sp.ox + dx; r = ar + sp.oy + dy;
        if (c < 0 || (cols && c >= cols) || r < TOP_ROW || r >= ROWS) return false;
        if (!coverable(tileAt(c, r))) return false;
      }
    }
    return true;
  }

  /* fix-r4（qa-r4 P3-5）：**同一排相鄰的同種圖示要嘛全部放大、要嘛全部退回**。
   * 一排金幣裡混著 16×16 與 8×8 比「全部都小」更顯眼（QA：25 / 688 顆退回）。
   * 只有「會往右長」（w > 1 = 金幣 / 球 / 旗子）需要這條規則；? 磚 / 磚塊只往上長，不搶格。
   */
  var RUN_GAP = 1;        // 同一排的「下一顆」最多隔幾欄（金幣弧線都是隔 1 欄排的）
  function rowFits(ac, ar, sp, tileAt, cols) {
    var t0, c, miss;
    if (!fits(ac, ar, sp, tileAt, cols)) return false;
    if (sp.w < 2) return true;
    t0 = tileAt(ac, ar);
    for (c = ac - 1, miss = 0; c >= 0; c--) {
      if (tileAt(c, ar) !== t0) { if (++miss > RUN_GAP) break; continue; }
      miss = 0;
      if (!fits(c, ar, sp, tileAt, cols)) return false;
    }
    for (c = ac + 1, miss = 0; !cols || c < cols; c++) {
      if (tileAt(c, ar) !== t0) { if (++miss > RUN_GAP) break; continue; }
      miss = 0;
      if (!fits(c, ar, sp, tileAt, cols)) return false;
    }
    return true;
  }

  // 本格 → 錨點的所有可能位移（由 SPEC 自動推出；(0,0) 永遠排第一 ⇒ 錨點優先畫自己那一塊）
  var CANDS = null;
  function cands() {
    if (CANDS) return CANDS;
    var sp = build(), k, s, dx, dy, key, seen = { '0,0': 1 };
    CANDS = [[0, 0]];
    for (k in sp) {
      if (!Object.prototype.hasOwnProperty.call(sp, k)) continue;
      s = sp[k];
      for (dy = 0; dy < s.h; dy++) {
        for (dx = 0; dx < s.w; dx++) {
          key = (s.ox + dx) + ',' + (s.oy + dy);
          if (seen[key]) continue;
          seen[key] = 1;
          CANDS.push([s.ox + dx, s.oy + dy]);
        }
      }
    }
    return CANDS;
  }

  // (col,row) 屬於哪個圖示？回 { ac, ar, sp, dx, dy } 或 null
  function ownerOf(col, row, tileAt, cols) {
    var sp = build(), i, list, ac, ar, dx, dy, t, s2;
    if (!sp || !ST.Icons2x.enabled || typeof tileAt !== 'function') return null;
    list = cands();
    for (i = 0; i < list.length; i++) {
      ac = col - list[i][0]; ar = row - list[i][1];
      if (ac < 0 || (cols && ac >= cols) || ar < TOP_ROW || ar >= ROWS) continue;
      t = tileAt(ac, ar);
      s2 = sp[t];
      if (!s2) continue;
      dx = col - (ac + s2.ox); dy = row - (ar + s2.oy);
      if (dx < 0 || dx >= s2.w || dy < 0 || dy >= s2.h) continue;
      // 延伸格只能長在空白 / 白名單背景紋上
      if (!(dx === anchorDx(s2) && dy === anchorDy(s2)) && !coverable(tileAt(col, row))) continue;
      if (!rowFits(ac, ar, s2, tileAt, cols)) continue;
      return { ac: ac, ar: ar, sp: s2, dx: dx, dy: dy };
    }
    return null;
  }

  /** 這一格要畫哪個磚名（null = 照原本的畫）。 */
  function nameAt(col, row, tileAt, cols) {
    var o = ownerOf(col, row, tileAt, cols);
    return o ? o.sp.names[o.dy][o.dx] : null;
  }

  /** 長出來的那一格對主角的地形語意（只有磚類會回 'oneway'，其餘 null）。 */
  function kindAt(col, row, tileAt, cols) {
    var o = ownerOf(col, row, tileAt, cols);
    if (!o || !o.sp.oneway) return null;
    if (o.dx === anchorDx(o.sp) && o.dy === anchorDy(o.sp)) return null;   // 錨點自己維持原本語意
    return 'oneway';
  }

  /**
   * 16×16 屬性區塊 (c16,r16) 裡**只有**「圖示的延伸格」時，回這些圖示錨點的座標清單
   * （呼叫端拿去查錨點的調色盤組；一排 ? 磚 / 磚塊會有好幾個錨點，所以是清單不是單一個）。
   * 區塊裡有任何別的地形 ⇒ 回 null（不動它的調色盤）。
   * fix-r4（P2-2）：延伸格也可能蓋在白名單背景紋上（不只空白），所以改判「這一格是不是
   * 被圖示的延伸格蓋住」，而不是「這一格是不是空白」——否則球長出來了、顏色卻跟著岩層紋。
   */
  function attrOwners(c16, r16, tileAt, cols) {
    var T = ST.TILE, c0 = c16 * 2, r0 = r16 * 2, dx, dy, c, r, o, out = [], seen = {}, k;
    for (dy = 0; dy < 2; dy++) {
      for (dx = 0; dx < 2; dx++) {
        c = c0 + dx; r = r0 + dy;
        if (r < TOP_ROW || r >= ROWS) continue;
        o = ownerOf(c, r, tileAt, cols);
        if (o && !(o.dx === anchorDx(o.sp) && o.dy === anchorDy(o.sp))) {
          k = o.ac + ',' + o.ar;
          if (!seen[k]) { seen[k] = 1; out.push({ col: o.ac, row: o.ar }); }
          continue;                                            // 這一格被延伸格蓋住了
        }
        if (tileAt(c, r) !== T.EMPTY) return null;             // 區塊裡有別的地形 ⇒ 不動它
      }
    }
    return out.length ? out : null;
  }
  function attrOwner(c16, r16, tileAt, cols) {
    var l = attrOwners(c16, r16, tileAt, cols);
    return l ? l[0] : null;
  }

  /** 主角友善判定：box 碰到「圖示的視覺範圍」就算碰到該圖示（回錨點清單）。 */
  function touching(x, y, w, h, tileAt, cols) {
    var out = [], c, r, o, i, seen = {};
    var c0 = (x >> 3) - 1, c1 = ((x + w) >> 3) + 1, r0 = (y >> 3) - 1, r1 = ((y + h) >> 3) + 1;
    for (c = c0; c <= c1; c++) {
      for (r = r0; r <= r1; r++) {
        if (c < 0 || (cols && c >= cols) || r < TOP_ROW || r >= ROWS) continue;
        if (!(x < c * 8 + 8 && c * 8 < x + w && y < r * 8 + 8 && r * 8 < y + h)) continue;
        o = ownerOf(c, r, tileAt, cols);
        if (!o || o.sp.oneway) continue;                       // 只有非固體圖示（金幣 / 球 / 旗子）
        i = o.ac + ',' + o.ar;
        if (seen[i]) continue;
        seen[i] = 1;
        out.push({ col: o.ac, row: o.ar, kind: o.sp.kind });
      }
    }
    return out;
  }

  ST.Icons2x = {
    enabled: true,
    ROWS: ROWS, TOP_ROW: TOP_ROW,
    build: build, fits: fits, ownerOf: ownerOf, nameAt: nameAt, kindAt: kindAt,
    attrOwner: attrOwner, attrOwners: attrOwners, touching: touching,
    get SPEC() { return build(); },
    get BG() { return BG; },
    /** 測試用：某個磚碼有沒有 2× 規格。 */
    specOf: function (code) { var s = build(); return s ? (s[code] || null) : null; },
    state: function () {
      var s = build(), k, out = { enabled: !!ST.Icons2x.enabled, tiles: 0, kinds: [] };
      for (k in BG) if (Object.prototype.hasOwnProperty.call(BG, k)) out.tiles++;
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out.kinds.push(s[k].key + '(' + s[k].w + 'x' + s[k].h + ')');
      return out;
    }
  };
  build();
})();
