# -*- coding: utf-8 -*-
"""《星塵勇者》世界 3「霧沼古樹」自動驗證（R4 F4-1 star-w3）。

兩個 harness（結構沿用 test_w2.py）：
  ① 隔離頁（about:blank + add_script_tag）：只載 engine + games/star 的資料層
     （chr_world / chr_w2 / chr_w3 / levels_w1 / levels_w3 / enemies / enemies_w3 /
      boss / boss_w3 / objects_w2 / objects_w3 / song / song_w3），
     驗「CHR 分頁 / 四關資料合法性 / 可達性 BFS / 四個新機關 / 三新敵 / 魔王兩條打法 / 曲目 / lint」。
  ② 真頁（star.html?level=3-x）：驗「機關真的會動（樹菇 / 藤蔓 / 孢子雲 / 暗區）、
     魔王可擊破、旗桿演出、標題 SELECT 切得到 WORLD 3」，每關 lint + 留 3 張代表截圖。

用法：
    ../卡比之星/.venv/bin/python games/star/test_w3.py [-v] [--shots shots/agent_w3]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

可達性模型（同 test_w1 / test_w2）：
  站立格 → 走 / 跳 4 格高（64 px = 8 列）/ 跨 5 格寬（80 px = 10 欄）/ 落下任意高。
  **另外**把「會縮的樹菇」（ST.Objects.moverTops 會回報的那些）算成可站立格。
"""
import base64
import importlib.util
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
SHOTS = ROOT / 'shots' / 'agent_w3'
if '--shots' in sys.argv:
    SHOTS = ROOT / sys.argv[sys.argv.index('--shots') + 1]

ENGINE = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js', 'ppu.js', 'nes_lint.js',
          'apu.js', 'music.js', 'shmup.js']
GAME = ['chr_world.js', 'chr_w2.js', 'chr_w3.js', 'song.js', 'song_w2.js', 'song_w3.js',
        'hero.js', 'enemies.js', 'enemies_w2.js', 'enemies_w3.js', 'boss.js', 'boss_w2.js', 'boss_w3.js',
        'objects_w2.js', 'objects_w3.js', 'levels_w1.js', 'levels_w2.js', 'levels_w3.js']
IDS = ['3-1', '3-2', '3-3', '3-4']
SCREENS = {'3-1': 10, '3-2': 10, '3-3': 9, '3-4': 8}
THEMES = {'3-1': 'swamp', '3-2': 'swamp', '3-3': 'grove', '3-4': 'hollow'}
SONGS = ['swamp', 'grove', 'hollow', 'boss3']
BASE = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'

results = []


def _bot_js():
    """借用 tools/playthrough_star.py 的機器人（同一支，不另外抄一份）。"""
    spec = importlib.util.spec_from_file_location('ps_bot3', ROOT / 'tools' / 'playthrough_star.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.BOT_JS


BOT_JS = _bot_js()

# 機器人跑一關、每一幀量「每條掃描線最多幾顆精靈」（直接讀 OAM，不用 render）。
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
  // 假造 star-hero 的份額（背景 HUD 69 磚 / 精靈主角 33 個 8×16 = 66 磚）
  const HERO = blanks(33, 'HERO_');
  const bg  = NES.CHR.bank('st_bg',  Object.assign({}, blanks(69, 'HUD_'), ST.BG_WORLD, ST.BG_W2, ST.BG_W3));
  // 主 bank（W1 + W2）與 W3 分頁：前 182 磚必須逐名同索引
  const sprMain = NES.CHR.bank('st_spr', Object.assign({}, HERO, ST.SPR_WORLD, ST.SPR_W2));
  ST.SPR_HERO_FAKE = HERO;
  const realHero = ST.SPR_HERO;
  ST.SPR_HERO = HERO;                                   // 讓 SprBanks 用同一份假主角磚
  const sprW3 = ST.SprBanks.bankOf(3);
  ST.SPR_HERO = realHero;
  ST.sprBank = sprMain;
  NES.CHR.setPattern(0, bg);
  NES.CHR.setPattern(1, sprW3);
  ST.World.bind(bg, sprW3);                             // W3 分頁含主角 + W1 世界 ⇒ 什麼都查得到
  ST.Levels.rebind();

  // 索引逐名比對（主角 + W1 世界的每一個磚名）
  let mismatch = [];
  Object.keys(HERO).concat(Object.keys(ST.SPR_WORLD)).forEach(k => {
    if (sprMain.index(k) !== sprW3.index(k)) mismatch.push(k);
  });

  const canvas = document.getElementById('nes');
  const timing = NES.Timing.create({ update: function () {}, draw: function () {} });
  const ppu = NES.PPU.create(canvas, { scale: 3 });
  ppu.budget = timing.budget;
  ppu.setPatternTables(0, 1);
  ppu.spriteMode(16);
  ppu.flickerStep = 0;
  window.__h = { bg: bg, spr: sprW3, sprMain: sprMain, ppu: ppu, timing: timing };

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
    const B = (L.bossKind === 'treelord') ? ST.BossW3 : ST.Boss;
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
                onVine: null, onCap: null, vineStrike: 0,
                star: 0, inv: 0, state: 'idle', facing: 1, stars: 0, pitSaves: 0,
                px: FX.Vec(x), py: FX.Vec(y), vxA: FX.Acc(0), vyA: FX.Acc(0) };
    h.jumpS = FX.SMB.jumpState(h.vyA);
    return h;
  };
  // 假手把（藤蔓要讀 ↑ / A）
  window.__pad = function (held, pressed) {
    return { held: b => (held & b) !== 0, pressed: b => (pressed & b) !== 0 };
  };

  return {
    bgTiles: bg.tiles.length, sprMainTiles: sprMain.tiles.length, sprW3Tiles: sprW3.tiles.length,
    mismatch: mismatch, w3Bg: ST.W3_BG_TILES, w3Spr: ST.W3_SPR_TILES,
    worldBg: ST.World.bgTiles, worldSpr: ST.World.sprTiles,
    hasSH: !!(window.NES && NES.SH && NES.SH.Scroller),
    ids: ST.Levels.ids.slice(),
    songs: ST.W3_SONGS || [],
    regW3: !!(ST.SprBanks && ST.SprBanks.has(3))
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
  // 會縮的樹菇：存在時的落腳面也算可站立格（機關是關卡資料的一部分）
  const caps = L.caps || [];
  let capCells = 0;
  for (let i = 0; i < caps.length; i++) {
    const m = caps[i], row = m.r;
    for (let cc = m.c; cc < m.c + m.w; cc++) {
      if (cc < 0 || cc >= cols || row < TOP || row >= ROWS) continue;
      if (!stand[row * cols + cc]) { stand[row * cols + cc] = 1; capCells++; }
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
  // 純地形備援：把樹菇格全部拔掉，再 BFS 一次（不靠機關也要走得到終點）
  const stand2 = new Uint8Array(ROWS * cols);
  for (r = 0; r < ROWS; r++) for (c = 0; c < cols; c++) {
    k = ST.solidKind(L.tileAt(c, r));
    if (k !== 'solid' && k !== 'oneway') continue;
    if (r - HERO_ROWS < TOP) continue;
    let good = true;
    for (let y = r - HERO_ROWS; y <= r - 1; y++) {
      if (solid[y * cols + c]) { good = false; break; }
      if (ST.solidKind(L.tileAt(c, y)) === 'hurt') { good = false; break; }
    }
    if (good) stand2[r * cols + c] = 1;
  }
  const seen2 = new Uint8Array(ROWS * cols), q2 = [];
  seen2[sr * cols + sc] = 1; q2.push(sr * cols + sc);
  for (let head = 0; head < q2.length; head++) {
    const id0 = q2[head], rA = (id0 / cols) | 0, cA = id0 % cols;
    for (let dc = -SPAN_LOW; dc <= SPAN_LOW; dc++) {
      const cB = cA + dc; if (cB < 0 || cB >= cols) continue;
      for (let dr = -MAXUP; dr <= MAXDOWN; dr++) {
        const rB = rA + dr; if (rB < 0 || rB >= ROWS) continue;
        const idB = rB * cols + cB;
        if (!stand2[idB] || seen2[idB] || !edgeOk(cA, rA, cB, rB)) continue;
        seen2[idB] = 1; q2.push(idB);
      }
    }
  }
  let maxCol2 = -1;
  for (c = 0; c < cols; c++) { for (let rr = 0; rr < ROWS; rr++) if (seen2[rr * cols + c]) { maxCol2 = c; break; } }

  const groundKinds = { roller: 1, bouncer: 1, leaper: 1, thorn: 1 };
  const badSpawns = L.spawns.filter(s => groundKinds[s.kind] && colRow(s.col) < 0).map(s => s.col);
  return {
    nodes: q.length, maxCol: maxCol, goalCol: L.goal.col, goalReached: maxCol >= L.goal.col,
    noCapGoal: maxCol2 >= L.goal.col, capCells: capCells,
    cps: L.checkpoints.map(cp => ({ col: cp, row: colRow(cp) })),
    pit: pit, pitAt: pitAt, hz: hz, hzAt: hzAt, wall: wall, wallAt: wallAt,
    safeBad: safeBad, badSpawns: badSpawns
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
  const d = L.def, oob = [];
  (d.caps || []).forEach((m, i) => {
    if (m.c < 0 || m.c + m.w > L.cols) oob.push(['capCol', i, m.c, m.w]);
    if (m.r < 4 || m.r >= L.rows) oob.push(['capRow', i, m.r]);
    if (!(m.on > 0 && m.on < m.period)) oob.push(['capDuty', i, m.on, m.period]);
  });
  (d.vines || []).forEach((v, i) => {
    if (v.c - (v.range >> 3) < 0 || v.c + (v.range >> 3) >= L.cols) oob.push(['vineCol', i, v.c]);
    if (v.r < 4 || v.r * 8 + v.len > L.rows * 8) oob.push(['vineRow', i, v.r, v.len]);
    if (!(v.period > 1) || (v.period & 1)) oob.push(['vinePeriod', i, v.period]);
  });
  (d.spores || []).forEach((s, i) => {
    if (s.c < 0 || s.c >= L.cols) oob.push(['sporeCol', i, s.c]);
    if (s.r < 4 || s.r >= L.rows) oob.push(['sporeRow', i, s.r]);
    if (!(s.period > 1)) oob.push(['sporePeriod', i, s.period]);
  });
  (d.glooms || []).forEach((z, i) => {
    if (z.c0 < 0 || z.c1 >= L.cols || z.c0 >= z.c1) oob.push(['gloom', i, z.c0, z.c1]);
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
    caps: (d.caps || []).length, vines: (d.vines || []).length,
    spores: (d.spores || []).length, glooms: (d.glooms || []).length,
    items: (L.items || []).length,
    crumble: used[T.CRUMBLE] || 0, lava: used[T.LAVA] || 0,
    movers: (L.movers || []).length, geysers: (L.geysers || []).length,
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
    print('[① CHR：世界 3 的精靈分頁（真機 CHR banking）]')
    ok('chr_w3 載入（BG_W3 / SPR_W3 都在）', info['w3Bg'] >= 25 and info['w3Spr'] >= 50,
       'bg=%s spr=%s' % (info['w3Bg'], info['w3Spr']))
    ok('ST.SprBanks 有登記世界 3（st_spr_w3）', info['regW3'] is True)
    ok('W3 精靈分頁 ≤ 256 磚', info['sprW3Tiles'] <= 256, info['sprW3Tiles'])
    ok('主精靈 bank 仍 ≤ 256 磚（沒被 W3 撐爆）', info['sprMainTiles'] <= 256, info['sprMainTiles'])
    ok('合併後背景 bank ≤ 256 磚（W3 的 34 磚併進同一張）', info['bgTiles'] <= 256, info['bgTiles'])
    ok('兩張精靈 bank 的「主角 + W1 世界」索引逐名相同（切分頁不會畫錯）',
       info['mismatch'] == [], info['mismatch'][:4])
    ok('W1 的 ST.SPR_WORLD / BG_WORLD 容量契約沒被破壞',
       info['worldSpr'] <= 128 and info['worldBg'] <= 192, (info['worldSpr'], info['worldBg']))
    ok('ST.Levels.ids 含 3-1..3-4', all(i in info['ids'] for i in IDS), info['ids'])

    print('[② 三個新主題（swamp / grove / hollow）與換皮]')
    TH = page.evaluate(r"""() => {
      const T = ST.TILE, K = ST.LevelKit, names = ['swamp', 'grove', 'hollow'];
      const out = names.map(t => ({
        t: t,
        ground: K.themeName(t, T.GROUND), dirt: K.themeName(t, T.DIRT),
        plat: K.themeName(t, T.PLATFORM), spike: K.themeName(t, T.SPIKE),
        crumble: K.themeName(t, T.CRUMBLE), lava: K.themeName(t, T.LAVA),
        pal: ST.PAL_WORLD[t] || null, dark: (ST.PAL_W3_DARK || {})[t] || null
      }));
      const flat = [];
      out.forEach(o => { if (o.pal) { flat.push(o.pal.backdrop); o.pal.bg.forEach(p => p.forEach(v => flat.push(v))); o.pal.spr.forEach(p => p.forEach(v => flat.push(v))); } });
      const badColor = flat.filter(v => !(v >= 0 && v <= 0x3F) || v === 0x0D);
      return { out: out, badColor: badColor };
    }""")
    for o in TH['out']:
        ok('%s 主題：地形 / 平台 / 荊棘都換成 W3 的磚' % o['t'],
           o['ground'].startswith('BG_') and o['ground'] not in ('BG_GTOP', 'BG_ROCKTOP', 'BG_STONE_T')
           and o['plat'] == 'BG_LEAF_M' and o['spike'] == 'BG_THORNB', o)
        ok('%s 有自己的調色盤 + 暗區版' % o['t'], bool(o['pal']) and bool(o['dark']), o['t'])
    ok('毒水沿用 LAVA 語意（兩幀動畫）但吃主題調色盤',
       all(o['lava'] == 'BG_LAVA0' for o in TH['out']), [o['lava'] for o in TH['out']])
    ok('所有新調色盤色號合法（0..$3F、不用禁色 $0D）', TH['badColor'] == [], TH['badColor'])

    print('[③ 四關資料合法性]')
    scans = {}
    for lid in IDS:
        sc = page.evaluate(SCAN, lid)
        scans[lid] = sc
        ok('%s 磚碼全在 0..TILE_COUNT' % lid, sc['badTile'] is None, sc['badTile'])
        ok('%s chrAt 全在 bank 範圍' % lid, sc['badChr'] is None, sc['badChr'])
        ok('%s attrAt 全在 0..3' % lid, sc['badAttr'] is None, sc['badAttr'])
        ok('%s 機關 / 道具 / 出怪座標都在關卡範圍內' % lid, sc['oob'] == [], sc['oob'][:3])
        eq('%s 長度 %d 畫面' % (lid, SCREENS[lid]), sc['cols'], SCREENS[lid] * 32)
        eq('%s 主題 = %s' % (lid, THEMES[lid]), sc['theme'], THEMES[lid])
        eq('%s 檢查點 2 個' % lid, len(sc['checkpoints']), 2)
        eq('%s 世界 = 3' % lid, sc['world'], 3)
        ok('%s 旗桿磚在 goal' % lid, sc['goalTile'] in (17, 18), sc['goalTile'])
        ok('%s 金幣 ≥ 30、敵人 ≥ 12' % lid, sc['coins'] >= 30 and sc['enemies'] >= 12,
           (sc['coins'], sc['enemies']))
        ok('%s 不用 W2 的升降板 / 間歇泉（精靈不在 W3 分頁）' % lid,
           sc['movers'] == 0 and sc['geysers'] == 0, (sc['movers'], sc['geysers']))
    ok('四關合計：樹菇 ≥ 10 / 藤蔓 ≥ 8 / 孢子雲 ≥ 10 / 暗區 ≥ 1',
       sum(scans[i]['caps'] for i in IDS) >= 10 and sum(scans[i]['vines'] for i in IDS) >= 8
       and sum(scans[i]['spores'] for i in IDS) >= 10 and sum(scans[i]['glooms'] for i in IDS) >= 1,
       {i: (scans[i]['caps'], scans[i]['vines'], scans[i]['spores'], scans[i]['glooms']) for i in IDS})
    ok('每關都有一顆無敵星', all(scans[i]['items'] >= 1 for i in IDS),
       [scans[i]['items'] for i in IDS])
    ok('三種新敵都有用到（leaper / thorn / wisp）',
       all(k in sum([scans[i]['spawnKinds'] for i in IDS], []) for k in ('leaper', 'thorn', 'wisp')))
    eq('3-4 是魔王關（bossKind = treelord）', scans['3-4']['bossKind'], 'treelord')
    ok('3-4 有魔王座標', scans['3-4']['hasBoss'] is True)

    print('[④ 可達性 BFS（含樹菇；另驗純地形備援路線）]')
    for lid in IDS:
        B = page.evaluate(BFS, lid)
        ok('%s BFS 走得到旗桿' % lid, B.get('goalReached') is True,
           (B.get('err'), B.get('maxCol'), B.get('goalCol')))
        ok('%s **不靠樹菇**也走得到旗桿（純地形備援）' % lid, B.get('noCapGoal') is True,
           (B.get('maxCol'), B.get('goalCol')))
        ok('%s 兩個檢查點都可站立' % lid, all(cp['row'] >= 0 for cp in B['cps']), B['cps'])
        ok('%s 最大坑寬 %d ≤ 8 欄' % (lid, B['pit']), B['pit'] <= 8, (B['pit'], B['pitAt']))
        ok('%s 最大危險帶 %d ≤ 8 欄' % (lid, B['hz']), B['hz'] <= 8, (B['hz'], B['hzAt']))
        ok('%s 最高的牆 %d 列 ≤ 8（靜止跳 64 px = 8 列）' % (lid, B['wall']),
           B['wall'] <= 8, (B['wall'], B['wallAt']))
        ok('%s 起點安全區乾淨' % lid, B['safeBad'] < 0, B['safeBad'])
        ok('%s 地面敵人都站在可達的地形上' % lid, B['badSpawns'] == [], B['badSpawns'])

    print('[⑤ 四個新機關都是「時間的純函式」]')
    M = page.evaluate(r"""() => {
      const L = ST.LEVELS['3-1'];
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const W3 = ST.ObjectsW3, out = {};
      // ① 藤蔓：同一個 t 一定回同一個位置；一個週期後回到原位；擺幅 = range
      const a = W3.vineTip(0, 100), b = W3.vineTip(0, 100), c = W3.vineTip(0, 100 + 160);
      out.vinePure = (a.x === b.x && a.y === b.y);
      out.vineLoop = (a.x === c.x && a.y === c.y);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (let t = 0; t < 160; t++) { const p = W3.vineTip(0, t); minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
      out.vineSpan = maxx - minx; out.vineRise = maxy - miny;
      // ② 樹菇：週期內「在」的幀數 = on
      let on = 0, warn = 0;
      for (let t = 0; t < 192; t++) { if (W3.capOn(0, t)) on++; if (W3.capWarn(0, t)) warn++; }
      out.capOn = on; out.capWarn = warn;
      out.capInMover = ST.Objects.moverTops(0).some(m => m.axis === 'cap');
      out.capGone = !ST.Objects.moverTops(130).some(m => m.axis === 'cap' && m.x0 === ST.LEVELS['3-1'].caps[0].c * 8);
      // ③ 孢子雲：hazardHit 會吃到
      const s0 = W3.sporeBox(0, 0), s1 = W3.sporeBox(0, 120);
      out.sporeMoves = (s0.x !== s1.x) || (s0.y !== s1.y);
      out.sporeHaz = ST.Objects.hazardHit(s0.x + 4, s0.y + 4, 8, 8, 0);
      out.sporeMiss = ST.Objects.hazardHit(s0.x + 4, s0.y - 80, 8, 8, 0);
      // ④ 暗區：欄區間
      const L2 = ST.LEVELS['3-2'];
      ST.Objects.init(L2, { setTile: function (c, r, k) { L2.setTile(c, r, k); } });
      out.gloomIn = !!W3.inGloom({ x: 160 * 8 });
      out.gloomOut = !!W3.inGloom({ x: 20 * 8 });
      out.counts = W3.count();
      return out;
    }""")
    ok('藤蔓位置是純函式（同一幀永遠同一個位置）', M['vinePure'] is True)
    ok('藤蔓一個週期（160 幀）後回到原位', M['vineLoop'] is True)
    ok('藤蔓擺幅 = 2×range（80 px）且兩端會抬高', M['vineSpan'] >= 70 and M['vineRise'] > 4,
       (M['vineSpan'], M['vineRise']))
    eq('樹菇一個週期（192 幀）在 128 幀', M['capOn'], 128)
    eq('樹菇消失前 20 幀有縮小預警', M['capWarn'], 20)
    ok('樹菇掛進 ST.Objects.moverTops（機器人推演吃得到）', M['capInMover'] is True)
    ok('樹菇不在的時候 moverTops 查不到它', M['capGone'] is True)
    ok('孢子雲會移動', M['sporeMoves'] is True)
    ok('孢子雲掛進 ST.Objects.hazardHit', M['sporeHaz'] is True and M['sporeMiss'] is False,
       (M['sporeHaz'], M['sporeMiss']))
    ok('暗區只在設定的欄區間內成立', M['gloomIn'] is True and M['gloomOut'] is False,
       (M['gloomIn'], M['gloomOut']))

    print('[⑥ 機關與主角的互動（抓藤蔓 / 站樹菇 / 中孢子）]')
    I = page.evaluate(r"""() => {
      const BTN = NES.Input.BTN, L = ST.LEVELS['3-1'], out = {};
      ST.Objects.init(L, { setTile: function (c, r, k) { L.setTile(c, r, k); } });
      const W3 = ST.ObjectsW3;
      // ---- 抓藤蔓：站在尖端位置、按住 ↑ ----
      let h = __hero(0, 0), g = { hero: h, camX: 0, level: L, input: __pad(0, 0) };
      for (let f = 0; f < 20; f++) ST.Objects.update(g);      // 推進時鐘
      let tip = W3.vineTip(0, ST.Objects.now() + 1);
      h.x = tip.x - 6; h.y = tip.y + 4; h.vy = 0;
      g.input = __pad(BTN.UP, 0);
      ST.Objects.update(g);
      out.grabbed = h.onVine === 0;
      // 吊著：位置跟著藤蔓尖端
      g.input = __pad(BTN.UP, 0);
      ST.Objects.update(g);
      tip = W3.vineTip(0, ST.Objects.now());
      out.follows = Math.abs(h.x - (tip.x - 6)) <= 1;
      // ---- 放手（按 A）：往上彈 + 20 幀衝撞窗口 ----
      g.input = __pad(0, BTN.A);
      ST.Objects.update(g);
      out.released = h.onVine === null;
      out.launchVy = h.vyA.v;
      out.strike = h.vineStrike;
      // ---- 不按 ↑ 不會誤抓（通關機器人不按 ↑）----
      let h2 = __hero(tip.x - 6, tip.y + 4), g2 = { hero: h2, camX: 0, level: L, input: __pad(0, 0) };
      ST.Objects.update(g2);
      out.noGrab = (h2.onVine === null || h2.onVine === undefined);
      // ---- 站樹菇：樹菇在的時候撐得住、不在就穿過 ----
      const cap = L.caps[0];
      let tOn = -1, tOff = -1;
      for (let t = 1; t < 400; t++) { if (tOn < 0 && W3.capOn(0, t)) tOn = t; if (tOff < 0 && !W3.capOn(0, t)) tOff = t; }
      function standTest(t) {
        ST.Objects.init(L, { setTile: function () {} });
        const hh = __hero(cap.c * 8 + 8, cap.r * 8 - 22 + 2);   // 腳剛好落進平台的接觸窗（+2 px）
        hh.vy = 2; hh.onGround = false; hh.prevFeet = cap.r * 8 - 2;
        const gg = { hero: hh, camX: 0, level: L, input: __pad(0, 0) };
        for (let f = 0; f < t; f++) { ST.Objects.frame = f; }
        ST.Objects.frame = t - 1;
        ST.Objects.update(gg);
        return { onGround: hh.onGround, y: hh.y, onCap: hh.onCap };
      }
      out.capStand = standTest(tOn + 1);
      out.capThrough = standTest(tOff + 1);
      // ---- 孢子雲：碰到會受傷（無敵星則不會）----
      ST.Objects.init(L, { setTile: function () {} });
      const sb = W3.sporeBox(0, ST.Objects.now() + 1);
      let h3 = __hero(sb.x + 2, sb.y + 2), hurt = 0;
      let g3 = { hero: h3, camX: 0, level: L, input: __pad(0, 0), onHurt: function () { hurt++; } };
      h3.hurtTimer = 0;
      ST.Objects.update(g3);
      out.sporeHurt = (h3.inv > 0 || hurt > 0 || h3.state === 'hurt');
      let h4 = __hero(sb.x + 2, sb.y + 2); h4.star = 300;
      let g4 = { hero: h4, camX: 0, level: L, input: __pad(0, 0) };
      ST.Objects.update(g4);
      out.sporeStar = !(h4.inv > 0 || h4.state === 'hurt');
      return out;
    }""")
    ok('按住 ↑ 碰到藤蔓 ⇒ 抓住', I['grabbed'] is True)
    ok('吊在藤蔓上：位置跟著尖端走', I['follows'] is True)
    ok('按 A 放手 ⇒ 往上彈（vy < 0）', I['released'] is True and I['launchVy'] < 0,
       (I['released'], I['launchVy']))
    eq('放手後有 20 幀的「藤蔓衝撞」窗口', I['strike'], 20)
    ok('不按 ↑ 不會誤抓（通關機器人只按 → / A / B）', I['noGrab'] is True)
    ok('樹菇在的時候站得住', I['capStand']['onGround'] is True, I['capStand'])
    ok('樹菇不在的時候會穿過去', I['capThrough']['onGround'] is False, I['capThrough'])
    ok('碰到孢子雲會受傷', I['sporeHurt'] is True)
    ok('無敵星期間孢子雲無效', I['sporeStar'] is True)

    print('[⑦ 三種新敵]')
    E = page.evaluate(r"""() => {
      const L = ST.LEVELS['3-1'], out = {};
      out.registered = ['leaper', 'thorn', 'wisp'].every(k => !!ST.Enemies.EXT[k]);
      out.kinds = ST.Enemies.KINDS.slice();
      // leaper：會朝主角跳（y 會上升），落地後停
      ST.Enemies.init(L);
      const hero = { x: 60 * 8, y: 170, w: 12, h: 22, vy: 0, inv: 0, star: 0 };
      const g = { hero: hero, camX: 56 * 8, level: L };
      const e = ST.Enemies.spawn('leaper', 62 * 8, L.surfaceY(62) - 16, { phase: 0 });
      let minY = 1e9, maxY = -1e9, moved = 0;
      for (let f = 0; f < 240; f++) { ST.Enemies.update(g); minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y); }
      out.leapRise = maxY - minY;
      out.leapTowards = e.x < 62 * 8;        // 主角在左邊 ⇒ 往左跳
      // thorn：收起可踩 / 伸刺不可踩，週期 150
      ST.Enemies.init(L);
      const th = ST.Enemies.spawn('thorn', 60 * 8, L.surfaceY(60) - 16, { phase: 0 });
      const seq = [];
      for (let f = 0; f < 150; f++) { ST.Enemies.update(g); seq.push(th.stompable ? 1 : 0); }
      out.thornStomp = seq.filter(v => v === 1).length;
      out.thornSpike = seq.filter(v => v === 0).length;
      // wisp：慢慢飄向主角、無視地形
      ST.Enemies.init(L);
      const w = ST.Enemies.spawn('wisp', 70 * 8, 120, { phase: 0 });
      const x0 = w.x;
      for (let f = 0; f < 120; f++) ST.Enemies.update(g);
      out.wispDx = w.x - x0;
      out.wispStomp = w.stompable;
      out.wispBob = w.y !== 120;
      return out;
    }""")
    ok('三種新敵都登記進 ST.Enemies.EXT', E['registered'] is True, E['kinds'])
    ok('沼蛙會躍起（高度 > 24 px）', E['leapRise'] > 24, E['leapRise'])
    ok('沼蛙朝主角的方向跳', E['leapTowards'] is True)
    ok('荊棘藤 150 幀循環：收起 90 幀可踩 / 伸刺 60 幀不可踩',
       abs(E['thornStomp'] - 90) <= 2 and abs(E['thornSpike'] - 60) <= 2,
       (E['thornStomp'], E['thornSpike']))
    ok('鬼火會慢慢飄向主角（120 幀內 ≥ 20 px）', E['wispDx'] < -20, E['wispDx'])
    ok('鬼火不可踩、會上下飄', E['wispStomp'] is False and E['wispBob'] is True,
       (E['wispStomp'], E['wispBob']))

    print('[⑧ 魔王「樹心魔」：兩條打法]')
    Bo = page.evaluate(r"""() => {
      const L = ST.LEVELS['3-4'], B = ST.BossW3;
      B.init(L);
      const out = { maxHp: B.MAX_HP, spawnX: B.spawnX };
      B.update({ camX: 0, level: L, hero: null });
      out.idleFar = B.active;
      const hero = { x: L.boss.x - 40, y: 170, w: 12, h: 22, vy: 1, inv: 0, star: 0, vineStrike: 0 };
      const g = { camX: L.boss.x - 280, level: L,  hero: hero,
                  onStomp: function () {}, onHurt: function () { out.hurt = (out.hurt || 0) + 1; },
                  onDie: function (how) { out.die = how; }, sfx: function () {} };
      B.update(g);
      out.active = B.active;
      const seen = {};
      let roots = 0, nuts = 0;
      for (let f = 0; f < 900; f++) {
        B.update(g);
        seen[B.phase] = (seen[B.phase] || 0) + 1;
        B.hammers.each(function (s) { if (s.root) roots++; else nuts++; });
      }
      out.phases = Object.keys(seen).sort();
      out.roots = roots > 0;
      // ---- 打法① 樹皮護甲：不是 open 的時候踩頭不扣血 ----
      B.reset(); B.init(L); B.spawn(L.boss.x, L.boss.y);
      B.phase = 'walk'; B.inv = 0;
      const hpBefore = B.hp;
      const hero2 = { x: B.x + 6, y: B.y - 20, w: 12, h: 22, vy: 2, inv: 0, star: 0, vineStrike: 0,
                      px: NES.FX.Vec(B.x + 6), py: NES.FX.Vec(B.y - 20), vyA: NES.FX.Acc(0), onGround: false };
      hero2.jumpS = NES.FX.SMB.jumpState(hero2.vyA);
      const g2 = { camX: B.x - 120, level: L, hero: hero2, onStomp: function () {}, onHurt: function () {}, sfx: function () {} };
      B.update(g2);
      out.armorHp = B.hp;
      out.armorBounce = B.bounces > 0;
      // ---- 打法① open 時踩頭扣 1 ----
      B.phase = 'open'; B.inv = 0; B.t = 0;
      hero2.x = B.x + 6; hero2.y = B.y - 20; hero2.vy = 2;
      B.update(g2);
      out.openHp = B.hp;
      // ---- 打法② 藤蔓衝撞：不必等 open，一次扣 2 ----
      B.reset(); B.init(L); B.spawn(L.boss.x, L.boss.y);
      B.phase = 'walk'; B.inv = 0;
      const hero3 = { x: B.x + 6, y: B.y + 4, w: 12, h: 22, vy: 0, inv: 0, star: 0, vineStrike: 10 };
      const g3 = { camX: B.x - 120, level: L, hero: hero3, onStomp: function () {}, onHurt: function () {}, sfx: function () {} };
      B.update(g3);
      out.vineHp = B.hp;
      out.vineHits = B.vineHits;
      // ---- 踩 5 次（open）會擊破 ----
      B.reset(); B.init(L); B.spawn(L.boss.x, L.boss.y);
      let n = 0;
      out.stages = [];
      while (!B.dead && n++ < 40) {
        B.inv = 0; B.phase = 'open';
        B.damage(1);
        out.stages.push(B.stage);
        for (let f = 0; f < 60; f++) B.update(g);
      }
      out.stomps = n; out.dead = B.dead; out.hp = B.hp;
      // ---- 藤蔓衝撞 3 次（2+2+1）也會擊破 ----
      B.reset(); B.init(L); B.spawn(L.boss.x, L.boss.y);
      let m = 0;
      while (!B.dead && m++ < 10) { B.inv = 0; B.damage(2); for (let f = 0; f < 30; f++) B.update(g); }
      out.vineKills = m; out.vineDead = B.dead;
      return out;
    }""")
    eq('魔王 5 格血', Bo['maxHp'], 5)
    ok('相機還沒靠近時魔王不啟動', Bo['idleFar'] is False)
    ok('相機靠近就啟動', Bo['active'] is True)
    ok('招式循環跑過 walk / slam / spit / open',
       {'walk', 'slam', 'open'} <= set(Bo['phases']), Bo['phases'])
    ok('砸地會長出根刺', Bo['roots'] is True)
    ok('打法①：樹皮護甲期間踩頭不扣血、只被彈開',
       Bo['armorHp'] == 5 and Bo['armorBounce'] is True, (Bo['armorHp'], Bo['armorBounce']))
    ok('打法①：樹心張開（open）時踩頭扣 1 格', Bo['openHp'] == 4, Bo['openHp'])
    ok('打法②：藤蔓衝撞不必等 open，一次扣 2 格',
       Bo['vineHp'] == 3 and Bo['vineHits'] == 1, (Bo['vineHp'], Bo['vineHits']))
    ok('踩 5 次（open）擊破', Bo['dead'] is True and Bo['hp'] == 0, (Bo['stomps'], Bo['hp']))
    ok('藤蔓衝撞 3 次（2+2+1）也擊破', Bo['vineDead'] is True and Bo['vineKills'] <= 3,
       (Bo['vineKills'], Bo['vineDead']))
    ok('血量下降會升階（stage 1 → 2 → 3）', max(Bo['stages']) >= 3, Bo['stages'])

    print('[⑨ 曲目（swamp / grove / hollow / boss3）]')
    A = page.evaluate(r"""() => {
      const A = ST.Audio, keys = ['swamp', 'grove', 'hollow', 'boss3'];
      const v = A.validate ? A.validate() : null;
      return {
        keys: keys.map(k => ({ k: k, has: A.has(k), info: A.INFO[k] || null })),
        inKeys: keys.every(k => A.KEYS.indexOf(k) >= 0),
        validate: Array.isArray(v) ? v.length : (v && v.ok === false ? 1 : 0),
        errs: Array.isArray(v) ? v.slice(0, 3) : []
      };
    }""")
    ok('四首 W3 曲都註冊進 ST.Audio.SONGS', all(x['has'] for x in A['keys']), A['keys'])
    ok('四首都在 ST.Audio.KEYS 裡（play(key) 找得到）', A['inKeys'])
    for x in A['keys']:
        inf = x['info'] or {}
        ok('%s 有長度資訊且會 loop' % x['k'], (inf.get('frames') or 0) > 200 and inf.get('loop') is True, inf)
    ok('ST.Audio.validate() 全過（只用五聲道 / 音符合法）', A['validate'] == 0, A['errs'])

    print('[⑩ lint：三個新主題 ≤ 25 色 / 64 色調色盤]')
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
    print('[⑪ 真頁：分頁切換 / 機關會動 / 暗區 / 魔王 / 旗桿演出]')

    st = fresh(page, '3-1')
    eq('?level=3-1 直接開到 3-1', st['level'], '3-1')
    R = page.evaluate(r"""() => {
      const o = {};
      o.bank = ST.SprBanks.currentName();
      o.heroOk = !!(ST.heroTiles && ST.sprBank);
      // 主角磚在 W3 分頁下仍解得到（repointHero）
      const k = Object.keys(ST.heroTiles)[0];
      o.heroTile = ST.heroTiles[k];
      o.w3Tile = ST.W3.oam16('W3_CAP_M');
      o.objW3 = ST.ObjectsW3.count();
      return o;
    }""")
    eq('3-1 換到 W3 的精靈分頁', R['bank'], 'st_spr_w3')
    ok('主角磚索引在分頁下仍有效', R['heroTile'] > 0, R['heroTile'])
    ok('W3 的精靈磚查得到（W3_CAP_M）', R['w3Tile'] > 0, R['w3Tile'])
    ok('3-1 的機關都載進 ST.ObjectsW3',
       R['objW3']['caps'] >= 3 and R['objW3']['vines'] >= 2 and R['objW3']['spores'] >= 2, R['objW3'])

    # ---- 樹菇：真的會出現 / 消失，站上去撐得住 ----
    C = page.evaluate(r"""() => {
      const d = GAME.dev, L = ST.LEVELS['3-1'], cap = L.caps[0];
      // 走到樹菇旁邊
      d.warp(cap.c * 8 - 24);
      let seenOn = false, seenOff = false;
      for (let f = 0; f < 240; f++) {
        __nes.step(1);
        const on = ST.ObjectsW3.capOn(0, ST.Objects.now());
        if (on) seenOn = true; else seenOff = true;
      }
      // 等它出現，再把主角放到正上方自由落下
      let n = 0;
      while (n++ < 400 && !ST.ObjectsW3.capOn(0, ST.Objects.now() + 8)) __nes.step(1);
      d.warp(cap.c * 8 + 8, cap.r * 8 - 40);
      for (let f = 0; f < 20; f++) __nes.step(1);
      const h = d.hero();
      return { seenOn, seenOff, landedY: h.y, capTop: cap.r * 8, onGround: h.onGround };
    }""")
    ok('樹菇在真頁會出現也會消失', C['seenOn'] and C['seenOff'], C)
    ok('落到樹菇上會站住（腳正好在樹菇上緣）',
       C['onGround'] is True and abs((C['landedY'] + 22) - C['capTop']) <= 2, C)
    shot(page, SHOTS / 'w3_31_cap.png')

    # ---- 藤蔓：按住 ↑ 抓住、按 A 盪出去 ----
    V = page.evaluate(r"""() => {
      const d = GAME.dev, L = ST.LEVELS['3-1'], W3 = ST.ObjectsW3;
      const tip = () => W3.vineTip(0, ST.Objects.now() + 1);
      let p = tip();
      d.warp(p.x - 6, p.y + 4);
      NES.Input.inject(NES.Input.BTN.UP, 1); __nes.step(1);
      const h = d.hero();
      const grabbed = h.onVine === 0;
      NES.Input.inject(NES.Input.BTN.UP, 1); __nes.step(6);
      const x1 = h.x;
      NES.Input.inject(NES.Input.BTN.A, 1); __nes.step(1);
      NES.Input.inject(0, 1); __nes.step(10);
      const flying = h.y < p.y + 4;
      NES.Input.inject(0, 1);
      return { grabbed: grabbed, released: h.onVine === null, flying: flying, strike: h.vineStrike, x1: x1 };
    }""")
    ok('真頁：按住 ↑ 抓住藤蔓', V['grabbed'] is True, V)
    ok('真頁：按 A 放手後往上盪出去', V['released'] is True and V['flying'] is True, V)

    # ---- 暗區：走進去調色盤變暗，走出來還原 ----
    st = fresh(page, '3-2')
    D = page.evaluate(r"""() => {
      const d = GAME.dev;
      d.warp(60 * 8); __nes.step(2);
      const before = ST.ObjectsW3.dark();
      d.warp(170 * 8); __nes.step(2);
      const inside = ST.ObjectsW3.dark();
      d.warp(300 * 8); __nes.step(2);
      const after = ST.ObjectsW3.dark();
      return { before, inside, after };
    }""")
    ok('暗區外不暗 / 暗區內變暗 / 出暗區還原',
       D['before'] is False and D['inside'] is True and D['after'] is False, D)
    page.evaluate("() => { GAME.dev.warp(170 * 8); __nes.step(2); }")
    shot(page, SHOTS / 'w3_32_gloom.png')

    # ---- 無敵星 ----
    S = page.evaluate(r"""() => {
      const d = GAME.dev, L = ST.LEVELS['3-2'], it = L.items[0];
      d.warp(it.c * 8, it.r * 8 + 4);
      for (let f = 0; f < 8; f++) __nes.step(1);
      const h = d.hero();
      return { star: h.star, state: GAME.state().star || 0 };
    }""")
    ok('撿到無敵星 ⇒ hero.star 開始倒數', S['star'] > 0, S)

    # ---- 3-3：截圖 ----
    fresh(page, '3-3')
    page.evaluate("() => { GAME.dev.warp(56 * 8); __nes.step(30); }")
    lt = page.evaluate("() => __nes.lint()")
    ok('3-3 藤蔓接力段 lint 綠、%d 色 ≤ 25' % lt['colors'], lt['ok'] and lt['colors'] <= 25,
       (lt['ok'], lt['colors']))

    # ---- 3-4：魔王可擊破 + 旗桿演出 ----
    fresh(page, '3-4')
    B = page.evaluate(r"""() => {
      const d = GAME.dev, L = ST.LEVELS['3-4'];
      d.warp(L.boss.x - 90);
      let n = 0;
      while (n++ < 400 && !(d.boss() && d.boss().active)) __nes.step(1);
      const spawned = !!(d.boss() && d.boss().active);
      // 用「踩樹心」打：等 open 再踩
      let hits = 0, f = 0;
      while (f++ < 4000 && !d.boss().dead) {
        const b = d.boss();
        if (b.phase === 'open' && ST.BossW3.inv === 0) { if (ST.BossW3.damage(1)) hits++; }
        __nes.step(1);
      }
      return { spawned: spawned, dead: d.boss().dead, hits: hits, frames: f, mode: GAME.state().mode };
    }""")
    ok('3-4 走近就會出現魔王', B['spawned'] is True, B)
    ok('樹心張開時攻擊 5 次 ⇒ 擊破', B['dead'] is True and B['hits'] <= 6, B)
    shot(page, SHOTS / 'w3_34_boss.png')

    P = page.evaluate(r"""() => {
      const d = GAME.dev, L = ST.LEVELS['3-4'];
      d.warp((L.goal.col - 1) * 8, 120);
      let n = 0, pole = null;
      while (n++ < 240) { __nes.step(1); const s = GAME.state(); if (s.mode === 'clear') { pole = s.pole || null; break; } }
      return { mode: GAME.state().mode, n: n, pole: pole };
    }""")
    ok('碰到旗桿 ⇒ 進 clear（旗桿是魔王之外的第二條路）', P['mode'] == 'clear', P)

    # ---- 標題 SELECT 切得到 WORLD 3 ----
    page.goto(BASE)
    page.wait_for_function('() => !!window.__nes && !!window.GAME')
    T = page.evaluate(r"""() => {
      __nes.step(2);
      const seen = [];
      for (let i = 0; i < 8; i++) {
        seen.push(GAME.state().titleWorld);
        NES.Input.inject(NES.Input.BTN.SELECT, 1); __nes.step(1);
        NES.Input.inject(0, 1); __nes.step(1);
      }
      return { seen: seen };
    }""")
    ok('標題 SELECT 的世界清單含 WORLD 3', 3 in T['seen'], T['seen'])

    # ---- 每關跑 90 幀再 lint（截圖只留 3 張：R4 共用規則 1「收工 ≤ 3 張」）----
    for lid in IDS:
        fresh(page, lid)
        page.evaluate("() => { __nes.press(['right'], 90); }")
        lt = page.evaluate("() => __nes.lint()")
        ok('%s 真頁跑 90 幀後 lint 綠、%d 色 ≤ 25' % (lid, lt['colors']),
           lt['ok'] and lt['colors'] <= 25, (lt['ok'], lt['colors'], lt.get('errors', [])[:2]))


def body_fix(page):
    """fix-r4（qa-r4 P3-2）：W3 的每線精靈峰值 ≤ 8，不靠 PPU 輪替。"""
    print('[⑫ fix-r4：每線精靈 ≤ 8（P3-2）]')

    # ---- 編排規則（靜態）：寬平台 / 藤蔓結 / 螢火不可以互相疊在同一條掃描線 ----
    S = page.evaluate("""() => {
      const out = {};
      for (const id of ['3-1', '3-2', '3-3', '3-4']) {
        const L = ST.LEVELS[id], caps = L.caps || [], vines = L.vines || [], gl = L.glooms || [];
        const capPairs = [], inGloom = [];
        caps.forEach((a, i) => {
          caps.forEach((b, j) => {
            // 「同屏」= 兩座都塞得進一個畫面（32 欄）；此時樹菇平台（各 w 顆精靈）
            // 要嘛精靈列差 >= 2（16 px，掃描線完全不重疊），要嘛 w 加起來 <= 6
            // （6 + 主角 2 = 8，剛好用完每線額度）。
            if (j <= i) return;
            if (Math.abs(a.c - b.c) + Math.max(a.w, b.w) > 32) return;
            if (Math.abs(a.r - b.r) < 2 && (a.w + b.w) > 6) capPairs.push([i, j, a.r, b.r, a.w, b.w]);
          });
          // 螢火暗區（螢火永遠繞著主角 ⇒ 一定跟主角同線）裡不可以有寬平台
          gl.forEach(z => { if (a.w >= 4 && a.c + a.w - 1 >= z.c0 && a.c <= z.c1) inGloom.push(['cap', a.c]); });
        });
        vines.forEach(v => {
          gl.forEach(z => { if (v.c >= z.c0 - 2 && v.c <= z.c1 + 2) inGloom.push(['vine', v.c]); });
        });
        out[id] = { capPairs: capPairs, inGloom: inGloom,
                    flies: gl.map(z => z.flies), zones: gl.length };
      }
      out.roots = ST.BossW3.CONST ? ST.BossW3.CONST.PHASE.slice(1).map(p => p.roots)
                                  : (ST.BossW3.PHASE || []).slice(1).map(p => p.roots);
      return out;
    }""")
    for lid in IDS:
        ok('%s 同屏的兩座樹菇平台至少差 2 列（不會一次 6~8 顆精靈）' % lid,
           not S[lid]['capPairs'], S[lid]['capPairs'])
        ok('%s 螢火暗區裡沒有寬樹菇 / 藤蔓（螢火一定跟主角同線）' % lid,
           not S[lid]['inGloom'], S[lid]['inGloom'])
        ok('%s 螢火每區 ≤ 2 隻' % lid, all(f <= 2 for f in S[lid]['flies']), S[lid]['flies'])
    ok('魔王「樹心魔」每階根刺 ≤ 3 叢（魔王本體就佔每線 4 顆）',
       max(S['roots']) <= 3, S['roots'])

    # ---- 動態：機器人跑完 3-2（最密的一關）與 3-4（魔王關），每一幀都量 ----
    for lid in ['3-2', '3-4']:
        fresh(page, lid)
        page.evaluate("(n) => GAME.dev.setLives(n)", 60)
        page.evaluate(BOT_JS, {'seed': 1, 'maxFrames': 20000})
        R = page.evaluate(BOT_SPRLINE, {'frames': 4000})
        ok('%s 全程每線精靈 %d ≤ 8（線 %s / 幀 %s）' % (lid, R['peak'], R['line'], R['frame']),
           R['peak'] <= 8, R)
        ok('%s 仍然 0 死通關（%d 幀）' % (lid, R['frames']),
           R['cleared'] and R['deaths'] == 0, R)


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
    print('star-w3 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    print('總結：' + ('PASS' if not bad else 'FAIL'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
