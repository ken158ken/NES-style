# R9 任務簡報（總控 2026-11-13）— 卡帶五《星塵文創 6 合 1》：文字 / 創作（最後一張）

使用者裁示同 R6：**一路做到卡帶五結束、中途不停、最後一次驗收**。這是最後一張卡，做完就交給使用者驗收，品質要到最高。

開工先讀這份 → **`docs/R6_BRIEF.md` §1** → **`docs/R5_BRIEF.md`**（§1 §2 §3 §6 全部照舊）→ `docs/R8_BRIEF.md` §1（時間以幀計、機器人人類節奏、只讀畫面）→ `docs/LEGACY_MAP.md` → `docs/QA_REPORT.md` 的 qa-r5~r7 各章（別再犯：HUD 不貼 y=0、新機制第一次要教學、文字不截斷、選單圖示照實際畫面）→ `games/cart1/registry.js` → `games/cart4/cart.js` → 舊作 `legacy/ken-ai-webgames/<名>.html`（只看玩法；**文字內容一律重寫原創**）。

## 1. 本卡特有規則
1. 入口 `cart5.html`（`CART_ID='cart5'`）；遊戲 `games/cart5/<id>/`、測試 `games/cart5/test_<id>.py`；script 只插在 `cart5:games` 標記之間（`glyphs.js` / `text.js` 由 C9-0 插在最前面）。6 槽：adventure / escape / quiz / words / typing / paint。
2. **中文文字系統 `CT.Text`（C9-0 負責，其他卡使用）**：16×16 點陣（Noto Sans CJK TC，SIL OFL，`/usr/share/fonts/opentype/noto/`）由 `tools/cjk_glyphs.py` 離線轉成 `games/cart5/glyphs.js`（只收各遊戲文字實際用到的字；工具掃描各遊戲的文字資料檔自動收字）。執行期像紅白機 CHR-RAM 一樣**把當頁需要的字形動態寫進圖樣表的保留區**，每幀寫入要計入 VBlank 預算（每磚 16 byte；用 `ppu.budget.use` 或等效方式記帳），所以文字是「打字機」逐字出現；提供：對話框（框線、名牌、逐字顯示、▼ 翻頁、A 加速 / 翻頁）、選項選單、捲動文字、數字 / 英文混排（8×8 半形）。**不准 runtime 用 canvas 字型**（cart1 shell 的退路除外）。
3. **英文字遊戲**（words / typing）用 8×8 英文字型即可；單字表原創挑選常用英文單字（≥ 300 字、分級），不得照抄舊作清單。
4. 打字類用「畫面鍵盤 + 十字鍵游標」輸入（R6 §1-4 的游標規格改為一格一格），另外**實體鍵盤也可直接打字**（只在桌機、作為加速；機器人用手把路徑）。
5. 故事 / 題目全部原創、繁體中文、適合全年齡；題庫（quiz）≥ 200 題、分類分級、答案經過自查。

## 2. 任務卡（分兩批）
**第一批（現在開工）**
| 卡 | 內容 | 擁有檔 |
|---|---|---|
| C9-0 **cart5-text** | ① `CT.Text` 文字系統 + `tools/cjk_glyphs.py` + `games/cart5/glyphs.js`（見 §1-2；寫測試證明：字形與 Noto 點陣逐位元一致、動態上傳每幀 ≤ 預算、對話框 / 選單 / 翻頁 / 混排正確、2000 字長文逐頁播完不爆預算）+ `docs/ENGINE_API.md` 末尾新增「卡帶五文字系統」一節說明用法（只插入）。② `games/cart5/cart.js`（標題「星塵文創 6 合 1」、6 槽圖示、原創選單曲、配色與前四張不同）；`run_all.sh` / `build.py`（→ `dist/星塵文創6合1.html`）/ `stamp.py` / `test_touch.py` / `test_cart.py` 加 cart5；`README.md` / `index.html` / `CLAUDE.md` 加入口。③ 做一個 `?game=textdemo` 的示範頁（只在 debug 註冊）給第二批 agent 參考。**越早交付 ①越好**：完成 ① 後先在 PROGRESS 寫「CT.Text 可用」一行再做 ②③ | `games/cart5/{text,glyphs,cart}.js`、`tools/cjk_glyphs.py`、`games/cart5/test_text.py`；工具與文件 Edit 插入；`docs/TASKS.md` 加 R9 段 |
| C9-1 **cart5-paint** | `paint` 星塵畫室（舊 coloring-game / precision-draw / quick-draw）：十字鍵游標（按住加速、B 精細）像素繪圖——畫筆 / 填色桶 / 直線 / 矩形 / 圓 / 橡皮擦 / 復原重做 ≥ 20 步 / 調色盤（從 NES 64 色選 4 組 × 3 色，即時改 PPU 調色盤）/ 畫布 128×128 以上（走背景名稱表 + 動態 CHR，**寫入計 VBlank 預算**，一次大填色要分幀完成）；模式——自由畫、著色本（≥ 8 張原創線稿）、臨摹挑戰（限時照著範例畫，像素比對評分）、快畫猜猜（CPU 給題目，你畫、CPU 依特徵「猜」— 可簡化為形狀分類器）；存檔 ≥ 4 格 + 分享碼；goal = 著色本完成 1 張且臨摹挑戰 ≥ B | `games/cart5/paint/**`、`test_paint.py` |
| C9-2 **cart5-type** | ① `typing` 星塵打字（舊 speed-typing / speed-typing-challenge / typing-challenge / typing-speed）：畫面鍵盤（QWERTY 排列，十字鍵一格一格，A 打字、B 退格、SELECT 換大小寫）+ 實體鍵盤直打；模式——單字落下（打完消除）、句子計時（WPM、正確率）、限時挑戰；字表分級。② `words` 星塵字謎（舊 word-guess / word-scramble / word-search）：猜字（原創 5 字母猜字，**不准照抄 Wordle 的格子配色與名稱**，用自己的回饋表現）、重組字、找字盤（10×10 字母方陣，游標拉選）；goal：typing = 單字落下第 5 級、words = 找字盤完成 1 盤 | `games/cart5/{typing,words}/**`、`test_typing.py`、`test_words.py` |

**第二批（C9-0 的 `CT.Text` 可用後由總控開）**：C9-3 `adventure` 文字冒險、C9-4 `escape` 密室逃脫、C9-5 `quiz` 快問快答 + 心算。

## 3. 執行順序
第一批三卡同時開工 → `CT.Text` 可用即開第二批 → 全部收工 → 總控 run_all + playthrough → qa-r9 → fix-r9 → commit / push → **整體總結交使用者驗收**。
