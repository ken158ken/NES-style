// 挑戰模式 KB.CHALLENGE（時間攻擊 / 無傷 / 挑戰塔 / 每日種子）（Round 8 挑戰與個人化 / agent: challenge）
// ============================================================================
// 對外介面
//   KB.ChallengeScene            挑戰選單場景（TitleMenu 以「KB.ChallengeScene 存在」為條件掛入口）
//   KB.CHALLENGE.rng(seed)       決定性亂數（mulberry32）→ function() -> [0,1)
//   KB.CHALLENGE.startTime(id)   時間攻擊（無限命、計時 mm:ss.ff）
//   KB.CHALLENGE.startNohit(id)  無傷挑戰（受傷即失敗）
//   KB.CHALLENGE.startTower(o)   挑戰塔（10 層，種子決定房間序列與修飾條件）
//   KB.CHALLENGE.startDaily()    每日挑戰（seed = YYYYMMDD，3 層 + 固定修飾，每天一次）
//   KB.CHALLENGE.towerPlan(seed, floors, o)   → 決定性的樓層計畫（測試用，不會改到任何狀態）
//   KB.CHALLENGE.MODS / MOD_LIST 修飾條件表
//   KB.CHALLENGE.best*()         各種最佳紀錄（records.js「挑戰」頁用）
//
// game.js 的鉤子（只有 7 個，全部在 this.challenge 為 null 時完全不動作）
//   constructor  this.challenge = opts.challenge || null
//   loadRoom 末  KB.CHALLENGE.onRoom(game)    敵人加速 / 1HP / 房間旗標
//   enter 末     KB.CHALLENGE.onEnter(game)   opts.hp 套用後再夾一次上限
//   update       KB.CHALLENGE.tick(game)      無傷判定 / 時限 / 禁吸入
//   update 220   KB.CHALLENGE.afterClear(game)  跳過一般結算，直接進挑戰結算
//   useDoor      KB.CHALLENGE.exitDoor(game)  挑戰塔的出口門＝下一層
//   playerDied   KB.CHALLENGE.onDeath(game)   時間攻擊不扣命 / 其餘直接結算
//   levelClear   挑戰模式不寫 cleared / playCount（只記挑戰紀錄）
//   draw         KB.CHALLENGE.drawHUD(ctx, game)  計時 + 層數 + 修飾橫幅
//
// 存檔（KB.save.challenge，舊存檔自動補齊）
//   time[levelId]      = 幀（最短）
//   nohit[levelId]     = true
//   nohitTime[levelId] = 幀（最短）
//   tower = { bestFloor, bestTime, clears }
//   daily[YYYYMMDD]    = { floor, time, ok }
//   arena[variant]     = { bestTime, cleared }   （Boss Rush 變體，arena.js 寫入）
// ============================================================================
(function () {
  'use strict';
  const W = KB.W, H = KB.H, VH = KB.VIEW_H, T = KB.TILE;
  const UI = KB.UI;
  const TX = UI.text, fit = UI.fitText, C = UI.C;
  const panel = UI.panel, cursor = UI.cursor;
  const sfx = UI.sfx;
  const MS = () => UI.MS;
  const hasSong = k => !!(KB.audio && KB.audio.SONGS && KB.audio.SONGS[k]);
  const music = (list) => { for (const k of list) if (hasSong(k)) { UI.music(k); return k; } UI.music(null); return null; };
  // audio8：挑戰塔隨層數加速（1.0 → 1.3）；離開挑戰模式一定要還原成 1
  const tempo = k => { try { if (KB.audio && KB.audio.setTempoMul) KB.audio.setTempoMul(k); } catch (e) { } };

  const CH = {};
  KB.CHALLENGE = CH;

  // ==========================================================================
  // 決定性亂數（mulberry32）：同一個 seed 一定產生同一串數列
  // ==========================================================================
  CH.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  CH.hash = function (str) {
    let h = 2166136261 >>> 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  // 日期 → 'YYYYMMDD'（本機時區；測試可傳入 Date）
  CH.dateKey = function (d) {
    d = d || new Date();
    const p = n => String(n).padStart(2, '0');
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  };
  CH.dateSeed = function (key) { return (parseInt(key || CH.dateKey(), 10) || 1) >>> 0; };

  // ==========================================================================
  // 時間格式 mm:ss.ff（ff = 百分之一秒）
  // ==========================================================================
  const p2 = n => String(Math.max(0, n | 0)).padStart(2, '0');
  function mmssff(f) {
    f = Math.max(0, f | 0);
    const s = Math.floor(f / 60);
    return p2(Math.floor(s / 60) % 100) + ':' + p2(s % 60) + '.' + p2(Math.floor((f % 60) * 100 / 60));
  }
  CH.mmssff = mmssff;
  CH.mmss = f => UI.mmss(f);

  // ==========================================================================
  // 存檔
  // ==========================================================================
  function S() {
    KB.save = KB.save || {};
    const c = KB.save.challenge = KB.save.challenge || {};
    c.time = c.time || {}; c.nohit = c.nohit || {}; c.nohitTime = c.nohitTime || {};
    c.tower = c.tower || { bestFloor: 0, bestTime: 0, clears: 0 };
    c.daily = c.daily || {}; c.arena = c.arena || {};
    return c;
  }
  CH.save = S;
  const store = () => { try { KB.saveGame && KB.saveGame(); } catch (e) { } };

  CH.bestTime = id => (S().time[id] | 0) || 0;
  CH.bestNohit = id => !!S().nohit[id];
  CH.bestNohitTime = id => (S().nohitTime[id] | 0) || 0;
  CH.bestTower = () => S().tower;
  CH.dailyRecord = key => S().daily[key || CH.dateKey()] || null;
  CH.dailyDone = key => !!CH.dailyRecord(key);
  // 最近 n 天的每日紀錄（records.js「挑戰」頁用）
  CH.dailyRecent = function (n) {
    const out = [], now = new Date();
    for (let i = 0; i < (n || 7); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = CH.dateKey(d);
      out.push({ key, rec: S().daily[key] || null, today: i === 0 });
    }
    return out;
  };

  // 可挑戰的世界（已通關者；?debug=1 全開）
  CH.worlds = function () {
    const all = (KB.LEVELS || []);
    if (KB.DEBUG || (UI && UI.unlockAll)) return all.slice();
    return all.filter(l => !!(KB.save && KB.save.cleared && KB.save.cleared[l.id]));
  };

  function emitClear(data) { try { if (KB.PROG && KB.PROG.emit) KB.PROG.emit('challengeClear', data || {}); } catch (e) { } }
  CH.emitClear = emitClear;

  // ==========================================================================
  // 修飾條件表（挑戰塔 / 每日挑戰）
  //   gen  = 生成房間時就套用（改資料）
  //   run  = 進房時 / 每幀套用（改實體）
  // ==========================================================================
  const MODS = {
    fast: { name: '疾走', desc: '敵人速度 ×1.3', color: '#ff9060', run: true },
    onehp: { name: '一擊必殺', desc: '生命上限只有 1', color: '#ff5060', run: true },
    random: { name: '隨機能力', desc: '進場給一個隨機能力', color: '#80e0ff', run: true },
    noinhale: { name: '封印之口', desc: '無能力且不能吸入', color: '#c8a0ff', run: true },
    mirror: { name: '鏡像', desc: '地圖左右相反', color: '#a0ffd0', gen: true },
    dark: { name: '黑暗', desc: '視野只剩卡比周圍', color: '#8090c0', gen: true },
    double: { name: '倍化', desc: '敵人數量加倍', color: '#ffd040', gen: true },
    timed: { name: '時限', desc: '90 秒內離開這一層', color: '#ff80c0', run: true, limit: 90 * 60 },
  };
  CH.MODS = MODS;
  CH.MOD_LIST = Object.keys(MODS);
  // 魔王層不適用的修飾（沒有雜兵可加倍、鏡像會動到魔王出生點）
  const BOSS_MODS = ['fast', 'onehp', 'random', 'noinhale', 'timed'];
  CH.modName = k => (MODS[k] ? MODS[k].name : k);

  // ==========================================================================
  // 房間深拷貝 + 修飾
  // ==========================================================================
  function deepRoom(room) {
    const c = Object.assign({}, room);
    c.map = (room.map || []).slice();
    if (room.deco) c.deco = room.deco.slice();
    c.entities = (room.entities || []).map(e => Object.assign({}, e));
    c.doors = [];                                  // 塔的每一層只有一扇「出口門」
    if (room.spawn) c.spawn = room.spawn.slice();
    if (room.exit) c.exit = { x: room.exit.x, y: room.exit.y };
    if (room.bossPos) c.bossPos = room.bossPos.slice();
    c.secret = false;
    return c;
  }
  CH.deepRoom = deepRoom;

  // 左右鏡像：地圖 / 裝飾逐列反轉（斜坡 / \ 互換），所有座標 x → w-1-x。
  // 鏡像是等距變換 ⇒ 原本站得住的格子鏡像後一樣站得住，不需要重新找出生點。
  const FLIP = { '/': '\\', '\\': '/' };
  function mirrorRow(row) {
    let out = '';
    for (let i = row.length - 1; i >= 0; i--) { const ch = row[i]; out += (FLIP[ch] || ch); }
    return out;
  }
  function mirrorRoom(room) {
    const w = room.map[0].length;
    room.map = room.map.map(mirrorRow);
    if (room.deco) room.deco = room.deco.map(r => r.split('').reverse().join(''));
    for (const e of room.entities) { e.x = w - 1 - e.x; if (e.dir) e.dir = -e.dir; }
    if (room.spawn) room.spawn[0] = w - 1 - room.spawn[0];
    if (room.exit) room.exit.x = w - 1 - room.exit.x;
    if (room.bossPos) room.bossPos[0] = w - 1 - room.bossPos[0];
    room.mirrored = true;
    return room;
  }
  CH.mirrorRoom = mirrorRoom;

  // 倍化：先把該來源房的 Extra 疊加層強制疊上去（＝ levels_extra 的強力敵人），
  // 再把房裡原有的敵人複製一份（往右挪 2 格，超出地圖就往左挪）。
  function doubleEnemies(room, lvId, rIdx) {
    const w = room.map[0].length;
    const isEnemy = t => !!(KB.ENEMIES && KB.ENEMIES[t]);
    const src = room.entities.filter(e => isEnemy(e.t));
    for (const e of src) {
      const c = Object.assign({}, e);
      c.x = e.x + 2 <= w - 2 ? e.x + 2 : Math.max(1, e.x - 2);
      room.entities.push(c);
    }
    void lvId; void rIdx;
    return room;
  }

  // ==========================================================================
  // 挑戰塔：樓層計畫（純函式，同 seed 一定同結果）
  // ==========================================================================
  // 可用的「非魔王 / 非秘密」房間
  function normalRooms(level) {
    const out = [];
    (level.rooms || []).forEach((r, i) => {
      if (r.secret || r.bossRoom) return;
      if (level.boss && i === level.rooms.length - 1 && !r.noBoss) return;
      if (!(r.doors && r.doors.length) && !r.exit) return;    // 找不到出口的房間不用
      out.push(i);
    });
    return out;
  }
  function bossRoomIdx(level) { const i = (level.rooms || []).findIndex(r => r.bossRoom); return i >= 0 ? i : Math.max(0, level.rooms.length - 1); }
  CH.normalRooms = normalRooms;

  // 樓層 f（1-based）可抽到的世界範圍（依層數提升）
  function worldRange(f, floors, n) {
    const hi = Math.max(1, Math.min(n, Math.ceil(f * n / floors)));
    const lo = Math.max(1, hi - 2);
    return [lo, hi];
  }
  CH.worldRange = worldRange;

  CH.towerPlan = function (seed, floors, o) {
    o = o || {};
    floors = floors || 10;
    const r = CH.rng((seed >>> 0) || 1);
    const levels = (KB.LEVELS || []).filter(l => l && l.rooms && l.rooms.length);
    const n = Math.max(1, levels.length);
    const bossFloors = o.bossFloors || (floors >= 10 ? [5, floors] : [floors]);
    const fixedMods = o.mods || null;
    const plan = [];
    const used = {};
    for (let f = 1; f <= floors; f++) {
      const [lo, hi] = worldRange(f, floors, n);
      const pool = levels.slice(lo - 1, hi);
      const isBoss = bossFloors.indexOf(f) >= 0;
      const lv = pick(r, pool.length ? pool : levels);
      let rIdx;
      if (isBoss) rIdx = bossRoomIdx(lv);
      else {
        const cand = normalRooms(lv);
        // 同一場塔盡量不要重複同一間房（全部用過就允許重複）
        const fresh = cand.filter(i => !used[lv.id + ':' + i]);
        rIdx = pick(r, fresh.length ? fresh : cand);
        used[lv.id + ':' + rIdx] = 1;
      }
      // 修飾條件 1~2 個（第 1 層固定 1 個）
      const avail = (isBoss ? BOSS_MODS : CH.MOD_LIST).slice();
      let mods;
      if (fixedMods) mods = (fixedMods[f - 1] || []).filter(k => MODS[k] && (!isBoss || BOSS_MODS.indexOf(k) >= 0));
      else {
        const count = f === 1 ? 1 : (r() < 0.45 ? 1 : 2);
        mods = [];
        for (let i = 0; i < count && avail.length; i++) {
          const k = avail.splice(Math.floor(r() * avail.length), 1)[0];
          mods.push(k);
        }
      }
      // 隨機能力 mod 的能力也要由種子決定
      const keys = (KB.ABILITY_KEYS || []).slice();
      const ability = mods.indexOf('random') >= 0 && keys.length ? pick(r, keys) : null;
      plan.push({
        floor: f, lv: lv.id, room: rIdx, boss: isBoss ? (lv.boss || null) : null,
        bossName: isBoss ? (lv.bossName || '') : '',
        name: (lv.rooms[rIdx] && lv.rooms[rIdx].name) || lv.name || lv.id,
        mods, ability,
        limit: mods.indexOf('timed') >= 0 ? MODS.timed.limit : 0,
      });
    }
    return plan;
  };

  // 每日挑戰：3 層 + 固定修飾（第 3 層是魔王）
  const DAILY_MODS = [['fast'], ['mirror', 'dark'], ['onehp']];
  CH.dailyPlan = function (key) {
    key = key || CH.dateKey();
    return CH.towerPlan(CH.dateSeed(key), 3, { bossFloors: [3], mods: DAILY_MODS });
  };

  // ---- 依計畫生成 KB.EXTRA_LEVELS.tower（動態關卡；每層重建一次）----
  CH.buildFloor = function (plan, floor) {
    const f = plan[Math.max(0, Math.min(plan.length - 1, floor - 1))];
    const lv = (KB.LEVELS || []).find(l => l.id === f.lv) || KB.LEVELS[0];
    // 倍化：先讓 levels_extra 的 Extra 疊加層強制生效（回傳的是副本）
    let src = lv.rooms[f.room];
    if (f.mods.indexOf('double') >= 0 && KB.applyRoomLayers) src = KB.applyRoomLayers(lv.id, f.room, src, true);
    const room = deepRoom(src);
    room.theme = src.theme || lv.theme;
    room.name = f.name;
    // 出口：原本的（非秘密）門 → 過關門；魔王房用原本的 exit
    if (!f.boss) {
      room.noBoss = true; room.bossRoom = false;
      const ds = (src.doors || []).filter(d => !d.secret && !d.locked);
      const d = ds.length ? ds[ds.length - 1] : null;
      if (d) room.exit = { x: d.x, y: d.y };
      else if (!room.exit) room.exit = { x: room.map[0].length - 3, y: room.map.length - 3 };
    } else { room.bossRoom = true; room.noBoss = false; }
    // 生成期修飾
    if (f.mods.indexOf('double') >= 0) doubleEnemies(room, lv.id, f.room);
    if (f.mods.indexOf('mirror') >= 0) mirrorRoom(room);
    if (f.mods.indexOf('dark') >= 0) room.dark = true;
    room.challengeMods = f.mods.slice();
    KB.EXTRA_LEVELS = KB.EXTRA_LEVELS || {};
    KB.EXTRA_LEVELS.tower = {
      id: 'tower', name: '挑戰塔 ' + f.floor + 'F', theme: room.theme,
      music: lv.music || room.theme, boss: f.boss || null, bossName: f.bossName || '',
      rooms: [room], challengeFloor: f,
    };
    return KB.EXTRA_LEVELS.tower;
  };

  // ==========================================================================
  // 挑戰狀態
  // ==========================================================================
  function chTime(ch, game) { return (ch ? (ch.base | 0) : 0) + (game ? (game.timeAlive | 0) : 0); }
  CH.time = chTime;
  function mods(game) { const ch = game && game.challenge; return (ch && ch.mods) || []; }
  const hasMod = (game, k) => mods(game).indexOf(k) >= 0;
  CH.hasMod = hasMod;

  function newRun(type, o) {
    return Object.assign({
      type, base: 0, deaths: 0, floor: 1, floors: 1, score: 0, hp: 0, ability: null,
      mods: [], limit: 0, failed: false, bannerAt: 0,
    }, o || {});
  }

  function startGame(levelId, ch, opts) {
    UI.newSession(opts && opts.lives !== undefined ? opts.lives : 0, 0, false);
    const g = new KB.GameScene(levelId, Object.assign({ challenge: ch, lives: 0, score: ch.score | 0 }, opts || {}));
    KB.setScene(g);
    ch.bannerAt = 0;
    return g;
  }

  // ---- 時間攻擊 ----
  CH.startTime = function (levelId) {
    const ch = newRun('time', { levelId });
    const g = startGame(levelId, ch, { lives: 9 });
    tempo(1);
    music(['timeattack', 'challenge', g.musicKey || 'green']);
    return g;
  };
  // ---- 無傷挑戰 ----
  CH.startNohit = function (levelId) {
    const ch = newRun('nohit', { levelId });
    const g = startGame(levelId, ch, { lives: 0 });
    tempo(1);
    music(['challenge', 'timeattack', g.musicKey || 'green']);
    return g;
  };
  // ---- 挑戰塔 / 每日挑戰 ----
  function enterFloor(ch) {
    const f = ch.plan[ch.floor - 1];
    CH.buildFloor(ch.plan, ch.floor);
    ch.mods = f.mods.slice();
    ch.limit = f.limit | 0;
    const opts = { lives: 0, hp: ch.hp || undefined };
    if (f.mods.indexOf('noinhale') < 0) {
      const ab = f.ability || ch.ability;
      if (ab && KB.ABILITIES && KB.ABILITIES[ab]) opts.ability = ab;
    }
    const g = startGame('tower', ch, opts);
    // 樓層越高音樂越快（audio8：setTempoMul 1.0~1.3，不重啟曲子）
    tempo(1 + 0.3 * Math.max(0, ch.floor - 1) / Math.max(1, ch.floors - 1));
    music(['tower', 'challenge', g.musicKey || 'castle']);
    return g;
  }
  CH.enterFloor = enterFloor;

  CH.startTower = function (o) {
    o = o || {};
    const floors = o.floors || 10;
    const seed = (o.seed !== undefined && o.seed !== null) ? (o.seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0);
    const ch = newRun('tower', {
      seed, floors, floor: Math.max(1, Math.min(floors, o.floor || 1)),
      plan: o.plan || CH.towerPlan(seed, floors),
    });
    return enterFloor(ch);
  };
  CH.startDaily = function (o) {
    o = o || {};
    const key = o.key || CH.dateKey();
    const plan = CH.dailyPlan(key);
    const ch = newRun('daily', { seed: CH.dateSeed(key), dateKey: key, floors: plan.length, floor: 1, plan });
    return enterFloor(ch);
  };

  // ==========================================================================
  // 紀錄寫入
  // ==========================================================================
  function recordTime(levelId, frames) {
    const c = S(), prev = c.time[levelId] | 0;
    const isBest = !prev || frames < prev;
    if (isBest) { c.time[levelId] = frames; store(); }
    emitClear({ type: 'time', levelId, time: frames, best: isBest });
    return isBest;
  }
  function recordNohit(levelId, frames) {
    const c = S(), had = !!c.nohit[levelId], prev = c.nohitTime[levelId] | 0;
    c.nohit[levelId] = true;
    const isBest = !prev || frames < prev;
    if (isBest) c.nohitTime[levelId] = frames;
    store();
    emitClear({ type: 'nohit', levelId, time: frames, best: isBest, first: !had });
    return isBest;
  }
  function recordTower(ch, ok, floorReached) {
    const c = S(), t = c.tower;
    const time = ch.base | 0;
    let best = false;
    if (floorReached > (t.bestFloor | 0)) { t.bestFloor = floorReached; best = true; }
    if (ok) {
      t.clears = (t.clears | 0) + 1;
      if (!(t.bestTime | 0) || time < t.bestTime) { t.bestTime = time; best = true; }
    }
    store();
    emitClear({ type: 'tower', seed: ch.seed, floor: floorReached, floors: ch.floors, time, ok, best });
    return best;
  }
  function recordDaily(ch, ok, floorReached) {
    const c = S(), key = ch.dateKey || CH.dateKey();
    const time = ch.base | 0;
    const prev = c.daily[key];
    if (!prev) c.daily[key] = { floor: floorReached, time, ok: !!ok };
    store();
    emitClear({ type: 'daily', date: key, floor: floorReached, floors: ch.floors, time, ok });
    return !prev;
  }

  // ==========================================================================
  // game.js 鉤子
  // ==========================================================================
  // 進房：敵人加速 / 1HP / 倍化後的實體收尾
  CH.onRoom = function (game) {
    const ch = game && game.challenge; if (!ch) return;
    const p = game.player;
    if (hasMod(game, 'fast')) {
      for (const e of game.entities) {
        if (e.type !== 'enemy') continue;
        e.extraApplied = true;                     // 擋掉 Enemy.applyExtra 之後覆寫 exK
        e.exK = (e.exK || 1) * 1.3;
      }
    }
    if (p && hasMod(game, 'onehp')) { p.maxHp = 1; p.hp = Math.min(p.hp, 1); }
    ch.roomFrame = game.frame | 0;
    ch.bannerAt = game.frame | 0;
  };
  // enter 末（opts.hp 之後）：再夾一次 HP 上限
  CH.onEnter = function (game) {
    const ch = game && game.challenge; if (!ch) return;
    const p = game.player;
    if (p) { if (hasMod(game, 'onehp')) p.maxHp = 1; p.hp = Math.max(1, Math.min(p.hp, p.maxHp)); }
    if (KB.PROG && KB.PROG.run) KB.PROG.run.hurts = 0;     // 無傷判定從進場開始算
    ch.bannerAt = game.frame | 0;
  };
  // 每幀：無傷 / 時限 / 禁吸入
  CH.tick = function (game) {
    const ch = game && game.challenge; if (!ch || ch.failed) return;
    const p = game.player;
    // 封印之口：吸入動作立刻取消（無能力時的唯一攻擊手段被封印）
    if (p && hasMod(game, 'noinhale') && (p.state === 'inhale' || p.swimInhaleT > 0)) {
      p.swimInhaleT = 0;
      if (p.state === 'inhale') { p.setState('idle'); if (game.frame % 20 === 0) game.toast('吸入被封印了！'); }
    }
    // 無傷：受傷即失敗
    if (ch.type === 'nohit' && KB.PROG && KB.PROG.run && (KB.PROG.run.hurts | 0) > 0) { sfx('nohit_fail'); CH.fail(game, 'hit'); return; }
    // 時限：最後 10 秒每秒一聲 tick，時間到 time_up
    if (ch.limit > 0 && game.clearT < 0) {
      const left = ch.limit - (game.timeAlive | 0);
      if (left <= 600 && left > 0 && left % 60 === 0) sfx('tick');
      if (left <= 0) { sfx('time_up'); CH.fail(game, 'time'); return; }
    }
  };
  // 出口門：挑戰塔 → 下一層（回傳 true 代表已接管）
  CH.exitDoor = function (game) {
    const ch = game && game.challenge; if (!ch) return false;
    if (ch.type !== 'tower' && ch.type !== 'daily') return false;
    commit(ch, game);
    sfx('floor_clear');
    if (ch.floor >= ch.floors) { CH.finishTower(ch, true); return true; }
    ch.floor++;
    game.fadeTo(() => enterFloor(ch));
    return true;
  };
  // 死亡：時間攻擊不扣命；其餘直接結算
  CH.onDeath = function (game) {
    const ch = game && game.challenge; if (!ch) return null;
    if (ch.type === 'time') { ch.deaths++; game.lives = 9; return 'respawn'; }
    CH.fail(game, 'dead');
    return 'handled';
  };
  // 過關（time / nohit）：不寫 cleared / playCount，只記挑戰紀錄
  CH.onClear = function (game) {
    const ch = game && game.challenge; if (!ch) return;
    ch.clearTime = chTime(ch, game);
    if (ch.type === 'time') ch.newBest = recordTime(ch.levelId, ch.clearTime);
    else if (ch.type === 'nohit') ch.newBest = recordNohit(ch.levelId, ch.clearTime);
  };
  // 過關演出結束（clearT === 220）：直接進挑戰結算（沒有滾動計分）
  CH.afterClear = function (game) {
    const ch = game && game.challenge; if (!ch) return;
    const prev = ch.type === 'time' ? CH.bestTime(ch.levelId) : CH.bestNohitTime(ch.levelId);
    CH.result(game, {
      type: ch.type, ok: true, levelId: ch.levelId,
      time: ch.clearTime | 0, best: prev, newBest: !!ch.newBest, deaths: ch.deaths | 0,
    });
  };

  function commit(ch, game) {
    ch.base = (ch.base | 0) + (game ? (game.timeAlive | 0) : 0);
    if (game) {
      ch.score = game.score | 0;
      if (game.player) { ch.hp = Math.max(1, game.player.hp | 0); ch.ability = game.player.ability || null; }
    }
  }

  CH.finishTower = function (ch, ok, reason) {
    const reached = ok ? ch.floors : ch.floor;
    const rec = (ch.type === 'daily') ? recordDaily(ch, ok, reached) : recordTower(ch, ok, reached);
    CH.result(null, {
      type: ch.type, ok: !!ok, time: ch.base | 0, floor: reached, floors: ch.floors,
      seed: ch.seed, dateKey: ch.dateKey, newBest: !!rec, reason: reason || ch.reason || null,
      best: ch.type === 'daily' ? 0 : (S().tower.bestTime | 0),
    });
  };

  // 失敗（無傷被打中 / 時限到 / 死亡）
  CH.fail = function (game, reason) {
    const ch = game && game.challenge; if (!ch || ch.failed) return;
    ch.failed = true; ch.reason = reason;
    commit(ch, game);
    if (ch.type === 'tower' || ch.type === 'daily') { CH.finishTower(ch, false, reason); return; }
    CH.result(game, {
      type: ch.type, ok: false, reason, levelId: ch.levelId, time: ch.base | 0,
      best: ch.type === 'time' ? CH.bestTime(ch.levelId) : CH.bestNohitTime(ch.levelId),
      deaths: ch.deaths | 0,
    });
  };

  CH.result = function (game, res) {
    const go = () => KB.setScene(new ChallengeResultScene(res));
    if (game && game.fadeTo && game.clearT < 0 && !res.ok) go();      // 失敗立刻切（不等淡出）
    else go();
  };

  // ==========================================================================
  // HUD（game.js draw 在 KB.drawHUD 之後呼叫）
  // ==========================================================================
  const TYPE_LABEL = { time: 'TIME', nohit: 'NOHIT', tower: 'TOWER', daily: 'DAILY' };
  CH.drawHUD = function (ctx, game) {
    const ch = game && game.challenge; if (!ch) return;
    const L = UI.LAYOUT.hud, f = game.frame | 0;
    const t = chTime(ch, game);
    // 右側整塊重畫（蓋掉 SCORE 0000000 與生命；SCORE 右對齊 251 ⇒ 實際從 x=147 起，所以從 144 蓋起）
    KB.rect(ctx, 144, KB.HUD_Y + 1, W - 144, H - KB.HUD_Y - 1, '#000');
    // 第 1 列（y 197）：左邊模式 / 層數，右邊附註（最佳 / 無傷狀態 / 種子）
    const lab = ch.type === 'tower' || ch.type === 'daily'
      ? ((ch.type === 'daily' ? 'D ' : 'F ') + ch.floor + '/' + ch.floors)
      : TYPE_LABEL[ch.type] || 'CHAL';
    KB.text(ctx, lab, 150, L.rowA, { color: C.yellow });
    if (ch.type === 'nohit') {
      const hurts = (KB.PROG && KB.PROG.run) ? (KB.PROG.run.hurts | 0) : 0;
      KB.text(ctx, hurts ? 'HIT!' : 'CLEAN', L.right, L.rowA, { color: hurts ? '#ff4040' : '#80ffa0', align: 'right' });
    } else if (ch.type === 'time') {
      const b = CH.bestTime(ch.levelId);
      KB.text(ctx, b ? 'B' + UI.mmss(b) : 'B--:--', L.right, L.rowA, { color: b ? '#c8d8f0' : '#5c6884', align: 'right' });
    } else {
      KB.text(ctx, 'S' + (((ch.seed >>> 0) % 100000)), L.right, L.rowA, { color: '#8fa0bc', align: 'right' });
    }
    // 第 2 列（y 208）：計時 mm:ss.ff（魔王血條佔 x 66~156，這裡從 x=187 起不會撞到）
    let col = C.cyan, show = t;
    if (ch.limit > 0) {
      const left = Math.max(0, ch.limit - (game.timeAlive | 0));
      show = left; col = left < 10 * 60 ? (((f >> 2) & 1) ? '#ff4040' : '#ffd0d0') : (left < 30 * 60 ? '#ffa040' : C.cyan);
    }
    KB.text(ctx, mmssff(show), L.right, 208, { color: col, align: 'right' });
    // 修飾條件橫幅（進房後 170 幀）
    const age = f - (ch.bannerAt | 0);
    if (ch.mods && ch.mods.length && age >= 0 && age < 170) {
      const a = Math.min(1, age / 12, (170 - age) / 20);
      const oa = ctx.globalAlpha; ctx.globalAlpha = Math.max(0, a);
      const y = 26;
      KB.rect(ctx, 0, y, W, 32, 'rgba(0,0,0,0.6)');
      KB.rect(ctx, 0, y, W, 1, '#ffe040'); KB.rect(ctx, 0, y + 31, W, 1, '#ffe040');
      const head = (ch.type === 'daily' ? '每日 ' : '') + '第 ' + ch.floor + ' 層　' + (ch.plan ? ch.plan[ch.floor - 1].name : '');
      fit(ctx, head, W / 2, y + 2, 244, { color: '#fff', align: 'center', size: MS() });
      const names = ch.mods.map(k => CH.modName(k)).join('　');
      fit(ctx, names, W / 2, y + 17, 244, { color: MODS[ch.mods[0]] ? MODS[ch.mods[0]].color : C.yellow, align: 'center', size: MS() });
      ctx.globalAlpha = oa;
    }
  };

  // ==========================================================================
  // 挑戰選單 KB.ChallengeScene
  // ==========================================================================
  const ITEMS = [
    { id: 'time', name: '時間攻擊', en: 'TIME ATTACK', desc: '選一個已通關的世界，比誰跑得快。死亡不扣命，但時間繼續跑。' },
    { id: 'nohit', name: '無傷挑戰', en: 'NO HIT', desc: '選一個已通關的世界，被打中一次就結束。' },
    { id: 'tower', name: '挑戰塔', en: 'TOWER', desc: '10 層隨機房間，每層都有 1~2 個修飾條件，第 5 / 10 層是魔王。' },
    { id: 'daily', name: '每日挑戰', en: 'DAILY', desc: '每天一組固定種子的 3 層塔，每天只能挑戰一次。' },
    { id: 'arena', name: 'Boss Rush', en: 'BOSS RUSH', desc: '競技場的 Extra 變體與「全 7 魔王」連戰。' },
  ];
  CH.ITEMS = ITEMS;
  const ARENA_OPTS = [
    { id: 'normal', name: '一般', o: {} },
    { id: 'extra', name: 'Extra 變體', o: { extra: true } },
    { id: 'all7', name: '全 7 魔王', o: { all7: true } },
    { id: 'extra_all7', name: 'Extra + 全 7 魔王', o: { extra: true, all7: true } },
  ];
  CH.ARENA_OPTS = ARENA_OPTS;

  function summaryOf(id) {
    if (id === 'time') {
      const ws = (KB.LEVELS || []).filter(l => CH.bestTime(l.id));
      if (!ws.length) return ['--:--', '#5c6884'];
      let b = 0; for (const l of ws) { const t = CH.bestTime(l.id); if (!b || t < b) b = t; }
      return [ws.length + ' 關　' + UI.mmss(b), C.cyan];
    }
    if (id === 'nohit') {
      const n = (KB.LEVELS || []).filter(l => CH.bestNohit(l.id)).length;
      return [n + ' / ' + (KB.LEVELS || []).length, n ? C.yellow : '#5c6884'];
    }
    if (id === 'tower') {
      const t = CH.bestTower();
      if (!(t.bestFloor | 0)) return ['--', '#5c6884'];
      return [(t.bestTime | 0) ? (t.bestFloor + 'F　' + UI.mmss(t.bestTime)) : (t.bestFloor + 'F'), t.bestTime ? C.yellow : '#fff'];
    }
    if (id === 'daily') {
      const r = CH.dailyRecord();
      if (!r) return ['今日未挑戰', C.pink];
      return [(r.ok ? 'CLEAR ' + UI.mmss(r.time) : r.floor + 'F'), r.ok ? C.yellow : '#c8d8f0'];
    }
    if (id === 'arena') {
      const a = S().arena, keys = Object.keys(a).filter(k => a[k] && a[k].cleared);
      return [keys.length ? keys.length + ' 種達成' : '--', keys.length ? C.yellow : '#5c6884'];
    }
    return ['', '#fff'];
  }
  CH.summaryOf = summaryOf;

  class ChallengeScene {
    constructor(sel) {
      this.i = Math.max(0, Math.min(ITEMS.length - 1, sel | 0));
      this.mode = 'menu'; this.j = 0;
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.stars = UI.mkStars(34, 71, 0, 0, W, H);
      this.msg = 0;
    }
    enter() { tempo(1); music(['challenge', 'arena', 'select']); }
    get item() { return ITEMS[this.i]; }
    get worlds() { return CH.worlds(); }
    update(dt) {
      this.t += dt; this.frame++;
      if (this.msg > 0) this.msg--;
      if (UI.stepFade(this)) return;
      const inp = KB.input;
      if (this.mode === 'menu') {
        if (inp.pressed('down')) { this.i = (this.i + 1) % ITEMS.length; sfx('menu'); }
        if (inp.pressed('up')) { this.i = (this.i - 1 + ITEMS.length) % ITEMS.length; sfx('menu'); }
        if (inp.pressed('select')) { sfx('menu_back'); UI.leave(this, () => KB.setScene(new KB.TitleScene())); return; }
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) this.choose();
        return;
      }
      // 子選單（選世界 / 選 Boss Rush 變體）
      const list = this.mode === 'world' ? this.worlds : ARENA_OPTS;
      const n = Math.max(1, list.length);
      if (inp.pressed('down')) { this.j = (this.j + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.j = (this.j - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('right')) { this.j = Math.min(n - 1, this.j + 1); sfx('menu'); }
      if (inp.pressed('left')) { this.j = Math.max(0, this.j - 1); sfx('menu'); }
      if (inp.pressed('select')) { sfx('menu_back'); this.mode = 'menu'; return; }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) this.confirm(list);
    }
    choose() {
      const id = this.item.id;
      if (id === 'time' || id === 'nohit') {
        if (!this.worlds.length) { sfx('menu_back'); this.msg = 90; return; }
        sfx('select'); this.mode = 'world'; this.j = 0; return;
      }
      if (id === 'arena') { sfx('select'); this.mode = 'arena'; this.j = 0; return; }
      if (id === 'tower') { sfx('select'); UI.leave(this, () => CH.startTower({})); return; }
      if (id === 'daily') {
        if (CH.dailyDone() && !KB.DEBUG) { sfx('menu_back'); this.msg = 90; return; }
        sfx('select'); UI.leave(this, () => CH.startDaily({})); return;
      }
    }
    confirm(list) {
      sfx('select');
      if (this.mode === 'world') {
        const lv = list[this.j]; if (!lv) return;
        const id = this.item.id;
        UI.leave(this, () => (id === 'time' ? CH.startTime(lv.id) : CH.startNohit(lv.id)));
        return;
      }
      const o = list[this.j] || ARENA_OPTS[0];
      UI.leave(this, () => KB.setScene(new KB.ArenaScene(Object.assign({ from: 'challenge' }, o.o))));
    }
    draw(ctx) {
      const f = this.frame, ms = MS();
      UI.bands(ctx, 0, H, ['#180c28', '#221040', '#2a1650', '#160c2c']);
      UI.drawStars(ctx, this.stars, this.t);
      UI.bigText(ctx, 'CHALLENGE', 128, 4, 2, { color: '#ffb040', outline: '#401800', shadow: '#a04000', align: 'center', spacing: 1 });
      TX(ctx, '挑戰模式', 128, 22, { color: C.yellow, align: 'center', size: 16 });
      if (this.mode === 'menu') this.drawMenu(ctx, f, ms);
      else if (this.mode === 'world') this.drawWorlds(ctx, f, ms);
      else this.drawArena(ctx, f, ms);
      UI.drawMuteToast(ctx); UI.drawFade(ctx, this);
    }
    drawMenu(ctx, f, ms) {
      panel(ctx, 8, 42, 240, 122);
      for (let i = 0; i < ITEMS.length; i++) {
        const it = ITEMS[i], y = 47 + i * 23, sel = i === this.i;
        if (sel) { KB.rect(ctx, 12, y - 2, 232, 21, 'rgba(255,224,64,0.16)'); cursor(ctx, 16, y + 8, f); }
        fit(ctx, it.name, 28, y, 96, { color: sel ? C.yellow : '#fff', size: 16 });
        KB.text(ctx, it.en, 130, y + 2, { color: sel ? '#ffd0a0' : '#7c8ca8' });
        const [s, col] = summaryOf(it.id);
        fit(ctx, s, 244, y + 3, 110, { color: col, align: 'right', size: UI.MS_SMALL });
      }
      panel(ctx, 8, 168, 240, 34, 'rgba(12,8,28,0.86)');
      const dl = UI.wrapLines(this.item.desc, 226, { size: UI.MS_SMALL }, 2);
      for (let i = 0; i < dl.length; i++) TX(ctx, dl[i], 14, 171 + i * 14, { color: '#c8d8f0', size: UI.MS_SMALL });
      if (this.msg > 0) fit(ctx, this.item.id === 'daily' ? '今天已經挑戰過了！' : '先通關一個世界吧！', 128, 206, 244, { color: '#ff8080', align: 'center', size: ms });
      else fit(ctx, '↑↓ 選擇　Z 決定　SELECT 返回', 128, 206, 244, { color: C.grey, align: 'center', size: ms });
    }
    drawWorlds(ctx, f, ms) {
      const list = this.worlds, id = this.item.id;
      fit(ctx, this.item.name + '：選擇世界', 128, 40, 244, { color: '#fff', align: 'center', size: ms });
      panel(ctx, 8, 58, 240, 136);
      const rowH = Math.min(22, Math.floor(128 / Math.max(1, list.length)));
      for (let i = 0; i < list.length; i++) {
        const lv = list[i], y = 63 + i * rowH, sel = i === this.j;
        if (sel) { KB.rect(ctx, 12, y - 2, 232, rowH - 1, 'rgba(128,224,255,0.16)'); cursor(ctx, 16, y + 7, f); }
        KB.text(ctx, 'W' + (i + 1), 26, y + 2, { color: sel ? C.yellow : '#8fa0bc' });
        fit(ctx, lv.name || lv.id, 52, y, 104, { color: sel ? '#fff' : '#c8d8f0', size: ms });
        if (id === 'time') {
          const b = CH.bestTime(lv.id);
          KB.text(ctx, b ? mmssff(b) : '--:--.--', 242, y + 2, { color: b ? C.cyan : '#5c6884', align: 'right' });
        } else {
          const done = CH.bestNohit(lv.id), bt = CH.bestNohitTime(lv.id);
          KB.text(ctx, done ? (bt ? 'OK ' + UI.mmss(bt) : 'OK') : '----', 242, y + 2, { color: done ? C.yellow : '#5c6884', align: 'right' });
        }
      }
      fit(ctx, '↑↓ 選擇　Z 開始　SELECT 返回', 128, 200, 244, { color: C.grey, align: 'center', size: ms });
    }
    drawArena(ctx, f, ms) {
      fit(ctx, 'Boss Rush：選擇規則', 128, 40, 244, { color: '#fff', align: 'center', size: ms });
      panel(ctx, 8, 58, 240, 120);
      const a = S().arena;
      for (let i = 0; i < ARENA_OPTS.length; i++) {
        const o = ARENA_OPTS[i], y = 64 + i * 27, sel = i === this.j;
        if (sel) { KB.rect(ctx, 12, y - 3, 232, 25, 'rgba(255,128,96,0.16)'); cursor(ctx, 16, y + 8, f); }
        fit(ctx, o.name, 28, y, 140, { color: sel ? C.yellow : '#fff', size: 16 });
        const rec = a[o.id];
        KB.text(ctx, rec && rec.bestTime ? UI.mmss(rec.bestTime) : '--:--', 242, y + 4, { color: rec && rec.bestTime ? C.cyan : '#5c6884', align: 'right' });
      }
      fit(ctx, 'Extra：魔王更強　全 7：連戰 7 名', 128, 182, 244, { color: '#ff9090', align: 'center', size: UI.MS_SMALL });
      fit(ctx, '↑↓ 選擇　Z 開始　SELECT 返回', 128, 200, 244, { color: C.grey, align: 'center', size: ms });
    }
  }
  KB.ChallengeScene = ChallengeScene;
  CH.ChallengeScene = ChallengeScene;

  // ==========================================================================
  // 挑戰結算（通關 / 失敗共用；重試 / 離開）
  // ==========================================================================
  const FAIL_MSG = { hit: '被擊中！', time: '時間到！', dead: '力盡倒下……' };
  class ChallengeResultScene {
    constructor(res) {
      this.r = res || { type: 'time', ok: false, time: 0 };
      this.sel = 0;
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.stars = UI.mkStars(36, 51, 0, 0, W, H);
    }
    enter() {
      tempo(1);
      UI.music(this.r.ok ? (hasSong('clear') ? 'clear' : null) : 'gameover');
      if (this.r.newBest) sfx('new_record');
    }
    get opts() { return this.r.ok ? ['再挑戰一次', '返回挑戰選單'] : ['重試', '離開']; }
    update(dt) {
      this.t += dt; this.frame++;
      if (UI.stepFade(this)) return;
      if (this.frame < 20) return;
      const inp = KB.input, n = 2;
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('select')) { sfx('menu_back'); UI.leave(this, () => KB.setScene(new ChallengeScene(idxOf(this.r.type)))); return; }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
        sfx('select');
        const r = this.r, retry = this.sel === 0;
        UI.leave(this, () => {
          if (!retry) { KB.setScene(new ChallengeScene(idxOf(r.type))); return; }
          if (r.type === 'time') CH.startTime(r.levelId);
          else if (r.type === 'nohit') CH.startNohit(r.levelId);
          else if (r.type === 'tower') CH.startTower({ seed: r.seed });
          else if (r.type === 'daily') { if (CH.dailyDone() && !KB.DEBUG) KB.setScene(new ChallengeScene(3)); else CH.startDaily({ key: r.dateKey }); }
          else KB.setScene(new ChallengeScene(0));
        });
      }
    }
    draw(ctx) {
      const f = this.frame, ms = MS(), r = this.r;
      UI.bands(ctx, 0, H, r.ok ? ['#101838', '#182254', '#1e2c68', '#24347c'] : ['#000000', '#0a0a14', '#101018', '#16161e']);
      UI.drawStars(ctx, this.stars, this.t);
      const title = r.ok ? 'CHALLENGE CLEAR' : 'CHALLENGE FAILED';
      // R8-P2-05：'CHALLENGE FAILED' 16 字 ×8px ×2 倍 = 剛好 256px（左右 0 邊界）⇒
      // 失敗標題字距縮 1px（總寬 226、左右各 15px），和其他畫面的標題一樣有邊界
      UI.bigText(ctx, title, 128, 8, 2, { color: r.ok ? C.yellow : '#f04040', outline: r.ok ? '#603000' : '#400000', shadow: r.ok ? '#a06000' : '#901818', align: 'center', spacing: r.ok ? 0 : -1 });
      const name = (CH.ITEMS.find(i => i.id === r.type) || { name: '挑戰' }).name;
      TX(ctx, r.ok ? name + '　達成！' : (FAIL_MSG[r.reason] || '挑戰失敗'), 128, 30, { color: r.ok ? '#fff' : '#ffa0a0', align: 'center', size: 16 });
      panel(ctx, 16, 54, 224, 100);
      const rows = [];
      if (r.type === 'tower' || r.type === 'daily') {
        rows.push(['到達層數', (r.floor | 0) + ' / ' + (r.floors | 0), r.ok ? C.yellow : '#fff']);
        rows.push(['總時間', mmssff(r.time), '#fff']);
        if (r.type === 'tower') rows.push(['最高層', (S().tower.bestFloor | 0) + 'F', C.cyan]);
        rows.push([r.type === 'daily' ? '日期' : '最佳時間',
        r.type === 'daily' ? String(r.dateKey || CH.dateKey()) : ((S().tower.bestTime | 0) ? UI.mmss(S().tower.bestTime) : '--:--'),
        r.newBest ? C.pink : '#c8d8f0']);
      } else {
        const lv = (KB.LEVELS || []).find(l => l.id === r.levelId);
        rows.push(['關卡', (lv && lv.name) || r.levelId || '-', '#fff']);
        rows.push(['時間', mmssff(r.time), r.ok ? C.cyan : '#c8d8f0']);
        rows.push(['最佳', (r.best | 0) ? mmssff(r.best) : '--:--.--', r.newBest ? C.pink : '#c8d8f0']);
        if (r.type === 'time') rows.push(['死亡', 'x' + (r.deaths | 0), (r.deaths | 0) ? '#ff9090' : '#80ffa0']);
        else rows.push(['無傷', r.ok ? 'PERFECT' : 'FAILED', r.ok ? C.yellow : '#ff8080']);
      }
      for (let i = 0; i < rows.length; i++) {
        const y = 61 + i * 22;
        fit(ctx, rows[i][0], 28, y, 110, { color: '#c8d8f0', size: ms });
        // 關名是中文 → 走 UI.text（8×8 點陣字畫不出中文，會變成糊掉的小字）
        if (/[^\x00-\x7f]/.test(rows[i][1])) fit(ctx, rows[i][1], 228, y, 110, { color: rows[i][2], align: 'right', size: ms });
        else KB.text(ctx, rows[i][1], 228, y + 3, { color: rows[i][2], align: 'right' });
      }
      if (r.newBest && ((f >> 3) & 1)) KB.text(ctx, 'NEW RECORD!', 128, 156, { color: C.yellow, align: 'center' });
      const op = this.opts;
      for (let i = 0; i < op.length; i++) {
        const y = 170 + i * 19, sel = i === this.sel;
        if (sel) cursor(ctx, 70, y + 8, f);
        fit(ctx, op[i], 84, y, 120, { color: sel ? C.yellow : '#c8d8f0', size: ms });
      }
      fit(ctx, '↑↓ 選擇　Z 決定', 128, 209, 244, { color: C.grey, align: 'center', size: UI.MS_SMALL });
      UI.drawMuteToast(ctx); UI.drawFade(ctx, this);
    }
  }
  function idxOf(type) { const i = ITEMS.findIndex(x => x.id === type); return i < 0 ? 0 : i; }
  KB.ChallengeResultScene = ChallengeResultScene;
  CH.ChallengeResultScene = ChallengeResultScene;
  void VH; void T;
})();
