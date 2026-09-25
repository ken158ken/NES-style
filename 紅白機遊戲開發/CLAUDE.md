# 紅白機遊戲開發 — agent 必讀

- 本資料夾：先研究（已完成）、後開發「現代程式原汁原味還原紅白機」的遊戲（見 docs/PLAN.md）。與 `../卡比之星` 平行，不要動那邊的檔案；可借用其 tools 寫法與 .venv（`../卡比之星/.venv/bin/python`）。
- 研究文件放 `docs/research/`，檔名照 README 目錄；每份文件開頭放「摘要（10 行內）」與「目錄」，結尾放「來源」清單（網址）。
- 表格優先、每個結論標 `[源]`（有來源）/ `[推論]`；數字（解析度、聲道、容量、年份、銷量）務必查證。
- 完成一個段落就在 `docs/PROGRESS.md` 自己的區段追加一行（時間、完成、來源數）。
- 不要 git 操作（總控處理）。

## 開發階段（2026-09-17 起；R1 引擎完成、R2 兩款遊戲進行中）
- **專案定位（使用者 2026-09-19 定調）**：不限一款遊戲——深入研究多款紅白機經典並各自實作，共用 `engine/`；與卡比之星（單一獨立作品）不同。
- 引擎 `engine/`（全域 `NES`，classic script，零相依；載入順序 palette → fixed → input → cpu_timing → chr → ppu → nes_lint → apu → music → shmup → touch → nes）、遊戲 `games/<名>/`、入口：`game.html`《星塵測試室》demo、`star.html`《星塵勇者》（平台，全域 `ST`，games/star；R3 起 W1+W2 共 8 關，`?level=2-1`、標題 SELECT 切世界，W2 檔案 `*_w2.js`）、`cruiser.html`《星塵巡航艦》（宇宙巡航艦風格射擊，全域 `CR`，games/cruiser）；`index.html` 是研究總覽（`tools/build_html.py` 產）。三頁都有手機觸控（`engine/touch.js`，`NES.Touch`）與小數倍縮放。**API 以 `docs/ENGINE_API.md` 為準**；任務板 `docs/TASKS.md`；QA `docs/QA_REPORT.md`；進度 `docs/PROGRESS.md`（每輪末尾「總結」）。
- 指令（`PY=../卡比之星/.venv/bin/python`）：`bash tools/run_all.sh [--quick]`（全測試 tools/test_*.py + games/*/test_*.py + 三入口 build 檢查 + 冒煙截圖 + lint）；`$PY tools/shot.py --url cruiser.html --script "press right 40; tap a 1; step 30" --lint --out shots/agent_x/a.png`（`--url star.html`、`--query "level=1-2"`；cruiser 有 `?camx=<px>` / `?boss=1|2|3` / `?stage=1..6`）；`$PY tools/mobile_shot.py --page cruiser.html --device "iPhone 13" --landscape --touch "..."`（手機模擬 + 觸控）；`$PY tools/nes_lint.py shots/x.png --scale 0`；`$PY tools/apu_render.py [--game cruiser --song stage1]`；`$PY tools/build.py --src star.html|cruiser.html|game.html` → `dist/星塵勇者.html` / `星塵巡航艦.html` / `星塵測試室.html`；`$PY tools/stamp.py`（**總控 commit 前必跑**：三入口頁 script 加 ?v=雜湊，避免 Pages / 瀏覽器快取舊 JS）；`$PY tools/playthrough_star.py --level 1-1`（平台機器人）；`$PY tools/playthrough_cruiser.py`（射擊機器人，qa2 的 bot.py 收進 tools）。截圖必用 Read 看圖。
- 還原標準（PLAN §1）是硬限制：畫面只能經 PPU（≤25 色 / 每線 8 精靈 / 一層背景 + 分割）、聲音只能經 APU 五聲道、物理定點數、VBlank 預算 160 byte；lint 紅字 = 不合格。
- 多 agent 規則同卡比：檔案所有權矩陣、只改自己的檔、跨檔需求寫 PROGRESS、不 git。
- **R3（2026-09-25）《星塵巡航艦》擴成 6 關 + 第二輪**：`games/cruiser/stages.js`（純資料 `CR.STAGES[1..6]`：地形 RLE / 出怪表 / 魔王 / 調色盤 / 難度參數表）+ `stage_runtime.js`（`CR.stage`，契約同 R2，多 `load(n)` / `index` / `setLoop`）+ `bosses.js`（參數化魔王機 5 隻）；`stage1.js` 已刪。曲目 `song.js` 14 鍵（stage1~6 / boss / boss_final / ending …），缺鍵自動退回。機器人 `tools/playthrough_cruiser.py --stage N | --chain | --assist`。測試 `test_stages.py` / `test_song.py`。
