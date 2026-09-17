# 15 忍者蛙 Battletoads（NES, 1991）深度解析

> Rare 在「**最爛的 mapper（AOROM）**」上做出 NES 上最華麗的動作遊戲之一，
> 同時也留下了電子遊戲史上最著名的難度事故。它是「技術力與關卡多樣性」與「難度失控」的雙面教材。

## 摘要（10 行內）
1. 1991-06 NES 發售；Rare 開發、Tradewest 發行。[源]
2. 創意來自 Tim／Chris Stamper 兄弟對《忍者龜》熱潮的回應；設計 Gregg Mayles、程式 Mark Betteridge、美術 Kevin Bayliss、音樂 David Wise。[源]
3. ROM：**AOROM（iNES mapper 7）、PRG 256 KB（16×16 KiB）、CHR-RAM、無電池**——mapper 功能極簡（32 KB 整段切換 + 單畫面鏡射）。[源]
4. 13 個關卡，**幾乎每關都換一種玩法**：橫向清版、垂直下降、競速、滑板、飛行、獨輪車、旋轉塔。[源]
5. 生命值上限 **6 點**，靠吃蒼蠅回復；初始 3 條命，**沒有存檔也沒有密碼**。[源]
6. 攻擊有「**Smash Hit**」終結技：最後一擊時手腳會誇張放大（拳變巨靴、頭變公羊角）。[源]
7. 第 3 關 **Turbo Tunnel** 是公認的難度斷崖，需要近乎背譜的記憶與逐幀反應。[源]
8. 開發團隊**刻意把遊戲做得極難**以延長壽命，認為「只要練就能過」。[源]
9. 雙人模式有友軍傷害，且第 11 關 Clinger-Winger 有**讓 2P 無法通關的 bug**（Rare Replay 才修）。[源]
10. 1992-09 前北美銷量約 **125 萬套**，獲 1991 年 Nintendo Power 七項大獎。[源]

## 目錄
① 基本資料 ② 核心迴圈與操作 ③ 關卡結構（13 關） ④ 系統數值 ⑤ 敵人設計 ⑥ 魔王設計
⑦ 成長與道具 ⑧ 難度曲線（與它的失敗） ⑨ 技術亮點 ⑩ 音樂 ⑪ 可借鑑 10 條 ⑫ 來源

---

## ① 基本資料表

| 項目 | 內容 | 標記 |
|---|---|---|
| 發售 | 1991-06（NES，北美） | [源] |
| 開發／發行 | Rare ／ Tradewest | [源] |
| 原始企劃 | Tim Stamper、Chris Stamper（開發代號 "Amphibianz"） | [源] |
| 設計 | Gregg Mayles | [源] |
| 程式 | Mark Betteridge | [源] |
| 美術 | Kevin Bayliss（角色）、Tim Stamper（精靈化） | [源] |
| 音樂 | David Wise | [源] |
| Mapper | **AOROM（mapper 7）**：32 KB PRG 整段切換 + 單畫面鏡射 | [源] |
| PRG-ROM | 256 KB（16×16 KiB） | [源] |
| CHR | **CHR-RAM**（無 CHR-ROM） | [源] |
| 存檔 | **無**（無電池、無密碼） | [源] |
| 銷量 | 北美約 125 萬套（至 1992-09） | [源] |
| 獎項 | 1991 Nintendo Power Awards 七項 | [源] |

---

## ② 核心迴圈與操作

**清版關迴圈**：進入區段 → 敵人從兩側湧入 → 用拳／衝撞累積連擊 → 最後一擊觸發 **Smash Hit** 誇張演出 → 清空後推進捲軸。

**招式**
- 基本拳（終結技「Kiss-My-Fist」）、奔跑頭槌（「Battletoad Butt」）、抓起敵人過肩摔。[源]
- 關卡專屬招式：「Swingin' Size Thirteens」（巨靴）、「Turbo Thwack」、「BT Bashing Ball」、「Jawbuster」、「Nuclear Knuckles」。[源]
- 場景物件可當武器：機甲腿、烏鴉喙、牆上管線、旗桿。[源]

**設計解讀**
- **Smash Hit 是純粹的「反饋設計」**：不改變數值，只把最後一擊的視覺誇張化，就讓每次戰鬥收尾都有爽感。[推論]
- 但打擊判定被當時評論批評為「攻擊看起來不夠有力、碰撞判定不佳導致廉價死亡」——**演出與判定必須同步**，這是本作最大的技術債。[源/推論]

---

## ③ 關卡結構（13 關）[源]

| # | 關卡 | 類型 | 重點 |
|---|---|---|---|
| 1 | Ragnarok Canyon | 橫向清版 | 教學關；魔王 Tall Walker（丟石頭需反打） |
| 2 | Wookie Hole | 垂直下降 | 抓纜線下降，躲烏鴉與電擊陷阱 |
| 3 | **Turbo Tunnel** | 競速 | 高速機車 + 障礙牆 + 跳台；難度斷崖 |
| 4 | Ice Cavern | 平台 | 用雪球與冰塊破壞障礙 |
| 5 | Surf City | 競速（衝浪板） | 水面彈跳、漩渦與地雷；魔王 Big Blag |
| 6 | Karnath's Lair | 平台迷宮 | **蛇本身是移動平台** |
| 7 | Volkmire's Inferno | 飛行 | 火焰環境、力場與火箭 |
| 8 | Intruder Excluder | 垂直平台 | 彈簧跳、電牆；魔王 Robo-Manus |
| 9 | Terra Tubes | 平台 + 水下 | 機械鑽頭追逐（Krazy Kog）、鯊魚與尖刺 |
| 10 | Rat Race | 垂直倒數 | 老鼠點燃炸彈，**與計時器賽跑**；魔王 General Slaughter |
| 11 | Clinger-Winger | 獨輪車 | 被 Buzzball 追逐；**2P 有無法通關的 bug** |
| 12 | The Revolution | 旋轉塔 | 鏡頭隨塔旋轉，平台會下沉／消失 |
| 13 | Dark Queen's Tower | 魔王戰 | 與黑暗女王決戰 |

**結構觀察**
- **關卡類型輪替**是本作的核心賣點：玩家永遠不知道下一關是什麼玩法，這種「綜藝節目式」結構讓 13 關感覺像 13 款遊戲。[推論]
- 代價：每種玩法的操作邏輯都不同，**學習成本重置**，這也是難度失控的根本原因之一。[推論]
- 隱藏 warp：第 1 關可直接跳到第 3 關（Turbo Tunnel）；標題畫面按住 Down + A + B 再 Start 可用 5 條命開局。[源]

---

## ④ 系統數值

| 項目 | 數值 | 標記 |
|---|---|---|
| 生命值 | 上限 **6 點**，吃蒼蠅回復 | [源] |
| 命數 | 初始 3 條；使用 continue 後回復 | [源] |
| 存檔 | 無存檔、無密碼 → **必須一口氣通關** | [源] |
| 難度設定 | 無（單一難度） | [推論] |
| 即死機制 | 競速／飛行關的多數障礙為**一擊即死**（不扣血） | [推論] |

**數值層面的觀察**：6 點血量看似寬容，但在 Turbo Tunnel 這類關卡完全不適用（撞牆即死）。**同一個生命系統套用到性質完全不同的關卡，是難度曲線崩潰的直接原因**。[推論]

---

## ⑤ 敵人設計

- 清版關敵人（Psyko-Pigs 斧頭豬、Retro Blasters、Electro Zappers 等）多半採「單一行為 + 高攻擊慾」，靠**數量與夾擊**製造壓力。[源/推論]
- 平台關的「敵人」經常是**環境化**的：Karnath 的蛇是移動平台、Rat Race 的老鼠是計時器、Clinger-Winger 的 Buzzball 是追逐者。**敵人 = 關卡機制**。[源/推論]
- 敵人動畫幀數遠高於同期 NES 作品（Rare 的招牌），但精靈尺寸偏小、背景偶爾單調，是當年評論的扣分點。[源]
- 雙人模式的**友軍傷害**把隊友變成隨機威脅——設計上製造喜劇效果，實務上是友情終結器。[源/推論]

---

## ⑥ 魔王設計

| 魔王 | 關卡 | 機制 |
|---|---|---|
| Tall Walker | 1 | 丟巨石，玩家需**反打回去**（教學：反擊機制） |
| Big Blag | 5 | 體重壓制型，需利用場地節奏 |
| Robo-Manus | 8 | 遠程彈幕 + 接近戰切換 |
| General Slaughter | 10 | 只有頭部可攻擊 |
| Buzzball | 11 | 追逐戰的具象化：整關都是牠 |
| **Dark Queen** | 13 | 旋風型態，攻擊模式需背；擊敗後化為旋風退場 |

- 多數魔王考的是「**先讀懂關卡機制，再把機制用在魔王身上**」（例如反打石頭）。[推論]
- Dark Queen 作為壓軸兼系列招牌角色，其人設（黑暗女王）與宣傳美術是 Rare 建立品牌辨識度的核心。[源/推論]

---

## ⑦ 成長與道具

- **沒有成長系統**：沒有升級、沒有可保留的道具、沒有裝備。
- 唯一的「資源」是蒼蠅（回血）與 1-UP。
- 成長完全等於「玩家的肌肉記憶」——與 Punch-Out!! 同屬「知識型成長」，但 Battletoads 缺少 Punch-Out!! 的提示系統與低失敗成本，因而體感截然不同。[推論]

---

## ⑧ 難度曲線（以及它的失敗）

**事實**：開發團隊**刻意**把遊戲做得極難，理由是延長遊戲壽命，並相信「只要練習就能通關」。程式設計師 Mark Betteridge 甚至因為打不過自己設計的關卡而在辦公室裡怒吼。[源]

**失敗的四個結構性原因**[推論]
1. **沒有存檔與密碼**：13 關要一口氣打完，後段關卡的練習成本極高（每次都要重打前面）。
2. **玩法每關重置**：新的操作邏輯 + 舊的生命數 = 玩家在最陌生的關卡上最沒有容錯。
3. **一擊即死與 6 點血並存**：生命系統無法提供一致的預期。
4. **難度斷崖在第 3 關**：把最難的關卡之一放在第 3 關，導致絕大多數玩家從未見過後面 10 關的精彩內容。

**它做對的地方**[推論]
- 每關開頭都有「安全的前 10 秒」讓玩家理解新玩法。
- Smash Hit 與誇張演出提供了強烈的短期回饋，抵消部分挫折。
- 關卡多樣性讓「再試一次」有內容上的期待，而不只是分數。

---

## ⑨ 技術亮點

1. **用最弱的 mapper 做最強的畫面**：AOROM 只能整段切換 32 KB PRG 與單畫面鏡射，沒有 CHR bank、沒有 scanline IRQ，所有效果都得靠 CPU 時序硬幹。[源]
2. **雙層捲動與垂直視差**：不同關卡用不同手法達成——有的靠背景圖塊動畫、有的靠精準的時序程式碼；**每個 ROM bank 幾乎是不同的引擎**。[源]
3. **玩家角色由兩層精靈疊出**以突破每個精靈 3 色的限制。[源]
4. **CHR-RAM**：圖塊在執行時上傳，換取每關完全不同的圖塊集（這是「每關一種玩法」的美術基礎）。[源/推論]
5. **等距視角與 2D 視角混用**：清版關採偽等距、垂直關採純 2D，在同一作品內切換投影方式。[源]
6. **極端的 ROM 壓縮與重用**，在 256 KB 內塞進 13 種玩法。[源/推論]

---

## ⑩ 音樂音效特色

- David Wise 的配樂被視為 NES 上最具創造力的作品之一；他一生為 46 款 NES 遊戲配樂。[源]
- **Turbo Tunnel 主題**是 chiptune 史上最知名的曲目之一：中速搖滾 groove、切分低音線、明確的 hook。[源]
- 技法特徵（對電子音樂原創遊戲直接可用）[推論]：
  - 用方波做**延遲／回聲**效果（同一旋律延後數幀、降低音量再放一次）。
  - 三角波承擔**貝斯 groove** 而非單純低音長音。
  - 噪音通道寫出接近真實鼓組的節奏型（而非只有 hi-hat）。
  - 曲子結構像流行樂：intro → verse → hook → 循環，而不是無限循環的短句。
- 音樂的品質反過來成為玩家反覆挑戰難關的動力來源之一。[推論]

---

## ⑪ 對原創遊戲的可借鑑清單（10 條）

1. **關卡類型輪替**：每 2–3 關換一種玩法（清版 / 競速 / 垂直 / 追逐），用玩法多樣性取代內容量。
2. **Smash Hit 式終結演出**：只在最後一擊放大／變形，零數值成本換取巨大打擊感。
3. **敵人即機制**：讓追逐者、計時器、移動平台由「有臉的角色」擔任，關卡敘事與機制合一。
4. **每關開頭的安全窗**：新玩法的前 10 秒不放威脅，讓玩家自己摸索操作。
5. **必須避免的錯誤 ①**：高難度 + 無存檔 = 玩家看不到後面 80% 的內容。**一定要給關卡選擇或密碼**。
6. **必須避免的錯誤 ②**：不要在第 3 關放最難的關卡；難度斷崖要放在玩家已經投入成本之後。
7. **必須避免的錯誤 ③**：演出與判定必須一致——看起來會打中就要打中，否則爽感變成憤怒。
8. **雙人友軍傷害要可關閉**：喜劇效果值得保留，但必須是選項。
9. **在弱硬體上用 CHR-RAM 換每關不同美術**：對瀏覽器 / GBA 專案而言，等價作法是每關載入獨立的 tileset 與調色盤。
10. **音樂當作留存機制**：讓玩家願意重試的往往是 BGM。在電子音樂導向的專案裡，值得為難關寫最好的一首曲子，並讓死亡重試時音樂**不從頭開始**（保持 groove 連續）。

---

## ⑫ 來源

- Wikipedia, "Battletoads (1991 video game)" — https://en.wikipedia.org/wiki/Battletoads_(1991_video_game)
- Data Crystal, "Battletoads (NES)"（AOROM／256 KB PRG／CHR-RAM）— https://datacrystal.tcrf.net/wiki/Battletoads_(NES)
- NESdev 論壇, "Battletoads Mapper?" — https://forums.nesdev.org/viewtopic.php?t=14708
- NESdev 論壇, "Battletoads and graphics"（雙層精靈、每 bank 不同手法）— https://forums.nesdev.org/viewtopic.php?t=8637
- NESdev 論壇, "Vertical Parallax effect in Battletoads" — https://forums.nesdev.org/viewtopic.php?t=8364
- Retronauts, "Re(?)Considered: Battletoads" — https://retronauts.com/article/1233/reconsidered-battletoads
- Time Extension, "Community Challenge: Can You Beat Battletoads' Most Notorious Level?" — https://www.timeextension.com/features/community-challenge-can-you-beat-battletoads-most-notorious-level
- The Greatest Game Music, "Battletoads Soundtrack (NES) Review"（David Wise 與 46 款 NES 配樂）— https://www.greatestgamemusic.com/soundtracks/battletoads-soundtrack/
- OC ReMix, "Game: Battletoads [NES, 1991, Tradewest]" — https://ocremix.org/game/741/battletoads-nes
- GameFAQs, "Battletoads Cheats, Codes, and Secrets for NES"（5 條命、關卡 warp）— https://gamefaqs.gamespot.com/nes/587125-battletoads/cheats
- MobyGames, "Battletoads credits (NES, 1991)" — https://www.mobygames.com/game/6134/battletoads/credits/nes/
