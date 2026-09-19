/* engine/touch.js — NES.Touch：手機觸控虛擬手把（agent: nes-touch, R2）
 *
 * 【設計重點】
 * 1. 純 DOM 覆蓋層：本檔自己 createElement + 自注入 <style>，入口頁只要 <script src> 就有按鍵；
 *    tools/build.py 內嵌後 dist 單檔也自然帶著（不需要任何額外資源）。
 * 2. **不改 engine/input.js**：用既有的 `NES.Input.inject(mask, frames)`（來源優先權
 *    replay > inject > 鍵盤 | Gamepad）。觸控「有按鍵」時 `clearInject()` + `inject(mask, 1e9)`
 *    ＝ 按住到放開；「全部放開」時 `inject(0, 0)` 清空佇列，立刻把控制權還給鍵盤 / 手把。
 *    ⇒ 取捨：觸控按著的期間鍵盤 / 手把被蓋掉（同時操作不會 OR 起來），放開後立即恢復。
 *    詳見 docs/PROGRESS.md「nes-touch（R2）」與 docs/ENGINE_API.md §16。
 * 3. 排版一律避開畫面（`window.NES_LAYOUT`，入口頁的 fit/place 會設）：
 *    直向＝畫面下方的空白帶；橫向＝畫面左右的留白（入口頁已經替按鍵各留 ≥110px / 平板 170px）。
 * 4. 設定存 `localStorage.nes_touch`（JSON）。
 * 5. 顯示：mode auto 時「觸控裝置才顯示」，鍵盤 / 手把輸入後淡出，再觸控又出現；on = 強制顯示、
 *    off = 強制隱藏（觸控裝置上點到畫面會自動退回 auto，避免鎖死沒有入口）。
 * 6. fix5（使用者回饋「一鍵密技，不必暫停」）：第 7 顆按鍵 `cheat`（紫色膠囊「★密技」）。
 *    **不是 NES 八鍵**（不進 mask / 不碰 inject），按下（pointerdown 邊緣、300ms 防連按）
 *    只派發 `window` 上的 `nes-cheat` CustomEvent，由各遊戲的 main.js 自己決定效果。
 *    `layout.cheatButton = false` 可整顆關掉；`NES.Touch.cheat()` 可程式觸發（測試用）。
 */
(function (root) {
  'use strict';
  var NES = root.NES = root.NES || {};
  var W = root, D = (root && root.document) || null;

  var BTN = { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
  var AVAILABLE = false;
  try {
    AVAILABLE = ('ontouchstart' in W) || ((W.navigator && W.navigator.maxTouchPoints) | 0) > 0 ||
                ((W.navigator && W.navigator.msMaxTouchPoints) | 0) > 0;
  } catch (e) { AVAILABLE = false; }

  // node / 無 DOM 環境：給一個不做事的殼，讓 require 型測試不炸
  if (!D || !D.createElement) {
    NES.Touch = {
      available: false, headless: true,
      active: function () { return false; }, show: function () { }, hide: function () { },
      layout: { mode: 'auto', side: 'right', size: 1, opacity: 0.8, stick: 'stick', stickFloat: true,
                cheatButton: true },
      setLayout: function (o) { return this.layout; }, rects: function () { return {}; }, mask: function () { return 0; },
      cheat: function () { return false; }
    };
    return;
  }

  var CHEAT_LABEL = '\u2605\u5bc6\u6280';   // ★密技
  var CHEAT_MS = 300;                       // 一鍵密技防連按（毫秒）
  var HAS_PE = !!W.PointerEvent;
  var FS_OK = !!(D.documentElement.requestFullscreen || D.documentElement.webkitRequestFullscreen);
  var HOLD = 1000000000;          // inject 的「按住」幀數（實務上等於永遠，放開時才清掉）
  var HYST = 6;                   // 扇區磁滯：偏離中心 > 22.5 + 6 = 28.5° 才換扇區
  var DEAD_PAD = 0.26, DEAD_STICK = 0.20;   // 死區（底座半徑比例）
  // 8 扇區（螢幕座標 atan2(oy,ox) 度數；y 向下為正 ⇒ 0=右、90=下）
  var SEC = [BTN.RIGHT, BTN.RIGHT | BTN.DOWN, BTN.DOWN, BTN.LEFT | BTN.DOWN,
             BTN.LEFT, BTN.LEFT | BTN.UP, BTN.UP, BTN.RIGHT | BTN.UP];
  var DIRBITS = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function px(n) { return Math.round(n) + 'px'; }

  /* ------------------------------------------------------------------ 樣式 */
  var CSS = [
    '#nes-touch{position:fixed;left:0;top:0;width:100%;height:100%;height:100dvh;z-index:60;',
    '  pointer-events:none;opacity:1;transition:opacity .22s ease;',
    '  font:bold 12px/1 "Courier New",ui-monospace,monospace;',
    '  touch-action:none;-webkit-user-select:none;user-select:none;',
    '  -webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;}',
    '#nes-touch.nt-off{opacity:0;}',
    '#nes-touch.nt-off *{pointer-events:none !important;}',
    '#nes-touch [data-nt]{position:absolute;box-sizing:border-box;pointer-events:auto;touch-action:none;',
    '  display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;',
    '  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;',
    '  -webkit-tap-highlight-color:transparent;transition:filter .06s linear,transform .06s linear;}',
    '#nes-touch .nt-btn{border-style:solid;color:#fff;',
    '  box-shadow:inset 0 -4px 0 rgba(0,0,0,.30),inset 0 3px 0 rgba(255,255,255,.26),0 2px 0 rgba(0,0,0,.40);}',
    '#nes-touch .nt-btn.nt-on{filter:brightness(1.45);transform:scale(.90);',
    '  box-shadow:inset 0 0 0 3px rgba(255,255,255,.8),0 0 10px rgba(255,255,255,.45);}',
    '#nes-touch .nt-a{background:#e02838;border-color:#70101c;border-radius:50%;color:#fff;}',
    '#nes-touch .nt-b{background:#e86038;border-color:#7a2810;border-radius:50%;color:#fff;}',
    '#nes-touch .nt-sel{background:#98202c;border-color:#4a0c14;border-radius:999px;color:#ffd8d8;}',
    '#nes-touch .nt-start{background:#98202c;border-color:#4a0c14;border-radius:999px;color:#ffd8d8;}',
    '#nes-touch .nt-cheat{background:#8a34c8;border-color:#3d1060;border-radius:999px;color:#ffe8ff;',
    '  letter-spacing:.02em;white-space:nowrap;}',
    '#nes-touch .nt-fs{background:#3860c8;border-color:#14224f;border-radius:22%;color:#fff;}',
    '#nes-touch .nt-pad{background:#2a2a30;border:4px solid #101014;border-radius:50%;',
    '  box-shadow:inset 0 -5px 0 rgba(0,0,0,.34),inset 0 4px 0 rgba(255,255,255,.12),0 2px 0 rgba(0,0,0,.40);}',
    '#nes-touch .nt-pad i{position:absolute;display:block;width:0;height:0;border-style:solid;opacity:.85;}',
    '#nes-touch .nt-pad i.on{opacity:1;filter:drop-shadow(0 0 3px #ffe040);}',
    '#nes-touch .nt-pad em{position:absolute;display:block;box-sizing:border-box;border-radius:50%;',
    '  border:2px solid #5a5a68;opacity:.42;}',
    '#nes-touch .nt-pad u{position:absolute;display:block;background:#9a9aa8;opacity:.8;text-decoration:none;z-index:3;}',
    '#nes-touch .nt-pad u.on{background:#ffe040;opacity:1;box-shadow:0 0 7px 2px rgba(255,224,64,.85);}',
    '#nes-touch .nt-pad b{position:absolute;display:block;border-radius:50%;background:#101014;opacity:.55;z-index:4;}',
    '#nes-touch .nt-pad.nt-stick{background:#232a36;}',
    '#nes-touch .nt-pad.nt-stick b{background:#eef0f8;opacity:.94;',
    '  box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),inset 0 2px 0 rgba(255,255,255,.55),0 1px 3px rgba(0,0,0,.45);}',
    '#nes-touch .nt-zone{background:transparent;border:0;}',
    '#nes-touch .nt-fsi{position:relative;display:block;}',
    '#nes-touch .nt-fsi s{position:absolute;display:block;text-decoration:none;}',
    '@keyframes nt-ret{0%{opacity:.18;}100%{opacity:1;}}',
    '#nes-touch .nt-pad.nt-ret{animation:nt-ret .22s ease;}',
    '@keyframes nt-flash{0%{filter:brightness(2.6);transform:scale(1.14);}',
    '  60%{filter:brightness(1.7);transform:scale(1.02);}100%{filter:brightness(1);transform:scale(1);}}',
    '#nes-touch .nt-btn.nt-flash{animation:nt-flash .34s ease-out;}'
  ].join('\n');

  /* ------------------------------------------------------------------ DOM */
  var style = D.createElement('style');
  style.id = 'nes-touch-style'; style.textContent = CSS;
  var rootEl = D.createElement('div');
  rootEl.id = 'nes-touch'; rootEl.className = 'nt-off';
  rootEl.setAttribute('aria-hidden', 'true');

  function mk(cls, key, label) {
    var e = D.createElement('div');
    e.className = cls; e.setAttribute('data-nt', key);
    if (label) e.textContent = label;
    rootEl.appendChild(e); return e;
  }
  // 浮動搖桿的落點感應區必須排最前面（同層後面的元素疊在上面 ⇒ 按鍵永遠優先吃到手指）
  var zone = mk('nt-zone', 'zone', '');
  var pad = mk('nt-pad', 'dpad', '');
  var arrow = {}, DIRNAME = ['up', 'down', 'left', 'right'];
  for (var ai = 0; ai < 4; ai++) { var iv = D.createElement('i'); arrow[DIRNAME[ai]] = iv; pad.appendChild(iv); }
  var padRing = D.createElement('em'); pad.appendChild(padRing);
  var ticks = [];
  for (var ti = 0; ti < 8; ti++) { var uu = D.createElement('u'); ticks.push(uu); pad.appendChild(uu); }
  var padKnob = D.createElement('b'); pad.appendChild(padKnob);
  var bA = mk('nt-btn nt-a', 'a', 'A');
  var bB = mk('nt-btn nt-b', 'b', 'B');
  var bSel = mk('nt-btn nt-sel', 'select', 'SELECT');
  var bStart = mk('nt-btn nt-start', 'start', 'START');
  var bCheat = mk('nt-btn nt-cheat', 'cheat', CHEAT_LABEL);     // fix5：一鍵密技（非 NES 八鍵）
  var bFs = mk('nt-btn nt-fs', 'fs', '');
  (function () {   // 全螢幕圖示：四個角括號（純 CSS，不依賴字型）
    var box = D.createElement('span'); box.className = 'nt-fsi';
    for (var i = 0; i < 4; i++) box.appendChild(D.createElement('s'));
    bFs.appendChild(box);
  })();
  if (!FS_OK) bFs.style.display = 'none';
  var probe = D.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
    'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
  rootEl.appendChild(probe);

  function mount() {
    if (!D.body || rootEl.parentNode) return;
    (D.head || D.documentElement).appendChild(style);
    D.body.appendChild(rootEl);
    rootEl.style.transition = 'none';     // 第一次顯示不跑淡入（截圖工具是同步推幀的）
    relayout(); applyAuto();
    void rootEl.offsetWidth;
    W.requestAnimationFrame(function () { rootEl.style.transition = ''; });
  }

  /* ------------------------------------------------------------------ 量測 */
  function safeArea() {
    try {
      var c = W.getComputedStyle(probe);
      return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0,
               b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 };
    } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
  }
  function viewport() {
    var vv = W.visualViewport;
    return { w: (vv && vv.width) || W.innerWidth || 320, h: (vv && vv.height) || W.innerHeight || 480 };
  }
  /** 畫面（canvas）在 viewport 的矩形：優先 window.NES_LAYOUT，退路 canvas.getBoundingClientRect() */
  function canvasRect() {
    var L = W.NES_LAYOUT;
    if (L && L.w > 0 && L.h > 0) {
      return { x: L.x || 0, y: L.y || 0, w: L.w, h: L.h,
               portrait: (typeof L.portrait === 'boolean') ? L.portrait : null };
    }
    var c = NES.canvas || (NES.instance && NES.instance.canvas) || D.getElementById('nes');
    if (c && c.getBoundingClientRect) {
      var r = c.getBoundingClientRect();
      if (r.width > 0) return { x: r.left, y: r.top, w: r.width, h: r.height, portrait: null };
    }
    var v = viewport();
    return { x: 0, y: 0, w: v.w, h: v.h * 0.6, portrait: null };
  }

  /* ------------------------------------------------------------------ 排版 */
  var T = {};                               // NES.Touch（檔尾組裝）
  var ovAny = false;
  var padHome = null, padFloat = null, tickOn = -1, knobMax = 20, cluBox = null, zoneRect = null;
  var left = 0, right = 320, top = 0, bottom = 480;
  var clampFloat = function (cx, cy) { return { cx: cx, cy: cy }; };

  function hit(cx, cy, w, h, L) {
    return (cx + w / 2 > L.x + 0.5) && (cx - w / 2 < L.x + L.w - 0.5) &&
           (cy + h / 2 > L.y + 0.5) && (cy - h / 2 < L.y + L.h - 0.5);
  }
  /** 把按鍵推到畫面外的允許帶（zone: below / leftOf / rightOf），再夾進安全區；仍重疊就回報 over */
  function avoid(cx, cy, w, h, zoneName, L) {
    if (zoneName === 'below') cy = Math.max(cy, L.y + L.h + h / 2 + 1);
    else if (zoneName === 'leftOf') cx = Math.min(cx, L.x - w / 2 - 1);
    else if (zoneName === 'rightOf') cx = Math.max(cx, L.x + L.w + w / 2 + 1);
    cx = clamp(cx, left + w / 2, right - w / 2);
    cy = clamp(cy, top + h / 2, bottom - h / 2);
    return { cx: cx, cy: cy, over: hit(cx, cy, w, h, L) };
  }
  function place(el, cx, cy, w, h, over) {
    el.style.left = px(cx - w / 2); el.style.top = px(cy - h / 2);
    el.style.width = px(w); el.style.height = px(h);
    el.style.opacity = String(clamp(T.layout.opacity * (over ? 0.62 : 1), 0.08, 1));
    if (over) ovAny = true;
  }
  function placePad() {
    if (!padHome) return;
    var p = padFloat || padHome;
    place(pad, p.cx, p.cy, padHome.d, padHome.d, padHome.over);
  }
  function litTick(i, s) {
    if (s < 0) return false;
    if (i === s) return true;
    return (s % 2) === 1 && (i === (s + 7) % 8 || i === (s + 1) % 8);
  }

  function relayout() {
    if (!rootEl.parentNode) return;
    ovAny = false;
    var v = viewport(), sa = safeArea(), L = canvasRect(), sz = T.layout.size;
    left = sa.l; right = v.w - sa.r; top = sa.t; bottom = v.h - sa.b;
    var aw = Math.max(80, right - left), ah = Math.max(80, bottom - top);
    var portrait = (L.portrait === null) ? (v.h >= v.w) : L.portrait;
    var gap = Math.round(clamp(Math.min(aw, ah) * 0.035, 6, 18));
    var actRight = (T.layout.side !== 'left');       // A / B 在右手側

    var btn = clamp(Math.min(aw * 0.165, ah * 0.20, 74 * sz), 36, 110);
    var padD = clamp(Math.min(aw * 0.42, ah * 0.48, 166 * sz), 84, 220);
    var column = false;
    function cluW() { return column ? btn * 1.12 : btn * 2.26; }
    function cluH() { return column ? btn * 2.30 : btn * 1.92; }
    function smW() { return btn * 1.36; }
    function smH() { return btn * 0.62; }
    function fsW() { return btn * 0.68; }

    var padCx, padCy, cluCx, cluCy;
    var ovPad = false, ovAct = false;
    var smRowTop = top;

    if (portrait) {
      /* 直向：畫面貼上方 ⇒ 按鍵全部放在畫面下方的空白帶 */
      var bandTop = Math.max(top, L.y + L.h + 2), bandBot = bottom;
      var bandH = bandBot - bandTop;
      var need = Math.max(padD, cluH()) + gap + Math.max(smH(), fsW());
      if (bandH < need) {                        // 空白帶不夠 → 先縮小按鍵，仍不夠才壓畫面
        var k = clamp(bandH / need, 0.45, 1);
        padD = clamp(padD * k, 72, 220); btn = clamp(btn * k, 32, 110);
      }
      var rowH = Math.max(padD, cluH());
      padCy = cluCy = bandBot - gap - rowH / 2;
      padCx = actRight ? (left + gap + padD / 2) : (right - gap - padD / 2);
      cluCx = actRight ? (right - gap - cluW() / 2) : (left + gap + cluW() / 2);
      smRowTop = padCy - rowH / 2;
    } else {
      /* 橫向：畫面置中 ⇒ 按鍵放左右留白（入口頁的 fit() 已經替兩側各留 ≥110 / 平板 170px） */
      var gl = Math.max(0, L.x - left), gr = Math.max(0, right - (L.x + L.w));
      var gPad = actRight ? gl : gr, gAct = actRight ? gr : gl;
      var g2 = clamp(Math.min(gap, Math.floor(Math.min(gPad, gAct) * 0.06)), 4, gap);
      var fitPad = gPad - g2 * 2, fitAct = gAct - g2 * 2;
      if (fitPad >= 72) padD = clamp(Math.min(padD, fitPad), 72, 220); else ovPad = true;
      if (fitAct < cluW()) {                     // 橫排塞不下 → 直排；直排還塞不下才壓畫面
        column = true;
        if (fitAct >= 42) btn = clamp(Math.min(btn, fitAct / 1.12), 34, 110); else ovAct = true;
      }
      var rowH2 = Math.max(padD, cluH());
      padCy = cluCy = clamp(bottom - g2 - rowH2 / 2, top + rowH2 / 2, bottom - rowH2 / 2);
      padCx = actRight ? (left + g2 + padD / 2) : (right - g2 - padD / 2);
      cluCx = actRight ? (right - g2 - cluW() / 2) : (left + g2 + cluW() / 2);
      smRowTop = Math.min(padCy, cluCy) - rowH2 / 2;
    }

    var padZone = portrait ? 'below' : (actRight ? 'leftOf' : 'rightOf');
    var actZone = portrait ? 'below' : (actRight ? 'rightOf' : 'leftOf');
    var border = Math.max(3, Math.round(btn * 0.07));

    /* ---- 十字鍵 / 搖桿 ---- */
    var stick = (T.layout.stick === 'stick');
    pad.className = 'nt-pad' + (stick ? ' nt-stick' : '');
    pad.setAttribute('data-nt', 'dpad');
    pad.style.borderWidth = px(Math.max(3, padD * 0.03));
    var fixPad = avoid(padCx, padCy, padD, padD, padZone, L);
    padHome = { cx: fixPad.cx, cy: fixPad.cy, d: padD, over: ovPad || fixPad.over };
    padFloat = null;
    placePad();
    if (stick) {
      var rd = Math.round(padD * 0.58);
      padRing.style.cssText = 'position:absolute;display:block;box-sizing:border-box;border-radius:50%;' +
        'border:' + Math.max(2, Math.round(padD * 0.018)) + 'px solid #5a5a68;opacity:.42;' +
        'width:' + rd + 'px;height:' + rd + 'px;left:50%;top:50%;margin:' + (-rd / 2) + 'px 0 0 ' + (-rd / 2) + 'px;';
      padRing.style.display = '';
    } else padRing.style.display = 'none';
    (function () {
      var inset2 = Math.round(padD * 0.055);
      for (var i = 0; i < 8; i++) {
        var diag = (i % 2) === 1, u = ticks[i];
        if (!stick && !diag) { u.style.display = 'none'; continue; }
        var tw = stick ? Math.round(padD * (diag ? 0.095 : 0.135)) : Math.round(padD * 0.06);
        var th = stick ? Math.max(3, Math.round(padD * (diag ? 0.048 : 0.058))) : Math.round(padD * 0.06);
        var rr = padD / 2 - inset2 - tw / 2;
        u.style.cssText = 'position:absolute;display:block;text-decoration:none;' +
          'width:' + tw + 'px;height:' + th + 'px;left:50%;top:50%;' +
          'margin:' + (-th / 2) + 'px 0 0 ' + (-tw / 2) + 'px;' + (stick ? '' : 'border-radius:50%;') +
          'transform:rotate(' + (i * 45) + 'deg) translateX(' + rr + 'px);';
        if (litTick(i, tickOn)) u.className = 'on'; else u.className = '';
      }
    })();
    (function () {
      var ar = Math.round(padD * 0.135), inset = Math.round(padD * 0.055), c = '#c8c8d4';
      var css = {
        up: 'border-width:0 ' + ar + 'px ' + (ar * 1.15) + 'px ' + ar + 'px;border-color:transparent transparent ' + c + ' transparent;left:50%;margin-left:' + (-ar) + 'px;top:' + inset + 'px;',
        down: 'border-width:' + (ar * 1.15) + 'px ' + ar + 'px 0 ' + ar + 'px;border-color:' + c + ' transparent transparent transparent;left:50%;margin-left:' + (-ar) + 'px;bottom:' + inset + 'px;',
        left: 'border-width:' + ar + 'px ' + (ar * 1.15) + 'px ' + ar + 'px 0;border-color:transparent ' + c + ' transparent transparent;top:50%;margin-top:' + (-ar) + 'px;left:' + inset + 'px;',
        right: 'border-width:' + ar + 'px 0 ' + ar + 'px ' + (ar * 1.15) + 'px;border-color:transparent transparent transparent ' + c + ';top:50%;margin-top:' + (-ar) + 'px;right:' + inset + 'px;'
      };
      for (var i = 0; i < 4; i++) {
        var d = DIRNAME[i], on = arrow[d].className === 'on';
        arrow[d].style.cssText = 'position:absolute;display:' + (stick ? 'none' : 'block') +
          ';width:0;height:0;border-style:solid;' + css[d];
        arrow[d].className = on ? 'on' : '';
      }
    })();
    var kd = Math.round(padD * (stick ? 0.34 : 0.26));
    knobMax = stick ? Math.max(4, padD / 2 - kd / 2 - Math.max(3, padD * 0.03)) : padD / 2 * 0.42;
    var keepTf = padKnob.style.transform;
    padKnob.style.cssText = 'position:absolute;left:50%;top:50%;width:' + kd + 'px;height:' + kd + 'px;' +
      'margin:' + (-kd / 2) + 'px 0 0 ' + (-kd / 2) + 'px;border-radius:50%;z-index:4;' +
      (stick ? '' : 'background:#101014;opacity:.5;');
    if (keepTf) padKnob.style.transform = keepTf;

    /* ---- A / B ---- */
    bA.style.borderWidth = px(border); bB.style.borderWidth = px(border);
    bA.style.fontSize = px(btn * 0.42); bB.style.fontSize = px(btn * 0.42);
    var ax, ay, bx, by;
    if (column) { ax = cluCx; ay = cluCy + btn * 0.60; bx = cluCx; by = cluCy - btn * 0.60; }
    else { ax = cluCx + btn * 0.62; ay = cluCy + btn * 0.10; bx = cluCx - btn * 0.62; by = cluCy + btn * 0.40; }
    var fa = avoid(ax, ay, btn, btn, actZone, L), fb = avoid(bx, by, btn, btn, actZone, L);
    place(bA, fa.cx, fa.cy, btn, btn, ovAct || fa.over);
    place(bB, fb.cx, fb.cy, btn, btn, ovAct || fb.over);
    cluBox = { x: Math.min(fa.cx, fb.cx) - btn / 2, y: Math.min(fa.cy, fb.cy) - btn / 2,
               w: Math.abs(fa.cx - fb.cx) + btn, h: Math.abs(fa.cy - fb.cy) + btn };

    /* ---- SELECT / START / 密技 / 全螢幕 ---- */
    // fix5：第 7 顆「★密技」與 SELECT / START 同一群 —— 直向排在 START 旁（同一列），
    //       橫向接在 SELECT / START 下方（同一欄，右上角那疊）。
    var chOn = (T.layout.cheatButton !== false);
    bCheat.style.display = chOn ? '' : 'none';
    var sw = smW(), sh = smH(), fw = fsW();
    bSel.style.borderWidth = px(Math.max(2, border - 1));
    bStart.style.borderWidth = px(Math.max(2, border - 1));
    bCheat.style.borderWidth = px(Math.max(2, border - 1));
    bFs.style.borderWidth = px(Math.max(2, border - 1));
    var selP, staP, chP = null, fsP;
    if (portrait) {
      // 一排置中放在主排上方：[SELECT][START][★密技][全螢幕]
      var nSm = chOn ? 3 : 2;
      var totW = sw * nSm + fw + gap * nSm;
      if (totW > right - left - 8) {                 // 太窄 → 縮小
        var kk = (right - left - 8) / totW; sw *= kk; fw *= kk; totW = right - left - 8;
      }
      var x0 = (left + right) / 2 - totW / 2;
      var rowY = smRowTop - gap - Math.max(sh, fw) / 2;
      selP = avoid(x0 + sw / 2, rowY, sw, sh, 'below', L);
      staP = avoid(x0 + sw + gap + sw / 2, rowY, sw, sh, 'below', L);
      if (chOn) chP = avoid(x0 + sw * 2 + gap * 2 + sw / 2, rowY, sw, sh, 'below', L);
      fsP = avoid(x0 + sw * nSm + gap * nSm + fw / 2, rowY, fw, fw, 'below', L);
    } else {
      // 橫向：SELECT / START / ★密技 疊在動作鍵那一側的上方；全螢幕在搖桿那一側的上方
      var gAct2 = actRight ? Math.max(0, right - (L.x + L.w)) : Math.max(0, L.x - left);
      sw = clamp(Math.min(sw, gAct2 - 8), 40, 260);
      var nSm2 = chOn ? 3 : 2;
      // 這一疊不可以壓到下面的 A / B（cluBox 已經算好了）⇒ 塞不下就一起縮矮
      var availH = (cluBox ? cluBox.y : bottom) - 8 - (top + 6);
      if (availH < nSm2 * sh + (nSm2 - 1) * 6) sh = clamp((availH - (nSm2 - 1) * 6) / nSm2, 14, sh);
      var sxc = actRight ? (right - 6 - sw / 2) : (left + 6 + sw / 2);
      var topY = top + 6 + sh / 2;
      selP = avoid(sxc, topY, sw, sh, actZone, L);
      staP = avoid(sxc, topY + sh + 6, sw, sh, actZone, L);
      if (chOn) chP = avoid(sxc, topY + (sh + 6) * 2, sw, sh, actZone, L);
      var fxc = actRight ? (left + 6 + fw / 2) : (right - 6 - fw / 2);
      fsP = avoid(fxc, top + 6 + fw / 2, fw, fw, padZone, L);
    }
    bSel.style.fontSize = px(clamp(sh * 0.36, 8, 15));
    bStart.style.fontSize = px(clamp(sh * 0.36, 8, 15));
    bCheat.style.fontSize = px(clamp(Math.min(sh * 0.46, sw * 0.26), 9, 17));
    place(bSel, selP.cx, selP.cy, sw, sh, selP.over);
    place(bStart, staP.cx, staP.cy, sw, sh, staP.over);
    if (chOn) place(bCheat, chP.cx, chP.cy, sw, sh, chP.over);
    place(bFs, fsP.cx, fsP.cy, fw, fw, fsP.over);
    // 小鍵那一排 / 那一疊的外框（浮動搖桿感應區要閃開它）
    var smBox = { x0: Math.min(selP.cx, staP.cx) - sw / 2, x1: Math.max(selP.cx, staP.cx) + sw / 2,
                  y0: Math.min(selP.cy, staP.cy) - sh / 2, y1: Math.max(selP.cy, staP.cy) + sh / 2 };
    if (chOn) {
      smBox.x0 = Math.min(smBox.x0, chP.cx - sw / 2); smBox.x1 = Math.max(smBox.x1, chP.cx + sw / 2);
      smBox.y0 = Math.min(smBox.y0, chP.cy - sh / 2); smBox.y1 = Math.max(smBox.y1, chP.cy + sh / 2);
    }
    (function () {
      var k = Math.round(fw * 0.30), box = bFs.firstChild;
      if (!box || box.className !== 'nt-fsi') return;
      box.style.cssText = 'position:relative;display:block;width:' + (k * 2 + 6) + 'px;height:' + (k * 2 + 6) + 'px;';
      var q = box.children, b2 = Math.max(2, Math.round(fw * 0.07));
      var pos = [[0, 0], [0, 1], [1, 0], [1, 1]];
      for (var i = 0; i < 4 && i < q.length; i++) {
        q[i].style.cssText = 'position:absolute;display:block;width:' + k + 'px;height:' + k + 'px;' +
          (pos[i][0] ? 'bottom:0;border-bottom:' : 'top:0;border-top:') + b2 + 'px solid currentColor;' +
          (pos[i][1] ? 'right:0;border-right:' : 'left:0;border-left:') + b2 + 'px solid currentColor;';
      }
    })();

    /* ---- 浮動搖桿感應區 ---- */
    var half = padD / 2;
    var zx0 = left, zx1 = right, zy0 = top, zy1 = bottom;
    if (portrait) {
      zy0 = Math.max(top, L.y + L.h + 2);
      zy1 = bottom;
      if (actRight) zx1 = Math.min(zx1, Math.min(cluBox.x, smBox.x0) - 4);
      else zx0 = Math.max(zx0, Math.max(cluBox.x + cluBox.w, smBox.x1) + 4);
    } else {
      zy0 = Math.max(top, fsP.cy + fw / 2 + 4);
      if (actRight) { zx0 = left; zx1 = Math.min(L.x - 2, cluBox.x - 4); }
      else { zx0 = Math.max(L.x + L.w + 2, cluBox.x + cluBox.w + 4); zx1 = right; }
    }
    zx0 = Math.max(zx0, left); zx1 = Math.min(zx1, right);
    zy0 = Math.max(zy0, top); zy1 = Math.min(zy1, bottom);
    zoneRect = (zx1 - zx0 > 24 && zy1 - zy0 > 24) ? { x: zx0, y: zy0, w: zx1 - zx0, h: zy1 - zy0 } : null;
    var homeOver = padHome.over;
    var zz = zoneRect;
    clampFloat = function (cx, cy) {
      if (!zz) return { cx: padHome.cx, cy: padHome.cy };
      var x = clamp(cx, left + half, right - half), y = clamp(cy, top + half, bottom - half);
      if (!homeOver) {           // 原位沒壓畫面 ⇒ 浮動也不准壓畫面
        if (portrait) y = Math.max(y, L.y + L.h + half + 1);
        else if (actRight) x = Math.min(x, L.x - half - 1);
        else x = Math.max(x, L.x + L.w + half + 1);
        if (actRight) x = Math.min(x, cluBox.x - half - 2);
        else x = Math.max(x, cluBox.x + cluBox.w + half + 2);
      }
      x = clamp(x, left + half, right - half); y = clamp(y, top + half, bottom - half);
      return { cx: x, cy: y };
    };
    if (zoneRect && T.layout.stickFloat) {
      zone.style.display = '';
      zone.style.left = px(zoneRect.x); zone.style.top = px(zoneRect.y);
      zone.style.width = px(zoneRect.w); zone.style.height = px(zoneRect.h);
      zone.style.opacity = '0';
    } else zone.style.display = 'none';

    T.overlapping = ovAny;
  }

  /* ------------------------------------------------------------------ 輸入 */
  // 不改 input.js：用 inject 當「第三個來源」。按著 = clearInject + inject(mask, HOLD)；
  // 全放開 = inject(0, 0)（清空佇列 ⇒ 鍵盤 / 手把立刻恢復）。
  var touchMask = 0, lastInjected = -1;
  function In() { return NES.Input; }
  function applyInput(force) {
    var I = In();
    if (!I || typeof I.inject !== 'function') return;
    if (!force && touchMask === lastInjected) return;
    lastInjected = touchMask;
    try {
      // 總控整合：input.js 已加 setExternal（與鍵盤 | 手把 OR，不蓋掉鍵盤）；舊版 input.js 退回 inject 覆蓋法
      if (typeof I.setExternal === 'function') { I.setExternal(touchMask); return; }
      if (touchMask === 0) { I.inject(0, 0); }
      else {
        if (typeof I.clearInject === 'function') I.clearInject();
        I.inject(touchMask, HOLD);
      }
    } catch (e) { }
  }
  function setBit(bit, on) {
    var m = on ? (touchMask | bit) : (touchMask & ~bit);
    if (m === touchMask) return;
    touchMask = m & 255;
    applyInput(false);
  }
  function setDirMask(dm) {
    var m = (touchMask & ~DIRBITS) | (dm & DIRBITS);
    if (m === touchMask) return;
    touchMask = m & 255;
    for (var i = 0; i < 4; i++) {
      var d = DIRNAME[i], bit = BTN[d.toUpperCase()];
      arrow[d].className = (touchMask & bit) ? 'on' : '';
    }
    applyInput(false);
  }
  function unlockAudio() {
    try {
      var n = NES.instance;
      if (!n) return;
      if (n.apu && typeof n.apu.unlock === 'function') n.apu.unlock();
      else if (typeof n.connectAudio === 'function') n.connectAudio();
      if (n.audioCtx && n.audioCtx.state === 'suspended' && n.audioCtx.resume) n.audioCtx.resume();
    } catch (e) { }
  }
  function toggleFullscreen() {
    try {
      var el = D.documentElement;
      if (!D.fullscreenElement) {
        var p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (p && p['catch']) p['catch'](function () { });
      } else {
        var q = (D.exitFullscreen || D.webkitExitFullscreen).call(D);
        if (q && q['catch']) q['catch'](function () { });
      }
    } catch (e) { }
  }

  /* fix5：一鍵密技 —— 不是 NES 八鍵，只派發 window 的 `nes-cheat` 事件（防連按 300ms）。
   * 遊戲端（games 各自的 main.js）自己決定 play / gameover / title 各要做什麼。 */
  var lastCheatMs = -100000;
  function flashCheat() {
    try {
      bCheat.classList.remove('nt-flash');
      void bCheat.offsetWidth;                  // 重播動畫
      bCheat.classList.add('nt-flash');
      W.setTimeout(function () { bCheat.classList.remove('nt-flash'); }, 360);
    } catch (e) { }
  }
  function dispatchCheat(src) {
    var ev = null;
    try { ev = new W.CustomEvent('nes-cheat', { detail: { source: src } }); }
    catch (e) {
      try { ev = D.createEvent('CustomEvent'); ev.initCustomEvent('nes-cheat', false, false, { source: src }); }
      catch (e2) { ev = null; }
    }
    if (!ev) return false;
    try { W.dispatchEvent(ev); } catch (e3) { return false; }
    return true;
  }
  function fireCheat(src) {
    var now = Date.now();
    if (now - lastCheatMs < CHEAT_MS) return false;   // 防連按
    lastCheatMs = now;
    flashCheat();
    return dispatchCheat(src || 'touch');
  }

  var lastTouch = 0, lastOther = 0;
  function markTouch() {
    lastTouch = Date.now();
    if (T.layout.mode === 'off' && AVAILABLE) { T.layout.mode = 'auto'; store(); }
    if (T.layout.mode === 'auto') applyAuto();
  }

  var resets = [];
  function bindButton(el, bit, act) {
    var pid = null;
    function down(e) {
      if (pid !== null) return;
      pid = (e.pointerId === undefined) ? 't' : e.pointerId;
      if (HAS_PE && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (x) { } }
      el.classList.add('nt-on');
      markTouch(); unlockAudio();
      if (bit) setBit(bit, true);
      if (act && act.down) act.down();           // fix5：密技鍵在 pointerdown 邊緣就發動
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    function up(e) {
      if (pid === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
      if (HAS_PE && el.releasePointerCapture && e && e.pointerId !== undefined) {
        try { el.releasePointerCapture(e.pointerId); } catch (x) { }
      }
      pid = null; el.classList.remove('nt-on');
      if (bit) setBit(bit, false);
      unlockAudio();
      if (act && act.up) act.up();         // bit = 0 的鍵（全螢幕 / 密技）自己決定要做什麼
      if (e && e.cancelable) e.preventDefault();
    }
    if (HAS_PE) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    } else {
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    resets.push(function () { if (pid !== null) { pid = null; el.classList.remove('nt-on'); if (bit) setBit(bit, false); } });
  }

  var curSec = -1;
  function setTickOn(s) {
    if (tickOn === s) return;
    tickOn = s;
    for (var i = 0; i < 8; i++) ticks[i].className = litTick(i, s) ? 'on' : '';
  }
  function sectorOf(ox, oy, len, dead) {
    if (len < dead) return -1;
    var deg = (Math.atan2(oy, ox) * 180 / Math.PI + 360) % 360;
    var near = Math.round(deg / 45) % 8;
    if (curSec < 0) return near;
    var diff = ((deg - curSec * 45 + 540) % 360) - 180;
    return (Math.abs(diff) <= 22.5 + HYST) ? curSec : near;
  }
  function padCalc(cx, cy) {
    var r = pad.getBoundingClientRect();
    var ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    var rad = Math.max(1, r.width / 2), len = Math.sqrt(ox * ox + oy * oy);
    var stick = (T.layout.stick === 'stick');
    var dead = Math.max(6, rad * (stick ? DEAD_STICK : DEAD_PAD));
    var s = sectorOf(ox, oy, len, dead);
    curSec = s;
    setDirMask(s < 0 ? 0 : SEC[s]);
    setTickOn(s);
    var a = len > 0.01 ? Math.atan2(oy, ox) : 0;
    var k = clamp(len, 0, knobMax);
    padKnob.style.transform = ((stick || len >= dead) && len > 0.01)
      ? 'translate(' + (Math.cos(a) * k).toFixed(1) + 'px,' + (Math.sin(a) * k).toFixed(1) + 'px)' : '';
  }
  function padRelease() {
    curSec = -1; setDirMask(0); setTickOn(-1); padKnob.style.transform = '';
    if (padFloat) {
      padFloat = null; placePad();
      pad.classList.remove('nt-ret'); void pad.offsetWidth; pad.classList.add('nt-ret');
      W.setTimeout(function () { pad.classList.remove('nt-ret'); }, 260);
    }
  }
  function canFloatAt(cx, cy) {
    if (!T.layout.stickFloat || !zoneRect || !padHome) return false;
    return cx >= zoneRect.x && cx <= zoneRect.x + zoneRect.w && cy >= zoneRect.y && cy <= zoneRect.y + zoneRect.h;
  }
  function bindPad(el, floating) {
    var pid = null;
    function down(e) {
      if (pid !== null) return;
      var p = (e.touches ? e.touches[0] : e);
      if (floating) {
        if (!canFloatAt(p.clientX, p.clientY)) return;
        padFloat = clampFloat(p.clientX, p.clientY);
        pad.classList.remove('nt-ret'); placePad();
      }
      pid = (e.pointerId === undefined) ? 't' : e.pointerId;
      if (HAS_PE && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (x) { } }
      markTouch(); unlockAudio(); padCalc(p.clientX, p.clientY);
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    function move(e) {
      if (pid === null) return;
      if (e.pointerId !== undefined && e.pointerId !== pid) return;
      var p = (e.touches ? e.touches[0] : e);
      padCalc(p.clientX, p.clientY);
      if (e.cancelable) e.preventDefault();
    }
    function up(e) {
      if (pid === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
      if (HAS_PE && el.releasePointerCapture && e && e.pointerId !== undefined) {
        try { el.releasePointerCapture(e.pointerId); } catch (x) { }
      }
      pid = null; padRelease(); unlockAudio();
      if (e && e.cancelable) e.preventDefault();
    }
    if (HAS_PE) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    } else {
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchmove', move, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    resets.push(function () { pid = null; padRelease(); });
  }
  bindPad(pad, false);
  bindPad(zone, true);
  bindButton(bA, BTN.A); bindButton(bB, BTN.B);
  bindButton(bSel, BTN.SELECT); bindButton(bStart, BTN.START);
  bindButton(bCheat, 0, { down: function () { fireCheat('touch'); } });
  bindButton(bFs, 0, { up: toggleFullscreen });
  function releaseAll() {
    for (var i = 0; i < resets.length; i++) resets[i]();
    if (touchMask !== 0) { touchMask = 0; applyInput(true); }
    else { lastInjected = -1; }
  }

  rootEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  rootEl.addEventListener('dblclick', function (e) { e.preventDefault(); });
  for (var gi = 0; gi < 3; gi++) {
    D.addEventListener(['gesturestart', 'gesturechange', 'gestureend'][gi],
      function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  /* ------------------------------------------------------------ 顯示 / 淡出 */
  var visible = false;
  function setVisible(v) {
    v = !!v;
    if (v === visible) return;
    visible = v;
    if (v) rootEl.classList.remove('nt-off'); else rootEl.classList.add('nt-off');
    rootEl.setAttribute('aria-hidden', v ? 'false' : 'true');
    if (!v) releaseAll(); else relayout();
  }
  function autoVisible() {
    var m = T.layout.mode;
    if (m === 'on') return true;
    if (m === 'off') return false;
    return AVAILABLE && lastOther <= lastTouch;
  }
  function applyAuto() { setVisible(autoVisible()); }
  D.addEventListener('pointerdown', function (e) {
    if (!HAS_PE || e.pointerType === 'touch' || e.pointerType === undefined) markTouch();
  }, true);
  D.addEventListener('touchstart', function () { markTouch(); }, { capture: true, passive: true });
  W.addEventListener('keydown', function () {
    lastOther = Date.now();
    if (T.layout.mode === 'auto') applyAuto();
  }, true);
  W.addEventListener('blur', function () { releaseAll(); });
  D.addEventListener('visibilitychange', function () { if (D.hidden) releaseAll(); });

  /* ------------------------------------------------------------ 設定存讀 */
  var KEY = 'nes_touch';
  function assign(o) {
    if (!o || typeof o !== 'object') return false;
    if (o.mode === 'auto' || o.mode === 'on' || o.mode === 'off') T.layout.mode = o.mode;
    if (o.side === 'left' || o.side === 'right') T.layout.side = o.side;
    if (typeof o.size === 'number' && isFinite(o.size)) T.layout.size = clamp(o.size, 0.6, 1.6);
    if (typeof o.opacity === 'number' && isFinite(o.opacity)) T.layout.opacity = clamp(o.opacity, 0.15, 1);
    if (o.stick === 'dpad' || o.stick === 'stick') T.layout.stick = o.stick;
    if (typeof o.stickFloat === 'boolean') T.layout.stickFloat = o.stickFloat;
    if (typeof o.cheatButton === 'boolean') T.layout.cheatButton = o.cheatButton;
    return true;
  }
  function load() {
    try {
      var s = W.localStorage && W.localStorage.getItem(KEY);
      if (s) assign(JSON.parse(s));
      // 純觸控裝置存成 off 會鎖死（沒有任何入口能點回來）⇒ 一律退回 auto
      if (T.layout.mode === 'off' && AVAILABLE) T.layout.mode = 'auto';
    } catch (e) { }
  }
  function store() {
    try {
      W.localStorage && W.localStorage.setItem(KEY, JSON.stringify({
        mode: T.layout.mode, side: T.layout.side, size: T.layout.size,
        opacity: T.layout.opacity, stick: T.layout.stick, stickFloat: T.layout.stickFloat,
        cheatButton: T.layout.cheatButton
      }));
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------- 重排 / 每幀維護 */
  var sig = '', n = 0;
  function poll() {
    var L = canvasRect(), v = viewport();
    var s = [L.x | 0, L.y | 0, L.w | 0, L.h | 0, v.w | 0, v.h | 0, L.portrait].join(',');
    if (s !== sig) { sig = s; relayout(); }
    // inject 看門狗：佇列被別人清掉 / 耗盡時補回來（觸控還按著就不能斷）
    if (touchMask !== 0) {
      var I = In();
      try { if (I && I.injectPending && I.injectPending() < 4096) applyInput(true); } catch (e) { }
    }
    // 手把：有任何鍵按著就當「非觸控輸入」⇒ auto 模式淡出
    try {
      if (W.navigator && W.navigator.getGamepads && NES.Input && NES.Input.gamepadEnabled && NES.Input.gamepadEnabled()) {
        var pads = W.navigator.getGamepads();
        for (var i = 0; i < pads.length; i++) {
          var pd = pads[i]; if (!pd || !pd.buttons) continue;
          for (var j = 0; j < pd.buttons.length; j++) {
            if (pd.buttons[j] && pd.buttons[j].pressed) {
              lastOther = Date.now(); if (T.layout.mode === 'auto') applyAuto(); j = pd.buttons.length; i = pads.length;
            }
          }
        }
      }
    } catch (e) { }
  }
  function tick() { W.requestAnimationFrame(tick); if ((++n % 6) === 0) poll(); }
  W.addEventListener('nes-resize', function () { relayout(); });
  W.addEventListener('resize', function () { relayout(); });
  W.addEventListener('orientationchange', function () { W.setTimeout(relayout, 120); });
  if (W.visualViewport && W.visualViewport.addEventListener) {
    W.visualViewport.addEventListener('resize', function () { relayout(); });
    W.visualViewport.addEventListener('scroll', function () { relayout(); });
  }
  D.addEventListener('fullscreenchange', function () { W.setTimeout(relayout, 80); });

  /* ------------------------------------------------------------ 對外 API */
  T.available = AVAILABLE;
  T.fullscreenSupported = FS_OK;
  T.VERSION = '1.0.0';
  T.layout = { mode: 'auto', side: 'right', size: 1, opacity: 0.8, stick: 'stick', stickFloat: true,
               cheatButton: true };
  T.buttons = { dpad: pad, a: bA, b: bB, select: bSel, start: bStart, cheat: bCheat, fs: bFs };
  T.overlapping = false;
  T.el = rootEl;
  T.active = function () { return visible; };
  T.show = function () { T.layout.mode = 'on'; store(); setVisible(true); relayout(); };
  T.hide = function () { T.layout.mode = 'off'; store(); setVisible(false); };
  T.setLayout = function (o) { assign(o); relayout(); applyAuto(); store(); return T.layout; };
  T.rects = function () {
    var o = {};
    for (var k in T.buttons) {
      if (!T.buttons.hasOwnProperty(k)) continue;
      var e = T.buttons[k];
      if (!e || e.style.display === 'none') continue;
      var r = e.getBoundingClientRect();
      o[k] = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
    return o;
  };
  T.mask = function () { return touchMask; };
  T.dirs = function () {
    return { up: !!(touchMask & BTN.UP), down: !!(touchMask & BTN.DOWN),
             left: !!(touchMask & BTN.LEFT), right: !!(touchMask & BTN.RIGHT) };
  };
  T.sector = function () { return curSec; };
  T.tickOn = function () { return tickOn; };
  T.floatZone = function () {
    return (zoneRect && T.layout.stickFloat)
      ? { x: zoneRect.x, y: zoneRect.y, w: zoneRect.w, h: zoneRect.h } : null;
  };
  T.padHome = function () { return padHome ? { cx: padHome.cx, cy: padHome.cy, d: padHome.d } : null; };
  T.floating = function () { return !!padFloat; };
  T.relayout = relayout;
  T.releaseAll = releaseAll;
  // fix5：程式觸發一鍵密技（= 按下 ★密技 鍵；同樣吃 300ms 防連按）。回傳有沒有真的送出事件。
  T.cheat = function () { return fireCheat('api'); };
  T.CHEAT_MS = CHEAT_MS;
  T.toggleFullscreen = toggleFullscreen;
  NES.Touch = T;

  load();
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', mount); else mount();
  W.addEventListener('load', function () { mount(); relayout(); });
  tick();
})(typeof window !== 'undefined' ? window : this);
