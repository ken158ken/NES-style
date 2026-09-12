// 元素反應系統 KB.ELEM（火燒 / 冰凍 / 電擊水域 / 屬性弱點）（Round 6 系統深度）
// ===========================================================================
// 這一檔只負責「判斷 + 規則」，磁磚狀態機（燒草 / 木箱 / 結冰水面 / 電擊水域）在 src/tilemap.js。
//
// ==== API 一覽（其他 agent 呼叫用）====
//   KB.ELEM.of(hitboxOrProj)      → 'fire' | 'ice' | 'spark' | 'wind' | 'none'
//   KB.ELEM.mult(target, src)     → { k, tag:'weak'|'resist'|null }   純計算，不產生特效
//   KB.ELEM.applyHit(t, dmg, src) → 乘算後的傷害（順便播弱點 / 抗性演出）  ← Enemy.hurt / Boss.hurt 用
//   KB.ELEM.onHit(target, src)    → 依元素掛上狀態（火＝燃燒 / 電＝麻痺）  ← Enemy.hurt 用
//   KB.ELEM.updateStatus(e)       → 每幀處理 e.status（燃燒 DoT + 連鎖點燃 / 麻痺）← Enemy.update 用
//   KB.ELEM.scanTiles(a)          → 判定框 / 投射物覆蓋到的磁磚做環境反應    ← Hitbox/Projectile.update 用
//   KB.ELEM.ignite(e) / paralyze(e) / dot(e, dmg, elem)
//
// ==== 敵人標籤（寫在各自 enemies*.js / bosses.js 的建構式）====
//   this.element = 'fire'|'ice'|'spark'|'metal'|'ghost'|null   （目前只影響「火屬性不會被點燃」）
//   this.weak    = ['fire', ...]       命中元素在表內 → 傷害 ×2
//   this.resist  = ['ice', 'physical'] 命中元素在表內 → 傷害 ×resistK（預設 0.5）
//   this.resistK = 0.75                魔王可個別調整抗性倍率
//   'physical' 是「非元素攻擊」（劍 / 鎚 / 星星…＝ of() 回傳 'none'）的代號。
// ===========================================================================
(function () {
  'use strict';
  const E = KB.ELEM = KB.ELEM || {};
  const V = () => KB.VFX;
  const sfx = n => { if (KB.audio) KB.audio.sfx(n); };

  // =========================================================================
  // 1. 元素分類
  // =========================================================================
  // 精確表（kind / type / ability / 精靈名都會查這張表）
  const TBL = {
    fire: 'fire', flame: 'fire', firedash: 'fire', fireball: 'fire', firebreath: 'fire',
    dragon_breath: 'fire', dragonbreath: 'fire', burn: 'fire', lava: 'fire', flamethrower: 'fire',
    ice: 'ice', iceblock: 'ice', icewall: 'ice', freeze: 'ice', frost: 'ice', blizzard: 'ice', snow: 'ice',
    spark: 'spark', lightning: 'spark', thunder: 'spark', shock: 'spark', plasma: 'spark', zap: 'spark',
    wind: 'wind', airpuff: 'wind', windblade: 'wind', gust: 'wind', tornado: 'wind',
  };
  // 模糊比對（精靈名 proj_fireball / proj_windblade、招式名 mage_fire… 都靠這個）
  const RX = [
    [/fire|flame|burn|lava|blaze/, 'fire'],
    [/ice|frost|freez|snow|blizz/, 'ice'],
    [/spark|lightning|thunder|shock|electr|plasma|\bbolt\b/, 'spark'],
    [/wind|airpuff|windblade|gust|tornado/, 'wind'],
  ];
  E.TABLE = TBL;
  function fromKey(k) {
    if (!k || typeof k !== 'string') return null;
    k = k.toLowerCase();
    if (TBL[k]) return TBL[k];
    for (let i = 0; i < RX.length; i++) if (RX[i][0].test(k)) return RX[i][1];
    return null;
  }
  E.fromKey = fromKey;

  /** 判定框 / 投射物 / 字串 → 元素。認不出來一律 'none'（＝物理） */
  E.of = function (a) {
    if (!a) return 'none';
    if (typeof a === 'string') return fromKey(a) || 'none';
    if (a.elem) return a.elem;                 // 明確覆寫（其他 agent 可直接掛 elem:'fire'）
    return fromKey(a.kind) || fromKey(a.ability) || fromKey(a.spr)
      || (a.freeze ? 'ice' : null) || 'none';
  };

  E.COLORS = {
    fire: ['#ffe040', '#ff9020', '#ff4010'],
    ice: ['#ffffff', '#c0f0ff', '#78d8f8'],
    spark: ['#ffffff', '#c0f0ff', '#ffe040'],
    wind: ['#ffffff', '#c8f050', '#a0e0d0'],
    none: ['#ffffff', '#ffe040'],
  };

  // =========================================================================
  // 2. 屬性弱點 / 抗性
  // =========================================================================
  const has = (arr, x) => !!arr && arr.indexOf(x) >= 0;

  /** 純計算：回傳 { k: 倍率, tag: 'weak'|'resist'|null, elem } */
  E.mult = function (t, src) {
    const elem = E.of(src);
    const key = elem === 'none' ? 'physical' : elem;
    if (!t) return { k: 1, tag: null, elem };
    if (has(t.weak, key)) return { k: 2, tag: 'weak', elem };
    if (has(t.resist, key)) return { k: t.resistK !== undefined ? t.resistK : 0.5, tag: 'resist', elem };
    return { k: 1, tag: null, elem };
  };

  /**
   * 乘算 + 演出。回傳實際要扣的傷害。
   * ‧ src.dot=true（持續傷害）不播演出。
   * ‧ 傷害四捨五入後沒有真的變動時（例如 2 點的劍 ×0.85 還是 2）也不播 ——
   *   不然畫面會一直跳「抗性」卻照樣扣滿，而且會白白攪動 Math.random（boss_test 對此很敏感）。
   */
  E.applyHit = function (t, amount, src) {
    const m = E.mult(t, src);
    if (m.k === 1 || !(amount > 0)) return amount;
    const out = m.k >= 1 ? Math.round(amount * m.k) : Math.max(1, Math.round(amount * m.k));
    if (out !== amount && !(src && src.dot)) E.popup(t, m);
    return out;
  };

  /** 弱點 / 抗性的畫面表現（20 幀冷卻，連段不會洗版） */
  E.popup = function (t, m) {
    if (t._elemPopT > 0) return;
    t._elemPopT = 20;
    const v = V();
    const boss = t.type === 'boss';
    if (m.tag === 'weak') {
      if (v) {
        v.textPop(t.cx, t.y - 6, '弱點!', { color: '#ffe040', size: 8, frames: 34, rise: 16 });
        v.hitstop(2);
        v.burst(t.cx, t.cy, { n: boss ? 34 : 26, colors: (E.COLORS[m.elem] || E.COLORS.none).concat(['#ffffff']), speed: 3.4, life: 32, grav: 0.03, size: 3 });
        if (boss) v.shake(4);
      }
      sfx('enemyhit');
    } else if (m.tag === 'resist') {
      if (v) {
        v.textPop(t.cx, t.y - 6, '抗性', { color: '#b0b4c4', size: 8, frames: 28, rise: 10 });
        v.burst(t.cx, t.cy, { n: 8, colors: ['#d0d0dc', '#ffffff'], speed: 1.8, life: 18, grav: 0.06, size: 1 });
      }
      sfx('hardblock');
    }
  };

  // =========================================================================
  // 3. 元素狀態（燃燒 / 麻痺）
  // =========================================================================
  E.BURN_T = 180;      // 燃燒 3 秒
  E.BURN_TICK = 30;    // 每 30 幀 dmg 1
  E.PARA_T = 60;       // 麻痺 60 幀
  E.CHAIN_MAX = 3;     // 燃燒最多再鏈到 3 隻
  E.CHAIN_R = 20;      // 連鎖點燃的判定半徑（px，以中心距離算）

  /** 依攻擊元素掛上狀態（Enemy.hurt 呼叫；持續傷害不再掛狀態，避免無限續命） */
  E.onHit = function (t, src) {
    if (!t || t.dead || (src && src.dot)) return;
    const el = E.of(src);
    if (el === 'fire') E.ignite(t, 0);
    else if (el === 'spark') E.paralyze(t);
  };

  E.st = function (e) { return e.status || (e.status = { burn: 0, para: 0, burnTick: 0, chain: 0 }); };

  /** 點燃：3 秒燃燒。火屬性敵人 / 魔王 / 已在燃燒中不受理 */
  E.ignite = function (e, chain) {
    if (!e || e.dead || e.type === 'boss' || e.noBurn) return false;
    if (e.element === 'fire') return false;
    const st = E.st(e);
    if (st.burn > 0) return false;
    st.burn = E.BURN_T; st.burnTick = E.BURN_TICK; st.chain = chain || 0; st.chainT = 12;
    KB.particles(e.cx, e.cy, E.COLORS.fire, 8, { spread: 1.6, grav: -0.04, life: 18, up: 0.6, size: 1 });
    sfx('fuse');
    return true;
  };

  /** 麻痺：60 幀不能移動 */
  E.paralyze = function (e, frames) {
    if (!e || e.dead || e.type === 'boss' || e.noPara) return false;
    const st = E.st(e);
    st.para = Math.max(st.para, frames || E.PARA_T);
    KB.particles(e.cx, e.cy, E.COLORS.spark, 6, { spread: 1.8, grav: 0, life: 14, up: 0, size: 1 });
    return true;
  };

  /** 持續傷害：不吃無敵幀、也不產生新的無敵幀（否則 DoT 會擋掉玩家的攻擊） */
  E.dot = function (e, dmg, elem) {
    if (!e || e.dead) return false;
    const inv = e.invuln;
    e.invuln = 0;
    const ok = e.hurt(dmg, { elem: elem || 'none', dot: true, cx: e.cx, cy: e.cy });
    if (!e.dead) e.invuln = inv;
    return ok;
  };

  /** 每幀狀態處理（Enemy.update 呼叫） */
  E.updateStatus = function (e) {
    if (e._elemPopT > 0) e._elemPopT--;
    const st = e.status;
    if (!st) return;
    // ---- 燃燒 ----
    if (st.burn > 0) {
      st.burn--;
      if ((st.burn & 3) === 0) KB.particles(e.cx + (Math.random() - 0.5) * e.w, e.cy, E.COLORS.fire, 1, { spread: 0.5, grav: -0.06, life: 14, up: 0.5, size: 1 });
      if (--st.burnTick <= 0) {
        st.burnTick = E.BURN_TICK;
        E.dot(e, 1, 'fire');
        if (e.dead) { st.burn = 0; return; }
      }
      // 連鎖點燃：碰到的其他敵人也燒起來。
      // 每隻只會傳染一次（傳染後把自己的 chain 拉到上限），所以一次起火最多再燒 CHAIN_MAX 隻，
      // 形成 起火者 → A → B → C 的一條鏈，不會變成一隻火把把整房間點光。
      if (--st.chainT <= 0) {
        st.chainT = 12;
        if (st.chain < E.CHAIN_MAX && KB.game) {
          const ents = KB.game.entities;
          for (let i = 0; i < ents.length; i++) {
            const o = ents[i];
            if (o === e || o.dead || o.type !== 'enemy') continue;
            if (o.status && o.status.burn > 0) continue;
            if (!e.overlapsRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8)) continue;
            if (E.ignite(o, st.chain + 1)) { st.chain = E.CHAIN_MAX; break; }   // 一隻只傳染一次
          }
        }
      }
    }
    // ---- 麻痺 ----
    if (st.para > 0) {
      st.para--;
      if ((st.para % 6) === 0) KB.particles(e.cx + (Math.random() - 0.5) * e.w, e.cy + (Math.random() - 0.5) * e.h, E.COLORS.spark, 1, { spread: 1.2, grav: 0, life: 8, up: 0, size: 1 });
    }
  };

  /** 被麻痺？（Enemy.update 用來擋掉 ai） */
  E.paralyzed = e => !!(e && e.status && e.status.para > 0);
  E.burning = e => !!(e && e.status && e.status.burn > 0);

  // =========================================================================
  // 4. 環境反應：判定框 / 投射物掃過的磁磚
  // =========================================================================
  // 只有「玩家方」的攻擊會觸發環境反應 —— 敵人的火球到處燒草會讓關卡難以預期，
  // 而電擊水域會反傷玩家，交給玩家自己決定要不要冒險才有趣。
  E.scanTiles = function (a) {
    if (!a || a.owner !== 'player' || !KB.game) return;
    const map = KB.game.map;
    if (!map || !map.igniteDeco) return;
    const el = E.of(a);
    if (el === 'none' && !KB.TileMap.hardBreakable(a)) return;
    const T = KB.TILE;
    const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 1) / T);
    const y0 = Math.floor(a.y / T), y1 = Math.floor((a.y + a.h - 1) / T);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return;   // 安全上限（巨大必殺判定框）
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const ch = map.get(tx, ty);
      // 木箱 W：火燒 40 幀 / 鎚類重擊直接砸破
      if (ch === 'W') {
        if (el === 'fire') map.igniteWood(tx, ty);
        else if (KB.TileMap.hardBreakable(a)) map.breakBlock(tx, ty);
      }
      if (el === 'fire') {
        map.igniteDeco(tx, ty, 3);
        if (ch === '~') map.meltWater(tx, ty);
      } else if (el === 'ice') {
        if (ch === '~') map.freezeWater(tx, ty);
      } else if (el === 'spark') {
        if (ch === '~') map.shockWater(tx, ty);
      } else if (el === 'wind') {
        map.extinguishDeco(tx, ty);
        map.extinguishWood(tx, ty);
      }
    }
  };
})();
