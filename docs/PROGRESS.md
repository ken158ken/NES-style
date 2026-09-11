# 開發進度（PROGRESS）

> 由總控與各 agent 共同維護。每個里程碑追加一行；不要刪除歷史。時間格式 `2026-09-11 18:05`。

## 2026-09-11 審查結論（總控）
狀態：5 世界 × 4~6 房、8 能力、25 敵人類別、5 魔王、音樂音效齊全；`engine_test` 39/39 PASS；`playthrough w1` 可全程通關。
git 已初始化，基線 commit `c382e2a`。Playwright venv：`.venv/bin/python`。

### 發現的問題（依嚴重度）
1. **中文字在 Linux / 無細明體機器不可讀**：12px 中文（HUD「普通」、暫停選單、選關名稱、GameOver、說明頁）皆為細線。
   原因：gfx.js `renderTextCanvas` 以 alpha>110 門檻把反鋸齒字轉像素，Noto Sans CJK 12px 筆畫太細。→ ui-menu
2. 暫停選單過於陽春（只有 繼續 / 回到地圖），沒有操作說明、能力說明、音量 / 靜音、回標題。→ ui-menu
3. 標題只有 PRESS START；沒有「繼續遊戲 / 新遊戲 / 操作說明 / 能力圖鑑」選單。→ ui-menu
4. 操控手感：無 coyote time、無 jump buffer、落地無揚塵 / 擠壓、吸入無吸力手感反饋、漂浮無按鍵節奏感。→ player-feel
5. 魔王房鏡頭：魔王登場結束後若玩家還在左側，魔王會在畫面外（w1 room3 x=384 vs 鏡頭 16~272）。→ player-feel（camera）
6. 能力深度：每能力僅 1 招，缺少 Super Star 式的多招（上+攻、空中攻、蹲攻、蓄力）。→ abilities-enemies
7. 關卡深度：缺少隱藏要素（隱藏 1UP / 大開關 / 收集品 / 秘密房）、無中魔王前奏、魔王只有一階段。→ levels-bosses
8. 音訊：暫停時音樂未降音、缺低血量警示、缺能力取得小旋律、boss 第二階段無變奏。→ audio

### 本輪（Round 1）分工
| agent | 任務 | 狀態 |
|---|---|---|
| ui-menu | 中文可讀性修復、暫停選單重製、標題選單、遊戲內說明（?）、能力說明卡 | 完成 |
| player-feel | coyote / buffer / 落地與起跑特效 / 吸入反饋 / 鏡頭改良 / 手把 / 測試 | 完成 |
| abilities-enemies | 8 能力各加 2~3 招、敵人行為深化、新敵人 3 種 | 完成 |
| levels-bosses | 每世界隱藏要素、秘密房、魔王二階段、收集品存檔 | 完成 |
| audio | 暫停降音、低血量、能力 jingle、boss 變奏、menu 音 | 完成 |
| research-qa | 卡比系列設計參考文件、全 5 世界 QA 報告 | 完成 |

### Round 1 整合結果（總控，2026-09-11 19:40）
- 全部 6 agent 完成。整合驗證：`node --check` 全過、`level_check` 0 error、`engine_test` 89/89、`enemy_test` 332/332、`boss_test` ALL PASS、`playthrough w1~w5 --godmode` 全部 cleared（4256 / 9386 / 5801 / 8718 / 8945 幀，deaths=0，無缺圖）。
- 總控補做：input.js HELP 精簡（說明頁不再截斷）、player.js 移除座標式抖動（改 KB.inhaleWobble）、engine_test 抖動測試改檢查繪製偏移、game.js Door 補 `secret/back` 旗標、說明.md 更新、build 645KB。
- git：`de68693`（ui/player/audio/docs）→ `5f1133f`（abilities/enemies）→ `1790501`（test）→ 本次 commit（levels/bosses/items/art + 收尾）。
- 待使用者決定：DESIGN_REFERENCE 第 6 章的法律差異化（魔王 / 敵人 / 關卡名改原創名）。
- 已知小問題：HUD 能力中文名 12px 密集字（鐵鎚）仍略糊 → Round 2 ui；設定頁「畫面縮放」需改 main.js → Round 2 ui。

---
## ui-menu
- [2026-09-11 17:57] 完成：**中文渲染跨平台修復**（gfx.js 重寫 `renderTextCanvas`：4 倍字級離屏渲染 → 區塊覆蓋率 41% 二值化，筆畫一律 1px 實心；字型改黑體優先 `KB.ZH_FONT`，不再依賴細明體內嵌點陣；新增 `KB.TEXT_CFG` 可調參數與 `KB.clearTextCache()`；遮罩快取與顏色分離，`KB.text` / `KB.textWidth` 共用同一 key）。ui.js `UI.zhFont` 改用 `KB.ZH_FONT`。
  驗證：`shots/agent_ui/before_help.png`（修前，細線不可讀）vs `t2_help.png`、`t2_select.png`、`t2_gameover.png`、`t2_ending.png`、`t2_pause.png`（HUD「普通」清晰）；`engine_test.py` 39/39 PASS。下一步：暫停選單重製（KB.PauseMenu）。

- [2026-09-11 18:30] 完成：**暫停選單重製 / 標題選單 / 能力圖鑑 / 設定 / 遊戲內「?」提示 / 選關收集星**（新檔 `src/menu.js`，已加進 `index.html` 於 ui.js 之後）。
  - `KB.PauseMenu`：上半＝能力卡（圖示 + 中英名 + 2 行原創風味文字 + 招式表 3 列），下半＝2 列×3 欄選單（繼續 / 操作說明 / 回到地圖 / 音樂 / 音效 / 回到標題）；操作說明是子頁（重用 `UI.drawHelp`）。暫停只壓暗遊戲區（y<192），HUD 仍可見。`game.js` 只留開啟與轉呼叫。
  - 招式資料表 `KB.UI.ABILITY_HELP`（含 `flavour`）在 menu.js；**`KB.ABILITIES[key].desc / .flavour / .moves` 若存在優先採用**（abilities agent 的新招式已自動生效，見 `r4_pause_cutter.png`）。
  - `KB.TitleMenu`：繼續遊戲（有 `KB.save.cleared` 才出現）/ 新遊戲 / 操作說明 / 能力圖鑑 / 設定；`KB.AbilityGallery`（8 能力 ←→ 翻頁，卡比戴帽 = kirby_idle + hat_<key>、圖示、說明、招式、縮圖列）；`KB.SettingsMenu`（音樂 / 音效 0~10 格滑桿 + 按鍵提示開關，存 `KB.save.settings` 並 `KB.saveGame()`）。
  - 遊戲內提示：進新關卡第一房右上角 toast「ENTER：暫停／說明」3 秒（以 `game.frame` 計時），之後常駐 8×8「?」；取得新能力閃 1 秒。可由設定「按鍵提示」關閉。
  - 選關：每個節點下方 ★★★（已拿=黃、未拿=灰，讀 `KB.save.stars[levelId]`，無資料顯示 0/3）、通關旗；下方面板顯示「收集星 ★★★ x/3」。
  驗證：`shots/agent_ui/` 之 `q5_pause.png`、`r4_pause_cutter.png`、`r2_pause_none.png`、`final_pausehelp.png`、`r3_titlemenu.png`、`q9_g1.png`/`q9_g2.png`、`r1_s1.png`/`r1_s2.png`、`r2_toast.png`、`r3_qmark.png`、`final_select.png`；`engine_test.py` 89/89 PASS；`build.py` 產出 643KB。
- [2026-09-11 18:30] 完成：**QA 回報修正**（P1-04 / P1-05 / P2-12 / P2-13 + audio 新 API）。
  - P1-04 高筆畫中文糊：新增 `UI.MS = 14`（`UI.MS_SMALL = 12`），**所有選單 / 標籤 / 提示中文一律 14px**（標題 16px）；`UI.fitText` 改為「先照 14px → 放不下降 12px → 再放不下才截斷」，`UI.wrapLines` 提供中文逐字斷行；gfx.js 的英數混排從「只在 12px」放寬到 12~16px（`bmDY` 對齊點陣字）。實測 繼 / 續 / 圖 / 開 / 謝 / 遊 在 14px 皆可逐字辨認（`q5_pause.png`、`r2_ending.png`、`final_select.png`）。
  - P1-05 選關世界名超出右緣：標籤夾在 x = 8 ~ (256-8-寬)，改用深色底板取代 1px 描邊（12px 描邊會讓相鄰字糊在一起）；`mapNodes` 上移 6px 讓出下方資訊面板。
  - P2-12 PAUSE 標籤超框：改畫在 y = 2~16（整塊在畫面內）。P2-13 toast 超框：改為 x = 110、寬 140（110~250，夾在 4~252 內）。
  - audio 新 API 全部接上：暫停 `duck(true)` / 恢復 `duck(false)` + `sfx('unpause')`；返回 / 取消 `sfx('menu_back')`；設定頁音量用 `setVolume/getVolume`（0~10 格滑桿，暫停選單的開 / 關會記住原音量再還原）；HUD 於 HP ≤ 1 每 90 幀 `sfx('lowhp')`。UI 端先前為了「無分軌音量」做的 `KB.audio.music/sfx` 包裝已移除。
  - 暫停卡風味文字採用 `docs/DESIGN_REFERENCE.md` 2.2 的 9 段本專案原創文案。
  跨檔需求：① **player-feel / input.js**：`HELP` 有兩列說明過長，14px 與 12px 都塞不下 146px 欄位而被截成「…」——「滑鏟；站在平台上則穿下去」「十字鍵 / 搖桿移動，A、B 跳」，建議縮到 ≤10 個中文字（例如「滑鏟；平台上可穿下去」「十字鍵 / 搖桿；A、B 跳」）。② **abilities-enemies**：`KB.ABILITIES[key]` 可加 `flavour: ['第一行','第二行']`（≤13 字 / 行）覆寫暫停卡風味文字，`desc` 建議 ≤16 字。③ **levels-bosses**：`KB.save.stars[levelId] = [bool,bool,bool]` 已可直接顯示；若要做「最佳分數」請用 `KB.save.best[levelId]`（選關面板可再加一列）。
  未完成 / 已知問題：選關地圖上 W2 的星列與 W3 標籤底板有 1~2px 相疊（皆為深色底板，視覺上無影響）；暫停說明子頁為全畫面覆蓋（含 HUD），僅主選單保留 HUD。

## player-feel

- [2026-09-11 19:40] 完成：**跳躍手感**（coyote time 5 幀、jump buffer 6 幀、落地擠壓 scaleX/scaleY、落地揚塵 3~4 顆、起跑 / 急轉身煞車揚塵）。
  新常數集中在 `KB.PHYS`（coyote / jumpBuffer / landFrames / landSquash…）與新的 `KB.CAM`；**SPEC 第 10 節既有數值（walk 1.3 / run 2.2 / jump -4.4 / grav 0.24 …）一律未改**。
  驗證：`engine_test` 新增 17~21 項；截圖 `shots/agent_feel/land_01.png`（擠壓 + 揚塵）、`shots/agent_feel/skid.png`（煞車揚塵）、`shots/agent_feel/land_sword.png`（帽子跟著擠壓不浮空）。下一步：吸入反饋。
- [2026-09-11 19:55] 完成：**吸入反饋**（嘴前 40px 每 2 幀 1 顆粒子飛向嘴、被吸敵人 ±1px 抖動、吸到東西 `KB.game.freezeT = 2` hit-stop）。
  驗證：`engine_test` 第 22 組；截圖 `shots/agent_feel/inhale_01.png`。下一步：漂浮。
- [2026-09-11 20:05] 完成：**漂浮**（每次拍動 floatAnimT 歸零 + 吐 1~2 顆空氣粒子；`exhale` 結束後 8 幀 `exhaleLockT` 不可再漂；只有「攻擊鍵」吐氣，按 ↓ 或 ↓+攻擊都不吐氣；漂浮落地自動回 idle 並播放落地擠壓）。
  驗證：`engine_test` 第 23、24 組；截圖 `shots/agent_feel/float_01.png`。下一步：滑鏟。
- [2026-09-11 20:15] 完成：**滑鏟**（滑鏟中按跳取消成跳躍並保留 70% 水平速度、撞牆立即停止並以 0.8px/frame 回彈 3 幀 + 撞擊粉塵；取消 / 結束時一併清掉滑鏟 hitbox）。
  驗證：`engine_test` 第 25、26 組。下一步：受傷反饋。
- [2026-09-11 20:25] 完成：**受傷反饋**（`KB.game.freezeT = 3` hit-stop、`KB.game.shake = 4`、卡比 `opts.tint='#fff'` 閃白，閃白期間不受無敵閃爍影響而消失）。
  驗證：`engine_test` 第 27 組；截圖 `shots/agent_feel/hurt.png`。下一步：鏡頭。
- [2026-09-11 20:45] 完成：**鏡頭改良**（`game.js` 只動 `updateCamera`）：a) 前瞻量依 |vx| 在 12→40px 間以 lerp 0.05 平滑；b) 垂直死區 40%~70%，超出才跟；c) 魔王房以玩家 / 魔王中點取景，夾限保證玩家距畫面邊緣 ≥ `KB.CAM.bossMargin`(28px) 且鏡頭盡量偏向魔王。
  驗證：`engine_test` 第 29~31 組；重現指令 `.venv/bin/python tools/shot.py --scene game --level w1 --room 3 --steps 200 --out shots/agent_feel/boss_cam.png`
  → 修正前 `shots/agent_feel/boss_cam_before.png`（cam.x=16，魔王在畫面外）；修正後 cam.x=36（已盡量右偏）；
  `shots/agent_feel/boss_cam_walk.png` 顯示玩家往前走一小段後魔王即入鏡且玩家仍完整可見。下一步：輸入。
- [2026-09-11 21:00] 完成：**輸入**（`KB.input.BINDINGS`（action→code 陣列）、`rebind(action, codes)`（會自動解除其他動作的衝突鍵）、`keyNames(action)`、`codeName()`、`resetBindings()`、`ACTIONS` / `ACTION_NAMES` 供設定頁；手把加類比搖桿死區 0.35 並與 D-pad 同時支援，`KB.input.GAMEPAD` 公開對應（A·B=跳、X·Y=攻擊、L/R/Back=select、Start=start）、`gamepadActive()`）。
  `HELP` 陣列格式未變（仍是 `[鍵, 說明]` 字串對），只更新「↓ + 跳」說明並新增一列「手把」（共 8 列，ui 說明頁 y=36+18*7=162 仍在 172 分隔線之上）。
  驗證：`engine_test` 第 32 組（含 HELP 格式檢查）。下一步：平台下穿。
- [2026-09-11 21:10] 完成：**平台下穿**（站在單向平台 `=` / 梯子頂端時 ↓+跳 ＝穿下去 7 幀；實心地面 / 斜坡 ↓+跳 仍為滑鏟）。
  新增 `KB.physics.onPlatformOnly()` 與 `KB.physics.groundWithin()`（jump buffer 判定用）於 `tilemap.js`。
  驗證：`engine_test` 第 28 組；截圖 `shots/agent_feel/dropthrough.png`。
- [2026-09-11 21:20] 收工檢查：`.venv/bin/python tools/engine_test.py` → **89/89 PASS**（原 39 項全保留 + 新增 50 項手感 / 鏡頭 / 輸入測試；`--shots` 另存 `shots/engine/*.png`）。
  `tools/playthrough.py --level w1 --ability sword --godmode`：**目前卡在 w1 room 2**，原因不是手感改動（見下方「跨檔需求」1）；
  以「暫時移除 secret 門」的同一支腳本重跑 → `LEVEL CLEAR at frame 12043, deaths=0`，確認手感 / 鏡頭改動不影響通關。

### 跨檔需求（player-feel → 總控 / 其他 agent）
1. **`src/levels.js` + `tools/playthrough.py`（levels-bosses）**：w1 room 2 新增的隱藏門 `{x:52, y:2, secret:true}` 與魔王門 `{x:58, y:9}` 只差 6 格，
   `playthrough.py` 的 `any_door_ahead()` 一律追「最近的門」，卡比會在 x≈870 左右左右擺盪、永遠走不到魔王門（`maxX={2: 865.5}`，15000 幀未通關）。
   建議二選一：(a) `any_door_ahead()` 忽略 `secret: true` 的門；(b) 把隱藏門挪到離主線門更遠的位置。
   （驗證：把 `secret` 門濾掉後同一支腳本 w1 順利 `LEVEL CLEAR`，deaths=0。）
   另外 `--level w2` 也停在 room 2（maxX 1267），同樣不是手感改動造成，請 levels-bosses 一併看一下。
2. **`src/entity.js`（abilities-enemies）**：被吸入的敵人抖動目前是在 `player.js` 直接對 `e.x/e.y` 加 ±1px 隨機位移。
   比較乾淨的作法是在 `Entity.draw` / `Enemy.draw` 繪製時加偏移（不動碰撞位置），例如：
   `const j = this.beingInhaled ? [(Math.random()-0.5)*2, (Math.random()-0.5)*2] : [0,0];`
   然後 `g.spr(this.spr, this.cx + j[0], this.bottom + j[1], ...)`。若採用，請通知我把 player.js 的位移拿掉。
3. **`src/levels.js`（levels-bosses）— 魔王房同框**：w1 room 3 寬 32 格（512px＝2 個畫面），玩家 spawn 在 x=3、魔王在 x=24，
   兩者相距 348px > 畫面寬 256px，**幾何上不可能同框**。鏡頭已改成「保證玩家可見 + 盡量偏向魔王」，但玩家站在出生點時魔王仍在畫面外。
   建議魔王房寬度 ≤ 16 格，或把 spawn / bossPos 拉近到相距 ≤ 200px（其他世界 w2 room 5 spawn 29 / boss 3 也有同樣問題）。
   若要保留大房間，另一個選項是由 ui-menu 在畫面邊緣加「魔王方向箭頭」提示（繪製不在我的檔案範圍內）。
4. **觀察（非請求）**：稍早 `src/art/enemies.js` 一度含有未清掉的 `@@NEW@@` 標記導致整支檔案語法錯誤（敵人精靈全部變洋紅方塊）；目前已恢復正常。
   建議收工前跑一次 `for f in src/*.js src/art/*.js; do node --check "$f"; done`。

## abilities-enemies

- [2026-09-11 18:20] 完成：**8 能力全部多招化（共 26 招）+ 對應卡比動畫幀 + moves/desc 資料**。
  招式輸入不需要動 player.js：`onAttack` 內以 `KB.input.down('up')` / `!p.onGround` 判斷，蹲攻走既有 `onCrouchAttack`，
  蓄力用 `def.hold` + 動態 `def.maxHold`（非按住招式設 0），動畫用 `def.anim` 切換。
  - 劍：揮砍 / 空中迴旋斬 / ↑上挑斬 / 滿血劍氣（proj_swordwave，僅 HP 全滿）
  - 鐵鎚：掄鎚 / 蓄力 40 幀大迴旋（3 段判定、邊轉邊前進）/ 空中落地震（震動 5 + 左右衝擊波）/ ↓巨鎚敲擊
  - 火焰：噴火 / ↓火焰衝刺（火球衝 40 幀、可破方塊）/ 空中火焰旋轉
  - 冰凍：噴冰 / ↓冰塊飛踢（把凍結敵人變冰塊飛踢出；無凍結敵人則射冰彈）/ 空中冰晶散射（5 道扇形）
  - 光束：甩光束 / 蓄力 45 幀星潮光束（穿透）/ ↓牽星光環（命中有能力敵人 → 直接取得其能力）
  - 刀刃：迴旋刃 / ↑上拋刃（上升與落回各一次判定）/ ↓或空中下劈（兩段判定）
  - 電擊：放電（放電中可慢走 moveSpeed 0.5）/ 蓄力 45 幀電擊波（96×80、20 幀）
  - 石頭：變石（每次隨機 3 種外觀）/ 斜坡自動加速滾動（dmg 6→8）/ 再按 X 解除
  新增卡比精靈：`kirby_attack_sword_spin/sword_up/hammer_spin/hammer_drop/fire_dash/fire_spin/ice_kick/ice_burst/beam_charge/beam_capture/cutter_up/cutter_chop/spark_burst`、`kirby_stone_1~3`；
  新增投射物 `proj_swordwave / proj_beamwave / proj_feather`。蓄力招已接 audio 的 `sfx('charge')` / `sfx('charge_ready')`。
  驗證：`tools/enemy_test.py --only abilities` 63/63 PASS（每招都有「命中 waddledee 會死」＋「攻擊結束回到正常狀態」）；
  截圖 `shots/agent_ab/sword_swing_01.png`（劍氣）、`sword_spin_01.png`、`hammer_spin.png`、`hdrop_01.png`（落地震衝擊波）、
  `fire_dash_01.png`、`beam_wave.png`、`spark_burst.png`、`cutter_chop.png`、`stone_form.png`、`sheet_attack.png`/`sheet_attack2.png`/`sheet_stone.png`。
  下一步：敵人行為深化與新敵人。

- [2026-09-11 18:30] 完成：**敵人行為深化（11 種）+ 被吸入掙扎 + 原創新敵人 3 種**。
  - 新增 `Baddie.notice(range,dy)`：距離 <96px 進入警戒（首次冒黃色驚嘆火花），各敵人自行決定反應。
  - Waddle Dee 受驚小跳 + 加速 1.8×、背後靠太近會回頭；Waddle Doo 光束改 **6 道扇形掃射（-95°→+25°）** 並會轉頭盯人；
    Hot Head / Chilly / Snowly 逼近到攻擊距離就停（遠程型不貼身）；Rocky 察覺後輾過去；
    Sir Kibble **接回迴旋刃**（catch → 冷卻縮到 24 幀、白色火花）；Poppy Bros 炸彈改 **拋物線瞄準玩家**（固定上拋初速回推水平速度）；
    Blade Knight 新增中距離「突刺衝鋒」；Bonkers 新增第二招「大跳撲擊」（落地左右兩道衝擊波）；
    Mr. Frosty 新增第二招「寒霜吐息」（42×20 凍結判定，近身第 3 次攻擊觸發）。
  - 被吸入掙扎：`KB.inhaleWobble(e)`（entity.js）每 4 幀左右擺動 ±2px、垂直 ±1px 隨機抖，**純繪製偏移**，Enemy.draw / Baddie.draw 共用。
  - 新敵人：`spikeball` 滾刺球（無能力，hp3，不怕懸崖、察覺後 2.3 速衝撞、貼圖會旋轉）、
    `dartwing` 飛羽鳥（無能力，hp2，停在玩家斜上方投擲瞄準的 `proj_feather`）、
    `snowly` 雪人（給 **ice**，hp3，噴 34×18 凍結寒霧）。三者各有 2 幀走 / 2 幀攻擊像素圖。
  驗證：`tools/enemy_test.py` **331/332 → 全部 PASS**（新增 spikeball/dartwing/snowly 共 32 項）；
  截圖 `shots/enemy_spikeball.png`、`shots/enemy_dartwing.png`、`shots/enemy_snowly.png`、`shots/agent_ab/sheet_spikeball.png`/`sheet_dartwing.png`/`sheet_snowly.png`。
  下一步：等 levels-bosses 把新敵人放進關卡後再看實戰配置。

- [2026-09-11 18:35] 完成：**收工驗證**。`tools/engine_test.py` 89/89 PASS、`tools/enemy_test.py` 全 PASS、
  `tools/playthrough.py --level w1 --ability hammer --godmode` → `LEVEL CLEAR`（29641 幀、deaths=0、missing sprites: []）。
  `node --check src/{abilities,enemies,entity}.js src/art/{kirby,enemies}.js` 全部通過。

#### 跨檔需求（abilities-enemies → 其他 agent）
- **levels-bosses**：請把新敵人放進關卡 —— `spikeball`（建議 w2/w5 有斜坡或長直道的房間，會滾下懸崖）、
  `dartwing`（建議 w3 浮島 / w4 空中房，會在玩家頭上盤旋丟羽刃）、`snowly`（建議 w2/w4，吸入可拿 ice）。
  生成格式同其他敵人：`{t:'spikeball', x, y}`。三者都已註冊在 `KB.ENEMIES` 且 `enemy_test` 全 PASS。
- **player-feel**：被吸入敵人的抖動已改成 `src/entity.js` 的 `KB.inhaleWobble(e)`（純繪製偏移，水平 ±2 每 4 幀、垂直 ±1 隨機），
  `Enemy.draw` 與 `Baddie.draw` 都已套用 → **player.js `updateInhale` 裡那兩行 `e.x += (Math.random()-0.5)*2; e.y += ...` 可以移除**（那會動到碰撞框）。
- **ui-menu**：`KB.ABILITIES[key].moves`（`[['X','招名'],…]`，3~4 招）與 `.desc`（一句話風味描述）8 個能力都已補齊，
  `enemy_test` 有一項專門守住這個資料格式。
- **levels-bosses（磁磚約定回覆）**：目前 8 能力的招式都不依賴新磁磚字元；火焰衝刺 / 冰彈 / 星潮光束 / 鎚類招式都已設 `breakBlocks`，
  會打掉 `*`（星星）與 `B`（炸彈）方塊。若之後要做「導火線 F / 暗房 D / 硬磚 X」，判定框的 `kind` 可用 `fire` / `spark` / `hammer` 判斷。


## levels-bosses
（agent 在此追加）

- [2026-09-11 20:10] 完成：收集品系統。新增 `KB.ITEMS.bigstar`（`item_bigstar` 16×16 兩幀閃爍，畫在 art/items_ui.js，帶淡黃光暈）；
  拾取 → 粒子 + `sfx('bigstar')` + toast「大星星 x/3」，寫入 `KB.save.stars[levelId] = [bool,bool,bool]`（依 `a` 參數 0/1/2）並 `KB.saveGame()`；
  建構時查存檔，已拿過的直接 `dead=true`（不需要 game.js 鉤子）。5 世界各 3 顆。
  驗證：`node tools/level_check.js`（新增「每關剛好 3 顆、a 為 0/1/2 不重複」檢查）；`shots/agent_lv/w1r0_star.png`、`w3r2_star.png`、`w5r0_alcove.png`。下一步：秘密房。
- [2026-09-11 20:25] 完成：5 間秘密房（皆掛在該關 rooms 最後、標 `secret:true, noBoss:true, music:'secret'`，內含 ★3 + 1UP + 番茄）。
  進入方式：w1 天空之門（漂浮）／ w2 開關方塊解鎖的地面門 ／ w3 水底門 ／ w4 雲海最高處的門 ／ w5 炸彈方塊牆後的門。
  新增 `KB.ITEMS.switchblock`（被攻擊 → `KB.unlockDoors` 解鎖同房 locked 門）與 `KB.drawDoorLocks`（locked 門畫鎖鏈 + 掛鎖）。
  驗證：`shots/agent_lv/w1r2_secretdoor.png`、`w1r4_secret.png`、`w2r3_switch.png`、`w2r3_lockeddoor.png`、`w3r1_waterdoor.png`、`w4r2_secretdoor.png`、`w5r1_bwall.png`。下一步：中魔王前奏。
- [2026-09-11 20:40] 完成：中魔王前奏。`KB.ITEMS.gatekeeper` 實體：進房時把 `music('miniboss')` 切上去，房內還有活著的 MiniBoss 時出口門維持 `locked:true`（門上畫鎖鏈、玩家去開會 toast「門被鎖住了…」），
  中魔王倒下就 `fx_sparkle` + `sfx('unlock')` + toast 解鎖並切回關卡曲。放在 w2 r2（Bonkers）、w3 r2（Mr. Frosty）、w5 r3（兩隻）。
  level_check 新增「locked 門必須有解鎖實體」「有 gatekeeper 必須有中魔王」檢查。驗證：`shots/agent_lv/w2r2_gate.png`。下一步：魔王二階段。
- [2026-09-11 21:05] 完成：5 魔王二階段（Boss 基底加 `phase` / `iv(n)` / `enterPhase2()`）。HP < 50% 觸發：`KB.game.shake=6`、`sfx('phase2')+sfx('boss_hurt')`、
  `music('boss2')`（w5 為 `finalboss2`，SONGS 沒有時保持原曲不切）、toast、精靈疊一層會呼吸的紅色調（不是純剪影）＋怒氣粒子；所有招式間隔 ×0.7。
  新招：威斯比『暴風』大蘋果三連 + 兩處竄根；洛洛洛&拉拉拉同步推箱 + 把箱子射出去；克拉寇『雷雨』灑雨 + 兩道鎖定閃電後接俯衝；
  魅塔騎士『龍捲』貼地龍捲 + 『劍氣三連』三道不同高度的刀刃；迪迪迪『暴走』吸入拉人後跳躍震波三連。
  驗證：`tools/boss_test.py --runs 3` → ALL PASS（含新增的 phase2 / mid 測試）；截圖 `shots/agent_lv/phase2_*.png`。下一步：關卡微調與工具。
- [2026-09-11 21:20] 完成：QA P0-01 魅塔騎士迴避過強。`vanishCD`（消失後 180 幀內不能再消失）、`evadeLock`（受傷後 30 幀不能 vanish / backstep）、
  新增 `recover` 狀態（vanish / backstep 結束後 40 幀硬直、無碰觸傷害，是玩家的攻擊窗）。
  驗證：`playthrough.py --level w4 --ability sword --godmode --maxframes 30000` → cleared=True（frame 5676）；`boss_test.py --boss metaknight` fight 3/3、mid 1/1 PASS。
- [2026-09-11 21:35] 完成：關卡微調。每世界新增一條上路分支（w1 r2 天空階梯→秘密門、w2 r2 x=20~45 高空平台、w3 r2 x=40~53 浮島階梯、w4 r3 x=20~49 雲階梯、w5 r1 x=40~69 高空平台），
  沿途鋪點數星並補飛行敵人。放入 abilities-enemies 的新敵人：spikeball ×4（w2 r0/r2、w5 r0/r1）、dartwing ×4（w3 r0/r2、w4 r0/r2）、snowly ×4（w2 r1/r3、w4 r1/r3）。
  另依 player-feel 回報把魔王房進場點拉近：w1 r3 spawn [16,9] / bossPos [27,9]（160px）、w2 r4 spawn [15,9] / bossPos [3,6]（192px），對應的 boss 門落點同步改。
  驗證：`node tools/level_check.js` → 0 error；`shots/agent_lv/w1r3_bossframe.png`、`w2r4_bossframe.png`（登場後玩家與魔王同框）。
- [2026-09-11 21:50] 完成：工具。level_check 改用 `bossRoom` 旗標判定魔王房（秘密房可掛在最後）、新增 bigstar 3 顆 / a 不重複、locked 門要有解鎖實體、
  秘密房 noBoss + 回程門、魔王房進場點與 bossPos ≤200px（同框）等檢查。
  playthrough.py：預設 `--maxframes 30000`；主路線忽略 secret 門（用 `to.room` 反查 `room.secret/noBoss`）；`door_near()` 改用遊戲自己的 `KB.game.doorAt`
  （原本「距離 <10」比遊戲的 <8 寬鬆，w5 r2 出口會卡成「站在門口按上卻進不去」的無限迴圈）；`--godmode` 加上不會摔死 + 掉了的能力補回來；
  遇到上鎖的門會先去打中魔王（有武器貼身砍／沒武器保持 100px 吸他丟的彈藥／被逼到牆角改用漂浮鑽過去）；掉能力會去撿能力星（有追星上限避免尖刺床死循環）；新增 `--collect`。
  boss_test.py：新增 `[phase2]`（打到 40% 血 → phase===2 且該魔王的新招狀態出現，觀察期 godmode 避免卡比死掉重載房間）與
  `[mid]`（中距離玩家：刀刃 + 依魔王保持 30~40px（`MID_GAP`）+ 前後游走）兩組測試；inhale 吐歪了會重來。
- [2026-09-11 21:55] 完成：QA P1-03 cloud 背景垂直房。`KB.BG.cloud` 的彩虹 / 遠雲 / 雲海表面 y 全部加上夾值，雲海表面固定在畫面下半（96~VH-8），
  並新增 `bg_cloud_deep` 小雲層鋪在雲海之下（原本 camY 大時下半屏是一整片純白）。驗證：`shots/agent_lv/w4r1_bg.png`。
- [2026-09-11 22:10] 完成：機器人卡關修正（都在 tools/playthrough.py）。
  (1) `door_near()` 改用遊戲自己的 `KB.game.doorAt`（原本「距離 <10」比遊戲的 <8 寬鬆 → w5 r2 出口「站門口按上進不去」的死循環）；
  (2) 走到門附近先「對準」再按上（|dx| > 3 就一次走一幀），避免站偏；
  (3) 門在上方時的漂浮改成「連續點跳」`frames % 8 < 2`（原本按住 20 幀只會拍一次翅膀 → w2 螺旋塔 / w5 王座階梯爬不上去）。
- [2026-09-11 22:20] 完成：克拉寇二階段平衡。二階段循環原本是 `storm, swoop, lightning, low, storm, rain`（雷雨結束會接俯衝 → 等於連兩次俯衝），
  普通玩家樣本 3 個裡會輸 1 個；改成 `storm, low, lightning, low, rain, swoop`（每招之間都留一次低空盤旋的攻擊窗），
  `boss_test --boss kracko --runs 3` 連跑兩輪皆 3/3 PASS。
- [2026-09-11 22:45] 完成：二階段平衡回歸修正（`boss_test` 的「普通玩家」樣本每一場都要贏）。
  發現三處是我把「玩家的空檔 / 預警」也一起縮短造成的，全部改回不縮短：
  迪迪迪的 `dizzy`（暈眩＝唯一攻擊窗）與掄鎚 16 幀預備動作、克拉寇閃電的 30 幀電火花預警；
  另外拔掉迪迪迪 `rampage`（二階段吸入起手）的本體碰觸傷害，威斯比『暴風』的竄根由 3 處減為 2 處、循環裡只出現一次。
  boss_test 也補上三個玩家反射動作：躲竄根預警（讀 `boss.roots` 的噴土期）、躲高速衝過來的魔王本體（用上一幀位置算速度）、
  魔王張嘴吸（`inhale` 與 `rampage`）就往反方向走；中距離模型改成「魔王走近就退開」並依魔王設定距離（`MID_GAP`，迪迪迪 40px 以避開掄鎚）。
  驗證：`tools/boss_test.py --runs 3` 連跑 5 次皆 ALL PASS。
- [2026-09-11 22:55] 完成：最終驗證。
  `node tools/level_check.js` → 0 error / 1 warning（既有的拉拉拉出生點提示）；
  `tools/boss_test.py --runs 3` → ALL PASS（連續 5 次）；
  `playthrough.py --level wN --ability sword --godmode` 五世界皆 cleared=True（最後一輪 w1 4256 / w2 8666 / w3 6005 / w4 8171 / w5 11465 幀，deaths=0、missing sprites 空）；
  `playthrough.py --level w1 --collect` → cleared=True 且 `stars: {"w1":[false,true,false]}`（存檔寫入正常）；
  `tools/build.py` → dist/卡比之星.html 644 KB。


### 大星星 / 秘密房 位置一覽
| 關 | ★ | 房（房號 名稱）| 磁磚座標 | 取得方式 |
|---|---|---|---|---|
| w1 | a0 | r0 起點草原 | (54, 2) | 池塘上方 row3 的 `===` 平台，要漂浮上去 |
| w1 | a1 | r1 星星森林 | (35, 9) | 星星方塊牆（x=33 / x=41）後的密室，要打破方塊 |
| w1 | a2 | r4 星星洞窟（秘密房）| (13, 4) | r2 上路階梯盡頭 (52,2) 的天空之門 |
| w2 | a0 | r0 古堡玄關 | (60, 2) | 站 x=58~63 的拱窗平台往上漂 |
| w2 | a1 | r1 螺旋塔 | (26, 11) | 星星方塊 x=24 後的塔內密室 |
| w2 | a2 | r5 古堡寶物庫（秘密房）| (8, 3) | r3 閣樓 (40,4) 的開關方塊 → 解鎖地面 (52,9) 的門 |
| w3 | a0 | r0 海濱沙灘 | (25, 10) | 第一座水池的池底（要潛到最下面一格）|
| w3 | a1 | r2 浮島跳躍 | (51, 2) | 上路 x=40~53 階梯平台的最高處 |
| w3 | a2 | r5 海底寶窟（秘密房）| (12, 3) | r1 長水道池底 (26,10) 的水中之門 |
| w4 | a0 | r0 雲海入口 | (38, 2) | 站 x=36~40 的雲平台往上漂 |
| w4 | a1 | r1 泡泡塔 | (26, 1) | 塔頂星星方塊 x=24 後的密室 |
| w4 | a2 | r5 雲上寶庫（秘密房）| (11, 3) | r2 雲海最高處 (75,1) 的門 |
| w5 | a0 | r0 城門 | (75, 3) | 打破 (73,5) 星星方塊後漂進天花板閣樓 |
| w5 | a1 | r2 地下水牢 | (20, 10) | 第一座水牢的池底 |
| w5 | a2 | r6 大王的私房金庫（秘密房）| (11, 3) | r1 x=73 炸彈方塊牆後的門 (70,9) |

中魔王門鎖（`gatekeeper` + `locked` 門）：w2 r2 炸彈迴廊（Bonkers，出口 x=76）、w3 r2 浮島跳躍（Mr. Frosty，出口 x=93）、w5 r3 雙小魔王之間（兩隻，出口 x=60）。

### 跨檔需求（給總控 / 其他 agent）
- **game.js `Door`**：建議把 levels.js 門定義的 `secret` / `back` 旗標複製到 Door 實體上（目前只複製 `locked`）。
  現在 playthrough.py 是用 `door.to.room` 反查 `level.rooms[r].secret` 繞過去的；ui / 除錯工具若要區分主線門與隱藏門會比較麻煩。
- **ui-menu**：選關畫面請讀 `KB.save.stars[levelId]`（長度 3 的布林陣列，可能 undefined）顯示 ★ x/3。
- **audio**：已使用 `music('boss2'/'finalboss2'/'miniboss'/'secret')` 與 `sfx('phase2'/'unlock'/'bigstar'/'oneup')`；
  `KB.ITEMS.oneup` 原本呼叫的 `sfx('1up')` 已改成 `sfx('oneup')`。

### 已知問題 / 未完成
- `mid`（中距離玩家）測試對克拉寇是 SKIP，不是 PASS：克拉寇整場飄在離地 58px，
  「站地上保持固定水平距離」的玩家模型既打不到他（迴旋刃水平飛）也躲不掉貼地橫掃（3.2px/f > 走路 1.3px/f）。
  原因寫在 boss_test.py 的 `MID_SKIP`；他的近身平衡由 fight（3/3 PASS）與 phase2 覆蓋。
  下一步建議：mid 模擬加上「魔王在高處就先漂浮到同高度再打」與「預警粒子出現就跳」的反射動作。
- `boss_test.py --real --no-mid`（改用 levels.js 真實魔王房）時 whispywoods 的 `fight` 約 2/3 會過，不是穩定 3/3：
  失敗的樣本都是「機器人走進樹裡吃到碰觸傷害 → 掉劍 → 撿不回來 → 沒武器打不完」。
  注意威斯比 `solid:false`（玩家可以走進樹裡），這是原本就有的設定；預設（注入測試房）模式連跑 5 次都 ALL PASS。
  下一步建議：boss_test 的策略加上「站在魔王碰撞框外緣就不要再往前走」與更積極的能力星回收。
- `--real` 的 `mid` 對 whispywoods / dedede 仍可能 FAIL（中距離站樁模型在大房間走位空間不同），建議 `--real` 搭 `--no-mid` 使用。
- `--collect` 只是順路撿（半徑內才追），不保證 9/15 顆全收；要驗證存檔請看指令輸出最後一行的 `stars:`。


## audio

### 提供給其他 agent 的 API 一覽（src/audio.js，全部 try/catch，無 AudioContext 也不拋錯）
| API | 說明 |
|---|---|
| `KB.audio.setVolume({music, sfx})` | 音樂 / 音效音量 0~1（任一可省略、自動夾限）；寫入 `KB.save.settings.audio = {music, sfx}` 並 `KB.saveGame()`；回傳 `getVolume()` |
| `KB.audio.getVolume()` | → `{music, sfx, muted}`（0~1 + 靜音狀態）；啟動時自動由存檔讀回 |
| `KB.audio.setMute(bool)` / `toggleMute()` | 維持原樣（總靜音，M 鍵） |
| `KB.audio.duck(on)` | `true` 音樂平滑降到 30%，`false` 恢復（**暫停時呼叫**）；`status().ducked` 可查 |
| `KB.audio.status()` | 多回傳 `volume:{music,sfx}`、`ducked`、`sfxCount`、`musicCount` |
| 新 sfx | `unpause`（與 pause 音高相反）、`lowhp`（低血量雙音，HUD 每 90 幀呼叫）、`oneup`（1UP jingle 0.6 秒）、`bigstar`（大星星 5 音上行琶音）、`charge`（蓄力上升音）、`charge_ready`（蓄力完成叮）、`unlock`（門 / 機關解鎖）、`phase2`（魔王二階段登場重音）、`menu_back`（返回 / 取消） |
| 既有 sfx 改版 | `ability` 改為 3 音短 jingle（C5→G5→E6），呼叫時**自動 duck 音樂 0.4 秒**，呼叫端不必額外處理 |
| 新 music | `boss2`（boss 變奏：BPM 184、升 2 半音、8 分音符低音、短促鼓，16 小節 loop）、`finalboss2`（finalboss 變奏：BPM 196、升 2 半音、雙倍鼓）、`secret`（秘密房 A 小調 8 小節神祕循環）、`miniboss`（中魔王 168BPM 16 小節緊湊 loop） |

共 40 個 sfx、17 首 music；完整清單見 `node tools/audio_check.js` 輸出。所有旋律皆本專案原創。

- [2026-09-11 18:02] 完成：音量 API（setVolume / getVolume，獨立 musicBus / sfxBus GainNode、存 KB.save.settings.audio、啟動讀回）＋ duck(on) 暫停降音 30% ＋ 9 個新 sfx ＋ ability 改 3 音 jingle 並自動 duck 0.4s ＋ 4 首新曲（boss2 / finalboss2 / secret / miniboss）＋ audio_check / audio_test / render_music 同步擴充。
  驗證：`node tools/audio_check.js` 全部通過（介面 / 名稱 / 曲目 token 檢查，含新 API 與夾限測試）；`.venv/bin/python tools/render_music.py` 40 sfx + 17 music 離線渲染皆非靜音且不爆音（peak 0.07~0.43），volume/duck API 檢查通過；playwright 開 `index.html?debug=1&mute=1` 逐一呼叫全部 sfx / music 無 console error、無 unknown sfx / unknown music，setVolume 寫入 KB.save 並在 reload 後讀回（0.45/0.6）；`shots/agent_audio/title.png` 遊戲仍正常啟動。
  試聽 WAV：`shots/agent_audio/music_boss2.wav`、`music_secret.wav`、`music_miniboss.wav`（各 10 秒）。
  下一步：等 ui-menu 接上 duck(true/false) 與音量選單、levels-bosses 接上 `music('boss2')` / `music('miniboss')` / `music('secret')` 與 `sfx('phase2')`/`sfx('unlock')`/`sfx('bigstar')` 後，實機再驗一次過場音量銜接。

#### 跨檔需求（由總控 / 對應 agent 處理）
- ui-menu：暫停選單呼叫 `KB.audio.duck(true)` / 恢復 `duck(false)`；恢復時播 `sfx('unpause')`；音量列請用 `setVolume/getVolume`（已自動存檔）；返回 / 取消請用 `sfx('menu_back')`。
- ui-menu（HUD）：HP ≤ 1 時每 90 幀 `KB.audio.sfx('lowhp')`。
- levels-bosses：魔王 HP<50% 時 `KB.audio.sfx('phase2')` + `KB.audio.music('boss2' / 'finalboss2')`；中魔王房 `music('miniboss')`、門解鎖 `sfx('unlock')`；秘密房 `music('secret')`；大星星 `sfx('bigstar')`；1UP 建議改用 `sfx('oneup')`。
- abilities-enemies：蓄力招請用 `sfx('charge')`（蓄力中）與 `sfx('charge_ready')`（完成）。
- docs/SPEC.md 第 9 節的 sfx / music 名稱清單需補上以上新名稱（audio agent 無權編輯 SPEC）。

## research-qa

- [2026-09-11 18:05] 完成：**docs/DESIGN_REFERENCE.md**（6 章，475 行，可直接施工）。
  內容：① 基礎操控（跑步=雙擊並按住、**漂浮無次數/高度上限**、吐氣後禁漂 8~12 幀、滑鏟、Super Star 的 Guard 減傷規則、吸入範圍 40~48px 且可緩慢移動、受傷掉能力機率與能力星 300 幀回收）；
  ② 暫停說明卡（夢之泉/Super Star 做法 + **256×224 的 ASCII 版面圖 A/B/C** + 9 段本專案原創風味文字，可直接貼進 ui.js）；
  ③ **8 能力招式表**（Beam/Cutter/Ice/Sword 為 Wikibooks 逐字輸入表；Fire/Spark/Stone/Hammer 標明來源與慣例）+ 三梯次優先實作排序；
  ④ 關卡設計（大開關顏色分工、隱藏房 3 種門檻、博物館房、**每世界 3 大星星的 1/3+1/3+1/3 難度比例**、中魔王門鎖 75 幀演出規格、5 魔王的二階段切點建議）；
  ⑤ 選單與流程（標題選單、**競技場規格**：1 命 + 自選 1 能力 + 休息房 3 顆番茄、Extra Mode 只調參數的 4 條差異、100% 定義）；
  ⑥ **法律差異化檢查表**（含「5 魔王與關卡名目前直接使用官方角色名，是最大風險點」的具體改名建議）。
  驗證：`docs/DESIGN_REFERENCE.md` 475 行，文末附 20 條來源網址（WiKirby / Fandom / StrategyWiki / Wikibooks / Wikipedia），每條結論都標 `[源]`/`[慣例]`/`[本作]` 可信度。
  下一步：QA 全關卡檢視。

- [2026-09-11 18:10] 完成：**docs/QA_REPORT.md**（5 世界 playthrough + 25 房 ×4 張截圖逐張看圖 + 場景流程 + 3 支自動化測試）。
  結果：engine 39/39、enemy 236/236、boss ALL PASS；**25 房零洋紅缺圖、零 console/pageerror**；共記錄 **P0×1 / P1×5 / P2×9**。
  **P0-01：w4 魅塔騎士自動通關機器人永遠打不完**（45000 幀、sword/hammer/fire 三種能力皆失敗，boss 僅掉到 41~42/45；boss_test 卻 3/3 全勝 → vanish/backstep 迴避過強）。
  P1：playthrough 預設 maxframes 15000 不足（w3 需 24332、w5 需 22075 幀）；--godmode 仍會死；**w4 room1 直式房背景破圖**（彩虹圖層只畫半屏 + 接縫下方出現重複碎片，重跑仍在）；高筆畫中文（繼/續/圖/開/謝/遊）12px 仍糊；選關 W5 標籤超出右緣。
  驗證：截圖 125 張於 `shots/agent_qa/`，關鍵證據 `recheck_w4_r1_a.png`(背景破圖)、`final_pause.png`(剩餘糊字)、`final_select.png`(標籤超框)；重現指令全部寫在報告每一列。
  備註：中文可讀性問題在 QA 期間（17:52→18:07）被 ui-menu 修掉一大半，報告只保留 18:07 重跑後仍存在者，並另闢一節記錄「已修好」項目。
  下一步：等各 agent 修完後做第二輪回歸（重點：P0-01 與 P1-03）。

#### 跨檔需求（由總控 / 對應 agent 處理）
- levels-bosses：P0-01 魅塔騎士迴避頻率（建議 vanish 最短間隔 ≥180 幀、hurt 後 ≥30 幀不可 vanish）；`tools/playthrough.py` 預設 `--maxframes` 提高到 30000、`--godmode` 需一併擋掉落坑死亡。
- levels-bosses：`src/art/backgrounds.js` 的 cloud 主題背景在高度 > 12 磁磚的房間未填滿鏡頭（P1-03）。
- ui-menu：`src/gfx.js` `renderTextCanvas` 對高筆畫字（繼/續/圖/開/謝/遊）與黃/綠高亮色在 12px 仍會糊（P1-04）；選關 W5 標籤、暫停 PAUSE 標籤、遊戲內 toast 三處超出畫面邊界（P1-05 / P2-12 / P2-13）。
- levels-bosses（測試工具）：建議 `tools/boss_test.py` 增加「保持中距離的玩家模擬」案例，否則 P0-01 這類問題測不出來。
- abilities-enemies + levels-bosses：DESIGN_REFERENCE 3.9 的第一梯招式中，`Fire 點燃導火線`、`Spark 照亮暗房`、`Hammer 打破硬磚` 需要雙方約定 levels.js 的磁磚字元（建議 `F` 導火線、`D` 暗房、`X` 硬磚）。
- 總控（法律）：DESIGN_REFERENCE 第 6 章建議把 5 個魔王與 25 種敵人的官方角色名、關卡名「迪迪迪城」、標題 `KIRBY STAR` 全面改為原創名，建議由總控統一發對照表。
（agent 在此追加）

---
# Round 2（2026-09-11 19:45 啟動）
分工見 docs/TASKS.md Round 2；各 agent 在下方自己的區段追加。

## ui-flow

- [2026-09-11 20:20] 完成：**過關結算 KB.ResultScene**（ui.js）＋ game.js 過關流程改接。
  - `game.js`：`clearT === 220` 改成 `KB.setScene(new KB.ResultScene(this))`，原本的「下一關 / 結局」邏輯抽成 `GameScene.gotoNext()`（結算按第二次 Z 時呼叫）；`update()` 新增 `timeAlive++`（不含淡入淡出 / 暫停 / hit-stop）與 `kills` 計數（`e.dead && e.type==='enemy'` 只計一次）；`KB.save` 預設補 `best:{}` / `arena:{}`。
  - 面板：關名（W1 + 中文 16px）／SCORE／TIME（幀→mm:ss）／擊敗敵人／大星星 ★x/3（+1000 ×顆）／HP 獎勵（剩餘 HP ×100）／TOTAL（bigText 2 倍）／BEST（破紀錄閃 `NEW!`）。逐項滾動每幀 +3%、每 4 幀 `sfx('count')`、單項結束 `sfx('count_end')`；Z / Enter 第一次跳過滾動、第二次離開；`music('result')`（不存在時退回 `clear`）。存 `KB.save.best[levelId] = max(舊, TOTAL)`。
  驗證：`shots/agent_uiflow/result.png`、`result_roll1~3.png`、`result_mid.png`；端到端 `flow_end.png`（w1 打魔王→出口門→跳舞 220 幀→ResultScene→Z→Z→StageSelectScene，`KB.save.best.w1` 已寫入）、`flow_w5.png`（w5 → ResultScene → EndingScene）。下一步：關卡開場橫幅。

- [2026-09-11 20:35] 完成：**關卡開場橫幅 `KB.UI.drawLevelBanner`**（ui.js，game.js 只加 1 行 draw 呼叫）。
  進入關卡第一房（`roomIdx === 0`、非秘密房、非競技場）時自左滑入 20 幀 → 停 90 幀 → 右滑出 20 幀；內容為「WORLD n」8×8 點陣字 2 倍 + 關名 16px 中文，畫在遊戲區 y 32~80，**純繪製不阻擋操作**。計時用 `game.frame`（截圖工具只 render 一次，用畫面次數會不準）。開場音依 audio2 指示用 `sfx('select')`（不用 `music('w_intro')`，會蓋掉關卡曲）。
  驗證：`shots/agent_uiflow/banner_in.png` / `banner_hold.png` / `banner_out.png`。下一步：競技場。

- [2026-09-11 21:10] 完成：**競技場 Boss Rush（新檔 `src/arena.js`，已加進 index.html）**。
  - `KB.ArenaScene`：選出發能力（無能力 + 8 能力，←→ 選，9 格縮圖列 + 戴帽卡比 + 說明 + BEST 時間）。
  - 流程：`startBattle()` 用 **各世界原本的魔王房**（`rooms.findIndex(r => r.bossRoom)`）建 `GameScene(levelId, { room, arena, lives:0, hp, ability })`；魔王 HP / 二階段 / 登場演出全部沿用。順序＝前 4 名隨機洗牌 + 最後固定 `dedede`。魔王房原有的食物在競技場會被移除（補血只靠番茄）。
  - 休息室：`KB.EXTRA_LEVELS.arena_rest`（16×12 字串地圖 ＝ 剛好一畫面，castle 主題）。3 顆番茄放在**單向平台上**（放地面的話走去門就會自動吃光）；整場共用，`arena.tomatoes` 減到 0 就沒了（重進休息室時多的直接 `dead`）。
  - game.js 只加 3 個鉤子：`opts.arena` / `useDoor` 的 `exit` → `KB.arenaExit()` / `playerDied` 的 `lives < 0` → `KB.arenaFail()`；另加 `KB.EXTRA_LEVELS` 查表（休息室不在選關地圖上）。
  - 1 條命：死亡直接 `KB.ArenaResultScene`（GAME OVER 版）。全破顯示總時間 / 最佳時間 / 剩餘番茄 / 本次順序，存 `KB.save.arena = { bestTime, cleared }`。
  - HUD（ui.js `drawHUD` 判斷 `game.arena`）：右上「ARENA n/5」、右下計時（避開魔王血條 x 66~156，靠右對齊 210）、生命換成番茄圖示 + 剩餘數。
  - 標題選單新增「競技場」（`KB.save.cleared.w5` 或 `KB.DEBUG` 顯示）。
  驗證：`shots/agent_uiflow/arena_pick.png`（選能力）、`arena_boss.png`（對戰 + HUD）、`arena_rest.png` / `arena_rest_walk.png`（走過去不會誤吃、跳上平台才吃到，`tomatoes` 3→2）、`arena_result.png`（5/5 全破、bestTime 1837 幀已存檔）、`arena_fail.png`（死亡結算）、`title_to_arena.png`。自動化：5 場連戰腳本跑完 `order` 隨機、最後一場必為 w5 dedede、`scene` 轉為 `ArenaResultScene`、`missing []`、無 console error。下一步：HUD 字級 / 設定頁 / 選關 BEST。

- [2026-09-11 21:30] 完成：**HUD 中文 14px、設定頁「畫面縮放」、F 全螢幕、選關 BEST**。
  - `drawHUD` 的 `rowB`（中文能力名）12px → `UI.MS`(14px)，「鐵鎚」等密集字清楚（`shots/agent_uiflow/hud_hammer.png`）。
  - 設定頁新增「畫面縮放：自動 / 2x / 3x / 4x」（`KB.save.settings.scale`，0 = 自動）；`main.js` `resize()` 讀取並匯出 `KB.resizeCanvas()` 讓設定頁即時套用；**F 鍵全螢幕**（`KB.toggleFullscreen`，`requestFullscreen`/`exitFullscreen` 全 try/catch，`fullscreenchange` 後重新 resize）。面板加高到 158 並改成 2 行提示（原本 1 行會被截成「SELEC…」）。
  - 選關資訊面板新增「BEST 0001234」（`KB.save.best[levelId]`，0 分時灰色）。
  驗證：`shots/agent_uiflow/menus_settings.png`（縮放 3x，`KB.save.settings.scale === 3`、canvas CSS 寬 768px）、`select_best.png`、`hud_hammer.png`。

- [2026-09-11 21:45] 完成：**player2 交辦的兩點**。
  - ① `KB.session` 重設一律走新的 `KB.UI.newSession(lives, score, extra)`，**預設保留 `extra` 旗標**；`main.js` `__kb.goto('game')` 與 boot 同樣保留（boot 另支援 `?extra=1`）。標題選單在 `新遊戲` 下方新增 **「Extra 模式」**（通關 W5 或 `?debug=1` 顯示）→ `startGame(false, true)` → `KB.session.extra = true`；`新遊戲` 明確設為 `false`，競技場設為 `false`。
  - ② 操作說明改成 **2 頁**（←→ 換頁，右上角顯示 1/2）：第 2 頁 `KB.UI.HELP2` 為進階提示（水中吸入減半、梯子上吐氣星、單向平台穿下、漂浮 / X 結束、滑鏟跳取消、能力星可撿回、能力台座、傳送星）。標題說明頁、標題選單說明頁、暫停說明頁三處都吃到翻頁（`UI.helpUpdate()` / `UI.openHelp()`）。字串長度已調到 14px 不截斷。
  驗證：`shots/agent_uiflow/menus_title_menu.png`（7 項選單：新遊戲 / Extra 模式 / 操作說明 / 能力圖鑑 / 競技場 / 設定；≥6 項時列高自動 19→17）、`help2_p1.png`、`help2.png`。

- [2026-09-11 21:55] 收工驗證：`engine_test.py` **118/118 PASS**；`playthrough.py --level w1 --godmode` → `LEVEL CLEAR at frame 4443, deaths=0, cleared=True, missing []`（playthrough 在 `clearT >= 0` 就 break，不會走到 ResultScene，屬預期）；`node tools/level_check.js` 0 error；`node --check` 於 ui.js / menu.js / main.js / arena.js / game.js 全過；`tools/build.py` → `dist/卡比之星.html` 754 KB（已內嵌 arena.js）。
  **未完成 / 已知問題**：
  1. 競技場沒有中途存檔，中離就重來（原作亦然，暫不做）。
  2. 競技場魔王戰目前照用各世界的魔王房背景與音樂 `music('arena')`；魔王「登場字幕」每場都會播 150 幀，連戰時稍顯拖沓（可考慮競技場縮短到 60 幀，需動 game.js loadRoom，超出本輪授權範圍）。
  3. 結算的「大星星 ★」在 14px 下是細小的星號字形（中文字型繪製），不影響辨識但不算像素風；若 art agent 提供 `uifb_ministar` 尺寸的內嵌圖示可再換掉。
  4. 「Extra 模式」只負責設 `KB.session.extra = true`，**實際難度差異由 player2 / enemies-bosses2 讀旗標實作**。
  **跨檔需求**：
  - `src/entity.js`（enemies-bosses2）：目前擊敗數是在 `game.js` 掃 `e.dead && e.type === 'enemy'` 計的；若之後敵人改成「死亡後仍留在 entities」或有非戰鬥性移除，請改在 `Enemy.die()` 裡 `KB.game.kills++` 更準確。
  - `src/levels.js`（mechanics）：競技場休息室用 `KB.EXTRA_LEVELS`，不會進 `KB.LEVELS`，`level_check.js` 不會檢查它；若之後 `level_check` 想涵蓋，請一併讀 `KB.EXTRA_LEVELS`。
  - `src/bosses.js`（enemies-bosses2）：若要做「競技場專用登場演出（縮短）」，建議在 Boss 讀 `KB.game.arena` 時把 `KB.game.bossIntroT` 調短，或提供 `boss.introFrames`。
  - audio2：已接上 `sfx('count')` / `sfx('count_end')` / `music('result')` / `music('arena')` / `music('arena_rest')`；開場橫幅依指示用 `sfx('select')`，未用 `w_intro`。

## mechanics

- [2026-09-11 23:20] 完成：**3 種互動磁磚 + 暗房遮罩**（tilemap.js / game.js / art/world.js / abilities.js）。
  - `X` 硬磚 `tile_hardblock`（灰底鉚釘）：實心；`KB.TileMap.hardBreakable(a)` 判定 —— 判定框 `kind` 為 `hammer` / `stone`、
    帶 `breakHard`（火焰衝刺，abilities.js 建立判定框後掛上）或 `dmg ≥ 5` 才打得破；其餘攻擊 `map.clink()` 播 `sfx('hardblock')` + 白色火花（10 幀冷卻）。炸彈連鎖也能炸開 X。
  - `F` 導火線 `tile_fuse` / `tile_fuse_v`（依左右鄰居自動選橫／直向）：不實心、可通行；被 `kind==='fire'` 判定命中 → `map.igniteFuse()`，
    `map.burning` 每 6 幀往相鄰 F 延伸（燒過的變 `.`、畫 `tile_fuse_burn` 2 幀火焰、播 `sfx('fuse')`），燒到相鄰 `B`/`*` 就丟進既有的 `pending` 連鎖引爆。
  - `I` 冰磚 `tile_iceblock`（8 位數色碼半透明藍）：實心；被 `fire` 判定命中 → `map.meltIce()` 20 幀後消失（期間 alpha 遞減 + 閃爍 + 冰屑粒子 + `sfx('melt')`）。重擊（hammer/stone）也砸得破，避免卡死。
  - 暗房：`room.dark` → `game.js drawDark()` 用離屏 canvas 填 `room.darkColor`（預設 `rgba(4,4,14,0.94)`）後以 `destination-out` 徑向漸層挖洞；
    卡比半徑 40px，火把 / 星星裝飾（castle `r`、dedede `t`/`c`、cloud `s`）另挖 34px 會閃動的小光圈。
    `abilities.js` 的 `light(r)` 在放電 / 電擊波設 `lightR=96`、噴火設 `lightR=64`，同時寫 `lightT=180` 與 `lightF=game.frame`；
    招式結束後 `lightF` 停住 → 半徑依**遊戲幀**（不是繪製次數）在 180 幀內線性縮回 40px。
  驗證：`shots/agent_mech/w2_dark.png`（40px 光圈 + 火把）、`w2_dark_spark_on.png`（96px）、`w2_dark_spark_fade190.png`（縮回 40px）、
  `w2_hard_before/hit.png`（鐵鎚砸破）、`w2_hard_clink.png`（劍砍只有火花、硬磚還在）、`w1_fuse_before/after_burn/after.png`、`w1_ice_before/after.png`。
  下一步：關卡運用。

- [2026-09-11 23:35] 完成：**關卡運用（levels.js 末端新增「Round 2 機關層」MECH 疊加表）**。
  不動原本的房間字串，改用 `MECH = [{lv, r, tiles, deco, flags, rm, add}]` 疊加補丁，一眼看得出每個世界用了哪些機關。
  | 關 | 房 | 機關 | 內容 / 獎勵 | 能力來源 |
  |---|---|---|---|---|
  | w1 | r0 起點草原 | `F`×4 + `B` | 地面垂下的導火線 → 引爆空中木箱 → 4 點數星 + 食物 | essence(fire) @(58,9)、Hot Head (63,9) |
  | w1 | r1 星星森林 | `I`×1 | 空中石室入口的冰磚（側牆，正面噴火燒得到）→ 4 點數星 + 食物 | essence(fire) @(50,9)、Hot Head (37,6) |
  | w2 | r0 古堡玄關 | `X`×2 | 兩端封死的空中石廊（x=42~54）→ 6 點數星 + 食物 + 番茄 | essence(hammer) @(30,9) |
  | w2 | r1 螺旋塔 | **暗房** | 整座塔只看得見卡比周圍；牆上加 6 支火把 | essence(spark) @(6,25) |
  | w3 | r1 珊瑚洞窟 | `I`×4 | 右側水道整片結冰，燒開才潛得下去 → 3 點數星 + 食物 | essence(fire) @(60,9) |
  | w3 | r2 浮島跳躍 | `F`×6 + `B` / **傳送星** | 導火線炸藥庫（4 點數星 + 食物）；傳送星 (60,9) 飛過 x=62~68 尖刺坑落到 (73,9) | essence(fire) @(19,9) |
  | w4 | r2 風之迴廊 | `X`×2 / **傳送星** | 天花板硬磚密道（6 點數星 + 1UP）；傳送星 (53,9) 飛過 x=56~58 無底洞落到 (68,9) | essence(hammer) @(45,9) |
  | w4 | r3 魅塔之前 | **暗房** | 雲霧深處（`darkColor` 較淡）；加 4 顆會發光的星星裝飾 | essence(spark) @(14,9) |
  | w5 | r0 城門 | `F`×6 + `B` | 導火線炸藥庫 → 4 點數星 + 食物 | essence(fire) @(19,9) |
  | w5 | r1 守衛長廊 | `X`×2 + **暗房** | 暗房走廊（4 支火把）+ 硬磚密道（6 點數星 + 1UP + 番茄） | essence(hammer) @(6,9) |
  | w5 | r2 地下水牢 | `I`×4 | 中段水牢結冰，燒開才潛得到底 → 2 點數星 + 食物 | essence(fire) @(25,9) |
  **主路線完全沒有被新磁磚擋住**（所有機關都在天花板 / 支線 / 水面，冰面可以直接走過去），大星星與秘密房位置一格未動。
  硬磚 / 冰磚前一定補了 1~2 格立足點 —— 卡比「漂浮中按攻擊＝吐氣」，站著才打得出地面招式（掄鎚 / 噴火）。
  驗證：`node tools/level_check.js` → 0 error；`shots/agent_mech/` 各機關前後對照圖。

- [2026-09-11 23:45] 完成：**能力台座 `KB.ITEMS.essence` 與傳送星 `KB.ITEMS.warpstar`**（items.js + art/world.js）。
  - `essence`：`{ t:'essence', x, y, a:'<能力 key>' }`。`item_essence_base` 底座 + 上方漂浮的 `ui_ability_<key>_mini`（2 倍放大）+ 光暈 + 能力色火花；
    碰到即 `player.giveAbility(key)` 並播 `sfx('essence')`，**不會消失**，冷卻 30 幀，已經是同一種能力時不重複觸發。全遊戲 11 個（每世界 1~2 個，都放在對應機關前）。
  - `warpstar`：`{ t:'warpstar', x, y, a:[[tx,ty],…], b?:{room,x,y} }`。`item_warpstar` 2 幀星星 + 光暈 + 拖尾；
    碰到 → `dead=true` → `KB.player.rideStar(worldPath, onArrive)`（磁磚座標換算成 `tx*16+8`）；`b` 有值時 `onArrive` 走 `fadeTo → loadRoom`，沒有就原地落地。
    `rideStar` 不存在時退回「`fadeTo` 直接抵達」。w3 r2 / w4 r2 各 1 次。
  驗證：`shots/agent_mech/w3_warp_ride2.png`（騎星飛過尖刺坑）、`w3_warp_land.png`、`w4_warp_before.png`（台座 + 傳送星 + 硬磚密道同框）。

- [2026-09-11 23:55] 完成：**工具與最終驗證**。
  - `tools/level_check.js`：`X F I` 加進 KNOWN（X/I 視為實心）；新增「機關磁磚統計」、「有 X/F/I 就要有對應能力來源（essence 台座或會給該能力的敵人）」、
    「導火線必須 4 鄰接連得到 B/\*」、「暗房要有發光裝飾與電擊/火焰來源」、`essence` 的 `a` 與底座地面、`warpstar` 路徑點不可在實心格 / 落點要站得住 / `b` 目標房合法。
  - `tools/playthrough.py`：卡住時的嘗試順序加了 **D「↓+攻擊」**（重擊招式，硬磚 X 只有這類打得破）。
  - 依 audio2 需求：每房補 `ambient`（water / cave / wind / castle，依房名與水量自動判定）、每世界 r≥2 的非魔王 / 非秘密房改用第二首曲（`green2` … `dedede2`）。
  - 依 player2 需求：`abilitystar` 改用 `KB.PHYS.abilityStarLife`（Extra ×0.5）、落地彈 2 次（-2.8 / -1.6）、最後 20% 幀數才開始閃爍。
  驗證：`node tools/level_check.js` → **0 error / 1 warning**（既有的拉拉拉出生點提示）；
  `.venv/bin/python tools/engine_test.py` → **118/118 PASS**；
  `tools/playthrough.py --level wN --ability sword --godmode` 五世界 **全部 cleared=True**（最後一輪 w1 4443 / w2 8266 / w3 6021 / w4 9133 / w5 9974 幀，deaths=0，missing sprites 皆空）。

#### 跨檔需求（mechanics → 其他 agent / 總控）
- **總控（game.js loadRoom）**：房間資料已備妥 `room.ambient`，請在 `loadRoom` 結尾加 `KB.audio.ambient(room.ambient || null)`（audio2 指定）。
- **ui-flow**：暗房 `room.dark` 的遮罩畫在 `map.drawWater` 之後、HUD 之前（`GameScene.drawDark`），HUD / 橫幅 / 暫停畫面都不會被壓暗；若之後要加「暗房也壓暗 HUD」請改 drawDark 的呼叫位置。
- **enemies-bosses2**：新中魔王要放哪一房請告訴我（目前 w2 r2 / w3 r2 / w5 r3 已有 gatekeeper 門鎖）。
  另外 w5 r0 (22,9) 的 Blade Knight 就站在導火線旁邊、w4 r2 (58,8) 的 gordo 靠近傳送星起點，若要調敵人位置我再同步機關座標。
- **abilities-enemies**：`abilities.js` 只加了兩個 hook —— 火焰衝刺判定框 `d.box.breakHard = true`、火焰 / 電擊 update 開頭呼叫 `light(64/96)`；招式數值一律沒動。

#### 已知問題 / 未完成
- `tools/build.py` 尚未執行（其他 agent 還在改檔，避免打包到半成品狀態）→ 請總控收尾時統一 build。
- 冰磚在「站在冰面上用地面噴火」時，判定框只有最下方 1px 壓到腳下那一列 —— 對水面結冰（w3 r1 / w5 r2）是「往前方燒」最順手；
  若之後 player 的 `h` 改動，建議改用火焰衝刺（↓+X，判定框 oy −3 / h 20）驗證。
- 暗房目前只有卡比與火把 / 星星裝飾發光；敵人的投射物（火球 / 電擊）沒有光源，之後想加可在 `drawDark` 的 `hole()` 迴圈裡加實體掃描。

## enemies-bosses2

- [2026-09-11 23:10] 完成：**新原創中魔王「鐵甲滾球 Rollarmor」**（`KB.ENEMIES.rollarmor`，繼承 `MiniBoss`）。
  hp 12 / 碰撞框 30×30 / score 3500 / 打倒後暈倒可吸入得 **hammer**。兩招 + 一個弱點：
  ① **鐵殼滾動 roll**（距離 >70px 或每第 3 次出招）縮進殼裡以 2.8px/f 滾過來，撞牆反彈，撞 2 次牆 / 遇懸崖 / 150 幀後散開；
  ② **站起來砸地 slam**（近距離）24 幀舉臂預備後砸下 —— 正面 `dmg 2` 的 hammer 判定框 + 左右各一道沿地面跑的 `KB.Shockwave`；
  ③ **弱點**：鐵殼關著（roll 全程、slam 的 24 幀預備）時攻擊會「鏘」一聲被彈開**不扣血**（`get armored`），
  滾完 / 砸完的 `open` 硬直（46~60 幀，鐵殼張開露出橘紅軟肉）才是玩家的攻擊窗。
  像素圖（`src/art/enemies.js`，程序式繪製，40~44px）：`rollarmor_walk` 2 幀 / `rollarmor_roll` 2 幀（36×36 置中、程式端旋轉）/
  `rollarmor_attack` 2 幀（舉臂 / 砸下）/ `rollarmor_hurt` 1 幀（殼裂 + ×眼）/ `rollarmor_stun` 1 幀（癱坐冒星星）。
  驗證：`tools/enemy_test.py --only rollarmor` 16/16 PASS；sheet 截圖 `shots/agent_eb2/sheet_rollarmor.png`、
  實戰截圖 `shots/agent_eb2/rollarmor_walk.png` / `rollarmor_roll.png` / `rollarmor_slam_windup.png` / `rollarmor_slam_hit.png` / `rollarmor_open.png` / `rollarmor_stun.png`。

- [2026-09-11 23:25] 完成：**敵人掉落表**（`src/entity.js`）。`Enemy` 新增 `dropTable`（預設 `{pointstar:0.25, food:0.05}`），
  `MiniBoss` 覆寫為 `{tomato:0.5, oneup:0.1}`；`Enemy.die` 統一呼叫新的 `rollDrop(src)`：
  `spawnDef.drop`（`ent.dropItem`）指定時優先且必掉 → 魔王房（`KB.game.isBossRoom`）不掉 → 否則依表順序 roll，**命中第一個就停（一次最多一個）**，
  所以機率設 0 / 1 時是確定性行為。`pointstar` 用 `{pop:true}` 彈出。
  「只在被攻擊殺死時掉」是靠既有結構保證的：被吸入吞下走 `onInhaled`（直接 `dead=true`，不經 `die`）、掉出地圖走 `update` 的 `fellOut`（同樣不經 `die`）。
  中魔王沒有 `die()`（暈倒 300 幀後才 `dead=true`），所以改在 `MiniBoss.stun(src)`「被打倒的那一刻」roll 一次，之後吸入不會重複掉。
  驗證：`tools/enemy_test.py --only drops` 11/11 PASS（機率 1 必掉 / 機率 0 不掉 / 一次最多一個 / 魔王房不掉 / spawnDef.drop 優先 / 吸入吞下不掉 / 掉出地圖不掉 / 中魔王暈倒時掉且吸入不重複）。

- [2026-09-11 23:40] 完成：**Extra（超難）難度鉤子**。倍率表集中在 `src/entity.js`：
  `KB.EXTRA = { spd:1.2, proj:1.2, bossHp:1.25, miniHp:1.25, phase2:0.6 }`，搭配 `KB.extraOn()` / `KB.exK(k)` / `KB.exPhase2()`（開關讀 `KB.session.extra`）。
  套用點只有三處，不散落：
  (1) `Baddie.applyExtra()`（`src/enemies.js`，**第一次 update 時**呼叫一次 —— 子類建構式在 `super()` 之後才設 speed/hp，建構式裡做不到）：
      設 `this.exK = 1.2`（`Enemy.walk` 與 `Baddie.chase` 共用），中魔王（`isMiniBoss`）`maxHp ×1.25`；
  (2) `KB.Projectile` 建構式：`owner==='enemy'` 時 `vx/vy ×1.2`（在子類讀 `vx` 之前先乘，例如 `Boomerang.maxV`）；
  (3) `Boss.ensureExtra()`（`src/bosses.js`，於 `update / introUpdate / hurt / drawBody` 開頭各呼叫一次，只會生效一次）：`maxHp ×1.25`（含 `maxSelfHp`），
      二階段門檻改成 `get half() { return this.maxHp * KB.exPhase2(); }`（一般 50% → Extra 60%，即時計算不需要初始化）。
  驗證：`tools/enemy_test.py --only extra` 9/9 PASS（倍率表 / 預設關閉 / 敵人走速 ×1.2 / 投射物 ×1.2 且玩家的不受影響 / 實戰 shotzo 砲彈 ×1.2 /
  中魔王 12→15 且關掉會變回 12 / 魔王 40→50 / 門檻 20→30）；實機 smoke：Extra 開啟後威斯比 50（half 30）、迪迪迪 75（half 45），無 pageerror。

- [2026-09-11 23:55] 完成：**5 個魔王登場動畫**（`bossIntroT` 150 幀期間的 `introUpdate` / `draw`，`KB.BOSS_INTRO = 150`，基底提供 `this.introT` / `introP`）。
  - 威斯比：整棵樹左右搖晃（幅度隨時間收斂）+ 樹冠不斷飄落綠色葉片粒子，每 46 幀一次沉重的搖動 + 震動。
  - 洛洛洛 & 拉拉拉：**從房間左右兩側各推一顆箱子走進定位**（洛洛洛右→左、拉拉拉左→右；登場期間 `solid=false` 不吃物理，
    箱子是純繪製的 `proj_box`，不生實體以免登場期間就打到卡比），走到定位冒 `fx_poof`。
  - 克拉寇：四面八方的小雲朝中心聚集（粒子帶速度向內）+ 本體 `alpha` 由 0.06 漸顯到 1，第 132 幀成形時閃光 + 震動。
  - 魅塔騎士：新精靈 **`metaknight_cape`（2 幀：整件披風裹住只露發光雙眼 / 張成雙翼）**，時序為裹住 → 40 幀展開（風壓粒子）→ 104 幀收攏 → 118 幀換回 `metaknight_idle`。
  - 迪迪迪：王座後畫一道**城堡大門**（70 幀內淡出）→ 從門裡大搖大擺走出來（`dedede_walk` + 腳步塵）→ 最後 56 幀舉鎚敲地示威兩下（`dedede_hammer` + 震動 + 木屑）。
  **平衡注意**：`onIntroEnd` 只還原 `solid/grav/位置`，**不呼叫 `setState`** —— 登場期間 `stateT` 已累積到 150，魔王一開打就出招是原本的節奏，
  重設會讓整場戰鬥時序位移（實測會讓 `boss_test` 的 lololo 普通玩家樣本從 3/3 掉到 1/2）。
  驗證：`tools/boss_test.py` 新增 `[intro]` 全部 PASS；連拍 `shots/agent_eb2/intro_<boss>_00..06.png` 與拼接 `shots/agent_eb2/introseq_{whispy,lololo,kracko,metaknight,dedede}.png`。

- [2026-09-12 00:10] 完成：**測試與收工驗證**。
  - `tools/enemy_test.py` **368/368 PASS**（新增 rollarmor 16 項、drops 11 項、extra 9 項；`--only rollarmor,drops,extra` 可單跑）。
    另把「中魔王打到暈倒」改成自適應補刀（鐵甲滾球的鐵殼會擋掉好幾下，固定次數不夠）。
  - `tools/boss_test.py` 新增 `[intro]` 測試（`__bt.introProbe`）：登場期間每 18 幀直接 `hurt()` + 生一個覆蓋魔王的玩家判定框（共 8 次），
    魔王 hp 不得下降、`hurt()` 一律回傳 false、150 幀後 `introducing === false` / `bossIntroT === 0` / `started === true`（洛洛洛連 partner 一起檢查），
    並在第 6 / 75 / 138 幀擷取 `shots/boss_<key>_introanim_{early,mid,late}.png`。新增 `--no-intro` / `--intro-frames`。
  - `tools/engine_test.py` 118/118 PASS；`node --check` 我改的 5 個檔全通過；
    `tools/playthrough.py --level w1..w5 --godmode` 五世界皆 `cleared=True`、`deaths=0`、`missing sprites: []`；`tools/build.py` → 759 KB。

### 跨檔需求（enemies-bosses2 → 其他 agent）
- **mechanics（levels.js）— 新中魔王放置**：`{ t: 'rollarmor', x: 31, y: 9 }`，建議放 **w4 room 3「風之迴廊」**
  （該房 row 10 的 x=27~37 是 11 格連續平地、兩端是落差，正好讓「滾過來 → 撞牆／到邊緣散開」看得出來；y=9 即腳站 row 10）。
  理由：w2 r2 有 Bonkers、w3 r2 有 Mr. Frosty、w5 r3 有兩隻，**w4 目前沒有中魔王**；鐵甲滾球給 hammer，對接下來的魅塔騎士戰也很好用。
  一併建議比照其他中魔王房加上 `{ t:'gatekeeper', x, y }` + 出口門 `locked:true`（`level_check` 會檢查兩者要成對）。
  備選位置：w4 r3 的 x=85~95 平地（`{t:'rollarmor', x:89, y:9}`）、或 w5 r1「守衛長廊」任一段 ≥10 格平地。
  需求：**至少 10 格連續平地**，兩端有牆或落差；牠碰撞框 30×30、精靈最寬 44px，房間淨高請留 ≥ 3 格。
- **mechanics / player2（平衡回報，非我的檔案）**：`src/items.js` 這一輪對 `abilitystar` 的改動（落地彈跳 6 次 → 3 次、
  `life` 420 → `KB.PHYS.abilityStarLife`）**讓 `boss_test` 的 kracko / dedede fight 樣本從 3/3 掉到 2/3**。
  Bisect 證據：把 **只有** `src/items.js` 還原成 HEAD（我這輪的所有改動都留著）→ `tools/boss_test.py --runs 3` **ALL PASS**；
  只還原 `abilities.js` 或 `tilemap.js` 則仍然 FAIL。原因是掉落的能力星彈跳次數改了 → 落點改了 → 機器人撿不回劍。
  建議：能力星落地彈跳改回 6 次（或把第 2 次彈跳的水平摩擦調回原值），再跑 `tools/boss_test.py --runs 3` 確認。
- **ui-flow / menu**：Extra 難度的開關請寫 `KB.session.extra = true`（布林），敵人 / 魔王端已經全部接好；
  倍率要調整請改 `src/entity.js` 的 `KB.EXTRA`（`spd / proj / bossHp / miniHp / phase2`），不要在各處寫死。
  注意 `__kb.goto('game', …)` 與 `main.js` 開新遊戲時會重建 `KB.session`，**設定 extra 要在進入 GameScene 之後（或改成從存檔帶入）**。
- **audio2**：登場動畫用到的 sfx 都是既有的（`door` / `land` / `hammer` / `block` / `slide` / `cutter` / `unlock` / `enemyhit`）。
  若之後要做專屬的登場音效，建議加 `boss_intro`（一次性號角）與 `cape`（布料展開），我再接上去。

### 已知問題 / 未完成（enemies-bosses2）
- `tools/boss_test.py --runs 3` 目前 SUMMARY 是 `kracko fight=FAIL / dedede fight=FAIL`，**不是我這輪造成的**（見上面的 bisect：還原 items.js 就 ALL PASS）。
  我這輪新增的 `[intro]`、以及 idle / phase2 / mid / inhale 全部 PASS。
- 鐵甲滾球目前**沒有被放進任何關卡**（levels.js 不屬於我），所以 `playthrough` 不會遇到牠；實戰驗證是用 playwright 腳本生到 w1 room0 做的。
- 鐵甲滾球的鐵殼無敵是「彈開不扣血」（`hurt` 回傳 true，判定框算命中所以不會每幀重複觸發）。
  若 QA 覺得「打不動」太挫折，可把 `open` 硬直從 46/60 幀再拉長，或讓 slam 的預備期改成只擋一半傷害。
- Extra 難度的「敵人移動速度 ×1.2」只作用在 `Enemy.walk()` / `Baddie.chase()`（一般移動）；
  各招式裡寫死的衝刺速度（Mr. Frosty 的 charge、Bonkers 的 leap 等）沒有跟著加速，只有鐵甲滾球的滾動有乘 `exK`。
  要全面加速的話建議之後統一改成 `speed * this.exK`。


## player2

- [2026-09-11 21:50] 完成：**游泳打磨**（`src/player.js`）。
  入水 / 出水偵測由 `inWater !== wasInWater` 觸發 → `waterSplash(enter)`：以 `waterTopY()`（往上掃描水柱頂端）當噴發點，
  入水 6 顆藍白粒子（`KB.PHYS.splashParts`，往上噴、size 3）、出水 3 顆，兩者都播 `KB.audio.sfx('splash')`（audio2 已提供）。
  水中每 `KB.PHYS.bubbleEvery`(20) 幀從嘴邊（`cx + dir*7, cy-2`）冒 1 顆氣泡往上（`sfx('bubble')`）。
  **水中吸入**：無能力時按住攻擊 → `waterInhale()`，吸力範圍 `KB.PHYS.waterInhaleRange`(26px，陸上 52 的一半)、只吸 `inhalable` 的敵人 / 物件 / 投射物；
  吸進嘴後維持 `swim` 狀態且 `mouth` 有值，再按攻擊 → `spitWater()` 吐出 `proj_star`（dmg 4）。有能力時攻擊仍為原本的氣彈。
  水中受傷：沿用既有 `hurt()` 流程，只把擊退乘上 `KB.PHYS.waterKnock`(0.5)（vx 2.0→1.0、vy -2.2→-1.1）。
  新增 2 幀精靈 `kirby_swim_inhale`（`src/art/kirby.js`，橫躺大張嘴）；含物 / 吐星時 `currentAnim()` 會切過去。
  驗證：`engine_test.py` 第 33 / 34 / 38 組；截圖 `shots/agent_p2/splash_montage.png`（入水水花）、`shots/agent_p2/swim_montage.png`（氣泡）、
  `shots/engine/water_splash.png`、`shots/engine/water_inhale.png`（水中吸入後 +200 分）。
  重現：`.venv/bin/python tools/shot.py --scene game --level w1 --x 48 --y 8 --script "press right 16" --seq 10:2 --out shots/agent_p2/splash.png`。下一步：rideStar。

- [2026-09-11 22:05] 完成：**`player.rideStar(path, onArrive)` 騎乘傳送星**（`src/player.js` 新狀態 `'ride'`）。
  `path` 為世界座標陣列 `[[x,y],…]`（卡比中心會依序經過），以 `KB.PHYS.rideSpeed`(4px/frame) 固定速度飛行，
  轉角用 `KB.PHYS.rideTurn`(0.25) 對方向向量做 lerp 再正規化（平滑不折角）；飛行中無重力、`invincible` 為 true、`hurt()` 直接回 false、完全不吃輸入（按跳也不會中斷）。
  拖尾為黃白粒子（每 `rideTrailEvery`=2 幀 1 顆）。新增 2 幀精靈 `kirby_ride`（坐姿），星星畫在腳下 `bottom+12`，
  以 `KB.has('item_warpstar')` 判斷，沒有就退回 `proj_star`。抵達最後一點呼叫 `onArrive(player)`；若 `onArrive` 沒換場景 / 換房（state 仍是 `ride`）就自動 `setState('fall')` + `fx_sparkle` + 金色粒子。
  起飛播 `KB.audio.sfx('warp')`（audio2 已加 `SFX.warp = SFX.ride` 別名）。內建安全閥：3000 幀或連續 20 幀遠離目標點就跳下一點 / 結束。
  驗證：`engine_test.py` 第 35 組（進入 ride、無敵、拖尾、不可操作、經過中途高點、抵達誤差 <6px、onArrive 只呼叫 1 次、onArrive 換房也正常）；
  截圖 `shots/agent_p2/ride_03.png`、`ride_04.png`（卡比坐在星星上 + 黃色拖尾）、`shots/engine/ride_star.png`。下一步：梯子。

- [2026-09-11 22:15] 完成：**梯子打磨**（`src/player.js`）。
  爬到頂 / 底改走 `endClimbTop()`：站上去的同時設 `climbTopT = KB.PHYS.climbTopFrames`(6)，`draw()` 在這段期間改畫新精靈 `kirby_climb_top`（1 幀背影撐起，沒有此精靈時自動沿用原本的 idle / crouch 退路）並補 2 顆腳下塵。
  梯子上按攻擊 → `ladderPuff()`：發射 `proj_airpuff`（與漂浮吐氣同規格，dmg 1）**但不離開梯子**，冷卻 `KB.PHYS.ladderAtkCd`(14) 幀；爬梯中可用 ←/→ 改變面向再吐。
  驗證：`engine_test.py` 第 36 組；截圖 `shots/engine/ladder_puff.png`（卡比在梯子上、氣彈往右飛）。下一步：Extra 模式。

- [2026-09-11 22:25] 完成：**Extra 模式鉤子與新常數**（`src/const.js`、`src/player.js`）。
  `new KB.Player()` 建構時讀 `KB.session.extra`：true → `maxHp = hp = KB.PHYS.extraMaxHp`(3)，否則 `KB.MAX_HP`(6)。HUD（ui.js）本來就照 `p.maxHp` 畫心，不需改。
  能力星回收時間常數 `KB.PHYS.abilityStarLife = 600` 已定義（實際使用在 items.js → 見下方跨檔需求 1）。
  **SPEC 第 10 節既有手感常數一律未改**（測試第 37 組會檢查 walk/run/jump/grav/swimSpeed/swimUp）；新常數全部加在 `KB.PHYS` 尾端：
  `splashParts 6 / bubbleEvery 20 / waterInhaleRange 26 / waterKnock 0.5 / rideSpeed 4 / rideTurn 0.25 / rideTrailEvery 2 / climbTopFrames 6 / ladderAtkCd 14 / abilityStarLife 600 / extraMaxHp 3`。
  驗證：`engine_test.py` 第 37 組。下一步：測試收尾。

- [2026-09-11 22:40] 完成：**engine_test 擴充與回歸**（`tools/engine_test.py` 第 33~38 組，共 +29 項）。
  新增：入水 6 顆水花 / 入水進 swim / 水中氣泡每 20 幀 / 出水小水花 / 水中吸力 40px 外吸不到 / 20px 吸得到且 state 仍 swim / 水中含物吐星 /
  rideStar 全套（見上）/ 梯子吐氣彈 / 爬頂過渡幀 / 新精靈存在 / Extra maxHp 3 / 一般 maxHp 6 / abilityStarLife 600 / 新常數齊備 / SPEC 舊常數未變 / 水中與陸上擊退數值。
  驗證：`.venv/bin/python tools/engine_test.py` → **118/118 PASS**（原 89 項全數保留）；`tools/enemy_test.py` 332/332 PASS；
  `tools/playthrough.py --level w1 --godmode` → CLEAR 4256 幀 deaths=0；`--level w3 --godmode` → CLEAR 5834 幀 deaths=0；兩者 missing sprites 皆為空。
  截圖總表 `shots/agent_p2/sheet_kirby.png`（3 個新精靈都在，無洋紅缺圖）。

#### 跨檔需求（player2 → 總控 / 其他 agent）
1. **mechanics（`src/items.js`）— 能力星壽命與彈跳手感**：
   a) `KB.ITEMS.abilitystar` 的 `this.life = 420` 請改為 `KB.PHYS.abilityStarLife`（新常數，值 600），且 **Extra 模式減半**：
      `this.life = KB.PHYS.abilityStarLife * ((KB.session && KB.session.extra) ? 0.5 : 1)`。
   b) 彈跳手感：目前是「落地彈 6 次、每次固定 -2.6」，請改成 **落地只彈 2 次**（例如第 1 次 `-2.8`、第 2 次 `-1.6`，第 3 次起 `vy=0` 且 `vx *= 0.5`）。
   c) 閃爍與消失：**8 秒（480 幀）後開始閃爍、10 秒（600 幀）消失** → `draw()` 的 `this.life < 90` 判斷請改成 `this.life < KB.PHYS.abilityStarLife - 480`（即剩餘 120 幀＝最後 2 秒閃爍；Extra 模式因 life 減半會自動變成 4 秒後閃爍）。
      我只負責定義常數，`items.js` 屬 mechanics。
2. **mechanics（`src/items.js` 的 `KB.ITEMS.warpstar`）— rideStar API**：
   `player.rideStar(path, onArrive)`；`path` 是**世界座標**點陣列 `[[x,y],…]`（卡比**中心**會依序經過，不是磁磚座標，需要 `tileX*16+8`）；
   回傳 `true`（成功）/ `false`（path 空）。飛行中卡比無敵、無重力、不吃輸入，速度固定 4px/frame。
   抵達最後一點時呼叫 `onArrive(player)`：**要換房就在裡面呼叫 `KB.game.loadRoom(room, x, y)`（或走 `useDoor`/`fadeTo`）**，
   此時 player2 這邊不會再強制落地；若 `onArrive` 沒換場景 / 換房（或沒傳 onArrive），卡比會自動 `setState('fall')` + `fx_sparkle` 落地。
   星星本體的繪製由 player 端負責（優先用 `item_warpstar`，沒有就用 `proj_star`），**warpstar 物件在卡比碰到後請自己 `dead = true` 或隱藏**，否則畫面上會有兩顆星。
   注意：騎乘期間**不做磁磚碰撞**（會直接穿過牆壁與地板），路徑請自己畫在空曠處；房間邊界外也不會被 `fellOut` 殺掉。
3. **ui-flow（`src/ui.js` / `src/main.js` / 新 `src/arena.js`）— Extra 模式旗標**：
   `maxHp = 3` 是在 `new KB.Player()` 當下讀 `KB.session.extra` 決定的，但 `ui.js`（新遊戲 / 選關）與 `main.js` 的 `__kb.goto('game')` 都會把 `KB.session` 整個重設成 `{lives, score}`，
   會把 `extra` 洗掉。啟用 Extra 模式時請改成保留旗標，例如 `KB.session = { lives: KB.START_LIVES, score: 0, extra: !!KB.save.extraUnlocked && chosenExtra }`。
4. **總控 / mechanics（`src/game.js` 繪製順序，非必要）**：粒子是在 `map.drawWater()` **之前**畫的，所以水中的氣泡 / 吸力粒子會被水面色板壓暗（見 `shots/agent_p2/swim_montage.png`）。
   若把 `for (const q of this.parts)` 那行移到 `this.map.drawWater(...)` 之後，水中特效會清楚很多（陸上完全不受影響）。

## audio2

### 提供給其他 agent 的 API 一覽（Round 2 新增；src/audio.js，全部 try/catch，無 AudioContext 也不拋錯）
| API | 說明 |
|---|---|
| `KB.audio.ambient(key\|null)` | **環境音層**。key：`'water' 'wind' 'cave' 'castle'`。低音量循環噪音床（noise buffer + 濾波 + 慢速 LFO），掛在 **sfxBus 之下**（跟隨音效音量、M 鍵靜音）。與音樂**完全獨立**：`music(null)` 不會停掉 ambient，`ambient(null)` 也不影響音樂。同 key 重複呼叫**不重啟**（可每幀安全呼叫）；切換時交叉淡出 0.35s，停止淡出 0.6s；未 unlock 時記為 pending，unlock 後自動開始。回傳目前的 key。**切房時由 `room.ambient` 呼叫**（mechanics / game 接線）。 |
| `KB.audio.status()` | 多回傳 `ambient`（目前環境音 key）、`ambientPending`、`ambientCount` |
| `KB.audio.AMBIENT_NAMES` / `AMBIENT` / `renderAmbient(key, secs)` | 名稱表 / 設定表 / 離線渲染（測試工具用） |
| `KB.audio.SFX_THROTTLE` / `THROTTLE_MS` | 每音效節流表（毫秒）與預設值 80ms；查表後才套用，`0` = 不節流 |

**新 sfx（11 個 + 1 別名）**

| 名稱 | 用途 / 呼叫建議 | 節流 |
|---|---|---|
| `splash` | 入水 / 出水噗通（低頻撲通 + 水花掃頻 + 水珠） | 120ms |
| `bubble` | 水中小氣泡（短促上滑 blip） | 45ms |
| `wind` | 短風聲，可循環呼叫（約 0.9 秒一陣） | 150ms |
| `torch` | 火把劈啪（底噪 + 3 顆爆裂） | 90ms |
| `fuse` | 導火線嘶嘶，**每 6 幀（≈100ms）重複呼叫**即為連續燃燒聲 | 50ms |
| `melt` | 冰磚融化（兩滴水滴滴答 + 細碎高頻） | 90ms |
| `hardblock` | 打不破的硬磚金屬叮（兩個失諧高音 + 悶響） | 80ms（預設） |
| `count` | 結算逐項跳數字的 tick，**每 4 幀（≈67ms）呼叫** | **25ms**（已放行） |
| `count_end` | 計數結束叮咚 | 80ms |
| `ride` | 傳送星起飛咻（上升掃頻 + 星光琶音） | 80ms |
| `warp` | **`ride` 的別名**（`src/player.js` 的 rideStar 目前呼叫 `sfx('warp')`，兩個名稱同一個聲音，都可用） | 80ms |
| `essence` | 能力台座取得（G-B-D-G 短琶音，比 `ability` 短、不 duck 音樂） | 80ms |

**新 music（9 首，全部原創）**

| key | 內容 |
|---|---|
| `result` | 結算：C 大調 8 小節明亮號角，**不循環**，結尾停在 C 主和弦（13.7 秒） |
| `arena` | 競技場：E 小調 **BPM 160**、16 小節緊湊 loop（八分驅動貝斯 + 短促密集鼓） |
| `arena_rest` | 休息房：G 大調柔和 loop，8 小節素材、order `ABAB`（40 秒一輪） |
| `w_intro` | 關卡開場短句：C 大調 2 小節（**3.0 秒**，不循環）；建議與開場橫幅同時 `music('w_intro')`，結束後再切關卡曲 |
| `green2` `castle2` `island2` `cloud2` `dedede2` | 各世界**第二首**：與原曲同調性（C / Dm / F / D / Bb）但主旋律全新，16 小節 loop，供每個世界後半房間使用 |

共 **52 個 sfx（含 1 別名）、26 首 music、4 種 ambient**；完整清單見 `node tools/audio_check.js` 輸出。

- [2026-09-11 19:38] 完成：**11 個新 sfx**（splash / bubble / wind / torch / fuse / melt / hardblock / count / count_end / ride / essence，另加 `warp` → `ride` 別名給 player.js）＋ **每音效節流表 `SFX_THROTTLE`**（原本全域 80ms 會吃掉每 4 幀呼叫的 `count`，改為查表：count 25ms、fuse 50ms、bubble 45ms、torch/melt 90ms、splash 120ms、wind 150ms，其餘維持 80ms）。
  驗證：`node tools/audio_check.js` 新增「音效節流」檢查（count 每 4 幀、fuse 每 6 幀的節流值必須小於呼叫間隔）全部通過。
  下一步：環境音層 + 新曲。

- [2026-09-11 19:42] 完成：**環境音層 `KB.audio.ambient(key|null)`**（water / wind / cave / castle）。實作：獨立 `ambBus` GainNode 掛在 sfxBus 下（受音效音量與靜音控制）；每個 key 由 1~2 層 looping noise buffer + Biquad 濾波 + 慢速 LFO（濾波掃動 / 音量起伏）組成，cave / castle 另加低頻 sine 襯底；淡入 1.0~1.6 秒、切換交叉淡出 0.35 秒。與音樂完全獨立、同 key 不重啟、未 unlock 時 pending。
  驗證：`node tools/audio_check.js` 新增「環境音 ambient」區段（名稱齊全、layers 設定合法、各層總音量 0.04~0.25、`music(null)` 不影響 ambient）全部通過；`render_music.py` 離線渲染 4 種 ambient peak 0.040~0.057（非靜音、不爆音）。
  下一步：9 首新曲。

- [2026-09-11 19:46] 完成：**9 首新曲**（result / arena / arena_rest / w_intro / green2 / castle2 / island2 / cloud2 / dedede2），全部原創旋律；伴奏沿用既有樣式產生器（cmp / tres / oom / arpE / arpUD / cal / syn / mar / oct / stab / dr8）但主旋律逐小節新寫。`arena_rest` 用 order `ABAB` 讓 8 小節素材展開成 16 小節（與 `secret` 同作法，滿足 audio_check 的循環曲 ≥16 小節規則）。
  驗證：`node tools/audio_check.js` 曲目檢查（各軌小節數一致、每小節 16 token、音符 / 鼓 token 合法、循環曲 ≥16 小節且有段落變化）26 首全過。

- [2026-09-11 19:52] 完成：**工具同步擴充**。`tools/audio_check.js`：SPEC 名單補 11 新 sfx + `warp` + 9 新 music，新增 `SPEC_AMBIENT` 名單與「環境音」「音效節流」兩個檢查區段，並掃描 `src/*.js` 的 `audio.ambient('x')` / `ambient: 'x'` 引用。`tools/render_music.py`：新增 `--amb-secs`、把 `AMBIENT_NAMES` 併入渲染清單（kind `amb` → `renderAmbient`）、新增 ambient 即時 API 檢查（逐一切換 / 同 key 不重啟 / music 獨立性 / 未知名稱）與節流表檢查。`tools/audio_test.html`：新增「環境音層 ambient(key)」按鈕列（點同一顆可切掉）與離線渲染 amb 項。
  驗證：
  - `node tools/audio_check.js` → **全部通過**（52 sfx / 26 music / 4 ambient）。
  - `.venv/bin/python tools/render_music.py` → **全部通過**；新 sfx peak 0.066~0.327、新 music peak 0.244~0.322、ambient peak 0.034~0.057（皆非靜音、皆 < 1.0 不爆音）；ambient 即時 API `{steps 全對, afterMusic: water, afterMusicNull: water, afterNull: None}`；節流表檢查通過。
  - playwright 實機：`index.html?debug=1&mute=1` → unlock → `setMute(false)` + `setVolume({music:0,sfx:0})`（真的跑合成但不出聲）→ 逐一呼叫 12 個新 sfx、連續 12 輪 `count`/`fuse` + `__kb.step(4)`、逐一切換 9 首新曲（每首確認 `status().playing` 正確且 `step > 0`）、逐一切換 4 種 ambient、驗證 music/ambient 獨立、再進 `w1` 跑 240 幀 → **console 訊息 0 筆、無 error、無 unknown sfx/music/ambient**。
  - 試聽 WAV：`shots/agent_audio2/`（music_result / arena / arena_rest / w_intro / green2 / castle2 / island2 / cloud2 / dedede2 各 14 秒；amb_water / wind / cave / castle 各 8 秒；sfx_splash / bubble / wind / torch / fuse / melt / hardblock / count_end / ride / essence）。

#### 跨檔需求（由總控 / 對應 agent 處理）
- **docs/SPEC.md 第 9 節**的 sfx / music 名稱清單需補上：sfx `splash bubble wind torch fuse melt hardblock count count_end ride warp essence`；music `result arena arena_rest w_intro green2 castle2 island2 cloud2 dedede2`；並新增「環境音 ambient：water / wind / cave / castle」一小節（audio2 agent 無權編輯 SPEC）。
- **mechanics / levels**：房間資料請加 `ambient: 'water'|'wind'|'cave'|'castle'|null` 欄位；切房時呼叫 `KB.audio.ambient(room.ambient || null)`（同 key 重複呼叫不重啟，可放在 enterRoom 無腦呼叫）。建議：w3 水下房 `water`、w4 雲 / 高空房 `wind`、w1/w2 洞窟房 `cave`、w5 城堡房 `castle`。
- **mechanics（互動磁磚）**：硬磚打不破 → `sfx('hardblock')`；導火線燃燒中**每 6 幀** → `sfx('fuse')`；冰磚融化 → `sfx('melt')`；火把裝飾 → `sfx('torch')`；能力台座取得 → `sfx('essence')`；傳送星 → `sfx('ride')`（或既有的 `sfx('warp')`，同一個聲音）。
- **player2**：入水 / 出水 → `sfx('splash')`；水中氣泡 → `sfx('bubble')`。`src/player.js:598` 目前呼叫 `sfx('warp')`，已在 audio.js 加別名指向 `ride`，兩邊都可用、不必改。
- **ui-flow（結算）**：逐項跳數字**每 4 幀** → `sfx('count')`（節流已放寬到 25ms）；該項數完 → `sfx('count_end')`；結算畫面 → `music('result')`（8 小節不循環，13.7 秒，結尾停在主和弦，可直接讓它自然結束）。
- **ui-flow（競技場）**：戰鬥 → `music('arena')`；休息房 → `music('arena_rest')`；魔王登場仍可沿用 `music('miniboss')` / `sfx('phase2')`。
- **ui-flow / game（關卡開場橫幅）**：進第一房時 `music('w_intro')`（3.0 秒不循環），橫幅收掉後再 `music(level.music || theme)`。
- **levels**：每個世界後半房間可改用第二首曲 `green2 / castle2 / island2 / cloud2 / dedede2`（與原曲同調性，切歌不會撞調）。

## qa2
- [2026-09-11 19:50] 完成：**第一部分 非無敵難度調校**（5 世界 × sword/fire/none = 15 次 playthrough，**不加 --godmode**，`--maxframes 30000`）。
  結果：**15 / 15 全部 cleared=False**，每次都是 `deaths=4` → GameOver（3 命用完）；10 次連 room 0 都沒走完。
  加跑 5 魔王房 × sword/none = 10 次，**只有 w4 魅塔騎士 + sword 通關（1336 幀、deaths=0）**。
  產出：`docs/QA_REPORT.md` 的 **R2-1 死亡熱點表**（前 10 名 + 判定「機器人笨」/「關卡不公平」）與 **R2-2 魔王難度曲線**。
  結論：難度曲線目前是反的（w4 ≪ w2 < w1 ≪ w5 ≈ w3）；死亡高度集中在 3 個座標（w1 r0 x≈1197 Sir Kibble / w5 r0 x≈810 無敵 Shotzo / w2 r0 x≈1030 Poppy Bros 瞄準炸彈）。
  驗證：`.venv/bin/python tools/playthrough.py --level wN --ability <sword|fire|none> --maxframes 30000`；熱點截圖 `shots/agent_qa2/hot_*.png`（12 張，皆已 Read 看圖）。下一步：Round 1 回歸截圖。
- [2026-09-11 19:50] 完成：**第二部分 Round 1 全功能回歸截圖**（43 張全部用 Read 看過）。**OK 38 項 / 問題 5 項**。
  OK：暫停能力卡 9/9、標題選單、能力圖鑑 8/8 頁、操作說明、設定、選關 ★ 2/3（注入 `KB.save.stars`）、5 秘密房、5 魔王二階段、3 新敵人實際位置、「?」+ toast、低血量 HUD、w1 魔王房同框。
  Round 1 遺留：P0-01 已修但**過頭**、P1-05 / P2-12 / P2-13 已修、P2-14 / P2-15 已做；**P2-07 / P2-09（w3 水域硬邊 + 雙水平線）與 P2-11（w5 出生點壓在金柱上）仍在**。
  截圖：`shots/agent_qa2/`（pause_*.png、title_*.png、gallery_p1~8.png、help_page.png、settings.png、select_stars.png、secret_*.png、phase2_w*_*.png、enemy_*.png、hud_lowhp.png、w1r3_bosscam.png）。
  問題已寫進 `docs/QA_REPORT.md` 的 **R2-4**（P0×1 已自行消失、P1×6、P2×6，每列都標了建議負責 agent）。下一步：第三部分 Round 2 新功能驗證（分批重讀 PROGRESS.md）。
  **給各 agent 的重點（詳見 QA_REPORT R2-4）**：
  - player2：R2-P0-01　19:34 觀測到 `this.waterSplash is not a function`（player.js:88）讓所有 playthrough 中斷，19:36 已自行修好；請收工前跑 `for f in src/*.js src/art/*.js; do node --check "$f"; done`。
  - enemies-bosses2：R2-P1-02 魅塔騎士削弱過頭（現為 5 魔王最弱）、R2-P1-03 威斯比 `solid:false` 讓玩家卡在樹身裡被連續扣血、R2-P1-06 Sir Kibble 接刃 / Poppy Bros 瞄準炸彈在 w1/w2 第一房就全開。
  - mechanics：R2-P1-04 w3/w4/w5 魔王房 spawn 與 bossPos 只差 16px（建議 ≥96px）、R2-P1-05 無敵 Shotzo 擋在 w5 r0 唯一動線、R2-P1-07 主線番茄不足、R2-P2-11 / R2-P2-12。
  - ui-flow：R2-P2-08 HUD 能力中文名仍 12px、R2-P2-09 能力圖鑑 6/8 頁說明被截斷、R2-P2-10 圖鑑行首標點、R2-P2-13 開場橫幅與右上 toast 重疊。

- [2026-09-11 22:05] 完成：**第三部分 Round 2 新功能驗證（第 1~2 輪）**。已驗 13 項：結算畫面、開場橫幅、競技場（選能力 / 戰鬥 HUD / 休息室）、HUD 14px、設定「畫面縮放」+ F 全螢幕、選關 BEST、標題新選單、互動磁磚 X / F / I、暗房、能力台座 essence、傳送星 warpstar、游泳水花、新中魔王 rollarmor 精靈。
  **新問題 5 項**（詳見 `docs/QA_REPORT.md` R2-6a）：
  - **R2-P1-14（mechanics）水中看不見卡比**：`game.js` 先畫實體、之後才 `map.drawWater()` 且 `globalAlpha=0.72`，水中的卡比 / 敵人 / 食物全被壓成同一個青藍色（放大圖 `shots/agent_qa2/r2_swim_zoom.png`）。這直接對應死亡熱點 #4 / #9。建議 alpha 降到 0.3~0.4 或改繪製順序。
  - **R2-P1-15（enemies-bosses2 + mechanics）新中魔王 rollarmor 沒有放進任何關卡**：`KB.ENEMIES.rollarmor` 已註冊、8 張精靈齊全，但 5 世界 30 房的 entities 沒有任何一筆 `t:'rollarmor'`。
  - R2-P2-16（ui-flow）標題選單面板壓住 logo 的「STAR」字；R2-P2-17（mechanics）暗房裡敵人幾乎看不見（建議光圈 40→52px）；R2-P2-18（ui-flow）結算畫面關名被面板上框線切到。
  已修確認：**R2-P2-08（HUD 能力中文名 12px）→ ui-flow 已改 `size: UI.MS`**。
  截圖：`shots/agent_qa2/r2_*.png`（結算 5 張、競技場 3 張、機關 6 張、游泳 3 張、rollarmor 精靈 1 張、標題 / 設定 2 張，皆已 Read 看圖）。
  未完成：mechanics 與 enemies-bosses2 尚未在 PROGRESS 回報，Extra 難度的實機量測待他們回報後再做（第 3~4 輪）。
- [2026-09-11 22:20] 完成：**第三部分第 3~4 輪重讀 + 整體健康度回歸**。
  `node tools/level_check.js` → **0 error / 1 warning**；`node --check` 掃 `src/*.js` + `src/art/*.js` → **全過**（19:34 的 `waterSplash` 暫時性錯誤已消失）；
  `playthrough.py --level wN --ability sword --godmode --maxframes 30000` × 5 → **5/5 cleared=True、deaths=0、missing sprites 空**（w1 4686 / w2 7755 / w3 6075 / w4 8449 / w5 9686 幀）。
  → **路線完整性沒有退步；退步的是「不用無敵能不能走完」（從來沒被驗過）**。建議驗收條件改成兩條：① `--godmode` 必須通關；② 不加 `--godmode` 時 `deaths ≤ 2`（目前 5 個世界都不過）。
  Extra 模式已驗（HUD 3 格 HP，`shots/agent_qa2/r2_extra_hud.png`），但建議等一般難度調完再開放。
  另補：`r1_abilityflash.png` 顯示**開場橫幅 2 秒內跳 toast 會整行疊在「WORLD n」上、兩行都不可讀** → R2-P2-13 已升級為 **P1**（ui-flow）。
  **mechanics 與 enemies-bosses2 到 20:00 為止仍未在 PROGRESS 回報**（程式已進檔，是直接掃 src 驗的），請兩位補寫，否則總控無法分辨「做完」與「寫到一半」。
  qa2 三部分全部完成；完整報告見 `docs/QA_REPORT.md` 的「# Round 2（qa2 agent）」章節（R2-0 ~ R2-7），截圖 60 張於 `shots/agent_qa2/`。
