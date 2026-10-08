# -*- coding: utf-8 -*-
"""
Round 12（K12-4 polish-docs）驗證 —— 說明頁 / atkDir·pickMode 收斂 / 貼身判定開關 / 除錯欄位。

涵蓋：
  A. 說明頁（src/ui.js）
     - 第 1 頁「按住 ↑」的右欄不再寫「可一直上升」，改成說得出 KB.PHYS.flyCeilY 房頂封頂的文案
     - 每一頁、每一列：左欄 ≤ 88px、右欄 ≤ 138px（12px 像素字）、列數 ≤ 11 ⇒ 不截斷不相疊
     - 音樂盒 / 幽靈重播 / 關卡編輯器三頁佔位：系統沒載入時不出現（翻頁不會翻到空白頁），
       UI.HELP_FORCE 或系統載入後變成 6 頁；每頁都畫得出來且無 console error
  B. atkDir / pickMode 收斂到 src/const.js 的 KB.ATK（行為零變化）
     - 六個 abilities*.js 不再各自定義 atkDir
     - KB.ATK.dir / KB.ATK.pick 的規則（next > ↑X > ↓X > 空中 X > X、airUp / airDown / airOk、布林化、退回即時輸入）
     - 代表能力逐招實測：搬家前擷取的 mode 基準表（8 能力 × 6 種方向組合）必須一字不差
  C. 設定頁「貼身判定加倍」（Round 10 的 meleeScale 做成可關）
     - 預設開 ＝ KB.PHYS.meleeScale 2（Round 10 行為）；關 ＝ 1（Round 9 原始尺寸）
     - 實際判定框、投射物、存檔（kirbystar_global.settings.meleeOff）與重載後是否仍生效
  D. 除錯 API：__kb.entities() 每筆帶 w / h / w0 / h0 / meleeScaled（QA R10-P2-05）

用法：python tools/test_polish12.py [-v]
"""
import sys, pathlib, argparse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from enemy_test import HOOK_JS, TEST_LEVEL, INDEX

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'

results = []
VERBOSE = False


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


# ---------------------------------------------------------------------------
# B. pickMode 基準表：**搬家前**在同一支腳本跑出來的 abilityData.mode
#    （6 個 abilities 檔各取 1~2 個代表能力；完整 44 能力版本見 PROGRESS 的驗證段）
#    g = 地面 X、u = ↑X、d = ↓X、a = 空中 X、au = 空中 ↑X、ad = 空中 ↓X
# ---------------------------------------------------------------------------
PICK_BASE = {
    'fire':        {'g': 'breath', 'u': 'pillar', 'd': 'dash', 'a': 'spin', 'au': 'pillar', 'ad': 'dash'},
    'sword':       {'g': 'swing', 'u': 'up', 'd': 'low', 'a': 'spin', 'au': 'up', 'ad': 'low'},
    'blade':       {'g': 'combo', 'u': 'upcut', 'd': 'lowcut', 'a': 'fall', 'au': 'upcut', 'ad': 'lowcut'},
    'mage':        {'g': 'fire', 'u': 'wall', 'd': 'bolt', 'a': 'wind', 'au': 'wall', 'ad': 'bolt'},
    'time':        {'g': 'stop', 'u': 'haste', 'd': 'slow', 'a': 'rewind', 'au': 'haste', 'ad': 'slow'},
    'giant':       {'g': 'stomp', 'u': 'upper', 'd': 'charge', 'a': 'butt', 'au': 'upper', 'ad': 'charge'},
    # ghost 的 airOk：穿牆時 onGround 恆 false，但不算「空中」⇒ 空中 X 仍是 phase 而不是 wail
    'ghost':       {'g': 'phase', 'u': 'invis', 'd': 'plunge', 'a': 'phase', 'au': 'invis', 'ad': 'plunge'},
    'flamesword':  {'g': 'm1', 'u': 'up', 'd': 'dn', 'a': 'air', 'au': 'up', 'ad': 'dn'},
    'hammermech':  {'g': 'm1', 'u': 'up', 'd': 'dn', 'a': 'air', 'au': 'up', 'ad': 'dn'},
}

PICK_JS = r"""() => {
  window.__pm = (key) => {
    const res = {};
    const run = (tag, keys, air) => {
      __kb.release();
      __t.goto({ x: 3, y: 9, ability: key });
      for (let i = 0; i < 150 && (KB.game.freezeT | 0) > 0; i++) __kb.step(1);
      __kb.step(3);
      const p = KB.player;
      if (air) { p.y -= 48; p.vy = -0.5; p.onGround = false; __kb.step(1); }
      const o = { attack: true }; for (const k of keys) o[k] = true;
      __kb.press(o, true);
      __kb.step(2);
      const m = (KB.player.abilityData || {}).mode;
      res[tag] = m === undefined || m === null ? '-' : String(m);
      __kb.release();
    };
    run('g', [], false); run('u', ['up'], false); run('d', ['down'], false);
    run('a', [], true); run('au', ['up'], true); run('ad', ['down'], true);
    return res;
  };
  return true;
}"""

# KB.ATK.pick 的純規則（不進遊戲，直接餵資料）：[說明, d, p, o, 期望]
ATK_CASES = [
    ('↑X 優先於 ↓X / 空中 X / X', {}, {'atkDir': {'up': 1, 'down': 1, 'air': 1}},
     {'up': 'U', 'down': 'D', 'air': 'A', 'ground': 'G'}, 'U'),
    ('↓X 優先於 空中 X / X', {}, {'atkDir': {'down': 1, 'air': 1}},
     {'up': 'U', 'down': 'D', 'air': 'A', 'ground': 'G'}, 'D'),
    ('空中 X 優先於 X', {}, {'atkDir': {'air': 1}},
     {'up': 'U', 'down': 'D', 'air': 'A', 'ground': 'G'}, 'A'),
    ('沒按方向就是 X', {}, {'atkDir': {}}, {'up': 'U', 'down': 'D', 'air': 'A', 'ground': 'G'}, 'G'),
    ('排隊的招（d.next）最優先', {'next': 'Q'}, {'atkDir': {'up': 1}},
     {'up': 'U', 'ground': 'G'}, 'Q'),
    ('該方向沒有專用招時往下一順位退', {}, {'atkDir': {'up': 1, 'air': 1}},
     {'down': 'D', 'air': 'A', 'ground': 'G'}, 'A'),
    ('airUp：空中按 ↑ 有專用變體', {}, {'atkDir': {'up': 1, 'air': 1}},
     {'up': 'U', 'airUp': 'AU', 'ground': 'G'}, 'AU'),
    ('airDown：地面按 ↓ 不吃空中變體', {}, {'atkDir': {'down': 1}},
     {'down': 'D', 'airDown': 'AD', 'ground': 'G'}, 'D'),
]


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.v
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 512, 'height': 448})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.error] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.UI && KB.ATK')
        pg.evaluate(TEST_LEVEL)
        pg.evaluate(HOOK_JS)
        ev = pg.evaluate

        # ================================================== A. 說明頁
        print('-' * 8, 'A 說明頁')
        pages = ev("()=>KB.UI.helpPages().map(d=>d.title)")
        check('三個新系統都載入時 ＝ 6 頁（音樂盒 / 幽靈重播 / 關卡編輯器）',
              pages == ['操作說明', '操作說明', '觸控操作', '音樂盒', '幽靈重播', '關卡編輯器'], pages)
        check('UI.HELP_PAGES 仍可讀（＝目前頁數）',
              ev("()=>KB.UI.HELP_PAGES") == len(pages), ev("()=>KB.UI.HELP_PAGES"))
        gated = ev("()=>{ const m=KB.MUSICBOX, r=KB.REPLAY, e=KB.EDITOR;"
                   " delete KB.MUSICBOX; delete KB.REPLAY; delete KB.EDITOR;"
                   " const t = KB.UI.helpPages().map(d=>d.title);"
                   " KB.MUSICBOX=m; KB.REPLAY=r; KB.EDITOR=e; return t; }")
        check('系統沒載入時那幾頁不出現（翻頁不會翻到空白頁）',
              gated == ['操作說明', '操作說明', '觸控操作'], gated)
        forced = ev("()=>{ const m=KB.MUSICBOX; delete KB.MUSICBOX; KB.UI.HELP_FORCE=true;"
                    " const t = KB.UI.helpPages().map(d=>d.title);"
                    " KB.UI.HELP_FORCE=false; KB.MUSICBOX=m; return t; }")
        check('UI.HELP_FORCE 可強制顯示全部 6 頁（截圖 / 測試用）', len(forced) == 6, forced)

        rows1 = ev("()=>KB.UI.help1().map(r=>[typeof r[0]==='function'?String(r[0]()||''):String(r[0]), String(r[1])])")
        flat1 = ' '.join(x for r in rows1 for x in r)
        check('第 1 頁不再有「可一直上升」（房頂封頂後那句話不成立）', '可一直上升' not in flat1, flat1[:60])
        fly = ev("()=>[KB.PHYS.flyCeilY, (KB.UI.HELP1_FIX||{})['按住 ↑']||'']")
        check('第 1 頁「按住 ↑」改成講得出房頂上限的文案',
              '房頂' in fly[1] and fly[0] == 8, fly)
        check('修正表只換右欄、左欄原樣（鍵名仍跟著按鍵設定 / 觸控變）',
              any(r[0] == '按住 ↑' and r[1] == fly[1] for r in rows1), rows1[:4])
        check('第 1 頁的列數與 KB.input.HELP 相同（只改字、沒有多塞列）',
              len(rows1) == ev("()=>KB.input.HELP.length"), len(rows1))

        # 每頁逐列量寬（12px 像素字；左欄 88 / 右欄 138 是 ui.js drawHelp 的欄寬）
        WID_JS = r"""(page) => {
          const UI = KB.UI, d = UI.helpPages()[page];
          const cell = v => (typeof v === 'function' ? String(v() || '') : String(v));
          let rows = []; try { rows = d.rows() || []; } catch (e) { }
          return { title: d.title, n: rows.length,
            k: rows.map(r => UI.textWidth(cell(r[0]), { size: 12, nomix: true })),
            v: rows.map(r => UI.textWidth(cell(r[1]), { size: 12 })) };
        }"""
        for i in range(6):
            w = ev(WID_JS, i)
            over = [t for t in w['k'] if t > 88] + [t for t in w['v'] if t > 138]
            check('第 %d 頁 [%s]：%d 列 ≤ 11、左欄 ≤ 88px、右欄 ≤ 138px（不截斷）'
                  % (i + 1, w['title'], w['n']),
                  w['n'] <= 11 and not over, (w['n'], max(w['k'] or [0]), max(w['v'] or [0]), over))

        fmt = ev("""()=>[KB.UI.HELP4,KB.UI.HELP5,KB.UI.HELP6].every(p=>Array.isArray(p)&&p.length>0&&
                 p.every(r=>Array.isArray(r)&&r.length===2&&
                   (typeof r[0]==='string'||typeof r[0]==='function')&&typeof r[1]==='string'))""")
        check('HELP4 / 5 / 6 格式同 HELP2（[左欄, 右欄]，左欄可為函式）', fmt is True)
        drew = ev("""()=>{ const n0 = KB.missing.size;
          for (let i = 0; i < 6; i++) { KB.UI.helpPage = i; KB.UI.drawHelp(KB.ctx, { page: i }); }
          KB.UI.helpPage = 0; return KB.missing.size === n0; }""")
        check('六頁都畫得出來（沒有缺圖 / 丟例外）', drew is True)
        wrap = ev("""()=>{ KB.UI.helpPage = 5; __kb.press({right:true}); __kb.step(1);
          KB.UI.helpUpdate(); const a = KB.UI.helpPage; __kb.release(); __kb.step(1);
          __kb.press({left:true}); __kb.step(1); KB.UI.helpUpdate(); const b = KB.UI.helpPage;
          __kb.release(); __kb.step(1); return [a, b]; }""")
        check('翻頁在最後一頁會繞回第 1 頁（頁數變動後仍正確）', wrap == [0, 5], wrap)
        clamp = ev("()=>{ const m=KB.MUSICBOX, r=KB.REPLAY, e=KB.EDITOR;"
                   " delete KB.MUSICBOX; delete KB.REPLAY; delete KB.EDITOR;"
                   " KB.UI.helpPage = 5; KB.UI.helpUpdate(); const p = KB.UI.helpPage;"
                   " KB.MUSICBOX=m; KB.REPLAY=r; KB.EDITOR=e; KB.UI.helpPage = 0; return p; }")
        check('頁數縮水時，停在不存在的頁會自動回第 1 頁', clamp == 0, clamp)

        # -------- fix12（R12-P2-02）：第 5 頁的排行入口鍵要與程式一致
        print('-' * 8, 'A2 說明頁第 5 頁入口鍵（fix12）')
        h5 = ev("()=>KB.UI.HELP5.map(r=>[typeof r[0]==='function'?String(r[0]()||''):String(r[0]), String(r[1])])")
        flat5 = ' '.join(x for r in h5 for x in r)
        check('第 5 頁不再寫「SELECT 選關畫面開排行」（SELECT 在選關是回標題）',
              not any(r[0] == 'SELECT' and '選關' in r[1] for r in h5), h5[1])
        check('第 5 頁有一列把排行入口寫成 X（選關）／C（結算）',
              any(('X' in r[0] and 'C' in r[0] and '排行' in r[1]) for r in h5), h5[1])
        check('第 5 頁仍寫得出「選關」與「結算」兩個入口', '選關' in flat5 and '結算' in flat5, flat5[:80])
        # 真的按下去：選關畫面 X 開排行、SELECT 回標題；結算畫面 C 開排行
        beh = ev("""()=>{
          const out = {};
          KB.setScene(new KB.StageSelectScene(0)); __kb.step(2);
          __kb.press({attack:true}, true); __kb.step(2); __kb.release(); __kb.step(1);
          out.attackOpens = !!(KB.REPLAY.boardOpen && KB.REPLAY.boardOpen(KB.scene));
          if (KB.REPLAY.closeBoard) KB.REPLAY.closeBoard(KB.scene);
          __kb.step(1);
          KB.setScene(new KB.StageSelectScene(0)); __kb.step(2);
          __kb.press({select:true}, true); __kb.step(2); __kb.release(); __kb.step(2);
          out.selectScene = KB.scene && KB.scene.constructor.name;
          return out;
        }""")
        check('選關畫面按 X 真的開排行面板（說明與程式一致）', beh['attackOpens'] is True, beh)
        check('選關畫面按 SELECT 是回標題（不是開排行）', beh['selectScene'] == 'TitleScene', beh)

        # -------- fix12（R12-P3-02）：自製關卡的開場橫幅
        print('-' * 8, 'A3 自製關卡開場橫幅（fix12）')
        bt = ev("""()=>{
          const normal = KB.UI.bannerTitle({level: KB.LEVELS[0]});
          const cu = KB.CUSTOM ? KB.CUSTOM.toLevel(KB.CUSTOM.blank(48, 14, 'green'), 'custom_t') : {custom:true, name:'x'};
          return {normal, custom: KB.UI.bannerTitle({level: cu}), isCustom: !!cu.custom,
                  nolevel: KB.UI.bannerTitle({level: {name:'野關卡'}})};
        }""")
        check('一般關卡第 1 行仍是 WORLD n', bt['normal'] == 'WORLD 1', bt['normal'])
        check('自製關卡第 1 行改印「自製關卡」', bt['custom'] == '自製關卡', bt['custom'])
        check('不在 KB.LEVELS 裡的非自製關仍退回 WORLD 1（行為不變）', bt['nolevel'] == 'WORLD 1', bt['nolevel'])
        px = ev("""()=>{
          // frame 60 ＝ 橫幅滑入完成的停留期（frame 1 時還在畫面外，看不到字）
          const mk = (lv) => { const g = {level: lv, frame: 60, paused: false, clearT: -1, roomIdx: 0, arena: null, room: null};
            KB.ctx.clearRect(0,0,KB.W,KB.H);
            KB.UI.drawLevelBanner(KB.ctx, g); KB.UI.paintLevelBanner(KB.ctx);
            const d = KB.ctx.getImageData(23, 40, 210, 26).data; let h = 0;
            for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0;
            let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
            return {h, ink}; };
          const a = mk(KB.LEVELS[0]);
          const cu = KB.CUSTOM.toLevel(KB.CUSTOM.blank(48, 14, 'green'), 'custom_t');
          const b = mk(cu);
          return {a, b};
        }""")
        check('自製關卡橫幅真的畫出不一樣的畫面（像素雜湊不同、有筆劃）',
              px['a']['h'] != px['b']['h'] and px['b']['ink'] > 200, px)

        # ================================================== B. KB.ATK
        print('-' * 8, 'B atkDir / pickMode 收斂')
        dup = {}
        for f in ['abilities.js', 'abilities_weapons.js', 'abilities_magic.js',
                  'abilities_forms.js', 'abilities_mix.js', 'abilities_mix2.js']:
            s = (SRC / f).read_text(encoding='utf-8')
            dup[f] = s.count('function atkDir') + s.count('const atkDir')
        check('六個 abilities*.js 都不再各自定義 atkDir（收斂到 const.js）',
              all(v == 0 for v in dup.values()), dup)
        check('六個 abilities*.js 的 pickMode 都改走 KB.ATK.pick',
              all((SRC / f).read_text(encoding='utf-8').count('KB.ATK.pick(') == 1 for f in dup),
              {f: (SRC / f).read_text(encoding='utf-8').count('KB.ATK.pick(') for f in dup})
        check('KB.ATK.dir / KB.ATK.pick 存在（const.js，載入順序最前面）',
              ev("()=>typeof KB.ATK.dir==='function' && typeof KB.ATK.pick==='function'"))
        for name, d, p, o, want in ATK_CASES:
            got = ev("([d,p,o])=>String(KB.ATK.pick(d,p,o))", [d, p, o])
            check('KB.ATK.pick 優先序：' + name, got == want, (got, want))
        check('KB.ATK.pick 取用 d.next 後會清掉（不會連放兩次）',
              ev("()=>{const d={next:'Q'}; KB.ATK.pick(d,{atkDir:{}},{ground:'G'}); return d.next===null;}"))
        check('KB.ATK.dir 把 atkDir 的值布林化',
              ev("()=>{const a=KB.ATK.dir({atkDir:{up:1,down:0,air:'x'}}); return a.up===true&&a.down===false&&a.air===true;}"))
        check('KB.ATK.dir 沒有 atkDir（例如 startStone 路徑）時退回即時輸入 + onGround',
              ev("""()=>{ __kb.press({up:true}); __kb.step(1);
                const a = KB.ATK.dir({ onGround: true }), b = KB.ATK.dir({ onGround: false });
                __kb.release(); __kb.step(1);
                return a.up === true && a.air === false && b.air === true; }"""))
        check('KB.ATK.dir 對 atkDir 不是物件時也退回即時輸入（不會丟例外）',
              ev("()=>{const a=KB.ATK.dir({atkDir:true,onGround:true}); return a&&a.air===false;}"))

        ev(PICK_JS)
        for key, want in PICK_BASE.items():
            got = ev("(k)=>__pm(k)", key)
            check('[%s] 六種方向組合的招式與收斂前完全相同' % key, got == want, (got, want))

        # ================================================== C. 貼身判定加倍開關
        print('-' * 8, 'C 設定頁「貼身判定加倍」')
        base = ev("()=>[KB.PHYS.meleeScale0, KB.PHYS.meleeScale, KB.meleeScale()]")
        check('預設（沒設定過）＝ 開：meleeScale0 2、meleeScale 2', base == [2, 2, 2], base)
        off = ev("()=>{KB.save.settings.meleeOff=1; return [KB.meleeScale(), KB.PHYS.meleeScale];}")
        check('關掉 ⇒ KB.meleeScale() 1 且 KB.PHYS.meleeScale 同步成 1', off == [1, 1], off)
        on = ev("()=>{KB.save.settings.meleeOff=0; return [KB.meleeScale(), KB.PHYS.meleeScale];}")
        check('再打開 ⇒ 回到 2（基準值 meleeScale0 沒被改掉）', on == [2, 2], on)

        SWORD_JS = r"""(off) => {
          KB.save.settings.meleeOff = off; KB.meleeScale();
          __kb.release(); __t.goto({ x: 3, y: 9, ability: 'sword' });
          __kb.step(3); __kb.press({ attack: true }, true); __kb.step(2);
          const hb = __kb.entities().filter(e => e.type === 'hitbox' && e.owner === 'player');
          __kb.release(); __kb.step(1);
          return hb.map(e => [e.w, e.h, e.w0, e.h0, e.meleeScaled]);
        }"""
        hb_on = ev(SWORD_JS, 0)
        check('開：劍 X 的貼身框 ＝ 原尺寸 ×2 且 meleeScaled 2（Round 10 行為）',
              bool(hb_on) and all(e[0] == e[2] * 2 and e[1] == e[3] * 2 and e[4] == 2 for e in hb_on), hb_on)
        hb_off = ev(SWORD_JS, 1)
        check('關：同一招回到 Round 9 原尺寸且 meleeScaled 0',
              bool(hb_off) and all(e[0] == e[2] and e[1] == e[3] and e[4] == 0 for e in hb_off), hb_off)
        check('關掉前後的「原尺寸」w0 / h0 一致（只有倍率變）',
              [e[2:4] for e in hb_on] == [e[2:4] for e in hb_off], ([e[2:4] for e in hb_on], [e[2:4] for e in hb_off]))

        PROJ_JS = r"""(off) => {
          KB.save.settings.meleeOff = off; KB.meleeScale();
          __kb.release(); __t.goto({ x: 3, y: 9, ability: 'cutter' });
          __kb.step(3); __kb.press({ attack: true }, true); __kb.step(6);
          const pr = __kb.entities().filter(e => e.type === 'proj');
          __kb.release(); __kb.step(1);
          return pr.map(e => [e.w, e.h, e.meleeScaled]).sort();
        }"""
        p_on, p_off = ev(PROJ_JS, 0), ev(PROJ_JS, 1)
        check('遠程投射物不受開關影響（開 / 關尺寸完全一樣）', p_on == p_off and bool(p_on), (p_on, p_off))

        items = ev("""()=>{ const m = new KB.SettingsMenu();
          return m.items.map(i => i.id); }""")
        check('設定頁有「貼身判定加倍」這一項', 'meleeOff' in items, items)
        menu = ev("""()=>{ KB.save.settings.meleeOff = 0;
          const m = new KB.SettingsMenu(), i = m.items.findIndex(x => x.id === 'meleeOff');
          const it = m.items[i];
          const nameOf = () => { let j = it.cycle.indexOf(KB.UI.settings()[it.id] | 0); if (j < 0) j = 0; return it.names[j]; };
          const a = nameOf();
          m.sel = i; __kb.press({ right: true }); __kb.step(1); m.update(); __kb.release(); __kb.step(1);
          const b = nameOf(), v = KB.save.settings.meleeOff, s = KB.PHYS.meleeScale;
          m.sel = i; __kb.press({ right: true }); __kb.step(1); m.update(); __kb.release(); __kb.step(1);
          return { a, b, v, s, c: nameOf(), label: it.label, s2: KB.PHYS.meleeScale }; }""")
        check('預設顯示「開」、按 → 變「關」、再按 → 回「開」',
              [menu['a'], menu['b'], menu['c']] == ['開', '關', '開'], menu)
        check('切成「關」當下就寫進設定並套用（meleeScale 1 → 再切回 2）',
              menu['v'] == 1 and menu['s'] == 1 and menu['s2'] == 2, menu)
        check('設定項的標籤是「貼身判定加倍」', menu['label'] == '貼身判定加倍', menu['label'])

        ev("()=>{ KB.save.settings.meleeOff = 1; KB.saveGame(); }")
        stored = ev("""()=>{ try { return (JSON.parse(localStorage.getItem('kirbystar_global')||'{}').settings||{}).meleeOff; }
                     catch (e) { return 'ERR'; } }""")
        check('存進 localStorage kirbystar_global.settings.meleeOff', stored == 1, stored)
        pg.reload()
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.UI')
        pg.evaluate(TEST_LEVEL)
        pg.evaluate(HOOK_JS)
        after = ev("()=>[KB.save.settings.meleeOff, KB.PHYS.meleeScale, KB.meleeScale()]")
        check('重新載入後設定還在，而且開機就套用（不用先開設定頁）', after == [1, 1, 1], after)
        ev("()=>{ KB.save.settings.meleeOff = 0; KB.meleeScale(); KB.saveGame(); }")

        # ================================================== D. 除錯 API
        print('-' * 8, 'D __kb.entities()')
        ents = ev("""()=>{ __kb.release(); __t.goto({x:3,y:9,ability:'sword'});
          __kb.step(3); __kb.press({attack:true}, true); __kb.step(2);
          const e = __kb.entities(); __kb.release(); __kb.step(1); return e; }""")
        keys = set(ents[0].keys()) if ents else set()
        check('__kb.entities() 每筆都有 w / h / w0 / h0 / meleeScaled',
              {'w', 'h', 'w0', 'h0', 'meleeScaled'} <= keys, sorted(keys))
        hb = [e for e in ents if e['type'] == 'hitbox' and e.get('owner') == 'player']
        check('__kb.entities() 的貼身框：w == w0 × meleeScaled', bool(hb) and
              all(e['w'] == e['w0'] * (e['meleeScaled'] or 1) for e in hb), hb[:2])
        check('__kb.entities() 非判定框（敵人 / 玩家）w0 退回 w、meleeScaled 0',
              all(e['w0'] == e['w'] and e['meleeScaled'] == 0 for e in ents if e['type'] == 'enemy'),
              [e for e in ents if e['type'] == 'enemy'][:2])
        others = ev("""()=>{ __kb.release(); __t.goto({x:3,y:9,ability:'sword'});
          __kb.step(3); __kb.press({attack:true}, true); __kb.step(2);
          const o = __t.others(); __kb.release(); __kb.step(1); return o; }""")
        check('enemy_test HOOK_JS 的 __t.others() 也有 w0 / h0 / meleeScaled',
              bool(others) and {'w0', 'h0', 'meleeScaled'} <= set(others[0].keys()),
              sorted(others[0].keys()) if others else [])
        spawned = ev("()=>__spawned.slice(-1)")
        check('enemy_test HOOK_JS 的 __spawned 也有 w0 / h0 / meleeScaled',
              bool(spawned) and {'w0', 'h0', 'meleeScaled'} <= set(spawned[0].keys()),
              sorted(spawned[0].keys()) if spawned else [])

        errs = [l for l in logs if 'pageerror' in l or 'console.error' in l]
        check('全程無 console error / pageerror', not errs, errs[:3])
        b.close()

    print('---')
    fails = [r for r in results if not r[1]]
    print('%d/%d passed' % (len(results) - len(fails), len(results)))
    if fails:
        print('FAILED:')
        for f in fails:
            print('  ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    sys.exit(1 if fails else 0)


main()
