// 鍵盤 / 手把 / 觸控 / 虛擬輸入
// 輸入來源：raw（鍵盤）、gamepad、touch（KB.TOUCH 虛擬按鍵，Round 11）三者 OR；virt（除錯 / 截圖）另計。
(function () {
  const NAMES = ['left', 'right', 'up', 'down', 'jump', 'attack', 'select', 'start'];

  // 按鍵綁定（action → KeyboardEvent.code 陣列）；設定頁可透過 KB.input.rebind 修改
  // DEFAULT_KB / DEFAULT_GP 是出廠預設（resetBindings 用），BINDINGS / GP_BINDINGS 物件本身
  // 會被其他模組（KB.KeyConfigScene / ui 說明頁）長期持有，所以一律「就地修改」不換物件。
  const DEFAULT_KB = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'KeyK', 'Space'],
    attack: ['KeyX', 'KeyJ'],
    select: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC'],
    start: ['Enter', 'Escape', 'KeyP'],
  };
  const BINDINGS = {};
  for (const n in DEFAULT_KB) BINDINGS[n] = DEFAULT_KB[n].slice();
  // code → 顯示名稱（供設定頁 / 說明頁）
  const CODE_NAMES = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: '空白鍵', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'BkSp',
    ShiftLeft: 'Shift', ShiftRight: 'Shift(右)', ControlLeft: 'Ctrl', ControlRight: 'Ctrl(右)',
    AltLeft: 'Alt', AltRight: 'Alt(右)', NumpadEnter: 'Enter(數字)',
  };
  function codeName(code) {
    if (CODE_NAMES[code]) return CODE_NAMES[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return '數字' + code.slice(6);
    if (/^F[0-9]+$/.test(code)) return code;
    return code;
  }

  // 手把（標準配置）：0=A(下) 1=B(右) 2=X(左) 3=Y(上)
  const DEFAULT_GP = {
    jump: [0, 1],          // A / B
    attack: [2, 3],        // X / Y
    select: [4, 5, 8],     // L / R / Back
    start: [9],            // Start
    left: [14], right: [15], up: [12], down: [13],   // D-pad
  };
  const GP_BINDINGS = {};
  for (const n in DEFAULT_GP) GP_BINDINGS[n] = DEFAULT_GP[n].slice();
  const DEADZONE = 0.35;   // 類比搖桿死區
  // 標準配置按鈕別名（設定頁顯示用；非標準手把就直接顯示 B<n>）
  const GP_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];
  // 全域設定（按鍵綁定 / 畫面設定）存這裡，不隨存檔槽（多存檔槽見 src/saves.js KB.SAVES）
  const GLOBAL_KEY = 'kirbystar_global';

  let MAP = {};
  function rebuildMap() {
    MAP = {};
    for (const n of NAMES) for (const c of (BINDINGS[n] || [])) MAP[c] = n;
  }
  rebuildMap();

  const cur = {}, prev = {}, raw = {}, virt = {}, touch = {};
  let anyKey = false, virtualOnly = false, gpActive = false;
  NAMES.forEach(n => { cur[n] = false; prev[n] = false; raw[n] = false; touch[n] = false; });

  // ---------- 觸控來源（Round 11，touch.js 呼叫 setTouch）----------
  // frames 由 update() 累加（norun 截圖模式也只在 __kb.step 前進），touchFrame 記錄最後一次觸控輸入；
  // 鍵盤 / 手把有輸入時把 touchFrame 推遠 → touchActive() 立刻變 false（提示文字馬上換回鍵盤名）。
  const TOUCH_WINDOW = 120;          // 最近 120 幀（2 秒）內有觸控 = 觸控模式
  let frames = 0, touchFrame = -1e9;
  function markOther() { if (touchFrame > -1e9) touchFrame = -1e9; }
  // 虛擬鍵標籤（觸控時的提示文字）
  const TOUCH_NAMES = {
    jump: 'A', attack: 'B', select: 'C', start: 'START',
    left: '方向鍵', right: '方向鍵', up: '方向鍵', down: '方向鍵',
  };

  window.addEventListener('keydown', e => {
    const n = MAP[e.code]; if (!n) return;
    if (!raw[n]) { anyKey = true; markOther(); }
    raw[n] = true; e.preventDefault();
    if (KB.audio && KB.audio.unlock) KB.audio.unlock();
  });
  window.addEventListener('keyup', e => { const n = MAP[e.code]; if (n) { raw[n] = false; e.preventDefault(); } });
  window.addEventListener('blur', () => NAMES.forEach(n => { raw[n] = false; touch[n] = false; }));

  function pollGamepad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gps) {
      if (!gp || gp.connected === false) continue;
      const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const btn = arr => (arr || []).some(b);
      // 類比搖桿：套死區（D-pad 與搖桿同時支援）
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const hx = Math.abs(ax) >= DEADZONE ? ax : 0, hy = Math.abs(ay) >= DEADZONE ? ay : 0;
      const g = {
        left: btn(GP_BINDINGS.left) || hx < 0, right: btn(GP_BINDINGS.right) || hx > 0,
        up: btn(GP_BINDINGS.up) || hy < 0, down: btn(GP_BINDINGS.down) || hy > 0,
        jump: btn(GP_BINDINGS.jump), attack: btn(GP_BINDINGS.attack),
        select: btn(GP_BINDINGS.select), start: btn(GP_BINDINGS.start),
      };
      return g;
    }
    return null;
  }

  KB.input = {
    update() {
      const gp = pollGamepad();
      gpActive = !!gp;
      frames++;
      let touching = false;
      for (const n of NAMES) {
        prev[n] = cur[n];
        let v = raw[n] || (gp && gp[n]) || touch[n] || false;
        if (touch[n]) touching = true;
        if (virtualOnly) v = false;     // 觸控與 raw / gamepad 同層，一樣被 virtualOnly 遮掉
        if (virt[n]) v = true;
        cur[n] = !!v;
      }
      if (touching) touchFrame = frames;            // 按住期間持續更新，放開後才開始倒數
      if (gp && Object.values(gp).some(Boolean)) { markOther(); if (KB.audio && KB.audio.unlock) KB.audio.unlock(); }
      const a = anyKey; anyKey = false; return a;
    },
    down(n) { return cur[n]; },
    pressed(n) { return cur[n] && !prev[n]; },
    released(n) { return !cur[n] && prev[n]; },
    any() { return NAMES.some(n => cur[n] && !prev[n]); },
    anyDown() { return NAMES.some(n => cur[n]); },
    // 虛擬輸入（除錯 / 截圖）
    setVirtual(obj, exclusive) { NAMES.forEach(n => virt[n] = !!(obj && obj[n])); virtualOnly = !!exclusive; },
    clearVirtual() { NAMES.forEach(n => virt[n] = false); virtualOnly = false; },

    // ---------- 觸控輸入（Round 11，契約 2）----------
    /** 第三個輸入來源：touch.js 的虛擬按鍵按下 / 放開；name ∈ ACTIONS */
    setTouch(name, on) {
      if (!Object.prototype.hasOwnProperty.call(touch, name)) return false;
      on = !!on;
      if (touch[name] === on) return true;
      touch[name] = on;
      if (on) {
        anyKey = true; touchFrame = frames;
        if (KB.audio && KB.audio.unlock) KB.audio.unlock();     // iOS：手勢中 resume AudioContext
      }
      return true;
    },
    /** 清掉所有觸控按鍵（覆蓋層隱藏 / 失焦時呼叫） */
    clearTouch() { NAMES.forEach(n => touch[n] = false); },
    /** 最近 TOUCH_WINDOW 幀（2 秒）內有觸控輸入，且之後沒有鍵盤 / 手把輸入 */
    touchActive() { return (frames - touchFrame) <= TOUCH_WINDOW; },
    /** 目前觸控按著的動作（除錯 / 測試用） */
    touchDown(n) { return !!touch[n]; },
    /**
     * 提示文字用的按鍵名：觸控時回虛擬鍵標籤（A / B / C / START / 方向鍵），
     * 否則回鍵盤綁定的第一個顯示名（keyNames(action)[0]）。
     */
    hint(action) {
      // 總控（Round 11 ui 跨檔需求）：覆蓋層顯示中（玩家還沒按）也回虛擬鍵名
      const overlay = !!(KB.TOUCH && KB.TOUCH.active && KB.TOUCH.active());
      if ((overlay || KB.input.touchActive()) && TOUCH_NAMES[action]) return TOUCH_NAMES[action];
      const list = KB.input.keyNames(action);
      return list.length ? list[0] : (TOUCH_NAMES[action] || '');
    },
    /** 虛擬鍵標籤表（ui agent 需要時可讀） */
    TOUCH_NAMES,

    // ---------- 按鍵重映射（供設定頁） ----------
    ACTIONS: NAMES.slice(),
    ACTION_NAMES: { left: '左', right: '右', up: '上', down: '下', jump: '跳躍', attack: '攻擊 / 吸入', select: '丟棄能力', start: '暫停' },
    BINDINGS,
    GAMEPAD: GP_BINDINGS,
    deadzone: DEADZONE,
    gamepadActive() { return gpActive; },
    /** 重新綁定：rebind('jump', ['KeyZ','Space'])；回傳是否成功 */
    rebind(action, codes) {
      if (!BINDINGS[action]) return false;
      const list = (Array.isArray(codes) ? codes : [codes]).filter(c => typeof c === 'string' && c);
      if (!list.length) return false;
      // 其他動作若佔用同一鍵，先移除避免衝突
      for (const a of NAMES) {
        if (a === action) continue;
        BINDINGS[a] = BINDINGS[a].filter(c => list.indexOf(c) < 0);
      }
      BINDINGS[action] = list.slice();
      rebuildMap();
      return true;
    },
    /** 取得某動作目前按鍵的顯示名稱陣列，例如 keyNames('jump') → ['Z','K','空白鍵'] */
    keyNames(action) { return (BINDINGS[action] || []).map(codeName); },
    /** 單一 code 的顯示名稱 */
    codeName,
    /** 還原預設綁定（鍵盤 + 手把）；不會自己存檔，設定頁請接著呼叫 saveBindings() */
    resetBindings() {
      for (const n of NAMES) { BINDINGS[n] = DEFAULT_KB[n].slice(); GP_BINDINGS[n] = DEFAULT_GP[n].slice(); }
      rebuildMap(); return true;
    },
    /** 是否為出廠預設（設定頁顯示「已還原」用） */
    isDefaultBindings() {
      return NAMES.every(n => BINDINGS[n].join(',') === DEFAULT_KB[n].join(',')
        && (GP_BINDINGS[n] || []).join(',') === DEFAULT_GP[n].join(','));
    },
    /** 某個 code 目前屬於哪個動作（null = 未綁定）；衝突提示用 */
    actionOf(code) { return MAP[code] || null; },
    /** 手把按鈕重新綁定：rebindGamepad('jump', 0)；同樣會解除其他動作佔用 */
    rebindGamepad(action, index) {
      if (!GP_BINDINGS[action]) return false;
      const i = index | 0; if (i < 0 || i > 31) return false;
      for (const a of NAMES) { if (a !== action) GP_BINDINGS[a] = (GP_BINDINGS[a] || []).filter(b => b !== i); }
      GP_BINDINGS[action] = [i];
      return true;
    },
    /** 手把按鈕的顯示名稱（標準配置別名） */
    buttonName(i) { return GP_NAMES[i] || ('B' + i); },
    /** 某動作的手把按鈕顯示名稱陣列 */
    buttonNames(action) { return (GP_BINDINGS[action] || []).map(i => GP_NAMES[i] || ('B' + i)); },
    /** 目前按著的手把按鈕 index 陣列（設定頁監聽用） */
    gamepadPressed() {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gps) {
        if (!gp || gp.connected === false) continue;
        const out = [];
        for (let i = 0; i < gp.buttons.length; i++) if (gp.buttons[i] && gp.buttons[i].pressed) out.push(i);
        return out;
      }
      return [];
    },
    /** 監聽「下一個按下的鍵」：cb(code) 回傳 true 代表接受並停止監聽；回傳取消函式 */
    captureKey(cb) {
      const h = e => {
        if (e.repeat) return;
        e.preventDefault(); e.stopPropagation();
        let done = true;
        try { done = cb(e.code) !== false; } catch (err) { }
        if (done) stop();
      };
      const stop = () => window.removeEventListener('keydown', h, true);
      window.addEventListener('keydown', h, true);
      return stop;
    },

    // ---------- 綁定存檔（全域，不隨存檔槽；localStorage kirbystar_global）----------
    GLOBAL_KEY,
    /** 目前綁定的深拷貝：{ keyboard:{action:[code]}, gamepad:{action:[index]} } */
    getBindings() {
      const kb = {}, gp = {};
      for (const n of NAMES) { kb[n] = BINDINGS[n].slice(); gp[n] = (GP_BINDINGS[n] || []).slice(); }
      return { keyboard: kb, gamepad: gp };
    },
    /** 套用一份綁定（缺的動作沿用目前值）；回傳是否有套用任何東西 */
    setBindings(o) {
      if (!o || typeof o !== 'object') return false;
      const kb = o.keyboard || o.BINDINGS || null, gp = o.gamepad || o.GAMEPAD || null;
      let any = false;
      if (kb) for (const n of NAMES) {
        const list = Array.isArray(kb[n]) ? kb[n].filter(c => typeof c === 'string' && c) : null;
        if (list && list.length) { BINDINGS[n] = list.slice(0, 4); any = true; }
      }
      if (gp) for (const n of NAMES) {
        const list = Array.isArray(gp[n]) ? gp[n].map(v => v | 0).filter(v => v >= 0 && v <= 31) : null;
        if (list) { GP_BINDINGS[n] = list.slice(0, 4); any = true; }
      }
      rebuildMap();
      return any;
    },
    /** 由 localStorage kirbystar_global 讀回綁定並套用（啟動時自動呼叫一次） */
    loadBindings() {
      try {
        const ls = window.localStorage; if (!ls) return false;
        const raw = ls.getItem(GLOBAL_KEY); if (!raw) return false;
        const o = JSON.parse(raw); if (!o) return false;
        return KB.input.setBindings(o.bindings || o);
      } catch (e) { return false; }
    },
    /** 把目前綁定寫回 localStorage kirbystar_global（read-modify-write，不覆蓋 settings） */
    saveBindings() {
      try {
        const ls = window.localStorage; if (!ls) return false;
        let o = {}; try { o = JSON.parse(ls.getItem(GLOBAL_KEY) || '{}') || {}; } catch (e) { o = {}; }
        o.bindings = KB.input.getBindings();
        ls.setItem(GLOBAL_KEY, JSON.stringify(o));
        return true;
      } catch (e) { return false; }
    },

    // 供 UI 顯示的按鍵說明
    HELP: [
      [() => KB.UI && KB.UI.hint ? KB.UI.hint('left', '方向鍵 / WASD') : '方向鍵 / WASD', '移動、蹲下、進門、爬梯'],
      // Round 9：右欄 12px 最寬 138px（ui.js drawHelp），超過會被截斷 → 拆成兩列寫飛行
      [() => KB.UI && KB.UI.hint ? KB.UI.hint('jump', 'Z / K / 空白鍵') : 'Z / K / 空白鍵', '跳躍（空中再按＝飛行）'],
      ['按住 ↑', '持續飛行（可一直上升）'],
      [() => KB.UI && KB.UI.hint ? KB.UI.hint('attack', 'X / J') : 'X / J', '吸入 / 吐出 / 使用能力'],
      [() => KB.UI && KB.UI.hint ? '↑' + KB.UI.hint('attack', 'X') + ' / ↓' + KB.UI.hint('attack', 'X') : '↑X / ↓X', '空中也能出招'],
      ['↓', '吞下（獲得能力）'],
      ['↓ + 跳', '滑鏟／平台上穿下'],
      [() => KB.UI && KB.UI.hint ? KB.UI.hint('select', 'Shift / L') : 'Shift / L', '丟棄能力'],
      [() => KB.UI && KB.UI.hint ? KB.UI.hint('start', 'Enter / Esc') : 'Enter / Esc', '暫停 / 確認'],
      ['手把', 'A·B 跳　X·Y 攻擊'],
    ],
    // Round 9（player-input）：說明第 2 頁（UI.HELP2，ui.js）要補的兩列；
    //   ui.js 不是本 agent 的檔案 → 由總控 / ui agent 併進 UI.HELP2（見 PROGRESS「跨檔需求」）。
    HELP2_ADD: [
      ['按住 ↑', '地面按住 4 幀也會起飛'],
      ['空中 X', '空中也能出招 ↑X／↓X'],
    ],
  };

  // 啟動時套用玩家自訂綁定（localStorage kirbystar_global；沒有就維持預設）
  try { KB.input.loadBindings(); } catch (e) { }
})();
