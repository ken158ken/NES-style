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
