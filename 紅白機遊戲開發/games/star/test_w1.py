# -*- coding: utf-8 -*-
"""《星塵勇者》W1 世界層（star-world）自動驗證：四關地圖 / 磚語意 / 可達性 / 敵人 / 魔王 / 預算 / lint。

作法：Playwright(Chromium) 開 about:blank，`add_script_tag` 只載入
  engine/palette.js + fixed.js + input.js + cpu_timing.js + chr.js + ppu.js + nes_lint.js
  （+ engine/shmup.js，有就用 NES.SH）
與本 agent 自己的四個檔（chr_world / levels_w1 / enemies / boss）——**不依賴 star-hero 的 main.js**，
HUD 字型 / 主角精靈用 64 + 128 個空白磚假造，驗證合併後索引仍落在契約區間（bg 64.. / spr 128..）。

用法：
    ../卡比之星/.venv/bin/python games/star/test_w1.py [-v]
    ../卡比之星/.venv/bin/python games/star/test_w1.py --shots shots/star_world
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

可達性模型（對照 docs/ENGINE_API.md §3 的 SMB 常數）：
  站立格 → 可走 / 跳 4 格高（64 px = 8 列）/ 跨 5 格寬（80 px = 10 欄）/ 落下任意高。
  ⇒ 坑寬上限 9 欄（起跳格與落地格之間 dc = 10）、牆高上限 8 列。
"""
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
SHOTS = None
if '--shots' in sys.argv:
    SHOTS = ROOT / sys.argv[sys.argv.index('--shots') + 1]

ENGINE = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js', 'ppu.js', 'nes_lint.js', 'shmup.js']
GAME = ['chr_world.js', 'levels_w1.js', 'enemies.js', 'boss.js']
IDS = ['1-1', '1-2', '1-3', '1-4']
SCREENS = {'1-1': 12, '1-2': 10, '1-3': 12, '1-4': 8}
THEMES = {'1-1': 'ground', '1-2': 'cave', '1-3': 'sky', '1-4': 'castle'}

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r want=%r' % (got, want)))


def near(name, got, lo, hi, detail=''):
    ok(name, lo <= got <= hi, detail or ('got=%r 期望 %r..%r' % (got, lo, hi)))


# ---------------------------------------------------------------- 頁面 harness
SETUP = r"""
() => {
  function blanks(n, pre) {
    const rows = ['........','........','........','........','........','........','........','........'];
    const o = {};
    for (let i = 0; i < n; i++) o[pre + i] = rows;
    return o;
  }
  // 假造 star-hero 的份額：背景 0..63（HUD 字型）、精靈 0..127（主角）
  const bg  = NES.CHR.bank('st_bg',  Object.assign({}, blanks(64, 'HUD_'),  ST.BG_WORLD));
  const spr = NES.CHR.bank('st_spr', Object.assign({}, blanks(128, 'HERO_'), ST.SPR_WORLD));
  NES.CHR.setPattern(0, bg);
  NES.CHR.setPattern(1, spr);
  ST.World.bind(bg, spr);
  ST.Levels.rebind();

  const canvas = document.getElementById('nes');
  const timing = NES.Timing.create({ update: function () {}, draw: function () {} });
  const ppu = NES.PPU.create(canvas, { scale: 3 });
  ppu.budget = timing.budget;
  ppu.setPatternTables(0, 1);
  ppu.spriteMode(16);
  ppu.flickerStep = 0;
  window.__h = { bg: bg, spr: spr, ppu: ppu, timing: timing };

  // ---- 簡易 OAM 收集器（engine/shmup.js 沒有時的退路）--------------------
  window.__oam = (NES.SH && NES.SH.OAM) ? NES.SH.OAM(ppu, { reserve: 0 })
    : (function () {
        const list = [];
        return { begin(){ list.length = 0; }, add(s){ list.push(Object.assign({}, s)); return true; },
                 end(){ return list.length; }, get n(){ return list.length; }, list: list };
      })();

  // ---- 畫一關（名稱表串流 + 敵人 + 魔王）----------------------------------
  window.__render = function (id, camX, frames, withSprites) {
    const L = ST.LEVELS[id];
    camX = camX | 0; frames = frames | 0;
    ST.World.applyPalettes(ppu, L.theme);
    ppu.setBgPalette(0, [0x0F, 0x10, 0x30]);      // HUD（暫代 star-hero）
    ppu.setSprPalette(0, [0x0F, 0x16, 0x27]);     // 主角（暫代）
    ppu.clearSprites();
    const scr = ST.Scroll.create(ppu, L);
    scr.reset(camX);
    ST.Enemies.init(L);
    ST.Enemies.seek(Math.max(0, camX - 8));
    if (L.boss) ST.Boss.init(L);
    const g = { camX: camX, level: L, hero: null };
    for (let f = 0; f < frames; f++) {
      ST.Enemies.update(g);
      if (L.boss) ST.Boss.update(g);
    }
    // 上段 HUD 固定、下段跟著相機（同 games/demo 的分割寫法）
    ppu.scroll(0, 0, 0);
    ppu.split(32, { x: camX % 512, y: 32, nt: 0 });
    if (withSprites !== false) {
      __oam.begin();
      ST.Enemies.draw(__oam);
      if (L.boss) ST.Boss.draw(__oam);
      __oam.end();
    }
    ppu.render();
    return { camX: camX, enemies: ST.Enemies.count, theme: L.theme };
  };

  return {
    bgTiles: bg.tiles.length, sprTiles: spr.tiles.length,
    bgFirst: bg.index('BG_EMPTY'), sprFirst: spr.index('W_ROLL0_L'),
    worldBg: ST.World.bgTiles, worldSpr: ST.World.sprTiles,
    hasSH: !!(window.NES && NES.SH && NES.SH.Scroller)
  };
}
"""

# ---------------------------------------------------------------- 可達性 BFS
BFS = r"""
(id) => {
  const L = ST.LEVELS[id], cols = L.cols, ROWS = L.rows, TOP = 4;
  const HERO_ROWS = 3;                       // 主角 22 px ≈ 3 列
  const MAXUP = 8, SPAN_LOW = 10, SPAN_HIGH = 8, MAXDOWN = 24;
  const solid = new Uint8Array(ROWS * cols), stand = new Uint8Array(ROWS * cols);
  let c, r, k;
  for (r = 0; r < ROWS; r++) for (c = 0; c < cols; c++) {
    k = ST.solidKind(L.tileAt(c, r));
    solid[r * cols + c] = (k === 'solid' || k === 'slopeL' || k === 'slopeR') ? 1 : 0;
  }
  for (r = 0; r < ROWS; r++) for (c = 0; c < cols; c++) {
    k = ST.solidKind(L.tileAt(c, r));
    if (k !== 'solid' && k !== 'oneway') continue;
    if (r - HERO_ROWS < TOP) continue;                     // 站上去會頂到 HUD 區
    let good = true;
    for (let y = r - HERO_ROWS; y <= r - 1; y++) {
      if (solid[y * cols + c]) { good = false; break; }
      if (ST.solidKind(L.tileAt(c, y)) === 'hurt') { good = false; break; }
    }
    if (good) stand[r * cols + c] = 1;
  }
  const W = cols + 1, pre = new Int32Array(ROWS * W);
  for (r = 0; r < ROWS; r++) for (c = 0; c < cols; c++) pre[r * W + c + 1] = pre[r * W + c] + solid[r * cols + c];
  const rowClear = (y, c0, c1) => (y < 0 ? false : (y >= ROWS ? true : pre[y * W + c1 + 1] - pre[y * W + c0] === 0));
  function edgeOk(cA, rA, cB, rB) {
    const up = rA - rB, dc = Math.abs(cB - cA);
    if (up > MAXUP || -up > MAXDOWN) return false;
    if (dc > (up <= 4 ? SPAN_LOW : SPAN_HIGH)) return false;
    const top = Math.min(rA, rB) - 1, c0 = Math.min(cA, cB), c1 = Math.max(cA, cB);
    for (let y = top - (HERO_ROWS - 1); y <= top; y++) if (!rowClear(y, c0, c1)) return false;
    return true;
  }
  const seen = new Uint8Array(ROWS * cols), q = [];
  const sc = L.start.x >> 3, sr = L.surfaceRow(sc);
  if (sr >= ROWS || !stand[sr * cols + sc]) return { err: 'start 不可站立 col=' + sc + ' row=' + sr };
  seen[sr * cols + sc] = 1; q.push(sr * cols + sc);
  for (let head = 0; head < q.length; head++) {
    const id0 = q[head], rA = (id0 / cols) | 0, cA = id0 % cols;
    for (let dc = -SPAN_LOW; dc <= SPAN_LOW; dc++) {
      const cB = cA + dc; if (cB < 0 || cB >= cols) continue;
      for (let dr = -MAXUP; dr <= MAXDOWN; dr++) {
        const rB = rA + dr; if (rB < 0 || rB >= ROWS) continue;
        const idB = rB * cols + cB;
        if (!stand[idB] || seen[idB] || !edgeOk(cA, rA, cB, rB)) continue;
        seen[idB] = 1; q.push(idB);
      }
    }
  }
  const colRow = (col) => { for (let rr = 0; rr < ROWS; rr++) if (seen[rr * cols + col]) return rr; return -1; };
  let maxCol = -1;
  for (c = 0; c < cols; c++) if (colRow(c) >= 0) maxCol = c;

  // ---- 地形度量：坑寬（無任何可站立面）/ 牆高（實心地板的落差）-----------
  const G = L.groundRow;
  const standCol = [], floorCol = [];
  for (c = 0; c < cols; c++) {
    let s = -1, f = -1;
    for (r = 14; r < ROWS; r++) { const kk = ST.solidKind(L.tileAt(c, r)); if (kk === 'solid' || kk === 'oneway') { s = r; break; } }
    for (r = G - 8; r < ROWS; r++) { if (ST.solidKind(L.tileAt(c, r)) === 'solid') { f = r; break; } }
    standCol.push(s); floorCol.push(f);
  }
  let pit = 0, run = 0, pitAt = -1;
  for (c = 0; c <= L.goal.col; c++) {
    if (standCol[c] < 0) { run++; if (run > pit) { pit = run; pitAt = c - run + 1; } } else run = 0;
  }
  let wall = 0, wallAt = -1;
  for (c = 0; c + 1 <= L.goal.col; c++) {
    if (floorCol[c] < 0 || floorCol[c + 1] < 0) continue;
    const up = floorCol[c] - floorCol[c + 1];
    if (up > wall) { wall = up; wallAt = c; }
  }
  // 起點安全區：無坑 / 無害磚
  let safeBad = -1;
  for (c = 0; c < Math.min(L.safeCols, cols); c++) {
    if (standCol[c] < 0) { safeBad = c; break; }
    for (r = TOP; r < ROWS; r++) if (ST.solidKind(L.tileAt(c, r)) === 'hurt') { safeBad = c; break; }
    if (safeBad >= 0) break;
  }
  const groundKinds = { roller: 1, bouncer: 1 };
  const badSpawns = L.spawns.filter(s => groundKinds[s.kind] && colRow(s.col) < 0).map(s => s.col);
  return {
    nodes: q.length, maxCol: maxCol, goalCol: L.goal.col, goalReached: maxCol >= L.goal.col,
    cps: L.checkpoints.map(cp => ({ col: cp, row: colRow(cp) })),
    pit: pit, pitAt: pitAt, wall: wall, wallAt: wallAt, safeBad: safeBad,
    badSpawns: badSpawns,
    firstSpawnCol: L.spawns.length ? Math.min.apply(null, L.spawns.map(s => s.col)) : 1e9
  };
}
"""

SCAN = r"""
(id) => {
  const L = ST.LEVELS[id], bg = window.__h.bg;
  let badTile = null, badChr = null, badAttr = null, lowChr = null;
  const used = {};
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
    const t = L.tileAt(c, r);
    if (!(t >= 0 && t < ST.TILE_COUNT)) { badTile = badTile || [c, r, t]; continue; }
    used[t] = (used[t] || 0) + 1;
    const ix = L.chrAt(c, r);
    if (!(ix >= 0 && ix < bg.tiles.length)) badChr = badChr || [c, r, t, ix];
    if (r >= 4 && ix < 64) lowChr = lowChr || [c, r, t, ix];
  }
  for (let r16 = 0; r16 < L.rows16; r16++) for (let c16 = 0; c16 < L.cols16; c16++) {
    const a = L.attrAt(c16, r16);
    if (!(a >= 0 && a <= 3)) badAttr = badAttr || [c16, r16, a];
  }
  return {
    badTile, badChr, badAttr, lowChr,
    kinds: Object.keys(used).length, coins: L.coins, enemies: L.enemies,
    cols: L.cols, theme: L.theme, music: L.music, safeCols: L.safeCols,
    checkpoints: L.checkpoints, goal: L.goal, start: L.start,
    spawnKinds: L.spawns.map(s => s.kind),
    hasBoss: !!L.boss, hasAxe: !!L.axe
  };
}
"""

SCROLL_BUDGET = r"""
(id) => {
  const L = ST.LEVELS[id], ppu = window.__h.ppu, b = window.__h.timing.budget;
  ST.World.applyPalettes(ppu, L.theme);
  const scr = ST.Scroll.create(ppu, L);
  b.mute = true; scr.reset(0); b.mute = false;
  b.clear();
  let camX = 0, peak = 0, over = 0, mismatch = null;
  const spd = 2.5;                      // 相機最快 = 主角全速 2.5 px/幀
  for (let f = 0; f < 400; f++) {
    b.reset();
    camX = Math.min(L.cols * 8 - 256, Math.round(f * spd));
    scr.update(camX);
    ppu.scroll(0, 0, 0);
    ppu.split(32, { x: camX % 512, y: 32, nt: 0 });
    if (b.used > peak) peak = b.used;
    if (b.over) over++;
  }
  // 名稱表內容要跟 chrAt 一致（抽查相機附近 3 欄）
  const base = camX >> 3;
  for (let i = 0; i < 3 && !mismatch; i++) {
    const c = base + i, ntc = c & 63, nt = (ntc >> 5) & 1, col = ntc & 31;
    for (let r = 4; r < 30; r++) {
      const got = ppu.getTile ? ppu.getTile(nt, col, r) : null;
      if (got === null) break;
      if (got !== L.chrAt(c, r)) { mismatch = [c, r, got, L.chrAt(c, r)]; break; }
    }
  }
  return { peak, over, camX, bytes: scr.bytes, mismatch, limit: b.limit };
}
"""

LINT = r"""
(id) => {
  __render(id, Math.floor(ST.LEVELS[id].cols * 8 * 0.45), 40, true);
  const res = NES.Lint.frame(window.__h.ppu);
  return { ok: res.ok, colors: res.colors, bad: res.badPixels || 0, errors: res.errors || [], max: NES.Lint.maxColors };
}
"""


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 900, 'height': 760})
        page.on('pageerror', lambda e: print('  [pageerror]', e))
        page.goto('about:blank')
        page.set_content('<canvas id="nes"></canvas>')
        for f in ENGINE:
            p = ROOT / 'engine' / f
            if p.exists() and p.stat().st_size > 8:
                page.add_script_tag(path=str(p))
        for f in GAME:
            page.add_script_tag(path=str(ROOT / 'games' / 'star' / f))
        info = page.evaluate(SETUP)
        try:
            body(page, info)
        finally:
            if SHOTS:
                shoot(page)
            browser.close()


# ---------------------------------------------------------------- 測試本體
def body(page, info):
    print('[① CHR 合併與契約區間]')
    ok('chr_world 載入（BG_WORLD / SPR_WORLD 都在）', info['worldBg'] > 30 and info['worldSpr'] > 60,
       'bg=%s spr=%s' % (info['worldBg'], info['worldSpr']))
    ok('精靈磚 ≤ 128（契約：精靈表 128..255）', info['worldSpr'] <= 128, info['worldSpr'])
    ok('背景磚 ≤ 192（契約：背景表 64..255）', info['worldBg'] <= 192, info['worldBg'])
    eq('合併後背景第一個世界磚 = 64', info['bgFirst'], 64)
    eq('合併後精靈第一個世界磚 = 128', info['sprFirst'], 128)
    ok('合併後背景 bank ≤ 256 磚', info['bgTiles'] <= 256, info['bgTiles'])
    ok('合併後精靈 bank ≤ 256 磚', info['sprTiles'] <= 256, info['sprTiles'])
    ok('engine/shmup.js（NES.SH.Scroller）可用', info['hasSH'], info['hasSH'])

    print('[② 磚語意 ST.TILE / ST.solidKind]')
    K = page.evaluate(r"""
    () => {
      const need = ['EMPTY','GROUND','BRICK','QBLOCK','USED','PLATFORM','SPIKE','PIPE_TL','COIN','GOAL','LAVA','SLOPE_L','SLOPE_R'];
      const miss = need.filter(k => ST.TILE[k] === undefined);
      const kinds = {}; let badKind = null;
      for (let t = 0; t < ST.TILE_COUNT; t++) {
        const k = ST.solidKind(t);
        if (['solid','oneway','hurt','none','slopeL','slopeR'].indexOf(k) < 0) badKind = badKind || [t, k];
        kinds[k] = (kinds[k] || 0) + 1;
      }
      const T = ST.TILE;
      return { miss, badKind, kinds,
        solids: [T.GROUND,T.DIRT,T.BRICK,T.QBLOCK,T.USED,T.BLOCK,T.PIPE_TL,T.PIPE_TR,T.PIPE_BL,T.PIPE_BR,T.BRIDGE].map(ST.solidKind),
        oneways: [T.PLATFORM,T.PLAT_L,T.PLAT_R].map(ST.solidKind),
        hurts: [T.SPIKE,T.LAVA].map(ST.solidKind),
        nones: [T.EMPTY,T.COIN,T.GOAL,T.FLAG,T.AXE,T.CHAIN,T.CLOUD_L,T.BUSH,T.STAR_S,T.STAL,T.WINDOW].map(ST.solidKind),
        slopes: [ST.solidKind(T.SLOPE_L), ST.solidKind(T.SLOPE_R)],
        oob: [ST.solidKind(-1), ST.solidKind(999), ST.solidKind(ST.TILE_COUNT)]
      };
    }""")
    eq('ST.TILE 契約欄位齊全', K['miss'], [])
    eq('solidKind 只回傳 6 種合法值', K['badKind'], None)
    ok('solid 類 11 種全部 = solid', all(k == 'solid' for k in K['solids']), K['solids'])
    ok('單向平台 3 種 = oneway', all(k == 'oneway' for k in K['oneways']), K['oneways'])
    ok('尖刺 / 熔岩 = hurt', K['hurts'] == ['hurt', 'hurt'], K['hurts'])
    ok('金幣 / 旗桿 / 斧 / 裝飾 = none', all(k == 'none' for k in K['nones']), K['nones'])
    eq('斜坡 = slopeL / slopeR', K['slopes'], ['slopeL', 'slopeR'])
    ok('超出範圍的磚 → none（不會 throw）', all(k == 'none' for k in K['oob']), K['oob'])

    print('[③ 四關地圖合法性]')
    scans = {}
    for lid in IDS:
        s = page.evaluate(SCAN, lid)
        scans[lid] = s
        eq('%s 畫面數' % lid, s['cols'] // 32, SCREENS[lid])
        eq('%s 主題' % lid, s['theme'], THEMES[lid])
        eq('%s tileAt 全域合法（無越界語意碼）' % lid, s['badTile'], None)
        eq('%s chrAt 全落在 bank 內' % lid, s['badChr'], None)
        eq('%s 地形磚索引 ≥ 64（不侵犯 HUD 字型區）' % lid, s['lowChr'], None)
        eq('%s attrAt 全在 0..3' % lid, s['badAttr'], None)
        ok('%s 金幣 ≥ 30' % lid, s['coins'] >= 30, s['coins'])
        ok('%s 檢查點 ≥ 1' % lid, len(s['checkpoints']) >= 1, s['checkpoints'])

    ec = [scans[i]['enemies'] for i in IDS]
    ok('敵人數依難度曲線遞增 1-1 < 1-2 < 1-3 < 1-4', ec[0] < ec[1] < ec[2] < ec[3], ec)
    ok('三種敵人都用上（roller / bouncer / flyer）',
       set(k for i in IDS for k in scans[i]['spawnKinds']) == {'roller', 'bouncer', 'flyer'})
    ok('1-4 有魔王與斧頭機關', scans['1-4']['hasBoss'] and scans['1-4']['hasAxe'])
    ok('1-1~1-3 沒有魔王', not any(scans[i]['hasBoss'] for i in IDS[:3]))

    print('[④ 可達性 BFS（跳 4 格高 / 跨 5 格寬 / 落下任意高）]')
    for lid in IDS:
        b = page.evaluate(BFS, lid)
        if b.get('err'):
            ok('%s BFS 起點合法' % lid, False, b['err'])
            continue
        ok('%s 起點 → GOAL 存在跳躍可達路徑' % lid, b['goalReached'],
           'maxCol=%s goal=%s nodes=%s' % (b['maxCol'], b['goalCol'], b['nodes']))
        ok('%s 每個檢查點都可達' % lid, all(c['row'] >= 0 for c in b['cps']), b['cps'])
        ok('%s 坑寬 ≤ 9 欄（72 px < 5 格跑跳）' % lid, b['pit'] <= 9, 'pit=%s @col %s' % (b['pit'], b['pitAt']))
        ok('%s 牆高 ≤ 8 列（64 px = 4 格跳）' % lid, b['wall'] <= 8, 'wall=%s @col %s' % (b['wall'], b['wallAt']))
        ok('%s 起點安全區無坑 / 無害磚' % lid, b['safeBad'] < 0, 'safeCols=%s bad@%s' % (scans[lid]['safeCols'], b['safeBad']))
        ok('%s 起點安全區內無敵人' % lid, b['firstSpawnCol'] >= scans[lid]['safeCols'],
           'first=%s safe=%s' % (b['firstSpawnCol'], scans[lid]['safeCols']))
        ok('%s 地面敵人都站在可達地形上' % lid, b['badSpawns'] == [], b['badSpawns'])
    ok('1-1 教學關的安全區 = 3 畫面（96 欄）', scans['1-1']['safeCols'] == 96, scans['1-1']['safeCols'])

    print('[⑤ 敵人行為]')
    E = page.evaluate(r"""
    () => {
      const L = ST.LEVELS['1-1'], C = ST.Enemies.CONST, out = {};
      const g = { camX: 0, level: L };
      // ---- roller：撞牆轉向 + 速度 ----
      ST.Enemies.init(L);
      const gy = L.groundRow * 8;
      const e = ST.Enemies.spawn('roller', 64 * 8 - 20, gy - 14, { dir: 1 });   // 往右撞 c=64 的管子
      const x0 = e.x, dirs = [];
      for (let f = 0; f < 60; f++) { ST.Enemies.update(g); dirs.push(e.dir); }
      out.rollerTurned = dirs[dirs.length - 1] === -1 && dirs[0] === 1;
      out.rollerSpeed = C.SPD_ROLL;
      // 速度：無阻礙處量 60 幀位移
      ST.Enemies.init(L);
      const e2 = ST.Enemies.spawn('roller', 8 * 8, gy - 14, { dir: 1 });
      const sx = e2.x;
      for (let f = 0; f < 60; f++) ST.Enemies.update(g);
      out.rollerDx = e2.x - sx;
      out.rollerGround = e2.onGround;
      // ---- roller 坑邊不掉（edge:true）----
      ST.Enemies.init(L);
      const e3 = ST.Enemies.spawn('roller', 120 * 8, gy - 14, { dir: 1, edge: true });   // 124 起是坑
      for (let f = 0; f < 200; f++) ST.Enemies.update(g);
      out.edgeAlive = e3.alive && e3.y < 240;
      ST.Enemies.init(L);
      const e4 = ST.Enemies.spawn('roller', 120 * 8, gy - 14, { dir: 1, edge: false });
      for (let f = 0; f < 200; f++) ST.Enemies.update(g);
      out.noEdgeFell = !e4.alive;
      // ---- bouncer 週期 ----
      ST.Enemies.init(L);
      const b = ST.Enemies.spawn('bouncer', 16 * 8, gy - 14, {});
      const ys = []; let air = 0, launches = 0, wasGround = true;
      for (let f = 0; f < 200; f++) {
        ST.Enemies.update(g);
        if (wasGround && !b.onGround) launches++;
        wasGround = b.onGround;
        ys.push(b.y);
      }
      out.bouncerLaunches = launches;
      out.bouncerRise = Math.max(...ys) - Math.min(...ys);
      out.bouncerPeriod = C.BOUNCE_PERIOD;
      out.bouncerStompable = b.stompable;
      // 踩了停 60 幀
      ST.Enemies.stomp(b);
      out.bouncerStun = b.stun;
      const yStun = b.y;
      let stunLaunch = 0, wasG = b.onGround;
      for (let f = 0; f < 50; f++) { ST.Enemies.update(g); if (wasG && !b.onGround) stunLaunch++; wasG = b.onGround; }
      // 暈眩中只會往下掉（落地後靜止），絕不會再起跳
      out.bouncerStillStunned = b.stun > 0 && stunLaunch === 0 && b.y >= yStun;
      for (let f = 0; f < 20; f++) ST.Enemies.update(g);
      out.bouncerRecovered = b.stun === 0 && b.alive;
      // ---- flyer 正弦 ----
      ST.Enemies.init(L);
      const fl = ST.Enemies.spawn('flyer', 200 * 8, 120, {});
      const fy = [], fx0 = fl.x;
      for (let f = 0; f < 128; f++) { ST.Enemies.update(g); fy.push(fl.y); }
      out.flyAmp = (Math.max(...fy) - Math.min(...fy)) / 2;
      out.flyDx = fl.x - fx0;
      out.flyStompable = fl.stompable;
      out.flyStompRejected = ST.Enemies.stomp(fl) === false;
      // ---- 壓扁 30 幀 ----
      ST.Enemies.init(L);
      const r5 = ST.Enemies.spawn('roller', 16 * 8, gy - 14, {});
      ST.Enemies.stomp(r5);
      out.squash0 = r5.squash;
      for (let f = 0; f < 29; f++) ST.Enemies.update(g);
      out.squashAlive29 = r5.alive;
      ST.Enemies.update(g);
      out.squashGone30 = !r5.alive;
      // ---- 無敵星撞 → 死亡飛出 ----
      ST.Enemies.init(L);
      const r6 = ST.Enemies.spawn('roller', 16 * 8, gy - 14, {});
      ST.Enemies.kill(r6);
      out.dying = r6.dying;
      for (let f = 0; f < 200; f++) ST.Enemies.update(g);
      out.dyingRecycled = !r6.alive;
      // ---- 池子上限 ----
      ST.Enemies.init(L);
      let made = 0;
      for (let i = 0; i < 30; i++) if (ST.Enemies.spawn('roller', 16 * 8 + i * 20, gy - 14, {})) made++;
      out.poolMax = made;
      out.poolFullNull = ST.Enemies.spawn('roller', 0, 0, {}) === null;
      // ---- 出畫面右 16 px 啟動 ----
      ST.Enemies.init(L);
      ST.Enemies.update({ camX: 0, level: L });
      out.spawnAtCam0 = ST.Enemies.count;
      ST.Enemies.update({ camX: 104 * 8 - 256 - C.SPAWN_MARGIN, level: L });
      out.spawnAtEdge = ST.Enemies.count;
      // ---- 掉出畫面回收 ----
      ST.Enemies.init(L);
      const r7 = ST.Enemies.spawn('roller', 126 * 8, 100, {});     // 坑正上方
      for (let f = 0; f < 300; f++) ST.Enemies.update(g);
      out.fellRecycled = !r7.alive;
      return out;
    }""")
    ok('roller 撞牆轉向', E['rollerTurned'])
    near('roller 速度 0.5 px/幀（60 幀 ≈ 30 px）', E['rollerDx'], 29, 31, E['rollerDx'])
    ok('roller 會落到地面上', E['rollerGround'])
    ok('roller edge:true 在坑邊轉向不掉下去', E['edgeAlive'])
    ok('roller edge:false 會掉進坑並回收', E['noEdgeFell'])
    near('bouncer 200 幀內起跳 3 次（週期 60 幀）', E['bouncerLaunches'], 3, 4, E['bouncerLaunches'])
    near('bouncer 彈跳高度 = 4 格 64 px（vy −4 + SMB gHold，同主角靜止跳）', E['bouncerRise'], 60, 68, E['bouncerRise'])
    ok('bouncer 可踩', E['bouncerStompable'])
    eq('bouncer 踩了停 60 幀', E['bouncerStun'], 60)
    ok('bouncer 暈眩期間不再起跳', E['bouncerStillStunned'])
    ok('bouncer 60 幀後恢復（沒死）', E['bouncerRecovered'])
    near('flyer 正弦振幅 ±24 px', E['flyAmp'], 22, 26, E['flyAmp'])
    near('flyer x 向左 0.75 px/幀（128 幀 ≈ −96 px）', E['flyDx'], -98, -94, E['flyDx'])
    ok('flyer 不可踩（stompable = false）', E['flyStompable'] is False)
    ok('flyer 踩下去不會被壓扁', E['flyStompRejected'])
    eq('roller 踩扁 = 30 幀', E['squash0'], 30)
    ok('壓扁第 29 幀還在', E['squashAlive29'])
    ok('壓扁第 30 幀消失', E['squashGone30'])
    ok('無敵星撞 → 死亡飛出', E['dying'])
    ok('死亡飛出後掉出畫面回收', E['dyingRecycled'])
    eq('物件池上限 12', E['poolMax'], 12)
    ok('池子滿了 alloc 回 null（不生成）', E['poolFullNull'])
    eq('相機在起點時 1-1 還沒有敵人（安全區）', E['spawnAtCam0'], 0)
    ok('相機推進到「敵人在畫面右 16 px」時啟動', E['spawnAtEdge'] >= 1, E['spawnAtEdge'])
    ok('掉出畫面底部的敵人被回收', E['fellRecycled'])

    print('[⑥ 魔王「鐵鎚王」]')
    B = page.evaluate(r"""
    () => {
      const L = ST.LEVELS['1-4'], out = {};
      const T = ST.TILE;
      ST.Boss.init(L);
      out.axe = ST.Boss.axe ? { x: ST.Boss.axe.x, y: ST.Boss.axe.y } : null;
      out.initDead = ST.Boss.dead;
      out.maxHp = ST.Boss.MAX_HP;
      // 啟動：相機推到魔王房
      const camX = L.boss.x - 200;
      let g = { camX: camX, level: L, hero: { x: L.boss.x - 60, y: 160, w: 12, h: 22, vy: 0 } };
      ST.Boss.update(g);
      out.active = ST.Boss.active;
      // 行為循環
      const phases = [];
      for (let f = 0; f < 400; f++) { ST.Boss.update(g); if (phases[phases.length - 1] !== ST.Boss.phase) phases.push(ST.Boss.phase); }
      out.phases = phases;
      out.cycle = ['walk','jump','throw','rest'].every(p => phases.indexOf(p) >= 0);
      // 丟錘：一輪 3 顆、間隔 20 幀
      ST.Boss.reset(); ST.Boss.init(L); ST.Boss.update(g);
      ST.Boss.phase = 'throw'; ST.Boss.t = 0; ST.Boss.throws = 0;
      const ts = [];
      for (let f = 0; f < 80; f++) { const n0 = ST.Boss.throws; ST.Boss.update(g); if (ST.Boss.throws > n0) ts.push(f); }
      out.throwFrames = ts;
      out.throwCount = ts.length;
      out.throwGap = ts.length >= 2 ? ts[1] - ts[0] : -1;
      out.hammersFly = ST.Boss.hammers.count > 0;
      // 踩頭 3 次
      ST.Boss.reset(); ST.Boss.init(L); ST.Boss.update(g);
      const hps = [];
      out.stomp1 = ST.Boss.stomp(); hps.push(ST.Boss.hp); out.inv1 = ST.Boss.inv;
      out.stompDuringInv = ST.Boss.stomp();               // 無敵中再踩無效
      for (let f = 0; f < 61; f++) ST.Boss.update(g);
      out.stomp2 = ST.Boss.stomp(); hps.push(ST.Boss.hp);
      for (let f = 0; f < 61; f++) ST.Boss.update(g);
      out.stomp3 = ST.Boss.stomp(); hps.push(ST.Boss.hp);
      out.hps = hps;
      out.fallingAfter3 = ST.Boss.phase === 'falling';
      for (let f = 0; f < 240; f++) ST.Boss.update(g);
      out.deadAfterFall = ST.Boss.dead;
      // 斧頭：橋斷 + 魔王掉落（先記下橋的位置，測完原樣復原）
      ST.Boss.reset(); ST.Boss.init(L);
      const cells = [];
      for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) if (L.tileAt(c, r) === T.BRIDGE) cells.push([c, r]);
      out.bridgeBefore = cells.length;
      const ax = ST.Boss.axe;
      g = { camX: camX, level: L, hero: { x: ax.x, y: ax.y, w: 12, h: 22, vy: 0 } };
      ST.Boss.update(g);
      let bridgeAfter = 0;
      for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) if (L.tileAt(c, r) === T.BRIDGE) bridgeAfter++;
      out.bridgeAfter = bridgeAfter;
      out.axeTaken = ST.Boss.axe.taken;
      out.fallingAfterAxe = ST.Boss.phase === 'falling';
      for (let f = 0; f < 240; f++) ST.Boss.update(g);
      out.deadAfterAxe = ST.Boss.dead;
      // 復原地形（後面的預算 / lint / 截圖要用）
      for (const [c, r] of cells) L.setTile(c, r, T.BRIDGE);
      L.setTile(ax.col, ax.row, T.AXE);
      L.clearDirty();
      ST.Boss.reset(); ST.Boss.init(L);
      let restored = 0;
      for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) if (L.tileAt(c, r) === T.BRIDGE) restored++;
      out.restored = restored;
      return out;
    }""")
    ok('魔王房有斧頭機關', B['axe'] is not None, B['axe'])
    ok('init 之後 dead = false', B['initDead'] is False)
    eq('魔王 HP = 3（踩頭 3 次）', B['maxHp'], 3)
    ok('相機接近魔王房 → 啟動', B['active'])
    ok('行為循環含 walk / jump / throw / rest', B['cycle'], B['phases'][:8])
    eq('一輪丟 3 顆錘子', B['throwCount'], 3)
    eq('錘子間隔 20 幀', B['throwGap'], 20)
    ok('錘子飛出去（拋物線）', B['hammersFly'])
    ok('第 1 次踩頭成立', B['stomp1'])
    eq('踩頭後無敵 60 幀', B['inv1'], 60)
    ok('無敵期間再踩無效', B['stompDuringInv'] is False)
    eq('三次踩頭的 HP 變化', B['hps'], [2, 1, 0])
    ok('第 3 次踩頭 → 墜落', B['fallingAfter3'])
    ok('墜落後 ST.Boss.dead = true', B['deadAfterFall'])
    ok('橋存在（floor 的 R 段）', B['bridgeBefore'] >= 30, B['bridgeBefore'])
    eq('碰到斧頭 → 整座橋消失', B['bridgeAfter'], 0)
    ok('斧頭只能用一次', B['axeTaken'])
    ok('斧頭 → 魔王墜落', B['fallingAfterAxe'])
    ok('斧頭 → ST.Boss.dead = true', B['deadAfterAxe'])
    eq('setTile 可逆：橋復原回原本的格數', B['restored'], B['bridgeBefore'])

    print('[⑥b 斧頭 / 橋 / GOAL（R2b fix：碰斧頭不能把主角踩空）]')
    A = page.evaluate(r"""
    () => {
      const L = ST.LEVELS['1-4'], T = ST.TILE, out = {};
      // 橋的欄範圍
      let bMin = 1e9, bMax = -1;
      const cells = [];
      for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) {
        if (L.tileAt(c, r) === T.BRIDGE) { cells.push([c, r]); if (c < bMin) bMin = c; if (c > bMax) bMax = c; }
      }
      out.bridge = [bMin, bMax, cells.length];
      const ax = L.axe;
      out.axeCol = ax.col;
      out.axeOffBridge = ax.col > bMax;                       // 斧頭在橋外
      out.axeOnSolid = ST.solidKind(L.tileAt(ax.col, L.groundRow)) === 'solid';   // 斧頭腳下是實地
      out.axeTile = L.tileAt(ax.col, ax.row) === T.AXE;
      // GOAL 磚
      out.goalTile = L.tileAt(L.goal.col, L.goal.row) === T.GOAL;
      out.goalOnSolid = ST.solidKind(L.tileAt(L.goal.col, L.groundRow)) === 'solid';
      out.goalOffBridge = L.goal.col > bMax;
      // ① 站在斧頭上碰到斧頭 ⇒ 腳下仍是實地
      ST.Boss.reset(); ST.Boss.init(L);
      let g = { camX: L.boss.x - 200, level: L, hero: { x: ax.col * 8, y: ax.row * 8, w: 12, h: 22, vy: 0 } };
      ST.Boss.update(g);
      out.axeTaken1 = ST.Boss.axe.taken;
      out.feetSolid1 = ST.solidKind(L.tileAt(ax.col, L.groundRow)) === 'solid';
      out.bossDying1 = ST.Boss.phase === 'falling' || ST.Boss.dead;
      let left1 = 0;
      for (const [c, r] of cells) if (L.tileAt(c, r) === T.BRIDGE) left1++;
      out.bridgeGone = left1 === 0;                            // 斧頭在橋外 ⇒ 整座橋都拆掉
      for (const [c, r] of cells) L.setTile(c, r, T.BRIDGE);
      L.setTile(ax.col, ax.row, T.AXE); L.clearDirty();
      // ② 保險絲：主角站在橋中央時 breakBridge(keepCol) 必須留下他那一欄
      ST.Boss.reset(); ST.Boss.init(L);
      const mid = (bMin + bMax) >> 1;
      ST.Boss.breakBridge(mid);
      out.keptMid = ST.solidKind(L.tileAt(mid, L.groundRow)) === 'solid';
      out.keptNeighbours = ST.solidKind(L.tileAt(mid - 1, L.groundRow)) === 'solid'
        && ST.solidKind(L.tileAt(mid + 1, L.groundRow)) === 'solid';
      let left2 = 0;
      for (const [c, r] of cells) if (L.tileAt(c, r) === T.BRIDGE) left2++;
      out.keptOnly3 = left2 === 3;                             // 只留主角那一欄 + 左右各一
      // 復原
      for (const [c, r] of cells) L.setTile(c, r, T.BRIDGE);
      L.setTile(ax.col, ax.row, T.AXE); L.clearDirty();
      ST.Boss.reset(); ST.Boss.init(L);
      let back = 0;
      for (const [c, r] of cells) if (L.tileAt(c, r) === T.BRIDGE) back++;
      out.restored = back === cells.length;
      return out;
    }""")
    ok('1-4 斧頭在橋外（col %s > 橋尾 %s）' % (A['axeCol'], A['bridge'][1]), A['axeOffBridge'], A['bridge'])
    ok('1-4 斧頭腳下是實地（不是橋）', A['axeOnSolid'])
    ok('1-4 斧頭磚存在', A['axeTile'])
    ok('1-4 goal 欄有 GOAL 磚', A['goalTile'])
    ok('1-4 GOAL 站在實地上、在橋外', A['goalOnSolid'] and A['goalOffBridge'])
    ok('站在斧頭上觸發 → 斧頭被取走', A['axeTaken1'])
    ok('觸發斧頭後主角腳下仍是實地（不會踩空掉熔岩）', A['feetSolid1'])
    ok('觸發斧頭 → 魔王墜落', A['bossDying1'])
    ok('斧頭在橋外時整座橋都會斷', A['bridgeGone'])
    ok('breakBridge(keepCol) 保留主角那一欄', A['keptMid'])
    ok('breakBridge(keepCol) 也保留左右各一欄', A['keptNeighbours'])
    ok('breakBridge(keepCol) 只留 3 欄、其餘都斷', A['keptOnly3'])
    ok('測試後橋已復原', A['restored'])

    print('[⑦ 捲動串流與 VBlank 預算]')
    for lid in IDS:
        S = page.evaluate(SCROLL_BUDGET, lid)
        eq('%s 400 幀捲動 budget.over = 0' % lid, S['over'], 0)
        ok('%s 單幀寫入 ≤ 45 byte（一欄 26 + 屬性 13）' % lid, S['peak'] <= 45,
           'peak=%s limit=%s' % (S['peak'], S['limit']))
        eq('%s 名稱表內容與 chrAt 一致' % lid, S['mismatch'], None)

    print('[⑧ 跨模組整合介面（star-hero 的 main.js 走的是通用碰撞路徑）]')
    I = page.evaluate(r"""
    () => {
      const L = ST.LEVELS['1-1'], gy = L.groundRow * 8, out = {};
      ST.Enemies.init(L);
      const r = ST.Enemies.spawn('roller', 16 * 8, gy - 14, {});
      out.hasStomp = typeof r.stomp === 'function';
      out.hasHit = typeof r.hit === 'function';
      out.instStomp = r.stomp() === true && r.squash === 30;      // 壓扁而不是瞬間消失
      const b = ST.Enemies.spawn('bouncer', 20 * 8, gy - 14, {});
      out.instStompBouncer = b.stomp() === true && b.stun === 60;  // 暈眩而不是死
      const f = ST.Enemies.spawn('flyer', 30 * 8, 120, {});
      out.flyerNotStompable = f.stompable === false;
      out.instHit = f.hit() === true && f.dying === true;
      // each(ctx, fn)（main.js 的呼叫法）與 each(fn) 都要能走
      let n1 = 0, n2 = 0;
      ST.Enemies.each(e => { n1++; });
      ST.Enemies.each({}, e => { n2++; });
      out.eachBoth = n1 > 0 && n1 === n2;
      out.eachBad = ST.Enemies.each({}, null) === 0;               // 傳錯不會 throw
      // 魔王也要出現在 each 裡（main 的碰撞迴圈只走 ST.Enemies）
      const L4 = ST.LEVELS['1-4'];
      ST.Enemies.init(L4); ST.Boss.init(L4);
      const g = { camX: L4.boss.x - 200, level: L4, hero: { x: L4.boss.x - 60, y: 160, w: 12, h: 22, vy: 0 } };
      ST.Boss.update(g);
      let sawBoss = false, sawHammer = false;
      ST.Enemies.each({}, e => { if (e.kind === 'boss') sawBoss = true; if (e.kind === 'hammer') sawHammer = true; });
      out.eachHasBoss = sawBoss;
      out.bossBox = !!(ST.Boss.box() && ST.Boss.box().w === 28);
      out.bossStompable = ST.Boss.stompable === true;
      out.bossHitIsStomp = ST.Boss.hit() === true && ST.Boss.hp === 2;
      ST.Boss.phase = 'throw'; ST.Boss.t = 0; ST.Boss.throws = 0;
      for (let i = 0; i < 25; i++) ST.Boss.update(g);
      ST.Enemies.each({}, e => { if (e.kind === 'hammer') sawHammer = true; });
      out.eachHasHammer = sawHammer;
      let hammerNotStompable = true;
      ST.Boss.hammers.each(h => { if (h.stompable !== false || typeof h.hit !== 'function') hammerNotStompable = false; });
      out.hammerNotStompable = hammerNotStompable;
      // 墜落中的魔王不再吃碰撞
      ST.Boss.die();
      let stillListed = false;
      ST.Enemies.each({}, e => { if (e.kind === 'boss') stillListed = true; });
      out.fallingBossNotListed = !stillListed;
      ST.Boss.reset(); ST.Enemies.init(L);
      return out;
    }""")
    ok('敵人物件自帶 stomp()', I['hasStomp'])
    ok('敵人物件自帶 hit()（TASKS 契約）', I['hasHit'])
    ok('e.stomp() 讓岩球壓扁 30 幀（不是直接消失）', I['instStomp'])
    ok('e.stomp() 讓彈跳球暈 60 幀（不是直接死）', I['instStompBouncer'])
    ok('flyer.stompable = false（main 會改判受傷）', I['flyerNotStompable'])
    ok('e.hit() = 死亡飛出', I['instHit'])
    ok('each(fn) 與 each(ctx, fn) 兩種呼叫法都可用', I['eachBoth'])
    ok('each 傳錯參數不會 throw', I['eachBad'])
    ok('魔王會出現在 ST.Enemies.each（main 才打得到）', I['eachHasBoss'])
    ok('ST.Boss.box() 回傳 28×30 碰撞框', I['bossBox'])
    ok('ST.Boss.stompable = true', I['bossStompable'])
    ok('ST.Boss.hit() = 踩頭一次（HP 3 → 2）', I['bossHitIsStomp'])
    ok('錘子會出現在 each 且不可踩', I['eachHasHammer'] and I['hammerNotStompable'])
    ok('墜落中的魔王不再被列舉（不會被重複踩）', I['fallingBossNotListed'])

    print('[⑨ lint：各主題 ≤ 25 色 / 64 色調色盤]')
    for lid in IDS:
        Lr = page.evaluate(LINT, lid)
        ok('%s lint 通過（%s 色 / 上限 %s）' % (lid, Lr['colors'], Lr['max']), Lr['ok'], Lr['errors'])
        ok('%s 同屏色數 ≤ 25' % lid, Lr['colors'] <= 25, Lr['colors'])
        eq('%s 沒有非 NES 64 色的像素' % lid, Lr['bad'], 0)


# ---------------------------------------------------------------- 截圖
def shoot(page):
    SHOTS.mkdir(parents=True, exist_ok=True)
    shots = [('1-1', 0.30, 'w1_1-1_ground.png'), ('1-2', 0.42, 'w1_1-2_cave.png'),
             ('1-3', 0.50, 'w1_1-3_sky.png'), ('1-4', 0.35, 'w1_1-4_castle.png'),
             ('1-4', 0.86, 'w1_1-4_boss.png')]
    for lid, frac, name in shots:
        cam = page.evaluate("([id, f]) => Math.max(0, Math.min(ST.LEVELS[id].cols * 8 - 256, Math.floor(ST.LEVELS[id].cols * 8 * f)))", [lid, frac])
        page.evaluate("([id, cam]) => __render(id, cam, 90, true)", [lid, cam])
        data = page.evaluate("() => document.getElementById('nes').toDataURL('image/png')")
        (SHOTS / name).write_bytes(base64.b64decode(data.split(',', 1)[1]))
        print('  截圖 %s（camX=%s）' % (SHOTS / name, cam))


if __name__ == '__main__':
    try:
        run()
    except Exception as exc:   # noqa: BLE001
        print('環境錯誤：%r' % (exc,))
        raise SystemExit(2)
    bad = [r for r in results if not r[0]]
    print('\n================ star-world W1 測試 ================')
    print('共 %d 項，通過 %d，失敗 %d' % (len(results), len(results) - len(bad), len(bad)))
    for c, n, d in bad:
        print('  FAIL %s  — %s' % (n, d))
    print('總結：%s' % ('PASS' if not bad else 'FAIL'))
    raise SystemExit(1 if bad else 0)
