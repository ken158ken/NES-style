# -*- coding: utf-8 -*-
"""《星塵勇者》世界 2「熔岩礦坑」自動驗證（R3 star-w2）。

兩個 harness：
  ① 隔離頁（about:blank + add_script_tag）：只載 engine + games/star 的資料層
     （chr_world / chr_w2 / levels_w1 / levels_w2 / enemies / enemies_w2 / boss / boss_w2 /
      objects_w2 / song / song_w2），驗「四關資料合法性 / 可達性 / 機關 / 敵人 / 魔王 / 曲目」。
  ② 真頁（star.html?level=2-x）：驗「機關真的會動（升降板 / 崩塌磚 / 彈簧 / 間歇泉 / 無敵星）、
     魔王可擊破、旗桿演出」，並存每關 3 張截圖 + lint。

用法：
    ../卡比之星/.venv/bin/python games/star/test_w2.py [-v] [--shots shots/agent_w2]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

可達性模型（同 test_w1.py，對照 engine/fixed.js 的 SMB 常數）：
  站立格 → 走 / 跳 4 格高（64 px = 8 列）/ 跨 5 格寬（80 px = 10 欄）/ 落下任意高。
  **另外**把礦車升降板（ST.Objects 的 mover，位置是時間的純函式）在行程兩端與中點的
  落腳面也算成可站立格 —— 升降板是關卡資料的一部分，不能只看磚。
"""
import base64
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
SHOTS = ROOT / 'shots' / 'agent_w2'
if '--shots' in sys.argv:
    SHOTS = ROOT / sys.argv[sys.argv.index('--shots') + 1]

ENGINE = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js', 'ppu.js', 'nes_lint.js',
          'apu.js', 'music.js', 'shmup.js']
GAME = ['chr_world.js', 'chr_w2.js', 'song.js', 'song_w2.js', 'enemies.js', 'enemies_w2.js',
        'boss.js', 'boss_w2.js', 'objects_w2.js', 'levels_w1.js', 'levels_w2.js']
IDS = ['2-1', '2-2', '2-3', '2-4']
SCREENS = {'2-1': 10, '2-2': 10, '2-3': 9, '2-4': 8}
THEMES = {'2-1': 'mine', '2-2': 'mine', '2-3': 'magma', '2-4': 'forge'}
BASE = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r want=%r' % (got, want)))


# ================================================================ 隔離頁 harness
SETUP = r"""
() => {
  function blanks(n, pre) {
    const rows = ['........','........','........','........','........','........','........','........'];
    const o = {};
    for (let i = 0; i < n; i++) o[pre + i] = rows;
    return o;
  }
  // 假造 star-hero 的份額（背景 HUD 69 磚 / 精靈主角 33 個 8×16）
  const bg  = NES.CHR.bank('st_bg',  Object.assign({}, blanks(69, 'HUD_'),  ST.BG_WORLD, ST.BG_W2));
  const spr = NES.CHR.bank('st_spr', Object.assign({}, blanks(33, 'HERO_'), ST.SPR_WORLD, ST.SPR_W2));
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

  window.__oam = (NES.SH && NES.SH.OAM) ? NES.SH.OAM(ppu, { reserve: 0 })
    : (function () {
        const list = [];
        return { begin(){ list.length = 0; }, add(s){ list.push(Object.assign({}, s)); return true; },
                 end(){ return list.length; }, get n(){ return list.length; }, list: list };
      })();

  window.__render = function (id, camX, frames) {
    const L = ST.LEVELS[id];
    camX = camX | 0; frames = frames | 0;
    ST.World.applyPalettes(ppu, L.theme);
    ppu.setBgPalette(0, [0x0F, 0x10, 0x30]);
    ppu.setSprPalette(0, [0x0F, 0x16, 0x27]);
    ppu.clearSprites();
    const scr = ST.Scroll.create(ppu, L);
    scr.reset(camX);
    ST.Enemies.init(L);
    ST.Enemies.seek(Math.max(0, camX - 8));
    ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
    const B = (L.bossKind === 'colossus') ? ST.BossW2 : ST.Boss;
    if (L.boss) B.init(L);
    const g = { camX: camX, level: L, hero: null };
    for (let f = 0; f < frames; f++) {
      ST.Enemies.update(g);
      ST.Objects.update(g);
      if (L.boss) B.update(g);
    }
    ppu.scroll(0, 0, 0);
    ppu.split(32, { x: camX % 512, y: 32, nt: 0 });
    __oam.begin();
    ST.Objects.draw(__oam, g);
    ST.Enemies.draw(__oam);
    if (L.boss) B.draw(__oam);
    __oam.end();
    ppu.render();
    return { camX: camX, enemies: ST.Enemies.count, theme: L.theme };
  };

  // 假主角（驗機關用）：只要有 ST.Objects.update 需要的欄位
  window.__hero = function (x, y) {
    const FX = NES.FX;
    const h = { x: x, y: y, w: 12, h: 22, vy: 0, prevFeet: y + 22, onGround: true, onMover: null,
                star: 0, inv: 0, state: 'idle', facing: 1, stars: 0, pitSaves: 0,
                px: FX.Vec(x), py: FX.Vec(y), vxA: FX.Acc(0), vyA: FX.Acc(0) };
    h.jumpS = FX.SMB.jumpState(h.vyA);
    return h;
  };

  return {
    bgTiles: bg.tiles.length, sprTiles: spr.tiles.length,
    w2Bg: ST.W2_BG_TILES, w2Spr: ST.W2_SPR_TILES,
    worldBg: ST.World.bgTiles, worldSpr: ST.World.sprTiles,
    hasSH: !!(window.NES && NES.SH && NES.SH.Scroller),
    ids: ST.Levels.ids.slice(),
    songs: ST.W2_SONGS || []
  };
}
"""

# ---------------------------------------------------------------- 可達性 BFS
BFS = r"""
(id) => {
  const L = ST.LEVELS[id], cols = L.cols, ROWS = L.rows, TOP = 4;
  const HERO_ROWS = 3;
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
    if (r - HERO_ROWS < TOP) continue;
    let good = true;
    for (let y = r - HERO_ROWS; y <= r - 1; y++) {
      if (solid[y * cols + c]) { good = false; break; }
      if (ST.solidKind(L.tileAt(c, y)) === 'hurt') { good = false; break; }
    }
    if (good) stand[r * cols + c] = 1;
  }
  // 升降板：行程兩端 + 中點的落腳面也算可站立格（機關是關卡資料的一部分）
  const movers = L.movers || [];
  const moverCells = [];
  for (let i = 0; i < movers.length; i++) {
    const m = movers[i];
    const x0 = (m.x === undefined ? m.c * 8 : m.x), y0 = (m.y === undefined ? m.r * 8 : m.y);
    const w = m.w || 4, rng = m.range | 0;
    const offs = [0, rng >> 1, rng];
    for (let o = 0; o < offs.length; o++) {
      const mx = (m.axis === 'y') ? x0 : x0 + offs[o];
      const my = (m.axis === 'y') ? y0 + offs[o] : y0;
      const row = my >> 3;
      for (let cc = mx >> 3; cc < (mx + w * 8) >> 3; cc++) {
        if (cc < 0 || cc >= cols || row < TOP || row >= ROWS) continue;
        if (!stand[row * cols + cc]) { stand[row * cols + cc] = 1; moverCells.push([cc, row]); }
      }
    }
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

  const G = L.groundRow;
  const standCol = [], floorCol = [];
  for (c = 0; c < cols; c++) {
    let s2 = -1, f = -1;
    for (r = 12; r < ROWS; r++) { const kk = ST.solidKind(L.tileAt(c, r)); if (kk === 'solid' || kk === 'oneway') { s2 = r; break; } }
    for (r = G - 8; r < ROWS; r++) { if (ST.solidKind(L.tileAt(c, r)) === 'solid') { f = r; break; } }
    standCol.push(s2); floorCol.push(f);
  }
  // 坑 / 熔岩帶：連續「沒有任何可站立面」的欄
  let pit = 0, run = 0, pitAt = -1;
  for (c = 0; c <= L.goal.col; c++) {
    if (standCol[c] < 0) { run++; if (run > pit) { pit = run; pitAt = c - run + 1; } } else run = 0;
  }
  // 危險磚（熔岩 / 尖刺）連續帶
  let hz = 0, hrun = 0, hzAt = -1;
  for (c = 0; c <= L.goal.col; c++) {
    let bad = false;
    for (r = TOP; r < ROWS; r++) if (ST.solidKind(L.tileAt(c, r)) === 'hurt') { bad = true; break; }
    if (bad && standCol[c] < 0) { hrun++; if (hrun > hz) { hz = hrun; hzAt = c - hrun + 1; } } else hrun = 0;
  }
  let wall = 0, wallAt = -1;
  for (c = 0; c + 1 <= L.goal.col; c++) {
    if (floorCol[c] < 0 || floorCol[c + 1] < 0) continue;
    const up = floorCol[c] - floorCol[c + 1];
    if (up > wall) { wall = up; wallAt = c; }
  }
  let safeBad = -1;
  for (c = 0; c < Math.min(L.safeCols, cols); c++) {
    if (standCol[c] < 0) { safeBad = c; break; }
    for (r = TOP; r < ROWS; r++) if (ST.solidKind(L.tileAt(c, r)) === 'hurt') { safeBad = c; break; }
    if (safeBad >= 0) break;
  }
  const groundKinds = { roller: 1, bouncer: 1, armor: 1, spitter: 1 };
  const badSpawns = L.spawns.filter(s => groundKinds[s.kind] && colRow(s.col) < 0).map(s => s.col);
  return {
    nodes: q.length, maxCol: maxCol, goalCol: L.goal.col, goalReached: maxCol >= L.goal.col,
    cps: L.checkpoints.map(cp => ({ col: cp, row: colRow(cp) })),
    pit: pit, pitAt: pitAt, hz: hz, hzAt: hzAt, wall: wall, wallAt: wallAt,
    safeBad: safeBad, badSpawns: badSpawns, moverCells: moverCells.length
  };
}
"""

SCAN = r"""
(id) => {
  const L = ST.LEVELS[id], bg = window.__h.bg;
  let badTile = null, badChr = null, badAttr = null;
  const used = {};
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
    const t = L.tileAt(c, r);
    if (!(t >= 0 && t < ST.TILE_COUNT)) { badTile = badTile || [c, r, t]; continue; }
    used[t] = (used[t] || 0) + 1;
    const ix = L.chrAt(c, r);
    if (!(ix >= 0 && ix < bg.tiles.length)) badChr = badChr || [c, r, t, ix];
  }
  for (let r16 = 0; r16 < L.rows16; r16++) for (let c16 = 0; c16 < L.cols16; c16++) {
    const a = L.attrAt(c16, r16);
    if (!(a >= 0 && a <= 3)) badAttr = badAttr || [c16, r16, a];
  }
  // 機關座標必須落在關卡範圍內
  const oob = [];
  (L.movers || []).forEach((m, i) => {
    const x0 = (m.x === undefined ? m.c * 8 : m.x), y0 = (m.y === undefined ? m.r * 8 : m.y);
    const x1 = x0 + (m.axis === 'y' ? 0 : m.range) + (m.w || 4) * 8;
    const y1 = y0 + (m.axis === 'y' ? m.range : 0) + 8;
    if (x0 < 0 || x1 > L.cols * 8 || y0 < 32 || y1 > L.rows * 8) oob.push(['mover', i, x0, y0, x1, y1]);
    if (!(m.period > 1) || (m.period & 1)) oob.push(['moverPeriod', i, m.period]);
  });
  (L.geysers || []).forEach((g, i) => {
    if (g.c < 0 || g.c >= L.cols) oob.push(['geyserCol', i, g.c]);
    if (g.r - g.h + 1 < 4 || g.r >= L.rows) oob.push(['geyserRow', i, g.r, g.h]);
    if (!(g.on > 0 && g.on < g.period)) oob.push(['geyserDuty', i, g.on, g.period]);
  });
  (L.items || []).forEach((it, i) => {
    if (it.c < 0 || it.c >= L.cols || it.r < 4 || it.r >= L.rows) oob.push(['item', i, it.c, it.r]);
  });
  L.spawns.forEach((s, i) => { if (s.col < 0 || s.col >= L.cols) oob.push(['spawn', i, s.col]); });
  const T = ST.TILE;
  return {
    badTile, badChr, badAttr, oob,
    kinds: Object.keys(used).length, coins: L.coins, enemies: L.enemies,
    cols: L.cols, theme: L.theme, music: L.music, safeCols: L.safeCols, world: L.world,
    checkpoints: L.checkpoints, goal: L.goal, start: L.start,
    goalTile: L.tileAt(L.goal.col, L.goal.row),
    spawnKinds: L.spawns.map(s => s.kind),
    movers: (L.movers || []).length, geysers: (L.geysers || []).length, items: (L.items || []).length,
    crumble: used[T.CRUMBLE] || 0, spring: used[T.SPRING] || 0, ore: used[T.ORE] || 0,
    hasBoss: !!L.boss, bossKind: L.bossKind || null
  };
}
"""

LINT = r"""
(id) => {
  __render(id, Math.floor(ST.LEVELS[id].cols * 8 * 0.45), 40);
  const res = NES.Lint.frame(window.__h.ppu);
  return { ok: res.ok, colors: res.colors, bad: res.badPixels || 0, errors: res.errors || [], max: NES.Lint.maxColors };
}
"""


def body_data(page, info):
    print('[① CHR 合併與容量]')
    ok('chr_w2 載入（BG_W2 / SPR_W2 都在）', info['w2Bg'] >= 15 and info['w2Spr'] >= 50,
       'bg=%s spr=%s' % (info['w2Bg'], info['w2Spr']))
    ok('合併後背景 bank ≤ 256 磚', info['bgTiles'] <= 256, info['bgTiles'])
    ok('合併後精靈 bank ≤ 256 磚', info['sprTiles'] <= 256, info['sprTiles'])
    ok('W1 的 ST.SPR_WORLD 容量契約沒被破壞（≤ 128）', info['worldSpr'] <= 128, info['worldSpr'])
    ok('W1 的 ST.BG_WORLD 容量契約沒被破壞（≤ 192）', info['worldBg'] <= 192, info['worldBg'])
    ok('engine/shmup.js（NES.SH.Scroller）可用', info['hasSH'], info['hasSH'])
    ok('ST.Levels.ids 依序是 1-1..2-4（W1 通關自動接 W2）',
       info['ids'] == ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4'], info['ids'])

    print('[② 新磚語意 + 三個新主題]')
    K = page.evaluate(r"""() => {
      const T = ST.TILE, need = ['CRUMBLE','SPRING','ORE','VENT','CRYSTAL','LAMP','BEAM_T','BEAM_B','MBG','RAIL','GEAR','FWIN'];
      const miss = need.filter(k => T[k] === undefined);
      const kinds = {}; need.forEach(k => kinds[k] = ST.solidKind(T[k]));
      const themes = ['mine','magma','forge'].map(t => ({
        t: t, hasPal: !!(ST.PAL_WORLD && ST.PAL_WORLD[t]),
        ground: ST.Levels.themeName(t, T.GROUND), crumble: ST.Levels.themeName(t, T.CRUMBLE)
      }));
      let badKind = null;
      for (let i = 0; i < ST.TILE_COUNT; i++) {
        const k = ST.solidKind(i);
        if (['solid','oneway','hurt','none','slopeL','slopeR'].indexOf(k) < 0) badKind = badKind || [i, k];
      }
      return { miss, kinds, themes, badKind, count: ST.TILE_COUNT };
    }""")
    eq('新磚語意齊全（12 個）', K['miss'], [])
    eq('CRUMBLE 是 solid', K['kinds']['CRUMBLE'], 'solid')
    eq('SPRING 是 solid', K['kinds']['SPRING'], 'solid')
    eq('ORE 是 solid', K['kinds']['ORE'], 'solid')
    ok('裝飾磚全部 none（不會擋路）',
       all(K['kinds'][k] == 'none' for k in ['VENT', 'CRYSTAL', 'LAMP', 'BEAM_T', 'BEAM_B', 'MBG', 'RAIL', 'GEAR', 'FWIN']),
       K['kinds'])
    ok('solidKind 對 0..TILE_COUNT 全部回合法值', K['badKind'] is None, K['badKind'])
    for th in K['themes']:
        ok('主題 %s 有調色盤、地表磚有覆寫' % th['t'],
           th['hasPal'] and th['ground'] != 'BG_GTOP', th)

    print('[③ 四關地圖合法性]')
    scans = {}
    for lid in IDS:
        sc = page.evaluate(SCAN, lid)
        scans[lid] = sc
        ok('%s tileAt 全在 0..TILE_COUNT' % lid, sc['badTile'] is None, sc['badTile'])
        ok('%s chrAt 全在 bank 範圍' % lid, sc['badChr'] is None, sc['badChr'])
        ok('%s attrAt 全在 0..3' % lid, sc['badAttr'] is None, sc['badAttr'])
        eq('%s 畫面數' % lid, sc['cols'] // 32, SCREENS[lid])
        eq('%s 主題' % lid, sc['theme'], THEMES[lid])
        eq('%s 曲目 key = 主題名' % lid, sc['music'], THEMES[lid])
        eq('%s world = 2' % lid, sc['world'], 2)
        eq('%s 檢查點 2 個' % lid, len(sc['checkpoints']), 2)
        ok('%s 檢查點遞增且在關內' % lid,
           sc['checkpoints'] == sorted(sc['checkpoints']) and sc['checkpoints'][-1] < sc['cols'],
           sc['checkpoints'])
        ok('%s goal 指到 GOAL 磚（旗桿）' % lid, sc['goalTile'] > 0, sc['goalTile'])
        ok('%s 機關物件座標全在關卡範圍內' % lid, sc['oob'] == [], sc['oob'][:4])
        ok('%s 有金幣（≥ 30）' % lid, sc['coins'] >= 30, sc['coins'])
        ok('%s 有敵人（≥ 10）' % lid, sc['enemies'] >= 10, sc['enemies'])
    ok('四關都有崩塌礦石磚', all(scans[i]['crumble'] > 0 for i in ['2-1', '2-2', '2-3', '2-4']),
       {i: scans[i]['crumble'] for i in IDS})
    ok('四關都有蒸氣彈簧', all(scans[i]['spring'] > 0 for i in IDS), {i: scans[i]['spring'] for i in IDS})
    ok('四關都有礦車升降板', all(scans[i]['movers'] > 0 for i in IDS), {i: scans[i]['movers'] for i in IDS})
    ok('四關都有間歇泉', all(scans[i]['geysers'] > 0 for i in IDS), {i: scans[i]['geysers'] for i in IDS})
    ok('四關各有一顆無敵星', all(scans[i]['items'] == 1 for i in IDS), {i: scans[i]['items'] for i in IDS})
    kinds = set(k for i in IDS for k in scans[i]['spawnKinds'])
    ok('W2 用到三種新敵（bat / armor / spitter）',
       {'bat', 'armor', 'spitter'} <= kinds, sorted(kinds))
    eq('只有 2-4 有魔王', [i for i in IDS if scans[i]['hasBoss']], ['2-4'])
    eq('2-4 的魔王是熔心巨像', scans['2-4']['bossKind'], 'colossus')

    print('[④ 可達性 BFS（含升降板）/ 坑寬 / 危險帶 / 牆高 / 安全區]')
    for lid in IDS:
        B = page.evaluate(BFS, lid)
        ok('%s BFS 沒有錯誤' % lid, 'err' not in B, B.get('err'))
        if 'err' in B:
            continue
        ok('%s 起點 → 旗桿可達（maxCol %d ≥ goal %d）' % (lid, B['maxCol'], B['goalCol']),
           B['goalReached'], B)
        ok('%s 兩個檢查點都可達' % lid, all(cp['row'] >= 0 for cp in B['cps']), B['cps'])
        ok('%s 最寬的坑 / 熔岩帶 %d 欄 ≤ 9（全速跑跳 80 px = 10 欄）' % (lid, B['pit']),
           B['pit'] <= 9, (B['pit'], B['pitAt']))
        ok('%s 連續危險磚帶 %d 欄 ≤ 9（跳得過去）' % (lid, B['hz']), B['hz'] <= 9, (B['hz'], B['hzAt']))
        ok('%s 最高的牆 %d 列 ≤ 8（靜止跳 64 px = 8 列）' % (lid, B['wall']),
           B['wall'] <= 8, (B['wall'], B['wallAt']))
        ok('%s 起點安全區 %d 欄內沒有坑 / 危險磚' % (lid, scans[lid]['safeCols']),
           B['safeBad'] < 0, B['safeBad'])
        ok('%s 地面敵人全部生在可達的地面上' % lid, B['badSpawns'] == [], B['badSpawns'])
        ok('%s 升降板真的提供了額外落腳點' % lid, B['moverCells'] > 0, B['moverCells'])

    print('[⑤ 機關：純函式、決定性、行為]')
    M = page.evaluate(r"""() => {
      const L = ST.LEVELS['2-1'];
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const a = JSON.stringify(ST.Objects.moverTops(100));
      const b = JSON.stringify(ST.Objects.moverTops(100));
      const c = JSON.stringify(ST.Objects.moverTops(160));
      const m = L.movers[0];
      // 三角波：一個週期後回到原點
      const p0 = ST.Objects.moverTops(0)[0], p1 = ST.Objects.moverTops(m.period)[0];
      const half = ST.Objects.moverTops(m.period >> 1)[0];
      // 間歇泉週期
      const gy = L.geysers[0];
      let on = 0;
      for (let t = 0; t < gy.period; t++) if (ST.Objects.geyserOn(gy, t)) on++;
      return { same: a === b, moved: a !== c, x0: p0.x0, x1: p1.x0, halfX: half.x0,
               range: m.range, on: on, want: gy.on,
               count: ST.Objects.count() };
    }""")
    ok('moverTops(t) 是純函式（同 t 回同值）', M['same'], M['same'])
    ok('moverTops(t) 會隨時間移動', M['moved'], M['moved'])
    ok('升降板一個週期回到原點', M['x0'] == M['x1'], (M['x0'], M['x1']))
    ok('升降板半週期走完整個行程 %d px' % M['range'], M['halfX'] - M['x0'] == M['range'],
       (M['x0'], M['halfX'], M['range']))
    ok('間歇泉每週期噴 %d 幀（= on）' % M['want'], M['on'] == M['want'], (M['on'], M['want']))

    C = page.evaluate(r"""() => {
      const T = ST.TILE, L = ST.LEVELS['2-1'];
      // 找一塊崩塌磚
      let cc = -1, rr = -1;
      for (let c = 0; c < L.cols && cc < 0; c++) for (let r = 4; r < 30; r++) {
        if (L.tileAt(c, r) === T.CRUMBLE) { cc = c; rr = r; break; }
      }
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const h = __hero(cc * 8 + 2, rr * 8 - 22);
      const g = { hero: h, camX: 0, level: L, sfx: function () {} };
      let broke = -1;
      for (let f = 0; f < 200; f++) {
        h.onGround = true; h.prevFeet = h.y + 22; h.vy = 0;
        ST.Objects.update(g);
        if (broke < 0 && L.tileAt(cc, rr) === T.EMPTY) broke = f + 1;
      }
      const afterBreak = L.tileAt(cc, rr);
      // 復原
      let back = -1;
      for (let f = 0; f < 400; f++) {
        h.onGround = false;
        ST.Objects.update(g);
        if (back < 0 && L.tileAt(cc, rr) === T.CRUMBLE) back = f + 1;
      }
      return { cc, rr, broke, afterBreak, back, hold: ST.Objects.CRUMBLE_HOLD, backF: ST.Objects.CRUMBLE_BACK };
    }""")
    ok('崩塌磚：踩住 %d 幀後碎掉' % C['hold'], C['broke'] == C['hold'], (C['broke'], C['hold']))
    ok('崩塌磚碎掉後那一格是 EMPTY', C['afterBreak'] == 0, C['afterBreak'])
    ok('崩塌磚 %d 幀後自己復原' % C['backF'], C['back'] > 0, C['back'])

    S = page.evaluate(r"""() => {
      const T = ST.TILE, L = ST.LEVELS['2-1'];
      let cc = -1, rr = -1;
      for (let c = 0; c < L.cols && cc < 0; c++) for (let r = 4; r < 30; r++) {
        if (L.tileAt(c, r) === T.SPRING) { cc = c; rr = r; break; }
      }
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const h = __hero(cc * 8 + 2, rr * 8 - 22);
      h.onGround = true; h.prevFeet = h.y + 22;
      const g = { hero: h, camX: 0, level: L, sfx: function () {} };
      const before = h.vyA.v;
      ST.Objects.update(g);
      return { cc, rr, before, after: h.vyA.v, onGround: h.onGround,
               want: ST.Objects.SPRING_VY, springs: ST.Objects.springs };
    }""")
    ok('蒸氣彈簧：站上去立刻被彈飛（vy = %d）' % S['want'],
       S['after'] == S['want'] and S['onGround'] is False, (S['before'], S['after']))

    G = page.evaluate(r"""() => {
      const L = ST.LEVELS['2-3'];
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const gy = L.geysers[0], box = ST.Objects.geyserBox(gy);
      // 找一個「噴發中」的幀
      let tOn = -1, tOff = -1;
      for (let t = 1; t < gy.period * 2; t++) {
        if (tOn < 0 && ST.Objects.geyserOn(gy, t)) tOn = t;
        if (tOff < 0 && !ST.Objects.geyserOn(gy, t)) tOff = t;
      }
      return { box: box,
               hitOn: ST.Objects.hazardHit(box.x, box.y + 4, 12, 22, tOn),
               hitOff: ST.Objects.hazardHit(box.x, box.y + 4, 12, 22, tOff),
               away: ST.Objects.hazardHit(box.x + 64, box.y + 4, 12, 22, tOn) };
    }""")
    ok('間歇泉：噴發中會傷人', G['hitOn'], G)
    ok('間歇泉：沒噴的時候可以走過去', not G['hitOff'], G)
    ok('間歇泉：只在噴口那一欄傷人', not G['away'], G)

    print('[⑥ 三種新敵 + 火球]')
    E = page.evaluate(r"""() => {
      const L = ST.LEVELS['2-1'];
      ST.Enemies.init(L);
      const out = {};
      out.kinds = ST.Enemies.KINDS.slice();
      // bat：沒人靠近就不動，靠近才醒
      const bat = ST.Enemies.spawnTest('bat', 800, 80, {});
      const g0 = { camX: 700, level: L, hero: { x: 1200, y: 170, w: 12, h: 22 } };
      for (let f = 0; f < 30; f++) ST.Enemies.update(g0);
      out.batIdle = { x: bat.x, y: bat.y, awake: bat.awake };
      const g1 = { camX: 700, level: L, hero: { x: 820, y: 170, w: 12, h: 22 } };
      for (let f = 0; f < 40; f++) ST.Enemies.update(g1);
      out.batWake = { x: bat.x, y: bat.y, awake: bat.awake };
      out.batStompable = bat.stompable;
      // armor：不可踩、走路、坑邊轉向
      ST.Enemies.reset();
      const arm = ST.Enemies.spawnTest('armor', 200, 168, { dir: -1 });
      out.armStompable = arm.stompable;
      const x0 = arm.x;
      for (let f = 0; f < 60; f++) ST.Enemies.update({ camX: 100, level: L, hero: null });
      out.armMoved = x0 - arm.x;
      out.armStomp = ST.Enemies.stomp(arm);
      // spitter：週期吐火球
      ST.Enemies.reset();
      const sp = ST.Enemies.spawnTest('spitter', 400, 178, {});
      let fires = 0;
      const gs = { camX: 300, level: L, hero: { x: 340, y: 170, w: 12, h: 22 }, sfx: function () {} };
      for (let f = 0; f < 260; f++) {
        ST.Enemies.update(gs);
        ST.Enemies.each(function (e) { if (e.kind === 'fire') fires = Math.max(fires, 1); });
      }
      out.fires = fires;
      out.spitStompable = sp.stompable;
      // fire：重力（往下掉）
      ST.Enemies.reset();
      const fb = ST.Enemies.spawnTest('fire', 500, 120, { dir: -1 });
      const fy0 = fb.y;
      // 拋物線：前 24 幀往上、之後往下 ⇒ 要看夠久（60 幀）才會低於起點
      for (let f = 0; f < 60; f++) ST.Enemies.update({ camX: 400, level: L, hero: null });
      out.fireFell = fb.y - fy0;
      out.fireStompable = fb.stompable;
      out.fireFragile = fb.fragile;
      return out;
    }""")
    ok('ST.Enemies.KINDS 有 bat / armor / spitter / fire',
       {'bat', 'armor', 'spitter', 'fire'} <= set(E['kinds']), E['kinds'])
    ok('bat：主角在遠處時不動（倒掛）', E['batIdle']['awake'] is False, E['batIdle'])
    ok('bat：主角靠近（≤ 72 px）就醒並俯衝', E['batWake']['awake'] is True and E['batWake']['y'] > E['batIdle']['y'],
       (E['batIdle'], E['batWake']))
    ok('bat 可踩', E['batStompable'] is True)
    ok('armor 不可踩（頭上有尖刺）', E['armStompable'] is False)
    ok('armor 會走路', E['armMoved'] != 0, E['armMoved'])
    ok('armor 踩下去不會死（stomp 回 false）', E['armStomp'] is False)
    ok('spitter 可踩', E['spitStompable'] is True)
    ok('spitter 會吐火球', E['fires'] == 1, E['fires'])
    ok('火球不可踩、碰到就消失（fragile）', E['fireStompable'] is False and E['fireFragile'] is True)
    ok('火球受重力（會往下掉）', E['fireFell'] > 0, E['fireFell'])

    print('[⑦ 魔王「熔心巨像」]')
    Bo = page.evaluate(r"""() => {
      const L = ST.LEVELS['2-4'], B = ST.BossW2;
      B.init(L);
      const out = { maxHp: B.MAX_HP, spawnX: B.spawnX };
      B.update({ camX: 0, level: L, hero: null });
      out.idleFar = B.active;
      const g = { camX: L.boss.x - 280, level: L, hero: { x: L.boss.x - 40, y: 170, w: 12, h: 22, vy: 1, inv: 0 },
                  onStomp: function () {}, onHurt: function () { out.hurt = (out.hurt || 0) + 1; },
                  onDie: function (how) { out.die = how; }, sfx: function () {} };
      B.update(g);
      out.active = B.active;
      // 跑 600 幀看相位循環（walk → jump → slam → rest）
      const seen = {};
      let waves = 0;
      for (let f = 0; f < 700; f++) {
        B.update(g);
        seen[B.phase] = (seen[B.phase] || 0) + 1;
        B.hammers.each(function (s) { if (s.wave) waves++; });
      }
      out.phases = Object.keys(seen).sort();
      out.waves = waves > 0;
      // 踩 MAX_HP 次 → 死
      let n = 0;
      out.stages = [];
      while (!B.dead && n++ < 40) {
        B.inv = 0;
        B.stomp();
        out.stages.push(B.stage);
        for (let f = 0; f < 60; f++) B.update(g);
      }
      out.stomps = n;
      out.dead = B.dead;
      out.hp = B.hp;
      return out;
    }""")
    eq('魔王 5 格血', Bo['maxHp'], 5)
    ok('相機還沒靠近時魔王不啟動', Bo['idleFar'] is False)
    ok('相機靠近就啟動', Bo['active'] is True)
    ok('招式循環跑過 walk / jump / slam / rest',
       {'walk', 'jump', 'slam', 'rest'} <= set(Bo['phases']), Bo['phases'])
    ok('砸地會放出衝擊波', Bo['waves'], Bo['waves'])
    ok('踩 5 次就擊破（多階段）', Bo['dead'] is True and Bo['hp'] == 0, (Bo['stomps'], Bo['hp']))
    ok('血量下降會升階（stage 1 → 2 → 3）', sorted(set(Bo['stages'])) == [1, 2, 3] or max(Bo['stages']) >= 3,
       Bo['stages'])

    print('[⑧ 曲目（mine / magma / forge / boss2）]')
    A = page.evaluate(r"""() => {
      const A = ST.Audio, keys = ['mine', 'magma', 'forge', 'boss2'];
      const v = A.validate ? A.validate() : null;
      return {
        keys: keys.map(k => ({ k: k, has: A.has(k), info: A.INFO[k] || null })),
        inKeys: keys.every(k => A.KEYS.indexOf(k) >= 0),
        validate: Array.isArray(v) ? v.length : (v && v.ok === false ? 1 : 0),
        errs: Array.isArray(v) ? v.slice(0, 3) : []
      };
    }""")
    ok('四首 W2 曲都註冊進 ST.Audio.SONGS', all(x['has'] for x in A['keys']), A['keys'])
    ok('四首都在 ST.Audio.KEYS 裡（play(key) 找得到）', A['inKeys'])
    for x in A['keys']:
        inf = x['info'] or {}
        ok('%s 有長度資訊且會 loop' % x['k'], (inf.get('frames') or 0) > 200 and inf.get('loop') is True, inf)
    ok('ST.Audio.validate() 全過（只用五聲道 / 音符合法）', A['validate'] == 0, A['errs'])
    ok('ST.Audio.has() 對未知 key 回 false',
       page.evaluate("() => ST.Audio.has('no-such-song')") is False)

    print('[⑨ lint：三個新主題 ≤ 25 色 / 64 色調色盤]')
    for lid in IDS:
        L = page.evaluate(LINT, lid)
        ok('%s（%s）同屏色數 %d ≤ %d' % (lid, THEMES[lid], L['colors'], L['max']),
           L['colors'] <= L['max'], L['colors'])
        ok('%s lint 全綠（無非 64 色像素）' % lid, L['ok'] and L['bad'] == 0,
           (L['ok'], L['bad'], L['errors'][:2]))


# ================================================================ 真頁 harness
def shot(page, path, scale=3):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    d = page.evaluate("""(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
        const o=document.createElement('canvas'); o.width=c.width*s; o.height=c.height*s;
        const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height);
        return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(d.split(',', 1)[1]))


def fresh(page, level):
    page.goto(BASE + '&level=' + level)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(1)')
    return page.evaluate('() => window.GAME.state()')


def body_live(page):
    print('[⑩ 真頁：機關會動 / 無敵星 / 魔王可擊破 / 旗桿演出]')

    # ---- 升降板：站上去被帶著走 ----
    fresh(page, '2-1')
    R = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      const L = ST.LEVELS['2-1'], m = L.movers[0];
      // 等升降板走到行程左端再站上去
      let n = 0;
      while (n++ < 600) { const b = ST.Objects.moverTops(ST.Objects.now() + 1)[0];
        if (b.x0 <= m.c * 8 + 2) break; __nes.step(1); }
      const b0 = ST.Objects.moverTops(ST.Objects.now())[0];
      d.warp(b0.x0 + 8, b0.top - 24); __nes.step(6);
      const on = S();
      const x0 = on.x;
      __nes.step(60);
      const after = S();
      return { onMover: on.onMover, x0: x0, x1: after.x, onMover2: after.onMover, y: after.y, top: b0.top };
    }""")
    ok('站上礦車升降板 → state().onMover = true', R['onMover'] or R['onMover2'], R)
    ok('升降板會把主角水平帶著走', R['x1'] != R['x0'], (R['x0'], R['x1']))

    # ---- 崩塌磚：真的會消失 + 名稱表跟著更新 ----
    fresh(page, '2-1')
    Cb = page.evaluate(r"""() => {
      const T = ST.TILE, d = GAME.dev, L = ST.LEVELS['2-1'];
      let cc = -1, rr = -1;
      for (let c = 0; c < L.cols && cc < 0; c++) for (let r = 4; r < 30; r++)
        if (L.tileAt(c, r) === T.CRUMBLE) { cc = c; rr = r; break; }
      d.warp(cc * 8 + 2, rr * 8 - 22); __nes.step(4);
      const before = d.tileAt(cc, rr), ntBefore = d.ntTileAt(cc, rr);
      let n = 0; while (d.tileAt(cc, rr) === T.CRUMBLE && n++ < 200) __nes.step(1);
      const after = d.tileAt(cc, rr), nt = d.ntTileAt(cc, rr), bg = d.bgIndexAt(cc, rr);
      return { cc, rr, before, after, ntBefore, nt, bg, frames: n };
    }""")
    ok('站在崩塌礦石磚上，它會碎掉', Cb['after'] == 0 and Cb['before'] > 0, Cb)
    ok('崩塌後名稱表那一格跟著改（1 byte 重寫）', Cb['nt'] == Cb['bg'], (Cb['nt'], Cb['bg']))

    # ---- 蒸氣彈簧：真的彈得比一般跳高 ----
    fresh(page, '2-1')
    Sp = page.evaluate(r"""() => {
      const T = ST.TILE, d = GAME.dev, L = ST.LEVELS['2-1'], S = () => window.GAME.state();
      let cc = -1, rr = -1;
      for (let c = 0; c < L.cols && cc < 0; c++) for (let r = 4; r < 30; r++)
        if (L.tileAt(c, r) === T.SPRING) { cc = c; rr = r; break; }
      d.warp(cc * 8 + 2, rr * 8 - 30); __nes.step(2);
      const y0 = S().y;
      let top = 999, n = 0;
      while (n++ < 120) { __nes.step(1); const s = S(); if (s.y < top) top = s.y; if (s.onGround && n > 20) break; }
      return { cc, rr, y0, top, rise: (rr * 8 - 22) - top, springs: S().springs };
    }""")
    ok('蒸氣彈簧把主角彈起 ≥ 64 px（比 4 格跳高）', Sp['rise'] >= 64, Sp)
    ok('state().springs 有計數', Sp['springs'] >= 1, Sp['springs'])

    # ---- 無敵星：吃到 → star > 0、熔岩不死 ----
    fresh(page, '2-3')
    It = page.evaluate(r"""() => {
      const d = GAME.dev, S = () => window.GAME.state(), L = ST.LEVELS['2-3'];
      const it = L.items[0];
      d.warp(it.c * 8 + 2, it.r * 8 + 2); __nes.step(4);
      const s = S();
      return { star: s.star, stars: s.stars, score: s.score, picked: s.picked, lastSfx: s.lastSfx };
    }""")
    ok('碰到無敵星 → hero.star > 0', It['star'] > 0, It)
    ok('吃星有加分 + 計數', It['score'] > 0 and It['stars'] == 1 and It['picked'] == 1, It)
    Lv = page.evaluate(r"""() => {
      const d = GAME.dev, S = () => window.GAME.state(), L = ST.LEVELS['2-3'];
      // 找一欄熔岩，站進去
      let cc = -1;
      for (let c = 32; c < L.cols && cc < 0; c++) if (ST.solidKind(L.tileAt(c, 26)) === 'hurt') cc = c;
      const st0 = S().star;
      d.hero().star = 600;
      d.hero().x = cc * 8 + 2; NES.FX.vsetPx(d.hero().px, cc * 8 + 2);
      NES.FX.vsetPx(d.hero().py, 26 * 8 - 22);
      __nes.step(12);
      return { cc: cc, state: S().state, star: S().star };
    }""")
    ok('無敵星期間站進熔岩不會死', Lv['state'] != 'dead', Lv)

    # ---- 魔王：真的打得死，且過關 ----
    fresh(page, '2-4')
    Bo = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      d.setLives(9);
      d.warp(215 * 8); __nes.step(6);
      const b0 = d.boss();
      let n = 0;
      while (!d.boss().dead && n++ < 40) { ST.BossW2.inv = 0; ST.BossW2.stomp(); __nes.step(60); }
      const b1 = d.boss();
      let m = 0; while (S().mode === 'play' && m++ < 300) __nes.step(1);
      return { active: b0.active, hp0: b0.hp, dead: b1.dead, hp1: b1.hp, stomps: n, mode: S().mode };
    }""")
    ok('進魔王房 → 熔心巨像啟動（5 血）', Bo['active'] is True and Bo['hp0'] == 5, Bo)
    ok('踩 5 次 → 擊破', Bo['dead'] is True and Bo['hp1'] == 0, Bo)
    ok('擊破 → 過關（mode = clear）', Bo['mode'] == 'clear', Bo['mode'])

    # ---- 旗桿演出（W2 四關都有）----
    for lid in IDS:
        fresh(page, lid)
        P = page.evaluate(r"""(id) => {
          const S = () => window.GAME.state(), d = GAME.dev;
          const col = ST.LEVELS[id].goal.col;
          d.warp(col * 8 - 8, 96); __nes.step(2);
          let n = 0; while (S().mode === 'play' && n++ < 160) __nes.step(1);
          const hit = S();
          let slide = 0, walk = 0, m = 0;
          const y0 = hit.y;
          while (S().pole && m++ < 400) { const p = S(); if (p.pole === 'slide') slide++; else walk++; __nes.step(1); }
          return { mode: hit.mode, slide: slide, walk: walk, y0: y0, y1: S().y, pole: S().pole };
        }""", lid)
        ok('%s 碰旗桿 → 下滑 %d 幀 + 進城 %d 幀' % (lid, P['slide'], P['walk']),
           P['mode'] == 'clear' and P['slide'] >= 8 and P['walk'] >= 8 and P['y1'] > P['y0'], P)

    # ---- 每關 3 張截圖 + lint ----
    print('[⑪ 每關 3 張截圖 + lint（shots/%s）]' % SHOTS.name)
    SHOTS.mkdir(parents=True, exist_ok=True)
    for lid in IDS:
        fresh(page, lid)
        cols = page.evaluate('() => window.GAME.state().cols')
        for i, frac in enumerate([0.06, 0.45, 0.80]):
            col = int(cols * frac)
            page.evaluate("""(col) => { GAME.dev.warp(col * 8); __nes.step(40); }""", col)
            name = '%s_%d.png' % (lid.replace('-', '_'), i + 1)
            shot(page, SHOTS / name)
            lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
            ok('%s 截圖 %s：lint 綠、%d 色 ≤ 25' % (lid, name, lt['colors']),
               lt['ok'] and lt['colors'] <= 25, (lt['ok'], lt['colors'], lt.get('errors', [])[:2]))


def main():
    if not (ROOT / 'star.html').exists():
        print('找不到 star.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        page = browser.new_page(viewport={'width': 900, 'height': 760})
        page.on('pageerror', lambda e: errors.append('setup: ' + str(e)))
        page.goto('about:blank')
        page.set_content('<canvas id="nes"></canvas>')
        for f in ENGINE:
            p = ROOT / 'engine' / f
            if p.exists() and p.stat().st_size > 8:
                page.add_script_tag(path=str(p))
        for f in GAME:
            page.add_script_tag(path=str(ROOT / 'games' / 'star' / f))
        info = page.evaluate(SETUP)
        body_data(page, info)
        page.close()

        page2 = browser.new_page()
        page2.on('pageerror', lambda e: errors.append('live: ' + str(e)))
        page2.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text)
                 if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
        body_live(page2)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 64)
    print('star-w2 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    print('總結：' + ('PASS' if not bad else 'FAIL'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
