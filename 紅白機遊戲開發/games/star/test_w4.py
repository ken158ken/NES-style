# -*- coding: utf-8 -*-
"""《星塵勇者》世界 4「機械要塞」自動驗證（R4 star-w4）。

兩個 harness（寫法同 games/star/test_w2.py）：
  ① 隔離頁（about:blank + add_script_tag）：只載 engine + games/star 的資料層，
     驗「精靈 bank 切換 / 四關資料合法性 / 可達性 / 三個新機關 / 三種新敵 / 魔王 / 曲目 / lint」。
  ② 真頁（star.html?level=4-x）：驗「bank 真的切過去、輸送帶真的推人、雷射真的傷人、
     升降台真的載人、崩塌磚真的在抖、魔王可擊破、旗桿演出」，並存每關 3 張截圖 + lint。

用法：
    ../卡比之星/.venv/bin/python games/star/test_w4.py [-v] [--shots shots/agent_w4]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

可達性模型（同 test_w1 / test_w2）：
  站立格 → 走 / 跳 4 格高（64 px = 8 列）/ 跨 5 格寬（80 px = 10 欄）/ 落下任意高。
  **另外**把齒輪升降台（ST.ObjectsW4 的 lift，位置是時間的純函式）在行程兩端與中點的
  落腳面也算成可站立格 —— 升降台是關卡資料的一部分，不能只看磚。
"""
import base64
import importlib.util
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
SHOTS = ROOT / 'shots' / 'agent_w4'
if '--shots' in sys.argv:
    SHOTS = ROOT / sys.argv[sys.argv.index('--shots') + 1]

ENGINE = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js', 'ppu.js', 'nes_lint.js',
          'apu.js', 'music.js', 'shmup.js']
GAME = ['chr_hero.js', 'chr_world.js', 'chr_w2.js', 'chr_w4.js', 'song.js', 'song_w2.js', 'song_w4.js',
        'enemies.js', 'enemies_w2.js', 'enemies_w4.js', 'boss.js', 'boss_w2.js', 'boss_w4.js',
        'objects_w2.js', 'objects_w4.js', 'levels_w1.js', 'levels_w2.js', 'levels_w4.js']
IDS = ['4-1', '4-2', '4-3', '4-4']
SCREENS = {'4-1': 10, '4-2': 10, '4-3': 9, '4-4': 8}
THEMES = {'4-1': 'works', '4-2': 'works', '4-3': 'core', '4-4': 'citadel'}
MUSIC = {'4-1': 'works', '4-2': 'works', '4-3': 'core', '4-4': 'core'}
BASE = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'

results = []


def _bot_js():
    """借用 tools/playthrough_star.py 的機器人（同一支，不另外抄一份）。"""
    spec = importlib.util.spec_from_file_location('ps_bot', ROOT / 'tools' / 'playthrough_star.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.BOT_JS


BOT_JS = _bot_js()

# 機器人跑一關，順便每一幀量「每條掃描線最多幾顆精靈」（直接讀 OAM，不用 render ⇒ 很快）。
# 可見條件與 engine/nes_lint.js 的 oam() 一致：y < 239、-8 < x < 256。
BOT_SPRLINE = r"""
(opt) => {
  const ppu = NES.instance.ppu, h = ppu._sprH || 16;
  function peakLine() {
    const oam = ppu.oam, lines = new Uint16Array(240);
    let best = 0, bl = -1;
    for (let i = 0; i < oam.length; i++) {
      const s = oam[i];
      if (!s || !s.on || s.y >= 239 || s.y <= -h || s.x <= -8 || s.x >= 256) continue;
      for (let yy = Math.max(0, s.y); yy < Math.min(240, s.y + h); yy++) {
        if (++lines[yy] > best) { best = lines[yy]; bl = yy; }
      }
    }
    return { max: best, line: bl };
  }
  let peak = 0, line = -1, frame = -1, x = -1, done = null;
  for (let i = 0; i < opt.frames; i++) {
    const b = window.__botStep(1);
    const m = peakLine();
    if (m.max > peak) { peak = m.max; line = m.line; frame = b.frames; x = window.GAME.state().x; }
    if (b.done) { done = b.done; break; }
  }
  const st = window.GAME.state();
  return { peak: peak, line: line, frame: frame, x: x, done: done,
           deaths: window.__bot.deaths, frames: window.__bot.frames, cleared: !!(done && done.cleared) };
}
"""


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
  // 與 main.js 完全相同的合併順序（bg：HUD → fallback → W1 → W2 → W4；spr：主角 → W1 → W2）
  const bg  = NES.CHR.bank('st_bg',  Object.assign({}, ST.BG_HUD, ST.BG_FALLBACK, ST.BG_WORLD, ST.BG_W2, ST.BG_W4));
  const spr = NES.CHR.bank('st_spr', Object.assign({}, ST.SPR_HERO, ST.SPR_WORLD, ST.SPR_W2));
  ST.sprBank = spr; ST.bgBank = bg;
  ST.heroTiles = {};
  Object.keys(ST.SPR_HERO).forEach(k => { ST.heroTiles[k] = spr.index(k) | 1; });
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
  window.__oam = NES.SH.OAM(ppu, { reserve: 0 });

  window.__render = function (id, camX, frames) {
    const L = ST.LEVELS[id];
    camX = camX | 0; frames = frames | 0;
    ST.SprBanks.apply(L);                       // ← 世界 4 ⇒ 切到 st_spr_w4
    ST.World.applyPalettes(ppu, L.theme);
    ppu.setBgPalette(0, [0x0F, 0x10, 0x30]);
    ppu.setSprPalette(0, [0x0F, 0x16, 0x27]);
    ppu.clearSprites();
    const scr = ST.Scroll.create(ppu, L);
    scr.reset(camX);
    ST.Enemies.init(L);
    ST.Enemies.seek(Math.max(0, camX - 8));
    ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
    ST.ObjectsW4.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
    const B = (L.bossKind === 'guardian') ? ST.BossW4 : ST.Boss;
    if (L.boss) B.init(L);
    const g = { camX: camX, level: L, hero: null };
    for (let f = 0; f < frames; f++) {
      ST.Enemies.update(g);
      ST.Objects.update(g);
      ST.ObjectsW4.update(g);
      if (L.boss) B.update(g);
    }
    ppu.scroll(0, 0, 0);
    ppu.split(32, { x: camX % 512, y: 32, nt: 0 });
    __oam.begin();
    ST.Objects.draw(__oam, g);
    ST.ObjectsW4.draw(__oam, g);
    ST.Enemies.draw(__oam);
    if (L.boss) B.draw(__oam);
    __oam.end();
    ppu.render();
    return { camX: camX, enemies: ST.Enemies.count, theme: L.theme, oam: __oam.used };
  };

  // 假主角（驗機關用）
  window.__hero = function (x, y) {
    const FX = NES.FX;
    const h = { x: x, y: y, w: 12, h: 22, vy: 0, prevFeet: y + 22, onGround: true, onMover: null,
                star: 0, inv: 0, state: 'idle', facing: 1, stars: 0, pitSaves: 0,
                px: FX.Vec(x), py: FX.Vec(y), vxA: FX.Acc(0), vyA: FX.Acc(0) };
    h.jumpS = FX.SMB.jumpState(h.vyA);
    return h;
  };

  // bank 對齊：主角 + W1 世界的磚在兩張 bank 裡索引必須逐名相同
  const w4 = ST.SprBanks.bankOf(4);
  const mis = [];
  Object.keys(ST.SPR_HERO).forEach(k => { if (spr.index(k) !== w4.index(k)) mis.push(k); });
  Object.keys(ST.SPR_WORLD).forEach(k => { if (spr.index(k) !== w4.index(k)) mis.push(k); });

  return {
    bgTiles: bg.tiles.length, sprTiles: spr.tiles.length, w4Tiles: w4.tiles.length,
    w4Bg: ST.W4_BG_TILES, w4Spr: ST.W4_SPR_TILES,
    worldBg: ST.World.bgTiles, worldSpr: ST.World.sprTiles, w2Spr: ST.W2_SPR_TILES,
    misaligned: mis.slice(0, 6), misN: mis.length,
    hasSH16: typeof __oam.add16 === 'function' && typeof __oam.push16 === 'function',
    ids: ST.Levels.ids.slice(),
    songs: ST.W4_SONGS || [], w4ids: ST.W4_IDS || []
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
  // 齒輪升降台：行程兩端 + 中點的落腳面也算可站立格
  const lifts = L.lifts || [];
  const liftCells = [];
  for (let i = 0; i < lifts.length; i++) {
    const m = lifts[i];
    const x0 = (m.x === undefined ? m.c * 8 : m.x), y0 = (m.y === undefined ? m.r * 8 : m.y);
    const w = m.w || 4, rng = m.range | 0;
    const offs = [0, rng >> 1, rng];
    for (let o = 0; o < offs.length; o++) {
      const mx = (m.axis === 'y') ? x0 : x0 + offs[o];
      const my = (m.axis === 'y') ? y0 + offs[o] : y0;
      const row = my >> 3;
      for (let cc = mx >> 3; cc < (mx + w * 8) >> 3; cc++) {
        if (cc < 0 || cc >= cols || row < TOP || row >= ROWS) continue;
        if (!stand[row * cols + cc]) { stand[row * cols + cc] = 1; liftCells.push([cc, row]); }
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
  let pit = 0, run = 0, pitAt = -1;
  for (c = 0; c <= L.goal.col; c++) {
    if (standCol[c] < 0) { run++; if (run > pit) { pit = run; pitAt = c - run + 1; } } else run = 0;
  }
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
  const groundKinds = { roller: 1, bouncer: 1, armor: 1, spitter: 1, guard: 1, sentry: 1 };
  const badSpawns = L.spawns.filter(s => groundKinds[s.kind] && colRow(s.col) < 0).map(s => s.col);
  return {
    nodes: q.length, maxCol: maxCol, goalCol: L.goal.col, goalReached: maxCol >= L.goal.col,
    cps: L.checkpoints.map(cp => ({ col: cp, row: colRow(cp) })),
    pit: pit, pitAt: pitAt, hz: hz, hzAt: hzAt, wall: wall, wallAt: wallAt,
    safeBad: safeBad, badSpawns: badSpawns, liftCells: liftCells.length
  };
}
"""

SCAN = r"""
(id) => {
  const L = ST.LEVELS[id], bg = window.__h.bg, T = ST.TILE;
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
  // 機關座標必須落在關卡範圍內，而且「輸送帶資料」與「BRIDGE 磚」逐欄一致
  const oob = [], beltMismatch = [];
  (L.lifts || []).forEach((m, i) => {
    const x0 = (m.x === undefined ? m.c * 8 : m.x), y0 = (m.y === undefined ? m.r * 8 : m.y);
    const x1 = x0 + (m.axis === 'y' ? 0 : m.range) + (m.w || 4) * 8;
    const y1 = y0 + (m.axis === 'y' ? m.range : 0) + 8;
    if (x0 < 0 || x1 > L.cols * 8 || y0 < 32 || y1 > L.rows * 8) oob.push(['lift', i, x0, y0, x1, y1]);
    if (!(m.period > 1) || (m.period & 1)) oob.push(['liftPeriod', i, m.period]);
  });
  (L.lasers || []).forEach((g, i) => {
    if (g.c < 0 || g.c >= L.cols) oob.push(['laserCol', i, g.c]);
    if (g.r - g.h + 1 < 4 || g.r >= L.rows) oob.push(['laserRow', i, g.r, g.h]);
    if (!(g.on > 0 && g.on < g.period)) oob.push(['laserDuty', i, g.on, g.period]);
  });
  (L.belts || []).forEach((b, i) => {
    if (b.c < 0 || b.c + b.w > L.cols || b.r < 4 || b.r >= L.rows) oob.push(['belt', i, b.c, b.r, b.w]);
    if (b.w > 12) oob.push(['beltWide', i, b.w]);
    if (b.dir !== 1 && b.dir !== -1) oob.push(['beltDir', i, b.dir]);
    for (let c = b.c; c < b.c + b.w; c++) if (L.tileAt(c, b.r) !== T.BRIDGE) beltMismatch.push([i, c]);
  });
  (L.items || []).forEach((it, i) => {
    if (it.c < 0 || it.c >= L.cols || it.r < 4 || it.r >= L.rows) oob.push(['item', i, it.c, it.r]);
  });
  L.spawns.forEach((s, i) => { if (s.col < 0 || s.col >= L.cols) oob.push(['spawn', i, s.col]); });
  return {
    badTile, badChr, badAttr, oob, beltMismatch: beltMismatch.slice(0, 4),
    kinds: Object.keys(used).length, coins: L.coins, enemies: L.enemies,
    cols: L.cols, theme: L.theme, music: L.music, safeCols: L.safeCols, world: L.world,
    checkpoints: L.checkpoints, goal: L.goal, start: L.start,
    goalTile: L.tileAt(L.goal.col, L.goal.row),
    spawnKinds: L.spawns.map(s => s.kind),
    belts: (L.belts || []).length, lasers: (L.lasers || []).length, lifts: (L.lifts || []).length,
    items: (L.items || []).length,
    crumble: used[T.CRUMBLE] || 0, bridge: used[T.BRIDGE] || 0, vent: used[T.VENT] || 0,
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
    print('[① CHR 容量與「每個世界一張精靈 bank」]')
    ok('chr_w4 載入（BG_W4 / SPR_W4 都在）', info['w4Bg'] >= 15 and info['w4Spr'] >= 50,
       'bg=%s spr=%s' % (info['w4Bg'], info['w4Spr']))
    ok('合併後背景 bank ≤ 256 磚（W4 的 20 磚併得進去）', info['bgTiles'] <= 256, info['bgTiles'])
    ok('主精靈 bank 仍 ≤ 256 磚（W4 精靈刻意不併）', info['sprTiles'] <= 256, info['sprTiles'])
    ok('世界 4 的精靈 bank ≤ 256 磚', info['w4Tiles'] <= 256, info['w4Tiles'])
    ok('W4 精靈 bank 真的多出了 W4 的磚',
       info['w4Tiles'] > 128 and info['w4Tiles'] >= info['w4Spr'], info['w4Tiles'])
    ok('兩張 bank 的主角 / W1 世界磚**逐名索引相同**（bank 切換後索引不會錯位）',
       info['misN'] == 0, info['misaligned'])
    ok('W1 的 ST.SPR_WORLD 容量契約沒被破壞（≤ 128）', info['worldSpr'] <= 128, info['worldSpr'])
    ok('W1 的 ST.BG_WORLD 容量契約沒被破壞（≤ 192）', info['worldBg'] <= 192, info['worldBg'])
    ok('engine/shmup.js 有 R4 的 OAM.add16 / push16', info['hasSH16'], info['hasSH16'])
    ok('ST.Levels.ids 含 1-1..2-4 與 4-1..4-4',
       all(i in info['ids'] for i in ['1-1', '2-4', '4-1', '4-2', '4-3', '4-4']), info['ids'])
    eq('ST.W4_IDS = 4-1..4-4', info['w4ids'], IDS)

    S = page.evaluate(r"""() => {
      const out = {};
      out.before = ST.SprBanks.currentName();
      ST.SprBanks.apply(ST.LEVELS['1-1']); out.w1 = ST.SprBanks.currentName();
      ST.SprBanks.apply(ST.LEVELS['4-1']); out.w4 = ST.SprBanks.currentName();
      ST.SprBanks.apply(ST.LEVELS['2-1']); out.back = ST.SprBanks.currentName();
      out.has4 = ST.SprBanks.has(4); out.has3 = ST.SprBanks.has(3);
      out.oam16 = ST.W4.oam16('W4_DRN0_L');
      out.odd = (ST.W4.oam16('W4_GRD0_L') & 1) === 1;
      out.unknown = ST.W4.oam16('NO_SUCH_TILE');
      return out;
    }""")
    eq('換到 W1 ⇒ 圖樣表 1 = 主 bank', S['w1'], 'st_spr')
    eq('換到 W4 ⇒ 圖樣表 1 = st_spr_w4', S['w4'], 'st_spr_w4')
    eq('換回 W2 ⇒ 圖樣表 1 回到主 bank', S['back'], 'st_spr')
    ok('SprBanks.has(4) = true、has(3) = false（只有登記過的世界才切）',
       S['has4'] is True and S['has3'] is False, S)
    ok('ST.W4.oam16 回合法索引且 bit0 = 1（圖樣表 1 的 8×16 慣例）',
       S['oam16'] > 0 and S['odd'] is True, S['oam16'])
    eq('ST.W4.oam16 對未知磚名回 0（不丟例外）', S['unknown'], 0)

    print('[② 三個新主題（works / core / citadel）]')
    K = page.evaluate(r"""() => {
      const T = ST.TILE;
      const themes = ['works', 'core', 'citadel'].map(t => ({
        t: t, hasPal: !!(ST.PAL_WORLD && ST.PAL_WORLD[t]),
        ground: ST.Levels.themeName(t, T.GROUND),
        belt: ST.Levels.themeName(t, T.BRIDGE),
        emit: ST.Levels.themeName(t, T.VENT),
        gold: ST.PAL_WORLD[t] ? ST.PAL_WORLD[t].bg[2][2] : -1
      }));
      return { themes: themes, bridgeKind: ST.solidKind(T.BRIDGE), ventKind: ST.solidKind(T.VENT) };
    }""")
    for th in K['themes']:
        ok('主題 %s 有調色盤、地表磚有自己的覆寫' % th['t'],
           th['hasPal'] and th['ground'] not in ('BG_GTOP', 'BG_STONE_T'), th)
        eq('主題 %s 的輸送帶磚 = BG_BELT' % th['t'], th['belt'], 'BG_BELT')
        eq('主題 %s 的雷射發射座 = BG_EMIT' % th['t'], th['emit'], 'BG_EMIT')
        eq('主題 %s 的 bg3 色 3 是金色 $28（金幣不會變白）' % th['t'], th['gold'], 0x28)
    eq('輸送帶磚（BRIDGE）是 solid（站得上去）', K['bridgeKind'], 'solid')
    eq('雷射發射座（VENT）是 none（不擋路）', K['ventKind'], 'none')
    for t in ['works', 'core', 'citadel']:
        ok('主題 %s 與 W1 / W2 的七個主題都不同名' % t,
           t not in ['ground', 'cave', 'sky', 'castle', 'mine', 'magma', 'forge'])

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
        eq('%s 曲目 key' % lid, sc['music'], MUSIC[lid])
        eq('%s world = 4' % lid, sc['world'], 4)
        eq('%s 檢查點 2 個' % lid, len(sc['checkpoints']), 2)
        ok('%s 檢查點遞增且在關內' % lid,
           sc['checkpoints'] == sorted(sc['checkpoints']) and sc['checkpoints'][-1] < sc['cols'],
           sc['checkpoints'])
        ok('%s goal 指到 GOAL 磚（旗桿）' % lid, sc['goalTile'] > 0, sc['goalTile'])
        ok('%s 機關物件座標全在關卡範圍內' % lid, sc['oob'] == [], sc['oob'][:4])
        ok('%s 輸送帶資料與 BRIDGE 磚逐欄一致' % lid, sc['beltMismatch'] == [], sc['beltMismatch'])
        ok('%s 有金幣（≥ 30）' % lid, sc['coins'] >= 30, sc['coins'])
        ok('%s 有敵人（≥ 10）' % lid, sc['enemies'] >= 10, sc['enemies'])
    ok('四關都有輸送帶', all(scans[i]['belts'] > 0 for i in IDS), {i: scans[i]['belts'] for i in IDS})
    ok('四關都有雷射柵欄', all(scans[i]['lasers'] > 0 for i in IDS), {i: scans[i]['lasers'] for i in IDS})
    ok('四關都有齒輪升降台', all(scans[i]['lifts'] > 0 for i in IDS), {i: scans[i]['lifts'] for i in IDS})
    ok('四關都有崩塌鋼板（R4 的抖動粒子看得到）',
       all(scans[i]['crumble'] > 0 for i in IDS), {i: scans[i]['crumble'] for i in IDS})
    ok('四關各有一顆無敵星', all(scans[i]['items'] == 1 for i in IDS), {i: scans[i]['items'] for i in IDS})
    kinds = set(k for i in IDS for k in scans[i]['spawnKinds'])
    ok('W4 用到三種新敵（drone / guard / sentry）', {'drone', 'guard', 'sentry'} <= kinds, sorted(kinds))
    ok('W4 沒有用到 W2 的敵人（精靈 bank 已換掉，畫出來會是別的磚）',
       not ({'bat', 'armor', 'spitter', 'fire'} & kinds), sorted(kinds))
    eq('只有 4-4 有魔王', [i for i in IDS if scans[i]['hasBoss']], ['4-4'])
    eq('4-4 的魔王是核心守護者', scans['4-4']['bossKind'], 'guardian')

    print('[④ 可達性 BFS（含升降台）/ 坑寬 / 危險帶 / 牆高 / 安全區]')
    for lid in IDS:
        B = page.evaluate(BFS, lid)
        ok('%s BFS 沒有錯誤' % lid, 'err' not in B, B.get('err'))
        if 'err' in B:
            continue
        ok('%s 起點 → 旗桿可達（maxCol %d ≥ goal %d）' % (lid, B['maxCol'], B['goalCol']),
           B['goalReached'], B)
        ok('%s 兩個檢查點都可達' % lid, all(cp['row'] >= 0 for cp in B['cps']), B['cps'])
        ok('%s 最寬的坑 / 電漿帶 %d 欄 ≤ 9' % (lid, B['pit']), B['pit'] <= 9, (B['pit'], B['pitAt']))
        ok('%s 連續危險磚帶 %d 欄 ≤ 9' % (lid, B['hz']), B['hz'] <= 9, (B['hz'], B['hzAt']))
        ok('%s 最高的牆 %d 列 ≤ 8' % (lid, B['wall']), B['wall'] <= 8, (B['wall'], B['wallAt']))
        ok('%s 起點安全區 %d 欄內沒有坑 / 危險磚' % (lid, scans[lid]['safeCols']),
           B['safeBad'] < 0, B['safeBad'])
        ok('%s 地面敵人全部生在可達的地面上' % lid, B['badSpawns'] == [], B['badSpawns'])
        ok('%s 升降台真的提供了額外落腳點' % lid, B['liftCells'] > 0, B['liftCells'])

    print('[⑤ 三個新機關：純函式、決定性、行為]')
    M = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-1'];
      ST.ObjectsW4.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const a = JSON.stringify(ST.ObjectsW4.liftTops(100));
      const b = JSON.stringify(ST.ObjectsW4.liftTops(100));
      const c = JSON.stringify(ST.ObjectsW4.liftTops(160));
      const m = L.lifts[0];
      const p0 = ST.ObjectsW4.liftTops(0)[0], p1 = ST.ObjectsW4.liftTops(m.period)[0];
      const half = ST.ObjectsW4.liftTops(m.period >> 1)[0];
      const ls = L.lasers[0];
      let on = 0;
      for (let t = 0; t < ls.period; t++) if (ST.ObjectsW4.laserOn(ls, t)) on++;
      return { same: a === b, moved: a !== c, x0: p0.x0, x1: p1.x0, halfX: half.x0,
               range: m.range, on: on, want: ls.on, count: ST.ObjectsW4.count() };
    }""")
    ok('liftTops(t) 是純函式（同 t 回同值）', M['same'], M['same'])
    ok('liftTops(t) 會隨時間移動', M['moved'], M['moved'])
    ok('升降台一個週期回到原點', M['x0'] == M['x1'], (M['x0'], M['x1']))
    ok('升降台半週期走完整個行程 %d px' % M['range'], M['halfX'] - M['x0'] == M['range'],
       (M['x0'], M['halfX'], M['range']))
    ok('雷射每週期開 %d 幀（= on）' % M['want'], M['on'] == M['want'], (M['on'], M['want']))

    Be = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-1'], b = L.belts[0];
      ST.ObjectsW4.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const h = __hero(b.c * 8 + 8, b.r * 8 - 22);
      const g = { hero: h, camX: 0, level: L, sfx: function () {} };
      const x0 = h.x;
      for (let f = 0; f < 60; f++) { h.onGround = true; h.prevFeet = h.y + 22; h.vy = 0; ST.ObjectsW4.update(g); }
      const moved = h.x - x0;
      // 不在帶子上就不推
      const h2 = __hero(8, 24 * 8 - 22);
      const g2 = { hero: h2, camX: 0, level: L };
      const y0 = h2.x;
      for (let f = 0; f < 60; f++) { h2.onGround = true; h2.prevFeet = h2.y + 22; h2.vy = 0; ST.ObjectsW4.update(g2); }
      return { dir: b.dir, moved: moved, pushed: ST.ObjectsW4.pushed,
               off: h2.x - y0,
               convOn: ST.ObjectsW4.convAt(b.c * 8 + 8, b.r), convOff: ST.ObjectsW4.convAt(8, 24),
               beltV: ST.ObjectsW4.BELT_V };
    }""")
    ok('輸送帶：站上去 60 幀被帶著走約 30 px（0.5 px/幀）',
       abs(Be['moved']) >= 28 and abs(Be['moved']) <= 32, Be['moved'])
    ok('輸送帶方向與資料一致', (Be['moved'] > 0) == (Be['dir'] > 0), (Be['moved'], Be['dir']))
    ok('不在帶子上就完全不推', Be['off'] == 0, Be['off'])
    eq('convAt 在帶面上回 ±BELT_V', abs(Be['convOn']), Be['beltV'])
    eq('convAt 不在帶面上回 0', Be['convOff'], 0)

    G = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-3'];
      ST.ObjectsW4.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const ls = L.lasers[0], box = ST.ObjectsW4.laserBox(ls);
      let tOn = -1, tOff = -1;
      for (let t = 1; t < ls.period * 2; t++) {
        if (tOn < 0 && ST.ObjectsW4.laserOn(ls, t)) tOn = t;
        if (tOff < 0 && !ST.ObjectsW4.laserOn(ls, t)) tOff = t;
      }
      // 無敵星：雷射無效
      const h = __hero(box.x - 2, box.y + 8);
      const g = { hero: h, camX: 0, level: L };
      h.star = 300;
      ST.ObjectsW4.update(g);
      return { box: box, tOn: tOn, tOff: tOff,
               hitOn: ST.ObjectsW4.hazardHit(box.x, box.y + 4, 12, 22, tOn),
               hitOff: ST.ObjectsW4.hazardHit(box.x, box.y + 4, 12, 22, tOff),
               away: ST.ObjectsW4.hazardHit(box.x + 64, box.y + 4, 12, 22, tOn),
               warn: ST.ObjectsW4.laserWarm(ls, ((ls.period - 1 - ls.phase) % ls.period + ls.period) % ls.period),
               zaps: ST.ObjectsW4.zaps };
    }""")
    ok('雷射：開啟時會傷人', G['hitOn'], G)
    ok('雷射：關閉時走得過去', not G['hitOff'], G)
    ok('雷射：只在那一欄傷人', not G['away'], G)
    ok('雷射：開啟前有預警幀（laserWarm）', G['warn'], G['warn'])
    ok('無敵星期間雷射不扣血', G['zaps'] == 0, G['zaps'])

    Lf = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-1'];
      ST.ObjectsW4.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const t = 1, b = ST.ObjectsW4.liftTops(t)[0];
      const h = __hero(b.x0 + 8, b.top - 22);
      h.prevFeet = b.top; h.vy = 1;
      const g = { hero: h, camX: 0, level: L };
      const x0 = h.x;
      let rode = 0;
      for (let f = 0; f < 60; f++) { h.vy = 1; h.prevFeet = h.y + 22; ST.ObjectsW4.update(g); if (h.onMover) rode++; }
      return { rode: rode, dx: h.x - x0, onMover: !!h.onMover, rides: ST.ObjectsW4.rides };
    }""")
    ok('齒輪升降台：站上去會被認定為 onMover', Lf['rode'] > 30, Lf)
    ok('齒輪升降台：水平台會把主角帶著走', Lf['dx'] != 0, Lf['dx'])

    print('[⑥ 三種新敵 + 螺栓彈]')
    E = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-1'];
      ST.Enemies.init(L);
      const out = {};
      out.kinds = ST.Enemies.KINDS.slice();
      // drone：在生成點附近來回
      const dr = ST.Enemies.spawnTest('drone', 800, 100, { range: 40 });
      let minX = 9999, maxX = -9999;
      for (let f = 0; f < 240; f++) { ST.Enemies.update({ camX: 700, level: L, hero: null }); minX = Math.min(minX, dr.x); maxX = Math.max(maxX, dr.x); }
      out.droneSpan = maxX - minX;
      out.droneStompable = dr.stompable;
      out.droneBob = dr.y !== 100 || true;
      // guard：護罩開關循環 + 只有開著才可踩
      ST.Enemies.reset();
      const gd = ST.Enemies.spawnTest('guard', 200, 168, { dir: -1 });
      const C = ST.EnemiesW4.CONST;
      let closedStomp = null, openStomp = null, openSeen = 0, closedSeen = 0;
      for (let f = 0; f < C.GRD_CLOSED + C.GRD_OPEN + 4; f++) {
        ST.Enemies.update({ camX: 100, level: L, hero: null });
        if (gd.open) { openSeen++; if (openStomp === null) openStomp = gd.stompable; }
        else { closedSeen++; if (closedStomp === null) closedStomp = gd.stompable; }
      }
      out.guard = { closedStomp, openStomp, openSeen, closedSeen };
      // 關閉時踩不死、打開時踩得死
      ST.Enemies.reset();
      const gd2 = ST.Enemies.spawnTest('guard', 200, 168, { dir: -1, phase: 0 });
      ST.Enemies.update({ camX: 100, level: L, hero: null });
      out.stompClosed = ST.Enemies.stomp(gd2);
      ST.Enemies.reset();
      const gd3 = ST.Enemies.spawnTest('guard', 200, 168, { dir: -1, phase: C.GRD_CLOSED });
      ST.Enemies.update({ camX: 100, level: L, hero: null });
      out.stompOpen = ST.Enemies.stomp(gd3);
      // sentry：週期射螺栓
      ST.Enemies.reset();
      const sn = ST.Enemies.spawnTest('sentry', 400, 176, {});
      let bolts = 0;
      const gs = { camX: 300, level: L, hero: { x: 340, y: 170, w: 12, h: 22 }, sfx: function () {} };
      for (let f = 0; f < 200; f++) {
        ST.Enemies.update(gs);
        ST.Enemies.each(function (e) { if (e.kind === 'bolt') bolts = Math.max(bolts, 1); });
      }
      out.bolts = bolts;
      out.sentryStompable = sn.stompable;
      // bolt：水平直線（不受重力）
      ST.Enemies.reset();
      const bl = ST.Enemies.spawnTest('bolt', 500, 120, { dir: -1 });
      const by0 = bl.y, bx0 = bl.x;
      for (let f = 0; f < 20; f++) ST.Enemies.update({ camX: 400, level: L, hero: null });
      out.boltDy = bl.y - by0;
      out.boltDx = bl.x - bx0;
      out.boltFragile = bl.fragile;
      out.boltStompable = bl.stompable;
      return out;
    }""")
    ok('ST.Enemies.KINDS 有 drone / guard / sentry / bolt',
       {'drone', 'guard', 'sentry', 'bolt'} <= set(E['kinds']), E['kinds'])
    ok('drone：在生成點附近來回巡邏（跨度 ≥ 40 px）', E['droneSpan'] >= 40, E['droneSpan'])
    ok('drone 可踩', E['droneStompable'] is True)
    ok('guard：護罩關閉時不可踩', E['guard']['closedStomp'] is False, E['guard'])
    ok('guard：排氣窗開啟時可踩（弱點窗口）', E['guard']['openStomp'] is True, E['guard'])
    ok('guard：一個循環裡關閉與開啟都出現過',
       E['guard']['closedSeen'] > 0 and E['guard']['openSeen'] > 0, E['guard'])
    ok('guard：關閉時 stomp() 回 false', E['stompClosed'] is False)
    ok('guard：開啟時 stomp() 回 true', E['stompOpen'] is True)
    ok('sentry 可踩', E['sentryStompable'] is True)
    ok('sentry 會射螺栓', E['bolts'] == 1, E['bolts'])
    ok('螺栓是水平直線（不受重力）', E['boltDy'] == 0, E['boltDy'])
    ok('螺栓會往發射方向飛', E['boltDx'] < 0, E['boltDx'])
    ok('螺栓不可踩、碰到就消失（fragile）',
       E['boltStompable'] is False and E['boltFragile'] is True)

    print('[⑦ 魔王「核心守護者」]')
    Bo = page.evaluate(r"""() => {
      const L = ST.LEVELS['4-4'], B = ST.BossW4;
      B.init(L);
      const out = { maxHp: B.MAX_HP, spawnX: B.spawnX };
      B.update({ camX: 0, level: L, hero: null });
      out.idleFar = B.active;
      const g = { camX: L.boss.x - 280, level: L, hero: { x: L.boss.x - 40, y: 170, w: 12, h: 22, vy: 1, inv: 0 },
                  onStomp: function () {}, onHurt: function () { out.hurt = (out.hurt || 0) + 1; },
                  onDie: function (how) { out.die = how; }, sfx: function () {} };
      B.update(g);
      out.active = B.active;
      const seen = {};
      let gears = 0, bolts = 0;
      for (let f = 0; f < 700; f++) {
        B.update(g);
        seen[B.phase] = (seen[B.phase] || 0) + 1;
        B.hammers.each(function (s) { if (s.gear) gears++; else bolts++; });
      }
      out.phases = Object.keys(seen).sort();
      out.gears = gears > 0;
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
    ok('砸地會放出滾動齒輪', Bo['gears'], Bo['gears'])
    ok('踩 5 次就擊破（多階段）', Bo['dead'] is True and Bo['hp'] == 0, (Bo['stomps'], Bo['hp']))
    ok('血量下降會升階（stage 1 → 2 → 3）',
       sorted(set(Bo['stages'])) == [1, 2, 3] or max(Bo['stages']) >= 3, Bo['stages'])

    print('[⑧ 曲目（works / core / boss4）]')
    A = page.evaluate(r"""() => {
      const A = ST.Audio, keys = ['works', 'core', 'boss4'];
      const v = A.validate ? A.validate() : null;
      return {
        keys: keys.map(k => ({ k: k, has: A.has(k), info: A.INFO[k] || null })),
        inKeys: keys.every(k => A.KEYS.indexOf(k) >= 0),
        validate: Array.isArray(v) ? v.length : (v && v.ok === false ? 1 : 0),
        errs: Array.isArray(v) ? v.slice(0, 3) : []
      };
    }""")
    ok('三首 W4 曲都註冊進 ST.Audio.SONGS', all(x['has'] for x in A['keys']), A['keys'])
    ok('三首都在 ST.Audio.KEYS 裡（play(key) 找得到）', A['inKeys'])
    for x in A['keys']:
        inf = x['info'] or {}
        ok('%s 有長度資訊且會 loop' % x['k'], (inf.get('frames') or 0) > 200 and inf.get('loop') is True, inf)
    ok('ST.Audio.validate() 全過（只用五聲道 / 音符合法）', A['validate'] == 0, A['errs'])

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
    print('[⑩ 真頁：bank 切換 / 輸送帶 / 雷射 / 升降台 / 崩塌抖動 / 魔王 / 旗桿]')

    # ---- 精靈 bank 真的切過去，而且主角還是主角 ----
    s = fresh(page, '4-1')
    eq('?level=4-1 直接開世界 4', (s['level'], s['world']), ('4-1', 4))
    eq('4-1 載入後圖樣表 1 = st_spr_w4', s['sprBank'], 'st_spr_w4')
    H = page.evaluate(r"""() => {
      const w4 = ST.SprBanks.bankOf(4);
      const bad = [];
      Object.keys(ST.heroTiles).forEach(k => { if (ST.heroTiles[k] !== (w4.index(k) | 1)) bad.push(k); });
      return { bad: bad.slice(0, 4), n: Object.keys(ST.heroTiles).length };
    }""")
    ok('換 bank 後 ST.heroTiles 仍指到正確的主角磚', H['bad'] == [], H)
    B2 = page.evaluate(r"""() => {
      GAME.dev.level('2-1');
      const a = window.GAME.state().sprBank;
      GAME.dev.level('4-2');
      const b = window.GAME.state().sprBank;
      return { w2: a, w4: b };
    }""")
    eq('切回世界 2 ⇒ 圖樣表 1 回主 bank', B2['w2'], 'st_spr')
    eq('再切到 4-2 ⇒ 又換成 st_spr_w4', B2['w4'], 'st_spr_w4')

    # ---- 輸送帶：站著不動也會被帶著走 ----
    fresh(page, '4-1')
    Be = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      const b = ST.LEVELS['4-1'].belts[0];
      d.warp(b.c * 8 + 16); __nes.step(6);
      d.hero().inv = 900;                   // 隔離測試：別讓路過的敵人把主角撞開
      const x0 = S().x, b0 = S().belted;
      __nes.step(60);                       // 完全不按鍵（__nes.press(0,…) 不是「不按」）
      const s = S();
      return { dir: b.dir, x0: x0, x1: s.x, belted: s.belted - b0 };
    }""")
    ok('站在順向輸送帶上不按鍵也會被往前帶（60 幀 ≈ 30 px）',
       Be['x1'] - Be['x0'] >= 28 and Be['x1'] - Be['x0'] <= 32, Be)
    ok('state().belted 有計數（60 幀 = 60 次）', Be['belted'] == 60, Be['belted'])

    # ---- 雷射：開啟時真的傷人 ----
    fresh(page, '4-1')
    Zp = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      d.setLives(9);
      const ls = ST.LEVELS['4-1'].lasers[0];
      const box = ST.ObjectsW4.laserBox(ls);
      d.warp(box.x - 2); __nes.step(4);
      let n = 0;
      while (S().zaps === 0 && n++ < 400) { d.hero().inv = 0; __nes.step(1); }
      return { zaps: S().zaps, frames: n, hits: S().hits };
    }""")
    ok('站在雷射柵欄上會被打到（zaps > 0）', Zp['zaps'] > 0, Zp)

    # ---- 升降台：載著主角走 ----
    fresh(page, '4-1')
    R = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      const L = ST.LEVELS['4-1'], m = L.lifts[0];
      let n = 0;
      while (n++ < 600) {
        const b = ST.ObjectsW4.liftTops(ST.ObjectsW4.now() + 1)[0];
        if (b.x0 <= m.c * 8 + 2) break;
        __nes.step(1);
      }
      const b0 = ST.ObjectsW4.liftTops(ST.ObjectsW4.now())[0];
      d.warp(b0.x0 + 8, b0.top - 24); __nes.step(6);
      const on = S(); const x0 = on.x;
      __nes.step(60);
      const after = S();
      return { onMover: on.onMover || after.onMover, x0: x0, x1: after.x, lifted: after.lifted };
    }""")
    ok('站上齒輪升降台 → state().onMover = true', R['onMover'], R)
    ok('升降台會把主角水平帶著走', R['x1'] != R['x0'], (R['x0'], R['x1']))

    # ---- 崩塌鋼板：會碎、而且碎之前有抖動粒子（R4 新增，W2 也受惠）----
    for lid, label in [('4-1', 'W4'), ('2-1', 'W2')]:
        fresh(page, lid)
        Cb = page.evaluate(r"""(id) => {
          const T = ST.TILE, d = GAME.dev, L = ST.LEVELS[id];
          let cc = -1, rr = -1;
          for (let c = 0; c < L.cols && cc < 0; c++) for (let r = 4; r < 30; r++)
            if (L.tileAt(c, r) === T.CRUMBLE) { cc = c; rr = r; break; }
          d.warp(cc * 8 + 2, rr * 8 - 22); __nes.step(4);
          const puff0 = ST.World.oam16('W_PUFF0'), puff1 = ST.World.oam16('W_PUFF1');
          let shook = 0, n = 0, maxT = 0;
          while (d.tileAt(cc, rr) === T.CRUMBLE && n++ < 200) {
            __nes.step(1);
            maxT = Math.max(maxT, ST.Objects.crumbleTimer(cc, rr));
            const ppu = NES.instance.ppu;
            for (let i = 0; i < 64; i++) {
              const sp = ppu.getSprite(i);
              if (sp && (sp.tile === puff0 || sp.tile === puff1) && sp.y < 240) { shook++; break; }
            }
          }
          return { cc, rr, after: d.tileAt(cc, rr), shook, frames: n, maxT,
                   hold: ST.Objects.CRUMBLE_HOLD, shake: ST.Objects.CRUMBLE_SHAKE };
        }""", lid)
        ok('%s（%s）站在崩塌鋼板上，它會碎掉' % (lid, label), Cb['after'] == 0, Cb)
        ok('%s（%s）碎掉前有抖動粒子（≥ %d 幀）' % (lid, label, Cb['shake'] - 2),
           Cb['shook'] >= Cb['shake'] - 2, (Cb['shook'], Cb['shake']))

    # ---- 魔王：真的打得死，且過關 ----
    fresh(page, '4-4')
    Bo = page.evaluate(r"""() => {
      const S = () => window.GAME.state(), d = GAME.dev;
      d.setLives(9);
      d.warp(215 * 8); __nes.step(6);
      const b0 = d.boss();
      const mod = d.g().bossMod === ST.BossW4;
      let n = 0;
      while (!d.boss().dead && n++ < 40) { ST.BossW4.inv = 0; ST.BossW4.stomp(); __nes.step(60); }
      const b1 = d.boss();
      let m = 0; while (S().mode === 'play' && m++ < 300) __nes.step(1);
      return { mod: mod, active: b0.active, hp0: b0.hp, dead: b1.dead, hp1: b1.hp, mode: S().mode };
    }""")
    ok('4-4 用的是 ST.BossW4（核心守護者）', Bo['mod'] is True)
    ok('進魔王房 → 核心守護者啟動（5 血）', Bo['active'] is True and Bo['hp0'] == 5, Bo)
    ok('踩 5 次 → 擊破', Bo['dead'] is True and Bo['hp1'] == 0, Bo)
    ok('擊破 → 過關（mode = clear）', Bo['mode'] == 'clear', Bo['mode'])

    # ---- 標題 SELECT 可以切到 WORLD 4 ----
    page.goto(BASE)
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(2)')
    W = page.evaluate(r"""() => {
      const out = [];
      for (let i = 0; i < 4; i++) { __nes.tap('select', 1); __nes.step(3); out.push(window.GAME.state().titleWorld); }
      return { seq: out, txt: GAME.dev.screenText(11, 11, 7) };
    }""")
    ok('標題連按 SELECT 會走到 WORLD 4', 4 in W['seq'], W['seq'])
    W2 = page.evaluate(r"""() => {
      let n = 0;
      while (window.GAME.state().titleWorld !== 4 && n++ < 8) { __nes.tap('select', 1); __nes.step(3); }
      const txt = GAME.dev.screenText(11, 11, 7);
      __nes.tap('start', 1); __nes.step(4);
      const s = window.GAME.state();
      return { txt: txt, mode: s.mode, level: s.level };
    }""")
    eq('WORLD 4 的字真的畫出來', W2['txt'], 'WORLD 4')
    ok('WORLD 4 按 START → 直接開 4-1', W2['mode'] == 'play' and W2['level'] == '4-1', W2)

    # ---- 旗桿演出（W4 四關都有）----
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


def body_fix(page):
    """fix-r4（qa-r4 P2-1 / P3-2）的回歸：機器人硬直中不浪費跳躍、每線精靈 ≤ 8。"""
    print('[⑫ fix-r4：受擊硬直不吃掉跳躍（P2-1）/ 每線精靈 ≤ 8（P3-2）]')

    # ---- P2-1：硬直（state='hurt'）中按 A 無效，機器人要放開 A、恢復後重新決策 ----
    fresh(page, '4-1')
    page.evaluate(BOT_JS, {'seed': 1, 'maxFrames': 20000})
    H = page.evaluate("""() => {
      const d = GAME.dev, h = d.hero();
      window.__botStep(30);
      window.__bot.jump = 20;                 // 假裝剛決定要跳
      h.state = 'hurt'; h.hurtTimer = 8;      // 這一幀被打到
      window.__botStep(1);
      const during = { jump: window.__bot.jump, state: d.hero().state };
      for (let i = 0; i < 10; i++) window.__botStep(1);
      const after = { state: d.hero().state, wait: window.__bot.hurtWait };
      return { during: during, after: after };
    }""")
    eq('硬直中機器人取消待發的跳躍（放開 A）', H['during']['jump'], 0)
    eq('硬直結束後回到正常狀態', H['after']['state'] != 'hurt', True)
    ok('硬直旗標在恢復後清掉（重新決策）', not H['after']['wait'], H['after'])

    # ---- P2-1 端對端：icons2x 開著（= R4 的新基準）4-1 仍然 0 死通關 ----
    fresh(page, '4-1')
    page.evaluate("() => GAME.dev.icons2x(true)")
    page.evaluate("(n) => GAME.dev.setLives(n)", 60)
    page.evaluate(BOT_JS, {'seed': 1, 'maxFrames': 20000})
    R = page.evaluate(BOT_SPRLINE, {'frames': 4000})
    ok('4-1：icons2x 開著、seed 1 ⇒ cleared / %d 幀 / %d 死（P2-1 的新基準）'
       % (R['frames'], R['deaths']), R['cleared'] and R['deaths'] == 0, R)
    ok('4-1 全程每線精靈 %d ≤ 8（線 %s / 幀 %s）' % (R['peak'], R['line'], R['frame']),
       R['peak'] <= 8, R)

    # ---- P3-2：其餘三關的「編排規則」（靜態，不靠輪替） ----
    S = page.evaluate("""() => {
      const out = {};
      for (const id of ['4-1', '4-2', '4-3', '4-4']) {
        const L = ST.LEVELS[id], lifts = L.lifts || [];
        const ground = (L.groundRow || 24) * 8;      // 地面上緣
        const bad = [], pairs = [];
        lifts.forEach((m, i) => {
          const y0 = m.r * 8, y1 = y0 + (m.axis === 'y' ? (m.range | 0) : 0) + 16;   // 精靈佔的 y 範圍
          // 規則 ①：橫走的升降台（4 顆精靈）不可以壓到地面敵人那一條帶（地面上緣 −16 以下）
          if (m.axis !== 'y' && y1 > ground - 16) bad.push([i, m.r, y1, ground - 16]);
          lifts.forEach((n, j) => {
            if (j <= i) return;
            // 規則 ②：同屏（相距 < 36 欄 ≈ 一個畫面）的兩座升降台，精靈帶不可以重疊
            if (Math.abs(m.c - n.c) >= 36) return;
            const z0 = n.r * 8, z1 = z0 + (n.axis === 'y' ? (n.range | 0) : 0) + 16;
            if (y0 < z1 && z0 < y1) pairs.push([i, j, [y0, y1], [z0, z1]]);
          });
        });
        out[id] = { bad: bad, pairs: pairs, lifts: lifts.length };
      }
      return out;
    }""")
    for lid in IDS:
        ok('%s 橫走升降台不壓地面敵人那一帶（每線 4 + 2 + 2 = 8 的額度）' % lid,
           not S[lid]['bad'], S[lid]['bad'])
        ok('%s 同屏的兩座升降台精靈帶不重疊（不會一次 8 顆）' % lid,
           not S[lid]['pairs'], S[lid]['pairs'])

    # ---- P3-2：魔王關（4-4）整場戰鬥的每線精靈 ----
    fresh(page, '4-4')
    page.evaluate("(n) => GAME.dev.setLives(n)", 60)
    page.evaluate(BOT_JS, {'seed': 1, 'maxFrames': 20000})
    R4 = page.evaluate(BOT_SPRLINE, {'frames': 4000})
    ok('4-4（含魔王戰）全程每線精靈 %d ≤ 8' % R4['peak'], R4['peak'] <= 8, R4)
    ok('4-4 仍然 0 死通關（%d 幀）' % R4['frames'], R4['cleared'] and R4['deaths'] == 0, R4)
    V = page.evaluate("""() => {
      // 齊射改成「高低兩條車道」之後，同一條掃描線最多 2 發：把 stage 3 的 4 發打出來，
      // 看落點 y 真的分成兩組（差 16 px = 一個精靈高）。
      const B = ST.BossW4, P = B.CONST.PHASE, ys = [];
      B.stage = 3; B.shots = 0; B.active = true; B.alive = true; B.x = 160; B.y = 160; B.facing = -1;
      const hero = { x: 100, y: 160, w: 12, h: 22 };
      for (let i = 0; i < P[2].volley; i++) { const s = B.shoot(hero.y + ((B.shots & 1) ? 16 : 0)); B.shots++; if (s) ys.push(s.y); }
      const uniq = ys.filter((v, i) => ys.indexOf(v) === i).sort((a, b) => a - b);
      return { volley: P.slice(1).map(p => p.volley), ys: ys, uniq: uniq };
    }""")
    eq('stage 3 仍然齊射 4 發（威脅不變，只改落點）', V['volley'][2], 4)
    ok('齊射落在高低兩條車道、相差 16 px（每條線最多 2 發）',
       len(V['uniq']) == 2 and (V['uniq'][1] - V['uniq'][0]) == 16, V)


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
        body_fix(page2)
        ok('整場測試 0 個 JS 例外 / console error', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad = [r for r in results if not r[0]]
    print('')
    print('=' * 64)
    print('star-w4 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    print('總結：' + ('PASS' if not bad else 'FAIL'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
