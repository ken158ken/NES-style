// engine/nes.js — NES 核心命名空間 / 啟動流程 / 除錯 API（tools agent 擁有）
//
// 【載入順序（硬規格，見 docs/TASKS.md §API 契約）】
//   palette.js → fixed.js → input.js → cpu_timing.js → chr.js → ppu.js
//   → nes_lint.js → apu.js → music.js → nes.js → games/<遊戲>/*.js
//   本檔必須排在所有 engine 模組之後、遊戲程式之前。所有模組都是 classic script + IIFE，
//   彼此零相依；本檔是唯一「把它們接起來」的地方。
//
// 【容錯原則】R1 各模組由不同 agent 平行開發，可能尚未存在。本檔對每個模組都有 stub：
//   缺 PPU → 黑畫面 stub；缺 Input → 空手把；缺 Timing → 內建 rAF 固定步；
//   缺 APU / Music / Lint → 靜音 / 無事發生。缺檔不會讓 boot 失敗，只在 console 提示。
//
// 【對外】NES.VERSION、NES.boot({canvas, game, scale}) → nes
//   nes = {canvas, ctx, ppu, apu, music, input, timing, game, scale,
//          setScale(s), start(), stop(), step(n), render(), connectAudio(), debug}
//   ?debug=1 時額外掛 window.__nes（見檔尾「除錯 API」）。
(function () {
  'use strict';
  window.NES = window.NES || {};
  var NES = window.NES;

  NES.VERSION = '0.1.0';          // R1 核心引擎
  NES.TITLE = '星塵勇者';
  NES.W = 256;                    // PPU 內部寬
  NES.H = 240;                    // PPU 內部高
  NES.VISIBLE_H = 224;            // 顯示高（上下各裁 8 列）
  NES.HZ = 60.0988;               // NTSC 幀率

  // ---------------------------------------------------------------- 工具
  function warn(msg) { try { console.warn('[NES] ' + msg); } catch (e) { } }
  function has(o, k) { return o && typeof o[k] === 'function'; }
  function call(o, k) {            // 安全呼叫：call(obj,'method', a, b)
    if (!has(o, k)) return undefined;
    var args = Array.prototype.slice.call(arguments, 2);
    try { return o[k].apply(o, args); } catch (e) { warn(k + '() 失敗：' + e.message); return undefined; }
  }

  NES.missing = [];               // 啟動時缺少的模組名（除錯 API 會回報）
  function need(name, ok) {
    if (!ok) { NES.missing.push(name); warn('模組 ' + name + ' 尚未載入，使用 stub'); }
    return ok;
  }

  // ---------------------------------------------------------------- stub
  // PPU stub：只把畫面塗黑，維持 frame / stats / render() 介面，讓 game.html 在
  // ppu.js 還沒出現時也能開起來（黑畫面、不報錯）。
  function stubPPU(canvas, opt) {
    var scale = (opt && opt.scale) || 1;
    var frame = new Uint8ClampedArray(NES.W * NES.H * 4);
    for (var i = 3; i < frame.length; i += 4) frame[i] = 255;
    var ctx = canvas.getContext('2d', { alpha: false });
    var api = {
      stub: true, frame: frame, scale: scale,
      stats: { colors: 1, maxSpritesLine: 0, flickered: 0 },
      flicker: 'rotate',
      setBackdrop: function () { }, setBgPalette: function () { }, setSprPalette: function () { },
      setTile: function () { }, setAttr: function () { }, fillTiles: function () { },
      mirroring: function () { }, scroll: function () { }, split: function () { },
      sprite: function () { }, clearSprites: function () { }, spriteMode: function () { },
      endFrame: function () { }, advanceFlicker: function () { },
      setScale: function (s) { scale = api.scale = s; resize(); },
      render: function () {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    function resize() {
      canvas.width = NES.W * scale;
      canvas.height = NES.VISIBLE_H * scale;
    }
    resize();
    return api;
  }

  // Input stub：永遠沒按鍵，但 inject / mask 介面齊全（供除錯 API 使用）
  function stubInput() {
    var injected = 0, injFrames = 0;
    return {
      stub: true,
      BTN: { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 },
      poll: function () { if (injFrames > 0) injFrames--; else injected = 0; },
      held: function (b) { return !!(injected & b); },
      pressed: function () { return false; },
      released: function () { return false; },
      mask: function () { return injected; },
      inject: function (m, f) { injected = m | 0; injFrames = f | 0; },
      record: function () { }, stopRecord: function () { return []; }, replay: function () { }
    };
  }

  // Timing stub：rAF 固定步；step(n) 同步推進（不走 rAF），語意同契約
  function stubTiming(o) {
    var hz = o.hz || NES.HZ, running = false, last = 0, acc = 0, raf = 0;
    var t = {
      stub: true, frame: 0, hz: hz,
      budget: {
        limit: 160, used: 0, oamLimit: 256, oamUsed: 0, over: false, overFrames: 0,
        serial: 0, mute: false, strict: false,
        set: function () { return this; }, setOam: function () { return this; },
        use: function () { return true; },
        left: function () { return this.limit; }, oamLeft: function () { return this.oamLimit; },
        reset: function () { this.serial = (this.serial + 1) | 0; return this; },
        clear: function () { return this.reset(); },
        report: function () { return { limit: this.limit, used: 0, over: false, stub: true }; }
      },
      setMode: function (m) { t.hz = hz = (m === 'pal') ? 50.0070 : NES.HZ; },
      one: function () { o.update && o.update(); o.draw && o.draw(); t.frame++; },
      step: function (n) { for (var i = 0; i < (n || 1); i++) t.one(); return t.frame; },
      start: function () {
        if (running) return; running = true; last = 0; acc = 0;
        raf = requestAnimationFrame(function loop(ts) {
          if (!running) return;
          raf = requestAnimationFrame(loop);
          if (!last) last = ts;
          var d = ts - last; last = ts; if (d > 100) d = 100;
          acc += d;
          var step = 1000 / t.hz, n = 0;
          while (acc >= step && n < 4) { t.one(); acc -= step; n++; }
          if (n === 4) acc = 0;
        });
      },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    };
    return t;
  }

  // ---------------------------------------------------------------- 按鍵名 → mask
  var BTN_ALIAS = {
    a: 'A', b: 'B', select: 'SELECT', start: 'START',
    up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT'
  };
  // toMask(129) / toMask('a') / toMask('a,right') / toMask(['a','right'])
  NES.toMask = function (spec) {
    var BTN = (NES.Input && NES.Input.BTN) || { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
    if (spec == null) return 0;
    if (typeof spec === 'number') return spec | 0;
    var list = Array.isArray(spec) ? spec : String(spec).split(/[,\s+|]+/);
    var m = 0;
    for (var i = 0; i < list.length; i++) {
      var k = String(list[i]).trim(); if (!k) continue;
      var key = BTN_ALIAS[k.toLowerCase()] || k.toUpperCase();
      if (BTN[key] == null) { warn('未知按鍵：' + k); continue; }
      m |= BTN[key];
    }
    return m;
  };

  // ---------------------------------------------------------------- boot
  // NES.boot({canvas, game, scale, debug, hz, mute})
  //  canvas : HTMLCanvasElement 或 CSS 選擇器；省略則自動建立並 append 到 body
  //  game   : {init(nes), update(nes), draw(nes), state()}；可為 function(nes) 工廠；可省略（黑畫面）
  //  scale  : 整數放大倍率（預設 1；game.html 會依視窗算好再傳進來）
  //  debug  : 預設看網址 ?debug=1
  //  budgetBytes / strictBudget : VBlank 寫入預算（預設 160 byte/幀；strict 時超支 throw）
  NES.boot = function (opt) {
    opt = opt || {};
    var q = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) { }
    var debug = (opt.debug != null) ? !!opt.debug : (q.debug === '1');
    var scale = opt.scale || (q.scale ? parseInt(q.scale, 10) : 0) || 1;
    var mute = (opt.mute != null) ? !!opt.mute : (q.mute === '1');

    // --- canvas ---
    var canvas = opt.canvas;
    if (typeof canvas === 'string') canvas = document.querySelector(canvas);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'nes';
      document.body.appendChild(canvas);
    }
    canvas.style.imageRendering = 'pixelated';

    NES.missing.length = 0;

    // --- PPU ---
    var ppu;
    if (need('ppu.js', NES.PPU && typeof NES.PPU.create === 'function')) {
      ppu = NES.PPU.create(canvas, { scale: scale });
    } else {
      ppu = stubPPU(canvas, { scale: scale });
    }

    // --- Input ---
    var input = NES.Input;
    if (!need('input.js', input && typeof input.poll === 'function')) input = stubInput();

    // --- APU / Music ---
    // mute 只代表「不接上喇叭」：APU 照樣建立與 tick，音樂邏輯 / 離線渲染在測試中才會一致
    var apu = null, music = null;
    if (need('apu.js', NES.APU && typeof NES.APU.create === 'function')) {
      try { apu = NES.APU.create({ sampleRate: 44100 }); } catch (e) { warn('APU.create 失敗：' + e.message); }
    }
    if (need('music.js', !!NES.Music)) {
      if (has(NES.Music, 'attach') && has(NES.Music, 'play')) {
        // music.js 的建議用法：attach(apu) 之後 NES.Music.play/stop/sfx/tick 直接可用。
        // 用單例（而不是 create 出來的第二個 driver），遊戲照契約呼叫 NES.Music.* 才會生效。
        if (apu) call(NES.Music, 'attach', apu);
        music = NES.Music;
      } else if (has(NES.Music, 'create')) {
        music = NES.Music.create(apu);
      } else {
        music = NES.Music;
        if (apu) { call(music, 'setAPU', apu); call(music, 'init', apu); }
      }
    }

    // --- 其他葉節點只做存在性檢查（模組本身自掛在 NES 上）---
    need('palette.js', !!NES.PALETTE);
    need('fixed.js', !!NES.FX);
    need('chr.js', !!NES.CHR);
    need('nes_lint.js', !!NES.Lint);

    // --- 遊戲物件 ---
    var game = opt.game;
    var nes = {
      VERSION: NES.VERSION, canvas: canvas, ctx: canvas.getContext('2d'),
      ppu: ppu, apu: apu, music: music, input: input,
      scale: scale, debug: debug, mute: mute, game: null, timing: null,
      missing: NES.missing.slice()
    };
    if (typeof game === 'function') { try { game = game(nes); } catch (e) { warn('game 工廠失敗：' + e.message); game = null; } }
    nes.game = game || { update: function () { }, draw: function () { } };

    // --- 主迴圈：update = Input.poll(由 Timing 負責) → game.update(nes) → apu.tick()
    //            draw   = game.draw(nes) → ppu.render() → ppu.endFrame()
    // draw()      純重畫：不推進任何邏輯（含 PPU 的 OAM 閃爍輪替）⇒ 截圖可重現（QA P1-2）
    // drawFrame() 一個完整幀的 draw 階段：重畫 + endFrame（推進閃爍輪替）
    function update() {
      call(nes.game, 'update', nes);
      if (apu) call(apu, 'tick');     // music.tick() 依契約由遊戲 update 自行呼叫
    }
    function draw() {
      call(nes.game, 'draw', nes);
      call(ppu, 'render');
    }
    function drawFrame() {
      draw();
      call(ppu, 'endFrame');
    }
    // nes.render()：只重畫、不推進；重畫期間暫停 VBlank 預算計帳（不然同一幀會被算兩次）
    nes.render = function () {
      var b = nes.timing && nes.timing.budget;
      if (b) b.mute = true;
      try { draw(); } finally { if (b) b.mute = false; }
    };

    // --- Timing ---
    var timing;
    if (need('cpu_timing.js', NES.Timing && typeof NES.Timing.create === 'function')) {
      timing = NES.Timing.create({
        update: update, draw: drawFrame, hz: opt.hz || NES.HZ,
        budgetBytes: opt.budgetBytes || 0, strictBudget: !!opt.strictBudget
      });
    } else {
      timing = stubTiming({ update: update, draw: drawFrame, hz: opt.hz || NES.HZ });
    }
    nes.timing = timing;
    // VBlank 寫入預算：綁到 PPU，之後 setTile/sprite/... 都會自動計帳（QA P1-6）
    if (ppu && timing.budget) ppu.budget = timing.budget;
    if (opt.strictBudget && timing.budget) timing.budget.strict = true;
    nes.missing = NES.missing.slice();   // Timing 的檢查在建立 nes 之後，重新同步一次
    nes.step = function (n) { return call(timing, 'step', n || 1); };
    nes.start = function () { call(timing, 'start'); };
    nes.stop = function () { call(timing, 'stop'); };
    nes.setScale = function (s) {
      s = Math.max(1, s | 0); nes.scale = s;
      if (has(ppu, 'setScale')) ppu.setScale(s);
      else { canvas.width = NES.W * s; canvas.height = NES.VISIBLE_H * s; call(ppu, 'render'); }
    };

    // --- 音訊解鎖：非 debug 時，使用者第一次按鍵 / 點擊才 apu.connect（瀏覽器自動播放政策）---
    var audioCtx = null, connected = false;
    nes.connectAudio = function () {
      if (connected || !apu || mute) return false;   // mute：建立了 APU 但不接喇叭
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        audioCtx = audioCtx || new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        call(apu, 'connect', audioCtx);
        connected = true; nes.audioCtx = audioCtx;
        return true;
      } catch (e) { warn('connect 失敗：' + e.message); return false; }
    };
    function unlock() { nes.connectAudio(); }
    if (!debug && !mute) {
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('pointerdown', unlock, { once: true });
    }

    // --- 空白 CHR 保底 ---
    // chr.js 在場但沒人 setPattern 時，ppu.render() 會丟「尚未 setPattern」。
    // 在 game.init 之前塞一個全空白 bank，遊戲之後自己 setPattern 會覆蓋掉它。
    if (NES.CHR && has(NES.CHR, 'bank') && has(NES.CHR, 'setPattern')) {
      try {
        var p0 = has(NES.CHR, 'pattern') ? NES.CHR.pattern(0) : null;
        var p1 = has(NES.CHR, 'pattern') ? NES.CHR.pattern(1) : null;
        if (!p0 || !p1) {
          var blankRows = ['........', '........', '........', '........', '........', '........', '........', '........'];
          var bk = (has(NES.CHR, 'getBank') && NES.CHR.getBank('__nes_blank')) || NES.CHR.bank('__nes_blank', { BLANK: blankRows });
          if (!p0) NES.CHR.setPattern(0, bk.name || '__nes_blank');
          if (!p1) NES.CHR.setPattern(1, bk.name || '__nes_blank');
        }
      } catch (e) { warn('空白 CHR 保底失敗：' + e.message); }
    }

    // --- 啟動 ---
    call(nes.game, 'init', nes);
    // game.init() 等同真機「rendering 關閉時的初始化」：想寫多少 PPU 就寫多少，不算 VBlank 預算
    if (timing.budget) call(timing.budget, 'clear');
    if (debug) {
      drawFrame();                  // debug：不自動跑，先畫一幀，之後由 __nes.step() 推進
    } else {
      nes.start();
    }

    NES.instance = nes;
    NES.canvas = canvas;

    // ------------------------------------------------------------ 除錯 API
    if (debug) {
      window.__nes = {
        // 推進 n 幀（同步，不走 rAF）
        step: function (n) { nes.step(n || 1); return timing.frame; },
        // press(mask | 'a' | ['a','right'], n)：按住 n 幀並推進 n 幀
        press: function (spec, n) {
          n = n || 1;
          var m = NES.toMask(spec);
          call(input, 'inject', m, n);
          nes.step(n);
          return timing.frame;
        },
        // tap(spec, n)：按 n 幀後放開（預設 1 幀）
        tap: function (spec, n) {
          n = n || 1;
          var m = NES.toMask(spec);
          call(input, 'inject', m, n);
          nes.step(n);
          call(input, 'inject', 0, 0);
          return timing.frame;
        },
        release: function () { call(input, 'inject', 0, 0); return true; },
        // 重畫一幀但不推進任何邏輯（截圖前用）；PPU 的閃爍輪替指標也不動 ⇒ 可重現
        render: function () { nes.render(); return true; },
        // state()：遊戲自己的 state() 併上 frame / stats
        state: function () {
          var s = {};
          try { var gs = call(nes.game, 'state'); if (gs) s = (typeof gs === 'string') ? JSON.parse(gs) : gs; } catch (e) { }
          s.frame = timing.frame;
          s.hz = timing.hz;
          s.stats = this.stats();
          return s;
        },
        // frame()：base64 PNG（data URL）；canvas 取不到時退回 ppu.frame 摘要
        // ⚠️ 與 state().frame / stats().frame（幀號）同名不同義 ⇒ 另給別名 snapshot()（QA P2-2）
        frame: function () {
          try { return canvas.toDataURL('image/png'); }
          catch (e) {
            var f = ppu.frame;
            if (!f) return null;
            var n = 0, sum = 0;
            for (var i = 0; i < f.length; i += 4) { if (f[i] | f[i + 1] | f[i + 2]) n++; sum += f[i] + f[i + 1] + f[i + 2]; }
            return { w: NES.W, h: NES.H, nonBlack: n, avg: Math.round(sum / (f.length / 4 * 3)) };
          }
        },
        // snapshot()：frame() 的別名，語意更清楚（回傳 PNG，不是幀號）
        snapshot: function () { return this.frame(); },
        // lint()：交給 nes_lint.js；未載入時回報 skipped
        lint: function () {
          if (NES.Lint && typeof NES.Lint.frame === 'function') {
            var r = NES.Lint.frame(ppu);
            if (r && NES.Lint.oam) { try { r.oam = NES.Lint.oam(ppu); } catch (e) { r.oamError = e.message; } }
            // 便利：把 PPU 自己統計的超線資訊一併帶出（lint 讀不到時仍看得見）
            if (r && ppu.stats) {
              var ol = ppu.stats.overLines || ppu.stats.overLine;
              if (ol && ol.length && !(r.overLine && r.overLine.length)) r.ppuOverLines = ol;
              if (ppu.stats.maxSpritesLine != null) r.maxSpritesLine = ppu.stats.maxSpritesLine;
            }
            return r;
          }
          return { ok: true, skipped: true, reason: 'nes_lint.js 未載入' };
        },
        stats: function () {
          var st = (ppu && ppu.stats) || {};
          var bg = timing.budget;
          return {
            frame: timing.frame, hz: timing.hz,
            colors: st.colors, maxSpritesLine: st.maxSpritesLine, flickered: st.flickered,
            budgetOver: !!(bg && bg.over),
            // VBlank 寫入預算明細（QA P1-6）：ppu 通道 160 byte + OAM DMA 256 byte
            budget: (bg && typeof bg.report === 'function') ? bg.report() : null,
            scale: nes.scale,
            missing: nes.missing.slice(),
            stub: { ppu: !!ppu.stub, input: !!input.stub, timing: !!timing.stub, apu: !apu, music: !music }
          };
        },
        // 額外便利：給 tools/shot.py 與手寫 playwright 腳本用
        nes: function () { return nes; },
        setScale: function (s) { nes.setScale(s); return nes.scale; },
        missing: function () { return nes.missing.slice(); },
        version: NES.VERSION
      };
    }
    return nes;
  };
})();
