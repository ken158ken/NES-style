# 卡比之星（同人版）— 開發 Context（所有 agent 必讀）

> 零相依 HTML5 Canvas 平台遊戲，雙擊 `index.html` 即可玩。規格細節見 `docs/SPEC.md`，
> 進度與待辦見 `docs/PROGRESS.md`、`docs/TASKS.md`。**所有美術 / 音樂 / 關卡皆須原創**（程式手繪像素、Web Audio 合成），
> 嚴禁任何任天堂 / HAL 的 ROM、圖片、音訊。

## 快速指令（Linux 開發機）
```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python                         # 專案 venv（已裝 playwright + pillow，Chromium 已下載）
$PY tools/shot.py --scene title --steps 120 --out shots/agent_ui/title.png            # 截圖（scale 3）
$PY tools/shot.py --scene game --level w1 --room 0 --ability fire --script "press right 40; tap attack 1; press attack 10" --out shots/agent_x/fire.png
$PY tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 10" --out shots/agent_ui/pause.png
$PY tools/shot.py --scene sheet --filter kirby --out shots/agent_x/sheet_kirby.png    # 精靈總表
$PY tools/engine_test.py                    # 引擎機制測試（目前 39/39 PASS，改 player/tilemap 後必跑）
$PY tools/enemy_test.py / tools/boss_test.py  # 敵人 / 魔王測試
$PY tools/playthrough.py --level w1 --ability sword --godmode   # 自動通關機器人（每個世界都要能過）
node tools/level_check.js                   # 關卡資料靜態檢查（改 levels.js 後必跑）
$PY tools/build.py                          # 打包 dist/卡比之星.html（收工前跑）
```
- 場景：`title select game gameover ending sheet`；`--script` 指令：`press <k,k> <frames> | tap <k> <frames> | step <n> | release | shot <name>`；key：`left right up down jump attack select start`。
- 截圖後**一定要用 Read 工具打開 PNG 實際看圖**，確認畫面正確再繼續；每個 agent 存到自己的 `shots/agent_<名稱>/`（已 gitignore）。
- 除錯 API（`?debug=1`）：`__kb.goto / step / press / tap / release / state / entities / missing / hitbox`（main.js）。
- 缺精靈會畫洋紅方塊並列在 `__kb.missing()`；shot.py 會印出 `MISSING SPRITES`。

## 架構重點
- 全域命名空間 `KB`，classic script，`index.html` 依序載入（新增檔案要同時加進 `index.html`，`tools/build.py` 會自動內嵌）。
- 內部解析度 256×224，遊戲區 256×192，HUD 在 y 192~224；固定 60fps，`dt` 視為 1 幀。
- 文字：ASCII 走 8×8 點陣字（`src/art/font.js`）；中文用 OFL 像素字型（`assets/fonts/`：縫合像素 12px、Unifont 16px 子集）由 gfx.js `KB.loadPixelFonts` 以 FontFace 載入、原生尺寸繪製 + 二值化；載入失敗退回系統黑體放大流程。正文 12px、標題 16px，不要用 14px。dist 由 build.py 把字型 base64 內嵌成 `KB.FONT_DATA`。
- 場景：`KB.setScene(s)`，s 有 `update(dt) / draw(ctx) / enter / exit`。GameScene 在 game.js，其他在 ui.js。
- 存檔：`KB.save`（localStorage `kirbystar_save`），`KB.saveGame()`。

## 多 agent 協作規則（避免互踩）
| 領域 | 擁有檔案（只能改這些） |
|---|---|
| ui-menu | `src/ui.js`、`src/gfx.js`(文字)、`src/game.js`(僅暫停/說明/HUD 呼叫處)、`index.html`(僅新增 script) |
| player-feel | `src/player.js`、`src/const.js`、`src/tilemap.js`、`src/input.js`、`src/game.js`(僅 `updateCamera`)、`tools/engine_test.py` |
| abilities-enemies | `src/abilities.js`、`src/enemies.js`、`src/entity.js`、`src/art/enemies.js`、`src/art/kirby.js`、`tools/enemy_test.py` |
| levels-bosses | `src/levels.js`、`src/bosses.js`、`src/items.js`、`src/art/bosses.js`、`src/art/world.js`、`src/art/backgrounds.js`、`src/art/items_ui.js`、`tools/boss_test.py`、`tools/playthrough.py`、`tools/level_check.js` |
| audio | `src/audio.js`、`tools/audio_check.js`、`tools/render_music.py` |
| research-qa | `docs/DESIGN_REFERENCE.md`、`docs/QA_REPORT.md`（src 唯讀） |
- 需要別人檔案的改動：在 `docs/PROGRESS.md` 自己的區段寫「跨檔需求」，由總控整合。
- 編輯前重新讀檔（其他 agent 可能剛改過）；用小範圍 Edit，不要整檔 Write 覆蓋。
- 常數（`KB.PHYS`）非 player-feel agent 不得更動。

## 進度回報協定（防中斷遺失）
- 每完成一個里程碑（≤ 30 分鐘工作量）就在 `docs/PROGRESS.md` 自己的區段追加：
  `- [時間] 完成：…；驗證：<指令 / 截圖路徑>；下一步：…`
- 收工前：跑對應測試、`tools/build.py`、把最終截圖路徑與「未完成 / 已知問題」寫進 PROGRESS.md。
- 專案有 git（本機）；總控負責 commit，agent 不要 commit / reset。
