// 關卡資料靜態檢查（Node）：node tools/level_check.js [w1 w2 ...]
// 檢查：各列長度、未知字元、底部實心、spawn / door / exit / bossPos / 實體位置（在地圖內、非實心、下方可站）、
//       doors.to 指向存在的房與合法落點、水中敵人在 '~' 內、deco 尺寸與字元、房間結構（門、魔王房）。
// 有任何 error 時以非 0 結束。
'use strict';
const path = require('path');
global.window = {}; global.KB = { LEVELS: [] };
require(path.join(__dirname, '..', 'src', 'levels.js'));

const SOLID = { '#': 1, '*': 1, 'B': 1 };
const SLOPE = { '/': 1, '\\': 1 };
const KNOWN = new Set(['#', '=', '*', 'B', '^', '~', 'H', '/', '\\', '.', ' ']);
const isSolid = ch => !!SOLID[ch];
const isStand = ch => !!SOLID[ch] || !!SLOPE[ch] || ch === '=';

// 實體分類（與 src/enemies.js 行為一致）
const GROUND = new Set(['waddledee', 'waddledoo', 'hothead', 'sirkibble', 'sparky', 'rocky', 'chilly', 'bladeknight', 'bonkers', 'mrfrosty', 'poppybros', 'cappy', 'twizzy', 'kabu', 'glunk', 'spikeball', 'snowly']);
const WATER = new Set(['squishy', 'glunk']);
const FLY = new Set(['brontoburt', 'scarfy', 'gordo', 'shotzo', 'dartwing']);
const ITEMS = new Set(['tomato', 'food', 'oneup', 'candy', 'pointstar', 'bigstar']);
// 機關類實體（不需要地面、也不算敵人密度）：大星星收集品 / 開關方塊 / 中魔王門鎖
const GADGET = new Set(['bigstar', 'switchblock', 'gatekeeper']);
const UNLOCKER = new Set(['switchblock', 'gatekeeper']);   // 可以解開 locked 門的實體
const TALL = { bonkers: 2, mrfrosty: 2, bladeknight: 2, snowly: 2 };   // 佔用的高度（格）
const WIDE = { bonkers: 2, mrfrosty: 2 };
const BOSS = { whispywoods: { w: 3, h: 4, ground: true }, lololo: { w: 2, h: 2, ground: true }, kracko: { w: 4, h: 3, ground: false }, metaknight: { w: 2, h: 2, ground: true }, dedede: { w: 3, h: 4, ground: true } };
const DECO = { green: 'tbfsgmrw', castle: 'pwrkacb', island: 'purghsb', cloud: 'csrbdm', dedede: 'pkwtscb' };

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
    if ((room.entities || []).some(e => e.t === 'gatekeeper') && !(room.entities || []).some(e => e.t === 'bonkers' || e.t === 'mrfrosty'))
      err(`${tag}: 有 gatekeeper 但房內沒有中魔王（bonkers / mrfrosty），門會永遠打不開`);
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
      if (!ITEMS.has(e.t) && !GADGET.has(e.t) && e.t !== 'gordo' && Math.abs(e.x - sp[0]) <= 6 && Math.abs(e.y - sp[1]) <= 3) warn(`${tag}: ${what} (${e.x},${e.y}) 離 spawn (${sp[0]},${sp[1]}) 太近`);
      // 大星星：不可以放在會被地形擋住 / 撿不到的地方（水中可以）
      if (e.t === 'bigstar' && ch === '^') err(`${tag}: ${what} (${e.x},${e.y}) 大星星放在尖刺上`);
    });
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
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
