// GameScene：關卡 / 房間 / 鏡頭 / 碰撞 / 門 / 魔王 / HUD
(function () {
  const T = KB.TILE;

  class Door extends KB.Entity {
    constructor(d) {
      super(d.x * T, d.y * T); this.type = 'door'; this.w = 16; this.h = 16; this.solid = false; this.grav = 0; this.z = 0;
      this.tx = d.x; this.ty = d.y; this.to = d.to; this.boss = !!d.boss; this.exit = !!d.exit; this.locked = !!d.locked;
    }
    update(dt) { this.baseUpdate(dt); }
    draw(g) { g.spr(this.boss ? 'tile_door_boss' : 'tile_door', this.cx, this.bottom, { t: this.t }); }
  }
  KB.Door = Door;

  class GameScene {
    constructor(levelId, opts) {
      opts = opts || {};
      this.levelId = levelId; this.opts = opts;
      this.level = KB.LEVELS.find(l => l.id === levelId) || KB.LEVELS[0];
      this.lives = opts.lives !== undefined ? opts.lives : (KB.session ? KB.session.lives : KB.START_LIVES);
      this.score = opts.score !== undefined ? opts.score : (KB.session ? KB.session.score : 0);
      this.entities = []; this.parts = []; this.popups = [];
      this.cam = { x: 0, y: 0 }; this.shake = 0; this.t = 0; this.frame = 0;
      this.fade = 1; this.fadeDir = -1; this.fadeCb = null; this.paused = false; this.pauseSel = 0;
      this.boss = null; this.bossIntroT = 0; this.bossName = ''; this.clearT = -1; this.abilityFlash = 0;
      this.toasts = []; this.roomIdx = 0; this.checkpoint = null; this.freezeT = 0;
      this.timeAlive = 0; this.musicKey = null;
    }
    enter() {
      KB.game = this; KB.session = KB.session || {};
      const o = this.opts;
      this.loadRoom(o.room || 0, o.x, o.y, true);
      if (o.ability && KB.ABILITIES[o.ability]) { this.player.ability = o.ability; }
      if (o.hp) this.player.hp = o.hp;
      this.fade = 1; this.fadeDir = -1;
    }
    exit() { KB.audio.music(null); }

    // ---------- 房間 ----------
    loadRoom(idx, sx, sy, first) {
      const room = this.level.rooms[idx]; this.room = room; this.roomIdx = idx;
      this.map = new KB.TileMap(room.map, room.deco);
      this.theme = room.theme || this.level.theme;
      const keep = this.player;
      this.entities = []; this.parts = []; this.popups = []; this.boss = null; this.bossIntroT = 0;
      const spawn = room.spawn || [2, this.map.h - 3];
      const px = (sx !== undefined ? sx : spawn[0]) * T + 1, py = (sy !== undefined ? sy : spawn[1]) * T;
      if (keep && !first) { keep.x = px; keep.bottom = py + T; keep.vx = 0; keep.vy = 0; keep.setState('idle'); keep.solid = true; }
      else { this.player = new KB.Player(px, py); this.player.bottom = py + T; KB.player = this.player; }
      this.player.onGround = true;
      this.checkpoint = { room: idx, x: this.player.x, y: this.player.y };
      this.entities.push(this.player);
      for (const d of (room.doors || [])) this.entities.push(new Door(d));
      this.isBossRoom = !!room.bossRoom || (this.level.boss && idx === this.level.rooms.length - 1 && !room.noBoss);
      const hasBoss = this.isBossRoom && this.level.boss && KB.BOSSES[this.level.boss];
      if (room.exit && !hasBoss) this.entities.push(new Door({ x: room.exit.x, y: room.exit.y, exit: true, boss: true }));
      for (const e of (room.entities || [])) this.spawnDef(e);
      if (hasBoss) {
        const B = KB.BOSSES[this.level.boss];
        const bx = room.bossPos ? room.bossPos[0] * T : (this.map.pw - 64), by = room.bossPos ? room.bossPos[1] * T : (this.map.ph - 32);
        this.boss = new B(bx, by); this.boss.type = 'boss'; this.boss.z = 2;
        this.entities.push(this.boss); this.bossIntroT = 150; this.bossName = this.boss.displayName || this.level.bossName || '';
        this.boss.introducing = true;
      }
      this.updateCamera(true);
      const mk = room.music || (this.isBossRoom && this.boss ? (this.level.id === 'w5' ? 'finalboss' : 'boss') : this.level.music || this.theme);
      this.playMusic(mk);
      if (this.map.w * T < KB.W) { /* 小房間置中 */ }
    }
    spawnDef(e) {
      const C = KB.ENEMIES[e.t] || KB.ITEMS[e.t];
      if (!C) { console.warn('unknown entity', e.t); return null; }
      const ent = new C(e.x * T, e.y * T, e.a, e.b);
      ent.bottom = e.y * T + T; ent.spawnDef = e;
      if (e.dir) ent.dir = e.dir; if (e.drop) ent.dropItem = e.drop;
      this.entities.push(ent); return ent;
    }
    playMusic(k) { this.musicKey = k; KB.audio.music(k); }
    resumeMusic() { KB.audio.music(this.musicKey); }

    doorAt(p) {
      for (const e of this.entities) if (e.type === 'door' && !e.locked && p.overlapsRect(e.x + 2, e.y, e.w - 4, e.h) && Math.abs(p.cx - e.cx) < 8) return e;
      return null;
    }
    useDoor(door) {
      if (door.exit) { this.levelClear(); return; }
      this.fadeTo(() => { const to = door.to; this.loadRoom(to.room, to.x, to.y); });
    }
    fadeTo(cb) { this.fadeDir = 1; this.fadeCb = cb; }

    // ---------- 分數 / 提示 ----------
    addScore(n, x, y) { if (!n) return; this.score += n; if (x !== undefined) this.popups.push({ x, y, n, t: 40 }); }
    toast(msg) { this.toasts.push({ msg, t: 90 }); }

    // ---------- 死亡 / 過關 ----------
    playerDied() {
      this.lives--;
      if (this.lives < 0) { KB.session.score = this.score; KB.setScene(KB.GameOverScene ? new KB.GameOverScene(this) : new GameScene(this.levelId, { lives: KB.START_LIVES })); return; }
      const cp = this.checkpoint;
      this.fade = 1; this.fadeDir = -1;
      this.player = null;
      this.loadRoom(cp.room, undefined, undefined, true);
      this.player.x = cp.x; this.player.y = cp.y;
    }
    levelClear() {
      if (this.clearT >= 0) return;
      this.clearT = 0; KB.audio.music('clear'); KB.audio.sfx('clear');
      this.player.startDance();
      KB.save.cleared[this.levelId] = true; KB.save.score = Math.max(KB.save.score || 0, this.score); KB.saveGame();
    }
    onBossDefeated() {
      // 魔王死亡：星星噴發、跳舞、下一關
      this.shake = 10; this.freezeT = 20;
      for (let i = 0; i < 10; i++) setTimeout(() => { }, 0);
      const bx = this.boss ? this.boss.cx : this.player.cx, by = this.boss ? this.boss.cy : this.player.cy;
      for (let i = 0; i < 12; i++) KB.spawn(new KB.ITEMS.pointstar(bx - 4, by - 4, { pop: true }));
      KB.particles(bx, by, ['#fff', '#ffe040', '#ff8080'], 30, { spread: 4, life: 50 });
      for (const e of this.entities) if (e.type === 'enemy' || (e.type === 'proj' && e.owner === 'enemy')) e.dead = true;
      this.bossDefeatT = 90;
    }
    onBlockBroken(tx, ty, ch) { }

    // ---------- 更新 ----------
    update(dt) {
      this.t += dt; this.frame++;
      if (this.freezeT > 0) { this.freezeT--; return; }
      // 淡入淡出
      if (this.fadeDir !== 0) {
        this.fade += this.fadeDir * 0.08;
        if (this.fade >= 1 && this.fadeDir > 0) { this.fade = 1; this.fadeDir = -1; if (this.fadeCb) { const cb = this.fadeCb; this.fadeCb = null; cb(); } return; }
        if (this.fade <= 0 && this.fadeDir < 0) { this.fade = 0; this.fadeDir = 0; }
        if (this.fadeDir > 0) return;
      }
      // 暫停
      if (KB.input.pressed('start') && this.clearT < 0 && this.player.state !== 'dead') { this.paused = !this.paused; KB.audio.sfx(this.paused ? 'pause' : 'menu'); this.pauseSel = 0; return; }
      if (this.paused) { this.updatePause(); return; }
      // 魔王登場
      if (this.bossIntroT > 0) {
        this.bossIntroT--;
        if (this.bossIntroT === 0 && this.boss) this.boss.introducing = false;
        this.player.update(dt); this.updateCamera(); this.map.update(); this.updateParts();
        if (this.boss && this.boss.introUpdate) this.boss.introUpdate(dt);
        return;
      }
      if (this.bossDefeatT > 0) {
        this.bossDefeatT--;
        if (this.bossDefeatT === 0) { this.spawnExitDoor(); }
      }
      // 過關演出
      if (this.clearT >= 0) {
        this.clearT++;
        if (this.clearT === 1) this.player.startDance();
        if (this.clearT % 12 === 0 && this.clearT < 120) KB.particles(this.player.cx + (Math.random() - 0.5) * 60, this.player.cy - 20 + (Math.random() - 0.5) * 40, ['#fff', '#ffe040', '#ffb0d0', '#80e0ff'], 4, { spread: 1.5, grav: 0.02, life: 40 });
        if (this.clearT === 220) {
          KB.session.lives = this.lives; KB.session.score = this.score;
          const idx = KB.LEVELS.indexOf(this.level);
          if (idx >= KB.LEVELS.length - 1 && KB.EndingScene) KB.setScene(new KB.EndingScene(this));
          else if (KB.StageSelectScene) KB.setScene(new KB.StageSelectScene(idx + 1));
          else KB.setScene(new GameScene(KB.LEVELS[Math.min(idx + 1, KB.LEVELS.length - 1)].id, { lives: this.lives, score: this.score }));
        }
      }
      // 實體更新
      const p = this.player;
      const camL = this.cam.x - 120, camR = this.cam.x + KB.W + 120, camT = this.cam.y - 120, camB = this.cam.y + KB.VIEW_H + 120;
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i]; if (e.dead) continue;
        if (e.type === 'enemy' && !e.active) { if (e.x + e.w > camL && e.x < camR && e.y + e.h > camT && e.y < camB) e.active = true; else continue; }
        if (e.type === 'enemy' && (e.x + e.w < camL - 200 || e.x > camR + 200 || e.y > camB + 200)) { if (!e.persistent) { e.active = false; e.x = e.startX; e.y = e.startY; if (e.spawnDef) e.bottom = e.spawnDef.y * T + T; e.vx = 0; e.vy = 0; e.beingInhaled = false; e.freezeT = 0; if (e.onReset) e.onReset(); } continue; }
        e.update(dt);
      }
      this.collisions();
      // 移除死亡實體
      this.entities = this.entities.filter(e => !e.dead || e === p);
      this.map.update();
      this.updateParts();
      for (const pu of this.popups) { pu.t--; pu.y -= 0.5; } this.popups = this.popups.filter(pu => pu.t > 0);
      for (const tt of this.toasts) tt.t--; this.toasts = this.toasts.filter(tt => tt.t > 0);
      if (this.abilityFlash > 0) this.abilityFlash--;
      if (this.shake > 0) this.shake--;
      this.updateCamera();
    }
    spawnExitDoor() {
      // 魔王房出口：以魔王位置或房間 exit 生成過關門
      const r = this.room; const ex = r.exit ? r.exit.x : Math.floor(this.map.w / 2), ey = r.exit ? r.exit.y : this.map.h - 3;
      if (!this.entities.some(e => e.type === 'door' && e.exit)) {
        const d = new Door({ x: ex, y: ey, exit: true, boss: true }); this.entities.push(d);
        KB.fx('fx_sparkle', d.cx, d.cy); KB.audio.sfx('door');
      }
    }
    updateParts() {
      for (const q of this.parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.life--; }
      this.parts = this.parts.filter(q => q.life > 0);
    }
    updatePause() {
      const inp = KB.input;
      if (inp.pressed('up')) { this.pauseSel = (this.pauseSel + 1) % 2; KB.audio.sfx('menu'); }
      if (inp.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % 2; KB.audio.sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
        KB.audio.sfx('select');
        if (this.pauseSel === 0) this.paused = false;
        else { KB.session.lives = this.lives; KB.session.score = this.score; KB.setScene(KB.StageSelectScene ? new KB.StageSelectScene(KB.LEVELS.indexOf(this.level)) : new GameScene(this.levelId)); }
      }
    }

    // ---------- 碰撞 ----------
    collisions() {
      const p = this.player, ents = this.entities, map = this.map;
      // 第一階段：玩家攻擊（Hitbox / 投射物）→ 敵人、魔王、敵方投射物、方塊
      for (const a of ents) {
        if (a.dead) continue;
        if ((a.type === 'hitbox' || a.type === 'proj') && a.owner === 'player') {
          if (a.breakBlocks) this.breakBlocksIn(a);
          for (const b of ents) {
            if (b.dead || b === a) continue;
            if (b.type === 'enemy' || b.type === 'boss' || (b.type === 'proj' && b.owner === 'enemy' && b.destructible)) {
              if (!a.overlaps(b)) continue;
              if (a.type === 'hitbox') { if (!a.canHit(b)) continue; }
              else { if (a.hitSet.has(b.id)) continue; }
              if (b.type === 'boss' && b.introducing) continue;
              const ok = b.hurt(a.dmg, a);
              if (ok !== false) {
                if (a.type === 'hitbox') a.markHit(b); else { a.hitSet.add(b.id); if (!a.pierce) { a.dead = true; KB.fx(a.fxHit || 'fx_hit', a.cx, a.cy + 6); } }
                if (b.type !== 'boss' && a.knock && b.solid) { b.vx = (b.cx < a.cx ? -1 : 1) * a.knock; b.vy = Math.min(b.vy, -1); }
                if (a.onHit) a.onHit(b, a); if (a.onHitCb) a.onHitCb(b, a);
                if (b.type === 'boss' && b.dead) this.onBossDefeated();
              }
            }
          }
        }
      }
      // 第二階段：敵方攻擊 / 身體接觸 → 玩家
      for (const a of ents) {
        if (a.dead) continue;
        if ((a.type === 'proj' && a.owner === 'enemy') || (a.type === 'hitbox' && a.owner === 'enemy')) {
          if (p.state !== 'dead' && !a.beingInhaled && a.overlaps(p)) {
            if (p.state === 'stone' || p.invincibleT > 0) { if (a.type === 'proj' && a.destructible) { a.dead = true; KB.fx('fx_hit', a.cx, a.cy + 6); } continue; }
            if (p.hurt(a.dmg, a)) { if (a.type === 'proj' && !a.pierce) a.dead = true; else if (a.type === 'hitbox') a.markHit(p); }
          }
          continue;
        }
        // 敵人身體接觸
        if ((a.type === 'enemy' || a.type === 'boss') && a.hurtsPlayer && !a.beingInhaled && a.freezeT <= 0 && !a.introducing) {
          if (p.state === 'dead') continue;
          if (!a.overlaps(p)) continue;
          if (p.invincibleT > 0 && a.type === 'enemy') { if (a.invincibleHitT > 0) continue; a.invincibleHitT = 20; a.hurt(a.stunned !== undefined ? 4 : 99, { cx: p.cx, cy: p.cy, knock: 2 }); continue; }
          if (p.state === 'stone') { continue; }
          if (a.contactDamage === false) continue;
          p.hurt(a.damage || 1, a);
        }
      }
      // 魔王死亡（非由玩家攻擊直接判定時）
      if (this.boss && this.boss.dead && !this.bossDefeatT && this.bossDefeatT !== 0) { }
      if (this.boss && this.boss.dead && this.bossDefeatT === undefined) this.onBossDefeated();
    }
    breakBlocksIn(a) {
      const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 1) / T), y0 = Math.floor(a.y / T), y1 = Math.floor((a.y + a.h - 1) / T);
      let hit = false;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = this.map.get(tx, ty);
        if (ch === '*' || ch === 'B') { this.map.breakBlock(tx, ty); hit = true; }
      }
      if (hit && a.type === 'proj' && !a.pierce) { a.dead = true; KB.fx(a.fxHit || 'fx_hit', a.cx, a.cy + 6); }
    }

    // ---------- 鏡頭 ----------
    updateCamera(snap) {
      const p = this.player, map = this.map;
      const maxX = Math.max(0, map.pw - KB.W), maxY = Math.max(0, map.ph - KB.VIEW_H);
      let tx = p.cx - KB.W / 2 + (p.dir * 24), ty = p.bottom - KB.VIEW_H * 0.62;
      if (this.boss && !this.boss.dead && this.isBossRoom) {
        // 魔王房：以玩家與魔王中點取景，但玩家一定要在畫面內
        if (this.bossIntroT > 0 && this.bossIntroT < 140) tx = this.boss.cx - KB.W / 2 + (this.boss.introCamX || 0);   // 登場：鏡頭平移到魔王
        else { tx = (p.cx + this.boss.cx) / 2 - KB.W / 2; tx = Math.max(p.cx - KB.W + 40, Math.min(p.cx - 40, tx)); }
      }
      tx = Math.max(0, Math.min(maxX, tx)); ty = Math.max(0, Math.min(maxY, ty));
      if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
      this.cam.x += (tx - this.cam.x) * 0.12; this.cam.y += (ty - this.cam.y) * 0.12;
      if (Math.abs(tx - this.cam.x) < 0.3) this.cam.x = tx; if (Math.abs(ty - this.cam.y) < 0.3) this.cam.y = ty;
    }

    // ---------- 繪製 ----------
    draw(ctx) {
      const cam = { x: Math.round(this.cam.x), y: Math.round(this.cam.y) };
      if (this.shake > 0) { cam.x += Math.round((Math.random() - 0.5) * this.shake); cam.y += Math.round((Math.random() - 0.5) * this.shake); }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, KB.W, KB.VIEW_H); ctx.clip();
      // 背景
      const bgFn = KB.BG && (KB.BG[this.room.bg || this.theme] || KB.BG[this.theme]);
      if (bgFn) bgFn(ctx, cam.x, cam.y, this.t, this.room); else { ctx.fillStyle = '#78c8f8'; ctx.fillRect(0, 0, KB.W, KB.VIEW_H); }
      const g = new KB.G(ctx, cam);
      this.map.draw(ctx, cam, this.theme, this.t);
      // 實體（依 z 排序）
      const list = this.entities.filter(e => !e.dead || e === this.player).sort((a, b) => a.z - b.z);
      for (const e of list) e.draw(g);
      // 粒子
      for (const q of this.parts) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x - cam.x), Math.round(q.y - cam.y), q.size, q.size); }
      this.map.drawWater(ctx, cam, this.t);
      // 分數彈出
      for (const pu of this.popups) KB.text(ctx, String(pu.n), pu.x - cam.x, pu.y - cam.y - 8, { color: '#fff', align: 'center', outline: '#203040' });
      // 魔王登場字幕
      if (this.bossIntroT > 0 && this.bossName) {
        const a = Math.min(1, this.bossIntroT / 20, (150 - this.bossIntroT) / 20);
        ctx.globalAlpha = Math.max(0, a);
        KB.rect(ctx, 0, 70, KB.W, 34, 'rgba(0,0,0,0.55)');
        (KB.UI && KB.UI.text ? KB.UI.text : KB.text)(ctx, this.bossName, KB.W / 2, 74, { color: '#ffe040', align: 'center', size: 12, outline: '#402000' });
        KB.text(ctx, this.boss && this.boss.subtitle ? this.boss.subtitle : 'BOSS', KB.W / 2, 90, { color: '#fff', align: 'center' });
        ctx.globalAlpha = 1;
      }
      if (this.clearT >= 0 && this.clearT > 20) {
        (KB.UI && KB.UI.text ? KB.UI.text : KB.text)(ctx, '過關！', KB.W / 2, 60, { color: '#ffe040', align: 'center', size: 16, outline: '#603000' });
      }
      ctx.restore();
      // HUD
      if (KB.drawHUD) KB.drawHUD(ctx, this); else this.drawHUDFallback(ctx);
      // 魔王血條
      if (this.boss && !this.boss.dead && this.bossIntroT === 0 && KB.drawBossBar) KB.drawBossBar(ctx, this.boss);
      else if (this.boss && !this.boss.dead && this.bossIntroT === 0) { KB.rect(ctx, 160, 200, 88, 8, '#000'); KB.rect(ctx, 161, 201, Math.round(86 * this.boss.hp / this.boss.maxHp), 6, '#e83030'); }
      // 提示
      for (const tt of this.toasts) (KB.UI && KB.UI.text ? KB.UI.text : KB.text)(ctx, tt.msg, KB.W / 2, 40, { color: '#fff', align: 'center', outline: '#000' });
      if (this.paused) {
        if (KB.drawPause) KB.drawPause(ctx, this);
        else { KB.rect(ctx, 0, 0, KB.W, KB.H, 'rgba(0,0,0,0.5)'); KB.text(ctx, 'PAUSE', KB.W / 2, 90, { color: '#fff', align: 'center', size: 12 }); KB.text(ctx, (this.pauseSel === 0 ? '> ' : '  ') + '繼續', KB.W / 2, 110, { color: '#fff', align: 'center' }); KB.text(ctx, (this.pauseSel === 1 ? '> ' : '  ') + '離開關卡', KB.W / 2, 124, { color: '#fff', align: 'center' }); }
      }
      if (this.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + this.fade.toFixed(2) + ')'; ctx.fillRect(0, 0, KB.W, KB.H); }
    }
    drawHUDFallback(ctx) {
      const p = this.player;
      KB.rect(ctx, 0, KB.HUD_Y, KB.W, 32, '#101828');
      KB.text(ctx, p.ability ? (KB.ABILITY_HUD[p.ability] || p.ability.toUpperCase()) : 'NORMAL', 8, 196, { color: '#ffe040' });
      for (let i = 0; i < p.maxHp; i++) KB.rect(ctx, 8 + i * 10, 208, 8, 8, i < p.hp ? '#f8d040' : '#404850');
      KB.text(ctx, 'SCORE ' + String(this.score).padStart(7, '0'), 100, 196, { color: '#fff' });
      KB.text(ctx, 'x' + this.lives, 220, 208, { color: '#fff' });
    }
  }
  KB.GameScene = GameScene;

  // ---------- 存檔 ----------
  KB.save = { cleared: {}, score: 0 };
  try { const s = localStorage.getItem('kirbystar_save'); if (s) KB.save = Object.assign(KB.save, JSON.parse(s)); } catch (e) { }
  KB.saveGame = function () { try { localStorage.setItem('kirbystar_save', JSON.stringify(KB.save)); } catch (e) { } };
})();
