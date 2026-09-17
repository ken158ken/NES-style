# 紅白機遊戲開發 — agent 必讀

- 本資料夾：先研究（已完成）、後開發「現代程式原汁原味還原紅白機」的遊戲（見 docs/PLAN.md）。與 `../卡比之星` 平行，不要動那邊的檔案；可借用其 tools 寫法與 .venv（`../卡比之星/.venv/bin/python`）。
- 研究文件放 `docs/research/`，檔名照 README 目錄；每份文件開頭放「摘要（10 行內）」與「目錄」，結尾放「來源」清單（網址）。
- 表格優先、每個結論標 `[源]`（有來源）/ `[推論]`；數字（解析度、聲道、容量、年份、銷量）務必查證。
- 完成一個段落就在 `docs/PROGRESS.md` 自己的區段追加一行（時間、完成、來源數）。
- 不要 git 操作（總控處理）。

## 開發階段（2026-09-17 起，R1 已完成）
- 引擎 `engine/`（全域 `NES`，classic script，零相依）、遊戲 `games/<名>/`、入口 `game.html`（`index.html` 仍是研究總覽）。**API 以 `docs/ENGINE_API.md` 為準**；任務板 `docs/TASKS.md`；QA `docs/QA_REPORT.md`；進度 `docs/PROGRESS.md`（每輪末尾「總結」）。
- 指令（`PY=../卡比之星/.venv/bin/python`）：`bash tools/run_all.sh`（全測試 + build 檢查 + 冒煙截圖 + lint）；`$PY tools/shot.py --script "press right 40; tap a 1; step 30" --lint --out shots/agent_x/a.png`；`$PY tools/nes_lint.py shots/x.png --scale 0`；`$PY tools/apu_render.py`；`$PY tools/build.py` → `dist/星塵勇者.html`。截圖必用 Read 看圖。
- 還原標準（PLAN §1）是硬限制：畫面只能經 PPU（≤25 色 / 每線 8 精靈 / 一層背景 + 分割）、聲音只能經 APU 五聲道、物理定點數、VBlank 預算 160 byte；lint 紅字 = 不合格。
- 多 agent 規則同卡比：檔案所有權矩陣、只改自己的檔、跨檔需求寫 PROGRESS、不 git。
