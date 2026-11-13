# 舊版網頁小遊戲 → 紅白機合輯 對照表（總控 2026-11-13）

來源：使用者舊作 `kenorganization/ken-ai-webgames`（95 款單檔 HTML，2025-09）。本機參考副本在
`legacy/ken-ai-webgames/`（**不進版控**，`.gitignore` 已排除；遺失就 `gh repo clone kenorganization/ken-ai-webgames legacy/ken-ai-webgames`）。

使用者裁示（2026-11-13）：
1. 包裝成「**N 合 1 合輯卡帶**」，一張卡一個入口頁 + 開機選單，共用 `engine/`；一輪做一張。
2. 同類重複的**合併成一款多模式**（例如數獨 ×3 → 一款三難度）。
3. 靠鍵盤 / 滑鼠的（打字、繪圖、瞄準）**改成手把游標版**，不捨棄。
4. 第一輪做「動作小品」。

原則：舊作只拿**玩法概念**，程式碼不沿用；名稱 / 角色 / 美術 / 音樂 / 關卡一律原創（研究 09），
不做任何既有商業遊戲的翻版（不用其名稱、角色、配色、旋律、關卡配置）。

| 卡帶 | 輪 | 入口 | 槽 | id | 暫定名 | 舊作來源 |
|---|---|---|---|---|---|---|
| 一 動作 8 合 1 | R5 | `cart1.html` | 1 | `maze` | 星塵迷宮（迷宮吃點 + 追兵） | pacman |
| | | | 2 | `blocks` | 星塵方塊（落塊消行） | tetris、tetris-game |
| | | | 3 | `brick` | 星塵打磚塊 | breakout |
| | | | 4 | `pinball` | 星塵彈珠台 | pinball |
| | | | 5 | `snake` | 星塵貪食蟲 | snake、snake-game |
| | | | 6 | `racing` | 星塵賽車 | racing |
| | | | 7 | `flyer` | 星塵飛鳥（單鍵穿縫） | flappy-bird |
| | | | 8 | `tower` | 星塵塔防 | tower-defense |
| 二 動作反應 | R6 | `cart2.html` | | `slash` | 忍者斬 | ninja-slice |
| | | | | `laser` | 雷射防衛 | laser-defense |
| | | | | `dodge` | 躲避大師 | dodge-ball、dodge-master |
| | | | | `rope` | 跳繩 | jump-rope |
| | | | | `catch` | 接球彈跳 | ball-catch、bouncing-ball、ball-bounce |
| | | | | `gallery` | 光線槍射擊場（游標版） | precision-aim、speed-target-shooter、target-tracking、hand-eye-coordination、multi-target-coordination、circle-clicker、cursor-chase、visual-tracking-challenge |
| | | | | `pop` | 泡泡 / 氣球 / 打地鼠 | bubble-pop、balloon-pop-challenge、whack-a-mole |
| | | | | `mash` | 連打測定 | click-speed、speed-clicker、finger-frenzy、combo-storm |
| 三 益智 | R7 | `cart3.html` | | `merge` | 數字合併 | 2048 |
| | | | | `sudoku` | 數獨（三難度） | sudoku、sudoku-game、sudoku-challenge |
| | | | | `mines` | 踩地雷 | minesweeper |
| | | | | `gomoku` | 五子棋 + 井字 | gomoku、tic-tac-toe |
| | | | | `slide` | 滑塊 / 拼圖 | sliding-puzzle、jigsaw-puzzle、puzzle |
| | | | | `lines` | 一筆連線 | connect-lines |
| | | | | `labyrinth` | 迷宮探索 | maze-game |
| | | | | `party` | 猜數 + 猜拳 | guessing-game、rock-paper-scissors |
| 四 記憶節奏 | R8 | `cart4.html` | | `cards` | 翻牌記憶 | memory-card、card-memory、memory-match、memory-matching |
| | | | | `simon` | 跟我做（光 / 聲 / 色） | memory-simon、sound-simon、color-sequence-memory、tap-sequence |
| | | | | `flash` | 閃記圖案 | flash-memory、flash-memory-master、pattern-match、pattern-rush、memory-pattern-race |
| | | | | `tune` | 旋律記憶 | music-memory、music-memory-enhanced |
| | | | | `rhythm` | 節奏（下落 / 打擊 / 武士） | rhythm-game、rhythm-tap、piano-tiles、sound-wave-rush、beat-samurai |
| | | | | `reflex` | 反應測驗（多模式） | reaction-time、reflex-test、reflex-tester、color-reaction、direction-challenge |
| | | | | `brain` | 腦力多工 | dual-hand-sync、multitask-challenge、time-space-tracker、gravity-sense |
| | | | | `color` | 顏色判斷 | color-match、color-rush |
| 五 文字創作 | R9 | `cart5.html` | | `adventure` | 文字冒險 | text-adventure |
| | | | | `escape` | 密室逃脫 | escape-room |
| | | | | `quiz` | 快問快答 + 心算 | rapid-fire-quiz、math-challenge、quick-math |
| | | | | `words` | 字謎（猜 / 重組 / 找字） | word-guess、word-scramble、word-search |
| | | | | `typing` | 打字（手把選字版） | speed-typing、speed-typing-challenge、typing-challenge、typing-speed |
| | | | | `paint` | 像素繪圖（十字鍵游標） | coloring-game、precision-draw、quick-draw |
| （併入既有） | — | `star.html` / `cruiser.html` | | | 星塵勇者 / 星塵巡航艦 | mario、shooter |

95 款全數有歸屬（`mario` / `shooter` 併入既有兩款，不另做）。README 列的「特殊挑戰」6 款在舊 repo 沒有檔案，不計。
