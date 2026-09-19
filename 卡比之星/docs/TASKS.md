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
- [done] 設定：畫面縮放整數倍（需要動 main.js resize，非 ui-menu 檔案 → 待總控指派）
- [done] 等 input.js 的 HELP 兩列長字縮短後，操作說明右欄可整欄回到 14px（目前自動降 12px + 截斷）

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
- [done] 等 levels-bosses 把 3 種新敵人放進關卡後，做實戰配置檢視（跨檔需求已寫入 PROGRESS.md）

## levels-bosses（src/levels.js, bosses.js, items.js, art/bosses.js, art/world.js, backgrounds.js）
- [done] 每世界 3 個隱藏收集品（大星星），存 KB.save.stars[levelId] = [bool×3]
- [done] 每世界 1 個秘密房（隱藏門 / 可破壞牆 / 需能力才能開）
- [done] 魔王二階段（HP<50% 變招、變色、音樂變奏鉤子 KB.audio.music('boss2')）
- [done] 中魔王房前奏演出（門鎖上、擊敗後開）
- [done] playthrough 5 世界皆通關，level_check 無 error

## audio（src/audio.js）
- [done] 暫停時音樂降到 30%、恢復；`pause`/`unpause` sfx 區分
- [done] 低血量(HP≤1) 警示循環音、能力取得 jingle、1UP jingle、boss 二階段變奏 `boss2`
- [done] 分開音樂 / 音效音量 API：`KB.audio.setVolume({music, sfx})`、`getVolume()`

## research-qa（docs/）
- [done] docs/DESIGN_REFERENCE.md：卡比系列（夢之泉 / 超級豪華 / 新星同盟）操作、暫停說明卡、能力招式表、關卡秘密設計、魔王階段的重點整理與對本作的具體建議
- [done] docs/QA_REPORT.md：5 世界 playthrough、每房截圖檢視、bug 列表（含重現指令）

---
# Round 2（2026-09-11 19:45 啟動）— 檔案所有權重新分配

## ui-flow（src/ui.js, src/menu.js, src/main.js, 新 src/arena.js, src/game.js 僅 levelClear/結算/關卡開場 hook, index.html 新增 script）
- [done] 過關結算畫面：分數、時間、擊敗數、大星星 x/3、獎勵分（清 HP 加成），逐項跳數字 + 音效；記 KB.save.best[levelId]
- [done] 關卡開場橫幅：進入第一房時顯示「WORLD n  關名」2 秒（不阻擋操作）
- [done] 競技場（Boss Rush）：標題選單新增「競技場」（通關 w5 或 debug 解鎖）；自選 1 能力 → 5 魔王連戰（隨機順序）→ 每戰之間休息房 3 顆番茄（整場共用）→ 計時 → 最佳時間存 KB.save.arena
- [done] HUD 中文能力名改 14px；設定頁「畫面縮放」（自動 / 2x / 3x / 4x）與 F 鍵全螢幕（main.js resize）
- [done] 選關面板顯示最佳分數

## mechanics（src/tilemap.js, src/levels.js, src/items.js, src/art/world.js, src/abilities.js 僅互動 hook, src/game.js 僅 draw 的暗房遮罩）
- [done] 互動磁磚：`X` 硬磚（僅 hammer / stone / 火焰衝刺可破）、`F` 導火線（火焰類命中後沿線燃燒，燒到炸彈方塊 B 引爆）、`I` 冰磚（火焰類融化，可通行）、`D` 暗房標記（房間 dark:true → 畫面除卡比周圍半徑 40px 外變暗；spark 放電時半徑 96px 並持續 3 秒）
- [done] 每世界至少 2 處使用新磁磚並給獎勵（點數星 / 食物 / 通往大星星的捷徑）
- [done] 能力台座 KB.ITEMS.essence（顯示能力圖示的底座，碰到即取得能力，可重複），每世界放 1~2 個在需要該能力的機關前
- [done] 傳送星 KB.ITEMS.warpstar：碰到後卡比騎星（呼叫 player.rideStar(path)，由 player2 提供）沿路徑飛到另一房 / 位置；w3、w4 各用 1 次
- [done] level_check 支援新字元；playthrough 5 世界仍通關

## enemies-bosses2（src/enemies.js, src/bosses.js, src/art/enemies.js, src/art/bosses.js, src/entity.js）
- [done] 新原創中魔王 1 種（例如「巨型飛羽鳥」或「鐵甲滾球」，2 招 + 受傷硬直，給 cutter 或 hammer），像素圖 40~48px
- [done] 敵人掉落表：每敵人 dropTable（點數星機率、食物機率），由 Enemy.die 統一處理
- [done] Extra 難度鉤子：讀 KB.session.extra 時敵人速度 ×1.2、投射物速度 ×1.2、魔王 HP ×1.25、二階段門檻 60%
- [done] 魔王登場動畫（各 1 個：威斯比搖晃落葉、克拉寇雲聚集、魅塔騎士披風展開、迪迪迪從門走出、洛洛洛從兩側推箱進場）
- [done] 敵人配置需求寫給 mechanics（哪一房放新中魔王）

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
- [done] 等 mechanics / ui-flow / player2 接線後，實機驗證切房 ambient 銜接與結算計數節奏（跨檔需求已寫入 PROGRESS.md）
- [done] docs/SPEC.md 第 9 節名單需補新 sfx / music / ambient（總控處理，audio2 無權編輯 SPEC）

## qa2（docs/QA_REPORT.md 追加 Round 2 章節, shots/agent_qa2/）
- [done] 非無敵難度調校：每世界 × 3 能力（sword/fire/none）playthrough 不加 --godmode，記錄死亡點與原因 → 提出調整建議（敵人位置 / 尖刺 / 魔王傷害）
- [done] Round 1 全功能回歸截圖（暫停卡 8 能力、能力圖鑑 8 頁、設定、選關、5 秘密房、5 二階段）
- [done] 記錄 Round 2 新功能問題並轉交

---
# Round 3：平衡與打磨（依 QA_REPORT Round 2 章節）

## balance-levels（src/levels.js, src/items.js, tools/playthrough.py, tools/level_check.js）
- [done] 死亡熱點修正：w1 r0 sirkibble(75,9) 換 waddledee 或移到支線、番茄 (68,9)→(72,9)；w5 r0 shotzo(51,7) 移離主動線 / 斜坡加掩體、(48,9) 補番茄；w2 r0 poppybros 走廊加掩體或移位；w3 r0/r1 水池 glunk 右移 4 格、番茄移岸邊；w4 r2 出口門前 2 格淨空
- [done] 主線番茄 / 食物補給：每房主線至少 1 個補給點（非支線高台 / 水底）
- [done] 魔王房 spawn 與 bossPos 距離 ≥ 96px 且 ≤ 200px（w3/w4/w5 目前只差 16px）
- [done] 新中魔王 rollarmor 放進 w4 r1 或 w5 r3（依 enemies-bosses2 建議）並加 gatekeeper
- [done] w3 水域硬邊 / 雙水平線（P2-07 / P2-09）、w5 r0 與 r6 出生點壓金柱（P2-11）
- [done] 驗收：--godmode 5 世界 cleared；不加 --godmode 時 sword 每世界 deaths ≤ 2（記錄實測數字）

## balance-enemies（src/enemies.js, src/bosses.js, src/entity.js, tools/boss_test.py, tools/enemy_test.py）
- [done] 敵人行為分世界：w1~w2 的 sirkibble 不接刃、poppybros 投擲前 18 幀預警（舉手幀 + 最小距離 48px）、shotzo 射程 170→120 且開火間隔加長；以 KB.game.level id 或 spawnDef.a 參數控制強度
- [done] 魔王曲線：魅塔騎士 recover 40→16 幀、vanishCD 180→120（保持 playthrough 可通關）；威斯比 hurtsPlayer 接觸框縮到樹幹 24px 寬且接觸傷害間隔 ≥ 45 幀；w3 克拉寇、w5 迪迪迪一階段給更多可攻擊窗口（落地硬直 +20 幀）
- [done] 目標曲線（sword 不用無敵、機器人）：w1 打掉 ≥ 80%、w2 ≥ 70%、w3 ≥ 60%、w4 ≥ 50%、w5 ≥ 40%；用 boss_test --real 量測並記錄
- [done] 暗房中敵人可見度：敵人自帶 8px 微光或眼睛發光（entity draw 時 KB.game.room.dark 判斷）

## polish-ui（src/ui.js, src/menu.js, src/arena.js, src/game.js 僅 draw 順序, src/tilemap.js 僅 drawWater alpha）
- [done] 水中卡比可見：drawWater alpha 0.72→0.4，或水層後再畫一次玩家（半透明）
- [done] 開場橫幅期間 toast 改排在橫幅下方（y+48）
- [done] 標題選單面板不壓 logo（下移或縮小）
- [done] 結算關名被面板切到、競技場結算魔王順序斷行（改兩行固定排版、名稱之間用「→」且不在字中斷）
- [done] 結算「★」改用像素圖示 uifb_star
- [done] 競技場登場字幕縮短為 60 幀（game.js loadRoom 讀 opts.arena 時 bossIntroT=60）

## qa3（docs/QA_REPORT.md Round 3, shots/agent_qa3/）
- [done] Round 2 問題回歸 + 非無敵 deaths 量測（5 世界 × sword/fire）+ 魔王曲線量測 + 全流程截圖

---
# Round 5：變身大爆發（2026-09-12）— 12 種新能力 + 特效系統
使用者指示：法律改名跳過；難度維持；重點是「腦洞大開的變身、特效不嫌多、融合動漫式刀槍魔法巨大化」。
| agent | 擁有檔案 | 內容 |
|---|---|---|
| vfx | src/vfx.js、src/abilities.js（既有 8 能力加特效）、src/game.js 僅 VFX 鉤子已預留 | KB.VFX 特效 API + 變身演出 + 既有能力特效強化 |
| weapons | src/abilities_weapons.js、src/art/kirby_weapons.js、src/enemies_weapons.js、tools/test_weapons.py | gunner 槍手、ninja 忍者、blade 居合、bow 弓 |
| magic | src/abilities_magic.js、src/art/kirby_magic.js、src/enemies_magic.js、tools/test_magic.py | mage 元素法師、time 時間、gravity 重力、clone 分身 |
| forms | src/abilities_forms.js、src/art/kirby_forms.js、src/enemies_forms.js、src/player.js（變身鉤子）、tools/test_forms.py | giant 巨大化、dragon 龍化、mech 機甲、ghost 幽靈 |
| audio5 | src/audio.js、tools/audio_check.js、tools/render_music.py | 12 能力全部招式音效 + 變身音 + 必殺 stinger |
| ui5 | src/menu.js、src/arena.js、src/ui.js | 圖鑑 / 競技場選能力分頁（20 能力）、暫停卡 5 列招式、HUD 新能力、變身名稱橫幅 |
| levels5（第二波） | src/levels.js、src/items.js | 12 種新敵人放進 5 世界 + 能力台座 |
| qa5（第三波） | docs/QA_REPORT.md | 全能力截圖驗收 |

---
# Round 6：系統深度（2026-09-12）— 混合能力 / 夥伴 / 元素反應 / 第六世界 / 進度系統
| agent | 擁有檔案 | 內容 |
|---|---|---|
| mix | src/abilities_mix.js、src/art/kirby_mix.js、src/player.js（吞下混合鉤子、select 長按鉤子）、tools/test_mix.py | 持有能力 A 時吞下能力 B → 混合能力（12 組合，各 3 招） |
| helper | src/helper.js、src/art/helper.js、tools/test_helper.py | 長按 select 把能力變成 AI 夥伴（使用該能力招式、可吸回、HP 與 HUD） |
| elements | src/elements.js、src/tilemap.js、src/entity.js、src/enemies*.js（僅加屬性標籤）、src/bosses.js（弱點）、src/art/world.js、tools/test_elements.py | 火燒草 / 木箱、冰凍水面可走、電擊水域、火融冰；敵人屬性弱點 ×2 / 抗性 ×0.5；魔王弱點 |
| world6 | src/levels.js（新增 w6）、src/art/world6.js、src/bosses_w6.js、src/const.js（THEMES）、src/art/backgrounds.js、src/audio.js（space 曲）、tools/level_check.js、tools/boss_test.py | W6「星之彼端」5 房 + 秘密房 + 3 大星星 + 新敵人 3 種 + 魔王「暗影卡比」（複製玩家能力）二階段 |
| progression | src/progression.js、src/ui.js、src/menu.js、src/game.js、src/arena.js、tools/test_progression.py | 能力等級 Lv1~3（重複取得升級：傷害 / 特效加碼、HUD 星）、連擊計數與結算 Style Rank、成就 20 條與圖鑑成就頁、選關第 6 節點 |
| qa6（第二波） | docs/QA_REPORT.md | 全系統驗收 |

---
# Round 7：覺醒與挑戰（2026-09-12）
| agent | 擁有檔案 | 內容 |
|---|---|---|
| mix2 | src/abilities_mix2.js、src/art/kirby_mix2.js、tools/test_mix2.py | 再 12 組混合（總 24），各 3 招 |
| awaken | src/awaken.js、src/art/kirby_awaken.js、src/progression.js、src/player.js（觸發鉤子）、tools/test_awaken.py | Lv4 覺醒：覺醒量表（連擊 / 命中累積）、滿了按 跳+攻 放覺醒招（20 基本能力各 1 招）、覺醒外觀光暈、HUD 量表 |
| helper2 | src/helper.js、src/art/helper.js、tools/test_helper.py | 雙夥伴、↑+SELECT 指令（跟隨 / 待命 / 突擊）、夥伴等級隨能力 Lv、夥伴間合體技 |
| extra | src/levels_extra.js、src/records.js、src/ui.js、src/menu.js、src/arena.js、src/game.js、src/bosses.js（Extra 變體）、src/tilemap.js（BURN_DECO cloud/dedede）、src/art/world.js、tools/test_extra.py | Extra 模式：每世界疊加層（更多敵人 / 新機關 / 尖刺）、魔王 Extra 變體（開場二階段 + 新招）、本機成績板場景（各世界 BEST / RANK / 時間、競技場、成就進度）、選關第 7 節點與解鎖條件 |
| world7 | src/levels_w7.js、src/art/world7.js、src/bosses_w7.js、src/const.js（theme dream）、src/art/backgrounds.js、src/audio.js、tools/level_check.js、tools/boss_test.py、tools/playthrough.py | W7「夢幻迴廊」：5 房 + 秘密房（6 魔王場地重製混合體 + 夢境機關）+ 真最終魔王「夢魘之核」三階段 + 真結局 |
| qa7（第二波） | docs/QA_REPORT.md | 全系統驗收 |

---
# Round 8：挑戰與個人化（2026-09-12）
| agent | 擁有檔案 | 內容 |
|---|---|---|
| ach2（選單整合） | src/progression.js、src/menu.js、tools/test_progression.py | 查「大王退治」誤觸發、成就擴到 40 條（含 Round 5~7 系統）、成就頁分頁；TitleMenu / SettingsMenu 整合其他 agent 的入口（挑戰模式 / 存檔槽 / 按鍵設定 / 卡比配色，以 KB.* 存在為條件） |
| awaken-mix | src/awaken.js、src/art/kirby_awaken.js、tools/test_awaken.py | 24 混合能力各 1 專屬覺醒招 |
| challenge | src/challenge.js、src/game.js、src/records.js、src/arena.js、tools/test_challenge.py | 時間攻擊（各世界計時 + 幽靈最佳線？至少 best）、無傷挑戰、挑戰塔 10 層（種子重混房間 + 修飾條件）、每日挑戰（日期種子）、Boss Rush Extra；成績板加挑戰頁 |
| saves-input | src/saves.js、src/keyconfig.js、src/input.js、tools/test_saves.py | 3 存檔槽（讀 / 建 / 複製 / 刪除、舊存檔遷移）、KB.SaveSelectScene、按鍵重映射場景（鍵盤 + 手把、衝突處理、還原預設） |
| skins | src/skins.js、src/player.js（draw 換精靈）、src/gfx.js（重著色快取）、tools/test_skins.py | 12 種卡比配色（成就解鎖）、KB.SKINS API、預覽、HUD 臉同步（若能不改 ui.js 就用精靈別名） |
| audio8 | src/audio.js、tools/audio_check.js、tools/render_music.py | 24 混合 sfx、20 覺醒招 sfx、挑戰模式 2 曲 + 計時 / 達成 jingle |
| qa8（第二波） | docs/QA_REPORT.md | 全系統驗收 |

---
# Round 9：操作重構（2026-09-15）— ↑ 長按飛行、空中可施展、每能力 ↑X / ↓X 齊全
使用者需求：① 每種能力「↑+X」與「↓+X」都要有各自的招；② 空中也能施展能力（人物同時下墜）；③ 一直按 ↑ = 一直按跳（持續飛行）。
| agent | 擁有檔案 | 內容 |
|---|---|---|
| player-input | src/player.js、src/input.js（HELP）、src/const.js（尾端新常數）、tools/engine_test.py | ↑ 長按飛行（地面 / 空中 / 漂浮中自動拍動）、漂浮中 X 用能力（不再吐氣）、空中 X / ↑X / ↓X 皆可出招且持續下墜、p.atkDir 快照、招式結束若 ↑ 仍按著自動回漂浮、門 / 梯優先 |
| abilities-basic | src/abilities.js、src/abilities_weapons.js、src/art/kirby.js、src/art/kirby_weapons.js、tools/test_weapons.py、tools/test_charge.py（僅新增） | 8 基本 + 4 武器：每種確保 X / ↑X / ↓X / 空中 X 四招齊全且空中可用 ↑X ↓X（缺的補原創招） |
| abilities-magic-forms | src/abilities_magic.js、src/abilities_forms.js、src/art/kirby_magic.js、src/art/kirby_forms.js、tools/test_magic.py、tools/test_forms.py | 8 種同上 |
| abilities-mix | src/abilities_mix.js、src/abilities_mix2.js、src/art/kirby_mix.js、src/art/kirby_mix2.js、tools/test_mix.py、tools/test_mix2.py | 24 混合：每種補齊 ↑X / ↓X / 空中 X（現在只有 3 招） |
| qa9（第二波） | docs/QA_REPORT.md | 44 能力 × 4 方向 × 地面 / 空中 驗收、飛行手感、通關 |

---
# Round 10：貼身招判定加倍（2026-09-17）
使用者需求：整體武器 / 變身的貼身攻擊範圍太小（劍、雷擊常被打死），**攻擊怪物的判定要大一倍左右，包含 ↑X / ↓X**；遠程攻擊維持現狀。
總控已改核心（勿再動）：`src/const.js` 尾端 `KB.PHYS.meleeScale = 2`；`src/entity.js` Hitbox 建構子自動規則：owner 'player' 且 `follow.type === 'player'`、原尺寸 ≤ 48×48、非 stone → w/h ×2（方向框 3/4 往前 1/4 往後、對稱框置中、高度置中；絕對框以原中心置中）。建立時 `melee:true` 強制放大（絕對座標的貼身招要加）、`melee:false` 強制不放大（全畫面 / 持續光環 / 分身本體 / 已經很大的）。判定框保留 `w0 / h0 / meleeScaled`。
| agent | 擁有檔案 | 內容 |
|---|---|---|
| melee-basic | src/abilities.js、tools/test_charge.py、tools/enemy_test.py（僅修尺寸斷言） | 8 基本能力（fire sword beam cutter spark stone ice hammer）五招逐一核對：貼身框都 ≈2×、遠程投射物不變、不該放大的標 melee:false、絕對座標貼身框加 melee:true；--hitbox 截圖看圖 |
| melee-weapons | src/abilities_weapons.js、tools/test_weapons.py | gunner ninja blade bow 同上（gunner 遠程維持；ninja / blade 貼身要 2×） |
| melee-magic-forms | src/abilities_magic.js、src/abilities_forms.js、tools/test_magic.py、tools/test_forms.py | mage time gravity clone / giant dragon mech ghost 同上（time 全畫面、clone 本體標 melee:false） |
| melee-mix | src/abilities_mix.js、src/abilities_mix2.js、src/awaken.js、src/helper.js、tools/test_mix.py、tools/test_mix2.py、tools/test_awaken.py、tools/test_skins.py（僅修尺寸斷言） | 24 混合能力貼身招同上；覺醒招 / 夥伴只核對不誤放大（夥伴 follow 非 player 不會自動放大，維持） |
| qa10（第二波，總控派） | docs/QA_REPORT.md | 全測試 + playthrough w1~w7 + 截圖對照 + build |

---
# Round 11：手機也能玩（2026-09-19）— 觸控虛擬按鍵、小螢幕縮放、PWA、選單觸控適配
使用者需求：**卡比之星做成手機也可玩的版本**，改完直接部署到 GitHub Pages（https://ken158ken.github.io/NES-style/卡比之星/ ），使用者出門在外用手機開網址就能玩。
基準（總控截圖 shots/ctrl/m_title_before.png）：iPhone 13 橫向 750×342 CSS px 時畫面只有 1 倍 256×224、沒有觸控按鍵、直向更慘。

## 總控已做的骨架（勿重做）
- `index.html` 已加 `<script src="src/touch.js">`、`<script src="src/pwa.js">`（在 main.js 之前）；`src/touch.js`、`src/pwa.js` 為空骨架，各 agent 整檔重寫自己的檔即可。
- `tools/mobile_shot.py`：Playwright 手機模擬截圖（裝置描述、觸控、DPR、多點觸控 CDP）。`--device "iPhone 13" --landscape`、`--device "Pixel 5"`（直向）、`--touch "tap x y 4; down 0 x y; move 0 x y; up 0; step n; key jump 2; shot name"`、`--dist`、`--url`、`--eval "js"`、`--run`。**截圖後一定 Read 看圖**。
- 建議驗證裝置：iPhone 13（390×844 / 橫 844×390，DPR 3）、Pixel 5（393×851 / 橫 851×393）、iPad Mini（橫 1024×768）。

## API 契約（跨 agent 共用；先照這個寫，改動要寫在 PROGRESS 跨檔需求）
1. **`KB.layout`**（screen agent，main.js）：`{ x, y, w, h, scale, portrait, mobile }` = canvas 在 viewport 的 CSS px 位置與縮放（scale 可為小數）；每次 resize 後更新並 `window.dispatchEvent(new Event('kb-resize'))`。`mobile` = 觸控裝置或視窗短邊 < 600px。
2. **`KB.input.setTouch(name, bool)`**（touch agent，input.js）：第三個輸入來源（與 raw / gamepad 同層，OR 起來），name ∈ left right up down jump attack select start；`KB.input.touchActive()` 回傳最近 2 秒內是否有觸控輸入；鍵盤 / 手把有輸入時 touch 覆蓋層可自動淡出。
3. **`KB.TOUCH`**（touch agent，touch.js）：
   - `available`（裝置支援觸控）、`active()`（覆蓋層目前顯示中）、`show()`、`hide()`
   - `layout = { mode: 'auto'|'on'|'off', side: 'right'|'left'（攻擊鍵在右／左手）, size: 0.8|1|1.2, opacity: 0.3~0.8 }`、`setLayout(partial)`（即時套用 + 存到 `KB.save.settings.touch`，saves.js 不必改：settings 是任意物件）
   - `buttons`：`dpad`（8 方向、單指滑動切換方向，死區）+ `jump`（Z）+ `attack`（X）+ `select`（Shift，丟能力／長按叫夥伴）+ `start`（Enter 暫停）+ `fs`（全螢幕，呼叫 `KB.toggleFullscreen`；iOS 無全螢幕 API 則隱藏或改「加到主畫面」提示）
   - 第一次觸控要呼叫 `KB.audio.unlock()`（iOS 需在 touchend / pointerup 內 resume）
   - 實作建議：DOM 覆蓋層（touch.js 自己 `document.body.appendChild` + 自注入 `<style>`，不必改 index.html，dist 單檔自然包含）、`pointer events` + `setPointerCapture` 或 touch events 多點；`touch-action:none`、禁長按選取 / 右鍵選單 / 雙擊縮放；按鍵擺在 `KB.layout` 之外的空白處優先（直向：畫面下方；橫向：畫面左右兩側），放不下時半透明壓在畫面邊緣；監聽 `kb-resize` 重新排版
4. **`KB.PWA`**（pwa agent，pwa.js）：`{ installed, canInstall, promptInstall(), standalone }`；只在 http(s) 註冊 sw（file:// 與 dist 單檔略過），sw 快取 index.html + src/*.js + assets/fonts 並「網路優先、失敗回快取」，版本字串在 sw.js 頂端，build.py / 部署改版時要更新。
5. UI 觸控判斷：`KB.TOUCH && KB.TOUCH.active()` 或 `KB.input.touchActive()`；提示文字用 `KB.input.hint(action)`（touch agent 在 input.js 加：觸控時回傳 'A'/'B'/'C'/'START' 等虛擬鍵名，否則回鍵盤名）。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| touch | src/touch.js、src/input.js、tools/test_touch.py（新）| 觸控虛擬按鍵覆蓋層（契約 2、3、5）：D-pad 滑動、四鍵 + 暫停 + 全螢幕、多點同時（左手方向 + 右手跳攻）、外觀像素風（圓鍵 + 標籤 A 跳 / B 攻 / C 丟 / ▶ 暫停，配色跟遊戲）、自動顯示規則（有觸控裝置就顯示，鍵盤 / 手把輸入後淡出，再觸控又出現；mode on/off 強制）、layout 設定（side / size / opacity）與存檔、iOS Safari 細節（-webkit-touch-callout none、gesturestart preventDefault、100dvh）；test_touch.py 用 mobile_shot 的 CDP 多點觸控驗證：按 D-pad 右 30 幀卡比 x 增加、按 A 跳 vy < 0、同時按右 + A、滑動切方向、鍵盤後淡出；三種裝置直橫向截圖看圖 |
| screen | src/main.js、index.html、src/gfx.js（僅需要時）| 契約 1：小螢幕縮放（mobile 時允許小數倍 = 填滿短邊、保持 256:224，最大化；桌機維持整數倍；settings.scale 固定倍率放不下時忽略）、直向時畫面貼上方留下方給按鍵（`KB.layout.portrait`）、橫向置中或偏上（留左右給按鍵；與 touch agent 協調：橫向若寬度足夠，canvas 高度填滿、左右各留 ≥ 110px）、`orientationchange` / `visualViewport` resize、safe-area（env(safe-area-inset-*)）、canvas 在小數倍時仍 `image-rendering: pixelated`（DPR 考量：canvas.style 尺寸用小數沒問題）、index.html：viewport-fit=cover / user-scalable=no / theme-color / apple-mobile-web-app-capable / apple-touch-icon（指向 assets/icons/icon-180.png，pwa agent 產）/ manifest link（assets/manifest.webmanifest）、body 禁選取禁捲動、`visibilitychange` 時清輸入並讓遊戲自動暫停（GameScene 有 paused 就 tap start 等價，沒有就至少不累積 acc）、手機效能：確認 60fps 主迴圈在 DPR 3 下 canvas 仍是 256×224（不要放大 backing store）；驗證：mobile_shot 三裝置直橫向截圖看圖 + engine_test |
| pwa | src/pwa.js、sw.js（根目錄）、assets/manifest.webmanifest、assets/icons/*（pillow 產 192 / 512 / 180 / maskable，畫像素卡比臉，原創）、tools/build.py、tools/mobile_shot.py（僅擴充）、README.md、說明.md | 契約 4；manifest（name 卡比之星、display fullscreen、orientation landscape、start_url ./index.html、scope ./、icons）；sw.js 快取清單由 build.py 從 index.html 的 script 標籤自動產生（`build.py` 新增：寫出 sw.js 的 ASSETS 陣列與版本 = 內容 hash）；dist 單檔仍能離線雙擊；README / 說明.md 加「手機遊玩」章節（網址、加到主畫面、觸控配置、橫向建議）；驗證：`python -m http.server` + mobile_shot `--url http://localhost:8000/index.html` 看 sw 註冊成功（`--eval "navigator.serviceWorker.controller?1:0"` 需重載一次）、Lighthouse 不必 |
| ui | src/ui.js、src/menu.js、src/keyconfig.js | 契約 5 的消費端：標題「PRESS START」與底部提示在觸控時改「點 START 或 A 開始」等（用 KB.input.hint）；操作說明加第 3 頁「觸控操作」（觸控時預設顯示該頁）；設定選單加「觸控按鍵：自動 / 開 / 關」「按鍵位置：右手 / 左手」「按鍵大小」「按鍵透明度」（呼叫 KB.TOUCH.setLayout；KB.TOUCH 不存在時隱藏）；暫停選單加「全螢幕」項（呼叫 KB.toggleFullscreen；iOS 不支援時顯示灰）；按鍵設定頁在觸控時加一行「觸控按鍵請到設定調整」；所有新中文字串跑 `font_subset.py --check`（缺字就跑 font_subset.py 重做，字集檔在 assets/fonts 算 ui agent 可改）；驗證：shot.py 與 mobile_shot 截圖看圖（設定頁、說明第 3 頁、暫停選單）+ test_saves / test_progression 不壞 |
| qa11（第二波，總控派）| docs/QA_REPORT.md | 全測試 + 三裝置直橫向截圖 + 觸控實測（CDP 多點）+ dist 單檔手機開 + http.server 下 sw + playthrough |
