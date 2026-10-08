# -*- coding: utf-8 -*-
"""《星塵勇者》世界地圖 / 密碼存檔 / 副武器 自動驗證（R4 star-meta）。

兩個 harness：
  ① 隔離頁（about:blank + add_script_tag）：只載 engine + 資料層 + 本卡三支新檔，
     驗「密碼編解碼往返 / 壞碼拒絕 / 地圖版面 / 解鎖規則 / 新世界自動長出節點 / CHR 合法」。
  ② 真頁（star.html）：驗「標題 → 地圖 → 關卡 / 道具屋 / 密碼輸入畫面」整條流程，
     以及副武器（發射 / 切換 / 彈藥 / 打掉護甲礦兵的第二解法 / 跑步手感不受影響），
     每種畫面各存 ≥ 2 張截圖 + lint。

用法：
    ../卡比之星/.venv/bin/python games/star/test_meta.py [-v] [--shots shots/agent_meta]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤
"""
import base64
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
SHOTS = ROOT / 'shots' / 'test_meta'     # 測試自動產生的驗證圖（agent_meta/ 只留 3 張代表圖）
if '--shots' in sys.argv:
    SHOTS = ROOT / sys.argv[sys.argv.index('--shots') + 1]

ENGINE = ['palette.js', 'fixed.js', 'input.js', 'cpu_timing.js', 'chr.js', 'ppu.js', 'nes_lint.js',
          'apu.js', 'music.js', 'shmup.js']
GAME = ['chr_world.js', 'chr_w2.js', 'song.js', 'song_w2.js', 'enemies.js', 'enemies_w2.js',
        'boss.js', 'boss_w2.js', 'objects_w2.js', 'levels_w1.js', 'levels_w2.js',
        'icons2x.js', 'password.js', 'subweapon.js', 'worldmap.js']
BASE = (ROOT / 'star.html').as_uri() + '?debug=1&scale=1&mute=1'

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


def eq(name, got, want, detail=''):
    ok(name, got == want, detail or ('got=%r want=%r' % (got, want)))


def shot(page, path, scale=3):
    path.parent.mkdir(parents=True, exist_ok=True)
    page.evaluate("()=>__nes.render()")
    d = page.evaluate("""(s)=>{const c=(NES.instance&&NES.instance.canvas)||document.getElementById('nes');
        const o=document.createElement('canvas'); o.width=c.width*s; o.height=c.height*s;
        const x=o.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(c,0,0,o.width,o.height);
        return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(d.split(',', 1)[1]))


JS_TAPS = r"""
(keys) => {
  const B = NES.Input.BTN;
  for (const k of keys) {
    NES.Input.inject(B[k], 1); __nes.step(1);
    NES.Input.inject(0, 1); __nes.step(1);
  }
  return window.GAME.state();
}
"""


# =====================================================================  ① 隔離頁
def body_pure(page):
    # ---------------------------------------------------------- 密碼：字母表
    print('[① 密碼：字母表 / 編碼 / 校驗]')
    P = page.evaluate("() => ({ a: ST.Password.ALPHABET, len: ST.Password.LEN, bits: ST.Password.BITS })")
    eq('字母表 16 個字（4 bit / 字）', len(P['a']), 16, P['a'])
    eq('密碼長度 10 個字母（任務書 8 ~ 12）', P['len'], 10)
    eq('通關位元 16 個（4 世界 × 4 關）', P['bits'], 16)
    ok('字母表避開易混字 I O Q S U V W X Y Z',
       not (set('IOQSUVWXYZ') & set(P['a'])), P['a'])
    ok('字母表沒有重複字', len(set(P['a'])) == 16, P['a'])

    # ---------------------------------------------------------- 往返
    print('[① 密碼：編碼 → 解碼往返]')
    CASES = [
        {'cleared': 0x0001, 'lives': 3, 'owned': 0, 'sel': 0, 'score': 0},
        {'cleared': 0x000F, 'lives': 5, 'owned': 1, 'sel': 1, 'score': 12000},
        {'cleared': 0x00FF, 'lives': 9, 'owned': 3, 'sel': 2, 'score': 99000},
        {'cleared': 0xFFFF, 'lives': 15, 'owned': 3, 'sel': 1, 'score': 255000},
        {'cleared': 0x1234, 'lives': 1, 'owned': 2, 'sel': 2, 'score': 7000},
    ]
    for c in CASES:
        r = page.evaluate("""(st) => {
          const code = ST.Password.encode(st);
          const back = ST.Password.decode(code);
          return { code, back, inAlpha: code.split('').every(ch => ST.Password.ALPHABET.indexOf(ch) >= 0) };
        }""", c)
        tag = 'mask=0x%04X lives=%d owned=%d sel=%d' % (c['cleared'], c['lives'], c['owned'], c['sel'])
        ok('往返 %s：長度 10 且全部在字母表' % tag, len(r['code']) == 10 and r['inAlpha'], r['code'])
        b = r['back'] or {}
        ok('往返 %s：解得開且四個欄位一致' % tag,
           bool(r['back']) and b.get('cleared') == c['cleared'] and b.get('lives') == c['lives']
           and b.get('owned') == c['owned'] and b.get('sel') == c['sel'] and b.get('score') == c['score'],
           (r['code'], b))

    # ---------------------------------------------------------- 壞碼
    print('[① 密碼：壞碼一律拒絕]')
    bad = page.evaluate("""() => {
      const P = ST.Password;
      const code = P.encode({ cleared: 0x00FF, lives: 7, owned: 3, sel: 2, score: 42000 });
      const A = P.ALPHABET;
      let rejected = 0, total = 0;
      for (let i = 0; i < code.length; i++) {
        for (let j = 0; j < A.length; j++) {
          if (A.charAt(j) === code.charAt(i)) continue;
          total++;
          const bad = code.slice(0, i) + A.charAt(j) + code.slice(i + 1);
          if (!P.decode(bad)) rejected++;
        }
      }
      return {
        code, total, rejected,
        short: P.decode(code.slice(0, 9)), long: P.decode(code + 'A'),
        illegal: P.decode('IOQSUVWXYZ'), blank: P.decode(P.blank()),
        empty: P.decode(''), nil: P.decode(null),
        lower: P.decode(code.toLowerCase()),
        spaced: P.decode(P.format(code))
      };
    }""")
    ok('改掉任何一個字母 → 至少 95%% 被校驗擋下（%d / %d）' % (bad['rejected'], bad['total']),
       bad['rejected'] >= bad['total'] * 0.95, (bad['rejected'], bad['total']))
    ok('長度 9 → 拒絕', bad['short'] is None)
    ok('長度 11 → 拒絕', bad['long'] is None)
    ok('含字母表以外的字（IOQSUVWXYZ）→ 拒絕', bad['illegal'] is None)
    ok('全 A 的空密碼 → 拒絕（校驗不過）', bad['blank'] is None)
    ok('空字串 / null → 拒絕', bad['empty'] is None and bad['nil'] is None)
    ok('小寫也收（normalize）', bad['lower'] is not None)
    ok('抄成 "ABCDE FGHJK" 分組格式也收', bad['spaced'] is not None)

    fmt = page.evaluate("() => ST.Password.format('ABCDEFGHJK')")
    eq('format 每 5 字一組', fmt, 'ABCDE FGHJK')

    # ---------------------------------------------------------- 位元工具
    print('[① 密碼：關卡 id ↔ 通關位元]')
    bits = page.evaluate("""() => {
      const P = ST.Password, out = { pairs: [], round: true, nextOk: true };
      for (let i = 0; i < P.BITS; i++) {
        const id = P.bitToId(i);
        if (P.idToBit(id) !== i) out.round = false;
        out.pairs.push(id);
      }
      out.first = P.bitToId(0); out.last = P.bitToId(P.BITS - 1);
      out.bad = [P.idToBit('test'), P.idToBit('0-1'), P.idToBit('5-1'), P.idToBit('1-5')];
      let m = 0;
      m = P.setCleared(m, '1-1', true); m = P.setCleared(m, '2-3', true);
      out.mask = m; out.has11 = P.isCleared(m, '1-1'); out.has12 = P.isCleared(m, '1-2');
      out.count = P.countCleared(m);
      out.cleared0 = P.setCleared(m, '1-1', false);
      out.next = P.nextId('1-4');
      if (P.nextId('4-4') !== null) out.nextOk = false;
      return out;
    }""")
    eq('位元 0 = 1-1', bits['first'], '1-1')
    eq('位元 15 = 4-4', bits['last'], '4-4')
    ok('16 關 id ↔ 位元往返一致', bits['round'], bits['pairs'])
    ok('認不出來的 id 回 −1', bits['bad'] == [-1, -1, -1, -1], bits['bad'])
    ok('setCleared / isCleared / countCleared 正確',
       bits['has11'] and not bits['has12'] and bits['count'] == 2, bits)
    ok('setCleared(..., false) 清掉該位元', bits['cleared0'] == bits['mask'] - 1, bits)
    eq('1-4 的下一關是 2-1（跨世界）', bits['next'], '2-1')
    ok('4-4 沒有下一關', bits['nextOk'])

    clampd = page.evaluate("""() => {
      const P = ST.Password;
      const a = P.decode(P.encode({ cleared: 0, lives: 99, owned: 0, sel: 0, score: 9999999 }));
      const b = P.decode(P.encode({ cleared: 0, lives: 2, owned: 1, sel: 2, score: 0 }));
      return { lives: a.lives, score: a.score, sel: b.sel };
    }""")
    eq('命數夾在 15 以內', clampd['lives'], 15)
    eq('分數夾在 255000 以內', clampd['score'], 255000)
    eq('選了沒擁有的副武器 → 編碼時歸 0', clampd['sel'], 0)

    # ---------------------------------------------------------- 地圖版面
    print('[② 世界地圖：版面 / 解鎖 / 新世界自動長節點]')
    L = page.evaluate("""() => {
      const W = ST.WorldMap;
      const l1 = W.build(1), l2 = W.build(2);
      const cells = l1.nodes.map(n => n.cx + ',' + n.cy);
      return {
        n1: l1.nodes.length, n2: l2.nodes.length,
        kinds: l1.nodes.map(n => n.kind), labels: l1.nodes.map(n => n.label),
        ids: l1.nodes.map(n => n.id), links: l1.links,
        unique: new Set(cells).size === cells.length,
        inGrid: l1.nodes.every(n => n.cx >= 0 && n.cx < W.GRID_COLS && n.cy >= 0 && n.cy < W.GRID_ROWS),
        onScreen: l1.nodes.every(n => W.cellCol(n.cx) + 1 < 32 && W.cellRow(n.cy) + 2 < 26),
        worlds: W.worlds()
      };
    }""")
    eq('世界 1 的地圖 = 四關 + 道具屋 = 5 個節點', L['n1'], 5)
    eq('世界 2 的地圖也是 5 個節點', L['n2'], 5)
    eq('節點種類：4 關 + shop', L['kinds'], ['level'] * 4 + ['shop'])
    eq('節點標籤 = 關號 + $', L['labels'], ['1', '2', '3', '4', '$'])
    eq('節點對應 1-1 ~ 1-4', L['ids'][:4], ['1-1', '1-2', '1-3', '1-4'])
    ok('節點座標不重複', L['unique'])
    ok('節點都在 8 × 5 格內', L['inGrid'])
    ok('節點圖示 + 標籤都畫得進 32 欄 / 列 26 以內', L['onScreen'])
    eq('節點之間連成一條鏈（4 條路徑）', len(L['links']), 4)
    ok('worlds() 認得世界 1 / 2', L['worlds'][:2] == [1, 2], L['worlds'])

    U = page.evaluate("""() => {
      const W = ST.WorldMap, P = ST.Password, l = W.build(1);
      function locks(mask) {
        const out = [];
        for (let i = 0; i < l.nodes.length; i++) if (!W.unlocked(l, i, mask)) out.push(i);
        return out;
      }
      function dones(mask) {
        const out = [];
        for (let i = 0; i < l.nodes.length; i++) if (W.isDone(l, i, mask)) out.push(i);
        return out;
      }
      const m0 = 0;
      const m1 = P.setCleared(0, '1-1', true);
      const m2 = P.setCleared(m1, '1-2', true);
      const all = P.setCleared(P.setCleared(m2, '1-3', true), '1-4', true);
      return { l0: locks(m0), l1: locks(m1), l2: locks(m2), lAll: locks(all),
               d0: dones(m0), d1: dones(m1), dAll: dones(all) };
    }""")
    eq('一關都沒過：2 / 3 / 4 關鎖住、第 1 關與道具屋開著', U['l0'], [1, 2, 3])
    eq('過了 1-1：第 2 關解鎖', U['l1'], [2, 3])
    eq('過了 1-2：第 3 關解鎖', U['l2'], [3])
    eq('四關全過：沒有鎖住的節點', U['lAll'], [])
    eq('沒過關 → 沒有打勾', U['d0'], [])
    eq('過了 1-1 → 節點 0 打勾', U['d1'], [0])
    eq('四關全過 → 四個節點都打勾', U['dAll'], [0, 1, 2, 3])

    # F4-1 / F4-2 的 W3 / W4：只要 ST.Levels.register 掛進來就自動有節點
    N = page.evaluate("""() => {
      const W = ST.WorldMap, P = ST.Password;
      // 模擬 F4-1 / F4-2 註冊新世界（register 會 push 進 ST.Levels.ids，本處直接等價操作）
      ['9-1', '9-2', '9-3', '9-4', '9-5'].forEach(id => {
        ST.LEVELS[id] = { id: id };
        if (ST.Levels.ids.indexOf(id) < 0) ST.Levels.ids.push(id);
      });
      const l = W.build(9);
      const main4 = P.setCleared(P.setCleared(P.setCleared(P.setCleared(0, '1-1', true), '1-2', true), '1-3', true), '1-4', true);
      return {
        n: l.nodes.length, kinds: l.nodes.map(x => x.kind), labels: l.nodes.map(x => x.label),
        branchLockedEmpty: !W.unlocked(l, 5, 0),
        worlds: W.worlds()
      };
    }""")
    eq('註冊第 9 世界五關 → 地圖自動長出 4 關 + 道具屋 + 支線 = 6 節點', N['n'], 6)
    eq('stage ≥ 5 自動變成支線節點', N['kinds'], ['level'] * 4 + ['shop', 'branch'])
    eq('支線節點標籤是 ?', N['labels'][5], '?')
    ok('支線節點在主線四關沒通關前是鎖住的', N['branchLockedEmpty'])
    ok('worlds() 也看得到新世界 9', 9 in N['worlds'], N['worlds'])

    # ---------------------------------------------------------- CHR
    print('[② 世界地圖：原創 CHR 磚]')
    C = page.evaluate("""() => {
      const keys = Object.keys(ST.BG_MAP);
      let okAll = true, bad = null;
      keys.forEach(k => {
        const rows = ST.BG_MAP[k];
        if (!Array.isArray(rows) || rows.length !== 8) { okAll = false; bad = k; return; }
        rows.forEach(r => { if (typeof r !== 'string' || r.length !== 8 || /[^.123]/.test(r)) { okAll = false; bad = k; } });
        try { NES.CHR.tile(rows); } catch (e) { okAll = false; bad = k + ': ' + e.message; }
      });
      return { n: keys.length, okAll, bad, keys };
    }""")
    eq('ST.BG_MAP 共 23 磚（地形 7 + 節點 4 組 × 4）', C['n'], 23)
    ok('每一磚都是合法的 8×8 2bpp（NES.CHR.tile 不丟例外）', C['okAll'], C['bad'])

    # ---------------------------------------------------------- 副武器純邏輯
    print('[③ 副武器：登記 / 護甲礦兵 2 發]')
    S = page.evaluate("""() => {
      const SW = ST.SubWeapon, E = ST.Enemies;
      return {
        kinds: SW.NAMES, maxShots: SW.MAX_SHOTS, ammo: SW.AMMO_PICK,
        armorHits: E.EXT.armor ? E.EXT.armor.subHits : null,
        armorStompable: E.EXT.armor ? E.EXT.armor.stompable : null,
        immuneBoss: !!SW.IMMUNE.boss,
        constHits: ST.EnemiesW2.CONST.ARM_SUB_HITS
      };
    }""")
    eq('兩種副武器：火球 / 飛鏢', S['kinds'], ['', 'FIRE', 'DART'])
    eq('同屏最多 3 發', S['maxShots'], 3)
    eq('護甲礦兵要 2 發副武器（研究 04 §2 的第二解法）', S['armorHits'], 2)
    ok('護甲礦兵仍然不可踩（第一解法還是繞路 / 無敵星）', S['armorStompable'] is False)
    eq('enemies_w2 的 CONST 也導出 ARM_SUB_HITS', S['constHits'], 2)
    ok('魔王對副武器免疫（踩頭仍是唯一解）', S['immuneBoss'])

    # ---------------------------------------------------------- 2× 圖示（純邏輯）
    print('[④ 2× 互動物件圖示：規格 / 幾何 / 退回]')
    I = page.evaluate("""() => {
      const X = ST.Icons2x, T = ST.TILE, st = X.state();
      let artOk = true, bad = null;
      for (const k in X.BG) {
        const rows = X.BG[k];
        if (!Array.isArray(rows) || rows.length !== 8) { artOk = false; bad = k; continue; }
        rows.forEach(r => { if (typeof r !== 'string' || r.length !== 8 || /[^.123]/.test(r)) { artOk = false; bad = k + ':' + r; } });
        try { NES.CHR.tile(rows); } catch (e) { artOk = false; bad = k + ' ' + e.message; }
      }
      const spec = {};
      [['COIN', T.COIN], ['GOAL_TOP', T.GOAL_TOP], ['QBLOCK', T.QBLOCK], ['USED', T.USED], ['BRICK', T.BRICK]]
        .forEach(([n, c]) => { const sp = X.specOf(c); spec[n] = sp ? { w: sp.w, h: sp.h, oneway: sp.oneway, kind: sp.kind } : null; });
      // 假地圖：1 顆孤立金幣 (5,10)、兩顆相鄰金幣 (8,10)(9,10)、一排 ? 磚 (12..13,10)
      const map = {};
      const put = (c, r, t) => { map[c + ',' + r] = t; };
      put(5, 10, T.COIN); put(8, 10, T.COIN); put(9, 10, T.COIN);
      put(12, 10, T.QBLOCK); put(13, 10, T.QBLOCK); put(13, 9, T.GROUND);
      const tileAt = (c, r) => (map[c + ',' + r] === undefined ? T.EMPTY : map[c + ',' + r]);
      const nm = (c, r) => X.nameAt(c, r, tileAt, 40);
      return {
        st, artOk, bad, spec,
        lone: [nm(5, 10), nm(5, 9), nm(6, 10), nm(6, 9)],
        pairLeft: nm(8, 10), pairRight: [nm(9, 10), nm(9, 9), nm(10, 10)],
        blocked: nm(13, 10),                 // 上面是地面 ⇒ 放不下 ⇒ 退回 1×1
        qb: [nm(12, 10), nm(12, 9)],
        kindUp: X.kindAt(12, 9, tileAt, 40), kindAnchor: X.kindAt(12, 10, tileAt, 40),
        kindBlocked: X.kindAt(13, 9, tileAt, 40),
        kindCoinUp: X.kindAt(5, 9, tileAt, 40),
        touchTop: X.touching(5 * 8 + 9, 9 * 8, 12, 22, tileAt, 40).map(o => o.col + ',' + o.row + ':' + o.kind)
      };
    }""")
    eq('2× 圖示新增 18 個背景磚（fix-r4 多了旗子四塊）', I['st']['tiles'], 18)
    ok('每一磚都是合法的 8×8 2bpp', I['artOk'], I['bad'])
    eq('金幣 = 2×2（16×16）、非固體', I['spec']['COIN'], {'w': 2, 'h': 2, 'oneway': False, 'kind': 'coin'})
    eq('旗桿頂端 = 2×2、非固體', I['spec']['GOAL_TOP'], {'w': 2, 'h': 2, 'oneway': False, 'kind': 'ball'})
    eq('? 磚 = 1×2（8×16）、長出來的格是 oneway', I['spec']['QBLOCK'], {'w': 1, 'h': 2, 'oneway': True, 'kind': 'block'})
    eq('用過的磚同規格', I['spec']['USED'], {'w': 1, 'h': 2, 'oneway': True, 'kind': 'block'})
    eq('磚塊同規格', I['spec']['BRICK'], {'w': 1, 'h': 2, 'oneway': True, 'kind': 'block'})
    eq('孤立金幣 → 四格分別是 BL / TL / BR / TR',
       I['lone'], ['I2_COIN_BL', 'I2_COIN_TL', 'I2_COIN_BR', 'I2_COIN_TR'])
    ok('兩顆金幣相鄰時左邊那顆退回 1×1（不會互相蓋掉）', I['pairLeft'] is None, I['pairLeft'])
    # fix-r4（qa-r4 P3-5）：同一排相鄰的金幣要嘛全大、要嘛全小 ⇒ 右邊那顆**跟著退回**
    eq('同一排相鄰的金幣一起退回 1×1（不再一大一小）', I['pairRight'], [None, None, None])
    ok('上面是地形時 ? 磚退回 1×1', I['blocked'] is None, I['blocked'])
    eq('? 磚 = 下塊 + 上塊', I['qb'], ['I2_QB_B', 'I2_QB_T'])
    eq('? 磚長出來的那一格 = 單向平台（踩得到、頂得過）', I['kindUp'], 'oneway')
    ok('錨點那一格的地形語意不變（仍由磚本身決定）', I['kindAnchor'] is None, I['kindAnchor'])
    ok('退回 1×1 的 ? 磚不會多出 oneway', I['kindBlocked'] is None, I['kindBlocked'])
    ok('金幣長出來的格**不是**固體（碰撞完全不變）', I['kindCoinUp'] is None, I['kindCoinUp'])
    eq('站在大金幣右上角也算碰到它（友善判定）', I['touchTop'], ['5,10:coin'])


    # ------------------------------------------------- fix-r4（qa-r4 P2-2 / P3-5 / P3-6）
    print('[④b fix-r4：旗桿球 16/16 關都 2× / 旗子也 2× / 同排金幣一致 / 只蓋純背景紋]')
    F = page.evaluate("""() => {
      const X = ST.Icons2x, T = ST.TILE, names = {};
      for (const k in T) names[T[k]] = k;
      const ids = Object.keys(ST.LEVELS).filter(k => k.length === 3 && k.charAt(1) === '-').sort();
      let ball = 0, ballN = 0, flag = 0, flagN = 0, coinN = 0, coinBig = 0, mixedRows = 0;
      const mixed = [];
      for (const id of ids) {
        const lv = ST.LEVELS[id], tileAt = (c, r) => lv.tileAt(c, r), cols = lv.cols;
        const byRow = {};
        for (let c = 0; c < cols; c++) for (let r = 4; r < 30; r++) {
          const t = tileAt(c, r);
          if (t === T.GOAL_TOP) { ballN++; if (X.nameAt(c, r, tileAt, cols) === 'I2_BALL_BL') ball++; }
          else if (t === T.FLAG) { flagN++; if (X.nameAt(c, r, tileAt, cols) === 'I2_FLAG_TL') flag++; }
          else if (t === T.COIN) {
            coinN++;
            const big = X.nameAt(c, r, tileAt, cols) === 'I2_COIN_BL';
            if (big) coinBig++;
            (byRow[r] = byRow[r] || []).push([c, big ? 1 : 0]);
          }
        }
        // 「同一排」＝ 同一列、相鄰兩顆相距 <= 2 欄（金幣弧線的排法）
        for (const r in byRow) {
          const list = byRow[r].sort((a, b) => a[0] - b[0]);
          let run = [list[0]];
          for (let i = 1; i <= list.length; i++) {
            if (i < list.length && list[i][0] - run[run.length - 1][0] <= 2) { run.push(list[i]); continue; }
            const big = run.filter(x => x[1]).length;
            if (big && big !== run.length) { mixedRows++; mixed.push(id + ':' + r + ':' + run.map(x => x[0]).join(',')); }
            if (i < list.length) run = [list[i]];
          }
        }
      }
      // 幾何：旗子往「下 + 右」長（往上是球的格子）
      const fsp = X.specOf(T.FLAG);
      // coverable：純背景紋可以蓋、固體 / 看得出是東西的磚不能蓋
      const map = {};
      const put = (c, r, t) => { map[c + ',' + r] = t; };
      put(5, 10, T.COIN); put(6, 9, T.VEIN);              // 右上是岩層紋 ⇒ 可以蓋
      put(9, 10, T.COIN); put(10, 9, T.BUSH);             // 右上是草叢 ⇒ 不蓋
      put(13, 10, T.COIN); put(14, 9, T.GROUND);          // 右上是地面 ⇒ 不蓋
      const tileAt2 = (c, r) => (map[c + ',' + r] === undefined ? T.EMPTY : map[c + ',' + r]);
      const nm2 = (c, r) => X.nameAt(c, r, tileAt2, 40);
      return {
        ball, ballN, flag, flagN, coinN, coinBig, mixedRows, mixed: mixed.slice(0, 4),
        flagSpec: fsp ? { w: fsp.w, h: fsp.h, ox: fsp.ox, oy: fsp.oy, oneway: fsp.oneway, kind: fsp.kind } : null,
        onVein: [nm2(5, 10), nm2(6, 9)],
        veinKind: X.kindAt(6, 9, tileAt2, 40),             // 蓋掉裝飾紋**不會**變成地形
        onBush: nm2(9, 10),
        onGround: nm2(13, 10)
      };
    }""")
    ok('旗桿頂端的球**每一關**都放大（P2-2；本頁載入 %d 關）' % F['ballN'],
       F['ballN'] >= 8 and F['ball'] == F['ballN'], [F['ball'], F['ballN']])
    ok('旗子每一關也放大（P3-6）', F['flagN'] >= 8 and F['flag'] == F['flagN'], [F['flag'], F['flagN']])
    eq('旗子 = 2×2、錨點在左上（往下 + 右長，不跟球搶格）',
       F['flagSpec'], {'w': 2, 'h': 2, 'ox': 0, 'oy': 0, 'oneway': False, 'kind': 'flag'})
    eq('16 關沒有任何一排金幣大小不一（P3-5）', [F['mixedRows'], F['mixed']], [0, []])
    ok('金幣放大覆蓋率 >= 95%%（%d / %d）' % (F['coinBig'], F['coinN']),
       F['coinBig'] * 100 >= F['coinN'] * 95, [F['coinBig'], F['coinN']])
    eq('延伸格可以蓋掉純背景紋（岩層紋 VEIN）', F['onVein'], ['I2_COIN_BL', 'I2_COIN_TR'])
    ok('蓋掉背景紋不會讓那一格變成地形（碰撞 0 改動）', F['veinKind'] is None, F['veinKind'])
    ok('看得出是東西的裝飾磚（草叢）不蓋 ⇒ 退回 1×1', F['onBush'] is None, F['onBush'])
    ok('固體地形當然不蓋 ⇒ 退回 1×1', F['onGround'] is None, F['onGround'])


# =====================================================================  ② 真頁
def fresh(page, level=None):
    page.goto(BASE + (('&level=' + level) if level else ''))
    page.wait_for_function('() => !!window.__nes && !!window.GAME && !!window.GAME.dev')
    page.evaluate('() => __nes.step(2)')
    return page.evaluate('() => window.GAME.state()')


def body_live(page):
    SHOTS.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------- 標題選單
    print('[④ 標題：SELECT 輪到 PASSWORD / UP / B 進地圖]')
    s0 = fresh(page)
    eq('沒有 ?level 時停在標題', s0['mode'], 'title')
    t = page.evaluate("""() => {
      const B = NES.Input.BTN, o = [], n = ST.WorldMap.worlds().length + 1;
      for (let i = 0; i < n + 1; i++) {
        NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
        o.push(window.GAME.state().titleWorld);
      }
      return { seq: o, worlds: ST.WorldMap.worlds() };
    }""")
    ok('SELECT 輪替含全部世界 + PASSWORD（%s）' % t['seq'],
       t['seq'].count(0) == 1 and sorted(set(t['seq'])) == sorted(set([0] + t['worlds'])), t)
    ok('輪一圈回到 WORLD 1', t['seq'][len(t['worlds'])] == 1, t['seq'])
    pw = page.evaluate("() => { GAME.dev.titleSel(0); __nes.step(1); return GAME.dev.screenText(11, 11, 8); }")
    page.evaluate("() => { GAME.dev.titleSel(1); }")
    eq('選到 PASSWORD 時標題第 11 列寫 PASSWORD', pw, 'PASSWORD')
    hint = page.evaluate("() => GAME.dev.screenText(15, 6, 19)")
    eq('標題多一行 UP OR B = WORLD MAP（列 15）', hint, 'UP OR B = WORLD MAP')
    ok('舊的 SELECT = WORLD 提示行沒被動到',
       page.evaluate("() => GAME.dev.screenText(12, 7, 16)") == '$ SELECT = WORLD')

    s = fresh(page)
    a = page.evaluate(JS_TAPS, ['B'])
    eq('標題按 B → 進世界地圖', a['mode'], 'map')
    s = fresh(page)
    a = page.evaluate(JS_TAPS, ['UP'])
    eq('標題按 UP → 進世界地圖', a['mode'], 'map')

    # ---------------------------------------------------------- 地圖畫面
    print('[④ 世界地圖：畫面 / 走格子 / 鎖 / 進關卡]')
    eq('地圖抬頭寫 WORLD 1 MAP', page.evaluate("() => GAME.dev.screenText(4, 2, 11)"), 'WORLD 1 MAP')
    eq('地圖底部寫目前節點 LEVEL 1-1', page.evaluate("() => GAME.dev.screenText(26, 2, 9)"), 'LEVEL 1-1')
    eq('地圖抬頭的通關計數 CLEAR 00/16',
       page.evaluate("() => GAME.dev.screenText(4, 19, 11)"), 'CLEAR 00/16')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('地圖畫面 lint 綠、%d 色 ≤ 25' % lt['colors'], lt['ok'] and lt['colors'] <= 25,
       (lt['ok'], lt['colors'], lt.get('errors', [])[:2]))
    shot(page, SHOTS / 'map_world1.png')

    # ------------------------------------------------- fix-r4（qa-r4 P3-4）：地圖專用 HUD
    H = page.evaluate("""() => ({
      row1: GAME.dev.screenText(1, 0, 32), row2: GAME.dev.screenText(2, 0, 32),
      mode: window.GAME.state().mode
    })""")
    ok('地圖的上方 HUD 沒有 TIME（地圖上沒有時間）', 'TIME' not in H['row1'], H)
    ok('地圖的上方 HUD 沒有關號 WORLD 1-1（會跟下排 LEVEL 1-1 打架）',
       '1-1' not in H['row1'] and '1-1' not in H['row2'], H)
    ok('原本 TIME 的位置改標 WORLD MAP', 'WORLD MAP' in H['row1'], H['row1'])
    ok('SCORE / COIN / 命數照留（地圖上仍然有意義）',
       'SCORE' in H['row1'] and 'COIN' in H['row1'], H['row1'])

    m = page.evaluate("() => GAME.dev.meta().map")
    eq('游標停在第一個沒通關的節點（1-1）', m['at'], 0)
    eq('一關都沒過 ⇒ 節點 1 / 2 / 3 是灰的（鎖住）', m['locked'], [1, 2, 3])

    r = page.evaluate(JS_TAPS, ['RIGHT'])
    mm = page.evaluate("() => GAME.dev.meta().map")
    ok('1-1 還沒過 → 往右被擋，畫面寫 LOCKED', mm['at'] == 0 and mm['msg'] == 'LOCKED', mm)

    # 通關 1-1 之後再開地圖：節點 0 打勾、節點 1 解鎖、游標自動落在下一關、往回走有動畫
    w = page.evaluate("""() => {
      GAME.dev.clearLevel('1-1');
      GAME.dev.openMap(1);
      __nes.step(1);
      const before = GAME.dev.meta().map;
      const B = NES.Input.BTN;
      NES.Input.inject(B.LEFT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      const walking = GAME.dev.meta().map;
      const x0 = walking.x;
      __nes.step(10);
      const mid = GAME.dev.meta().map;
      for (let i = 0; i < 90 && GAME.dev.meta().map.walking; i++) __nes.step(1);
      const after = GAME.dev.meta().map;
      return { before, walking, x0, mid, after };
    }""")
    eq('通關 1-1 → 節點 0 打勾', w['before']['done'], [0])
    eq('通關 1-1 → 只剩節點 2 / 3 鎖著', w['before']['locked'], [2, 3])
    eq('游標自動落在下一關（節點 1 = 1-2）', w['before']['at'], 1)
    ok('按左 → 進入走格子動畫（walking = true）', w['walking']['walking'], w['walking'])
    ok('走格子時 x 真的在動（2 px / 幀）', w['mid']['x'] != w['x0'], (w['x0'], w['mid']['x']))
    ok('走回第 1 個節點（at = 0）且動畫結束', w['after']['at'] == 0 and not w['after']['walking'], w['after'])
    ok('走 10 幀剛好 20 px（2 px / 幀）', abs(w['mid']['x'] - w['x0']) == 20, (w['x0'], w['mid']['x']))
    eq('底部字換成 LEVEL 1-1', page.evaluate("() => GAME.dev.screenText(26, 2, 9)"), 'LEVEL 1-1')
    shot(page, SHOTS / 'map_walk.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('走格子後 lint 仍綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    e = page.evaluate(JS_TAPS, ['A'])
    ok('在打勾的節點上按 A → 重玩該關（mode play / level 1-1）',
       e['mode'] == 'play' and e['level'] == '1-1', (e['mode'], e['level']))

    # ---------------------------------------------------------- 道具屋
    print('[④ 道具屋：買副武器 / 補彈 / 無限彈藥]')
    sh = page.evaluate("""() => {
      GAME.dev.setCoins(30);
      GAME.dev.openMap(1);
      __nes.step(1);
      const W = ST.WorldMap;
      W.goto(W.slotOf(null) >= 0 ? W.slotOf(null) : 4);     // 道具屋節點
      __nes.step(1);
      const B = NES.Input.BTN;
      NES.Input.inject(B.A, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      return { st: window.GAME.state(), map: GAME.dev.meta().map };
    }""")
    ok('道具屋節點按 A → 開店', sh['st']['mapShop'] and sh['map']['shop']['item'] == 'fire', sh['map']['shop'])
    eq('店裡寫 ITEM SHOP', page.evaluate("() => GAME.dev.screenText(10, 11, 9)"), 'ITEM SHOP')
    # fix-r4（qa-r4 P3-3）：店面上方不能殘留地圖草地（列 6..9 要一起清掉）
    SR = page.evaluate("""() => {
      const out = [];
      for (let r = 4; r < 26; r++) out.push(GAME.dev.screenText(r, 0, 32));
      return out;
    }""")
    ok('店面上方（列 6..9）整片清乾淨，沒有殘留的地圖草地',
       all(t.strip() == '' for t in SR[2:6]), [t for t in SR[2:6]])
    ok('列 4..5 的 WORLD n MAP / CLEAR 留著（店在哪個世界仍看得到）',
       'WORLD 1 MAP' in SR[0] and 'CLEAR' in SR[0], SR[0])
    shot(page, SHOTS / 'shop.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('道具屋畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    buy = page.evaluate(JS_TAPS, ['A'])
    ok('買火球：扣 10 金幣、拿到火球 + 15 發',
       buy['coins'] == 20 and (buy['subOwned'] & 1) and buy['subAmmo'] == 15 and buy['sub'] == 1,
       (buy['coins'], buy['subOwned'], buy['subAmmo']))
    buy2 = page.evaluate(JS_TAPS, ['DOWN', 'A'])
    ok('買飛鏢：再扣 15 金幣、兩把都有',
       buy2['coins'] == 5 and buy2['subOwned'] == 3, (buy2['coins'], buy2['subOwned']))
    poor = page.evaluate(JS_TAPS, ['DOWN', 'DOWN', 'A'])
    m2 = page.evaluate("() => GAME.dev.meta().map")
    ok('金幣不夠買無限彈藥 → NOT ENOUGH COINS、金幣不變',
       poor['coins'] == 5 and m2['msg'] == 'NOT ENOUGH COINS' and not poor['subInf'], (poor['coins'], m2['msg']))
    inf = page.evaluate("""() => {
      GAME.dev.setCoins(50);
      const B = NES.Input.BTN;
      NES.Input.inject(B.A, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      return window.GAME.state();
    }""")
    ok('金幣夠 → 買到無限彈藥（扣 40）', inf['subInf'] and inf['coins'] == 10, (inf['subInf'], inf['coins']))
    back = page.evaluate(JS_TAPS, ['B'])
    ok('店裡按 B → 回地圖（店關掉、地圖重畫）', back['mode'] == 'map' and not back['mapShop'], back['mapShop'])
    eq('回地圖後抬頭字還在', page.evaluate("() => GAME.dev.screenText(4, 2, 11)"), 'WORLD 1 MAP')

    exit_ = page.evaluate(JS_TAPS, ['B'])
    ok('地圖按 B → 回標題', exit_['mode'] == 'title', exit_['mode'])
    eq('標題字重新畫出來', page.evaluate("() => GAME.dev.screenText(9, 9, 13)"), 'STARDUST HERO')

    # ---------------------------------------------------------- 密碼畫面
    print('[⑤ 密碼輸入畫面：輸入 / 壞碼 / 正確碼續關]')
    fresh(page)
    p1 = page.evaluate("""() => {
      GAME.dev.titleSel(0);
      __nes.step(1);
      const B = NES.Input.BTN;
      NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      return window.GAME.state();
    }""")
    eq('標題選 PASSWORD 按 START → 進密碼輸入畫面', p1['mode'], 'password')
    eq('畫面寫 PASSWORD', page.evaluate("() => GAME.dev.screenText(6, 12, 8)"), 'PASSWORD')
    eq('畫面列出字母表', page.evaluate("() => GAME.dev.screenText(13, 8, 16)"),
       page.evaluate("() => ST.Password.ALPHABET"))
    shot(page, SHOTS / 'password_blank.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('密碼畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    k = page.evaluate(JS_TAPS, ['UP'])
    ok('↑ 換下一個字母（第 1 位 A → B）', k['pwCode'][0] == 'B', k['pwCode'])
    k = page.evaluate(JS_TAPS, ['DOWN'])
    ok('↓ 換回上一個字母', k['pwCode'][0] == 'A', k['pwCode'])
    k = page.evaluate(JS_TAPS, ['RIGHT'])
    eq('→ 換到第 2 個字位', k['pwAt'], 1)
    k = page.evaluate(JS_TAPS, ['LEFT', 'LEFT'])
    eq('← 可以繞回最後一個字位', k['pwAt'], 9)

    bad = page.evaluate(JS_TAPS, ['START'])
    eq('全 A 的壞碼按 START → 留在密碼畫面', bad['mode'], 'password')
    eq('畫面寫 BAD CODE', page.evaluate("() => GAME.dev.screenText(22, 4, 8)"), 'BAD CODE')
    shot(page, SHOTS / 'password_bad.png')

    good = page.evaluate("""() => {
      const code = ST.Password.encode({ cleared: 0x0007, lives: 5, owned: 3, sel: 2, score: 34000 });
      ST.PasswordUI.set(code);
      __nes.step(1);
      const B = NES.Input.BTN;
      NES.Input.inject(B.START, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      return { code, st: window.GAME.state(), map: GAME.dev.meta().map };
    }""")
    eq('正確密碼按 START → 直接進世界地圖', good['st']['mode'], 'map')
    eq('通關位元套用（1-1 / 1-2 / 1-3）', good['st']['clearedMask'], 0x0007)
    ok('命 / 分數 / 副武器一起回來',
       good['st']['lives'] == 5 and good['st']['score'] == 34000 and good['st']['subOwned'] == 3
       and good['st']['sub'] == 2, (good['st']['lives'], good['st']['score'], good['st']['subOwned']))
    eq('地圖只剩最後一關之外全解鎖（三個打勾）', good['map']['done'], [0, 1, 2])
    eq('游標自動落在還沒過的 1-4（節點 3）', good['map']['at'], 3)
    shot(page, SHOTS / 'password_ok_map.png')

    # ---------------------------------------------------------- 副武器（真頁）
    print('[⑥ 副武器：發射 / 切換 / 彈藥 / 跑步手感 / 護甲礦兵]')
    fresh(page, '1-1')
    f = page.evaluate("""() => {
      GAME.dev.giveSub(1, 15);
      __nes.step(1);
      const a = window.GAME.state();
      const B = NES.Input.BTN;
      NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
      const b = window.GAME.state();
      const sub = GAME.dev.meta().sub;
      __nes.step(20);
      const c = GAME.dev.meta().sub;
      return { a, b, sub, c };
    }""")
    ok('拿到火球：owned bit0 + 15 發 + 自動選中', f['a']['subOwned'] == 1 and f['a']['subAmmo'] == 15 and f['a']['sub'] == 1,
       (f['a']['subOwned'], f['a']['subAmmo'], f['a']['sub']))
    ok('按 B → 射出一發（subShots 1 / 場上 1 發 / 彈藥 14）',
       f['b']['subShots'] == 1 and f['b']['subLive'] == 1 and f['b']['subAmmo'] == 14, f['b'])
    moved = bool(f['sub']['list']) and bool(f['c']['list']) and f['c']['list'][0]['x'] > f['sub']['list'][0]['x']
    ok('火球往前飛（20 幀後 x 變大）', moved, (f['sub']['list'], f['c']['list']))
    shot(page, SHOTS / 'sub_fire.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('發射中的畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    cool = page.evaluate("""() => {
      const B = NES.Input.BTN, out = [];
      for (let i = 0; i < 3; i++) { NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1); out.push(window.GAME.state().subShots); }
      return out;
    }""")
    ok('連按 B 有 16 幀冷卻（不會一幀一發）', cool[0] == cool[1] == cool[2], cool)

    sw = page.evaluate("""() => {
      GAME.dev.giveSub(2, 15);
      __nes.step(1);
      const a = window.GAME.state().sub;
      const B = NES.Input.BTN;
      NES.Input.inject(B.SELECT, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      const b = window.GAME.state().sub;
      const shots0 = window.GAME.state().subShots;
      NES.Input.inject(B.DOWN | B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(1);
      const c = window.GAME.state();
      return { a, b, c, shots0 };
    }""")
    eq('拿到第二把（飛鏢）後自動選中飛鏢', sw['a'], 2)
    eq('SELECT 切換副武器（飛鏢 → 火球）', sw['b'], 1)
    eq('↓ + B 切換（火球 → 飛鏢）', sw['c']['sub'], 2)
    ok('↓ + B 是切換不是發射（subShots 沒增加）', sw['c']['subShots'] == sw['shots0'],
       (sw['shots0'], sw['c']['subShots']))

    ammo = page.evaluate("""() => {
      GAME.dev.hero().subAmmo = 1;
      const B = NES.Input.BTN;
      const out = [];
      for (let i = 0; i < 3; i++) {
        NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(20);
        out.push({ ammo: window.GAME.state().subAmmo, shots: window.GAME.state().subShots, msg: ST.SubWeapon.msg });
      }
      ST.SubWeapon.setInfinite(true);
      NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(2);
      const inf = window.GAME.state();
      ST.SubWeapon.setInfinite(false);
      return { out, inf };
    }""")
    ok('彈藥打完 → 不再發射並顯示 NO AMMO',
       ammo['out'][-1]['ammo'] == 0 and ammo['out'][-1]['shots'] == ammo['out'][-2]['shots']
       and ammo['out'][-1]['msg'] == 'NO AMMO', ammo['out'])
    ok('無限模式：彈藥 0 也射得出來且不扣彈', ammo['inf']['subAmmo'] == 0 and ammo['inf']['subInf'], ammo['inf'])

    feel = page.evaluate("""() => {
      function run(withB) {
        GAME.dev.level('1-1');
        GAME.dev.warp(64);
        __nes.step(2);
        const B = NES.Input.BTN;
        const keys = withB ? (B.RIGHT | B.B) : B.RIGHT;
        const x0 = window.GAME.state().x, n0 = window.GAME.state().subShots;
        NES.Input.inject(keys, 60);
        __nes.step(60);
        const s = window.GAME.state();
        NES.Input.inject(0, 1); __nes.step(1);
        return { dx: s.x - x0, vx: s.vx, shots: s.subShots - n0 };
      }
      GAME.dev.hero().subOwned = 0; GAME.dev.hero().sub = 0; GAME.dev.hero().subAmmo = 0;
      const plain = run(true);           // 沒有副武器時按住 B = 純跑步（基準）
      GAME.dev.giveSub(1, 15);
      const armed = run(true);           // 有副武器時按住 B：只在按下那一幀發射，跑步不變
      return { plain, armed };
    }""")
    ok('按住 B 跑 60 幀：有沒有副武器**位移一模一樣**（手感 ±0 幀）',
       feel['plain']['dx'] == feel['armed']['dx'] and feel['plain']['vx'] == feel['armed']['vx'],
       (feel['plain'], feel['armed']))
    ok('按住 B 跑 60 幀只在按下那一幀射一發（不是連射）', feel['armed']['shots'] == 1, feel['armed']['shots'])
    ok('沒有副武器時按 B 不會射', feel['plain']['shots'] == 0, feel['plain']['shots'])

    # 護甲礦兵：第二解法
    armor = page.evaluate("""() => {
      GAME.dev.level('2-4');
      GAME.dev.warp(200);
      __nes.step(2);
      GAME.dev.giveSub(1, 15);
      ST.SubWeapon.setInfinite(true);
      const h = GAME.dev.hero();
      const e = ST.Enemies.spawnTest('armor', h.x + 56, h.y, { dir: -1 });
      __nes.step(2);
      const before = { alive: e.alive, subHp: e.subHp, stompable: e.stompable };
      function shoot() {
        const B = NES.Input.BTN;
        NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(40);
      }
      shoot();
      const mid = { alive: e.alive, subHp: e.subHp, dying: !!e.dying };
      shoot();
      const after = { alive: e.alive, subHp: e.subHp, dying: !!e.dying, kills: ST.SubWeapon.kills };
      ST.SubWeapon.setInfinite(false);
      return { before, mid, after, score: window.GAME.state().score };
    }""")
    ok('護甲礦兵出場時 subHp = 2（甲）', armor['before']['subHp'] == 2 and armor['before']['alive'], armor['before'])
    ok('第 1 發火球：打裂但沒倒（subHp 1）', armor['mid']['subHp'] == 1 and not armor['mid']['dying'], armor['mid'])
    ok('第 2 發火球：護甲礦兵倒下（＝研究 04 §2 的第二解法）',
       armor['after']['dying'] or not armor['after']['alive'], armor['after'])
    ok('打倒有算分', armor['score'] > 0, armor['score'])
    shot(page, SHOTS / 'sub_armor.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('護甲礦兵畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    one = page.evaluate("""() => {
      GAME.dev.level('1-1');
      GAME.dev.warp(64);
      __nes.step(2);
      GAME.dev.giveSub(1, 15);
      ST.SubWeapon.setInfinite(true);
      const h = GAME.dev.hero();
      const e = ST.Enemies.spawnTest('roller', h.x + 48, h.y, { dir: -1 });
      __nes.step(2);
      const B = NES.Input.BTN;
      NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(40);
      const r = { dying: !!e.dying, alive: e.alive, kills: ST.SubWeapon.kills };
      // 魔王免疫：直接丟一發到魔王身上（1-4 的鐵鎚王）
      ST.SubWeapon.setInfinite(false);
      return r;
    }""")
    ok('一般敵人（岩球）1 發就倒', one['dying'] or not one['alive'], one)

    boss = page.evaluate("""() => {
      GAME.dev.level('1-4');
      GAME.dev.warp(240 * 8);
      __nes.step(6);
      GAME.dev.giveSub(1, 15);
      ST.SubWeapon.setInfinite(true);
      const hp0 = ST.Boss.hp;
      for (let i = 0; i < 6; i++) { const B = NES.Input.BTN; NES.Input.inject(B.B, 1); __nes.step(1); NES.Input.inject(0, 1); __nes.step(20); }
      const r = { hp0, hp: ST.Boss.hp, dead: !!ST.Boss.dead };
      ST.SubWeapon.setInfinite(false);
      return r;
    }""")
    ok('魔王免疫副武器（血沒掉、沒死）', boss['hp'] == boss['hp0'] and not boss['dead'], boss)

    hid = page.evaluate("""() => {
      GAME.dev.level('1-1');
      __nes.step(2);
      const hidden = GAME.dev.meta().sub.hidden;
      GAME.dev.hero().subOwned = 0; GAME.dev.hero().sub = 0; GAME.dev.hero().subAmmo = 0;
      const picks0 = GAME.dev.meta().sub.picks;
      // 直接呼叫 main 的頂磚流程（等同主角從下面撞那一格）
      const g = GAME.dev.g();
      const col = hidden.col, row = hidden.row;
      GAME.dev.warp(col * 8);
      __nes.step(2);
      ST.SubWeapon.hidden(g, col, row);
      const s = window.GAME.state();
      return { hidden, picks0, picks: GAME.dev.meta().sub.picks, owned: s.subOwned, ammo: s.subAmmo, used: GAME.dev.meta().sub.hidden.used };
    }""")
    ok('每關都算得出一個「指定 ? 磚」（隱藏道具）', hid['hidden'] and hid['hidden']['total'] > 0, hid['hidden'])
    ok('頂到它就拿到副武器（火球 + 15 發、記成已取得）',
       hid['owned'] == 1 and hid['ammo'] == 15 and hid['picks'] == hid['picks0'] + 1 and hid['used'], hid)

    # ---------------------------------------------------------- 2× 圖示（真頁）
    print('[⑥b 2× 互動物件圖示：真頁名稱表 / 撿取 / 頂磚 / lint]')
    fresh(page, '1-1')
    N = page.evaluate("""() => {
      const d = GAME.dev, T = ST.TILE, L = ST.LEVELS['1-1'];
      // 找第一顆金幣與第一個 ? 磚
      let coin = null, qb = null;
      for (let c = 0; c < L.cols && (!coin || !qb); c++) {
        for (let r = 4; r < 30; r++) {
          const t = L.tileAt(c, r);
          if (!coin && t === T.COIN) coin = { c, r };
          if (!qb && t === T.QBLOCK) qb = { c, r };
        }
      }
      d.warp(coin.c * 8 - 48); __nes.step(4);
      const nt = (c, r) => d.ntTileAt(c, r);
      const idx = (n) => ST.bgBank.has(n) ? ST.bgBank.index(n) : -1;
      return {
        coin, qb,
        coinCells: [nt(coin.c, coin.r), nt(coin.c, coin.r - 1), nt(coin.c + 1, coin.r), nt(coin.c + 1, coin.r - 1)],
        want: [idx('I2_COIN_BL'), idx('I2_COIN_TL'), idx('I2_COIN_BR'), idx('I2_COIN_TR')],
        qbCells: [nt(qb.c, qb.r), nt(qb.c, qb.r - 1)],
        qbWant: [idx('I2_QB_B'), idx('I2_QB_T')],
        empty: idx('SP')
      };
    }""")
    eq('真頁：金幣在名稱表上就是 2×2 四塊', N['coinCells'], N['want'])
    eq('真頁：? 磚在名稱表上是 8×16 兩塊', N['qbCells'], N['qbWant'])

    P2 = page.evaluate("""() => {
      const d = GAME.dev, T = ST.TILE, L = ST.LEVELS['1-1'];
      d.level('1-1'); __nes.step(2);
      // 找一顆「真的長成 2×2」的金幣
      let coin = null;
      for (let c = 0; c < L.cols && !coin; c++) for (let r = 4; r < 30; r++) {
        if (L.tileAt(c, r) !== T.COIN) continue;
        if (ST.Icons2x.nameAt(c, r, d.tileAt, L.cols) === 'I2_COIN_BL') { coin = { c, r }; break; }
      }
      // 主角放到「大金幣的右上那一格」——身體完全不碰原本的 8×8 地形格
      d.warp((coin.c + 1) * 8 + 2, (coin.r - 1) * 8);
      const h = d.hero();
      const box = { x: h.x, y: h.y, w: h.w, h: h.h };
      const hitsAnchor = (box.x < coin.c * 8 + 8 && coin.c * 8 < box.x + box.w
                       && box.y < coin.r * 8 + 8 && coin.r * 8 < box.y + box.h);
      const before = window.GAME.state().coins;
      __nes.step(1);                                  // 這一幀由 metaIconTouch 撿起來
      const after = window.GAME.state().coins;
      __nes.step(2);
      const nt = (c, r) => d.ntTileAt(c, r);
      return {
        before, after, hitsAnchor, coin, box,
        tile: d.tileAt(coin.c, coin.r),
        cells: [nt(coin.c, coin.r), nt(coin.c, coin.r - 1), nt(coin.c + 1, coin.r), nt(coin.c + 1, coin.r - 1)],
        sky: nt(coin.c - 1, coin.r - 1)
      };
    }""")
    ok('主角只碰到大金幣的「右上視覺範圍」、沒碰到原本的地形格', not P2['hitsAnchor'], (P2['box'], P2['coin']))
    ok('照樣撿得到（枚數有增加）＝ 碰撞框跟著圖示放大', P2['after'] >= P2['before'] + 1, (P2['before'], P2['after']))
    eq('撿走後地形變空白', P2['tile'], 0)
    ok('撿走後四格一起還原成天空（不留殘影）',
       all(v == P2['sky'] for v in P2['cells']), (P2['cells'], P2['sky']))

    Q2 = page.evaluate("""() => {
      const d = GAME.dev, T = ST.TILE, L = ST.LEVELS['1-1'];
      d.level('1-1'); __nes.step(2);
      let qb = null;
      for (let c = 0; c < L.cols && !qb; c++) for (let r = 4; r < 30; r++) {
        if (L.tileAt(c, r) !== T.QBLOCK) continue;
        if (ST.Icons2x.nameAt(c, r, d.tileAt, L.cols) === 'I2_QB_B') { qb = { c, r }; break; }
      }
      d.warp(qb.c * 8, (qb.r + 3) * 8);
      __nes.step(2);
      const b = window.GAME.state().bumps;
      for (let i = 0; i < 60 && window.GAME.state().bumps === b; i++) __nes.press(['a'], 1);
      __nes.release(); __nes.step(3);
      const nt = (c, r) => d.ntTileAt(c, r);
      const idx = (n) => ST.bgBank.has(n) ? ST.bgBank.index(n) : -1;
      return { tile: d.tileAt(qb.c, qb.r), used: T.USED,
               cells: [nt(qb.c, qb.r), nt(qb.c, qb.r - 1)], want: [idx('I2_US_B'), idx('I2_US_T')],
               bumped: window.GAME.state().bumps > b, qb };
    }""")
    ok('從下面頂得到 ? 磚（上半格是單向平台，不擋頭）', Q2['bumped'], Q2)
    eq('頂完變 USED', Q2['tile'], Q2['used'])
    eq('名稱表上下兩塊一起換成 USED 的 2× 圖', Q2['cells'], Q2['want'])

    page.evaluate("() => { GAME.dev.level('1-1'); GAME.dev.warp(36 * 8); __nes.step(20); }")
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('2× 圖示的磚列 lint 綠（%d 色 ≤ 25）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])
    ok('每線精靈數 ≤ 8（2× 圖示全部走背景層，精靈一個都沒加）',
       lt['oam']['maxLine'] <= 8 and not lt['oam']['overLine'], lt['oam'])
    shot(page, SHOTS / 'icon2x_blocks.png')
    page.evaluate("() => { GAME.dev.level('2-1'); GAME.dev.warp(40 * 8); __nes.step(20); }")
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('W2（礦坑主題）的 2× 圖示 lint 也綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])
    shot(page, SHOTS / 'icon2x_w2.png')

    off = page.evaluate("""() => {
      const d = GAME.dev, T = ST.TILE;
      d.level('1-1'); __nes.step(4);
      const L = ST.LEVELS['1-1'];
      let coin = null;
      for (let c = 0; c < L.cols && !coin; c++) for (let r = 4; r < 30; r++) {
        if (L.tileAt(c, r) !== T.COIN) continue;
        if (ST.Icons2x.nameAt(c, r, d.tileAt, L.cols) === 'I2_COIN_BL') { coin = { c, r }; break; }
      }
      const big = [];
      ['I2_COIN_BL', 'I2_COIN_TL', 'I2_COIN_BR', 'I2_COIN_TR'].forEach(n => big.push(ST.bgBank.index(n)));
      d.icons2x(false); __nes.step(2);
      const offCell = d.ntTileAt(coin.c, coin.r), offUp = d.ntTileAt(coin.c, coin.r - 1);
      const plain = L.chrAt ? L.chrAt(coin.c, coin.r) : -1;
      const sky = d.ntTileAt(coin.c - 1, coin.r - 1);
      d.icons2x(true); __nes.step(2);
      const onCell = d.ntTileAt(coin.c, coin.r), onUp = d.ntTileAt(coin.c, coin.r - 1);
      return { offCell, offUp, onCell, onUp, plain, sky, big, state: d.icons2x() };
    }""")
    ok('dev.icons2x(false)：金幣回到原本的 8×8（上面那格變回天空）',
       off['offCell'] == off['plain'] and off['offUp'] == off['sky'] and off['offCell'] not in off['big'],
       off)
    ok('再打開又變回 2×（錨點 = BL、上面 = TL）',
       off['onCell'] == off['big'][0] and off['onUp'] == off['big'][1], off)
    eq('2× 圖示共 6 種（fix-r4 加上旗子）', len(off['state']['kinds']), 6)

    # ------------------------------------------- fix-r4：真頁 16 關覆蓋率 + giveSub 吃字串
    print('[⑥c fix-r4：16 關旗桿球 / 旗子覆蓋率、dev.giveSub("fire")]')
    C = page.evaluate("""() => {
      const X = ST.Icons2x, T = ST.TILE;
      const ids = Object.keys(ST.LEVELS).filter(k => k.length === 3 && k.charAt(1) === '-').sort();
      let ball = 0, ballN = 0, flag = 0, flagN = 0;
      const miss = [];
      for (const id of ids) {
        const lv = ST.LEVELS[id], tileAt = (c, r) => lv.tileAt(c, r), cols = lv.cols;
        for (let c = 0; c < cols; c++) for (let r = 4; r < 30; r++) {
          const t = tileAt(c, r);
          if (t === T.GOAL_TOP) { ballN++; if (X.nameAt(c, r, tileAt, cols) === 'I2_BALL_BL') ball++; else miss.push('ball ' + id); }
          else if (t === T.FLAG) { flagN++; if (X.nameAt(c, r, tileAt, cols) === 'I2_FLAG_TL') flag++; else miss.push('flag ' + id); }
        }
      }
      return { ids: ids.length, ball, ballN, flag, flagN, miss: miss.slice(0, 5) };
    }""")
    eq('真頁 16 關：旗桿球全部 2×（P2-2 的驗收數字）', [C['ids'], C['ball'], C['ballN']], [16, 16, 16])
    eq('真頁 16 關：旗子全部 2×（P3-6）', [C['flag'], C['flagN']], [16, 16])
    ok('沒有任何一關漏掉', not C['miss'], C['miss'])

    G = page.evaluate("""() => {
      GAME.dev.level('1-1'); __nes.step(2);
      const K = ST.SubWeapon.KIND;
      const a = GAME.dev.giveSub('fire', 5), s1 = window.GAME.state();
      const b = GAME.dev.giveSub('DART', 7), s2 = window.GAME.state();
      const c = GAME.dev.giveSub('rocket', 5);
      const d = GAME.dev.giveSub(K.FIRE, 3);
      return { a, b, c, d, sub1: s1.subSel, sub2: s2.subSel,
               owned: window.GAME.state().subOwned, kindOf: [ST.SubWeapon.kindOf('fire'),
               ST.SubWeapon.kindOf('Dart'), ST.SubWeapon.kindOf(2), ST.SubWeapon.kindOf('nope')] };
    }""")
    ok('dev.giveSub("fire") 吃字串（P2-4，舊版靜默失敗）', G['a'] is True, G)
    ok('dev.giveSub("DART") 不分大小寫', G['b'] is True, G)
    ok('不認得的名字照樣回 false（不會亂給）', G['c'] is False, G)
    ok('數字 kind 照舊可用', G['d'] is True, G)
    eq('SubWeapon.kindOf 正規化表', G['kindOf'], [1, 2, 2, 0])

    # ---------------------------------------------------------- 破關畫面的密碼
    print('[⑦ 通關結算顯示密碼]')
    win = page.evaluate("""() => {
      GAME.dev.level('2-4');
      GAME.dev.setScore(12345);
      GAME.dev.warp(240 * 8);
      __nes.step(4);
      const B = (window.ST && ST.BossW2) ? ST.BossW2 : ST.Boss;
      let n = 0;
      while (!B.dead && n++ < 30) { B.stomp(); __nes.step(70); }
      n = 0; while (window.GAME.state().mode === 'play' && n++ < 900) __nes.step(1);
      // 全破畫面：LEVEL_ORDER 會被 F4-1 / F4-2 接長 ⇒ 用 dev.win() 直接進破關結算（只是測試入口）
      if (window.GAME.state().mode !== 'gameover') GAME.dev.win();
      __nes.step(2);
      const s = window.GAME.state();
      return { mode: s.mode, won: s.won, banner: s.banner, code: s.password, mask: s.clearedMask,
               line: GAME.dev.screenText(21, 5, 21), levels: GAME.dev.levels().length };
    }""")
    ok('打完魔王 → 破關畫面（WORLD n CLEAR）', win['mode'] == 'gameover' and win['won'], (win['mode'], win['won']))
    ok('關卡順序表至少 8 關', win['levels'] >= 8, win['levels'])
    ok('破關畫面多一行 CODE（列 21）', bool(win['banner']) and win['banner'][-1].startswith('CODE '), win['banner'])
    ok('畫面上真的看得到那一行', win['line'].startswith('CODE '), win['line'])
    back = page.evaluate("""(code) => {
      const c = code.replace(/^CODE /, '').replace(/ /g, '');
      return { data: ST.Password.decode(c), c };
    }""", win['banner'][-1] if win['banner'] else '')
    ok('破關畫面的密碼解得開，且含 2-4 的通關位元',
       bool(back['data']) and (back['data']['cleared'] & (1 << 7)), back)
    shot(page, SHOTS / 'win_code.png')
    lt = page.evaluate("() => { __nes.render(); return __nes.lint(); }")
    ok('破關畫面 lint 綠（%d 色）' % lt['colors'], lt['ok'] and lt['colors'] <= 25, lt.get('errors', [])[:2])

    # ---------------------------------------------------------- 回歸
    print('[⑧ 回歸：舊的標題 / 暫停 / 一鍵密技沒被動到]')
    fresh(page)
    old1 = page.evaluate(JS_TAPS, ['START'])
    ok('標題 START 仍然直接開始遊戲（舊契約）', old1['mode'] == 'play' and old1['level'] == '1-1',
       (old1['mode'], old1['level']))
    old2 = page.evaluate(JS_TAPS, ['START'])
    ok('遊戲中 START 仍然是暫停', old2['paused'] is True, old2['paused'])
    old3 = page.evaluate(JS_TAPS, ['SELECT'])
    ok('暫停中 SELECT 仍然是一鍵密技（命 9 / 無敵 1200）',
       old3['lives'] == 9 and old3['inv'] == 1200, (old3['lives'], old3['inv']))
    page.evaluate(JS_TAPS, ['START'])
    page.keyboard.press('KeyC')
    old4 = page.evaluate("() => { __nes.step(2); return window.GAME.state(); }")
    ok('C 鍵一鍵密技仍然有效', old4['cheats'] >= 1 and old4['star'] > 0, (old4['cheats'], old4['star']))


# =====================================================================  主程式
def main():
    if not (ROOT / 'star.html').exists():
        print('找不到 star.html')
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        page = browser.new_page(viewport={'width': 900, 'height': 760})
        page.on('pageerror', lambda e: errors.append('pure: ' + str(e)))
        page.goto('about:blank')
        page.set_content('<canvas id="nes"></canvas>')
        for f in ENGINE:
            p = ROOT / 'engine' / f
            if p.exists() and p.stat().st_size > 8:
                page.add_script_tag(path=str(p))
        for f in GAME:
            page.add_script_tag(path=str(ROOT / 'games' / 'star' / f))
        body_pure(page)
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
    print('star-meta 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad), len(bad)))
    for _, name, detail in bad:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 64)
    print('總結：' + ('PASS' if not bad else 'FAIL'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
