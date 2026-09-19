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

---

# Round 6 驗收（qa6，2026-09-12）

驗收對象：**混合能力 / AI 夥伴 / 元素反應 / 第六世界 W6 / 進度系統** 五大系統。
基準版本：起跑 `a8cea2f`（Round 6 五個 agent 的成果）→ 收尾覆測 **`88a20cf`**（含 fix6 的 `4f76049` / `adb4e96` / `88a20cf`）。
截圖全部在 `shots/agent_qa6/`（工具：`mixshot.py` / `helpershot.py` / `elemshot.py` / `w6shot.py` / `progshot.py` / `grid.py`，全部自製，不動 src）。

## R6-0. 結論

| 系統 | 結果 | 說明 |
|---|---|---|
| 混合能力（mix） | **OK，1 個 P1** | 12 組 ×3 招 36 招全部有判定 / 投射物、240 幀後乾淨回 idle；12 組受傷掉星＝主成分 A 全對；12 組 w1 playthrough 全 cleared。**台座重複觸發會把混合能力降級**（R6-P1-01）|
| 夥伴（helper） | **OK** | 4 種能力生成 / 跟隨過坑 / 攻擊 / 受傷 / 吸回全通；HUD 夥伴臉 + 4 格血條可見。原本的 R6-P1-02（吸回後掉能力）**fix6 已修，覆測通過** |
| 元素反應（elements） | **OK** | 火燒草蔓延 3 格 / 焦黑 / 30 秒恢復、木箱、冰面站立與滑行、電擊水域（自傷 1）、弱點 ×2 / 抗性 ×0.5 textPop、燃燒鏈 4 隻、麻痺 60 幀、威斯比吃火 / 克拉寇吃冰各 4→8 全部實測通過。原本的 R6-P1-03（中魔王免疫元素）**fix6 已修，覆測通過**。剩「關卡裡玩得到的地方太少」（R6-P2-03）|
| 第六世界（world6） | **OK，1 個 P1** | 7 房磁磚 / 背景 / 站位 / 暗房光源全部正常、3 顆大星星地形可達、傳送星 ride 全程、鏡之間鎖門→解鎖、暗影卡比 8 招 + 二階段 + 擊敗演出 + 結局全部正常。**暗星雨 toast 疊字**（R6-P1-04）|
| 進度系統（progression） | **OK** | Lv 門檻 3/8、dmgMul 1/1.25/1.5、holdMul 0.8（fix6 已接）、LEVEL UP 橫幅、HUD Lv 星、COMBO 1~12 與顏色、BREAK、Rank S(11/11) / C(0/11) 印章、成就 toast、圖鑑成就 4 頁、選關 6 節點皆正常。剩 COMBO 壓橫幅（R6-P2-01）|

**問題統計**：P1 **2 件**（皆未修）、P2 **6 件**、觀察 5 條。
本輪由 qa6 找出、fix6 已修並覆測通過的：**2 件 P1**（R6-P1-02 夥伴吸回掉能力、R6-P1-03 中魔王元素免疫）。

## R6-1. 問題列表

| 編號 | 等級 | 位置 | 現象 | 重現 | 截圖 | 建議負責人 |
|---|---|---|---|---|---|---|
| **R6-P1-01** | P1 | `src/items.js` `KB.ITEMS.essence.update` | **站在能力台座上，混合成功 30 幀後被降級回成分 B**。持 fire 走到 `essence(sword)` 上 → `flamesword`（正確），但台座 `cool` 30 幀一到又觸發一次，`p.ability === this.ability` 只擋「完全相同」，`flamesword !== 'sword'` → 再 `giveAbility('sword')`，HUD 從 PYREDGE 炎劍變回 SWORD 劍，而且每次都重播一輪變身演出。玩家「踩上去拿混合」之後只要沒有立刻走開就會失去混合能力，而能力台座正是 mix agent 指定的主要取得途徑。 | `w2 r2 (30,9) sword 台座`；逐幀：持 fire 走上台座 → 第 6 幀 flamesword → 第 10 次取樣（約 +40 幀）變 sword | `gmixflow.png`（第 4 格 PYREDGE→第 8 格 SWORD）、`mixflow_06.png` / `mixflow_10.png` | **levels-bosses / fix6（items.js）**：`essence.update` 增加「目前能力是混合能力且本座的能力是它的成分之一 → return」 |
| **R6-P1-04** | P1 | `src/bosses_w6.js`（toast 文字）＋ `src/game.js`（toast 繪製 y 相同） | **暗星雨的提示 toast 和分身 toast 疊在同一行 → 變成無法辨識的亂碼**：畫面上出現「暗暗星雨沙站進進光環裡身！」。「站進光環裡」是二階段必殺**唯一的閃避提示**，疊掉之後玩家不知道要站安全區。world6 agent 自己也記了這條（「正常流程不會同時出現」），但實測二階段 `split → starrain` 的間隔本來就在 toast 的存活時間內，正常戰鬥會踩到。 | `shots/agent_world6/bshot.py --move starrain --hp 30`；或 `banner.py`：`setState('split')` → 20 幀 → `setState('starrain')` | **`goverlap.png`（第 2 列，4 張都是亂碼）**、`gw6_boss2.png`（第 2 列） | **world6 / ui**（toast 佇列改成排隊或往下堆，同 fix6 對成就 toast 的作法）|
| **R6-P2-01** | P2 | `src/progression.js` `drawHUD`（COMBO）＋ `src/ui.js` `drawLevelBanner` | **COMBO 計數壓在開場「WORLD n」橫幅上**，把關卡編號的數字整個蓋掉（例：只看得到「WORLD」，「1」不見）。fix6 已經把**成就 toast** 排到橫幅下方（良好），但 COMBO 沒有跟著避讓。進關就打死敵人（w1 r0 出生點旁就有 waddledee）很容易撞到。 | `banner.py`：goto w1 r0 → 10 幀 → 設 `KB.PROG.combo=7` → 連拍 5 張 | **`goverlap.png`（第 1 列 5 張）** | **progression**（橫幅播放中把 COMBO 往下移，或橫幅結束後才畫）|
| **R6-P2-02** | P2 | `src/arena.js:55` | **競技場抽不到暗影卡比**：`POOL = ['whispywoods','lololo','kracko','metaknight']` + `LAST = 'dedede'`，只有 5 隻，W6 的魔王沒有進競技場；面板文字仍寫「連戰 5 名魔王」。而選能力頁已經正確變成 **33 個（32 能力＋普通）/ 4 頁**，混合能力都選得到。 | `__kb.goto('arena')`；`flow/10_arena.png`、`11_arena_mix.png` | `gflow.png`（第 3 列） | **ui-flow / arena**：把 `shadowkirby` 加進 `LAST`（建議 dedede → shadowkirby 收尾，並以「通關 w6」解鎖），面板字改「連戰 6 名魔王」|
| **R6-P2-03** | P2 | `src/levels.js`（ELEM6 區塊）| **元素機關在關卡裡能玩到的地方太少**。全 6 世界掃描「連續可燃 deco」：只有 **w1 r0 一段 6 格**（fix6 新增）是可以看到「蔓延」的；w1 r1~r4 / w2 / w3 / w6 的可燃 deco **最長連續都只有 1 格**（點了就只燒 1 格、直接變焦黑，看不出蔓延機制）。木箱 `W` 也只有 **w1 r0 (67~69,6) 3 個 + w6 r0 (74~75,9) 2 個**，w2~w5 一個都沒有。 | `w1grass.py` 的全關掃描（輸出附在下方 R6-4） | `gelem1.png` / `gelem3.png` | **levels-bosses**：w3 r0/r1、w6 r0/r3 各補一段 4~6 格連續 `g`；w2 / w5 各放一處 `W` |
| **R6-P2-04** | P2 | `src/bosses_w6.js` / `src/art/world6.js` | **暗影卡比在 space 主題背景裡對比偏低**：黑紫色身體 + 深紫星雲背景，1 倍解析度下幾乎只看得到兩隻白眼睛和帽子；放大 3 倍才看得出輪廓（黑描邊是有的）。一階段瞬移 / 隱形招式時特別難追。 | `bshot.py --move slash`；`zoom_boss_idle.png` 是 3 倍裁切 | `gw6_boss1a.png`、**`zoom_boss_idle.png`** | **world6**（加一圈更亮的紫色外光暈，或讓白眼睛 / 輪廓線再亮一階）|
| **R6-P2-05** | P2 | `src/helper.js` | **變身系能力交給夥伴等於廢掉**：giant 夥伴 8 次取樣（192 幀）只放出過 2 個判定框，前方的 waddledee 一直沒死；sword / mage 夥伴都能穩定擊殺。helper agent 自己有記「`setForm` 只是存起來、夥伴不會真的變形」，但玩家不會知道，UI 也沒有提示。 | `helpershot.py`（`helper.json` 的 `giant_attack`：`en` 全程 10 沒有下降）| `ghelp_giant.png`（第 3~4 列）、`helper.json` | **helper**（變身系能力按長按 SELECT 時拒絕交出並跳 toast，或給夥伴一個退化版招式）|
| **R6-P2-06** | P2 | `src/ui.js` `EndingScene` | 結局標題「影子消散，星之彼端重新亮起」的右端和背景的月亮重疊，黃字壓在月亮上可讀性下降（不影響閱讀，但看起來像沒排版）。 | `__kb.goto('ending')` → 200 幀 | `gw6_ending.png` | **ui**（標題往左縮 8px 或把月亮移到左上）|

### 本輪已修（qa6 提出 → fix6 修正 → qa6 在 `88a20cf` 覆測通過）

| 編號 | 等級 | 現象 | 修正 | 覆測 |
|---|---|---|---|---|
| **R6-P1-02** | P1 | **長按 SELECT 吸回夥伴後，只要還按著 SELECT，一放開就把剛拿回來的能力丟成能力星**。逐幀：f185（按滿 45 幀）夥伴變 ReturnStar → f190 星星飛到卡比、`ability='sword'`、`selectHoldT` 歸 0 → f201 放開，此時累積只有 15 幀 < 45 → 走短按路徑 `dropAbility(true)`。夥伴離卡比越近越容易中（近距離 100% 重現）。 | `player.js` 加 `selectLock`：一次按住只結算一次，必須放開 SELECT 才會重新計數 | `recall_probe3.py`：mage / sword 最終 `pab` 都保留；`ghelper_selectbug.png` 是修正前的證據 |
| **R6-P1-03** | P1 | **所有中魔王（bonkers / mrfrosty / rollarmor / mirrordee）完全吃不到屬性弱點 / 抗性 / 燃燒 / 麻痺 / 冰凍**：`enemies.js` 的 `MiniBoss.hurt` 覆寫掉 `Enemy.hurt`，沒有呼叫 `KB.ELEM.applyHit` / `KB.ELEM.onHit`。實測 mrfrosty（表上 weak fire ×2 / resist ice ×0.5）被 fire / ice / spark / sword 打都是固定 4 點，連「弱點!」字都不跳；mirrordee 的 `weak spark` 也一樣無效。 | `MiniBoss.hurt` 補上 `KB.ELEM.applyHit` + `KB.ELEM.onHit` | `elem4.py`：mrfrosty fire 4 / ice 1 / spark 2 / sword 2（弱點 ×2、抗性 ×0.5 皆生效，burn 180 / para 60 也掛上）；rollarmor・mirrordee spark 4；`elem/pop_miniboss_nofx.png` 是修正前的證據 |

## R6-2. 各系統驗收明細

### R6-2a. 混合能力（12 組 × 3 招）
- `mixshot.py` 對 12 個 mixkey 各拍 X / 方向鍵 / 按住 50 幀放開三招、每招 5 張（每 5 幀），再跑 240 幀檢查殘留。
  **36 招全部**：招式期間有判定框或投射物、240 幀後 `state=idle` / `ability` 不變 / `KB.VFX.list` 為 0 / `MISSING SPRITES` 空 / 無 pageerror。
  總表：`gmix_flamesword.png` … `gmix_thundermech.png`（12 張，逐張 Read 檢查過帽子 / 武器握把 / HUD 名稱）。
- **HUD 英文名**全部 ≤7 字沒有被截（PYREDGE / CRYEDGE / VOLTIAI / PYROGUN / CRYOGUN / VOLTBOW / MAGMAUL / GEOMAUL / UMBRA / ASTRAL / CRYWYRM / VOLTMEK）。
- **台座混合流程**：持 fire → 走上 `essence(sword)` → `MIX!` + 放射光 + 魔法陣 + HUD 換成 PYREDGE 炎劍（`gmixflow.png`）。※ 之後的降級問題見 R6-P1-01。
- **受傷掉星＝主成分 A**：12 組全對（`mixdrop.py`，`fire+sword→flamesword` 掉 `fire`、`stone+hammer→stonehammer` 掉 `stone`…）。
- **12 組 w1 playthrough --godmode**：全部 `cleared=True deaths=0 missing=[]`（3661~10737 幀）。

### R6-2b. 夥伴（sword / gunner / mage / giant）
- `helpershot.py` 五個情境各連拍：`ghelp_sword.png` / `ghelp_gunner.png` / `ghelp_mage.png` / `ghelp_giant.png`。
- 生成：長按 SELECT 45 幀 → 「夥伴登場！」toast + `HELPER!` textPop + 雙層 ring + 能力色粒子，HUD 右側出現**小夥伴臉 + 能力 mini 圖示 + 4 格血條**（4 種能力都看得到）。
- 跟隨過坑：卡比往右跑，夥伴在 24~40px 的遲滯區間跟隨，遇到 w1 r0 的坑會切漂浮參數飛過去（`*_follow_02/03`）。
- 攻擊：sword / mage 夥伴各自擊殺前方 waddledee（`+200` / 敵人數下降）；giant 見 R6-P2-05。
- 受傷：HUD 血條 4→3→2，夥伴身上閃爍；打到 0 變回能力星掉在原地（卡比撿得回）。
- 吸回：長按 SELECT → ReturnStar 飛向卡比 → 變身橫幅「劍 / SWORD」＋ HUD 換回該能力（20 種能力逐一驗過 `KB.Helper.recall` 都正確）。

### R6-2c. 元素反應
| 項目 | 實測 | 截圖 |
|---|---|---|
| 火燒草：點燃 → 每 8 幀往兩側各 1 格 → 共 ±3 格 | 點 `12,9` → `9,9`~`15,9` 共 7 格 | `gelem1.png` 第 1 列 |
| 焦黑 1800 幀後恢復 | `decoChar` 1810 幀後清空、草回來 | `gelem1.png` 第 2 列第 1 格 |
| w1 r0 實戰（fix6 新增 72~77 連續草）| 點 `74,9` → 6 格全燒 → 全部焦黑 | `gelem3.png` 第 1 列 |
| 木箱 `W` | 火燒 → `tile_woodbox_burn` → 磁磚變 `.`；w1 r0 (67,6)、w6 r0 (74,9) 都成立 | `gelem1.png` 第 2 列、`gelem3.png` 第 2 列 |
| 冰面站立 / 滑行 | 卡比落在結冰水面 `onGround=true state=idle`；按住右 vx 0.97，放開 12 幀後仍有 0.6（會滑）| `elem/ice_stand_ok.png`、`gelem2.png` |
| 電擊水域 | w3 r0：`shockT=17` / 20 格；測試房：33 格、水中敵人清空、**水裡的卡比自傷 1（hp 6→5）** | `gelem3.png` 第 3 列 |
| 弱點 / 抗性 textPop | drako（weak ice / resist fire）基礎 4：冰 → **8**（黃字「弱點!」）、火 → **2**（灰字「抗性」）| `gelem2.png` 第 1 列 |
| 燃燒鏈 | 點燃 1 隻 waddledee → 14 幀內共 3 隻帶 burn、84 幀後全滅（起火者→A→B→C 上限 4）| `elem/chain_1.png` |
| 麻痺 | 電擊命中 → `para=59`，期間不動 | `elem/para_0.png` |
| 魔王弱點 | 威斯比吃火 40→32（4×2）、克拉寇吃冰 40→32（4×2）| `elem/boss_whispy_fire.png`、`boss_kracko_ice.png` |

### R6-2d. W6「星之彼端」
- **7 房各 2 張**：`gw6_rooms.png`。磁磚拼接（頂 / 填充 / 斜坡 / 平台）無縫、多層視差背景（星雲 + 帶光環的紫行星 + 流星）在垂直房 r1 也沒有露底、敵人站位合理、**r2 暗房**只看得見身邊約 40px 且傳送環 `r` 是光源。`MISSING SPRITES` 全空。
- **3 顆大星星可達性**（用 `--x --y` 到附近取地形）：
  - ★a0 r0 (56,1)：正下方 y=2 有 `=====`（x 54~58）單向平台，漂浮上去即可 → **合理**。
  - ★a1 r2 (63,9)：`#########` 天花板（x 59~67）+ 左右 `X` 硬磚牆（59 / 67），底下是地面 → 必須用 r2 (30,9) 的 hammer 台座砸開 → **合理且有引導**。
  - ★a2 r6 (11,3)：正下方 y=4 有 `======`（x 9~14）→ **合理**；秘密房入口是 r3 (82,9) 的門。
- **傳送星**：r3 第 1 段實測 `state` 走 `walk → ride ×6 → walk`，路徑 (14,8)→(20,5)→(26,5)→(36,9) 全程在畫面內，落地正常；r3 共 3 段（14 / 46 / 74）＋ r0 1 段。
- **鏡之間鎖門**：`gatekeeper (52,9)` 讓門 `locked=true`；打倒 mirrordee 後 `locked=false`（`w6/lock_0_locked.png` → `lock_2_unlocked.png`）。
- **暗影卡比一階段 8 招**連拍：`gw6_boss1a.png`（slash / fireball / shuriken / thunder）、`gw6_boss1b.png`（blackhole / stomp / warp / inhale）。`SHADOW_COPY['sword'] = ['slash','shuriken','stomp']`，thunder 會在玩家頭上預警後落雷（實測把卡比的劍打掉）。
- **二階段**：`split` → 2 隻 `shadowclone` + 本體半透明 `untouchable=true`；`starrain` → letterbox + worldTint + 地面安全區光環 + 光柱 + 隕石雨（`gw6_boss2.png` 第 1~2 列）。
- **擊敗演出 → 結局**：白閃 → 影子碎片上飄 → 擴散 ring → +12000 → 出現金色出口門；`KB.session.shadowDefeated=true`；`levelClear()` → `ResultScene` → **`EndingScene`**（`gw6_ending.png`：「影子消散，星之彼端重新亮起 / 追到最後才發現，那個影子一直是你自己走過來的路」＋ 能力發現 32/32・成就 n/20・大星星 n/**18**・FINAL SCORE・THE END）。

### R6-2e. 進度系統
| 項目 | 實測 |
|---|---|
| 能力等級 | xp 1,2 → Lv1；**xp 3 → Lv2**（dmgMul 1.25）；**xp 8 → Lv3**（dmgMul 1.5、**holdMul 0.8**，fix6 已接上蓄力縮短）|
| HUD Lv 星 | 能力圖示正上方 Lv2 兩顆 / Lv3 三顆（`prog/lv_get4.png` / `lv_get8.png`）|
| LEVEL UP | 白閃 + ring + 橫幅「LEVEL UP! / FIRE Lv2」「FIRE Lv3」（`prog/lv_banner3.png` / `lv_banner8.png`）|
| COMBO | 1~12 連續累加；<5 白 / ≥5 黃 / ≥10 紅，擊殺瞬間放大（`prog/combo_5/10/12.png`）|
| BREAK | 受傷立刻歸 0 + 紅色「BREAK」textPop（`prog/combo_break.png`）|
| Rank 印章 | S：COMBO x20(3) + NOHIT OK(3) + TIME 1s(3) + STAR 3/3(2) = **11/11 → S**；C：0 + 0 + TIME 300s(0) + 0 = **0/11 → C**（`gprog2.png` 第 1~2 列，金色 S / 灰色 C 印章砸下）|
| 成就 toast | 右上獎盃卡片，fix6 改成排隊，**不再壓到開場橫幅**（`goverlap.png` 第 1 列）|
| 圖鑑成就頁 | SELECT 切「能力 / 成就」，成就 **4 頁 × 6 條 = 20 條**，未解鎖灰字+鎖頭 / 已解鎖金字+CLEAR（`gprog2.png` 第 3 列）|
| 選關 6 節點 | 有存檔：6 個節點 + 星空島「星之彼端」+ CLEAR 旗 + ★x/3 + BEST；無存檔：仍 6 節點、W1「出發！」（`gprog2.png` 第 4 列）|
| 圖鑑能力頁 | 32/32，混合能力有專屬圖示 / 描述 / 3 招表 / Lv 條（`prog/gallery_ability_mix.png`）|

## R6-3. 測試與效能

```
test_mix          241/241 PASS      test_helper        67/67 PASS
test_elements      96/96  PASS      test_progression   68/68 PASS
test_weapons      105/105 PASS      test_magic        119/119 PASS
test_forms        153/153 PASS      test_charge        19/19  PASS
engine_test       118/118 PASS      enemy_test        393/393 PASS
node tools/level_check.js  → 0 error / 1 warning（既有的 w2 拉拉拉出生點提示）
node tools/audio_check.js  → 全部通過（31 首，含 space / space2 / shadowboss / shadowboss2）
tools/boss_test.py --runs 3 → ALL PASS（whispywoods / lololo / kracko / metaknight / dedede / shadowkirby）
playthrough w1~w6 --ability sword --godmode → 全部 cleared=True deaths=0 missing=[]
   w1 5161 / w2 6005 / w3 6261 / w4 6606 / w5 8253 / w6 7003 幀，bossDamage 全 100%
playthrough w1 × 12 混合能力 --godmode → 全部 cleared=True deaths=0 missing=[]
```
> **kracko 註記**：`boss_test` 的 fight 判定被 fix6 從「3/3 全勝」放寬成「≥2/3」並標 `(2/3 flaky)`。
> qa6 在 `a8cea2f` 上實測 kracko 確實是 **2/3**（樣本 #2 機器人被打掉劍後 `escapes=3204`、死 4 次、魔王還剩 36/40）。
> 這是機器人模型對 RNG 序列偏移敏感造成的樣本雜訊（elements / world6 兩位 agent 各自獨立驗證過），不是平衡退步，**但放寬判定等於以後 kracko 真的變難也不會被抓到**，建議改成「每隻魔王各自開新 session」而不是放寬門檻。

**效能（三系統同時運作）**：w1 r0，夥伴在場 + 6 格草全部燃燒中 + 8 隻敵人連鎖燃燒 + flamesword 蓄力必殺（火龍捲）發動後，`step(1)+render()` 連跑 **300 幀**：

| 情境 | 300 幀總時間 | 平均 | p50 | p95 | 最大單幀 |
|---|---|---|---|---|---|
| 基準（w1 r0 什麼都不做）| 241.9 ms | 0.81 ms | — | — | — |
| **夥伴 + 燃燒中草 + 混合必殺** | **301.0 ms** | **1.00 ms** | 0.50 ms | 4.8 ms | **7.3 ms** |
| W6 二階段暗星雨 | 560.8 ms | 1.87 ms | — | — | — |

最大單幀 7.3 ms、平均 1.0 ms，都在 16.67 ms 的預算內（約 2 倍以上餘裕），**沒有效能問題**。截圖 `perf_triple.png` / `perf_w6boss.png`。

## R6-4. 附錄：全關卡「可燃 deco 連續長度」掃描（R6-P2-03 的依據）

| 關卡 | 主題可燃字元 | 可燃格數 | 最長連續 |
|---|---|---|---|
| w1 r0 | `gfbm` | 19 | **6**（fix6 新增的 72~77）|
| w1 r1~r4 | `gfbm` | 4~7 | 1 |
| w2 r0~r5 | `b` | 1~2 | 1 |
| w3 r0~r1 | `g` | 4~5 | 1 |
| w3 r2~r5 | `g` | 0 | 0 |
| w4 / w5 | （無可燃）| — | — |
| w6 r0~r6 | `gf` | 0~2 | 1 |

木箱 `W` 目前只有 **w1 r0 (67,6)(68,6)(69,6)** 與 **w6 r0 (74,9)(75,9)** 兩處。

## R6-5. 觀察（不列入問題）

- `KB.ELEM.of({type:'fire'})` 回 `none`，要用 `kind`；`KB.hitbox({type:'fire'})` 產生的實體會把 `type` 存成 `kind`，所以**只有真的建出 Hitbox 才認得元素**。寫元素相關測試 / 工具時直接丟字面物件會誤判。
- `__kb.goto('game', {x, y})` 的 x / y 是**磁磚座標**不是像素（`loadRoom(idx, sx, sy)` 會乘 T），踩過一次坑。
- `__kb.step(n)` 內部只在最後 `render()` 一次，所以拿它量效能會只算到 update；要量真實幀時間得自己 `for(i) {step(1); render();}`。
- 暗星雨的安全區（地面光環 + 半透明光柱）在畫面上看得出來，光柱偏淡但可辨識；toast 修好之後應該就夠用。
- 結算 Rank 的 TIME 讀的是 `game.timeAlive`（不是 `game.frame` / `game.time`），寫測試時要注意。

## R6-6. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python

# 12 混合能力 × 3 招（36 招連拍 + 240 幀殘留檢查）→ 再拼成 gmix_<key>.png
$PY shots/agent_qa6/mixshot.py
$PY shots/agent_qa6/mixshot.py --only flamesword --only thundermech

# 夥伴 4 種能力 × 5 情境
$PY shots/agent_qa6/helpershot.py

# 元素反應（注入測試房 eltest）
$PY shots/agent_qa6/elemshot.py

# W6 7 房 ×2 + 大星星 + 傳送星 + 鎖門
$PY shots/agent_qa6/w6shot.py
$PY shots/agent_world6/bshot.py --move starrain --hp 30 --seq 6:22 --out shots/agent_qa6/w6b/p2_starrain.png

# 進度系統
$PY shots/agent_qa6/progshot.py

# 拼圖（任意張數）
$PY shots/agent_qa6/grid.py --out shots/agent_qa6/x.png --cols 5 --labels "第一列|第二列" a.png b.png ...

# 測試 / playthrough / 效能
for t in test_mix test_helper test_elements test_progression test_weapons test_magic test_forms test_charge engine_test enemy_test; do $PY tools/$t.py; done
node tools/level_check.js ; node tools/audio_check.js ; $PY tools/boss_test.py --runs 3
for w in w1 w2 w3 w4 w5 w6; do $PY tools/playthrough.py --level $w --ability sword --godmode --maxframes 45000; done
for a in flamesword frostsword thunderblade flamegun frostgun thunderbow flamehammer stonehammer shadowblade starmage frostdragon thundermech; do $PY tools/playthrough.py --level w1 --ability $a --godmode; done
```

### 截圖索引（`shots/agent_qa6/`）
- `gmix_<12 個 mixkey>.png` —— 混合能力 3 招 ×5 幀總表（本輪主證據）／原始幀在 `mix/`
- `gmixflow.png` —— 台座混合流程（含 R6-P1-01 的降級）
- `ghelp_{sword,gunner,mage,giant}.png` —— 夥伴 5 情境／原始幀在 `helper/`；`ghelper_selectbug.png` = R6-P1-02 修正前證據
- `gelem1.png` / `gelem2.png` / `gelem3.png` —— 元素反應（測試房 + w1/w3/w6 實戰）／原始幀在 `elem/`
- `gw6_rooms.png`、`gw6_boss1a.png`、`gw6_boss1b.png`、`gw6_boss2.png`、`gw6_ending.png`、`zoom_boss_idle.png` —— W6／原始幀在 `w6/`、`w6b/`
- `gprog1.png` / `gprog2.png` —— 進度系統／原始幀在 `prog/`
- `gflow.png` —— 標題 → 選關 → W6 → 魔王 → 競技場 全流程／原始幀在 `flow/`
- `goverlap.png` —— R6-P1-04（暗星雨疊字）與 R6-P2-01（COMBO 壓橫幅）
- `perf_triple.png` / `perf_w6boss.png` —— 效能情境
- `mix.json` / `helper.json` —— 逐幀量測數據

---

# Round 7 驗收（qa7 · 2026-09-12）

> 範圍：mix2（第二批 12 組混合）、awaken（Lv4 覺醒 + 20 招）、helper2（雙夥伴 / 指令 / 合體技）、
> extra（Extra 疊加層 / 魔王變體 / 成績板 / 第 7 節點）、world7（夢幻迴廊 + 夢魘之核三階段 + 真結局）。
> 所有截圖在 `shots/agent_qa7/`，**每一張都用 Read 工具實際看過**。src 全程唯讀。

## R7-0. 結論

| 系統 | 結果 | 備註 |
|---|---|---|
| **mix2**（12 組 × 3 招） | **OK** | 36 招全部出得來、招後回 idle 保有能力、VFX 歸 0、0 missing / 0 pageerror；`ABILITY_KEYS 44` / `MIX.table 24`；HUD 英文名全部 ≤ 7 字；暫停卡 12 張 + 圖鑑 6 頁（44/44）中文可讀 |
| **awaken**（Lv4 + 20 招） | **OK（但嚴重過強）** | 機制全對：Lv4 四星 / 量表 0→100 / 未 Lv4 與量表未滿都不觸發 / 20 招全部命中並秒殺雜兵 / 覺醒中無敵 300 幀 / 結束歸 0。**但一次覺醒可以打死一整隻魔王 → R7-P1-01** |
| **helper2**（雙夥伴） | **OK（1 個顯示問題）** | 雙夥伴 / 三指令 / 合體技 / 走門淡入淡出 / 死亡歸隊全部正確；**兩人的指令文字疊成亂碼 → R7-P1-03** |
| **extra** | **OK** | w1~w7 **全 7 世界 36 個非魔王房**都有疊加層、6 魔王開場二階段 + 新招、成績板 8 頁、第 7 節點鎖 / 解鎖、EXTRA 紅牌、w4 / w5 燒草全部正確 |
| **world7** | **OK** | 6 房 / 3 大星星 / 夢之開關順序 / 六王試煉鎖門 / 夢魘之核三形態 11 招 / 兩次形態轉換 / 擊敗 + TRUE END（音樂 key 確認為 `trueend`）全部通過 |
| **全流程** | **OK** | 標題 → 成績板 → 選關（7 節點）→ W7 → 魔王 → 真結局，13 個畫面 0 error / 0 missing |
| **測試** | **1 支紅** | `test_progression 63/68`（5 條過時斷言）→ R7-P1-02；其餘 12 支測試 + 3 支檢查工具全綠 |
| **效能** | **OK（大量餘裕）** | 最重情境（雙夥伴 + 覺醒招 + 燃燒草 + 10 敵人）300 幀 313 ms ＝ **1.04 ms/幀**，只用掉 16.7 ms 預算的 6% |

問題統計：**P0 × 0、P1 × 3、P2 × 8**。沒有任何一項阻擋出貨，但 **R7-P1-01（覺醒一招秒魔王）會直接毀掉 Round 7 的難度設計**，建議優先處理。

## R7-1. 問題列表

| 編號 | 等級 | 位置 | 現象 | 重現 | 截圖 / 數據 | 建議負責人 |
|---|---|---|---|---|---|---|
| **R7-P1-01** | P1 | `src/awaken.js` `A.moves`（20 招的 `n × dmg`） | **一次覺醒 ≒ 一隻魔王**。迪迪迪大王（60 HP、W5 王）20 個樣本中 **18 個成功發動、其中 17 個一次覺醒直接打死（100% 血量）**，剩下 gunner 55% / time 70%；玩家在這 300 幀還是無敵的。真最終魔王更誇張：**夢魘之核三個形態各被「一次覺醒」整條清空**（P1 40→換形態、P2 40→換形態、P3 50→死亡），等於 3 次覺醒通關真最終戰。而量表**只要 8 次連擊就能充滿**（實測 0→6→14→24→36→50→66→84→100），Lv4 之後幾乎是常駐技。awaken agent 自述「總傷害 42~80、對魔王偏強」，實測比自述還強一階。 | `awkdmg3.py` / `awkdmg4.py`（見 R7-7）：`goto w5 r5` → `abilityXp=15` → `AWAKEN.gauge=MAX` → `press jump,attack 3` → step 320 → 讀 `boss.hp` | `awkdmg` 20 行輸出（報告 R7-2c）、`gawk_moves1~4.png` | **awaken**：把 20 招的段數 × 傷害砍到「對魔王 ≈ 25~35%」（例如整體 ×0.4），或對 `type==='boss'` 另乘一個 `bossMul`；判定與演出完全不用動 |
| **R7-P1-02** | P1 | `tools/test_progression.py:44,304,305,307,312` | **`test_progression` 因為 w7 上線而紅：63/68**。5 條斷言寫死「6 關 / 6 個節點 / 5 段路徑 / 第 6 點主題 space」，w7 進 `KB.LEVELS` 之後全部不成立（實測 `n=7, paths=6, labels=7, over=0, out=0, theme='dream'`）。**選關畫面本身是對的**（7 標籤 0 重疊 0 出界、游標正確停在可進入的最後一關 index 5），純粹是測試過時 —— 但它會讓「收工前跑全部測試」永遠是紅的，掩蓋真正的退步。與 mix2 回報過的 `test_mix.py` 是同一類問題（那兩條已經被改成不等式、現在 245/245 全過）。 | `.venv/bin/python tools/test_progression.py` | `/tmp/.../tests/test_progression.log` | **總控 / progression**：把 `== 6` / `== 5` / `theme === 'space'` 改成「注入的假 w6 是第 6 關」的相對寫法，或直接改成 `>=` |
| **R7-P1-03** | P1 | `src/helper.js:819`（`setMode` 的 `V('textPop', h.cx, h.y - 18, m.hud, …)`） | **兩個夥伴的指令文字疊成亂碼**。`setMode` 對**每一個**夥伴各發一次 textPop，而兩人只差 14px、文字寬 40+px 且置中 → 疊出「FOLLOWOWW」「STAYAY」「ASSAUULT」。每次按 ↑+SELECT 都 100% 重現（雙夥伴是 helper2 的主打功能，所以是常態畫面）。頭上的模式小圖示有做「第 2 人往上 5px」，但 textPop 沒有跟著錯開。 | `t3_helper.py`：生兩個夥伴 → `press up,select 3` → step 16 → 截圖 | **`ghelp_modes.png`（第 1 列 3 張）**、`helper/croppop_mode_assault.png`（4 倍放大） | **helper2**：只對 `list[0]` 發 textPop（模式是兩人共用的），或第 2 人的 y 再 −10px |
| **R7-P2-01** | P2 | `src/ui.js` `EndingScene`（真結局版面） | **TRUE END 版面「FINAL SCORE 0030320」與「ALL CLEAR」兩行重疊**，字互相穿插。真結局比一般結局多了 2 行文案 + 2 行收集度，把 FINAL SCORE 往下推進了 ALL CLEAR 的位置。 | `__kb.goto('ending')` 前設 `KB.session.trueEnd=true` → step 590 | **`extra/zoom_trueend_overlap.png`（3 倍裁切）**、`gextra_trueend.png`（最後一格）、`gflow.png`（最後一格） | **ui-menu / extra**：真結局時把收集度那兩行收成一行，或 FINAL SCORE 與 ALL CLEAR 之間多留 4px |
| **R7-P2-02** | P2 | `src/ui.js` `drawHUD` | **遊戲中完全看不出自己在 Extra 模式**。HUD 的難度欄仍然寫「NORMAL／普通」，唯一的 EXTRA 標示只在選關畫面（`ui.js:728`）。玩家從選關進關之後就沒有任何提示，而 Extra 的差異（HP 6→3、敵人 +3~5、多出尖刺）全都是「被打了才知道」。 | `?extra=1` → `goto game w1 r0` → 看 HUD | `gextra_rooms1/2.png`（右欄每一張的 HUD 都寫 NORMAL） | **ui-menu / extra**：難度欄在 `KB.extraOn()` 時改成紅字「EXTRA」，或在能力名旁掛一個小 EX 徽章 |
| **R7-P2-03** | P2 | `src/progression.js` `drawHUD`（COMBO）＋ `src/ui.js` 關卡橫幅 | **R6-P2-01 未修、Round 7 更容易踩**：COMBO 計數還是會壓在開場「WORLD n」橫幅上。Round 7 的覺醒量表要靠連擊充能、mix2 的蓄力必殺一次清一片，進房 3 秒內就跳到 COMBO ×24 是常態。 | 進 w1 r0 → 連續攻擊 → 看橫幅右端 | `gawk_trigger.png`（第 1 列第 3 格，「WORLD 1」的 1 被壓住）、`gmix2_hammermech.png` | **progression**（橫幅播放中把 COMBO 往下移，或橫幅結束後才畫） |
| **R7-P2-04** | P2 | `src/helper.js:1051`（`drawHUD` 的 `KB.drawSpr(ctx, icon, x+13, y+4)`） | **夥伴 HUD 的能力 mini 圖示上緣超出面板 3px**，會戳出面板頂線、也會蓋到「合體技就緒」的金色框線（8×8 置中畫在 y+4，面板頂在 y0=205，第 0 列的圖示等於 202~210）。 | 生兩個夥伴 → 4 倍裁 HUD x150~256 / y188~224 | **`helper/crophud_duo_hud.png`** | **helper2**：圖示改畫在 `y + 5`（或面板往上 2px） |
| **R7-P2-05** | P2 | `src/awaken.js` `tryTrigger` ＋ 變身系（`src/forms.js`） | **變身系（giant / dragon / mech / ghost）在「變身演出」的約 60 幀內按 跳+攻 完全沒有反應**，量表滿了也一樣，而且沒有任何提示（不是消耗掉，是整個吃掉輸入）。演出結束後就正常。第一次測 20 招時就是被這個絆倒（4 招誤判為不會觸發）。 | `giveAbility('giant')` → 立刻 `AWAKEN.gauge=MAX` → `press jump,attack 2` → `AWAKEN.active()` 為 false；改成 step 60 之後再按就 true | `awaken/form_giant.png`、本報告 R7-2b | **awaken**：變身演出期間量表滿了就把 HUD 量表壓暗 / 不要閃「覺醒 READY」，或把這 60 幀的輸入存成 buffer |
| **R7-P2-06** | P2 | `src/ui.js` `StageSelectScene.draw`（底部提示列） | 游標停在**鎖定**的第 7 節點時，底部提示列仍然寫「Z 進入」，但按 Z 進不去（正確行為）。資訊列已經有鎖頭 + 「集齊 15 顆大星星」，提示列沒有跟著變。 | `KB.UI.unlockAll=false` + 12 顆星 → 選關 → 游標右移到第 7 點 | `extra/select_w7_locked_cursor.png` | **ui-menu**：鎖定時把「Z 進入」改成灰字或「未解鎖」 |
| **R7-P2-07** | P2 | `src/helper.js`（assault 模式） | **突擊模式的清怪效率偏低**：兩個夥伴（sword + fire、Lv1）在 200 幀內追到 150px 外的敵群，但 12 隻只殺掉 1 隻。追擊移動是對的（x 從 34/20 → 149），攻擊頻率跟不上。 | `t3_helper.py` 的 assault 段（`setMode('assault')` → spawn 3 隻在 150px 外 → step 200） | `ghelp_modes.png`（第 2 列第 2 格） | **helper2**：突擊模式把 `atkCDFrames` 再打 7~8 折，或允許移動中出招 |
| **R7-P2-08** | P2 | `src/bosses.js`（克拉寇） | `tools/boss_test.py --runs 3` 的唯一 WARNING 仍是 `kracko FIGHT 2/3`（第 2 個樣本 `playerDied=4` 打不贏）。**Round 6 就有、不是本輪造成的**，但已經連續三輪出現在 SUMMARY 裡。 | `.venv/bin/python tools/boss_test.py --runs 3` | `/tmp/.../play/boss.log` | **levels-bosses**：克拉寇的落雷 / 俯衝密度或機器人策略擇一調整 |

### 觀察（不列入問題）

- **覺醒 Lv4 升級橫幅叫「AWAKEN!」，和真正的覺醒發動橫幅（金色 + 招名）撞名**。用「xp 14 → 打一下升 Lv4 → 連擊到滿 → 發動」的真實流程實測，升級橫幅在第 6 次連擊前就散掉了，**兩者不會真的疊在一起**（`gawk_clash.png`）。只有用測試 hack（同一幀給 Lv4 + 滿量表）才會疊，例如 `gawk_moves1~4.png` 第 2 欄那些糊掉的字。
- mix2 自述的「暫停卡中文一個字一行」在本機 **沒有重現**：12 張暫停卡（3 倍）中文全部橫排可讀（`mix2/pause_*.png`）。
- awaken 自述的「圖鑑 Lv4 會沿用 Lv3 黃色條」實際上**看起來是對的**：Lv4 是金色滿格 + 「MAX xp 15」，跟 Lv1~Lv3 的進度條分得出來（`awaken/codex_lvbars.png`）。
- 覺醒量表**只有 Lv4 才累積**已驗證：xp 0（Lv1）/ xp 8（Lv3）打 5 輪敵人量表都是 0，xp 15（Lv4）同樣打法是 50。
- 夢魘之核的護盾碎片是 `phase === 1` 專屬（`get shieldUp`），二 / 三形態不會殘留擋刀 —— 我一開始用 `s.dead` 誤判成「碎片永遠是 4 片」，實際要看 `s.alive`。
- `KB.game` 的地圖欄位是 **`game.map`** 不是 `game.tilemap`（寫工具踩過一次）。
- `KB.save.abilityXp[k] = 15` 之後再 `giveAbility(k)` 會多加 1 xp（變 16），不影響 Lv4 判定。
- 成績板的「競技場最佳」在只寫 `KB.save.arena = {best: n}` 時顯示 `--:--`，我沒有去追它真正吃哪個欄位，**不列為問題**（可能是我造的假存檔格式不對）。

## R7-2. 各系統驗收明細

### R7-2a. mix2（第二批 12 組混合能力）

36 招連拍（每招 5 幀 × 每幀 5 步）＋ 招後 240 幀殘留檢查，**全部 0 missing / 0 pageerror / 招後回 `idle` 且能力保留 / `KB.VFX.list` 歸 0**。

| mixkey | X | 方向 / 空中 | 蓄力 50 放開 | 判定證據 |
|---|---|---|---|---|
| flamebow 焰弓 | 火箭 | 空中火雨（落地火海） | 鳳凰箭 | hb 1→0、proj 1；空中 hb 3→9（火海逐格鋪開） |
| frosthammer 冰鎚 | 凍地衝擊 | ↓ 冰柱群 ×5 | 冰河期（全畫面白） | proj 3~6、蓄力後整畫面白閃 |
| thundersword 雷劍 | 帶電斬 ×2 | 空中雷擊落下斬 | 雷神劍 | 敵人被麻痺（白色 BOLT!） |
| flameninja 火忍 | 火遁手裡劍 ×3 | ↓ 替身爆（「替身!」+ 原地引爆） | 火遁大炎 | proj 2、替身橫幅 + 雙段爆 |
| frostninja 冰忍 | 冰針三連 | ↓ 冰鏡瞬移（碎鏡冰片） | 吹雪 | proj 1→3、瞬移後留冰鏡 |
| thundergun 雷槍 | 電擊彈（鎖鏈跳） | ↓ 電網霰彈 ×7 | 雷射砲 | proj 5、COMBO ×2 |
| stonegiant 岩巨人 | 岩拳 + 踩踏（STOMP!） | ↓ 滾石衝撞 | 山崩（落石 7 顆） | hb 1~2、蓄力 proj 1→5 |
| flamedragon 炎龍 | 炎息加強 | 空中炎翼衝 | 太陽炎 | hb 3（龍息框逐幀拉長） |
| thunderdragon 雷龍 | 雷息 | 空中雷翼俯衝（雙落雷柱） | 雷雲 | hb 3→1、蓄力 hb 2 |
| timebeam 時光束 | 凍結光束 | ↑ 時間裂縫 ×3 | 時停爆（TIME STOP → 白閃） | hb 2→3 + proj 3；蓄力在第 42~56 幀才出判定（先定格 200 幀） |
| gravityblade 重力刃 | 軌道刃 ×4 環繞 | ↓ 引力回收刃 | 刃之奇點 | proj 固定 4（Mix2Orbit 半徑外擴） |
| hammermech 鎚機甲 | 火箭鎚（ROCKET!） | ↑ 飛彈鎚 ×2 | 軌道砲鎚（ORBITAL!） | 蓄力在第 28~70 幀落砲柱、殺掉敵人（en 9→8） |

- **暫停卡**：12 張全部正確（名稱 / HUD 英文名 / 風味文字 / 3 行招式表），中文橫排可讀。
- **圖鑑**：6 頁、`發現 44/44`，mix2 的 12 組都有專屬 24×16 圖示 + 8×8 mini、招式表與暫停卡一致。
- **API**：`KB.ABILITY_KEYS.length = 44`、`Object.keys(KB.MIX.table).length = 24`、HUD 英文名沒有一個超過 7 字。

### R7-2b. awaken（Lv4 覺醒）

| 項目 | 結果 |
|---|---|
| Lv4 四星 | ✅ 第 4 顆是金色光芒星（`awaken/crop_lv4_stars.png`），與 Lv1 對照明顯不同 |
| 量表累積 | ✅ 命中 +6、連擊遞增（0→6→14→24→36→50→66→84→100，8 次連擊滿） |
| 受傷 −20 | ✅ 24 → 4 |
| 只有 Lv4 才累積 | ✅ Lv1 / Lv3 打 5 輪敵人量表恆為 0 |
| 滿了的提示 | ✅ 「覺醒 READY」textPop + 量表金白閃爍（`awaken/crop_gauge_ready.png`） |
| 跳+攻 觸發 | ✅ `active()=true`、`activeT` 299→0、`invincibleT` 同步 300 |
| 未 Lv4 不觸發 | ✅ 量表 100 但 Lv1 → 只出普通攻擊（state='attack'），量表不消耗 |
| 量表未滿不觸發 | ✅ Lv4 + gauge 50 → 只出普通攻擊 |
| **20 招** | ✅ 全部發動 + 產生判定框 + 第一幀就秒殺 4 隻雜兵（13→9）；0 missing / 0 error |
| 覺醒中 HUD | ✅ Lv 星整排金色閃爍、量表改顯示剩餘時間並金色脈動、冠冕 + 光環 + 金色釉光（表情看得見） |
| 結束 | ✅ 300 幀後 `active()=false`、`gauge=0` |

**變身系的 60 幀空窗（R7-P2-05）**：`giveAbility('giant'/'dragon'/'mech'/'ghost')` 之後的變身演出期間 `tryTrigger` 會被呼叫但輸入吃不到，`act` 恆為 false；`step(60)` 之後再按就 100% 成功。20 招的正式驗收是在補了 `step(60)` 之後跑的。

### R7-2c. 覺醒招對魔王的傷害（R7-P1-01 的依據）

迪迪迪大王（W5，60 HP，一般難度）：發動一次覺醒後放置 320 幀（玩家不再按任何鍵），只算覺醒招本身。

```
fire 60→0(100%)  sword 60→0(100%)  beam 60→0(100%)  cutter 60→0(100%)
spark 60→0(100%) stone 60→0(100%)  ice 60→0(100%)   hammer 60→0(100%)
gunner 60→27(55%) ninja 60→0(100%) blade 60→0(100%) bow 60→0(100%)
mage 60→0(100%)  time 60→18(70%)   gravity 60→0(100%) clone 60→0(100%)
giant 60→0(100%) mech 60→2(97%)    dragon/ghost = 樣本無效（踩到 R7-P2-05 的變身空窗）
→ 18 個有效樣本：17 個一次覺醒直接打死，中位數 100%
```

夢魘之核（W7 真最終魔王，三形態各一條血）：

```
P1 核心（40 HP，已破盾裸露）  sword/hammer/stone/fire → 4/4 一次覺醒清空 → 進入第 2 形態
P2 夢魘騎士（40 HP）          sword/hammer/stone/fire → 4/4 一次覺醒清空 → 進入第 3 形態
P3 終焉之翼（50 HP）          sword/hammer/stone/fire → 4/4 一次覺醒直接擊殺
```

### R7-2d. helper2（雙夥伴）

| 項目 | 結果 |
|---|---|
| 雙夥伴 | ✅ `count()=2`、slot 0/1、能力各自保留（sword + fire）、HUD 兩列 |
| 指令循環 | ✅ ↑+SELECT → stay → assault → follow（toast「夥伴指令：…」正確） |
| 待命 | ✅ 卡比走到 x=166，兩夥伴留在 x=34 / 20 完全不跟 |
| 突擊 | ✅ 追到 150px 外（x 34/20 → 149）；清怪效率偏低（R7-P2-07） |
| 合體技 | ✅ `canUnion` true → 兩人衝到左右出招 → 敵人 14→11、CD 600→465、CD 期間 `canUnion` false |
| 走門 | ✅ 淡出 alpha 1→0.8→0.4 → 換房 → 淡入 0.3→1（`ghelp_door.png`） |
| 死亡重生 | ✅ 夥伴消失（poof）→ 卡比重生（lives 3→2）→「夥伴歸隊！」帶原本能力回來 |
| 組合鍵不誤丟能力 | ✅ ↑/↓+SELECT 之後卡比的能力沒有被丟成能力星 |

### R7-2e. extra（Extra 模式）

**疊加層全掃描**（`applyRoomLayers(lv, i, room, false/true)` 逐房對照，43 個房間）：

| 世界 | 非魔王房 | 敵人增量 | 尖刺 | 隱藏 1UP | 補給減少 |
|---|---|---|---|---|---|
| w1 | 4 | +4 / 房 | +2 格 / 房 | +1 | −4 |
| w2 | 5 | +4 | +2 | +1 | −7 |
| w3 | 5 | +4 | +2 | +1 | −7 |
| w4 | 5 | +4 | +2 | +1 | −6 |
| w5 | 6 | +4 | +2 | +1 | −8 |
| w6 | 6 | +4 | +2 | +1 | −5 |
| **w7** | **5** | **+4~5** | **+2** | **+1** | **−4** |
| 合計 | **36 房** | **+138 個實體** | **+72 格** | **36 個 `oneup`** | **−41 份** |

- 魔王房（每個世界 1 間）**一律不套疊加層**，符合設計。
- **w7 也有疊加層**（world7 agent 代為補上），extra agent 自述的「w7 沒有 Extra 疊加層」已經不成立。
- 實機：`?extra=1` 進 w1~w7 r0，敵人 9→12 / 12→15 / 14→17 / 13→16 / 17→20 / 8→11 / 8→12，HP 一律 6→3。

**6 魔王 Extra 變體**（開場即二階段 + 專屬新招）：

| 魔王 | 一般 phase/HP | Extra phase/HP | 開場橫幅 | 新招 |
|---|---|---|---|---|
| 大樹威斯比 | 1 / 40 | **2 / 50** | 威斯比的樹根開始暴走！ | `leafstorm` 龍捲落葉 ✅ |
| 洛洛洛與拉拉拉 | 1 / 30 | **2 / 38** | 洛洛洛與拉拉拉同時推箱！ | `tribox` 三箱齊推 ✅ |
| 克拉寇 | 1 / 40 | **2 / 50** | 克拉寇捲起雷雨！ | `tracker` 雷雲追蹤 ✅ |
| 魅塔騎士 | 1 / 55 | **2 / 69** | 魅塔騎士拔出了真劍！ | `crossslash` 劍氣十字 ✅ |
| 迪迪迪大王 | 1 / 60 | **2 / 75** | 迪迪迪大王怒了！ | `quake` 巨鎚震盪波（4 道）✅ |
| 暗影卡比 | 1 / 70 | **2 / 88** | 暗影卡比分裂成四個！ | `split` 分身 **4 隻** ✅ |

**成績板**：8 頁（總覽 + W1~W7）。總覽的 W1~W6 有 BEST / RANK / TIME / STAR / PLAY / EX 徽章，W7 未通關時整列灰線；下方彙總「競技場最佳 / 成就 13/20 / 大星星 18/21 / 能力發現 44/44」。分頁有 EXTRA CLEAR 紅字、4 倍字評價印章 + 獎盃，未通關頁顯示「還沒通關這個世界」。←→ 換頁、Z / SELECT / ENTER / X 都能回標題（實測四個鍵都會離開，只是 leave 轉場要 ~40 幀）。

**第 7 節點**（`KB.UI.unlockAll=false` 下實測）：

| 狀態 | `dreamOpen()` | 節點 | 游標 | 按 Z |
|---|---|---|---|---|
| 通關 w6 + **12** 顆星 | false | 畫鎖頭（`extra/zoom_select_w7_locked.png`） | **走得過去**（`canMove(6)=true`） | **進不去**，留在選關（`canEnter(6)=false`） |
| 通關 w6 + **18** 顆星 | true | 夢之門（粉紫傳送門 + 3 個星格） | 走得過去 | 進得去，資訊列「出發！」 |

資訊列在鎖定時正確顯示鎖頭 + 粉紅「集齊 15 顆大星星」+ `STAR 12/15`。7 個關名標籤 **0 重疊 / 0 出界**。Extra 模式的紅色 `EXTRA` 牌正確掛在「選擇關卡」右邊。

**w4 / w5 可燃植被**：w4 r0 有 `g`×4 + `f`×2（雲草 / 雲花）、w5 r1 有 `v`×6 + `k`×3（地毯邊 / 旗幟）。點火 → `decoFire.size` 同時 4 格燃燒 → 燒完變焦黑，兩處都看得到蔓延。

### R7-2f. world7（夢幻迴廊）

| 房 | 規格 | 實測 | 結果 |
|---|---|---|---|
| r0 記憶迴廊 | 104×12 | 104×12、1 門、8 敵、34 item | ✅ |
| r1 顛倒之塔 | 32×24 垂直 | 32×24、1 門（在 y=1）、9 敵 | ✅ |
| r2 夢境迷宮 | 80×12 dark | 80×12、`room.dark=true`、**2 門（x=76 locked / x=30 秘密房）**、11 敵、4 個夢之開關 | ✅ |
| r3 六王試煉 | 56×12 | 56×12、1 門 locked、3 隻中魔王 + gatekeeper、起點 fire+sword 並排台座 | ✅ |
| r4 醒不來的王座 | 28×14 | 28×14、無門、boss ×1 | ✅ |
| r5 甜夢（秘密） | 24×12 | 24×12、1 門、15 item（含 1UP / 番茄 / 4 座台座） | ✅ |

- **3 顆大星星**：r0 (93,2) / r2 (69,9) / r5 (11,3) 三顆都在規格位置，實際碰到都會進 `KB.save.stars.w7` 的對應格（`[1,0,0]` / `[0,1,0]` / `[0,0,1]`）並跳「大星星 1/3」。
- **夢之開關順序**：4 顆的 `order` 是 0/1/2/3、座標 (11,6)(24,5)(36,6)(60,6)。**先打 #2 完全無效**（`pressed` 不變、門仍鎖），依序 0→1→2→3 才在第 4 顆解鎖 x=76 的門。`isNext` 那一顆會發光 + 光暈，符合「摸黑也不會把自己鎖死」的設計。
- **六王試煉鎖門**：bonkers(14HP) / mrfrosty(12HP) / rollarmor(12HP) + gatekeeper，三隻全倒後 x=52 的門 `locked` 轉 false。
- **夢魘之核**：登場（王座沉睡 → 夢境粉紅擴散 → 第 92 幀睜眼 → 浮起，橫幅「夢魘之核 / NIGHTMARE CORE」）→ 三形態 **11 個招式全部連拍過**：

| 形態 | HP | 招式 | 連拍結果 |
|---|---|---|---|
| ① 核心 | 40 | `fan` / `summon` / `drift` | proj 5 發扇形 ✅ / 橫幅「夢魘之核召喚了食夢獸！」✅ / 漂移 ✅ |
| | | 護盾 4 片 | ✅ 傷害轉給碎片、**本體 hp 完全不動**，碎片各 3 點，全破 → `bareT=240` |
| ② 夢魘騎士 | 40 | `slash3` / `warpslash` / `voidhole` / `phantom` | proj 1→3 三道劍氣 ✅ / 消失→背後→hb 1 ✅ / 第 62 幀 hb 1 ✅ / 「幻影・暗影的星雨」proj 6 ✅ |
| ③ 終焉之翼 | 50 | `featherrain` / `dive` / `eternalnight` / `rest` | letterbox +「羽毛雨 / 站進光環裡！」+ 地面安全區光環 + proj 3→7 ✅ / 俯衝 ✅ / **全畫面壓黑只剩卡比 44px 光圈 +「永夜 ETERNAL NIGHT」** ✅ / rest 後自動接下一招 ✅ |

- **形態轉換**：①→② 與 ②→③ 都是 `changing=true` + state `morph` 約 96 幀（白閃 + 碎片外炸 → 魔法陣 → 聚攏）→ 橫幅「夢魘騎士 / 第 2 形態」「終焉之翼 / 第 3 形態」→ HP 重置為 40 / 50。
- **擊敗 + TRUE END**：16 道放射光束 + 光環 + 白閃 + 橫幅「夢醒了 / TRUE END」，`KB.session.trueEnd = true`。
- **音樂 key（用 `KB.audio.status().playing` 實測，`?debug=1&norun=1` 不 mute + `KB.audio.unlock()`）**：

| 時點 | `status().playing` | 判定 |
|---|---|---|
| 三形態戰鬥中 | `nightmare` → `nightmare2` | ✅ |
| **魔王倒下當下** | **`trueend`** | ✅ |
| `levelClear()`（走進過關門） | `clear` | ⚠️ 會蓋掉 trueend（world7 早就提過的跨檔問題） |
| ResultScene | `result` | ⚠️ 同上 |
| **EndingScene（`session.trueEnd`）** | **`trueend`** | ✅ **總控的接線已生效** —— EndingScene 會自己再放一次 |
| 一般結局（對照組） | `ending` | ✅ 沒有被誤判成真結局 |

### R7-2g. 全流程（`gflow.png`，13 個畫面）

`標題(title)` → `標題選單` → `成績板 1/8(select)` → `成績板 2/8 W1` → `回標題(title)` → `選關 6 節點(select)` →
`游標到第 7 節點（18 星解鎖 / 出發！）` → `進 W7(dream)` → `魔王房(nightmare)` → `擊敗(trueend)` →
`過關(clear)` → `真結局(trueend)` → `真結局 ALL CLEAR / TRUE END(trueend)`

全程 **0 console error / 0 pageerror / MISSING SPRITES 空**。

## R7-3. 測試與 playthrough

| 指令 | 結果 |
|---|---|
| `tools/test_mix2.py` | **343/343 PASS** |
| `tools/test_awaken.py` | **75/75 PASS** |
| `tools/test_helper.py` | **131/131 PASS** |
| `tools/test_extra.py` | **53/53 PASS** |
| `tools/test_mix.py` | **245/245 PASS**（mix2 回報的兩條寫死計數已被改成不等式） |
| `tools/test_progression.py` | **63/68 FAIL** → **R7-P1-02**（5 條「6 關 / 第 6 點 space」過時斷言） |
| `tools/test_charge.py` | 19/19 PASS |
| `tools/test_elements.py` | 96/96 PASS |
| `tools/test_forms.py` | 153/153 PASS |
| `tools/test_magic.py` | 119/119 PASS |
| `tools/test_weapons.py` | 105/105 PASS |
| `tools/engine_test.py` | **118/118 PASS** |
| `tools/enemy_test.py` | **393/393 PASS** |
| `node tools/level_check.js` | **0 error / 1 warning**（既有 w2 拉拉拉出生點） |
| `node tools/level_check.js --extra` | **0 error / 1 warning**（同一則） |
| `node tools/audio_check.js` | **全部通過**（37 首曲子，w7 新增 5 首都在表內） |
| `tools/boss_test.py --runs 3` | **ALL PASS（1 warning）** —— warning = `kracko FIGHT 2/3`（R7-P2-08，既有） |
| `tools/boss_test.py --extra` | **ALL PASS**（6/6） |

**playthrough（`--ability sword --godmode`，全部 `deaths=0` / `missing []`）**

| 關卡 | 一般 | Extra |
|---|---|---|
| w1 | cleared 5835 幀 | cleared 6794 幀 |
| w2 | cleared 5957 幀 | － |
| w3 | cleared 7128 幀 | cleared 10036 幀 |
| w4 | cleared 7433 幀 | － |
| w5 | cleared 8998 幀 | － |
| w6 | cleared 8794 幀 | cleared 7270 幀 |
| **w7** | **cleared 9450 幀**（魔王 rest 狀態擊殺） | **cleared 9444 幀**（maxHp 63 ＝ Extra ×1.25） |

**12 個 mix2 能力跑 w1（`--godmode`）：12/12 cleared、deaths=0**

```
flamebow 5055  frosthammer 5920  thundersword 6786  flameninja 7455
frostninja 8369  thundergun 4170  stonegiant 7603   flamedragon 6118
thunderdragon 6128  timebeam 6279  gravityblade 5917  hammermech 7668
```

extra agent 回報的「`--extra w1` 有 1/4 樣本卡在 r1」在我這次的單一樣本**沒有重現**（6794 幀通關）。

## R7-4. 效能

量法：`for (i<300) __kb.step(1)`（`__kb.step(n)` 每次呼叫都會 `render()`，所以是「update + render」的真實幀成本），同一情境跑 3 次。
**覺醒 / 燃燒是有時限的效果，只有第 1 次跑涵蓋完整效果**，所以下表取「第 1 次」當最壞值。

| 情境 | 第 1 次 300 幀 | ms/幀 | 佔 16.7ms 預算 |
|---|---|---|---|
| baseline w1 r0（空手，45 實體） | 128.4 ms | 0.43 | 2.6% |
| baseline + 8 敵人 | 100.9 ms | 0.34 | 2.0% |
| 雙夥伴 + 8 敵人 | 148.3 ms | 0.49 | 3.0% |
| 覺醒招（百斬星光劍）+ 8 敵人 | 194.0 ms | 0.65 | 3.9% |
| 燃燒草（全房點火 9 格）+ 8 敵人 | 211.7 ms | 0.71 | 4.2% |
| **★ 雙夥伴 + 覺醒招 + 燃燒草 + 10 敵人** | **313.2 ms** | **1.04** | **6.3%** |
| W7 魔王第 3 形態「永夜」 | 265.1 ms | 0.88 | 5.3% |

**結論：最重的情境也只用掉 6% 的幀預算（≈ 960 fps 的理論上限），Round 7 全部新系統疊起來完全沒有效能風險。**

## R7-5. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python

# mix2：12 組 × 3 招連拍（→ gmix2_<key>.png）／暫停卡／圖鑑
$PY shots/agent_qa7/mix2shot.py                    # 全部
$PY shots/agent_qa7/mix2shot.py --only timebeam --seq 8 --every 14
$PY shots/agent_qa7/t1_pause_codex.py              # 12 張暫停卡
$PY shots/agent_qa7/t1b_codex.py                   # 圖鑑 6 頁

# 覺醒
$PY shots/agent_qa7/t2_awaken.py --only lv4,nolv4  # Lv4 四星 / 量表 / 未 Lv4 不觸發
$PY shots/agent_qa7/t2_awaken.py --only moves      # 20 招
$PY shots/agent_qa7/t2b_gauge.py                   # 實戰累積量表
$PY shots/agent_qa7/t2c_full.py                    # 充滿 → 發動 → 結束
$PY shots/agent_qa7/t2d_form.py                    # 變身系觸發診斷（R7-P2-05）
$PY shots/agent_qa7/t2e_bannerclash.py             # 真實流程下橫幅不會疊
$PY shots/agent_qa7/t2f_ready.py                   # 乾淨情境的 READY 提示

# 夥伴 / Extra / W7 / 全流程 / 效能
$PY shots/agent_qa7/t3_helper.py                   # 雙夥伴 / 指令 / 合體技 / 走門 / 重生
$PY shots/agent_qa7/t4_extra.py                    # w1~w7 一般 vs Extra 對照
$PY shots/agent_qa7/t4c_layers.py                  # 疊加層全房間統計（43 房）
$PY shots/agent_qa7/t4d_bossx.py                   # 6 魔王 Extra 開場 + 新招
$PY shots/agent_qa7/t4e_ui.py                      # 成績板 / 第 7 節點 / EXTRA / TRUE END
$PY shots/agent_qa7/t4f_burn.py                    # w4 / w5 燒草
$PY shots/agent_qa7/t5_w7.py                       # W7 6 房 ×2
$PY shots/agent_qa7/t5c_gate.py                    # 夢之開關順序 + 六王試煉
$PY shots/agent_qa7/t5d_stars.py                   # 3 顆大星星
$PY shots/agent_qa7/t5e_boss.py --only intro,moves,shield,morph,kill
$PY shots/agent_qa7/t6_flow.py                     # 全流程（含音樂 key）
$PY shots/agent_qa7/t7_perf.py                     # 效能

# 拼圖（沿用 qa6 的工具）
$PY shots/agent_qa6/grid.py --out x.png --cols 5 --labels "第一列|第二列" a.png b.png ...

# 測試
for t in test_mix2 test_awaken test_helper test_extra test_mix test_progression test_charge \
         test_elements test_forms test_magic test_weapons engine_test enemy_test; do $PY tools/$t.py; done
node tools/level_check.js; node tools/level_check.js --extra; node tools/audio_check.js
$PY tools/boss_test.py --runs 3; $PY tools/boss_test.py --extra
for w in w1 w2 w3 w4 w5 w6 w7; do $PY tools/playthrough.py --level $w --ability sword --godmode; done
for w in w1 w3 w6 w7; do $PY tools/playthrough.py --level $w --ability sword --godmode --extra; done
for a in flamebow frosthammer thundersword flameninja frostninja thundergun \
         stonegiant flamedragon thunderdragon timebeam gravityblade hammermech; do
  $PY tools/playthrough.py --level w1 --ability $a --godmode; done
```

### 截圖索引（`shots/agent_qa7/`）

- **mix2**：`gmix2_<12 個 mixkey>.png`（每張 3 招 × 5 幀）、`gmix2_{timebeam,hammermech,stonegiant}_ultlong.png`（蓄力招長連拍）、原始幀在 `mix2/`；`mix2/pause_*.png` ×12、`mix2/codex_p1~p6.png`、`mix2/codex_<key>.png`
- **覺醒**：`gawk_moves1~4.png`（20 招 × 6 幀）、`gawk_trigger.png`（發動連拍）、`gawk_ready.png`（READY → 發動）、`gawk_clash.png`（真實流程的橫幅）、`awaken/crop_lv4_stars.png` / `crop_lv1_stars.png` / `crop_gauge_ready.png` / `codex_lvbars.png`、`awaken/nolv4_jumpattack.png`
- **夥伴**：`ghelp_modes.png`（3 指令 + 待命 / 突擊 / 重生）、`ghelp_union.png`（合體技 8 幀）、`ghelp_door.png`（走門淡入淡出）、`ghelp_death.png`（死亡歸隊）、**`helper/croppop_mode_assault.png`（R7-P1-03 證據）**、**`helper/crophud_duo_hud.png`（R7-P2-04 證據）**
- **Extra**：`gextra_rooms1/2.png`（w1~w7 一般 ↔ Extra）、`gextra_boss1/2.png`（6 魔王開場 + 新招）、`extra/records_p1~p8.png`、`extra/select_w7_locked|open*.png` 與 `extra/zoom_select_w7_*.png`、`extra/select_extra_title.png`、`gextra_trueend.png` + **`extra/zoom_trueend_overlap.png`（R7-P2-01 證據）**、`gextra_burn.png`
- **W7**：`gw7_intro.png`、`gw7_p1/p2/p3.png`（三形態 11 招）、`gw7_morph.png`（兩次形態轉換）、`gw7_death.png`（擊敗 + TRUE END）、`gw7_stars.png`（3 顆大星星）、`w7/r0_a~r5_b.png`（6 房 ×2）、`w7/sw_init|wrong|0~3|unlocked.png`（夢之開關）、`w7/r3_gate_locked|open.png`
- **全流程 / 效能**：`gflow.png`（13 個畫面）、原始幀在 `flow/`；`gperf.png`、`perf.json`
- **數據**：`mix2.json`、`awaken.json`、`extra_rooms.json`、`w7_rooms.json`、`perf.json`

---

# Round 8 驗收（qa8 · 2026-09-12）

> 範圍：ach2（成就 40 條 + 選單整合）、awaken-mix（24 招混合覺醒招）、saves-input（3 存檔槽 + 按鍵重映射）、
> skins（12 配色）、audio8（52 sfx + 3 曲）、challenge（時間攻擊 / 無傷 / 挑戰塔 / 每日 / Boss Rush 變體 / 成績板挑戰頁）。
> 所有截圖在 `shots/agent_qa8/`，**每一張都用 Read 工具實際看過**。src 全程唯讀，只寫本檔與 `shots/agent_qa8/`。
> challenge agent 已於 997cf24 交件，本輪一併驗收。

## R8-0. 結論

| 系統 | 結果 | 備註 |
|---|---|---|
| **ach2 成就（40 條）** | **OK** | 40 條定義、id / 名稱皆不重複、hint 無空值；成就頁 4 頁 ×10 條、解鎖時間 `MM/DD HH:MM`、詳情條 `UNLOCKED / LOCKED`、頁碼 `n/4`；**誤觸發回歸全過**：w5 魔王打到 60% 不跳「大王退治」（`ach` 為空、toast 佇列 0）、`?debug=1` 不自動解鎖 `basic8` / `all20`（空存檔進標題 120 幀後 0 解鎖）；**換存檔槽 backfill 靜默**（切槽 + `backfill()` + 進關 三個時機 toast 佇列都是 0，成就照樣補上） |
| **ach2 選單整合** | **OK** | 標題 9 項（新遊戲 / Extra / **挑戰模式** / 操作說明 / 能力圖鑑 / 成績板 / 競技場 / **存檔槽** / 設定），7 列捲動視窗 + 右側位置條 + 上下三角，捲到底 `sel=8 top=2 win=7`；設定頁 7 項（含**卡比配色** / **按鍵設定 ›**）；7 個入口（挑戰 / 說明 / 圖鑑 / 成績板 / 競技場 / 存檔槽 / 設定）**全部可開可返回**、0 console error |
| **awaken-mix（24 招）** | **OK（1 個命中問題）** | 24 招各 1 張截圖、招名 / 英文名 / 印記 / letterbox / 兩段 worldTint 全部正確、招後回 `idle` 且量表歸 0、0 missing sprite、0 pageerror；`mix_<key>` ×24 與 `awk_<主成分>`、`awk_start` **實測真的被呼叫**（hook `KB.audio.sfx`，0 個 unknown）；**對迪迪迪 24 招一致 21/60 = 35% ≤ 40%**。**但對 W1 威斯比有 10 招是 0 傷害 → R8-P1-02** |
| **saves-input 存檔槽** | **OK** | 3 槽完全獨立、複製（空槽來源回 `false`）、刪除當前槽會就地清空、舊 `kirbystar_save` 自動遷移到槽 1 且**保留舊檔 + 不重複遷移**、`settings` 全域共用（`KB.save.settings === globals().settings`）、遊玩時間 200 幀 → +3 秒、`fmtTime` `01:05` / `1:02:05`；存檔卡顯示通關 / 星星 / 能力 / 成就 / 時間 / END 徽章，刪除二次確認預設停在「取消」 |
| **saves-input 按鍵重映射** | **OK** | 11 個 API 全在；改綁 `jump → KeyQ` 後**真的用 playwright 按 Q 會跳**（y 145 → 107.2）且 reload 後保留；`actionOf('KeyQ') === 'jump'`；監聽提示框、移除鍵提示（「已移除 D」）、還原預設、手把欄位（A/B・X/Y・L1/R1・Start）、`rebindGamepad('jump',3) → ['Y']` 全部正確 |
| **skins 12 配色** | **OK（1 個缺件 + 1 個既有限制）** | 12 色預覽圖全部可辨識且互不相同；`set()` 對未解鎖 / 未知 id 回 `false` 且不改存檔（非 debug 時 `list()` 只有 `pink`）；12 條解鎖條件文字正確；實戰 gold / galaxy / black 換色正確、HUD 右下卡比臉同步、設定頁 cycle 生效（櫻花粉 → 檸檬黃）。**但設定頁沒有畫預覽 → R8-P1-01**；HUD 左下 `ui_ability_*` 仍是粉紅（既有限制 → R8-P2-03） |
| **audio8** | **OK** | `node tools/audio_check.js` 全部通過（**151 sfx / 40 music / 4 ambient**，節流表 85 項）；24 個 `mix_*` 與 23 個 `awk_*` 名單齊全；實機 hook 確認 24 招真的會播 `mix_<key>`，**0 個 unknown sfx**；`setTempoMul` 在挑戰塔第 7 層 = **1.2**、離開挑戰後自動回 **1.0** |
| **challenge** | **OK（3 個版面小問題）** | 選單 5 項 + 說明文字 + 各自 BEST；時間攻擊 HUD（`TIME` + `00:05.00`）、死亡不扣命（lives 9 → 9、`deaths=1`、不回選關）；無傷 HUD `NOHIT / CLEAN`、受傷即 `ChallengeResultScene`「被擊中！」；挑戰塔 10 層（同 seed 同序列、異 seed 不同、第 5 / 10 層魔王、修飾橫幅「鏡像 / 一擊必殺 / 隨機能力 / 時限」、HUD `F n/10` + `S1`）；每日（`D 1/3` + `S60912`、`dateKey 20260912`、3 層固定修飾、同日不覆蓋）；Boss Rush `EXTRA` / `ALL 7` 變體（連戰 7 名、`from:'challenge'` 時 SELECT 正確回挑戰選單）；成績板第 9 頁「挑戰」；**挑戰模式不寫 `cleared`**（實測塔第 10 層打死魔王後 `cleared` 仍為空） |
| **全套測試** | **全綠** | 17 支 `tools/*_test.py` / `test_*.py` + `boss_test --extra` + `level_check`（含 `--extra`）+ `audio_check` **全部 exit 0**；唯一非綠是 `enemy_test.py` 不吃 `--extra` 參數（→ R8-P2-07） |
| **playthrough** | **OK** | w1~w7 **7 個世界全部 `cleared=True` / `deaths=0` / `missing []` / `bossDamage=100%`**；`--challenge tower --seed 1 --until-floor 3` → `floors_seen=[1,2,3]`、3566 幀、deaths=0 |
| **效能** | **OK（大量餘裕）** | 最重情境（雙夥伴 + 覺醒混合招 `hammermech` + galaxy 配色 + 10 敵人）300 幀最佳 **117.4 ms = 0.391 ms/幀**，含覺醒演出的那一輪也只有 302.7 ms = **1.01 ms/幀**，用掉 16.7 ms 預算的 6% |

問題統計：**P0 × 0、P1 × 2、P2 × 7**。沒有任何一項阻擋出貨。

## R8-1. 問題列表

| 編號 | 等級 | 位置 | 現象 | 重現 | 截圖 / 數據 | 建議負責人 |
|---|---|---|---|---|---|---|
| **R8-P1-01** | P1 | `src/menu.js` `SettingsMenu.draw`（`skin` 那一列） | **設定頁「卡比配色」只有文字、沒有卡比預覽**。skins agent 專門為此做了 `KB.SKINS.drawPreview(ctx,x,y,id)`，但 `grep -rn "drawPreview" src/` 顯示**全專案 0 次呼叫**（只有 `UI.drawPreview` 是另一個東西）。玩家在設定頁把配色從「櫻花粉」切到「星河」，畫面上完全沒有任何顏色回饋，要退出設定、進遊戲才看得到自己選了什麼。Round 8 驗收項目「選單預覽跟隨」等於沒有實作。 | `new KB.SettingsMenu()` → `sel = 5`（卡比配色）→ `tap right` → 截圖，畫面只有「檸檬黃」三個字 | `shots/agent_qa8/menu/settings.png`、`settings_skin.png`、**`settings_skin_cycled.png`**（切成檸檬黃，畫面無任何黃色卡比） | **ach2 / ui-menu**：在該列右側或面板下方加一行 `KB.SKINS.drawPreview(ctx, x, y, ids[i])`（skins 已把錨點做成底部中央，一行就夠） |
| **R8-P1-02** | P1 | `src/awaken.js`（24 招的 `bigbox()` / `ashoot()` 取景範圍） | **24 招覺醒混合招裡有 10 招對 W1 魔王威斯比是 0 傷害**，而且**任何距離都打不到**。在 w1 r3 打完開場動畫、卡比站在出生點（cx 264）、威斯比在 cx 452 的預設站位下，`thunderblade / stonehammer* / starmage / thundermech / frosthammer / thundersword / thunderdragon / timebeam / gravityblade / hammermech` 一次覺醒扣 **0 / 40 HP**；把卡比直接瞬移到威斯比旁邊（cx 438）再放，結果一樣是 0。重複 4 次取樣：`flamesword` 穩定 6、`hammermech` 穩定 **0、0、0、0**、`stonehammer` 抖動 3/14/9/3。原因是這些招的判定是「以卡比為中心的 288×208 框 + 從卡比身上生出來的投射物」，不是真正的全畫面；威斯比是**固定不動、站在比螢幕寬的房間最右側**的魔王，所以整套演出打在空氣上。**對會走過來的迪迪迪則 24 招全部剛好 21/60 = 35%**，所以只有威斯比（以及任何「站在房間邊緣不動」的魔王）會踩到。`tools/test_awaken.py` 的 `SIM_BOSS` 生在 `7*16 = 112`（就在卡比旁邊），所以 189/189 全綠也驗不出這條。 | `shots/agent_qa8/t17_whispyrep.py`：`goto game w1 r3` → 等 `boss.introducing === false` → `giveAbility(key)` + `abilityLv=4` → `AWAKEN.add(100)` → `startAwaken()` → step 900 → 讀 `boss.hp`。對照組 `t4d_boss2.py w5 5`（迪迪迪）24 招全 35% | `t4_awakenmix.json`、`t4b_range.json`、`t4d_boss2.py` 輸出、**`awaken/awk_hammermech.png`**（效果全在畫面左半，右邊的樹毫髮無傷）、`awk_stonehammer.png`、`awk_thunderdragon.png` | **awaken-mix**：把 `bigbox()` 改成以**房間 / 攝影機**為基準（或直接覆蓋整個房間寬），或在 `finale()` 追加一發真正的全房判定；另建議 `test_awaken.py` 的 SIM boss 多一個「放在房間右側 340px 外」的樣本 |
| **R8-P2-01** | P2 | `src/arena.js`（`EXTRA` / `ALL 7` 徽章） | **同時開 Extra + 全 7 魔王時，「ALL 7」徽章的右邊框和副標「競技場」的『競』字疊在一起**（徽章右緣 ≈ x108，副標置中從 x104 開始）。只開其中一個變體時不會疊。 | `new KB.ArenaScene({extra:true, all7:true, from:'challenge'})` → step 50 | **`ch/arena_all7.png`**、`ch/_crop_all7_badge.png`（2 倍裁切） | **challenge**：兩個徽章都在時把副標往下移 8px，或把 `ALL 7` 改畫在右上角 |
| **R8-P2-02** | P2 | `src/arena.js`（選能力畫面底部提示列） | 從挑戰選單進 Boss Rush（`from:'challenge'`）時，底部提示仍然寫 **「SELECT：返回標題」**，但實際按 SELECT 是回**挑戰選單**（行為正確、文字不對）。 | `new KB.ArenaScene({extra:true, from:'challenge'})` → 看底部；按 SELECT → `KB.scene` 變成 `ChallengeScene` | `ch/arena_extra_pick.png`、`ch/arena_all7.png`、`t11_chmisc.py` 的 `arena_back_from_challenge` | **challenge**：`from==='challenge'` 時把提示改成「SELECT：返回挑戰」 |
| **R8-P2-03** | P2 | `src/art/items_ui.js`（`ui_ability_<key>` 44 張 24×16 圖示） | **HUD 左下、暫停能力卡、能力圖鑑清單的能力圖示永遠是粉紅卡比臉**，不跟配色走。換成「星河」在遊戲中，卡比是深紫、右下的 `ui_kirby_face` 也是深紫，唯獨左下的能力圖示還是粉紅，同一個畫面出現兩種顏色的卡比。圖鑑的大預覽框倒是有跟著換。skins agent 已在自己的 PROGRESS「跨檔需求 2」主動回報過，這裡只是確認現象存在。 | `KB.SKINS.set('galaxy')` → `goto game w1 r0 ability=sword` → 看 HUD 左下 / 按 START 看能力卡 | **`skins/game_galaxy.png`**、`skins/pause_preview_galaxy.png`、`skins/gallery_preview_galaxy.png` | **skins**（skins.js 有現成的 `faceVariant()` 作法）或**總控**決定是否要一起換 |
| **R8-P2-04** | P2 | `src/awaken.js` `frosthammer`（冰河終焉）的 `FREEZE!` textPop | **「FREEZE!」在全畫面結冰的白底上對比不足，幾乎看不見**（淺灰字 + 白描邊畫在 `#d8f0f4` 左右的背景上）。`SMASH!`（隕炎天崩）、`QUAKE!`（山崩地裂）、`LOCK ON`（軌道終焉鎚）在各自的暗底上都清楚。 | `giveAbility('frosthammer')` + `abilityLv=4` → `startAwaken()` → 第 52 幀截圖 | **`awaken/awk_frosthammer.png`**、`awaken/_crop_frosthammer.png`（3 倍裁切，放大才讀得出 FREEZE!） | **awaken-mix**：`FREEZE!` / `GLACIER!!` 改成深藍字（或加深色外框），或把結冰白幕的 alpha 壓低 |
| **R8-P2-05** | P2 | `src/challenge.js` `ChallengeResultScene`（失敗標題） | **「CHALLENGE FAILED」剛好佔滿 256px、左右各 0px 邊界**（C 的左緣在 x=0、D 的右緣在 x=255）。沒有被截掉，但和其他畫面的標題（都有 8~16px 邊界）不一致，看起來像是溢出。 | 無傷挑戰 → `KB.player.hurt(1,{})` → step 180 | **`ch/nohit_fail.png`**、`ch/_crop_failtitle.png`（2 倍裁切） | **challenge**：標題字級縮一階，或改成「FAILED」+ 副標 |
| **R8-P2-06** | P2 | `src/keyconfig.js`（鍵盤欄只顯示 3 個） | **「丟棄能力」（select）預設綁了 4 個鍵（Shift / Shift(右) / L / C），但表格只畫得下 3 個**，畫面上是 `Shift｜Shi…｜L`，第 4 個 `C` 完全看不到；而且第 2 欄的 `ShiftRight` 被截成「Shi…」讀不出左右。玩家看不到 C 也能用，但「還原預設」之後會以為自己弄丟了鍵。saves-input 已在自己的 PROGRESS 列為已知限制。 | `new KB.KeyConfigScene({})` → 看「丟棄能力」那一列 | **`saves/keyconfig.png`**、`saves/keyconfig_listen2.png` | **saves-input**：預設的 `select` 收斂成 3 個鍵，或第 3 欄後面加一個「+1」小標 |
| **R8-P2-07** | P2 | `tools/enemy_test.py` | **`enemy_test.py` 不支援 `--extra`**（`error: unrecognized arguments: --extra`，exit 2），但 `boss_test.py --extra`、`node tools/level_check.js --extra` 都支援。Round 8 的收工清單要求「engine / enemy / boss（含 --extra）」，照著跑會拿到一支紅的。不影響遊戲，但會讓「全部測試跑一遍」的腳本失敗。 | `.venv/bin/python tools/enemy_test.py --extra` | `shots/agent_qa8/tests/enemy_test_extra.log`、`tests_summary.txt` | **abilities-enemies / 總控**：加一個 `--extra`（套 `KB.applyRoomLayers` 後重跑敵人用例），或把收工清單改成「enemy_test（無 --extra）」 |

### 觀察（不列入問題）

- **挑戰塔裡打死魔王會解鎖一般成就**（實測塔第 10 層打死迪迪迪 → 解鎖 `hp1_boss` 絕地反擊、`nohit_boss` 完美討伐），但**不會**寫 `KB.save.cleared`。成就與通關旗標的分界是刻意的（challenge 明確說「不寫 `cleared` / `playCount` / `best`」），成就那邊沒有明說，兩邊都說得通，留給總控決定。
- `KB.PROG.backfill()` 只補「由存檔旗標推得」的成就（通關 / 星星 / 秘密房 / Extra / 能力收集那一類），事件型的（覺醒 / 夥伴擊殺 / 連擊）不補——這是設計如此，不是 bug；我一開始餵假存檔只解出 9 條，是我的假欄位名不對。
- `KB.SKINS` 的配色存在**全域** `settings`（`kirbystar_global`）而不是各存檔槽：槽 1 選黃金、切到槽 2 仍然是黃金。規格沒寫要跟槽走，維持現狀沒問題，但如果之後要做「每個存檔一個造型」就要搬家。
- `awk_end` 在我 260 幀的取樣視窗內沒有被呼叫到（`awk_start` 與 `awk_<主成分>` 都有）。招式總長超過 260 幀，**不代表沒播**，只是我的視窗太短；未獨立複驗。
- 挑戰塔「時限」層的 HUD 確認是**倒數**（`01:28.50` 往下跑）＋橫幅寫「時限」；但我用來快轉到最後 10 秒的 hack（改 `challenge.roomFrame`）沒生效，所以 `tick` 每秒一下與 `time_up` 失敗分支**是靠 `tools/test_challenge.py` 93/93 認定的，我沒有獨立複驗**。
- `KB.CHALLENGE` 的每層計時欄位是 `roomFrame` / `base` / `limit`，不是 `time` / `left`（寫工具踩過）。`KB.input.getBindings()` 回的是 `{keyboard:{}, gamepad:{}}` 兩層，不是扁平的（也踩過一次）。
- `KB.SAVES.info(n).stars` 只認合法的大星星 id，餵假的 `{a:1,b:1}` 會算 0（不是 bug）。

## R8-2. 各系統驗收明細

### R8-2a. ach2 成就（40 條）

40 條 id 依序：`first_ability basic8 all20 lv3 combo10 nohit_world clear_w5 arena_clear arena_fast stars15 secret5 inhale_boss possess timestop5 mix_first helper elec_water burn10 hp1_boss ultimate mix_master mix24 awaken_first awaken10 awaken_boss lv4_any lv4_five helper_two union helper_kill20 elem_all rank_s clear_w6 clear_w7 extra_all arena6 stars21 secret7 nohit_boss ach20`
—— **id 無重複、中文名無重複、40 條 hint 全部非空**。

| 回歸項 | 做法 | 結果 |
|---|---|---|
| 「大王退治」誤觸發 | `goto game w5 r5` → 等開場動畫結束 → 以真實 `boss.hurt()` 路徑把 60 HP 打到 24（**扣掉 60%**）→ step 120 | `PROG` 已解鎖清單 **`[]`**、`has('clear_w5') === false`、toast + 佇列 **0** |
| `?debug=1` 自動解鎖 | 清 localStorage → `?debug=1` 進標題 → step 120 | 已解鎖 **`[]`**（`basic8` / `all20` 都沒有）；`PROG.reset()` 後再查也是 `[]` |
| 換存檔槽補發靜默 | 槽 1 寫 `cleared w1~w5` → 切槽 2 → 切回槽 1 → `backfill()` → 進 w1 r0 step 90 | 三個時機 toast 佇列都是 **0**，而 `clear_w5` 有被補上（槽 2 是空的 → `[]`，切回槽 1 → `['clear_w5']`） |
| 新成就真的觸發得到 | `flamesword` Lv4 + 滿量表 → `startAwaken()` → step 400 | 一次解出 **5 條**：`first_ability` / `lv3` / `mix_first` / `awaken_first` / `lv4_any` |

成就頁：`achPages === 4`、`achList.length === 40`、標題「達成 20/40」、頁碼「1/4 ~ 4/4」、每列獎盃 + 中文名 + `09/12 19:11` + `CLEAR`／鎖頭、游標列金邊、詳情條已解鎖顯示 hint + 時間、未解鎖顯示 hint + 灰字 `LOCKED`。
截圖：`ach/gallery_p1.png` ~ `gallery_p4.png`、`gallery_detail_unlocked.png`、`gallery_detail_locked.png`。

### R8-2b. ach2 選單整合

- **TitleMenu**：`['new','extra','challenge','help','gallery','records','arena','saves','settings']`（空存檔所以沒有 `continue`）。
  `win === 7`；游標移到最後一項時 `sel=8 / top=2`，右側位置條與上方閃爍三角都有畫（`menu/title_scrolled.png`）。
- **入口開啟 / 返回**（每一項都截圖 `menu/open_<id>.png`）：

| 項目 | 開啟後 | 返回 |
|---|---|---|
| 挑戰模式 | `ChallengeScene` | SELECT → `TitleScene` ✓ |
| 操作說明 | TitleScene 內的說明疊層 | SELECT → 關閉 ✓ |
| 能力圖鑑 | `TitleMenu.sub` | Z/X → 關閉 ✓ |
| 成績板 | `RecordsScene` | SELECT → `TitleScene` ✓ |
| 競技場 | `ArenaScene` | SELECT → `TitleScene` ✓ |
| 存檔槽 | `SaveSelectScene` | START → `TitleScene` ✓（**淡出約 60~90 幀**，我第一次只等 50 幀誤判成卡住，不是 bug） |
| 設定 | `TitleMenu.sub` | SELECT → 關閉 ✓ |

- **SettingsMenu**：`['music','sfx','hints','scale','vfx','skin','keyconfig']`（7 項）。
  卡比配色 `tap right` → `KB.SKINS.current()` 由 `pink` → `yellow`、畫面文字由「櫻花粉」→「檸檬黃」✓（但沒有預覽 → R8-P1-01）。
  按鍵設定 `tap jump` → `sub` 開啟（暗底 + KeyConfigMenu，底部提示「START 返回設定」）→ `tap start` → `sub` 關閉 ✓。
  底部提示兩行「←→ 調整　Z 進入」「SELECT 返回　F 全螢幕」都完整可讀。
- 全程 **0 console error / 0 pageerror / 0 missing sprite**。

### R8-2c. awaken-mix（24 招）

24 張截圖逐張 Read，招名（中文 + 英文）、印記、letterbox、兩段 worldTint、專屬 VFX 全部正確，`awk_*.png` 檔名對應 `KB.AWAKEN.MIX_ORDER`：

| 招 | 中/英名 | 對迪迪迪 | 對威斯比 | 招後狀態 |
|---|---|---|---|---|
| flamesword | 炎帝百斬 PYREDGE | 21/60 = 35% | 6/40 | idle / gauge 0 |
| frostsword | 永凍劍界 CRYEDGE | 35% | 6/40 | ✓ |
| thunderblade | 雷神一閃 VOLTIAI | 35% | **0** | ✓ |
| flamegun | 煉獄輪舞 PYROGUN | 35% | 16/40 | ✓ |
| frostgun | 絕零彈幕 CRYOGUN | 35% | 14/40 | ✓ |
| thunderbow | 天雷千矢 VOLTBOW | 30% | 14/40 | ✓ |
| flamehammer | 隕炎天崩 MAGMAUL | 35% | 16/40 | ✓ |
| stonehammer | 大地終焉 GEOMAUL | 35% | 3~14（抖動） | ✓ |
| shadowblade | 千影刃陣 UMBRA | 35% | 12/40 | ✓ |
| starmage | 銀河創世 ASTRAL | 35% | **0** | ✓ |
| frostdragon | 冰龍神咆哮 CRYWYRM | 35% | 14/40 | ✓ |
| thundermech | 雷神兵器 VOLTMEK | 35% | **0** | ✓ |
| flamebow | 鳳凰流星 PYREBOW | 35% | 16/40 | ✓ |
| frosthammer | 冰河終焉 CRYMAUL | 35% | **0** | ✓ |
| thundersword | 雷帝百斬 VOLTEDG | 35% | **0** | ✓ |
| flameninja | 火遁・大焚天 PYRONIN | 35% | 16/40 | ✓ |
| frostninja | 冰遁・絕零陣 CRYONIN | 35% | 9/40 | ✓ |
| thundergun | 雷射死亡輪舞 VOLTGUN | 35% | 14/40 | ✓ |
| stonegiant | 山崩地裂 GOLEM | 35% | 12/40 | ✓ |
| flamedragon | 太陽龍神 PYRWYRM | 35% | 16/40 | ✓ |
| thunderdragon | 雷雲龍神 VOLWYRM | 35% | **0** | ✓ |
| timebeam | 時空崩壞 CHRONOS | 35% | **0** | ✓ |
| gravityblade | 刃之黑洞 GRAVEDG | 35% | **0** | ✓ |
| hammermech | 軌道終焉鎚 MEKMAUL | 35% | **0** | ✓ |

- **≤ 40% 全部達標**（最高就是 40%：`flamegun / flamehammer / flamebow / flameninja / flamedragon` 對威斯比 16/40，因為威斯比 `weak:['fire']` 火屬 ×2，畫面上有「弱點！」字樣）。
- 24 招招後一律 `KB.AWAKEN.active() === false`、`activeT === 0`、`gauge === 0`、`player.state === 'idle'`。
- 音效實測（hook `KB.audio.sfx`）：24 招**全部**播了 `mix_<mixkey>` 與 `awk_start` 與 `awk_<主成分>`（例：`flamesword → awk_fire`、`frostsword → awk_ice`、`thunderblade → awk_spark`），**0 個不在 `SFX_NAMES` 裡的名字**。

### R8-2d. saves-input

| 項目 | 做法 | 結果 |
|---|---|---|
| 3 槽獨立 | 槽 1/2/3 各寫 score 111/222/333 與不同 `cleared` | 逐槽 load 回來完全正確、互不影響 |
| 複製 | `copy(2,3)` | `true`；槽 3 的 score 變 222、槽 1 不動 |
| 複製空槽 | `erase(1)` 後 `copy(1,2)` | **`false`**（來源空槽拒絕）✓ |
| 刪除當前槽 | 目前在槽 3 → `erase(3)` | `isEmpty(3) === true`、`KB.save.score` 就地歸 0、`current()` 仍是 3 ✓ |
| 舊存檔遷移 | 只放 `kirbystar_save`（cleared w1/w2、score 12345、settings music 0.4）→ reload | 槽 1 拿到 `clears 2 / score 12345`、**舊檔仍在**（`kirbystar_save` 保留）、`globals().migrated === 1` + `migratedFrom === 'kirbystar_save'`、`settings.music === 0.4` 升級成全域；再 reload 不重搬（改寫 score 999 後 reload 仍是 999）✓ |
| 遊玩時間 | `playTime = 0` → 進 w1 r0 → step 200 | `playTime === 3`（200 幀 ≈ 3.3 秒）✓；`fmtTime(65) = 01:05`、`fmtTime(3725) = 1:02:05` |
| 改綁真的生效 | `bindings.keyboard.jump = ['KeyQ']` + `saveBindings()` → 進遊戲用 playwright 真的按下 `q` | `player.y` 145 → **107.24**（真的跳了）；`actionOf('KeyQ') === 'jump'`；reload 後 `jump` 仍是 `['KeyQ']` ✓ |
| 手把 | `buttonNames('jump')` / `buttonName(0)` / `rebindGamepad('jump',3)` | `['A','B']` / `'A'` / `[true, ['Y']]` ✓；表格「手把」欄顯示 ←→↑↓ / A/B / X/Y / L1/R1 / Start |

截圖：`saves/save_select.png`（空槽）、`save_select_filled.png`（通關 3/7、成就 2/40、時間 1:02:05、END 徽章）、`save_submenu.png` / `save_submenu_filled.png`、`save_delete_confirm.png`（預設停「取消」）、`keyconfig.png`、`keyconfig_listen2.png`（「請按下要綁定的按鍵…」）、`keyconfig_listen.png`（X 移除 → 「已移除 D」）。

### R8-2e. skins（12 配色）

| id | 名稱 | 解鎖條件（`unlockCond`） | 非 debug 初始 |
|---|---|---|---|
| pink | 櫻花粉 | 一開始就有 | 已解鎖 |
| yellow | 檸檬黃 | 成就「初次變身」：取得任何一種能力 | 鎖 |
| blue | 天空藍 | 通關 翠綠草原（W1） | 鎖 |
| green | 抹茶綠 | 成就「十連擊」 | 鎖 |
| red | 蘋果紅 | 成就「大王退治」 | 鎖 |
| white | 雪白 | 成就「密室探險家」：找到 5 個秘密房間 | 鎖 |
| purple | 葡萄紫 | 成就「能力收藏家」：發現 20 種能力 | 鎖 |
| orange | 蜜柑橘 | 成就「星星獵人」：收集 15 顆大星星 | 鎖 |
| black | 暗影黑 | 通關 星之彼端（W6） | 鎖 |
| gold | 黃金 | 成就「登峰造極」：把任一能力練到 Lv3 | 鎖 |
| mint | 薄荷 | 成就「競技場霸者」：在競技場打完 5 場魔王 | 鎖 |
| galaxy | 星河 | 通關 夢幻迴廊（W7） | 鎖 |

- 非 debug + 空存檔：`list()` 只回 `['pink']`；`set('galaxy')` 回 **`false`** 且 `current()` 不變 ✓。
- `PROG.unlock('first_ability')` 後 `unlocked('yellow') === true`、`set('yellow') === true`、`list()` 變成 `['pink','yellow']` ✓。
- `?debug=1` 時 12 種全解鎖 ✓。
- 12 色一次畫出來全部互相可辨識（`skins/sheet_12skins.png`）；HUD 臉 12 種都換得到。
- 實戰 3 種（`skins/game_gold.png` / `game_galaxy.png` / `game_black.png`）：卡比本體 + 右下 `ui_kirby_face` 都換色，帽子 / 武器 / 場景不動 ✓；左下能力圖示不換（R8-P2-03）。

### R8-2f. challenge

| 項目 | 證據 |
|---|---|
| 挑戰選單 | `ch/menu.png`（5 項 + 說明條 + 各自摘要「--:--」「0/7」「今日未挑戰」）、`menu_1~4.png`、`menu_world.png`、`menu_arena.png` |
| 時間攻擊 | `ch/time_hud.png` / `time_hud2.png`（`TIME` + `00:05.00`，300 幀 = 5.00 秒，計時正確）；死亡 → `lives` 9→**9**、`challenge.deaths` 1、仍在 `GameScene`（不回選關）✓ |
| 無傷 | `ch/nohit_hud.png`（`NOHIT` + 綠色 `CLEAN`）；`player.hurt(1,{})` → `ChallengeResultScene`「CHALLENGE FAILED / 被擊中！」、`無傷 FAILED`（`ch/nohit_fail.png`）✓ |
| 挑戰塔 | seed 1 的 10 層計畫（w1→w6 遞增、第 5 層克拉寇 / 第 10 層迪迪迪、每層 1~2 個修飾）；`towerPlan(1,10)` 兩次呼叫完全相同、`towerPlan(2,10)` 不同 ✓；`ch/tower_f1.png`（鏡像：卡比在右、敵人在左）、`tower_f5.png`（一擊必殺：HP 只剩 1 格 + 克拉寇）、`tower_f10.png`（隨機能力 → BLADE 居合 + 迪迪迪）、`tower_timed.png`（時限：HUD `01:28.50` 倒數） |
| 修飾條件 | `MOD_LIST` 8 種名稱全對：疾走 / 一擊必殺 / 隨機能力 / 封印之口 / 鏡像 / 黑暗 / 倍化 / 時限 |
| 每日 | `dateKey() === '20260912'`、`dailyPlan()` 固定 `[疾走] [鏡像,黑暗] [一擊必殺+魔王]`、`ch/daily_f1.png`（`D 1/3` + `S60912`）；寫過紀錄後 `dailyRecord()` 讀得回來、選單顯示不再是「今日未挑戰」 |
| Boss Rush 變體 | `ARENA_OPTS` = normal / extra / all7 / extra_all7；`ch/arena_extra_pick.png`（EXTRA 徽章 + 「生命 1 連戰 6 名魔王」+「Extra 變體：魔王開場即二階段」）、`ch/arena_all7.png`（EXTRA + ALL 7 + 連戰 **7** 名）；`from:'challenge'` → SELECT 回 `ChallengeScene`，無 `from` → 回 `TitleScene` ✓ |
| 成績板挑戰頁 | `ch/records_challenge.png`（第 **9/9** 頁「挑戰」：各世界時間攻擊 / 無傷 / 無傷最短；挑戰塔最高層 / 最佳 / 通關次數；Boss Rush 變體；每日最近 7 天，今天是黃字 `12`，我注入的 `2F` 顯示在下面） |
| 不汙染一般進度 | 塔第 10 層打死迪迪迪後 `KB.save.cleared` 仍是 `[]` ✓ |
| 音樂速度 | 塔第 7 層 `getTempoMul() === 1.2`；離開挑戰（回標題）自動變回 **1.0** ✓ |

## R8-3. 測試與 playthrough

```
engine_test          118/118 PASS          test_awaken      189/189 PASS
enemy_test           393/393 PASS          test_challenge    93/93  PASS
boss_test            ALL PASS (31s)        test_charge       19/19  PASS
boss_test --extra    ALL PASS (6s)         test_elements     96/96  PASS
enemy_test --extra   ✗ 不支援此參數         test_extra        53/53  PASS
level_check          0 error / 1 warn      test_forms       153/153 PASS
level_check --extra  0 error / 1 warn      test_helper      131/131 PASS
audio_check          全部通過（151 sfx     test_magic       119/119 PASS
                     / 40 music / 4 amb）  test_mix         245/245 PASS
                                           test_mix2        343/343 PASS
                                           test_progression 101/101 PASS
                                           test_saves        67/67  PASS
                                           test_skins        67/67  PASS
                                           test_weapons     105/105 PASS
```

playthrough（`--ability sword --godmode`）：

| 世界 | 幀數 | 房間 | deaths | cleared | bossDamage | missing |
|---|---|---|---|---|---|---|
| w1 | 5835 | 0~3 | 0 | ✓ | 100% (40/40) | [] |
| w2 | 10859 | 0~4 | 0 | ✓ | 100% (30/30) | [] |
| w3 | 7213 | 0~4 | 0 | ✓ | 100% (40/40) | [] |
| w4 | 6415 | 0~4 | 0 | ✓ | 100% (55/55) | [] |
| w5 | 8623 | 0~5 | 0 | ✓ | 100% (60/60) | [] |
| w6 | 8624 | 0~5 | 0 | ✓ | 100% (70/70) | [] |
| w7 | 9213 | 0~4 | 0 | ✓ | 100% (50/50) | [] |
| tower（`--challenge tower --seed 1 --until-floor 3`） | 3566 | floors [1,2,3] | 0 | ✓ | — | [] |

## R8-4. 效能（`shots/agent_qa8/t12_perf.py`，每個情境 300 幀 ×3 輪取最佳，含 render）

| 情境 | 3 輪 (ms) | 最佳 | ms/幀 | 實體 / 夥伴 |
|---|---|---|---|---|
| baseline w1 r0（粉紅・空手） | 179.6 / 114.4 / 76.1 | 76.1 | **0.254** | 45 / 0 |
| galaxy 配色 + sword + 8 敵人 | 166.4 / 133.4 / 85.0 | 85.0 | **0.283** | 53 / 0 |
| 雙夥伴 + galaxy 配色 + 8 敵人 | 249.3 / 193.5 / 133.9 | 133.9 | **0.446** | 55 / 2 |
| **雙夥伴 + 覺醒混合招(hammermech) + galaxy 配色 + 10 敵人** | **302.7** / 131.2 / 117.4 | 117.4 | **0.391**（含覺醒演出那輪 **1.009**） | 51 / 2 |

16.7 ms 的幀預算只用掉 **1.5% ~ 6%**，配色的重著色是懶生成 + 快取，對幀時間沒有可測影響（+0.03 ms/幀，在雜訊範圍內）。

## R8-5. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python
# 成就：40 條定義 / debug 不自動解鎖
$PY shots/agent_qa8/t1_ach.py
# 成就：w5 魔王 60% 誤觸發 + 換槽 backfill 靜默
$PY shots/agent_qa8/t2_achreg.py
# 成就頁 4 頁截圖
$PY shots/agent_qa8/t3_achpage.py
# 24 招覺醒混合招（截圖 + 對威斯比傷害）
$PY shots/agent_qa8/t4_awakenmix.py
# 24 招對迪迪迪（對照組，全 35%）
$PY shots/agent_qa8/t4d_boss2.py w5 5
# R8-P1-02 重複取樣（flamesword 6,6,6,6 / hammermech 0,0,0,0）
$PY shots/agent_qa8/t17_whispyrep.py
# 存檔槽 / 遷移 / 按鍵重映射
$PY shots/agent_qa8/t5_saves.py ; $PY shots/agent_qa8/t5b_migrate.py
$PY shots/agent_qa8/t6_keyconfig.py ; $PY shots/agent_qa8/t6b_saveui.py
# 12 配色
$PY shots/agent_qa8/t7_skins.py ; $PY shots/agent_qa8/t14_preview.py
# 選單整合 / 逐項開關
$PY shots/agent_qa8/t8_menu.py ; $PY shots/agent_qa8/t8b_menuflow.py ; $PY shots/agent_qa8/t8c_saveback.py
# 挑戰模式
$PY shots/agent_qa8/t9_challenge.py ; $PY shots/agent_qa8/t10_tower.py
$PY shots/agent_qa8/t11_chmisc.py ; $PY shots/agent_qa8/t16_timed.py
# 覺醒音效實機呼叫
$PY shots/agent_qa8/t13_sfxcall.py
# 跨系統（挑戰不寫 cleared / backfill 範圍）
$PY shots/agent_qa8/t15_cross.py
# 效能
$PY shots/agent_qa8/t12_perf.py
# 全套測試（log 在 shots/agent_qa8/tests/）
bash -c 'for t in engine_test enemy_test boss_test test_awaken test_challenge test_charge test_elements \
  test_extra test_forms test_helper test_magic test_mix test_mix2 test_progression test_saves test_skins \
  test_weapons; do $PY tools/$t.py; done'
$PY tools/boss_test.py --extra ; node tools/level_check.js ; node tools/level_check.js --extra ; node tools/audio_check.js
for w in w1 w2 w3 w4 w5 w6 w7; do $PY tools/playthrough.py --level $w --ability sword --godmode; done
$PY tools/playthrough.py --challenge tower --seed 1 --godmode --until-floor 3
```

### 截圖索引（`shots/agent_qa8/`）

- **成就**：`ach/gallery_p1~p4.png`、`gallery_detail_unlocked|locked.png`、`w5_boss_60pct.png`、`slot_switch_ingame.png`
- **覺醒混合招**：`awaken/awk_<24 個 mixkey>.png`、`awaken/_crop_frosthammer.png`
- **存檔 / 按鍵**：`saves/save_select.png`、`save_select_filled.png`、`save_submenu(_filled).png`、`save_delete_confirm.png`、`keyconfig.png`、`keyconfig_listen.png`、`keyconfig_listen2.png`、`keyconfig_restore.png`
- **配色**：`skins/sheet_12skins.png`、`game_pink|gold|galaxy|black.png`、`gallery_preview_galaxy.png`、`pause_preview_galaxy.png`、`arena_preview_galaxy.png`
- **選單**：`menu/title_top.png`、`title_scrolled.png`、`settings.png`、`settings_skin.png`、`settings_skin_cycled.png`、`settings_keyconfig_sub.png`、`settings_after_back.png`、`open_<7 個入口>.png`
- **挑戰**：`ch/menu.png`、`menu_1~4.png`、`menu_world.png`、`menu_arena.png`、`time_hud(2).png`、`nohit_hud.png`、`nohit_fail.png`、`tower_f1|f5|f10(.b).png`、`tower_timed.png`、`daily_f1.png`、`arena_extra_pick.png`、`arena_all7.png`、`records_challenge.png`、`_crop_all7_badge.png`、`_crop_failtitle.png`
- **效能**：`perf/skin.png`、`helper2_skin.png`、`all.png`
- **原始數據 / log**：`t4_awakenmix.json`、`t4b_range.json`、`t8b.json`、`t10.json`、`t13.json`、`tests/*.log`、`tests_summary.txt`、`playthrough_summary.txt`

---

# Round 9 驗收（qa9 · 2026-09-15）

> 範圍：player-input（↑ 長按飛行、漂浮中出招、空中出招保持下墜、招式後自動回飛行、`p.atkDir` / `p.dirHold`）、
> abilities-basic（12 基本 / 武器）、abilities-magic-forms（8）、abilities-mix（24 混合）—— **44 能力 × 5 招**、
> 以及 UI（暫停能力卡 / 圖鑑 / 操作說明 / 16px 字集）與全套測試 / 通關 / 效能。
> 所有截圖在 `shots/agent_qa9/`，**44 張能力矩陣蒙太奇與所有飛行 / UI 截圖都用 Read 工具實際看過**。
> src 全程唯讀，只寫本檔、`docs/PROGRESS.md` 的 `## qa9` 區段與 `shots/agent_qa9/`。

## R9-0. 結論

| 項目 | 結果 | 備註 |
|---|---|---|
| **飛行手感（↑ 長按）** | **OK（2 個問題）** | 地面按住 ↑ 第 **4 幀**進 `float`（`vy=-1.6`），完全符合 `KB.PHYS.flyHoldGround=4`；**門口優先**（站在 w1 r0 的門上按 ↑ → `state='door'`，連按住 14 幀都不會起飛）；**梯子優先**（w2 r1 梯子上按 ↑ → `state='climb'`，每幀 −1px 往上爬）；空中（jump / fall）按 ↑ **當幀**就 `float`；漂浮中按住 ↑ 每 9 幀自動拍動一次，y **單調遞減**（60 幀上升 68px，`vy` 在 −1.6 → −1.06 之間鋸齒）；放開 ↑ 後 5 幀內 `vy` 由 −1.06 轉正開始下降；實心天花板下 y 夾在 352、`vy=0.2` 反覆微彈；水中（`state='swim'`）與含物（`state='full'`）按住 ↑ 14 幀完全不起飛。**但龍化地面按 ↑ 不飛 → R9-P1-01；開放天空可無限飛出畫面 → R9-P1-02** |
| **空中出招** | **OK（1 個問題）** | 漂浮中按 X：**有能力 → 直接 `startAttack`**（`hb=1`、不進 `exhale`、`exhaleLockT=0`），**無能力 → `exhale`**，無能力 + ↓X → 維持 `float` 不吐氣，有能力 + ↓X → 照樣出招；空中 X / ↑X / ↓X **44 能力全部出得來**且出招期間 y 遞增（淨下墜 6~56px，見 R9-2c）；招式結束時 ↑ 仍按著 → 自動回 `float`（sword / fire / flamesword / mage 四種路徑都驗過），放開 ↑ 則停在 `fall` / `idle` 不會亂飛；覺醒（地面 / 空中 / 混合能力）、時停（`timeStopT=179` 且敵人座標 50 幀不動、時停中 X 變 `punch`）、滑鏟 ↓+跳、單向平台 ↓+跳穿下、梯子上 X 吐氣彈、水中 **全部未壞**。**但漂浮中跳+攻不會覺醒 → R9-P2-01** |
| **44 能力 × 7 招矩陣** | **44 / 44 OK** | 每能力拍 X / ↑X / ↓X / 空中X / 蓄力 / 空中↑X / 空中↓X 共 7 招 × 3 連拍 = 21 張，合成 7×3 蒙太奇逐張 Read。動畫幀齊全且七招互不相同、判定框位置與招名相符、特效（VFX / textPop / 粒子）都有、**0 洋紅像素**、`__kb.missing()` **全空**、**0 console error**、招後全部回 `idle` / `fall`（石頭維持 `stone` 是設計）、160 幀後**無殘留判定框 / 投射物 / VFX** |
| **44 能力招式表** | **OK（1 個例外）** | 44 種都符合 X → ↑+X → ↓+X → 空中 X → 蓄力 的固定順序、≤ 6 列、鍵位標籤與招名皆不重複、`desc` 都在。**ghost 多一列「穿牆中 ↑↓」使 ↑ / ↓ 各出現 2 次 → R9-P2-03**（內容正確，只是不合 `run_move_table` 的規則） |
| **UI** | **OK（2 個問題）** | 暫停能力卡 4 / 5 / 6 列（fire 4、ghost 5、stone 6、mech 6、giant 6、flamesword 5、hammermech 5…）排版全部沒有溢出、六列時自動不畫風味文字；能力圖鑑 **44/44 發現、6 頁**、詳情頁完整顯示五招表、0 missing / 0 error；操作說明 **2 頁**（第 1 頁 10 列，含「跳躍（空中再按＝飛行）」「按住 ↑ ／ 持續飛行（可一直上升）」「↑X / ↓X ／ 空中也能出招」；第 2 頁 10 列，含「按住 ↑ ／ 漂浮飛行（連按跳亦可）」「空中 X ／ 空中也能出招 ↑X／↓X」），無重疊無截斷。**但武器四能力的風味文字只畫出一個字 → R9-P2-02；說明沒寫「4 幀」與「門 / 梯不起飛」→ R9-P2-05** |
| **16px 標題字缺字** | **OK（0 缺字）** | `KB.FONTS.loaded = {px12:true, px16:true}`、`zh = {px12:true, px16:true}`、`TEXT_CFG.pixelMap = [[13,'px12',12],[999,'px16',16]]`、`boldFrom16 = 16`。用 `KB.fontHasAll({key:'px16',…}, s)` 掃 **639 串**（44 能力的 name / hudName / desc / 5 招標籤與招名 / flavour ＋ 7 世界與所有房名 ＋ HELP / HELP2 ＋ 覺醒招名 ＋ 40 成就）→ **badN = 0、缺字清單為空**；`tools/font_subset.py --check` 也回「src 用到的字全部都在子集裡」（1848 字 / 非 ASCII 1753）。總控重做的子集已涵蓋本輪新字（怨愣枷鑽捶…） |
| **全套測試** | **全綠** | engine **153/153**、enemy **393/393**、boss `--runs 3` **ALL PASS**（含 kracko fight 3/3，本輪沒有出現已知的 2/3 WARN）、weapons **370/370**、charge **115/115**、magic **192/192**、forms **226/226**、mix **509/509**、mix2 **607/607**、helper **131/131**、awaken **237/237**、elements **96/96**、progression **101/101**、extra **53/53**、challenge **93/93**、saves **67/67**、skins **67/67**、`level_check`（含 `--extra`）**0 error / 1 warning**、`audio_check` 全部通過。全部 exit 0，數字與各 agent 交件時完全一致 |
| **playthrough** | **OK** | w1~w7 **7 個世界全部 `cleared=True` / `deaths=0` / `missing []` / `bossDamage=100%`**；幀數 5835 / 7294 / 7468 / 6749 / 8452 / 8304 / 9578。機器人進門只按 3 幀（< 4 幀門檻）且門口一律不起飛，**沒有任何一關被新的飛行卡住** |
| **效能** | **OK（大量餘裕）** | 「按住 ↑ 飛行 + 每 6 幀放一次空中招」連續 **300 幀**：sword 0.56 / flamegun 0.57 / flamebow 0.57 / starmage 0.41 / mech 0.44 / hammermech **0.36 ms/幀**（純 step 基準 0.31~0.34 ms/幀），最重的 flamebow 用掉 16.7ms 預算的 **3.4%**；峰值實體 45→67、判定框 ≤5、投射物 ≤3，180 幀後**全部回到基準值（hb / proj / vfx 皆 0）**、JS heap 16~18MB 無成長 |

問題統計：**P0 × 0、P1 × 2、P2 × 7**（其中 P2-02 / P2-07 是既有問題，非本輪造成）。沒有任何一項阻擋出貨。

## R9-1. 問題列表

| 編號 | 等級 | 位置 | 現象 | 重現 | 截圖 / 數據 | 建議負責人 |
|---|---|---|---|---|---|---|
| **R9-P1-01** | P1 | `src/abilities_forms.js` dragon `formUpdate`（`if (p.onGround) { if (p.vy > 0) p.vy = 0; return false; }`）＋ `src/player.js` `canFloatNow()`（`form.fly` 一律回 false） | **龍化在地面按住 ↑ 完全不會起飛**。按住 ↑ 連續 40 幀，`y` 恆為 145、`state` 恆為 `idle`、`flyHoldT` 一路數到 40 也沒有反應；必須先按一次跳離地，之後按住 ↑ 才會拍翅上升（離地後 40 幀 y 129.7 → 58.9，正常）。原因是 `form.fly` 讓 `canFloatNow()` 回 false（player 不接手），而 dragon 自己的 `formUpdate` 在 `p.onGround` 時直接 `return false`，只有離地後才讀 `p.dirHold.up`。Round 9 的使用者需求是「一直按 ↑ = 一直按跳」，44 種能力裡只有龍化做不到，手感斷層最明顯。**mech 是另一種不一致**：mech 沒有 `form.fly`，按住 ↑ 走的是**一般漂浮**（40 幀 145 → 97.7），比按住跳的噴射跳（145 → 40.8）弱一倍多，同一顆鍵在同一個變身上有兩種上升速度。 | `shots/agent_qa9/fly.py` 的 F10：`goto game w1 r0 ability=dragon` → step 120（等變身完成）→ 把卡比擺在 (200,145) → 連續 40 幀 `press {up:true}` → 讀 `state` / `y`；對照組改按 `jump` | `fly.json` 的 `F10_dragon_up`（8 個取樣點全部 `idle` / y=145）、`F10_dragon_minY = 145` vs `F10_dragon_jump_minY = 66.94`、`F10_mech_minY = 97.72` vs `F10_mech_jump_minY = 40.75`；截圖 `fly/f10_dragon.png`、`f10_dragon_airup.png`、`f10_mech.png` | **magic-forms**：dragon 的 `formUpdate` 在 `p.onGround` 時，若 `KB.input.down('jump') \|\| p.dirHold.up` 就給一個起飛初速（等同 `doJump`）再往下走；mech 則建議「漂浮中也加噴射」或「↑ 直接走噴射跳」二選一，讓同一顆鍵只有一種上升速度 |
| **R9-P1-02** | P1 | `src/player.js` `updateFloat()` / `physics()`（沒有房間上緣夾制） | **在沒有天花板的房間（w1 r0 這種開放天空）按住 ↑ 可以無限上升，一路飛出畫面外、卡比完全消失**。從地面起飛後按住 ↑ 200 幀，`y` 一路跑到 **−120**（地圖高度只有 192px，等於在地圖頂端上方 120px），`KB.game.cam.y` 夾在 0 不再跟，畫面上**看不到任何卡比**（`f7d_offscreen.png` 整張圖只有背景與敵人）；放開 ↑ 後要 240 幀才落回 y=65。這在 Round 9 之前需要玩家連續狂點跳鍵才辦得到，現在只要把 ↑ 按著不放就會自動發生，踩到的機率高很多。實心天花板的房間（w2 r1）則完全正常（y 夾在 352、`vy=0.2`）。**gravity 的 ↑X「浮空 240 幀」同源**：在同一個房間放這招，160 幀後 y=3.69 仍在空中往上飄。 | `shots/agent_qa9/fly3.py`：`goto game w1 r0` → 擺在 (200,145) → `tap jump 2` → 連續 180 幀 `press {up:true}` → 讀 `y` / `cam.y` 並截圖 | `fly2.json` 的 `F7_minY = -120.3`、`F7_mapTopY = {rows:12, h:192}`；`fly3.json` 的 `sky_state = {s:'float', y:-99.08, cam:0}`；截圖 **`fly/f7d_offscreen.png`**（畫面上沒有卡比）、`fly/f7d_offscreen_after.png`、對照 `fly/f7c_solid_ceiling.png` | **player**：在 `updateFloat` / `afterPhysics` 加一道「`y` 不低於 `-(KB.VIEW_H - 房間高度)` 或直接不低於 `-8`」的夾制（碰到就比照天花板 `vy = 0.2`），或讓相機在卡比高於房間頂端時跟著往上（兩者擇一即可） |
| **R9-P2-01** | P2 | `src/player.js` `updateFloat()`（沒有呼叫 `KB.AWAKEN.tryTrigger`） | **漂浮中按「跳＋攻擊」不會發動覺醒，會變成普通招式**。Lv4 + 量表 100 的 sword，站在地上按跳+攻 → `AWAKEN.active() = true`、招名「百斬星光劍」；跳起來（`state='jump'`）按跳+攻 → 也正常發動；但先按住 ↑ 進 `float` 再按跳+攻 → `state` 變 `attack`、`AWAKEN.active() = false`、`moveName` 為空，量表白白留著。`tryTrigger` 只掛在 player.js 的一般分支（L259）與 `updateAttack`（L625），`updateFloat` 整段都沒掛。這條在 Round 9 之前就存在，但那時「漂浮」是要連點跳才進得去的短暫狀態；Round 9 把「按住 ↑」變成主要飛行方式之後，玩家有很大比例的時間都待在 `float`，在空中想開大絕會直接落空。 | `shots/agent_qa9/air2.py` 的 A5c：`ability=sword` → `abilityLv=4` + `AWAKEN.add(100)` → `tap jump 2` → 按住 ↑ 8 幀（進 float）→ `press {jump:true, attack:true}` 1 幀 → 讀 `AWAKEN.active()` | `air2.json` 的 `A5c_float = {state:'attack', active:false, move:'', ready:true}`，對照 `A5_trigger` / `A5b_air` 皆 `active:true`；截圖 `air/a5_awaken.png`、`a5_awaken_mid.png`、`a5b_air_awaken.png` | **player**：`updateFloat()` 開頭（在 `pressed('jump')` 的拍動判斷之前）補一行 `if (KB.AWAKEN && KB.AWAKEN.tryTrigger && KB.AWAKEN.tryTrigger(this)) return;` |
| **R9-P2-02** | P2 | `src/abilities_weapons.js` L142 / L322 / L470 / L706（`flavour` 寫成字串）＋ `src/menu.js` L127 `(info.flavour \|\| []).slice(0, flN)`、L365 `(info.flavour \|\| [])[0]` | **gunner / ninja / blade / bow 四種能力的暫停卡與圖鑑，風味文字只畫出一個字**。它們的 `def.flavour` 是**字串**（`'彈匣裡裝的是勇氣，退膛的是恐懼。'`）而不是陣列，`UI.abilityInfo()` 優先採用 `d.flavour`，menu.js 再對它做 `.slice(0, 1)` / `[0]` —— 對字串就是取**第一個字元**。實拍結果：槍手卡片上只有「**彈**」、居合只有「**刀**」、忍者「**影**」、弓「**風**」，看起來像是文字被截斷的 bug。其餘 40 種（8 基本用 menu.js 的 `ABILITY_HELP` 備援、mage 系是陣列、24 混合在 `abilities_mix2.js` L235 會 `Array.isArray ? … : [String(…)]` 正規化）都正常。CLAUDE.md 明寫「def 需含 `moves / desc / flavour(陣列)`」，這四個是既有的違規（Round 5 起），非本輪造成。 | `goto game w1 r0 ability=gunner` → step 200 → `tap start 2` → 截圖；或 `KB.UI.abilityInfo('gunner').flavour` → 回傳 string 而非 array | **`ui/card_gunner.png`**（名稱下方只有「彈」）、`ui/card_blade.png`（「刀」）、`ui/card_ninja.png`、`ui/card_bow.png`，對照 `ui/card_fire.png`（完整兩句）、`ui/card_hammermech.png`（完整一句）；`ui.json` 的 `flavour_nonarray = ['gunner','ninja','blade','bow']` | **abilities-basic**：把這四行改成陣列（一句就 `['…']`）；或 **ui-menu** 在 `UI.abilityInfo` 加 `Array.isArray(f) ? f : [String(f)]` 的正規化（兩邊都做最保險） |
| **R9-P2-03** | P2 | `src/abilities_forms.js` ghost 的 `moves`（多一列 `['穿牆中 ↑↓', '上下飄浮']`） | **ghost 的招式表裡 ↑ / ↓ 各出現 2 次**，不符合 `tools/test_charge.py` `run_move_table()` 的「恰有一列 ↑+X」「恰有一列 ↓+X」規則。實際內容與排版都正確（5 列、暫停卡放得下、前 4 列順序是 X → ↑+X → ↓+X → 空中 X），只是第 5 列的說明文字裡帶了箭頭符號。目前 `test_charge.py` 只對 `BASIC_KEYS + WEAPON_KEYS` 跑 `run_move_table`，所以 115/115 全綠也驗不出來；我把同一套規則套到 44 種上時，只有 ghost 這一種不合。 | `.venv/bin/python -c` 讀 `KB.ABILITIES.ghost.moves` 的鍵位標籤；或把 `run_move_table(h, ['ghost'])` 加進 test_charge | `shots/agent_qa9/abilities.json` 的 ghost 條目；截圖 `ui/card_ghost.png` | **magic-forms**：把第 5 列的標籤改成不含箭頭（例如「穿牆中方向鍵 / 上下飄浮」）；或 **總控**把 `run_move_table` 的規則改成只看**前 4 列**，並把 44 種全部納入檢查 |
| **R9-P2-04** | P2 | `src/player.js` `updateSwim()`（只讀 `jump` 與 `down`，完全不讀 `up`） | **水中按住 ↑ 沒有任何作用，卡比照樣往下沉**。在 w1 r0 的水域按住 ↑ 20 幀，`state` 維持 `swim`、`y` 從 148.2 一路掉到 161（沉到底），`flyHoldT` 數到 17 也沒反應；要上浮只能按跳（按跳 1 次 `vy = -2.12`，6 幀升 9px）。`canFloatNow()` 擋掉水中起飛是**正確的**（規格如此，也符合「水中不起飛」的驗收項），但 Round 9 把 ↑ 定義成「上升 / 飛行」之後，唯獨水裡 ↑ 完全沒反應，會讓玩家以為卡住了。 | `shots/agent_qa9/fly2.py` 的 F11：`goto game w1 r0` → 擺在 (848,146)（w1 r0 的水域，tile 50~57 / row 9~10）→ 連續 20 幀 `press {up:true}` → 讀 `y`；再按 `jump` 對照 | `fly2.json` 的 `F11_water_up`（y 148.9 → 161，全程 `swim`）與 `F11_water_jump`（y 158.9 → 149.5）；截圖 `fly/f8_water.png` | **player**：`updateSwim()` 裡把 `inp.down('up')` 當成上浮輸入（例如 `this.vy -= 0.1`，與現有 `inp.down('down')` 的 `+0.1` 對稱），不需要動 `canFloatNow()` |
| **R9-P2-05** | P2 | `src/ui.js` `UI.HELP2` 第 4 列（`['按住 ↑', '漂浮飛行（連按跳亦可）']`） | **操作說明沒有寫出「地面要按住 4 幀」與「門口 / 梯子上不會起飛」**。player-input 在 `KB.input.HELP2_ADD` 準備的字串是 `['按住 ↑', '地面按住 4 幀也會起飛']`，但併進 `UI.HELP2` 時被換成了「漂浮飛行（連按跳亦可）」——「連按跳亦可」是既有操作的重述，真正的新規則（4 幀門檻、門 / 梯優先）兩頁都查不到。玩家站在門口按著 ↑ 沒飛起來時，說明頁給不出答案。第 1 頁的「按住 ↑ ／ 持續飛行（可一直上升）」同樣沒提門檻。 | `KB.setScene(new KB.TitleScene())` → `KB.UI.helpPage = 1` → 截圖；或直接讀 `KB.UI.HELP2` 與 `KB.input.HELP2_ADD` 比對 | **`ui/help_p1.png`**（第 4 列）、`ui/help_p0.png`；`ui.json` 的 `HELP2` / `HELP2_ADD` | **ui**：第 2 頁那列改回 `['按住 ↑', '地面按住 4 幀起飛']`，再補一列 `['門口 / 梯子', '按 ↑ 是進門 / 爬梯']`（`UI.HELP2` 目前 10 列，`drawHelp` 的行距會自動收） |
| **R9-P2-06** | P2 | `src/abilities_magic.js` gravity 的 ↑+X「浮空」（`p.abilityDef.hover = true` 期間） | **重力的 ↑+X 浮空在開放天空房會把卡比一路推出畫面**。在 w1 r0 空中放這招，30 幀內 y 由 105 升到 71，160 幀後 y = **3.69** 且 `onGround = false`（已經貼到地圖頂端），期間玩家對高度沒有控制權。這是 `def.hover` 的設計（240 幀反重力），單獨看沒錯，但和 R9-P1-02 疊在一起就會直接飛出視野。若 P1-02 補上高度夾制，這條會一併解決；若不補，建議這招自己限制上升上限。 | `shots/agent_qa9/matrix.py --only gravity`：跳起 → `press {up:true, attack:true}` 2 幀 → 讀 30 幀 y 曲線與 160 幀後的 `post` | `matrix.json` 的 `gravity.moves.aux`（`curve` y 86.4 → 71.0、`post = {s:'fall', y:3.69, og:false}`）；蒙太奇 `matrix/gravity.png` 第 6 列 | **player**（高度夾制，優先）或 **magic-forms**（`flip` 模式加 `y` 下限） |
| **R9-P2-07** | P2 | `src/player.js` `ladderPuff()`（`solid: true` 的吐氣彈生在 `cx + dir*10`）＋ 關卡地形 | **貼牆的梯子上按 X，吐氣彈在生成的當幀就撞牆消失**。w2 r1（螺旋塔）的梯子右側緊鄰 `#` 牆，按 X 時 `ladderAtkT` 有正常設成 14（代表 `ladderPuff()` 真的被呼叫），但 `KB.game.entities` 裡的 `proj` 數量**下一幀就是 0**——投射物 `solid:true` 在出生點就判定撞牆而 `dead`，玩家只聽得到音效、看不到彈。同一個動作在 w2 r0（x=529）與 w2 r3（x=465）的開放式梯子上完全正常（`proj = 1`，狀態維持 `climb`）。`git diff a43b5c8 HEAD -- src/player.js` 顯示梯子相關程式碼本輪**一行都沒改**，是既有的地形相依問題。 | `goto game w2 r1 ability=fire` → 把卡比擺到梯子 (321,336) → 按住 ↑ 6 幀進 `climb` → `press {attack:true}` 1 幀 → 讀 `ladderAtkT`（=14）與 `proj`（=0）；對照 w2 r0 / r3 | `shots/agent_qa9/air/a9_ladder_w20.png`（w2 r0，正常）、`a9_ladder_w23.png`（w2 r3，正常）、`a9_ladder_attack.png`（w2 r1，看不到彈） | **player**：`ladderPuff()` 的出生點改成 `cx + dir*4`（貼身）或加 `pierce`/先檢查前方一格是否為實心，撞牆時至少播一次 `fx_poof` |

### 觀察（不列入問題）

- **招式落地後只要 ↑ 還按著就會立刻再起飛**：空中 ↑X 出招 → 落地 → 招式結束 → `flyHoldT` 已經 ≥ 4 → 下一幀直接 `startFloat()`（實測 `A4_sword` 在 fh=24 時 `state='float'` 且 `onGround=true`）。這是「地面按住 ↑ 4 幀起飛」的必然結果、也符合「一路飛一路出招」的設計意圖，但玩家若想「落地後站著連段」就必須放開 ↑。規格沒說要抑制，維持現狀。
- **`def.hover` 的粒度**：magic-forms 用「在 `onAttack` 內改寫 `p.abilityDef.hover`」來做逐招懸停（只有 gravity ↑X 用），能 work 但是 side-effect。他們自己在 PROGRESS「跨檔需求 1」已提出改成 `p.hoverT` 的建議，我確認現況沒有殘留（招後 `hover` 有關掉，其他招在空中都正常下墜）。
- **ghost 的空中三招不下墜是設計**：`noclip`（穿牆）期間 `onGround` 幾乎恆為 false 且無重力，所以 `air` / `adx` 的 y 曲線是平的。我照 magic-forms 交代的前提（先關穿牆再測空中招）複驗過，關掉穿牆後會正常下墜。
- **44 能力空中三招的淨下墜量**：最小 6.0px（giant 空中X 屁股墜落，因為起手就幾乎貼地）、最大 56.1px（mech 空中↓X 鑽頭），中位數約 22px。只有 gravity `aux`（−18.7，浮空）與 ghost（0 / −28.8，穿牆）是負值，兩者都是文件化的例外。
- **蓄力那一列有 11 種是空的**（fire / cutter / ice / stone 之外的 time / gravity / clone / giant / dragon / ghost 等），因為它們的招式表本來就沒有「按住 n 幀放開」這一列（改成被動 / 限時 / 再按 X 解除）。連拍看到的是普通攻擊或站立，**不是漏招**。
- **kracko `fight` 這次是 3/3 全勝**（過往記錄的已知 WARN 是 2/3）。RNG 序列問題，不代表已修好。
- `p.atkDir` 快照在所有情境下都正確：地面 X = `[false,false,false]`、↑X = `[true,false,false]`、空中 ↑X = `[true,false,true]`、漂浮中 X = `[false,false,true]`、漂浮中 ↓X = `[false,true,true]`。
- 我一開始用「改寫 `e.update` / `e.grav` / `e.hp=40`」的方式做傷害驗證會全部得到 0 傷害（是 harness 的問題，不是招式的問題）；改用預設的 `KB.ENEMIES.waddledee` 就正常。**招式命中與否請以 `tools/test_weapons.py` / `test_magic.py` / `test_forms.py` / `test_mix.py` / `test_mix2.py` 的「kills waddledee」為準**，我只對「連拍沒抓到判定框」的 16 組做了獨立複驗（見 `dmg.json`，16/16 都有效果；其中 `time` X 時間停止與 `ghost` X 穿牆開關本來就不造成傷害）。

## R9-2. 各系統驗收明細

### R9-2a. 飛行手感（`shots/agent_qa9/fly.py` / `fly2.py` / `fly3.py` / `fly4.py`）

| # | 驗收項 | 結果 | 實測數據 |
|---|---|---|---|
| F1 | 地面按住 ↑ 4 幀起飛 | **PASS** | `flyHoldT` 1/2/3 → `idle`；**第 4 幀** → `state='float'`、`vy=-1.6`；第 5 幀起離地，y 145 → 136.7（10 幀）。截圖 `fly/f1_seq_00~05.png` |
| F2 | 門口按 ↑ 進門、不起飛 | **PASS** | 站在 w1 r0 的門上（`doorAt = true`）按住 ↑ **14 幀**：`state` 全程 `door`、`y` 恆 145、`flyHoldT` 數到 14 也沒起飛。截圖 `fly/f2_door.png` |
| F3 | 梯子上按 ↑ 爬梯 | **PASS** | w2 r1 梯子 (321,336)：按住 ↑ 12 幀 → `state='climb'`、y 每幀 −1（336.2 → 325.2）、`onGround=false`。截圖 `fly/f3_ladder.png`、`f3_seq_00~03.png` |
| F4 | 空中按住 ↑ 即時漂浮 | **PASS** | `state='jump'`（y 132.96）→ 按 ↑ **第 1 幀**就 `float`、`vy=-1.6`。截圖 `fly/f4_airfloat.png` |
| F5 | 漂浮中按住 ↑ 持續上升 | **PASS** | 60 幀連拍 y 單調遞減 130.3 → 62.6（**68px**），`flyFlapT` 每數到 9 就重置且 `vy` 跳回 −1.54（= 自動拍動），中間 `vy` 線性衰減 −1.54 → −1.06。截圖 `fly/f5_rise_00~09.png` |
| F6 | 放開 ↑ 下降 | **PASS** | 放開後 `vy` −1.06 → −0.82 → −0.58 → −0.34 → −0.10 → **+0.14**（5 個取樣點內轉正），y 由 43.68 開始回升。截圖 `fly/f6_drop.png` |
| F7 | 天花板 | **PASS（實心）** / **見 R9-P1-02（開放天空）** | w2 r1 實心天花板下：y 夾在 **352**、碰到當幀 `vy=0.2`，之後 352 ↔ 354.5 微彈不會穿。w1 r0 無天花板：200 幀飛到 **y=−120**（地圖高 192）、`cam.y=0`、畫面上看不到卡比。截圖 `fly/f7c_solid_ceiling.png`、`f7d_offscreen.png` |
| F8 | 水中不起飛 | **PASS** | `state='swim'`、按住 ↑ 14 幀 y 148.9 → 161（下沉到底），`canFloatNow()` 因 `inWater` 回 false。截圖 `fly/f8_water.png`（另見 R9-P2-04） |
| F9 | 含物不起飛 | **PASS** | 吸入 waddledee 後 `state='full'`、按住 ↑ 14 幀 y 恆 145、`vy` 恆 0。截圖 `fly/f9_full.png` |
| F10 | 龍化 / 機甲按住 ↑ 飛行 | **FAIL（dragon）/ 部分（mech）** | dragon 地面 40 幀 y 恆 145（見 R9-P1-01）、離地後正常（129.7 → 58.9）；mech 地面按 ↑ 進**一般 float**（145 → 97.7），離地後按 ↑ 也是 float 而不是噴射（按跳才 40.8）。截圖 `fly/f10_dragon*.png`、`f10_mech*.png` |

### R9-2b. 空中出招與相容性（`shots/agent_qa9/air.py` / `air2.py`）

| # | 驗收項 | 結果 | 實測數據 |
|---|---|---|---|
| A1 | 漂浮中按 X（有能力）→ 出招不吐氣 | **PASS** | fire 在 `float`（y 126.8）按 X → `state='attack'`、`hb=1`、`exhaleLockT=0`、`atkDir=[false,false,true]`。截圖 `air/a1_float_attack.png` |
| A1b | 漂浮中 ↓+X（有能力） | **PASS** | sword → `state='attack'`、`atkDir=[false,true,true]`、`hb=1`（照樣出招，不吐氣） |
| A2 | 漂浮中按 X（無能力）→ 吐氣 | **PASS** | `state='exhale'`、`exhaleLockT=8`。截圖 `air/a2_exhale.png` |
| A2b | 漂浮中 ↓+X（無能力）→ 不吐氣 | **PASS** | 維持 `float`、`vy=-1.24`（規則保留） |
| A3 | 空中 X / ↑X / ↓X 出招期間 y 遞增 | **PASS（44/44）** | 見 R9-2c；連續未下降幀數最長 29（只有 gravity `aux` 浮空與 ghost 穿牆，兩者皆為文件化例外） |
| A4 | 招式結束 ↑ 仍按著 → 回漂浮 | **PASS** | sword / fire / flamesword / mage 四條路徑都在招後轉回 `float` 並繼續上升（y 129 → 81.7）；放開 ↑ 的對照組停在 `idle` 不再起飛。截圖 `air/a4_*.png` |
| A5 | 覺醒 跳+攻 | **PASS（地面 / 空中 / 混合）** | 地面：`active=true`、`activeT=299`、招名「百斬星光劍」；空中（`jump`）：同樣發動；flamesword：「炎帝百斬」。300 幀後 `active=false`、`ready=false`（量表歸零）。截圖 `air/a5_awaken.png`、`a5_awaken_mid.png`、`a5b_air_awaken.png`。**漂浮中除外 → R9-P2-01** |
| A6 | 時停 | **PASS** | X → `timeStopT=179`、`mode='stop'`；11 隻敵人的 x 座標在 50 幀內**完全不變**；時停中再按 X → `mode='punch'`、`timeStopT=128`（繼續倒數）；260 幀後 `timeStopT=0`、`state='idle'`；時停中空中 ↑X 也能出（`mode='punch'`）。截圖 `air/a6_timestop.png`、`a6_punch.png` |
| A7 | 滑鏟 ↓+跳 | **PASS** | `state='slide'`、y 151、60 幀後回 `idle`。截圖 `air/a7_slide.png` |
| A8 | 單向平台 ↓+跳 穿下 | **PASS** | 站在 `=` 平台 (689,81) → ↓+跳 → `state='fall'`、y 81 → 121（穿過去）。截圖 `air/a8_dropdown.png` |
| A9 | 梯子上 X 攻擊 | **PASS** | w2 r0 / w2 r3 的梯子：按 X → `proj=1`（吐氣彈）、`ladderAtkT=14`、**`state` 維持 `climb`**（不離開梯子）、按 ↑ 仍是爬梯。截圖 `air/a9_ladder_w20.png`、`a9_ladder_w23.png`。w2 r1 貼牆梯子見 R9-P2-07 |
| A10 | 水中 | **PASS** | 水裡按 X 不會出招也不會吐氣（`state` 維持 `swim`，`updateSwim` 在攻擊分支之前 return）—— 與 Round 9 之前一致，未壞 |

### R9-2c. 44 能力 × 7 招矩陣（`shots/agent_qa9/matrix.py`、蒙太奇 `shots/agent_qa9/matrix/<key>.png`）

方法：每個能力 `goto game w1 r0 ability=<key>` → 等 180 幀（變身類 300 幀，確保開場橫幅與變身演出都結束）→ `hitbox(true)` → 在身體左右與頭頂生 3 隻 waddledee → 依序跑 7 個腳本
（`X` / `↑+X` / `↓+X` / `jump 9 + step 7 + X` / `按住 X 104 幀放開` / `jump 9 + step 7 + ↑X` / `jump 9 + step 7 + ↓X`），
每招連拍 3 張（間隔 7 幀）+ 記 30 幀逐幀曲線 + 再跑 160 幀查殘留，最後合成 7 列 × 3 欄的蒙太奇逐張 Read。

**結果：44 / 44 OK，0 個問題。** 每一項檢查的統計：

| 檢查 | 通過 | 說明 |
|---|---|---|
| 七招都真的發動（`state='attack'` / `stone` 或有判定框 / 投射物 / `mode`） | **44/44**（蓄力列除外，11 種本來就沒有蓄力招） | 見「觀察」第 5 點 |
| 動畫幀存在、七招互不相同 | **44/44** | 逐張 Read；例：stone 的 `COMET!` / `CRASH!`、hammer 的 `SMASH!`、mech 的白色鑽頭、clone 的分身塔、ghost 的怨靈墜擊、flamebow 的鳳凰箭 |
| 判定框位置合理（↑X 在頭頂、↓X 貼地 / 身體下方、空中招跟著卡比） | **44/44** | hitbox 疊圖確認；例：beam ↑X 是 18×38 直立框、spark ↓X 是貼地 52×16 向兩側、mech ↓X 12 個 rehit 框沿地面推進 |
| 特效（VFX / 粒子 / textPop） | **44/44** | 每招都有可辨識的視覺回饋 |
| 招後回 `idle` / `fall` | **44/44** | 160 幀後 `post.s` 全部是 `idle`（stone 維持 `stone` 是設計：再按 X 或 900 幀才解除） |
| 無殘留判定框 / 投射物 / VFX | **44/44** | `post.hb=0`、`post.proj≤2`、`post.vfx≤6`（stone 除外，同上） |
| 無洋紅 | **44/44** | 3×7 = 21 張逐張數 `(255,0,255)` 像素，全部 0 |
| `__kb.missing()` 空 | **44/44** | |
| 0 console error / pageerror | **44/44** | |
| `moves` 表順序 X→↑→↓→空中→蓄力、≤6 列、招名不重複、`desc` 在 | **43/44** | 只有 ghost 的第 5 列標籤含 ↑↓ → R9-P2-03 |

空中三招的淨下墜（`ymax − y起招`，正值 = 有下墜）節錄：

| 能力 | 空中 X | 空中 ↑X | 空中 ↓X | 能力 | 空中 X | 空中 ↑X | 空中 ↓X |
|---|---|---|---|---|---|---|---|
| fire | 21.8 | 22.1 | 18.0 | flamegun | 21.8 | 22.1 | 38.1 |
| sword | 21.8 | 22.1 | 18.9 | thunderbow | 21.8 | 22.1 | 22.1 |
| stone | 37.8 | 37.7 | 21.7 | flameninja | 21.8 | 22.1 | 21.8 |
| giant | 6.0 | 8.2 | 22.4 | stonegiant | 21.8 | 21.8 | 38.1 |
| dragon | 32.8 | 37.8 | 6.7 | flamedragon | 21.8 | 22.1 | 17.7 |
| mech | 42.2 | 45.2 | **56.1** | hammermech | 21.8 | 22.1 | 17.6 |
| **time** | 0（回溯瞬移回原點） | 22.1 | 22.1 | **gravity** | 21.8 | **−18.7（浮空，`def.hover`）** | 22.1 |
| **ghost** | 0（穿牆） | −28.8（穿牆） | 0（穿牆） | thunderblade | 0.3（起招前已落地） | 22.1 | 21.8 |

### R9-2d. UI（`shots/agent_qa9/ui.py`）

- **暫停能力卡**：10 種取樣（fire 4 列 / beam 5 / ghost 5 / flamesword 5 / hammermech 5 / gravityblade 5 / stone 6 / mech 6 / giant 6 / 無能力 0）。
  4 列 → 2 行風味文字、5 列 → 1 行、6 列 → 不畫風味文字，**全部沒有超出卡片高度、沒有和下方選單重疊**。
  giant 的 ↑+X 正確顯示成「上勾拳（按住＝大口吸）」（magic-forms 在 PROGRESS 提醒的文案已同步）。
- **能力圖鑑**：`發現 44/44`、`6 頁`（每頁 8 個縮圖）、標題列 / 頁碼 / Lv 與熟練度條都正確；抽樣 8 個詳情頁（fire / hammer / mage / ghost / flamesword / stonehammer / flameninja / hammermech）**五招表完整顯示**、大預覽正確、`__kb.missing()` 空、0 error。
- **操作說明**：`UI.HELP_PAGES = 2`。第 1 頁 = `KB.input.HELP` **10 列**，第 2 頁 = `UI.HELP2` **10 列**；兩頁都沒有重疊或截斷（player-input 為此把「跳躍（空中再按 / 按住 ↑ ＝飛行）」拆成兩列，右欄 12px 上限 138px）。飛行相關文字見 R9-0 表與 R9-P2-05。
- **16px 字集**：0 缺字（詳見 R9-0 表）。

### R9-2e. 測試與 playthrough（log 在 `shots/agent_qa9/tests/`）

| 測試 | 結果 | 測試 | 結果 |
|---|---|---|---|
| `engine_test.py` | **153/153** | `test_awaken.py` | **237/237** |
| `enemy_test.py` | **393/393** | `test_elements.py` | **96/96** |
| `boss_test.py --runs 3` | **ALL PASS**（kracko fight 3/3） | `test_progression.py` | **101/101** |
| `test_weapons.py` | **370/370** | `test_extra.py` | **53/53** |
| `test_charge.py` | **115/115** | `test_challenge.py` | **93/93** |
| `test_magic.py` | **192/192** | `test_saves.py` | **67/67** |
| `test_forms.py` | **226/226** | `test_skins.py` | **67/67** |
| `test_mix.py` | **509/509** | `node level_check.js`（含 `--extra`） | **0 error / 1 warning** |
| `test_mix2.py` | **607/607** | `node audio_check.js` | **全部通過** |
| `test_helper.py` | **131/131** | `font_subset.py --check` | **無缺字（1848 字）** |

playthrough（`--ability sword --godmode`）：

| 關卡 | 幀數 | cleared | deaths | bossDamage | missing |
|---|---|---|---|---|---|
| w1 | 5835 | True | 0 | 100% | [] |
| w2 | 7294 | True | 0 | 100% | [] |
| w3 | 7468 | True | 0 | 100% | [] |
| w4 | 6749 | True | 0 | 100% | [] |
| w5 | 8452 | True | 0 | 100% | [] |
| w6 | 8304 | True | 0 | 100% | [] |
| w7 | 9578 | True | 0 | 100% | [] |

### R9-2f. 效能（`shots/agent_qa9/perf.py`）

情境：卡比在 w1 r0 起飛後，**連續 300 幀按住 ↑**（持續飛行 + 自動拍動 + 粒子），並且**每 6 幀同時按一次 X**（空中招連發）。

| 能力 | 純 step 300 | 飛行＋連發 300 | 每幀 | 峰值存活實體 / 判定框 / 投射物 | 180 幀後 | heap |
|---|---|---|---|---|---|---|
| sword | 0.31 ms/f | 168 ms | **0.56 ms/f** | 46 / 1 / 0 | 45 / 0 / 0 | 16 MB |
| flamegun | 0.34 ms/f | 171 ms | **0.57 ms/f** | 63 / 4 / 1 | 45 / 0 / 0 | 16 MB |
| flamebow | 0.33 ms/f | 171 ms | **0.57 ms/f** | **67** / 5 / 1 | 45 / 0 / 0 | 16 MB |
| starmage | 0.33 ms/f | 123 ms | **0.41 ms/f** | 50 / 0 / 3 | 45 / 0 / 0 | 16 MB |
| mech | 0.31 ms/f | 132 ms | **0.44 ms/f** | 45 / 0 / 2 | 42 / 0 / 0 | 16 MB |
| hammermech | 0.32 ms/f | 108 ms | **0.36 ms/f** | 49 / 0 / 3 | 45 / 0 / 0 | 18 MB |

最重的 flamebow 用掉 16.7ms 預算的 **3.4%**；每個情境在停手 180 幀後判定框 / 投射物 / VFX **全部歸零**，實體數回到基準，JS heap 無成長 → **沒有洩漏**。

## R9-3. 重現指令總表

```bash
cd "/home/ken150ken150/桌面/我的專案/遊戲開發/卡比之星"
PY=.venv/bin/python

# 飛行手感（F1~F11）
$PY shots/agent_qa9/fly.py      # 地面 4 幀 / 門 / 梯 / 空中 / 上升曲線 / 放開 / 水 / 含物 / dragon / mech
$PY shots/agent_qa9/fly2.py     # 天花板長程、dragon / mech 離地後、水中 ↑ vs 跳
$PY shots/agent_qa9/fly3.py     # 實心天花板搜尋 + 開放天空飛出畫面
$PY shots/agent_qa9/fly4.py     # 實心天花板 90 幀夾制複驗

# 空中出招 / 相容性（A1~A10）
$PY shots/agent_qa9/air.py      # 漂浮中 X / ↓X、自動回漂浮、滑鏟、平台下穿、梯子、水中
$PY shots/agent_qa9/air2.py     # 覺醒（地面 / 空中 / 漂浮 / 混合）、時停、梯子吐氣彈

# 44 能力 × 7 招矩陣（約 25 分鐘；蒙太奇在 shots/agent_qa9/matrix/）
$PY shots/agent_qa9/ablist.py > shots/agent_qa9/abilities.json
$PY shots/agent_qa9/matrix.py                 # 全部 44 種
$PY shots/agent_qa9/matrix.py --only fire,ghost
$PY shots/agent_qa9/dmg.py                    # 對「連拍沒抓到判定框」的 16 組做獨立命中複驗

# UI（能力卡 / 圖鑑 / 說明 / 16px 字集）
$PY shots/agent_qa9/ui.py

# 效能
$PY shots/agent_qa9/perf.py

# 全套測試（log 在 shots/agent_qa9/tests/）
bash -c 'for t in engine_test enemy_test test_weapons test_charge test_magic test_forms test_mix test_mix2 \
  test_helper test_awaken test_elements test_progression test_extra test_challenge test_saves test_skins; \
  do $PY tools/$t.py; done'
$PY tools/boss_test.py --runs 3
node tools/level_check.js ; node tools/level_check.js --extra ; node tools/audio_check.js
$PY tools/font_subset.py --check
for w in w1 w2 w3 w4 w5 w6 w7; do $PY tools/playthrough.py --level $w --ability sword --godmode; done
```

### 截圖索引（`shots/agent_qa9/`）

- **飛行**：`fly/f1_takeoff.png`、`f1_seq_00~05.png`（地面起飛連拍）、`f2_door.png`、`f3_ladder.png` + `f3_seq_00~03.png`、
  `f4_airfloat.png`、`f5_rise_00~09.png`（上升 y 曲線連拍）、`f6_drop.png`、`f7_ceiling.png`、`f7b_ceiling_room.png`、
  **`f7c_solid_ceiling.png`**（實心天花板夾制）、**`f7d_offscreen.png`**（飛出畫面，R9-P1-02）、`f7d_offscreen_after.png`、
  `f8_water.png`、`f9_full.png`、**`f10_dragon.png`** / `f10_dragon_seq_00~03.png` / `f10_dragon_airup.png`（R9-P1-01）、
  `f10_mech.png` / `f10_mech_seq_00~03.png` / `f10_mech_airup.png`
- **空中出招**：`air/a1_float_attack.png`、`a2_exhale.png`、`a4_sword|fire|flamesword|mage.png`、
  `a5_awaken.png`、`a5_awaken_mid.png`、`a5b_air_awaken.png`、`a6_timestop.png`、`a6_punch.png`、
  `a7_slide.png`、`a8_dropdown.png`、`a9_ladder_w20.png`、`a9_ladder_w23.png`、`a9_ladder_attack.png`、`a10_water_attack.png`
- **44 能力矩陣**：`matrix/<key>.png` ×44（每張 768×1568，7 列 = 七招 × 3 欄 = 三連拍），原始單張在 `mv/<key>_<mid>_0~2.png` 與 `mv/<key>_<mid>_post.png`
- **UI**：`ui/card_<10 種>.png`（暫停能力卡）、`ui/card_gunner|ninja|blade|bow.png`（R9-P2-02）、
  `ui/gal_p0~p5.png`（圖鑑 6 頁）、`ui/gal_detail_<8 種>.png`、**`ui/help_p0.png`** / **`ui/help_p1.png`**
- **效能**：`perf/<6 種>.png`
- **原始數據 / log**：`fly.json`、`fly2.json`、`fly3.json`、`air.json`、`air2.json`、`matrix.json`、`abilities.json`、
  `dmg.json`、`ui.json`、`perf.json`、`tests/*.log`、`tests/play_w1~w7.log`、`matrix_run.log`

---

# Round 10 驗收（qa10 · 2026-09-17）

> 範圍：Round 10「貼身招判定加倍」—— 總控的核心（`src/const.js` `KB.PHYS.meleeScale = 2`、`src/entity.js` Hitbox 自動放大規則）
> 與四個 agent（melee-basic / melee-weapons / melee-magic-forms / melee-mix）的逐招標注。
> **獨立驗收：不採信任何 agent 的自述數字，全部自己重跑**；判定框尺寸一律用 playwright 逐招逐幀實測。
> 「改動前」對照組＝把 `git HEAD`（Round 9 收工狀態）整份 `git archive` 到暫存目錄跑同一支腳本，**工作區全程沒有動過**
> （沒有 `git stash` / `checkout` / `reset`）。
> 本輪 qa10 只寫 `docs/QA_REPORT.md`、`docs/PROGRESS.md` 的 `## qa10` 區段、`shots/agent_qa10/`，並執行 `tools/build.py`（本輪 build 歸 qa10）。
> 截圖全部用 Read 工具實際打開看過。

## R10-0. 結論

**可以出貨。使用者的核心需求（貼身攻擊判定大一倍、含 ↑X / ↓X、遠程維持）確實做到了，而且非無敵實測有可量化的巨大改善。**

| 項目 | 結果 | 備註 |
|---|---|---|
| **貼身招 ×2** | **OK（0 例外瑕疵）** | 44 能力 × 5 招實測共 **713 個 owner='player' 判定框**，其中 **459 個 `meleeScaled == 2`**；**全部 459 個都是 `w == 2×w0` 且 `h == 2×h0`**，沒有任何一個「只放大寬度 / 只放大高度」的不對稱框 |
| **第 10 幀不縮回** | **OK** | 713 個框裡有 **241 個活到第 10 幀**（其中 108 個是 ms=2）。**沒有任何一個在第 10 幀縮回原尺寸**（`meleeScaled` / `w==2×w0` / `h==2×h0` 全部維持）——melee-basic 的 `fitBox()` 與 melee-magic-forms 的龍息逐幀重算都正確 |
| **遠程投射物不變** | **OK（0 差異）** | 同一支腳本跑「目前」與「git HEAD」兩份，44 能力的 **395 個 `proj`** 逐一比對 `(招, kind, w, h)` 集合 → **44 / 44 能力零差異**，沒有任何一種投射物被誤放大或消失 |
| **使用者點名的 sword** | **五招全部達標** | X 44×32（22×16 ×2）、↑X 44×60、↓X 60×28、空中 X 64×52 —— 四個貼身招都 ms=2；第 5 招「滿血 X 劍氣」**本來就是 `proj_swordwave` 遠程**（12×16 不變），照規格不該放大。**sword 沒有例外** |
| **使用者點名的 spark** | **四招達標、蓄力 1 招是例外** | X 88×80（44×40 ×2）、↑X 40×76、↓X 104×32、空中 X 56×52 + 落地 136×36 —— 全部 ms=2。**唯獨蓄力「電擊波」維持 96×80（`melee:false`）**：招式表寫明「96px」、本來就是全身巨框，×2 = 192×160 會蓋掉 256×192 遊戲區的 62%。**這是唯一一個「使用者點名卻沒放大」的招，列在例外清單第 1 條請使用者裁決** |
| **非無敵實戰體感** | **大幅變好** | 見 R10-2d。w1 sword、w2 spark、w4 blade 各跑 2 次，**目前 6 / 6 全部 `cleared=True`**（deaths 0 / 0 / 0 / 0 / 2 / 2）；同樣的 6 次跑在 **git HEAD 只有 1 次通關**（其餘 5 次 `deaths=4` 未通關）。使用者說的「劍、雷擊常被打死」在改動後測不出來了 |
| **全套測試** | **17 支全綠、1 支紅字** | engine 167/167、enemy 393/393（`--extra` 79/79）、boss `--runs 3` **ALL PASS**（含 `--extra` ALL PASS；kracko fight 這次 3/3 沒有出現已知 WARN）、weapons 417/417、magic 248/248、forms 315/315、charge 140/140、mix 701/701、mix2 801/801、helper 131/131、elements 96/96、progression 101/101、awaken 270/270、extra 53/53、challenge 93/93、saves 67/67、skins 67/67；`level_check`（含 `--extra`）**0 error / 1 warning**（洛洛洛出生點，既有）、`audio_check` 全部通過。**`font_subset.py --check` 退出碼 1、缺 3 字 → R10-P1-01** |
| **playthrough --godmode** | **7 / 7 cleared** | w1~w7 全部 `cleared=True` / `deaths=0` / `missing []`；幀數 5341 / 5814 / 7056 / 6864 / 8908 / 5675 / 8703 |
| **地形破壞迴歸** | **OK（沒有隔空破壞、沒有新的硬磚穿透）** | 見 R10-2e。硬磚 X 對照實驗：**能破的（hammer / stone / fire 衝刺 / blade ↓X / mech 鑽頭）與不能破的（sword / beam / cutter / ice / spark / ninja）名單和 HEAD 完全一致**，沒有任何一種能力「本來打不破硬磚、現在打得破」。破壞範圍確實變大（同一距離 hammer 由破 0 塊→破 3 塊），但逐格核對 **每一塊被破的磚都與放大後的判定框真實重疊**（最誇張的 giant ↓X 也只是剛好蓋到上一列磚的下緣 4px），**不是隔空** |
| **視覺對齊** | **需要美術跟進（P2）** | 見 R10-2f。spark X（電場魔法陣 r=38）與 dragon X（火焰跟著 `b.w` 伸長）對得很好；**sword X 起手、blade X 第 1 段最明顯超框**；所有貼身框因為「高度置中放大」會往腳下沉入地面 10~20px。列 **R10-P2-02** |
| **過大框** | **48 招（w≥120 或 h≥96）** | 最大 `stonegiant` 空中 X **192×72**（畫面寬只有 256）、`giant` ↑X **80×128**（畫面高只有 192）。全清單在 R10-2g，**請使用者決定要不要收斂** |
| **效能** | **OK（比 R9 還快）** | 招式密集 300 幀：blade **0.247** / hammermech 0.278 / starmage 0.346 / flamegun 0.356 / sword 0.361 / mech 0.441 / spark 0.481 / flamebow **0.536 ms/幀**，對照 R9 的 **0.36~0.57** → 沒有退步。停手 180 幀後判定框 / 投射物**全部歸零**、實體數回到 43~45 基準，JS heap 9~21MB 無成長趨勢 |
| **說明頁 / 圖鑑** | **1 處文案過期** | 44 種能力的招式表掃過一遍，**只有 spark 的 X 寫死了尺寸「放電（44px 電場）」而實際已是 88px** → R10-P2-01（同一張卡的「電擊波（96px）」仍然正確，因為那招沒放大）。能力卡排版 4 / 5 / 6 列全部沒有溢出，不受本輪影響 |
| **build / dist** | **OK** | `tools/build.py` → `dist/卡比之星.html` **3328 KB**（3,611,299 bytes；上一版 3,585,035 bytes，+26 KB）。用 playwright 開 dist 實跑：`GameScene`、能力 sword、`__kb.missing() = []`、`KB.FONTS.loaded = {px12:true, px16:true}`、**0 console error / 0 pageerror**，截圖 `dist_game.png` 可玩 |

**問題統計：P0 × 0、P1 × 1、P2 × 5。沒有任何一項阻擋出貨。**

## R10-1. 問題列表

| 編號 | 等級 | 位置 | 現象 | 重現指令 | 數據 / 截圖 | 建議負責人 |
|---|---|---|---|---|---|---|
| **R10-P1-01** | P1 | `assets/fonts/unifont16-subset.woff2` + `assets/fonts/unifont_chars.txt`（子集字集） | **`font_subset.py --check` 退出碼 1，缺 3 個字「宣 稽 遍」**，違反 STATUS 的「品質基準：font_subset --check 無缺字」。`git HEAD` 跑同一支工具是 **`OK：src 用到的字全部都在子集裡`（1848 字）**，所以這是 Round 10 造成的新缺口——三個 agent 在 `src/*.js` 新增的註解帶進了新字（`abilities_weapons.js:5`「稽核」、`abilities_mix.js:132/998`「宣告」、`abilities_magic.js:668`「掃一遍」）。**實際遊戲影響為零**（`grep` 確認這 3 個字只出現在 `//` 註解，沒有任何 `moves` / `desc` / `flavour` / UI 字串用到），`build.py` 也已經把 1848 字的清單內嵌（比 src 掃到的 1851 少 3）。但工具是紅的、而且下次有人真的用到這 3 個字時那一整串會默默退回 12px。 | `cd 專案 && .venv/bin/python tools/font_subset.py --check`（→ exit 1、`子集缺字： 宣稽遍`）；對照 `.venv/bin/python <HEAD 副本>/tools/font_subset.py --check`（→ exit 0） | `shots/agent_qa10/tests/font.log` | **總控**：跑一次 `.venv/bin/python tools/font_subset.py`（不加 `--check`）重做子集並重新 `build.py`；或請三個 agent 把註解裡的「稽核 / 宣告 / 一遍」換成已在字集內的字。前者一行指令、後者零資產改動，兩者擇一 |
| **R10-P2-01** | P2 | `src/abilities.js:667`（spark 的 `moves`） | **招式表寫死的尺寸數字過期**：暫停能力卡上 spark 的第 1 列寫「放電（44px 電場）」，但這招的判定已經是 **88×80**（44×40 ×2）。同一列的第 5 招「電擊波（96px）」**仍然正確**（那招標了 `melee:false` 沒放大），所以卡片上會出現「44px 的招其實 88px、96px 的招真的 96px」這種不一致。掃過 44 種能力的全部 `moves` / `desc` 標籤，**只有這一處寫死了尺寸數字**，其餘沒有需要更新的文案。 | `.venv/bin/python tools/shot.py --scene game --level w1 --room 0 --ability spark --script "step 30; tap start 2; step 20" --out shots/x/card.png` 後開圖看第 1 列 | `shots/agent_qa10/ui_card_spark.png`（卡片上「放電（44px 電場）」清晰可見）；`survey.json` 的 `spark.X` = `88×80 ms2 from 44×40` | **melee-basic**（`src/abilities.js` 擁有者）：改成「放電（88px 電場）」或直接拿掉數字寫「放電（全身電場）」 |
| **R10-P2-02** | P2 | `src/abilities.js`（sword 揮砍）、`src/abilities_weapons.js`（blade 三段連斬）、`src/abilities_forms.js`（giant ↑X）與全部貼身招的「高度置中放大」 | **判定框明顯超出特效，需要美術跟進**。三個具體程度：① **sword X 起手幀**（44×32）畫面上只有一道細白弧線在框的左上角，框的其餘 3/4 是空的（`vis_sword_X_01.png`）；劈下幀（48×52）刀光橫向對得上，但框的下緣**沉進地面約 20px**（`vis_sword_X_02.png`）。② **blade X 第 1 段**（52×40）最誇張——可見特效只有一道約 12px 的白色短劃，框卻有 52px 寬（`vis_blade_X_01.png`）。③ **giant ↑X**（80×128）上勾拳的圓弧特效大致包住框，但框頂比拳頭高出約 40px（`vis_giant_upX_01.png`）。**對得好的反例**：spark X 的電場魔法陣（r=38）幾乎內接 88×80 的框（`vis_spark_X_02.png`）、dragon X 的火焰跟著 `b.w` 伸長、整條吐息都填滿（`vis_dragon_X_02.png`）——證明「特效同步放大」是做得到的，只是沒有做完。另外**所有**貼身框因為高度是置中放大，下緣一律沉入地面 10~20px，除錯畫面上看起來像「打得到地板下面」（實際上地板 `#` 不可破，沒有功能影響）。 | `.venv/bin/python tools/shot.py --scene game --level w1 --room 0 --ability sword --script "step 20; tap attack 1; step 2" --seq 4:3 --hitbox --out shots/x/sword.png`（blade 換 `--level w2`、giant 換 `--script "step 160; press up 3; press up,attack 2; press up 6"`） | `vis_sword_X_00~03.png`、`vis_blade_X_00~03.png`、`vis_giant_X_00~03.png`、`vis_giant_upX_00~03.png`、`vis_dragon_X_00~03.png`、`vis_spark_X_00~03.png`、`vis_sword_upX_00~02.png`、`vis_spark_downX_00~02.png` | **美術 / 各 abilities 擁有者**（優先序：blade 第 1 段 > sword 起手 > giant ↑X）。三個 agent 都在自己的 PROGRESS 已知問題裡承認了這點，本輪是刻意取捨（要打得到），**不阻擋出貨**，交由使用者決定要不要開一輪美術跟進 |
| **R10-P2-03** | P2 | 48 招（全清單在 R10-2g） | **過大貼身框**：`w ≥ 120` 或 `h ≥ 96` 的貼身框共 **48 招**（依「能力 × 招」去重後）。最大的幾個：`stonegiant` 空中 X **192×72**、`stonegiant` X / 蓄力 **180×64**、`flamehammer` ↓X **180×52**、`stonehammer` 空中 X **168×72**、`thundersword` ↓X **168×44**、`thundersword` 空中 X **160×80**、`hammermech` ↓X **160×56**、`giant` ↑X **80×128**。遊戲區只有 **256×192**，所以 192 寬 = 畫面的 75%、128 高 = 畫面的 67%。這些全是「落地衝擊波 / ↓X 地面斬 / ↑X 直立柱」，持續 8~18 幀且要先付俯衝或蓄招硬直，所有測試與 9 次 playthrough 都沒有異常，**不是 bug**，但視覺上很有壓迫感。 | `.venv/bin/python shots/agent_qa10/survey.py "$PWD" /tmp/s.json` 後用 `shots/agent_qa10/an.py` 的 E 段列出 | `shots/agent_qa10/survey.json`（完整 44×5 原始資料） | **使用者裁決**。要收斂的話 melee-mix 已寫好改法：把那幾行的 `mbox(p, …)` 改回 `abox(…)` 就恢復 Round 9 尺寸（一行一個招、互不影響）；`giant` ↑X 則是把那一行的 `melee: true` 拿掉 |
| **R10-P2-04** | P2 | `src/abilities.js`（spark 電擊波）等 54 個「整招都沒有 2× 框」的格子 | **例外清單需要使用者裁決**：44×5 = 220 個格子裡，有 **54 個格子整招沒有任何 ms=2 的框**（全清單與分類在 R10-2c）。其中最需要使用者看一眼的是 **spark 蓄力「電擊波」**——使用者點名了 spark 的五招，而這一招是唯一沒放大的。其餘 53 個絕大多數理由充分（遠程投射物的落點爆炸、全畫面必殺、以卡比為中心但本來就 ≥56px 的光環、石頭變身本體、0×0 工具框）。**每一個 `melee: false` 在程式裡都寫了理由註解**（逐行核對 41 處 `melee:false` + 34 處 `melee:true`，無一例外）。 | 見 R10-2c 各條的重現指令 | `shots/agent_qa10/survey.json`、`survey_forms.json` | **使用者裁決**；改法各 agent 已寫在自己的 PROGRESS「旋鈕」段（拿掉對應那一行的 `melee:false` 即可，每招各一行） |
| **R10-P2-05** | P2 | `tools/enemy_test.py` 的 `HOOK_JS`、`src/main.js` 的 `__kb.entities()` | **驗判定框的工具缺欄位**：`enemy_test.py` 的 `HOOK_JS` 只記 `w/h`，`__kb.entities()` 連 `w/h` 都沒有，**都沒有 `w0 / h0 / meleeScaled`**。結果是 melee-basic、melee-weapons、melee-mix、melee-magic-forms **四個 agent 各自另外掛了一層 `KB.spawn` hook**，qa10 也得再寫一份（`shots/agent_qa10/survey.py`）。四個 agent 都在自己的「跨檔需求」提了這件事，但本輪授權都寫明「僅修尺寸斷言」，所以沒有人有權改。 | — | 四個 agent 的 PROGRESS「跨檔需求」段 | **總控**：把 `w0 / h0 / meleeScaled` 加進 `enemy_test.py` 的 `HOOK_JS`，並讓 `__kb.entities()` 回傳 `w / h / w0 / h0 / meleeScaled`。下一輪要再驗判定框就不用每個人重寫一份 |

## R10-2. 逐項明細

### R10-2a. 全套測試（自己重跑，數字為本機實測）

| 測試 | 結果 | 對照 STATUS 品質基準 |
|---|---|---|
| `engine_test.py` | **167 / 167** | 167 ✓ |
| `enemy_test.py` | **393 / 393** | 393 ✓ |
| `enemy_test.py --extra` | **79 / 79** | 79 ✓ |
| `boss_test.py --runs 3` | **ALL PASS**（whispywoods / lololo / kracko / metaknight / dedede / shadowkirby / nightmarecore 的 idle・intro・fight・phase2・phase3・mid 全 PASS，29s）| ALL PASS ✓（**kracko fight 這次 3/3，沒有出現既有的 2/3 WARN**）|
| `boss_test.py --runs 3 --extra` | **ALL PASS**（7 魔王 extra 全 PASS，9s）| ✓ |
| `test_weapons.py` | **417 / 417** | 基準 378 → 本輪 melee-weapons 加了 39 條尺寸斷言 |
| `test_magic.py` | **248 / 248** | 基準 192 → +56 |
| `test_forms.py` | **315 / 315** | 基準 263 → +52 |
| `test_charge.py` | **140 / 140** | 基準 115 → +25 |
| `test_mix.py` | **701 / 701** | 基準 509 → +192 |
| `test_mix2.py` | **801 / 801** | 基準 607 → +194 |
| `test_awaken.py` | **270 / 270** | 基準 240 → +30 |
| `test_helper.py` | **131 / 131** | 131 ✓ |
| `test_elements.py` | **96 / 96** | 96 ✓ |
| `test_progression.py` | **101 / 101** | 101 ✓ |
| `test_extra.py` | **53 / 53** | 53 ✓ |
| `test_challenge.py` | **93 / 93** | 93 ✓ |
| `test_saves.py` | **67 / 67** | 67 ✓ |
| `test_skins.py` | **67 / 67** | 67 ✓ |
| `node tools/level_check.js` | **0 error / 1 warning** | ✓（warning = `w2 r4 拉拉拉預設出生點 (0,2) 不可用`，既有，非本輪）|
| `node tools/level_check.js --extra` | **0 error / 1 warning** | ✓ |
| `node tools/audio_check.js` | **全部通過** | ✓ |
| `.venv/bin/python tools/font_subset.py --check` | **exit 1：缺字「宣 稽 遍」** | ✗ **紅字 → R10-P1-01** |

全部原始 log 在 `shots/agent_qa10/tests/`。

### R10-2b. 44 能力 × 5 招 判定框普查（本輪的主要證據）

腳本：`shots/agent_qa10/survey.py`（`?debug=1` 的 `__kb.goto / press / step / release` 逐招驅動，每幀掃 `KB.game.entities` 取 `owner === 'player'` 的 `hitbox` / `proj`，記錄每個實體**出現當幀（第 1 幀）**與**出現後第 10 幀**的 `w / h / w0 / h0 / meleeScaled / dmg / follow.type`）。
輸出：`shots/agent_qa10/survey.json`（目前版本）與 `survey_base.json`（**同一支腳本跑 `git HEAD` 副本**）。
`shots/agent_qa10/survey_forms.json` 是變身系（giant / dragon / mech / ghost / time / clone / bow / beam / stone / cutter）**把暖機從 4 幀拉長到 150 幀**的補測——變身需要約 120 幀才完成，短暖機會漏掉 `giant` 的 X / 蓄力。

**總量**：44 能力、220 個「能力 × 招」格子、**713 個 player 判定框 + 395 個 player 投射物**、pageerror **0**。

| 檢查 | 方法 | 結果 |
|---|---|---|
| **A. 貼身框 w、h 是否皆 ≈2×** | 對 459 個 `meleeScaled == 2` 的框逐一驗 `w == 2×w0 && h == 2×h0` | **459 / 459 通過，0 不對稱** |
| **B. 第 10 幀有沒有縮回** | 241 個活到第 10 幀的框（108 個 ms=2）比對第 1 幀與第 10 幀 | **0 個縮回**（`fitBox` / 龍息逐幀重算正確） |
| **C. 遠程投射物與 HEAD 一致** | 目前 vs HEAD 的 `(招, kind, w, h)` 集合逐能力比對 | **44 / 44 能力零差異**（沒有新增、沒有消失、沒有尺寸改變） |
| **D. 例外（無 2× 框的格子）** | 見 R10-2c | 54 / 220 個格子 |
| **E. 過大框** | `w ≥ 120 或 h ≥ 96` 且 ms=2 | 48 招（見 R10-2g） |

**使用者點名的兩種能力（逐招實測值）**

| 能力 | 招 | 判定框（第 1 幀） | 原尺寸 | ms | 判定 |
|---|---|---|---|---|---|
| sword | X 揮砍 | **44×32**（劈下幀 48×52） | 22×16（24×26） | 2 | ✓ |
| sword | ↑X 上挑斬 | **44×60** | 22×30 | 2 | ✓ |
| sword | ↓X 掃堂斬 | **60×28** | 30×14 | 2 | ✓ |
| sword | 空中 X 迴旋斬 | **64×52** | 32×26 | 2 | ✓ |
| sword | 滿血 X 劍氣 | proj 12×16（不變） | — | — | ✓ **這招本來就是遠程投射物**，照規格不放大 |
| spark | X 放電電場 | **88×80** | 44×40 | 2 | ✓ |
| spark | ↑X 雷擊柱 | **40×76** | 20×38 | 2 | ✓ |
| spark | ↓X 落雷 | **104×32** | 52×16 | 2 | ✓（52 > 48 門檻，靠手動 `melee:true`）|
| spark | 空中 X 電光衝 | **56×52** ＋ 落地 **136×36** | 28×26 / 68×18 | 2 | ✓ |
| spark | 蓄力 電擊波 | **96×80（不變）** | 96×80 | **0** | ⚠ **唯一的點名例外**，見例外清單第 1 條 |

### R10-2c. 例外清單（請使用者裁決）

**54 個「整招沒有任何 2× 框」的格子**（`survey.json` + `survey_forms.json` 實測）。按「該不該讓使用者裁決」分四級：

**第 1 級 — 使用者點名、建議親自看一眼（1 條）**

| # | 能力 / 招 | 目前尺寸 | agent 的理由 | 放大後會變成 | 改法（一行） |
|---|---|---|---|---|---|
| E1 | **spark 蓄力「電擊波」** | 96×80 | 招式表寫明「96px」、本來就是全身巨框 | 192×160 = 遊戲區（256×192）的 **62%** | `src/abilities.js:675` 附近拿掉 `melee: false` |

**第 2 級 — 「貼身但被判為已經夠大 / 光環」，理由成立但可以翻案（9 條）**

| # | 能力 / 招 | 目前尺寸 | 理由 | 備註 |
|---|---|---|---|---|
| E2 | time ↑X 時震環 | 56×40 | 全向光環，正好等於一般貼身框 ×2（28×20→56×40） | 合理 |
| E3 | time ↓X 時之枷 | 72×48 | 比貼身 ×2 更大 | 合理 |
| E4 | time 空中 X 回溯 | 56×67 | 同上 | 合理 |
| E5 | gravity ↑X 重力波 | 64×48 | 以卡比為中心的全向重力場，已大於貼身 ×2 | 合理 |
| E6 | gravity ↓X 反重力 | 64×56 | 同上 | 合理 |
| E7 | gravity 蓄力 奇點 | 56×56 | 同上 | 合理 |
| E8 | clone ↑X 分身塔 | 26×60 | 總控指示：框＝柱子外觀 | 合理（但這是唯一「follow 卡比、≤48 寬卻不放大」的招）|
| E9 | ghost 空中 X 幽靈哀嚎 | 80×68 | 對應 76px 的 stun 半徑 | 合理 |
| E10 | stone X / ↓X / 空中 X / 蓄力（變石本體）| 18×17 | 判定框在 `player.js startStone`、`stone:true` 自動排除 | 合理（石頭本體＝無敵撞擊，放大會變成「站著就打死一片」）|

**第 3 級 — 遠程 / 全畫面 / 召喚落點，不該放大（本輪指示明確，41 條）**

`beam` X + 蓄力（甩光鞭 13×31，判定每幀依 6 段絕對座標重算＝遠程）、`mage` X 火球爆炸 30×30 / ↓X 雷擊召喚 24×132（前方 48px 召喚）/ 蓄力 元素風暴 272×208（全畫面）、`mech` ↑X + 蓄力 追蹤飛彈爆風 32×28（可能離卡比半個畫面）、`thunderblade` X + 蓄力 雷光一閃 272×28（全畫面橫掃）、`starmage` X 星光束 96×18 / ↑X 星雨 / ↓X 星塵魔法陣 / 蓄力 銀河爆 230×180、`timebeam` X 凍結光束 110×20 / ↑X 時間裂縫 / ↓X 時砂 / 蓄力 260×190、`thunderbow` ↑X 24×120 / ↓X / 空中X / 蓄力 44×210、`thundergun` ↓X / 蓄力 220×26、`frostgun` ↓X / 空中X / 蓄力 210×22、`flamegun` X / ↓X / 空中X / 蓄力、`flamebow` X / ↓X / 空中X / 蓄力 90×72、`flameninja` X / 空中X / 蓄力 170×120、`frostninja` 蓄力 200×140、`gravityblade` 蓄力 150×130、`shadowblade` 蓄力 120×96、`thundermech` ↑X 40×34、`gravity` X 黑洞 / 空中X 隕石。

> 其中 **7 種「元素 + 遠程」混合能力**（`flamegun` / `frostgun` / `thunderbow` / `thundergun` / `flamebow` / `starmage` / `timebeam`）的 X 與 ↓X 幾乎原封不動 —— 這是照「遠程維持」做的。**若使用者實測後覺得「連槍 / 弓的貼身防身招也該變大」**，melee-mix 已寫好改法：把各自的持續場地框從 `abox` 改成 `mbox`（一行一個招）。

**第 4 級 — 不是攻擊框（1 條）**

| # | 能力 / 招 | 尺寸 | 說明 |
|---|---|---|---|
| E11 | ghost ↑X 隱身 | 0×0 dmg 0 | 清 alert 用的工具框，不是攻擊 |

**理由是否合理的核對**：逐行看過 src 裡全部 **41 處 `melee: false`** 與 **34 處 `melee: true`**，**每一處都在同一行或上方 1~4 行寫了中文理由註解**（`abilities_magic.js` 的兩處在 `pbox` / `abox` 共用函式上，規則寫在檔頭註解）。`src/awaken.js` 的 `mkbox` 寫成 `melee: !!o.melee`（預設 false，行為與 Round 9 完全相同）；`src/helper.js` 的夥伴靠 `follow.type === 'ally'` 天然不吃自動規則、又在 `mbox` 用 `p.type === 'player'` 再擋一層。**沒有找到任何「標了旗標卻沒寫理由」或「理由與實際尺寸對不上」的情況。**

### R10-2d. 實戰體感（非無敵 playthrough，目前 vs `git HEAD`）

工作區全程唯讀：對照組是把 `git archive HEAD 卡比之星` 解到暫存目錄，用專案 venv 跑**那一份**的 `tools/playthrough.py`。R9 的 QA 紀錄只有 `--godmode` 的數字（`QA_REPORT.md:1800`），沒有這三組非無敵基準，所以直接用 HEAD 實跑補齊。

| 關卡 / 能力 | 目前 run1 | 目前 run2 | HEAD run1 | HEAD run2 |
|---|---|---|---|---|
| **w1 sword** | **cleared**・deaths **0**・6075 幀・boss 100% | **cleared**・deaths **0**・6102 幀・boss 100% | cleared・deaths 0・6249 幀 | **未通關**・deaths **4**・只到 r1 |
| **w2 spark** | **cleared**・deaths **0**・10488 幀・boss 100% | **cleared**・deaths **0**・10581 幀・boss 100% | **未通關**・deaths **4**・只到 r2 | **未通關**・deaths **4**・boss 只打掉 20/30 |
| **w4 blade** | **cleared**・deaths **2**・14065 幀・boss 100% | **cleared**・deaths **2**・12282 幀・boss 100% | **未通關**・deaths **4**・只到 r3 | **未通關**・deaths **4** |

**目前 6 / 6 全部通關（總 deaths 4），HEAD 6 次只有 1 次通關（總 deaths 20）。** 使用者回報的「劍、雷擊常被打死」在改動後用同一支機器人量不出來了。`missing sprites` 全部 `[]`。

**`--godmode` w1~w7（sword）**：**7 / 7 `cleared=True`、`deaths=0`、`missing []`**，幀數 5341 / 5814 / 7056 / 6864 / 8908 / 5675 / 8703。

### R10-2e. 地形破壞迴歸

**(1) 破壞位置量測**（`shots/agent_qa10/destroy.py`）：hook `KB.TileMap.prototype.breakBlock`，記錄**每一塊磚被打掉的當下**卡比中心到該磚中心的 `dx / dy`（不是出招前的位置，所以衝刺類的位移不會灌水）。12 個案例（w1 / w2 / w3 各 2 個有磚塊的房間 × giant 衝撞 / mech 鑽頭 / fire 衝刺 / hammer），同一支腳本也跑了 HEAD 對照。

| 案例 | 目前：破 n 塊 / 出招當下最遠 | HEAD：破 n 塊 / 最遠 | 判定 |
|---|---|---|---|
| w1r0 fire ↓X（火焰衝刺） | 8 / **34px** | 8 / 25px | 框由 24×20 → 48×40，reach +9px，**吻合** |
| w1r0 hammer X | 6 / **59px** | 2 / 37px | 框由 26×28 → 52×56，多破了右邊一列（dx 49，磚左緣 41）**與框真實重疊** |
| w2r2 giant ↓X（衝撞） | 2 / 54px | 0 / — | 框 76×60，上緣 = 卡比中心 −30；被破的磚 dy = −34（磚體 −42~−26）→ **重疊 4px，不是隔空** |
| w3r1 giant ↓X | 1 / 43px | 0 / — | 同上 |
| w3r2 fire ↓X | 1 / 64px（`byBomb=true`） | 1 / 95px（`byBomb=true`） | **炸彈方塊連鎖**，HEAD 傳得更遠，非本輪造成 |
| 其餘 7 案例 | 0 塊 | 0 塊 | 卡比擺位沒站到磚旁（房間地形所致），無資訊 |

**(2) 硬磚 X 專項對照**（`shots/agent_qa10/hard.py`）：在 w1 r0 程式化鋪一面 2×4 的硬磚牆貼在卡比右邊，12 種能力 × (X / ↓X) 各打一次，數牆還剩幾塊；同一腳本跑 HEAD。

| 能力 | 目前 X / ↓X 破的塊數 | HEAD X / ↓X | 判定 |
|---|---|---|---|
| sword / beam / cutter / ice / spark / ninja / giant | 0 / 0 | 0 / 0 | **完全一致**，沒有任何一種「本來打不破硬磚、現在打得破」 |
| hammer | 3 / 3 | 0 / 0 | reach 變長（規則沒變，是框變大打得到了） |
| stone | 0 / 2 | 0 / 2 | 一致 |
| fire | 0 / 4 | 0 / 4 | 一致 |
| blade | 0 / 2 | 0 / 1 | reach 變長 |
| mech | 0 / 4 | 0 / 2 | reach 變長 |

> `src/tilemap.js` 本輪**一個字都沒改**（`git status` 的修改清單只有 `abilities*.js` / `awaken.js` / `const.js` / `entity.js` / `helper.js` 與 7 支測試檔），而硬磚的破壞條件 `TileMap.hardBreakable(a)` 只看 `kind === 'hammer' | 'stone'`、`breakHard`、`dmg >= 5` —— **完全不看尺寸**。所以「能破硬磚的招」名單在數學上就不可能改變，實測也確認一致。

**(3) 看圖判斷**（`--hitbox`，出招**進行中**第 2 / 6 / 10（或 6 / 14 / 24）幀，全部用 Read 打開看過）：
`terr_w1r0_hammer_X_f02/06/10.png` — 鎚框（52×56）把左邊那一列星星方塊整個蓋住後才破，上方的硬磚 X 三塊完好；
`terr_w1r0_fire_downX_f04/10/18.png` — 火焰填滿框，只有與框重疊的兩列破掉，上方硬磚完好；
`terr_w2r2_giant_downX_f06/14/24.png` — 巨人框緊貼身體，破掉的是框上緣剛好蓋到的那一列；
`terr_w2r2_mech_downX_f06/14/24.png`、`terr_w3r1_giant_downX_*.png`、`terr_w3r1_hammer_X_*.png`、`terr_w2r0_hammer_X_*.png`、`terr_w2r0_sword_X_*.png` 同樣沒有異常。
**結論：沒有「隔空砸穿地板」、沒有「打穿不該破的硬磚 X」。** 唯一要提醒使用者的是「破壞半徑確實跟著變大」（hammer 在同一距離由 0 塊 → 3 塊），這是判定加倍的直接後果、不是 bug。

### R10-2f. 視覺對齊（`--hitbox`，判斷是否需要美術跟進）

| 能力 / 招 | 判定框 | 特效 | 超出程度 | qa 判斷 |
|---|---|---|---|---|
| **sword X 起手** | 44×32 | 一道細白弧線，只佔框的左上角 | **框的約 3/4 是空的** | **需要跟進**（R10-P2-02 ①）|
| sword X 劈下 | 48×52 | 刀光橫幅對得上 | 框下緣沉入地面約 20px | 可接受 |
| sword ↑X | 44×60 | 白色上挑線終點已從 −34 拉到 −48 | 小幅超出 | 可接受 |
| **blade X 第 1 段** | 52×40 | 約 12px 的白色短劃 | **最誇張**：框寬是特效的 4 倍 | **需要跟進**（R10-P2-02 ②）|
| **spark X** | 88×80 | 電場魔法陣 r=38 + 散射粒子 | **幾乎內接，對得最好** | 不必跟進（其他招可以照抄這個做法）|
| spark ↓X | 104×32 | 落雷 | 略寬 | 可接受 |
| **giant ↑X** | 80×128 | 上勾拳圓弧特效 | 框頂比拳頭高約 40px | **可跟進**（R10-P2-02 ③）|
| giant X | 88×36 | 踩踏衝擊波 | 對得上 | 可接受 |
| **dragon X** | 112~156×56~60 | 火焰長度跟著 `b.w` 逐幀伸長，整條填滿 | **對得很好** | 不必跟進 |

共同現象：**高度一律置中放大**，所以每個貼身框的下緣都會沉入地面 10~20px、上緣長到卡比頭頂上方。功能上沒有影響（地板 `#` 不可破），只是除錯畫面難看。

### R10-2g. 過大框清單（w ≥ 120 或 h ≥ 96，依「能力 × 招」去重，同招逐幀伸長者取最大值）

| # | 能力 | 招 | 放大後 | 原尺寸 | # | 能力 | 招 | 放大後 | 原尺寸 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | stonegiant | 空中X | **192×72** | 96×36 | 25 | thunderblade | ↑X | 52×148 | 26×74 |
| 2 | thundersword | 空中X | **160×80** | 80×40 | 26 | flamedragon | ↑X | 56×136 | 28×68 |
| 3 | stonehammer | 空中X | **168×72** | 84×36 | 27 | flamesword | ↑X | 64×116 | 32×58 |
| 4 | flameninja | ↓X | **120×96** | 60×48 | 28 | frostdragon | ↑X | 56×132 | 28×66 |
| 5 | stonegiant | X | **180×64** | 90×32 | 29 | thundersword | ↓X | 168×44 | 84×22 |
| 6 | stonegiant | 蓄力 | **180×64** | 90×32 | 30 | thunderdragon | ↓X | 152×48 | 76×24 |
| 7 | flamedragon | 空中X | **148×76** | 74×38 | 31 | thunderdragon | ↑X | 52×140 | 26×70 |
| 8 | **giant** | **↑X** | **80×128** | 40×64 | 32 | hammermech | X | 120×60 | 60×30 |
| 9 | flamesword | 空中X | 140×72 | 70×36 | 33 | hammermech | 蓄力 | 120×60 | 60×30 |
| 10 | thunderdragon | 空中X | 140×72 | 70×36 | 34 | stonehammer | ↓X | 128×56 | 64×28 |
| 11 | frostdragon | 空中X | 132×72 | 66×36 | 35 | gravityblade | ↑X | 60×116 | 30×58 |
| 12 | flamehammer | ↓X | **180×52** | 90×26 | 36 | frosthammer | ↑X | 64×108 | 32×54 |
| 13 | flamedragon | X | 156×60 | 78×30 | 37 | flamedragon | ↓X | 144×48 | 72×24 |
| 14 | flamedragon | 蓄力 | 156×60 | 78×30 | 38 | flamesword | ↓X | 156×44 | 78×22 |
| 15 | frosthammer | 空中X | 136×68 | 68×34 | 39 | frostdragon | ↓X | 140×48 | 70×24 |
| 16 | hammermech | ↓X | **160×56** | 80×28 | 40 | flameninja | ↑X | 60×112 | 30×56 |
| 17 | frostsword | 空中X | 128×64 | 64×32 | 41 | thundersword | ↑X | 48×136 | 24×68 |
| 18 | gravityblade | 空中X | 128×64 | 64×32 | 42 | frostninja | ↑X | 56×116 | 28×58 |
| 19 | shadowblade | ↑X | 68×120 | 34×60 | 43 | frostdragon | X | 124×52 | 62×26 |
| 20 | thundermech | ↓X | 156×52 | 78×26 | 44 | frostdragon | 蓄力 | 124×52 | 62×26 |
| 21 | flamehammer | ↑X | 72×112 | 36×56 | 45 | frostsword | ↓X | 148×40 | 74×20 |
| 22 | stonegiant | ↑X | 64×124 | 32×62 | 46 | spark | 空中X | 136×36 | 68×18 |
| 23 | thunderdragon | X | 140×56 | 70×28 | 47 | stone | ↑X | 136×36 | 68×18 |
| 24 | thunderdragon | 蓄力 | 140×56 | 70×28 | 48 | mage | ↑X | 48×96 | 24×48 |

**參考尺度：遊戲區 256×192、卡比本體約 16×16、一格磁磚 16×16。** 192 寬 = 12 格 = 畫面的 75%；128 高 = 8 格 = 畫面的 67%。

### R10-2h. 效能（招式密集 300 幀，與 R9 對照）

情境沿用 qa9 的「按住 ↑ 飛行 + 每 6 幀放一次空中招」，連續 300 幀（3 輪取最快），每輪前有 60 幀暖機。

| 能力 | 300 幀 (ms) | **ms/幀** | R9 基準 | 峰值實體 / 判定框 / 投射物 | 停手 180 幀後 | heap (MB) |
|---|---|---|---|---|---|---|
| blade | 74.1 | **0.247** | — | 46 / 1 / 0 | 45 / 0 / 0 | 12 → 15 |
| hammermech | 83.3 | **0.278** | 0.36 | 50 / 1 / 4 | 43 / 0 / 0 | 16 → 13 |
| starmage | 103.8 | **0.346** | 0.41 | 55 / 3 / 5 | 45 / 0 / 0 | 15 → 12 |
| flamegun | 106.8 | **0.356** | 0.57 | 73 / 8 / 5 | 45 / 0 / 0 | 9 → 12 |
| sword | 108.3 | **0.361** | 0.56 | 46 / 1 / 0 | 45 / 0 / 0 | 16 → 21 |
| mech | 132.3 | **0.441** | 0.44 | 49 / 2 / 4 | 43 / 0 / 0 | 13 → 15 |
| spark | 144.2 | **0.481** | — | 48 / 1 / 0 | 45 / 0 / 0 | 13 → 11 |
| flamebow | 160.9 | **0.536** | 0.57 | 79 / 11 / 6 | 45 / 0 / 0 | 12 → 15 |

**最重的 flamebow 0.536 ms/幀 = 16.7ms 幀預算的 3.2%**，與 R9 的 0.36~0.57 同級（多數還更快）。**判定框變大不影響幀時間**（碰撞是 AABB，成本與尺寸無關；峰值判定框數 ≤ 11）。停手 180 幀後 **8 / 8 情境的 hitbox 與 proj 都歸零**、實體數回到 43~45 基準，**heap 沒有單向成長**（有升有降，落在 9~21MB 的既有區間）→ **沒有洩漏**。

### R10-2i. 說明頁 / 圖鑑

- 掃 44 種能力全部 `moves` 標籤與招名、`desc`、`flavour`，找「寫死尺寸數字」：**只有 1 處**——`spark` 的 X 寫「放電（44px 電場）」（實際已 88px）→ **R10-P2-01**。同一張卡的「電擊波（96px）」**仍然正確**。`說明.md` 與 `docs/SPEC.md` 裡的 px 只有字型與磁磚尺寸，與本輪無關。
- 能力卡截圖確認**不受本輪影響**：`ui_card_sword.png`（5 列）、`ui_card_spark.png`（5 列，**過期文案在這張圖上看得到**）、`ui_card_blade.png`、`ui_card_giant.png`（6 列，含「被動 / 限時」）—— 排版、行距、風味文字、HUD 一切正常，沒有溢出或截斷。`ui_help_p2.png` 為操作說明頁，內容與 Round 9 相同（本輪沒有改說明文案，也沒有需要改的）。

### R10-2j. build / dist

```
.venv/bin/python tools/build.py
  embedded px16 char list: 1848 chars      ← 比 src 掃到的 1851 少 3（＝ R10-P1-01 的三個字）
  embedded fonts: px12, px16 1281 KB (base64)
  written dist/卡比之星.html 3328 KB
```
`dist/卡比之星.html` = **3,611,299 bytes**（上一版 3,585,035，**+26 KB**），符合品質基準「約 3.2MB」。
playwright 直接開 dist 實跑（`shots/agent_qa10/dist.py`）：`scene = GameScene`、`ability = sword`、走了 60 幀再揮一刀 → `x = 125`、`hp = 6`、**`__kb.missing() = []`**、`KB.FONTS = {px12:true, px16:true, ready:true, failed:false}`、**0 console error / 0 pageerror**。截圖 `dist_game.png`（中文關名「翠綠草原」、HUD「劍」、卡比揮劍動作全部正常）。

## R10-3. 截圖索引（`shots/agent_qa10/`）

- **判定框普查（原始數據 + 腳本）**：`survey.json`（目前 44×5）、`survey_base.json`（**git HEAD 對照**）、`survey_forms.json`（變身系長暖機補測）、`survey.py` / `survey2.py`（採集）、`an.py`（比對分析，A~G 七段）
- **視覺對齊（`--hitbox`，每組 3~4 連拍）**：`vis_sword_X_00~03.png`、`vis_sword_upX_00~02.png`、`vis_spark_X_00~03.png`、`vis_spark_downX_00~02.png`、`vis_blade_X_00~03.png`、`vis_giant_X_00~03.png`、`vis_giant_upX_00~03.png`、`vis_dragon_X_00~03.png`
- **地形破壞（出招進行中，`--hitbox`）**：`terr_w1r0_hammer_X_f02/06/10.png`、`terr_w1r0_fire_downX_f04/10/18.png`、`terr_w2r2_giant_downX_f06/14/24.png`、`terr_w2r2_mech_downX_f06/14/24.png`、`terr_w3r1_hammer_X_f02/06/10.png`、`terr_w3r1_giant_downX_f06/14/24.png`、`terr_w2r0_hammer_X_f02/06/10.png`、`terr_w2r0_sword_X_f02/06/10.png`
- **地形破壞（出招後結果 + 量測數據）**：`terrain_<12 案例>.png`、`destroy.json` / `destroy_base.json`（破壞當下的 dx/dy）、`hardblock.json` / `hardblock_base.json`（硬磚 12 能力對照）、`destroy.py` / `hard.py` / `terrshot.py`
- **UI**：`ui_card_sword.png`、**`ui_card_spark.png`**（過期文案 R10-P2-01）、`ui_card_blade.png`、`ui_card_giant.png`、`ui_help_p2.png`
- **dist**：`dist_game.png`、`dist.py`
- **效能**：`perf.json`、`perf.py`
- **測試 log**：`tests/`（`all_tests.log` 16 支、`checks.log` boss / level / audio / font、`playthrough_nogod.log` 目前 vs HEAD 12 次、`playthrough_godmode.log` w1~w7、各測試單檔 log）

---

# Round 11 QA（qa11，2026-09-19）

驗收對象：Round 11「手機也能玩」（touch / screen / pwa / ui 四 agent + 總控整合）。
環境：Linux + 專案 venv + Playwright Chromium；裝置模擬 iPhone 13（直 390×664 / 橫 750×342，DPR 3）、Pixel 5（直 393×727 / 橫 802×293，DPR 2.75）、iPad Mini（直 768×1024 / 橫 1024×768，DPR 2）。
截圖全部存 `shots/agent_qa11/`，**每一張都已用 Read 開圖看過**（36 張版面矩陣 + 觸控實戰 / 設定 / dist / http / 桌機共 78 張）。

## R11-0. 總評

**可以部署，但建議先修 1 個 P1。**

核心功能（觸控操作、小螢幕縮放、PWA / 離線、選單觸控適配、桌機回歸）全部達標：三裝置六種方向的按鍵都不壓畫面 / HUD、畫面比例恆 256:224、觸控實戰 28/28 全過、dist 單檔與 http + service worker 離線都可玩、全套測試綠。

唯一擋路的是 **R11-P1-01：設定裡把「觸控按鍵」切到「關」之後，純觸控裝置（手機）會永久鎖死**——覆蓋層 `pointer-events:none`、遊戲本身不吃畫面點擊、而且這個設定會寫進 `localStorage` 存活到下次開啟，於是玩家再也無法操作任何選單、也回不到設定把它打開。這正是「出門在外用手機開網址就能玩」情境下最致命的一種誤觸。修法很小（見下），修完即可部署。

另有 1 個 P2（桌機設定頁多出 4 個觸控項、版面與 Round 10 不同）與 4 個 P3。

## R11-1. 通過清單

| # | 驗收項 | 結果 |
|---|---|---|
| 1 | 三裝置 × 直橫向 × 6 畫面 = **36 張**（標題 / 遊戲中 / 暫停選單 / 設定頁捲到觸控四項 / 說明第 3 頁 / 按鍵設定頁） | 全部 PASS，0 console error |
| 1a | 按鍵不擋 HUD / 畫面：6 種組合 × 6 顆鍵的矩形與 `KB.layout` 交集 | **0 交集**、0 出界（數據見 `matrix.json`） |
| 1b | 畫面比例 256:224 | 6 種組合實測 `w/h` 皆 = **1.14286** |
| 1c | 字不溢出 / 像素清晰 | 看圖確認：暫停卡 5 列招式、設定 11 項捲動、說明 3/3 十一列、按鍵設定 8×4 表格＋觸控提示行全部不溢出、不重疊 |
| 2 | 觸控實戰（Pixel 5 直 + iPhone 13 橫，CDP 多點真的按 DOM 覆蓋層） | **28/28 PASS**（`play.py`） |
| 3 | 純觸控操作設定頁（D-pad 選 + 左右改值） | 左手 / 大小 / 透明度 / localStorage 全部 PASS（「關」之後的問題見 P1） |
| 4 | 全螢幕 | `KB.TOUCH.fullscreenSupported = true`、`document.fullscreenEnabled = true`、`KB.UI.fullscreenOK() = true`；**實際點全螢幕鍵後 `document.fullscreenElement` 變 true**；暫停選單第 1 列第 4 欄「全螢幕」在 6 種方向都畫得出來且不被切 |
| 5 | dist 單檔 `--dist` | Pixel 5 直 / iPhone 13 橫皆可觸控跳躍（state jump / fall、離地）、`__kb.missing() = []`、`KB.FONTS.ready = true`、**0 console error**、`KB.PWA.registered = false`（`supported = false`，file:// 不註冊 sw） |
| 6 | HTTP（`http.server 8793`） | `--wait-sw --reload 1` → `navigator.serviceWorker.controller = true`、`KB.PWA {registered:true, supported:true, standalone:false, updateReady:false}`；`--offline` 離線重載後 **GameScene 正常、字型 ready、missing []、覆蓋層在**；`sw.js` VERSION `3706b3f1ae` + **ASSETS 67 檔 0 缺**（重算 sha1 與檔案現況一致 ⇒ build.py 不必重跑）；`assets/manifest.webmanifest` JSON 合法（fullscreen / landscape / start_url `../index.html` / scope `../`）；4 個 icon 檔都在且看圖 OK |
| 7 | 桌機回歸 | 1280×800 → `scale = 3` **整數倍**、canvas 置中 `x=256 y=64 w=768 h=672`、backing store 恆 **256×224**、`image-rendering: crisp-edges`；觸控覆蓋層 **不出現**（`available=false`、opacity 0）；`hint` = **Z / X / Shift**；說明第 1 頁鍵名 Z / K / 空白鍵、X / J、Shift / L；標題文案「PRESS START」「按 M 靜音」「SELECT：操作說明　Z / ENTER：開始」與 R10 相同 |
| 8 | 測試 | `test_touch` **56/56**、`engine_test` **167/167**、`test_saves` **67/67**（跑兩次皆綠）；另補 `playthrough w1 --godmode` cleared（5341 幀、deaths 0）、`w7 --godmode` cleared（8703 幀、deaths 0），`missing sprites: []` |

### R11-1a. 版面矩陣數據（`shots/agent_qa11/matrix.json`）

| 裝置 / 方向 | viewport | canvas（x,y,w,h） | scale | D-pad | A 鍵 | 壓到畫面 |
|---|---|---|---|---|---|---|
| iPhone 13 直 | 390×664 | 0,0,390,341.3 | 1.523 | 164 | 62 | 無 |
| iPhone 13 橫 | 750×342 | 179.5,0,390.9,342 | 1.527 | 160 | 66 | 無 |
| Pixel 5 直 | 393×727 | 0,0,393,343.9 | 1.535 | 165 | 63 | 無 |
| Pixel 5 橫 | 802×293 | 233.5,0,334.9,293 | 1.308 | 141 | 57 | 無 |
| iPad Mini 直 | 768×1024 | 0,0,768,672 | 3（整數） | 166 | 72 | 無 |
| iPad Mini 橫 | 1024×768 | **170**,85,684,598.5 | 2.672 | **150** | 72 | 無 |

- 直向都是「畫面貼上方、按鍵在下方黑帶」；橫向都是「畫面置中、D-pad 左 / A B C 右、START 右上、全螢幕左上」。
- iPad Mini 橫向的左右留白已依 touch agent 的跨檔需求放寬到 **170px**，D-pad 從 98 → **150px**，`overlapping = false`。

### R11-1b. 觸控實戰逐項（`play.py`，兩裝置各 14 項）

| 測項 | Pixel 5 直 | iPhone 13 橫 |
|---|---|---|
| D-pad 右 60 幀 → x 增加 | 49 → 122.9 | 49 → 122.9 |
| 按住上 40 幀起飛 | vy −1.54、onGround false、state `float` | 同左 |
| A 跳 | vy −3.68、state `jump` | 同左 |
| B 吸入（無能力） | state `inhale`（截圖可見吸力特效與敵人被吸） | 同左 |
| D-pad 滑動 右→上→左 | `{right}` → `{up}` → `{left}`，舊方向都有解除 | 同左 |
| 兩指 右 + A | x 128.3 → 147.6 且離地 | 同左 |
| 放開全部 → `KB.input.anyDown()` | **false**、`touchDown` 清空（無殘留） | 同左 |
| START → 暫停 → 再 START 解除 | paused true → false | 同左 |
| C 短按丟能力（先 `--ability sword`） | `sword` → `null` | 同左 |
| 真鍵盤輸入後覆蓋層淡出 | `KB.TOUCH.active()` true → **false** | 同左 |
| 再觸控後覆蓋層回來 | **true** | 同左 |
| console / page error | 0 | 0 |

> 註：`--touch "key right 2"`（= `__kb.tap`）走的是 `KB.input.setVirtual`，**不會**產生真的 `keydown` 事件，所以覆蓋層不會淡出（實測 active 仍為 true）。這是除錯 API 的性質、不是 bug；要測淡出必須用真鍵盤事件（本報告用 `page.keyboard.press('ArrowRight')`，結果正確淡出）。**後續 agent 寫測試時請注意這個陷阱。**

### R11-1c. 設定頁觸控操作（`settings.py` / `size.py`）

- 「按鍵位置 → 左手」：iPhone 13 橫 A/B/C 中心 x = 126 / 44 / 70（畫面中線 375 以左）、D-pad 660（以右）；Pixel 5 直 A/B/C = 124 / 46 / 71、D-pad 296（中線 196.5）。**鏡像正確**，截圖 `set_*_side_left.png` 看圖確認。
- 寫檔：`localStorage.kirbystar_global` → `settings.touch = {"mode":"auto","side":"left","size":1,"opacity":0.8}`，**reload 後完整還原**（含 size 1.2 / opacity 0.3 / side left 的組合測試）。
- 預設 `opacity = 0.8`，與設定頁第三檔「濃」對齊（ui agent 原本回報的「預設 0.7 不在檔位上」已由總控解掉）。
- 「按鍵大小」三檔實測：小 0.8 → D-pad 133px、中 1 → 160~166px、大 1.2 → iPhone 橫 164 / Pixel 直 165 / iPad 橫 199px。**iPhone 13 橫向調到「大」仍完全不壓到畫面**（矩形與 canvas 0 交集，看圖確認 D-pad 仍在左側黑邊內）。iPad 橫向「大」會依設計壓到畫面左緣 39px（半透明逃生口，見 P3-02）。
- 「觸控按鍵：關」→ 覆蓋層 `opacity → 0`、`pointer-events: none`、`KB.TOUCH.active() = false`；程式上再切回「自動 / 開」可以正常恢復（`off→auto→on→off→auto` 循環測試 active 都正確）。**但在純觸控裝置上切不回去 —— 見 P1-01。**

## R11-2. 問題列表

### P1（會壞遊玩）

#### R11-P1-01 「觸控按鍵：關」在純觸控裝置是**不可逆鎖死**（手機開了就再也玩不了）
- **現象**：設定 → 「觸控按鍵」切到「關」後：
  1. 覆蓋層 `pointer-events: none`，六顆虛擬鍵全部失效；
  2. 遊戲本體只吃鍵盤 / 手把 / 虛擬鍵，**畫面（canvas）本身沒有任何點擊 / 手勢入口**；
  3. `touch.js` 只有 `mode === 'auto'` 才會在 `pointerdown` / `touchstart` 時重新顯示（`markTouch()` / `applyAuto()`，`src/touch.js:257`、`:391`、`:434`），`'off'` 是強制隱藏、**沒有任何逃生口**；
  4. `setLayout` 會 `store()` 進 `KB.save.settings.touch` → `localStorage.kirbystar_global`，**重載後仍是 off**（實測 reload 後 `mode=off`、`active=false`）。
  ⇒ 手機玩家（沒有鍵盤）從此連標題選單都動不了，只能清網站資料 / 換瀏覽器。
- **重現**：
  ```bash
  .venv/bin/python shots/agent_qa11/lockout2.py       # 自動重現：設 off → 點遍所有原按鍵位置與畫面各處 → reload
  # 輸出：mode off active=False ／ 點遍後 x 49→49、anyDown=False ／ reload +2s: mode=off active=False
  ```
  手動重現：`.venv/bin/python tools/mobile_shot.py --device "Pixel 5" --scene title --eval "JSON.stringify(KB.TOUCH.rects())"` 取座標 → 用 `--touch` 走到設定 →「觸控按鍵」按兩下右 → 之後任何 `--touch` 都無效。
- **截圖**：`shots/agent_qa11/lockout_off.png`（關閉後畫面上只剩遊戲，沒有任何可按的東西）、`lockout_reload.png`（重載後依然沒有）、`set_p5p_touch_off.png` / `set_i13l_touch_off.png`（設定頁按下「關」的當下）。
- **建議修法**（擇一，都只動 touch.js / menu.js，工作量都很小）：
  1. **最穩**：`AVAILABLE`（觸控裝置）為 true 時，`mode:'off'` 只隱藏「主按鍵」，**保留一顆小小的常駐把手**（例如右上角 28px 的半透明 ▣），按下即 `setLayout({mode:'auto'})`；
  2. **次穩**：`mode:'off'` 不寫進存檔（只在本次工作階段有效），重載即回 `auto`；並在設定頁該項的提示行寫「關閉後需用鍵盤或重新整理才能開回來」；
  3. **最省事**：觸控裝置上把 `cycle` 從 `['auto','on','off']` 改成 `['auto','on']`（「關」只在非觸控裝置出現）——反正沒有觸控的桌機本來就不會顯示覆蓋層。
- **另註**：「按鍵透明度：淡（0.3）」不會鎖死（仍可按），但在亮背景關卡上很難看見；不列為問題，只是與上面同一個設定頁，修 P1 時可一併加一行提示。

### P2（體驗）

#### R11-P2-01 桌機（無觸控裝置）設定頁仍列出 4 個觸控項，版面與 Round 10 不同
- **現象**：`hasTouchApi = () => !!(KB.TOUCH && KB.TOUCH.setLayout && KB.TOUCH.layout)`（`src/menu.js:478`）。但 `touch.js` 是**無條件**建立 `KB.TOUCH`（`src/touch.js:446`），所以桌機也永遠為 true ⇒ 設定頁固定 **11 項**（`音樂音量 音效音量 按鍵提示 畫面縮放 特效強度 卡比配色 觸控按鍵 按鍵位置 按鍵大小 按鍵透明度 按鍵設定`），超過 `SET_WINDOW = 7` ⇒ 桌機也出現**捲動條與上下三角**，而這 4 項在沒有觸控的機器上完全沒有作用（`KB.TOUCH.available = false`，覆蓋層永不顯示）。Round 10 是 7 項、無捲動。
- **重現**：`.venv/bin/python shots/agent_qa11/desk.py` → 印出「桌機設定頁項目 11 [...]」；截圖 `shots/agent_qa11/d_settings_top.png`（可見右側黃色位置條）、`d_settings_bottom.png`。
- **影響**：桌機玩家多捲一頁才找得到「按鍵設定」，且看到 4 個按了沒反應的選項。不影響遊玩，但與「桌機零回歸」的目標不符。
- **建議**：`hasTouchApi` 改成 `() => !!(KB.TOUCH && KB.TOUCH.setLayout && KB.TOUCH.layout && (KB.TOUCH.available || (KB.input.touchActive && KB.input.touchActive())))`，這樣純桌機回到 7 項 / 無捲動，二合一筆電一碰螢幕就會長出來。（此改動會讓桌機設定頁回到 Round 10 版面，`test_progression` 是動態算項目數，不會壞。）

### P3（小瑕疵）

#### R11-P3-01 `KB.TOUCH.rects()` 在覆蓋層隱藏（mode off / 淡出）時仍回報 6 顆按鍵
- `rects()` 只跳過 `style.display === 'none'` 的元素；隱藏是用 `opacity:0 + pointer-events:none`，所以 `mode:'off'` 下 `rects()` 仍回 6 筆（實測），與 API 文件「隱藏的 fs 不列」的語意不一致。
- **影響**：只影響測試 / 未來要靠 `rects()` 判斷「現在有沒有按鍵」的程式（會誤判成有）。建議 `rects()` 在 `!visible` 時回 `{}`，或加一個 `visible` 欄位。
- 重現：`shots/agent_qa11/lockout2.py` 的 `rects=6` 那幾行。

#### R11-P3-02 iPad Mini 橫向把「按鍵大小」調到「大」時 D-pad 會壓到畫面左緣 39px
- 實測 size 1.2 → D-pad 199px、矩形 `[10,512,199,199]`、canvas x=170 ⇒ 重疊 39px，`KB.TOUCH.overlapping = true`（半透明壓上去，是 touch agent 刻意留的逃生口）。畫面左緣通常是背景天空，實務上影響很小；只是說明.md 最好註明「平板調『大』會半透明壓到畫面邊緣」。
- 截圖 `shots/agent_qa11/size_ipadl_big.png`。

#### R11-P3-03 iPad Mini 橫向的動作鍵仍是直排（C / B / A 疊一行）
- touch agent 原本預期「左右留白放寬到 ≥170px 後動作鍵能回到橫排叢集」，實測 170px 下仍是直排（rects：jump 937,687 / attack 936,599 / select 946,520）。可用、但拇指要上下移動，不如橫排順手。非必修。
- 截圖 `shots/agent_qa11/ipad_l_2game.png`。

#### R11-P3-04 `assets/icons/icon-512.png` 右上角星星貼著邊緣（幾乎被裁到）
- 看圖：512 版的星星尖角壓在畫布右上角外框上；192 / 180 / maskable 都正常（maskable 有內縮）。只有在某些啟動畫面 / 大圖示情境會看出來。建議下次重產時把星星往內縮 1~2 個原始像素（`tools/make_icons.py`）。

## R11-3. 已知限制（不列為問題，部署前請知悉）

- **iOS Safari 真機未驗證**：`gesturestart` 封鎖、`100dvh`、`env(safe-area-inset-*)`（Playwright 一律回報 0）、AudioContext 在 `touchend` resume、無 Fullscreen API 時 fs 鍵自動隱藏 —— 這些都只在 Chromium 模擬下看過。橫向時 START（右上）與全螢幕（左上）距離螢幕上緣只有 10px，**iPhone 橫向的瀏海 / 動態島有機會蓋到**，建議實機拿到後第一個確認這兩顆。
- Pixel 5 橫向（802×293）畫面只有 335px 寬、左右各 233px 黑邊 —— 這是 256:224 在超扁視窗下的必然結果（高度已填滿），不是 bug。
- sw 是「網路優先」：有網路時每次開都會重抓一輪（流量略高）。
- 部署前若再動任何 `src/*.js` / `index.html`，**一定要重跑 `tools/build.py`**（會同時更新 dist 與 sw.js 的 VERSION / ASSETS）。本次驗收時 VERSION `3706b3f1ae` 與檔案現況一致、dist（3,667,445 bytes、15:16）也比最新 src（touch.js 15:14）新，**不必重跑**。

## R11-4. 截圖索引（`shots/agent_qa11/`，共 78 張 + 6 支腳本）

- **版面矩陣（36 張）**：`{iphone,pixel,ipad}_{p,l}_{1title,2game,3pause,4settings,5help3,6keyconfig}.png`；數據 `matrix.json`；腳本 `matrix.py`
- **觸控實戰（12 張）**：`{p5p,i13l}_{dpad_right,dpad_up_fly,b_inhale,two_finger,paused,c_throw,after_touch_back}.png`；腳本 `play.py`
- **設定 / 版面調整（14 張）**：`set_{p5p,i13l}_{side_left,touch_off,touch_auto_back,size_big}.png`、`size_{i13l,p5p,ipadl}_{small,big}.png`；腳本 `settings.py`、`size.py`
- **P1 重現（2 張）**：`lockout_off.png`、`lockout_reload.png`；腳本 `lockout.py`、`lockout2.py`
- **dist 單檔（4 張）**：`dist_{p5p,i13l}.png`、`dist_{p5p,i13l}_jump.png`
- **http + sw（2 張）**：`http_sw.png`（Pixel 5 直，controller=true）、`http_offline.png`（iPhone 13 橫，離線重載後 GameScene）
- **桌機回歸（7 張）**：`d_title.png`、`d_game.png`、`d_help1.png`、`d_help2.png`、`d_settings_top.png`、`d_settings_bottom.png`、`d_win1280.png`；腳本 `desk.py`
- **觸控說明頁（2 張）**：`touch_help1.png`（第 1 頁鍵名已變 A / B / C / START ⇒ 總控的「HELP 第 1 頁鍵名函式化」生效）、`touch_help2.png`

## R11-5. 建議（給總控裁決）

1. **部署前必修**：R11-P1-01（三個修法任選，建議 3「觸控裝置不提供『關』」最省事，或 1「常駐把手」最完整）。修完請重跑 `tools/test_touch.py` 與 `tools/build.py`。
2. **建議一起修**：R11-P2-01（一行 `hasTouchApi` 條件），桌機設定頁即可回到 Round 10 的 7 項無捲動版面。
3. P3-01（`rects()` 語意）建議修，因為後續測試會依賴它；P3-02 / P3-03 / P3-04 可留到下一輪。
4. 說明.md 建議補兩句：①「按鍵大小調『大』在平板上會半透明壓到畫面邊緣」；②（若 P1 採修法 2）「關閉觸控按鍵後要重新整理才會回來」。
5. 拿到 iOS 真機後優先確認：橫向瀏海是否蓋到 START / 全螢幕鍵、`100dvh` 下方按鍵是否被 Safari 工具列吃掉、加到主畫面後的全螢幕與離線。
