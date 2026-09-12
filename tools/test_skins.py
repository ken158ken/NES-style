# -*- coding: utf-8 -*-
"""
卡比配色驗證（Round 8 / agent: skins）—— src/skins.js 的 KB.SKINS。

涵蓋：
  1. API：all / list / current / set / unlocked / name / unlockCond / spr / drawPreview / refresh
  2. 12 種配色定義完整（p/P/l/c/m/r/R 七色齊全、#rrggbb 格式、主色互不重複）
  3. 解鎖：KB.DEBUG 全開；非 DEBUG 時逐一驗證 12 條條件（成就 / 通關旗標），未解鎖 set() 被拒
  4. 重著色：spr() 只動 kirby_*（帽子 / 夥伴 / 敵人不動）、精靈名帶 @id、像素色真的換掉、尺寸幀數不變
  5. 實戰：遊戲中 player 真的畫出 @id 精靈，畫布取樣顯示卡比身體顏色改變（帽子維持原色）
  6. HUD 卡比臉 ui_kirby_face 同步換色、切回 pink 復原
  7. 存檔：KB.save.settings.skin、重新載入後保留；解鎖被取消時自動退回 pink

用法：python tools/test_skins.py [-v]
"""
import sys, pathlib, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()

results = []
VERBOSE = False

IDS = ['pink', 'yellow', 'blue', 'green', 'red', 'white', 'purple', 'orange', 'black', 'gold', 'mint', 'galaxy']
KEYS = ['p', 'P', 'l', 'c', 'm', 'r', 'R']
BASE_P = '#ffb0d0'          # KB.PAL.kirby 的身體主色


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


# ---------------------------------------------------------------- JS 工具
# 清空進度（成就 / 通關旗標 / 配色設定），並關閉 DEBUG 全解鎖
LOCK = """() => {
  KB.DEBUG = false; if (KB.UI) KB.UI.unlockAll = false;
  if (KB.PROG && KB.PROG.reset) KB.PROG.reset();
  KB.save.cleared = {}; KB.save.settings = KB.save.settings || {}; delete KB.save.settings.skin;
  KB.SKINS.refresh();
  return KB.SKINS.list();
}"""

# 依條件解鎖一種配色（成就用 PROG.unlock，通關用 KB.save.cleared）
UNLOCK_ONE = """(id) => {
  const d = KB.SKINS.def(id);
  if (d.cond.kind === 'ach') KB.PROG.unlock(d.cond.id);
  else if (d.cond.kind === 'clear') KB.save.cleared[d.cond.id] = true;
  return KB.SKINS.unlocked(id);
}"""

# 單張精靈的顏色直方圖（第 0 幀）
HIST = """(name) => {
  const s = KB.SPR[name]; if (!s) return null;
  const f = s.frames[0], cv = KB.makeCanvas(f.w, f.h), c = cv.getContext('2d');
  c.drawImage(f.cv, 0, 0);
  const d = c.getImageData(0, 0, f.w, f.h).data, h = {};
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = '#' + [d[i], d[i+1], d[i+2]].map(v => v.toString(16).padStart(2, '0')).join('');
    h[k] = (h[k] || 0) + 1;
  }
  return { w: f.w, h: f.h, n: s.n, hist: h };
}"""

# 遊戲畫布上，卡比周圍方框內指定顏色的像素數
BOX_COUNT = """(cols) => {
  const p = KB.player, g = KB.game;
  const x = Math.round(p.cx - g.cam.x) - 16, y = Math.round(p.y - g.cam.y) - 10;
  const bx = Math.max(0, x), by = Math.max(0, y), bw = Math.min(32, KB.W - bx), bh = Math.min(32, 192 - by);
  const d = KB.ctx.getImageData(bx, by, bw, bh).data;
  const want = cols.map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);
  const out = cols.map(() => 0);
  for (let i = 0; i < d.length; i += 4)
    for (let j = 0; j < want.length; j++) {
      const w = want[j];
      if (d[i] === w[0] && d[i+1] === w[1] && d[i+2] === w[2]) { out[j]++; break; }
    }
  return out;
}"""

# 攔截一幀之內畫出來的精靈名（只留卡比 / 帽子相關）
# 假存檔（file:// 下沒有 localStorage，改用 init script 注入）
FAKE_SAVE = """
try {
  const data = JSON.stringify({ cleared: {}, achievements: { arena_clear: 1 }, settings: { skin: 'mint' } });
  const mem = { kirbystar_save: data };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }, clear: () => { for (const k in mem) delete mem[k]; },
  } });
} catch (e) { window.__lsfail = String(e); }
"""

FRAME_SPRS = """() => {
  const names = [], orig = KB.drawSpr;
  KB.drawSpr = function (ctx, n) { names.push(n); return orig.apply(this, arguments); };
  try { __kb.step(1); } finally { KB.drawSpr = orig; }
  return names.filter(n => n.indexOf('kirby') === 0 || n.indexOf('hat_') === 0);
}"""


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.v
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.SKINS')
        ev = pg.evaluate

        # -------------------------------------------------------------- 0. API
        print('-' * 8, 'API')
        fns = ev("()=>['all','list','current','set','unlocked','name','unlockCond','spr','drawPreview','refresh',"
                 "'def','map','colors','ids','count','total'].filter(k=>typeof KB.SKINS[k]!=='function')")
        check('KB.SKINS 16 個 API 都在', fns == [], fns)
        ids = ev("()=>KB.SKINS.ids()")
        check('12 種配色，id 與規格一致', ids == IDS, ids)
        check('id 不重複', len(set(ids)) == 12, len(set(ids)))
        names = ev("()=>KB.SKINS.ids().map(i=>KB.SKINS.name(i))")
        check('每種都有中文名稱', all(isinstance(n, str) and n for n in names), names)
        check('名稱不重複', len(set(names)) == 12, names)
        conds = ev("()=>KB.SKINS.ids().map(i=>KB.SKINS.unlockCond(i))")
        check('每種都有解鎖條件文字', all(isinstance(c, str) and c for c in conds), conds)
        bad = ev("()=>KB.SKINS.name('nope')+'|'+KB.SKINS.unlockCond('nope')")
        check('未知 id 的 name / unlockCond 安全回空字串', bad == '|', bad)
        allobj = ev("()=>KB.SKINS.all()")
        check('all() 回 12 筆 {id,name,cond,unlocked}',
              len(allobj) == 12 and all(set(o) == {'id', 'name', 'cond', 'unlocked'} for o in allobj), len(allobj))

        # -------------------------------------------------------------- 1. 定義完整
        print('-' * 8, '配色定義')
        cols = ev("()=>{const o={}; for (const d of KB.SKINS.DEFS) o[d.id]=d.col; return o;}")
        missing = {i: [k for k in KEYS if k not in cols[i]] for i in IDS if i != 'pink'}
        missing = {i: v for i, v in missing.items() if v}
        check('11 種（pink 以外）p/P/l/c/m/r/R 七色齊全', missing == {}, missing)
        check('pink＝預設（不做任何替換）', cols['pink'] == {}, cols['pink'])
        import re
        badhex = {i: {k: v for k, v in cols[i].items() if not re.fullmatch(r'#[0-9a-f]{6}', v)} for i in IDS}
        badhex = {i: v for i, v in badhex.items() if v}
        check('所有色碼皆為 #rrggbb 小寫', badhex == {}, badhex)
        mains = [cols[i].get('p', BASE_P) for i in IDS]
        check('12 種身體主色互不相同', len(set(mains)) == 12, mains)
        mapkeys = ev("()=>{const base=Object.keys(KB.PAL.kirby).map(k=>KB.PAL.kirby[k]);"
                     "const bad={}; for (const id of KB.SKINS.ids()){const m=KB.SKINS.map(id);"
                     "const o=Object.keys(m).filter(k=>base.indexOf(k)<0); if(o.length) bad[id]=o;} return bad;}")
        check('替換表的來源色全部出自 KB.PAL.kirby', mapkeys == {}, mapkeys)
        blackb = ev("()=>[KB.SKINS.def('black').col.b, KB.SKINS.def('galaxy').col.b]")
        check('暗影 / 星河另外把眼睛高光換成白（白眼 / 星點）', blackb == ['#ffffff', '#ffffff'], blackb)

        # -------------------------------------------------------------- 2. DEBUG 全解鎖
        print('-' * 8, '解鎖條件')
        ev("()=>{KB.DEBUG=true; return 1;}")
        dl = ev("()=>KB.SKINS.list()")
        check('KB.DEBUG → 12 種全解鎖', dl == IDS, len(dl))
        du = ev("()=>KB.SKINS.ids().filter(i=>!KB.SKINS.unlocked(i))")
        check('KB.DEBUG → unlocked() 全 true', du == [], du)

        # 非 DEBUG：清空進度
        locked = ev(LOCK)
        check('進度全清 → 只剩 pink', locked == ['pink'], locked)
        check('未解鎖時 current() = pink', ev("()=>KB.SKINS.current()") == 'pink')
        rej = ev("()=>[KB.SKINS.set('gold'), KB.SKINS.set('galaxy'), KB.SKINS.set('nope'), KB.SKINS.current()]")
        check('未解鎖 / 未知 id 的 set() 被拒且不改變 current()', rej == [False, False, False, 'pink'], rej)
        check('被拒時不寫存檔', ev("()=>KB.save.settings.skin===undefined"))

        # 逐一解鎖 11 種
        for sid in IDS[1:]:
            before = ev("(i)=>KB.SKINS.unlocked(i)", sid)
            after = ev(UNLOCK_ONE, sid)
            ok = ev("(i)=>[KB.SKINS.unlocked(i), KB.SKINS.set(i), KB.SKINS.current()]", sid)
            cond = ev("(i)=>KB.SKINS.unlockCond(i)", sid)
            check('解鎖 %-7s ← %s' % (sid, cond),
                  (not before) and after and ok == [True, True, sid], [before, after, ok])
        check('全部條件達成 → list() 12 種', ev("()=>KB.SKINS.list()") == IDS)

        # 條件取消 → 自動退回 pink
        ev("()=>{KB.save.settings.skin='galaxy'; KB.save.cleared={}; if(KB.PROG) KB.PROG.reset(); return 1;}")
        check('解鎖被取消 → current() 自動退回 pink', ev("()=>KB.SKINS.current()") == 'pink')
        check('退回 pink 時 spr() 不轉換', ev("()=>KB.SKINS.spr('kirby_idle')") == 'kirby_idle')
        ev("()=>{KB.DEBUG=true; KB.SKINS.refresh(); return 1;}")

        # -------------------------------------------------------------- 3. 重著色
        print('-' * 8, '重著色 / 精靈名')
        ev("()=>KB.SKINS.set('pink')")
        check('pink 時 spr() 原樣回傳', ev("()=>KB.SKINS.spr('kirby_idle')") == 'kirby_idle')
        ev("()=>KB.SKINS.set('gold')")
        check('set 後 spr() 回配色版名稱', ev("()=>KB.SKINS.spr('kirby_idle')") == 'kirby_idle@gold')
        check('配色版精靈已註冊', ev("()=>!!KB.SPR['kirby_idle@gold']"))
        keep = ev("()=>['hat_fire','helper_idle','enemy_waddledee','ui_kirby_face','item_tomato','proj_star']"
                  ".map(n=>KB.SKINS.spr(n))")
        check('帽子 / 夥伴 / 敵人 / 道具 / UI 不換色',
              keep == ['hat_fire', 'helper_idle', 'enemy_waddledee', 'ui_kirby_face', 'item_tomato', 'proj_star'], keep)
        kn = ev("()=>KB.SPR_ORDER.filter(n=>n.indexOf('kirby_')===0 && n.indexOf('@')<0)")
        check('kirby_ 前綴精靈數量 ≥ 40（全部都能換色）', len(kn) >= 40, len(kn))
        conv = ev("()=>['kirby_idle','kirby_walk','kirby_swim','kirby_attack_fire','kirby_attack_sword','kirby_inhale',"
                  "'kirby_full','kirby_stone','kirby_dragon_idle','kirby_mech_idle','kirby_ghost_idle']"
                  ".filter(n=>KB.SPR[n]).map(n=>[n, KB.SKINS.spr(n)])")
        notconv = [n for n, v in conv if v != n + '@gold']
        check('kirby_attack_* / kirby_swim / 變身專用圖都會轉換（%d 個抽樣）' % len(conv), notconv == [], notconv)
        h0 = ev(HIST, 'kirby_idle')
        h1 = ev(HIST, 'kirby_idle@gold')
        check('配色版尺寸 / 幀數與原圖相同',
              (h0['w'], h0['h'], h0['n']) == (h1['w'], h1['h'], h1['n']), [h0['w'], h0['h'], h0['n'], h1['n']])
        check('原圖有粉紅主色 #ffb0d0', h0['hist'].get(BASE_P, 0) > 20, h0['hist'].get(BASE_P, 0))
        check('配色版粉紅主色全部消失', h1['hist'].get(BASE_P, 0) == 0, h1['hist'].get(BASE_P, 0))
        gp = ev("()=>KB.SKINS.def('gold').col.p")
        check('配色版出現金色主色 %s（像素數與原粉紅相同）' % gp,
              h1['hist'].get(gp, 0) == h0['hist'].get(BASE_P, 0), [h1['hist'].get(gp, 0), h0['hist'].get(BASE_P, 0)])
        check('輪廓色 #202848 不受影響',
              h1['hist'].get('#202848', 0) == h0['hist'].get('#202848', 0),
              [h0['hist'].get('#202848', 0), h1['hist'].get('#202848', 0)])
        # 12 種都能真的產生不同像素
        diff = ev("""() => {
          const out = {};
          for (const id of KB.SKINS.ids()) {
            KB.SKINS.set(id);
            const n = KB.SKINS.spr('kirby_idle'), s = KB.SPR[n], f = s.frames[0];
            const cv = KB.makeCanvas(f.w, f.h), c = cv.getContext('2d'); c.drawImage(f.cv, 0, 0);
            const d = c.getImageData(0, 0, f.w, f.h).data;
            let hash = 0; for (let i = 0; i < d.length; i++) hash = (hash * 31 + d[i]) | 0;
            out[id] = hash;
          }
          return out;
        }""")
        check('12 種 kirby_idle 的像素內容互不相同', len(set(diff.values())) == 12, len(set(diff.values())))
        cache = ev("()=>{const n1=KB.SKINS.spr('kirby_idle'); const a=KB.SPR[n1]; const n2=KB.SKINS.spr('kirby_idle');"
                   "return n1===n2 && a===KB.SPR[n2];}")
        check('懶生成有快取（同名不重複產生）', cache, cache)

        # -------------------------------------------------------------- 4. 遊戲實戰
        print('-' * 8, '遊戲中')
        ev("()=>{KB.SKINS.set('pink'); __kb.goto('game', {level:'w1', room:0, ability:'fire', nofade:true}); __kb.step(20); return 1;}")
        pinkbox = ev(BOX_COUNT, [BASE_P, '#ffd85c'])
        check('pink：畫布上卡比身體是粉紅 #ffb0d0', pinkbox[0] > 20 and pinkbox[1] == 0, pinkbox)
        sprs0 = ev(FRAME_SPRS)
        check('pink：畫出來的精靈名沒有 @', all('@' not in n for n in sprs0), sprs0)
        ev("()=>{KB.SKINS.set('gold'); __kb.step(2); return 1;}")
        goldbox = ev(BOX_COUNT, [BASE_P, '#ffd85c'])
        check('gold：畫布上粉紅消失、換成金色 #ffd85c', goldbox[0] == 0 and goldbox[1] > 20, goldbox)
        sprs1 = ev(FRAME_SPRS)
        check('gold：player 實際畫出 @gold 精靈', any(n.endswith('@gold') for n in sprs1), sprs1)
        check('gold：帽子仍是原本的 hat_*（不換色）',
              any(n.startswith('hat_') for n in sprs1) and all('@' not in n for n in sprs1 if n.startswith('hat_')), sprs1)
        ev("()=>{KB.SKINS.set('galaxy'); __kb.step(2); return 1;}")
        galbox = ev(BOX_COUNT, [BASE_P, '#4c4ea0'])
        check('galaxy：畫布上換成深藍 #4c4ea0', galbox[0] == 0 and galbox[1] > 20, galbox)
        # 走路 / 攻擊 / 蹲下等狀態也換色
        states = ev("""() => {
          const out = {}, seen = {};
          const orig = KB.drawSpr;
          KB.drawSpr = function (ctx, n) { if (n.indexOf('kirby') === 0) seen[n] = 1; return orig.apply(this, arguments); };
          try {
            __kb.press({ right: true }); for (let i = 0; i < 20; i++) __kb.step(1);
            __kb.release(); __kb.press({ attack: true }); for (let i = 0; i < 20; i++) __kb.step(1);
            __kb.release(); __kb.press({ jump: true }); for (let i = 0; i < 20; i++) __kb.step(1);
            __kb.release(); for (let i = 0; i < 20; i++) __kb.step(1);
          } finally { KB.drawSpr = orig; }
          return Object.keys(seen);
        }""")
        plain = [n for n in states if '@' not in n]
        check('走 / 攻擊 / 跳 各狀態的卡比精靈全部走配色版（%d 種）' % len(states), plain == [], plain)
        ev("()=>{__kb.release(); return 1;}")

        # -------------------------------------------------------------- 5. HUD 臉
        print('-' * 8, 'HUD 卡比臉')
        ev("()=>KB.SKINS.set('pink')")
        f0 = ev(HIST, 'ui_kirby_face')
        check('pink：ui_kirby_face 是原本的粉紅臉', f0['hist'].get(BASE_P, 0) > 5, f0['hist'].get(BASE_P, 0))
        ev("()=>KB.SKINS.set('gold')")
        f1 = ev(HIST, 'ui_kirby_face')
        check('set 後 KB.SPR[ui_kirby_face] 直接被換成配色版（ui.js 不用改）',
              f1['hist'].get(BASE_P, 0) == 0 and f1['hist'].get('#ffd85c', 0) == f0['hist'].get(BASE_P, 0),
              [f0['hist'].get(BASE_P, 0), f1['hist'].get('#ffd85c', 0)])
        check('HUD 臉尺寸不變', (f0['w'], f0['h'], f0['n']) == (f1['w'], f1['h'], f1['n']), [f0['w'], f1['w']])
        ev("()=>KB.SKINS.set('pink')")
        f2 = ev(HIST, 'ui_kirby_face')
        check('切回 pink → HUD 臉復原', f2['hist'] == f0['hist'])
        noacc = ev("()=>{KB.SKINS.set('gold'); KB.SKINS.set('blue'); KB.SKINS.set('gold');"
                   "const s=KB.SPR['ui_kirby_face'], f=s.frames[0], cv=KB.makeCanvas(f.w,f.h), c=cv.getContext('2d');"
                   "c.drawImage(f.cv,0,0); const d=c.getImageData(0,0,f.w,f.h).data; let n=0;"
                   "for(let i=0;i<d.length;i+=4) if(d[i+3]&&d[i]===0xff&&d[i+1]===0xd8&&d[i+2]===0x5c) n++; return n;}")
        check('連續切換不會重複套色（gold→blue→gold 仍是正確金色）',
              noacc == f0['hist'].get(BASE_P, 0), [noacc, f0['hist'].get(BASE_P, 0)])

        # -------------------------------------------------------------- 6. 預覽 / 存檔
        print('-' * 8, '預覽 / 存檔')
        prev = ev("""() => {
          const cv = KB.makeCanvas(32, 32), c = cv.getContext('2d');
          const out = {};
          for (const id of ['pink', 'green', 'black']) {
            c.clearRect(0, 0, 32, 32); KB.SKINS.drawPreview(c, 16, 30, id);
            const d = c.getImageData(0, 0, 32, 32).data; let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i + 3]) n++;
            out[id] = n;
          }
          return out;
        }""")
        check('drawPreview 三種配色都畫得出東西', all(v > 100 for v in prev.values()), prev)
        prevlock = ev("()=>{const cv=KB.makeCanvas(32,32),c=cv.getContext('2d');"
                      "KB.SKINS.drawPreview(c,16,30,'nope'); const d=c.getImageData(0,0,32,32).data;"
                      "let n=0; for(let i=0;i<d.length;i+=4) if(d[i+3]) n++; return n;}")
        check('drawPreview 未知 id 退回目前配色（不炸）', prevlock > 100, prevlock)
        saved = ev("()=>{KB.SKINS.set('mint'); return KB.save.settings.skin;}")
        check('set() 寫入 KB.save.settings.skin', saved == 'mint', saved)

        # 重新載入：存檔裡的配色要在開機時自動套用（含 HUD 臉），且不靠 debug
        # （file:// 下 Chromium 不給 localStorage，改用 init script 注入假存檔）
        pg2 = b.new_page(viewport={'width': 256, 'height': 224})
        pg2.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg2.add_init_script(script=FAKE_SAVE)
        pg2.goto(INDEX + '?mute=1')
        pg2.wait_for_function('()=>window.KB && KB.SKINS && KB.save && KB.save.settings')
        pg2.wait_for_timeout(300)
        rl = pg2.evaluate("()=>[KB.DEBUG, KB.save.settings.skin, KB.SKINS.current(), KB.SKINS.unlocked('mint'), KB.SKINS.list()]")
        check('重新載入（無 debug）→ 存檔配色 mint 生效、解鎖由成就決定',
              rl[0] is False and rl[1] == 'mint' and rl[2] == 'mint' and rl[3] is True, rl)
        check('無 debug 時只解鎖達成條件的配色（pink + mint）', sorted(rl[4]) == ['mint', 'pink'], rl[4])
        face = pg2.evaluate("()=>{const s=KB.SPR['ui_kirby_face'],f=s.frames[0],cv=KB.makeCanvas(f.w,f.h),c=cv.getContext('2d');"
                            "c.drawImage(f.cv,0,0);const d=c.getImageData(0,0,f.w,f.h).data;let n=0;"
                            "for(let i=0;i<d.length;i+=4) if(d[i+3]&&d[i]===0x9c&&d[i+1]===0xec&&d[i+2]===0xd8) n++; return n;}")
        check('開機自動套用：HUD 臉已是薄荷綠（ui.js 不用改）', face > 5, face)
        rej2 = pg2.evaluate("()=>[KB.SKINS.set('galaxy'), KB.SKINS.current()]")
        check('無 debug 時未解鎖的 set() 仍被拒', rej2 == [False, 'mint'], rej2)

        # -------------------------------------------------------------- 7. console
        print('-' * 8, '執行期錯誤')
        errs = [l for l in logs if 'missing sprite' not in l]
        check('無 pageerror / console.error', errs == [], errs[:5])

        b.close()

    n = len(results)
    ok = sum(1 for _, c, _ in results if c)
    print('-' * 40)
    print('%d/%d PASS' % (ok, n))
    for name, c, info in results:
        if not c:
            print('  FAIL', name, info)
    sys.exit(0 if ok == n else 1)


if __name__ == '__main__':
    main()
