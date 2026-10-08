// 成就獎勵 KB.REWARDS（Round 12 / agent: K12-1 music-box）
// ============================================================================
// 40 個成就各綁一個獎勵，1 對 1（下表 DEFS 的順序＝KB.PROG.ACH 的順序）：
//   bg      ×8   標題背景皮膚（本檔原創像素風景，套用後標題畫面真的會變）
//   song    ×6   標題曲（把標題畫面的音樂換成別的原創曲）
//   mapsong ×3   選關曲
//   skin    ×8   卡比配色（直接接 KB.SKINS，條件與該配色原本的成就條件相同）
//   deco    ×10  標題裝飾（星雨 / 櫻花 / 氣球 …，疊在標題背景上）
//   pet     ×5   標題小夥伴（草地上陪卡比的小生物）
//
// 「已領」＝對應成就已解鎖（解鎖即自動獲得，不必另外領取）；「可切換」＝在成就頁按 B 套用 / 取消。
// 存檔新欄位：`KB.save.rewards = { bg, song, mapsong, deco, pet }`（配色沿用 settings.skin，由 KB.SKINS 管）。
//
// ── 對外 API ────────────────────────────────────────────────────────────────
//   KB.REWARDS.DEFS / byAch(id) / list(kind)
//   KB.REWARDS.owned(def|achId)      → 該獎勵已取得（成就已解鎖；?debug=1 全開）
//   KB.REWARDS.equipped(kind)        → 目前套用的 id（''＝預設）
//   KB.REWARDS.isOn(def)             → 這個獎勵正在使用中
//   KB.REWARDS.equip(def)            → 套用 / 取消（回 'on' | 'off' | false）
//   KB.REWARDS.state()               → KB.save.rewards（會補齊欄位）
//   KB.REWARDS.kindName(kind)        → '背景' / '標題曲' / …
//   KB.REWARDS.titleSong() / mapSong()  → 目前標題曲 / 選關曲的 SONGS key（null＝原曲）
//   KB.REWARDS.drawAch(ctx, gallery) / achUpdate(gallery)   ← menu.js 成就分頁掛進來
// ============================================================================
(function () {
  'use strict';
  const KB = window.KB;
  const W = KB.W, H = KB.H;
  const R = KB.REWARDS = KB.REWARDS || {};

  const UI = () => KB.UI || null;
  const MS = () => (KB.UI && KB.UI.MS) || 12;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const T = (ctx, s, x, y, o) => { const u = UI(); return u ? u.text(ctx, s, x, y, o) : KB.text(ctx, s, x, y, o); };
  const TW = (s, o) => { const u = UI(); return u ? u.textWidth(s, o) : KB.textWidth(s, o); };
  const fit = (ctx, s, x, y, w, o) => { const u = UI(); return u && u.fitText ? u.fitText(ctx, s, x, y, w, o) : T(ctx, s, x, y, o); };
  const hint = (a, f) => { const u = UI(); return (u && u.hint) ? u.hint(a, f) : f; };
  const unlockAll = () => (KB.UI && KB.UI.unlockAll !== undefined) ? !!KB.UI.unlockAll : !!KB.DEBUG;

  // ---------------------------------------------------------------- 獎勵定義（40 筆）
  const KINDS = R.KINDS = ['bg', 'song', 'mapsong', 'skin', 'deco', 'pet'];
  const KIND_NAME = { bg: '背景', song: '標題曲', mapsong: '選關曲', skin: '配色', deco: '裝飾', pet: '夥伴' };
  R.kindName = k => KIND_NAME[k] || String(k || '');

  // song / mapsong 的 id 直接是 KB.audio.SONGS 的 key；skin 的 id 是 KB.SKINS 的 id
  const DEFS = R.DEFS = [
    { ach: 'first_ability', kind: 'skin', id: 'yellow', name: '檸檬黃' },
    { ach: 'basic8', kind: 'bg', id: 'sunset', name: '黃昏草原' },
    { ach: 'all20', kind: 'skin', id: 'purple', name: '葡萄紫' },
    { ach: 'lv3', kind: 'skin', id: 'gold', name: '黃金' },
    { ach: 'combo10', kind: 'skin', id: 'green', name: '抹茶綠' },
    { ach: 'nohit_world', kind: 'bg', id: 'night', name: '星空之夜' },
    { ach: 'clear_w5', kind: 'skin', id: 'red', name: '蘋果紅' },
    { ach: 'arena_clear', kind: 'skin', id: 'mint', name: '薄荷' },
    { ach: 'arena_fast', kind: 'deco', id: 'meteor', name: '流星雨' },
    { ach: 'stars15', kind: 'skin', id: 'orange', name: '蜜柑橘' },
    { ach: 'secret5', kind: 'skin', id: 'white', name: '雪白' },
    { ach: 'inhale_boss', kind: 'deco', id: 'balloon', name: '氣球' },
    { ach: 'possess', kind: 'pet', id: 'ghost', name: '小幽靈' },
    { ach: 'timestop5', kind: 'deco', id: 'note', name: '音符' },
    { ach: 'mix_first', kind: 'bg', id: 'sea', name: '碧藍海岸' },
    { ach: 'helper', kind: 'pet', id: 'cloud', name: '小雲朵' },
    { ach: 'elec_water', kind: 'deco', id: 'bubble', name: '泡泡' },
    { ach: 'burn10', kind: 'deco', id: 'petal', name: '櫻花' },
    { ach: 'hp1_boss', kind: 'deco', id: 'firework', name: '煙火' },
    { ach: 'extra_clear', kind: 'mapsong', id: 'island', name: '漂浮群島' },
    { ach: 'mix12', kind: 'deco', id: 'star', name: '星雨' },
    { ach: 'mix24', kind: 'song', id: 'dedede', name: '迪迪迪城' },
    { ach: 'awaken_first', kind: 'bg', id: 'cave', name: '水晶洞窟' },
    { ach: 'awaken10', kind: 'deco', id: 'rainbow', name: '彩虹' },
    { ach: 'awaken_boss', kind: 'song', id: 'boss', name: '魔王登場' },
    { ach: 'lv4_any', kind: 'mapsong', id: 'cloud', name: '泡泡雲海' },
    { ach: 'lv4_five', kind: 'pet', id: 'apple', name: '小蘋果' },
    { ach: 'helper_two', kind: 'pet', id: 'bird', name: '小鳥' },
    { ach: 'union', kind: 'deco', id: 'snow', name: '雪花' },
    { ach: 'helper_kill20', kind: 'pet', id: 'star', name: '小星星' },
    { ach: 'elem_all', kind: 'deco', id: 'leaf', name: '楓葉' },
    { ach: 'rank_s', kind: 'song', id: 'green', name: '翠綠草原' },
    { ach: 'clear_w6', kind: 'bg', id: 'space', name: '深邃宇宙' },
    { ach: 'clear_w7', kind: 'bg', id: 'dream', name: '夢之迴廊' },
    { ach: 'extra_all', kind: 'bg', id: 'candy', name: '糖果樂園' },
    { ach: 'arena6', kind: 'song', id: 'arena', name: '競技場' },
    { ach: 'stars21', kind: 'song', id: 'space', name: '星之彼端' },
    { ach: 'secret7', kind: 'mapsong', id: 'dream', name: '夢幻迴廊' },
    { ach: 'nohit_boss', kind: 'song', id: 'trueend', name: '真實結局' },
    { ach: 'ach20', kind: 'bg', id: 'snow', name: '雪之原野' },
  ];
  const BY_ACH = {};
  for (const d of DEFS) BY_ACH[d.ach] = d;
  R.byAch = id => BY_ACH[id] || null;
  R.list = kind => DEFS.filter(d => d.kind === kind);
  R.find = (kind, id) => DEFS.find(d => d.kind === kind && d.id === id) || null;

  // ---------------------------------------------------------------- 存檔 / 套用
  function state() {
    const s = KB.save = KB.save || {};
    if (!s.rewards || typeof s.rewards !== 'object') s.rewards = {};
    for (const k of KINDS) if (typeof s.rewards[k] !== 'string') s.rewards[k] = '';
    return s.rewards;
  }
  R.state = state;
  const store = () => { try { KB.saveGame && KB.saveGame(); } catch (e) { } };

  R.owned = function (d) {
    if (typeof d === 'string') d = BY_ACH[d];
    if (!d) return false;
    if (unlockAll()) return true;
    try { return !!(KB.PROG && KB.PROG.has && KB.PROG.has(d.ach)); } catch (e) { return false; }
  };
  /** 目前套用的 id（''＝預設）；配色走 KB.SKINS */
  R.equipped = function (kind) {
    if (kind === 'skin') {
      try {
        const S = KB.SKINS; if (!S || !S.current) return '';
        let c = S.current(); c = (c && typeof c === 'object') ? (c.id || c.key) : c;
        return (c && c !== 'pink') ? String(c) : '';
      } catch (e) { return ''; }
    }
    return state()[kind] || '';
  };
  R.isOn = function (d) { return !!d && R.equipped(d.kind) === d.id; };
  /** 套用 / 取消；回 'on' | 'off' | false（未取得 / 失敗） */
  R.equip = function (d) {
    if (typeof d === 'string') d = BY_ACH[d];
    if (!d || !R.owned(d)) return false;
    const on = R.isOn(d);
    if (d.kind === 'skin') {
      try {
        const S = KB.SKINS; if (!S || !S.set) return false;
        if (!S.set(on ? 'pink' : d.id)) return false;
      } catch (e) { return false; }
      return on ? 'off' : 'on';
    }
    const st = state();
    st[d.kind] = on ? '' : d.id;
    store();
    return on ? 'off' : 'on';
  };
  R.titleSong = function () { const k = R.equipped('song'); return k || null; };
  R.mapSong = function () { const k = R.equipped('mapsong'); return k || null; };
  /** 已取得 / 已套用的統計（成就頁標題列） */
  R.ownedCount = () => DEFS.filter(d => R.owned(d)).length;
  R.onCount = () => DEFS.filter(d => R.isOn(d)).length;

  // ---------------------------------------------------------------- 標題背景皮膚（原創像素風）
  const rnd = (i, s) => { let x = Math.sin((i + 1) * 127.1 + (s || 0) * 311.7) * 43758.5453; return x - Math.floor(x); };
  function bands(ctx, y0, y1, cols) {
    const n = cols.length, h = (y1 - y0) / n;
    for (let i = 0; i < n; i++) KB.rect(ctx, 0, Math.round(y0 + i * h), W, Math.ceil(h) + 1, cols[i]);
  }
  function stars(ctx, n, t, seed, y1, cols) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd(i, seed) * W), y = Math.floor(rnd(i, seed + 7) * y1);
      const tw = (Math.sin(t * 2.2 + i) > (i % 3 === 0 ? 0.2 : -0.4));
      if (!tw) continue;
      const c = cols[i % cols.length];
      KB.rect(ctx, x, y, 1, 1, c);
      if (i % 5 === 0) { KB.rect(ctx, x - 1, y, 3, 1, c); KB.rect(ctx, x, y - 1, 1, 3, c); }
    }
  }
  function hills(ctx, baseY, cols) {
    // 三層圓丘剪影
    const sets = [[-10, 60, 46], [70, 72, 54], [170, 66, 44], [230, 58, 40]];
    for (let l = 0; l < cols.length; l++) {
      const off = l * 10, col = cols[l];
      for (const s of sets) KB.circle(ctx, s[0] + off * 2, baseY + off + 8, s[1] - off * 3, col);
    }
  }

  const BGS = {
    // 黃昏草原：橘紅漸層 + 落日 + 剪影丘 + 草地
    sunset(ctx, t) {
      bands(ctx, 0, 150, ['#3c2060', '#6c2860', '#a83c58', '#d8604c', '#f08c50', '#f8b868']);
      const sy = 84 + Math.round(Math.sin(t * 0.3) * 2);                 // 落日：要在剪影丘之上才看得到
      KB.circle(ctx, 196, sy, 20, '#fff0a0'); KB.circle(ctx, 196, sy, 15, '#fffce0');
      for (let i = 0; i < 6; i++) KB.rect(ctx, 0, 96 + i * 9, W, 2, 'rgba(255,200,120,0.18)');
      hills(ctx, 150, ['#78406c', '#4c2c58']);
      KB.rect(ctx, 0, 146, W, 5, '#c87848'); KB.rect(ctx, 0, 151, W, 2, '#8c4c28'); KB.rect(ctx, 0, 153, W, 71, '#6c3c28');
      for (let x = 4; x < W; x += 11) KB.rect(ctx, x, 158 + ((x * 7) % 18), 2, 2, '#50301c');
      for (let x = 6; x < W; x += 19) { KB.rect(ctx, x, 142, 1, 4, '#f0a860'); KB.rect(ctx, x + 3, 143, 1, 3, '#f0a860'); }
    },
    // 星空之夜：深藍 + 星 + 月 + 螢火
    night(ctx, t) {
      bands(ctx, 0, 150, ['#080c28', '#101840', '#1c2458', '#283070', '#384088']);
      stars(ctx, 70, t, 3, 140, ['#ffffff', '#c8d8ff', '#ffe8a0']);
      KB.circle(ctx, 206, 34, 16, '#f8f4d0'); KB.circle(ctx, 214, 30, 13, '#101840');
      hills(ctx, 150, ['#1c2448', '#101830']);
      KB.rect(ctx, 0, 146, W, 5, '#2c4c48'); KB.rect(ctx, 0, 151, W, 2, '#14282c'); KB.rect(ctx, 0, 153, W, 71, '#101c24');
      for (let i = 0; i < 9; i++) {
        const x = 20 + ((i * 29) % 220) + Math.round(Math.sin(t * 1.1 + i) * 6);
        const y = 110 + Math.round(Math.cos(t * 0.9 + i * 2) * 14);
        if (((Math.sin(t * 3 + i * 1.7) > -0.2))) { KB.rect(ctx, x, y, 2, 2, '#d8ff80'); KB.rect(ctx, x - 1, y - 1, 4, 4, 'rgba(200,255,120,0.18)'); }
      }
    },
    // 碧藍海岸：天空 + 海平線 + 波浪 + 沙灘
    sea(ctx, t) {
      bands(ctx, 0, 92, ['#2860b8', '#3c80d4', '#58a0e8', '#88c8f4']);
      KB.circle(ctx, 40, 26, 12, '#fff8c0');
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 73 + Math.round(t * 5)) % (W + 70)) - 35;
        KB.circle(ctx, cx, 24 + i * 7, 11, '#eaf4ff'); KB.circle(ctx, cx + 12, 26 + i * 7, 8, '#eaf4ff');
      }
      bands(ctx, 92, 156, ['#1c4c90', '#2060a8', '#2878c0', '#3890d4', '#58a8e0']);
      for (let r = 0; r < 7; r++) {
        const y = 96 + r * 8, ph = t * (1.2 + r * 0.25);
        for (let x = (r % 2 ? 6 : 0); x < W; x += 16) {
          const dx = Math.round(Math.sin(ph + x * 0.07) * 3);
          KB.rect(ctx, x + dx, y, 7, 1, 'rgba(220,245,255,0.5)');
        }
      }
      KB.rect(ctx, 0, 156, W, 4, '#f0dca0'); KB.rect(ctx, 0, 160, W, 64, '#e0c484');
      for (let x = 2; x < W; x += 7) KB.rect(ctx, x, 164 + ((x * 11) % 24), 2, 1, '#c8a868');
    },
    // 水晶洞窟：岩壁 + 鐘乳石 + 發光水晶 + 水面反光
    cave(ctx, t) {
      bands(ctx, 0, 150, ['#100c20', '#181430', '#201c40', '#282450']);
      for (let i = 0; i < 16; i++) {
        const x = i * 17 + 2, h = 14 + Math.floor(rnd(i, 11) * 30);
        for (let y = 0; y < h; y++) KB.rect(ctx, x + Math.floor(y * 0.12), y, Math.max(1, 9 - Math.floor(y * 0.5)), 1, '#2c2850');
      }
      for (let i = 0; i < 11; i++) {
        const x = 8 + i * 23, y = 96 + Math.floor(rnd(i, 5) * 34), s = 5 + Math.floor(rnd(i, 9) * 7);
        const bright = 0.45 + 0.35 * Math.sin(t * 1.6 + i);
        const col = i % 3 === 0 ? '#80e0ff' : (i % 3 === 1 ? '#c8a0f0' : '#80ffc0');
        for (let k = 0; k < s; k++) KB.rect(ctx, x - Math.floor((s - k) / 2), y + s - k, s - k, 1, col);
        KB.rect(ctx, x - s, y + 1, s * 2, s + 2, 'rgba(160,220,255,' + Math.max(0, bright * 0.14).toFixed(2) + ')');
      }
      KB.rect(ctx, 0, 146, W, 5, '#3c3868'); KB.rect(ctx, 0, 151, W, 73, '#141028');
      for (let x = 0; x < W; x += 2) KB.rect(ctx, x, 154 + Math.round(Math.sin(t * 1.4 + x * 0.12) * 1.5), 2, 1, 'rgba(128,224,255,0.22)');
    },
    // 深邃宇宙：星域 + 星雲 + 行星 + 環
    space(ctx, t) {
      KB.rect(ctx, 0, 0, W, H, '#05050e');
      for (let i = 0; i < 36; i++) {
        const x = Math.floor(rnd(i, 21) * W), y = Math.floor(rnd(i, 33) * 150), r = 10 + Math.floor(rnd(i, 41) * 22);
        KB.circle(ctx, x, y, r, i % 2 ? 'rgba(80,40,140,0.07)' : 'rgba(40,80,160,0.07)');
      }
      stars(ctx, 90, t, 17, 150, ['#ffffff', '#a0c0ff', '#ffc8e8', '#fff0a0']);
      KB.circle(ctx, 60, 118, 30, '#4c3c90'); KB.circle(ctx, 54, 112, 24, '#7058c0'); KB.circle(ctx, 48, 106, 13, '#a890e8');
      for (let i = -34; i <= 34; i++) {
        const y = 118 + Math.round(i * 0.22);
        KB.rect(ctx, 60 + i, y + 10, 2, 1, Math.abs(i) > 30 ? '#6c5ca8' : '#c0a8f0');
      }
      KB.circle(ctx, 214, 60, 11, '#2c6c70'); KB.circle(ctx, 211, 57, 8, '#48a0a0');
      KB.rect(ctx, 0, 150, W, 74, '#07071a');
      for (let x = 0; x < W; x += 3) KB.rect(ctx, x, 150 + ((x * 5) % 9), 1, 1, 'rgba(160,180,255,0.3)');
    },
    // 夢之迴廊：粉紫漸層 + 漂浮拱門 + 光點
    dream(ctx, t) {
      bands(ctx, 0, 160, ['#2c1c58', '#48286c', '#6c3880', '#985494', '#c078a8', '#e8a0c0']);
      for (let i = 0; i < 5; i++) {
        const cx = 24 + i * 52, bob = Math.round(Math.sin(t * 0.8 + i) * 4), top = 44 + bob, hgt = 80 - i % 2 * 12;
        KB.rect(ctx, cx - 10, top + 10, 4, hgt, 'rgba(255,215,245,0.35)');
        KB.rect(ctx, cx + 8, top + 10, 4, hgt, 'rgba(255,215,245,0.35)');
        for (let a = 0; a <= 10; a++) {
          const an = Math.PI * a / 10, px = cx + Math.round(Math.cos(an) * -11), py = top + 10 - Math.round(Math.sin(an) * 11);
          KB.rect(ctx, px - 1, py, 4, 2, 'rgba(255,235,255,0.5)');
        }
      }
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rnd(i, 55) * W), y = 20 + ((Math.floor(rnd(i, 61) * 130) + Math.round(t * 7)) % 130);
        KB.rect(ctx, x, y, 2, 2, 'rgba(255,255,255,0.75)');
      }
      KB.rect(ctx, 0, 156, W, 6, '#f0b8d8'); KB.rect(ctx, 0, 162, W, 62, '#a06090');
    },
    // 糖果樂園：粉色斜紋 + 棒棒糖 + 奶油雲
    candy(ctx, t) {
      bands(ctx, 0, 150, ['#ffd8e8', '#ffc0dc', '#ffa8d0', '#ff90c4']);
      for (let i = -40; i < 70; i++) {
        const x = i * 10 + Math.round(t * 6) % 20;
        for (let y = 0; y < 150; y += 1) { const px = x + Math.floor(y * 0.5); if (px >= 0 && px < W) KB.rect(ctx, px, y, 5, 1, 'rgba(255,255,255,0.14)'); }
      }
      for (let i = 0; i < 4; i++) {
        const cx = 34 + i * 62, cy = 108 + (i % 2) * 10, bob = Math.round(Math.sin(t * 1.1 + i) * 2);
        KB.rect(ctx, cx - 1, cy + 8 + bob, 3, 40, '#fff0d8');
        const col = ['#ff6090', '#80d8f0', '#ffe060', '#a0f080'][i];
        KB.circle(ctx, cx, cy + bob, 11, '#fff8f0'); KB.circle(ctx, cx, cy + bob, 9, col);
        for (let a = 0; a < 5; a++) KB.rect(ctx, cx - 8 + a * 4, cy - 8 + bob, 2, 16, 'rgba(255,255,255,0.8)');
      }
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 71 + Math.round(t * 4)) % (W + 60)) - 30, cy = 22 + i * 9;
        KB.circle(ctx, cx, cy, 12, '#fffaf0'); KB.circle(ctx, cx + 13, cy + 3, 9, '#fffaf0'); KB.circle(ctx, cx - 11, cy + 4, 8, '#fffaf0');
      }
      KB.rect(ctx, 0, 146, W, 5, '#ff8cc0'); KB.rect(ctx, 0, 151, W, 73, '#e05c98');
      for (let x = 3; x < W; x += 9) KB.rect(ctx, x, 156 + ((x * 7) % 16), 2, 2, '#ffd0e4');
    },
    // 雪之原野：灰藍天 + 飄雪 + 雪丘 + 冷杉
    snow(ctx, t) {
      bands(ctx, 0, 150, ['#5068a0', '#6880b8', '#88a0cc', '#b0c4e0', '#d8e4f4']);
      hills(ctx, 150, ['#e8f0fc', '#ffffff']);
      for (let i = 0; i < 7; i++) {
        const x = 16 + i * 36, by = 142 - (i % 3) * 4;
        for (let k = 0; k < 4; k++) {
          const wk = 13 - k * 3;
          KB.rect(ctx, x - wk, by - 10 - k * 9, wk * 2, 9, '#1c5848');
          KB.rect(ctx, x - wk, by - 10 - k * 9, wk * 2, 2, '#f0f8ff');
        }
        KB.rect(ctx, x - 2, by - 6, 4, 8, '#4c3824');
      }
      KB.rect(ctx, 0, 146, W, 6, '#ffffff'); KB.rect(ctx, 0, 152, W, 72, '#e0ecfc');
      for (let i = 0; i < 44; i++) {
        const x = (Math.floor(rnd(i, 71) * W) + Math.round(Math.sin(t * 0.7 + i) * 8)) % W;
        const y = (Math.floor(rnd(i, 77) * 200) + Math.round(t * 22)) % 200;
        KB.rect(ctx, x, y, i % 4 ? 1 : 2, i % 4 ? 1 : 2, '#ffffff');
      }
    },
  };
  R.BGS = BGS;

  // ---------------------------------------------------------------- 標題裝飾（10 種粒子）
  const DECOS = {
    star(ctx, t) {
      for (let i = 0; i < 20; i++) {
        const x = (Math.floor(rnd(i, 3) * W) + Math.round(Math.sin(t + i) * 10)) % W;
        const y = (Math.floor(rnd(i, 9) * 200) + Math.round(t * 26)) % 200;
        const c = ['#ffe040', '#fff8c0', '#ffb0d0'][i % 3];
        KB.rect(ctx, x, y - 2, 1, 5, c); KB.rect(ctx, x - 2, y, 5, 1, c); KB.rect(ctx, x - 1, y - 1, 3, 3, c);
      }
    },
    petal(ctx, t) {
      for (let i = 0; i < 24; i++) {
        const x = (Math.floor(rnd(i, 13) * W) + Math.round(Math.sin(t * 0.9 + i) * 14)) % W;
        const y = (Math.floor(rnd(i, 19) * 200) + Math.round(t * 17)) % 200;
        KB.rect(ctx, x, y, 3, 2, '#ffc0dc'); KB.rect(ctx, x + 1, y - 1, 2, 2, '#ff90c0');
      }
    },
    balloon(ctx, t) {
      const cols = ['#ff6080', '#60c0ff', '#ffe060', '#90e880', '#c890ff'];
      for (let i = 0; i < 7; i++) {
        const x = 14 + ((i * 41) % 230) + Math.round(Math.sin(t * 0.6 + i) * 7);
        const y = 190 - ((Math.round(t * 11) + i * 31) % 220);
        KB.circle(ctx, x, y, 6, cols[i % cols.length]); KB.circle(ctx, x - 2, y - 2, 2, '#ffffff');
        KB.rect(ctx, x, y + 6, 1, 9, '#f0e8d0');
      }
    },
    bubble(ctx, t) {
      for (let i = 0; i < 20; i++) {
        const x = 6 + ((i * 37) % 244) + Math.round(Math.sin(t * 1.3 + i) * 5);
        const y = 200 - ((Math.round(t * 19) + i * 23) % 220);
        const r = 2 + (i % 4);
        KB.circle(ctx, x, y, r, 'rgba(200,240,255,0.42)');
        KB.rect(ctx, x - r + 1, y - r + 1, 1, 1, '#ffffff');
      }
    },
    note(ctx, t) {
      for (let i = 0; i < 14; i++) {
        const x = 10 + ((i * 47) % 236) + Math.round(Math.sin(t * 1.5 + i) * 9);
        const y = 200 - ((Math.round(t * 15) + i * 29) % 220);
        const c = ['#80e0ff', '#ffe040', '#ffb0d0'][i % 3];
        KB.rect(ctx, x, y + 3, 4, 3, c); KB.rect(ctx, x + 3, y - 3, 1, 7, c); KB.rect(ctx, x + 4, y - 3, 3, 2, c);
      }
    },
    meteor(ctx, t) {
      for (let i = 0; i < 6; i++) {
        const p = (t * 46 + i * 55) % 320;
        const x = 280 - p, y = p * 0.55 - 20 + i * 18;
        if (y < -6 || y > 180) continue;
        for (let k = 0; k < 14; k++) KB.rect(ctx, x + k, y - Math.floor(k * 0.55), 1, 1, k < 4 ? '#ffffff' : 'rgba(200,220,255,' + (1 - k / 14).toFixed(2) + ')');
        KB.rect(ctx, x - 1, y, 3, 2, '#fff8c0');
      }
    },
    snow(ctx, t) {
      for (let i = 0; i < 40; i++) {
        const x = (Math.floor(rnd(i, 23) * W) + Math.round(Math.sin(t * 0.8 + i) * 7)) % W;
        const y = (Math.floor(rnd(i, 29) * 210) + Math.round(t * 20)) % 210;
        KB.rect(ctx, x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2, '#ffffff');
      }
    },
    leaf(ctx, t) {
      for (let i = 0; i < 18; i++) {
        const x = (Math.floor(rnd(i, 31) * W) + Math.round(Math.sin(t * 1.1 + i * 2) * 16)) % W;
        const y = (Math.floor(rnd(i, 37) * 200) + Math.round(t * 15)) % 200;
        const c = ['#f08030', '#e85c28', '#f0b038'][i % 3];
        KB.rect(ctx, x, y, 4, 1, c); KB.rect(ctx, x + 1, y - 1, 2, 3, c); KB.rect(ctx, x + 4, y + 1, 2, 1, '#8c5020');
      }
    },
    rainbow(ctx) {
      const cols = ['#ff6060', '#ff9c40', '#ffe040', '#70e060', '#50b0f0', '#9060e0'];
      for (let i = 0; i < cols.length; i++) {
        const r = 150 - i * 5;
        for (let a = 0; a <= 48; a++) {
          const an = Math.PI * a / 48;
          KB.rect(ctx, 128 + Math.round(Math.cos(an) * r), 176 - Math.round(Math.sin(an) * r), 3, 3, cols[i]);
        }
      }
    },
    firework(ctx, t) {
      for (let i = 0; i < 3; i++) {
        const cyc = (t * 0.55 + i * 0.37) % 1;
        const cx = 40 + ((i * 97) % 180), cy = 36 + (i % 2) * 28;
        const c = ['#ffe040', '#80e0ff', '#ff90c0'][i];
        if (cyc < 0.3) { KB.rect(ctx, cx, 180 - Math.round(cyc / 0.3 * (180 - cy)), 2, 4, c); continue; }
        const u = (cyc - 0.3) / 0.7, r = Math.round(u * 26);
        for (let a = 0; a < 14; a++) {
          const an = Math.PI * 2 * a / 14;
          KB.rect(ctx, cx + Math.round(Math.cos(an) * r), cy + Math.round(Math.sin(an) * r), 2, 2,
            u > 0.75 ? 'rgba(255,255,255,' + (1 - u).toFixed(2) + ')' : c);
        }
      }
    },
  };
  R.DECOS = DECOS;

  // ---------------------------------------------------------------- 標題小夥伴（5 種）
  // 畫在草地左側（卡比在 x=56，選單面板從 x=112 起 ⇒ 90 這個位置兩邊都不壓）
  const PETS = {
    star(ctx, t, x, y) {
      const b = Math.round(Math.abs(Math.sin(t * 3.1)) * 7);
      const cx = x, cy = y - 8 - b;
      KB.rect(ctx, cx - 1, cy - 6, 3, 13, '#ffe040'); KB.rect(ctx, cx - 6, cy - 1, 13, 3, '#ffe040');
      KB.rect(ctx, cx - 4, cy - 4, 9, 9, '#ffe040'); KB.rect(ctx, cx - 3, cy - 3, 7, 7, '#fff8a0');
      KB.rect(ctx, cx - 2, cy - 1, 1, 2, '#403000'); KB.rect(ctx, cx + 1, cy - 1, 1, 2, '#403000');
    },
    cloud(ctx, t, x, y) {
      const b = Math.round(Math.sin(t * 1.7) * 3), cx = x, cy = y - 16 + b;
      KB.circle(ctx, cx, cy, 7, '#ffffff'); KB.circle(ctx, cx + 6, cy + 2, 5, '#ffffff'); KB.circle(ctx, cx - 6, cy + 2, 5, '#f0f4ff');
      KB.rect(ctx, cx - 3, cy - 1, 1, 2, '#6c7c98'); KB.rect(ctx, cx + 2, cy - 1, 1, 2, '#6c7c98');
      KB.rect(ctx, cx - 1, cy + 2, 3, 1, '#98a8c0');
      for (let i = 0; i < 3; i++) if (((t * 3 | 0) + i) % 4 === 0) KB.rect(ctx, cx - 4 + i * 4, cy + 8, 1, 3, '#a0d0f0');
    },
    bird(ctx, t, x, y) {
      const fl = Math.sin(t * 7) > 0, cy = y - 20 + Math.round(Math.sin(t * 1.3) * 4), cx = x;
      KB.circle(ctx, cx, cy, 5, '#70c8f0'); KB.circle(ctx, cx + 4, cy - 3, 3, '#70c8f0');
      KB.rect(ctx, cx + 6, cy - 3, 3, 2, '#ffc040');
      KB.rect(ctx, cx + 4, cy - 4, 1, 1, '#102028');
      if (fl) { KB.rect(ctx, cx - 6, cy - 6, 9, 2, '#48a0d8'); KB.rect(ctx, cx - 4, cy - 8, 6, 2, '#48a0d8'); }
      else { KB.rect(ctx, cx - 7, cy + 2, 9, 2, '#48a0d8'); KB.rect(ctx, cx - 5, cy + 4, 6, 2, '#48a0d8'); }
      KB.rect(ctx, cx - 1, cy + 5, 1, 3, '#ffc040'); KB.rect(ctx, cx + 2, cy + 5, 1, 3, '#ffc040');
    },
    ghost(ctx, t, x, y) {
      const cy = y - 18 + Math.round(Math.sin(t * 1.9) * 5), cx = x;
      const a = 0.62 + 0.18 * Math.sin(t * 2.6);
      KB.circle(ctx, cx, cy, 7, 'rgba(216,224,255,' + a.toFixed(2) + ')');
      KB.rect(ctx, cx - 7, cy, 14, 8, 'rgba(216,224,255,' + a.toFixed(2) + ')');
      for (let i = 0; i < 4; i++) KB.rect(ctx, cx - 7 + i * 4, cy + 8, 3, 1 + (i % 2) * 2, 'rgba(216,224,255,' + a.toFixed(2) + ')');
      KB.rect(ctx, cx - 3, cy - 2, 2, 3, '#303858'); KB.rect(ctx, cx + 2, cy - 2, 2, 3, '#303858');
      KB.rect(ctx, cx - 1, cy + 3, 3, 2, '#6c5068');
    },
    apple(ctx, t, x, y) {
      const b = Math.round(Math.abs(Math.sin(t * 2.4)) * 4), cx = x, cy = y - 7 - b;
      KB.circle(ctx, cx, cy, 7, '#e83050'); KB.circle(ctx, cx - 2, cy - 2, 3, '#ff7080');
      KB.rect(ctx, cx, cy - 10, 2, 5, '#6c4420'); KB.rect(ctx, cx + 2, cy - 11, 5, 3, '#50a040');
      KB.rect(ctx, cx - 4, cy + 1, 1, 2, '#601020'); KB.rect(ctx, cx + 3, cy + 1, 1, 2, '#601020');
      KB.rect(ctx, cx - 1, cy + 4, 3, 1, '#a01830');
    },
  };
  R.PETS = PETS;

  // ---------------------------------------------------------------- 套用到標題畫面
  // KB.BG.title 由 src/art/backgrounds.js 提供 ⇒ 包一層：有背景皮膚就改畫皮膚，接著疊裝飾與小夥伴
  try {
    KB.BG = KB.BG || {};
    const origTitle = KB.BG.title;
    R.origTitleBg = origTitle || null;
    KB.BG.title = function (ctx, camX, camY, t) {
      t = t || 0;
      const bg = R.equipped('bg');
      const f = bg && BGS[bg];
      if (f) { try { f(ctx, t); } catch (e) { if (origTitle) origTitle.call(KB.BG, ctx, camX, camY, t); } }
      else if (origTitle) origTitle.call(KB.BG, ctx, camX, camY, t);
      else KB.rect(ctx, 0, 0, W, H, '#3c78d8');
      const dk = R.equipped('deco'), df = dk && DECOS[dk];
      if (df) { try { df(ctx, t); } catch (e) { } }
      const pk = R.equipped('pet'), pf = pk && PETS[pk];
      if (pf) { try { pf(ctx, t, 90, 147); } catch (e) { } }
    };
    KB.BG.title.__rewards = true;
  } catch (e) { }

  // 標題曲 / 選關曲替換：包一層 KB.audio.music()
  //   musicbox.js 的「聽過即解鎖」包層在更內側 ⇒ 記到的是實際播出來的那一首。
  //   音樂盒自己播放時（KB.MUSICBOX.rawPlay）不替換，才聽得到原本的「星之序曲」。
  try {
    if (KB.audio && typeof KB.audio.music === 'function' && !KB.audio.__rewardHook) {
      const orig = KB.audio.music.bind(KB.audio);
      KB.audio.music = function (key) {
        try {
          if (!(KB.MUSICBOX && KB.MUSICBOX.rawPlay)) {
            if (key === 'title') { const k = R.titleSong(); if (k && KB.audio.SONGS && KB.audio.SONGS[k]) key = k; }
            else if (key === 'select') { const k = R.mapSong(); if (k && KB.audio.SONGS && KB.audio.SONGS[k]) key = k; }
          }
        } catch (e) { }
        return orig(key);
      };
      KB.audio.__rewardHook = true;
    }
  } catch (e) { }

  /** 成就解鎖時由 progression.js 呼叫：記一個「有新獎勵」的旗標（標題選單閃 NEW!） */
  R.onUnlock = function (id) {
    const d = BY_ACH[id];
    if (!d) return false;
    R.newFlag = true;
    return true;
  };
  R.newFlag = false;
  R.clearNew = function () { R.newFlag = false; };

  // ---------------------------------------------------------------- 成就頁（menu.js 的成就分頁掛進來）
  // 版面：清單 9 列 ×15px（獎盃 + 成就名 + 獎勵名 + CLEAR/鎖）＋詳情兩行（條件 / 獎勵狀態）＋頁碼
  const PER_PAGE = R.PER_PAGE = 9;
  const ROW_H = 15, TOP = 27;
  const achList = () => (KB.PROG && KB.PROG.ACH) || [];
  R.pages = () => Math.max(1, Math.ceil((achList().length || 1) / PER_PAGE));

  /** 成就分頁的輸入（回 null 繼續 / 'back' 離開；menu.js 在 tab===1 時優先呼叫） */
  R.achUpdate = function (g) {
    const inp = KB.input;
    if (!inp) return undefined;
    const list = achList(), n = list.length || 1, pg = R.pages();
    if (g.ai === undefined || g.ai === null) g.ai = 0;
    if (g.ap === undefined || g.ap === null) g.ap = 0;
    if (inp.pressed('select')) { g.tab = g.tab ? 0 : 1; sfx('menu'); return null; }
    if (inp.pressed('start') || inp.pressed('jump')) { sfx('menu_back'); return 'back'; }
    if (inp.pressed('attack')) {
      const cur = list[Math.min(g.ai, n - 1)];
      const d = cur && BY_ACH[cur.id];
      const r = d ? R.equip(d) : false;
      sfx(r ? 'select' : 'menu_back');
      g.rewardMsg = r ? (r === 'on' ? '已套用　' + d.name : '已取消　' + d.name) : null;
      g.rewardMsgT = r ? 90 : 0;
      return null;
    }
    if (inp.pressed('right')) { g.ap = (g.ap + 1) % pg; g.ai = Math.min(n - 1, g.ap * PER_PAGE); sfx('menu'); return null; }
    if (inp.pressed('left')) { g.ap = (g.ap - 1 + pg) % pg; g.ai = Math.min(n - 1, g.ap * PER_PAGE); sfx('menu'); return null; }
    if (inp.pressed('down')) { g.ai = (g.ai + 1) % n; g.ap = Math.floor(g.ai / PER_PAGE); sfx('menu'); return null; }
    if (inp.pressed('up')) { g.ai = (g.ai - 1 + n) % n; g.ap = Math.floor(g.ai / PER_PAGE); sfx('menu'); return null; }
    return null;
  };

  /** 成就分頁的繪製（回 true＝已接手；menu.js 的原版就不畫） */
  R.drawAch = function (ctx, g) {
    const u = UI(); if (!u) return false;
    const C = u.C || {}, ms = MS(), PG = KB.PROG;
    const list = achList(), total = list.length;
    if (!total) return false;
    const got = (PG && PG.achCount) ? PG.achCount() : 0;
    KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)');
    u.panel(ctx, 4, 4, 248, 210);
    if (g.drawTabs) g.drawTabs(ctx);
    T(ctx, '達成 ' + got + '/' + total, 242, 8, { color: got >= total ? (C.yellow || '#ffe040') : '#8fa0bc', align: 'right', size: ms });
    KB.rect(ctx, 14, 23, 228, 1, '#405070');
    if (g.ai >= total) g.ai = total - 1;
    if (g.ai < 0) g.ai = 0;
    g.ap = Math.max(0, Math.min(R.pages() - 1, Math.floor(g.ai / PER_PAGE)));
    const p0 = g.ap * PER_PAGE;
    for (let k = 0; k < PER_PAGE; k++) {
      const idx = p0 + k, a = list[idx]; if (!a) break;
      const y = TOP + k * ROW_H, ok = !!(PG && PG.has && PG.has(a.id)), sel = idx === g.ai;
      KB.rect(ctx, 12, y - 1, 232, ROW_H - 1, sel ? 'rgba(72,60,120,0.85)' : (ok ? 'rgba(44,36,80,0.65)' : 'rgba(20,26,44,0.5)'));
      if (sel) { KB.rect(ctx, 12, y - 1, 1, ROW_H - 1, C.yellow || '#ffe040'); KB.rect(ctx, 243, y - 1, 1, ROW_H - 1, C.yellow || '#ffe040'); }
      if (PG && PG.drawTrophy) PG.drawTrophy(ctx, 16, y + 2, ok ? (C.yellow || '#ffe040') : '#3c465c');
      u.fitText(ctx, a.name, 30, y, 76, { color: ok ? (C.yellow || '#ffe040') : '#6c7c98', size: ms });
      // 獎勵欄：已套用 → 綠底小方塊 + 綠字；已取得 → 青字；未取得 → 深灰
      const d = BY_ACH[a.id];
      if (d) {
        const own = R.owned(d), on = R.isOn(d);
        if (on) KB.rect(ctx, 108, y + 3, 4, 4, '#80e0a0');
        u.fitText(ctx, own ? d.name : '？？？', 115, y, 72,
          { color: on ? '#80e0a0' : (own ? (C.cyan || '#80e0ff') : '#4c5670'), size: ms });
      }
      if (ok) KB.text(ctx, 'CLEAR', 240, y + 3, { color: '#80e0a0', align: 'right' });
      else if (!u.sprAt(ctx, 'uifb_lock', 234, y + 1, 'tl')) KB.text(ctx, '-', 240, y + 3, { color: '#4c5670', align: 'right' });
    }
    // 詳情：第 1 行＝成就條件 + 解鎖時間、第 2 行＝獎勵種類 / 名稱 + 狀態
    const cur = list[g.ai], okc = !!(cur && PG && PG.has && PG.has(cur.id));
    const dy = TOP + PER_PAGE * ROW_H + 2;
    KB.rect(ctx, 12, dy, 232, 1, '#405070');
    if (cur) {
      u.fitText(ctx, cur.hint, 14, dy + 3, 168, { color: okc ? '#c8d8f0' : '#8fa0bc', size: ms });
      const ts = okc && PG.achTimeStr ? PG.achTimeStr(cur.id) : '';
      KB.text(ctx, okc ? (ts || 'UNLOCKED') : 'LOCKED', 242, dy + 5, { color: okc ? '#80e0a0' : '#5c6884', align: 'right' });
      const d = BY_ACH[cur.id];
      const y2 = dy + 18;
      if (g.rewardMsgT > 0) { g.rewardMsgT--; u.fitText(ctx, g.rewardMsg || '', 14, y2, 228, { color: '#ffe040', size: ms }); }
      else if (d) {
        const own = R.owned(d), on = R.isOn(d);
        // fix12（R12-P3-05）：?debug=1（UI.unlockAll）時 owned() 一律回 true，但成就列仍照存檔畫成
        //   LOCKED ⇒ 會出現「達成 0/40 + 已領・可切換」這種前後不一的畫面。成就本身沒解鎖就改標「debug 全開」。
        const dbg = own && !okc;
        u.fitText(ctx, '獎勵　' + R.kindName(d.kind) + '　' + (own ? d.name : '？？？'), 14, y2, 150,
          { color: own ? '#c8d8f0' : '#6c7c98', size: ms });
        T(ctx, on ? '使用中' : (dbg ? 'debug 全開' : (own ? '已領・可切換' : '未取得')), 242, y2,
          { color: on ? '#80e0a0' : (dbg ? '#ffa060' : (own ? (C.cyan || '#80e0ff') : '#5c6884')), align: 'right', size: ms });
      } else u.fitText(ctx, '（這個成就沒有附帶獎勵）', 14, y2, 228, { color: '#6c7c98', size: ms });
    }
    // 這行最寬（觸控時方向鍵變「方向鍵」三個字）⇒ 不放全形空白、寬度放到 210（頁碼在 218~242）
    u.fitText(ctx, hint('up', '↑↓') + '選擇　' + hint('left', '←→') + '頁　' + hint('attack', 'X') + '套用　' + hint('jump', 'Z') + '返回',
      110, 199, 210, { color: C.grey || '#98a8c0', align: 'center', size: ms });
    KB.text(ctx, (g.ap + 1) + '/' + R.pages(), 242, 202, { color: C.grey || '#98a8c0', align: 'right' });
    return true;
  };
})();
