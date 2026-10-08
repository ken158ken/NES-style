# Round 12 任務簡報（總控 2026-10-08）— 每位 agent 開工先讀這份，再讀 CLAUDE.md → docs/STATUS.md → docs/PROGRESS.md 末尾「總結」→ docs/TASKS.md 末尾

## 共用規則
1. **不 git**（總控在母 repo `遊戲開發/` commit）。工具用 `.venv/bin/python`；**改畫面必截圖並用 Read 看圖**（`tools/shot.py`、手機 `tools/mobile_shot.py`），看完的截圖放 `shots/agent_<名>/`，收工前只留關鍵 3 張以內，其餘刪。
2. 品質基準（STATUS.md「品質基準」）收工前全綠：`tools/engine_test.py`、`enemy_test.py`、`boss_test.py`、`test_*.py`、`level_check.js`、`audio_check.js`、`playthrough.py --godmode`；自己新加的功能要有自己的 `tools/test_<名>.py`（≥ 20 項）。
3. **共用檔只准 Edit 插入、不准 Write 整檔重寫**（`src/main.js`、`src/menu.js`、`src/ui.js`、`src/game.js`、`src/const.js`、`src/saves.js`、`index.html`、`tools/build.py`）。新功能優先放新檔 `src/<功能>.js` 並在 `index.html` 加 `<script>`（載入順序：const → … 看 index.html 現況，新檔放 `main.js` 之前）。
4. 美術 / 音樂一律原創（像素風、12 / 16px 像素字型；新音樂走 `src/audio.js` 既有曲式 API）；使用者要「腦洞變身、特效不嫌多」、字要清晰。手機（Round 11 觸控 / PWA）不能壞：新畫面要在 `mobile_shot.py` 的 iPhone 13 橫向看一次。
5. 等待背景程序不准用自我匹配的 `until ! pgrep -f`；用 log 哨兵 `EXIT=` + `timeout`。
6. 收工：`docs/PROGRESS.md` 末尾新增 `## <卡名>（Round 12，2026-10-08）` 五節（① 做了什麼 ② 驗證（數字）③ 偏離 ④ 跨檔需求 ⑤ 留給後續）；`docs/STATUS.md` 由總控改，不要動；**不要跑 build.py**（總控統一跑）。

## 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| K12-1 music-box | **音樂盒**（標題 / 暫停選單進入：列出全部曲目含魔王曲 / 覺醒曲 / 世界曲，播放 / 停止 / 可視化波形或音符條、解鎖條件 = 聽過即解鎖、存進存檔）＋ **成就獎勵擴充**（成就 40 個各綁一個獎勵：標題背景皮膚 ×8、標題曲 ×6、卡比配色 ×N、進度條 / 已領標示；新獎勵在成就頁可切換）＋ PWA 選單「加到主畫面」「有新版本（重新載入）」兩項（`KB.PWA` API 已有） | 新 `src/musicbox.js`、`src/rewards.js`；`src/progression.js`（Edit）、`src/menu.js`（Edit 插入入口）、`src/saves.js`（Edit 新欄位）、`src/pwa.js`、`tools/test_musicbox.py` |
| K12-2 ghost-replay | **幽靈重播**：每關紀錄最佳通關的輸入序列（定幀、壓縮存 localStorage 槽位），下次玩同關可開「幽靈」半透明卡比同步跑；結算畫面「觀看最佳重播」全程自動播；**關卡計時排行**（每關最佳 5 筆、含日期 / 能力）；重播在手機也能看 | 新 `src/replay.js`；`src/records.js`（Edit）、`src/game.js`（Edit：每幀 input 快照 hook 與 ghost draw hook）、`src/input.js`（Edit：可注入重播輸入）、`src/ui.js`（Edit 結算入口）、`tools/test_replay.py` |
| K12-3 level-editor | **關卡編輯器**（標題選單進入）：用既有 tilemap / enemies / items 定義，格子畫筆、物件放置、起點 / 終點、測玩（即時進遊戲、ESC 回編輯）、存 localStorage 多槽、**分享碼**（base64 壓縮文字可貼給朋友匯入）、**自製關卡選單**；手機也能用（觸控畫筆 + 工具列 ≥ 44px） | 新 `src/editor.js`、`src/editor_ui.js`、`src/levels_custom.js`；`src/tilemap.js`（Edit：由資料建關）、`src/menu.js`（Edit 入口）、`tools/test_editor.py` |
| K12-4 polish-docs | 已知問題清掃：說明頁第 1 頁「可一直上升」字面改成房頂封頂的正確描述並重排右欄；`atkDir` / `pickMode` 四份收斂到 `src/const.js`（行為零變化，engine_test / 各 test 全綠）；`__kb.entities()` / enemy_test HOOK_JS 加 `w0/h0/meleeScaled`；Round 10 待裁決的「過大框 48 招」做成設定頁一個開關「貼身判定加倍」（預設開，關掉 = `meleeScale 1`）；說明頁新增音樂盒 / 幽靈 / 編輯器三頁（K12-1~3 收工後補，先留佔位） | `src/ui.js`（說明頁）、`src/const.js`、四個 `src/abilities*.js` 只做 atkDir / pickMode 收斂、`src/entity.js`（meleeScale 開關）、`tools/enemy_test.py` HOOK、`說明.md` |
