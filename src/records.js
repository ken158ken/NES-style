// 本機成績板 KB.RecordsScene（Round 7 覺醒與挑戰 / agent: extra）
// ============================================================================
// 標題選單「成績板」→ KB.setScene(new KB.RecordsScene())。
// 內容全部讀自 KB.save（localStorage），不另外存新欄位：
//   best[id]      最佳分數（ui.js ResultScene 寫入）
//   rank[id]      最佳評價 S/A/B/C（progression.js saveRank，只升不降）
//   bestTime[id]  最短通關時間（幀；game.js levelClear 寫入）
//   stars[id]     大星星 [bool×3]（levels / items）
//   playCount[id] 通關次數（game.js levelClear 累加）
//   extraCleared[id] Extra 模式通關過（game.js levelClear）
//   arena.bestTime 競技場最佳時間（arena.js）
//   achievements / seen  成就與能力發現（progression.js / ui.js）
//   challenge     挑戰模式紀錄（Round 8 / challenge.js：time / nohit / tower / daily / arena 變體）
// 版面：面板 + 分頁（←→ 切換：總覽 → W1 → W2 … → Wn → 挑戰 → 總覽）。
// 注意：本檔在 index.html 裡載入於 ui.js **之前**，所以 KB.UI 只能在函式裡取（不可在頂層快取）。
// ============================================================================
(function () {
  'use strict';
  const W = KB.W, H = KB.H;

  const U = () => KB.UI;
  const save = () => (KB.save = KB.save || {});
  const num = v => (v | 0) || 0;
  const pad7 = n => String(Math.max(0, Math.floor(n || 0))).padStart(7, '0');
  // 幀 → mm:ss（與 ResultScene / 競技場結算同一種格式）
  function mmss(f) {
    if (!f && f !== 0) return '--:--';
    const s = Math.floor(f / 60);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  // 幀 → mm:ss.ff（挑戰頁的時間攻擊紀錄；與 challenge.js 同一種格式）
  function mmssff(f) {
    if (!f) return '--:--.--';
    if (KB.CHALLENGE && KB.CHALLENGE.mmssff) return KB.CHALLENGE.mmssff(f);
    return mmss(f);
  }
  const sfx = n => { try { KB.audio && KB.audio.sfx && KB.audio.sfx(n); } catch (e) { } };
  const music = n => { try { KB.audio && KB.audio.music && KB.audio.music(n); } catch (e) { } };

  // ---------- 單關成績 ----------
  function recordOf(id) {
    const s = save();
    const stars = (s.stars && Array.isArray(s.stars[id])) ? s.stars[id].filter(Boolean).length : 0;
    return {
      id,
      cleared: !!(s.cleared && s.cleared[id]),
      best: num(s.best && s.best[id]),
      rank: (KB.PROG && KB.PROG.bestRank) ? KB.PROG.bestRank(id) : ((s.rank && s.rank[id]) || null),
      time: num(s.bestTime && s.bestTime[id]),
      stars,
      plays: num(s.playCount && s.playCount[id]),
      extra: !!(s.extraCleared && s.extraCleared[id]),
    };
  }
  KB.recordOf = recordOf;

  const RANK_COL = { S: '#ffe040', A: '#80e0a0', B: '#80c8ff', C: '#c0c8d8' };
  const rankColor = r => RANK_COL[r] || '#5c6884';

  // 總覽用的彙總
  function summary() {
    const s = save(), lv = KB.LEVELS || [];
    let stars = 0, plays = 0, clears = 0, extras = 0, best = 0;
    for (const l of lv) {
      const r = recordOf(l.id);
      stars += r.stars; plays += r.plays; best += r.best;
      if (r.cleared) clears++; if (r.extra) extras++;
    }
    const P = KB.PROG;
    return {
      stars, starMax: lv.length * 3, plays, clears, extras, levels: lv.length, best,
      arena: num(s.arena && s.arena.bestTime),
      arenaCleared: !!(s.arena && s.arena.cleared),
      ach: (P && P.achCount) ? P.achCount() : 0,
      achMax: (P && P.achTotal) ? P.achTotal() : 20,
      seen: (KB.UI && KB.UI.seenCount) ? KB.UI.seenCount() : 0,
      seenMax: (KB.UI && KB.UI.abilityKeys) ? KB.UI.abilityKeys().length : 0,
    };
  }
  KB.recordsSummary = summary;

  // ---------- 場景 ----------
  class RecordsScene {
    constructor(page) {
      this.t = 0; this.frame = 0; this.fade = 1; this.leaving = null;
      // 0 = 總覽、1..n = 各世界、最後一頁 = 挑戰（KB.CHALLENGE 存在時才有）
      this.chPage = KB.CHALLENGE ? 1 + (KB.LEVELS || []).length : -1;
      this.pages = 1 + (KB.LEVELS || []).length + (KB.CHALLENGE ? 1 : 0);
      this.page = Math.max(0, Math.min(this.pages - 1, page | 0));
    }
    enter() { music('select'); }
    exit() { }
    update(dt) {
      const UI = U();
      this.t += dt; this.frame++;
      if (UI && UI.stepFade && UI.stepFade(this)) return;
      const inp = KB.input;
      const d = inp.pressed('right') ? 1 : inp.pressed('left') ? -1 : 0;
      if (d) { this.page = (this.page + d + this.pages) % this.pages; sfx('menu'); }
      if (inp.pressed('down')) { this.page = (this.page + 1) % this.pages; sfx('menu'); }
      if (inp.pressed('up')) { this.page = (this.page - 1 + this.pages) % this.pages; sfx('menu'); }
      if (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('select') || inp.pressed('start')) {
        sfx('menu_back');
        const back = () => KB.setScene(KB.TitleScene ? new KB.TitleScene() : KB.scene);
        if (UI && UI.leave) UI.leave(this, back); else back();
      }
    }

    // ---- 背景（夜空 + 緩慢飄動的星）----
    drawBg(ctx) {
      const UI = U();
      if (UI && UI.bands) UI.bands(ctx, 0, H, ['#0c1430', '#141c48', '#1c2860', '#182038']);
      else KB.rect(ctx, 0, 0, W, H, '#141c48');
      if (UI && UI.mkStars) {
        this._stars = this._stars || UI.mkStars(40, 77, 0, 0, W, H);
        UI.drawStars(ctx, this._stars, this.t);
      }
    }

    draw(ctx) {
      const UI = U(); if (!UI) return;
      const C = UI.C, T = UI.text, panel = UI.panel;
      this.drawBg(ctx);
      // 標題列：RECORDS（2 倍點陣字，x 8~120）＋ 成績板（16px，x 128~176）＋ 右上分頁
      UI.bigText(ctx, 'RECORDS', 6, 5, 2, { color: '#fff', outline: '#101830', spacing: 0 });
      T(ctx, '成績板', 136, 5, { color: C.yellow, size: 16, outline: '#101830' });
      const label = this.page === 0 ? '總覽' : (this.page === this.chPage ? '挑戰' : ('W' + this.page));
      KB.text(ctx, (this.page + 1) + '/' + this.pages, 250, 5, { color: '#c8d8f0', align: 'right', outline: '#101830' });
      T(ctx, label, 250, 15, { color: C.cyan, align: 'right', size: UI.MS_SMALL, outline: '#101830' });
      if (this.page === 0) this.drawOverview(ctx);
      else if (this.page === this.chPage) this.drawChallenge(ctx);
      else this.drawWorld(ctx, this.page - 1);
      UI.fitText(ctx, '←→ 切換頁面　Z / SELECT 返回', 128, 206, 240, { color: C.grey, align: 'center', size: UI.MS });
      if (UI.drawMuteToast) UI.drawMuteToast(ctx);
      if (UI.drawFade) UI.drawFade(ctx, this);
    }

    // ---------- 總覽：每個世界一列 ----------
    drawOverview(ctx) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const lv = KB.LEVELS || [], su = summary();
      panel(ctx, 6, 32, 244, 118);
      // 表頭（全部 8×8 點陣字，欄位才對得齊；每欄右界固定，欄與欄之間至少留 2px）
      const HY = 38, CX = { best: 88, rank: 108, time: 152, star: 188, play: 222, ex: 246 };
      KB.text(ctx, 'W', 12, HY, { color: '#8fa0bc' });
      KB.text(ctx, 'BEST', CX.best, HY, { color: '#8fa0bc', align: 'right' });
      KB.text(ctx, 'RK', CX.rank, HY, { color: '#8fa0bc', align: 'right' });
      KB.text(ctx, 'TIME', CX.time, HY, { color: '#8fa0bc', align: 'right' });
      KB.text(ctx, 'STAR', CX.star, HY, { color: '#8fa0bc', align: 'right' });
      KB.text(ctx, 'PLAY', CX.play, HY, { color: '#8fa0bc', align: 'right' });
      KB.text(ctx, 'EX', CX.ex, HY, { color: '#8fa0bc', align: 'right' });
      KB.rect(ctx, 10, HY + 10, 236, 1, '#405070');
      const rowH = Math.min(15, Math.floor(94 / Math.max(1, lv.length)));
      for (let i = 0; i < lv.length; i++) {
        const r = recordOf(lv[i].id), y = HY + 14 + i * rowH;
        const on = r.cleared || r.plays > 0;
        const col = on ? '#ffffff' : '#5c6884';
        KB.text(ctx, 'W' + (i + 1), 12, y, { color: on ? C.yellow : '#5c6884' });
        KB.text(ctx, r.best ? pad7(r.best) : '-------', CX.best, y, { color: r.best ? '#fff' : '#5c6884', align: 'right' });
        KB.text(ctx, r.rank || '-', CX.rank - 2, y, { color: rankColor(r.rank), align: 'right' });
        KB.text(ctx, r.time ? mmss(r.time) : '--:--', CX.time, y, { color: r.time ? C.cyan : '#5c6884', align: 'right' });
        KB.text(ctx, r.stars + '/3', CX.star, y, { color: r.stars >= 3 ? C.yellow : col, align: 'right' });
        KB.text(ctx, String(r.plays), CX.play - 2, y, { color: r.plays ? col : '#5c6884', align: 'right' });
        // Extra 通關標記（紅底白字的小徽章）
        if (r.extra) { KB.rect(ctx, CX.ex - 14, y - 1, 14, 10, '#c03040'); KB.text(ctx, 'E', CX.ex - 7, y, { color: '#fff', align: 'center' }); }
        else KB.text(ctx, '-', CX.ex - 3, y, { color: '#5c6884', align: 'right' });
      }
      // 下方彙總面板
      panel(ctx, 6, 154, 244, 46);
      const col2 = 132;
      const row = (x, i, label, value, vcol) => {
        T(ctx, label, x, 160 + i * 17, { color: '#8fa0bc', size: UI.MS_SMALL });
        KB.text(ctx, value, x + 110, 163 + i * 17, { color: vcol || '#fff', align: 'right' });
      };
      row(12, 0, '競技場最佳', su.arena ? mmss(su.arena) : '--:--', su.arena ? C.pink : '#5c6884');
      row(12, 1, '大星星', su.stars + '/' + su.starMax, su.stars >= su.starMax ? C.yellow : '#fff');
      row(col2, 0, '成就', su.ach + '/' + su.achMax, su.ach >= su.achMax ? C.yellow : '#fff');
      row(col2, 1, '能力發現', su.seen + '/' + su.seenMax, (su.seenMax && su.seen >= su.seenMax) ? C.yellow : '#fff');
    }

    // ---------- 挑戰模式（Round 8 / challenge.js）----------
    drawChallenge(ctx) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const CH = KB.CHALLENGE; if (!CH) return;
      const lv = KB.LEVELS || [];
      // ① 各世界：時間攻擊最佳 + 無傷達成
      panel(ctx, 6, 32, 244, 96);
      KB.text(ctx, 'W', 12, 38, { color: '#8fa0bc' });
      T(ctx, '時間攻擊', 66, 35, { color: '#8fa0bc', size: UI.MS_SMALL });
      T(ctx, '無傷', 160, 35, { color: '#8fa0bc', size: UI.MS_SMALL });
      T(ctx, '無傷最短', 200, 35, { color: '#8fa0bc', size: UI.MS_SMALL });
      KB.rect(ctx, 10, 48, 236, 1, '#405070');
      const rowH = Math.min(11, Math.floor(74 / Math.max(1, lv.length)));
      for (let i = 0; i < lv.length; i++) {
        const id = lv[i].id, y = 52 + i * rowH;
        const tt = CH.bestTime(id), ok = CH.bestNohit(id), nt = CH.bestNohitTime(id);
        KB.text(ctx, 'W' + (i + 1), 12, y, { color: (tt || ok) ? C.yellow : '#5c6884' });
        KB.text(ctx, tt ? mmssff(tt) : '--:--.--', 150, y, { color: tt ? C.cyan : '#5c6884', align: 'right' });
        if (ok) { KB.rect(ctx, 158, y - 1, 22, 10, '#20402c'); KB.text(ctx, 'OK', 161, y, { color: '#80ffa0' }); }
        else KB.text(ctx, '--', 162, y, { color: '#5c6884' });
        KB.text(ctx, nt ? mmss(nt) : '--:--', 246, y, { color: nt ? C.yellow : '#5c6884', align: 'right' });
      }
      // ② 挑戰塔 + Boss Rush 變體
      panel(ctx, 6, 132, 244, 32);
      const tw = CH.bestTower();
      T(ctx, '挑戰塔', 12, 136, { color: '#8fa0bc', size: UI.MS_SMALL });
      KB.text(ctx, (tw.bestFloor | 0) ? (tw.bestFloor + 'F') : '--', 96, 137, { color: (tw.bestFloor | 0) ? C.yellow : '#5c6884', align: 'right' });
      KB.text(ctx, (tw.bestTime | 0) ? mmss(tw.bestTime) : '--:--', 150, 137, { color: (tw.bestTime | 0) ? C.cyan : '#5c6884', align: 'right' });
      KB.text(ctx, 'x' + (tw.clears | 0), 180, 137, { color: (tw.clears | 0) ? '#fff' : '#5c6884', align: 'right' });
      const av = (CH.save().arena) || {};
      const done = Object.keys(av).filter(k => av[k] && av[k].cleared);
      T(ctx, 'Boss Rush 變體', 12, 149, { color: '#8fa0bc', size: UI.MS_SMALL });
      KB.text(ctx, done.length ? done.join(' ') : '--', 246, 150, { color: done.length ? C.pink : '#5c6884', align: 'right' });
      // ③ 每日挑戰最近 7 天
      panel(ctx, 6, 168, 244, 32);
      const rec = CH.dailyRecent(7);
      const oldest = rec[rec.length - 1];
      T(ctx, '每日', 12, 170, { color: '#8fa0bc', size: UI.MS_SMALL });
      // 欄寬只有 28px（放不下 MMDD 4 個字）⇒ 欄位只畫「日」，月份畫在左邊標籤下方
      T(ctx, oldest.key.slice(4, 6) + '月', 12, 182, { color: '#5c6884', size: UI.MS_SMALL });
      for (let i = 0; i < rec.length; i++) {
        const r = rec[rec.length - 1 - i], x = 52 + i * 28;
        KB.text(ctx, r.key.slice(6), x, 171, { color: r.today ? C.yellow : '#8fa0bc' });
        const v = r.rec;
        const txt = !v ? '--' : (v.ok ? 'CLR' : (v.floor | 0) + 'F');
        KB.text(ctx, txt, x - 4, 184, { color: !v ? '#5c6884' : (v.ok ? '#80ffa0' : '#ffa060') });
      }
    }

    // ---------- 單一世界 ----------
    drawWorld(ctx, i) {
      const UI = U(), C = UI.C, T = UI.text, panel = UI.panel;
      const lv = (KB.LEVELS || [])[i]; if (!lv) return;
      const r = recordOf(lv.id), su = summary();
      panel(ctx, 6, 32, 244, 168);
      // 關名
      KB.text(ctx, 'W' + (i + 1), 14, 40, { color: C.yellow });
      UI.fitText(ctx, lv.name || lv.id, 38, 35, 160, { color: '#fff', size: 16 });
      // 狀態（未通關 / CLEAR / EXTRA CLEAR）
      const state = r.extra ? 'EXTRA CLEAR' : (r.cleared ? 'CLEAR' : '未通關');
      const scol = r.extra ? '#ff6070' : (r.cleared ? C.yellow : C.grey);
      if (r.extra) { KB.rect(ctx, 156, 34, 88, 12, '#3a1020'); KB.text(ctx, state, 200, 36, { color: scol, align: 'center' }); }
      else if (r.cleared) KB.text(ctx, state, 242, 36, { color: scol, align: 'right' });
      else T(ctx, state, 242, 34, { color: scol, align: 'right', size: UI.MS });
      KB.rect(ctx, 14, 52, 228, 1, '#405070');
      // 左欄：數值列
      const rows = [
        ['最佳分數', r.best ? pad7(r.best) : '-------', r.best ? '#fff' : '#5c6884'],
        ['最短時間', r.time ? mmss(r.time) : '--:--', r.time ? C.cyan : '#5c6884'],
        ['通關次數', String(r.plays), r.plays ? '#fff' : '#5c6884'],
        ['大星星', r.stars + ' / 3', r.stars >= 3 ? C.yellow : '#fff'],
      ];
      for (let k = 0; k < rows.length; k++) {
        const y = 60 + k * 22;
        T(ctx, rows[k][0], 18, y, { color: '#8fa0bc', size: UI.MS });
        KB.text(ctx, rows[k][1], 150, y + 3, { color: rows[k][2], align: 'right' });
      }
      // 大星星圖示列
      if (UI.drawStarRow) UI.drawStarRow(ctx, 18, 152, lv.id, { left: true, plate: false });
      // 右側：評價印章
      const rk = r.rank;
      KB.rect(ctx, 166, 60, 72, 72, 'rgba(8,14,28,0.55)');
      KB.text(ctx, 'RANK', 202, 64, { color: '#8fa0bc', align: 'center' });
      if (rk) UI.bigText(ctx, rk, 202, 86, 4, { color: rankColor(rk), outline: '#101830', align: 'center' });
      else UI.bigText(ctx, '-', 202, 88, 3, { color: '#5c6884', outline: '#101830', align: 'center' });
      if (KB.PROG && KB.PROG.drawTrophy && r.cleared) KB.PROG.drawTrophy(ctx, 226, 118, C.yellow);
      // 底部：本世界的 Extra 說明
      KB.rect(ctx, 14, 168, 228, 1, '#405070');
      const msg = r.extra ? 'Extra 模式已通關 —— 究極挑戰達成！'
        : (r.cleared ? '挑戰 Extra 模式：敵人更強、HP 3' : '還沒通關這個世界');
      UI.fitText(ctx, msg, 128, 176, 224, { color: r.extra ? '#ff9090' : C.grey, align: 'center', size: UI.MS_SMALL });
      void su;
    }
  }
  KB.RecordsScene = RecordsScene;
})();
