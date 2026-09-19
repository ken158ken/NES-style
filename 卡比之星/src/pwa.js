// PWA：service worker 註冊 / 加到主畫面（Round 11 pwa agent）
// 契約 4：KB.PWA = { installed, canInstall, promptInstall(), standalone, update() }
//   - 只在 http(s) 且有 navigator.serviceWorker 時註冊 './sw.js'（file:// 與 dist 單檔自動略過）
//   - beforeinstallprompt 事件存起來給 promptInstall()（Android Chrome）；iOS Safari 只能手動「分享 → 加入主畫面」
//   - sw 有新版（updatefound → installed 且已有 controller）時設 KB.PWA.updateReady = true 並 console.log
//   - 全部 try/catch 靜默：PWA 出任何狀況都不可影響遊戲本體
(function () {
  window.KB = window.KB || {};

  const PWA = {
    supported: false,     // 這個環境可以註冊 sw 嗎
    registered: false,    // 已註冊成功
    installed: false,     // 已安裝（standalone 執行中，或本次工作階段收到 appinstalled）
    canInstall: false,    // 有 beforeinstallprompt 可用（可呼叫 promptInstall）
    standalone: false,    // 目前是以 app（全螢幕 / standalone）模式執行
    updateReady: false,   // 已下載新版 sw，重開即套用
    iosSafari: false,     // iOS 的 Safari / WebKit（沒有安裝提示 API，要教使用者用「分享」）
    reg: null,
    promptInstall: function () { return Promise.resolve('unavailable'); },
    update: function () { return Promise.resolve(false); },
  };
  KB.PWA = PWA;

  function on(target, type, fn) {
    try { target.addEventListener(type, fn); } catch (e) { /* 靜默 */ }
  }

  // ---- 是否以 app 模式執行 ----
  function checkStandalone() {
    try {
      const mm = window.matchMedia;
      const app = !!(mm && (mm('(display-mode: standalone)').matches ||
                            mm('(display-mode: fullscreen)').matches ||
                            mm('(display-mode: minimal-ui)').matches)) ||
                  navigator.standalone === true;
      PWA.standalone = app;
      if (app) PWA.installed = true;
    } catch (e) { /* 靜默 */ }
    return PWA.standalone;
  }

  try {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    PWA.iosSafari = iOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  } catch (e) { /* 靜默 */ }

  checkStandalone();
  on(window, 'visibilitychange', checkStandalone);
  try {
    const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
    if (mq && mq.addEventListener) mq.addEventListener('change', checkStandalone);
  } catch (e) { /* 靜默 */ }

  // ---- 安裝提示（Android Chrome / 桌機 Chromium）----
  let deferred = null;
  on(window, 'beforeinstallprompt', function (e) {
    try {
      e.preventDefault();          // 不要讓瀏覽器自己跳（由遊戲 UI 決定時機）
      deferred = e;
      PWA.canInstall = true;
      console.log('[pwa] 可安裝：KB.PWA.promptInstall()');
    } catch (err) { /* 靜默 */ }
  });
  on(window, 'appinstalled', function () {
    deferred = null;
    PWA.canInstall = false;
    PWA.installed = true;
    console.log('[pwa] 已加到主畫面');
  });

  PWA.promptInstall = function () {
    try {
      if (!deferred) return Promise.resolve(PWA.iosSafari ? 'ios' : 'unavailable');
      const d = deferred;
      deferred = null;
      PWA.canInstall = false;
      d.prompt();
      return Promise.resolve(d.userChoice)
        .then(function (c) { return (c && c.outcome) || 'dismissed'; })
        .catch(function () { return 'dismissed'; });
    } catch (e) {
      return Promise.resolve('unavailable');
    }
  };

  // ---- service worker ----
  function markUpdate(sw) {
    try {
      if (!sw) return;
      sw.addEventListener('statechange', function () {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          PWA.updateReady = true;
          console.log('[pwa] 已下載新版本，重開遊戲（或 KB.PWA.update()）即可套用');
        }
      });
    } catch (e) { /* 靜默 */ }
  }

  // 等新版 sw 裝好進入 waiting（reg.update() 常常在安裝完成前就 resolve）
  function waitWaiting(reg, ms) {
    return new Promise(function (resolve) {
      if (reg.waiting) return resolve(reg.waiting);
      let done = false;
      const finish = function () {
        if (done || !reg.waiting) return;
        done = true;
        clearTimeout(timer);
        resolve(reg.waiting);
      };
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(reg.waiting || null);
      }, ms || 5000);
      const watch = function () {
        const sw = reg.installing || reg.waiting;
        if (!sw) return;
        finish();
        sw.addEventListener('statechange', finish);
      };
      reg.addEventListener('updatefound', watch);
      watch();
    });
  }

  // 主動檢查新版；若有新版 sw 在 waiting，就叫它 skipWaiting 並在接管後重新載入
  PWA.update = function () {
    try {
      const reg = PWA.reg;
      if (!reg) return Promise.resolve(false);
      return Promise.resolve(reg.update())
        .then(function () { return waitWaiting(reg, 5000); })
        .then(function (waiting) {
          if (!waiting) return PWA.updateReady;
          PWA.updateReady = true;
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (reloaded) return;
            reloaded = true;
            try { location.reload(); } catch (e) { /* 靜默 */ }
          });
          waiting.postMessage({ type: 'SKIP_WAITING' });
          return true;
        })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  };

  try {
    const proto = location.protocol;
    const httpish = (proto === 'http:' || proto === 'https:');
    const singleFile = !!KB.FONT_DATA;            // dist/卡比之星.html：字型已內嵌 ⇒ 單檔版不註冊 sw
    PWA.supported = httpish && !singleFile && !!navigator.serviceWorker;
    if (PWA.supported) {
      const boot = function () {
        try {
          navigator.serviceWorker.register('./sw.js').then(function (reg) {
            PWA.reg = reg;
            PWA.registered = true;
            if (reg.waiting && navigator.serviceWorker.controller) {
              PWA.updateReady = true;
              console.log('[pwa] 已有新版本待套用（KB.PWA.update()）');
            }
            markUpdate(reg.installing);
            reg.addEventListener('updatefound', function () { markUpdate(reg.installing); });
            console.log('[pwa] service worker 已註冊：', reg.scope);
          }).catch(function (e) {
            console.log('[pwa] service worker 註冊失敗（不影響遊戲）：', e && e.message);
          });
        } catch (e) { /* 靜默 */ }
      };
      if (document.readyState === 'complete') boot();
      else on(window, 'load', boot);
    }
  } catch (e) { /* 靜默 */ }
})();
