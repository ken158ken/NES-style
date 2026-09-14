// 能力等級 / 連擊 / 成就 KB.PROG（Round 6 系統深度）
// 載入順序：player.js → game.js → **progression.js** → ui.js / menu.js / arena.js
//   （所以這裡可以安全 monkeypatch KB.Player.prototype，並在 KB.save 建好之後補欄位）
//
// ── KB.PROG API（其他 agent 照這個介面呼叫；全部在缺 KB.game / KB.save 時安全 no-op）─────────
//   能力等級   level(key?) / xp(key?) / xpNext(key?) / dmgMul(key?) / partMul(key?) / scaleDmg(dmg, key?)
//   連擊       combo / comboMax / comboT / comboColor() / breakCombo(reason) / update(game)
//   成就       ACH（40 條定義）/ has(id) / unlock(id, {silent}) / achCount() / achTotal() / achTimeStr(id)
//              backfill()  ← 換存檔槽 / 載入存檔後呼叫：把「已經成立」的成就靜默補齊（不跳卡片）
//   評價       rankOf(game) / rankData(game) / saveRank(levelId, rank) / bestRank(levelId)
//   事件       emit(event, data) / on(event, fn)  ← 其他系統只要呼叫 emit 就會算成就
//   關卡       beginLevel(game)（game.js enter 呼叫，重置連擊 / 本關統計）
//   繪製       drawHUD(ctx, game)（連擊數字 + 成就 toast + KB.AWAKEN 覺醒量表）/ drawLvStars(ctx, x, y, key)
//
// ── Round 7（awaken）：等級上限變成 4 ─────────────────────────────────────────
//   xp 3 → Lv2、8 → Lv3、**15 → Lv4「覺醒」**；dmgMul 1 / 1.25 / 1.5 / **1.75**、partMul 1 / 1.5 / 1.5 / **2**。
//   Lv4 的 HUD / 圖鑑會畫 4 顆星（第 4 顆是金色覺醒星），覺醒量表與覺醒招在 src/awaken.js（KB.AWAKEN）。
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
//   KB.PROG.emit('arenaClear',{time, beaten, total})  競技場通關（arena.js 已接 time；beaten/total 給「6 連戰」成就）
//   ---- Round 8（ach2）新增；括號內是「沒有人 emit 時的自動偵測」----
//   KB.PROG.emit('awaken',   {key})        發動覺醒（自動偵測 KB.AWAKEN.activeT 由 0 變正）
//   KB.PROG.emit('union',    {})           夥伴合體技（自動偵測 KB.Helper.unionCD 由 0 變滿）
//   KB.PROG.emit('helperKill',{enemy})     夥伴擊殺（自動偵測 e._killSrc.fromHelper）
//   KB.PROG.emit('elemKill', {elem:'fire'|'ice'|'spark'|'wind'})   元素擊殺（自動偵測 KB.ELEM.of(e._killSrc)）
//   KB.PROG.emit('bossDefeated', {boss, hp, awaken})               awaken 省略時看 KB.AWAKEN.active()
(function () {
  'use strict';
  const KB = window.KB;
  const P = KB.PROG = KB.PROG || {};

  // ---------------------------------------------------------------- 存檔欄位
  // KB.save.abilityXp[key] 累積取得次數、abilityLv[key] 快取等級、achievements{id:time}、
  // rank[levelId] 最佳評價、secrets{levelId:roomIdx…} 已找到的秘密房、prog{} 跨關累計計數器。
  // Round 7（awaken）：第 4 級「覺醒」。xp 15 → Lv4、dmgMul 1.75、粒子 ×2，
  //   HUD / 圖鑑畫 4 顆星（第 4 顆金色）；覺醒量表與覺醒招見 src/awaken.js（KB.AWAKEN）。
  const MAXLV = 4;
  const XP_NEED = [0, 3, 8, 15];          // 到達 Lv2 需 3 xp、Lv3 需 8 xp、Lv4 需 15 xp
  const DMG_MUL = [1, 1.25, 1.5, 1.75];
  const PART_MUL = [1, 1.5, 1.5, 2];

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
  P.holdMul = function (key) { return P.level(key) >= 3 ? 0.8 : 1; };   // Lv3 / Lv4 同樣 ×0.8（招式表數字＝Lv1）

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
    try { v.banner(q.lv >= 4 ? 'AWAKEN!' : 'LEVEL UP!', q.name + '  Lv' + q.lv, '#ffe040'); } catch (e) { }
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
    try { autoDetect(); } catch (e) { }
    // 累積型成就每 30 幀重算一次（不用等下一個事件才跳卡片；便宜）
    if ((++P._watch.tick % 30) === 0) { try { checkPassive(); } catch (e) { } }
    if (P.comboT > 0) { P.comboT--; if (P.comboT === 0) P.combo = 0; }
    if (P.comboPop > 0) P.comboPop--;
    if (P.breakT > 0) P.breakT--;
    for (const t of P.toasts) t.t++;
    P.toasts = P.toasts.filter(t => t.t < TOAST_LIFE);
    P.pumpToasts();
  };
  // 進入關卡：重置本關統計（連擊、受傷次數、時停擊殺）
  P.beginLevel = function (game) {
    P.resetCombo(); P.comboMax = 0; P.breakT = 0; P.toasts.length = 0; P.toastQ.length = 0; P.pendingUp = null;
    P.run = { levelId: game ? game.levelId : null, hurts: 0, kills: 0, tsKills: 0, bossHurts: 0, startedAt: Date.now() };
    P._watch = { awaken: 0, unionCD: 0, boss: null, tick: 0 };
    // 存檔裡「早就成立」的成就在這裡靜默補齊，之後關卡中解鎖的才會跳卡片（見 P.backfill）
    if (P.backfill) P.backfill();
  };
  P.run = { levelId: null, hurts: 0, kills: 0, tsKills: 0, bossHurts: 0 };

  // ---------------------------------------------------------------- 成就（40 條）
  // name：解鎖後顯示的中文名（≤ 6 字）；hint：條件提示（≤ 16 字）
  // 前 20 條是 Round 6 就有的（id 不能改，舊存檔靠 id 對應）；後 20 條是 Round 8 擴充，涵蓋 Round 5~7 的系統。
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
    // ── Round 8（ach2）擴充 20 條 ───────────────────────────────────────────────
    { id: 'mix12', name: '混合大師', hint: '做出 12 種混合能力' },
    { id: 'mix24', name: '混合全通', hint: '做出 24 種混合能力' },
    { id: 'awaken_first', name: '初次覺醒', hint: '第一次發動覺醒' },
    { id: 'awaken10', name: '覺醒十度', hint: '累計覺醒 10 次' },
    { id: 'awaken_boss', name: '覺醒斬王', hint: '覺醒狀態下擊敗魔王' },
    { id: 'lv4_any', name: '極限突破', hint: '把任一能力練到 Lv4' },
    { id: 'lv4_five', name: '五星俱全', hint: '5 種能力達到 Lv4' },
    { id: 'helper_two', name: '三人同行', hint: '同時帶著兩名夥伴' },
    { id: 'union', name: '合體技', hint: '發動夥伴合體技' },
    { id: 'helper_kill20', name: '夥伴突擊', hint: '夥伴累計擊敗 20 隻' },
    { id: 'elem_all', name: '元素全書', hint: '火冰電風各擊敗 1 隻' },
    { id: 'rank_s', name: '華麗通關', hint: '任一世界取得 S 評價' },
    { id: 'clear_w6', name: '星海盡頭', hint: '通關星之彼端 W6' },
    { id: 'clear_w7', name: '真實結局', hint: '通關夢幻迴廊 W7' },
    { id: 'extra_all', name: '異界霸者', hint: 'Extra 通關所有世界' },
    { id: 'arena6', name: '六王連霸', hint: '競技場 6 連戰全勝' },
    { id: 'stars21', name: '星空滿天', hint: '收集 21 顆大星星' },
    { id: 'secret7', name: '無所遁形', hint: '找到 7 個秘密房間' },
    { id: 'nohit_boss', name: '完美討伐', hint: '無傷擊敗任一魔王' },
    { id: 'ach20', name: '成就達人', hint: '解鎖 20 個成就' },
  ];
  P.achTotal = () => P.ACH.length;
  P.achMap = function () { const m = {}; for (const a of P.ACH) m[a.id] = a; return m; };
  P.has = function (id) { return !!S().achievements[id]; };
  P.achCount = function () { const s = S(); return P.ACH.filter(a => s.achievements[a.id]).length; };
  P.achDef = function (id) { return P.ACH.find(a => a.id === id) || null; };

  const TOAST_LIFE = 150;
  // fix6：一次只顯示 1 張成就卡，其餘排隊；變身 / 名稱橫幅播放期間整批延後
  //   （橫幅在畫面正中央、成就卡在遊戲區右下 y152，位置雖然不重疊，但兩段演出同時跑會互相搶注意力）
  P.toasts = [];
  P.toastQ = [];
  P.TOAST_MAX = 1;
  P.TOAST_Y = 150;      // 遊戲區右下（遊戲區 0~192，卡片高 28 → 150~178）
  /** 變身 / LEVEL UP / 必殺名稱橫幅是否正在演出（含 KB.game.abilityFlash 的變身閃光） */
  P.bannerBusy = function () {
    const g = KB.game;
    if (g && (g.abilityFlash | 0) > 0) return true;
    if (P.pendingUp) return true;
    const v = V();
    if (v && v.list) { for (const e of v.list) if (e && (e.kind === 'banner' || e.kind === 'transform')) return true; }
    return false;
  };
  /** 解鎖成就；opts.silent（或 P.silent > 0）＝只寫存檔、不跳卡片也不播音（回溯補發用） */
  P.unlock = function (id, opts) {
    const def = P.achDef(id); if (!def) return false;
    const s = S();
    if (s.achievements[id]) return false;
    s.achievements[id] = Date.now();
    store();
    if (P.silent > 0 || (opts && opts.silent)) return true;
    P.toastQ.push({ id, t: 0 });
    if (P.toastQ.length > 8) P.toastQ.shift();
    sfx('bigstar');
    return true;
  };
  P.silent = 0;
  /**
   * 回溯補發（Round 8 ach2：修「大王退治」誤觸發）
   * ───────────────────────────────────────────────────────────────────────
   * 舊做法：`clear_w5` / `arena_clear` 這種「由存檔旗標推得」的成就寫在 checkPassive 裡，
   * 而 checkPassive 每次 emit 都跑 → 存檔裡 `cleared.w5` 已經是 true（舊存檔、換存檔槽、
   * 或同一個 session 之前打完過 W5）時，會在「之後隨便哪一個事件」才解鎖，
   * 看起來就是「迪迪迪還剩 65% 血就跳出大王退治」（shots/agent_fix7/awaken_boss_after.png）。
   * 新做法：世界通關 / 競技場 / 評價一律在**事件當下**解鎖（emit 'levelClear' / 'arenaClear' / saveRank），
   * 存檔旗標只在這裡靜默補發（開機、每次進關卡、換存檔槽後由 KB.SAVES 呼叫）。
   */
  P.backfill = function () {
    P.silent++;
    try { checkPassive(true); } catch (e) { }
    P.silent = Math.max(0, P.silent - 1);
    return P;
  };
  P.achTime = function (id) { const t = S().achievements[id]; return t ? new Date(t) : null; };
  /** 成就解鎖時間（8×8 點陣字用的 ASCII：'MM/DD HH:MM'；未解鎖回空字串） */
  P.achTimeStr = function (id) {
    const d = P.achTime(id); if (!d || isNaN(d.getTime())) return '';
    const z = n => (n < 10 ? '0' : '') + n;
    return z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  };
  /** 每幀：橫幅演出結束且目前沒有卡片在播 → 放出佇列中的下一張 */
  P.pumpToasts = function () {
    if (P.toasts.length >= P.TOAST_MAX || !P.toastQ.length) return;
    if (P.bannerBusy()) return;
    P.toasts.push(P.toastQ.shift());
  };

  // ---------------------------------------------------------------- 事件
  const handlers = {};
  P.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return P; };
  function bump(name, n) { const s = S(); s.prog[name] = (s.prog[name] | 0) + (n || 1); store(); return s.prog[name]; }
  P.count = name => S().prog[name] | 0;
  P.bump = bump;

  // ★ 一定要讀 KB.save.seen 原始資料：KB.UI.seenCount() 在 ?debug=1（UI.unlockAll）時會回報「全部都發現」，
  //   用它算成就會讓 basic8 / all20 一進遊戲就誤解鎖（Round 8 ach2 修正的第二個誤觸發）。
  const rawSeen = () => (KB.save && KB.save.seen && typeof KB.save.seen === 'object') ? KB.save.seen : {};
  P.rawSeen = rawSeen;
  function seenCount() { const m = rawSeen(); let n = 0; for (const k in m) if (m[k]) n++; return n; }
  P.seenCount = seenCount;
  // 混合能力發現數（KB.save.prog.mixSeen 為主，並從 KB.save.seen 回補舊存檔）
  function mixCount() {
    const s = S(), got = s.prog.mixSeen = s.prog.mixSeen || {};
    const M = KB.MIX;
    if (M && M.isMix) { const seen = rawSeen(); for (const k in seen) if (seen[k] && M.isMix(k)) got[k] = 1; }
    let n = 0; for (const k in got) n++;
    return n;
  }
  P.mixCount = mixCount;
  function noteMix(key) {
    const M = KB.MIX, def = key ? (KB.ABILITIES || {})[key] : null;
    const isMix = !!((M && M.isMix && M.isMix(key)) || (def && (def.mix || def.isMix)));
    if (isMix) {
      const s = S(); s.prog.mixSeen = s.prog.mixSeen || {};
      if (!s.prog.mixSeen[key]) { s.prog.mixSeen[key] = 1; store(); }
    }
    return mixCount();
  }
  P.noteMix = noteMix;
  function lv4Count() { const s = S(); let n = 0; for (const k in s.abilityXp) if (lvOfXp(s.abilityXp[k] | 0) >= MAXLV) n++; return n; }
  P.lv4Count = lv4Count;
  function elemKinds() { const m = S().prog.elemKills || {}; let n = 0; for (const k of ['fire', 'ice', 'spark', 'wind']) if (m[k]) n++; return n; }
  P.elemKinds = elemKinds;
  function sRankCount() { const s = S(); let n = 0; for (const k in s.rank) if (s.rank[k] === 'S') n++; return n; }
  P.sRankCount = sRankCount;
  // Extra 全通：KB.LEVELS 的每一關都在 KB.save.extraCleared 裡
  function extraAllDone() {
    const ls = KB.LEVELS || []; if (ls.length < 5) return false;
    const ec = (KB.save && KB.save.extraCleared) || {};
    return ls.every(l => ec[l.id]);
  }
  P.extraAllDone = extraAllDone;
  /** 目前是不是正在打魔王（用來判定「無傷擊敗魔王」） */
  const inBossFight = () => { const g = KB.game; return !!(g && g.isBossRoom && g.boss && !g.boss.dead); };
  function starTotal() {
    const st = (KB.save && KB.save.stars) || {};
    let n = 0;
    for (const k in st) { const a = st[k]; if (Array.isArray(a)) n += a.filter(Boolean).length; }
    return n;
  }
  P.starTotal = starTotal;
  function secretTotal() { const s = S().secrets; let n = 0; for (const k in s) n += Object.keys(s[k] || {}).length; return n; }
  P.secretTotal = secretTotal;

  /**
   * 「累積型」成就：每次事件（與每 30 幀）都重算一次，便宜且不會漏。
   * deep=true 只在 P.backfill() 內出現：多檢查那些「由存檔旗標推得」的成就（見 P.backfill 註解）。
   */
  function checkPassive(deep) {
    const s = S(), seen = rawSeen();
    const basics = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer'];
    if (basics.every(k => seen[k])) P.unlock('basic8');
    if (seenCount() >= 20) P.unlock('all20');
    let maxLv = 0;
    for (const k in s.abilityXp) { const lv = lvOfXp(s.abilityXp[k] | 0); if (lv > maxLv) maxLv = lv; }
    if (maxLv >= 3) P.unlock('lv3');                 // 成就「登峰造極」＝ Lv3（MAXLV 已是 4）
    if (maxLv >= MAXLV) P.unlock('lv4_any');
    if (lv4Count() >= 5) P.unlock('lv4_five');
    const mixN = mixCount();
    if (mixN >= 1) P.unlock('mix_first');
    if (mixN >= 12) P.unlock('mix12');
    if (mixN >= 24) P.unlock('mix24');
    const st = starTotal(), sec = secretTotal();
    if (st >= 15) P.unlock('stars15');
    if (st >= 21) P.unlock('stars21');
    if (sec >= 5) P.unlock('secret5');
    if (sec >= 7) P.unlock('secret7');
    if (P.count('tsKills') >= 5) P.unlock('timestop5');
    if (P.count('elecWaterKills') >= 3) P.unlock('elec_water');
    if (P.count('burnGrass') >= 10) P.unlock('burn10');
    if (P.count('awakens') >= 1) P.unlock('awaken_first');
    if (P.count('awakens') >= 10) P.unlock('awaken10');
    if (P.count('helperKills') >= 20) P.unlock('helper_kill20');
    if (elemKinds() >= 4) P.unlock('elem_all');
    if (P.count('arenaBeaten') >= 6) P.unlock('arena6');
    if (extraAllDone()) P.unlock('extra_all');
    // ── 只在回溯補發時檢查：正常遊玩時這幾條一律由事件當場解鎖 ──────────────────
    if (deep) {
      const cl = (KB.save && KB.save.cleared) || {};
      if (cl.w5) P.unlock('clear_w5');
      if (cl.w6) P.unlock('clear_w6');
      if (cl.w7) P.unlock('clear_w7');
      if (KB.save.arena && KB.save.arena.cleared) P.unlock('arena_clear');
      if (sRankCount() >= 1) P.unlock('rank_s');
    }
    // 元成就放最後（它自己也算一條 → 門檻改看「其他 39 條裡已解鎖幾條」）
    if (P.achCount() - (P.has('ach20') ? 1 : 0) >= 20) P.unlock('ach20');
  }
  P.checkPassive = checkPassive;

  function noteElemKill(el) {
    const s = S(); s.prog.elemKills = s.prog.elemKills || {};
    if (!s.prog.elemKills[el]) { s.prog.elemKills[el] = 1; store(); }
  }
  /**
   * 擊殺來源統計（夥伴擊殺 / 元素擊殺）。
   * game.js 的 emit('kill', e) 只給敵人本身，所以這裡靠 KB.Enemy.prototype.die 的 monkeypatch
   * 把 src（判定框 / 投射物）記在 e._killSrc 上，再用 KB.ELEM.of(src) 判元素、src.fromHelper 判夥伴。
   */
  function noteKillSource(e) {
    const src = e && e._killSrc; if (!src) return;
    if (src.fromHelper || src.helperSrc) bump('helperKills');
    let el = 'none';
    try { if (KB.ELEM && KB.ELEM.of) el = KB.ELEM.of(src) || 'none'; } catch (err) { }
    if (el && el !== 'none') noteElemKill(el);
  }

  // ---------------------------------------------------------------- 自動偵測（不用等別人 emit）
  // 覺醒（KB.AWAKEN.activeT 由 0 變正）、夥伴數（KB.Helper.count）、合體技（KB.Helper.unionCD 由 0 變滿）、
  // 魔王換人（重置「這場魔王戰有沒有受傷」）。其他 agent 有呼叫 emit 也不會重複計（都是 unlock / 旗標）。
  P._watch = { awaken: 0, unionCD: 0, boss: null, tick: 0 };
  function autoDetect() {
    const w = P._watch;
    const A = KB.AWAKEN;
    if (A) {
      const at = A.activeT | 0;
      if (at > 0 && w.awaken <= 0) { bump('awakens'); P.unlock('awaken_first'); }
      w.awaken = at;
    }
    const H = KB.Helper;
    if (H) {
      if (!P.has('helper') && H.exists && H.exists()) P.emit('helper', {});
      if (!P.has('helper_two') && H.count && H.count() >= 2) P.unlock('helper_two');
      const cd = H.unionCD | 0;
      if (cd > w.unionCD) P.unlock('union');
      w.unionCD = cd;
    }
    const g = KB.game, b = g ? g.boss : null;
    if (b !== w.boss) { w.boss = b; P.run.bossHurts = 0; }
  }
  P.autoDetect = autoDetect;

  P.emit = function (ev, data) {
    data = data || {};
    try {
      switch (ev) {
        case 'kill': {
          P.onKill(data);
          P.run.kills++;
          if (KB.game && (KB.game.timeStopT | 0) > 0) { P.run.tsKills++; bump('tsKills'); }
          if (P.combo >= 10) P.unlock('combo10');
          noteKillSource(data);
          break;
        }
        case 'hurt':
          P.run.hurts++;
          if (inBossFight()) P.run.bossHurts = (P.run.bossHurts | 0) + 1;
          P.breakCombo();
          break;
        case 'abilityGet': {
          P.unlock('first_ability');
          noteMix(data.key);
          break;
        }
        case 'mix': noteMix(data.key); P.unlock('mix_first'); break;
        case 'helper': P.unlock('helper'); break;
        case 'union': P.unlock('union'); break;
        case 'helperKill': bump('helperKills'); break;
        case 'awaken': bump('awakens'); P.unlock('awaken_first'); break;
        case 'inhaleBoss': P.unlock('inhale_boss'); break;
        case 'possess': P.unlock('possess'); break;
        case 'elemKill': {
          if (data.kind === 'water_spark' || data.kind === 'elec_water') bump('elecWaterKills');
          const el = data.elem || (['fire', 'ice', 'spark', 'wind'].indexOf(data.kind) >= 0 ? data.kind : null);
          if (el) noteElemKill(el);
          break;
        }
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
          if ((P.run.bossHurts | 0) === 0) P.unlock('nohit_boss');          // 這場魔王戰完全沒被打到
          const aw = KB.AWAKEN && KB.AWAKEN.active && KB.AWAKEN.active();
          if (data.awaken || aw) P.unlock('awaken_boss');
          P.run.bossHurts = 0;
          break;
        }
        case 'levelClear': {
          const id = data.levelId || (KB.game && KB.game.levelId) || null;
          if (P.run.hurts === 0) P.unlock('nohit_world');
          if (KB.session && KB.session.extra) P.unlock('extra_clear');
          // 世界通關成就：一律在**過關的當下**解鎖（不再由 KB.save.cleared 回推 → 不會在魔王戰中途跳出來）
          if (id === 'w5') P.unlock('clear_w5');
          if (id === 'w6') P.unlock('clear_w6');
          if (id === 'w7') P.unlock('clear_w7');
          break;
        }
        case 'arenaClear': {
          P.unlock('arena_clear');
          if ((data.time | 0) > 0 && data.time <= 180 * 60) P.unlock('arena_fast');
          // 6 連戰：優先吃 data.beaten / data.total，沒有就從 KB.game.arena 推（arena.js 目前只傳 time）
          const a = KB.game && KB.game.arena;
          const beaten = data.beaten !== undefined ? (data.beaten | 0) : (a ? (a.beaten | 0) : 0);
          const total = data.total !== undefined ? (data.total | 0) : (a && a.order ? a.order.length : 0);
          const n = Math.max(beaten, total);
          if (n > P.count('arenaBeaten')) { S().prog.arenaBeaten = n; store(); }
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
    if (rank === 'S') P.unlock('rank_s');          // 拿到 S 的當下就解鎖（不靠存檔回推）
    const s = S(), old = s.rank[levelId];
    if (!old || (RANK_ORD[rank] | 0) > (RANK_ORD[old] | 0)) { s.rank[levelId] = rank; store(); return rank; }
    return old;
  };

  // ---------------------------------------------------------------- 繪製
  // HUD 能力圖示旁的 Lv 星（3×3 小星 ×1~4）
  //   Lv2 白 / Lv3 金 / Lv4 前 3 顆金 + 第 4 顆亮金（每 8 幀閃一次白心）；
  //   覺醒中（KB.AWAKEN.active()）整排全金閃爍。
  P.drawLvStars = function (ctx, x, y, key) {
    const lv = P.level(key); if (!key || lv <= 1) return 0;
    const aw = !!(KB.AWAKEN && KB.AWAKEN.active && KB.AWAKEN.active());
    const base = lv >= 3 ? '#ffe040' : '#e8f0ff';
    const f = (KB.game && KB.game.frame) | 0;
    for (let i = 0; i < lv; i++) {
      const sx = x + i * 4;
      let col = base;
      if (i === 3) col = ((f >> 3) & 1) ? '#fffce0' : '#ffb000';   // 第 4 顆＝覺醒星（金色閃爍）
      if (aw) col = ((f >> 2) & 1) ? '#fffce0' : '#ffe040';
      KB.rect(ctx, sx, y, 3, 3, '#181c28');
      KB.rect(ctx, sx + 1, y, 1, 3, col);
      KB.rect(ctx, sx, y + 1, 3, 1, col);
      // 覺醒星：四個角補一點光芒 + 白色星心，靜止畫面也一眼認得出來
      if (i === 3) {
        KB.rect(ctx, sx + 1, y - 1, 1, 1, col); KB.rect(ctx, sx + 1, y + 3, 1, 1, col);
        KB.rect(ctx, sx - 1, y + 1, 1, 1, col); KB.rect(ctx, sx + 3, y + 1, 1, 1, col);
        KB.rect(ctx, sx + 1, y + 1, 1, 1, '#ffffff');
      }
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
      // R6-P2-01：開場「WORLD n」橫幅播放中時把 COMBO 讓到橫幅底部下方，別把關卡編號蓋掉
      const bb = (KB.UI && KB.UI.bannerBottom) ? KB.UI.bannerBottom(game) : 0;
      const bh = sc * 10 + 4, by = bb > 0 ? bb + 6 : 26, nx = 248, sx = nx - tw - 4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, P.comboT / 20);
      KB.rect(ctx, sx - sw - 5, by, sw + tw + 11, bh, 'rgba(8,14,28,0.55)');
      if (big) big(ctx, txt, nx, by + 2, sc, { color: col, outline: '#181c28', align: 'right' });
      else KB.text(ctx, txt, nx, by + 2, { color: col, align: 'right', outline: '#181c28' });
      KB.text(ctx, sub, sx, by + ((bh - 8) >> 1), { color: col, align: 'right', outline: '#181c28' });
      ctx.restore();
    }
    // 成就 toast：遊戲區右下滑入的卡片（一次 1 張，其餘排隊；避開正中央的變身橫幅與開場 WORLD 橫幅）
    for (let i = 0; i < P.toasts.length; i++) {
      const t = P.toasts[i], def = P.achDef(t.id); if (!def) continue;
      // font agent：名稱改用 12px 像素字（ink 高 12px）⇒ 卡片 26→28，名稱下緣才不會貼到框
      const w = 146, h = 28, y = P.TOAST_Y + i * 32;
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
      T(ctx, def.name, x + 18, y + 12, { color: '#ffe040', size: (KB.UI && KB.UI.MS) || 12 });
      ctx.restore();
    }
    // Round 7（awaken）：能力圖示下方的覺醒量表（KB.AWAKEN 未載入時什麼都不畫）
    if (KB.AWAKEN && KB.AWAKEN.drawGauge) { try { KB.AWAKEN.drawGauge(ctx, game); } catch (e) { } }
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

  // 敵人死亡來源：記在 e._killSrc 上，game.js 下一幀 emit('kill', e) 時就能判斷
  // 「是夥伴打死的」「是什麼元素打死的」（enemies.js / entity.js 一行都沒改）。
  P.patchEnemy = function () {
    const ep = KB.Enemy && KB.Enemy.prototype;
    if (!ep || ep.__progDie) return false;
    const die = ep.die;
    ep.die = function (src) { try { if (src) this._killSrc = src; } catch (e) { } return die.apply(this, arguments); };
    ep.__progDie = true;
    return true;
  };
  P.patchEnemy();

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
    P.resetCombo(); P.comboMax = 0; P.toasts.length = 0; P.toastQ.length = 0; P.pendingUp = null;
    P.run = { levelId: null, hurts: 0, kills: 0, tsKills: 0, bossHurts: 0 };
    P._watch = { awaken: 0, unionCD: 0, boss: null, tick: 0 };
    P.silent = 0;
    store();
    return true;
  };
  S();
  // 開機：把存檔裡早就成立的成就靜默補齊（不跳卡片）
  P.backfill();
})();
