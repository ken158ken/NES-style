/*
 * games/cart4/cards/art.js — 《星塵翻牌 STAR CARDS》CHR（全部原創；程式化幾何 + 自動描邊）
 * ---------------------------------------------------------------------------
 * 擁有者：C8-1 cart4-memory（R8）｜ 依賴：engine/chr.js（字身沿用原創 DEMO.FONT）
 *
 * PPU 規劃（一張牌 = 4×4 磁磚 = 32×32 px = 恰好 2×2 個屬性區塊，牌一律擺在偶數欄 / 列 ⇒ 一張牌一組調色盤）：
 *   BG 調色盤 0 = 牌背 / UI（1 靛藍底、2 金色紋、3 白字）；1 暖色牌面、2 冷色牌面、3 綠色牌面（1 深描邊、2 主色、3 白底）。
 *   18 種牌面圖（16×16，色 1 描邊 / 2 主色 / 3 白）分三色組各 6 張，同組內剪影全不同（色弱也能靠形狀分）：
 *     暖 0 太陽臉 / 1 火箭 / 2 彗星 / 3 五角星 / 4 火焰 / 5 王冠
 *     冷 6 新月 / 7 飛碟 / 8 人造衛星 / 9 冰晶 / 10 太空頭盔 / 11 閃電
 *     綠 12 外星人 / 13 環行星 / 14 機器人 / 15 漩渦星系 / 16 寶石 / 17 星芽
 * 背景磚（cards_bg）：
 *   F_*            字型（色 3）
 *   BK0..15        牌背（32×32：靛藍底 + 金色八角星徽 + 四角金點 + 白邊）
 *   HB0..7         牌背半寬（翻牌第 1 格，畫在牌中間兩欄）
 *   ED0..7         牌側邊（翻牌第 2 格，一條白線）
 *   HF0..7         牌面半寬（翻牌第 3 格，白面）
 *   FR0..15        牌面框（色 1 細框、白底；中間 4 格由牌面圖取代）
 *   MF0..15        配對成功的牌框（色 2 粗框 + 四角小星）
 *   FC_<f>_0..3    牌面圖 2×2
 *   BIG_<字>0..3   標題大字；BH / BHB / BV / BVR 外框；ST1 / ST2 星點
 * 精靈（cards_spr）：CUR 游標角（翻轉成 4 角）、SPK 閃光、DOT（backTile）
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var CT = window.CT = window.CT || {};
  var CA = CT.Cards = CT.Cards || {};
  var CHR = NES.CHR;
  var FONT = (CHR && CHR.DEMO && CHR.DEMO.FONT) || {};
  var CHARMAP = (CHR && CHR.DEMO && CHR.DEMO.CHARMAP) || {};

  function canvas(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push([]); for (var x = 0; x < w; x++) a[y].push(0); } return a; }
  function slice(px) {
    var h = px.length, w = px[0].length, out = [];
    for (var ty = 0; ty < h / 8; ty++) for (var tx = 0; tx < w / 8; tx++) {
      var t = new Uint8Array(64);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t[y * 8 + x] = px[ty * 8 + y][tx * 8 + x];
      out.push(t);
    }
    return out;
  }
  function E8() { return ['........', '........', '........', '........', '........', '........', '........', '........']; }
  function set(px, x, y, v) { x = Math.round(x); y = Math.round(y); if (px[y] && x >= 0 && x < px[y].length) px[y][x] = v; }
  function rect(px, x0, y0, x1, y1, v) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set(px, x, y, v); }
  function disc(px, cx, cy, r, v) {
    for (var y = 0; y < px.length; y++) for (var x = 0; x < px[0].length; x++) {
      var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) px[y][x] = v;
    }
  }
  function ellipse(px, cx, cy, rx, ry, v) {
    for (var y = 0; y < px.length; y++) for (var x = 0; x < px[0].length; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) px[y][x] = v;
    }
  }
  function poly(px, pts, v) {
    for (var y = 0; y < px.length; y++) for (var x = 0; x < px[0].length; x++) {
      var X = x + 0.5, Y = y + 0.5, inside = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > Y) !== (yj > Y)) && (X < (xj - xi) * (Y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) px[y][x] = v;
    }
  }
  function line(px, x0, y0, x1, y1, v) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (var i = 0; i <= n; i++) set(px, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, v);
  }
  function outline(px, v) {
    var h = px.length, w = px[0].length, src = px.map(function (r) { return r.slice(); });
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y][x]) continue;
      if ((x > 0 && src[y][x - 1]) || (x < w - 1 && src[y][x + 1]) || (y > 0 && src[y - 1][x]) || (y < h - 1 && src[y + 1][x])) px[y][x] = v;
    }
  }
  function star5(cx, cy, ro, ri, rot) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5 + (rot || 0), r = i % 2 ? ri : ro;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }
  function bigGlyph(g) {
    var px = canvas(16, 16), i, j, dx, dy, X, Y;
    for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) {
      if (!g || g[j].charAt(i) === '.') continue;
      for (dy = 0; dy < 2; dy++) for (dx = 0; dx < 2; dx++) {
        X = i * 2 + dx - 1; Y = j * 2 + dy;
        if (Y + 1 < 16 && X + 1 < 16 && X + 1 >= 0 && px[Y + 1][X + 1] === 0) px[Y + 1][X + 1] = 1;
        if (X >= 0) px[Y][X] = j < 3 ? 3 : 2;
      }
    }
    return px;
  }

  /* ================================================================ 18 種牌面（16×16） */
  // 規則：先畫填色（2 主色 / 3 白色塊），再 outline(1) 自動描邊，最後補細節（1 線條 / 3 高光）；剩下的 0 = 白底
  var FACE_NAMES = ['SUN', 'ROCKET', 'COMET', 'STAR', 'FLAME', 'CROWN',
                    'MOON', 'SAUCER', 'SATELLITE', 'CRYSTAL', 'HELMET', 'BOLT',
                    'ALIEN', 'RINGS', 'ROBOT', 'GALAXY', 'GEM', 'SPROUT'];
  function face(f) {
    var px = canvas(16, 16), i, a, x, y;
    switch (f) {
      case 0:   // 太陽臉：圓 + 8 道三角光芒 + 笑臉
        for (i = 0; i < 8; i++) {
          a = i * Math.PI / 4;
          var c = Math.cos(a), s = Math.sin(a), pc = Math.cos(a + 0.33), ps = Math.sin(a + 0.33), mc = Math.cos(a - 0.33), ms = Math.sin(a - 0.33);
          poly(px, [[8 + 7.6 * c, 8 + 7.6 * s], [8 + 4.6 * pc, 8 + 4.6 * ps], [8 + 4.6 * mc, 8 + 4.6 * ms]], 2);
        }
        disc(px, 8, 8, 4.6, 2);
        outline(px, 1);
        set(px, 6, 7, 1); set(px, 9, 7, 1);
        set(px, 6, 9, 1); set(px, 7, 10, 1); set(px, 8, 10, 1); set(px, 9, 9, 1);
        set(px, 5, 5, 3);
        break;
      case 1:   // 火箭：白機身 + 圓窗 + 兩翼 + 尾焰
        poly(px, [[8, 0.5], [11, 4.5], [11, 11], [5, 11], [5, 4.5]], 3);
        poly(px, [[5, 7], [2, 11.5], [2, 13], [5, 11]], 2);
        poly(px, [[11, 7], [14, 11.5], [14, 13], [11, 11]], 2);
        rect(px, 6, 12, 9, 13, 2); set(px, 7, 14, 2); set(px, 8, 14, 2);
        outline(px, 1);
        disc(px, 8, 6, 1.6, 2);
        rect(px, 5, 11, 10, 11, 1);
        break;
      case 2:   // 彗星：右上圓頭 + 往左下的三條尾巴
        line(px, 9, 6, 1, 14, 2); line(px, 10, 8, 4, 15, 2); line(px, 7, 5, 1, 9, 2);
        disc(px, 10.5, 5.5, 3.6, 2);
        outline(px, 1);
        disc(px, 10, 5, 1.3, 3);
        break;
      case 3:   // 五角星 + 斜高光
        poly(px, star5(8, 8.6, 7.6, 3.2), 2);
        outline(px, 1);
        set(px, 7, 5, 3); set(px, 7, 6, 3); set(px, 6, 7, 3);
        break;
      case 4:   // 火焰：水滴外焰（主色）+ 白內焰
        disc(px, 8, 10, 4.8, 2);
        poly(px, [[8, 0.3], [12.6, 9.5], [3.4, 9.5]], 2);
        poly(px, [[11.5, 2], [13, 7], [11, 8]], 2);
        outline(px, 1);
        disc(px, 8, 11, 2.4, 3);
        poly(px, [[8, 5.5], [10, 10], [6, 10]], 3);
        break;
      case 5:   // 王冠：三尖 + 寶珠 + 底帶
        poly(px, [[2, 4], [5, 8], [8, 2], [11, 8], [14, 4], [13, 12], [3, 12]], 2);
        outline(px, 1);
        rect(px, 3, 10, 12, 10, 1);
        set(px, 5, 11, 3); set(px, 8, 11, 3); set(px, 11, 11, 3);
        set(px, 8, 6, 3);
        break;
      case 6:   // 新月 + 坑洞
        disc(px, 7.5, 8, 6.6, 2);
        disc(px, 11, 6, 5.6, 0);
        outline(px, 1);
        set(px, 4, 10, 1); set(px, 6, 12, 1); set(px, 3, 7, 3);
        break;
      case 7:   // 飛碟：白玻璃罩 + 主色碟身 + 燈點 + 腳
        ellipse(px, 8, 6.5, 3.6, 3.4, 3);
        ellipse(px, 8, 9.5, 7.4, 2.6, 2);
        line(px, 4, 12, 3, 14, 2); line(px, 12, 12, 13, 14, 2);
        outline(px, 1);
        rect(px, 4, 9, 12, 9, 1);
        set(px, 4, 10, 3); set(px, 8, 10, 3); set(px, 12, 10, 3);
        set(px, 7, 5, 2);
        break;
      case 8:   // 人造衛星：白機體 + 左右格紋太陽板 + 天線
        rect(px, 6, 6, 9, 10, 3);
        rect(px, 1, 6, 4, 10, 2); rect(px, 11, 6, 14, 10, 2);
        rect(px, 5, 8, 5, 8, 3); rect(px, 10, 8, 10, 8, 3);
        line(px, 8, 5, 8, 2, 3);
        outline(px, 1);
        rect(px, 1, 8, 4, 8, 1); rect(px, 11, 8, 14, 8, 1); set(px, 2, 7, 1); set(px, 13, 9, 1);
        disc(px, 8, 2, 1.2, 2);
        set(px, 7, 8, 2); set(px, 8, 8, 2);
        break;
      case 9:   // 冰晶：三軸六臂 + 分枝
        for (i = 0; i < 3; i++) {
          a = i * Math.PI / 3 + Math.PI / 2;
          var dx = Math.cos(a) * 6.5, dy = Math.sin(a) * 6.5;
          line(px, 7.5 - dx, 7.5 - dy, 7.5 + dx, 7.5 + dy, 2);
          for (var sgn = -1; sgn <= 1; sgn += 2) {
            var bx = 7.5 + sgn * dx * 0.62, by = 7.5 + sgn * dy * 0.62;
            var ox = Math.cos(a + Math.PI / 2) * 1.8, oy = Math.sin(a + Math.PI / 2) * 1.8;
            line(px, bx, by, bx + sgn * dx * 0.22 + ox, by + sgn * dy * 0.22 + oy, 2);
            line(px, bx, by, bx + sgn * dx * 0.22 - ox, by + sgn * dy * 0.22 - oy, 2);
          }
        }
        disc(px, 8, 8, 1.6, 3);
        outline(px, 1);
        break;
      case 10:  // 太空頭盔：白球殼 + 主色面罩 + 反光
        disc(px, 8, 7.5, 7, 3);
        rect(px, 4, 14, 11, 15, 3);
        ellipse(px, 8, 7.5, 4.8, 3.4, 2);
        outline(px, 1);
        set(px, 5, 6, 3); set(px, 6, 5, 3); set(px, 6, 6, 3);
        rect(px, 4, 13, 11, 13, 1);
        break;
      case 11:  // 閃電
        poly(px, [[10, 0.5], [3, 9], [7.5, 9], [5, 15.5], [13, 6], [8.5, 6], [11.5, 0.5]], 2);
        outline(px, 1);
        set(px, 9, 3, 3); set(px, 8, 4, 3);
        break;
      case 12:  // 外星人：寬頭窄下巴 + 大黑眼 + 觸角
        poly(px, [[2, 6], [4, 3], [8, 2], [12, 3], [14, 6], [12, 11], [8, 14.5], [4, 11]], 2);
        line(px, 5, 3, 3, 0.5, 2); line(px, 11, 3, 13, 0.5, 2);
        outline(px, 1);
        poly(px, [[3.5, 6.5], [7, 7], [6.5, 9.5], [4.5, 8.8]], 1);
        poly(px, [[12.5, 6.5], [9, 7], [9.5, 9.5], [11.5, 8.8]], 1);
        set(px, 5, 7, 3); set(px, 10, 7, 3);
        set(px, 7, 12, 1); set(px, 8, 12, 1);
        break;
      case 13:  // 環行星：主色球 + 白色斜環（前環蓋住球）
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
          var u = x + 0.5 - 8, w = y + 0.5 - 8;
          var rx = u * 0.94 + w * 0.34, ry = -u * 0.34 + w * 0.94;
          var e = (rx / 7.6) * (rx / 7.6) + (ry / 2.6) * (ry / 2.6);
          if (e <= 1 && e >= 0.45) px[y][x] = 3;
        }
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
          var u2 = x + 0.5 - 8, w2 = y + 0.5 - 8;
          if (u2 * u2 + w2 * w2 <= 4.6 * 4.6) {
            var ry2 = -u2 * 0.34 + w2 * 0.94;
            if (!(px[y][x] === 3 && ry2 > 0)) px[y][x] = 2;
          }
        }
        outline(px, 1);
        set(px, 6, 5, 3); set(px, 7, 4, 3);
        break;
      case 14:  // 機器人：方頭 + 方眼 + 格子嘴 + 天線球 + 耳
        rect(px, 3, 4, 12, 13, 2);
        rect(px, 1, 7, 2, 10, 2); rect(px, 13, 7, 14, 10, 2);
        line(px, 8, 3, 8, 1, 2);
        outline(px, 1);
        rect(px, 5, 6, 6, 8, 3); rect(px, 9, 6, 10, 8, 3);
        rect(px, 5, 10, 10, 11, 3); set(px, 6, 10, 1); set(px, 8, 10, 1); set(px, 7, 11, 1); set(px, 9, 11, 1);
        disc(px, 8.5, 1, 1.2, 3);
        break;
      case 15:  // 漩渦星系：兩條對數螺臂 + 亮核
        for (i = 0; i < 2; i++) {
          for (var t = 0; t < 120; t++) {
            var th = t * 0.07, r = 1.2 + th * 1.15, ang = th + i * Math.PI;
            if (r > 7) break;
            set(px, 7.5 + r * Math.cos(ang), 7.5 + r * Math.sin(ang), 2);
            set(px, 7.5 + (r + 0.6) * Math.cos(ang), 7.5 + (r + 0.6) * Math.sin(ang), 2);
          }
        }
        disc(px, 8, 8, 2.2, 3);
        outline(px, 1);
        set(px, 8, 8, 2);
        break;
      case 16:  // 寶石：梯形頂 + 倒三角底 + 刻面線
        poly(px, [[4, 2], [12, 2], [15, 6], [8, 15], [1, 6]], 2);
        outline(px, 1);
        line(px, 2, 6, 14, 6, 1);
        line(px, 6, 2.5, 5, 6, 1); line(px, 10, 2.5, 11, 6, 1);
        line(px, 5, 7, 8, 14, 1); line(px, 11, 7, 8, 14, 1);
        set(px, 4, 4, 3); set(px, 5, 3, 3); set(px, 3, 5, 3);
        break;
      case 17:  // 星芽：半圓小星球 + 莖 + 兩片葉
        ellipse(px, 8, 15, 7, 4.2, 2);
        line(px, 8, 11, 8, 5, 2);
        poly(px, [[8, 6], [3, 2], [1.5, 5.5], [4, 7.5]], 2);
        poly(px, [[8, 5], [13, 1], [14.5, 4.5], [11.5, 6.5]], 2);
        outline(px, 1);
        line(px, 7.5, 6, 3.5, 3.8, 3); line(px, 8.5, 5, 12.5, 2.5, 3);
        set(px, 5, 13, 3); set(px, 11, 14, 1);
        break;
    }
    // 0 = 白底（牌面色 3）
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (px[y][x] === 0) px[y][x] = 3;
    return px;
  }

  /* ================================================================ 牌框 / 牌背 / 翻牌中間格 */
  // 牌框 32×32：外圍 1 px 透明（牌與牌之間的縫）、色 1 細框（圓角）、內部白
  function frame(thick) {
    var px = canvas(32, 32), x, y;
    rect(px, 1, 1, 30, 30, 3);
    for (x = 3; x <= 28; x++) { px[1][x] = 1; px[30][x] = 1; }
    for (y = 3; y <= 28; y++) { px[y][1] = 1; px[y][30] = 1; }
    px[2][2] = 1; px[2][29] = 1; px[29][2] = 1; px[29][29] = 1;
    px[1][1] = 0; px[1][2] = 0; px[2][1] = 0; px[1][30] = 0; px[1][29] = 0; px[2][30] = 0;
    px[30][1] = 0; px[29][1] = 0; px[30][2] = 0; px[30][30] = 0; px[29][30] = 0; px[30][29] = 0;
    if (thick) {           // 配對成功：色 2 粗框 + 四角小星
      for (x = 3; x <= 28; x++) { px[2][x] = 2; px[29][x] = 2; px[3][x] = 2; px[28][x] = 2; }
      for (y = 3; y <= 28; y++) { px[y][2] = 2; px[y][29] = 2; px[y][3] = 2; px[y][28] = 2; }
      [[6, 6], [25, 6], [6, 25], [25, 25]].forEach(function (p) {
        set(px, p[0], p[1], 2); set(px, p[0] - 1, p[1], 2); set(px, p[0] + 1, p[1], 2); set(px, p[0], p[1] - 1, 2); set(px, p[0], p[1] + 1, 2);
      });
    }
    return px;
  }
  function back() {
    var px = canvas(32, 32), x, y;
    rect(px, 1, 1, 30, 30, 3);
    rect(px, 2, 2, 29, 29, 1);
    px[1][1] = 0; px[1][30] = 0; px[30][1] = 0; px[30][30] = 0;
    // 內框金線 + 斜格紋
    for (x = 4; x <= 27; x++) { px[4][x] = 2; px[27][x] = 2; }
    for (y = 4; y <= 27; y++) { px[y][4] = 2; px[y][27] = 2; }
    for (y = 6; y <= 25; y++) for (x = 6; x <= 25; x++) if (((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) && ((x + y) & 1) === 0) px[y][x] = 2;
    // 中央八角星徽（白芯）
    var pts = [];
    for (var i = 0; i < 16; i++) { var a = i * Math.PI / 8, r = i % 2 ? 4 : 9; pts.push([16 + r * Math.cos(a), 16 + r * Math.sin(a)]); }
    var tmp = canvas(32, 32);
    poly(tmp, pts, 2);
    outline(tmp, 1);
    for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) if (tmp[y][x]) px[y][x] = tmp[y][x];
    disc(px, 16, 16, 2.2, 3);
    [[7, 7], [24, 7], [7, 24], [24, 24]].forEach(function (p) { rect(px, p[0], p[1], p[0] + 1, p[1] + 1, 3); });
    return px;
  }
  // 半寬（16×32，畫在牌中間兩欄）：side 'back' / 'face'
  function half(side) {
    var px = canvas(16, 32), x, y;
    rect(px, 2, 1, 13, 30, 3);
    if (side === 'back') {
      rect(px, 3, 2, 12, 29, 1);
      for (y = 4; y <= 27; y++) { px[y][4] = 2; px[y][11] = 2; }
      for (x = 4; x <= 11; x++) { px[4][x] = 2; px[27][x] = 2; }
      poly(px, [[8, 9], [11, 16], [8, 23], [5, 16]], 2);
      disc(px, 8, 16, 1.4, 3);
    } else {
      for (y = 3; y <= 28; y++) { px[y][2] = 1; px[y][13] = 1; }
      for (x = 3; x <= 12; x++) { px[1][x] = 1; px[30][x] = 1; }
      px[1][2] = 0; px[1][13] = 0; px[30][2] = 0; px[30][13] = 0;
      px[2][2] = 1; px[2][13] = 1; px[29][2] = 1; px[29][13] = 1;
      rect(px, 6, 12, 9, 19, 2);
    }
    return px;
  }
  function edge() {
    var px = canvas(16, 32);
    rect(px, 7, 1, 8, 30, 3);
    rect(px, 6, 2, 6, 29, 2); rect(px, 9, 2, 9, 29, 2);
    return px;
  }

  /* ================================================================ BG bank */
  var BG = { SP: E8() };
  (function () {
    var USED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?/+=*>$%()^\'';
    for (var i = 0; i < USED.length; i++) {
      var n = CHARMAP[USED.charAt(i)];
      if (n && FONT[n] && !BG['F_' + n]) BG['F_' + n] = FONT[n];
    }
  })();
  BG.BH = ['........', '11111111', '........', '22222222', '........', '........', '........', '........'];
  BG.BHB = ['........', '........', '........', '........', '22222222', '........', '11111111', '........'];
  BG.BV = ['.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....', '.1.2....'];
  BG.BVR = ['....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.', '....2.1.'];
  BG.ST1 = ['........', '........', '........', '....3...', '........', '........', '........', '........'];
  BG.ST2 = ['........', '.2......', '........', '........', '........', '........', '......2.', '........'];
  function add(prefix, tiles) { tiles.forEach(function (t, i) { BG[prefix + i] = t; }); }
  add('BK', slice(back()));
  add('HB', slice(half('back')));
  add('HF', slice(half('face')));
  add('ED', slice(edge()));
  add('FR', slice(frame(false)));
  add('MF', slice(frame(true)));
  for (var f = 0; f < FACE_NAMES.length; f++) add('FC_' + f + '_', slice(face(f)));
  'STARCDS'.split('').forEach(function (ch) { if (!BG['BIG_' + ch + '0']) add('BIG_' + ch, slice(bigGlyph(FONT[CHARMAP[ch]]))); });

  /* ================================================================ 精靈 */
  var SPR = { SP: E8() };
  SPR.CUR = ['3333....', '3222....', '32......', '32......', '........', '........', '........', '........'];
  SPR.SPK = ['...3....', '...2....', '.32123..', '...2....', '...3....', '........', '........', '........'];
  SPR.DOT = ['........', '..33....', '.3223...', '.3223...', '..33....', '........', '........', '........'];
  SPR.ARW = ['........', '.33.....', '.3233...', '.322233.', '.3233...', '.33.....', '........', '........'];

  var made = null;
  CA.Art = {
    FACE_NAMES: FACE_NAMES, facePx: face,
    make: function () {
      if (made) return made;
      var bg = CHR.bank('cards_bg', BG), spr = CHR.bank('cards_spr', SPR);
      var faceOf = {};                // 牌面圖左上那格的磁磚編號 → 牌面 id（機器人「看畫面認圖」用）
      for (var f = 0; f < FACE_NAMES.length; f++) faceOf[bg.index('FC_' + f + '_0')] = f;
      made = {
        bg: bg, spr: spr, faceOf: faceOf, NFACE: FACE_NAMES.length,
        t: function (n) { return bg.index(n); },
        s: function (n) { return spr.index(n); },
        ch: function (c) {
          if (c === '★') c = '$';
          if (c === ' ') return 0;
          var n = CHARMAP[c];
          if (n === undefined && c >= 'a' && c <= 'z') n = CHARMAP[c.toUpperCase()];
          return (n && bg.has('F_' + n)) ? bg.index('F_' + n) : 0;
        },
        text: function (s) { var o = []; for (var i = 0; i < s.length; i++) o.push(made.ch(s.charAt(i))); return o; }
      };
      return made;
    }
  };
})();
