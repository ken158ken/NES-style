// 按鍵重映射 KB.KeyConfigScene（Round 8 挑戰與個人化 / agent: saves-input）
// ============================================================================
// 8 個動作（KB.input.ACTIONS）× 最多 3 個鍵盤鍵 + 1 個手把按鈕。
//   Z      進入監聽 → 按下任意鍵（或手把按鈕）即綁定；衝突時自動從舊動作移除並提示
//   X      移除該動作的最後一個鍵（每個動作至少保留 1 個鍵）
//   SELECT 還原預設（二次確認）
//   START / Esc 返回
// 綁定存在 localStorage kirbystar_global（全域，不隨存檔槽），由 input.js 的
// loadBindings / saveBindings 負責，啟動時 input.js 會自動套用。
// 本檔在 index.html 載入於 ui.js **之前**，KB.UI 只能在函式裡取用。
// ============================================================================
(function () {
  'use strict';
  const W = KB.W, H = KB.H;
  const U = () => KB.UI;
  const IN = () => KB.input;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };

  const ROW_Y = 40, ROW_H = 18, MAX_KEYS = 3;
  // 動作欄只有 54px（14px 中文 ≤ 4 字）：太長的名稱在列表用短名，對話框 / 訊息仍用完整名稱
  const SHORT_NAME = { attack: '攻擊' };
  // R8-P2-06：鍵名框只有 39px，'Shift(右)' 會被 fit 截成「Shi…」讀不出左右 ⇒
  // 列表改用完整放得下的短名（'LShift' 35px / 'RShift' 36px，不會被截字）。
  // 監聽對話框 / 衝突訊息仍用 input.js 的完整名稱。
  const SHORT_CODE = {
    ShiftLeft: 'LShift', ShiftRight: 'RShift',
    ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
    AltLeft: 'LAlt', AltRight: 'RAlt',
    NumpadEnter: '數Ent',
  };
  const keyLabel = (inp, code) => SHORT_CODE[code] || inp.codeName(code);
  const KEY_X = [76, 121, 166], KEY_W = 43, GP_X = 211, GP_W = 39;   // 鍵名框放得下「空白鍵」(39px)、手把框放得下 L1/R1 (35px)

  class KeyConfigScene {
    /** opts: { menu:true 當成子選單（update 回傳 'back'）, back() } */
    constructor(opts) {
      opts = opts || {};
      this.menuMode = !!opts.menu;
      this.backFn = opts.back || null;
      this.sel = 0; this.mode = 'list';      // list | listen | confirm
      this.csub = 0;
      this.msg = ''; this.msgT = 0; this.msgCol = '#80e0a0';
      this.t = 0; this.frame = 0; this.fade = this.menuMode ? 0 : 1; this.leaving = null;
      this.lockT = 0; this.cancelCapture = null; this.gpReady = false;
    }
    enter() { music('select'); }
    exit() { this.stopListen(); }
    actions() { return (IN().ACTIONS || []).slice(0, 8); }
    say(m, col) { this.msg = m; this.msgT = 180; this.msgCol = col || '#80e0a0'; }

    back() {
      this.stopListen();
      if (this.menuMode) return 'back';
      const go = this.backFn || (() => KB.setScene(KB.TitleScene ? new KB.TitleScene() : KB.scene));
      const UI = U();
      if (UI && UI.leave) UI.leave(this, go); else go();
      return null;
    }

    // ---------------------------------------------------------------- 監聽
    startListen() {
      const inp = IN();
      this.mode = 'listen'; this.gpReady = false; this.listenT = 0;
      this.stopListen();
      const action = this.actions()[this.sel];
      this.cancelCapture = inp.captureKey(code => {
        if (code === 'Escape') { this.mode = 'list'; this.lockT = 8; sfx('menu_back'); return true; }
        this.bindKey(action, code);
        this.mode = 'list'; this.lockT = 8;
        return true;
      });
    }
    stopListen() { if (this.cancelCapture) { try { this.cancelCapture(); } catch (e) { } this.cancelCapture = null; } }

    /** 綁定鍵盤鍵；處理「最多 3 個」與跨動作衝突 */
    bindKey(action, code) {
      const inp = IN(), NAME = inp.ACTION_NAMES || {};
      const list = (inp.BINDINGS[action] || []).slice();
      if (list.indexOf(code) >= 0) { this.say(inp.codeName(code) + ' 已經是「' + (NAME[action] || action) + '」的鍵', '#ffe040'); sfx('menu_back'); return false; }
      const owner = inp.actionOf ? inp.actionOf(code) : null;
      if (owner && owner !== action && (inp.BINDINGS[owner] || []).length <= 1) {
        this.say('「' + (NAME[owner] || owner) + '」只剩這一個鍵，不能搶走', '#ff9090'); sfx('menu_back'); return false;
      }
      list.unshift(code);
      while (list.length > MAX_KEYS) list.pop();
      inp.rebind(action, list);                 // rebind 會自動把這個鍵從其他動作移除
      inp.saveBindings();
      if (owner && owner !== action) this.say(inp.codeName(code) + ' 原本是「' + (NAME[owner] || owner) + '」，已從該動作移除', '#ffe040');
      else this.say('「' + (NAME[action] || action) + '」＝ ' + inp.codeName(code));
      sfx('select');
      return true;
    }

    /** 綁定手把按鈕 */
    bindButton(action, idx) {
      const inp = IN(), NAME = inp.ACTION_NAMES || {};
      let owner = null;
      for (const a of this.actions()) if (a !== action && (inp.GAMEPAD[a] || []).indexOf(idx) >= 0) owner = a;
      inp.rebindGamepad(action, idx);
      inp.saveBindings();
      if (owner) this.say('手把 ' + inp.buttonName(idx) + ' 原本是「' + (NAME[owner] || owner) + '」，已移除', '#ffe040');
      else this.say('「' + (NAME[action] || action) + '」＝ 手把 ' + inp.buttonName(idx));
      sfx('select');
      return true;
    }

    removeKey(action) {
      const inp = IN(), NAME = inp.ACTION_NAMES || {};
      const list = (inp.BINDINGS[action] || []).slice();
      if (list.length <= 1) { this.say('「' + (NAME[action] || action) + '」至少要保留一個鍵', '#ff9090'); sfx('menu_back'); return false; }
      const gone = list.pop();
      inp.rebind(action, list); inp.saveBindings();
      this.say('已移除 ' + inp.codeName(gone), '#ffb0d0'); sfx('menu');
      return true;
    }

    resetAll() {
      const inp = IN();
      inp.resetBindings(); inp.saveBindings();
      this.say('已還原預設按鍵'); sfx('select');
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      this.t += (dt || 1 / 60); this.frame++;
      if (this.msgT > 0) this.msgT--;
      const UI = U();
      if (!this.menuMode && UI && UI.stepFade && UI.stepFade(this)) return null;
      const inp = IN(), acts = this.actions(), n = acts.length;

      if (this.mode === 'listen') {
        this.listenT++;
        // 手把：先等所有按鈕放開，再接受下一個按下的按鈕
        const pressed = inp.gamepadPressed ? inp.gamepadPressed() : [];
        if (!this.gpReady) { if (!pressed.length) this.gpReady = true; }
        else if (pressed.length) {
          this.stopListen(); this.bindButton(acts[this.sel], pressed[0]); this.mode = 'list'; this.lockT = 10;
        }
        return null;
      }
      if (this.lockT > 0) { this.lockT--; return null; }

      if (this.mode === 'confirm') {
        if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up') || inp.pressed('down')) { this.csub ^= 1; sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
          const yes = this.csub === 1; this.mode = 'list'; this.lockT = 6;
          if (yes) this.resetAll(); else sfx('menu_back');
        } else if (inp.pressed('select')) { this.mode = 'list'; this.lockT = 6; sfx('menu_back'); }
        return null;
      }

      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('jump')) { this.startListen(); sfx('menu'); return null; }
      if (inp.pressed('attack')) { this.removeKey(acts[this.sel]); return null; }
      if (inp.pressed('select')) { this.mode = 'confirm'; this.csub = 0; sfx('menu'); return null; }
      if (inp.pressed('start')) { sfx('menu_back'); return this.back(); }
      return null;
    }

    // ---------------------------------------------------------------- 繪製
    drawBg(ctx) {
      const UI = U();
      if (this.menuMode) { KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)'); return; }
      if (UI && UI.bands) UI.bands(ctx, 0, H, ['#0c1430', '#141c48', '#1c2860', '#182038']);
      else KB.rect(ctx, 0, 0, W, H, '#141c48');
      if (UI && UI.mkStars) {
        this._stars = this._stars || UI.mkStars(36, 52, 0, 0, W, H);
        UI.drawStars(ctx, this._stars, this.t);
      }
    }

    draw(ctx) {
      const UI = U(); if (!UI) return;
      const C = UI.C, T = UI.text, fit = UI.fitText, inp = IN();
      this.drawBg(ctx);
      if (!this.menuMode) UI.bigText(ctx, 'KEYS', 6, 6, 2, { color: '#fff', outline: '#101830', spacing: 0 });
      T(ctx, '按鍵設定', this.menuMode ? 8 : 76, 5, { color: C.yellow, size: 16, outline: '#101830' });
      if (inp.gamepadActive && inp.gamepadActive()) T(ctx, '手把已連線', 250, 8, { color: '#80e0a0', size: UI.MS_SMALL, align: 'right', outline: '#101830' });

      // 表頭
      T(ctx, '動作', 14, 24, { color: '#8fa0bc', size: UI.MS_SMALL, outline: '#101830' });
      T(ctx, '鍵盤（最多 3 個）', KEY_X[0], 24, { color: '#8fa0bc', size: UI.MS_SMALL, outline: '#101830' });
      T(ctx, '手把', GP_X + GP_W / 2, 24, { color: '#8fa0bc', size: UI.MS_SMALL, align: 'center', outline: '#101830' });
      KB.rect(ctx, 6, 38, 244, 1, '#405070');

      const acts = this.actions(), NAME = inp.ACTION_NAMES || {};
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i], y = ROW_Y + i * ROW_H, sel = this.sel === i;
        if (sel) { KB.rect(ctx, 6, y - 2, 244, ROW_H - 1, '#1e2a52'); UI.cursor(ctx, 8, y + 2, this.frame); }
        fit(ctx, SHORT_NAME[a] || NAME[a] || a, 20, y, 54, { color: sel ? C.yellow : '#fff', size: UI.MS });
        // R8-P2-06：預設「丟棄能力」綁 4 個鍵，但只畫得下 3 欄 ⇒ 第 3 欄右側補「+n」，
        // 玩家才知道還有看不到的鍵（還原預設後不會以為鍵不見了）
        const all = inp.BINDINGS[a] || [];
        const codes = all.slice(0, MAX_KEYS), extra = Math.max(0, all.length - MAX_KEYS);
        for (let k = 0; k < MAX_KEYS; k++) {
          const x = KEY_X[k], on = !!codes[k];
          KB.rect(ctx, x, y - 1, KEY_W, 14, on ? (sel ? '#2c3c6c' : '#202a44') : '#161c2c');
          KB.rect(ctx, x, y - 1, KEY_W, 1, on ? '#5c7098' : '#2a3244');
          if (on) {
            const tag = (extra > 0 && k === MAX_KEYS - 1) ? '+' + extra : '';
            const tw = tag ? KB.textWidth(tag, { size: UI.MS_SMALL }) + 2 : 0;
            fit(ctx, keyLabel(inp, codes[k]), x + (KEY_W - tw) / 2, y, KEY_W - 4 - tw, { color: '#fff', size: UI.MS_SMALL, align: 'center' });
            if (tag) T(ctx, tag, x + KEY_W - 2, y, { color: C.yellow, size: UI.MS_SMALL, align: 'right' });
          } else KB.text(ctx, '-', x + KEY_W / 2, y + 2, { color: '#4c5674', align: 'center' });
        }
        const gp = (inp.buttonNames ? inp.buttonNames(a) : []).slice(0, 2).join('/');   // 最多顯示 2 顆（框寬 45px）
        KB.rect(ctx, GP_X, y - 1, GP_W, 14, gp ? (sel ? '#2c3c6c' : '#202a44') : '#161c2c');
        KB.rect(ctx, GP_X, y - 1, GP_W, 1, gp ? '#5c7098' : '#2a3244');
        if (gp) fit(ctx, gp, GP_X + GP_W / 2, y, GP_W - 4, { color: '#c8d8f0', size: UI.MS_SMALL, align: 'center' });
        else KB.text(ctx, '-', GP_X + GP_W / 2, y + 2, { color: '#4c5674', align: 'center' });
      }

      // 訊息列（衝突提示 / 綁定結果）
      KB.rect(ctx, 6, 184, 244, 1, '#405070');
      if (this.msgT > 0) fit(ctx, this.msg, 128, 188, 244, { color: this.msgCol, align: 'center', size: UI.MS_SMALL });
      else fit(ctx, 'Z 設定　X 移除　SELECT 還原預設', 128, 188, 244, { color: C.grey, align: 'center', size: UI.MS_SMALL });
      fit(ctx, this.menuMode ? 'START 返回設定' : 'START / Esc 返回', 128, 204, 244, { color: C.grey, align: 'center', size: UI.MS });

      if (this.mode === 'listen') this.drawListen(ctx);
      else if (this.mode === 'confirm') this.drawConfirm(ctx);
      if (!this.menuMode) { if (UI.drawMuteToast) UI.drawMuteToast(ctx); if (UI.drawFade) UI.drawFade(ctx, this); }
    }

    drawListen(ctx) {
      const UI = U(), C = UI.C, T = UI.text, fit = UI.fitText, inp = IN();
      const a = this.actions()[this.sel], NAME = inp.ACTION_NAMES || {};
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.62)');
      UI.panel(ctx, 26, 76, 204, 76, '#182848', C.yellow);
      T(ctx, '「' + (NAME[a] || a) + '」', 128, 84, { color: C.yellow, size: 16, align: 'center' });
      const blink = ((this.frame >> 4) & 1) ? '#ffffff' : '#98a8c0';
      fit(ctx, '請按下要綁定的按鍵…', 128, 106, 188, { color: blink, size: UI.MS, align: 'center' });
      fit(ctx, '手把按鈕也可以', 128, 122, 188, { color: '#8fa0bc', size: UI.MS_SMALL, align: 'center' });
      fit(ctx, 'Esc 取消', 128, 136, 188, { color: C.grey, size: UI.MS_SMALL, align: 'center' });
    }

    drawConfirm(ctx) {
      const UI = U(), C = UI.C, T = UI.text;
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.55)');
      UI.panel(ctx, 30, 82, 196, 66, '#2a1830', '#ffb0d0');
      UI.fitText(ctx, '把所有按鍵還原成預設？', 128, 92, 180, { color: '#fff', size: UI.MS, align: 'center' });
      const opts = ['取消', '還原'];
      for (let i = 0; i < 2; i++) {
        const bx = 44 + i * 96, by = 118, s = this.csub === i;
        KB.rect(ctx, bx, by, 72, 18, s ? (i ? '#a02040' : '#30507a') : '#1a2030');
        KB.rect(ctx, bx, by, 72, 1, s ? '#ffffff' : '#404858');
        T(ctx, opts[i], bx + 36, by + 2, { color: s ? '#fff' : '#8fa0bc', size: UI.MS, align: 'center' });
      }
    }
  }
  KB.KeyConfigScene = KeyConfigScene;
  /** 給 SettingsMenu 當子選單用：new KB.KeyConfigMenu() → update() 回傳 'back' */
  KB.KeyConfigMenu = function (opts) { return new KeyConfigScene(Object.assign({ menu: true }, opts || {})); };
})();
