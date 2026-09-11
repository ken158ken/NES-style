// GameScene：關卡 / 房間 / 鏡頭 / 碰撞 / 門 / 魔王 / HUD
(function () {
  const T = KB.TILE;

  class Door extends KB.Entity {
    constructor(d) {
      super(d.x * T, d.y * T); this.type = 'door'; this.w = 16; this.h = 16; this.solid = false; this.grav = 0; this.z = 0;
      this.tx = d.x; this.ty = d.y; this.to = d.to; this.boss = !!d.boss; this.exit = !!d.exit; this.locked = !!d.locked; this.secret = !!d.secret; this.back = !!d.back;
    }
    update(dt) { this.baseUpdate(dt); }
    draw(g) { g.spr(this.boss ? 'tile_door_boss' : 'tile_door', this.cx, this.bottom, { t: this.t }); }
  }
  KB.Door = Door;

  class GameScene {
    constructor(levelId, opts) {
      opts = opts || {};
      this.levelId = levelId; this.opts = opts;
      // KB.EXTRA_LEVELS：不在選關地圖上的附加關卡（例如競技場休息房，src/arena.js 註冊）
      this.level = KB.LEVELS.find(l => l.id === levelId) || (KB.EXTRA_LEVELS && KB.EXTRA_LEVELS[levelId]) || KB.LEVELS[0];
      this.arena = opts.arena || null;        // 競技場模式（src/arena.js）
      this.kills = opts.kills || 0;           // 擊敗敵人數（結算用）
      this.lives = opts.lives !== undefined ? opts.lives : (KB.session ? KB.session.lives : KB.START_LIVES);
      this.score = opts.score !== undefined ? opts.score : (KB.session ? KB.session.score : 0);
      this.entities = []; this.parts = []; this.popups = [];
      this.cam = { x: 0, y: 0 }; this.shake = 0; this.t = 0; this.frame = 0;
      this.fade = 1; this.fadeDir = -1; this.fadeCb = null; this.paused = false; this.pauseSel = 0; this.pauseMenu = null;
      this.boss = null; this.bossIntroT = 0; this.bossName = ''; this.clearT = -1; this.abilityFlash = 0;
      this.toasts = []; this.roomIdx = 0; this.timeStopT = 0; this.slowMoT = 0; this.checkpoint = null; this.freezeT = 0;
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
        // 競技場連戰 5 場，150 幀登場字幕太拖 → 縮成 60 幀（bossIntroMax 供 draw 的淡入淡出用）
        this.entities.push(this.boss); this.bossIntroMax = this.bossIntroT = ((this.opts && this.opts.arena) || this.arena) ? 60 : 150;
        this.bossName = this.boss.displayName || this.level.bossName || '';
        this.boss.introducing = true;
      }
      this.updateCamera(true);
      const mk = room.music || (this.isBossRoom && this.boss ? (this.level.id === 'w5' ? 'finalboss' : 'boss') : this.level.music || this.theme);
      this.playMusic(mk);
      try { if (KB.audio && KB.audio.ambient) KB.audio.ambient(room.ambient || null); } catch (e) { }
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
      // 競技場：出口門＝進休息房 / 下一戰 / 結算（src/arena.js 的 KB.arenaExit）
      if (door.exit && this.arena && KB.arenaExit) { KB.arenaExit(this); return; }
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
      if (this.lives < 0 && this.arena && KB.arenaFail) { KB.arenaFail(this); return; }   // 競技場只有 1 條命
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
    // 結算後的去向（KB.ResultScene 結束時呼叫；沒有結算畫面時 clearT 直接呼叫）
    gotoNext() {
      KB.session.lives = this.lives; KB.session.score = this.score;
      const idx = KB.LEVELS.indexOf(this.level);
      if (idx >= KB.LEVELS.length - 1 && KB.EndingScene) KB.setScene(new KB.EndingScene(this));
      else if (KB.StageSelectScene) KB.setScene(new KB.StageSelectScene(idx + 1));
      else KB.setScene(new GameScene(KB.LEVELS[Math.min(idx + 1, KB.LEVELS.length - 1)].id, { lives: this.lives, score: this.score }));
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
      // 暫停（選單邏輯在 src/menu.js 的 KB.PauseMenu；此處只負責開啟與轉呼叫）
      if (!this.paused && KB.input.pressed('start') && this.clearT < 0 && this.player.state !== 'dead') {
        this.paused = true; this.pauseSel = 0;
        this.pauseMenu = KB.PauseMenu ? new KB.PauseMenu(this) : null;
        KB.audio.sfx('pause'); if (KB.audio.duck) KB.audio.duck(true); return;
      }
      if (this.paused) {
        if (this.pauseMenu) this.pauseMenu.update(this);
        else if (KB.input.pressed('start')) { this.paused = false; if (KB.audio.duck) KB.audio.duck(false); KB.audio.sfx('unpause'); }
        else this.updatePause();
        return;
      }
      // 遊玩計時（不含淡入淡出 / 暫停 / hit-stop；結算與競技場計時用）
      if (this.clearT < 0) this.timeAlive++;
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
          // 過關結算畫面（ui.js 的 KB.ResultScene）→ 結算結束後才進選關 / 結局
          if (KB.ResultScene) { KB.setScene(new KB.ResultScene(this)); return; }
          this.gotoNext();
        }
      }
      // 實體更新
      const p = this.player;
      const camL = this.cam.x - 120, camR = this.cam.x + KB.W + 120, camT = this.cam.y - 120, camB = this.cam.y + KB.VIEW_H + 120;
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i]; if (e.dead) continue;
        if (e.type === 'enemy' && !e.active) { if (e.x + e.w > camL && e.x < camR && e.y + e.h > camT && e.y < camB) e.active = true; else continue; }
        if (e.type === 'enemy' && (e.x + e.w < camL - 200 || e.x > camR + 200 || e.y > camB + 200)) { if (!e.persistent) { e.active = false; e.x = e.startX; e.y = e.startY; if (e.spawnDef) e.bottom = e.spawnDef.y * T + T; e.vx = 0; e.vy = 0; e.beingInhaled = false; e.freezeT = 0; if (e.onReset) e.onReset(); } continue; }
        // 時間能力：timeStopT 期間非玩家方實體凍結；slowMoT 期間敵方每 2 幀更新一次
        if ((this.timeStopT > 0 || (this.slowMoT > 0 && (this.frame & 1))) && e !== p && e.owner !== 'player' && e.type !== 'fx' && !(e.type === 'hitbox' && e.owner === 'player')) continue;
        e.update(dt);
      }
      if (this.timeStopT > 0) this.timeStopT--; if (this.slowMoT > 0) this.slowMoT--;
      this.collisions();
      // 擊敗數（結算用）：每個敵人只計一次
      for (const e of this.entities) if (e.dead && e.type === 'enemy' && !e._killCounted) { e._killCounted = true; this.kills++; }
      // 移除死亡實體
      this.entities = this.entities.filter(e => !e.dead || e === p);
      this.map.update();
      this.updateParts();
      for (const pu of this.popups) { pu.t--; pu.y -= 0.5; } this.popups = this.popups.filter(pu => pu.t > 0);
      for (const tt of this.toasts) tt.t--; this.toasts = this.toasts.filter(tt => tt.t > 0);
      if (this.abilityFlash > 0) this.abilityFlash--;
      if (KB.VFX && KB.VFX.update) KB.VFX.update(this);
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
    // 判定框 / 投射物覆蓋到的磁磚：* B 直接破、X 需重擊（否則「叮」）、I 火焰融化、F 火焰點燃
    breakBlocksIn(a) {
      const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 1) / T), y0 = Math.floor(a.y / T), y1 = Math.floor((a.y + a.h - 1) / T);
      const fire = a.kind === 'fire';
      let hit = false, clink = null;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = this.map.get(tx, ty);
        if (ch === '*' || ch === 'B') { this.map.breakBlock(tx, ty); hit = true; }
        else if (ch === 'X') {
          if (KB.TileMap.hardBreakable(a)) { this.map.breakBlock(tx, ty); hit = true; }
          else if (!clink) clink = [tx, ty];
        } else if (ch === 'I') {
          if (fire) this.map.meltIce(tx, ty);
          else if (KB.TileMap.hardBreakable(a)) { this.map.breakBlock(tx, ty); hit = true; }
          else if (!clink) clink = [tx, ty];
        } else if (ch === 'F') {
          if (fire) this.map.igniteFuse(tx, ty);
        }
      }
      if (clink && !hit) this.map.clink(clink[0], clink[1]);
      if (hit && a.type === 'proj' && !a.pierce) { a.dead = true; KB.fx(a.fxHit || 'fx_hit', a.cx, a.cy + 6); }
    }
    // ---------- 暗房遮罩 ----------
    // 離屏畫布填黑 → destination-out 以徑向漸層挖出卡比周圍的光圈。
    // 光圈半徑：預設 40px；abilities.js 在放電 / 噴火時設 KB.game.lightR / lightT（幀數），
    // 招式結束後 lightT 線性遞減、半徑平滑縮回 40px。
    drawDark(ctx, cam) {
      let cv = this._darkCv;
      if (!cv) {
        cv = this._darkCv = KB.makeCanvas(KB.W, KB.VIEW_H);
        this._darkCtx = cv.getContext('2d');
      }
      const x = this._darkCtx;
      // lightT / lightF 由 abilities.js 的 light() 每幀寫入（招式期間 lightF 會一直跟著 frame 走），
      // 招式結束後 lightF 停住 → 剩餘幀數隨遊戲幀遞減 → 半徑線性縮回 40px（不依賴繪製次數）
      const lt = Math.max(0, (this.lightT || 0) - Math.max(0, this.frame - (this.lightF || 0)));
      const peak = this.lightR || 40;
      const r = Math.max(24, 40 + (peak - 40) * Math.min(1, lt / 180));
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, KB.W, KB.VIEW_H);
      x.fillStyle = this.room.darkColor || 'rgba(4,4,14,0.94)';
      x.fillRect(0, 0, KB.W, KB.VIEW_H);
      x.globalCompositeOperation = 'destination-out';
      const hole = (px, py, rad, core) => {
        if (px < -rad || px > KB.W + rad || py < -rad || py > KB.VIEW_H + rad) return;
        const gr = x.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(core, 'rgba(0,0,0,0.92)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
      };
      const p = this.player;
      if (p) hole(Math.round(p.cx - cam.x), Math.round(p.cy - cam.y), r, 0.55);
      // 暗房中的敵人 / 魔王微光（entity.js 設定 e.glow）
      for (const e of this.entities) { if (!e.dead && e.glow && e !== p && e.x + e.w > cam.x - 40 && e.x < cam.x + KB.W + 40) hole(Math.round(e.cx - cam.x), Math.round(e.cy - cam.y), e.glow * 1.8, 0.45); }
      // 火把 / 燭台裝飾也發光（castle 的 r 火炬、dedede 的 t 火炬 / c 燭台）
      const deco = this.map.deco;
      if (deco) {
        const TORCH = this.theme === 'dedede' ? 'tc' : 'r';
        const tx0 = Math.max(0, Math.floor(cam.x / T) - 1), tx1 = Math.min(this.map.w - 1, Math.floor((cam.x + KB.W) / T) + 1);
        const ty0 = Math.max(0, Math.floor(cam.y / T) - 1), ty1 = Math.min(this.map.h - 1, Math.floor((cam.y + KB.VIEW_H) / T) + 1);
        const fl = 1 + Math.sin(this.t * 9) * 0.06 + Math.sin(this.t * 21) * 0.04;
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          if (TORCH.indexOf(deco[ty][tx]) < 0) continue;
          hole(Math.round(tx * T + 8 - cam.x), Math.round(ty * T + 2 - cam.y), 34 * fl, 0.35);
        }
      }
      x.globalCompositeOperation = 'source-over';
      ctx.drawImage(cv, 0, 0);
    }

    // ---------- 鏡頭 ----------
    updateCamera(snap) {
      const p = this.player, map = this.map, C = KB.CAM;
      const maxX = Math.max(0, map.pw - KB.W), maxY = Math.max(0, map.ph - KB.VIEW_H);
      // ---- 水平前瞻：依速度平滑（靜止 12px、全速跑 40px）----
      const spd = Math.min(1, Math.abs(p.vx) / KB.PHYS.run);
      const wantLook = (C.lookIdle + (C.lookRun - C.lookIdle) * spd) * (p.dir < 0 ? -1 : 1);
      if (snap || this.lookAhead === undefined) this.lookAhead = wantLook;
      else this.lookAhead += (wantLook - this.lookAhead) * C.lookLerp;
      let tx = p.cx - KB.W / 2 + this.lookAhead;
      // ---- 垂直死區：玩家在畫面 40%~70% 高度內時鏡頭不動 ----
      let ty = snap ? p.bottom - KB.VIEW_H * C.restY : this.cam.y;
      if (!snap) {
        const sy = p.bottom - ty, top = KB.VIEW_H * C.deadTop, bot = KB.VIEW_H * C.deadBottom;
        if (sy < top) ty = p.bottom - top;
        else if (sy > bot) ty = p.bottom - bot;
      }
      if (this.boss && !this.boss.dead && this.isBossRoom) {
        const b = this.boss, m = C.bossMargin;
        if (this.bossIntroT > 0 && this.bossIntroT < 140) tx = b.cx - KB.W / 2 + (b.introCamX || 0);   // 登場：鏡頭平移到魔王
        else {
          // 魔王房：以兩者中點取景；若距離超過畫面寬，保證玩家在畫面內並盡量偏向魔王
          const mid = (p.cx + b.cx) / 2 - KB.W / 2;
          const lo = p.cx - (KB.W - m), hi = p.cx - m;   // 玩家距左 / 右邊緣至少 m px
          tx = Math.max(lo, Math.min(hi, mid));
          // 垂直同樣兼顧魔王，但玩家一定看得到
          let bty = (p.bottom + b.bottom) / 2 - KB.VIEW_H * C.restY;
          ty = Math.max(p.bottom - KB.VIEW_H + 32, Math.min(p.bottom - 32, bty));
        }
      }
      tx = Math.max(0, Math.min(maxX, tx)); ty = Math.max(0, Math.min(maxY, ty));
      if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
      this.cam.x += (tx - this.cam.x) * C.follow; this.cam.y += (ty - this.cam.y) * C.follow;
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
      if (KB.VFX && KB.VFX.preWorld) KB.VFX.preWorld(ctx, cam, this);
      this.map.draw(ctx, cam, this.theme, this.t);
      // 實體（依 z 排序）
      const list = this.entities.filter(e => !e.dead || e === this.player).sort((a, b) => a.z - b.z);
      for (const e of list) e.draw(g);
      // 水層（半透明疊在實體之上）
      this.map.drawWater(ctx, cam, this.t);
      // R2-P1-14：水層蓋掉水中的卡比 → 水層之後以半透明再畫一次玩家，粉紅色才分得出來
      const pw = this.player;
      if (pw && pw.inWater && !pw.dead) { ctx.save(); ctx.globalAlpha = 0.5; pw.draw(g); ctx.restore(); }
      // 粒子（氣泡 / 水花畫在水層之上才看得到）
      for (const q of this.parts) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x - cam.x), Math.round(q.y - cam.y), q.size, q.size); }
      // 暗房遮罩（room.dark）：卡比周圍以徑向漸層挖亮，火把也會透出小光暈
      if (this.room && this.room.dark) this.drawDark(ctx, cam);
      // 分數彈出
      for (const pu of this.popups) KB.text(ctx, String(pu.n), pu.x - cam.x, pu.y - cam.y - 8, { color: '#fff', align: 'center', outline: '#203040' });
      // 魔王登場字幕
      if (this.bossIntroT > 0 && this.bossName) {
        const a = Math.min(1, this.bossIntroT / 20, ((this.bossIntroMax || 150) - this.bossIntroT) / 20);
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
      // 關卡開場橫幅（WORLD n + 關名，滑入 → 停 → 滑出，不阻擋操作）
      if (KB.UI && KB.UI.drawLevelBanner) KB.UI.drawLevelBanner(ctx, this);
      // 遊戲內「?」提示（進新關卡 toast / 右上角常駐問號）
      if (KB.VFX && KB.VFX.postWorld) KB.VFX.postWorld(ctx, cam, this);
      if (KB.UI && KB.UI.drawGameHint) KB.UI.drawGameHint(ctx, this);
      // HUD
      if (KB.drawHUD) KB.drawHUD(ctx, this); else this.drawHUDFallback(ctx);
      // 魔王血條
      if (this.boss && !this.boss.dead && this.bossIntroT === 0 && KB.drawBossBar) KB.drawBossBar(ctx, this.boss);
      else if (this.boss && !this.boss.dead && this.bossIntroT === 0) { KB.rect(ctx, 160, 200, 88, 8, '#000'); KB.rect(ctx, 161, 201, Math.round(86 * this.boss.hp / this.boss.maxHp), 6, '#e83030'); }
      // 提示（R2-P2-13：開場橫幅顯示期間 toast 讓到橫幅下方，兩行字才不會互相蓋掉）
      const bb = (KB.UI && KB.UI.bannerBottom) ? KB.UI.bannerBottom(this) : 0;
      const toastY = bb ? bb + 4 : 40;
      for (const tt of this.toasts) (KB.UI && KB.UI.text ? KB.UI.text : KB.text)(ctx, tt.msg, KB.W / 2, toastY, { color: '#fff', align: 'center', outline: '#000' });
      if (this.paused) {
        if (this.pauseMenu) this.pauseMenu.draw(ctx, this);
        else if (KB.drawPause) KB.drawPause(ctx, this);
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
  // best：各關最佳結算總分（ui.js ResultScene / 選關面板）；arena：競技場最佳時間（src/arena.js）
  KB.save = { cleared: {}, score: 0, best: {}, arena: {} };
  try { const s = localStorage.getItem('kirbystar_save'); if (s) KB.save = Object.assign(KB.save, JSON.parse(s)); } catch (e) { }
  KB.saveGame = function () { try { localStorage.setItem('kirbystar_save', JSON.stringify(KB.save)); } catch (e) { } };
})();
