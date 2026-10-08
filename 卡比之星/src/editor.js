// 關卡編輯器 — 模型層（Round 12，agent: level-editor）
// ============================================================================
// 本檔只有「狀態 / 筆刷 / 復原重做 / 捲動縮放 / 測玩橋接」，完全不碰 DOM 與繪圖；
// 畫面與輸入在 src/editor_ui.js（KB.EditorScene / KB.CustomLevelsScene）。
// 資料格式與分享碼在 src/levels_custom.js（KB.CUSTOM）。
//
// 幾何（內部解析度 256×224）：
//   TOP  y 0..12    狀態列（關卡名 / 筆刷 / 座標）
//   VIEW y 13..193  地圖編輯區（可捲動 / 縮放）
//   BAR  y 194..222 工具列：8 顆 29×29 的按鍵
//     29px × iPhone 13 橫向倍率 1.741 = 50.5 CSS px；× Pixel 5 直向 1.535 = 44.5 CSS px → 皆 ≥ 44。
// ============================================================================
(function () {
  'use strict';
  const T = 16;
  const E = {};
  const C = () => KB.CUSTOM;

  // ---------- 幾何 ----------
  E.TOP = { x: 0, y: 0, w: 256, h: 13 };
  E.VIEW = { x: 0, y: 13, w: 256, h: 181 };
  E.BTN = 29;
  E.BAR = { x: 12, y: 194, w: 8 * 29, h: 29 };
  E.ZOOMS = [8, 12, 16, 24];
  E.UNDO_MAX = 60;

  /** 工具列按鍵（順序 = 畫面順序）；icon 由 editor_ui 畫 */
  E.TOOLS = [
    { id: 'brush', label: '筆刷' },
    { id: 'undo', label: '復原' },
    { id: 'redo', label: '重做' },
    { id: 'zoom', label: '縮放' },
    { id: 'test', label: '測玩' },
    { id: 'check', label: '檢查' },
    { id: 'save', label: '存檔' },
    { id: 'menu', label: '選單' },
  ];
  /** 第 i 顆工具鍵的矩形（內部像素） */
  E.toolRect = function (i) { return { x: E.BAR.x + i * E.BTN, y: E.BAR.y, w: E.BTN, h: E.BTN }; };
  E.toolAt = function (x, y) {
    if (y < E.BAR.y || y >= E.BAR.y + E.BTN) return -1;
    const i = Math.floor((x - E.BAR.x) / E.BTN);
    return (i >= 0 && i < E.TOOLS.length && x >= E.BAR.x) ? i : -1;
  };

  // ---------- 筆刷分頁 ----------
  // kind: tile（地形層）/ deco（裝飾層）/ obj（物件）/ mark（起點 / 終點旗 / 魔王位置 / 橡皮擦）
  E.TABS = [
    { id: 'base', label: '地形', kind: 'tile', group: 'base' },
    { id: 'brick', label: '磚塊', kind: 'tile', group: 'brick' },
    { id: 'hazard', label: '水刺', kind: 'tile', group: 'hazard' },
    { id: 'deco', label: '裝飾', kind: 'deco' },
    { id: 'item', label: '道具', kind: 'obj', group: 'item' },
    { id: 'enemy', label: '敵人', kind: 'obj', group: 'enemy' },
    { id: 'enemy2', label: '強敵', kind: 'obj', groups: ['enemy2', 'mini', 'water'] },
    { id: 'mark', label: '標記', kind: 'mark' },
  ];
  E.MARKS = [
    { m: 'spawn', label: '起點' },
    { m: 'exit', label: '終點旗' },
    { m: 'bosspos', label: '魔王位' },
    { m: 'erase', label: '橡皮擦' },
  ];

  /** 某個分頁的筆刷清單（供調色盤與測試列舉） */
  E.tabBrushes = function (tabId) {
    const tab = E.TABS.find(t => t.id === tabId) || E.TABS[0];
    const cu = C();
    if (tab.kind === 'tile') return cu.TILES.filter(t => t.group === tab.group).map(t => ({ kind: 'tile', ch: t.ch, label: t.label }));
    if (tab.kind === 'deco') {
      return ('.' + (cu.DECO[E.theme()] || '')).split('').map(ch => ({ kind: 'deco', ch, label: ch === '.' ? '清除' : ('裝飾 ' + ch) }));
    }
    if (tab.kind === 'obj') {
      const gs = tab.groups || [tab.group];
      return cu.OBJS.filter(o => gs.indexOf(o.group) >= 0).map(o => ({ kind: 'obj', t: o.t, label: o.label, spr: o.spr, arg: o.arg }));
    }
    return E.MARKS.map(m => ({ kind: 'mark', m: m.m, label: m.label }));
  };
  E.theme = function () { return E.state ? E.state.data.theme : 'green'; };

  // ======================================================================
  // 編輯狀態
  // ======================================================================
  class EditorState {
    constructor(data, slot) {
      this.data = C().normalize(data) || C().blank();
      this.slot = slot === undefined ? -1 : slot;
      this.cam = { x: 0, y: 0 };
      this.zoom = 16;
      this.cur = { x: this.data.spawn[0], y: this.data.spawn[1] };
      this.tab = 'base';
      this.brush = { kind: 'tile', ch: '#' };
      this.abilityPick = 'fire';      // 能力台座要給的能力
      this.starPick = 0;              // 大星星的 a（0/1/2）
      this.undoStack = []; this.redoStack = [];
      this.dirty = false;
      this.page = 'map';              // map / palette / menu / check / share / help
      this.msg = ''; this.msgT = 0;
      this.stroke = null;             // 目前這一筆畫過的格子（避免同一格重複記錄）
      this.centerOnCursor();
    }

    // ---------- 訊息 ----------
    toast(s) { this.msg = s; this.msgT = 150; return s; }

    // ---------- 復原 / 重做 ----------
    snap() { return JSON.stringify(this.data); }
    push() {
      const s = this.snap();
      if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === s) return;
      this.undoStack.push(s);
      if (this.undoStack.length > E.UNDO_MAX) this.undoStack.shift();
      this.redoStack.length = 0;
      this.dirty = true;
    }
    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.snap());
      this.data = JSON.parse(this.undoStack.pop());
      this.dirty = true; this.clampCam();
      return true;
    }
    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.snap());
      this.data = JSON.parse(this.redoStack.pop());
      this.dirty = true; this.clampCam();
      return true;
    }
    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    // ---------- 讀寫格子 ----------
    inside(x, y) { return x >= 0 && x < this.data.w && y >= 0 && y < this.data.h; }
    tile(x, y) { return this.inside(x, y) ? this.data.rows[y][x] : '#'; }
    decoAt(x, y) { return this.inside(x, y) ? this.data.deco[y][x] : '.'; }
    objAt(x, y) { return this.data.objs.find(o => o.x === x && o.y === y) || null; }

    setTile(x, y, ch) {
      if (!this.inside(x, y) || this.tile(x, y) === ch) return false;
      const r = this.data.rows[y];
      this.data.rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
      return true;
    }
    setDeco(x, y, ch) {
      if (!this.inside(x, y) || this.decoAt(x, y) === ch) return false;
      const r = this.data.deco[y];
      this.data.deco[y] = r.slice(0, x) + ch + r.slice(x + 1);
      return true;
    }
    setObj(x, y, t, a) {
      if (!this.inside(x, y)) return false;
      const i = this.data.objs.findIndex(o => o.x === x && o.y === y);
      const o = { t, x, y };
      if (a !== undefined && a !== null && a !== '') o.a = a;
      if (i >= 0) {
        const old = this.data.objs[i];
        if (old.t === t && old.a === o.a) return false;
        this.data.objs[i] = o;
      } else this.data.objs.push(o);
      return true;
    }
    delObj(x, y) {
      const i = this.data.objs.findIndex(o => o.x === x && o.y === y);
      if (i < 0) return false;
      this.data.objs.splice(i, 1);
      return true;
    }
    setSpawn(x, y) {
      if (!this.inside(x, y)) return false;
      if (this.data.spawn[0] === x && this.data.spawn[1] === y) return false;
      this.data.spawn = [x, y]; return true;
    }
    setExit(x, y) {
      if (!this.inside(x, y)) return false;
      if (this.data.exit && this.data.exit[0] === x && this.data.exit[1] === y) { this.data.exit = null; return true; }
      this.data.exit = [x, y]; return true;
    }
    setBossPos(x, y) {
      if (!this.inside(x, y)) return false;
      this.data.bossPos = [x, y]; return true;
    }
    eraseAt(x, y) {
      let ch = false;
      if (this.delObj(x, y)) ch = true;
      if (this.setDeco(x, y, '.')) ch = true;
      if (this.setTile(x, y, '.')) ch = true;
      return ch;
    }

    /** 用目前筆刷畫一格（stroke 期間同一格只記一次復原點） */
    paint(x, y, erase) {
      if (!this.inside(x, y)) return false;
      const key = x + ',' + y;
      if (this.stroke) { if (this.stroke.has(key)) return false; this.stroke.add(key); }
      const before = this.snap();
      let ch = false;
      if (erase) ch = this.eraseAt(x, y);
      else {
        const b = this.brush;
        if (b.kind === 'tile') ch = this.setTile(x, y, b.ch);
        else if (b.kind === 'deco') ch = this.setDeco(x, y, b.ch);
        else if (b.kind === 'obj') {
          let a;
          if (b.t === 'essence') a = this.abilityPick;
          else if (b.t === 'bigstar') a = this.starPick;
          ch = this.setObj(x, y, b.t, a);
        } else if (b.kind === 'mark') {
          if (b.m === 'spawn') ch = this.setSpawn(x, y);
          else if (b.m === 'exit') ch = this.setExit(x, y);
          else if (b.m === 'bosspos') ch = this.setBossPos(x, y);
          else ch = this.eraseAt(x, y);
        }
      }
      if (!ch) return false;
      const after = this.snap();
      this.data = JSON.parse(before);
      this.push();
      this.data = JSON.parse(after);
      this.dirty = true;
      return true;
    }
    beginStroke() { this.stroke = new Set(); }
    endStroke() { this.stroke = null; }
    /**
     * fix12（R12-P2-03）：取消整筆 stroke —— 兩指捲動時第二指晚落下，
     * 把第一指已經畫下的格子連同它產生的復原點一起丟掉（回到 stroke 開始前）。
     */
    cancelStroke(snapJson, undoLen) {
      if (!snapJson) return false;
      const changed = this.snap() !== snapJson;
      this.data = JSON.parse(snapJson);
      if (typeof undoLen === 'number' && undoLen >= 0 && this.undoStack.length > undoLen) this.undoStack.length = undoLen;
      this.stroke = null;
      this.dirty = true; this.clampCam();
      return changed;
    }

    /** 吸管：讀出游標格的內容當筆刷 */
    pick(x, y) {
      const o = this.objAt(x, y);
      if (o) {
        const def = C().objDef(o.t);
        this.brush = { kind: 'obj', t: o.t, label: def ? def.label : o.t, spr: def ? def.spr : null };
        if (o.t === 'essence' && o.a) this.abilityPick = o.a;
        if (o.t === 'bigstar' && o.a !== undefined) this.starPick = o.a | 0;
        return this.brush;
      }
      const d = this.decoAt(x, y);
      if (d !== '.') { this.brush = { kind: 'deco', ch: d, label: '裝飾 ' + d }; return this.brush; }
      const ch = this.tile(x, y);
      const def = C().TILES.find(t => t.ch === ch);
      this.brush = { kind: 'tile', ch, label: def ? def.label : ch };
      return this.brush;
    }

    // ---------- 筆刷設定 ----------
    setBrush(b) { this.brush = Object.assign({}, b); return this.brush; }
    brushLabel() {
      const b = this.brush, cu = C();
      let base = b.label;
      if (!base) {
        if (b.kind === 'tile') { const t = cu.TILES.find(t => t.ch === b.ch); base = t ? t.label : b.ch; }
        else if (b.kind === 'deco') base = b.ch === '.' ? '清除裝飾' : ('裝飾 ' + b.ch);
        else if (b.kind === 'obj') { const o = cu.objDef(b.t); base = o ? o.label : b.t; }
        else { const m = E.MARKS.find(m => m.m === b.m); base = m ? m.label : (b.m || ''); }
      }
      if (b.kind === 'obj' && b.t === 'essence') return base + '：' + this.abilityPick;
      if (b.kind === 'obj' && b.t === 'bigstar') return base + ' ' + (this.starPick + 1);
      return base || '';
    }

    // ---------- 捲動 / 縮放 ----------
    get cols() { return Math.floor(E.VIEW.w / this.zoom); }
    get rows() { return Math.floor(E.VIEW.h / this.zoom); }
    maxCam() {
      return {
        x: Math.max(0, this.data.w * this.zoom - E.VIEW.w),
        y: Math.max(0, this.data.h * this.zoom - E.VIEW.h),
      };
    }
    clampCam() {
      const m = this.maxCam();
      this.cam.x = Math.max(0, Math.min(m.x, this.cam.x));
      this.cam.y = Math.max(0, Math.min(m.y, this.cam.y));
      this.cur.x = Math.max(0, Math.min(this.data.w - 1, this.cur.x));
      this.cur.y = Math.max(0, Math.min(this.data.h - 1, this.cur.y));
    }
    scrollBy(dx, dy) { this.cam.x += dx; this.cam.y += dy; this.clampCam(); }
    centerOnCursor() {
      this.cam.x = this.cur.x * this.zoom - E.VIEW.w / 2 + this.zoom / 2;
      this.cam.y = this.cur.y * this.zoom - E.VIEW.h / 2 + this.zoom / 2;
      this.clampCam();
    }
    /** 游標保持在畫面內（走到邊緣就捲動） */
    followCursor() {
      const pad = this.zoom;
      const cx = this.cur.x * this.zoom, cy = this.cur.y * this.zoom;
      if (cx - pad < this.cam.x) this.cam.x = cx - pad;
      if (cx + this.zoom + pad > this.cam.x + E.VIEW.w) this.cam.x = cx + this.zoom + pad - E.VIEW.w;
      if (cy - pad < this.cam.y) this.cam.y = cy - pad;
      if (cy + this.zoom + pad > this.cam.y + E.VIEW.h) this.cam.y = cy + this.zoom + pad - E.VIEW.h;
      this.clampCam();
    }
    moveCursor(dx, dy) {
      this.cur.x = Math.max(0, Math.min(this.data.w - 1, this.cur.x + dx));
      this.cur.y = Math.max(0, Math.min(this.data.h - 1, this.cur.y + dy));
      this.followCursor();
    }
    cycleZoom(d) {
      const i = E.ZOOMS.indexOf(this.zoom);
      const centerT = { x: (this.cam.x + E.VIEW.w / 2) / this.zoom, y: (this.cam.y + E.VIEW.h / 2) / this.zoom };
      this.zoom = E.ZOOMS[(i + (d || 1) + E.ZOOMS.length) % E.ZOOMS.length];
      this.cam.x = centerT.x * this.zoom - E.VIEW.w / 2;
      this.cam.y = centerT.y * this.zoom - E.VIEW.h / 2;
      this.clampCam();
      return this.zoom;
    }
    /** 螢幕座標（內部像素）→ 磁磚座標；不在編輯區回 null */
    cellAt(sx, sy) {
      if (sx < E.VIEW.x || sx >= E.VIEW.x + E.VIEW.w || sy < E.VIEW.y || sy >= E.VIEW.y + E.VIEW.h) return null;
      const x = Math.floor((sx - E.VIEW.x + this.cam.x) / this.zoom);
      const y = Math.floor((sy - E.VIEW.y + this.cam.y) / this.zoom);
      return this.inside(x, y) ? { x, y } : null;
    }
    /** 磁磚座標 → 螢幕座標（左上角） */
    screenOf(x, y) {
      return { x: E.VIEW.x + x * this.zoom - this.cam.x, y: E.VIEW.y + y * this.zoom - this.cam.y };
    }

    // ---------- 尺寸 / 主題 / 魔王 ----------
    resize(w, h) {
      const cu = C();
      w = Math.max(cu.MIN_W, Math.min(cu.MAX_W, w | 0));
      h = Math.max(cu.MIN_H, Math.min(cu.MAX_H, h | 0));
      if (w === this.data.w && h === this.data.h) return false;
      this.push();
      const d = this.data, rows = [], deco = [];
      for (let y = 0; y < h; y++) {
        const src = y < d.h ? d.rows[y] : null, srcD = y < d.h ? d.deco[y] : null;
        let r = src ? src.slice(0, w) : (y >= h - 2 ? '#'.repeat(w) : '.'.repeat(w));
        let rd = srcD ? srcD.slice(0, w) : '.'.repeat(w);
        if (r.length < w) r += (y >= h - 2 ? '#' : '.').repeat(w - r.length);
        if (rd.length < w) rd += '.'.repeat(w - rd.length);
        rows.push(r); deco.push(rd);
      }
      d.w = w; d.h = h; d.rows = rows; d.deco = deco;
      d.objs = d.objs.filter(o => o.x < w && o.y < h);
      d.spawn = [Math.min(d.spawn[0], w - 1), Math.min(d.spawn[1], h - 1)];
      if (d.exit) d.exit = [Math.min(d.exit[0], w - 1), Math.min(d.exit[1], h - 1)];
      if (d.bossPos) d.bossPos = [Math.min(d.bossPos[0], w - 1), Math.min(d.bossPos[1], h - 1)];
      this.dirty = true; this.clampCam();
      return true;
    }
    setTheme(t) {
      if (C().THEME_KEYS.indexOf(t) < 0 || t === this.data.theme) return false;
      this.push();
      this.data.theme = t;
      // 裝飾字元依主題不同 → 不合法的清掉
      const okCh = C().DECO[t] || '';
      this.data.deco = this.data.deco.map(r => r.split('').map(ch => (ch === '.' || okCh.indexOf(ch) >= 0) ? ch : '.').join(''));
      this.dirty = true;
      return true;
    }
    setBoss(k) {
      if (!C().BOSSES.some(b => b.k === (k || ''))) return false;
      this.push();
      this.data.boss = k || '';
      if (this.data.boss && !this.data.bossPos) this.data.bossPos = [Math.max(0, this.data.w - 6), Math.max(0, this.data.h - 4)];
      this.dirty = true;
      return true;
    }
    setName(n) {
      n = String(n == null ? '' : n).replace(/[\r\n\t]/g, '').trim().slice(0, 16);
      if (!n || n === this.data.name) return false;
      this.push(); this.data.name = n; this.dirty = true;
      return true;
    }

    // ---------- 存 / 讀 / 分享碼 ----------
    saveTo(slot) {
      const i = slot === undefined ? this.slot : slot;
      if (i < 0 || i >= C().SLOTS) return false;
      if (!C().setSlot(i, this.data)) return false;
      this.slot = i; this.dirty = false;
      return true;
    }
    loadFrom(slot) {
      const d = C().slot(slot);
      if (!d) return false;
      this.push();
      this.data = d; this.slot = slot; this.dirty = false;
      this.cur = { x: d.spawn[0], y: d.spawn[1] };
      this.clampCam(); this.centerOnCursor();
      return true;
    }
    shareCode() { return C().encode(this.data); }
    importCode(code) {
      const d = C().decode(code);
      if (!d) return false;
      this.push();
      this.data = d; this.dirty = true;
      this.cur = { x: d.spawn[0], y: d.spawn[1] };
      this.clampCam(); this.centerOnCursor();
      return true;
    }
    check() { return C().check(this.data); }
  }
  E.EditorState = EditorState;

  // ======================================================================
  // 測玩橋接
  // ======================================================================
  E.state = null;            // 目前（或測玩前）的編輯狀態
  E.TEST_ID = 'custom_test';
  E.PLAY_ID = 'custom_play';
  E._testing = false;

  E.testing = function () { return !!E._testing; };

  /** 從編輯器進遊戲試玩；狀態留在 E.state，ESC / 暫停選單「回編輯」原封不動回來 */
  E.testPlay = function (state) {
    state = state || E.state;
    if (!state) return false;
    E.state = state;
    E._testing = true;
    C().register(state.data, E.TEST_ID);
    if (KB.UI && KB.UI.newSession) KB.UI.newSession(KB.START_LIVES, 0, false);
    KB.setScene(new KB.CustomGameScene(E.TEST_ID, { fromEditor: true, rankSlot: -1 }));
    return true;
  };
  /** 回編輯器（暫停選單 / ESC / 測玩結束） */
  E.backToEditor = function () {
    E._testing = false;
    try { if (KB.audio) KB.audio.music(null); } catch (e) { }
    if (!E.state) { KB.setScene(new KB.EditorScene()); return true; }
    KB.setScene(new KB.EditorScene(E.state));
    return true;
  };
  /** 從「自製關卡」選單正式遊玩某個槽位（會記排行） */
  E.playSlot = function (slot) {
    const d = C().slot(slot);
    if (!d) return false;
    E._testing = false;
    C().register(d, E.PLAY_ID);
    if (KB.UI && KB.UI.newSession) KB.UI.newSession(KB.START_LIVES, 0, false);
    KB.setScene(new KB.CustomGameScene(E.PLAY_ID, { fromEditor: false, rankSlot: slot }));
    return true;
  };

  KB.EDITOR = E;

  // ======================================================================
  // 自製關卡的 GameScene（與本體完全同一條建關路徑，只改「過關 / 失敗之後去哪」）
  // ======================================================================
  function defineScene() {
    if (!KB.GameScene) return;
    class CustomGameScene extends KB.GameScene {
      constructor(id, opts) {
        super(id, opts || {});
        this.fromEditor = !!(opts && opts.fromEditor);
        this.rankSlot = (opts && opts.rankSlot !== undefined) ? opts.rankSlot : -1;
        this.custom = true; this.finished = false; this.newBest = false;
      }
      /** 過關：只記自製關排行，不寫 KB.save.cleared（不污染本體存檔 / 成就） */
      levelClear() {
        if (this.clearT >= 0) return;
        this.clearT = 0;
        try { KB.audio.music('clear'); KB.audio.sfx('clear'); } catch (e) { }
        if (this.player && this.player.startDance) this.player.startDance();
        if (this.rankSlot >= 0) {
          const before = KB.CUSTOM.best(this.rankSlot);
          const list = KB.CUSTOM.addBest(this.rankSlot, {
            time: this.timeAlive | 0, score: this.score | 0,
            ability: (this.player && this.player.ability) || 'none',
          });
          this.newBest = !before.length || (list[0] && list[0].time === (this.timeAlive | 0));
        }
      }
      gotoNext() { this.finish('clear'); }
      playerDied() {
        if (this.lives - 1 < 0) { this.lives = 0; this.finish('dead'); return; }
        super.playerDied();
      }
      finish(why) {
        if (this.finished) return;
        this.finished = true;
        try { if (KB.audio && KB.audio.duck) KB.audio.duck(false); } catch (e) { }
        if (this.fromEditor) {
          KB.EDITOR.backToEditor();
          if (KB.EDITOR.state) KB.EDITOR.state.toast(why === 'clear' ? '測玩過關！' : '測玩結束（卡比倒下了）');
        } else {
          KB.setScene(new KB.CustomLevelsScene(this.rankSlot, why === 'clear' ? 'best' : null));
        }
      }
      update(dt) {
        // 過關演出跑 150 幀就收尾（不經本體的 ResultScene：自製關不計分數紀錄）
        if (this.clearT >= 150) { this.finish('clear'); return; }
        super.update(dt);
      }
    }
    KB.CustomGameScene = CustomGameScene;
  }
  if (KB.GameScene) defineScene();
  else if (typeof window !== 'undefined') window.addEventListener('load', defineScene);
})();
