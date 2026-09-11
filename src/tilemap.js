// 磁磚地圖 + AABB 物理（含 45° 斜坡、單向平台、水、梯子）
(function () {
  const T = KB.TILE;
  const SOLID = { '#': 1, '*': 1, 'B': 1 };
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

    // 破壞方塊（星星 / 炸彈），回傳是否有破壞
    breakBlock(tx, ty, byBomb) {
      const ch = this.get(tx, ty);
      if (ch !== '*' && ch !== 'B') return false;
      this.set(tx, ty, '.');
      const cx = tx * T + 8, cy = ty * T + 8;
      if (KB.fx) KB.fx('fx_blockbreak', cx, cy + 8);
      if (KB.particles) KB.particles(cx, cy, ch === 'B' ? '#f8e040' : '#ffd040', 8, { spread: 2.5 });
      if (KB.audio) KB.audio.sfx('block');
      if (ch === 'B') {
        // 連鎖：相鄰炸彈方塊與星星方塊延遲爆破
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.get(tx + dx, ty + dy);
          if (n === 'B' || n === '*') this.pending.push({ tx: tx + dx, ty: ty + dy, t: 6 });
        }
        if (KB.game) KB.game.shake = Math.max(KB.game.shake || 0, 6);
      }
      if (KB.game && KB.game.onBlockBroken) KB.game.onBlockBroken(tx, ty, ch);
      return true;
    }
    update() {
      this.anim++;
      if (this.pending.length) {
        const left = [];
        for (const p of this.pending) { p.t--; if (p.t <= 0) this.breakBlock(p.tx, p.ty, true); else left.push(p); }
        this.pending = left;
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
        if (nm) KB.drawSpr(ctx, nm, tx * T - cam.x, ty * T - cam.y, { anchor: 'topleft', t, frame: KB.SPR[nm] && KB.SPR[nm].n > 1 ? Math.floor(t * 4) % KB.SPR[nm].n : undefined, _tl: true });
      }
    }
    drawWater(ctx, cam, t) {
      const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.w - 1, Math.floor((cam.x + KB.W) / T) + 1);
      const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.h - 1, Math.floor((cam.y + KB.VIEW_H) / T) + 1);
      ctx.save(); ctx.globalAlpha = 0.72;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (this.rows[ty][tx] !== '~') continue;
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
