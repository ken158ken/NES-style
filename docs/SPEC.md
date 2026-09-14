# 卡比之星（同人版）— 技術規格書

> 所有 agent 必讀。本專案為零相依的 HTML5 Canvas 遊戲，雙擊 `index.html` 或 `開始遊戲.bat` 即可玩。
> **法律原則**：所有美術、音樂、關卡皆為本專案原創（以程式碼手繪像素圖、以 Web Audio 合成原創曲）。
> 嚴禁使用任何任天堂 / HAL 的 ROM、音樂、擷取圖片。技術棧僅用 MIT/無授權的瀏覽器內建 API。

## 1. 技術棧
- 純 HTML + JavaScript（ES2020，**classic script**，不用 ES module，才能在 `file://` 直接開）
- 所有檔案透過 `index.html` 依序載入，共用全域命名空間 `KB`
- 內部解析度 **256×224**，整數倍放大、`imageSmoothingEnabled=false`（像素風）
- 固定步進 60 FPS（`dt` 一律視為 1 frame；速度單位 = px/frame）
- 磁磚 16×16；遊戲畫面區 256×192（16×12 格），底部 32px 為 HUD

## 2. 檔案配置
```
index.html            載入順序（勿改順序；新增檔案請加在對應區段）
src/const.js          常數 / 共用調色盤
src/gfx.js            精靈註冊、繪製、文字
src/input.js          鍵盤 / 手把 / 虛擬輸入
src/audio.js          音效 + 音樂（agent: audio）
src/tilemap.js        磁磚地圖、物理碰撞
src/entity.js         Entity 基底、粒子、通用投射物
src/player.js         卡比狀態機
src/abilities.js      複製能力（agent: abilities）
src/enemies.js        敵人（agent: enemies）
src/items.js          道具 / 星星彈 / 能力星
src/bosses.js         魔王（agent: bosses）
src/levels.js         關卡資料（agent: levels）
src/game.js           GameScene（房間、鏡頭、門、HUD 呼叫）
src/ui.js             標題 / 選關 / 暫停 / GameOver / 結局 / HUD（agent: ui）
src/art/*.js          像素美術資料（agent: art-*）
src/main.js           啟動、主迴圈、除錯 API
tools/shot.py         Playwright 截圖工具（畫面比對用）
tools/sheet.html      精靈總表檢視
```

## 3. 精靈（Sprite）格式 — `src/gfx.js`
```js
// 單張或多幀。rows 為字串陣列，每字元對應調色盤的顏色；'.' 與 ' ' 為透明。
KB.sprite('kirby_idle', KB.PAL.kirby, [
  [ '....kkkk....',
    '..kkppppkk..', ... ],       // frame 0
  [ ... ],                       // frame 1
], { fps: 4, loop: true, anchor: 'bottom' /* 'bottom'|'center'|[ax,ay] */ });

// 繪製：x,y 為錨點（預設 bottom = 底部中央），世界座標用 g.spr，螢幕座標用 KB.drawSpr
g.spr('kirby_idle', x, y, { flip: dir < 0, t: this.t /* 秒，自動選幀 */, frame: 2 /* 或指定幀 */ });
```
- 調色盤：`KB.PAL.kirby / enemy / ui / green ...`（見 const.js）；可自訂 `{ a:'#hex', ... }`，可用 `Object.assign({}, KB.PAL.kirby, {...})` 擴充。
- **找不到精靈時會畫洋紅色方塊並印出名稱**，方便 QA；程式與美術可獨立開發。
- 精靈名稱規則：`<角色>_<動作>`，帽子 `hat_<能力>`，磁磚 `tile_<主題>_<種類>`，UI `ui_<名稱>`，道具 `item_<名稱>`。

### 3.1 卡比動畫名稱（art-kirby 必須全部提供；程式端引用這些名稱）
| 名稱 | 幀數 | 說明 |
|---|---|---|
| kirby_idle | 2 | 站立、偶爾眨眼（幀1=眨眼） |
| kirby_walk | 4 | 走路 |
| kirby_run | 4 | 跑步（身體前傾） |
| kirby_jump | 1 | 起跳上升 |
| kirby_flip | 4 | 跳躍頂點後翻滾 |
| kirby_fall | 1 | 下落 |
| kirby_float | 4 | 吸氣鼓脹漂浮（嘴巴鼓起、拍動） |
| kirby_inhale | 2 | 張嘴吸入 |
| kirby_full_idle | 2 | 嘴巴含物站立（身體變大） |
| kirby_full_walk | 4 | 含物走路 |
| kirby_full_jump | 1 | 含物跳躍 |
| kirby_spit | 2 | 吐出 |
| kirby_swallow | 2 | 吞下 |
| kirby_exhale | 2 | 漂浮時吐氣 |
| kirby_slide | 1 | 滑鏟 |
| kirby_crouch | 1 | 蹲下（扁平） |
| kirby_hurt | 1 | 受傷 |
| kirby_dead | 4 | 死亡（旋轉/眼睛X） |
| kirby_swim | 2 | 游泳 |
| kirby_climb | 2 | 爬梯 |
| kirby_door | 2 | 進門背影 |
| kirby_dance | 6 | 過關跳舞 |
| kirby_stone | 1 | 石頭形態（灰色石像） |
| kirby_attack_sword | 3 | 揮劍 |
| kirby_attack_hammer | 3 | 揮鎚 |
| kirby_attack_fire | 2 | 噴火（張嘴） |
| kirby_attack_ice | 2 | 噴冰 |
| kirby_attack_beam | 2 | 甩光束（手伸出） |
| kirby_attack_cutter | 2 | 丟迴旋刃 |
| kirby_attack_spark | 2 | 放電（張手） |
| hat_fire / hat_sword / hat_beam / hat_cutter / hat_spark / hat_ice / hat_hammer | 1~2 | 帽子疊加層，anchor = 'bottom'，繪於頭頂（程式以 `KB.HAT_OFFSET[state]` 定位） |

卡比尺寸：身體約 16×16（含腳約 18 高），畫在 **20×20 幀**內（anchor bottom）。含物狀態 24×24。

### 3.2 敵人動畫名稱（art-enemies）
`waddledee_walk(4)`, `waddledoo_walk(4)`, `waddledoo_attack(2)`, `brontoburt_fly(2)`, `hothead_walk(2)`, `hothead_attack(2)`,
`sirkibble_walk(2)`, `sirkibble_throw(2)`, `sparky_hop(2)`, `sparky_attack(2)`, `rocky_walk(2)`, `rocky_drop(1)`,
`chilly_walk(2)`, `chilly_attack(2)`, `bladeknight_walk(2)`, `bladeknight_attack(2)`, `bonkers_walk(2)`, `bonkers_attack(2)`,
`poppybros_hop(2)`, `scarfy_fly(2)`, `scarfy_angry(2)`, `gordo(1)`, `cappy_walk(2)`, `cappy_bare(2)`, `twizzy_fly(2)`,
`shotzo(1)`, `squishy_swim(2)`, `glunk(2)`, `kabu(2)`
投射物：`proj_beam(2)`, `proj_fireball(2)`, `proj_cutter(2)`, `proj_spark(2)`, `proj_ice(2)`, `proj_bomb(2)`, `proj_apple(1)`, `proj_star(2)`(卡比吐出的星), `proj_airpuff(2)`, `proj_cannonball(1)`, `proj_lightning(2)`, `proj_iceblock(1)`
特效：`fx_hit(3)`, `fx_poof(4)`, `fx_sparkle(3)`, `fx_blockbreak(1)`, `fx_inhale_wind(2)`, `fx_fire(3)`(火焰噴射一段), `fx_beam_seg(1)`, `fx_ice(3)`, `fx_spark_field(2)`

### 3.3 魔王動畫名稱（art-bosses，尺寸較大 48~80px）
`whispy_idle(2)`, `whispy_blow(2)`, `whispy_hurt(1)`, `whispy_root(1)`；
`lololo_walk(2)`, `lalala_walk(2)`, `proj_box(1)`；
`kracko_idle(2)`, `kracko_attack(2)`, `kracko_hurt(1)`；
`metaknight_idle(2)`, `metaknight_attack(3)`, `metaknight_dash(1)`, `metaknight_hurt(1)`；
`dedede_idle(2)`, `dedede_walk(4)`, `dedede_jump(1)`, `dedede_hammer(3)`, `dedede_inhale(2)`, `dedede_hurt(1)`
`mrfrosty_walk(2)`, `mrfrosty_throw(2)`（小魔王）

### 3.4 磁磚 / 背景 / 道具 / UI（art-world）
主題：`green`(翠綠草原) `castle`(城堡) `island`(浮島/海) `cloud`(泡泡雲) `dedede`(迪迪迪城)
每主題磁磚：`tile_<theme>_top`, `tile_<theme>_topL`, `tile_<theme>_topR`, `tile_<theme>_fill`, `tile_<theme>_left`, `tile_<theme>_right`,
`tile_<theme>_bottom`, `tile_<theme>_platform`, `tile_<theme>_slopeL`(/ 左低右高), `tile_<theme>_slopeR`(\ 左高右低)
通用：`tile_star`(2), `tile_bomb`(2), `tile_spike`, `tile_water_top`(2), `tile_water`, `tile_ladder`, `tile_door`, `tile_door_boss`
背景：由 `KB.BG[theme](ctx, camX, camY, t)` 程序式繪製（雲、山丘、城牆…），可搭配精靈 `bg_<theme>_*`。
道具：`item_tomato`, `item_food(4種以上)`, `item_1up`, `item_candy`, `item_star`(點數星), `item_abilitystar(2)`, `item_warpstar(2)`
UI：`ui_hp_full`, `ui_hp_empty`, `ui_kirby_face`, `ui_boss_bar`, `ui_ability_<key>`(能力圖示 24×16), `ui_ability_none`, `ui_cursor`, `ui_font`（8×8 點陣字，見 gfx.js `KB.FONT`）

### 3.5 文字與字型（`src/gfx.js` / `src/ui.js`；agent: font）
**兩套繪字路徑，都輸出對齊像素格點的實心筆畫：**

| 內容 | 路徑 | 說明 |
|---|---|---|
| 純 ASCII 且 `size === 8` | 8×8 點陣字 `KB.FONT`（`src/art/font.js`） | HUD 的 `SCORE` / 數字 / `CLEAR` / 時間戳等。**不變** |
| 中文、混排、`size ≥ 12` | 像素中文字型（`KB.FONTS`） | 以**原生字級**繪製 + `alpha ≥ 128` 二值化，不放大也不縮小 |
| 像素字型載入失敗 | 舊的「系統黑體 ×4 超取樣 + 覆蓋率二值化」 | 向下相容的退路，參數在 `KB.TEXT_CFG.scale / cover / boldFrom` |

```js
KB.FONTS   = { px12:'FusionPixel12', px16:'ArkPixel16', ready, failed, loaded:{}, zh:{} };
KB.FONT_SRC= { px12:'assets/fonts/fusion12-zh_hant.woff2', px16:'assets/fonts/ark16-zh_tw.woff2' };
KB.FONT_DATA          // dist 單檔版：tools/build.py 內嵌的 base64 data URI，優先於 FONT_SRC
KB.TEXT_CFG.pixelMap  // [[字級上限, KB.FONTS 的 key, 實際繪製 px], …] ← 字級對應表，可調
KB.TEXT_CFG.alpha     // 二值化門檻（預設 128）
KB.TEXT_CFG.mixBitmap // false（預設）＝中英混排整段都用像素字型；true＝英數走 8×8
KB.loadPixelFonts()   // gfx.js 載入時自動呼叫；完成後 clearTextCache() 讓畫面自動改用像素字
```
- 啟動後的頭幾幀（字型還沒載完）會走舊路徑，載好即自動重畫，**不需要等 `document.fonts.ready`**。
- `pixelMap` 的字型若畫不出字串裡的漢字（用「國」實測），該串**自動退回 `px12`**；`KB.FONTS.zh` 記錄結果。

**字級策略（統一規則，呼叫端請照這個寫）**
| 用途 | 字級 | 實際字型 |
|---|---|---|
| 正文 / 選單 / 標籤（`UI.MS`） | 12 | 縫合像素字體 12px |
| 次要灰字（`UI.MS_SMALL`） | 12 | 同上 |
| 標題 / 能力名 / 分頁（寫 `size: 16`） | 16 → 對應到 12 | 同上（見下方「已知限制」） |
| HUD 能力中文名 | 12 | 同上 |
| 英文 / 數字 / HUD | 8 | 8×8 點陣字 |
- **`size: 14` 一律不要再用**；要嘛 12（正文）要嘛 16（標題，由 `pixelMap` 決定實際 px）。
- 行高：12px 字用 **14~15px**（緊湊表格 13px 可接受）；若日後 16px 中文可用則 18~20px。
- 12px 中文的 ink 佔 `y+2 ~ y+13`（`KB.text` 的 `y` 是字框上緣），排版留白請照這個算。

**已知限制（字型資產）**：`ark16-zh_tw.woff2` 是方舟像素字體官方 16px zh_TW 檔，但該尺寸**目前只收了
3,252 個字，其中 CJK 統一漢字僅 97 個**（常用字如「繼續圖鐵鎚醒競績」都沒有），只能拿來畫拉丁 / 假名 /
符號。`fusion12-zh_hant.woff2`（縫合像素字體 12px）有 36,558 字、19,214 個漢字，是目前唯一可用的繁中
像素字型 ⇒ **所有中文實際都畫在 12px**。等到有可用的 16px 繁中像素字型，只要把檔案換掉、
`KB.TEXT_CFG.pixelMap` 不動，標題就會自動變 16px。

**字型授權**：縫合像素字體（Fusion Pixel Font）／方舟像素字體（Ark Pixel Font），皆為 SIL OFL 1.1，
授權全文見 `assets/fonts/OFL-fusion.txt`、`assets/fonts/OFL-ark.txt`。

## 4. Entity 介面 — `src/entity.js`
```js
class Entity {
  x, y, w, h        // 碰撞框左上角與大小（世界 px）
  vx, vy, dir(±1)   // 速度、面向
  type              // 'player' | 'enemy' | 'boss' | 'item' | 'proj' | 'fx' | 'door'
  hp, dead, t(秒), invuln(幀)
  grav (預設 KB.GRAV), solid(與磁磚碰撞), onGround
  inhalable(可被吸), ability(被吞後給的能力 key 或 null), hurtsPlayer(碰觸傷害), damage
  update(dt) / draw(g) / hurt(amount, src) / die(reason) / onInhaled(player)
  get cx, get cy, get bottom, get top ; overlaps(o)
  physics()         // 呼叫 KB.physics.step(this, map)，處理重力與磁磚
}
KB.spawn(entity) 加入目前房間；KB.game 為目前 GameScene；KB.player 為卡比。
KB.game.entities / KB.game.map / KB.game.room / KB.game.level / KB.game.cam {x,y}
KB.fx(name, x, y, opts) 產生一次性特效；KB.particles(x,y,color,n)
```
敵人註冊：`KB.ENEMIES['waddledee'] = class extends Enemy { ... }`；關卡以 `{t:'waddledee', x, y}`（磁磚座標）生成。

## 5. 卡比（player.js）與能力（abilities.js）
- 能力註冊：`KB.ABILITIES[key] = { name:'火焰', hat:'hat_fire', icon:'ui_ability_fire', color:'#f04', onAttack(p), onHold(p), onRelease(p), update(p,dt), cancelable:true, hudName:'FIRE' }`
- `p.state` 值：`idle walk run jump fall float inhale full spit swallow slide crouch hurt dead attack stone swim climb door dance`
- `p.setState(s)`, `p.attackTimer`, `p.abilityData` 供能力保存暫存狀態。
- 攻擊判定：`KB.hitbox({x,y,w,h, dmg, owner:p, type:'sword', pierce:true, life:1})` 產生 Hitbox 實體對敵人/方塊造成傷害。

## 6. 關卡格式（levels.js）
```js
KB.LEVELS.push({
  id: 'w1', name: '翠綠草原', theme: 'green', music: 'green',
  rooms: [
    { map: [ '....', '####' ], // 每行字串，長度一致
      deco: [ ... ]?,           // 可選裝飾層（同尺寸）
      spawn: [2, 8],            // 磁磚座標（x, y）卡比腳站的格子上方
      entities: [ {t:'waddledee', x:10, y:8} ],
      doors: [ {x:30, y:8, to:{room:1, x:2, y:8}, boss:false} ],
      exit: {x:60,y:8}?,        // 過關門
      bg: 'hills'?, music?: 'green',
    }
  ],
  boss: 'whispywoods',          // 最後一房生成的魔王 key（KB.BOSSES）
});
```
磁磚字元：`#` 實心、`=` 單向平台、`*` 星星方塊、`B` 炸彈方塊、`^` 尖刺、`~` 水、`H` 梯子、`/` 與 `\` 45° 斜坡、`.` 或空白為空。
機關磁磚（Round 4~6）：`X` 硬磚（只有 hammer / stone / 火焰衝刺 / dmg≥5 打得破）、`F` 導火線（可通行，被火點燃會延燒到 `B`）、
`I` 冰磚（實心，被火焰命中 20 幀後融化）、**`W` 木箱（Round 6 / elements）**——實心可站，被火焰命中燒 40 幀後消失、
鎚 / 石頭類重擊（`KB.TileMap.hardBreakable`）砸得破、被風吹會熄火。`tools/level_check.js` 的 `KNOWN` / `SOLID` 都已收錄。

## 6.5 Round 5~6 系統（KB.MIX / KB.Helper / KB.ELEM / KB.PROG）
> 四套系統都是「載入即生效、缺了也不會壞」的獨立命名空間；詳細介面見 `docs/PROGRESS.md` Round 6 各 agent 區段。

- **`KB.MIX`（能力混合，`src/abilities_mix.js`）**——12 組混合能力，`KB.ABILITY_KEYS` 由 20 擴到 **32**。
  `KB.MIX.table`（key = 排序後的 `a|b`）/ `keyOf(a, b)`（無序查表，同能力 / 已是混合 / 查無組合 → `null`）/
  `isMix(key)` / `parts(key)` → `[A, B]`。取得途徑：① `player.giveAbility(key)` 在持有 A 時收到 B 會自動換成混合 key
  （吞下敵人 / 撿能力星 / 能力台座 / 夥伴吸回四條路共用）；② **短按 SELECT 把能力星丟出去砸中帶能力的敵人**
  （fix6：`KB.ITEMS.abilitystar.throwForward()`，敵人被吞噬、能力星變成「混合星」，撿起來就是混合能力）。
  受傷掉落混合能力時，能力星退回主成分 A。
- **`KB.Helper`（AI 夥伴，`src/helper.js`）**——長按 SELECT 45 幀把目前能力變成跟隨的小夥伴（HP 4），
  `spawn(p) / recall(p) / exists() / get() / clear() / tick(game) / drawHUD(ctx, game)`。
  夥伴實體是「假玩家介面」，直接重用 `KB.ABILITIES[key]` 的 `onGet / onAttack / update / onEnd`，判定框 `owner:'player'`。
- **`KB.ELEM`（元素反應，`src/elements.js`）**——`of(hitboxOrProj)` → `fire|ice|spark|wind|none`；
  `applyHit(target, dmg, src)` 統一乘算弱點 ×2 / 抗性 ×`resistK`（敵人與魔王共用）；
  `scanTiles(a)` 由 `Hitbox.update` / `Projectile.update` 呼叫，觸發環境反應：
  火燒草 deco（蔓延 3 格 → 焦黑 30 秒）／火燒木箱 `W`／火融冰磚 `I`／冰結水面（8 秒可站的滑溜平台）／
  電擊整片水域（水中敵人 dmg 4 + 凍結、水中的卡比自傷 1）／風吹熄燃燒中的草與木箱。
  敵人 / 魔王身上的標籤欄位：`element` / `weak[]` / `resist[]` / `resistK`。
- **`KB.PROG`（成長系統，`src/progression.js`）**——能力等級（`level / xp / dmgMul / partMul / holdMul / scaleDmg`；
  取得同一能力 3 次 → Lv2、8 次 → Lv3，傷害 ×1.25 / ×1.5，**蓄力門檻 ×0.8**）、連擊、20 條成就、Style Rank（S/A/B/C）、
  事件匯流排（`emit / on`：`kill / hurt / abilityGet / levelClear / bossDefeated / secretRoom / arenaClear / mix / helper /
  inhaleBoss / possess / elemKill / burn / bigstar`）。
  各 `abilities*.js` 的蓄力具名常數（`HAMMER_SPIN / BEAM_WAVE / SPARK_BURST / GUNNER_ULT / BLADE_IAI / BOW_METEOR /
  MAGIC_ULT / DRAGON_NOVA / MECH_BARRAGE`）都經過 `HOLD(key, n) = round(n × KB.PROG.holdMul(key))`，
  **招式表上寫的數字一律是 Lv1 的門檻**。

## 6.6 存檔格式（`KB.save`，localStorage `kirbystar_save`，`KB.saveGame()`）
| 欄位 | 型別 | 說明 |
|---|---|---|
| `cleared` | `{levelId: true}` | 已通關的世界 |
| `score` | number | 累計總分 |
| `best` | `{levelId: number}` | 各關最佳結算總分 |
| `stars` | `{levelId: [bool×3]}` | 大星星收集（7 關 × 3 = 21） |
| `seen` | `{abilityKey: true}` | 圖鑑「已發現」的能力（共 44 種：20 基本 + 24 混合）；`seenNew` 是「圖鑑有新東西」紅點 |
| `arena` | `{…}` | 競技場最佳時間（`src/arena.js`） |
| `settings` | `{vfx:'high'\|'mid'\|'low', …}` | 畫質等級等玩家設定（`KB.VFX.level` 讀這裡） |
| `abilityXp` | `{abilityKey: n}` | 能力累積取得次數（Round 6 / progression） |
| `abilityLv` | `{abilityKey: 1..4}` | 能力等級（xp 3 → Lv2、xp 8 → Lv3、xp 15 → Lv4 覺醒） |
| `achievements` | `{achId: 解鎖時間戳}` | 20 條成就 |
| `rank` | `{levelId: 'S'\|'A'\|'B'\|'C'}` | 各關 Style Rank（只升不降） |
| `secrets` | `{levelId: {roomIdx: 1}}` | 找到過的秘密房 |
| `prog` | `{tsKills, elecWaterKills, burnGrass, comboBest}` | 跨關累計計數器（成就用） |
| `ending` | bool | 看過結局 |
| `playCount` | `{levelId: n}` | 各關通關次數（Round 7 / records） |
| `bestTime` | `{levelId: 幀數}` | 各關最短通關時間 |
| `extraCleared` | `{levelId: true}` | Extra 模式通關標記 |
| `challenge` | `{time{}, nohit{}, nohitTime{}, tower{bestFloor,bestTime,clears}, daily{YYYYMMDD}, arena{variant}}` | 挑戰模式紀錄（Round 8 / challenge） |
| `settings.skin` | string | 卡比配色 id（Round 8 / skins；設定為全域存於 kirbystar_global） |

存檔槽（Round 8 / saves）：`kirbystar_save_1~3`、目前槽 `kirbystar_slot`、全域 `kirbystar_global`（settings / bindings / slot / migrated）；舊 `kirbystar_save` 於槽 1 為空時遷移。
`KB.PROG.save()` 會在讀檔後自動補齊上列 Round 6 新欄位（舊存檔相容）；`KB.PROG.reset()` 清空全部進度。

## 7. 場景（Scene）
`KB.setScene(scene)`；scene 需有 `update(dt)`、`draw(ctx)`；可選 `enter()`、`exit()`。
現有：`TitleScene`, `StageSelectScene`, `GameScene`, `GameOverScene`, `EndingScene`（ui.js 提供除 GameScene 以外者）。

## 8. 除錯 / 截圖 API（main.js，`?debug=1`）
```js
__kb.goto('title') / __kb.goto('game', {level:'w1', room:0, x:5, y:8, ability:'fire'}) / __kb.goto('sheet')
__kb.step(n)                  // 前進 n 幀（不用 RAF，決定性）
__kb.press({right:true, jump:true}) // 設定虛擬輸入（持續）；__kb.release()
__kb.state()                  // 回傳 JSON 快照
```
截圖：`python tools/shot.py --scene game --level w1 --room 0 --steps 60 --keys right --out shots/w1.png --scale 3`
精靈總表：`python tools/shot.py --scene sheet --filter kirby --out shots/sheet_kirby.png`

## 9. 音訊（audio.js）
`KB.audio.sfx(name)`：`jump land float exhale spit swallow hurt die enemyhit enemydie block item ability door boss_hurt boss_die menu select slide sword fire beam cutter spark ice hammer stone clear pause`
＋ Round 1：`unpause lowhp oneup bigstar charge charge_ready unlock phase2 menu_back`
＋ Round 2：`splash bubble wind torch fuse melt hardblock count count_end ride(=warp) essence`
＋ Round 5（12 種新能力，共 47 個）：
　武器系 `gun shotgun reload shuriken teleport iai slash_big bow arrow arrow_rain wallkick`
　魔法系 `fireball icewall thunder magic_circle magic_big timestop timeresume slowmo rewind blackhole meteor gravity_lift clone_summon clone_swap clone_rush`
　變身系 `giant_grow stomp giant_roar shrink dragon_breath dragon_dash tail_whip wing_flap rocket_punch missile jet mech_step armor_break ghost_phase possess unpossess ghost_wail`
　通用 `transform`（變身演出 0.7s）`untransform` `ultimate`（必殺 stinger 0.5s）`max`（蓄力全滿，比 charge_ready 亮）
＋ Round 8（共 52 個）：
　混合能力（24，每個 2 層合成＝成分 A 音色 + 成分 B 音色，0.25~0.45 秒）`mix_<mixkey>`：
　`mix_flamesword mix_frostsword mix_thunderblade mix_flamegun mix_frostgun mix_thunderbow mix_flamehammer mix_stonehammer mix_shadowblade mix_starmage mix_frostdragon mix_thundermech`
　`mix_flamebow mix_frosthammer mix_thundersword mix_flameninja mix_frostninja mix_thundergun mix_stonegiant mix_flamedragon mix_thunderdragon mix_timebeam mix_gravityblade mix_hammermech`
　覺醒招（20，低頻衝擊 + 高頻上揚 + 尾音 0.85~1.2 秒）`awk_<basekey>`：
　`awk_fire awk_sword awk_beam awk_cutter awk_spark awk_stone awk_ice awk_hammer awk_gunner awk_ninja awk_blade awk_bow awk_mage awk_time awk_gravity awk_clone awk_giant awk_dragon awk_mech awk_ghost`
　覺醒流程 `awk_ready`（量表滿）`awk_start`（覺醒發動）`awk_end`（覺醒終了）
　挑戰模式 `tick`（倒數最後 10 秒每秒一下）`time_up` `floor_clear`（過層 jingle 0.6s）`nohit_fail` `new_record`（破紀錄 jingle）
`KB.audio.music(key|null)`：`title select green castle island cloud dedede boss finalboss invincible clear gameover ending`
＋ `boss2 finalboss2 secret miniboss result arena arena_rest w_intro green2 castle2 island2 cloud2 dedede2`
＋ Round 5：`ultimate_loop`（必殺期間高張力 loop，2 小節素材交替 × 8）、`transform_jingle`（變身 1 小節短句，不循環 2.0 秒）
＋ Round 6 / 7（world6 / world7）：`space space2 shadowboss shadowboss2 dream dream2 nightmare nightmare2 trueend`
＋ Round 8（挑戰模式）：`challenge`（選單 loop，D 小調 126）、`tower`（挑戰塔 loop，A 小調 142，B 段逐級爬升）、`timeattack`（緊湊 loop，E 小調 170）
`KB.audio.ambient(key|null)`：環境音層 `water wind cave castle`（跟隨音效音量；與 music 獨立；同 key 不重啟，切房可直接呼叫）
`KB.audio.setVolume({music,sfx})` / `getVolume()` / `duck(on)` / `setMute(m)` / `toggleMute()` / `status()`
`KB.audio.setTempoMul(k)` / `getTempoMul()`：**音樂播放速度倍率 1.0~1.3**（超出自動夾限、非數字視為 1）。
　只改音序器 step 長度、不重啟曲子，可在播放中隨時呼叫（挑戰塔隨層數加速用）；切歌 / `music(null)` 不會重設，離開挑戰模式請自行 `setTempoMul(1)`。`status().tempo` 可查。
每音效節流見 `KB.audio.SFX_THROTTLE`（count 25ms、gun 30ms（可每 6 幀連射）、jet 60ms、dragon_breath 90ms、大招 200~500ms、
　**`awk_*` 500ms、`mix_*` 80ms、`tick` 900ms**…預設 80ms）。
`KB.audio.unlock()` 於第一次使用者輸入時呼叫。無聲環境（headless）需全部 try/catch。完整清單以 `node tools/audio_check.js` 輸出為準。

## 10. 手感參數（const.js，勿隨意改）
走 1.3 / 跑 2.2 / 跳 -4.4（可變高度）/ 重力 0.24 / 最大落速 4.2 / 漂浮：按跳 -1.6、重力 0.06、落速 0.8 / 滑鏟 3.0 × 22 幀 / 含物走 1.0
HP 6、生命 3 起、無敵 90 幀
