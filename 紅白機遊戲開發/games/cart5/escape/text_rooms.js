/*
 * games/cart5/escape/text_rooms.js — 《星塵密室》三間密室的謎題資料 + 全部房間文字（R9 C9-4 cart5-escape；全部原創）
 * ---------------------------------------------------------------------------
 * 純資料（宣告式）：遊戲執行期（logic.js）、機器人（BFS）、測試（Python 獨立實作的解題器）讀同一份。
 * 文字是字串常值 ⇒ tools/cjk_glyphs.py 會自動收字；改完要重跑 `$PY tools/cjk_glyphs.py`。
 *
 * 房間 room：
 *   name 房名、W 牆色（四組背景調色盤共用的 c1）、pals 四組背景調色盤、limit 時限（幀）、par 標準時間（幀）
 *   items { id: {n 名稱, d 說明} }
 *   hot   [{ id, v 'N'|'E'|'S'|'W', r [col,row,w,h]（房間畫面內的格；畫面 32×16 格）, n 名稱,
 *            show 條件（可省略 = 一直在）, rules [{ i 手上的物品（省略 = 空手）, c 條件, d 動作[], s 訊息 }], l 預設訊息 }]
 *         規則由上往下找第一條「物品相同且條件成立」的；都不成立 ⇒ 空手顯示 l、拿著東西顯示「用不上」。
 *   combos [{ a, b, c 條件, d 動作[], s }]（a、b 不分順序）
 *   puz   { id: { kind 'dial'|'lights'|'rings'|'pipes'|'look', …參數, d 解開後的動作[], s 解開訊息, t 標題, help 操作說明,
 *            know 撥盤鎖「推得出答案」需要的線索旗標（解題器只在看過線索後才走這步；遊戲裡照樣可以亂猜） } }
 *   steps [{ done 條件, h [提示1, 提示2, 提示3]（漸進）, cheat 動作[] }]：提示 / 密技依「第一個還沒完成的環節」
 * 條件：'a&b&!c'（旗標；`got_x` = 曾經拿到物品 x；`has_x` = 現在手上有 x）。空字串 = 永遠成立。
 * 動作：'set:f' / 'clr:f' / 'get:x'（同時 set got_x）/ 'lose:x' / 'open:puz' / 'win'
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var E = CT.Escape = CT.Escape || {};
  var MIN = 60 * 60;   // 1 分鐘（幀）

  E.ROOMS = [
    /* =============================================================== 第一室：觀星書房（簡單） */
    {
      id: 'study', name: '觀星書房', W: 0x07,
      pals: [[0x07, 0x28, 0x30], [0x07, 0x17, 0x27], [0x07, 0x16, 0x28], [0x07, 0x1A, 0x21]],
      limit: 15 * MIN, par: 4 * MIN, start: 'N',
      intro: '第一間：觀星書房。門被鎖上了，找出密碼走出去吧！',
      items: {
        trowel: { n: '小鏟子', d: '園藝用的小鏟子。' },
        key: { n: '銅鑰匙', d: '一把小小的銅鑰匙。' },
        flash: { n: '手電筒', d: '沒有電池的手電筒。' },
        battery: { n: '電池', d: '一顆圓筒形的電池。' },
        flashOn: { n: '亮的手電筒', d: '裝好電池，可以照亮暗處。' }
      },
      hot: [
        { id: 'door', v: 'N', r: [13, 2, 6, 12], n: '大門',
          rules: [{ c: 'unlocked', d: ['win'], s: '推開大門，外面是通往下一間的走廊。' }],
          l: '厚重的木門，右邊裝著數字鍵盤鎖。' },
        { id: 'keypad', v: 'N', r: [20, 6, 2, 3], n: '密碼鎖',
          rules: [{ c: 'unlocked', s: '密碼鎖亮著綠燈，已經打開了。' }, { d: ['open:lock'] }] },
        { id: 'starmap', v: 'N', r: [3, 2, 7, 6], n: '星圖',
          l: '一幅星圖。角落寫著：「觀星的人，要先學會觀察身邊。」' },
        { id: 'mat', v: 'N', r: [12, 14, 8, 2], n: '門墊',
          l: '掀開門墊，底下什麼也沒有。看來沒那麼簡單。' },
        { id: 'shelf', v: 'E', r: [3, 1, 12, 9], n: '書架',
          l: '書架中間那層有四本彩色的書，書背寫著數字：藍 2、紅 7、綠 4、黃 1。' },
        { id: 'toolbox', v: 'E', r: [3, 10, 12, 4], n: '工具箱',
          rules: [{ c: '!got_trowel', d: ['get:trowel'], s: '書架下層的工具箱裡有一把小鏟子。拿走了。' }],
          l: '工具箱裡只剩幾根生鏽的釘子。' },
        { id: 'window', v: 'E', r: [18, 2, 11, 7], n: '窗戶',
          l: '窗外是滿天星星。窗戶被釘死了，打不開。' },
        { id: 'globe', v: 'E', r: [20, 9, 6, 6], n: '地球儀',
          l: '轉了一圈地球儀。北極貼著一顆小星星貼紙。' },
        { id: 'diary', v: 'S', r: [6, 5, 4, 2], n: '日記',
          l: '朔叔的日記：「學徒總是急著找鑰匙，卻忘了先看清楚整個房間。」' },
        { id: 'lamp', v: 'S', r: [17, 2, 3, 5], n: '檯燈',
          l: '檯燈的燈泡燒壞了，按開關也不會亮。' },
        { id: 'drawer', v: 'S', r: [13, 8, 6, 2], n: '抽屜',
          rules: [{ c: 'drawerOpen', s: '抽屜已經空了。' },
            { i: 'key', d: ['lose:key', 'set:drawerOpen', 'get:flash'], s: '用銅鑰匙打開抽屜。裡面有一支手電筒，可是沒有電池。' }],
          l: '書桌的抽屜上了鎖。' },
        { id: 'under', v: 'S', r: [6, 11, 14, 4], n: '書桌底下',
          rules: [{ c: 'clue', s: '桌板底下寫著：「大門密碼＝書架上四本彩色書的數字，照彩虹的顏色順序排。」' },
            { i: 'flashOn', d: ['set:clue'], s: '用手電筒一照，桌板底下寫著：「大門密碼＝書架上四本彩色書的數字，照彩虹的顏色順序排。」' },
            { i: 'flash', s: '手電筒沒有電，按了也不會亮。' }],
          l: '書桌底下黑漆漆的，什麼都看不清楚。' },
        { id: 'chair', v: 'S', r: [23, 6, 5, 9], n: '椅子', show: '!chairMoved',
          rules: [{ c: 'clockHigh', d: ['set:chairMoved'], s: '把椅子搬到西邊的時鐘底下了。' }],
          l: '一張結實的木椅。' },
        { id: 'clock', v: 'W', r: [13, 1, 5, 4], n: '時鐘',
          rules: [{ c: 'got_battery', s: '時鐘停在三點整，電池已經被拿走了。' },
            { c: 'chairMoved', d: ['get:battery'], s: '踩上椅子，打開時鐘背後的電池盒，拿到一顆電池。' },
            { d: ['set:clockHigh'], s: '時鐘停了，好像是沒電。可是掛得太高，搆不著。' }] },
        { id: 'plant', v: 'W', r: [3, 7, 6, 8], n: '盆栽',
          rules: [{ c: 'dug', s: '土已經翻過了。' },
            { i: 'trowel', d: ['set:dug', 'get:key'], s: '用小鏟子挖開土，挖出一把銅鑰匙！' }],
          l: '盆栽的土好像被翻動過。用手挖不動。' },
        { id: 'chairW', v: 'W', r: [13, 8, 5, 7], n: '椅子', show: 'chairMoved',
          l: '椅子墊在時鐘底下。' },
        { id: 'sofa', v: 'W', r: [20, 8, 9, 7], n: '沙發',
          l: '沙發縫裡只摸到一顆鈕扣。' }
      ],
      combos: [{ a: 'flash', b: 'battery', d: ['lose:flash', 'lose:battery', 'get:flashOn'], s: '把電池裝進手電筒。手電筒亮了！' }],
      puz: {
        lock: { kind: 'dial', know: 'clue', t: '大門的密碼鎖', chars: '0123456789', n: 4, ans: '7142', start: '0000',
          d: ['set:unlocked'], s: '喀啦一聲，密碼鎖亮起綠燈。大門打開了！',
          help: '上下改數字，左右換位置，按 A 試開。' }
      },
      steps: [
        { done: 'got_trowel', h: ['房間裡有沒有能用的工具？', '東邊書架的最下層有個箱子。', '調查東邊書架下層的工具箱，拿小鏟子。'], cheat: ['get:trowel'] },
        { done: 'dug', h: ['小鏟子能挖什麼呢？', '西邊盆栽的土好像被翻過。', '選小鏟子，對西邊的盆栽按 A。'], cheat: ['set:dug', 'get:key'] },
        { done: 'drawerOpen', h: ['鑰匙能打開哪裡？', '南邊的書桌有一個上鎖的抽屜。', '選銅鑰匙，對南邊書桌的抽屜按 A。'], cheat: ['lose:key', 'set:drawerOpen', 'get:flash'] },
        { done: 'clockHigh', h: ['手電筒沒電。哪裡有電池？', '西邊牆上的時鐘停了。', '到西邊調查時鐘。'], cheat: ['set:clockHigh'] },
        { done: 'chairMoved', h: ['時鐘太高了，要找東西墊腳。', '南邊有一張椅子。', '調查南邊的椅子，把它搬過去。'], cheat: ['set:chairMoved'] },
        { done: 'got_battery', h: ['墊腳的東西準備好了。', '再去西邊調查時鐘。', '踩上椅子調查時鐘，拿到電池。'], cheat: ['get:battery'] },
        { done: 'got_flashOn', h: ['手電筒和電池……', '物品可以兩兩組合。', '在物品欄選手電筒，再按電池。'], cheat: ['lose:flash', 'lose:battery', 'get:flashOn'] },
        { done: 'clue', h: ['哪裡暗得看不清楚？', '南邊的書桌底下黑漆漆的。', '選亮的手電筒，照南邊的書桌底下。'], cheat: ['set:clue'] },
        { done: 'unlocked', h: ['大門的密碼是四位數。', '書架上四本彩色書的數字，照彩虹的顏色排。', '彩虹是紅、黃、綠、藍，所以密碼是 7142。'], cheat: ['set:unlocked'] },
        { done: 'won', h: ['密碼鎖已經打開了。', '回到北邊的大門。', '調查北邊的大門就能出去。'], cheat: ['win'] }
      ]
    },

    /* =============================================================== 第二室：齒輪工坊（中等） */
    {
      id: 'works', name: '齒輪工坊', W: 0x00,
      pals: [[0x00, 0x10, 0x30], [0x00, 0x07, 0x17], [0x00, 0x16, 0x28], [0x00, 0x1A, 0x11]],
      limit: 20 * MIN, par: 6 * MIN, start: 'N',
      intro: '第二間：齒輪工坊。紅、綠、藍三盞燈全亮，鐵門才會打開。',
      items: {
        driver: { n: '螺絲起子', d: '十字的螺絲起子。' },
        oil: { n: '油壺', d: '裝著機油的小油壺。' },
        gear: { n: '生鏽的齒輪', d: '生鏽的齒輪，卡得轉不動。' },
        handle: { n: '閥門把手', d: '紅色的十字把手。' },
        oilGear: { n: '上油的齒輪', d: '上好油、轉得很順的齒輪。' }
      },
      hot: [
        { id: 'door', v: 'N', r: [11, 3, 10, 12], n: '鐵門',
          rules: [{ c: 'power&gearIn&water', d: ['win'], s: '三盞燈都亮了。鐵門轟隆隆地升了起來！' }],
          l: '沉重的鐵門，推也推不動。門上有紅、綠、藍三盞燈。' },
        { id: 'lamps', v: 'N', r: [11, 0, 10, 3], n: '三盞燈',
          l: '燈旁刻著：「紅燈管電，綠燈管齒輪，藍燈管水。三盞全亮，門才會開。」' },
        { id: 'slot', v: 'N', r: [22, 6, 5, 5], n: '齒輪座',
          rules: [{ c: 'gearIn', s: '齒輪咬得很緊，轉得很順。' },
            { i: 'oilGear', d: ['lose:oilGear', 'set:gearIn'], s: '裝上齒輪，機關喀啦喀啦轉了起來。綠燈亮了！' },
            { i: 'gear', s: '齒輪生鏽了，卡在軸上轉不動。' }],
          l: '門邊的機關少了一個齒輪，空著一根軸。' },
        { id: 'rules', v: 'N', r: [3, 3, 6, 6], n: '告示牌',
          l: '工坊守則：一、修理前先看說明。二、工具用完放回原位。三、齒輪要記得上油。' },
        { id: 'bench', v: 'E', r: [2, 9, 16, 6], n: '工作台',
          l: '工作台上堆滿木屑，還有一個生鏽的老虎鉗。' },
        { id: 'toolbox', v: 'E', r: [8, 5, 7, 4], n: '工具箱',
          rules: [{ c: 'boxOpen', s: '工具箱已經空了。' },
            { c: '!power', s: '工具箱裝著符號鎖，可是沒有電，按了也沒反應。' },
            { d: ['open:sym'] }] },
        { id: 'gears', v: 'E', r: [19, 1, 11, 9], n: '牆上的齒輪',
          rules: [{ d: ['set:sawGears'], s: '牆上掛著三個齒輪，各刻著一個符號：大的刻▲，中的刻●，小的刻★。' }] },
        { id: 'shelfTop', v: 'S', r: [2, 2, 9, 6], n: '架子上層',
          rules: [{ c: '!got_driver', d: ['get:driver'], s: '架子上層有一支螺絲起子。拿走了。' }],
          l: '架子上層只剩幾個空罐子。' },
        { id: 'shelfLow', v: 'S', r: [2, 8, 9, 6], n: '架子下層',
          rules: [{ c: '!got_oil', d: ['get:oil'], s: '架子下層有一個油壺。拿走了。' }],
          l: '架子下層只剩一捆麻繩。' },
        { id: 'valve', v: 'S', r: [13, 8, 5, 6], n: '閥門',
          rules: [{ c: 'valveOn', s: '閥門開著，水嘩啦啦地流。' },
            { i: 'handle', d: ['lose:handle', 'set:valveOn'], s: '裝上把手、轉開閥門。水流進管子了，可是管線好像接錯了。' }],
          l: '閥門的把手不見了，轉不動。' },
        { id: 'pipes', v: 'S', r: [20, 2, 10, 12], n: '管線盤',
          rules: [{ c: 'water', s: '水順著管線流向水車，藍燈亮了。' },
            { c: 'valveOn', d: ['open:pipe'] }],
          l: '一塊裝滿水管的面板，每一段都能轉動。可是現在沒有水。' },
        { id: 'panel', v: 'W', r: [3, 2, 8, 9], n: '配電盤',
          rules: [{ c: 'power', s: '九盞燈都亮著，電已經接通了。' },
            { c: 'panelOpen', d: ['open:lights'] },
            { i: 'driver', d: ['set:panelOpen', 'open:lights'], s: '用螺絲起子轉開蓋子。裡面是九顆開關燈。' }],
          l: '配電盤的蓋子用四顆螺絲鎖著。' },
        { id: 'poster', v: 'W', r: [13, 2, 6, 7], n: '海報',
          l: '海報：「配電盤說明——按一顆開關，它和上下左右的燈會一起切換。」' },
        { id: 'crate', v: 'W', r: [20, 8, 9, 7], n: '木箱',
          l: '木箱裡是一堆鐵釘和木片。' }
      ],
      combos: [{ a: 'gear', b: 'oil', d: ['lose:gear', 'lose:oil', 'get:oilGear'], s: '在齒輪上抹了油。生鏽的地方變得滑順了！' }],
      puz: {
        lights: { kind: 'lights', t: '配電盤', w: 3, h: 3, start: [1, 1, 0, 1, 0, 0, 0, 0, 1],
          d: ['set:power'], s: '九盞燈全亮！遠處傳來嗡的一聲，紅燈亮了。',
          help: '選開關按 A，它和上下左右的燈會一起切換。全部點亮！' },
        sym: { kind: 'dial', know: 'sawGears', t: '工具箱的符號鎖', chars: '★●▲■◆', n: 3, ans: '▲●★', start: '★★★',
          d: ['set:boxOpen', 'get:gear', 'get:handle'], s: '工具箱打開了！裡面有一個生鏽的齒輪，和一個閥門把手。',
          help: '鎖上刻著「由大到小」。上下換符號，按 A 試開。' },
        pipe: { kind: 'pipes', t: '管線盤', theme: 'water', w: 6, h: 3, inRow: 1, outRow: 1,
          // 型別 I = 直管（0 橫 1 直）、L = 彎管（0 上右 1 右下 2 下左 3 左上）；rot = 開局方向；sol = 一組正解（測試用）
          cells: ['L2', 'L3', 'I1', 'L0', 'I0', 'L1',
                  'I1', 'L1', 'I0', 'I0', 'L0', 'L2',
                  'I1', 'L0', 'L3', 'L2', 'I1', 'L0'],
          sol: [null, 1, 0, 2, null, null,
                0, 3, null, 1, null, 1,
                null, null, null, 0, 0, 3],
          d: ['set:water'], s: '水一路流到水車，水車轉起來了。藍燈亮了！',
          help: '選水管按 A 旋轉，把左邊的水接到右邊的水車。' }
      },
      steps: [
        { done: 'got_driver', h: ['先找找能用的工具。', '南邊架子的上層。', '調查南邊架子的上層，拿螺絲起子。'], cheat: ['get:driver'] },
        { done: 'panelOpen', h: ['螺絲起子能轉開什麼？', '西邊的配電盤用螺絲鎖著。', '選螺絲起子，對西邊的配電盤按 A。'], cheat: ['set:panelOpen'] },
        { done: 'power', h: ['讓配電盤的九盞燈全亮。', '按一顆開關，它和上下左右會一起切換。', '按上排中間、中排左邊、正中央各一次。'], cheat: ['set:power'] },
        { done: 'boxOpen', h: ['東邊的工具箱有電了。', '密碼是三個符號，東邊牆上的齒輪刻著符號。', '由大到小：▲、●、★。'], cheat: ['set:boxOpen', 'get:gear', 'get:handle'] },
        { done: 'got_oil', h: ['生鏽的齒輪轉不動。', '告示牌說齒輪要上油。南邊架子找找看。', '調查南邊架子的下層，拿油壺。'], cheat: ['get:oil'] },
        { done: 'got_oilGear', h: ['齒輪和油……', '物品可以兩兩組合。', '在物品欄選齒輪，再按油壺。'], cheat: ['lose:gear', 'lose:oil', 'get:oilGear'] },
        { done: 'gearIn', h: ['上好油的齒輪要裝在哪裡？', '北邊鐵門旁的機關少一個齒輪。', '選上油的齒輪，對北邊的齒輪座按 A。'], cheat: ['lose:oilGear', 'set:gearIn'] },
        { done: 'valveOn', h: ['手上還有一個把手。', '南邊的閥門少了把手。', '選閥門把手，對南邊的閥門按 A。'], cheat: ['lose:handle', 'set:valveOn'] },
        { done: 'water', h: ['水流進管子了，可是接錯了。', '調查南邊的管線盤，轉動水管。', '水從左邊中間進來：右、上、右、右、下、下、右、右、上，再往右到水車。'], cheat: ['set:water'] },
        { done: 'won', h: ['三盞燈都亮了！', '回到北邊的鐵門。', '調查北邊的鐵門。'], cheat: ['win'] }
      ]
    },

    /* =============================================================== 第三室：穹頂星室（困難） */
    {
      id: 'dome', name: '穹頂星室', W: 0x02,
      pals: [[0x02, 0x12, 0x30], [0x02, 0x07, 0x17], [0x02, 0x16, 0x28], [0x02, 0x1A, 0x21]],
      limit: 25 * MIN, par: 9 * MIN, start: 'N',
      intro: '最後一間：穹頂星室。讓星光照到星門上，就能走上屋頂。',
      items: {
        cloth: { n: '拭鏡布', d: '柔軟的拭鏡布。' },
        lensDirty: { n: '霧濛濛的鏡片', d: '蒙著一層霧的鏡片。' },
        lens: { n: '清澈的鏡片', d: '擦得亮晶晶的鏡片。' },
        diskTop: { n: '星盤上半', d: '半個圓形的星盤。' },
        diskBot: { n: '星盤下半', d: '另外半個星盤。' },
        disk: { n: '星盤', d: '完整的圓形星盤，刻滿星座。' }
      },
      hot: [
        { id: 'door', v: 'N', r: [11, 1, 10, 14], n: '星門',
          rules: [{ c: 'gemOpen', d: ['win'], s: '星門緩緩打開，門外就是天文台的屋頂。' }],
          l: '一扇刻滿星星的大門，中間有四個寶石座。' },
        { id: 'gems', v: 'N', r: [12, 6, 8, 3], n: '寶石鎖',
          rules: [{ c: 'gemOpen', s: '四顆寶石閃閃發亮。' }, { c: 'lightOn', d: ['open:gem'] }],
          l: '四個寶石座暗暗的，好像需要光才會亮。' },
        { id: 'pedestal', v: 'N', r: [23, 7, 6, 8], n: '星盤座',
          rules: [{ c: 'diskOn', s: '星盤在座台上慢慢旋轉。' },
            { i: 'disk', d: ['lose:disk', 'set:diskOn'], s: '把星盤放上座台。穹頂打開一條縫，星光照了進來！' },
            { i: 'diskTop', s: '只有半個星盤，放不穩。' }, { i: 'diskBot', s: '只有半個星盤，放不穩。' }],
          l: '一座圓形的座台，上面有星盤形狀的凹槽。' },
        { id: 'dome', v: 'N', r: [2, 1, 7, 6], n: '穹頂',
          l: '圓圓的穹頂緊緊關著，只看得到一點點夜空。' },
        { id: 'scope', v: 'E', r: [2, 2, 13, 13], n: '望遠鏡',
          rules: [{ c: 'scopeFixed', d: ['set:sawStars', 'open:sky'] },
            { i: 'lens', d: ['lose:lens', 'set:scopeFixed'], s: '裝上清澈的鏡片。望遠鏡可以用了！' },
            { i: 'lensDirty', s: '鏡片霧濛濛的，裝上去也看不清楚。' }],
          l: '一台黃銅望遠鏡，可是鏡片不見了。' },
        { id: 'mirror', v: 'E', r: [17, 2, 12, 11], n: '光路盤',
          rules: [{ c: 'lightOn', s: '星光穿過光路盤，照在北邊的星門上。' },
            { c: 'diskOn', d: ['open:light'] }],
          l: '一塊裝滿導光管的面板。現在沒有光。' },
        { id: 'board', v: 'S', r: [2, 1, 11, 8], n: '黑板',
          rules: [{ d: ['set:sawBoard'], s: '黑板上寫著：▲+▲=8，▲+●=7，●×■=12，■-◆=2。' }] },
        { id: 'cabinet', v: 'S', r: [15, 3, 8, 12], n: '玻璃櫃',
          rules: [{ c: 'cabOpen', s: '玻璃櫃已經空了。' }, { d: ['open:cab'] }] },
        { id: 'rack', v: 'S', r: [25, 1, 5, 14], n: '衣帽架',
          rules: [{ c: '!got_cloth', d: ['get:cloth'], s: '衣帽架上掛著一條拭鏡布。拿走了。' }],
          l: '衣帽架上掛著朔叔的舊帽子。' },
        { id: 'orrery', v: 'W', r: [6, 1, 18, 14], n: '太陽系儀',
          rules: [{ c: 'ringDone', s: '三顆行星排成一直線。' }, { d: ['open:rings'] }] },
        { id: 'chart', v: 'W', r: [25, 2, 5, 8], n: '星座表',
          l: '星座表：「提燈座，四顆星排成弓形，掛在東方的天空。」' }
      ],
      combos: [
        { a: 'lensDirty', b: 'cloth', d: ['lose:lensDirty', 'lose:cloth', 'get:lens'], s: '用拭鏡布把鏡片擦乾淨了！' },
        { a: 'diskTop', b: 'diskBot', d: ['lose:diskTop', 'lose:diskBot', 'get:disk'], s: '兩個半片合在一起，變成完整的星盤！' }
      ],
      puz: {
        cab: { kind: 'dial', know: 'sawBoard', t: '玻璃櫃的鎖', chars: '0123456789', n: 4, ans: '4342', start: '0000',
          d: ['set:cabOpen', 'get:lensDirty', 'get:diskTop'], s: '玻璃櫃打開了！裡面有一片霧濛濛的鏡片，和半個星盤。',
          help: '鎖上畫著▲●■◆。上下改數字，按 A 試開。' },
        rings: { kind: 'rings', t: '太陽系儀', n: 3, m: 8, start: [5, 3, 4], btn: [[0, 1], [1, 2], [2, 0]],
          d: ['set:ringDone', 'get:diskBot'], s: '三顆行星對齊了！底座彈開，掉出另外半個星盤。',
          help: '左右選按鈕，A 轉動兩個圈。讓三顆行星都對準箭頭！' },
        light: { kind: 'pipes', t: '光路盤', theme: 'light', w: 6, h: 4, inRow: 0, outRow: 3,
          cells: ['I1', 'L0', 'I0', 'L1', 'I1', 'L3',
                  'L2', 'I0', 'L3', 'I1', 'L0', 'I0',
                  'I1', 'L2', 'L1', 'L0', 'I0', 'L1',
                  'L0', 'I0', 'L2', 'I0', 'L3', 'I1'],
          sol: [0, 2, null, null, null, null,
                null, 1, 1, 0, 2, null,
                null, 0, 3, null, 1, null,
                null, null, null, null, 0, 0],
          d: ['set:lightOn'], s: '星光沿著導光管一路前進，照到了星門。寶石座亮起來了！',
          help: '選導光管按 A 旋轉，把左上的星光接到右下。' },
        gem: { kind: 'dial', know: 'sawStars', t: '星門的寶石鎖', chars: '紅藍白黃綠', n: 4, ans: '藍白紅黃', start: '紅紅紅紅',
          d: ['set:gemOpen'], s: '四顆寶石同時亮了起來！星門的鎖打開了。',
          help: '照提燈座的星星排好寶石。上下換顏色，按 A 試開。' },
        sky: { kind: 'look', t: '望遠鏡', s: '鏡頭裡是「提燈座」，四顆星排成弓形，從左到右是：藍、白、紅、黃。',
          help: '看完按 B 離開望遠鏡。' }
      },
      steps: [
        { done: 'got_cloth', h: ['先在房間裡找找有用的東西。', '南邊的衣帽架上掛著東西。', '調查南邊的衣帽架，拿拭鏡布。'], cheat: ['get:cloth'] },
        { done: 'cabOpen', h: ['南邊的玻璃櫃鎖著，鎖上畫著四個符號。', '南邊黑板上的算式就是答案。', '▲是4、●是3、■是4、◆是2，密碼 4342。'], cheat: ['set:cabOpen', 'get:lensDirty', 'get:diskTop'] },
        { done: 'got_lens', h: ['鏡片霧濛濛的。', '用布擦一擦？', '在物品欄選鏡片，再按拭鏡布。'], cheat: ['lose:lensDirty', 'lose:cloth', 'get:lens'] },
        { done: 'scopeFixed', h: ['清澈的鏡片要裝在哪裡？', '東邊的望遠鏡少了鏡片。', '選清澈的鏡片，對東邊的望遠鏡按 A。'], cheat: ['lose:lens', 'set:scopeFixed'] },
        { done: 'sawStars', h: ['望遠鏡修好了。', '看看望遠鏡裡有什麼。', '調查東邊的望遠鏡，記下星星的顏色。'], cheat: ['set:sawStars'] },
        { done: 'ringDone', h: ['西邊的太陽系儀。', '讓三顆行星都對準箭頭。每個按鈕會轉兩個圈。', '按甲 2 次、乙 3 次、丙 1 次。'], cheat: ['set:ringDone', 'get:diskBot'] },
        { done: 'got_disk', h: ['你有兩個半片的星盤。', '把它們合在一起。', '在物品欄選星盤上半，再按下半。'], cheat: ['lose:diskTop', 'lose:diskBot', 'get:disk'] },
        { done: 'diskOn', h: ['完整的星盤要放在哪裡？', '北邊有一座圓形的座台。', '選星盤，對北邊的星盤座按 A。'], cheat: ['lose:disk', 'set:diskOn'] },
        { done: 'lightOn', h: ['星光照進來了。', '東邊的光路盤可以用了。', '星光從左上進來：右、下、下、右、上、右、右、下、下，再往右到出口。'], cheat: ['set:lightOn'] },
        { done: 'gemOpen', h: ['寶石鎖要排出正確的顏色。', '想想望遠鏡裡的提燈座。', '從左到右：藍、白、紅、黃。'], cheat: ['set:gemOpen'] },
        { done: 'won', h: ['星門的鎖開了！', '回到北邊的星門。', '調查北邊的星門。'], cheat: ['win'] }
      ]
    }
  ];
})();
