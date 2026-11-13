/*
 * games/cart1/tower/song.js — 《星塵塔防》原創配樂 / 音效（只走 2A03 五聲道，engine/music.js 格式）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-4 cart1-strategy agent（R5）。旋律全部自己寫（D 多利安 / G 大調的原創動機）。
 * 曲：title（標題，speed 8）、battle（守備，speed 6，8 小節循環）、clear（守住，不循環）、over（失守，不循環）
 * 音效（名稱前綴 tower_）：move / build / upgrade / sell / error / shot / zap / freeze / pop / leak / wave
 * 契約：CT.Tower.Audio = { init(nes), play(key), stop(), sfx(name), tick(), current }
 * 離線渲染：`tools/apu_render.py --game cart1/tower` 只載入本檔（此時沒有 CT.register）⇒
 *   只在那個情境下掛 window.CR.SONGS / SFX 給工具讀（遊戲頁不開新全域）。
 */
(function (global) {
  'use strict';
  var NES = global.NES = global.NES || {};
  var offline = !(global.CT && global.CT.register);
  var CT = global.CT = global.CT || {};
  var R = CT.Tower = CT.Tower || {};

  function tk(s) { return String(s).split(/\s+/).filter(function (t) { return t.length; }); }
  function mel(str, inst, vol, duty) {
    return tk(str).map(function (t) {
      if (t === '-') return null;
      if (t === '=') return { note: '===' };
      var r = { note: t, inst: inst, vol: vol };
      if (duty !== undefined) r.duty = duty;
      return r;
    });
  }
  var DR = {
    k: { note: 13, inst: 'kick', vol: 15, duty: 0 },
    s: { note: 6, inst: 'snare', vol: 13, duty: 0 },
    h: { note: 2, inst: 'hat', vol: 9, duty: 0 },
    o: { note: 3, inst: 'ohat', vol: 10, duty: 0 }
  };
  function drm(str) { return tk(str).map(function (t) { return DR[t] || null; }); }
  function arp(chords, inst, vol) {         // 每拍一個琶音和弦短音
    var out = [];
    chords.forEach(function (c) {
      out.push({ note: c[0], inst: inst, vol: vol, duty: 1, arp: c[1] });
      out.push(null); out.push(null); out.push(null);
    });
    return out;
  }
  var MIN = [0, 3, 7], MAJ = [0, 4, 7];
  function Song(name, speed) { this.s = { name: name, speed: speed, rows: 16, loop: 0, patterns: [], order: [], instruments: INST }; }
  Song.prototype.bar = function (p1, p2, tri, noi) {
    var pt = { p1: p1, p2: p2, tri: tri, noi: noi }, k;
    for (k in pt) if (pt[k] && pt[k].length !== 16) throw new Error('tower song ' + this.s.name + ' ' + k + ' 長度 ' + pt[k].length);
    this.s.patterns.push(pt);
    this.s.order.push(this.s.patterns.length - 1);
    return this;
  };

  var INST = {
    lead: { vol: [15, 14, 13, 12, 12, 11, 11, 10, 10, 9], volLoop: 9, duty: [2, 2, 1] },
    soft: { vol: [11, 10, 9, 8, 8, 7, 7, 6], volLoop: 7, duty: [1] },
    stab: { vol: [12, 10, 8, 6, 4, 2, 0], duty: [1] },
    bass: { vol: [15] },
    kick: { vol: [15, 12, 8, 4, 0], pitch: [0] },
    snare: { vol: [14, 11, 8, 6, 4, 2, 0] },
    hat: { vol: [9, 5, 2, 0] },
    ohat: { vol: [10, 8, 6, 4, 2, 0] }
  };

  /* ---------------- 守備曲（D 多利安，8 小節） ---------------- */
  function buildBattle() {
    var S = new Song('星核守望（battle）', 6);
    var L = [
      'D-5 -   -   -   F-5 -   E-5 -   D-5 -   C-5 -   A-4 -   -   -  ',
      'C-5 -   D-5 -   E-5 -   G-5 -   F-5 -   E-5 -   D-5 -   -   -  ',
      'A-4 -   -   -   C-5 -   D-5 -   E-5 -   -   -   G-5 -   E-5 -  ',
      'D-5 -   -   -   -   -   -   -   C-5 -   -   -   A-4 -   -   -  ',
      'F-5 -   -   -   E-5 -   F-5 -   G-5 -   A-5 -   G-5 -   F-5 -  ',
      'E-5 -   -   -   D-5 -   E-5 -   F-5 -   -   -   E-5 -   C-5 -  ',
      'D-5 -   F-5 -   A-5 -   -   -   G-5 -   F-5 -   E-5 -   G-5 -  ',
      'D-5 -   -   -   -   -   -   -   A-4 -   -   -   D-5 -   -   -  '];
    var CH = [
      [['D-4', MIN], ['D-4', MIN], ['D-4', MIN], ['D-4', MIN]],
      [['C-4', MAJ], ['C-4', MAJ], ['G-3', MAJ], ['G-3', MAJ]],
      [['A-3', MIN], ['A-3', MIN], ['C-4', MAJ], ['C-4', MAJ]],
      [['D-4', MIN], ['D-4', MIN], ['A-3', MIN], ['A-3', MIN]],
      [['F-3', MAJ], ['F-3', MAJ], ['C-4', MAJ], ['C-4', MAJ]],
      [['C-4', MAJ], ['C-4', MAJ], ['A-3', MIN], ['A-3', MIN]],
      [['D-4', MIN], ['D-4', MIN], ['G-3', MAJ], ['G-3', MAJ]],
      [['D-4', MIN], ['D-4', MIN], ['A-3', MAJ], ['D-4', MIN]]];
    var B = [
      'D-2 -   D-3 -   D-2 -   D-3 -   D-2 -   D-3 -   C-2 -   C-3 -  ',
      'C-2 -   C-3 -   C-2 -   C-3 -   G-2 -   G-3 -   G-2 -   G-3 -  ',
      'A-2 -   A-3 -   A-2 -   A-3 -   C-3 -   C-4 -   C-3 -   C-4 -  ',
      'D-2 -   D-3 -   D-2 -   D-3 -   A-2 -   A-3 -   A-2 -   C-3 -  ',
      'F-2 -   F-3 -   F-2 -   F-3 -   C-3 -   C-4 -   C-3 -   C-4 -  ',
      'C-3 -   C-4 -   C-3 -   C-4 -   A-2 -   A-3 -   A-2 -   A-3 -  ',
      'D-2 -   D-3 -   D-2 -   D-3 -   G-2 -   G-3 -   G-2 -   G-3 -  ',
      'D-2 -   D-3 -   D-2 -   D-3 -   A-2 -   A-3 -   D-2 -   -   -  '];
    var D1 = 'k - - h s - h - k - k h s - h -', D2 = 'k - - h s - h - k k - h s s s s';
    for (var i = 0; i < 8; i++) {
      S.bar(mel(L[i], 'lead', 12, 1), arp(CH[i], 'stab', 7), mel(B[i], 'bass', 15), drm(i === 7 ? D2 : D1));
    }
    return S.s;
  }
  /* ---------------- 標題曲（G 大調，4 小節） ---------------- */
  function buildTitle() {
    var S = new Song('塔與星（title）', 8);
    var L = [
      'G-4 -   B-4 -   D-5 -   -   -   E-5 -   D-5 -   B-4 -   -   -  ',
      'C-5 -   -   -   B-4 -   A-4 -   G-4 -   -   -   A-4 -   -   -  ',
      'B-4 -   D-5 -   G-5 -   -   -   F#5 -   E-5 -   D-5 -   -   -  ',
      'E-5 -   D-5 -   C-5 -   A-4 -   G-4 -   -   -   -   -   -   -  '];
    var CH = [
      [['G-3', MAJ], ['G-3', MAJ], ['E-3', MIN], ['E-3', MIN]],
      [['C-4', MAJ], ['C-4', MAJ], ['D-4', MAJ], ['D-4', MAJ]],
      [['G-3', MAJ], ['G-3', MAJ], ['B-3', MIN], ['B-3', MIN]],
      [['C-4', MAJ], ['D-4', MAJ], ['G-3', MAJ], ['G-3', MAJ]]];
    var B = [
      'G-2 -   -   -   D-3 -   -   -   E-2 -   -   -   B-2 -   -   -  ',
      'C-3 -   -   -   G-2 -   -   -   D-3 -   -   -   A-2 -   -   -  ',
      'G-2 -   -   -   D-3 -   -   -   B-2 -   -   -   F#2 -   -   -  ',
      'C-3 -   -   -   D-3 -   -   -   G-2 -   -   -   D-3 -   -   -  '];
    for (var i = 0; i < 4; i++) S.bar(mel(L[i], 'soft', 12, 1), arp(CH[i], 'stab', 7), mel(B[i], 'bass', 15), drm('k - - - h - - - s - - - h - - -'));
    return S.s;
  }
  function buildClear() {
    var S = new Song('守住了（clear）', 6);
    S.bar(mel('G-4 -   B-4 -   D-5 -   G-5 -   -   -   D-5 -   G-5 -   -   -  ', 'lead', 14, 2),
          mel('B-3 -   D-4 -   G-4 -   B-4 -   -   -   B-4 -   D-5 -   -   -  ', 'soft', 9, 1),
          mel('G-2 -   -   -   D-3 -   -   -   G-2 -   -   -   G-2 -   -   -  ', 'bass', 15),
          drm('k - - - s - - - k - k - s - s s'));
    S.bar(mel('A-5 -   -   -   B-5 -   -   -   G-5 -   -   -   -   -   -   =  ', 'lead', 14, 2),
          mel('C-5 -   -   -   D-5 -   -   -   B-4 -   -   -   -   -   -   =  ', 'soft', 9, 1),
          mel('D-3 -   -   -   D-3 -   -   -   G-2 -   -   -   -   -   -   =  ', 'bass', 15),
          drm('k - - - k - - - k - - - - - - -'));
    S.s.playLoop = false;
    return S.s;
  }
  function buildOver() {
    var S = new Song('星核碎裂（over）', 9);
    S.bar(mel('D-5 -   -   -   C-5 -   -   -   A#4 -   -   -   A-4 -   -   -  ', 'soft', 12, 1),
          mel('F-4 -   -   -   E-4 -   -   -   D-4 -   -   -   C#4 -   -   -  ', 'soft', 8, 0),
          mel('D-2 -   -   -   C-2 -   -   -   A#1 -   -   -   A-1 -   -   -  ', 'bass', 15),
          drm('k - - - - - - - k - - - - - - -'));
    S.bar(mel('D-4 -   -   -   -   -   -   -   -   -   -   -   -   -   -   =  ', 'soft', 12, 1),
          mel('A-3 -   -   -   -   -   -   -   -   -   -   -   -   -   -   =  ', 'soft', 8, 0),
          mel('D-2 -   -   -   -   -   -   -   -   -   -   -   -   -   -   =  ', 'bass', 15),
          drm('k - - - - - - - - - - - - - - -'));
    S.s.playLoop = false;
    return S.s;
  }

  /* ---------------- 音效 ---------------- */
  function sq(list) {                       // [[音, 幀, 音量, duty]]
    var out = [];
    list.forEach(function (e) {
      for (var j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], duty: e[3] === undefined ? 2 : e[3], retrigger: true } : {});
    });
    out.push({ off: true });
    return out;
  }
  function nz(list) {
    var out = [];
    list.forEach(function (e) {
      for (var j = 0; j < e[1]; j++) out.push(j === 0 ? { note: e[0], vol: e[2], retrigger: true } : { vol: Math.max(0, e[2] - j) });
    });
    out.push({ off: true });
    return out;
  }
  var SFX = {
    tower_move: { priority: 2, data: { p2: sq([['E-6', 2, 8, 1]]) } },
    tower_build: { priority: 6, data: { p2: sq([['C-5', 3, 12, 2], ['G-5', 3, 12], ['C-6', 5, 12]]), noi: nz([[9, 4, 11]]) } },
    tower_upgrade: { priority: 6, data: { p2: sq([['C-6', 3, 12, 1], ['E-6', 3, 12], ['G-6', 3, 12], ['C-7', 6, 12]]) } },
    tower_sell: { priority: 6, data: { p2: sq([['G-6', 3, 11, 1], ['E-6', 3, 11], ['C-6', 5, 11]]) } },
    tower_error: { priority: 5, data: { p2: sq([['C-4', 6, 11, 3], ['C-4', 2, 0], ['C-4', 6, 11]]) } },
    tower_shot: { priority: 1, data: { noi: nz([[1, 2, 6]]) } },
    tower_zap: { priority: 3, data: { noi: nz([[4, 3, 12], [2, 3, 10], [6, 4, 7]]) } },
    tower_freeze: { priority: 3, data: { p2: sq([['B-6', 2, 8, 0], ['E-7', 2, 7], ['B-6', 2, 6], ['E-7', 3, 5]]) } },
    tower_pop: { priority: 2, data: { noi: nz([[8, 3, 9], [11, 3, 6]]) } },
    tower_leak: { priority: 7, data: { p2: sq([['A-4', 4, 13, 2], ['E-4', 4, 12], ['A-3', 8, 11]]) } },
    tower_wave: { priority: 6, data: { p2: sq([['D-5', 6, 12, 2], ['D-5', 3, 0], ['A-5', 10, 12]]) } }
  };
  var SONGS = { title: buildTitle(), battle: buildBattle(), clear: buildClear(), over: buildOver() };

  function drv() { return (NES.Music && NES.Music._default !== undefined) ? NES.Music : (NES.Music || null); }
  var Audio = {
    SONGS: SONGS, SFX: SFX, current: null, last: null, sfxLog: [],
    init: function () {
      var d = drv(); if (!d || !d.define) return false;
      for (var k in SFX) { try { d.define(k, SFX[k]); } catch (e) { return false; } }
      return true;
    },
    play: function (key) {
      var d = drv(), s = SONGS[key];
      Audio.current = key;
      if (!d || !s) return false;
      try { d.play(s, { loop: s.playLoop !== false }); return true; } catch (e) { return false; }
    },
    stop: function () { var d = drv(); Audio.current = null; try { d && d.stop(); } catch (e) { } },
    sfx: function (name) {
      var d = drv(); Audio.last = name;
      Audio.sfxLog.push(name); if (Audio.sfxLog.length > 32) Audio.sfxLog.shift();
      if (!d) return false;
      try { d.sfx(name); return true; } catch (e) {
        try { d.define(name, SFX[name]); d.sfx(name); return true; } catch (e2) { return false; }
      }
    },
    tick: function () { var d = drv(); try { d && d.tick && d.tick(); } catch (e) { } }
  };
  R.Audio = Audio;
  if (offline) {                            // 只給 tools/apu_render.py 用（見檔頭）
    global.CR = global.CR || {};
    if (!global.CR.SONGS) global.CR.SONGS = SONGS;
    if (!global.CR.SFX) global.CR.SFX = SFX;
  }
})(typeof window !== 'undefined' ? window : this);
