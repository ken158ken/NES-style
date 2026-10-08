# -*- coding: utf-8 -*-
"""
音樂盒 / 成就獎勵 / PWA 選單項 驗證（Round 12 / agent: K12-1 music-box）
—— src/musicbox.js、src/rewards.js、src/pwa.js，以及 menu.js / saves.js / progression.js 的掛接點。

涵蓋：
  A. 曲目表（40 首 ↔ KB.audio.SONGS 一對一、分類齊全）
  B. 解鎖：遊戲中播過即解鎖、存檔往返（localStorage 槽 / reload / 換槽）
  C. 音樂盒介面：分類切換、上下首、播放 / 停止、未解鎖擋下、返回還原音樂、各分類可繪製
  D. 入口：標題選單「音樂盒」、暫停選單第 3 列「音樂盒」
  E. 獎勵：40 筆 1 對 1、種類配額、取得 / 套用 / 取消、標題背景 / 標題曲 / 選關曲 / 配色真的改變
  F. 成就頁：獎勵欄繪製、←→ 翻頁、B 套用、Z 返回
  G. PWA：uiCan / uiValue / uiDo 與設定頁兩個項目的出現條件

用法：python tools/test_musicbox.py [-v] [--shots]
"""
import sys, base64, pathlib, argparse

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOT_DIR = ROOT / 'shots' / 'agent_musicbox'

results = []
VERBOSE = False


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


def take(pg, path, scale=3):
    path.parent.mkdir(parents=True, exist_ok=True)
    pg.evaluate("()=>__kb.render()")
    data = pg.evaluate("""(s)=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;
        const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('  shot ->', path)


# 乾淨起點：鎖定狀態（unlockAll=false）、空存檔槽
RESET = """() => {
  KB.UI.unlockAll = false;
  KB.save.musicHeard = {}; KB.save.rewards = {}; KB.save.achievements = {};
  KB.REWARDS.state();
  try { KB.SKINS.set('pink'); } catch (e) {}
  KB.audio.music(null);
  return true;
}"""


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    ap.add_argument('--shots', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.v
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.MUSICBOX && KB.REWARDS && KB.SAVES')
        ev = pg.evaluate

        # ============================================================ A. 曲目表
        print('-' * 8, 'A 曲目表')
        api = ev("()=>['TRACKS','CATS','menu','unlocked','heard','markHeard','count','total','drawVis'].filter(k=>KB.MUSICBOX[k]===undefined)")
        check('KB.MUSICBOX API 齊全（TRACKS / menu / unlocked / markHeard / drawVis …）', api == [], api)
        tr = ev("()=>({n: KB.MUSICBOX.TRACKS.length, keys: KB.MUSICBOX.TRACKS.map(t=>t.key), cats: KB.MUSICBOX.CATS})")
        check('曲目共 40 首', tr['n'] == 40, tr['n'])
        check('曲目 key 不重複', len(set(tr['keys'])) == 40, len(set(tr['keys'])))
        miss = ev("()=>KB.MUSICBOX.TRACKS.filter(t=>!KB.audio.SONGS[t.key]).map(t=>t.key)")
        check('每首曲目都在 KB.audio.SONGS 裡', miss == [], miss)
        extra = ev("()=>Object.keys(KB.audio.SONGS).filter(k=>!KB.MUSICBOX.defOf(k))")
        check('KB.audio.SONGS 沒有漏列的曲子（一對一）', extra == [], extra)
        check('分類 6 類（系統 / 世界 / 魔王 / 挑戰 / 覺醒 / 結局）', tr['cats'] == ['系統', '世界', '魔王', '挑戰', '覺醒', '結局'], tr['cats'])
        badcat = ev("()=>KB.MUSICBOX.TRACKS.filter(t=>KB.MUSICBOX.CATS.indexOf(t.cat)<0).map(t=>t.key)")
        check('每首曲目的分類都合法', badcat == [], badcat)
        cnt = ev("()=>KB.MUSICBOX.CATS.map(c=>KB.MUSICBOX.listOf(c).length)")
        check('各分類數量 6/15/9/5/3/2 合計 40', cnt == [6, 15, 9, 5, 3, 2] and sum(cnt) == 40, cnt)
        names = ev("()=>KB.MUSICBOX.TRACKS.filter(t=>!t.name || t.name.length>6).map(t=>t.key)")
        check('每首都有 ≤6 字的中文曲名', names == [], names)

        # ============================================================ B. 解鎖 / 存檔
        print('-' * 8, 'B 解鎖與存檔')
        ev(RESET)
        check('鎖定狀態下解鎖數 = 0', ev("()=>KB.MUSICBOX.count()") == 0)
        heard = ev("""()=>{ KB.audio.music('green'); const a = KB.MUSICBOX.heard('green');
            KB.audio.music(null); const b = Object.keys(KB.save.musicHeard).length;
            return [a, b, KB.MUSICBOX.count()]; }""")
        check('遊戲中播過 green → 解鎖（music(null) 不會多記）', heard == [True, 1, 1], heard)
        check('未知 key 的 markHeard 回 false', ev("()=>KB.MUSICBOX.markHeard('zzz')") is False)
        check('markHeard 同一首第二次回 false（不重複寫）', ev("()=>KB.MUSICBOX.markHeard('green')") is False)
        check('沒解鎖的曲子 unlocked() 為 false', ev("()=>KB.MUSICBOX.unlocked('nightmare')") is False)
        check('?debug 的 unlockAll 打開時全部可播', ev("()=>{KB.UI.unlockAll=true; const n=KB.MUSICBOX.count(); KB.UI.unlockAll=false; return n;}") == 40)
        rt = ev("""()=>{ KB.audio.music('boss'); KB.audio.music('tower'); KB.saveGame();
            const raw = JSON.parse(localStorage.getItem('kirbystar_save_' + KB.SAVES.current()) || '{}');
            return Object.keys(raw.musicHeard || {}).sort(); }""")
        check('存檔槽 JSON 真的寫進 musicHeard（green / boss / tower）', rt == ['boss', 'green', 'tower'], rt)
        pg.reload()
        pg.wait_for_function('()=>window.__kb && KB.MUSICBOX')
        back = ev("()=>[Object.keys(KB.save.musicHeard).sort(), KB.MUSICBOX.heard('boss')]")
        check('reload 後存檔往返：musicHeard 仍在', back[0] == ['boss', 'green', 'tower'] and back[1] is True, back)
        slot = ev("""()=>{ const cur = KB.SAVES.current(); KB.SAVES.load(cur === 1 ? 2 : 1);
            const n2 = Object.keys(KB.save.musicHeard || {}).length; KB.SAVES.load(cur);
            return [n2, Object.keys(KB.save.musicHeard).length]; }""")
        check('音樂盒進度跟著存檔槽走（換槽歸零、換回來還在）', slot[0] == 0 and slot[1] == 3, slot)
        check('空白存檔有 musicHeard / rewards 欄位',
              ev("()=>{const b=KB.SAVES.blank?KB.SAVES.blank():null; return b?(!!b.musicHeard && !!b.rewards):true;}") is not False)

        # ============================================================ C. 音樂盒介面
        print('-' * 8, 'C 音樂盒介面')
        ev(RESET)
        ev("()=>{KB.UI.unlockAll=true;}")
        TAPJS = """(k)=>{ KB.input.setVirtual({[k]:true}, true); KB.input.update();
            const r = window.__box.update(); KB.input.clearVirtual(); KB.input.update(); return r; }"""
        ev("()=>{ window.__box = KB.MUSICBOX.menu({restore:null}); }")
        check('menu() 預設在「系統」分類、6 首', ev("()=>[window.__box.cat, window.__box.list.length]") == [0, 6])
        r = ev(TAPJS, 'right')
        check('← → 切換分類（→ 到「世界」且游標歸 0）', ev("()=>[window.__box.cat, window.__box.sel, window.__box.list.length]") == [1, 0, 15], r)
        ev(TAPJS, 'left')
        check('← 切回「系統」', ev("()=>window.__box.cat") == 0)
        ev(TAPJS, 'down')
        check('↓ 游標下移', ev("()=>window.__box.sel") == 1)
        ev(TAPJS, 'up')
        ev(TAPJS, 'up')
        check('↑ 在清單頭往上會循環到最後一首', ev("()=>window.__box.sel") == 5)
        ev("()=>{window.__box.sel = 0;}")
        ev(TAPJS, 'jump')
        play1 = ev("()=>[window.__box.play, KB.audio.musicKey, window.__box.playingKey()]")
        check('A（Z）播放游標上的曲子', play1[0] == 'title' and play1[2] == 'title', play1)
        ev(TAPJS, 'down')
        check('播放中按 ↓ ＝ 下一首（直接切過去）', ev("()=>[window.__box.sel, window.__box.play]") == [1, 'select'])
        ev(TAPJS, 'jump')
        check('對著正在播的那首再按 A ＝ 停止', ev("()=>window.__box.play") is None)
        ev(TAPJS, 'jump')
        ev(TAPJS, 'attack')
        check('B（X）停止', ev("()=>window.__box.play") is None)
        lock = ev("""()=>{ KB.UI.unlockAll = false; KB.save.musicHeard = {};
            window.__box.cat = 2; window.__box.sel = 0;
            KB.input.setVirtual({jump:true}, true); KB.input.update(); window.__box.update();
            KB.input.clearVirtual(); KB.input.update();
            const r = window.__box.play; KB.UI.unlockAll = true; return r; }""")
        check('未解鎖的曲子按 A 不會播', lock is None, lock)
        backr = ev("""()=>{ window.__box = KB.MUSICBOX.menu({restore:'title'});
            window.__box.play = 'boss'; KB.audio.music('boss');
            KB.input.setVirtual({select:true}, true); KB.input.update();
            const r = window.__box.update(); KB.input.clearVirtual(); KB.input.update();
            return [r, window.__box.play, KB.audio.musicKey]; }""")
        check('SELECT 返回並還原標題曲', backr[0] == 'back' and backr[1] is None and backr[2] == 'title', backr)
        startr = ev("""()=>{ window.__box = KB.MUSICBOX.menu({restore:null});
            KB.input.setVirtual({start:true}, true); KB.input.update();
            const r = window.__box.update(); KB.input.clearVirtual(); KB.input.update(); return r; }""")
        check('START 也可以返回', startr == 'back', startr)
        drawn = ev("""()=>{ const b = KB.MUSICBOX.menu({restore:null}); const errs = [];
            for (let c = 0; c < KB.MUSICBOX.CATS.length; c++) {
              b.cat = c; b.sel = 0;
              for (const p of [null, b.list[0].key]) { b.play = p; try { b.draw(KB.ctx); } catch (e) { errs.push(KB.MUSICBOX.CATS[c] + ':' + e.message); } }
            }
            return errs; }""")
        check('6 個分類 × (停止 / 播放中) 都畫得出來', drawn == [], drawn)
        vis = ev("""()=>{ const c = KB.MUSICBOX.compiled('green');
            return c ? [c.bars, c.len, c.hi > c.lo, Object.keys(c.pitch).sort()] : null; }""")
        check('可視化資料：compileSong 的音高軌（p1/p2/bass）與小節數',
              vis and vis[1] == vis[0] * 16 and vis[2] and vis[3] == ['bass', 'p1', 'p2'], vis)
        check('可視化對沒有曲子的 key 也不會拋錯',
              ev("()=>{ try { KB.MUSICBOX.drawVis(KB.ctx, 14, 134, 228, 40, null, null, 0); return true; } catch (e) { return String(e); } }") is True)

        # ============================================================ D. 入口
        print('-' * 8, 'D 選單入口')
        ttl = ev("""()=>{ __kb.goto('title'); KB.scene.fade=0; const m = new KB.TitleMenu();
            const i = m.items.findIndex(x=>x.id==='musicbox');
            m.sel = i; KB.scene.menu = m;
            KB.input.setVirtual({jump:true}, true); KB.input.update(); m.update(KB.scene);
            KB.input.clearVirtual(); KB.input.update();
            const sub = m.sub; try { m.draw(KB.ctx, KB.scene); } catch (e) { return ['draw', e.message]; }
            return [i, !!sub, sub && sub.constructor.name]; }""")
        check('標題選單有「音樂盒」項', ttl[0] >= 0, ttl)
        check('標題選單按下去會開音樂盒（且畫得出來）', ttl[1] and ttl[2] == 'MusicBox', ttl)
        pz = ev("""()=>{ __kb.goto('game', {level:'w1', room:0, nofade:true}); __kb.step(10);
            const g = KB.game; g.paused = true; const pm = g.pauseMenu = new KB.PauseMenu(g);
            const items = pm.items; const it = items.find(x=>x.id==='musicbox');
            return [items.length, it ? it.r : -1, it ? it.y : -1, items.rowLens]; }""")
        check('暫停選單多了第 3 列「音樂盒」（y=172）', pz[1] == 2 and pz[2] == 172, pz)
        check('暫停選單共 8 項（4 + 3 + 1）', pz[0] == 8 and pz[3] == [4, 3, 1], pz)
        nav = ev("""()=>{ const g = KB.game, pm = g.pauseMenu;
            const tap = k => { KB.input.setVirtual({[k]:true}, true); KB.input.update(); pm.update(g);
                               KB.input.clearVirtual(); KB.input.update(); };
            pm.sel = 0; tap('down'); const a = pm.items[pm.sel].r;
            tap('down'); const b = pm.items[pm.sel].id;
            tap('jump'); const c = pm.page;
            try { pm.draw(KB.ctx, g); } catch (e) { return ['draw', e.message]; }
            return [a, b, c, !!pm.box]; }""")
        check('暫停選單 ↓↓ 會走到第 3 列的「音樂盒」', nav[0] == 1 and nav[1] == 'musicbox', nav)
        check('選它會進 page=musicbox 並建立介面（畫得出來）', nav[2] == 'musicbox' and nav[3] is True, nav)
        ret = ev("""()=>{ const g = KB.game, pm = g.pauseMenu;
            g.musicKey = 'green';
            KB.input.setVirtual({select:true}, true); KB.input.update(); pm.update(g);
            KB.input.clearVirtual(); KB.input.update();
            return [pm.page, !!pm.box, KB.audio.musicKey]; }""")
        check('暫停音樂盒返回 → 回主選單並還原關卡音樂', ret == ['main', False, 'green'], ret)

        # ============================================================ E. 獎勵
        print('-' * 8, 'E 成就獎勵')
        ev(RESET)
        rd = ev("""()=>{ const D = KB.REWARDS.DEFS, ids = KB.PROG.ACH.map(a=>a.id);
            const kinds = {}; D.forEach(d=>kinds[d.kind] = (kinds[d.kind]|0) + 1);
            return { n: D.length, achs: D.map(d=>d.ach), kinds,
                     missing: ids.filter(i=>!KB.REWARDS.byAch(i)),
                     unknown: D.filter(d=>ids.indexOf(d.ach)<0).map(d=>d.ach) }; }""")
        check('獎勵共 40 筆', rd['n'] == 40, rd['n'])
        check('40 個成就每一個都有對應獎勵', rd['missing'] == [], rd['missing'])
        check('沒有對應到不存在成就的獎勵', rd['unknown'] == [], rd['unknown'])
        check('一個成就只綁一個獎勵（ach 不重複）', len(set(rd['achs'])) == 40, len(set(rd['achs'])))
        check('種類配額 背景8 / 標題曲6 / 選關曲3 / 配色8 / 裝飾10 / 夥伴5',
              rd['kinds'] == {'bg': 8, 'song': 6, 'mapsong': 3, 'skin': 8, 'deco': 10, 'pet': 5}, rd['kinds'])
        bad = ev("""()=>{ const out = [];
            for (const d of KB.REWARDS.DEFS) {
              if (d.kind === 'bg' && !KB.REWARDS.BGS[d.id]) out.push('bg:' + d.id);
              if (d.kind === 'deco' && !KB.REWARDS.DECOS[d.id]) out.push('deco:' + d.id);
              if (d.kind === 'pet' && !KB.REWARDS.PETS[d.id]) out.push('pet:' + d.id);
              if ((d.kind === 'song' || d.kind === 'mapsong') && !KB.audio.SONGS[d.id]) out.push('song:' + d.id);
              if (d.kind === 'skin' && !KB.SKINS.all().some(s=>s.id===d.id)) out.push('skin:' + d.id);
            } return out; }""")
        check('每個獎勵的 id 都有實作（背景 / 裝飾 / 夥伴 / 曲子 / 配色）', bad == [], bad)
        # KB.SKINS.unlocked() 在 ?debug=1 時恆為 true ⇒ 改比對解鎖條件文字（'成就「<名稱>」：<條件>'）
        skinok = ev("""()=>KB.REWARDS.DEFS.filter(d=>d.kind==='skin').map(d=>{
            const a = KB.PROG.achDef(d.ach), c = KB.SKINS.unlockCond(d.id);
            return (a && c.indexOf('成就「' + a.name + '」') === 0) ? null : (d.id + '←' + c); }).filter(Boolean)""")
        check('8 個配色獎勵的解鎖條件＝該成就（與 KB.SKINS 本來的條件一致）', skinok == [], skinok)
        own = ev("""()=>{ KB.save.achievements = {}; const a = KB.REWARDS.owned('basic8');
            KB.PROG.unlock('basic8'); const b = KB.REWARDS.owned('basic8');
            return [a, b, KB.REWARDS.newFlag]; }""")
        check('未解鎖成就 → 獎勵未取得；解鎖後 → 已領（並標記有新獎勵）', own == [False, True, True], own)
        eq = ev("""()=>{ const d = KB.REWARDS.byAch('basic8');
            const r1 = KB.REWARDS.equip(d), on1 = KB.REWARDS.isOn(d), s1 = KB.save.rewards.bg;
            const r2 = KB.REWARDS.equip(d), on2 = KB.REWARDS.isOn(d), s2 = KB.save.rewards.bg;
            return [r1, on1, s1, r2, on2, s2]; }""")
        check('套用 / 取消獎勵（寫進 KB.save.rewards.bg）',
              eq == ['on', True, 'sunset', 'off', False, ''], eq)
        noown = ev("""()=>{ const d = KB.REWARDS.byAch('clear_w7');
            return [KB.REWARDS.owned(d), KB.REWARDS.equip(d), KB.REWARDS.isOn(d)]; }""")
        check('未取得的獎勵套用不了', noown == [False, False, False], noown)
        px = ev("""()=>{ const grab = () => { KB.ctx.clearRect(0,0,256,224); KB.BG.title(KB.ctx, 0, 0, 0.5);
              const d = KB.ctx.getImageData(4, 4, 1, 1).data; return [d[0], d[1], d[2]]; };
            KB.save.rewards.bg = ''; const a = grab();
            KB.save.rewards.bg = 'night'; const b = grab();
            KB.save.rewards.bg = 'candy'; const c = grab();
            KB.save.rewards.bg = ''; return [a, b, c]; }""")
        check('套用背景皮膚後標題背景真的改變（night / candy 各不相同）',
              px[0] != px[1] and px[1] != px[2] and px[0] != px[2], px)
        decop = ev("""()=>{ const grab = () => { KB.ctx.clearRect(0,0,256,224); KB.BG.title(KB.ctx, 0, 0, 1.0);
              const d = KB.ctx.getImageData(0, 0, 256, 190).data; let s = 0; for (let i=0;i<d.length;i+=4) s += d[i]+d[i+1]+d[i+2]; return s; };
            KB.save.rewards.deco = ''; KB.save.rewards.pet = ''; const a = grab();
            KB.save.rewards.deco = 'snow'; const b = grab();
            KB.save.rewards.deco = ''; KB.save.rewards.pet = 'star'; const c = grab();
            KB.save.rewards.pet = ''; return [a, b, c]; }""")
        check('裝飾（雪花）與小夥伴（小星星）都會畫到標題畫面上', decop[1] != decop[0] and decop[2] != decop[0], decop)
        allbg = ev("""()=>{ const errs = [];
            for (const k of Object.keys(KB.REWARDS.BGS)) { KB.save.rewards.bg = k;
              try { KB.BG.title(KB.ctx, 0, 0, 1.2); } catch (e) { errs.push('bg:' + k + ' ' + e.message); } }
            for (const k of Object.keys(KB.REWARDS.DECOS)) { KB.save.rewards.bg = ''; KB.save.rewards.deco = k;
              try { KB.BG.title(KB.ctx, 0, 0, 1.2); } catch (e) { errs.push('deco:' + k + ' ' + e.message); } }
            for (const k of Object.keys(KB.REWARDS.PETS)) { KB.save.rewards.deco = ''; KB.save.rewards.pet = k;
              try { KB.BG.title(KB.ctx, 0, 0, 1.2); } catch (e) { errs.push('pet:' + k + ' ' + e.message); } }
            KB.save.rewards.pet = ''; return errs; }""")
        check('8 背景 + 10 裝飾 + 5 夥伴全部畫得出來', allbg == [], allbg)
        song = ev("""()=>{ KB.save.rewards.song = ''; KB.audio.music(null); KB.audio.music('title'); const a = KB.audio.musicKey;
            KB.save.rewards.song = 'arena'; KB.audio.music(null); KB.audio.music('title'); const b = KB.audio.musicKey;
            KB.save.rewards.song = ''; return [a, b]; }""")
        check('套用標題曲後 music(\'title\') 實際播的是獎勵曲', song == ['title', 'arena'], song)
        msong = ev("""()=>{ KB.save.rewards.mapsong = 'dream'; KB.audio.music(null); KB.audio.music('select');
            const a = KB.audio.musicKey; KB.save.rewards.mapsong = ''; return a; }""")
        check('套用選關曲後 music(\'select\') 也換曲', msong == 'dream', msong)
        raw = ev("""()=>{ KB.save.rewards.song = 'arena'; KB.UI.unlockAll = true;
            const b = KB.MUSICBOX.menu({restore:null}); b.cat = 0; b.sel = 0; b.playCur();
            const k = KB.audio.musicKey; KB.save.rewards.song = ''; KB.audio.music(null); return k; }""")
        check('音樂盒點播「星之序曲」時不會被標題曲獎勵換掉', raw == 'title', raw)
        sk = ev("""()=>{ KB.PROG.unlock('first_ability'); const d = KB.REWARDS.byAch('first_ability');
            const r = KB.REWARDS.equip(d), cur = KB.SKINS.current(), on = KB.REWARDS.isOn(d);
            KB.REWARDS.equip(d); return [r, cur, on, KB.SKINS.current()]; }""")
        check('配色獎勵走 KB.SKINS.set（套用＝換色、取消＝回櫻花粉）',
              sk == ['on', 'yellow', True, 'pink'], sk)

        # ============================================================ F. 成就頁
        print('-' * 8, 'F 成就頁（獎勵欄）')
        achp = ev("""()=>{ KB.UI.unlockAll = false;
            KB.save.achievements = {first_ability: Date.now(), basic8: Date.now()};
            const g = new KB.AbilityGallery(1);
            const tap = k => { KB.input.setVirtual({[k]:true}, true); KB.input.update(); const r = g.update();
                               KB.input.clearVirtual(); KB.input.update(); return r; };
            let err = null; try { g.draw(KB.ctx); } catch (e) { err = e.message; }
            tap('right'); const p1 = g.ap;
            tap('left'); const p0 = g.ap;
            tap('down'); const i1 = g.ai;
            g.ai = 1; const r = tap('attack');          // 基本大全 → 背景「黃昏草原」
            const on = KB.REWARDS.isOn(KB.REWARDS.byAch('basic8'));
            const msg = g.rewardMsg;
            tap('attack'); const off = KB.REWARDS.isOn(KB.REWARDS.byAch('basic8'));
            const back = tap('jump');
            tap('select'); const tab = g.tab;
            try { g.tab = 1; g.draw(KB.ctx); } catch (e) { err = err || e.message; }
            return { err, p1, p0, i1, r, on, off, back, tab, msg: msg || '', pages: KB.REWARDS.pages() }; }""")
        check('成就頁畫得出來（獎勵欄版）', achp['err'] is None, achp['err'])
        check('成就頁 9 列 × 5 頁', achp['pages'] == 5, achp['pages'])
        check('←→ 翻頁（→ 到第 2 頁、← 回第 1 頁）', achp['p1'] == 1 and achp['p0'] == 0, achp)
        check('↑↓ 移動游標', achp['i1'] == 1, achp['i1'])
        check('B（X）套用獎勵 → 使用中', achp['on'] is True, achp)
        check('再按一次 B 取消套用', achp['off'] is False, achp)
        check('套用後詳情列顯示提示訊息', bool(achp['msg']), achp['msg'])
        check('Z 返回、SELECT 切回能力圖鑑', achp['back'] == 'back' and achp['tab'] == 0, achp)
        lockeq = ev("""()=>{ KB.save.achievements = {}; const g = new KB.AbilityGallery(1); g.ai = 33;
            KB.input.setVirtual({attack:true}, true); KB.input.update(); g.update();
            KB.input.clearVirtual(); KB.input.update();
            return [KB.REWARDS.isOn(KB.REWARDS.byAch(KB.PROG.ACH[33].id)), g.rewardMsg]; }""")
        check('未解鎖的成就按 B 不會套用', lockeq[0] is False and not lockeq[1], lockeq)
        allpage = ev("""()=>{ KB.UI.unlockAll = true; const g = new KB.AbilityGallery(1); const errs = [];
            for (let i = 0; i < KB.PROG.ACH.length; i++) { g.ai = i; try { g.draw(KB.ctx); } catch (e) { errs.push(i + ':' + e.message); } }
            KB.UI.unlockAll = false; return errs; }""")
        check('40 條成就逐一當游標都畫得出來', allpage == [], allpage)

        # ============================================================ H. fix12
        print('-' * 8, 'H fix12（手機分類提示 / debug 成就頁）')
        CAP_JS = """(fn)=>{
          const cap = [];
          const ot = KB.UI.text, of = KB.UI.fitText;
          KB.UI.text = function(ctx,s){ cap.push(String(s)); return ot.apply(this, arguments); };
          KB.UI.fitText = function(ctx,s){ cap.push(String(s)); return of.apply(this, arguments); };
          try { (new Function('return (' + fn + ')'))()(); } finally { KB.UI.text = ot; KB.UI.fitText = of; }
          return cap;
        }"""
        MB_DRAW = "()=>{ const m = KB.MUSICBOX.menu({back:()=>{}}); m.draw(KB.ctx); }"
        # 桌機：分類列右端仍是 ←→
        desk = ev(CAP_JS, MB_DRAW)
        check('桌機音樂盒分類列右端仍畫 ←→', '←→' in desk, [t for t in desk if '←' in t])
        # 手機：hint 變「方向鍵」⇒ 分類列那一格不畫，改併進底部提示行
        mob = ev("""(js)=>{
          const oa = KB.input.touchActive;
          KB.input.touchActive = () => true;
          try { return (new Function('return (' + js + ')'))()(); }
          finally { KB.input.touchActive = oa; }
        }""", CAP_JS.replace('(fn)=>', '()=>').replace("fn", "'" + MB_DRAW.replace("'", "\\'") + "'"))
        check('手機音樂盒：分類列右端不再單獨畫「方向鍵」（不會像第 7 個分類）',
              '方向鍵' not in mob, [t for t in mob if t == '方向鍵'])
        check('手機音樂盒：分類切換提示改併進底部提示行',
              any('分類／換曲' in t for t in mob), [t for t in mob if '分類' in t])
        check('手機音樂盒：六個分類本身照畫',
              all(c in mob for c in ['系統', '世界', '魔王', '挑戰', '覺醒', '結局']), mob[:10])
        check('手機音樂盒底部提示行量得出寬度 ≤ 240（不被截字）',
              ev("""()=>{ const oa=KB.input.touchActive; KB.input.touchActive=()=>true;
                try { const s = KB.UI.hint('up','↑↓') + ' 分類／換曲　' + KB.UI.hint('jump','Z') + ' 播放　' + KB.UI.hint('select','SELECT') + ' 返回';
                      return Math.round(KB.UI.textWidth(s, {size: KB.UI.MS})) <= 240; }
                finally { KB.input.touchActive=oa; } }"""))

        # debug 下成就頁不得出現「LOCKED + 已領・可切換」
        ach_dbg = ev(CAP_JS, """()=>{ KB.UI.unlockAll = true; KB.save.achievements = {};
          const g = new KB.AbilityGallery(1); g.ai = 0; g.rewardMsgT = 0; g.draw(KB.ctx); KB.UI.unlockAll = false; }""")
        check('debug（unlockAll）下成就頁不再寫「已領・可切換」',
              '已領・可切換' not in ach_dbg, [t for t in ach_dbg if '已領' in t])
        check('debug 下獎勵狀態改標「debug 全開」', 'debug 全開' in ach_dbg, [t for t in ach_dbg if 'debug' in t])
        ach_real = ev(CAP_JS, """()=>{ KB.UI.unlockAll = false;
          KB.save.achievements = {}; KB.save.achievements[KB.PROG.ACH[0].id] = Date.now();
          const g = new KB.AbilityGallery(1); g.ai = 0; g.rewardMsgT = 0; g.draw(KB.ctx); }""")
        check('真實視角（成就已解鎖）仍寫「已領・可切換」', '已領・可切換' in ach_real, [t for t in ach_real if '已領' in t])
        ach_lock = ev(CAP_JS, """()=>{ KB.UI.unlockAll = false; KB.save.achievements = {};
          const g = new KB.AbilityGallery(1); g.ai = 0; g.rewardMsgT = 0; g.draw(KB.ctx); }""")
        check('真實視角（未解鎖）仍寫「未取得」，不會變成 debug 字樣',
              '未取得' in ach_lock and 'debug 全開' not in ach_lock, [t for t in ach_lock if '取得' in t or 'debug' in t])

        # ============================================================ G. PWA
        print('-' * 8, 'G PWA 選單項')
        pwa = ev("()=>['uiCan','uiValue','uiDo'].filter(k=>typeof KB.PWA[k] !== 'function')")
        check('KB.PWA.uiCan / uiValue / uiDo 存在', pwa == [], pwa)
        off = ev("""()=>{ KB.PWA.canInstall = false; KB.PWA.updateReady = false; KB.PWA.iosSafari = false;
            const m = new KB.SettingsMenu(); return m.items.filter(i=>i.pwa).map(i=>i.id); }""")
        check('沒有安裝 / 更新條件時，設定頁不出現 PWA 項', off == [], off)
        on = ev("""()=>{ KB.PWA.canInstall = true; KB.PWA.updateReady = true; KB.PWA.registered = true;
            KB.PWA.installed = false; KB.PWA.standalone = false;
            const m = new KB.SettingsMenu();
            const ids = m.items.filter(i=>i.pwa).map(i=>i.id);
            const vals = ids.map(id => KB.PWA.uiValue(m.items.find(i=>i.id===id).pwa));
            let err = null; m.sel = m.items.findIndex(i=>i.id==='pwaInstall');
            try { m.clampTop(m.items.length); m.draw(KB.ctx); } catch (e) { err = e.message; }
            return [ids, vals, err]; }""")
        check('可安裝 + 有新版本 → 設定頁出現兩項', on[0] == ['pwaInstall', 'pwaUpdate'], on)
        check('兩項的值欄文字（安裝 › / 重新載入 ›）', on[1] == ['安裝 ›', '重新載入 ›'], on[1])
        check('設定頁含 PWA 項時畫得出來', on[2] is None, on[2])
        ios = ev("""()=>{ KB.PWA.canInstall = false; KB.PWA.iosSafari = true; KB.PWA.supported = true;
            const can = KB.PWA.uiCan('install'), v = KB.PWA.uiValue('install');
            KB.PWA.iosSafari = false; KB.PWA.supported = false; return [can, v]; }""")
        check('iOS Safari 沒有安裝 API → 值欄改寫「分享→加入」', ios == [True, '分享→加入'], ios)
        doe = ev("""()=>{ try { KB.PWA.uiDo('install'); KB.PWA.uiDo('update'); KB.PWA.uiDo('zzz'); return true; }
            catch (e) { return String(e); } }""")
        check('uiDo 在任何狀態下都不拋錯', doe is True, doe)
        inst = ev("""()=>{ KB.PWA.installed = true; KB.PWA.canInstall = true;
            const r = KB.PWA.uiCan('install'); KB.PWA.installed = false; return r; }""")
        check('已安裝 / standalone 時不再顯示「加到主畫面」', inst is False, inst)

        if a.shots:
            ev("""()=>{ KB.UI.unlockAll = true; __kb.goto('title'); KB.scene.fade = 0;
                KB.scene.menu = new KB.TitleMenu(); KB.scene.menu.sub = KB.MUSICBOX.menu(); __kb.step(4); }""")
            take(pg, SHOT_DIR / 'test_box.png')
            ev("""()=>{ KB.scene.menu.sub = new KB.AbilityGallery(1); __kb.step(4); }""")
            take(pg, SHOT_DIR / 'test_ach.png')

        check('全程無 console error / pageerror', not logs, logs[:3])
        b.close()

    print('---')
    fails = [r for r in results if not r[1]]
    print('%d/%d passed' % (len(results) - len(fails), len(results)))
    for f in fails:
        print('  FAIL ' + f[0] + ('  ' + str(f[2]) if f[2] != '' else ''))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
