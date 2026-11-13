/*
 * games/cart1/brick/levels.js — 《星塵打磚塊》10 回合磚陣（全部原創配置）
 * ---------------------------------------------------------------------------
 * 擁有者：C5-2 cart1-break
 *
 * 格子：14 欄 × 14 列（一磚 16×8；第 0 列 = 名稱表第 6 列、第 0 欄 = 名稱表第 2 欄）。
 * 字元：a / b = 第 1 組調色盤的款 A / B；c / d = 第 2 組；e / f = 第 3 組；
 *       H = 硬磚（打 2 下，第 6 回合起 3 下；用同一屬性格的調色盤）；X = 不壞磚；. = 空。
 * 屬性限制（研究 05 §1：16×16 一組調色盤）：一磚寬 16 px ＝ 一屬性格寬，
 *   ⇒ **同一欄的第 2k / 2k+1 列必須同組調色盤**（test_brick.py 逐格驗證）。`top` 必為偶數。
 * pal：背景第 1~3 組 [c1, c2, c3]；boss：第 10 回合的魔王「蝕核」佔第 4~9 欄 × 第 0~7 列（第 3 組調色盤）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var K = CT.Brick = CT.Brick || {};

  K.ROUNDS = [
    { name: 'FIRST LIGHT', top: 2, pal: [[0x16, 0x27, 0x30], [0x19, 0x2A, 0x30], [0x12, 0x21, 0x30]],
      rows: ['..aaaaaaaaaa..',
             '..bbbbbbbbbb..',
             '..cccc..cccc..',
             '..dddd..dddd..',
             '....eeeeee....',
             '....ffffff....'] },
    { name: 'TWIN MOONS', top: 0, pal: [[0x13, 0x24, 0x30], [0x17, 0x28, 0x30], [0x1C, 0x2C, 0x30]],
      rows: ['...aa....aa...',
             '..abba..abba..',
             '.cdHHdccdHHdc.',
             '.cdHHdccdHHdc.',
             '..effe..effe..',
             '...ee....ee...'] },
    { name: 'COMET', top: 0, pal: [[0x06, 0x26, 0x30], [0x18, 0x28, 0x30], [0x11, 0x2C, 0x30]],
      rows: ['aaaaaa........',
             'bbbbbbbb......',
             'cccccccccc....',
             'dddddddddddd..',
             'eeeeeeeeeeeeee',
             '..............',
             '..X...X...X...'] },
    { name: 'LATTICE', top: 0, pal: [[0x14, 0x25, 0x30], [0x1A, 0x2B, 0x30], [0x16, 0x27, 0x30]],
      rows: ['H.aaaa..aaaa.H',
             'H.bbbb..bbbb.H',
             '..cccc..cccc..',
             '..dHHd..dHHd..',
             'eeee..ee..eeee',
             'ffff..ff..ffff'] },
    { name: 'HOURGLASS', top: 0, pal: [[0x12, 0x22, 0x30], [0x15, 0x26, 0x30], [0x19, 0x29, 0x30]],
      rows: ['aaaaaaaaaaaaaa',
             '.bbbbbbbbbbbb.',
             '..cccccccccc..',
             '...dddHHddd...',
             '...eeeHHeee...',
             '..ffffffffff..',
             '.eeeeeeeeeeee.',
             'ffffffffffffff'] },
    { name: 'NEBULA', top: 0, pal: [[0x13, 0x23, 0x30], [0x1B, 0x2B, 0x30], [0x17, 0x27, 0x30]],
      rows: ['X.aaaa..aaaa.X',
             'X.bbbb..bbbb.X',
             '..............',
             'cccc.XXXX.cccc',
             'dddd......dddd',
             '..............',
             'eeHHeeHHeeHHee',
             'ffffffffffffff'] },
    { name: 'PILLARS', top: 0, pal: [[0x16, 0x26, 0x30], [0x11, 0x21, 0x30], [0x1A, 0x2A, 0x30]],
      rows: ['ab.cd.ef.ab.cd',
             'ba.dc.fe.ba.dc',
             'ab.cd.ef.ab.cd',
             'ba.dc.fe.ba.dc',
             'HH.HH.HH.HH.HH',
             '..............',
             '..X........X..'] },
    { name: 'CROWN', top: 0, pal: [[0x18, 0x28, 0x30], [0x14, 0x24, 0x30], [0x12, 0x2C, 0x30]],
      rows: ['a..a..aa..a..a',
             'aa.aa.bb.aa.aa',
             'cccccccccccccc',
             'dHdHdHdHdHdHdH',
             'eeeeeeeeeeeeee',
             'ffXXffffffXXff',
             '..............',
             'HH..........HH'] },
    { name: 'FORTRESS', top: 0, pal: [[0x17, 0x27, 0x30], [0x13, 0x23, 0x30], [0x1C, 0x2B, 0x30]],
      rows: ['XXX..XXXX..XXX',
             'aaaaaaaaaaaaaa',
             'bbbbbbbbbbbbbb',
             'bHbHbHbHbHbHbH',
             'cccccccccccccc',
             '..dddddddddd..',
             '..eeeeeeeeee..',
             '..ffffffffff..',
             '..X..X..X..X..'] },
    { name: 'ECLIPSE CORE', top: 0, boss: true, pal: [[0x16, 0x27, 0x30], [0x12, 0x21, 0x30], [0x0C, 0x30, 0x14]],
      rows: ['..............',
             '..............',
             '..............',
             '..............',
             '..............',
             '..............',
             '..............',
             '..............',
             '..............',
             '..............',
             'ab..ab..ab..ab',
             'ba..ba..ba..ba'] }
  ];
  K.BOSS_BOX = { c0: 4, r0: 0, w: 6, h: 8 };   // 格子單位（每格 16×8）⇒ 名稱表第 10..21 欄 × 第 6..13 列
})();
