# -*- coding: utf-8 -*-
"""test_chr.py — chr-lint agent 的自動測試（不依賴其他 engine 模組）。

  A. engine/chr.js：tile 解析 / 非法字元 / 256 上限 / bank index / pattern 切換 /
     fromString 切片 / tile16 偶數對齊 / DEMO bank 每個 tile 只用 0..3
  B. engine/nes_lint.js：用假 ppu 物件驗 26 色 → ok=false、非 64 色 → badPixels、
     magenta 改寫、每線 > 8 精靈、strict throw
  C. tools/nes_lint.py：用 pillow 合成 PNG（合法 / 26 色 / 非法色 / 放大 / 平滑 / 裁切）驗 exit code
  D. 把 DEMO bank 渲染成 shots/agent_chr/demo_bank.png（純 pillow、4 灰階）

用法：../卡比之星/.venv/bin/python tools/test_chr.py [--no-shot]
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHR_JS = os.path.join(ROOT, 'engine', 'chr.js')
LINT_JS = os.path.join(ROOT, 'engine', 'nes_lint.js')
LINT_PY = os.path.join(ROOT, 'tools', 'nes_lint.py')
SHOT_DIR = os.path.join(ROOT, 'shots', 'agent_chr')
PY = sys.executable

sys.path.insert(0, os.path.join(ROOT, 'tools'))
import nes_lint as LINTMOD  # noqa: E402  內建 64 色表（與 palette.js 一致性由 nes_lint.py 檢查）

RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    print('  %s %s%s' % ('PASS' if ok else 'FAIL', name, ('｜' + str(detail)) if detail else ''))
    return bool(ok)


def eq(name, got, want):
    return check(name, got == want, '' if got == want else 'got=%r want=%r' % (got, want))


HELPERS = """
window.thr = function (f) { try { f(); return null; } catch (e) { return String(e.message); } };
"""


# ---------------------------------------------------------------------------
# A. chr.js
# ---------------------------------------------------------------------------
def test_chr(page):
    print('\n== A. engine/chr.js ==')
    page.goto('about:blank')
    page.add_script_tag(path=CHR_JS)
    page.add_script_tag(content=HELPERS)

    # A1 tile 解析
    r = page.evaluate("""() => {
      const t = NES.CHR.tile(['.123....','........','........','........','........','........','........','33333333']);
      return { len: t.length, head: Array.from(t.slice(0, 8)), tail: Array.from(t.slice(56, 64)),
               type: t.constructor.name };
    }""")
    eq('A1 tile() 回傳 Uint8Array(64)', [r['len'], r['type']], [64, 'Uint8Array'])
    eq('A1 tile() 字元 .123 → 0..3', r['head'], [0, 1, 2, 3, 0, 0, 0, 0])
    eq('A1 tile() 最後一列', r['tail'], [3] * 8)

    # A2 非法輸入
    r = page.evaluate("""() => ({
      badChar: thr(() => NES.CHR.tile(['.12X....','........','........','........','........','........','........','........'])),
      badLen:  thr(() => NES.CHR.tile(['.123...','........','........','........','........','........','........','........'])),
      badRows: thr(() => NES.CHR.tile(['........','........'])),
      badType: thr(() => NES.CHR.tile([1,2,3,4,5,6,7,8])),
      ok:      thr(() => NES.CHR.tile('........\\n........\\n........\\n........\\n........\\n........\\n........\\n........'))
    })""")
    check('A2 非法字元 throw', r['badChar'] and '非法' in r['badChar'], r['badChar'])
    check('A2 列長度錯誤 throw', bool(r['badLen']), r['badLen'])
    check('A2 列數錯誤 throw', bool(r['badRows']), r['badRows'])
    check('A2 非字串列 throw', bool(r['badType']), r['badType'])
    check('A2 換行字串可用', r['ok'] is None, r['ok'])

    # A3 bank 256 上限
    r = page.evaluate("""() => {
      const blank = ['........','........','........','........','........','........','........','........'];
      const mk = n => { const o = {}; for (let i = 0; i < n; i++) o['t' + i] = blank; return o; };
      const b = NES.CHR.bank('cap256', mk(256));
      return { count: b.count, over: thr(() => NES.CHR.bank('cap257', mk(257))),
               dup: thr(() => NES.CHR.bank('dup', { a: blank, a2: blank })) };
    }""")
    eq('A3 bank 256 個磁磚 OK', r['count'], 256)
    check('A3 bank 257 個 → throw', r['over'] and '256' in r['over'], r['over'])

    # A4 bank index（物件 / 陣列 / 未知名稱）
    r = page.evaluate("""() => {
      const A = ['3.......','........','........','........','........','........','........','........'];
      const B = ['........','........','........','........','........','........','........','.......3'];
      const b = NES.CHR.bank('idx', { ZERO: A, ONE: B, TWO: A });
      const arr = NES.CHR.bank('arr', [A, B]);
      return { zero: b.index('ZERO'), one: b.index('ONE'), two: b.index('TWO'),
               has: b.has('ONE'), nope: b.has('NOPE'), miss: thr(() => b.index('NOPE')),
               names: b.names, arr0: arr.index('0'), arr1: arr.index('1'), arrCount: arr.count };
    }""")
    eq('A4 bank index 依插入順序', [r['zero'], r['one'], r['two']], [0, 1, 2])
    eq('A4 bank names', r['names'], ['ZERO', 'ONE', 'TWO'])
    check('A4 未知名稱 throw', bool(r['miss']), r['miss'])
    eq('A4 陣列形式 bank', [r['arr0'], r['arr1'], r['arrCount']], [0, 1, 2])

    # A5 tile16：偶數對齊 + 上下相鄰
    r = page.evaluate("""() => {
      const A = ['3.......','........','........','........','........','........','........','........'];
      const B = ['........','........','........','........','........','........','........','.......3'];
      const b = NES.CHR.bank('tall', { pad: A, L: NES.CHR.tile16(A, B) });  // pad 讓 L 本來會落在奇數格
      const i = b.index('L');
      return { i: i, even: i % 2 === 0, count: b.count,
               top: b.tiles[i][0], bottom: b.tiles[i + 1][63], padIdx: b.index('pad') };
    }""")
    check('A5 tile16 對齊到偶數索引', r['even'] and r['i'] == 2, 'idx=%s' % r['i'])
    eq('A5 tile16 上下兩塊相鄰', [r['top'], r['bottom']], [3, 3])

    # A6 pattern 切換
    r = page.evaluate("""() => {
      const A = ['3.......','........','........','........','........','........','........','........'];
      const B = ['2.......','........','........','........','........','........','........','........'];
      NES.CHR.bank('pA', { x: A }); NES.CHR.bank('pB', { x: B });
      NES.CHR.setPattern(0, 'pA'); NES.CHR.setPattern(1, 'pB');
      const a = NES.CHR.get(0, 0)[0], b = NES.CHR.get(1, 0)[0];
      NES.CHR.setPattern(0, 'pB');
      return { a: a, b: b, swapped: NES.CHR.get(0, 0)[0],
               blank: Array.from(NES.CHR.get(1, 255)).reduce((s, v) => s + v, 0),
               badTable: thr(() => NES.CHR.setPattern(2, 'pA')),
               badBank: thr(() => NES.CHR.setPattern(0, 'nope')),
               badIdx: thr(() => NES.CHR.get(0, 256)),
               badIdx2: thr(() => NES.CHR.get(0, -1)) };
    }""")
    eq('A6 setPattern(0/1) + get 取到對的 bank', [r['a'], r['b'], r['swapped']], [3, 2, 2])
    eq('A6 未定義磁磚 = 空白', r['blank'], 0)
    check('A6 table 非 0/1 → throw', bool(r['badTable']), r['badTable'])
    check('A6 未知 bank → throw', bool(r['badBank']), r['badBank'])
    check('A6 idx 越界 → throw', bool(r['badIdx']) and bool(r['badIdx2']), r['badIdx'])

    # A7 fromString：128×128 → 256 tile，切片位置正確
    r = page.evaluate("""() => {
      // 每個 8×8 格子左上角放一個可辨識的碼：((r*16+c) % 3) + 1，其餘留白
      const rows = [];
      for (let y = 0; y < 128; y++) {
        let s = '';
        for (let x = 0; x < 128; x++) {
          const tr = y >> 3, tc = x >> 3, idx = tr * 16 + tc;
          s += (y % 8 === 0 && x % 8 === 0) ? String((idx % 3) + 1) : '.';
        }
        rows.push(s);
      }
      const tiles = NES.CHR.fromString(rows);
      const picks = [0, 1, 15, 16, 255].map(i => tiles[i][0]);
      const want = [0, 1, 15, 16, 255].map(i => (i % 3) + 1);
      return { n: tiles.length, picks: picks, want: want,
               joined: NES.CHR.fromString(rows.join('\\n')).length,
               short: thr(() => NES.CHR.fromString(rows.slice(0, 120))),
               narrow: thr(() => NES.CHR.fromString(rows.map(s => s.slice(0, 120)))) };
    }""")
    eq('A7 fromString → 256 tile', r['n'], 256)
    eq('A7 fromString 切片位置正確', r['picks'], r['want'])
    eq('A7 fromString 吃換行字串', r['joined'], 256)
    check('A7 非 128 列 → throw', bool(r['short']), r['short'])
    check('A7 非 128 寬 → throw', bool(r['narrow']), r['narrow'])

    # A8 DEMO bank
    r = page.evaluate("""() => {
      const D = NES.CHR.DEMO;
      let bad = 0, n = 0;
      for (const b of [D.bg, D.spr]) for (const t of b.tiles) { n++; for (const v of t) if (v > 3) bad++; }
      const fontOk = ['N0','N9','A','Z','SP','COLON','HEART'].every(k => D.bg.has(k));
      const terrOk = ['SKY','GROUND_TOP','BRICK','QBLOCK','CLOUD_L','WATER'].every(k => D.bg.has(k));
      const heroOk = D.hero.frames.length === 3 &&
        D.hero.frames.every(f => f.length === 6 && f.every(p => D.spr.has(p.tile)));
      const enemyIdx = D.spr.index('ENEMY_L');
      const txt = D.text('AZ 09');
      return { tiles: n, bad: bad, fontOk: fontOk, terrOk: terrOk, heroOk: heroOk,
               sky: D.bg.index('SKY'), enemyEven: enemyIdx % 2 === 0,
               enemyAdj: D.spr.index('ENEMY_R') === enemyIdx + 2,
               bgCount: D.bg.count, sprCount: D.spr.count,
               txt: txt, wantTxt: ['A','Z','SP','N0','N9'].map(k => D.bg.index(k)),
               heroSize: [D.hero.w, D.hero.h], enemySize: [D.enemy.w, D.enemy.h, D.enemy.mode],
               walk: D.hero.walk };
    }""")
    eq('A8 DEMO 每個 tile 只用 0..3', r['bad'], 0)
    check('A8 DEMO 字型齊全（0-9 A-Z + 符號）', r['fontOk'])
    check('A8 DEMO 地形磚齊全', r['terrOk'])
    check('A8 DEMO 主角 3 幀 × 6 磚', r['heroOk'], 'hero %sx%s' % tuple(r['heroSize']))
    eq('A8 DEMO 主角尺寸 16×24', r['heroSize'], [16, 24])
    eq('A8 DEMO 敵人 16×16 / 8×16 模式', r['enemySize'], [16, 16, 16])
    check('A8 DEMO 敵人 8×16 偶數對齊且相鄰', r['enemyEven'] and r['enemyAdj'])
    eq('A8 DEMO SKY 在索引 0', r['sky'], 0)
    eq('A8 DEMO text() 對應正確', r['txt'], r['wantTxt'])
    eq('A8 DEMO 走路循環 1-2-1-3', r['walk'], [0, 1, 0, 2])
    check('A8 DEMO bank 未超過 256', r['bgCount'] <= 256 and r['sprCount'] <= 256,
          'bg=%d spr=%d' % (r['bgCount'], r['sprCount']))

    # A9 DEMO.spr16：8×16 精靈模式專用配對 bank（QA P2-4 / X12）
    r = page.evaluate("""() => {
      const D = NES.CHR.DEMO, B = D.spr16;
      const names = ['HERO_TOP_L','HERO_TOP_R','HERO_L0_L','HERO_L0_R','HERO_L1_L','HERO_L1_R',
                     'HERO_L2_L','HERO_L2_R','ENEMY_L','ENEMY_R'];
      const has = names.every(n => B.has(n));
      const even = names.every(n => B.index(n) % 2 === 0);      // 8×16 上半塊一定在偶數索引
      const oamOk = names.every(n => D.oam16(n) === (B.index(n) | 1));
      // 上下半塊必須相鄰，且上半塊 = DEMO.spr 的對應 8×8 切片
      const topIdx = B.index('HERO_TOP_L');
      const sameTop = JSON.stringify(Array.from(B.tiles[topIdx])) ===
                      JSON.stringify(Array.from(D.spr.tiles[D.spr.index('HERO_TOP_r0c0')]));
      const sameBottom = JSON.stringify(Array.from(B.tiles[topIdx + 1])) ===
                         JSON.stringify(Array.from(D.spr.tiles[D.spr.index('HERO_TOP_r1c0')]));
      // 腳的下半塊要全空白
      const legBlank = Array.from(B.tiles[B.index('HERO_L0_L') + 1]).every(v => v === 0);
      let bad = 0;
      for (const t of B.tiles) for (const v of t) if (v > 3) bad++;
      return { has: has, even: even, oamOk: oamOk, sameTop: sameTop, sameBottom: sameBottom,
               legBlank: legBlank, bad: bad, count: B.count, name: B.name,
               registered: NES.CHR.getBank('demo_spr16') === B };
    }""")
    check('A9 DEMO.spr16 有全部 10 個 8×16 名稱', r['has'])
    check('A9 DEMO.spr16 每個上半塊都在偶數索引（8×16 對齊）', r['even'])
    check('A9 DEMO.oam16(name) = index | 1（圖樣表 1）', r['oamOk'])
    check('A9 DEMO.spr16 上下半塊 = DEMO.spr 的 r0/r1 切片', r['sameTop'] and r['sameBottom'])
    check('A9 DEMO.spr16 腳的下半塊留白', r['legBlank'])
    eq('A9 DEMO.spr16 每個 tile 只用 0..3', r['bad'], 0)
    check('A9 DEMO.spr16 已註冊成 bank "demo_spr16"（可直接 setPattern）',
          r['registered'] and r['name'] == 'demo_spr16', '%s / %d 磚' % (r['name'], r['count']))


# ---------------------------------------------------------------------------
# B. nes_lint.js
# ---------------------------------------------------------------------------
PAL_JSON = json.dumps([list(c) for c in LINTMOD.PALETTE])

FAKE_PPU = """
window.mkPPU = function (colors, opts) {
  opts = opts || {};
  const w = 256, h = 240, fr = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = colors[i % colors.length];
    fr[i * 4] = c[0]; fr[i * 4 + 1] = c[1]; fr[i * 4 + 2] = c[2]; fr[i * 4 + 3] = 255;
  }
  const p = { frame: fr, width: w, height: h, stats: opts.stats || { overLine: [] },
              oam: opts.oam, sprHeight: opts.sprHeight, flicker: opts.flicker };
  if (opts.indexes) {
    p.indexFrame = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) p.indexFrame[i] = opts.indexes[i % opts.indexes.length];
  }
  if (opts.noOam) { delete p.oam; }
  return p;
};
"""


def test_lint_js(page):
    print('\n== B. engine/nes_lint.js ==')
    page.goto('about:blank')
    page.add_script_tag(path=LINT_JS)
    page.add_script_tag(content=HELPERS + FAKE_PPU)

    # B1 沒有 palette.js：只算色數
    r = page.evaluate("""() => {
      const cols = []; for (let i = 0; i < 25; i++) cols.push([i * 4, i * 4, i * 4]);
      const p = mkPPU(cols);
      const a = NES.Lint.frame(p);
      const p2 = mkPPU(cols.concat([[1, 2, 3]]));
      const b = NES.Lint.frame(p2);
      return { a: { ok: a.ok, c: a.colors, pc: a.paletteChecked, bad: a.badPixels },
               b: { ok: b.ok, c: b.colors, err: b.errors } };
    }""")
    eq('B1 25 色 → ok（未載 palette 只算色數）', [r['a']['ok'], r['a']['c'], r['a']['pc'], r['a']['bad']],
       [True, 25, False, 0])
    eq('B1 26 色 → ok=false', [r['b']['ok'], r['b']['c']], [False, 26])

    # B2 載入 palette：非 64 色 → badPixels
    page.add_script_tag(content='window.NES.PALETTE = %s; window.NES.PALETTE.FORBIDDEN = [13];' % PAL_JSON)
    r = page.evaluate("""() => {
      const P = NES.PALETTE;
      const good = [P[0x0F], P[0x21], P[0x16], P[0x30]];
      const a = NES.Lint.frame(mkPPU(good));
      const b = NES.Lint.frame(mkPPU(good.concat([[1, 2, 3], [4, 5, 6]])));
      return { a: { ok: a.ok, bad: a.badPixels, pc: a.paletteChecked, c: a.colors },
               b: { ok: b.ok, bad: b.badPixels, badColors: b.badColors } };
    }""")
    eq('B2 全部 64 色內 → ok', [r['a']['ok'], r['a']['bad'], r['a']['pc']], [True, 0, True])
    check('B2 非 64 色 → badPixels > 0', r['b']['ok'] is False and r['b']['bad'] > 0,
          'bad=%s %s' % (r['b']['bad'], r['b']['badColors']))

    # B3 magenta 改寫
    r = page.evaluate("""() => {
      const p = mkPPU([NES.PALETTE[0x0F], [1, 2, 3]]);
      const before = [p.frame[4], p.frame[5], p.frame[6]];
      NES.Lint.magenta = true;
      const res = NES.Lint.frame(p);
      NES.Lint.magenta = false;
      const after = [p.frame[4], p.frame[5], p.frame[6]];
      const res2 = NES.Lint.frame(p);
      return { before: before, after: after, bad1: res.badPixels, bad2: res2.badPixels };
    }""")
    eq('B3 magenta 前是非法色', r['before'], [1, 2, 3])
    eq('B3 magenta 後寫回洋紅', r['after'], [255, 0, 255])
    check('B3 洋紅本身仍算非法（肉眼 + lint 都抓得到）', r['bad2'] > 0, 'bad=%s' % r['bad2'])

    # B4 overLine 由 ppu.stats 帶出
    r = page.evaluate("""() => {
      const p = mkPPU([NES.PALETTE[0x0F]], { stats: { overLine: [{ line: 100, count: 9 }] } });
      return NES.Lint.frame(p).overLine;
    }""")
    eq('B4 frame() 帶出 ppu.stats.overLine', r, [{'line': 100, 'count': 9}])

    # B5 oam：每線精靈數
    r = page.evaluate("""() => {
      const mk = n => { const a = []; for (let i = 0; i < n; i++) a.push({ x: i * 9, y: 100, tile: 1, pal: 0 }); return a; };
      const p8 = mkPPU([[0, 0, 0]], { oam: mk(8) });
      const p9 = mkPPU([[0, 0, 0]], { oam: mk(9) });
      const pf = mkPPU([[0, 0, 0]], { oam: mk(9), flicker: 'rotate' });
      const p16 = mkPPU([[0, 0, 0]], { oam: mk(9), sprHeight: 16 });
      const a = NES.Lint.oam(p8), b = NES.Lint.oam(p9), c = NES.Lint.oam(pf), d = NES.Lint.oam(p16);
      return { a: { ok: a.ok, max: a.maxLine, over: a.overLine.length },
               b: { ok: b.ok, max: b.maxLine, over: b.overLine.length, lines: b.overLine.length },
               c: { ok: c.ok, over: c.overLine.length },
               d: { h: d.spriteHeight, over: d.overLine.length } };
    }""")
    eq('B5 每線 8 個精靈 → ok', [r['a']['ok'], r['a']['max'], r['a']['over']], [True, 8, 0])
    eq('B5 每線 9 個精靈 → ok=false、8 條線超標', [r['b']['ok'], r['b']['max'], r['b']['over']], [False, 9, 8])
    eq('B5 開了 OAM 輪替閃爍 → 只報不擋', [r['c']['ok'], r['c']['over']], [True, 8])
    eq('B5 8×16 模式覆蓋 16 條線', [r['d']['h'], r['d']['over']], [16, 16])

    # B6 oam：越界與格式
    r = page.evaluate("""() => {
      const p = mkPPU([[0, 0, 0]], { oam: [
        { x: 10.5, y: 20, tile: 1, pal: 0 },
        { x: 10, y: 20, tile: 999, pal: 0 },
        { x: 10, y: 20, tile: 1, pal: 7 },
        { x: -40, y: 20, tile: 1, pal: 0 },
        { x: 10, y: 20, tile: 1, pal: 0, on: false }
      ] });
      const res = NES.Lint.oam(p);
      // 真機 OAM：Uint8Array(256)，y >= 0xEF 視為藏起來
      const raw = new Uint8Array(256);
      for (let i = 0; i < 64; i++) { raw[i * 4] = 0xF0; }
      for (let i = 0; i < 9; i++) { raw[i * 4] = 100; raw[i * 4 + 1] = 1; raw[i * 4 + 3] = i * 9; }
      const rres = NES.Lint.oam(mkPPU([[0, 0, 0]], { oam: raw }));
      return { errs: res.errors.length, msg: res.errors.join('|'), off: res.offscreen, count: res.count,
               raw: { over: rres.overLine.length, hidden: rres.hidden, max: rres.maxLine } };
    }""")
    check('B6 非整數座標 / 磁磚 / 調色盤越界都報', r['errs'] >= 3, r['msg'])
    eq('B6 on:false 的精靈不計入', r['count'], 4)
    eq('B6 出界精靈另計', r['off'], 1)
    eq('B6 吃真機 Uint8Array(256) OAM（y>=0xEF 隱藏）',
       [r['raw']['over'], r['raw']['hidden'], r['raw']['max']], [8, 55, 9])

    # B7 strict throw
    r = page.evaluate("""() => {
      const cols = [];   // $00-$0C 與 $10-$1C 共 26 個互不重複的色（避開多個黑的 $0D-$0F）
      for (let i = 0; i <= 0x0C; i++) cols.push(NES.PALETTE[i]);
      for (let i = 0x10; i <= 0x1C; i++) cols.push(NES.PALETTE[i]);
      const p = mkPPU(cols);
      NES.Lint.strict = true;
      const m = thr(() => NES.Lint.frame(p));
      const m2 = thr(() => NES.Lint.oam(mkPPU([[0,0,0]], { oam: [{x:1.5,y:1,tile:0,pal:0}] })));
      NES.Lint.strict = false;
      const after = NES.Lint.frame(p).ok;
      return { m: m, m2: m2, after: after };
    }""")
    check('B7 strict=true → frame 不合格直接 throw', bool(r['m']), r['m'])
    check('B7 strict=true → oam 不合格直接 throw', bool(r['m2']), r['m2'])
    eq('B7 strict=false → 只回報', r['after'], False)

    # B9 與真正的 engine/palette.js 互通（palette.js 是葉節點，契約允許一起載）
    pal_js = os.path.join(ROOT, 'engine', 'palette.js')
    if os.path.exists(pal_js):
        page.goto('about:blank')
        page.add_script_tag(path=pal_js)
        page.add_script_tag(path=LINT_JS)
        page.add_script_tag(content=HELPERS + FAKE_PPU)
        r2 = page.evaluate("""() => {
          const P = NES.PALETTE;
          const good = [P.rgb ? P.rgb(0x0F) : P[0x0F], P[0x21], P[0x16]];
          const a = NES.Lint.frame(mkPPU(good));
          const b = NES.Lint.frame(mkPPU(good.concat([[7, 7, 7]])));
          return { pc: a.paletteChecked, ok: a.ok, bad: b.badPixels, forb: P.FORBIDDEN };
        }""")
        check('B9 直接吃 engine/palette.js 的 NES.PALETTE',
              r2['pc'] and r2['ok'] and r2['bad'] > 0, 'FORBIDDEN=%s' % r2['forb'])
        page.goto('about:blank')
        page.add_script_tag(path=LINT_JS)
        page.add_script_tag(content=HELPERS + FAKE_PPU)
        page.add_script_tag(content='window.NES.PALETTE = %s;' % PAL_JSON)
    else:
        check('B9 engine/palette.js 尚未存在（略過互通測試）', True, 'skipped')

    # B10 indexFrame 優先（ppu.js 提供每像素 NES 色號）
    r = page.evaluate("""() => {
      const good = mkPPU([[0, 0, 0]], { indexes: [0x0F, 0x21, 0x16, 0x30] });
      const a = NES.Lint.frame(good);
      const forb = mkPPU([[0, 0, 0]], { indexes: [0x0F, 0x21, 0x0D] });
      NES.Lint.magenta = true;
      const b = NES.Lint.frame(forb);
      NES.Lint.magenta = false;
      const px = [forb.frame[8], forb.frame[9], forb.frame[10]];   // 第 3 個像素（色號 $0D）
      const rgbOnly = NES.Lint.frame(good, { useIndex: false });
      const many = []; for (let i = 0; i < 26; i++) many.push(i <= 0x0C ? i : i + 3);
      const c = NES.Lint.frame(mkPPU([[0, 0, 0]], { indexes: many }));
      return { a: { src: a.source, ok: a.ok, colors: a.colors, pc: a.paletteChecked, list: a.indexColors },
               b: { ok: b.ok, bad: b.badPixels, forb: b.forbiddenPixels, badColors: b.badColors },
               px: px, rgb: { src: rgbOnly.source, ok: rgbOnly.ok },
               c: { ok: c.ok, colors: c.colors } };
    }""")
    eq('B10 有 indexFrame 就優先用', [r['a']['src'], r['a']['ok'], r['a']['colors'], r['a']['pc']],
       ['indexFrame', True, 4, True])
    check('B10 抓到禁用色 $0D', r['b']['ok'] is False and r['b']['forb'] > 0 and '$0D' in r['b']['badColors'],
          str(r['b']))
    eq('B10 magenta 把違規色號寫回 ppu.frame', r['px'], [255, 0, 255])
    eq('B10 useIndex:false 可強制走 RGBA', [r['rgb']['src'], r['rgb']['ok']], ['frame', True])
    eq('B10 indexFrame 下 26 色也擋得住', [r['c']['ok'], r['c']['colors']], [False, 26])

    # B11 ppu.js 用複數 stats.overLines
    r = page.evaluate("""() => {
      const a = NES.Lint.frame(mkPPU([[0, 0, 0]], { stats: { overLines: [12, 13] } }));
      const b = NES.Lint.frame(mkPPU([[0, 0, 0]], { stats: { overLine: [{ line: 5, count: 9 }] } }));
      const c = NES.Lint.frame(mkPPU([[0, 0, 0]], { stats: {} }));
      return { a: a.overLine, b: b.overLine, c: c.overLine };
    }""")
    eq('B11 stats.overLines（複數）也吃', r['a'], [12, 13])
    eq('B11 stats.overLine（單數）優先', r['b'], [{'line': 5, 'count': 9}])
    eq('B11 兩者都沒有 → []', r['c'], [])

    # B12 ppu 還沒有 OAM → 容錯跳過
    r = page.evaluate("""() => {
      const p = mkPPU([[0, 0, 0]], { noOam: true });
      const o = NES.Lint.oam(p);
      const c = NES.Lint.check(p);
      return { ok: o.ok, skipped: o.skipped, checkOk: c.ok };
    }""")
    eq('B12 ppu.oam 不存在 → { ok:true, skipped:true }', [r['ok'], r['skipped'], r['checkOk']],
       [True, True, True])

    # B13 精靈高度：ppu.spriteMode() 函式形式（ppu.js 的實作）
    r = page.evaluate("""() => {
      const p = mkPPU([[0, 0, 0]], { oam: [{ x: 8, y: 100, tile: 0, pal: 0 }] });
      p.spriteMode = function () { return 16; };
      return NES.Lint.oam(p).spriteHeight;
    }""")
    eq('B13 讀得到 ppu.spriteMode() 的 8/16', r, 16)

    # B8 check() 合併 + 缺 ppu.frame
    r = page.evaluate("""() => {
      const p = mkPPU([NES.PALETTE[0x0F]], { oam: [{ x: 1, y: 1, tile: 0, pal: 0 }] });
      const c = NES.Lint.check(p);
      return { ok: c.ok, f: c.frame.ok, o: c.oam.ok, sum: NES.Lint.summary(c),
               noFrame: thr(() => NES.Lint.frame({})) };
    }""")
    eq('B8 check() 合併 frame + oam', [r['ok'], r['f'], r['o']], [True, True, True])
    check('B8 缺 ppu.frame → throw', bool(r['noFrame']), r['noFrame'])
    check('B8 summary() 可讀', 'lint' in r['sum'], r['sum'])


# ---------------------------------------------------------------------------
# C. nes_lint.py
# ---------------------------------------------------------------------------
def make_png(path, pixels, w, h, scale=1, border=0, smooth=False):
    im = Image.new('RGB', (w, h))
    im.putdata(pixels)
    if scale > 1:
        im = im.resize((w * scale, h * scale),
                       Image.BILINEAR if smooth else Image.NEAREST)
    if border:
        bg = Image.new('RGB', (im.width + border * 2, im.height + border * 2), (17, 34, 51))
        bg.paste(im, (border, border))
        im = bg
    im.save(path)
    return path


def frame_pixels(colors, w=256, h=240):
    return [colors[i % len(colors)] for i in range(w * h)]


JSON_TMP = [None]


def run_lint(args, want_json=False):
    """跑 tools/nes_lint.py，回傳 (exit code, 輸出文字[, JSON])。"""
    extra = []
    if want_json:
        extra = ['--json', JSON_TMP[0]]
    p = subprocess.run([PY, LINT_PY] + args + extra, capture_output=True, text=True)
    out = p.stdout + p.stderr
    if want_json:
        with open(JSON_TMP[0], encoding='utf-8') as f:
            return p.returncode, out, json.load(f)
    return p.returncode, out


def test_lint_py(tmp):
    print('\n== C. tools/nes_lint.py ==')
    JSON_TMP[0] = os.path.join(tmp, 'out.json')
    P = LINTMOD.PALETTE
    good = [P[0x0F], P[0x21], P[0x16], P[0x30], P[0x2A]]

    f_ok = make_png(os.path.join(tmp, 'ok.png'), frame_pixels(good), 256, 240)
    rc, out = run_lint([f_ok])
    check('C1 合法畫面 → exit 0', rc == 0, out.strip().splitlines()[-1].strip())

    f26 = make_png(os.path.join(tmp, 'c26.png'),
                   frame_pixels([P[i] for i in list(range(0x00, 0x0D)) + list(range(0x10, 0x1D))]), 256, 240)
    rc, out, j = run_lint([f26], True)
    check('C2 26 色 → exit 1 且 JSON 記錄色數', rc == 1 and j['results'][0]['colors'] == 26,
          'rc=%d colors=%s' % (rc, j['results'][0]['colors']))

    f_bad = make_png(os.path.join(tmp, 'bad.png'), frame_pixels(good[:3] + [(1, 2, 3)]), 256, 240)
    rc, out, j = run_lint([f_bad], True)
    check('C3 非 64 色 → exit 1 且 badPixels > 0',
          rc == 1 and j['results'][0]['badPixels'] > 0 and '#010203' in j['results'][0]['badColors'],
          'bad=%s' % j['results'][0]['badPixels'])

    f_x3 = make_png(os.path.join(tmp, 'x3.png'), frame_pixels(good), 256, 240, scale=3)
    rc, out, j = run_lint([f_x3], True)
    check('C4 整數放大 3 倍 → 自動偵測 + exit 0',
          rc == 0 and j['results'][0]['scale'] == 3 and j['results'][0]['native'] == [256, 240],
          'scale=%s native=%s' % (j['results'][0].get('scale'), j['results'][0].get('native')))

    f_sm = make_png(os.path.join(tmp, 'smooth.png'), frame_pixels(good), 256, 240, scale=3, smooth=True)
    rc, out = run_lint([f_sm])
    check('C5 放大時有平滑 → exit 1', rc == 1,
          next((l.strip() for l in out.splitlines() if '平滑' in l), ''))

    f_bd = make_png(os.path.join(tmp, 'border.png'), frame_pixels(good), 256, 240, scale=2, border=11)
    rc, out = run_lint([f_bd])
    check('C6 有瀏覽器邊框且未裁 → 不通過', rc != 0)
    rc, out = run_lint([f_bd, '--crop', '11,11,512,480', '--scale', '2'])
    check('C6 --crop + --scale 後通過', rc == 0, out.strip().splitlines()[-1].strip())

    # 狀態列分區：上 32 列一組色、其餘另一組
    px = frame_pixels([P[0x30], P[0x0F]], 256, 32) + frame_pixels([P[0x21], P[0x16], P[0x2A]], 256, 208)
    f_st = make_png(os.path.join(tmp, 'status.png'), px, 256, 240)
    rc, out, j = run_lint([f_st, '--status-rows', '32'], True)
    reg = j['results'][0]['regions']
    check('C7 --status-rows 分區統計', rc == 0 and reg['status']['colors'] == 2 and reg['play']['colors'] == 3,
          'status=%d play=%d' % (reg['status']['colors'], reg['play']['colors']))

    # 224 可視高度也接受
    f224 = make_png(os.path.join(tmp, 'v224.png'), frame_pixels(good, 256, 224), 256, 224, scale=2)
    rc, _ = run_lint([f224])
    check('C8 256×224（裁過的可視區）也接受', rc == 0)

    # 調色盤一致性檢查
    pal_ok = os.path.join(tmp, 'palette_ok.js')
    with open(pal_ok, 'w', encoding='utf-8') as f:
        f.write('NES.PALETTE = [\n' + ',\n'.join("  '#%s'" % h for h in LINTMOD.PALETTE_HEX) + '\n];\n')
    rc, out = run_lint([f_ok, '--palette', pal_ok])
    check('C9 palette.js 與內建表一致 → 通過', rc == 0 and '一致' in out, out.splitlines()[0])

    pal_bad = os.path.join(tmp, 'palette_bad.js')
    hexes = list(LINTMOD.PALETTE_HEX)
    hexes[5] = '123456'
    with open(pal_bad, 'w', encoding='utf-8') as f:
        f.write('NES.PALETTE = [\n' + ',\n'.join("  '#%s'" % h for h in hexes) + '\n];\n')
    rc, out = run_lint([f_ok, '--palette', pal_bad])
    check('C10 palette.js 與內建表不一致 → exit 3', rc == 3, out.splitlines()[0])

    rc, out = run_lint([os.path.join(tmp, 'nope.png')])
    check('C11 檔案不存在 → exit 2', rc == 2)

    if os.path.exists(LINTMOD.PALETTE_JS):
        rc, out = run_lint([f_ok])
        check('C12 內建 64 色表 == engine/palette.js（真檔）', rc == 0 and '一致' in out.splitlines()[0],
              out.splitlines()[0])
    else:
        check('C12 engine/palette.js 尚未存在（只用內建表）', True, 'skipped')


# ---------------------------------------------------------------------------
# D. DEMO bank 截圖（純 pillow，每個 tile 用 4 灰階畫）
# ---------------------------------------------------------------------------
GREY = [(24, 24, 32), (96, 96, 112), (176, 176, 184), (248, 248, 248)]
SPR_GREY = [None, (64, 64, 80), (168, 152, 120), (248, 232, 200)]  # 色 0 透明
BGC = (40, 40, 52)
GRID = (86, 86, 104)

LABELS = ['CHR.DEMO - STARDUST HERO', 'BG BANK', 'SPR BANK', 'FONT TEST', 'SCENE',
          'HERO WALK 1-2-1-3', 'ENEMY']
PREVIEW = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', '0123456789.,:', "-!?'/()+=*>^@%$",
           'SCORE 001200', 'WORLD 1-1 x3 @07', 'STARDUST HERO!']
SCENE = [
    ['SKY', 'CLOUD_L', 'CLOUD_R', 'SKY', 'SKY', 'QBLOCK', 'BRICK', 'BRICK',
     'QBLOCK', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY'],
    ['SKY'] * 11 + ['LADDER'] + ['SKY'] * 4,
    ['SKY', 'SKY', 'BUSH', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY', 'SKY',
     'LADDER', 'SKY', 'WATER', 'WATER', 'WATER'],
    ['GROUND_TOP'] * 13 + ['WATER', 'WATER', 'WATER'],
]


def dump_demo(page, strings):
    page.goto('about:blank')
    page.add_script_tag(path=CHR_JS)
    return page.evaluate("""(strings) => {
      const D = NES.CHR.DEMO;
      const dump = b => {
        const idx = {};
        b.names.forEach(n => { idx[n] = b.index(n); });
        return { names: b.names, count: b.count, index: idx, tiles: b.tiles.map(t => Array.from(t)) };
      };
      const text = {};
      strings.forEach(s => { text[s] = D.text(s); });
      return { bg: dump(D.bg), spr: dump(D.spr), text: text, charmap: D.CHARMAP,
               hero: D.hero, enemy: D.enemy };
    }""", strings)


def draw_tile(im, tiles, idx, x, y, s, pal=GREY):
    t = tiles[idx]
    px = im.load()
    for ty in range(8):
        for tx in range(8):
            c = pal[t[ty * 8 + tx]]
            if c is None:
                continue
            for dy in range(s):
                for dx in range(s):
                    xx, yy = x + tx * s + dx, y + ty * s + dy
                    if 0 <= xx < im.width and 0 <= yy < im.height:
                        px[xx, yy] = c


def text_idx(data, s):
    """用 DEMO.CHARMAP 把字串轉成 bg bank 的磁磚索引（與 JS 的 DEMO.text 同規則）。"""
    if s in data['text']:
        return data['text'][s]
    cm, bi = data['charmap'], data['bg']['index']
    out = []
    for ch in s:
        name = cm.get(ch) or cm.get(ch.upper()) or 'SP'
        out.append(bi[name])
    return out


def draw_text(im, data, s, x, y, scale):
    for i, idx in enumerate(text_idx(data, s)):
        draw_tile(im, data['bg']['tiles'], idx, x + i * 8 * scale, y, scale)


def render_sheet(data, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    S, SL, ST, SH = 4, 3, 4, 6      # 磁磚表 / 標題 / 文字預覽 / 主角放大倍率
    cols, pad = 16, 12
    cell = 8 * S + 1
    bg, spr = data['bg'], data['spr']
    bg_rows = (bg['count'] + cols - 1) // cols
    spr_rows = (spr['count'] + cols - 1) // cols
    lab = 8 * SL + 6
    W = pad * 2 + max(cols * cell + 1, 16 * 8 * S, 24 * 8 * SL)
    H = (pad + lab * 2 + bg_rows * cell + 12 + lab + spr_rows * cell + 12 +
         lab + len(PREVIEW) * (8 * ST + 3) + 12 + lab + 4 * 8 * S + 12 +
         lab + 24 * SH + pad * 3)
    im = Image.new('RGB', (W, H), BGC)
    px = im.load()
    state = {'y': pad}

    def label(s):
        draw_text(im, data, s, pad, state['y'], SL)
        state['y'] += lab

    def grid(bank):
        y0 = state['y']
        rows = (bank['count'] + cols - 1) // cols
        for i in range(bank['count']):
            r, c = divmod(i, cols)
            draw_tile(im, bank['tiles'], i, pad + 1 + c * cell, y0 + 1 + r * cell, S)
        for r in range(rows + 1):
            for x in range(cols * cell + 1):
                px[pad + x, y0 + r * cell] = GRID
        for c in range(cols + 1):
            for yy in range(rows * cell + 1):
                px[pad + c * cell, y0 + yy] = GRID
        state['y'] = y0 + rows * cell + 12

    label(LABELS[0])
    label(LABELS[1] + ' ' + str(bg['count']))
    grid(bg)
    label(LABELS[2] + ' ' + str(spr['count']))
    grid(spr)

    label(LABELS[3])
    for s in PREVIEW:
        draw_text(im, data, s, pad, state['y'], ST)
        state['y'] += 8 * ST + 3
    state['y'] += 12

    # 場景：地形磚 + 主角 + 敵人（精靈的色 0 透明）
    label(LABELS[4])
    sy = state['y']
    for r, row in enumerate(SCENE):
        for c, name in enumerate(row):
            draw_tile(im, bg['tiles'], bg['index'][name], pad + c * 8 * S, sy + r * 8 * S, S)
    for part in data['hero']['frames'][0]:
        draw_tile(im, spr['tiles'], spr['index'][part['tile']],
                  pad + 4 * 8 * S + part['x'] * S, sy + part['y'] * S, S, SPR_GREY)
    for part in data['enemy']['parts']:
        base = spr['index'][part['tile']]
        draw_tile(im, spr['tiles'], base,
                  pad + 9 * 8 * S + part['x'] * S, sy + 8 * S, S, SPR_GREY)
        draw_tile(im, spr['tiles'], base + 1,
                  pad + 9 * 8 * S + part['x'] * S, sy + 16 * S, S, SPR_GREY)
    state['y'] = sy + 4 * 8 * S + 12

    # 主角三幀 + 敵人放大
    label(LABELS[5] + ' / ' + LABELS[6])
    y = state['y']
    x = pad
    for f in data['hero']['frames']:
        for part in f:
            draw_tile(im, spr['tiles'], spr['index'][part['tile']],
                      x + part['x'] * SH, y + part['y'] * SH, SH, SPR_GREY)
        x += 16 * SH + 16
    for part in data['enemy']['parts']:
        base = spr['index'][part['tile']]
        draw_tile(im, spr['tiles'], base, x + part['x'] * SH, y + 4 * SH, SH, SPR_GREY)
        draw_tile(im, spr['tiles'], base + 1, x + part['x'] * SH, y + 12 * SH, SH, SPR_GREY)
    im.save(out)
    print('  saved', out, im.size)
    return im


def main():
    no_shot = '--no-shot' in sys.argv
    tmp = tempfile.mkdtemp(prefix='nes_chr_')
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: check('JS pageerror', False, str(e)))
        test_chr(page)
        test_lint_js(page)
        if not no_shot:
            print('\n== D. DEMO bank 截圖 ==')
            data = dump_demo(page, LABELS + PREVIEW)
            out = os.path.join(SHOT_DIR, 'demo_bank.png')
            render_sheet(data, out)
            check('D1 demo_bank.png 已產生', os.path.exists(out), out)
        browser.close()
    test_lint_py(tmp)

    n = len(RESULTS)
    bad = [r for r in RESULTS if not r[1]]
    print('\n===== 共 %d 項測試，PASS %d，FAIL %d =====' % (n, n - len(bad), len(bad)))
    for name, _, detail in bad:
        print('  FAIL %s｜%s' % (name, detail))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
