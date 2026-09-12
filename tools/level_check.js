// 關卡資料靜態檢查（Node）：node tools/level_check.js [w1 w2 ...]
// 檢查：各列長度、未知字元、底部實心、spawn / door / exit / bossPos / 實體位置（在地圖內、非實心、下方可站）、
//       doors.to 指向存在的房與合法落點、水中敵人在 '~' 內、deco 尺寸與字元、房間結構（門、魔王房）。
// 有任何 error 時以非 0 結束。
'use strict';
const path = require('path');
global.window = {}; global.KB = { LEVELS: [] };
require(path.join(__dirname, '..', 'src', 'levels.js'));

// 機關磁磚（mechanics）：X 硬磚 / I 冰磚 皆為實心；F 導火線可通行
const SOLID = { '#': 1, '*': 1, 'B': 1, 'X': 1, 'I': 1 };
const SLOPE = { '/': 1, '\\': 1 };
const KNOWN = new Set(['#', '=', '*', 'B', 'X', 'I', 'F', '^', '~', 'H', '/', '\\', '.', ' ']);
// 機關磁磚需要的能力，以及可提供該能力的敵人（讓「有機關但拿不到能力」在靜態檢查就抓得到）
const MECH_NEED = { X: ['hammer', 'stone'], F: ['fire'], I: ['fire'] };
const ABILITY_FROM = {
  fire: ['hothead'], ice: ['chilly', 'mrfrosty', 'snowly'], spark: ['sparky'], beam: ['waddledoo', 'starling'],
  cutter: ['sirkibble', 'mirrordee'], sword: ['bladeknight'], hammer: ['bonkers'], stone: ['rocky'],
  // Round 5 的 12 種新能力（武器 / 魔法 / 變身），每種各有一隻專屬敵人
  gunner: ['pistolo'], ninja: ['kagedee'], blade: ['ronin'], bow: ['archerwaddle'],
  mage: ['wizzle'], time: ['tiktok'], gravity: ['gravitron'], clone: ['mimi'],
  giant: ['bigbloom'], dragon: ['drako'], mech: ['bolt'], ghost: ['boodee', 'voidling'],
};
// Round 5 新能力（用於「新能力敵人統計」）：能力 key → 敵人 key
const R5_ABILITY = {
  gunner: 'pistolo', ninja: 'kagedee', blade: 'ronin', bow: 'archerwaddle',
  mage: 'wizzle', time: 'tiktok', gravity: 'gravitron', clone: 'mimi',
  giant: 'bigbloom', dragon: 'drako', mech: 'bolt', ghost: 'boodee',
};
const R5_ENEMY = {};   // 敵人 key → 能力 key
for (const k of Object.keys(R5_ABILITY)) R5_ENEMY[R5_ABILITY[k]] = k;
// 統計容器：r5stat[能力][世界 id] = 隻數 / r5ess[能力][世界 id] = 台座數
const r5stat = {}, r5ess = {};
for (const k of Object.keys(R5_ABILITY)) { r5stat[k] = {}; r5ess[k] = {}; }
const ABILITY_KEYS = new Set(Object.keys(ABILITY_FROM));
// 暗房的發光裝飾（game.js drawDark）
const DARK_LIGHTS = { castle: 'r', dedede: 'tc', cloud: 's', space: 'r' };
const isSolid = ch => !!SOLID[ch];
const isStand = ch => !!SOLID[ch] || !!SLOPE[ch] || ch === '=';

// 實體分類（與 src/enemies.js 行為一致）
const GROUND = new Set(['waddledee', 'waddledoo', 'hothead', 'sirkibble', 'sparky', 'rocky', 'chilly', 'bladeknight', 'bonkers', 'mrfrosty', 'poppybros', 'cappy', 'twizzy', 'kabu', 'glunk', 'spikeball', 'snowly', 'rollarmor',
  // Round 5 新能力敵人（地面型）
  'pistolo', 'kagedee', 'ronin', 'archerwaddle', 'wizzle', 'tiktok', 'mimi', 'bigbloom', 'bolt',
  // Round 6 世界 6（world6）
  'mirrordee']);
// 中魔王（可以解開 gatekeeper 的門鎖）
const MINIBOSS = new Set(['bonkers', 'mrfrosty', 'rollarmor', 'mirrordee']);
const WATER = new Set(['squishy', 'glunk']);
const FLY = new Set(['brontoburt', 'scarfy', 'gordo', 'shotzo', 'dartwing',
  // Round 5 新能力敵人（浮空型，grav 0）
  'gravitron', 'drako', 'boodee',
  // Round 6 world6：starling / voidling 無重力；meteorite 帶重力但「從空中落下」，一樣不要求下方有地面
  'meteorite', 'starling', 'voidling']);
const ITEMS = new Set(['tomato', 'food', 'oneup', 'candy', 'pointstar', 'bigstar']);
// 機關類實體（不需要地面、也不算敵人密度）：大星星收集品 / 開關方塊 / 中魔王門鎖
const GADGET = new Set(['bigstar', 'switchblock', 'gatekeeper', 'essence', 'warpstar']);
const UNLOCKER = new Set(['switchblock', 'gatekeeper']);   // 可以解開 locked 門的實體
// 佔用的高度 / 寬度（格）。Round 6：mirrordee 22×26（2×2）、meteorite 14×14 / starling 14×14 / voidling 14×16（皆 1×1）
const TALL = { bonkers: 2, mrfrosty: 2, bladeknight: 2, snowly: 2, rollarmor: 2, wizzle: 2, bolt: 2, bigbloom: 2, mirrordee: 2 };
const WIDE = { bonkers: 2, mrfrosty: 2, rollarmor: 2, bigbloom: 2, mirrordee: 2 };
const BOSS = { whispywoods: { w: 3, h: 4, ground: true }, lololo: { w: 2, h: 2, ground: true }, kracko: { w: 4, h: 3, ground: false }, metaknight: { w: 2, h: 2, ground: true }, dedede: { w: 3, h: 4, ground: true }, shadowkirby: { w: 2, h: 2, ground: true } };
const DECO = { green: 'tbfsgmrw', castle: 'pwrkacb', island: 'purghsb', cloud: 'csrbdm', dedede: 'pkwtscb', space: 'cprsgm' };
// Round 6（world6）新敵人：key → [碰撞框 w, h, 說明]
const W6_ENEMY = { meteorite: [14, 14, '隕石（滾落 / 落地爆炸，無能力）'], starling: [14, 14, '星靈（飄浮追蹤 + 星彈，beam）'], voidling: [14, 16, '虛空（短暫隱形，ghost）'], mirrordee: [22, 26, '鏡子瓦豆（中魔王，複製 1 招，cutter）'] };
const w6stat = {};
for (const k of Object.keys(W6_ENEMY)) w6stat[k] = {};

const only = process.argv.slice(2);
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  [ERR ] ' + s); };
const warn = (s) => { warns++; console.log('  [warn] ' + s); };

for (const lv of KB.LEVELS) {
  if (only.length && !only.includes(lv.id)) continue;
  // 魔王房由 bossRoom 旗標決定（秘密房可以掛在 rooms 最後面，用 secret + noBoss 標記）
  let bossIdx = lv.rooms.findIndex(r => r.bossRoom);
  if (bossIdx < 0) bossIdx = lv.rooms.length - 1;
  const nSecret = lv.rooms.filter(r => r.secret).length;
  console.log(`== ${lv.id} ${lv.name} (${lv.rooms.length} rooms, boss=${lv.boss} @r${bossIdx}, secret=${nSecret})`);
  // 收集品：每關剛好 3 顆大星星、a 為 0/1/2 不重複
  const bigstars = [];
  lv.rooms.forEach((room, ri) => (room.entities || []).forEach(e => { if (e.t === 'bigstar') bigstars.push({ ri, e }); }));
  if (bigstars.length !== 3) err(`${lv.id}: bigstar 共 ${bigstars.length} 顆（必須剛好 3 顆）`);
  const seenA = {};
  for (const { ri, e } of bigstars) {
    const a = e.a;
    if (a !== 0 && a !== 1 && a !== 2) err(`${lv.id} r${ri}: bigstar (${e.x},${e.y}) 的 a=${a}，必須是 0/1/2`);
    else if (seenA[a] !== undefined) err(`${lv.id}: bigstar a=${a} 重複（r${seenA[a]} 與 r${ri}）`);
    else seenA[a] = ri;
  }
  if (bigstars.length === 3 && Object.keys(seenA).length === 3) console.log(`  (info) ${lv.id}: ★ a0=r${seenA[0]} a1=r${seenA[1]} a2=r${seenA[2]}`);
  if (nSecret === 0) warn(`${lv.id}: 沒有秘密房（secret:true）`);
  lv.rooms.forEach((room, ri) => {
    const tag = `${lv.id} r${ri}(${room.name || ''})`;
    const rows = room.map || [];
    const h = rows.length, w = rows.length ? rows[0].length : 0;
    console.log(`-- ${tag} ${w}x${h}`);
    if (h < 12) err(`${tag}: 高度 ${h} < 12`);
    if (w < 16) err(`${tag}: 寬度 ${w} < 16`);
    rows.forEach((r, y) => { if (r.length !== w) err(`${tag}: 第 ${y} 列長度 ${r.length} != ${w}`); });
    const get = (x, y) => (x < 0 || x >= w) ? '#' : (y < 0 || y >= h) ? '.' : (rows[y][x] || '.');
    // 未知字元
    const bad = new Set();
    rows.forEach(r => { for (const ch of r) if (!KNOWN.has(ch)) bad.add(ch); });
    if (bad.size) err(`${tag}: 未知磁磚字元 ${[...bad].join(' ')}`);
    // ---- 機關磁磚（X 硬磚 / F 導火線 / I 冰磚）----
    const mech = { X: 0, F: 0, I: 0, B: 0 };
    rows.forEach(r => { for (const ch of r) if (mech[ch] !== undefined) mech[ch]++; });
    if (mech.X || mech.F || mech.I) {
      console.log(`  (info) ${tag}: 機關磁磚 X=${mech.X} F=${mech.F} I=${mech.I}（炸彈方塊 B=${mech.B}）`);
      // 房內要有對應能力的來源（能力台座 essence 或會給該能力的敵人）
      const ents = room.entities || [];
      const have = new Set();
      for (const e of ents) {
        if (e.t === 'essence' && e.a) have.add(e.a);
        for (const k of Object.keys(ABILITY_FROM)) if (ABILITY_FROM[k].includes(e.t)) have.add(k);
      }
      for (const ch of ['X', 'F', 'I']) {
        if (!mech[ch]) continue;
        if (!MECH_NEED[ch].some(k => have.has(k)))
          warn(`${tag}: 有 '${ch}' 磁磚但房內沒有 ${MECH_NEED[ch].join(' / ')} 的來源（essence 台座或對應敵人）`);
      }
      // 導火線必須連得到炸彈方塊（4 鄰接連通）
      if (mech.F) {
        const seen = new Set(); let reachB = false;
        const walk = (x, y) => {
          const st = [[x, y]];
          while (st.length) {
            const [cx, cy] = st.pop(); const k = cx + ',' + cy;
            if (seen.has(k)) continue; seen.add(k);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const c = get(cx + dx, cy + dy);
              if (c === 'F') st.push([cx + dx, cy + dy]);
              else if (c === 'B' || c === '*') reachB = true;
            }
          }
        };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (get(x, y) === 'F' && !seen.has(x + ',' + y)) { reachB = false; walk(x, y); if (!reachB) warn(`${tag}: (${x},${y}) 起的導火線沒有連到炸彈 / 星星方塊`); }
      }
    }
    // ---- 暗房 ----
    if (room.dark) {
      const lights = DARK_LIGHTS[room.theme || lv.theme] || '';
      let n = 0;
      if (room.deco && lights) room.deco.forEach(r => { for (const ch of r) if (lights.includes(ch)) n++; });
      console.log(`  (info) ${tag}: 暗房（發光裝飾 ${n} 個）`);
      if (lights && !n) warn(`${tag}: 暗房但沒有任何發光裝飾（主題 ${room.theme || lv.theme} 可用 '${lights}'）`);
      if (!(room.entities || []).some(e => e.t === 'essence' && (e.a === 'spark' || e.a === 'fire')) &&
        !(room.entities || []).some(e => ABILITY_FROM.spark.includes(e.t) || ABILITY_FROM.fire.includes(e.t)))
        warn(`${tag}: 暗房但房內沒有電擊 / 火焰來源（光圈無法擴大）`);
    }
    // 底部：最底列若非實心，其上不得有可站立磁磚（避免懸空地板），也不得是尖刺/水/梯子（需要下方實心）
    let pits = 0;
    for (let x = 0; x < w; x++) {
      const b = get(x, h - 1), a = get(x, h - 2);
      if (!isSolid(b)) {
        // 懸空的實心 / 斜坡 / 尖刺 / 水都是錯誤；懸空的單向平台（雲橋）是合法設計，只提示
        if (isSolid(a) || SLOPE[a] || a === '^' || a === '~') err(`${tag}: x=${x} 最底列 '${b}' 非實心但其上為 '${a}'`);
        if ('^~H'.includes(b)) err(`${tag}: x=${x} 最底列 '${b}' 下方沒有實心`);
        if (b === '.' && (a === '.' || a === '=')) pits++;
      }
      if (isSolid(b) && !isSolid(a) && a !== '.' && a !== '^' && a !== '~' && a !== '/' && a !== '\\' && a !== '=' && a !== 'H') warn(`${tag}: x=${x} 底部第二列 '${a}'`);
    }
    if (pits) console.log(`  (info) ${tag}: ${pits} 格無底洞`);
    // R4（QA R3-P2-06）：「掉得出地圖」的底部開口寬度必須 >= 2 格。
    // 卡比的碰撞框寬 14px、磁磚 16px ⇒ 一格寬的洞是「走過去一定掉進去、進去了又跳不出來」的必死點，
    // 而且玩家從上面完全看不出它是洞還是地板。兩格寬才有起跳 / 漂浮自救的空間。
    // 判定用「最底列站不住」（'.'、'^'…），最底列鋪了單向雲平台 '=' 的洞不算開口（掉下去有得踩）。
    {
      const runs = [];
      for (let x = 0; x < w; x++) {
        if (isStand(get(x, h - 1))) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === x - 1) last[1] = x; else runs.push([x, x]);
      }
      for (const [x0, x1] of runs) {
        const n = x1 - x0 + 1;
        if (n < 2) err(`${tag}: x=${x0} 的底部開口只有 ${n} 格寬（掉出地圖即死，必須 >= 2 格，或在最底列鋪 '=' 雲平台）`);
      }
      if (runs.length) console.log(`  (info) ${tag}: 底部開口 ${runs.map(r => r[0] === r[1] ? `x=${r[0]}` : `x=${r[0]}~${r[1]}`).join(' ')}`);
    }
    // 位置檢查
    const inMap = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
    const checkPos = (what, x, y, needGround, tallRows, wideCols) => {
      if (x === undefined || y === undefined) { err(`${tag}: ${what} 缺座標`); return; }
      if (!inMap(x, y)) { err(`${tag}: ${what} (${x},${y}) 超出地圖`); return; }
      for (let dx = 0; dx < (wideCols || 1); dx++) for (let dy = 0; dy < (tallRows || 1); dy++) {
        const ch = get(x + dx, y - dy);
        if (isSolid(ch) || SLOPE[ch]) err(`${tag}: ${what} (${x},${y}) 佔用格 (${x + dx},${y - dy}) 為 '${ch}'`);
      }
      if (needGround) {
        let ok = false;
        for (let dx = 0; dx < (wideCols || 1); dx++) if (isStand(get(x + dx, y + 1))) ok = true;
        if (!ok) err(`${tag}: ${what} (${x},${y}) 下方 (${x},${y + 1}) 為 '${get(x, y + 1)}'，不可站立`);
      }
    };
    // spawn
    if (!room.spawn) err(`${tag}: 沒有 spawn`); else checkPos('spawn', room.spawn[0], room.spawn[1], true);
    // doors
    const doors = room.doors || [];
    const last = ri === bossIdx;
    if (!last && !doors.length) err(`${tag}: 非魔王房卻沒有門`);
    // locked 門必須有解鎖實體（開關方塊 / 中魔王門鎖）在同一間房
    const nLocked = doors.filter(d => d.locked).length;
    const nUnlocker = (room.entities || []).filter(e => UNLOCKER.has(e.t)).length;
    if (nLocked && !nUnlocker) err(`${tag}: 有 ${nLocked} 扇 locked 門，但房內沒有解鎖實體（${[...UNLOCKER].join(' / ')}）`);
    if (!nLocked && nUnlocker) warn(`${tag}: 有解鎖實體但沒有 locked 門`);
    if ((room.entities || []).some(e => e.t === 'gatekeeper') && !(room.entities || []).some(e => MINIBOSS.has(e.t)))
      err(`${tag}: 有 gatekeeper 但房內沒有中魔王（${[...MINIBOSS].join(' / ')}），門會永遠打不開`);
    doors.forEach((d, di) => {
      checkPos(`door#${di}`, d.x, d.y, true);
      if (!d.to) { err(`${tag}: door#${di} 沒有 to`); return; }
      const tr = lv.rooms[d.to.room];
      if (!tr) { err(`${tag}: door#${di} 指向不存在的房 ${d.to.room}`); return; }
      if (d.to.room <= ri && !d.back && !room.secret) warn(`${tag}: door#${di} 指向前面的房 ${d.to.room}`);
      if (d.secret && !tr.secret) err(`${tag}: door#${di} 標了 secret 但房 ${d.to.room} 不是秘密房`);
      if (tr.secret && !d.secret && !d.back) warn(`${tag}: door#${di} 通往秘密房但沒有 secret:true`);
      const trows = tr.map, tw = trows[0].length, th = trows.length;
      const tget = (x, y) => (x < 0 || x >= tw) ? '#' : (y < 0 || y >= th) ? '.' : trows[y][x];
      if (d.to.x < 0 || d.to.x >= tw || d.to.y < 0 || d.to.y >= th) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 超出房 ${d.to.room}`);
      else {
        if (isSolid(tget(d.to.x, d.to.y))) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 在實心格內`);
        if (!isStand(tget(d.to.x, d.to.y + 1))) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 下方不可站立`);
      }
      const bossRoomTarget = !!tr.bossRoom;
      if (bossRoomTarget && !d.boss) warn(`${tag}: door#${di} 通往魔王房但沒有 boss:true`);
      if (!bossRoomTarget && d.boss) warn(`${tag}: door#${di} 標了 boss:true 但不是通往魔王房`);
    });
    // 魔王房
    if (last) {
      if (!room.bossRoom) warn(`${tag}: 魔王房未標 bossRoom:true`);
      if (!room.exit) err(`${tag}: 魔王房沒有 exit`); else checkPos('exit', room.exit.x, room.exit.y, true);
      const B = BOSS[lv.boss] || { w: 2, h: 2, ground: true };
      if (!room.bossPos) err(`${tag}: 魔王房沒有 bossPos`);
      else {
        checkPos('bossPos', room.bossPos[0], room.bossPos[1], B.ground, B.h, B.w);
        // 登場結束時玩家與魔王要同框（畫面寬 256px = 16 格）：進場落點與 bossPos 距離 ≤ 200px
        const entries = [];
        if (room.spawn) entries.push(['spawn', room.spawn[0], room.spawn[1]]);
        lv.rooms.forEach((r2, i2) => (r2.doors || []).forEach((d2, di2) => { if (d2.to && d2.to.room === ri) entries.push([`r${i2} door#${di2} 落點`, d2.to.x, d2.to.y]); }));
        for (const [what, ex] of entries) {
          const dpx = Math.abs(ex - room.bossPos[0]) * 16;
          if (dpx > 200) err(`${tag}: ${what} x=${ex} 與 bossPos x=${room.bossPos[0]} 相距 ${dpx}px > 200px，登場結束時無法同框`);
          // R3（R2-P1-04）：太近時登場動畫一結束玩家就貼在魔王身上，必吃一次接觸傷害
          else if (dpx < 96) err(`${tag}: ${what} x=${ex} 與 bossPos x=${room.bossPos[0]} 只相距 ${dpx}px < 96px，登場一結束就會碰到魔王`);
        }
        if (lv.boss === 'lololo') {
          const px = room.bossPos[0] - 3, py = room.bossPos[1] - 4;
          if (px < 1 || isSolid(get(px, py))) warn(`${tag}: 拉拉拉預設出生點 (${px},${py}) 不可用，將改生成在洛洛洛右側地面`);
        }
        if (lv.boss === 'kracko') {
          let fy = room.bossPos[1]; while (fy < h && !isStand(get(room.bossPos[0] + 1, fy))) fy++;
          if (fy - room.bossPos[1] < 2) warn(`${tag}: 克拉寇距可站立面僅 ${fy - room.bossPos[1]} 格，建議 bossPos.y 更高`);
        }
      }
    } else if (room.bossRoom) warn(`${tag}: 非魔王房卻標了 bossRoom`);
    // 秘密房：必須 noBoss（否則掛在 rooms 最後面時 game.js 會再生一隻魔王）且要有回程門
    if (room.secret) {
      if (ri === lv.rooms.length - 1 && !room.noBoss) err(`${tag}: 秘密房排在最後一房，必須加 noBoss:true`);
      if (!doors.some(d => d.back)) err(`${tag}: 秘密房沒有回程門（doors 需有一扇 back:true）`);
      const from = [];
      lv.rooms.forEach((r2, i2) => (r2.doors || []).forEach(d2 => { if (d2.to && d2.to.room === ri) from.push(i2); }));
      if (!from.length) err(`${tag}: 秘密房沒有任何房間的門通往這裡`);
    }
    // 實體
    const sp = room.spawn || [0, 0];
    (room.entities || []).forEach((e, ei) => {
      const what = `${e.t}#${ei}`;
      const known = GROUND.has(e.t) || WATER.has(e.t) || FLY.has(e.t) || ITEMS.has(e.t) || GADGET.has(e.t);
      if (!known) { err(`${tag}: ${what} 未知的實體 key`); return; }
      // Round 5：新能力敵人 / 新能力台座統計
      if (R5_ENEMY[e.t]) r5stat[R5_ENEMY[e.t]][lv.id] = (r5stat[R5_ENEMY[e.t]][lv.id] || 0) + 1;
      if (W6_ENEMY[e.t]) w6stat[e.t][lv.id] = (w6stat[e.t][lv.id] || 0) + 1;
      if (e.t === 'essence' && r5ess[e.a]) r5ess[e.a][lv.id] = (r5ess[e.a][lv.id] || 0) + 1;
      if (!inMap(e.x, e.y)) { err(`${tag}: ${what} (${e.x},${e.y}) 超出地圖`); return; }
      const ch = get(e.x, e.y);
      if (isSolid(ch)) err(`${tag}: ${what} (${e.x},${e.y}) 在實心格 '${ch}' 內`);
      const tall = TALL[e.t] || 1, wide = WIDE[e.t] || 1;
      for (let dx = 0; dx < wide; dx++) for (let dy = 0; dy < tall; dy++) {
        if (dx === 0 && dy === 0) continue;
        const c2 = get(e.x + dx, e.y - dy);
        if (isSolid(c2)) err(`${tag}: ${what} (${e.x},${e.y}) 身體佔用格 (${e.x + dx},${e.y - dy}) 為 '${c2}'`);
      }
      if (GROUND.has(e.t)) {
        let ok = false;
        for (let dx = 0; dx < wide; dx++) if (isStand(get(e.x + dx, e.y + 1))) ok = true;
        if (!ok) err(`${tag}: ${what} (${e.x},${e.y}) 地面型敵人下方 '${get(e.x, e.y + 1)}' 不可站立`);
      }
      if (WATER.has(e.t) && ch !== '~') err(`${tag}: ${what} (${e.x},${e.y}) 水中敵人不在水裡（'${ch}'）`);
      if (e.t === 'gordo' && e.a && e.a !== 'v' && e.a !== 'h') err(`${tag}: ${what} gordo a 必須是 'v' 或 'h'`);
      if (e.t === 'gordo' && e.a) {
        const n = e.b !== undefined ? +e.b : 2;
        const tx = e.a === 'h' ? e.x + n : e.x, ty = e.a === 'v' ? e.y - n : e.y;
        if (!inMap(tx, ty)) err(`${tag}: ${what} gordo 移動終點 (${tx},${ty}) 超出地圖`);
        else if (isSolid(get(tx, ty))) warn(`${tag}: ${what} gordo 移動終點 (${tx},${ty}) 為實心 '${get(tx, ty)}'`);
      }
      if (e.drop && !ITEMS.has(e.drop)) err(`${tag}: ${what} drop '${e.drop}' 不是道具`);
      // 能力台座：a 必須是能力 key，且下方要站得住（是個底座）
      if (e.t === 'essence') {
        if (!ABILITY_KEYS.has(e.a)) err(`${tag}: ${what} essence 的 a='${e.a}' 不是能力 key（${[...ABILITY_KEYS].join(' ')}）`);
        if (!isStand(get(e.x, e.y + 1))) err(`${tag}: ${what} essence (${e.x},${e.y}) 下方 '${get(e.x, e.y + 1)}' 不可站立`);
      }
      // 傳送星：a 為磁磚座標路徑，路徑點不可在實心格（rideStar 期間不做碰撞）；b 為目標房
      if (e.t === 'warpstar') {
        const path = e.a;
        if (!Array.isArray(path) || path.length < 2) err(`${tag}: ${what} warpstar 需要 a=[[x,y],...]（至少 2 點）`);
        else path.forEach((pt, pi) => {
          if (!Array.isArray(pt) || pt.length !== 2) { err(`${tag}: ${what} warpstar 路徑點 #${pi} 格式錯誤`); return; }
          if (!inMap(pt[0], pt[1])) err(`${tag}: ${what} warpstar 路徑點 #${pi} (${pt[0]},${pt[1]}) 超出地圖`);
          else if (isSolid(get(pt[0], pt[1])) || SLOPE[get(pt[0], pt[1])]) err(`${tag}: ${what} warpstar 路徑點 #${pi} (${pt[0]},${pt[1]}) 在實心格 '${get(pt[0], pt[1])}' 內`);
        });
        if (!e.b && Array.isArray(path) && path.length) {
          const last = path[path.length - 1];
          if (inMap(last[0], last[1]) && !isStand(get(last[0], last[1] + 1)))
            err(`${tag}: ${what} warpstar 終點 (${last[0]},${last[1]}) 下方 '${get(last[0], last[1] + 1)}' 不可站立`);
        }
        if (e.b) {
          const tr2 = lv.rooms[e.b.room];
          if (!tr2) err(`${tag}: ${what} warpstar 指向不存在的房 ${e.b.room}`);
          else {
            const t2 = tr2.map, tw2 = t2[0].length, th2 = t2.length;
            const g2 = (x, y) => (x < 0 || x >= tw2) ? '#' : (y < 0 || y >= th2) ? '.' : t2[y][x];
            if (e.b.x < 0 || e.b.x >= tw2 || e.b.y < 0 || e.b.y >= th2) err(`${tag}: ${what} warpstar 落點 (${e.b.x},${e.b.y}) 超出房 ${e.b.room}`);
            else if (!isStand(g2(e.b.x, e.b.y + 1))) err(`${tag}: ${what} warpstar 落點 (${e.b.x},${e.b.y}) 下方不可站立`);
          }
        }
      }
      if (!ITEMS.has(e.t) && !GADGET.has(e.t) && e.t !== 'gordo' && Math.abs(e.x - sp[0]) <= 6 && Math.abs(e.y - sp[1]) <= 3) warn(`${tag}: ${what} (${e.x},${e.y}) 離 spawn (${sp[0]},${sp[1]}) 太近`);
      // 大星星：不可以放在會被地形擋住 / 撿不到的地方（水中可以）
      if (e.t === 'bigstar' && ch === '^') err(`${tag}: ${what} (${e.x},${e.y}) 大星星放在尖刺上`);
    });
    // ---- R3 主線補給：每個非魔王房至少要有 1 個「站得到的」番茄 / 食物（不算水底與空中）----
    if (!room.bossRoom) {
      const sup = (room.entities || []).filter(e => e.t === 'tomato' || e.t === 'food' || e.t === 'candy');
      const tagOf = e => (get(e.x, e.y) === '~' ? '水底' : (!isStand(get(e.x, e.y + 1)) ? '空中' : 'ok'));
      const reach = sup.filter(e => tagOf(e) === 'ok');
      console.log(`  (info) ${tag}: 補給 ${sup.length} 個 [${sup.map(e => `${e.t}(${e.x},${e.y})${tagOf(e) === 'ok' ? '' : ':' + tagOf(e)}`).join(' ')}]`);
      if (!reach.length) warn(`${tag}: 沒有任何「站得到」的番茄 / 食物（全在水底或空中），主線補給不足`);
    }
    // 敵人密度
    const nEnemy = (room.entities || []).filter(e => !ITEMS.has(e.t) && !GADGET.has(e.t)).length;
    const area = w * Math.max(1, h / 12);
    console.log(`  (info) ${tag}: 敵人 ${nEnemy} 隻 / 寬 ${w}（約每 ${nEnemy ? Math.round(area / nEnemy) : '-'} 格 1 隻）`);
    // deco
    if (room.deco) {
      if (room.deco.length !== h) err(`${tag}: deco 高度 ${room.deco.length} != ${h}`);
      room.deco.forEach((r, y) => { if (r.length !== w) err(`${tag}: deco 第 ${y} 列長度 ${r.length} != ${w}`); });
      const allowed = DECO[room.theme || lv.theme] || '';
      const badD = new Set();
      room.deco.forEach(r => { for (const ch of r) if (ch !== '.' && ch !== ' ' && !allowed.includes(ch)) badD.add(ch); });
      if (badD.size) warn(`${tag}: deco 字元 ${[...badD].join(' ')} 不在主題 ${room.theme || lv.theme} 的字元表中`);
    }
  });
}
// ---- Round 5：新能力敵人統計（每種能力在幾個世界出現、各世界幾隻）----
{
  console.log('\n== Round 5 新能力敵人統計（12 種新能力）');
  const WORLDS = KB.LEVELS.map(l => l.id).filter(id => !only.length || only.includes(id));
  console.log('  能力      敵人           ' + WORLDS.map(w => w.padEnd(4)).join('') + ' 合計 世界數  台座');
  const NAME = {
    gunner: '槍手', ninja: '忍者', blade: '居合', bow: '弓', mage: '法師', time: '時間',
    gravity: '重力', clone: '分身', giant: '巨大化', dragon: '龍化', mech: '機甲', ghost: '幽靈',
  };
  for (const k of Object.keys(R5_ABILITY)) {
    const per = WORLDS.map(w => r5stat[k][w] || 0);
    const total = per.reduce((a, b) => a + b, 0);
    const nWorld = per.filter(n => n > 0).length;
    const ess = WORLDS.map(w => (r5ess[k][w] || 0) ? w : null).filter(Boolean);
    console.log(`  ${(k + '(' + NAME[k] + ')').padEnd(16)}${R5_ABILITY[k].padEnd(14)}` +
      per.map(n => String(n).padEnd(4)).join('') + ` ${String(total).padEnd(4)} ${String(nWorld).padEnd(7)}` +
      (ess.length ? ess.join(',') : '-'));
    if (!only.length) {
      if (nWorld < 3) warn(`新能力 ${k}（${R5_ABILITY[k]}）只出現在 ${nWorld} 個世界（設計目標：3 個世界、每個世界 1~2 隻）`);
      for (const w of WORLDS) if ((r5stat[k][w] || 0) > 2) warn(`新能力 ${k} 在 ${w} 有 ${r5stat[k][w]} 隻（每個世界建議 1~2 隻）`);
    }
  }
  const essPerWorld = WORLDS.map(w => Object.keys(R5_ABILITY).reduce((n, k) => n + (r5ess[k][w] || 0), 0));
  console.log('  新能力台座 / 世界：' + WORLDS.map((w, i) => `${w}=${essPerWorld[i]}`).join(' '));
  if (!only.length) WORLDS.forEach((w, i) => { if (essPerWorld[i] < 2) warn(`${w}: 新能力台座只有 ${essPerWorld[i]} 個（設計目標：每個世界 ≥ 2 個）`); });
}

// ---- Round 6：world6 新敵人統計 + 尺寸表 ----
{
  console.log('\n== Round 6 world6 新敵人（尺寸表 / 各世界隻數）');
  const WORLDS = KB.LEVELS.map(l => l.id).filter(id => !only.length || only.includes(id));
  console.log('  敵人          尺寸     ' + WORLDS.map(w => w.padEnd(4)).join('') + ' 合計  說明');
  let totalW6 = 0;
  for (const k of Object.keys(W6_ENEMY)) {
    const [ew, eh, desc] = W6_ENEMY[k];
    const per = WORLDS.map(w => w6stat[k][w] || 0);
    const total = per.reduce((a, b) => a + b, 0);
    totalW6 += total;
    console.log(`  ${k.padEnd(14)}${(ew + '×' + eh).padEnd(9)}` + per.map(n => String(n).padEnd(4)).join('') + ` ${String(total).padEnd(5)} ${desc}`);
    if (!only.length && total === 0) warn(`world6 新敵人 ${k} 沒有被放進任何關卡`);
  }
  console.log('  合計 ' + totalW6 + ' 隻');
}

console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
