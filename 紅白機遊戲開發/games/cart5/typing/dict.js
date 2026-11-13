/*
 * games/cart5/typing/dict.js — 卡帶五英文字遊戲共用字表（`CT.Typing.DICT`；typing 與 words 兩款共用）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-2 cart5-type（R9）｜ 依賴：無（純資料）
 * 全部由本卡原創挑選的**常用英文單字**（小學到國中程度、全年齡、無負面字），不取自舊作清單。
 *
 *   T1..T5   依長度 / 難度分 5 級：3 字母 / 4 字母 / 5 字母 / 6 字母 / 7~8 字母（共 ≥ 300 字，test_typing 驗）
 *   PROBE    星塵探測（5 字母猜字）的答案池 = T3（另有 GUESS_OK = T3 ∪ EXTRA5 做「字典裡有」的標示）
 *   THEMES   找字盤主題：每個主題 ≥ 12 字、3~9 字母
 *   SENTENCES 句子計時：3 級 × 8 句（原創；只用英文字母、空白、逗點、句點、撇號）
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var TY = CT.Typing = CT.Typing || {};

  function W(s) { return s.trim().split(/\s+/); }

  var T1 = W('cat dog sun sky red big run sit top hat cup map pen box egg fox owl bee ant bus car toy key ice sea ' +
    'arm leg ear eye lip fan jam net pot rug van web zoo bag bed bat cow pig hen nut pie tea ink oak art fun joy ' +
    'hop mix dig fly try win yes now old new hot wet dry far few day way say ask own cub jet log');
  var T2 = W('star moon rock ship blue gold fast slow jump swim sing read play rain snow wind tree leaf fish bird ' +
    'frog duck lion bear wolf deer milk cake rice soup corn bean salt home door wall roof desk lamp book ball game ' +
    'team goal kite boat road city town park farm hill lake sand wave song drum bell gift card ring coin hand foot ' +
    'face nose hair king time year week hour kind warm cold soft dark easy help open walk talk cook draw grow fall ' +
    'rise glow beam nest seed rose pond');
  var T3 = W('apple grape lemon melon peach bread pizza candy sugar honey water juice plant grass river ocean beach ' +
    'cloud storm light night dream smile happy brave quick sleep dance music piano tiger horse zebra mouse sheep ' +
    'snake whale shark eagle robin chair table clock phone house tower train plane truck wheel space comet orbit ' +
    'earth stone metal glass paper chalk paint brush color green white black brown round sweet fresh clean world ' +
    'heart field south north spark flame shine magic laugh share teach learn write count catch throw climb build ' +
    'carry watch voice story heavy small large early sunny windy fruit salad spoon plate party smart lucky ' +
    'ready great sound radio robot queen crown jewel pearl ruler scale shell shore coast trail cabin ' +
    'bench fence globe lunch tooth thumb skate float drink');
  var T4 = W('planet rocket galaxy bridge forest garden school friend family summer winter spring autumn yellow ' +
    'orange purple silver bottle window letter number circle square animal monkey rabbit turtle parrot donkey ' +
    'kitten cookie butter cheese potato tomato carrot banana cherry island valley desert jungle castle palace ' +
    'dragon wizard knight secret travel listen wonder simple bright gentle strong little middle market button ' +
    'pillow mirror candle basket pencil flower puzzle stream breeze shadow sunset meteor');
  var T5 = W('rainbow sunrise thunder weather blanket kitchen bedroom picture balloon diamond penguin dolphin ' +
    'giraffe chicken pumpkin popcorn sandwich treasure mountain elephant dinosaur keyboard computer notebook ' +
    'birthday festival homework football baseball triangle umbrella airplane universe asteroid crystal journey ' +
    'morning evening captain library teacher student country holiday village kingdom lantern compass harvest ' +
    'starfish seashore snowball firework');

  // 星塵探測可接受的猜字（標示用；不在字表的猜字照樣接受——友善版，只是不顯示 BOOK 標記）
  var EXTRA5 = W('about above after again agree alarm alive allow alone along amaze angle apron arrow aside award ' +
    'badge basic begin being below berry bloom board bonus bound brain brick brief bring broad built cable ' +
    'candy cargo chain chalk chase cheer chess chest chief child chill civic claim class clear click cliff ' +
    'close coach coral couch cover craft crane cream crisp cross crowd cubic curve daily dairy daisy delta ' +
    'diary dolls doors dozen draft drawn drift eager equal event every exact extra fairy feast fiber final ' +
    'flash fleet floor flour focus force forty frame front frost giant given glide glove grace grain grand ' +
    'graph guard guess guide habit hatch hello hobby honor hotel human ideal image index inner input jelly ' +
    'joint judge knife label lemon level limit liner lodge logic loose lower loyal magic maple march match ' +
    'medal mercy merry minor model money month motor mount music noble noise novel nurse oasis offer olive ' +
    'onion order other otter owner panel patch pause petal photo piece pilot pitch place plain plaza point ' +
    'polar porch power press price pride prize proof proud pupil quiet quilt quote raise ranch range rapid ' +
    'reach relax reply rider ridge right river roast rough route royal rural saint sauce scarf scene scout ' +
    'serve seven shape sharp sheet shelf shift shirt short sight since skill slide slope smell snack solid solve speed spell spend spice spine split sport squad stack staff stage ' +
    'stair stamp stand start state steam steel stick still store stove straw study style sugar suite super ' +
    'swift swing taste thank thick thing think third three tidal tiger tight timer title toast today topic ' +
    'total touch towel track trade treat trend trick tulip twins uncle under unity until upper usual valid ' +
    'value video visit vital vivid waltz waste wheat while whole woman words worry yacht young youth');

  var THEMES = [
    { name: 'SPACE', words: W('star moon comet orbit planet rocket galaxy meteor asteroid universe sun sky space earth') },
    { name: 'ANIMALS', words: W('cat dog fox owl bear wolf deer lion tiger zebra horse sheep whale shark eagle rabbit turtle parrot monkey penguin dolphin giraffe') },
    { name: 'FOOD', words: W('apple grape lemon melon peach bread pizza honey cookie butter cheese potato tomato carrot banana cherry rice soup corn bean cake') },
    { name: 'NATURE', words: W('tree leaf rose seed pond lake hill river ocean beach cloud storm grass forest valley desert jungle island flower stream') },
    { name: 'HOME', words: W('door wall roof desk lamp chair table clock phone bed rug pillow mirror candle basket window kitchen bedroom blanket') },
    { name: 'WEATHER', words: W('rain snow wind cloud storm sunny windy thunder rainbow sunrise breeze frost warm cold hot wet dry') },
    { name: 'SCHOOL', words: W('book desk pen ink paper chalk ruler pencil letter number teacher student library homework notebook class learn read write count') },
    { name: 'PLAY', words: W('ball game team goal kite drum song dance music piano puzzle balloon football baseball party skate swing toy fun joy') }
  ];

  // 句子（原創）：3 級。只用 a-z A-Z、空白、逗點、句點、撇號；每句 ≤ 84 字（3 行 × 28 欄內排得下）
  var SENTENCES = [
    [   // 1 級：短句
      'The sun is up.',
      'A cat can nap.',
      'We like to sing.',
      'The sky is blue.',
      'Fish swim in the sea.',
      'My kite can fly.',
      'Stars glow at night.',
      'I have a red cup.'
    ],
    [   // 2 級：中句
      'The little robot reads a book by the lamp.',
      'A bright comet flies over the quiet town.',
      'We plant seeds in the garden every spring.',
      'The brave turtle swims across the blue lake.',
      'Please bring a warm blanket for the trip.',
      'Our team kicks the ball into the goal.',
      'The wind sings softly through the tall trees.',
      'A happy rabbit hops over the green hill.'
    ],
    [   // 3 級：長句（含逗點與撇號）
      'On a clear night, the captain points the rocket toward a distant planet.',
      'When the rain stops, a giant rainbow appears over the sleepy village.',
      'The young wizard opens an old map, and a tiny dragon peeks out.',
      'If you listen closely, the ocean tells a story with every wave.',
      'The library is quiet, but every book is full of loud adventures.',
      'My friend and I build a snowball fort before the storm arrives.',
      'The penguin slides down the icy hill, laughing all the way home.',
      'Stardust falls like snow, and the whole kingdom starts to shine.'
    ]
  ];

  function uniq(a) { var s = {}, o = []; a.forEach(function (w) { w = w.toLowerCase(); if (w && !s[w]) { s[w] = 1; o.push(w); } }); return o; }
  T1 = uniq(T1); T2 = uniq(T2); T3 = uniq(T3); T4 = uniq(T4); T5 = uniq(T5);
  var ALL = uniq([].concat(T1, T2, T3, T4, T5));
  var GUESS = {};
  T3.concat(EXTRA5).forEach(function (w) { if (w.length === 5) GUESS[w.toLowerCase()] = 1; });

  TY.DICT = {
    T: [T1, T2, T3, T4, T5],
    ALL: ALL,
    PROBE: T3,
    GUESS: GUESS,
    THEMES: THEMES,
    SENTENCES: SENTENCES,
    // 依「字長集合」取字池（打字遊戲各級用）
    pool: function (lens) {
      var out = [];
      ALL.forEach(function (w) { if (lens.indexOf(w.length) >= 0) out.push(w); });
      return out;
    }
  };
})();
