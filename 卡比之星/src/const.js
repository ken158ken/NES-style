// 卡比之星（同人版）— 常數與共用調色盤
window.KB = window.KB || {};
(function () {
  KB.W = 256; KB.H = 224; KB.TILE = 16;
  KB.VIEW_H = 192;            // 遊戲畫面高度（HUD 在 192~224）
  KB.HUD_Y = 192;

  // 手感參數（px/frame，60fps）
  KB.PHYS = {
    walk: 1.3, run: 2.2, fullWalk: 1.0,
    jump: -4.4, jumpCut: -1.5, fullJump: -3.6,
    grav: 0.24, maxFall: 4.2,
    floatUp: -1.6, floatGrav: 0.06, floatMaxFall: 0.8,
    slide: 3.0, slideFrames: 22,
    swimGrav: 0.08, swimUp: -2.2, swimMaxFall: 1.2, swimSpeed: 1.0,
    climb: 1.0,
    accel: 0.18, friction: 0.22, airAccel: 0.12,
    knockback: 2.0, hurtFrames: 24, invulnFrames: 90,
    // ---- 手感輔助（不影響上方速度 / 重力數值）----
    coyote: 5,            // 離地後仍可起跳的幀數
    jumpBuffer: 6,        // 落地前按跳的暫存幀數
    landFrames: 8,        // 落地擠壓 / 揚塵的持續幀數
    landSquash: 0.32,     // 落地擠壓最大比例
    exhaleLock: 8,        // 吐氣後不可再漂浮的幀數
    slideCancelKeep: 0.7, // 滑鏟跳取消保留的水平速度比例
    slideBounce: 0.8,     // 滑鏟撞牆回彈速度（px/frame）
    slideBounceFrames: 3, // 回彈幀數
    dropFrames: 7,        // 單向平台下穿的穿透幀數
    dropVy: 1.0,          // 下穿初速
    hurtFreeze: 3,        // 受傷 hit-stop
    hurtShake: 4,         // 受傷震動
    inhaleFreeze: 2,      // 吸到東西 hit-stop
    // ---- Round 2（player2）：游泳 / 騎星 / 梯子 / Extra ----
    splashParts: 6,       // 入水水花粒子數（出水為一半）
    bubbleEvery: 20,      // 水中每 n 幀從嘴邊冒 1 顆氣泡
    waterInhaleRange: 26, // 水中吸力範圍（陸上 52 的一半）
    waterKnock: 0.5,      // 水中受傷擊退倍率
    rideSpeed: 4,         // 傳送星飛行速度（px/frame）
    rideTurn: 0.25,       // 轉角方向平滑係數（lerp）
    rideTrailEvery: 2,    // 拖尾粒子間隔幀
    climbTopFrames: 6,    // 爬梯上下端的過渡幀數（kirby_climb_top）
    ladderAtkCd: 14,      // 梯子上吐氣彈的冷卻幀數
    abilityStarLife: 600, // 能力星存在幀數（Extra 模式 ×0.5）→ items.js 使用
    extraMaxHp: 3,        // Extra 模式最大 HP
    // ---- Round 9（player-input）：按住 ↑ ＝ 持續飛行 ----
    flyHoldGround: 4,     // 地面按住 ↑ 連續幾幀後起飛（門 / 梯優先，避免走過門口誤飛）
    flyFlapEvery: 9,      // 漂浮中按住 ↑ 每 n 幀自動拍動一次（等同按一次跳）
    flyFlapSfxEvery: 2,   // 自動拍動的音效節流：每 n 次拍動才播一次 float 音
    // ---- fix9（R9-P1-02 / P2-04）：飛行高度上限與水中 ↑ 上浮 ----
    flyCeilY: 8,          // 房間頂：卡比 top 不得高於此 y（沒有天花板的房間也飛不出畫面）
    flyCeilVy: 0.2,       // 碰到房間頂時的下壓速度（與撞天花板一致）
    swimUpEvery: 12,      // 水中按住 ↑ 每 n 幀輕划一次
    swimUpHoldMul: 0.7,   // 水中按住 ↑ 的上浮初速 = swimUp × 此倍率
    meleeScale: 2,        // Round 10：貼身招判定框放大倍率（entity.js Hitbox 依規則自動套用；遠程投射物不受影響）
  };
  // 鏡頭手感（game.js updateCamera）
  KB.CAM = {
    lookIdle: 12,       // 靜止時的前瞻量（px）
    lookRun: 40,        // 全速跑時的前瞻量（px）
    lookLerp: 0.05,     // 前瞻量平滑係數（避免轉向時跳動）
    follow: 0.12,       // 鏡頭跟隨係數
    deadTop: 0.40,      // 垂直死區上緣（畫面高度比例）
    deadBottom: 0.70,   // 垂直死區下緣
    restY: 0.62,        // 重置 / 切房時玩家所在的畫面高度比例
    bossMargin: 28,     // 魔王房：玩家距畫面邊緣至少保留的 px
  };

  KB.GRAV = KB.PHYS.grav;
  KB.MAXFALL = KB.PHYS.maxFall;
  KB.MAX_HP = 6;
  KB.START_LIVES = 3;

  KB.DEBUG = /[?&]debug=1/.test(location.search);
  KB.MUTE = /[?&]mute=1/.test(location.search);

  // 共用調色盤 —— 字元 → 顏色。 '.' 與 ' ' 一律透明。
  KB.PAL = {};
  // 卡比：p 主體粉、P 陰影粉、l 亮粉(高光)、r 腳紅、R 腳暗紅、k 輪廓/眼睛深藍、w 白、c 腮紅、m 嘴內、b 眼睛藍高光
  KB.PAL.kirby = {
    p: '#ffb0d0', P: '#e07aa8', l: '#ffd8e8', r: '#e8305c', R: '#a81c48',
    k: '#202848', w: '#ffffff', c: '#f27090', m: '#a02040', b: '#5060c0', o: '#ffffff',
    g: '#a0a0a8', G: '#606068', d: '#404048',           // 石頭形態
    y: '#ffe040', Y: '#e09020', e: '#f8f8f8',            // 星星/其他
  };
  // 敵人通用：o 橘、O 暗橘、t 茶色、T 深茶、y 黃、Y 暗黃、k 輪廓、w 白、r 紅、R 暗紅、b 藍、B 暗藍、g 綠、G 暗綠、s 灰、S 深灰、c 青、p 粉
  KB.PAL.enemy = {
    o: '#f89040', O: '#c05818', t: '#d08048', T: '#8a5020', y: '#f8e040', Y: '#d0a000',
    k: '#202020', w: '#ffffff', r: '#e83030', R: '#a01818', b: '#4878f8', B: '#2040a8',
    g: '#48c048', G: '#207820', s: '#a8a8b0', S: '#585860', c: '#60d8f8', C: '#2090c0',
    p: '#f8a0c8', P: '#d06090', l: '#ffd070', L: '#f0f0f0', m: '#8040c0', M: '#502080',
    e: '#f8f8f8', f: '#ff6020', F: '#ffe060', i: '#b0f0ff', I: '#60a8e0',
  };
  // 世界磁磚：green
  KB.PAL.green = {
    g: '#58d048', G: '#289028', l: '#98f070', d: '#c88850', D: '#905828', k: '#503018',
    b: '#e8d090', B: '#c0a060', w: '#f8f8f8', s: '#a8a8b0', S: '#606068', y: '#f8e040',
    r: '#e83030', p: '#f8a0c8', o: '#f89040', c: '#78d8f8', C: '#2090d0', x: '#303030',
  };
  KB.PAL.castle = {
    s: '#b0b0c0', S: '#707088', d: '#484860', D: '#303048', k: '#181828', w: '#f0f0f8',
    r: '#c03030', R: '#801818', y: '#f8e040', b: '#4060c0', B: '#203080', g: '#60a060', o: '#f89040', x: '#303030',
  };
  KB.PAL.island = {
    s: '#f8e8a0', S: '#d8b868', d: '#b08040', D: '#805020', g: '#58d048', G: '#289028',
    c: '#78d8f8', C: '#2090d0', b: '#4060e0', B: '#2038a0', w: '#f8f8f8', k: '#203040', r: '#e83030', y: '#f8e040', x: '#303030',
  };
  KB.PAL.cloud = {
    w: '#f8f8ff', W: '#c8d0f0', c: '#a0b8f8', C: '#6888d8', b: '#4060c0', B: '#2038a0',
    y: '#f8e040', p: '#f8b0d8', P: '#d080b0', k: '#303050', o: '#f8a060', x: '#303030',
  };
  KB.PAL.dedede = {
    r: '#d04040', R: '#902020', y: '#f8d040', Y: '#c09010', s: '#9090a0', S: '#585868',
    d: '#404050', D: '#282838', k: '#101018', w: '#f0f0f8', b: '#4060c0', B: '#203080', p: '#f0a0e0', x: '#303030',
  };
  // space 星之彼端（W6）：紫藍色金屬 + 星光邊
  // m 金屬中間色、M 金屬暗、d 最深、l 金屬亮、L 高光、k 輪廓、c 星光青、C 青暗、
  // v 星雲紫、V 紫暗、y 星芒黃、o 橘、w 白、e 米白、p 粉紫、s/S 灰
  KB.PAL.space = {
    m: '#4c4e92', M: '#32346c', d: '#1e2048', l: '#7e82d0', L: '#b4b8f4', k: '#12122c',
    c: '#66e4ff', C: '#1e8ec0', v: '#a862f0', V: '#5e2aa0', y: '#ffe878', o: '#f0a020',
    w: '#ffffff', e: '#e4e4ff', p: '#f090d8', P: '#c060a0', s: '#8890b8', S: '#565c88', x: '#303030',
  };

  // dream 夢幻迴廊（W7）：粉紫 / 金 / 深藍的夢境色系（雲朵石 + 星屑邊）
  // m 雲石中間色、M 雲石暗、d 最深（深藍夜）、l 雲石亮、L 高光、k 輪廓、
  // p 夢粉、P 粉暗、v 夢紫、V 紫暗、y 星屑金、Y 金暗、c 夢青光、C 青暗、
  // b 深藍、B 更深藍、w 白、e 米白、s/S 灰紫
  KB.PAL.dream = {
    m: '#9c7ad0', M: '#6a4aa0', d: '#2a1c5c', l: '#c4a4ec', L: '#eedcff', k: '#150c34',
    p: '#ff9ede', P: '#c8619e', v: '#b672f0', V: '#5a2c9c', y: '#ffd85c', Y: '#c08a1e',
    c: '#7ce4ff', C: '#2a86c0', b: '#2c3a8c', B: '#161d54', w: '#ffffff', e: '#f4e8ff',
    s: '#9a9ad0', S: '#5a5a92', x: '#303030',
  };

  // UI
  KB.PAL.ui = {
    w: '#ffffff', k: '#202020', r: '#e83030', R: '#a01818', y: '#f8e040', Y: '#d0a000',
    b: '#4878f8', B: '#2040a8', p: '#ffb0d0', P: '#e07aa8', g: '#48c048', G: '#207820',
    s: '#a8a8b0', S: '#585860', o: '#f89040', c: '#60d8f8', d: '#404048', e: '#f0f0f0', m: '#a02040',
  };

  // 能力鍵與顯示名稱（HUD / 圖示）
  KB.ABILITY_KEYS = ['fire', 'sword', 'beam', 'cutter', 'spark', 'stone', 'ice', 'hammer'];
  KB.ABILITY_NAMES = { fire: '火焰', sword: '劍', beam: '光束', cutter: '刀刃', spark: '電擊', stone: '石頭', ice: '冰凍', hammer: '鐵鎚' };
  KB.ABILITY_HUD = { fire: 'FIRE', sword: 'SWORD', beam: 'BEAM', cutter: 'CUTTER', spark: 'SPARK', stone: 'STONE', ice: 'ICE', hammer: 'HAMMER' };

  KB.THEMES = ['green', 'castle', 'island', 'cloud', 'dedede', 'space', 'dream'];
  KB.THEME_NAMES = { green: '翠綠草原', castle: '幽靜古堡', island: '漂浮群島', cloud: '泡泡雲海', dedede: '迪迪迪城', space: '星之彼端', dream: '夢幻迴廊' };
})();
