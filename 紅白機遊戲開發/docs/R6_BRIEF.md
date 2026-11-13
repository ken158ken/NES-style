# R6 任務簡報（總控 2026-11-13）— 卡帶二《星塵反應 8 合 1》：動作反應

**使用者裁示（2026-11-13）**：卡帶一「整體玩起來不錯」，要求**一路做到卡帶五結束、中途不停**，最後一次驗收。所以每張卡都要一次做到可驗收的品質。

每位 agent 開工先讀這份，再讀 **`docs/R5_BRIEF.md` 全文**（§1 共用規則、§2 槽位契約、§3 共同驗收、§6 fix-r5 統一規則**全部照舊適用**，以下只寫差異）→ `docs/LEGACY_MAP.md` → `docs/QA_REPORT.md` 的 `# R5 qa-r5`（上一輪被抓的問題，別再犯）→ `docs/PROGRESS.md` 的 R5 各段（cart1-* / fix-r5-*）→ `games/cart1/registry.js` → 自己負責的舊作 `legacy/ken-ai-webgames/<名>.html`（只看玩法）。
寫法範本：`games/cart1/` 八款（最新、已過 QA）——尤其 `maze/`、`blocks/`、`flyer/` 與各 `test_*.py`。

## 1. 與 R5 不同的地方
1. 入口 `cart2.html`（`window.CART_ID = 'cart2'`，存檔前綴 `nes.cart2.`）；遊戲放 `games/cart2/<id>/`，測試 `games/cart2/test_<id>.py`；script 只插在 `<!-- cart2:games:begin -->` 與 `end` 之間。registry 與 shell **共用 cart1 的檔**（`games/cart1/registry.js`、`games/cart1/shell.js`），卡帶設定在 `games/cart2/cart.js`。
2. 直接開某款：`cart2.html?game=<id>&debug=1`；機器人：`tools/playthrough_cart.py --page cart2.html --game <id>`（C6-0 加 `--page`；加好之前用 `shot.py --url cart2.html --query "game=<id>&debug=1&bot=1"`）。
3. §6 規則從第一版就要做到：密技原地續關、標題按密技無效、用過密技 `goal()` false、暫停 BGM 停、`exit()` 存最高分、`backTile`、遊戲內寫 `HOLD START+SELECT: MENU`、`C/★ = CHEAT`、說明頁段落空列。
4. **「點擊 / 滑鼠」類改手把**：游標用十字鍵（按住加速：前 8 幀 1 px/幀、之後 3 px/幀，B 按住 = 精細 1 px），A = 確認 / 射擊；需要 9 宮格位置的用「十字鍵方向 + A」或游標。**連打類**只認按鍵「按下邊緣」（`NES.Input.pressed`），鍵盤自動重複不算。
5. **原創性**（R5 qa 抓過兩次）：自己截圖對照時要主動問「這像哪款商業遊戲？」——不准出現 Duck Hunt 的鴨子 / 獵犬 / 草叢構圖、Fruit Ninja 的水果、Missile Command 的城市 + 交叉準星配置、Whac-A-Mole 商標造型等招牌元素。
6. `bestText()` 統一格式（R5 遺留）：**右對齊 6 字元**，純分數 `000000`；有單位的寫成 `12.3S`、`045HIT`、`128/S` 這類 ≤ 6 字元。

## 2. 任務卡與所有權
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| C6-0 **cart-platform** | ① **shell 多卡帶化**：`games/cart1/shell.js` 改讀 `CT.CART_CFG`（由 `games/cartN/cart.js` 提供：卡帶標題 logo 字 / 副標 / 8 槽 `{id, name, icon(16×16 rows), legacy}` / 選單曲 + 配色）；把 cart1 現有設定搬到新的 `games/cart1/cart.js`（`cart1.html` 在 shell 前 Edit 插入一行），**cart1 畫面與行為不變**（test_cart 167 項不准紅）；寫 `games/cart2/cart.js`（標題「星塵反應 8 合 1」、8 槽原創圖示、原創選單曲，圖示要與各遊戲內主角一致——等遊戲卡有截圖後再對一次）。② 工具：`playthrough_cart.py --page cartN.html`、`test_cart.py` 參數化跑 cart1 + cart2（假遊戲契約 + 逐款真遊戲）、`run_all.sh` / `build.py`（`cart2.html` → `dist/星塵反應8合1.html`）/ `stamp.py` PAGES / `test_touch.py` PAGES 加 cart2、`README.md` / `index.html` / `CLAUDE.md` 加入口。③ **engine 插入**（只准 Edit 插入、不改既有行為）：`NES.Music` 加 `pause()` / `resume()`（resume 從暫停的 row 接續），寫進 ENGINE_API §10 + 測試；然後把 cart1 四款「暫停後從頭播」（blocks / brick / racing / tower，見 PROGRESS fix-r5-*）改用它。④ R5 遺留：cart1 八款 `bestText()` 改成 §1-6 的統一格式；racing 加速時 `backTile` 跟車身一起閃白（給 BACK 用獨立調色盤或不跟閃）。 | `games/cart1/shell.js`、新 `games/cart1/cart.js`、新 `games/cart2/cart.js`、`tools/{playthrough_cart,test_cart}.py`；`engine/music.js` + `docs/ENGINE_API.md` + `tools/test_apu.py`（只插入）；`games/cart1/{blocks,brick,racing,tower}/**` 與 cart1 各款 `bestText`（只改上述兩項）；`tools/{run_all.sh,build.py,stamp.py,test_touch.py}`、`cart1.html`（一行）、`README.md` / `index.html` / `CLAUDE.md` Edit 插入；`docs/TASKS.md` 加「R6 多卡帶契約」 |
| C6-1 **cart2-blade** | ① `slash` 星塵忍者斬（舊 ninja-slice）：物件從下方拋上來，主角在畫面中左右移動、A / B + 方向決定斬擊方向（上斬 / 橫斬 / 下劈），連斬連擊，混入不能斬的炸彈與要斬兩次的硬殼，≥ 5 關遞增 + Boss 關；**拋出物原創**（星礦 / 機械蟲 / 符咒之類，不是水果）；goal = 過 3 關。② `laser` 星塵雷射防衛（舊 laser-defense）：游標瞄準 + A 發射雷射（有充能 / 過熱），保護地面上的 3 座原創設施（不是城市排列）抵擋落下的隕石 / 分裂彈 / 會閃避的敵機，≥ 8 波 + Boss；goal = 守過 5 波 | `games/cart2/{slash,laser}/**`、`games/cart2/test_slash.py`、`test_laser.py`；`cart2.html` 標記內插入 |
| C6-2 **cart2-dodge** | ③ `dodge` 星塵躲避（舊 dodge-ball + dodge-master）：兩模式——「躲避球場」（四周敵人投球，主角八方向走位 + B 衝刺無敵幀，存活計時）與「彈幕大師」（≥ 6 種原創彈幕型態輪替，擦彈加分）；難度逐 10 秒升級；goal = 彈幕大師存活 60 秒。④ `rope` 星塵跳繩（舊 jump-rope）：時機遊戲，繩速會變、假動作、雙繩模式（A / B 各控一隻腳或兩人）、≥ 3 種原創角色與場地，連跳數 / 完美判定；goal = 一般模式連跳 100 下 | `games/cart2/{dodge,rope}/**`、`test_dodge.py`、`test_rope.py`；`cart2.html` 標記內插入 |
| C6-3 **cart2-pop** | ⑤ `catch` 星塵接球（舊 ball-catch + bouncing-ball + ball-bounce）：三模式——「接星」（籃子左右接落下物、避開壞東西）、「頂球」（板子把球一直頂著不落地、多球、風）、「彈跳」（控制彈跳球在平台間跳上去，原創關卡 ≥ 6）；goal = 頂球模式連續 60 秒不掉。⑥ `pop` 星塵泡泡（舊 bubble-pop + balloon-pop-challenge + whack-a-mole）：三模式——「戳泡泡」（游標戳上升泡泡、連鎖色）、「氣球射擊」（限時 + 不能打的黑氣球）、「打地鼠」（3×3 洞用十字鍵 8 方向 + 中央 = 9 個位置，A 敲，原創冒出來的生物，會反擊 / 假動作）；goal = 打地鼠模式一局 ≥ 指定分 | `games/cart2/{catch,pop}/**`、`test_catch.py`、`test_pop.py`；`cart2.html` 標記內插入 |
| C6-4 **cart2-aim** | ⑦ `gallery` 星塵射擊場（舊 precision-aim / speed-target-shooter / target-tracking / hand-eye-coordination / multi-target-coordination / circle-clicker / cursor-chase / visual-tracking-challenge，8 合 1 成 4~6 個模式）：游標規格見 §1-4；模式例：精準靶（越中心越高分）、速射（限時清靶）、追蹤（持續瞄準移動靶累積）、多目標（同時多靶按順序）、追逐（游標跟著逃跑的光點）、眼力（多個移動物中找出指定那個）；**原創靶與場景**（不准鴨子 / 獵犬 / 草叢構圖）；每模式有等級與評價；goal = 精準靶 + 速射兩模式都拿到 B 以上評價。⑧ `mash` 星塵連打（舊 click-speed / speed-clicker / finger-frenzy / combo-storm）：模式——10 秒連打測定（只認按下邊緣，顯示每秒次數與等級稱號）、A/B 交替連打、指令連段（畫面出現 ↑↓←→AB 序列，限時輸入連段數）、耐力（60 秒維持在節拍區間）；機器人要用「每 N 幀按一次」的合理節奏，不得每幀都按（另寫測試證明每幀狂按也只算按下邊緣）；goal = 指令連段模式 ≥ 30 連段 | `games/cart2/{gallery,mash}/**`、`test_gallery.py`、`test_mash.py`；`cart2.html` 標記內插入 |

## 3. 執行順序
C6-0 ~ C6-4 同時開工（registry 已支援 `CART_ID`；shell 多卡帶化之前，遊戲用 `?game=` 直接跑）。全部收工 → 總控 run_all + `playthrough_cart.py --page cart2.html --all` → **qa-r6** → **fix-r6** → 總控 stamp / build / commit / push → 直接開 R7。
