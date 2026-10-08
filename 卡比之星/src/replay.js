// 幽靈重播 / 定幀確定性 / 關卡計時排行（Round 12・K12-2 ghost-replay）
// ============================================================================
// 核心想法：GameScene 的模擬本來就是定幀（main.js 以固定 1/60 累加器呼叫 update），
// 唯一的非確定性來源是 Math.random。本檔把 Math.random 在「遊戲模擬期間」換成
// 以種子起始的 PRNG（mulberry32），於 GameScene.enter / loadRoom / update 進出時切換；
// 音訊（KB.audio.*）的 Math.random 一律走原生亂數（噪音起始點，與遊戲邏輯無關，
// 也不該被靜音 / AudioContext 狀態影響而偷走 PRNG 序列）。
//   ⇒ 同一顆種子 + 同一串每幀輸入快照 ⇒ 逐幀完全相同（tools/test_replay.py 驗證）。
//
// 本檔不改任何共用檔的既有行為：
//   * Math.random 的替換用「包住 GameScene.prototype 的 enter / loadRoom / update」達成，
//     招式 / 敵人 / 磁磚那 20 個檔案一行都不用動。
//   * game.js 只插入 4 個 `if (KB.REPLAY)` 鉤子；input.js 只新增 4 個 API。
//
// 資料（localStorage，不隨存檔槽）：
//   kirbystar_replay            { v:1, boards:{ <key>: [ {t,d,ab,de} ×5 ] } }
//   kirbystar_replay_<key>      最佳通關重播（JSON 外殼 + base64 位元流），單關 < 50KB
//   key = levelId（Extra 模式為 levelId + '#x'，兩種模式各自一份排行 / 重播）
//
// 重播格式（encode / decode）：
//   ip  輸入串：RLE（mask 1 byte + varint 連續幀數）→ base64
//   gp  幽靈軌跡：每幀位元打包 → base64
//         1 bit 小位移 → 4+4 bits（dx,dy ∈ -8..7）／否則 16+16 bits 絕對座標
//         1 bit 方向變更 → 1 bit dir
//         1 bit 精靈變更 → 7 bits 精靈表索引
//       典型 11 bits/幀 ≈ 1.4 byte/幀（1 分鐘的關卡約 5KB base64）
//
// 對外 API 見檔尾 KB.REPLAY / KB.RNG。
// ============================================================================
(function () {
  'use strict';

  const ACT = ['left', 'right', 'up', 'down', 'jump', 'attack', 'select', 'start'];
  const RKEY = 'kirbystar_replay';
  const RPRE = 'kirbystar_replay_';
  const TOP_N = 5;                 // 每關排行保留 5 筆
  const MAX_FRAMES = 36000;        // 錄製上限 10 分鐘（超過就停止錄製，避免吃記憶體）
  const MAX_BYTES = 50 * 1024;     // 單關重播大小上限（含 JSON 外殼）
  const GHOST_ALPHA = 0.55;
  const GHOST_TINT = '#a8e8ff';
  const SPEEDS = [1, 2, 4, 8];

  const UIX = () => KB.UI || null;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const clamp16 = v => Math.max(0, Math.min(65535, v | 0));

  // ==========================================================================
  // 1. 遊戲內 PRNG（mulberry32）與「模擬期間才換掉 Math.random」
  // ==========================================================================
  const nativeRandom = Math.random;
  let rs = 1, rngSeed = 1, rngCalls = 0, depth = 0;

  function detRandom() {
    rngCalls++;
    rs = (rs + 0x6D2B79F5) | 0;
    let t = rs;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function seedRng(n) { rs = (n | 0) || 1; rngSeed = rs; rngCalls = 0; }
  function detOn() { if (depth++ === 0) Math.random = detRandom; }
  function detOff() { if (--depth <= 0) { depth = 0; Math.random = nativeRandom; } }
  // 音訊的亂數不走遊戲 PRNG（噪音起始點；靜音 / AudioContext 未解鎖時呼叫次數會不一樣）
  function withNative(fn) {
    return function () {
      const d = depth;
      if (d > 0) Math.random = nativeRandom;
      try { return fn.apply(this, arguments); }
      finally { if (d > 0) Math.random = detRandom; }
    };
  }
  function newSeed() { return ((nativeRandom() * 0x7fffffff) | 0) || 1; }

  KB.RNG = {
    seed(n) { seedRng(n); return rngSeed; },
    current() { return rngSeed; },
    random() { return detRandom(); },
    calls() { return rngCalls; },
    state() { return rs | 0; },
    on() { return depth > 0; },
    native: nativeRandom,
  };

  // ==========================================================================
  // 2. 位元流 / base64 / RLE
  // ==========================================================================
  function BW() { this.b = []; this.cur = 0; this.n = 0; }
  BW.prototype.w = function (v, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = ((this.cur << 1) | ((v >>> i) & 1)) & 255;
      if (++this.n === 8) { this.b.push(this.cur); this.cur = 0; this.n = 0; }
    }
  };
  BW.prototype.bytes = function () { const o = this.b.slice(); if (this.n) o.push((this.cur << (8 - this.n)) & 255); return o; };

  function BR(bytes) { this.b = bytes; this.i = 0; this.n = 0; }
  BR.prototype.r = function (bits) {
    let v = 0;
    for (let k = 0; k < bits; k++) {
      const byte = this.b[this.i] | 0;
      v = (v << 1) | ((byte >> (7 - this.n)) & 1);
      if (++this.n === 8) { this.n = 0; this.i++; }
    }
    return v >>> 0;
  };

  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + CH));
    try { return btoa(s); } catch (e) { return ''; }
  }
  function unb64(str) {
    let s = '';
    try { s = atob(str || ''); } catch (e) { return []; }
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  /** 輸入串 RLE：[mask, varint(連續幀數)] × n */
  function encInputs(masks) {
    const out = [];
    let i = 0;
    while (i < masks.length) {
      const m = masks[i] & 255;
      let n = 1;
      while (i + n < masks.length && (masks[i + n] & 255) === m) n++;
      out.push(m);
      let k = n;
      while (k >= 128) { out.push((k & 127) | 128); k >>>= 7; }
      out.push(k);
      i += n;
    }
    return out;
  }
  function decInputs(bytes, total) {
    const out = [];
    let i = 0;
    while (i < bytes.length && (total === undefined || out.length < total)) {
      const m = bytes[i++] & 255;
      let n = 0, sh = 0, b;
      do { b = bytes[i++] | 0; n |= (b & 127) << sh; sh += 7; } while (b & 128 && i <= bytes.length);
      for (let k = 0; k < n; k++) out.push(m);
    }
    if (total !== undefined) out.length = total;
    return out;
  }

  function hashNum(h, v) {
    v = v | 0;
    for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // ==========================================================================
  // 3. 錄製 / 編碼 / 解碼
  // ==========================================================================
  let rec = null;        // 錄製中的紀錄
  let play = null;        // 播放中的狀態
  let ghost = null;       // 本次遊玩要畫的幽靈（已解碼）
  let pendingSeed = 0;    // 下一個 GameScene.enter 要用的種子（播放 / 模擬）
  let simMode = false;    // tools/test_replay.py 的無頭模擬
  let simRecord = false;
  let envBak = null;

  function newRec(game, seed) {
    const o = game.opts || {};
    return {
      lv: game.levelId, key: keyOf(game.levelId), sd: seed,
      masks: [], gx: [], gy: [], gd: [], ga: [],
      names: [], fps: [], idx: {},
      n: 0, deaths: 0, lives: game.lives, over: false,
      st: { room: o.room || 0, x: o.x, y: o.y, ab: o.ability || '', hp: o.hp || 0, lives: game.lives, score: game.score | 0 },
      ev: envOf(),
    };
  }
  function animIndex(r, name, fps) {
    let i = r.idx[name];
    if (i === undefined) {
      if (r.names.length >= 127) return 0;
      i = r.idx[name] = r.names.length;
      r.names.push(name); r.fps.push(fps | 0);
    }
    return i;
  }

  function encode(r) {
    const n = r.gx.length;
    const bw = new BW();
    let px = 0, py = 0, pd = -1, pa = -1;
    for (let i = 0; i < n; i++) {
      const x = r.gx[i], y = r.gy[i], dx = x - px, dy = y - py;
      if (dx >= -8 && dx <= 7 && dy >= -8 && dy <= 7) { bw.w(1, 1); bw.w(dx + 8, 4); bw.w(dy + 8, 4); }
      else { bw.w(0, 1); bw.w(x, 16); bw.w(y, 16); }
      px = x; py = y;
      const d = r.gd[i] | 0;
      if (d !== pd) { bw.w(1, 1); bw.w(d, 1); pd = d; } else bw.w(0, 1);
      const a = r.ga[i] | 0;
      if (a !== pa) { bw.w(1, 1); bw.w(a, 7); pa = a; } else bw.w(0, 1);
    }
    return {
      v: 1, lv: r.lv, sd: r.sd | 0, n: r.masks.length, tm: r.time | 0, de: r.deaths | 0,
      dt: r.date || today(), ab: r.ability || '', st: r.st, ev: r.ev,
      an: r.names.slice(), af: r.fps.slice(),
      ip: b64(encInputs(r.masks)), gp: b64(bw.bytes()), gn: n,
    };
  }

  function decode(src) {
    let o = src;
    if (typeof src === 'string') { try { o = JSON.parse(src); } catch (e) { return null; } }
    if (!o || o.v !== 1) return null;
    o.masks = decInputs(unb64(o.ip), o.n | 0);
    const gn = o.gn | 0;
    if (gn > 0 && o.gp) {
      const br = new BR(unb64(o.gp));
      const gx = new Int32Array(gn), gy = new Int32Array(gn), gd = new Uint8Array(gn), ga = new Uint8Array(gn);
      let px = 0, py = 0, pd = 0, pa = 0;
      for (let i = 0; i < gn; i++) {
        if (br.r(1)) { px = px + (br.r(4) - 8); py = py + (br.r(4) - 8); }
        else { px = br.r(16); py = br.r(16); }
        if (br.r(1)) pd = br.r(1);
        if (br.r(1)) pa = br.r(7);
        gx[i] = px; gy[i] = py; gd[i] = pd; ga[i] = pa;
      }
      o.gx = gx; o.gy = gy; o.gd = gd; o.ga = ga;
    } else { o.gx = null; }
    return o;
  }

  // ==========================================================================
  // 4. localStorage（排行 + 重播槽位）
  // ==========================================================================
  function LS() { try { return window.localStorage; } catch (e) { return null; } }
  function keyOf(levelId) { return levelId + (KB.session && KB.session.extra ? '#x' : ''); }
  function today() {
    const d = new Date();
    const p2 = v => String(v).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function store() {
    const ls = LS();
    let o = null;
    if (ls) { try { o = JSON.parse(ls.getItem(RKEY) || 'null'); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object') o = {};
    if (!o.boards || typeof o.boards !== 'object') o.boards = {};
    o.v = 1;
    return o;
  }
  function writeStore(o) { const ls = LS(); if (!ls) return false; try { ls.setItem(RKEY, JSON.stringify(o)); return true; } catch (e) { return false; } }

  function board(key) {
    const list = store().boards[key];
    return Array.isArray(list) ? list.slice(0, TOP_N) : [];
  }
  /** 插入排序（時間短的在前）+ 只留 5 筆；回傳名次 index，沒進榜 -1 */
  function addEntry(key, e) {
    const st = store();
    const list = Array.isArray(st.boards[key]) ? st.boards[key].slice() : [];
    let at = list.length;
    for (let i = 0; i < list.length; i++) if ((e.t | 0) < (list[i].t | 0)) { at = i; break; }
    if (at >= TOP_N) return -1;
    list.splice(at, 0, { t: e.t | 0, d: e.d || today(), ab: e.ab || '', de: e.de | 0 });
    if (list.length > TOP_N) list.length = TOP_N;
    st.boards[key] = list;
    writeStore(st);
    return at;
  }

  function loadRaw(key) { const ls = LS(); if (!ls) return null; try { return ls.getItem(RPRE + key); } catch (e) { return null; } }
  const cache = {};
  function loadReplay(key) {
    if (cache[key] !== undefined) return cache[key];
    const raw = loadRaw(key);
    return (cache[key] = raw ? decode(raw) : null);
  }
  /** 存最佳重播；超過 50KB 先丟幽靈軌跡，仍超過就不存（排行仍留） */
  function saveReplay(r) {
    const ls = LS(); if (!ls) return 0;
    let o = encode(r), s = JSON.stringify(o);
    if (s.length > MAX_BYTES) { o.gp = ''; o.gn = 0; o.an = []; o.af = []; s = JSON.stringify(o); }
    if (s.length > MAX_BYTES) return 0;
    try { ls.setItem(RPRE + r.key, s); } catch (e) { return 0; }
    cache[r.key] = decode(s);
    return s.length;
  }

  // ==========================================================================
  // 5. 環境指紋（能力等級 / Extra / 貼身倍率）
  // ==========================================================================
  function envOf() {
    const s = KB.save || {};
    const xp = {}, al = {};
    for (const k in (s.abilityXp || {})) xp[k] = s.abilityXp[k] | 0;
    for (const k in (s.abilityLv || {})) al[k] = s.abilityLv[k] | 0;
    return { ex: !!(KB.session && KB.session.extra), ml: (KB.PHYS && KB.PHYS.meleeScale) || 1, xp, al };
  }
  function envSame(a, b) {
    if (!a || !b) return true;
    if (!!a.ex !== !!b.ex || (a.ml || 1) !== (b.ml || 1)) return false;
    const ks = {};
    for (const k in (a.xp || {})) ks[k] = 1;
    for (const k in (b.xp || {})) ks[k] = 1;
    for (const k in ks) if (((a.xp || {})[k] | 0) !== ((b.xp || {})[k] | 0)) return false;
    return true;
  }
  // 播放時只借用 KB.session.extra（session 不寫檔；絕不動 KB.save，避免重播把舊等級寫回存檔）
  function applyEnv(ev) {
    envBak = { ex: !!(KB.session && KB.session.extra) };
    if (ev && KB.session) KB.session.extra = !!ev.ex;
  }
  function restoreEnv() {
    if (envBak && KB.session) KB.session.extra = !!envBak.ex;
    envBak = null;
  }

  // ==========================================================================
  // 6. 幽靈設定
  // ==========================================================================
  function settings() {
    if (!KB.save) KB.save = {};
    if (!KB.save.settings || typeof KB.save.settings !== 'object') KB.save.settings = {};
    return KB.save.settings;
  }
  function ghostOn() { return settings().ghost !== false; }       // 預設開
  function setGhost(v) {
    settings().ghost = !!v;
    try { KB.saveGame && KB.saveGame(); } catch (e) { }
    if (!v) ghost = null;
    else if (rec) ghost = loadReplay(rec.key);
    return ghostOn();
  }

  // ==========================================================================
  // 6b. 唯讀模式（fix12 / R12-P2-01：觀看重播絕對不能寫存檔）
  // --------------------------------------------------------------------------
  // 重播是「真的再跑一次 GameScene 模擬」，所以 KB.PROG 的成就 / 能力經驗、
  // KB.SAVES 的每幀 playTime tick、musicbox 的「聽過即解鎖」都會照常觸發。
  // watch() 期間一律：① 把這些寫入點短路成 no-op ② 另外存一份 KB.save 與
  // 所有 kirbystar_* localStorage 鍵的快照，endPlay() 時逐鍵還原（雙保險）。
  // ==========================================================================
  let ro = null;

  function lsSnap() {
    const ls = LS(), o = {};
    if (!ls) return o;
    try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf('kirbystar') === 0) o[k] = ls.getItem(k); } } catch (e) { }
    return o;
  }
  function lsRestore(snap) {
    const ls = LS(); if (!ls || !snap) return 0;
    let n = 0;
    try {
      const now = lsSnap();
      for (const k in now) if (!(k in snap)) { ls.removeItem(k); n++; }
      for (const k in snap) if (now[k] !== snap[k]) { ls.setItem(k, snap[k]); n++; }
    } catch (e) { }
    return n;
  }
  /** 把 KB.save 還原成快照內容（就地改寫 ⇒ settings 等物件識別不變） */
  function restoreSave(json) {
    if (!json) return false;
    let d = null;
    try { d = JSON.parse(json); } catch (e) { return false; }
    const s = KB.save;
    if (!s || typeof s !== 'object') { KB.save = d; return true; }
    const plain = v => v && typeof v === 'object' && !Array.isArray(v);
    for (const k in s) if (!(k in d)) delete s[k];
    for (const k in d) {
      if (plain(d[k]) && plain(s[k])) {
        const o = s[k], v = d[k];
        for (const kk in o) if (!(kk in v)) delete o[kk];
        for (const kk in v) o[kk] = v[kk];
      } else s[k] = d[k];
    }
    return true;
  }

  function roOn() {
    if (ro) return ro;
    ro = { snap: null, ls: lsSnap(), restored: 0, f: {} };
    try { ro.snap = JSON.stringify(KB.save || {}); } catch (e) { ro.snap = null; }
    const patch = (obj, name, fn) => {
      if (!obj || typeof obj[name] !== 'function') return;
      ro.f[(obj === KB ? 'KB.' : '') + name] = { o: obj, n: name, v: obj[name] };
      obj[name] = fn;
    };
    patch(KB, 'saveGame', function () { });                                  // 整包寫檔
    if (KB.SAVES) patch(KB.SAVES, 'save', function () { return false; });
    if (KB.SAVES) patch(KB.SAVES, 'tick', function () { });                  // playTime / 30 秒自動存檔
    if (KB.PROG) patch(KB.PROG, 'unlock', function () { return false; });    // 成就
    if (KB.PROG) patch(KB.PROG, 'gainAbility', function () { return null; });// 能力經驗
    if (KB.PROG) patch(KB.PROG, 'bump', function (name) { return (KB.PROG.count ? KB.PROG.count(name) : 0) | 0; });
    if (KB.PROG) patch(KB.PROG, 'saveRank', function () { return false; });
    if (KB.MUSICBOX) patch(KB.MUSICBOX, 'markHeard', function () { return false; });
    return ro;
  }
  function roOff() {
    if (!ro) return 0;
    const r = ro; ro = null;
    for (const k in r.f) { const e = r.f[k]; try { e.o[e.n] = e.v; } catch (err) { } }
    restoreSave(r.snap);
    const n = lsRestore(r.ls);
    r.restored = n;
    roLast = { restored: n };
    return n;
  }
  let roLast = null;
  const roOn_ = () => !!ro;

  // ==========================================================================
  // 7. 鉤子（game.js 呼叫）
  // ==========================================================================
  function onEnterLevel(game) {
    // 種子：播放 / 模擬用指定種子，一般遊玩抽一顆新的並記下來
    const seed = pendingSeed || newSeed();
    pendingSeed = 0;
    seedRng(seed);
    if (play) { play.scene = game; rec = null; ghost = null; return; }
    rec = null; ghost = null;
    if (!simMode && (game.arena || game.challenge)) return;        // 競技場 / 挑戰模式不錄（各自有紀錄系統）
    if (simMode && !simRecord) return;
    rec = newRec(game, seed);
    if (!simMode && ghostOn()) {
      const g0 = loadReplay(rec.key);
      ghost = (g0 && g0.gx && g0.gn > 0) ? g0 : null;
    }
  }

  /** 每幀（update 之前）：錄下這一幀實際使用的輸入快照 */
  function recPre() {
    if (!rec || rec.over) return;
    rec.masks.push(KB.input.maskNow ? KB.input.maskNow() : 0);
  }
  /** 每幀（update 之後）：錄下幽靈軌跡（卡比繪製錨點 + 方向 + 精靈） */
  function recPost(game) {
    if (!rec || rec.over) return;
    const p = (KB.game === game) ? game.player : null;
    if (!p) { rec.masks.pop(); return; }
    let name = 'kirby_idle', fps = 1;
    try { const a = p.currentAnim(); if (a) { name = a[0]; fps = a[1] | 0; } } catch (e) { }
    rec.gx.push(clamp16(Math.round(p.cx)));
    rec.gy.push(clamp16(Math.round(p.bottom)));
    rec.gd.push(p.dir < 0 ? 1 : 0);
    rec.ga.push(animIndex(rec, name, fps));
    rec.n++;
    if (game.lives < rec.lives) { rec.deaths += (rec.lives - game.lives); rec.lives = game.lives; }
    if (rec.n >= MAX_FRAMES) rec.over = true;
  }

  function onLevelClear(game) {
    if (play) { endPlay(); return 'handled'; }
    if (!rec || rec.lv !== game.levelId || rec.over || !rec.n) return;
    rec.time = game.timeAlive | 0;
    rec.ability = (game.player && game.player.ability) || '';
    rec.date = today();
    const r = rec;
    rec = null;
    if (simMode) { simOut = r; return; }
    const at = addEntry(r.key, { t: r.time, d: r.date, ab: r.ability, de: r.deaths });
    if (at === 0) saveReplay(r);        // 新的最佳 ⇒ 重播也換成這一次
    return;
  }

  // 注意：watch() 會在「舊場景 exit → 新場景 enter」之間設好 play，
  // 所以只有「正在播放的那個 GameScene 離場」才算中止播放（play.scene 由 onEnterLevel 填）。
  function onExitLevel(game) {
    if (play && play.scene && play.scene === game && !play.ending) endPlay(true);
    if (play && play.scene === game) return;          // 播放場景離場：rec / ghost 本來就是 null
    rec = null; ghost = null;
    if (depth > 0) { depth = 0; Math.random = nativeRandom; }
  }

  // ---- 幽靈繪製（world 座標，只畫不碰撞）----
  function drawGhost(g, ctx, game) {
    if (play || !ghost || !rec || !ghostOn()) return;
    const i = rec.n - 1;
    if (i < 0 || i >= (ghost.gn | 0)) return;
    const x = ghost.gx[i], y = ghost.gy[i];
    const cam = g.cam;
    if (x < cam.x - 40 || x > cam.x + KB.W + 40 || y < cam.y - 48 || y > cam.y + KB.VIEW_H + 48) return;
    const ai = ghost.ga[i] | 0;
    let name = (ghost.an && ghost.an[ai]) || 'kirby_idle';
    if (!KB.SPR[name]) name = 'kirby_idle';
    const fps = (ghost.af && ghost.af[ai]) | 0;
    const flip = ghost.gd[i] === 1, t = i / 60;
    // 水藍描邊（上下左右各畫一次剪影）＋ 半透明本體 ⇒ 不論背景明暗都看得出來，但仍明顯是「幽靈」
    const edge = { flip, alpha: 0.5, tint: GHOST_TINT, t, fps };
    g.spr(name, x - 1, y, edge); g.spr(name, x + 1, y, edge);
    g.spr(name, x, y - 1, edge); g.spr(name, x, y + 1, edge);
    g.spr(name, x, y, { flip, alpha: GHOST_ALPHA, t, fps });
  }

  // ==========================================================================
  // 8. 播放（觀看最佳重播：全自動 + 快轉 + 跳過）
  // ==========================================================================
  const srcPrev = {};
  function srcPressed(n) {
    const d = !!(KB.input.srcDown && KB.input.srcDown(n));
    const was = !!srcPrev[n];
    srcPrev[n] = d;
    return d && !was;
  }

  function watch(levelId, back) {
    const key = keyOf(levelId);
    const data = loadReplay(key);
    if (!data || !data.masks || !data.masks.length) return false;
    const idx = Math.max(0, (KB.LEVELS || []).findIndex(l => l.id === levelId));
    play = {
      data, masks: data.masks, i: 0, speed: 1, hud: 240, ending: false,
      back: back || (() => { if (KB.StageSelectScene) KB.setScene(new KB.StageSelectScene(idx)); }),
      warn: !envSame(data.ev, envOf()),
    };
    for (const k in srcPrev) srcPrev[k] = false;
    roOn();                                                             // fix12：播放期間不准寫任何存檔
    try { KB.input.endReplay && KB.input.endReplay(); } catch (e) { }   // 第 1 幀的 pressed 要從「全放開」算起
    applyEnv(data.ev);
    pendingSeed = data.sd | 0;
    const st = data.st || {};
    const o = { room: st.room || 0, nofade: true, lives: st.lives, score: st.score };
    if (st.x !== undefined && st.x !== null) o.x = st.x;
    if (st.y !== undefined && st.y !== null) o.y = st.y;
    if (st.ab) o.ability = st.ab;
    if (st.hp) o.hp = st.hp;
    KB.session = KB.session || { lives: KB.START_LIVES, score: 0 };
    KB.setScene(new KB.GameScene(levelId, o));
    if (KB.scene) { KB.scene.fade = 0; KB.scene.fadeDir = 0; }
    return true;
  }

  function endPlay(silent) {
    if (!play || play.ending) return;
    play.ending = true;
    const back = play.back;
    play = null;
    restoreEnv();
    roOff();                                                            // fix12：還原寫入點 + KB.save + localStorage
    try { KB.input.endReplay && KB.input.endReplay(); } catch (e) { }
    if (depth > 0) { depth = 0; Math.random = nativeRandom; }
    if (!silent && back) { try { back(); } catch (e) { } }
  }

  /** 播放中的硬體操作：B 快轉、START / C 跳過 */
  function playCtrl() {
    if (srcPressed('attack')) {
      const k = SPEEDS.indexOf(play.speed);
      play.speed = SPEEDS[(k + 1) % SPEEDS.length];
      play.hud = 240; sfx('menu');
    }
    srcPressed('jump');
    if (srcPressed('start') || srcPressed('select')) { sfx('menu_back'); endPlay(); return true; }
    if (play.hud > 0) play.hud--;
    return false;
  }

  function drawOverlay(ctx, game) {
    if (!play) return;
    const UI = UIX();
    const T = (UI && UI.text) || KB.text;
    const total = play.masks.length || 1;
    const pct = Math.max(0, Math.min(1, play.i / total));
    if (play.hud > 0) {
      KB.rect(ctx, 4, 164, 248, 26, 'rgba(6,10,22,0.78)');
      KB.rect(ctx, 4, 164, 248, 1, '#80e0ff');
      KB.text(ctx, 'REPLAY', 9, 167, { color: '#80e0ff' });
      KB.text(ctx, 'x' + play.speed, 60, 167, { color: '#ffe040' });
      KB.rect(ctx, 86, 168, 162, 6, '#202838');
      KB.rect(ctx, 87, 169, Math.round(160 * pct), 4, '#80e0ff');
      const h = (UI && UI.hint) ? (UI.hint('attack', 'X') + ' 快轉　' + UI.hint('start', 'ENTER') + ' 跳過') : 'X 快轉　ENTER 跳過';
      const txt = play.warn ? '紀錄環境已變更' : h;
      if (UI && UI.fitText) UI.fitText(ctx, txt, 9, 177, 238, { color: play.warn ? '#ffa060' : '#c8d8f0', size: UI.MS });
      else T(ctx, txt, 9, 177, { color: '#c8d8f0' });
    } else {
      KB.rect(ctx, 4, 2, 74, 12, 'rgba(6,10,22,0.7)');
      KB.text(ctx, 'REPLAY', 8, 4, { color: '#80e0ff' });
      KB.text(ctx, 'x' + play.speed, 74, 4, { color: '#ffe040', align: 'right' });
    }
    void game;
  }

  // ==========================================================================
  // 9. 排行面板（ResultScene / StageSelectScene / RecordsScene 共用）
  // ==========================================================================
  function mmssff(f) {
    f = Math.max(0, f | 0);
    const s = Math.floor(f / 60), ff = f % 60;
    return String(Math.floor(s / 60) % 100).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + String(Math.round(ff * 100 / 60)).padStart(2, '0');
  }
  function abilityName(k) {
    if (!k) return '普通';
    const d = KB.ABILITIES && KB.ABILITIES[k];
    return (d && d.name) || (KB.ABILITY_NAMES && KB.ABILITY_NAMES[k]) || String(k).toUpperCase();
  }

  function openBoard(scene, levelId) { scene._rb = { lv: levelId, key: keyOf(levelId), t: 0 }; return true; }
  function boardOpen(scene) { return !!(scene && scene._rb); }
  function closeBoard(scene) { if (scene) scene._rb = null; }
  /** 面板開著時吃掉所有輸入；回傳 true = 本幀由面板處理 */
  function boardUpdate(scene, back) {
    const st = scene && scene._rb;
    if (!st) return false;
    st.t++;
    const inp = KB.input;
    if (inp.pressed('select') || inp.pressed('start')) { scene._rb = null; sfx('menu_back'); return true; }
    if (inp.pressed('attack')) { setGhost(!ghostOn()); sfx('menu'); return true; }
    if (inp.pressed('jump')) {
      if (hasReplay(st.lv)) { scene._rb = null; sfx('select'); watch(st.lv, back); }
      else sfx('menu_back');
      return true;
    }
    return true;
  }

  function drawBoardPanel(ctx, levelId, st) {
    const UI = UIX(); if (!UI) return;
    const C = UI.C, T = UI.text, fit = UI.fitText;
    const key = (st && st.key) || keyOf(levelId);
    const list = board(key);
    const idx = Math.max(0, (KB.LEVELS || []).findIndex(l => l.id === levelId));
    ctx.save(); ctx.globalAlpha = 0.72; KB.rect(ctx, 0, 0, KB.W, KB.H, '#040814'); ctx.restore();
    UI.panel(ctx, 14, 26, 228, 172);
    T(ctx, '本關計時排行', 22, 30, { color: C.yellow, size: 16 });
    KB.text(ctx, 'W' + (idx + 1), 234, 33, { color: C.cyan, align: 'right' });
    KB.rect(ctx, 20, 50, 216, 1, '#405070');
    KB.text(ctx, 'TIME', 104, 54, { color: '#8fa0bc', align: 'right' });
    KB.text(ctx, 'DATE', 158, 54, { color: '#8fa0bc', align: 'right' });
    T(ctx, '能力', 164, 52, { color: '#8fa0bc', size: UI.MS_SMALL });
    KB.text(ctx, 'D', 234, 54, { color: '#8fa0bc', align: 'right' });
    for (let i = 0; i < TOP_N; i++) {
      const y = 68 + i * 18, e = list[i];
      const col = i === 0 ? C.yellow : (e ? '#fff' : '#5c6884');
      KB.text(ctx, String(i + 1), 22, y, { color: col });
      if (!e) { KB.text(ctx, '--:--.--', 104, y, { color: '#5c6884', align: 'right' }); continue; }
      KB.text(ctx, mmssff(e.t), 104, y, { color: i === 0 ? C.cyan : '#fff', align: 'right' });
      KB.text(ctx, String(e.d || '').slice(5), 158, y, { color: '#c8d8f0', align: 'right' });
      fit(ctx, abilityName(e.ab), 164, y - 2, 62, { color: '#ffc8dc', size: UI.MS_SMALL });
      KB.text(ctx, String(e.de | 0), 234, y, { color: (e.de | 0) ? '#ff9090' : '#80ffa0', align: 'right' });
    }
    KB.rect(ctx, 20, 160, 216, 1, '#405070');
    const okReplay = hasReplay(levelId);
    const sz = okReplay ? Math.round((loadRaw(key) || '').length / 1024 * 10) / 10 : 0;
    T(ctx, '幽靈同步：' + (ghostOn() ? '開' : '關'), 22, 164, { color: ghostOn() ? C.cyan : C.grey, size: UI.MS });
    T(ctx, okReplay ? ('重播 ' + sz + 'KB') : '尚無重播', 234, 164, { color: okReplay ? '#c8d8f0' : C.grey, align: 'right', size: UI.MS_SMALL });
    const h = UI.hint('jump', 'Z') + (okReplay ? ' 觀看重播　' : ' ───　') + UI.hint('attack', 'X') + ' 幽靈　' + UI.hint('select', 'C') + ' 關閉';
    fit(ctx, h, 128, 180, 220, { color: C.grey, align: 'center', size: UI.MS });
  }

  function hasReplay(levelId) {
    const d = loadReplay(keyOf(levelId));
    return !!(d && d.masks && d.masks.length);
  }

  // ==========================================================================
  // 10. 包住 GameScene.prototype：PRNG 作用域 + 每幀輸入快照 + 播放驅動
  // ==========================================================================
  const GS = KB.GameScene && KB.GameScene.prototype;
  let origUpdate = null;
  if (GS) {
    const oEnter = GS.enter, oUpdate = GS.update, oLoad = GS.loadRoom, oExit = GS.exit;
    origUpdate = oUpdate;
    GS.enter = function () {
      onEnterLevel(this);
      detOn();
      try { return oEnter.apply(this, arguments); } finally { detOff(); }
    };
    GS.loadRoom = function () { detOn(); try { return oLoad.apply(this, arguments); } finally { detOff(); } };
    GS.exit = function () { onExitLevel(this); return oExit.apply(this, arguments); };
    GS.update = function (dt) {
      if (play) {
        if (playCtrl()) return;
        const n = play.speed;
        for (let k = 0; k < n; k++) {
          const m = play.masks[play.i];
          if (m === undefined) { endPlay(); return; }
          play.i++;
          KB.input.applyReplay(m);
          detOn();
          try { oUpdate.call(this, dt); } finally { detOff(); }
          if (!play || play.ending || KB.scene !== this) break;
        }
        return;
      }
      recPre();
      detOn();
      try { oUpdate.call(this, dt); } finally { detOff(); }
      recPost(this);
    };
  }
  // 音訊的亂數改走原生（見檔頭）
  if (KB.audio) for (const k in KB.audio) { if (typeof KB.audio[k] === 'function') KB.audio[k] = withNative(KB.audio[k]); }

  // ==========================================================================
  // 11. 無頭模擬（tools/test_replay.py 的確定性 / 幽靈同步驗證）
  // ==========================================================================
  let simOut = null;
  /**
   * simulate({ levelId, seed, masks, ability, room, record, ghostCheck, trace })
   *   → { n, hash, rngCalls, endX, endY, replay?, maxErr?, x?, y? }
   */
  function simulate(o) {
    o = o || {};
    const lv = o.levelId || (KB.LEVELS[0] && KB.LEVELS[0].id);
    const masks = o.masks || [];
    const bakRec = rec, bakPlay = play, bakGhost = ghost, bakSess = KB.session;
    // 先清掉上一次注入殘留的遮罩，否則第 1 幀的 pressed / released 會從上一次的最後一幀算起
    try { KB.input.endReplay && KB.input.endReplay(); } catch (e) { }
    rec = null; play = null; ghost = null; simOut = null;
    simMode = true; simRecord = !!o.record;
    pendingSeed = (o.seed | 0) || 12345;
    KB.session = { lives: o.lives === undefined ? KB.START_LIVES : o.lives, score: 0, extra: !!o.extra };
    const opt = { room: o.room || 0, nofade: true };
    if (o.ability) opt.ability = o.ability;
    const g = new KB.GameScene(lv, opt);
    KB.setScene(g);
    g.fade = 0; g.fadeDir = 0;
    const gh = o.ghostCheck ? (typeof o.ghostCheck === 'string' ? decode(o.ghostCheck) : o.ghostCheck) : null;
    const xs = [], ys = [], fh = [];
    let h = 0x811c9dc5 >>> 0, maxErr = -1, cmp = 0, i = 0;
    for (; i < masks.length; i++) {
      if (KB.scene !== g) break;
      KB.input.applyReplay(masks[i]);
      recPre();
      detOn();
      try { origUpdate.call(g, 1 / 60); } finally { detOff(); }
      recPost(g);
      const p = (KB.game === g && KB.scene === g) ? g.player : null;
      const x = p ? clamp16(Math.round(p.cx)) : -1, y = p ? clamp16(Math.round(p.bottom)) : -1;
      if (o.trace) { xs.push(x); ys.push(y); }
      h = hashNum(h, x); h = hashNum(h, y); h = hashNum(h, p ? p.hp | 0 : -1);
      h = hashNum(h, g.score | 0); h = hashNum(h, g.entities.length); h = hashNum(h, g.roomIdx | 0);
      // 粒子與 PRNG 內部狀態也進雜湊 ⇒ 任何一次 Math.random 的順序 / 次數不同都會被抓到
      h = hashNum(h, g.parts.length); h = hashNum(h, rs | 0); h = hashNum(h, rngCalls);
      for (let k = 0; k < g.parts.length && k < 8; k++) { h = hashNum(h, Math.round(g.parts[k].x)); h = hashNum(h, Math.round(g.parts[k].y)); }
      for (let k = 0; k < g.entities.length && k < 12; k++) { const e = g.entities[k]; h = hashNum(h, Math.round(e.x)); h = hashNum(h, Math.round(e.y)); }
      if (o.trace) fh.push(h >>> 0);
      if (gh && gh.gx && i < (gh.gn | 0)) {
        cmp++;
        maxErr = Math.max(maxErr, Math.abs(gh.gx[i] - x), Math.abs(gh.gy[i] - y));
      }
    }
    const out = { n: i, hash: h >>> 0, rngCalls, seed: rngSeed, endX: xs.length ? xs[xs.length - 1] : -1, endY: ys.length ? ys[ys.length - 1] : -1 };
    if (o.trace) { out.x = xs; out.y = ys; out.fh = fh; }
    if (gh) { out.maxErr = maxErr; out.cmp = cmp; }
    if (o.record) {
      const r = simOut || rec;
      if (r) {
        r.time = r.time || (g.timeAlive | 0) || i;
        r.ability = r.ability || ((g.player && g.player.ability) || '');
        r.date = r.date || today();
        out.replay = JSON.stringify(encode(r));
        out.recFrames = r.n;
      }
    }
    try { KB.input.endReplay && KB.input.endReplay(); } catch (e) { }
    simMode = false; simRecord = false; simOut = null;
    rec = bakRec; play = bakPlay; ghost = bakGhost; KB.session = bakSess;
    if (depth > 0) { depth = 0; Math.random = nativeRandom; }
    return out;
  }

  // ==========================================================================
  // 12. 對外 API
  // ==========================================================================
  KB.REPLAY = {
    VERSION: 1, TOP_N, MAX_BYTES, MAX_FRAMES, SPEEDS,
    // 設定
    ghostOn, setGhost,
    // 排行 / 儲存
    board, addEntry, keyOf, hasReplay, mmssff, today,
    load(levelId) { return loadReplay(keyOf(levelId)); },
    rawSize(levelId) { return (loadRaw(keyOf(levelId)) || '').length; },
    clear(levelId) {
      const ls = LS(); if (!ls) return false;
      if (levelId) {
        const k = keyOf(levelId);
        try { ls.removeItem(RPRE + k); } catch (e) { }
        const st = store(); delete st.boards[k]; writeStore(st); delete cache[k];
      } else {
        const st = store();
        for (const k in st.boards) { try { ls.removeItem(RPRE + k); } catch (e) { } delete cache[k]; }
        st.boards = {}; writeStore(st);
      }
      return true;
    },
    // 重播播放
    watch, stop() { endPlay(); }, playing() { return !!play; }, recording() { return !!rec; },
    /** 唯讀模式（播放中）：readonly() 是否生效、roInfo() 最近一次還原了幾個 localStorage 鍵 */
    readonly: roOn_, roInfo() { return ro ? { on: true, keys: Object.keys(ro.ls).length } : (roLast ? { on: false, restored: roLast.restored } : { on: false }); },
    speed() { return play ? play.speed : 0 },
    setSpeed(n) { if (play && SPEEDS.indexOf(n | 0) >= 0) { play.speed = n | 0; play.hud = 240; return true; } return false; },
    progress() { return play ? { i: play.i, n: play.masks.length, speed: play.speed, warn: !!play.warn } : null; },
    /**
     * 指定「下一次進入關卡」要用的 PRNG 種子（0 = 取消，恢復每次隨機抽）。
     * 自動測試想要可重現的亂數序列時：`KB.REPLAY.forceSeed(1234)` 再 __kb.goto('game', …)。
     */
    forceSeed(n) { pendingSeed = n | 0; return pendingSeed; },
    // 錄製狀態（除錯 / 測試）
    recInfo() { return rec ? { lv: rec.lv, key: rec.key, seed: rec.sd, n: rec.n, deaths: rec.deaths, over: rec.over } : null; },
    ghostInfo() { return ghost ? { n: ghost.gn | 0, frames: ghost.n | 0, seed: ghost.sd } : null; },
    ghostAt(i) { return (ghost && ghost.gx && i >= 0 && i < ghost.gn) ? { x: ghost.gx[i], y: ghost.gy[i], dir: ghost.gd[i], anim: ghost.an[ghost.ga[i]] } : null; },
    // UI 面板
    openBoard, closeBoard, boardOpen, boardUpdate, drawBoardPanel, abilityName,
    // game.js 鉤子
    onEnterLevel, onLevelClear, onExitLevel, drawGhost, drawOverlay,
    // 編解碼（測試）
    encode, decode, encInputs, decInputs, b64, unb64, envOf, envSame,
    sizeOf(str) { return String(str || '').length; },
    simulate,
    rng: KB.RNG,
  };
})();
