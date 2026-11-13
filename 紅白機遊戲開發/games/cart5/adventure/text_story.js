/*
 * games/cart5/adventure/text_story.js — 《星塵冒險　消失的星燈》劇本（全部原創、繁體中文、全年齡）
 * ---------------------------------------------------------------------------
 * 擁有者：C9-3 cart5-adventure（R9）｜ 只有資料與小段劇情判斷，由 adventure/main.js 的劇本直譯器執行。
 * 字形：本檔所有字串常值由 tools/cjk_glyphs.py 掃描收字（改文字後要重跑）。
 *
 * 劇本步驟（steps 陣列，直譯器依序執行）：
 *   '文字'                    旁白（\f = 強制換頁）
 *   ['名字', '文字']          有名牌的台詞
 *   {give:'id'}               得到物品（自動顯示「得到了『名』！」+ 音效）
 *   {take:'id'}               物品交出去（不顯示）
 *   {set:'旗標'} / {clr:'旗標'}
 *   {ask:'問句', name, opts:['≤3字', …], then:[[…], […]]}   選擇（問句一行 ≤ 13 字；選項放在右側選單）
 *   {pic:1}                   重畫場景（場景圖依旗標換版本）
 *   {bgm:'曲名'} / {sfx:'音效'}
 *   {go:'場景'}               移動（會播新場景的第一次描述）
 *   {end:'結局 id'}           進入結局
 *   {fn:function(g){…}}       任意（回傳 steps 會插在後面）
 * 場景：{name 位置名 ≤ 5 字, label 移動選單名 ≤ 3 字, pic, bgm, enter(g) 第一次進入, look(g) 調查四周,
 *        objs:[{n ≤ 3 字, if(g), look, take}], people:[{n, id, if(g), talk}], exits:[{to, need(g) → 擋住的話}], use(g, 物品)}
 * 選單文字一律 ≤ 3 個全形字（右側選單寬 11 格）。
 */
(function () {
  'use strict';
  var CT = window.CT = window.CT || {};
  var A = CT.Adv = CT.Adv || {};

  var ME = '小羽', XIA = '霞婆婆', OU = '鷗姐', GEAR = '齒輪爺爺', LILA = '莉拉', KID = '拾光', CAT = '麻糬', WHO = '？？？';
  function give(id) { return { give: id }; }
  function take(id) { return { take: id }; }
  function set(f) { return { set: f }; }
  function sfx(n) { return { sfx: n }; }
  function bgm(n) { return { bgm: n }; }
  function ask(q, opts, then, name) { return { ask: q, opts: opts, then: then, name: name || null }; }

  A.NAMES = { ME: ME, XIA: XIA, OU: OU, GEAR: GEAR, LILA: LILA, KID: KID, CAT: CAT, WHO: WHO };

  /* ============================== 物品 ============================== */
  A.ITEMS = {
    lamp: { name: '提燈', desc: function (g) {
      return g.f.lit ? '爺爺留下的舊提燈。現在裡面裝滿了星屑，發出淡淡的藍光。'
        : '爺爺留給你的舊提燈。燈芯早就燒完了，現在只是個空殼子。'; },
      nouse: function (g) { return g.f.lit ? '提燈的藍光輕輕搖晃。這裡用不到它。' : '提燈裡沒有東西可以點亮。'; } },
    letter: { name: '信', desc: '局長交給你的急件。收件人寫著：「星燈塔　霞婆婆」。信封上蓋著遠方港口的郵戳。',
      nouse: '這封信要親手交給燈塔的霞婆婆。' },
    gear: { name: '小齒輪', desc: '銅製的小齒輪，邊緣刻著細細的星形花紋。像是某種精巧機關的零件。',
      nouse: '這裡沒有裝得上小齒輪的地方。' },
    key: { name: '鑰匙', desc: '霞婆婆給你的燈塔鑰匙。又大又重，上面掛著一顆小小的貝殼。',
      nouse: '這裡沒有鑰匙孔。' },
    music: { name: '音樂盒', desc: '蓋子上畫著燈塔和一顆小星星的木製音樂盒。打開蓋子，會彈出〈星之歌〉。',
      nouse: '你打開音樂盒，溫柔的旋律響了一會兒。……現在好像不是時候。' },
    map: { name: '星圖', desc: '莉拉給的古老星圖。上面畫著星星們回家的路——「星橋」。燈塔的光和星圖一起指向天空時，星橋就會出現。',
      nouse: '你攤開星圖。上面的星星靜靜的，沒有反應。' },
    core: { name: '星核', desc: '燈塔星燈的心臟。拳頭大的金色寶石，摸起來暖呼呼的。',
      nouse: '星核要放回燈室的燈座才行。' },
    marble: { name: '玻璃珠', desc: '鷗姐給的玻璃珠。在黑暗裡會發出一點點白光……可是摸起來冷冰冰的。',
      nouse: '玻璃珠在掌心裡滾來滾去。' }
  };

  /* ============================== 開場 ============================== */
  A.PROLOGUE = [
    bgm('adv_night'),
    '這裡是漂浮在雲海上的小島——星港鎮。\f' +
    '每到夜晚，港口的燈塔就會點亮「星燈」，替在雲海上航行的星塵船指路。\f' +
    '今晚是一年一度的「星祭」。午夜十二點，遠航的船隊會循著燈光回家。\f' +
    '……可是，就在今天傍晚，星燈突然熄滅了。',
    '你是星港郵局的見習郵差——小羽。\f' +
    '局長傍晚塞給你一封要送去燈塔的急件，你卻在閣樓裡打了個盹……\f' +
    '醒來的時候，窗外已經是一片漆黑的夜。',
    '（操作說明）右邊是指令選單。十字鍵選擇，A 決定，B 取消。\f' +
    '「調查」看看四周或東西；「移動」前往別的地方；「使用」拿出身上的物品；「物品」查看帶在身上的東西。\f' +
    '不知道下一步要做什麼的時候，打開「系統」裡的「提示」就可以了。',
    bgm('adv_town')
  ];

  /* ============================== 跟在身邊的拾光（各場景的閒聊） ============================== */
  A.KID_CHAT = {
    room: [[KID, '這是小羽的家嗎？小小的，好溫暖。'], [KID, '床看起來好軟……不行不行，現在不能睡！']],
    plaza: [[KID, '好多彩色的旗子！「星祭」是什麼呀？'], [ME, '是大家一起等船隊回家的日子。'], [KID, '回家……我也好想回家。']],
    dock: [[KID, '雲海……我就是從那上面掉下來的。'], [KID, '從上面看，白白的、軟軟的，好像棉花糖喔。']],
    tower: [[KID, '這就是那個好亮好溫暖的地方。'], [KID, '昨天我躲在塔頂，聽見有個婆婆一直在擦玻璃，還一邊哼歌。']],
    top: [[KID, '把暖暖的石頭放回去吧。'], [KID, '我現在不冷了。因為小羽的手，也暖暖的。']],
    clock: [[KID, '滴答、滴答……好像好多顆心臟在跳。'], [GEAR, '哦？這孩子身上有星光的味道。老頭子活了七十年，第一次見到呢。']],
    obs: [[LILA, '你就是那顆小星星啊。別怕，我們會幫你回家的。'], [KID, '這個大大的筒子，可以看到我家嗎？']],
    woods: [[KID, '昨天我就是沿著這條路，一路跑進森林裡的。'], [KID, '好黑……小羽，不要放開提燈喔。']],
    deep: [[KID, '這裡是我昨天躲起來的地方。'], [KID, '星石是很久很久以前掉下來的大哥哥。它說，它已經回不去了。'], [KID, '所以……我一定要回去，連它的份一起。']],
    bridge: [[KID, '找到了……就是那裡！']]
  };

  /* ============================== 場景 ============================== */
  A.SCENES = {
    /* ---------- 1 閣樓小屋 ---------- */
    room: {
      name: '閣樓小屋', label: '小屋', pic: 'room', bgm: 'adv_town',
      enter: function (g) { return []; },
      look: function (g) {
        var s = '斜斜的屋頂下，是你住的小閣樓。圓窗外，可以看到港口的燈塔。';
        if (!g.has('lamp') && !g.f.lampTaken) s += '\f書桌上放著一盞舊提燈。';
        if (!g.f.letterTaken) s += (g.f.lampTaken ? '\f' : '旁邊') + '還有你的郵差包，裡面裝著今天的急件。';
        return [s];
      },
      objs: [
        { n: '窗戶', look: function (g) {
          return g.f.relit ? ['從圓窗望出去，塔頂的星燈正閃閃發亮。光束一圈一圈掃過雲海。']
            : ['從圓窗望出去，能看見港口那座高高的燈塔。\f平常這個時間，塔頂應該亮著溫暖的星光……現在卻一片漆黑。'];
        } },
        { n: '床', look: function (g) {
          if (g.f.relit) return ['軟綿綿的被子。今晚的冒險結束以後，一定能睡個好覺。'];
          return ['軟綿綿的被子還留著體溫。窗外好黑，好安靜……眼皮又開始變重了。',
            ask('要再睡一下嗎？', ['再睡', '起床'], [
              [{ end: 'sleep' }],
              ['「不行不行，還有工作！」\f你用力拍了拍臉頰，清醒了過來。']
            ])];
        }, take: ['被子不能帶出門。'] },
        { n: '書桌', look: function (g) {
          var s = '木頭書桌上刻著你小時候畫的星星。';
          if (!g.f.lampTaken || !g.f.letterTaken) s += '\f桌上還放著東西。拿取看看吧。';
          return [s];
        } },
        { n: '提燈', if: function (g) { return !g.f.lampTaken; },
          look: ['爺爺留給你的舊提燈。燈芯早就燒完了。\f爺爺以前常說：「提燈裝的不一定是火，也可以是光。」'],
          take: ['你把提燈掛在腰上。', set('lampTaken'), give('lamp')] },
        { n: '郵差包', if: function (g) { return !g.f.letterTaken; },
          look: ['郵局發的帆布包。裡面有一封急件，收件人是「星燈塔　霞婆婆」。'],
          take: ['你背起郵差包，確認急件還在裡面。', set('letterTaken'), give('letter')] }
      ],
      exits: [{ to: 'plaza' }],
      use: function (g, it) {
        if (it === 'lamp' && !g.f.lit) return ['你搖了搖提燈。家裡的燈油早就用完了。'];
        return null;
      }
    },

    /* ---------- 2 星港廣場 ---------- */
    plaza: {
      name: '星港廣場', label: '廣場', pic: 'plaza', bgm: 'adv_town',
      enter: function (g) {
        if (g.f.relit) return ['廣場上熱鬧極了。大家抬頭看著重新亮起的燈塔，拍手歡呼。'];
        return ['星港廣場掛滿了星祭的彩旗。可是攤販們全停下了手邊的工作，抬頭望著漆黑的燈塔。\f' +
          '「燈怎麼還不亮？」「船隊今晚回得來嗎？」大家議論紛紛。'];
      },
      look: function (g) {
        return ['石板廣場的中央是一座噴水池，四周圍著小小的店家。\f' +
          '往東是森林，往西是碼頭，北邊的坡道上有天文台，燈塔就在港口的盡頭。'];
      },
      objs: [
        { n: '噴水池', look: function (g) {
          if (g.f.gotGear) return ['池水清澈，映著滿天的星星。捧著星星的少女石像，好像在微笑。'];
          return ['噴水池中央，立著一尊雙手捧著星星的少女石像。\f……咦？池底有個小東西，一閃一閃的。', set('sawGlint')];
        }, take: ['噴水池太重了，搬不動。'] },
        { n: '閃光', if: function (g) { return g.f.sawGlint && !g.f.gotGear; },
          look: ['水底有個亮晶晶的東西。伸手應該拿得到。'],
          take: ['你捲起袖子，把手伸進冰涼的池水裡——\f撈起來的是一個銅製的小齒輪，邊緣刻著細細的星形花紋。',
            set('gotGear'), give('gear')] },
        { n: '布告欄', look: ['「星祭今夜舉行！午夜十二點，迎接雲海船隊歸來。」\f' +
          '海報的角落還寫著：「鐘錶店協辦——〈星之歌〉音樂盒演奏會」。'], take: ['海報貼得牢牢的。還是別撕吧。'] },
        { n: '店家', look: function (g) {
          return g.f.relit ? ['店家們又開始忙碌了。烤星星餅乾的香味飄滿了整個廣場。']
            : ['家家戶戶的窗口都點著小燈，大家都在等燈塔重新亮起。\f賣星星餅乾的大叔嘆了口氣：「沒有燈塔，客人都不出門啦。」'];
        } }
      ],
      people: [
        { n: '麻糬', id: 'cat', spr: 'cat', talk: function (g) {
          var s = [];
          if (!g.f.metCat) s.push('麻糬是住在廣場上的流浪貓。大家都會偷偷餵牠。', set('metCat'));
          s.push([CAT, '喵——']);
          if (g.f.follow) s.push('麻糬好奇地聞了聞拾光。拾光嚇得躲到你的背後。', [KID, '牠、牠不會吃星星吧？']);
          else if (!g.f.gotGear) s.push('牠盯著噴水池，尾巴甩來甩去。');
          else if (!g.f.lit) s.push('牠朝燈塔的方向「喵」了一聲。');
          else if (!g.f.calm) s.push('牠豎起耳朵，一直望向森林那邊。');
          else s.push('牠舒服地打了個呵欠。');
          return s;
        } }
      ],
      exits: [{ to: 'room' }, { to: 'dock' }, { to: 'tower' }, { to: 'clock' }, { to: 'obs' }, { to: 'woods' }],
      use: function (g, it) {
        if (it === 'music') return ['你打開音樂盒。叮叮咚咚的旋律響起，路過的小朋友跟著拍起手來。\f……可是現在得先處理燈塔的事。'];
        return null;
      }
    },

    /* ---------- 3 雲海碼頭 ---------- */
    dock: {
      name: '雲海碼頭', label: '碼頭', pic: 'dock', bgm: 'adv_town',
      enter: function (g) {
        return ['雲海碼頭。木頭棧橋的盡頭，是一片翻騰的白色雲海。\f一艘鯨魚形狀的星塵船，靜靜地停泊在雲上。'];
      },
      look: function (g) {
        return g.f.relit ? ['燈塔的光束掃過雲海。遠方，船隊的燈火排成一條長長的河，正朝港口回來。']
          : ['棧橋上堆著星祭要用的木箱。雲海黑漆漆的，遠方偶爾閃過一點船燈，像是在找路。'];
      },
      objs: [
        { n: '星塵船', look: ['船身畫著一隻微笑的鯨魚。這是鷗姐的船「雲鯨號」。\f今晚，它要負責到雲海上迎接船隊。'],
          take: ['……船不能拿啦。'] },
        { n: '雲海', look: function (g) {
          return g.f.relit ? ['被燈光照亮的雲海，像一大片發光的棉花。']
            : ['白茫茫的雲海一望無際。沒有燈塔的光，船隊很容易在雲裡迷路。'];
        }, take: ['你伸手撈了一把雲。軟軟涼涼的，一下子就從指縫溜走了。'] },
        { n: '木箱', look: ['堆得高高的木箱上印著：「星祭用煙火——請勿玩火」。'], take: ['木箱太重了。而且是鷗姐的東西。'] }
      ],
      people: [
        { n: '鷗姐', id: 'ou', spr: 'ou', talk: function (g) {
          if (g.f.relit) return [[OU, '燈亮了！哈哈，就知道你辦得到，小郵差！'], [OU, '我得出航去接船隊啦。星祭上見！']];
          if (!g.f.metOu) return [set('metOu'),
            [OU, '喲，小郵差！這麼晚還在送信啊？'],
            [OU, '燈塔一熄，我的雲鯨號也出不了港。在雲海裡沒有光，連東西南北都分不清。'],
            [OU, '對了，昨晚我在甲板上看到一件怪事。'],
            [OU, '一顆小小的星星，拖著藍色的尾巴，「咻——」地掉進了東邊的星塵森林。'],
            [OU, '那時我還以為是眼花……現在想想，說不定跟燈塔的事有關呢。']];
          if (!g.f.offered && !g.has('marble')) return [set('offered'),
            [OU, '嗯……要是星核一直找不回來，就只能找東西代替了。'],
            [OU, '我這有一顆從遠方港口帶回來的玻璃珠。晚上會發一點點光。'],
            ask('要收下玻璃珠嗎？', ['收下', '不用'], [
              [give('marble'), [OU, '拿去吧！不過說實話，我也不知道管不管用。']],
              [[OU, '也是。還是找回真正的星核比較好。']]
            ], OU)];
          if (g.f.follow) return [[OU, '哎呀，這小傢伙是……星星？！'], [KID, '晚、晚安……'], [OU, '哈哈哈！今晚真是什麼事都會發生啊。']];
          return [[OU, '掉進森林的那顆小星星……不知道現在怎麼樣了。'], [OU, '森林裡很暗，沒有燈可別亂闖喔。']];
        } }
      ],
      exits: [{ to: 'plaza' }],
      use: null
    },

    /* ---------- 4 燈塔前 ---------- */
    tower: {
      name: '燈塔前', label: '燈塔', pic: 'tower', bgm: 'adv_night',
      enter: function (g) {
        if (g.f.relit) return [];
        return ['燈塔前。紅白相間的高塔直直伸向夜空，塔頂卻一片漆黑。\f門口坐著一位披著毛披肩的老婆婆，正焦急地望著塔頂。'];
      },
      look: function (g) {
        return [g.f.relit ? '燈塔的光束一圈又一圈，溫柔地掃過整座小島。' : '高高的燈塔沉默地站在夜裡。門前的花圃開著發光的小花。'];
      },
      objs: [
        { n: '燈塔', look: ['這座燈塔已經守護星港鎮一百年了。\f塔頂的星燈，靠的是一顆叫做「星核」的寶石發光。'], take: ['燈塔……當然拿不動。'] },
        { n: '鐵門', look: function (g) {
          return g.f.open ? ['鐵門開著，螺旋樓梯一路通往塔頂的燈室。'] : ['厚重的鐵門鎖得緊緊的。旁邊有一個大大的鑰匙孔。'];
        } },
        { n: '花圃', look: ['花圃裡種著只在夜晚開花的星鈴花，花瓣微微發著光。\f霞婆婆每天都會替它們澆水。'],
          take: ['摘花會被霞婆婆罵的。'] }
      ],
      people: [
        { n: '霞婆婆', id: 'xia', spr: 'xia', talk: function (g) {
          if (!g.f.delivered) {
            if (!g.f.metXia) return [set('metXia'),
              [XIA, '唉呀，是郵局的小羽啊……'],
              [XIA, '你也看到了吧？星燈熄了。傍晚我上去擦透鏡的時候，燈座上的星核……不見了。'],
              [XIA, '我急著下樓找人，結果在樓梯上扭到了腳，現在連站都站不穩。'],
              [XIA, '今晚可是星祭啊。我那在船隊上工作的孫子，也要跟著回來的……'],
              g.has('letter') ? '（對了，你身上有一封寄給霞婆婆的急件。用「使用」交給她吧。）' : '（局長交代的急件……好像還放在閣樓裡。）'];
            return [[XIA, '星核到底跑到哪裡去了呢……'],
              g.has('letter') ? '（用「使用」把信交給霞婆婆吧。）' : '（局長交代的急件還放在閣樓裡。）'];
          }
          if (g.f.relit) return g.f.follow ? [[XIA, '燈亮了……謝謝你，小羽。'], [XIA, '這孩子身上的光，跟星核一模一樣呢。'], [KID, '婆婆，對不起，我拿走了您的暖暖石頭。'], [XIA, '傻孩子。冷的時候，本來就該到溫暖的地方來呀。']]
            : [[XIA, '燈亮了！謝謝你，小羽。阿海一定看得見這道光。']];
          if (!g.f.lit) return [[XIA, '燈室就在樓梯最上面。樓梯很陡，小心腳步喔。']];
          if (!g.has('core')) return [[XIA, '星屑往森林的方向去了？'], [XIA, '那片森林裡住著很多古老的東西……去的話，一定要帶著燈。']];
          return [[XIA, '那是……星核！快、快把它放回燈座吧！']];
        } }
      ],
      exits: [{ to: 'plaza' }, { to: 'top', need: function (g) { return g.f.open ? null : ['鐵門鎖得緊緊的，進不去。']; } }],
      use: function (g, it) {
        if (it === 'letter') return ['你把信交給霞婆婆。', take('letter'), set('delivered'), set('metXia'),
          [XIA, '這字跡……是阿海！是我孫子寄來的！'],
          '婆婆讀著信，眼角泛起了淚光。',
          [XIA, '「奶奶，今晚我會跟著燈塔的光回家。」……這孩子。'],
          [XIA, '小羽，拜託你了。這是燈塔的鑰匙。'],
          give('key'),
          [XIA, '星核不會自己長腳跑掉的。上去燈室看看，也許能找到什麼線索。']];
        if (it === 'key') {
          if (g.f.open) return ['門已經開了。'];
          return ['你把大鑰匙插進鑰匙孔，用力一轉——\f喀啦！鐵門慢慢地打開了。', sfx('adv_door'), take('key'), set('open')];
        }
        if (it === 'core' && !g.f.relit) return [[XIA, '星核要放回塔頂燈室的燈座喔。']];
        return null;
      }
    },

    /* ---------- 5 燈室 ---------- */
    top: {
      name: '燈室', label: '燈室', pic: 'top', bgm: 'adv_night',
      enter: function (g) {
        if (g.f.relit) return [];
        return ['燈室。四面都是玻璃窗，中央擺著一具比人還高的大透鏡。\f' +
          '透鏡下方的燈座空蕩蕩的。原本嵌著星核的凹槽裡，只剩下一點點閃亮的粉末。'];
      },
      look: function (g) {
        if (g.f.bridge) return ['陽台外，一座閃著微光的星橋伸向夜空。'];
        return [g.f.relit ? '大透鏡把星核的光放大好幾千倍，金色的光束劃過雲海。' : '黑漆漆的燈室裡，只有燈座上的星屑還在微微發亮。'];
      },
      objs: [
        { n: '燈座', look: function (g) {
          if (g.f.relit) return ['星核在燈座上安穩地發著光。'];
          if (g.f.lit) return ['凹槽裡的星屑都被提燈收走了。現在只差星核。'];
          return ['凹槽裡殘留著閃閃發亮的星屑。摸起來還有一點溫暖。\f好像只要有個容器，就能把這些光收集起來……'];
        }, take: function (g) { return g.f.lit ? ['燈座固定在地板上。'] : ['星屑太細了，用手抓不起來。要有東西裝才行。']; } },
        { n: '透鏡', look: ['層層疊疊的玻璃透鏡。能把星核的光放大好幾千倍，照亮整片雲海。'], take: ['透鏡比你還高，怎麼可能拿得動。'] },
        { n: '窗外', look: function (g) {
          return g.f.relit ? ['光束掃過雲海，船隊的燈一盞接一盞亮了起來。']
            : ['窗外的雲海一片漆黑。遠方隱約有幾點船燈，正在找路。'];
        } },
        { n: '地板', look: function (g) {
          if (g.f.relit) return ['地板擦得亮晶晶的。霞婆婆每天都有好好打掃。'];
          return ['地板上有一道淡淡的星屑痕跡，從燈座一路延伸到窗邊……\f窗戶開著一條縫。星屑像是往東邊——森林的方向飄去了。', set('trail')];
        } }
      ],
      exits: [{ to: 'tower' }, { to: 'bridge', need: function (g) { return g.f.bridge ? null : ['陽台外面只有漆黑的夜空。']; } }],
      use: function (g, it) {
        if (it === 'lamp') {
          if (g.f.lit) return ['提燈已經裝滿了星屑的光。'];
          return ['你打開提燈的蓋子，湊近燈座。\f凹槽裡的星屑像螢火蟲一樣飛了起來，一顆顆鑽進提燈裡。\f提燈亮起了淡淡的藍光！',
            sfx('adv_item'), set('lit'), set('trail'),
            '（有了這盞燈，再暗的地方都看得清楚了。）'];
        }
        if (it === 'core') {
          if (g.f.relit) return ['星核已經在燈座上了。'];
          var s = ['你把星核輕輕放回燈座。', take('core'), set('relit'), { pic: 1 }, bgm('adv_title'), sfx('adv_item'),
            '嗡——透鏡亮了起來！\f一道金色的光束穿過窗戶，劃開了漆黑的雲海！'];
          if (!g.f.follow) return s.concat(['遠方的船燈一盞接一盞回應著燈光。\f……成功了。', { end: 'lamp' }]);
          s.push([KID, '好亮……好溫暖。']);
          if (g.has('map')) return s.concat(A.BRIDGE_OPEN);
          return s.concat([[KID, '可是……我不知道哪一顆星星才是我的家。'], '（天文台的莉拉，也許知道星星回家的路。）']);
        }
        if (it === 'map') {
          if (!g.f.relit) return ['你攤開星圖。燈室裡太暗了，星圖上的星星沒有任何反應。'];
          if (!g.f.follow) return ['星圖上的星星亮了一下，又暗了下去。好像少了什麼。'];
          if (g.f.bridge) return ['星橋已經出現了。'];
          return A.BRIDGE_OPEN;
        }
        if (it === 'marble') {
          if (g.f.relit) return ['燈已經亮了。玻璃珠就留著當紀念吧。'];
          return ['你拿出玻璃珠，在空空的燈座前比了比。大小好像剛剛好……',
            ask('要放進燈座嗎？', ['放進去', '算了'], [
              [{ end: 'fog' }],
              ['你把玻璃珠收了回去。還是找回真正的星核吧。']
            ])];
        }
        return null;
      }
    },

    /* ---------- 6 鐘錶店 ---------- */
    clock: {
      name: '鐘錶店', label: '鐘錶店', pic: 'clock', bgm: 'adv_town',
      enter: function (g) {
        if (g.f.relit) return ['鐘錶店裡，所有的鐘又滴答滴答地走了起來。'];
        return ['鐘錶店。牆上掛滿大大小小的時鐘……\f不對。仔細一聽，店裡一點滴答聲都沒有。\f所有的時鐘，都停在同一個時間——傍晚六點十二分。'];
      },
      look: function (g) {
        return ['小小的店裡，牆上、架上、桌上，全都是時鐘。工作台後面坐著鐘錶匠齒輪爺爺。'];
      },
      objs: [
        { n: '時鐘', look: function (g) {
          return g.f.relit ? ['每一個時鐘都重新走了起來。滴答、滴答，像大合唱。']
            : ['每一個時鐘都停在六點十二分。\f……那正是燈塔熄滅的時刻。'];
        }, take: ['偷拿時鐘可不行。'] },
        { n: '工作台', look: function (g) {
          return g.f.fixed ? ['工作台上散落著螺絲和放大鏡。音樂盒已經修好，借給你了。']
            : ['工作台上散落著螺絲和放大鏡，中間擺著一個打開的木製音樂盒。'];
        } },
        { n: '音樂盒', if: function (g) { return !g.f.fixed; },
          look: ['蓋子上畫著一座燈塔和一顆小星星。\f裡面的機關缺了一個齒輪，轉不動了。'],
          take: [[GEAR, '喂喂，那是演奏會要用的，還在修呢！']] },
        { n: '貓頭鷹', look: function (g) {
          return g.f.relit ? ['木頭貓頭鷹「咕咕」地報了時。'] : ['櫥窗裡擺著一隻會報時的木頭貓頭鷹。現在牠也睡著了。'];
        } }
      ],
      people: [
        { n: '爺爺', id: 'gear', spr: 'gear', talk: function (g) {
          if (g.f.relit) return [[GEAR, '鐘又開始走了！滴答滴答，真好聽。'], [GEAR, '小羽，演奏會的時候記得把音樂盒帶回來喔。']];
          if (g.f.fixed) return [[GEAR, '音樂盒要好好保管喔。'], [GEAR, '〈星之歌〉是很久以前，燈塔的第一位燈守寫的搖籃曲。']];
          if (!g.f.metGear) return [set('metGear'),
            [GEAR, '喔喔，小羽啊。你看這些鐘，全都在同一刻停住了。'],
            [GEAR, '星燈一熄，鎮上跟著星光走的機關全都睡著啦。'],
            [GEAR, '更糟的是，今晚演奏會要用的音樂盒，偏偏少了一個小齒輪。'],
            [GEAR, '那是刻著星星花紋的銅齒輪。下午在廣場試音的時候，不知道掉到哪裡去了……'],
            [GEAR, '這個音樂盒會彈一首叫做〈星之歌〉的老歌。傳說，星星聽了會覺得安心呢。']];
          return [[GEAR, '刻著星星花紋的小齒輪……下午我在廣場的噴水池邊試音，會不會掉在那附近呢？']];
        } }
      ],
      exits: [{ to: 'plaza' }],
      use: function (g, it) {
        if (it === 'gear') return ['你把小齒輪交給齒輪爺爺。', take('gear'), set('metGear'),
          [GEAR, '就是這個！'],
          '爺爺戴上放大鏡，「喀嚓」一聲把齒輪裝了回去。',
          bgm('adv_lullaby'),
          '叮——叮咚——\f音樂盒流出一段溫柔的旋律。',
          [GEAR, '修好了！小羽，這個先借你吧。'],
          [GEAR, '星燈的事，說不定也需要一點溫柔的音樂。哈哈，這是老頭子的直覺。'],
          set('fixed'), give('music'), bgm('adv_town')];
        if (it === 'music') return [[GEAR, '音樂盒要好好保管喔。演奏會還等著它呢。']];
        return null;
      }
    },

    /* ---------- 7 天文台 ---------- */
    obs: {
      name: '天文台', label: '天文台', pic: 'obs', bgm: 'adv_night',
      enter: function (g) {
        return ['天文台。圓頂的縫隙裡露出一條星空，一架巨大的望遠鏡斜斜地指著天頂。'];
      },
      look: function (g) {
        return ['牆邊的書架塞滿了書，牆上掛著一張大大的星座盤。觀星員莉拉正在記錄著什麼。'];
      },
      objs: [
        { n: '望遠鏡', look: function (g) {
          if (g.f.relit) return ['你湊近目鏡……\f燈塔的光束，在雲海上畫出一個大大的圓。'];
          return ['你湊近目鏡……\f鏡頭正對著東邊的森林。樹梢之間，有一個藍色的小光點在顫抖。', set('sawLight')];
        }, take: ['望遠鏡固定在台座上。'] },
        { n: '書架', look: ['書架上有一本《星港傳說集》。翻開的那一頁寫著：\f' +
          '「有時候，年紀太小的星星會從天上掉下來。它們怕冷，總往溫暖明亮的地方躲。」\f' +
          '「只要為它找到回家的星路，它就能再回到夜空裡。」'] },
        { n: '星座盤', look: ['圓形的星座盤上畫著好多星座。\f其中一個星座，缺了一顆星。'] }
      ],
      people: [
        { n: '莉拉', id: 'lila', spr: 'lila', talk: function (g) {
          if (g.has('map') || g.f.gotMap) return g.f.bridge ? [[LILA, '星橋……真想親眼看一看啊。']]
            : [[LILA, '星圖說，燈塔的光和星圖一起指向天空時，星橋就會出現。'], [LILA, '先讓燈塔重新亮起來吧。']];
          if (!g.f.lit) {
            if (!g.f.metLila) return [set('metLila'),
              [LILA, '晚安，小羽。燈塔的事我聽說了。'],
              [LILA, '我在望遠鏡裡看到森林那邊有奇怪的光。可是光靠猜測，什麼都不能確定。'],
              [LILA, '如果有更確實的證據就好了……例如，星星留下來的東西。']];
            return [[LILA, '星星留下來的東西……例如「星屑」。如果找到了，請一定要讓我看看。']];
          }
          return [set('metLila'), set('gotMap'),
            '莉拉看見你手上發著藍光的提燈，眼睛一下子亮了。',
            [LILA, '這是……星屑！是真正的星屑！'],
            [LILA, '書上寫的是真的。燈塔的星核，說不定是被一個「掉下來的星星孩子」帶走了。'],
            [LILA, '它不是壞孩子。它只是冷，又迷了路。'],
            [LILA, '帶上這張星圖吧。上面畫著星星們回家的路——「星橋」。'],
            give('map'),
            [LILA, '傳說，只要燈塔的光和星圖一起指向天空，星橋就會出現。']];
        } }
      ],
      exits: [{ to: 'plaza' }],
      use: function (g, it) {
        if (it === 'lamp' && g.f.lit && !g.f.gotMap) return A.SCENES.obs.people[0].talk(g);
        return null;
      }
    },

    /* ---------- 8 森林入口 ---------- */
    woods: {
      name: '森林入口', label: '森林', pic: 'woods', bgm: 'adv_night',
      enter: function (g) {
        return ['星塵森林的入口。高大的樹木遮住了星光，前方的小路一片漆黑。'];
      },
      look: function (g) {
        return [g.f.lit ? '提燈的藍光照亮了小路。路面上，星屑一路延伸到森林深處。' : '四周黑漆漆的。只有樹根旁的蘑菇微微發著光。'];
      },
      objs: [
        { n: '小路', look: function (g) {
          return g.f.lit ? ['提燈的藍光照亮了小路。\f路面上，星屑像麵包屑一樣，一路延伸到森林深處。']
            : ['太暗了，連腳下都看不清楚。\f沒有燈的話，走進去一定會迷路。'];
        } },
        { n: '蘑菇', look: ['樹根旁長著會發光的蘑菇。可惜光太弱，只照得亮自己。'], take: ['蘑菇長得很牢。而且，讓它們留在這裡照路比較好。'] },
        { n: '路標', look: ['「往星石林地——夜間請勿進入」\f……「進入」兩個字被人劃掉，旁邊用小刀刻著「吵醒」。'] }
      ],
      exits: [{ to: 'plaza' }, { to: 'deep', need: function (g) {
        return g.f.lit ? null : ['你往森林裡走了幾步……太暗了，什麼都看不見。\f只好先退回來。（要有燈才進得去。）'];
      } }],
      use: function (g, it) {
        if (it === 'lamp') return g.f.lit ? ['你舉起提燈。藍光照亮了通往林地的小路。'] : ['提燈沒有亮。這樣什麼也照不到。'];
        return null;
      }
    },

    /* ---------- 9 星石林地 ---------- */
    deep: {
      name: '星石林地', label: '林地', pic: 'deep', bgm: 'adv_night',
      enter: function (g) {
        if (g.f.calm || g.f.grab) return [];
        return [set('metKid'), '星石林地。森林中央有一塊空地，古老的大樹下，立著一塊會發光的水晶石——星石。\f' +
          '……星石後面，有什麼東西縮成一團，正發出和星核一樣的光。'];
      },
      look: function (g) {
        if (g.f.grab) return ['空地上靜悄悄的。剛才那團光，已經不見了。'];
        if (g.f.calm) return ['星石的光和拾光的光交織在一起，整片空地亮晶晶的。'];
        return ['星石後面，那團光縮得小小的，一動也不動。'];
      },
      objs: [
        { n: '星石', look: ['星石冰冰涼涼的。傳說，這是很久以前掉下來的星星變成的。'], take: ['星石比你還大。'] },
        { n: '古樹', look: ['古樹的樹洞裡鋪著柔軟的苔蘚，像一張小小的床。'] },
        { n: '水池', look: ['小水池映著天上的星星。\f有一顆星星的旁邊，空出了一個小小的位置。'] },
        { n: '星核', if: function (g) { return !g.f.calm && !g.f.grab && !g.has('core'); },
          look: ['光團緊緊抱著一顆金色的寶石。\f是燈塔的星核！'],
          take: ['你悄悄伸出手……',
            ask('要硬把星核搶回來嗎？', ['搶回來', '算了'], [
              ['你一把抓住星核——\f光團尖叫一聲，鬆開了手，化成一道藍光，逃進了森林深處。\f' +
                '手裡的星核還暖暖的。可是心裡，卻有點悶悶的。', give('core'), set('grab'), bgm('adv_sad')],
              ['你把手縮了回來。光團還在發抖。']
            ])] }
      ],
      people: [
        { n: '光團', id: 'kid0', if: function (g) { return !g.f.calm && !g.f.grab; }, talk: function (g) {
          return ['你輕輕地喊了一聲——\f光團嚇得一抖，縮得更小了。從光裡傳來細細的聲音：',
            [WHO, '不要過來……不要把我的暖暖拿走……'],
            g.has('music') ? '（它好像很害怕。有沒有什麼能讓它安心的東西呢？）' : '（它好像很害怕。現在靠近只會嚇到它。）'];
        } },
        { n: '拾光', id: 'kid', if: function (g) { return g.f.calm && !g.f.follow && !g.f.grab; }, talk: function (g) {
          return [[WHO, '我叫拾光。我是……住在天上的星星。'],
            [KID, '昨天晚上，我在玩流星賽跑，一不小心，就掉下來了。'],
            [KID, '下面好冷、好黑……然後，我看到一個好亮好溫暖的地方。'],
            [KID, '我就……就把那顆暖暖的石頭抱走了。'],
            '拾光把懷裡的星核抱得更緊了。',
            [KID, '對不起……可是沒有它，我會冷得一直發抖。'],
            ask('要幫拾光回家嗎？', ['幫忙', '拒絕'], [
              [[ME, '我們一起想辦法，送你回家吧！'], [KID, '真的嗎……？'],
                '拾光眨了眨眼，把星核輕輕放到你的手上。',
                give('core'), set('follow'),
                [KID, '那……我跟你走。你身上有好聞的郵票味道。'],
                '（拾光跟在你的身邊了。快把星核送回燈塔吧。）'],
              [[ME, '那是大家的燈，快還給我！'],
                '拾光嚇了一跳，把星核丟在地上，化成藍光逃走了。\f你撿起星核。森林裡，好像傳來了小小的哭聲……',
                give('core'), set('grab'), bgm('adv_sad')]
            ], KID)];
        } }
      ],
      exits: [{ to: 'woods' }],
      use: function (g, it) {
        if (it === 'music') {
          if (g.f.grab) return ['音樂盒的旋律在空地上迴盪。可是，已經沒有人在聽了。'];
          if (g.f.calm) return [[KID, '這首歌，我好喜歡。']];
          return ['你打開音樂盒的蓋子。', bgm('adv_lullaby'),
            '叮咚、叮咚——〈星之歌〉溫柔的旋律，在林間緩緩流淌。\f光團慢慢地、慢慢地，探出頭來。\f那是一個小小的孩子。頭頂，像星星一樣閃著光。',
            [WHO, '這首歌……媽媽唱過的……'], set('calm'),
            '光團不再發抖了。（跟它說說話吧。）'];
        }
        if (it === 'lamp' && !g.f.calm && !g.f.grab) return ['你舉起提燈。光團被藍光照到，縮得更小了。'];
        return null;
      }
    },

    /* ---------- 10 星橋 ---------- */
    bridge: {
      name: '星橋', label: '星橋', pic: 'bridge', bgm: 'adv_lullaby',
      enter: function (g) {
        return ['你和拾光，踏上了星橋。\f腳下是一整片被燈光照亮的雲海。遠方，船隊的燈火排成一條長長的河，正朝港口回來。\f' +
          '頭頂上，滿天的星星好近好近，好像伸手就摸得到。'];
      },
      look: function (g) { return ['星橋一路往上，消失在星星之間。']; },
      objs: [
        { n: '星空', look: ['星座盤上缺了一顆星的那個星座，就在正上方。\f那裡，有一個小小的空位。'] },
        { n: '雲海', look: ['船隊的燈火一盞一盞進了港。午夜的鐘聲，從鎮上遠遠地傳來。'] }
      ],
      people: [
        { n: '拾光', id: 'kid', talk: function (g) {
          return [[KID, '找到了……那裡，就是我的家！'], [KID, '小羽，謝謝你。'],
            ask('要怎麼做？', ['送它走', '一起去'], [
              [{ end: 'true' }],
              [{ end: 'travel' }]
            ])];
        } }
      ],
      exits: [{ to: 'top' }],
      use: function (g, it) {
        if (it === 'music') return ['你打開音樂盒。〈星之歌〉乘著風，飄向天空。', [KID, '媽媽……我回來了。'], '（跟拾光說說話吧。）'];
        return null;
      }
    }
  };

  A.BRIDGE_OPEN = [
    '星圖忽然自己展開了。上面的星星，一顆接一顆亮了起來。\f' +
    '光束的盡頭，一座閃著微光的橋，從燈室的陽台伸向天空——',
    set('bridge'), sfx('adv_item'),
    '是「星橋」！',
    [KID, '那是……回家的路！'],
    '（從陽台走上星橋吧。）'
  ];

  /* ============================== 結局 ============================== */
  // 順序 = 結局編號；kind：good / other / bad（bad 可用密技回到上一個決策點）
  A.ENDINGS = [
    { id: 'true', no: 1, name: '星燈與歸途', kind: 'good', pic: 'bridge', variant: 'home', bgm: 'adv_lullaby', steps: [
      '你打開音樂盒。〈星之歌〉的旋律，乘著風飄向天空。',
      [KID, '我會每天晚上，在那裡跟你眨眼睛喔！'],
      '拾光沿著星橋往上跑。越跑越亮，越跑越高——\f最後，它變成一顆小小的星星，嵌進了那個空位。\f星座完整了。整片夜空，好像都在微笑。',
      '午夜十二點。船隊在星燈的指引下，一艘不少地回到了港口。\f' +
      '霞婆婆在碼頭抱住了她的孫子。鐘錶店的鐘又滴答滴答地走了起來，音樂盒在廣場上彈著〈星之歌〉。\f' +
      '從那天起，每到星祭的夜晚，夜空中總有一顆小星星，特別努力地眨著眼睛。\f你知道，那是拾光在跟你打招呼。'
    ] },
    { id: 'travel', no: 2, name: '星之旅人', kind: 'other', pic: 'bridge', variant: 'travel', bgm: 'adv_lullaby', steps: [
      '你牽起拾光的手。',
      [KID, '真的嗎？小羽也要來？'],
      '拾光開心得在空中轉了三圈。\f你們沿著星橋一路往上。星港鎮的燈火，越來越小……',
      '隔天早上，郵局的局長在桌上發現一張紙條：\f「局長，我去送一封很遠很遠的信。　小羽」\f' +
      '聽說，從那天起，星星們之間，多了一位會飛的見習郵差。'
    ] },
    { id: 'lamp', no: 3, name: '燈亮了', kind: 'other', pic: 'tower', variant: 'lit', bgm: 'adv_sad', steps: [
      '星燈重新亮了起來。午夜，船隊平安地回到了港口。\f星祭熱熱鬧鬧地開始了，大家都在稱讚你的功勞。',
      '可是，在歡呼聲中，你總覺得森林那邊，有一道小小的藍光，一直在發抖。\f……那個孩子，後來怎麼樣了呢？',
      '（也許還有別的結局。下次，試著溫柔一點吧。）'
    ] },
    { id: 'fog', no: 4, name: '霧中的港口', kind: 'bad', pic: 'dock', variant: 'fog', bgm: 'adv_sad', steps: [
      '你把玻璃珠放進燈座。\f透鏡亮了一下——發出的，卻是一團白白的霧光。',
      '霧光把整片雲海照得白茫茫的。船隊的燈火，反而全都看不見了。\f星祭只好延期。這一晚，港口的大家，只能一起等待天亮……',
      '（玻璃珠代替不了星核。還來得及，回到剛才再選一次吧。）'
    ] },
    { id: 'sleep', no: 5, name: '回籠覺', kind: 'bad', pic: 'room', variant: 'morning', bgm: 'adv_sad', steps: [
      '「再五分鐘就好……」你鑽回了溫暖的被窩。\f……再醒來的時候，窗外已經是大白天。',
      '聽說，昨晚是天文台的莉拉和鐘錶店的爺爺熬了一整夜，才讓燈塔重新亮了起來。',
      '局長氣得鬍子都翹起來了：「小羽！那封急件呢？！」',
      '（還來得及，回到剛才再選一次吧。）'
    ] }
  ];

  A.CREDITS = '星塵冒險　消失的星燈\n\n\n登場人物\n\n見習郵差　小羽\n星之子　拾光\n燈守　霞婆婆\n' +
    '雲鯨號船長　鷗姐\n鐘錶匠　齒輪爺爺\n觀星員　莉拉\n廣場的貓　麻糬\n\n\n謝謝你玩到最後\n\n\n\n';

  /* ============================== 提示（依進度，第一個沒完成的） ============================== */
  A.HINTS = [
    { done: function (g) { return g.f.lampTaken && g.f.letterTaken; }, text: '先把閣樓書桌上的「提燈」和「郵差包」帶在身上吧。用「拿取」。' },
    { done: function (g) { return g.f.delivered; }, text: '急件是寄給燈塔的霞婆婆的。到燈塔前，用「使用」把信交給她。' },
    { done: function (g) { return g.f.open; }, text: '用霞婆婆給的鑰匙，打開燈塔的鐵門吧。（使用 → 鑰匙）' },
    { done: function (g) { return g.f.lit; }, text: '燈室的燈座裡還留著星屑的光。試著對它使用「提燈」。' },
    { done: function (g) { return g.f.gotGear; }, text: '廣場的噴水池裡，好像有東西在發光。仔細調查看看。' },
    { done: function (g) { return g.f.fixed; }, text: '鐘錶店的齒輪爺爺在修音樂盒，少了一個小齒輪。把齒輪交給他吧。' },
    { done: function (g) { return g.f.gotMap; }, text: '把發光的提燈帶去天文台，跟莉拉說說話。' },
    { done: function (g) { return g.f.calm || g.f.grab; }, text: '星屑的光一路通往森林。到星石林地，讓害怕的孩子聽聽溫柔的音樂吧。（使用 → 音樂盒）' },
    { done: function (g) { return g.f.follow || g.f.grab; }, text: '拾光已經不害怕了。跟它好好談一談。' },
    { done: function (g) { return g.f.relit; }, text: '把星核帶回燈室，放回燈座。（使用 → 星核）' },
    { done: function (g) { return g.f.bridge; }, text: '在燈室裡，讓燈塔的光和星圖一起指向天空。（使用 → 星圖）' },
    { done: function () { return false; }, text: '從燈室的陽台走上星橋，跟拾光說說話吧。' }
  ];
  A.HINT_HEAD = '提示';

  /* ============================== 介面文字 ============================== */
  A.UI = {
    title: '星塵冒險', subtitle: '～消失的星燈～',
    titleMenu: ['從頭開始', '繼續遊戲', '結局一覽', '操作說明'],
    cmds: ['調查', '移動', '交談', '拿取', '使用', '物品', '系統'],
    around: '四周',
    sys: ['提示', '存檔', '回標題'],
    prompt: '要做什麼呢？',
    noTalk: '這裡沒有可以說話的對象。',
    noItem: '身上什麼都沒有。',
    noTake: ['這個拿不走。', '還是不要亂拿比較好。', '拿不起來。'],
    noUse: '這裡好像用不到。',
    gotItem: function (name) { return '得到了「' + name + '」！'; },
    saved: function (n) { return '已經存到第 ' + n + ' 格。'; },
    loaded: '讀取了存檔。',
    empty: '這一格沒有存檔。',
    slotEmpty: '--',
    toTitle: '要回到標題畫面嗎？',
    yesNo: ['是', '否'],
    paused: '暫停中',
    endHead: '結局',
    theEnd: 'THE END',
    retryTail: 'A：回到選擇前　B：回標題',
    autoSlot: '自動',
    autoLoaded: '讀取了自動存檔。',
    unknown: '？？？？',
    endingsTitle: '結局一覽',
    back: 'B：返回',
    cheatHint: '密技：立即提示',
    // 說明頁 2 頁（每頁的不同字要放得進字形池 159 磚）
    help: [
      [['操作說明　1／2'], ['十字鍵：選擇', 'A：決定／翻頁', 'B：取消'], ['START：暫停', '按住 START+SELECT：回選單'], ['A：下一頁']],
      [['存檔　2／2'], ['換地點時會自動存檔，', '從標題「繼續遊戲」讀取。'], ['C／★：密技（立即提示）'], ['B：返回']]
    ]
  };
})();
