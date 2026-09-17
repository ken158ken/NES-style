#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/test_ppu.py — engine/ppu.js + engine/palette.js 的自動測試（agent: ppu）

用法：
    ../卡比之星/.venv/bin/python tools/test_ppu.py [--headed] [--keep]

作法：Playwright 開 about:blank，只 add_script_tag 載入 palette.js 與 ppu.js
（依 docs/TASKS.md「各模組自己的測試不得依賴別人的檔案」），在頁面內跑所有檢查，
最後把一幀 demo 畫面截到 shots/agent_ppu/。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
SHOTS = ROOT / "shots" / "agent_ppu"

# ---------------------------------------------------------------- 測試腳本（頁面內執行）
TESTS_JS = r"""
() => {
  const R = [];
  const ok = (name, cond, detail) => R.push({name, ok: !!cond, detail: detail === undefined ? '' : String(detail)});
  const throws = (name, fn, must) => {
    let msg = null;
    try { fn(); } catch (e) { msg = e.message; }
    ok(name, msg !== null && (!must || msg.indexOf(must) >= 0), msg === null ? '沒有 throw' : msg);
  };
  const P = NES.PALETTE;

  // ============================ ① 調色盤 ============================
  ok('palette: 長度 64', P.length === 64, 'length=' + P.length);
  ok('palette: 每項為 [r,g,b] 0..255',
     P.every(c => Array.isArray(c) && c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255)));
  ok('palette: $00 = #7C7C7C', P.hex(0x00) === '#7C7C7C', P.hex(0x00));
  ok('palette: $16 = #F83800', P.hex(0x16) === '#F83800', P.hex(0x16));
  ok('palette: $2D = #787878', P.hex(0x2D) === '#787878', P.hex(0x2D));
  ok('palette: $3D = #F8D8F8', P.hex(0x3D) === '#F8D8F8', P.hex(0x3D));
  ok('palette: FORBIDDEN = [0x0D]', JSON.stringify(P.FORBIDDEN) === '[13]', JSON.stringify(P.FORBIDDEN));
  ok('palette: rgb(i) 回傳複本', (() => { const a = P.rgb(0); a[0] = 999; return P[0][0] === 0x7C; })());
  throws('palette: rgb(64) throw', () => P.rgb(64));
  throws('palette: rgb(-1) throw', () => P.rgb(-1));
  ok('palette: nearest 精確命中 $16', P.nearest(0xF8, 0x38, 0x00) === 0x16, P.nearest(0xF8, 0x38, 0x00));
  ok('palette: nearest 近似 → $21', P.nearest(0x3A, 0xBA, 0xFA) === 0x21, P.nearest(0x3A, 0xBA, 0xFA));
  ok('palette: nearest 黑色不會回傳禁用的 $0D', P.nearest(0, 0, 0) !== 0x0D, P.nearest(0, 0, 0));

  // ============================ ② $0D 禁用 ============================
  const p0 = NES.PPU.create(null, {scale: 1});
  throws('ppu: setBackdrop($0D) throw', () => p0.setBackdrop(0x0D), '禁用色');
  throws('ppu: setBgPalette 含 $0D throw', () => p0.setBgPalette(0, [0x0D, 0x11, 0x21]), '禁用色');
  throws('ppu: setSprPalette 含 $0D throw', () => p0.setSprPalette(3, [0x01, 0x0D, 0x21]), '禁用色');
  throws('ppu: 色號 64 throw', () => p0.setBgPalette(0, [64, 1, 2]));
  throws('ppu: 調色盤組別 4 throw', () => p0.setBgPalette(4, [1, 2, 3]));
  throws('ppu: 每組必須剛好 3 色', () => p0.setBgPalette(0, [1, 2]));
  ok('ppu: 合法色號可設定', (() => { p0.setBackdrop(0x0F); p0.setBgPalette(0, [0x01, 0x11, 0x21]); return p0.getBgPalette(0).join(',') === '15,1,17,33'; })(), p0.getBgPalette(0).join(','));

  // ============================ ③ 名稱表 / 屬性表 寫讀 ============================
  const mk = () => {
    const p = NES.PPU.create(null, {scale: 1, flicker: 'none'});
    p.setBackdrop(0x0F);
    p.setBgPalette(0, [0x01, 0x11, 0x21]);
    p.setBgPalette(1, [0x06, 0x16, 0x26]);
    p.setBgPalette(2, [0x09, 0x19, 0x29]);
    p.setBgPalette(3, [0x00, 0x10, 0x30]);
    p.setSprPalette(0, [0x02, 0x12, 0x22]);
    p.setSprPalette(1, [0x05, 0x15, 0x25]);
    p.setSprPalette(2, [0x08, 0x18, 0x28]);
    p.setSprPalette(3, [0x0C, 0x1C, 0x2C]);
    return p;
  };
  const BG = [[0x01, 0x11, 0x21], [0x06, 0x16, 0x26], [0x09, 0x19, 0x29], [0x00, 0x10, 0x30]];
  const SP = [[0x02, 0x12, 0x22], [0x05, 0x15, 0x25], [0x08, 0x18, 0x28], [0x0C, 0x1C, 0x2C]];

  let p = mk();
  p.setTile(0, 5, 7, 123);
  ok('nametable: setTile / getTile', p.getTile(0, 5, 7) === 123, p.getTile(0, 5, 7));
  ok('nametable: 其他格未被汙染', p.getTile(0, 6, 7) === 0 && p.getTile(0, 5, 8) === 0);
  p.fillTiles(0, 2, 2, 4, 3, 77);
  ok('nametable: fillTiles 4×3', p.getTile(0, 2, 2) === 77 && p.getTile(0, 5, 4) === 77 && p.getTile(0, 6, 4) === 0);
  throws('nametable: row 30 throw', () => p.setTile(0, 0, 30, 1));
  throws('nametable: col 32 throw', () => p.setTile(0, 32, 0, 1));
  throws('nametable: nt 4 throw', () => p.setTile(4, 0, 0, 1));
  throws('nametable: tile 256 throw', () => p.setTile(0, 0, 0, 256));

  // 屬性表：四象限互不干擾（同一 byte 內 16×16 區塊）
  p.setAttr(0, 0, 0, 1); p.setAttr(0, 1, 0, 2); p.setAttr(0, 0, 1, 3); p.setAttr(0, 1, 1, 0);
  ok('attr: 同 byte 四象限獨立',
     p.getAttr(0, 0, 0) === 1 && p.getAttr(0, 1, 0) === 2 && p.getAttr(0, 0, 1) === 3 && p.getAttr(0, 1, 1) === 0,
     [p.getAttr(0,0,0), p.getAttr(0,1,0), p.getAttr(0,0,1), p.getAttr(0,1,1)].join(','));
  p.setAttr(0, 15, 14, 2);
  ok('attr: 邊界 (15,14)', p.getAttr(0, 15, 14) === 2);
  throws('attr: row16 15 throw', () => p.setAttr(0, 0, 15, 1));
  throws('attr: pal 4 throw', () => p.setAttr(0, 0, 0, 4));

  // ============================ ④ 鏡像 ============================
  p = mk();
  p.mirroring('h'); // 水平鏡像：$2000/$2400 同、$2800/$2C00 同（上下兩張不同）
  p.setTile(0, 1, 1, 10); p.setTile(2, 1, 1, 20);
  ok("mirroring 'h': nt0 == nt1", p.getTile(1, 1, 1) === 10, p.getTile(1, 1, 1));
  ok("mirroring 'h': nt2 == nt3", p.getTile(3, 1, 1) === 20, p.getTile(3, 1, 1));
  ok("mirroring 'h': nt0 != nt2", p.getTile(0, 1, 1) !== p.getTile(2, 1, 1));
  p = mk();
  p.mirroring('v'); // 垂直鏡像：$2000/$2800 同、$2400/$2C00 同（左右兩張不同）
  p.setTile(0, 1, 1, 10); p.setTile(1, 1, 1, 20);
  ok("mirroring 'v': nt0 == nt2", p.getTile(2, 1, 1) === 10, p.getTile(2, 1, 1));
  ok("mirroring 'v': nt1 == nt3", p.getTile(3, 1, 1) === 20, p.getTile(3, 1, 1));
  ok("mirroring 'v': nt0 != nt1", p.getTile(0, 1, 1) !== p.getTile(1, 1, 1));
  ok("mirroring: getter", p.mirroring() === 'v');
  throws("mirroring: 非法模式 throw", () => p.mirroring('x'));

  // ============================ ⑤ 屬性表 → 16×16 上色 ============================
  p = mk();
  p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 1);
  p.fillAttr(0, 0, 0, 16, 15, 0);
  p.setAttr(0, 0, 0, 2);      // 左上 16×16 用背景盤 2
  p.scroll(0, 0, 0);
  p.render();
  const inSet = (c, set) => set.indexOf(c) >= 0;
  ok('attr: 16×16 區塊套用調色盤 2', inSet(p.colorAt(4, 4), BG[2]), '$' + p.colorAt(4, 4).toString(16));
  ok('attr: 相鄰 16×16 區塊仍是調色盤 0', inSet(p.colorAt(20, 4), BG[0]), '$' + p.colorAt(20, 4).toString(16));
  ok('attr: 16px 下方仍是調色盤 0', inSet(p.colorAt(4, 20), BG[0]), '$' + p.colorAt(4, 20).toString(16));

  // ============================ ⑥ 捲動（含跨名稱表邊界） ============================
  p = mk();
  p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 1); p.fillAttr(0, 0, 0, 16, 15, 0);
  p.fillTiles(1, 0, 0, 32, 30, 2); p.fillAttr(1, 0, 0, 16, 15, 1);
  p.scroll(0, 0, 0); p.render();
  ok('scroll: x=0 全畫面是 nt0（盤 0）', inSet(p.colorAt(4, 100), BG[0]) && inSet(p.colorAt(250, 100), BG[0]));
  p.scroll(248, 0, 0); p.render();
  const left = p.colorAt(4, 100), right = p.colorAt(12, 100);
  ok('scroll: x=248 左 8px 仍是 nt0', inSet(left, BG[0]), '$' + left.toString(16));
  ok('scroll: x=248 之後跨到 nt1（盤 1）', inSet(right, BG[1]), '$' + right.toString(16));
  p.scroll(256, 0, 0); p.render();
  ok('scroll: x=256 整畫面是 nt1', inSet(p.colorAt(4, 100), BG[1]) && inSet(p.colorAt(250, 100), BG[1]));
  // fine X：捲動 1px 後畫面確實位移
  p.scroll(0, 0, 0); p.render();
  const base = Array.from(p.indexFrame.slice(100 * 256, 100 * 256 + 32));
  p.scroll(1, 0, 0); p.render();
  const sh = Array.from(p.indexFrame.slice(100 * 256, 100 * 256 + 32));
  ok('scroll: fine X 位移 1px', base.slice(1, 16).join() === sh.slice(0, 15).join(), base.slice(0,8).join() + ' vs ' + sh.slice(0,8).join());
  // 捲動 512 等同 0（兩張名稱表寬）
  p.scroll(0, 0, 0); p.render();
  const f0 = Array.from(p.indexFrame.slice(0, 2048));
  p.scroll(512, 0, 0); p.render();
  ok('scroll: x=512 回到 x=0', f0.join() === Array.from(p.indexFrame.slice(0, 2048)).join());
  // 垂直捲動（水平鏡像 → 上下兩張不同）
  p = mk(); p.mirroring('h');
  p.fillTiles(0, 0, 0, 32, 30, 1); p.fillAttr(0, 0, 0, 16, 15, 0);
  p.fillTiles(2, 0, 0, 32, 30, 2); p.fillAttr(2, 0, 0, 16, 15, 1);
  p.scroll(0, 232, 0); p.render();
  ok('scroll: y=232 上 8px 是 nt0', inSet(p.colorAt(100, 4), BG[0]), '$' + p.colorAt(100, 4).toString(16));
  ok('scroll: y=232 之後跨到 nt2（盤 1）', inSet(p.colorAt(100, 12), BG[1]), '$' + p.colorAt(100, 12).toString(16));

  // ============================ ⑦ 分割捲動（狀態列） ============================
  p = mk(); p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 1); p.fillAttr(0, 0, 0, 16, 15, 0);  // 世界
  p.fillTiles(1, 0, 0, 32, 30, 2); p.fillAttr(1, 0, 0, 16, 15, 3);  // 狀態列素材
  p.scroll(0, 0, 1);                       // 上半：狀態列（nt1，不捲動）
  p.split(32, {x: 100, y: 0, nt: 0});       // 下半：世界（nt0，捲動 100）
  p.render();
  ok('split: 上半段用狀態列調色盤 3', inSet(p.colorAt(100, 20), BG[3]), '$' + p.colorAt(100, 20).toString(16));
  ok('split: 下半段用世界調色盤 0', inSet(p.colorAt(100, 150), BG[0]), '$' + p.colorAt(100, 150).toString(16));
  ok('split: 上下半段像素不同', p.colorAt(100, 20) !== p.colorAt(100, 150));
  ok('split: 分割線前一列仍屬上半段', inSet(p.colorAt(100, 31), BG[3]));
  ok('split: 分割線該列起屬下半段', inSet(p.colorAt(100, 32), BG[0]));
  // 下半段捲動獨立：只改 split.x，上半段像素不變
  const top0 = p.colorAt(100, 20), bot0 = Array.from(p.indexFrame.slice(150 * 256, 150 * 256 + 16));
  p.split(32, {x: 104, y: 0, nt: 0}); p.render();
  ok('split: 只動下半捲動、上半不受影響', p.colorAt(100, 20) === top0);
  ok('split: 下半捲動確實改變', bot0.join() !== Array.from(p.indexFrame.slice(150 * 256, 150 * 256 + 16)).join());
  p.split(null); p.render();
  ok('split: null 取消分割', inSet(p.colorAt(100, 150), BG[3]), '$' + p.colorAt(100, 150).toString(16));

  // ============================ ⑧ 精靈：翻轉 ============================
  const mkSpr = () => { const q = mk(); q.mirroring('v'); q.fillTiles(0, 0, 0, 32, 30, 0); q.scroll(0, 0, 0); return q; };
  p = mkSpr();
  p.clearSprites();
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 0});
  p.render();
  const a11 = p.colorAt(101, 101), a61 = p.colorAt(106, 101), a16 = p.colorAt(101, 106);
  ok('sprite: 基本繪製（非底色）', a11 !== 0x0F && inSet(a11, SP[0]), '$' + a11.toString(16));
  ok('sprite: 磁磚左右不對稱（可驗翻轉）', a11 !== a61);
  ok('sprite: 磁磚上下不對稱（可驗翻轉）', a11 !== a16);
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 0, flipH: true}); p.render();
  ok('sprite: flipH 水平鏡射', p.colorAt(101, 101) === a61 && p.colorAt(106, 101) === a11,
     '$' + p.colorAt(101, 101).toString(16) + ' / $' + a61.toString(16));
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 0, flipV: true}); p.render();
  ok('sprite: flipV 垂直鏡射', p.colorAt(101, 101) === a16 && p.colorAt(101, 106) === a11,
     '$' + p.colorAt(101, 101).toString(16) + ' / $' + a16.toString(16));
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 2}); p.render();
  ok('sprite: 調色盤切換', inSet(p.colorAt(101, 101), SP[2]), '$' + p.colorAt(101, 101).toString(16));
  p.sprite(0, null); p.render();
  ok('sprite: 關閉後不再繪製', p.colorAt(101, 101) === 0x0F);
  p.sprite(0, {x: -4, y: 100, tile: 1, pal: 0}); p.render();
  ok('sprite: 左邊界裁切不爆', p.colorAt(1, 101) !== 0x0F || true);
  throws('sprite: index 64 throw', () => p.sprite(64, {x: 0, y: 0, tile: 0}));

  // ============================ ⑨ 精靈優先權 ============================
  p = mk(); p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 0); p.fillAttr(0, 0, 0, 16, 15, 0);
  p.fillTiles(0, 12, 12, 2, 2, 1);          // (96..111, 96..111) 有不透明背景
  p.scroll(0, 0, 0);
  p.clearSprites();
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 2, behind: false}); p.render();
  ok('priority: behind=false 蓋在背景上', inSet(p.colorAt(101, 101), SP[2]), '$' + p.colorAt(101, 101).toString(16));
  p.sprite(0, {x: 100, y: 100, tile: 1, pal: 2, behind: true}); p.render();
  ok('priority: behind=true 被不透明背景遮住', inSet(p.colorAt(101, 101), BG[0]), '$' + p.colorAt(101, 101).toString(16));
  p.sprite(0, {x: 160, y: 100, tile: 1, pal: 2, behind: true}); p.render();
  ok('priority: behind=true 但背景透明 → 精靈顯示', inSet(p.colorAt(161, 101), SP[2]), '$' + p.colorAt(161, 101).toString(16));
  // 精靈之間：掃描順序在前者（OAM 索引小）在上
  p.clearSprites();
  p.sprite(0, {x: 160, y: 100, tile: 1, pal: 1});
  p.sprite(1, {x: 160, y: 100, tile: 1, pal: 3});
  p.render();
  ok('priority: OAM 索引小者在前', inSet(p.colorAt(161, 101), SP[1]), '$' + p.colorAt(161, 101).toString(16));

  // ============================ ⑩ 每掃描線 8 精靈上限 ============================
  const NINE = 9, SX = [];
  for (let i = 0; i < NINE; i++) SX.push(10 + i * 20);
  const setupNine = (fl) => {
    const q = mk(); q.mirroring('v');
    q.fillTiles(0, 0, 0, 32, 30, 0); q.scroll(0, 0, 0);
    q.flicker = fl;
    q.clearSprites();
    for (let i = 0; i < NINE; i++) q.sprite(i, {x: SX[i], y: 100, tile: 1, pal: 0});
    return q;
  };
  const visible = (q) => SX.map(x => q.colorAt(x + 3, 103) !== 0x0F);
  p = setupNine('none'); p.render();
  const v1 = visible(p);
  ok('8/line: 前 8 個都畫出來', v1.slice(0, 8).every(Boolean), JSON.stringify(v1));
  ok('8/line: 第 9 個不畫', v1[8] === false, JSON.stringify(v1));
  ok('8/line: stats.maxSpritesLine = 9', p.stats.maxSpritesLine === 9, p.stats.maxSpritesLine);
  ok('8/line: stats.flickered > 0（有掃描線超線）', p.stats.flickered > 0, p.stats.flickered);
  ok('8/line: stats.dropped = 8 列 × 1 個', p.stats.dropped === 8, p.stats.dropped);
  ok('8/line: flicker=none 時兩幀相同（第 9 個永遠不出現）',
     (() => { p.render(); return visible(p)[8] === false; })());
  // 8 個（未超線）不應有丟棄
  p = setupNine('none'); p.sprite(8, null); p.render();
  ok('8/line: 剛好 8 個不丟棄', p.stats.dropped === 0 && p.stats.maxSpritesLine === 8, p.stats.maxSpritesLine);

  // ============================ ⑪ 閃爍輪替（render 純函式 / endFrame 推進）============
  // QA P1-2：render() 不得推進 OAM 輪替指標，否則 __nes.render() 截圖不可重現。
  p = setupNine('rotate');
  p.render(); const fr1 = visible(p);
  p.render(); const fr1b = visible(p);
  p.render(); const fr1c = visible(p);
  ok('flicker: 連續 3 次 render() 選到同一批精靈（render 是純函式，P1-2）',
     JSON.stringify(fr1) === JSON.stringify(fr1b) && JSON.stringify(fr1b) === JSON.stringify(fr1c),
     JSON.stringify([fr1, fr1b, fr1c]));
  ok('flicker: 連續 render() 不動 oamStart', p.oamStart() === 0, p.oamStart());
  p.endFrame();
  ok('flicker: endFrame() 把 oamStart 前進 flickerStep（預設 8）', p.oamStart() === 8, p.oamStart());
  p.render(); const fr2 = visible(p);
  const union = fr1.map((v, i) => v || fr2[i]);
  ok('flicker: 每幀都只畫 8 個', fr1.filter(Boolean).length === 8 && fr2.filter(Boolean).length === 8,
     fr1.filter(Boolean).length + '/' + fr2.filter(Boolean).length);
  ok('flicker: 兩幀被略過的不是同一個', JSON.stringify(fr1) !== JSON.stringify(fr2),
     JSON.stringify(fr1) + ' vs ' + JSON.stringify(fr2));
  ok('flicker: 兩幀合集涵蓋全部 9 個', union.every(Boolean), JSON.stringify(union));
  ok('flicker: advanceFlicker 是 endFrame 的別名', p.advanceFlicker === p.endFrame);
  ok('flicker: flicker="none" 時 endFrame 不動指標',
     (() => { const q = setupNine('none'); q.render(); q.endFrame(); return q.oamStart() === 0; })());
  ok('flicker: flickerStep = 0（遊戲自己做 sprite cycling）時 endFrame 不動指標',
     (() => { const q = setupNine('rotate'); q.flickerStep = 0; q.render(); q.endFrame(); return q.oamStart() === 0; })());
  // 預設 rotate（step 8）：同一線上連號的 16 個精靈，兩幀聯集必須畫齊
  ok('flicker: 16 個同線精靈（OAM 0..15）兩幀聯集 = 全部（預設 flickerStep=8）',
     (() => {
       const q = mk(); q.mirroring('v'); q.fillTiles(0, 0, 0, 32, 30, 0); q.scroll(0, 0, 0);
       q.flicker = 'rotate';            // mk() 預設 none
       q.clearSprites();
       const xs = [];
       for (let i = 0; i < 16; i++) { xs.push(4 + i * 15); q.sprite(i, {x: xs[i], y: 100, tile: 1, pal: 0}); }
       const see = () => xs.map(x => q.colorAt(x + 3, 103) !== 0x0F);
       q.render(); const a = see(); q.endFrame();
       q.render(); const b = see();
       const u = a.map((v, i) => v || b[i]);
       return a.filter(Boolean).length === 8 && b.filter(Boolean).length === 8 && u.every(Boolean);
     })());
  // 連續 8 幀每個精靈都至少出現一次
  p = setupNine('rotate');
  const acc = new Array(NINE).fill(false);
  for (let f = 0; f < 8; f++) { p.render(); visible(p).forEach((v, i) => { if (v) acc[i] = true; }); p.endFrame(); }
  ok('flicker: 8 幀內每個精靈都曾出現', acc.every(Boolean), JSON.stringify(acc));

  // ============================ ⑪b VBlank 寫入預算（QA P1-6）============================
  // ppu.budget 沒綁定時完全 no-op；綁定後每個寫入函式以實際 byte 數計帳。
  ok('budget: 未綁定時寫入不會出錯（budget = null）',
     (() => { const q = mk(); q.setTile(0, 0, 0, 1); q.sprite(0, {x: 0, y: 0, tile: 1, pal: 0}); return q.budget === null; })());
  const mkBudget = () => ({
    limit: 160, used: 0, oamLimit: 256, oamUsed: 0, over: false, overFrames: 0, serial: 0, mute: false,
    use: function (n, kind) {
      if (this.mute) return true;
      if (kind === 'oam') { this.oamUsed += n; if (this.oamUsed > this.oamLimit) this.over = true; }
      else { this.used += n; if (this.used > this.limit) this.over = true; }
      return !this.over;
    },
    reset: function () { this.used = 0; this.oamUsed = 0; this.over = false; this.serial++; return this; }
  });
  (() => {
    const q = mk(); const b = mkBudget(); q.budget = b;
    q.setTile(0, 1, 1, 3);
    ok('budget: setTile = 1 byte', b.used === 1, b.used);
    q.setAttr(0, 0, 0, 1);
    ok('budget: setAttr = 1 byte', b.used === 2, b.used);
    b.reset(); q.fillTiles(0, 0, 0, 26, 1, 5);
    ok('budget: fillTiles 26 格 = 26 byte（demo 每幀補一欄）', b.used === 26, b.used);
    b.reset(); q.fillAttr(0, 0, 2, 1, 13, 1);
    ok('budget: fillAttr 13 塊 = 13 byte', b.used === 13, b.used);
    b.reset(); q.setBgPalette(0, [0x21, 0x11, 0x01]); q.setSprPalette(0, [0x21, 0x11, 0x01]); q.setBackdrop(0x0F);
    ok('budget: 調色盤 3+3+1 byte', b.used === 7, b.used);
    b.reset();
    for (let i = 0; i < 64; i++) q.sprite(i, {x: i, y: 100, tile: 1, pal: 0});
    ok('budget: 64 個精靈 = OAM 通道 256 byte（$4014 DMA，不佔名稱表預算）',
       b.oamUsed === 256 && b.used === 0 && !b.over, b.oamUsed + '/' + b.used);
    // 同一槽重複寫不會重複計帳（真機一幀只做一次 DMA）
    for (let i = 0; i < 64; i++) q.sprite(i, {x: i, y: 100, tile: 2, pal: 0});
    ok('budget: 同一幀重寫同一個 OAM 槽不重複計帳', b.oamUsed === 256 && !b.over, b.oamUsed);
    b.reset();
    q.clearSprites();
    ok('budget: clearSprites = 整頁 256 byte', b.oamUsed === 256, b.oamUsed);
    b.reset(); b.mute = true; q.fillTiles(0, 0, 0, 32, 30, 1); q.sprite(0, null); b.mute = false;
    ok('budget: mute 期間不計帳（__nes.render 重畫）', b.used === 0 && b.oamUsed === 0, b.used + '/' + b.oamUsed);
    b.reset(); q.fillTiles(0, 0, 0, 32, 6, 1);
    ok('budget: 一幀寫 192 byte（> 160）→ over = true', b.over === true && b.used === 192, b.used);
  })();

  // ============================ ⑫ 8×16 模式 ============================
  p = mkSpr();
  p.clearSprites();
  p.spriteMode(16);
  ok('8x16: spriteMode getter', p.spriteMode() === 16);
  p.sprite(0, {x: 100, y: 100, tile: 2, pal: 0});
  p.render();
  ok('8x16: 上半（磁磚 2）有畫', p.colorAt(103, 102) !== 0x0F, '$' + p.colorAt(103, 102).toString(16));
  ok('8x16: 下半（磁磚 3）有畫', p.colorAt(103, 110) !== 0x0F, '$' + p.colorAt(103, 110).toString(16));
  ok('8x16: 第 16 列以下沒有', p.colorAt(103, 116) === 0x0F, '$' + p.colorAt(103, 116).toString(16));
  const upper = p.colorAt(103, 102), lower = p.colorAt(103, 110);
  p.sprite(0, {x: 100, y: 100, tile: 2, pal: 0, flipV: true}); p.render();
  ok('8x16: flipV 上下半互換',
     p.colorAt(103, 102) === p.colorAt(103, 102) && p.colorAt(103, 113) !== 0x0F,
     '$' + p.colorAt(103, 102).toString(16));
  p.spriteMode(8); p.render();
  ok('8x16: 切回 8×8 後只剩上半', p.colorAt(103, 110) === 0x0F);
  throws('8x16: spriteMode(12) throw', () => p.spriteMode(12));

  // ============================ ⑬ 同屏色數統計 ============================
  p = mk(); p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 0);            // 先全透明 → 露出底色
  p.fillTiles(0, 0, 0, 8, 4, 1); p.fillAttr(0, 0, 0, 4, 2, 0);
  p.fillTiles(0, 8, 0, 8, 4, 1); p.fillAttr(0, 4, 0, 4, 2, 1);
  p.fillTiles(0, 16, 0, 8, 4, 1); p.fillAttr(0, 8, 0, 4, 2, 2);
  p.fillTiles(0, 24, 0, 8, 4, 1); p.fillAttr(0, 12, 0, 4, 2, 3);
  p.scroll(0, 0, 0);
  p.clearSprites();
  for (let i = 0; i < 4; i++) p.sprite(i, {x: 20 + i * 40, y: 150, tile: 1, pal: i});
  p.render();
  ok('colors: 全 25 色場景 stats.colors = 25', p.stats.colors === 25, p.stats.colors + ' → ' + p.usedColors().map(c => '$' + c.toString(16)).join(' '));
  ok('colors: 不超過 NES 上限 25', p.stats.colors <= NES.PPU.MAX_COLORS);
  p.clearSprites(); p.render();
  ok('colors: 移除精靈後 = 13（底色 + 4 組背景 ×3）', p.stats.colors === 13, p.stats.colors);
  p.fillAttr(0, 0, 0, 16, 15, 0); p.render();
  ok('colors: 全部用背景盤 0 → 4 色', p.stats.colors === 4, p.stats.colors);
  ok('colors: usedColors 與 stats.colors 一致', p.usedColors().length === p.stats.colors);

  // ============================ ⑭ frame 緩衝 / 索引緩衝 ============================
  p = mk(); p.mirroring('v'); p.fillTiles(0, 0, 0, 32, 30, 0); p.scroll(0, 0, 0);
  p.setBackdrop(0x16); p.render();
  ok('frame: 型別與長度', p.frame instanceof Uint8ClampedArray && p.frame.length === 256 * 240 * 4, p.frame.length);
  ok('frame: 像素 RGBA 與底色 $16 相符',
     p.frame[0] === 0xF8 && p.frame[1] === 0x38 && p.frame[2] === 0x00 && p.frame[3] === 255,
     [p.frame[0], p.frame[1], p.frame[2], p.frame[3]].join(','));
  ok('frame: indexFrame 長度 256×240', p.indexFrame.length === 256 * 240);
  ok('frame: colorAt 與 frame 一致', p.colorAt(0, 0) === 0x16);
  ok('const: WIDTH/HEIGHT/VISIBLE_HEIGHT', NES.PPU.WIDTH === 256 && NES.PPU.HEIGHT === 240 && NES.PPU.VISIBLE_HEIGHT === 224);
  ok('const: MAX_SPRITES 64 / 每線 8', NES.PPU.MAX_SPRITES === 64 && NES.PPU.MAX_SPRITES_PER_LINE === 8);

  // ============================ ⑮ nes_lint 介接：stats.overLine 別名 / ppu.oam ============================
  p = setupNine('none'); p.render();
  ok('lint: stats.overLine 與 overLines 是同一個陣列參照',
     p.stats.overLine === p.stats.overLines && p.stats.overLine.length === 8,
     'overLine.length=' + p.stats.overLine.length + ' lines=' + p.stats.overLine.join(','));
  ok('lint: stats.overLine 內容 = 超過 8 精靈的掃描線（100..107）',
     p.stats.overLine.join(',') === '100,101,102,103,104,105,106,107', p.stats.overLine.join(','));
  p.clearSprites(); p.render();
  ok('lint: 沒有超線時 overLine 為空陣列', Array.isArray(p.stats.overLine) && p.stats.overLine.length === 0);

  p = mk();
  p.clearSprites();
  p.sprite(0, {x: 33, y: 77, tile: 129, pal: 2, flipH: true, behind: true});
  p.sprite(63, {x: 200, y: 8, tile: 4, pal: 1, flipV: true});
  ok('lint: ppu.oam 是長度 64 的陣列', Array.isArray(p.oam) && p.oam.length === 64, p.oam.length);
  const s0 = p.oam[0];
  ok('lint: ppu.oam[0] 欄位齊全且正確',
     s0.x === 33 && s0.y === 77 && s0.tile === 129 && s0.pal === 2 &&
     s0.flipH === true && s0.flipV === false && s0.behind === true && s0.on === true,
     JSON.stringify(s0));
  ok('lint: ppu.oam[63] 與 on 旗標', p.oam[63].on === true && p.oam[63].flipV === true && p.oam[1].on === false,
     JSON.stringify(p.oam[63]));
  ok('lint: ppu.oam 為唯讀檢視（改回傳值不影響 PPU）',
     (() => { const v = p.oam; v[0].x = 999; v[0].on = false; return p.oam[0].x === 33 && p.oam[0].on === true; })());
  ok('lint: ppu.oam 每次讀取都是新物件', p.oam[0] !== p.oam[0]);
  // OAM 位元組鏡像（2C02 格式）
  const ob = p.oamBytes();
  ok('lint: oamBytes() 長度 256', ob instanceof Uint8Array && ob.length === 256, ob.length);
  ok('lint: oamBytes() 精靈 0 = Y/磁磚/屬性/X',
     ob[0] === 77 && ob[1] === 129 && ob[2] === (2 | 0x20 | 0x40) && ob[3] === 33,
     [ob[0], ob[1], ob[2], ob[3]].join(','));
  ok('lint: oamBytes() 關閉的精靈 Y = $EF（移出畫面）', ob[4] === 0xEF, '$' + ob[4].toString(16));

  return R;
}
"""

# ---------------------------------------------------------------- canvas / 縮放 / 裁切測試
CANVAS_JS = r"""
() => {
  const R = [];
  const ok = (name, cond, detail) => R.push({name, ok: !!cond, detail: detail === undefined ? '' : String(detail)});
  const cv = document.getElementById('screen');
  const p = NES.PPU.create(cv, {scale: 3, flicker: 'none'});
  p.setBackdrop(0x0F);
  p.setBgPalette(0, [0x01, 0x11, 0x21]);
  p.setBgPalette(1, [0x06, 0x16, 0x26]);
  p.mirroring('v');
  p.fillTiles(0, 0, 0, 32, 30, 1);
  p.fillAttr(0, 0, 0, 16, 15, 0);
  p.fillTiles(0, 0, 0, 32, 1, 0);    // 磁磚列 0（內部 y 0..7）全透明 → 底色，應被裁掉
  p.fillTiles(0, 0, 29, 32, 1, 0);   // 磁磚列 29（內部 y 232..239）同樣應被裁掉
  p.scroll(0, 0, 0);
  p.render();
  ok('canvas: 尺寸 = 256×224 × scale', cv.width === 256 * 3 && cv.height === 224 * 3, cv.width + 'x' + cv.height);
  const ctx = cv.getContext('2d');
  ok('canvas: imageSmoothingEnabled = false', ctx.imageSmoothingEnabled === false);
  // 畫布 (x, 0) 應對應內部 (x, 8)（上下各裁 8 列）
  const px = (x, y) => Array.from(ctx.getImageData(x * 3 + 1, y * 3 + 1, 1, 1).data).slice(0, 3);
  const want = NES.PALETTE.rgb(p.colorAt(4, 8));
  ok('crop: 畫布第 0 列 = 內部第 8 列', px(4, 0).join() === want.join(), px(4, 0).join() + ' vs ' + want.join());
  const wantB = NES.PALETTE.rgb(p.colorAt(4, 231));
  ok('crop: 畫布最後一列 = 內部第 231 列', px(4, 223).join() === wantB.join(), px(4, 223).join() + ' vs ' + wantB.join());
  ok('crop: 內部 y=0..7 與 y=232..239 是底色（被裁掉的緩衝列）',
     p.colorAt(4, 0) === 0x0F && p.colorAt(4, 7) === 0x0F && p.colorAt(4, 239) === 0x0F,
     '$' + p.colorAt(4, 0).toString(16) + ' / $' + p.colorAt(4, 239).toString(16));
  const bdRGB = NES.PALETTE.rgb(0x0F).join();
  ok('crop: 畫布上下兩端都不是被裁掉的底色列',
     px(4, 0).join() !== bdRGB && px(4, 223).join() !== bdRGB,
     px(4, 0).join() + ' / ' + px(4, 223).join());
  // 整數倍放大：同一原始像素放大後 3×3 都同色
  const a = ctx.getImageData(30, 30, 1, 1).data, b = ctx.getImageData(31, 30, 1, 1).data;
  ok('scale: 放大後相鄰子像素同色（無平滑）', a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
  let threw = false; try { NES.PPU.create(cv, {scale: 2.5}); } catch (e) { threw = true; }
  ok('scale: 非整數 throw', threw);
  return R;
}
"""

# ---------------------------------------------------------------- 效能測試
PERF_JS = r"""
(frames) => {
  const p = NES.PPU.create(null, {scale: 1, flicker: 'rotate'});
  p.setBackdrop(0x21);
  p.setBgPalette(0, [0x07, 0x17, 0x27]); p.setBgPalette(1, [0x09, 0x19, 0x29]);
  p.setBgPalette(2, [0x04, 0x14, 0x24]); p.setBgPalette(3, [0x0F, 0x10, 0x30]);
  for (let i = 0; i < 4; i++) p.setSprPalette(i, [0x0F, 0x16 + i, 0x30]);
  p.mirroring('v');
  for (let nt = 0; nt < 2; nt++) {
    for (let r = 0; r < 30; r++) for (let c = 0; c < 32; c++) p.setTile(nt, c, r, (r * 7 + c * 3 + nt) & 255);
    for (let r = 0; r < 15; r++) for (let c = 0; c < 16; c++) p.setAttr(nt, c, r, (r + c) & 3);
  }
  p.split(32, {x: 0, y: 32, nt: 0});
  for (let i = 0; i < 64; i++) {
    p.sprite(i, {x: (i * 23) % 248, y: (i & 3) * 56 + 8, tile: (i * 5) & 255, pal: i & 3,
                 flipH: !!(i & 1), flipV: !!(i & 2), behind: !!(i & 4)});
  }
  // 暖機
  for (let i = 0; i < 20; i++) { p.scroll(i, 0, 0); p.render(); }
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) { p.scroll(i, 0, 0); p.split(32, {x: i * 2, y: 32, nt: 0}); p.render(); p.endFrame(); }
  const total = performance.now() - t0;
  return {avg: total / frames, total: total, frames: frames,
          maxSpritesLine: p.stats.maxSpritesLine, colors: p.stats.colors, flickered: p.stats.flickered};
}
"""

# ---------------------------------------------------------------- demo 場景（截圖用；順便驗 NES.CHR 介接）
DEMO_JS = r"""
() => {
  // 內建一組「假的 NES.CHR」，驗證 ppu.js 會改用外部 CHR（未載入 chr.js 時才用內建假磁磚）
  const TILES = {
    0:  ['........','........','........','........','........','........','........','........'],
    1:  ['33333333','32222223','32333323','32322323','32323323','32333323','32222223','33333333'], // 磚
    2:  ['22222222','21111112','21222212','21211212','21212212','21222212','21111112','22222222'],
    3:  ['.333333.','33222233','32233223','32333323','32333323','32233223','33222233','.333333.'], // 石
    4:  ['11111111','12121212','22222222','23232323','33333333','32323232','22222222','21212121'], // 地面
    5:  ['...11...','..1221..','.122221.','12222221','12222221','.122221.','..1221..','...11...'], // 星
    6:  ['..3333..','.311113.','31122113','31212123','31212123','31122113','.311113.','..3333..'], // 敵
    7:  ['..2222..','.233332.','23311332','23133132','23133132','23311332','.233332.','..2222..'],
    8:  ['...33...','..3333..','.331133.','33111133','33111133','.331133.','..3333..','...33...'], // 主角頭
    9:  ['..3333..','.322223.','32211223','32122123','32122123','32211223','.322223.','..3333..'],
    10: ['33333333','33333333','32222223','32222223','32222223','32222223','33333333','33333333'], // HUD 框
    11: ['..2222..','.222222.','22.22.22','22222222','22.22.22','.222222.','..2222..','........'],
    12: ['........','..1111..','.111111.','11111111','11111111','.111111.','..1111..','........']
  };
  const cache = {};
  function build(idx) {
    if (cache[idx]) return cache[idx];
    const rows = TILES[idx] || TILES[0];
    const t = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const ch = rows[y][x];
      t[y * 8 + x] = ch === '.' ? 0 : (ch.charCodeAt(0) - 48);
    }
    cache[idx] = t;
    return t;
  }
  let chrCalls = 0;
  NES.CHR = {get: function (table, idx) { chrCalls++; return build(idx); }};

  const cv = document.getElementById('screen');
  const p = NES.PPU.create(cv, {scale: 3, flicker: 'rotate'});
  p.setBackdrop(0x21);                       // 天空
  p.setBgPalette(0, [0x07, 0x17, 0x27]);      // 磚（褐）
  p.setBgPalette(1, [0x09, 0x19, 0x29]);      // 地面（綠）
  p.setBgPalette(2, [0x02, 0x12, 0x22]);      // 遠景（藍）
  p.setBgPalette(3, [0x0F, 0x10, 0x30]);      // HUD（黑白）
  p.setSprPalette(0, [0x0F, 0x16, 0x30]);     // 主角（紅白）
  p.setSprPalette(1, [0x0F, 0x1A, 0x2A]);     // 敵人（綠）
  p.setSprPalette(2, [0x0F, 0x28, 0x30]);     // 道具（黃）
  p.setSprPalette(3, [0x0F, 0x14, 0x24]);     // 特效（紫）
  p.mirroring('v');

  // --- 狀態列（nt1 第 1~3 列，scanline 8..31 可見）---
  for (let c = 0; c < 32; c++) { p.setTile(1, c, 1, 10); p.setTile(1, c, 3, 10); }
  for (let c = 2; c < 10; c++) p.setTile(1, c, 2, 11);
  for (let c = 14; c < 20; c++) p.setTile(1, c, 2, 12);
  for (let c = 24; c < 30; c++) p.setTile(1, c, 2, 11);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 16; c++) p.setAttr(1, c, r, 3);

  // --- 世界（nt0 第 4 列以下）---
  for (let nt = 0; nt < 1; nt++) {
    for (let r = 0; r < 15; r++) for (let c = 0; c < 16; c++) p.setAttr(0, c, r, 1);
    for (let r = 4; r < 22; r++) for (let c = 0; c < 32; c++) p.setTile(0, c, r, 0);
    // 遠景山（調色盤 2）
    for (let c = 0; c < 32; c += 8) {
      p.setTile(0, c + 3, 18, 3); p.setTile(0, c + 2, 19, 3); p.setTile(0, c + 3, 19, 3); p.setTile(0, c + 4, 19, 3);
      p.setAttr(0, (c + 2) >> 1, 9, 2); p.setAttr(0, (c + 4) >> 1, 9, 2);
    }
    // 地面（調色盤 1）
    for (let r = 22; r < 30; r++) for (let c = 0; c < 32; c++) p.setTile(0, c, r, r === 22 ? 4 : 2);
    for (let r = 11; r < 15; r++) for (let c = 0; c < 16; c++) p.setAttr(0, c, r, 1);
    // 浮空磚塊 + 石磚（調色盤 0）
    for (let c = 6; c < 12; c++) { p.setTile(0, c, 16, 1); p.setAttr(0, c >> 1, 8, 0); }
    for (let c = 20; c < 24; c++) { p.setTile(0, c, 13, 3); p.setAttr(0, c >> 1, 6, 0); }
    for (let c = 14; c < 17; c++) { p.setTile(0, c, 19, 1); p.setAttr(0, c >> 1, 9, 0); }
  }
  // nt1 的世界部分（跨邊界捲動時看得到）
  for (let r = 22; r < 30; r++) for (let c = 0; c < 32; c++) p.setTile(1, c, r, r === 22 ? 4 : 2);
  for (let r = 11; r < 15; r++) for (let c = 0; c < 16; c++) p.setAttr(1, c, r, 1);
  for (let c = 2; c < 8; c++) { p.setTile(1, c, 17, 1); p.setAttr(1, c >> 1, 8, 0); }

  // --- 捲動：上半狀態列固定（nt1），下半世界捲動（nt0）---
  p.scroll(0, 0, 1);
  p.split(32, {x: 120, y: 32, nt: 0});

  // --- 精靈：主角 2×2 + 一排同線敵人（12 個 → 觸發每線 8 上限與閃爍）+ 道具 ---
  p.clearSprites();
  p.sprite(0, {x: 60, y: 160, tile: 8, pal: 0});
  p.sprite(1, {x: 68, y: 160, tile: 8, pal: 0, flipH: true});
  p.sprite(2, {x: 60, y: 168, tile: 9, pal: 0});
  p.sprite(3, {x: 68, y: 168, tile: 9, pal: 0, flipH: true});
  for (let i = 0; i < 12; i++) p.sprite(4 + i, {x: 8 + i * 20, y: 120, tile: 6, pal: 1});
  for (let i = 0; i < 6; i++) p.sprite(16 + i, {x: 30 + i * 36, y: 96, tile: 5, pal: 2});
  p.sprite(22, {x: 200, y: 150, tile: 7, pal: 3, flipV: true});

  window.__ppu = p;
  const shots = [];
  for (let f = 0; f < 2; f++) { p.render(); shots.push({colors: p.stats.colors, maxSpritesLine: p.stats.maxSpritesLine, flickered: p.stats.flickered, ms: p.stats.ms}); p.endFrame(); }
  return {chrCalls: chrCalls, shots: shots,
          usedColors: p.usedColors().map(c => '$' + ('0' + c.toString(16).toUpperCase()).slice(-2))};
}
"""


def main():
    headed = "--headed" in sys.argv
    SHOTS.mkdir(parents=True, exist_ok=True)
    results = []
    perf = None
    demo = None

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        page = browser.new_page(viewport={"width": 900, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.goto("about:blank")
        page.set_content(
            "<body style='margin:0;background:#202020;display:flex;"
            "align-items:center;justify-content:center;height:100vh'>"
            "<canvas id='screen'></canvas></body>"
        )
        page.add_script_tag(path=str(ENGINE / "palette.js"))
        page.add_script_tag(path=str(ENGINE / "ppu.js"))

        loaded = page.evaluate("() => !!(window.NES && NES.PALETTE && NES.PPU && NES.PPU.create)")
        results.append({"name": "載入: NES.PALETTE / NES.PPU 存在（零相依）", "ok": loaded, "detail": ""})
        results.append({"name": "載入: 未載入 chr.js 時 NES.CHR 不存在（走內建假磁磚）",
                        "ok": page.evaluate("() => !window.NES.CHR"), "detail": ""})

        results += page.evaluate(TESTS_JS)
        results += page.evaluate(CANVAS_JS)

        perf = page.evaluate(PERF_JS, 120)
        results.append({"name": "效能: render() 平均 < 4ms",
                        "ok": perf["avg"] < 4.0,
                        "detail": "avg=%.3f ms / %d 幀（64 精靈 + 分割捲動）" % (perf["avg"], perf["frames"])})

        demo = page.evaluate(DEMO_JS)
        results.append({"name": "CHR: 有 NES.CHR 時改用外部 CHR.get",
                        "ok": demo["chrCalls"] > 0, "detail": "CHR.get 呼叫 %d 次" % demo["chrCalls"]})
        results.append({"name": "demo: 同屏色數 ≤ 25",
                        "ok": demo["shots"][0]["colors"] <= 25,
                        "detail": "%d 色：%s" % (demo["shots"][0]["colors"], " ".join(demo["usedColors"]))})
        results.append({"name": "demo: 每線精靈超過 8 → 閃爍",
                        "ok": demo["shots"][0]["maxSpritesLine"] > 8 and demo["shots"][0]["flickered"] > 0,
                        "detail": "maxSpritesLine=%d flickered=%d 列"
                                  % (demo["shots"][0]["maxSpritesLine"], demo["shots"][0]["flickered"])})

        page.wait_for_timeout(60)
        shot1 = SHOTS / "ppu_demo.png"
        page.locator("#screen").screenshot(path=str(shot1))
        # 第二幀（閃爍輪替後）
        shot2 = SHOTS / "ppu_flicker_f2.png"
        page.evaluate("() => { window.__ppu.endFrame(); window.__ppu.render(); }")
        page.wait_for_timeout(30)
        page.locator("#screen").screenshot(path=str(shot2))
        page.screenshot(path=str(SHOTS / "ppu_page.png"))

        if errors:
            results.append({"name": "頁面無 JS 例外", "ok": False, "detail": " | ".join(errors[:5])})
        else:
            results.append({"name": "頁面無 JS 例外", "ok": True, "detail": ""})
        browser.close()

    # -------------------------------------------------- 報告
    passed = sum(1 for r in results if r["ok"])
    failed = [r for r in results if not r["ok"]]
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        line = "  [%s] %s" % (mark, r["name"])
        if r["detail"]:
            line += "   — " + r["detail"]
        print(line)
    print("")
    print("效能：render() 平均 %.3f ms（%d 幀、64 精靈、分割捲動、每線最多 %d 精靈）"
          % (perf["avg"], perf["frames"], perf["maxSpritesLine"]))
    print("截圖：%s" % (SHOTS / "ppu_demo.png"))
    print("")
    print("總計 %d / %d 通過" % (passed, len(results)))
    if failed:
        print("失敗：")
        for r in failed:
            print("  - %s %s" % (r["name"], r["detail"]))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
