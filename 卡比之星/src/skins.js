// 卡比配色 KB.SKINS（成就解鎖、精靈重著色）（Round 8 挑戰與個人化）
//
// 作法：12 種配色各自定義「KB.PAL.kirby 的色碼 → 新色碼」對照表，需要時才用
// KB.spriteRecolor 產生 `<原精靈名>@<配色 id>` 的複本（懶生成、之後直接命中快取）。
// 只有 `kirby_` 開頭的精靈會換色（含 kirby_attack_* / kirby_swim / kirby_dragon_* 等變身專用圖）；
// 帽子 `hat_*`、夥伴、敵人、道具一律不換。HUD 的 `ui_kirby_face` 由本檔在切換時直接覆蓋
// KB.SPR['ui_kirby_face']（ui.js 不用改）。
//
// 對外 API（ach2 設定頁用）：
//   KB.SKINS.all()                 → [{id, name, cond}, ...] 全部 12 種（含未解鎖）
//   KB.SKINS.list()                → 已解鎖的 id 陣列（cycle 用；永遠含 'pink'）
//   KB.SKINS.current()             → 目前 id（未解鎖會自動退回 'pink'）
//   KB.SKINS.set(id)               → 成功 true（存 KB.save.settings.skin 並存檔）；未解鎖 / 未知 id 回 false
//   KB.SKINS.unlocked(id)          → 是否已解鎖（KB.DEBUG 時全 true）
//   KB.SKINS.name(id)              → 顯示名稱（中文）
//   KB.SKINS.unlockCond(id)        → 解鎖條件文字
//   KB.SKINS.spr(name)             → 配色版精靈名（非 kirby_ 或 pink 時原樣回傳）
//   KB.SKINS.drawPreview(ctx,x,y,id) → 在螢幕座標畫該配色的 kirby_idle（錨點＝底部中央）
//   KB.SKINS.refresh()             → 依存檔重新套用（HUD 臉 + 能力圖示同步）；set() 會自動呼叫
(function () {
  'use strict';

  // KB.PAL.kirby 的基準色（重著色以「像素色碼」比對，所以這裡要跟 const.js 完全一致）
  const BASE = {
    p: '#ffb0d0',   // 身體主色
    P: '#e07aa8',   // 身體陰影
    l: '#ffd8e8',   // 身體高光
    c: '#f27090',   // 腮紅
    m: '#a02040',   // 嘴內
    r: '#e8305c',   // 腳
    R: '#a81c48',   // 腳陰影
    b: '#5060c0',   // 眼睛下半（藍色高光）—— 只有少數配色會動
  };

  // id: [中文名, 解鎖條件, 色表]
  // 色表 key 同上；沒寫的字元＝維持原色。
  const DEFS = [
    { id: 'pink', name: '櫻花粉', cond: { kind: 'always' }, col: {} },
    {
      id: 'yellow', name: '檸檬黃', cond: { kind: 'ach', id: 'first_ability' },
      col: { p: '#ffe870', P: '#d8a820', l: '#fff8c8', c: '#f0c038', m: '#8c5410', r: '#f08828', R: '#a04c10' },
    },
    {
      id: 'blue', name: '天空藍', cond: { kind: 'clear', id: 'w1' },
      col: { p: '#8cd0ff', P: '#4084d0', l: '#d8f0ff', c: '#58aae8', m: '#1c4478', r: '#2f5cd0', R: '#183080' },
    },
    {
      id: 'green', name: '抹茶綠', cond: { kind: 'ach', id: 'combo10' },
      col: { p: '#aae088', P: '#5c9c4c', l: '#ddf8b8', c: '#82c05c', m: '#2c5820', r: '#4a9c38', R: '#28601e' },
    },
    {
      id: 'red', name: '蘋果紅', cond: { kind: 'ach', id: 'clear_w5' },
      col: { p: '#ff8078', P: '#c03040', l: '#ffc4b4', c: '#e85060', m: '#6c1018', r: '#d02028', R: '#840c18' },
    },
    {
      id: 'white', name: '雪白', cond: { kind: 'ach', id: 'secret5' },
      col: { p: '#f4f4fc', P: '#bcc0d8', l: '#ffffff', c: '#d4d8ec', m: '#7c84a0', r: '#b4bcd8', R: '#78809c' },
    },
    {
      id: 'purple', name: '葡萄紫', cond: { kind: 'ach', id: 'all20' },
      col: { p: '#c8a0f0', P: '#8854c0', l: '#e8d4ff', c: '#a878d8', m: '#401868', r: '#7c3cc8', R: '#481c84' },
    },
    {
      id: 'orange', name: '蜜柑橘', cond: { kind: 'ach', id: 'stars15' },
      col: { p: '#ffb060', P: '#d07418', l: '#ffd8a4', c: '#f08c38', m: '#8c3808', r: '#f06818', R: '#9c3808' },
    },
    {
      id: 'black', name: '暗影黑', cond: { kind: 'clear', id: 'w6' },
      col: { p: '#6c6c7c', P: '#3c3c4c', l: '#9c9cac', c: '#4c4c60', m: '#14141c', r: '#303040', R: '#1a1a26', b: '#ffffff' },
    },
    {
      id: 'gold', name: '黃金', cond: { kind: 'ach', id: 'lv3' },
      col: { p: '#ffd85c', P: '#c08c18', l: '#fff4bc', c: '#e8b030', m: '#6c4408', r: '#d89818', R: '#8c5808' },
    },
    {
      id: 'mint', name: '薄荷', cond: { kind: 'ach', id: 'arena_clear' },
      col: { p: '#9cecd8', P: '#44b09c', l: '#d8fff4', c: '#68d0c0', m: '#1c5c50', r: '#38a890', R: '#1a6454' },
    },
    {
      id: 'galaxy', name: '星河', cond: { kind: 'clear', id: 'w7' },
      col: { p: '#4c4ea0', P: '#262a60', l: '#c0c8ff', c: '#7c58c8', m: '#120c30', r: '#6a3cc0', R: '#341c78', b: '#ffffff' },
    },
  ];

  const BY_ID = {};
  for (const d of DEFS) BY_ID[d.id] = d;
  const DEFAULT_ID = 'pink';
  const FACE = 'ui_kirby_face';

  // 色表 → spriteRecolor 需要的 {舊色碼: 新色碼}
  function hexMap(def) {
    const m = {};
    for (const k in def.col) if (BASE[k] && def.col[k]) m[BASE[k]] = def.col[k];
    return m;
  }
  const MAP_CACHE = {};
  function mapOf(id) { return MAP_CACHE[id] || (MAP_CACHE[id] = hexMap(BY_ID[id])); }

  // ---------------------------------------------------------------- 解鎖
  function debugAll() {
    return !!(KB.DEBUG || (KB.UI && KB.UI.unlockAll));
  }
  function cleared(id) {
    return !!(KB.save && KB.save.cleared && KB.save.cleared[id]);
  }
  function hasAch(id) {
    return !!(KB.PROG && KB.PROG.has && KB.PROG.has(id));
  }
  function unlocked(id) {
    const d = BY_ID[id]; if (!d) return false;
    if (d.cond.kind === 'always') return true;
    if (debugAll()) return true;
    if (d.cond.kind === 'clear') return cleared(d.cond.id);
    if (d.cond.kind === 'ach') return hasAch(d.cond.id);
    return false;
  }
  const WORLD_NAME = { w1: '翠綠草原', w2: '幽靜古堡', w3: '漂浮群島', w4: '泡泡雲海', w5: '迪迪迪城', w6: '星之彼端', w7: '夢幻迴廊' };
  function worldName(wid) {
    const L = KB.LEVELS && KB.LEVELS.find && KB.LEVELS.find(l => l.id === wid);
    return (L && L.name) || WORLD_NAME[wid] || wid;
  }
  function unlockCond(id) {
    const d = BY_ID[id]; if (!d) return '';
    if (d.cond.kind === 'always') return '一開始就有';
    if (d.cond.kind === 'clear') return '通關 ' + worldName(d.cond.id) + '（' + d.cond.id.toUpperCase() + '）';
    const a = (KB.PROG && KB.PROG.achDef) ? KB.PROG.achDef(d.cond.id) : null;
    return a ? ('成就「' + a.name + '」：' + a.hint) : ('成就 ' + d.cond.id);
  }

  // ---------------------------------------------------------------- 存檔
  function settings() {
    if (!KB.save) KB.save = {};
    if (!KB.save.settings) KB.save.settings = {};
    return KB.save.settings;
  }
  function current() {
    const id = settings().skin;
    if (id && BY_ID[id] && unlocked(id)) return id;
    return DEFAULT_ID;
  }

  // ---------------------------------------------------------------- 重著色
  // kirby_ 開頭才換（帽子 hat_* / 夥伴 helper_* / 敵人 / 道具都不動）
  function skinnable(name) { return typeof name === 'string' && name.lastIndexOf('kirby_', 0) === 0; }

  function variant(name, id) {
    const key = name + '@' + id;
    if (KB.SPR[key]) return key;
    if (!KB.SPR[name]) return name;                       // 缺圖交給 gfx 的洋紅方塊處理
    return KB.spriteRecolor(name, key, mapOf(id)) ? key : name;
  }

  function spr(name) {
    const id = current();
    if (id === DEFAULT_ID || !skinnable(name)) return name;
    return variant(name, id);
  }

  // HUD 卡比臉：把原圖留一份，永遠從原圖重著色，再蓋回 KB.SPR['ui_kirby_face']
  let faceOrig = null;
  function faceVariant(id) {
    if (!faceOrig) return null;
    if (id === DEFAULT_ID) return faceOrig;
    const key = FACE + '@' + id;
    if (!KB.SPR[key]) {
      const TMP = '__skin_face_src';
      KB.SPR[TMP] = faceOrig;                              // 直接塞（不進 SPR_ORDER）
      KB.spriteRecolor(TMP, key, mapOf(id));
      delete KB.SPR[TMP];
    }
    return KB.SPR[key] || faceOrig;
  }
  function syncFace() {
    if (!faceOrig) { if (!KB.SPR[FACE]) return; faceOrig = KB.SPR[FACE]; }
    const v = faceVariant(current());
    if (v) KB.SPR[FACE] = v;
    syncIcons();
  }

  // ---------------------------------------------------------------- 能力圖示（R8-P2-03）
  // HUD 左下 / 暫停能力卡 / 能力圖鑑清單畫的是 ui_ability_<key>（24×16，左半是卡比臉）與
  // ui_ability_<key>_mini（8×8 純圖示）。過去這兩組不跟配色走 ——
  // 換成「星河」時場上卡比與 HUD 右下的臉都是深紫，只有左下的能力圖示還是粉紅。
  // 作法與 HUD 臉相同：原圖留一份，永遠從原圖重著色再蓋回 KB.SPR[name]（ui.js / menu.js 都不用改）。
  // **只換卡比臉的粉色系**（p / P / l / c / m / b）；腳色 r / R 不換 ——
  // 圖示裡沒有腳，但好幾個能力圖示（火焰 / 電擊 / 血滴）用的是同一組紅色，換了會連圖示本體一起變。
  const FACE_KEYS = ['p', 'P', 'l', 'c', 'm', 'b'];
  const FACE_MAP_CACHE = {};
  function faceMapOf(id) {
    if (FACE_MAP_CACHE[id]) return FACE_MAP_CACHE[id];
    const d = BY_ID[id], m = {};
    if (d) for (const k of FACE_KEYS) if (BASE[k] && d.col[k]) m[BASE[k]] = d.col[k];
    return (FACE_MAP_CACHE[id] = m);
  }
  let iconOrig = null;                       // { 精靈名: 原始精靈 }（第一次呼叫時快照）
  function syncIcons() {
    if (!KB.SPR) return;
    if (!iconOrig) {
      iconOrig = {};
      for (const n in KB.SPR) if (n.lastIndexOf('ui_ability_', 0) === 0 && n.indexOf('@') < 0) iconOrig[n] = KB.SPR[n];
    }
    const id = current(), map = faceMapOf(id);
    for (const n in iconOrig) {
      const base = iconOrig[n];
      if (id === DEFAULT_ID) { KB.SPR[n] = base; continue; }
      const key = n + '@' + id;
      if (!KB.SPR[key]) {
        const TMP = '__skin_icon_src';
        KB.SPR[TMP] = base;                  // 直接塞（不進 SPR_ORDER）
        KB.spriteRecolor(TMP, key, map);
        delete KB.SPR[TMP];
        // 重著色版只是快取，不要灌進精靈總表（sheet 場景 / 缺圖檢查看的是 SPR_ORDER）
        const oi = KB.SPR_ORDER ? KB.SPR_ORDER.indexOf(key) : -1;
        if (oi >= 0) KB.SPR_ORDER.splice(oi, 1);
      }
      KB.SPR[n] = KB.SPR[key] || base;
    }
  }

  // ---------------------------------------------------------------- API
  const S = KB.SKINS = {
    DEFS,
    all() { return DEFS.map(d => ({ id: d.id, name: d.name, cond: unlockCond(d.id), unlocked: unlocked(d.id) })); },
    ids() { return DEFS.map(d => d.id); },
    list() { return DEFS.filter(d => unlocked(d.id)).map(d => d.id); },
    count() { return S.list().length; },
    total() { return DEFS.length; },
    current,
    unlocked,
    unlockCond,
    name(id) { const d = BY_ID[id]; return d ? d.name : ''; },
    def(id) { return BY_ID[id] || null; },
    colors(id) { const d = BY_ID[id]; return d ? Object.assign({}, BASE, d.col) : null; },
    map(id) { return BY_ID[id] ? Object.assign({}, mapOf(id)) : null; },
    set(id) {
      if (!BY_ID[id] || !unlocked(id)) return false;
      settings().skin = id;
      try { KB.saveGame && KB.saveGame(); } catch (e) { }
      syncFace();
      return true;
    },
    spr,
    refresh: syncFace,
    // 選單預覽：畫該配色的 kirby_idle（螢幕座標，錨點＝底部中央）
    drawPreview(ctx, x, y, id, opts) {
      id = (id && BY_ID[id]) ? id : current();
      const base = (opts && opts.spr) || 'kirby_idle';
      const nm = id === DEFAULT_ID ? base : variant(base, id);
      KB.drawSpr(ctx, nm, x, y, Object.assign({ frame: 0 }, opts || {}));
    },
  };

  // KB.save 在 game.js 才建立（本檔載入順序在前），所以延後一拍再套用
  function init() { try { syncFace(); } catch (e) { } }
  setTimeout(init, 0);
  if (typeof window !== 'undefined') window.addEventListener('load', init);
})();
