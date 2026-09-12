// 能力等級 / 連擊 / 成就 KB.PROG（Round 6 系統深度）
// 載入順序：player.js → game.js → **progression.js** → ui.js / menu.js / arena.js
//   （所以這裡可以安全 monkeypatch KB.Player.prototype，並在 KB.save 建好之後補欄位）
//
// ── KB.PROG API（其他 agent 照這個介面呼叫；全部在缺 KB.game / KB.save 時安全 no-op）─────────
//   能力等級   level(key?) / xp(key?) / xpNext(key?) / dmgMul(key?) / partMul(key?) / scaleDmg(dmg, key?)
//   連擊       combo / comboMax / comboT / comboColor() / breakCombo(reason) / update(game)
//   成就       ACH（20 條定義）/ has(id) / unlock(id) / achCount() / achTotal()
//   評價       rankOf(game) / rankData(game) / saveRank(levelId, rank) / bestRank(levelId)
//   事件       emit(event, data) / on(event, fn)  ← 其他系統只要呼叫 emit 就會算成就
//   關卡       beginLevel(game)（game.js enter 呼叫，重置連擊 / 本關統計）
//   繪製       drawHUD(ctx, game)（連擊數字 + 成就 toast）/ drawLvStars(ctx, x, y, key)
//
// ── 事件名單（給 mix / helper / elements / world6 / abilities agent）────────────────────────
//   KB.PROG.emit('kill',        enemy)                  由 game.js 統一發（不用自己呼叫）
//   KB.PROG.emit('hurt',        {amount, src})          由 player.hurt monkeypatch 發
//   KB.PROG.emit('abilityGet',  {key, lv, up})          由 player.giveAbility monkeypatch 發
//   KB.PROG.emit('levelClear',  {levelId, noHit})       game.js levelClear
//   KB.PROG.emit('bossDefeated',{boss, hp})             game.js onBossDefeated
//   KB.PROG.emit('secretRoom',  {levelId, roomIdx})     game.js loadRoom（room.secret）
//   KB.PROG.emit('bigstar',     {levelId})              items.js 大星星（沒發也會在過關時補算）
//   ---- 以下請各系統自己呼叫 ----
//   KB.PROG.emit('mix',      {key})        混合能力成立（mix agent；def.mix 也會自動偵測）
//   KB.PROG.emit('helper',   {key})        產生 / 使用夥伴（helper agent）
//   KB.PROG.emit('inhaleBoss',{boss})      巨大化吸中魔王 / 中魔王（forms agent giant）
//   KB.PROG.emit('possess',  {enemy})      幽靈附身敵人（forms agent ghost）
//   KB.PROG.emit('elemKill', {kind})       屬性反應擊殺；kind='water_spark' 計入「電擊水域擊殺 3」
//   KB.PROG.emit('burn',     {kind})       燒毀可燃物；kind='grass' 計入「燒毀 10 草」
//   KB.PROG.emit('arenaClear',{time})      競技場通關（arena.js 已接）
(function () {
  'use strict';
  const KB = window.KB;
  const P = KB.PROG = KB.PROG || {};

  // ---------------------------------------------------------------- 存檔欄位
  // KB.save.abilityXp[key] 累積取得次數、abilityLv[key] 快取等級、achievements{id:time}、
  // rank[levelId] 最佳評價、secrets{levelId:roomIdx…} 已找到的秘密房、prog{} 跨關累計計數器。
  const MAXLV = 3;
  const XP_NEED = [0, 3, 8];              // 到達 Lv2 需 3 xp、Lv3 需 8 xp
  const DMG_MUL = [1, 1.25, 1.5];
  const PART_MUL = [1, 1.5, 1.5];

  function S() {
    const s = KB.save = KB.save || {};
    if (!s.abilityLv) s.abilityLv = {};
    if (!s.abilityXp) s.abilityXp = {};
    if (!s.achievements) s.achievements = {};
    if (!s.rank) s.rank = {};
    if (!s.secrets) s.secrets = {};
    if (!s.prog) s.prog = {};
    return s;
  }
  P.save = S;
  function store() { try { KB.saveGame && KB.saveGame(); } catch (e) { } }
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const V = () => (KB.VFX && KB.game ? KB.VFX : null);
  const curKey = () => { const p = KB.player || (KB.game && KB.game.player); return (p && p.ability) || null; };

  // ---------------------------------------------------------------- 能力等級
  function lvOfXp(xp) { let lv = 1; for (let i = 1; i < MAXLV; i++) if (xp >= XP_NEED[i]) lv = i + 1; return lv; }
  P.lvOfXp = lvOfXp;
  P.MAXLV = MAXLV;
  P.xp = function (key) { key = key || curKey(); return key ? (S().abilityXp[key] | 0) : 0; };
  P.level = function (key) {
    key = key || curKey(); if (!key) return 1;
    const s = S(), lv = lvOfXp(s.abilityXp[key] | 0);
    return Math.max(1, Math.min(MAXLV, Math.max(lv, s.abilityLv[key] | 0)));
  };
  // 到下一級還差多少：{lv, xp, need, left, max}
  P.xpNext = function (key) {
    key = key || curKey();
    const lv = P.level(key), xp = P.xp(key);
    if (lv >= MAXLV) return { lv, xp, need: XP_NEED[MAXLV - 1], left: 0, max: true };
    const need = XP_NEED[lv], from = XP_NEED[lv - 1];
    return { lv, xp, need, from, left: Math.max(0, need - xp), max: false };
  };
  P.dmgMul = function (key) { return DMG_MUL[P.level(key) - 1] || 1; };
  P.partMul = function (key) { return PART_MUL[P.level(key) - 1] || 1; };
  // 玩家方傷害加成：四捨五入，且保證不會比原本低（「至少 +0」）
  P.scaleDmg = function (dmg, key) {
    const d = +dmg; if (!d || d <= 0) return dmg;
    const m = P.dmgMul(key);
    if (m <= 1) return dmg;
    return Math.max(d, Math.round(d * m));
  };
  // 蓄力時間 ×0.8（Lv3）：abilities 端若要吃這個加成，請用 KB.PROG.holdMul() 乘上 maxHold
  P.holdMul = function (key) { return P.level(key) >= 3 ? 0.8 : 1; };

  // 升級演出：flash + ring + sfx 立刻放；「LEVEL UP!」橫幅要等變身橫幅播完才放
  //   （KB.VFX.banner 內部會 dropKind('banner') 只留最新一條，而 transform 的名稱橫幅是在
  //    取得能力後第 2 幀才建立 → 立刻叫 banner 會被蓋掉，所以改排程到 BANNER_DELAY 幀後。）
  const BANNER_DELAY = 70;
  P.pendingUp = null;
  P.levelUpFx = function (key, lv) {
    const def = (KB.ABILITIES || {})[key] || {};
    const col = def.color || '#ffe040';
    const v = V();
    if (v) {
      try { v.flash('#fff', 8, 0.7); } catch (e) { }
      const p = KB.player || (KB.game && KB.game.player);
      if (p) { try { v.ring(p.cx, p.cy, { r0: 4, r1: 40, frames: 18, color: col, width: 2 }); } catch (e) { } }
      // 副標用英文 hudName：橫幅副標走 8×8 點陣字，中文在 8px 下糊掉（見 CLAUDE.md 文字規格）
      const hud = def.hudName || (KB.ABILITY_HUD || {})[key] || String(key).toUpperCase();
      P.pendingUp = { key, lv, t: BANNER_DELAY, col, name: hud };
    } else {
      P.pendingUp = null;
    }
    sfx('max');
  };
  P.flushLevelUp = function () {
    const q = P.pendingUp; if (!q) return false;
    P.pendingUp = null;
    const v = V(); if (!v) return false;
    // 橫幅一律用金色（能力色太暗時副標會看不清楚；能力色已經在變身橫幅出現過了）
    try { v.banner('LEVEL UP!', q.name + '  Lv' + q.lv, '#ffe040'); } catch (e) { }
    try { v.flash(q.col, 6, 0.5); } catch (e) { }
    sfx('max');
    return true;
  };
  // 取得能力 → +1 xp（同一能力累積；不同能力各自累積）
  P.gainAbility = function (key) {
    if (!key) return null;
    const s = S();
    const xp = (s.abilityXp[key] | 0) + 1;
    s.abilityXp[key] = xp;
    const old = Math.max(1, s.abilityLv[key] | 0), lv = lvOfXp(xp);
    s.abilityLv[key] = lv;
    const up = lv > old;
    if (up) P.levelUpFx(key, lv);
    store();
    P.emit('abilityGet', { key, lv, up });
    return { key, lv, up, xp };
  };

  // ---------------------------------------------------------------- 連擊
  const COMBO_WINDOW = 180;               // 3 秒內再擊殺才接得上
  P.combo = 0; P.comboMax = 0; P.comboT = 0; P.comboPop = 0; P.breakT = 0;
  P.comboColor = function (n) { n = n === undefined ? P.combo : n; return n >= 10 ? '#ff5060' : n >= 5 ? '#ffe040' : '#ffffff'; };
  P.resetCombo = function () { P.combo = 0; P.comboT = 0; P.comboPop = 0; };
  P.breakCombo = function () {
    if (P.combo >= 2) {
      const p = KB.player || (KB.game && KB.game.player), v = V();
      if (v && p) { try { v.textPop(p.cx, p.y - 6, 'BREAK', { color: '#ff6070', size: 10, frames: 40, rise: 12 }); } catch (e) { } }
      P.breakT = 40;
    }
    P.resetCombo();
  };
  P.onKill = function (e) {
    const g = KB.game;
    P.combo++; P.comboT = COMBO_WINDOW; P.comboPop = 10;
    if (P.combo > P.comboMax) P.comboMax = P.combo;
    const s = S();
    if (P.combo > (s.prog.comboBest | 0)) { s.prog.comboBest = P.combo; store(); }
    // 連擊加分：每擊 ×(1 + 0.1×combo)，額外的那 0.1×combo 在這裡補上
    if (g && g.addScore && P.combo > 1) {
      const base = Math.max(0, (e && e.score) | 0);
      const bonus = Math.round(base * 0.1 * P.combo);
      if (bonus > 0) g.addScore(bonus, e ? e.cx : undefined, e ? e.y - 10 : undefined);
    }
    if (P.combo >= 10 && g) g.shake = Math.max(g.shake | 0, 2);
    if (P.combo >= 5) sfx('menu');
    return P.combo;
  };
  // 每幀（game.js update 呼叫）
  P.update = function (game) {
    if (P.pendingUp) { if (--P.pendingUp.t <= 0) P.flushLevelUp(); }
    // 成就「使用夥伴」：helper agent 還沒接 emit 之前，這裡自己偵測一次（has() 是單純的物件查表）
    if (!P.has('helper') && KB.Helper && KB.Helper.exists && KB.Helper.exists()) P.emit('helper', {});
    if (P.comboT > 0) { P.comboT--; if (P.comboT === 0) P.combo = 0; }
    if (P.comboPop > 0) P.comboPop--;
    if (P.breakT > 0) P.breakT--;
    for (const t of P.toasts) t.t++;
    P.toasts = P.toasts.filter(t => t.t < TOAST_LIFE);
  };
  // 進入關卡：重置本關統計（連擊、受傷次數、時停擊殺）
  P.beginLevel = function (game) {
    P.resetCombo(); P.comboMax = 0; P.breakT = 0; P.toasts.length = 0; P.pendingUp = null;
    P.run = { levelId: game ? game.levelId : null, hurts: 0, kills: 0, tsKills: 0, startedAt: Date.now() };
  };
  P.run = { levelId: null, hurts: 0, kills: 0, tsKills: 0 };

  // ---------------------------------------------------------------- 成就（20 條）
  // name：解鎖後顯示的中文名；hint：未解鎖時的灰字提示
  P.ACH = [
    { id: 'first_ability', name: '初次變身', hint: '取得任何一種能力' },
    { id: 'basic8', name: '基本大全', hint: '發現 8 種基本能力' },
    { id: 'all20', name: '能力收藏家', hint: '發現 20 種能力' },
    { id: 'lv3', name: '登峰造極', hint: '把任一能力練到 Lv3' },
    { id: 'combo10', name: '十連擊', hint: '一口氣連續擊敗 10 隻敵人' },
    { id: 'nohit_world', name: '毫髮無傷', hint: '無傷通關任何一個世界' },
    { id: 'clear_w5', name: '大王退治', hint: '通關迪迪迪城 W5' },
    { id: 'arena_clear', name: '競技場霸者', hint: '在競技場打完 5 場魔王' },
    { id: 'arena_fast', name: '三分速攻', hint: '競技場在 3 分鐘內全破' },
    { id: 'stars15', name: '星星獵人', hint: '收集 15 顆大星星' },
    { id: 'secret5', name: '密室探險家', hint: '找到 5 個秘密房間' },
    { id: 'inhale_boss', name: '一口吞下', hint: '巨大化時吸入魔王' },
    { id: 'possess', name: '鬼上身', hint: '用幽靈能力附身敵人' },
    { id: 'timestop5', name: '時之支配者', hint: '在時間停止中擊敗 5 隻敵人' },
    { id: 'mix_first', name: '調合成功', hint: '第一次做出混合能力' },
    { id: 'helper', name: '好夥伴', hint: '把能力變成 AI 夥伴' },
    { id: 'elec_water', name: '導電高手', hint: '用電擊在水域擊敗 3 隻敵人' },
    { id: 'burn10', name: '縱火犯', hint: '燒掉 10 叢草' },
    { id: 'hp1_boss', name: '絕地反擊', hint: 'HP 剩 1 時擊敗魔王' },
    { id: 'extra_clear', name: '究極挑戰', hint: '在 Extra 模式下通關' },
  ];
  P.achTotal = () => P.ACH.length;
  P.achMap = function () { const m = {}; for (const a of P.ACH) m[a.id] = a; return m; };
  P.has = function (id) { return !!S().achievements[id]; };
  P.achCount = function () { const s = S(); return P.ACH.filter(a => s.achievements[a.id]).length; };
  P.achDef = function (id) { return P.ACH.find(a => a.id === id) || null; };

  const TOAST_LIFE = 150;
  P.toasts = [];
  P.unlock = function (id) {
    const def = P.achDef(id); if (!def) return false;
    const s = S();
    if (s.achievements[id]) return false;
    s.achievements[id] = Date.now();
    store();
    P.toasts.push({ id, t: 0 });
    if (P.toasts.length > 3) P.toasts.shift();
    sfx('bigstar');
    return true;
  };

  // ---------------------------------------------------------------- 事件
  const handlers = {};
  P.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return P; };
  function bump(name, n) { const s = S(); s.prog[name] = (s.prog[name] | 0) + (n || 1); store(); return s.prog[name]; }
  P.count = name => S().prog[name] | 0;
  P.bump = bump;

  function seenCount() {
    try { if (KB.UI && KB.UI.seenCount) return KB.UI.seenCount(); } catch (e) { }
    const s = KB.save && KB.save.seen ? KB.save.seen : {};
    return Object.keys(s).filter(k => s[k]).length;
  }
  function starTotal() {
    const st = (KB.save && KB.save.stars) || {};
    let n = 0;
    for (const k in st) { const a = st[k]; if (Array.isArray(a)) n += a.filter(Boolean).length; }
    return n;
  }
  P.starTotal = starTotal;
  function secretTotal() { const s = S().secrets; let n = 0; for (const k in s) n += Object.keys(s[k] || {}).length; return n; }
  P.secretTotal = secretTotal;

  // 每次任何事件都順便檢查這些「累積型」成就（便宜且不會漏）
  function checkPassive() {
    const s = S();
    const basics = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer'];
    if (basics.every(k => (KB.save.seen || {})[k])) P.unlock('basic8');
    if (seenCount() >= 20) P.unlock('all20');
    for (const k in s.abilityXp) if (lvOfXp(s.abilityXp[k] | 0) >= MAXLV) { P.unlock('lv3'); break; }
    if (starTotal() >= 15) P.unlock('stars15');
    if (secretTotal() >= 5) P.unlock('secret5');
    if (P.count('tsKills') >= 5) P.unlock('timestop5');
    if (P.count('elecWaterKills') >= 3) P.unlock('elec_water');
    if (P.count('burnGrass') >= 10) P.unlock('burn10');
    if (KB.save.arena && KB.save.arena.cleared) P.unlock('arena_clear');
    if (KB.save.cleared && KB.save.cleared.w5) P.unlock('clear_w5');
  }
  P.checkPassive = checkPassive;

  P.emit = function (ev, data) {
    data = data || {};
    try {
      switch (ev) {
        case 'kill': {
          P.onKill(data);
          P.run.kills++;
          if (KB.game && (KB.game.timeStopT | 0) > 0) { P.run.tsKills++; bump('tsKills'); }
          if (P.combo >= 10) P.unlock('combo10');
          break;
        }
        case 'hurt':
          P.run.hurts++;
          P.breakCombo();
          break;
        case 'abilityGet': {
          P.unlock('first_ability');
          const def = (KB.ABILITIES || {})[data.key];
          if (def && (def.mix || def.isMix)) P.unlock('mix_first');
          break;
        }
        case 'mix': P.unlock('mix_first'); break;
        case 'helper': P.unlock('helper'); break;
        case 'inhaleBoss': P.unlock('inhale_boss'); break;
        case 'possess': P.unlock('possess'); break;
        case 'elemKill': if (data.kind === 'water_spark' || data.kind === 'elec_water') bump('elecWaterKills'); break;
        case 'burn': if (!data.kind || data.kind === 'grass') bump('burnGrass'); break;
        case 'secretRoom': {
          const s = S(), id = data.levelId || 'x';
          s.secrets[id] = s.secrets[id] || {};
          if (!s.secrets[id][data.roomIdx]) { s.secrets[id][data.roomIdx] = 1; store(); }
          break;
        }
        case 'bossDefeated': {
          const p = KB.player || (KB.game && KB.game.player);
          if (p && p.hp <= 1) P.unlock('hp1_boss');
          break;
        }
        case 'levelClear': {
          if (P.run.hurts === 0) P.unlock('nohit_world');
          if (KB.session && KB.session.extra) P.unlock('extra_clear');
          break;
        }
        case 'arenaClear': {
          P.unlock('arena_clear');
          if ((data.time | 0) > 0 && data.time <= 180 * 60) P.unlock('arena_fast');
          break;
        }
        default: break;
      }
      checkPassive();
      const hs = handlers[ev];
      if (hs) for (const fn of hs) { try { fn(data); } catch (e) { } }
    } catch (e) { }
    return P;
  };

  // ---------------------------------------------------------------- Style Rank
  // 依「最大 combo / 無傷 / 時間 / 大星星」給分 → S / A / B / C
  const RANK_COL = { S: '#ffe040', A: '#ff90c0', B: '#80e0ff', C: '#b0bccc' };
  P.RANK_COL = RANK_COL;
  P.rankData = function (game) {
    const g = game || KB.game || null;
    const maxCombo = Math.max(P.comboMax | 0, 0);
    const hurts = P.run ? (P.run.hurts | 0) : 0;
    const frames = g ? Math.max(0, g.timeAlive | 0) : 0;
    const lid = g ? g.levelId : null;
    const stars = (KB.UI && KB.UI.starCount && lid) ? KB.UI.starCount(lid) : 0;
    const parts = [];
    const cp = maxCombo >= 15 ? 3 : maxCombo >= 10 ? 2 : maxCombo >= 5 ? 1 : 0;
    parts.push({ label: 'COMBO', val: 'x' + maxCombo, pt: cp });
    const hp = hurts === 0 ? 3 : hurts <= 2 ? 1 : 0;
    parts.push({ label: 'NOHIT', val: hurts === 0 ? 'OK' : '-' + hurts, pt: hp });
    const sec = Math.floor(frames / 60);
    const tp = sec > 0 && sec < 90 ? 3 : sec < 150 ? 2 : sec < 240 ? 1 : 0;
    parts.push({ label: 'TIME', val: String(sec) + 's', pt: tp });
    const sp = stars >= 3 ? 2 : stars >= 1 ? 1 : 0;
    parts.push({ label: 'STAR', val: stars + '/3', pt: sp });
    const pts = cp + hp + tp + sp;
    const rank = pts >= 9 ? 'S' : pts >= 6 ? 'A' : pts >= 3 ? 'B' : 'C';
    return { rank, pts, max: 11, parts, maxCombo, hurts, frames, stars };
  };
  P.rankOf = function (game) { return P.rankData(game).rank; };
  const RANK_ORD = { C: 0, B: 1, A: 2, S: 3 };
  P.bestRank = function (levelId) { return S().rank[levelId] || null; };
  P.saveRank = function (levelId, rank) {
    if (!levelId || !rank) return null;
    const s = S(), old = s.rank[levelId];
    if (!old || (RANK_ORD[rank] | 0) > (RANK_ORD[old] | 0)) { s.rank[levelId] = rank; store(); return rank; }
    return old;
  };

  // ---------------------------------------------------------------- 繪製
  // HUD 能力圖示旁的 Lv 星（3×3 小星 ×1~3）
  P.drawLvStars = function (ctx, x, y, key) {
    const lv = P.level(key); if (!key || lv <= 1) return 0;
    const col = lv >= 3 ? '#ffe040' : '#e8f0ff';
    for (let i = 0; i < lv; i++) {
      const sx = x + i * 4;
      KB.rect(ctx, sx, y, 3, 3, '#181c28');
      KB.rect(ctx, sx + 1, y, 1, 3, col);
      KB.rect(ctx, sx, y + 1, 3, 1, col);
    }
    return lv * 4;
  };
  // 連擊數字 + 成就 toast（ui.js drawHUD 末端呼叫）
  P.drawHUD = function (ctx, game) {
    const T = (KB.UI && KB.UI.text) || KB.text;
    // 連擊：右上（在常駐「?」下方），5 起黃、10 起紅，剛擊殺時放大彈跳（2 倍 → 3 倍字）
    if (P.combo >= 2 && P.comboT > 0) {
      const big = (KB.UI && KB.UI.bigText) || null;
      const sc = P.comboPop > 4 ? 3 : 2;
      const col = P.comboColor(), txt = 'x' + P.combo, sub = 'COMBO';
      const tw = KB.textWidth(txt) * sc, sw = KB.textWidth(sub);
      const bh = sc * 10 + 4, by = 26, nx = 248, sx = nx - tw - 4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, P.comboT / 20);
      KB.rect(ctx, sx - sw - 5, by, sw + tw + 11, bh, 'rgba(8,14,28,0.55)');
      if (big) big(ctx, txt, nx, by + 2, sc, { color: col, outline: '#181c28', align: 'right' });
      else KB.text(ctx, txt, nx, by + 2, { color: col, align: 'right', outline: '#181c28' });
      KB.text(ctx, sub, sx, by + ((bh - 8) >> 1), { color: col, align: 'right', outline: '#181c28' });
      ctx.restore();
    }
    // 成就 toast：右上滑入的卡片（最多 3 張，往下堆疊）
    for (let i = 0; i < P.toasts.length; i++) {
      const t = P.toasts[i], def = P.achDef(t.id); if (!def) continue;
      const w = 146, h = 26, y = 64 + i * 30;
      const slide = t.t < 10 ? (10 - t.t) * 8 : (t.t > TOAST_LIFE - 12 ? (t.t - (TOAST_LIFE - 12)) * 10 : 0);
      const x = 250 - w + slide;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (TOAST_LIFE - t.t) / 12));
      KB.rect(ctx, x, y, w, h, '#101828');
      KB.rect(ctx, x + 1, y + 1, w - 2, h - 2, '#241c40');
      KB.rect(ctx, x + 1, y, w - 2, 1, '#ffe040'); KB.rect(ctx, x + 1, y + h - 1, w - 2, 1, '#ffe040');
      KB.rect(ctx, x, y + 1, 1, h - 2, '#ffe040'); KB.rect(ctx, x + w - 1, y + 1, 1, h - 2, '#ffe040');
      const blink = ((t.t >> 2) & 1) && t.t < 24;
      P.drawTrophy(ctx, x + 5, y + 8, blink ? '#fff' : '#ffe040');
      KB.text(ctx, 'ACHIEVEMENT', x + 18, y + 3, { color: '#8fa0bc' });
      T(ctx, def.name, x + 18, y + 11, { color: '#ffe040', size: (KB.UI && KB.UI.MS) || 14 });
      ctx.restore();
    }
  };
  // 小獎盃圖示（8×10，純繪圖，不佔精靈表）
  P.drawTrophy = function (ctx, x, y, col) {
    col = col || '#ffe040';
    KB.rect(ctx, x, y, 8, 5, col);
    KB.rect(ctx, x + 2, y + 5, 4, 2, col);
    KB.rect(ctx, x + 1, y + 7, 6, 2, col);
    KB.rect(ctx, x - 1, y + 1, 1, 2, col); KB.rect(ctx, x + 8, y + 1, 1, 2, col);
  };

  // ---------------------------------------------------------------- player.js monkeypatch
  // （mix agent 同時在改 player.js，所以這裡完全不動原檔，只包一層）
  P.patch = function () {
    const proto = KB.Player && KB.Player.prototype;
    if (!proto || proto.__progPatched) return false;
    const give = proto.giveAbility;
    proto.giveAbility = function (key) {
      const r = give.apply(this, arguments);
      try { P.gainAbility(key); } catch (e) { }
      return r;
    };
    const hurt = proto.hurt;
    proto.hurt = function () {
      const r = hurt.apply(this, arguments);
      if (r) { try { P.emit('hurt', { amount: arguments[0], src: arguments[1] }); } catch (e) { } }
      return r;
    };
    proto.__progPatched = true;
    return true;
  };
  P.patch();

  // Lv2 起粒子 +50%：包一層 KB.VFX.pn（畫質縮放仍照舊先生效）
  if (KB.VFX && KB.VFX.pn && !KB.VFX.__progPn) {
    const pn = KB.VFX.pn;
    KB.VFX.pn = function (n) { const m = P.partMul(); return pn.call(this, m > 1 ? Math.round(n * m) : n); };
    KB.VFX.__progPn = true;
  }

  // 測試 / 除錯用：清空所有進度
  P.reset = function () {
    const s = S();
    s.abilityLv = {}; s.abilityXp = {}; s.achievements = {}; s.rank = {}; s.secrets = {}; s.prog = {};
    P.resetCombo(); P.comboMax = 0; P.toasts.length = 0; P.pendingUp = null;
    P.run = { levelId: null, hurts: 0, kills: 0, tsKills: 0 };
    store();
    return true;
  };
  S();
})();
