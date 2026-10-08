// 自製關卡資料模型 / 分享碼 / localStorage 多槽 / 靜態檢查（Round 12，agent: level-editor）
// ============================================================================
// 本檔「沒有任何 DOM 依賴」，所以 node 也可以 require（tools/level_check.js --custom）。
//
// 資料格式（KB.CUSTOM 的 data，與 src/levels.js 的房間格式一對一可轉）：
//   {
//     v: 1,                      // 格式版本
//     name: '自製關卡 1',         // 關卡名（分享碼含在內）
//     theme: 'green',            // 主題（決定磁磚 / 裝飾 / 背景）
//     w: 64, h: 14,              // 磁磚尺寸
//     rows: ['...', ...],        // 地形層（字元同 levels.js：# = * B X I W F ^ ~ H / \ .）
//     deco: ['...', ...],        // 裝飾層（字元依主題，見 DECO）
//     spawn: [2, 11],            // 起點（腳所站的那一列）
//     exit:  [60, 11],           // 終點旗（= 房間 exit，game.js 會生成過關門）
//     objs:  [{ t:'waddledee', x:10, y:11, a:undefined }, ...],   // 敵人 / 道具 / 能力台座
//     boss:  null | 'whispywoods',   // 可選魔王（有魔王時打倒才會出現過關門）
//     bossPos: [x, y] | null,
//   }
//
// 建關路徑與本體關卡完全相同：toLevel() 產生標準 level 物件 → 註冊到 KB.EXTRA_LEVELS →
// new KB.GameScene(id) → loadRoom() → new KB.TileMap(room.map, room.deco)。
// ============================================================================
(function () {
  'use strict';
  const T = (typeof KB !== 'undefined' && KB.TILE) || 16;
  const C = {};

  // ---------- 規格 ----------
  C.VER = 1;
  C.CODE_PREFIX = 'KBL1';
  C.SLOTS = 8;                 // localStorage 槽位數（簡報要求 ≥ 8）
  C.STORE_KEY = 'kirbystar_custom';
  C.MIN_W = 24; C.MAX_W = 160;
  C.MIN_H = 12; C.MAX_H = 28;
  C.BEST_KEEP = 5;             // 每關排行保留幾筆

  C.THEMES = [
    { k: 'green', label: '草原' }, { k: 'castle', label: '古堡' }, { k: 'island', label: '群島' },
    { k: 'cloud', label: '雲海' }, { k: 'dedede', label: '城堡' }, { k: 'space', label: '星空' },
    { k: 'dream', label: '夢境' },
  ];
  C.THEME_KEYS = C.THEMES.map(t => t.k);

  // 地形筆刷（同 levels.js 的磁磚字元）；group 供編輯器分頁
  C.TILES = [
    { ch: '.', label: '空白', group: 'base' },
    { ch: '#', label: '實心', group: 'base' },
    { ch: '=', label: '平台', group: 'base' },
    { ch: '/', label: '左斜坡', group: 'base' },
    { ch: '\\', label: '右斜坡', group: 'base' },
    { ch: '*', label: '星星磚', group: 'brick' },
    { ch: 'B', label: '炸彈磚', group: 'brick' },
    { ch: 'X', label: '硬磚', group: 'brick' },
    { ch: 'I', label: '冰磚', group: 'brick' },
    { ch: 'W', label: '木箱', group: 'brick' },
    { ch: 'F', label: '導火線', group: 'brick' },
    { ch: '^', label: '尖刺', group: 'hazard' },
    { ch: '~', label: '水', group: 'hazard' },
    { ch: 'H', label: '梯子', group: 'hazard' },
  ];
  C.TILE_CHARS = C.TILES.map(t => t.ch);
  C.SOLID = { '#': 1, '*': 1, 'B': 1, 'X': 1, 'I': 1, 'W': 1 };
  C.SLOPE = { '/': 1, '\\': 1 };
  C.SOFT = { '*': 1, 'B': 1, 'X': 1, 'I': 1, 'W': 1 };   // 打得破的實心

  // 各主題的裝飾字元（與 tools/level_check.js 的 DECO 表一致）
  C.DECO = {
    green: 'tbfsgmrw', castle: 'pwrkacb', island: 'purghsb',
    cloud: 'csrbdmgf', dedede: 'pkwtscbv', space: 'cprsgm', dream: 'cdrsmg',
  };

  // 可放置物件（t 必須是 KB.ENEMIES / KB.ITEMS 的 key）
  // spr：編輯器畫面上的預覽精靈；fly：不需要下方地面（可達性 / 檢查用）
  C.OBJS = [
    // ---- 道具 ----
    { t: 'tomato', label: '番茄', spr: 'item_tomato', group: 'item', fly: true },
    { t: 'food', label: '食物', spr: 'item_food', group: 'item', fly: true },
    { t: 'oneup', label: '1UP', spr: 'item_1up', group: 'item', fly: true },
    { t: 'candy', label: '無敵糖', spr: 'item_candy', group: 'item', fly: true },
    { t: 'pointstar', label: '點數星', spr: 'item_star', group: 'item', fly: true },
    { t: 'bigstar', label: '大星星', spr: 'item_bigstar', group: 'item', fly: true, arg: 'star' },
    { t: 'essence', label: '能力星', spr: 'item_essence_base', group: 'item', arg: 'ability' },
    { t: 'switchblock', label: '開關方塊', spr: 'item_switch', group: 'item', fly: true },
    // ---- 基本敵人 ----
    { t: 'waddledee', label: '瓦豆魯迪', spr: 'waddledee_walk', group: 'enemy' },
    { t: 'waddledoo', label: '瓦豆魯度', spr: 'waddledoo_walk', group: 'enemy' },
    { t: 'cappy', label: '蘑菇怪', spr: 'cappy_walk', group: 'enemy' },
    { t: 'brontoburt', label: '布隆特', spr: 'brontoburt_fly', group: 'enemy', fly: true },
    { t: 'hothead', label: '火頭', spr: 'hothead_walk', group: 'enemy' },
    { t: 'sirkibble', label: '刀刃騎士', spr: 'sirkibble_walk', group: 'enemy' },
    { t: 'sparky', label: '電火花', spr: 'sparky_hop', group: 'enemy' },
    { t: 'rocky', label: '石頭怪', spr: 'rocky_walk', group: 'enemy' },
    { t: 'chilly', label: '雪人', spr: 'chilly_walk', group: 'enemy' },
    { t: 'bladeknight', label: '劍士', spr: 'bladeknight_walk', group: 'enemy' },
    { t: 'poppybros', label: '炸彈兄弟', spr: 'poppybros_hop', group: 'enemy' },
    { t: 'scarfy', label: '史卡菲', spr: 'scarfy_fly', group: 'enemy', fly: true },
    { t: 'gordo', label: '哥多', spr: 'gordo', group: 'enemy', fly: true },
    { t: 'twizzy', label: '小鳥', spr: 'twizzy_fly', group: 'enemy', fly: true },
    { t: 'shotzo', label: '砲台', spr: 'shotzo', group: 'enemy', fly: true },
    { t: 'kabu', label: '木偶', spr: 'kabu', group: 'enemy' },
    { t: 'spikeball', label: '尖刺球', spr: 'spikeball_roll', group: 'enemy' },
    { t: 'dartwing', label: '飛鏢蟲', spr: 'dartwing_fly', group: 'enemy', fly: true },
    { t: 'snowly', label: '雪怪', spr: 'snowly_walk', group: 'enemy' },
    { t: 'squishy', label: '章魚', spr: 'squishy_swim', group: 'water', fly: true, water: true },
    { t: 'glunk', label: '貝殼', spr: 'glunk', group: 'water', water: true },
    // ---- 能力敵人（Round 5）----
    { t: 'pistolo', label: '槍手', spr: 'pistolo_walk', group: 'enemy2' },
    { t: 'kagedee', label: '忍者迪', spr: 'kagedee_walk', group: 'enemy2' },
    { t: 'ronin', label: '浪人', spr: 'ronin_walk', group: 'enemy2' },
    { t: 'archerwaddle', label: '弓兵', spr: 'archerwaddle_walk', group: 'enemy2' },
    { t: 'wizzle', label: '魔術師', spr: 'wizzle_walk', group: 'enemy2' },
    { t: 'tiktok', label: '時鐘兵', spr: 'tiktok_walk', group: 'enemy2' },
    { t: 'gravitron', label: '重力球', spr: 'gravitron_walk', group: 'enemy2', fly: true },
    { t: 'mimi', label: '模仿獸', spr: 'mimi_walk', group: 'enemy2' },
    { t: 'bigbloom', label: '巨花', spr: 'bigbloom_walk', group: 'enemy2' },
    { t: 'drako', label: '小龍', spr: 'drako_fly', group: 'enemy2', fly: true },
    { t: 'bolt', label: '機甲兵', spr: 'bolt_walk', group: 'enemy2' },
    { t: 'boodee', label: '幽靈迪', spr: 'boodee_float', group: 'enemy2', fly: true },
    // ---- 中魔王 ----
    { t: 'bonkers', label: '邦克斯', spr: 'bonkers_walk', group: 'mini' },
    { t: 'mrfrosty', label: '佛洛斯提', spr: 'mrfrosty_walk', group: 'mini' },
    { t: 'rollarmor', label: '鐵甲滾球', spr: 'rollarmor_walk', group: 'mini' },
  ];
  C.OBJ_KEYS = C.OBJS.map(o => o.t);
  C.objDef = t => C.OBJS.find(o => o.t === t) || null;

  C.BOSSES = [
    { k: '', label: '無' },
    { k: 'whispywoods', label: '大樹威斯比' },
    { k: 'lololo', label: '羅羅與拉拉' },
    { k: 'kracko', label: '克拉可' },
    { k: 'metaknight', label: '美塔騎士' },
    { k: 'dedede', label: '迪迪迪大王' },
    { k: 'shadowkirby', label: '暗影卡比' },
    { k: 'nightmarecore', label: '夢魘之核' },
  ];
  C.bossLabel = k => { const b = C.BOSSES.find(b => b.k === (k || '')); return b ? b.label : k; };

  // 能力台座可選的能力（執行期以 KB.ABILITY_KEYS 為準；node 下退回基本 8 種）
  C.abilityKeys = function () {
    const a = (typeof KB !== 'undefined' && KB.ABILITY_KEYS) ? KB.ABILITY_KEYS : null;
    return (a && a.length) ? a.slice() : ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer'];
  };

  // ======================================================================
  // 建立 / 複製 / 正規化
  // ======================================================================
  const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));
  const pad = (s, w) => { s = String(s || ''); return s.length >= w ? s.slice(0, w) : s + '.'.repeat(w - s.length); };

  /** 空白關卡：底部兩列實心、左側起點、右側終點旗 */
  C.blank = function (w, h, theme) {
    w = clampI(w === undefined ? 64 : w, C.MIN_W, C.MAX_W);
    h = clampI(h === undefined ? 14 : h, C.MIN_H, C.MAX_H);
    const rows = [], deco = [];
    for (let y = 0; y < h; y++) {
      rows.push((y >= h - 2 ? '#' : '.').repeat(w));
      deco.push('.'.repeat(w));
    }
    return {
      v: C.VER, name: '自製關卡', theme: C.THEME_KEYS.indexOf(theme) >= 0 ? theme : 'green',
      w, h, rows, deco, spawn: [2, h - 3], exit: [w - 4, h - 3], objs: [], boss: '', bossPos: null,
    };
  };

  C.clone = d => JSON.parse(JSON.stringify(d));

  /** 把任意來源的資料夾到合法範圍；不合法（尺寸 / 列長 / 未知字元 / 未知物件）回 null */
  C.normalize = function (d) {
    if (!d || typeof d !== 'object') return null;
    const w = clampI(d.w, C.MIN_W, C.MAX_W), h = clampI(d.h, C.MIN_H, C.MAX_H);
    if (!Array.isArray(d.rows) || d.rows.length !== h) return null;
    const theme = C.THEME_KEYS.indexOf(d.theme) >= 0 ? d.theme : 'green';
    const rows = [], deco = [];
    const decoOK = C.DECO[theme] || '';
    for (let y = 0; y < h; y++) {
      const r = pad(d.rows[y], w);
      for (const ch of r) if (C.TILE_CHARS.indexOf(ch) < 0 && ch !== ' ') return null;
      rows.push(r.replace(/ /g, '.'));
      let dr = pad(Array.isArray(d.deco) ? d.deco[y] : '', w);
      dr = dr.split('').map(ch => (ch === '.' || decoOK.indexOf(ch) >= 0) ? ch : '.').join('');
      deco.push(dr);
    }
    const sp = Array.isArray(d.spawn) ? d.spawn : [2, h - 3];
    const ex = Array.isArray(d.exit) ? d.exit : null;
    const objs = [];
    for (const o of (Array.isArray(d.objs) ? d.objs : [])) {
      if (!o || C.OBJ_KEYS.indexOf(o.t) < 0) return null;
      const e = { t: o.t, x: clampI(o.x, 0, w - 1), y: clampI(o.y, 0, h - 1) };
      if (o.a !== undefined && o.a !== null && o.a !== '') e.a = o.a;
      objs.push(e);
    }
    const boss = C.BOSSES.some(b => b.k === (d.boss || '')) ? (d.boss || '') : '';
    let bossPos = Array.isArray(d.bossPos) ? [clampI(d.bossPos[0], 0, w - 1), clampI(d.bossPos[1], 0, h - 1)] : null;
    return {
      v: C.VER, name: String(d.name || '自製關卡').slice(0, 16), theme, w, h, rows, deco,
      spawn: [clampI(sp[0], 0, w - 1), clampI(sp[1], 0, h - 1)],
      exit: ex ? [clampI(ex[0], 0, w - 1), clampI(ex[1], 0, h - 1)] : null,
      objs, boss, bossPos,
    };
  };

  // ======================================================================
  // 轉成標準 level（與本體關卡走同一條建關路徑）
  // ======================================================================
  C.toLevel = function (d, id) {
    d = C.normalize(d) || C.blank();
    const room = {
      name: d.name,
      map: d.rows.slice(),
      deco: d.deco.slice(),
      spawn: [d.spawn[0], d.spawn[1]],
      entities: d.objs.map(o => (o.a !== undefined ? { t: o.t, x: o.x, y: o.y, a: o.a } : { t: o.t, x: o.x, y: o.y })),
      doors: [],
      theme: d.theme,
      custom: true,
    };
    if (d.exit) room.exit = { x: d.exit[0], y: d.exit[1] };
    if (d.boss) { room.bossRoom = true; if (d.bossPos) room.bossPos = [d.bossPos[0], d.bossPos[1]]; }
    else room.noBoss = true;
    return {
      id: id || 'custom', name: d.name, theme: d.theme, music: d.theme,
      boss: d.boss || null, bossName: d.boss ? C.bossLabel(d.boss) : '',
      rooms: [room], custom: true,
    };
  };

  /** 註冊到 KB.EXTRA_LEVELS（GameScene 的第二個查表來源），回傳 level id */
  C.register = function (d, id) {
    id = id || 'custom';
    if (typeof KB === 'undefined') return id;
    KB.EXTRA_LEVELS = KB.EXTRA_LEVELS || {};
    KB.EXTRA_LEVELS[id] = C.toLevel(d, id);
    return id;
  };

  // ======================================================================
  // 分享碼：RLE 壓縮 → JSON → UTF-8 → base64url → 加 FNV-1a 校驗碼
  //   格式：KBL1.<base64url>.<8 位 16 進位校驗碼>
  // ======================================================================
  C.rle = function (s) {
    let out = '', i = 0;
    while (i < s.length) {
      const ch = s[i]; let n = 1;
      while (i + n < s.length && s[i + n] === ch) n++;
      out += ch + (n > 1 ? String(n) : '');
      i += n;
    }
    return out;
  };
  C.unrle = function (s) {
    let out = '', i = 0;
    while (i < s.length) {
      const ch = s[i++];
      let num = '';
      while (i < s.length && s[i] >= '0' && s[i] <= '9') num += s[i++];
      out += ch.repeat(num ? parseInt(num, 10) : 1);
    }
    return out;
  };

  C.fnv = function (s) {
    let hv = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      hv ^= s.charCodeAt(i) & 0xff;
      hv = (hv + ((hv << 1) + (hv << 4) + (hv << 7) + (hv << 8) + (hv << 24))) >>> 0;
      hv ^= (s.charCodeAt(i) >> 8) & 0xff;
      hv = (hv + ((hv << 1) + (hv << 4) + (hv << 7) + (hv << 8) + (hv << 24))) >>> 0;
    }
    return ('00000000' + hv.toString(16)).slice(-8);
  };

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    const out = []; for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function unutf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(new Uint8Array(bytes));
    let s = ''; for (let i = 0; i < bytes.length;) {
      const b = bytes[i++];
      if (b < 0x80) s += String.fromCharCode(b);
      else if (b < 0xe0) s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
      else s += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    }
    return s;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      out += B64[a >> 2];
      out += B64[((a & 3) << 4) | ((b === undefined ? 0 : b) >> 4)];
      if (b === undefined) break;
      out += B64[((b & 15) << 2) | ((c === undefined ? 0 : c) >> 6)];
      if (c === undefined) break;
      out += B64[c & 63];
    }
    return out;
  }
  function unb64(s) {
    const out = []; let acc = 0, bits = 0;
    for (const ch of s) {
      const v = B64.indexOf(ch);
      if (v < 0) return null;
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return out;
  }
  C._b64 = b64; C._unb64 = unb64;

  /** data → 分享碼字串 */
  C.encode = function (d) {
    const n = C.normalize(d);
    if (!n) return '';
    const types = [];
    const objs = n.objs.map(o => {
      let i = types.indexOf(o.t); if (i < 0) { types.push(o.t); i = types.length - 1; }
      const a = [i, o.x, o.y];
      if (o.a !== undefined) a.push(o.a);
      return a;
    });
    const payload = JSON.stringify({
      v: C.VER, n: n.name, t: n.theme, w: n.w, h: n.h,
      m: C.rle(n.rows.join('')), d: C.rle(n.deco.join('')),
      s: n.spawn, e: n.exit, b: n.boss || undefined, bp: n.bossPos || undefined,
      ot: types, o: objs,
    });
    return C.CODE_PREFIX + '.' + b64(utf8(payload)) + '.' + C.fnv(payload);
  };

  /** 分享碼字串 → data；任何不合法（前綴 / 校驗 / 格式 / 內容）都回 null */
  C.decode = function (code) {
    try {
      if (typeof code !== 'string') return null;
      const s = code.replace(/\s+/g, '');
      if (!s) return null;
      const parts = s.split('.');
      if (parts.length !== 3) return null;
      if (parts[0] !== C.CODE_PREFIX) return null;
      if (!/^[0-9a-f]{8}$/.test(parts[2])) return null;
      const bytes = unb64(parts[1]);
      if (!bytes || !bytes.length) return null;
      const payload = unutf8(bytes);
      if (C.fnv(payload) !== parts[2]) return null;       // 校驗失敗（打錯 / 被截斷）
      const j = JSON.parse(payload);
      if (!j || j.v !== C.VER) return null;
      const w = clampI(j.w, C.MIN_W, C.MAX_W), h = clampI(j.h, C.MIN_H, C.MAX_H);
      if (w !== j.w || h !== j.h) return null;
      const flat = C.unrle(String(j.m || ''));
      if (flat.length !== w * h) return null;
      const dflat = C.unrle(String(j.d || ''));
      const rows = [], deco = [];
      for (let y = 0; y < h; y++) {
        rows.push(flat.slice(y * w, y * w + w));
        deco.push(dflat.length === w * h ? dflat.slice(y * w, y * w + w) : '.'.repeat(w));
      }
      const types = Array.isArray(j.ot) ? j.ot : [];
      const objs = [];
      for (const a of (Array.isArray(j.o) ? j.o : [])) {
        if (!Array.isArray(a) || a.length < 3) return null;
        const t = types[a[0]];
        if (!t || C.OBJ_KEYS.indexOf(t) < 0) return null;
        const o = { t, x: a[1], y: a[2] };
        if (a.length > 3) o.a = a[3];
        objs.push(o);
      }
      return C.normalize({
        v: C.VER, name: j.n, theme: j.t, w, h, rows, deco,
        spawn: j.s, exit: j.e, objs, boss: j.b || '', bossPos: j.bp || null,
      });
    } catch (e) { return null; }
  };

  // ======================================================================
  // localStorage 多槽（≥ 8）+ 每關排行
  //   { v:1, slots:[ data|null × SLOTS ], best:{ '<槽>': [ {time,score,ability,date} ] } }
  // ======================================================================
  function ls() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  C.load = function () {
    const st = { v: C.VER, slots: new Array(C.SLOTS).fill(null), best: {} };
    const s = ls(); if (!s) return st;
    try {
      const raw = s.getItem(C.STORE_KEY);
      if (!raw) return st;
      const j = JSON.parse(raw);
      if (j && Array.isArray(j.slots)) for (let i = 0; i < C.SLOTS; i++) st.slots[i] = j.slots[i] ? C.normalize(j.slots[i]) : null;
      if (j && j.best && typeof j.best === 'object') st.best = j.best;
    } catch (e) { }
    return st;
  };
  C.save = function (st) {
    const s = ls(); if (!s) return false;
    try { s.setItem(C.STORE_KEY, JSON.stringify({ v: C.VER, slots: st.slots, best: st.best })); return true; }
    catch (e) { return false; }
  };
  C.slot = function (i) { const st = C.load(); return st.slots[i] || null; };
  C.setSlot = function (i, d) {
    if (i < 0 || i >= C.SLOTS) return false;
    const st = C.load();
    st.slots[i] = d ? C.normalize(d) : null;
    return C.save(st);
  };
  C.delSlot = function (i) {
    if (i < 0 || i >= C.SLOTS) return false;
    const st = C.load();
    st.slots[i] = null; delete st.best[String(i)];
    return C.save(st);
  };
  C.slotNames = function () {
    const st = C.load();
    return st.slots.map(d => d ? d.name : null);
  };
  C.firstFree = function () { const st = C.load(); return st.slots.findIndex(d => !d); };

  /** 排行（時間越短越前面，保留 BEST_KEEP 筆） */
  C.best = function (i) { const st = C.load(); return (st.best[String(i)] || []).slice(); };
  C.addBest = function (i, rec) {
    const st = C.load(), k = String(i);
    const list = (st.best[k] || []).slice();
    list.push({
      time: Math.max(0, rec.time | 0), score: Math.max(0, rec.score | 0),
      ability: rec.ability || 'none', date: rec.date || C.today(),
    });
    list.sort((a, b) => (a.time - b.time) || (b.score - a.score));
    st.best[k] = list.slice(0, C.BEST_KEEP);
    C.save(st);
    return st.best[k];
  };
  C.today = function () {
    const d = new Date();
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
  };

  // ======================================================================
  // 靜態檢查（含可達性）—— 編輯器與 tools/level_check.js --custom 共用
  //   回傳 { errors:[], warns:[], info:[], reach:Set, soft:Set }
  // ======================================================================
  const isSolidCh = ch => !!C.SOLID[ch] || !!C.SLOPE[ch];
  const isStandCh = ch => isSolidCh(ch) || ch === '=';

  /**
   * 可達性：卡比會飛，所以一格只要「非實心」就能從相鄰的非實心格到達（4 連通泛洪）。
   * pass 1（嚴格）：實心全部阻擋。
   * pass 2（寬鬆）：可破壞的方塊（* B X I W）視為可通行 —— 只在 pass 2 可達 = 「要先打破方塊」。
   */
  C.flood = function (d, soft) {
    const w = d.w, h = d.h, rows = d.rows;
    const seen = new Set();
    const at = (x, y) => (x < 0 || x >= w || y < 0 || y >= h) ? '#' : (rows[y][x] || '.');
    const open = (x, y) => {
      const ch = at(x, y);
      if (!isSolidCh(ch)) return true;
      return !!(soft && C.SOFT[ch]);
    };
    const sp = d.spawn || [2, h - 3];
    const st = [];
    // 起點本身若在實心裡，從它上方找第一個空格
    for (let y = Math.min(h - 1, Math.max(0, sp[1])); y >= 0; y--) if (open(sp[0], y)) { st.push([sp[0], y]); break; }
    if (!st.length) st.push([sp[0], Math.max(0, sp[1])]);
    while (st.length) {
      const [x, y] = st.pop(), k = x + ',' + y;
      if (seen.has(k)) continue;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (!open(x, y)) continue;
      seen.add(k);
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return seen;
  };

  C.check = function (data) {
    const errors = [], warns = [], info = [];
    const d = C.normalize(data);
    if (!d) return { errors: ['關卡資料不合法（尺寸 / 磁磚字元 / 物件類型）'], warns: [], info: [], reach: new Set(), soft: new Set() };
    const w = d.w, h = d.h;
    const at = (x, y) => (x < 0 || x >= w || y < 0 || y >= h) ? '#' : (d.rows[y][x] || '.');
    const reach = C.flood(d, false), soft = C.flood(d, true);
    const ok = (x, y) => reach.has(x + ',' + y);
    const okSoft = (x, y) => soft.has(x + ',' + y);

    // ---- 起點 ----
    if (isSolidCh(at(d.spawn[0], d.spawn[1]))) errors.push('起點在實心磁磚裡');
    if (!isStandCh(at(d.spawn[0], d.spawn[1] + 1))) warns.push('起點下方沒有地面（卡比會直接往下掉）');
    if (at(d.spawn[0], d.spawn[1]) === '^') warns.push('起點就是尖刺');

    // ---- 終點旗 / 魔王 ----
    if (!d.exit && !d.boss) errors.push('沒有終點旗，也沒有魔王（無法過關）');
    if (d.exit) {
      if (isSolidCh(at(d.exit[0], d.exit[1]))) errors.push('終點旗在實心磁磚裡');
      else if (!ok(d.exit[0], d.exit[1])) {
        if (okSoft(d.exit[0], d.exit[1])) warns.push('終點旗要先打破方塊才到得了');
        else errors.push('終點旗不可達（從起點飛不過去）');
      }
      if (!isStandCh(at(d.exit[0], d.exit[1] + 1))) warns.push('終點旗下方沒有地面');
    }
    if (d.boss) {
      const bp = d.bossPos || [w - 5, h - 3];
      if (!okSoft(bp[0], bp[1])) warns.push('魔王位置不可達');
      info.push('魔王：' + C.bossLabel(d.boss) + '（打倒後才會出現過關門）');
    }

    // ---- 底部封口（掉出地圖的開口）----
    let pit = 0;
    for (let x = 0; x < w; x++) if (!C.SOLID[at(x, h - 1)]) pit++;
    if (pit) info.push('底部有 ' + pit + ' 格無底洞');

    // ---- 物件 ----
    let unreach = 0, floating = 0, waterBad = 0;
    for (const o of d.objs) {
      const def = C.objDef(o.t) || {};
      if (isSolidCh(at(o.x, o.y))) { warns.push(o.t + ' (' + o.x + ',' + o.y + ') 卡在實心磁磚裡'); continue; }
      if (!okSoft(o.x, o.y)) unreach++;
      else if (!ok(o.x, o.y)) warns.push(o.t + ' (' + o.x + ',' + o.y + ') 要先打破方塊才拿得到');
      if (!def.fly && !isStandCh(at(o.x, o.y + 1)) && at(o.x, o.y + 1) !== '~') floating++;
      if (def.water && at(o.x, o.y) !== '~') waterBad++;
    }
    if (unreach) warns.push('有 ' + unreach + ' 個物件完全不可達（玩家到不了那裡）');
    if (floating) warns.push('有 ' + floating + ' 個地面型物件懸空（下方沒有地面）');
    if (waterBad) warns.push('有 ' + waterBad + ' 個水中敵人不在水裡');

    // ---- 機關需要的能力 ----
    const mech = { X: 0, F: 0, I: 0, B: 0 };
    for (const r of d.rows) for (const ch of r) if (mech[ch] !== undefined) mech[ch]++;
    const have = new Set();
    for (const o of d.objs) if (o.t === 'essence' && o.a) have.add(o.a);
    const FROM = { hothead: 'fire', chilly: 'ice', snowly: 'ice', mrfrosty: 'ice', sparky: 'spark', waddledoo: 'beam', sirkibble: 'cutter', bladeknight: 'sword', ronin: 'blade', bonkers: 'hammer', rocky: 'stone' };
    for (const o of d.objs) if (FROM[o.t]) have.add(FROM[o.t]);
    if (mech.X && !have.has('hammer') && !have.has('stone')) warns.push('有硬磚但關卡裡沒有鐵鎚 / 石頭的來源');
    if ((mech.F || mech.I) && !have.has('fire')) warns.push('有導火線 / 冰磚但關卡裡沒有火焰的來源');

    // ---- 統計 ----
    const enemies = d.objs.filter(o => { const g = (C.objDef(o.t) || {}).group; return g === 'enemy' || g === 'enemy2' || g === 'mini' || g === 'water'; }).length;
    info.push('尺寸 ' + w + '×' + h + '　敵人 ' + enemies + '　物件 ' + d.objs.length);
    if (!enemies) info.push('沒有敵人（散步關卡）');
    const bigs = d.objs.filter(o => o.t === 'bigstar');
    if (bigs.length > 3) warns.push('大星星超過 3 顆（只有 a=0/1/2 會被記錄）');

    return { errors, warns, info, reach, soft };
  };

  if (typeof KB !== 'undefined') KB.CUSTOM = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})();
