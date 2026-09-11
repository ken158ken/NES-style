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
- [doing] 每能力多招：劍(空中迴旋斬、上挑、蓄力劍氣)、鎚(蓄力大迴旋、空中落地震)、火(火焰衝刺)、冰(冰塊踢)、光束(蓄力波)、刀刃(上拋回收、下劈)、電擊(蓄力放電範圍)、石頭(斜坡滾動、變身多種造型)
- [todo] 敵人行為：追擊 / 巡邏 / 察覺玩家轉向、被吸入掙扎、群體配置
- [todo] 新敵人 3 種（含可給新能力或無能力）與對應像素圖，sheet 截圖確認
- [todo] enemy_test 覆蓋新招式與新敵人

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
