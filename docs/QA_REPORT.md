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
| **R2-P2-13** | **P1**（第三部分補測後升級）| 關卡開場橫幅（Round 2 新功能）| 「WORLD n ／關名」橫幅與右上角的「ENTER：暫停／說明」toast **重疊**（橫幅右上角被蓋住）；更嚴重的是**開場 2 秒內若跳出任何 toast，會直接疊在橫幅第一行正中央**，兩行字互相蓋掉、完全不可讀（實測「取得能力：火焰」toast 壓在「WORLD 1」上 → `r1_abilityflash.png`）。建議橫幅顯示期間把 toast 佇列住（橫幅收掉再播），或把橫幅整塊下移 24px 讓出 toast 帶。 | `.venv/bin/python shots/agent_qa2/jshot.py --scene game --level w1 --room 0 --js "const p=KB.player;p.ability='fire';KB.game.abilityFlash=60;KB.game.toast('取得能力：火焰');" --steps 20 --out shots/agent_qa2/r1_abilityflash.png` | **`r1_abilityflash.png`**、`enemy_spikeball_w2r0.png`、`hud_lowhp.png` | **ui-flow** |

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

---

## R2-6. Round 2 新功能驗證（第三部分，分批進行）

> 作法：每隔一段時間重讀 `docs/PROGRESS.md` 的 Round 2 區段，看到新完成項目就驗證；同時也直接掃 `src/` 找已經進檔但還沒寫進 PROGRESS 的功能。
> **第 1 輪（PROGRESS 只有 audio2 回報）**：掃 `src/` 發現 ui-flow / mechanics / player2 的程式其實都已進檔，直接先驗。
> **第 2 輪（ui-flow、player2 已回報）**：重驗 ui-flow 後來才做的 HUD 14px / 畫面縮放 / 選關 BEST。

| 功能 | 負責 | 驗證方式 | 結果 | 截圖 |
|---|---|---|---|---|
| **過關結算畫面** | ui-flow | `jshot.py --scene game --level w1 --js "KB.game.score=12340;KB.game.kills=17;KB.game.timeAlive=3600;__kb.goto('result')" --steps 400` | **OK**。逐項跳數字正常，SCORE 12340 / TIME 01:00 / 擊敗敵人 ×17 / 大星星 ★0/3 +0 / HP 獎勵 6×100 **+600** / **TOTAL 0012940**（＝12340+600，加總正確）/ BEST 同步寫入。 | `r2_result_00~03.png`、`r2_result_final.png` |
| **關卡開場橫幅** | ui-flow | 任一 `--room 0` 截圖 | **OK**（「WORLD n ／關名」置中橫幅，不阻擋操作）。**但與右上 toast 重疊** → R2-P2-13。 | `hud_lowhp.png`、`enemy_spikeball_w2r0.png` |
| **競技場（Boss Rush）** | ui-flow | `shot.py --scene arena`；再 `--script "step 30; tap right 2; step 6; tap jump 2; step 200"` 進第一戰；休息室用 `KB.arenaExit(KB.game)` 觸發 | **OK**。選能力頁（9 頁：普通＋8 能力、生命 1 / 連戰 5 名魔王 / 番茄整場共用 3 顆、BEST --:--）、戰鬥中 HUD 換成 `ARENA 1/5` + 計時 `00:03` + 番茄 ×3、休息室 16×12 一屏 3 顆番茄在單向平台上 + 出口門 + `ARENA 2/5`。 | `r2_arena_select.png`、`r2_arena_fight.png`、`r2_arena_rest.png` |
| **HUD 中文 14px / 設定「畫面縮放」/ F 全螢幕 / 選關 BEST** | ui-flow | 第 2 輪重跑 | **OK**（`ui.js:564` HUD 能力中文名已改 `size: UI.MS`；設定頁多一列「畫面縮放 自動」與「F：全螢幕切換」；選關面板有 `BEST`）。**R2-P2-08 視為已修**。 | `r2_pause_hammer2.png`、`r2_settings3.png`、`select_stars.png` |
| **標題選單新項目** | ui-flow | `shot.py --scene title --script "step 60; tap start 2; step 10"` | **OK**（debug 下 6 項：新遊戲 / Extra 模式 / 操作說明 / 能力圖鑑 / 競技場 / 設定）。小問題：選單面板壓在「STAR」標題字上 → R2-P2-16。 | `r2_title_menu2.png` |
| **互動磁磚 F 導火線 + B 炸彈方塊** | mechanics | `shot.py --scene game --level w1 --room 0 --x 57 --y 9` | **OK**（(61,6)~(61,9) 的導火線與 (61,5) 的炸彈方塊都畫得出來，沒有缺圖）。 | `r2_mech_w1r0_fuse_essence.png` |
| **互動磁磚 I 冰磚** | mechanics | `shot.py --scene game --level w1 --room 1 --x 51 --y 9` | **OK**（(52~54,2) 三塊冰磚封住天花板凹室，裡面看得到食物）。 | `r2_mech_w1r1_ice.png` |
| **互動磁磚 X 硬磚** | mechanics | 資料檢查 + `--level w2 --room 0 --x 45 --y 9` | **OK**（w2 r0 (42,3)/(54,3)、w4 r2 (44,1)/(56,1)、w5 r1 (8,2)/(20,2) 都在；`tilemap.js` SOLID 與 `tile_hardblock` 皆已註冊）。截圖時硬磚在畫面上方之外，以資料確認。 | `r2_mech_w2r0_hardblock.png` |
| **暗房 `room.dark`** | mechanics | `--level w2 --room 1 --x 4 --y 24`、`--level w4 --room 3 --x 14 --y 9` | **OK 但偏暗** → R2-P2-17。卡比周圍光圈、火把 / 星星光暈都正確，HUD 不受遮罩影響。 | `r2_mech_w2r1_dark.png`、`r2_mech_w4r3_dark.png` |
| **能力台座 essence** | mechanics | 同上兩張 + w1 r1 | **OK**（碰到即取得：w4 r3 進場後 HUD 立刻變成 `SPARK 電擊`；底座像素圖正常）。全專案共 9 個台座（fire×5、hammer×2、spark×2）。 | `r2_mech_w4r3_dark.png`、`r2_mech_w1r1_ice.png` |
| **傳送星 warpstar** | mechanics + player2 | `--level w3 --room 2 --x 58 --y 9` | **OK**（w3 r2 (60,9)、w4 r2 (53,9) 各 1 個；星星帶閃光，路徑終點在尖刺坑 / 無底洞對岸）。`player.rideStar` 已在 player.js，items.js 也留了 fallback。 | `r2_mech_w3r2_warpstar.png` |
| **游泳打磨（水花 / 氣泡）** | player2 | `--level w3 --room 0 --x 63 --y 9 --script "press right,down 40; step 20"` | **水花 / 氣泡 OK，但發現 R2-P1-14（水中看不見卡比）**。 | `r2_splash.png`、`r2_swim.png`、`r2_swim_zoom.png` |
| **新中魔王 `rollarmor`（鐵甲滾球）** | enemies-bosses2 | `shot.py --scene sheet --filter rollarmor` + 掃 `levels.js` | 精靈 **OK**（walk×2 / roll×2 / attack×2 / hurt / stun 共 8 張，無洋紅缺圖，已註冊在 `KB.ENEMIES.rollarmor` 且繼承 `MiniBoss`）。**但 `levels.js` 裡一隻都沒有放** → R2-P1-15。 | `r2_sheet_rollarmor.png` |
| **Extra 難度鉤子** | enemies-bosses2 / player2 | `enemies.js:37` 中魔王 HP×1.25、標題選單已有「Extra 模式」 | 程式在，**尚未做實機難度量測**（等 mechanics / enemies-bosses2 回報後再測）。 | — |

### R2-6a. 第三部分新增的問題

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議負責 agent |
|---|---|---|---|---|---|---|
| **R2-P1-14** | P1 | `src/tilemap.js` `drawWater` + `src/game.js:395~400` 繪製順序 | **在水裡看不見卡比**。`game.js` 先畫全部實體，**之後**才 `this.map.drawWater(...)`，而 `drawWater` 用 `globalAlpha = 0.72` 把水磁磚整片蓋上去 ⇒ 水中的卡比、敵人、食物全被壓成同一個青藍色，卡比的粉紅完全消失，和旁邊的 squishy 幾乎分不出來（放大圖 `r2_swim_zoom.png` 只能靠眼睛認出他）。這直接對應死亡熱點 #4（w3 r0，5 次）與 #9（w3 r1，2 次）。建議：`globalAlpha` 降到 0.3~0.4，或把水體改成「畫在實體之前 + 只在實體之上疊一層很淡的色調 / 水面波紋」。 | `.venv/bin/python tools/shot.py --scene game --level w3 --room 0 --x 63 --y 9 --script "press right,down 40; step 20" --state --out shots/agent_qa2/r2_swim.png`（state 顯示 `player.x=1020.5 y=161 state:"swim"`，cam.x=912.7 ⇒ 卡比就在畫面 x≈108, y≈161，但肉眼幾乎看不到）| `r2_swim.png`、**`r2_swim_zoom.png`** | **mechanics**（tilemap.js drawWater 是 mechanics 的檔）／ game.js 繪製順序需總控協調 |
| **R2-P1-15** | P1 | `src/levels.js` | **新中魔王 `rollarmor` 做好了但沒有出現在任何關卡**（`KB.ENEMIES.rollarmor` 已註冊、精靈齊全，但掃過 5 世界 30 間房的 `entities` 沒有任何一筆 `t:'rollarmor'`）。TASKS 的 enemies-bosses2 也寫了「敵人配置需求寫給 mechanics」，目前還沒接上。建議放在有 `gatekeeper` 門鎖的房間（現有 3 處：w2 r2 / w3 r2 / w5 r3），或新增一處 w4 的中魔王房。 | `node -e "global.KB={};require('./src/levels.js');…"`（見 R2-5）| `r2_sheet_rollarmor.png` | **enemies-bosses2**（提需求）+ **mechanics**（放進 levels.js）|
| **R2-P2-16** | P2 | 標題選單 | 選單面板（現在 6 項）**壓住標題 logo 的「STAR」字**。建議面板再往下 8~10px，或標題 logo 上移。 | `.venv/bin/python tools/shot.py --scene title --script "step 60; tap start 2; step 10" --out shots/agent_qa2/r2_title_menu2.png` | `r2_title_menu2.png` | **ui-flow** |
| **R2-P2-17** | P2 | 暗房（w2 r1 / w4 r3 / w5 r1）| **暗房裡的敵人幾乎看不見**：光圈半徑 40px，敵人站在光圈邊緣時只剩一團剪影（`r2_mech_w4r3_dark.png` 左側的 snowly 與上方的飛行敵人幾乎辨認不出）。暗房本身很漂亮，但以「不放無預警傷害」為原則，建議①光圈半徑加到 52~56px，或②讓敵人本體帶一點自體微光（眼睛 / 輪廓高亮），或③暗房裡不要放會主動衝過來的敵人。 | `.venv/bin/python tools/shot.py --scene game --level w4 --room 3 --x 14 --y 9 --steps 40 --out shots/agent_qa2/r2_mech_w4r3_dark.png` | `r2_mech_w4r3_dark.png`、`r2_mech_w2r1_dark.png` | **mechanics** |
| **R2-P2-18** | P2 | 結算畫面 | 「W1 翠綠草原」關名的字底被下方面板的上框線切到一點。建議關名往上 3px 或面板往下 3px。 | 見上表結算列 | `r2_result_final.png` | **ui-flow** |

### R2-6b. 已在第 2 輪確認修好的 Round 2 問題
- **R2-P2-08（HUD 能力中文名 12px）→ 已修**（`ui.js:564` 改 `size: UI.MS`＝14）。

### R2-6c. 第 3~4 輪重讀 PROGRESS 的結果（20:00 觀測）
- ui-flow、player2、audio2 已回報；**mechanics 與 enemies-bosses2 到 20:00 為止仍是「（agent 在此追加）」**，但他們的程式其實都已進檔（`src/tilemap.js` 的 X/F/I/D、`levels.js` 的 `MECH` 機關層、`enemies.js` 的 `Rollarmor`），所以上表是直接掃 `src/` 驗的。請這兩位補寫 PROGRESS，否則總控無法判斷哪些是「做完」哪些是「寫到一半」。
- **Extra 模式**：`__kb.goto('game',{extra:true})` 後 HUD 正確變成 3 格 HP（`r2_extra_hud.png`），`enemies.js:34` 的 `applyExtra` 與 `const.js` 的 `extraMaxHp: 3` 都在。
  **但提醒**：一般難度目前機器人 15 / 15 全滅（R2-0），Extra（HP 3、敵人 / 投射物 ×1.2、魔王 HP ×1.25）在一般難度調完之前不建議對外開放。

## R2-7. 整體健康度回歸（20:00）

| 檢查 | 結果 |
|---|---|
| `node tools/level_check.js` | **0 error / 1 warning**（既有的拉拉拉出生點提示）|
| `for f in src/*.js src/art/*.js; do node --check "$f"; done` | **全部通過**（19:34 那次 `waterSplash` 的暫時性錯誤已消失）|
| `playthrough.py --level wN --ability sword --godmode --maxframes 30000` × 5 | **5 / 5 `cleared=True`、deaths=0、`missing sprites: []`**（w1 4686 / w2 7755 / w3 6075 / w4 8449 / w5 9686 幀）|

也就是說：**「能不能走完」沒有退步，退步的是「不用無敵能不能走完」——後者從來沒有被驗過。**
建議把 `playthrough.py` 的驗收條件改成兩條：① `--godmode` 必須通關（路線完整性）；② **不加 `--godmode` 時，`deaths` 應該 ≤ 2**（難度合理性）。目前第 ② 條 5 個世界都不過。

---
# Round 3（qa3 agent）

> 執行者：**qa3** agent　｜　執行時間：**2026-09-11 21:30 ~ 22:20**　｜　截圖目錄：`shots/agent_qa3/`
> 本輪 `src/` **沒有其他 agent 在改**（開工與收工各跑一次 `node --check src/*.js src/art/*.js`，全部通過），所以數字可以直接比較。
> 自製工具：`shots/agent_qa3/qshot.py`（＝ `tools/shot.py` 的 `--script/--seq/--state` ＋ qa2 `jshot.py` 的 `--prejs/--js`，再多一個 `--js2`＝截圖前注入）、
> `shots/agent_qa3/zoom.py`（把 PNG 的某塊遊戲座標放大切出來，用來確認 1~2px 的重疊）。
> **所有截圖都用 Read 工具實際看過**；每一次截圖工具都會印 `MISSING SPRITES` 與 console/pageerror ——
> **本輪 60 餘次截圖 / 20 次 playthrough 全部是 `missing sprites: []`、`console: clean`、0 pageerror**。

## R3-0. 執行摘要

| 項目 | 結果 |
|---|---|
| Round 2 問題回歸（12 項）| **已修 12 / 未修 0**（P2-07 / P2-09 水域兩件事都修了：地圖硬邊 + `backgrounds.js` `hz` 112→**142**）|
| 順手回歸到的另外 2 項 | **R2-P2-09（能力圖鑑說明被截斷）與 R2-P2-10（行首標點）仍未修**，而且從 6/8 頁惡化成 **7/8 頁** → R3-P1-03 |
| 非無敵 playthrough（5 世界 × sword×3 ＋ fire×1 ＝ **20 次**）| **w1 3/3 通關（deaths=2）**、w2 1/3 通關、w3 / w4 / w5 0/3 通關。對照 Round 2 的 15/15 全滅是**大幅進步**，但 balance-levels 自訂的「sword deaths ≤ 2」只有 **1 / 5 世界**達標 |
| 魔王曲線（`boss_test --curve --curve-runs 5`）| **5/5 達標**，但 **曲線不是遞增的**：sword 模型 100 / 100 / 96 / 100 / 90，w1 威斯比 10/10 樣本 100% 且最快（最短 701 幀）＝ 仍是最好打的魔王之一；w4 魅塔騎士兩種模型都還是 100% |
| 全流程截圖（16 個畫面，共 23 張）| 文字全部可讀、無溢出、無洋紅、無 console error；**新發現 1 處版面重疊（選關關名標籤）** |
| Round 3 新問題 | **P1 × 3、P2 × 5**（無 P0）|
| 健康度 | `node tools/level_check.js` → **0 error / 1 warning**；`tools/engine_test.py` → **118/118 PASS**；`node --check` 全通過 |

**最值得注意的一句話**：Round 3 的修復**全部有效**（12/12），主線難度從「機器人 15/15 全滅」變成「w1 穩定通關、w5 能走到最後的魔王房」；
但**難度曲線仍然不是遞增的** —— 兩種玩家模型、10 個樣本，w1 的威斯比和 w4 的魅塔騎士都是 100% 被打死，
而且 `playthrough.py` 的機器人與 `boss_test.py` 的機器人對同一隻魔王給出天差地遠的結果（迪迪迪：`boss_test` 90%、`playthrough` **0~2%**），
**在這兩支工具的魔王戰打法統一之前，「deaths ≤ 2」這條驗收條件對 w2 / w5 其實量不到關卡本身的難度**（R3-P1-01）。

---

## R3-1. Round 2 問題逐項回歸（12 / 12 已修）

| # | 問題（Round 2 描述）| 判定 | 證據截圖 / 量測 |
|---|---|---|---|
| **R2-P1-14** | 水中看不見卡比 | **已修** | `z_w3r0_01.png`（w3 r0 池底，卡比是明顯的粉紅色、看得到氣泡與水草）、`reg_water_w3r1.png`（w3 r1 水道，同框有 squishy / glunk 也能分辨）。註：第一次截到的 `reg_water_w3r0.png` 卡比是一塊白方塊，那是**受傷無敵閃白**（`hp=5`）不是水層問題，補拍 3 連張後確認 |
| **R2-P1-15** | 新中魔王 `rollarmor` 沒進關卡 | **已修** | `reg_rollarmor_w4r2.png` ＋ `__kb.entities()` 掃描：w4 r2 有 `{t:'rollarmor', x:487.6, y:130, hp:12, state:'slam'}`，同房有 `gatekeeper@x=1472` 與上鎖出口門（`f08_lockeddoor.png`）|
| **R2-P1-04** | 魔王房出生點與魔王只差 16px | **已修** | `reg_boss_w3r4.png` / `reg_boss_w4r4.png` / `reg_boss_w5r5.png` —— 三張都是「登場動畫結束、魔王與卡比同框、**HP 6/6 沒被碰到**」|
| **R2-P2-13** | 開場橫幅與 toast 重疊 | **已修** | `reg_banner_toast.png`：「WORLD 1／翠綠草原」橫幅（y 32~80）＋ 下方「取得能力：火焰」（y≈84），兩行都完整可讀，右上角的「ENTER：暫停／說明」提示框（y 3~22）也沒有壓到橫幅 |
| **R2-P2-16** | 標題選單面板壓住 logo 的「STAR」 | **已修** | `reg_title_menu.png`：6 項選單面板從 y=64 開始，「KIRBY STAR」完整露出，底部資訊列 / 提示列未被壓 |
| **R2-P2-17** | 暗房裡看不見敵人 | **已修** | `reg_dark_w4r3.png`（dartwing / cappy / snowly 三隻各自有一圈挖出來的光暈，本體看得清楚）、`reg_dark_w5r1.png`（sirkibble、gordo 同樣可見）。`game.js drawDark` 確實照 balance-enemies 的跨檔需求對 `ent.glow` 挖了洞 |
| **R2-P2-18** | 結算關名被面板上框線切到 | **已修** | `reg_result.png`：「W1 翠綠草原」在面板之上、完全沒被切；「大星星」後面已改成 3 顆 `uifb_star` 像素星（未取得的變暗）＋「0/3」|
| **P2-07** | 水體是硬邊矩形、沒有過渡磚 | **已修** | `reg_water_w3r0.png` / `reg_water_w3r1.png` / `reg_water_w5r2.png`：左右兩岸的水面都沿著 `\` `/` 斜坡收邊，沒有直上直下的硬邊 |
| **P2-09** | 背景海平線與實際水面高度不同（兩條水平線）| **已修** | `src/art/backgrounds.js:147` 的 `const hz = 142 - camY * 0.1;`（Round 2 是 112），水面磁磚在 y=144 ⇒ 背景海平線與水面切齊。`reg_water_w3r0.png` 只剩一條水平線 |
| **P2-11 / R2-P2-12** | 出生點壓金柱（w5 r0 / r6）| **已修** | `reg_gold_w5r0.png`（卡比在 x≈7，金柱在 x≈23）、`reg_gold_w5r6.png`（卡比在 x≈6，金柱在 x≈20）|
| **競技場結算魔王順序斷行** | 中文名被斷在字中間 | **已修** | `reg_arena_result.png`：第 1 行「大樹威斯比→洛洛洛 & 拉拉拉→克拉寇→」、第 2 行「魅塔騎士→迪迪迪大王」，只在「→」處換行。**提醒**：第 1 行實測寬度已經到 230px（上限 240），`orderLines` 的 `PER_LINE=3` 幾乎沒有餘裕 |
| **競技場登場字幕 60 幀** | 原本 150 幀 | **已修** | runtime 量測：競技場第一戰 `bossIntroMax=60`、`arena=true`；一般關卡 w1 r3 `bossIntroMax=150`。截圖 `f14_arenaintro_00~04.png`（「大樹威斯比／WHISPY WOODS」字幕完整、置中）|

### R3-1a. 順手回歸到、但**仍未修**的 Round 2 問題
- **R2-P2-09（能力圖鑑說明被截成「…」）→ 未修，且惡化**：Round 2 是 6/8 頁，本輪 8 頁全拍（`gal_p1~p8.png`）後是 **7/8 頁**（只有第 1 頁「火焰」完整）。
  最嚴重的是第 5 頁「電擊」，**說明 + 3 個招式名全部被截斷**（「放電（44px…」「放電中…」「按住 45…」「電擊波（96…」）。詳見 R3-P1-03。
- **R2-P2-10（中文標點出現在行首）→ 未修**：第 7 頁「冰凍」第 2 行仍以「，」開頭（`gal_p7.png`）。

---

## R3-2. 非無敵 playthrough 量測（5 世界 × sword×3 ＋ fire×1 ＝ 20 次）

指令（全部 **不加 `--godmode`**、3 條命、`--maxframes 30000`，5 個世界並行跑）：
```bash
for w in w1 w2 w3 w4 w5; do
  for i in 1 2 3; do .venv/bin/python tools/playthrough.py --level $w --ability sword --maxframes 30000; done
  .venv/bin/python tools/playthrough.py --level $w --ability fire  --maxframes 30000
done
```

### R3-2a. 總表

| 世界 | sword run1 | run2 | run3 | **平均 deaths** | **最佳** | sword 通關率 | fire（1 次）| Round 2 基準 |
|---|---|---|---|---|---|---|---|---|
| **w1 翠綠草原** | 2 / **cleared** | 2 / **cleared** | 2 / **cleared** | **2.0** | **2** | **3 / 3** | **0 死 / cleared** | 4 死 / 走不完 room 0 |
| **w2 幽靜古堡** | 4 / ✗ | **1 / cleared** | 5 / ✗ | 3.3 | **1** | 1 / 3 | 5 死 / ✗（到 r4）| 4 死 / 走不完 room 0 |
| **w3 漂浮群島** | 4 / ✗ | 4 / ✗ | 4 / ✗ | 4.0 | 4 | 0 / 3 | 4 死 / ✗（到 r2）| 4 死 / 到 r1 |
| **w4 泡泡雲海** | 4 / ✗ | 4 / ✗ | 2 / ✗（吃滿 30000 幀）| 3.3 | 2 | 0 / 3 | 5 死 / ✗（到 r2）| 4 死 / 到 r2 |
| **w5 迪迪迪城** | 4 / ✗ | 4 / ✗ | 4 / ✗ | 4.0 | 4 | 0 / 3 | 4 死 / ✗（**到 r5 魔王房**）| 4 死 / 走不完 room 0 |

**和 Round 2 比**：Round 2 是 **15 / 15 全部 `cleared=False` 且 `deaths=4`**，其中 w1 / w2 / w5 連第一個房間都走不完。
Round 3 的 20 次裡有 **5 次通關**（w1 ×4、w2 ×1），沒通關的也都走得遠很多（w5 從 room 0 走到 **room 5 拳擊台**、w3 / w4 走到 room 2）。
**但 balance-levels 自己訂的驗收條件「不加 --godmode 時 sword 每世界 deaths ≤ 2」目前只有 w1 達標（1 / 5）。**
（註：w1 的 3 次 sword 樣本完全相同 —— 這一關的隨機性剛好沒被觸發；w2 / w4 的樣本差異很大，單一樣本不可信，至少要 3 次。）

### R3-2b. 剩餘死亡點（20 次合計 68 死）

> 座標是 `playthrough.py` 印的世界像素座標，括號是磁磚座標（÷16）。已逐點用 `qshot.py --x --y` 截圖確認。

| # | 世界 / 房 | 座標（磁磚）| 次數 | 直接死因 | **判定** | 建議 |
|---|---|---|---|---|---|---|
| 1 | **w5 r5 拳擊台（迪迪迪）** | 全房 | **9** | 3 次走到魔王房，離場時魔王 `hp=59~60 / 60` ⇒ 機器人**幾乎沒打到迪迪迪**。同一隻魔王 `boss_test --curve` 是 **90%**。截圖 `d_w5r5_boss.png` | **機器人笨（工具）** | 見 **R3-P1-01**：`playthrough.py` 的魔王戰打法要和 `boss_test.py` 的模型統一，否則 w5 的關卡難度量不到 |
| 2 | **w3 r2 浮島跳躍・第 2 段尖刺床** | x=484~540（30~34, 9~10）| **7** | 5 格連續尖刺；上方雖然有 balance-levels 補的單向平台 (34,8)(35,8)，但機器人每 45 幀才跳一次，常常落在尖刺中間 | **機器人笨為主，關卡次之** | 上方平台從 2 格延長到 (32~36,8) 5 格，讓「上路」變成看得懂的主動線；或第 2 段再縮成 3 格 |
| 3 | **w2 r4 洛洛洛 & 拉拉拉** | x=33~153 | **8** | 同 #1：run3 死 5 次時魔王還有 `hp=21/30`（只打掉 30%），`boss_test --curve` 卻是 100% | **機器人笨（工具）** | 同 R3-P1-01 |
| 4 | **w1 r1 星星森林** | x=407.5（25.5, 6.3）與 x=542.8（33.9, 6.1）| **6**（每次 sword 跑各 2 次）| 漂浮越過 (24~27) 星星方塊時，方塊頂上的 `waddledee@(25,7)` 與右邊的 `hothead@(37,6)` 連續碰撞，**血量耗盡在半空**（y≈97~100，不是摔死）| **可接受**（w1 仍 3/3 通關且 deaths=2 達標）| 若要更寬鬆：把 `waddledee@(25,7)` 往上挪 1 格或改成不會走到方塊邊緣的 `cappy` |
| 5 | **w4 r2 風之迴廊・鐵甲滾球前** | x=274~355（17~22, 8~9）| **5** | 雲台段；**hammer 能力台座在 (22,9)，正好在死亡熱點的最右端** ⇒ 機器人常在拿到鐵鎚之前就把 3 條命用完，而後面是上鎖的中魔王房 | **關卡問題** | 見 **R3-P2-05**：台座前移到坑之前（(16,9) 或 (14,9)）|
| 6 | **w4 r2 鐵甲滾球本體** | x=484~610（30~38）| **5** | `rollarmor@(33,9)` 的滾動衝撞與 `slam` 震波（實測震波在 x=448 與 545 兩處同時存在）| **中魔王偏強**（但有保底武器，設計成立）| 若要放寬，照 balance-levels 的建議拉長 `open` 硬直，不要降 hp |
| 7 | **w3 r0 海濱沙灘・斜坡底單格尖刺** | x=807~842（50~52, 9）| **4** | balance-levels 已把 3 格尖刺縮成 1 格，但它坐在 `\` 斜坡的正下方，走下斜坡的加速度讓「跳過去」的時機很窄。截圖 `d_w3r0_spike.png` | **關卡（小）** | 把這格尖刺往右移 2 格離開斜坡底，或在尖刺上方補一塊單向平台 |
| 8 | **w3 r2 第 1 段尖刺床** | x=185~222（11.6~13.9）| **4** | 同 #2（5 格尖刺）。截圖 `d_w3r2_a.png` | 機器人笨為主 | 同 #2 |
| 9 | **w2 r0 古堡玄關長廊** | x=660~940（41~59, 9）| **4**（只發生在 run1）| 12 格無掩體走廊 ＋ shotzo / cappy；run2 / run3 完全沒死在這 | **樣本變異，暫不建議動** | 若要動，只需在 (48,8) 補一根石柱 |
| 10 | **w5 r1 守衛長廊（暗房）** | x=819~1408 | **3**（只發生在 run2）| 暗房長廊，可視半徑 40px | 樣本變異 | — |
| 11 | **w4 r0 / r2 一格寬雲洞** | w4 r0 x=259.6（16.2, y=212＝摔出地圖）、w4 r2 x=610.5（38.2, y=212）| **2** | 洞寬 16px、卡比框寬 14px ⇒ 走過去必掉，**洞底沒有任何東西＝即死**。截圖 `d_w4r0_pit.png` | **關卡問題（balance-levels 自承未處理）** | 見 **R3-P2-06** |
| 12 | 其他零星 | w3 r1 (20,10) 水道 1、w5 r2 (16~61) 3、w5 r3 (10,6) 1、w4 r1 (11,20) 1、w4 r2 (70,1) 1、w2 r2 (54,9) 2 | 各 1~3 | 分散、不重複 | 機器人笨 | — |

---

## R3-3. 魔王難度曲線複測

```bash
.venv/bin/python tools/boss_test.py --curve --curve-runs 5              # sword、真實魔王房、不加無敵、3 條命
.venv/bin/python tools/boss_test.py --curve --curve-mid --curve-runs 5  # 中距離（刀刃）玩家模型
```

| 世界 | 魔王 | 目標 | **sword 5 樣本** | 平均 | **mid 5 樣本** | 平均 | 達標 | 平均擊殺幀數（sword）| 玩家被打中次數（sword）|
|---|---|---|---|---|---|---|---|---|---|
| w1 | 大樹威斯比 | ≥ 80% | 100 / 100 / 100 / 100 / 100 | **100** | 100 / 100 / 100 / 100 / 100 | **100** | ✅ | **822**（701~1026，全勝）| 1 / 4 / 1 / 2 / 3 |
| w2 | 洛洛洛 & 拉拉拉 | ≥ 70% | 100 / 100 / 100 / 100 / 100 | **100** | 100 / 47 / 100 / 100 / 100 | **89** | ✅ | 1225（821~1582，全勝）| 4 / 4 / 5 / 2 / 2 |
| w3 | 克拉寇 | ≥ 60% | 80 / 100 / 100 / 100 / 100 | **96** | 100 / 80 / 35 / 65 / 85 | **73** | ✅ | 779（4 勝）＋ 1 次 gameOver | 3 / 4 / 4 / 4（+ 失敗樣本 24）|
| w4 | 魅塔騎士 | ≥ 50% | 100 / 100 / 100 / 100 / 100 | **100** | 100 / 100 / 100 / 100 / 100 | **100** | ✅ | **838**（746~946，全勝）| **4 / 4 / 2 / 5 / 5** |
| w5 | 迪迪迪大王 | ≥ 40% | 65 / 100 / 93 / 100 / 92 | **90** | 10 / 100 / 100 / 80 / 100 | **78** | ✅ | 894（2 勝）＋ 3 次 gameOver | 2 / 1（+ 失敗樣本 17~21）|

原始輸出：`shots/agent_qa3/curve_sword.txt`、`curve_mid.txt`（每個樣本都有 `frames / died / gameOver / hits / playerHurt / playerMinHp`）。

### R3-3a. 主觀判斷：**曲線不是遞增的**

- **達標 ✅，但「達標」只是下限**：5 個目標全部通過，因為目標是「至少打掉 n%」；**5 個魔王有 4 個是 100%**，等於這條檢查已經失去鑑別度。
- **w4 魅塔騎士兩種模型都是 100%，而且平均 838 幀就殺完 —— 比 w2 洛洛洛（1225 幀）還快，只比 w1 威斯比（822 幀）慢 16 幀。**
  balance-enemies 把 `recover 40→16` 之後他確實會反擊（`playerHurt` 是 5 個魔王裡最高的 2~5），但**打不死玩家**。
  → **採納 balance-enemies 自己提的方案**：二階段 `slash` dmg 1→**2**，或 `maxHp` 45→**55**（兩者擇一，不要再加硬直 —— 硬直只會讓貼身揮劍的機器人更快贏）。
- **w1 威斯比反而是「最好打」的那一隻**：10 / 10 樣本 100%，最短 701 幀、`playerHurt` 最低（1~4）。
  Round 2 的問題（走進樹身被連續扣血）修過頭了：`trunk` 縮到 24px 寬 + `contactCD 45` + 吹風期間不扣血，三個一起加。
  → 建議把三項擇一放寬（例如吹風期間恢復接觸傷害，但保留 `blowPush`），讓 w1 有「入門魔王」該有的壓力，同時**別動 hp**。
- **實際上比較有鑑別度的是 `mid`（中距離）模型**：100 / 89 / 73 / 100 / 78 —— w3 最低、w4 突起。
  建議 balance-enemies 之後就用 `--curve-mid` 當主要指標，`--curve`（sword 貼身）當「會不會卡關」的底線檢查。
- **樣本變異**：`--curve-runs 3` 完全不夠（w5 sword 的 5 個樣本是 65/100/93/100/92）。本節一律用 5 次，建議之後也維持 5 次以上。

---

## R3-4. 全流程截圖（16 個畫面 / 23 張，逐張 Read）

| # | 畫面 | 截圖 | 結果 |
|---|---|---|---|
| 1 | 標題 | `f01_title.png` | OK（logo / PRESS START / 底部兩行提示都可讀）|
| 2 | 標題選單 | `reg_title_menu.png` | OK（6 項，不壓 logo）|
| 3 | 能力圖鑑 8 頁 | `gal_p1~p8.png` | **問題**：7/8 頁說明被截成「…」、第 5 頁連招式名都截斷、第 7 頁行首「，」→ **R3-P1-03** |
| 4 | 設定 | `f04_settings.png` | OK（音樂 / 音效 10 格滑桿、按鍵提示、畫面縮放、F 全螢幕）|
| 5 | 選關 | `f05_select.png`、`z_select_default.png` | **問題**：W3 的關名標籤壓住 W1 標籤與 W2 節點的 ★x/3 → **R3-P2-04** |
| 6 | W1 開場橫幅 | `f06_banner.png`、`reg_banner_toast.png` | OK（橫幅 ＋ 下方 toast 兩行都可讀）|
| 7 | 暫停卡 | `f07_pause.png` | OK（能力卡 2 行風味文字完整、3 招式表、下半選單 6 項、HUD 仍在、互不重疊）|
| 8 | 中魔王鎖門（w4 r2 rollarmor）| `reg_rollarmor_w4r2.png`、`f08_lockeddoor.png` | OK（滾球在 x≈30、hammer 台座、出口門上鎖圖示清楚）|
| 9 | 魔王二階段 | `f09_phase2_w5_00~02.png` | OK（迪迪迪變色、toast「迪迪迪大王怒了！」、血條 40%）|
| 10 | 結算 | `reg_result.png` | OK（關名不被切、★ 像素星、TOTAL＝SCORE+獎勵、BEST 同步）|
| 11 | 選關 BEST | `f11_select_best.png` | OK（`BEST 0009870`、`收集星 ★★★ 3/3`、`CLEAR` 旗）|
| 12 | 競技場選能力 | `f12_arena_select.png` | OK（9 格能力縮圖、規則兩行、BEST --:--）。小瑕疵：說明第 2 行把「複製」斷在兩行之間（`吸入敵人，按↓吞下複 / 製能力`）|
| 13 | 競技場休息室 | `f13_arena_rest_00~01.png` | OK（3 顆番茄在單向平台上、出口門、HUD `ARENA 2/5` ＋ `00:05` ＋ 番茄 ×3）|
| 14 | 競技場結算 | `reg_arena_result.png` | OK（順序只在「→」換行、NEW RECORD 閃爍）|
| 15 | GAME OVER | `f15_gameover.png` | OK（`回到地圖` / `回到標題` ＋ 下方說明）|
| 16 | 結局 | `f16_ending_seq_01~03.png` | OK（`本作為同人致敬作品 / 所有美術與音樂皆為原創 / FINAL SCORE / THE END / PRESS START` 全部完整）。註：`--steps 200` 那張還在逐字打字，看起來像被截斷，要跑到 ≥ 280 幀才會打完 |

另外一起檢查的畫面：暗房（`reg_dark_w4r3/w5r1.png`）、水域（`reg_water_*.png`）、3 間魔王房開場（`reg_boss_*.png`）、競技場登場字幕（`f14_arenaintro_*.png`）。
**23 張全部：無洋紅缺圖（`missing sprites: []`）、無 console error、無文字溢出畫面邊界。**

---

## R3-5. Round 3 新問題清單

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議負責 |
|---|---|---|---|---|---|---|
| **R3-P1-01** | P1 | `tools/playthrough.py`（魔王戰 AI）| **兩支測試工具對同一隻魔王的結論相反**：`boss_test --curve` 說迪迪迪被打掉 **90%**、洛洛洛 **100%**；但 `playthrough.py` 的機器人走到同一間房，**離場時迪迪迪 `hp=59~60/60`（0~2%）、洛洛洛 `hp=21/30`（30%）**。w5 的 9 次死亡與 w2 的 8 次死亡全部發生在魔王房，也就是說「w5 deaths=4」其實是**工具打不動魔王**，不是關卡難度。在兩支工具的打法統一（或 playthrough 直接沿用 `boss_test` 的 `[sword]` 模型）之前，**「不加 --godmode 時 deaths ≤ 2」對 w2 / w5 量不到東西**。 | `.venv/bin/python tools/playthrough.py --level w5 --ability sword --maxframes 30000`（→ `rooms=[0..5] deaths=4 boss hp 60/60`）對照 `.venv/bin/python tools/boss_test.py --curve --curve-runs 5` | `d_w5r5_boss.png` | **levels**（playthrough.py 擁有者）＋ **enemies**（boss_test.py 擁有者）|
| **R3-P1-02** | P1 | `src/bosses.js` 魅塔騎士 / 威斯比 | **魔王曲線仍不遞增**。sword 模型 100 / 100 / 96 / 100 / 90，mid 模型 100 / 89 / 73 / 100 / 78 —— **w4 魅塔騎士兩種模型 10/10 樣本全 100%、平均 838 幀就被殺完**（比 w2 的 1225 幀還快）；**w1 威斯比 10/10 全 100%、最短 701 幀、玩家只掉 1~4 格血**，是全系列最好打的一隻。目標值（≥80/70/60/50/40）因為是下限，已經沒有鑑別度。 | `.venv/bin/python tools/boss_test.py --curve --curve-runs 5`；`... --curve-mid --curve-runs 5` | `curve_sword.txt`、`curve_mid.txt` | **enemies** |
| **R3-P1-03** | P1 | `src/ui.js` 能力圖鑑（`GalleryScene`）| **R2-P2-09 未修且惡化：8 頁有 7 頁的說明被截成「…」**（只有第 1 頁火焰完整）。最嚴重是第 5 頁「電擊」：說明被截，**3 個招式名也全被截**（「放電（44px…」「放電中…」「按住 45…」「電擊波（96…」）；第 3 / 4 / 6 / 8 頁也各有 1 個招式名被截。第 7 頁「冰凍」第 2 行仍以「，」開頭（**R2-P2-10 未修**）。圖鑑是唯一能讀完整說明的地方，截斷等於沒寫。 | `.venv/bin/python shots/agent_qa3/qshot.py --scene title --script "step 60; tap start 2; step 6; tap down 2; step 6; tap down 2; step 6; tap down 2; step 6; tap jump 2; step 30; shot p1; tap right 2; step 8; shot p2; …" --out shots/agent_qa3/gal.png` | `gal_p1~p8.png`（尤其 `gal_p5.png`、`gal_p7.png`）| **ui**（版面：說明改 3 行 / 招式欄加寬）＋ abilities 文案 |
| **R3-P2-04** | P2 | `src/ui.js` `StageSelectScene` 關名標籤 | **選關地圖上的關名標籤互相重疊**：W3「漂浮群島」的標籤條壓住 ① W1「翠綠草原」標籤的最後一個字、② **W2 節點下方的 ★x/3 收集標記**（完全看不到 W2 收集了幾顆）。另外 W5「迪迪迪城」標籤右緣到 x≈251，已經頂到地圖外框。有無存檔都一樣。 | `.venv/bin/python shots/agent_qa3/qshot.py --scene select --steps 60 --out shots/agent_qa3/z_select_default.png` | `f05_select.png`、**`z_select_labels.png`（放大圖）**、`z_select_default.png` | **ui** |
| **R3-P2-05** | P2 | `src/levels.js` w4 r2 | **上鎖中魔王房的保底武器在死亡熱點的「之後」**：hammer 能力台座在 (22,9)，而 5 次死亡集中在 x=274~355（磁磚 17~22）＝ 台座**正前方**的雲台段。機器人常常在拿到鐵鎚前就用完 3 條命，而鐵甲滾球的鐵殼會彈開徒手攻擊 ⇒ 一旦空手進場就是死循環。 | `.venv/bin/python tools/playthrough.py --level w4 --ability sword --maxframes 30000`（死亡點 x=274.8 / 335.6 / 355.6）| `d_w4r2_a.png` | **levels** |
| **R3-P2-06** | P2 | `src/levels.js` w4 r0 / r2 / r3 | **一格寬雲洞仍是「必掉且即死」**（balance-levels 自承未處理）：洞寬 16px、卡比框寬 14px，走過去一定掉下去，洞底沒有踏腳雲也沒有地板。實測 w4 fire run1 在 r0 x=259.6（磁磚 16.2）直接 `y=212` 摔出地圖；w4 sword run2 在 r2 x=610.5 同樣死法。已知位置：r0 x=14/16、r2 x=10/38、r3 x=20。 | `.venv/bin/python tools/playthrough.py --level w4 --ability fire --maxframes 30000` | `d_w4r0_pit.png` | **levels** |
| **R3-P2-07** | P2 | `src/levels.js` w3 r2 | **兩段 5 格尖刺床是全專案最大的死亡熱點**（w3 的 16 次死亡有 11 次在這裡）。第 2 段上方雖然有單向平台 (34,8)(35,8)，但只有 2 格，跳上去的落點很窄；第 1 段上方是 row8 的既有落腳點但同樣只有 1~2 格。 | `.venv/bin/python shots/agent_qa3/qshot.py --level w3 --room 2 --x 9 --y 9 --ability sword --steps 40 --out shots/agent_qa3/d_w3r2_a.png` | `d_w3r2_a.png`、`d_w3r2_b.png` | **levels** |
| **R3-P2-08** | P2 | `src/levels.js` w3 r0 | **斜坡底的單格尖刺**（磁磚 52,9）造成 4 次死亡。尖刺本身只有 1 格（Round 3 已縮短），但它坐在 `\` 斜坡的正下方，走下斜坡時的水平速度讓起跳時機很窄。 | `.venv/bin/python shots/agent_qa3/qshot.py --level w3 --room 0 --x 48 --y 9 --ability sword --steps 40 --out shots/agent_qa3/d_w3r0_spike.png` | `d_w3r0_spike.png` | **levels** |

### R3-5a. 觀察（不列入問題，給下一輪參考）
- **競技場結算第 1 行已經到 230 / 240px**：`arena.js orderLines` 的 `PER_LINE = 3` 沒有餘裕了，魔王中文名再加長就會爆行。
- **競技場選能力頁**「無能力」說明把「複製」斷在兩行之間（`吸入敵人，按↓吞下複 / 製能力`），不影響閱讀但可以靠 `UI.wrapLines` 的詞界規則改善。
- **能力圖鑑面板下緣**（y≈193）之下會露出標題畫面底部那兩行變暗的提示字，視覺上有點雜；面板加高 8px 或把底層那兩行在圖鑑開啟時隱藏即可。
- **截圖時看到「卡比不見了」不一定是 bug**：無敵閃爍（`player.invuln > 0`）會有整幀不畫玩家。本輪在 w3 r0 與 w5 r5 各誤判過一次，都是用 `--seq` 連拍 + 逐像素掃描（`getImageData` 找粉紅）排除的。建議之後的 QA 一律連拍 3 張再下結論。

---

## R3-6. 健康度回歸（22:20）

| 檢查 | 結果 |
|---|---|
| `for f in src/*.js src/art/*.js; do node --check "$f"; done` | **全部通過** |
| `node tools/level_check.js` | **0 error / 1 warning**（既有的拉拉拉出生點提示）|
| `.venv/bin/python tools/engine_test.py` | **118 / 118 PASS** |
| `.venv/bin/python tools/boss_test.py --curve --curve-runs 5` | **CURVE PASS**（5 / 5 達標，但見 R3-P1-02）|
| 60 餘次截圖 + 20 次 playthrough | **`missing sprites: []`、0 console error、0 pageerror** |

## R3-7. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"; PY=.venv/bin/python; Q=shots/agent_qa3/qshot.py

# 非無敵難度量測（20 次；5 個世界可以並行跑）
for w in w1 w2 w3 w4 w5; do
  for i in 1 2 3; do $PY tools/playthrough.py --level $w --ability sword --maxframes 30000; done
  $PY tools/playthrough.py --level $w --ability fire --maxframes 30000
done

# 魔王曲線（兩種玩家模型）
$PY tools/boss_test.py --curve --curve-runs 5
$PY tools/boss_test.py --curve --curve-mid --curve-runs 5

# Round 2 問題回歸
$PY $Q --level w3 --room 0 --x 63 --y 9 --script "press right,down 40" --seq "3:25" --state --out shots/agent_qa3/reg_water_w3r0b.png   # R2-P1-14
$PY $Q --level w4 --room 2 --x 28 --y 9 --steps 90  --out shots/agent_qa3/reg_rollarmor_w4r2.png                                      # R2-P1-15
for s in "w3 4" "w4 4" "w5 5"; do set -- $s; $PY $Q --level $1 --room $2 --steps 200 --out shots/agent_qa3/reg_boss_$1r$2.png; done    # R2-P1-04
$PY $Q --level w1 --room 0 --js "const p=KB.player;p.ability='fire';KB.game.abilityFlash=60;KB.game.toast('取得能力：火焰');" --steps 20 --out shots/agent_qa3/reg_banner_toast.png  # R2-P2-13
$PY $Q --scene title --script "step 60; tap start 2; step 10" --out shots/agent_qa3/reg_title_menu.png                                 # R2-P2-16
$PY $Q --level w4 --room 3 --x 14 --y 9 --steps 40 --out shots/agent_qa3/reg_dark_w4r3.png                                             # R2-P2-17
$PY $Q --level w1 --room 0 --js "KB.game.score=12340;KB.game.kills=17;KB.game.timeAlive=3600;__kb.goto('result')" --steps 400 --out shots/agent_qa3/reg_result.png  # R2-P2-18
$PY $Q --level w5 --room 0 --steps 30 --out shots/agent_qa3/reg_gold_w5r0.png                                                          # P2-11
ARENA="{order:['whispywoods','lololo','kracko','metaknight','dedede'],idx:4,phase:'boss',tomatoes:1,base:12345,beaten:5,ability:'sword',abilityCur:'sword',hp:4,score:9000}"
$PY $Q --scene title --js "KB.setScene(new KB.ArenaResultScene($ARENA,true))" --steps 40 --out shots/agent_qa3/reg_arena_result.png    # 競技場結算斷行
$PY $Q --scene arena --script "step 20; tap right 2; step 10; tap jump 2; step 96" \
       --js2 "console.log('bossIntroMax='+KB.game.bossIntroMax)" --console --out shots/agent_qa3/f14_arena_bossintro.png               # 競技場 60 幀登場

# 全流程（其餘見 shots/agent_qa3/f01~f16_*.png 的檔名）
$PY $Q --scene select --steps 60 --out shots/agent_qa3/z_select_default.png
$PY $Q --level w1 --ability sword --script "step 30; tap start 2; step 10" --out shots/agent_qa3/f07_pause.png
$PY $Q --level w5 --room 5 --ability sword --js "const g=KB.game;g.bossIntroT=0;g.boss.introducing=false;g.boss.hp=Math.round(g.boss.maxHp*0.4);g.boss.maybePhase2();" --seq "3:40" --out shots/agent_qa3/f09_phase2_w5.png
$PY $Q --scene arena --script "step 20; tap right 2; step 10; tap jump 2; step 260" --js2 "KB.arenaExit(KB.game)" --seq "2:45" --out shots/agent_qa3/f13_arena_rest.png
$PY $Q --scene gameover --steps 90 --out shots/agent_qa3/f15_gameover.png
$PY $Q --scene ending --steps 60 --seq "5:220" --out shots/agent_qa3/f16_ending_seq.png

# 放大切圖（確認 1~2px 的重疊）：zoom.py <in> <out> <遊戲座標cx> <cy> <半寬> <半高> <放大倍率>
$PY shots/agent_qa3/zoom.py shots/agent_qa3/f05_select.png shots/agent_qa3/z_select_labels.png 100 115 60 30 4
```

---

# Round 5（qa5 agent）— 20 能力 × 變身特效全面驗收

> 執行者：**qa5** agent　｜　執行時間：**2026-09-12 01:15 ~ 03:10**　｜　截圖目錄：`shots/agent_qa5/`
> 自製工具（都在 `shots/agent_qa5/`）：
> - `mshot.py`：**招式批次驗收**。每招開一個乾淨分頁 → `goto game(w1 r0, --ability)` → 開 hitbox → 在卡比前方 40px 生一隻 waddledee → 跑按鍵腳本 → **每 4 幀連拍 6 張**，每張同時記錄 `state / VFX.list 長度 / hitbox 數 / proj 數 / freezeT / 座標 / HP`，收招後再空跑 **240 幀**檢查殘留，最後印 `missing()` 與 pageerror；每張 PNG 另用 Pillow 數 `#ff00ff` 像素（洋紅方塊自動偵測）。
> - `grid.py`：把每個能力的 6 幀 × 每招拼成一張總表（原尺寸 1:1，不縮放），**20 張總表全部用 Read 工具逐格看過**。
> - `tshot.py` / `tgrid.py`：`KB.player.giveAbility(key)` 之後每 6 幀連拍 10 張（`--lead` 控制要不要和「WORLD n」開場橫幅同框）。
> - `eshot.py`：跳到新敵人座標附近，觀察 120 幀行為 + 吸入 + 吞下，記錄能力是否正確。
> 另外沿用 `shots/agent_qa3/qshot.py`（`--prejs/--js`）拍 UI。
> **本輪 200 餘張截圖全部 `missing sprites: []`、0 pageerror、0 console error**（唯一的洋紅偵測器一次都沒觸發）。
> ⚠️ 本輪與 **fix5** agent 平行進行：`abilities_magic.js` / `abilities_forms.js` / `art/kirby_forms.js` 在 01:29~01:30 被改過，
> 所以 magic 4 種 + forms 4 種 + hammer / blade 的截圖與數據**全部在 fix5 改完之後重跑過一次**（`moves.json` 是重跑後的版本）。

## R5-0. 執行摘要

| 項目 | 結果 |
|---|---|
| 招式逐招驗收（20 能力 / **93 個測試**）| **OK 87 / 有問題 6**；動畫幀 0 洋紅、判定框位置合理、**93 項收招後 `VFX.list` 全部歸 0、hitbox 全部消失**（無殘留、無卡死）|
| Round 5 三個已知 bug | **clone 墊腳無上限 ✅ 已修**（空中連按 6 次 X，y 完全沒上升）、**time 加速衝出地圖 ✅ 已修**（全速跑 150 幀 x 最遠 278 ＜ 房寬 1024）、**forms 缺 `kirby_attack_*` ✅ 已修**（giant/dragon/ghost 全程 `missing sprites: []`）|
| 變身演出（5 代表能力 × 10 連拍 × 2 情境）| 放射光 / 剪影 / ring / 魔法陣 / 白閃 / 橫幅 / 黑邊 / zoom **全部有出現**；與「WORLD n」橫幅**沒有像素重疊**（實測 WORLD 佔 y 25~78、變身橫幅 y 104~129），但會**同時出現兩條橫幅 + 上下黑邊** → R5-P2-10 |
| 關卡實戰 | 25 個房間全掃過：**12 種新敵人 40 隻、22 個能力台座（含 w5 r4 武器庫 4 座）全部在位**，座標與 levels5 表一致；吸入測試 5/5 給對能力（pistolo→gunner、archerwaddle→bow、bolt→mech、drako→dragon、wizzle→mage）|
| 全套測試 | `engine_test 118/118`、`enemy_test 393/393`、`boss_test ALL PASS`、`test_weapons 94/94`、`test_magic 102/102`、`test_forms 139/139`、`audio_check 全部通過`、`level_check 0 error / 1 warning`、`node --check` 全通過 |
| playthrough | **5 世界 sword --godmode 全部 cleared、deaths=0**（w1 4256 / w2 9781 / w3 6258 / w4 10221 / w5 11328 幀）；**12 種新能力 w1 → 11/12 通關**，唯一失敗是 **time**（30000 幀卡在 r0）→ R5-P1-01 |
| 效能（3 個必殺連續觸發後 300 幀）| **120.6 ms / 300 幀＝ 0.40 ms 每幀**（單幀最大 14.3 ms），對照無特效基準 86.5 ms / 0.29 ms；單獨測 gunner 179.9ms、clone 159.5ms、mage 131.0ms，全部遠低於 16.7 ms/幀 預算；**跑完 600 幀後 `VFX.list` 歸 0** |
| Round 5 新問題 | **P0 × 0、P1 × 4、P2 × 9** |

**最值得注意的三句話**：
1. **蓄力必殺的「按住 N 幀」標示全部偏低**：鐵鎚寫 40（實測 70 才出得來）、居合 / 機甲寫 50（實測 70）、光束 / 電擊寫 45（實測 50）、法師 / 重力 / 分身 / 龍化 / 槍手寫 60（實測 66）。玩家照著暫停卡按會以為招式壞掉 —— 這是本輪最影響手感的一項（R5-P1-03）。
2. **幽靈的 noclip 會把人沉出地圖**：`--ability ghost` 開場就是 noclip，按住 ↓ 約 150 幀 → 沉到房間底 → noclip 到期 → 直接墜落死亡（lives 3→2、能力掉光）。普通操作就能觸發（R5-P1-02）。
3. **time 是唯一過不了 w1 的能力**，而且現場堆了 **25 顆 `abilitystar`**（機器人反覆受傷掉能力 / 撿回來）——上一輪的「飛出地圖」已經修好，但卡關還在（R5-P1-01）。

---

## R5-1. 20 能力 × 每招驗收表

> 測試環境一律：`w1 r0`、`--hitbox`、前方 40px 生一隻 waddledee、變身系（giant/dragon/mech/ghost）先跑 110 幀讓變身演出結束。
> 「殘留」欄＝**收招後再空跑 240 幀**的 `VFX.list` 長度與 hitbox 數；全部 0＝沒有殘留效果、沒有卡在 attack 狀態。
> 每一格的視覺（動畫幀、判定框位置、特效有沒有出現）都是打開 `grid_<key>.png` 用 Read 看過的。

| 能力 | 招式（測試腳本 id）| 動畫/精靈 | 判定框 | 特效 | 收招 | 殘留 | 判定 |
|---|---|---|---|---|---|---|---|
| 火焰 fire | X 噴火（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 火焰 fire | ↓+X 火焰衝刺（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 火焰 fire | 空中 X 火焰旋轉（air）| 無洋紅 | hitbox 1 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 劍 sword | X 揮砍（x）| 無洋紅 | hitbox 1 / proj 1 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 劍 sword | 空中 X 迴旋斬（air）| 無洋紅 | hitbox 1 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 劍 sword | ↑+X 上挑斬（ux）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 劍 sword | 滿血 X 劍氣（beamsw）| 無洋紅 | hitbox 1 / proj 0 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 光束 beam | X 甩光束（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 光束 beam | 按住 45 放開 星潮光束（charge）| 無洋紅 | hitbox 0 / proj 1 | vfx 8 | → idle | vfx 0 / hitbox 0 | OK |
| 光束 beam | ↓+X 牽星光環（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 刀刃 cutter | X 迴旋刃（x）| 無洋紅 | hitbox 0 / proj 1 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 刀刃 cutter | ↑+X 上拋刃（ux）| 無洋紅 | hitbox 0 / proj 1 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 刀刃 cutter | ↓+X 下劈（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 刀刃 cutter | 空中 X 下劈（air）| 無洋紅 | hitbox 1 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 電擊 spark | X 放電（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 電擊 spark | 放電中 ←→ 帶電慢走（walk）| 無洋紅 | hitbox 1 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 電擊 spark | 蓄力 45 放開 電擊波（charge）| 無洋紅 | hitbox 1 / proj 0 | vfx 12 | → idle | vfx 0 / hitbox 0 | OK |
| 石頭 stone | X 變石（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → stone | vfx 0 / hitbox 1 | OK |
| 石頭 stone | 落地衝擊（land）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → stone | vfx 0 / hitbox 1 | OK（落地衝擊在拍攝視窗前結束，改由 `shots/agent_vfx/ab_stone_land.png` 佐證；石頭狀態 240 幀後仍是 stone＝正常，需再按 X） |
| 石頭 stone | 再按 X 解除（off）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 冰凍 ice | X 噴冰（x）| 無洋紅 | hitbox 1 / proj 1 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 冰凍 ice | ↓+X 冰塊飛踢（dx）| 無洋紅 | hitbox 0 / proj 1 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 冰凍 ice | 空中 X 冰晶散射（air）| 無洋紅 | hitbox 0 / proj 5 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 鐵鎚 hammer | X 掄鎚（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 鐵鎚 hammer | 按住 40 放開 大迴旋（charge）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | **問題**：按住 45 幀放開沒有任何反應（招式表寫「按住 40 幀」）→ R5-P1-03 |
| 鐵鎚 hammer | 空中 X 落地震（air）| 無洋紅 | hitbox 2 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 鐵鎚 hammer | ↓+X 巨鎚敲擊（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 鐵鎚 hammer | 按住 95 放開 大迴旋（charge2）| 無洋紅 | hitbox 1 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK（按住 95 幀放開 → 大迴旋前進 60px、有判定框） |
| 槍手 gunner | X 按住 雙槍連射（x）| 無洋紅 | hitbox 0 / proj 4 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 槍手 gunner | ↓+X 蓄力霰彈（dx）| 無洋紅 | hitbox 0 / proj 3 | vfx 7 | → idle | vfx 0 / hitbox 0 | OK |
| 槍手 gunner | 空中 X 俯衝掃射（air）| 無洋紅 | hitbox 0 / proj 1 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 槍手 gunner | ↑+X 對空三連（ux）| 無洋紅 | hitbox 0 / proj 3 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 槍手 gunner | 蓄力放開 子彈時間（ult）| 無洋紅 | hitbox 0 / proj 11 | vfx 42 | → idle | vfx 0 / hitbox 0 | OK |
| 忍者 ninja | X 手裡劍三連（x）| 無洋紅 | hitbox 0 / proj 2 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 忍者 ninja | ↓+X 替身瞬移（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 7 | → idle | vfx 0 / hitbox 0 | OK |
| 忍者 ninja | 空中 X 飛踢（air）| 無洋紅 | hitbox 1 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 忍者 ninja | 貼牆＋跳 壁跳（wall）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | **未重現**：w1 r0 沒有可貼的牆（見 R5-P2-12），壁跳由 `test_weapons` 覆蓋 |
| 忍者 ninja | 蓄力放開 影分身斬（ult）| 無洋紅 | hitbox 0 / proj 0 | vfx 8 | → idle | vfx 0 / hitbox 0 | OK |
| 居合 blade | X 三段連斬（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 居合 blade | 按住 X 居合架式（hold）| 無洋紅 | hitbox 0 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 居合 blade | 蓄力放開 居合一閃（ult）| 無洋紅 | hitbox 0 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | **問題**：按住 56 幀放開沒有反應（招式表寫蓄滿 50 幀）→ R5-P1-03 |
| 居合 blade | 空中 X 落下斬（air）| 無洋紅 | hitbox 2 / proj 0 | vfx 6 | → idle | vfx 0 / hitbox 0 | OK |
| 居合 blade | ↑+X 上撩斬（ux）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 居合 blade | 按住 100 放開 居合一閃（ult2）| 無洋紅 | hitbox 1 / proj 0 | vfx 10 | → idle | vfx 0 / hitbox 0 | OK（按住 100 幀放開 → 居合一閃，vfx 10、判定框 1） |
| 弓 bow | X 射箭（x）| 無洋紅 | hitbox 0 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 弓 bow | 蓄力 40 貫穿箭（c40）| 無洋紅 | hitbox 0 / proj 1 | vfx 7 | → idle | vfx 0 / hitbox 0 | OK |
| 弓 bow | 蓄力 80 流星箭（c80）| 無洋紅 | hitbox 0 / proj 1 | vfx 12 | → idle | vfx 0 / hitbox 0 | OK |
| 弓 bow | 空中 X 箭雨（air）| 無洋紅 | hitbox 0 / proj 5 | vfx 6 | → idle | vfx 0 / hitbox 0 | OK |
| 弓 bow | ↓+X 陷阱箭（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 元素法師 mage | X 火球（x）| 無洋紅 | hitbox 1 / proj 1 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 元素法師 mage | ↑+X 冰牆（ux）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 元素法師 mage | ↓+X 雷擊召喚（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 元素法師 mage | 空中 X 風刃三連（air）| 無洋紅 | hitbox 0 / proj 3 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 元素法師 mage | 按住 60 放開 元素風暴（ult）| 無洋紅 | hitbox 1 / proj 0 | vfx 10 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | X 時間停止（x）| 無洋紅 | hitbox 0 / proj 0 | vfx 6 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | 時停中 X 近身連拳（punch）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | ↓+X 慢動作（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | ↑+X 加速（ux）| 無洋紅 | hitbox 0 / proj 0 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | 空中 X 回溯（air）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 時間 time | ↑+X 加速後全速右跑（R5 已知 bug）（haste2）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK（加速後全速右跑 150 幀，x 最遠 278＜房寬 1024，**沒有衝出地圖**＝ Round 5 已知 bug 2 已修） |
| 重力 gravity | X 黑洞（x）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 重力 gravity | ↓+X 反重力（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 重力 gravity | 空中 X 隕石三連（air）| 無洋紅 | hitbox 1 / proj 3 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 重力 gravity | ↑+X 浮空（ux）| 無洋紅 | hitbox 0 / proj 0 | vfx 4 | → fall | vfx 0 / hitbox 0 | OK |
| 重力 gravity | 按住 60 放開 奇點（ult）| 無洋紅 | hitbox 1 / proj 0 | vfx 8 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | X 全員吐星（x）| 無洋紅 | hitbox 0 / proj 2 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | ↓+X 交換位置（dx）| 無洋紅 | hitbox 0 / proj 1 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | 空中 X 分身墊腳（air）| 無洋紅 | hitbox 0 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | 按住 60 放開 百裂分身（ult）| 無洋紅 | hitbox 1 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | 被動 分身自動射擊（passive）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 分身 clone | 空中連按 X 墊腳上限（R5 已知 bug）（airspam）| 無洋紅 | hitbox 0 / proj 3 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK（空中連按 6 次 X，y 完全沒有上升＝ Round 5 已知 bug 1「墊腳無上限」已修） |
| 巨大化 giant | X 巨腳踩踏（x）| 無洋紅 | hitbox 0 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK（招式本身正常；本次被 waddledee 碰到 → 變身即刻解除，見 R5-P2-13） |
| 巨大化 giant | ↓+X 巨人衝撞（dx）| 無洋紅 | hitbox 1 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | OK |
| 巨大化 giant | 空中 X 屁股墜落（air）| 無洋紅 | hitbox 2 / proj 0 | vfx 4 | → idle | vfx 0 / hitbox 0 | OK |
| 巨大化 giant | ↑+X 大口吸（ux）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → full | vfx 0 / hitbox 0 | OK |
| 巨大化 giant | 限時 900 幀縮小（timer）| 無洋紅 | hitbox 0 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 龍化 dragon | 按住跳 飛行（fly）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 龍化 dragon | X 龍息（x）| 無洋紅 | hitbox 1 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 龍化 dragon | ↓+X 尾擊（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 龍化 dragon | 空中 X 俯衝（air）| 無洋紅 | hitbox 2 / proj 0 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 龍化 dragon | X 蓄滿放開 龍炎彈（ult）| 無洋紅 | hitbox 0 / proj 1 | vfx 5 | → idle | vfx 0 / hitbox 0 | OK |
| 機甲 mech | X 火箭拳（x）| 無洋紅 | hitbox 0 / proj 1 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 機甲 mech | ↑+X 追蹤飛彈（ux）| 無洋紅 | hitbox 1 / proj 2 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 機甲 mech | 空中 X 噴射墜踩（air）| 無洋紅 | hitbox 2 / proj 0 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK |
| 機甲 mech | 按住跳 噴射跳（jet）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 機甲 mech | X 蓄滿放開 全彈發射（ult）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | **問題**：按住 56 幀放開沒有反應（招式表寫蓄滿 50 幀）→ R5-P1-03 |
| 機甲 mech | 按住 100 放開 全彈發射（ult2）| 無洋紅 | hitbox 0 / proj 3 | vfx 3 | → idle | vfx 0 / hitbox 0 | OK（按住 100 幀放開 → 全彈發射，5 顆飛彈 + 黑邊） |
| 幽靈 ghost | X 穿牆開關（x）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 幽靈 ghost | ↓+X 附身（dx）| 無洋紅 | hitbox 0 / proj 0 | vfx 1 | → idle | vfx 0 / hitbox 0 | **問題**：40px 外 → textPop「沒有目標」；貼近到 16px 可附身但 <8 幀就解除，且 noclip 沉出地圖 → R5-P1-02 / 04 |
| 幽靈 ghost | 空中 X 幽靈哀嚎（air）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 幽靈 ghost | ↑+X 隱身（ux）| 無洋紅 | hitbox 1 / proj 0 | vfx 2 | → idle | vfx 0 / hitbox 0 | OK |
| 幽靈 ghost | 穿牆中 ↑↓ 飄浮（float）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | OK |
| 幽靈 ghost | ↓+X 附身（單次觸發）（possess2）| 無洋紅 | hitbox 0 / proj 0 | vfx 0 | → idle | vfx 0 / hitbox 0 | **問題**：附身後角色沉到房間底部（y 183）→ R5-P1-02 |

合計 93 項：OK 87 / 有問題 6

### R5-1a. 蓄力門檻實測（`shots/agent_qa5/charge.json`）

> 方法：`press attack N` → `release` → 之後 40 幀內取 `VFX.list / proj / hitbox / 位移` 的峰值，峰值明顯跳升＝必殺成立。

| 能力 | 招式表寫的 | 40 | 45 | 50 | 56 | 60 | 66 | 70 | 80~100 | 實測最低成立 |
|---|---|---|---|---|---|---|---|---|---|---|
| beam 星潮光束 | 按住 45 幀放開 | ✗ | ✗ | ✅ | – | ✅ | – | – | – | **50** |
| spark 電擊波 | 按住 45 幀放開 | ✗ | ✗ | ✅ | – | ✅ | – | – | – | **50** |
| hammer 大迴旋 | 按住 40 幀放開 | ✗ | ✗ | ✗ | – | ✗ | – | ✅ | ✅ | **70**（差 30 幀）|
| blade 居合一閃 | 蓄滿 50 幀 | ✗ | – | ✗ | – | ✗ | – | ✅ | ✅ | **70**（差 20 幀）|
| mech 全彈發射 | 蓄滿 50 幀 | ✗ | – | ✗ | ✗ | ✗ | – | ✅ | ✅ | **70**（差 20 幀）|
| gunner 子彈時間 | 蓄力放開 | – | – | ✗ | – | ✗ | ✅ | ✅ | ✅ | **66** |
| mage 元素風暴 | 按住 60 幀放開 | – | – | ✗ | – | ✗ | ✅ | ✅ | ✅ | **66** |
| gravity 奇點 | 按住 60 幀放開 | – | – | ✗ | – | 部分 | ✅ | ✅ | ✅ | **66** |
| clone 百裂分身 | 按住 60 幀放開 | – | – | ✗ | – | ✗ | ✅ | ✅ | ✅ | **66** |
| dragon 龍炎彈 | 蓄滿 60 幀 | – | – | ✗ | – | ✗ | ✅ | ✅ | ✅ | **66** |
| bow 流星箭 | 蓄力 80 | 貫穿箭 | – | 貫穿箭 | – | – | – | – | ✅(80) | **80 ✅符合** |
| ninja 影分身斬 | 蓄力放開 | – | – | ✅ | – | ✅ | ✅ | ✅ | ✅ | **≤50 ✅** |

---

## R5-2. 變身演出（sword / gunner / mage / giant / ghost）

截圖：`tf_<key>.png`（開場橫幅已消失，lead 150 幀）、`tfb_<key>.png`（**開場橫幅還在**，lead 8 幀），各 10 張／每 6 幀。

| 檢查項 | 結果 |
|---|---|
| 放射光線（12 條）| ✅ `tf_sword_00/01`、`tf_giant_00/01` 都看得到以卡比為中心的白色放射線 |
| 白色剪影閃 | ✅ 停格期間卡比被白色剪影蓋住（`tf_mage_00`）|
| ring ×3 + burst + 魔法陣 | ✅ `tf_sword_02~04`（綠色 ring + 旋轉魔法陣）、`tf_mage_02~04`（紫色）|
| 白閃 flash | ✅ `tf_*_01`（整個世界層變白）|
| 名稱橫幅（中文 16px + 點陣英文）| ✅「劍 / SWORD」「槍手 / GUNNER」「元素法師 / MAGE」「巨大化 / GIANT」「幽靈 / GHOST」全部置中、不溢出、可讀 |
| 上下黑邊 letterbox | ✅ 22px，`ENTER：暫停／說明` 提示畫在黑邊上仍可讀 |
| zoom punch | ✅（`tf_giant_03` 世界層明顯被放大）|
| 收尾 | ✅ 5 個能力 200 幀後 `VFX.list === 0`、`state` 回 idle、`form` 正確保留（giant/ghost 仍是變身中）|
| 停格 | 只有 `def.transform` 的 4 種（giant/dragon/mech/ghost）有 `freezeT 10`，sword/gunner/mage 沒有 → 與 forms 文件一致 |
| **與「WORLD n」橫幅重疊** | **沒有像素重疊**：實測 WORLD 橫幅佔 y **25~78**、變身橫幅佔 y **104~129**（`z_banner_overlap.png` / `z_banner_overlap2.png` 是逐列掃描後的放大圖）。但畫面上會**同時出現「黑邊 + WORLD 橫幅 + 變身橫幅」三條帶狀元素**，上半畫面幾乎被佔滿 → 列為 **R5-P2-10**（嚴重度 P2，不是 P1）|

**額外發現**（`sp/double_get_a~c.png`）：現在**所有能力**（含 Round 1 的 8 種）取得時都會播完整演出 —— `player.js` `giveAbility` 的註解寫著
「總控：所有能力都播變身演出；只有整體變身（`def.transform`）才加 10 幀停格」，所以這是刻意的。
但**連續取得兩個能力時，舊橫幅不會被立刻換掉**：`giveAbility('fire')` → 18 幀後 `giveAbility('mech')`，畫面上還是「火焰 / FIRE」橫幅而 HUD 已經是 MECH，約 10~20 幀後才換成「機甲 / MECH」→ **R5-P2-14**。

---

## R5-3. 關卡實戰（w1~w5）

### 3a. 全房間掃描（25 個房間，`KB.game.entities` 逐房列舉）

| 敵人 | 能力 | 實際出現（世界 / 房 / 磁磚）| 隻數 |
|---|---|---|---|
| pistolo | gunner | w1r0(46,9)、w4r0(28,9)、w5r0(88,9) | 3 |
| mimi | clone | w1r0(20,9)、w4r0(73,9)、w5r1(27,9) | 3 |
| kagedee | ninja | w1r1(14,9)、w4r3(25,9)、w5r3(44,9) | 3 |
| wizzle | mage | w1r2(22,9)、w4r1(28,18)、w5r2(59,9) | 3 |
| ronin | blade | w2r0(38,9)、w2r2(60,9)、w4r2(79,9)、w5r0(62,9) | 4 |
| archerwaddle | bow | w2r0(16,7)、w4r2(89,6)、w5r0(51,7) | 3 |
| tiktok | time | w2r0(79,9)、w2r3(30,9)、w4r3(29,9)、w5r1(44,9) | 4 |
| gravitron | gravity | w3r0(30,5)、w3r3(33,5)、w4r3(36,5)、w5r2(35,5) | 4 |
| bigbloom | giant | w3r0(35,8)、w4r3(44,8)、w5r0(38,8) | 3 |
| bolt | mech | w3r1(50,9)、w4r0(84,9)、w5r3(35,9)、w5r4(23,21) | 4 |
| drako | dragon | w3r0(33,3)、w4r0(65,6)、w5r2(66,4) | 3 |
| boodee | ghost | w3r1(57,7)、w4r1(17,9)、w5r1(60,5) | 3 |
| **合計** | | **與 levels5 的放置表 100% 一致** | **40** |

能力台座 22 座（含 w5 r4 **武器庫**：blade(6,21) / gunner(8,21) / mage(10,21) / giant(12,21) 一字排開）全部在位，
`essence` 的 `ui_ability_<key>_mini` 圖示都畫得出來（無洋紅）。

### 3b. 行為 / 吸入測試（`shots/agent_qa5/lv/*.png`，每隻 2 張：觀察 120 幀 + 吸入）

| 敵人 | 觀察（120 幀後）| 吸入 → 能力 |
|---|---|---|
| pistolo (w1r0) | 站在 (736,144) 平地、hp 2、`walk`，不卡牆 | ✅ 吸進嘴 → 吞下得 **gunner** |
| archerwaddle (w2r0) | 站在拱窗高台 (256,112)、hp 2 | ✅ → **bow** |
| bolt (w3r1) | 長廊平地 (800,142)、hp 3 | ✅ → **mech** |
| drako (w4r0) | 空中 `fly`（1011,116.7）、正弦飛行、hp 3 | ✅ → **dragon** |
| wizzle (w4r1) | 塔內平台 (429,286)、hp 2 | ✅ → **mage** |
| gravitron (w3r0) | 空中 (451,84)、`onGround=false` 正常浮空、hp 3 | 該次先吸到旁邊的 drako（3 隻同框）|
| bigbloom (w3r0) | (531,134) 走動中（vx -0.44）、hp 4 | 該次距離不足未吸到 |
| tiktok (w2r0) | (1295,144) 走動（vx 0.25）、hp 3 | 該次先吸到 waddledee |
| mimi (w1r0) | (320,145) 站地、hp 2 | 該次先吸到 waddledee |
| ronin / kagedee / boodee | 房間內確實存在（見 3a），但 QA 腳本的落點離牠們 >160px，未進觀察窗 | – |

> 沒吸到的幾隻是 QA 腳本落點的問題（同框有別的敵人先被吸走），**不是放置或敵人的問題**；
> 12 種敵人的「會攻擊 / 被吸入給對應能力」在 `test_weapons 94/94`、`test_magic 102/102`、`test_forms 139/139` 內都有逐項測試且全過。
> 25 個房間全部 `missing sprites: []`、0 pageerror。

---

## R5-4. UI 驗收

| 畫面 | 截圖 | 結果 |
|---|---|---|
| 能力圖鑑 1/3・2/3・3/3（全解鎖）| `ui_gallery_all_0/8/16.png` | ✅ 標題列「能力圖鑑 ／ 發現進度 20/20 ／ 17/20」、縮圖每頁 8 個、頁碼 3/3、5 列招式表 + 2 行說明都塞得下 |
| 能力圖鑑（剪影 / 未發現）| `ui_gallery_lock_0/8/16.png`、`ui_gallery_lock_silhouette.png` | ✅ 全黑剪影、`？？？`、縮圖變「?」方塊、「吸入 ??? 就能獲得」；發現進度正確顯示 4/20 |
| 競技場 1/3・2/3・3/3 | `ui_arena_0/9/18.png` | ⚠️ 分頁 / 縮圖 / 頁碼都對，但**說明第 3 行被面板下緣切一半**（gunner、dragon 都是）→ R5-P2-05 |
| 暫停能力卡（giant 5 招 + 風味文字＝6 列）| `ui_pause_giant.png` | ✅ 6 列全部畫得下、不壓到選單 |
| 暫停能力卡（mage 5 招）| `ui_pause_mage.png` | ⚠️ 5 招正常，但**標題下面留了一條空白帶**（magic 4 種沒有 `flavour`）→ R5-P2-07 |
| 暫停能力卡（hammer，回歸）| `ui_pause_hammer.png` | ✅ 4 招 + 風味文字，與 Round 4 一致 |
| HUD 4 字中文名 | `mv/mage_x_00.png`、`grid_gravity.png` | ✅「元素法師」12px 塞進 53px、`GRAVITY` 7 字元不溢出、圖示都有 |
| 選關「能力 n/20」| `ui_select.png` | ✅ 右下「能力 20/20」，BEST / ★ 沒有被擠掉 |
| 設定「特效強度」| `ui_settings.png` | ✅ 第 5 列「特效強度 高」，←→ 可切；實測 `KB.VFX.level` high/mid/low → burst 粒子 **20 / 14 / 8**、low 正確關閉 zoom 與 afterimage |

---

## R5-5. 全套測試與 playthrough

| 指令 | 結果 |
|---|---|
| `tools/engine_test.py` | **118/118 PASS** |
| `tools/enemy_test.py` | **393/393 PASS** |
| `tools/boss_test.py` | **ALL PASS**（5 魔王 idle/intro/fight/phase2/mid 全綠，13s）|
| `tools/test_weapons.py` | **94/94 PASS** |
| `tools/test_magic.py` | **102/102 PASS** |
| `tools/test_forms.py` | **139/139 PASS** |
| `node tools/audio_check.js` | **全部通過**（27 首曲子、47 個新 sfx 的表都列得出來）|
| `node tools/level_check.js` | **0 error / 1 warning**（既有的「拉拉拉預設出生點」）|
| `node --check src/*.js src/art/*.js` | 全通過 |
| `playthrough --level w1~w5 --ability sword --godmode` | **5/5 cleared、deaths 0、missing []**（4256 / 9781 / 6258 / 10221 / 11328 幀）|
| `playthrough --level w1 --ability <12 種新能力> --godmode` | **11/12 cleared**：gunner 4446・ninja 4239・blade 5104・bow 5380・mage 5176・gravity 5851・clone 6607・giant 6986・dragon 5358・mech 11533・ghost 6845；**time ✗（30000 幀只走到 r0）** |

## R5-6. 效能（`shots/agent_qa5/sp/perf_triple.png`）

> 方法：在頁面內用 `performance.now()` 量 `__kb.step(1)`（含 update + render）×300 的牆鐘時間。

| 情境 | 300 幀總時間 | 每幀平均 | 單幀最大 | 之後殘留 |
|---|---|---|---|---|
| 基準（無特效）| 86.5 ms | 0.29 ms | 5.3 ms | VFX 0 |
| gunner 子彈時間 | 179.9 ms | 0.60 ms | 13.6 ms | VFX 0 |
| mage 元素風暴 | 131.0 ms | 0.44 ms | 14.3 ms | VFX 0 |
| clone 百裂分身 | 159.5 ms | 0.53 ms | 23.2 ms | VFX 0 |
| **三個必殺連續觸發**（gunner→10 幀→mage→10 幀→clone）| **120.6 ms** | **0.40 ms** | 14.3 ms | 300 幀後 VFX 0、再 600 幀後仍 0、實體數回到 44 |

結論：**16.7 ms/幀 的預算只用掉 2~4%**，三招疊在一起也沒有掉幀風險；沒有任何效果洩漏。

---

## R5-7. Round 5 問題清單（P0 × 0、P1 × 4、P2 × 10）

| # | 嚴重度 | 位置 | 現象 | 重現指令 | 截圖 | 建議負責 |
|---|---|---|---|---|---|---|
| **R5-P1-01** | P1 | `src/abilities_magic.js` time | **time 是 12 種新能力裡唯一過不了 w1 的**：`--godmode` 跑滿 30000 幀只走到 r0。stuck 傾印＝`player={'x':1340.7,'y':100.6,'state':'float','onGround':False}`（門在 x=1456），現場堆著 **25 顆 `abilitystar`**（同一點 (1285,130)）＋ `magic_hist` / `magic_stop` ticker。上一輪的「加速衝出地圖」已修（見 R5-1 的 `time/haste2`），但**卡關還在**。 | `.venv/bin/python tools/playthrough.py --level w1 --ability time --godmode --maxframes 12000` | stuck 傾印（見 PROGRESS qa5）| **magic** |
| **R5-P1-02** | P1 | `src/abilities_forms.js` ghost + `src/player.js` `clampToRoom` | **幽靈會沉出地圖並摔死**。`--ability ghost` 開場 `form.noclip` 就是 true（240 幀），此時**按住 ↓ 約 150 幀**：卡比穿過地板 → 沉到 y=183（房高 192）→ noclip 到期（noclip=false）→ 人在地形外 → 直接墜落 `state=dead`、y=285 → 重生時 **lives 3→2、ability=null**。文件寫 noclip「不會掉出地圖」，實際上 `clampToRoom()` 只夾住房間框，noclip 結束後沒有把人推回可站立的地方。 | `.venv/bin/python shots/agent_qa5/tshot.py` 不夠，用：goto `game{level:w1,room:0,ability:'ghost'}` → step 120 → `__kb.press({down:true})` → step 150（qa5 用 `sp5.py`，輸出見 PROGRESS）| `sp/ghost_sink_3.png`、`sp/ghost_sink_7.png`、`grid_ghost.png`（possess2 列，卡比在左下角）| **forms** |
| **R5-P1-03** | P1 | `src/abilities.js` / `abilities_weapons.js` / `abilities_forms.js` / `abilities_magic.js` 的 `moves` 文案（或蓄力計時起點）| **10 個蓄力必殺的「按住 N 幀」全部標低**（見 R5-1a）：鐵鎚寫 40 → 實測 **70**；居合 / 機甲寫 50 → **70**；光束 / 電擊寫 45 → **50**；法師 / 重力 / 分身 / 龍化 / 槍手 60 → **66**。照著暫停卡按住 45 幀放開鐵鎚，**畫面上完全沒有反應**（`state` 全程 idle、hitbox 0、VFX 0），玩家只會以為招式壞掉。推測是蓄力計數從「攻擊動畫開始/結束」才起算，而不是按下那一幀。 | `.venv/bin/python shots/agent_qa5/mshot.py --only hammer`（`hammer/charge` 45 幀＝無反應、`hammer/charge2` 95 幀＝正常）；完整門檻表 `shots/agent_qa5/charge.json` | `grid_hammer.png`（charge 列全空 vs charge2 列有大迴旋）、`grid_blade.png`、`grid_mech.png` | **weapons**（blade/gunner/bow）＋ **forms**（mech/dragon）＋ **magic**（mage/gravity/clone）＋ **abilities**（hammer/beam/spark）|
| **R5-P1-04** | P1 | `src/abilities_forms.js` ghost 附身 | **附身只維持 <8 幀就自動解除**（規格：300 幀或再按 ↓+X）。實測把 waddledee 放在 16px 處、按 1 幀 ↓+X：`possessed=waddledee`、`form.hidden=true` 成立，但 8 幀後就 `possessed=null`、`hidden=false`，卡比被丟到敵人位置。另外**附身要靠到 26px 內，但那個距離站著就會先吃接觸傷害**（40px 外按 ↓+X 只會跳「沒有目標」）——不先開隱身 / 穿牆幾乎用不出來。 | 見 `sp2.py`/`sp3.py`（PROGRESS 有輸出）；`shots/agent_qa5/mshot.py --only ghost` 的 `ghost/dx` 列 | `sp/ghost_poss2_0~5.png`、`sp/ghost_poss1f_*.png`、`grid_ghost.png` | **forms** |
| **R5-P2-05** | P2 | `src/arena.js` 選能力面板 | **競技場說明第 3 行被面板下緣切掉一半**：gunner「…把彈幕鋪滿整個房間。」的「間。」、dragon「…張口就是一條火河。」的「一條火河。」都只剩上半截。20 個能力裡凡是說明降級成 12px 3 行的都會中。 | `.venv/bin/python shots/agent_qa3/qshot.py --scene arena --js "KB.scene.i=9" --steps 20 --out shots/agent_qa5/ui_arena_9.png` | `ui_arena_9.png`、`ui_arena_18.png` | **ui** |
| **R5-P2-06** | P2 | `src/menu.js` 圖鑑 + `src/arena.js` 預覽框 | **龍化 / 機甲 / 幽靈的大預覽只畫普通粉紅卡比**（這三種是整體換精靈、沒有 `hat_*`），玩家在圖鑑裡完全看不出變身長怎樣；旁邊 24×16 的小圖示反而是對的。giant 因為有 `hat_giant` 所以正常。 | `.venv/bin/python shots/agent_qa3/qshot.py --scene title --js "KB.scene.menu=new KB.TitleMenu(KB.scene); KB.scene.menu.sub=new KB.AbilityGallery(); KB.scene.menu.sub.i=17" --steps 30 --out shots/agent_qa5/ui_gallery_form_17.png` | `z_form_preview.png`（龍化/機甲/幽靈三連拼圖）、`ui_gallery_form_17/18/19.png` | **ui**（預覽改吃 `kirby_dragon_idle` 等）＋ **forms**（或補 hat）|
| **R5-P2-07** | P2 | `src/abilities_magic.js` | **magic 4 種（mage / time / gravity / clone）完全沒有 `flavour`**，暫停能力卡標題與分隔線之間留一條空白帶（weapons / forms 都有寫）。ui5 的介面需求第 3 點要求 `flavour` 給 2 行陣列。 | `.venv/bin/python shots/agent_qa3/qshot.py --scene game --level w1 --ability mage --script "step 40; tap start 2; step 20" --out shots/agent_qa5/ui_pause_mage.png` | `ui_pause_mage.png`（對照 `ui_pause_giant.png` / `ui_pause_hammer.png`）| **magic**（補文案）|
| **R5-P2-08** | P2 | `src/abilities_weapons.js`（及其他必殺）＋ `src/vfx.js` `textPop` | **必殺技名用 `textPop`（世界座標）而不是 `VFX.banner`（畫面置中）**，靠近房間左右邊界時會被畫面切掉：gunner 的「BULLET TIME」實測缺了開頭的「BU」（卡比在 x=49、鏡頭已經夾在 0）。ninja「影分身斬」、bow「流星箭」、mage「元素風暴」也都貼著左緣。 | `.venv/bin/python shots/agent_qa5/mshot.py --only gunner` → `mv/gunner_ult_00.png` | `z_gunner_ult0.png`（放大圖，可見「ULLET TIME」）| **weapons / magic / forms**（改呼叫 `KB.VFX.banner`）或 **vfx**（`textPop` 夾邊）|
| **R5-P2-09** | P2 | `src/vfx.js` `worldTint` / `tint` | **世界染色會把「WORLD n」開場橫幅一起染掉**：時停（灰藍）、慢動作（紫）、子彈時間（灰）、元素風暴（紅）時，開場橫幅整條變色甚至看不清字。`game.js` 的繪製順序是 `drawLevelBanner` → `VFX.postWorld`，所以世界層染色蓋在橫幅上。 | `.venv/bin/python shots/agent_qa5/mshot.py --only time` → `grid_time.png` 第 1、3 列 | `grid_time.png`、`grid_mage.png`（ult 列）、`grid_spark.png` | **vfx**（postWorld 染色改畫在橫幅之前／或排除橫幅區）|
| **R5-P2-10** | P2 | `src/vfx.js` `transform` + `src/ui.js` `drawLevelBanner` | **開場 90 幀內取得能力 → 畫面上同時有「上下黑邊 + WORLD n 橫幅 + 變身橫幅」三層**。逐列掃描確認**沒有像素重疊**（WORLD 橫幅 y 25~78、變身橫幅 y 104~129），但上半畫面被佔滿、視覺很擠（forms agent 回報的「疊在一起」實際是這個）。 | `.venv/bin/python shots/agent_qa5/tshot.py --lead 8 --tag tfb` | **`tfb_giant.png`**、`z_banner_overlap.png`、`z_banner_overlap2.png` | **ui**（兩者互斥：橫幅播放中就延後變身橫幅）|
| **R5-P2-11** | P2 | `src/abilities_forms.js` giant 的 `moves` 文案 | 「大口吸：範圍 ×2・可吞中魔王」在**圖鑑與暫停卡都被截成「大口吸：範圍 x2・可…」**（ui5 的招式名欄位約 10 字）。「可吞中魔王」正好是這招最重要的資訊。 | `ui_gallery_all_16.png`、`ui_pause_giant.png` | 同左 | **forms**（縮成「大口吸（可吞中魔王）」之類）|
| **R5-P2-12** | P2 | `src/levels.js` | **忍者壁跳在 5 個世界幾乎沒有地方可用**：掃描全部 25 個房間找「連續 ≥5 格實心、側面 4 格淨空、旁邊有站得住的地板」的垂直牆面，**只找到 w3 r1 的 x=63 一處**。壁跳是 ninja 的 5 招之一，但玩家在主線裡幾乎不會遇到能用的牆。 | `sp5.py` 的全房間掃描（輸出見 PROGRESS）| `sp/ninja_wall_slide.png` | **levels**（w2 螺旋塔 / w5 城牆補幾面 5 格以上的直牆）|
| **R5-P2-13** | P2 | `src/abilities_forms.js` giant | **巨大化被碰一下就結束**：`hurt(1)` → 立刻 `clearForm()` + 掉能力（hp 6→5、體型復原）。900 幀的限時與「最後 120 幀閃爍提示」在實戰裡很難走到（w1 r0 站著不動 240 幀就被 waddledee 撞掉）。mech 有 `armor 1 / hp 6`（實測 6 下才碎，第 6 下正確 `breakArmor`），giant / dragon / ghost 都是一下就沒。 | goto `game{level:w1,room:0,ability:'giant'}` → step 120 → `KB.player.hurt(1)` → step 40（`sp/giant_hurt.png`）| `sp/giant_hurt.png`、`grid_giant.png`（x 列第 5~6 格 HUD 變 NORMAL）| **forms**（要不要給 1~2 點裝甲，或受傷只縮小不掉能力）|
| **R5-P2-14** | P2 | `src/vfx.js` `transform` / `banner` | **連續取得兩個能力時舊橫幅不會被換掉**：`giveAbility('fire')` → 18 幀後 `giveAbility('mech')`，畫面橫幅還是「火焰 / FIRE」而 HUD 已經是 MECH，要再等 10~20 幀才變成「機甲 / MECH」。台座密集處（w5 r4 武器庫 4 座並排）很容易踩到。 | `sp/double_get_a~c.png`（qa5 `special.py`）| `sp/double_get_b.png`（橫幅 FIRE / HUD MECH）| **vfx**（新的 transform 先清掉舊 banner）|

### R5-7a. 觀察（不列入問題）

- **石頭的落地衝擊**在本輪的拍攝視窗（跳 → 變石 → 30 幀）之前就結束了，沿用 vfx agent 的 `shots/agent_vfx/ab_stone_land.png` 佐證；石頭狀態跑滿 240 幀仍是 `state=stone` + 1 個常駐 hitbox **是正常的**（要再按一次 X 解除，`stone/off` 列已驗證）。
- **`--ability <key>` 的截圖路徑不會播變身橫幅**（走 `opts.ability` 不經 `giveAbility`），只有真正吸入 / 台座 / `giveAbility()` 才有；做演出 QA 時要用 `tshot.py` 這種呼叫 `giveAbility` 的方式。
- **hitbox debug 疊色**：`--hitbox` 時玩家框是半透明綠色，巨大化（28×30）會讓卡比看起來「整隻變綠」，**不是精靈破圖**（關掉 hitbox 後是正常粉紅，`z_giantprobe_0.png`）。
- **gravity 的 ↑+X** 招式表寫「浮空 240 幀」，但畫面上的 textPop 寫「重力翻轉」，文案不一致（magic 已知把天花板行走降級成浮空）。
- **圖鑑剪影**的輪廓看得出頭上有東西（帽子形狀），要完全不暴露的話得畫成純圓形剪影。
- **bow 的流星箭**在第 5~6 張幾乎整個世界層變白（flash + worldTint 疊加），雖然是必殺演出，但比其他必殺亮很多，可以考慮把 alpha 調低一點。

---

## R5-8. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python

# 20 能力 × 93 招連拍（每招 6 張 + 240 幀殘留檢查）
$PY shots/agent_qa5/mshot.py                      # 全部（約 8 分鐘）
$PY shots/agent_qa5/mshot.py --only hammer --only ghost
$PY shots/agent_qa5/grid.py                       # 拼成 grid_<key>.png，用 Read 逐格看

# 變身演出（--lead 8 = 和 WORLD n 橫幅同框）
$PY shots/agent_qa5/tshot.py --lead 150 --tag tf
$PY shots/agent_qa5/tshot.py --lead 8   --tag tfb
$PY shots/agent_qa5/tgrid.py tfb sword gunner mage giant ghost

# 關卡實戰（新敵人行為 + 吸入）
$PY shots/agent_qa5/eshot.py

# UI（沿用 qa3 的 qshot.py）
$PY shots/agent_qa3/qshot.py --scene title --js "KB.scene.menu=new KB.TitleMenu(KB.scene); KB.scene.menu.sub=new KB.AbilityGallery(); KB.scene.menu.sub.i=16;" --steps 30 --out shots/agent_qa5/ui_gallery_all_16.png
$PY shots/agent_qa3/qshot.py --scene title --prejs "KB.save.seen={fire:true,sword:true,gunner:true,giant:true};" --js "KB.UI.unlockAll=false; KB.DEBUG=false; KB.scene.menu=new KB.TitleMenu(KB.scene); KB.scene.menu.sub=new KB.AbilityGallery(); KB.scene.menu.sub.i=9;" --steps 30 --out shots/agent_qa5/ui_gallery_lock_silhouette.png
$PY shots/agent_qa3/qshot.py --scene arena --js "KB.scene.i=9;" --steps 20 --out shots/agent_qa5/ui_arena_9.png
$PY shots/agent_qa3/qshot.py --scene title --js "KB.scene.menu=new KB.TitleMenu(KB.scene); KB.scene.menu.sub=new KB.SettingsMenu(); KB.scene.menu.sub.sel=4;" --steps 20 --out shots/agent_qa5/ui_settings.png
$PY shots/agent_qa3/qshot.py --scene game --level w1 --ability giant --script "step 40; tap start 2; step 20" --out shots/agent_qa5/ui_pause_giant.png
$PY shots/agent_qa3/qshot.py --scene select --steps 40 --out shots/agent_qa5/ui_select.png

# 全套測試 / playthrough / 效能
for t in engine_test enemy_test boss_test test_weapons test_magic test_forms; do $PY tools/$t.py; done
node tools/level_check.js ; node tools/audio_check.js
for w in w1 w2 w3 w4 w5; do $PY tools/playthrough.py --level $w --ability sword --godmode --maxframes 45000; done
for a in gunner ninja blade bow mage time gravity clone giant dragon mech ghost; do $PY tools/playthrough.py --level w1 --ability $a --godmode; done
```

### 截圖索引（`shots/agent_qa5/`）
- `grid_<20 個能力>.png` —— 每招 6 幀總表（本輪主證據）
- `mv/<key>_<move>_00..05.png` + `_post.png` —— 原始逐幀（93 招 × 7 張）
- `tf_*.png` / `tfb_*.png` / `tf/` —— 變身演出（一般 / 與 WORLD 橫幅同框）
- `lv/*.png` —— 5 世界新敵人實戰（觀察 + 吸入）
- `ui_*.png` —— 圖鑑 ×7、競技場 ×3、暫停卡 ×3、選關、設定
- `sp/*.png` —— 專項：`ghost_sink_*`、`ghost_poss*`、`giant_hurt`、`mech_armor2`、`double_get_*`、`perf_triple`、`ninja_wall_*`、`time_stars`
- `z_*.png` —— 放大切圖（`z_gunner_ult0`＝被切掉的 BULLET TIME、`z_banner_overlap*`＝兩條橫幅的實際位置、`z_form_preview`＝三個變身的圖鑑預覽、`z_giantprobe_0`＝關掉 hitbox 後的巨大化）
- `moves.json` / `charge.json` / `levels.json` —— 全部量測數據（每幀 state / VFX / hitbox / 蓄力門檻 / 敵人位置）
