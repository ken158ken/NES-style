// 磁磚地圖 + AABB 物理（含 45° 斜坡、單向平台、水、梯子）
(function () {
  const T = KB.TILE;
  // 機關磁磚（mechanics）：X 硬磚（實心、只有重擊打得破）、I 冰磚（實心、火焰可融）、F 導火線（可通行）
  // W 木箱（Round 6 elements）：實心、可站；火燒 40 幀燒毀、鎚 / 石頭類重擊砸得破
  const SOLID = { '#': 1, '*': 1, 'B': 1, 'X': 1, 'I': 1, 'W': 1 };
  const SLOPE = { '/': 1, '\\': 1 };
  const ICE_SLIDE = 0.82;   // 冰面動量保留率（0=一般地面、越大越滑）
  // 單向平台（可從下方穿過、從上方站上去）：'=' 平台、'H' 梯子頂端、結冰的水面（elements）
  const isPlat = (map, tx, ty, ch) =>
    ch === '=' || (ch === 'H' && map.get(tx, ty - 1) !== 'H') || (ch === '~' && map.iceWater.has(tx + ',' + ty));

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
      // ---- Round 6 元素反應（詳見 src/elements.js）----
      this.decoFire = new Map(); // 燃燒中的草 / 花 deco 'tx,ty' -> {tx,ty,t,spread,step,dmgT}
      this.decoChar = new Map(); // 焦黑中的 deco        'tx,ty' -> 剩餘幀數（30 秒後恢復）
      this.woodFire = new Map(); // 燃燒中的木箱 W       'tx,ty' -> {tx,ty,t}
      this.iceWater = new Map(); // 結冰的水面           'tx,ty' -> 剩餘幀數（8 秒）
      this.shockT = 0; this.shockCool = 0; this.shockCells = [];  // 電擊水域
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
      if (ch !== '*' && ch !== 'B' && ch !== 'X' && ch !== 'I' && ch !== 'W') return false;
      this.set(tx, ty, '.');
      const k = tx + ',' + ty;
      this.burning.delete(k); this.melting.delete(k); this.woodFire.delete(k);
      const cx = tx * T + 8, cy = ty * T + 8;
      if (KB.fx) KB.fx('fx_blockbreak', cx, cy + 8);
      const col = ch === 'B' ? '#f8e040' : ch === 'X' ? ['#d0d0dc', '#a8a8b0', '#585860'] : ch === 'I' ? ['#ffffff', '#c0f0ff', '#78d8f8'] : ch === 'W' ? ['#c88850', '#905828', '#e8b070'] : '#ffd040';
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
    // ---------- 元素反應（Round 6 elements；分類與弱點規則在 src/elements.js）----------
    get themeName() {
      return (KB.game && KB.game.theme) || (KB.game && KB.game.level && KB.game.level.theme) || 'green';
    }
    decoCh(tx, ty) {
      if (!this.deco || ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) return '.';
      return this.deco[ty][tx];
    }
    /** 這一格的裝飾是不是「會燒的植被」（依主題判定：green 草/花/灌木/蘑菇、island 海草、castle 蜘蛛網） */
    burnableDeco(tx, ty) {
      const ch = this.decoCh(tx, ty);
      if (ch === '.' || ch === ' ') return false;
      const set = TileMap.BURN_DECO[this.themeName];
      return (set === undefined ? 'gf' : set).indexOf(ch) >= 0;
    }
    decoState(tx, ty) {
      const k = tx + ',' + ty;
      if (this.decoFire.has(k)) return 'fire';
      if (this.decoChar.has(k)) return 'char';
      return null;
    }
    /**
     * 火焰點燃草地：燒 FIRE_T 幀 → 焦黑 CHAR_T 幀（30 秒）→ 恢復。
     * spread：還能往兩側蔓延幾格（每 STEP 幀 1 格）。
     */
    igniteDeco(tx, ty, spread) {
      if (!this.burnableDeco(tx, ty)) return false;
      const k = tx + ',' + ty;
      if (this.decoFire.has(k) || this.decoChar.has(k)) return false;
      this.decoFire.set(k, { tx, ty, t: TileMap.FIRE_T, spread: spread === undefined ? 3 : spread, step: TileMap.SPREAD_STEP, dmgT: 60 });
      if (KB.audio) KB.audio.sfx('fuse');
      if (KB.particles) KB.particles(tx * T + 8, ty * T + 14, ['#ffe040', '#ff9020', '#ff4010'], 6, { spread: 1.2, grav: -0.05, life: 16, up: 0.5, size: 1 });
      return true;
    }
    /** 風吹熄（草還在，不會變焦黑） */
    extinguishDeco(tx, ty) {
      const k = tx + ',' + ty;
      if (!this.decoFire.has(k)) return false;
      this.decoFire.delete(k);
      if (KB.particles) KB.particles(tx * T + 8, ty * T + 10, ['#d0d0dc', '#a0a0a8', '#ffffff'], 5, { spread: 1.4, grav: -0.03, life: 20, up: 0.4, size: 1 });
      if (KB.audio) KB.audio.sfx('wind');
      return true;
    }
    /** 木箱 W：燒 WOOD_T 幀後消失 */
    igniteWood(tx, ty) {
      if (this.get(tx, ty) !== 'W') return false;
      const k = tx + ',' + ty;
      if (this.woodFire.has(k)) return false;
      this.woodFire.set(k, { tx, ty, t: TileMap.WOOD_T });
      if (KB.audio) KB.audio.sfx('fuse');
      return true;
    }
    extinguishWood(tx, ty) {
      const k = tx + ',' + ty;
      if (!this.woodFire.has(k)) return false;
      this.woodFire.delete(k);
      if (KB.particles) KB.particles(tx * T + 8, ty * T + 8, ['#d0d0dc', '#a0a0a8'], 5, { spread: 1.4, grav: -0.03, life: 20, up: 0.4, size: 1 });
      if (KB.audio) KB.audio.sfx('wind');
      return true;
    }
    /** 冰結水面：只有「最上排的水」會結冰，變成 ICE_T 幀（8 秒）的臨時單向平台 */
    freezeWater(tx, ty) {
      if (this.get(tx, ty) !== '~' || this.get(tx, ty - 1) === '~') return false;
      const k = tx + ',' + ty;
      const fresh = !this.iceWater.has(k);
      this.iceWater.set(k, TileMap.ICE_T);
      if (fresh) {
        if (KB.audio) KB.audio.sfx('icewall');
        if (KB.particles) KB.particles(tx * T + 8, ty * T + 2, ['#ffffff', '#c0f0ff', '#78d8f8'], 6, { spread: 1.6, grav: 0.02, life: 22, up: 0.4, size: 1 });
      }
      return true;
    }
    /** 火焰融掉結冰的水面 */
    meltWater(tx, ty) {
      const k = tx + ',' + ty;
      if (!this.iceWater.has(k)) return false;
      this.iceWater.delete(k);
      if (KB.audio) KB.audio.sfx('melt');
      if (KB.fx) KB.fx('fx_poof', tx * T + 8, ty * T + 8);
      if (KB.particles) KB.particles(tx * T + 8, ty * T + 4, ['#ffffff', '#c0f0ff', '#78d8f8'], 10, { spread: 2, life: 24 });
      return true;
    }
    isIceWater(tx, ty) { return this.iceWater.has(tx + ',' + ty); }
    /** 腳下（左右兩個腳點）是不是結冰的水面 —— 給 physics.step 的滑行摩擦用 */
    iceUnder(e) {
      if (!this.iceWater.size) return false;
      const ty = Math.floor((e.y + e.h) / T);
      for (const fx of [e.x + 1, e.x + e.w - 2]) if (this.iceWater.has(Math.floor(fx / T) + ',' + ty)) return true;
      return false;
    }
    /** 電擊水域：從命中格洪水填滿整片相連水域 → 全體敵人 dmg 4 + freezeT 30、水中的卡比自傷 1 */
    shockWater(tx, ty) {
      if (this.get(tx, ty) !== '~' || this.shockCool > 0) return false;
      const seen = new Set(), stack = [[tx, ty]], cells = [];
      while (stack.length && cells.length < 800) {
        const [x, y] = stack.pop(), k = x + ',' + y;
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.get(x, y) !== '~') continue;
        cells.push([x, y]);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      if (!cells.length) return false;
      this.shockCells = cells; this.shockT = 20; this.shockCool = 40;
      const V = KB.VFX;
      if (V) {
        V.worldTint('#d8f4ff', 0.5, 10);
        V.shake(3);
        // 觸發瞬間先劈三道橫貫水域的閃電（之後每 3 幀再補一道，見 updateElements）
        let mnx = cells[0][0], mxx = cells[0][0], mny = cells[0][1], mxy = cells[0][1];
        for (const c of cells) { if (c[0] < mnx) mnx = c[0]; if (c[0] > mxx) mxx = c[0]; if (c[1] < mny) mny = c[1]; if (c[1] > mxy) mxy = c[1]; }
        for (let i = 0; i < 3; i++) {
          const y1 = (mny + Math.random() * (mxy - mny + 1)) | 0, y2 = (mny + Math.random() * (mxy - mny + 1)) | 0;
          V.lightning(mnx * T + 4, y1 * T + 8, mxx * T + 12, y2 * T + 8, { color: i ? '#c0f0ff' : '#ffffff', frames: 14 + i * 3, jitter: 7, branches: 2 });
        }
      }
      if (KB.audio) KB.audio.sfx('thunder');
      // 傷害只結算一次
      const inCells = (ent) => {
        const x0 = Math.floor(ent.x / T), x1 = Math.floor((ent.x + ent.w - 1) / T);
        const y0 = Math.floor(ent.y / T), y1 = Math.floor((ent.y + ent.h - 1) / T);
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (seen.has(xx + ',' + yy) && this.get(xx, yy) === '~') return true;
        return false;
      };
      if (KB.game) {
        for (const e of KB.game.entities) {
          if (e.dead || (e.type !== 'enemy' && e.type !== 'boss')) continue;
          if (!inCells(e)) continue;
          if (KB.ELEM) KB.ELEM.dot(e, 4, 'spark'); else e.hurt(4, { elem: 'spark' });
          if (!e.dead && e.type === 'enemy') e.freezeT = Math.max(e.freezeT || 0, 30);
        }
        const p = KB.player;
        if (p && !p.dead && p.state !== 'dead' && inCells(p)) p.hurt(1, { cx: p.cx, cy: p.cy - 8, elem: 'spark', selfShock: true });
      }
      return true;
    }
    // 每幀推進所有元素狀態（由 update() 呼叫）
    updateElements() {
      if (this.shockCool > 0) this.shockCool--;
      if (this.shockT > 0) {
        this.shockT--;
        const V = KB.VFX, cs = this.shockCells;
        if (V && cs.length && (this.shockT % 3) === 0) {
          const a = cs[(Math.random() * cs.length) | 0], b = cs[(Math.random() * cs.length) | 0];
          V.lightning(a[0] * T + 8, a[1] * T + 8, b[0] * T + 8, b[1] * T + 8, { color: '#c0f0ff', frames: 8, jitter: 5, branches: 1 });
        }
        if (KB.particles && (this.shockT & 1) === 0 && cs.length) {
          const c = cs[(Math.random() * cs.length) | 0];
          KB.particles(c[0] * T + 8, c[1] * T + 8, ['#ffffff', '#c0f0ff'], 2, { spread: 1.2, grav: 0, life: 10, up: 0, size: 1 });
        }
        if (this.shockT === 0) this.shockCells = [];
      }
      // ---- 燒草：蔓延 + 站在火上的敵人 1 dmg/秒 ----
      if (this.decoFire.size) {
        for (const [k, f] of Array.from(this.decoFire)) {
          f.t--;
          if (KB.particles && (f.t % 3) === 0) KB.particles(f.tx * T + 4 + Math.random() * 8, f.ty * T + 14, ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.6, grav: -0.07, life: 14, up: 0.5, size: 1 });
          // 蔓延：每 SPREAD_STEP 幀往左右各推 1 格
          if (f.spread > 0 && --f.step <= 0) {
            f.step = TileMap.SPREAD_STEP;
            const next = f.spread - 1;
            f.spread = 0;   // 這一格只推一次，之後由被點燃的鄰居接力（所以總共正好蔓延 3 格）
            for (const dx of [-1, 1]) this.igniteDeco(f.tx + dx, f.ty, next);
          }
          // 站在燃燒格上的敵人：1 dmg / 秒
          if (--f.dmgT <= 0) {
            f.dmgT = 60;
            if (KB.game) {
              const rx = f.tx * T, ry = f.ty * T;
              for (const e of KB.game.entities) {
                if (e.dead || e.type !== 'enemy' || !e.active) continue;
                if (!e.overlapsRect(rx, ry, T, T)) continue;
                if (KB.ELEM) KB.ELEM.dot(e, 1, 'fire'); else e.hurt(1, { elem: 'fire' });
              }
            }
          }
          if (f.t > 0) continue;
          this.decoFire.delete(k);
          this.decoChar.set(k, TileMap.CHAR_T);
          if (KB.particles) KB.particles(f.tx * T + 8, f.ty * T + 12, ['#404048', '#202028', '#787880'], 6, { spread: 1.4, grav: -0.02, life: 26, up: 0.4, size: 1 });
        }
      }
      // ---- 焦黑恢復（30 秒）----
      if (this.decoChar.size) {
        for (const [k, t] of Array.from(this.decoChar)) {
          if (t > 1) this.decoChar.set(k, t - 1);
          else {
            this.decoChar.delete(k);
            const c = k.split(','), cx = (+c[0]) * T + 8, cy = (+c[1]) * T + 12;
            if (KB.particles) KB.particles(cx, cy, ['#48c048', '#98f070', '#ffffff'], 5, { spread: 1, grav: -0.03, life: 22, up: 0.5, size: 1 });
          }
        }
      }
      // ---- 木箱燒毀 ----
      if (this.woodFire.size) {
        for (const [k, f] of Array.from(this.woodFire)) {
          f.t--;
          if (KB.particles && (f.t % 4) === 0) KB.particles(f.tx * T + 4 + Math.random() * 8, f.ty * T + 4 + Math.random() * 8, ['#ffe040', '#ff9020', '#ff4010'], 1, { spread: 0.7, grav: -0.07, life: 16, up: 0.5, size: 1 });
          if (f.t > 0) continue;
          this.woodFire.delete(k);
          if (this.get(f.tx, f.ty) === 'W') {
            this.breakBlock(f.tx, f.ty);
            if (KB.particles) KB.particles(f.tx * T + 8, f.ty * T + 8, ['#404048', '#202028', '#ff9020'], 10, { spread: 2.2, life: 28 });
          }
        }
      }
      // ---- 結冰水面倒數 ----
      if (this.iceWater.size) {
        for (const [k, t] of Array.from(this.iceWater)) {
          if (t > 1) this.iceWater.set(k, t - 1);
          else {
            this.iceWater.delete(k);
            const c = k.split(','), cx = (+c[0]) * T + 8, cy = (+c[1]) * T + 4;
            if (KB.particles) KB.particles(cx, cy, ['#ffffff', '#c0f0ff'], 5, { spread: 1.4, grav: 0.06, life: 20, up: 0.2, size: 1 });
            if (KB.audio) KB.audio.sfx('splash');
          }
        }
      }
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
      this.updateElements();
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
        case 'W': return this.woodFire.has(tx + ',' + ty) ? 'tile_woodbox_burn' : 'tile_woodbox';
        case '~':
          if (this.iceWater.has(tx + ',' + ty)) return 'tile_ice_surface';
          return this.get(tx, ty - 1) === '~' ? 'tile_water' : 'tile_water_top';
        case 'H': return 'tile_ladder';
      }
      return null;
    }

    draw(ctx, cam, theme, t) {
      const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.w - 1, Math.floor((cam.x + KB.W) / T) + 1);
      const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.h - 1, Math.floor((cam.y + KB.VIEW_H) / T) + 1);
      // 裝飾層先畫（在磁磚後面）
      if (this.deco) {
        const anyFire = this.decoFire.size || this.decoChar.size;
        for (let ty = y0 - 3; ty <= y1; ty++) for (let tx = x0 - 2; tx <= x1 + 2; tx++) {
          if (ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) continue;
          const ch = this.deco[ty][tx]; if (ch === '.' || ch === ' ') continue;
          let nm = KB.has('deco_' + theme + '_' + ch) ? 'deco_' + theme + '_' + ch : (KB.has('deco_' + ch) ? 'deco_' + ch : null);
          if (!nm) continue;
          const o = { t };
          // 元素反應：燃燒中＝橘紅閃爍＋火焰疊圖；焦黑＝專用焦黑圖（沒有就整株壓暗）
          const st = anyFire ? this.decoState(tx, ty) : null;
          if (st === 'char') {
            if (KB.has(nm + '_burnt')) nm = nm + '_burnt';
            else { o.tint = '#302028'; o.alpha = 0.9; }
          } else if (st === 'fire') {
            o.tint = (Math.floor(t * 12) & 1) ? '#ff9020' : '#ff4010';
          }
          KB.drawSpr(ctx, nm, tx * T + 8 - cam.x, ty * T + T - cam.y, o);
          if (st === 'fire' && KB.has('deco_flame')) KB.drawSpr(ctx, 'deco_flame', tx * T + 8 - cam.x, ty * T + T - cam.y, { t, fps: 10 });
        }
      }
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const ch = this.rows[ty][tx];
        if (ch === '.' || ch === ' ') continue;
        if (ch === '~') {
          // 水：半透明疊在最後（見 drawWater）；結冰的水面是可以站的平台，要畫在實體「之下」
          if (!this.iceWater.has(tx + ',' + ty)) continue;
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
        if (this.iceWater.has(tx + ',' + ty)) continue;   // 結冰的水面已在 draw() 畫成不透明冰面
        const surface = ty === 0 || this.rows[ty - 1][tx] !== '~';
        ctx.globalAlpha = surface ? 0.66 : 0.45;
        const nm = this.tileSprite(tx, ty, 'green');
        KB.drawSpr(ctx, nm, tx * T - cam.x, ty * T - cam.y, { frame: KB.SPR[nm] && KB.SPR[nm].n > 1 ? Math.floor(t * 3) % KB.SPR[nm].n : undefined, _tl: true });
      }
      ctx.restore();
    }
  }
  // ---- 元素反應常數（Round 6 elements）----
  TileMap.FIRE_T = 90;        // 草燃燒幀數
  TileMap.CHAR_T = 1800;      // 焦黑 30 秒後恢復
  TileMap.SPREAD_STEP = 8;    // 每 8 幀往兩側蔓延 1 格
  TileMap.WOOD_T = 40;        // 木箱燒 40 幀後消失
  TileMap.ICE_T = 480;        // 水面結冰 8 秒
  // 各主題「會燒的裝飾字元」（green 草叢/花叢/灌木/蘑菇、island 海草、castle 蜘蛛網；雲 / 迪迪迪沒有植被）
  TileMap.BURN_DECO = { green: 'gfbm', island: 'g', castle: 'b', cloud: '', dedede: '' };
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
      // 冰面滑行（elements）：站在結冰的水面上 → 速度改成「上一幀速度」與「這一幀想要的速度」的緩慢插值，
      // 加速慢、停下也慢（摩擦變小）。卡比與敵人共用，所以寫在 physics 而不是 player.js。
      if (map.iceWater && map.iceWater.size && wasOnGround && map.iceUnder(e)) {
        const prev = e._iceVx === undefined ? e.vx : e._iceVx;
        e.vx = prev * ICE_SLIDE + e.vx * (1 - ICE_SLIDE);
        if (Math.abs(e.vx) < 0.02) e.vx = 0;
      }
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
            } else if (isPlat(map, tx, ty, ch) && !e.dropThrough && prevBottom <= ty * T + 1 && e.vy >= 0) {
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
      e._iceVx = e.vx;   // 撞牆後 vx=0 → 冰面動量也跟著歸零
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
        if (SOLID[ch] || isPlat(map, tx, ty, ch)) return true;
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
          if (SOLID[ch] || isPlat(map, tx, ty, ch)) return true;
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
        if (isPlat(map, tx, ty, ch)) plat = true;
      }
      return plat;
    },
    // 前方是否有懸崖（用於敵人 AI）
    edgeAhead(map, e) {
      const px = e.dir > 0 ? e.x + e.w + 2 : e.x - 2, py = e.y + e.h + 2;
      const tx = Math.floor(px / T), ty = Math.floor(py / T), ch = map.get(tx, ty);
      return !(SOLID[ch] || SLOPE[ch] || ch === '=' || (ch === '~' && map.iceWater.has(tx + ',' + ty)));
    },
    wallAhead(map, e) {
      const px = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
      return this.columnSolid(map, px, e.y + 2, e.y + e.h - 2);
    },
  };
})();
