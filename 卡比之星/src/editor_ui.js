// 關卡編輯器 — 畫面 / 輸入（Round 12，agent: level-editor）
// ============================================================================
// KB.EditorScene         標題選單「關卡編輯器」→ 格子畫筆 / 物件放置 / 縮放捲動 / 復原重做 /
//                        測玩 / 存 localStorage 多槽 / 分享碼 / 可達性檢查
// KB.CustomLevelsScene   標題選單「自製關卡」→ 遊玩 / 編輯 / 刪除 / 排行 / 匯入分享碼
//
// 操作（鍵盤 / 觸控皆可）：
//   方向鍵 / 搖桿  移動游標（走到邊緣自動捲動）      A（Z）畫　B（X）擦　C（Shift）吸管
//   START（Enter / ESC）選單　滑鼠 / 手指 直接點格子畫（拖曳連續畫）　兩指拖曳 捲動
//   滾輪 捲動　Shift+滾輪 縮放　U 復原　Y 重做　P 筆刷　T 測玩　Ctrl+S 存檔
// ============================================================================
(function () {
  'use strict';
  const W = KB.W, H = KB.H;
  const U = () => KB.UI;
  const E = KB.EDITOR, CU = KB.CUSTOM;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };
  const has = n => !!(KB.SPR && KB.SPR[n]);
  const mmss = f => {
    const s = Math.floor((f | 0) / 60);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  // ---------- 文字輸入（分享碼 / 關卡名）：預設用 window.prompt，測試可覆蓋 KB.EDITOR.ask ----------
  E.ask = function (msg, def) {
    try { return window.prompt(msg, def === undefined ? '' : def); } catch (e) { return null; }
  };
  E.copyText = function (s) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s); ok = true; }
    } catch (e) { }
    if (!ok) try {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select();
      ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { }
    E.lastCopied = s;
    return !!ok;
  };

  // ======================================================================
  // 繪圖小工具
  // ======================================================================
  function btn(ctx, r, label, o) {
    o = o || {};
    const UI = U(), C = UI.C;
    const fill = o.on ? '#2c4878' : (o.grey ? '#141a2c' : '#1c2440');
    KB.rect(ctx, r.x, r.y, r.w, r.h, o.sel ? C.yellow : '#50608c');
    KB.rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, fill);
    KB.rect(ctx, r.x + 1, r.y + 1, r.w - 2, 1, 'rgba(255,255,255,0.16)');
    if (label) UI.fitText(ctx, label, r.x + r.w / 2, r.y + (o.labelY === undefined ? (r.h - 12) / 2 : o.labelY), r.w - 2,
      { color: o.grey ? '#56607c' : (o.sel ? C.yellow : '#e8f0ff'), align: 'center', size: 12 });
  }

  function tileGlyph(ctx, ch, cx, cy, theme) {
    // 用實際遊戲磁磚精靈畫預覽（沒有對應精靈的字元畫色塊 + 字）
    const map = {
      '#': 'tile_' + theme + '_fill', '=': 'tile_' + theme + '_platform', '/': 'tile_' + theme + '_slopeL',
      '\\': 'tile_' + theme + '_slopeR', '*': 'tile_star', 'B': 'tile_bomb', 'X': 'tile_hardblock',
      'I': 'tile_iceblock', 'W': 'tile_woodbox', 'F': 'tile_fuse', '^': 'tile_spike', '~': 'tile_water_top',
      'H': 'tile_ladder',
    };
    let nm = map[ch];
    if (nm && !has(nm) && nm.indexOf('tile_' + theme) === 0) nm = nm.replace('tile_' + theme, 'tile_green');
    if (ch === '.') {
      KB.rect(ctx, cx - 7, cy - 7, 14, 14, '#101828');
      KB.rect(ctx, cx - 6, cy - 6, 12, 12, '#1a2238');
      return;
    }
    ctx.save(); ctx.translate(cx, cy);
    if (nm && has(nm)) KB.drawSpr(ctx, nm, -8, -8, { t: 0, _tl: true });
    else { KB.rect(ctx, -7, -7, 14, 14, '#404c70'); KB.text(ctx, ch, 0, -3, { color: '#fff', align: 'center' }); }
    ctx.restore();
  }
  function decoGlyph(ctx, ch, cx, cy, theme) {
    if (ch === '.') { KB.rect(ctx, cx - 7, cy - 7, 14, 14, '#101828'); KB.text(ctx, 'X', cx, cy - 3, { color: '#8090b0', align: 'center' }); return; }
    const nm = has('deco_' + theme + '_' + ch) ? 'deco_' + theme + '_' + ch : (has('deco_' + ch) ? 'deco_' + ch : null);
    if (nm) { ctx.save(); ctx.translate(cx, cy + 8); KB.drawSpr(ctx, nm, 0, 0, { t: 0 }); ctx.restore(); }
    else { KB.rect(ctx, cx - 6, cy - 6, 12, 12, '#2c6030'); KB.text(ctx, ch, cx, cy - 3, { color: '#fff', align: 'center' }); }
  }
  function objGlyph(ctx, def, cx, cy) {
    if (def && def.spr && has(def.spr)) { ctx.save(); ctx.translate(cx, cy + 8); KB.drawSpr(ctx, def.spr, 0, 0, { t: 0 }); ctx.restore(); return; }
    KB.rect(ctx, cx - 6, cy - 6, 12, 12, '#a04060');
  }

  // ======================================================================
  // 編輯器場景
  // ======================================================================
  E.makeState = function (arg) {
    if (arg instanceof E.EditorState) return arg;
    if (typeof arg === 'number') {
      const d = CU.slot(arg);
      return new E.EditorState(d || CU.blank(), d ? arg : -1);
    }
    if (arg && arg.data && arg.cam) return arg;                     // 已是 state 形狀
    if (arg && typeof arg.slot === 'number') {
      const d = CU.slot(arg.slot);
      return new E.EditorState(d || CU.blank(), d ? arg.slot : -1);
    }
    if (arg && arg.rows) return new E.EditorState(arg, -1);
    return new E.EditorState(CU.blank(), -1);
  };

  const REPEAT_DELAY = 14, REPEAT_EVERY = 4;
  // fix12（R12-P2-03）：第一指落下後先別畫 —— 等 PEND_FRAMES 幀（≈100ms）或移動 ≥ PEND_MOVE 內部像素
  // 才確定「這是單指畫筆」；期間第二指落下就直接取消（連已畫的格子一起還原，見 cancelStroke）。
  const PEND_FRAMES = 6, PEND_MOVE = 2.5;

  class EditorScene {
    constructor(arg) {
      this.st = E.makeState(arg);
      E.state = this.st;
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.rep = { dir: '', t: 0 };
      this.pal = { tab: this.st.tab || 'base', idx: 0 };
      this.menuSel = 0; this.confirm = null; this.chk = null; this.share = '';
      this.ptrs = new Map(); this.panMode = false; this.painting = 0; this.lastPan = null; this.pend = null;
      this.strokeN = 0; this.strokeSnap = null; this.strokeUndo = -1;    // fix12：本筆已畫幾格 / 開筆前的快照
      this.helpPage = 0;
    }
    enter() {
      music('select');
      this.bind();
      try { if (KB.TOUCH && KB.TOUCH.show && KB.TOUCH.available) KB.TOUCH.show(); } catch (e) { }
      zoneTouch(false);     // 浮動搖桿的隱形感應區會蓋住畫布左下角（工具列）→ 編輯器期間停用
    }
    exit() { this.unbind(); zoneTouch(true); }

    // ---------- DOM 輸入（滑鼠 / 手指 / 滾輪 / 快速鍵） ----------
    bind() {
      if (this._bound) return;
      const c = KB.canvas; if (!c) return;
      this._onDown = e => this.ptrDown(e);
      this._onMove = e => this.ptrMove(e);
      this._onUp = e => this.ptrUp(e);
      this._onWheel = e => this.wheel(e);
      this._onKey = e => this.keydown(e);
      this._onCtx = e => { e.preventDefault(); };
      c.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      window.addEventListener('pointercancel', this._onUp);
      c.addEventListener('wheel', this._onWheel, { passive: false });
      c.addEventListener('contextmenu', this._onCtx);
      window.addEventListener('keydown', this._onKey);
      this._bound = true;
    }
    unbind() {
      if (!this._bound) return;
      const c = KB.canvas;
      if (c) {
        c.removeEventListener('pointerdown', this._onDown);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('contextmenu', this._onCtx);
      }
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerup', this._onUp);
      window.removeEventListener('pointercancel', this._onUp);
      window.removeEventListener('keydown', this._onKey);
      this._bound = false;
    }
    /** viewport CSS px → 內部像素（256×224） */
    toCanvas(e) {
      const c = KB.canvas; if (!c) return { x: 0, y: 0 };
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0 };
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }
    ptrDown(e) {
      const p = this.toCanvas(e);
      this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
      if (this.ptrs.size >= 2) {           // 兩指 → 捲動模式
        this.panMode = true; this.painting = 0; this.pend = null;
        // fix12：第二指晚落下時，第一指可能已經畫了幾格 ⇒ 整筆還原（含復原點），不留雜點
        if (this.strokeN > 0 && this.strokeSnap) this.st.cancelStroke(this.strokeSnap, this.strokeUndo);
        this.st.endStroke();
        this.strokeN = 0; this.strokeSnap = null; this.strokeUndo = -1;
        this.lastPan = this.pinchCenter();
        return;
      }
      this.tap(p.x, p.y, e.button === 2 || e.ctrlKey);
    }
    /** 延後落筆的第一筆（等第二指；fix12 起是 PEND_FRAMES 幀或移動 ≥ PEND_MOVE 才落） */
    commitPend() {
      const q = this.pend; if (!q) return;
      this.pend = null;
      const st = this.st, cell = st.cellAt(q.x, q.y);
      if (!cell) return;
      st.cur = { x: cell.x, y: cell.y };
      st.beginStroke();
      if (st.paint(cell.x, cell.y, !!q.erase)) this.strokeN++;
    }
    ptrMove(e) {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.toCanvas(e);
      const o = this.ptrs.get(e.pointerId);
      o.x = p.x; o.y = p.y;
      if (this.panMode) {
        const c = this.pinchCenter();
        if (this.lastPan) this.st.scrollBy(this.lastPan.x - c.x, this.lastPan.y - c.y);
        this.lastPan = c;
        return;
      }
      if (this.painting && this.st.page === 'map') {
        if (this.pend) {
          // 還在「等第二指」的空窗：移動夠多才算確定是畫筆（手指只是輕微晃動就先不要畫）
          if (Math.abs(p.x - this.pend.x) + Math.abs(p.y - this.pend.y) < PEND_MOVE) return;
          this.commitPend();
        }
        const cell = this.st.cellAt(p.x, p.y);
        if (cell && this.st.paint(cell.x, cell.y, this.painting === 2)) this.strokeN++;
        if (cell) this.st.cur = { x: cell.x, y: cell.y };
      }
    }
    ptrUp(e) {
      this.ptrs.delete(e.pointerId);
      if (this.pend && !this.panMode) this.commitPend();      // 快速點一下（還沒跑到下一幀就放開）
      if (this.ptrs.size === 0) {
        this.panMode = false; this.lastPan = null; this.painting = 0; this.pend = null; this.st.endStroke();
        this.strokeN = 0; this.strokeSnap = null; this.strokeUndo = -1;
      }
      else if (this.ptrs.size === 1) this.lastPan = this.pinchCenter();
    }
    pinchCenter() {
      let x = 0, y = 0, n = 0;
      this.ptrs.forEach(p => { x += p.x; y += p.y; n++; });
      return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
    }
    wheel(e) {
      e.preventDefault();
      const st = this.st;
      if (e.shiftKey) { st.cycleZoom(e.deltaY > 0 ? -1 : 1); return; }
      st.scrollBy(e.deltaX || 0, e.deltaY || 0);
    }
    keydown(e) {
      if (KB.scene !== this) return;
      const st = this.st, k = e.code;
      if (k === 'Escape') {
        e.preventDefault();
        if (st.page === 'map') { st.page = 'menu'; this.menuSel = 0; sfx('pause'); }
        else { st.page = 'map'; sfx('menu_back'); }
        return;
      }
      if (st.page !== 'map') return;
      if (k === 'KeyU') { this.doUndo(); e.preventDefault(); }
      else if (k === 'KeyY') { this.doRedo(); e.preventDefault(); }
      else if (k === 'KeyP') { this.openPalette(); e.preventDefault(); }
      else if (k === 'KeyT') { this.doTest(); e.preventDefault(); }
      else if (k === 'Tab') { st.cycleZoom(1); e.preventDefault(); }
      else if (k === 'KeyS' && (e.ctrlKey || e.metaKey)) { this.doSave(); e.preventDefault(); }
    }

    // ---------- 點擊分派 ----------
    tap(x, y, erase) {
      const st = this.st;
      if (st.page === 'map') {
        const ti = E.toolAt(x, y);
        if (ti >= 0) { this.tool(E.TOOLS[ti].id); return; }
        const cell = st.cellAt(x, y);
        if (cell) {
          this.painting = erase ? 2 : 1;
          this.pend = { x, y, erase: !!erase, f: 0 };
          this.strokeN = 0; this.strokeSnap = st.snap(); this.strokeUndo = st.undoStack.length;
        }
        return;
      }
      if (st.page === 'palette') { this.palTap(x, y); return; }
      if (st.page === 'menu') { this.menuTap(x, y); return; }
      // check / share / help：點下方按鍵或任意處關閉
      const back = { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN };
      if (st.page === 'share') {
        const r1 = { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN };
        const r2 = { x: E.BAR.x + 2 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN };
        if (inRect(x, y, r1)) { const ok = E.copyText(this.share); st.toast(ok ? '分享碼已複製' : '複製失敗，請手動選取'); sfx('select'); return; }
        if (inRect(x, y, r2)) { this.doImport(); return; }
      }
      if (st.page === 'check' && inRect(x, y, { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN })) { this.chk = st.check(); sfx('select'); return; }
      if (st.page === 'help') {
        const r1 = { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN };
        if (inRect(x, y, r1)) { this.helpPage = (this.helpPage + 1) % 2; sfx('menu'); return; }
      }
      if (inRect(x, y, back) || y < E.BAR.y) { st.page = 'map'; sfx('menu_back'); }
    }

    // ---------- 工具列 ----------
    tool(id) {
      const st = this.st;
      if (id === 'brush') { this.openPalette(); return; }
      if (id === 'undo') { this.doUndo(); return; }
      if (id === 'redo') { this.doRedo(); return; }
      if (id === 'zoom') { sfx('menu'); st.toast('縮放 ' + st.cycleZoom(1) + 'px'); return; }
      if (id === 'test') { this.doTest(); return; }
      if (id === 'check') { this.chk = st.check(); st.page = 'check'; sfx('select'); return; }
      if (id === 'save') { this.doSave(); return; }
      if (id === 'menu') { st.page = 'menu'; this.menuSel = 0; sfx('pause'); return; }
    }
    openPalette() {
      const st = this.st;
      st.page = 'palette'; this.pal.tab = st.tab;
      const list = E.tabBrushes(this.pal.tab);
      this.pal.idx = Math.max(0, list.findIndex(b => this.sameBrush(b, st.brush)));
      sfx('menu');
    }
    sameBrush(a, b) {
      if (!a || !b || a.kind !== b.kind) return false;
      if (a.kind === 'tile' || a.kind === 'deco') return a.ch === b.ch;
      if (a.kind === 'obj') return a.t === b.t;
      return a.m === b.m;
    }
    doUndo() { const ok = this.st.undo(); sfx(ok ? 'menu_back' : 'error'); this.st.toast(ok ? '復原' : '沒有可復原的步驟'); }
    doRedo() { const ok = this.st.redo(); sfx(ok ? 'menu' : 'error'); this.st.toast(ok ? '重做' : '沒有可重做的步驟'); }
    doSave() {
      const st = this.st;
      let i = st.slot;
      if (i < 0) i = CU.firstFree();
      if (i < 0) { st.page = 'menu'; this.menuSel = 0; st.toast('槽位已滿，請在選單選一個槽位覆蓋'); sfx('error'); return; }
      const ok = st.saveTo(i);
      st.toast(ok ? ('已存到第 ' + (i + 1) + ' 槽') : '存檔失敗（localStorage 不可用）');
      sfx(ok ? 'select' : 'error');
    }
    doTest() {
      const st = this.st;
      const r = st.check();
      if (r.errors.length) { this.chk = r; st.page = 'check'; st.toast('有錯誤，先修好才能測玩'); sfx('error'); return; }
      st.tab = this.pal.tab;
      sfx('select');
      E.testPlay(st);
    }
    doImport() {
      const st = this.st;
      const s = E.ask('貼上分享碼：', '');
      if (!s) { st.toast('取消匯入'); return; }
      const ok = st.importCode(s);
      st.toast(ok ? ('已匯入「' + st.data.name + '」') : '分享碼無效（校驗失敗）');
      sfx(ok ? 'select' : 'error');
      if (ok) st.page = 'map';
    }

    // ---------- 調色盤 ----------
    palRects() {
      const tabs = [], cells = [];
      for (let i = 0; i < E.TABS.length; i++) tabs.push({ x: 12 + i * E.BTN, y: 14, w: E.BTN, h: E.BTN });
      const list = E.tabBrushes(this.pal.tab);
      for (let i = 0; i < list.length; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        cells.push({ x: 12 + c * E.BTN, y: 46 + r * E.BTN, w: E.BTN, h: E.BTN, i });
      }
      return { tabs, cells, list };
    }
    palTap(x, y) {
      const { tabs, cells, list } = this.palRects();
      for (let i = 0; i < tabs.length; i++) if (inRect(x, y, tabs[i])) { this.pal.tab = E.TABS[i].id; this.pal.idx = 0; sfx('menu'); return; }
      for (const c of cells) if (inRect(x, y, c)) { this.palPick(list[c.i]); return; }
      // 能力台座 / 大星星的參數鍵
      const ar = { x: 12, y: E.BAR.y, w: E.BTN, h: E.BTN }, br = { x: 12 + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN };
      if (inRect(x, y, ar)) { this.cycleArg(-1); return; }
      if (inRect(x, y, br)) { this.cycleArg(1); return; }
      const ok = { x: 12 + 6 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, bk = { x: 12 + 7 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN };
      if (inRect(x, y, ok) || inRect(x, y, bk)) { this.st.tab = this.pal.tab; this.st.page = 'map'; sfx('menu_back'); }
    }
    palPick(b) {
      if (!b) return;
      const st = this.st;
      st.setBrush(b); st.tab = this.pal.tab;
      const { list } = this.palRects();
      this.pal.idx = Math.max(0, list.findIndex(x => this.sameBrush(x, b)));
      sfx('select');
      st.toast('筆刷：' + st.brushLabel());
      st.page = 'map';
    }
    cycleArg(d) {
      const st = this.st, b = st.brush;
      if (b.kind === 'obj' && b.t === 'essence') {
        const keys = CU.abilityKeys();
        let i = keys.indexOf(st.abilityPick); if (i < 0) i = 0;
        st.abilityPick = keys[(i + d + keys.length) % keys.length];
        sfx('menu'); st.toast('能力星：' + st.abilityPick);
      } else if (b.kind === 'obj' && b.t === 'bigstar') {
        st.starPick = (st.starPick + d + 3) % 3;
        sfx('menu'); st.toast('大星星 ' + (st.starPick + 1));
      } else sfx('error');
    }

    // ---------- 選單頁 ----------
    menuItems() {
      const st = this.st, out = [];
      out.push({ id: 'name', label: '關卡名稱', val: st.data.name });
      out.push({ id: 'theme', label: '主題', val: themeLabel(st.data.theme) });
      out.push({ id: 'width', label: '寬度', val: st.data.w + ' 格' });
      out.push({ id: 'height', label: '高度', val: st.data.h + ' 格' });
      out.push({ id: 'boss', label: '魔王', val: CU.bossLabel(st.data.boss) });
      out.push({ id: 'slot', label: '存到槽位', val: st.slot >= 0 ? ('第 ' + (st.slot + 1) + ' 槽') : '未存' });
      out.push({ id: 'load', label: '讀取槽位' });
      out.push({ id: 'share', label: '分享碼（複製 / 匯入）' });
      out.push({ id: 'check', label: '檢查關卡（可達性）' });
      out.push({ id: 'clear', label: '清空重來' });
      out.push({ id: 'help', label: '操作說明' });
      out.push({ id: 'exit', label: '離開編輯器' });
      return out;
    }
    menuRect(i) { return { x: 14, y: 30 + i * 13, w: 228, h: 13 }; }
    menuTap(x, y) {
      const items = this.menuItems();
      for (let i = 0; i < items.length; i++) if (inRect(x, y, this.menuRect(i))) { this.menuSel = i; this.menuDo(items[i], 0); return; }
      if (inRect(x, y, { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN })) { this.st.page = 'map'; sfx('menu_back'); return; }
      if (inRect(x, y, { x: E.BAR.x + 6 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN })) { this.menuDo(items[this.menuSel], -1); return; }
      if (inRect(x, y, { x: E.BAR.x + 7 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN })) { this.menuDo(items[this.menuSel], 1); return; }
    }
    menuDo(it, dir) {
      const st = this.st;
      if (!it) return;
      if (it.id === 'theme') {
        const ks = CU.THEME_KEYS; let i = ks.indexOf(st.data.theme);
        st.setTheme(ks[(i + (dir || 1) + ks.length) % ks.length]); sfx('menu'); return;
      }
      if (it.id === 'width') { st.resize(st.data.w + (dir || 1) * 8, st.data.h); sfx('menu'); return; }
      if (it.id === 'height') { st.resize(st.data.w, st.data.h + (dir || 1) * 2); sfx('menu'); return; }
      if (it.id === 'boss') {
        const ks = CU.BOSSES.map(b => b.k); let i = ks.indexOf(st.data.boss || '');
        st.setBoss(ks[(i + (dir || 1) + ks.length) % ks.length]); sfx('menu'); return;
      }
      if (it.id === 'slot') {
        const n = CU.SLOTS;
        let i = st.slot < 0 ? -1 : st.slot;
        i = (i + (dir || 1) + n + 1) % (n + 1) - 1;    // -1 = 未存
        if (i < 0) { st.slot = -1; st.toast('未指定槽位'); }
        else { st.slot = i; st.toast('槽位 ' + (i + 1) + (CU.slot(i) ? '（已有關卡，存檔會覆蓋）' : '（空）')); }
        sfx('menu'); return;
      }
      if (dir) return;      // 以下為「確認」才動作的項目
      if (it.id === 'name') {
        const s = E.ask('關卡名稱（最多 16 字）：', st.data.name);
        if (s === null || s === undefined) { st.toast('取消'); return; }
        st.toast(st.setName(s) ? ('名稱：' + st.data.name) : '名稱沒變'); sfx('select'); return;
      }
      if (it.id === 'load') {
        const d = CU.slot(st.slot < 0 ? 0 : st.slot);
        if (!d) { st.toast('該槽位是空的'); sfx('error'); return; }
        st.loadFrom(st.slot < 0 ? 0 : st.slot);
        st.toast('已讀取「' + st.data.name + '」'); st.page = 'map'; sfx('select'); return;
      }
      if (it.id === 'share') { this.share = st.shareCode(); st.page = 'share'; sfx('select'); return; }
      if (it.id === 'check') { this.chk = st.check(); st.page = 'check'; sfx('select'); return; }
      if (it.id === 'clear') {
        st.push();
        st.data = CU.blank(st.data.w, st.data.h, st.data.theme);
        st.data.name = '自製關卡'; st.dirty = true; st.clampCam();
        st.toast('已清空'); st.page = 'map'; sfx('select'); return;
      }
      if (it.id === 'help') { st.page = 'help'; this.helpPage = 0; sfx('select'); return; }
      if (it.id === 'exit') {
        sfx('menu_back');
        const UI = U();
        const back = () => KB.setScene(KB.CustomLevelsScene ? new KB.CustomLevelsScene() : (KB.TitleScene ? new KB.TitleScene() : KB.scene));
        if (UI && UI.leave) UI.leave(this, back); else back();
        return;
      }
    }

    // ---------- 每幀 ----------
    update(dt) {
      const UI = U(), st = this.st, inp = KB.input;
      this.t += dt; this.frame++;
      // fix12：延遲 PEND_FRAMES 幀才落筆（期間若第二指落下 ⇒ ptrDown 已把 pend 清掉 ⇒ 一格都不會畫）
      if (this.pend && !this.panMode) { this.pend.f = (this.pend.f | 0) + 1; if (this.pend.f >= PEND_FRAMES) this.commitPend(); }
      if (st.msgT > 0) st.msgT--;
      if (UI && UI.stepFade && UI.stepFade(this)) return;

      if (st.page === 'palette') return this.updPalette(inp);
      if (st.page === 'menu') return this.updMenu(inp);
      if (st.page === 'check' || st.page === 'share' || st.page === 'help') {
        if (st.page === 'help' && inp.pressed('select')) { this.helpPage = (this.helpPage + 1) % 2; sfx('menu'); return; }
        if (st.page === 'share' && inp.pressed('attack')) { const ok = E.copyText(this.share); st.toast(ok ? '分享碼已複製' : '複製失敗'); sfx(ok ? 'select' : 'error'); return; }
        if (st.page === 'share' && inp.pressed('select')) { this.doImport(); return; }
        if (inp.pressed('jump') || inp.pressed('start')) { st.page = 'map'; sfx('menu_back'); }
        return;
      }

      // ---- 地圖頁 ----
      const dirs = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];
      let moved = false;
      for (const [n, dx, dy] of dirs) {
        if (inp.pressed(n)) { st.moveCursor(dx, dy); this.rep = { dir: n, t: 0 }; moved = true; }
      }
      if (!moved && this.rep.dir && inp.down(this.rep.dir)) {
        this.rep.t++;
        if (this.rep.t >= REPEAT_DELAY && (this.rep.t - REPEAT_DELAY) % REPEAT_EVERY === 0) {
          const d = dirs.find(d => d[0] === this.rep.dir);
          st.moveCursor(d[1], d[2]);
        }
      } else if (!moved && this.rep.dir && !inp.down(this.rep.dir)) this.rep = { dir: '', t: 0 };

      if (inp.pressed('jump')) { st.beginStroke(); st.paint(st.cur.x, st.cur.y, false); st.endStroke(); sfx('menu'); }
      if (inp.pressed('attack')) { st.beginStroke(); st.paint(st.cur.x, st.cur.y, true); st.endStroke(); sfx('menu'); }
      if (inp.pressed('select')) { st.pick(st.cur.x, st.cur.y); sfx('menu'); st.toast('吸管：' + st.brushLabel()); }
      if (inp.pressed('start')) { st.page = 'menu'; this.menuSel = 0; sfx('pause'); }
    }
    updPalette(inp) {
      const { list, cells } = this.palRects();
      const cols = 8, n = list.length;
      if (inp.pressed('right')) { this.pal.idx = (this.pal.idx + 1) % n; sfx('menu'); }
      if (inp.pressed('left')) { this.pal.idx = (this.pal.idx - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('down')) { this.pal.idx = Math.min(n - 1, this.pal.idx + cols); sfx('menu'); }
      if (inp.pressed('up')) { this.pal.idx = Math.max(0, this.pal.idx - cols); sfx('menu'); }
      if (inp.pressed('select')) {
        const i = E.TABS.findIndex(t => t.id === this.pal.tab);
        this.pal.tab = E.TABS[(i + 1) % E.TABS.length].id; this.pal.idx = 0; sfx('menu');
      }
      if (inp.pressed('jump')) this.palPick(list[this.pal.idx]);
      if (inp.pressed('attack')) this.cycleArg(1);
      if (inp.pressed('start')) { this.st.tab = this.pal.tab; this.st.page = 'map'; sfx('menu_back'); }
      void cells;
    }
    updMenu(inp) {
      const items = this.menuItems(), n = items.length;
      if (inp.pressed('down')) { this.menuSel = (this.menuSel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.menuSel = (this.menuSel - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('right')) this.menuDo(items[this.menuSel], 1);
      if (inp.pressed('left')) this.menuDo(items[this.menuSel], -1);
      if (inp.pressed('jump')) this.menuDo(items[this.menuSel], 0);
      if (inp.pressed('attack') || inp.pressed('start') || inp.pressed('select')) { this.st.page = 'map'; sfx('menu_back'); }
    }

    // ---------- 繪製 ----------
    draw(ctx) {
      const UI = U(); if (!UI) return;
      const st = this.st;
      KB.rect(ctx, 0, 0, W, H, '#0a0e1c');
      this.drawView(ctx);
      this.drawTop(ctx);
      if (st.page === 'map') this.drawBar(ctx);
      else if (st.page === 'palette') this.drawPalette(ctx);
      else if (st.page === 'menu') this.drawMenu(ctx);
      else if (st.page === 'check') this.drawCheck(ctx);
      else if (st.page === 'share') this.drawShare(ctx);
      else if (st.page === 'help') this.drawHelp(ctx);
      if (st.msgT > 0 && st.page === 'map') {
        const UI2 = U(), w = Math.min(240, UI2.textWidth(st.msg, { size: 12 }) + 12);
        KB.rect(ctx, (W - w) / 2, E.VIEW.y + E.VIEW.h - 18, w, 15, 'rgba(0,0,0,0.76)');
        UI2.fitText(ctx, st.msg, W / 2, E.VIEW.y + E.VIEW.h - 16, 236, { color: '#ffe040', align: 'center', size: 12 });
      }
      if (UI.drawMuteToast) UI.drawMuteToast(ctx);
      if (UI.drawFade) UI.drawFade(ctx, this);
    }

    /** 編輯區：背景 → 裝飾 → 磁磚 → 物件 → 起點 / 終點 / 魔王 → 格線 → 游標 */
    drawView(ctx) {
      const st = this.st, d = st.data, z = st.zoom, k = z / 16, V = E.VIEW;
      ctx.save();
      ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
      // 背景（不縮放，維持原本視差感）
      const bg = KB.BG && (KB.BG[d.theme] || KB.BG.green);
      ctx.save(); ctx.translate(V.x, V.y);
      if (bg) { try { bg(ctx, st.cam.x / k, st.cam.y / k, this.t); } catch (e) { KB.rect(ctx, 0, 0, V.w, V.h, '#18203c'); } }
      else KB.rect(ctx, 0, 0, V.w, V.h, '#18203c');
      // 非 1:1 縮放時背景不跟著縮放（視差感維持），壓暗一層讓磁磚格線更清楚
      if (z !== 16) KB.rect(ctx, 0, 0, V.w, V.h, 'rgba(8,12,26,0.38)');
      ctx.restore();

      // 以 TileMap 畫磁磚（與遊戲同一條路徑：同一個 tileSprite 表）
      const map = this.tilemap();
      ctx.save();
      ctx.translate(V.x, V.y);
      ctx.scale(k, k);
      ctx.translate(-st.cam.x / k, -st.cam.y / k);
      const camWX = st.cam.x / k, camWY = st.cam.y / k;
      const x0 = Math.max(0, Math.floor(camWX / 16) - 1), x1 = Math.min(d.w - 1, Math.floor((camWX + V.w / k) / 16) + 1);
      const y0 = Math.max(0, Math.floor(camWY / 16) - 1), y1 = Math.min(d.h - 1, Math.floor((camWY + V.h / k) / 16) + 1);
      // 裝飾層
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = d.deco[ty][tx];
        if (ch === '.' || ch === ' ') continue;
        const nm = has('deco_' + d.theme + '_' + ch) ? 'deco_' + d.theme + '_' + ch : (has('deco_' + ch) ? 'deco_' + ch : null);
        if (nm) KB.drawSpr(ctx, nm, tx * 16 + 8, ty * 16 + 16, { t: this.t });
        else KB.rect(ctx, tx * 16 + 4, ty * 16 + 8, 8, 8, '#2c6030');
      }
      // 磁磚層
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = d.rows[ty][tx];
        if (ch === '.' || ch === ' ') continue;
        const nm = map.tileSprite(tx, ty, d.theme);
        if (!nm) continue;
        if (ch === '~') ctx.globalAlpha = 0.7;
        KB.drawSpr(ctx, nm, tx * 16, ty * 16, { t: this.t, _tl: true });
        ctx.globalAlpha = 1;
      }
      // 物件
      for (const o of d.objs) {
        if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
        const def = CU.objDef(o.t);
        if (def && def.spr && has(def.spr)) KB.drawSpr(ctx, def.spr, o.x * 16 + 8, o.y * 16 + 16, { t: this.t });
        else KB.rect(ctx, o.x * 16 + 2, o.y * 16 + 2, 12, 12, '#d04870');
        if (o.t === 'essence' && o.a && has('ui_ability_' + o.a + '_mini')) KB.drawSpr(ctx, 'ui_ability_' + o.a + '_mini', o.x * 16 + 8, o.y * 16 + 6, { t: 0 });
      }
      ctx.restore();

      // 格線 / 標記 / 游標（畫在螢幕座標，線寬恆為 1px）
      if (z >= 12) {
        ctx.globalAlpha = 0.22;
        for (let tx = x0; tx <= x1 + 1; tx++) { const sx = Math.round(V.x + tx * z - st.cam.x); if (sx >= V.x && sx < V.x + V.w) KB.rect(ctx, sx, V.y, 1, V.h, '#8090c0'); }
        for (let ty = y0; ty <= y1 + 1; ty++) { const sy = Math.round(V.y + ty * z - st.cam.y); if (sy >= V.y && sy < V.y + V.h) KB.rect(ctx, V.x, sy, V.w, 1, '#8090c0'); }
        ctx.globalAlpha = 1;
      }
      this.mark(ctx, d.spawn, '起', '#60e060');
      if (d.exit) this.mark(ctx, d.exit, '終', '#ffe040');
      if (d.boss && d.bossPos) this.mark(ctx, d.bossPos, '王', '#ff6080');
      // 游標
      const s = st.screenOf(st.cur.x, st.cur.y);
      const blink = (this.frame >> 3) & 1;
      KB.rect(ctx, s.x, s.y, z, 1, blink ? '#fff' : '#ffe040');
      KB.rect(ctx, s.x, s.y + z - 1, z, 1, blink ? '#fff' : '#ffe040');
      KB.rect(ctx, s.x, s.y, 1, z, blink ? '#fff' : '#ffe040');
      KB.rect(ctx, s.x + z - 1, s.y, 1, z, blink ? '#fff' : '#ffe040');
      ctx.restore();
      // 捲動條
      const m = st.maxCam();
      if (m.x > 0) {
        const bw = Math.max(8, Math.round(V.w * V.w / (d.w * z)));
        KB.rect(ctx, V.x, V.y + V.h - 2, V.w, 2, '#121a30');
        KB.rect(ctx, V.x + Math.round((V.w - bw) * st.cam.x / m.x), V.y + V.h - 2, bw, 2, '#6c80b8');
      }
      if (m.y > 0) {
        const bh = Math.max(8, Math.round(V.h * V.h / (d.h * z)));
        KB.rect(ctx, V.x + V.w - 2, V.y, 2, V.h, '#121a30');
        KB.rect(ctx, V.x + V.w - 2, V.y + Math.round((V.h - bh) * st.cam.y / m.y), 2, bh, '#6c80b8');
      }
    }
    mark(ctx, pos, label, col) {
      const st = this.st, z = st.zoom, s = st.screenOf(pos[0], pos[1]);
      const V = E.VIEW;
      if (s.x + z < V.x || s.x > V.x + V.w || s.y + z < V.y || s.y > V.y + V.h) return;
      KB.rect(ctx, s.x, s.y, z, z, 'rgba(0,0,0,0.35)');
      KB.rect(ctx, s.x, s.y, z, 1, col); KB.rect(ctx, s.x, s.y + z - 1, z, 1, col);
      KB.rect(ctx, s.x, s.y, 1, z, col); KB.rect(ctx, s.x + z - 1, s.y, 1, z, col);
      if (z >= 12) U().text(ctx, label, s.x + z / 2, s.y + (z - 12) / 2, { color: col, align: 'center', size: 12, outline: '#101828' });
    }
    tilemap() {
      const st = this.st, sig = st.data.rows.join('|') + '#' + st.data.theme;
      // 與遊戲同一條建關路徑：KB.TileMap.fromData（tilemap.js）
      if (this._tmSig !== sig) { this._tm = KB.TileMap.fromData(st.data); this._tmSig = sig; }
      return this._tm;
    }

    drawTop(ctx) {
      const UI = U(), st = this.st, d = st.data;
      KB.rect(ctx, 0, 0, W, E.TOP.h, '#101828');
      KB.rect(ctx, 0, E.TOP.h - 1, W, 1, '#2c3a60');
      UI.fitText(ctx, (st.dirty ? '*' : '') + d.name + (st.slot >= 0 ? ('（' + (st.slot + 1) + '）') : ''), 3, 0, 86, { color: '#ffe040', size: 12 });
      UI.fitText(ctx, st.brushLabel(), 92, 0, 86, { color: '#80e0ff', size: 12 });
      KB.text(ctx, st.cur.x + ',' + st.cur.y, 252, 3, { color: '#c8d8f0', align: 'right' });
      KB.text(ctx, 'z' + st.zoom, 206, 3, { color: '#7c8ca8', align: 'right' });
    }
    drawBar(ctx) {
      const st = this.st;
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      for (let i = 0; i < E.TOOLS.length; i++) {
        const tl = E.TOOLS[i], r = E.toolRect(i);
        const grey = (tl.id === 'undo' && !st.canUndo) || (tl.id === 'redo' && !st.canRedo);
        if (tl.id === 'brush') {
          btn(ctx, r, '筆刷', { labelY: 16 });
          const b = st.brush, cx = r.x + r.w / 2, cy = r.y + 9;
          if (b.kind === 'tile') tileGlyph(ctx, b.ch, cx, cy, st.data.theme);
          else if (b.kind === 'deco') decoGlyph(ctx, b.ch, cx, cy, st.data.theme);
          else if (b.kind === 'obj') objGlyph(ctx, CU.objDef(b.t), cx, cy);
          else U().text(ctx, b.m === 'spawn' ? '起' : b.m === 'exit' ? '終' : b.m === 'bosspos' ? '王' : '擦', cx, cy - 6, { color: '#fff', align: 'center', size: 12 });
        } else btn(ctx, r, tl.label, { grey });
      }
    }

    drawPalette(ctx) {
      const UI = U(), st = this.st;
      KB.rect(ctx, 0, E.TOP.h, W, H - E.TOP.h, 'rgba(6,10,22,0.93)');
      const { tabs, cells, list } = this.palRects();
      for (let i = 0; i < tabs.length; i++) btn(ctx, tabs[i], E.TABS[i].label, { on: E.TABS[i].id === this.pal.tab, sel: E.TABS[i].id === this.pal.tab });
      for (const c of cells) {
        const b = list[c.i], sel = c.i === this.pal.idx;
        btn(ctx, c, null, { sel, on: this.sameBrush(b, st.brush) });
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2 - 2;
        if (b.kind === 'tile') tileGlyph(ctx, b.ch, cx, cy, st.data.theme);
        else if (b.kind === 'deco') decoGlyph(ctx, b.ch, cx, cy - 4, st.data.theme);
        else if (b.kind === 'obj') objGlyph(ctx, CU.objDef(b.t), cx, cy - 3);
        else UI.text(ctx, b.label.slice(0, 3), cx, c.y + 8, { color: '#fff', align: 'center', size: 12 });
      }
      const cur = list[this.pal.idx];
      UI.fitText(ctx, cur ? cur.label : '', 128, E.BAR.y - 16, 240, { color: '#ffe040', align: 'center', size: 12 });
      // 下排：參數 ◀ ▶（能力星 / 大星星）+ 關閉
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      const argAble = cur && cur.kind === 'obj' && (cur.t === 'essence' || cur.t === 'bigstar');
      btn(ctx, { x: 12, y: E.BAR.y, w: E.BTN, h: E.BTN }, '◀', { grey: !argAble });
      btn(ctx, { x: 12 + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '▶', { grey: !argAble });
      UI.fitText(ctx, argAble ? (cur.t === 'essence' ? ('能力 ' + st.abilityPick) : ('第 ' + (st.starPick + 1) + ' 顆')) : (UI.hint('select', 'SHIFT') + ' 換頁'),
        12 + 2 * E.BTN + 4, E.BAR.y + 8, 4 * E.BTN - 8, { color: '#98a8c0', size: 12 });
      btn(ctx, { x: 12 + 6 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '取消');
      btn(ctx, { x: 12 + 7 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '關閉');
    }

    drawMenu(ctx) {
      const UI = U(), C = UI.C, st = this.st;
      KB.rect(ctx, 0, E.TOP.h, W, H - E.TOP.h, 'rgba(6,10,22,0.93)');
      UI.panel(ctx, 8, 16, 240, 174);
      UI.text(ctx, '編輯器選單', 128, 19, { color: C.yellow, align: 'center', size: 12 });
      const items = this.menuItems();
      for (let i = 0; i < items.length; i++) {
        const r = this.menuRect(i), sel = this.menuSel === i, it = items[i];
        if (sel) KB.rect(ctx, r.x - 2, r.y, r.w + 4, r.h, '#223058');
        UI.fitText(ctx, it.label, r.x + 10, r.y, 150, { color: sel ? C.yellow : '#fff', size: 12 });
        if (it.val !== undefined) UI.fitText(ctx, String(it.val), r.x + r.w - 2, r.y, 86, { color: sel ? '#80e0ff' : C.grey, align: 'right', size: 12 });
        if (sel) UI.cursor(ctx, r.x - 1, r.y + 1, this.frame);
      }
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      btn(ctx, { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN }, '返回');
      UI.fitText(ctx, UI.hint('jump', 'Z') + ' 確認　' + UI.hint('left', '←→') + ' 調整', E.BAR.x + E.BTN + 6, E.BAR.y + 8, 5 * E.BTN - 10, { color: C.grey, size: 12 });
      btn(ctx, { x: E.BAR.x + 6 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '◀');
      btn(ctx, { x: E.BAR.x + 7 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '▶');
    }

    drawCheck(ctx) {
      const UI = U(), C = UI.C;
      const r = this.chk || { errors: [], warns: [], info: [] };
      KB.rect(ctx, 0, E.TOP.h, W, H - E.TOP.h, 'rgba(6,10,22,0.95)');
      UI.panel(ctx, 8, 16, 240, 174);
      UI.text(ctx, '關卡檢查', 128, 19, { color: C.yellow, align: 'center', size: 12 });
      let y = 34;
      const line = (s, col) => { if (y > 180) return; UI.fitText(ctx, s, 16, y, 224, { color: col, size: 12 }); y += 13; };
      if (!r.errors.length && !r.warns.length) line('沒有問題，可以測玩！', '#80e0a0');
      for (const s of r.errors) line('錯誤：' + s, '#ff8080');
      for (const s of r.warns) line('警告：' + s, '#ffe040');
      for (const s of r.info) line('・' + s, '#98a8c0');
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      btn(ctx, { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN }, '返回');
      btn(ctx, { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '重檢');
      UI.fitText(ctx, '錯誤 ' + r.errors.length + '　警告 ' + r.warns.length, E.BAR.x + 2 * E.BTN + 6, E.BAR.y + 8, 150, { color: C.grey, size: 12 });
    }

    drawShare(ctx) {
      const UI = U(), C = UI.C, code = this.share || '';
      KB.rect(ctx, 0, E.TOP.h, W, H - E.TOP.h, 'rgba(6,10,22,0.95)');
      UI.panel(ctx, 8, 16, 240, 174);
      UI.text(ctx, '分享碼', 128, 19, { color: C.yellow, align: 'center', size: 12 });
      UI.fitText(ctx, '共 ' + code.length + ' 字（完整內容已可複製）', 16, 33, 224, { color: '#98a8c0', size: 12 });
      // 以 8×8 點陣字逐行顯示開頭（分享碼可能很長，只顯示前 11 行）
      const per = 29, maxLines = 11;
      for (let i = 0; i < maxLines; i++) {
        const s = code.slice(i * per, i * per + per);
        if (!s) break;
        KB.text(ctx, s, 16, 48 + i * 11, { color: '#c8d8f0' });
      }
      if (code.length > per * maxLines) KB.text(ctx, '... (+' + (code.length - per * maxLines) + ')', 16, 48 + maxLines * 11, { color: '#7c8ca8' });
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      btn(ctx, { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN }, '返回');
      btn(ctx, { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '複製');
      btn(ctx, { x: E.BAR.x + 2 * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '匯入');
      // fix12（R12-P3-04）：原本那句（SHIFT ＋ 四個中文字）放不下，會被 fitText 截成「SHIFT 貼…」
      //   ⇒ 文案縮成與按鍵同名的「匯入」，並把寬度算成「剩下的全部」而不是固定 4 顆按鍵寬
      const tipX = E.BAR.x + 3 * E.BTN + 6;
      UI.fitText(ctx, UI.hint('attack', 'X') + ' 複製　' + UI.hint('select', 'SHIFT') + ' 匯入',
        tipX, E.BAR.y + 8, W - tipX - 4, { color: C.grey, size: 12 });
    }

    drawHelp(ctx) {
      const UI = U(), C = UI.C;
      KB.rect(ctx, 0, E.TOP.h, W, H - E.TOP.h, 'rgba(6,10,22,0.95)');
      UI.panel(ctx, 8, 16, 240, 174);
      UI.text(ctx, this.helpPage === 0 ? '編輯器操作' : '關卡規則', 128, 19, { color: C.yellow, align: 'center', size: 12 });
      const P0 = [
        [UI.hint('left', '方向鍵'), '移動游標（到邊緣自動捲動）'],
        [UI.hint('jump', 'Z'), '畫下目前筆刷'],
        [UI.hint('attack', 'X'), '擦掉這一格'],
        [UI.hint('select', 'SHIFT'), '吸管（複製該格的筆刷）'],
        [UI.hint('start', 'ENTER'), '編輯器選單'],
        ['點 / 拖曳', '手指或滑鼠直接畫'],
        ['兩指拖曳', '捲動地圖'],
        ['滾輪 / Shift+滾輪', '捲動 / 縮放'],
        ['U / Y', '復原 / 重做'],
      ];
      const P1 = [
        ['起點', '卡比出生的格子（下方要有地面）'],
        ['終點旗', '走進去就過關；再點一次可取消'],
        ['魔王', '選單可選；打倒魔王才會出現過關門'],
        ['能力星', '台座，碰到就拿到該能力'],
        ['硬磚 X', '要鐵鎚 / 石頭才打得破'],
        ['導火線 F', '火焰點燃後會燒到炸彈磚'],
        ['冰磚 I', '火焰可以融掉'],
        ['檢查', '會算「從起點飛得到嗎」，不可達會警告'],
        ['存檔', '最多 8 槽；分享碼可貼給朋友'],
      ];
      const rows = this.helpPage === 0 ? P0 : P1;
      rows.forEach((r, i) => {
        const y = 34 + i * 16;
        UI.fitText(ctx, r[0], 16, y, 76, { color: C.cyan, size: 12, nomix: true });
        UI.fitText(ctx, r[1], 96, y, 146, { color: '#fff', size: 12 });
      });
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      btn(ctx, { x: E.BAR.x, y: E.BAR.y, w: E.BTN, h: E.BTN }, '返回');
      btn(ctx, { x: E.BAR.x + E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }, '換頁');
      UI.fitText(ctx, (this.helpPage + 1) + ' / 2', E.BAR.x + 2 * E.BTN + 6, E.BAR.y + 8, 100, { color: C.grey, size: 12 });
    }
  }
  KB.EditorScene = EditorScene;

  function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  /**
   * touch.js 的「浮動搖桿感應區」(.kb-zone) 是一塊透明但 pointer-events:auto 的大矩形
   * （iPhone 13 橫向 = 畫面左下 217×217），會蓋住畫布左下角的編輯器工具列與編輯區。
   * 編輯器期間只關掉它的 pointer-events（不動 KB.TOUCH.layout，所以不會寫進玩家設定），離開再還原。
   * relayout() 只改 left/top/width/height/opacity/display，不碰 pointerEvents ⇒ 設一次就夠。
   * 跨檔需求：建議 touch.js 之後提供 KB.TOUCH.setZoneEnabled(bool)。
   */
  function zoneTouch(on) {
    try {
      const root = KB.TOUCH && KB.TOUCH.el;
      const z = root && root.querySelector && root.querySelector('.kb-zone');
      if (z) z.style.pointerEvents = on ? '' : 'none';
    } catch (e) { }
  }
  function themeLabel(k) { const t = CU.THEMES.find(t => t.k === k); return t ? t.label : k; }

  // ======================================================================
  // 自製關卡選單（遊玩 / 編輯 / 刪除 / 排行 / 匯入）
  // ======================================================================
  const CL_BTNS = [
    { id: 'play', label: '遊玩' }, { id: 'edit', label: '編輯' }, { id: 'del', label: '刪除' },
    { id: 'rank', label: '排行' }, { id: 'import', label: '匯入' }, { id: 'new', label: '新建' },
    { id: 'back', label: '返回' },
  ];

  class CustomLevelsScene {
    constructor(sel, page) {
      this.sel = Math.max(0, Math.min(CU.SLOTS - 1, sel | 0));
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.page = page === 'best' ? 'rank' : 'list';
      this.confirm = false; this.msg = ''; this.msgT = 0;
    }
    enter() { music('select'); this.bind(); zoneTouch(false); }
    exit() { this.unbind(); zoneTouch(true); }
    bind() {
      if (this._bound) return;
      const c = KB.canvas; if (!c) return;
      this._onDown = e => {
        const r = c.getBoundingClientRect();
        if (!r.width) return;
        this.tap((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
      };
      c.addEventListener('pointerdown', this._onDown);
      this._bound = true;
    }
    unbind() { if (this._bound && KB.canvas) KB.canvas.removeEventListener('pointerdown', this._onDown); this._bound = false; }
    toast(s) { this.msg = s; this.msgT = 150; }
    rowRect(i) { return { x: 8, y: 26 + i * 19, w: 240, h: 19 }; }
    btnRect(i) { return { x: 6 + i * 35, y: E.BAR.y, w: 34, h: E.BTN }; }
    tap(x, y) {
      if (this.confirm) {
        if (y >= E.BAR.y) { const i = Math.floor((x - 6) / 35); this.doConfirm(i === 0); }
        return;
      }
      if (this.page === 'rank') { if (y >= E.BAR.y || y < 20) { this.page = 'list'; sfx('menu_back'); } return; }
      for (let i = 0; i < CU.SLOTS; i++) if (inRect(x, y, this.rowRect(i))) { this.sel = i; sfx('menu'); return; }
      if (y >= E.BAR.y) {
        const i = Math.floor((x - 6) / 35);
        if (i >= 0 && i < CL_BTNS.length) this.act(CL_BTNS[i].id);
      }
    }
    act(id) {
      const d = CU.slot(this.sel);
      if (id === 'play') {
        if (!d) { this.toast('這個槽位是空的'); sfx('error'); return; }
        sfx('select');
        const UI = U(), go = () => E.playSlot(this.sel);
        if (UI && UI.leave) UI.leave(this, go); else go();
        return;
      }
      if (id === 'edit') {
        sfx('select');
        const UI = U(), slot = this.sel;
        const go = () => KB.setScene(new KB.EditorScene(d ? slot : { slot: slot }));
        if (UI && UI.leave) UI.leave(this, go); else go();
        return;
      }
      if (id === 'new') {
        sfx('select');
        const UI = U(), slot = this.sel;
        const go = () => { const st = new E.EditorState(CU.blank(), CU.slot(slot) ? -1 : slot); KB.setScene(new KB.EditorScene(st)); };
        if (UI && UI.leave) UI.leave(this, go); else go();
        return;
      }
      if (id === 'del') {
        if (!d) { this.toast('這個槽位是空的'); sfx('error'); return; }
        this.confirm = true; sfx('menu'); return;
      }
      if (id === 'rank') {
        if (!d) { this.toast('這個槽位是空的'); sfx('error'); return; }
        this.page = 'rank'; sfx('select'); return;
      }
      if (id === 'import') {
        const s = E.ask('貼上分享碼：', '');
        if (!s) { this.toast('取消匯入'); return; }
        const data = CU.decode(s);
        if (!data) { this.toast('分享碼無效（校驗失敗）'); sfx('error'); return; }
        let i = CU.slot(this.sel) ? CU.firstFree() : this.sel;
        if (i < 0) i = this.sel;        // 全滿 → 覆蓋目前選取
        CU.setSlot(i, data);
        this.sel = i; this.toast('已匯入「' + data.name + '」到第 ' + (i + 1) + ' 槽');
        sfx('select'); return;
      }
      if (id === 'back') {
        sfx('menu_back');
        const UI = U(), back = () => KB.setScene(KB.TitleScene ? new KB.TitleScene() : KB.scene);
        if (UI && UI.leave) UI.leave(this, back); else back();
        return;
      }
    }
    doConfirm(yes) {
      this.confirm = false;
      if (!yes) { sfx('menu_back'); return; }
      CU.delSlot(this.sel);
      this.toast('已刪除第 ' + (this.sel + 1) + ' 槽');
      sfx('select');
    }
    update(dt) {
      const UI = U(), inp = KB.input;
      this.t += dt; this.frame++;
      if (this.msgT > 0) this.msgT--;
      if (UI && UI.stepFade && UI.stepFade(this)) return;
      if (this.confirm) {
        if (inp.pressed('jump')) this.doConfirm(true);
        else if (inp.pressed('attack') || inp.pressed('start') || inp.pressed('select')) this.doConfirm(false);
        return;
      }
      if (this.page === 'rank') {
        if (inp.any()) { this.page = 'list'; sfx('menu_back'); }
        return;
      }
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % CU.SLOTS; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + CU.SLOTS) % CU.SLOTS; sfx('menu'); }
      if (inp.pressed('right')) this.act('rank');
      if (inp.pressed('jump')) this.act('play');
      if (inp.pressed('attack')) this.act('edit');
      if (inp.pressed('select')) this.act('del');
      if (inp.pressed('start')) this.act('back');
    }
    draw(ctx) {
      const UI = U(); if (!UI) return;
      const C = UI.C;
      if (UI.bands) UI.bands(ctx, 0, H, ['#0c1430', '#141c48', '#1c2860', '#182038']);
      else KB.rect(ctx, 0, 0, W, H, '#141c48');
      if (UI.mkStars) { this._stars = this._stars || UI.mkStars(36, 91, 0, 0, W, H); UI.drawStars(ctx, this._stars, this.t); }
      UI.bigText(ctx, 'CUSTOM', 6, 4, 2, { color: '#fff', outline: '#101830', spacing: 0 });
      UI.text(ctx, '自製關卡', 128, 5, { color: C.yellow, size: 16, outline: '#101830' });
      if (this.page === 'rank') { this.drawRank(ctx); return; }
      const names = CU.slotNames();
      for (let i = 0; i < CU.SLOTS; i++) {
        const r = this.rowRect(i), sel = this.sel === i, d = CU.slot(i);
        UI.panel(ctx, r.x, r.y, r.w, r.h - 2, sel ? '#223058' : '#141c34', sel ? C.yellow : '#3c4a70');
        KB.text(ctx, String(i + 1), r.x + 8, r.y + 5, { color: sel ? C.yellow : '#98a8c0' });
        if (d) {
          UI.fitText(ctx, names[i], r.x + 20, r.y + 2, 104, { color: sel ? '#fff' : '#c8d8f0', size: 12 });
          KB.text(ctx, d.w + 'x' + d.h, r.x + 128, r.y + 5, { color: '#7c8ca8' });
          const best = CU.best(i);
          KB.text(ctx, best.length ? mmss(best[0].time) : '--:--', r.x + 232, r.y + 5, { color: best.length ? '#80e0a0' : '#4c5878', align: 'right' });
        } else UI.fitText(ctx, '（空槽位）', r.x + 20, r.y + 2, 120, { color: '#56607c', size: 12 });
        if (sel) UI.cursor(ctx, r.x - 4, r.y + 4, this.frame);
      }
      if (this.msgT > 0) UI.fitText(ctx, this.msg, 128, 179, 244, { color: C.yellow, align: 'center', size: 12 });
      else UI.fitText(ctx, UI.hint('jump', 'Z') + ' 遊玩　' + UI.hint('attack', 'X') + ' 編輯　' + UI.hint('select', 'SHIFT') + ' 刪除　→ 排行', 128, 179, 244, { color: C.grey, align: 'center', size: 12 });
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      for (let i = 0; i < CL_BTNS.length; i++) btn(ctx, this.btnRect(i), CL_BTNS[i].label);
      if (this.confirm) {
        KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.6)');
        UI.panel(ctx, 40, 76, 176, 54);
        UI.fitText(ctx, '刪除第 ' + (this.sel + 1) + ' 槽？', 128, 86, 160, { color: '#fff', align: 'center', size: 12 });
        UI.fitText(ctx, '（無法復原）', 128, 100, 160, { color: '#ff9090', align: 'center', size: 12 });
        KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
        btn(ctx, this.btnRect(0), '刪除', { sel: true });
        btn(ctx, this.btnRect(1), '取消');
      }
      if (UI.drawMuteToast) UI.drawMuteToast(ctx);
      if (UI.drawFade) UI.drawFade(ctx, this);
    }
    drawRank(ctx) {
      const UI = U(), C = UI.C, d = CU.slot(this.sel), list = CU.best(this.sel);
      UI.panel(ctx, 8, 26, 240, 150);
      UI.fitText(ctx, '排行：' + (d ? d.name : '-'), 128, 30, 220, { color: C.yellow, align: 'center', size: 12 });
      // 欄位 x：# 14 / TIME 30 / SCORE 76 / ABILITY 134 / DATE 右界 242（每欄之間至少留 2px）
      KB.text(ctx, '#', 14, 48, { color: '#98a8c0' });
      KB.text(ctx, 'TIME', 30, 48, { color: '#98a8c0' });
      KB.text(ctx, 'SCORE', 76, 48, { color: '#98a8c0' });
      KB.text(ctx, 'ABILITY', 134, 48, { color: '#98a8c0' });
      KB.text(ctx, 'DATE', 242, 48, { color: '#98a8c0', align: 'right' });
      if (!list.length) UI.fitText(ctx, '還沒有通關紀錄', 128, 76, 200, { color: C.grey, align: 'center', size: 12 });
      list.forEach((r, i) => {
        const y = 62 + i * 16;
        KB.text(ctx, String(i + 1), 14, y, { color: i === 0 ? C.yellow : '#c8d8f0' });
        KB.text(ctx, mmss(r.time), 30, y, { color: '#80e0a0' });
        KB.text(ctx, UI.pad7 ? UI.pad7(r.score) : String(r.score), 76, y, { color: '#fff' });
        KB.text(ctx, String(r.ability).toUpperCase().slice(0, 7), 134, y, { color: '#80c8ff' });
        KB.text(ctx, String(r.date || '').slice(-5), 242, y, { color: '#7c8ca8', align: 'right' });
      });
      UI.fitText(ctx, '任意鍵返回', 128, 179, 240, { color: C.grey, align: 'center', size: 12 });
      KB.rect(ctx, 0, E.BAR.y - 1, W, H - E.BAR.y + 1, '#101828');
      btn(ctx, this.btnRect(0), '返回');
      if (UI.drawFade) UI.drawFade(ctx, this);
    }
  }
  KB.CustomLevelsScene = CustomLevelsScene;
})();
