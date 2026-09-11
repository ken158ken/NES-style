# 任務板（TASKS）

狀態：`todo` / `doing` / `done` / `blocked`。agent 只改自己那區；總控負責整合與跨檔任務。

## ui-menu（src/ui.js, src/menu.js, src/gfx.js 文字, game.js 暫停鉤子）
- [done] 中文渲染跨平台可讀 — gfx.js `renderTextCanvas` 改 4 倍超取樣 + 覆蓋率二值化；選單中文一律 14px（UI.MS）
- [done] 暫停選單：繼續 / 操作說明 / 音樂 / 音效 / 回到地圖 / 回到標題；暫停時只壓暗遊戲區，HUD 仍顯示
- [done] 暫停上半「目前能力」卡片（圖示、中英名、2 行原創風味文字、招式表）；無能力時顯示吸入 / 吐出 / 吞下教學
- [done] 標題選單：繼續遊戲(有存檔) / 新遊戲 / 操作說明 / 能力圖鑑 / 設定；SELECT 開啟說明
- [done] 遊戲內右上「?」提示：進新關第一房 toast 3 秒，之後常駐 8×8「?」，取得新能力閃 1 秒
- [done] 選關畫面每關收集品 ★ x/3（讀 KB.save.stars[levelId]）與通關旗
- [done] 設定：音樂 / 音效音量 0~10 格滑桿（KB.audio.setVolume）、按鍵提示開關（存 KB.save.settings）
- [todo] 設定：畫面縮放整數倍（需要動 main.js resize，非 ui-menu 檔案 → 待總控指派）
- [todo] 等 input.js 的 HELP 兩列長字縮短後，操作說明右欄可整欄回到 14px（目前自動降 12px + 截斷）

## player-feel（src/player.js, const.js, tilemap.js, input.js, game.js updateCamera）
- [done] coyote time 5 幀、jump buffer 6 幀、落地擠壓 + 揚塵、起跑 / 轉身煞車塵
- [done] 吸入：吸力範圍粒子 / 敵人被吸時抖動、吸到東西的 hit-stop 2 幀
- [done] 漂浮：每按一次跳有明顯拍動幀、連按上升節奏；吐氣後短暫無法再漂
- [done] 滑鏟可被跳躍取消、滑鏟撞牆回彈
- [done] 受傷 hit-stop、畫面微震、閃白
- [done] 鏡頭：前瞻依速度、垂直死區；魔王房同框（w1 room3 因房間寬 32 格、兩者相距 348px > 畫面寬，幾何上無法完全同框 → 見 PROGRESS 跨檔需求 3）
- [done] 手把：Gamepad API（D-pad + 類比死區 0.35）、KB.input.BINDINGS / rebind / keyNames（供 ui 設定頁）
- [done] 平台下穿（單向平台上 ↓+跳）、實心地面 ↓+跳 仍為滑鏟
- [done] engine_test 新增對應測試，89/89 PASS

## abilities-enemies（src/abilities.js, enemies.js, entity.js, art/enemies.js, art/kirby.js）
- [done] 每能力多招（共 26 招）：劍(空中迴旋斬、上挑斬、滿血劍氣)、鎚(蓄力大迴旋、空中落地震、巨鎚敲擊)、火(火焰衝刺、火焰旋轉)、冰(冰塊飛踢、冰晶散射)、光束(蓄力星潮光束、牽星光環)、刀刃(上拋刃、下劈)、電擊(蓄力電擊波、帶電慢走)、石頭(斜坡滾動、3 種隨機造型)；每招都有專屬卡比動畫幀與 moves/desc
- [done] 敵人行為：`Baddie.notice()` 察覺玩家（11 種敵人套用）、Waddle Doo 扇形掃射、Sir Kibble 回收刀刃、Poppy Bros 拋物線瞄準、Bonkers/Mr Frosty 第二招、Blade Knight 突刺；被吸入掙扎改為 `KB.inhaleWobble` 純繪製偏移
- [done] 新敵人 3 種：spikeball（滾刺球，無能力）、dartwing（飛羽鳥，無能力）、snowly（雪人，給 ice），含 2 幀走 / 2 幀攻擊像素圖，sheet 截圖已確認
- [done] enemy_test 覆蓋新招式與新敵人（每招「命中 waddledee 會死」＋新敵人 4 階段；全 PASS）
- [todo] 等 levels-bosses 把 3 種新敵人放進關卡後，做實戰配置檢視（跨檔需求已寫入 PROGRESS.md）

## levels-bosses（src/levels.js, bosses.js, items.js, art/bosses.js, art/world.js, backgrounds.js）
- [doing] 每世界 3 個隱藏收集品（大星星），存 KB.save.stars[levelId] = [bool×3]
- [todo] 每世界 1 個秘密房（隱藏門 / 可破壞牆 / 需能力才能開）
- [todo] 魔王二階段（HP<50% 變招、變色、音樂變奏鉤子 KB.audio.music('boss2')）
- [todo] 中魔王房前奏演出（門鎖上、擊敗後開）
- [todo] playthrough 5 世界皆通關，level_check 無 error

## audio（src/audio.js）
- [doing] 暫停時音樂降到 30%、恢復；`pause`/`unpause` sfx 區分
- [todo] 低血量(HP≤1) 警示循環音、能力取得 jingle、1UP jingle、boss 二階段變奏 `boss2`
- [todo] 分開音樂 / 音效音量 API：`KB.audio.setVolume({music, sfx})`、`getVolume()`

## research-qa（docs/）
- [doing] docs/DESIGN_REFERENCE.md：卡比系列（夢之泉 / 超級豪華 / 新星同盟）操作、暫停說明卡、能力招式表、關卡秘密設計、魔王階段的重點整理與對本作的具體建議
- [todo] docs/QA_REPORT.md：5 世界 playthrough、每房截圖檢視、bug 列表（含重現指令）

---
# Round 2（2026-09-11 19:45 啟動）— 檔案所有權重新分配

## ui-flow（src/ui.js, src/menu.js, src/main.js, 新 src/arena.js, src/game.js 僅 levelClear/結算/關卡開場 hook, index.html 新增 script）
- [doing] 過關結算畫面：分數、時間、擊敗數、大星星 x/3、獎勵分（清 HP 加成），逐項跳數字 + 音效；記 KB.save.best[levelId]
- [todo] 關卡開場橫幅：進入第一房時顯示「WORLD n  關名」2 秒（不阻擋操作）
- [todo] 競技場（Boss Rush）：標題選單新增「競技場」（通關 w5 或 debug 解鎖）；自選 1 能力 → 5 魔王連戰（隨機順序）→ 每戰之間休息房 3 顆番茄（整場共用）→ 計時 → 最佳時間存 KB.save.arena
- [todo] HUD 中文能力名改 14px；設定頁「畫面縮放」（自動 / 2x / 3x / 4x）與 F 鍵全螢幕（main.js resize）
- [todo] 選關面板顯示最佳分數

## mechanics（src/tilemap.js, src/levels.js, src/items.js, src/art/world.js, src/abilities.js 僅互動 hook, src/game.js 僅 draw 的暗房遮罩）
- [doing] 互動磁磚：`X` 硬磚（僅 hammer / stone / 火焰衝刺可破）、`F` 導火線（火焰類命中後沿線燃燒，燒到炸彈方塊 B 引爆）、`I` 冰磚（火焰類融化，可通行）、`D` 暗房標記（房間 dark:true → 畫面除卡比周圍半徑 40px 外變暗；spark 放電時半徑 96px 並持續 3 秒）
- [todo] 每世界至少 2 處使用新磁磚並給獎勵（點數星 / 食物 / 通往大星星的捷徑）
- [todo] 能力台座 KB.ITEMS.essence（顯示能力圖示的底座，碰到即取得能力，可重複），每世界放 1~2 個在需要該能力的機關前
- [todo] 傳送星 KB.ITEMS.warpstar：碰到後卡比騎星（呼叫 player.rideStar(path)，由 player2 提供）沿路徑飛到另一房 / 位置；w3、w4 各用 1 次
- [todo] level_check 支援新字元；playthrough 5 世界仍通關

## enemies-bosses2（src/enemies.js, src/bosses.js, src/art/enemies.js, src/art/bosses.js, src/entity.js）
- [doing] 新原創中魔王 1 種（例如「巨型飛羽鳥」或「鐵甲滾球」，2 招 + 受傷硬直，給 cutter 或 hammer），像素圖 40~48px
- [todo] 敵人掉落表：每敵人 dropTable（點數星機率、食物機率），由 Enemy.die 統一處理
- [todo] Extra 難度鉤子：讀 KB.session.extra 時敵人速度 ×1.2、投射物速度 ×1.2、魔王 HP ×1.25、二階段門檻 60%
- [todo] 魔王登場動畫（各 1 個：威斯比搖晃落葉、克拉寇雲聚集、魅塔騎士披風展開、迪迪迪從門走出、洛洛洛從兩側推箱進場）
- [todo] 敵人配置需求寫給 mechanics（哪一房放新中魔王）

## player2（src/player.js, src/const.js, src/input.js, src/art/kirby.js, tools/engine_test.py）
- [doing] 游泳打磨：入水 / 出水水花粒子與 sfx('splash')、水中氣泡、水中可吸入（吸力減半）、水中受傷
- [todo] player.rideStar(path, onArrive)：state 'ride'，沿點陣列飛行、拖尾粒子、無敵、到達時下星 + fx
- [todo] 梯子打磨：爬梯頂 / 底的過渡幀、在梯子上可攻擊（吐星）
- [todo] Extra 模式：KB.session.extra 時 maxHp 3、能力星回收時間減半
- [todo] 能力星彈跳手感：落地彈 2 次、8 秒後閃爍、10 秒消失（items.js 由 mechanics 擁有 → 寫需求）
- [todo] engine_test 新增測試，全 PASS

## audio2（src/audio.js, tools/audio_check.js, tools/render_music.py）
- [doing] 環境音：'splash' 'bubble' 'wind' 'torch' 'fuse'（導火線燃燒循環）'melt' 'hardblock'（打不破的硬磚叮）
- [todo] 音樂：'result'（結算 8 小節不循環）、'arena'（競技場 loop）、'arena_rest'（休息房短循環）、'w_intro' 開場短句、每世界第二首曲（'green2' 'castle2' 'island2' 'cloud2' 'dedede2'，供後半房間）
- [todo] 結算計數 sfx 'count' 與 'count_end'

## qa2（docs/QA_REPORT.md 追加 Round 2 章節, shots/agent_qa2/）
- [doing] 非無敵難度調校：每世界 × 3 能力（sword/fire/none）playthrough 不加 --godmode，記錄死亡點與原因 → 提出調整建議（敵人位置 / 尖刺 / 魔王傷害）
- [todo] Round 1 全功能回歸截圖（暫停卡 8 能力、能力圖鑑 8 頁、設定、選關、5 秘密房、5 二階段）
- [todo] 記錄 Round 2 新功能問題並轉交
