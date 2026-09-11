// 磁磚地圖 + AABB 物理（含 45° 斜坡、單向平台、水、梯子）
(function () {
  const T = KB.TILE;
  // 機關磁磚（mechanics）：X 硬磚（實心、只有重擊打得破）、I 冰磚（實心、火焰可融）、F 導火線（可通行）
  const SOLID = { '#': 1, '*': 1, 'B': 1, 'X': 1, 'I': 1 };
  const SLOPE = { '/': 1, '\\': 1 };

  class TileMap {
    constructor(rows, deco) {
      const w = Math.max(...rows.map(r => r.length));
      this.w = w; this.h = rows.length;
      this.rows = rows.map(r => r.padEnd(w, '.').split(''));
      this.deco = deco ? deco.map(r => r.padEnd(w, '.').split('')) : null;
      this.pw = w * T; this.ph = this.h * T;
      this.anim = 0;
      this.pending = []; // 炸彈方塊連鎖
      this.burning = new Map();  // 燃燒中的導火線 'tx,ty' -> {tx,ty,t}
      this.melting = new Map();  // 融化中的冰磚     'tx,ty' -> {tx,ty,t}
      this.clinkT = 0;           // 硬磚「叮」音效冷卻
    }
    get(tx, ty) {
      if (tx < 0 || tx >= this.w) return '#';
      if (ty < 0) return '.';
      if (ty >= this.h) return '.';
      return this.rows[ty][tx];
    }
    set(tx, ty, ch) { if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) this.rows[ty][tx] = ch; }
    at(px, py) { return this.get(Math.floor(px / T), Math.floor(py / T)); }
    static isSolid(ch) { return !!SOLID[ch]; }
    static isSlope(ch) { return !!SLOPE[ch]; }
    static isGround(ch) { return !!SOLID[ch] || !!SLOPE[ch]; }
    // 硬磚 X 的破壞條件：鐵鎚 / 石頭 / 火焰衝刺（判定框自帶 breakHard）/ 傷害 ≥ 5 的重擊
    static hardBreakable(a) {
      if (!a) return false;
      return a.kind === 'hammer' || a.kind === 'stone' || !!a.breakHard || (a.dmg || 0) >= 5;
    }
    isSolidPx(px, py) {
      const ch = this.at(px, py);
      if (SOLID[ch]) return true;
      if (SLOPE[ch]) {
        const lx = ((px % T) + T) % T, ly = ((py % T) + T) % T;
        return ch === '/' ? (lx + ly >= T - 1) : (ly >= lx);
      }
      return false;
    }
    // 斜坡表面 y（世界 px）；非斜坡回傳 null
    slopeSurface(px, ty) {
      const tx = Math.floor(px / T), ch = this.get(tx, ty);
      if (!SLOPE[ch]) return null;
      const lx = Math.floor(((px % T) + T) % T);
      return ch === '/' ? ty * T + (T - 1 - lx) : ty * T + lx;
    }
    inWater(px, py) { return this.at(px, py) === '~'; }
    onLadder(px, py) { return this.at(px, py) === 'H'; }
    isSpike(px, py) { return this.at(px, py) === '^'; }

    // 破壞方塊（星星 / 炸彈 / 硬磚 / 冰磚），回傳是否有破壞
    breakBlock(tx, ty, byBomb) {
      const ch = this.get(tx, ty);
      if (ch !== '*' && ch !== 'B' && ch !== 'X' && ch !== 'I') return false;
      this.set(tx, ty, '.');
      const k = tx + ',' + ty;
      this.burning.delete(k); this.melting.delete(k);
      const cx = tx * T + 8, cy = ty * T + 8;
      if (KB.fx) KB.fx('fx_blockbreak', cx, cy + 8);
      const col = ch === 'B' ? '#f8e040' : ch === 'X' ? ['#d0d0dc', '#a8a8b0', '#585860'] : ch === 'I' ? ['#ffffff', '#c0f0ff', '#78d8f8'] : '#ffd040';
      if (KB.particles) KB.particles(cx, cy, col, ch === 'X' ? 12 : 8, { spread: 2.5 });
      if (KB.audio) KB.audio.sfx(ch === 'I' ? 'melt' : 'block');
      if (ch === 'B') {
        // 連鎖：相鄰炸彈方塊 / 星星方塊 / 硬磚延遲爆破
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.get(tx + dx, ty + dy);
          if (n === 'B' || n === '*' || n === 'X') this.pending.push({ tx: tx + dx, ty: ty + dy, t: 6 });
        }
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 6);
      }
      if (KB.game && KB.game.onBlockBroken) KB.game.onBlockBroken(tx, ty, ch);
      return true;
    }
    // ---------- 機關磁磚 ----------
    // 導火線 F：被火焰類判定點燃 → 每 6 幀往相鄰 F 延伸；燒到 B / * 就引爆（沿用 breakBlock 連鎖）
    igniteFuse(tx, ty) {
      if (this.get(tx, ty) !== 'F') return false;
      const k = tx + ',' + ty;
      if (this.burning.has(k)) return false;
      this.burning.set(k, { tx, ty, t: 6 });
      if (KB.audio) KB.audio.sfx('fuse');
      if (KB.particles) KB.particles(tx * T + 8, ty * T + 8, ['#ffe040', '#ff9020'], 4, { spread: 1, grav: -0.04, life: 14, up: 0.3, size: 1 });
      return true;
    }
    // 冰磚 I：被火焰類判定命中 → 20 幀後融化消失
    meltIce(tx, ty) {
      if (this.get(tx, ty) !== 'I') return false;
      const k = tx + ',' + ty;
      if (this.melting.has(k)) return false;
      this.melting.set(k, { tx, ty, t: 20 });
      if (KB.audio) KB.audio.sfx('melt');
      return true;
    }
    // 硬磚 X：打不破時的「叮」＋火花（10 幀冷卻，避免每幀重複）
    clink(tx, ty) {
      if (this.clinkT > 0) return false;
      this.clinkT = 10;
      const cx = tx * T + 8, cy = ty * T + 8;
      if (KB.audio) KB.audio.sfx('hardblock');
      if (KB.fx) KB.fx('fx_hit', cx, cy);
      if (KB.particles) KB.particles(cx, cy, ['#ffffff', '#fff8a0', '#d0d0dc'], 7, { spread: 2.2, life: 16, size: 1 });
      return true;
    }
    update() {
      this.anim++;
      if (this.clinkT > 0) this.clinkT--;
      if (this.pending.length) {
        const left = [];
        for (const p of this.pending) { p.t--; if (p.t <= 0) this.breakBlock(p.tx, p.ty, true); else left.push(p); }
        this.pending = left;
      }
      if (this.burning.size) {
        for (const [k, b] of Array.from(this.burning)) {
          b.t--;
          if (KB.particles && (b.t & 1) === 0) KB.particles(b.tx * T + 8, b.ty * T + 8, ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.7, grav: -0.05, life: 12, up: 0.3, size: 1 });
          if (b.t > 0) continue;
          this.burning.delete(k);
          if (this.get(b.tx, b.ty) === 'F') this.set(b.tx, b.ty, '.');
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = this.get(b.tx + dx, b.ty + dy);
            if (n === 'F') this.igniteFuse(b.tx + dx, b.ty + dy);
            else if (n === 'B' || n === '*') this.pending.push({ tx: b.tx + dx, ty: b.ty + dy, t: 3 });
          }
        }
      }
      if (this.melting.size) {
        for (const [k, m] of Array.from(this.melting)) {
          m.t--;
          if (KB.particles && m.t % 4 === 0) KB.particles(m.tx * T + 8, m.ty * T + 8, ['#ffffff', '#c0f0ff', '#78d8f8'], 2, { spread: 1.2, life: 18, up: 0.2, size: 1 });
          if (m.t > 0) continue;
          this.melting.delete(k);
          if (this.get(m.tx, m.ty) !== 'I') continue;
          this.set(m.tx, m.ty, '.');
          if (KB.particles) KB.particles(m.tx * T + 8, m.ty * T + 8, ['#ffffff', '#c0f0ff', '#78d8f8'], 12, { spread: 2.2, life: 26 });
          if (KB.fx) KB.fx('fx_poof', m.tx * T + 8, m.ty * T + 8);
          if (KB.audio) KB.audio.sfx('melt');
        }
      }
    }

    // 選擇磁磚精靈名稱
    tileSprite(tx, ty, theme) {
      const ch = this.get(tx, ty);
      const g = (x, y) => TileMap.isGround(this.get(x, y));
      const pick = k => KB.has('tile_' + theme + '_' + k) ? 'tile_' + theme + '_' + k : 'tile_green_' + k;
      switch (ch) {
        case '#': {
          const up = g(tx, ty - 1), dn = g(tx, ty + 1), lf = g(tx - 1, ty), rt = g(tx + 1, ty);
          if (!up) { if (!lf && KB.has('tile_' + theme + '_topL')) return pick('topL'); if (!rt && KB.has('tile_' + theme + '_topR')) return pick('topR'); return pick('top'); }
          if (!lf && KB.has('tile_' + theme + '_left')) return pick('left');
          if (!rt && KB.has('tile_' + theme + '_right')) return pick('right');
          if (!dn && KB.has('tile_' + theme + '_bottom')) return pick('bottom');
          return pick('fill');
        }
        case '=': return pick('platform');
        case '/': return pick('slopeL');
        case '\\': return pick('slopeR');
        case '*': return 'tile_star';
        case 'B': return 'tile_bomb';
        case 'X': return 'tile_hardblock';
        case 'I': return 'tile_iceblock';
        case 'F': {
          if (this.burning.has(tx + ',' + ty)) return 'tile_fuse_burn';
          const lf = this.get(tx - 1, ty), rt = this.get(tx + 1, ty);
          const horiz = lf === 'F' || rt === 'F' || lf === 'B' || rt === 'B' || lf === '*' || rt === '*';
          return horiz ? 'tile_fuse' : 'tile_fuse_v';
        }
        case '^': return 'tile_spike';
        case '~': return this.get(tx, ty - 1) === '~' ? 'tile_water' : 'tile_water_top';
        case 'H': return 'tile_ladder';
      }
      return null;
    }

    draw(ctx, cam, theme, t) {
      const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.w - 1, Math.floor((cam.x + KB.W) / T) + 1);
      const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.h - 1, Math.floor((cam.y + KB.VIEW_H) / T) + 1);
      // 裝飾層先畫（在磁磚後面）
      if (this.deco) {
        for (let ty = y0 - 3; ty <= y1; ty++) for (let tx = x0 - 2; tx <= x1 + 2; tx++) {
          if (ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) continue;
          const ch = this.deco[ty][tx]; if (ch === '.' || ch === ' ') continue;
          const nm = KB.has('deco_' + theme + '_' + ch) ? 'deco_' + theme + '_' + ch : (KB.has('deco_' + ch) ? 'deco_' + ch : null);
          if (nm) KB.drawSpr(ctx, nm, tx * T + 8 - cam.x, ty * T + T - cam.y, { t });
        }
      }
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = this.rows[ty][tx];
        if (ch === '.' || ch === ' ') continue;
        if (ch === '~') {
          // 水：半透明疊在最後（見 drawWater）
          continue;
        }
        const nm = this.tileSprite(tx, ty, theme);
        if (!nm) continue;
        const o = { anchor: 'topleft', t, frame: KB.SPR[nm] && KB.SPR[nm].n > 1 ? Math.floor(t * (nm === 'tile_fuse_burn' ? 12 : 4)) % KB.SPR[nm].n : undefined, _tl: true };
        // 融化中的冰磚：逐漸透明 + 抖動閃爍
        if (this.melting.size && ch === 'I') {
          const m = this.melting.get(tx + ',' + ty);
          if (m) o.alpha = Math.max(0.15, Math.min(1, 0.3 + 0.7 * (m.t / 20) + ((m.t & 3) < 2 ? 0.12 : 0)));
        }
        KB.drawSpr(ctx, nm, tx * T - cam.x, ty * T - cam.y, o);
      }
    }
    drawWater(ctx, cam, t) {
      const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.w - 1, Math.floor((cam.x + KB.W) / T) + 1);
      const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.h - 1, Math.floor((cam.y + KB.VIEW_H) / T) + 1);
      // R2-P1-14：0.72 的水層會把水中的卡比 / 敵人壓成同一個青藍色。
      // 水體本身降到 0.45（粉紅的卡比看得出來），最上面一排（水面）保留 0.66 讓水面亮線仍然清楚。
      ctx.save();
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (this.rows[ty][tx] !== '~') continue;
        const surface = ty === 0 || this.rows[ty - 1][tx] !== '~';
        ctx.globalAlpha = surface ? 0.66 : 0.45;
        const nm = this.tileSprite(tx, ty, 'green');
        KB.drawSpr(ctx, nm, tx * T - cam.x, ty * T - cam.y, { frame: KB.SPR[nm] && KB.SPR[nm].n > 1 ? Math.floor(t * 3) % KB.SPR[nm].n : undefined, _tl: true });
      }
      ctx.restore();
    }
  }
  KB.TileMap = TileMap;

  // 磁磚精靈以左上為錨點：drawSpr 預設錨點是 bottom，所以此處包一層
  const _drawSpr = KB.drawSpr;
  KB.drawSpr = function (ctx, name, x, y, opts) {
    if (opts && opts._tl) {
      const s = KB.SPR[name]; if (s) { const f = s.frames[KB.frameIndex(s, opts)]; x += f.ax; y += f.ay; }
      else { x += 8; y += 16; }
    }
    return _drawSpr(ctx, name, x, y, opts);
  };

  // ---------- 物理 ----------
  KB.physics = {
    /**
     * e: {x,y,w,h,vx,vy,grav,maxFall,onGround,dropThrough}
     * 回傳 e，並設定 e.onGround / e.hitWall / e.hitCeil / e.onSlope
     */
    step(e, map) {
      const wasOnGround = e.onGround;
      e.hitWall = false; e.hitCeil = false; e.onSlope = false;
      if (e.grav) e.vy = Math.min(e.vy + e.grav, e.maxFall !== undefined ? e.maxFall : KB.MAXFALL);
      // ---- 水平 ----
      if (e.vx !== 0) {
        let nx = e.x + e.vx;
        // stepH：忽略身體最下方幾 px 的牆壁判定（讓斜坡旁的實心磚不會卡住腳）
        const stepH = e.stepH !== undefined ? Math.min(e.stepH, Math.floor(e.h / 2)) : 0;
        const top = e.y + 1, bot = e.y + e.h - 1 - stepH;
        if (e.vx > 0) {
          const edge = nx + e.w - 1;
          if (this.columnSolid(map, edge, top, bot)) { nx = Math.floor(edge / T) * T - e.w; e.vx = 0; e.hitWall = true; }
        } else {
          const edge = nx;
          if (this.columnSolid(map, edge, top, bot)) { nx = (Math.floor(edge / T) + 1) * T; e.vx = 0; e.hitWall = true; }
        }
        e.x = nx;
      }
      // ---- 垂直 ----
      const prevBottom = e.y + e.h;
      e.y += e.vy;
      e.onGround = false;
      const cx = e.x + e.w / 2;
      if (e.vy >= 0) {
        const bottom = e.y + e.h;
        // 斜坡（以中心點）
        let sy = this.slopeAt(map, cx, bottom - 1);
        if (sy === null) sy = this.slopeAt(map, cx, bottom);
        if (sy === null && wasOnGround) sy = this.slopeAt(map, cx, bottom + 4);
        if (sy !== null && bottom >= sy - 3 && bottom <= sy + 9) {
          e.y = sy - e.h; e.vy = 0; e.onGround = true; e.onSlope = true;
        } else {
          // 一般地面 / 平台 / 梯子頂端
          const feet = [e.x + 1, e.x + e.w - 2];
          let landed = false;
          for (const fx of feet) {
            const ty = Math.floor(bottom / T), tx = Math.floor(fx / T), ch = map.get(tx, ty);
            if (SOLID[ch] && !SLOPE[map.get(Math.floor(cx / T), ty)]) {
              if (prevBottom <= ty * T + 8) { e.y = ty * T - e.h; landed = true; }
            } else if ((ch === '=' || (ch === 'H' && map.get(tx, ty - 1) !== 'H')) && !e.dropThrough && prevBottom <= ty * T + 1 && e.vy >= 0) {
              e.y = ty * T - e.h; landed = true;
            }
          }
          if (!landed && wasOnGround && e.vy > 0 && e.vy <= 3 && !e.dropThrough) {
            // 走下斜坡 / 小落差時貼地
            const s2 = this.slopeAt(map, cx, bottom + 6);
            if (s2 !== null && s2 >= bottom - 1) { e.y = s2 - e.h; landed = true; e.onSlope = true; }
          }
          if (landed) { e.vy = 0; e.onGround = true; }
        }
      } else {
        // 上升：撞頭
        const topY = e.y;
        for (const hx of [e.x + 1, e.x + e.w - 2]) {
          if (map.isSolidPx(hx, topY) && !SLOPE[map.at(hx, topY)]) { e.y = (Math.floor(topY / T) + 1) * T; e.vy = 0; e.hitCeil = true; break; }
        }
      }
      // 卡進實心磁磚時往上推（安全處理）
      if (e.onGround === false && e.vy >= 0) {
        // nothing
      }
      e.fellOut = e.y > map.ph + 48;
      return e;
    },
    columnSolid(map, px, y0, y1) {
      const tx = Math.floor(px / T);
      for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) {
        const ch = map.get(tx, ty);
        if (SOLID[ch]) return true;
      }
      return false;
    },
    slopeAt(map, px, py) {
      const ty = Math.floor(py / T);
      return map.slopeSurface(px, ty);
    },
    // 是否踩在地上（不移動的檢查）
    groundBelow(map, e) {
      const bottom = e.y + e.h, cx = e.x + e.w / 2;
      if (map.slopeSurface(cx, Math.floor(bottom / T)) !== null) return true;
      for (const fx of [e.x + 1, e.x + e.w - 2]) {
        const tx = Math.floor(fx / T), ty = Math.floor(bottom / T), ch = map.get(tx, ty);
        if (SOLID[ch] || ch === '=' || (ch === 'H' && map.get(tx, ty - 1) !== 'H')) return true;
      }
      return false;
    },
    // 往下 dist px 內是否有可落腳的表面（jump buffer 用）；表面必須在腳底或更下方
    groundWithin(map, e, dist) {
      const bottom = e.y + e.h, cx = e.x + e.w / 2, y1 = bottom + dist;
      for (let ty = Math.floor(bottom / T); ty <= Math.floor(y1 / T); ty++) {
        const s = map.slopeSurface(cx, ty);
        if (s !== null && s >= bottom - 1 && s <= y1) return true;
        if (ty * T < bottom - 1) continue;   // 磁磚表面在腳上方 → 不算
        for (const fx of [e.x + 1, e.x + e.w - 2]) {
          const tx = Math.floor(fx / T), ch = map.get(tx, ty);
          if (SOLID[ch] || ch === '=' || (ch === 'H' && map.get(tx, ty - 1) !== 'H')) return true;
        }
      }
      return false;
    },
    // 腳下是否只踩在單向平台 / 梯子頂端（可穿下去），實心磚 / 斜坡則回傳 false
    onPlatformOnly(map, e) {
      const bottom = e.y + e.h, cx = e.x + e.w / 2;
      if (map.slopeSurface(cx, Math.floor(bottom / T)) !== null) return false;
      let plat = false;
      for (const fx of [e.x + 1, e.x + e.w - 2]) {
        const tx = Math.floor(fx / T), ty = Math.floor(bottom / T), ch = map.get(tx, ty);
        if (SOLID[ch] || SLOPE[ch]) return false;
        if (ch === '=' || (ch === 'H' && map.get(tx, ty - 1) !== 'H')) plat = true;
      }
      return plat;
    },
    // 前方是否有懸崖（用於敵人 AI）
    edgeAhead(map, e) {
      const px = e.dir > 0 ? e.x + e.w + 2 : e.x - 2, py = e.y + e.h + 2;
      const ch = map.at(px, py);
      return !(SOLID[ch] || SLOPE[ch] || ch === '=');
    },
    wallAhead(map, e) {
      const px = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
      return this.columnSolid(map, px, e.y + 2, e.y + e.h - 2);
    },
  };
})();
