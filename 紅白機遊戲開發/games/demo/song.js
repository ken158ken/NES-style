/*
 * games/demo/song.js — 測試房的音樂 / 音效層（薄包裝，容錯）
 * ---------------------------------------------------------------------------
 * 擁有者：demo agent ｜ 依賴：engine/music.js（NES.Music.DEMO 原創短曲 + jump / coin 音效）
 *
 * 契約重點（docs/ENGINE_API.md §10、D5）：
 *   - `NES.boot` 已經幫忙 `NES.Music.attach(apu)`，且 `nes.music === NES.Music`（同一個 driver），
 *     attach 時也已經 define 了 'jump' 與 'coin'。這裡再 define 一次是冪等的保險。
 *   - `music.tick()` 必須由遊戲的 update() 每幀呼叫一次（apu.tick() 則由 nes.js 自己呼叫）。
 *   - 音效搶聲道：jump priority 5（p2）、coin priority 6（p2）→ coin 可以搶下 jump，
 *     音效結束後 p2 自動還給音樂（driver 內部 _restore）。
 */
(function () {
  'use strict';
  var NES = window.NES = window.NES || {};
  var DEMO = window.DEMO = window.DEMO || {};

  var M = NES.Music || null;
  var SONG = (M && M.DEMO && M.DEMO.song) || null;

  function driver(nes) {
    return (nes && nes.music) || (NES.Music && NES.Music._default ? NES.Music : null);
  }

  var Audio = {
    ready: !!(M && SONG),
    songName: SONG ? (SONG.name || 'DEMO') : null,
    playing: false,

    init: function (nes) {
      var d = driver(nes);
      if (!d || !M || !M.DEMO) return false;
      try {
        d.define('jump', M.DEMO.sfx.jump);
        d.define('coin', M.DEMO.sfx.coin);
      } catch (e) { /* attach 已經 define 過，或 driver 不支援 → 忽略 */ }
      return true;
    },

    // 開場曲：NES.Music.DEMO 短曲循環
    play: function (nes) {
      var d = driver(nes);
      if (!d || !SONG) return false;
      try { d.play(SONG, { loop: true }); Audio.playing = true; return true; }
      catch (e) { return false; }
    },

    stop: function (nes) {
      var d = driver(nes);
      if (!d) return false;
      try { d.stop(); Audio.playing = false; return true; } catch (e) { return false; }
    },

    sfx: function (nes, name) {
      var d = driver(nes);
      if (!d) return false;
      try { d.sfx(name); return true; } catch (e) { return false; }
    },

    jump: function (nes) { return Audio.sfx(nes, 'jump'); },
    coin: function (nes) { return Audio.sfx(nes, 'coin'); },

    tick: function (nes) {
      var d = driver(nes);
      if (!d) return;
      try { d.tick(); } catch (e) { /* 音樂出錯不能拖垮遊戲迴圈 */ }
    },

    // 測試用：目前有哪些音效佔著哪些聲道
    state: function (nes) {
      var d = driver(nes);
      if (!d || !d.state) return null;
      try {
        var s = d.state();
        var owners = {};
        for (var i = 0; i < s.channels.length; i++) owners[s.channels[i].name] = s.channels[i].owner || null;
        return {
          playing: s.playing, row: s.row, orderIndex: s.orderIndex,
          sfx: s.sfx.map(function (x) { return x.name; }),
          sfxChannels: s.sfx.map(function (x) { return x.channels.join(','); }),
          owners: owners
        };
      } catch (e) { return null; }
    }
  };

  DEMO.Audio = Audio;
})();
