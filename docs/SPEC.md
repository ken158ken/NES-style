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
`KB.audio.music(key|null)`：`title select green castle island cloud dedede boss finalboss invincible clear gameover ending`
＋ `boss2 finalboss2 secret miniboss result arena arena_rest w_intro green2 castle2 island2 cloud2 dedede2`
`KB.audio.ambient(key|null)`：環境音層 `water wind cave castle`（跟隨音效音量；與 music 獨立；同 key 不重啟，切房可直接呼叫）
`KB.audio.setVolume({music,sfx})` / `getVolume()` / `duck(on)` / `setMute(m)` / `toggleMute()` / `status()`
每音效節流見 `KB.audio.SFX_THROTTLE`（count 25ms、fuse 50ms…預設 80ms）。
`KB.audio.unlock()` 於第一次使用者輸入時呼叫。無聲環境（headless）需全部 try/catch。完整清單以 `node tools/audio_check.js` 輸出為準。

## 10. 手感參數（const.js，勿隨意改）
走 1.3 / 跑 2.2 / 跳 -4.4（可變高度）/ 重力 0.24 / 最大落速 4.2 / 漂浮：按跳 -1.6、重力 0.06、落速 0.8 / 滑鏟 3.0 × 22 幀 / 含物走 1.0
HP 6、生命 3 起、無敵 90 幀
