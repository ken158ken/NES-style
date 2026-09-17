# 卡比之星 — 現況總覽（STATUS，2026-09-17）

> 新對話 / 新 agent 先讀這份。細節：規格 `SPEC.md`、每輪總結在 `PROGRESS.md`（搜尋「總結」）、任務板 `TASKS.md`、QA `QA_REPORT.md`。

## 一句話
10 輪多 agent 開發後的完整作品：7 世界 44 能力（20 基本 + 24 混合）、覺醒、夥伴、元素反應、Extra、挑戰模式、成就 / 等級 / 配色 / 存檔槽 / 按鍵設定；約 41,000 行原創程式、21 套自動測試、像素中文字型。git 約 85 commits。

## 內容規模
| 項目 | 數量 |
|---|---|
| 世界 | 7（翠綠草原 / 幽靜古堡 / 漂浮群島 / 泡泡雲海 / 迪迪迪城 / 星之彼端 / 夢幻迴廊），每世界 4~7 房 + 秘密房 + 3 大星星 |
| 能力 | 20 基本（fire sword beam cutter spark stone ice hammer / gunner ninja blade bow / mage time gravity clone / giant dragon mech ghost）+ 24 混合；**每種固定五招 X / ↑+X / ↓+X / 空中 X / 蓄力**（空中含漂浮中皆可出招且持續下墜）+ 覺醒招 |
| 敵人 / 魔王 | 約 50 種敵人、5 中魔王、7 魔王（皆二階段；夢魘之核三階段）、Extra 變體 |
| 系統 | 特效 KB.VFX、元素反應與弱點、混合（台座 / 撿星 / 丟星砸敵）、夥伴 ×2（指令 / 合體）、能力 Lv1~4 + 覺醒量表、連擊與 Rank、成就 40、Extra 模式（36 房疊加層 + 魔王變體）、競技場（5~7 連戰）、挑戰（時間攻擊 / 無傷 / 10 層塔 / 每日 / Boss Rush 變體）、成績板、3 存檔槽、按鍵重映射、12 配色 |
| 音訊 | 151 sfx / 40 music / 4 環境音，全部 Web Audio 合成（audio.js） |
| 文字 | 8×8 點陣英數 + 縫合像素 12px + Unifont 16px 子集（OFL） |

## 操作
方向鍵 / WASD 移動；Z 跳（空中再按漂浮）；**按住 ↑ 飛行**（地面 4 幀起飛、門前不飛、空中持續上升、水中上浮；房間頂封頂）；X 吸入 / 吐 / 招式；↓ 吞；↓+跳 滑鏟（平台上穿下）；Shift 短按丟能力星（砸帶能力敵人可混合）、長按 45 幀叫夥伴 / 吸回；↑+Shift 夥伴指令；↓+Shift 合體技；Lv4 量表滿時 跳+攻 覺醒；Enter 暫停（能力說明卡）；M 靜音；F 全螢幕。

## 品質基準（收工前全部要綠）
engine 167 / enemy 393（--extra 79）/ boss ALL PASS / weapons 417 / magic 248 / forms 315 / charge 140 / mix 701 / mix2 801 / helper 131 / elements 96 / progression 101 / awaken 240 / extra 53 / challenge 93 / saves 67 / skins 67；font_subset --check 無缺字；level_check（含 --extra）0 error；audio_check 全過；playthrough w1~w7 --godmode 全 cleared；build 後 dist 約 3.2MB。

## 各輪摘要
1. Round 1：中文可讀、暫停 / 標題選單、操控手感、8 能力 26 招、大星星 / 秘密房 / 魔王二階段、音量 API。
2. Round 2：結算 / 開場橫幅 / 競技場、互動磁磚（X F I W）與暗房、台座 / 傳送星、新中魔王、游泳 / 騎星、環境音。
3. Round 3~4：難度平衡（死亡熱點、魔王曲線、分世界敵人強度）、UI 打磨。
4. Round 5：12 新能力 + KB.VFX 特效系統 + 47 音效。
5. Round 6：混合能力、夥伴、元素反應、W6 暗影卡比、等級 / 連擊 / 成就。
6. Round 7：mix2、Lv4 覺醒、雙夥伴、Extra 模式 + 成績板、W7 夢魘之核 + TRUE END。
7. Round 8：成就 40 + 修誤觸發、混合覺醒招、挑戰模式、存檔槽 / 按鍵設定、配色、音效。
8. 字型：像素中文字型全面替換與版面修正。
9. Round 9（2026-09-15）：操作重構——按住 ↑ 飛行、漂浮中 X 出招、空中可出招且下墜、44 能力五招齊全（新增約 70 招）、水中 ↑ 上浮、房頂封頂。
10. Round 10（2026-09-17）：貼身招判定加倍——`KB.PHYS.meleeScale = 2` + entity.js Hitbox 自動規則（`melee:true/false` 可強制）；44 能力 459 個貼身框 w/h 皆 ×2、395 個投射物零改動；非無敵實戰 sword/spark/blade 6/6 通關（R9 為 1/6）。

## 已知問題 / 下一步候選
- Round 10 待使用者裁決：① 過大框 48 招（最大 stonegiant 空中 X 192×72、giant ↑X 80×128），嫌誇張就把該行 `melee:true` / `mbox` 改回；② 例外清單（spark 蓄力電擊波 96×80 未放大；time / gravity / clone / ghost 共 9 招維持原尺寸）見 QA_REPORT R10-2；③ 判定超出特效（blade X、sword X、giant ↑X）需美術跟進；④ `__kb.entities()` / enemy_test HOOK_JS 可加 w0/h0/meleeScaled。
- 永恆時停覺醒招對魔王僅 25%；炎劍對威斯比 40%（部位各吃上限）。
- kracko 戰鬥機器人 2/3（策略問題非平衡）。
- 說明頁第 1 頁「可一直上升」字面與房頂封頂略有出入（右欄已滿，待重寫）；def.hover 為能力粒度，逐招需求靠 abilities 內改寫；atkDir / pickMode 工具在四個 abilities 檔各有一份，可收斂到 const.js。
- 候選：音樂盒、幽靈重播、關卡編輯器、成就獎勵擴充（標題背景 / 音樂）、Lv 系統平衡回饋、非無敵難度人工試玩回饋。
- 平行專案：`../紅白機遊戲開發`（研究完成，提案 A《波形迴路》可重用本引擎，需 tools/nes_lint.py）。
