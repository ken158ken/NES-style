// 鍵盤 / 手把 / 虛擬輸入
(function () {
  const NAMES = ['left', 'right', 'up', 'down', 'jump', 'attack', 'select', 'start'];

  // 按鍵綁定（action → KeyboardEvent.code 陣列）；設定頁可透過 KB.input.rebind 修改
  const BINDINGS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'KeyK', 'Space'],
    attack: ['KeyX', 'KeyJ'],
    select: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC'],
    start: ['Enter', 'Escape', 'KeyP'],
  };
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
  const GP_BINDINGS = {
    jump: [0, 1],          // A / B
    attack: [2, 3],        // X / Y
    select: [4, 5, 8],     // L / R / Back
    start: [9],            // Start
    left: [14], right: [15], up: [12], down: [13],   // D-pad
  };
  const DEADZONE = 0.35;   // 類比搖桿死區

  let MAP = {};
  function rebuildMap() {
    MAP = {};
    for (const n of NAMES) for (const c of (BINDINGS[n] || [])) MAP[c] = n;
  }
  rebuildMap();

  const cur = {}, prev = {}, raw = {}, virt = {};
  let anyKey = false, virtualOnly = false, gpActive = false;
  NAMES.forEach(n => { cur[n] = false; prev[n] = false; raw[n] = false; });

  window.addEventListener('keydown', e => {
    const n = MAP[e.code]; if (!n) return;
    if (!raw[n]) anyKey = true;
    raw[n] = true; e.preventDefault();
    if (KB.audio && KB.audio.unlock) KB.audio.unlock();
  });
  window.addEventListener('keyup', e => { const n = MAP[e.code]; if (n) { raw[n] = false; e.preventDefault(); } });
  window.addEventListener('blur', () => NAMES.forEach(n => raw[n] = false));

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
      for (const n of NAMES) {
        prev[n] = cur[n];
        let v = raw[n] || (gp && gp[n]) || false;
        if (virtualOnly) v = false;
        if (virt[n]) v = true;
        cur[n] = !!v;
      }
      if (gp && Object.values(gp).some(Boolean) && KB.audio && KB.audio.unlock) KB.audio.unlock();
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
    /** 還原預設綁定 */
    resetBindings() {
      BINDINGS.left = ['ArrowLeft', 'KeyA']; BINDINGS.right = ['ArrowRight', 'KeyD'];
      BINDINGS.up = ['ArrowUp', 'KeyW']; BINDINGS.down = ['ArrowDown', 'KeyS'];
      BINDINGS.jump = ['KeyZ', 'KeyK', 'Space']; BINDINGS.attack = ['KeyX', 'KeyJ'];
      BINDINGS.select = ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC']; BINDINGS.start = ['Enter', 'Escape', 'KeyP'];
      rebuildMap(); return true;
    },

    // 供 UI 顯示的按鍵說明
    HELP: [
      ['方向鍵 / WASD', '移動、蹲下、進門、爬梯'],
      ['Z / K / 空白鍵', '跳躍（空中再按＝漂浮）'],
      ['X / J', '吸入 / 吐出 / 使用能力'],
      ['↓', '吞下（獲得能力）'],
      ['↓ + 跳', '滑鏟／平台上穿下'],
      ['Shift / L', '丟棄能力'],
      ['Enter / Esc', '暫停 / 確認'],
      ['手把', 'A·B 跳　X·Y 攻擊'],
    ],
  };
})();
