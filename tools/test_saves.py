# -*- coding: utf-8 -*-
"""
多存檔槽與按鍵重映射驗證（Round 8 / agent: saves-input）—— src/saves.js、src/keyconfig.js、src/input.js。

涵蓋：
  1. 遷移：舊 kirbystar_save + 槽 1 為空 → 自動搬到 kirbystar_save_1（設定升級成 kirbystar_global）
  2. 3 槽獨立：在槽 1 改 cleared 不影響槽 2 / 3；kirbystar_slot 記住目前槽
  3. 複製 / 刪除：copy(a,b)、erase(n)、list() 摘要
  4. 載入後 KB.PROG / UI.settings 讀到新值（能力等級、成就）
  5. 按鍵綁定：jump 改 KeyQ → KB.input 立刻認得、reload 後仍保留；還原預設；衝突處理
  6. 遊玩時間：GameScene 每 60 幀 +1 秒
  7. 畫面：SaveSelectScene / KeyConfigScene 可繪製（--shots 另存截圖）

用法：python tools/test_saves.py [-v] [--shots]
"""
import sys, json, base64, pathlib, argparse
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
SHOT_DIR = ROOT / 'shots' / 'agent_saves'

results = []
VERBOSE = False


def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    line = ('PASS ' if cond else 'FAIL ') + name
    if info != '' and (not cond or VERBOSE):
        line += '  ' + str(info)
    print(line)
    return bool(cond)


LEGACY = {
    'cleared': {'w1': True, 'w2': True},
    'score': 12345,
    'best': {'w1': 4000},
    'stars': {'w1': [True, True, False]},
    'seen': {'fire': True, 'ice': True, 'sword': True},
    'playCount': {'w1': 2},
    'abilityXp': {'fire': 8},
    'achievements': {'first_ability': 1700000000000},
    'settings': {'vfx': 'mid', 'hints': False, 'audio': {'music': 0.4, 'sfx': 0.9}},
}

# 乾淨起點（保留全域設定 / 綁定）
WIPE_SLOTS = """() => {
  for (const k of ['kirbystar_save_1','kirbystar_save_2','kirbystar_save_3']) localStorage.removeItem(k);
  KB.SAVES.load(1);
  return KB.SAVES.list().every(s => s.empty);
}"""


def take(pg, path, scale=3):
    path.parent.mkdir(parents=True, exist_ok=True)
    pg.evaluate("()=>__kb.render()")
    data = pg.evaluate("""(s)=>{const c=KB.canvas;const o=document.createElement('canvas');o.width=c.width*s;o.height=c.height*s;
        const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o.toDataURL('image/png')}""", scale)
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('  shot ->', path)


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument('-v', action='store_true')
    ap.add_argument('--shots', action='store_true', help='另存截圖到 shots/agent_saves/')
    a = ap.parse_args()
    VERBOSE = a.v
    logs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: logs.append('[console.' + m.type + '] ' + m.text) if m.type == 'error' else None)
        pg.goto(INDEX + '?debug=1&mute=1&norun=1')
        pg.wait_for_function('()=>window.__kb && KB.LEVELS && KB.SAVES')
        ev = pg.evaluate

        # ------------------------------------------------------------------ 0. API 存在
        print('-' * 8, 'API')
        api = ev("()=>Object.keys(KB.SAVES)")
        for k in ['list', 'load', 'save', 'copy', 'erase', 'current']:
            check('KB.SAVES.' + k + ' 存在', k in api)
        check('KB.SaveSelectScene / KB.KeyConfigScene 存在', ev("()=>!!(KB.SaveSelectScene && KB.KeyConfigScene)"))
        keys = ev("()=>[KB.SAVES.slotKey(1), KB.SAVES.slotKey(3), KB.SAVES.SLOT_KEY, KB.SAVES.GLOBAL_KEY]")
        check('存檔鍵名 kirbystar_save_1/3 + kirbystar_slot + kirbystar_global',
              keys == ['kirbystar_save_1', 'kirbystar_save_3', 'kirbystar_slot', 'kirbystar_global'], keys)
        check('KB.input 有 loadBindings / saveBindings',
              ev("()=>typeof KB.input.loadBindings==='function' && typeof KB.input.saveBindings==='function'"))

        # ------------------------------------------------------------------ 1. 舊存檔遷移
        print('-' * 8, '舊存檔遷移')
        ev("(o)=>{ localStorage.clear(); localStorage.setItem('kirbystar_save', JSON.stringify(o)); }", LEGACY)
        pg.reload()
        pg.wait_for_function('()=>window.__kb && KB.SAVES')
        mig = ev("""()=>{ const s1 = JSON.parse(localStorage.getItem('kirbystar_save_1')||'null');
            const g = JSON.parse(localStorage.getItem('kirbystar_global')||'null');
            return { s1: s1, g: g, cur: KB.SAVES.current(), cleared: KB.save.cleared, score: KB.save.score,
                     info: KB.SAVES.info(1), empty23: [KB.SAVES.isEmpty(2), KB.SAVES.isEmpty(3)] }; }""")
        check('舊 kirbystar_save → 槽 1', bool(mig['s1']) and mig['s1']['cleared'] == {'w1': True, 'w2': True}, mig['s1'])
        check('遷移後目前槽 = 1 且 KB.save 讀到舊進度', mig['cur'] == 1 and mig['cleared'] == {'w1': True, 'w2': True}, mig['cur'])
        check('槽 2 / 3 仍為空', mig['empty23'] == [True, True], mig['empty23'])
        check('設定升級成全域 kirbystar_global（vfx=mid、音量保留）',
              mig['g'] and mig['g']['settings'].get('vfx') == 'mid' and mig['g']['settings']['audio']['music'] == 0.4, mig['g'])
        check('槽 1 摘要：通關 2、星星 2、能力 3、成就 ≥1、分數 12345',
              [mig['info']['clears'], mig['info']['stars'], mig['info']['seen'], mig['info']['score']] == [2, 2, 3, 12345]
              and mig['info']['ach'] >= 1, mig['info'])
        check('摘要 savedAt 是合理的時間戳（不會用 |0 溢位成負數）', mig['info']['savedAt'] > 1.6e12, mig['info']['savedAt'])
        check('槽資料不含 settings（設定只放全域）', 'settings' not in mig['s1'], list(mig['s1'].keys()))
        # 不會重複遷移
        again = ev("""()=>{ KB.SAVES.erase(1); location.reload; const g = JSON.parse(localStorage.getItem('kirbystar_global')); return [KB.SAVES.isEmpty(1), !!g.migrated]; }""")
        pg.reload(); pg.wait_for_function('()=>window.__kb && KB.SAVES')
        check('刪掉槽 1 後重整不會又把舊存檔搬回來', ev("()=>KB.SAVES.isEmpty(1)"), again)

        # ------------------------------------------------------------------ 2. 3 槽獨立
        print('-' * 8, '3 槽獨立')
        check('清空 3 槽', ev(WIPE_SLOTS))
        sep = ev("""()=>{
          KB.SAVES.load(1); KB.save.cleared.w1 = true; KB.save.score = 111; KB.save.playTime = 65; KB.saveGame();
          const a = { cur: KB.SAVES.current(), cleared: Object.keys(KB.save.cleared) };
          KB.SAVES.load(2); const b = { cur: KB.SAVES.current(), cleared: Object.keys(KB.save.cleared), score: KB.save.score };
          KB.save.cleared.w2 = true; KB.save.score = 222; KB.saveGame();
          KB.SAVES.load(1); const c = { cleared: Object.keys(KB.save.cleared), score: KB.save.score, playTime: KB.save.playTime };
          KB.SAVES.load(2); const d = { cleared: Object.keys(KB.save.cleared), score: KB.save.score };
          return { a, b, c, d, list: KB.SAVES.list().map(s => [s.slot, s.empty, s.clears]) }; }""")
        check('在槽 1 改 cleared 不影響槽 2', sep['b']['cleared'] == [] and sep['b']['score'] == 0, sep['b'])
        check('切回槽 1 進度還在（w1 / 111 分 / 65 秒）',
              sep['c']['cleared'] == ['w1'] and sep['c']['score'] == 111 and sep['c']['playTime'] == 65, sep['c'])
        check('槽 2 只有自己的 w2 / 222 分', sep['d']['cleared'] == ['w2'] and sep['d']['score'] == 222, sep['d'])
        check('list() 三槽摘要正確', sep['list'] == [[1, False, 1], [2, False, 1], [3, True, 0]], sep['list'])
        cur_ls = ev("()=>[localStorage.getItem('kirbystar_slot'), KB.SAVES.current()]")
        check('kirbystar_slot 記住目前槽', cur_ls == ['2', 2], cur_ls)
        # reload 後回到同一槽
        pg.reload(); pg.wait_for_function('()=>window.__kb && KB.SAVES')
        back = ev("()=>[KB.SAVES.current(), Object.keys(KB.save.cleared)]")
        check('reload 後仍在槽 2 且讀到槽 2 的進度', back == [2, ['w2']], back)

        # ------------------------------------------------------------------ 3. 複製 / 刪除
        print('-' * 8, '複製 / 刪除')
        cp = ev("""()=>{
          const ok = KB.SAVES.copy(1, 3);
          const i3 = KB.SAVES.info(3), i1 = KB.SAVES.info(1);
          const bad = KB.SAVES.copy(3, 3);
          KB.SAVES.load(3); const loaded = Object.keys(KB.save.cleared);
          return { ok, bad, same: i3.clears === i1.clears && i3.score === i1.score, loaded, i3 }; }""")
        check('copy(1,3) 成功且摘要相同', cp['ok'] is True and cp['same'], cp['i3'])
        check('copy 到同一槽會被拒絕', cp['bad'] is False)
        check('載入複製出來的槽 3 讀到槽 1 的進度', cp['loaded'] == ['w1'], cp['loaded'])
        er = ev("""()=>{ KB.SAVES.load(2); const ok = KB.SAVES.erase(3);
          return { ok, empty3: KB.SAVES.isEmpty(3), raw: localStorage.getItem('kirbystar_save_3'), keep2: Object.keys(KB.save.cleared) }; }""")
        check('erase(3) 清掉槽 3（localStorage key 也移除）', er['empty3'] is True and er['raw'] is None, er)
        check('刪除其他槽不影響目前槽', er['keep2'] == ['w2'], er['keep2'])
        er2 = ev("""()=>{ KB.SAVES.load(1); KB.SAVES.erase(1);
          return { cleared: Object.keys(KB.save.cleared), score: KB.save.score, empty: KB.SAVES.isEmpty(1) }; }""")
        check('刪除「目前」的槽會就地清空 KB.save', er2['cleared'] == [] and er2['score'] == 0 and er2['empty'], er2)
        check('KB.save 物件參考不變（其他模組快取不會失效）',
              ev("()=>{ const ref = KB.save; KB.SAVES.load(2); return ref === KB.save; }"))

        # ------------------------------------------------------------------ 4. 載入後 KB.PROG / 設定重新讀取
        print('-' * 8, 'KB.PROG / 設定')
        prog = ev("""()=>{
          KB.SAVES.load(1); KB.save.abilityXp = { fire: 8 }; KB.save.achievements = { first_ability: 1, combo10: 2 }; KB.saveGame();
          const a = [KB.PROG.level('fire'), KB.PROG.xp('fire'), KB.PROG.achCount()];
          KB.SAVES.load(2); const b = [KB.PROG.level('fire'), KB.PROG.xp('fire'), KB.PROG.achCount()];
          KB.SAVES.load(1); const c = [KB.PROG.level('fire'), KB.PROG.xp('fire'), KB.PROG.achCount()];
          return { a, b, c }; }""")
        check('槽 1：fire xp 8 → Lv3、成就 2', prog['a'] == [3, 8, 2], prog['a'])
        check('切到槽 2 後 KB.PROG 讀到空進度', prog['b'] == [1, 0, 0], prog['b'])
        check('切回槽 1 後 KB.PROG 又讀到 Lv3', prog['c'] == [3, 8, 2], prog['c'])
        st = ev("""()=>{
          KB.SAVES.load(1); KB.UI.settings().vfx = 'low'; KB.UI.saveSettings();
          KB.SAVES.load(2); const a = KB.save.settings.vfx;
          const g = JSON.parse(localStorage.getItem('kirbystar_global'));
          return { a, g: g.settings.vfx, shared: KB.save.settings === KB.SAVES.globals().settings }; }""")
        check('設定是全域的：換槽後 vfx 仍是 low', st['a'] == 'low' and st['g'] == 'low', st)
        check('KB.save.settings 與全域設定是同一個物件', st['shared'] is True)

        # ------------------------------------------------------------------ 5. 按鍵綁定
        print('-' * 8, '按鍵綁定')
        rb = ev("""()=>{
          KB.input.rebind('jump', ['KeyQ']); KB.input.saveBindings();
          const g = JSON.parse(localStorage.getItem('kirbystar_global'));
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
          KB.input.clearVirtual(); KB.input.update();
          const down = KB.input.down('jump');
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); KB.input.update();
          return { jump: KB.input.BINDINGS.jump, owner: KB.input.actionOf('KeyQ'), names: KB.input.keyNames('jump'),
                   saved: g.bindings.keyboard.jump, down }; }""")
        check('rebind jump = KeyQ 後 KB.input 立刻認得', rb['owner'] == 'jump' and rb['names'] == ['Q'], rb)
        check('真的按下 Q 會觸發 jump', rb['down'] is True)
        check('綁定寫進 kirbystar_global', rb['saved'] == ['KeyQ'], rb['saved'])
        pg.reload(); pg.wait_for_function('()=>window.__kb && KB.SAVES')
        keep = ev("()=>[KB.input.BINDINGS.jump, KB.input.actionOf('KeyQ'), KB.input.BINDINGS.jump.indexOf('KeyZ')]")
        check('reload 後綁定保留（jump = KeyQ、Z 已不是跳躍）', keep[0] == ['KeyQ'] and keep[1] == 'jump' and keep[2] == -1, keep)
        rs = ev("""()=>{ KB.input.resetBindings(); KB.input.saveBindings();
          return { jump: KB.input.BINDINGS.jump, gp: KB.input.GAMEPAD.jump, def: KB.input.isDefaultBindings() }; }""")
        check('還原預設（jump 回 Z/K/Space、手把回 A/B）',
              rs['jump'] == ['KeyZ', 'KeyK', 'Space'] and rs['gp'] == [0, 1] and rs['def'] is True, rs)
        pg.reload(); pg.wait_for_function('()=>window.__kb && KB.SAVES')
        check('reload 後仍是預設', ev("()=>KB.input.isDefaultBindings()"))

        # 衝突處理（透過 KeyConfigScene.bindKey，與實際操作同一條路徑）
        conf = ev("""()=>{
          const s = new KB.KeyConfigScene(); s.sel = KB.input.ACTIONS.indexOf('jump');
          s.bindKey('jump', 'KeyX');                 // KeyX 原本是 attack（attack 有 KeyX / KeyJ 兩鍵）
          const r = { jump: KB.input.BINDINGS.jump.slice(), attack: KB.input.BINDINGS.attack.slice(), msg: s.msg };
          r.owner = KB.input.actionOf('KeyX');
          return r; }""")
        check('衝突：把 attack 的 X 綁到 jump → attack 失去 X', conf['owner'] == 'jump' and 'KeyX' not in conf['attack'], conf)
        check('jump 最多保留 3 個鍵（新鍵在最前）', conf['jump'][0] == 'KeyX' and len(conf['jump']) == 3, conf['jump'])
        check('衝突提示訊息有提到原本的動作', '攻擊' in conf['msg'], conf['msg'])
        guard = ev("""()=>{ KB.input.resetBindings();
          KB.input.rebind('attack', ['KeyX']);        // attack 只剩一個鍵
          const s = new KB.KeyConfigScene();
          const ok = s.bindKey('jump', 'KeyX');
          return { ok, attack: KB.input.BINDINGS.attack, jump: KB.input.BINDINGS.jump, msg: s.msg }; }""")
        check('保護：動作只剩 1 個鍵時不會被搶走（會被拒絕並提示）',
              guard['ok'] is False and guard['attack'] == ['KeyX'] and 'KeyX' not in guard['jump'], guard)
        dup = ev("""()=>{ KB.input.resetBindings(); const s = new KB.KeyConfigScene();
          const ok = s.bindKey('jump', 'KeyZ'); return { ok, jump: KB.input.BINDINGS.jump, msg: s.msg }; }""")
        check('重複綁同一個鍵會被拒絕（不會變成兩格）', dup['ok'] is False and dup['jump'] == ['KeyZ', 'KeyK', 'Space'], dup)
        rem = ev("""()=>{ KB.input.resetBindings(); const s = new KB.KeyConfigScene();
          s.removeKey('jump'); const a = KB.input.BINDINGS.jump.slice();
          KB.input.rebind('jump', ['KeyZ']); const ok = s.removeKey('jump');
          return { a, ok, jump: KB.input.BINDINGS.jump }; }""")
        check('X 移除最後一個鍵、但至少保留 1 個', rem['a'] == ['KeyZ', 'KeyK'] and rem['ok'] is False and rem['jump'] == ['KeyZ'], rem)
        gpb = ev("""()=>{ KB.input.resetBindings(); const s = new KB.KeyConfigScene();
          s.bindButton('jump', 2);       // 2 原本是 attack(X)
          return { jump: KB.input.GAMEPAD.jump, attack: KB.input.GAMEPAD.attack, name: KB.input.buttonName(2), msg: s.msg }; }""")
        check('手把按鈕重綁：jump = B2(X)，attack 失去 2', gpb['jump'] == [2] and 2 not in gpb['attack'], gpb)
        check('手把按鈕顯示名稱（標準配置別名）', gpb['name'] == 'X', gpb['name'])
        ev("()=>{ KB.input.resetBindings(); KB.input.saveBindings(); }")

        # ------------------------------------------------------------------ 6. 遊玩時間
        print('-' * 8, '遊玩時間')
        pt = ev("""()=>{ KB.SAVES.load(3); KB.save.playTime = 0;
          __kb.goto('game', { level: 'w1', room: 0, nofade: true }); __kb.step(2);
          const t0 = KB.save.playTime | 0; __kb.step(130);
          return { t0, t1: KB.save.playTime | 0, patched: !!KB.GameScene.prototype.__savesTick }; }""")
        check('GameScene 有掛上遊玩時間計時', pt['patched'] is True)
        check('遊戲中每 60 幀 +1 秒（130 幀 → +2）', pt['t1'] - pt['t0'] == 2, pt)
        fmt = ev("()=>[KB.SAVES.fmtTime(65), KB.SAVES.fmtTime(3725), KB.SAVES.fmtTime(0)]")
        check('遊玩時間格式 mm:ss / h:mm:ss', fmt == ['01:05', '1:02:05', '00:00'], fmt)
        pause = ev("""()=>{ const t0 = KB.save.playTime|0; KB.scene.paused = true; __kb.step(120);
          const t1 = KB.save.playTime|0; KB.scene.paused = false; return [t0, t1]; }""")
        check('暫停中不累加遊玩時間', pause[0] == pause[1], pause)

        # ------------------------------------------------------------------ 7. 畫面
        print('-' * 8, '畫面')
        setup = ev("""()=>{
          for (let i = 1; i <= 3; i++) KB.SAVES.erase(i);
          KB.SAVES.load(1);
          KB.save.cleared = { w1: true, w2: true, w3: true }; KB.save.score = 128400; KB.save.playTime = 4931;
          KB.save.stars = { w1: [true,true,true], w2: [true,false,true], w3: [true,false,false] };
          KB.save.seen = { fire:1, ice:1, sword:1, beam:1, cutter:1, stone:1, spark:1, hammer:1 };
          KB.save.achievements = { a:1, b:1, c:1, d:1 }; KB.saveGame();
          KB.SAVES.load(2);
          KB.save.cleared = { w1: true }; KB.save.score = 20100; KB.save.playTime = 742;
          KB.save.stars = { w1: [true,false,false] }; KB.save.seen = { fire:1, sword:1 }; KB.saveGame();
          KB.SAVES.load(1);
          return KB.SAVES.list().map(s => [s.slot, s.empty, s.clears, s.stars, s.seen, s.playTime]); }""")
        check('測試資料：槽 1 / 2 有進度、槽 3 空', setup[2][1] is True and setup[0][2] == 3, setup)
        draw1 = ev("""()=>{ KB.setScene(new KB.SaveSelectScene()); KB.scene.fade = 0; __kb.step(4); __kb.render();
          return [KB.scene.constructor.name, KB.scene.list.length, KB.scene.sel]; }""")
        check('SaveSelectScene 可繪製（3 張卡）', draw1[0] == 'SaveSelectScene' and draw1[1] == 3, draw1)
        if a.shots:
            take(pg, SHOT_DIR / 'save_select.png')
        sub = ev("""()=>{ __kb.tap('down', 1); __kb.tap('select', 1); __kb.step(2); const m = KB.scene.mode;
            __kb.tap('jump', 1); __kb.step(2);                      // 複製到…
            const m2 = KB.scene.mode, opts = KB.scene.copyOpts.map(o => o.label);
            __kb.tap('jump', 1); __kb.step(2);                      // 選第一個目標 → 二次確認
            __kb.render();
            return [m, m2, opts, KB.scene.mode, KB.scene.confirmData && KB.scene.confirmData.text]; }""")
        check('SELECT 開子選單 → 複製 → 選目標 → 二次確認',
              sub[0] == 'menu' and sub[1] == 'copyTo' and sub[3] == 'confirm', sub)
        check('確認文字包含來源與目標檔案', sub[4] and '檔案2' in sub[4].replace(' ', ''), sub[4])
        if a.shots:
            take(pg, SHOT_DIR / 'copy_confirm.png')
        doit = ev("""()=>{ __kb.tap('right', 1); __kb.tap('jump', 1); __kb.step(2);
            const i1 = KB.SAVES.info(1), i2 = KB.SAVES.info(2);
            return [KB.scene.mode, i1.clears, i1.playTime, i2.clears, i2.playTime, KB.scene.toast]; }""")
        check('確認「確定」後真的複製過去（槽 2 → 槽 1，摘要一致）',
              doit[0] == 'list' and doit[1] == doit[3] == 1 and doit[2] == doit[4] == 742, doit)
        dele = ev("""()=>{ KB.scene.sel = 2; KB.SAVES.copy(1, 3);
            __kb.tap('select', 1); __kb.step(1); const items = KB.scene.menuItems.map(i => i.id);
            __kb.tap('down', 1); __kb.tap('jump', 1); __kb.step(2);   // 刪除 → 確認
            const ask = KB.scene.confirmData && KB.scene.confirmData.text;
            __kb.tap('jump', 1); __kb.step(2);                        // 預設停在「取消」
            const kept = !KB.SAVES.isEmpty(3);
            __kb.tap('select', 1); __kb.tap('down', 1); __kb.tap('jump', 1); __kb.step(2);
            __kb.tap('right', 1); __kb.tap('jump', 1); __kb.step(2);  // 這次選「確定」
            return { items, ask, kept, empty3: KB.SAVES.isEmpty(3) }; }""")
        check('刪除需要二次確認，游標預設在「取消」', dele['kept'] is True and '刪除' in (dele['ask'] or ''), dele)
        check('選「確定」後槽 3 被刪除', dele['empty3'] is True, dele)

        draw2 = ev("""()=>{ KB.setScene(new KB.KeyConfigScene()); KB.scene.fade = 0; __kb.step(4); __kb.render();
            return [KB.scene.constructor.name, KB.input.ACTIONS.length, KB.scene.actions().length]; }""")
        check('KeyConfigScene 可繪製（8 個動作）', draw2[0] == 'KeyConfigScene' and draw2[2] == 8, draw2)
        if a.shots:
            take(pg, SHOT_DIR / 'keyconfig.png')
        lis = ev("""()=>{ const TAP = k => { KB.input.setVirtual({ [k]: true }, true); __kb.step(1); KB.input.clearVirtual(); __kb.step(1); };
          for (let i = 0; i < 4; i++) TAP('down');      // left → jump（第 5 列）
            const row = KB.scene.actions()[KB.scene.sel];
            TAP('jump'); __kb.render();
            return [KB.scene.mode, row, KB.scene.sel]; }""")
        check('Z 進入監聽狀態（↓ 四次選到 jump 那列）', lis[0] == 'listen' and lis[1] == 'jump', lis)
        if a.shots:
            take(pg, SHOT_DIR / 'keyconfig_listen.png')
        real = ev("""()=>{ window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
            __kb.step(2);
            const r = { mode: KB.scene.mode, jump: KB.input.BINDINGS.jump.slice(), msg: KB.scene.msg };
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); __kb.step(1);
            return r; }""")
        check('監聽中按 Q → 綁到 jump 並離開監聽', real['mode'] == 'list' and real['jump'][0] == 'KeyQ', real)
        if a.shots:
            ev("()=>__kb.render()")
            take(pg, SHOT_DIR / 'keyconfig_bound.png')
        ev("()=>__kb.step(16)")      # 等剛才綁定造成的輸入鎖定（lockT）跑完
        esc = ev("""()=>{ const TAP = k => { KB.input.setVirtual({ [k]: true }, true); __kb.step(1); KB.input.clearVirtual(); __kb.step(1); };
          KB.scene.sel = 0; TAP('jump'); const a = KB.scene.mode;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); __kb.step(2);
            const b = KB.scene.mode;
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' })); __kb.step(12);
            TAP('select'); const c = KB.scene.mode;
            TAP('right'); TAP('jump');
            return [a, b, c, KB.scene.mode, KB.input.isDefaultBindings()]; }""")
        check('監聽中 Esc 可取消、SELECT → 確認後還原預設',
              esc[0] == 'listen' and esc[1] == 'list' and esc[2] == 'confirm' and esc[4] is True, esc)
        menu = ev("""()=>{ const m = KB.KeyConfigMenu(); const s = KB.SaveSelectMenu();
            m.draw(KB.ctx); s.draw(KB.ctx);
            KB.input.setVirtual({ start: true }, true); KB.input.update();
            const r = [m.update(), s.update()];
            KB.input.clearVirtual(); KB.input.update();
            return r; }""")
        check('子選單模式（給 ach2 的設定頁用）：START 回傳 back', menu == ['back', 'back'], menu)

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
