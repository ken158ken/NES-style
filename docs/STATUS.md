# 卡比之星 — 現況總覽（STATUS，2026-09-14）

> 新對話 / 新 agent 先讀這份。細節：規格 `SPEC.md`、每輪總結在 `PROGRESS.md`（搜尋「總結」）、任務板 `TASKS.md`、QA `QA_REPORT.md`。

## 一句話
8 輪多 agent 開發後的完整作品：7 世界 44 能力（20 基本 + 24 混合）、覺醒、夥伴、元素反應、Extra、挑戰模式、成就 / 等級 / 配色 / 存檔槽 / 按鍵設定；約 41,000 行原創程式、21 套自動測試、像素中文字型。git 76 commits（最新 `714741f`）。

## 內容規模
| 項目 | 數量 |
|---|---|
| 世界 | 7（翠綠草原 / 幽靜古堡 / 漂浮群島 / 泡泡雲海 / 迪迪迪城 / 星之彼端 / 夢幻迴廊），每世界 4~7 房 + 秘密房 + 3 大星星 |
| 能力 | 20 基本（fire sword beam cutter spark stone ice hammer / gunner ninja blade bow / mage time gravity clone / giant dragon mech ghost）+ 24 混合；每種 3~5 招 + 蓄力必殺 + 覺醒招 |
| 敵人 / 魔王 | 約 50 種敵人、5 中魔王、7 魔王（皆二階段；夢魘之核三階段）、Extra 變體 |
| 系統 | 特效 KB.VFX、元素反應與弱點、混合（台座 / 撿星 / 丟星砸敵）、夥伴 ×2（指令 / 合體）、能力 Lv1~4 + 覺醒量表、連擊與 Rank、成就 40、Extra 模式（36 房疊加層 + 魔王變體）、競技場（5~7 連戰）、挑戰（時間攻擊 / 無傷 / 10 層塔 / 每日 / Boss Rush 變體）、成績板、3 存檔槽、按鍵重映射、12 配色 |
| 音訊 | 151 sfx / 40 music / 4 環境音，全部 Web Audio 合成（audio.js） |
| 文字 | 8×8 點陣英數 + 縫合像素 12px + Unifont 16px 子集（OFL） |

## 操作
方向鍵 / WASD 移動；Z 跳（空中再按漂浮）；X 吸入 / 吐 / 招式；↓ 吞；↓+跳 滑鏟（平台上穿下）；Shift 短按丟能力星（砸帶能力敵人可混合）、長按 45 幀叫夥伴 / 吸回；↑+Shift 夥伴指令；↓+Shift 合體技；Lv4 量表滿時 跳+攻 覺醒；Enter 暫停（能力說明卡）；M 靜音；F 全螢幕。

## 品質基準（收工前全部要綠）
engine 118 / enemy 393（--extra 79）/ boss ALL PASS（kracko 2/3 WARN 已知）/ weapons 105 / magic 119 / forms 153 / charge 19 / mix 245 / mix2 343 / helper 131 / elements 96 / progression 101 / awaken 237 / extra 53 / challenge 93 / saves 67 / skins 67；level_check（含 --extra）0 error；audio_check 全過；playthrough w1~w7 --godmode 全 cleared；build 後 dist 約 3.2MB。

## 各輪摘要
1. Round 1：中文可讀、暫停 / 標題選單、操控手感、8 能力 26 招、大星星 / 秘密房 / 魔王二階段、音量 API。
2. Round 2：結算 / 開場橫幅 / 競技場、互動磁磚（X F I W）與暗房、台座 / 傳送星、新中魔王、游泳 / 騎星、環境音。
3. Round 3~4：難度平衡（死亡熱點、魔王曲線、分世界敵人強度）、UI 打磨。
4. Round 5：12 新能力 + KB.VFX 特效系統 + 47 音效。
5. Round 6：混合能力、夥伴、元素反應、W6 暗影卡比、等級 / 連擊 / 成就。
6. Round 7：mix2、Lv4 覺醒、雙夥伴、Extra 模式 + 成績板、W7 夢魘之核 + TRUE END。
7. Round 8：成就 40 + 修誤觸發、混合覺醒招、挑戰模式、存檔槽 / 按鍵設定、配色、音效。
8. 字型：像素中文字型全面替換與版面修正。

## 已知問題 / 下一步候選
- 永恆時停覺醒招對魔王僅 25%；炎劍對威斯比 40%（部位各吃上限）。
- kracko 戰鬥機器人 2/3（策略問題非平衡）。
- 候選：音樂盒、幽靈重播、關卡編輯器、成就獎勵擴充（標題背景 / 音樂）、Lv 系統平衡回饋、非無敵難度人工試玩回饋。
- 平行專案：`../紅白機遊戲開發`（研究完成，提案 A《波形迴路》可重用本引擎，需 tools/nes_lint.py）。
