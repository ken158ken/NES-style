// 道具 / UI 像素圖（art-items-ui）
// 所有精靈皆為程式手繪點陣；錨點一律使用 KB.sprite 預設（bottom = 底部中央），
// 例外：ui_ability_<key>_mini 也是 bottom（items.js 以 cy+4 為底畫在能力星中央）。
(function () {
  // ---------- 調色盤：UI 通用 + 卡比臉 + 食物 ----------
  const P = Object.assign({}, KB.PAL.ui, {
    n: '#202848',            // 卡比輪廓 / 眼睛深藍
    l: '#ffd8e8',            // 粉紅高光
    h: '#f27090',            // 腮紅
    i: '#5060c0',            // 眼睛藍高光
    f: '#e8305c', F: '#a81c48', // 腳紅 / 腳暗紅
    t: '#d08048', T: '#8a5020', // 茶色 / 深茶（麵包、木柄）
    a: '#fff8b0',            // 淡黃高光
    v: '#a040c0', V: '#602080', // 紫 / 深紫
    C: '#2090c0',            // 深青
    u: '#f8f8ff',            // 冰白
    j: '#ffe8c0',            // 奶油
    q: '#d8d8e0',            // 銀（刀刃）
    x: '#0a0a14',            // LOGO 陰影
  });

  // ---------- 小工具：合成 / 縮放 / 圓角 / 描邊 ----------
  const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
  // 將 src 貼到 dst 的 (x,y)，'.' 與 ' ' 視為透明；回傳新陣列
  function paste(dst, src, x, y) {
    const out = dst.map(r => r.split(''));
    src.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]; if (ch === '.' || ch === ' ') continue;
        const yy = y + j, xx = x + i;
        if (yy < 0 || yy >= out.length || xx < 0 || xx >= out[0].length) continue;
        out[yy][xx] = ch;
      }
    });
    return out.map(r => r.join(''));
  }
  const scaleRows = (rows, s) => rows.flatMap(r => Array(s).fill(r.split('').map(c => c.repeat(s)).join('')));
  const solid = (rows, x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
  // 圓角：補內凹角、切外凸角（passes 次）
  function roundify(rows, passes) {
    for (let p = 0; p < (passes || 1); p++) {
      const H = rows.length, W = rows[0].length;
      // 內凹角補點
      let out = rows.map(r => r.split(''));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (solid(rows, x, y)) continue;
        const u = solid(rows, x, y - 1), d = solid(rows, x, y + 1), l = solid(rows, x - 1, y), r = solid(rows, x + 1, y);
        if ((u && l && solid(rows, x - 1, y - 1)) || (u && r && solid(rows, x + 1, y - 1)) || (d && l && solid(rows, x - 1, y + 1)) || (d && r && solid(rows, x + 1, y + 1))) {
          const src = u ? rows[y - 1][x] : rows[y + 1][x]; out[y][x] = src;
        }
      }
      rows = out.map(r => r.join(''));
      // 外凸角切點
      out = rows.map(r => r.split(''));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!solid(rows, x, y)) continue;
        const u = solid(rows, x, y - 1), d = solid(rows, x, y + 1), l = solid(rows, x - 1, y), r = solid(rows, x + 1, y);
        if ((!u && !l) || (!u && !r) || (!d && !l) || (!d && !r)) out[y][x] = '.';
      }
      rows = out.map(r => r.join(''));
    }
    return rows;
  }
  // 1px 描邊（4 鄰域）：在透明處靠近實心像素的位置填 ch
  function outline(rows, ch) {
    const H = rows.length, W = rows[0].length, out = rows.map(r => r.split(''));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid(rows, x, y)) continue;
      if (solid(rows, x, y - 1) || solid(rows, x, y + 1) || solid(rows, x - 1, y) || solid(rows, x + 1, y)) out[y][x] = ch;
    }
    return out.map(r => r.join(''));
  }
  // 以 KB.FONT 排出放大文字（遮罩 '#'），gap 為字距（放大後 px）
  function bigText(str, s, gap) {
    const gl = str.split('').map(ch => (KB.FONT[ch] || KB.FONT['?']).slice(0, 7).map(r => r.slice(0, 7)));
    const adv = 7 * s + gap;
    let out = blank(gl.length * adv - gap, 7 * s);
    gl.forEach((g, i) => { out = paste(out, scaleRows(g, s), i * adv, 0); });
    return out;
  }
  // 遮罩上色：主色 + 上緣高光 + 下緣陰影（bevel）
  function bevel(mask, main, hi, lo, depth) {
    depth = depth || 1;
    return mask.map((r, y) => r.split('').map((c, x) => {
      if (c === '.') return '.';
      for (let k = 1; k <= depth; k++) if (!solid(mask, x, y - k)) return hi;
      for (let k = 1; k <= depth; k++) if (!solid(mask, x, y + k)) return lo;
      return main;
    }).join(''));
  }
  // 產生圓球（卡比身體）：d 直徑；含 n 輪廓、l 高光、P 陰影
  function ball(d, cols) {
    cols = Object.assign({ fill: 'p', edge: 'n', hi: 'l', lo: 'P' }, cols || {});
    const c = (d - 1) / 2, r = d / 2 - 0.05;
    const inside = (x, y) => x >= 0 && y >= 0 && x < d && y < d && (x - c) * (x - c) + (y - c) * (y - c) <= r * r;
    const rows = [];
    for (let y = 0; y < d; y++) {
      let s = '';
      for (let x = 0; x < d; x++) {
        if (!inside(x, y)) { s += '.'; continue; }
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (edge) { s += cols.edge; continue; }
        const dx = x - c, dy = y - c;
        const shade = (dx + dy) > r * 0.9 && (dx * dx + dy * dy) > r * r * 0.55;
        const hi = dx < -r * 0.25 && dy < -r * 0.35 && (dx * dx + dy * dy) > r * r * 0.28 && (dx * dx + dy * dy) < r * r * 0.62 && dx > -r * 0.75;
        s += shade ? cols.lo : hi ? cols.hi : cols.fill;
      }
      rows.push(s);
    }
    return rows;
  }
  const recolor = (rows, map) => rows.map(r => r.split('').map(c => map[c] || c).join(''));
  const S = (name, frames, opts) => KB.sprite(name, P, frames, opts);

  // ============================================================
  //  道具
  // ============================================================
  // 極限番茄 14×16
  S('item_tomato', [[
    '......kk......',
    '...k.kGgk.k...',
    '..kgkkGggkkgk.',
    '..kkgggggggkk.',
    '.krrkgggggkrrk',
    'krrrrkgGgkrrrk',
    'krprrrkkkrrrrk',
    'kprrrrrrrrrrrk',
    'krrrwrrrrwrrrk',
    'krrrwwrrwwrrrk',
    'kRrrwrwwrwrrRk',
    'kRrrwrrrrwrrRk',
    '.kRrwrrrrwrRk.',
    '.kRRRRRRRRRRk.',
    '..kkRRRRRRkk..',
    '....kkkkkk....',
  ]]);

  // 食物 4 幀：漢堡 / 冰淇淋 / 蛋糕 / 飲料
  const burger = [
    '...kkkkkkkk...',
    '..kttttttttk..',
    '.ktatttatttak.',
    '.kttttttttttk.',
    '.kTTTTTTTTTTk.',
    'kggGggGggGggGk',
    'kyyyyyyyyyyyyk',
    'kTTTTTTTTTTTTk',
    '.kTTTTTTTTTTk.',
    '.kttttttttttk.',
    '.kttttttttttk.',
    '..kkkkkkkkkk..',
  ];
  const icecream = [
    '......kk......',
    '.....krRk.....',
    '....kkkkkk....',
    '...kpplpppk...',
    '..kppllpppppk.',
    '..kpppppppppk.',
    '..kkpppppppkk.',
    '...kkkkkkkkk..',
    '...ktTtTtTtk..',
    '....kTtTtTk...',
    '....ktTtTtk...',
    '.....kTtTk....',
    '.....ktTtk....',
    '......kTk.....',
    '......kkk.....',
  ];
  const cake = [
    '.....kkkk.....',
    '....kkrrkk....',
    '...kwwrrwwk...',
    '..kwwwwwwwwk..',
    '.kjjjjjjjjjjk.',
    '.kppppppppppk.',
    '.kttttttttttk.',
    '.kjjjjjjjjjjk.',
    '.kppppppppppk.',
    '.kttttttttttk.',
    '.kttttttttttk.',
    '..kkkkkkkkkk..',
  ];
  const drink = [
    '........kkk...',
    '........krk...',
    '.......krk....',
    '..kkkkkkrkkk..',
    '.kwwwwwkrkwwk.',
    '.kkkkkkkkkkkk.',
    '..kccwccccCk..',
    '..kccwccccCk..',
    '..kccwyyycCk..',
    '..kccwyayycCk.',
    '..kccwyyycCk..',
    '...kcwcccCk...',
    '...kccccCCk...',
    '....kkkkkk....',
  ];
  S('item_food', [burger, icecream, cake, drink]);

  // 卡比頭（14×12），用於 1UP 與能力圖示
  const KHEAD = [
    '....nnnnnn....',
    '..nnppppppnn..',
    '.nppplppppppn.',
    '.nppwwppwwppn.',
    'npppnnppnnpppn',
    'npppnnppnnpppn',
    'nphpiippiiphpn',
    'nphpppppppphpn',
    'nppppmppmpppPn',
    '.nppppmmpppPn.',
    '..nppppppPPn..',
    '....nnnnnn....',
  ];
  // 1UP：卡比臉 + 黃底 1UP 標籤 14×20
  const tag1up = [
    '.kkkkkkkkkkkk.',
    'kyyyyyyyyyyyyk',
    'kyykykykykkyyk',
    'kykkykykykykyk',
    'kyykykykykkyyk',
    'kyykykykykyyyk',
    'kyykykkkykyyyk',
    'kyyyyyyyyyyyyk',
    '.kkkkkkkkkkkk.',
  ];
  S('item_1up', [paste(blank(14, 20), KHEAD, 0, 0).map((r, i) => i >= 11 ? tag1up[i - 11] : r)]);

  // 無敵糖果：紅白螺旋棒棒糖 12×16
  S('item_candy', [[
    '....kkkk....',
    '..kkwwrrkk..',
    '.kwwrrrwwrk.',
    '.kwrwwwwrwk.',
    'kwrwrrrwrwrk',
    'kwrwrwrwrwrk',
    'kwrwrwwwrwrk',
    'kwrwrrrrrwrk',
    '.kwrwwwwwwk.',
    '.krrrrrrrrk.',
    '..kkkkkkkk..',
    '.....kek....',
    '.....kek....',
    '.....kek....',
    '.....kek....',
    '.....kkk....',
  ]]);

  // 點數星 8×8
  S('item_star', [[
    '...aa...',
    '...ya...',
    'yyyyayyy',
    '.yyaayy.',
    '..yyyY..',
    '.yyYYyy.',
    '.YY..YY.',
    'Y......Y',
  ]]);

  // 大星星（收集品）16×16，2 幀閃爍：金色五角星 + 淡黃高光 + 右下暗面
  const bigstar = [
    '.......kk.......',
    '......kaak......',
    '......kaak......',
    '.....kyaayk.....',
    '.....kyaayk.....',
    'kkkkkkyaaykkkkkk',
    'kyyyyyyaayyyyyyk',
    '.kyyyyaaaayyyyk.',
    '..kyyyaaaayyyk..',
    '...kyyaaaayyk...',
    '...kyyyaayyyk...',
    '..kyyyykkyyYYk..',
    '..kyykk..kkYYk..',
    '.kyyk......kYYk.',
    '.kyk........kYk.',
    '.kk..........kk.',
  ];
  S('item_bigstar', [bigstar, recolor(bigstar, { y: 'a', a: 'w', Y: 'y' })], { fps: 5 });

  // 開關方塊 16×16，3 幀：0 石框 + 金星、1 金星發亮（閃爍）、2 被按下（星星凹陷變灰）
  const swblock = [
    'kkkkkkkkkkkkkkkk',
    'kwwwwwwwwwwwwwwk',
    'kwsssssssssssSdk',
    'kws....yy....Sdk',
    'kws...yyyy...Sdk',
    'kwsyyyyyyyyyySdk',
    'kws.yyyyyyyy.Sdk',
    'kws..yyyyyy..Sdk',
    'kws..yyyyyy..Sdk',
    'kws.yyy..yyy.Sdk',
    'kws.yy....yy.Sdk',
    'kwsSSSSSSSSSSSdk',
    'kwddddddddddddek',
    'kwddddddddddddek',
    'kdddddddddddddek',
    'kkkkkkkkkkkkkkkk',
  ];
  S('item_switch', [swblock, recolor(swblock, { y: 'a', s: 'e' }), recolor(swblock, { y: 'S', w: 's', s: 'S', S: 'd' })], { fps: 4 });

  // 能力星 15×15，2 幀閃爍（中心留淡黃平面給迷你圖示）
  const astar = [
    '.......k.......',
    '......kyk......',
    '......kyk......',
    '.....kyayk.....',
    'kkkkkkyaykkkkkk',
    'kyyyyyyaayyyyyk',
    '.kyyyaaaaayyyk.',
    '..kyaaaaaaayk..',
    '...kyaaaaayk...',
    '...kyyaaayyk...',
    '..kyyyyyyyyyk..',
    '..kyyyykyyyyk..',
    '.kyyykk.kkyyyk.',
    '.kykk.....kkyk.',
    '.kk.........kk.',
  ];
  S('item_abilitystar', [astar, recolor(astar, { a: 'w', y: 'a', k: 'Y' })], { fps: 6 });

  // 傳送星 24×24，2 幀（星星 + 尾巴光芒）
  const wstar = [
    '...........kk...........',
    '..........kyyk..........',
    '..........kyyk..........',
    '.........kyyyyk.........',
    '.........kyyyyk.........',
    '........kyyyyyyk........',
    'kkkkkkkkkyyyyyykkkkkkkkk',
    'kyyyyyyyyyaayyyyyyyyyyyk',
    '.kyyyyyyyaaaayyyyyyyyyk.',
    '..kyyyyyyaaaayyyyyyyyk..',
    '...kyyyyyaaayyyyyyyyk...',
    '....kyyyyyayyyyyyyyk....',
    '.....kyyyyyyyyyyyYk.....',
    '.....kyyyyyyyyyyYYk.....',
    '....kyyyyyyyyyyyyYYk....',
    '....kyyyyyykkyyyyYYk....',
    '...kyyyyykk..kkyyYYYk...',
    '...kyyykk......kkYYYk...',
    '..kyykk..........kkYYk..',
    '..kkk..............kkk..',
    '........................',
    '........................',
    '........................',
    '........................',
  ];
  const spark3 = ['.w.', 'www', '.w.'];
  const glowA = ['....a.......a......a....', '..a...aa..a...aa..a.....', '.....y......y......y....'];
  const glowB = ['......a....a......a.....', 'a...aa..a...aa..a...a...', '..y......y......y.......'];
  let w0 = paste(wstar, spark3, 2, 1); w0 = paste(w0, spark3, 19, 12); w0 = paste(w0, glowA, 0, 20);
  let w1 = paste(wstar, spark3, 19, 2); w1 = paste(w1, spark3, 1, 13); w1 = paste(w1, glowB, 0, 20);
  w1 = recolor(w1, { a: 'w' });
  S('item_warpstar', [w0, w1], { fps: 5 });

  // ============================================================
  //  HUD
  // ============================================================
  S('ui_hp_full', [[
    '.kkkkkk.',
    'kyaaaayk',
    'kyaaaayk',
    'kyyyyyyk',
    'kyyyyyyk',
    'kYyyyyYk',
    'kYYYYYYk',
    '.kkkkkk.',
  ]]);
  S('ui_hp_empty', [[
    '.kkkkkk.',
    'kSSSSSSk',
    'kSddddSk',
    'kSddddSk',
    'kSddddSk',
    'kSddddSk',
    'kSSSSSSk',
    '.kkkkkk.',
  ]]);
  // HUD 卡比臉 16×16
  const FACE16 = [
    '.....nnnnnn.....',
    '...nnppppppnn...',
    '..nppplppppppn..',
    '.npppllpppppppn.',
    '.npppwwppwwpppn.',
    'nppppnnppnnppppn',
    'nppppnnppnnppppn',
    'nphhpiippiiphhpn',
    'nphhpppppppphhpn',
    'npppppmppmppppPn',
    'nppppppmmpppPPPn',
    '.nppppppppppPPn.',
    '.nppppppppppPPn.',
    '..npppppppPPPn..',
    '...nnppppPPnn...',
    '.....nnnnnn.....',
  ];
  S('ui_kirby_face', [FACE16]);

  // 魔王血條外框 90×10（內部由程式以紅色填滿：建議填在 (2,2)~(87,7)）
  (function () {
    const rows = [];
    for (let y = 0; y < 10; y++) {
      let s = '';
      for (let x = 0; x < 90; x++) {
        const cx = x === 0 || x === 89, cy = y === 0 || y === 9;
        if (cx && cy) s += '.';
        else if (cx || cy) s += 'k';
        else if (x === 1 || x === 88 || y === 1 || y === 8) s += ((x === 1 || x === 88) && (y === 1 || y === 8)) ? 'k' : 'S';
        else s += 'd';
      }
      rows.push(s);
    }
    S('ui_boss_bar', [rows]);
  })();

  // ---------- 能力圖示 24×16：卡比戴帽 + 右側象徵物 ----------
  const HATS = {
    fire: [
      '.......y........',
      '....y..yy..y....',
      '...yy.yaay.yy...',
      '..kyokyaaykoyk..',
      '..koooyaayoook..',
      '.krroooooooorrk.',
      '.krrrrrrrrrrrrk.',
    ],
    sword: [
      '..........kkk...',
      '.........kgggk..',
      '.......kkgggGk..',
      '.....kkggggGgk..',
      '...kkggggggGgk..',
      '.kkggggggggGGk..',
      '.kyyyyyyyyyyyk..',
    ],
    beam: [
      '......krrk......',
      '.....krRRrk.....',
      '.....kkkkkk.....',
      '....koyoyok.....',
      '...koyoyoyok....',
      '..koyoyoyoyok...',
      '.krrrrrrrrrrrrk.',
    ],
    cutter: [
      '...kk......kk...',
      '..kwwk....kwwk..',
      '..kwwwkkkkwwwk..',
      '..kkwwwwwwwwkk..',
      '.kookkkkkkkkook.',
      '.kooyyyyyyyyook.',
      '.kkkkkkkkkkkkkk.',
    ],
    spark: [
      '..c.....c...c...',
      'c..k...k...k...c',
      '..kyk.kyk.kyk...',
      '..kyk.kyk.kyk...',
      '..kyykkyykkyyk..',
      '..kyyyyyyyyyyk..',
      '..kkkkkkkkkkkk..',
    ],
    stone: [
      '................',
      '.....kkkkkk.....',
      '...kksssssskk...',
      '..kseesssssssk..',
      '..ksssssSsssSk..',
      '.krrrrrrrrrrrrk.',
      '.kRRRRRRRRRRRRk.',
    ],
    ice: [
      '................',
      '...k....k....k..',
      '..kuk..kuk..kuk.',
      '..kckkkcuckkkck.',
      '..kccccccccccck.',
      '..kCcccucccccCk.',
      '..kkkkkkkkkkkkk.',
    ],
    hammer: [
      '................',
      '................',
      '................',
      '.kkkkkkkkkkkkk..',
      'kbbwbbbwbbbwbbk.',
      'kbbbwbbbwbbbwbkk',
      '.kkkkkkkkkkkkkbk',
      '..............bk',
      '.............kbk',
      '..............kk',
    ],
  };
  const MINI = {
    fire: [
      '....k...',
      '...kok..',
      '..korok.',
      '.kroyork',
      '.kroyork',
      'kroyyork',
      '.kryyrk.',
      '..kkkk..',
    ],
    sword: [
      '...kk...',
      '..kwqk..',
      '..kwqk..',
      '..kwqk..',
      '..kwqk..',
      '.kyyyyk.',
      '..ktTk..',
      '..kkkk..',
    ],
    beam: [
      '...k....',
      '..kwk...',
      '.kwowk..',
      'kwoyowk.',
      '.kwowk..',
      '..kwk...',
      '...k....',
      '........',
    ],
    cutter: [
      '....kk..',
      '..kkwwk.',
      '.kwwykk.',
      'kwwyk...',
      'kwwyk...',
      '.kwwykk.',
      '..kkwwk.',
      '....kk..',
    ],
    spark: [
      '....kk..',
      '...kck..',
      '..kcck..',
      '.kcckkk.',
      'kkkkcck.',
      '...kcck.',
      '..kck...',
      '.kk.....',
    ],
    stone: [
      '..kkkk..',
      '.kseesk.',
      'kseesssk',
      'kssssSsk',
      'kssSSSSk',
      'kSsSSSSk',
      '.kSSSSk.',
      '..kkkk..',
    ],
    ice: [
      '...C....',
      '.C.C.C..',
      '..CuC...',
      'CCuuuCC.',
      '..CuC...',
      '.C.C.C..',
      '...C....',
      '........',
    ],
    hammer: [
      'kkkkk...',
      'kesssk..',
      'kssssk..',
      'kkkkktk.',
      '...ktTk.',
      '....ktTk',
      '.....kTk',
      '......kk',
    ],
  };
  for (const key of KB.ABILITY_KEYS) {
    let icon = blank(24, 16);
    icon = paste(icon, KHEAD, 1, 4);
    icon = paste(icon, HATS[key], 0, 0);
    icon = paste(icon, MINI[key], 16, 4);
    S('ui_ability_' + key, [icon]);
    S('ui_ability_' + key + '_mini', [MINI[key]]);
  }
  S('ui_ability_none', [paste(blank(24, 16), KHEAD, 5, 4)]);

  // ---------- 選單游標：黃色星星（2 幀閃爍）9×9 ----------
  const cursor = [
    '....k....',
    '...kyk...',
    '...kak...',
    'kkkyaykkk',
    'kyyyaayyk',
    '.kyyaayk.',
    '..kyyyk..',
    '..kykyk..',
    '.kk...kk.',
  ];
  S('ui_cursor', [cursor, recolor(cursor, { y: 'a', a: 'w' })], { fps: 4 });

  // ---------- 選關地圖 ----------
  const mapK = [
    '................',
    '.....nnnnnn.....',
    '...nnppppppnn...',
    '..nppplppppppn..',
    '.npppwwppwwpppn.',
    '.npppnnppnnpppn.',
    'nphppiippiipphpn',
    'npppppmppmppppPn',
    'nppppppmmppppPPn',
    '.nppppppppppPPn.',
    '.nnppppppppPPnn.',
    'nffnnppppppnnffn',
    'nfffnnppppnnfffn',
    'nFFFFnnnnnnFFFFn',
    '.nnnn......nnnn.',
    '................',
  ];
  const mapK1 = mapK.slice(1).concat(['................']);
  S('ui_map_kirby', [mapK, mapK1], { fps: 4 });
  S('ui_map_node', [[
    '...kkkkkk...',
    '..kssssssk..',
    '.kseesssssk.',
    'ksesssssssSk',
    'kssssssssSSk',
    'kssssssssSSk',
    'kssssssssSSk',
    'kSssssssSSSk',
    'kSSsssSSSSSk',
    '.kSSSSSSSSk.',
    '..kSSSSSSk..',
    '...kkkkkk...',
  ], [
    '.....kk.....',
    '....kyyk....',
    '....kyyk....',
    'kkkkkyykkkkk',
    'kyyyyyaayyyk',
    '.kyyyaayyyk.',
    '..kyyaayyk..',
    '..kyyyyyyk..',
    '.kyyykkyyyk.',
    '.kykk..kkyk.',
    'kk........kk',
    '............',
  ]], { fps: 1 });
  S('ui_map_flag', [[
    'kk..........',
    'ktkkkkkkkk..',
    'ktkrrryrrrk.',
    'ktkrryyyrrrk',
    'ktkryyyyyrrk',
    'ktkrryryrrrk',
    'ktkrrrrrrrk.',
    'ktkkkkkkkk..',
    'ktk.........',
    'ktk.........',
    'ktk.........',
    'ktk.........',
    'ktk.........',
    'kkk.........',
  ]]);

  // ---------- 標題畫面大卡比 32×32（2 幀揮手）----------
  (function () {
    const body = ball(24);
    const eye = ['.n.', 'wnn', 'wnn', 'nnn', 'nnn', 'iii', '.i.'];
    const blush = ['hhh', 'hhh'];
    const mouth = ['m......m', 'mmmmmmmm', '.mrrrrm.', '..mmmm..'];
    const foot = ['..nnnnn..', '.nfffffn.', 'nfffffffn', 'nfffffffn', 'nFFFFFFFn', '.nnnnnnn.'];
    const armL = ['..nnn.', '.npppn', 'npppp.', 'nppp..', '.nn...'];
    // 舉手（斜上）：貼在 (23,0)，下緣深入身體形成接縫
    const armUp = [
      '...nnn.',
      '..nlppn',
      '..npppn',
      '.npppn.',
      '.npppn.',
      'npppn..',
      'npppn..',
      '.nnn...',
    ];
    // 揮手（直上）：貼在 (21,0)
    const armUp2 = [
      '.nnn..',
      'nlppn.',
      'npppn.',
      'npppn.',
      'npppn.',
      '.nppn.',
      '.nppn.',
      '..nn..',
    ];
    function frame(arm, ax, ay, bodyDy) {
      let f = blank(32, 32);
      f = paste(f, foot, 2, 24);
      f = paste(f, foot, 21, 24);
      f = paste(f, body, 4, 2 + bodyDy);
      f = paste(f, eye, 12, 8 + bodyDy);
      f = paste(f, eye, 17, 8 + bodyDy);
      f = paste(f, blush, 7, 15 + bodyDy);
      f = paste(f, blush, 22, 15 + bodyDy);
      f = paste(f, mouth, 12, 16 + bodyDy);
      f = paste(f, armL, 1, 13 + bodyDy);
      f = paste(f, arm, ax, ay + bodyDy);
      return f;
    }
    S('ui_title_kirby', [frame(armUp, 23, 0, 0), frame(armUp2, 21, 0, 1)], { fps: 3 });
  })();

  // ---------- 標題 LOGO 160×48：KIRBY（粉紅圓潤）+ STAR（黃）+ 卡比臉 + 星星 ----------
  (function () {
    let logo = blank(160, 48);
    // KIRBY：3× 圓角字，bevel 上色，深藍描邊 + 右下陰影
    let kMask = roundify(bigText('KIRBY', 3, 3), 1);
    let kCol = bevel(kMask, 'p', 'l', 'P', 2);
    kCol = outline(kCol, 'n');
    const kShadow = recolor(kCol, { p: 'x', l: 'x', P: 'x', n: 'x' });
    // STAR：2× 圓角字，黃色
    let sMask = roundify(bigText('STAR', 2, 2), 1);
    let sCol = bevel(sMask, 'y', 'a', 'Y', 1);
    sCol = outline(sCol, 'n');
    const sShadow = recolor(sCol, { y: 'x', a: 'x', Y: 'x', n: 'x' });
    // 卡比臉 26px
    let face = ball(26);
    const eye = ['.n.', 'wnn', 'wnn', 'nnn', 'nnn', 'iii', '.i.'];
    face = paste(face, eye, 8, 7); face = paste(face, eye, 14, 7);
    face = paste(face, ['hh', 'hh'], 4, 14); face = paste(face, ['hh', 'hh'], 20, 14);
    face = paste(face, ['m....m', '.mmmm.'], 10, 16);
    // 裝飾星
    const star9 = ['....k....', '...kyk...', '...kak...', 'kkkyaykkk', 'kyyyaayyk', '.kyyaayk.', '..kyyyk..', '..kykyk..', '.kk...kk.'];
    const star5 = ['..k..', '.kak.', 'kaaak', '.kak.', '..k..'];
    const star7 = ['...k...', '..kak..', 'kkkyakk', '.kyaak.', '..kyk..', '.kk.kk.', '.......'];
    // 佈局
    logo = paste(logo, kShadow, 33, 5);
    logo = paste(logo, kCol, 31, 3);
    logo = paste(logo, sShadow, 89, 30);
    logo = paste(logo, sCol, 87, 28);
    logo = paste(logo, face, 3, 12);
    logo = paste(logo, star9, 150, 26);
    logo = paste(logo, star7, 40, 32);
    logo = paste(logo, star5, 152, 6);
    logo = paste(logo, star5, 60, 38);
    logo = paste(logo, star5, 22, 4);
    S('ui_title_logo', [logo]);
  })();
})();
