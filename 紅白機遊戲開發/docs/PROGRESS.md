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
