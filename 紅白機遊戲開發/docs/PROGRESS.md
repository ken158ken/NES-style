# 研究進度（PROGRESS）

## 2026-09-12 啟動：7 個研究 agent 平行
| agent | 產出 |
|---|---|
| hw | 01_硬體規格與限制.md |
| catalog | 02_遊戲名錄與類型.md、02b_年表與里程碑.md |
| deep-action | 03_經典遊戲深度解析/（動作 / 平台 8 款） |
| deep-rpg | 03_經典遊戲深度解析/（RPG / 解謎 / 其他 7 款） |
| design-art | 04_遊戲設計模式.md、05_美術與像素規範.md |
| audio | 06_音樂音效_2A03與chiptune.md |
| handheld-tools | 07、08、09、10 |

## hw
- 2026-09-12 — 完成 `01_硬體規格與限制.md` 全文（682 行）：主機概觀 / CPU / PPU / APU / mapper / 設計影響 / 模擬器 / 附錄，共 8 章 — 來源 58 筆
- 2026-09-12 — §1 主機概觀（Famicom vs NES 差異表、FDS、Zapper / Power Pad / Family BASIC / R.O.B.）— 來源 5 筆
- 2026-09-12 — §2 CPU 2A03（無 BCD、記憶體映射表、NMI/IRQ、29780.5 cycle 影格預算表）— 來源 4 筆
- 2026-09-12 — §3 PPU（256×240/可見 224、磁磚與圖樣表、名稱表與 16×16 屬性、64 色系統調色盤含 RGB 對照表、OAM 與 8 精靈上限、8×8/8×16、捲動與鏡像、精靈 0 命中、VBlank 160–200 bytes）— 來源 10 筆
- 2026-09-12 — §4 APU（方波占空比表、三角波、雜訊 16 週期表 NTSC/PAL、DPCM、非線性混音公式、音樂驅動程式）— 來源 7 筆
- 2026-09-12 — §5 卡帶與 mapper（NROM/MMC1/UNROM/CNROM/MMC3/MMC5/VRC6 對照表、CHR ROM vs RAM、電池 SRAM 與密碼、容量演進 24KB→2MB）— 來源 12 筆
- 2026-09-12 — §6 限制如何塑造設計（15 條限制 × 代表遊戲對照表）— 來源 6 筆
- 2026-09-12 — §7 模擬器準確度與常見坑（Mesen 100% / Nestopia 94.87% / FCEUmm 53.85%、PAL 慢 17%、色彩與混音差異、13 個坑）— 來源 3 筆
- 2026-09-12 — §8 附錄（關鍵數字速查表一頁、參考資源清單含 Displaced Gamers 影片標題）— 來源 11 筆

## catalog
- 2026-09-12｜完成 `02_遊戲名錄與類型.md`（13 類型、188 款遊戲條目、784 行，含每類型「設計慣例 5 條」與「可借鑑點」）｜來源 40+（Wikipedia、NESdev Wiki、NesCartDB、MobyGames、Nerdly Pleasures）｜mapper / 存檔欄位經 NesCartDB 逐款查證
- 2026-09-12｜完成 `02b_年表與里程碑.md`（1983–1995 逐年事件與代表作、銷量前 20 / 前 30、日美歐差異、現代 homebrew 33 款 + 發行商 + 官方復刻管道、技術里程碑速查、661 行）｜來源 60+（Wikipedia、NESdev Wiki / 論壇、NesCartDB、VGHF、Hackaday、Evercade、Tedium）

## deep-action
- 2026-09-12 完成 03_經典遊戲深度解析/01_超級瑪利歐兄弟.md（269 行，來源 10 筆；含 SMBDIS.ASM 反組譯實測物理常數）
- 2026-09-12 完成 03_經典遊戲深度解析/02_超級瑪利歐兄弟3.md（來源 9 筆）
- 2026-09-12 完成 03_經典遊戲深度解析/03_洛克人2.md（來源 8 筆；含完整武器傷害表）
- 2026-09-12 完成 03_經典遊戲深度解析/04_惡魔城.md（來源 9 筆；含敵人/魔王耐打數與分段傷害表）
- 2026-09-12 完成 03_經典遊戲深度解析/05_魂斗羅.md（來源 8 筆）
- 2026-09-12 完成 03_經典遊戲深度解析/06_忍者外傳.md（來源 8 筆）
- 2026-09-12 完成 03_經典遊戲深度解析/07_星之卡比_夢之泉物語.md（來源 8 筆；含 25 種複製能力表）
- 2026-09-12 完成 03_經典遊戲深度解析/08_唐老鴨夢冒險.md（來源 10 筆；mapper/容量標記待查）
- 2026-09-12 deep-action 全部 8 份完成（01–08），合計 2039 行、來源 70 筆

## deep-rpg
- 2026-09-12 完成 `03_經典遊戲深度解析/09_薩爾達傳說.md`（242 行，來源 11 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/10_銀河戰士Metroid.md`（199 行，來源 13 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/11_勇者鬥惡龍III.md`（202 行，來源 10 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/12_FinalFantasy.md`（208 行，來源 11 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/13_俄羅斯方塊與DrMario.md`（201 行，來源 12 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/14_拳無虛發PunchOut.md`（190 行，來源 11 筆）
- 2026-09-12 完成 `03_經典遊戲深度解析/15_忍者蛙Battletoads.md`（199 行，來源 11 筆）
- 2026-09-12 deep-rpg 全部 7 份完成（09–15），合計 1441 行、來源 79 筆

## design-art
- 2026-09-12 完成 `04_遊戲設計模式.md` ①關卡設計模式（起承轉合 / 安全教學區 / 風險回報 / 祕密 / 檢查點 / 節奏 / 自動捲動 / 垂直房）— 來源 8 筆
- 2026-09-12 完成 `04` ②敵人設計（六行為原型、組合謎題、生成復活規則、教學順序）— 來源 3 筆
- 2026-09-12 完成 `04` ③魔王設計（模式循環 / 預警幀 / 弱點窗口 / 多階段 / 競技場 / Boss Rush）— 來源 3 筆
- 2026-09-12 完成 `04` ④道具與成長、⑤難度（曲線 / 懲罰 / 輔助 / Konami Code / 密碼系統）— 來源 9 筆
- 2026-09-12 完成 `04` ⑥手感 Game Feel（跳躍曲線 / 可變跳躍 / 子像素 / coyote time / 無敵幀 / hit stop / 震動 / 加速度表）— 來源 7 筆
- 2026-09-12 完成 `04` ⑦UI/HUD、⑧存檔密碼續關、⑨多人與競爭、⑩設計檢查表 30 條 — 來源 8 筆
- 2026-09-12 `04_遊戲設計模式.md` 全文完成，709 行，來源 38 筆
- 2026-09-12 完成 `05_美術與像素規範.md` ①NES 色彩系統實務（64 色值 / 25 色同屏 / 16×16 屬性區塊與 5 種繞法 / 調色盤配置範例）— 來源 5 筆
- 2026-09-12 完成 `05` ②磁磚經濟（256 磁磚背景與精靈預算表、翻轉重用、16×16 元磁磚、CHR bank 動畫）— 來源 6 筆
- 2026-09-12 完成 `05` ③精靈規範（OAM 結構、8×8 vs 8×16、角色組成、OAM 循環閃爍策略、大魔王用背景層、優先權）— 來源 6 筆
- 2026-09-12 完成 `05` ④動畫幀數慣例（3 幀 1-2-1-3 走路、各動作幀數表、幀數 vs 磁磚成本、子像素動畫）— 來源 4 筆
- 2026-09-12 完成 `05` ⑤背景層次與假視差（sprite 0 hit 狀態列、6 種假視差、色彩循環參數、閃電幀序）— 來源 5 筆
- 2026-09-12 完成 `05` ⑥像素藝術原則、⑦掌機差異（GB / GBC / GBA 規格對照與構圖影響）— 來源 10 筆
- 2026-09-12 完成 `05` ⑧工具、⑨原創美術風格建議（法律紅線 / 安全區 / 視覺識別方案）、⑩檢查表 30 條 + 建議美術規格總表 — 來源 8 筆
- 2026-09-12 `05_美術與像素規範.md` 全文完成，724 行，來源 40 筆


## audio
- 2026-09-12 完成 `06_音樂音效_2A03與chiptune.md` 全 9 章（2A03 五聲道 / 作曲技法 / 名曲分析 / 音效設計 / 工具鏈 / Web Audio 復刻 / GB-GBA 差異 / 工作流程與 20 條檢查表 / 來源），854 行，來源 73 筆（NESdev Wiki、gbdev、GBATEK、FamiStudio / GGSound / hUGETracker / Krawall 文件、web.dev 音訊排程、近藤浩治 / 椙山浩一 / 田中宏和 / 立石孝 / 松前真奈美 / 石川淳 / 古代祐三 / 植松伸夫 / 下村陽子訪談）。


## handheld-tools
（agent 在此追加）
- [2026-09-12] 完成：`docs/research/07_掌機_GB_GBC_GBA_規格與差異.md`（385 行）；內容：GB/GBC/GBA 三機規格、四機對照表、圖形/音源/卡帶/通訊逐項比較、代表作、與 NES 的設計差異；來源數：13
- [2026-09-12] 完成：`docs/research/08_開發工具鏈與模擬器.md`（509 行）；內容：三路線比較（瀏覽器假復古 / NES ROM / GB・GBA ROM）、模擬器準確度、Linux 安裝指令、FCEUX・Mesen・mGBA Lua 自動截圖、AI agent 工作流、發佈方式；來源數：33
- [2026-09-12] 完成：`docs/research/09_法律與原創原則.md`（387 行）；內容：任天堂公開立場與執法紀錄、Sega v. Accolade / Atari v. Nintendo 判例、R0~R6 風險分級、程式碼・素材・音樂・名稱・UI 五類界線、發佈慣例、5 組檢查表（含自動化掃描指令）、CC0/CC-BY/MIT/zlib/GPL/OFL 授權速查；來源數：24
- [2026-09-12] 完成：`docs/research/10_專案提案.md`（427 行）；內容：3 個原創方案（A 波形迴路=瀏覽器假復古・重用 ../卡比之星 引擎、B 節拍要塞=真 NES ROM、C 迴聲塔=真 GBC ROM），各含概念/骨架/路線/核心迴圈/技術規格/內容規模/4-8-12 週里程碑/風險，末附三案比較表與推薦順序（A→B→C）與 12 週綜合排程；來源數：20

## 總結（總控，2026-09-12）
7 個研究 agent 全部完成：01 硬體（682 行 / 58 源）、02 名錄 188 款（784 行）+ 02b 年表（661 行）/ 82 源、03 深度解析 15 款（3,480 行 / 149 源）、04 設計模式（709 行）+ 05 美術規範（724 行）/ 78 源、06 音樂（854 行 / 73 源）、07~10 掌機 / 工具鏈 / 法律 / 提案（1,708 行 / 90 源）。index.html 已編譯（617KB）。
下一步：依 10_專案提案.md 開工方案 A（可重用 ../卡比之星 引擎），第 1 週先做 tools/nes_lint.py（NES 規格自律）與剪影 / 三特徵原創性檢查。

## 2026-09-14 計畫改版
使用者定調：不做 ROM，用現代程式原汁原味還原紅白機（考驗實作能力）。已寫 docs/PLAN.md（還原標準表、engine/ 架構、第一款橫向平台、R1~R5 里程碑）。待使用者確認第一款類型後開 R1。

## core
（agent core：engine/fixed.js、engine/input.js、engine/cpu_timing.js、tools/test_core.py）

- 2026-09-17 — 完成 R1 core 三個模組 + 自動測試；`tools/test_core.py` **90 項全過**（`../卡比之星/.venv/bin/python tools/test_core.py [-v]`）。

### 完成項
| 檔案 | 內容 |
|---|---|
| `engine/fixed.js` `NES.FX` | 三層整數單位：位置 `sub`=1/16 px（`SUB=16`）、速度 `vel`=1/256 px/幀（`VEL=256`，8.8）、加速度 `acc`=1/4096 px/幀²（`ACC=16`）。`toSub/toPx/floorPx/ceilPx/roundPx/subFrac`、`v88(hi,lo)`（負速度傳負 hi）、`velToPx/pxToVel/accToPx/pxToAcc/smbSpd/smbGrav`、`addVel(posSub,v88,frac)` 與 `addAcc(v,acc,frac)`（餘數在 `.frac`，`>>4`/`&15` 算術右移＝floor，負數餘數恆 0..15）、零配置小物件 `Vec{sub,frac}`＋`vadd/vsetPx/vsetSub/vpx/vpxf` 與 `Acc{v,frac}`＋`aadd/aset/aapproach`、整數工具 `clamp/sign/abs/absMax/mulShr`、**`NES.FX.SMB` 常數表**（每欄標原始位元組，來源 `docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md` ②／SMBDIS.ASM）：`maxRun/maxWalk/maxWater/maxCutscene`、`accRun/accWalk/friction/turnShift`、`airRunSpeed`、5 段 `jump[]`（`vy0/gHold/gFall/belowSpeed/h`）＋`jumpFor()`、`swim/whirlpool`、`diffToHaltJump`、`enemySlow/enemyFast`、`intervalTimer/injuryFrames/starFrames`。 |
| `engine/input.js` `NES.Input` | `BTN`（A1 B2 SELECT4 START8 UP16 DOWN32 LEFT64 RIGHT128）；預設鍵盤 方向鍵/WASD、Z=A、X=B、Enter=START、Shift=SELECT，`remap(obj)`/`resetMap()`（吃 `KeyboardEvent.code`，退 `key`）；`poll()` 一幀一取樣（鍵盤事件只改 `liveMask`，`held/pressed/released/mask` 一律讀快照）；`pressed/released` 只在邊緣為真；`inject(mask,frames)` 可鏈式接多段＋`injectSeq/clearInject/injectPending`；`record()/stopRecord()→陣列/replay(arr)/replayPending()`；來源優先權 **replay > inject > 鍵盤｜Gamepad**；Gamepad API 可選（`useGamepad(true)`，標準配置 + 類比軸）；`attach/detach/reset/pollCount/maskToString/parseMask`。 |
| `engine/cpu_timing.js` `NES.Timing` | `create({update,draw,hz,mode,maxCatchUp,budgetBytes})` → `{start,stop,step(n),frame,hz,mode,running,dropped,setMode('ntsc'|'pal'),setHz,stepMs,setCallbacks,reset,budget}`；rAF 累加器固定 1/hz 步進、**一次最多補 3 幀，剩餘直接丟幀**（`dropped` 計數，不做 dt 補間）；`step(n)` 同步跑 n 幀，每幀順序 `budget.reset() → NES.Input.poll() → update(frame) → draw(frame)`；`budget{limit,used,over,overFrames,peak,set,use,left,reset,clear}` 模擬 VBlank 寫入預算（NTSC 預設 160 bytes、PAL 500，來源 01 §2.4）。 |
| `tools/test_core.py` | 零相依（about:blank + `add_script_tag` 只載入自己三檔）；89 項斷言。 |

### 契約差異（相對 docs/TASKS.md §API 契約）
1. **新增第三層單位 `acc`（1/4096 px/幀²）**。契約只寫了「位置 1/16 px、速度 8.8」，但 SMB 的 `FrictionData` 精度是 1/256 速度值/幀 = 9.5 vel/幀（非整數），純 vel 無法整數表示。新單位讓 SMB 的原始位元組（`$e4/$98/$d0`）**可以直接當數值用**，且累加語意與位置層完全相同（都是 `>>4`/`&15`）。附 `addAcc / Acc / aadd / aapproach`。
2. `addVel` 由 `(posSub, v88)` 擴充為 `(posSub, v88, frac)`，第三參數可省略（預設 0）；餘數同時放在 `NES.FX.addVel.frac` 與 `NES.FX.frac`。理由：餘數若存在模組單例上，多個實體共用會互相污染；正式用法建議走零配置的 `Vec{sub,frac}`。
3. `toPx(sub)` 是唯一回傳非整數的函式（1/16 的倍數，顯示／除錯用）；引擎內部一律用 `floorPx`。
4. `v88(hi, lo)`：`hi < 0` 時回傳 `-(|hi|*256+|lo|)`，所以 `v88(-2,128) === -640`（若照字面 `hi*256+lo` 會得到 -384）。
5. `Timing.create` 回傳物件比契約多：`mode / dropped / setHz / stepMs / setCallbacks / reset`，`budget` 多 `limit/used/overFrames/peak/left/clear`。`maxCatchUp`（預設 3）與 `budgetBytes` 為可選參數。`setMode` 會連帶把 VBlank 預算換成該制式的值，但若已呼叫過 `budget.set()` 就不覆蓋。
6. `Input` 比契約多：`injectSeq / clearInject / injectPending / replayPending / pressedMask / releasedMask / prevMask / liveMask / pollCount / attach / detach / reset / useGamepad / resetMap / bit / maskToString / parseMask`。`inject` 回傳自身以便鏈式接多段。
7. `inject(mask, frames)` 的 `frames <= 0` 定義為「放開／清空注入佇列」，以相容 `engine/nes.js` 除錯 API 的 `release()`（它呼叫 `inject(0, 0)`）。
8. `input.js` 載入時會自動 `attach(window)`（有 `document` 才會）；`nes.js` 若要換焦點目標請呼叫 `NES.Input.attach(el)`。

### 測試數
90 項全過。涵蓋：
- **定點數（36 項）**：`toSub/toPx` 來回（含負數與 1/16 倍數完全復原）、`floorPx` 負數向下取整、`addVel` 餘數逐幀累積（正 / 負速度、餘數恆 0..15、floor 語意）、`Vec` 版與 `addVel` 逐幀完全一致（97 幀）、SMB 常數表數值與 px 換算、**等速 60 幀位移 2400 sub / 1440 sub（誤差 0 sub）**、靜止→跑步上限 **45 幀**（文件 45）、→走路上限 **41 幀**（文件 40）、轉身加速度 ×2 → **23 幀**、5 段跳躍最高點 62 / 62 / 66.31 / 77.50 / 77.50 px（文件 64 / 64 / 68 / 80 / 80）、點放 A 最短跳 16.31 px（文件 ≈18）、`clamp/sign/absMax`。
- **輸入（28 項）**：`BTN` 位元、`inject` 序列的 `held/pressed/released` 邊緣、連續多段 inject（跨段同鍵不重觸發）、`record→replay` 8 幀逐幀一致與用完回鍵盤、`page.keyboard` 按下後 **poll 前 `held` 仍為 false**（放開亦然）、`inject(m,0)` 清空佇列、inject 優先於鍵盤、`remap` 生效、`maskToString/parseMask` 對稱。
- **時序（26 項）**：`step(60)` → `frame` 恰 60、update/draw 各 60 次、順序 `u0,d0,u1,d1`、`Input.poll` 恰 60 次且在 update 之前（update 內讀得到當幀注入的遮罩）、budget 超支 / 未超支 / `overFrames` 累計 / `peak` / `left` / 每幀 reset、`hz` 60.0988↔50.0070 與步長 ms、未知模式 throw、rAF `start/stop` 600 ms 推進 33 幀且 stop 後不再推進、`reset()`。

### 已知問題
1. **跳躍高度比研究文件的連續公式低 2～2.5 px**（62 vs 64、77.5 vs 80）。原因是半隱式 Euler（每幀先加重力再移動），這也是實機 6502 的寫法；文件的 64/80 px 是 `v²/2g` 的連續解。R2 主角實作若要嚴格對上「4 格 / 5 格」，可在起跳第一幀略過一次重力（會剛好補回 4 px 與 5 px），屆時由 core 提供開關。
2. 走路加速 41 幀 vs 文件 40 幀：文件是 `24 ÷ 0.594` 的連續除法（40.4），整數累加取 41 才真的達標，屬同一數字的取整差。
3. Gamepad 分支沒有自動測試（headless 無裝置），只做過程式碼層檢查；第二手把（$4017）與四人轉接器未實作。
4. `budget` 目前只是計數器，沒有人呼叫 `use()`；要讓「VBlank 只能寫 160 bytes」變成真限制，需 ppu agent 在 `setTile/setAttr/sprite` 等寫入點呼叫 `NES.Timing` 當前實例的 `budget.use(n)`。core 已保留 API，介面確定後再接。
5. `NES.Input` 是模組單例（實機也只有一組手把暫存器），因此同一頁面兩個 `Timing` 實例會共用輸入快照；測試時記得 `Input.reset()`。

## ppu
> R1 核心引擎 ｜ agent: ppu ｜ 2026-09-17 ｜ 擁有檔案：`engine/palette.js`、`engine/ppu.js`、`tools/test_ppu.py`

### 完成項
| 項目 | 狀態 | 依據 |
|---|---|---|
| `engine/palette.js` v1.0.0：64 色 NTSC RGB 表、`FORBIDDEN=[0x0D]`、`rgb(i)`、`nearest(r,g,b)` | ✅ | 01 §3.4 表（來源 ROM Detectives Wiki 2C02 表）寫在檔頭 |
| 底色 + 4 組背景 / 4 組精靈調色盤（每組 3 色、索引 0 = 底色 / 透明），設 $0D 直接 throw | ✅ | 01 §3.4、05 §1.2 |
| 名稱表 ×2 實體（各 960 byte）+ 屬性表（各 64 byte、16×16 區塊、bit 排列 (右下<<6)\|(左下<<4)\|(右上<<2)\|(左上<<0)） | ✅ | 01 §3.3、05 §1.3 |
| 水平 / 垂直鏡像（邏輯 nt 0..3 → 實體 0/1，寫入即 alias） | ✅ | 01 §3.3 鏡像表 |
| 8×8 磁磚經 `NES.CHR.get(table, idx)`；未載入 chr.js 時用內建假磁磚 | ✅ | TASKS 契約 |
| OAM 64 精靈（x, y, tile, pal, flipH, flipV, behind）、8×8 / 8×16（磁磚 bit0 選圖樣表、下半自動用下一磁磚） | ✅ | 01 §3.5、05 §3.1 |
| 每掃描線最多 8 個精靈、第 9 個起不畫；`flicker:'rotate'` 每幀 OAM 起點 +8（NESdev OAM cycling） | ✅ | 01 §3.5、05 §3.3 |
| 精靈間優先權（掃描順序在前者在上）、精靈 vs 背景 `behind` | ✅ | 05 §3.5 |
| `scroll(x, y)` 含跨名稱表邊界（X 模 512、Y 模 480）、`split(scanline, {x, y, nt})` 分割捲動 | ✅ | 01 §3.6、05 §5.1 |
| `render()`：逐掃描線寫 `ppu.frame`（Uint8ClampedArray 256×240×4）→ 256×240 離屏 canvas → 整數倍放大、`imageSmoothingEnabled=false`、裁上下各 8 列只顯示 224 | ✅ | 01 §3.1 |
| `ppu.stats = {colors, maxSpritesLine, flickered}` | ✅ | TASKS 契約 |

### API 與契約差異（`docs/TASKS.md` §API 契約）
契約列出的名稱與行為**全部實作且不變**。以下為**新增**（向後相容，供 nes_lint / 測試 / demo 使用），請 tools agent 一併寫進 `docs/ENGINE_API.md`：

1. `scroll(x, y[, nt])` — 多一個可選的基底名稱表參數（0..3）；省略則沿用上次。契約只寫 `scroll(x, y)`，行為不變。
2. **讀取器**：`getTile(nt,col,row)`、`getAttr(nt,col16,row16)`、`getBgPalette(i)` / `getSprPalette(i)`（回傳 `[底色, c1, c2, c3]`）、`getSprite(i)`、`getScroll()`、`mirroring()`（無參數時回傳目前模式）、`spriteMode()`（無參數時回傳 8/16）、`oamStart()`。
3. `fillAttr(nt, col16, row16, w, h, pal)` — `fillTiles` 的屬性表版本。
4. `setPatternTables(bgTable, sprTable)` — 預設背景用表 0、精靈用表 1（8×16 時由磁磚 bit0 決定，覆寫 sprTable）。
5. `setScale(n)`；`create(canvas, opts)` 的 `opts`：`scale`（預設 **3**，非 1..16 整數會 throw）、`flicker`（預設 **'rotate'**）、`flickerStep`（預設 8）。
6. **`create(null, …)` 允許無 canvas**（headless）：仍會產出 `ppu.frame` / `ppu.indexFrame`，供離線測試與 lint 用。
7. `ppu.indexFrame`（Uint8Array 256×240，每像素最終的 NES 色號）與 `colorAt(x,y)` / `rgbAt(x,y)` / `colorAtVisible(x,y)`（可見區座標，自動 +8）/ `usedColors()`。**建議 `NES.Lint.frame(ppu)` 直接吃 `indexFrame`，不必逐像素解 RGB。**
8. `ppu.stats` 除契約三項外另有：`dropped`（本幀被 8 精靈上限丟掉的「精靈×掃描線」數）、`overLines`（超過 8 個的掃描線陣列，供 `Lint.frame()` 的 `overLine[]`）、`sprites`（啟用中的精靈數）、`ms`（本次 render 耗時）、`frames`。
9. `NES.PPU` 常數：`WIDTH=256`、`HEIGHT=240`、`VISIBLE_HEIGHT=224`、`OVERSCAN=8`、`MAX_SPRITES=64`、`MAX_SPRITES_PER_LINE=8`、`MAX_COLORS=25`、`VERSION`。
10. `NES.PALETTE` 附加：`hex(i)`、`isForbidden(i)`、`assert(i, where)`（其他模組驗色號用）、`SIZE`、`VERSION`、`SOURCE`。
11. `sprite(i, null)` = 關閉該精靈（等同 `clearSprites()` 的單筆版）。

**行為定義（契約未寫明、此處定案）**
- `split(scanline, s)`：`scanline` **含**該列；下半段第一條掃描線顯示 world y = `s.y`（模擬 sprite 0 hit 後重寫 $2005/$2006 的效果），而不是延續上半段的捲動。`split(null)` 取消。
- `stats.flickered` = **本幀有精靈被丟掉（即 > 8 個）的掃描線數**（0 表示沒閃爍）；要知道丟了幾個看 `stats.dropped`。
- `stats.colors` 統計**整張 256×240**（含被裁掉的上下各 8 列）實際出現的 NES 色號數；若 lint 只想算可見區，請用 `indexFrame` 自行掃 y=8..231。
- 鏡像：`'h'` = 水平鏡像（$2000/$2400 同、$2800/$2C00 同，上下兩張不同，適合垂直捲動）；`'v'` = 垂直鏡像（$2000/$2800 同、$2400/$2C00 同，左右兩張不同，適合水平捲動）— 與 01 §3.3 一致。
- 屬性表座標 `row16` 只到 **14**（第 15 列屬性 byte 的下半在 30 列的名稱表中用不到，與硬體一致）。

### 測試
`tools/test_ppu.py`（Playwright / Chromium headless，`about:blank` + `add_script_tag` 只載入 `palette.js`、`ppu.js`，零外部相依）

```
../卡比之星/.venv/bin/python tools/test_ppu.py
→ 總計 116 / 116 通過
```

涵蓋：調色盤 64 色與色值抽驗、`$0D` 在 backdrop / 背景盤 / 精靈盤都 throw、`nearest` 不回傳禁用色、名稱表與屬性表寫讀（含同 byte 四象限獨立、越界 throw）、水平 / 垂直鏡像 alias、屬性表 16×16 上色、捲動（fine X 位移 1px、x=248 跨名稱表邊界、x=512 回繞、y=232 垂直跨表）、分割捲動（上下半段像素不同、分割線前後歸屬、只動下半不影響上半、`split(null)` 還原）、精靈翻轉 H/V、調色盤切換、優先權（`behind` 對不透明 / 透明背景、OAM 索引順序）、**9 個精靈同線第 9 個不畫**、`flicker='none'` 時第 9 個永遠不出現、**`flicker='rotate'` 兩幀合集涵蓋全部 9 個**（8 幀內每個都曾出現）、8×16 模式（上下半磁磚、第 16 列以下無、flipV、切回 8×8）、同屏色數統計（25 色場景 = 25、移除精靈 = 13、單盤 = 4）、`frame` RGBA 內容、canvas 尺寸 = 256×224×scale、`imageSmoothingEnabled=false`、**裁切驗證（畫布第 0 列 = 內部第 8 列、最後一列 = 內部第 231 列）**、非整數 scale throw、有 `NES.CHR` 時改用外部 CHR、頁面無 JS 例外。

### 截圖
- `shots/agent_ppu/ppu_demo.png` — demo 場景（狀態列分割 + 捲動世界 + 主角 4 精靈 + 同線 12 敵人 → 只畫 8 個）
- `shots/agent_ppu/ppu_flicker_f2.png` — 下一幀，OAM 輪替後改畫另外 8 個（兩張合起來 12 個全到齊）
- `shots/agent_ppu/ppu_page.png` — 整頁
已用 Read 看圖確認：狀態列、天空底色、地面、遠景、磚塊、主角與敵人都正確畫出，兩幀的敵人組別確實不同。

### 效能
`render()` 平均 **0.45 ms / 幀**（Chromium headless、120 幀、64 個精靈、每線最多 16 個精靈觸發丟棄、每幀變更捲動與分割），**目標 < 4 ms，達成約 9 倍餘裕**（≈ 60fps 幀預算 16.7ms 的 2.7%）。作法：全程 typed array、`Uint32Array` 視圖一次寫 RGBA、每幀預算色表、逐磁磚（非逐像素物件）內迴圈、tile 每幀快取。

### 已知問題 / 未實作
1. **精靈 0 命中未實作**（任務允許省略）：畫面分割一律用 `split(scanline, …)` 明確指定掃描線，等同 MMC3 IRQ 的能力（可靠、不受精靈 0 位置限制）。若 demo 想演出「真・sprite 0 hit」需另外補。
2. 未模擬 PPUMASK 的左側 8 像素裁切、灰階位元、色彩強調（emphasis）位元。
3. 只有 2 張實體名稱表（h/v 鏡像）；single-screen 與 four-screen 未支援（PLAN 也只要求 ×2）。
4. 未模擬 OAM 的 Y 座標 −1 掃描線延遲與 $EF–$FF 隱藏規則：`sprite()` 的 y 即螢幕掃描線座標，關閉精靈請用 `sprite(i, null)` / `clearSprites()`。精靈溢位旗標（含硬體 bug）不模擬，改用 `stats.overLines`。
5. CHR 磁磚在單次 `render()` 內快取；若要做 CHR bank 動畫，請在兩次 `render()` 之間切 bank（同硬體只能在 VBlank 改的限制）。
6. 捲動 X/Y 以 512/480 取模，等同「兩張名稱表無限重複」；真機 Y 在 240–255 會顯示屬性表垃圾，此處不重現（`[推論]` 對遊戲開發無益）。

## tools
- [2026-09-17 18:0x] 完成：`engine/nes.js`（NES.VERSION / NES.boot / `?debug=1` 的 `window.__nes`）、`game.html`（engine 契約載入順序 + games 佔位、整數放大置中、鍵盤焦點、F 全螢幕、顯示 224 列）、`tools/shot.py`（Playwright 截圖，語法沿用卡比：`--script "press right 40; tap a 1; step 30; shot name"`、`--seq 6:4`、`--scale`、`--lint`、`--state/--stats/--console`）、`tools/build.py`（單檔 `dist/星塵勇者.html`，`--check` 驗載入順序）、`tools/run_all.sh`（node --check → `tools/test_*.py` → build --check → 冒煙截圖 → nes_lint.py 抽查 → PASS/FAIL 表）、`docs/ENGINE_API.md`（14 節正式 API 文件）。
- **容錯設計**：任一 engine 模組缺席都不會讓 boot 失敗（PPU / Input / Timing 有 stub，APU / Music / Lint 略過），缺席清單在 `nes.missing` 與 `__nes.stats().missing` ⇒ R1 平行開發期間 `game.html` 隨時可開。
- **除錯 API**：`__nes.step(n) / press(mask|['a','right'], n) / tap(...) / release() / render() / state() / frame() / lint() / stats() / missing() / setScale(s)`。debug 時 Timing **不自動 start**（畫面只由 step 推進 ⇒ 截圖可重現）；非 debug 時 start，並在使用者第一次 keydown / pointerdown 才 `apu.connect(AudioContext)`。
- **契約核對結果（2026-09-17，全 10 檔到齊後實測）**：node --check 10/10 OK；playwright 依契約順序載入全套，80 項契約檢查 **79 通過**、0 console error。差異詳見 `docs/ENGINE_API.md` §14（D1~D7）。
- **跨檔需求（請對應 agent 處理，我沒有動別人的檔）**：
  1. **D2（ppu ↔ chr-lint）**：PPU 統計叫 `ppu.stats.overLines`（複數），`NES.Lint.frame()` 讀 `ppu.stats.overLine`（單數）⇒ lint 的 `overLine` 永遠是空的，實測 12 個精靈同線也不回報。建議 nes_lint.js 兩個名字都讀。
  2. **D3（ppu ↔ chr-lint）**：`NES.Lint.oam(ppu)` 需要 `ppu.oam`，但 PPU 只有私有 `_oamX/_oamY/...` ⇒ OAM 檢查目前完全跑不動。建議 PPU 補公開 `oam` 存取器。
  3. **D1（core）**：`NES.FX.addVel` 實作是 `addVel(posSub, v, frac) → posSub`（餘數在 `NES.FX.frac`），契約寫的是回傳 `{pos, frac}`。功能等價，但 R2 手感實作前請定案一種寫法（ENGINE_API §3 目前記的是實作版）。
- **驗證 / 截圖**：`bash tools/run_all.sh` 全 PASS（node --check 10 檔、test_core.py、test_ppu.py 116/116、build --check、冒煙截圖、nes_lint.py 抽查 6 張 0 違規）；`shots/agent_tools/boot.png`（無 demo：黑畫面、0 錯誤、768×672 = 256×224 ×3）、`shots/agent_tools/e2e_test.png`（注入測試 game：磁磚 / 屬性 / 捲動 / split 狀態列 / 12 精靈同線閃爍，lint `{ok:true, colors:6, badPixels:0}`）。`dist/星塵勇者.html` 153 KB 單檔可直接開，1024×768 視窗自動 3 倍置中、非 debug 下 Timing 自動跑。
- **已知問題 / 下一步**：① `game.html` 的 games 區塊目前是 `games/demo/{chr,song,room,main}.js` 佔位（404 不致命），demo agent 若用別的檔名，build.py 會自動補進 dist 但會警告 ⇒ 請順手把檔名加進 `game.html`；② demo 的最後一個檔要設 `window.GAME = {init, update, draw, state}`（見 ENGINE_API §12）；③ `dist/` 尚未加進 `.gitignore`（總控決定要不要進 git）；④ `music.tick()` 依契約由遊戲 `update()` 呼叫，`apu.tick()` 則由 nes.js 每幀自動呼叫，別重複呼叫。
- [2026-09-17 收工補記] `tools/run_all.sh` 會自動撿新出現的 `tools/test_*.py`：收工時 test_core.py、test_ppu.py（116/116）PASS，**test_apu.py、test_chr.py FAIL**（apu / chr-lint agent 自己的測試檔仍在開發中：test_apu 的 8.1 DPCM 位準、test_chr 的 `test_lint_py` 解析 nes_lint.py 輸出時 JSON `Extra data`）⇒ 屬各自 agent 的檔案，我沒有更動；tools 這邊的 5 個項目（node --check、build --check、冒煙截圖、nes_lint 抽查、shot API）全 PASS。

### 追加（2026-09-17，總控契約核對）
- 依總控要求補 `engine/ppu.js` 兩項（只加不刪，既有 API 不變）：**①** `ppu.stats.overLine` 別名，與 `ppu.stats.overLines` **是同一個陣列參照**（契約與 `nes_lint.js` 讀單數），兩者每幀同步更新、沒有超線時為空陣列；**②** 公開 `ppu.oam` 唯讀檢視 — getter 回傳長度 64 的新陣列 `[{i, x, y, tile, pal, flipH, flipV, behind, on}]`，改動回傳值不影響 PPU 內部狀態，供 `NES.Lint.oam(ppu)` 直接迭代。另附 `ppu.oamBytes()` → `Uint8Array(256)` 的 2C02 原始位元組鏡像（Y / 磁磚 / 屬性 / X；屬性 bit0-1 調色盤、bit5 背景優先、bit6 水平翻轉、bit7 垂直翻轉；關閉的精靈 Y 寫 `$EF`），給需要硬體格式的 lint / 除錯用。
- 測試加 11 項（overLine 別名與參照 / 掃描線內容 / 空陣列、`ppu.oam` 長度與欄位、`on` 旗標、唯讀性、每次讀取為新物件、`oamBytes()` 長度與欄位與 `$EF`）：`tools/test_ppu.py` **總計 127 / 127 通過**，`render()` 平均 0.61 ms / 幀（仍遠低於 4 ms 目標）。

## apu

### 2026-09-17 R1 完成：engine/apu.js、engine/music.js、tools/apu_render.py、tools/test_apu.py（共 2,538 行）

**完成項**

| 檔案 | 行數 | 內容 |
|---|---|---|
| `engine/apu.js` | 755 | 2A03 暫存器級模擬：$4000~$4017 全部語意、逐 CPU cycle 推進、非線性混音查表、離線 `render()` / 逐幀 `tick()` / 即時 `connect()` |
| `engine/music.js` | 728 | FamiTracker 式 pattern 驅動（每幀 tick）、樂器包絡（vol/duty/arp/pitch）、琶音 / 顫音 / 占空比包絡 / cut、音效優先權搶聲道與復原、原創 demo 曲 + 2 音效 |
| `tools/apu_render.py` | 498 | Playwright 離線渲染 → 16-bit WAV + 純 Python FFT / 自相關 / 頻譜平坦度檢查（不需 numpy） |
| `tools/test_apu.py` | 557 | 57 項單元測試，只載入 apu.js + music.js（不依賴其他 engine 模組） |

- **方波 ×2**：4 種占空比序列（`01 §4.2` 表）、11-bit timer（timer<8 靜音）、長度計數器（32 段查表）、包絡（衰減 / loop / 固定音量）、掃頻單元（啟用 / 週期 / 負向 / 位移，**方波 1 的負向差一**：p1 用 one's complement、p2 用 two's complement）。
- **三角波**：32 階梯波（15→0→15）、7-bit linear counter + 長度計數器、**無音量暫存器**、靜音時維持最後輸出值（真機語意）。
- **雜訊**：15-bit LFSR，長模式回授 bit0^bit1、短模式 bit0^bit6；NTSC 16 段週期表（另附 PAL 表）；4-bit 音量 / 包絡。
- **DPCM**：1-bit 差分（±2、夾 0..127）、NTSC 16 段取樣率表（428~54 cycles/bit）、$C000 對齊的 64-byte 位址 / `LLLL.LLLL0001` 長度語意、loop 與 IRQ 旗標；取樣資料由 `apu.setDpcmSample(bytes, addr)` 提供（無卡帶，改用 16KB 虛擬 $C000~$FFFF）。
- **frame counter**：4 步（quarter 240Hz / half 120Hz / frame IRQ 60Hz）與 5 步（192 / 96Hz、無 IRQ）、寫 $4017 立即 clock 一次。
- **混音**：`pulse_out = 95.88/(8128/(p1+p2)+100)`、`tnd_out = 159.79/(1/(t/8227+n/12241+d/22638)+100)`，展開成 `PULSE_TABLE`(31) + `TND_TABLE`(32768) 查表，值與 `NES.APU.mix()` 公式完全一致（測試 9.5 有驗）。
- **取樣**：一個輸出樣本 = 該樣本涵蓋的所有 CPU cycle 的混音平均（box filter 抗鋸齒），預設再過 90Hz 高通 + 14kHz 低通（真機濾波），`create({highpass:0, lowpass:0})` 可關閉。效能：44.1kHz 下 2 秒音訊約 41 ms（Node 實測）。
- **music.js**：song = pattern / order / speed / instruments（格式與範例寫在檔頭）；row 指令 `note / inst / vol / arp / vib / duty / cut / stop`；樂器有 vol / duty / arp / pitch 四條每幀包絡（可設 loop 點）；`define / play / stop / sfx / tick`；`NES.Music.DEMO = {song, sfx:{jump, coin}}`。
- **原創素材**：demo 曲《星塵序曲》A 小調、speed 6（16 row/小節 → 150 BPM）、8 小節（Am-F-C-G-Am-F-E-Am），編制照 `06 §1.6` 標準配方（p1 旋律 25% / p2 琶音和聲 12.5% / 三角波八度跳躍低音 / 雜訊鼓 `k-h-s-h` + 第 4、8 小節過門）；音效 `jump`（方波兩個八度上滑、10 幀衰減，priority 5）與 `coin`（B-5 → F#6 上行五度 + 長尾音，priority 6）——全部原創，未取用任何既有樂曲。

**契約差異（相對 docs/TASKS.md §API 契約）**

| 項目 | 契約 | 實作 | 原因 |
|---|---|---|---|
| `apu.tick()` | 「每幀（內含 240Hz frame counter 4 次）」 | 推進一個 NTSC 影格並**回傳該幀的 Float32Array** | 讓「逐幀推進」與「取樣輸出」用同一個時鐘；⚠️ `render()` 與 `tick()` 都會推進時間，同一段時間**只能擇一**呼叫 |
| `NES.Music` | 模組級 `play/stop/sfx/tick/define` | 主 API 是 `NES.Music.create(apu)` → driver；`NES.Music.attach(apu)` 之後模組級函式才會委派到預設實例 | 驅動必須綁一個 apu 實例；測試也需要能開多個互不干擾的 driver |
| sfx 資料格式 | 契約未定義 | `{priority, channels:['p2'], data:{p2:[每幀,...]}}`，每幀欄位同 row，`{off:true}` 結束、`null` 沿用上一幀 | — |
| row 指令 | 契約列到 `stop` | 另實作 `cut`（任務要求）；**雜訊軌的 `duty` 當成 LFSR 長短模式**、`note` 當成 16 段週期索引；DMC 軌 `note` = 取樣名 | 雜訊 / DMC 沒有音高與占空比概念 |
| 新增方法（契約未列） | — | `apu.clock(n)`（只推進不出樣本）、`apu.read(0x4015)`、`apu.reset()`、`apu.state()`、`apu.setNoiseLfsr()`（測試用）、`NES.APU.mix()` 純函式、`driver.record()` / `driver.state()` / `driver.stopSfx()` | 測試與除錯需要；不影響契約既有介面 |
| 掃頻靜音 | 契約未提 | 照真機：**只要掃頻目標週期 > $7FF 就靜音，即使掃頻沒啟用**。因此 music.js 依 NES 驅動慣例寫 `$4001 = $08`（negate=1, shift=0）來關掃頻，而不是 `$00`（`$00` 會讓 timer > $3FF 的低音消失） | 忠實還原 |
| 雜訊 / DMC 計時單位 | 契約未提 | 週期表直接當 **CPU cycle** 計時（依 `06 §1.4`「實際雜訊時脈 = 1789773 / period」）；方波 timer 走 APU 時脈（CPU/2）、三角波走 CPU 時脈 | 與研究文件的頻率公式對齊 |
| 即時播放 | 「AudioWorklet，退 ScriptProcessor」 | AudioWorklet 只當**環形緩衝播放器**（blob 模組），PCM 仍由主執行緒 `render()` 產生後 postMessage 餵過去（前置緩衝 100ms、低於 60ms 就要料）；Chromium 在 `file://` 下不允許 blob worklet → 自動退 ScriptProcessor（已實測）。可傳 `{workletUrl}` 指向真實 .js 走 worklet | 避免把整顆 APU 複製進 worklet 造成兩份程式碼 |
| 占空比序列 | `06 §1.2` 與 `01 §4.2` 的序列寫法不同 | 採用 `01 §4.2`（NESdev 原始寫法）`01000000 / 01100000 / 01111000 / 10011111` | 兩者相位不同、聽感相同；取與 NESdev 一致者 |

**測試數：`tools/test_apu.py` 57 項全綠**（占空比波形 ×5、靜音規則 ×2、掃頻 ×3、包絡 ×2、長度計數器 ×3、三角波 ×3、LFSR ×4、DPCM ×4、混音 ×5、frame counter ×5、render 決定性 ×3、music pattern ×6、sfx 搶聲道 ×12）。
指令：`../卡比之星/.venv/bin/python tools/test_apu.py [-v]`

**WAV 路徑與頻譜結論：`shots/agent_apu/`（16 個檔，`tools/apu_render.py` 產生；18 項頻譜檢查全綠）**

| wav | 內容 | 頻譜結論 |
|---|---|---|
| `demo_song.wav` | demo 曲 10 秒（五聲道 + 真機濾波） | 峰值 0.533 不削波、RMS 0.087；低(60-300Hz) / 中(300-2k) / 高(2k-12k) 三段都有能量 |
| `p1_a4_duty0/1/2.wav`、`p2_a5.wav` | 方波單獨 | 基頻 440.6 / 440.6 / 440.5 / 881.1 Hz，與 timer 反算值誤差 **< 0.04%**；頻譜平坦度 0.025（窄帶） |
| `tri_a2 / tri_a3 / tri_c4.wav` | 三角波單獨 | 基頻 110.1 / 220.3 / 261.3 Hz（誤差 < 0.04%）；**三個音高峰峰值完全相同（0.24641，差異 0.000%）→ 無音量控制**；瞬時輸出只有 0..15 共 16 個位準（32 階梯波）；3 次諧波 −18.7 dB（50% 方波為 −10.4 dB）符合三角波特徵 |
| `noise_long_p4 / p12.wav` | 雜訊長模式 | **平坦度 0.835（寬頻）**，遠高於方波的 0.025；週期索引 4 → 12 時頻譜重心由 8,440 Hz 降到 4,199 Hz |
| `noise_short_p4 / p8.wav` | 雜訊短模式 | 平坦度 0.052（窄帶、有音高）；period index 8 的循環頻率實測 95.3 Hz＝理論 1789773/202/93 = 95.3 Hz |
| `dpcm_drum.wav` | 原創 DPCM 鼓（1-bit 差分編碼的 64 byte 取樣，程式生成） | 有輸出、位準在 0..127 內 |
| `all_channels.wav` | 五聲道同時 | 峰峰值 0.5922 < 各聲道單獨相加 0.6721 → **非線性混音的壓縮效果（比值 0.88）** |
| `sfx_jump.wav`、`sfx_coin.wav` | 兩個原創音效 | 上滑 / 上行五度，峰值 0.41 / 0.39 |

指令：`../卡比之星/.venv/bin/python tools/apu_render.py --seconds 10`（可加 `--only`、`--rate`、`--song 檔案:變數名`）

**已知問題 / 未實作**

1. DMC 的 **DMA 偷 CPU cycle** 與「破壞手把讀取」的真機 bug 沒有模擬（本引擎沒有 CPU 匯流排）；DMC IRQ 只有 `irqFlag` 與 `$4015` 讀取，沒有對外中斷回呼。
2. 寫 `$4017` 後 frame counter 的 **3~4 cycle 重置延遲**、以及包絡 / 長度計數器在寫入同一 cycle 的邊界行為（blargg 測試 ROM 等級的細節）未模擬。
3. 方波 sequencer 用「前進」而非真機的「倒退」，等效於固定相位偏移，對聽感與頻譜無影響。
4. music.js 的效果欄目前只有 `arp / vib / duty / cut`，**沒有滑音（FamiTracker `1xx/2xx/3xx/Qxy`）與 detune（`Pxx`）**；R2 需要「回音軌自動 detune」時要再補。
5. `file://` 下即時播放會退成 ScriptProcessor（Chromium 限制）；若 tools agent 的 `game.html` 要走 AudioWorklet，需另存一份 worklet .js 並以 `{workletUrl}` 傳入（`NES.APU.WORKLET_SRC` 已匯出原始碼字串）。
6. 雜訊短模式在 period index 0~4 時循環頻率達 4.8 kHz，44.1 kHz 取樣下自相關解析度不足（`apu_render.py` 改用 index 8 驗證）；不是引擎問題。
7. `render()` 與 `tick()` 共用同一個時鐘，**同一段時間只能擇一呼叫**，混用會讓時間推進兩次（已寫在檔頭）。

## chr-lint

2026-09-17 完成 R1 分工中的 `engine/chr.js`、`engine/nes_lint.js`、`tools/nes_lint.py`、`tools/test_chr.py`。
測試：**84 項全 PASS**（`../卡比之星/.venv/bin/python tools/test_chr.py`）。

**完成項**

| 檔案 | 內容 |
|---|---|
| `engine/chr.js` | `NES.CHR`：`tile(rows)`（8×8 文字磁磚，字元 `.123` → `Uint8Array(64)`，非法字元 / 列數 / 列長都 throw；也吃換行字串）、`bank(name, obj)`（obj 為 `{名稱: rows}`、rows 陣列或已建好的 tile，≤ 256，回傳 `{name, tiles, count, names, index(n), has(n)}`）、`setPattern(0|1, bankName)`、`get(table, idx)`、`tile16(top, bottom)`（8×16 模式：放進 bank 時自動補空白磚對齊到**偶數索引**、下半塊緊鄰）、`fromString(big)`（128×128 → 256 磚，16×16 格 row-major）、`slice/sliceNamed`（任意 8 的倍數尺寸切磚）、`getBank/reset/banks/pattern` |
| `engine/chr.js` DEMO | 原創手繪美術 `NES.CHR.DEMO`：**bg bank 67 磚**（8×8 字型 55 個：0-9、A-Z、19 個符號 `. , : - ! ? ' / ( ) + = × → ♥ ◎ % ★` + 空白；地形 12 磚：SKY / GROUND_TOP / GROUND / BRICK / QBLOCK / BLOCK / CLOUD_L / CLOUD_R / BUSH / WATER / LADDER / SOLID，SKY 固定在索引 0）、**spr bank 14 磚**（主角《星塵勇者》16×24：上半身 16×16 共 4 磚 + 三組腳各 2 磚 = 10 磚，走路 3 幀共用上半身（研究 05 §2 的磁磚重用）；敵人「石頭蟲」16×16 = 2 個 8×16 精靈）。另附 `DEMO.text(str)`（字串 → 磁磚索引）、`DEMO.CHARMAP`、`DEMO.hero.frames`（metasprite 相對座標）與 `walk:[0,1,0,2]`（研究 05 §4 的 1→2→1→3）、`DEMO.enemy.parts` |
| `engine/nes_lint.js` | `NES.Lint.frame(ppu)`：**優先讀 `ppu.indexFrame`**（每像素 NES 色號，能精準抓禁用色 $0D 與越界色號），沒有才比對 `ppu.frame` 的 RGBA 與 64 色表（`NES.PALETTE` 未載入時只算色數）；回 `{ok, colors, badPixels, overLine, colorList, badColors, indexColors, forbiddenPixels, paletteChecked, source, region, errors}`，色數 > 25 或 badPixels > 0 → `ok=false`。`oam(ppu)`：每掃描線精靈數（> 8 且未開 OAM 輪替 → 不合格）、座標非整數、磁磚 / 精靈調色盤越界、出界與隱藏精靈統計、8/16 高自動判斷。`check()`、`summary()`、`strict`（throw）、`magenta`（違規像素直接寫回 `ppu.frame` 畫成 #FF00FF，該色本身也不在 64 色表內，肉眼與 lint 都抓得到）、`maxColors`、`maxSpritesPerLine`、`VISIBLE={y0:8,y1:232}` |
| `tools/nes_lint.py` | PNG 逐像素檢查：64 色表內、去重 ≤ 25 色、**整數放大倍率自動偵測 + 每個 N×N 方塊必須同色**（抓縮放平滑）、`--scale / --crop x,y,w,h`（去瀏覽器邊框）、`--status-rows N`（狀態列 / 遊戲區分區統計）、`--max-colors`、`--palette`、`--json`、`-v`。內建 64 色表與 `engine/palette.js` **逐格比對**（不一致 → exit 3）。exit code：0 全過／1 有違規／2 參數或檔案錯誤／3 調色盤不一致 |
| `tools/test_chr.py` | 84 項測試：A 段 chr.js（37）、B 段 nes_lint.js（33，含用真 `engine/palette.js` 互通）、C 段 nes_lint.py（13，pillow 合成 PNG 驗 exit code）、D 段 DEMO bank 截圖（1）。**不依賴其他 agent 的檔案**（只在 palette.js 存在時多跑兩項互通測試，缺檔會自動 skip） |

**契約差異 / 補充**（`docs/TASKS.md` §API 契約）

1. `NES.CHR` 新增（非契約、向下相容）：`tile16(top, bottom)`、`fromString(big)`（契約本來就要求）、`slice(rows)`、`sliceNamed(rows, prefix)`、`getBank(name)`、`reset()`、`banks()`、`pattern(t)`、`TILE_W/TILE_H/MAX_TILES/BLANK`。
2. `bank()` 回傳值除契約的 `{name, tiles, index(n)}` 外另有 `count / names / has(n)`；`setPattern` 也吃 bank 物件本身（不只名字）。
3. `get(table, idx)`：`idx` 非 0..255 整數或 table 非 0/1 → throw；**bank 內未定義的磁磚回空白磚**（真機 CHR 未初始化即空白），不 throw，讓 PPU 不會因為畫到未填的磁磚就整幀掛掉。
4. `NES.Lint.frame()` 的 `overLine` 取 `ppu.stats.overLine || ppu.stats.overLines || []`（ppu.js 用複數名）；ppu 沒有 stats 時會退而用 `oam()` 自己算。
5. `NES.Lint.oam()` 在 `ppu.oam` 不存在時回 `{ok:true, skipped:true}`（不 throw），以免 ppu 尚未提供 OAM 檢視就擋住整條 lint。
6. `NES.Lint.frame()` 的 `ok` 只看「色數 > 25」與「badPixels > 0」（照契約）；**每線超過 8 精靈只在 `oam()` 判不合格**，且 `ppu.flicker === 'rotate'` 或 `stats.flickered` 時視為已用 OAM 輪替處理 → 只報不擋。
7. 字型磁磚的數字命名為 `N0`~`N9` 而非 `'0'`~`'9'`：JS 物件的整數字串鍵會被引擎排到最前面，會破壞「SKY 在索引 0」的排列。`DEMO.CHARMAP` 負責 `'0'→'N0'` 的轉換。
8. `nes_lint.py` 的 64 色表與 `engine/palette.js`（ppu agent）**已逐格比對一致（64/64）**，兩處來源同為研究 01 §3.4 的 ROM Detectives 表。

**截圖**

- `shots/agent_chr/demo_bank.png` — DEMO bank 總覽（純 pillow、4 灰階）：bg/spr 磁磚表、字型測試 7 行、地形 + 主角 + 敵人的場景、主角 3 幀走路與敵人放大。由 `tools/test_chr.py` 產生。
- `shots/agent_chr/e2e_ppu.png` — 與 `engine/palette.js` + `engine/ppu.js` 的整合驗證（臨時腳本，不進版）：HUD 文字、雲、地面、問號磚、主角 metasprite；`NES.Lint.check()` 回 PASS（7 色、source=indexFrame），`tools/nes_lint.py` 也 PASS（768×672 = 256×224 的 3 倍）。

**已知問題 / 未實作**

1. `nes_lint.py` 只看得到 RGB，$0D 與 $1D（以及 $0E/$0F/$1E…）同為 `#000000`，**截圖層分不出禁用色**；要精準抓 $0D 必須走 `engine/nes_lint.js` 的 `ppu.indexFrame` 路徑（已實作）。該提醒預設不印，`-v` 才顯示。
2. 「非 8px 對齊」目前只在 `oam()` 檢查精靈座標是否為整數像素；背景捲動 / 屬性區塊的 16×16 對齊由 ppu 自己保證，lint 沒有另外驗。
3. `frame()` 預設統計整張 256×240；只想驗 NTSC 可視區時要自己傳 `NES.Lint.VISIBLE`（`frame(ppu, NES.Lint.VISIBLE)`）。
4. DEMO 字型是 5×7 字身放在 8×8 格內（左 1、右 2 留白），字距偏寬；若 R2 的 HUD 想更緊湊要改成 6×7 或做半格排版。
5. DEMO 只有 bg / spr 兩個 bank，沒有做 CHR bank 切換動畫（水面 / 火把）的示範；R2 若要用 `setPattern` 每幀換 bank 再補。
6. `bank()` 不做重複磁磚去重（同樣的圖案給兩個名字會佔兩格）；DEMO 目前沒有重複磚，但大量美術進來時可能需要。

## demo
> R1 第二波 ｜ agent: demo ｜ 2026-09-17 ｜ 擁有檔案：`games/demo/*`（chr.js / song.js / room.js / main.js / test_demo.py）+ `game.html` 的 demo `<script>` 區塊

**測試房《星塵測試室》（STARDUST HERO / DEMO ROOM R1）**：素材全部原創（沿用 `NES.CHR.DEMO` 手繪磁磚與 `NES.Music.DEMO` 原創短曲），
在 PPU / APU 的真限制下跑得起來的可玩畫面。`games/demo/test_demo.py` **40 項全過**、`bash tools/run_all.sh` **全綠**、`dist/星塵勇者.html` 單檔可玩。

### 完成項
| 項目 | 內容 | 檔案 |
|---|---|---|
| 8×16 精靈 CHR | 把 `NES.CHR.DEMO` 的 8×8 切片用 `CHR.tile16()` 重組成**偶數索引配對**的 `demo_spr16` bank（主角上半身 2 對 + 三組腳 3×2 對 + 敵人 2 對 = 20 磚）；OAM tile 填 `index \| 1`（圖樣表 1）。原創配色：底色 $22，bg 0 雲 / 白字、1 泥土、2 磚 / 問號磚、3 草地，spr 0 主角、1 敵人（色 3 = $38 只有敵人用到，測試拿它逐隻判斷有沒有被畫出來） | `games/demo/chr.js` |
| 關卡 | **256 欄 × 30 列 = 2048×240 px＝8 個畫面寬**（要求 ≥ 4）；名稱表 ×2 **垂直鏡像 'v'**，相機前進時每幀把「右緣再往右 2 欄」補進 `欄 & 63`（1 欄 = 26 byte + 偶數欄的 13 個屬性 byte，遠低於 VBlank 160 byte 預算）；地形磚 + 雲 + 草叢 + 問號磚 / 磚組 + 敵人房高台；屬性以 **16×16 區塊**上色 | `games/demo/room.js` |
| 狀態列 | `ppu.split(32, {x: camX % 512, y: 32})`：上 32 條掃描線固定 x=0 顯示 SCORE / WORLD / TIME（8×8 原創字型、調色盤 0 白字），下半段才吃相機捲動。TIME 每 **21 幀**（SMB `IntervalTimerControl` framerule）減 1，分數變動才重寫名稱表 | `games/demo/room.js` |
| 主角 | 16×24（4 個 8×16 精靈，上半身共用、三組腳 1→2→1→3 輪替）；**全部走 `NES.FX` 定點數**（位置 1/16 px 的 `Vec`、速度 1/256 px/幀 的 `Acc`）與 `NES.FX.SMB` 常數：走 / 跑（B）雙上限、加速度表、轉身 ×2、5 段跳躍表、按住 / 放開雙重力（`diffToHaltJump` = 離地 1px 才切大重力）、空中 `airRunSpeed` 門檻、落地、轉向翻轉 | `games/demo/main.js` |
| 碰撞 | 磁磚 AABB：先 X 後 Y、以 1/16 px 位置算、命中就吸附到磁磚邊界並歸零該軸速度；左邊界＝相機（單向鎖的副作用，同 SMB），右邊界＝關卡盡頭 | `games/demo/main.js` |
| 相機 | **單向鎖**：`camX = max(camX, heroX − 102)`（102 = 256 × 40%），夾在 `[0, 2048−256]`；往左走相機完全不動、主角被螢幕左緣擋住 | `games/demo/main.js` |
| 敵人 | 14 隻（12 隻在敵人房 + 2 隻踩敵測試用）；敵人房分**兩條掃描線帶**（地面 y=192 / 高台 y=176）各 6 隻、間距 19 px 不重疊 ⇒ 每條掃描線 12 個精靈 + 主角 2 個 = **14 > 8** ⇒ PPU 丟棄 + 閃爍。**軟體 sprite cycling**：每帶每幀在 OAM 內旋轉 3 隻（`ppu.flickerStep = 0`，輪替改由遊戲做）⇒ 連續兩幀的聯集必定涵蓋全部 12 隻，且 `__nes.render()` 重畫不會改變畫面（截圖可重現） | `games/demo/main.js` |
| 互動 | 踩敵（下墜 + 前一幀腳底在敵人上緣以上）→ 敵人消失、+100 分、`coin` 音效、回彈 −3 px/幀；側面接觸 → **閃爍無敵 60 幀**（2 幀顯示 / 2 幀隱藏，無敵期間不重複扣） | `games/demo/main.js` |
| 音樂音效 | 開場 `NES.Music.DEMO.song`（原創《星塵序曲》）循環；跳躍 `jump`（priority 5）、踩敵 `coin`（priority 6）；`music.tick()` 由遊戲 update 呼叫（`apu.tick()` 由 nes.js 呼叫，沒有重複） | `games/demo/song.js` |
| `game.state()` | `x/y`、`xSub/ySub`、`vx/vy`（vel）與 `vxPx/vyPx`、`onGround`、`facing`、`inv`、`apexSub/apexPx`、`camX`、`screenX`、`enemies`（存活數）+ `enemyList`（含螢幕座標）、`score`、`time`、`stomps`、`hits`、`music`（driver 狀態）⇒ `__nes.state()` 直接吃得到 | `games/demo/main.js` |

### 手感實測數字（`games/demo/test_demo.py`，對照研究 03 ② 與 core 的參考積分）
| 項目 | demo 實測 | 研究文件 | core 參考 | 說明 |
|---|---|---|---|---|
| 靜止 → 跑步上限 | **45 幀** | 45 幀 | 45 幀 | `accRun $e4` 累加到 `maxRun $28`；±0 |
| 靜止 → 走路上限 | **41 幀** | 40 幀 | 41 幀 | 文件是 24 ÷ 0.594 的連續除法（40.4），整數累加取 41 |
| 跑步上限速度 | **2.5 px/幀**（640 vel） | 2.5 | — | |
| 走路上限速度 | **1.5 px/幀**（384 vel） | 1.5 | — | |
| 短按跳（點 1 幀 A） | **19.125 px** | ≈18 px | 16.31 px | 本 demo 照 SMB 的 `DiffToHaltJump`：第 1 幀仍用小重力，離地 ≥1px 之後才切大重力 ⇒ 比 core 的「第 1 幀就用大重力」高 2.8 px、比文件高 1 px |
| 長按跳（靜止起跳） | **62.00 px** | 64 px（4 格） | 62 px | 半隱式 Euler 的 −2 px 偏差（core 已記錄） |
| 長按跳（全速起跳） | **77.50 px** | 80 px（5 格） | 77.5 px | 跳躍表第 4 段（`vy0 −5`、`gHold $28`）；−2.5 px 偏差 |
| 相機起捲點 | **screenX = 102**（camX = x − 102） | 256 × 40% = 102.4 | — | 往左走 90 幀 camX 完全不變 |
| 無敵幀 | **60 幀**（顯示 30 / 隱藏 30） | 任務指定 60 | — | SMB 原版是 168 幀，這裡照任務要求 |
| 每線精靈 | **14**（12 敵 + 2 主角），`flickered` = **32 條掃描線** | 上限 8 | — | 單幀只畫得出 7 隻敵人，**兩幀合集 = 12 隻全部到齊** |
| 同屏色數 | **10 ~ 13**（上限 25） | ≤ 25 | — | 120 幀連續 lint 全 `ok=true`、`badPixels=0` |
| 效能（300 幀） | 整幀 **0.74 ~ 1.07 ms**（`ppu.render` 0.44 ~ 0.64、`game.update+draw` 0.005 ~ 0.023） | < 4 ms | — | ≈ 16.7 ms 幀預算的 5% |
| 單檔 dist | 189 KB、非 debug 實測 **60.9 fps**、0 console error | — | — | 1024×768 視窗自動 3 倍置中 |

### 測試結果
```
../卡比之星/.venv/bin/python games/demo/test_demo.py      → 40 項，通過 40，失敗 0
bash tools/run_all.sh                                     → 全 PASS（node --check 14 檔、test_apu 57、
                                                             test_chr 84、test_core 90、test_ppu 127/127、
                                                             build --check、冒煙截圖、nes_lint 抽查 8 張 0 違規）
../卡比之星/.venv/bin/python tools/build.py               → dist/星塵勇者.html（189 KB，內嵌 14 檔、缺 0 檔）
```
測試分 8 組（全自動，走 `game.html?debug=1` + `__nes` 除錯 API，不改任何 engine 檔）：
① 跑 / 走加速幀數與上限速度；② 短按 / 長按 / 全速跳高度（含「短按 < 長按」與 5 段跳躍表）；
③ 相機 40% 觸發 + 單向鎖 + 主角被左緣擋住；④ 12 隻同線敵人：`maxSpritesLine`=14、`flickered`>0、
**逐像素（敵人專屬色 $38）驗證兩幀 OAM 合集 = 12 隻**；⑤ 敵人房連續 120 幀 `__nes.lint()` 全綠、色數 ≤ 25；
⑥ 踩敵 → 敵人消失 / +100 分 / `coin` 搶下 p2（priority 6 > jump 5）/ 音樂續播 / 音效結束後聲道歸還；
⑥b 側面接觸 → 無敵 60 幀 + OAM 交替開關 + 不重複扣；⑦ 300 幀效能；另加 engine 模組到齊與 0 JS 例外。

### 截圖（`shots/agent_demo/`，全部用 Read 看過圖，`tools/nes_lint.py --status-rows 32` 6 張 0 違規）
| 檔案 | 內容 | lint |
|---|---|---|
| `01_title.png` | 標題畫面（STARDUST HERO / DEMO ROOM R1 / PRESS START）+ 狀態列 + 主角站在起點 | 10 色 |
| `02_run.png` | 全速跑步（大步幀）、相機已捲動、主角固定在畫面 40% | 10 色 |
| `03_jump_apex.png` | 全速跳躍最高點（離地 77.5 px ≈ 5 格磚）、空中姿勢 | 10 色 |
| `04_flicker_f1.png` / `04_flicker_f2.png` | 敵人房連續兩幀：每幀只畫得出一部分敵人，兩張合起來 12 隻全到齊（真機式閃爍） | 各 13 色 |
| `05_hud_score.png` | 踩敵後狀態列更新（SCORE 000100 / TIME 倒數）+ 問號磚組 | 13 色 |
| `06_dist_singlefile.png` | `dist/星塵勇者.html` 單檔（非 debug、鍵盤實際操作、60.9 fps、3 倍置中） | 瀏覽器整頁，不計入 NES 畫面抽查 |

### 跨檔需求（我沒有動別人的檔案）
1. **tools（`tools/run_all.sh`）**：`②` 只掃 `tools/test_*.py`，抓不到 `games/demo/test_demo.py`。建議把 glob 擴成 `tools/test_*.py games/*/test_*.py`（我這支測試需要完整 engine + game.html，放在 games/ 底下比較合理）。
2. **ppu（`engine/ppu.js`）**：`flicker:'rotate'` 的 OAM 輪替指標是在 `render()` 內前進的 ⇒ `__nes.render()`（只重畫、不推進邏輯）也會換一組精靈，**截圖不可重現**，而且「輪替步進 8」與遊戲自己的 OAM 排序互相干擾時，連續兩幀的聯集不保證涵蓋全部（實測某些相位下兩幀畫的是同一批）。demo 的處置：`ppu.flickerStep = 0` + 遊戲自己做 sprite cycling。建議 R2 二選一：① `render()` 只在「邏輯有推進」時才前進輪替指標（或給 `ppu.advanceFlicker()` 讓遊戲控制）；② 文件明講「輪替步進必須與遊戲的 OAM 配置互質」。
3. **chr-lint（`engine/chr.js`）**：`NES.CHR.DEMO.spr` 是 8×8 切片（`sliceNamed`），**在 8×16 精靈模式不能直接用**（PPU 取 `tile & 0xFE` 與下一格，會抓到隔壁磁磚）。demo 只好用 `tile16()` 重建 `demo_spr16`。建議 chr.js 直接附一份 `DEMO.spr16`（主角上半身 / 三組腳 / 敵人皆為 tile16 配對），並在檔頭寫明「8×16 模式要用哪一個 bank、OAM 要填 `index | 1`」。
4. **core（`engine/cpu_timing.js`）+ ppu**：`timing.budget` 至今沒有人呼叫 `use()`。demo 每幀補 1 欄名稱表（26 byte tile + 13 byte 屬性 ≈ 39 byte）＋ OAM 256 byte，想驗「VBlank 160 byte」需要 PPU 在 `setTile/setAttr/sprite` 內呼叫 `budget.use(n)`（core 的 API 已備妥）。R2 若要把預算變成真限制，這是唯一缺口。
5. **core（`NES.FX`，D1）**：demo 全程用 `Vec/vadd` + `Acc/aadd/aapproach`（零配置、每個實體自己帶餘數），完全沒用到 `addVel(pos, v, frac)` 的全域 `.frac`。**建議 R2 就把 `Vec/Acc` 定為正式寫法**，`addVel/addAcc` 只留給單次換算，以免多實體共用 `NES.FX.frac` 出錯。`aapproach()` 是手感實作的關鍵（加速 / 摩擦 / 煞車共用一個函式且不會過衝），請保留。

### 已知問題 / 未實作
1. **短按跳 19.125 px** 與 core 測試的 16.31 px 不同（見上表）：兩者的差別在「第 1 幀用小重力還是大重力」。demo 照反組譯的 `DiffToHaltJump` 規則實作，數字更接近研究文件的 ≈18 px；R2 若要與 core 的參考值對齊，需要先定案這一條。
2. 問號磚 / 磚只是實心磁磚，**沒有頂磚頂出道具 / 磚塊破壞**；金幣也沒有實體（`coin` 音效目前掛在踩敵上）。
3. 主角碰撞箱是整個 16×24（SMB 實際比圖形窄），貼著高台邊緣走會比原版嚴格一點點；沒有斜坡、沒有單向平台。
4. 敵人沒有重力與互相碰撞（固定站在自己的地板上來回巡邏），也沒有被踩扁的過場動畫（直接消失）。
5. 只有水平捲動（關卡高度 = 1 個畫面），沒有垂直 / 自動捲動；狀態列用 `split(32)` 指定掃描線，不是真的精靈 0 命中（ppu 未實作，已記在 ppu 的已知問題）。
6. 音樂只有一首 8 小節循環（`NES.Music.DEMO`），沒有過關 / 死亡 / 無敵曲；時間歸零不會有任何事發生（測試房不做遊戲結束）。
7. `games/demo/test_demo.py` 跑一輪約 40 秒（要重載頁面 8 次），沒有做平行化。

## qa1
> R1 第二波 ｜ agent: qa1（獨立驗收）｜ 2026-09-17 ｜ 擁有檔案：`docs/QA_REPORT.md`、`shots/agent_qa1/*`（**未改動任何程式**）

- 2026-09-17 — 完成 **R1 獨立驗收**，全部項目自己重跑、不採信任何 agent 的自述：`bash tools/run_all.sh` 全 PASS；五支測試單獨重跑 **apu 57 / chr 84 / core 90 / ppu 127 / demo 40 = 398 項 0 失敗**；`node --check` 14/14；自拍 9 張截圖（Read 逐張看圖）+ `tools/nes_lint.py --scale 0` **8/8 PASS**（最高 13/25 色、0 非法像素、3 倍整數放大方塊同色、與 `engine/palette.js` 64/64 一致）；同線精靈**要求 14 個只畫 8 個**、兩連幀聯集 12 隻全到齊、8×16 主角四塊拼接垂直接縫 0 斷層；手感（跑 45 幀 / 走 41 幀 / 短跳 19.125 px / 長跳 62.00 px / 全速跳 77.50 px / 無敵 60 幀 / 輸入延遲 1 幀）對照研究 03 ① 全部在 ±1 幀內；APU 以**恆等式**獨立驗證「波形只含五聲道成分」（44,100 點與 `mix(五聲道 out)` 最大誤差 2.06e-8）、三角波三個音高峰峰值差 0.000%、`sfx('jump')` 精確搶 p2 共 10 幀且結束後琶音完全復原、`coin`(6) 搶下 `jump`(5)；非 debug `dist/星塵勇者.html` 10.5 秒實測 **rAF 60.05 fps / 邏輯 60.15 fps / 丟幀 0**、update+draw+render 平均 **0.744 ms**（p95 1.1、max 3.0）；`__nes` 九個除錯 API 逐一呼叫全部合理；30 項 ENGINE_API 契約抽查全部可呼叫；原創性掃描 **0 筆**外部圖檔 / 音檔 / ROM / base64 / 網址、**0 筆**任天堂 IP 名稱。
- **結論：R1 通過，可進 R2。P0 = 0、P1 = 7、P2 = 8。** 最重要的三件（都不是 R1 的缺陷，而是 R2 開工前必須先定案 / 補上的）：① `ppu.render()` 會前進 OAM 輪替指標 ⇒ `__nes.render()` 不是純重畫、截圖不可重現（實測連續 3 次 render 得 3 組不同精靈）；② `NES.FX.addVel` 簽章與 `TASKS.md` 契約不符 + 短按跳 core 16.31 px vs demo 19.125 px 兩套規則並存，R2 主角物理必須先定案（長按跳 62 px < 文件 64 px，會影響「剛好 4 格牆」的關卡設計）；③ `timing.budget.use()` 全專案零呼叫 ⇒「VBlank 只能寫 160 byte」目前完全不是限制。另：`tools/run_all.sh` 仍漏掉 `games/demo/test_demo.py`、`ENGINE_API` §14 的 D2/D3 已修好但文件沒更新。
- 明細（逐項數字、重現指令、截圖索引、跨檔需求整合表 X1~X17）見 **`docs/QA_REPORT.md`**「R1 驗收（qa1）」。

## fix1
> R1 第三波（修正） ｜ agent: fix1 ｜ 2026-09-17 ｜ 依據：`docs/QA_REPORT.md`「R1 驗收（qa1）」R1-1 問題列表與 R1-4 跨檔需求表
> 可改檔案：`engine/*.js`、`games/demo/*`、`tools/*.py`、`tools/run_all.sh`、`docs/ENGINE_API.md`（**沒有改 `docs/QA_REPORT.md`**，那是 qa1 的檔；`game.html` / `docs/TASKS.md` 也不在本輪範圍）

**結果：qa1 列的 7 條 P1 全部修完，另外順手修掉 2 條 P2（P2-2 / P2-4）。**
全套測試 **core 108 / ppu 144 / chr 91 / apu 57 / demo 55 = 455 項，0 失敗**（qa1 驗收時是 398 項），
`bash tools/run_all.sh` 全 PASS（含新納入的遊戲層測試）、`node --check` 14/14、
`tools/build.py` 內嵌 14 檔缺 0 檔、自拍 3 張截圖 `tools/nes_lint.py` **3/3 PASS（0 非法像素）**。

### P1 逐條：改法 / 驗證

| # | 改法 | 驗證數字 |
|---|---|---|
| **P1-1** `run_all.sh` 漏掉遊戲層測試 | `tools/run_all.sh` 的 glob 改成 `tools/test_*.py games/*/test_*.py`；`games/` 底下的測試在結果表印成 `demo/test_demo.py`（同名可區分） | 結果表新增一列 `demo/test_demo.py PASS`；一鍵測試涵蓋 **455 項**（原 398 → 涵蓋 355，現在全涵蓋） |
| **P1-2** `render()` 推進 OAM 輪替 | `ppu.render()` 拿掉輪替推進 ⇒ **純函式**；新增 `ppu.endFrame()`（別名 `advanceFlicker()`）負責推進。`nes.js` 把 Timing 的 draw 階段接成 `game.draw() → ppu.render() → ppu.endFrame()`；`__nes.render()` 只呼叫 `render()`（並在重畫期間 `budget.mute`） | 連續 3 次 `__nes.render()` → `oamStart` 恆為 0、`indexFrame` 逐點相同（demo 測試 ⑥d）；`ppu` 測試：預設 `flicker='rotate'`、`flickerStep=8` 時**同線連號 16 個精靈兩幀聯集 = 16 個全到齊**（第 1 幀 OAM 0..7、第 2 幀 8..15）；9 個精靈的兩幀聯集也全到齊 |
| **P1-3** `addVel` 簽章 | 正式寫法定為 `Vec{sub,frac}` + `vadd` / `Acc{v,frac}` + `aadd`（餘數在物件內）。**移除全域 `NES.FX.frac` 與 `addVel.frac`**；`addVel(vec,v)` / `addAcc(av,a)` 保留為明確版本的相容別名，傳舊參數（數字）會 throw 指路訊息。`ENGINE_API` §3 改寫，並註明「TASKS.md §API 契約的舊簽章作廢，以 ENGINE_API 為準」 | `NES.FX.frac === undefined && NES.FX.addVel.frac === undefined`；`addVel(0,384,0)` 丟 `addVel(vec, v)` 的錯誤訊息；`addVel(vec,v)` 與 `vadd` 97 幀逐幀相同；demo 本來就只用 `Vec/Acc`，零改動 |
| **P1-4 / P1-5** 兩套跳躍規則 + 高度短 2/2.5 px | 跳躍規則統一進 `engine/fixed.js` 的 `NES.FX.SMB`：`jumpState(vyAcc) / jumpStart(js,\|vx\|,pySub) / jumpGravity(js,aHeld,pySub,maxFall) / jumpBounce / jumpSim(opt)`（放 fixed.js 而不是新開 `engine/physics_smb.js`，是因為新檔要改 `game.html` 的 `<script>` 清單，而 `game.html` 不在本輪可改範圍）。`games/demo/main.js` 改呼叫這組函式；`tools/test_core.py` 用 `jumpSim` 量。新增開關 **`SMB.skipGravityFirstFrame`（預設 `true`）**：起跳後第 1 幀只套**半格**重力（leapfrog／中點積分），離散和 = `v0²/2g` = 連續解 | **長按靜止跳 64.0000 px（文件 4 格 = 64，±0）｜長按全速跳 80.0000 px（文件 5 格 = 80，±0）｜點按 1 幀 19.6875 px**；5 段跳躍表最高點 64 / 64 / 68.31 / 80 / 80（文件 64/64/68/80/80，最大差 0.31 px）；**core 的 `jumpSim` 與 demo 實跑量到的是同一個數字**（測試用 `abs(a-b) < 1e-9` 斷言）。開關 `'full'` = 66 / 82.5 px、`false` = 62 / 77.5 px（舊行為），三種都有測試 |
| **P1-6** `budget.use()` 無人呼叫 | PPU 的 `setTile(1) / setAttr(1) / fillTiles(實際格數) / fillAttr(區塊數) / setBgPalette(3) / setSprPalette(3) / setBackdrop(1)` 都呼叫 `budget.use(n)`；`sprite(i)`／`clearSprites()` 走**獨立的 OAM DMA 通道** `use(n,'oam')`（`$4014` 一幀一次 256 byte，同一槽重複寫只算一次 ⇒ 用 `budget.serial` 判斷換幀）。`nes.js` boot 時 `ppu.budget = timing.budget`，沒綁時全部 no-op。`budget` 補上 `oamLimit/oamUsed/oamPeak/overBy/overKind/mute/strict/serial/report()`；**strict 模式超支直接 throw、debug 的 `__nes.stats().budget` 顯示明細**。`game.init()` 的寫入（等同 rendering 關閉時的初始化）在 init 後 `clear()` 不計 | demo 400 幀實測單幀用量分布 `{0:277, 12:14, 26:53, 38:2, 39:51, 51:3}` ⇒ **最高 51 byte**（補欄 26 磚 + 13 屬性 + 狀態列 12），`over = 0` 幀、`overFrames = 0`；OAM 通道尖峰 256/256（64 個精靈，不佔那 160）；`__nes.render()` 重畫前後 `used/oamUsed` 完全不變；一幀寫 192 byte → `over=true`、strict 下丟「budget 超支：ppu 通道本幀已寫 225 byte，上限 160」 |
| **P1-7** `ENGINE_API` §14 D2/D3 過期 | §14 的 D1/D2/D3 全部改寫成「✅ 已修好」並附 qa1 實測值；新增 **D8（render 純函式 / endFrame）、D9（budget 真的生效 + 兩條通道）、D10（唯一一套跳躍規則）、D11（`CHR.DEMO.spr16`）**；§3（FX/SMB 跳躍表）、§5（budget 全欄位）、§6（spr16 / oam16）、§7（render/endFrame/預算 byte 數/flickerStep）、§11（`__nes.render` 純重畫、`stats().budget`、`snapshot()`）、§13（run_all 範圍）同步更新 | `ENGINE_API` §14 表頭加註「2026-09-17 第二次核對（R1 fix1）」與 455 項測試數字 |

### 順手修掉的 P2
- **P2-4 / X12（`CHR.DEMO.spr16`）**：`engine/chr.js` 直接附 8×16 配對 bank（已註冊為 `demo_spr16`）與 `DEMO.oam16(name)`（= `index | 1`），檔頭寫明用法；`games/demo/chr.js` 刪掉自己重建的那 20 行改用它。`tools/test_chr.py` 新增 7 項驗證（名稱齊全 / 上半塊偶數索引 / `oam16` 值 / 上下半塊 = `DEMO.spr` 的 r0/r1 切片 / 腳的下半塊留白 / 只用 0..3 / 已註冊）。
- **P2-2 / X17（`frame()` 同名不同義）**：不改名（會動到 `tools/shot.py` 與 TASKS 契約），改為新增別名 **`__nes.snapshot()`**，並在 `ENGINE_API` §11 明講兩者差別。

### 沒修的 P2 與理由
| # | 理由 |
|---|---|
| P2-1 / X16 `__nes.setScale` 不連動 CSS | 修正點在 `game.html` 的 `place()`，**`game.html` 不在本輪可改檔案清單**；且不影響 `tools/shot.py`（自己放大 backing store）與正常遊玩 |
| P2-3 / X14 真・sprite 0 命中 | 需要在 PPU 的掃描線迴圈裡做「精靈 0 不透明像素 × 背景不透明像素」的命中旗標與時序模型，是 R2/R3 的 PPU 工作；目前 `split(scanline)` 效果等價（＝ MMC3 IRQ），畫面實測無撕裂 |
| P2-5 / X13 AudioWorklet 的 `.js` 實體檔 | 要新增一個檔並在 `game.html` 以 `{workletUrl}` 傳入，兩者都不在本輪範圍；`file://` 下自動退回 ScriptProcessor，功能正常 |
| P2-6 `$0D`/`$0F` 分不出 | 兩者 RGB 都是 `#000000`，**從截圖層原理上無法分辨**；已有 `ppu.indexFrame` 路徑（`engine/nes_lint.js`）可抓，維持現狀 |
| P2-7 / X15 `music.js` 滑音 / detune | 屬 apu agent 的功能開發（不是缺陷），且會動到 song 資料格式；R2「回音軌自動 detune」時一併做較省 |
| P2-8 `test_demo.py` 約 40 秒 | 8 次重載是**刻意的狀態隔離**（每個手感測項都要乾淨的初始狀態），平行化會共用 browser context 造成互相污染；本輪新增 2 組測試後仍 < 60 秒，收益不值風險 |

### 給 R2 的注意事項（本輪改動造成的行為差異）
1. **直接用 `NES.PPU.create()` 的程式要自己呼叫 `ppu.endFrame()`**（每幀 `render()` 之後一次），否則 `flicker='rotate'` 不會輪替。走 `NES.boot` 的遊戲不用管。
2. **`NES.FX.frac` / `addVel.frac` 已不存在**；`addVel/addAcc` 的參數是物件。舊寫法會 throw（訊息會指到 `ENGINE_API` §3）。
3. **一幀寫超過 160 byte 名稱表會被記為超支**（`__nes.stats().budget`）。`games/demo/room.js` 的 `clearTitle()` 因此從「重寫 32 整欄（832 byte）」改成「只把標題那 4 行改回天空磚（52 byte）」——R2 的畫面切換若要大量重寫，請分攤到多幀，或比照 `game.init()` 在 rendering 關閉的情境下做。
4. **跳躍高度全面 +2 px（靜止）/ +2.5 px（全速）**：`64 / 80 px` 剛好是 4 格 / 5 格，關卡可以放心設計「剛好 4 格高的牆」；要回到舊手感就把 `NES.FX.SMB.skipGravityFirstFrame` 設成 `false`。
5. `games/demo/main.js` 的 `state()` 多了 `fastFall` / `skipFirstGravity` 兩個欄位，方便 R2 的手感測試取樣。

---
# R1 總結（總控，2026-09-17）— NES 核心引擎完成，可進 R2
- 引擎 `engine/`（10 檔）：palette 64 色 / fixed 定點數（1/16 px、8.8 速度、1/4096 加速度、SMB 常數與統一跳躍函式）/ input 一幀一取樣 + 注入 / 重播 / cpu_timing 60.0988Hz 固定步 + VBlank 預算（160 byte + OAM 256）/ chr 2bpp 文字磁磚 / ppu（名稱表 ×2 + 屬性 + 鏡像 + 分割 + OAM 64 + 每線 8 精靈閃爍輪替 + 8×16）/ nes_lint（≤25 色、64 色、超線）/ apu 2A03 五聲道暫存器級 + 非線性混音 + AudioWorklet / music pattern 驅動 + 音效搶聲道 / nes.js boot + `__nes` 除錯 API。
- 測試房 `games/demo/`《星塵測試室》：8 畫面寬捲動、狀態列分割、14 敵人同線閃爍、SMB 手感（跑 45 幀、長跳 64.00 / 80.00 px）、demo 曲 + 2 音效。
- 工具：shot.py（同卡比語法 + --lint）、build.py（dist/星塵勇者.html 單檔）、run_all.sh、apu_render.py（wav + 頻譜）、nes_lint.py（PNG 逐像素）。
- 驗證：run_all 全 PASS（core 108 / ppu 144 / chr 91 / apu 57 / demo 55 = 455 項）、lint 0 違規、非 debug 60fps 丟幀 0、update+draw+render ≈ 0.74 ms/幀；qa1 P0 0 / P1 7 → fix1 全修；原創性掃描 0 外部素材。
- 文件：docs/ENGINE_API.md 為正式契約（TASKS.md 契約段已作廢）；QA_REPORT.md R1 章。
## R2 待辦（PLAN §4）
主角完整狀態機（蹲 / 滑 / 受傷 / 死亡）、碰撞斜坡可選、鏡頭雙向鎖、W1 四關 + 3 敵 + 1 魔王、手感測試 ±1 幀、W1 機器人通關；qa1 P2 未修項見 QA_REPORT R1-1。

---
# R2 《星塵巡航艦》（2026-09-19）
總控：骨架完成（cruiser.html、engine/shmup.js 空殼、shot.py 相對 --url、build.py --src、TASKS R2 契約）；派 research-gradius / research-shmup / engine / ship / stage / audio 六 agent 平行。各 agent 在下方自己區段回報。
總控（更正）：使用者說明紅白機專案不限一款遊戲，宇宙巡航艦是新增；星塵勇者 W1 同步開工（R2b：star-hero / star-world / star-audio 三 agent，入口 star.html）。

## engine（R2）
**2026-09-19｜`engine/shmup.js`（`NES.SH`）整檔實作完成｜`tools/test_shmup.py` 157 項全綠｜`docs/ENGINE_API.md` 新增 §15 + 目錄列**

零相依 classic script + IIFE、`'use strict'`、每個函式一行 JSDoc；**執行期不呼叫 Math 的三角函數**（只在載入時建表）、**每幀路徑零物件配置**（Pool / OAM 預配 typed array，OAM 寫入重複使用同一個 scratch 物件）。

### API 表（完整版見 ENGINE_API §15）
| 成員 | 簽章 | 重點 |
|---|---|---|
| `SH.SIN` / `SH.COS` | `Int16Array(256)`，8.8 | 一圈 256 單位，**0 = 右、64 = 下、128 = 左、192 = 上**；與 Math 誤差 ≤ 0.5/256 |
| `SH.sin(a)` / `cos(a)` | `(int) → int` | 同上、自動 `& 255`（超集） |
| `SH.atan2(dy, dx)` | `→ 0..255` | 八分法 + `ATAN` 查表；八主方向精確、全 256 方向誤差 ≤ 1；`(0,0) → 0` |
| `SH.aim(sx,sy,tx,ty,speed88[,out])` | `→ {vx, vy, a}` | 長度誤差 < 1%（96..512 全方向實測 ≤ 0.75%）；**傳 `out` 就零配置** |
| `SH.vel(angle, speed88[, out])` | `→ {vx, vy, a}` | 環形彈 / 固定角度彈（超集） |
| `SH.aabb(a, b)` | `→ bool` | 相鄰不算重疊、寬或高 0 一律 false |
| `SH.inRect / clamp / every / Timer` | | 小工具（`Timer` 是契約裡「可有可無」那項） |
| `SH.Pool(n, factory)` | `{alloc, free, each, count, items, size, isAlive, freeAll/reset}` | 建構時造好 n 個物件；`alloc` 失敗回 `null`；**把 `alive` 設 false 等同 free**（`each` 就地回收） |
| `SH.OAM(ppu, {reserve, step, max, hideY, margin})` | `{begin, add, push, end, used, dropped, skipped, capacity, frames, resetCycle}` | prio 0..7 穩定排序、同 prio 每幀輪替起點（`step` 預設 8）、超槽丟棄計 `dropped`、越界略過計 `skipped`、空槽 `y = 240` |
| `SH.Scroller(ppu, {nt:2, cols, tileAt, attrAt, row0, rows, ahead, maxCols, mirror})` | `{reset, update, writeColumn, colBytes, pending, next, bytes, peak, columns}` | 世界欄 `c` → `c & 63`（nt `(c>>5)&1` 第 `c&31` 欄）；`update` 回傳本幀 byte（**≤ 45**）；`reset` 一次補 64 欄（2400 byte，只能 init 用） |
| `SH.Spawner(table)` | `{update(camCol, ctx), reset, seek, index, fired, remaining}` | 單次觸發、倒退不重觸發、一幀跨多欄全觸發、`seek` 給檢查點復活 |

### 測試 `tools/test_shmup.py`（157 項，0 失敗）
載入 `palette / fixed / input / cpu_timing / chr / ppu / shmup`。
SIN/COS 誤差 0.499/256、atan2 八主方向全中 + 全 256 方向誤差 0、aim 四種速度 × 256 方向長度最差 0.744%、
aabb 10 項邊界、Pool 18 項、OAM 25 項（含 **`ppu.indexFrame` 實測**：12 顆同線同 prio → 每幀畫 8 顆、兩幀聯集 12 顆全到；80 顆 → `dropped = 16`；OAM DMA 256/256 不超支）、
Scroller 19 項（reset 後 64 欄 × 30 列 + 32×15 屬性與 `tileAt`/`attrAt` 完全一致；**600 幀每幀 ≤ 45 byte、`timing.budget.over === false` / `overFrames === 0`、尖峰 45**；回退不寫；600 幀後可見 33 欄內容一致）、
Spawner 12 項、原始碼靜態檢查 6 項（零相依 / 無 `Math.atan2` / Math 只在建表區 / 每個函式有 JSDoc）。
效能：600 幀（Scroller + 40 精靈 OAM + Pool + aim）**2.3 ms ≈ 0.004 ms/幀**。
`bash tools/run_all.sh --quick` 全 PASS（apu 57 / chr 91 / core / ppu 144 / demo + shmup 157，R1 的 455 項不受影響）。

### 契約異動（ship / stage / audio agent 請看這段）
| # | TASKS.md 契約 | 實作 | 為什麼 |
|---|---|---|---|
| S1 | `Scroller.update()` 「…+ `ppu.scroll`」 | **Scroller 不碰 `ppu.scroll` / `ppu.split`**，遊戲自己設 | 捲動與 HUD 分割是遊戲的節奏決策。正確寫法是 **`ppu.scroll(camX % 512, 0, 0)`**（不是 `camX & 255`：兩張名稱表 = 512 px 虛擬寬，PPU 的 `_bgLine` 會自己在 x ≥ 256 時換 nt；只取 `& 255` 會少換一張） |
| S2 | 「名稱表水平鏡像時 nt 0/1 交替」 | 水平捲動必須是 **`ppu.mirroring('v')`（垂直鏡像 = 左右兩張不同）**，`Scroller.reset()` 會自動設 | PPU 的 `'h'` 是**上下**兩張不同（nt0 = nt1），水平捲動會看到同一張。`games/demo/room.js` 也是用 `'v'` |
| S3 | 「處理 30 列（0..29）」 | 預設就是 30 列 = 45 byte/幀；**但下方 HUD（`split(208)`）讀的是名稱表列 26..29，會被地形蓋掉** ⇒ stage agent 請建成 `SH.Scroller(ppu, {row0: 0, rows: 26, …})`（26 + 13 = **39 byte/幀**），列 26..29 留給 ship agent 的 HUD | 兩張名稱表所有 64 欄都會被串流寫過，HUD 不可能「躲在某幾欄」 |
| S4 | `OAM(ppu, {reserve})` | `reserve` = **保留 OAM 前 n 槽給遊戲自己 `ppu.sprite()`**，`end()` 從第 n 槽開始寫、`capacity = 64 - reserve` | 讓固定不閃的東西（例如船）可以佔死前幾槽 |
| S5 | 「同 prio 之間每幀輪替起點」 | 輪替量 `step` **預設 8**（NESdev 慣例），不是 1 | 每幀只轉 1 顆的話，12 顆同線精靈要 5 幀才畫得齊；轉 8 顆**兩幀**就聯集畫齊（測試有驗） |
| S6 | `Pool` | 多了「**把 `obj.alive` 設成 `false` 等同 `free()`**」的語意（下次 `each()` 就地回收） | 敵人 / 子彈用 `e.alive = false` 是最自然的寫法，不用記得呼叫 `free` |
| S7 | `Spawner` 的 `fn(ctx)` | 實際呼叫 `fn(ctx, col, entry)`（多的參數可忽略，相容） | 同一個 `fn` 可以依 col 做不同事 |
| S8 | — | 新增超集：`sin/cos/vel/inRect/clamp/every/Timer`、`OAM.push()`（完全零配置的 add）、`Scroller.writeColumn/colBytes/pending`、`Spawner.seek()`、`Pool.freeAll/isAlive` | 都不影響契約成員 |
| S9 | — | **角度定義**：0 = 右、64 = 下、128 = 左、192 = 上（螢幕 y 向下 ⇒ 角度增加是順時針）。敵人「往左飛」= 角度 128 | 契約沒定義，這裡定死 |

**給 ship / stage 的三條硬規定**：① `ppu.flickerStep = 0`（否則 PPU 內建輪替會跟 `SH.OAM` 打架）；
② 每幀名稱表寫入（Scroller 45 + HUD）要留在 160 byte 內，`Scroller.reset()` 只能在 `init` / 換關 / 檢查點做；
③ 相機瞬移要 `Scroller.reset(camX)` + `Spawner.seek(col)` + `Pool.freeAll()` 一起做。

**沒有對別的 agent 的檔案提出需求**（`ppu.getTile / getAttr / mirroring / sprite / setTile / setAttr` 都是 R1 既有 API，PPU 不用改）。

---
## research-shmup（R2）

- **時間**：2026-09-19（單輪完成）
- **完成**：新增 `docs/research/11_橫向射擊設計與技術.md`（繁體中文，**1233 行**，22 章 + 摘要 + 目錄 + 來源）。涵蓋：① NES 實作技術（OAM 64 分配與優先權、每線 8 精靈的四種輪替手法 + Gradius / 沙羅曼蛇 / Crisis Force / Gun-Nac 各自對策、子彈池上限表、8/16/256 方向瞄準查表、名稱表欄串流與 VBlank 預算逐項、以捲動欄為鍵的出怪表、兩段式碰撞框、雷射五種拼法、背景磚 + 精靈混合魔王、sprite 0 vs mapper IRQ 分割）② 設計面（檢查點 vs 原地復活、rank 公式、膠囊經濟、魔王三階段與彈幕型態庫、關卡五段節奏曲線、初見殺分級、速度等級取捨）③ 11 款同類作品機制對照表 ④ 射擊遊戲特化音樂技法 + 11 項音效搶聲道優先權表 ⑤《星塵巡航艦》原創設計：敵人 8 原型、魔王 3 原型、關卡 1 逐欄節奏表（384 欄 / 5 檢查點 / 83 隻敵人 / 13 顆膠囊）、HUD 版面草案。
- **來源數**：**78 條**（77 個網址 + 1 條內部研究交叉引用）；主要來自 NESdev Wiki（6）、NESdev Forums（13）、shmups.system11.org（7）、Shmups Wiki（3）、Gradius Wiki / HG101 / TCRF / Data Crystal、Game Developer（3）、SLYNYRD、Contra NES 反組譯專案、Wikipedia（12）。
- **附帶**：跑 `../卡比之星/.venv/bin/python tools/build_html.py` → `index.html` 26 份文件（已確認 `11_橫向射擊設計與技術.md` 在左側目錄與內文）；`README.md` 研究目錄加入 `11_` 與 `03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md` 兩列並更新研究狀態段。
- **⚠ 待總控處理**：編譯 `index.html` 時 `16_宇宙巡航艦_沙羅曼蛇.md` 尚未存在（research-gradius 平行作業中），該檔完成後**需再跑一次 `build_html.py`**。

### 給 engine / ship / stage agent 的關鍵建議（10 條）

1. **敵彈的 OAM 優先權必須高於敵機本體**（prio：船 / 選項 0 → 自機彈 1 → **敵彈 2** → 敵機 3 → 爆炸 4）。敵彈被丟掉 = 不明死亡；敵機被丟掉玩家還能從彈推位置。（§②）
2. **輪替步進用與 16 互質的數**（如每顆 +9×4 = +36），不要用 +8×4 —— 後者只會踩到 8 個槽位，輪替效果減半。（§3.2）
3. **自機用兩段式判定**：對地形 / 敵機 12×6，對敵彈縮到 **6×4 核心**；**膠囊判定框反而要放大到 12×12**（比精靈大，好撿）。判定順序務必「**先撿膠囊、後判死**」。（§⑧）
4. **`Scroller` 要先寫後捲**：`(camX & 7) === 0` 時先補右緣外一欄（30 磚 + 每兩欄 8 byte 屬性 ≈ 38 byte），再設 `$2005`。每幀實際用量遠低於 160 預算，餘裕 ≈ 58 byte 正是魔王背景磚動畫的來源。（§⑥）
5. **魔王本體改用背景磚**：48×48 全精靈 = 36 顆 OAM + 每線 6 顆，加敵彈必爆線。建議 36 塊背景磚做本體、精靈只畫 4 片外殼板 + 核心 + 砲口閃光（≤ 12 顆）；進場分 12 幀寫（每幀 3 磚），不要一次 36 byte。（§⑩ / §21.2-A）
6. **雷射最長 4 段**，且任何「長」的東西要走斜線或走背景——橫平豎直 + 精靈 = 每線 8 個的地雷。敵方三連雷射的三條 y 必須錯開 ≥ 16 px。（§⑨）
7. **rank 公式**：`clamp(0,15, floor(camCol/48) + (speed−1) + double + laser*2 + options − deaths*3)`；只調「敵彈速度（1.5→3.0 px/幀）」與「砲台間隔（100→40 幀）」兩項，體感最明顯、成本 0。`deaths*3` 是採納 Gradius IV 的修正，避免「復活地獄」。`state()` 要暴露 `rank` 供 QA。（§⑬）
8. **檢查點 5 個（欄 80 / 144 / 208 / 272 / 352），前後 16 欄必須淨空**；死亡時清空所有敵彈、無敵 90 幀、生成必掉 3 顆的救濟編隊，並**保留 SPEED 1 級**（速度 1 級 + 高 rank = 連鎖死亡）。(§⑫ / §21.3)
9. **膠囊要「剛好不夠全買」**：關卡 1 供給約 13 顆（編隊全滅必掉 ×8、特殊色單隻 ×3、硬殼機率 ×2）；膠囊壽命 300 幀閃爍 / 360 幀消失，否則會囤在畫面上吃光 OAM。速度甜蜜點是 3 級（2.5 px/幀），5 級在 80 px 狹道會過衝——狹道最窄不得低於 80 px。（§⑭ / §⑱）
10. **音樂**：`stage1` 的回音軌 = 延遲 3 row、音量 40%、占空比 12.5%、detune +3；三角波要**持續走動低音**（橫捲 STG 前進感的來源）。`shot` 音效必須限流（每 4 幀最多一次）且音量壓到 6~8，否則會把 Pulse 2 打成篩子；只有 `die` 該完全停音樂，其餘只暫借一軌。（§⑳）

## research-gradius（R2）
- **時間**：2026-09-19 16:36 完成（單輪，無中斷）
- **完成**：新增 `docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md`（821 行，繁體中文，12 章）。涵蓋系列史與台灣「沙羅曼蛇」混用釐清、FC 技術規格（CNROM/mapper 3、sprite 0 兩帶分割、軟體精靈輪替）、能量表完整規則、Option 環形緩衝演算法、武器數字、敵人/Big Core、檢查點/rank/循環、沙羅曼蛇差異表、Konami 指令、**手感數字表**、設計建議 10 條。**只動這一個檔**（未跑 build_html.py、未改 README/index.html）。
- **來源數**：**49 個網址**（Wikipedia 4 語版 / StrategyWiki 6 頁 / NESdev 4 / Data Crystal 3 / TCRF / HG101 2 / TASVideos 2 / famiwiki / 巴哈+Mobile01 / ファミ通・GAME Watch 3 / **公開反組譯專案 Fabulu/Mixup 的 Gradius(NES) 逐幀實測文件 10 份**）。每個結論標 `[源]` / `[源/反組譯]` / `[推論]`。
- **重大發現**：找到一份把 Gradius (NES) 逐函式手翻成 JS 並與 Mesen RAM 逐幀比對的公開專案，取得**位元組級的確定數字**，且其 `$40/$41/$42/$44/$45/$46/$07A0` 與 Data Crystal 的 RAM map 完全吻合 → 手感表幾乎不需要 `[推論]`。

### 給開發 agent 的關鍵數字摘要（10 行）
1. **船速無加速度**，`min(($40+2)&$FF,16)/2` px/幀 → 等差 0.5：**1.0 / 1.5 / 2.0 / 2.5 / 3.0**（建議 5 級；原作 14 級飽和 8.0）。斜向**不正規化**（×1.414）。夾限 X[16,240]、Y[16,192]（我們建議 Y[16,184]）。
2. **子彈**：標準 **7 px/幀**、雷射 **12**、DOUBLE 斜上 `(+4,-4)`、飛彈空中 `(+0.5,+2)` / 爬地 `(+2,0)`。
3. **連射**：`$35 = 20 幀`，**子彈還在畫面上時計時器凍結** → 實測節奏 21/23 交替。每個發射體 2 槽（A/B），滿配 6 彈 + 3 飛彈。
4. **Option**：環 **24 筆**、延遲 **11 / 22**、**只有按著方向鍵那一幀環才前進**（停手 = 整串凍結）；沒 Option 時槽照樣更新；復活時 24 筆全填重生座標。→ 契約的「64 筆 / 16 幀」建議改成 **24 筆 / 11、22**。
5. **捲動 0.5 px/幀**（過關演出 4.0）；第 1 關 **3072 px = 12 畫面**（與我們 384 欄完全吻合）→ 建議把 `CR.stage.speed` 從 1.0 改成 **0.5**（否則一關只有 51 秒）。
6. **檢查點每 512 px**（`min(頁碼 & $0E, 8)`，每關 5 個）；死亡**清光 `$40–$46` 全部強化**，只留能量表游標 0 或 1；原作死亡停頓 147 幀，**建議縮到 90 幀 + 補 90 幀重生無敵**（原作沒有無敵幀，查無來源）。
7. **能量表**：第 7 顆**回捲到格 1（不是 0）**；**已擁有的格子按下去不消耗膠囊**；DOUBLE/LASER 共用同一變數 `$44`（2 / 1）所以天然互斥；SPEED **無上限無檢查**；OPTION ≤ 2；護盾 5 下、**不擋地形**；B 鍵原作是「按住」，**建議我們改「按下瞬間」**。
8. **膠囊**：`vx = -0.5`（= 捲動速度，等於釘在世界座標）、`vy = 0`、**無壽命**、X<8 消失、動畫 3 張 ×6 幀；**沒有機率**——編隊（≥4 隻）全滅或紅色單體 100% 掉；**每第 16 顆變清屏膠囊**（不進能量表、音效不同、圖也不同）。
9. **rank**：`(有主武器) + Option 數 + (有護盾)`，**每幀重算、死亡歸零**，門檻只有兩道——`≥2` 敵彈速度 ×1.25、`≥3` 改預判射擊；**實測 rank 完全不影響出怪表**（92 次生成逐位元組相同）→ 我們照抄這條界線，`test_stage1.py` 的出怪數斷言才會穩定。
10. **魔王**：原作 Big Core 只有 **6 點血**（自機彈 1 / 飛彈 2），**每受 1 點換一張形變圖**（核心一格格打開）；rank 只改移動 1.0→2.94 px/幀 與射擊間隔 90→35 幀，**不改血量**。→ 建議 `CR.Boss` 從「外殼 4×8 + 核心 16 = 48 點」**降到 24 點**（外殼 4×4 + 核心 8），並加上每點傷害的形變。

---
## audio（R2）
2026-09-19 ｜ 擁有檔案：`games/cruiser/song.js`（新）、`engine/music.js`、`tools/test_apu.py`、`tools/apu_render.py`
｜ 測試 **103 項全綠**（R1 的 57 項 + 本輪新增 46 項）｜ `bash tools/run_all.sh --quick` 全 PASS（26 檔 node --check、6 支測試）

### ① engine/music.js 新增兩個效果欄（結案 QA R1 **P2-7 / X15**）
| 欄位 | 寫法 | 語意 | 有效聲道 |
|---|---|---|---|
| `detune` | `detune: n`（`0` / `null` 取消） | **固定週期偏移**，+ = 週期變大 = 音變低；持續到下次改寫，**換音不歸零** | p1 / p2 / tri |
| `slide` | `slide: n` | **滑音**：每幀週期 `+n`（正 = 下滑、負 = 上滑）；觸發幀偏移 0 | p1 / p2 / tri |
| `slide` | `slide: {rate, to:'C-5'}` | portamento（FamiTracker `3xx`）：滑到目標音的週期就停住 | p1 / p2 / tri |
| `slide` | `slide: {rate, limit:m}` | 累積偏移夾在 `±m` | p1 / p2 / tri |

- 一幀最終週期 = `基礎音高（note + arp + vib + 樂器 pitch 包絡）+ detune + slide 累積量`，再夾 `0..$7FF`。
- **觸發新音 → `slideAcc` 歸零、`detune` 保留**；`slide` 重新指定時 `slideAcc` 也歸零。
- **音效（sfx）的幀也吃 `detune` / `slide`**（數字型），下滑 / 上滑音效不必逐幀列音名。
- **雜訊 / DMC 軌不受影響**（note 是週期索引 / 取樣名）。
- **完全向下相容**：`driver.state().channels[i]` 多了 `detune / slide / slideAcc` 三個欄位；`games/demo` 與 `NES.Music.DEMO` 一個字都沒改，R1 的 57 項 apu 測試零修改全綠（測試 14.1 明確驗證 demo 曲 600 幀內 `detune===0 && slide===null`）。

### ② games/cruiser/song.js — `CR.Audio` API
| 函式 | 說明 |
|---|---|
| `CR.Audio.init(nes)` | 綁 driver + 註冊 9 個音效（冪等，重複呼叫無害）；回傳 `false` = 沒有 driver |
| `CR.Audio.play(key)` | `key`：`'title' \| 'stage1' \| 'boss' \| 'clear' \| 'gameover' \| 'extend'`；循環與否自動判斷 |
| `CR.Audio.stop()` | 停音樂（不動音效）；`CR.Audio.stopAll()` 連音效一起停 |
| `CR.Audio.sfx(name, opt)` | `opt` 原封不動轉給 `driver.sfx`（可覆寫 `channels` / `priority`） |
| `CR.Audio.tick(nes)` | **每幀一次，放在 `game.update()` 的最後一行** |
| `CR.Audio.state(nes)` | 測試用快照 `{song, playing, orderIndex, row, sfx[], owners{}}` |
| `CR.Audio.PRIORITY` / `CR.SONGS` / `CR.SFX` | 優先權表 / 曲目資料 / 音效資料（`tools/apu_render.py --game cruiser` 直接讀這兩個） |
- 容錯：五個函式的第一個參數都可以傳 `nes`（`play(nes,'stage1')` 也接受）；driver 缺席 / 丟例外一律回 `false`，**不會拖垮遊戲迴圈**。
- 全部原創（旋律 / 和聲 / 鼓組 / 音效自寫），只借鑑研究 06 §2 的編曲技法與 §4 的音效設計原則。

### ③ 曲目表（一小節 = 16 row = 4 拍；BPM = 3600 / (speed × 4)）
| key | speed | BPM | 小節 | 長度 | 循環 | p1 | p2 | tri | noi |
|---|---|---|---|---|---|---|---|---|---|
| `title` | 8 | 112.5 | 8 | 17.04 s | 是 | 長音主旋律 50% | 和弦琶音墊（`arp` 037 / 047） | 半音下行低音 | 稀疏 crash / kick |
| `stage1` | 6 | **150** | **16** | 25.56 s | 是 | 主旋律 25%（E 小調，★上行動機 E-G-B-E，7 / 13 小節換位再現） | **回音軌**：主旋律延後 **4 row（1 拍）**、音量 **-2 級**、**detune +3**、duty 12.5% | 八度跳躍走低音 | 16 beat 鼓 + 每 4 小節過門 |
| `boss` | 5 | 180 | 8 | 10.65 s | 是 | **半音下行 16 分音符** 50% + duty 包絡（鋸齒感） | **減七 / 小七快速琶音**（每幀換音） | 半音走音低音 | 16 beat |
| `clear` | 5 | 180 | 3 | **3.99 s** | 否 | 上行號角 | 回音（延後 2 row、-2 級、detune +3） | 根音 | 滾奏 + crash |
| `gameover` | 6 | 150 | 2（16+14 row） | **3.00 s** | 否 | 半音下行、末音 `slide:6` 下墜 | 回音 detune +5、末音 `slide:6` | 末音 `slide:4` | 低頻 rumble |
| `extend` | 3 | 300 | 1（20 row） | **1.00 s** | 否 | 大三和弦上行琶音 | 回音延後 1 row、detune +4 | 根音 | — |
- **沒有任何曲子用到 DMC 軌**（R2 不放取樣，卡帶預算留給圖）。
- 樂器包絡集中在 `INST`：`lead / echo / pad / horn / fanfare / bass / kick / snare / hat / crash / rumble`。

### ④ 音效表（搶聲道優先權，數字大者搶得走小者）
| name | 優先權 | 聲道 | 幀數 | 內容 |
|---|---|---|---|---|
| `die` | **15** | p1 + p2 + tri + noi | 36 | 唯一會搶主旋律與低音的音效：三軌同時 `slide` 下滑 + 雜訊由高到低。**`CR.Audio.sfx('die')` 會自動先停音樂**（研究 06 §4「death 通常停止音樂再播」） |
| `explode` | 8 | noi + p2 | 19 | 雜訊長模式 period 3→15 + p2 低頻 `slide:34` 下滑 |
| `powerup` | 7 | p2 | 14 | 上行大三和弦琶音 C-E-G-C-E-G-C |
| `extend` | 7 | p2 | 18 | 1-UP 短版（不想中斷音樂時用；完整 jingle 用 `play('extend')`） |
| `laser` | 6 | p2 | 17 | 高頻持續音，**占空比每幀輪替 0/2/1** 做鋸齒感（研究 06 §2.5） |
| `capsule` | 5 | p2 | 13 | 兩音上行「叮」（E-6 → B-6） |
| `missile` | 4 | p2 | 10 | 低頻 50% 方波 `slide:-26` 快速上滑 |
| `hit` | 3 | noi | 5 | 雜訊短模式一擊 |
| `shot` | 2 | p2 | 7 | 12.5% 方波 `slide:16` 短下滑 |
- **除了 `die`，音效一律只用 p2 / noi**，主旋律 p1 與低音 tri 不受干擾（測試 16.3 / 16.7 / 16.9 驗證）。
- 契約原文 `explode` =「雜訊長 + **三角波**下滑」，為了遵守「不搶三角波」，下滑軀幹改走 p2（音色等價、不切斷低音線）。要原汁原味可覆寫：`CR.Audio.sfx('explode', {channels:['noi','tri']})`。

### ⑤ tools/apu_render.py — 遊戲曲目模式
```
$PY tools/apu_render.py --game cruiser --song stage1 --seconds 10
$PY tools/apu_render.py --game cruiser --seconds 10            # --song 省略 = 全部曲目
```
「只含五聲道成分」檢查（四段，全部 PASS）：
1. **暫存器稽核**：driver 寫出去的位址全部落在 `$4000~$4017`，且只碰到五個聲道區塊 + `$4015`/`$4017`（實測 stage1 只用 16 個位址，沒碰 `$4010~$4013`）。
2. **逐聲道單獨渲染**：把其它聲道的寫入濾掉、`$4015` 遮罩 → 印各軌 RMS；宣告用到的軌必須有聲、沒宣告的軌必須完全靜音（前 0.5 s 是 APU 高通的啟動暫態，已跳過）。
3. **頻譜覆蓋**：全混音頻譜的前 12 個峰值，每一個都要在某一軌的單獨渲染中找得到對應能量（-20 dB 內）→ 找不到 = 有第六個音源 → FAIL。
4. **波形健康度**：無 NaN / Inf、峰值 ≤ 1.0、無削波。

實測 6 首 × 7 項 = **42 項全 PASS**；wav 在 `shots/agent_audio/`（`shots/` 已 gitignore）：
| 檔案 | 長度 | RMS | 峰值 | 單軌 RMS（p1 / p2 / tri / noi / dmc） |
|---|---|---|---|---|
| `cruiser_title.wav` | 10 s | 0.0840 | 0.5070 | 0.0548 / 0.0148 / 0.0632 / 0.0048 / **0.0000** |
| `cruiser_stage1.wav` | 10 s | 0.0901 | 0.5409 | 0.0598 / 0.0115 / 0.0639 / 0.0187 / **0.0000** |
| `cruiser_boss.wav` | 10 s | 0.0892 | 0.5618 | 0.0598 / 0.0322 / 0.0571 / 0.0235 / **0.0000** |
| `cruiser_clear.wav` | 10 s | 0.0918 | 0.4930 | 0.0644 / 0.0109 / 0.0620 / 0.0202 / **0.0000** |
| `cruiser_gameover.wav` | 10 s | 0.0780 | 0.4539 | 0.0481 / 0.0077 / 0.0610 / 0.0074 / **0.0000** |
| `cruiser_extend.wav` | 10 s | 0.0954 | 0.3806 | 0.0652 / 0.0142 / 0.0689 / 0.0000 / 0.0000 |
（離線渲染一律 `loop:true`，所以 clear / gameover / extend 這些短曲會重複播到 10 秒。原本的 demo 模式 `$PY tools/apu_render.py` 完全沒動，18 項仍全 PASS。）

### ⑥ tools/test_apu.py — 新增 46 項（57 → 103）
| 段 | 項數 | 內容 |
|---|---|---|
| 14 slide / detune | 13 | demo 曲向下相容（600 幀 `detune===0 && slide===null`）、detune 固定偏移 / 持續 / 歸零、slide 數字逐幀、`{rate,to}` 滑到目標就停、`{rate,limit}` 正負夾限、換音 slideAcc 歸零但 detune 保留、三角波生效、**雜訊軌不受影響**、音效幀吃 slide / detune、`slide:0` 關閉 |
| 15 cruiser 曲目合法性 | 19 | 六首齊全、p1/p2/tri 音域 midi 24..107、**三角波不超過 C-5**、雜訊 note 0..15、vol 0..15 / duty 0..3、order 索引有效、每首都有 p1+tri、**零 DMC**、六首的 BPM / pattern 數 / 實測秒數、stage1 回音軌 **256/256 row 完全對齊延後 4 row（含 loop 接點）**、音量差 2 級、detune > 0 而主旋律 = 0、duty 12.5% |
| 16 音效優先權 / 搶佔 / 回復 | 12 | 九個音效齊全、優先權排序、**除 die 外不宣告 p1/tri**、die 搶四軌、`sfx('die')` 自動停音樂、shot 搶不走 explode、搶佔期間 p2/noi 被佔而 p1/tri 沒有、音樂不寫被佔的暫存器、音樂照常寫 p1/tri、結束後音樂重寫 p2/noi 拿回聲道、APU 值回到音樂音高且四軌仍在播、`CR.Audio` 介面齊全 |
| 17 離線渲染 | 2 | stage1 / boss 各 10 秒：無 NaN、峰值 ≤ 1.0、RMS > 0.01 |
> 陷阱備忘（本輪踩到）：`page.evaluate(JS)` 如果 **JS 的最後一個完成值是函式，playwright 會直接呼叫它**。`tools/test_apu.py` 的 `JS` 字串結尾因此固定放一行 `true;`，新增測試函式時不要動它。

### 跨檔需求（給總控 / 其他 agent）
**(1) `docs/ENGINE_API.md` §10 NES.Music 請增補下表**（`ENGINE_API.md` 不屬 audio agent，故未自行修改）：

| 位置 | 增補內容 |
|---|---|
| §10 開頭那句「指令 `note / inst / vol / arp / vib / duty / stop`」 | 改成 **「指令 `note / inst / vol / arp / vib / duty / cut / detune / slide / stop`」** |
| §10 新增「效果欄」小節 | `detune: n` 固定週期偏移（+ = 音變低，持續到下次改寫，換音不歸零）；`slide: n` 每幀週期 ±n；`slide:{rate,to:'C-5'}` 滑到目標音停（portamento）；`slide:{rate,limit:m}` 夾在 ±m。**最終週期 = 基礎音高 + detune + slide 累積量**，觸發新音 → slideAcc 歸零。雜訊 / DMC 軌不受影響。音效的幀也吃 `detune` / `slide`（數字型） |
| §10 函式表 | `state()` 的 channel 快照新增 `detune / slide / slideAcc` 三欄 |
| §13 工具表 `apu_render.py` | 新增遊戲曲目模式：`$PY tools/apu_render.py --game cruiser [--song stage1] --seconds 10` → `shots/agent_audio/*.wav` + 五聲道成分檢查（暫存器稽核 / 逐聲道單獨渲染 / 頻譜覆蓋 / 無 NaN 不削波） |
| §14 實作差異表 | **P2-7 / X15 已結案**（R2 audio），可加一列 D12：「`music.js` 滑音 / detune 已實作，格式向下相容，demo 曲零改動」 |

**(2) ship agent（`games/cruiser/main.js` / `ship.js`）的呼叫方式**：
```js
init(nes)  { CR.Audio.init(nes); CR.Audio.play('title'); }
update(nes){
  // …讀輸入 → 船 / 選項 / 自機彈 → CR.stage.update(g) → 碰撞 → 撿膠囊 → HUD …
  CR.Audio.tick(nes);                 // ★ 一定要放在 update() 的最後一行（一幀一次）
}
```
| 時機 | 呼叫 |
|---|---|
| 進遊戲 / 重新開始 | `CR.Audio.play('stage1')` |
| 魔王出現 | `CR.Audio.play('boss')` |
| 過關 | `CR.Audio.play('clear')`（4 秒後自己停，`CR.Audio.state(nes).playing === false` 可當結束旗標） |
| 剩餘船歸零 | `CR.Audio.play('gameover')`（3 秒） |
| 加命 | `CR.Audio.play('extend')`（1 秒）或 `CR.Audio.sfx('extend')`（不中斷音樂） |
| 開火 / 雷射 / 飛彈 | `CR.Audio.sfx('shot')` / `sfx('laser')` / `sfx('missile')` |
| 打到敵人 / 敵人爆炸 | `CR.Audio.sfx('hit')` / `sfx('explode')` |
| 撿膠囊 / 啟用強化 | `CR.Audio.sfx('capsule')` / `sfx('powerup')` |
| 自機被擊墜 | `CR.Audio.sfx('die')`（**會自動停音樂**，復活後自己 `play('stage1')`） |
- `shot` 優先權最低（2），連射時會被 `explode`（8）蓋掉——這是刻意的 NES 行為，不是 bug。
- `CR.Audio` 不依賴 `NES.boot` 以外的東西；`song.js` 已在 `cruiser.html` 的載入清單裡，不需要改 html。

**(3) 沒有跨檔改動**：本輪只動 `engine/music.js`、`games/cruiser/song.js`、`tools/test_apu.py`、`tools/apu_render.py` 四個自己的檔，`docs/ENGINE_API.md` / `cruiser.html` / 其他 agent 的檔一律沒碰，未做任何 git 操作。

---

## star-audio（R2b）

**2026-09-19 ｜完成 R2b W1 音樂層｜只改 `games/star/song.js`（808 行，新檔）｜9 首原創曲 + 9 個原創音效｜驗證 0 失敗｜未做 git 操作**

擁有檔案：`games/star/song.js`（唯一）。驗證腳本自寫在 `shots/agent_star_audio/render.py`（`shots/` 不進 git；`tools/apu_render.py` 的 `--song` 只吃「一個全域變數 = 一首曲」，我們是 IIFE + 9 首，所以照 TASKS 指示自寫，並**匯入**它的 `write_wav / rms / spectrum` 不重複實作、沒改它）。
**沒有使用 R2 audio agent 正在加的 `slide` / `detune`**——滑音音效一律逐幀列音、回音一律用「第二方波延遲 N 個 row + 降音量 + 12.5% 占空比」（研究 06 §2.2）做到，所以 `engine/music.js` 之後怎麼改都不影響本檔。

### 1. API（`ST.Audio`，games/star/song.js）

| 成員 | 簽章 | 說明 |
|---|---|---|
| `init(nes)` | `→ boolean` | 記住 `nes`、把 9 個音效 `define` 到 driver（冪等）。`game.init()` 裡呼叫一次 |
| `play(key[, nes])` | `→ boolean` | `key` ∈ `ground / cave / sky / castle / boss / invincible / clear / death / gameover`；jingle（clear / death / gameover）自動 **不 loop**，播完 `state().playing === false` |
| `stop([nes])` | `→ boolean` | 停音樂 + 停所有音效 |
| `sfx(name[, nes])` | `→ boolean` | `name` ∈ `jump / stomp / coin / powerup / hurt / bump / goal / oneup / death` |
| `tick(nes)` | `→ boolean` | **每幀一次，放在 `update()` 最後一行**；內含 ground 的 groove（見下） |
| `state([nes])` | `→ {song, playing, row, orderIndex, speed, sfx[], owners{}, p1,p2,tri,noi}` | 測試 / 除錯用 |
| `validate()` | `→ string[]` | 資料自檢（pattern 長度 / 音名 / order / 音效只佔 p2+noi / 音效 ≤ 60 幀）；**不在載入時跑**，給測試腳本用，回空陣列 = 全對 |
| `SONGS / SFX / INFO / PRIORITY / KEYS / NAMES` | | 曲目物件、音效定義、曲目資訊表、優先權表、名稱清單（離線渲染與測試用） |

全部函式都吞例外回傳 boolean：**音樂出錯不會拖垮遊戲迴圈**；`NES.Music` 缺席時所有呼叫安靜回 `false`。

### 2. 曲目表（全部原創；BPM = 3600 / (speed × 每拍 row 數)，研究 06 §1.7）

| key | 曲名 | BPM | speed | row/小節 | 小節 | pattern 數 | 一圈 | 聲道配置 | 情緒 |
|---|---|---|---|---|---|---|---|---|---|
| `ground` | 星塵草原 | **163.6** | 5 + groove `[5,6]` | 16（16 分） | **32**（A A2 B A3） | 30 | 2816 幀 / 46.86 s | p1 主旋律（lead：50%→25% 音頭）／ p2 8 分和弦琶音彈跳 ／ tri 八度跳躍低音 ／ noi 搖滾鼓 + 過門 | 明亮跳躍、C 大調 |
| `cave` | 地底回聲 | 100.0 | 9 | 16 | 16 | 26 | 2304 幀 / 38.34 s | p1 稀疏長音（顫音 delay 14）／ **p2 = p1 延後 3 row 的回音**（音量 7、12.5%）／ tri 半音符低音（主角）／ noi 只有每 4 小節一滴悶響 | 低沉、空曠、A 自然小調 |
| `sky` | 雲上的階梯 | 150.0 | 4 | **24（每拍 6 row → 2 row = 一個三連音）** | 16 | 26 | 1536 幀 / 25.56 s | p1 **8 分三連音**琶音跑動（高至 G-6）／ p2 長音和弦 ／ tri 四分低音 ／ noi 輕鼓 | 輕快、飄浮、C 大調 |
| `castle` | 鐵鎚王的城 | 90.0 | 10 | 16 | 16 | 26 | 2560 幀 / 42.60 s | p1 **半音級進**風琴（占空比顫動 + 顫音）／ p2 減和弦長音（arp `[0,3,6]`）／ tri **半音下行低音** D3→A1 ／ noi 每小節一記低鳴 | 緊張、壓迫、慢，D 小調 |
| `boss` | 鐵鎚落下 | 225.0 | 4 | 16 | 16 | 26 | 1024 幀 / 17.04 s | p1 **16 分下行動機**（A→G→F→E→D 半音收束）／ p2 延後 2 row 回音 ／ tri 8 分八度踏板 ／ noi 疾走 16 分 + 過門 | 快速、下行、A 小調 |
| `invincible` | 星光疾走 | 300.0 | 3 | 16 | 10 | 17 | 480 幀 / **7.99 s** | p1 大三和弦琶音**每小節升半音**（C→C#→D→D#→E）／ p2 和弦 ／ tri 8 分低音 ／ noi 16 分 | 急促、上衝 |
| `clear` | 過關 | 150.0 | 6 | 30（單段） | — | 4 | 180 幀 / **3.00 s**（不 loop） | p1 鐘聲上行 C→E→G→C6→E6→D6→C6 ／ p2 三度和聲 ／ tri 根音 ／ noi 鈸 + 小鼓漸強 | 勝利號角 |
| `death` | 死亡 | 180.0 | 5 | 18（單段） | — | 4 | 90 幀 / **1.50 s**（不 loop） | p1 半音下行 8 音 ／ p2 低八度跟隨 ／ tri 下行低音 ／ noi 一記悶響 | 墜落 |
| `gameover` | 遊戲結束 | 100.0 | 9 | 20（單段） | — | 4 | 180 幀 / **3.00 s**（不 loop） | p1 風琴 A→G→F→E ／ p2 內聲部 C→B→A→G# ／ tri 低音 ／ noi 兩記低鳴 | 低沉終止、A 小調 |

**ground 為什麼要 groove**：驅動的 `speed` 是整數幀，16 row/小節時只做得出 180（speed 5）或 150（speed 6）BPM，做不出契約要的 165。所以 `ST.Audio.tick()` 在每個 row 開頭把 `driver.speed` 在 5 / 6 之間交替（FamiTracker 的 groove），平均 5.5 幀/row = **163.6 BPM**；因為 8 分音符 = 2 row = 固定 11 幀，只有 16 分反拍被挪後半幀，是很輕的 shuffle 而不是搖擺。實測一圈 2816 幀（speed 5 佔 1280 幀、speed 6 佔 1536 幀），與 `INFO.ground.frames` 完全一致。

**編曲共通手法**（研究 06）：§2.1 琶音假和弦（p2）、§2.2 第二方波延遲回音（cave / boss）、§2.3 顫音（cave 長音 delay 14、castle delay 20）、§2.5 占空比包絡（lead 音頭 50% → 身體 25%、organ 每 2 幀 50%↔25%）、§2.6 三角波八度跳躍 / 走音線 / 半音下行、§2.7 雜訊鼓 pattern + 段末過門、§2.8 order table 重用（32 小節只用 30 個 pattern）。

### 3. 音效表（只搶 **p2 / noi**；p1 主旋律與 tri 低音永不被搶，研究 06 §1.6）

| 音效 | 優先權 | 佔用 | 長度 | 設計 |
|---|---|---|---|---|
| `death` | 9 | p2 + noi | 22 幀 | 下行琶音 A5→C4 + 雜訊由高到低（完整 1.5 秒版請用 `play('death')`） |
| `goal` | 8 | p2 | 38 幀 | 旗桿滑下：C 大調音階 G-6 一路下行 15 音，每音 2 幀 |
| `oneup` | 7 | p2 | 29 幀 | 上行三音 G-5 → C-6 → E-6（+ G-6 收尾），每音 5 幀 |
| `powerup` | 6 | p2 | 26 幀 | 大三和弦上行琶音兩個八度，每音 2 幀 |
| `hurt` | 5 | p2 + noi | 20 幀 | 50% 方波半音下滑 13 音 + 一記雜訊 |
| `coin` | 4 | p2 | 21 幀 | 兩音上跳 E-6 → B-6（上行五度），第二音長衰減 |
| `stomp` | 3 | p2 + noi | 8 幀 | 雜訊短擊（週期 8→14）+ 方波下滑增加重量 |
| `jump` | 2 | p2 | 12 幀 | 25% → 12.5% 兩個八度上滑 D-5 → G-6 |
| `bump` | 1 | noi | 4 幀 | 撞頭悶響：雜訊最低的兩段週期（14 / 15），4 幀就收 |

- 契約寫 bump 是「悶響三角 / 雜訊」，這裡**只用雜訊**：契約同時規定音效只搶 p2 / 雜訊，而三角波一斷整首會空掉（研究 06 §1.6），所以改用週期 14/15 的雜訊做悶響。
- 實測優先權：`jump→coin` 變 coin、`coin→jump` 仍是 coin、`hurt→death` 變 death、`goal`（p2）與 `bump`（noi）可以同時存在。

### 4. 驗證結果（`../卡比之星/.venv/bin/python shots/agent_star_audio/render.py --seconds 10`，**失敗 0 項**）

| 項目 | 結果 |
|---|---|
| `node --check games/star/song.js` | PASS |
| `ST.Audio.validate()` | 0 問題（pattern 長度 = rows、音名全可解析且在 A0~C8、order 指向存在的軌、音效只佔 p2/noi 且 ≤ 60 幀並以 `{off:true}` 收尾） |
| 離線渲染 9 首 × 10 秒 → wav | 全部 **無 NaN / Inf**、峰值 0.364~0.569（**≤ 1.0**、不削波）、低/中/高頻都有能量 |
| 「只含五聲道」暫存器稽核 | 每首用 `driver.record()` 抓全部寫入：位址一律落在 **$4000~$4017**，聲道集合 = `p1, p2, tri, noi, ctl($4015/$4017)`；**沒有任何 DPCM / 非 APU 寫入** |
| 9 首 × 600 幀連續 tick（含 loop 邊界） | 全 PASS、無錯、峰值 ≤ 1.0 |
| 9 個音效 × 觸發後復原 | **p1 主旋律 0 幀被搶、tri 0 幀被搶**；p2/noi 最晚 38 幀（goal）還給音樂，全部 **≤ 60 幀** |
| 音效優先權 | 3 項情境全 PASS（見上表） |
| `star.html?debug=1&mute=1` 整合（playwright 載全套 engine + song.js） | `ST.Audio.init(nes)` 成功、9 個 key 各 `play` + `tick` 600 幀 0 錯、9 個音效復原 ≤ 39 幀、**0 pageerror / 0 console error** |
| `bash tools/run_all.sh --quick` | **PASS**（node --check 27 檔、test_apu 103、test_chr 91、test_core、test_ppu 144、test_shmup 157、demo 全過、build --check PASS）→ 沒有變紅 |

**wav 路徑**（`shots/` 已 gitignore）：
`shots/agent_star_audio/{ground,cave,sky,castle,boss,invincible,clear,death,gameover}.wav`（各 10 秒、44.1 kHz 16-bit 單聲道）
`shots/agent_star_audio/sfx_{jump,stomp,coin,powerup,hurt,bump,goal,oneup,death}.wav`（各 2 秒＝ground 底 + 第 30 幀觸發該音效，可直接聽搶聲道與復原）

### 5. 跨檔需求（給 star-hero 的呼叫點）

`games/star/song.js` 已在 `star.html` 的載入清單裡（總控建好），**不需要改 html、不需要改任何別的檔**。star-hero 的 `main.js` 只要：

```js
init(nes)   { ST.Audio.init(nes); ST.Audio.play(level.music || 'ground'); }
update(nes) {
  /* …輸入 → hero → 敵人 → 碰撞 → 鏡頭 → HUD… */
  ST.Audio.tick(nes);            // ★ 一定要放在 update() 的最後一行（一幀一次）
}
```

| 時機 | 呼叫 | 備註 |
|---|---|---|
| 關卡開始 / 回檢查點 | `ST.Audio.play(ST.LEVELS[id].music)` | `music` 值 = `'ground' \| 'cave' \| 'sky' \| 'castle'`（star-world 的關卡表，1-1~1-4 正好對到四首） |
| 魔王出現 | `ST.Audio.play('boss')` | |
| 吃到無敵星 | `ST.Audio.play('invincible')` | 7.99 s loop；無敵結束時自己 `play(關卡曲)` 接回去 |
| 碰到 GOAL 旗桿 | `ST.Audio.sfx('goal')` → 結算時 `ST.Audio.play('clear')` | clear 3.00 s，播完 `ST.Audio.state(nes).playing === false` 可當「可以切下一關」的旗標 |
| 死亡 | `ST.Audio.play('death')` | 1.50 s，播完 `playing === false`；**play 會自動蓋掉正在播的關卡曲**，不必先 stop |
| lives 歸零 | `ST.Audio.play('gameover')` | 3.00 s |
| 跳躍 | `ST.Audio.sfx('jump')` | 起跳那一幀呼叫（不要每幀呼叫，會疊成噪音牆） |
| 踩敵回彈 | `ST.Audio.sfx('stomp')` | |
| 撞磚 / 撞到不可破壞的頂 | `ST.Audio.sfx('bump')` | 只佔雜訊軌，最短（4 幀），連打也不吵 |
| 金幣 | `ST.Audio.sfx('coin')` | |
| ? 磚出道具 / 吃到道具 | `ST.Audio.sfx('powerup')` | |
| 100 金幣加命 | `ST.Audio.sfx('oneup')` | |
| 受傷（不死） | `ST.Audio.sfx('hurt')` | |

- `tick()` 沒被呼叫 → 音樂完全不動（driver 是每幀驅動的），**`update()` 提早 return 的分支也要記得呼叫**。
- 音效 `jump`（2）會被 `coin`（4）以上的音效蓋掉，這是刻意的 NES 行為（研究 06 §1.6），不是 bug。
- `?mute=1` 只代表不接喇叭，`ST.Audio` 的邏輯與離線渲染照跑，測試可以放心用。
- **契約異動：無**。`docs/TASKS.md` 的音效清單（jump/stomp/coin/powerup/hurt/bump/goal）之外，依本輪指示多做了 `oneup`、`death` 兩個音效與 `invincible` 一首曲，都是**新增**、不影響既有契約。

---

## ship（R2）

2026-09-19 ｜ ship agent ｜ 擁有檔案：`games/cruiser/chr_ship.js`、`ship.js`、`main.js`、`test_cruiser.py`
（**沒有動任何別人的檔**，`cruiser.html` 未修改、沒有新增檔案）

《星塵巡航艦》自機側完成：CHR（精靈磚 0..127 + HUD 字型磚 0..63）、自機物理 / 武器 / Option /
能量表 / 死亡復活、主程式（模式機、OAM 配置、碰撞、HUD、下方 32 線 split）、124 項自動測試。
**手感數字全部改用 `docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md` §⑩ 的 byte-level 逆向值**
（見下方「契約異動」），每個常數在原始碼裡都標了 `[源]` / `[推論]`。

### API 表

| 命名空間 | 成員 | 說明 |
|---|---|---|
| `CR.SPR_SHIP` | 35 個磚（`S_` 前綴） | 船 16×8 ×2 幀（`S_SHIP_L0/R0/L1/R1`，噴焰閃爍）、Option 光球 ×2（`S_OPT0/1`）、自機彈 `S_BULLET`、斜彈 `S_BULLET_D`、雷射段 / 頭 `S_LASER` / `S_LASER_H`（可橫向無縫拼 4 段）、飛彈 ×2 `S_MISSILE0/1`、爆炸 4 幀 ×4 磚 `S_EXP{0..3}_{TL,TR,BL,BR}`、紅膠囊 ×2 `S_CAP_R0/1`、藍膠囊 `S_CAP_B`、護盾弧 ×2 `S_SHIELD0/1`、碎片 ×2 `S_DEBRIS0/1` |
| `CR.BG_HUD` | 51 個磚（`H_` 前綴） | 空白 `H_SP`（磚 0）、數字 `H_N0..N9`、字母 `H_A..H_Z`（全 26 個）、`H_QUEST / H_MUL / H_DOT / H_DASH / H_COLON / H_ARROW / H_STAR`、能量格框 `H_GL/GM/GR`（未選）與 `H_GLON/GMON/GRON`（選中）、剩餘船圖示 `H_SHIP` |
| `CR.PAL` | `{backdrop:$0F, spr[4], bg[4]}` | spr0 船（$01/$30/$27 深藍 / 白 / 橘）、spr1 自機彈 / 雷射 / 飛彈 / 爆炸 / 紅膠囊（$16/$28/$30）、spr2/3 與 bg1..3 是預設值，**stage 的 `init(ppu)` 在之後呼叫、可以直接覆蓋** |
| `CR.tileNameFor(ch)` / `CR.CHARMAP` | `(char) → 磚名` | HUD 文字 → `H_*` 磚名 |
| `CR.Ship.create()` | `→ ship` | 建立自機（main 已建好一個，見 `CR.ship`） |
| `CR.Ship.*`（常數） | `SPEED_PX / SPEED_V / MAX_SPEED / PLAY / SPAWN_X / SPAWN_Y / SHOT_V / LASER_V / KILL_X / SLOTS_PER_EMITTER / FIRE_DELAY / LASER_MAX_SEG / LASER_STEP / MAX_OPTION / RING / OPT_LAG / OPT_ANIM / DEATH_FRAMES / INVUL_FRAMES / BLINK / SHIELD_HP / CHECKPOINT_PX / START_LIVES / EXTEND_EVERY / CLEAR_CAPSULE_EVERY / GAUGE_MAX / GAUGE_NAME / GAUGE_LABEL / BOOM_FRAME / DMG_SHOT / DMG_MISSILE / K` | 所有手感數字都在這裡，測試與 stage 都從這裡讀，不要各自寫死 |
| `CR.ship`（契約物件） | `{x, y, w:12, h:6, alive, speed, power:{missile,double,laser,option,shield}, gauge, shots[], options[], invul, lives, score, hi}` | 另有內部 `sx, sy`（精靈左上，碰撞框 = `sx+2, sy+1`）、`ring/head`、`emit[3].timer`、`debris[6]` |
| `CR.ship` 方法 | `update(g) → '' \| 'deathdone'`、`move(input)`、`fire()`、`activate() → 能力名 \| ''`、`capsule(blue?) → gauge \| 'clear'`、`hit(terrain?) → 是否死亡`、`die()`、`addScore(n)`、**`rank() → 0..4`**、`reset(hard)`、`newGame()`、`place(x,y)`、`rect()`、`blink()`、`speedPx()`、`checkpointOf(camX)`、`state()` | `hit(true)` = 地形（護盾無效）。`rank()` 給 stage 調難度用 |
| `CR.Fx` | `boom(x, y)`（中心座標，16×16 四幀 ×6 幀）、`booms[]`、`count()`、`reset()`、`FRAME` | **stage 也可以直接呼叫**；目前 stage 自己有爆炸池，本池只用在自機死亡與飛彈撞牆 |
| `CR.sprBank` / `CR.bgBank` | `NES.CHR.bank` 物件（`cr_spr` / `cr_bg`） | main.init 合併 SPR_SHIP+SPR_WORLD、BG_HUD+BG_WORLD 後建立並 `setPattern(0/1)` |
| `CR.TILE` / `CR.BGTILE` | `{磚名: 索引}` | 合併後的查表，**stage / audio / 測試都可以直接用**，不必自己 `bank.index()` |
| `CR.PLAY_ROWS = 26` / `CR.HUD_ROW = 26` / `CR.SPLIT_LINE = 208` / `CR.PLAY_H = 208` | 常數 | 版面契約：名稱表列 0..25 = 遊戲區、列 26..29 = HUD |
| `CR._fallback` | `{aabb, OAM, Pool}` | `NES.SH` 缺席時的最小替代（**現在 NES.SH 已到位，實際走 engine 版**，`state().oam.engine === true` 可驗） |
| `CR.SH` | 實際採用的實作 | `{aabb, OAM, Pool, usingEngine}` |
| `window.GAME` | `{init, update, draw, state}` | `state()` 回 `{mode, x, y, speed, speedPx, gauge, gaugeName, power, rank, options, shots, shotCount, timers, capsules, ringSteps, moved, invul, lives, score, hi, deathTimer, deaths, booms, camX, enemies, kills, hits, stage, oam, hud, lastEvent}`；`hud` 是**從名稱表讀回來**的 3 列字串（`'1P …|標籤|格框'`），可直接驗 HUD |

模式機：`title` →（START）`play` ⇄ `dead` →（命數 0）`gameover` →（START）`title`；`CR.stage.cleared` → `stageclear`。

每幀順序（契約）：`update` = 輸入 → 船 / Option / 自機彈 → `CR.stage.update(g)` → 碰撞（自機彈 × 敵 / 魔王；敵 / 敵彈 / 地形 × 船）→ 撿膠囊 → `CR.stage.takeScore()` → `CR.Audio.tick()`；
`draw` = HUD 差分寫入 → `ppu.scroll(camX % 512, 0, 0)` → `ppu.split(208, {x:0, y:208, nt:0})` → OAM `begin` → 船 / Option（prio 0）→ 自機彈（1）→ `CR.stage.draw(oam)`（敵彈 2 / 敵 3）→ 爆炸・碎片（4）→ `end`。

### 測試

`games/cruiser/test_cruiser.py`（playwright，`cruiser.html?debug=1&scale=1&mute=1`）：**124 項，全部通過、0 SKIP**。
① 啟動 / CHR / 調色盤 / 契約欄位 16 項 ② 速度 5 級 × 60 幀位移 + 4 個邊界 + 左右同按 + 上下同按 + 斜向 19 項
③ 武器（彈速 7 / 雷射 12 段數 / DOUBLE (+4,−4) / 飛彈 (+0.5,+2) / 2 槽上限 / 20 幀間隔 / 計時器凍結 / 互斥 / 出界消滅）17 項
④ 能量表（回捲、已擁有不消耗、上限、護盾 5 下、不擋地形、第 16 顆清屏、rank）16 項
⑤ Option（環 24、延遲 11 / 22 逐幀比對船軌跡、停手凍結、跟著發射、復活就位）7 項
⑥ 死亡 / 復活 / 命數 / 檢查點 / 無敵閃爍 / GAME OVER / EXTEND 16 項
⑦ HUD（3 列內容、6 格反白、分數 / 船數更新、**400 幀 `budget.over === 0` 且尖峰 ≤ 160 byte**、捲動 120 幀 HUD 不被蓋）14 項
⑧ PPU（240 幀同屏 ≤ 25 色 + lint 全綠、**OAM 12 顆同線兩幀聯集蓋滿**、超過 64 槽 dropped、prio 排序）6 項
⑨ 與 `CR.stage` 整合（`spawnTest` 打敵人 / 撿膠囊 / 撞敵死亡 / 藍膠囊清屏）6 項 ⑩ 穩定度 3 項
`bash tools/run_all.sh --quick` = **PASS**（node --check 31 檔、9 個測試檔全過、build --check 過）。

### 截圖（`shots/agent_ship/`，全部 lint 綠、`budgetOver=false`）

| 檔案 | 內容 | lint |
|---|---|---|
| `title.png` | 標題畫面（STARDUST CRUISER / PRESS START）+ 星空 + HUD | colors 7 |
| `shoot.png` | 遊玩中：船 + 標準彈 + 飛彈落下 | colors 10 |
| `laser.png` | 雷射 4 段 + 2 顆 Option（同線 16 精靈 → 靠 OAM 輪替閃爍） | colors 9 |
| `options.png` | 2 顆 Option 拉成軌跡 + 護盾弧 + DOUBLE 斜彈 | colors 9 |
| `death.png` | 死亡：爆炸第 3 幀 + 6 塊碎片四散 | colors 9 |
| `hud.png` | HUD：分數 0138400 / HI / 船數 ×3 / 能量表第 4 格（LASER）反白 | colors 9 |
| `stage.png` | 捲動 120 幀後的小行星帶 + 船 | colors 9 |

### 契約異動（**已依總控 2026-09-19 指示改為研究 §⑩ 的原作實測值**）

| # | TASKS.md 原訂 | 改成 | 依據 |
|---|---|---|---|
| S1 | 船速 1..5 = 1.5 / 2.0 / 2.5 / 3.0 / 3.5 | **1.0 / 1.5 / 2.0 / 2.5 / 3.0**，無加速度、斜向不正規化 | 研究 §10-1 [源] |
| S2 | 邊界「0..207 線、x 8..240」 | **x [8, 240]、y [16, 184]**（精靈左上；16×8 全程可見） | 研究 §10-1 [源] |
| S3 | 自機彈 4 px/幀、同屏 ≤ 2 發 | **7 px/幀**；上限改成「**每個發射體 2 槽**」（本體 + 每顆 Option 各 2 ⇒ 滿配 6 發），另加**連射間隔 20 幀、兩槽占用時計時器凍結** | 研究 §10-2 [源] |
| S4 | 雷射「每幀延伸」 | 段數 1→4（每幀 +1），**頭部 12 px/幀**，貫通（同一道對同一隻只算一次傷害） | 研究 §10-2 [源] |
| S5 | 飛彈「斜下 45°，每 2 幀？」 | **空中 (+0.5, +2) → 落地爬行 (+2, 0)**，傷害 2，每個發射體 1 發 | 研究 §10-2 [源] |
| S6 | Option 環 64 筆、延遲 16 幀 | **環 24 筆、延遲 11 / 22**，且**只有按方向鍵那一幀環才前進**（停手凍結成一排）；動畫 2 張每 8 幀自由跑；復活時環全填重生座標 | 研究 §10-3 [源] |
| S7 | 護盾 hp 3 | **hp 5**，且**不擋地形**（`ship.hit(true)` 直接死） | 研究 §10-5 / §10-1 [源] |
| S8 | 死亡碎片 60 幀、無敵 120 幀 | **死亡停頓 90 幀**（碎片 60）、**復活無敵 90 幀**、每 4 幀閃一次 | 研究 §10-4 / §10-7 [推論] |
| S9 | — | 能量表**第 7 顆回捲到格 1**、**已擁有的能力按 B 不消耗膠囊**、**每第 16 顆膠囊 = 清屏**、B 改成按下瞬間（edge） | 研究 §10-5 [源] / [推論] |
| S10 | — | 新增 **`CR.ship.rank() = (laser\|\|double) + option 數 + (shield?1:0)`（0..4）**，死亡自動歸 0；rank 只該影響「敵人怎麼打」（≥2 敵彈 ×1.25、≥3 預判射擊），**不得影響出怪表** | 研究 §10-6 [源] |
| S11 | HUD「第 3 行剩餘船數」 | **列 26** = `1P <7 位分數>  HI <7 位紀錄>` + 右側船圖示 `x N`；**列 27** = 能量表 6 格標籤；**列 28** = 能量表 6 個格框（未選 = 灰空框、選中 = 白框填滿）。理由：可見區只有列 26..28（列 29 被裁掉），且 16×16 屬性表對不齊 5 欄一格，改用「不同磚」做反白 | 版面限制 |
| S12 | 「若引擎 split 只支援上方固定，就把 HUD 放上方」 | **不需要**：`ppu.split(208, {x:0, y:208, nt:0})` 下方固定 HUD 實測可行（與 engine §15.5 的建議一致） | 實測 |

### 跨檔需求 / 給其他 agent 的約定

**給 stage**（`chr_world.js / enemies.js / boss.js / stage1.js`）——下列 1~4 **已經確認 stage1.js 目前的實作就是這樣**，列出來是為了避免之後改壞：

1. **名稱表只能寫列 0..25**（`CR.PLAY_ROWS = 26`）；列 26..29 是 HUD 的地盤。`NES.SH.Scroller` 請用 `{row0: 0, rows: 26}`。
2. **`CR.stage.solidAt(x, y)` 用螢幕座標**（x 0..255、y 0..207），main 拿它判船撞地形、飛彈拿它爬地。
3. **記分**：main 每幀呼叫 `CR.stage.takeScore()`；只要這個函式存在，main 就**不會**再自己 `addScore(e.score)`、也**不會**再補畫爆炸（避免雙重計分 / 雙重爆炸）。沒有 `takeScore` 時 main 才會自己加 `e.score || 100` 並 `CR.Fx.boom()`；那種情況下敵人可以設 `e.fx = false` 叫 main 不要補爆炸。
4. **膠囊**：main 撿到時若膠囊物件有 `blue` 欄位就照用，**沒有 `blue` 欄位才由 ship 自己數「每第 16 顆 = 清屏」**。目前 stage 自己給 `blue`，所以「第 16 顆」規則由 stage 負責 —— 請照研究 §10-5 [源] 實作（不要用機率）。
5. **檢查點**：main 死亡時用 `CR.stage.checkpoint(camX)`（沒有就退回 512 px 規則 `CR.Ship.CHECKPOINT_PX`）。stage 目前是欄 0 / 128 / 256（camX 0 / 1024 / 2048）＝ 每 1024 px，研究 §10-4 [源] 是 **每 512 px（12 畫面共 6 個）**，建議 stage 改成 6 個檢查點，死亡懲罰才不會太重。
6. **`restart()` 會一次補滿名稱表（1700+ byte）**：main 在呼叫 `CR.stage.restart()` / 進入 play 前後會自己把 `timing.budget.mute` 打開再關掉（＝真機「關閉 rendering 重建畫面」），stage 不用再自己 mute，但**也不要在 update 路徑上呼叫 restart**。
7. **難度**：`CR.ship.rank()` 已經可用（0..4）。請照研究 §10-6：rank ≥ 2 敵彈速度 ×1.25、rank ≥ 3 預判射擊；**rank 不得影響出怪表**。
8. **可共用的資源**：`CR.TILE` / `CR.BGTILE`（磚名 → 索引）、`CR.Fx.boom(x,y)`（16×16 四幀爆炸）、`CR.Ship.*` 常數。
9. `CR.SPR_SHIP` 有 `S_CAP_R0/R1/S_CAP_B`（膠囊）與 `S_SHIELD0/1`；stage 目前用自己的 `W_` 膠囊磚＋精靈組 2/3，兩邊不衝突，只是我的 3 個膠囊磚沒被用到 —— 整合時二選一即可（建議留 stage 的，因為顏色跟敵人同組比較省調色盤）。

**給 engine**：`NES.SH` 的 9 條契約異動已全部照做（自己設 `ppu.scroll(camX % 512, 0, 0)`、`ppu.mirroring('v')`、`ppu.flickerStep = 0`、`split(208)`、`OAM {reserve:0}`）。`NES.SH.OAM` 的 `prio` 依 TASKS 用 **0 船 / 選項、1 自機彈、2 敵彈、3 敵、4 爆炸**（ENGINE_API §15.4 的示例寫的是 0/1/2/3，兩者只差偏移，stage 與本檔已對齊 TASKS 的編號）。

**給 audio**：`CR.Audio` 缺席不致命。自機側會呼叫的音效名稱：`shot`、`laser`、`missile`、`hit`（護盾擋下）、`capsule`、`powerup`、`die`、`extend`；曲目 `CR.Audio.play('title' | 'stage1' | 'clear' | 'gameover')`。`CR.Audio.tick(nes)` 由 main 的 `update()` 最後一行呼叫（沒有 `CR.Audio` 時退回 `nes.music.tick()`）。

### 已知問題 / 尚未做

1. **能量表標籤縮寫且 6 格相連**：可見寬度只有 32 欄，6 格 × 5 欄 = 30 欄剛好用完，所以標籤縮成 `SPEED / MISSL / DOUBL / LASER / OPTON / ?`、格與格之間沒有空欄（靠下一列的格框 `[---]` 分界）。要更好看只能改成 2 頁輪播或縮成 4 欄縮寫。
2. **船沒有做「傾斜動畫」**（研究 §10-1 的每 8 幀鎖存傾斜圖）：目前只有噴焰 2 幀閃爍。要做需要再 4 個磚（上傾 / 下傾各 2）。
3. **雷射 3 道同線會觸發每線 8 精靈丟棄**（`laser.png` 的 `maxSpritesLine = 16`）：這是真機行為，由 `NES.SH.OAM` 的輪替補齊（兩幀聯集），但靜態截圖看起來會少幾段。
4. **`?` 格只做護盾**（研究裡 FC 版的 `?` 也只有護盾），沒有做「第二輪變別的」。
5. **復活時前 30 幀沒有鎖輸入**（研究 §10-7 的建議）：實測不鎖比較順手，若 qa2 認為太寬鬆再加。
6. 分數上限 9999999（HUD 7 位）；`hi` 存在 `localStorage['cruiser_hi']`，`?debug=1` 的測試會寫到瀏覽器 profile，`--quick` 的無頭瀏覽器每次都是新 profile，不影響重現性。

---

## stage（R2）

擁有檔案：`games/cruiser/chr_world.js`、`enemies.js`、`boss.js`、`stage1.js`、`test_stage1.py`
（2026-09-19，地形 / 出怪 / 敵人 / 魔王層完成；`NES.SH` 契約異動 9 條已全部照做，**沒有留任何 fallback**）

### 一、對外介面表（`CR.stage`，stage1.js）

| 成員 | 簽章 / 值 | 說明 |
|---|---|---|
| `init(ppu)` | `(ppu) → stage` | 解析磚索引、套用 stage 的調色盤組、建地形、建 4 個 `NES.SH.Pool`、建 `Scroller` / `Spawner`、`restart(0)`。**由 main 的 `init` 在 `buildBanks()` 之後呼叫** |
| `update(g)` | `(mainState) → stage` | 推進相機 → `Scroller.update` → `Spawner.update` → 敵 / 彈 / 膠囊 / 爆炸 / 魔王 |
| `draw(oam)` | `(NES.SH.OAM)` | 只用 `oam.add({…, prio})`：**爆炸 4 / 敵 + 魔王 3 / 敵彈 2 / 膠囊 2**（契約編號） |
| `checkpoint(camX)` | `→ camX` | 回傳 ≤ camX 的最後一個檢查點（**每 512 px**：0/512/1024/1536/2048/2560） |
| `restart(camX)` | `(camX) → stage` | `Pool.freeAll ×4` + `Boss.despawn` + `Scroller.reset` + `Spawner.seek`（NES.SH §15.8-5）。內部自帶 `budget.mute`，main 額外再 mute 一次也無害 |
| `solidAt(x, y)` | **畫面座標** `(0..255, 0..207) → bool` | 與其他碰撞框同一套座標（main 直接丟船的畫面矩形四角）。世界座標版另有 `solidAtWorld(wx, y)` |
| `clearScreen()` | `→ {bullets, enemies, score}` | 藍膠囊：清光所有敵彈 + 消滅所有**小敵**（fan / turret / zig，計分）；`tank` 與魔王部位不受影響 |
| `spawnTest(kind, x, y)` | `fan / turret / turret_ceil / zig / tank / bullet / capsule / capsule_blue / boom / boss` | 給 `test_cruiser.py`、`test_stage1.py` 用；未知種類 throw |
| `enemies / bullets / capsules / explosions` | `NES.SH.Pool` 24 / 40 / 6 / 12 | 每個元素都有 `{x, y, w, h, alive}`；敵人另有 `{hp, score, kind, hit(dmg), kill()}` |
| `camX / speed / length / bossActive / cleared` | `0..2816 / 128 / 384 / bool / bool` | `speed` 是 8.8 = **0.5 px/幀**（研究 16 §10）；`length` = 欄數 |
| `takeScore()` | `→ int` | main 每幀取走並加進分數（stage 自己記分、自己畫爆炸，main 不要重複加） |
| 其他（除錯 / 測試） | `tileAt(c,r) / attrAt(c16,r16) / kindAt(c,r) / tileIndex(name) / ceilAt(c) / floorAt(c) / aliveEnemies() / aliveBullets() / aliveCapsules() / capsuleSeq() / scroller() / spawner() / spawnTable() / scrollX() / info() / spawnTurretAt(col, ceiling) / mkOam(ppu,opt) / K / KIND_NAMES / CHECKPOINTS` | |

**除錯用網址參數**（stage1.js 自己讀 `location.search`，在第 2 次 `update` 時套用，所以 main 的 `toPlay()` 先 `restart(0)` 也不會被蓋掉）：
`cruiser.html?debug=1&camx=1320`（跳到指定 camX）、`?boss=1|2|3`（跳到魔王並強制階段）。截圖與 QA 直接用這個，不必打 40000 幀。

### 二、CHR / 調色盤（chr_world.js）

| 項目 | 數量 | 契約 |
|---|---:|---|
| `CR.SPR_WORLD`（`W_` 前綴） | **52 磚** | ≤ 128（實測落在合併 bank 的索引 128..179） |
| `CR.BG_WORLD`（`W_` 前綴） | **33 磚** | ≤ 192（實測索引 64..96） |

- 精靈：小蜂 2 幀（8×8）、敵彈 2 幀（8×8）、砲台 2 幀、之字機 2 幀、硬殼 2 幀、魔王外殼板（完好 / 龜裂）、魔王核心（開 / 合）、雷射砲口 2 幀、膠囊 2 幀、爆炸 4 幀（皆 16×16 = 4 磚 或 8×8 = 1 磚）。
- 背景：星空 2 種、小行星 3 種（16×16）、碎片 2 種、要塞（牆 / 鉚釘板 / 直管 / 橫管 / 壁燈 / 地板頂面 / 天花板底面 / 內部填充）、魔王區背板 + 支柱、魔王艦體 4 種、雷射（預告 / 光束）。
- **背景磚沒有翻轉屬性**（2C02 的 nametable 沒有 flip bit），所以天花板底面與地板頂面各畫一張；精靈的 flipV 只用在「貼天花板的砲台」。
- **名稱表列 0 永遠看不到**（顯示裁上下各 8 線），所以天花板的管線通道放在列 1。
- 調色盤（`CR.WORLD_PAL`，`CR.CHR_WORLD.applyPalettes(ppu, withFallback)`）：

| 組 | 色 | 用途 |
|---|---|---|
| bg1 | `$07 $17 $28` 深褐 / 橘褐 / 金 | 小行星、碎片 |
| bg2 | `$01 $11 $21` 深藍 / 藍 / 亮藍 | 要塞牆面 / 天花板 / 地板 / 管線 / 壁燈 |
| bg3 | `$06 $10 $30` 暗紅 / 灰 / 白 | 星空點、魔王區背板、魔王艦體、雷射 |
| spr2 | `$0F $1A $38` 黑 / 綠 / 淡黃 | 小蜂、之字機、敵彈、**魔王核心開啟**（＝可打的視覺訊號） |
| spr3 | `$0F $11 $30` 黑 / 藍 / 白 | 砲台（主體刻意用白）、硬殼、魔王外殼板 / 核心閉合、雷射砲口 |

底色 `$0F`；bg0 / spr0 / spr1 一律不碰（ship 的 `CR.PAL`）。**爆炸借 spr1（紅黃白）、紅膠囊 spr1、藍膠囊 spr0**（依 ship 在 `CR.PAL` 註明的分配）。同屏實測 9~11 色，遠低於 25。

### 三、地形（12 畫面 = 384 欄 × 26 列；列 26..29 是 HUD，欄串流永不觸碰）

RLE 段表 24 段（`[欄數, 天花板列數, 地板列數]`）+ 決定性 LCG 佈點（種子 `0x5A17`，30 顆小行星 + 26 塊碎片），**沒有明碼陣列**。

| 段 | 欄 | 內容 |
|---|---|---|
| ① 小行星帶 | 0..127 | 無天花板 / 地板；星空 2 種 + 30 顆可撞小行星（16×16）+ 碎片；欄 96 起地板 / 天花板漸生 |
| ② 要塞入口 | 128..287 | 天花板 / 地板 3..8 列起伏（窄道 5+8 / 8+5 / 6+6）、鉚釘板每 4 欄、地板直管每 8 欄、壁燈每 12 欄、貼地 / 貼天砲台 |
| ③ 核心室 | 288..383 | 等高通道（3/3）+ 暗紅背板 + 直立支柱；相機到 `CAM_MAX = 2816` 後捲動停止、魔王進場 |

屬性表以 16×16 為單位掃 2×2 磚決定組別（有岩石 → 1、有結構 → 2、其餘 → 3）。
`solidAt` 與名稱表磚種在測試裡做 32×26 全掃比對，0 不一致。

### 四、出怪表摘要（enemies.js `buildTable`，`NES.SH.Spawner` 格式）

**56 個事件**，欄位遞增；捲動 0.5 px/幀 ⇒ **1 欄 = 16 幀**、全關 ≈ 5632 幀 ≈ 94 秒。

| 段 | 欄 | 事件數 | 間隔 | 內容 |
|---|---|---:|---|---|
| ① | 20..122 | 13 | 6~10 欄（≈ 1.6~2.7 秒） | fan 編隊 ×5、zig 單 / 雙 / 三、tank |
| ② | 128..284 | 29 | 4~6 欄（≈ 1.1~1.6 秒） | 砲台（貼地 / 貼天交替，共 14 座）+ fan / zig 群 / tank 混編 |
| ③ | 290..343 | 14 | 3~5 欄（≈ 0.8~1.3 秒） | zig 三 / 四連、tank 連發、fan；最後接魔王 |

- 同屏（非魔王）敵人硬上限 **10**（`allocEnemy` 擋住），配合每線 8 精靈 + `NES.SH.OAM` 輪替。
- 砲台 `spawnTurretAt(col, ceiling)` 由 stage 依該欄的 `ceilAt/floorAt` 算 y，貼天花板版用 `flipV`。

四種敵人（碰撞框 / hp / 分數 / 行為）：

| kind | 框 | hp | 分 | 行為 |
|---|---|---:|---:|---|
| `fan` 蛇行小蜂 | 8×8 | 1 | 100 | 編隊 5 隻、−1.5 px/幀 + 正弦（振幅 20 px、約 85 幀一圈）；**第 3 隻是標記個體**，全滅 → 在它的死亡位置掉膠囊；有個體逃出畫面就不算全滅 |
| `turret` 地面砲台 | 12×12 | 2 | 200 | 釘在世界欄（`wx − camX`），每 90 幀 `NES.SH.aim` 射 1 彈；射擊前 20 幀砲管伸出（預告） |
| `zig` 之字機 | 12×12 | 1 | 150 | −1.25 px/幀，每 **32 幀**換垂直方向（±1.0 px/幀），撞到遊戲區上下緣反彈 |
| `tank` 直衝硬殼 | 12×12 | **3** | 400 | 生成時鎖定船的高度，−2.5 px/幀直衝；**不算小敵**（藍膠囊清屏殺不掉） |

敵彈：碰撞框 4×4 / 精靈 8×8 兩幀交替、**基礎速度 2.0 px/幀**；`CR.ship.rank() >= 2` → ×1.25（2.5）、`>= 3` → 砲台改**預判射擊**（用 stage 自己量的船位移外推 20 幀）。**rank 不影響出怪表**。

### 五、魔王「核心要塞」（boss.js）

48×48：**艦體 6×6 用背景磚**（核心室捲動停止 ⇒ 名稱表就是畫布），只有可打 / 會動的部位用精靈
（4 片板 ×4 顆 + 核心 4 顆 + 砲口 3 顆 = 最多 23 顆，**每條掃描線最多 4 顆**）。

| 階段 | 觸發 | 內容 | 形變圖 |
|---|---|---|---|
| 0 進場 | `camX ≥ 2816`（或 `spawnTest('boss')`） | 從 x=256 滑到 x=176，60 幀；落位那一幀寫 36 byte 艦體 | — |
| 1 外殼 | 進場結束 | 4 片板各 **hp 4**（半血換龜裂圖）；只有板子可被打中；每 100 幀 1 發瞄準彈 | ① 完整裝甲 |
| 2 核心 | 4 片打光 | 核心 **hp 8**；**合 90 幀（無敵）/ 開 60 幀（可打）**，開啟瞬間放環形 8 彈 | ② 外殼脫落 |
| 3 三連雷射 | 核心 hp ≤ **3** | 預告 30 幀 → 發射 60 幀 → 冷卻 60 幀（+ 每輪環形 8 彈）；3 條橫線用**背景磚**拼（各 22 磚 = 66 byte，狀態切換那一幀才寫） | ③ 結構崩壞 |
| 4 死亡 | 核心打爆 | 大爆炸 90 幀（每 6 幀一朵）→ `CR.stage.cleared = true` | 清除 |

**總血量 24**（4×4 + 8，依總控轉述的研究 §10 調整）。
雷射的碰撞用 3 顆「大子彈」放進 `CR.stage.bullets`（`w = 砲口到畫面左緣、h = 6、bg = true`），
所以 main 既有的「敵彈 × 船」判定直接生效，畫面則完全不吃精靈額度。
除錯：`CR.Boss.force(1|2|3)`、`CR.Boss.state()`、`?boss=1|2|3`。

### 六、測試與截圖

`games/cruiser/test_stage1.py`：**128 項，128 通過**（`../卡比之星/.venv/bin/python games/cruiser/test_stage1.py -v`）。
分七組：① 契約介面 / CHR 磚分配（W_ 精靈 ≥ 128、W_ 背景 ≥ 64、無 `$0D`）② 欄串流 / VBlank 預算
（600 幀 `overFrames === 0`、單欄 ≤ 45 byte、`row0=0 rows=26`、名稱表 + 屬性表與 `tileAt/attrAt` 取樣一致）
③ 出怪表（≥ 40 事件、遞增、三段密度漸強、`seek` 不補生）④ 四種敵人（編隊全滅掉膠囊 / 逃走不掉、
zig 32 幀換向、tank hp 3、砲台瞄準向量朝船兩個方向 + 彈速 2.0、貼天 / 貼地 y 值、膠囊 −0.5 px/幀無壽命、
每 16 顆藍膠囊）⑤ `clearScreen` / `solidAt`（32×26 全掃與磚種一致）/ `checkpoint` / `restart` / `spawnTest`
⑥ 魔王三階段 hp 與開合週期（90/60 實測）、雷射預告 → 發射 → 3 顆大判定彈 + 背景磚、環形 8 彈、死亡 → cleared
⑦ lint（400 幀色數 ≤ 25、0 壞像素、0 超支、每線精靈 ≤ 10、`flickerStep === 0`）。

截圖（`shots/agent_stage/`，全部 `--lint` PASS）：

| 檔 | 指令 | lint |
|---|---|---|
| `asteroid.png` | `--url cruiser.html --query "camx=150" --script "tap start 1; step 210"` | colors=11、maxSprLine=3 |
| `fortress.png` | `--query "camx=1320" --script "tap start 1; step 250"` | colors=10、maxSprLine=4 |
| `boss1.png` / `boss2.png` / `boss3.png` | `--query "boss=1\|2\|3" --script "tap start 1; step 120"` | colors=10/11/10、maxSprLine=6/6/5 |

`bash tools/run_all.sh --quick`：**全 PASS**（node --check 31 檔、8 支測試、build --check）。

### 七、契約異動 / 跨檔需求

**已照做（總控轉述的兩批指示）**

1. `NES.SH` 全面採用（`Pool / OAM / Scroller / Spawner / aim / vel / aabb / sin / cos / clamp`），**沒有保留任何 fallback**；角度 0=右 / 64=下 / 128=左 / 192=上。
2. `Scroller` 用 `{nt:2, cols:384, row0:0, rows:26, tileAt, attrAt}`，**不碰 `ppu.scroll` / `ppu.split`**（main 自己設）；`reset()` 只在 `init` / `restart`（＝換關 / 檢查點）呼叫，且同時做 `Pool.freeAll` + `Spawner.seek`。
3. `Spawner` 的 `fn(ctx, col, entry)` 簽章。
4. 捲動 **0.5 px/幀**、檢查點 **每 512 px**（第 1 關共 6 個：0 / 512 / 1024 / 1536 / 2048 / 2560，研究 §10-4 [源]；回應 ship 的第 5 條）、敵彈基礎 **2.0 px/幀**、膠囊 **−0.5 px/幀無壽命**、
   **每第 16 顆膠囊藍色（由 stage 計數 `capsuleSeq`，ship 不必再數）**、魔王總血量 **24** + **每階段換一張形變圖**、
   `rank` 讀 `CR.ship.rank()`（≥2 彈速 ×1.25、≥3 預判射擊，不影響出怪表）。

**契約澄清（已與 main.js 對齊，請總控寫進 ENGINE_API / TASKS）**

5. **`solidAt(x, y)` 是畫面座標**（不是世界座標）。main.js 目前就是丟船的畫面矩形四角進來，兩邊一致；世界座標版是 `solidAtWorld(wx, y)`。
6. **`CR.stage.boss` 不存在**：魔王的 4 片外殼板與核心是 `CR.stage.enemies` 池裡的一般成員（`kind` 為 `bplate` / `bcore`、`boss === true`），所以 main 既有的「自機彈 × 敵」「敵 × 船」迴圈**自動涵蓋魔王**，`main.js` 裡 `s2.boss` 那幾行是空轉（不影響正確性，可刪）。
7. **記分**：stage 在 `kill()` 內累加 `pendingScore`，main 用 `takeScore()` 取走 —— 與 ship 的第 3 條約定一致，雙方都不要重複加。
8. **`restart()` 內部已自帶 `budget.mute`**，main 外層再 mute 一次無害。
8b. `CR.PLAY_ROWS`（ship 定的 26）在 `CR.stage.init()` 會與 stage 的遊戲區列數比對，不一致直接 throw（避免地形悄悄蓋掉 HUD）。
9. `CR.SPR_SHIP` 的 `S_CAP_R0/R1/S_CAP_B` 目前沒被用到（stage 用自己的 `W_CAP0/1` + ship 的 spr1/spr0 調色盤畫紅 / 藍膠囊）。想省 3 磚的話整合時刪 ship 那邊即可 —— 回應 ship 的第 9 條。
10. 爆炸磚：stage 會**優先用 ship 的 `S_EXPL0..3`**（`pick(['S_EXPL0','W_EXPL0'])`），ship 缺席才退回自帶的 `W_EXPL0..3`。目前 ship 的 bank 沒有 `S_EXPL*`（用的是 `CR.Fx`），所以實際畫的是 `W_EXPL*`，調色盤用 ship 的 spr1。

**尚未做 / 已知問題**

11. 小行星只有「可撞」沒有「可打碎」（研究裡 FC 版的隕石是可破壞的）。要做需要把 16×16 的岩石搬進敵人池（多 30 個 Pool 槽）或做「名稱表即時改磚」，兩者都會吃 VBlank 預算，先不做。
12. 魔王三連雷射同時發射時，畫面上與船 / 自機彈同線會超過 8 精靈；雷射本身走背景磚不受影響，但砲口 3 顆 + 核心 4 顆在同一段掃描線帶，`NES.SH.OAM` 的輪替會讓砲口偶爾閃一幀（真機行為，靜態截圖看得到）。
13. 出怪表沒有做「rank 影響編隊密度」（契約明文禁止），也沒有做二週目強化。
14. `?camx=` / `?boss=` 的除錯跳關是在第 2 次 `update` 才套用；如果 main 之後改成「title 畫面也呼叫 `stage.update`」，跳關會提早到標題畫面發生（畫面仍正確，只是標題文字會被地形蓋掉）。

---

## star-world（R2b）

2026-09-19｜《星塵勇者》W1 世界層完成：`games/star/chr_world.js`、`levels_w1.js`、`enemies.js`、`boss.js`、`test_w1.py`。
**164 項測試全過**，`bash tools/run_all.sh --quick` 全綠，5 張 harness 截圖 + 4 張 `star.html` 實機截圖 lint PASS（色數 8~11 / 25）。

### 關卡表（W1 四關，全部原創；列 0–3 是 HUD、列 4–29 是遊戲區、groundRow = 24）

| 關 | 主題 / 曲 | 欄數（畫面） | 敵人（roller / bouncer / flyer） | 金幣 | 檢查點 | GOAL | 起點安全區 | 新壓力 |
|---|---|---|---|---|---|---|---|---|
| 1-1 | ground 草原 | 384（12） | **7**（5 / 1 / 1） | 38 | 134、256 | 旗桿 col 350 | **96 欄 = 3 畫面** | 走跳、? 磚、管子、第一個坑 |
| 1-2 | cave 洞窟 | 320（10） | **10**（7 / 2 / 1） | 36 | 96、205 | 旗桿 col 312 | 32 欄 | 尖刺、上下兩層單向木板、狹窄天花板、隱藏金幣房（288–302） |
| 1-3 | sky 天空 | 384（12） | **13**（0 / 4 / 9） | 63 | 194、298 | 旗桿 col 356 | 32 欄 | 沒有地面（掉下去就死）、20 座浮台、間距 4–6 欄（≤ 4 格）、飛行敵 |
| 1-4 | castle 城堡 | 256（8） | **14**（9 / 3 / 2）**+ 魔王** | 32 | 92、190 | 魔王房 col 248 | 32 欄 | 熔岩坑（6 處）、無底坑、密集敵人、橋 + 斧頭機關 |

難度曲線（研究 04 §5.1 鋸齒上升）：敵人數 7 → 10 → 13 → 14 嚴格遞增，1-4 再疊魔王。
1-1 逐條對應研究 03/01 ⑦「四步教學」：①0–95 空地 + 金幣拱形引導到 **第一個 ? 磚（col 20）**
②**安全跳**（col 110–115 的淺溝，掉下去不會死、有金幣獎勵）③col 124 才是第一個真坑
④管子高度 2 → 3 → 4 格遞增（col 64 / 172 / 232）。

### API（給 star-hero / star-audio / qa）

| 成員 | 說明 |
|---|---|
| `ST.TILE` / `ST.TILE_COUNT` / `ST.TILE_KIND` | 38 個**磚語意碼**（不是 CHR 索引）；契約要求的 13 個名字全在 |
| `ST.solidKind(t)` | `'solid' \| 'oneway' \| 'hurt' \| 'none' \| 'slopeL' \| 'slopeR'`，**O(1) 陣列查表**，越界回 `'none'` 不 throw |
| `ST.isSolid / isBlocking / isHurt` | 便利包裝 |
| `ST.LEVELS['1-1'..'1-4']`、`ST.LEVEL_IDS`、`ST.Levels.{get,next,rebind,ids}` | 四關 |
| `level.tileAt(c,r)` | **語意碼**（O(1)，Uint8Array 直接索引） |
| `level.chrAt(c,r)` | **PPU 磚索引**（餵 `NES.SH.Scroller` 的 `tileAt`；熔岩會依 `ST.World.anim` 切 2 幀） |
| `level.attrAt(c16,r16)` | 0..3，依主題配色預先算好 |
| `level.kindAt(x,y)` / `solidAt(x,y)` / `tileAtPx(x,y)` | 世界像素座標；左右邊界回 `'solid'`、底部回 `'none'`（讓主角掉出畫面） |
| `level.setTile(c,r,k)` / `dirtyCols` / `onTileChange` / `clearDirty()` | 執行期改地形（? 磚頂出、橋斷），會順手重算該 16×16 區塊的屬性 |
| `level.surfaceRow(c[,from])` / `surfaceY` / `checkpointFor(col)` / `respawn(col)` | 找地面 / 檢查點復活點（`from` 預設列 14，避開洞窟 / 城堡的天花板） |
| `level.{id,cols,rows,theme,music,groundRow,safeCols,start,goal,checkpoints,spawns,boss,axe,coins,enemies}` | 契約欄位 |
| `ST.BG_WORLD`（45 磚）/ `ST.SPR_WORLD`（116 磚槽） | 背景 `BG_` 前綴、精靈 `W_` 前綴（8×16 配對）；都在契約上限內（192 / 128） |
| `ST.World.bind(bgBank, sprBank)` | **main 合併 bank 之後必須呼叫**；之後 `bgIndex(name)` / `oam16(name)` / `level.chrAt` 才有值（main.js 已經呼叫） |
| `ST.World.applyPalettes(ppu, theme)` | 只設 backdrop + bg/spr 的第 1~3 組（第 0 組留給 star-hero 的 HUD / 主角） |
| `ST.PAL_WORLD[theme]` | 四主題調色盤（見下） |
| `ST.World.setAnim(n)` / `.anim` | 熔岩 2 幀動畫的幀號（main 每 16 幀推一次） |
| `ST.Scroll.create(ppu, level[, opts])` | `NES.SH.Scroller` 的薄包裝，已填好 `{nt:2, cols, row0:4, rows:26, tileAt:level.chrAt, attrAt:level.attrAt}`（一欄 26 + 屬性 13 = **39 byte**）；`NES.SH` 缺席時自動退回等價實作 |
| `ST.Enemies.{init,reset,seek,update,draw,spawn,spawnTest,stomp,kill,hit,starKill,overlap,each,state,count,pending,CONST}` | 見下 |
| `ST.Boss.{init,reset,spawn,update,draw,stomp,hit,hitAxe,breakBridge,die,box,state,dead,hp,phase,axe,hammers,CONST}` | 見下 |
| `ST.rle(str, cols)` | 地圖用的 RLE 展開器（`<次數><字元>`） |

**敵人**（`ST.Enemies`，物件池 12 隻、零 GC；出「畫面右緣 +16 px」啟動、落後相機 48 px 或掉出畫面回收）

| kind | 行為 | 可踩 | 常數 |
|---|---|---|---|
| `roller` 岩球 | 0.5 px/幀走、撞牆轉向、`edge:true` 時坑邊不掉 | ✔ 壓扁 30 幀後消失 | `SMB.enemySlow` |
| `bouncer` 彈跳球 | 原地每 **60 幀**彈一次，`vy = −4`；上升用 SMB `gHold`、下降用 `gFall` ⇒ 跳 **64 px（4 格）**、滯空 49 幀 | ✔ 踩了**停 60 幀**再彈（不會死） | `BOUNCE_PERIOD 60 / STUN_FRAMES 60` |
| `flyer` 飛行體 | x 向左 0.75 px/幀、y 正弦 **±24 px**（週期 128 幀） | ✘ 踩到 = 受傷 | `SMB.enemyFast / FLY_AMP 24` |

被無敵星塵撞到 → `kill()` 死亡飛出（`vy −3`）→ 掉出畫面回收。`draw(oam)` 用 prio 3（壓扁 / 死亡 prio 4）。

**魔王「鐵鎚王」**（`ST.Boss`，1-4 橋上，32×32 = 8 顆 8×16 精靈、碰撞框 28×30）

- 循環（研究 04 §3.1）：`walk`（走近 ≤ 90 幀）→ `jump`（`vy −5`）→ `throw`（**3 顆錘子、間隔 20 幀**、拋物線 `vy −4 / g 0.25`）→ `rest`（**40 幀＝弱點窗口**）→ 回到 `walk`。
- **踩頭 3 次**：每次擊退 16 px + **無敵 60 幀**（無敵中再踩無效、每 4 幀閃一次），第 3 次 → 墜落 → `ST.Boss.dead = true`。
- **或**主角碰到橋尾斧頭（col 242）→ `breakBridge()` 把整排 `BRIDGE` 換成 `EMPTY` → 魔王掉進熔岩 → `dead = true`。
- 兩條路都測過；`setTile` 可逆（測試會把橋復原）。

**調色盤**（backdrop + bg1..3 / spr1..3；bg0 / spr0 留給 star-hero）

| 主題 | backdrop | bg1 | bg2 | bg3 | spr1 道具 | spr2 敵 A | spr3 敵 B / 魔王 |
|---|---|---|---|---|---|---|---|
| ground | `$22` | `07 17 2A` 泥土 / 草 | `0F 17 28` 磚 / ? | `0F 1A 30` 雲 / 灌木 / 管 | `0F 27 30` | `0F 07 17` | `0F 11 21` |
| cave | `$0F` | `00 10 30` 岩 / 尖刺 | `07 17 27` 木板 / 磚 | `01 11 21` 鐘乳石 | `0F 27 30` | `0F 00 10` | `0F 14 24` |
| sky | `$21` | `00 10 30` 雲台 | `0F 17 28` 磚 / ? | `11 38 30` 星 | `0F 27 30` | `0F 16 26` | `0F 11 31` |
| castle | `$0F` | `00 10 30` 石磚 | `06 16 27` 熔岩 | `0F 17 37` 橋 / 鏈 / 斧 / 金幣 | `0F 27 30` | `0F 06 16` | `0F 17 28` |

### 測試（`games/star/test_w1.py`，**164 項**）

`about:blank` + `add_script_tag`（engine 7 檔 + 自己 4 檔），HUD 字型 / 主角精靈用 64 + 128 個空白磚假造，**完全不依賴 star-hero 的 main.js**。
① CHR 合併與契約區間（8）② 磚語意 / solidKind（8）③ 四關地圖合法性（36：`tileAt` 全域合法、`chrAt` 落在 bank 內且 ≥ 64、`attrAt` 0..3、金幣 ≥ 30、檢查點 ≥ 1、畫面數 / 主題）
④ **可達性 BFS**（29：起點 → GOAL 有路、每個檢查點可達、坑寬 ≤ 9 欄、牆高 ≤ 8 列、起點安全區、地面敵人站在可達地形上）
⑤ 敵人行為（25）⑥ 魔王（20）⑦ 捲動 / VBlank 預算（12：每關 400 幀 `budget.over === 0`、單幀 ≤ 45 byte、名稱表與 `chrAt` 一致）
⑧ 跨模組整合介面（14）⑨ lint（12：四主題各 ≤ 25 色、無非 64 色像素）。

截圖：`games/star/test_w1.py --shots shots/star_world`（四關各一張 + 魔王房）＋
`tools/shot.py --url star.html --query "level=1-2"` 的實機圖，全部 `nes_lint.py` PASS。

### 契約異動（總控整合用）

1. **`level.tileAt(col,row)` 回的是「磚語意碼」，不是 PPU 磚索引**（契約的 `ST.solidKind(tileAt(...))` 只有這樣才成立）。
   餵 `NES.SH.Scroller` 的是新增的 **`level.chrAt(col,row)`**；`ST.Scroll.create(ppu, level)` 已經包好，直接用就對了。
2. **`ST.TILE` 從契約的 13 個擴到 38 個**（契約的名字一個不少）：多的是 `DIRT / BLOCK / PLAT_L / PLAT_R /
   PIPE_TL,TR,BL,BR / GOAL_TOP / FLAG / AXE / BRIDGE / CHAIN / CLOUD_L,R / BUSH / HILL_L,M,R / TREE_T,B /
   STAR_S,B / STAL / CAVEBG / WINDOW`。多出來的 `solidKind` 都是 `'none'` 或 `'solid'`，舊寫法不會壞。
3. `goal` 是 **`{col, row}`**（契約只寫 `{col}`）；另外多了 `safeCols / groundRow / boss / axe / coins / enemies`。
4. **「起點安全區（前 3 畫面無敵）」的落地解釋**：`level.safeCols` = **1-1 用 96 欄（3 畫面，教學關，研究 04 §1.2）**，
   1-2 / 1-3 / 1-4 用 32 欄（1 畫面）。測試驗的是「`safeCols` 內無坑 / 無害磚 / 無敵人生成」。
   1-2 起就照難度曲線儘早給壓力，不然 10 / 8 畫面的關卡只剩一半能放內容。
5. **坑寬上限訂 9 欄（72 px）不是 10 欄**：跨 w 欄的坑，起跳格與落地格的距離是 `w + 1`，
   要落在「跑跳 5 格 = 80 px = 10 欄」之內 ⇒ `w ≤ 9`。1-1 最寬的坑就是 9 欄。
6. **bouncer 的「SMB 重力」**：上升用 `SMB.jump[0].gHold`、下降用 `gFall`（＝主角長按 A 的同一條弧線）
   ⇒ `vy −4` 剛好跳 4 格 64 px、滯空 49 幀 < 週期 60 幀。全程用 `gFall` 只會跳 17 px，太矮。
7. `ST.Enemies.update(g)` **預設不碰主角**；只有 `g` 帶了 `onStomp / onHurt / onStar` callback 才會自動判定
   （main.js 自己有 `stepEnemyCollisions()`，所以不會雙重處理）。
8. `NES.SH.Scroller` 的 HUD 設定：星塵勇者的 HUD 在**上方**，所以是 **`{row0: 4, rows: 26}`**
   （ENGINE_API §15.5 的範例是巡航艦的下方 HUD `{row0: 0, rows: 26}`）。

### 跨檔需求 / 給其他 agent 的約定

**給 star-hero**（下列 1~3 已經在本輪順著 `main.js` 現有寫法補在我這邊，不用改 main.js）：

1. `main.js` 的 `eachEnemy` 呼叫的是 **`E.each(g, visit)`**，我原本只收 `each(fn)` ⇒ 已改成兩種都吃。
2. `main.js` 的通用碰撞是 `if (e.stomp) e.stomp(g); else if (e.hit) e.hit(1, g); else e.alive = false;`
   ⇒ 每隻敵人都補上 **instance `stomp()` / `hit()`**（契約本來就寫 `hit()`）。沒有它們的話
   岩球會瞬間消失（不是壓扁 30 幀）、彈跳球會被打死（應該只暈 60 幀）。
3. **`main.js` 目前沒有魔王的碰撞**（`stepEnemyCollisions` 只走 `ST.Enemies`）⇒ `ST.Enemies.each` 現在會
   **一併列舉魔王與錘子**（魔王 `stompable=true` + `stomp()`、錘子 `stompable=false`），這樣主角就踩得到魔王、
   也會被錘子打到。若 star-hero 之後改成自己處理魔王，設 **`ST.Enemies.includeBoss = false`** 關掉即可。
   另外 `ST.Boss.box()` 已按 main 的 `ST.Boss.box(g)` 期待提供（回 `{x,y,w,h}` 或 `null`）。
4. `ST.Boss.dead === true` = 過關（斧頭與踩頭 3 次兩條路都會設）。`ST.Boss.axe.taken` 可以用來播斧頭音效。
5. 熔岩動畫：`ST.World.setAnim(n)` 只是切 `chrAt` 回傳的磚，**要看到動畫得重寫該欄名稱表**（main 目前每 16 幀
   推一次 anim，但只有新露出的欄會換幀；要全屏動畫得每幀補寫 1~2 欄，仍在 160 byte 預算內）。
6. 檢查點復活時請呼叫 **`ST.Enemies.seek(camX)`**（前方敵人重新排隊）與 `ST.Boss.reset()`。

**給 star-audio**：關卡的 `music` 欄位 = `'ground' | 'cave' | 'sky' | 'castle'`，1-4 進魔王房時建議切 `'boss'`
（可用 `ST.Boss.active` 判斷）。

**給 qa2**：`games/star/test_w1.py --shots <dir>` 會產四關 + 魔王房截圖；
`ST.Enemies.state()` / `ST.Boss.state()` 是現成的快照（不需要 `?debug=1`）。

### 已知問題 / 尚未做

1. **斜坡沒有真的用上**：`ST.TILE.SLOPE_L/R` 與 `solidKind` 的 `'slopeL'/'slopeR'` 已經備好、磚也畫了，
   但四關都沒放斜坡（契約寫「可選」，而且 star-hero 的 `hero.js` 目前沒有斜坡物理）。
2. **旋轉火棒（1-4 可選）沒做**：熔岩 + 密集敵人已經夠，火棒要再一組精靈 + 旋轉狀態。
3. **魔王實際畫出來約 24×30 px**（精靈格是 32×32），肩寬沒有吃滿；要更有壓迫感得重畫上半身。
4. **1-2 的隱藏金幣房**（288–302，5 枚）只是「不在主線上」，沒有做「撞牆才出現」的祕密牆。
5. **熔岩 2 幀動畫要 main 配合重寫名稱表**（見上方跨檔需求 5），目前實機看到的是靜態熔岩。
6. **1-3 的 20 座浮台間距刻意保守（4–6 欄）**：BFS 模型允許到 10 欄，之後想加難度還有空間。
7. `flyer` 沒有做「被踩到時把主角往上彈一點點」的緩衝，直接算受傷（研究 04 §2.1 的刺龜原型就是這樣）。

---

## nes-touch（R2）

**2026-09-19｜完成：三個入口頁（`game.html` 測試室 / `star.html` 星塵勇者 / `cruiser.html` 星塵巡航艦）手機可玩**
— 新增 `engine/touch.js`（NES.Touch 觸控虛擬手把）、三頁 head/CSS/啟動段改手機版面、`tools/mobile_shot.py`、
`tools/test_touch.py`（180 項全綠）、`tools/build.py` 載入順序 +`touch.js`、`docs/ENGINE_API.md` §16。
`bash tools/run_all.sh`（完整，非 --quick）總結 PASS。

### 做了什麼

| 檔案 | 內容 |
|---|---|
| `engine/touch.js`（新） | 純 DOM 覆蓋層：搖桿（8 方向 + ±6° 磁滯 + 死區 + 浮動底座）、A / B（右下大顆 + 左邊）、SELECT / START 小長條、全螢幕；自動顯示 / 鍵盤淡出 / 再觸控出現；設定存 `localStorage.nes_touch`。API 見 ENGINE_API §16 |
| `game.html` / `star.html` / `cruiser.html` | 只動 `<head>`（viewport `viewport-fit=cover, user-scalable=no`、`100dvh`、`touch-action:none`、`user-select:none`、safe-area）與底部啟動 `<script>` 的 `fit()` / `place()`；**games 腳本清單一行未動**；engine 區塊加 `<script src="engine/touch.js">`（在 `nes.js` 之前） |
| `tools/build.py` | `ENGINE_ORDER` 插入 `touch.js`（`shmup.js` 之後、`nes.js` 之前）；`--check` 三個 `--src` 都 PASS |
| `tools/mobile_shot.py`（新） | 從 `../卡比之星/tools/mobile_shot.py` 改：`--page` 選入口頁、`__nes.step` 取代 `__kb.step`、CDP 多點觸控、`--rects` 印 `NES.Touch.rects()` + `NES_LAYOUT`、`--hint` 才保留 debug 提示列。**與任務書的一點差異**：網址用 `?debug=1&mute=1`（**不加 `scale=1`**），因為 `scale=N` 會強制整數倍、關掉手機小數倍版面 ⇒ 就看不到要驗的東西；要舊行為請自己加 `--scale 1` |
| `tools/test_touch.py`（新） | 三頁 × iPhone 13 橫 / Pixel 5 直 × 18 項 + 桌機 1280×800 × 6 項 = **180 項** |

### 版面規則（`window.NES_LAYOUT` + `nes-resize` 事件，詳表見 ENGINE_API §16.5）

- 桌機（非觸控且短邊 ≥ 600）：`floor(min(vw/256, vh/224))` **整數倍置中**，行為與 R1 完全相同。
- 手機直向：寬填滿（小數倍）、畫面貼上方（`y = safe.top`），下方整片空白帶放按鍵。
- 手機橫向：高填滿，兩側各留 **≥ 110px**（短邊 ≥ 500 的平板 **170px**）給按鍵。
- `nes.setScale()` 只改 backing store 且只收整數（QA R1 P2-1）⇒ 小數倍時 **backing = `ceil(scale)`（1~4 整數，實測手機都是 2）**，
  CSS 縮到目標尺寸 + `image-rendering: pixelated`。
- `?scale=N`（`tools/shot.py` 用）→ 強制整數倍、`mobile=false`，截圖完全可重現（R1 的所有測試 / lint 不受影響）。
- 旋轉 / `visualViewport` resize 會**二次觸發**（iOS 工具列收合延遲）；`visibilitychange` 隱藏時 `NES.Touch.releaseAll()` + `NES.Input.inject(0,0)`。

### 取捨：輸入怎麼接（**沒有改 input.js**）

`engine/input.js` 沒有可以 OR 進去的第三來源（查過：只有 `replay > inject > 鍵盤|Gamepad` 三段，沒有 `setExternal`）。
所以 touch.js 走 **inject**：

1. 觸控遮罩變動且不為 0 → `NES.Input.clearInject()` + `NES.Input.inject(mask, 1e9)`（＝按住到放開）。
2. 觸控全部放開 → `NES.Input.inject(0, 0)`（清空佇列）⇒ **鍵盤 / 手把立刻恢復**。
3. 每 6 幀看門狗：`injectPending() < 4096` 就補注入一次（佇列被別人清掉時不會斷手）。

**代價（兩條，測試有覆蓋）**
- 觸控按著的期間鍵盤 / 手把被蓋掉（不會 OR）。手機不會同時用兩種輸入；桌機覆蓋層預設不顯示 ⇒ 實務上不衝突。
- 觸控按著的期間，腳本注入（`__nes.press/tap`、`shot.py`）會被 `clearInject()` 清掉。工具不會同時做這兩件事。

### 截圖（`shots/agent_nes_touch/`，已用 Read 逐張看過）

| 檔案 | 內容 |
|---|---|
| `game_landscape.png` / `game_portrait.png` | 星塵測試室，iPhone 13 橫（750×342）/ Pixel 5 直（393×727），已按 START 進遊戲 + 推右 + 按 A |
| `star_landscape.png` / `star_portrait.png` | 星塵勇者 1-1，同上（主角跳起來、搖桿旋鈕推到右、A 發亮） |
| `cruiser_landscape.png` / `cruiser_portrait.png` | 星塵巡航艦 STAGE 1，同上 |

六張都：按鍵完全不壓到畫面、不出界、畫面照 PPU 原樣（只有 CSS 小數倍縮放）。

### 測試（`$PY tools/test_touch.py`，180 / 180）

每組（頁 × 裝置）18 項：覆蓋層自動顯示、六顆按鍵齊全、**矩形不與畫面交集**、不出界、`overlapping=false`、
backing 整數、`canvas.width = 256×back`、`nes.scale = back`、CSS 尺寸 = `256×scale`（±0.5）、CSS 與 `NES_LAYOUT` 一致、
顯示倍率是小數、`mobile=true`、直向寬填滿 + 貼上方 / 橫向高填滿 + 兩側 ≥110（平板 170）、
**觸控 START 進遊戲**、**搖桿推右 30 幀 `held(RIGHT)` 且 `__nes.state().x` 增加**（cruiser 40→70、star / demo 同樣遞增）、
扇區 0 + `dirs.right`、放開歸零、**`pressed(A)`**、持續 `held(A)`、**右 + A 同時**、`Touch.mask()` 與 `Input.mask()` 一致、
全放開 mask 0、**鍵盤後淡出**、再觸控出現、無 JS 例外。
桌機 1280×800 三頁各 6 項：不顯示觸控層、**scale 整數 3**、backing 768×672、CSS 768×672 置中、`mobile=false`、無例外。

### 跨檔需求（總控 / 其他 agent）

1. **`tools/run_all.sh`（不是我的檔）**：③ 目前只跑 `build.py --check`（＝只驗 `game.html`）。
   建議改成三行：`--src game.html` / `--src star.html` / `--src cruiser.html`。
   我已手動驗過三個都 PASS，但想進 CI 得動 run_all.sh。
2. **core agent（`engine/input.js`）**：若要讓「觸控 **OR** 鍵盤 / 手把」而不是覆蓋，
   請加一個第三來源，例如 `NES.Input.setExternal(mask)`（在 `poll()` 裡 `m = live | padMask() | external`，
   優先權排在 inject 之下）。加好之後 touch.js 只要把 `applyInput()` 換成 `setExternal(touchMask)` 一行，
   上面兩條代價就都消失。
3. **games agents**：不需要任何改動 —— 觸控只經 `NES.Input`，遊戲讀到的是一樣的八鍵。
   若遊戲想自己畫「手機提示」，可讀 `window.NES_LAYOUT.mobile` 與 `NES.Touch.active()`。
4. **ui / 設定頁（若之後有）**：`NES.Touch.setLayout({side, size, opacity, stick, stickFloat, mode})` 即時套用並存檔，
   `NES.Touch.rects()` 可拿來畫預覽。

### 已知問題 / 尚未做

1. **`?debug=1` 的提示列 `#hint`** 會壓在畫面最下面（蓋到 HUD）。正式遊玩（無 `?debug=1`）不顯示；
   `mobile_shot.py` 預設會先把它隱藏再截圖（`--hint` 可保留）。
2. **backing store 只到 4 倍**：iPhone 13 DPR=3、顯示倍率 1.53 ⇒ backing 2（512×448）再由 CSS 拉到 391 CSS px
   = 1173 device px，屬於非整數的最近鄰放大，像素大小會有 ±1 device px 的不均。要完全均勻得讓 backing 跟著 DPR 走
   （例如 `ceil(scale × dpr)`），代價是 PPU 每幀要多畫 4 倍面積 —— 先選了效能。
3. **沒有做「按鍵編輯 / 拖曳自訂位置」**：只有 `side` / `size` / `opacity` / `stick` / `stickFloat` 五個旋鈕。
4. **iOS Safari 沒有 Fullscreen API** ⇒ 全螢幕鍵會整顆隱藏（`NES.Touch.fullscreenSupported === false`），
   要全螢幕請用「加入主畫面」。目前三個入口頁都還沒有 PWA manifest / service worker。
5. **平板橫向留白 170px** 是照總控給的數字寫死的；真的 iPad（1080×810）實測倍率 2.89、兩側各 170，剛好。
   更窄的機種（例如 16:10 小平板）會退回「整個塞滿 + 按鍵半透明壓邊」，此時 `NES.Touch.overlapping === true`。

---

## star-hero（R2b）

2026-09-19｜《星塵勇者》W1 主角層完成：`games/star/chr_hero.js`、`hero.js`、`main.js`、`test_star.py`、`tools/playthrough_star.py`。
**132 項測試全過**；`tools/playthrough_star.py --all`（預設 seed=1）**四關全部 cleared**；
`bash tools/run_all.sh --quick` 只剩 `cruiser/test_cruiser.py` 一項 FAIL（R2 ship agent 的檔，與本層無關）；
8 張截圖 `nes_lint.py` 全 PASS（色數 9~11 / 25、非法像素 0）。

### API

| 成員 | 說明 |
|---|---|
| `ST.SPR_HERO`（29 對 = **58 磚**，`H_` 前綴）| 主角 16×24 原創美術，全部 `NES.CHR.tile16` 配對（8×16 精靈模式）。上半身 4 種（`H_BODY` 站 / 走 / 跑 / 轉身、`H_BJUMP` 跳 / 落、`H_BHURT` 受傷、`H_BDEAD` 死亡）× 左右；腳 8 種（`H_L0/L1/L2` 走 3 幀、`H_LJ` 收腿、`H_LF` 張腿、`H_LT` 煞車、`H_LH`、`H_LD`）× 左右；`H_CR` 蹲 16×16、`H_SL` 滑 16×16、`H_COIN` 金幣粒子 |
| `ST.BG_HUD`（別名 `ST.BG_HERO`，**58 磚**）| HUD 字型：`SP`（**磚 0 = 空白**）+ 10 數字 + 26 字母 + 20 符號（複製 `NES.CHR.DEMO.FONT`，契約明文允許）+ 3 個自製圖示 `HCOIN` / `HCLOCK` / `HHEAD` |
| `ST.BG_FALLBACK`（11 磚，`F_` 前綴）| 後備地形磚，**永遠**合併進 `st_bg`；只在「關卡沒給磚名」與內建測試關時才會被畫到 |
| `ST.charName(ch)` / `ST.textTiles(bank, str)` / `ST.oam16(bank, name)` | 文字 → 磚名 / 磚索引；8×16 的 OAM tile 值（`index \| 1`） |
| `ST.Hero`（hero.js）| `create()` / `reset(h,x,y,facing)` / `update(h,ctx)` / `draw(h,g,oam,tiles,camX)` / `stomp(h)` / `hurt(h,ctx,fromX)` / `kill(h,ctx)` / `addCoin(h,ctx,n)` / `setCrouch` / `boxH` / `tileNames()`；常數 `W=12 H=22 CROUCH_H=14 INV_FRAMES=120 HURT_FRAMES=12 DEATH_FRAMES=60 BOUNCE=-768 DROP_FRAMES=10 COIN_1UP=100` |
| `ST.hero`（= `g.hero`）| 契約欄位 `x, y, w, h, vx, vy, state('idle\|walk\|run\|jump\|fall\|crouch\|slide\|hurt\|dead'), facing, onGround, inv, coins, lives, score, power` 每幀同步 |
| `window.GAME`（main.js）| `init / update / draw / state`；`state()` 回契約的 `{mode, level, x, y, vx, vy, state, onGround, camX, lives, coins, score, time, enemies}` **加上** 30 個測試 / 機器人用欄位（`xSub/ySub/apexPx/screenX/inv/crouch/facing/checkpoint/cleared/scrNext/scrLeft/stomps/hits/bumps/deaths/oneUps/…`） |
| `GAME.dev`（只給測試 / 機器人）| `warp(x[,y])`、`level(id)`、`setTime/setCoins/setLives/setScore`、`kill()`、`hurt(fromX)`、`tileAt/kindAt/groundYAt`、`ntTileAt(col,row)`（讀名稱表）、`bgIndexAt`、`enemyList()`、`boss()`、`layout()`、`scroller()` |
| 網址參數 | `star.html?level=1-2`（或 `?level=test`）**直接開該關並跳過標題**；沒帶就停在標題等 START |

**每幀順序**（與 `games/demo/main.js` 相同，手感才會一致）：讀輸入 → 水平加速 / 摩擦（B 跑、轉身 ×2）
→ 起跳 `SMB.jumpStart` → 重力 `SMB.jumpGravity`（首幀半格）→ 移動 X + 磚碰撞 → 移動 Y + 磚碰撞
→ 危險 / 互動磚掃描 → 狀態機 → 動畫 →（main）敵人 → 檢查點 → 鏡頭 → 欄串流 → 計時 → HUD → `ST.Audio.tick`。

### 手感實測表（`?level=test` 內建測試關，132 項測試每項都對照下表）

| 項目 | 期望（來源） | 實測 | 差 |
|---|---:|---:|---:|
| 靜止 → 走路上限（384 vel = 1.5 px/幀） | 41 幀（`ceil(384 ÷ 152/16)`；研究 03/01 ②「約 40 幀」） | **41** | 0 |
| 靜止 → 跑步上限（640 vel = 2.5 px/幀） | 45 幀（`ceil(640 ÷ 228/16)`；研究 03/01 ②「約 45 幀」） | **45** | 0 |
| 長按靜止跳（高度） | 64.00 px = 4 格（`NES.FX.SMB.jumpSim({hold:40})`，R1 fix1 定案） | **64.00** | 0 |
| 長按全速跑跳（高度） | 80.00 px = 5 格（`jumpSim({hold:40, vx:maxRun})`） | **80.00** | 0 |
| 點按 1 幀（高度） | 19.6875 px（`jumpSim({hold:1})`） | **19.6875** | 0 |
| 全速跑跳水平距離 | 152.5 px（2.5 px/幀 × 61 滯空幀） | **152**（滯空 61 幀） | −0.5 px |
| 轉身煞車（B + 反向，加速度 ×2） | 23 幀（`ceil(640 ÷ 228×2/16)`；研究 03/01 「轉向加速度 ×2」） | **23** | 0 |
| 放開方向鍵靠摩擦停下 | 50 幀（`ceil(640 ÷ 208/16)`，FrictionData `$d0`） | **50** | 0 |
| 受傷無敵 | 120 幀（**R2b 契約指定**；SMB 原版是 `8×21 = 168`） | **120** | 0 |
| 蹲下碰撞框 | 12×14（契約），腳不動 ⇒ y 下移 8 | **12×14 / +8** | 0 |
| 踩敵回彈 | −3 px/幀 = −768 vel（契約） | **−768** | 0 |
| 空中控制門檻 | 走速起跳後按 B 不得超過 `maxWalk`（SMB：\|vx\| ≥ `$19` 才用跑步參數） | **384（= maxWalk）** | 0 |

> 跳躍三個數字與 `NES.FX.SMB.jumpSim()` **逐位元相等**（測試裡直接比對），所以本層與 `tools/test_core.py`、
> `games/demo/test_demo.py` 量到的是同一組數字 —— R1 fix1「只有一套跳躍規則」的承諾在 R2b 仍然成立。

### 測試（`games/star/test_star.py`，**132 項**，Playwright 開 `star.html?debug=1&scale=1&mute=1&level=<關>`）

① 手感 ±1 幀（18，含與 `jumpSim` 逐位元比對）② 狀態機 9 個狀態 + 轉移（21）③ 單向平台：下跳穿過 / 上落接住 / 蹲+A 穿下（6）
④ 尖刺受傷 / 熔岩死亡 / 掉坑 / 時間歸零 / 死亡回檢查點 / 命盡 GAME OVER（15）⑤ 金幣 / ? 磚 → USED + 金幣 + 粒子 / BRICK 頂撞 / 100 金幣 1UP（13）
⑥ 鏡頭雙向鎖 + **名稱表左右補欄逐格比對 `chrAt`**（9）⑦ HUD 五個欄位 + 「只寫有變的格 ≤ 4 byte」+ 屬性組 0（10）
⑧ VBlank 預算（600 幀 `over === 0`、單幀尖峰、OAM 獨立通道）+ 150 幀 lint ≤ 25 色（7）
⑧b PPU 設定（8×16 / 垂直鏡像 / `flickerStep=0` / split(32) / 主角占 OAM 前 4 槽 / `Lint.oam`）（6）
⑨ 模式 title→play / GOAL→clear（時間換分）/ `?level=` 直開（含真關 1-1 煙霧測試）（12）⑩ 空中控制 / 4 磚牆 / 踩敵回彈（9）
＋ 契約檢查（碰撞框、`SPR_HERO ≤ 128`、`BG_HUD ≤ 64`、`NES.SH` 在場、engine `missing` 為空、0 console error）（6）

**大部分測試跑 main.js 的內建測試關 `?level=test`**（128 欄：淨空助跑道 45 欄 + ? 磚 / 金幣 / 4 磚牆 / 3 欄坑 /
7 欄單向平台 / 尖刺 / 3 欄熔岩 / GOAL），所以 star-world 改關卡不會讓本檔變紅；另有一組真關卡測試，
`ST.LEVELS['1-1']` 缺席時自動 SKIP。

### 通關機器人（`tools/playthrough_star.py`）

`$PY tools/playthrough_star.py --all`（另有 `--level 1-3 --seed 7 --lives 60 --max-frames 20000 -v`）。
策略不是「看到東西就跳」，而是**用 engine 的同一套物理往前推演**：

1. `window.__botSim(hold, x, y, vx[, noB])` 用 `NES.FX.SMB` + `GAME.dev.kindAt` 模擬「按住 A 幾幀」的整段跳躍
   （含單向平台、天花板、危險磚、掉出畫面），回傳落點與是否安全。
2. 每個「站在地上」的幀先問「完全不跳會怎樣」（往前看 75 幀）；能安全前進 ≥ 80 px 就不跳。
3. 要跳的話**盡量晚跳**（踏空前 6~14 幀，由策略決定）——早跳會鎖在走速（SMB 空中規則）而跳不遠。
4. 候選 `hold ∈ {10,12,15,19,24,30,40}`（外加「放開 B 的短跳」），挑**最短、而且在「早 10 px / 晚 8 px / 慢一點」
   三種擾動下都安全、落點還有活路（兩步推演）**的那一個。
5. 敵人：只為「可以踩、且高度相近」的敵人小跳 10 幀；飛行體從下面跑過去；無敵中直接衝。
6. 魔王戰（1-4 沒有旗桿磚）：貼上去踩頭，`ST.Boss.dead` → 過關。
7. 卡住（90 幀沒前進）→ 往左退（退的量逐次加大，且**不會退進後面的坑**）→ 進入「脫困窗口」；
   死一次就換下一組策略（20 組固定表，`--seed` 決定起點 ⇒ 完全可重現）。

**實跑結果（seed=1、預設 60 命）**：

| 關 | cleared | frames | deaths | 備註 |
|---|---|---:|---:|---|
| 1-1 | ✅ | 1400 | 1 | score 4200 / time 264 |
| 1-2 | ✅ | 1070 | 0 | score 4900 / time 249 |
| 1-3 | ✅ | 1265 | 0 | score 11800 / time 240（天空關 20 座浮台一次過） |
| 1-4 | ✅ | 6746 | 18 | 魔王踩頭 3 次；18 次死亡都在魔王房 |
| test | ✅ | 407 | 0 | 內建測試關（驗證機器人本身） |

### 截圖（`shots/agent_star_hero/`，`nes_lint.py` 8 張全 PASS）

`a_title.png` 標題（白字、`PRESS START`）／`b_walk.png` 1-1 走路／`b_jump.png` 1-1 跳躍（收腿姿勢）／
`b_crouch.png` 1-1 蹲下（16×16、腳不動）／`hurt.png` 受傷姿勢（閉眼、雙手張開，閃爍中的顯示幀）／
`hud.png` HUD 特寫（`SCORE 123450`｜`@×17`｜`TIME 288`｜`WORLD 1-1`｜`^×4`）。

### 已知問題

1. **斜坡沒有做逐像素爬坡**：`ST.solidKind` 回 `'slopeL'/'slopeR'` 時，hero.js **一律當成整塊 solid**
   （不會掉下去、但也不會順著斜面走）。W1 四關目前沒有用到斜坡磚，等 W2 真的要用再補。
2. **`?magic` 之類的狀態（power）沒有內容**：契約欄位 `power` 有留、永遠是 0（W1 沒有變身道具）。
3. **關卡切換 / 檢查點復活時整片重畫名稱表（2400 byte）**用 `timing.budget.mute = true` 跳過計帳，
   等同真機「關掉 rendering 再重寫」。正式遊玩時那一幀畫面會直接換掉（沒有淡入淡出）。
4. **機器人 1-4 要 18 條命**：魔王房的錘子 + 熔岩對貪婪策略很不友善（每次死亡換一組策略重試）。
   若總控要求「3 命通關」還得再加魔王戰的閃避邏輯。
5. **機器人 `--lives` 預設 60**（死亡數照實回報）；用 `--lives 3` 目前只有 1-1 / 1-2 / test 過得了。

### 契約異動 / 跨檔需求

**本層做的設計決定（與契約字面不同，已寫進測試）**

| # | 契約原文 | 實作 | 理由 |
|---|---|---|---|
| H1 | 「受傷（無敵 120 幀閃爍、擊退）」 | 擊退只在**站在地上**時發生（0.625 px/幀 + 彈起 1.5 px/幀、硬直 12 幀）；**在空中被打完全不改變水平動量** | 空中無法再加速（SMB 規則），在坑 / 熔岩 / 天空關的空中被反推＝必死，關卡會變成運氣遊戲。改掉之後機器人 1-3 從「必掛」變成 0 死亡通關 |
| H2 | 「斜坡上蹲 = 滑行（有斜坡才做）」 | 沒有斜坡 ⇒ 把 **`slide` 定義成「地面上按↓且 \|vx\| ≥ maxWalk」**（碰撞框同蹲 12×14） | 讓 `slide` 狀態在 W1 就能被測到；斜坡版本等 W2 |
| H3 | 「鏡頭…往左可回捲但不越過檢查點左緣（可選）」 | 改成**不越過名稱表還留著的最左欄**（`NES.SH.Scroller` 的 64 欄環形視窗，`state().camMin`） | 越過就會看到還沒補的舊欄；比「檢查點左緣」更直接對應硬體限制 |
| H4 | 「? 磚 / BRICK 頂撞」 | 以主角**中心所在的那一欄**判定頂到哪一格（SMB 的作法）；? 磚 → `level.setTile(USED)` + 金幣 +1 + 200 分 + 金幣粒子；BRICK 只震動 | 兩欄同時頂到時要有唯一解 |
| H5 | 機器人「起跳長按 20 幀」 | 大跳改成**按滿整個上升段（40 幀）**，並由模擬器在 `{10,12,15,19,24,30,40}` 裡挑 | 20 幀只有約 100 px 水平距離，過不了 W1 裡 7~9 欄寬的坑 |

**給 star-world（`levels_w1.js` / `boss.js`）**

1. **【P1・1-4 目前只能靠踩頭過關】斧頭 `col 242` 就在橋上**（橋 = col 212..243、橋下 col 218..243 是熔岩）。
   `ST.Boss.hitAxe()` → `breakBridge()` 會把**主角腳下那一欄一起拆掉** ⇒ 走過去碰到斧頭＝掉進熔岩必死。
   建議二選一：①把斧頭移到橋尾右側的實地（`col ≥ 245`，那裡 row 24..29 是石地）；
   ②`breakBridge()` 保留主角所在欄（或延遲 30 幀再拆）。目前機器人是**把斧頭當致命磚跳過去**再踩魔王頭 3 次過關。
2. **【P2】1-4 沒有 GOAL 磚**（`goal:{col:248,row:23}` 那一格是 EMPTY）。main.js 已補上
   「`lv.boss` 且 `ST.Boss.dead` → 60 幀後 clear」，但若之後要放旗桿，直接放 `TILE.GOAL` 即可（兩條路都通）。
3. **【P3】`level.tileAt(col,row)` 的列 0..3 請維持 EMPTY**：那 4 列是 HUD（`split(32)` 上段）的名稱表，
   `NES.SH.Scroller` 用 `{row0:4, rows:26}`，不會寫到，但關卡若在那裡放東西會看不到。
4. 已對接的介面（都照 star-world 的 PROGRESS 實作）：`ST.World.bind(bgBank, sprBank)`（合併 bank 後立刻呼叫）、
   `ST.World.applyPalettes(ppu, theme)`（bg/spr 第 0 組由本層保留給 HUD / 主角）、`ST.World.setAnim(frames >> 4)`、
   `level.chrAt / attrAt / setTile / checkpointFor / respawn / solidAt`、
   `ST.Enemies.init(lv, {solidAt}) / seek(camX) / update(g) / draw(oam) / each(g, fn)`、`ST.Boss.init(lv) / update(g) / draw(oam)`。
   **主角碰撞完全交給 star-world**：`g` 上掛了 `hero / camX / level / solidAt / onStomp / onHurt / onStar / onDie / onAxe`；
   `ST.Enemies` 缺席時本層才會用自己的 `NES.SH.aabb` 掃一遍。
5. 本層在 `ST.LEVELS` 上**多加了一個 `'test'` 關**（只在 `!ST.LEVELS.test` 時才建），是測試 / 機器人用的內建關卡，
   不在 `ST.LEVEL_IDS` 裡、不影響 `1-1..1-4` 的流程。

**給 star-audio（`song.js`）— 本層的呼叫點**

| 時機 | 呼叫 |
|---|---|
| `GAME.init` | `ST.Audio.init(nes)` |
| 進關 / 復活 / 標題 / 過關 / GAME OVER | `ST.Audio.play(key)`，key = `lv.music`（`ground/cave/sky/castle`）、`'title'`、`'clear'`、`'death'`、`'gameover'` |
| 每幀（所有模式）| `ST.Audio.tick(nes)`；`ST.Audio` 缺席時退回 `nes.music.tick()` |
| 音效 `ST.Audio.sfx(name, nes)` | `jump`（起跳）、`stomp`（踩敵）、`coin`（金幣 / ? 磚）、`powerup`（100 金幣 1UP）、`hurt`（受傷）、`bump`（頂磚 / 碰斧頭）、`die`（死亡）、`goal`（碰 GOAL / 打倒魔王） |

> 全部呼叫都包在 try/catch 裡，`ST.Audio` 缺席或丟例外都不會讓遊戲停下來；`state().lastSfx` 可查最後一次觸發的音效名。

**給 engine（`NES.SH`）**

- `NES.SH.Scroller.update(camX)` **只往右補欄**（`next` 單調遞增），往左回捲要自己來。
  main.js 的 `streamColumns()` 用 `scr.writeColumn(c)` 往左補，並把「被覆蓋掉的那一欄」還給 `scr.next`
  （寫世界第 c 欄會蓋掉 `c + 64` 欄）。若 engine 之後想把雙向補欄收進 `Scroller`，這段可以直接刪掉。
- 目前設定：`{nt:2, cols, row0:4, rows:26, ahead:34}` ⇒ 一欄 26 + 屬性 13 = **39 byte**，600 幀實測 `budget.over === 0`。

### star-world fix（R2b，2026-09-19，接 star-hero 機器人回報）

star-hero 的通關機器人在 1-4 死 18 次，追下去是三個我這邊的問題，**只改 `levels_w1.js` / `boss.js` / `test_w1.py`**：

| # | 問題 | 修法 |
|---|---|---|
| **P1** | **斧頭放在橋上（col 242）**：`hitAxe()` → `breakBridge()` 會把主角腳下那一欄一起拆掉 ⇒ **碰斧頭 = 必掉熔岩** | 兩道保險一起做：① 斧頭移到橋外的**實地** `col 246`（橋是 212–243）② `breakBridge(keepCol)` 會**留下主角那一欄與左右各一欄**；`hitAxe(hero)` 自動帶入（`update()` 也會記住最後看到的主角）。新增 `ST.Boss.keptCol` 可查 |
| **P2** | **1-4 沒有 GOAL 磚**（`goal` 指到 EMPTY） | 魔王房外的實地補**旗桿**（`{t:'pole', c:248, r:9}`），`goal` 改成 `{col:248, row:20}`。踩頭 3 次 / 斧頭 / 碰旗桿**三條路都會 clear** |
| **P3** | 1-4 太難（機器人 18 死，**其中 17 死集中在 col 77–78**） | 死亡點分析：`col 72 的彈跳球緊貼 76–83 的 8 欄熔岩坑` ⇒ 踩敵把助跑速度吃光、跑跳距離不夠。三件事一起改：①**最集中的兩處熔岩坑 8 欄 → 6 欄**（原 76–83 → 78–83、原 200–207 → 200–205，仍維持偶數欄對齊）②**坑前助跑距離拉到 ≥ 9 欄**，熔岩坑前 8 欄內不再放敵人（彈跳球 col 72 → 50、196 → 186）③ 四塊熔岩落腳石從列 19/20 **降到列 22**（離地只有 2 格，真的踩得到） |

**機器人結果（`tools/playthrough_star.py --all --seed 1`）**

```
1-1  cleared=True frames=1400 deaths=1  score=4200 time=264
1-2  cleared=True frames=1070 deaths=0  score=4900 time=249
1-3  cleared=True frames=1265 deaths=0  score=11800 time=240
1-4  cleared=True frames=1385 deaths=1  score=8100 time=245     ← 原本 deaths=18 / frames=6746
```

1-4 剩下的 1 死在 col 38（第一個熔岩坑，第一次嘗試失手，重來就過）；seed 1 / 2 / 3 都是 **deaths = 1**。

**測試**：`test_w1.py` 新增第 ⑥b 組「斧頭 / 橋 / GOAL」13 項（斧頭在橋外且腳下是實地、GOAL 磚存在且在橋外、
站在斧頭上觸發後腳下仍是實地、斧頭在橋外時整座橋照樣斷、`breakBridge(keepCol)` 只留 3 欄、測後復原）
⇒ **共 177 項全過**。`run_all.sh --quick` 除了 `cruiser/test_cruiser.py`（fix2 agent 同時在改）以外全綠。
四關 + 魔王房截圖重拍、`star.html` 實機 1-4 重拍，`nes_lint.py` 9 張全 PASS（10 色 / 25）。

**1-4 關卡表更新**：欄數 256（8 畫面）不變、敵人 14 隻（roller 9 / bouncer 3 / flyer 2）+ 魔王、金幣 32、
檢查點 92 / 190、熔岩坑 6 處（8 / 6 / **6** / 8 / 8 / **6** 欄）+ 無底坑 1 處（6 欄）、GOAL 旗桿 col 248。

**給 star-hero / qa2**：`ST.Boss.hitAxe(hero)` 現在收一個選用的主角物件；`ST.Boss.breakBridge(keepCol)` 收選用的保留欄。
main.js 不用改（`Boss.update(g)` 會自己從 `g.hero` 帶進去）。

---

## fix2-cruiser（R2）

2026-09-19 ｜ fix2-cruiser agent ｜ 對象：`docs/QA_REPORT.md` 的「# R2 QA（qa2-cruiser）」P1 ×3 / P2 ×6 / P3 ×2。
擁有並修改：`games/cruiser/{chr_ship 未動, chr_world, ship, main, enemies, boss, stage1, song 未動, test_cruiser.py, test_stage1.py}`、
`tools/playthrough_cruiser.py`（總控指定移交）。**engine/ 與其他 tools 未動、未 git。**

### 驗收總表

| 項目 | 指令 | 結果 |
|---|---|---|
| 全測試 | `bash tools/run_all.sh`（完整） | **PASS 全綠**，17 個項目（node --check 32 檔 + 11 支測試 + 3 個 build --check + 冒煙截圖 + lint 抽查 8 張）**0 FAIL**；本輪動到的兩支：cruiser 124→**152**、stage1 128→**144** |
| 機器人通關 | `$PY tools/playthrough_cruiser.py --max-frames 20000` | **cleared = True、死亡 0 次、剩 3 條命、6468 幀（≈ 108 秒）、score 14700**（qa2 基準：GAME OVER、camX 1201 / 3072、死 3 次） |
| 單檔 dist | `$PY tools/build.py --src cruiser.html` | 內嵌 20 檔、缺 0 檔、414 KB；實跑 lint PASS colors=9 |
| 截圖 lint | `shots/agent_fix2/*.png` 7 張 | 全 PASS（colors 7~12 / 25、`badPixels` 0、`overLine` 0），每張都 Read 看過圖 |

---

### P1（必修，3 項全修）

**P1-1 按住 A 自動連射** — `games/cruiser/ship.js:454`
`input.pressed(BTN.A)` → `input.pressed(BTN.A) || input.held(BTN.A)`。研究 §5-3 [源/反組譯]：
「A 鍵：邊緣（`$05`）**或**計時器歸零 + 按住（`$07`）都能發」。發射閘門仍在 `fireFrom`
（`e.timer <= 0` + 該發射體還有空槽），所以 20 幀間隔與「子彈在畫面上時 `stepTimers` 凍結計時器」都原封不動。
- 實測：按住 200 幀 = **9 發**（qa2 實測 1 發）→ **每 22.2 幀 1 發**，間隔 **20 / 27 交替**（= 子彈壽命 + 20，研究是 21/23，機制相同、數字差在自機 x 與 `KILL_X`）。
- 手動連打（每 2 幀）200 幀 = 9 發，與自動連射同級 ⇒ 邊緣路徑沒被吃掉。
- 測試：`test_cruiser.py` ⑪ 新增 4 項（發射數 ≥ 8、平均節奏 21~23 幀、最小間隔 ≥ 20、手動 ≈ 自動）。

**P1-2 STAGE CLEAR / GAME OVER 文字可見** — `main.js`
原本 `writeText(ppu, col, row)` 一律寫名稱表 0，但遊戲區是 `ppu.scroll(camX % 512, 0, 0)` 的兩張名稱表。
改成 `drawMsg()`：先算畫面左緣的全域欄 `scrollCol() = (camX % 512) >> 3`（0..63），逐字換算
`nt = (base + col + i) >= 32 ? 1 : 0`、`欄 = (base + col + i) & 31`，**跨兩張自動分段**；
寫過的格記在 `msgCells`，`clearMsg()` 精準清除；屬性列同時寫 nt0 與 nt1。
- 魔王 camX 2816（`% 512 = 256`，文字 100% 在 nt1）：`GAME.state().msg` = `STAGE CLEAR|PRESS START`，截圖 `shots/agent_fix2/4_stageclear.png` 看得到。
- GAME OVER camx=800（scroll 298）：`msg` = `GAME OVER|PRESS START`，截圖 `5_gameover.png`。
- 新增 `GAME.state().msg`（列 11 / 15 的「可見 32 欄」反查字串）與 `CR.screenText(row)` 供 QA 驗收。
- 測試：⑪ 新增 8 項（兩種畫面 × 模式 / scroll ≥ 256 / 列 11 文字 / 列 15 文字 / lint 綠）。

**P1-3 死亡後音樂重播** — `main.js respawn()`
末尾加 `CR.Audio.play(bossActive ? 'boss' : 'stage1')`（`restart()` 會把魔王收掉 ⇒ 一般情況播 `stage1`，
回到 camX 2816 時再由 P2-2 的偵測換 `boss`）。
- 實測：死後 200 幀 `CR.Audio.state()` = `{song:'stage1', playing:true}`、`mode` 已回 `play`（qa2：死後 800 幀仍 `playing:false`）。
- 測試：⑪ 新增 3 項。

### P2（6 項全做）

**P2-1 HUD 能量表版面** — `ship.js GAUGE_LABEL`
`['SPEED','MISSL','DOUBL','LASER','OPTON','  ?  ']` → `['SPD ','MSL ','DBL ','LSR ','OPT ',' ?  ']`
（每格 5 欄的前 4 欄放 3 字 + 1 空欄，第 5 欄留白）。
- 實測第 2 列：`SPD  MSL  DBL  LSR  OPT   ?`（原本 `SPEEDMISSLDOUBLLASEROPTON  ?`），與第 3 列的 6 個 `[---]` 逐格對齊。截圖 `2_hud_fortress.png`。

**P2-2 魔王曲 / 通關曲** — `main.js update()`
偵測 `CR.stage.bossActive` false→true 時 `CR.Audio.play('boss')`（`g.bossOn` 記錄邊緣，`toPlay/toTitle/respawn` 重置）；
擊破後沿用既有的 `toStageClear() → play('clear')`。
- 實測 `?boss=1`：進場 120 幀後 `{song:'boss', playing:true}`；打完 `{mode:'stageclear', song:'clear'}`。

**P2-3 難度（詳見下一節）** — 通道 ≥ 18 列、砲台 15→7 座、難點段敵彈 −30%、檢查點安全區、紅色單體回血。

**P2-4 敵彈改亮色** — `chr_world.js` + `stage1.js`
`W_SHOT1` 原本用色 2（spr2 的深綠 `$1A`）⇒ 黑底星空與藍色要塞上幾乎看不見。兩幀改成**只用色 3**，
再由 `stage1.js` 每 4 幀換調色盤組：`spr2` 色 3 = 淡黃 `$38` ⇄ `spr1` 色 3 = 白 `$30`（外框同時黑 ⇄ 紅）。
**0 新顏色、0 新磚**（spr1 本來就在場上畫爆炸 / 紅膠囊）。截圖 `6_colors.png`：黑底上是白心紅框的閃爍菱形。

**P2-5 砲台改色** — `chr_world.js W_TUR0 / W_TUR1`
圖樣裡色 2 ⇄ 色 3 對調 ⇒ 主體變 spr3 的藍 `$11`、白 `$30` 只剩外圈高光與砲管。
自機（白 + 深藍 + 橘噴焰）與砲台（黑輪廓 + 白圈 + 藍圓頂）一眼可分（`6_colors.png` 上下兩座砲台）。

**P2-6 魔王室降刺眼** — `chr_world.js`
兩招都上：① `W_BOSSBG` 由整片色 1 改成 **2×2 棋盤網點**（實心 50%，其餘露出底色 `$0F` 黑）；
② `WORLD_PAL.bg3[0]` `$06` → **`$07`**。同屏色數仍 10~12（上限 25）。截圖 `3_boss_room.png` / `3b_boss_room_07.png`。

### P3（2 項都做）

- **P3-1 標題不掛 HUD**：`main.js` 加 `hudOn` 旗標與 `hudHide()`；`title` 模式把列 26..29 清空且 `draw` 不再 `hudSync`，
  `toPlay()` 呼叫 `hudStatic()` 重建。實測標題 `state().hudOn === false`、`hud === ''`（截圖 `1_title.png` 乾淨星空）。
- **P3-2 魔王死亡後空捲**：`stage1.js` 新增 `BOSS_RESPAWN = 2760`（匯出在 `CR.stage`），`main.js respawn()` 在
  「死亡當下 `bossActive`」時改用它。**440 幀（7.4 秒）→ 112 幀（1.9 秒）**。
- P3-3（註解裡的原作名）/ P3-4（ENGINE_API 補字）/ P3-5（精靈密度）不在本輪範圍，未動。

---

### P2-3 難度：實測過程與最終數字

qa2 的結論是「欄 144~158 / 194~210 連滿強化都過不去」。fix2 逐項量測後發現**還有一個更根本的問題**：
`shots/agent_qa2/bot.py` 跑 2400 幀 `CR.stage.capsuleSeq()` 恆為 **0** ——
全關唯一的膠囊來源是「fan 編隊 5 隻全滅」，單發彈（每 22 幀 1 發）幾乎做不到 ⇒ **整局拿不到任何強化**。

| # | 修法 | 依據 / 數字 |
|---|---|---|
| ① 通道 | `stage1.js TERRAIN`：`[5,5] [6,3] [3,6] [4,7] [7,4] [5,8] [8,5] [6,6]` → `[4,4] [5,3] [3,5] [3,5] [5,3] [3,5] [5,3] [4,4]`，**天地合計 ≤ 8 列 ⇒ 可用高度全關 ≥ 18 列（144 px）**（原本最窄 13 列） | 任務要求「最窄 ≥ 18 列」；起伏 / 天地反轉的節奏保留，只是落差變緩 |
| ② 岩石 | 小行星 / 碎片只鋪到欄 **99**（欄 100 起天花板 / 地板已開始長出來）。rnd 仍照原順序抽 ⇒ 欄 < 100 的佈點與 R2 完全一樣 | 機器人在欄 120 被「牆 + 石頭」夾死 |
| ③ 砲台數量 | 要塞 **15 座 → 7 座**（事件欄 152 / 166 / 182 / 216 / 232 / 248 / 280 ⇒ 世界欄 186 / 200 / 216 / 250 / 266 / 282 / 314），間隔 14~16 欄 | 「砲台間隔拉開」 |
| ④ 檢查點安全區 | **每個檢查點（欄 128 / 192 / 256）之後 22 欄內沒有砲台**（砲台站在「事件欄 + 34」、進畫面時相機在「世界欄 − 32」⇒ 事件欄 ≥ 檢查點 + 22）＝ 復活後 ≥ 350 幀不會遇到瞄準彈；核心室前（檢查點 320）之後 6 欄內不出怪 | 逐幀追蹤證實：在檢查點 1024 復活後，機器人在欄 149 被世界欄 170 的砲台瞄準彈鎖死（速度 1 = 1 px/幀，追不開 2 px/幀 的瞄準彈） |
| ⑤ 敵彈密度 −30% | `enemies.js`：砲台週期 `TURRET_PERIOD 90` → `EASY_PERIOD 130`，**適用世界欄 150~300**（＝整個要塞；原本只鎖定 qa2 點名的兩段，實測第三座砲台一樣鎖死機器人）。核心室前與小行星帶維持 90（研究 §10 原值） | 90 / 130 = 0.69 ≈ −30% |
| ⑥ 核心室前減量 | 第 ③ 段 **14 事件 / 54 欄（每 3.9 欄）→ 11 事件（每 ≥ 4 欄）**，tank 由 6 隻減到 4 隻 | qa2：欄 320~343 帶滿強化也死 2 次 |
| ⑦ **紅色單體**（新增機制） | 研究 **§3-3 [源]**「一般敵人多是灰 / 藍配色，**紅色版本必掉膠囊**」。出怪表標記 **12 隻**（9 隻 zig + 3 隻 tank），用 `{drop:1}`；畫面上改用 **spr1（紅 $16 / 橘 $28 / 白 $30）** ⇒ **0 新顏色、0 新磚**，紅色本身就是「打了有獎」的訊號。**每個復活檢查點（512 起）之後 14 欄內都有一隻** | 補上 R2 缺的膠囊管道（stage 已知問題外的漏洞）：修完後機器人 1600 幀內就能拿到 SPEED |
| ⑧ fan 位置 | `at(108, fan(64))` → `fan(96)`：欄 100~127 通道正在收窄，貼天花板的編隊會把玩家逼進左上角 | 機器人在 camX 929~963 連續撞死 |

**未改（刻意保留）**：
- 死亡清光強化 / rank 歸 0（研究 §10-4 [源]，qa2 已驗 PASS）。qa2 建議的「復活保留 1 級 SPEED」**沒有做**，
  因為那會把一條 [源] 契約改掉；改用⑦的紅色單體提供回血路徑，效果相同但不違反還原標準。
- 敵彈基礎速度 2.0 / rank ≥2 ×1.25 / rank ≥3 預判（研究 §10-6）全部保留。
- 魔王總血量 24、環形 8 彈、三連雷射全部保留（實測把環形改 6 發對結果毫無影響，已改回 8）。

---

### `tools/playthrough_cruiser.py`（機器人改版，總控指定）

qa2 版的貪婪成本函式有 3 個結構性缺陷，逐一用逐幀追蹤定位後修掉：

| # | 缺陷 | 修法 | 證據 |
|---|---|---|---|
| 1 | **不會垂直閃避**：威脅評估是「移動 1 幀後停著不動」，上 / 下 / 停三者成本幾乎相同 ⇒ 永遠只左右退 | 9 個候選都**模擬「持續按住這個方向」**：地形 84 幀（每 4 幀取樣）、敵彈 / 敵人 40→**56 幀**（逐幀），取最早碰撞幀算成本 | 追蹤顯示 y 值 40 幀完全不動、被 (−2, −0.8) 的瞄準彈追到左牆 |
| 2 | **假設按到底 ⇒ 垂直永遠被罰**：一路往上一定撞天花板，所以任何垂直候選都帶著地形罰分 | 加 `HOLD = 24`：只模擬「按 24 幀後停住」，之後讓地形自己捲過來 | 魔王戰卡在 y = 94、打不到 y = 72 的裝甲板 **18000 幀** |
| 3 | **左牆角罰分太輕**：線性 `200/px`，在 x = 8 只有 6400，永遠比撞上（wt × 42 ≈ 1.6 萬）便宜 | 改**平方**：`(48 − x)² × 32`；上下邊界同樣改 `(36 − y)² × 10` / `(y − 164)² × 10` | 全部 3 次死亡都發生在 x ≤ 36 的牆角 |
| 4 | **抖動**：上 19 / 下 19 逐幀交替 ⇒ 兩幀淨位移 0，閃不開 | 動量項（換方向 +150、垂直反向 +1600、水平反向 +700），**只在「原地不動會被打到」時生效**（平時要留給瞄準微調：速度 1 時瞄準梯度只有 30/幀） | 魔王戰死亡逐幀表 |
| 5 | **打不到魔王**：魔王部位的 `e.vx` 是內部殘值，線性外推變成「衝過來」；近距離懲罰又把機器人推開 | 魔王部位 `vx = vy = 0`、威脅權重 150（最低）、不套近距離懲罰；瞄準優先序 **魔王 > fan 編隊 > zig > turret > tank**（「打飛編隊優先」＝整隊打光才掉膠囊） | 卡 13000 幀 0 傷害 |
| 6 | **三連雷射必死**：預告 30 幀是背景磚，機器人看不到；雷射變成判定彈時已經 0 距離同幀 | 直接讀 `CR.Boss.state().laser === 'warn'/'beam'` + `CR.Boss.LASER_OFF`，把 3 條列先當威脅；這組威脅**不加安全邊界**（雷射間只有 10 px 縫，加了 pad 會「哪裡都不能站」） | 死亡幀 6107：上一幀 3 條 `bg` 大判定彈同時出現在 y 81 / 97 / 113 |
| 7 | 其他 | 按住 A（配合 P1-1 的自動連射）、**死亡復活後願望清單重置**（不然永遠不再買 SPEED，速度 1 追不開瞄準彈）、魔王戰 gauge ≥ 4 直接花掉（魔王戰不會再掉膠囊）、tank 威脅權重 560 / pad 8（鎖高度直衝） | |

`--shots` 的過程圖在 `shots/play_cruiser/bot/`；`__bot.dbg = true` 可錄最近 40 幀的 9 個候選成本（除錯用，預設關）。

**最終結果**：`cleared`、**死亡 0 次**、剩 3 條命、**6468 幀**、score 14700、
通關時強化 = SPEED 3 + MISSILE + LASER（`full_end.png`：STAGE CLEAR 文字清楚可見）。

---

### 測試新增

| 檔 | 原 | 現 | 新增內容 |
|---|---:|---:|---|
| `games/cruiser/test_cruiser.py` | 124 | **152** | ⑪ fix2 組 28 項：自動連射（4）、STAGE CLEAR / GAME OVER 可見性 × 2 畫面（8）、復活音樂（3）、魔王曲 / 通關曲（3）、標題無 HUD（4）、魔王復活點（3）、HUD 版面（改判定） |
| `games/cruiser/test_stage1.py` | 128 | **144** | ⑧ fix2 組 16 項：最窄通道 ≥ 18 列、砲台 ≤ 10 座、檢查點 22 欄安全區、`turretPeriod` 分區（90 / 130）、紅色單體數量 + 檢查點覆蓋 + 調色盤 + 真的掉膠囊、敵彈兩幀只用亮色、砲台主體改藍、魔王室網點比例、`BOSS_RESPAWN` |

### 給其他 agent / 總控

1. **`GAME.state()` 新欄位**：`msg`（列 11 / 15 的可見文字，`'STAGE CLEAR|PRESS START'` 形式）、`hudOn`、`bossSong`。`CR.screenText(row)` 也可直接叫。
2. **`CR.stage` 新欄位**：`BOSS_RESPAWN = 2760`。**`CR.Enemies` 新欄位**：`EASY_PERIOD`、`turretPeriod(wx)`、`PAL_DROP`。
3. **敵彈調色盤會每 4 幀在 spr2 / spr1 之間交替**（P2-4）。之後若有人要改 spr1，請記得敵彈也吃這一組。
4. **`{drop:1}` 的敵人一律畫成 spr1（紅色單體）**，這是「必掉膠囊」的視覺契約，不要拿 spr1 去畫別的雜魚。
5. 給 **qa2**：`shots/agent_qa2/*.py` 我一律沒動；`bot.py` 已由總控收進 `tools/playthrough_cruiser.py` 並由 fix2 改寫，
   重跑驗收請用 `tools/` 版（`shots/agent_qa2/segments.py` 仍 import 舊的 `bot.py`，會跑到舊策略）。
6. 未修：P3-3（註解裡的 `Gradius` 2 筆）、P3-4（`ENGINE_API` §15.3 補 Pool 回收時機，engine 的檔）、P3-5（編隊密度，會動到出怪表節奏，與本輪「降難度」方向相反）。

---

## fix2-star（R2b）

2026-09-19｜fix2-star agent｜**只改 `games/star/*`**（`main.js` / `hero.js` / `chr_hero.js` /
`chr_world.js` / `levels_w1.js` / `song.js` / `test_star.py`）——`engine/` 與 `tools/` 一個字都沒動，
`games/cruiser/*` 由 fix2-cruiser 同時處理、互不相干。**沒有做任何 git 操作。**
輸入：`docs/QA_REPORT.md`「# R2b QA（qa2-star，2026-09-19）」的 P1 / P2 / P3 清單。

### 0. 一句話結果

| 項目 | 修前（qa2-star） | 修後 |
|---|---|---|
| `bash tools/run_all.sh`（完整） | 1399 項 / 1 FAIL（cruiser） | **17 項全 PASS、總結 PASS**（cruiser 也已被 fix2-cruiser 修好） |
| `games/star/test_star.py` | 132 項 | **158 項全過**（+26，全是本輪新增的結束畫面 / 音樂呼叫點驗證） |
| `games/star/test_w1.py` | 177 項 | **177 項全過**（裝飾補密後可達性 / 坑寬 / lint 完全沒變） |
| 機器人四關 × seed 1 | 1400 / 1070 / 1265 / 1385 幀 | **完全相同**（1 / 0 / 0 / 1 死）⇒ 美術與裝飾沒有改動任何碰撞 |
| `dist/星塵勇者.html` | 436 KB / 內嵌 20 檔 | **452 KB / 內嵌 20 檔、缺 0 檔**、lint PASS |
| 截圖 lint | — | 本輪 23 張 NES 畫面 `nes_lint.py` **0 張違規**（色數 8~12 / 25） |

### 1. P1-1 ── GAME OVER / 破關畫面（必修，已修）

**問題**：`gameover` 模式完全不畫字，而且「輸光命」與「破完 W1」長得一模一樣。
舊的 `drawTitle()` 只往**名稱表 0 的固定欄**寫字，`camX` 一大（`camX % 512 ≥ 256`、或文字跨兩張名稱表）就看不到。

**修法**（`main.js`，約 90 行，取代原本的 `drawTitle` / `clearTitle`）：

| 元件 | 說明 |
|---|---|
| `ntOfScreenCol(sc)` | **座標一律用「螢幕欄 0..31」**，寫入時才換算：世界欄 = `(camX >> 3) + sc`，落在 `wc & 63` ⇒ 名稱表 `(wc >> 5) & 1` 的第 `wc & 31` 欄。跨兩張名稱表時**自動逐字分段**，任何 `camX` 都看得到 |
| `drawBanner(ppu, lines)` / `clearBanner` | 通用「疊字」：先把文字覆蓋到的 16×16 屬性區塊塗成調色盤 0（白字），再逐字寫磚；擦除時用 `scrTileAt(worldCol,row)` / `attrAt(worldCol>>1,r16)` 還原成關卡原本的值。模式切換是一次性動作 ⇒ 比照 `rebuildScreen()` 用 `budget.mute` 靜音計帳 |
| `drawTitle` / `clearTitle` | 改成 `drawBanner(TITLE)` / `clearBanner(TITLE)` ⇒ 標題畫面也跟著變成「任何 camX 都正確」 |
| `enterGameOver(won)` | 統一入口：`g.won` 決定畫哪一組字；**先把 `camX` 對齊 8 px**（`clampCam(camX & ~7)`，fine scroll ≠ 0 時文字磚會被切半格），再 `drawBanner` |
| `GAMEOVER_LINES` | `GAME OVER`（列 12、螢幕欄 12）／`PRESS START`（列 16、欄 10） |
| `winLines()` | `WORLD 1 CLEAR`（列 10）／`THANK YOU`（列 13）／**`SCORE 0xxxxx`**（列 16，執行期算）／`PRESS START`（列 19） |

**新增除錯 / 測試鉤子**：`GAME.dev.screenText(row, screenCol, len)`（用磚索引反查表讀回**目前畫面上**的文字）、
`GAME.dev.banner()`、`state().banner`（回報目前畫著哪幾行字）。

**實測**（`test_star.py` ⑨c，**20 項**）：

| 驗證 | 數字 |
|---|---|
| 在 1-1 的 col 300 輸光命（**`camX = 2296`、`camX % 512 = 248` ⇒ 文字跨 nt0/nt1**） | `screenText(12,12,9) = 'GAME OVER'`、`screenText(16,10,11) = 'PRESS START'` |
| 不經 `screenText`，自己換算 nt / 欄逐格比對 `ST.textTiles('GAME OVER')` | 9 格**全等** |
| `camX` 對齊 | `camX & 7 === 0` |
| **`ppu.indexFrame` 逐像素**數白色（`$30`）像素 | `GAME OVER` **136 px**、`PRESS START` **154 px**（門檻 60）⇒ 真的畫在**可見區**，不是寫到看不到的名稱表 |
| 破完 1-4（`won = true`） | `WORLD 1 CLEAR` / `THANK YOU` / `SCORE 029795`（執行期算）/ `PRESS START` 四行全部讀得回來，白色像素 **167 / 154** |
| VBlank 預算 | 畫結束畫面的那一幀 `budgetOver = false` |

截圖：`shots/agent_fix2star/g_gameover.png`（camX 2296）、`k_win.png`（camX 1792、SCORE 065700）、`g2_back_to_title.png`。

### 2. P2-5 ── GAME OVER 後回標題（已修）

`main.js` 的 gameover 分支改成：`START` → 重設 `lives 3 / score 0 / coins 0`、`loadLevel(startLevel)`
（內含 `rebuildScreen()` ⇒ 字自動被整片蓋掉）→ `mode = 'title'` + `drawTitle` + `play('title')`。
標題再按一次 `START` 才真正開始。實測：`gameover --START--> {mode:'title', lives:3, score:0, camX:0, 標題字重畫}` `--START--> {mode:'play'}`。

### 3. P2-1 ── 魔王曲呼叫點（已修）

`main.js` play 分支新增 `g.bossMusic` 三態機（`0 關卡曲 / 1 boss / 2 clear`）：

```
bossMusic 0 + ST.Boss.active           → play('boss')  , bossMusic = 1
bossMusic 1 + ST.Boss.dead             → play('clear') , bossMusic = 2      ← 擊破後立刻換曲
bossMusic 1 + 離開魔王房(!active)      → play(lv.music), bossMusic = 0
```

`loadLevel()` / `respawn()` 都會把 `bossMusic` 歸 0（**死在魔王房復活後再進房會重新切 boss 曲**，
這是 qa 特別點名的坑）；`enterClear()` 加了 `if (g.bossMusic !== 2)` 的保護，避免 60 幀後把 `clear` 從頭再播一次。
實測（`test_star.py` ⑨d）：魔王房外 `castle` → `ST.Boss.active` 為 true 時 `song = 'boss'` → 踩頭 3 次後 `song = 'clear'`。

### 4. P2-2 ── `title` 曲 + 未知 key 警告（已修，`song.js`）

- 新增第 10 首 **《星塵序曲》`title`**：C 大調、**150.0 BPM**（speed 6 × 16 row/小節）、**8 小節 loop = 768 幀 = 12.78 s**、26 個 pattern。
  和聲 C – Am – F – G – C – Em – F – G7；p1 `lead` 號角旋律（前 4 小節四分長音讓玩家讀完標題，後 4 小節轉 8 分下行答句）／
  p2 8 分琶音 `stab`／tri 八度跳躍低音（研究 06 §2.6）／noi 基本鼓 + 第 4、8 小節過門。**全部原創**。
- `Audio.KEYS` 補上 `'title'`（9 → **10**）。
- `play()` / `sfx()` 遇到不存在的 key **`console.warn` 一次**（`warnOnce`，同一訊息只印一次，不洗版）。
- 驗證：`ST.Audio.validate()` **0 問題**；`shots/agent_star_audio/render.py --seconds 6` → 10 首曲 × 600 幀 tick **失敗 0 項**，
  title 峰值 **0.5554 ≤ 1.0**、無 NaN；只寫 `$4000~$4017`。
- **順手抓到一個真 bug**：這個 warn 一開就叫出 `ST.Audio.sfx(): 沒有這個音效 "die"` —— `hero.js:166` 死亡時呼叫的是
  `sfx('die')`，但音效名是 `death`（整個 R2b 期間死亡音效**根本沒響過**，因為舊版是靜默失敗）。已改成 `g.sfx('death')`。

### 5. P2-3 ── 背景裝飾補密（已修，`levels_w1.js` + `chr_world.js`）

**先加一道保險**：`Level._deco(c, r, k)` —— 裝飾**只填 EMPTY 的格子**，永遠不可能蓋掉地形。
`cloud / hill / tree / bush / stars / stal / torch / csea / vein` 全部改走它 ⇒
**可達性 BFS、坑寬 ≤ 9 欄、牆高、起點安全區這些測試的結果完全不變**（177 項照樣全過、機器人幀數一幀不差）。

新磚（`chr_world.js`，`BG_WORLD` 45 → **52 磚**，上限 192）：
`BG_TORCH0` / `BG_TORCH1`（火把火焰 2 幀）／`BG_TORCH_B`（壁座）／`BG_CSEA_T` / `BG_CSEA_B`（雲海剪影帶）／
`BG_STAR_T`（第三種最小星點）／`BG_VEIN`（洞窟岩層紋）。
新語意碼 `TILE.TORCH / TORCH_B / CSEA_T / CSEA_B / STAR_T / VEIN`（`TILE_COUNT` 38 → **44**，`solidKind` 全部 `'none'`）。
火把接上和熔岩同一套 2 幀動畫（`chrAt()` 依 `ST.World.anim` 換磚）。

| 關 | 修前（qa 實測） | 修後（`ST.LEVELS[id].tileAt` 逐格重數） |
|---|---|---|
| **1-1** | 66 磚 / 12 畫面 = **5.5 磚/畫面**（雲 6 全擠在同一列、山 6、灌木 6、樹 6） | **104 磚 = 8.7 磚/畫面**：雲 **16 朵分兩條高度帶**（高雲列 5 × 7、中雲列 8 × 9）、山 **10**、灌木 **12**、樹 **10**（＝ qa 給的數字） |
| **1-2** | 20 磚 = 2.0 / 畫面 | **262 磚 = 26.2 / 畫面**：頂板下整排**岩層紋 234 磚**（`_deco` 自動跳過天花板較厚的區段）+ 鐘乳石 17 + 岩紋 11 |
| **1-3** | 42 磚 = 3.5 / 畫面（星 34、雲 2 朵） | **650 磚 = 54.2 / 畫面**：星點 **51 顆分 3 種大小**（大 18 / 小 18 / 極小 15，列偏移 0/1/2）、雲 **12 朵**、**雲海剪影帶 576 磚** |
| **1-4** | 10 磚 = 1.2 / 畫面 | **39 磚 = 4.9 / 畫面**：窗 **16 扇**（8 組 `W.W`）、**火把 4 支**（8 畫面 ÷ 2 = 每 2 畫面一支，2 幀動畫）+ 鎖鏈 15 |

**一個 qa 沒算到的坑（已避開）**：雲海剪影帶放在 qa 建議的**列 20–21 會壞掉** —— 1-3 有浮台正好在列 20 / 21，
兩者共用 16×16 屬性區塊，而 `PLATFORM` 的優先權（3）高於裝飾（1），剪影就會被染成**純黑方塊**（我第一版實測到了，
見下方「踩過的坑」）。改放**列 24–25**（浮台最低到列 22 ⇒ 屬性區塊 r16 12 vs 11 完全分開），
而且正好接續前 96 欄實地的地平線高度（`groundRow = 24`），視覺上更對。

驗證：`test_w1.py` **177 項全過**（含四主題 lint ≤ 25 色）；實機四關截圖色數 **8 / 8 / 10~12 / 9~10 / 25**、
`budget.overFrames = 0`、`nes_lint.py` 全 PASS。截圖 `p11_a/b/c.png`、`p12_a.png`、`p13_a/b.png`、`p14_a/b.png`。

### 6. P2-4 ── 主角造型重畫（已修，`chr_hero.js` + `hero.js`）

**不加任何顏色**（精靈調色盤 0 仍是 `$0F 描邊 / $12 戰衣 / $27 亮色` 三色 + 透明），全靠**剪影**：

| qa 建議 | 實作 |
|---|---|
| ① 頭上不對稱特徵 | **帽尾**：兜帽後腦往左後平伸再下垂的 5 px 尖角；跳 / 受傷 / 死亡幀改成**上揚**版（`tail = 1`） |
| ② 圍巾 | 脖子往後飄的亮色（3）飄帶，站立時垂下、跳躍時上揚 |
| ③ 臉別佔滿頭 | 膚色開口從 **10×6 縮成 6×4**，兜帽開口收窄 |
| ④ 手臂與軀幹分離 | 軀幹 `x5..11`、後手 `x2..3`、前手 `x13..14`，**中間各留 1 px 黑縫**；走路 3 幀上半身也跟著換（`H_BODY` / `H_BW1` / `H_BW2`），手臂上下擺動 ±1 px |
| ⑤ 胸口星徽 | `x7..8, y11..12` 的 **2×2 亮色方塊** |

`hero.js` 的 `frameNames()` 改成走路時同時挑上半身（`ST.HERO_ART.bodies`），`tileNames()` 補兩組；
**站 / 走 3 幀 / 跳 / 落 / 轉身 / 蹲 / 滑 / 受傷 / 死亡 9 種姿勢全部重畫成同一套比例**（頭 7 列 / 軀幹 9 列 / 腳 8 列）。
`ST.SPR_HERO` 58 → **66 磚**（上限 128）。
截圖放大看過：`z_hero_sheet.png`（11 個姿勢逐幀 7 倍並排）、`z_hero_walk/jump/crouch/dead.png`（6 倍）。

### 7. P3 順手修的

| # | 內容 |
|---|---|
| **P3-4** | **鐵鎚王手上有錘子了**：整體右移 2 px、頭盔與肩 / 軀幹左右各外擴 1 px（剪影從 24 px 吃到 **~30 px**），左手加一把**錘頭 6×6 金屬色 + 木柄**的大錘。錘子只畫在**上半 16 列** ⇒ `throw` 幀（`topOnly`、共用站立的下半身）可以把錘子舉高：站 / 跳扛在肩上（top = 4）、`throw0` 舉到最高（top = 0）、`throw1` 落到胸前（top = 7)。截圖 `z_boss_zoom.png` |
| **P3-5** | **受傷無敵維持 120 幀**（`ST.Hero.INV_FRAMES = 120`）——**TASKS 契約優先**（總控定調）。**研究值 168 幀（SMB `8 × 21`）是可調的**：只要把 `games/star/hero.js` 的 `INV_FRAMES` 改成 168，`test_star.py` 的期望值（②b 那組）跟著改一個數字即可，其他都不用動。兩個數字的差是 48 幀 = 0.8 秒，對 1-3 / 1-4 的密集敵人區有感 |
| P3-2 | **不動**（照總控指示）：機器人 seed 3 的 1-1 脫困迴圈（14159 幀 / 3 死）在 `tools/playthrough_star.py`，不是 `main.js` 可調的，那是 tools 的所有權。本輪重跑 seed 3 仍是 `14159 幀 / 3 死`（與 qa2 完全一致 ⇒ 本輪沒有讓它變糟） |
| P3-1 / P3-3 / P3-6~P3-10 | 未動（設計面 / 記錄性，或屬於 R3 / R4 的排程） |

### 8. 驗證指令與數字（全部在專案根目錄跑，`PY=../卡比之星/.venv/bin/python`）

```
bash tools/run_all.sh                                    # 17 項全 PASS，總結 PASS
$PY games/star/test_star.py                              # 158 項，通過 158，失敗 0
$PY games/star/test_w1.py                                # 177 項，通過 177，失敗 0
$PY shots/agent_star_audio/render.py --seconds 6         # 10 首曲 + 9 音效，失敗 0 項
$PY tools/playthrough_star.py --level 1-1 --seed 1       # cleared=True frames=1400 deaths=1
$PY tools/playthrough_star.py --level 1-2 --seed 1       # cleared=True frames=1070 deaths=0
$PY tools/playthrough_star.py --level 1-3 --seed 1       # cleared=True frames=1265 deaths=0
$PY tools/playthrough_star.py --level 1-4 --seed 1       # cleared=True frames=1385 deaths=1
$PY tools/build.py --src star.html                       # 內嵌 20 檔、缺 0 檔、452 KB
$PY tools/shot.py --url "dist/星塵勇者.html" --query "level=1-1" --lint ...   # lint PASS colors=11
$PY tools/nes_lint.py --palette engine/palette.js shots/agent_fix2star/*.png # 23 張 NES 畫面 0 違規
```

自寫的驗證腳本放 `shots/agent_fix2star/shots.py`（`shots/` 已 gitignore）；
截圖 `shots/agent_fix2star/`：`a_title` / `b_11` / `b_13` / `c_boss`（魔王房，`song=boss`）/
`g_gameover` / `g2_back_to_title` / `k_win` / `j_dist` / `p11_a~c` / `p12_a` / `p13_a,b` / `p14_a,b` /
`z_hero_sheet`（11 姿勢並排）/ `z_hero_*` / `z_boss_zoom`。**每一張都 Read 看過圖。**

### 9. 踩過的坑（給後面的人）

1. **疊在關卡上的文字一定要用「螢幕欄」定位**。`camX % 512 ≥ 256` 時可見畫面落在名稱表 1，
   只寫 nt 0 的固定欄＝寫到看不見的地方（qa2-cruiser 的 P1-2 與本作 P1-1 是同一個坑）。
   另外**進畫面時要把 `camX` 對齊 8 px**，否則下段 split 的 fine scroll 會把文字磚切成半格。
2. **背景裝飾會搶 16×16 屬性區塊**。`PRI` 低的裝飾碰到 `PRI` 高的地形時，**裝飾會被染成地形的調色盤**。
   1-3 的雲海剪影帶放在列 20–21 就會跟浮台共用區塊 → 剪影變純黑方塊。擺裝飾前先看 `r16 = row >> 1` 有沒有撞到別人。
3. **靜默失敗的音訊 API 會藏很久**。加一行 `console.warn` 就立刻抓到 `sfx('die')` 這個從 R2b 一開始就存在、
   但沒有任何測試會紅的 bug。**寧可吵一點。**
4. **裝飾補密要有 `_deco`（只填空格）這種保險**。否則補了 100 多磚裝飾之後，
   沒有人敢保證可達性 / 坑寬測試還是原來那個結果；有了它，177 項測試與機器人幀數可以**一格不差**地對照。

### 10. 契約異動 / 給總控

1. `ST.TILE_COUNT` **38 → 44**（新增 6 個裝飾磚，`solidKind` 全部 `'none'`，舊寫法不會壞）。
2. `ST.SPR_HERO` 58 → **66 磚**、`ST.BG_WORLD` 45 → **52 磚**（都遠低於 128 / 192 上限）。
3. `ST.Audio.KEYS` 多了 `'title'`（9 → 10 首）；`play()` / `sfx()` 未知 key 會 `console.warn`。
4. `GAME.state()` 多兩個欄位：`banner`（目前畫著的字串陣列 / `null`）、`bossMusic`（0 / 1 / 2）。
   `GAME.dev` 多兩個：`screenText(row, screenCol, len)`、`banner()`。
5. **`gameover` 之後按 START 是回標題，不是直接重開**（行為變更，`test_star.py` 已跟著改）。
6. **P3-5 定調照 TASKS 契約的 120 幀**；研究值 168 幀在此註明為**可調**（改 `hero.js` 的 `INV_FRAMES` 一個常數 + 測試期望值一個數字）。

---
# R2 / R2b 總結（總控，2026-09-19）— 兩款遊戲 + 手機觸控 + 兩份研究
- 使用者定調：紅白機專案不限一款遊戲，多款經典深入研究後各自實作、共用 engine/；本輪新增《星塵巡航艦》（宇宙巡航艦風格）並同步完成《星塵勇者》W1。
- **研究**：`03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md`（821 行、49 來源，含 byte-level 逆向手感表）、`11_橫向射擊設計與技術.md`（1233 行、78 來源）；index.html 重建（27 份）。
- **引擎**：`engine/shmup.js` NES.SH（SIN/COS/atan2/aim/aabb/Pool/OAM/Scroller/Spawner，157 項）；`engine/touch.js` NES.Touch（搖桿 + A/B/SELECT/START/全螢幕、浮動、三入口手機縮放，180 項）；`engine/input.js` +`setExternal`（觸控與鍵盤 OR）；`engine/music.js` +slide/detune（103 項，QA R1 P2-7 結案）。
- **《星塵巡航艦》**（cruiser.html、games/cruiser、`CR`）：船 / 能量表 / Option / 雷射 / 飛彈 / 護盾（手感全照研究 §10 原作實測值，qa2 對照 60/61）、關卡 1 三段 12 畫面 + 56 出怪事件 + 紅色單體掉膠囊、魔王「核心要塞」三階段形變、6 曲 9 音效；qa2 3 P1 / 6 P2 → fix2 全修；機器人 `tools/playthrough_cruiser.py` 0 死通關（6468 幀）；test_cruiser 152 / test_stage1 144。
- **《星塵勇者》W1**（star.html、games/star、`ST`）：主角狀態機（手感 12 項與 SMB 常數差 0 幀）、雙向鏡頭、四關（草原 / 洞窟 / 天空 / 城堡）+ 3 敵 + 鐵鎚王（踩頭 / 斧頭 / 旗桿三路）、10 曲 9 音效；qa2-star 1 P1 / 5 P2 → fix2-star 全修（GAME OVER / WORLD CLEAR 文字跨名稱表、標題曲、魔王曲、裝飾密度、主角重畫）；機器人 `tools/playthrough_star.py` 四關 seed 1~3 全 cleared；test_star 158 / test_w1 177。
- **run_all 完整版 17 項全 PASS**（測試合計約 1,500 項）；三入口 build：dist/星塵測試室 271 KB / 星塵勇者 452 KB / 星塵巡航艦 414 KB。
- 已知 / 下一輪候選：cruiser 隕石不可破壞、第二輪難度未做；star 無敵星未放進關卡、受傷無敵 120（研究 168 可調）、旗桿下滑演出；playthrough_star seed 3 脫困迴圈慢；iOS 真機未測；ENGINE_API §16 由 nes-touch 寫、§10 由總控補。
- 中斷紀錄：fix2-cruiser 與 star-world 曾因 Opus 用量上限（20:00 重置）中斷，重置後恢復完成。

---

## fix3-cruiser（R2c）

2026-09-19 ｜ fix3-cruiser agent ｜ 對象：**使用者真機回饋**
「設計太難了。一開始還沒吃到任何武器加強就一堆礁石（撞了會死）。宇宙巡航艦一開始一個關卡前半段是
空曠的宇宙，不會有礁石；會有會飛的小怪物打出來吃加強道具；最後才進到比較多怪物的地方。仔細研究紅白機
宇宙巡航艦。或新增秘技按鈕，上上下下左左右右ABAB 等等作弊。」

擁有並修改：`games/cruiser/{chr_ship, chr_world, main, boss, enemies, stage1, test_cruiser.py, test_stage1.py}`、
`tools/playthrough_cruiser.py`。**`engine/`、三個 `*.html`、其他 `tools/` 一個字都沒動、沒有 git 操作。**

### 0. 驗收總表

| 項目 | 指令 | 結果 |
|---|---|---|
| 全測試 | `bash tools/run_all.sh`（完整） | **17 項全 PASS、總結 PASS**；cruiser 152 → **200**、stage1 144 → **174**（+78 項） |
| 機器人通關（不用秘技） | `$PY tools/playthrough_cruiser.py` | **cleared、死亡 0 次、剩 3 條命、6455 幀（≈ 108 秒）、score 17000**，通關強化 = SPEED 4 + MISSILE + LASER |
| 機器人分段 | `$PY tools/playthrough_cruiser.py --camx 2048` | cleared、0 死、2800 幀 |
| 秘技流程 | `$PY tools/playthrough_cruiser.py --konami` | **29 項全 PASS**（暫停 / 三組指令 / 一次限制 / GAME OVER 續關） |
| 單檔 dist | `$PY tools/build.py --src cruiser.html` | 內嵌 20 檔、缺 0 檔、**426 KB** |
| 截圖 lint | `shots/agent_fix3/*.png` 12 張 | 全 PASS（colors 7~11 / 25、`overLine` 0），每張都 Read 看過圖 |

---

### 1. 關卡 1 重排成三段式（研究 16 §7-1 + 研究 11 §⑯）

總長仍 **3072 px / 384 欄**、捲動 **0.5 px/幀**、檢查點仍 **每 512 px**（camX 0 / 512 / 1024 / 1536 / 2048 / 2560）。

#### 1-1 三段式節奏表（px 範圍 × 事件數 × 膠囊數）

| 段 | camX（px） | 世界欄 | 地形 | 事件 | 敵人組成 | 砲台 | 膠囊上限 | 強度 |
|---|---|---|---|---|---|---|---|---|
| **① 空戰段** | 0 ~ 1280 | 0..191 | **純星空，0 個 solid 磚** | **21**（間隔 6~7 欄 = 96~112 幀） | fan 55（**11 波**）、zig 12（**含 7 隻紅色單體**） | **0** | **18**（11 波全滅 + 7 紅） | 2 → 4 / 10 |
| **② 本關段 A・小行星帶** | 1280 ~ 1712 | 192..247 | 大隕石 11 顆（只貼上 / 下緣）＝ 通道 | 8（間隔 6~8 欄） | **rock 11（可破壞小隕石，新）**、fan 10、zig 3 | 0 | 3 | 5 / 10 |
| **② 本關段 B・星際要塞** | 1712 ~ 2350 | 248..319 | 天花板 / 地板凸起（0..5 列） | 19（間隔 2~6 欄） | fan 20、zig 12、**tank 3（硬殼此時才登場）** | **7 座** | 9 | 6 → 9 / 10 |
| **③ 呼吸 + 魔王段** | 2350 ~ 3072 | 320..383 | 核心室（等高通道，**不變**） | 3（欄 300 / 324 / 332，欄 333~352 完全淨空） | fan 10、zig 1（紅） | 0 | 3 | 1 → 10 / 10 |

- **合計 51 個出怪事件**（R2 是 56，但分布完全不同）；膠囊上限 33 顆，機器人實跑自然掉 11 顆、撿到 9 顆。
- **空戰段實跑 2560 幀，敵彈最高同屏 = 0 發**。規格只要求「640 px 後才開始、密度低」；因為砲台是唯一會開火的雜魚、而空戰段沒有地形可以安裝砲台，實作結果是**整段完全零敵彈**（比規格更寬鬆，測試以此為斷言）。
- fan 的 `y0` 全部收在 **56..128**（正弦 ±20 ⇒ 實占 36..148），上下各留 ≥ 20 px 逃生空間。實測 `fan(144)` 那一波會把玩家壓在畫面底緣 y≈169，機器人在同一點連死 3 次。

#### 1-2 地形（`stage1.js`）

| 項 | R2 / fix2 | fix3 |
|---|---|---|
| RLE 段表 | 24 段；欄 96 起就開始長天花板 / 地板 | **12 段**：`[192,0,0] [56,0,0]` + 要塞斜坡 3 段 + 走廊 6 段 + `[64,3,3]` 核心室 |
| 小行星 | 決定性 LCG 佈點，欄 20..99 散布 30 顆 16×16 + 26 片 8×8 碎片（全部是 solid 地形） | **明碼座標表 `BIG_ROCKS`（11 顆）**，全部在欄 192..246，列只用 **0 / 2（貼上）或 22 / 24（貼下）** |
| 碎片 `DEB0/DEB1` | 背景磚、solid、撞到必死 | **不再佈點**（磚種保留）；改成可破壞的 `rock` 敵人 |
| 通道 | 「天花板 + 地板 ≤ 8 列」保證 18 列，但**沒有把隕石算進去** | 新測試改成量「每一欄最長連續可通行列」（含隕石）⇒ 全關最小 **18 列（144 px）**，最窄點在欄 220（上下各一顆隕石的閘門） |
| 星空 | 只畫到欄 128 | 畫到欄 248（整個空戰段 + 小行星帶） |
| 核心室起點 | 欄 288 | **欄 320**（＝ 世界 2560 px，對齊最後一個檢查點） |

#### 1-3 可破壞小隕石 `rock`（新敵人原型）

| 項 | 值 | 依據 |
|---|---|---|
| 圖 | `W_MROCK0`（完整）/ `W_MROCK1`（裂開）8×8 兩張，**spr3（黑 / 藍 / 白）** | 0 新顏色；hp 2 → 1 時換圖 ＝ 研究 §10-6「每吃一點傷害換一張圖」最便宜的命中回饋 |
| 規格 | `w/h 8`、**hp 2**、**100 分**、`small: true`（吃藍膠囊清屏）、不開火 | 任務指定 |
| 移動 | **−1.0 px/幀**（捲動的兩倍）⇒ 視覺上「迎面飄來」 | [推論] |
| 出現 | 只在小行星帶（事件欄 162 / 177 / 191 / 211，共 11 顆） | 研究 11 §⑯「新元素第一次出現時只有它」 |

#### 1-4 砲台（維持 fix2 的安全規則）

- **7 座**，全部在要塞：世界欄 **250 / 258 / 266 / 274 / 282 / 313 / 318**（地 / 天 / 地 / 天 / 地 / 地 / 天）。
- **每個檢查點之後 22 欄內沒有砲台事件**（fix2 規則，測試照舊）。
- `EASY_PERIOD 130` 的適用範圍由「世界欄 150~300」改成 **248~383**（＝整個要塞）；空戰段 / 小行星帶沒有砲台，所以 `TURRET_PERIOD 90` 只剩 `spawnTest` 用得到。
- **每個復活檢查點（512 起）之後 14 欄內都有紅色單體**（fix2 規則，測試照舊）：欄 74 / 131 / 198 / 258 / 324。

#### 1-5 魔王（唯一一處改動）

`boss.js toDeath()`：**核心爆掉的瞬間清空殘留敵彈**。原本 90 幀的爆炸演出期間先前放出的環形彈還在飛，
機器人實測 **打贏了卻在勝利動畫裡被 (−1.1, 0) 的環形彈打死 ⇒ 回檢查點、魔王滿血重來**（這是「太難」的一個隱形來源）。
魔王的血量 24、攻擊模式、三階段、核心室地形**全部沒動**。

---

### 2. Konami 秘技（研究 16 §9-1 [源]）

#### 2-1 規格

| 項 | 實作 | 依據 |
|---|---|---|
| 暫停 | **START** 在 `play` 模式切換暫停；暫停時**相機 / 自機 / 出怪表 / 敵彈全部凍結**（實測 90 幀後 camX、x、y、`spawner.index` 都不變） | 研究 §7-3「暫停」 |
| 暫停畫面 | 既有的 `drawMsg()` 畫 **`PAUSE`**（列 11，跨兩張名稱表自動分段）；解除時 `clearMsg()` + 新的 **`CR.stage.redraw()`** 還原地形磚與屬性 | fix2 的 P1-2 機制 |
| 指令 | 最近 **12 個按鍵邊緣**的字尾比對，四組任一命中：<br>① `↑↑↓↓←→←→BA`（[源] FC 原版，ROM `$9793`）<br>② `↑↑↓↓←←→→AB`（使用者記憶的變體）<br>③ `↑↑↓↓←←→→ABAB`<br>④ `ABAB`（暫停畫面沒有別的用途，寬容處理） | [源] + 使用者原話 |
| 效果 | **SPEED UP ×1、MISSILE、OPTION ×2、護盾（5 點）**；**不含 DOUBLE / LASER**；不動能量表游標 | [源] §9-1 |
| 次數 | **一場 1 次**；`toStageClear()` 時 `secretLeft++`（每打掉一隻 Big Core 多 1 次） | [源] §9-1 |
| 回饋 | `sfx('powerup')` + 列 15 顯示 **`SECRET!`** 60 幀（1 秒）後自動收回，`PAUSE` 留著 | 任務指定 |
| 收指令的時機 | **只有暫停中與 GAME OVER 畫面**才進緩衝區（遊戲進行中輸入同一串完全無效，已測） | 避免正常操作誤觸 |
| GAME OVER 續關 | 同一組指令 → **3 條命 + 回到 GAME OVER 前的檢查點（`respawn()` 事先記在 `g.continueCam`，魔王戰用 `BOSS_RESPAWN`）**；**分數 / HI 不清**；強化歸零；秘技次數重設為 1。畫面提示維持 `PRESS START`（不明示秘技） | [源] §9-1（`$33 == $0A`） |
| 觸控 | `engine/touch.js` 走 `NES.Input.setExternal`，`poll()` 會 OR 進 `cur` ⇒ **`pressed()` 的邊緣判定對 external 成立**，搖桿方向 + A/B + START 都輸得進來（已用 `setExternal` 實測一整組指令） | engine/input.js |
| 標題 | 加一行小字 **`SECRET CODE IN PAUSE`**（列 18；原本的 `$ 2026 ORIGINAL` 下移到列 21） | 任務可選項，做了 |

#### 2-2 附帶的字型改動

`chr_ship.js` 新增 **`H_EXCL`（驚嘆號）** 與 `CHARMAP['!']`——engine 的 `NES.CHR.DEMO.FONT` 沒有 `!`，
不補的話 `SECRET!` 會畫成 `SECRET `。`CR.BG_HUD` 從 51 磚變 52 磚（`padTo` 補到 64，**佔位數不變**）。

#### 2-3 新的對外欄位（給 QA / 其他 agent）

- `GAME.state()`：`paused`、`secretLeft`、`secrets`、`secretMsg`、`continues`、`continueCam`、`konami`（緩衝區字串）、`lastCode`。
- `CR.konamiBuffer()`、`CR.KONAMI_CODES`。
- `CR.stage.redraw()`：只重畫兩張名稱表（`Scroller.reset(camX)` + budget mute），**不動物件池、不重置出怪指標**。
- `CR.stage`：`AIR_COLS / BELT_COL0 / BELT_COL1 / FORT_COL0 / BOSS_COL0 / BIG_ROCKS`。
- `CR.Enemies`：`SPEC.rock`、`ROCK_VX`、`KINDS` 多了 `'rock'`；`CR.stage.spawnTest('rock', x, y)`。

---

### 3. `tools/playthrough_cruiser.py`

新增 **`--konami`**：不跑通關，改跑「暫停 → 三組指令 → 強化欄位變化 → 一次限制 → GAME OVER 續關」，
逐項印 PASS / FAIL 並存 4 張截圖到 `shots/play_cruiser/konami/`；**29 項全 PASS**。

機器人本身修了 3 個缺陷（都附實測依據）：

| # | 缺陷 | 修法 | 證據 |
|---|---|---|---|
| 1 | **模擬視野是「幀數」不是「距離」**：`HOLD = 24` 幀 × 速度 4（2.5 px/幀）= 60 px，在核心室（天花板 3 列 = y < 24）等於「往上一定撞牆」⇒ 任何向上候選被罰 2.6 萬 | `holdFor(spd) = clamp(40 / spd, 8, 24)`（**固定看 40 px**）⇒ 上下對稱 | 機器人被鎖在 y 86，雷射從 y 88 擦過 y 72..88 的裝甲板下緣，**24000 幀 0 傷害** |
| 2 | **膠囊吸引權重 6 < 對準敵人的 9** ⇒ 寧可繼續瞄敵人也不去接膠囊 | 6 → **14**（無威脅時） | 掉 10 顆只撿到 5 顆 → 掉 15 顆撿到 14 顆 |
| 3 | 瞄準優先序沒有「紅色單體」這一級；魔王戰要 gauge ≥ 4 才肯花 | `e.drop` 排在 fan 之前（人類學到「紅色 = 有獎」也是這樣打）；魔王戰 **gauge ≥ 1 就花掉**；願望清單改 SPEED×2 → MISSILE → **LASER** → OPTION×2（格 4 比格 5 便宜 1 顆） | 空戰段 7 隻紅色單體是「1 發必掉」的保底管道 |

---

### 4. 測試新增

| 檔 | 原 | 現 | 新增內容 |
|---|---:|---:|---|
| `games/cruiser/test_stage1.py` | 144 | **174** | ⑨ fix3 組 30 項：三段分界常數（4）、空戰段 0 個 solid、空戰段只有 fan/zig、fan ≥ 10 波、紅色單體 ≥ 6、實跑 2560 幀 0 敵彈、膠囊上限 16~20、最長可通行列 ≥ 18（含隕石）、大隕石只貼上下緣 / 全在小行星帶、`rock` 規格 7 項、`rock` 只在小行星帶、tank ≥ 欄 214 才登場、魔王爆炸清空敵彈 3 項、`stage.redraw` 2 項。另改判定：③ 分段改成 0-159 / 160-319 / 320+ 並加「魔王前呼吸區 0 事件」、④⑤ 砲台 / solidAt 的取樣點由 `restart(1200)` 改 `restart(2200)`（欄 150 已經沒有地形）、⑧ `turretPeriod` 分區改 248~383 |
| `games/cruiser/test_cruiser.py` | 152 | **200** | ⑫ fix3 組 48 項：START 暫停（6：進暫停 / PAUSE 文字 / 相機・自機・出怪表凍結 / 不自己解除 / 文字蓋掉地形 / redraw 還原 / 續跑）、三組指令 × 7 項（SPEED+1、MISSILE、OPTION×2、護盾 5、無 DOUBLE/LASER、SECRET! 文字、次數 1→0）、SECRET! 1 秒後收回、一次限制 2 項、遊戲進行中無效、**觸控 `setExternal` 也能輸入**、打魔王 +1 次、GAME OVER 續關 9 項（記檢查點 / 回遊戲 / 3 條命 / 不清分數 / 回檢查點 / 強化歸零 / 續關計數 / HUD 重建 / lint 綠）、GAME OVER 按 START 仍回標題 + 標題秘技小字 |

---

### 5. 截圖（`shots/agent_fix3/`，全部 Read 看過、lint 全綠）

| 檔 | 內容 | colors |
|---|---|---:|
| `0_title.png` | 標題（多一行 `SECRET CODE IN PAUSE`） | 3 |
| `1_air_200.png` / `2_air_600.png` / `3_air_1000.png` | 空戰段 200 / 600 / 1000 px：**純星空 + fan 編隊，畫面上一顆礁石都沒有** | 9 / 7 / 7 |
| `4_belt.png` | 小行星帶：大隕石只在上下緣、中央是寬通道，藍色小隕石（可打破）迎面飄來 | 10 |
| `5_fortress.png` | 星際要塞：天花板 / 地板凸起 + fan 編隊 | 11 |
| `6_bossroom.png` | 核心室（不變） | 10 |
| `7_pause.png` / `8_secret.png` | `PAUSE` / `PAUSE + SECRET!`（船上出現護盾括號與 2 顆 Option） | 10 / 10 |
| `9_after_secret.png` | 解除暫停後：文字消失、**地形與星空完整還原**、船帶著護盾繼續跑 | 10 |
| `a_gameover.png` / `b_continue.png` | GAME OVER（score 12300）→ 輸入指令續關：**3 條命、分數保留、回檢查點 1536** | 7 / 9 |
| `shots/play_cruiser/bot/full_end.png` | 機器人 0 死通關的 `STAGE CLEAR` | — |

---

### 6. 給其他 agent / 總控

1. **出怪表的欄號全部重排**：任何硬寫「欄 128 = 要塞入口」「欄 288 = 核心室」的程式碼 / 測試都要改成
   `CR.stage.AIR_COLS / FORT_COL0 / BOSS_COL0`。`?camx=` 的除錯跳關值也要跟著換（1200 現在是空星空）。
2. **`rock` 是第 5 種敵人**（`CR.Enemies.KINDS` 長度由 4 變 5），`spawnTest('rock', x, y)` 可用。
3. **`chr_ship.js` 的 `CR.BG_HUD` 多了 `H_EXCL`**（`!`）。要加字的話 `padTo(..., 64)` 還有 12 格。
4. **START 現在是暫停鍵**（只在 `play` 模式）。任何「按 START 前進」的自動化腳本在遊戲中會變成暫停，
   要改用 `__nes.release()` 或先確認 `GAME.state().paused`。
5. 未動、留給下一輪：第二輪（loop）難度、魔王逾時自爆（研究 §21.2-A 的 180 秒撤退目前沒做）、
   `rock` 目前不掉膠囊（要的話改 `{drop:1}` 即可）。
