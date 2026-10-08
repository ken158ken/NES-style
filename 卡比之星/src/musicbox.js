// 音樂盒 KB.MUSICBOX（Round 12 / agent: K12-1 music-box）
// ============================================================================
// 全部 40 首曲目（系統 / 世界 / 魔王 / 挑戰 / 覺醒 / 結局）列表＋播放 / 停止 / 上下首
// ＋原創像素風可視化（音符捲軸 piano-roll + 四軌音量條）。
//
// 解鎖規則：**遊戲中聽過即解鎖** —— 本檔包一層 KB.audio.music()，任何非 null 的曲目在被
//   呼叫播放時就寫進 `KB.save.musicHeard[key] = 時間戳`（存檔新欄位，saves.js blank() 已加）。
//   `?debug=1`（KB.UI.unlockAll）時全部視為已解鎖，方便截圖 / 測試。
//
// 入口：標題選單「音樂盒」（KB.TitleMenu → KB.MUSICBOX.menu()）、暫停選單第 3 列「音樂盒」。
//
// ── 對外 API ────────────────────────────────────────────────────────────────
//   KB.MUSICBOX.TRACKS            → [{key, name, cat}] 40 首（固定順序）
//   KB.MUSICBOX.CATS              → ['系統','世界','魔王','挑戰','覺醒','結局']
//   KB.MUSICBOX.titleOf(key)      → 中文曲名（未知 key 回原 key）
//   KB.MUSICBOX.listOf(cat)       → 該分類的曲目陣列
//   KB.MUSICBOX.heard(key)        → 存檔裡真的聽過（不看 unlockAll）
//   KB.MUSICBOX.unlocked(key)     → 可播放（heard 或 unlockAll）
//   KB.MUSICBOX.markHeard(key)    → 手動標記聽過（music() 包層會自動呼叫）
//   KB.MUSICBOX.count() / total() → 已解鎖數 / 總數
//   KB.MUSICBOX.menu(opts)        → 音樂盒介面物件 {update() → null|'back', draw(ctx), …}
//   KB.MUSICBOX.playing()         → 目前音樂盒正在播的 key（null = 沒播）
// ============================================================================
(function () {
  'use strict';
  const KB = window.KB;
  const W = KB.W;
  const MB = KB.MUSICBOX = KB.MUSICBOX || {};

  const UI = () => KB.UI || null;
  const MS = () => (KB.UI && KB.UI.MS) || 12;
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const T = (ctx, s, x, y, o) => { const u = UI(); return u ? u.text(ctx, s, x, y, o) : KB.text(ctx, s, x, y, o); };
  const TW = (s, o) => { const u = UI(); return u ? u.textWidth(s, o) : KB.textWidth(s, o); };
  const fit = (ctx, s, x, y, w, o) => { const u = UI(); return u && u.fitText ? u.fitText(ctx, s, x, y, w, o) : T(ctx, s, x, y, o); };
  const hint = (a, f) => { const u = UI(); return (u && u.hint) ? u.hint(a, f) : f; };

  // ---------------------------------------------------------------- 曲目表
  // cat：系統 / 世界 / 魔王 / 挑戰 / 覺醒 / 結局（共 40 首，與 KB.audio.SONGS 一對一）
  const CATS = MB.CATS = ['系統', '世界', '魔王', '挑戰', '覺醒', '結局'];
  const TRACKS = MB.TRACKS = [
    // ---- 系統 6 ----
    { key: 'title', name: '星之序曲', cat: '系統' },
    { key: 'select', name: '選關小徑', cat: '系統' },
    { key: 'w_intro', name: '世界開場', cat: '系統' },
    { key: 'clear', name: '過關號角', cat: '系統' },
    { key: 'result', name: '結算時刻', cat: '系統' },
    { key: 'gameover', name: '失落的夢', cat: '系統' },
    // ---- 世界 15 ----
    { key: 'green', name: '翠綠草原', cat: '世界' },
    { key: 'green2', name: '草原的午後', cat: '世界' },
    { key: 'castle', name: '幽靜古堡', cat: '世界' },
    { key: 'castle2', name: '古堡深處', cat: '世界' },
    { key: 'island', name: '漂浮群島', cat: '世界' },
    { key: 'island2', name: '群島之風', cat: '世界' },
    { key: 'cloud', name: '泡泡雲海', cat: '世界' },
    { key: 'cloud2', name: '雲海之上', cat: '世界' },
    { key: 'dedede', name: '迪迪迪城', cat: '世界' },
    { key: 'dedede2', name: '城下鼓號', cat: '世界' },
    { key: 'space', name: '星之彼端', cat: '世界' },
    { key: 'space2', name: '彼端星塵', cat: '世界' },
    { key: 'dream', name: '夢幻迴廊', cat: '世界' },
    { key: 'dream2', name: '迴廊深夢', cat: '世界' },
    { key: 'secret', name: '秘密房間', cat: '世界' },
    // ---- 魔王 9 ----
    { key: 'miniboss', name: '中魔王', cat: '魔王' },
    { key: 'boss', name: '魔王登場', cat: '魔王' },
    { key: 'boss2', name: '魔王・二階段', cat: '魔王' },
    { key: 'finalboss', name: '大王之戰', cat: '魔王' },
    { key: 'finalboss2', name: '大王・二階段', cat: '魔王' },
    { key: 'shadowboss', name: '暗影卡比', cat: '魔王' },
    { key: 'shadowboss2', name: '暗影・二階段', cat: '魔王' },
    { key: 'nightmare', name: '夢魘之核', cat: '魔王' },
    { key: 'nightmare2', name: '終焉之翼', cat: '魔王' },
    // ---- 挑戰 5 ----
    { key: 'arena', name: '競技場', cat: '挑戰' },
    { key: 'arena_rest', name: '競技場休息', cat: '挑戰' },
    { key: 'challenge', name: '挑戰選單', cat: '挑戰' },
    { key: 'tower', name: '挑戰之塔', cat: '挑戰' },
    { key: 'timeattack', name: '時間攻擊', cat: '挑戰' },
    // ---- 覺醒 3 ----
    { key: 'invincible', name: '無敵之星', cat: '覺醒' },
    { key: 'ultimate_loop', name: '覺醒必殺', cat: '覺醒' },
    { key: 'transform_jingle', name: '變身短句', cat: '覺醒' },
    // ---- 結局 2 ----
    { key: 'ending', name: '歸途', cat: '結局' },
    { key: 'trueend', name: '真實結局', cat: '結局' },
  ];
  const BY_KEY = {};
  for (const t of TRACKS) BY_KEY[t.key] = t;
  MB.total = () => TRACKS.length;
  MB.titleOf = k => (BY_KEY[k] ? BY_KEY[k].name : String(k || ''));
  MB.defOf = k => BY_KEY[k] || null;
  MB.listOf = c => TRACKS.filter(t => t.cat === c);

  // ---------------------------------------------------------------- 解鎖 / 存檔
  function store() {
    const s = KB.save = KB.save || {};
    if (!s.musicHeard || typeof s.musicHeard !== 'object') s.musicHeard = {};
    return s.musicHeard;
  }
  MB.store = store;
  // ?debug=1 時 ui.js 會把 UI.unlockAll 設成 true；測試要看「鎖定」畫面就把它設回 false（所以不直接讀 KB.DEBUG）
  const unlockAll = () => (KB.UI && KB.UI.unlockAll !== undefined) ? !!KB.UI.unlockAll : !!KB.DEBUG;
  MB.heard = function (key) { try { return !!store()[key]; } catch (e) { return false; } };
  MB.unlocked = function (key) { return !!BY_KEY[key] && (unlockAll() || MB.heard(key)); };
  MB.count = function () { return TRACKS.filter(t => MB.unlocked(t.key)).length; };
  MB.heardCount = function () { return TRACKS.filter(t => MB.heard(t.key)).length; };
  MB.heardTime = function (key) { try { return store()[key] | 0 || store()[key] || 0; } catch (e) { return 0; } };

  let savePend = 0;
  MB.markHeard = function (key) {
    if (!BY_KEY[key]) return false;
    try {
      const h = store();
      if (h[key]) return false;
      h[key] = Date.now();
      // 存檔節流：同一幀連續切歌只寫一次（KB.saveGame 會整包 JSON.stringify）
      if (!savePend) savePend = setTimeout(function () { savePend = 0; try { KB.saveGame && KB.saveGame(); } catch (e) { } }, 60);
      return true;
    } catch (e) { return false; }
  };

  // KB.audio.music() 包一層：遊戲中播過的曲目自動解鎖（rewards.js 的標題曲替換在本層之後再包，
  // 所以這裡記到的是「實際播出來的那首」）
  try {
    if (KB.audio && typeof KB.audio.music === 'function' && !KB.audio.__mbHook) {
      const orig = KB.audio.music.bind(KB.audio);
      KB.audio.music = function (key) {
        if (key) { try { MB.markHeard(key); } catch (e) { } }
        return orig(key);
      };
      KB.audio.__mbHook = true;
    }
  } catch (e) { }

  // ---------------------------------------------------------------- 可視化（原創像素風）
  // 音符捲軸：把 compileSong() 的四軌 token 畫成橫向捲動的音符條（p1 黃 / p2 青 / bass 紫 / drum 白點），
  // 播放中由 KB.audio.status().step 當播放頭；沒在播（或音訊未解鎖）時用自己的幀數慢速捲動預覽。
  const VIS_STEPS = 56;            // 視窗寬度（步）
  const cache = {};
  function compiled(key) {
    if (cache[key] !== undefined) return cache[key];
    let c = null;
    try {
      const A = KB.audio, song = A && A.SONGS && A.SONGS[key];
      if (song && A.compileSong) {
        const r = A.compileSong(song);
        const pitch = {};
        let lo = 200, hi = 0;
        for (const tr of ['p1', 'p2', 'bass']) {
          pitch[tr] = (r.tracks[tr] || []).map(tok => {
            if (!tok || tok === '.' || tok === '-') return null;
            const f = A.noteFreq ? A.noteFreq(tok) : null;
            if (!f) return null;
            const n = Math.round(69 + 12 * Math.log2(f / 440));
            if (n < lo) lo = n; if (n > hi) hi = n;
            return n;
          });
        }
        if (hi <= lo) { lo = 48; hi = 84; }
        c = { len: r.len, bars: r.bars, tracks: r.tracks, pitch, lo, hi };
      }
    } catch (e) { c = null; }
    cache[key] = c;
    return c;
  }
  MB.compiled = compiled;

  const TR_COL = { p1: '#ffe040', p2: '#80e0ff', bass: '#c8a0f0' };
  /**
   * 畫可視化面板。key 可為 null（畫靜止的空格線）。
   * x/y/w/h = 面板內緣；step = 播放頭（步），phase = 沒在播時的捲動相位。
   */
  MB.drawVis = function (ctx, x, y, w, h, key, step, frame) {
    KB.rect(ctx, x, y, w, h, '#0c1020');
    KB.rect(ctx, x, y, w, 1, '#283450');
    const c = key ? compiled(key) : null;
    const rollX = x + 22, rollW = w - 24, rollY = y + 2, rollH = h - 12;
    // 軌道標籤（8×8 點陣字，原生 ASCII）
    KB.text(ctx, 'P1', x + 2, rollY + 1, { color: TR_COL.p1 });
    KB.text(ctx, 'P2', x + 2, rollY + 9, { color: TR_COL.p2 });
    KB.text(ctx, 'BS', x + 2, rollY + 17, { color: TR_COL.bass });
    KB.text(ctx, 'DR', x + 2, rollY + 25, { color: '#c8d8f0' });
    // 格線（每 8 步一條細線 = 半小節）
    const sw = rollW / VIS_STEPS;
    for (let i = 0; i <= VIS_STEPS; i += 8) KB.rect(ctx, rollX + Math.round(i * sw), rollY, 1, rollH, '#1c2740');
    if (!c) {
      fit(ctx, '－－－', rollX + rollW / 2, y + h / 2 - 7, rollW, { color: '#46536e', align: 'center', size: MS() });
      return;
    }
    const base = (step !== null && step !== undefined) ? step : Math.floor(frame / 6);
    const start = ((base - 12) % c.len + c.len) % c.len;
    const span = Math.max(1, c.hi - c.lo);
    const drumY = rollY + rollH - 5;
    for (let i = 0; i < VIS_STEPS; i++) {
      const si = (start + i) % c.len;
      const px = rollX + Math.round(i * sw);
      const pw = Math.max(1, Math.round(sw) - (sw > 3 ? 1 : 0));
      // 三條音高軌：音高映射到 rollY+1 .. drumY-3
      for (const tr of ['p1', 'p2', 'bass']) {
        const n = c.pitch[tr][si];
        if (n === null || n === undefined) continue;
        const u = (n - c.lo) / span;
        const ny = Math.round(drumY - 4 - u * (drumY - 6 - rollY));
        KB.rect(ctx, px, ny, pw, 2, TR_COL[tr]);
      }
      // 鼓軌：k 大方塊 / s 中 / h,o,c 小點
      const d = c.tracks.drum[si];
      if (d && d !== '.' && d !== '-') {
        const big = d === 'k', mid = d === 's';
        KB.rect(ctx, px, big ? drumY : (mid ? drumY + 1 : drumY + 2), pw, big ? 4 : (mid ? 3 : 2),
          big ? '#ff9ec0' : (mid ? '#fff0a0' : '#8fa0bc'));
      }
    }
    // 播放頭（第 12 格）：亮線 + 上下小三角
    const hx = rollX + Math.round(12 * sw);
    KB.rect(ctx, hx, rollY, 1, rollH, 'rgba(255,255,255,0.55)');
    for (let r = 0; r < 3; r++) KB.rect(ctx, hx - 2 + r, rollY + r, 5 - r * 2, 1, '#fff');
    // 小節 / 步數（右下角）
    KB.text(ctx, 'BAR ' + (Math.floor(base / 16) + 1) + '/' + c.bars, x + w - 2, y + h - 9, { color: '#5c6884', align: 'right' });
  };

  // ---------------------------------------------------------------- 介面
  // 版面（y 4~188，暫停選單也放得進遊戲區 192 以內）：
  //   6~20 標題列　22 分隔　25~37 分類列　40 分隔　43~127 清單 6 列　130 分隔
  //   134~172 可視化　174~186 提示
  const BOX = { x: 4, y: 4, w: 248, h: 186 };
  const ROWS = 6, ROW_H = 14, LIST_Y = 43;
  const VIS = { x: 14, y: 134, w: 228, h: 40 };

  class MusicBox {
    constructor(opts) {
      opts = opts || {};
      this.frame = 0;
      this.cat = 0;
      this.sel = 0;          // 在目前分類清單中的索引
      this.top = 0;
      this.play = null;      // 音樂盒正在播的 key
      this.onBack = opts.onBack || null;
      this.restore = opts.restore === undefined ? 'title' : opts.restore;   // 'title' | null | function
      this.game = opts.game || null;
    }
    get list() { return MB.listOf(CATS[this.cat]); }
    get cur() { return this.list[Math.min(this.sel, this.list.length - 1)] || null; }
    clampTop() {
      const n = this.list.length;
      if (this.sel < this.top) this.top = this.sel;
      if (this.sel > this.top + ROWS - 1) this.top = this.sel - ROWS + 1;
      this.top = Math.max(0, Math.min(Math.max(0, n - ROWS), this.top));
    }
    /** 播放游標上的曲子（未解鎖 → 回絕音效） */
    playCur() {
      const t = this.cur;
      if (!t) return false;
      if (!MB.unlocked(t.key)) { sfx('menu_back'); return false; }
      try { KB.audio && KB.audio.unlock && KB.audio.unlock(); } catch (e) { }
      this.play = t.key;
      // rawPlay：告訴 rewards.js 的標題曲替換「這是音樂盒點播，不要換曲」
      MB.rawPlay = true;
      try { KB.audio && KB.audio.music && KB.audio.music(t.key); } catch (e) { }
      MB.rawPlay = false;
      return true;
    }
    stop() {
      this.play = null;
      try { KB.audio && KB.audio.music && KB.audio.music(null); } catch (e) { }
    }
    /** 離開：把音樂還原成進來前的狀態 */
    leave() {
      this.play = null;
      try {
        if (typeof this.restore === 'function') this.restore();
        else if (this.restore === 'title') { KB.audio && KB.audio.music && KB.audio.music('title'); }
        else if (this.game && this.game.resumeMusic) this.game.resumeMusic();
      } catch (e) { }
    }
    update() {
      this.frame++;
      const inp = KB.input;
      if (!inp) return null;
      const n = this.list.length;
      if (inp.pressed('select') || inp.pressed('start')) { sfx('menu_back'); this.leave(); return 'back'; }
      // ←→ 切分類
      if (inp.pressed('right') || inp.pressed('left')) {
        this.cat = (this.cat + (inp.pressed('right') ? 1 : CATS.length - 1)) % CATS.length;
        this.sel = 0; this.top = 0; sfx('menu');
        return null;
      }
      // ↑↓ 上下首（播放中就直接切過去 = 上一首 / 下一首）
      if (inp.pressed('down') || inp.pressed('up')) {
        this.sel = (this.sel + (inp.pressed('down') ? 1 : n - 1)) % n;
        this.clampTop();
        if (this.play) { if (!this.playCur()) this.stop(); } else sfx('menu');
        return null;
      }
      // A（jump）：播放 / 停止（同一首再按一次＝停止）
      if (inp.pressed('jump')) {
        const t = this.cur;
        if (t && this.play === t.key) { sfx('menu_back'); this.stop(); }
        else if (this.playCur()) sfx('select');
        return null;
      }
      // B（attack）：停止
      if (inp.pressed('attack')) {
        if (this.play) { sfx('menu_back'); this.stop(); } else sfx('menu_back');
        return null;
      }
      return null;
    }
    /** 音樂盒目前點播中的曲目（null＝沒播）。不看 audio.status()：靜音 / 未解鎖音訊時它會是 null，
     *  而 status().pending 可能還是「進來音樂盒之前」的那首標題曲。 */
    playingKey() { return this.play || null; }
    draw(ctx) {
      const u = UI(), C = (u && u.C) || {}, ms = MS(), f = this.frame;
      const B = BOX;
      KB.rect(ctx, 0, 0, W, KB.H, 'rgba(0,0,0,0.78)');
      if (u && u.panel) u.panel(ctx, B.x, B.y, B.w, B.h); else KB.rect(ctx, B.x, B.y, B.w, B.h, '#182038');
      // 標題列
      T(ctx, '音樂盒', 14, 6, { color: C.yellow || '#ffe040', size: 16 });
      const got = MB.count(), tot = MB.total();
      T(ctx, '解鎖 ' + got + '/' + tot, 242, 8, { color: got >= tot ? (C.yellow || '#ffe040') : '#8fa0bc', align: 'right', size: ms });
      KB.rect(ctx, 14, 22, 228, 1, '#405070');
      // 分類列（←→ 切換；目前分類黃字 + 底線）
      let cx = 14;
      for (let i = 0; i < CATS.length; i++) {
        const on = i === this.cat, cw = TW(CATS[i], { size: ms });
        T(ctx, CATS[i], cx, 25, { color: on ? (C.yellow || '#ffe040') : '#67758f', size: ms });
        if (on) KB.rect(ctx, cx, 38, cw, 1, C.yellow || '#ffe040');
        cx += cw + 7;
      }
      // fix12（R12-P3-03）：手機的 hint('left') 是三個中文字「方向鍵」，擠在分類列右端讀起來像第 7 個分類
      //   ⇒ 手機不畫這一格，改把「分類」併進底部提示行（桌機仍是 ←→，離「結局」有 25px，清楚）
      const mob = !!(u && u.touchOn && u.touchOn());
      if (!mob) T(ctx, hint('left', '←→'), 242, 25, { color: '#5c6884', align: 'right', size: ms });
      KB.rect(ctx, 14, 40, 228, 1, '#405070');
      // 清單
      const list = this.list, n = list.length;
      if (this.sel >= n) this.sel = Math.max(0, n - 1);
      this.clampTop();
      const nowKey = this.playingKey();
      for (let k = 0; k < ROWS; k++) {
        const i = this.top + k, t = list[i];
        if (!t) break;
        const y = LIST_Y + k * ROW_H, sel = i === this.sel, ok = MB.unlocked(t.key), on = nowKey === t.key;
        KB.rect(ctx, 12, y - 1, 232, ROW_H - 1, sel ? 'rgba(72,60,120,0.9)' : (ok ? 'rgba(40,34,72,0.6)' : 'rgba(18,24,40,0.5)'));
        if (sel) { KB.rect(ctx, 12, y - 1, 1, ROW_H - 1, C.yellow || '#ffe040'); KB.rect(ctx, 243, y - 1, 1, ROW_H - 1, C.yellow || '#ffe040'); }
        // 編號（曲目在 40 首裡的序號，8×8 點陣字）
        const no = TRACKS.indexOf(t) + 1;
        KB.text(ctx, (no < 10 ? '0' : '') + no, 18, y + 2, { color: ok ? '#8fa0bc' : '#4c5670' });
        fit(ctx, ok ? t.name : '？？？', 38, y - 1, 150, { color: ok ? (sel ? '#fff' : '#c8d8f0') : '#5c6884', size: ms });
        // 右側狀態：播放中（閃爍音符）／已解鎖／鎖
        if (on) {
          KB.text(ctx, ((f >> 3) & 1) ? '>>' : '> ', 188, y + 2, { color: '#80e0a0' });
          T(ctx, '播放中', 240, y - 1, { color: '#80e0a0', align: 'right', size: ms });
        } else if (ok) KB.text(ctx, 'OK', 240, y + 2, { color: '#5c8870', align: 'right' });
        else KB.text(ctx, '-', 240, y + 2, { color: '#4c5670', align: 'right' });
      }
      // 清單捲動位置條
      if (n > ROWS) {
        const lh = ROWS * ROW_H - 2, ly = LIST_Y - 1;
        const bh = Math.max(6, Math.round(lh * ROWS / n)), by = ly + Math.round((lh - bh) * this.top / (n - ROWS));
        KB.rect(ctx, 245, ly, 2, lh, '#2a3450');
        KB.rect(ctx, 245, by, 2, bh, C.yellow || '#ffe040');
      }
      KB.rect(ctx, 14, 130, 228, 1, '#405070');
      // 可視化
      let step = null;
      try {
        const st = KB.audio && KB.audio.status && KB.audio.status();
        if (st && st.playing && nowKey === st.playing) step = st.step | 0;
      } catch (e) { }
      MB.drawVis(ctx, VIS.x, VIS.y, VIS.w, VIS.h, nowKey || (this.cur && MB.unlocked(this.cur.key) ? this.cur.key : null), step, f);
      // 提示行
      const navTip = mob ? ' 分類／換曲　' : ' 換曲　';      // 手機：分類切換的提示搬到這一行
      const tip = nowKey
        ? (hint('up', '↑↓') + navTip + hint('jump', 'Z') + '／' + hint('attack', 'X') + ' 停止　' + hint('select', 'SELECT') + ' 返回')
        : (hint('up', '↑↓') + navTip + hint('jump', 'Z') + ' 播放　' + hint('select', 'SELECT') + ' 返回');
      fit(ctx, tip, 128, 174, 240, { color: C.grey || '#98a8c0', align: 'center', size: ms });
    }
  }
  MB.MusicBox = MusicBox;
  MB.rawPlay = false;
  // menu()：建立介面物件並記在 MB._cur（給 KB.MUSICBOX.playing() 與自動測試用）
  MB.menu = function (opts) { const m = new MusicBox(opts); MB._cur = m; return m; };
  MB.playing = function () { return MB._cur ? MB._cur.playingKey() : null; };
})();
