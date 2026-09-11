# QA 報告（QA_REPORT）

> 執行者：research-qa agent　｜　執行時間：**2026-09-11 17:52 ~ 18:08**（其他 5 個 agent 同時在改 `src/`，本報告已標註各項的觀測時刻）
> 測試環境：Linux、`.venv/bin/python` + Playwright Chromium、內部解析度 256×224、截圖 scale 3。
> 截圖總目錄：`/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星/shots/agent_qa/`（共 125 張）

## 0. 執行摘要

| 項目 | 結果 |
|---|---|
| `tools/engine_test.py` | **39 / 39 PASS** |
| `tools/enemy_test.py` | **236 / 236 PASS** |
| `tools/boss_test.py` | **ALL PASS**（5 魔王 × idle/fight，各 3/3 勝場） |
| 5 世界 playthrough（預設 maxframes 15000） | **僅 w1 通關**；w2/w3/w4/w5 皆 `cleared=False` |
| 5 世界 playthrough（maxframes 45000） | w1/w2/w3/w5 通關；**w4 仍無法通關** |
| 全 25 房截圖 | 25/25 成功，**`MISSING SPRITES` 全部為空**（無洋紅缺圖） |
| 瀏覽器錯誤 | 全部 playthrough 與截圖 **0 個 pageerror / console error** |
| 問題總數 | **P0 × 1、P1 × 5、P2 × 9**（共 15 項） |

**最值得注意的一句話**：美術素材與引擎機制都很穩（零缺圖、零錯誤、測試全綠），問題集中在 **①w4 魔王打不完、②直式房背景破圖、③中文高筆畫字仍不可讀** 三處。

**時間敏感說明**：中文文字問題在本次 QA 期間被 ui-menu agent 修掉了一大半——17:52 的截圖幾乎所有中文都是細線／糊塊，18:07 重跑後 HUD、魔王名、GameOver、選關世界名皆已可讀。本報告只保留**18:07 重跑後仍然存在**的文字問題。

---

## 1. 問題清單

### P0（卡關 / 阻礙驗收）

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議 agent |
|---|---|---|---|---|---|---|
| **P0-01** | P0 | **w4 / room 4「決鬥平台」/ 魅塔騎士（boss x≈80~270, y≈134）** | 自動通關機器人**永遠打不完魅塔騎士**。預設 15000 幀時 boss 只掉到 39/45；放寬到 **45000 幀仍只掉到 41~42/45**。換能力也一樣：`sword` 42/45、`hammer` 41/45（且 deaths=1）。單獨從 room 4 開場用 `fire` 打 20000 幀也只到 11/45，仍未擊倒。對照 `boss_test.py` 的腳本化戰鬥是 3/3 全勝 → 問題出在**魅塔騎士的 `vanish` / `backstep` 迴避頻率過高**，一般玩法的攻擊幾乎打不中。直接違反 CLAUDE.md「playthrough 5 世界都要能過」的驗收條件。觀測時刻 17:54 與 17:57 兩次重跑結果一致。 | `.venv/bin/python tools/playthrough.py --level w4 --ability sword --godmode --maxframes 45000`<br>`.venv/bin/python tools/playthrough.py --level w4 --room 4 --ability fire --godmode --maxframes 20000` | `shots/agent_qa/w4_r4.png`、`shots/play/w4/` | **levels-bosses** |

> 建議修法：把 `vanish` 的觸發冷卻拉長（例如最短間隔 ≥ 180 幀）、`backstep` 每次戰鬥上限次數，並在 `hurt` 後保證一段不可 vanish 的硬直（≥ 30 幀），讓玩家的連段打得出來。做魔王二階段時請一併處理，否則二階段只會讓這個問題更嚴重。

### P1（明顯問題）

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議 agent |
|---|---|---|---|---|---|---|
| **P1-02** | P1 | `tools/playthrough.py`（影響 w2/w3/w4/w5） | **預設 `--maxframes 15000` 不足以走完關卡**，導致 CLAUDE.md 文件上的標準指令對 4 個世界都回報 `cleared=False`，看起來像關卡壞掉。實測所需幀數：w1 = 12165、w2 = 12292、**w3 = 24332**、**w5 = 22075**、w4 = ∞（見 P0-01）。另外 w5 room0→room1 的移動在兩次執行間差異極大（1456 幀 vs 5898 幀），代表機器人在某處會反覆卡住。 | `.venv/bin/python tools/playthrough.py --level w3 --ability sword --godmode`（失敗）<br>`... --maxframes 45000`（成功） | `/tmp/.../qa/play.log`、`retry.log` | **levels-bosses** |
| **P1-03** | P1 | **w4 / room 1「泡泡塔」**（32×26 磁磚的直式房，鏡頭捲到中下段時） | **背景破圖**：紫色天空 + 彩虹的 parallax 圖層只畫到鏡頭視野的上半部，**下半部是一片沒有背景的淡紫白底**，交界是一條刺眼的水平硬邊；而且接縫下方還會出現**重複的彩虹碎片**（證明是圖層重繪偏移，不是刻意的「雲上/雲下」美術）。左右兩側也各有一條垂直硬邊。17:52 與 **18:00 重跑仍在**。其他直式房（w2 room1 螺旋塔）正常 → 只有 `cloud` 主題的背景有此問題。 | `.venv/bin/python tools/shot.py --scene game --level w4 --room 1 --script "press right 160; step 5; shot a; press right 160; step 5" --out shots/agent_qa/recheck_w4_r1.png` | **`shots/agent_qa/recheck_w4_r1_a.png`**、`shots/agent_qa/mid_w4_r1_b.png`、`shots/agent_qa/w4_r1.png` | **levels-bosses**（`src/art/backgrounds.js`） |
| **P1-04** | P1 | 暫停選單 / 選關畫面 / 結局畫面（12px 中文） | **筆畫密的中文字在 12px 仍然糊成一團、不可讀**。18:07 重跑後確認仍在的字：**繼、續、圖、開、謝、遊**。具體位置：① 暫停選單選取中的黃字「**繼續**」；② 暫停選單「回到地**圖**」；③ 暫停底部提示「ENTER **繼續**」；④ 音樂 / 音效右側的狀態字「**開**」（綠色，完全是一團）；⑤ 選關左上角黃字「**選擇關卡**」；⑥ 結局白字「**感謝遊玩**」。白色一般字重已修好，**剩下的都是黃色/綠色高亮字與高筆畫字**。 | `.venv/bin/python tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 20" --out shots/agent_qa/final_pause.png`<br>`.venv/bin/python tools/shot.py --scene ending --steps 120 --out shots/agent_qa/final_ending.png` | **`shots/agent_qa/final_pause.png`**、`final_select.png`、`final_ending.png` | **ui-menu**（`src/gfx.js` `renderTextCanvas`） |
| **P1-05** | P1 | **選關畫面 W5 標籤**（螢幕座標約 x=185~256, y=98） | 「**迪迪迪城**」的標籤**超出畫面右緣被切掉**，最後一個字只剩一半。W4「泡泡雲海」也貼到很靠右。18:07 重跑仍在。 | `.venv/bin/python tools/shot.py --scene select --steps 60 --out shots/agent_qa/final_select.png` | `shots/agent_qa/final_select.png` | **ui-menu** |
| **P1-06** | P1 | `tools/playthrough.py --godmode` | **`--godmode` 並未真正免死**：w4 用 `hammer` 跑時出現 `deaths=1`。推測 godmode 只鎖 HP，沒擋掉落坑 / 掉出畫面的死亡，導致「無敵測試」的結果不可信。 | `.venv/bin/python tools/playthrough.py --level w4 --ability hammer --godmode --maxframes 45000`（輸出含 `deaths=1`） | `/tmp/.../qa/retry2.log` | **levels-bosses** |

### P2（瑕疵）

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議 agent |
|---|---|---|---|---|---|---|
| **P2-07** | P2 | **w3 / room 1「珊瑚洞窟」**（世界座標約 x=150~260, y=140~180）、**w5 / room 2「地下水牢」** | **水域邊界磁磚拼接生硬**：水體是一塊淺藍矩形色塊，和旁邊的沙／石磁磚之間**沒有過渡磚**，左右緣是一條筆直的硬邊，看起來像貼錯圖層而不是水池。 | `.venv/bin/python tools/shot.py --scene game --level w3 --room 1 --steps 60 --out shots/agent_qa/w3_r1.png` | `shots/agent_qa/w3_r1.png`、`mid_w5_r2_b.png` | levels-bosses |
| **P2-08** | P2 | **w3 / room 1** 整房 | 房名叫「**珊瑚洞窟**」，但背景是開闊的藍天 + 海平線 + 遠方小島，**完全沒有洞窟感**，房名與美術不符。 | 同上 | `shots/agent_qa/w3_r1.png` | levels-bosses |
| **P2-09** | P2 | **w3 / room 1**（水面附近，螢幕 y≈345 與 y≈425 兩條線） | **雙重水平線**：背景畫的「海平線」與實際水體磁磚的「水面線」高度不同，畫面上同時出現兩條水面，玩家難以判斷哪一條才是真的會游泳的高度。 | 同上 | `shots/agent_qa/mid_w3_r1_b.png` | levels-bosses |
| **P2-10** | P2 | **w2 / room 2、room 4**（螢幕 x≈600, y≈50~180） | 背景的**吊鏈裝飾正好畫在月亮上**，兩個亮元素疊在一起，視覺打架。 | `.venv/bin/python tools/shot.py --scene game --level w2 --room 2 --steps 60 --out shots/agent_qa/w2_r2.png` | `shots/agent_qa/w2_r2.png`、`w2_r4.png` | levels-bosses |
| **P2-11** | P2 | **w5 / room 0「城門」出生點**（磁磚座標約 x=2, y=9） | **卡比出生點和金色柱子裝飾重疊**，開場第一幀玩家和柱子是疊在一起的，容易誤以為卡比卡在柱子裡。 | `.venv/bin/python tools/shot.py --scene game --level w5 --room 0 --steps 60 --out shots/agent_qa/w5_r0.png` | `shots/agent_qa/w5_r0.png` | levels-bosses |
| **P2-12** | P2 | 暫停畫面（螢幕 y=0 附近） | 新版暫停面板的「**PAUSE**」標籤**貼齊畫面最上緣，上框線被切掉**。 | `.venv/bin/python tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 20" --out shots/agent_qa/final_pause.png` | `shots/agent_qa/final_pause.png` | ui-menu |
| **P2-13** | P2 | 遊戲內右上 toast（螢幕 x≈130~256, y≈4~20） | 新加的「**ENTER：暫停／說明**」提示 toast **被畫面右緣切掉**，「說明」只剩一半；半透明底框也一起被切。 | `.venv/bin/python tools/shot.py --scene game --level w1 --ability sword --script "step 10" --out shots/agent_qa/recheck_hud_sword.png` | `shots/agent_qa/recheck_hud_sword.png` | ui-menu |
| **P2-14** | P2 | 選關畫面 | **尚未顯示每關收集品 ★ x/3 與最佳分數**（TASKS 已列為待辦；此處記錄為「驗收時要檢查的項目」而非既有 bug）。 | `.venv/bin/python tools/shot.py --scene select --steps 60 --out shots/agent_qa/final_select.png` | `shots/agent_qa/final_select.png` | ui-menu + levels-bosses |
| **P2-15** | P2 | 標題畫面 | 標題**只有 PRESS START，沒有選單**（繼續 / 新遊戲 / 操作說明 / 能力圖鑑 / 設定）。TASKS 已列待辦，18:07 時尚未實作。 | `.venv/bin/python tools/shot.py --scene title --steps 120 --out shots/agent_qa/flow_title.png` | `shots/agent_qa/flow_title.png` | ui-menu |

---

## 2. 已在 QA 期間被修好的問題（記錄，不列入統計）

| 問題 | 17:52 觀測 | 18:07 重跑 |
|---|---|---|
| HUD 能力名中文（「普通」「劍」「火焰」…） | 細線／糊塊，完全不可讀 | **已修，清晰可讀** |
| 魔王名橫幅中文（「大樹威斯比」「洛洛洛與拉拉拉」「克拉寇」「魅塔騎士」） | 黃色 12px 全糊 | **已修，可讀** |
| GameOver「回到標題」「回到地圖：生命與分數重置」 | 糊塊 | **已修** |
| 選關畫面 5 個世界名 | 大部分糊塊 | **已修**（僅左上角黃字「選擇關卡」仍糊，見 P1-04） |
| 暫停選單只有「繼續 / 回到地圖」 | 只有 2 項、無能力卡 | **已重製**：能力卡（圖示 + 說明 + 招式表）+ 6 項選單 + 音樂/音效開關 |

---

## 3. 各項測試詳細結果

### 3.1 自動化測試（17:52 執行，7 秒內全部完成）
```
engine_test.py : 39/39 passed
enemy_test.py  : 236/236 passed
boss_test.py   : whispywoods idle=PASS fight=PASS inhale=PASS
                 lololo      idle=PASS fight=PASS
                 kracko      idle=PASS fight=PASS
                 metaknight  idle=PASS fight=PASS   (3/3 runs won)
                 dedede      idle=PASS fight=PASS   (3/3 runs won)
                 ALL PASS (7s)
```
> 註：`boss_test` 的魅塔騎士 3/3 全勝，但 `playthrough` 的一般玩法完全打不完（P0-01）。兩者差異來自 boss_test 用的是貼身腳本化攻擊，**建議 boss_test 增加一個「模擬玩家距離」的測試案例**，否則這類問題測不出來。

### 3.2 Playthrough 結果總表
| 世界 | maxframes 15000 | maxframes 45000 | 通關所需幀數 | 死亡 | 缺圖 | 錯誤 |
|---|---|---|---|---|---|---|
| w1 翠綠草原 | ✅ cleared | — | 12165 | 0 | 無 | 0 |
| w2 幽靜古堡 | ❌ boss 2/30 | ✅ cleared | 12292 | 0 | 無 | 0 |
| w3 漂浮群島 | ❌ boss 12/40 | ✅ cleared | **24332** | 0 | 無 | 0 |
| w4 泡泡雲海 | ❌ boss 39/45 | ❌ **boss 42/45** | **無法通關** | 0~1 | 無 | 0 |
| w5 迪迪迪城 | ❌ boss 20/60 | ✅ cleared | **22075** | 0 | 無 | 0 |

### 3.3 全房間截圖檢視（25 房，每房 4 張：起點 + 行進中 3 張）
| 世界 | 房數 | 截圖 | 結論 |
|---|---|---|---|
| w1 翠綠草原 | 4 | `w1_r0~r3.png` + `mid_w1_r*.png` | 乾淨，無問題 |
| w2 幽靜古堡 | 5 | `w2_r0~r4.png` + `mid_w2_r*.png` | 僅 P2-10（吊鏈壓月亮）；直式房 room1 背景正常 |
| w3 漂浮群島 | 5 | `w3_r0~r4.png` + `mid_w3_r*.png` | P2-07 / P2-08 / P2-09 集中在 room1 |
| w4 泡泡雲海 | 5 | `w4_r0~r4.png` + `mid_w4_r*.png` | **P1-03 背景破圖（room1）**；boss 房 P0-01 |
| w5 迪迪迪城 | 6 | `w5_r0~r5.png` + `mid_w5_r*.png` | P2-11（出生點壓柱子）、P2-07（水牢水域邊界） |

- **實體卡牆**：25 房逐張檢視 + playthrough 的 `maxX` 紀錄，**未發現卡比被地形卡死的情況**。`maxX` 偏低的 w2 room1（185）、w4 room1（217）、w5 room4（205）都是**直式房**，屬正常。
- **磁磚拼接**：除 P2-07 的水域邊界外，5 個主題的 top / topL / topR / slope 拼接皆正確，斜坡與平台接合處無破洞。
- **洋紅缺圖**：**0 張**。5 次 playthrough 的 `missing sprites` 全部是 `[]`。

### 3.4 場景流程截圖
| 場景 | 指令 | 截圖 | 結論 |
|---|---|---|---|
| 標題 | `--scene title --steps 120` | `flow_title.png` | 畫面完整，僅缺選單（P2-15） |
| 標題→操作說明 | `--scene title --script "step 40; tap select 2; step 30"` | `flow_title_help.png` | 版面清楚、中文可讀 |
| 選關 | `--scene select --steps 60` | `final_select.png` | P1-05、P1-04、P2-14 |
| 進關 | `--scene game --level wN --room R` | `wN_rR.png` ×25 | 見 3.3 |
| 暫停 | `--script "step 30; tap start 2; step 20"` | `final_pause.png` | 已重製，餘 P1-04、P2-12 |
| 暫停（帶能力） | `--ability sword --script "step 20; tap start 2; step 20"` | `flow_pause_sword.png` | 能力卡正確顯示 SWORD / 劍 |
| GameOver | `--scene gameover --steps 60` | `recheck_gameover.png` | 已修好，正常 |
| 結局 | `--scene ending --steps 120` | `final_ending.png` | 餘 P1-04（「感謝遊玩」）；畫面下半偏空 |

### 3.5 8 種能力 HUD / 攻擊外觀
`ab_fire / ab_sword / ab_beam / ab_cutter / ab_spark / ab_stone / ab_ice / ab_hammer .png`
- 8 種帽子皆正確疊在頭頂、位置無偏移；HUD 左下角能力圖示與英文名皆正確。
- 攻擊特效（火舌、劍光、光束鏈、迴旋刃、電場、石頭變身、冰息、鎚擊）**全部有畫面，無缺圖**。
- 石頭形態正確變灰且靜止。

---

## 4. 給總控的建議處理順序

1. **P0-01**（w4 魅塔騎士打不完）— 擋驗收，最優先。levels-bosses。
2. **P1-02 / P1-06**（playthrough 工具的 maxframes 與 godmode）— 修完才能信任後續所有自動驗收。levels-bosses。
3. **P1-03**（w4 room1 背景破圖）— 玩家一定會看到。levels-bosses。
4. **P1-04**（高筆畫中文字仍糊）— ui-menu 已修一大半，剩下的是同一支函式的邊界情況，成本低。
5. **P1-05 / P2-12 / P2-13**（三個文字/面板超出畫面邊界）— ui-menu，可一起改。
6. 其餘 P2 視時間處理。

---

## 5. 附錄：本次使用的完整指令

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python

# 自動化測試
$PY tools/engine_test.py ; $PY tools/enemy_test.py ; $PY tools/boss_test.py

# 5 世界通關（預設與放寬幀數）
for w in w1 w2 w3 w4 w5; do $PY tools/playthrough.py --level $w --ability sword --godmode --shots; done
for w in w2 w3 w4 w5; do $PY tools/playthrough.py --level $w --ability sword --godmode --maxframes 45000; done

# 全 25 房起點截圖（RC: w1=4 w2=5 w3=5 w4=5 w5=6 房）
$PY tools/shot.py --scene game --level wN --room R --steps 60 --out shots/agent_qa/wN_rR.png

# 全 25 房行進中截圖（每房再拍 3 張）
$PY tools/shot.py --scene game --level wN --room R \
   --script "press right 160; step 5; shot a; press right 160; step 5; shot b; press right 200; step 5" \
   --out shots/agent_qa/mid_wN_rR.png

# 場景流程
$PY tools/shot.py --scene title  --steps 120 --out shots/agent_qa/flow_title.png
$PY tools/shot.py --scene title  --script "step 40; tap select 2; step 30" --out shots/agent_qa/flow_title_help.png
$PY tools/shot.py --scene select --steps 60  --out shots/agent_qa/final_select.png
$PY tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 20" --out shots/agent_qa/final_pause.png
$PY tools/shot.py --scene gameover --steps 60  --out shots/agent_qa/recheck_gameover.png
$PY tools/shot.py --scene ending   --steps 120 --out shots/agent_qa/final_ending.png

# 8 能力
for ab in fire sword beam cutter spark stone ice hammer; do
  $PY tools/shot.py --scene game --level w1 --ability $ab --script "step 10; tap attack 1; step 8" \
     --out shots/agent_qa/ab_$ab.png
done
```

---

# Round 2（qa2 agent）

> 執行者：**qa2** agent　｜　執行時間：**2026-09-11 19:28 ~ 19:50**（Part 1 / Part 2），Part 3 於其後分批補做。
> 其他 5 個 agent（ui-flow / mechanics / enemies-bosses2 / player2 / audio2）**同時在改 `src/`**，本節每一項都標註觀測時刻；遇到疑似暫時性錯誤一律重跑一次再記錄。
> 截圖目錄：`/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星/shots/agent_qa2/`
> 本節與 Round 1 的差別：**全部 playthrough 不加 `--godmode`**（Round 1 的「5 世界皆通關」是無敵狀態下的結論）。

## R2-0. 執行摘要

| 項目 | 結果 |
|---|---|
| 非無敵 playthrough（5 世界 × sword/fire/none = 15 次，`--maxframes 30000`） | **15 / 15 全部 `cleared=False`**，每一次都是 `deaths=4` → `GameOverScene`（3 命用完） |
| 15 次裡走最遠的房間 | w4 只到 room 2；w3 只到 room 1；**w1 / w2 / w5 連 room 0 都沒走完** |
| 非無敵魔王房 playthrough（5 魔王 × sword/none = 10 次，`--room <魔王房>`） | 只有 **w4 魅塔騎士 + sword** 通關（1336 幀、deaths=0）；其餘 9 次皆 deaths=4 未通關 |
| Round 1 回歸截圖 | **43 張全部 Read 看過**；**OK 38 項 / 問題 5 項**（P1×2、P2×3） |
| 觀測到的暫時性錯誤 | 1 筆（19:34 `this.waterSplash is not a function`），19:36 重跑已消失 → 見 R2-P0-01 |
| Round 2 新問題總數 | **P0 × 1（已自行修復）、P1 × 6、P2 × 6** |

**最值得注意的一句話**：Round 1 的驗收標準是 `--godmode`，所以「5 世界皆可通關」其實**沒有驗證過難度**；
拿掉無敵之後，自動機器人在 **15 次嘗試中連第 1 個房間都走不完 10 次**，死亡高度集中在 **3 個固定座標**（w1 r0 x≈1197、w2 r0 x≈1030、w5 r0 x≈810），
而這 3 處都是「**多隻新行為敵人夾擊 + 附近沒有番茄**」的組合。魔王方面，Round 1 為了修 P0-01 對魅塔騎士的削弱**過頭了**——
他現在是 5 個魔王裡**最好打的一個**（唯一被機器人打死的），而世界 1 的威斯比反而打不完，**難度曲線目前是反的**。

---

## R2-1. 死亡熱點表（非無敵 playthrough，15 次主線 + 10 次魔王房）

> 「死亡次數」= 15 次主線跑（w1~w5 × sword/fire/none）合計。座標為 `playthrough.py` 印出的 `died at ... x= y=` 世界像素座標，
> 括號內為磁磚座標（÷16）。**「機器人笨」/「關卡不公平」欄是本表的重點**——只有標「不公平」的才列入建議。

| # | 世界 / 房 | 座標（磁磚）| 次數 | 直接死因（已用 shot.py 到該點截圖確認）| 判定 | 建議調整 |
|---|---|---|---|---|---|---|
| 1 | **w1 r0 起點草原** | x≈1193~1203, y=145（74~75, 9）| **10** | `sirkibble@(75,9)` 迴旋刃。Round 1 給 Sir Kibble 加了「接回迴旋刃 → 冷卻縮到 24 幀」，在平地上等於**近乎不間斷的水平彈幕**；前一隻 `hothead@(63,9)` 已經先扣掉 2~3 格血，`tomato@(68,9)` 常常在第一次經過時就吃掉了。 | **關卡不公平**（世界 1 第 1 房不該有連續彈幕）| ① Sir Kibble 的「接回後冷卻 24 幀」只在 w3 以後生效，w1 維持原本冷卻；或 ② 把 `sirkibble@(75,9)` 換成 `waddledee`，Sir Kibble 移到 w1 r1 之後；③ 番茄從 (68,9) 移到 (72,9)（Sir Kibble 前一步）。 |
| 2 | **w5 r0 城門** | x≈809~823, y=113（50~51, 7）| **9** | `shotzo@(51,7)`：**`hp=999`、`hurt(){return false}` 完全無敵**的自動瞄準砲台，正好坐在玩家**必須爬上去**的斜坡頂端（`/###\`），射程 170px、每 100 幀一發直線瞄準彈；爬坡時卡比速度最慢、無處可躲。右邊 4 格再接 `spikeball@(54,9)`（察覺後 2.3 速衝撞）形成夾擊。截圖 `hot_w5r0_shotzo.png`。 | **關卡不公平**（無敵敵人擋在唯一動線上）| ① 把 shotzo 往上移到 (51,5) 之類玩家可以從下方走過去的位置，或移到支線；② 或把斜坡改成兩段、中間給一格掩體；③ 最近的番茄在 (40,4) 高台上，建議在 (48,9) 補 1 顆番茄。 |
| 3 | **w2 r0 古堡玄關** | x≈1021~1050, y=96~145（63~65, 6~9）| **8** | `poppybros@(61,9)` 的**拋物線瞄準炸彈**（Round 1 新行為）：落點直接算在玩家身上，近距離幾乎沒有反應時間，而這段是長直走廊、沒有掩體也沒有高低差可以拉開距離。截圖 `hot_w2r0_poppybros.png`。 | **關卡不公平**（新行為 + 無掩體地形）| ① 拋物線炸彈加 15~20 幀的**預警**（舉手動作 / 落點光圈），或最小投擲距離 48px（太近就改成走開）；② 或把 poppybros 移到 (61,5) 的 `======` 平台上，讓玩家有「站在下面躲」的選項。 |
| 4 | **w3 r0 海濱沙灘** | x≈1032~1043, y=146~161（64, 9~10）| **5** | 水池裡的 `squishy@(64,10)` + `glunk@(68,10)`（水底往上噴彈）夾擊。水中移動慢、攻擊手段受限，而 `tomato@(66,10)` 也在水裡（要先挨打才拿得到）。截圖 `hot_w3r0_water.png`。 | **半數不公平** | 把 `glunk@(68,10)` 往右移 4 格（讓玩家先遇到 squishy 再遇到 glunk），或把番茄移到岸邊 (62,9)。 |
| 5 | **w4 r2 風之迴廊（出口門前）** | x≈1450, y=133（90, 8）| **4** | 出口門正前方 1~2 格就站著敵人（`waddledee@(89,9)`），加上門前有兩道窄坑；玩家在「對準門」的那幾幀完全不能動作。截圖 `hot_w4r2_end.png`。 | **關卡不公平（小）** | 敵人往左移 3~4 格，門口 2 格內淨空（其他房間也建議比照）。 |
| 6 | **w4 r2 風之迴廊** | x≈1209, y=145（75, 9）| 3 | `poppybros@(72,9)` 拋物線炸彈（同 #3）。 | 同 #3 | 同 #3（修行為即可，不必動關卡）。 |
| 7 | **w4 r2 風之迴廊** | x≈745, y=129（46, 8）| 3 | `sirkibble@(48,8)` 迴旋刃 + 站在雲台邊緣（被打到就掉坑）。截圖 `hot_w4r2_sirkibble.png`。 | 機器人笨為主 | 不改；若要保險可把 sirkibble 往內移 2 格離開平台邊緣。 |
| 8 | **w5 r0 城門** | x≈703~752, y=137~145（43~46, 8~9）| 2 | `cappy@(44,9)` + 已經進入 `shotzo@(51,7)` 射程（170px ⇒ 從 x≈640 就開始挨砲）。 | 併入 #2 | 同 #2。 |
| 9 | **w3 r1 珊瑚洞窟** | x≈258, y=161（16, 10）| 2 | 長水道池底 `glunk@(17,10)` + `squishy@(13,10)`，與 #4 同型。 | 併入 #4 | 同 #4。 |
| 10 | **w4 r0 雲海入口** | x≈259 / 716, y=212（16 / 44, 13）| 2 | **掉進雲地板的 1 格寬坑**（map row10 `######.####`）→ y=212 已超出 12 格高的房間 = 摔死。 | **機器人笨**（機器人只會每 45 幀跳一次；人類有 coyote time + 漂浮）| 不改。 |

**其他 1 次性死亡**（不列入建議）：w1 r0 x≈597（waddledee/brontoburt）、w2 r0 x≈567 / 676 / 811（kabu、waddledoo）、w3 r0 x≈385 / 802 / 869（squishy、spike 床旁的 sirkibble、dartwing）、w5 r0 x≈1043（sirkibble@(66,9)）、w3 r1 x≈367 / 1092。

### R2-1a. 共通結論（不分單點）
- **番茄密度不足**：15 次跑裡，死亡點與「上一顆番茄」的距離平均超過 20 格，而且多數番茄放在**支線高台或水底**（w5 r0 (40,4)、w3 r0 (66,10)、w1 r0 (68,9)）。
  建議每個世界的 room 0 在**主線動線上**至少放 2 顆番茄（不要求玩家繞路），HP 6 格的容錯才有意義。
- **Round 1 的敵人行為深化（notice / 接刃 / 拋物線瞄準 / 突刺）全部同時生效在 world 1**，沒有做「世界別的行為分級」。
  建議加一個簡單的分級：`KB.ENEMY_TIER`（w1~w2 用基礎行為、w3 以後才開啟瞄準 / 接刃 / 突刺），或由 levels.js 的敵人定義帶 `tier` 參數。
- **無敵敵人（shotzo）只在 w5 出現 1 隻，而且正好擋在主線上**——無敵敵人應該只當「地形障礙」用，不要放在唯一動線的最窄處。

---

## R2-2. 5 個魔王的難度曲線

指令：`.venv/bin/python tools/playthrough.py --level wN --room <魔王房> --ability <sword|none> --maxframes 20000`（**不加 --godmode**，3 命）。

| 世界 | 魔王 | maxHp | sword 結果 | none 結果 | 機器人打掉的血量（最佳）|
|---|---|---|---|---|---|
| w1 r3 | 大樹威斯比 | 40 | 4 死未通關 | 4 死未通關 | 40 → **29**（27%）|
| w2 r4 | 洛洛洛&拉拉拉 | 30 | 4 死未通關 | 4 死未通關 | 30 → **11**（63%）|
| w3 r4 | 克拉寇 | 40 | 4 死未通關 | 4 死未通關 | 40 → **39**（2%）|
| w4 r4 | 魅塔騎士 | 45 | **通關！frame 1336、deaths=0** | 4 死未通關（最佳 45 → 13）| **100%** |
| w5 r5 | 迪迪迪大王 | 60 | 4 死未通關 | 4 死未通關 | 60 → **58**（3%）|

**結論：目前的曲線不是 w1→w5 遞增，而是 w4 ≪ w2 < w1 ≪ w5 ≈ w3。** 兩個必須修的點：

- **R2-P1-02（見下）魅塔騎士削弱過頭**：Round 1 為了修 P0-01 加了 `vanishCD 180` + `evadeLock 30` + **40 幀 `recover` 硬直（無碰觸傷害）**，
  三個限制疊在一起，讓他變成「站著挨打 40 幀」的沙包——同一支機器人、同一把劍，打世界 1 的威斯比打不完，打世界 4 的魅塔騎士卻是**零傷通關**。
- **R2-P1-03 威斯比 `solid:false`**：w1 r3 的 8 次死亡**全部**發生在 x=412~472，而魔王框是 x=432~472 ——
  也就是說死亡都發生在「玩家站進樹身裡」的時候。樹不是實體 ⇒ 玩家會被慢慢地推進去、在裡面被接觸傷害連續扣血，而樹又不會移動，**沒有脫離的動作提示**。
  這是世界 1 的入門魔王，體驗上最糟。

**二階段是否過強**：從 `--room` 的資料看不出來（機器人幾乎打不到 50%）。用注入的方式（把 `boss.hp` 設成 `maxHp*0.4` 再觀察 120 幀）逐一檢查，
5 個魔王的二階段**演出與招式都正常**（toast、血條、招式切換皆正確，見 R2-3 的 `phase2_w*.png`），沒有出現「一進二階段就秒殺」的招式。
**目前真正的瓶頸是一階段就打不到人，不是二階段太強**，建議先修上面兩點再重測二階段。

---

## R2-3. Round 1 全功能回歸（43 張截圖全部 Read 看過）

| 項目 | 張數 | 結果 | 截圖 |
|---|---|---|---|
| 暫停能力卡 8 能力 + 無能力 | 9 | **9 / 9 OK**（圖示、中英名、2 行風味文字、3 招招式表、下半選單、HUD 皆正確）| `pause_{sword,hammer,fire,ice,beam,cutter,spark,stone,none}.png` |
| 標題（未開選單 / 選單）| 2 | OK（無存檔時正確地只有 新遊戲 / 操作說明 / 能力圖鑑 / 設定）| `title_plain.png`、`title_menu.png` |
| 能力圖鑑 8 頁 | 8 | **8 / 8 頁都打得開、頁碼 1/8~8/8 正確、底部 8 顆圖示與選取框正確**；但 6 頁的說明被截斷（見 R2-P2-07）| `gallery_p1.png` ~ `gallery_p8.png` |
| 操作說明頁 | 1 | OK（8 列全部完整，Round 1 的「被截成 …」已修好）| `help_page.png` |
| 設定頁 | 1 | OK（音樂 / 音效 0~10 格滑桿、按鍵提示開關）；**「畫面縮放」尚未出現**（Round 2 ui-flow 待辦）| `settings.png` |
| 選關（★ 收集顯示）| 1 | OK。注入 `KB.save.stars={w1:[true,false,true]}` 後，下方面板正確顯示「收集星 ★★★ **2/3**」，且 `BEST 0000000` 一列已經在了。**Round 1 的 P1-05「W5 標籤超出右緣」已修好**（「迪迪迪城」完整可見）| `select_stars.png` |
| 5 個秘密房 | 5 | **5 / 5 OK**（每間都有 大星星 + 1UP + 點數星 + 回程門，房間外框裝飾正常，無缺圖）| `secret_{w1r4,w2r5,w3r5,w4r5,w5r6}.png` |
| 5 個魔王二階段 | 15（5×3 連拍）| **5 / 5 OK**（toast 文案正確、血條停在 40%、招式已切換成二階段循環）| `phase2_w{1..5}_{00,01,02}.png` |
| 3 種新敵人在關卡中 | 3 | OK（spikeball 在 w2 r0 x=26；dartwing 在 w3 r0 x=52 空中；snowly 在 w2 r3 x=22 正在噴寒霧）| `enemy_spikeball_w2r0.png`、`enemy_dartwing_w3r0.png`、`enemy_snowly_w2r3.png` |
| 遊戲內「?」提示 + toast | （散見各張）| OK。進新關第一房有「ENTER：暫停／說明」toast，之後右上角常駐 8×8「?」；Round 1 的 P2-13「toast 被右緣切掉」**已修好** | `hot_*.png`、`secret_*.png` |
| HUD 低血量 | 1 | OK（`KB.player.hp=1` 後 HUD 只剩 1 格黃、其餘灰）；但**沒有任何視覺警示**（不閃紅 / 不跳動），只有 `sfx('lowhp')` | `hud_lowhp.png` |
| 魔王房同框（Round 1 修正回歸）| 1 | OK（w1 r3 走 200 幀後卡比與威斯比同時在畫面內）| `w1r3_bosscam.png` |

**Round 1 遺留問題的回歸結果**：P0-01（魅塔騎士打不完）→ **已修，但過頭**（見 R2-P1-02）；P1-04（12px 高筆畫中文）→ 選單已全面 14px，只剩 HUD 能力名仍是 12px（見 R2-P2-08）；
P1-05（W5 標籤超框）→ **已修**；P2-12（PAUSE 標籤超框）→ **已修**；P2-13（toast 超框）→ **已修**；P2-14（選關 ★）→ **已做**；P2-15（標題選單）→ **已做**；
P2-07 / P2-09（w3 水域硬邊 + 雙水平線）→ **仍在**（見 R2-P2-11）；P2-11（w5 出生點壓在金柱上）→ **仍在，而且 w5 r6 秘密房也有同樣問題**。

---

## R2-4. Round 2 問題清單

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議負責 agent |
|---|---|---|---|---|---|---|
| **R2-P0-01** | P0（**已自行消失**）| `src/player.js:88` | `TypeError: this.waterSplash is not a function` → 整個 `Player.update` 爆掉，任何 playthrough 一進第一房就中斷。**觀測時刻 19:34:19 / 19:34:51 兩次**。19:36 重跑已正常（`waterSplash` 已定義在 player.js:485），判定為 player2 agent 寫檔到一半的暫時狀態。**記錄下來是要提醒：編輯 player.js 時請一次寫完再存檔，或收工前跑 `for f in src/*.js src/art/*.js; do node --check "$f"; done`。** | `.venv/bin/python tools/playthrough.py --level w1 --ability none --maxframes 30000` | `/tmp/.../qa2/w1_none.log`（19:34 那版） | **player2** |
| **R2-P1-02** | P1 | `src/bosses.js` 魅塔騎士 / w4 r4 | **削弱過頭，成為 5 魔王中最弱**：同一支機器人 + sword 在 w4 **零傷通關（1336 幀）**，同樣條件打世界 1 的威斯比卻 4 死打不完。原因是 Round 1 同時加了 `vanishCD 180` + `evadeLock 30` + **40 幀完全無傷的 `recover` 硬直**，三者疊加。難度曲線因此變成 w4 最簡單。 | `.venv/bin/python tools/playthrough.py --level w4 --room 4 --ability sword --maxframes 20000`（→ `cleared=True deaths=0`）| — | **enemies-bosses2** |
| **R2-P1-03** | P1 | `src/bosses.js` 威斯比（`solid:false`）/ w1 r3 | **入門魔王體驗最差**：樹不是實體，玩家會走進樹身裡被接觸傷害連續扣血且沒有脫離提示。w1 r3 的 8 次死亡座標（x=412~472）**全部落在魔王框 x=432~472 之內或緊鄰**。 | `.venv/bin/python tools/playthrough.py --level w1 --room 3 --ability sword --maxframes 20000` | — | **enemies-bosses2** |
| **R2-P1-04** | P1 | `src/levels.js` w3 r4 / w4 r4 / w5 r5 | **玩家出生點與魔王只差 1 格（16px）**：`w3 spawn[13,9] bossPos[14,8]`、`w4 spawn[16,9] bossPos[17,9]`、`w5 spawn[16,8] bossPos[17,8]`。登場動畫一結束玩家就貼在魔王身上，必吃一次接觸傷害。（Round 1 為了「同框」把距離拉近，但拉過頭了；w1 176px / w2 192px 是合理值。）| `.venv/bin/python tools/shot.py --scene game --level w4 --room 4 --steps 200 --out /tmp/a.png` | `phase2_w4_01.png`、`phase2_w5_01.png` | **mechanics**（levels.js 擁有者）+ enemies-bosses2 |
| **R2-P1-05** | P1 | `src/enemies.js` Shotzo / w5 r0 (51,7) | **完全無敵的自動瞄準砲台擋在唯一動線的最窄處**（`hp=999`、`hurt(){return false}`、射程 170px）。死亡熱點 #2，9 次。 | `.venv/bin/python tools/shot.py --scene game --level w5 --room 0 --x 48 --y 9 --steps 40 --out shots/agent_qa2/hot_w5r0_shotzo.png` | `hot_w5r0_shotzo.png` | **mechanics**（改位置）／**enemies-bosses2**（若要改射速）|
| **R2-P1-06** | P1 | `src/enemies.js` Sir Kibble / Poppy Bros，出現在 w1 r0、w2 r0 | **Round 1 的新行為沒有分世界**：Sir Kibble「接回迴旋刃 → 冷卻 24 幀」與 Poppy Bros「拋物線瞄準炸彈」在**世界 1 / 2 的第一個房間**就全開。死亡熱點 #1（10 次）與 #3（8 次）。建議加世界別分級或給投擲類加預警幀。 | `.venv/bin/python tools/playthrough.py --level w1 --ability sword --maxframes 30000`（4 死全在 x≈1197）| `hot_w1r0_sirkibble.png`、`hot_w2r0_poppybros.png` | **enemies-bosses2** |
| **R2-P1-07** | P1 | 全 5 世界 room 0 | **主線動線上番茄不足**：番茄多半放在支線高台或水底（w5 (40,4)、w3 (66,10)），死亡點與上一顆可及番茄平均相距 20 格以上。 | 見 R2-1 各列 | `hot_*.png` | **mechanics** |
| **R2-P2-08** | P2 | HUD 左下角能力中文名（12px）| 「鐵鎚」「電擊」「刀刃」等高筆畫字在 HUD 仍然糊（選單已全面 14px，只剩 HUD 沒改）。Round 2 ui-flow 已列為待辦，此處作為回歸紀錄。 | `.venv/bin/python tools/shot.py --scene game --level w1 --ability hammer --script "step 30; tap start 2; step 10" --out shots/agent_qa2/pause_hammer.png` | `pause_hammer.png`、`pause_spark.png` | **ui-flow** |
| **R2-P2-09** | P2 | 能力圖鑑 8 頁 | **6 / 8 頁的說明文字被截成「…」**（劍、光束、電擊、石頭、冰凍、鐵鎚），招式欄也有「按住 45 …」「↓+X / 空…」「變石（無敵…」等截斷。圖鑑是唯一能讀完整說明的地方，截斷等於沒寫。建議說明改 3 行或縮短 `KB.ABILITIES[].desc`。 | `.venv/bin/python tools/shot.py --scene title --script "step 60; tap start 2; step 10; tap down 2; step 6; tap down 2; step 6; tap jump 2; step 20; tap right 2; step 10" --out shots/agent_qa2/gallery_p2.png` | `gallery_p2.png`、`p3`、`p5`、`p6`、`p7`、`p8` | **ui-flow**（版面）／abilities 文案 |
| **R2-P2-10** | P2 | 能力圖鑑第 7 頁（冰凍）| **中文標點出現在行首**：第 2 行以「，」開頭。建議 `UI.wrapLines` 加上「行首不排標點」的規則。 | 同上（翻到 7/8）| `gallery_p7.png` | **ui-flow** |
| **R2-P2-11** | P2 | w3 r1 珊瑚洞窟 / w5 r2 | **Round 1 的 P2-07 / P2-09 仍在**：水體是一塊硬邊矩形、沒有過渡磚；背景海平線與實際水面磁磚高度不同，畫面同時有兩條水平線。 | `.venv/bin/python tools/shot.py --scene game --level w3 --room 1 --x 13 --y 9 --steps 40 --out shots/agent_qa2/hot_w3r1_water.png` | `hot_w3r1_water.png` | **mechanics** |
| **R2-P2-12** | P2 | w5 r0 出生點、**w5 r6 秘密房出生點** | **Round 1 的 P2-11 仍在，而且多一處**：卡比出生點與金色柱子裝飾重疊（r6 秘密房同樣問題）。 | `.venv/bin/python tools/shot.py --scene game --level w5 --room 6 --steps 60 --out shots/agent_qa2/secret_w5r6.png` | `secret_w5r6.png` | **mechanics** |
| **R2-P2-13** | P2 | 關卡開場橫幅（Round 2 新功能）| 「WORLD n ／關名」橫幅與右上角的「ENTER：暫停／說明」toast **重疊**，橫幅右上角被 toast 蓋住。建議橫幅出現時延後 toast，或把橫幅下移 12px。 | `.venv/bin/python tools/shot.py --scene game --level w2 --room 0 --x 22 --y 9 --steps 50 --out shots/agent_qa2/enemy_spikeball_w2r0.png` | `enemy_spikeball_w2r0.png`、`hud_lowhp.png` | **ui-flow** |

---

## R2-5. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"; PY=.venv/bin/python

# 非無敵難度調校（15 次）
for w in w1 w2 w3 w4 w5; do for ab in sword fire none; do
  $PY tools/playthrough.py --level $w --ability $ab --maxframes 30000; done; done

# 非無敵魔王房（10 次）
for s in "w1 3" "w2 4" "w3 4" "w4 4" "w5 5"; do set -- $s; for ab in sword none; do
  $PY tools/playthrough.py --level $1 --room $2 --ability $ab --maxframes 20000; done; done

# 死亡熱點截圖（--x/--y 是磁磚座標）
$PY tools/shot.py --scene game --level w5 --room 0 --x 48 --y 9 --steps 40 --out shots/agent_qa2/hot_w5r0_shotzo.png

# 暫停能力卡 8 能力 + 無能力
for ab in sword hammer fire ice beam cutter spark stone; do
  $PY tools/shot.py --scene game --level w1 --ability $ab --script "step 30; tap start 2; step 10" --out shots/agent_qa2/pause_$ab.png; done
$PY tools/shot.py --scene game --level w1 --script "step 30; tap start 2; step 10" --out shots/agent_qa2/pause_none.png

# 標題選單 / 能力圖鑑第 N 頁 / 操作說明 / 設定
B="step 60; tap start 2; step 10"
$PY tools/shot.py --scene title --script "$B" --out shots/agent_qa2/title_menu.png
$PY tools/shot.py --scene title --script "$B; tap down 2; step 6; tap down 2; step 6; tap jump 2; step 20; tap right 2; step 6; ..." --out shots/agent_qa2/gallery_pN.png
$PY tools/shot.py --scene title --script "$B; tap down 2; step 6; tap jump 2; step 20" --out shots/agent_qa2/help_page.png
$PY tools/shot.py --scene title --script "$B; tap down 2; step 6; tap down 2; step 6; tap down 2; step 6; tap jump 2; step 20" --out shots/agent_qa2/settings.png

# 秘密房 / 新敵人位置
for s in "w1 4" "w2 5" "w3 5" "w4 5" "w5 6"; do set -- $s;
  $PY tools/shot.py --scene game --level $1 --room $2 --steps 60 --out shots/agent_qa2/secret_$1r$2.png; done

# 需要注入 JS 的三項（選關 ★ / 低血量 HUD / 魔王二階段）用 qa2 自製工具 `shots/agent_qa2/jshot.py`（與 shot.py 同介面，多了 --prejs / --js / --seq）
#   選關 ★：--prejs "KB.save.stars={w1:[true,false,true]}"  --scene select
#   低血量：--js "KB.player.hp=1;"
#   二階段：--js "const g=KB.game;g.bossIntroT=0;g.boss.introducing=false;g.boss.hp=Math.round(g.boss.maxHp*0.4);g.boss.maybePhase2();" --seq "3:40"
```
