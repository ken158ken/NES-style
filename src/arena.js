// 競技場（Boss Rush）—— agent: ui-flow
// 規格見 docs/DESIGN_REFERENCE.md 5.2：1 條命、自選 1 能力、連戰 5 名魔王（最後固定迪迪迪大王）、
// R6-P2-02：通關 W6 後變成 6 名（迪迪迪進隨機池，最後固定暗影卡比）。
// 每戰之間進休息室，整場只有 3 顆番茄；最佳時間存 KB.save.arena.bestTime。
//
// 流程：KB.ArenaScene（選能力）
//        → GameScene(魔王世界, { room: 魔王房, arena })          ← 沿用原本的魔王房 / HP / 二階段
//        → 擊敗後出現出口門 → KB.arenaExit() → GameScene('arena_rest', { arena })
//        → 休息室的門 → 下一戰 …… → 全部打完 → KB.ArenaResultScene
// game.js 只加 3 個鉤子：opts.arena、useDoor 的 exit、playerDied 的 lives<0。
(function () {
  'use strict';
  const W = KB.W, H = KB.H, VH = KB.VIEW_H;
  const UI = KB.UI;
  const T = UI.text, fit = UI.fitText, C = UI.C;
  const panel = UI.panel, cursor = UI.cursor, sprAt = UI.sprAt, drawKirby = UI.drawKirby;
  const sfx = UI.sfx, has = UI.has, mmss = UI.mmss;
  const MS = () => UI.MS;
  const hasSong = k => !!(KB.audio && KB.audio.SONGS && KB.audio.SONGS[k]);
  // 音樂：audio2 agent 尚未提供 'arena' / 'arena_rest' 時退回既有曲目（不會變成靜音）
  const music = (list) => { for (const k of list) if (hasSong(k)) { UI.music(k); return k; } UI.music(null); return null; };

  // ======================================================================
  // 休息室（16×12 ＝ 剛好一個畫面；放 3 顆番茄，整場共用）
  // ======================================================================
  // 番茄放在單向平台上（放地面的話走去門就會自動吃光）
  const REST_MAP = [
    '################',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#....=======...#',
    '#..............#',
    '#..............#',
    '#..............#',
    '################',
    '################',
  ];
  KB.EXTRA_LEVELS = KB.EXTRA_LEVELS || {};
  KB.EXTRA_LEVELS.arena_rest = {
    id: 'arena_rest', name: '休息室', theme: 'castle', bossName: '',
    rooms: [{
      name: '休息室', theme: 'castle', noBoss: true,
      map: REST_MAP,
      spawn: [2, 9],
      entities: [{ t: 'tomato', x: 6, y: 5 }, { t: 'tomato', x: 8, y: 5 }, { t: 'tomato', x: 10, y: 5 }],
      exit: { x: 13, y: 9 },
    }],
  };

  // ======================================================================
  // 對戰順序：前 N 名隨機，最後固定壓軸魔王（未通關 w6＝迪迪迪大王 / 已通關＝暗影卡比）
  // ======================================================================
  // R6-P2-02：通關 W6（KB.save.cleared.w6）或 ?debug=1 後，暗影卡比成為最終戰，迪迪迪大王進入隨機池 → 6 名魔王。
  const POOL5 = ['whispywoods', 'lololo', 'kracko', 'metaknight'];
  const POOL6 = ['whispywoods', 'lololo', 'kracko', 'metaknight', 'dedede'];
  // Round 8（challenge）：全 7 魔王 —— 前 6 名隨機、最後固定夢魘之核（w7）
  const POOL7 = ['whispywoods', 'lololo', 'kracko', 'metaknight', 'dedede', 'shadowkirby'];
  function shadowUnlocked() { return !!((KB.save && KB.save.cleared && KB.save.cleared.w6) || KB.DEBUG); }
  function has7() { return !!(KB.LEVELS || []).some(l => l.boss === 'nightmarecore'); }
  function arenaPool(o) {
    if (o && o.all7 && has7()) return POOL7;
    return shadowUnlocked() ? POOL6 : POOL5;
  }
  function arenaLast(o) {
    if (o && o.all7 && has7()) return 'nightmarecore';
    return shadowUnlocked() ? 'shadowkirby' : 'dedede';
  }
  function arenaCount(o) { return arenaPool(o).length + 1; }
  KB.arenaCount = arenaCount;
  // Round 8：Boss Rush 變體識別碼（存檔 KB.save.challenge.arena[variant]）
  function variantKey(o) {
    o = o || {};
    const k = (o.extra ? 'extra' : '') + (o.all7 ? (o.extra ? '_all7' : 'all7') : '');
    return k || 'normal';
  }
  KB.arenaVariant = variantKey;
  function variantRec(o, make) {
    try {
      KB.save.challenge = KB.save.challenge || {};
      const a = KB.save.challenge.arena = KB.save.challenge.arena || {};
      const k = variantKey(o);
      if (make) a[k] = a[k] || { bestTime: 0, cleared: false };
      return a[k] || null;
    } catch (e) { return null; }
  }
  function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function levelOfBoss(key) { return KB.LEVELS.find(l => l.boss === key) || KB.LEVELS[0]; }
  function bossRoomIdx(level) { const i = level.rooms.findIndex(r => r.bossRoom); return i >= 0 ? i : Math.max(0, level.rooms.length - 1); }
  function bossNameOf(key) { const l = levelOfBoss(key); return (l && l.bossName) || String(key).toUpperCase(); }
  // 結算的「對戰順序」排版：只在名字之間（「→」處）換行，中文名絕不斷在字中間。
  // 每行最多 PER_LINE 個名字，且以 UI.textWidth 量寬，放不下就提早換行；固定輸出 ≤ 2 行（多的併到第 2 行）。
  const ARROW = '→', PER_LINE = 3;
  function orderLines(names) {
    const n = names.length;
    const per = Math.max(1, Math.min(PER_LINE, Math.ceil(n / 2)));   // 5 名 → 3/2、6 名 → 3/3
    const lines = [];
    for (let i = 0; i < n; i += per) lines.push(names.slice(i, i + per));
    // 固定兩行：多出來的名字併回第 2 行（5 / 6 名魔王都只會產生 2 行）
    while (lines.length > 2) lines[1] = lines[1].concat(lines.splice(2, 1)[0]);
    return lines.map((arr, i) => arr.join(ARROW) + (i < lines.length - 1 ? ARROW : ''));
  }
  KB.arenaOrderLines = orderLines;
  KB.arenaBossName = bossNameOf;

  function newArena(ability, o) {
    o = o || {};
    return {
      order: shuffled(arenaPool(o)).concat([arenaLast(o)]),
      idx: 0, phase: 'boss', tomatoes: 3, base: 0, beaten: 0,
      ability: ability || null, abilityCur: ability || null, hp: KB.MAX_HP, score: 0,
      opt: { extra: !!o.extra, all7: !!o.all7, from: o.from || null },
    };
  }
  KB.newArena = newArena;

  // 目前為止的總時間（幀）
  function arenaTime(a, game) { return (a.base | 0) + (game ? (game.timeAlive | 0) : 0); }
  KB.arenaTime = arenaTime;

  function commit(a, game) {
    a.base += game ? (game.timeAlive | 0) : 0;
    a.score = game ? (game.score | 0) : a.score;
    if (game && game.player) { a.hp = Math.max(1, game.player.hp | 0); a.abilityCur = game.player.ability || null; }
  }

  function makeScene(levelId, room, a) {
    return new KB.GameScene(levelId, {
      room, arena: a, lives: 0, score: a.score | 0,
      ability: a.abilityCur || undefined, hp: a.hp,
    });
  }

  // ---- 開始一場魔王戰 ----
  function startBattle(a) {
    a.phase = 'boss';
    const key = a.order[a.idx], lv = levelOfBoss(key);
    const g = makeScene(lv.id, bossRoomIdx(lv), a);
    KB.setScene(g);
    // 魔王房原本擺的食物在競技場拿掉（補血只靠休息室的番茄）
    for (const e of g.entities) if (e.type === 'item' && e.name !== 'pointstar') e.dead = true;
    music(['arena', lv.id === 'w5' ? 'finalboss' : 'boss']);
    return g;
  }

  // ---- 進休息室 ----
  function startRest(a) {
    a.phase = 'rest';
    const g = makeScene('arena_rest', 0, a);
    KB.setScene(g);
    // 番茄：整場共用 3 顆，已吃掉的直接移除；剩下的撿起時扣 arena.tomatoes
    let remove = 3 - Math.max(0, a.tomatoes | 0);
    for (const e of g.entities) {
      if (!e || e.name !== 'tomato') continue;
      if (remove > 0) { e.dead = true; remove--; continue; }
      e.onCollect = function (p) {
        p.hp = p.maxHp; KB.fx('fx_sparkle', p.cx, p.cy - 8);
        const ar = KB.game && KB.game.arena; if (ar) ar.tomatoes = Math.max(0, (ar.tomatoes | 0) - 1);
      };
    }
    music(['arena_rest', 'secret', 'select']);
    return g;
  }

  // ======================================================================
  // game.js 的鉤子
  // ======================================================================
  // 出口門：魔王房 → 休息室 / 結算；休息室 → 下一戰
  KB.arenaExit = function (game) {
    const a = game.arena; if (!a) return;
    commit(a, game);
    if (a.phase === 'boss') {
      a.beaten = Math.min(a.order.length, a.beaten + 1);
      if (a.idx >= a.order.length - 1) { game.fadeTo(() => KB.setScene(new ArenaResultScene(a, true))); return; }
      game.fadeTo(() => startRest(a));
    } else {
      a.idx = Math.min(a.order.length - 1, a.idx + 1);
      game.fadeTo(() => startBattle(a));
    }
  };
  // 死亡：只有 1 條命 → 直接結算
  KB.arenaFail = function (game) {
    const a = game.arena; if (!a) return;
    a.base += game.timeAlive | 0; a.score = game.score | 0;
    KB.setScene(new ArenaResultScene(a, false));
  };

  // ======================================================================
  // 選能力畫面（KB.ArenaScene）
  // ======================================================================
  function bestTime(o) {
    if (o && variantKey(o) !== 'normal') { const r = variantRec(o); return (r && r.bestTime | 0) || 0; }
    return ((KB.save && KB.save.arena && KB.save.arena.bestTime) | 0) || 0;
  }

  // 縮圖列每頁 9 格（第 1 頁的第 1 格是「無能力」）；20 能力 → 3 頁
  const ARENA_PER_PAGE = 9;

  class ArenaScene {
    // Round 8（challenge）：opts = { extra: Extra 變體、all7: 全 7 魔王、from: 'challenge' 時 SELECT 回挑戰選單 }
    constructor(opts) {
      this.opt = Object.assign({ extra: false, all7: false, from: null }, opts || {});
      this.keys = [null].concat(KB.ABILITY_KEYS || []);
      this.i = 0; this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.stars = UI.mkStars(30, 91, 0, 0, W, 120);
    }
    back() { return this.opt.from === 'challenge' && KB.ChallengeScene ? new KB.ChallengeScene(4) : new KB.TitleScene(); }
    enter() { music(['arena', 'select']); }
    get key() { return this.keys[this.i]; }
    get pages() { return Math.max(1, Math.ceil(this.keys.length / ARENA_PER_PAGE)); }
    get page() { return Math.floor(this.i / ARENA_PER_PAGE); }
    update(dt) {
      this.t += dt; this.frame++;
      if (UI.stepFade(this)) return;
      const inp = KB.input, n = this.keys.length;
      // 左右：逐一換能力（走到頁尾自動跨頁）；上下：整頁跳
      if (inp.pressed('right')) { this.i = (this.i + 1) % n; sfx('menu'); }
      if (inp.pressed('left')) { this.i = (this.i - 1 + n) % n; sfx('menu'); }
      if (inp.pressed('down')) { this.i = Math.min(n - 1, this.i + ARENA_PER_PAGE); sfx('menu'); }
      if (inp.pressed('up')) { this.i = Math.max(0, this.i - ARENA_PER_PAGE); sfx('menu'); }
      if (inp.pressed('select')) { sfx('menu_back'); UI.leave(this, () => KB.setScene(this.back())); return; }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('start')) {
        sfx('select');
        const k = this.key, o = this.opt;
        UI.leave(this, () => { UI.newSession(0, 0, !!o.extra); startBattle(newArena(k, o)); });
      }
    }
    draw(ctx) {
      const f = this.frame, ms = MS(), info = UI.abilityInfo(this.key);
      UI.bands(ctx, 0, H, ['#180c20', '#241030', '#2c1440', '#1a0c26']);
      UI.drawStars(ctx, this.stars, this.t);
      // 聚光燈
      ctx.globalAlpha = 0.12; KB.circle(ctx, 128, 118, 92, '#ffd0a0'); ctx.globalAlpha = 1;
      UI.bigText(ctx, 'ARENA', 128, 4, 2, { color: '#ff8060', outline: '#40101c', shadow: '#a02030', align: 'center', spacing: 1 });
      T(ctx, '競技場', 128, 24, { color: C.yellow, align: 'center', size: 16 });
      // 規則
      panel(ctx, 8, 44, 240, 40, 'rgba(16,12,32,0.86)');
      fit(ctx, '生命 1　連戰 ' + arenaCount(this.opt) + ' 名魔王', 128, 47, 230, { color: '#fff', align: 'center', size: ms });
      // Extra 變體的說明在 14px 下會被 fit 截成「…血…」⇒ 這一行降成 12px（其餘情況維持 14px）
      if (this.opt.extra) fit(ctx, 'Extra 變體：魔王開場即二階段', 128, 65, 230, { color: '#ff9090', align: 'center', size: UI.MS_SMALL });
      else fit(ctx, '休息室的番茄整場共用 3 顆', 128, 64, 230, { color: '#c8b8e0', align: 'center', size: ms });
      // Round 8：變體徽章（Extra 紅牌 / 全 7 魔王金牌）
      {
        const badge = (txt, bg, fg, x) => { const bw = KB.textWidth(txt) + 6; KB.rect(ctx, x, 30, bw, 11, bg); KB.text(ctx, txt, x + 3, 32, { color: fg }); return bw; };
        // R8-P2-01：兩個徽章並排時右緣會壓到置中的副標「競技場」⇒ 同時存在就把 ALL 7 改畫在右上角
        if (this.opt.extra) badge('EXTRA', '#3a1020', '#ff6070', 12);
        if (this.opt.all7) badge('ALL 7', '#3a3010', '#ffe040', this.opt.extra ? 244 - (KB.textWidth('ALL 7') + 6) : 12);
      }
      // 選能力
      panel(ctx, 8, 88, 240, 76);
      fit(ctx, '選擇出發能力', 16, 91, 90, { color: '#98a8c0', size: ms });
      if (this.pages > 1) T(ctx, '頁 ' + (this.page + 1) + '/' + this.pages, 148, 93, { color: '#8fa0bc', size: 12 });
      KB.text(ctx, (this.i + 1) + '/' + this.keys.length, 240, 94, { color: C.grey, align: 'right' });
      // 左：戴帽子的卡比
      KB.rect(ctx, 16, 108, 56, 50, '#101828'); KB.rect(ctx, 17, 109, 54, 48, '#241c3c');
      const gy = 152, hop = Math.abs(Math.sin(this.t * 3)) * 3;
      // fix5b / R5-P2-06：dragon / mech / ghost / giant 畫變身後的外型
      UI.drawPreview(ctx, this.keys[this.i] || null, 44, gy - Math.round(hop), { t: this.t });
      KB.rect(ctx, 34, gy + 1, 20, 2, 'rgba(0,0,0,0.4)');
      // 右：圖示 + 名稱 + 說明
      if (!sprAt(ctx, info.icon, 80, 110, 'tl')) { KB.rect(ctx, 80, 110, 24, 16, '#181c28'); KB.rect(ctx, 81, 111, 22, 14, info.color); }
      T(ctx, info.name, 112, 106, { color: C.yellow, size: 16 });
      KB.text(ctx, info.en, 240, 112, { color: info.color, align: 'right' });
      let ds = ms, dl = info.desc ? UI.wrapLines(info.desc, 156, { size: ds }, 2) : [];
      let lh = 15, dy = 127;
      // fix5b / R5-P2-05：降級成 12px 3 行時，原本（起點 127、行高 13）第 3 行落在 y 153~165，
      // 但面板下緣只到 y 164（88+76）⇒ 最後一行被切掉半截（gunner「…整個房間。」、dragon「…一條火河。」）。
      // 起點上移到 124、行高縮成 12 ⇒ 第 3 行 148~160，完整留在面板內。
      if (info.desc && dl.join('').replace(/…/g, '').length < info.desc.length) { ds = 12; lh = 12; dy = 124; dl = UI.wrapLines(info.desc, 158, { size: ds }, 3); }
      for (let i = 0; i < dl.length; i++) T(ctx, dl[i], 80, dy + i * lh, { color: '#c8d8f0', size: ds });
      // 左右箭頭
      const ax = ((f >> 3) & 1) ? 1 : 0;
      KB.text(ctx, '<', 12 - ax, 128, { color: C.cyan });
      KB.text(ctx, '>', 242 + ax, 128, { color: C.cyan });
      // 能力縮圖列（每頁 9 格；第 1 頁第 1 格＝無能力）
      const p0 = this.page * ARENA_PER_PAGE;
      for (let s = 0; s < ARENA_PER_PAGE; s++) {
        const i = p0 + s; if (i >= this.keys.length) break;
        const x = 8 + s * 27, sel = i === this.i, k = this.keys[i];
        KB.rect(ctx, x, 168, 25, 20, sel ? C.yellow : '#101828');
        KB.rect(ctx, x + 1, 169, 23, 18, '#20304c');
        const d = k && KB.ABILITIES ? KB.ABILITIES[k] : null;
        if (!sprAt(ctx, k ? ((d && d.icon) || ('ui_ability_' + k)) : 'ui_ability_none', x, 170, 'tl')) {
          if (k) KB.rect(ctx, x + 2, 171, 21, 14, UI.abilityColor(k));
          else KB.text(ctx, '-', x + 12, 174, { color: '#98a8c0', align: 'center' });
        }
      }
      // 最佳時間
      const bt = bestTime(this.opt);
      KB.text(ctx, 'BEST ' + (bt ? mmss(bt) : '--:--'), 240, 194, { color: bt ? C.yellow : C.grey, align: 'right' });
      fit(ctx, this.pages > 1 ? '←→ ↑↓ 選能力　Z 開始' : '←→ 選能力　Z 開始', 10, 192, 148, { color: '#fff', size: ms });
      // R8-P2-02：從挑戰選單進來的 Boss Rush，SELECT 其實是回挑戰選單（back()），提示要跟著改
      fit(ctx, this.opt.from === 'challenge' ? 'SELECT：返回挑戰選單' : 'SELECT：返回標題', 128, 208, 244, { color: C.grey, align: 'center', size: ms });
      UI.drawMuteToast(ctx); UI.drawFade(ctx, this);
    }
  }
  KB.ArenaScene = ArenaScene;

  // ======================================================================
  // 競技場結算（通關 / 失敗共用）
  // ======================================================================
  class ArenaResultScene {
    constructor(arena, win) {
      this.a = arena || newArena(null); this.win = !!win;
      this.opt = this.a.opt || {};
      this.variant = variantKey(this.opt);
      this.time = this.a.base | 0;
      this.prevBest = bestTime(this.opt);
      this.newBest = false;
      if (this.win) {
        try {
          KB.save.arena = KB.save.arena || {};
          if (!this.prevBest || this.time < this.prevBest) this.newBest = true;
          if (this.variant === 'normal') {
            if (this.newBest) KB.save.arena.bestTime = this.time;
            KB.save.arena.cleared = true;
          } else {
            // Round 8：Extra / 全 7 魔王變體各自記錄（KB.save.challenge.arena[variant]）
            const r = variantRec(this.opt, true);
            if (r) { if (this.newBest) r.bestTime = this.time; r.cleared = true; }
          }
          KB.saveGame && KB.saveGame();
        } catch (e) { }
        // 成就「競技場通關 / 3 分內」（progression）
        // ach2 要求：帶上 beaten / total（「六王連霸」成就要判斷連戰幾名）
        if (KB.PROG && KB.PROG.emit) KB.PROG.emit('arenaClear', { time: this.time, beaten: this.a.beaten | 0, total: this.a.order.length, variant: this.variant, extra: !!this.opt.extra, all7: !!this.opt.all7 });
        if (KB.CHALLENGE && KB.CHALLENGE.emitClear) KB.CHALLENGE.emitClear({ type: 'arena', variant: this.variant, time: this.time, best: this.newBest, extra: !!this.opt.extra, all7: !!this.opt.all7 });
      }
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      this.stars = UI.mkStars(40, 57, 0, 0, W, H);
    }
    enter() { UI.music(this.win ? (hasSong('clear') ? 'clear' : null) : 'gameover'); }
    update(dt) {
      this.t += dt; this.frame++;
      if (UI.stepFade(this)) return;
      if (this.frame < 24) return;
      const inp = KB.input;
      if (inp.pressed('jump') || inp.pressed('start') || inp.pressed('attack') || inp.pressed('select')) {
        sfx('select');
        const back = this.opt.from === 'challenge' && KB.ChallengeScene ? () => new KB.ChallengeScene(4) : () => new KB.TitleScene();
        UI.leave(this, () => { UI.newSession(KB.START_LIVES, 0, false); KB.setScene(back()); });
      }
    }
    draw(ctx) {
      const f = this.frame, ms = MS(), a = this.a;
      UI.bands(ctx, 0, H, this.win ? ['#101838', '#182254', '#1e2c68', '#24347c'] : ['#000000', '#0a0a14', '#101018', '#16161e']);
      UI.drawStars(ctx, this.stars, this.t);
      if (this.win) UI.bigText(ctx, 'ARENA CLEAR', 128, 8, 2, { color: C.yellow, outline: '#603000', shadow: '#a06000', align: 'center', spacing: 1 });
      else UI.bigText(ctx, 'GAME OVER', 128, 8, 2, { color: '#f04040', outline: '#400000', shadow: '#901818', align: 'center', spacing: 1 });
      T(ctx, this.win ? '競技場全制霸！' : '競技場挑戰失敗', 128, 30, { color: this.win ? '#fff' : '#c0a0a0', align: 'center', size: 16 });
      panel(ctx, 16, 54, 224, 104);
      const bestNow = this.win ? (this.newBest ? this.time : this.prevBest) : this.prevBest;
      const rows = [
        ['打倒魔王', a.beaten + ' / ' + a.order.length, this.win ? C.yellow : '#fff'],
        [this.win ? '總時間' : '撐到', mmss(this.time), '#fff'],
        ['剩餘番茄', 'x' + Math.max(0, a.tomatoes | 0), '#fff'],
        ['最佳時間', bestNow ? mmss(bestNow) : '--:--', this.newBest ? C.pink : '#c8d8f0'],
      ];
      for (let i = 0; i < rows.length; i++) {
        const y = 62 + i * 22;
        fit(ctx, rows[i][0], 28, y, 110, { color: '#c8d8f0', size: ms });
        KB.text(ctx, rows[i][1], 228, y + 3, { color: rows[i][2], align: 'right' });
      }
      if (this.newBest && ((f >> 3) & 1)) KB.text(ctx, 'NEW RECORD!', 128, 162, { color: C.yellow, align: 'center' });
      // 這次的對戰順序：固定兩行、每行最多 3 個名字，只在「→」處換行（中文名不會斷在字中間）
      const ol = orderLines(a.order.map(k => bossNameOf(k)));
      // 6 名魔王時單行會比 240px 寬 → 用 fitText 自動縮字（絕不會被裁掉）
      for (let i = 0; i < ol.length; i++) fit(ctx, ol[i], 128, 170 + i * 14, 240, { color: '#7c8ca8', align: 'center', size: 12 });
      if ((f % 60) < 42) fit(ctx, 'Z / ENTER：回到標題', 128, 202, 244, { color: '#fff', align: 'center', size: ms });
      UI.drawMuteToast(ctx); UI.drawFade(ctx, this);
    }
  }
  KB.ArenaResultScene = ArenaResultScene;
})();
