# R5 任務簡報（總控 2026-11-13）— 《星塵 8 合 1》合輯卡帶一：動作小品

每位 agent 開工先讀這份，再讀 `CLAUDE.md` → `docs/LEGACY_MAP.md` → `docs/ENGINE_API.md`（§7 PPU、§10 Music、§11 boot、§12 game、§15 SH、§16 Touch）
→ `games/cart1/registry.js`（契約本體）→ `docs/research/09_法律與原創原則.md` §7 檢查表 → 自己負責的舊作 `legacy/ken-ai-webgames/<名>.html`（**只看玩法，不抄程式碼 / 文案 / 配色**）。
寫法參考既有遊戲：`games/mech/`（最新、最精簡）、`games/star/main.js`（`budget.mute` 整片重畫）、`games/mech/test_mech.py`（測試寫法）、`tools/playthrough_mech.py`（機器人）。

## 1. 共用規則（同 R4）
1. **不 git、不跑 `tools/stamp.py`、不跑 `tools/build.py`（`--check` 可以）**。`PY=../卡比之星/.venv/bin/python`。改畫面必截圖（`tools/shot.py --url cart1.html --query "game=<id>&debug=1" ...`）並用 Read 看；收工只留 ≤ 3 張在 `shots/agent_<卡名>/`。
2. 還原標準就是驗收：`nes_lint` ≤ 25 色 / 每線 ≤ 8 精靈（**機器人全程逐幀量，不靠輪替**）、VBlank 每幀 ≤ 160 byte（`__nes.stats().budget.overFrames == 0`；整片重畫用 `CT.blank(nes, fn)`）、聲音只經 APU、位置速度用整數 / 定點數。
3. `engine/` 一行都不准改（真的缺 API → 寫進 PROGRESS 跨檔需求，由總控決定）。`games/cart1/registry.js` 只准總控改。`cart1.html` 只准在 `<!-- cart1:games:begin -->` 與 `<!-- cart1:games:end -->` 之間**插入自己的 script 行**。
4. **一律原創**：遊戲名、角色、美術、旋律、關卡 / 迷宮配置都自己設計；**不得做任何既有商業遊戲的翻版**（不用其名稱、角色造型、配色、招牌旋律、經典關卡配置；例如迷宮不能是原作迷宮、落塊不能用原作配樂或名稱）。同類型玩法 OK。
5. 命名空間：CHR bank、曲名、音效名一律加前綴 `<id>_`（例如 `maze_bg`、`maze_stage`），避免與其他槽互撞。全域只用 `CT.<Id>`（例如 `CT.Maze`），不另開 window 全域。
6. 手機觸控（`engine/touch.js` 的十字鍵 / A / B / START / SELECT / ★）要能完整遊玩。
7. 等待背景程序用 log 哨兵 `EXIT=` + `timeout`，不要用自我匹配的 `until ! pgrep -f`。
8. 收工：`docs/PROGRESS.md` 末尾 `## <卡名>（R5，2026-11-13）` 五節（做了什麼 / 驗證數字表 / 偏離 / 跨檔需求 / 留給後續）；`docs/TASKS.md` 末尾追加本卡段（所有權 + 驗收）。

## 2. 槽位契約（`games/cart1/registry.js`，全文以檔案為準）
```js
CT.register({
  id: 'maze', order: 1, title: '星塵迷宮', legacy: ['pacman.html'],
  init(nes, opt), update(nes), draw(nes), state(),  // 同 ENGINE_API §12；init 內可整片重畫（已在 CT.blank 裡）
  exit(nes),        // 可省略
  cheat(),          // 一鍵密技（C / ★ / nes-cheat）→ 每款自訂「立刻補強」，回 true 表示生效；不限次數
  bot(nes) → mask,  // ?bot=1：回傳下一幀要按的鍵（NES.Input.BTN 遮罩），null = 不按
  goal() → bool     // 機器人驗收條件已達成
});
```
- 換遊戲時 registry 會 `CT.resetHW`（停音樂、清 OAM / 名稱表 / 屬性、scroll 0、split 關、8×8 精靈、backdrop $0F）。**init 要自己 setPattern / 設全部調色盤**，不能假設前一款留下什麼。
- **START + SELECT 同時按住 60 幀 = 回選單**（registry 處理），遊戲內不得用這個組合；單按 START = 暫停（每款自己做）。
- 最高分 / 紀錄：`CT.save(id, 'best', 數字)`、`CT.load(id, 'best', 0)`；可選 `bestText()` → 選單上顯示的字串（≤ 8 字元）。
- 遊戲內流程：自己的標題 / 操作說明畫面（按 START 開始）→ 遊玩 → GAME OVER / 通關 → 回自己的標題。
- 直接開某款測：`cart1.html?game=maze&debug=1`（shell 不在也能跑）；機器人：`&bot=1`。

## 3. 每款的共同驗收（所有遊戲卡）
| 項目 | 標準 |
|---|---|
| 內容 | 有成長：關卡 / 等級 / 波次 ≥ 表 4 的數量，難度遞增；有標題 + 說明畫面、暫停、GAME OVER、最高分存檔 |
| 美術 | 原創 CHR（`NES.CHR.bank`），每款自己的調色盤；畫面像一款紅白機遊戲而不是 debug 畫面（有邊框 / HUD / 標題字） |
| 聲音 | ≥ 1 首原創 BGM + ≥ 4 個音效（`NES.Music.define`，`apu_render.py` 可離線渲染者加分） |
| 密技 | `cheat()` 有效（補命 / 補時 / 清場之類，每款自訂）；Konami 不強制 |
| 機器人 | `tools/playthrough_cart.py --game <id>`（shell 卡提供；shell 卡還沒好之前可用 `shot.py --query "game=<id>&debug=1&bot=1" --script "step N"` 自測）在幀數上限內達成 `goal()`，**不開密技** |
| 測試 | `games/cart1/test_<id>.py` ≥ 25 項，全綠；`bash tools/run_all.sh --quick` 收工全綠 |
| 硬限制 | 機器人全程每線 ≤ 8 精靈、`overFrames == 0`、截圖 `nes_lint` 0 違規 |

## 4. 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| C5-0 **cart1-shell** | **開機選單**：開機 logo →「星塵 8 合 1」標題（原創 logo 字）→ 8 槽清單（每槽原創 16×16 小圖示 + 名稱 + 最高分；未註冊的槽顯示「準備中」灰字），↑↓ 選、A / START 進入、選單 BGM + 移動 / 決定音效；回選單後游標停在剛玩的那款；`CT.Shell = {init, update, draw, state}`。**START+SELECT 回選單**時畫面要有回饋（registry 提供 `CT.backProgress()`，在遊戲畫面上用 ≤ 2 個精靈畫進度條或閃爍提示，Edit registry 不准 → 需要 hook 就寫跨檔需求）。**工具**：`tools/playthrough_cart.py --game <id> [--max N] [--all]`（`?debug=1&bot=1`，逐幀 step、每幀讀 `__nes.stats()` 記每線精靈峰值 / overFrames，直到 `state().goal` 或幀數上限；輸出 JSON 一行 + 人看的表）；`tools/test_cart.py`（≥ 30 項：註冊契約欄位齊全、每款 launch → back → launch 另一款後 PPU 無殘留、切換那幀不超預算、每款標題畫面 lint 綠、選單操作、最高分顯示）。**整合**：`tools/run_all.sh`（`build --check cart1.html`、test_cart、冒煙）、`tools/build.py`（`--src cart1.html` → `dist/星塵8合1.html`）、`tools/shot.py`（如需）、`README.md` / `index.html`（Edit 加入口）、`CLAUDE.md` 開發段加一行 R5 說明 | 新 `games/cart1/shell.js`、`tools/playthrough_cart.py`、`tools/test_cart.py`；`tools/run_all.sh` / `tools/build.py` / `tools/shot.py` / `README.md` / `index.html` / `CLAUDE.md` Edit 插入；`docs/TASKS.md` 加「R5 合輯契約」 |
| C5-1 **cart1-grid** | ① `maze` 星塵迷宮（舊 pacman）：吃完星屑過關，≥ 4 種追兵各有原創 AI 個性（追擊 / 包抄 / 巡邏 / 亂走等自訂），能量星讓追兵逃跑可吃，≥ 4 張原創迷宮循環、加速、隧道、獎勵道具；goal = 連過 3 張迷宮。② `snake` 星塵貪食蟲（舊 snake + snake-game）：格子移動、長度成長、三模式（經典無盡 / 關卡制 ≥ 6 關含障礙與傳送門 / 對戰電腦蟲）；goal = 關卡制過 3 關 | `games/cart1/maze/**`、`games/cart1/snake/**`、`games/cart1/test_maze.py`、`test_snake.py`；`cart1.html` 標記內插入 |
| C5-2 **cart1-break** | ③ `blocks` 星塵方塊（舊 tetris + tetris-game）：10×20 落塊、下一塊預覽 ×3、暫存、硬降 / 軟降、DAS（研究 04 §6）、等級加速、兩模式（馬拉松 / 挑戰：底部垃圾行上升）、消行演出；原創配樂（**不准用原作或俄羅斯民謠旋律**）；goal = 馬拉松消 40 行。④ `brick` 星塵打磚塊（舊 breakout）：≥ 10 關原創磚陣、硬磚 / 不壞磚、≥ 4 種掉落膠囊（加長 / 多球 / 雷射 / 慢速等）、第 10 關魔王；goal = 連過 5 關 | `games/cart1/blocks/**`、`games/cart1/brick/**`、`test_blocks.py`、`test_brick.py`；`cart1.html` 標記內插入 |
| C5-3 **cart1-arcade** | ⑤ `pinball` 星塵彈珠台（舊 pinball）：直向桌面（> 1 個畫面高，用捲動或 split）、左右擋板（← / A）、發射桿、保險桿 / 目標燈 / 任務組合 / 加分倍率 / 救球、3 顆球；碰撞用定點數；goal = 3 球內 ≥ 指定分數（自訂並寫進測試）。⑥ `flyer` 星塵飛鳥（舊 flappy-bird）：單鍵（A）振翅穿縫，**原創角色與世界**（不是那隻鳥），每 10 門換場景 / 加速 / 新障礙（移動縫、風），獎牌等級；goal = 通過 50 門 | `games/cart1/pinball/**`、`games/cart1/flyer/**`、`test_pinball.py`、`test_flyer.py`；`cart1.html` 標記內插入 |
| C5-4 **cart1-strategy** | ⑦ `racing` 星塵賽車（舊 racing）：偽 3D 路面（逐掃描線 split / 捲動做彎道與起伏）或俯視捲軸二選一，≥ 3 條原創賽道、對手車、名次、氮氣或彎道漂移其一；goal = 3 條賽道都前 3 名完賽。⑧ `tower` 星塵塔防（舊 tower-defense）：格子地圖、十字鍵游標放塔、≥ 3 種塔各 2 級升級、≥ 4 種敵人、≥ 3 張地圖 × 10 波、金錢 / 生命、快轉；goal = 第一張地圖守完 10 波 | `games/cart1/racing/**`、`games/cart1/tower/**`、`test_racing.py`、`test_tower.py`；`cart1.html` 標記內插入 |

## 5. 執行順序
C5-0 ~ C5-4 **同時開工**（registry 契約已定，shell 缺席時遊戲仍可用 `?game=` 直接跑）。全部收工 → 總控跑 `run_all.sh` → **qa-r5**（逐款截圖、機器人、硬限制、手機觸控、原創性檢查）→ **fix-r5** → 總控 stamp / build / commit。

## 6. fix-r5 統一規則（總控 2026-11-13，依 `docs/QA_REPORT.md` `# R5 qa-r5`）
1. **密技 = 原地續關**（P2-1，使用者 R2c 規則）：GAME OVER / 失敗結算畫面按密技（C / ★ / nes-cheat）→ **立刻回到剛才那一關 / 那一波 / 那條賽道繼續玩**，保留分數與進度（命數 / 球數補回開局值）；遊戲中按密技仍是各款的「立刻補強」。凡用過密技的那一局 `goal()` 一律 false，**標題 / 說明畫面按密技無效**（P3-7）。
2. **暫停 = BGM 靜音**（P3-1）：START 暫停時音樂暫停（停 driver 或靜音），解除暫停接續播放。
3. **中途離開也存最高分**（P3-2）：`exit(nes)` 內把目前分數比對寫入 `CT.save(id,'best')`。
4. **回選單提示圖塊**（P3-9）：每款註冊物件可選填 `backTile: {tile, pal}`——一個在**自己精靈圖樣表**裡的 8×8（8×16 模式就是上下兩塊都畫得出來的那組）實心小方塊 / 星星，shell 用它畫收攏提示；沒填就不畫精靈、改由 shell 用 `CT.backProgress()` 以外的方式（例如閃爍 backdrop）提示。registry 不改。
5. **遊戲內也要寫得到「長按 START+SELECT：回選單」**（P3-10）：寫在各款說明頁或暫停畫面（英文可：`HOLD START+SELECT: MENU`）。
6. 說明 / 標題頁文字行距：段落間至少空一列（P3-5）；`C = CHEAT` 一律寫成 `C/★ = CHEAT`（P3-6）。
