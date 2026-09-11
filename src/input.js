// 鍵盤 / 手把 / 虛擬輸入
(function () {
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', KeyK: 'jump', Space: 'jump',
    KeyX: 'attack', KeyJ: 'attack',
    ShiftLeft: 'select', ShiftRight: 'select', KeyL: 'select', KeyC: 'select',
    Enter: 'start', Escape: 'start', KeyP: 'start',
  };
  const NAMES = ['left', 'right', 'up', 'down', 'jump', 'attack', 'select', 'start'];
  const cur = {}, prev = {}, raw = {}, virt = {};
  let anyKey = false, virtualOnly = false;
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
      if (!gp) continue;
      const b = i => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const g = {
        left: b(14) || ax < -0.5, right: b(15) || ax > 0.5, up: b(12) || ay < -0.5, down: b(13) || ay > 0.5,
        jump: b(0) || b(1), attack: b(2) || b(3), select: b(8) || b(4) || b(5), start: b(9),
      };
      return g;
    }
    return null;
  }

  KB.input = {
    update() {
      const gp = pollGamepad();
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
    // 供 UI 顯示的按鍵說明
    HELP: [
      ['方向鍵 / WASD', '移動、蹲下、進門、爬梯'],
      ['Z / K / 空白鍵', '跳躍（空中再按＝漂浮）'],
      ['X / J', '吸入 / 吐出 / 使用能力'],
      ['↓', '吞下（獲得能力）'],
      ['↓ + 跳', '滑鏟'],
      ['Shift / L', '丟棄能力'],
      ['Enter / Esc', '暫停 / 確認'],
    ],
  };
})();
