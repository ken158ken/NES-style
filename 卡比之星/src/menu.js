// 選單系統（agent: ui-menu）—— 暫停選單 / 標題選單 / 能力圖鑑 / 設定 / 遊戲內「?」提示
// 依賴 ui.js 匯出的繪圖工具（KB.UI.panel / cursor / sprAt / text …），載入順序：ui.js → menu.js。
// 版面依 docs/DESIGN_REFERENCE.md 第 2 章：上半＝能力卡（圖示 + 名稱 + 風味文字 + 招式表），下半＝選單。
// 文字規格：中文一律 UI.MS（12px 像素字型），放不下時 UI.fitText 會截斷補「…」；所有元素夾在 x = 4~252。
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
      moves: [['X（按住）', '吸入'], ['X', '吐出星星'], ['↓', '吞下＝獲得能力'], ['丟能力星', '砸敵人可混合']],
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

  /** 風味文字正規化：字串 → 單元素陣列；空值 → []（fix9 / R9-P2-02） */
  function flavourArr(f) {
    if (Array.isArray(f)) return f;
    return f ? [String(f)] : [];
  }

  UI.abilityInfo = function (key) {
    const d = (key && KB.ABILITIES) ? KB.ABILITIES[key] : null;
    const t = UI.ABILITY_HELP[key || 'none'] || {};
    return {
      key: key || null,
      name: t.name || (d && d.name) || (KB.ABILITY_NAMES && KB.ABILITY_NAMES[key]) || '普通',
      en: t.en || (d && d.hudName) || (KB.ABILITY_HUD && KB.ABILITY_HUD[key]) || 'NORMAL',
      desc: (d && d.desc) || t.desc || '',
      // fix9 / R9-P2-02：def.flavour 規格是陣列，但歷史上有寫成字串的（對字串 slice/[0] 會只取一個字）
      //   → 這裡統一正規化成陣列，任何能力都不會再只畫出一個字。
      flavour: flavourArr((d && d.flavour) || t.flavour || (t.desc ? [t.desc] : [])),
      moves: (d && d.moves) || t.moves || [],
      icon: key ? ((d && d.icon) || ('ui_ability_' + key)) : 'ui_ability_none',
      hat: key ? ((d && d.hat) || ('hat_' + key)) : null,
      color: key ? UI.abilityColor(key) : '#f8a0c8',
    };
  };

  // Round 11（ui）：能力卡 / 圖鑑招式表的「按鍵」欄在觸控時換成虛擬鍵名（X→B、Z／跳→A、SELECT→C）。
  // def.moves 由 abilities 各檔提供（不是本 agent 的檔）⇒ 只在繪製時做字面替換；非觸控時原字串照舊。
  function moveKey(k) {
    if (!k || !UI.touchOn()) return k;
    return String(k)
      .replace(/SELECT/g, UI.hint('select', 'SELECT'))
      .replace(/\bX\b/g, UI.hint('attack', 'X'))
      .replace(/\bZ\b/g, UI.hint('jump', 'Z'))
      .replace(/跳/g, UI.hint('jump', 'Z'));
  }
  UI.moveKey = moveKey;

  // 能力卡片（暫停畫面上半）：需要 w ≥ 200、h ≥ 114
  // Round 5：招式最多 6 招 → 版面隨招式數自動收斂（3 招以下維持原本 2 行風味文字 + 15px 行高，
  // 4~5 招改 1 行風味文字 + 12px 字 / 13px 行高，6 招則不畫風味文字）。任何情況下都不會超出 y+h。
  UI.drawAbilityCard = function (ctx, x, y, w, h, key, opts) {
    opts = opts || {};
    const info = UI.abilityInfo(key), ms = MS();
    if (opts.panel !== false) panel(ctx, x, y, w, h);
    if (!sprAt(ctx, info.icon, x + 7, y + 8, 'tl')) {
      KB.rect(ctx, x + 7, y + 8, 24, 16, '#181c28'); KB.rect(ctx, x + 8, y + 9, 22, 14, info.color);
    }
    T(ctx, info.name, x + 38, y + 2, { color: C.yellow, size: 16 });
    KB.text(ctx, info.en, x + w - 8, y + 11, { color: info.key ? info.color : '#98a8c0', align: 'right' });
    const moves = (info.moves || []).slice(0, 6), n = moves.length;
    const big = n <= 3;
    const flN = big ? 2 : (n >= 6 ? 0 : 1);
    const flTop = big ? 28 : 26, flH = big ? 15 : 13, flSize = big ? ms : 12;
    // 風味文字
    const fl = (info.flavour || []).slice(0, flN);
    for (let i = 0; i < fl.length; i++) fit(ctx, fl[i], x + 8, y + flTop + i * flH, w - 16, { color: '#c8d8f0', size: flSize });
    const divY = big ? 61 : (flTop + flN * flH + 2);
    KB.rect(ctx, x + 7, y + divY, w - 14, 1, '#405070');
    // 招式表：左欄按鍵、右欄招式名；沒有按鍵的列＝補充說明
    const rowH = big ? 15 : (n >= 5 ? 13 : 14), msz = big ? ms : 12, top = divY + 3;
    for (let i = 0; i < n; i++) {
      const my = y + top + i * rowH, k = moves[i][0], name = moves[i][1];
      if (my + rowH > y + h - 2) break;      // 保險：絕不畫出面板外
      if (k) {
        fit(ctx, moveKey(k), x + 9, my, 86, { color: C.cyan, size: msz, nomix: true });
        fit(ctx, name, x + 100, my, w - 108, { color: '#ffffff', size: msz });
      } else fit(ctx, '・' + name, x + 9, my, w - 18, { color: '#98a8c0', size: msz });
    }
  };

  const onOff = v => (v ? '開' : '關');

  // ======================================================================
  // 暫停選單（KB.PauseMenu）—— game.js 只呼叫 update(game) / draw(ctx, game)
  // ======================================================================
  // 2 列（row-major）；Round 11 的「全螢幕」加在第 1 列第 4 欄 —— 面板高度 / 列距 / 提示位置
  // 完全沿用 Round 10（第 3 列會壓到提示行），只有第 1 列改成 4 欄的 x 座標。
  const PAUSE_ROWS = () => {
    const r0 = [{ id: 'resume', label: '繼續' }, { id: 'help', label: '操作說明' }, { id: 'map', label: '回到地圖' }];
    // 全螢幕：KB.toggleFullscreen 一定在（main.js），瀏覽器不支援時畫灰字（UI.fullscreenOK）
    if (KB.toggleFullscreen) r0.push({ id: 'fs', label: '全螢幕', fs: true });
    const r1 = [{ id: 'music', label: '音樂', vol: 'music' }, { id: 'sfx', label: '音效', vol: 'sfx' }, { id: 'title', label: '回到標題' }];
    return [r0, r1];
  };
  // 3 欄＝Round 10 原座標；4 欄＝重新排（游標畫在 x-14，所以每欄至少要隔 label 寬 + 16）
  const COL_X = [24, 102, 180], COL_X4 = [20, 62, 128, 194], ROW_Y = [134, 154];
  /** 攤平成含 r / c / x / y 的清單（this.sel 仍是單一索引） */
  function pauseItems() {
    const rows = PAUSE_ROWS(), out = [];
    rows.forEach((row, r) => {
      const xs = row.length >= 4 ? COL_X4 : COL_X;
      row.forEach((it, c) => {
        const nx = xs[c + 1] === undefined ? 252 : xs[c + 1] - 14;
        out.push(Object.assign({}, it, { r, c, x: xs[c], y: ROW_Y[r], rowLen: row.length, w: Math.min(72, nx - xs[c]) }));
      });
    });
    out.rowLens = rows.map(r => r.length);
    return out;
  }

  function unduck() { const a = AU(); if (a && a.duck) { try { a.duck(false); } catch (e) { } } }

  class PauseMenu {
    constructor(game) { this.sel = 0; this.frame = 0; this.page = 'main'; this.game = game || null; this.items = pauseItems(); }
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
      const items = this.items = pauseItems(), n = items.length, lens = items.rowLens, nr = lens.length;
      if (this.sel >= n) this.sel = n - 1;
      const cur = items[this.sel];
      // 列長度可能不同（4 / 3）：上下換列時欄位夾到該列長度內，左右在該列內循環
      const at = (r, c) => { const i = items.findIndex(it => it.r === r && it.c === c); return i < 0 ? 0 : i; };
      if (inp.pressed('down')) { const r = (cur.r + 1) % nr; this.sel = at(r, Math.min(cur.c, lens[r] - 1)); sfx('menu'); }
      if (inp.pressed('up')) { const r = (cur.r - 1 + nr) % nr; this.sel = at(r, Math.min(cur.c, lens[r] - 1)); sfx('menu'); }
      if (inp.pressed('right')) { this.sel = at(cur.r, (cur.c + 1) % cur.rowLen); sfx('menu'); }
      if (inp.pressed('left')) { this.sel = at(cur.r, (cur.c - 1 + cur.rowLen) % cur.rowLen); sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('attack')) this.choose(game);
    }
    choose(game) {
      const it = (this.items || pauseItems())[this.sel];
      if (!it) return;
      if (it.fs) {
        if (!UI.fullscreenOK()) { sfx('menu_back'); return; }   // iOS Safari：不支援就不做事（畫面上已是灰字）
        sfx('select');
        try { KB.toggleFullscreen(); } catch (e) { }
        return;
      }
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
      if (this.page === 'help') { UI.drawHelp(ctx, { hint: UI.hint('jump', 'Z') + ' / ' + UI.hint('select', 'SELECT') + '：返回暫停選單' }); return; }
      const f = this.frame, ms = MS();
      UI.drawAbilityCard(ctx, 4, 10, 248, 114, game.player ? game.player.ability : null);
      // PAUSE 標籤（壓在卡片上緣，整塊在畫面內）
      panel(ctx, 100, 2, 56, 14, C.dark, C.border);
      KB.text(ctx, 'PAUSE', 128, 5, { color: C.yellow, align: 'center' });
      // R7-P2-02：Extra 模式在標題旁再掛一塊紅色「EXTRA」牌
      if (KB.extraOn && KB.extraOn()) {
        const ew = KB.textWidth('EXTRA') + 8;
        panel(ctx, 160, 2, ew, 14, '#380010', '#ff6060');
        KB.text(ctx, 'EXTRA', 160 + ew / 2, 5, { color: ((f >> 4) & 1) ? '#ff6060' : '#ff2020', align: 'center', outline: '#200008' });
      }
      // 選單：2 列（第 1 列 3 或 4 欄）
      const items = this.items = pauseItems(), fsOK = UI.fullscreenOK();
      panel(ctx, 4, 128, 248, 62);
      for (let i = 0; i < items.length; i++) {
        const it = items[i], x = it.x, y = it.y, sel = this.sel === i;
        const grey = it.fs && !fsOK;
        if (sel) cursor(ctx, x - 14, y + 3, f);
        fit(ctx, it.label, x, y, it.vol ? 44 : it.w, { color: grey ? '#5c6884' : sel ? C.yellow : '#fff', size: ms });
        if (it.vol) T(ctx, onOff(UI.volOn(it.vol)), x + 70, y, { color: UI.volOn(it.vol) ? '#80e0a0' : C.grey, align: 'right', size: ms });
      }
      // 不支援全螢幕的瀏覽器（iOS Safari）：游標停在該項時於提示行說明原因
      const fsSel = items[this.sel] && items[this.sel].fs && !fsOK;
      fit(ctx, fsSel ? '全螢幕：此瀏覽器不支援'
        : (UI.hint('up', '↑↓←→') + ' 選擇　' + UI.hint('jump', 'Z') + ' 確認　' + UI.hint('start', 'ENTER') + ' 繼續'),
        128, 173, 240, { color: fsSel ? '#e0a0a0' : C.grey, align: 'center', size: ms });
    }
  }
  KB.PauseMenu = PauseMenu;

  // ======================================================================
  // 能力圖鑑（Round 5：20 能力 → 縮圖列每頁 8 個、多頁；未發現的畫剪影）
  // ======================================================================
  // Round 8（ach2）：成就 40 條 → 每頁 10 條、4 頁。
  // 版面：清單 10 列 ×15px（名稱 + CLEAR/鎖）＋ 下方詳情條（提示 + 解鎖時間）＋ 頁碼。
  const ACH_PER_PAGE = 10;
  const ACH_ROW_H = 15, ACH_TOP = 27;
  const GAL_PER_PAGE = 8;
  // 未發現的能力：名稱 / 說明 / 招式全部隱藏（連 hudName 首字都不露），只留剪影與「吸入 ??? 就能獲得」
  const UNKNOWN_CN = '？？？', UNKNOWN_EN = '???';

  class AbilityGallery {
    // Round 6：tab 0 = 能力圖鑑、tab 1 = 成就（SELECT 切換）
    constructor(tab) { this.i = 0; this.t = 0; this.frame = 0; this.tab = tab | 0; this.ap = 0; this.ai = 0; UI.clearAbilityNew(); }
    get achList() { return (KB.PROG && KB.PROG.ACH) || []; }
    get achPages() { return Math.max(1, Math.ceil((this.achList.length || 1) / ACH_PER_PAGE)); }
    get keys() { return UI.abilityKeys(); }
    get pages() { return Math.max(1, Math.ceil((this.keys.length || 1) / GAL_PER_PAGE)); }
    get page() { return Math.floor(this.i / GAL_PER_PAGE); }
    update() {
      this.frame++; this.t += 1 / 60;
      const inp = KB.input;
      // SELECT：能力圖鑑 ↔ 成就分頁
      if (inp.pressed('select')) { this.tab = this.tab ? 0 : 1; sfx('menu'); return null; }
      if (inp.pressed('start') || inp.pressed('jump') || inp.pressed('attack')) { sfx('menu_back'); return 'back'; }
      if (this.tab === 1) {
        const pg = this.achPages, n = this.achList.length || 1;
        // ←→ 翻頁；↑↓ 移動游標（跨頁時自動換頁）
        if (inp.pressed('right')) { this.ap = (this.ap + 1) % pg; this.ai = Math.min(n - 1, this.ap * ACH_PER_PAGE); sfx('menu'); }
        if (inp.pressed('left')) { this.ap = (this.ap - 1 + pg) % pg; this.ai = Math.min(n - 1, this.ap * ACH_PER_PAGE); sfx('menu'); }
        if (inp.pressed('down')) { this.ai = (this.ai + 1) % n; this.ap = Math.floor(this.ai / ACH_PER_PAGE); sfx('menu'); }
        if (inp.pressed('up')) { this.ai = (this.ai - 1 + n) % n; this.ap = Math.floor(this.ai / ACH_PER_PAGE); sfx('menu'); }
        return null;
      }
      const n = this.keys.length || 1;
      if (inp.pressed('right')) { this.i = (this.i + 1) % n; sfx('menu'); }
      if (inp.pressed('left')) { this.i = (this.i - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('down')) { this.i = Math.min(n - 1, this.i + GAL_PER_PAGE); sfx('menu'); }
      if (inp.pressed('up')) { this.i = Math.max(0, this.i - GAL_PER_PAGE); sfx('menu'); }
      return null;
    }
    // 分頁標籤列（兩個分頁共用）
    drawTabs(ctx) {
      const on = this.tab;
      // font agent：底線寬度改用實測字寬（12px 像素字比舊的 14px 黑體窄，寫死 60/32 會凸出去）
      // font2：標題列只有 19px 高（面板 4 ~ 分隔線 23）且右邊還要放 SELECT 提示與「發現 n/m」，
      //        16px 分頁標籤會壓到底線與提示 ⇒ 分頁維持 12px；這一頁的標題級文字是能力名（16px）。
      const ts = MS();
      const t0 = '能力圖鑑', t1 = '成就', w0 = TW(t0, { size: ts }), w1 = TW(t1, { size: ts });
      const x1 = 10 + w0 + 14;
      T(ctx, t0, 10, 4, { color: on === 0 ? C.yellow : '#67758f', size: ts });
      T(ctx, t1, x1, 4, { color: on === 1 ? C.yellow : '#67758f', size: ts });
      KB.rect(ctx, on === 0 ? 10 : x1, 21, on === 0 ? w0 : w1, 1, C.yellow);
      KB.text(ctx, UI.hint('select', 'SELECT'), 116, 11, { color: '#5c6884' });     // ← 提示：SELECT 切換分頁（觸控時＝C，同樣是 ASCII）
    }
    // 成就分頁（40 條 / 每頁 10 條）：清單只放名稱與狀態，游標那一條的提示與解鎖時間畫在下方詳情條
    drawAch(ctx) {
      const PG = KB.PROG, list = this.achList, total = list.length;
      const got = (PG && PG.achCount) ? PG.achCount() : 0;
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)');
      panel(ctx, 4, 4, 248, 210);
      this.drawTabs(ctx);
      T(ctx, '達成 ' + got + '/' + total, 242, 8, { color: got >= total && total ? C.yellow : '#8fa0bc', size: UI.MS_SMALL, align: 'right' });
      KB.rect(ctx, 14, 23, 228, 1, '#405070');
      if (!total) { fit(ctx, '成就系統尚未載入', 128, 100, 228, { color: C.grey, align: 'center', size: MS() }); return; }
      if (this.ai >= total) this.ai = total - 1;
      const p0 = this.ap * ACH_PER_PAGE;
      for (let k = 0; k < ACH_PER_PAGE; k++) {
        const idx = p0 + k, a = list[idx]; if (!a) break;
        const y = ACH_TOP + k * ACH_ROW_H, ok = !!(PG && PG.has && PG.has(a.id)), sel = idx === this.ai;
        KB.rect(ctx, 12, y - 1, 232, ACH_ROW_H - 1, sel ? 'rgba(72,60,120,0.85)' : (ok ? 'rgba(44,36,80,0.65)' : 'rgba(20,26,44,0.5)'));
        if (sel) { KB.rect(ctx, 12, y - 1, 1, ACH_ROW_H - 1, C.yellow); KB.rect(ctx, 243, y - 1, 1, ACH_ROW_H - 1, C.yellow); }
        if (PG && PG.drawTrophy) PG.drawTrophy(ctx, 16, y + 2, ok ? C.yellow : '#3c465c');
        // font agent：名稱 12px 像素字最寬約 72 ⇒ 收到 88；時間戳（8×8，11 字 = 88px）右緣
        // 從 198 移到 192，與 CLEAR(200~240) 之間留 8px，不再黏成「10:14CLEAR」。
        fit(ctx, a.name, 30, y, 88, { color: ok ? C.yellow : '#6c7c98', size: MS() });
        if (ok) {
          const ts = (PG && PG.achTimeStr) ? PG.achTimeStr(a.id) : '';
          if (ts) KB.text(ctx, ts, 192, y + 3, { color: '#6c7c98', align: 'right' });
          KB.text(ctx, 'CLEAR', 240, y + 3, { color: '#80e0a0', align: 'right' });
        } else if (!sprAt(ctx, 'uifb_lock', 234, y + 1, 'tl')) KB.text(ctx, '-', 240, y + 3, { color: '#4c5670', align: 'right' });
      }
      // 詳情條：游標那一條的說明（未解鎖＝要做什麼；已解鎖＝條件 + 解鎖時間）
      const cur = list[this.ai], okc = !!(cur && PG && PG.has && PG.has(cur.id));
      const dy = ACH_TOP + ACH_PER_PAGE * ACH_ROW_H + 2;
      KB.rect(ctx, 12, dy, 232, 1, '#405070');
      if (cur) {
        fit(ctx, cur.hint, 14, dy + 3, 168, { color: okc ? '#c8d8f0' : '#8fa0bc', size: UI.MS_SMALL });
        const ts = okc && PG.achTimeStr ? PG.achTimeStr(cur.id) : '';
        KB.text(ctx, okc ? (ts || 'UNLOCKED') : 'LOCKED', 242, dy + 5, { color: okc ? '#80e0a0' : '#5c6884', align: 'right' });
      }
      fit(ctx, UI.hint('up', '↑↓') + ' 選擇　' + UI.hint('left', '←→') + ' 翻頁　' + UI.hint('jump', 'Z') + ' 返回', 113, 199, 202, { color: C.grey, align: 'center', size: MS() });
      KB.text(ctx, (this.ap + 1) + '/' + this.achPages, 242, 202, { color: C.grey, align: 'right' });
    }
    draw(ctx) {
      // 版面（面板 y 4~214）：標題列 4~23 ／ 卡比預覽 + 名稱 26~60 ／ 說明 62~ ／ 招式表 ~172 ／ 縮圖列 176~196 ／ 提示 199
      // 招式最多 6 列：5 列以上改 12px 字 + 13px 行高，並讓說明降級、風味文字省略，保證不壓到縮圖列。
      const ms = MS();
      if (this.tab === 1) { this.drawAch(ctx); return; }
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.72)');
      panel(ctx, 4, 4, 248, 210);
      const keys = this.keys, total = Math.max(1, keys.length), key = keys[this.i] || null;
      const seen = UI.isSeen(key), info = UI.abilityInfo(key);
      // 標題列：能力圖鑑 ／ 發現進度 n/20 ／ 目前第幾個
      this.drawTabs(ctx);
      const sn = UI.seenCount();
      T(ctx, '發現 ' + sn + '/' + total, 242, 8, { color: sn >= total ? C.yellow : '#8fa0bc', size: UI.MS_SMALL, align: 'right' });
      KB.rect(ctx, 14, 23, 228, 1, '#405070');
      // 左：戴帽子的卡比（未發現 → 全黑剪影、不戴帽子）
      KB.rect(ctx, 14, 26, 52, 34, '#101828'); KB.rect(ctx, 15, 27, 50, 32, '#20304c');
      const gy = 57;
      // fix5b / R5-P2-06：dragon / mech / ghost / giant 畫變身後的外型（未發現時仍是全黑剪影）
      UI.drawPreview(ctx, seen ? key : null, 40, gy, { t: this.t, tint: seen ? undefined : '#0c1220' });
      KB.rect(ctx, 26, gy + 1, 28, 2, 'rgba(0,0,0,0.35)');
      // 右：圖示 + 名稱 + 英文名
      if (!seen) {
        KB.rect(ctx, 74, 28, 24, 16, '#181c28'); KB.rect(ctx, 75, 29, 22, 14, '#2c3650');
        KB.text(ctx, '?', 86, 32, { color: '#6c7c98', align: 'center' });
      } else if (!sprAt(ctx, info.icon, 74, 28, 'tl')) {
        KB.rect(ctx, 74, 28, 24, 16, '#181c28'); KB.rect(ctx, 75, 29, 22, 14, info.color);
      }
      T(ctx, seen ? info.name : UNKNOWN_CN, 104, 26, { color: seen ? C.yellow : '#7c8ca8', size: 16 });
      KB.text(ctx, seen ? info.en : UNKNOWN_EN, 242, 32, { color: seen ? info.color : '#5c6884', align: 'right' });
      if (seen && key) this.drawLv(ctx, key);
      if (!seen) {
        // 未發現：說明與招式全部隱藏，只給「去哪裡拿」的提示
        T(ctx, UNKNOWN_CN, 14, 64, { color: '#8fa0bc', size: ms });
        KB.rect(ctx, 14, 90, 228, 1, '#405070');
        fit(ctx, '吸入 ??? 就能獲得', 128, 106, 228, { color: C.cyan, align: 'center', size: ms });
        fit(ctx, '在關卡裡拿到這個能力就會解鎖', 128, 130, 228, { color: '#6c7c98', align: 'center', size: UI.MS_SMALL });
      } else {
        const moves = (info.moves || []).slice(0, 6), n = moves.length, compact = n >= 5;
        // 說明：整列寬、最多 2 行（wrapLines 不在標點前斷行、行首不會是「，。」）
        let ds = compact ? UI.MS_SMALL : ms;
        let dl = info.desc ? UI.wrapLines(info.desc, 228, { size: ds }, 9) : [];
        if (dl.length > 2) { ds = UI.MS_SMALL; dl = UI.wrapLines(info.desc, 228, { size: ds }, 2); }
        const dlh = 14;                       // 12px 像素字的行高（SPEC 3.5）
        for (let i = 0; i < dl.length; i++) T(ctx, dl[i], 14, 62 + i * dlh, { color: '#c8d8f0', size: ds });
        // 風味文字（灰字、1 行，放不下就省略）
        const divY = compact ? 90 : 104, descBot = 62 + dl.length * dlh, fl = (info.flavour || [])[0];
        if (fl && descBot + 12 <= divY) fit(ctx, fl, 14, descBot, 228, { color: '#7c8ca8', size: UI.MS_SMALL });
        KB.rect(ctx, 14, divY, 228, 1, '#405070');
        // 招式表（最多 6 列）：左欄按鍵 95px、右欄招式名 129px
        const rowH = compact ? 13 : 15, msz = compact ? UI.MS_SMALL : ms;
        let y = divY + 4;
        for (const m of moves) {
          if (y + rowH > 173) break;
          if (m[0]) {
            fit(ctx, moveKey(m[0]), 14, y, 95, { color: C.cyan, size: msz, nomix: true });
            fit(ctx, m[1], 113, y, 129, { color: '#fff', size: msz });
          } else fit(ctx, '・' + m[1], 14, y, 228, { color: '#98a8c0', size: msz });
          y += rowH;
        }
      }
      // 縮圖列（每頁 8 個）：未發現的畫成剪影方塊 + 「?」
      KB.rect(ctx, 14, 172, 228, 1, '#405070');
      const p0 = this.page * GAL_PER_PAGE;
      for (let s = 0; s < GAL_PER_PAGE; s++) {
        const i = p0 + s; if (i >= keys.length) break;
        const k = keys[i], x = 16 + s * 28, sel = i === this.i, ks = UI.isSeen(k);
        KB.rect(ctx, x, 176, 26, 20, sel ? C.yellow : '#101828');
        KB.rect(ctx, x + 1, 177, 24, 18, '#20304c');
        if (!ks) {
          KB.rect(ctx, x + 2, 178, 22, 14, '#2c3650');
          KB.text(ctx, '?', x + 13, 181, { color: '#6c7c98', align: 'center' });
        } else {
          const d = KB.ABILITIES ? KB.ABILITIES[k] : null;
          if (!sprAt(ctx, (d && d.icon) || ('ui_ability_' + k), x + 1, 178, 'tl')) KB.rect(ctx, x + 2, 179, 22, 14, UI.abilityColor(k));
        }
      }
      fit(ctx, UI.hint('left', '←→') + ' 能力　' + UI.hint('up', '↑↓') + ' 頁　' + UI.hint('jump', 'Z') + ' 返回', 113, 199, 202, { color: C.grey, align: 'center', size: ms });
      KB.text(ctx, (this.page + 1) + '/' + this.pages, 242, 202, { color: C.grey, align: 'right' });
    }
    // 能力等級列（Lv 星 + xp 進度條）：畫在圖示 / 英文名下方的空白列
    drawLv(ctx, key) {
      const PG = KB.PROG; if (!PG || !PG.level) return;
      const lv = PG.level(key), nx = PG.xpNext(key), col = lv >= 3 ? C.yellow : lv >= 2 ? '#80e0ff' : '#98a8c0';
      KB.text(ctx, 'Lv' + lv, 74, 47, { color: col });
      if (PG.drawLvStars) PG.drawLvStars(ctx, 100, 48, key);
      const bx = 122, bw = 120;
      KB.rect(ctx, bx, 46, bw, 8, '#101828'); KB.rect(ctx, bx + 1, 47, bw - 2, 6, '#2a3450');
      if (nx.max) {
        KB.rect(ctx, bx + 1, 47, bw - 2, 6, '#6a5820');
        KB.text(ctx, 'MAX  xp ' + nx.xp, bx + bw / 2, 47, { color: C.yellow, align: 'center' });
      } else {
        const u = Math.max(0, Math.min(1, (nx.xp - nx.from) / Math.max(1, nx.need - nx.from)));
        KB.rect(ctx, bx + 1, 47, Math.round((bw - 2) * u), 6, '#58c8f8');
        KB.text(ctx, nx.xp + '/' + nx.need, bx + bw / 2, 47, { color: '#fff', align: 'center', outline: '#101828' });
      }
    }
  }
  KB.AbilityGallery = AbilityGallery;

  // ======================================================================
  // 設定頁：音樂 / 音效 音量 0~10 格滑桿、按鍵提示開關
  // ======================================================================
  // Round 11（ui）：觸控版面設定的存取（一律防禦式；KB.TOUCH 不存在時這些項目不會出現）
  // qa11 P2：只在觸控裝置顯示（桌機版面維持 R10 的 7 項）
  const hasTouchApi = () => !!(KB.TOUCH && KB.TOUCH.setLayout && KB.TOUCH.layout && (KB.TOUCH.available || (KB.input.touchActive && KB.input.touchActive())));
  function touchVal(key) { const t = KB.TOUCH; return (t && t.layout) ? t.layout[key] : undefined; }
  /** 目前值在 it.cycle 裡的索引；數值取「最接近」的一檔（touch.js 的預設值不一定剛好等於某一檔）*/
  function touchIdx(it) {
    const v = touchVal(it.touch);
    const i = it.cycle.indexOf(v);
    if (i >= 0) return i;
    if (typeof v === 'number' && isFinite(v)) {
      let best = 0, bd = Infinity;
      it.cycle.forEach((c, k) => { if (typeof c === 'number') { const d = Math.abs(c - v); if (d < bd) { bd = d; best = k; } } });
      return best;
    }
    return 0;
  }
  function touchStep(it, d) {
    const n = it.cycle.length, v = it.cycle[(touchIdx(it) + d + n) % n], o = {};
    o[it.touch] = v;
    try { KB.TOUCH.setLayout(o); } catch (e) { return false; }
    return true;
  }

  const SET_ITEMS = [
    { id: 'music', label: '音樂音量', vol: 'music' },
    { id: 'sfx', label: '音效音量', vol: 'sfx' },
    { id: 'hints', label: '按鍵提示' },
    { id: 'scale', label: '畫面縮放', cycle: [0, 2, 3, 4], names: ['自動', '2x', '3x', '4x'] },
    { id: 'vfx', label: '特效強度', cycle: ['high', 'mid', 'low'], names: ['高', '中', '低'], str: true },
    // ── Round 8（ach2 整合）：下面兩項在對應系統載入時才出現 ─────────────────────
    // skins agent：KB.SKINS.list() / current() / set(id) / unlocked(id) / name(id)
    { id: 'skin', label: '卡比配色', skins: true, need: () => !!(KB.SKINS && KB.SKINS.list) },
    // ── Round 11（ui）：觸控按鍵版面 —— 值存在 KB.TOUCH.layout（setLayout 自己存檔），
    //    不是 KB.save.settings ⇒ 走 it.touch 分支而不是 it.cycle。KB.TOUCH 不存在時整批隱藏。
    { id: 'touchMode', label: '觸控按鍵', touch: 'mode', cycle: ['auto', 'on'], names: ['自動', '開'], need: hasTouchApi },   // qa11 P1：拿掉「關」（會鎖死）
    { id: 'touchSide', label: '按鍵位置', touch: 'side', cycle: ['right', 'left'], names: ['右手', '左手'], need: hasTouchApi },
    { id: 'touchSize', label: '按鍵大小', touch: 'size', cycle: [0.8, 1, 1.2], names: ['小', '中', '大'], need: hasTouchApi },
    { id: 'touchOpacity', label: '按鍵透明度', touch: 'opacity', cycle: [0.3, 0.5, 0.8], names: ['淡', '中', '濃'], need: hasTouchApi },
    // Round 11b（touch2）：方向鍵樣式（十字 / 搖桿）與浮動搖桿（手指落在空白區就把搖桿搬過去）
    { id: 'touchStick', label: '方向鍵樣式', touch: 'stick', cycle: ['dpad', 'stick'], names: ['十字', '搖桿'], need: hasTouchApi },
    { id: 'touchFloat', label: '搖桿浮動', touch: 'stickFloat', cycle: [false, true], names: ['關', '開'], need: hasTouchApi },
    // saves-input agent：KB.KeyConfigMenu()（子選單版，update() 回傳 'back'）；只有 KeyConfigScene 時退而用 {menu:true}
    {
      id: 'keyconfig', label: '按鍵設定', arrow: true,
      need: () => !!(KB.KeyConfigMenu || KB.KeyConfigScene),
      sub: () => (KB.KeyConfigMenu ? KB.KeyConfigMenu() : (KB.KeyConfigScene ? new KB.KeyConfigScene({ menu: true }) : null)),
    },
  ];
  /** 目前實際要顯示的設定項（依存在條件過濾；每次開啟設定頁時重算） */
  function setItems() { return SET_ITEMS.filter(it => !it.need || it.need()); }
  // 卡比配色：只列已解鎖的
  function skinList() {
    const S = KB.SKINS; if (!S || !S.list) return [];
    let l = [];
    try { l = S.list() || []; } catch (e) { return []; }
    l = l.map(x => (x && typeof x === 'object') ? (x.id || x.key || '') : x).filter(Boolean);
    if (S.unlocked) l = l.filter(id => { try { return S.unlocked(id); } catch (e) { return true; } });
    return l;
  }
  function skinName(id) {
    const S = KB.SKINS;
    try { if (S && S.name) return S.name(id) || String(id); } catch (e) { }
    return String(id || '-');
  }
  function skinStep(d) {
    const S = KB.SKINS, l = skinList(); if (!S || !l.length) return null;
    let cur = null;
    try { cur = S.current ? S.current() : null; } catch (e) { }
    cur = (cur && typeof cur === 'object') ? (cur.id || cur.key) : cur;
    let i = l.indexOf(cur); if (i < 0) i = 0;
    const id = l[(i + d + l.length) % l.length];
    try { if (S.set) S.set(id); } catch (e) { }
    return id;
  }
  function skinCurName() {
    const S = KB.SKINS, l = skinList(); if (!S || !l.length) return '-';
    let cur = null;
    try { cur = S.current ? S.current() : null; } catch (e) { }
    cur = (cur && typeof cur === 'object') ? (cur.id || cur.key) : cur;
    return skinName(cur || l[0]);
  }
  /**
   * R8-P1-01：設定頁「卡比配色」的即時預覽。
   * 畫目前（或指定）配色的 kirby_idle（KB.SKINS.drawPreview 的錨點＝底部中央），
   * 切配色的下一幀就換色。KB.SKINS 沒載入時安靜跳過。
   */
  function skinPreview(ctx, x, y, id) {
    const S = KB.SKINS;
    if (!S || typeof S.drawPreview !== 'function') return false;
    try { S.drawPreview(ctx, x, y, id || null, { frame: 0 }); return true; } catch (e) { return false; }
  }
  function slider(ctx, x, y, level) {
    for (let i = 0; i < 10; i++) {
      const cx = x + i * 8, on = i < level;
      KB.rect(ctx, cx, y, 7, 10, '#101828');
      KB.rect(ctx, cx + 1, y + 1, 5, 8, on ? (i >= 8 ? '#ffe040' : '#80e0a0') : '#39445c');
    }
  }
  // Round 11：設定項最多 11 項（+4 觸控）⇒ 一頁只顯示 SET_WINDOW 項，其餘捲動。
  // 7 是「不改變 Round 10 版面」的上限（面板高 197、py 14 ⇒ 底 211 < 224）。
  const SET_WINDOW = 7;
  class SettingsMenu {
    constructor() { this.sel = 0; this.top = 0; this.frame = 0; this.items = setItems(); this.sub = null; }
    update() {
      this.frame++;
      // 子選單（按鍵設定）：吃掉輸入直到它回傳 'back'
      if (this.sub) {
        let r = null;
        try { r = this.sub.update(1); } catch (e) { r = 'back'; }
        if (r === 'back') { this.sub = null; sfx('menu_back'); }
        return null;
      }
      const items = this.items = this.items && this.items.length ? this.items : setItems();
      const inp = KB.input, n = items.length, it = items[this.sel] || items[0];
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; sfx('menu'); }
      if (inp.pressed('up')) { this.sel = (this.sel - 1 + n) % n; sfx('menu'); }
      this.clampTop(n);
      const d = inp.pressed('right') ? 1 : inp.pressed('left') ? -1 : 0;
      if (it.sub) {
        if (inp.pressed('jump') || inp.pressed('attack')) {
          const sc = it.sub();
          if (sc) { sfx('select'); this.sub = sc; if (sc.enter) { try { sc.enter(); } catch (e) { } } return null; }
        }
      } else if (it.skins) {
        const step = d || (inp.pressed('jump') || inp.pressed('attack') ? 1 : 0);
        if (step && skinStep(step)) sfx('menu');
      } else if (it.vol) {
        if (d) { UI.volStep(it.vol, d); sfx('menu'); }
        if (inp.pressed('jump') || inp.pressed('attack')) { UI.toggleVol(it.vol); sfx('menu'); }
      } else if (it.touch) {
        const step = d || (inp.pressed('jump') || inp.pressed('attack') ? 1 : 0);
        if (step && touchStep(it, step)) sfx('menu');
      } else if (it.cycle) {
        const step = d || (inp.pressed('jump') || inp.pressed('attack') ? 1 : 0);
        if (step) {
          const st = UI.settings(), n = it.cycle.length;
          let i = it.cycle.indexOf(it.str ? (st[it.id] || it.cycle[0]) : (st[it.id] | 0)); if (i < 0) i = 0;
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
    /** 捲動視窗：項目 ≤ SET_WINDOW 時 top 恆為 0，版面與 Round 10 完全相同 */
    clampTop(n) {
      const w = Math.min(n, SET_WINDOW);
      if (n <= w) { this.top = 0; return w; }
      if (this.sel < this.top) this.top = this.sel;
      if (this.sel > this.top + w - 1) this.top = this.sel - w + 1;
      this.top = Math.max(0, Math.min(n - w, this.top));
      return w;
    }
    draw(ctx) {
      const ms = MS();
      // 子選單（按鍵設定）自己不畫底（它原本是整個場景），這裡先鋪一層暗底再交給它
      if (this.sub) { KB.rect(ctx, 0, 0, W, H, 'rgba(6,10,20,0.94)'); try { this.sub.draw(ctx); return; } catch (e) { this.sub = null; } }
      const items = this.items = this.items && this.items.length ? this.items : setItems();
      const n = items.length, w = this.clampTop(n), top = this.top;
      // 版面隨「可見」項目數收斂（5 項＝原本的 y36 面板；7 項時整塊往上長，兩行提示仍在面板內）
      // Round 11：加了 4 個觸控項後最多 11 項 ⇒ 超過 SET_WINDOW 就捲動（右側位置條 + 上下小三角）
      const rowH = w >= 7 ? 17 : 18;
      const h = 34 + 6 + w * rowH + 6 + 32, py = Math.max(14, Math.round((H - h) / 2));
      KB.rect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.7)');
      panel(ctx, 24, py, 208, h);
      T(ctx, '設定', 128, py + 4, { color: C.yellow, align: 'center', size: 16 });
      const divY = py + 28, y0 = divY + 6;
      KB.rect(ctx, 34, divY, 188, 1, '#405070');
      const st = UI.settings();
      // 有捲動時值欄往左讓 6px 給位置條
      const vx = n > w ? 216 : 222;
      for (let k = 0; k < w; k++) {
        const i = top + k; if (i >= n) break;
        const it = items[i], y = y0 + k * rowH, sel = this.sel === i;
        if (sel) cursor(ctx, 34, y + 3, this.frame);
        fit(ctx, it.label, 48, y, 66, { color: sel ? C.yellow : '#fff', size: ms });
        if (it.vol) { slider(ctx, 122, y + 2, UI.volLevel(it.vol)); KB.text(ctx, String(UI.volLevel(it.vol)), vx, y + 3, { color: '#c8d8f0', align: 'right' }); }
        else if (it.arrow) fit(ctx, '設定 ›', vx, y, 76, { color: sel ? C.yellow : '#80e0a0', align: 'right', size: ms });
        else if (it.skins) {
          // R8-P1-01：名稱靠左讓出 24px，右側畫該配色的卡比（切換時即時變色）
          fit(ctx, skinCurName(), vx - 20, y, 74, { color: '#80e0a0', align: 'right', size: ms });
          skinPreview(ctx, vx - 3, y + 14);
        }
        else if (it.touch) {
          const j = touchIdx(it);
          T(ctx, it.names[j], vx, y, { color: (it.touch === 'mode' && j === 2) ? C.grey : '#80e0a0', align: 'right', size: ms });
        }
        else if (it.cycle) {
          let j = it.cycle.indexOf(it.str ? (st[it.id] || it.cycle[0]) : (st[it.id] | 0)); if (j < 0) j = 0;
          T(ctx, it.names[j], vx, y, { color: j === 0 ? '#c8d8f0' : '#80e0a0', align: 'right', size: ms });
        } else T(ctx, onOff(st[it.id]), vx, y, { color: st[it.id] ? '#80e0a0' : C.grey, align: 'right', size: ms });
      }
      // 捲動指示（上下小三角 + 右側位置條）
      if (n > w) {
        const listT = y0 - 2, listH = w * rowH, blink = (this.frame >> 3) & 1;
        if (top > 0 && blink) for (let r = 0; r < 3; r++) KB.rect(ctx, 226 - r, listT + r, 1 + r * 2, 1, C.yellow);
        if (top + w < n && blink) for (let r = 0; r < 3; r++) KB.rect(ctx, 224 + r, listT + listH - 3 + r, 5 - r * 2, 1, C.yellow);
        const barH = Math.max(6, Math.round((listH - 10) * w / n)), barY = listT + 5 + Math.round((listH - 10 - barH) * top / (n - w));
        KB.rect(ctx, 225, listT + 5, 2, listH - 10, '#2a3450');
        KB.rect(ctx, 225, barY, 2, barH, C.yellow);
      }
      const fy = y0 + w * rowH + 4;
      KB.rect(ctx, 34, fy, 188, 1, '#405070');
      fit(ctx, UI.hint('left', '←→') + ' 調整　' + UI.hint('jump', 'Z') + ' 進入', 128, fy + 4, 196, { color: C.grey, align: 'center', size: ms });
      // 觸控時沒有 F 鍵（全螢幕改由覆蓋層的 ⛶ 鍵 / 暫停選單）
      fit(ctx, UI.hint('select', 'SELECT') + ' 返回' + (UI.touchOn() ? '' : '　F 全螢幕'), 128, fy + 19, 196, { color: C.grey, align: 'center', size: ms });
    }
  }
  KB.SettingsMenu = SettingsMenu;

  // ======================================================================
  // 標題選單
  // ======================================================================
  const anyCleared = () => !!(KB.save && KB.save.cleared && Object.keys(KB.save.cleared).some(k => KB.save.cleared[k]));
  const anyPlayed = () => !!(KB.save && KB.save.playCount && Object.keys(KB.save.playCount).length);

  // Round 8（ach2）：標題選單最多同時顯示幾項；超過就捲動（上下各畫一個小箭頭）
  const TITLE_WINDOW = 7;

  class TitleMenu {
    constructor() {
      this.items = [];
      if (anyCleared()) this.items.push({ id: 'continue', label: '繼續遊戲' });
      this.items.push({ id: 'new', label: '新遊戲' });
      // Extra 模式：通關 W5 後解鎖（KB.session.extra，由 player2 的難度調整讀取）
      if (KB.DEBUG || (KB.save && KB.save.cleared && KB.save.cleared.w5)) this.items.push({ id: 'extra', label: 'Extra 模式' });
      // Round 8（challenge agent）：挑戰模式 —— KB.ChallengeScene 存在才顯示
      if (KB.ChallengeScene) this.items.push({ id: 'challenge', label: '挑戰模式' });
      this.items.push({ id: 'help', label: '操作說明' }, { id: 'gallery', label: '能力圖鑑' });
      // Round 7（extra）：本機成績板（有任何通關 / 通關次數紀錄，或 ?debug=1 時顯示）
      if (KB.RecordsScene && (KB.DEBUG || anyCleared() || anyPlayed())) this.items.push({ id: 'records', label: '成績板' });
      // 競技場：通關 W5（或 ?debug=1）後解鎖
      if (KB.ArenaScene && (KB.DEBUG || (KB.save && KB.save.cleared && KB.save.cleared.w5))) this.items.push({ id: 'arena', label: '競技場' });
      // Round 8（saves-input agent）：存檔槽 —— KB.SaveSelectScene 存在才顯示
      if (KB.SaveSelectScene) this.items.push({ id: 'saves', label: '存檔槽' });
      this.items.push({ id: 'settings', label: '設定' });
      this.sel = 0; this.top = 0; this.frame = 0; this.page = 'main'; this.sub = null;
    }
    /** 捲動視窗：項目 ≤ TITLE_WINDOW 時完全維持原本的版面（top 恆為 0） */
    get win() { return Math.min(this.items.length, TITLE_WINDOW); }
    clampTop() {
      const n = this.items.length, w = this.win;
      if (n <= w) { this.top = 0; return; }
      if (this.sel < this.top) this.top = this.sel;
      if (this.sel > this.top + w - 1) this.top = this.sel - w + 1;
      this.top = Math.max(0, Math.min(n - w, this.top));
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
      this.clampTop();
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
        else if (it.id === 'records') { UI.leave(scene, () => KB.setScene(new KB.RecordsScene())); }
        else if (it.id === 'challenge') { UI.leave(scene, () => KB.setScene(new KB.ChallengeScene())); }
        else if (it.id === 'saves') { UI.leave(scene, () => KB.setScene(new KB.SaveSelectScene())); }
        else if (it.id === 'settings') this.sub = new SettingsMenu();
      }
    }
    draw(ctx, scene) {
      if (this.page === 'help') { UI.drawHelp(ctx, { hint: UI.hint('jump', 'Z') + ' / ' + UI.hint('select', 'SELECT') + '：返回選單' }); return; }
      if (this.sub) { this.sub.draw(ctx); return; }
      // R2-P2-16：面板固定從 logo 底下（y=64）開始、最多長到 y=182（不壓底部資訊列），行高依項目數收斂
      const ms = MS(), n = this.items.length, w = this.win;
      const y0 = (UI.TITLE_MENU_TOP || 64), bot = (UI.TITLE_MENU_BOTTOM || 182);
      const rowH = Math.max(14, Math.min(19, Math.floor((bot - y0 - 12) / w))), h = 12 + w * rowH;
      panel(ctx, 112, y0, 136, h);
      this.clampTop();
      const gnew = UI.abilityNew(), top = this.top;
      for (let k = 0; k < w; k++) {
        const i = top + k; if (i >= n) break;
        const y = y0 + 6 + k * rowH, sel = this.sel === i;
        if (sel) cursor(ctx, 124, y + 3, this.frame);
        T(ctx, this.items[i].label, 142, y, { color: sel ? C.yellow : '#fff', size: ms });
        // 能力圖鑑有新發現 → 右側閃爍 NEW!（打開圖鑑時清掉 KB.save.seenNew）
        if (gnew && this.items[i].id === 'gallery' && ((this.frame >> 4) & 1)) {
          KB.text(ctx, 'NEW!', 242, y + 4, { color: C.pink, align: 'right', outline: '#401828' });
        }
      }
      // 捲動指示（項目超過視窗時才畫）：上下各一個 5×3 的小三角 + 右側位置條
      if (n > w) {
        const blink = (this.frame >> 3) & 1;
        if (top > 0 && blink) for (let r = 0; r < 3; r++) KB.rect(ctx, 178 - r, y0 + 1 + r, 1 + r * 2, 1, C.yellow);
        if (top + w < n && blink) for (let r = 0; r < 3; r++) KB.rect(ctx, 176 + r, y0 + h - 4 + r, 5 - r * 2, 1, C.yellow);
        const barH = Math.max(6, Math.round((h - 10) * w / n)), barY = y0 + 5 + Math.round((h - 10 - barH) * top / (n - w));
        KB.rect(ctx, 244, y0 + 5, 2, h - 10, '#2a3450');
        KB.rect(ctx, 244, barY, 2, barH, C.yellow);
      }
      fit(ctx, UI.hint('up', '↑↓') + ' 選擇　' + UI.hint('jump', 'Z') + ' 確認　' + UI.hint('select', 'SELECT') + ' 返回', 128, 204, 250, { color: '#7c8ca8', align: 'center', size: ms });
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
    // fix5b / R5-P2-09：開場橫幅改由這裡畫（game.js 的順序是 drawLevelBanner → VFX.postWorld →
    // drawGameHint，橫幅若在 postWorld 之前畫就會被 worldTint 一起染色）。
    // 必須放在 hints 設定的判斷之前——關掉提示時橫幅還是要出現。
    if (UI.paintLevelBanner) UI.paintLevelBanner(ctx);
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
      fit(ctx, UI.hint('start', 'ENTER') + '：暫停／說明', x + w / 2, y + 3, w - 10, { color: '#fff', align: 'center', size: MS() });
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
