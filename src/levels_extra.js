// Extra 模式關卡疊加層 + 一般層（Round 7 覺醒與挑戰 / agent: extra）
// ============================================================================
// 疊加層格式與 levels.js 的 MECH / R4 / R5 / ELEM6 / ELEM6B 完全相同：
//   tiles : [[x, y, ch], ...]   磁磚（'^' 尖刺 / 'X' 硬磚 / '#' 實心 …）
//   deco  : [[x, y, ch], ...]   裝飾層（可燃植被 …）
//   add   : [{t, x, y, a, b}]   追加實體
//   rm    : [[x, y, t?], ...]   移除既有實體
//   flags : 房間旗標（dark / music / ambient …）
// 差別在「套用時機」：
//   KB.NORMAL_LAYERS —— 一般層，**任何難度都會套用**（目前只有 w4 r0 / w5 r1 的可燃植被）
//   KB.EXTRA_LAYERS  —— Extra 疊加層，只有 KB.session.extra 為 true 時才套用
// 兩者都**不會改到 KB.LEVELS 的原始資料**：game.js 的 loadRoom 呼叫 KB.applyRoomLayers()，
// 它會做一份房間的淺拷貝（map / deco / entities 另外建新陣列）再把疊加層套上去。
// 靜態檢查：`node tools/level_check.js --extra`（會把疊加後的房間丟進同一套檢查）。
//
// Extra 設計方針（每個非魔王房）：
//   ① +2~4 隻 Round 5 / 6 的強力敵人（槍手 / 忍者 / 居合 / 弓 / 法師 / 時鐘 / 浮球 / 模仿者 /
//      機器兵 / 小龍 / 幽靈迪 / 星靈 / 虛空 / 隕石）—— 依世界分配，沿房間寬度平均散開
//   ② +1 處尖刺（地面上 2 格）逼玩家改道 / 起跳
//   ③ 補給（food / tomato / candy）減半 —— 但一定保留第 1 個「站得到」的（level_check 的硬性要求）
//   ④ +1 處新的隱藏 1UP（高空凹處，要浮空才拿得到）＝ 給 Extra 玩家的獎勵
// 魔王房不套用（魔王的 Extra 變體在 bosses.js / bosses_w6.js：開場即二階段 + 每隻 1 個新招）。
// ============================================================================
(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 一般層（不看 extra 旗標）：w4 泡泡雲海 r0 與 w5 迪迪迪城 r1 各鋪 6 格可燃植被。
  // tilemap.js 的 TileMap.BURN_DECO 這一輪補上 cloud（'gf' 雲草 / 雲花）與 dedede（'kv' 旗幟 / 地毯邊），
  // art/world.js 也補了對應的焦黑圖（deco_*_burnt）。連續 6 格才看得出「往兩側各蔓延 3 格」。
  // --------------------------------------------------------------------------
  const NORMAL = [
    // w4 r0 雲海入口：x=68~73 的平地鋪雲草 + 雲花，右邊 (75,9) 放一座火焰台座當點火來源
    {
      lv: 'w4', r: 0,
      deco: [[68, 9, 'g'], [69, 9, 'g'], [70, 9, 'f'], [71, 9, 'g'], [72, 9, 'f'], [73, 9, 'g']],
      add: [{ t: 'essence', x: 75, y: 9, a: 'fire' }],
    },
    // w5 r1 守衛長廊：x=70~75 的地毯邊（(76,9) 本來就有 Hot Head 當火源；房內的旗幟 'k' 也一起變成可燃）
    {
      lv: 'w5', r: 1,
      deco: [[70, 9, 'v'], [71, 9, 'v'], [72, 9, 'v'], [73, 9, 'v'], [74, 9, 'v'], [75, 9, 'v']],
    },
  ];

  // --------------------------------------------------------------------------
  // Extra 疊加層（只在 KB.session.extra 時套用）
  // --------------------------------------------------------------------------
  const EXTRA = [
    // ---------------- w1 翠綠草原 ----------------
    { lv: 'w1', r: 0,
      add: [{ t: 'pistolo', x: 23, y: 9 }, { t: 'kagedee', x: 48, y: 9 }, { t: 'gravitron', x: 72, y: 4 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[43,9,'^'], [44,9,'^']],
      rm: [[72, 9, 'tomato']],
    },
    { lv: 'w1', r: 1,
      add: [{ t: 'kagedee', x: 21, y: 9 }, { t: 'gravitron', x: 40, y: 3 }, { t: 'wizzle', x: 58, y: 9 }, { t: 'oneup', x: 60, y: 2 }],
      tiles: [[52,9,'^'], [53,9,'^']],
      rm: [[44, 9, 'food'], [59, 6, 'food']],
    },
    { lv: 'w1', r: 2,
      add: [{ t: 'gravitron', x: 16, y: 4 }, { t: 'wizzle', x: 31, y: 9 }, { t: 'pistolo', x: 49, y: 9 }, { t: 'oneup', x: 49, y: 4 }],
      tiles: [[28,9,'^'], [29,9,'^']],
      rm: [[52, 8, 'food']],
    },
    { lv: 'w1', r: 4,
      add: [{ t: 'pistolo', x: 12, y: 9 }, { t: 'kagedee', x: 18, y: 9 }, { t: 'oneup', x: 18, y: 1 }],
      tiles: [[8,9,'^'], [9,9,'^']],
    },
    // ---------------- w2 幽靜古堡 ----------------
    { lv: 'w2', r: 0,
      add: [{ t: 'ronin', x: 24, y: 9 }, { t: 'tiktok', x: 48, y: 8 }, { t: 'boodee', x: 72, y: 4 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[51,9,'^'], [52,9,'^']],
      rm: [[32, 9, 'food'], [48, 3, 'food'], [62, 9, 'food']],
    },
    { lv: 'w2', r: 1,
      add: [{ t: 'tiktok', x: 9, y: 7 }, { t: 'boodee', x: 16, y: 20 }, { t: 'mimi', x: 24, y: 25 }, { t: 'oneup', x: 24, y: 1 }],
      tiles: [[16,25,'^'], [17,25,'^']],
      rm: [[10, 15, 'food']],
    },
    { lv: 'w2', r: 2,
      add: [{ t: 'boodee', x: 18, y: 3 }, { t: 'mimi', x: 38, y: 9 }, { t: 'ronin', x: 58, y: 9 }, { t: 'oneup', x: 62, y: 1 }],
      tiles: [[42,9,'^'], [43,9,'^']],
      rm: [[24, 8, 'food'], [46, 9, 'food']],
    },
    { lv: 'w2', r: 3,
      add: [{ t: 'mimi', x: 16, y: 9 }, { t: 'ronin', x: 32, y: 9 }, { t: 'tiktok', x: 47, y: 9 }, { t: 'oneup', x: 48, y: 1 }],
      tiles: [[34,9,'^'], [35,9,'^']],
      rm: [[38, 4, 'food']],
    },
    { lv: 'w2', r: 5,
      add: [{ t: 'tiktok', x: 16, y: 9 }, { t: 'boodee', x: 17, y: 2 }, { t: 'oneup', x: 19, y: 1 }],
      tiles: [[18,9,'^'], [19,9,'^']],
    },
    // ---------------- w3 漂浮群島 ----------------
    { lv: 'w3', r: 0,
      add: [{ t: 'archerwaddle', x: 18, y: 9 }, { t: 'drako', x: 47, y: 2 }, { t: 'mimi', x: 74, y: 9 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[39,9,'^'], [40,9,'^']],
      rm: [[58, 9, 'tomato']],
    },
    { lv: 'w3', r: 1,
      add: [{ t: 'drako', x: 20, y: 7 }, { t: 'mimi', x: 38, y: 8 }, { t: 'gravitron', x: 60, y: 2 }, { t: 'oneup', x: 58, y: 1 }],
      tiles: [[43,9,'^'], [44,9,'^']],
      rm: [[33, 9, 'tomato']],
    },
    { lv: 'w3', r: 2,
      add: [{ t: 'mimi', x: 28, y: 9 }, { t: 'gravitron', x: 48, y: 8 }, { t: 'archerwaddle', x: 70, y: 9 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[54,9,'^'], [55,9,'^']],
      rm: [[30, 9, 'tomato'], [43, 8, 'food'], [22, 2, 'food']],
    },
    { lv: 'w3', r: 3,
      add: [{ t: 'gravitron', x: 16, y: 4 }, { t: 'archerwaddle', x: 32, y: 9 }, { t: 'drako', x: 48, y: 2 }, { t: 'oneup', x: 48, y: 4 }],
      tiles: [[23,9,'^'], [24,9,'^']],
      rm: [[50, 6, 'food'], [27, 9, 'food']],
    },
    { lv: 'w3', r: 5,
      add: [{ t: 'drako', x: 12, y: 6 }, { t: 'mimi', x: 17, y: 9 }, { t: 'oneup', x: 18, y: 1 }],
      tiles: [[19,9,'^'], [20,9,'^']],
    },
    // ---------------- w4 泡泡雲海 ----------------
    { lv: 'w4', r: 0,
      add: [{ t: 'bolt', x: 23, y: 8 }, { t: 'starling', x: 47, y: 4 }, { t: 'voidling', x: 70, y: 2 }, { t: 'oneup', x: 74, y: 1 }],
      tiles: [[49,9,'^'], [50,9,'^']],
      rm: [[49, 4, 'food'], [70, 9, 'tomato']],
    },
    { lv: 'w4', r: 1,
      add: [{ t: 'starling', x: 12, y: 6 }, { t: 'voidling', x: 16, y: 2 }, { t: 'kagedee', x: 24, y: 23 }, { t: 'oneup', x: 23, y: 1 }],
      tiles: [[17,23,'^'], [18,23,'^']],
      rm: [[5, 6, 'food']],
    },
    { lv: 'w4', r: 2,
      add: [{ t: 'voidling', x: 24, y: 4 }, { t: 'kagedee', x: 45, y: 9 }, { t: 'bolt', x: 68, y: 9 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[20,9,'^'], [21,9,'^']],
      rm: [[43, 5, 'food'], [30, 9, 'food']],
    },
    { lv: 'w4', r: 3,
      add: [{ t: 'kagedee', x: 16, y: 9 }, { t: 'bolt', x: 32, y: 9 }, { t: 'starling', x: 50, y: 7 }, { t: 'oneup', x: 48, y: 1 }],
      tiles: [[48,9,'^'], [49,9,'^']],
      rm: [[48, 6, 'food']],
    },
    { lv: 'w4', r: 5,
      add: [{ t: 'starling', x: 12, y: 6 }, { t: 'voidling', x: 16, y: 2 }, { t: 'oneup', x: 18, y: 1 }],
      tiles: [[17,9,'^'], [18,9,'^']],
    },
    // ---------------- w5 迪迪迪城 ----------------
    { lv: 'w5', r: 0,
      add: [{ t: 'ronin', x: 24, y: 9 }, { t: 'pistolo', x: 47, y: 9 }, { t: 'bolt', x: 72, y: 9 }, { t: 'oneup', x: 69, y: 1 }],
      tiles: [[68,9,'^'], [69,9,'^']],
      rm: [[42, 9, 'tomato']],
    },
    { lv: 'w5', r: 1,
      add: [{ t: 'pistolo', x: 24, y: 9 }, { t: 'bolt', x: 47, y: 9 }, { t: 'tiktok', x: 71, y: 6 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[56,9,'^'], [57,9,'^']],
      rm: [[34, 5, 'food'], [17, 2, 'tomato']],
    },
    { lv: 'w5', r: 2,
      add: [{ t: 'bolt', x: 14, y: 5 }, { t: 'tiktok', x: 40, y: 5 }, { t: 'ronin', x: 65, y: 9 }, { t: 'oneup', x: 61, y: 1 }],
      tiles: [[65,9,'^'], [66,9,'^']],
      rm: [[32, 9, 'tomato'], [54, 9, 'food']],
    },
    { lv: 'w5', r: 3,
      add: [{ t: 'tiktok', x: 16, y: 9 }, { t: 'ronin', x: 27, y: 9 }, { t: 'pistolo', x: 49, y: 9 }, { t: 'oneup', x: 48, y: 1 }],
      tiles: [[24,9,'^'], [25,9,'^']],
      rm: [[30, 7, 'food'], [46, 5, 'tomato']],
    },
    { lv: 'w5', r: 4,
      add: [{ t: 'ronin', x: 6, y: 10 }, { t: 'pistolo', x: 16, y: 21 }, { t: 'bolt', x: 24, y: 10 }, { t: 'oneup', x: 24, y: 1 }],
      tiles: [[27,16,'^'], [28,16,'^']],
      rm: [[11, 11, 'tomato']],
    },
    { lv: 'w5', r: 6,
      add: [{ t: 'bolt', x: 12, y: 9 }, { t: 'tiktok', x: 18, y: 9 }, { t: 'oneup', x: 18, y: 1 }],
      tiles: [[20,9,'^'], [21,9,'^']],
    },
    // ---------------- w6 星之彼端 ----------------
    { lv: 'w6', r: 0,
      add: [{ t: 'drako', x: 20, y: 5 }, { t: 'starling', x: 44, y: 3 }, { t: 'meteorite', x: 66, y: 4 }, { t: 'oneup', x: 66, y: 1 }],
      tiles: [[45,8,'^'], [46,8,'^']],
      rm: [[60, 9, 'food']],
    },
    { lv: 'w6', r: 1,
      add: [{ t: 'starling', x: 12, y: 2 }, { t: 'meteorite', x: 16, y: 6 }, { t: 'voidling', x: 24, y: 2 }, { t: 'oneup', x: 22, y: 1 }],
      tiles: [[16,21,'^'], [17,21,'^']],
      rm: [[12, 11, 'food']],
    },
    { lv: 'w6', r: 2,
      add: [{ t: 'meteorite', x: 18, y: 4 }, { t: 'voidling', x: 40, y: 4 }, { t: 'drako', x: 60, y: 2 }, { t: 'oneup', x: 60, y: 4 }],
      tiles: [[35,9,'^'], [36,9,'^']],
      rm: [[50, 9, 'food']],
    },
    { lv: 'w6', r: 3,
      add: [{ t: 'voidling', x: 24, y: 2 }, { t: 'drako', x: 48, y: 6 }, { t: 'starling', x: 70, y: 4 }, { t: 'oneup', x: 72, y: 1 }],
      tiles: [[48,9,'^'], [49,9,'^']],
      rm: [[70, 9, 'food']],
    },
    { lv: 'w6', r: 4,
      add: [{ t: 'drako', x: 14, y: 2 }, { t: 'starling', x: 28, y: 6 }, { t: 'meteorite', x: 42, y: 2 }, { t: 'oneup', x: 40, y: 1 }],
      tiles: [[32,9,'^'], [33,9,'^']],
      rm: [[26, 7, 'food']],
    },
    { lv: 'w6', r: 6,
      add: [{ t: 'meteorite', x: 12, y: 6 }, { t: 'voidling', x: 17, y: 2 }, { t: 'oneup', x: 19, y: 1 }],
      tiles: [[18,9,'^'], [19,9,'^']],
    },
  ];

  // --------------------------------------------------------------------------
  // 索引化：[{lv, r, …}] → { levelId: { roomIdx: layer } }
  // --------------------------------------------------------------------------
  function index(list) {
    const out = {};
    for (const m of list) {
      const lv = out[m.lv] = out[m.lv] || {};
      const cur = lv[m.r] = lv[m.r] || {};
      for (const k of ['tiles', 'deco', 'add', 'rm']) if (m[k]) cur[k] = (cur[k] || []).concat(m[k]);
      if (m.flags) cur.flags = Object.assign(cur.flags || {}, m.flags);
    }
    return out;
  }
  KB.NORMAL_LAYERS = index(NORMAL);
  KB.EXTRA_LAYERS = index(EXTRA);

  // 把一層疊加層套到 room 上（room 必須已經是可以安全改寫的副本）
  function paint(room, m) {
    if (!m) return room;
    if (m.tiles && m.tiles.length) {
      const g = room.map.map(r => r.split(''));
      for (const [x, y, ch] of m.tiles) if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch;
      room.map = g.map(r => r.join(''));
    }
    if (m.deco && m.deco.length && room.deco) {
      const g = room.deco.map(r => r.split(''));
      for (const [x, y, ch] of m.deco) if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch;
      room.deco = g.map(r => r.join(''));
    }
    if (m.flags) Object.assign(room, m.flags);
    if (m.rm && m.rm.length && room.entities) {
      // 同一個座標可能有好幾個同類道具 → 一筆 rm 只吃掉一個（先到先移除）
      const want = m.rm.map(r => ({ x: r[0], y: r[1], t: r[2], used: false }));
      room.entities = room.entities.filter(e => {
        const hit = want.find(r => !r.used && e.x === r.x && e.y === r.y && (!r.t || e.t === r.t));
        if (hit) { hit.used = true; return false; }
        return true;
      });
    }
    if (m.add && m.add.length) room.entities = (room.entities || []).concat(m.add);
    return room;
  }

  /**
   * game.js loadRoom 用：回傳「套好疊加層的房間」。
   * 沒有任何疊加層時直接回傳原物件（零成本）；有的話回傳淺拷貝，原始資料一個字都不會變。
   * @param {string} levelId  關卡 id
   * @param {number} idx      房間索引
   * @param {object} room     KB.LEVELS[...].rooms[idx]
   * @param {boolean} [extra] 覆寫 Extra 旗標（省略時讀 KB.session.extra）
   */
  KB.applyRoomLayers = function (levelId, idx, room, extra) {
    if (!room) return room;
    const on = extra === undefined ? !!(KB.session && KB.session.extra) : !!extra;
    const n = (KB.NORMAL_LAYERS[levelId] || {})[idx];
    const x = on ? (KB.EXTRA_LAYERS[levelId] || {})[idx] : null;
    if (!n && !x) return room;
    const copy = Object.assign({}, room);
    copy.map = room.map.slice();
    if (room.deco) copy.deco = room.deco.slice();
    copy.entities = (room.entities || []).slice();
    copy.extraApplied = !!x;
    paint(copy, n); paint(copy, x);
    return copy;
  };

  // 統計（tools/test_extra.py、level_check --extra 與 PROGRESS 用）
  KB.extraLayerStats = function () {
    const st = { rooms: 0, enemies: 0, oneups: 0, spikes: 0, removed: 0, byLevel: {} };
    for (const id in KB.EXTRA_LAYERS) {
      const per = st.byLevel[id] = { rooms: 0, enemies: 0, oneups: 0, spikes: 0, removed: 0 };
      for (const r in KB.EXTRA_LAYERS[id]) {
        const m = KB.EXTRA_LAYERS[id][r];
        per.rooms++;
        for (const a of (m.add || [])) { if (a.t === 'oneup') per.oneups++; else per.enemies++; }
        for (const t of (m.tiles || [])) if (t[2] === '^') per.spikes++;
        per.removed += (m.rm || []).length;
      }
      for (const k in per) st[k] += per[k];
    }
    return st;
  };
})();
