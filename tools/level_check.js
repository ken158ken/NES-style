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
const GROUND = new Set(['waddledee', 'waddledoo', 'hothead', 'sirkibble', 'sparky', 'rocky', 'chilly', 'bladeknight', 'bonkers', 'mrfrosty', 'poppybros', 'cappy', 'twizzy', 'kabu', 'glunk']);
const WATER = new Set(['squishy', 'glunk']);
const FLY = new Set(['brontoburt', 'scarfy', 'gordo', 'shotzo']);
const ITEMS = new Set(['tomato', 'food', 'oneup', 'candy', 'pointstar']);
const TALL = { bonkers: 2, mrfrosty: 2, bladeknight: 2 };   // 佔用的高度（格）
const WIDE = { bonkers: 2, mrfrosty: 2 };
const BOSS = { whispywoods: { w: 3, h: 4, ground: true }, lololo: { w: 2, h: 2, ground: true }, kracko: { w: 4, h: 3, ground: false }, metaknight: { w: 2, h: 2, ground: true }, dedede: { w: 3, h: 4, ground: true } };
const DECO = { green: 'tbfsgmrw', castle: 'pwrkacb', island: 'purghsb', cloud: 'csrbdm', dedede: 'pkwtscb' };

const only = process.argv.slice(2);
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  [ERR ] ' + s); };
const warn = (s) => { warns++; console.log('  [warn] ' + s); };

for (const lv of KB.LEVELS) {
  if (only.length && !only.includes(lv.id)) continue;
  console.log(`== ${lv.id} ${lv.name} (${lv.rooms.length} rooms, boss=${lv.boss})`);
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
    const last = ri === lv.rooms.length - 1;
    if (!last && !doors.length) err(`${tag}: 非最後一房卻沒有門`);
    doors.forEach((d, di) => {
      checkPos(`door#${di}`, d.x, d.y, true);
      if (!d.to) { err(`${tag}: door#${di} 沒有 to`); return; }
      const tr = lv.rooms[d.to.room];
      if (!tr) { err(`${tag}: door#${di} 指向不存在的房 ${d.to.room}`); return; }
      if (d.to.room <= ri) warn(`${tag}: door#${di} 指向前面的房 ${d.to.room}`);
      const trows = tr.map, tw = trows[0].length, th = trows.length;
      const tget = (x, y) => (x < 0 || x >= tw) ? '#' : (y < 0 || y >= th) ? '.' : trows[y][x];
      if (d.to.x < 0 || d.to.x >= tw || d.to.y < 0 || d.to.y >= th) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 超出房 ${d.to.room}`);
      else {
        if (isSolid(tget(d.to.x, d.to.y))) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 在實心格內`);
        if (!isStand(tget(d.to.x, d.to.y + 1))) err(`${tag}: door#${di} 落點 (${d.to.x},${d.to.y}) 下方不可站立`);
      }
      const bossRoomTarget = !!tr.bossRoom || d.to.room === lv.rooms.length - 1;
      if (bossRoomTarget && !d.boss) warn(`${tag}: door#${di} 通往魔王房但沒有 boss:true`);
      if (!bossRoomTarget && d.boss) warn(`${tag}: door#${di} 標了 boss:true 但不是通往魔王房`);
    });
    // 魔王房
    if (last) {
      if (!room.bossRoom) warn(`${tag}: 最後一房未標 bossRoom:true`);
      if (!room.exit) err(`${tag}: 魔王房沒有 exit`); else checkPos('exit', room.exit.x, room.exit.y, true);
      const B = BOSS[lv.boss] || { w: 2, h: 2, ground: true };
      if (!room.bossPos) err(`${tag}: 魔王房沒有 bossPos`);
      else {
        checkPos('bossPos', room.bossPos[0], room.bossPos[1], B.ground, B.h, B.w);
        if (lv.boss === 'lololo') {
          const px = room.bossPos[0] - 3, py = room.bossPos[1] - 4;
          if (px < 1 || isSolid(get(px, py))) warn(`${tag}: 拉拉拉預設出生點 (${px},${py}) 不可用，將改生成在洛洛洛右側地面`);
        }
        if (lv.boss === 'kracko') {
          let fy = room.bossPos[1]; while (fy < h && !isStand(get(room.bossPos[0] + 1, fy))) fy++;
          if (fy - room.bossPos[1] < 2) warn(`${tag}: 克拉寇距可站立面僅 ${fy - room.bossPos[1]} 格，建議 bossPos.y 更高`);
        }
      }
    } else if (room.bossRoom) warn(`${tag}: 非最後一房卻標了 bossRoom`);
    // 實體
    const sp = room.spawn || [0, 0];
    (room.entities || []).forEach((e, ei) => {
      const what = `${e.t}#${ei}`;
      const known = GROUND.has(e.t) || WATER.has(e.t) || FLY.has(e.t) || ITEMS.has(e.t);
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
      if (!ITEMS.has(e.t) && e.t !== 'gordo' && Math.abs(e.x - sp[0]) <= 6 && Math.abs(e.y - sp[1]) <= 3) warn(`${tag}: ${what} (${e.x},${e.y}) 離 spawn (${sp[0]},${sp[1]}) 太近`);
    });
    // 敵人密度
    const nEnemy = (room.entities || []).filter(e => !ITEMS.has(e.t)).length;
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
