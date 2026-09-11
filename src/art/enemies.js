// 敵人 / 投射物 / 特效像素圖（art-enemies）
// 規則：全部面向右；敵人 anchor = bottom；投射物 anchor = bottom（proj_cutter 為 center，因會旋轉）；特效 anchor = center。
// 調色：以 KB.PAL.enemy 為底，加上本檔擴充色（h 橘高光、n 米色臉、x 純黑瞳孔、d/D 深灰黑、a 淡冰、j/J 褐色、v/V 黃綠、z/Z 淡紫、q/Q 深藍黑、W 半透明白）。
(function () {
  const E = Object.assign({}, KB.PAL.enemy, {
    h: '#ffc890', n: '#ffe8c8', N: '#e8c090', x: '#000000',
    d: '#404048', D: '#202028', a: '#d8f4ff', j: '#8a5a34', J: '#553218',
    v: '#c8f050', V: '#80b820', u: '#eeff9c', z: '#c8b0f8', Z: '#9070d0',
    q: '#2a3460', Q: '#161c38', W: '#ffffffb0', A: '#ffffff60',
  });
  const pal = ext => (ext ? Object.assign({}, E, ext) : E);
  const S = (name, frames, opts, ext) => KB.sprite(name, pal(ext), frames, opts || {});
  const cat = (...parts) => [].concat(...parts);
  const flipH = rows => rows.map(r => r.split('').reverse().join(''));
  const raise = (rows, n, w) => cat(rows, Array(n).fill('.'.repeat(w)));
  const padTo = (rows, w) => rows.map(r => r + '.'.repeat(Math.max(0, w - r.length)));

  // ======================================================================
  // Waddle Dee — 16 寬
  // ======================================================================
  const DEE_BODY = [
    '.....kkkkkk.....',
    '...kkoooooookk..',
    '..kohhoooooook..',
    '..khoooonnnnnk..',
    '.koooooonnnnnnk.',
    '.koooonkknnkknk.',
    '.koooonkknnkknk.',
    '.koooonkknnkknk.',
    '.koooonnnnnnnnkk',
    '.kooooonnnnnnook',
    '..koooooooOOOkk.',
    '..koOOOOOOOOOk..',
    '...kkOOOOOOkk...',
  ];
  const FEET_A = [            // 站立：兩腳平放
    '..krrrkkkkkkrrrk',
    '.krrrrk...krrrrk',
    '.kRRRRk...kRRRRk',
    '..kkkk.....kkkk.',
  ];
  const FEET_B = [            // 右腳向前
    '...krrkkkkkkrrrk',
    '..krrrk...krrrrk',
    '..kRRRk...kRRRRk',
    '...kkk.....kkkk.',
  ];
  const FEET_D = [            // 左腳向後
    '.krrrkkkkkkrrk..',
    'krrrrk...krrrk..',
    'kRRRRk...kRRRk..',
    '.kkkk.....kkk...',
  ];
  const FEET_B2 = ['...krrkkkkkkrrrk', '..krrrk...krrrrk', '...kkk.....kkkk.'];
  const FEET_D2 = ['.krrrkkkkkkrrk..', 'krrrrk...krrrk..', '.kkkk.....kkk...'];
  S('waddledee_walk', [
    cat(DEE_BODY, FEET_A),
    cat(DEE_BODY, FEET_B2),
    cat(DEE_BODY, FEET_A),
    cat(DEE_BODY, FEET_D2),
  ], { fps: 6 });

  // ======================================================================
  // Waddle Doo — 單一大眼
  // ======================================================================
  const dooBody = (eye, lash) => [
    '.....kkkkkk.....',
    '...kkoooooookk..',
    lash ? '..kohhookokokk..' : '..kohhoooooook..',
    '..khooo' + eye[0] + 'ok..',
    '.koooo' + eye[1] + 'ok.',
    '.koooo' + eye[2] + 'ok.',
    '.koooo' + eye[3] + 'ok.',
    '.koooo' + eye[4] + 'ok.',
    '.koooo' + eye[5] + 'okk',
    '.kooooo' + eye[6] + 'oook',
    '..koooooookOOkk.',
    '..koOOOOOOOOOk..',
    '...kkOOOOOOkk...',
  ];
  const EYE_NORMAL = ['kkkkk', 'kwwwwwk', 'kwwbbwk', 'kwbxwbk', 'kwbxxbk', 'kwwbbwk', 'kkkkk'];
  const EYE_LOOKUP = ['kkkkk', 'kwbbwwk', 'kbxwbwk', 'kbxxbwk', 'kwbbwwk', 'kwwwwwk', 'kkkkk'];
  const EYE_GLOW0 = ['kkkkk', 'kyyyyyk', 'kyyFFyk', 'kyFwFyk', 'kyFFFyk', 'kyyFFyk', 'kkkkk'];
  const EYE_GLOW1 = ['kkkkk', 'kFFFFFk', 'kFwwwFk', 'kFwwwFk', 'kFwwwFk', 'kFFFFFk', 'kkkkk'];
  S('waddledoo_walk', [
    cat(dooBody(EYE_NORMAL, true), FEET_A),
    cat(dooBody(EYE_NORMAL, true), FEET_B2),
    cat(dooBody(EYE_LOOKUP, true), FEET_A),
    cat(dooBody(EYE_LOOKUP, true), FEET_D2),
  ], { fps: 6 });
  // 攻擊：眼睛發光，第二幀眼前有黃色光點
  const DOO_ATK1 = cat(dooBody(EYE_GLOW1, true), FEET_A).map((r, i) => (i >= 4 && i <= 8) ? r : r);
  S('waddledoo_attack', [
    cat(dooBody(EYE_GLOW0, true), FEET_A),
    DOO_ATK1.map((r, i) => (i === 5 || i === 7) ? r.slice(0, 14) + 'ky' : (i === 6 ? r.slice(0, 14) + 'kF' : r)),
  ], { fps: 8 });

  // ======================================================================
  // Bronto Burt — 18 寬，粉紫色球 + 白翅膀 + 大眼
  // ======================================================================
  const BB_PAL = { p: '#f090d8', P: '#c060b0', h: '#ffc8f0' };
  S('brontoburt_fly', [
    [
      '.kk.......kkkkkk..',
      'kwwk....kkppppppkk',
      'kwwwk..kphppppppk.',
      '.kwwwkkppppkwwkwwk',
      '..kwwwkppppkwxkwxk',
      '...kkkkppppkwxkwxk',
      '.....kppppppkkpkkk',
      '.....kppPppppppppk',
      '.....kpPPpppppppk.',
      '......kPPPPPPPPk..',
      '.......kkPPPPkk...',
      '........krkkkrk...',
      '........krk.krk...',
      '.........k...k....',
    ], [
      '..........kkkkkk..',
      '........kkppppppkk',
      '.......kphppppppk.',
      '......kppppkwwkwwk',
      '......kppppkwxkwxk',
      '....kkkppppkwxkwxk',
      '.kkwwkppppppkkpkkk',
      'kwwwwkppPppppppppk',
      'kwwwkkpPPpppppppk.',
      '.kwwk.kPPPPPPPPk..',
      '..kk...kkPPPPkk...',
      '........krkkkrk...',
      '........krk.krk...',
      '.........k...k....',
    ],
  ], { fps: 8 }, BB_PAL);

  // ======================================================================
  // Hot Head — 16 寬，頭頂火焰
  // ======================================================================
  const HH_FLAME0 = [
    '.......kk.......',
    '......kfFk......',
    '.....kfFFfk.....',
    '.....kfFFfk.....',
    '....kffFFffk....',
    '....krffffrk....',
  ];
  const HH_FLAME1 = [
    '........kk......',
    '.......kFfk.....',
    '......kfFFk.....',
    '.....kfFFfk.....',
    '.....kfFFffk....',
    '....kffffrrk....',
  ];
  const HH_FLAME_BIG0 = [
    '.......kk..kk...',
    '......kfFkkFk...',
    '.....kfFFfFfk...',
    '....kfFFFFffk...',
    '....kffFFfffk...',
    '....krfffffrk...',
  ];
  const HH_FLAME_BIG1 = [
    '..kk....kk......',
    '.kfFk..kfFk.....',
    '.kfFfkkfFFfk....',
    '..kfFFFFFffk....',
    '...kffFFffffk...',
    '....krffffrrk...',
  ];
  const HH_HEAD = (mouth) => cat([
    '...kkkrrrrkkk...',
    '..koooooooooook.',
    '.koooookwwkwwkok.'.slice(0, 16),
    '.koooookwxkwxkok'.slice(0, 16),
    '.koooookwxkwxkok'.slice(0, 16),
    '.koooookkokkook.',
  ], mouth ? [
    '.koooooookrrrrk.',
    '..koOOOOkRRRRk..',
    '...kkOOOOkkkkk..',
  ] : [
    '.kooooooookkkok.',
    '..koOOOOOOOOOok.',
    '...kkOOOOOOOkk..',
  ]);
  const HH_FEET0 = [
    '..krrkkkkkkkrrk.',
    '.krrrk.....krrrk',
    '..kkk.......kkk.',
  ];
  const HH_FEET1 = [
    '..krrrkkkkkkrrk.',
    '.krrrrk...krrrk.',
    '..kkkk.....kkk..',
  ];
  S('hothead_walk', [
    cat(HH_FLAME0, HH_HEAD(false), HH_FEET0),
    cat(HH_FLAME1, HH_HEAD(false), HH_FEET1),
  ], { fps: 6 });
  S('hothead_attack', [
    cat(HH_FLAME_BIG0, HH_HEAD(true), HH_FEET0),
    cat(HH_FLAME_BIG1, HH_HEAD(true), HH_FEET0),
  ], { fps: 8 });

  // ======================================================================
  // Sir Kibble — 16 寬，黃色小騎士、頭頂刀刃
  // ======================================================================
  const SK_PAL = { y: '#f8d848', Y: '#c89818', h: '#fff0a0', L: '#f4f4f8', s: '#a8b0c0', S: '#303848' };
  const SK_BLADE = [
    '.......kLk......',
    '......kLLsk.....',
    '.....kLLLssk....',
    '....kkLLLsskk...',
  ];
  const SK_NOBLADE = [
    '................',
    '................',
    '................',
    '....kkkkkkkkk...',
  ];
  const SK_HEAD = [
    '...kyyyyyyyyyk..',
    '..kyhyyyyyyyyyk.',
    '.kyhyyyyyyyyyyyk',
    '.kyyyyyykkkkkkkk',
    '.kYyyyyykSwSSwSk',
    '.kYyyyyykSSSSSSk',
    '.kYYyyyyykkkkkkk',
    '..kYYYYYYYYYYYk.',
  ];
  const SK_BODY_WALK0 = [
    '..kkoooooooookk.',
    '.kyykOoooooOkyyk',
    '..kk.kOOOOOk.kk.',
    '.....krrkkkrrk..',
    '....krrrk.krrrk.',
    '.....kkk...kkk..',
  ];
  const SK_BODY_WALK1 = [
    '..kkoooooooookk.',
    '.kyykOoooooOkyyk',
    '..kk.kOOOOOk.kk.',
    '....krrrkkkkrrk.',
    '...krrrrk..krrrk',
    '....kkkk....kkk.',
  ];
  S('sirkibble_walk', [
    cat(SK_BLADE, SK_HEAD, SK_BODY_WALK0),
    cat(SK_BLADE, SK_HEAD, SK_BODY_WALK1),
  ], { fps: 6 }, SK_PAL);
  // 丟刃：幀0 舉手拿刃，幀1 手伸出（刃已飛出）
  const SK_THROW0 = [
    '...........kLk..',
    '..........kLLsk.',
    '.........kLLLssk',
    '....kkkkkkkLLssk',
    '...kyyyyyyykkkk.',
    '..kyhyyyyyyyykk.',
    '.kyhyyyyyyyyykyk',
    '.kyyyyyykkkkkkyk',
    '.kYyyyyykSwSSwSk',
    '.kYyyyyykSSSSSSk',
    '.kYYyyyyykkkkkkk',
    '..kYYYYYYYYYYYk.',
    '..kkoooooooookk.',
    '.kyykOoooooOkk..',
    '..kk.kOOOOOk....',
    '.....krrkkkrrk..',
    '....krrrk.krrrk.',
    '.....kkk...kkk..',
  ];
  const SK_THROW1 = [
    '................',
    '................',
    '................',
    '....kkkkkkkkk...',
    '...kyyyyyyyyyk..',
    '..kyhyyyyyyyyyk.',
    '.kyhyyyyyyyyyyyk',
    '.kyyyyyykkkkkkkk',
    '.kYyyyyykSwSSwSk',
    '.kYyyyyykSSSSSSk',
    '.kYYyyyyykkkkkkk',
    '..kYYYYYYYYYYYkkk',
    '..kkoooooooookyyk',
    '.kyykOoooooOkkkk',
    '..kk.kOOOOOk....',
    '.....krrkkkrrk..',
    '....krrrk.krrrk.',
    '.....kkk...kkk..',
  ];
  S('sirkibble_throw', [padTo(SK_THROW0, 17), padTo(SK_THROW1, 17)], { fps: 6, loop: false }, SK_PAL);

  // ======================================================================
  // Sparky — 黃綠色尖耳小球
  // ======================================================================
  const SP_BODY0 = [
    '..kk.......kk...',
    '.kvvk.....kvvk..',
    '.kvvvkkkkkkvvvk.',
    '.kvvuvvvvvvvvvk.',
    'kvvuvvvvvvvvvvvk',
    'kvvvvvvvkkvvkkvk',
    'kvvvvvvvwkvvwkvk',
    'kvvvvvvvvvvvvvvk',
    '.kvvvvvvvkkkvvk.',
    '.kVvvvvvvvvvvVk.',
    '..kVVVVVVVVVVk..',
    '...kkVVVVVVkk...',
    '.....kkkkkk.....',
  ];
  const SP_BODY1 = [               // 跳起：拉長
    '...kk.....kk....',
    '..kvvk...kvvk...',
    '..kvvvk.kvvvk...',
    '..kvvvkkkvvvk...',
    '..kvuvvvvvvvk...',
    '.kvuvvvvvvvvvk..',
    '.kvvvvvkkvkkvk..',
    '.kvvvvvwkvwkvk..',
    '.kvvvvvvvvvvvk..',
    '.kvvvvvvkkkvvk..',
    '.kVvvvvvvvvvVk..',
    '.kVVvvvvvvvVVk..',
    '..kVVVVVVVVVk...',
    '...kkVVVVVkk....',
    '.....kkkkk......',
  ];
  S('sparky_hop', [SP_BODY0, SP_BODY1], { fps: 5 });
  // 放電：22 寬，周圍藍白電光
  const SP_ATK_BODY = [
    '..kk.......kk...',
    '.kuuk.....kuuk..',
    '.kuvvkkkkkkvvuk.',
    '.kvvuvvvvvvvvvk.',
    'kvvuvvvvvvvvvvvk',
    'kvvvvvvvkkvvkkvk',
    'kvvvvvvvwkvvwkvk',
    'kvvvvvvvvvvvvvvk',
    '.kvvvvvvvkkkvvk.',
    '.kVvvvvvvvvvvVk.',
    '..kVVVVVVVVVVk..',
    '...kkVVVVVVkk...',
    '.....kkkkkk.....',
  ];
  const spAtk = (bolts) => SP_ATK_BODY.map((r, i) => bolts[i][0] + r + bolts[i][1]);
  const BOLTS0 = [
    ['c..', '..c'], ['.c.', '.c.'], ['..w', 'w..'], ['.cw', 'wc.'], ['c..', '..c'],
    ['ww.', '.ww'], ['..c', 'c..'], ['.c.', '.c.'], ['cw.', '.wc'], ['..c', 'c..'],
    ['.c.', '.c.'], ['c..', '..c'], ['...', '...'],
  ];
  const BOLTS1 = [
    ['...', '...'], ['c..', '..c'], ['.cw', 'wc.'], ['..c', 'c..'], ['.w.', '.w.'],
    ['c..', '..c'], ['.cw', 'wc.'], ['w..', '..w'], ['.c.', '.c.'], ['cw.', '.wc'],
    ['..c', 'c..'], ['.c.', '.c.'], ['c..', '..c'],
  ];
  S('sparky_attack', [
    cat(['..c...ww......cw......', '...c.c..........c.....'], spAtk(BOLTS0)),
    cat(['.....c....w.c.........', '..c....cw......c.w....'], spAtk(BOLTS1)),
  ], { fps: 10 });

  // ======================================================================
  // Rocky — 灰色石頭怪
  // ======================================================================
  const RK_PAL = { s: '#a8a8b8', S: '#686878', L: '#d8d8e4', T: '#7a5028', t: '#a87848' };
  const RK_TOP = [
    '....kkkkkkkk....',
    '..kkssLLssssskk.',
    '.kssLLsssssssssk',
    '.ksLssssssssssSk',
  ];
  const RK_FACE = [
    'kssssssskwwkwwkk',
    'kssssssskwxkwxkk',
    'ksssssssskksskssk'.slice(0, 16),
    'kSsssssssssssssk',
  ];
  const RK_NOFACE = [
    'kssssssssssssssk',
    'kssssssssssssssk',
    'ksssssssssssssSk',
    'kSsssssssssssssk',
  ];
  const RK_BOTTOM = [
    'kSSssssssssssSSk',
    '.kSSSssssssSSSk.',
    '..kkSSSSSSSSkk..',
  ];
  const RK_FEET0 = [
    '..kttkkkkkkkttk.',
    '.ktttk.....ktttk',
    '..kkk.......kkk.',
  ];
  const RK_FEET1 = [
    '...kttkkkkkkttk.',
    '..kttk....kttttk',
    '...kkk.....kkkk.',
  ];
  S('rocky_walk', [
    cat(RK_TOP, RK_FACE, RK_BOTTOM, RK_FEET0),
    cat(RK_TOP, RK_FACE, RK_BOTTOM, RK_FEET1),
  ], { fps: 4 }, RK_PAL);
  S('rocky_drop', [cat(RK_TOP, RK_NOFACE, RK_BOTTOM, ['....kkkkkkkk....'])], {}, RK_PAL);

  // ======================================================================
  // Chilly — 藍白小雪人
  // ======================================================================
  const CH_PAL = { b: '#4880f0', B: '#2848b0', i: '#c0e8ff', a: '#e8f6ff' };
  const CH_HAT = [
    '.......kk.......',
    '......kbbk......',
    '.....kkbbkk.....',
    '....kbbbbbbk....',
    '...kbbhbbbbbbk..',
    '..kbbbbbbbbbbbk.',
    '.kBBBBBBBBBBBBBk',
  ];
  const CH_FACE = (eye) => [
    '.kiwwwwwwwwwwwik',
    '.kiwww' + eye + 'wwik',
    '.kiwww' + eye + 'wwik',
    '.kiiwwwwwwwwwiik',
    '..kiwwwwkkkwwik.',
  ];
  const CH_BODY0 = [
    '.kkiiwwwwwwwiikk',
    'kBkiwwwwwwwwwikBk'.slice(0, 16),
    'kBkiiwwwwwwwiikBk'.slice(0, 16),
    '.kkiiiwwwwwiiikk',
    '..kkiiiiiiiiikk.',
    '....kkkkkkkkk...',
  ];
  const CH_BODY1 = [
    '.kkiiwwwwwwwiikk',
    'kBkiwwwwwwwwwikk',
    'kBkiiwwwwwwwiiBk',
    '.kkiiiwwwwwiiikk',
    '..kkiiiiiiiiikk.',
    '....kkkkkkkkk...',
  ];
  S('chilly_walk', [
    cat(CH_HAT, CH_FACE('kkwwkk'), CH_BODY0),
    cat(CH_HAT, CH_FACE('kkwwkk'), CH_BODY1).slice(0, 17),
  ], { fps: 4 }, CH_PAL);
  // 攻擊：24 寬，周圍冰霧與雪花
  const chAtk = (body, mist) => body.map((r, i) => mist[i][0] + r + mist[i][1]);
  const CH_MIST0 = [
    ['....', '....'], ['....', '....'], ['.a..', '..a.'], ['....', '....'], ['a...', '...a'],
    ['.i..', '..i.'], ['....', '....'], ['a.a.', '.a.a'], ['.i..', '..i.'], ['a.a.', '.a.a'],
    ['..a.', '.a..'], ['i...', '...i'], ['.a..', '..a.'], ['a.i.', '.i.a'], ['.a..', '..a.'],
    ['i.a.', '.a.i'], ['.a..', '..a.'], ['..i.', '.i..'],
  ];
  const CH_MIST1 = [
    ['....', '....'], ['..a.', '.a..'], ['....', '....'], ['a...', '...a'], ['....', '....'],
    ['..i.', '.i..'], ['a...', '...a'], ['....', '....'], ['.a.a', 'a.a.'], ['..i.', '.i..'],
    ['a...', '...a'], ['.a..', '..a.'], ['i...', '...i'], ['.a..', '..a.'], ['a.i.', '.i.a'],
    ['..a.', '.a..'], ['i.a.', '.a.i'], ['.a..', '..a.'],
  ];
  S('chilly_attack', [
    chAtk(cat(CH_HAT, CH_FACE('kwwkkw'), CH_BODY0), CH_MIST0),
    chAtk(cat(CH_HAT, CH_FACE('kwwkkw'), CH_BODY1), CH_MIST1),
  ], { fps: 8 }, CH_PAL);

  // ======================================================================
  // Blade Knight — 18 寬，綠斗篷、灰盔、持劍
  // ======================================================================
  const BK_PAL = { g: '#48b848', G: '#207828', s: '#a0a8b8', S: '#606878', L: '#f0f0f8', D: '#1c1c28', y: '#f8e040' };
  const BK_WALK0 = [
    '....kkkkkk.....k..',
    '...kssssssk...kLk.',
    '..kssLLsssssk.kLk.',
    '..ksssssssssk.kLk.',
    '.kSSSSSSSSSSSSkkLk',
    '.kDDDyyDDDyyDDkkLk',
    '.kDDDDDDDDDDDDkkLk',
    '..kggggggggggkkLk.',
    '.kgggggggggggkkLk.',
    '.kgggggggggggkYYk.',
    '.kgGggggggggggkYk.',
    '.kGGggggggggggGGk.',
    '..kGGGggggggGGGk..',
    '...kkGGGGGGGGkk...',
    '....kSSkkkkSSk....',
    '...kSSSk..kSSSk...',
    '....kkk....kkk....',
  ];
  const BK_WALK1 = cat(BK_WALK0.slice(0, 14), [
    '.....kSSkkkkSSk...',
    '....kSSSk..kSSSSk.',
    '.....kkk....kkkk..',
  ]);
  S('bladeknight_walk', [BK_WALK0, BK_WALK1], { fps: 6 }, BK_PAL);
  // 攻擊：24 寬。幀0 舉劍過頭，幀1 水平揮出
  const BK_ATK0 = [
    '....kkkkkk.........kk...',
    '...kssssssk.......kLLk..',
    '..kssLLsssssk....kLLk...',
    '..ksssssssssk...kLLk....',
    '.kSSSSSSSSSSSSk.kLk.....',
    '.kDDDyyDDDyyDDkkLk......',
    '.kDDDDDDDDDDDDkkk.......',
    '..kggggggggggkYYk.......',
    '.kgggggggggggggYk.......',
    '.kgggggggggggggk........',
    '.kgGgggggggggggk........',
    '.kGGggggggggggGk........',
    '..kGGGggggggGGk.........',
    '...kkGGGGGGGkk..........',
    '....kSSkkkkSSk..........',
    '...kSSSk..kSSSk.........',
    '....kkk....kkk..........',
  ];
  const BK_ATK1 = [
    '....kkkkkk..............',
    '...kssssssk.............',
    '..kssLLsssssk...........',
    '..ksssssssssk...........',
    '.kSSSSSSSSSSSSk.........',
    '.kDDDyyDDDyyDDk.........',
    '.kDDDDDDDDDDDDk.........',
    '..kggggggggggkkkkkkkkkk.',
    '.kggggggggggkYYkLLLLLLLk',
    '.kggggggggggkYYkLLLsssLk',
    '.kgGggggggggkkkkkkkkkkk.',
    '.kGGggggggggggGk........',
    '..kGGGggggggGGk.........',
    '...kkGGGGGGGkk..........',
    '....kSSkkkkSSk..........',
    '...kSSSk..kSSSk.........',
    '....kkk....kkk..........',
  ];
  S('bladeknight_attack', [BK_ATK0, BK_ATK1], { fps: 8, loop: false }, BK_PAL);

  // ======================================================================
  // Bonkers — 32 寬 小魔王，褐色大猩猩 + 大木鎚
  // ======================================================================
  const BO_PAL = { j: '#8a5a34', J: '#553218', n: '#f0d0a0', N: '#d0a878', t: '#c08850', T: '#7a5028', g: '#40b060', G: '#207838', L: '#e0e0e0' };
  const BO_WALK0 = [
    '.......kkkkkkkk.................',
    '.....kkggggggggkk......kkkkkk...',
    '....kgggggggggggggk...kttttttk..',
    '...kGGGGGGGGGGGGGGGk.kttttttttk.',
    '..kjjjjjjjjjjjjjjjjk.kttttttttk.',
    '.kjjjjjjjjjjjjjjjjjjkkttttttttk.',
    '.kjjjjjnnnnnnnnnnnjjkkTTTTTTTTk.',
    'kjjjjjnnnnnnnnnnnnnjjk.kTTTTk...',
    'kjjjjnnnnkwwkknwwknnjk.kkTTk....',
    'kjjjjnnnnkwxkknwxknnjk..kTk.....',
    'kjjjjnnnnnkknnnkknnnjk..kTk.....',
    'kjjjjjnnnnnnnnnnnnnjjk..kTk.....',
    '.kjjjjnNNnnnnnnnNNnjk...kTk.....',
    '.kjjjjjnnkkkkkkknnjjk...kTk.....',
    '..kjjjjjnnnnnnnnnjjk.kkkkTk.....',
    '...kkjjjjjjjjjjjjjkkkjjjkTk.....',
    '..kjjjjjjjjjjjjjjjjjjjjjjkk.....',
    '.kjjjjjjjjnnnnnnnjjjjjjjjjk.....',
    '.kjjjjjjjnnnnnnnnnjjjjjjjk......',
    '.kjjjjjjjnnnnnnnnnjjjjjjk.......',
    'kjjjjjjjjnnnnnnnnnjjjjjk........',
    'kjjjjjjjjjnnnnnnnjjjjjjk........',
    'kjjjjjjjjjjnnnnnjjjjjjjk........',
    '.kjjjJjjjjjjjjjjjjjJjjk.........',
    '.kjJJJjjjjjjjjjjjjJJJjk.........',
    '..kkJJJJjjjjjjjjJJJJkk..........',
    '..kJJJJkkkkkkkkkkJJJJk..........',
    '.kJJJJJk........kJJJJJk.........',
    '.kJJJJJk........kJJJJJk.........',
    '..kkkkk..........kkkkk..........',
  ];
  const BO_WALK1 = cat(BO_WALK0.slice(0, 25), [
    '..kkJJJJjjjjjjjjJJJJkk..........',
    '.kJJJJJkkkkkkkkkkJJJJJk.........',
    'kJJJJJJk........kJJJJJJk........',
    'kJJJJJJk........kJJJJJJk........',
    '.kkkkkk..........kkkkkk.........',
  ]);
  // 攻擊：鎚子往前砸到地上（右側）
  const BO_ATK0 = [
    '.......kkkkkkkk.................',
    '.....kkggggggggkk...............',
    '....kgggggggggggggk.............',
    '...kGGGGGGGGGGGGGGGk............',
    '..kjjjjjjjjjjjjjjjjk............',
    '.kjjjjjjjjjjjjjjjjjjk...........',
    '.kjjjjjnnnnnnnnnnnjjk.....kkkk..',
    'kjjjjjnnnnnnnnnnnnnjjk..kkttttk.',
    'kjjjjnnnnkkkkknkkknnjk.kttttttk.',
    'kjjjjnnnnkwwkknwwknnjk.kttttttk.',
    'kjjjjnnnnkkkknnkkknnjkktTTTTTTk.',
    'kjjjjjnnnnnnnnnnnnnjjkkTTTTTTTk.',
    '.kjjjjnNNnnnnnnnNNnjjkkkTTTTTk..',
    '.kjjjjjnnkkkkkkknnjjjjjkkkkkk...',
    '..kjjjjjnnnnnnnnnjjjjjjjk.......',
    '...kkjjjjjjjjjjjjjkkjjjjk.......',
    '..kjjjjjjjjjjjjjjjjkkjjk........',
    '.kjjjjjjjjnnnnnnnjjjjkkk........',
    '.kjjjjjjjnnnnnnnnnjjjjjjk.......',
    '.kjjjjjjjnnnnnnnnnjjjjjjk.......',
    'kjjjjjjjjnnnnnnnnnjjjjjjk.......',
    'kjjjjjjjjjnnnnnnnjjjjjjk........',
    'kjjjjjjjjjjnnnnnjjjjjjjk........',
    '.kjjjJjjjjjjjjjjjjjJjjk.........',
    '.kjJJJjjjjjjjjjjjjJJJjk.........',
    '..kkJJJJjjjjjjjjJJJJkk..........',
    '..kJJJJkkkkkkkkkkJJJJk..........',
    '.kJJJJJk........kJJJJJk.........',
    '.kJJJJJk........kJJJJJk.........',
    '..kkkkk..........kkkkk..........',
  ];
  const BO_ATK1 = [
    '.......kkkkkkkk.................',
    '.....kkggggggggkk...............',
    '....kgggggggggggggk.............',
    '...kGGGGGGGGGGGGGGGk............',
    '..kjjjjjjjjjjjjjjjjk............',
    '.kjjjjjjjjjjjjjjjjjjk...........',
    '.kjjjjjnnnnnnnnnnnjjk...........',
    'kjjjjjnnnnnnnnnnnnnjjk..........',
    'kjjjjnnnnkkkkknkkknnjk..........',
    'kjjjjnnnnkwwkknwwknnjk..........',
    'kjjjjnnnnkkkknnkkknnjk..........',
    'kjjjjjnnnnnnnnnnnnnjjk..........',
    '.kjjjjnNNnnnnnnnNNnjjk..........',
    '.kjjjjjnnkkkkkkknnjjjjk.........',
    '..kjjjjjnnnnnnnnnjjjjjjk........',
    '...kkjjjjjjjjjjjjjkkjjjjk.......',
    '..kjjjjjjjjjjjjjjjjkkjjjjk......',
    '.kjjjjjjjjnnnnnnnjjjjkkjjjk.....',
    '.kjjjjjjjnnnnnnnnnjjjjkkjjjk....',
    '.kjjjjjjjnnnnnnnnnjjjjjkkjjk....',
    'kjjjjjjjjnnnnnnnnnjjjjjjkkkk....',
    'kjjjjjjjjjnnnnnnnjjjjjjkkTTkk...',
    'kjjjjjjjjjjnnnnnjjjjjjjkkTTkk...',
    '.kjjjJjjjjjjjjjjjjjJjjk.kTTkkkk.',
    '.kjJJJjjjjjjjjjjjjJJJjkkTttttttk',
    '..kkJJJJjjjjjjjjJJJJkkkttttttttk',
    '..kJJJJkkkkkkkkkkJJJJkkTTttttttk',
    '.kJJJJJk........kJJJJJkTTTTTTTTk',
    '.kJJJJJk........kJJJJJkkTTTTTTk.',
    '..kkkkk..........kkkkk..kkkkkk..',
  ];
  S('bonkers_walk', [BO_WALK0, BO_WALK1], { fps: 5 }, BO_PAL);
  S('bonkers_attack', [BO_ATK0, BO_ATK1], { fps: 6, loop: false }, BO_PAL);

  // ======================================================================
  // Poppy Bros Jr. — 16 寬，藍帽小丑，手持炸彈
  // ======================================================================
  const PB_PAL = { b: '#4878f0', B: '#2848b0', n: '#ffe0c0', N: '#e8b890', d: '#383840', D: '#181820', L: '#d8d8e0' };
  const PB_HOP0 = [
    '.....kk.........',
    '....kwwk........',
    '...kkbbkk.......',
    '..kbbbbbbk......',
    '.kbbbbbbbbk.....',
    '.kBBBBBBBBk.....',
    '.knnnnnnnnk.kkk.',
    '.knkknnkknk.kTk.',
    '.knkknnkknkkdddk',
    '.knnnnnnnnkdLdddk'.slice(0, 16),
    '..knnnkknnkdddddk'.slice(0, 16),
    '..kbbbbbbbkkdddk',
    '.kbbbbbbbbbkkkk.',
    '.kbbbbbbbbbk....',
    '..kBBBBBBBk.....',
    '..krrkkkrrk.....',
    '.krrrk.krrrk....',
    '..kkk...kkk.....',
  ];
  const PB_HOP1 = [
    '.....kk.........',
    '....kwwk........',
    '...kkbbkk.......',
    '..kbbbbbbk......',
    '.kbbbbbbbbk.....',
    '.kBBBBBBBBk.....',
    '.knnnnnnnnk.....',
    '.knkknnkknk.kkk.',
    '.knkknnkknk.kTk.',
    '.knnnnnnnnkkdddk',
    '..knnnkknnkdLddk',
    '..kbbbbbbbkddddk',
    '.kbbbbbbbbbkkkk.',
    '.kbbbbbbbbbk....',
    '..kBBBBBBBk.....',
    '..krrrkkrrrk....',
    '..krrk..krrk....',
    '...kk....kk.....',
  ];
  S('poppybros_hop', [PB_HOP0, PB_HOP1], { fps: 6 }, PB_PAL);

  // ======================================================================
  // Scarfy — 橘色圓臉貓；angry 變獨眼獠牙暗紅
  // ======================================================================
  const SC_PAL = { o: '#f8a040', O: '#c86818', h: '#ffd090', n: '#ffe8c8' };
  const SC_FLY0 = [
    '.kk.........kk..',
    '.kokk.....kkok..',
    '.kooookkkkooook.',
    '.koohoooooooook.',
    'kooooookwwkwwkok',
    'kooooookwxkwxkok',
    'koooooookkokkook',
    'kooonnnnnnnnnook',
    '.konnnknnnknnok.',
    '.konnnnkkknnnok.',
    '..kooOnnnnnoOk..',
    '...kkOOOOOOkk...',
    '.....kkkkkk.....',
  ];
  const SC_FLY1 = [
    '.kk.........kk..',
    '.kokk.....kkok..',
    '.kooookkkkooook.',
    '.koohoooooooook.',
    'kooooookwwkwwkok',
    'kooooookwxkwxkok',
    'koooooookkokkook',
    'kooonnnnnnnnnook',
    '.konnnknnnknnok.',
    '.konnnnkkknnnok.',
    '..kooOnnnnnoOk..',
    '...kkOOOOOOkk...',
    '.....kkkkkk.....',
    '................',
  ];
  S('scarfy_fly', [SC_FLY0, SC_FLY1], { fps: 4 }, SC_PAL);
  const SA_PAL = { o: '#c02828', O: '#801818', h: '#e85050', n: '#d84040' };
  const SC_ANGRY0 = [
    '.kk.........kk..',
    '.kokk.....kkok..',
    '.kooookkkkooook.',
    '.koohookkkkkook.',
    'koooookwwwwwkook',
    'kooooookwbbwkook'.slice(0, 16),
    'koooookwbxxbwkok'.slice(0, 16),
    'koooookwbxxbwkok'.slice(0, 16),
    '.kooooookwwkook.',
    '.kooookkkkkkook.',
    '..kooOkwkwkOk...',
    '...kkOOwOwOkk...',
    '.....kkkkkk.....',
  ];
  const SC_ANGRY1 = SC_ANGRY0.map((r, i) => (i === 6 || i === 7) ? r.replace('xx', 'xw') : r);
  S('scarfy_angry', [SC_ANGRY0, cat(SC_ANGRY1, ['................'])], { fps: 6 }, SA_PAL);

  // ======================================================================
  // Gordo — 18 寬，深藍黑刺球（無敵）
  // ======================================================================
  const GD_PAL = { L: '#e8e8f0', s: '#9898a8' };
  S('gordo', [[
    '........kk........',
    '..kk...kLLk...kk..',
    '..kLk..kLsk..kLk..',
    '...kLk.kLsk.kLk...',
    '....kkkqqqqkkk....',
    '.....kqqqqqqqk....',
    'kkkkkqqqqqqqqqkkkk',
    'kLLLkqqqkwwkwwkLLk',
    '.kkkkqqqkwxkwxkkk.',
    '.kkkkqqqqkkkkkkkk.',
    'kLLLkqqqqqqqqqkLLk',
    'kkkkkQqqqqqqqQkkkk',
    '.....kQQqqqqQk....',
    '....kkkQQQQkkk....',
    '...kLk.kQQk.kLk...',
    '..kLk..kQsk..kLk..',
    '..kk...kLLk...kk..',
    '........kk........',
  ]], { anchor: 'bottom' }, GD_PAL);

  // ======================================================================
  // Cappy — 紅白點蘑菇帽；bare 為被吸走帽子後
  // ======================================================================
  const CP_PAL = { r: '#e83838', R: '#a81818', w: '#ffffff', L: '#e8e8f0', n: '#f8f0e8', N: '#d8c8b8', p: '#f8a0a8' };
  const CP_CAP = [
    '.....kkkkkk.....',
    '...kkrrwwrrrkk..',
    '..krrrrwwrrrrrk.',
    '.krwwrrrrrrrwwrk',
    '.krwwrrrrrrrwwrk',
    'krrrrrrrwwrrrrrk',
    'krRrrrrrwwrrrrRk',
    '.kRRRRRRRRRRRRk.',
    '..kkkkkkkkkkkk..',
  ];
  const CP_STEM0 = [
    '...knnnnnnnnnk..',
    '...knkknnnkknk..',
    '...knkknnnkknk..',
    '...knnnnnnnnnk..',
    '...kNnnnnnnnNk..',
    '....kkNNNNNkk...',
    '...krrkkkkkrrk..',
    '..krrrk...krrrk.',
    '...kkk.....kkk..',
  ];
  const CP_STEM1 = [
    '...knnnnnnnnnk..',
    '...knkknnnkknk..',
    '...knkknnnkknk..',
    '...knnnnnnnnnk..',
    '...kNnnnnnnnNk..',
    '....kkNNNNNkk...',
    '....krrkkkrrrk..',
    '...krrrk.krrrrk.',
    '....kkk...kkkk..',
  ];
  S('cappy_walk', [cat(CP_CAP, CP_STEM0), cat(CP_CAP, CP_STEM1)], { fps: 4 }, CP_PAL);
  const CP_BARE0 = [
    '.....kkkkk......',
    '...kknnnnnkk....',
    '..knnnnnnnnnk...',
    '..knkknnnkknk...',
    '..knkknnnkknk...',
    '..knnnnnnnnnk...',
    '..kNpnnnnnpNk...',
    '...kkNNNNNkk....',
    '...krrkkkrrk....',
    '..krrrk.krrrk...',
    '...kkk...kkk....',
  ];
  const CP_BARE1 = [
    '.....kkkkk......',
    '...kknnnnnkk....',
    '..knnnnnnnnnk...',
    '..knkknnnkknk...',
    '..knkknnnkknk...',
    '..knnnnnnnnnk...',
    '..kNpnnnnnpNk...',
    '...kkNNNNNkk....',
    '....krrkkrrrk...',
    '...krrrkkrrrrk..',
    '....kkk..kkkk...',
  ];
  S('cappy_bare', [CP_BARE0, CP_BARE1], { fps: 5 }, CP_PAL);

  // ======================================================================
  // Twizzy — 黃色小鳥
  // ======================================================================
  const TW_PAL = { y: '#f8e048', Y: '#d0a818', h: '#fff8a0', o: '#f89040' };
  S('twizzy_fly', [
    [
      '.....kkkkk......',
      '...kkyyyyykk....',
      '..kyhyyyyyyyk...',
      '.kyhyyykwwkyyk..',
      '.kyyyyykwxkyykk.',
      'kkyyyyykkkkyyokk',
      'kykkyyyyyyyykooo',
      'kyyykyyyyyyykkk.',
      '.kYYkkYyyyyyYk..',
      '..kkkkYYYyyyYk..',
      '......kkYYYYk...',
      '.......kokokk...',
      '........kk......',
    ], [
      '.....kkkkk......',
      '...kkyyyyykk....',
      '..kyhyyyyyyyk...',
      '.kyhyyykwwkyyk..',
      '.kyyyyykwxkyykk.',
      '.kyyyyykkkkyyokk',
      '.kyyyyyyyyyykooo',
      '.kYyyyyyyyyykkk.',
      '.kYYYyyyyyyyYk..',
      '..kYYkYYYyyyYk..',
      '..kkkkkkYYYYk...',
      'kkk....kokokk...',
      'kyyk....kk......',
      '.kkk............',
    ],
  ], { fps: 8 }, TW_PAL);

  // ======================================================================
  // Shotzo — 18 寬黑色大砲（無敵）
  // ======================================================================
  const SZ_PAL = { d: '#3c3c48', D: '#1c1c24', s: '#7a7a88', S: '#505060', L: '#b0b0c0' };
  S('shotzo', [[
    '......kkkkkk......',
    '....kkddLddddkk...',
    '...kddLddddddddk..',
    '..kddLdddddddddkkk',
    '..kddddddddddkkDDk',
    '.kddddddddddkDDDDk',
    '.kdddddddddkDDDDDk',
    '.kdddddddddkDDDDDk',
    '.kDdddddddddkDDDDk',
    '..kDDdddddddDkkDDk',
    '..kDDDDDDDDDDDkkkk',
    '...kkDDDDDDDDkk...',
    '..kkkkkkkkkkkkkk..',
    '.kssLLsssssssssSk.',
    '.kSSSSSSSSSSSSSSk.',
    '..kkkkkkkkkkkkkk..',
  ]], { anchor: 'bottom' }, SZ_PAL);

  // ======================================================================
  // Squishy — 白/淡紫魷魚
  // ======================================================================
  const SQ_PAL = { w: '#f8f4ff', L: '#e0d4f8', z: '#c8b0f8', Z: '#9070d0' };
  const SQ_HEAD = [
    '......kkkk......',
    '....kkwwwwkk....',
    '...kwwwwwwwwk...',
    '..kwwwwwwwwwwk..',
    '..kwwwwwwwwwwk..',
    '.kwwwwkkwwkkwwk.',
    '.kwwwwwkwwwkwwk.',
    '.kwwwwkkwwkkwwk.',
    '.kwwwwwwkkwwwwk.',
    '.kLwwwwwwwwwwLk.',
    '..kLLwwwwwwLLk..',
    '..kzLLLLLLLLzk..',
  ];
  const SQ_TENT0 = [
    '.kzzkzzkzzkzzkzk',
    '.kzkkzkkzkkzkkzk',
    '.kzk.kzk.kzk.kzk',
    '.kZk.kZk.kZk.kZk',
    '..k...k...k...k.',
  ];
  const SQ_TENT1 = [
    '.kzkzzkzzkzzkzzk',
    '.kzkkzkkzkkzkkzk',
    'kzk.kzk.kzk.kzk.',
    'kZk.kZk.kZk.kZk.',
    '.k...k...k...k..',
  ];
  S('squishy_swim', [cat(SQ_HEAD, SQ_TENT0), cat(SQ_HEAD, SQ_TENT1)], { fps: 4 }, SQ_PAL);

  // ======================================================================
  // Glunk — 綠色海葵
  // ======================================================================
  const GL_PAL = { g: '#48c048', G: '#207828', v: '#a0e878', u: '#e0ffb0' };
  const GL_TOP0 = [
    '..kk..kk..kk.kk.',
    '.kvvkkvvkkvvkvvk',
    '.kvvkkvvkkvvkvvk',
    '.kvvvkvvkkvvvvvk',
    '..kvvvvvvvvvvvk.',
  ];
  const GL_TOP1 = [
    '.kk..kk.kk..kk..',
    'kvvkkvvkvvkkvvk.',
    'kvvkkvvkvvkkvvk.',
    '.kvvvvvkvvkvvvk.',
    '..kvvvvvvvvvvvk.',
  ];
  const GL_BODY = [
    '..kgggggggggggk.',
    '.kggggkwwkwwkggk',
    '.kggggkwxkwxkggk',
    '.kgggggkkkkkgggk',
    '.kggggggggggggGk',
    '.kGggggkkkgggGGk',
    '.kGGggggggggGGGk',
    '..kGGGGGGGGGGGk.',
    '...kkkkkkkkkkk..',
  ];
  S('glunk', [cat(GL_TOP0, GL_BODY), cat(GL_TOP1, GL_BODY)], { fps: 3 }, GL_PAL);

  // ======================================================================
  // Kabu — 石頭圖騰頭
  // ======================================================================
  const KA_PAL = { s: '#b0a898', S: '#706858', L: '#d8d0c0', d: '#484038', y: '#f8e040' };
  const kabu = (eye) => [
    '....kkkkkkkk....',
    '..kkssssssssskk.',
    '.kssLsssssssssSk',
    '.kssssssssssssSk',
    'kSSSSSSSSSSSSSSSk'.slice(0, 16),
    'kssssssssssssssk',
    'kssk' + eye + 'ssk' + eye + 'ssk',
    'kssk' + eye + 'ssk' + eye + 'ssk',
    'kssssssssssssssk',
    'ksssSSSSSSSSsssk',
    'kSssssssssssssSk',
    'kSsskSSSSSSkssSk',
    'kSssskkkkkkssSSk',
    'kSSssssssssssSSk',
    'kSSSSSSSSSSSSSSk',
    'kssssssssssssssk',
    'kSSkSSSSSSSSkSSk',
    'kSSkSSSSSSSSkSSk',
    '.kkkkkkkkkkkkkk.',
  ];
  S('kabu', [kabu('kkk'), kabu('kyk')], { fps: 2 }, KA_PAL);

  // ======================================================================
  // Mr. Frosty — 32 寬藍色海象小魔王
  // ======================================================================
  const MF_PAL = { b: '#5090f0', B: '#2850b0', i: '#c8e8ff', a: '#ecf6ff', L: '#f0f0f8', s: '#c0c0d0', n: '#ffe0c0' };
  const MF_WALK0 = [
    '..........kkkkkkkkkk............',
    '.......kkkbbbbbbbbbbkkk.........',
    '.....kkbbbbbbbbbbbbbbbbkk.......',
    '....kbbbbbbbbbbbbbbbbbbbbk......',
    '...kbbbbbbbbbkwwkkwwkbbbbk......',
    '..kbbbbbbbbbbkwxkkwxkbbbbbk.....',
    '..kbbbbbbbbbbbkkkkkkbbbbbbk.....',
    '.kbbbbbbbbbbbbkkkkkkkbbbbbbk....',
    '.kbbbbbbbbbbbkiiiiiiikbbbbbk....',
    '.kbbbbbbbbbbkiiiiiiiiikbbbbbk...',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbk...',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbk...',
    'kbbbbbbbbbbbkiiikkkiiikbbbbbbk..',
    'kbbbbbbbbbbbbkiiiiiiikbbbbbbbk..',
    'kbbbbbbbbbbbbbkkkkkkkbbbbbbbbk..',
    'kbbbbbbbbbbbbbbiiiiibbbbbbbbbk..',
    '.kbbbbbbbbbbbbiiiiiiibbbbbbbbk..',
    '.kbbbbbbbbbbbiiiiiiiiibbbbbbbk..',
    '.kBbbbbbbbbbbiiiiiiiiibbbbbbbk..',
    '.kBBbbbbbbbbbiiiiiiiiibbbbbbk...',
    '..kBBbbbbbbbbbiiiiiiibbbbbbbk...',
    '..kBBBbbbbbbbbbiiiiibbbbbbbBk...',
    '...kBBBBbbbbbbbbbbbbbbbbbBBk....',
    '....kBBBBBBbbbbbbbbbbbBBBBk.....',
    '.....kkBBBBBBBBBBBBBBBBBkk......',
    '...kkkkkkBBBBBBBBBBBBkkkkkk.....',
    '..kBBBBBBkkkkkkkkkkkkBBBBBBk....',
    '.kBBBBBBBk..........kBBBBBBBk...',
    '..kkkkkkk............kkkkkkk....',
  ];
  const MF_WALK1 = cat(MF_WALK0.slice(0, 25), [
    '....kkkkkkBBBBBBBBBBBBkkkkkk....',
    '...kBBBBBBkkkkkkkkkkkkBBBBBBk...',
    '..kBBBBBBBk..........kBBBBBBBk..',
    '...kkkkkkk............kkkkkkk...',
  ]);
  const MF_ICE = [
    '.......kkkkkkkkkkkk.............',
    '......kaaiiiiiiiiiik............',
    '......kaiiiiiiiiiiik............',
    '......kiiiiiiiiiiiIk............',
    '......kiiiiiiiiiiiIk............',
    '......kIiiiiiiiiiIIk............',
    '......kIIIIIIIIIIIIk............',
    '.......kkkkkkkkkkkk.............',
  ];
  const MF_THROW0 = cat(MF_ICE, [
    '.....kkkkkkkkkkkkkkk............',
    '....kbbbbbbbbbbbbbbbbkkk........',
    '...kbbbbbbbbbbbbbbbbbbbbk.......',
    '..kbbbbbbbbbbkwwkkwwkbbbbk......',
    '..kbbbbbbbbbbkwxkkwxkbbbbbk.....',
    '..kbbbbbbbbbbbkkkkkkbbbbbbk.....',
    '.kbbbbbbbbbbbbkkkkkkkbbbbbbk....',
    '.kbbbbbbbbbbbkiiiiiiikbbbbbk....',
    '.kbbbbbbbbbbkiiiiiiiiikbbbbbk...',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbk...',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbk...',
    'kbbbbbbbbbbbkiiikkkiiikbbbbbbk..',
    'kbbbbbbbbbbbbkiiiiiiikbbbbbbbk..',
    'kbbbbbbbbbbbbbkkkkkkkbbbbbbbbk..',
    '.kbbbbbbbbbbbbbiiiiibbbbbbbbbk..',
    '.kBbbbbbbbbbbbiiiiiiibbbbbbbbk..',
    '.kBBbbbbbbbbbiiiiiiiiibbbbbbk...',
    '..kBBbbbbbbbbbiiiiiiibbbbbbbk...',
    '..kBBBbbbbbbbbbiiiiibbbbbbbBk...',
    '...kBBBBbbbbbbbbbbbbbbbbbBBk....',
    '.....kkBBBBBBBBBBBBBBBBBkk......',
    '...kkkkkkBBBBBBBBBBBBkkkkkk.....',
    '..kBBBBBBkkkkkkkkkkkkBBBBBBk....',
    '.kBBBBBBBk..........kBBBBBBBk...',
    '..kkkkkkk............kkkkkkk....',
  ]);
  const MF_THROW1 = [
    '..........kkkkkkkkkk............',
    '.......kkkbbbbbbbbbbkkk.........',
    '.....kkbbbbbbbbbbbbbbbbkk.......',
    '....kbbbbbbbbbbbbbbbbbbbbk......',
    '...kbbbbbbbbbkwwkkwwkbbbbk......',
    '..kbbbbbbbbbbkwxkkwxkbbbbbk.....',
    '..kbbbbbbbbbbbkkkkkkbbbbbbk.....',
    '.kbbbbbbbbbbbbkkkkkkkbbbbbbk....',
    '.kbbbbbbbbbbbkiiiiiiikbbbbbk....',
    '.kbbbbbbbbbbkiiiiiiiiikbbbbbkkk.',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbbbbk',
    'kbbbbbbbbbbbkiikLkLkiikbbbbbbbbk',
    'kbbbbbbbbbbbkiiikkkiiikbbbbbbkkk',
    'kbbbbbbbbbbbbkiiiiiiikbbbbbbbk..',
    'kbbbbbbbbbbbbbkkkkkkkbbbbbbbbk..',
    'kbbbbbbbbbbbbbbiiiiibbbbbbbbbk..',
    '.kbbbbbbbbbbbbiiiiiiibbbbbbbbk..',
    '.kbbbbbbbbbbbiiiiiiiiibbbbbbbk..',
    '.kBbbbbbbbbbbiiiiiiiiibbbbbbbk..',
    '.kBBbbbbbbbbbiiiiiiiiibbbbbbk...',
    '..kBBbbbbbbbbbiiiiiiibbbbbbbk...',
    '..kBBBbbbbbbbbbiiiiibbbbbbbBk...',
    '...kBBBBbbbbbbbbbbbbbbbbbBBk....',
    '....kBBBBBBbbbbbbbbbbbBBBBk.....',
    '.....kkBBBBBBBBBBBBBBBBBkk......',
    '...kkkkkkBBBBBBBBBBBBkkkkkk.....',
    '..kBBBBBBkkkkkkkkkkkkBBBBBBk....',
    '.kBBBBBBBk..........kBBBBBBBk...',
    '..kkkkkkk............kkkkkkk....',
  ];
  S('mrfrosty_walk', [MF_WALK0, MF_WALK1], { fps: 4 }, MF_PAL);
  S('mrfrosty_throw', [MF_THROW0, MF_THROW1], { fps: 5, loop: false }, MF_PAL);

  // ======================================================================
  // 投射物（anchor bottom；proj_cutter 為 center）
  // ======================================================================
  S('proj_beam', [
    [
      '..YYYY..',
      '.YyyyyY.',
      'YyyFFyyY',
      'YyFFwFyY',
      'YyFwFFyY',
      'YyyFFyyY',
      '.YyyyyY.',
      '..YYYY..',
    ], [
      '..YYYY..',
      '.YyFFyY.',
      'YyFwwFyY',
      'YFwwwwFY',
      'YFwwwwFY',
      'YyFwwFyY',
      '.YyFFyY.',
      '..YYYY..',
    ],
  ], { fps: 12 });

  S('proj_fireball', [
    [
      '....RRRR....',
      '..RRrrrrRR..',
      '.RrrffffrrR.',
      'RrrffFFffrrR',
      'RrffFFwFffrR',
      'RrffFwwFffrR',
      'RrffFFwFffrR',
      'RrrffFFffrrR',
      '.RrrffffrrR.',
      '..RRrrrrRR..',
      '....RRRR....',
    ], [
      '.....RRR....',
      '..RRRrrrRR..',
      '.RrrrfffrrR.',
      'RrrffFFFfrrR',
      'RrfFFwwFffrR',
      'RrfFwwwFffrR',
      'RrfFFwwFffrR',
      'RrrffFFFfrrR',
      '.RrrrfffrrR.',
      '..RRRrrrRR..',
      '....RRRR....',
    ],
  ], { fps: 12 });

  // 迴旋刃：新月形（程式端會旋轉，anchor center）
  S('proj_cutter', [
    [
      '.....kkkkk..',
      '...kkLLLLLk.',
      '..kLLwwLLLk.',
      '.kLLwwLLkkk.',
      '.kLwwLLk....',
      'kLLwwLk.....',
      'kLLwwLk.....',
      '.kLwwLLk....',
      '.kLLwwLLkkk.',
      '..kLLwwLLsk.',
      '...kkLLLLsk.',
      '.....kkkkk..',
    ], [
      '.....kkkkk..',
      '...kkLLLLLk.',
      '..kLLLwLLLk.',
      '.kLLwwLLkkk.',
      '.kLwwwLk....',
      'kLLwwLLk....',
      'kLLwwLLk....',
      '.kLwwwLk....',
      '.kLLwwLLkkk.',
      '..kLLLwLssk.',
      '...kkLLLLsk.',
      '.....kkkkk..',
    ],
  ], { fps: 12, anchor: 'center' });

  S('proj_spark', [
    [
      '....c.....',
      'c..cwc..c.',
      '.ccwwwcc..',
      '..cwwwwc..',
      'ccwwFwwwcc',
      '..cwwwwc..',
      '.ccwwwcc..',
      'c..cwc..c.',
      '....c.....',
      '..........',
    ], [
      '.c...c....',
      '..c.c...c.',
      '..cwwwc...',
      'ccwwwwwcc.',
      '.cwwFwwwc.',
      'ccwwwwwcc.',
      '..cwwwc...',
      '..c.c...c.',
      '.c...c....',
      '..........',
    ],
  ], { fps: 14 });

  S('proj_ice', [
    [
      '....CC....',
      '...CaaC...',
      '..CaiiaC..',
      'CCaiwiiaCC',
      'CaiiwiiiaC',
      'CaiiiiiiaC',
      'CCaiiiIaCC',
      '..CaiIaC..',
      '...CaaC...',
      '....CC....',
    ], [
      '.C..CC..C.',
      '..CCaaCC..',
      '..CaiiaC..',
      '.CaiwiiaC.',
      'CCaiiwiiCC',
      '.CaiiiiaC.',
      '..CaiIaC..',
      '..CCaaCC..',
      '.C..CC..C.',
      '..........',
    ],
  ], { fps: 12 });

  S('proj_bomb', [
    [
      '........kFk.',
      '.......kFfk.',
      '......kTk...',
      '.....kkTk...',
      '...kkddkkk..',
      '..kdLdddddk.',
      '.kdLLddddddk',
      '.kdLdddddddk',
      '.kddddddddDk',
      '.kddddddddDk',
      '.kdddddddDDk',
      '..kddddDDDk.',
      '...kkdDDkk..',
      '.....kkk....',
    ], [
      '.........kk.',
      '.......kfFk.',
      '......kTFk..',
      '.....kkTk...',
      '...kkddkkk..',
      '..kdLdddddk.',
      '.kdLLddddddk',
      '.kdLdddddddk',
      '.kddddddddDk',
      '.kddddddddDk',
      '.kdddddddDDk',
      '..kddddDDDk.',
      '...kkdDDkk..',
      '.....kkk....',
    ],
  ], { fps: 8 });

  S('proj_apple', [[
    '.....kk...',
    '....kTkgk.',
    '...kkTkGk.',
    '..krrkkrk.',
    '.krwrrrrrk',
    '.krwrrrrrk',
    '.krrrrrrRk',
    '.krrrrrRRk',
    '..krrrRRk.',
    '...kkkkk..',
  ]], { fps: 1 });

  S('proj_star', [
    [
      '......k......',
      '.....kyk.....',
      '.....kyk.....',
      '....kFyyk....',
      'kkkkkFyyykkkk',
      '.kFFFFyyyyyYk',
      '..kFFyyyyyYk.',
      '...kyyyyyYk..',
      '...kyyyyyYk..',
      '..kyyykkyyYk.',
      '..kyyk...kyk.',
      '.kkkk.....kkk',
    ], [
      '......k......',
      '.....kyk.....',
      '.....kyk.....',
      '....kyyyk....',
      'kkkkkyyyykkkk',
      '.kyyyyyyyyyyk',
      '..kyyywyyyyk.',
      '...kyywyyyk..',
      '...kyyyyyyk..',
      '..kyyykkyyyk.',
      '..kyyk...kyk.',
      '.kkkk.....kkk',
    ],
  ], { fps: 10 });

  S('proj_airpuff', [
    [
      '...SSSS...',
      '.SSwwwwSS.',
      'SwwLwwwwwS',
      'SwLwwwwwwS',
      'SwwwwwwLwS',
      'SwwwwwwLwS',
      '.SSwwwwSS.',
      '...SSSS...',
    ], [
      '..SS.SSS..',
      '.SwwSwwwS.',
      'SwLwwwwwwS',
      'SwwwwwwwLS',
      'SwwwwwwwLS',
      'SwLwwwwwwS',
      '.SwwSwwwS.',
      '..SS.SSS..',
    ],
  ], { fps: 8 }, { S: '#c0c8d8', L: '#e0e8f0' });

  S('proj_cannonball', [[
    '..kkkk..',
    '.kdLddk.',
    'kdLddddk',
    'kddddddk',
    'kdddddDk',
    'kddddDDk',
    '.kdDDDk.',
    '..kkkk..',
  ]], { fps: 1 });

  S('proj_lightning', [
    [
      '...ww...', '..wcw...', '..wcw...', '.wcw....', '.wcw....', 'wcw.....', 'wcww....', '.wccw...',
      '..wccw..', '...wccw.', '....wcw.', '....wcw.', '...wcw..', '...wcw..', '..wcw...', '..wcw...',
      '.wcw....', '.wcw....', 'wcw.....', 'wcww....', '.wccw...', '..wccw..', '...wccw.', '....wcw.',
      '....wcw.', '...wcw..', '...wcw..', '..wcw...', '..wcw...', '.wcw....', '.wcw....', '..ww....',
    ], [
      '...ww...', '...wcw..', '...wcw..', '....wcw.', '....wcw.', '.....wcw', '....wwcw', '...wccw.',
      '..wccw..', '.wccw...', '.wcw....', '.wcw....', '..wcw...', '..wcw...', '...wcw..', '...wcw..',
      '....wcw.', '....wcw.', '.....wcw', '....wwcw', '...wccw.', '..wccw..', '.wccw...', '.wcw....',
      '.wcw....', '..wcw...', '..wcw...', '...wcw..', '...wcw..', '....wcw.', '....wcw.', '....ww..',
    ],
  ], { fps: 12 }, { c: '#80d8ff', w: '#ffffff' });

  S('proj_iceblock', [[
    '.CCCCCCCCCCCC.',
    'CaaaaiiiiiiiiC',
    'CaaiiiiiiiiiiC',
    'CaiiiiiiiiiiiC',
    'CaiiiiiiiiiiIC',
    'CiiiiiiiiiiiIC',
    'CiiiiiiiiiiiIC',
    'CiiiiiiiiiiiIC',
    'CiiiiiiiiiiIIC',
    'CiiiiiiiiiiIIC',
    'CiiiiiiiiiIIIC',
    'CIiiiiiiiIIIIC',
    'CIIIIIIIIIIIIC',
    '.CCCCCCCCCCCC.',
  ]], { fps: 1 }, { C: '#3080c0' });

  // ======================================================================
  // 特效（anchor center）
  // ======================================================================
  S('fx_hit', [
    [
      '................',
      '................',
      '.......ww.......',
      '.......ww.......',
      '......wyyw......',
      '....wwyyyyww....',
      '..wwyyyyyyyyww..',
      '..wwyyyyyyyyww..',
      '....wwyyyyww....',
      '......wyyw......',
      '.......ww.......',
      '.......ww.......',
      '................',
      '................',
      '................',
      '................',
    ], [
      '.......ww.......',
      '.......ww.......',
      '.w.....ww.....w.',
      '..w...wyyw...w..',
      '...w.wyyyyw.w...',
      '....wyyyyyyw....',
      '...wyyyyyyyyw...',
      'wwwwyyyyyyyywwww',
      'wwwwyyyyyyyywwww',
      '...wyyyyyyyyw...',
      '....wyyyyyyw....',
      '...w.wyyyyw.w...',
      '..w...wyyw...w..',
      '.w.....ww.....w.',
      '.......ww.......',
      '.......ww.......',
    ], [
      'w......ww......w',
      '.w.....ww.....w.',
      '..w....yy....w..',
      '...w..wyyw..w...',
      '....w..yy..w....',
      '.....w....w.....',
      '..ww........ww..',
      'wwyy........yyww',
      'wwyy........yyww',
      '..ww........ww..',
      '.....w....w.....',
      '....w..yy..w....',
      '...w..wyyw..w...',
      '..w....yy....w..',
      '.w.....ww.....w.',
      'w......ww......w',
    ],
  ], { fps: 15, loop: false, anchor: 'center' });

  S('fx_poof', [
    [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '........SSSS........',
      '.......SwwwwS.......',
      '......SwwwwwwS......',
      '......SwwwwwwS......',
      '......SwwwwwwS......',
      '......SwwwwwwS......',
      '.......SwwwwS.......',
      '........SSSS........',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
    ], [
      '....................',
      '....................',
      '....................',
      '.......SSSSS........',
      '.....SSwwwwwSS......',
      '....SwwwwwwwwwS.....',
      '...SwwwwwwwwwwwS....',
      '...SwwwwwwwwwwwS....',
      '..SwwwwwwwwwwwwwS...',
      '..SwwwwwwwwwwwwwS...',
      '..SwwwwwwwwwwwwwS...',
      '...SwwwwwwwwwwwS....',
      '...SwwwwwwwwwwwS....',
      '....SwwwwwwwwwS.....',
      '.....SSwwwwwSS......',
      '.......SSSSS........',
      '....................',
      '....................',
      '....................',
      '....................',
    ], [
      '....................',
      '......SSS...........',
      '....SSwwwSS..SSS....',
      '...SwwwwwwwSSwwwS...',
      '..SwwwwwwwwwwwwwwS..',
      '..SwwwwwwwwwwwwwwS..',
      '.SwwwwwwwwwwwwwwwwS.',
      '.SwwwwwwwwwwwwwwwwS.',
      'SwwwwwwwwwwwwwwwwwwS',
      'SwwwwwwwwwwwwwwwwwwS',
      'SwwwwwwwwwwwwwwwwwwS',
      '.SwwwwwwwwwwwwwwwwS.',
      '.SwwwwwwwwwwwwwwwwS.',
      '..SwwwwwwwwwwwwwwS..',
      '..SwwwwwwwwwwwwwS...',
      '...SSwwwwSSwwwwS....',
      '.....SSSS..SSSS.....',
      '....................',
      '....................',
      '....................',
    ], [
      '.SSS............SSS.',
      'SwwwS..........SwwwS',
      'SwwwS..SSSSS...SwwwS',
      '.SSS..SwwwwwS...SSS.',
      '......SwwwwwS.......',
      '.......SSSSS........',
      '....................',
      '....................',
      '....................',
      '...SSS..............',
      '..SwwwS.......SSS...',
      '..SwwwS......SwwwS..',
      '...SSS.......SwwwS..',
      '..............SSS...',
      '....................',
      '......SSS...........',
      '.....SwwwS....SS....',
      '.....SwwwS...SwwS...',
      '......SSS.....SS....',
      '....................',
    ],
  ], { fps: 12, loop: false, anchor: 'center' }, { S: '#d0d8e8' });

  S('fx_sparkle', [
    [
      '............',
      '............',
      '............',
      '.....w......',
      '.....w......',
      '...wwyww....',
      '.....w......',
      '.....w......',
      '............',
      '............',
      '............',
      '............',
    ], [
      '.....w......',
      '.....w......',
      '.....w......',
      '....wyw.....',
      '....wyw.....',
      'wwwwyFywwww.',
      '....wyw.....',
      '....wyw.....',
      '.....w......',
      '.....w......',
      '.....w......',
      '............',
    ], [
      '............',
      '..w.....w...',
      '...w...w....',
      '....www.....',
      '....wyw.....',
      '..wwyyyww...',
      '....wyw.....',
      '....www.....',
      '...w...w....',
      '..w.....w...',
      '............',
      '............',
    ],
  ], { fps: 12, loop: false, anchor: 'center' });

  S('fx_blockbreak', [[
    '..kkk...................',
    '.klykk......kkkk........',
    '.kyyYk.....klyyyk.......',
    '..kkk......kyyYYk.......',
    '............kkkk........',
    '.......kk...............',
    '......klyk.......kkk....',
    '......kyYk......klyyk...',
    '.......kk.......kyYYk...',
    '.................kkk....',
    '...kkkk.................',
    '..klyyyk....kk..........',
    '..kyyYYk...klyk.........',
    '...kkkk....kyYk.........',
    '............kk..........',
    '.....kk...........kkkk..',
    '....klyk.........klyyyk.',
    '....kyYk.........kyyYYk.',
    '.....kk...........kkkk..',
    '...........kkk..........',
    '..kkk.....klyyk.........',
    '.klyk.....kyYYk.........',
    '.kYYk......kkk..........',
    '..kk....................',
  ]], { fps: 1, anchor: 'center' }, { l: '#fff8a0', y: '#f8d848', Y: '#c89818' });

  // 吸入風線：40×24，畫在卡比右前方（往左收斂）
  S('fx_inhale_wind', [
    [
      '..........................WWWWWW........',
      '.......................WWW......WWW.....',
      '....................WWW............WW...',
      '.................WWW................W...',
      '..............WWW.......................',
      '...........WWW.....................WWWWW',
      '........WWW..................WWWWWW.....',
      '......WW................WWWWW...........',
      '.....W..............WWWW................',
      '..................WW.......WWWWWWWWW....',
      '...WWWWWWWWWWWWWWW....WWWWW.........WWW.',
      '.WWW...............WWW..................',
      '.WWW...............WWW..................',
      '...WWWWWWWWWWWWWWW....WWWWW.........WWW.',
      '..................WW.......WWWWWWWWW....',
      '.....W..............WWWW................',
      '......WW................WWWWW...........',
      '........WWW..................WWWWWW.....',
      '...........WWW.....................WWWWW',
      '..............WWW.......................',
      '.................WWW................W...',
      '....................WWW............WW...',
      '.......................WWW......WWW.....',
      '..........................WWWWWW........',
    ], [
      '.......................WWWWWW...........',
      '....................WWW......WWW........',
      '.................WWW............WW......',
      '..............WWW................W......',
      '...........WWW..........................',
      '........WWW...................WWWWW.....',
      '......WW................WWWWWW.....WWW..',
      '.....W..............WWWWW...............',
      '.................WWWW...................',
      '...............WW.......WWWWWWWWW.......',
      '.WWWWWWWWWWWWWW....WWWWW.........WWW....',
      'WW..............WWW....................W',
      'WW..............WWW....................W',
      '.WWWWWWWWWWWWWW....WWWWW.........WWW....',
      '...............WW.......WWWWWWWWW.......',
      '.................WWWW...................',
      '.....W..............WWWWW...............',
      '......WW................WWWWWW.....WWW..',
      '........WWW...................WWWWW.....',
      '...........WWW..........................',
      '..............WWW................W......',
      '.................WWW............WW......',
      '....................WWW......WWW........',
      '.......................WWWWWW...........',
    ],
  ], { fps: 10, anchor: 'center' });

  S('fx_fire', [
    [
      '................',
      '.....RRR........',
      '...RRrrrRR......',
      '.RRrrfffrrRR....',
      'RrrffFFFffrrRR..',
      'RrffFFwwFFffrrR.',
      'RrffFFwwFFffrrR.',
      'RrrffFFFffrrRR..',
      '.RRrrfffrrRR....',
      '...RRrrrRR......',
      '.....RRR........',
      '................',
    ], [
      '.......RRR......',
      '....RRRrrrR.....',
      '..RRrrrfffrRR...',
      '.RrrfffFFffrrR..',
      'RrrffFFwFFffrrR.',
      'RrfFFwwwwFFffrrR',
      'RrfFFwwwwFFffrrR',
      'RrrffFFwFFffrrR.',
      '.RrrfffFFffrrR..',
      '..RRrrrfffrRR...',
      '....RRRrrrR.....',
      '.......RRR......',
    ], [
      '..RR............',
      '.RrrR...RRR.....',
      'RrffrRRRrrrRR...',
      'RrfFffrrfffrrR..',
      '.RrfFFffFFffrrRR',
      '..RrfFFwwFFfffrR',
      '..RrfFFwwFFfffrR',
      '.RrfFFffFFffrrRR',
      'RrfFffrrfffrrR..',
      'RrffrRRRrrrRR...',
      '.RrrR...RRR.....',
      '..RR............',
    ],
  ], { fps: 12, anchor: 'center' }, { R: '#c03010' });

  S('fx_beam_seg', [[
    '.YYYY.',
    'YyFFyY',
    'YFwwFY',
    'YFwwFY',
    'YyFFyY',
    '.YYYY.',
  ]], { fps: 1, anchor: 'center' });

  S('fx_ice', [
    [
      '................',
      '.....a..........',
      '...a.i.a....a...',
      '..aiIiIia..i....',
      '.aiIwwwIia.a....',
      'aiIwwaawwIia....',
      'aiIwwaawwIia....',
      '.aiIwwwIia.a....',
      '..aiIiIia..i....',
      '...a.i.a....a...',
      '.....a..........',
      '................',
    ], [
      '.......a........',
      '...a...i...a....',
      '....a.aia.a.....',
      '..a..aiIia..a...',
      '.aiaaiIwIiaaia..',
      'aiIiIIwwwIIiIia.',
      'aiIiIIwwwIIiIia.',
      '.aiaaiIwIiaaia..',
      '..a..aiIia..a...',
      '....a.aia.a.....',
      '...a...i...a....',
      '.......a........',
    ], [
      '.a......a.......',
      '..a...a...a..a..',
      '...a.aia.a......',
      'a...aiiia...a...',
      '.a.aiiwiia.a....',
      '..aiiwwwiia.....',
      '..aiiwwwiia..a..',
      '.a.aiiwiia.a....',
      'a...aiiia...a...',
      '...a.aia.a......',
      '..a...a...a..a..',
      '.a......a.......',
    ],
  ], { fps: 12, anchor: 'center' }, { a: '#d8f4ff', i: '#a0e0ff', I: '#60b0f0' });

  S('fx_spark_field', [
    [
      '....c..w....',
      '...c..w.....',
      '..cw.w..c...',
      '.....c.c....',
      'ww.cw.......',
      '..cw.....cc.',
      '.c...wc.w...',
      '....c..w....',
      '...c.w......',
      '..w...c.....',
      '.....w.c....',
      '......c..w..',
    ], [
      '.w......c...',
      '..c...cw....',
      '...wc.......',
      'c...w..w.c..',
      '.c.c..c.....',
      '....cw...ww.',
      '..cw..c.....',
      '.w...w.c....',
      '....c...w...',
      '...w.c......',
      '..c...wc....',
      '.w.......c..',
    ],
  ], { fps: 14, anchor: 'center' }, { c: '#80d8ff' });

  // ======================================================================
  // 新增投射物（卡比招式 / 新敵人用）
  // ======================================================================
  const pasteR = (base, patch, x, y) => {          // 疊圖（本節專用）
    const out = base.map(r => r.split(''));
    patch.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]; if (ch === '.' || ch === ' ') continue;
        const yy = y + j, xx = x + i;
        if (yy < 0 || yy >= out.length || xx < 0 || xx >= out[0].length) continue;
        out[yy][xx] = ch;
      }
    });
    return out.map(r => r.join(''));
  };

  // 劍氣（滿血揮砍射出）：新月形綠色斬擊波，anchor center
  S('proj_swordwave', [
    [
      '.......kk...',
      '.....kkvvk..',
      '...kkvvuuk..',
      '..kvvuuuwk..',
      '..kvuuuwwk..',
      '.kvuuuwwk...',
      '.kvuuuwk....',
      '.kvuuuwk....',
      '.kvuuuwwk...',
      '..kvuuuwwk..',
      '..kvvuuuwk..',
      '...kkvvuuk..',
      '.....kkvvk..',
      '.......kk...',
    ], [
      '......kk....',
      '....kkvvk...',
      '..kkvvuuuk..',
      '..kvuuuwwk..',
      '.kvuuuwwwk..',
      '.kvuuwwwk...',
      'kvuuuwwk....',
      'kvuuuwwk....',
      '.kvuuwwwk...',
      '.kvuuuwwwk..',
      '..kvuuuwwk..',
      '..kkvvuuuk..',
      '....kkvvk...',
      '......kk....',
    ],
  ].map(flipH), { fps: 12 });

  // 波動光束（蓄力放開）：巨大黃白能量球，anchor center
  S('proj_beamwave', [
    [
      '......kkkk......',
      '....kkyyyykk....',
      '..kkyyYYYYyykk..',
      '.kyyYYwwwwYYyyk.',
      '.kyYYwwwwwwYYyk.',
      'kyYYwwwwwwwwYYyk',
      'kyYwwwwwwwwwwYyk',
      'kyYwwwwwwwwwwYyk',
      'kyYYwwwwwwwwYYyk',
      '.kyYYwwwwwwYYyk.',
      '.kyyYYwwwwYYyyk.',
      '..kkyyYYYYyykk..',
      '....kkyyyykk....',
      '......kkkk......',
    ], [
      '......kkkk......',
      '....kkwwwwkk....',
      '..kkwwyyyywwkk..',
      '.kwwyyYYYYyywwk.',
      '.kwyyYYYYYYyywk.',
      'kwyyYYYYYYYYyywk',
      'kwyYYYYYYYYYYywk',
      'kwyYYYYYYYYYYywk',
      'kwyyYYYYYYYYyywk',
      '.kwyyYYYYYYyywk.',
      '.kwwyyYYYYyywwk.',
      '..kkwwyyyywwkk..',
      '....kkwwwwkk....',
      '......kkkk......',
    ],
  ], { fps: 10 });

  // 羽刃（Dart Wing 投擲）：白色尖羽，anchor center
  S('proj_feather', [
    [
      '.......kkk..',
      '..kkkkkeeek.',
      '.kweeeeeeeek',
      'kweeeeeeeek.',
      '.kssssssk...',
      '..kkkkk.....',
      '............',
    ], [
      '............',
      '.......kkk..',
      '..kkkkkeeek.',
      '.kweeeeeeeek',
      'kweeeeeeeek.',
      '.kssssssk...',
      '..kkkkk.....',
    ],
  ], { fps: 10 });

  // ======================================================================
  // 新敵人 1：Spike Roller（滾刺球）—— 紫色帶刺鐵球，會沿地面滾動
  // ======================================================================
  const SPIKE = hi => [
    '.......ss.......',
    '..s....ss....s..',
    '..ss..kkkk..ss..',
    '....kkmmmmkk....',
    '...kmmmmmmmmk...',
    '..kmmmmmmmmmmk..',
    hi === 0 ? 's.kmmwwmmmmmmk.s' : 's.kmmmmmmwwmmk.s',
    hi === 0 ? 'sskmmwwwwmmmmkss' : 'sskmmmmwwwwmmkss',
    hi === 0 ? 'sskmmwwmmmmmMkss' : 'sskmmmmmwwmmMkss',
    's.kmmmmmmmmMMk.s',
    '..kmmmmmmmMMMk..',
    '...kMMMMMMMMk...',
    '....kkMMMMkk....',
    '..ss..kkkk..ss..',
    '..s....ss....s..',
    '.......ss.......',
  ];
  S('spikeball_roll', [SPIKE(0), SPIKE(1)], { fps: 8, anchor: 'center' });
  // 衝刺：刺變紅、眼睛發光
  const SPIKE_DASH = hi => SPIKE(hi).map(r => r.replace(/s/g, 'r'));
  S('spikeball_dash', [
    pasteR(SPIKE_DASH(0), ['.yy.', 'y..y'], 6, 6),
    pasteR(SPIKE_DASH(1), ['y..y', '.yy.'], 6, 6),
  ], { fps: 12, anchor: 'center' });

  // ======================================================================
  // 新敵人 2：Dart Wing（飛羽鳥）—— 藍身白翼，飛行中投擲羽刃
  // ======================================================================
  const DW_UP = [
    '..kk........kk..',
    '.kwwk......kwwk.',
    '.kwwwkkkkkkwwwk.',
    '..kwwbbbbbbwwk..',
    '...kbbbbbbbbk...',
    '...kbbbbbwxbk...',
    '...kbbbbbwxbkyk.',
    '...kbbbbbbbbkyyk',
    '...kbbbbbbbbkyk.',
    '....kbbbbbbk....',
    '.....kbbbbk.....',
    '......kkkk......',
    '.......rr.......',
    '................',
  ];
  const DW_DOWN = [
    '................',
    '.....kkkkkk.....',
    '...kkbbbbbbkk...',
    '..kbbbbbbbbbbk..',
    '..kbbbbbbbbbbk..',
    '...kbbbbbwxbk...',
    '...kbbbbbwxbkyk.',
    '...kbbbbbbbbkyyk',
    '.kwwkbbbbbbbbkyk',
    'kwwwkbbbbbbk....',
    'kwwkkbbbbk......',
    '.kk...kkkk......',
    '.......rr.......',
    '................',
  ];
  S('dartwing_fly', [DW_UP, DW_DOWN], { fps: 8 }, { b: '#5088f8', B: '#2848a8' });
  S('dartwing_throw', [
    pasteR(DW_UP, ['.kkk', 'keee', 'kss.'], 11, 9),
    pasteR(DW_DOWN, ['..kkk', '.keee', 'kkss.'], 10, 4),
  ], { fps: 8, loop: false }, { b: '#5088f8', B: '#2848a8' });

  // ======================================================================
  // 新敵人 3：Snowly（雪人）—— 會噴冰霧的雪人，吸入給 ice
  // ======================================================================
  const SN_BODY = [
    '......kkkk......',
    '....kkeeeekk....',
    '...keeeeeeeek...',
    '..keexeeeexeek..',
    '..keeeeeeeeeek..',
    '..keeeeoooeeek..',
    '...keeeeeeeek...',
    '....kkeeeekk....',
    '...kkeeeeeekk...',
    '..keeeeeeeeeek..',
    '.keeeeeeeeeeeek.',
    '.keeeCCeeCCeeek.',
    '.keeeeeeeeeeeek.',
    '.keeeeeeeeeeeek.',
    '..keeeeeeeeeek..',
    '...kkeeeeeekk...',
    '.....kkkkkk.....',
  ];
  S('snowly_walk', [
    SN_BODY.concat(['..krrk....krrk..']),
    SN_BODY.concat(['...krrk..krrk...']),
  ], { fps: 5 }, { e: '#f4f8ff', C: '#2090c0' });
  // 攻擊：嘴巴張開鼓氣（幀 0 吸氣、幀 1 吐冰霧）
  const SN_ATK0 = pasteR(SN_BODY, ['.kiik.', 'kiiiik', '.kiik.'], 9, 4).concat(['..krrk....krrk..']);
  const SN_ATK1 = pasteR(SN_BODY, ['.kiiik', 'kiiiii', 'kiiiii', '.kiiik'], 9, 4).concat(['...krrk..krrk...']);
  S('snowly_attack', [SN_ATK0, SN_ATK1], { fps: 8 }, { e: '#f4f8ff', C: '#2090c0', i: '#c8f4ff' });
})();
