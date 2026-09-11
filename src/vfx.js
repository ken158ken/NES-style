// 特效系統 KB.VFX（Round 5 變身大爆發）
// ---------------------------------------------------------------------------
// 所有特效都放進同一個陣列 KB.VFX.list（上限 400，超過丟最舊），每個元素是
//   { t, life, layer, draw(ctx, cam), up?() }
// layer：'pre' 地圖之下 / 'w' 世界層（套 zoom、以 cam 轉換）/ 'v' 視窗層（256×192 螢幕座標）
//        / 's' 螢幕層（256×224，蓋過 HUD 之前）/ 'z' zoom 控制（不繪製）
// 所有 API 在 KB.game 不存在時安全 no-op（回傳 null）。
//
// ==== KB.VFX API 一覽（其他 agent 呼叫用）====
// 螢幕層：flash(color,frames,alpha) / tint(color,frames,alpha) / worldTint(color,alpha,frames)
//         letterbox(frames) / zoom(scale,frames) / shake(n) / hitstop(n)
// 世界層：slash(x,y,r,angle,o) / line(x1,y1,x2,y2,o) / lightning(x1,y1,x2,y2,o) / ring(x,y,o)
//         burst(x,y,o) / circle(x,y,o) / beam(x,y,dir,len,o) / afterimage(ent,o) / aura(ent,o)
//         textPop(x,y,text,o) / shockwave(x,y,o) / sparkTrail(ent,o)
// 演出：transform(player,key,o) / untransform(player)
// 管理：update(game) / preWorld(ctx,cam,game) / postWorld(ctx,cam,game) / clear() / level
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const V = KB.VFX = KB.VFX || {};
  const MAX = 400;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

  V.MAX = MAX;
  V.list = [];
  V._pending = [];
  V._busy = false;
  V._game = null;

  // 畫質等級：KB.save.settings.vfx（'high' | 'mid' | 'low'，預設 high）
  Object.defineProperty(V, 'level', {
    get() {
      const s = KB.save && KB.save.settings, v = s && s.vfx;
      return (v === 'low' || v === 'mid') ? v : 'high';
    },
    configurable: true,
  });
  // 粒子數縮放（low ×0.4、mid ×0.7）
  V.pn = function (n) {
    const L = V.level;
    if (L === 'low') return Math.max(1, Math.round(n * 0.4));
    if (L === 'mid') return Math.max(1, Math.round(n * 0.7));
    return n;
  };
  const lowMode = () => V.level === 'low';

  // ---------- 陣列管理 ----------
  function push(e) {
    if (!KB.game) return null;
    e.t = 0;
    if (e.life === undefined) e.life = 30;
    if (e.life <= 0) e.life = 1;
    if (!e.layer) e.layer = 'w';
    if (V._busy) { V._pending.push(e); return e; }
    const L = V.list;
    L.push(e);
    while (L.length > MAX) L.shift();
    return e;
  }
  V.push = push;
  V.clear = function () { V.list.length = 0; V._pending.length = 0; };
  /** 立刻結束所有 kind 相同的效果（同一時間只該有一條橫幅 / 一次變身演出）*/
  function dropKind(kind) {
    for (const e of V.list) if (e.kind === kind) e.dead = true;
    for (const e of V._pending) if (e.kind === kind) e.dead = true;
  }
  V.dropKind = dropKind;

  V.update = function (game) {
    game = game || KB.game;
    if (game && V._game !== game) { V.clear(); V._game = game; }   // 換場景自動清空
    const L = V.list;
    V._busy = true;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.dead && e.up) { try { e.up(e); } catch (err) { e.dead = true; } }
      e.t++;
      if (!e.dead && e.t < e.life) L[w++] = e;
    }
    L.length = w;
    V._busy = false;
    if (V._pending.length) {
      for (const e of V._pending) L.push(e);
      V._pending.length = 0;
      while (L.length > MAX) L.shift();
    }
  };

  // ---------- 繪製 ----------
  function drawLayer(ctx, cam, layer) {
    const L = V.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead || e.layer !== layer || !e.draw) continue;
      ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineCap = 'butt';
      try { e.draw(ctx, cam); } catch (err) { e.dead = true; }
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineCap = 'butt';
  }

  function zoomK() {
    if (lowMode()) return 1;
    const L = V.list;
    let k = 1;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.layer !== 'z' || e.dead) continue;
      const f = clamp01(e.t / e.life);
      k *= 1 + (e.k - 1) * Math.pow(1 - f, 1.5);
    }
    return k;
  }

  function applyZoom(ctx, cam, game) {
    const k = zoomK();
    if (k === 1) return 1;
    const p = game && game.player;
    const sx = p ? Math.round(p.cx - cam.x) : KB.W / 2;
    const sy = p ? Math.round(p.cy - cam.y) : KB.VIEW_H / 2;
    ctx.translate(sx, sy); ctx.scale(k, k); ctx.translate(-sx, -sy);
    return k;
  }

  // 注意：preWorld 故意不呼叫 ctx.save()；game.js 世界區塊結尾的 ctx.restore()
  // 會一併還原 zoom 變換與裁切，維持 save/restore 平衡（不必動 game.js）。
  V.preWorld = function (ctx, cam, game) {
    if (!ctx) return;
    applyZoom(ctx, cam, game || KB.game);   // 之後的地圖 / 實體 / 'pre' 層都吃這個變換
    drawLayer(ctx, cam, 'pre');
  };

  V.postWorld = function (ctx, cam, game) {
    if (!ctx) return;
    game = game || KB.game;
    // 世界層：自己裁切回遊戲區（postWorld 在 game.js 的 ctx.restore() 之後被呼叫）
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, KB.W, KB.VIEW_H); ctx.clip();
    applyZoom(ctx, cam, game);
    drawLayer(ctx, cam, 'w');
    ctx.restore();
    // 視窗層（只蓋遊戲區、不 zoom）：worldTint / letterbox
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, KB.W, KB.VIEW_H); ctx.clip();
    drawLayer(ctx, cam, 'v');
    ctx.restore();
    // 螢幕層：整張 256×224
    drawLayer(ctx, cam, 's');
  };

  // =========================================================================
  // 螢幕層
  // =========================================================================
  V.flash = function (color, frames, alpha) {
    const a0 = alpha === undefined ? 0.8 : alpha;
    return push({
      layer: 's', life: frames || 6, color: color || '#ffffff',
      draw(ctx) {
        const f = this.t / this.life;
        ctx.globalAlpha = a0 * (1 - f);
        ctx.fillStyle = this.color; ctx.fillRect(0, 0, KB.W, KB.H);
      },
    });
  };

  V.tint = function (color, frames, alpha) {
    const a0 = alpha === undefined ? 0.35 : alpha;
    return push({
      layer: 's', life: frames || 20, color: color || '#ffffff',
      draw(ctx) {
        const f = this.t / this.life;
        ctx.globalAlpha = a0 * (f > 0.7 ? (1 - f) / 0.3 : Math.min(1, this.t / 3));
        ctx.fillStyle = this.color; ctx.fillRect(0, 0, KB.W, KB.H);
      },
    });
  };

  // 只染世界層（HUD 不受影響）；時停 / 電擊瞬間用
  V.worldTint = function (color, alpha, frames) {
    const a0 = alpha === undefined ? 0.35 : alpha;
    return push({
      layer: 'v', life: frames || 12, color: color || '#8080ff',
      draw(ctx) {
        const f = this.t / this.life;
        ctx.globalAlpha = a0 * (f > 0.6 ? (1 - f) / 0.4 : Math.min(1, (this.t + 1) / 3));
        ctx.fillStyle = this.color; ctx.fillRect(0, 0, KB.W, KB.VIEW_H);
      },
    });
  };

  // 上下黑邊（必殺 / 變身）
  V.letterbox = function (frames) {
    const life = frames || 20, H = 22;
    return push({
      layer: 'v', life,
      draw(ctx) {
        const inT = Math.min(8, life * 0.35), outT = Math.min(8, life * 0.35);
        let f = 1;
        if (this.t < inT) f = this.t / inT;
        else if (this.t > life - outT) f = Math.max(0, (life - this.t) / outT);
        const h = Math.round(H * f);
        if (h <= 0) return;
        ctx.globalAlpha = 1; ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, KB.W, h);
        ctx.fillRect(0, KB.VIEW_H - h, KB.W, h);
      },
    });
  };

  // 以卡比為中心的 zoom punch（low 畫質關閉）
  V.zoom = function (scale, frames) {
    if (lowMode()) return null;
    return push({ layer: 'z', life: frames || 8, k: scale || 1.15, draw: null });
  };

  V.shake = function (n) { const g = KB.game; if (g) g.shake = Math.max(g.shake || 0, n || 4); return null; };
  V.hitstop = function (n) { const g = KB.game; if (g) g.freezeT = Math.max(g.freezeT || 0, n || 4); return null; };

  // =========================================================================
  // 世界層
  // =========================================================================

  // 斬擊弧：以 (x,y) 為圓心、半徑 r、中心角 angle（弧度，0=右、負值=上）掃出一道弧
  V.slash = function (x, y, r, angle, o) {
    o = o || {};
    const arc = o.arc === undefined ? Math.PI * 0.95 : o.arc;
    const s = o.flip ? -1 : 1;
    return push({
      layer: 'w', life: o.frames || 11, x, y, r: r || 18,
      color: o.color || '#ffffff', width: o.width || 3,
      draw(ctx, cam) {
        const f = this.t / this.life;
        const cx = Math.round(this.x - cam.x), cy = Math.round(this.y - cam.y);
        const rr = this.r * (1 + f * 0.16);
        const a0 = angle - s * arc / 2;
        const head = a0 + s * arc * clamp01(f * 1.6);
        const tail = a0 + s * arc * clamp01(f * 1.6 - 0.6);   // 尾端慢 0.6 → 看得見一段掃過的刀光
        if (Math.abs(head - tail) < 0.01) return;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.9 * (1 - f * f);
        ctx.strokeStyle = this.color; ctx.lineWidth = this.width;
        ctx.beginPath(); ctx.arc(cx, cy, rr, Math.min(tail, head), Math.max(tail, head)); ctx.stroke();
        ctx.globalAlpha = 0.95 * (1 - f);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, this.width - 2);
        ctx.beginPath(); ctx.arc(cx, cy, rr, Math.min(tail, head), Math.max(tail, head)); ctx.stroke();
      },
    });
  };

  V.line = function (x1, y1, x2, y2, o) {
    o = o || {};
    return push({
      layer: 'w', life: o.frames || 10, x1, y1, x2, y2,
      color: o.color || '#ffffff', width: o.width || 2,
      draw(ctx, cam) {
        const f = this.t / this.life;
        const g = Math.min(1, (this.t + 1) / 3);   // 前 3 幀伸長
        ctx.lineCap = 'round';
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = this.color; ctx.lineWidth = this.width;
        ctx.beginPath();
        ctx.moveTo(Math.round(this.x1 - cam.x) + 0.5, Math.round(this.y1 - cam.y) + 0.5);
        ctx.lineTo(Math.round(this.x1 + (this.x2 - this.x1) * g - cam.x) + 0.5, Math.round(this.y1 + (this.y2 - this.y1) * g - cam.y) + 0.5);
        ctx.stroke();
      },
    });
  };

  // 閃電：預先算好折線（不每幀重算），每 2 幀換一組抖動
  V.lightning = function (x1, y1, x2, y2, o) {
    o = o || {};
    const jitter = o.jitter === undefined ? 6 : o.jitter;
    const branches = o.branches === undefined ? 2 : (lowMode() ? 0 : o.branches);
    const segN = 7;
    function bolt(ax, ay, bx, by, j) {
      const pts = [[ax, ay]];
      for (let i = 1; i < segN; i++) {
        const t = i / segN;
        pts.push([ax + (bx - ax) * t + rnd(-j, j), ay + (by - ay) * t + rnd(-j, j)]);
      }
      pts.push([bx, by]);
      return pts;
    }
    const sets = [];
    for (let k = 0; k < 3; k++) {
      const main = bolt(x1, y1, x2, y2, jitter);
      const all = [main];
      for (let b = 0; b < branches; b++) {
        const i = 2 + ((Math.random() * (segN - 3)) | 0);
        const p0 = main[i];
        all.push(bolt(p0[0], p0[1], p0[0] + rnd(-22, 22), p0[1] + rnd(-18, 18), jitter * 0.6));
      }
      sets.push(all);
    }
    return push({
      layer: 'w', life: o.frames || 10, sets, color: o.color || '#c0f0ff',
      draw(ctx, cam) {
        const f = this.t / this.life;
        const set = this.sets[(this.t >> 1) % this.sets.length];
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? '#ffffff' : this.color;
          ctx.lineWidth = pass ? 1 : 3;
          ctx.globalAlpha = (pass ? 1 : 0.75) * (1 - f) * (this.t % 4 === 3 ? 0.55 : 1);
          for (const pts of set) {
            ctx.beginPath();
            ctx.moveTo(Math.round(pts[0][0] - cam.x) + 0.5, Math.round(pts[0][1] - cam.y) + 0.5);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(Math.round(pts[i][0] - cam.x) + 0.5, Math.round(pts[i][1] - cam.y) + 0.5);
            ctx.stroke();
          }
        }
      },
    });
  };

  V.ring = function (x, y, o) {
    o = o || {};
    const r0 = o.r0 === undefined ? 4 : o.r0, r1 = o.r1 === undefined ? 40 : o.r1;
    return push({
      layer: 'w', life: o.frames || 18, x, y, color: o.color || '#ffffff', width: o.width || 2,
      draw(ctx, cam) {
        const f = this.t / this.life;
        const r = r0 + (r1 - r0) * (1 - Math.pow(1 - f, 2));
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = this.color; ctx.lineWidth = this.width;
        ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), Math.max(0.5, r), 0, TAU); ctx.stroke();
      },
    });
  };

  // 粒子爆發：一個效果內含 n 顆粒子（不進 game.parts，效能較好）
  V.burst = function (x, y, o) {
    o = o || {};
    const n = V.pn(o.n === undefined ? 16 : o.n);
    const colors = o.colors || ['#ffffff', '#ffe040'];
    const sp = o.speed === undefined ? 2.2 : o.speed;
    const life = o.life === undefined ? 26 : o.life;
    const grav = o.grav === undefined ? 0.08 : o.grav;
    const size = o.size || 2;
    const ps = [];
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rnd(-(o.spread || 0.6), o.spread || 0.6) : rnd(0, TAU);
      const s = sp * rnd(0.35, 1);
      ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: colors[i % colors.length], s: (Math.random() < 0.4 ? size : Math.max(1, size - 1)) });
    }
    return push({
      layer: 'w', life: life + 6, ps, grav,
      up() { for (const p of this.ps) { p.x += p.vx; p.y += p.vy; p.vy += this.grav; p.vx *= 0.985; } },
      draw(ctx, cam) {
        const f = this.t / this.life;
        ctx.globalAlpha = 1 - f * f;
        for (const p of this.ps) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.s, p.s); }
      },
    });
  };

  // 魔法陣：雙圓 + 旋轉符文刻度
  V.circle = function (x, y, o) {
    o = o || {};
    const R = o.r === undefined ? 28 : o.r;
    const spin = o.spin === undefined ? 0.06 : o.spin;
    const gl = o.glyphs === undefined ? 8 : Math.max(3, o.glyphs);
    return push({
      layer: 'w', life: o.frames || 30, x, y, color: o.color || '#a0d0ff',
      draw(ctx, cam) {
        const f = this.t / this.life;
        const grow = Math.min(1, (this.t + 1) / 5);
        const a = f > 0.72 ? (1 - f) / 0.28 : 1;
        const cx = Math.round(this.x - cam.x), cy = Math.round(this.y - cam.y);
        const r = R * grow, r2 = r * 0.66;
        ctx.globalAlpha = a; ctx.strokeStyle = this.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r2, 0, TAU); ctx.stroke();
        // 符文刻度（在兩圓之間，隨時間旋轉）
        const rot = this.t * spin;
        ctx.lineWidth = 2; ctx.globalAlpha = a * 0.9;
        for (let i = 0; i < gl; i++) {
          const ang = rot + i / gl * TAU;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          ctx.beginPath();
          ctx.moveTo(cx + ca * r2, cy + sa * r2 * 0.55);
          ctx.lineTo(cx + ca * r, cy + sa * r * 0.55);
          ctx.stroke();
        }
        // 內部交叉三角（法陣感）
        ctx.lineWidth = 1; ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
          const ang = -rot + i / 3 * TAU;
          const px = cx + Math.cos(ang) * r2, py = cy + Math.sin(ang) * r2 * 0.55;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      },
    });
  };

  // 光束：dir 為 ±1（水平）或弧度角
  V.beam = function (x, y, dir, len, o) {
    o = o || {};
    const ang = (dir === 1 || dir === -1) ? (dir > 0 ? 0 : Math.PI) : dir;
    const wid = o.width === undefined ? 12 : o.width;
    const taper = o.taper === undefined ? 0.35 : o.taper;
    return push({
      layer: 'w', life: o.frames || 14, x, y, len: len || 80, color: o.color || '#ffe040',
      draw(ctx, cam) {
        const f = this.t / this.life;
        const grow = Math.min(1, (this.t + 1) / 3);
        const a = 1 - f * f;
        const w0 = wid * (1 - f * 0.5) * (0.85 + 0.3 * Math.random());
        const w1 = w0 * taper;
        const L = this.len * grow;
        ctx.save();
        ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y));
        ctx.rotate(ang);
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = a * (pass ? 1 : 0.8);
          ctx.fillStyle = pass ? '#ffffff' : this.color;
          const k = pass ? 0.45 : 1;
          ctx.beginPath();
          ctx.moveTo(0, -w0 * k / 2); ctx.lineTo(L, -w1 * k / 2);
          ctx.lineTo(L, w1 * k / 2); ctx.lineTo(0, w0 * k / 2);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      },
    });
  };

  // ---------- 實體快照（殘影用） ----------
  function snapshot(e) {
    if (!e) return null;
    let name = null;
    if (e.currentAnim) { const a = e.currentAnim(); name = a && a[0]; }
    if (!name) name = e.spr;
    if (!name || !KB.SPR[name]) return null;
    const s = KB.SPR[name];
    const tt = (e.stateT !== undefined ? e.stateT : (e.t || 0) * 60) / 60;
    const fr = KB.frameIndex(s, { t: tt, fps: e.attackFps || s.fps });
    return { spr: name, frame: fr, x: e.cx, y: e.bottom, flip: e.dir < 0 };
  }

  // 殘影：每 every 幀複製一張實體目前的精靈
  V.afterimage = function (ent, o) {
    o = o || {};
    if (!ent || lowMode()) return null;
    const every = o.every || 3, gl = o.frames || 30, ga = o.alpha === undefined ? 0.5 : o.alpha;
    const ghostLife = o.ghostLife || 12;
    return push({
      layer: 'w', life: gl, ent, ghosts: [], color: o.color || '#ffffff',
      up() {
        if (this.ent && !this.ent.dead && this.t % every === 0) {
          const s = snapshot(this.ent);
          if (s) { s.t = 0; this.ghosts.push(s); if (this.ghosts.length > 12) this.ghosts.shift(); }
        }
        for (const g of this.ghosts) g.t++;
        this.ghosts = this.ghosts.filter(g => g.t < ghostLife);
      },
      draw(ctx, cam) {
        for (const g of this.ghosts) {
          const a = ga * (1 - g.t / ghostLife);
          if (a <= 0.02) continue;
          KB.drawSpr(ctx, g.spr, g.x - cam.x, g.y - cam.y, { frame: g.frame, flip: g.flip, alpha: a, tint: this.color });
        }
      },
    });
  };

  // 跟隨實體的光環
  V.aura = function (ent, o) {
    o = o || {};
    if (!ent) return null;
    const R = o.r === undefined ? 18 : o.r, pulse = o.pulse === undefined ? 0.18 : o.pulse;
    return push({
      layer: 'w', life: o.frames || 40, ent, color: o.color || '#ffe040',
      up() { if (!this.ent || this.ent.dead) this.dead = true; },
      draw(ctx, cam) {
        const e = this.ent; if (!e) return;
        const f = this.t / this.life;
        const fade = Math.min(1, (this.t + 1) / 4) * (f > 0.75 ? (1 - f) / 0.25 : 1);
        const cx = Math.round(e.cx - cam.x), cy = Math.round(e.cy - cam.y);
        ctx.strokeStyle = this.color;
        for (let i = 0; i < 3; i++) {
          const r = R * (1 + Math.sin(this.t * pulse + i * 1.4) * 0.14) - i * 3;
          if (r <= 1) continue;
          ctx.globalAlpha = fade * (0.55 - i * 0.14);
          ctx.lineWidth = 2 - i * 0.5;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        }
      },
    });
  };

  // 彈出文字（世界座標）：放大彈入 → 上升 → 淡出
  V.textPop = function (x, y, text, o) {
    o = o || {};
    const size = o.size || 8, rise = o.rise === undefined ? 14 : o.rise;
    const outline = o.outline === undefined ? '#201828' : o.outline;
    return push({
      layer: 'w', life: o.frames || 40, x, y, text: String(text), color: o.color || '#ffffff',
      draw(ctx, cam) {
        const f = this.t / this.life;
        const pop = this.t < 5 ? 1.7 - 0.7 * (this.t / 5) : 1;
        const a = f > 0.7 ? (1 - f) / 0.3 : 1;
        // fix5b / R5-P2-08：世界座標的文字靠近房間左右邊界時會被畫面切掉
        // （gunner 的「BULLET TIME」實測只剩「ULLET TIME」）。這裡把整串字夾回畫面內 ——
        // 而且要連「必殺演出的 zoom」一起算：'w' 層是以卡比為中心放大後才畫的，
        // 光夾住未放大的座標，放大後照樣會被推出畫面。位置仍跟著角色，手感不變。
        const TW = (KB.UI && KB.UI.textWidth) ? KB.UI.textWidth : KB.textWidth;
        let px = Math.round(this.x - cam.x);
        if (TW) {
          const half = TW(this.text, { size }) * pop / 2 + 2;
          const k = zoomK();
          const pl = KB.game && KB.game.player;
          const zx = pl ? Math.round(pl.cx - cam.x) : KB.W / 2;
          const lo = zx + (1 - zx) / k + half, hi = zx + (KB.W - 1 - zx) / k - half;
          px = lo > hi ? Math.round((lo + hi) / 2) : Math.round(Math.max(lo, Math.min(hi, px)));
        }
        const py = Math.round(this.y - cam.y - rise * Math.min(1, this.t / (this.life * 0.7)));
        ctx.save();
        ctx.globalAlpha = clamp01(a);
        ctx.translate(px, py); ctx.scale(pop, pop);
        const T = (KB.UI && KB.UI.text) ? KB.UI.text : KB.text;
        T(ctx, this.text, 0, 0, { color: this.color, align: 'center', size, outline: outline || undefined });
        ctx.restore();
      },
    });
  };

  // 地面衝擊波（往 dir 前進）
  V.shockwave = function (x, y, o) {
    o = o || {};
    const dir = o.dir === undefined ? 1 : o.dir;
    const spd = o.speed === undefined ? 3.4 : o.speed;
    const w = o.w === undefined ? 12 : o.w, h = o.h === undefined ? 14 : o.h;
    const N = 7, jit = [];
    for (let i = 0; i < N; i++) jit.push(rnd(0.65, 1.15));
    // 幾顆被掀起來的碎屑
    const deb = [];
    for (let i = 0; i < V.pn(5); i++) deb.push({ o: rnd(0, 10), vy: rnd(-1.9, -0.9), y: 0, s: Math.random() < 0.5 ? 1 : 2 });
    return push({
      layer: 'w', life: o.frames || 22, x, y, color: o.color || '#f0e0c0', dx: 0, jit, deb,
      up() {
        this.dx += spd;
        for (const d of this.deb) { d.y += d.vy; d.vy += 0.22; }
      },
      draw(ctx, cam) {
        const f = this.t / this.life;
        const bx = Math.round(this.x + this.dx * dir - cam.x), by = Math.round(this.y - cam.y);
        const decay = 1 - f * 0.55;
        const cw = Math.max(1, Math.round(w * 0.3));
        ctx.globalAlpha = (1 - f) * 0.75;
        // 由前往後遞減的鋸齒塵浪（像地面被掀起來往前推）
        ctx.fillStyle = this.color;
        for (let i = 0; i < N; i++) {
          const hh = Math.round(h * decay * Math.pow(1 - i / N, 1.5) * this.jit[i]);
          if (hh <= 0) continue;
          const ox = bx - dir * i * cw - (dir > 0 ? 0 : cw);
          ctx.fillRect(ox, by - hh, cw, hh);
        }
        // 白色波前
        ctx.globalAlpha = (1 - f) * 0.85;
        ctx.fillStyle = '#ffffff';
        const fh = Math.round(h * decay * this.jit[0]);
        ctx.fillRect(bx + (dir > 0 ? 0 : -2), by - fh, 2, fh);
        ctx.fillRect(bx + (dir > 0 ? -1 : -cw), by - 1, cw + 1, 1);
        // 掀起的碎屑
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = this.color;
        for (const d of this.deb) ctx.fillRect(bx - dir * Math.round(d.o), by + Math.round(d.y) - 2, d.s, d.s);
      },
    });
  };

  // 跟隨拖尾
  V.sparkTrail = function (ent, o) {
    o = o || {};
    if (!ent) return null;
    const every = o.every || 2, plife = o.life || 14;
    const colors = Array.isArray(o.color) ? o.color : [o.color || '#ffffff'];
    return push({
      layer: 'w', life: o.frames || 40, ent, ps: [],
      up() {
        const e = this.ent;
        if (e && !e.dead && this.t % every === 0) {
          this.ps.push({ x: e.cx + rnd(-4, 4), y: e.cy + rnd(-5, 5), vx: rnd(-0.3, 0.3), vy: rnd(-0.4, 0.1), t: 0, c: colors[(Math.random() * colors.length) | 0] });
          if (this.ps.length > 40) this.ps.shift();
        }
        for (const p of this.ps) { p.x += p.vx; p.y += p.vy; p.t++; }
        this.ps = this.ps.filter(p => p.t < plife);
      },
      draw(ctx, cam) {
        for (const p of this.ps) {
          ctx.globalAlpha = 1 - p.t / plife;
          ctx.fillStyle = p.c;
          const s = p.t < plife * 0.4 ? 2 : 1;
          ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), s, s);
        }
      },
    });
  };

  // =========================================================================
  // 演出：變身 / 解除
  // =========================================================================
  const abColor = key => {
    const d = KB.ABILITIES && KB.ABILITIES[key];
    return (d && d.color) || '#ffe040';
  };

  V.transform = function (player, key, o) {
    o = o || {};
    const p = player || KB.player;
    if (!p || !KB.game) return null;
    const d = (KB.ABILITIES && KB.ABILITIES[key]) || {};
    const color = o.color || abColor(key);
    const name = o.name || d.name || (KB.ABILITY_NAMES && KB.ABILITY_NAMES[key]) || '';
    const hud = d.hudName || (KB.ABILITY_HUD && KB.ABILITY_HUD[key]) || String(key || '').toUpperCase();
    const cx = p.cx, cy = p.cy;

    // 注意：hitstop 期間 game.update 直接 return，KB.VFX.update 不會被呼叫，
    // 所以「白閃 / 黑邊 / 橫幅」延到 ctrl.t === 2（＝停格結束後的第 2 個更新幀）才放，
    // 停格那 10 幀看到的是「放射光線 + 白色剪影 + ring + 粒子」定格畫面。
    // fix5b / R5-P2-14：台座密集處（w5 r4 武器庫 4 座並排）連續取得兩個能力時，
    // 舊橫幅要 10~20 幀後才換掉，會出現「橫幅寫 FIRE、HUD 已經是 MECH」。
    // 新的變身先把上一輪的橫幅與還沒放出橫幅的變身演出一起收掉。
    dropKind('banner'); dropKind('transform');
    if (o.hitstop !== false) V.hitstop(10);
    V.shake(o.hitstop === false ? 4 : 7);
    V.zoom(1.18, 14);
    V.worldTint('#ffffff', 0.3, 26);
    V.ring(cx, cy, { r0: 4, r1: 52, frames: 22, color, width: 3 });
    V.burst(cx, cy, { n: 24, colors: [color, '#ffffff', '#ffe040'], speed: 3.2, life: 30, grav: 0.04, size: 3 });
    V.circle(cx, cy + 8, { r: 34, frames: 40, color, spin: 0.08, glyphs: 10 });

    // 主控效果：剪影閃 3 次 + 12 條放射光線 + 第二圈 ring
    const ctrl = push({
      layer: 'w', kind: 'transform', life: 46, p, color, cx, cy, name, hud,
      up() {
        const pp = this.p;
        if (pp && !pp.dead) { this.cx = pp.cx; this.cy = pp.cy; }
        if (this.t === 2) {
          V.flash('#ffffff', 10, 0.8);
          V.letterbox(70);
          V.banner(this.name, this.hud, this.color);
        }
        if (this.t === 8) V.ring(this.cx, this.cy, { r0: 6, r1: 66, frames: 24, color: '#ffffff', width: 2 });
        if (this.t === 14) V.burst(this.cx, this.cy, { n: 16, colors: [this.color, '#ffffff'], speed: 2.2, life: 26, grav: -0.02, size: 2 });
        if (this.t === 20) V.ring(this.cx, this.cy, { r0: 4, r1: 44, frames: 20, color: this.color, width: 2 });
      },
      draw(ctx, cam) {
        const f = this.t / this.life;
        // 12 條放射光線
        const n = 12, r0 = 8 + this.t * 1.6, r1 = r0 + 18 * (1 - f);
        ctx.globalAlpha = Math.max(0, 0.9 * (1 - f));
        ctx.lineCap = 'round';
        const sx = Math.round(this.cx - cam.x), sy = Math.round(this.cy - cam.y);
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + this.t * 0.03;
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.strokeStyle = (i & 1) ? '#ffffff' : this.color;
          ctx.lineWidth = (i & 1) ? 2 : 3;
          ctx.beginPath();
          ctx.moveTo(sx + ca * r0, sy + sa * r0);
          ctx.lineTo(sx + ca * r1, sy + sa * r1);
          ctx.stroke();
        }
        // 白色剪影閃 3 次（第 0~3、8~11、16~19 幀）
        const ph = this.t % 8;
        if (this.t < 24 && ph < 4) {
          const pp = this.p, s = snapshot(pp);
          if (s) {
            const k = 1 + (3 - ph) * 0.06;
            KB.drawSpr(ctx, s.spr, s.x - cam.x, s.y - cam.y, {
              frame: s.frame, flip: s.flip, tint: (this.t < 8 ? '#ffffff' : this.color),
              alpha: 0.85, scaleX: k, scaleY: k,
            });
          }
        }
      },
    });

    return ctrl;   // 名稱橫幅由 ctrl.up() 在停格結束後放出
  };

  // 名稱橫幅（也可單獨呼叫：必殺技名等）
  V.banner = function (name, sub, color) {
    color = color || '#ffe040';
    const IN = 10, HOLD = 40, OUT = 12;
    dropKind('banner');   // fix5b / R5-P2-14：同時間只留一條橫幅（連續取得能力時舊的要馬上換掉）
    return push({
      layer: 's', kind: 'banner', life: IN + HOLD + OUT, name: String(name || ''), sub: String(sub || ''),
      draw(ctx) {
        let k = 1, a = 1;
        if (this.t < IN) { const f = this.t / IN; k = 0.25 + 0.85 * f; if (f > 0.8) k = 1.1 - (f - 0.8) * 0.5; a = f; }
        else if (this.t > IN + HOLD) { const f = (this.t - IN - HOLD) / OUT; a = 1 - f; k = 1 + f * 0.15; }
        // 開場「WORLD n」橫幅（y≈20~80）還在畫面上時，變身橫幅下移避免重疊
        const bb = (KB.UI && KB.UI.bannerBottom && KB.game) ? KB.UI.bannerBottom(KB.game) : 0;
        const cx = KB.W / 2, cy = bb > 0 ? 122 : 78;
        ctx.save();
        ctx.globalAlpha = clamp01(a) * 0.62;
        ctx.fillStyle = '#000000';
        const bh = Math.round(34 * Math.min(1, k));
        ctx.fillRect(0, Math.round(cy - bh / 2), KB.W, bh);
        ctx.globalAlpha = clamp01(a);
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(cy - bh / 2) + 0.5); ctx.lineTo(KB.W, Math.round(cy - bh / 2) + 0.5);
        ctx.moveTo(0, Math.round(cy + bh / 2) - 0.5); ctx.lineTo(KB.W, Math.round(cy + bh / 2) - 0.5);
        ctx.stroke();
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        const T = (KB.UI && KB.UI.text) ? KB.UI.text : KB.text;
        if (this.name) T(ctx, this.name, 0, -14, { color: '#ffffff', align: 'center', size: 16, outline: '#201018' });
        if (this.sub) KB.text(ctx, this.sub, 0, 5, { color, align: 'center', outline: '#201018' });
        ctx.restore();
      },
    });
  };

  // 解除變身：灰色煙 + 帽子飛走殘影
  V.untransform = function (player, key) {
    const p = player || KB.player;
    if (!p || !KB.game) return null;
    key = key || p.ability;
    const d = (KB.ABILITIES && KB.ABILITIES[key]) || {};
    const hat = d.hat || ('hat_' + key);
    V.burst(p.cx, p.cy, { n: 12, colors: ['#c0c0c8', '#a0a0a8', '#e0e0e8'], speed: 1.3, life: 26, grav: -0.03, size: 2 });
    V.ring(p.cx, p.cy, { r0: 2, r1: 22, frames: 14, color: '#c8c8d0', width: 2 });
    if (!KB.has || !KB.has(hat)) return null;
    const dir = -(p.dir || 1);
    return push({
      layer: 'w', life: 30, x: p.cx, y: p.y + 2, vx: dir * 1.7, vy: -2.4, rot: 0,
      up() { this.x += this.vx; this.y += this.vy; this.vy += 0.13; this.rot += dir * 0.22; },
      draw(ctx, cam) {
        const f = this.t / this.life;
        KB.drawSpr(ctx, hat, this.x - cam.x, this.y - cam.y, { alpha: 1 - f, rot: this.rot });
      },
    });
  };

  // 蓄力完成的共用演出（各能力呼叫）
  V.chargeReady = function (x, y, color) {
    color = color || '#ffe040';
    V.flash(color, 5, 0.4);
    V.ring(x, y, { r0: 6, r1: 34, frames: 16, color, width: 2 });
    V.textPop(x, y - 18, 'MAX!', { color, size: 8, frames: 34, rise: 12 });
    return null;
  };
})();
