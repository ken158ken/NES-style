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
- [done] 新原創中魔王 1 種（例如「巨型飛羽鳥」或「鐵甲滾球」，2 招 + 受傷硬直，給 cutter 或 hammer），像素圖 40~48px
- [done] 敵人掉落表：每敵人 dropTable（點數星機率、食物機率），由 Enemy.die 統一處理
- [done] Extra 難度鉤子：讀 KB.session.extra 時敵人速度 ×1.2、投射物速度 ×1.2、魔王 HP ×1.25、二階段門檻 60%
- [done] 魔王登場動畫（各 1 個：威斯比搖晃落葉、克拉寇雲聚集、魅塔騎士披風展開、迪迪迪從門走出、洛洛洛從兩側推箱進場）
- [todo] 敵人配置需求寫給 mechanics（哪一房放新中魔王）

## player2（src/player.js, src/const.js, src/input.js, src/art/kirby.js, tools/engine_test.py）
- [done] 游泳打磨：入水 6 顆 / 出水 3 顆水花 + sfx('splash')、每 20 幀嘴邊氣泡、水中吸入（範圍 26px）與吐星、水中擊退 ×0.5、新精靈 kirby_swim_inhale
- [done] player.rideStar(path, onArrive)：state 'ride'，4px/frame 沿折線（轉角 lerp）、黃白拖尾、無敵不可操作、新精靈 kirby_ride + item_warpstar 星星、到達呼叫 onArrive 否則落地 + fx_sparkle
- [done] 梯子打磨：爬頂 / 底過渡幀 kirby_climb_top（6 幀）、梯子上按攻擊吐 proj_airpuff 不離開梯子
- [done] Extra 模式：建構時讀 KB.session.extra → maxHp 3；能力星回收時間常數 KB.PHYS.abilityStarLife = 600（減半在 items.js → 跨檔需求）
- [done] 能力星彈跳手感需求已寫給 mechanics（PROGRESS「player2 跨檔需求」1）
- [done] engine_test 新增第 33~38 組（+29 項），118/118 PASS；enemy_test 332/332；playthrough w1 / w3 --godmode 通關

## audio2（src/audio.js, tools/audio_check.js, tools/audio_test.html, tools/render_music.py）
- [done] 新 sfx：'splash' 'bubble' 'wind' 'torch' 'fuse' 'melt' 'hardblock' 'ride'（+'warp' 別名）'essence'
- [done] 結算計數 sfx 'count'（每 4 幀，節流放寬到 25ms）與 'count_end'
- [done] 每音效節流表 KB.audio.SFX_THROTTLE（原本全域 80ms 會吃掉 count / fuse）
- [done] 音樂：'result'（8 小節不循環，停在主和弦）、'arena'（BPM160 16 小節 loop）、'arena_rest'（ABAB 柔和 loop）、'w_intro'（2 小節 3 秒）、各世界第二首 'green2' 'castle2' 'island2' 'cloud2' 'dedede2'
- [done] 環境音層 KB.audio.ambient(key|null)：'water' 'wind' 'cave' 'castle'（獨立 ambBus 掛在 sfxBus 下，與 music 互不影響）
- [done] audio_check（+ambient/節流檢查）、render_music（+ambient 渲染與即時 API 檢查）、audio_test.html（+ambient 按鈕）；playwright 實機 0 console error
- [todo] 等 mechanics / ui-flow / player2 接線後，實機驗證切房 ambient 銜接與結算計數節奏（跨檔需求已寫入 PROGRESS.md）
- [todo] docs/SPEC.md 第 9 節名單需補新 sfx / music / ambient（總控處理，audio2 無權編輯 SPEC）

## qa2（docs/QA_REPORT.md 追加 Round 2 章節, shots/agent_qa2/）
- [doing] 非無敵難度調校：每世界 × 3 能力（sword/fire/none）playthrough 不加 --godmode，記錄死亡點與原因 → 提出調整建議（敵人位置 / 尖刺 / 魔王傷害）
- [todo] Round 1 全功能回歸截圖（暫停卡 8 能力、能力圖鑑 8 頁、設定、選關、5 秘密房、5 二階段）
- [todo] 記錄 Round 2 新功能問題並轉交

---
# Round 3：平衡與打磨（依 QA_REPORT Round 2 章節）

## balance-levels（src/levels.js, src/items.js, tools/playthrough.py, tools/level_check.js）
- [todo] 死亡熱點修正：w1 r0 sirkibble(75,9) 換 waddledee 或移到支線、番茄 (68,9)→(72,9)；w5 r0 shotzo(51,7) 移離主動線 / 斜坡加掩體、(48,9) 補番茄；w2 r0 poppybros 走廊加掩體或移位；w3 r0/r1 水池 glunk 右移 4 格、番茄移岸邊；w4 r2 出口門前 2 格淨空
- [todo] 主線番茄 / 食物補給：每房主線至少 1 個補給點（非支線高台 / 水底）
- [todo] 魔王房 spawn 與 bossPos 距離 ≥ 96px 且 ≤ 200px（w3/w4/w5 目前只差 16px）
- [todo] 新中魔王 rollarmor 放進 w4 r1 或 w5 r3（依 enemies-bosses2 建議）並加 gatekeeper
- [todo] w3 水域硬邊 / 雙水平線（P2-07 / P2-09）、w5 r0 與 r6 出生點壓金柱（P2-11）
- [todo] 驗收：--godmode 5 世界 cleared；不加 --godmode 時 sword 每世界 deaths ≤ 2（記錄實測數字）

## balance-enemies（src/enemies.js, src/bosses.js, src/entity.js, tools/boss_test.py, tools/enemy_test.py）
- [todo] 敵人行為分世界：w1~w2 的 sirkibble 不接刃、poppybros 投擲前 18 幀預警（舉手幀 + 最小距離 48px）、shotzo 射程 170→120 且開火間隔加長；以 KB.game.level id 或 spawnDef.a 參數控制強度
- [todo] 魔王曲線：魅塔騎士 recover 40→16 幀、vanishCD 180→120（保持 playthrough 可通關）；威斯比 hurtsPlayer 接觸框縮到樹幹 24px 寬且接觸傷害間隔 ≥ 45 幀；w3 克拉寇、w5 迪迪迪一階段給更多可攻擊窗口（落地硬直 +20 幀）
- [todo] 目標曲線（sword 不用無敵、機器人）：w1 打掉 ≥ 80%、w2 ≥ 70%、w3 ≥ 60%、w4 ≥ 50%、w5 ≥ 40%；用 boss_test --real 量測並記錄
- [todo] 暗房中敵人可見度：敵人自帶 8px 微光或眼睛發光（entity draw 時 KB.game.room.dark 判斷）

## polish-ui（src/ui.js, src/menu.js, src/arena.js, src/game.js 僅 draw 順序, src/tilemap.js 僅 drawWater alpha）
- [todo] 水中卡比可見：drawWater alpha 0.72→0.4，或水層後再畫一次玩家（半透明）
- [todo] 開場橫幅期間 toast 改排在橫幅下方（y+48）
- [todo] 標題選單面板不壓 logo（下移或縮小）
- [todo] 結算關名被面板切到、競技場結算魔王順序斷行（改兩行固定排版、名稱之間用「→」且不在字中斷）
- [todo] 結算「★」改用像素圖示 uifb_star
- [todo] 競技場登場字幕縮短為 60 幀（game.js loadRoom 讀 opts.arena 時 bossIntroT=60）

## qa3（docs/QA_REPORT.md Round 3, shots/agent_qa3/）
- [todo] Round 2 問題回歸 + 非無敵 deaths 量測（5 世界 × sword/fire）+ 魔王曲線量測 + 全流程截圖
