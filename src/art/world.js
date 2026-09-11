// 世界磁磚 + 裝飾層像素圖（art-world）
// ============================================================================
// 裝飾層字元表（levels agent 請照此使用；deco 一律小寫字母/數字，anchor=bottom，畫在該格底部中央）
//   green : t 大樹(32×48)  b 灌木(24×14)  f 花叢(16×10)  s 路標(16×22)  g 草叢(16×8)  m 蘑菇(12×12)  r 岩石(20×12)  w 木柵欄(16×14)
//   castle: p 石柱(16×48)  w 拱窗(16×24)  r 火炬(8×20, 2幀)  k 旗幟(16×32)  a 盔甲(16×28)  c 鎖鏈(8×32)  b 蜘蛛網(16×16)
//   island: p 棕櫚樹(32×48) u 陽傘(24×32)  r 岩石(20×12)  g 海草(16×20, 2幀)  h 貝殼(10×8)  s 海星(12×10)  b 木桶(14×16)
//   cloud : c 雲朵(32×16)  s 星星(12×12, 2幀)  r 彩虹(48×24)  b 泡泡(12×20, 2幀)  d 小雲(16×8)  m 月亮(16×16)
//   dedede: p 金柱(16×48)  k 旗幟(16×32)  w 拱窗(16×24)  t 火炬(8×24, 2幀)  s 雕像(24×40)  c 燭台(16×24, 2幀)  b 寶箱(16×12)
// 磁磚（16×16）：tile_<theme>_{top,topL,topR,fill,left,right,bottom,platform,slopeL,slopeR}
// 通用：tile_star(2) tile_bomb(2) tile_spike tile_water_top(2) tile_water tile_ladder tile_door(16×24) tile_door_boss(16×28, 2)
// 預覽：KB.previewTheme('castle') —— 在遊戲中切換主題並塞入示範裝飾（tools/theme_shot.py 使用）；KB.DECO_CHARS[theme] 為各主題可用字元
// 注意：deco 層畫在磁磚後面；cloud 的 c/d/s/m/r 與 castle 的 b(蜘蛛網)/c(鎖鏈) 適合放在空中格（anchor 仍是該格底部中央）
// ============================================================================
(function () {
  // ---------- 調色盤（在 const.js 基礎上擴充） ----------
  const PAL = KB.PAL;
  PAL.green = Object.assign(PAL.green, { m: '#b07040', h: '#e0a878', e: '#38a838', E: '#186818', q: '#e8b070', t: '#c88850', T: '#905828', n: '#f8f8f8', v: '#a060d0' });
  PAL.castle = Object.assign(PAL.castle, { m: '#8c8ca4', h: '#c8ccd8', n: '#5c5c78', t: '#a06030', T: '#603818', e: '#f8f8a0', c: '#d0d0e8' });
  PAL.island = Object.assign(PAL.island, { h: '#fff8d0', n: '#ecd890', m: '#c89858', e: '#986838', q: '#e8b878', p: '#f8a0c8', P: '#d878a8', o: '#f89040', O: '#c05818', l: '#98f070', t: '#a06838', T: '#704820' });
  PAL.cloud = Object.assign(PAL.cloud, { e: '#e4e8fa', h: '#ffffff', r: '#f86060', g: '#78d878', v: '#b080e0', l: '#f8f890', d: '#b8c4ee' });
  PAL.dedede = Object.assign(PAL.dedede, { h: '#f8f0a0', e: '#f06060', m: '#6c6c7c', o: '#f89040', t: '#a06030', T: '#603818', g: '#60a060' });
  // 通用磁磚
  const PX = {
    y: '#f8e040', Y: '#d0a000', h: '#fff8a0', o: '#f0a020', w: '#ffffff', e: '#f8f8f8', k: '#202020', s: '#a8a8b0', S: '#585860', d: '#404048',
    c: '#78d8f8', C: '#2090d0', b: '#4060e0', r: '#e83030', R: '#a01818', t: '#c88850', T: '#905828', q: '#e8b070', g: '#48c048', G: '#207820', p: '#ffb0d0',
  };

  // ---------- 小工具 ----------
  const rows16 = r => r; // 標記用
  function check(name, rows, w, h) {
    for (const fr of (typeof rows[0] === 'string' ? [rows] : rows)) {
      if (fr.length !== h || fr.some(r => r.length !== w)) console.error('[world.js] size mismatch', name, fr.length, fr.map(r => r.length).join(','));
    }
  }
  function tile(name, pal, frames, opts) { check(name, frames, 16, 16); return KB.sprite(name, pal, frames, Object.assign({ anchor: 'topleft' }, opts || {})); }
  const setCol = (rows, x, ch, y0, y1) => rows.map((r, y) => (y >= (y0 || 0) && y <= (y1 === undefined ? 15 : y1)) ? r.substring(0, x) + ch + r.substring(x + 1) : r);
  const setRow = (rows, y, str) => rows.map((r, i) => i === y ? str : r);
  const mirror = rows => rows.map(r => r.split('').reverse().join(''));
  const copy = rows => rows.slice();
  // 以 fill 為底、依「深度」上色的 45° 斜坡。dir 'L'：/（右下實心，深度 = x+y-15）；'R'：\（左下實心，深度 = y-x）
  function slope(fill, depthMap, dir) {
    const out = [];
    for (let y = 0; y < 16; y++) {
      let s = '';
      for (let x = 0; x < 16; x++) {
        const d = dir === 'L' ? x + y - 15 : y - x;
        if (d < 0) s += '.';
        else s += d < depthMap.length ? depthMap[d] : fill[y][x];
      }
      out.push(s);
    }
    return out;
  }
  // 8×8 磚塊 → 16×16 交錯排列（下半排位移 4px）
  function bricks(brick, offset) {
    const out = [];
    for (let y = 0; y < 16; y++) { let s = ''; for (let x = 0; x < 16; x++) s += brick[y % 8][(x + (y >= 8 ? (offset === undefined ? 4 : offset) : 0)) % 8]; out.push(s); }
    return out;
  }
  function patch(rows, list) { // [[x,y,ch],...]
    const g = rows.map(r => r.split(''));
    for (const [x, y, ch] of list) g[y][x] = ch;
    return g.map(r => r.join(''));
  }
  // 產生全套 top/topL/topR/fill/left/right/bottom
  function ground(theme, pal, top, fill, edges) {
    const e = Object.assign({ lk: 'k', ls: 'D', rk: 'k', rs: 'D', bk: 'k', bs: 'D', topEdgeFrom: 7 }, edges || {});
    let left = setCol(setCol(fill, 0, e.lk), 1, e.ls);
    let right = setCol(setCol(fill, 15, e.rk), 14, e.rs);
    let bottom = setRow(setRow(fill, 15, e.bk.repeat(16)), 14, e.bs.repeat(16));
    let topL = setCol(setCol(top, 0, e.lk, e.topEdgeFrom), 1, e.ls, e.topEdgeFrom);
    if (e.topL) topL = e.topL(topL);
    let topR = mirror(setCol(setCol(mirror(top), 0, e.lk, e.topEdgeFrom), 1, e.ls, e.topEdgeFrom));
    if (e.topR) topR = e.topR(topR);
    tile('tile_' + theme + '_top', pal, top);
    tile('tile_' + theme + '_topL', pal, topL);
    tile('tile_' + theme + '_topR', pal, topR);
    tile('tile_' + theme + '_fill', pal, fill);
    tile('tile_' + theme + '_left', pal, left);
    tile('tile_' + theme + '_right', pal, right);
    tile('tile_' + theme + '_bottom', pal, bottom);
  }
  function platform(theme, pal, rowsTop) {
    const rows = rowsTop.slice(); while (rows.length < 16) rows.push('................');
    tile('tile_' + theme + '_platform', pal, rows);
  }
  function slopes(theme, pal, fill, depthMap) {
    tile('tile_' + theme + '_slopeL', pal, slope(fill, depthMap, 'L'));
    tile('tile_' + theme + '_slopeR', pal, slope(fill, depthMap, 'R'));
  }

  // 像素畫布小工具（裝飾 / 背景精靈用）
  const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
  const gRows = g => g.map(r => r.join(''));
  function px(g, x, y, ch) { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch; }
  function rect(g, x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, ch); }
  function disc(g, cx, cy, r, ch) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(g, cx + x, cy + y, ch); }
  function ellipse(g, cx, cy, rx, ry, ch) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) px(g, cx + x, cy + y, ch); }
  function line(g, x0, y0, x1, y1, ch) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (; ;) { px(g, x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  // 內側輪廓：非透明且四鄰有透明（或邊界）的像素改為 ch；only 限定可被改的字元
  function outline(g, ch, only) {
    const h = g.length, w = g[0].length, src = g.map(r => r.slice());
    const tr = (x, y) => x < 0 || y < 0 || x >= w || y >= h || src[y][x] === '.';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] === '.') continue; if (only && !only.includes(src[y][x])) continue;
      if (tr(x - 1, y) || tr(x + 1, y) || tr(x, y - 1) || tr(x, y + 1)) g[y][x] = ch;
    }
  }
  // 將 rows 貼到 grid（'.' 不覆蓋）
  function blit(g, rows, x, y) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') px(g, x + i, y + j, r[i]); }); }
  function deco(name, pal, frames, opts) { KB.sprite(name, pal, frames, Object.assign({ anchor: 'bottom' }, opts || {})); }
  // 以 grid 建立 rows：mk(w, h, g => {...})
  const mk = (w, h, fn) => { const g = grid(w, h); fn(g); return gRows(g); };
  // 二次貝茲曲線（thick：往下加粗的像素數）
  function qcurve(g, x0, y0, cx, cy, x1, y1, ch, thick) {
    const n = Math.ceil((Math.abs(x1 - x0) + Math.abs(y1 - y0)) * 1.5) + 4;
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = 1 - u;
      const x = Math.round(v * v * x0 + 2 * v * u * cx + u * u * x1), y = Math.round(v * v * y0 + 2 * v * u * cy + u * u * y1);
      for (let k = 0; k < (thick || 1); k++) px(g, x, y + k, ch);
    }
  }
  // 圓環（1px）
  function ring(g, cx, cy, r, ch) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d <= r * r + r * 0.6 && d > (r - 1) * (r - 1) + (r - 1) * 0.6) px(g, cx + x, cy + y, ch); }
  }
  // 清除區域（設為透明）
  function clear(g, x, y, w, h) { rect(g, x, y, w, h, '.'); }
  KB.pix = { grid, gRows, px, rect, disc, ellipse, line, outline, blit, mk, qcurve, ring, clear }; // 供 backgrounds.js 共用

  // ============================================================================
  // 通用磁磚
  // ============================================================================
  (function generic() {
    const star0 = [
      'YYYYYYYYYYYYYYYY',
      'YhhhhhhhhhhhhhhY',
      'YhyyyyyyyyyyyyoY',
      'YhyyyyyywyyyyyoY',
      'YhyyyyywwwyyyyoY',
      'YhyyywwwwwwwyyoY',
      'YhyyyywwwwwyyyoY',
      'YhyyyyywwwyyyyoY',
      'YhyyyywwwwwyyyoY',
      'YhyyywwyyywwyyoY',
      'YhyyywyyyyywyyoY',
      'YhyyyyyyyyyyyyoY',
      'YhyyyyyyyyyyyyoY',
      'YhyyyyyyyyyyyyoY',
      'YooooooooooooooY',
      'YYYYYYYYYYYYYYYY',
    ];
    const star1 = patch(star0.map(r => r.replace(/w/g, 'h')), [[2, 2, 'w'], [13, 12, 'w'], [12, 3, 'w'], [3, 11, 'w']]);
    tile('tile_star', PX, [star0, star1], { fps: 4 });

    const bomb0 = [
      'SSSSSSSSSSSSSSSS',
      'SeeeeeeeeeeeeedS',
      'SessssssssssssdS',
      'SesssssssssssTdS',
      'SessskkkkksTTsdS',
      'SesskkkkkkkTssdS',
      'SeskkwwkkkkkssdS',
      'SeskkwkkkkkkssdS',
      'SeskkkkkkkkkssdS',
      'SeskkkkkkkkkssdS',
      'SeskkkkkkkkkssdS',
      'SesskkkkkkkkssdS',
      'SessskkkkkssssdS',
      'SessssssssssssdS',
      'SddddddddddddddS',
      'SSSSSSSSSSSSSSSS',
    ];
    const bombA = patch(bomb0, [[12, 2, 'o'], [13, 2, 'y'], [13, 1, 'o']]);
    const bombB = patch(bomb0, [[12, 2, 'y'], [13, 2, 'w'], [13, 1, 'y'], [14, 2, 'o'], [12, 1, 'o'], [13, 3, 'o']]);
    tile('tile_bomb', PX, [bombA, bombB], { fps: 4 });

    tile('tile_spike', PX, [
      '...ww......ww...',
      '...ws......ws...',
      '..wwsS....wwsS..',
      '..wssS....wssS..',
      '.wwssSS..wwssSS.',
      '.wsssSS..wsssSS.',
      'wwssssSSwwssssSS',
      'wsssssSSwsssssSS',
      'wsssssSSwsssssSS',
      'ssssssSSssssssSS',
      'SSSSSSSSSSSSSSSS',
      'kkkkkkkkkkkkkkkk',
      'ddddddddddddddd',
      'dSdddddSdddddSdd',
      'dddddddddddddddd',
      'kkkkkkkkkkkkkkkk',
    ].map(r => r.padEnd(16, 'd')));

    const wbody = Array(13).fill('cccccccccccccccc');
    const water0 = ['www...www...www.', 'cwwwcccwwwcccwww', 'cccccccccccccccc'].concat(wbody);
    const water1 = ['.www...www...www', 'wcwwwcccwwwcccww', 'cccccccccccccccc'].concat(wbody);
    tile('tile_water_top', PX, [patch(water0, [[3, 5, 'C'], [4, 5, 'C'], [11, 9, 'C'], [12, 9, 'C']]), patch(water1, [[4, 5, 'C'], [5, 5, 'C'], [12, 9, 'C'], [13, 9, 'C']])], { fps: 3 });
    tile('tile_water', PX, Array(16).fill('cccccccccccccccc'));

    const lad = ['..tT........tT..', '..qqqqqqqqqqqq..', '..tttttttttttt..', '..tT........tT..'];
    tile('tile_ladder', PX, [].concat(lad, lad, lad, lad));

    const door = [
      '.....kkkkkk.....',
      '...kkTTTTTTkk...',
      '..kTTttttttTTk..',
      '.kTtttttttttTTk.',
      '.kTttkkkkkkttTk.',
      'kTttkkkkyykkktTk',
      'kTttkkkyyyykkTTk',
      'kTttkyyyyyyyykTk',
      'kTttkkyyyyyykkTk',
      'kTttkkkyyyykkkTk',
      'kTttkkyyykyykkTk',
      'kTtttkkkkkkkktTk',
      'kTtttttttttttTTk',
      'kTtqttttttttqTTk',
      'kTtqttttttttqTTk',
      'kTtqttttttttqTTk',
      'kTtqtttttyyttTTk',
      'kTtqtttttYyttTTk',
      'kTtqttttttttqTTk',
      'kTtqttttttttqTTk',
      'kTtqttttttttqTTk',
      'kTtqttttttttqTTk',
      'kTTTTTTTTTTTTTTk',
      'kkkkkkkkkkkkkkkk',
    ];
    check('tile_door', door, 16, 24);
    KB.sprite('tile_door', PX, [door], { anchor: 'bottom' });

    const bdoor = [
      '.......ww.......',
      '.......ww.......',
      '.....wwwwww.....',
      '......wwww......',
      '.....ww..ww.....',
      '.....kkkkkk.....',
      '...kkYYYYYYkk...',
      '..kYYyyyyyyYYk..',
      '.kYyyyyyyyyyyYk.',
      '.kYyykkkkkkyyYk.',
      'kYyykRRRRRRkyYYk',
      'kYyykRrrrrRkyYYk',
      'kYyykrrwwrrkyYYk',
      'kYyykrwwwwrkyYYk',
      'kYyykwwwwwwkyYYk',
      'kYyykrwwwwrkyYYk',
      'kYyykrwwwwrkyYYk',
      'kYyykrwrrwrkyYYk',
      'kYyykrrrrrrkyYYk',
      'kYyykRrrrrRkyYYk',
      'kYyykRrrrrRkyYYk',
      'kYyykRrryyRkyYYk',
      'kYyykRrryyRkyYYk',
      'kYyykRrrrrRkyYYk',
      'kYyykRrrrrRkyYYk',
      'kYyykRRRRRRkyYYk',
      'kYYYYYYYYYYYYYYk',
      'kkkkkkkkkkkkkkkk',
    ];
    check('tile_door_boss', bdoor, 16, 28);
    const bdoor2 = patch(bdoor.map((r, i) => i < 5 ? r.replace(/w/g, 'h') : r), [[3, 1, 'w'], [12, 3, 'w']]);
    KB.sprite('tile_door_boss', PX, [bdoor, bdoor2], { anchor: 'bottom', fps: 2 });

    // ------------------------------------------------------------------
    // 互動機關磁磚（mechanics agent）
    //   X tile_hardblock ：灰色鉚釘硬磚，只有 hammer / stone / 火焰衝刺 / dmg≥5 打得破
    //   F tile_fuse(_v)  ：導火線（可通行），被火焰類判定點燃後沿線燃燒（tile_fuse_burn）
    //   I tile_iceblock  ：半透明冰磚，被火焰類判定命中 20 幀後融化
    // ------------------------------------------------------------------
    tile('tile_hardblock', PX, [
      'SSSSSSSSSSSSSSSS',
      'SwwwwwwwwwwwwwwS',
      'SwsskksssskkssdS',
      'SwskkkssskkkssdS',
      'SwsskksssskkssdS',
      'SwssssssssssssdS',
      'SwssssssssssssdS',
      'SwsssssswssssedS',
      'SwssssssssssssdS',
      'SwssssssssssssdS',
      'SwssssssssssssdS',
      'SwsskksssskkssdS',
      'SwskkkssskkkssdS',
      'SwsskksssskkssdS',
      'SddddddddddddddS',
      'SSSSSSSSSSSSSSSS',
    ]);

    const ICE = Object.assign({}, PX, { i: '#a0e0ff9c', I: '#68b8e8c8', j: '#ffffffcc', J: '#4898d0e0' });
    tile('tile_iceblock', ICE, [
      'JJJJJJJJJJJJJJJJ',
      'JjjiiiiiiiiiiiiJ',
      'JjiiiiijiiiiiiiJ',
      'JjiiiiijjiiiiiiJ',
      'JjiiiiiijIiiiiiJ',
      'JjiiiiiiiIiiiiiJ',
      'JjiiiiiiiiiiiiiJ',
      'JjiiiiiiiiiiiiiJ',
      'JjiiiiIiiiiijjiJ',
      'JjiiiIiiiiijiiiJ',
      'JjiiIiiiiiiiiiiJ',
      'JjiiiiiiiiiiiIiJ',
      'JjiiiiiiiiiiIiiJ',
      'JjiiiiiiiiiIiiiJ',
      'JIIIIIIIIIIIIIIJ',
      'JJJJJJJJJJJJJJJJ',
    ]);

    const blank16 = () => Array(16).fill('................');
    const fuseH = patch(blank16(), []).slice();
    fuseH[6] = '.....o.....o....';
    fuseH[7] = 'TTTqTTTTTTqTTTTT';
    fuseH[8] = 'qqqTqqqqqqTqqqqq';
    tile('tile_fuse', PX, fuseH);

    const fuseV = blank16().map((r, y) => (y === 3 || y === 11) ? '......TtqT......' : '......Ttq.......');
    fuseV[6] = '....o.Ttq.......';
    fuseV[10] = '......Ttq.o.....';
    tile('tile_fuse_v', PX, fuseV);

    const fuseB0 = [
      '................',
      '................',
      '................',
      '........o.......',
      '.......oyo......',
      '......oyhyo.....',
      '.....oyhwhyo....',
      'TTTTqyhwwhyqTTTT',
      'qqqqoyhwwhyoqqqq',
      '.....oyhwhyo....',
      '......oyhyo.....',
      '.......oyo......',
      '........o.......',
      '................',
      '................',
      '................',
    ];
    const fuseB1 = fuseB0.map(r => r.replace(/y/g, 'o').replace(/h/g, 'y').replace(/w/g, 'h'));
    tile('tile_fuse_burn', PX, [fuseB0, fuseB1], { fps: 12 });

    // ------------------------------------------------------------------
    // 能力台座（KB.ITEMS.essence）與傳送星（KB.ITEMS.warpstar）
    // ------------------------------------------------------------------
    KB.sprite('item_essence_base', PX, [[
      '..ssssssssssss..',
      '.shhhhhhhhhhhhs.',
      '.sSSSSSSSSSSSSs.',
      '...ssssssssss...',
      '...sSSSSSSSSs...',
      '...sSddddddSs...',
      '..sSSSSSSSSSSs..',
      '.sSSSSSSSSSSSSs.',
      '.shhhhhhhhhhhhs.',
      'ssSSSSSSSSSSSSss',
    ]], { anchor: 'bottom' });

    const warp0 = [
      '.......y........',
      '......yhy.......',
      '......yhy.......',
      '.....yhhhy......',
      'yyyyyyhhhyyyyyy.',
      '.YyhhhhhhhhhyY..',
      '..YyhhhhhhhyY...',
      '...YyhhhhhyY....',
      '....Yyhhhyy.....',
      '....yhYYYhy.....',
      '...yhY...Yhy....',
      '..yhY.....Yhy...',
      '..yY.......Yy...',
      '................',
      '................',
      '................',
    ];
    const warp1 = patch(warp0.map(r => r.replace(/h/g, 'w')), [[7, 0, 'w'], [1, 4, 'h'], [14, 4, 'h']]);
    KB.sprite('item_warpstar', PX, [warp0, warp1], { anchor: 'bottom', fps: 6 });
  })();

  // ============================================================================
  // green 翠綠草原
  // ============================================================================
  (function green() {
    const P = PAL.green;
    const top = [
      '..l......l....l.',
      '.lgl.l..lgl..lgl',
      'lggglgllgggllggg',
      'gggggggggggggggg',
      'gggggggggggggggg',
      'GgGGGgGGGgGGgGGG',
      'GGGGGGGGGGGGGGGG',
      'kkkkkkkkkkkkkkkk',
      'DDdDDDdDDDDdDDDd',
      'ddddddddDddddddd',
      'dddddddddddddddd',
      'ddmdddddddddmddd',
      'dddddddddDdddddd',
      'dddddddddddddddd',
      'ddddDdddddddddDd',
      'dddddddddddddddd',
    ];
    const fill = [
      'dddddddddddddddd',
      'ddDDdddddddmdddd',
      'dddDdddddddddddd',
      'ddddddddddDddddd',
      'dddddddddddddddd',
      'dmdddddDDddddddd',
      'ddddddddDddddddd',
      'dddddddddddddhdd',
      'dddddddddddddddd',
      'ddDddddddmdddddd',
      'dddddddddddddddd',
      'ddddddDDdddddddd',
      'dddddddDddddddDd',
      'dddhdddddddddddd',
      'dddddddddddddddd',
      'ddddddddddDddddd',
    ];
    ground('green', P, top, fill, {
      topEdgeFrom: 7,
      topL: r => patch(r, [[0, 2, 'l'], [0, 3, 'g'], [0, 4, 'G'], [0, 5, 'G'], [0, 6, 'k'], [1, 6, 'G'], [0, 1, '.'], [0, 0, '.']]),
      topR: r => patch(r, [[15, 2, 'l'], [15, 3, 'g'], [15, 4, 'G'], [15, 5, 'G'], [15, 6, 'k'], [14, 6, 'G'], [15, 1, '.'], [15, 0, '.']]),
    });
    platform('green', P, [
      '..l....l.....l..',
      '.lgl..lgl..lgl.l',
      'gggggggggggggggg',
      'GgGGGgGGGgGGgGGG',
      'kkkkkkkkkkkkkkkk',
      'DdDDdDDDdDDDdDDd',
      'kkkkkkkkkkkkkkkk',
    ]);
    slopes('green', P, fill, ['l', 'g', 'g', 'g', 'G', 'G', 'k', 'D']);
  })();

  // ============================================================================
  // castle 幽靜古堡 —— 灰藍石磚（磚縫深色、錯排），頂部一排較亮石緣
  // ============================================================================
  (function castle() {
    const P = PAL.castle;
    const brick = [
      'DDDDDDDD',
      'DhmmmmmS',
      'DmSSSSSn',
      'DmSSSSSn',
      'DmSSmSSn',
      'DmSSSSSn',
      'DmSSSSSn',
      'Dnnnnnnn',
    ];
    const fill = patch(bricks(brick), [[4, 5, 'n'], [13, 2, 'm'], [9, 12, 'n'], [3, 13, 'm']]);
    const cap = [
      'Dccccccccccccccc',
      'Dhhhhhhhhhhhhhhh',
      'Dhssssssssssssss',
      'Dhssssssssssssss',
      'Dhsssssssmssssss',
      'Dhssssssssssssss',
      'Dmmmmmmmmmmmmmmm',
      'Dnnnnnnnnnnnnnnn',
    ];
    const top = cap.concat(fill.slice(8));
    ground('castle', P, top, fill, {
      topEdgeFrom: 0,
      topL: r => setCol(setCol(r, 1, 'h', 1, 7), 1, 'c', 0, 0),
      topR: r => setCol(setCol(r, 14, 'm', 1, 7), 14, 'c', 0, 0),
    });
    platform('castle', P, [
      'Dccccccccccccccc',
      'Dhhhhhhhhhhhhhhh',
      'Dhssssssssssssss',
      'Dhsssssssmssssss',
      'Dmmmmmmmmmmmmmmm',
      'DDDDDDDDDDDDDDDD',
      'kkkkkkkkkkkkkkkk',
    ]);
    slopes('castle', P, fill, ['c', 'h', 's', 's', 'm', 'n', 'D']);

    // ---- 裝飾 ----
    // p 石柱 16×48
    deco('deco_castle_p', P, mk(16, 48, g => {
      rect(g, 3, 8, 10, 37, 's'); rect(g, 4, 9, 1, 35, 'h'); rect(g, 10, 9, 2, 35, 'm'); rect(g, 11, 9, 1, 35, 'n');
      rect(g, 7, 10, 1, 33, 'm'); rect(g, 8, 10, 1, 33, 'n');
      rect(g, 0, 0, 16, 4, 's'); rect(g, 1, 4, 14, 4, 's'); rect(g, 1, 1, 14, 1, 'c'); rect(g, 1, 3, 14, 1, 'm'); rect(g, 2, 5, 12, 1, 'h'); rect(g, 2, 6, 12, 1, 'n');
      rect(g, 1, 44, 14, 2, 's'); rect(g, 0, 46, 16, 2, 'S'); rect(g, 2, 44, 12, 1, 'h');
      outline(g, 'k');
    }));
    // w 拱窗 16×24（夜空 + 星）
    deco('deco_castle_w', P, [
      '.....kkkkkk.....',
      '...kkSSSSSSkk...',
      '..kSSmmmmmmSSk..',
      '.kSmmDDDDDDmmSk.',
      '.kSmDBBBBBBDmSk.',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBwBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBbBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDDDDDDDDDDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBwBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBwBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDBBBBBBBBDmSk',
      'kSmDDDDDDDDDDmSk',
      'kSSSSSSSSSSSSSSk',
      'kkkkkkkkkkkkkkkk',
    ]);
    // r 火炬 8×20（2 幀）
    const torchBase = [
      '..kSSk..',
      '..kSSk..',
      '..kttk..',
      '..kttk..',
      '..kttk..',
      '..kTTk..',
      '.kSSSSk.',
      'kSSkkSSk',
      'kSk..kSk',
      'kk....kk',
    ];
    const flame0 = [
      '........',
      '...oo...',
      '..oyyo..',
      '..oyeo..',
      '.oyeeyo.',
      '.oyeeyo.',
      '.ooyyoo.',
      '..rooo..',
      '...rr...',
      '...rr...',
    ];
    const flame1 = [
      '....o...',
      '...oyo..',
      '..oyeo..',
      '..oyeyo.',
      '.oyeeyo.',
      '.oyeeyo.',
      '.ooyyoo.',
      '..oror..',
      '...rr...',
      '...rr...',
    ];
    deco('deco_castle_r', P, [flame0.concat(torchBase), flame1.concat(torchBase)], { fps: 6 });
    // k 旗幟 16×32
    const flagTail = Array(10).fill('.sS.............');
    deco('deco_castle_k', P, [
      '.kk.............',
      'kwwk............',
      '.kk.............',
      '.sSkkkkkkkkkkkk.',
      '.sSkrrrrrrrrrrrk',
      '.sSkrrrrrrrrrrrk',
      '.sSkrrrrryrrrrrk',
      '.sSkrrrryyyrrrrk',
      '.sSkrrryyyyyrrrk',
      '.sSkrryyyyyyyrrk',
      '.sSkrrrryyyrrrrk',
      '.sSkrrryyryyrrrk',
      '.sSkrrryrrryrrrk',
      '.sSkrrrrrrrrrrrk',
      '.sSkRrrrrrrrrrRk',
      '.sSkRRrrrrrrrRRk',
      '.sSkRRRrrrrrRRRk',
      '.sSkRRRRrrrRRRRk',
      '.sSkRRRRkkkRRRRk',
      '.sSkRRRk...kRRRk',
      '.sSkRRk.....kRRk',
      '.sSkkk.......kkk',
    ].concat(flagTail));
    // a 盔甲 16×28
    deco('deco_castle_a', P, [
      '......kkkk......',
      '....kkhhhhkk....',
      '...khhssssshk...',
      '...ksssssssSk...',
      '...kSkkkkkkSk...',
      '...ksssssssSk...',
      '....kSSSSSSk....',
      '.kkkkkSSSSkkkkk.',
      'khhhkhsssshkSSSk',
      'khsskssyyssksSSk',
      'kSsskssyyssksSSk',
      'kSSkkssssssskkSk',
      'kSSk.kssssSk.kSk',
      'kSSk.kssssSk.kSk',
      'kSSk.kSSSSSk.kSk',
      '.kk.kSSkkkSSk.kk',
      '....kSSk.kSSk...',
      '....kssk.kssk...',
      '....kssk.kssk...',
      '....kssk.kssk...',
      '....kSSk.kSSk...',
      '...kSSSkkSSSk...',
      '...kkkkkkkkkk...',
      '..kDDDDDDDDDDk..',
      '.kDDSSSSSSSSDDk.',
      'kDDDDDDDDDDDDDDk',
      'kDDDDDDDDDDDDDDk',
      'kkkkkkkkkkkkkkkk',
    ]);
    // c 鎖鏈 8×32
    const link = [
      '..kkkk..',
      '.kSssSk.',
      '.kS..Sk.',
      '.kS..Sk.',
      '.kSSSSk.',
      '..kkkk..',
      '...kSk..',
      '...kSk..',
    ];
    deco('deco_castle_c', P, [].concat(link, link, link, link));
    // b 蜘蛛網 16×16（左上角）
    deco('deco_castle_b', P, mk(16, 16, g => {
      for (const [x1, y1] of [[15, 0], [15, 4], [15, 9], [13, 14], [8, 15], [3, 15], [0, 15]]) line(g, 0, 0, x1, y1, 'c');
      for (const r of [5, 9, 13]) for (let a = 0; a <= 90; a += 4) { const t = a * Math.PI / 180; px(g, Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r), 'c'); }
      rect(g, 10, 9, 3, 2, 'k'); px(g, 9, 8, 'k'); px(g, 13, 8, 'k'); px(g, 9, 11, 'k'); px(g, 13, 11, 'k'); px(g, 11, 8, 'w');
    }));
  })();

  // ============================================================================
  // island 漂浮群島 —— 沙灘頂 + 棕色岩石；平台為木板
  // ============================================================================
  (function island() {
    const P = PAL.island;
    const fill = mk(16, 16, g => {
      rect(g, 0, 0, 16, 16, 'd');
      for (const [cx, cy, rx, ry] of [[4, 4, 3, 2], [11, 3, 3, 2], [7, 10, 4, 2], [13, 11, 2, 1], [2, 12, 2, 1]]) {
        ellipse(g, cx, cy + 1, rx, ry, 'e'); ellipse(g, cx, cy, rx, ry, 'm'); px(g, cx - 1, cy - 1, 'q'); px(g, cx + 1, cy, 'd');
      }
      px(g, 9, 14, 'e'); px(g, 14, 7, 'e'); px(g, 1, 8, 'e'); px(g, 6, 15, 'q');
    });
    const top = [
      'hhhhhhhhhhhhhhhh',
      'shsssssssshsssss',
      'ssssssnsssssssss',
      'sssssssssssssnss',
      'snssssssssssssss',
      'SsSSSSnSSSSSSSSS',
      'SSSSSSSSSSSSSSSS',
      'eeeeeeeeeeeeeeee',
    ].concat(fill.slice(8));
    ground('island', P, top, fill, {
      topEdgeFrom: 0,
      topL: r => patch(setCol(r, 1, 's', 2, 6), [[0, 0, '.'], [1, 0, 'k'], [1, 1, 'h'], [1, 7, 'e']]),
      topR: r => patch(setCol(r, 14, 'S', 2, 6), [[15, 0, '.'], [14, 0, 'k'], [14, 1, 'h'], [14, 7, 'e']]),
    });
    platform('island', P, [
      'qqqqqqqqqqqqqqqq',
      'tttTttttttttTttt',
      'ttttttttTttttttt',
      'TTTTTTTTTTTTTTTT',
      'kkkkkkkkkkkkkkkk',
      '.kTk........kTk.',
      '.kkk........kkk.',
    ]);
    slopes('island', P, fill, ['h', 's', 's', 'n', 'S', 'e']);

    // ---- 裝飾 ----
    // p 棕櫚樹 32×48
    deco('deco_island_p', P, mk(32, 48, g => {
      for (let y = 47; y >= 13; y--) {
        const x = 13 + Math.round((47 - y) * (47 - y) / 240);
        rect(g, x, y, 4, 1, 't'); px(g, x + 3, y, 'T'); if (y % 4 === 0) rect(g, x, y, 4, 1, 'T'); else px(g, x, y, 'q');
      }
      rect(g, 11, 46, 8, 2, 'T'); px(g, 12, 45, 'T');
      const fr = [[20, 13, 30, 5, 31, 19], [20, 13, 25, 0, 31, 6], [20, 13, 19, -2, 10, 2], [20, 13, 11, 2, 2, 8], [20, 13, 10, 7, 1, 20], [20, 13, 27, 12, 29, 26]];
      for (const [x0, y0, cx, cy, x1, y1] of fr) qcurve(g, x0, y0, cx, cy, x1, y1, 'G', 3);
      for (const [x0, y0, cx, cy, x1, y1] of fr) qcurve(g, x0, y0, cx, cy, x1, y1, 'g', 2);
      for (const [x0, y0, cx, cy, x1, y1] of fr) qcurve(g, x0, y0, cx, cy, x1, y1, 'l', 1);
      for (const [cx, cy] of [[18, 16], [22, 17], [20, 19]]) { disc(g, cx, cy, 2, 'T'); disc(g, cx, cy, 1, 'e'); px(g, cx - 1, cy - 1, 'q'); }
    }));
    // u 陽傘 24×32
    deco('deco_island_u', P, mk(24, 32, g => {
      ellipse(g, 11, 11, 11, 10, 'r'); ellipse(g, 12, 11, 11, 10, 'r');
      clear(g, 0, 12, 24, 20);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) if (g[y][x] === 'r' && (Math.floor((x + 2) / 4) & 1)) g[y][x] = 'w';
      for (let x = 0; x < 24; x++) if (g[11][x] !== '.' && (x & 1)) g[11][x] = 'k';
      outline(g, 'k', ['r', 'w']);
      rect(g, 11, 12, 2, 20, 'T'); rect(g, 11, 12, 1, 20, 't'); rect(g, 11, 0, 2, 2, 'y'); px(g, 11, 0, 'h');
    }));
    // r 岩石 20×12
    deco('deco_island_r', P, mk(20, 12, g => {
      ellipse(g, 9, 7, 9, 4, 'd'); disc(g, 7, 5, 4, 'd'); disc(g, 12, 4, 3, 'd');
      outline(g, 'T');
      for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if (g[y][x] === 'd' && y >= 8) g[y][x] = 'e';
      for (const [x, y] of [[5, 3], [6, 3], [5, 4], [11, 3], [4, 6]]) if (g[y][x] === 'd') g[y][x] = 'm';
      px(g, 6, 2, 'q'); px(g, 12, 2, 'q');
    }));
    // g 海草 16×20（2 幀）
    const weed = ph => mk(16, 20, g => {
      for (const [bx, h, sp] of [[3, 20, 0], [8, 15, 2], [12, 18, 4]]) {
        for (let y = 20 - h; y < 20; y++) {
          const x = bx + Math.round(Math.sin(y / 3.2 + ph + sp) * 1.5);
          px(g, x, y, 'g'); px(g, x + 1, y, 'G'); if ((y + sp) % 5 === 0) { px(g, x - 1, y, 'l'); px(g, x + 2, y, 'G'); }
        }
      }
    });
    deco('deco_island_g', P, [weed(0), weed(1.5)], { fps: 2 });
    // h 貝殼 10×8
    deco('deco_island_h', P, [
      '...kkkk...',
      '..kphhpk..',
      '.kphpphpk.',
      '.kppPppPk.',
      'kpPppPppPk',
      'kppPppPppk',
      '.kkpPPpkk.',
      '...kkkk...',
    ]);
    // s 海星 12×10
    deco('deco_island_s', P, [
      '.....oo.....',
      '....Oooo....',
      '....Oyoo....',
      'OOOOooooOOOO',
      '.OoooyooooO.',
      '..OoooooooO.',
      '..OoyoooyoO.',
      '.OooO..OooO.',
      '.OoO....OoO.',
      '.OO......OO.',
    ]);
    // b 木桶 14×16
    deco('deco_island_b', P, [
      '..kkkkkkkkkk..',
      '.kDDDDDDDDDDk.',
      'kDmmmmmmmmmmDk',
      'kqtTttTttTttTk',
      'kqtTttTttTttTk',
      'kqtTttTttTttTk',
      'kDDDDDDDDDDDDk',
      'kmmmmmmmmmmmmk',
      'kqtTttTttTttTk',
      'kqtTttTttTttTk',
      'kqtTttTttTttTk',
      'kqtTttTttTttTk',
      'kDDDDDDDDDDDDk',
      'kDmmmmmmmmmmDk',
      '.kDDDDDDDDDDk.',
      '..kkkkkkkkkk..',
    ]);
  })();

  // ============================================================================
  // cloud 泡泡雲海 —— 白色蓬鬆雲磚（邊緣圓潤、淡藍陰影）；平台為小雲
  // ============================================================================
  (function cloud() {
    const P = PAL.cloud;
    const fill = mk(16, 16, g => {
      rect(g, 0, 0, 16, 16, 'w');
      for (const [x, y] of [[3, 2], [4, 2], [11, 5], [12, 5], [6, 9], [13, 12], [2, 13], [8, 14], [9, 14]]) px(g, x, y, 'e');
      for (const [x, y] of [[10, 1], [1, 7], [14, 9]]) px(g, x, y, 'h');
    });
    const top = [
      '..dddd....dddd..',
      '.dhhhhd..dhhhhd.',
      'dhwwwwhddhwwwwhd',
    ].concat(fill.slice(3));
    ground('cloud', P, top, fill, { lk: 'd', ls: 'W', rk: 'd', rs: 'W', bk: 'd', bs: 'W', topEdgeFrom: 3 });
    tile('tile_cloud_bottom', P, fill.slice(0, 13).concat([
      'dWwwwwWddWwwwwWd',
      '.dWwwwd..dWwwwd.',
      '..dddd....dddd..',
    ]));
    platform('cloud', P, [
      '....dddd..ddd...',
      '..ddhhhhddhhhd..',
      '.dhwwwwwwwwwwwd.',
      'dhwwwwwwwwwwwwwd',
      'dwwwwwwwwwwwwwwd',
      'dWWwwwwwwwwwwWWd',
      '.ddWWWWWWWWWWdd.',
    ]);
    slopes('cloud', P, fill, ['d', 'h', 'w', 'w', 'e']);

    // ---- 裝飾 ----
    // c 雲朵 32×16
    const puff = (w, h, parts) => mk(w, h, g => {
      for (const [cx, cy, r] of parts) disc(g, cx, cy, r, 'w');
      outline(g, 'd');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[y][x] !== 'w') continue;
        if (y >= h - 3 && g[y + 1] && g[y + 1][x] !== '.') g[y][x] = 'e';
        if (g[y + 1] && g[y + 1][x] === 'd') g[y][x] = 'W';
        if (g[y - 1] && g[y - 1][x] === 'd') g[y][x] = 'h';
      }
    });
    deco('deco_cloud_c', P, puff(32, 16, [[6, 11, 5], [12, 8, 7], [20, 7, 7], [26, 11, 5], [16, 12, 4]]));
    // d 小雲 16×8
    deco('deco_cloud_d', P, puff(16, 8, [[4, 5, 3], [8, 4, 4], [12, 5, 3]]));
    // s 星星 12×12（2 幀）
    const star0 = [
      '.....oo.....',
      '.....oo.....',
      '....oyyo....',
      '....oyyo....',
      'ooooylyyoooo',
      '.oyyyllyyyo.',
      '..oyyllyyo..',
      '..oyyyyyyo..',
      '.oyyyooyyyo.',
      '.oyyo..oyyo.',
      'oyo......oyo',
      'oo........oo',
    ];
    const star1 = star0.map(r => r.replace(/y/g, 'l').replace(/l/g, 'l'));
    deco('deco_cloud_s', P, [star0, patch(star1, [[5, 5, 'h'], [6, 5, 'h'], [5, 6, 'h'], [6, 6, 'h']])], { fps: 3 });
    // r 彩虹 48×24
    deco('deco_cloud_r', P, mk(48, 24, g => {
      const cols = ['r', 'o', 'l', 'g', 'c', 'v'];
      for (let i = 0; i < cols.length; i++) {
        for (let rr = 24 - i * 2; rr > 24 - i * 2 - 2; rr -= 0.5) {
          for (let a = 0; a <= 180; a += 0.6) { const t = a * Math.PI / 180; const x = Math.round(23.5 + Math.cos(t) * rr), y = Math.round(23 - Math.sin(t) * rr); if (y >= 0 && y < 24) px(g, x, y, cols[i]); }
        }
      }
      for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) { const dx = x - 23.5, dy = 23 - y; if (dx * dx + dy * dy < 12 * 12) g[y][x] = '.'; }
    }));
    // b 泡泡 12×20（2 幀）
    const bub = list => mk(12, 20, g => { for (const [cx, cy, r] of list) { ring(g, cx, cy, r, 'c'); px(g, cx - Math.floor(r / 2), cy - Math.floor(r / 2), 'h'); if (r > 2) px(g, cx - Math.floor(r / 2) + 1, cy - Math.floor(r / 2), 'h'); } });
    deco('deco_cloud_b', P, [bub([[6, 15, 4], [3, 6, 2], [9, 9, 2]]), bub([[6, 14, 4], [3, 4, 2], [9, 7, 2], [7, 2, 1]])], { fps: 2 });
    // m 月亮 16×16
    deco('deco_cloud_m', P, mk(16, 16, g => {
      disc(g, 7, 8, 7, 'y'); disc(g, 10, 7, 6, '.');
      outline(g, 'o', ['y']);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'y' && (g[y][x - 1] === 'o' || g[y - 1] && g[y - 1][x] === 'o') && x < 7) g[y][x] = 'l';
      px(g, 4, 10, 'k'); px(g, 2, 8, 'k');
    }));
  })();

  // ============================================================================
  // dedede 迪迪迪城 —— 紅地毯頂、金色鑲邊、深灰石填充
  // ============================================================================
  (function dedede() {
    const P = PAL.dedede;
    const brick = [
      'DDDDDDDD',
      'DSSSSSSd',
      'DSdddddD',
      'DSdddddD',
      'DSddmddD',
      'DSdddddD',
      'DSdddddD',
      'DdDDDDDD',
    ];
    const fill = patch(bricks(brick), [[3, 3, 'D'], [13, 5, 'm'], [10, 11, 'D'], [5, 13, 'm']]);
    const carpet = [
      'eeeeeeeeeeeeeeee',
      'rrrrrrrrrrrrrrrr',
      'rrrrrrrrrrrrrrrr',
      'rrrRrrrrrrrRrrrr',
      'RRRRRRRRRRRRRRRR',
      'hyyyhyyyhyyyhyyy',
      'YyyYYyyYYyyYYyyY',
      'kkkkkkkkkkkkkkkk',
    ];
    const top = carpet.concat(fill.slice(8));
    ground('dedede', P, top, fill, {
      topEdgeFrom: 0,
      topL: r => setCol(setCol(r, 1, 'R', 0, 4), 1, 'Y', 5, 6),
      topR: r => setCol(setCol(r, 14, 'R', 0, 4), 14, 'Y', 5, 6),
    });
    platform('dedede', P, [
      'eeeeeeeeeeeeeeee',
      'rrrrrrrrrrrrrrrr',
      'rrrRrrrrrrrRrrrr',
      'RRRRRRRRRRRRRRRR',
      'hyyyhyyyhyyyhyyy',
      'YyyYYyyYYyyYYyyY',
      'kkkkkkkkkkkkkkkk',
    ]);
    slopes('dedede', P, fill, ['e', 'r', 'r', 'R', 'y', 'Y', 'k']);

    // ---- 裝飾 ----
    // p 金柱 16×48
    deco('deco_dedede_p', P, mk(16, 48, g => {
      rect(g, 3, 8, 10, 37, 'y'); rect(g, 4, 9, 1, 35, 'h'); rect(g, 10, 9, 2, 35, 'Y'); rect(g, 7, 10, 1, 33, 'Y'); rect(g, 8, 10, 1, 33, 'h');
      rect(g, 3, 20, 10, 3, 'r'); rect(g, 3, 21, 10, 1, 'R'); rect(g, 3, 32, 10, 3, 'r'); rect(g, 3, 33, 10, 1, 'R');
      rect(g, 0, 0, 16, 4, 'y'); rect(g, 1, 4, 14, 4, 'y'); rect(g, 1, 1, 14, 1, 'h'); rect(g, 1, 3, 14, 1, 'Y'); rect(g, 2, 5, 12, 1, 'h'); rect(g, 2, 6, 12, 1, 'Y');
      rect(g, 1, 44, 14, 2, 'y'); rect(g, 0, 46, 16, 2, 'Y'); rect(g, 2, 44, 12, 1, 'h');
      outline(g, 'k');
    }));
    // k 旗幟 16×32（藍旗、金冠徽）
    deco('deco_dedede_k', P, [
      '.kk.............',
      'kyyk............',
      '.kk.............',
      '.sSkkkkkkkkkkkk.',
      '.sSkbbbbbbbbbbbk',
      '.sSkbbbbbbbbbbbk',
      '.sSkbbyybbbyybbk',
      '.sSkbbyybybyybbk',
      '.sSkbbyyyyyyybbk',
      '.sSkbbyyyyyyybbk',
      '.sSkbbyyryryybbk',
      '.sSkbbyyyyyyybbk',
      '.sSkbbbbbbbbbbbk',
      '.sSkbbbbbbbbbbbk',
      '.sSkBbbbbbbbbbBk',
      '.sSkBBbbbbbbbBBk',
      '.sSkBBBbbbbbBBBk',
      '.sSkBBBBbbbBBBBk',
      '.sSkBBBBkkkBBBBk',
      '.sSkBBBk...kBBBk',
      '.sSkBBk.....kBBk',
      '.sSkkk.......kkk',
    ].concat(Array(10).fill('.sS.............')));
    // w 拱窗 16×24（金框、暗夜）
    deco('deco_dedede_w', P, [
      '.....kkkkkk.....',
      '...kkyyyyyykk...',
      '..kyhhhhhhhhyk..',
      '.kyhYYYYYYYYhyk.',
      '.kyYDDDDDDDDYyk.',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDwDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDpDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYYYYYYYYYYYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDwDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDwDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYDDDDDDDDDYyk',
      'kyhYYYYYYYYYYYyk',
      'kyyyyyyyyyyyyyyk',
      'kkkkkkkkkkkkkkkk',
    ]);
    // t 火炬 8×24（2 幀，金托架）
    const tBase = [
      '..kyyk..',
      '..kYYk..',
      '..kttk..',
      '..kttk..',
      '..kttk..',
      '..kttk..',
      '..kTTk..',
      '.kyyyyk.',
      'kyykkyyk',
      'kYk..kYk',
      'kk....kk',
      '........',
    ];
    const tF0 = [
      '........',
      '........',
      '...oo...',
      '..oyyo..',
      '..oyho..',
      '.oyhhyo.',
      '.oyhhyo.',
      '.ooyyoo.',
      '..eooo..',
      '...ee...',
      '...ee...',
      '...rr...',
    ];
    const tF1 = [
      '........',
      '....o...',
      '...oyo..',
      '..oyho..',
      '..oyhyo.',
      '.oyhhyo.',
      '.oyhhyo.',
      '.ooyyoo.',
      '..oeoe..',
      '...ee...',
      '...ee...',
      '...rr...',
    ];
    deco('deco_dedede_t', P, [tF0.concat(tBase), tF1.concat(tBase)], { fps: 6 });
    // s 雕像 24×40（圓滾滾的國王石像 + 基座）
    deco('deco_dedede_s', P, [
      '.......kk..kk..kk.......',
      '.......kskkskkksk.......',
      '.......kssssssssk.......',
      '......kSSSSSSSSSSk......',
      '.....kssssssssssssk.....',
      '....ksssssssssssssSk....',
      '....kssDsssssDsssSSk....',
      '....kssssssssssssSSk....',
      '....kssssssssssssSSkkkk.',
      '....ksssssssssssskSSSSSk',
      '....kSssssssssssSkkkkkk.',
      '.....kSssssssssSSk......',
      '......kSSSSSSSSSk.......',
      '....kkkssssssssskkk.....',
      '..kkssksssssssssskssk...',
      '.kssssksssssssssskssssk.',
      'kssssskssssssssssksssssk',
      'kssssskssssssssssksssssk',
      'kSssssksssssssssskssssSk',
      'kSSsskSSSSSSSSSSSSkssSSk',
      '.kSSkkSmmSSSSSSmmSkkSSk.',
      '..kkkkssssssssssssskkkk.',
      '......ksssssssssssssk...',
      '......ksssssssssssssk...',
      '......kssSSSSSSSSSssk...',
      '......kssssssssssssSk...',
      '......ksssssssssssSSk...',
      '......kSssssssssssSSk...',
      '.......kSSSSSSSSSSSk....',
      '......kkssskkkkssskk....',
      '.....kssssk..kssssk.....',
      '.....kSSSSk..kSSSSk.....',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kmmmmmmmmmmmmmmmmmmmmk.',
      '.kssssssssssssssssssssk.',
      '.kSSSSSSSSSSSSSSSSSSSSk.',
      '.kSSSSSSSSSSSSSSSSSSSSk.',
      '.kddddddddddddddddddddk.',
      '.kDDDDDDDDDDDDDDDDDDDDk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ]);
    // c 燭台 16×24（2 幀）
    const cand = (f) => mk(16, 24, g => {
      rect(g, 5, 22, 6, 2, 'Y'); rect(g, 6, 21, 4, 1, 'y'); rect(g, 7, 12, 2, 9, 'Y'); px(g, 7, 12, 'y');
      rect(g, 1, 12, 14, 1, 'Y'); rect(g, 1, 10, 1, 2, 'Y'); rect(g, 14, 10, 1, 2, 'Y'); rect(g, 2, 11, 12, 1, 'y');
      for (const [x, h] of [[0, 3], [7, 5], [13, 3]]) { rect(g, x, 9 - h + 1, 3, h, 'w'); rect(g, x, 9 - h + 1, 1, h, 'h'); rect(g, x, 10, 3, 1, 'Y'); }
      const fl = f ? [[1, 4], [8, 1], [14, 4]] : [[1, 3], [8, 2], [14, 3]];
      for (const [x, y] of fl) { px(g, x, y, 'y'); px(g, x, y + 1, 'o'); px(g, x, y - 1, 'h'); if (f) px(g, x + (x > 8 ? -1 : 1), y, 'o'); }
      outline(g, 'k', ['Y', 'y']);
    });
    deco('deco_dedede_c', P, [cand(0), cand(1)], { fps: 5 });
    // b 寶箱 16×12
    deco('deco_dedede_b', P, [
      '.kkkkkkkkkkkkkk.',
      'kYyyyyyyyyyyyyYk',
      'kytTttttTtttTtyk',
      'kytTttttTtttTtyk',
      'kYyyyyyhhyyyyyYk',
      'kYYYYYYhyYYYYYYk',
      'kytTtttkhkttTtyk',
      'kytTtttkkkttTtyk',
      'kytTttttttttTtyk',
      'kYyyyyyyyyyyyyYk',
      'kkkkkkkkkkkkkkkk',
      '.kk..........kk.',
    ]);
  })();

  // ============================================================================
  // green 裝飾
  // ============================================================================
  (function greenDeco() {
    const P = PAL.green;
    // t 大樹 32×48
    deco('deco_green_t', P, mk(32, 48, g => {
      rect(g, 12, 26, 8, 22, 'd'); rect(g, 17, 26, 3, 22, 'D'); rect(g, 13, 27, 1, 20, 'q');
      rect(g, 9, 45, 14, 3, 'd'); rect(g, 19, 45, 4, 3, 'D'); rect(g, 8, 47, 16, 1, 'D');
      outline(g, 'k');
      disc(g, 16, 14, 13, 'G'); disc(g, 8, 21, 7, 'G'); disc(g, 24, 21, 7, 'G'); disc(g, 16, 24, 8, 'G');
      disc(g, 16, 13, 11, 'g'); disc(g, 9, 20, 5, 'g'); disc(g, 23, 20, 5, 'g');
      disc(g, 11, 9, 4, 'l'); disc(g, 8, 18, 2, 'l'); px(g, 18, 5, 'l'); px(g, 19, 5, 'l');
      for (const [x, y] of [[20, 15], [12, 22], [25, 23]]) { px(g, x, y, 'r'); px(g, x + 1, y, 'r'); px(g, x, y + 1, 'r'); px(g, x + 1, y + 1, 'r'); px(g, x, y, 'p'); }
      outline(g, 'E', ['g', 'G', 'l']);
    }));
    // b 灌木 24×14
    deco('deco_green_b', P, mk(24, 14, g => {
      ellipse(g, 11, 9, 11, 4, 'G'); disc(g, 6, 8, 5, 'G'); disc(g, 13, 6, 6, 'G'); disc(g, 18, 8, 5, 'G');
      disc(g, 6, 8, 3, 'g'); disc(g, 13, 6, 4, 'g'); disc(g, 18, 8, 3, 'g'); ellipse(g, 11, 9, 8, 2, 'g');
      px(g, 5, 6, 'l'); px(g, 12, 3, 'l'); px(g, 13, 3, 'l'); px(g, 17, 6, 'l');
      px(g, 9, 9, 'r'); px(g, 16, 8, 'r'); px(g, 4, 10, 'r');
      outline(g, 'E');
    }));
    // f 花叢 16×10
    deco('deco_green_f', P, mk(16, 10, g => {
      for (let x = 0; x < 16; x++) { const h = 2 + ((x * 7) % 3); rect(g, x, 10 - h, 1, h, (x % 3) ? 'g' : 'G'); if (h === 4) px(g, x, 10 - h, 'l'); }
      for (const [x, y, c, e] of [[2, 3, 'r', 'y'], [8, 2, 'y', 'w'], [13, 4, 'p', 'y']]) {
        rect(g, x, y + 3, 1, 3, 'G');
        px(g, x - 1, y, c); px(g, x + 1, y, c); px(g, x, y - 1, c); px(g, x, y + 1, c); px(g, x, y, e);
        px(g, x - 1, y - 1, c); px(g, x + 1, y + 1, c);
      }
    }));
    // s 路標 16×22
    deco('deco_green_s', P, mk(16, 22, g => {
      rect(g, 6, 9, 3, 13, 'd'); rect(g, 8, 9, 1, 13, 'D');
      rect(g, 1, 2, 12, 7, 'b'); for (let i = 0; i < 3; i++) rect(g, 13 + i, 2 + i, 1, 7 - i * 2, 'b');
      rect(g, 1, 8, 12, 1, 'B'); rect(g, 12, 3, 1, 5, 'B');
      rect(g, 3, 4, 6, 1, 'D'); rect(g, 3, 6, 4, 1, 'D');
      outline(g, 'k');
    }));
    // g 草叢 16×8
    deco('deco_green_g', P, [
      '......l.........',
      '..l...g....l....',
      '..g..lg.l..g..l.',
      '.lg..gg.g.lg..g.',
      '.gg.lgg.gg.gg.gg',
      'lggGgggggGggGggg',
      'gGgGGgGgGGgGGgGg',
      'GGGGGGGGGGGGGGGG',
    ]);
    // m 蘑菇 12×12
    deco('deco_green_m', P, [
      '....kkkk....',
      '..kkrrrrkk..',
      '.krrwwrrrrk.',
      '.krwwrrrwwk.',
      'krrrrrrrwwrk',
      'krwwrrrrrrrk',
      'kkkkkkkkkkkk',
      '..kbbbbbbk..',
      '..kbbBbbbk..',
      '..kbbBbbbk..',
      '..kbBBBbbk..',
      '..kkkkkkkk..',
    ]);
    // r 岩石 20×12
    deco('deco_green_r', P, mk(20, 12, g => {
      ellipse(g, 9, 7, 9, 4, 's'); disc(g, 7, 5, 4, 's'); disc(g, 13, 4, 3, 's');
      outline(g, 'x');
      for (let y = 8; y < 12; y++) for (let x = 0; x < 20; x++) if (g[y][x] === 's') g[y][x] = 'S';
      px(g, 5, 3, 'w'); px(g, 6, 3, 'w'); px(g, 12, 2, 'w'); px(g, 10, 8, 'S'); px(g, 15, 7, 'S');
    }));
    // w 木柵欄 16×14
    deco('deco_green_w', P, [
      '.kkk.......kkk..',
      'kdddk.....kdddk.',
      'kddDk.....kddDk.',
      'kkkkkkkkkkkkkkkk',
      'dddddddddddddddd',
      'DDDDDDDDDDDDDDDD',
      'kkkkkkkkkkkkkkkk',
      'kddDk.....kddDk.',
      'kddDk.....kddDk.',
      'kkkkkkkkkkkkkkkk',
      'dddddddddddddddd',
      'DDDDDDDDDDDDDDDD',
      'kkkkkkkkkkkkkkkk',
      'kddDk.....kddDk.',
    ]);
  })();

  // @@CONTINUE@@

  // ============================================================================
  // 預覽：切換目前房間的主題並塞入示範裝飾（tools/theme_shot.py 使用）
  // ============================================================================
  KB.DECO_CHARS = { green: 'tbfsgmrw', castle: 'pwrkacb', island: 'purghsb', cloud: 'csrbdm', dedede: 'pkwtscb' };
  KB.previewTheme = function (theme) {
    const gm = KB.game; if (!gm || !gm.map) return false;
    const chars = KB.DECO_CHARS[theme] || '';
    gm.theme = theme; gm.room.bg = theme;
    const m = gm.map, d = [];
    for (let y = 0; y < m.h; y++) d.push(new Array(m.w).fill('.'));
    let i = 0;
    for (let tx = 1; tx < m.w; tx += 3) {
      let ty = -1;
      for (let y = 0; y < m.h; y++) if (m.rows[y][tx] === '#') { ty = y; break; } else if (KB.TileMap.isGround(m.rows[y][tx])) break;
      if (ty <= 0 || !chars) continue;
      d[ty - 1][tx] = chars[i % chars.length]; i++;
    }
    m.deco = d;
    return true;
  };
})();
