# 卡比之星（同人版）— 開發 Context（所有 agent 必讀，2026-09-15 更新）

> 零相依 HTML5 Canvas 平台遊戲，雙擊 `index.html` 或 `dist/卡比之星.html` 即可玩。
> 現況總覽看 `docs/STATUS.md`（先讀這份）；規格 `docs/SPEC.md`；歷史進度 `docs/PROGRESS.md`（各輪各 agent 區段 + 每輪「總結」）；任務板 `docs/TASKS.md`；QA `docs/QA_REPORT.md`。
> **所有美術 / 音樂 / 關卡皆原創**（程式手繪像素、Web Audio 合成）；字型為 OFL 授權像素字型。使用者決定：不改角色 / 關卡名（私用）、難度維持目前。

## 快速指令（Linux 開發機，專案 venv）
```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python                     # 已裝 playwright（Chromium 已下載）、pillow、fonttools、brotli、markdown
$PY tools/shot.py --scene title --steps 120 --out shots/agent_x/title.png            # 截圖（scale 3）；場景：title select game gameover ending sheet
$PY tools/shot.py --scene game --level w1 --room 0 --ability fire --script "press right 40; tap attack 1; press attack 10" --seq 6:4 --hitbox --out shots/agent_x/fire.png
$PY tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 10" --out shots/agent_x/pause.png   # 暫停卡
$PY tools/engine_test.py                # 引擎 167 項（改 player / tilemap / gfx 後必跑）
$PY tools/enemy_test.py [--extra]       # 敵人 393（--extra 79）
$PY tools/boss_test.py --runs 3 [--extra] [--boss kracko]   # 7 魔王（fight 全勝 PASS、2/3 WARN）
$PY tools/test_weapons.py / test_magic.py / test_forms.py / test_charge.py / test_mix.py / test_mix2.py / test_helper.py / test_elements.py / test_progression.py / test_awaken.py / test_extra.py / test_challenge.py / test_saves.py / test_skins.py
$PY tools/playthrough.py --level w1 --ability sword --godmode [--extra] [--challenge tower --seed 1 --until-floor 3]   # 自動通關機器人（w1~w7 都要 cleared）
node tools/level_check.js [--extra]     # 關卡靜態檢查（改 levels*.js 後必跑）
node tools/audio_check.js               # 音效 / 音樂名單與節流檢查
$PY tools/font_subset.py [--check]      # 新增中文字串後重做 16px 字集（Unifont 子集）
$PY tools/build.py                      # 打包 dist（內嵌 JS + 字型 base64）
```
- `--script` 指令：`press <k,k> <frames> | tap <k> <frames> | step <n> | release | shot <name>`；key：`left right up down jump attack select start`。需要 evaluate 的情境自己寫 playwright 小腳本（參考 shots/agent_qa5/mshot.py、shots/agent_qa7/kb.py）。
- **截圖後一定要用 Read 打開 PNG 看圖**；每個 agent 存到自己的 `shots/agent_<名稱>/`（shots/ 整個已 gitignore）。
- 除錯 API（`?debug=1`）：`__kb.goto / step / press / tap / release / state / entities / missing / hitbox`（main.js）。缺精靈畫洋紅方塊並列在 `__kb.missing()`。
- debug 模式下 `KB.UI.unlockAll` 為 true（全關 / 全能力 / 全配色顯示），測「鎖定」畫面要先設 false。

## 架構重點
- 全域 `KB`，classic script，`index.html` 依序載入 55 個檔（新增檔案要加進 index.html；build.py 自動內嵌）。載入順序：const → gfx → input → audio → tilemap → entity → vfx → elements → art/* → skins → player → abilities*（8 基本 / weapons / magic / forms / mix / mix2）→ helper → items → enemies* → bosses*（bosses / w6 / w7）→ levels*（levels / w7 / extra）→ game → progression → awaken → records → saves → keyconfig → ui → menu → arena → challenge → main。
- 內部解析度 256×224，遊戲區 256×192，HUD y 192~224；固定 60fps，`dt` 視為 1 幀；速度單位 px/frame。
- **文字**：ASCII 走 8×8 點陣字（art/font.js）；中文用像素字型（assets/fonts：縫合像素 12px、Unifont 16px 子集）由 gfx.js `KB.loadPixelFonts` 載入、原生尺寸繪製 + 二值化，16px 假粗體；缺字整串退 12px；載入失敗退系統黑體超取樣。**字級只用 12 與 16，不要 14**。中文一律經 `KB.UI.text`（ui.js）呼叫。
- 場景：`KB.setScene(s)`，s 有 `update / draw / enter / exit`。GameScene（game.js）、Title / Select / Result / GameOver / Ending（ui.js）、選單類（menu.js）、Arena、Challenge、Records、SaveSelect、KeyConfig。
- 存檔：3 槽 `kirbystar_save_1~3` + 全域 `kirbystar_global`（settings / bindings），`KB.SAVES`（saves.js）；`KB.saveGame()` 存目前槽。格式見 SPEC 6.6。
- 系統 API 一覽：`KB.VFX`（特效）、`KB.ELEM`（元素）、`KB.MIX`（混合）、`KB.Helper`（夥伴）、`KB.PROG`（等級 / 連擊 / 成就 / 事件 emit）、`KB.AWAKEN`（覺醒）、`KB.CHALLENGE`、`KB.RECORDS`、`KB.SAVES`、`KB.SKINS`、`KB.EXTRA`（倍率）、`KB.applyRoomLayers`（關卡疊加層）。各自在 docs/PROGRESS.md 對應 agent 區段開頭有 API 表。
- 關卡資料：levels.js 原始地圖 + 檔尾疊加層（MECH / R4 / R5 / ELEM6 / ELEM6B），levels_w7.js、levels_extra.js（EXTRA / NORMAL 層）。不要直接改原始地圖字串，用疊加層。

## 多 agent 協作規則
- 每輪由總控在 docs/TASKS.md 寫「檔案所有權矩陣」，agent 只改自己的檔；需要別人檔案的改動寫在 PROGRESS.md 自己區段「跨檔需求」，由總控整合。
- 編輯前重新讀檔；小範圍 Edit；不要整檔 Write 覆蓋別人的檔。`KB.PHYS` 既有常數不得更動（新常數加尾端）。
- 新能力 / 招式：每能力固定五招順序 X / ↑+X / ↓+X / 空中 X / 蓄力（方向讀 `p.atkDir`，空中招用 slowFall ≤ 30 幀不可懸停）；def 需含 `moves / desc / flavour(陣列)`、`hat_<key>`、`ui_ability_<key>`（24×16）、`kirby_attack_<key>`；音效名先查 `node tools/audio_check.js`。
- 收工前：跑對應測試 + build.py；把截圖路徑、未完成、已知問題寫進 PROGRESS.md 自己區段。**agent 不要 git commit / reset**（總控 commit）。
- 通關機器人偶發失敗（RNG 序列）重跑一次再判定；kracko fight 2/3 是已知 WARN。

## 進度回報協定（防中斷遺失）
每完成一個里程碑就在 docs/PROGRESS.md 自己的區段追加：`- [時間] 完成：…；驗證：<指令 / 截圖路徑>；下一步：…`。新對話接續：先讀 docs/STATUS.md，再看 PROGRESS.md 最後一個「總結」與 TASKS.md 末尾。
