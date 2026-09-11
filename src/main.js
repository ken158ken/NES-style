// 啟動、主迴圈、縮放、除錯 / 截圖 API
(function () {
  const canvas = document.createElement('canvas');
  canvas.width = KB.W; canvas.height = KB.H; canvas.id = 'game';
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  KB.canvas = canvas; KB.ctx = ctx;
  KB.scene = null; KB.frameCount = 0;

  function resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    let s = Math.max(1, Math.floor(Math.min(ww / KB.W, wh / KB.H)));
    if (KB.DEBUG && window.__forceScale) s = window.__forceScale;
    canvas.style.width = (KB.W * s) + 'px'; canvas.style.height = (KB.H * s) + 'px';
    canvas.style.left = Math.floor((ww - KB.W * s) / 2) + 'px'; canvas.style.top = Math.floor((wh - KB.H * s) / 2) + 'px';
  }
  window.addEventListener('resize', resize);

  KB.setScene = function (s) {
    if (KB.scene && KB.scene.exit) KB.scene.exit();
    KB.scene = s; if (s.enter) s.enter();
  };

  function step() {
    KB.input.update();
    if (KB.scene) KB.scene.update(1 / 60);
    KB.frameCount++;
  }
  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, KB.W, KB.H);
    if (KB.scene) KB.scene.draw(ctx);
    if (KB.DEBUG && KB.showFps) KB.text(ctx, KB.fps | 0, 250, 2, { color: '#0f0', align: 'right' });
  }

  let last = 0, acc = 0, running = false, fpsT = 0, fpsN = 0;
  KB.fps = 60;
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!last) last = ts;
    let d = ts - last; last = ts;
    if (d > 100) d = 100;
    acc += d;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4) { step(); acc -= 1000 / 60; n++; }
    if (n === 4) acc = 0;
    render();
    fpsN++; fpsT += d; if (fpsT >= 1000) { KB.fps = fpsN * 1000 / fpsT; fpsN = 0; fpsT = 0; }
  }

  // ---------- 精靈總表場景（除錯用） ----------
  class SheetScene {
    constructor(filter, page) { this.filter = filter || ''; this.page = page || 0; this.t = 0; }
    update(dt) { this.t += dt; if (KB.input.pressed('right')) this.page++; if (KB.input.pressed('left')) this.page = Math.max(0, this.page - 1); }
    draw(ctx) {
      ctx.fillStyle = '#6a8a9a'; ctx.fillRect(0, 0, KB.W, KB.H);
      const names = KB.SPR_ORDER.filter(n => !this.filter || n.includes(this.filter));
      let x = 2, y = 10, rowH = 0; const perPage = [];
      let pageIdx = 0, items = [];
      for (const n of names) {
        const s = KB.SPR[n]; const w = s.w * s.n + s.n * 2 + 4, h = s.h + 10;
        if (x + w > KB.W - 2) { x = 2; y += rowH + 2; rowH = 0; }
        if (y + h > KB.H - 2) { pageIdx++; x = 2; y = 10; rowH = 0; }
        if (pageIdx === this.page) items.push({ n, x, y, s });
        x += w; rowH = Math.max(rowH, h);
      }
      for (const it of items) {
        const s = it.s;
        KB.text(ctx, it.n, it.x, it.y - 8, { color: '#fff', size: 7 });
        for (let f = 0; f < s.n; f++) {
          const fr = s.frames[f];
          ctx.fillStyle = (f & 1) ? '#5a7a8a' : '#4a6a7a'; ctx.fillRect(it.x + f * (s.w + 2), it.y, s.w, s.h);
          ctx.drawImage(fr.cv, it.x + f * (s.w + 2), it.y);
        }
      }
      KB.text(ctx, 'page ' + (this.page + 1) + ' / ' + (pageIdx + 1) + '  filter=' + this.filter, 2, KB.H - 9, { color: '#ff0', size: 7 });
    }
  }
  KB.SheetScene = SheetScene;

  // ---------- 除錯 API ----------
  window.__kb = {
    goto(name, o) {
      o = o || {};
      if (name === 'title') KB.setScene(KB.TitleScene ? new KB.TitleScene() : new KB.GameScene(KB.LEVELS[0].id));
      else if (name === 'select') KB.setScene(KB.StageSelectScene ? new KB.StageSelectScene(o.index || 0) : new KB.GameScene(KB.LEVELS[0].id));
      else if (name === 'game') { KB.session = { lives: KB.START_LIVES, score: 0 }; KB.setScene(new KB.GameScene(o.level || KB.LEVELS[0].id, o)); if (o.nofade) { KB.scene.fade = 0; KB.scene.fadeDir = 0; } }
      else if (name === 'sheet') KB.setScene(new SheetScene(o.filter, o.page));
      else if (name === 'gameover') KB.setScene(KB.GameOverScene ? new KB.GameOverScene(null) : KB.scene);
      else if (name === 'ending') KB.setScene(KB.EndingScene ? new KB.EndingScene(null) : KB.scene);
      return true;
    },
    step(n) { for (let i = 0; i < (n || 1); i++) step(); render(); return KB.frameCount; },
    render() { render(); },
    press(obj, exclusive) { KB.input.setVirtual(obj, exclusive !== false); },
    release() { KB.input.clearVirtual(); },
    tap(name, frames) { KB.input.setVirtual({ [name]: true }, true); for (let i = 0; i < (frames || 1); i++) step(); KB.input.clearVirtual(); render(); },
    state() {
      const p = KB.player, g = KB.game;
      return JSON.stringify({ scene: KB.scene && KB.scene.constructor.name, frame: KB.frameCount, player: p ? { x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), state: p.state, hp: p.hp, ability: p.ability, mouth: p.mouth, onGround: p.onGround, dir: p.dir } : null, game: g ? { level: g.levelId, room: g.roomIdx, ents: g.entities.length, cam: g.cam, score: g.score, lives: g.lives, boss: g.boss ? { hp: g.boss.hp, maxHp: g.boss.maxHp, dead: g.boss.dead, x: g.boss.x, y: g.boss.y, w: g.boss.w, h: g.boss.h, state: g.boss.state, intro: !!g.boss.introducing } : null, clearT: g.clearT, paused: g.paused } : null, missing: [...KB.missing] });
    },
    missing() { return [...KB.missing]; },
    sprites() { return KB.SPR_ORDER.slice(); },
    setScale(s) { window.__forceScale = s; resize(); },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } },
    hitbox(v) { KB.showHitbox = !!v; },
    entities() { return KB.game ? KB.game.entities.filter(e => !e.dead).map(e => ({ t: e.name || e.constructor.name || e.type, x: +e.x.toFixed(1), y: +e.y.toFixed(1), type: e.type, hp: e.hp, state: e.state, spr: e.spr })) : []; },
  };

  function boot() {
    document.body.appendChild(canvas);
    resize();
    KB.session = { lives: KB.START_LIVES, score: 0 };
    const q = new URLSearchParams(location.search);
    if (KB.DEBUG && q.get('norun') === '1') { render(); return; }
    if (q.get('level')) { KB.setScene(new KB.GameScene(q.get('level'), { room: +(q.get('room') || 0), ability: q.get('ability') || undefined })); }
    else if (KB.TitleScene) KB.setScene(new KB.TitleScene());
    else KB.setScene(new KB.GameScene(KB.LEVELS[0].id));
    running = true; requestAnimationFrame(loop);
    // 點擊畫布也可解鎖音訊
    canvas.addEventListener('pointerdown', () => { if (KB.audio && KB.audio.unlock) KB.audio.unlock(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
