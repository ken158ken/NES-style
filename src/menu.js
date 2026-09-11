// 選單系統（agent: ui-menu）—— 暫停選單 / 標題選單 / 能力圖鑑 / 設定 / 遊戲內「?」提示
// 依賴 ui.js 匯出的繪圖工具（KB.UI.panel / cursor / sprAt / text …），載入順序：ui.js → menu.js。
// 版面依 docs/DESIGN_REFERENCE.md 第 2 章：上半＝能力卡（圖示 + 名稱 + 風味文字 + 招式表），下半＝選單。
// 文字規格：中文一律 ≥ UI.MS（14px），放不下時 UI.fitText 會自動降到 12px 再截斷；所有元素夾在 x = 4~252。
(function () {
  'use strict';
  const W = KB.W, H = KB.H, VH = KB.VIEW_H;
  const UI = KB.UI;
  const T = UI.text, TW = UI.textWidth, fit = UI.fitText, C = UI.C;
  const panel = UI.panel, cursor = UI.cursor, sprAt = UI.sprAt, drawKirby = UI.drawKirby;
  const sfx = UI.sfx, has = UI.has;
  const MS = () => UI.MS;

  // ======================================================================
  // 設定（按鍵提示存 KB.save.settings；音量由 audio.js 自己存 KB.save.settings.audio）
  // ======================================================================
  const DEFAULTS = { hints: true };
  UI.settings = function () {
    if (!KB.save) KB.save = {};
    const cur = KB.save.settings || {};
    for (const k in DEFAULTS) if (typeof cur[k] !== 'boolean') cur[k] = DEFAULTS[k];
    if (!cur.volMemo) cur.volMemo = { music: 0.7, sfx: 1 };
    KB.save.settings = cur;
    return cur;
  };
  UI.saveSettings = function () { try { KB.saveGame && KB.saveGame(); } catch (e) { } };

  // 音量（0~1）：audio.js 提供 setVolume / getVolume，並自動存檔
  const AU = () => KB.audio || null;
  UI.vol = function () { const a = AU(); return (a && a.getVolume) ? a.getVolume() : { music: 1, sfx: 1 }; };
  UI.setVol = function (kind, v) { const a = AU(); if (a && a.setVolume) a.setVolume({ [kind]: Math.max(0, Math.min(1, v)) }); };
  UI.volLevel = function (kind) { return Math.round(UI.vol()[kind] * 10); };          // 0~10 格
  UI.volStep = function (kind, d) {
    const n = Math.max(0, Math.min(10, UI.volLevel(kind) + d));
    UI.setVol(kind, n / 10);
    if (n > 0) { UI.settings().volMemo[kind] = n / 10; UI.saveSettings(); }
    return n;
  };
  // 暫停選單的「開 / 關」：關掉時記住原本音量，打開時還原
  UI.volOn = function (kind) { return UI.volLevel(kind) > 0; };
  UI.toggleVol = function (kind) {
    const st = UI.settings(), cur = UI.vol()[kind];
    if (cur > 0) { st.volMemo[kind] = cur; UI.setVol(kind, 0); }
    else UI.setVol(kind, st.volMemo[kind] || (kind === 'music' ? 0.7 : 1));
    UI.saveSettings();
    return UI.volOn(kind);
  };
  UI.applyAudio = function () { };   // 音量已由 audio.js 自行載入 / 存檔，UI 不需要再套用

  // ======================================================================
  // 能力說明（風味文字為本專案原創，語氣參考 docs/DESIGN_REFERENCE.md 2.2）
  // KB.ABILITIES[key].desc / .flavour / .moves 若存在會優先採用（abilities agent 新增招式即生效）
  // ======================================================================
  UI.ABILITY_HELP = {
    none: {
      name: '普通', en: 'NORMAL', desc: '吸入敵人，按 ↓ 吞下複製能力',
      flavour: ['深呼吸，把敵人吸進嘴裡吧！', '按 ↓ 吞下去就能偷走他的本事。'],
      moves: [['X（按住）', '吸入'], ['X', '吐出星星'], ['↓', '吞下＝獲得能力']],
    },
    fire: {
      desc: '前方噴出火柱，越噴越長', flavour: ['呼——！吐出滾燙的火舌。', '小心別把草原烤焦了。'],
      moves: [['X（按住）', '噴火'], ['跳＋X', '空中噴火'], ['', '噴火時無法移動']],
    },
    sword: {
      desc: '揮劍速度快，可邊走邊揮', flavour: ['握緊了就別鬆手。', '揮下去的瞬間，風都讓路。'],
      moves: [['X', '揮劍'], ['連按 X', '連段'], ['空中 X', '空中斬']],
    },
    beam: {
      desc: '甩出弧形光鞭掃過頭上', flavour: ['甩出一串閃亮的光鞭，', '啪嚓啪嚓地掃過去。'],
      moves: [['X', '光束鞭'], ['連按 X', '連續甩鞭'], ['', '打得到頭上的敵人']],
    },
    cutter: {
      desc: '丟出迴旋刃，會飛回手上', flavour: ['丟出去、繞一圈、再接住。', '丟不準？再練練。'],
      moves: [['X', '丟刀刃'], ['連按 X', '最多 2 片'], ['', '去程回程各命中一次']],
    },
    spark: {
      desc: '全身放電，原地不能動', flavour: ['全身劈哩啪啦。', '靠太近的傢伙自己負責。'],
      moves: [['X（按住）', '放電'], ['', '周圍一圈都有判定'], ['', '放開就停']],
    },
    stone: {
      desc: '變成石頭，無敵可壓敵', flavour: ['碰！變成一塊沉甸甸的石頭。', '這時候誰也推不動。'],
      moves: [['X', '變石頭'], ['再按 X', '解除'], ['空中 X', '重落攻擊']],
    },
    ice: {
      desc: '噴出冰霧，把敵人凍成冰塊', flavour: ['一口冷氣把對手凍成冰塊，', '然後——踢出去！'],
      moves: [['X（按住）', '噴冰'], ['', '冰塊可推可踢'], ['跳＋X', '空中噴冰']],
    },
    hammer: {
      desc: '威力最高，但揮擊較慢', flavour: ['高高舉起、重重落下。', '地板都跟著抖一下。'],
      moves: [['X', '掄鎚'], ['↓＋X', '原地大力敲'], ['空中 X', '空中揮鎚']],
    },
  };

  UI.abilityInfo = function (key) {
    const d = (key && KB.ABILITIES) ? KB.ABILITIES[key] : null;
    const t = UI.ABILITY_HELP[key || 'none'] || {};
    return {
      key: key || null,
      name: t.name || (d && d.name) || (KB.ABILITY_NAMES && KB.ABILITY_NAMES[key]) || '普通',
      en: t.en || (d && d.hudName) || (KB.ABILITY_HUD && KB.ABILITY_HUD[key]) || 'NORMAL',
      desc: (d && d.desc) || t.desc || '',
      flavour: (d && d.flavour) || t.flavour || (t.desc ? [t.desc] : []),
      moves: (d && d.moves) || t.moves || [],
      icon: key ? ((d && d.icon) || ('ui_ability_' + key)) : 'ui_ability_none',
      hat: key ? ((d && d.hat) || ('hat_' + key)) : null,
      color: (d && d.color) || '#f8a0c8',
    };
  };

  // 能力卡片（暫停畫面上半）：需要 w ≥ 200、h ≥ 114（名稱 / 2 行風味文字 / 3 列招式）
  UI.drawAbilityCard = function (ctx, x, y, w, h, key, opts) {
    opts = opts || {};
    const info = UI.abilityInfo(key), ms = MS();
    if (opts.panel !== false) panel(ctx, x, y, w, h);
    if (!sprAt(ctx, info.icon, x + 7, y + 8, 'tl')) {
      KB.rect(ctx, x + 7, y + 8, 24, 16, '#181c28'); KB.rect(ctx, x + 8, y + 9, 22, 14, info.color);
    }
    T(ctx, info.name, x + 38, y + 2, { color: C.yellow, size: 16 });
    KB.text(ctx, info.en, x + w - 8, y + 11, { color: info.key ? info.color : '#98a8c0', align: 'right' });
    // 風味文字（最多 2 行）
    const fl = (info.flavour || []).slice(0, 2);
    for (let i = 0; i < fl.length; i++) fit(ctx, fl[i], x + 8, y + 28 + i * 15, w - 16, { color: '#c8d8f0', size: ms });
    KB.rect(ctx, x + 7, y + 61, w - 14, 1, '#405070');
    // 招式表（最多 3 列）：左欄按鍵、右欄招式名；沒有按鍵的列＝補充說明
    const moves = (info.moves || []).slice(0, 3);
    for (let i = 0; i < moves.length; i++) {
      const my = y + 64 + i * 15, k = moves[i][0], name = moves[i][1];
      if (k) {
        fit(ctx, k, x + 9, my, 76, { color: C.cyan, size: ms, nomix: true });
        fit(ctx, name, x + 92, my, w - 100, { color: '#ffffff', size: ms });
      } else fit(ctx, '・' + name, x + 9, my, w - 18, { color: '#98a8c0', size: ms });
    }
  };

  const onOff = v => (v ? '開' : '關');

  // ======================================================================
  // 暫停選單（KB.PauseMenu）—— game.js 只呼叫 update(game) / draw(ctx, game)
  // ======================================================================
  // 2 列 × 3 欄（row-major）
  const PAUSE_ITEMS = [
    { id: 'resume', label: '繼續' }, { id: 'help', label: '操作說明' }, { id: 'map', label: '回到地圖' },
    { id: 'music', label: '音樂', vol: 'music' }, { id: 'sfx', label: '音效', vol: 'sfx' }, { id: 'title', label: '回到標題' },
  ];
  const COLS = 3, COL_X = [24, 102, 180], ROW_Y = [134, 154];

  function unduck() { const a = AU(); if (a && a.duck) { try { a.duck(false); } catch (e) { } } }

  class PauseMenu {
    constructor(game) { this.sel = 0; this.frame = 0; this.page = 'main'; this.game = game || null; }
    resume(game) { game.paused = false; unduck(); sfx('unpause'); if (game.resumeMusic) game.resumeMusic(); }
    update(game) {
      this.frame++;
      const inp = KB.input;
      if (this.page === 'help') {
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('select') || inp.pressed('start')) { this.page = 'main'; sfx('menu_back'); return; }
        UI.helpUpdate();
        return;
      }
      if (inp.pressed('start') || inp.pressed('select')) { this.resume(game); return; }
      const n = PAUSE_ITEMS.length;
      if (inp.pressed('down')) { this.sel = (this.sel + COLS) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - COLS + n) % n; sfx('menu'); }
      if (inp.pressed('right')) { const r = (this.sel / COLS) | 0; this.sel = r * COLS + ((this.sel % COLS) + 1) % COLS; sfx('menu'); }
      if (inp.pressed('left')) { const r = (this.sel / COLS) | 0; this.sel = r * COLS + ((this.sel % COLS) + COLS - 1) % COLS; sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('attack')) this.choose(game);
    }
    choose(game) {
      const it = PAUSE_ITEMS[this.sel];
      if (it.vol) {
        const on = UI.toggleVol(it.vol);
        sfx('menu');   // 先套用再播，音效剛打開時才聽得到回饋
        if (it.vol === 'music' && on && game.resumeMusic) game.resumeMusic();
        return;
      }
      sfx('select');
      if (it.id === 'resume') { this.resume(game); return; }
      if (it.id === 'help') { this.page = 'help'; UI.openHelp(); return; }
      if (it.id === 'map') {
        unduck(); KB.session.lives = game.lives; KB.session.score = game.score;
        KB.setScene(KB.StageSelectScene ? new KB.StageSelectScene(Math.max(0, KB.LEVELS.indexOf(game.level))) : new KB.GameScene(game.levelId));
        return;
      }
      if (it.id === 'title') {
        unduck(); UI.newSession(KB.START_LIVES, 0);
        if (KB.TitleScene) KB.setScene(new KB.TitleScene());
        return;
      }
    }
    draw(ctx, game) {
      // 只蓋住遊戲區（y < 192），HUD 仍然看得見
      KB.rect(ctx, 0, 0, W, VH, 'rgba(0,0,0,0.58)');
      if (this.page === 'help') { UI.drawHelp(ctx, { hint: 'Z / SELECT：返回暫停選單' }); return; }
      const f = this.frame, ms = MS();
      UI.drawAbilityCard(ctx, 4, 10, 248, 114, game.player ? game.player.ability : null);
      // PAUSE 標籤（壓在卡片上緣，整塊在畫面內）
      panel(ctx, 100, 2, 56, 14, C.dark, C.border);
      KB.text(ctx, 'PAUSE', 128, 5, { color: C.yellow, align: 'center' });
      // 選單：2 列 × 3 欄
      panel(ctx, 4, 128, 248, 62);
      for (let i = 0; i < PAUSE_ITEMS.length; i++) {
        const it = PAUSE_ITEMS[i], x = COL_X[i % COLS], y = ROW_Y[(i / COLS) | 0], sel = this.sel === i;
        if (sel) cursor(ctx, x - 14, y + 3, f);
        fit(ctx, it.label, x, y, it.vol ? 44 : 72, { color: sel ? C.yellow : '#fff', size: ms });
        if (it.vol) T(ctx, onOff(UI.volOn(it.vol)), x + 70, y, { color: UI.volOn(it.vol) ? '#80e0a0' : C.grey, align: 'right', size: ms });
      }
      fit(ctx, '↑↓←→ 選擇　Z 確認　ENTER 繼續', 128, 173, 240, { color: C.grey, align: 'center', size: ms });
    }
  }
  KB.PauseMenu = PauseMenu;

  // ======================================================================
  // 能力圖鑑（8 能力翻頁）
  // ======================================================================
  class AbilityGallery {
    constructor() { this.i = 0; this.t = 0; this.frame = 0; }
    get keys() { return (KB.ABILITY_KEYS || []).slice(); }
    update() {
      this.frame++; this.t += 1 / 60;
      const inp = KB.input, n = this.keys.length || 1;
      if (inp.pressed('right')) { this.i = (this.i + 1) % n; sfx('menu'); }
      if (inp.pressed('left')) { this.i = (this.i - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('select') || inp.pressed('start') || inp.pressed('jump') || inp.pressed('attack')) { sfx('menu_back'); return 'back'; }
      return null;
    }
    draw(ctx) {
      // R3-P1-03：說明 / 招式名一律不截斷 —— 卡比預覽框縮成 52×40 靠左，
      // 說明與招式表改用整列寬度（228px），說明 14px 排不進 2 行就整段降到 12px。
      const ms = MS();
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)');
      panel(ctx, 4, 4, 248, 210);
      const keys = this.keys, key = keys[this.i] || null, info = UI.abilityInfo(key);
      T(ctx, '能力圖鑑', 128, 5, { color: C.yellow, align: 'center', size: 16 });
      KB.text(ctx, (this.i + 1) + '/' + Math.max(1, keys.length), 242, 11, { color: C.grey, align: 'right' });
      KB.rect(ctx, 14, 24, 228, 1, '#405070');
      // 左：戴帽子的卡比（kirby_idle + hat_<key>）
      KB.rect(ctx, 14, 28, 52, 40, '#101828'); KB.rect(ctx, 15, 29, 50, 38, '#20304c');
      const gy = 64;
      drawKirby(ctx, 'kirby_idle', 40, gy, { t: this.t, frame: 0 });
      if (info.hat && has(info.hat)) sprAt(ctx, info.hat, 40, gy - 15, 'b', { t: this.t });
      KB.rect(ctx, 26, gy + 1, 28, 2, 'rgba(0,0,0,0.35)');
      // 右：圖示 + 名稱 + 英文名（與預覽框同一列）
      if (!sprAt(ctx, info.icon, 74, 36, 'tl')) { KB.rect(ctx, 74, 36, 24, 16, '#181c28'); KB.rect(ctx, 75, 37, 22, 14, info.color); }
      T(ctx, info.name, 106, 34, { color: C.yellow, size: 16 });
      KB.text(ctx, info.en, 242, 40, { color: info.color, align: 'right' });
      // 說明：整列寬、最多 2 行（wrapLines 不在標點前斷行、行首不會是「，。」）
      let ds = ms, dl = info.desc ? UI.wrapLines(info.desc, 228, { size: ds }, 9) : [];
      if (dl.length > 2) { ds = UI.MS_SMALL; dl = UI.wrapLines(info.desc, 228, { size: ds }, 2); }
      for (let i = 0; i < dl.length; i++) T(ctx, dl[i], 14, 72 + i * (ds >= 14 ? 15 : 14), { color: '#c8d8f0', size: ds });
      KB.rect(ctx, 14, 104, 228, 1, '#405070');
      // 招式表（最多 4 列）：左欄按鍵 95px、右欄招式名 129px，塞不下先降 12px 再說
      let y = 108;
      for (const m of (info.moves || []).slice(0, 4)) {
        if (m[0]) {
          fit(ctx, m[0], 14, y, 95, { color: C.cyan, size: ms, nomix: true });
          fit(ctx, m[1], 113, y, 129, { color: '#fff', size: ms });
        } else fit(ctx, '・' + m[1], 14, y, 228, { color: '#98a8c0', size: ms });
        y += 15;
      }
      // 全部能力縮圖列（目前選取者外框）
      KB.rect(ctx, 14, 170, 228, 1, '#405070');
      for (let i = 0; i < keys.length; i++) {
        const x = 16 + i * 29, sel = i === this.i;
        KB.rect(ctx, x, 174, 26, 20, sel ? C.yellow : '#101828');
        KB.rect(ctx, x + 1, 175, 24, 18, '#20304c');
        if (!sprAt(ctx, 'ui_ability_' + keys[i], x + 1, 176, 'tl')) KB.rect(ctx, x + 2, 177, 22, 14, UI.abilityInfo(keys[i]).color);
      }
      fit(ctx, '←→ 換頁　　SELECT / Z：返回', 128, 197, 236, { color: C.grey, align: 'center', size: ms });
    }
  }
  KB.AbilityGallery = AbilityGallery;

  // ======================================================================
  // 設定頁：音樂 / 音效 音量 0~10 格滑桿、按鍵提示開關
  // ======================================================================
  const SET_ITEMS = [
    { id: 'music', label: '音樂音量', vol: 'music' },
    { id: 'sfx', label: '音效音量', vol: 'sfx' },
    { id: 'hints', label: '按鍵提示' },
    { id: 'scale', label: '畫面縮放', cycle: [0, 2, 3, 4], names: ['自動', '2x', '3x', '4x'] },
  ];
  function slider(ctx, x, y, level) {
    for (let i = 0; i < 10; i++) {
      const cx = x + i * 8, on = i < level;
      KB.rect(ctx, cx, y, 7, 10, '#101828');
      KB.rect(ctx, cx + 1, y + 1, 5, 8, on ? (i >= 8 ? '#ffe040' : '#80e0a0') : '#39445c');
    }
  }
  class SettingsMenu {
    constructor() { this.sel = 0; this.frame = 0; }
    update() {
      this.frame++;
      const inp = KB.input, n = SET_ITEMS.length, it = SET_ITEMS[this.sel];
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      const d = inp.pressed('right') ? 1 : inp.pressed('left') ? -1 : 0;
      if (it.vol) {
        if (d) { UI.volStep(it.vol, d); sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack')) { UI.toggleVol(it.vol); sfx('menu'); }
      } else if (it.cycle) {
        const step = d || (inp.pressed('jump') || inp.pressed('attack') ? 1 : 0);
        if (step) {
          const st = UI.settings(), n = it.cycle.length;
          let i = it.cycle.indexOf(st[it.id] | 0); if (i < 0) i = 0;
          st[it.id] = it.cycle[(i + step + n) % n];
          UI.saveSettings(); sfx('menu');
          if (KB.resizeCanvas) KB.resizeCanvas();
        }
      } else if (d || inp.pressed('jump') || inp.pressed('attack')) {
        const st = UI.settings(); st[it.id] = !st[it.id]; UI.saveSettings(); sfx('menu');
      }
      if (inp.pressed('select') || inp.pressed('start')) { sfx('menu_back'); return 'back'; }
      return null;
    }
    draw(ctx) {
      const ms = MS();
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.7)');
      panel(ctx, 24, 36, 208, 158);
      T(ctx, '設定', 128, 40, { color: C.yellow, align: 'center', size: 16 });
      KB.rect(ctx, 34, 64, 188, 1, '#405070');
      const st = UI.settings();
      for (let i = 0; i < SET_ITEMS.length; i++) {
        const it = SET_ITEMS[i], y = 72 + i * 22, sel = this.sel === i;
        if (sel) cursor(ctx, 34, y + 3, this.frame);
        fit(ctx, it.label, 48, y, 66, { color: sel ? C.yellow : '#fff', size: ms });
        if (it.vol) { slider(ctx, 122, y + 2, UI.volLevel(it.vol)); KB.text(ctx, String(UI.volLevel(it.vol)), 222, y + 3, { color: '#c8d8f0', align: 'right' }); }
        else if (it.cycle) {
          let k = it.cycle.indexOf(st[it.id] | 0); if (k < 0) k = 0;
          T(ctx, it.names[k], 222, y, { color: k === 0 ? '#c8d8f0' : '#80e0a0', align: 'right', size: ms });
        } else T(ctx, onOff(st[it.id]), 222, y, { color: st[it.id] ? '#80e0a0' : C.grey, align: 'right', size: ms });
      }
      KB.rect(ctx, 34, 158, 188, 1, '#405070');
      fit(ctx, '←→ 調整　SELECT 返回', 128, 162, 196, { color: C.grey, align: 'center', size: ms });
      fit(ctx, 'F：全螢幕切換', 128, 177, 196, { color: C.grey, align: 'center', size: ms });
    }
  }
  KB.SettingsMenu = SettingsMenu;

  // ======================================================================
  // 標題選單
  // ======================================================================
  const anyCleared = () => !!(KB.save && KB.save.cleared && Object.keys(KB.save.cleared).some(k => KB.save.cleared[k]));

  class TitleMenu {
    constructor() {
      this.items = [];
      if (anyCleared()) this.items.push({ id: 'continue', label: '繼續遊戲' });
      this.items.push({ id: 'new', label: '新遊戲' });
      // Extra 模式：通關 W5 後解鎖（KB.session.extra，由 player2 的難度調整讀取）
      if (KB.DEBUG || (KB.save && KB.save.cleared && KB.save.cleared.w5)) this.items.push({ id: 'extra', label: 'Extra 模式' });
      this.items.push({ id: 'help', label: '操作說明' }, { id: 'gallery', label: '能力圖鑑' });
      // 競技場：通關 W5（或 ?debug=1）後解鎖
      if (KB.ArenaScene && (KB.DEBUG || (KB.save && KB.save.cleared && KB.save.cleared.w5))) this.items.push({ id: 'arena', label: '競技場' });
      this.items.push({ id: 'settings', label: '設定' });
      this.sel = 0; this.frame = 0; this.page = 'main'; this.sub = null;
    }
    update(scene) {
      this.frame++;
      const inp = KB.input;
      if (this.page === 'help') {
        if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('select') || inp.pressed('start')) { this.page = 'main'; sfx('menu_back'); return; }
        UI.helpUpdate();
        return;
      }
      if (this.sub) { if (this.sub.update() === 'back') { this.sub = null; this.page = 'main'; } return; }
      const n = this.items.length;
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('select')) { scene.menu = null; sfx('menu_back'); return; }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
        const it = this.items[this.sel];
        sfx('select');
        if (it.id === 'continue') scene.startGame(true);
        else if (it.id === 'new') scene.startGame(false, false);
        else if (it.id === 'extra') scene.startGame(false, true);
        else if (it.id === 'help') { this.page = 'help'; UI.openHelp(); }
        else if (it.id === 'gallery') this.sub = new AbilityGallery();
        else if (it.id === 'arena') { UI.leave(scene, () => KB.setScene(new KB.ArenaScene())); }
        else if (it.id === 'settings') this.sub = new SettingsMenu();
      }
    }
    draw(ctx, scene) {
      if (this.page === 'help') { UI.drawHelp(ctx, { hint: 'Z / SELECT：返回選單' }); return; }
      if (this.sub) { this.sub.draw(ctx); return; }
      // R2-P2-16：面板固定從 logo 底下（y=64）開始、最多長到 y=182（不壓底部資訊列），行高依項目數收斂
      const ms = MS(), n = this.items.length;
      const y0 = (UI.TITLE_MENU_TOP || 64), bot = (UI.TITLE_MENU_BOTTOM || 182);
      const rowH = Math.max(14, Math.min(19, Math.floor((bot - y0 - 12) / n))), h = 12 + n * rowH;
      panel(ctx, 112, y0, 136, h);
      for (let i = 0; i < n; i++) {
        const y = y0 + 6 + i * rowH, sel = this.sel === i;
        if (sel) cursor(ctx, 124, y + 3, this.frame);
        T(ctx, this.items[i].label, 142, y, { color: sel ? C.yellow : '#fff', size: ms });
      }
      fit(ctx, '↑↓ 選擇　Z 確認　SELECT 返回', 128, 204, 250, { color: '#7c8ca8', align: 'center', size: ms });
    }
  }
  KB.TitleMenu = TitleMenu;

  // ======================================================================
  // 遊戲內「?」提示：進新關卡第一房 toast 3 秒，之後右上角常駐小「?」
  // ======================================================================
  KB.sprite('uifb_qmark', { k: '#101828', y: '#ffe040' }, [[
    'kkkkkkkkk',
    'kkyyyyykk',
    'kkykkkykk',
    'kkkkkkykk',
    'kkkkkykkk',
    'kkkkykkkk',
    'kkkkkkkkk',
    'kkkkykkkk',
    'kkkkkkkkk',
  ]], { anchor: 'topleft' });

  // 計時一律用 game.frame（截圖工具只在最後 render 一次，用畫面次數計時會不準）
  const TOAST = 180, FLASH = 60;
  const hint = { game: null, level: null, at: -1e9, abAt: -1e9, lastAbility: undefined };
  UI.resetGameHint = function () { hint.game = null; hint.level = null; hint.at = -1e9; hint.abAt = -1e9; hint.lastAbility = undefined; };
  UI.drawGameHint = function (ctx, game) {
    if (!UI.settings().hints) return;
    const p = game.player, f = game.frame || 0;
    // 新的 GameScene（＝進入關卡）且在第一房 → 從第 0 幀起算，顯示 3 秒提示
    if (hint.game !== game) {
      hint.game = game; hint.level = game.levelId; hint.lastAbility = p ? p.ability : null;
      hint.at = (game.roomIdx === 0 && !game.arena) ? 0 : -1e9; hint.abAt = -1e9;
    }
    // 取得新能力 → 閃 1 秒提醒可以看招式
    const ab = p ? p.ability : null;
    if (ab !== hint.lastAbility) { if (ab) hint.abAt = f; hint.lastAbility = ab; }
    if (game.paused) return;
    const age = f - hint.at, flash = f - hint.abAt;
    if (age >= 0 && age < TOAST) {
      const a = Math.min(1, (TOAST - age) / 20, (age + 1) / 10);
      ctx.globalAlpha = Math.max(0, a);
      const x = 110, y = 5, w = 140, h = 19;    // 右上角，整塊在 4~252 內
      KB.rect(ctx, x, y, w, h, '#101828'); KB.rect(ctx, x + 1, y + 1, w - 2, h - 2, '#182038');
      KB.rect(ctx, x + 1, y, w - 2, 1, '#f0f0f8'); KB.rect(ctx, x + 1, y + h - 1, w - 2, 1, '#f0f0f8');
      KB.rect(ctx, x, y + 1, 1, h - 2, '#f0f0f8'); KB.rect(ctx, x + w - 1, y + 1, 1, h - 2, '#f0f0f8');
      fit(ctx, 'ENTER：暫停／說明', x + w / 2, y + 3, w - 10, { color: '#fff', align: 'center', size: MS() });
      ctx.globalAlpha = 1;
      return;
    }
    // 常駐小「?」（取得新能力後閃爍 1 秒）
    const flashing = flash >= 0 && flash < FLASH;
    if (flashing && ((flash >> 2) & 1)) return;
    ctx.globalAlpha = flashing ? 1 : 0.7;
    sprAt(ctx, 'uifb_qmark', 242, 5, 'tl');
    ctx.globalAlpha = 1;
  };
})();
