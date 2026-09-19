/* engine/input.js — NES.Input：手把 8 鍵、每幀一次取樣
 * R1 / agent core。classic script、IIFE、零相依。
 *
 * 規則（原汁原味的關鍵）：
 *   1. 一幀一取樣 —— 鍵盤 / 手把事件只更新「即時遮罩」，`held/pressed/released/mask`
 *      一律讀 poll() 當下的快照。poll() 之外不會有任何狀態變化。
 *   2. 來源優先權：replay > inject（腳本注入）> 鍵盤 | Gamepad | external（setExternal，觸控覆蓋層）。
 *   3. pressed/released 只在邊緣為真（比較 poll 的前後兩幀快照）。
 */
(function (root) {
  'use strict';
  var NES = root.NES = root.NES || {};

  // NES 手把位元順序（$4016 讀出的順序）
  var BTN = { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var NAMES = ['A', 'B', 'SELECT', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

  // 預設鍵盤映射：KeyboardEvent.code → 按鍵名
  var DEFAULT_MAP = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT',
    KeyZ: 'A', KeyX: 'B',
    Enter: 'START', NumpadEnter: 'START',
    ShiftLeft: 'SELECT', ShiftRight: 'SELECT'
  };

  var keymap = {};
  function resetMap() { keymap = {}; for (var k in DEFAULT_MAP) if (DEFAULT_MAP.hasOwnProperty(k)) keymap[k] = DEFAULT_MAP[k]; }
  resetMap();

  function bitOf(v) {
    if (typeof v === 'number') return v | 0;
    var n = String(v).toUpperCase();
    return BTN.hasOwnProperty(n) ? BTN[n] : 0;
  }

  var live = 0;        // 鍵盤即時遮罩（事件即時更新，poll 才會被採樣）
  var cur = 0, prev = 0;
  var pollCount = 0;

  var injectQ = [];    // [{mask, frames}]
  var external = 0;    // R2：第三個即時來源（觸控覆蓋層等），與鍵盤 | Gamepad 做 OR（不蓋掉鍵盤）
  var replayArr = null, replayIdx = 0;
  var recording = false, recBuf = null;

  var usePad = false, padIndex = 0;
  var attached = false, attachTarget = null;

  /* ---------- 鍵盤 ---------- */
  function onKeyDown(e) {
    if (e.repeat) return;
    var b = bitOf(keymap[e.code] || keymap[e.key] || 0);
    if (b) { live |= b; if (API.preventDefault && e.preventDefault) e.preventDefault(); }
  }
  function onKeyUp(e) {
    var b = bitOf(keymap[e.code] || keymap[e.key] || 0);
    if (b) { live &= ~b; if (API.preventDefault && e.preventDefault) e.preventDefault(); }
  }
  function onBlur() { live = 0; }

  function attach(target) {
    if (attached) detach();
    target = target || (typeof window !== 'undefined' ? window : null);
    if (!target || !target.addEventListener) return false;
    attachTarget = target;
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('keyup', onKeyUp, true);
    target.addEventListener('blur', onBlur, false);
    attached = true;
    return true;
  }
  function detach() {
    if (!attached || !attachTarget) { attached = false; return false; }
    attachTarget.removeEventListener('keydown', onKeyDown, true);
    attachTarget.removeEventListener('keyup', onKeyUp, true);
    attachTarget.removeEventListener('blur', onBlur, false);
    attached = false; attachTarget = null;
    return true;
  }

  /* ---------- Gamepad（可選） ---------- */
  // 標準配置 → NES：0/1 = A、2/3 = B、8 = SELECT、9 = START、12~15 = 十字鍵、axes 0/1 類比
  var PAD_BTN = { 0: BTN.A, 1: BTN.A, 2: BTN.B, 3: BTN.B, 8: BTN.SELECT, 9: BTN.START,
                  12: BTN.UP, 13: BTN.DOWN, 14: BTN.LEFT, 15: BTN.RIGHT };
  function padMask() {
    if (!usePad || typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    var pads = navigator.getGamepads(), p = pads && pads[padIndex];
    if (!p) return 0;
    var m = 0, i;
    for (i in PAD_BTN) if (p.buttons[i] && p.buttons[i].pressed) m |= PAD_BTN[i];
    var ax = p.axes || [];
    if (ax.length > 1) {
      if (ax[0] < -0.5) m |= BTN.LEFT; else if (ax[0] > 0.5) m |= BTN.RIGHT;
      if (ax[1] < -0.5) m |= BTN.UP;   else if (ax[1] > 0.5) m |= BTN.DOWN;
    }
    return m & 255;
  }

  /* ---------- 每幀取樣 ---------- */
  function poll() {
    prev = cur;
    var m;
    if (replayArr && replayIdx < replayArr.length) {
      m = replayArr[replayIdx++] | 0;
      if (replayIdx >= replayArr.length) { replayArr = null; replayIdx = 0; }
    } else if (injectQ.length) {
      var q = injectQ[0];
      m = q.mask | 0;
      q.frames = (q.frames | 0) - 1;
      if (q.frames <= 0) injectQ.shift();
    } else {
      m = (live | padMask() | external);
    }
    cur = m & 255;
    if (recording) recBuf.push(cur);
    pollCount++;
    return cur;
  }

  function held(b) { return (cur & bitOf(b)) !== 0; }
  function pressed(b) { b = bitOf(b); return (cur & b) !== 0 && (prev & b) === 0; }
  function released(b) { b = bitOf(b); return (cur & b) === 0 && (prev & b) !== 0; }
  function mask() { return cur; }
  function prevMask() { return prev; }
  function pressedMask() { return cur & ~prev; }
  function releasedMask() { return ~cur & prev & 255; }

  /* ---------- 腳本注入 ---------- */
  // inject(mask, frames)：排入注入佇列；frames 省略 = 1。
  // frames <= 0 視為「放開 / 清空佇列」（nes.js 除錯 API 的 release 用 inject(0, 0)）。
  function inject(m, frames) {
    frames = frames === undefined ? 1 : (frames | 0);
    if (frames <= 0) { injectQ.length = 0; return API; }
    injectQ.push({ mask: (m | 0) & 255, frames: frames });
    return API;                       // 可鏈式接多段
  }
  function injectSeq(seq) {           // [[mask, frames], ...]
    for (var i = 0; i < seq.length; i++) inject(seq[i][0], seq[i][1]);
    return API;
  }
  function clearInject() { injectQ.length = 0; return API; }
  function injectPending() { var n = 0; for (var i = 0; i < injectQ.length; i++) n += injectQ[i].frames; return n; }

  /* ---------- 記錄 / 重播 ---------- */
  function record() { recording = true; recBuf = []; return API; }
  function stopRecord() { recording = false; var r = recBuf || []; recBuf = null; return r; }
  function isRecording() { return recording; }
  function replay(arr) { replayArr = (arr && arr.length) ? arr.slice() : null; replayIdx = 0; return API; }
  function replayPending() { return replayArr ? (replayArr.length - replayIdx) : 0; }

  /* ---------- 其他 ---------- */
  function remap(obj) {               // {'KeyJ':'A', 'Space':NES.Input.BTN.A}
    for (var k in obj) if (obj.hasOwnProperty(k)) keymap[k] = obj[k];
    return API;
  }
  function reset() {                  // 全清（測試之間用）
    live = 0; cur = 0; prev = 0; pollCount = 0; external = 0;
    injectQ.length = 0; replayArr = null; replayIdx = 0;
    recording = false; recBuf = null;
    return API;
  }
  function maskToString(m) {
    m = m === undefined ? cur : (m | 0);
    var out = [];
    for (var i = 0; i < NAMES.length; i++) if (m & BTN[NAMES[i]]) out.push(NAMES[i]);
    return out.join('|') || '-';
  }
  function parseMask(s) {             // "right|a" → 位元
    var m = 0, parts = String(s).split(/[|,+ ]+/);
    for (var i = 0; i < parts.length; i++) m |= bitOf(parts[i]);
    return m & 255;
  }

  var API = {
    BTN: BTN, NAMES: NAMES, DEFAULT_MAP: DEFAULT_MAP,
    preventDefault: true,
    poll: poll, held: held, pressed: pressed, released: released,
    mask: mask, prevMask: prevMask, pressedMask: pressedMask, releasedMask: releasedMask,
    inject: inject, injectSeq: injectSeq, clearInject: clearInject, injectPending: injectPending,
    setExternal: function (m) { external = (m | 0) & 255; return API; }, external: function () { return external; },
    record: record, stopRecord: stopRecord, isRecording: isRecording,
    replay: replay, replayPending: replayPending,
    remap: remap, resetMap: resetMap, keymap: function () { return keymap; },
    attach: attach, detach: detach, reset: reset,
    useGamepad: function (on, idx) { usePad = !!on; if (idx !== undefined) padIndex = idx | 0; return API; },
    gamepadEnabled: function () { return usePad; },
    liveMask: function () { return live; },     // 除錯用：尚未取樣的即時鍵盤狀態
    pollCount: function () { return pollCount; },
    bit: bitOf, maskToString: maskToString, parseMask: parseMask
  };

  NES.Input = API;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') attach(window);
})(typeof window !== 'undefined' ? window : this);
