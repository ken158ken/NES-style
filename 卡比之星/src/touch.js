// 觸控虛擬按鍵覆蓋層（Round 11 touch agent）— API 契約見 docs/TASKS.md Round 11 第 3 條
//
// 設計重點
// - 純 DOM 覆蓋層：自己 appendChild + 自注入 <style>，index.html / build.py 都不用改（dist 單檔自然包含）。
// - 輸入只走 KB.input.setTouch(name,bool)（input.js 的第三個來源），不直接碰遊戲狀態。
// - 排版優先放在「畫面（KB.layout）以外的空白處」：直向＝畫面下方，橫向＝左右兩側；
//   空間不足才半透明壓在畫面邊緣（該顆按鍵自己降透明度）。
// - KB.layout（screen agent，main.js）還沒出現時退回 KB.canvas.getBoundingClientRect()。
// - 自動顯示：mode auto 時觸控裝置顯示、鍵盤 / 手把輸入後淡出、再觸控又出現；mode on/off 強制。
// - 設定存 KB.save.settings.touch（KB.save 可能比本檔晚建立 → 懶讀，tick 內偵測到就套用）。
(function () {
  const W = window, D = document;
  const AVAILABLE = ('ontouchstart' in W) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
  const HAS_PE = !!W.PointerEvent;
  const FS_OK = !!(D.documentElement.requestFullscreen || D.documentElement.webkitRequestFullscreen);
  const TAN22 = Math.tan(Math.PI / 8);          // 8 方向等分（45°）的邊界斜率
  const DIRS = ['left', 'right', 'up', 'down'];
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  // ---------- 樣式（像素風：實色 + 粗框 + 內陰影，不用漸層） ----------
  const CSS = `
#kb-touch{position:fixed;left:0;top:0;width:100%;height:100%;height:100dvh;z-index:60;
  pointer-events:none;opacity:1;transition:opacity .22s ease;
  font-family:"Courier New",ui-monospace,monospace;font-weight:bold;line-height:1;
  touch-action:none;-webkit-user-select:none;user-select:none;
  -webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;}
#kb-touch.kb-off{opacity:0;}
#kb-touch.kb-off *{pointer-events:none !important;}
#kb-touch [data-kb]{position:absolute;box-sizing:border-box;pointer-events:auto;touch-action:none;
  display:flex;align-items:center;justify-content:center;text-align:center;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
  -webkit-tap-highlight-color:transparent;transition:filter .06s linear,transform .06s linear;}
#kb-touch .kb-btn{border-radius:50%;border-style:solid;color:#fff;
  box-shadow:inset 0 -4px 0 rgba(0,0,0,.28),inset 0 3px 0 rgba(255,255,255,.30),0 2px 0 rgba(0,0,0,.35);}
#kb-touch .kb-btn.kb-on{filter:brightness(1.45);transform:scale(.90);
  box-shadow:inset 0 0 0 3px rgba(255,255,255,.8),0 0 10px rgba(255,255,255,.45);}
#kb-touch .kb-jump{background:#ffb0d0;border-color:#a81c48;color:#4a1030;}
#kb-touch .kb-attack{background:#e83030;border-color:#7a1020;color:#fff;}
#kb-touch .kb-select{background:#f8e040;border-color:#8a6000;color:#3a2c00;}
#kb-touch .kb-start{background:#a8a8b0;border-color:#3a3a48;color:#14141c;border-radius:14%/34%;}
#kb-touch .kb-fs{background:#4878f8;border-color:#1a2a70;color:#fff;}
#kb-touch .kb-pad{background:#2a2f4a;border:4px solid #12162c;border-radius:50%;
  box-shadow:inset 0 -5px 0 rgba(0,0,0,.30),inset 0 4px 0 rgba(255,255,255,.14),0 2px 0 rgba(0,0,0,.35);}
#kb-touch .kb-pad i{position:absolute;display:block;width:0;height:0;border-style:solid;opacity:.85;}
#kb-touch .kb-pad i.on{opacity:1;filter:drop-shadow(0 0 3px #ffe040);}
#kb-touch .kb-pad b{position:absolute;display:block;border-radius:50%;background:#12162c;opacity:.55;}
#kb-touch .kb-fsi{position:relative;display:block;}
#kb-touch .kb-fsi s{position:absolute;display:block;border:3px solid currentColor;text-decoration:none;}
`;

  // ---------- DOM ----------
  const style = D.createElement('style');
  style.id = 'kb-touch-style'; style.textContent = CSS;
  const root = D.createElement('div');
  root.id = 'kb-touch'; root.className = 'kb-off';
  root.setAttribute('aria-hidden', 'true');

  function mk(cls, kb, label) {
    const e = D.createElement('div');
    e.className = cls; e.setAttribute('data-kb', kb);
    if (label) e.textContent = label;
    root.appendChild(e); return e;
  }
  const pad = mk('kb-pad', 'dpad', '');
  const arrow = {};
  for (const d of ['up', 'down', 'left', 'right']) { const i = D.createElement('i'); arrow[d] = i; pad.appendChild(i); }
  const padKnob = D.createElement('b'); pad.appendChild(padKnob);
  const bJump = mk('kb-btn kb-jump', 'jump', 'A');
  const bAtk = mk('kb-btn kb-attack', 'attack', 'B');
  const bSel = mk('kb-btn kb-select', 'select', 'C');
  const bStart = mk('kb-btn kb-start', 'start', 'START');
  const bFs = mk('kb-btn kb-fs', 'fs', '');
  {   // 全螢幕圖示：四個角括號（純 CSS，不依賴字型）
    const box = D.createElement('span'); box.className = 'kb-fsi';
    for (let i = 0; i < 4; i++) box.appendChild(D.createElement('s'));
    bFs.appendChild(box);
  }
  if (!FS_OK) bFs.style.display = 'none';       // iOS Safari 無全螢幕 API → 隱藏（改由 PWA「加到主畫面」）
  // safe-area 探針（讀 env(safe-area-inset-*) 的實際 px）
  const probe = D.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  root.appendChild(probe);

  function mount() {
    if (!D.body || root.parentNode) return;
    D.head.appendChild(style); D.body.appendChild(root);
    // 第一次顯示不要跑淡入（截圖工具是同步前進幀數的，淡入沒跑完會拍到半透明）
    root.style.transition = 'none';
    relayout(); applyAuto();
    void root.offsetWidth;
    W.requestAnimationFrame(() => { root.style.transition = ''; });
  }

  // ---------- 量測 ----------
  function safeArea() {
    try {
      const c = getComputedStyle(probe);
      return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 };
    } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
  }
  function viewport() {
    const vv = W.visualViewport;
    return { w: (vv && vv.width) || W.innerWidth || 320, h: (vv && vv.height) || W.innerHeight || 480 };
  }
  /** 畫面（canvas）在 viewport 的矩形：優先 KB.layout（契約 1），退路 canvas.getBoundingClientRect() */
  function canvasRect() {
    const L = KB.layout;
    if (L && L.w > 0 && L.h > 0) return { x: L.x || 0, y: L.y || 0, w: L.w, h: L.h, portrait: (typeof L.portrait === 'boolean' ? L.portrait : null) };
    const c = KB.canvas;
    if (c && c.getBoundingClientRect) {
      const r = c.getBoundingClientRect();
      if (r.width > 0) return { x: r.left, y: r.top, w: r.width, h: r.height, portrait: null };
    }
    const v = viewport();
    return { x: 0, y: 0, w: v.w, h: v.h * 0.6, portrait: null };
  }

  // ---------- 排版 ----------
  const T = {};                 // KB.TOUCH（下方賦值）
  let ovAny = false;            // 這次排版有沒有壓到畫面（供 PROGRESS / 測試 WARN）
  function px(n) { return Math.round(n) + 'px'; }
  function place(el, cx, cy, w, h, over) {
    el.style.left = px(cx - w / 2); el.style.top = px(cy - h / 2);
    el.style.width = px(w); el.style.height = px(h);
    el.style.opacity = String(clamp(T.layout.opacity * (over ? 0.62 : 1), 0.08, 1));
    if (over) ovAny = true;
  }
  function inRect(cx, cy, L) { return cx > L.x && cx < L.x + L.w && cy > L.y && cy < L.y + L.h; }

  function relayout() {
    if (!root.parentNode) return;
    ovAny = false;
    const v = viewport(), sa = safeArea(), L = canvasRect(), sz = T.layout.size;
    const left = sa.l, right = v.w - sa.r, top = sa.t, bottom = v.h - sa.b;
    const aw = Math.max(80, right - left), ah = Math.max(80, bottom - top);
    const portrait = (L.portrait === null) ? (v.h >= v.w) : L.portrait;
    const gap = Math.round(clamp(Math.min(aw, ah) * 0.035, 6, 18));

    let btn = clamp(Math.min(aw * 0.165, ah * 0.20, 74 * sz), 38, 110);
    let padD = clamp(Math.min(aw * 0.42, ah * 0.48, 166 * sz), 84, 220);
    const actRight = (T.layout.side !== 'left');       // 攻擊鍵在右手側

    // 動作鍵叢集：預設橫排（B 左下 / A 右上 / C 上方）；橫向側邊太窄時改直排（C / B / A 疊成一行）
    let column = false;
    const cluW = () => column ? btn * 1.10 : btn * 2.20;
    const cluH = () => column ? btn * 3.30 : btn * 2.08;
    const smW = () => btn * 1.30, smH = () => btn * 0.64, fsW = () => btn * 0.66;

    let padCx, padCy, cluCx, cluCy, s1x, s1y, s2x, s2y;
    let ovPad = false, ovAct = false, ovS1 = false, ovS2 = false;

    if (portrait) {
      // 直向：畫面貼上方，按鍵放下方空白帶
      const bandTop = Math.max(top, L.y + L.h + 2), bandBot = bottom;
      const bandH = bandBot - bandTop;
      let rowH = Math.max(padD, cluH());
      if (bandH < rowH + 8) {                     // 放不下 → 壓在畫面下緣（半透明）
        if (bandH > 70) { padD = clamp(Math.min(padD, bandH * 1.2), 84, 220); btn = clamp(Math.min(btn, bandH * 0.52), 38, 110); }
        rowH = Math.max(padD, cluH());
        padCy = cluCy = bottom - gap - rowH / 2;
        ovPad = ovAct = true;
      } else {
        padCy = cluCy = bandBot - gap - rowH / 2;
      }
      padCx = actRight ? (left + gap + padD / 2) : (right - gap - padD / 2);
      cluCx = actRight ? (right - gap - cluW() / 2) : (left + gap + cluW() / 2);
      // START / 全螢幕：主排上方（空白帶裡還有空間）→ 否則壓在畫面下緣
      const mid = (v.w - smW() - gap - fsW()) / 2 + smW() / 2;
      s1x = mid; s2x = mid + smW() / 2 + gap + fsW() / 2;
      const rowTop = padCy - rowH / 2;
      if (rowTop - bandTop >= smH() + gap) { s1y = s2y = rowTop - gap - smH() / 2; }
      else { s1y = s2y = Math.max(top + smH() / 2 + 2, bandTop - gap - smH() / 2); ovS1 = ovS2 = true; }
    } else {
      // 橫向：畫面置中 / 偏上，按鍵放左右兩側空白
      const gl = Math.max(0, L.x - left), gr = Math.max(0, right - (L.x + L.w));
      const gPad = actRight ? gl : gr, gAct = actRight ? gr : gl;
      // 側邊空白較窄時縮小邊距，盡量不要壓到畫面
      const g2 = clamp(Math.min(gap, Math.floor(Math.min(gPad, gAct) * 0.06)), 4, gap);
      const fitPad = gPad - g2 * 2, fitAct = gAct - g2 * 2;
      // 使用者自己把按鍵調大（size ≥ 1.15）＝ 寧可半透明壓到畫面邊緣也要好按（平板側邊窄時的逃生口）
      const bigWanted = sz >= 1.15, over = f => bigWanted ? f * 1.5 : f;
      if (fitPad >= 78) { padD = clamp(Math.min(padD, over(fitPad)), 78, 220); ovPad = padD > fitPad + 1; }
      else ovPad = true;
      if (fitAct < cluW()) {                 // 橫排塞不下 → 直排；直排還塞不下才壓畫面
        column = true;
        if (fitAct >= 44) { btn = clamp(Math.min(btn, over(fitAct) / 1.10), 38, 110); ovAct = btn * 1.10 > fitAct + 1; }
        else ovAct = true;
      }
      const rowH = Math.max(padD, cluH());
      padCy = cluCy = clamp(bottom - g2 - rowH / 2, top + rowH / 2, bottom - rowH / 2);
      padCx = actRight ? (left + g2 + padD / 2) : (right - g2 - padD / 2);
      cluCx = actRight ? (right - g2 - cluW() / 2) : (left + g2 + cluW() / 2);
      // START 放動作側上方、全螢幕放方向側上方（都在畫面左右的空白帶）
      s1x = clamp(cluCx, left + smW() / 2 + 2, right - smW() / 2 - 2); s1y = top + g2 + smH() / 2;
      s2x = clamp(padCx, left + fsW() / 2 + 2, right - fsW() / 2 - 2); s2y = top + g2 + fsW() / 2;
      ovS1 = inRect(s1x, s1y, L); ovS2 = inRect(s2x, s2y, L);
    }
    const border = Math.max(3, Math.round(btn * 0.07));

    // 套用
    pad.style.borderWidth = px(Math.max(3, padD * 0.03));
    place(pad, padCx, padCy, padD, padD, ovPad);
    const ar = Math.round(padD * 0.135), inset = Math.round(padD * 0.055);
    const setAr = (el, dir) => {
      el.style.borderWidth = '';
      const c = '#c8d0f0';
      if (dir === 'up') el.style.cssText = `position:absolute;width:0;height:0;border-style:solid;border-width:0 ${ar}px ${ar * 1.15}px ${ar}px;border-color:transparent transparent ${c} transparent;left:50%;margin-left:${-ar}px;top:${inset}px;`;
      if (dir === 'down') el.style.cssText = `position:absolute;width:0;height:0;border-style:solid;border-width:${ar * 1.15}px ${ar}px 0 ${ar}px;border-color:${c} transparent transparent transparent;left:50%;margin-left:${-ar}px;bottom:${inset}px;`;
      if (dir === 'left') el.style.cssText = `position:absolute;width:0;height:0;border-style:solid;border-width:${ar}px ${ar * 1.15}px ${ar}px 0;border-color:transparent ${c} transparent transparent;top:50%;margin-top:${-ar}px;left:${inset}px;`;
      if (dir === 'right') el.style.cssText = `position:absolute;width:0;height:0;border-style:solid;border-width:${ar}px 0 ${ar}px ${ar * 1.15}px;border-color:transparent transparent transparent ${c};top:50%;margin-top:${-ar}px;right:${inset}px;`;
    };
    for (const d of ['up', 'down', 'left', 'right']) { const on = arrow[d].classList.contains('on'); setAr(arrow[d], d); if (on) arrow[d].classList.add('on'); }
    const kd = Math.round(padD * 0.26);
    padKnob.style.cssText = `position:absolute;left:50%;top:50%;width:${kd}px;height:${kd}px;margin:${-kd / 2}px 0 0 ${-kd / 2}px;border-radius:50%;background:#12162c;opacity:.5;`;

    for (const b of [bJump, bAtk, bSel]) { b.style.borderWidth = px(border); b.style.fontSize = px(btn * 0.40); }
    const cD = btn * 0.74;
    if (column) {                     // 直排：C 上、B 中、A 下（拇指自然落在最下面的 A）
      place(bSel, cluCx, cluCy - btn * 1.20, cD, cD, ovAct);
      place(bAtk, cluCx, cluCy, btn, btn, ovAct);
      place(bJump, cluCx, cluCy + btn * 1.18, btn, btn, ovAct);
    } else {                          // 橫排：B 左下、A 右上、C 上方
      place(bAtk, cluCx - btn * 0.60, cluCy + btn * 0.30, btn, btn, ovAct);
      place(bJump, cluCx + btn * 0.60, cluCy - btn * 0.10, btn, btn, ovAct);
      place(bSel, cluCx - btn * 0.22, cluCy - btn * 0.92, cD, cD, ovAct);
    }
    bSel.style.fontSize = px(cD * 0.42);

    bStart.style.borderWidth = px(Math.max(3, border - 1));
    bStart.style.fontSize = px(clamp(smH() * 0.40, 9, 17));
    bStart.style.letterSpacing = px(Math.max(0, smH() * 0.02));
    place(bStart, s1x, s1y, smW(), smH(), ovS1);
    bFs.style.borderWidth = px(Math.max(3, border - 1));
    place(bFs, s2x, s2y, fsW(), fsW(), ovS2);
    {   // 全螢幕圖示：四角括號
      const k = Math.round(fsW() * 0.30), box = bFs.firstChild;
      if (box && box.className === 'kb-fsi') {
        box.style.cssText = `position:relative;display:block;width:${k * 2 + 6}px;height:${k * 2 + 6}px;`;
        const q = box.children, b2 = Math.max(2, Math.round(fsW() * 0.07));
        const pos = [[0, 0, 'top left'], [0, 1, 'top right'], [1, 0, 'bottom left'], [1, 1, 'bottom right']];
        for (let i = 0; i < 4 && i < q.length; i++) {
          const [vy, vx] = pos[i];
          q[i].style.cssText = `position:absolute;display:block;width:${k}px;height:${k}px;` +
            (vy ? 'bottom:0;border-bottom:' : 'top:0;border-top:') + `${b2}px solid currentColor;` +
            (vx ? 'right:0;border-right:' : 'left:0;border-left:') + `${b2}px solid currentColor;`;
        }
      }
    }
    T.overlapping = ovAny;
  }

  // ---------- 輸入 ----------
  function setAct(name, on) { try { KB.input && KB.input.setTouch && KB.input.setTouch(name, on); } catch (e) { } }
  function unlockAudio() { try { KB.audio && KB.audio.unlock && KB.audio.unlock(); } catch (e) { } }
  let lastTouch = 0, lastOther = 0;
  // qa11 P1 逃生口：mode off 時觸控裝置上仍有人在點 → 視為要用觸控，切回 auto
  function markTouch() { lastTouch = Date.now(); if (T.layout.mode === 'off' && T.available) { T.layout.mode = 'auto'; store(); } if (T.layout.mode === 'auto') applyAuto(); }

  const resets = [];
  function bindButton(el, action) {
    let pid = null;
    const down = e => {
      if (pid !== null) return;
      pid = (e.pointerId === undefined) ? 't' : e.pointerId;
      if (HAS_PE && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) { } }
      el.classList.add('kb-on');
      markTouch(); unlockAudio();
      if (action) setAct(action, true);
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
    };
    const up = e => {
      if (pid === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
      if (HAS_PE && el.releasePointerCapture && e && e.pointerId !== undefined) { try { el.releasePointerCapture(e.pointerId); } catch (_) { } }
      pid = null; el.classList.remove('kb-on');
      if (action) setAct(action, false);
      unlockAudio();                      // iOS：一定要在 pointerup / touchend 裡 resume
      if (action === null) { try { KB.toggleFullscreen && KB.toggleFullscreen(); } catch (_) { } }
      if (e && e.cancelable) e.preventDefault();
    };
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
    el.addEventListener('mousedown', e => e.preventDefault());
    resets.push(() => { if (pid !== null) { pid = null; el.classList.remove('kb-on'); if (action) setAct(action, false); } });
  }

  // D-pad：單指滑動 8 方向 + 死區
  const padState = { left: false, right: false, up: false, down: false };
  function setDirs(d) {
    for (const k of DIRS) {
      const on = !!(d && d[k]);
      if (padState[k] !== on) { padState[k] = on; setAct(k, on); arrow[k].classList.toggle('on', on); }
    }
  }
  function bindPad(el) {
    let pid = null;
    const calc = (cx, cy) => {
      const r = el.getBoundingClientRect();
      const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
      const rad = Math.max(1, r.width / 2), len = Math.hypot(ox, oy);
      const dead = Math.max(7, rad * 0.26);
      const out = { left: false, right: false, up: false, down: false };
      if (len >= dead) {
        if (Math.abs(ox) > Math.abs(oy) * TAN22) out[ox > 0 ? 'right' : 'left'] = true;
        if (Math.abs(oy) > Math.abs(ox) * TAN22) out[oy > 0 ? 'down' : 'up'] = true;
      }
      setDirs(out);
      const k = clamp(len, 0, rad * 0.42);
      const a = len > 0.01 ? Math.atan2(oy, ox) : 0;
      padKnob.style.transform = len >= dead ? `translate(${Math.cos(a) * k}px,${Math.sin(a) * k}px)` : '';
    };
    const down = e => {
      if (pid !== null) return;
      const p = (e.touches ? e.touches[0] : e);
      pid = (e.pointerId === undefined) ? 't' : e.pointerId;
      if (HAS_PE && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) { } }
      markTouch(); unlockAudio(); calc(p.clientX, p.clientY);
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
    };
    const move = e => {
      if (pid === null) return;
      if (e.pointerId !== undefined && e.pointerId !== pid) return;
      const p = (e.touches ? e.touches[0] : e);
      calc(p.clientX, p.clientY);
      if (e.cancelable) e.preventDefault();
    };
    const up = e => {
      if (pid === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
      if (HAS_PE && el.releasePointerCapture && e && e.pointerId !== undefined) { try { el.releasePointerCapture(e.pointerId); } catch (_) { } }
      pid = null; setDirs(null); padKnob.style.transform = '';
      unlockAudio();
      if (e && e.cancelable) e.preventDefault();
    };
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
    el.addEventListener('mousedown', e => e.preventDefault());
    resets.push(() => { pid = null; setDirs(null); padKnob.style.transform = ''; });
  }
  bindPad(pad);
  bindButton(bJump, 'jump'); bindButton(bAtk, 'attack');
  bindButton(bSel, 'select'); bindButton(bStart, 'start');
  bindButton(bFs, null);            // null = 全螢幕（不送遊戲按鍵）
  function releaseAll() { for (const f of resets) f(); try { KB.input && KB.input.clearTouch && KB.input.clearTouch(); } catch (e) { } }

  // iOS / 瀏覽器手勢：長按選單、雙擊縮放、捏合縮放
  root.addEventListener('contextmenu', e => e.preventDefault());
  root.addEventListener('dblclick', e => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    D.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  // ---------- 顯示 / 淡出 ----------
  let visible = false;
  function setVisible(v) {
    v = !!v;
    if (v === visible) return;
    visible = v;
    root.classList.toggle('kb-off', !v);
    root.setAttribute('aria-hidden', v ? 'false' : 'true');
    if (!v) releaseAll(); else relayout();
  }
  function autoVisible() {
    const m = T.layout.mode;
    if (m === 'on') return true;
    if (m === 'off') return false;
    return AVAILABLE && lastOther <= lastTouch;       // 鍵盤 / 手把之後沒再觸控就隱藏
  }
  function applyAuto() { setVisible(autoVisible()); }
  // 任何觸控（含覆蓋層淡出時打在 canvas 上的）都讓按鍵回來
  D.addEventListener('pointerdown', e => { if (!HAS_PE || e.pointerType === 'touch' || e.pointerType === undefined) markTouch(); }, true);
  D.addEventListener('touchstart', () => markTouch(), { capture: true, passive: true });
  W.addEventListener('keydown', () => { lastOther = Date.now(); if (T.layout.mode === 'auto') applyAuto(); }, true);
  W.addEventListener('blur', () => releaseAll());
  D.addEventListener('visibilitychange', () => { if (D.hidden) releaseAll(); });

  // ---------- 設定存讀（KB.save.settings.touch；KB.save 可能晚於本檔建立 → 懶讀） ----------
  let loaded = false;
  function assign(o) {
    if (!o || typeof o !== 'object') return false;
    if (o.mode === 'auto' || o.mode === 'on' || o.mode === 'off') T.layout.mode = o.mode;
    if (o.side === 'left' || o.side === 'right') T.layout.side = o.side;
    if (typeof o.size === 'number' && isFinite(o.size)) T.layout.size = clamp(o.size, 0.6, 1.6);
    if (typeof o.opacity === 'number' && isFinite(o.opacity)) T.layout.opacity = clamp(o.opacity, 0.15, 1);
    return true;
  }
  function tryLoad() {
    if (loaded) return;
    try {
      const s = KB.save && KB.save.settings;
      if (!s || typeof s !== 'object') return;
      loaded = true;
      if (s.touch) { assign(s.touch); relayout(); applyAuto(); }
      // qa11 P1：純觸控裝置存檔為 off 會鎖死（沒有任何入口能點）→ 觸控裝置一律退回 auto
      if (T.layout.mode === 'off' && T.available) { T.layout.mode = 'auto'; relayout(); applyAuto(); }
    } catch (e) { loaded = true; }
  }
  function store() {
    try {
      const s = KB.save && KB.save.settings;
      if (!s || typeof s !== 'object') return false;
      loaded = true;
      s.touch = { mode: T.layout.mode, side: T.layout.side, size: T.layout.size, opacity: T.layout.opacity };
      try { if (typeof KB.saveGame === 'function') KB.saveGame(); } catch (e) { }
      return true;
    } catch (e) { return false; }
  }

  // ---------- 重新排版觸發 ----------
  let sig = '', n = 0;
  function poll() {
    tryLoad();
    const L = canvasRect(), v = viewport();
    const s = [L.x | 0, L.y | 0, L.w | 0, L.h | 0, v.w | 0, v.h | 0, L.portrait].join(',');
    if (s !== sig) { sig = s; relayout(); }
    try {
      if (KB.input && KB.input.gamepadPressed && KB.input.gamepadPressed().length) {
        lastOther = Date.now(); if (T.layout.mode === 'auto') applyAuto();
      }
    } catch (e) { }
  }
  function tick() { W.requestAnimationFrame(tick); if ((++n % 6) === 0) poll(); }
  W.addEventListener('kb-resize', () => { relayout(); });
  W.addEventListener('resize', () => { relayout(); });
  W.addEventListener('orientationchange', () => { setTimeout(relayout, 120); });
  if (W.visualViewport) { W.visualViewport.addEventListener('resize', () => relayout()); W.visualViewport.addEventListener('scroll', () => relayout()); }
  D.addEventListener('fullscreenchange', () => setTimeout(relayout, 80));

  // ---------- 對外 API（契約 3） ----------
  KB.TOUCH = Object.assign(T, {
    available: AVAILABLE,
    fullscreenSupported: FS_OK,
    /** 覆蓋層目前顯示中 */
    active() { return visible; },
    show() { setVisible(true); },
    hide() { setVisible(false); },
    layout: { mode: 'auto', side: 'right', size: 1, opacity: 0.8 },
    /** 即時套用 + 存到 KB.save.settings.touch；回傳套用後的 layout */
    setLayout(o) {
      assign(o);
      relayout(); applyAuto(); store();
      return T.layout;
    },
    /** 按鍵元素（ui / 測試用）：dpad jump attack select start fs */
    buttons: { dpad: pad, jump: bJump, attack: bAtk, select: bSel, start: bStart, fs: bFs },
    /** 各鍵在 viewport 的 CSS px 矩形（測試 / 版面檢查用） */
    rects() {
      const o = {};
      for (const k in T.buttons) {
        const e = T.buttons[k];
        if (!e || e.style.display === 'none') continue;
        const r = e.getBoundingClientRect();
        o[k] = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }
      return o;
    },
    /** D-pad 目前的方向狀態 */
    dirs() { return { left: padState.left, right: padState.right, up: padState.up, down: padState.down }; },
    /** 手動重排（screen agent 改完 KB.layout 後 kb-resize 會自動觸發，這裡供除錯） */
    relayout,
    overlapping: false,
    el: root,
  });

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', mount); else mount();
  W.addEventListener('load', () => { mount(); relayout(); });
  tick();
})();
