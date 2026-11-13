# R8 任務簡報（總控 2026-11-13）— 卡帶四《星塵節奏 8 合 1》：記憶 / 節奏 / 反應

使用者裁示同 R6：**一路做到卡帶五、中途不停、最後一次驗收**，每張卡一次做到可驗收品質。

開工先讀這份 → **`docs/R6_BRIEF.md` §1**（多卡帶、游標規格、原創性、bestText 6 字元）→ **`docs/R5_BRIEF.md`**（§1 共用規則、§2 槽位契約、§3 共同驗收、§6 統一規則全部照舊）→ `docs/LEGACY_MAP.md` → `docs/QA_REPORT.md` 的 `# R5 qa-r5`、`# R6 qa-r6`（別再犯同類問題：開局給預備時間、難度要用「人類反應延遲 12~24 幀」量、原創性主動自問）→ `games/cart1/registry.js` → `games/cart3/cart.js`（卡帶設定範本）→ 自己的舊作 `legacy/ken-ai-webgames/<名>.html`（只看玩法）。寫法範本：`games/cart2/`、`games/cart3/` 各款與 `test_*.py`。音樂暫停用 `NES.Music.pause/resume`（ENGINE_API §10）。

## 1. 本卡特有規則
1. 入口 `cart4.html`（`CART_ID = 'cart4'`）；遊戲 `games/cart4/<id>/`、測試 `games/cart4/test_<id>.py`；script 只插在 `<!-- cart4:games:begin -->` 與 `end` 之間。直開 `cart4.html?game=<id>&debug=1`；機器人 `tools/playthrough_cart.py --page cart4.html --game <id>`。
2. **時間一律以幀計**（60.0988 Hz），反應時間顯示換算成 ms；節奏判定窗口以幀定義並寫進測試。音樂與判定同步要以 APU driver 的 row / tick 為準（不准用 `Date.now()` / `performance.now()`）。
3. **按鍵對應手把**：4 個方位 = 十字鍵 ↑↓←→；需要 6~8 個鍵位時用「十字鍵 + A / B」或「十字鍵 + 按住 B 換第二組」，說明頁要畫出對照圖。
4. **聲音也是玩法的遊戲**（simon、tune、rhythm）：每個鍵位要有可分辨的音高 / 音色，**且一律有視覺提示**（聽障或靜音也能玩），另有「只靠聲音」的進階模式。
5. 開局一律有 `READY` 倒數或「按 A 開始」；記憶類的展示階段可用 B 重看一次（友善版，重看扣分不扣命）。
6. 機器人用**合理人類節奏**：反應延遲 ≥ 12 幀（測試另外驗 0 延遲與 24 延遲兩種都能過 goal 的最低門檻或說明為何不能），不准偷看隱藏答案以外的內部狀態做弊（記憶類可以「記住」展示過的內容，但必須是從展示畫面當下讀到的）。

## 2. 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| C8-0 **cart4-shell+color** | ① `games/cart4/cart.js`：標題「星塵節奏 8 合 1」、副標、8 槽原創圖示（遊戲做完後對照截圖再修一次）、原創選單曲、配色與前三張明顯不同；`run_all.sh` / `build.py`（`cart4.html` → `dist/星塵節奏8合1.html`）/ `stamp.py` / `test_touch.py` / `test_cart.py` / `apu_render.py`（如需）加 cart4；`README.md` / `index.html` / `CLAUDE.md` 加入口。② `color` 星塵色感（舊 color-match + color-rush）：模式——「色字干擾」（字義與字色不同，按對應色，用 NES 調色盤選出 4~6 個易分辨色並考慮色弱：同時用形狀標記）、「色塊衝刺」（快速判斷兩色是否相同 / 哪個比較亮）、「調色」（用十字鍵調 NES 色相 / 亮度去配目標色）；goal = 色字干擾一局 ≥ 指定分 | `games/cart4/cart.js`、`games/cart4/color/**`、`test_color.py`；工具與文件 Edit 插入（每次改前重讀）；`docs/TASKS.md` 加 R8 段 |
| C8-1 **cart4-memory** | ① `cards` 星塵翻牌（舊 memory-card / card-memory / memory-match / memory-matching）：4×3 → 6×5 盤、原創牌面圖 ≥ 15 種、模式（經典步數 / 限時 / 對 CPU 輪流翻，CPU 有可調記憶力）、連對加分；goal = 經典 4×4 在步數上限內完成。② `flash` 星塵閃記（舊 flash-memory / flash-memory-master / pattern-match / pattern-rush / memory-pattern-race）：格子圖案閃現後重現、序列閃現依序重現、「哪裡變了」找差異、與 CPU 競速；等級遞增；goal = 圖案重現模式到第 8 級 | `games/cart4/{cards,flash}/**`、`test_cards.py`、`test_flash.py` |
| C8-2 **cart4-sound** | ③ `simon` 星塵跟我做（舊 memory-simon / sound-simon / color-sequence-memory / tap-sequence）：4 個方位光盤（十字鍵），每盤獨特音高與顏色與形狀；模式——經典（序列逐步加長）、只聽聲音、只看顏色、倒著輸入、8 鍵進階（十字鍵 + 按住 B）；**原創外觀**（不用商業 Simon 玩具的圓形四色扇形）；goal = 經典到 15 步。④ `tune` 星塵旋律（舊 music-memory + music-memory-enhanced）：APU 播一段原創短旋律，玩家用 8 音鍵盤（十字鍵 + A / B 組合，畫面上有鍵盤示意）重彈；等級增加音數 / 音域 / 節奏；另有「聽音辨高低」「找出哪個音錯了」模式；goal = 主模式到第 6 級 | `games/cart4/{simon,tune}/**`、`test_simon.py`、`test_tune.py` |
| C8-3 **cart4-beat** | ⑤ `rhythm` 星塵節奏（舊 rhythm-game / rhythm-tap / piano-tiles / sound-wave-rush / beat-samurai）：≥ 6 首原創曲（APU 五聲道）配譜面，譜面與音樂 row 嚴格同步；模式——四軌下落（←↓↑→ 或 B A 兩鍵簡易）、單鍵點拍、「節拍武士」（拍點上斬擊來襲物）；判定 PERFECT / GREAT / GOOD / MISS 以幀窗口、連擊、評價；難度 3 級；**外觀原創**（不像 DDR 箭頭板 / Guitar Hero 指板 / Piano Tiles 黑白磚）；goal = 前 3 首普通難度 B 以上。⑥ `reflex` 星塵反應（舊 reaction-time / reflex-test / reflex-tester / color-reaction / direction-challenge）：模式——單純反應（隨機延遲後亮燈按 A，偷跑判定）、選擇反應（亮哪個方向按哪個）、顏色反應（只對指定色）、方向挑戰（箭頭與位置衝突）；顯示 ms、平均 / 最佳 / 稱號；goal = 單純反應 5 次平均 ≤ 指定幀數且 0 偷跑（以機器人延遲 18 幀設計門檻） | `games/cart4/{rhythm,reflex}/**`、`test_rhythm.py`、`test_reflex.py` |
| C8-4 **cart4-brain** | ⑦ `brain` 星塵腦力（舊 dual-hand-sync / multitask-challenge / time-space-tracker / gravity-sense）：分割畫面多工（用 split / 屬性分區）——「雙手同步」（十字鍵控左邊、A/B 控右邊兩個獨立小遊戲）、「多工」（2~4 個小任務同時進行，逐步增加）、「時空追蹤」（記住物體在格子裡的移動軌跡再回答位置）、「重力感應」（傾斜平台讓球滾到洞，十字鍵控制傾斜，定點數物理）；goal = 多工模式撐過 90 秒。⑧ 若時間允許做 R7 遺留：無（本卡只做 brain，但品質要做到最高：四個模式都要完整、有等級與評價） | `games/cart4/brain/**`、`test_brain.py` |

## 3. 執行順序
C8-0~C8-4 同時開工（與 qa-r7 / fix-r7 同時進行；**不准動 games/cart1~3**）。全部收工 → 總控 run_all + playthrough → qa-r8 → fix-r8 → commit / push → 開 R9。
