#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/test_shmup.py — engine/shmup.js（NES.SH）的自動測試（agent: engine，R2）

用法：
    ../卡比之星/.venv/bin/python tools/test_shmup.py [--headed]

作法：Playwright 開 about:blank，依載入順序 add_script_tag 載入
palette.js / fixed.js / input.js / cpu_timing.js / chr.js / ppu.js / shmup.js
（shmup.js 本身零相依，載 ppu / cpu_timing 是因為 OAM / Scroller 要對真的 PPU 與
timing.budget 做端對端驗證），在頁面內跑全部檢查。

涵蓋：SIN/COS 誤差、atan2 八方 + 中間角、aim 速度長度、aabb 邊界、Pool、
OAM（prio 排序 / 軟體 sprite cycling / 丟棄 / 越界略過 / 空槽隱藏）、
Scroller（reset 內容一致 / 600 幀每幀 ≤ 45 byte / budget 不超支 / 回退不寫）、
Spawner（單次觸發 / reset / 一幀跨多欄）。
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"

LOAD = ["palette.js", "fixed.js", "input.js", "cpu_timing.js", "chr.js", "ppu.js", "shmup.js"]

# ---------------------------------------------------------------- 頁面內測試
TESTS_JS = r"""
() => {
  const R = [];
  const ok = (name, cond, detail) => R.push({name, ok: !!cond, detail: detail === undefined ? '' : String(detail)});
  const throws = (name, fn, must) => {
    let msg = null;
    try { fn(); } catch (e) { msg = e.message; }
    ok(name, msg !== null && (!must || msg.indexOf(must) >= 0), msg === null ? '沒有 throw' : msg);
  };
  const SH = NES.SH;
  const TAU = Math.PI * 2;

  // ======================================================== ① 載入 / 型別
  ok('載入: NES.SH 存在', !!SH);
  ok('載入: SH.VERSION 是字串', typeof SH.VERSION === 'string', SH.VERSION);
  ok('載入: NES.SHMUP_VERSION 同步', NES.SHMUP_VERSION === SH.VERSION, NES.SHMUP_VERSION);
  ok('載入: 契約成員齊全（SIN/COS/atan2/aim/aabb/Pool/OAM/Scroller/Spawner）',
     SH.SIN && SH.COS && typeof SH.atan2 === 'function' && typeof SH.aim === 'function' &&
     typeof SH.aabb === 'function' && typeof SH.Pool === 'function' && typeof SH.OAM === 'function' &&
     typeof SH.Scroller === 'function' && typeof SH.Spawner === 'function');

  // ======================================================== ② SIN / COS
  ok('SIN: Int16Array 長度 256', (SH.SIN instanceof Int16Array) && SH.SIN.length === 256, SH.SIN.length);
  ok('COS: Int16Array 長度 256', (SH.COS instanceof Int16Array) && SH.COS.length === 256, SH.COS.length);
  let eS = 0, eC = 0;
  for (let a = 0; a < 256; a++) {
    eS = Math.max(eS, Math.abs(SH.SIN[a] - 256 * Math.sin(a * TAU / 256)));
    eC = Math.max(eC, Math.abs(SH.COS[a] - 256 * Math.cos(a * TAU / 256)));
  }
  ok('SIN: 與 Math.sin 誤差 ≤ 2/256', eS <= 2, '最大誤差 ' + eS.toFixed(3) + '/256');
  ok('COS: 與 Math.cos 誤差 ≤ 2/256', eC <= 2, '最大誤差 ' + eC.toFixed(3) + '/256');
  ok('SIN: 四個象限點 0/256/0/-256（0=右 64=下 128=左 192=上）',
     SH.SIN[0] === 0 && SH.SIN[64] === 256 && SH.SIN[128] === 0 && SH.SIN[192] === -256,
     [SH.SIN[0], SH.SIN[64], SH.SIN[128], SH.SIN[192]].join(','));
  ok('COS: 四個象限點 256/0/-256/0',
     SH.COS[0] === 256 && SH.COS[64] === 0 && SH.COS[128] === -256 && SH.COS[192] === 0,
     [SH.COS[0], SH.COS[64], SH.COS[128], SH.COS[192]].join(','));
  let pyth = 0;
  for (let a = 0; a < 256; a++) {
    const m = Math.sqrt(SH.SIN[a] * SH.SIN[a] + SH.COS[a] * SH.COS[a]);
    pyth = Math.max(pyth, Math.abs(m - 256) / 256);
  }
  ok('SIN²+COS² 的長度誤差 < 0.5%', pyth < 0.005, (pyth * 100).toFixed(3) + '%');
  ok('sin()/cos() 會自動 mask 角度', SH.sin(300) === SH.SIN[44] && SH.cos(-4) === SH.COS[252]);

  // ======================================================== ③ atan2
  ok('atan2: (0,0) → 0', SH.atan2(0, 0) === 0);
  const DIRS = [['右', 0, 1, 0], ['右下', 1, 1, 32], ['下', 1, 0, 64], ['左下', 1, -1, 96],
                ['左', 0, -1, 128], ['左上', -1, -1, 160], ['上', -1, 0, 192], ['右上', -1, 1, 224]];
  for (const [nm, dy, dx, want] of DIRS) {
    const got = SH.atan2(dy, dx);
    ok('atan2: 主方向 ' + nm + ' = ' + want, got === want, '得到 ' + got);
  }
  // 16 個中間角（每 16 單位 = 22.5°），用半徑 1000 的整數座標
  let midBad = 0;
  for (let k = 0; k < 16; k++) {
    const a = k * 16 + 8;
    const dx = Math.round(1000 * Math.cos(a * TAU / 256)), dy = Math.round(1000 * Math.sin(a * TAU / 256));
    const got = SH.atan2(dy, dx);
    let d = ((got - a + 128) & 255) - 128;
    if (Math.abs(d) > 1) midBad++;
    ok('atan2: 中間角 ' + a + ' ±1', Math.abs(d) <= 1, '得到 ' + got + '（差 ' + d + '）');
  }
  ok('atan2: 16 個中間角全部在 ±1 內', midBad === 0, midBad + ' 個超差');
  let worst = 0, worstA = -1;
  for (let a = 0; a < 256; a++) {
    const dx = Math.round(1000 * Math.cos(a * TAU / 256)), dy = Math.round(1000 * Math.sin(a * TAU / 256));
    const got = SH.atan2(dy, dx);
    const d = Math.abs(((got - a + 128) & 255) - 128);
    if (d > worst) { worst = d; worstA = a; }
  }
  ok('atan2: 全 256 個角度誤差 ≤ 1', worst <= 1, '最差 ' + worst + ' 單位（角度 ' + worstA + '）');
  let rangeOk = true;
  for (let dx = -40; dx <= 40; dx += 7) for (let dy = -40; dy <= 40; dy += 7) {
    const v = SH.atan2(dy, dx);
    if (!Number.isInteger(v) || v < 0 || v > 255) rangeOk = false;
  }
  ok('atan2: 回傳一律是 0..255 的整數', rangeOk);
  ok('atan2: 大座標不溢位', SH.atan2(30000, 30000) === 32, SH.atan2(30000, 30000));
  ok('atan2: 只差比例、與距離無關', SH.atan2(10, 20) === SH.atan2(100, 200));

  // ======================================================== ④ aim / vel
  let a0 = SH.aim(0, 0, 100, 0, 256);
  ok('aim: 正右 → vx=256 vy=0', a0.vx === 256 && a0.vy === 0, a0.vx + ',' + a0.vy);
  a0 = SH.aim(0, 0, 0, 100, 384);
  ok('aim: 正下 → vx=0 vy=384', a0.vx === 0 && a0.vy === 384, a0.vx + ',' + a0.vy);
  a0 = SH.aim(100, 100, 0, 0, 256);
  ok('aim: 左上 45° 兩軸皆負且相等', a0.vx < 0 && a0.vx === a0.vy, a0.vx + ',' + a0.vy);
  for (const sp of [96, 256, 384, 512]) {
    let bad = 0, worstPct = 0;
    for (let a = 0; a < 256; a++) {
      const dx = Math.round(500 * Math.cos(a * TAU / 256)), dy = Math.round(500 * Math.sin(a * TAU / 256));
      const v = SH.aim(0, 0, dx, dy, sp);
      const pct = Math.abs(Math.sqrt(v.vx * v.vx + v.vy * v.vy) - sp) / sp;
      if (pct > worstPct) worstPct = pct;
      if (pct > 0.02) bad++;
    }
    ok('aim: speed=' + sp + ' 時 256 個方向的向量長度 ±2%', bad === 0,
       '最差 ' + (worstPct * 100).toFixed(3) + '%');
  }
  const outObj = { vx: 0, vy: 0 };
  const r1 = SH.aim(0, 0, 10, 10, 256, outObj);
  ok('aim: 傳 out 時回傳同一個物件（每幀零配置）', r1 === outObj && outObj.vx === 181, outObj.vx + ',' + outObj.vy);
  const vv = SH.vel(64, 512);
  ok('vel: 角度 64（下）→ (0, 512)', vv.vx === 0 && vv.vy === 512, vv.vx + ',' + vv.vy);
  const aa = SH.aim(0, 0, 0, 50, 512);
  ok('vel 與 aim 等價', aa.vx === vv.vx && aa.vy === vv.vy);
  ok('aim: 回傳含角度 a', SH.aim(0, 0, 10, 0, 256).a === 0);

  // ======================================================== ⑤ aabb
  const B = (x, y, w, h) => ({ x: x, y: y, w: w, h: h });
  ok('aabb: 重疊 → true', SH.aabb(B(0, 0, 10, 10), B(5, 5, 10, 10)));
  ok('aabb: 完全包含 → true', SH.aabb(B(0, 0, 20, 20), B(5, 5, 4, 4)));
  ok('aabb: 分離 → false', !SH.aabb(B(0, 0, 10, 10), B(20, 0, 10, 10)));
  ok('aabb: 邊界相鄰（x+w == bx）不算重疊', !SH.aabb(B(0, 0, 10, 10), B(10, 0, 10, 10)));
  ok('aabb: 邊界相鄰（y+h == by）不算重疊', !SH.aabb(B(0, 0, 10, 10), B(0, 10, 10, 10)));
  ok('aabb: 差 1 px 就重疊', SH.aabb(B(0, 0, 10, 10), B(9, 9, 10, 10)));
  ok('aabb: 對角只碰到角 → false', !SH.aabb(B(0, 0, 10, 10), B(10, 10, 10, 10)));
  ok('aabb: 寬 0 → false', !SH.aabb(B(0, 0, 0, 10), B(0, 0, 10, 10)));
  ok('aabb: 交換參數結果相同',
     SH.aabb(B(4, 4, 12, 6), B(10, 2, 12, 12)) === SH.aabb(B(10, 2, 12, 12), B(4, 4, 12, 6)));
  ok('aabb: 船 12×6 vs 敵彈 4×4 實例',
     SH.aabb(B(40, 100, 12, 6), B(50, 104, 4, 4)) && !SH.aabb(B(40, 100, 12, 6), B(52, 104, 4, 4)));

  // ======================================================== ⑥ Pool
  let factoryIdx = [];
  const pool = SH.Pool(4, (i) => { factoryIdx.push(i); return { id: i, x: 0 }; });
  ok('Pool: 建構時就把 4 個物件全造好', pool.items.length === 4 && factoryIdx.join(',') === '0,1,2,3');
  ok('Pool: 初始 count = 0、全部 alive = false',
     pool.count === 0 && pool.items.every(o => o.alive === false));
  const o1 = pool.alloc(), o2 = pool.alloc(), o3 = pool.alloc(), o4 = pool.alloc();
  ok('Pool: alloc 4 次拿到 4 個不同物件',
     new Set([o1, o2, o3, o4]).size === 4 && o1.alive === true, 'count=' + pool.count);
  ok('Pool: count = 4', pool.count === 4);
  ok('Pool: 滿了 alloc() 回 null', pool.alloc() === null);
  ok('Pool: free 後 count-1、alive=false', pool.free(o2) === true && pool.count === 3 && o2.alive === false);
  const o2b = pool.alloc();
  ok('Pool: free 後可以再 alloc（拿回同一槽）', o2b === o2 && o2b.alive === true && pool.count === 4);
  ok('Pool: 重複 free 安全（回 false）', pool.free(o2b) === true && pool.free(o2b) === false && pool.count === 3);
  ok('Pool: free 外來物件回 false', pool.free({ x: 1 }) === false && pool.free(null) === false);
  let visited = [];
  pool.each(o => visited.push(o.id));
  ok('Pool: each 只跑活的', visited.join(',') === '0,2,3', visited.join(','));
  o3.alive = false;                       // 遊戲自己標死 ⇒ 下一次 each 回收
  visited = [];
  pool.each(o => visited.push(o.id));
  ok('Pool: 被標成 alive=false 的會自動回收', visited.join(',') === '0,3' && pool.count === 2, visited.join(','));
  visited = [];
  pool.each(o => { visited.push(o.id); o.alive = false; });
  ok('Pool: each 中殺死自己 → 立刻回收', visited.join(',') === '0,3' && pool.count === 0);
  pool.alloc(); pool.alloc(); pool.freeAll();
  ok('Pool: freeAll 全部歸還', pool.count === 0 && pool.items.every(o => !o.alive));
  ok('Pool: freeAll 後 alloc 從 0 號槽開始', pool.alloc() === pool.items[0]);
  ok('Pool: isAlive(i)', pool.isAlive(0) === true && pool.isAlive(1) === false);
  throws('Pool: n <= 0 throw', () => SH.Pool(0, () => ({})), 'n 必須');
  throws('Pool: factory 不是 function throw', () => SH.Pool(4, null), 'factory');
  throws('Pool: factory 不回物件 throw', () => SH.Pool(2, () => null), '必須回傳物件');

  // ======================================================== ⑦ OAM
  const mkPpu = () => {
    const p = NES.PPU.create(null, { scale: 1 });
    p.flickerStep = 0;                     // 契約：軟體 sprite cycling 由 NES.SH.OAM 做
    p.setBackdrop(0x0F);
    p.setSprPalette(0, [0x21, 0x11, 0x01]);
    p.setSprPalette(1, [0x16, 0x26, 0x36]);
    return p;
  };
  let ppu = mkPpu();
  let oam = SH.OAM(ppu, {});
  const S = (x, y, tile, prio, pal) => ({ x: x, y: y, tile: tile, pal: pal || 0, prio: prio || 0 });
  oam.begin();
  oam.add(S(10, 20, 5, 0)); oam.add(S(30, 40, 6, 0)); oam.add(S(50, 60, 7, 0));
  let wrote = oam.end();
  ok('OAM: 3 顆寫進 OAM 0..2', wrote === 3 && ppu.getSprite(0).tile === 5 &&
     ppu.getSprite(1).tile === 6 && ppu.getSprite(2).tile === 7, 'wrote=' + wrote);
  ok('OAM: 座標 / 調色盤 / 翻轉都寫對', ppu.getSprite(1).x === 30 && ppu.getSprite(1).y === 40);
  ok('OAM: 未用槽 y = 240（隱藏）', ppu.getSprite(3).y === 240 && ppu.getSprite(63).y === 240,
     ppu.getSprite(3).y + '/' + ppu.getSprite(63).y);

  ppu = mkPpu(); oam = SH.OAM(ppu, {});
  oam.begin();
  oam.add(S(0, 0, 40, 4)); oam.add(S(0, 0, 10, 1)); oam.add(S(0, 0, 30, 3)); oam.add(S(0, 0, 0, 0));
  oam.end();
  ok('OAM: prio 排序（0 最高 → 4 最低）',
     [0, 1, 2, 3].map(i => ppu.getSprite(i).tile).join(',') === '0,10,30,40',
     [0, 1, 2, 3].map(i => ppu.getSprite(i).tile).join(','));
  ppu = mkPpu(); oam = SH.OAM(ppu, {});
  oam.begin();
  oam.add(S(0, 0, 1, 2)); oam.add(S(0, 0, 2, 2)); oam.add(S(0, 0, 3, 2));
  oam.end();
  ok('OAM: 同 prio 第一幀維持加入順序（穩定排序）',
     [0, 1, 2].map(i => ppu.getSprite(i).tile).join(',') === '1,2,3');

  // reserve
  ppu = mkPpu();
  const oamR = SH.OAM(ppu, { reserve: 4 });
  for (let i = 0; i < 4; i++) ppu.sprite(i, { x: i, y: 8, tile: 99, pal: 0 });
  oamR.begin(); oamR.add(S(11, 12, 21, 0)); oamR.add(S(13, 14, 22, 0)); oamR.end();
  ok('OAM: reserve 4 → 前 4 槽不動、從第 4 槽開始寫',
     ppu.getSprite(0).tile === 99 && ppu.getSprite(3).tile === 99 &&
     ppu.getSprite(4).tile === 21 && ppu.getSprite(5).tile === 22);
  ok('OAM: capacity = 64 - reserve', oamR.capacity === 60);

  // 12 顆同 prio 同一條掃描線：兩幀聯集全畫到
  ppu = mkPpu(); oam = SH.OAM(ppu, {});
  const LINE = 100, N12 = 12;
  const drawnAt = (frameSprites) => {
    // PPU 每線只畫前 8 個（flickerStep = 0 ⇒ 起點固定 0）
    const out = [];
    for (let i = 0; i < 64 && out.length < 8; i++) {
      const s = frameSprites[i];
      if (!s.on) continue;
      if (LINE >= s.y && LINE < s.y + 8) out.push(s.x);
    }
    return out;
  };
  const feed = () => {
    oam.begin();
    for (let i = 0; i < N12; i++) oam.add(S(16 + i * 8, LINE, 1, 3));
    oam.end();
  };
  feed(); const f1 = drawnAt(ppu.oam);
  feed(); const f2 = drawnAt(ppu.oam);
  const uni = new Set(f1.concat(f2));
  ok('OAM: 同一線 12 顆時每幀只畫得下 8 顆', f1.length === 8 && f2.length === 8,
     f1.length + '/' + f2.length);
  ok('OAM: 兩幀畫的不是同一組（每幀輪替起點）', f1.join(',') !== f2.join(','),
     'f1=' + f1.join(' ') + ' | f2=' + f2.join(' '));
  ok('OAM: 同 prio 12 顆 → 連續兩幀的聯集涵蓋全部 12 顆', uni.size === N12,
     '聯集 ' + uni.size + ' 顆：' + [...uni].sort((a, b) => a - b).join(' '));
  feed(); feed(); feed(); feed();
  ok('OAM: 連續輪替不會漏（4 幀後每顆都被畫過）',
     (() => { const seen = new Set(); for (let k = 0; k < 6; k++) { feed(); drawnAt(ppu.oam).forEach(x => seen.add(x)); } return seen.size === N12; })());

  // 超過 64 顆
  ppu = mkPpu(); oam = SH.OAM(ppu, { max: 128 });
  oam.begin();
  for (let i = 0; i < 80; i++) oam.add(S((i * 3) & 255, (i * 2) % 200, 1, 2));
  wrote = oam.end();
  ok('OAM: 80 顆 → 寫 64 顆、dropped = 16', wrote === 64 && oam.dropped === 16,
     'used=' + wrote + ' dropped=' + oam.dropped);
  ok('OAM: dropped 不含被略過的越界精靈', oam.skipped === 0);

  // 越界略過
  ppu = mkPpu(); oam = SH.OAM(ppu, {});
  oam.begin();
  ok('OAM: y = 240 → add 回 false（略過）', oam.add(S(10, 240, 1, 0)) === false);
  ok('OAM: y = 250 → 略過', oam.add(S(10, 250, 1, 0)) === false);
  ok('OAM: y = 239 → 收下', oam.add(S(10, 239, 1, 0)) === true);
  ok('OAM: x = 256 → 略過', oam.add(S(256, 10, 1, 0)) === false);
  ok('OAM: x = -20 → 略過（完全在左邊界外）', oam.add(S(-20, 10, 1, 0)) === false);
  ok('OAM: x = -4 → 收下（半出畫面）', oam.add(S(-4, 10, 1, 0)) === true);
  ok('OAM: skipped 計數 = 4', oam.skipped === 4, oam.skipped);
  wrote = oam.end();
  ok('OAM: 略過的不佔 OAM 槽', wrote === 2 && oam.n === 2);
  oam.begin();
  ok('OAM: begin() 清空 n / dropped / skipped',
     oam.n === 0 && oam.dropped === 0 && oam.skipped === 0);
  oam.end();
  ok('OAM: 空的一幀會把 64 槽全部藏起來', ppu.getSprite(0).y === 240 && ppu.getSprite(63).y === 240);

  // OAM DMA 預算
  const tm = NES.Timing.create({});
  const ppuB = mkPpu();
  ppuB.budget = tm.budget;
  tm.budget.clear();
  const oamB = SH.OAM(ppuB, {});
  let oamOver = 0;
  for (let f = 0; f < 60; f++) {
    tm.budget.reset();
    oamB.begin();
    for (let i = 0; i < 40; i++) oamB.add(S((i * 5) & 255, (i * 4) % 200, 1, i & 3));
    oamB.end();
    if (tm.budget.over) oamOver++;
  }
  ok('OAM: 60 幀寫滿 64 槽也不超 OAM DMA 預算（256 byte）',
     oamOver === 0 && tm.budget.oamUsed === 256,
     'over=' + oamOver + ' oamUsed=' + tm.budget.oamUsed + ' ppuUsed=' + tm.budget.used);
  ok('OAM: 不會動到名稱表通道', tm.budget.used === 0, tm.budget.used);
  throws('OAM: 沒有 ppu → throw', () => SH.OAM(null, {}), '需要 NES.PPU');

  // ======================================================== ⑧ Scroller
  const tileAt = (c, r) => ((c * 7 + r * 13) & 255);
  const attrAt = (c16, r16) => ((c16 + r16) & 3);
  const mkScr = (opt) => {
    const p = NES.PPU.create(null, { scale: 1 });
    p.setBackdrop(0x0F);
    const o = Object.assign({ nt: 2, cols: 384, tileAt: tileAt, attrAt: attrAt }, opt || {});
    return { ppu: p, sc: SH.Scroller(p, o) };
  };
  let e1 = mkScr();
  e1.ppu.mirroring('h');
  const resetBytes = e1.sc.reset(0);
  ok("Scroller: reset 會設成垂直鏡像 'v'（左右兩張不同）", e1.ppu.mirroring() === 'v', e1.ppu.mirroring());
  ok('Scroller: reset 回傳 byte 數 = 64×30 + 32×15', resetBytes === 64 * 30 + 32 * 15, resetBytes);
  let mism = 0, amis = 0;
  for (let c = 0; c < 64; c++) {
    const nt = (c >> 5) & 1, col = c & 31;
    for (let r = 0; r < 30; r++) if (e1.ppu.getTile(nt, col, r) !== tileAt(c, r)) mism++;
  }
  for (let c16 = 0; c16 < 32; c16++) {
    const nt = (c16 >> 4) & 1, col16 = c16 & 15;
    for (let r16 = 0; r16 < 15; r16++) if (e1.ppu.getAttr(nt, col16, r16) !== attrAt(c16, r16)) amis++;
  }
  ok('Scroller: reset 後兩張名稱表 64 欄 × 30 列與 tileAt 完全一致', mism === 0, mism + ' 格不符');
  ok('Scroller: reset 後 32×15 個屬性區塊與 attrAt 完全一致', amis === 0, amis + ' 塊不符');
  ok('Scroller: colBytes 偶數欄 45 / 奇數欄 30',
     e1.sc.colBytes(0) === 45 && e1.sc.colBytes(1) === 30,
     e1.sc.colBytes(0) + '/' + e1.sc.colBytes(1));

  // nt 0/1 交替
  let e2 = mkScr({ tileAt: (c, r) => (c & 255), attrAt: null });
  e2.sc.reset(0);
  ok('Scroller: 世界欄 0..31 → nt0、32..63 → nt1（水平串接）',
     e2.ppu.getTile(0, 0, 0) === 0 && e2.ppu.getTile(0, 31, 0) === 31 &&
     e2.ppu.getTile(1, 0, 0) === 32 && e2.ppu.getTile(1, 31, 0) === 63,
     [e2.ppu.getTile(0, 31, 0), e2.ppu.getTile(1, 0, 0)].join(','));

  // 600 幀串流 + budget
  const tm2 = NES.Timing.create({});
  const e3 = mkScr();
  e3.ppu.budget = tm2.budget;
  e3.sc.reset(0);
  tm2.budget.clear();
  let maxBytes = 0, overFrames = 0, framesWithWrite = 0;
  for (let f = 0; f < 600; f++) {
    tm2.budget.reset();
    const b = e3.sc.update(f);                       // 相機 1 px/幀
    if (b > maxBytes) maxBytes = b;
    if (b > 0) framesWithWrite++;
    if (tm2.budget.over) overFrames++;
  }
  ok('Scroller: 600 幀每幀寫入 ≤ 45 byte', maxBytes <= 45, '尖峰 ' + maxBytes + ' byte');
  ok('Scroller: 600 幀 timing.budget 完全不超支',
     overFrames === 0 && tm2.budget.overFrames === 0 && tm2.budget.over === false,
     'over=' + overFrames + ' budget.overFrames=' + tm2.budget.overFrames + ' peak=' + tm2.budget.peak);
  ok('Scroller: 1 px/幀 → 每 8 幀補 1 欄（600 幀共 45 欄，reset 已預先補到第 64 欄）',
     framesWithWrite === 45, framesWithWrite + ' 幀有寫入、next=' + e3.sc.next);
  let mism2 = 0;
  const first600 = 599 >> 3;
  for (let c = first600; c <= first600 + 32; c++) {
    const nt = (c >> 5) & 1, col = c & 31;
    for (let r = 0; r < 30; r++) if (e3.ppu.getTile(nt, col, r) !== tileAt(c, r)) mism2++;
  }
  ok('Scroller: 600 幀後畫面可見的 33 欄內容與 tileAt 一致', mism2 === 0, mism2 + ' 格不符');
  ok('Scroller: next 欄跑在相機前面（有 lead）', e3.sc.next > first600 + 32, 'next=' + e3.sc.next);
  ok('Scroller: pending() = 0（沒有落後）', e3.sc.pending(599) === 0, e3.sc.pending(599));

  const backBytes = e3.sc.update(300);
  ok('Scroller: camX 回退不寫任何 byte', backBytes === 0);
  const sameBytes = e3.sc.update(599);
  ok('Scroller: camX 不動不重複寫', sameBytes === 0);

  // rows 選項（把下方 4 列留給 HUD）
  const e4 = mkScr({ row0: 0, rows: 26 });
  ok('Scroller: rows=26 時一欄 = 26 + 13 = 39 byte', e4.sc.colBytes(0) === 39, e4.sc.colBytes(0));
  e4.sc.reset(0);
  let hudDirty = 0;
  for (let c = 0; c < 64; c++) {
    const nt = (c >> 5) & 1, col = c & 31;
    for (let r = 26; r < 30; r++) if (e4.ppu.getTile(nt, col, r) !== 0) hudDirty++;
  }
  ok('Scroller: rows=26 不會碰到列 26..29（HUD 區）', hudDirty === 0, hudDirty + ' 格被蓋掉');

  // 相機瞬移
  const e5 = mkScr();
  e5.sc.reset(0);
  const jump = e5.sc.update(2000);
  ok('Scroller: 相機瞬移後不會回頭補舊欄（next 跟上）',
     e5.sc.next >= (2000 >> 3) && jump <= 45, 'next=' + e5.sc.next + ' bytes=' + jump);
  ok('Scroller: cols 上限生效（不會寫超過關卡長度）',
     (() => { const e = mkScr({ cols: 70 }); e.sc.reset(0); let mx = 0; for (let f = 0; f < 400; f++) mx = Math.max(mx, e.sc.update(f)); return e.sc.next <= 70; })(),
     'cols=70');
  throws('Scroller: 沒有 tileAt → throw', () => SH.Scroller(NES.PPU.create(null, {}), { nt: 2 }), 'tileAt');
  throws('Scroller: nt !== 2 → throw', () => SH.Scroller(NES.PPU.create(null, {}), { nt: 4, tileAt: tileAt }), 'nt 只支援 2');
  throws('Scroller: 沒有 ppu → throw', () => SH.Scroller(null, { tileAt: tileAt }), '需要 NES.PPU');

  // ======================================================== ⑨ Spawner
  let log = [];
  const mkTable = () => ([
    { col: 10, fn: (ctx) => { ctx.log.push('a'); } },
    { col: 10, fn: (ctx) => { ctx.log.push('b'); } },
    { col: 20, fn: (ctx) => { ctx.log.push('c'); } },
    { col: 35, fn: (ctx) => { ctx.log.push('d'); } }
  ]);
  const ctx = { log: log };
  const sp1 = SH.Spawner(mkTable());
  ok('Spawner: 還沒到 col 不觸發', sp1.update(9, ctx) === 0 && log.length === 0);
  ok('Spawner: 到 col 10 → 同欄兩筆都觸發', sp1.update(10, ctx) === 2 && log.join('') === 'ab', log.join(''));
  ok('Spawner: 同一欄再跑一次不重觸發', sp1.update(10, ctx) === 0 && log.join('') === 'ab');
  ok('Spawner: 相機倒退不重觸發', sp1.update(3, ctx) === 0 && log.join('') === 'ab');
  ok('Spawner: 一幀跨多欄 → 中間的全部觸發', sp1.update(40, ctx) === 2 && log.join('') === 'abcd', log.join(''));
  ok('Spawner: 全部觸發後 remaining = 0', sp1.remaining() === 0 && sp1.fired === 4);
  log.length = 0;
  sp1.reset();
  ok('Spawner: reset 後可以重新觸發', sp1.update(100, ctx) === 4 && log.join('') === 'abcd');
  log.length = 0;
  const sp2 = SH.Spawner(mkTable());
  sp2.seek(20);
  ok('Spawner: seek(20) 把 ≤ 20 的標成已觸發但不執行', log.length === 0 && sp2.remaining() === 1);
  ok('Spawner: seek 之後只剩 col 35 會觸發', sp2.update(35, ctx) === 1 && log.join('') === 'd');
  log.length = 0;
  const sp3 = SH.Spawner([
    { col: 50, fn: (c) => c.log.push('z') },
    { col: 5, fn: (c) => c.log.push('y') }
  ]);
  ok('Spawner: 表沒排好也會自動排序', sp3.update(5, ctx) === 1 && log.join('') === 'y');
  let gotCol = -1, gotCtx = null;
  const sp4 = SH.Spawner([{ col: 7, fn: (c, col) => { gotCtx = c; gotCol = col; } }]);
  sp4.update(7, ctx);
  ok('Spawner: fn(ctx, col, entry) 參數正確', gotCtx === ctx && gotCol === 7, gotCol);
  throws('Spawner: table 不是陣列 → throw', () => SH.Spawner(null), 'table');
  throws('Spawner: 缺 fn → throw', () => SH.Spawner([{ col: 1 }]), '需要');

  // ======================================================== ⑩ Timer / every
  ok('every: 每 4 幀一次', SH.every(0, 4) && !SH.every(1, 4) && SH.every(8, 4));
  ok('every: phase 可錯開', !SH.every(0, 4, 2) && SH.every(2, 4, 2));
  const tmr = SH.Timer(3);
  ok('Timer: 每 3 幀 tick 一次',
     [tmr.tick(), tmr.tick(), tmr.tick(), tmr.tick()].join(',') === 'false,false,true,false');
  ok('clamp / inRect', SH.clamp(9, 0, 5) === 5 && SH.inRect(3, 3, { x: 0, y: 0, w: 4, h: 4 }) &&
     !SH.inRect(4, 3, { x: 0, y: 0, w: 4, h: 4 }));

  return R;
}
"""

# ---------------------------------------------------------------- 真的 render 一次，驗軟體 sprite cycling
RENDER_JS = r"""
() => {
  const SH = NES.SH;
  const rows = (ch) => [ch.repeat(8), ch.repeat(8), ch.repeat(8), ch.repeat(8),
                        ch.repeat(8), ch.repeat(8), ch.repeat(8), ch.repeat(8)];
  const bank = NES.CHR.bank('sh_test', { blank: rows('.'), solid: rows('1') });
  NES.CHR.setPattern(0, 'sh_test');
  NES.CHR.setPattern(1, 'sh_test');
  const ppu = NES.PPU.create(null, { scale: 1 });
  ppu.flickerStep = 0;                       // 軟體 sprite cycling
  ppu.setBackdrop(0x0F);
  ppu.setBgPalette(0, [0x01, 0x11, 0x21]);
  ppu.setSprPalette(0, [0x21, 0x11, 0x01]);
  ppu.setPatternTables(0, 1);
  const SOLID = bank.index('solid');
  const oam = SH.OAM(ppu, {});
  const LINE = 100, N = 12, X0 = 16, DX = 8;
  const s = { x: 0, y: LINE, tile: SOLID, pal: 0, prio: 3 };
  const frames = [];
  for (let f = 0; f < 3; f++) {
    oam.begin();
    for (let i = 0; i < N; i++) { s.x = X0 + i * DX; oam.add(s); }
    oam.end();
    ppu.render();
    ppu.endFrame();
    const hit = [];
    for (let i = 0; i < N; i++) {
      const px = X0 + i * DX + 4;
      if (ppu.indexFrame[(LINE + 4) * 256 + px] === 0x21) hit.push(i);
    }
    frames.push({ hit: hit, maxLine: ppu.stats.maxSpritesLine, dropped: ppu.stats.dropped });
  }
  const union = new Set(frames[0].hit.concat(frames[1].hit));
  return {
    f0: frames[0].hit, f1: frames[1].hit, union: [...union].sort((a, b) => a - b),
    maxLine: frames[0].maxLine, dropped: frames[0].dropped
  };
}
"""

PERF_JS = r"""
(n) => {
  const SH = NES.SH;
  const ppu = NES.PPU.create(null, { scale: 1 });
  ppu.flickerStep = 0;
  ppu.setBackdrop(0x0F);
  const oam = SH.OAM(ppu, { reserve: 4 });
  const sc = SH.Scroller(ppu, {
    nt: 2, cols: 4096,
    tileAt: (c, r) => ((c * 3 + r) & 255),
    attrAt: (c16, r16) => ((c16 ^ r16) & 3)
  });
  sc.reset(0);
  const pool = SH.Pool(64, (i) => ({ i: i, x: 0, y: 0, w: 4, h: 4 }));
  const s = { x: 0, y: 0, tile: 1, pal: 0, prio: 0 };
  const t0 = performance.now();
  for (let f = 0; f < n; f++) {
    sc.update(f);
    oam.begin();
    for (let i = 0; i < 40; i++) { s.x = (i * 6 + f) & 255; s.y = (i * 5) % 200; s.prio = i & 3; oam.add(s); }
    oam.end();
    for (let i = 0; i < 4; i++) { const o = pool.alloc(); if (o) { o.x = f; } }
    pool.each(o => { if ((o.x + f) % 7 === 0) o.alive = false; });
    SH.aim(0, 0, (f * 3) & 255, (f * 7) & 255, 512);
  }
  const ms = performance.now() - t0;
  return { ms: ms, per: ms / n, bytes: sc.bytes, used: oam.used };
}
"""


def _strip(src):
    """把註解與字串字面量清掉（保留行數），只留真正的程式碼。"""
    def nl(m):
        return "\n" * m.group(0).count("\n")
    out = re.sub(r"/\*.*?\*/", nl, src, flags=re.S)
    out = re.sub(r"//[^\n]*", "", out)
    out = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", out)
    out = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', out)
    return out


def source_checks():
    """靜態檢查 shmup.js 原始碼：零相依、執行期不用 Math 三角函數。"""
    src = (ENGINE / "shmup.js").read_text(encoding="utf-8")
    code = _strip(src)
    lines = code.split("\n")
    out = []

    out.append({"name": "原始碼: 'use strict' + classic script IIFE",
                "ok": "'use strict'" in src and src.lstrip().startswith("/*"),
                "detail": ""})
    # 零相依：除了 window.NES 命名空間之外不引用其他 NES.* 模組
    deps = sorted(set(re.findall(r"NES\.(PPU|CHR|FX|Input|Timing|APU|Music|Lint|PALETTE)\b", code)))
    out.append({"name": "原始碼: 零相依（不引用其他 NES.* 模組）",
                "ok": not deps, "detail": ("引用了 " + ",".join(deps)) if deps else ""})

    out.append({"name": "原始碼: 執行期不用 Math.atan2",
                "ok": "Math.atan2" not in code, "detail": ""})
    # Math.* 只能出現在載入時的建表區（buildTrig / buildAtan，都在 atan2() 定義之前）
    limit = next(i for i, ln in enumerate(lines) if ln.startswith("  function atan2("))
    bad = [i + 1 for i, ln in enumerate(lines) if "Math." in ln and i > limit]
    out.append({"name": "原始碼: Math.* 只出現在載入時的建表區（執行期純查表）",
                "ok": not bad, "detail": ("第 " + ",".join(map(str, bad)) + " 行") if bad else
                      "建表區在第 %d 行以前" % limit})
    # 每個 prototype / 頂層函式上面都有 JSDoc 一行（用原始碼，註解還在）
    raw = src.split("\n")
    missing = []
    for i, ln in enumerate(raw):
        m = re.match(r"^  (?:function (\w+)|(\w+)\.prototype\.(\w+) =)", ln)
        if not m:
            continue
        name = m.group(1) or (m.group(2) + "." + m.group(3))
        prev = raw[i - 1].strip()
        if not (prev.startswith("/**") or prev.startswith("*/") or prev.startswith("*")):
            missing.append(name)
    out.append({"name": "原始碼: 每個函式都有 JSDoc 一行",
                "ok": not missing, "detail": ("缺：" + ",".join(missing)) if missing else ""})
    out.append({"name": "原始碼: 檔頭說明提到 flickerStep = 0 與 45 byte 預算",
                "ok": "flickerStep" in src[:2600] and "45" in src[:2600], "detail": ""})
    return out


def main():
    headed = "--headed" in sys.argv
    results = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        page = browser.new_page(viewport={"width": 800, "height": 600})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.goto("about:blank")
        page.set_content("<body style='margin:0'></body>")
        for f in LOAD:
            page.add_script_tag(path=str(ENGINE / f))

        results.append({"name": "載入: 依契約順序載入 %d 個 engine 檔 0 例外" % len(LOAD),
                        "ok": page.evaluate("() => !!(window.NES && NES.SH && NES.PPU && NES.Timing)"),
                        "detail": " ".join(LOAD)})

        results += page.evaluate(TESTS_JS)

        rr = page.evaluate(RENDER_JS)
        results.append({"name": "render: 12 顆同線精靈每幀只畫 8 顆（PPU 每線 8 上限）",
                        "ok": len(rr["f0"]) == 8 and rr["maxLine"] == 12 and rr["dropped"] == 32,
                        "detail": "畫了 %d 顆 maxSpritesLine=%d PPU 丟棄 %d 個精靈-掃描線"
                                  % (len(rr["f0"]), rr["maxLine"], rr["dropped"])})
        results.append({"name": "render: indexFrame 實測 — 兩幀聯集畫齊 12 顆（軟體 sprite cycling）",
                        "ok": len(rr["union"]) == 12,
                        "detail": "f0=%s f1=%s 聯集=%d" % (rr["f0"], rr["f1"], len(rr["union"]))})
        results.append({"name": "render: 兩幀畫的是不同組（真的有輪替）",
                        "ok": rr["f0"] != rr["f1"], "detail": ""})

        perf = page.evaluate(PERF_JS, 600)
        results.append({"name": "效能: 600 幀（Scroller + 40 精靈 OAM + Pool + aim）< 200ms",
                        "ok": perf["ms"] < 200,
                        "detail": "%.1f ms（每幀 %.4f ms）" % (perf["ms"], perf["per"])})

        results += source_checks()

        results.append({"name": "頁面無 JS 例外", "ok": not errors,
                        "detail": " | ".join(errors[:5])})
        browser.close()

    passed = sum(1 for r in results if r["ok"])
    failed = [r for r in results if not r["ok"]]
    for r in results:
        line = "  [%s] %s" % ("PASS" if r["ok"] else "FAIL", r["name"])
        if r["detail"]:
            line += "   — " + r["detail"]
        print(line)
    print("")
    print("總計 %d / %d 通過" % (passed, len(results)))
    if failed:
        print("失敗：")
        for r in failed:
            print("  - %s %s" % (r["name"], r["detail"]))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
