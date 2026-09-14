// 多存檔槽 KB.SAVES + 存檔選擇畫面 KB.SaveSelectScene（Round 8 挑戰與個人化 / agent: saves-input）
// ============================================================================
// localStorage：
//   kirbystar_save_1 / _2 / _3   3 個存檔槽（內容＝原本的 KB.save）
//   kirbystar_slot               目前使用中的槽（1~3）
//   kirbystar_global             全域資料：{ settings:{…}, bindings:{keyboard,gamepad}, slot, migrated }
//                                （設定與按鍵綁定「不隨槽」，換槽不會變）
//   kirbystar_save               Round 1~7 的舊單一存檔；啟動時若槽 1 為空會自動遷移過去（原檔保留）
// KB.saveGame() 被改寫成「存到目前的槽 + 全域」，簽章不變（無參數、無回傳）。
// KB.save 物件本身永遠是同一個（換槽是就地清空再填入），其他模組快取的參考不會失效。
// 本檔在 index.html 載入於 ui.js **之前**，KB.UI / KB.PROG 只能在函式裡取用。
// ============================================================================
(function () {
  'use strict';
  const W = KB.W, H = KB.H;
  const SLOTS = 3;
  const SLOT_KEY = 'kirbystar_slot';
  const GLOBAL_KEY = 'kirbystar_global';
  const LEGACY_KEY = 'kirbystar_save';
  const slotKey = n => 'kirbystar_save_' + n;

  const LS = () => { try { return window.localStorage; } catch (e) { return null; } };
  function readJSON(k) {
    try { const ls = LS(); if (!ls) return null; const raw = ls.getItem(k); if (!raw) return null; const o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; }
    catch (e) { return null; }
  }
  function writeJSON(k, o) { try { const ls = LS(); if (!ls) return false; ls.setItem(k, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function delKey(k) { try { const ls = LS(); if (ls) ls.removeItem(k); } catch (e) { } }
  const clampSlot = n => Math.max(1, Math.min(SLOTS, n | 0 || 1));

  // 空白存檔（欄位與 game.js 的初始 KB.save 一致，另加 playTime / savedAt）
  function blank() {
    return {
      cleared: {}, score: 0, best: {}, arena: {}, playCount: {}, bestTime: {}, extraCleared: {},
      stars: {}, seen: {}, abilityXp: {}, abilityLv: {}, achievements: {}, rank: {}, secrets: {}, prog: {},
      playTime: 0, savedAt: 0,
    };
  }

  // ---------- 全域資料（設定 + 按鍵綁定，不隨槽）----------
  let G = null;
  function global_() {
    if (G) return G;
    const o = readJSON(GLOBAL_KEY) || {};
    if (!o.settings || typeof o.settings !== 'object') o.settings = {};
    G = o;
    return G;
  }
  function saveGlobal() {
    const g = global_();
    g.slot = cur;
    try { if (KB.input && KB.input.getBindings) g.bindings = KB.input.getBindings(); } catch (e) { }
    return writeJSON(GLOBAL_KEY, g);
  }

  // ---------- 槽存取 ----------
  function readSlot(n) { return readJSON(slotKey(clampSlot(n))); }
  function hasData(d) {
    if (!d || typeof d !== 'object') return false;
    const cnt = o => (o && typeof o === 'object') ? Object.keys(o).length : 0;
    return !!(cnt(d.cleared) || cnt(d.playCount) || cnt(d.stars) || cnt(d.best) || cnt(d.seen)
      || cnt(d.achievements) || cnt(d.abilityXp) || (d.playTime | 0) > 0 || (d.score | 0) > 0 || d.ending);
  }
  function isEmpty(n) { return !hasData(readSlot(n)); }

  // 就地取代 KB.save 的內容（保持同一個物件參考）
  function applyData(data) {
    const s = KB.save = KB.save || {};
    for (const k in s) if (Object.prototype.hasOwnProperty.call(s, k)) delete s[k];
    Object.assign(s, blank(), data || {});
    s.settings = global_().settings;      // 設定是全域的：與 kirbystar_global 共用同一個物件
    return s;
  }
  // 存檔用的快照：settings 不寫進槽（全域資料才是事實來源）
  function slotSnapshot() {
    const s = KB.save || {}, out = {};
    for (const k in s) if (Object.prototype.hasOwnProperty.call(s, k) && k !== 'settings') out[k] = s[k];
    return out;
  }

  // 換槽 / 載入後讓各系統重新讀一次
  function refresh() {
    const s = KB.save;
    s.settings = global_().settings;
    try { if (KB.PROG && KB.PROG.save) KB.PROG.save(); } catch (e) { }          // 補齊 Round 6 欄位
    try { if (KB.PROG && KB.PROG.backfill) KB.PROG.backfill(); } catch (e) { }  // 換槽當下靜默補齊成就（ach2）
    try { if (KB.UI && KB.UI.settings) KB.UI.settings(); } catch (e) { }        // 補齊設定預設值
    try {
      const a = s.settings && s.settings.audio;
      if (a && KB.audio && KB.audio.setVolume) KB.audio.setVolume({ music: a.music, sfx: a.sfx });
    } catch (e) { }
    try { if (KB.resizeCanvas) KB.resizeCanvas(); } catch (e) { }
  }

  // ---------- 摘要 ----------
  const levelIds = () => (KB.LEVELS || []).map(l => l.id);
  function summaryOf(d, n) {
    // 注意：savedAt 是 13 位數的時間戳，用 |0 會溢位成負數 → 一律走 Number
    const lv = levelIds(), num = v => { const x = +v; return isFinite(x) ? Math.floor(x) : 0; };
    const cnt = o => (o && typeof o === 'object') ? Object.keys(o).filter(k => o[k]).length : 0;
    let stars = 0;
    if (d && d.stars) for (const k in d.stars) if (Array.isArray(d.stars[k])) stars += d.stars[k].filter(Boolean).length;
    let clears = 0;
    if (d && d.cleared) for (const id of lv) if (d.cleared[id]) clears++;
    const seenMax = (KB.UI && KB.UI.abilityKeys) ? KB.UI.abilityKeys().length : ((KB.ABILITY_KEYS || []).length || 44);
    const achMax = (KB.PROG && KB.PROG.achTotal) ? KB.PROG.achTotal() : 20;
    return {
      slot: n, empty: !hasData(d),
      clears, clearMax: lv.length || 7,
      stars, starMax: (lv.length || 7) * 3,
      seen: cnt(d && d.seen), seenMax,
      ach: cnt(d && d.achievements), achMax,
      playTime: num(d && d.playTime), savedAt: num(d && d.savedAt),
      score: num(d && d.score), ending: !!(d && d.ending),
      current: n === cur,
    };
  }

  // 秒 → h:mm:ss / mm:ss
  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
  }
  // 時間戳 → MM/DD HH:MM
  function fmtDate(ts) {
    if (!ts) return '--/-- --:--';
    try {
      const d = new Date(ts), p = n => String(n).padStart(2, '0');
      return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return '--/-- --:--'; }
  }

  // ---------- 目前槽 ----------
  // kirbystar_slot 直接存數字字串（1~3，方便人工檢查）
  function readCur() {
    try { const ls = LS(); const v = ls && ls.getItem(SLOT_KEY); const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10); return (n >= 1 && n <= SLOTS) ? n : 1; }
    catch (e) { return 1; }
  }
  let cur = readCur();
  function writeCur() { try { const ls = LS(); if (ls) ls.setItem(SLOT_KEY, String(cur)); } catch (e) { } }

  // ---------- 舊存檔遷移 ----------
  function migrate() {
    const g = global_();
    if (g.migrated) return false;
    const legacy = readJSON(LEGACY_KEY);
    g.migrated = 1;
    if (!legacy || !hasData(legacy)) { writeJSON(GLOBAL_KEY, g); return false; }
    if (hasData(readSlot(1))) { writeJSON(GLOBAL_KEY, g); return false; }   // 槽 1 已有資料就不覆蓋
    const data = {};
    for (const k in legacy) if (k !== 'settings') data[k] = legacy[k];
    data.savedAt = (legacy.savedAt | 0) || Date.now();
    data.playTime = legacy.playTime | 0;
    writeJSON(slotKey(1), data);
    // 設定（含音量）升級成全域
    if (legacy.settings && typeof legacy.settings === 'object') {
      for (const k in legacy.settings) if (!(k in g.settings)) g.settings[k] = legacy.settings[k];
    }
    g.migratedFrom = LEGACY_KEY;
    writeJSON(GLOBAL_KEY, g);
    return true;
  }

  // ============================================================ KB.SAVES
  const SAVES = {
    SLOTS, SLOT_KEY, GLOBAL_KEY, LEGACY_KEY, KEY_PREFIX: 'kirbystar_save_',
    slotKey,
    /** 目前使用中的槽（1~3） */
    current() { return cur; },
    /** 每個槽的摘要（陣列長度 3）：{slot, empty, clears, stars, seen, ach, playTime, savedAt, …} */
    list() { const out = []; for (let i = 1; i <= SLOTS; i++) out.push(summaryOf(readSlot(i), i)); return out; },
    /** 單一槽摘要 */
    info(n) { return summaryOf(readSlot(n), clampSlot(n)); },
    isEmpty(n) { return isEmpty(n); },
    /** 原始槽資料（測試 / 複製用） */
    raw(n) { return readSlot(n); },
    /** 載入第 n 槽：取代 KB.save 內容，並讓 KB.PROG / KB.audio / UI.settings 重新讀取 */
    load(n) {
      n = clampSlot(n);
      if (n !== cur && hasData(slotSnapshot())) writeJSON(slotKey(cur), slotSnapshot());   // 先保住目前進度
      cur = n; writeCur();
      applyData(readSlot(n));
      refresh();
      saveGlobal();
      return KB.save;
    },
    /** 存到目前的槽（KB.saveGame 走這裡） */
    save() {
      const s = KB.save = KB.save || blank();
      s.savedAt = Date.now();
      if (typeof s.playTime !== 'number') s.playTime = 0;
      const ok = writeJSON(slotKey(cur), slotSnapshot());
      saveGlobal();
      return ok;
    },
    /** 複製 a → b（b 會被覆蓋）；a 是空槽時回傳 false */
    copy(a, b) {
      a = clampSlot(a); b = clampSlot(b);
      if (a === b) return false;
      const d = (a === cur) ? slotSnapshot() : readSlot(a);
      if (!hasData(d)) return false;
      const copyData = JSON.parse(JSON.stringify(d));
      copyData.savedAt = Date.now();
      writeJSON(slotKey(b), copyData);
      if (b === cur) { applyData(copyData); refresh(); }
      return true;
    },
    /** 刪除第 n 槽（目前槽被刪就順便清空 KB.save） */
    erase(n) {
      n = clampSlot(n);
      delKey(slotKey(n));
      if (n === cur) { applyData(null); refresh(); }
      return true;
    },
    /** 全域資料（設定 + 綁定）；settings 與 KB.save.settings 是同一個物件 */
    globals() { return global_(); },
    saveGlobal,
    /** 遊玩時間 */
    fmtTime, fmtDate,
    playTime() { return (KB.save && KB.save.playTime | 0) || 0; },
    /** 每幀呼叫（GameScene 內已自動接）：每 60 幀 +1 秒，每 30 秒寫回一次 */
    tick(scene) {
      const s = KB.save; if (!s) return;
      if (scene && (scene.paused || scene.fadeDir > 0)) return;
      tickF++;
      if (tickF % 60 === 0) { s.playTime = (s.playTime | 0) + 1; }
      if (tickF % 1800 === 0) { s.savedAt = Date.now(); writeJSON(slotKey(cur), slotSnapshot()); }
    },
    /** 測試用：重新讀取 localStorage（不重整頁面） */
    reload() { G = null; cur = readCur(); applyData(readSlot(cur)); refresh(); try { KB.input && KB.input.loadBindings && KB.input.loadBindings(); } catch (e) { } return KB.save; },
  };
  let tickF = 0;
  KB.SAVES = SAVES;

  // ---------- 啟動：遷移 → 載入目前槽 → 改寫 KB.saveGame ----------
  migrate();
  applyData(readSlot(cur));
  writeCur();
  KB.saveGame = function () { SAVES.save(); };
  // 綁定：input.js 啟動時已套用過 kirbystar_global，這裡只補「舊存檔裡沒有綁定」的情形（no-op）
  try { if (KB.input && KB.input.loadBindings) KB.input.loadBindings(); } catch (e) { }
  refresh();

  // ---------- 遊玩時間：monkeypatch GameScene.update（不動 game.js）----------
  (function hookPlayTime() {
    const GS = KB.GameScene;
    if (!GS || !GS.prototype || GS.prototype.__savesTick) return;
    const orig = GS.prototype.update;
    GS.prototype.update = function (dt) { orig.call(this, dt); try { SAVES.tick(this); } catch (e) { } };
    GS.prototype.__savesTick = true;
  })();

  // ============================================================ 存檔選擇畫面
  const U = () => KB.UI;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };

  const CARD_X = 16, CARD_W = 234, CARD_Y = 30, CARD_H = 54, CARD_GAP = 4;   // 左邊留 16px 給游標

  class SaveSelectScene {
    /** opts: { menu:true 當成子選單用（update 回傳 'back'）, onPick(slot), back() } */
    constructor(opts) {
      opts = opts || {};
      this.menuMode = !!opts.menu;
      this.onPick = opts.onPick || null;
      this.backFn = opts.back || null;
      this.sel = Math.max(0, SAVES.current() - 1);
      this.mode = 'list';           // list | menu | copyTo | confirm
      this.msub = 0; this.csub = 0; this.target = 0;
      this.confirmData = null;
      this.toast = ''; this.toastT = 0;
      this.t = 0; this.frame = 0; this.fade = this.menuMode ? 0 : 1; this.leaving = null;
      this.list = SAVES.list();
    }
    enter() { music('select'); }
    exit() { }
    refreshList() { this.list = SAVES.list(); }
    say(msg) { this.toast = msg; this.toastT = 150; }

    back() {
      if (this.menuMode) return 'back';
      const go = this.backFn || (() => KB.setScene(KB.TitleScene ? new KB.TitleScene() : KB.scene));
      const UI = U();
      if (UI && UI.leave) UI.leave(this, go); else go();
      return null;
    }

    // 選定某個槽 → 載入
    pick(n) {
      const info = SAVES.info(n);
      SAVES.load(n);
      sfx('select');
      if (this.onPick) { this.onPick(n, info); return this.menuMode ? 'back' : null; }
      if (this.menuMode) { this.say('已載入檔案 ' + n); this.refreshList(); return null; }
      const UI = U();
      const go = () => {
        if (!info.empty && KB.StageSelectScene) KB.setScene(new KB.StageSelectScene(0));
        else KB.setScene(KB.TitleScene ? new KB.TitleScene() : KB.scene);
      };
      if (UI && UI.leave) UI.leave(this, go); else go();
      return null;
    }

    update(dt) {
      this.t += (dt || 1 / 60); this.frame++;
      if (this.toastT > 0) this.toastT--;
      const UI = U();
      if (!this.menuMode && UI && UI.stepFade && UI.stepFade(this)) return null;
      const inp = KB.input;
      const n = SAVES.SLOTS;

      if (this.mode === 'confirm') {
        if (inp.pressed('left') || inp.pressed('right')) { this.csub ^= 1; sfx('menu'); }
        if (inp.pressed('up') || inp.pressed('down')) { this.csub ^= 1; sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
          const yes = this.csub === 1, cd = this.confirmData;
          this.mode = 'list'; this.confirmData = null;
          if (yes && cd) { cd.run.call(this); sfx('select'); } else sfx('menu_back');
          this.refreshList();
        } else if (inp.pressed('select')) { this.mode = 'list'; this.confirmData = null; sfx('menu_back'); }
        return null;
      }

      if (this.mode === 'copyTo') {
        const opts = this.copyOpts;
        if (inp.pressed('down')) { this.msub = (this.msub + 1) % opts.length; sfx('menu'); }
        if (inp.pressed('up')) { this.msub = (this.msub - 1 + opts.length) % opts.length; sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
          const o = opts[this.msub];
          if (o.cancel) { this.mode = 'list'; sfx('menu_back'); return null; }
          const from = this.sel + 1, to = o.slot;
          this.target = to;
          this.askConfirm('複製 檔案' + from + ' → 檔案' + to + (SAVES.isEmpty(to) ? '？' : '（覆蓋）？'), function () {
            if (SAVES.copy(from, to)) this.say('已複製到檔案 ' + to); else this.say('複製失敗：來源是空的');
          });
          return null;
        }
        if (inp.pressed('select')) { this.mode = 'list'; sfx('menu_back'); }
        return null;
      }

      if (this.mode === 'menu') {
        const items = this.menuItems;
        if (inp.pressed('down')) { this.msub = (this.msub + 1) % items.length; sfx('menu'); }
        if (inp.pressed('up')) { this.msub = (this.msub - 1 + items.length) % items.length; sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
          const id = items[this.msub].id, slot = this.sel + 1;
          if (id === 'cancel') { this.mode = 'list'; sfx('menu_back'); return null; }
          if (id === 'copy') {
            this.copyOpts = [];
            for (let i = 1; i <= n; i++) if (i !== slot) this.copyOpts.push({ slot: i, label: '檔案 ' + i + (SAVES.isEmpty(i) ? '（空）' : '（有資料）') });
            this.copyOpts.push({ cancel: true, label: '取消' });
            this.mode = 'copyTo'; this.msub = 0; sfx('menu');
            return null;
          }
          if (id === 'erase') {
            this.askConfirm('刪除 檔案 ' + slot + ' 的所有進度？', function () { SAVES.erase(slot); this.say('檔案 ' + slot + ' 已刪除'); });
            return null;
          }
        }
        if (inp.pressed('select')) { this.mode = 'list'; sfx('menu_back'); }
        return null;
      }

      // ---- list ----
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('attack')) return this.pick(this.sel + 1);
      if (inp.pressed('select')) {
        const slot = this.sel + 1;
        this.menuItems = [{ id: 'copy', label: '複製到其他檔案' }];
        if (!SAVES.isEmpty(slot)) this.menuItems.push({ id: 'erase', label: '刪除這個檔案' });
        this.menuItems.push({ id: 'cancel', label: '取消' });
        this.mode = 'menu'; this.msub = 0; sfx('menu');
        return null;
      }
      if (inp.pressed('start')) { sfx('menu_back'); return this.back(); }
      return null;
    }

    askConfirm(text, run) { this.confirmData = { text, run }; this.csub = 0; this.mode = 'confirm'; sfx('menu'); }

    // ---------------------------------------------------------------- 繪製
    drawBg(ctx) {
      const UI = U();
      if (this.menuMode) { KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)'); return; }
      if (UI && UI.bands) UI.bands(ctx, 0, H, ['#0c1430', '#141c48', '#1c2860', '#182038']);
      else KB.rect(ctx, 0, 0, W, H, '#141c48');
      if (UI && UI.mkStars) {
        this._stars = this._stars || UI.mkStars(40, 31, 0, 0, W, H);
        UI.drawStars(ctx, this._stars, this.t);
      }
    }

    draw(ctx) {
      const UI = U(); if (!UI) return;
      const C = UI.C, T = UI.text, panel = UI.panel, fit = UI.fitText;
      this.drawBg(ctx);
      if (!this.menuMode) UI.bigText(ctx, 'FILE', 6, 6, 2, { color: '#fff', outline: '#101830', spacing: 0 });
      T(ctx, '選擇存檔', this.menuMode ? 8 : 76, 5, { color: C.yellow, size: 16, outline: '#101830' });
      T(ctx, '目前：檔案 ' + SAVES.current(), 250, 8, { color: C.cyan, size: UI.MS_SMALL, align: 'right', outline: '#101830' });

      for (let i = 0; i < SAVES.SLOTS; i++) this.drawCard(ctx, i);

      const hint = this.mode === 'list' ? 'Z 選擇　SELECT 選項　START 返回' : 'Z 確定　SELECT 取消';
      fit(ctx, hint, 128, 208, 244, { color: C.grey, align: 'center', size: UI.MS });

      if (this.mode === 'menu') this.drawMenu(ctx);
      else if (this.mode === 'copyTo') this.drawCopyTo(ctx);
      else if (this.mode === 'confirm') this.drawConfirm(ctx);
      else if (this.toastT > 0) this.drawToast(ctx);

      if (!this.menuMode) { if (UI.drawMuteToast) UI.drawMuteToast(ctx); if (UI.drawFade) UI.drawFade(ctx, this); }
    }

    drawCard(ctx, i) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel, fit = UI.fitText;
      const d = this.list[i] || SAVES.info(i + 1);
      const y = CARD_Y + i * (CARD_H + CARD_GAP), sel = this.sel === i && this.mode === 'list';
      const selAny = this.sel === i;
      panel(ctx, CARD_X, y, CARD_W, CARD_H, selAny ? '#1a2450' : '#141b30', selAny ? C.yellow : '#5c6884');
      if (sel) UI.cursor(ctx, 5, y + CARD_H / 2 - 4, this.frame);
      // 標題列：檔案 n（目前使用中 → 小標）＋ 最後儲存時間
      // font2：卡片標題列與「使用中」徽章（x+62）、第 2 列（y+22）之間只有 17px ⇒ 維持 12px；
      //        這一頁的標題級文字是頁首「選擇存檔」（16px）。
      T(ctx, '檔案 ' + (i + 1), CARD_X + 10, y + 5, { color: selAny ? C.yellow : '#fff', size: UI.MS });
      if (d.current) {
        KB.rect(ctx, CARD_X + 62, y + 6, 40, 12, '#2a5a3a');
        T(ctx, '使用中', CARD_X + 82, y + 6, { color: '#80e0a0', size: UI.MS_SMALL, align: 'center' });
      }
      if (d.empty) {
        const cx = CARD_X + CARD_W / 2;
        T(ctx, '－ 新遊戲 －', cx, y + 22, { color: selAny ? '#fff' : C.grey, size: UI.MS, align: 'center' });
        T(ctx, '按 Z 從頭開始冒險', cx, y + 40, { color: C.grey, size: UI.MS_SMALL, align: 'center' });
        return;
      }
      T(ctx, SAVES.fmtDate(d.savedAt), CARD_X + CARD_W - 8, y + 7, { color: '#8fa0bc', size: UI.MS_SMALL, align: 'right' });
      // 第 2 列：通關 / 大星星 / 能力
      const y2 = y + 22, y3 = y + 38;
      const cell = (x, yy, label, val, col) => {
        T(ctx, label, x, yy, { color: '#8fa0bc', size: UI.MS_SMALL });
        KB.text(ctx, val, x + 34, yy + 2, { color: col || '#fff' });
      };
      cell(CARD_X + 8, y2, '通關', d.clears + '/' + d.clearMax, d.clears >= d.clearMax ? C.yellow : '#fff');
      cell(CARD_X + 80, y2, '星星', d.stars + '/' + d.starMax, d.stars >= d.starMax ? C.yellow : '#fff');
      cell(CARD_X + 152, y2, '能力', d.seen + '/' + d.seenMax, (d.seenMax && d.seen >= d.seenMax) ? C.yellow : '#fff');
      cell(CARD_X + 8, y3, '成就', d.ach + '/' + d.achMax, d.ach >= d.achMax ? C.yellow : '#fff');
      cell(CARD_X + 80, y3, '時間', SAVES.fmtTime(d.playTime), C.cyan);
      if (d.ending) { KB.rect(ctx, CARD_X + CARD_W - 30, y3, 26, 11, '#5a2a6a'); KB.text(ctx, 'END', CARD_X + CARD_W - 17, y3 + 2, { color: '#ffb0d0', align: 'center' }); }
    }

    // 子選單（複製 / 刪除 / 取消）
    drawMenu(ctx) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const items = this.menuItems, h = 30 + items.length * 20;
      const x = 48, y = 70;
      panel(ctx, x, y, 160, h);
      T(ctx, '檔案 ' + (this.sel + 1), x + 80, y + 6, { color: C.yellow, size: UI.MS, align: 'center' });
      KB.rect(ctx, x + 8, y + 24, 144, 1, '#405070');
      for (let i = 0; i < items.length; i++) {
        const yy = y + 30 + i * 20, s = this.msub === i;
        if (s) UI.cursor(ctx, x + 10, yy + 3, this.frame);
        UI.fitText(ctx, items[i].label, x + 26, yy, 126, { color: s ? C.yellow : '#fff', size: UI.MS });
      }
    }

    drawCopyTo(ctx) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const items = this.copyOpts, h = 30 + items.length * 20;
      const x = 40, y = 66;
      panel(ctx, x, y, 176, h);
      T(ctx, '把 檔案 ' + (this.sel + 1) + ' 複製到…', x + 88, y + 6, { color: C.yellow, size: UI.MS, align: 'center' });
      KB.rect(ctx, x + 8, y + 24, 160, 1, '#405070');
      for (let i = 0; i < items.length; i++) {
        const yy = y + 30 + i * 20, s = this.msub === i;
        if (s) UI.cursor(ctx, x + 10, yy + 3, this.frame);
        UI.fitText(ctx, items[i].label, x + 26, yy, 142, { color: s ? C.yellow : (items[i].cancel ? C.grey : '#fff'), size: UI.MS });
      }
    }

    // 二次確認
    drawConfirm(ctx) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const x = 26, y = 78, w = 204, h = 74;
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.55)');
      panel(ctx, x, y, w, h, '#2a1830', '#ffb0d0');
      UI.fitText(ctx, this.confirmData.text, x + w / 2, y + 12, w - 20, { color: '#fff', size: UI.MS, align: 'center' });
      UI.fitText(ctx, '這個動作無法復原', x + w / 2, y + 30, w - 20, { color: '#ff9090', size: UI.MS_SMALL, align: 'center' });
      const opts = ['取消', '確定'];
      for (let i = 0; i < 2; i++) {
        const bx = x + 26 + i * 100, by = y + 48, s = this.csub === i;
        KB.rect(ctx, bx, by, 76, 18, s ? (i ? '#a02040' : '#30507a') : '#1a2030');
        KB.rect(ctx, bx, by, 76, 1, s ? '#ffffff' : '#404858');
        T(ctx, opts[i], bx + 38, by + 2, { color: s ? '#fff' : '#8fa0bc', size: UI.MS, align: 'center' });
      }
    }

    drawToast(ctx) {
      const UI = U(), T = UI.text;
      const a = Math.min(1, this.toastT / 30);
      ctx.globalAlpha = a;
      KB.rect(ctx, 28, 188, 200, 16, 'rgba(8,14,28,0.85)');
      T(ctx, this.toast, 128, 190, { color: '#80e0a0', size: UI.MS, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
  KB.SaveSelectScene = SaveSelectScene;
  /** 給 SettingsMenu / 暫停選單當子選單用：new KB.SaveSelectMenu() → update() 回傳 'back' */
  KB.SaveSelectMenu = function (opts) { return new SaveSelectScene(Object.assign({ menu: true }, opts || {})); };
})();
