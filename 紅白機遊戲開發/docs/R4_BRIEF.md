# R4 任務簡報（總控 2026-10-08）— 每位 agent 開工先讀這份，再讀 CLAUDE.md → docs/PROGRESS.md 末尾三個總結 → docs/TASKS.md 末尾 → docs/ENGINE_API.md → docs/PLAN.md §4

## 共用規則
1. **不 git、不跑 `tools/stamp.py`、不跑 `tools/build.py`**（總控統一）。`PY=../卡比之星/.venv/bin/python`。改畫面必截圖（`tools/shot.py` / `mobile_shot.py`）並用 Read 看，收工只留 ≤ 3 張在 `shots/agent_<名>/`。
2. 還原標準就是驗收：`nes_lint.py` 逐像素 ≤ 25 色 / 每線 8 精靈、APU 離線 wav（`apu_render.py`）、手感 ±1 幀、**機器人通關**（`playthrough_star.py` / `playthrough_cruiser.py`）。`bash tools/run_all.sh` 收工全綠。
3. **engine/ 共用層只准 Edit 插入、不准改既有行為**（既有測試 `tools/test_*.py` 一條都不能紅）；新 API 要寫進 `docs/ENGINE_API.md`。`games/star/main.js`、`games/cruiser/main.js`、`star.html`、`cruiser.html`、`index.html`、`README.md` 是共用檔：只准 Edit 插入。
4. 美術 / 音樂一律原創；手機觸控（`engine/touch.js`）不能壞。一鍵密技（C 鍵 / ★）、暫停、Konami 保留。
5. 等待背景程序不准用自我匹配的 `until ! pgrep -f`；用 log 哨兵 `EXIT=` + `timeout`。
6. 收工：`docs/PROGRESS.md` 末尾 `## <卡名>（R4，2026-10-08）` 五節（做了什麼 / 驗證數字表 / 偏離 / 跨檔需求 / 留給後續）；`docs/TASKS.md` 追加本卡段（所有權 + 驗收）。

## 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| F4-1 star-w3 | 《星塵勇者》**世界 3**（主題自選但不撞 W1 天空 / W2 熔岩礦坑，建議「霧沼古樹」或「冰晶洞窟」）四關 3-1~3-4、≥ 3 新敵 + 魔王、≥ 3 新機制（走 `ST.LevelKit.addTheme` / `ST.Levels.register` / `ST.Enemies.register` / `ST.Objects` 擴充點，**不動 W1 / W2 程式**）、新曲 ≥ 2、`?level=3-1`、標題 SELECT 切到 WORLD 3、`test_w3.py` ≥ 30 項、機器人 `--w3` 四關 0 死通關 | 新 `games/star/{chr_w3,song_w3,enemies_w3,boss_w3,objects_w3,levels_w3}.js`、`test_w3.py`；`main.js` 只 Edit 插入 WORLD 清單一行；`tools/playthrough_star.py` 加 `--w3`（Edit） |
| F4-2 star-w4 | 同 F4-1 做**世界 4**（主題再不同，建議「機械要塞」或「幽靈船」）4-1~4-4；**另外負責「崩塌磚視覺抖動」**（`crumbleTimer` 已留介面）與 `NES.SH.OAM` 16×16 精靈便利 add（engine Edit 插入 + ENGINE_API 補一段 + `test_shmup.py` 加項） | 新 `games/star/*_w4.js`、`test_w4.py`；`main.js` Edit 插入 WORLD 一行與抖動粒子 draw；`engine/shmup.js` Edit 插入；`playthrough_star.py` 加 `--w4` |
| F4-3 star-meta | **SMB3 式世界地圖**（標題 START 後進地圖：節點 = 關卡、走格子、已通關打勾、支線 / 隱藏節點預留）＋ **密碼存檔**（紅白機風 8~12 字密碼：編碼世界進度 / 命數 / 分數校驗；標題 SELECT 輸入）＋ **副武器系統**（火球 / 飛鏢兩種：地圖道具屋或關卡隱藏道具取得、↓ + B 切換、能打掉 W2 護甲礦兵 = 研究 04 §2 的第二解法）；`test_meta.py` ≥ 30 項；機器人加 `--map` 走地圖到任一關 | 新 `games/star/{worldmap,password,subweapon}.js`；`hero.js`（Edit 副武器 hook）、`enemies_w2.js`（Edit 護甲礦兵吃副武器）、`main.js` Edit 插入狀態機入口；`star.html` Edit 加 script |
| F4-4 cruiser-r4 | 《星塵巡航艦》第二輪平衡（研究 16 的 rank 系統：依火力 / 時間動態難度，死後降 rank）＋ **第 7 關「魔王連戰」**（六魔王強化版 + 真最終魔王）＋ 新裝備型「波動（ripple）」與 Option 編隊切換（SELECT 切 固定 / 跟隨 / 旋轉）＋ **隱藏獎勵**（每關 1 個：特定條件出現的 1UP / 全消彈）＋ 結局畫面與工作人員名單（原創）＋ 分數排行（localStorage 前 10）；`test_r4.py` ≥ 30 項；機器人 `--stage 7` 通關、`--chain` 七關 0 死 | `games/cruiser/**`（全部）、`tools/playthrough_cruiser.py`、`cruiser.html` Edit |
| F4-5 mech-r1 | **第三款新遊戲**《星塵機甲》（洛克人 2 風格：研究 `docs/research/03_經典遊戲深度解析/03_洛克人2.md`）R1：入口 `mech.html`、`games/mech/`（全域 `MG`）；主角狀態機（走 / 跳 / 滑行 / 射擊蓄力、受擊後退無敵幀、梯子）、**2 個關卡 + 2 個機器人頭目**（擊破得武器、武器選單暫停切換、弱點循環）、關卡選擇畫面、生命 / 能量罐、原創 CHR 與 ≥ 4 曲（選關 / 關卡 ×2 / 頭目）、手機觸控、`playthrough_mech.py` 兩關 0 死通關、`test_mech.py` ≥ 40 項、`tools/build.py --src mech.html`、`run_all.sh` 納入 | 新 `games/mech/**`、`mech.html`、`tools/playthrough_mech.py`；`tools/run_all.sh` / `tools/build.py` / `tools/shot.py` Edit 插入；`README.md` / `index.html` Edit 加入口；`docs/TASKS.md` 加「R4 《星塵機甲》契約」 |
