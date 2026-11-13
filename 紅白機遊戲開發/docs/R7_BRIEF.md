# R7 任務簡報（總控 2026-11-13）— 卡帶三《星塵益智 8 合 1》：益智

使用者裁示同 R6：**一路做到卡帶五、中途不停、最後一次驗收**，每張卡一次做到可驗收品質。

開工先讀這份 → **`docs/R6_BRIEF.md` §1**（與 R5 的差異：多卡帶、游標規格、原創性、bestText 6 字元）→ **`docs/R5_BRIEF.md`**（§1 共用規則、§2 槽位契約、§3 共同驗收、§6 統一規則全部照舊）→ `docs/LEGACY_MAP.md` → `docs/QA_REPORT.md` 的 `# R5 qa-r5` 與 `# R6 qa-r6`（若已寫好；別再犯同類問題）→ `games/cart1/registry.js` → `games/cart2/cart.js`（卡帶設定範本）→ 自己的舊作 `legacy/ken-ai-webgames/<名>.html`（只看玩法）。寫法範本：`games/cart2/` 與 `games/cart1/` 各款及其 `test_*.py`。

## 1. 本卡特有規則
1. 入口 `cart3.html`（`CART_ID = 'cart3'`）；遊戲 `games/cart3/<id>/`、測試 `games/cart3/test_<id>.py`；script 只插在 `<!-- cart3:games:begin -->` 與 `end` 之間。直開 `cart3.html?game=<id>&debug=1`；機器人 `tools/playthrough_cart.py --page cart3.html --game <id>`。
2. **益智遊戲的盤面一律走背景名稱表**（格子、數字、棋子），精靈只給游標 / 動畫中的物件；名稱表寫入用影子表 + 差異佇列（每幀 ≤ 140 byte，參考 `games/cart1/blocks`）。
3. 游標：十字鍵**一格一格移動**（按住連發：首延遲 12 幀、之後每 4 幀一格），A 確認、B 取消 / 標記；格子游標用精靈框或屬性換色。
4. 益智題目要**保證可解**：用產生器 + 驗證器（測試裡跑驗證器證明），難度分級；`?seed=` 可重現。「友善版」：有復原（SELECT 或 B 長按）、提示、無猜題的盤面。
5. 每款 ≥ 3 難度或 ≥ 10 關；有計時 / 步數 / 星等評價與最高紀錄（`bestText` 右對齊 6 字元，例：`03:25`→` 03:25`、`128MV`）。
6. 機器人要**用解題器正常操作游標**完成，不准直接改盤面狀態。

## 2. 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| C7-0 **cart3-shell+party** | ① `games/cart3/cart.js`：卡帶標題「星塵益智 8 合 1」、副標、8 槽原創圖示（做完遊戲後對照各款截圖修正）、原創選單曲、配色（與 cart1 / cart2 明顯不同）；`run_all.sh` / `build.py`（`cart3.html` → `dist/星塵益智8合1.html`）/ `stamp.py` / `test_touch.py` / `test_cart.py` 加 cart3；`README.md` / `index.html` / `CLAUDE.md` 加入口。② `party` 星塵派對（舊 guessing-game + rock-paper-scissors）：猜數（電腦想 1~100 / 你想電腦猜，提示高低，次數評價）＋ 猜拳（對 3 位個性不同的原創 CPU，三戰兩勝晉級制，CPU 有可學習的習慣）＋ 第三個原創小遊戲（例如「翻牌比大小」）；goal = 猜拳晉級制打贏 3 位 | `games/cart3/cart.js`、`games/cart3/party/**`、`test_party.py`；工具與文件 Edit 插入；`docs/TASKS.md` 加 R7 段 |
| C7-1 **cart3-number** | ① `merge` 星塵合星（舊 2048）：4×4 滑動合併，**不准做成 2048 的數字方塊外觀**——用「星塵→石礫→月→行星→恆星→星系…」12 階原創天體圖示（數值只在 HUD），另有 5×5 / 3×3 盤與「黑洞格」變體；復原 1 步；goal = 4×4 合出第 8 階。② `sudoku` 星塵數獨（舊 sudoku ×3）：9×9 + 6×6 入門，產生器保證唯一解、4 難度、筆記模式（B 切換）、錯誤提示開關、自動檢查完成；goal = 入門 + 簡單各解 1 題 | `games/cart3/{merge,sudoku}/**`、`test_merge.py`、`test_sudoku.py` |
| C7-2 **cart3-board** | ③ `mines` 星塵探雷（舊 minesweeper）：3 難度 + 自訂、首次點擊安全、**友善版保證無猜盤面**（產生器 + 邏輯解題器驗證）、插旗 / 和弦開格、計時；原創外觀（不用 Windows 踩地雷的灰磚笑臉）；goal = 初級無猜盤面連贏 3 局。④ `gomoku` 星塵五子棋 + 井字（舊 gomoku + tic-tac-toe）：15×15 五子棋對 CPU（3 級 AI：威脅評估 + 搜尋）、雙人同機、悔棋；井字 3×3 / 4×4 變體對 CPU；goal = 五子棋擊敗 CPU 普通級 | `games/cart3/{mines,gomoku}/**`、`test_mines.py`、`test_gomoku.py` |
| C7-3 **cart3-slide** | ⑤ `slide` 星塵拼圖（舊 sliding-puzzle + jigsaw-puzzle + puzzle）：滑塊 3×3 / 4×4 / 5×5（保證可解的打亂）＋ 換位拼圖（交換兩片）＋ 旋轉拼圖；圖面用 ≥ 6 張**原創**像素畫（用其他卡帶的原創角色當主題也可）；步數 / 時間評價；goal = 3×3 與 4×4 滑塊各解 1 次。⑥ `lines` 星塵連線（舊 connect-lines，開工先看舊作玩法再定案）：原創連線益智 ≥ 30 關（同色點相連、線不交叉、填滿盤面之類的規則，若與某知名商業作品規則完全相同，要加入自己的變體機制，例如橋、單向格、星門），關卡產生器 + 唯一解驗證；goal = 前 10 關全破 | `games/cart3/{slide,lines}/**`、`test_slide.py`、`test_lines.py` |
| C7-4 **cart3-maze** | ⑦ `labyrinth` 星塵迷宮探索（舊 maze-game）：與卡帶一的吃點迷宮區別開——這是**探索型**：俯視、視野有限（周圍 N 格明亮、其餘黑暗，用屬性 / 調色盤做）、鑰匙門、開關、移動牆、小地圖（SELECT），程序產生 + 固定種子的 ≥ 9 層，計時與星等；goal = 前 3 層出口。⑧ 工具：`tools/apu_render.py` 支援合輯卡帶曲目（`--game cart2/slash` 之類可讀 `CT.<Id>.Audio.SONGS` 或各款 song 檔的 SONGS，離線渲染 + 五聲道檢查），並把 cart1~3 全部已註冊曲目跑一遍列成表；`test_apu.py` 只准插入 | `games/cart3/labyrinth/**`、`test_labyrinth.py`、`tools/apu_render.py`（Edit） |

## 3. 執行順序
C7-0~C7-4 同時開工（與 R6 的 fix 同時進行；**不准動 games/cart1、games/cart2**）。全部收工 → 總控 run_all + playthrough → qa-r7 → fix-r7 → commit / push → 開 R8。
