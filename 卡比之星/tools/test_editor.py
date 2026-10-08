# -*- coding: utf-8 -*-
"""關卡編輯器自動測試（Round 12 / K12-3 level-editor）

涵蓋：資料模型與分享碼（壓縮 / base64 / 校驗 / 壞碼拒絕）、格子畫筆與物件放置、復原 / 重做、
      localStorage 多槽存取、測玩往返（進遊戲 → 回編輯器保留狀態）、可達性檢查、
      縮放捲動與工具列幾何、標題選單入口，以及 iPhone 13 橫向的觸控畫筆 / 兩指捲動 / 工具列 ≥ 44px。

用法：.venv/bin/python tools/test_editor.py [--shots]
"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').as_uri()
URL = INDEX + '?debug=1&mute=1&norun=1'

results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + ('  ' + str(info) if info else ''))


# ----------------------------------------------------------------------
# 瀏覽器端共用腳本（以 KB.CUSTOM / KB.EDITOR 的公開 API 操作，與手動操作等價）
# ----------------------------------------------------------------------
JS_SETUP = """() => {
  window.__T = {};
  const CU = KB.CUSTOM;
  __T.mk = (w, h) => CU.blank(w || 48, h || 14, 'green');
  __T.wall = (d, x, ch) => { for (let y = 0; y < d.h - 2; y++) d.rows[y] = d.rows[y].slice(0, x) + ch + d.rows[y].slice(x + 1); return d; };
  return true;
}"""


def desktop(pg):
    pg.goto(URL)
    pg.wait_for_function('()=>window.__kb && KB.CUSTOM && KB.EDITOR && KB.EditorScene')
    pg.evaluate("()=>{try{localStorage.removeItem('kirbystar_custom')}catch(e){}}")
    pg.evaluate(JS_SETUP)
    ev = pg.evaluate

    # ================= A. 資料模型 / 分享碼 =================
    check('blank 尺寸被夾在合法範圍', ev("()=>{const d=KB.CUSTOM.blank(4,999);return d.w===KB.CUSTOM.MIN_W && d.h===KB.CUSTOM.MAX_H}"))
    check('blank 底部兩列為實心地面', ev("()=>{const d=__T.mk();return d.rows[d.h-1].indexOf('.')<0 && d.rows[d.h-2].indexOf('.')<0}"))
    check('blank 起點 / 終點旗皆已設好', ev("()=>{const d=__T.mk();return !!d.spawn && !!d.exit}"))
    check('normalize 拒絕未知磁磚字元', ev("()=>{const d=__T.mk(); d.rows[0]='Z'+d.rows[0].slice(1); return KB.CUSTOM.normalize(d)===null}"))
    check('normalize 拒絕未知物件類型', ev("()=>{const d=__T.mk(); d.objs=[{t:'nosuch',x:1,y:1}]; return KB.CUSTOM.normalize(d)===null}"))
    check('normalize 夾限物件座標', ev("()=>{const d=__T.mk(); d.objs=[{t:'waddledee',x:999,y:999}]; const n=KB.CUSTOM.normalize(d); return n.objs[0].x===n.w-1 && n.objs[0].y===n.h-1}"))
    check('RLE 往返一致', ev("()=>{const s='....###..~~~~~~~~~~~~~~#'; return KB.CUSTOM.unrle(KB.CUSTOM.rle(s))===s}"))
    check('RLE 真的有壓縮', ev("()=>{const s='.'.repeat(300); return KB.CUSTOM.rle(s).length<6}"))
    check('encode 使用 KBL1 前綴與兩個分隔點', ev("()=>{const c=KB.CUSTOM.encode(__T.mk()); return c.indexOf('KBL1.')===0 && c.split('.').length===3}"))
    check('分享碼往返內容完全一致', ev("""()=>{const d=__T.mk(); d.name='測試關卡'; d.objs=[{t:'waddledee',x:5,y:11},{t:'essence',x:9,y:11,a:'fire'},{t:'bigstar',x:12,y:8,a:2}];
      d.deco[11]='t'+d.deco[11].slice(1);
      const b=KB.CUSTOM.decode(KB.CUSTOM.encode(d)); return JSON.stringify(b)===JSON.stringify(KB.CUSTOM.normalize(d))}"""))
    check('分享碼保留中文關卡名', ev("()=>{const d=__T.mk(); d.name='草原大冒險'; return KB.CUSTOM.decode(KB.CUSTOM.encode(d)).name==='草原大冒險'}"))
    check('分享碼保留魔王設定', ev("()=>{const d=__T.mk(); d.boss='whispywoods'; d.bossPos=[20,11]; const b=KB.CUSTOM.decode(KB.CUSTOM.encode(d)); return b.boss==='whispywoods' && b.bossPos[0]===20}"))
    check('大關卡（160×28）分享碼往返', ev("()=>{const d=KB.CUSTOM.blank(160,28); const b=KB.CUSTOM.decode(KB.CUSTOM.encode(d)); return !!b && b.w===160 && b.h===28}"))
    check('分享碼比原始 JSON 短（壓縮有效）', ev("()=>{const d=KB.CUSTOM.blank(160,28); return KB.CUSTOM.encode(d).length < JSON.stringify(d).length/4}"))
    check('分享碼可含換行 / 空白後仍能匯入', ev("()=>{const c=KB.CUSTOM.encode(__T.mk()); const m=c.slice(0,30)+'\\n '+c.slice(30); return !!KB.CUSTOM.decode(m)}"))
    # ---- 壞碼一律拒絕 ----
    check('壞碼：空字串被拒', ev("()=>KB.CUSTOM.decode('')===null"))
    check('壞碼：非字串被拒', ev("()=>KB.CUSTOM.decode(null)===null && KB.CUSTOM.decode(123)===null"))
    check('壞碼：前綴錯誤被拒', ev("()=>{const c=KB.CUSTOM.encode(__T.mk()); return KB.CUSTOM.decode('XXXX'+c.slice(4))===null}"))
    check('壞碼：校驗碼被改被拒', ev("()=>{const c=KB.CUSTOM.encode(__T.mk()); return KB.CUSTOM.decode(c.slice(0,c.length-4)+'dead')===null}"))
    check('壞碼：內容被竄改（校驗不符）被拒', ev("""()=>{const c=KB.CUSTOM.encode(__T.mk()); const p=c.split('.');
      p[1]=p[1].slice(0,20)+(p[1][20]==='A'?'B':'A')+p[1].slice(21); return KB.CUSTOM.decode(p.join('.'))===null}"""))
    check('壞碼：被截斷被拒', ev("()=>{const c=KB.CUSTOM.encode(__T.mk()); return KB.CUSTOM.decode(c.slice(0,40))===null}"))
    check('壞碼：段數不對被拒', ev("()=>KB.CUSTOM.decode('KBL1.abcdef')===null"))
    check('壞碼：隨便一串文字被拒', ev("()=>KB.CUSTOM.decode('這不是分享碼')===null"))

    # ================= B. 畫筆 / 物件 =================
    ev("()=>{__kb.goto('editor',{}); __kb.step(2);}")
    check('進入編輯器場景', ev("()=>KB.scene.constructor.name==='EditorScene'"))
    check('磁磚畫筆畫得下去', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.paint(5,5); return s.tile(5,5)==='#'}"))
    check('同一格畫同樣的東西不會再記一次', ev("()=>{const s=KB.EDITOR.state; const n=s.undoStack.length; s.paint(5,5); return s.undoStack.length===n}"))
    check('裝飾層與地形層互相獨立', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'deco',ch:'t'}); s.paint(5,5); return s.decoAt(5,5)==='t' && s.tile(5,5)==='#'}"))
    check('水磚畫得下去', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'~'}); s.paint(7,10); return s.tile(7,10)==='~'}"))
    check('平台 / 斜坡 / 尖刺 / 梯子都畫得下去', ev("""()=>{const s=KB.EDITOR.state; let ok=true;
      for (const [ch,x] of [['=',20],['/',21],['\\\\',22],['^',23],['H',24]]) { s.setBrush({kind:'tile',ch}); s.paint(x,9); ok = ok && s.tile(x,9)===ch; } return ok}"""))
    check('物件放得下去', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'obj',t:'waddledee'}); s.paint(10,11); return !!s.objAt(10,11) && s.objAt(10,11).t==='waddledee'}"))
    check('同一格放第二個物件會覆蓋（不重複）', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'obj',t:'hothead'}); s.paint(10,11); const n=s.data.objs.filter(o=>o.x===10&&o.y===11).length; return n===1 && s.objAt(10,11).t==='hothead'}"))
    check('能力星會帶上所選能力', ev("()=>{const s=KB.EDITOR.state; s.abilityPick='sword'; s.setBrush({kind:'obj',t:'essence'}); s.paint(12,11); return s.objAt(12,11).a==='sword'}"))
    check('大星星會帶上 0/1/2 編號', ev("()=>{const s=KB.EDITOR.state; s.starPick=2; s.setBrush({kind:'obj',t:'bigstar'}); s.paint(14,9); return s.objAt(14,9).a===2}"))
    check('橡皮擦同時清掉磁磚 / 裝飾 / 物件', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.paint(30,9);
      s.setBrush({kind:'deco',ch:'t'}); s.paint(30,9); s.setBrush({kind:'obj',t:'waddledee'}); s.paint(30,9);
      s.setBrush({kind:'mark',m:'erase'}); s.paint(30,9);
      return s.tile(30,9)==='.' && s.decoAt(30,9)==='.' && !s.objAt(30,9)}"""))
    check('擦除參數（B 鍵）也能清掉一格', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.paint(31,9); s.paint(31,9,true); return s.tile(31,9)==='.'}"))
    check('吸管讀回該格的磁磚筆刷', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'X'}); s.paint(32,9); s.setBrush({kind:'tile',ch:'.'}); s.pick(32,9); return s.brush.kind==='tile' && s.brush.ch==='X'}"))
    check('吸管讀回該格的物件筆刷', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'obj',t:'rocky'}); s.paint(33,11); s.setBrush({kind:'tile',ch:'.'}); s.pick(33,11); return s.brush.kind==='obj' && s.brush.t==='rocky'}"))
    check('起點只有一個（移動而非新增）', ev("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'mark',m:'spawn'}); s.paint(6,11); return s.data.spawn[0]===6 && s.data.spawn[1]===11}"))
    check('終點旗設定 / 再點一次取消', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'mark',m:'exit'}); s.paint(40,11);
      const a = s.data.exit && s.data.exit[0]===40; s.paint(40,11); return a && s.data.exit===null}"""))
    check('同一筆（stroke）在同一格只記一次復原點', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'B'}); s.beginStroke();
      const n=s.undoStack.length; s.paint(35,9); s.paint(35,9); s.paint(35,9); s.endStroke(); return s.undoStack.length===n+1}"""))
    check('畫到地圖外不會壞掉', ev("()=>{const s=KB.EDITOR.state; return s.paint(-1,5)===false && s.paint(9999,5)===false}"))

    # ================= C. 復原 / 重做 =================
    check('復原會還原上一步', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.paint(44,9);
      const had=s.tile(44,9)==='#'; s.undo(); return had && s.tile(44,9)==='.'}"""))
    check('重做會再套用一次', ev("()=>{const s=KB.EDITOR.state; s.redo(); return s.tile(44,9)==='#'}"))
    check('可以連續復原多步', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'});
      s.paint(45,9); s.paint(45,8); s.paint(45,7); s.undo(); s.undo(); s.undo();
      return s.tile(45,9)==='.' && s.tile(45,8)==='.' && s.tile(45,7)==='.'}"""))
    check('新的編輯會清掉重做堆疊', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.paint(46,9); s.undo();
      const had=s.canRedo; s.paint(46,8); return had && !s.canRedo}"""))
    check('復原堆疊有上限（UNDO_MAX）', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'});
      for (let i=0;i<KB.EDITOR.UNDO_MAX+20;i++) s.paint(2+(i%40), 4+((i/40)|0));
      return s.undoStack.length<=KB.EDITOR.UNDO_MAX}"""))
    check('物件放置也進得了復原', ev("""()=>{const s=KB.EDITOR.state; s.setBrush({kind:'obj',t:'cappy'}); s.paint(18,11);
      s.undo(); return !s.objAt(18,11)}"""))
    check('canUndo / canRedo 旗標正確', ev("()=>{const s=new KB.EDITOR.EditorState(KB.CUSTOM.blank(),-1); const a=!s.canUndo && !s.canRedo; s.setBrush({kind:'tile',ch:'#'}); s.paint(3,3); return a && s.canUndo && !s.canRedo}"))

    # ================= D. localStorage 多槽 =================
    check('槽位數 ≥ 8', ev("()=>KB.CUSTOM.SLOTS>=8"), ev("()=>KB.CUSTOM.SLOTS"))
    check('存檔後讀得回來（內容一致）', ev("""()=>{const d=__T.mk(); d.name='存檔測試'; d.objs=[{t:'waddledee',x:4,y:11}];
      KB.CUSTOM.setSlot(0,d); const b=KB.CUSTOM.slot(0);
      return !!b && b.name==='存檔測試' && b.objs.length===1}"""))
    check('8 個槽位都能各自存不同關卡', ev("""()=>{for(let i=0;i<8;i++){const d=__T.mk(); d.name='關卡'+(i+1); KB.CUSTOM.setSlot(i,d);}
      const nm=KB.CUSTOM.slotNames(); return nm.length>=8 && nm[0]==='關卡1' && nm[7]==='關卡8'}"""))
    check('刪除槽位後變回空的', ev("()=>{KB.CUSTOM.delSlot(3); return KB.CUSTOM.slot(3)===null && KB.CUSTOM.slotNames()[3]===null}"))
    check('firstFree 回傳第一個空槽', ev("()=>KB.CUSTOM.firstFree()===3"))
    check('EditorState.saveTo / loadFrom 往返', ev("""()=>{const s=new KB.EDITOR.EditorState(__T.mk(),-1); s.setName('往返關');
      s.setBrush({kind:'tile',ch:'#'}); s.paint(9,9); s.saveTo(5);
      const s2=new KB.EDITOR.EditorState(KB.CUSTOM.blank(),-1); s2.loadFrom(5);
      return s2.data.name==='往返關' && s2.tile(9,9)==='#' && s2.slot===5 && s2.dirty===false}"""))
    check('存檔後 dirty 旗標清掉', ev("()=>{const s=new KB.EDITOR.EditorState(__T.mk(),-1); s.setBrush({kind:'tile',ch:'#'}); s.paint(9,9); const a=s.dirty; s.saveTo(6); return a && !s.dirty}"))
    check('匯入分享碼會換掉目前關卡', ev("""()=>{const d=__T.mk(); d.name='匯入關'; const c=KB.CUSTOM.encode(d);
      const s=new KB.EDITOR.EditorState(__T.mk(),-1); const ok=s.importCode(c); return ok && s.data.name==='匯入關'}"""))
    check('匯入壞碼會被拒絕且不動到現有關卡', ev("""()=>{const s=new KB.EDITOR.EditorState(__T.mk(),-1); s.setName('原本的');
      const ok=s.importCode('KBL1.zzz.00000000'); return ok===false && s.data.name==='原本的'}"""))
    check('排行只留最快的 5 筆且由快到慢', ev("""()=>{KB.CUSTOM.delSlot(7); KB.CUSTOM.setSlot(7,__T.mk());
      for (const t of [900,300,1200,100,600,50,2000]) KB.CUSTOM.addBest(7,{time:t,score:t*2,ability:'fire'});
      const b=KB.CUSTOM.best(7);
      return b.length===5 && b[0].time===50 && b[4].time===900 && b.every((r,i)=>i===0||r.time>=b[i-1].time)}"""))
    check('排行記錄含分數 / 能力 / 日期', ev("()=>{const r=KB.CUSTOM.best(7)[0]; return r.score===100 && r.ability==='fire' && /\\d{4}\\/\\d{2}\\/\\d{2}/.test(r.date)}"))

    # ================= E. 可達性 / 檢查 =================
    check('乾淨的空白關卡 0 錯誤 0 警告', ev("()=>{const r=KB.CUSTOM.check(__T.mk()); return r.errors.length===0 && r.warns.length===0}"),
          ev("()=>JSON.stringify(KB.CUSTOM.check(__T.mk()).warns)"))
    check('實心牆封死 → 終點旗不可達（錯誤）', ev("""()=>{const d=__T.wall(__T.mk(),24,'#');
      const r=KB.CUSTOM.check(d); return r.errors.some(s=>s.indexOf('終點旗不可達')>=0)}"""))
    check('只隔著星星磚 → 只給「要先打破方塊」警告', ev("""()=>{const d=__T.wall(__T.mk(),24,'*');
      const r=KB.CUSTOM.check(d); return r.errors.length===0 && r.warns.some(s=>s.indexOf('打破方塊')>=0)}"""))
    check('牆後的物件被判為完全不可達', ev("""()=>{const d=__T.wall(__T.mk(),24,'#'); d.objs=[{t:'tomato',x:30,y:11}];
      const r=KB.CUSTOM.check(d); return r.warns.some(s=>s.indexOf('完全不可達')>=0)}"""))
    check('起點懸空會警告', ev("()=>{const d=__T.mk(); d.spawn=[5,2]; return KB.CUSTOM.check(d).warns.some(s=>s.indexOf('起點下方沒有地面')>=0)}"))
    check('起點埋在實心裡是錯誤', ev("()=>{const d=__T.mk(); d.spawn=[5,13]; return KB.CUSTOM.check(d).errors.some(s=>s.indexOf('起點在實心')>=0)}"))
    check('沒有終點也沒有魔王 → 錯誤', ev("()=>{const d=__T.mk(); d.exit=null; return KB.CUSTOM.check(d).errors.length>0}"))
    check('有魔王時可以沒有終點旗', ev("()=>{const d=__T.mk(); d.exit=null; d.boss='whispywoods'; return KB.CUSTOM.check(d).errors.length===0}"))
    check('硬磚但沒有鐵鎚 / 石頭來源 → 警告', ev("""()=>{const d=__T.mk(); d.rows[11]=d.rows[11].slice(0,20)+'X'+d.rows[11].slice(21);
      return KB.CUSTOM.check(d).warns.some(s=>s.indexOf('硬磚')>=0)}"""))
    check('放了石頭怪之後硬磚警告消失', ev("""()=>{const d=__T.mk(); d.rows[11]=d.rows[11].slice(0,20)+'X'+d.rows[11].slice(21);
      d.objs=[{t:'rocky',x:8,y:11}]; return !KB.CUSTOM.check(d).warns.some(s=>s.indexOf('硬磚')>=0)}"""))
    check('地面型敵人懸空會警告', ev("()=>{const d=__T.mk(); d.objs=[{t:'waddledee',x:10,y:4}]; return KB.CUSTOM.check(d).warns.some(s=>s.indexOf('懸空')>=0)}"))
    check('水中敵人不在水裡會警告', ev("()=>{const d=__T.mk(); d.objs=[{t:'squishy',x:10,y:8}]; return KB.CUSTOM.check(d).warns.some(s=>s.indexOf('水中敵人')>=0)}"))
    check('不合法資料的檢查回傳錯誤而不是爆掉', ev("()=>{const r=KB.CUSTOM.check({w:1}); return r.errors.length===1}"))

    # ================= F. 縮放 / 捲動 / 幾何 =================
    check('縮放會在 ZOOMS 之間循環', ev("""()=>{const s=KB.EDITOR.state; const seen=[]; for(let i=0;i<KB.EDITOR.ZOOMS.length;i++) seen.push(s.cycleZoom(1));
      return KB.EDITOR.ZOOMS.every(z=>seen.indexOf(z)>=0)}"""))
    check('鏡頭被夾在地圖範圍內', ev("()=>{const s=KB.EDITOR.state; s.cam.x=99999; s.cam.y=-500; s.clampCam(); const m=s.maxCam(); return s.cam.x===m.x && s.cam.y===0}"))
    check('螢幕座標 → 格子座標 → 螢幕座標 一致', ev("""()=>{const s=KB.EDITOR.state; s.zoom=16; s.cam.x=32; s.cam.y=16; s.clampCam();
      const c=s.cellAt(100,100); if(!c) return false; const p=s.screenOf(c.x,c.y);
      return 100-p.x>=0 && 100-p.x<16 && 100-p.y>=0 && 100-p.y<16}"""))
    check('編輯區外的點不算格子', ev("()=>{const s=KB.EDITOR.state; return s.cellAt(10,2)===null && s.cellAt(10,200)===null}"))
    check('游標走到邊緣會自動捲動', ev("""()=>{const s=KB.EDITOR.state; s.cam.x=0; s.cur={x:0,y:5}; s.clampCam();
      for(let i=0;i<40;i++) s.moveCursor(1,0); return s.cam.x>0}"""))
    check('工具列 8 顆按鍵命中測試正確', ev("""()=>{let ok=true; for(let i=0;i<KB.EDITOR.TOOLS.length;i++){const r=KB.EDITOR.toolRect(i);
      ok = ok && KB.EDITOR.toolAt(r.x+r.w/2, r.y+r.h/2)===i;} return ok && KB.EDITOR.toolAt(2,2)<0}"""))
    check('工具列按鍵不重疊且在畫面內', ev("""()=>{const n=KB.EDITOR.TOOLS.length, b=KB.EDITOR.BTN, r0=KB.EDITOR.toolRect(0), rn=KB.EDITOR.toolRect(n-1);
      return r0.x>=0 && rn.x+rn.w<=256 && rn.y+rn.h<=224 && b>=28}"""))
    check('改尺寸會保留既有內容', ev("""()=>{const s=new KB.EDITOR.EditorState(__T.mk(),-1); s.setBrush({kind:'tile',ch:'#'}); s.paint(5,5);
      s.resize(80,20); return s.data.w===80 && s.data.h===20 && s.tile(5,5)==='#'}"""))
    check('縮小尺寸會丟掉界外物件', ev("""()=>{const s=new KB.EDITOR.EditorState(KB.CUSTOM.blank(96,14),-1); s.setBrush({kind:'obj',t:'waddledee'}); s.paint(90,11);
      s.resize(32,14); return s.data.objs.length===0}"""))
    check('換主題會清掉該主題沒有的裝飾字元', ev("""()=>{const s=new KB.EDITOR.EditorState(__T.mk(),-1); s.setBrush({kind:'deco',ch:'t'}); s.paint(5,11);
      s.setTheme('cloud'); return s.decoAt(5,11)==='.'}"""))

    # ================= G. 測玩往返 =================
    ev("""()=>{const s=new KB.EDITOR.EditorState(KB.CUSTOM.blank(64,14),-1);
      s.setName('測玩關'); s.setBrush({kind:'obj',t:'waddledee'}); s.paint(12,11);
      s.setBrush({kind:'tile',ch:'#'}); s.paint(20,11); s.paint(20,10);
      s.zoom=24; s.cur={x:20,y:10}; s.centerOnCursor();
      KB.setScene(new KB.EditorScene(s)); __kb.step(2);}""")
    before = ev("()=>JSON.stringify({rows:KB.EDITOR.state.data.rows,cur:KB.EDITOR.state.cur,zoom:KB.EDITOR.state.zoom,undo:KB.EDITOR.state.undoStack.length})")
    ev("()=>{KB.scene.doTest(); __kb.step(30);}")
    check('測玩會進 CustomGameScene', ev("()=>KB.scene.constructor.name==='CustomGameScene'"))
    check('測玩中的 testing() 為 true', ev("()=>KB.EDITOR.testing()===true"))
    check('測玩關卡 id 為 custom_test', ev("()=>KB.game.levelId===KB.EDITOR.TEST_ID"))
    check('遊戲的 TileMap 尺寸與編輯資料一致', ev("()=>KB.game.map.w===64 && KB.game.map.h===14"))
    check('遊戲地圖內容與編輯資料逐列相同', ev("()=>KB.game.map.rows.map(r=>r.join('')).join('|')===KB.EDITOR.state.data.rows.join('|')"))
    check('卡比出生在起點格', ev("()=>Math.floor(KB.player.x/16)===KB.EDITOR.state.data.spawn[0]"), ev("()=>Math.floor(KB.player.x/16)"))
    check('放的敵人有被生成出來', ev("()=>KB.game.entities.some(e=>e.name==='waddledee')"))
    check('終點旗變成過關門', ev("()=>KB.game.entities.some(e=>e.type==='door' && e.exit)"))
    check('測玩不會寫進本體存檔 cleared', ev("()=>!(KB.save.cleared && KB.save.cleared[KB.EDITOR.TEST_ID])"))
    ev("()=>{__kb.tap('start',2); __kb.step(4);}")
    check('暫停選單把「回到地圖」換成「回編輯」', ev("()=>KB.scene.pauseMenu.items.some(i=>i.id==='editor' && i.label==='回編輯')"))
    ev("()=>{KB.EDITOR.backToEditor(); __kb.step(2);}")
    check('回編輯器後場景正確', ev("()=>KB.scene.constructor.name==='EditorScene'"))
    after = ev("()=>JSON.stringify({rows:KB.EDITOR.state.data.rows,cur:KB.EDITOR.state.cur,zoom:KB.EDITOR.state.zoom,undo:KB.EDITOR.state.undoStack.length})")
    check('回編輯器保留地圖 / 游標 / 縮放 / 復原堆疊', before == after)
    check('回編輯器後 testing() 變回 false', ev("()=>KB.EDITOR.testing()===false"))
    check('有錯誤時測玩會被擋在檢查頁', ev("""()=>{const s=KB.EDITOR.state; s.data.exit=null; s.data.boss='';
      KB.scene.doTest(); const blocked = KB.scene.constructor.name==='EditorScene' && s.page==='check';
      s.data.exit=[60,11]; s.page='map'; return blocked}"""))
    # 從自製關卡選單正式遊玩 → 過關會寫排行
    ev("""()=>{KB.CUSTOM.delSlot(2); const d=KB.CUSTOM.blank(32,14); d.name='排行關'; KB.CUSTOM.setSlot(2,d);
      KB.EDITOR.playSlot(2); __kb.step(10);}""")
    check('從自製關卡選單遊玩會載入該槽位', ev("()=>KB.scene.constructor.name==='CustomGameScene' && KB.game.levelId===KB.EDITOR.PLAY_ID && KB.game.level.name==='排行關'"))
    check('正式遊玩不是測玩模式', ev("()=>KB.EDITOR.testing()===false && KB.scene.rankSlot===2"))
    ev("()=>{KB.scene.timeAlive=1234; KB.scene.score=5000; KB.scene.levelClear(); __kb.step(2);}")
    check('過關會寫進該槽位的排行', ev("()=>{const b=KB.CUSTOM.best(2); return b.length>0 && b[0].time===1234 && b[0].score===5000}"))
    check('過關不會寫進本體存檔 cleared', ev("()=>!(KB.save.cleared && KB.save.cleared[KB.EDITOR.PLAY_ID])"))
    ev("()=>{KB.scene.finish('clear'); __kb.step(2);}")
    check('正式遊玩結束回到自製關卡選單', ev("()=>KB.scene.constructor.name==='CustomLevelsScene'"))

    # ================= H. 選單入口 / 場景 =================
    ev("()=>{__kb.goto('title',{}); __kb.step(4); KB.scene.menu=new KB.TitleMenu(); __kb.step(2);}")
    check('標題選單有「關卡編輯器」', ev("()=>KB.scene.menu.items.some(i=>i.id==='editor' && i.label==='關卡編輯器')"))
    check('標題選單有「自製關卡」', ev("()=>KB.scene.menu.items.some(i=>i.id==='custom' && i.label==='自製關卡')"))
    ev("()=>{__kb.goto('custom',{}); __kb.step(4);}")
    check('自製關卡選單場景可開', ev("()=>KB.scene.constructor.name==='CustomLevelsScene'"))
    check('自製關卡選單按鍵命中區在畫面內', ev("""()=>{const s=KB.scene; const r=s.btnRect(6); return r.x+r.w<=256 && r.y+r.h<=224 && r.h>=28}"""))
    check('刪除需要確認', ev("()=>{const s=KB.scene; s.sel=0; s.act('del'); const c=s.confirm; s.doConfirm(false); return c===true && !!KB.CUSTOM.slot(0)}"))
    check('確認後真的刪掉', ev("()=>{const s=KB.scene; s.sel=0; s.act('del'); s.doConfirm(true); return KB.CUSTOM.slot(0)===null}"))
    check('空槽位不能遊玩', ev("()=>{const s=KB.scene; s.sel=0; s.act('play'); return KB.scene===s}"))
    check('TileMap.fromData 與遊戲建關路徑等價', ev("""()=>{const d=KB.CUSTOM.blank(32,14); const a=KB.TileMap.fromData(d);
      const lv=KB.CUSTOM.toLevel(d,'x'); const b=new KB.TileMap(lv.rooms[0].map, lv.rooms[0].deco);
      return a.w===b.w && a.h===b.h && a.rows.map(r=>r.join('')).join('|')===b.rows.map(r=>r.join('')).join('|')}"""))
    check('繪製所有頁面都不會丟錯', ev("""()=>{KB.setScene(new KB.EditorScene(KB.CUSTOM.blank())); __kb.step(2);
      const s=KB.EDITOR.state; const sc=KB.scene; sc.chk=s.check(); sc.share=s.shareCode();
      for (const p of ['map','palette','menu','check','share','help']) { s.page=p; __kb.step(1); __kb.render(); }
      s.page='map'; return true}"""))

    # ================= I. 桌機滑鼠 / 滾輪 / 快速鍵 =================
    ev("()=>{KB.setScene(new KB.EditorScene(KB.CUSTOM.blank(64,14))); __kb.step(2); const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.cam.x=0; s.cam.y=0; s.clampCam();}")
    L = ev("()=>KB.layout")
    c2 = lambda cx, cy: (L['x'] + cx * L['scale'], L['y'] + cy * L['scale'])
    x0, y0 = c2(40, 60); x1, _ = c2(140, 60)
    pg.mouse.move(x0, y0); pg.mouse.down()
    for i in range(1, 9):
        pg.mouse.move(x0 + (x1 - x0) * i / 8, y0); ev("(n)=>__kb.step(n)", 1)
    pg.mouse.up(); ev("(n)=>__kb.step(n)", 2)
    painted = ev("()=>{const s=KB.EDITOR.state; const c=s.cellAt(40,60); return s.data.rows[c.y].split('#').length-1}")
    check('桌機：滑鼠拖曳連續畫多格', painted >= 5, painted)
    mx, my = c2(60, 60)
    pg.mouse.move(mx, my); pg.mouse.down(button='right'); ev("(n)=>__kb.step(n)", 2); pg.mouse.up(button='right'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：右鍵＝橡皮擦', ev("()=>{const s=KB.EDITOR.state; const c=s.cellAt(60,60); return s.tile(c.x,c.y)==='.'}"))
    cam0 = ev("()=>KB.EDITOR.state.cam.x")
    pg.mouse.move(*c2(128, 100)); pg.mouse.wheel(60, 0); ev("(n)=>__kb.step(n)", 2)
    check('桌機：滾輪捲動地圖', ev("()=>KB.EDITOR.state.cam.x") > cam0)
    z0 = ev("()=>KB.EDITOR.state.zoom")
    pg.keyboard.down('Shift'); pg.mouse.wheel(0, 60); pg.keyboard.up('Shift'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：Shift+滾輪縮放', ev("()=>KB.EDITOR.state.zoom") != z0)
    pg.keyboard.press('KeyU'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：U ＝ 復原', ev("()=>KB.EDITOR.state.canRedo"))
    pg.keyboard.press('KeyY'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：Y ＝ 重做', ev("()=>!KB.EDITOR.state.canRedo"))
    pg.keyboard.press('KeyP'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：P 開調色盤', ev("()=>KB.EDITOR.state.page==='palette'"))
    pg.keyboard.press('Escape'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：ESC 從子頁回地圖頁', ev("()=>KB.EDITOR.state.page==='map'"))
    pg.keyboard.press('Escape'); ev("(n)=>__kb.step(n)", 2)
    check('桌機：ESC 在地圖頁開編輯器選單', ev("()=>KB.EDITOR.state.page==='menu'"))
    ev("()=>{KB.EDITOR.state.page='map';}")

    # localStorage 跨載入保存
    ev("()=>{const d=KB.CUSTOM.blank(); d.name='重載測試'; KB.CUSTOM.setSlot(4,d);}")
    # ================= G. fix12（R12-P3-01 / P3-04）=================
    check('audio 真的實作了 error 音效（原創短音效）',
          ev("()=>KB.audio.SFX_NAMES.indexOf('error')>=0"))
    check('sfx(\'error\') 不再印 unknown sfx 警告',
          ev("()=>{let bad=0; const w=console.warn; console.warn=(...a)=>{if(String(a[0]).indexOf('unknown sfx')>=0)bad++;};"
             " try{KB.audio.sfx('error');}finally{console.warn=w;} return bad===0}"))
    share = ev("""()=>{
      const UI=KB.UI, E=KB.EDITOR;
      const tipX = E.BAR.x + 3*E.BTN + 6, avail = 256 - tipX - 4;
      const s = UI.hint('attack','X') + ' 複製　' + UI.hint('select','SHIFT') + ' 匯入';
      return {s, w: Math.round(UI.textWidth(s, {size:12})), avail};
    }""")
    check('分享碼頁提示行放得下（不會被 fitText 截成「SHIFT 貼…」）',
          share['w'] <= share['avail'], share)
    src_ui = (ROOT / 'src' / 'editor_ui.js').read_text(encoding='utf-8')
    check('分享碼頁提示文案已改成與按鍵同名的「匯入」', '貼上匯入' not in src_ui)
    check('editor_ui 的 sfx(\'error\') 呼叫點都還在（音效已實作，不再是空包彈）',
          src_ui.count("sfx('error')") >= 8, src_ui.count("sfx('error')"))
    check('分享碼頁真的畫得出來（開 share 頁不丟例外）',
          ev("""()=>{ __kb.goto('editor',{}); __kb.step(4); const sc=KB.scene;
            sc.share=KB.EDITOR.state.shareCode(); KB.EDITOR.state.page='share';
            sc.draw(KB.ctx); KB.EDITOR.state.page='map'; return sc.share.indexOf('KBL1.')===0 }"""))

    pg.goto(URL)
    pg.wait_for_function('()=>window.__kb && KB.CUSTOM')
    check('重新載入後自製關卡仍在 localStorage', pg.evaluate("()=>{const d=KB.CUSTOM.slot(4); return !!d && d.name==='重載測試'}"))


# ----------------------------------------------------------------------
# 手機（iPhone 13 橫向）：工具列尺寸 / 觸控畫筆 / 兩指捲動
# ----------------------------------------------------------------------
class Touch:
    def __init__(self, cdp): self.cdp = cdp; self.pts = {}
    def _send(self, typ, changed):
        pts = [{'x': x, 'y': y, 'id': i} for i, (x, y) in self.pts.items()]
        if typ == 'touchEnd': pts = [p for p in pts if p['id'] != changed]
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})
    def down(self, i, x, y): self.pts[i] = (x, y); self._send('touchStart', i)
    def move(self, i, x, y): self.pts[i] = (x, y); self._send('touchMove', i)
    def up(self, i): self._send('touchEnd', i); self.pts.pop(i, None)


def mobile(p, errs):
    dev = dict(p.devices['iPhone 13 landscape'])
    b = p.chromium.launch(); ctx = b.new_context(**dev); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('[mobile] ' + str(e)))
    pg.goto(URL)
    pg.wait_for_function('()=>window.__kb && KB.EDITOR && KB.EditorScene')
    pg.evaluate("()=>__kb.goto('editor',{})")
    pg.evaluate("(n)=>__kb.step(n)", 20)
    L = pg.evaluate("()=>KB.layout")
    css = lambda cx, cy: (L['x'] + cx * L['scale'], L['y'] + cy * L['scale'])
    cdp = ctx.new_cdp_session(pg); t = Touch(cdp)

    btn_css = 29 * L['scale']
    check('手機：編輯器工具列按鍵 ≥ 44 CSS px', btn_css >= 44, round(btn_css, 1))
    check('手機：工具列整排在畫布內', pg.evaluate("()=>{const r=KB.EDITOR.toolRect(KB.EDITOR.TOOLS.length-1); return r.x+r.w<=256}"))
    check('手機：觸控覆蓋層與編輯器並存（畫布外）',
          pg.evaluate("()=>{const r=KB.TOUCH?KB.TOUCH.rects():null; if(!r) return true; const L=KB.layout; return Object.keys(r).every(k=>r[k].x+r[k].w<=L.x+2 || r[k].x>=L.x+L.w-2 || r[k].y>=L.y+L.h-2);}"))

    pg.evaluate("()=>{const s=KB.EDITOR.state; s.setBrush({kind:'tile',ch:'#'}); s.cam.x=0; s.cam.y=0; s.clampCam();}")
    before = pg.evaluate("()=>KB.EDITOR.state.data.rows.join('')")
    x, y = css(100, 100); t.down(0, x, y); pg.evaluate("(n)=>__kb.step(n)", 2); t.up(0)
    pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：單指點一下就畫得下去', pg.evaluate("()=>KB.EDITOR.state.data.rows.join('')") != before)
    cell = pg.evaluate("()=>KB.EDITOR.state.cellAt(100,100)")
    check('手機：點下去的格子就是畫到的格子',
          pg.evaluate("(c)=>KB.EDITOR.state.tile(c.x,c.y)==='#'", cell), json.dumps(cell))

    n0 = pg.evaluate("()=>KB.EDITOR.state.data.rows.join('').split('#').length")
    x2, _ = css(170, 100)
    t.down(0, x, y)
    for i in range(1, 8):
        t.move(0, x + (x2 - x) * i / 7, y); pg.evaluate("(n)=>__kb.step(n)", 1)
    t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    n1 = pg.evaluate("()=>KB.EDITOR.state.data.rows.join('').split('#').length")
    check('手機：拖曳可以連續畫多格', n1 > n0 + 2, '%d → %d' % (n0 - 1, n1 - 1))

    cam0 = pg.evaluate("()=>KB.EDITOR.state.cam.x")
    snap0 = pg.evaluate("()=>KB.EDITOR.state.data.rows.join('')")
    ax, ay = css(120, 80); bx, by = css(180, 120)
    t.down(1, ax, ay); t.down(2, bx, by); pg.evaluate("(n)=>__kb.step(n)", 1)
    for i in range(1, 10):
        t.move(1, ax - i * 8, ay); t.move(2, bx - i * 8, by); pg.evaluate("(n)=>__kb.step(n)", 1)
    t.up(1); t.up(2); pg.evaluate("(n)=>__kb.step(n)", 2)
    cam1 = pg.evaluate("()=>KB.EDITOR.state.cam.x")
    check('手機：兩指拖曳會捲動地圖', cam1 > cam0, '%s → %s' % (cam0, round(cam1, 1)))
    check('手機：兩指捲動期間不會畫到格子', pg.evaluate("()=>KB.EDITOR.state.data.rows.join('')") == snap0)

    # ---- fix12（R12-P2-03）：第二指晚 N 幀落下也不能誤畫一格 ----
    rows = lambda: pg.evaluate("()=>KB.EDITOR.state.data.rows.join('')")
    undoN = lambda: pg.evaluate("()=>KB.EDITOR.state.undoStack.length")
    for gap in (0, 1, 2, 3, 10):
        pg.evaluate("()=>{const s=KB.EDITOR.state; s.cam.x=0; s.clampCam(); s.setBrush({kind:'tile',ch:'#'});}")
        pg.evaluate("(n)=>__kb.step(n)", 2)
        snap, u0, c0 = rows(), undoN(), pg.evaluate("()=>KB.EDITOR.state.cam.x")
        ax, ay = css(120, 80); bx, by = css(180, 120)
        t.down(1, ax, ay)
        if gap: pg.evaluate("(n)=>__kb.step(n)", gap)
        t.down(2, bx, by); pg.evaluate("(n)=>__kb.step(n)", 1)
        for i in range(1, 10):
            t.move(1, ax - i * 8, ay); t.move(2, bx - i * 8, by); pg.evaluate("(n)=>__kb.step(n)", 1)
        t.up(1); t.up(2); pg.evaluate("(n)=>__kb.step(n)", 2)
        same, u1, c1 = rows() == snap, undoN(), pg.evaluate("()=>KB.EDITOR.state.cam.x")
        check('手機：兩指捲動第二指晚 %d 幀也不誤畫（fix12 / R12-P2-03）' % gap, same,
              '' if same else 'rows 變了')
        check('手機：第二指晚 %d 幀也不留多餘復原點' % gap, u1 == u0, '%d → %d' % (u0, u1))
        check('手機：第二指晚 %d 幀仍然捲得動鏡頭' % gap, c1 > c0, '%s → %s' % (c0, round(c1, 1)))
    # 單指照樣畫得下去（證明上面不是「乾脆都不畫」）
    pg.evaluate("()=>{const s=KB.EDITOR.state; s.cam.x=0; s.clampCam();}")
    snap = rows()
    x1, y1 = css(100, 90)
    t.down(0, x1, y1); pg.evaluate("(n)=>__kb.step(n)", 8); t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：單指按住 8 幀（> 落筆延遲）照樣畫得下去', rows() != snap)
    snap = rows()
    x2, y2 = css(140, 110)
    t.down(0, x2, y2); t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：單指「點一下就放開」也照樣畫得下去（不被延遲吃掉）', rows() != snap)

    z0 = pg.evaluate("()=>KB.EDITOR.state.zoom")
    tr = pg.evaluate("()=>KB.EDITOR.toolRect(3)")
    x, y = css(tr['x'] + tr['w'] / 2, tr['y'] + tr['h'] / 2)
    t.down(0, x, y); pg.evaluate("(n)=>__kb.step(n)", 2); t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：點工具列的「縮放」有作用', pg.evaluate("()=>KB.EDITOR.state.zoom") != z0)

    tr = pg.evaluate("()=>KB.EDITOR.toolRect(0)")
    x, y = css(tr['x'] + tr['w'] / 2, tr['y'] + tr['h'] / 2)
    t.down(0, x, y); pg.evaluate("(n)=>__kb.step(n)", 2); t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：點「筆刷」會開調色盤', pg.evaluate("()=>KB.EDITOR.state.page==='palette'"))
    cellr = pg.evaluate("()=>KB.scene.palRects().cells[2]")
    check('手機：調色盤格子 ≥ 44 CSS px', cellr['w'] * L['scale'] >= 44, round(cellr['w'] * L['scale'], 1))
    x, y = css(cellr['x'] + cellr['w'] / 2, cellr['y'] + cellr['h'] / 2)
    t.down(0, x, y); pg.evaluate("(n)=>__kb.step(n)", 2); t.up(0); pg.evaluate("(n)=>__kb.step(n)", 2)
    check('手機：點調色盤格子會選到筆刷並關閉', pg.evaluate("()=>KB.EDITOR.state.page==='map'"))

    pg.evaluate("()=>{KB.setScene(new KB.CustomLevelsScene(0)); __kb.step(4);}")
    br = pg.evaluate("()=>KB.scene.btnRect(0)")
    check('手機：自製關卡選單按鍵 ≥ 44 CSS px', min(br['w'], br['h']) * L['scale'] >= 44,
          round(min(br['w'], br['h']) * L['scale'], 1))
    b.close()


def main():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 256, 'height': 224})
        pg.on('pageerror', lambda e: errs.append('[pageerror] ' + str(e)))
        pg.on('console', lambda m: errs.append('[console] ' + m.text) if m.type == 'error' else None)
        desktop(pg)
        b.close()
        mobile(p, errs)
    check('全程沒有 JS 例外 / console error', not errs, '; '.join(errs[:4]))
    ok = sum(1 for _, c, _ in results if c)
    print('\n== %d / %d PASS ==' % (ok, len(results)))
    bad = [n for n, c, _ in results if not c]
    if bad:
        print('FAILED:')
        for n in bad: print('  - ' + n)
    sys.exit(0 if not bad else 1)


if __name__ == '__main__':
    main()
