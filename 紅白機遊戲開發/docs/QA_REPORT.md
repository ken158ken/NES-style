# QA 報告

# R1 驗收（qa1）

> 驗收日期：2026-09-17 ｜ agent：qa1（獨立驗收）
> 原則：**不信任任何 agent 的自述**，所有數字都是 qa1 自己重跑 / 重量測的結果；**未改動任何程式**（只新增本檔與 `shots/agent_qa1/*`）。
> 環境：`../卡比之星/.venv/bin/python`（Playwright / Chromium headless）、`node --check`、專案根目錄 `紅白機遊戲開發/`。
> 驗收依據：`docs/PLAN.md` §1（還原標準表）與 §4（R1 完成定義：lint 全過 / APU 渲染 wav 頻譜驗證 / 60fps 穩定 / debug API 可用）、`docs/TASKS.md` §API 契約、`docs/ENGINE_API.md`。

---

## R1-0 結論

**通過，可以進 R2。** 阻擋級（P0）問題 **0 件**。

| R1 完成定義（PLAN §4） | qa1 實測 | 判定 |
|---|---|---|
| lint 全過 | `tools/nes_lint.py` 對 qa1 自己拍的 8 張圖 **8/8 PASS**（64 色內、最高 13/25 色、整數 3 倍放大方塊同色、與 `engine/palette.js` 64/64 一致）；`__nes.lint()` 每次 `ok:true, badPixels:0` | ✅ |
| APU 渲染 wav 頻譜驗證 | `tools/apu_render.py --seconds 10` 產 16 個 wav、**18 項頻譜檢查全過**；qa1 另做獨立驗證：44,100 個取樣點的瞬時輸出與 `mix(五聲道 out)` 誤差 ≤ **2.06e-8**（＝波形只含五聲道成分） | ✅ |
| 60fps 穩定 | 非 debug `dist/星塵勇者.html` 10.5 秒實測 **rAF 60.05 fps / 邏輯 60.15 fps / dropped 0**；update+draw+ppu.render 平均 **0.744 ms**、p95 1.1 ms、max 3.0 ms（幀預算 16.7 ms 的 4.5%） | ✅ |
| debug API 可用 | `__nes` 的 `step/press/tap/release/render/state/frame/lint/stats` 逐一實際呼叫，回傳全部合理 | ✅ |
| 全測試 | `bash tools/run_all.sh` **全 PASS**；單獨重跑 **apu 57 / chr 84 / core 90 / ppu 127 / demo 40 = 398 項，0 失敗**；`node --check` **14/14 OK**；0 console error / 0 pageerror | ✅ |
| 原創性 | `engine/` + `games/` + `game.html` 內**沒有任何**外部圖檔 / 音檔 / ROM 引用（0 筆 `data:image`、`.png`、`.wav`、`.nes`、`http(s)://`、`atob(`、`new Image`）；任天堂 IP 名稱命中 **0 筆** | ✅ |

**問題統計：P0 = 0 ｜ P1 = 7 ｜ P2 = 8。**
P1 全部是「R2 開工前必須定案 / 補上」的項目，不影響 R1 交付本身。

---

## R1-1 問題列表

### P0（阻擋進 R2）
**無。**

### P1（應修 — 建議 R2 開工前處理）

| # | 問題 | 影響 | 重現指令 / 證據 | 建議負責 |
|---|---|---|---|---|
| P1-1 | `tools/run_all.sh` 的測試 glob 只有 `tools/test_*.py`，**抓不到 `games/demo/test_demo.py`**（40 項） | 「一鍵跑全部測試」實際上不涵蓋遊戲層，R2 改 engine 造成的遊戲層回歸不會被 run_all 抓到 | `grep -n "for t in tools/test_\*.py" tools/run_all.sh`（第 60 行）；`bash tools/run_all.sh` 的結果表沒有 test_demo 這一列 | tools |
| P1-2 | `ppu.render()` 內部會前進 OAM 輪替指標（`engine/ppu.js:408`），因此 `__nes.render()`（文件寫「重畫一幀但**不推進**邏輯」）會換一批精靈 ⇒ **截圖不可重現** | `tools/shot.py` 每次截圖前都呼叫 `__nes.render()`；任何沿用 PPU 預設 `flicker='rotate'` / `flickerStep=8` 的遊戲，截到的畫面與該邏輯幀實際畫的不同 | 連續 3 次 `render()`（完全不推進邏輯）得到 3 組不同精靈：`{"r1":{"drawn":"111111110000","oamStart":8},"r2":{"drawn":"111100001111","oamStart":16},"r3":{"drawn":"111111110000","oamStart":24}}`；重現腳本見「R1-2 §3」 | ppu |
| P1-3 | `NES.FX.addVel` 簽章與 `docs/TASKS.md` §API 契約不符 | R2 主角物理實作前若不定案，兩種寫法混用會踩到全域 `NES.FX.frac` 被多實體污染 | 契約：`addVel(posSub, v88) → {pos, frac}`；實測：`NES.FX.addVel(0,384,0)` → `24`（number），餘數在 `NES.FX.frac`。`ENGINE_API` §3/§14 D1 已記實作版，TASKS.md 未更新 | core（＋總控裁定） |
| P1-4 | **短按跳高度兩套規則並存**：`tools/test_core.py` 量到 16.31 px（起跳首幀就用大重力），`games/demo` 量到 **19.125 px**（照 `DiffToHaltJump`，離地 ≥1 px 才切大重力） | 同一引擎兩個不同答案，R2 主角狀態機一定要挑一個；研究文件是 ≈18 px | qa1 實測 demo：`{"jumpShort":{"y0":184,"apexPx":164.875,"height":19.125,"airFrames":18}}`（重現見 R1-2 §4） | core + demo（R2 手感 agent） |
| P1-5 | 長按跳 **62.00 px**（文件 64 = 4 格）、全速跳 **77.50 px**（文件 80 = 5 格），各短 2 / 2.5 px | 純數值差在 ±1 幀容差內（接近頂點速度趨近 0），但**關卡若設計「剛好 4 格牆 / 5 格牆」會跳不過去** ⇒ R2 關卡設計前必須定案是否在起跳首幀略過一次重力 | `{"jumpLong":{"height":62}}`、`{"jumpRunFull":{"height":77.5,"distance":150}}`（重現見 R1-2 §4） | core + 關卡 agent |
| P1-6 | `timing.budget.use()` **全專案零呼叫** ⇒ 「VBlank 只能寫 ~160 byte」目前完全不是限制 | PLAN §1「節奏」列的還原標準有一條沒有真正生效（`budgetOver` 恆為 `false`，就算 demo 每幀寫 39 byte 名稱表 + 256 byte OAM 也一樣） | `grep -rn "budget.use" engine/ games/ \| grep -v cpu_timing.js` → **0 筆**；`__nes.stats().budgetOver` 在 868 幀跑動後仍為 `false` | ppu（在 `setTile/setAttr/sprite` 內呼叫）＋ core |
| P1-7 | `docs/ENGINE_API.md` §14 的 **D2 / D3 已經被修好，但文件仍寫「抓不到 / 完全跑不動」** | 文件與實作不符，R2 agent 會照舊文件繞路（例如自己去讀 `ppu.stats.overLines`、自己實作 OAM 檢視） | 實測 D2 已好：`__nes.lint().overLine` 回 32 條掃描線 `[176..207]`；實測 D3 已好：`NES.Lint.oam(ppu)` 回 `{"ok":true,"count":28,"maxLine":14,"overLine":[...],"spriteHeight":16}`。重現：`../卡比之星/.venv/bin/python tools/shot.py --script "tap start 1; step 2; press b,right 860; release; step 3" --lint --out shots/agent_qa1/x.png` | tools |

### P2（可延後）

| # | 問題 | 重現 / 證據 | 建議負責 |
|---|---|---|---|
| P2-1 | `__nes.setScale(s)` 只改 canvas backing store，**不連動 `game.html` 的 `place()`（CSS 寬高）** ⇒ 呼叫後畫面被 CSS 縮放，`page.screenshot()` 取到的是有平滑的圖 | 在 `?debug=1&scale=1` 下 `__nes.setScale(3)` 後：`{"canvasW":768,"canvasH":672,"scale":3,"smoothing":false,"cssW":"256px","cssH":"224px"}`（backing 768 被塞進 256 CSS px）。不影響 `tools/shot.py`（它自己放大 backing store），也不影響正常遊玩 | tools |
| P2-2 | `__nes.frame()` 回傳 **PNG data URL**，但 `state().frame` / `stats().frame` 是**幀號** ⇒ 同名不同義 | `__nes.frame()` → `"data:image/png;base64,iVBOR..."`；`__nes.state().frame` → `15`。`ENGINE_API` §11 有寫清楚，但 `TASKS.md` 契約只寫 `frame()` | tools（建議改名 `snapshot()` 或在 TASKS 註明） |
| P2-3 | **精靈 0 命中未實作**：狀態列分割一律用 `split(scanline)` 明指掃描線 | `grep -n "sprite0\|spriteZero" engine/ppu.js` → 0 筆；`games/demo/room.js` 用 `ppu.split(32, …)`。功能等價（等同 MMC3 IRQ），但不是 PLAN §1 寫的「模擬 sprite 0」 | ppu（R2/R3） |
| P2-4 | `NES.CHR.DEMO.spr` 是 8×8 切片，**8×16 精靈模式不能直接用**，demo 只好自己用 `tile16()` 重建 `demo_spr16` | `games/demo/chr.js` 重建了 20 磚的 `demo_spr16` bank；`engine/chr.js` 只匯出 8×8 版 | chr-lint（附一份 `DEMO.spr16` + 檔頭寫明 OAM 要填 `index \| 1`） |
| P2-5 | `file://` 下即時播放退回 ScriptProcessor（Chromium 不允許 blob worklet） | `engine/apu.js` 檔頭已註明；`NES.APU.WORKLET_SRC` 已匯出，但沒有一份真實 `.js` 可傳給 `{workletUrl}` | apu + tools |
| P2-6 | `tools/nes_lint.py` 分不出 `$0D` / `$0F`（RGB 都是 `#000000`），截圖層抓不到禁用色 | `ENGINE_API` §14 D6；只能靠 `engine/nes_lint.js` 的 `ppu.indexFrame` 路徑（已實作且 qa1 實測有效：`indexList` 直接回 `$22 $30 $21 $0F …`） | chr-lint（已知限制，維持現狀即可） |
| P2-7 | `music.js` 沒有滑音（`1xx/2xx/3xx/Qxy`）與 detune（`Pxx`） | `engine/music.js` 效果欄只有 `arp / vib / duty / cut`；R2 要做「回音軌自動 detune」時會缺 | apu |
| P2-8 | `games/demo/test_demo.py` 單次約 40 秒（重載頁面 8 次），沒有平行化 | qa1 實測整輪 ≈ 40 s；`bash tools/run_all.sh` 整輪 ≈ 3 分 | demo / tools |

---

## R1-2 逐項明細與數字

### 1. 全測試重跑

```
bash tools/run_all.sh                                       → 總結：PASS
../卡比之星/.venv/bin/python tools/test_apu.py              → 總計 57 項，通過 57，失敗 0
../卡比之星/.venv/bin/python tools/test_chr.py              → 共 84 項測試，PASS 84，FAIL 0
../卡比之星/.venv/bin/python tools/test_core.py             → core 測試：90 項，通過 90，失敗 0
../卡比之星/.venv/bin/python tools/test_ppu.py              → 總計 127 / 127 通過（render 平均 0.578 ms/幀）
../卡比之星/.venv/bin/python games/demo/test_demo.py        → demo 測試：40 項，通過 40，失敗 0
```

| 測試檔 | 項數 | 結果 | 是否被 run_all 涵蓋 |
|---|---:|---|---|
| `tools/test_apu.py` | 57 | PASS | ✅ |
| `tools/test_chr.py` | 84 | PASS | ✅ |
| `tools/test_core.py` | 90 | PASS | ✅ |
| `tools/test_ppu.py` | 127 | PASS | ✅ |
| `games/demo/test_demo.py` | 40 | PASS | ❌ **（P1-1）** |
| **合計** | **398** | **0 失敗** | |

`node --check`（qa1 自己逐檔跑）：`engine/*.js` 10 檔 + `games/demo/*.js` 4 檔 = **14/14 OK**。

`tools/run_all.sh` 結果表（qa1 這次重跑）：node --check(14 檔) PASS ／ test_apu PASS ／ test_chr PASS ／ test_core PASS ／ test_ppu PASS ／ build --check PASS ／ shot.py 冒煙 PASS ／ nes_lint.py 抽查(8 張) PASS。

### 2. PPU 還原標準（≥ 6 張自拍截圖 + 逐像素 lint）

qa1 自己用 `tools/shot.py` / 自寫 Playwright 腳本拍了 **9 張**（8 張 NES 原生畫面 + 1 張 dist 整頁），每張都用 Read 看過圖，並跑：

```
../卡比之星/.venv/bin/python tools/nes_lint.py --scale 0 --status-rows 32 \
    --palette engine/palette.js --json - shots/agent_qa1/qa_0N_*.png
```

| 截圖 | 尺寸 / 放大 | 色數 | 非法像素 | 分區（狀態列 / 遊戲區） | lint |
|---|---|---:|---:|---|---|
| `qa_01_title.png` | 768×672 → 原生 256×224，**放大 3 倍** | 10/25 | 0 | 2 色 / 10 色 | PASS |
| `qa_02_run.png` | 同上 | 10/25 | 0 | 2 / 10 | PASS |
| `qa_03_jump.png` | 同上 | 10/25 | 0 | 2 / 10 | PASS |
| `qa_04_flicker_f1.png` | 同上 | 13/25 | 0 | 2 / 13 | PASS |
| `qa_04_flicker_f2.png` | 同上 | 13/25 | 0 | 2 / 13 | PASS |
| `qa_05_hud_score.png` | 同上 | 13/25 | 0 | 2 / 13 | PASS |
| `qa_06_level_end.png` | 同上 | 12/25 | 0 | 2 / 12 | PASS |
| `qa_07_split_status.png` | 同上 | 11/25 | 0 | 2 / 11 | PASS |
| `qa_08_bgalign.png` | 同上 | 11/25 | 0 | 2 / 11 | PASS |

- **64 色內**：9/9 全部「非法像素 0」；`nes_lint.py` 內建 64 色表與 `engine/palette.js` **逐格比對一致（64/64）**。
- **≤ 25 色**：最高 13 色（敵人房），距上限還有 12 色餘裕。
- **整數放大無平滑**：`nes_lint.py --scale 0` 自動偵測到 3 倍，並驗每個 3×3 方塊同色 → 全過。引擎端交叉確認：`ctx.imageSmoothingEnabled === false`、`canvas.style.imageRendering === "pixelated"`、canvas 768×672 = 256×224×3。
- **狀態列分割線乾淨（無撕裂 / 錯位）**：在遊戲區捲動 37 幀的前後，對 y=0..31 這 8192 個像素逐點比對 ——
  `{"count":17, "xRange":[201,205], "yRange":[16,22], "timeBefore":386, "timeAfter":384}`
  ⇒ 只有 **17 個像素**變動，且全部落在 x 201–205 / y 16–22（＝ TIME 的個位數字），**分割線兩側完全沒有位移或撕裂**。Read 看圖也確認 y=32 上下邊界一刀切齊。
- **8×8 對齊**：清掉精靈後掃描地形頂緣 → `allMultipleOf8: true`（地面 / 高台頂緣座標全為 8 的倍數）；屬性以 16×16 區塊上色（Read 看圖：地面 / 草地色塊邊界都落在 16px 網格）。精靈座標全為整數像素（`nonIntegerCoords: 0`）；精靈本來就不受 8px 網格限制（OAM X/Y 是逐像素），故不列為違規。

### 3. 精靈（同線 > 8 只畫 8、8×16 拼接）

**（a）每掃描線上限 8** — 在敵人房（12 隻敵人分兩條掃描線帶 + 主角），qa1 自己依 NES 規則（同線取 OAM 索引前 8 個）重算：

```
{"oam":28, "spriteHeight":16,
 "maxRequestedPerLine":14, "maxDrawnPerLine":8, "overLineCount":32,
 "ppuStats":{"maxSpritesLine":14, "flickered":32, "dropped":176, "overLineLen":32},
 "sampleLine192":[0,1,4,5,6,7,8,9]}
```

⇒ 同一掃描線**要求 14 個、實際只畫 8 個**，32 條掃描線超線、共丟棄 176 個「精靈×掃描線」。

**（b）兩連幀數精靈（逐像素，用敵人專屬色 `$38`）**：

| 幀 | 畫面上的敵人 | 實際被畫出的敵人 id |
|---|---:|---|
| f1 | 12 | `[2,3,4,8,9,10,11]` = **7 隻** |
| f2 | 12 | `[5,6,7,8,11,12,13]` = **7 隻** |
| f3 | 12 | `[2,3,4,8,9,10,11]`（＝ f1，週期 2、穩定） |

兩幀聯集 `[2,3,4,5,6,7,8,9,10,11,12,13]` = **12 隻全到齊** ⇒ 真機式閃爍成立。
Read 看 `qa_04_flicker_f1/f2.png` 也看得到「上半身有、下半身被切掉」的半隻敵人 —— 那正是逐掃描線丟棄（同一隻敵人跨兩條掃描線帶，上 8 列畫得下、下 8 列畫不下）的正字標記。

**（c）8×16 主角四塊拼接無縫** — OAM 0..3 = `(65,184) (73,184) (65,200) (73,200)`、`spriteMode()===16`：
- 垂直接縫（x0+7 / x0+8 兩欄）逐列比對：**不匹配 0 列**，兩欄輪廓字串完全相同 `XXXXXXXXXXXXXXXXXX......XXXXXXXX`。
- 水平接縫（y0+15 / y0+16）：2 欄差異，但那是**輪廓收窄**（`..XXXXXXXXXXXX..` → `...XXXXXXXXXX...`），不是空隙 —— 32 列輪廓圖中**沒有任何一列是整列空白**。
⇒ 拼接無縫。

### 4. 手感（qa1 自己透過 `__nes` 量測，對照 `docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md`）

| 項目 | qa1 實測 | 研究文件 | 差 | 判定 |
|---|---:|---:|---|---|
| 靜止 → 跑步上限 | **45 幀** | 45 幀（228/256 ≈ 0.891 推算） | ±0 | ✅ PASS |
| 靜止 → 走路上限 | **41 幀** | 40 幀（152/256 ≈ 0.594 的連續除法 40.4） | +1 | ✅ PASS（±1 內，整數累加取整差） |
| 跑步上限速度 | **640 vel = 2.5 px/幀** | `$28` = 2.5 px/f | ±0 | ✅ |
| 走路上限速度 | **384 vel = 1.5 px/幀** | `$18` = 1.5 px/f | ±0 | ✅ |
| 短按跳（點 1 幀 A） | **19.125 px**（滯空 18 幀） | ≈18 px（1.1 格） | +1.1 px | ⚠️ PASS 但見 P1-4（core 量到 16.31 px） |
| 長按跳（靜止起跳） | **62.00 px**（滯空 17 幀 + 上升段） | 64 px（4 格） | −2.0 px | ⚠️ PASS 但見 P1-5 |
| 長按跳（全速起跳） | **77.50 px** | 80 px（5 格） | −2.5 px | ⚠️ PASS 但見 P1-5 |
| 跑跳水平距離（全速） | **150 px**（≈ 9.4 格磚） | 文件未列 | — | ℹ️ 記錄用 |
| 無敵幀 | **60 幀**（受傷當幀 `inv=60`，逐幀遞減到 0 恰 60 幀；期間 OAM 2 幀顯示 / 2 幀隱藏） | 任務指定 60（SMB 原版 168 = 8×21） | ±0 | ✅ PASS（本 demo 照任務指定，非 SMB 原值） |
| 輸入延遲 | 按下後**第 1 幀** update 速度就改變（`vx: 0 → 9 → 19 → 28 …`） | 「輸入延遲 1 幀」（每幀一次取樣 → 當幀邏輯 → 下次 VBlank 顯示） | ±0 | ✅ PASS |
| TIME 節拍 | 每 **21 幀** −1（實測 37 幀內 386→384） | `IntervalTimerControl` 21 幀 framerule | ±0 | ✅ |
| 相機起捲點 | `screenX = 102`（= 256×40%），往左走相機不動（單向鎖） | 256 × 40% = 102.4 | ±0 | ✅ |

重現（皆為 `game.html?debug=1` + `__nes`，不改任何 engine 檔）：

```js
// 跑步加速幀數
__nes.tap('start',1); __nes.step(2);
for (let i=0;i<90;i++){ __nes.press(['b','right'],1); /* 記錄 GAME.state().vx，首次 >= 640 的 i+1 */ }
// 短按跳
__nes.tap('start',1); __nes.step(2); const y0=GAME.state().y;
__nes.tap('a',1); while(!GAME.state().onGround) __nes.step(1);   // y0 - GAME.state().apexPx
// 無敵幀
while(GAME.state().hits===0) __nes.press(['right'],1);           // inv 從 60 逐幀遞減
```

### 5. APU

**（a）離線渲染**（qa1 自己重跑，輸出到獨立目錄避免覆蓋 apu agent 的檔）：

```
../卡比之星/.venv/bin/python tools/apu_render.py --seconds 10 --out-dir shots/agent_qa1/apu
→ 16 個 wav；頻譜檢查 18 項，通過 18，失敗 0
```

`demo_song.wav` 10.00 s（RMS 0.0870、峰值 0.5333 不削波、低/中/高三段都有能量）；`sfx_jump.wav`（峰值 0.4084）、`sfx_coin.wav`（1.20 s、峰值 0.3917）。

**（b）「頻譜只含五聲道成分」— qa1 的獨立驗證**
既有的頻譜檢查是「峰值頻率對不對」，證明力不足以說「只有五聲道」。qa1 改做**恆等式驗證**：關掉濾波後逐點取樣 3 秒的 demo 曲（期間另觸發 `jump` / `coin`），比對「APU 瞬時輸出」與「用五個聲道的 `out` 重算的 `NES.APU.mix()`」：

```
{"samples":44100, "maxAbsErr":2.06e-08, "distinctOutputLevels":1154,
 "channelRanges":{"p1":[0,15,6],"p2":[0,12,13],"tri":[0,15,16],"noi":[0,13,13],"dmc":[0,0,1]}}
```

⇒ 44,100 個取樣點，輸出與 `mix(p1.out, p2.out, tri.out, noi.out, dmc.out)` 的最大絕對誤差 **2.06×10⁻⁸**（＝查表 vs 公式的浮點捨入）。**波形是五個聲道輸出的純函數，沒有第六個成分。**（demo 曲沒有 DMC 軌，dmc 恆 0，與 song 編制一致。）

**（c）三角波無音量變化**

```
A-2(timer 509) 峰峰值 0.246412 ｜ A-3(timer 254) 0.246412 ｜ C-4(timer 213) 0.246412  → 差異 0.000%
瞬時輸出位準集合 = [0,1,2,…,15]（16 個位準 = 32 階梯波）
```

⇒ 三個音高峰峰值**完全相同**，三角波確實沒有音量暫存器。

**（d）sfx 搶聲道 + 結束復原**（driver 狀態 + 暫存器/波形逐幀對照）

| 階段 | p2 擁有者 | APU pulse2 timer 逐幀 |
|---|---|---|
| sfx 前 12 幀（純音樂） | `null` ×12 | `507,427,338, 507,427,338, 507,427,338, 507,427,338`（琶音循環） |
| `sfx('jump')` 後 20 幀 | `jump` ×**10**，之後 `null` ×10 | `253,201,169,126,100,84,63,63,63,63`（兩個八度上滑）→ `338,507,427,338,507,427,338,507,427` |
| sfx 後 12 幀 | `null` ×12 | `338,507,427,338,507,427,338,507,427,338,507,427`（**與 sfx 前的琶音完全相同**） |

- 音效期間 **p1 / tri / noi / dmc 四軌的 `owned` 全部為 `false`** ⇒ 只搶了 p2，其餘音樂軌不受影響。
- sfx 結束後 `playing: true`、pattern 繼續往前走（`row` 持續推進）⇒ **音樂沒有停、聲道正確歸還**。
- 優先權：`sfx('jump')`（priority 5）→ p2 owner = `jump`；緊接著 `sfx('coin')`（priority 6）→ p2 owner = **`coin`** ⇒ 高優先權搶佔成立。

wav 路徑：`shots/agent_qa1/apu/*.wav`（16 個）。

### 6. 效能（非 debug `dist/星塵勇者.html`）

先 `../卡比之星/.venv/bin/python tools/build.py` → `dist/星塵勇者.html`（189 KB，內嵌 14 檔、缺 0 檔）。
Playwright 開單檔（`file://`，1024×768，非 debug ⇒ Timing 自動跑）、按 Enter 進遊戲、注入方向鍵讓主角持續全速跑（壓力狀態），量 10.5 秒：

| 指標 | 數值 | 目標 | 判定 |
|---|---:|---|---|
| rAF 計數 fps | **60.05**（631 次 / 10.508 s） | 60 | ✅ |
| 邏輯幀 fps | **60.15**（632 幀 / 10.508 s） | 60.0988 | ✅ |
| 丟幀 `timing.dropped` | **0** | 0 | ✅ |
| `GAME.update` | 平均 0.0445 ms（p95 0.1 / max 0.2） | — | ✅ |
| `GAME.draw` | 平均 0.0168 ms（p95 0.1 / max 0.2） | — | ✅ |
| `ppu.render` | 平均 0.6829 ms（p95 1.0 / max 2.8） | < 4 ms | ✅ |
| **update + draw + render 合計** | **平均 0.744 ms**（p95 1.1 / max 3.0） | < 16.7 ms | ✅ **餘裕 22 倍** |
| console error / pageerror | **0 / 0** | 0 | ✅ |

10 秒內主角從 x=32 跑到 x=1512（camX 1410），全程 60 fps 不掉幀。截圖：`shots/agent_qa1/qa_09_dist_60fps.png`（1024×768 視窗自動 3 倍置中）。

### 7. debug API（每個實際呼叫一次）

`__nes` 實際鍵：`step, press, tap, release, render, state, frame, lint, stats, nes, setScale, missing, version`

| 呼叫 | 回傳 / 效果 | 判定 |
|---|---|---|
| `__nes.step(3)` | frame 0 → 3，回傳 3 | ✅ |
| `__nes.press(['right'],5)` | `vxPx` 0 → 0.1836（速度確實累加），回傳 frame | ✅ |
| `__nes.tap('a',1)` | y 184 → 173、`onGround:false`（確實起跳） | ✅ |
| `__nes.release()` | 回 `true`，下一幀 inject 遮罩清空 | ✅ |
| `__nes.render()` | 回 `true`，重畫一幀 | ⚠️ 會前進 OAM 輪替指標（P1-2） |
| `__nes.state()` | 物件、30 個鍵、含 `x`、`frame:15`、`stats` | ✅ |
| `__nes.frame()` | `data:image/png;base64,iVBORw0KGgo…`（PNG data URL） | ⚠️ 與 `state().frame`（幀號）同名不同義（P2-2），但與 `ENGINE_API` §11 一致 |
| `__nes.lint()` | `{ok:true, colors:10, badPixels:0, overLine:[], colorList:[#000000…], indexList:["$22","$30","$21","$0F",…], oam:{ok:true,…}}` | ✅ |
| `__nes.stats()` | `{frame, hz:60.0988, colors, maxSpritesLine, flickered, budgetOver:false, scale, missing:[], stub:{全 false}}` | ✅ |

`missing: []`、`stub` 全 `false` ⇒ 10 個 engine 模組全部到位，沒有走 stub 路徑。

### 8. 契約核對（抽 30 項 `ENGINE_API.md` 記載的函式實際呼叫）

實測 **30/30 全部可呼叫且回傳與文件一致**（完整輸出見下）：

```
OK  NES.PALETTE.length            => 64
OK  NES.PALETTE.rgb(0x21)         => [60,188,252]
OK  NES.PALETTE.FORBIDDEN         => [13]                     (= $0D)
OK  NES.PALETTE.nearest(255,0,0)  => 22
OK  NES.FX.SUB                    => 16
OK  NES.FX.toSub(3)/toPx(48)/floorPx(-1) => [48, 3, -1]
OK  NES.FX.v88(1,128)             => 384                       (= 1.5 px/f)
OK  NES.FX.addVel(0,384,0)        => 24 (number), NES.FX.frac=0   ← 與 TASKS 契約不同（P1-3）
OK  NES.Input.BTN                 => {A:1,B:2,SELECT:4,START:8,UP:16,DOWN:32,LEFT:64,RIGHT:128}
OK  NES.Input.mask/held/pressed/released => [0,false,false,false]
OK  NES.Input.inject(m,f)         => 回傳自身（object，可鏈式）
OK  NES.Timing.create(...)        => [frame,hz,mode,running,dropped,budget,start,stop,step,setMode,setHz,stepMs,setCallbacks,reset]
OK  timing.step(3)                => 3（frame 同步為 3）
OK  NES.CHR.tile(rows).length     => 64
OK  NES.CHR.bank(...)             => [name,tiles,count,names,index,has]
OK  NES.CHR.get(0,0).length       => 64
OK  ppu.setTile/getTile           => 7
OK  ppu.setAttr/getAttr           => 2
OK  ppu.scroll/getScroll          => {x:8,y:0,nt:0}
OK  ppu.spriteMode()/ppu.oam      => {mode:16, oamLen:64}
OK  ppu.stats 鍵                  => [colors,maxSpritesLine,flickered,dropped,overLines,overLine,sprites,ms,frames]
OK  ppu.render()                  => 回傳 ppu 自身；ppu.frame.length = 245760 (=256×240×4)
OK  NES.Lint.frame(ppu)           => {ok:true, colors:11, badPixels:0, overLine:[], …}
OK  NES.Lint.oam(ppu)             => {ok:true, count, maxLine, overLine, offscreen, hidden, spriteHeight, flicker, errors}
OK  NES.APU.create().write/render => Float32Array, len 1000
OK  apu.tick()                    => Float32Array, len 733（≈ 44100/60.0988）
OK  NES.APU.mix(0,0,0,0,0)        => 0
OK  NES.Music.create(apu)         => driver（apu,song,playing,speed,orderIndex,row,…）
OK  NES.Music.play/stop/sfx/tick/define => 全部 function
OK  NES.VERSION / NES.boot        => ["0.1.0", "function"]
OK  NES.W/H/VISIBLE_H/HZ          => [256, 240, 224, 60.0988]
```

**不一致清單：**

| 項目 | 文件（TASKS.md 契約） | 實作 | 備註 |
|---|---|---|---|
| `NES.FX.addVel` | `(posSub, v88) → {pos, frac}` | `(posSub, v, frac) → number`，餘數在 `NES.FX.frac` | **P1-3**；`ENGINE_API` §3/§14 D1 已改記實作版，但 `TASKS.md` §API 契約仍是舊寫法 |
| `ENGINE_API` §14 D2 | 「`Lint.frame().overLine` 永遠是空的」 | **已修好**：`overLine` 與 `overLines` 是同一陣列參照，實測回 32 條線 | **P1-7** 文件過期 |
| `ENGINE_API` §14 D3 | 「`Lint.oam(ppu)` 完全跑不動」 | **已修好**：`ppu.oam` 已公開，`Lint.oam()` 回 `{ok:true,count:28,…}` | **P1-7** 文件過期 |
| `__nes.frame()` | TASKS 只寫 `frame()`，`ENGINE_API` §11 寫「base64 PNG」 | PNG data URL | **P2-2**；實作與 `ENGINE_API` 一致，與 TASKS 的字面直覺不同 |
| `NES.Music.play/stop/sfx/tick` | 模組級直接可用 | 需先 `NES.Music.attach(apu)`（`NES.boot` 會自動做） | `ENGINE_API` §14 D5 已記，實測相符 |
| `timing.budget` | `{set, use, over}` 模擬 VBlank 預算 | API 齊全但**沒有任何呼叫端** | **P1-6** |

其餘差異（`ppu.stats` 多欄位、`CHR.tile16/slice/DEMO`、`FX.SMB`、`APU.clock/state`、`Music.DEMO/state`…）皆為契約的**超集**，`ENGINE_API` §14 D7 已載明，不衝突。

### 9. 原創性

| 檢查 | 指令 | 結果 |
|---|---|---|
| 外部圖檔 / 音檔 / ROM 引用 | `grep -rnE "data:image\|data:audio\|\.png\|\.jpe?g\|\.gif\|\.wav\|\.mp3\|\.ogg\|\.nes\|\.chr\|\.nsf\|\.bmp" engine/ games/ game.html` | **0 筆**（`.NES` / `.CHR` 是命名空間成員，`fetch(` 是 DMC 的取樣讀取方法，`Audio(` 是 `AudioContext` / `connectAudio`） |
| base64 內嵌資產 | `grep -rnE "[A-Za-z0-9+/]{120,}={0,2}" engine/ games/ game.html` | **0 筆** |
| 網路資源 | `grep -rnE "https?://" engine/ games/ game.html`（排除註解裡的來源網址） | **0 筆** 載入用 URL |
| 任天堂 IP 名稱 | `grep -rniE "mario\|luigi\|bowser\|goomba\|koopa\|zelda\|samus\|metroid\|kirby\|nintendo\|megaman\|castlevania\|contra\|pokemon\|tetris" engine/ games/ game.html` | **0 筆** |
| dist 單檔 | `grep -coE "data:image\|data:audio\|https?://cdn" dist/星塵勇者.html` | **0** |

- 美術：主角《星塵勇者》（`HERO_TOP` / `HERO_LEGS0-2`）、敵人「石頭蟲」（`ENEMY_ART`）、地形 12 磚、5×7 字型 55 磚 —— 全部是 `engine/chr.js` 內的文字格式 8×8 2bpp 手繪資料，qa1 已用 Read 看圖確認造型為「黑髮 / 橘色上衣的通用小人」與「褐色圓形甲蟲」，**不影射任天堂角色**。
- 音樂：`NES.Music.DEMO`《星塵序曲》A 小調 8 小節 + 2 個原創音效，全部是 `engine/music.js` 內的 pattern 資料。
- 唯一與既有商品的關聯是 **`NES.FX.SMB` 常數表與註解**（走 2.5/1.5 px/f、雙重力、21 幀 framerule 等反組譯數字，共 33 處提及），來源標註為 `docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md` / SMBDIS.ASM。這些是**機制與物理參數**（不是可著作權的素材），與 PLAN「機制與手感忠實還原、素材一律原創」的定位一致；使用者可見字串中沒有任何他人 IP。

---

## R1-3 截圖索引

全部在 `shots/agent_qa1/`（`shots/` 已在 `.gitignore`）。每張都由 qa1 自己拍、自己用 Read 看過圖、自己跑過 `nes_lint.py`。

| 檔案 | 狀況 | 重現指令 | lint |
|---|---|---|---|
| `qa_01_title.png` | 標題畫面（STARDUST HERO / DEMO ROOM R1 / PRESS START）+ 狀態列 + 主角站在起點 | `shot.py --steps 2 --scale 3 --lint --out shots/agent_qa1/qa_01_title.png` | 10 色 PASS |
| `qa_02_run.png` | 全速跑步（B+右 80 幀），主角固定在畫面 40%、背景已捲動 | `shot.py --script "tap start 1; step 2; press b,right 80" --scale 3 --lint` | 10 色 PASS |
| `qa_03_jump.png` | 跑跳滯空（B+右 60 幀 → B+右+A 18 幀），離地約 67 px | `shot.py --script "tap start 1; step 2; press b,right 60; press b,right,a 18; press b,right 5" --scale 3 --lint` | 10 色 PASS |
| `qa_04_flicker_f1.png` | 敵人房連續兩幀之一：12 隻敵人只畫得出 7 隻（另可見被掃描線切半的敵人） | `shot.py --script "tap start 1; step 2; press b,right 860; release; step 3; shot f1; step 1; shot f2" --scale 3 --lint` | 13 色 PASS |
| `qa_04_flicker_f2.png` | 下一幀：換另一批敵人，兩張聯集 = 12 隻全到齊 | 同上 | 13 色 PASS |
| `qa_05_hud_score.png` | 踩敵後狀態列更新（SCORE 000100 / TIME 378）+ 問號磚組 | 自寫腳本：走到第 1 隻敵人前 → 原地起跳 14 幀 → 落地 | 13 色 PASS |
| `qa_06_level_end.png` | 關卡最右端（camX = 1792 = 2048−256 上限、主角 x=1912、無敵結束後） | 自寫腳本：`press b,right` 直到 camX 到頂 → 等 `inv` 歸零 | 12 色 PASS |
| `qa_07_split_status.png` | 狀態列分割線驗證幀（遊戲區捲動 337 幀、狀態列固定）+ 問號磚 / 磚組 | 自寫腳本：`press b,right 300` → 再 37 幀逐像素比對 | 11 色 PASS |
| `qa_08_bgalign.png` | 背景 8px 對齊驗證幀（清掉精靈後掃地形頂緣） | 自寫腳本：`press b,right 200` → `ppu.clearSprites()` → `render()` | 11 色 PASS |
| `qa_09_dist_60fps.png` | 非 debug `dist/星塵勇者.html` 整頁（1024×768 視窗、3 倍置中、10 秒 60.05 fps） | 自寫腳本：`file://dist/星塵勇者.html` + Enter + 10.5 秒 rAF 計數 | 瀏覽器整頁，不計入 NES 畫面抽查 |
| `apu/*.wav`（16 個） | qa1 自己重跑的 APU 離線渲染（demo 曲 10 s、4 個方波音、3 個三角波音、4 個雜訊、DPCM、五聲道合奏、2 音效） | `apu_render.py --seconds 10 --out-dir shots/agent_qa1/apu` | 18 項頻譜檢查全過 |

---

## R1-4 跨檔需求整合表

彙整 core / ppu / tools / apu / chr-lint / demo 六個 agent 在 `docs/PROGRESS.md` 提出的跨檔需求，**qa1 逐條實測驗證狀態**，並補上 qa1 自己發現的項目。

| # | 需求 | 提出者 | 影響 | qa1 實測狀態 | 建議負責 | 優先級 |
|---|---|---|---|---|---|---|
| X1 | `tools/run_all.sh` 的測試 glob 擴成 `tools/test_*.py games/*/test_*.py` | demo | 一鍵測試漏掉遊戲層 40 項 | ❌ **仍未處理**（`run_all.sh:60` 仍只掃 `tools/test_*.py`） | **tools** | **P1** |
| X2 | `ppu.render()` 不要在「只重畫」時前進 OAM 輪替指標；或提供 `ppu.advanceFlicker()` 讓遊戲控制；或文件明講「輪替步進必須與遊戲的 OAM 配置互質」 | demo | 截圖不可重現；兩幀聯集不保證涵蓋全部 | ❌ **仍未處理**（`ppu.js:408` 在 `render()` 內；實測連續 3 次 render 得 3 組不同精靈）。demo 以 `flickerStep = 0` + 自行 sprite cycling 繞過 | **ppu** | **P1** |
| X3 | `NES.FX.addVel` 簽章定案（契約 `{pos,frac}` vs 實作 number + 全域 frac）；demo 建議直接把 `Vec/Acc` 定為正式寫法，`addVel/addAcc` 只留單次換算 | tools(D1) + demo | R2 主角物理的基礎寫法 | ❌ **仍未定案**（實測 `addVel(0,384,0) → 24`；`ENGINE_API` §3 記實作版、`TASKS.md` 記契約版，兩份文件互相矛盾） | **core** + 總控裁定 | **P1** |
| X4 | 起跳第 1 幀用小重力還是大重力（core 16.31 px vs demo 19.125 px；長按跳 62 vs 文件 64 px） | core + demo | 決定 4 格 / 5 格跳躍是否成立 ⇒ 直接影響 R2 關卡設計 | ❌ **仍未定案**（qa1 實測 demo：短按 19.125 / 長按 62.00 / 全速 77.50 px） | **core** +（R2 手感 / 關卡 agent） | **P1** |
| X5 | PPU 在 `setTile / setAttr / sprite` 內呼叫 `timing.budget.use(n)`，讓「VBlank 只能寫 ~160 byte」變成真限制 | core + demo | PLAN §1 的一條還原標準目前完全沒生效 | ❌ **仍未處理**（`budget.use` 在 `cpu_timing.js` 以外 0 筆呼叫；跑 868 幀 `budgetOver` 恆 `false`） | **ppu**（呼叫端）+ core（介面已備妥） | **P1** |
| X6 | `docs/ENGINE_API.md` §14 的 D2 / D3 更新為「已修復」 | qa1 | 文件與實作矛盾會誤導 R2 agent | ❌ **文件過期**（D2/D3 實作**都已修好**，文件仍寫壞的） | **tools** | **P1** |
| X7 | `nes_lint.js` 同時讀 `ppu.stats.overLine` / `overLines`（D2） | tools | lint 的超線回報 | ✅ **已解決**（ppu 補了 `overLine` 別名，與 `overLines` 同一陣列參照；實測 `__nes.lint().overLine` 回 `[176..207]` 共 32 條） | — | 已完成 |
| X8 | PPU 補公開 `ppu.oam` 存取器（D3） | tools | `NES.Lint.oam()` 才跑得動 | ✅ **已解決**（`ppu.oam` getter + `ppu.oamBytes()`；實測 `NES.Lint.oam(ppu)` 回 `{ok:true,count:28,maxLine:14,spriteHeight:16}`） | — | 已完成 |
| X9 | `game.html` 把 demo 實際檔名加進 games 區塊 | tools | 避免 404 / build 警告 | ✅ **已解決**（`game.html:42-45` 已列 `chr/song/room/main.js`；`build.py` 內嵌 14 檔、缺 0 檔） | — | 已完成 |
| X10 | demo 最後一個檔要設 `window.GAME = {init, update, draw, state}` | tools | boot 才掛得上遊戲 | ✅ **已解決**（`__nes.state()` 讀得到 30 個鍵） | — | 已完成 |
| X11 | `dist/` 加進 `.gitignore` | tools | 打包產物不進版 | ✅ **已解決**（`.gitignore` 已含 `dist/`、`shots/`、`__pycache__/`、`*.pyc`、`docs/assets/*.png`） | — | 已完成 |
| X12 | `engine/chr.js` 直接附 `DEMO.spr16`（8×16 配對 bank）並在檔頭寫明「OAM 要填 `index \| 1`」 | demo | 每個用 8×16 的遊戲都要自己重建一次 | ❌ 未處理（demo 自建 `demo_spr16` 20 磚） | **chr-lint** | P2 |
| X13 | 若 `game.html` 要走 AudioWorklet，需另存一份 worklet `.js` 並以 `{workletUrl}` 傳入（`NES.APU.WORKLET_SRC` 已匯出字串） | apu | `file://` 下只能退 ScriptProcessor | ❌ 未處理（沿用自動退回，功能正常） | **apu** + tools | P2 |
| X14 | 真・sprite 0 命中（目前用 `split(scanline)` 代替） | ppu + demo | PLAN §1「狀態列用掃描線分割（模擬 sprite 0 / IRQ）」的另一半 | ❌ 未實作（`split(32)` 效果正確、畫面乾淨，等同 MMC3 IRQ） | **ppu** | P2 |
| X15 | `music.js` 補滑音（`1xx/2xx/3xx/Qxy`）與 detune（`Pxx`） | apu | R2「回音軌自動 detune」會需要 | ❌ 未實作 | **apu** | P2 |
| X16 | `__nes.setScale(s)` 連動 `game.html` 的 `place()`（CSS 寬高） | qa1 | 呼叫後畫面被 CSS 縮放並平滑，`page.screenshot()` 取到糊圖 | ❌ 未處理（不影響 `shot.py` 與正常遊玩） | **tools** | P2 |
| X17 | `__nes.frame()` 與 `state().frame` / `stats().frame` 同名不同義（前者是 PNG、後兩者是幀號） | qa1 | 命名混淆 | ❌ 未處理（`ENGINE_API` §11 有寫清楚） | **tools** | P2 |

---

> 驗收記錄：本報告的每一個數字都由 qa1 在 2026-09-17 自行執行取得；使用的臨時腳本不進版（放在 session scratchpad），可由本檔「重現指令」欄重跑。

---

# R2 QA（qa2-cruiser，2026-09-19）

> 對象：**《星塵巡航艦》**（`cruiser.html` / `games/cruiser/` / `engine/shmup.js`）
> 原則同 qa1：**不信任任何 agent 的自述**，每個數字都由 qa2 自己重跑 / 重量測；**未改動任何 src / tools / games**，只新增本區段與 `shots/agent_qa2/*`（自寫腳本 + 截圖）。
> 環境：`../卡比之星/.venv/bin/python`（Playwright / Chromium headless）、`node --check`、`?debug=1&scale=1&mute=1`。
> 依據：`docs/PLAN.md` §1 還原標準、`docs/TASKS.md` R2 契約、`docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md` §5-3 / §10（手感數字表）、`docs/ENGINE_API.md` §11 / §15。
> 不在本次範圍：手機觸控（nes-touch agent 進行中）、`star.html` / `games/star`（R2b 另行驗收）。

## R2-0 總評

**條件通過：畫面 / 聲音 / 物理的「還原標準」全數達標，但有 3 件 P1 必須修完才能上線。**

| 判定 | 內容 |
|---|---|
| 還原標準（PLAN §1） | ✅ **全綠**。1200 幀逐 60 幀取樣：同屏色 **9~14 色**（上限 25）、`badPixels = 0`、`overLine = 0`、`budget.over` **全程 false**（`overFrames = 0`、peak 39 / 160 byte）；同線 24 顆精靈的壓力測試下 PPU 確實只畫 8 顆（`dropped = 208`、`flickered = 16` 條線）且 `NES.SH.OAM` 每幀換一批（4 幀聯集 83 顆 vs 單幀 22 顆） |
| 手感對照研究表 | ✅ **61 項 60 過 1 失**（唯一失敗 = P1-1 自動連射）。速度 1.0/1.5/2.0/2.5/3.0、斜向不正規化、彈 7 / 雷射 12 / DOUBLE (+4,−4) / 飛彈 (+0.5,+2)→(+2,0)、Option 環 24 / 11 / 22 + 停手凍結、能量表回捲 / 已擁有不消耗 / 第 16 顆藍膠囊、護盾 5 下不擋地形、死亡回 512 px 檢查點、rank ≥2 彈速 ×1.25 / ≥3 預判、捲動 0.5 px/幀 —— **全部 ±0.1 px / ±1 幀內** |
| 60fps | ✅ 非 debug 實跑 5.00 秒 = **60.18 fps、`timing.dropped = 0`** |
| 全測試 | ✅ `bash tools/run_all.sh`（完整）**全 PASS**，**1206 項 0 失敗** |
| 單檔 dist | ✅ `dist/星塵巡航艦.html`（405 KB、內嵌 20 檔、缺 0 檔）可玩、lint PASS |
| 原創性 | ✅ **遊戲內文字 0 筆**原作專有名詞 |
| 遊玩完整度 | ⚠️ **通關演出看不見**（P1-2）、**第一次死亡後全程無音樂**（P1-3）、**按住射擊鍵不會連射**（P1-1） |
| 機器人通關 | ❌ 3 條命內**未通關**（最遠 camX 1201 / 3072）；分段驗證 6 段中 **4 段可過、2 段卡死**（詳見 R2-4） |

**問題統計：P1 = 3 ｜ P2 = 6 ｜ P3 = 5。**

---

## R2-1 通過清單（含數字）

### ① `bash tools/run_all.sh`（完整，非 --quick）

```
bash tools/run_all.sh
```

| 項目 | 結果 | 數字 |
|---|---|---|
| `node --check` | PASS | **31 檔** 0 語法錯 |
| `tools/test_apu.py` | PASS | **103 / 103** |
| `tools/test_chr.py` | PASS | **91 / 91** |
| `tools/test_core.py` | PASS | **108 / 108** |
| `tools/test_ppu.py` | PASS | **144 / 144** |
| `tools/test_shmup.py` | PASS | **157 / 157** |
| `games/cruiser/test_cruiser.py` | PASS | **124 / 124**（SKIP 0） |
| `games/cruiser/test_stage1.py` | PASS | **128 / 128** |
| `games/demo/test_demo.py` | PASS | **55 / 55** |
| `games/star/test_star.py` | PASS | **132 / 132** |
| `games/star/test_w1.py` | PASS | **164 / 164** |
| `build.py --check` | PASS | 載入順序 / engine 缺檔 0 |
| `shot.py` 冒煙 | PASS | colors=10 maxSprLine=2 |
| `nes_lint.py` 抽查 | PASS | 8 張 **0 張違規** |
| **合計** | **PASS** | **1206 項，0 失敗** |

### ② 還原標準：1200 幀實測（`shots/agent_qa2/play1200.py`）

```
../卡比之星/.venv/bin/python shots/agent_qa2/play1200.py      # 圖在 shots/agent_qa2/play/f0000..f1200.png
```
帶滿強化（speed 3 + MISSILE + LASER + OPTION×2）、每 2 幀按一次 A、上下擺動製造 Option 拖尾，每 60 幀截一張並 `__nes.lint()`：

| 量測 | 結果 | 標準 |
|---|---|---|
| 同屏色數（21 個取樣點） | **9 ~ 14** | ≤ 25 ✅ |
| `badPixels`（非 64 色像素） | **0** | 0 ✅ |
| `lint.overLine`（未補償的超線） | **0** | 0 ✅ |
| `budget.over` / `overFrames` | **false / 0**（peak **39** byte、limit 160） | false ✅ |
| `oam.dropped` | **0** | — |
| `maxSpritesLine` | 2 ~ 4 | ≤ 8 未觸發輪替 |

### ③ 每線 > 8 精靈的輪替（`shots/agent_qa2/limits.py`）

同一條掃描線塞 14 隻 `zig` + 船 + 2 Option + 雷射（`shots/agent_qa2/over8_line.png`）：

| 量測 | 結果 |
|---|---|
| `lint.maxSpritesLine` | **22 ~ 24**（確實超過 8） |
| `ppu.stats.dropped` / `flickered` | **208 顆 / 16 條掃描線**（PPU 真的只畫 8 顆） |
| 連續 4 幀畫出的精靈 x 集合 | **4 組都不同**（`NES.SH.OAM` 每幀輪替起點生效） |
| 4 幀聯集 / 單幀 | **83 / 22**（兩幀以上才畫得齊，＝真機行為） |
| 超線狀態下 `lint.ok` | **true**（colors 11、`flicker: true`） |
| 魔王階段 3（`?boss=3`） | colors **11**、`budget.over` **false**、`dropped` **0** |

### ④ 非 debug 60fps

```
cruiser.html?scale=1&mute=1        # 不帶 debug，實跑 5 秒讀 timing.frame
```
**5.00 秒推進 301 幀 = 60.18 fps、`timing.dropped = 0`**（`NES.HZ = 60.0988`）。

### ⑤ 手感對照研究表（`shots/agent_qa2/feel.py`，**61 項 / 60 PASS**）

```
../卡比之星/.venv/bin/python shots/agent_qa2/feel.py
```

| 項目（研究 §10 期望值） | qa2 實測 | 判定 |
|---|---|---|
| 速度 1~5 水平 px/幀 | **1.0 / 1.5 / 2.0 / 2.5 / 3.0** | ✅ |
| 速度 1~5 垂直 px/幀 | **1.0 / 1.5 / 2.0 / 2.5 / 3.0** | ✅ |
| 斜向不正規化（速度 3） | dx 2.0 / dy 2.0，合速度 **2.828**（= ×1.414） | ✅ |
| 無加速度（首幀即全速） | 速度 5 第 1 幀位移 **3 px** | ✅ |
| 邊界 X [8,240] / Y [16,184] | **8 / 240 / 16 / 184** | ✅ |
| 標準彈 7 px/幀 | **7.0** | ✅ |
| 雷射頭部 12 px/幀、最長 4 段 | **12.0 / 4 段** | ✅ |
| DOUBLE (+4, −4) | **+4.0 / −4.0** | ✅ |
| 飛彈空中 (+0.5, +2) | **+0.5 / +2.0** | ✅ |
| 飛彈爬地 (+2, 0) | **+2.0 / 0.0** | ✅ |
| 連射間隔 ≥ 20 幀、槽占用時凍結 | 手動連打間隔 **20 / 48**（最小 20）；兩槽占用時 `timer` 5 幀不動（20→20） | ✅ |
| **按住 A 自動連射** | 按住 200 幀 **只射 1 發** | ❌ **P1-1** |
| 等效 DPS（狂按，每 2 幀一次） | 600 幀 **26 發＝每 23.1 幀 1 發**（研究表滿配 ≈ 每 11 幀） | ⚠️ 見 P1-1 |
| Option 環 24 / 延遲 11 / 22 / 上限 2 | **24 / 11 / 22 / 2**，且 40 幀全程偏移一致 | ✅ |
| 停手 Option 凍結 | 放開方向鍵 40 幀，兩顆 Option 座標**完全不動** | ✅ |
| 環只在按方向鍵那一幀前進 | 不按 30 幀 `ringSteps` **+0**；按 30 幀 **+30** | ✅ |
| 能量表第 7 顆回捲 | `[1,2,3,4,5,6,1,2]` | ✅ |
| 已擁有不消耗 | 已有 MISSILE，gauge 停在 2 不歸零 | ✅ |
| 未擁有會消耗 | gauge 1 → B → `gauge=0, speed=2` | ✅ |
| `?` 格 = 護盾 | gauge 6 → B → `shield = 5`、gauge 歸 0 | ✅ |
| 第 16 顆藍膠囊 | 連續 20 顆中**只有 seq 16 是 blue** | ✅ |
| 護盾 5 下、第 6 下死 | `[5,4,3,2,1,0]` → `alive=false` | ✅ |
| 護盾不擋地形 | `hit(true)` 時 shield 仍 5 但 `alive=false` | ✅ |
| 死亡回 512 px 檢查點 | camX 701 → **542**（= 檢查點 512 + 復活後 60 幀 × 0.5） | ✅ |
| `checkpoint()` 每 512 px | `[0,0,0,512,512,512,1024,2560]` | ✅ |
| 死亡清強化 / rank 歸 0 / 船 −1 | speed 1、power 全 0、rank 0、lives 3→2 | ✅ |
| rank 公式 0..4 | `[0,1,2,3,4]` | ✅ |
| rank 0 / ≥2 敵彈速度 | **2.0 / 2.5 px/幀**（正好 ×1.25） | ✅ |
| rank ≥3 預判射擊 | 同一情境彈道由 `(−2.00, −0.67)` 變 `(−2.50, −0.50)` | ✅ |
| 捲動 0.5 px/幀、關長 384 欄 = 3072 px | **0.5 / [384, 3072]** | ✅ |

### ⑥ 單檔 dist

```
../卡比之星/.venv/bin/python tools/build.py --src cruiser.html          # 內嵌 20 檔；缺 0 檔；405 KB
../卡比之星/.venv/bin/python tools/shot.py --url "dist/星塵巡航艦.html" \
    --script "tap start 1; step 200; tap a 1; step 40" --lint --scale 3 \
    --out shots/agent_qa2/dist_play.png --state
```
→ `lint: PASS colors=9 maxSprLine=2 oam.ok=true`；`state.mode = play`、`camX = 120`、`budget.over = false`、`oam.engine = true`（確實用 `NES.SH`）。截圖 `shots/agent_qa2/dist_play.png`（Read 看圖：小行星帶 + 船 + HUD，與非打包版一致）。

### ⑦ 原創性掃描

```
grep -rniE "konami|gradius|vic ?viper|big ?core|salamander|life ?force" games/cruiser/ cruiser.html engine/
```
- **遊戲內會被畫到畫面上的字串只有**：`STARDUST CRUISER` / `ORIGINAL NES SHMUP` / `PRESS START` / `★ 2026 ORIGINAL` / `GAME OVER` / `STAGE CLEAR` / `1P` / `HI` / `x` / 能量表 6 個標籤 —— **0 筆原作專有名詞** ✅
- 命中 2 筆但都在**程式註解**（`ship.js:13`、`chr_ship.js:126` 寫「Gradius 手感 / Gradius 式反白」），不是遊戲內文字 → 合格（見 P3-3 的小建議）。
- 美術 / 音樂 / 關卡 / 名稱全為程式手繪與自寫 pattern，無外部素材引用。

### ⑧ 音樂 / 音效呼叫點（`CR.Audio.state()` 實測）

| 時機 | 期望 | 實測 | 判定 |
|---|---|---|---|
| 標題 | `title` | `{song:"title", playing:true}` | ✅ |
| 按 START 進遊戲 | `stage1` | `{song:"stage1", playing:true}` | ✅ |
| 死亡 | 停樂 + `die` 音效 | `{song:"stage1", playing:false, sfx:["die"], owners:{p1,p2,tri = die}}` | ✅ |
| **復活後** | **重播 `stage1`** | `{playing:false}`（死後 100 / 200 / 400 / 800 幀都還是 false，mode 已回 `play`） | ❌ **P1-3** |
| **魔王戰** | `boss` | **從未播放**（`main.js` 只呼叫 title / stage1 / clear / gameover） | ❌ **P2-2** |
| STAGE CLEAR | `clear` | `{song:"clear", playing:true}` | ✅ |
| GAME OVER | `gameover` | `{song:"gameover", playing:true}` | ✅ |

---

## R2-2 問題列表

### P1（會壞遊玩 / 違反還原標準 —— 上線前必修）

| # | 問題 | 影響 | 重現指令 / 證據 | 截圖 | 建議負責 |
|---|---|---|---|---|---|
| **P1-1** | **按住 A 不會自動連射**。`games/cruiser/ship.js:454` 用 `input.pressed(BTN.A)`，而 `engine/input.js:120` 的 `pressed()` 是**邊緣**（`cur & ~prev`）⇒ 按住只發第一發 | 違反研究 §5-3 [源/反組譯]「**A 鍵：邊緣（`$05`）或『計時器歸零 + 按住（`$07`）』都能發**」。`FIRE_DELAY = 20` 與「兩槽占用計時器凍結 → 21/23 交替」在現行實作下**永遠觀察不到**（ship.js 自己的註解與 `test_cruiser.py` 都得先 `release()` 一幀才按）。實機手感：玩家必須全程狂按，狂按等效 DPS 只有每 **23.1** 幀 1 發（研究表滿配 ≈ 每 11 幀），魔王 24 血非常拖 | `../卡比之星/.venv/bin/python shots/agent_qa2/feel.py` → 「按住 A 200 幀的發射次數」**實測 1**（期望 ≈ 9~10）。最小重現：`CR.ship.fired=0; __nes.release(); __nes.step(1); __nes.press(['a'],200); CR.ship.fired` → **1** | — | **ship** |
| **P1-2** | **`STAGE CLEAR` / `GAME OVER` 文字只寫進名稱表 0**（`main.js:279` `drawLines` → `writeText(ppu, col, row)` 預設 nt 0、`textAttr` 也 `fillAttr(0,…)`），但遊戲區捲動是 `ppu.scroll(camX % 512, 0, 0)` 的**兩張名稱表**；當 `camX % 512 ≥ 256` 時可見區全部來自 nt1 ⇒ **文字完全看不見** | 魔王固定在 `camX = 2816`（`2816 % 512 = 256`）⇒ **通關畫面 100% 看不到「STAGE CLEAR / PRESS START」**，玩家只看到一間靜止的紅色空房間；GAME OVER 也有**一半的關卡位置**看不到 | 通關：`cruiser.html?debug=1&scale=1&mute=1&boss=3` → 打死魔王 → `GAME.state().mode === 'stageclear'`，但 `ppu.getTile(0,10..20,11)` = `29,30,11,17,15,0,13,22,15,11,28`（"STAGE CLEAR"）而 `ppu.getTile(1,*,11)` 全 = 89（紅背板）、`camX%512 = 256`。<br>GAME OVER：`cruiser.html?debug=1&scale=1&mute=1&camx=800` → `CR.ship.lives=1; CR.ship.invul=0; CR.ship.power.shield=0; CR.ship.hit(true); __nes.step(140)` → mode=`gameover`、scroll=293、**畫面上沒有任何文字** | `shots/agent_qa2/ux/8c_stageclear_180f.png`、`shots/agent_qa2/ux/6b_gameover_nt1.png`（對照：scroll<256 時正常的 `ux/6_gameover.png`） | **ship** |
| **P1-3** | **死亡後音樂永不重播**。`CR.Audio.sfx('die')` 會自動停音樂（song.js 設計如此、正確），但 `main.js:450 respawn()` 沒有任何 `CR.Audio.play('stage1')`；只有 `toPlay()`（標題→遊戲）才播 | 第一次死亡之後**整局遊戲完全無 BGM**（只剩音效），直到 GAME OVER 才又有聲音。契約明列「die 停樂後復活重播」 | `cruiser.html?debug=1&scale=1`（**不要 mute**）→ `__nes.tap('start',1); __nes.step(60)` → `CR.Audio.state(NES.instance)` = `{song:"stage1",playing:true}`；`CR.ship.invul=0; CR.ship.power.shield=0; CR.ship.hit(true); __nes.step(800)` → mode 已回 `play`、lives 2，但 `CR.Audio.state()` 仍 `{song:"stage1", playing:false}` | — | **ship**（在 `respawn()` 末尾加 `call(CR.Audio,'play','stage1')`） |

### P2（體驗）

| # | 問題 | 說明 / 證據 | 建議 |
|---|---|---|---|
| **P2-1** | **HUD 能量表標籤擠成一整串** `SPEEDMISSLDOUBLLASEROPTON  ?`（6 格 × 5 欄 = 30 欄，格與格之間沒有空欄） | 【已修（fix-r4）】`GAME.state().hud` 第 2 行實測：<br>`SPEEDMISSLDOUBLLASEROPTON  ?`<br>第 3 行的格框 `[---][---][---][---]<===>[---]` 反白倒是清楚可辨 | 可見區 32 欄，建議三選一：<br>**(a) 4 欄縮寫 + 空欄**：`SPD MSL DBL LSR OPT  ?` → 6×3 + 5 空 = 23 欄，左右各留 4 欄置中，字與格框完全對齊（**推薦，改動最小**）。<br>(b) 保留 5 字但**只顯示 5 格**，`?` 用單字元格塞在最右：`SPEED MISSL DOUBL LASER OPTON?`（6×5+4 空 = 34 欄 → 超出，需砍一格）。<br>(c) 標籤列改成**只畫目前選中的那一格的全名**（`> OPTION <` 置中），格框列仍畫 6 格 —— 最接近原作 HUD 的資訊密度，也最省磚。<br>**已修（fix-r4）**：根因不是關卡而是機器人 —— 受擊硬直（`state==='hurt'`）中按 A 無效，`playthrough_star.py` 卻把 A 一直按著，硬直結束也不會再觸發跳躍 ⇒ 「按著 A 走進坑裡」。機器人改成硬直中取消待發跳躍、恢復後重新決策。**icons2x 開著的新基準：4-1 cleared / 1197 幀 / 0 死**，`--w4` 四關全 0 死。 |
| **P2-2** | **魔王曲 `boss` 從未播放**（song.js 有 10.65 s 的 boss 曲、`tools/apu_render.py` 也渲染過它，但 `main.js` 沒有呼叫點） | 【已修（fix-r4）】`grep -n "Audio.*play" games/cruiser/main.js` → 只有 `title` / `stage1` / `gameover` / `clear` | 在 main 的 update 偵測 `CR.stage.bossActive` 由 false→true 時 `CR.Audio.play('boss')`；魔王死亡（`cleared`）再由 `toStageClear()` 切 `clear`。順便把 P1-3 的復活重播寫成「依 `bossActive` 選 `boss` 或 `stage1`」。<br>**已修（fix-r4）**：`fits()` 放寬成「空白 **或** 純背景紋白名單（VEIN / CAVEBG / MBG / CSEA_T / CSEA_B / STAR_* / RAIL，kind 全是 none）」可覆蓋；看得出是東西的裝飾磚（雲 / 山 / 樹 / 草叢 / 火把 / 礦燈 / 齒輪 / 支撐梁 / 旗桿本體）一律不蓋。**旗桿球 16 / 16 關**，`attrOwners` 同步放寬 ⇒ 顏色跟著錨點。 |
| **P2-3** | **復活後的「死循環」**：無強化 + 速度 1.0 的復活狀態，在檢查點 1024 / 1536 之後的要塞段幾乎過不去 | 【已修（fix-r4）】機器人分段驗證（`shots/agent_qa2/segments.py`，各段 1300 幀 = 650 px）：<br>`camX 1024 → 只前進 148 px，死 2 次（都是敵彈）`<br>`camX 1536 → 只前進 107 px，死 3 次（都是敵彈）`<br>**帶滿強化重跑同兩段也一樣卡**（190 px / 107 px）。全關跑測三條命連續死在 **camX 1230 / 1264**（欄 154~158）與 **camX 1644**（欄 205） | ① 復活時保留 1 級 SPEED（或直接給 `speed = 2`），是現代橫捲射擊的標準緩解；<br>② 欄 144~158、欄 194~210 的砲台改成「貼地 / 貼天不要同時」或把該段砲台射擊間隔由 90 幀放寬到 120 幀；<br>③ 這兩段的天花板 / 地板落差（欄 195→200 由 `ceil 4/floor 7` 變 `ceil 7/floor 4`）讓可用高度只剩 15 列，配合瞄準彈容錯極低。<br>**已修（fix-r4）**：`main.js` 匯出 `CR.muteBudget`，`credits.js` 的 `skip()` 把整批寫入包起來。實測 `overFrames 0`、`peak 0`（修前 1 / 960）。 |
| **P2-4** | **敵彈幾乎看不見**：4×4 判定 / 8×8 精靈的深綠色（spr2 `$1A`）小點，在黑底星空與藍色要塞背景上對比都很低 | 【已修（fix-r4）】`shots/agent_qa2/seg/segp_1536.png`（Read 看圖：船鼻子前方 1 px 處那顆綠點就是致命彈）、`ux/T_fortress_in.png` 畫面正中央的綠點 | 敵彈換成**高亮色 + 每 2 幀閃白**（例如用 spr1 的白 / 黃，或把 `$1A` 換成 `$2A`）；或把彈心畫成 2×2 白點 + 綠外框（NES 常見作法，不多花磚）。<br>**已修（fix-r4）**：`ST.SubWeapon.kindOf()` 正規化（吃 `'fire'` / `'DART'` 也吃數字），`give()` 與 `dev.giveSub()` 都走它；不認得的名字照樣回 false。 |
| **P2-5** | **玩家船與貼天花板砲台同為白色主體**，要塞段第一眼分不出敵我 | `ux/T_fortress_in.png`：左邊白色箭頭是自機、右上角倒三角白色物體是砲台 | 砲台主體改用 spr3 的藍（`$11`）+ 白只留砲管，或自機加一條橘色噴焰常駐（目前噴焰只有 2 幀閃爍、靜態時看不到）。 |
| **P2-6** | **魔王室整片 `$06` 暗紅底刺眼**：核心室（欄 288~383）整個遊戲區 208 線幾乎全被飽和暗紅填滿，一場魔王戰要盯 30~60 秒 | `ux/7a_boss1.png`、`ux/7b_boss2.png`、`ux/8c_stageclear_180f.png` | ① 把大面積填充改成 `$0F` 黑底 + `$06` **只做鉚釘 / 支柱 / 邊框**（同一組調色盤、只換磚，成本最低）；<br>② 或把 bg3 的 `$06` 換成 `$07`（暗褐）/`$01`（深藍），紅色只留給「核心開啟 = 可打」與雷射預告，讓紅色變成**訊號**而不是背景；<br>③ 若要保留紅色氛圍，至少用 2×2 的棋盤網點（`$06` + `$0F`）把感知飽和度降一半 —— 這也是 FC 時代常用的手法。 |

### P3（小瑕疵）

| # | 問題 | 證據 / 建議 |
|---|---|---|
| P3-1 | **標題畫面也畫著能量表 HUD**（`SPEEDMISSL…` + 6 個空格框），原作標題畫面沒有 | `ux/1_title.png`。建議 title 模式時把列 27 / 28 清成空白（`clearLines` 已有現成工具）。 |
| P3-2 | **魔王戰死亡後要空捲約 440 幀（≈ 7.4 秒）才會再遇到魔王** | 實測：死在魔王戰 → `restart(2560)` → camX 2595，之後以 0.5 px/幀 回到 2816 才 `bossActive = true`（+600 幀時才重新出現）。建議魔王段的檢查點直接設在 2816（或死亡後把 camX 設回 2780 左右）。 |
| P3-3 | 程式註解出現 `Gradius` 2 筆（`ship.js:13`、`chr_ship.js:126`） | 不是遊戲內文字、不違規；若要完全避嫌可改寫成「原作」。 |
| P3-4 | `NES.SH.Pool` 的「把 `alive` 設 false 等同 free」**只在下一次 `each()` 時才真的回收槽位** | qa2 寫測試時踩到：連續 `spawnTest('capsule')` + 直接設 `alive=false`（不 step）到第 7 顆就拿到 `null`。遊戲內每幀都會 `each()` 所以無害，建議 `ENGINE_API` §15.3 補一句「回收發生在下一次 `each()`」。 |
| P3-5 | `__nes.stats().flickered` 在正常遊玩時恆為 0（1200 幀取樣全 0），只有人工堆疊精靈才會 > 0 | 不是 bug（正常關卡同線精靈最多 4 顆），但表示**關卡實際上沒有用到 8 精靈上限**；若想更「原汁原味」，編隊可以再密一點（目前同屏敵人硬上限 10、`maxSpritesLine` 只到 4）。 |

---

## R2-3 機器人通關結果

自寫 `shots/agent_qa2/bot.py`（貪婪：9 方向候選 × 成本函式 = 地形軌跡模擬 80 幀 + 敵 / 敵彈 40 幀線性外推 + 膠囊吸引 + 對準最近敵人 + 不貼左牆；每 2 幀按一次 A；能量表到 `SPEED→SPEED→MISSILE→OPTION→OPTION→LASER` 就按 B；死亡繼續）。全部跑在頁面內（`__nes.step` 逐幀），死亡瞬間就地判死因。

```
../卡比之星/.venv/bin/python shots/agent_qa2/bot.py --max-frames 12000
```

| 項目 | 結果 |
|---|---|
| 結束原因 | **GAME OVER**（未通關） |
| 幀數 | **3621**（≈ 60 秒） |
| 死亡數 | **3**（= 全部 3 條命） |
| 最遠 camX | **1201 / 3072**（**39 %**，第 1 次死亡前一路無傷推進到 1201） |
| 分數 | 3700 |
| 死因 | `bullet` ×3（camX 1264 / 1230 / 1230，都在欄 154~158 同一處） |
| 強化 | 全程只吃到 1 顆膠囊（SPEED 2），死後歸零 |

> 機器人不是「玩得好」的證明，但**同一個成本函式在前 1200 px 完全不死、在欄 154 起連死三次**，指向 P2-3 的難度斷層而不只是機器人爛。

---

## R2-4 分段驗證（`?camx=` / `?boss=`）

```
../卡比之星/.venv/bin/python shots/agent_qa2/segments.py     # 圖在 shots/agent_qa2/seg/
```
每段從檢查點起跑 1300 幀（= 650 px，剛好走到下一個檢查點）。

| 檢查點 camX | 無強化（＝死亡復活狀態） | 帶滿強化（＝正常推進） | 難點欄位 |
|---|---|---|---|
| 0 | 前進 362 px，死 1 次（`enemy:fan`） | **前進 650 px，0 死** ✅ | 欄 40~50 的蛇行編隊 |
| 512 | **前進 650 px，0 死** ✅ | **前進 650 px，0 死** ✅ | — |
| **1024** | 前進 **148** px，死 2 次（敵彈） | 前進 **190** px，死 2 次（敵彈） | **欄 144~158**（要塞入口，貼地 + 貼天砲台交替 + 通道由 `ceil3/floor5` 收窄） |
| **1536** | 前進 **107** px，死 3 次（敵彈） | 前進 **107** px，死 3 次（敵彈） | **欄 194~210**（`ceil4/floor7` → `ceil7/floor4` 反轉落差，可用高度剩 15 列 + 瞄準彈） |
| 2048 | 前進 124 px，死 3 次（敵彈） | **前進 650 px，0 死** ✅ | 欄 256~270（無強化時過不去） |
| 2560 | 前進 255 px，死 2 次（`enemy:tank` + 敵彈） | 前進 232 px，死 1 次（敵彈） | 欄 320~343（三段密度最高：3~5 欄一波） |

魔王（帶滿強化）：

| 進入點 | 結果 | 魔王狀態 |
|---|---|---|
| `?boss=1`（外殼 4 片） | ❌ 3 條命內未打完（打掉 2 片板，`platesLeft 2`、`coreHp 8`，score 6800） | 滿配 3 個發射體（本體 + 2 Option）狂按 A ≈ 每 8 幀 1 發、傷害 1 ⇒ 24 血約需 **190 幀純輸出**；但每次死亡強化全失、回到單發射體（每 23 幀 1 發 ⇒ 約 550 幀），**第二條命之後基本打不動** → 與 **P1-1**（沒有自動連射）直接相關 |
| `?boss=2`（核心） | ✅ **cleared，0 死** | `coreHp 0`、`phase 4`、`dead:true` |
| `?boss=3`（三連雷射） | ✅ **cleared，0 死** | 同上 |

魔王三階段截圖（Read 逐張看圖，lint 全 PASS）：

| 階段 | 檔案 | lint |
|---|---|---|
| ① 外殼（4 片裝甲 + 3 砲口） | `shots/agent_qa2/ux/7a_boss1.png` | ok colors=10 maxSprLine=6 |
| ② 核心露出 + 環形 8 彈 | `shots/agent_qa2/ux/7b_boss2.png` | ok colors=11 maxSprLine=6 |
| ③ 三連雷射（背景磚） | `shots/agent_qa2/ux/7_boss3.png`、`7c_boss3_laser.png` | ok colors=9~11 maxSprLine=2~6 |
| ④ 死亡大爆炸 | `shots/agent_qa2/ux/8a_boss_death.png` | ok colors=12 maxSprLine=13 |

> 辨識度評語（Read 看圖）：4 片裝甲板（藍白方框）→ 核心露出（黃綠色眼）→ 崩壞，**「我有在打中」的回饋非常清楚**，三階段一眼可分。砲口 3 顆藍色圓點也夠明顯。唯一問題是背景（P2-6）。

---

## R2-5 體驗截圖清單（全部 Read 看過圖）

| 畫面 | 檔案 | lint | 評語 |
|---|---|---|---|
| 標題 | `shots/agent_qa2/ux/1_title.png` | ok colors=7 | `STARDUST CRUISER / ORIGINAL NES SHMUP / PRESS START / ★ 2026 ORIGINAL`，星空 + 小行星飄動，質感到位；但下方仍掛著能量表（P3-1） |
| 遊玩（無強化） | `ux/2_play.png` | ok colors=9 | 小行星帶辨識度佳（橘褐岩石 vs 白星點），自機藍白對比清楚 |
| 遊玩（滿強化） | `ux/3_play_powered.png` | ok colors=9 maxSprLine=5 | 2 顆 Option 跟隨可見；能量表第 5 格反白 `<===>` 清楚 |
| 死亡 | `ux/4_dead.png` | ok colors=9 | 碎片四散 |
| 復活 | `ux/5_respawn.png` | ok colors=9 | 閃爍無敵正常（每 4 幀） |
| GAME OVER（scroll<256） | `ux/6_gameover.png` | ok colors=7 | 文字正常 |
| GAME OVER（scroll≥256） | `ux/6b_gameover_nt1.png` | ok | **完全沒有文字**（P1-2） |
| STAGE CLEAR | `ux/8b_stageclear.png`、`8c_stageclear_180f.png` | ok colors=12 | **完全沒有文字**，只有一間紅房間（P1-2） |
| 小行星帶 / 要塞入口 / 要塞中段 / 通道 / 核心室 | `ux/T_asteroid.png` `T_fortress_in.png` `T_fortress_mid.png` `T_corridor.png` `T_coreroom.png` | 全 ok colors=9~11 | 三段主題（黑底星空 → 藍色鉚釘要塞 → 紅色核心室）區隔明確；要塞的管線 / 壁燈 / 鉚釘細節豐富 |
| 每線 > 8 精靈 | `over8_line.png` | ok colors=11 | 14 隻同線敵人只畫出 4~8 隻 = 真機閃爍 |
| 1200 幀逐 60 幀 | `play/f0000.png` ~ `play/f1200.png`（21 張）+ `play/play1200.json` | 全 ok | — |

### 「隕石不可破壞」是否造成不合理死亡

- **不算不合理，但值得記錄**：機器人早期版本（地形預判只看 24 幀 = 12 px）在小行星帶會被 16×16 的岩石逼到左牆角撞死（camX 314，連死 3 次）；把預判拉到 80 幀（40 px）後，**小行星帶就完全不再是死因**（三輪測試 0 次 `terrain` 死亡）。
- 也就是說：小行星**可以純靠走位避開**，只要玩家提早約 **0.7 秒**判讀。這符合橫捲射擊「地形殺 = 核心張力」的設計（研究 §10-1 [源]：護盾不擋地形是原作行為）。
- 但仍建議（低優先）：小行星帶的岩石**至少讓飛彈 / 雷射可以打碎一部分**（stage 的已知問題 #11），給玩家「我有辦法處理」的選項；或在岩石密集處把上下通道留寬到 ≥ 64 px。

---

## R2-6 給各 agent 的一句話

| agent | 待辦 |
|---|---|
| **ship** | P1-1（`held \|\| pressed` 自動連射）、P1-2（文字寫兩張名稱表，或進入 title/gameover/stageclear 時把 `ppu.scroll` 歸 0）、P1-3（`respawn()` 重播音樂）、P2-1（HUD 版面）、P2-2（呼叫 `play('boss')`）、P3-1 |
| **stage** | P2-3（欄 144~158 / 194~210 難度）、P2-4（敵彈配色）、P2-5（砲台配色）、P2-6（紅色魔王室）、P3-2（魔王檢查點） |
| **engine** | P3-4（`ENGINE_API` §15.3 補一句 Pool 回收時機） |
| **audio** | 無（6 首曲 + 9 音效實測全部正確；`boss` 曲沒播是 main 的呼叫點問題，不是 song.js） |

> 驗收記錄：本區段每個數字都由 qa2-cruiser 於 2026-09-19 自行執行取得；腳本在 `shots/agent_qa2/`（`feel.py` 手感 61 項 / `play1200.py` 1200 幀 lint / `limits.py` 精靈輪替 + 60fps / `bot.py` 通關機器人 / `segments.py` 分段驗證 / `ux.py` 體驗截圖），可直接重跑。**未修改任何 src / tools / games 檔案。**

---

# R2b QA（qa2-star，2026-09-19）

《星塵勇者》W1 驗收 —— 對象：`games/star/*`（star-hero / star-world / star-audio 三 agent 的產出）+ `star.html` + `tools/playthrough_star.py`。
**本輪沒有改任何 src / tools / games**；自寫腳本放 `shots/agent_qa2s/`（`feel.py` / `compliance.py` / `flow.py` / `shots.py`），
截圖放 `shots/agent_qa2s/`（含 `lint/` 40 張）。`games/cruiser/test_cruiser.py` 的 1 項 FAIL 不在本輪範圍（fix2-cruiser 同時在改）。
指令一律 `PY=../卡比之星/.venv/bin/python`，在專案根目錄執行。

## R2b-0 總評

**通過**。R2 的兩條完成定義（PLAN §4）都達標，而且是**獨立複測**的結果，不是只看 `test_star.py`：

| 完成定義 | 結果 |
|---|---|
| 手感測試 **±1 幀** | 12 項獨立量測（`shots/agent_qa2s/feel.py`，直接逐幀讀 `__nes.state()`）**全部差 0 幀**，最大偏差是「跑跳水平距離 +0.5 px」（非幀） |
| **W1 機器人通關** | 四關 × seed 1 / 2 / 3 = **12 次全部 cleared**，1-2 / 1-3 全程 0 死 |
| 還原標準（PLAN §1） | 四關各 600 幀、每 60 幀取樣共 **40 個點**：色數 7~11 / 25、非法像素 0、`budget.overFrames` 全程 **0**、OAM 合法；外部逐像素 `nes_lint.py` **40 張 0 違規** |
| 非 debug 效能 | 5.00 秒 **300 幀 = 59.92 fps**（＝ headless vsync 59.97 的上限），`timing.dropped` 這 5 秒內**增加 0** |
| 單檔可玩 | `dist/星塵勇者.html` 436 KB（內嵌 20 檔、缺 0 檔），開起來可玩、lint PASS、`?level=` 也通 |
| 原創性 | `games/star/*.js` 對「mario / nintendo / bowser / goomba / koopa / 瑪利歐 / 任天堂」等詞**命中 0**；遊戲內文字只有 `STARDUST HERO` / `WORLD 1` / `PRESS START` / `$ 2026 ORIGINAL` / HUD 五個欄位 |

**找到 1 個 P1、5 個 P2、10 個 P3**。P1 不是程式錯誤而是**缺畫面**：輸光命與破完 W1 的畫面**都沒有任何文字、而且長得一模一樣**，玩家看到的是一張靜止的關卡圖。這一點與 qa2-cruiser 的 P1-2 是同一類問題（玩家看不到結局），所以比照列 P1；若總控認定 PLAN §4 已把「標題 / 選單 / 結算」排在 R4，可降級為 R4 待辦。

## R2b-1 通過清單（含數字）

### ① `bash tools/run_all.sh`（完整，非 --quick）

```
bash tools/run_all.sh
```

| 項目 | 結果 | 項數 |
|---|---|---:|
| node --check（32 檔） | PASS | — |
| `tools/test_apu.py` | PASS | 103 |
| `tools/test_chr.py` | PASS | 91 |
| `tools/test_core.py` | PASS | 108 |
| `tools/test_ppu.py` | PASS | 144 |
| `tools/test_shmup.py` | PASS | 157 |
| `tools/test_touch.py` | PASS | 180 |
| `games/cruiser/test_cruiser.py` | **FAIL 1**（能量表標籤；**fix2-cruiser 的檔，不在本輪範圍**） | 124（過 123） |
| `games/cruiser/test_stage1.py` | PASS | 128 |
| `games/demo/test_demo.py` | PASS | 55 |
| **`games/star/test_star.py`** | **PASS** | **132**（＝預期 132） |
| **`games/star/test_w1.py`** | **PASS** | **177**（＝預期 177） |
| `build.py --check` × 3 入口 | PASS | — |
| `shot.py` 冒煙 + lint | PASS（colors=10、maxSprLine=2） | — |
| `nes_lint.py` 抽查 8 張 | PASS，**0 張違規** | — |

合計 **1399 項，1398 通過，1 失敗（cruiser，不在本輪範圍）**。star 的 132 / 177 與任務書預期數字**完全一致**。

### ② 還原標準複驗（四關 × 600 幀，每 60 幀 lint + 截圖）

```
../卡比之星/.venv/bin/python shots/agent_qa2s/compliance.py      # 40 張圖在 shots/agent_qa2s/lint/
../卡比之星/.venv/bin/python tools/nes_lint.py shots/agent_qa2s/lint/*.png --scale 0
```

用**真正的通關機器人**（`import playthrough_star` 的 `BOT_JS`，seed 1）驅動，不是空跑。

| 關 | 10 個取樣點的色數範圍 | 非法像素 | `maxSpritesLine` 峰值 | `budget.overFrames` | OAM 合法 | console error |
|---|---|---:|---:|---:|---|---|
| 1-1 | 9 ~ **11** / 25 | 0 | 4 | **0** | ✅ | 0 |
| 1-2 | 7 ~ 9 / 25 | 0 | 4 | **0** | ✅ | 0 |
| 1-3 | 8 ~ 10 / 25 | 0 | 2 | **0** | ✅ | 0 |
| 1-4 | 8 ~ **11** / 25 | 0 | **6** | **0** | ✅ | 0 |

外部逐像素檢查：`nes_lint.py` 40 張 → **總計 40 張，0 張違規**（每張都印「放大 3 倍 → 原生 256x224、色數 ≤ 11/25、非法像素 0」）。

**每線精靈 > 8 的輪替**：W1 正常遊玩**用不到**（峰值只有 6）。所以另外人工壓測 —— 在主角旁同一列硬塞 12 隻 roller：

```
../卡比之星/.venv/bin/python /tmp/.../qa2s_flicker.py   # 腳本邏輯已併入 shots/agent_qa2s/compliance.py 註解
```

| 幀 | `maxSpritesLine` | `flickered` | lint.ok | OAM 筆數 | `ppu.flicker` |
|---|---:|---:|---|---:|---|
| 1~6 | **24 ~ 26** | **16**（每幀讓出 16 顆） | ✅ true | 64（＝硬體上限，沒有超發） | `rotate` |

⇒ 超線時確實走輪替、OAM 仍守 64 顆、lint 不紅。

### ③ 非 debug 60 fps（5 秒實跑）

```
star.html?mute=1&level=1-1   （不帶 debug=1 ⇒ Timing 自走 rAF）
```

| 量測 | 值 |
|---|---|
| 5.007 秒內遊戲邏輯幀 | **300** |
| 實際 fps | **59.92**（同期 rAF 也是 300 幀 ⇒ **一幀不掉、完全跟著 vsync**） |
| `timing.dropped` 這 5 秒內的增量 | **0**（總計 8 次全部發生在載入後的第 1 秒暖機） |
| `budget.peak` / `oamPeak` | 39 / 256（限 160 / 256），`overFrames = 0` |

### ④ 手感 ±1 幀（**獨立複測**，不看 `test_star.py`）

```
../卡比之星/.venv/bin/python shots/agent_qa2s/feel.py
```
做法：`star.html?debug=1&scale=1&mute=1&level=test`，用 `NES.Input.inject(mask,1)` + `__nes.step(1)` **一幀一幀**推，直接讀 `__nes.state()` 的 `vx / y / inv`，期望值全部**自己從研究常數算**（`docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md` ②③④）。

| 項目 | 期望（來源 / 算式） | 實測 | 差 |
|---|---|---:|---:|
| 靜止 → 走路上限（`$18` = 1.5 px/f） | **41 幀**（`ceil(384 ÷ (152/16))`；研究寫「約 40 幀」[推論]） | **41**（`vx=384`, `vxPx=1.5`） | **0** |
| 靜止 → 跑步上限（`$28` = 2.5 px/f） | **45 幀**（`ceil(640 ÷ (228/16))`；研究寫「約 45 幀」[推論]） | **45**（`vx=640`, `vxPx=2.5`） | **0** |
| 轉身煞車（跑速 + 反向 + B，加速度 ×2） | **23 幀**（`ceil(640 ÷ (228×2/16))`；研究「轉向加速度 ×2」[源]） | **23** | **0** |
| 放開方向鍵靠摩擦停下（`FrictionData $d0` = 208） | **50 幀**（`ceil(640 ÷ (208/16))`） | **50** | **0** |
| 長按靜止跳（高度） | **64 px = 4 格**（索引 0：`vy0 −4`、`gHold $20`；研究表「64 px ＝ 4 格磚」[源]） | **64.00** | **0** |
| 全速跑跳（高度） | **80 px = 5 格**（索引 4：`vy0 −5`、`gHold $28`；研究表「80 px ＝ 5 格」[源]） | **80.00** | **0** |
| 全速跑跳（水平距離 / 滯空） | **152.5 px / 61 幀**（2.5 px/f × 61） | **153 / 61**（三個起跳點重測都一樣，落點同高） | **+0.5 px**（非幀差） |
| 點按 1 幀（高度） | 研究 [推論] ≈ **18 px**；引擎 `NES.FX.SMB.jumpSim({hold:1})` = **19.6875 px** | **20**（整數 y） | 幀數無差；px 差 **+1.4**（＝離散積分 + SMB「首幀半格重力」，研究的 18.3 是連續公式估計值） |
| 空中控制門檻（走速起跳後按 B） | 不得超過 `maxWalk` **384**（研究「\|vx\| ≥ `$19` 才用跑步參數」[源]） | **384** | **0** |
| 受傷無敵 | **120 幀**（R2b 契約指定；**SMB 原版 8×21 = 168**，見 P3-5） | **120** | **0**（對契約） |
| 蹲下碰撞框 | 12×14、腳不動 ⇒ y 下移 8（契約） | **12×14 / +8**，`state='crouch'` | **0** |
| 踩敵回彈 | **−768 = −3 px/f**（契約） | **−768 / −3.0** | **0** |

> 12 項獨立量測與 star-hero 在 PROGRESS 貼的「手感實測表」**逐項相符**，沒有一項是只有它自己的測試才量得到的。

### ⑤ 通關機器人（四關 × seed 1 / 2 / 3）

```
for s in 1 2 3; do ../卡比之星/.venv/bin/python tools/playthrough_star.py --all --seed $s; done
```

| 關 | seed 1 | seed 2 | seed 3 |
|---|---|---|---|
| 1-1 | ✅ 1400 幀 / **1** 死 | ✅ 1440 / **1** | ✅ **14159** / **3**（見 P3-2） |
| 1-2 | ✅ 1070 / **0** | ✅ 1070 / **0** | ✅ 1070 / **0** |
| 1-3 | ✅ 1265 / **0** | ✅ 1265 / **0** | ✅ 1265 / **0** |
| 1-4 | ✅ 1385 / **1** | ✅ 1437 / **1** | ✅ 1423 / **1** |

**12 / 12 全部 cleared**。1-4 從上一輪的 `6746 幀 / 18 死` 降到 `~1400 幀 / 1 死`，star-world 的 fix（斧頭移出橋、熔岩坑 8→6 欄、坑前助跑 ≥ 9 欄）確實生效。

### ⑥ 模式流程（`shots/agent_qa2s/flow.py`）

| 流程 | 期望 | 實測 | 判定 |
|---|---|---|---|
| 標題 → START | `mode: title → play`，關卡 1-1 | ✅ | ✅ |
| 命盡 → GAME OVER | `mode: play → dead → gameover`，播 `gameover` 曲 | ✅（`lives` 內部 −1，HUD 顯示 `×0`，有 clamp） | ✅ |
| GAME OVER → START | 任務書期望「**回標題**」 | **直接回 `play`**（`loadLevel(startLevel)`，lives 重設 3、score 0、x 回起點） | ❌ **P2-5** |
| 碰 GOAL → 結算 | `mode: clear`，播 `clear` 曲，剩餘時間換分 | ✅（`time 300 → 0`、`score 1000 → 16000`，每幀 10 單位 × 50 分） | ✅ |
| 結算 → 下一關 | 1-1 → **1-2**，`mode: play`，曲子換 `cave`、時間重設 300 | ✅ | ✅ |
| 1-4 打完 → 全破 | `won = true` | ✅ `won=true`、`mode='gameover'`、播 `clear` | ⚠️ 畫面與「輸光命」**完全相同**，見 **P1-1** |

### ⑦ 1-4 三條過關路（各驗一次）

| 路徑 | 重現 | 結果 |
|---|---|---|
| **踩頭 3 次** | `?level=1-4` → 走到魔王房（`ST.Boss.active`）→ `ST.Boss.stomp()` ×3（間隔 70 幀避開 60 幀無敵） | `hp 3→0`、`ST.Boss.dead=true`、60 幀後 `mode='clear'`、`cleared=true` ✅ |
| **斧頭**（真的走過去碰，非 API 直呼） | `GAME.dev.warp((246−6)×8)` 後**一路按右**直到 `ST.Boss.axe.taken` | 在 **col 245** 碰到斧頭、`keptCol=245`、**腳下仍是 `solid`**、`deaths=0`、之後 `mode='clear'` ✅ —— 上一輪 star-hero 回報的「碰斧頭 = 掉熔岩必死」**已修好** |
| **旗桿** | `GAME.dev.warp(248×8)` → 按右碰 GOAL | `mode='clear'`、`cleared=true`、`ST.Boss.dead=false`（純旗桿過關） ✅ |

魔王狀態機另外逐幀追了 500 幀：`walk(88) → jump(23) → throw(60，實吐 3 顆錘子，同時最多 3 顆在場) → rest(40) → walk …` 完整循環兩圈，與 star-world 的規格（walk ≤ 90 / 3 顆 × 20 幀 / rest 40）相符。

### ⑧ 音樂呼叫點（`ST.Audio.state().song` 實測）

| 時機 | 期望 | 實測 | 判定 |
|---|---|---|---|
| 標題畫面 | `title` | **`ground`**（`play('title')` 靜默失敗：song.js 的 `KEYS` 沒有 `title`） | ❌ **P2-2** |
| 1-1 / 1-2 / 1-3 / 1-4 | `ground` / `cave` / `sky` / `castle` | **完全正確** ✅ | ✅ |
| **魔王出現**（`ST.Boss.active = true`） | `boss` | **`castle`（從未切歌）**——`main.js` 沒有任何 `play('boss')` 呼叫點 | ❌ **P2-1** |
| 死亡 | `death` | `death` ✅ | ✅ |
| 過關結算 | `clear` | `clear` ✅ | ✅ |
| GAME OVER | `gameover` | `gameover` ✅ | ✅ |
| 無敵 | `invincible` | 從未播放（W1 沒有無敵星，`hero.power` 恆 0） | ⚠️ P3-1（設計如此） |
| 音效 | jump / stomp / coin / powerup / hurt / bump / die / goal | `state().lastSfx` 實測到 `coin` / `jump` / `goal` / `bump`；呼叫點在 `hero.js:151,166,172,238` 與 `main.js:501,521,524,526,575,652,664,724` 齊全 | ✅ |

### ⑨ 手機（`tools/mobile_shot.py`）

| 裝置 | 版面 | 觸控 START | 推右 30 幀 | A 跳 | 按鍵壓到畫面 |
|---|---|---|---|---|---|
| **iPhone 13 橫向**（750×342, DPR 3） | `NES_LAYOUT {x:179.5, w:391, h:342, scale 1.527, back 2, mobile:true}`，兩側各 ≥ 179 px 給按鍵 | ✅ `mode: play` | ✅ `x: 32 → 76` | ✅ `state='jump'`, `onGround=false` | ❌ `overlapping:false` |
| **Pixel 5 直向**（393×727, DPR 2.75） | `{x:0, y:0, w:393, h:344, scale 1.535, back 2, portrait:true}`，畫面貼上、下方黑帶放鍵 | ✅ | ✅ `x: 32 → 76` | ✅ | ❌ `overlapping:false` |

兩張圖都 Read 看過：搖桿 / A / B / SELECT / START / 全螢幕鍵齊全、完全不壓畫面、HUD 清楚、畫面 `colors=11 / maxSprLine=2`。

### ⑩ 單檔 dist

```
../卡比之星/.venv/bin/python tools/build.py --src star.html
../卡比之星/.venv/bin/python tools/shot.py --url "dist/星塵勇者.html" --query "level=1-1" --script "press right,b 120; tap a 1; step 20" --lint --out shots/agent_qa2s/j_dist.png
```
內嵌 **20 檔、缺 0 檔**，**436 KB**。`?level=1-1` 參數也有效、`lastSfx='jump'`、`missing: []`、
lint **PASS**（colors 11 / 25、maxSprLine 2、OAM ok、`spriteHeight 16`、`flicker true`）。圖與原始頁一模一樣。

### ⑪ 原創性

```
grep -rniE "mario|luigi|bowser|goomba|koopa|nintendo|famicom|toad|peach|yoshi|piranha|lakitu|hammer ?bro|任天堂|瑪利歐|馬力歐|碧姬|庫巴|耀西|栗寶寶" games/star/
```
`games/star/*.js`（會進 dist 的檔）命中 **0**。唯一一筆是 `test_star.py:13` 的**來源引用註解**（指向 `docs/research/…/01_超級瑪利歐兄弟.md`），不是遊戲內文字、也不進 dist。
遊戲內全部可見字串：`SCORE` / `COIN` / `TIME` / `WORLD` / `STARDUST HERO` / `WORLD 1` / `PRESS START` / `$ 2026 ORIGINAL`；
敵人叫 `roller` / `bouncer` / `flyer`、魔王叫「鐵鎚王」，都是原創名。**通過**。

## R2b-2 問題列表

### P1（會壞遊玩 —— 上線前必修）

| # | 問題 | 影響 | 重現指令 / 證據 | 截圖 | 建議負責 |
|---|---|---|---|---|---|
| **P1-1** | **`gameover` 模式完全沒有畫任何文字；而且「輸光命」與「破完 W1」用的是同一個模式、畫面一模一樣** | `games/star/main.js` 只有 `TITLE_LINES` + `drawTitle()` 一組文字（`main.js:430~444`），`g.mode = 'gameover'` 的分支（`main.js:837~845`）**只等 START、完全不畫東西**。玩家輸光命看到的是一張**靜止的關卡圖**（主角不見了、HUD `×0`），沒有「GAME OVER」、沒有「PRESS START」；破完 1-4（`won = true`）看到的是**一樣的東西**（連 `won` 都沒有拿來換文字）—— 贏跟輸長得完全一樣，第一次玩的人只會以為當機。與 qa2-cruiser 的 **P1-2**（STAGE CLEAR / GAME OVER 看不見）是同一類問題 | 輸：`star.html?debug=1&scale=1&mute=1&level=1-1` → `GAME.dev.setLives(0); GAME.dev.kill();` 推到 `state().mode==='gameover'` → 畫面無字（`shots/agent_qa2s/g_gameover.png`）。<br>贏：`?level=1-4` → `GAME.dev.warp(248*8)` 按右碰旗桿 → 結算跑完 → `{mode:'gameover', won:true}`，畫面仍無字（`shots/agent_qa2s/k_win.png`，魔王還站在那裡） | `g_gameover.png`、`k_win.png` | **star-hero** |

**建議修法**（沿用現成機制，約 15 行）：照 `drawTitle` / `clearTitle` 的寫法多兩組字：
`GAMEOVER_LINES = [{row:12, col:12, text:'GAME OVER'}, {row:15, col:10, text:'PRESS START'}]`、
`WIN_LINES = [{row:11, col:9, text:'WORLD 1 CLEAR'}, {row:13, col:11, text:'THANK YOU'}, {row:16, col:10, text:'PRESS START'}]`，
在進入 `gameover` 時依 `g.won` 選一組 `drawTitle(ppu, lines)`、離開時 `clearTitle`。
※ 寫文字前記得把 `ppu.scroll` 的名稱表對齊處理好（cruiser 的 P1-2 就是栽在只寫 nt0）——本作 `camX` 停在關卡尾端時 `camX % 512` 可能 ≥ 256，建議直接用「重畫整屏 + `budget.mute`」的既有作法（`rebuildScreen()` 那條路）。

### P2（體驗）

| # | 問題 | 說明 / 證據 | 建議 |
|---|---|---|---|
| **P2-1** | **魔王曲 `boss` 從未播放**。song.js 有 17.04 秒的 `boss`（A 小調 16 分下行動機），star-audio 在 PROGRESS 明寫呼叫點「魔王出現 → `ST.Audio.play('boss')`」，但 `main.js` 一個 `boss` 字串都沒有 | 【已修（fix-r4）】`grep -n "audio('play'" games/star/main.js` → 只有 `lv.music` / `title` / `clear` / `death` / `gameover`。實測走到魔王房 `ST.Boss.active === true` 時 `ST.Audio.state().song` 仍是 **`castle`** | `main.js` 的 play 分支裡偵測 `ST.Boss && ST.Boss.active` 由 false→true ⇒ `audio('play','boss')`；魔王死亡 / 離開魔王房 / 檢查點復活時再依 `ST.Boss.active` 決定回 `lv.music` 還是續播 `boss`（`respawn()` 也要一起改，不然死在魔王房復活會變回 castle）。**負責：star-hero**<br>**已修（fix-r4）**：根因不是關卡而是機器人 —— 受擊硬直（`state==='hurt'`）中按 A 無效，`playthrough_star.py` 卻把 A 一直按著，硬直結束也不會再觸發跳躍 ⇒ 「按著 A 走進坑裡」。機器人改成硬直中取消待發跳躍、恢復後重新決策。**icons2x 開著的新基準：4-1 cleared / 1197 幀 / 0 死**，`--w4` 四關全 0 死。 |
| **P2-2** | **標題曲不存在**：`main.js:776` 呼叫 `audio('play','title')`，但 `games/star/song.js:714` 的 `KEYS` 只有 `ground/cave/sky/castle/boss/invincible/clear/death/gameover` —— **沒有 `title`**。`play()` 吞例外回 `false`，所以標題畫面**照常播著 1-1 的 `ground`**，而且完全不會報錯 | 【已修（fix-r4）】`star.html?debug=1&scale=1&mute=1`（不帶 level）→ `ST.Audio.state().song` = **`ground`**（期望 `title`） | 二選一：**(a)** star-audio 在 `song.js` 補一首短的 `title`（8~16 小節、可重用 ground 的動機），`KEYS` 加 `'title'`；**(b)** star-hero 把 `audio('play','title')` 改成一個明確存在的 key。**推薦 (a)**，因為標題畫面沿用關卡曲會讓進關時「音樂沒有變化」，少了一個很關鍵的節奏斷點。順帶建議 `ST.Audio.play()` 遇到不存在的 key 時 `console.warn` 一行，這種靜默失敗很難抓。**負責：star-audio（主）+ star-hero（確認）**<br>**已修（fix-r4）**：`fits()` 放寬成「空白 **或** 純背景紋白名單（VEIN / CAVEBG / MBG / CSEA_T / CSEA_B / STAR_* / RAIL，kind 全是 none）」可覆蓋；看得出是東西的裝飾磚（雲 / 山 / 樹 / 草叢 / 火把 / 礦燈 / 齒輪 / 支撐梁 / 旗桿本體）一律不蓋。**旗桿球 16 / 16 關**，`attrOwners` 同步放寬 ⇒ 顏色跟著錨點。 |
| **P2-3** | **1-1 / 1-3 背景過於空曠**（總控已點名，這裡給實測密度）。逐磚統計四關的裝飾磚： | 【已修（fix-r4）】1-1：384 欄 = **12 畫面**，裝飾磚 66 ⇒ **5.5 磚 / 畫面**（雲 12 磚 = 6 朵、山 18 磚 = 6 座、灌木 12、樹 12 磚 = 6 棵）＝ 平均**一個畫面只有 0.5 朵雲 + 0.5 座山 + 1 叢灌木 + 0.5 棵樹**。<br>1-2：320 欄 = 10 畫面，20 磚（全是鐘乳石）⇒ **2.0 / 畫面**。<br>**1-3：384 欄 = 12 畫面，42 磚（星星 34、雲只有 4 磚 = 2 朵）⇒ 3.5 / 畫面，而且天空 14 列裡只有零星小星點**。<br>1-4：256 欄 = 8 畫面，10 磚（窗）⇒ **1.2 / 畫面**。<br>證據：`shots/agent_qa2s/b_11.png`（畫面上 2/3 是純藍）、`b_13.png`（天空幾乎全空）、`d_hurt.png`、`g_gameover.png` | 具體數字建議（都在 bg1..3 現有調色盤內，不需要新色）：<br>**1-1**：雲 6→**16 朵**（分成「高雲列 6 / 中雲列 9」兩條高度帶，別全擠同一列 —— 目前雲全在同一 row，所以上半屏完全空白）、山 6→**10 座**（山用 bg3、可交錯大小兩種）、灌木 6→**12**、樹 6→**10**。目標 **12~14 磚 / 畫面**，約等於原作草原關的密度。<br>**1-3**：雲 2→**12 朵**（天空關的雲要當「假地板」的視覺暗示，順便讓玩家看得出速度）、星點 34→**50** 並分 3 種大小、再加一條「遠山 / 雲海」剪影帶在 row 20~21（浮台下方），讓畫面有地平線。<br>**1-4**：窗 10→**16**，另加「火把」（2 磚、可用 anim 兩幀）每 2 畫面一支 —— 城堡黑底是對的，但需要幾個亮點當節奏標記。<br>**1-2** 可維持（洞窟黑底是還原的一部分），但建議在頂板下加一排「岩層紋」磚讓天花板不要是純色塊。<br>**負責：star-world**<br>**已修（fix-r4）**：`main.js` 匯出 `CR.muteBudget`，`credits.js` 的 `skip()` 把整批寫入包起來。實測 `overFrames 0`、`peak 0`（修前 1 / 960）。 |
| **P2-4** | **主角造型辨識度不足**（總控已點名）。放大看過 `shots/agent_qa2s/z_hero_zoom.png`：**黑色描邊是有的**（這點總控的描述可以修正），問題在**剪影沒有特徵**——頭是一個圓角矩形兜帽、臉是一塊平坦的膚色方塊 + 兩條眼線 + 一條嘴，身體是一塊藍色橢圓 + 一條橫向膚色帶（本意是手臂，看起來像腰帶）。縮到實際大小（`b_11.png`）就變成「一個藍色小人」，跟敵人以外的東西沒有記憶點 | 【已修（fix-r4）】`z_hero_zoom.png`（6 倍放大）、`h_hud.png`（4 倍）、`b_11.png`（3 倍實際遊玩大小） | 用**剪影**解決，不加色數（精靈調色盤 0 仍是 3 色 + 透明）：<br>① **頭上加不對稱特徵**：兜帽右後方拉出一條 4~6 px 的**尖角 / 帽尾**（靜止時垂下、跑步時後飄 1 px），這一筆就能讓剪影在 16 px 寬裡立刻可辨。<br>② **加圍巾**：脖子位置往後拉 6~8 px 的飄帶（用第 3 色，跑步 / 跳躍時改用另一組磚讓它上揚）——比帽子更能傳達「速度」。<br>③ **臉別佔滿頭**：目前膚色塊 10×6 太大，縮成 6×4 並把兜帽開口收窄，頭就不會看起來像「戴頭套的大臉」。<br>④ **手臂與軀幹分離**：現在的橫向膚色帶請改成「軀幹兩側各一段 2×4 的手臂」，走路 3 幀讓手臂前後擺動 1 px —— 動起來的辨識度比靜態造型更重要。<br>⑤ 胸口加一個 2×2 的**星形徽記**（呼應「星塵」），第 3 色即可。<br>**負責：star-hero（`chr_hero.js`）**<br>**已修（fix-r4）**：`ST.SubWeapon.kindOf()` 正規化（吃 `'fire'` / `'DART'` 也吃數字），`give()` 與 `dev.giveSub()` 都走它；不認得的名字照樣回 false。 |
| **P2-5** | **GAME OVER 之後永遠回不到標題畫面**。`main.js:837` 的 gameover 分支按 START 直接 `loadLevel(g.startLevel); g.mode='play'` —— 標題畫面在整個 session 裡只出現一次 | `flow.py` A_after_start：`{mode:'play', level:'1-1', lives:3, score:0, x:32}`（期望先回 `title`） | 改成 `g.mode='title'; drawTitle(ppu0); audio('play','title')`，讓玩家回到標題（也順便讓 P1-1 的 GAME OVER 文字有地方去）。若想保留「快速重試」，可以做成「START = 重玩、SELECT = 回標題」。**負責：star-hero** |

### P3（小瑕疵 / 記錄）

| # | 問題 | 證據 / 建議 |
|---|---|---|
| P3-1 | **無敵曲 `invincible`（7.99 s）與無敵狀態整個沒用上** | `hero.power` 契約欄位恆 0、W1 沒有無敵星道具（star-hero 已在 PROGRESS「已知問題 2」自陳）。曲子與 `ST.Enemies.starKill()` / `g.onStar` 介面都已備好，等 R3 放道具時直接接。**不是 bug，只是提醒別忘了這條線已經拉好了**。 |
| P3-2 | **機器人 seed 3 的 1-1 要 14159 幀（其他 seed 約 1400 幀，10 倍）** | `tools/playthrough_star.py --all --seed 3` → `1-1 cleared=True frames=14159 deaths=3`。過是過了，但顯示「卡住 → 往左退 → 換策略」的脫困迴圈在某些起始亂數下會來回磨很久。建議在 `stuckN > 5` 時直接跳到下一組策略（而不是只加大回退量），或把 20 組策略表洗牌順序也吃 seed。**負責：star-hero** |
| P3-3 | **1-4 的旗桿實際上碰不到**：斧頭在 col 246、旗桿在 col 248，往右走**一定先踩到斧頭**（實測在 col 245 就觸發）⇒「旗桿過關」這條路只有用 `warp` 才走得到 | 不影響過關（三條路都會 `cleared`），但如果旗桿是刻意留的第三條路，建議把斧頭往左挪到 col 240~242 之外的**橋尾實地**、或把旗桿移到斧頭左邊，讓玩家真的能二選一。**負責：star-world** |
| P3-4 | **「鐵鎚王」手上沒有錘子**，而且實際只畫到約 24×30（精靈格 32×32，肩寬沒吃滿，star-world 自陳） | `z_boss_zoom.png`（放大看：金冠 / 黃眼 / 金腰帶 / 金靴都很清楚，剪影不差，但名字與造型對不上）。建議 idle / walk 幀就讓他**扛著一把錘子**（2~3 磚），throw 幀把錘子舉起——玩家看一眼就知道要閃什麼。順帶把肩寬撐到 30 px。 |
| P3-5 | **受傷無敵 120 幀 ≠ 研究的 168 幀** | 這是 **R2b 契約明文指定**（TASKS「無敵 120 幀閃爍」），不是偏差；只是 PLAN §1 寫「手感以研究的反組譯數字為準」，兩份文件對這個數字不一致。建議總控擇一定調並在 PLAN / TASKS 註明（120 幀 = 2.0 秒，比原作短 0.8 秒，對 1-3 / 1-4 的密集敵人區其實偏嚴）。 |
| P3-6 | **HUD 的命數圖示（主角頭像 `^`）在 1 倍下是一團灰點** | `h_hud.png`（4 倍）勉強看得出是頭，`b_11.png`（3 倍）就只剩灰塊。金幣圖示 `@` 同樣偏糊。建議兩個圖示都改成「高對比外框 + 內部只留 2~3 個像素」的寫法（HUD 用 bg 調色盤 0，白 + 灰兩色就夠）。 |
| P3-7 | **過關沒有旗桿下滑動畫、沒有 `COURSE CLEAR` 文字**，只有 HUD 的時間換分在跑 | `f_clear.png`：主角站在旗桿底下不動、旗子也沒降。原作是「抓桿下滑 → 走進城堡」。PLAN 把這類演出排在 R4 / R5，此處僅記錄。 |
| P3-8 | **正常遊玩完全用不到「每線 8 精靈」上限**（40 個取樣點的 `maxSpritesLine` 峰值只有 6、`flickered` 全程 0） | 與 qa2-cruiser 的 P3-5 同一觀察。不是 bug，但表示關卡的同屏敵人密度還很保守（W1 敵人池 12 隻、實際同屏 ≤ 3）。若想更「原汁原味」（原作 1-1 常態就在閃爍邊緣），R3 可以把編隊放密一點。 |
| P3-9 | `ST.Boss.hammers` 是 `NES.SH.Pool` 物件、沒有 `.length`；`ST.Boss.state().hammers` 才是陣列 | qa 寫腳本時踩到（誤判成「魔王從不丟錘子」，實際上一切正常、同時最多 3 顆）。建議在 `docs/ENGINE_API.md` 或 star-world 的 PROGRESS API 表註明「`Boss.hammers` = Pool、要陣列請用 `state().hammers`」。 |
| P3-10 | `games/star/test_star.py:13` 的註解出現「超級瑪利歐兄弟」 | 純來源引用（指向 `docs/research/`），不是遊戲內文字、不進 dist，**不違規**；與 cruiser 的 P3-3 同性質，記錄備查。 |

## R2b-3 截圖索引（全部 Read 看過圖）

| 檔案（`shots/agent_qa2s/`） | 內容 | 重點 |
|---|---|---|
| `a_title.png` | 標題 | `STARDUST HERO` / `WORLD 1` / `PRESS START` / `$ 2026 ORIGINAL`，底下是 1-1 的實景 |
| `b_11.png` / `b_12.png` / `b_13.png` / `b_14.png` | 1-1 草原 / 1-2 洞窟 / 1-3 天空 / 1-4 城堡 | 1-1、1-3 上半屏大片空白（P2-3）；1-2 的岩壁質感與鐘乳石不錯；1-4 磚牆 + 熔岩 + 鎖鏈很有味道 |
| `c_boss.png` / `c_boss_throw.png` | 魔王房 / 丟錘瞬間 | 鐵鎚王剪影清楚（金冠 + 黃眼 + 金靴），錘子是小黃點（P3-4） |
| `d_hurt.png` | 受傷 | 閉眼 + 雙手張開，閃爍中的顯示幀，頭上有金幣粒子 |
| `e_dead.png` | 死亡 | 主角躺姿往下掉出地面 |
| `f_clear.png` | 結算 | 旗桿 + 旗子、`SCORE 005000`、`TIME 220` 正在換分 |
| `g_gameover.png` | GAME OVER | **畫面上沒有任何文字**，HUD `×0`（**P1-1**） |
| `k_win.png` | 破完 W1 | **與 `g_gameover.png` 同樣沒有文字**，魔王還站著（**P1-1**） |
| `h_hud.png` | HUD 特寫（4 倍） | `SCORE 123450`｜`@×17`｜`TIME 287`｜`WORLD 1-1`｜`^×4`，五欄全部清楚 |
| `i_axe.png` | 斧頭 / 旗桿區 | 斧頭在橋外實地上，主角站著沒掉熔岩（上一輪 P1 已修） |
| `j_dist.png` | `dist/星塵勇者.html` | 單檔可玩、畫面與原始頁一致 |
| `m_land.png` / `m_land_right.png` / `m_port.png` | iPhone 13 橫 / Pixel 5 直 | 按鍵不壓畫面、主角跳起來 |
| `z_hero_zoom.png` / `z_boss_zoom.png` | 主角 / 魔王 6 倍放大 | 給美術改造型用（P2-4 / P3-4） |
| `lint/*.png`（40 張） | 四關 × 每 60 幀 | 外部 `nes_lint.py` 全 PASS |

## R2b-4 給各 agent 的一句話

| agent | 一句話 |
|---|---|
| **star-hero** | 手感 12 項獨立複測**全部 0 幀差**、機器人 12 / 12 通關、預算與 lint 全綠 —— 核心非常紮實；請補 **P1-1 的 GAME OVER / 破關文字**（贏跟輸現在長得一模一樣）、**P2-1 魔王曲呼叫點**、**P2-5 回標題**，再花點時間在 **P2-4 主角剪影**（加帽尾或圍巾 + 手臂分離，一筆就能解決辨識度）。 |
| **star-world** | 上一輪的斧頭 P1 修得很乾淨（真的走過去碰，`deaths=0`、腳下是實地），1-4 從 18 死降到 1 死；四關 lint 與可達性都沒問題。主要待辦是 **P2-3 的裝飾密度**（1-1 雲全擠在同一列、1-3 整片天空只有 2 朵雲），以及 P3-3 旗桿實際碰不到、P3-4 魔王手上該有錘子。 |
| **star-audio** | 9 首曲 + 9 音效品質沒話說，四關曲 / 死亡 / 過關 / GAME OVER 的切歌實測全對。唯一缺口是 **`title` 這個 key 不存在**（P2-2）—— main.js 一直在呼叫它、一直靜默失敗；請補一首短標題曲，並考慮讓 `play()` 對未知 key 出一行 warn。魔王曲 P2-1 是 main.js 沒接，不是你的問題。 |
| **總控** | R2 的兩條完成定義（±1 幀、W1 機器人通關）**確實達標**，可以收 R2b。P1-1 是「缺畫面」不是「壞程式」，若照 PLAN §4 把「標題 / 選單 / 結算」留給 R4 也說得通 —— 但**贏與輸畫面完全相同**這點建議至少在 R2b 收尾前補掉。另請定調 P3-5（受傷無敵 120 vs 研究 168，PLAN 與 TASKS 目前不一致）。 |

---

# R4 qa-r4（2026-10-08）

《星塵勇者》W3 / W4 / meta（含使用者回饋「圖示 2×」）＋《星塵巡航艦》R4 ＋《星塵機甲》R1 的**實玩驗收**。
對象：`games/star/*`（star-w3 / star-w4 / star-meta 三張卡）、`games/cruiser/**`（cruiser-r4）、
`games/mech/**` + `mech.html`（mech-r1）、以及三位 agent 同時插進 `games/star/main.js` / `star.html` 的結果。
**本輪沒有改任何 games / engine / tools 的程式**（一行可修的 P1 也沒出現）。
自寫驗收腳本放 scratchpad（`levels.py` / `meta*.py` / `cruiser*.py` / `mech.py` / `stat.py` / `final.py` / `goal.py`），
截圖 15 張在 `shots/agent_qa_r4/`，**每一張都用 Read 看過**。指令一律 `PY=../卡比之星/.venv/bin/python`。

## R4-0 總評

**通過，沒有 P1。** 四張卡的宣告數字都複驗得出來，而且是獨立腳本量的，不是只看各自的 `test_*.py`：

| 完成定義 | 結果 |
|---|---|
| `bash tools/run_all.sh` | **總結 PASS**（EXIT=0）：node --check **69 檔**、**19 支測試全綠**、4 個 `build --check`、冒煙截圖、`nes_lint` 抽查 8 張 0 違規 |
| 測試總數 | **3,311 項 / 0 失敗**（逐支複跑，見 R4-1 ①） |
| 還原標準（W3 / W4 八關 × 1500 幀 × 每 150 幀取樣 80 點） | 色數 **7~18 / 25**、非法像素 **0**、`budget.overFrames` 全程 **0**、OAM 合法、console error **0** |
| 精靈 bank 切換回歸 | 3-1 → 1-1 → 4-1 → 1-1 → 3-4 → 2-1 → 4-4 → 2-1 來回切，**1-1 / 2-1 的畫面與全新載入逐像素完全相同**（md5 一致）⇒ W1 / W2 不花圖 |
| 通關機器人 | `--w3` 四關 **0 死**、`--w4` 四關 cleared（**4-1 多了 1 死，見 P2-1**）、cruiser `--chain` 七關 **ending / 47610 幀 / 0 死 / 376650 分 / rank 7·均 6.1 / 連戰 9-9**、mech `--all` **兩關 0 死 / 3821 幀** |
| 使用者回饋「圖示放大一倍」 | 金幣 **663 / 688 錨點**變 16×16、? 磚 **97 / 97**、磚塊 **131 / 131** 變 8×16；延伸格是 oneway、實測落下站在視覺頂端（foot = 152 = 延伸格上緣，**沒有站進磚裡**）；撿取範圍確實放大。**旗桿頂端球只有 9 / 16 關變大 → P2-2** |
| 手機 | iPhone 13 橫向：星塵勇者 3-1 與世界地圖、巡航艦「編隊」鈕（實際點兩下 TRAIL → ORBIT）、星塵機甲全部 `overlapping: false`、觸控端對端有效 |

**找到 0 個 P1、4 個 P2、6 個 P3。**

## R4-1 通過清單（含數字）

### ① 測試逐支複跑（`run_all.sh` 之外再單跑一次）

| 測試 | 項數 | 測試 | 項數 |
|---|---:|---|---:|
| `tools/test_apu.py` | 103 | `games/cruiser/test_stages.py` | 218 |
| `tools/test_chr.py` | 91 | `games/demo/test_demo.py` | 55 |
| `tools/test_core.py` | 108 | **`games/mech/test_mech.py`** | **150** |
| `tools/test_ppu.py` | 144 | **`games/star/test_meta.py`** | **182** |
| `tools/test_shmup.py` | 168 | `games/star/test_star.py` | 249 |
| **`tools/test_touch.py`** | **340** | `games/star/test_w1.py` | 177 |
| `games/cruiser/test_cruiser.py` | 303 | `games/star/test_w2.py` | 187 |
| **`games/cruiser/test_r4.py`** | **115** | **`games/star/test_w3.py`** | **169** |
| `games/cruiser/test_song.py` | 154 | **`games/star/test_w4.py`** | **224** |
| `games/cruiser/test_stage1.py` | 174 | **合計** | **3,311 / 0 FAIL** |

> `test_touch.py` 是 **340** 項不是 cruiser-r4 PROGRESS 寫的 255 —— mech-r1 把 `mech.html` 加進去了（+85），
> 但 mech-r1 的 PROGRESS 又寫「我沒有動那個檔、請別人加」。**兩份 PROGRESS 互相矛盾，以實測 340 為準**（P3-1）。

### ② 《星塵勇者》W3 / W4 八關（機器人驅動、每 150 幀取樣）

| 關 | 色數範圍 | 非法像素 | 每線精靈峰值 | overFrames | 機關（關卡資料） |
|---|---|---:|---:|---:|---|
| 3-1 | 12 ~ 17 | 0 | 6 | 0 | 樹菇 3 / 藤蔓 2 / 孢子雲 2 |
| 3-2 | 13 ~ 18 | 0 | **10** | 0 | 樹菇 4 / 藤蔓 2 / 孢子雲 3 / **螢火暗區 1** |
| 3-3 | 11 ~ 14 | 0 | 5 | 0 | 樹菇 5 / 藤蔓 3 / 孢子雲 4 |
| 3-4 | 8 ~ 11 | 0 | 7 | 0 | 樹菇 2 / 藤蔓 3（= 魔王第二打法）/ 孢子雲 3 + 魔王 treelord |
| 4-1 | 7 ~ 11 | 0 | 6 | 0 | 輸送帶 2 / 雷射 3 / 升降台 2 |
| 4-2 | 10 ~ 11 | 0 | **11** | 0 | 輸送帶 5 / 雷射 3 / 升降台 3 |
| 4-3 | 9 ~ 14 | 0 | 7 | 0 | 輸送帶 3 / 雷射 5 / 升降台 4 |
| 4-4 | 9 ~ 13 | 0 | **10** | 0 | 輸送帶 2 / 雷射 2 / 升降台 2 + 魔王 guardian |

`__nes.lint()` 八關 80 個取樣點 **全部 ok=true**；每線精靈 > 8 的三關由 PPU 輪替處理（`lint.ok` 仍 true，
與 R2b 壓測的結論一致），但**比 W1 / W2 明顯常見**（見 P3-2）。
機關是**時間的純函式**：同一個 `t` 連查兩次 `liftTops` / `laserAt`，17 個取樣點結果完全相同 ⇒ 機器人推演有效。

**備援路線**：1-4 / 2-4 / 3-4 / 4-4 **都掃到旗桿磚**（GOAL 11~14 格、GOAL_TOP 1 格，col 246~248）⇒
「繞過魔王碰旗桿」這條友善路線四個世界都在。
**W4 重裝守衛**（研究 04 §2 第二解法「等時機」）實測 400 幀裡 **closed 293 / open 107** ⇒ 兩個窗口都真的會出現。

### ③ W3 魔王「兩條打法」與 W4 魔王

| 打法 | 實測 |
|---|---|
| ② 藤蔓衝撞（`hero.vineStrike > 0`） | 一次 **hp 5 → 3（扣 2 格）**、`vineHits=1`、**不必等 open** ⇒ 3 次可解 |
| ① open 時踩樹心 | `phase='open'` 時踩頭 **hp −1**、`stomps=1` |
| ①的反面：非 open 踩頭 | **hp 不變**、`bounces=1`（樹皮護甲「可讀的無效打擊」）⇒ 兩條打法的區分真的做出來了 |
| 4-4 魔王模組 | `lv.bossKind='guardian' → ST.BossW4`（`dev.g().bossMod` 比對通過） |

### ④ 精靈 bank 切換（W3 / W4 → W1 / W2 不花圖）

| 切關順序 | bank | 1-1 / 2-1 的畫面 md5 |
|---|---|---|
| 3-1 | `st_spr_w3` | — |
| **1-1** | `st_spr` | `2a840f5c…` = **與全新載入完全相同** |
| 4-1 | `st_spr_w4` | — |
| **1-1** | `st_spr` | `2a840f5c…` **同上** |
| 3-4 → **2-1** | `st_spr_w3` → `st_spr` | `cea0af1e…` = **與全新載入完全相同** |
| 4-4 → **2-1** | `st_spr_w4` → `st_spr` | `cea0af1e…` **同上** |

⇒ `ST.SprBanks.apply()` 的來回切換**沒有任何殘留**，`ppu.render()` 每幀清 `_tileCache` 的做法成立。

### ⑤ 世界地圖 / 密碼 / 副武器（全部用鍵盤真的按，不是只叫 API）

| 項目 | 實測 |
|---|---|
| 標題 SELECT 輪替 | `1 → 2 → 3 → 4 → PASSWORD(0) → 1 → 2 → 3`（三位 agent 各插各的，輪替沒打架） |
| 標題 UP / B | 兩個鍵都進 `mode='map'`；標題列 15 有 `UP OR B = WORLD MAP` 提示 |
| 地圖版面 | 4 個關卡節點 + 1 個道具屋節點、links 0-1-2-3-4；lint 10 色 / 每線 2 精靈 |
| 走格子 | ←←→ 三次換節點（3→2→1→2），中途 `walking=true`、`steps` 1→2→3（走路動畫在跑） |
| 打勾 | `clearLevel()` 後 `cleared` mask 生效、地圖上出現打勾圖樣（截圖 09） |
| 鎖住 | 未通關的下一關按 A ⇒ `msg='LOCKED'`、不進關 |
| 道具屋 | 走到 `$` 節點按 A 開店 → 買 FIRE BALL **金幣 80 → 70**、`hero.subOwned 0 → 1`、`subAmmo 0 → 15`；金幣歸零再買 ⇒ `NOT ENOUGH COINS` |
| 密碼：破關顯示 | 破關畫面列出 `CODE AAAHE AANNB`（10 字母，字母表 `ABCDEFGHJKLMNPRT`） |
| 密碼：輸入 | 標題 SELECT 到 PASSWORD → START 進輸入畫面 → ↑↓←→ 逐格打出同一組碼 → START ⇒ **通關位元 7 / 命 4 / 分數 12000 全部回來**，並直接進該世界地圖 |
| 密碼：壞碼 | 改第 1 個字母 ⇒ `ST.Password.valid()=false`、`applyCode()=false`、通關位元**維持 0** |
| 副武器：取得 / 發射 | `give(FIRE,15)` ⇒ `hero.sub=1`；按 **B** ⇒ `shots 0→1`、`subAmmo 15→14`、畫面上 `live=1` |
| 副武器：切換 | **↓ + B** 與 **SELECT** 都切得動（`sub 2→1→2`、`switches=2`） |
| 副武器：手感 | 按住 `right+B` 跑 60 幀，**有 / 沒有副武器的 x 都是 184（±0）** |
| **護甲礦兵 2 發** | 2-3 的 armor：第 1 發 `subHp 2→1`（不死）、**第 2 發 `subHp→0` 且 kills+1** ⇒ 研究 04 §2 第二解法成立 |
| 一般敵 1 發 | 1-1 的 roller：**第 1 發就擊殺** |
| 魔王免疫 | `ST.SubWeapon.IMMUNE = {boss:1, hammer:1, axe:1}` |

### ⑥ 使用者回饋「圖示放大一倍」（R3 ↔ R4 對照）

對照方式照指示用 **`GAME.dev.icons2x(false)` 前後比對**（截圖 06 = OFF / 07 = ON，同一關同一幀）。

| 物件 | 規格 | 實測（`ST.Icons2x.nameAt` + `GAME.dev.kindAt`） |
|---|---|---|
| 金幣 | 2×2 = **16×16** | 四塊 `I2_COIN_BL/TL/BR/TR` 都長出來；延伸格 `kindAt` **不是 solid 也不是 oneway**（碰撞 0 改動） |
| 旗桿球 | 2×2 = **16×16** | 1-1 四塊 `I2_BALL_*` 齊全（截圖 02 看得出球比旗子大一圈） |
| ? 磚 / 用過的磚 / 磚塊 | 1×2 = **8×16** | `I2_QB_B/T`、`I2_BR_B/T`；**本格 solid、上方延伸格 `oneway`**；關掉 icons2x 後延伸格回 `none` |
| **沒有站進磚裡** | 腳底 = 視覺頂端 | 從上方自由落下 ⇒ `onGround=true`、`foot=152`、延伸格上緣 `(r−1)*8=152`，**差 0 px** |
| 撿取範圍變大 | 碰到看得到的那一塊就撿到 | 主角擺在延伸格（錨點上方一列、沒碰到錨點）⇒ `coins 0 → 1` |
| 每線 8 精靈 | 本輪一個精靈都沒加 | 1-1 / 2-1 開關 icons2x **maxSprLine 都是 2**、色數 11 / 10 |
| 覆蓋率（16 關全掃） | — | 金幣 **663/688**、? 磚 **97/97**、磚塊 **131/131**、**旗桿球 9/16（P2-2）** |

### ⑦ 《星塵巡航艦》R4

| 項目 | 實測 |
|---|---|
| 第 7 關九隻魔王 | `?stage=7&rush=1..9` 九隻**都進得去**（`bossActive=true`、`far=0..8`）、**九張畫面逐像素互異（9/9）**、色數 13~15、每線精靈 ≤ 8、`overFrames=0` |
| rank 升 | 裝滿（LASER + OPTION×2 + 護盾）跑 4000 幀 ⇒ **rank 7**（equip 4 + surv 3）、彈速 ×1.4375、砲台週期 ×0.688、瞄準 3 發、fan +2、預判開 |
| rank 降 | 死一次 ⇒ **rank 7 → 1**（penalty 3、surv 歸零），倍率回 **1.000 / 1.000**（＝ R3 手感） |
| 開局 | **rank 0、bulletMul 256、periodMul 256** ⇒ 每次復活後都與 R3 相同 |
| `?rank=0` | `enabled=false`、`periodMul=256`、`turretPeriod(1)=90`（**R3 的數字一個沒動**） |
| 波動 RIPPLE | 能量表格 3：**第 1 次 DOUBLE、第 2 次 RIPPLE**；格 4 LASER 會把 ripple 關掉（三者互斥）；`RIPPLE_SEG=8 / MAX_SEG=3 / GROW=6` ⇒ 8 → 24 px |
| Option 編隊 | 遊戲中 SELECT：**TRAIL → FIXED → ORBIT → TRAIL**（`optSwitches=4`） |
| 手機「編隊」鈕 | iPhone 13 橫向：`#cr-optbtn` 文字「編隊」、`display:flex`、rect (58,4,64,34)，**不壓畫布（x≥179.5）也不壓全螢幕鈕（x≤53）**；實際點兩下 ⇒ **TRAIL → ORBIT、switches=2** |
| 七關隱藏獎勵 | 七關**各觸發一次**：1 TOP LANE→1up／2 CRAWLER HUNT→clear／3 MOAI HUNT→1up／4 LOW LANE→clear／5 TENTACLE HUNT→1up／6 QUAD GUN HUNT→clear／7 DEAD CENTER→1up，`found` 逐關累加、獎勵與條件表完全相符 |
| 結局流程 | 機器人打到 **ENDING** → START → **credits**（名單捲動）→ 名單結束 → **entry**（3 字母：↑↓ 換字母 / ←→ 移游標有效）→ START → **scores**（前 10 名、第 2 名就是剛打的 184500 ST7）→ START → **第二輪（loop=1、stage=1）** |
| 排行持久化 | `localStorage.cruiser_scores` 寫入 10 筆 `{n,s,st,l}` |
| 機器人 `--chain` | **ending / 47610 幀 / 0 死 / 22 條命 / 376650 分 / rank 峰 7 均 6.1 / 連戰 9-9**（與 PROGRESS 宣告**一模一樣**） |

### ⑧ 《星塵機甲》mech-r1

| 項目 | 實測 |
|---|---|
| 選關畫面 | 9 格、`FROST OPEN` / `BLAZE OPEN` / 7 格 `COMING`；游標四向移動（sel 0→1→4→3→0）；START → `ready` → `play`；lint 7 色 |
| 兩關每一間房 | **14 間房全部 lint ok**、色數 **8~14**、非法像素 0、每線精靈峰值 **8**、`overFrames` 全 0 |
| 換房方向 | frost：right ×5 + **up**（梯子 col 3）；blaze：right ×4 + **down**（洞 col 17）+ **up**（梯子 col 28） |
| 換房不花圖 | 實跑「往右換房」：**過場每一幀 lint 都合格（badFrames=0）**、單幀名稱表尖峰 **45 byte ≤ 160**、`overFrames=0`；**往左回頭**也正常（回到 room 0、0 張壞幀） |
| 兩頭目 | `1-G BOSS` / `2-G BOSS` 各一隻 **HP 28 / 32×32**，`mode='drop'` 進場、lint 9 / 10 色 |
| 弱點循環 | `MG.Weapons.DMG` = `frost: {buster 1, buster1 2, buster2 3, frost 0, blaze 10}`、`blaze: {… frost 10, blaze 0}` ⇒ **互剋 ×10、自己的武器 0 傷** |
| 武器選單 | START 開啟 ⇒ `paused=true`；選單中按右 30 幀**主角 x 完全沒動**（真凍結）；↑↓ 換選項（menuSel 0→1→2→0→1）、START 關閉並套用（`weapon='frost'`）；lint 3 色 |
| 一鍵密技 | 遊戲中按 **C**：`life 5 → 28`、`cheats 0 → 1`、`lastCheat='secret'`；GAME OVER 按 **C**：`mode` 離開 gameover、`continues=1` |
| 機器人 | `--all`：**frost 2302 幀 / 0 死 / 剩血 17**、**blaze 1519 幀 / 0 死 / 剩血 25（用剛拿到的 FROST SHOT）** |
| 手機 | iPhone 13 橫向進關卡：7 顆鍵齊全、`overlapping: false`、觸控有效 |

### ⑨ 三位 agent 同時插 `games/star/main.js` / `star.html` 的結果

| 檢查 | 結果 |
|---|---|
| `star.html` 載入順序 | engine 12 支 → W1/W2 13 支 → **W4 6 支 → W3 6 支** → icons2x → password → subweapon → worldmap → main.js。`ST.SprBanks` 由 `chr_w4.js` 先建、`chr_w3.js` 用 `ST.SprBanks \|\| (…)` 接受既有的 ⇒ **沒有互相覆寫** |
| `LEVEL_ORDER` | `['1-1'..'2-4']` → `.concat(W4).sort()` → `.concat(W3).sort()`，實測 `dev.levels()` 排序正確、16 關都在 |
| `WORLD_FIRST` | `{1,2}` + `[4]`（w4 插）+ `[3]`（w3 插）；`toggleTitleWorld()` 改走 `WORLD_FIRST` 迴圈 ⇒ **W3 自動被吃到，不用再改一次** |
| 標題 SELECT 輪替 | `1→2→3→4→PASSWORD→1`（w4 的世界清單 + meta 的 `push(0)` 哨兵**疊在一起沒衝突**） |
| `bossKind` 分派 | hammer / colossus / treelord（w3 插）/ guardian（w4 插）四條分支互不覆蓋，4-4、3-4 都指到正確模組 |
| 背景 bank 合併 | `ST.BG_W4`（w4）+ `ST.BG_W3`（w3）+ `ST.BG_MAP` + `ST.BG_ICON2X`（meta）四處 `init()` 插入，實測 16 關 + 地圖畫面全部 lint 合格 |
| 既有測試 | `test_star.py` 249、`test_w1.py` 177、`test_w2.py` 187 **全綠**（只有 ⑤ 一條斷言被 meta 放寬成 `F_USED \|\| I2_US_B`，已記在 PROGRESS） |

⇒ **沒有打架。** 唯一的交互作用是 meta 的 `icons2x` 改變了 w4 的機器人路線（P2-1）。

## R4-2 缺陷表

> **收尾（fix-r4，2026-10-08）：P2 四條 + P3 六條全部已修**——每一列的標題欄標了「已修（fix-r4）」、
> 建議欄最後一行寫了實際修法與複驗數字。回歸測試 **+63 項**（`test_meta` 182→205、`test_w3` 169→186、
> `test_w4` 224→241、`cruiser/test_r4` 115→121），`bash tools/run_all.sh` 總結 PASS，
> 三款機器人（star `--all8` / `--w3` / `--w4` / `--map` / `--cheat`、cruiser `--chain`、mech `--all`）全通，
> 細節見 `docs/PROGRESS.md` 的 `## fix-r4（R4，2026-10-08）` 五節。

### P1

**無。**

### P2

| # | 卡 | 標題 | 重現步驟 / 證據 | 建議 |
|---|---|---|---|---|
| **P2-1** | star-meta × star-w4 | 【已修（fix-r4）】**`icons2x` 讓 4-1 的機器人從「0 死」變成「1 死」，F4-2 的驗收數字失效** | 同一支 `playthrough_star` 的 BOT_JS、seed 1、同一頁：<br>`GAME.dev.icons2x(true)` ⇒ 4-1 `cleared / 1388 幀 / **deaths 1** / 7400 分`<br>`GAME.dev.icons2x(false)` ⇒ 4-1 `cleared / **1149 幀** / **deaths 0** / 4000 分`（＝ star-w4 PROGRESS 的基準，一幀不差）<br>2-1 / 2-2 也會變（1126→1152 / 1128→1129，但 0 死），meta 已記；**4-1 這一條沒人記到** | 2× 磚的 oneway 延伸格多了落腳點，機器人改走上層路線後會摔一次。請 star-w4 或 star-meta 擇一：①把 4-1 那段的路線補一塊安全落腳 ②或正式把 `--w4` 的基準改成 `1388 / 1 死` 並在 PROGRESS 寫明原因。**不要**讓「四關 0 死」這條驗收標準無聲失效<br>**已修（fix-r4）**：根因不是關卡而是機器人 —— 受擊硬直（`state==='hurt'`）中按 A 無效，`playthrough_star.py` 卻把 A 一直按著，硬直結束也不會再觸發跳躍 ⇒ 「按著 A 走進坑裡」。機器人改成硬直中取消待發跳躍、恢復後重新決策。**icons2x 開著的新基準：4-1 cleared / 1197 幀 / 0 死**，`--w4` 四關全 0 死。 |
| **P2-2** | star-meta（圖示 2×） | 【已修（fix-r4）】**旗桿頂端球只有 9 / 16 關變成 16×16，另外 7 關還是 8×8** | 16 關全掃 `ST.Icons2x.nameAt(c,r,tileAt,cols)`：GOAL_TOP 錨點 16 個、只有 9 個長得出來。失敗的 7 關 = **1-2、2-1、2-2、3-1、3-2、4-1、4-2**。<br>逐格診斷（`goal.py`）：擋住的格子**全部是純裝飾背景磚**（`kind='none'`）——1-2 / 2-1 上方是 `VEIN`、3-1 是 `CSEA_T`、4-1 是 `MBG`、4-2 右邊是 `MBG`。1-1 的上 / 右 / 右上都是 `EMPTY` 所以成功 | `icons2x.js` 的 `fits()` 目前只接受 `TILE.EMPTY`。建議放寬成「`ST.solidKind(t) === 'none'` 且本身不是圖示錨點」就可以覆蓋（裝飾磚被蓋掉不影響可達性），或在那 7 關把旗桿上方兩格清成 EMPTY。**這是使用者親自提的「圖示放大一倍」，一半的關卡沒做到，看得出來不一致**（截圖 02 vs 05 對照）<br>**已修（fix-r4）**：`fits()` 放寬成「空白 **或** 純背景紋白名單（VEIN / CAVEBG / MBG / CSEA_T / CSEA_B / STAR_* / RAIL，kind 全是 none）」可覆蓋；看得出是東西的裝飾磚（雲 / 山 / 樹 / 草叢 / 火把 / 礦燈 / 齒輪 / 支撐梁 / 旗桿本體）一律不蓋。**旗桿球 16 / 16 關**，`attrOwners` 同步放寬 ⇒ 顏色跟著錨點。 |
| **P2-3** | cruiser-r4 | 【已修（fix-r4）】**credits 畫面按 START 快轉，那一幀寫 960 byte 名稱表、超出 VBlank 預算（整局唯一一次超支）** | `cruiser.html?debug=1&stage=7` → 機器人打到 ENDING（`budget.overFrames=0 / peak=72`）→ START 進 credits（**仍然 0 / 72**）→ **在 credits 畫面按 START 快轉** ⇒ `overFrames 0 → **1**`、`budget.peak 72 → **960**`。<br>來源：`games/cruiser/credits.js` 的 `skip()`：`while (nextRow < SEQ.length) { writeRow(nextRow); nextRow++; }` —— 一幀把剩下的 60 列全寫完，而且**沒有包 muteBudget**（`main.js` 其他 15 處轉場都有包） | 兩條都行：①把 `skip()` 的整批寫入包進 `muteBudget`（＝比照其他轉場，承認那是「畫面關閉的轉場幀」）②或讓 skip 只把捲動速度調到 8 px/幀，不要一次寫完。真機上這一幀寫不完 ⇒ 名單畫面會撕一幀<br>**已修（fix-r4）**：`main.js` 匯出 `CR.muteBudget`，`credits.js` 的 `skip()` 把整批寫入包起來。實測 `overFrames 0`、`peak 0`（修前 1 / 960）。 |
| **P2-4** | star-meta | 【已修（fix-r4）】**`GAME.dev.giveSub('fire')` 傳字串會靜默失敗（回 false、什麼都沒發生）** | `GAME.dev.giveSub('fire',5)` ⇒ `false`；`ST.SubWeapon.give(hero, ST.SubWeapon.KIND.FIRE, 15, g)` ⇒ `true`。`give()` 裡 `kind = kind \| 0` 把 `'fire'` 變成 0，再被 `kind !== KIND.FIRE && kind !== KIND.DART` 擋掉 | 這是給測試 / 機器人 / 後續 agent 用的 dev 介面，名字叫 `giveSub('fire')` 很自然會被這樣呼叫。在 `dev.giveSub` 加一行字串轉換（`{'fire':1,'dart':2}[kind] \|\| kind`）就好；不修也請在 `docs/TASKS.md` 註明「只吃數字」<br>**已修（fix-r4）**：`ST.SubWeapon.kindOf()` 正規化（吃 `'fire'` / `'DART'` 也吃數字），`give()` 與 `dev.giveSub()` 都走它；不認得的名字照樣回 false。 |

### P3

| # | 卡 | 標題 | 證據 / 建議 |
|---|---|---|---|
| **P3-1** | mech-r1 / cruiser-r4 | 【已修（fix-r4）】**兩份 PROGRESS 對 `tools/test_touch.py` 的說法互相矛盾** | cruiser-r4 寫「touch 255」、mech-r1 寫「我沒動那個檔、請別人把 mech.html 加進去（預計 +85）」；但 `git status` 顯示 `tools/test_touch.py` **已被改**，實測 **340 項**（255 + 85）。⇒ mech-r1 其實已經加了。請把 mech-r1 PROGRESS 的那段「跨檔需求」改成「已完成」，免得總控重複派工<br>**已修（fix-r4）**：mech-r1 那段「跨檔需求」改成「已完成」（`PAGES` 早就有 `mech.html`，實測 340 項），cruiser-r4 的 255 補上註腳；`test_touch.py` 的 docstring 也改成四個入口頁。 |
| **P3-2** | star-w3 / star-w4 | 【已修（fix-r4）】**W3 / W4 的每線精靈峰值比 W1 / W2 高很多（10 / 11 / 10 vs W1 的 6）** | 3-2 f750 = 10、4-2 f450 = 11、4-4 f1200 = 10。`lint.ok` 仍 true（PPU 走輪替，符合真機），但超過 8 的那幾條線玩家會看到敵人閃爍。建議在最密的那幾段把同列敵人錯開一兩列，或接受它（真機本來就會閃）<br>**已修（fix-r4）**：改編排 —— W4 橫走升降台（每座 4 顆精靈）抬離地面敵人那一帶、4-3 兩座垂直升降台的行程分上下兩段、W4 魔王齊射改高低兩條車道；W3 暗區縮到沒有寬樹菇 / 藤蔓的區段且螢火 3→2、3-3 / 3-2 的樹菇錯開掃描線、3-4 同屏地面敵 3→2、W3 魔王根刺 4→3 間距 28→34。**八關機器人全程每線峰值：3-1 7 / 其餘全部 8**（修前 7 / 10 / 9 / 10 / 8 / 11 / 10 / 10），不靠輪替。 |
| **P3-3** | star-meta | 【已修（fix-r4）】**道具屋畫面上方殘留一條地圖草地（列 5~7）**，其餘被清成黑底，看起來像沒清乾淨 | 截圖 10。若是刻意留的「店門口」就當它是設計；否則 `drawShop()` 清除範圍往上多清 3 列<br>**已修（fix-r4）**：`drawShop()` 從列 6 就開始清（列 6..25 全黑底），列 4..5 的 `WORLD n MAP` / `CLEAR nn/16` 保留。 |
| **P3-4** | star-meta | 【已修（fix-r4）】**世界地圖沿用遊戲中 HUD（列 1~2），所以地圖上會顯示 `TIME 300` 與 `WORLD 1-1`** | 截圖 09。地圖上「時間」沒有意義、`WORLD 1-1` 跟下排的 `LEVEL 1-3` 還會互相矛盾。建議地圖模式把列 1~2 換成「世界名 / 通關數」（`CLEAR 04/16` 已經在列 4 了）<br>**已修（fix-r4）**：地圖 / 密碼模式改用自己的上方 HUD（`hudMapStatic`）：SCORE / COIN / 命數照留，TIME 與 WORLD 兩欄清掉，原本 TIME 的位置改標 `WORLD MAP` / `PASSWORD`。 |
| **P3-5** | star-meta（圖示 2×） | 【已修（fix-r4）】**25 / 688 個金幣錨點退回 8×8**（水平相鄰時左邊那顆維持 1×1），同一排金幣會大小不一 | 3-1 48 顆裡 4 顆、3-2 50 顆裡 5 顆、3-3 47 顆裡 7 顆最明顯。這是 `fits()` 的刻意退路（已寫在 PROGRESS），但同一排混著大小兩種金幣比「全部都小」更顯眼。建議關卡資料把相鄰金幣改成隔一格（W3 三關即可解掉 16 顆）<br>**已修（fix-r4）**：`rowFits()` —— 同一排（同列、相鄰 ≤ 1 欄間隔）的同種圖示要嘛全部放大、要嘛全部退回。**16 關 0 排大小不一**；金幣 657 / 688 全部整排一致（擋住的是旗桿 / 礦燈 / 齒輪 / 支撐梁 / 地面）。 |
| **P3-6** | star-w3 | 【已修（fix-r4）】**旗桿的桿身與旗子仍是 8×8，頂端球放大後比例落差明顯** | 截圖 02：16×16 的球 + 8×8 的小旗子。star-meta 的「留給後續 3」已經記了（旗子在 (c+1,r+1) 會跟球搶格），這裡只是確認使用者視角上**看得出來**<br>**已修（fix-r4）**：旗子也 16×16，但錨點改左上、往「下 + 右」長（往上是球的格子）⇒ **16 / 16 關**。 |

## R4-3 給各卡的一句話

| 卡 | 評語 |
|---|---|
| **star-w3** | 四關 0 死、機關全部是時間純函式、兩條打法真的做得出區分（藤蔓 2 格 / open 踩頭 1 格 / 護甲只彈開），是本輪完成度最高的一張。只剩 P3-2 的精靈密度與 P3-6 旗子比例兩個小尾巴。 |
| **star-w4** | 精靈 bank 切換是本輪最重要的架構決定，**來回切八次逐像素零殘留**，做得非常乾淨；輸送帶 / 雷射 / 升降台三個機關都可推演。唯一要處理的是 **P2-1**：4-1 的 0 死基準已經被 icons2x 改掉了，請擇一處理，不要讓驗收標準無聲失效。 |
| **star-meta** | 地圖 / 密碼 / 副武器三個系統**用鍵盤一路按下來全部走得通**（含壞碼拒絕、金幣不足、護甲礦兵 2 發），接法也很克制。圖示 2× 的核心（oneway、碰撞不變、撿取放大）做得正確，但 **P2-2 旗桿球 7 / 16 關沒變大**是使用者直接看得到的落差，建議本輪收尾前補掉。 |
| **cruiser-r4** | 九隻連戰 9/9 互異、rank 升降與 `?rank=0` 回歸、七關隱藏獎勵、結局 → 名單 → 3 字母 → 排行 → 第二輪**整條流程實玩走通**，`--chain` 的數字與宣告一模一樣。只有 **P2-3** 一幀 960 byte 的快轉需要包起來。 |
| **mech-r1** | R1 就交出 14 間房全綠、四向換房單幀 45 byte、兩關 0 死、武器剋制環 ×10、選單真凍結、C 鍵密技與手機觸控都在 —— 以「第三款新遊戲的第一輪」來說完成度很高，本輪**沒有找到任何 P2 以上的缺陷**。只要把 P3-1 的 PROGRESS 說法更正即可。 |
| **總控** | R4 可以收。commit 前務必跑 **`$PY tools/stamp.py`**：`star.html` 新增的 **16 支**腳本（W4 6 + W3 6 + icons2x / password / subweapon / worldmap）、`cruiser.html` 的 4 支、`mech.html` 的**全部**都還沒有 `?v=` 戳記；另外 `mech.html` 目前是 untracked，`dist/` 三個入口也都還沒重產。 |

# R5 qa-r5（2026-11-13）

## 摘要
- 範圍：《星塵 8 合 1》`cart1.html` 選單 + 8 款。**沒有重跑**總控已經確認的 run_all 和 `playthrough_cart --all`。這次只看 agent 自評沒有涵蓋的部分：玩家流程、手機觸控、回選單提示用的 OAM 62/63、密技、原創性、BGM 旋律比對，還有「人類反應延遲」下的難度。
- 結論：**不需要擋版的功能性缺陷**。8 款都能走完整條流程：選單 → 標題 → 遊玩 → 暫停 → 結束 → 按住 START+SELECT 回選單 → 進下一款，過程沒有卡死、畫面殘留或頁面錯誤，回選單後選單 BGM 也有恢復。**手機上兩指同按 START+SELECT 回選單可以做到**（iPhone 13 直向和橫向，8 款全部回得來）。
- 缺陷：**P1 × 1（maze 原創性）、P2 × 2、P3 × 12**。
- 硬限制：機器人全程**強制開著回選單提示**（把 `CT.backProgress` 固定成 0.5）跑完 8 款，每線峰值 maze 5 / blocks 4 / brick 7 / pinball 7 / snake 2 / racing 8（車子自己就佔 8，跟提示無關）/ flyer 4 / tower 6，overFrames 全部是 0。另外統計提示所在的帶狀區（y16 起 8 或 16 線）裡**遊戲自己的精靈**：racing / brick / maze 是 0，flyer 是 1。所以在機器人走過的路線上，提示不可能讓任何一款超線。brick 人為壓力測試（加長 + 三球 + 雷射連發）：每線峰值 6，`stat.dropLine` 0。
- 密技：C 鍵在選單完全不會誤觸（`CT.current = null`），8 款遊玩中都有效。racing / tower 在**標題畫面**也會觸發，但開局會重設，沒有實害。

### 方法（重現用）
1. 腳本放 scratchpad，沒有新增工具檔。用 Playwright 開 `cart1.html?debug=1&scale=1&mute=1`，逐幀 `__nes.step`，每幀讀 `__nes.stats()` 和 `GAME.state()`，音樂狀態讀 `nes.music.state()`。
2. 觸控測試沿用 `tools/mobile_shot.py` 的 `Touch`（CDP 多點），座標取自 `NES.Touch.rects()`。
3. 「人類節奏」的做法：把 `CT.current.bot` 包一層 12 幀（200 ms）的延遲佇列。另外做了閒置、隨機和最小策略測試，再搭配參數推算。
4. 旋律比對：在 pulse1 / pulse2 上逐幀擷取 note-on，算音程序列，拿去跟 Korobeiniki、Pac-Man 開場、SMB 地上 / 地下、Zelda、Ode to Joy、DQ 序曲等常見主題比對（允許移調）。

## 缺陷表

| 編號 | 遊戲 | 重現步驟 | 預期 vs 實際 | 建議修法 | 證據 |
|---|---|---|---|---|---|
| **P1-1** | maze | 選單 → 星塵迷宮 → START，看第 1 張迷宮 NEBULA GATE | 預期：brief §1-4「不用其…配色」，整體觀感不能讓人看成某款商業遊戲。實際：第 1 張迷宮的整體視覺就是 Pac-Man 的招牌畫面：**黑底 + 深藍 / 淺藍雙線牆**（`maps.js` wall `[0x01,0x21]`）、黃色豆點、四角能量道具、中央帶門的巢、巢下方黃字 **`READY!`**、左下殘機、右下關卡，過關時牆**閃白**。追兵的顏色和個性配對也幾乎照抄：**紅 = 直追（Blinky）、粉 = 預判堵前方（Pinky）**、青；標題畫面「名字 + 一句個性」的角色表也是原作的格式。迷宮配置本身是程式產生的，屬於原創 | 1) 地圖 0 改掉藍色雙線牆（例如紫 / 青綠單線或有紋理的星雲牆），四張圖都不要用藍牆；2) `READY!` 換成原創字樣（例如 `LIFT OFF!` / `GO!`），位置也一起改；3) 追兵配色避開紅 / 粉 / 青 / 橘這組，個性和顏色重新配對；4) 過關閃爍不要閃白（例如換成星色漸層）；5) 標題角色表改成別的版式（例如圖示一排 + 下方輪播說明） | `shots/qa-r5/04_maze_map0_trade_dress.png`、`02_titles.png`（左上） |
| **P2-1** | 全部 8 款 | 任一款打到 GAME OVER → 按 C（或 ★密技） | 預期：依使用者在 R2c 定下的規則（memory `feedback-famicom-difficulty`：「GAME OVER 輸入續關」為標配），在 GAME OVER 時按密技要**立刻續關**。實際：maze / blocks / pinball / snake / flyer 的 `cheat()` 在結束畫面直接回傳 false，什麼都不做；brick 是命 +1，但還是要按 A 接關，而且分數歸零；racing 只多一次接關，畫面仍停在 over；tower 是生命 +10，但畫面停在 over，按 START 回標題 | 各款在 over（或 crash 後的最終狀態）時，`cheat()` 改成「原地續關」：maze / snake 回到同一關並補命；blocks 用星塵炸彈清 4 列後繼續；pinball 補 1 球；flyer 從同一道門、帶護盾重來；tower 回到本波開始時的狀態並補生命；racing / brick 直接接關不扣分 | 程式路徑：`maze/main.js:489`、`blocks/main.js:624`、`pinball/main.js:489`、`snake/main.js:637`、`flyer/main.js:573`、`tower/main.js:702,722`、`racing/main.js:711`、`brick/main.js:572,720` |
| **P2-2** | brick | 標題畫面 / 遊玩時吃膠囊；打到第 10 回合 | 預期：不使用商業作品的招牌元素。實際：膠囊字母 **E 加長 / L 雷射 / S 減速 / C 吸附 / P 加命**，字母和功能五個都和 Arkanoid 完全一樣；再加上 `ROUND 01 READY` 這種回合播報，以及最終關「大臉魔王」，三者疊起來的聯想很強。磚陣、球拍和魔王造型本身都是原創 | 膠囊改用**圖像**（例如放大鏡 / 三點 / 閃電 / 沙漏 / 磁鐵 / 心 / 盾）或另一套字母；回合播報改成原創字樣（例如 `SECTOR 01`）。魔王造型可以保留 | `05_brick_capsule.png`、`06_brick_boss.png`、`02_titles.png`（第 3 張） |
| P3-1 | maze / pinball / snake / racing / flyer / tower | 遊玩中按 START 暫停，等 2 秒 | 預期：紅白機慣例是暫停時 BGM 也停（blocks / brick 就是這樣做）。實際：這 6 款暫停時 BGM 照常播放（`rowsPlayed` 120 幀內 +20），8 款行為不一致 | 暫停時 `Audio.stop`（或 `NES.Music.stop`），恢復時重播；或者至少把旋律聲道關靜音 | t13 / t14 實測數字（見上方「方法」） |
| P3-2 | 全部 8 款 | 遊玩中拿到分數 → 按住 START+SELECT 回選單 | 預期：選單上的 BEST 反映剛才拿到的分數。實際：沒有任何一款在 `exit()` 裡存最高分。只有 maze 會在過關時存，其他款都要等 GAME OVER 或通關，中途離開分數就沒了。例如 pinball 打到 4750 分後離開，選單仍顯示 `0000000` | 各款 `exit()` 呼叫自己的 saveBest（只寫比舊值大的） | t5 實測 |
| P3-3 | tower | 第 1 張圖只蓋 2 座光針後一直開波 | 預期：使用者偏好友善版。實際：大約第 5 波失守後只能回標題，**整張圖從第 1 波重來**，沒有「重打本波」的選項。10 波加起來要好幾分鐘，在後面幾波失守的懲罰很重 | GAME OVER 畫面加「A：RETRY WAVE n」，在波次開始時存一份快照（塔、金錢、生命取 max(10, 原值)） | t18 實測：第 5 波 lives 0 → over → title |
| P3-4 | blocks（觸控） | 手機上拇指按十字鍵左 / 右時往上偏超過 22.5° | 預期：左右移動不會誤觸硬降。實際：`touch.js` 是 8 向判定，25° 就成了 UP+LEFT，而 blocks 的 **UP = 硬降**，會直接把方塊砸下去 | blocks 只在「UP 剛按下而且沒有按住左右」時才硬降（觸控時要求 UP 單獨按）；不要改 engine | t17 實測：0~20° 為 LEFT，25~45° 為 UP+LEFT |
| P3-5 | blocks / brick / pinball / flyer / snake；racing、tower 的說明頁 | 看標題 / 說明畫面 | 說明文字一行緊接一行沒有空行，8×8 字的上下筆畫黏在一起（例如 `A B ROTATE / UP DROP DOWN SOFT / SELECT HOLD START PAUSE`），不好讀 | 行與行之間空一列，或拆成兩欄、分兩頁 | `02_titles.png`、`03_first_screen.png` |
| P3-6 | maze / snake | 看標題 | 寫的是 `C = CHEAT` / `C CHEAT`，手機上沒有 C 鍵，對應的是 ★密技 | 改成 `C/★ CHEAT`，或乾脆不寫 | `02_titles.png` |
| P3-7 | racing / tower | 讀程式 | 另外 6 款的 `goal()` 都要求 `cheats === 0`，這兩款沒有；`cheat()` 也沒有檢查模式，在標題畫面也會觸發（播音效、累加計數） | `goal()` 加上 `&& g.cheats === 0`；`cheat()` 限制只在遊玩 / 結束時有效 | `racing/main.js:733,739`、`tower/main.js:722,730` |
| P3-8 | 選單（shell） | 看選單第 7 槽 | 星塵飛鳥的圖示是**橘色圓胖小鳥**，跟遊戲裡的藍色星燕「琉璃」不一致，而且橘色圓鳥反而更像 Flappy Bird | 圖示改成藍色星燕的 16×16 剪影 | `01_menu.png` |
| P3-9 | 回選單提示（shell） | racing / flyer 遊玩中按住 START+SELECT | 提示用的磁磚是「精靈表裡最實心的一塊」，在 8×16 模式的 racing 會變成**半台車**，flyer 會變成**翅膀的一半**，看起來像畫面出錯（其他款看起來正常） | registry 契約加一個可選欄位 `backTile`（由各款指定，總控改），或者 shell 改用 BG 文字「HOLD…」閃爍 | `09_back_overlay_strip.png` |
| P3-10 | 全部（說明） | 進任一款的標題 / 暫停畫面 | 「按住 START+SELECT 回選單」這件事只寫在選單底部，遊戲裡完全看不到，第一次玩的人很難發現 | 由 shell 在暫停時顯示一行提示（shell 能知道目前在暫停嗎？不能的話就請各款在暫停畫面加一行 `HOLD START+SELECT = MENU`） | `08_pause_sheet.png` |
| P3-11 | maze / blocks、snake / flyer（BGM） | 擷取標題曲 pulse1 | 跟商業主題**沒有**相似之處（最長相同音程 ≤ 7，全部是音階走句）。但**卡帶內部有雷同**：maze 和 blocks 的標題曲開頭 10 個音完全一樣（D E F A G F E D C A），snake 和 flyer 的標題曲開頭也幾乎一樣（D G B A G …） | maze 或 blocks 其中一款改寫開頭動機；snake / flyer 同理 | t16 擷取的音高序列 |
| P3-12 | 工具 | `tools/test_touch.py` | `PAGES` 只有 game / star / cruiser / mech，**沒有 cart1.html** | 加入 cart1.html。這次手動實測已確認兩指 START+SELECT、★ 和直 / 橫向都可用 | `tools/test_touch.py:31` |

## 實測紀錄（沒有發現問題的項目）
- **玩家流程**：8 款都從選單進入（游標停在剛玩的那款），標題 / 說明 → START → 遊玩 → 暫停（暫停時按 A / B / 方向，狀態都不會變）→ 恢復 → 按住 START+SELECT 70 幀 → 選單，選單 BGM 有恢復。這段流程連續走完 8 款，沒有殘留也沒有頁面錯誤。只按住 START+SELECT 40 幀就放開時，**沒有任何一款**被誤暫停，blocks 也不會誤觸暫存、tower 不會誤開波（各款都用 `!held(SELECT)` 擋住了）。GAME OVER 後：maze / snake 會自動回標題並播標題曲；blocks / brick / flyer / tower 停在結束畫面等按鍵，這是正常行為。最高分在結束時有寫入，選單也有正確顯示：maze 001960、blocks 0007148、brick 005460、snake 000020、flyer 006 GATE、tower SC14480。
- **觸控**（iPhone 13 直向 390×664 / 橫向 750×342）：8 款都用觸控走到遊玩並做出核心動作：maze 移動吃豆、blocks 移動 / 旋轉 / 暫存 / 硬降 / 軟降、brick 球拍移動、pinball 拉桿發射 + 兩邊擋板、snake 轉向、racing 經過說明 → 介紹 → 倒數後油門、flyer 振翅、tower 進入地圖。START 暫停在 8 款都有效（snake 的 READY 期間不接受暫停，這是設計）。**兩指同按 SELECT+START 70 幀，8 款 × 兩個方向全部回到選單**；放開後 mask 是 0，沒有黏鍵。橫向時 SELECT / START 上下疊在同一欄（間距 6 px），一根拇指壓不到兩顆，需要兩根手指，可以接受。
- **難度（人類節奏）**：maze 第 1 關追兵 / 主角速度比 0.85，比原作的 0.94 寬鬆；完全不按大約 13 秒才第一次死。blocks DAS 12/4、7 袋、影子、暫存，都偏友善。brick 初速 1.75 px/幀、拍寬 32，再加上 GAME OVER 可以接關。flyer 縫高 64 px、碰撞框 10×8、第一道門在 320 px 外，開場有 5 秒空檔，節奏友善。racing 延遲 12 幀的機器人仍拿下第 1 條賽道的第 1 名。pinball 每顆新球都有救球。tower 開局 100 金（3 座光針），只蓋 2 座撐到第 4 波。前 1~2 分鐘沒有明顯不合理的地方；唯一偏硬的是 P3-3。
- **原創性（P1-1 / P2-2 以外）**：blocks 的名稱、配色和曲子都是原創，類型慣例（HOLD / NEXT / 影子）可以接受。pinball 的桌面和元件是原創。snake 是原創。racing 是俯視視角，車和賽道沒有對應到特定作品。flyer 用磚石柱 + 岩牙縫 + 藍色星燕，**沒有沿用綠色水管的造型**。tower 的路線和塔是原創。BGM 全部 17 首擷取下來，跟商業主題都沒有相似之處。

## 各款簡評
| 款 | 簡評 |
|---|---|
| **選單 shell** | 開機、選單、回選單、游標記憶、BEST 顯示都穩定；回選單提示在 8 款都沒有超線（強制常駐跑完機器人全程）。要改的是 P3-8 圖示、P3-9 提示磁磚，以及 P3-10 讓玩家能發現回選單的方法。 |
| **maze** | 玩起來很順，AI 四種個性分得清楚，難度也比原作寬鬆，**但第 1 張迷宮的觀感就是 Pac-Man**（P1-1）。這部分要在發佈前改掉，改調色盤和字樣就能解決大半。 |
| **blocks** | 手感、演出和友善化都做得好，暫停時把盤面藏起來的處理也正確。手機上要處理 UP 硬降誤觸（P3-4），說明頁太擠（P3-5）。 |
| **brick** | 10 回合加魔王、三球 + 雷射的壓力測試每線只到 6，處理得很乾淨；暫停時有停 BGM。膠囊字母要換（P2-2）。 |
| **pinball** | 兩張名稱表做直向桌面加 split 狀態列，物理穩定；拉桿和擋板在觸控上都按得到。只有 P3 等級的一致性問題（暫停 BGM、中途離開不存分數）。 |
| **snake** | 三種模式都有，預排轉向很友善。READY 期間 START 被忽略，這是設計。主要是 P2-1（結束時密技續關）。 |
| **racing** | 俯視捲軸的做法合理，車子自己就把每線用到 8，但沒有超線，提示帶狀區裡沒有車。標題的 PUSH START 每 16 幀閃一次，沒有問題。要補的是 P3-7 密技 / goal 的一致性。 |
| **flyer** | 世界觀和角色明確是原創，節奏也友善。要改的是選單圖示（P3-8）和標題曲開頭跟 snake 雷同（P3-11）。 |
| **tower** | 屬性表做游標和射程顯示、逐線配額，設計很漂亮；最小策略在第 5 波失守後要整張重打（P3-3），建議做友善版的重打本波。 |

# R6 qa-r6（2026-11-13）

## 摘要
- 範圍：《星塵反應 8 合 1》`cart2.html` 的選單和 8 款（slash / laser / dodge / rope / catch / pop / gallery / mash），加上 cart1 迴歸抽查。總控已經確認過的 run_all 全綠和 `playthrough_cart --page cart2.html --all`，這次**沒有重跑**。力氣放在機器人照顧不到的地方：玩家實際流程、手機觸控、用人類反應延遲模擬難度、原創性、選單圖示，以及極端情境。
- 結論：**沒有擋版缺陷，也沒有 P1。** 8 款都能從選單一路走完：選單 → 標題 → 遊玩 → 暫停 → GAME OVER → 密技原地續關 → 按住 START+SELECT 回選單 → 進下一款。過程中沒有卡死、畫面殘留或頁面錯誤。§6 的規則 8 款第一版就全部做到：暫停時 BGM 用 `pause()` 停住、解除後從下一個 row 接續；標題按密技無效；結束畫面按密技會原地續關；`exit()` 有存最高分；遊戲內寫了 `HOLD START+SELECT: MENU`。
- 缺陷：**P1 × 0、P2 × 2、P3 × 8**。
  - P2 都是「反人性」的難度點：catch 頂球 60 秒後的三球階段，連全知機器人都撐不住；rope 開局沒有預備時間，繩子 1.1 秒後就掃到腳下。
  - P3 主要是選單圖示和主角對不上、dodge 過了 60 秒之後難度不再上升、gallery 高等級 10 分環太小、pop 氣球關的構圖，以及幾項小地方的一致性。
- 硬限制抽查：我把回選單提示**強制常駐**（`CT.backProgress` 固定 0.5），再跑機器人沒走過的極端關卡，每線峰值都 ≤ 8，overFrames 全部是 0。
  - gallery 6 個模式從第 5 級開局：3 / 3 / 4 / 3 / 5 / **8**（EYE 6 顆球加準星，是設計上限）。
  - slash 魔王關 **8**、laser 第 9 波魔王 7、pop 泡泡 4、catch 頂球 5、rope NEON 雙繩 **8**、mash 2。
- 手機（iPhone 13 直向 390×664 / 橫向 750×342）：8 款都用觸控實測到核心操作，**兩指同按 START+SELECT 70 幀，8 款兩個方向都能回選單**，放開後沒有黏鍵。mash 用觸控連打計數正確：20 次點擊算 20 下，A+B 同時按 10 次算 20 下，按住 A 40 幀只算 1 下。

### 方法（重現用）
1. 腳本都放在 scratchpad，沒有新增工具檔。用 Playwright 開 `cart2.html?debug=1&scale=1&mute=1`，逐幀 `__nes.step`，讀 `GAME.state()`、`__nes.nes().music.state()` 和 `__nes.stats()`。
2. 觸控沿用 `tools/mobile_shot.py` 的 `Touch`（CDP 多點），座標取自 `NES.Touch.rects()`。⚠ 這個工具的 `touchEnd` 會連帶放開其他手指，所以多指狀態一律在**放開前**讀取。
3. **人類節奏**，用了三種模型，因為單一模型都有偏差：
   - **(a) 新物件反應延遲**：每幀把 `g.foes` / `g.objs` / `g.b` / `g.bals` 裡出現不到 L 幀的物件先藏起來，再呼叫原本的機器人。
   - **(b) 輸出延遲**：機器人的按鍵整體晚 OL 幀送出，等於閉迴路的視覺 → 動作延遲。⚠ 游標類用 (b) 會因為 bang-bang 控制而來回過衝，那是模型本身的假象，結果不採用。
   - **(c) rope 時機誤差**：起跳時刻加上 `d ± j` 幀，用來量出判定窗口。
4. 每款的極端情境：強制常駐提示跑高等級；暫停中按密技；按住 START+SELECT 40 幀後放開（8 款都**沒有**被誤判成暫停）。

## 缺陷表

| 編號 | 遊戲 | 重現步驟 | 預期 vs 實際 | 建議修法 | 證據 |
|---|---|---|---|---|---|
| **P2-1** | catch（頂球） | `cart2.html?game=catch&bot=1` 讓機器人頂到 60 秒（第 3600 幀起進入 TRIPLE STAR） | 預期：60 秒後的階段雖然難，但人類有機會撐住；使用者偏好友善版。實際：連會預測所有落點的全知機器人，**每一次**都在第 3 顆球出現約 1.4 秒內（第 3684 幀）掉球。算一下：擊球初速 1270/256 ≈ 5 px/幀，重力 22 → 滯空約 115 幀，三顆球輪流落下的間隔約 38 幀；落點可能相距 130 px，托盤衝刺 3.5 px/幀要 37 幀才到。人類加上 12 幀反應就**不可能**做到。另外掉一顆就扣命、連續時間歸零，等於「達成 60 秒那一刻就一定歸零」 | 擇一或合用：① TRIPLE STAR / HEAVY SKY 的重力改成 16（滯空約 160 幀，間隔約 53 幀）；② 多球時掉的那顆**只移除那顆、不扣命、連續時間不歸零**，只有最後一顆掉了才扣命（友善版）；③ 第 3 顆球改成慢速的「羽毛彗星」（初速 ×0.8）。改 `K_PHASES[4..5]` 和掉球判定即可 | 數據見下方難度表；`catch/main.js:46` K_PHASES |
| **P2-2** | rope | 選單 → 星塵跳繩 → START，什麼都不按 | 預期：開局有預備時間，第一圈不罰（使用者「開頭友善」）。實際：HUD 寫著 `READY!`，但繩子已經在轉，**START 後第 65 幀（1.1 秒）**第一次掃過腳下就判定失誤；之後每 138 幀扣一顆心，**約 6 秒就 GAME OVER**。剛讀完說明的玩家，幾乎一定會在第一下失手 | READY 期間繩子停在頭頂（或者用一般速度空轉一圈、不判定），120 幀後才開始；HUD 倒數 `3 2 1 JUMP!`，配合繩子位置閃一個「跳」字的提示。絆倒後重新起轉時也照樣給第一圈緩衝 | `09_rope_start_ready.png`（第 20 / 45 / 62 / 70 幀，第 70 幀已經絆倒） |
| P3-1 | 選單（`games/cart2/cart.js`） | 看選單第 1 / 2 / 3 / 4 / 7 槽，對照遊戲畫面 | slash 的圖示是**紅橘色**忍者，遊戲裡的星丸是**藍紫色**、橘圍巾。rope 的圖示是全身橘色的小孩，TICO 是**白色星形瀏海 + 白衣 + 膚色**。laser 的圖示（藍球、桿子加光束）在遊戲裡找不到對應物，遊戲的招牌是**菱形光環準星**和藍色通訊塔。gallery 的圖示是藍白色環，遊戲裡的靶是**青 + 洋紅**環。dodge 的圖示是青綠色，諾娃是淺藍色（相近，可以順便調）。catch / pop / mash 一致 | slash 改成藍紫色身體 + 橘圍巾；rope 加上白色瀏海 / 白衣；laser 改成「菱形準星 + 下方藍塔」；gallery 的環色改成青 / 洋紅；dodge 調成淺藍。只動 `SLOTS[].icon` | `02_icons_vs_ingame.png`、`01_menu_cart2.png` |
| P3-2 | dodge（彈幕大師） | `?game=dodge&bot=1` 跑 150 秒 | 預期：60 秒進入 LOOP 後應該越來越難（brief：「難度逐 10 秒升級」）。實際：LV9 ~ LV15 畫面上的子彈仍只有 15 ~ 22 顆，整局峰值 39 顆，上限 48 從來沒有用滿；全知機器人到 150 秒仍然 **0 次受擊**。前 60 秒偏友善（這部分符合開頭友善的要求，不用改）；問題是 60 秒以後沒有挑戰性 | LOOP 第 n 輪：`patternTick` 出彈間隔 × 0.85ⁿ（最低 0.6），彈速每輪 +8%，`MAXB.barrage` 維持 48；從 LV10 起 BLOOM / TWIN 加一個反向臂。**前 60 秒不動** | `07_dodge_barrage_0-60s.png`、`08_dodge_loop_80-150s.png` |
| P3-3 | gallery（精準靶） | `GA.dev.start(0,2)` → 第 3 ~ 5 級 | 第 3 級起靶縮成 16 px，環的半徑 1 / 3 / 5 / 6 / 7，**10 分只有中心 3×3 px**。手機直向 1.52 倍時只有 4.5 CSS px，第 5 級還會晃 ±3。合格線 25/50 還做得到，但想拿 B（60%）平均每發要 6 分（距離 ≤ 5 px），在晃動下很吃運氣 | `RINGS[16]` 改成 `[2,3,5,6,7]`（10 分 = 5×5）；第 5 級 sway 3 → 2；或者第 3 級維持 32 px（size 32、time 230、sway 2），只有第 4、5 級用 16 px | `gallery/art.js:28`、`gallery/main.js:44` |
| P3-4 | pop（氣球射擊） | 標題選 BALLOON SHOT | 原創性：淺藍天空 + 白雲 + 底部一條草叢帶，目標從草叢往上飛，整體構圖接近 Duck Hunt 的「藍天 + 草叢」（brief §1-5 點名不准用草叢構圖）。氣球和準星本身是原創 | 把底部草叢帶換掉（例如改成星塵遊樂園的柵欄或觀景台），天空改成黃昏或夜空漸層，和卡帶「星塵」世界觀一致 | `10_balloon_bubble_speed.png`（左） |
| P3-5 | catch / pop（標題） | 看標題第 25 列 | `START GO  C/* = CHEAT` **整列每 32 幀閃一次**，有一半時間看不到 CHEAT 說明（截圖剛好抓到空白的那一格）。其他 6 款是固定顯示 | 只讓 `START GO` 閃，`C/* = CHEAT` 固定顯示 | `03_titles.png`（catch / pop 底部） |
| P3-6 | gallery / rope / catch（手機直向） | 手機直向，看最上方 HUD | 版面是 y=0 貼頂，HUD 第一列（例如 `PRECISION LV1 SC…`）緊貼可視區上緣，看起來像被切掉一點（agent 自己也提過）。真機有瀏海時更明顯 | gallery 的 HUD 下移一列（agent 已經提議）；其他款維持現狀也可以 | `11_mobile_p_l.png` |
| P3-7 | dodge / rope（標題） | 對照標題和選單的 BEST | 標題寫 `BEST 000.0S` / `BEST 000 HIT`，選單寫 `  0.0S` / `000HIT`。同一個紀錄兩種格式 | 標題直接沿用 `bestText()` | `03_titles.png`、`01_menu_cart2.png` |
| P3-8 | cart1 pinball / snake / flyer（迴歸，可選） | 遊玩中暫停 → 解除 | 暫停時 BGM 會停（R5 規則有做到），但解除後是**從 pattern 開頭（row 0）重播**；blocks / brick / racing / tower 已經改成從同一 row 接續。行為沒有錯，只是卡帶內不一致 | 有空時三款的 Audio 也改用 `nes.music.pause()/resume()`（engine API 已經有了） | 實測：pinball (7,7) → (7,0)、snake (7,8) → (7,0)、flyer (5,6) → (5,0) |

## 實測紀錄（沒有發現問題的項目）
- **玩家流程**（選單上用 ↓ 切換，每款都從選單進入）：
  - 標題按密技：`cheated` 維持 false，有效擋下。
  - 暫停：`paused`、`music.paused=true`，120 幀內 `rowsPlayed` 沒有增加，狀態不變（dodge 只有繪製計數 `drawn` 在變）。
  - 解除暫停：從 row+1 接續。
  - 閒置到 GAME OVER：laser 約 16 秒、dodge 約 18 秒、rope 約 6 秒（P2-2）、catch 約 20 秒、pop 敲 60 秒時間到、gallery 第 1 級沒過合格線、slash 約 7 秒（5 顆心）；mash RAPID 時間到進入結算，結算畫面按密技無效，這是設計。
  - 結束畫面按 ★：laser 回到同一波（intro）、dodge / rope / catch / pop / gallery / slash 原地續關，`continues=1`，分數保留。
  - 按住 START+SELECT 70 幀回選單：游標停在剛玩的那款，選單曲 `cart2_menu` 有播放，BEST 有更新（dodge ` 23.3S`、rope `001HIT`、catch ` 14.4S`、pop `000100`、mash `012HIT`）。
  - 暫停中按密技也會生效，而且仍維持暫停，不會自己解除。
- **說明文字和實際按鍵**：8 款標題寫的按鍵都和實測一致（slash `A+UP RISE / +DOWN CLEAVE / B JUMP`、laser `B HOLD = FINE / HOLD+RELEASE A = BLAST`、dodge `B FOCUS / A STAR BURST`、rope `DOUBLE: A=L B=R`、pop `DPAD AIMS 9 HOLES`、gallery `B FINE`）。段落之間都有空一列。
- **觸控**（直向 / 橫向結果相同）：
  - slash：十字鍵右 30 幀移動 60 px；A 是橫斬；↑+A 兩指同按是昇空斬；B 跳。
  - laser：30 幀移動 74 px（前 8 幀 1 px，之後 3 px，符合 §1-4）；斜向可用；長按 A 45 幀充能到 44，放開就是稜鏡爆；B+方向是精細 1 px/幀。
  - dodge：斜向走位；A 星爆；B+方向 1 px/幀。
  - catch：左右移動頂球正常。
  - **pop：觸控十字鍵 8 個方向對應到正確的坑**。分區是 0~20° 為正右、25~65° 為斜角、70~90° 為正上，斜角有 40° 寬，好按。
  - gallery：10 幀移動 14 px、30 幀移動 74 px，B 精細模式 30 幀移動 30 px。從畫面一端移到另一端約 91 幀（1.5 秒），在 SPEED 晶片存活時間 150~210 幀內來得及，**游標類在觸控上可用**。
  - mash：觸控連打只認按下邊緣，計數正確。
  - START 暫停 / 解除、★ 密技，8 款兩個方向都正常。
- **cart1 迴歸**：
  - 選單 BEST 顯示新格式：pinball `004750`、racing `017PTS`、flyer `0017GT`，其餘 `000000`，沒有截斷或錯位。
  - 四款暫停後從同一 row 接續：blocks (7,7) → (7,8)、brick (6,13) → (6,14)、racing (7,11) → (7,12)、tower (6,15) → (7,0)，也就是 pattern 尾接到下一個 pattern。
  - 其餘四款行為和 R5 相同（見 P3-8）。8 款都沒有頁面錯誤。
- **原創性**：
  - slash：拋出物是星礦 / 機械蟲 / 符咒 / 雷核，**沒有水果、果汁噴濺或木紋板**；主角在地面移動、靠方向出招，玩法結構也和 Fruit Ninja 的「畫線切」不同。
  - laser：三座不同高度的原創設施（溫室 / 天線 / 反應爐）、菱形準星，光束從中央發射；**沒有一排城市、十字準星或擴散的爆炸圓**，類型上的相似可以接受。
  - gallery：太空訓練場加全像光靶，沒有鴨子、獵犬或草叢。
  - pop：敲噗噗芽是 brief 指定的打地鼠玩法，生物全部原創，沒有戴安全帽的鼴鼠商標造型。
  - dodge：「低速移動顯示判定點 + 炸彈清彈 + 擦彈」是彈幕類型的慣例，型態和角色都是原創。
  - catch 彈跳模式：「自動彈跳 + 單向平台 + 彈簧 + 碎台」的機制和 Doodle Jump 相近，但畫面（黑色太空、青色平台、有臉的球）、固定關卡和星門目標都是原創，**不列為缺陷**。
  - rope 的 PLAZA 場地（藍天 + 綠叢 + 橘磚地）是常見配色，磚紋和 SMB 的地面方塊不同。
- **硬限制**：見摘要。另外按住 START+SELECT 40 幀後放開，8 款都沒有被誤暫停；狀態列 split（pop 泡泡）在提示常駐時也沒有出錯。

## 難度調整建議表（人類節奏）

| 款 / 模式 | 量測 | 判斷 | 建議數字 |
|---|---|---|---|
| slash 第 1~3 關 | (a) 新物件延遲 L = 12 / 18 / 24：三種都過 3 關（4200~4500 幀），最多只少 1 顆心。(b) 輸出延遲 12：過 3 關；18 / 24：卡在第 1~2 關反覆 GAME OVER | 開頭友善、節奏中等。第 1 關閒置約 7 秒掉光 5 顆心，屬於正常 | 不用調 |
| laser 第 1~5 波 | (a) L = 12 / 18 / 24：都在 5100 幀守過 5 波，設施最多損失 1 HP。第 1 波隕石 0.5 px/幀，落地約 220 幀（3.7 秒），間隔 72 幀 | **第 1 波很友善**（agent 擔心的問題不存在）；延遲機器人打空是游標過衝造成的假象 | 不用調；第 2 波 spd 165 也可以接受 |
| dodge 彈幕大師 | 全知：150 秒 0 次受擊。(a) L = 24：60 秒內 1 次受擊。(b) 輸出延遲 12：約 22 秒用完 3 命（機器人不會用星爆） | 前 60 秒是給人類的合理挑戰；**60 秒後沒有加難**（P3-2） | 見 P3-2：LOOP 間隔 × 0.85ⁿ，彈速每輪 +8%。前 60 秒不動 |
| dodge 躲避球場 | 輸出延遲 12：45 秒時剩 1 命（LV5，6 隻砲蟹） | 合理 | 不用調 |
| rope 判定窗口 | (c) 晚 d 幀起跳：TICO 在 0~7 幀內都是 PERFECT，8~13 幀是 GOOD，晚 ≥ 16 幀就失誤；BOBO 是 0~9 / 11~16 / ≥ 20。也就是 **PERFECT 約 ±7 幀（±117 ms）**、GOOD 寬約 28 幀，和 agent 的估計一致。誤差模型 +6±4 幀：第 8400 幀達成 100 連跳，82% PERFECT；+10±3 幀：21% PERFECT，仍能達成 100 連跳；固定晚 12 幀：LV8 以後開始失誤，最高 80 連跳 | PERFECT 窗口偏寬、偏友善，不用縮。比較吃力的是 100 連跳中途不能失誤，整個要 2.3 分鐘 | PERFECT 不動；修好 P2-2 的開局。可選：失誤時連跳只扣一半（例如 −50%），不要歸零 |
| catch 頂球 | 全知機器人：1~2 顆球 + 強風撐到 61 秒，第 3 顆一出現就掉。輸出延遲 12：最長 12.5 秒（有過衝假象）。參數：滯空 115 幀、頂點 143 px、托盤 2.5 / 衝刺 3.5 px/幀 | 單球很友善；24~60 秒雙球 + 強風是 goal 本身的挑戰，可以接受；**三球階段不可能**（P2-1） | 見 P2-1：TRIPLE 重力 16，或多球時掉一顆不扣命 |
| pop 敲噗噗芽 | 反應延遲 24 幀（`&lag=24`）：3000 幀內 23850 分；全知機器人約第 1800 幀就到 8000 分 | goal 8000 對人類（命中率 50~70%）很友善 | 不用調 |
| pop 戳泡泡 | 完全閒置：約 17.5 秒壓力滿 20。泡泡上升 0.19~0.31 px/幀，游標 3 px/幀；機器人撐到 LV6 | 前幾級友善 | 不用調；可選：壓力 ≥ 15 時 HUD 閃紅警告 |
| pop 氣球射擊 | 全知機器人每關 40 秒約打 39 顆，配額是 16+4×關數，第 1 關 20、第 4 關 32。人類大約 45 幀打一顆（反應 15 + 移動 25 + 確認 5），40 秒約 50 顆的理論上限，實際估計 25~30 顆 | 第 1~2 關可以；第 4 關以後會比較緊 | 配額改成 16+3×關數（第 4 關 28） |
| gallery 精準靶 | 見 P3-3；速射晶片存活 150~210 幀，游標跨一個畫面約 91 幀 | 速射沒問題；精準靶第 3~5 級的 10 分環太小 | 見 P3-3 |
| gallery 眼力 | 機器人知道答案（agent 自己也說明了） | 沒辦法用機器人評估；第 5 級 6 顆球、416 速度，對人類偏難但有 2/3 的容錯 | 可選：第 5 級 v 416 → 384 |
| mash 指令 | 限時 = max(長度×14+50, 長度×30+120−連段×4)：30 連段時 8 鍵有 240 幀，**每鍵 30 幀** | 時間很寬鬆；難的是 30 連段不能有一次失誤 | 可選：失誤時連段 −5，不要歸零（goal 仍然是「最高連段 ≥ 30」） |

## 各款簡評
| 款 | 簡評 |
|---|---|
| **選單（cart2）** | logo、副標、8 槽、BEST 新格式、游標記憶和選單曲都正常；從選單進出 8 款，畫面和音樂都乾淨。要改的是圖示（P3-1）。 |
| **slash** | 「A + 方向決定招式」加上 B 跳，手感明確；拋出物和魔王「鐵燈籠」都是原創，和 Fruit Ninja 的招牌元素完全分開。人類節奏下友善。只差選單圖示的顏色。 |
| **laser** | 菱形準星、按住充能和過熱鎖讓玩法有層次；第 1 波很友善，觸控長按 A 充能也順手。原創性過關。 |
| **dodge** | 兩種模式都完整，砲蟹用 BG 做是很聰明的配額設計；彈幕型態清楚好讀。前 60 秒難度恰當，60 秒後要加難（P3-2）。 |
| **rope** | 3D 投影珠串繩、假動作、雙繩、3 位角色和 3 個場地，內容很豐富；PERFECT 窗口寬鬆友善。**開局沒有預備時間**是唯一的明顯扣分（P2-2）。 |
| **catch** | 三種模式都有完成度，彈跳模式 6 關都附解題器保證有解。頂球三球階段要做友善化（P2-1）；標題的 CHEAT 那列會閃（P3-5）。 |
| **pop** | 背景捲動的泡泡牆、BFS 連鎖、9 坑觸控斜角都好按；敲噗噗芽的假動作和反擊很有趣。氣球關的構圖要換（P3-4），配額可以微降。 |
| **gallery** | 6 個模式、每模式 5 級和評價系統完整，游標規格正確，觸控也可用。精準靶後段的 10 分環太小（P3-3），HUD 可以下移一列（P3-6）。 |
| **mash** | 只認按下邊緣，在鍵盤和觸控上都驗證正確；RAPID 的稱號和火箭演出很有趣。指令模式的時間寬鬆，可以考慮失誤不讓連段歸零。 |
| **cart1 迴歸** | 沒有被改壞：選單的 bestText 新格式正確，四款暫停從同一 row 接續正確。 |

## 建議 fix-r6 分卡（依檔案所有權）
| 卡 | 檔案 | 項目 |
|---|---|---|
| fix-r6-platform | `games/cart2/cart.js`（＋可選 cart1 pinball / snake / flyer 的 Audio） | P3-1 圖示；P3-8（可選） |
| fix-r6-pop | `games/cart2/{catch,pop}/**` | P2-1 頂球三球、P3-4 氣球構圖、P3-5 標題閃爍；氣球配額 16+3n |
| fix-r6-dodge | `games/cart2/{dodge,rope}/**` | P2-2 rope 開局 READY、P3-2 dodge LOOP 加難、P3-7 標題 BEST 格式 |
| fix-r6-aim | `games/cart2/{gallery,mash}/**` | P3-3 精準靶環、P3-6 HUD 下移；（可選）mash 失誤 −5 |
| （blade） | `games/cart2/{slash,laser}/**` | 不用修 |

# R7 qa-r7（2026-11-13）

## 摘要
- 範圍：《星塵益智 8 合 1》`cart3.html` 的選單和 8 款（merge / sudoku / mines / gomoku / slide / lines / labyrinth / party），加上 cart1 / cart2 迴歸抽查。總控已經確認過的 run_all 全綠和 `playthrough_cart --page cart3.html --all`，這次**沒有重跑**。力氣放在益智遊戲最在意的地方：盤面好不好讀、新機制有沒有教、觸控手感、難度、原創性、選單圖示，以及極端情境。
- 結論：**沒有擋版缺陷，也沒有 P1。** 8 款從選單進出、遊玩、暫停、回選單都乾淨，沒有頁面錯誤。cart1 / cart2 沒有被改壞。
- 缺陷：**P1 × 0、P2 × 4、P3 × 7**。
  - P2 都在「看得懂」這一層：
    - lines 的星橋 / 星門幾乎看不見，第一次遇到也沒有教學。
    - lines 選關畫面第 31 ~ 36 關的關卡號被說明文字蓋掉。
    - labyrinth 畫面九成是全黑，走過的地方又會變回全黑。
    - slide 的星鯨有完全相同的拼片，5×5 也有幾乎相同的拼片；SWAP / ROTATE 模式可能出現「圖已經拼好卻不算完成」。
  - P3 是選單圖示 5 款和遊戲對不上、數獨九宮只靠底色區分、多款新機制沒有第一次的提示、兩處文字溢出、HUD 貼頂、合星天體顏色太接近，以及 lines 原創性。
- 總控兩個疑慮的判定：
  - **數獨九宮**：實測兩種底色是青 (0,64,88) 和藍 (0,0,188)，亮度約 52 和 14，色相差異其實看得出來。但每格之間都是一樣的 1 px 黑線，宮的邊界沒有加粗，而同數字高亮的紫色會混進來，整體偏弱 ⇒ 列 P3-2。
  - **迷宮視野**：量測遊玩區全黑像素佔 F1 88%、F4 89%、F9 93%，而且走過的格子在主畫面上不會留下記憶 ⇒ 列 P2-3。
- 硬限制極端抽查：所有情境 overFrames 都是 0，每線峰值 ≤ 4。
  - 5×5 合星一次 10 組合併：尖峰 140 byte。
  - 探雷 14×12 只有 3 顆雷、一下展開 165 格：分幀，尖峰 140。
  - 迷宮 F9 密技地圖全開，以及 SELECT 地圖開關（回選單提示強制常駐）：尖峰 140，每線 1。
  - 連線 9×9 連續 8 次提示：尖峰 98。
  - 拼圖 SWAP 5×5 換 6 張圖：強制空白期間 20。

### 方法（重現用）
1. 腳本都放在 scratchpad，沒有新增工具檔。用 Playwright 開 `cart3.html?debug=1&scale=1&mute=1&game=<id>`，逐幀 `__nes.step`。直接叫各款的 `CT.<Id>.dev.start(...)` 進到指定關卡、難度、模式，讀 `GAME.state()` 和 `__nes.stats()`。
2. 觸控沿用 `tools/mobile_shot.py` 的 `Touch`（CDP 多點），用 iPhone 13 直向 390×664 和橫向 664×390，座標取自 `NES.Touch.rects()`。
3. 拼片是否相同：在偷看完成圖時（B 長按）用 1× 截圖，切出每片 32×32 px，逐片比對雜湊和不同的像素數。
4. 視野：截圖後計算遊玩區（y 20~210）全黑像素的比例。

## 缺陷表

| 編號 | 遊戲 | 重現步驟 | 預期 vs 實際 | 建議修法 | 證據 |
|---|---|---|---|---|---|
| **P2-1** | lines（星橋 / 星門） | 選單 → 星塵連線 → LEVELS → 第 11 關（第一個星橋）、第 21 關（第一個星門） | 預期：新機關一眼看得出來，第一次遇到時有提示，尤其星橋「**一定要被一橫一直兩條線各穿過一次**」這條不直覺的規則。實際：① 空的星橋只用共用的暗灰色 1 畫兩條細欄杆，在黑底上幾乎看不見；線穿過去之後只剩極淡的「=」，看起來就像兩條線交叉了。星門是暗灰色的菱形框，同樣偏暗。② 遊戲中完全沒有教學，只有標題第三項 RULES 裡有說明；而 RULES 頁的範例圖是**彩色十字**，和遊戲裡的灰欄杆長得不一樣。③ 選關資訊只寫 `BRIDGE GATE` 這個字。玩家第一次遇到時很可能以為那是一般格，或以為一條線經過就夠了，結果 FILL 停在 9x%、找不到原因 | ① 空星橋的欄杆改用亮色（例如白 $30 或金 $28），還沒被兩線填滿時每 32 幀閃一次；星門框改成亮青，並用不同顏色或記號標示「成對」。② 每種機關第一次出現的關卡（LV11、LV21），開局先跳一張說明卡（直接沿用 RULES 頁的範例圖和兩行字），按 A 關閉；用 `CT.save('lines','seenBridge')` 記住，只跳一次。③ 卡在只差星橋時，訊息列提示 `BRIDGE NEEDS 2 LINES` | `04_lines_bridge_gate_lv11_21_26.png`、`05_lines_bridge_zoom.png`、`06_…rules.png`（右） |
| **P2-2** | lines（選關） | LEVELS → 游標移到第 31 ~ 36 關（`g.lsel = 30..35`） | 預期：36 關的關卡號都看得到。實際：`selPos(i)` 算出第 31 ~ 36 關在第 16 列，正好和 `selInfo()` 的「LV xx 章名」那一列（第 16 列）、「9X9 8 PAIRS…」那一列（第 18 列）重疊。**最後一章 NEBULA HEART 的 6 個關卡號整排被蓋掉**，游標框框住的是 `HEART` 這幾個字 | 說明區往下移兩列（16 / 18 → 18 / 20），`WHITE NEW…` 和 `BLUE = 3 STARS` 改到第 22 / 24 列，`A PLAY` 移到第 26 列。或者把關卡號表格從第 4 列開始排。改完後讓 test_lines 檢查 36 個關卡號都在名稱表上 | `06_lines_select_31-36_hidden_vs_rules.png`（左）；`lines/main.js:261,282` |
| **P2-3** | labyrinth（視野） | ADVENTURE F1 / F4 / F9，讓機器人走 400 幀後截圖 | 預期：保留「探索、看不見前方」的緊張感，但玩家能維持方向感。實際：① 遊玩區全黑比例是 **F1 88%、F4 89%、F9 93%**。② 走過的格子離開頭燈範圍後**變回全黑**，回頭路和死路完全沒有記憶，只能靠 SELECT 開小地圖（開著時計時暫停、主畫面看不到）。③ 照明半徑從 F1 的 40 / 56 px 縮到 F9 的 24 / 40 px，加上每格只有 8 px、露明只是 8 px 的精靈，F9 在手機上只看得到身邊 2 ~ 3 格。總控「太悶」的感覺有數據支持，而且迷路的挫折會讓這款變成「一直開地圖」 | ① **走過記憶**：已探索（`g.known`）的屬性區不要降回調色盤 0，維持調色盤 1（微光：牆是暗色、地板是黑），等於主畫面上出現自己畫的地圖；這只是不寫 0 而已，屬性的位元組量不會增加。② F7 ~ F9 的 r1 最小改回 32 px（r2 48）。③ 可選：微光圈外但已探索的出口、鑰匙標記也保留 | `07_labyrinth_dark_f1_f4_f9.png`、`15_mobile_…labyrinth_l.png`；`labyrinth/gen.js:31-40` r1/r2 |
| **P2-4** | slide（拼片相同） | `CT.Slide.dev.start(1,4,5)`（SWAP 4×4 星鯨）；用偷看完成圖切片比對 | 預期：每一片都分得出來，否則換位或旋轉模式會出現「圖看起來已經完成，卻不算完成」。實際：**星鯨 4×4 第 12、13 片，以及 5×5 第 20、21 片，像素完全相同**（都是空的太空）。`SV.solved` 要求 `arr[i] === i`，所以在 SWAP（任意交換）和 ROTATE 4×4（2×2 窗格四片環轉是奇置換，所有排列都可達）把這兩片放反時，畫面完整但永遠不會過關，玩家只能亂試或用提示。SLIDE 模式因為奇偶性，這個狀態到不了，所以沒有這個問題。另外 5×5 有幾組**幾乎相同**的拼片：燈塔第 (0,1)、(0,2)、(1,2) 片只差 2 ~ 6 px，天文台最下排 4 片兩兩只差 3 ~ 6 px，星鯨 (3,0)、(3,1) 差 23 px（每片共 1024 px）。三個模式都會在最後階段讓人分不出來 | ① 完成判定改成「內容等價」：產生 bank 時算每片 16 個磁磚加 4 個屬性的雜湊，雜湊相同的片視為可互換；`solved` 比對內容而不是 id，解題器的標準步數也照這個算。② 幾乎相同的那幾片：在原圖補上可辨識的細節（星點、雲），或者做 agent 自己提過的「片號數字」輔助開關（SELECT 長按切換，在片的左上角疊 1 個數字磁磚） | `09_slide_identical_pieces.png`（星鯨 4×4 / 5×5、天文台 5×5）；`slide/solver.js:30` |
| P3-1 | 選單（`games/cart3/cart.js`） | 看選單 8 個圖示，對照遊戲畫面 | 對不上的有 5 款：<br>• merge：圖示是**綠色**行星加黃環，遊戲 12 階裡沒有綠色天體（行星是藍、環行星是橘、目標恆星是紅黃）。<br>• sudoku：圖示是藍框加綠 / 黃小方塊，遊戲是青、藍交錯的宮加白、黃數字。<br>• gomoku：圖示上是綠、黃十字，遊戲是**金太陽石和白月亮石**。<br>• slide：圖示是橘、紅色的 3×3 方塊，遊戲是藍框裡的燈塔圖片。<br>• labyrinth：圖示是**紅 / 粉色**迷宮框加黃色人形，遊戲 F1 是綠色苔牆，露明穿藍外套。<br>lines 部分相符：線是綠色，但星珠在遊戲裡是甜甜圈形，圖示畫成方塊。mines（紅色帶刺雷）和 party（手勢）相符 | merge 改成恆星（紅黃核心加光芒，goal 的天體）；sudoku 改成青 / 藍 2×2 宮加一個白色數字；gomoku 改成藍格加金、白兩顆圓子；slide 改成藍框拼片缺一角，片上有紅白燈塔；labyrinth 改成黑底綠苔牆加藍衣小人和黃色頭燈光；lines 的端點改成圓環。只改 `SLOTS[].icon` | `01_menu_icons_vs_ingame.png` |
| P3-2 | sudoku（九宮分界） | EASY / EXPERT 開局截圖（3×），手機直向 | 宮和宮之間只靠青 / 藍兩種底色區分（亮度 52 對 14），每格之間都是一樣粗的 1 px 黑線，宮界沒有加粗；同數字高亮的紫色、錯誤的紅底再疊上去，在手機上要一下子分出「這格屬於哪一宮」會比較吃力。可以玩，但不夠直覺 | ① 兩種宮底色拉開亮度差，例如藍 $02 對青 $1C，或深藍 $01 對亮青 $2C 配黑字；② 或者給宮界做磁磚變體：在每格右下兩個磁磚的分隔像素改畫亮線（只有落在宮界的格子用，每宮邊多 2 ~ 3 個磁磚）；6×6 也一樣 | `03_sudoku_boxes_notes.png`、`15_mobile_sudoku_p…png` |
| P3-3 | labyrinth / merge（新機制沒有教學） | labyrinth F3（日月門）、F4（潮汐牆）、F5（星燈）第一次出現；merge 標題選 HOLE 5×5 | labyrinth 只有在撞到門時才顯示 `SUN GATE IS SHUT`；潮汐牆、星燈完全沒有任何說明，在黑暗中看到牆自己升降會以為是 bug。merge 的 HOLE 模式在標題和遊戲中都沒有說明「黑洞會吞掉星塵和石礫 +5、每 24 步移位」，只有 HUD 的 `SHIFT 24` | labyrinth：每層開局在訊息列輪播該層第一次出現的機關（例如 `NEW: TIDE WALLS RISE AND FALL`、`STEP ON ☼/☾ TO SWAP GATES`），只播一次並存檔。merge：標題選到 HOLE 時，第 24 列改成 `HOLE EATS DUST  MOVES/24`，遊戲中第一次吞噬時訊息列說明 | `08_labyrinth_cheat_light_f3_f5.png`（日月開關、鎖門）、`11_merge_5x5_bulk_hole.png`（右） |
| P3-4 | slide 標題 / labyrinth 結算（文字溢出） | slide 標題最下兩列；labyrinth 任一層過關畫面 | slide：`C/$ =` 寫在 (25,25)，`CHEAT` 寫在 (25,27)，和 `HOLD START+SELECT: MENU`（從第 2 欄起）黏成 **`MENUCHEAT`**。labyrinth：`A: NEXT FLOOR   START: TITLE` 從第 6 欄開始共 28 字，超出 32 欄，顯示成 **`START: TIT`** | slide：`C/★ = CHEAT` 單獨放一列（例如第 23 列）。labyrinth：字串從第 2 欄開始，或改成 `A: NEXT   START: TITLE` | `10_text_overflow_slide_title_lab_clear.png`；`slide/main.js:140-142`、`labyrinth/main.js:506` |
| P3-5 | mines / slide / lines / labyrinth / party（HUD 貼頂） | 遊玩畫面最上方 | 這 5 款的第一列 HUD 在畫面的 y = 0（merge / sudoku / gomoku 從 y = 8 開始），而且兩列 HUD 緊貼沒有間隔。和 qa-r6 P3-6 是同一類問題：手機直向、真機有瀏海時像被切掉 | 有空列的款，HUD 往下移一列；沒空間的維持現狀也可以，至少讓卡帶內一致 | `01_menu_icons_vs_ingame.png` 右側遊戲截圖 |
| P3-6 | merge（天體辨識） | 4×4 / 5×5 遊玩 | 第 2 階石礫、第 6 階環行星、第 7 階巨行星都是橘褐色；第 5 階行星、第 10 階脈衝星、第 11 階星系都是藍色。形狀不同，但手機上一眼看過去容易把巨行星和環行星搞混（數值只在 HUD）。原創性本身沒問題 | 巨行星改成米黃 / 條紋（例如 $27 / $37），脈衝星改成青白色，讓相鄰的階在顏色上就分得開 | `11_merge_5x5_bulk_hole.png`、`02_titles.png`（merge 的 12 階一覽） |
| P3-7 | lines（原創性） | 檢查 36 關的機關分佈 | 有機關的關卡佔 26/36：第 1 ~ 10 關沒有機關、11 ~ 20 星橋、21 ~ 25 星門、26 ~ 36 兩種都有，出現頻率夠高。但「**星橋** = 一橫一直立體交叉」和商業作 Flow Free: Bridges 的橋規則**完全一樣**；真正自創的只有星門，而且每關最多只有 1 對，畫面又暗（P2-1）。前 10 關則和 Flow 本體完全相同 | 讓星門更突出（第 6 ~ 7 章用 2 對、顏色區分），並加入 agent 已經提過的自創機關「單向格」或「必經星（線必須經過某格）」放在第 2 章，讓前 10 關之後就有自己的特色；星橋保留沒問題 | `04_…lv11_21_26.png` |

## 實測紀錄（沒有發現問題的項目）
- **玩家流程**：
  - 8 款從選單進入 → 遊玩 → 按住 START+SELECT 75 幀回選單，都正常，選單曲 `cart3_menu` 有播放，BEST 欄格式是 6 字元（`000000` / ` --:--` / `000WIN` / ` 00/36` / `FLR 00` / `CUP000`）。
  - 用機器人跑 300 ~ 1500 幀，8 款都沒有頁面錯誤。
- **盤面可讀性**（除了缺陷表列的之外）：
  - 五子棋：1 個交叉點 8 px、棋子 7 px，金太陽石和白藍月亮石的對比很強，最後一手有紅點，游標是青色四角。縮到手機直向 1.52 倍還是一眼看得清楚，**不用改**。
  - 探雷：未開格是紫色結晶加黃色星光，已開格是深色加藍色點線；數字 1 青、2 綠、3 紅，2 倍字很好讀。結算視窗會蓋住盤面，但可以接受。
  - 數獨筆記：九宮位置的 2×2 小點，右側 HUD 另外列出游標所在格的候選數字，加上選字列下方的「剩幾個」計數，資訊夠用。
  - 派對：數字盤已排除的號碼會變暗，翻牌的記牌表、猜拳的 VS 畫面口頭禪都清楚。
- **觸控**（iPhone 13 直向 / 橫向結果相同；sudoku / mines / gomoku / lines / slide）：
  - 觸控十字鍵點 5 幀 = 移動 1 格；按住 30 幀 = 移動 5 ~ 6 格（12 / 4 連發，到邊界就停或繞回），一格一格的手感正確。
  - 偏 20° 算正方向，30° ~ 40° 判成上，**不會一次斜走兩格**。
  - lines：觸控 A 下筆、B 長按 40 幀給提示、SELECT 點一下復原，都可用。
  - sudoku：A 開選字列 → A 填入 → SELECT 復原，可用。
  - slide：B 點一下給提示，可用。
  - **兩指同按 START+SELECT 75 幀**，5 款兩個方向都能回選單。
  - 「長按」類操作（B 長按提示 / 偷看）在觸控上都做得到。
- **難度與友善**（判斷）：
  - 數獨：HARD 一定要用到區塊排除、EXPERT 一定要用到數對 / 三數組，不需要猜，對有經驗的玩家合理；錯誤提示預設 ON，只有選 STRICT 才會 GAME OVER。
  - 探雷：HARD 是 14×12、40 雷，密度 24%，比 Windows 的 expert 密，但**保證不用猜**，標準時間 240 秒寬鬆，合理。
  - 五子棋：NORMAL 是 2 層搜尋加根節點隨機，必擋四也會擋活三，人類可以用「四三」雙威脅贏，當 goal 合理；HARD 6 層對一般人很難，但不是 goal。
  - labyrinth：PAR = 最短步數時間 × 2.5 + 每把鑰匙 / 每個開關 8 秒 + 10 秒，在全黑的情況下要拿三星偏緊；但只影響星等，可以接受（做了 P2-3 之後會變寬鬆）。
  - 沒有發現反人性設計：每款都有復原 / 提示 / 重來。
- **原創性**：
  - merge：12 階天體、沒有數字方塊、有黑洞變體，和 2048 的外觀完全分開。
  - mines：紫色星岩、星塵雷、信標旗，沒有灰磚或笑臉。數字顏色「1 藍系、2 綠、3 紅」是這類遊戲的慣例，可以接受。
  - slide：6 張原創圖。
  - party：3 位原創 CPU 加原創的星牌。
- **硬限制極端情境**：見摘要（全部 overFrames 0、每線 ≤ 4）。探雷大片連鎖展開會自動分幀排隊，單幀尖峰 140 ≤ 160。
- **cart1 / cart2 迴歸**：
  - cart1：選單 → pinball → 暫停 → 按住 START+SELECT 回選單，選單曲和 BEST（`000PTS` / `0000GT`）正常。
  - cart2：選單 → pop → 回選單，正常（`  0.0S` / `000HIT`）。
  - 兩張卡帶都沒有頁面錯誤。

## 各款簡評
| 款 | 簡評 |
|---|---|
| **選單（cart3）** | 萊姆綠 logo 加青綠框，和 cart1 / cart2 明顯不同，選單曲和 BEST 都正常。要改的是 5 個圖示（P3-1）。 |
| **merge** | 天體升階有「養成」的樂趣，完全不像 2048；5×5 大量合併不會超支。HOLE 模式需要說明（P3-3），幾個同色系的階可以拉開顏色（P3-6）。 |
| **sudoku** | 產生器唯一解、不必猜，加上 5 級難度、筆記自動擦除、錯誤提示、多步復原，友善度很高。只有宮的分界可以更明顯（P3-2）。 |
| **mines** | 無猜盤面、首擊必開一片、和弦開格、提示會先抓插錯的旗，是很好的友善版；外觀原創，數字好讀。沒有缺陷，只有 HUD 貼頂（P3-5）。 |
| **gomoku** | 8 px 交叉點實測清楚。分幀思考時游標仍然可以動，悔棋 / 提示 / 最後一手標示 / 四連警告都很周到。沒有缺陷。 |
| **slide** | 6 張原創圖的 PPU 化做得很漂亮，半格滑動動畫和解題器提示也很好。**相同 / 幾乎相同的拼片**要處理（P2-4），標題文字溢出（P3-4）。 |
| **lines** | 規則、唯一解產生器和操作手感都好，36 關難度遞增；但招牌機關星橋 / 星門看不見、也沒教（P2-1），最後一章在選關畫面看不到（P2-2）。原創性要再加一個自創機關（P3-7）。 |
| **labyrinth** | 驗證器保證沒有死局，日月門、潮汐牆、羅盤、小地圖的機關設計完整；但畫面太黑、沒有走過的記憶（P2-3），新機關要有第一次的提示（P3-3），結算文字溢出（P3-4）。 |
| **party** | 三合一內容充實，CPU 的習慣可以學、猜數保證可解。沒有缺陷，只有 HUD 貼頂（P3-5）。 |
| **cart1 / cart2 迴歸** | 沒有被改壞。 |

## 建議 fix-r7 分卡（依檔案所有權）
| 卡 | 檔案 | 項目 |
|---|---|---|
| fix-r7-slide | `games/cart3/{slide,lines}/**`、`test_slide.py`、`test_lines.py` | **P2-1** 星橋 / 星門亮色化 + 第一次說明卡、**P2-2** 選關第 31 ~ 36 關、**P2-4** 拼片內容等價判定 + 片號輔助、P3-4（slide 標題）、P3-5（slide / lines HUD）、P3-7 單向格或必經星（可選，可以放 R 後續） |
| fix-r7-maze | `games/cart3/labyrinth/**`、`test_labyrinth.py` | **P2-3** 走過記憶微光 + F7 ~ F9 照明半徑、P3-3（labyrinth 新機關提示）、P3-4（結算列）、P3-5 |
| fix-r7-number | `games/cart3/{merge,sudoku}/**`、`test_merge.py`、`test_sudoku.py` | P3-2 九宮分界、P3-3（merge HOLE 說明）、P3-6 天體配色 |
| fix-r7-shell | `games/cart3/cart.js`、`games/cart3/party/**` | P3-1 選單圖示（等 fix-r7-slide / maze 定案後再對照截圖）、P3-5（party HUD，可選） |
| （board） | `games/cart3/{mines,gomoku}/**` | 不用修（P3-5 mines HUD 可選） |

# R8 qa-r8（2026-11-13）

## 摘要
- 範圍：《星塵節奏 8 合 1》`cart4.html` 的選單和 8 款（cards / simon / flash / tune / rhythm / reflex / brain / color），加上 cart1~3 迴歸抽查。總控已確認 run_all 全綠、`playthrough_cart --page cart4.html --all` 八款 goal 全達成，這次**沒有重跑**。力氣放在本卡最重要的「**人類難度**」：用模擬真人的方式重量難度（反應延遲 15~30 幀、時機抖動 ±3~8 幀、多工切換多 10~20 幀、偶爾分心），再加上聲音類可玩性、手機觸控、原創性、選單圖示、可讀性。
- 結論：**沒有擋版缺陷，也沒有 P1。** 8 款從選單進出、暫停、回選單都乾淨，沒有頁面錯誤；硬限制極端情境全部 overFrames 0、每線 ≤ 8；cart1~3 沒有被改壞。
- 缺陷：**P1 × 0、P2 × 7、P3 × 8**。P2 全部跟「真人玩得下去嗎」有關：
  - **rhythm**：判定沒有扣掉聲音的輸出延遲，也沒有校正設定（跟著音樂按的人會系統性晚 4~8 幀）；窗口 ±2/5/8 + B ≥ 70% 對新手太緊（P2-1）。EAR 模式的預告音跟自己的命中音同音高、音量比旋律小、只響 3 幀，幾乎玩不了（P2-2）。
  - **reflex**：goal「平均 ≤ 20 幀且 0 偷跑」，40 歲以上或用手機的玩家單局過關率只有 2~42%（P2-3）。
  - **brain JUGGLE**：加上多工切換成本後 3 / 3 局在 37~70 秒失敗，**全部死在 DRIFT**；其他三件任務 0 失誤（P2-4）。
  - **flash 競速**：HARD 的吱比每 6 幀走一格，超過人類手速，一般玩家勝率 0%（P2-5）。
  - **simon OCTET / tune 高音組**：方向鍵比 B 早按 1 幀就會變成低音組，直接扣命（P2-6）。
  - **觸控十字鍵**：偏離 22.5° 以上就判成斜方向，四方向遊戲會被讀成錯的方向（simon 實測直接 MISS）（P2-7）。
- 總控提出的五個疑慮，判定如下：

| 疑慮 | 判定 |
|---|---|
| brain 四模式機器人 0 失誤、量不出難度 | 加入切換成本後量得出來：**JUGGLE 的瓶頸只有 DRIFT**。只要反應迴路 ≥ 33 幀（純延遲 35 幀，或延遲 20 加切換 10~20），DRIFT 就會撞到盡頭；PUMP / SIGNAL / SHIELD 都很寬。TWIN 加切換成本後 5 心撐到第 4~5 級（共 8 級），曲線合理 ⇒ P2-4 |
| flash 競速勝負兩極 | CPU 是決定性的固定節奏（沒有抖動），而 HARD 6 幀一格 ≈ 每秒 10 格，人類做不到 ⇒ P2-5，附校正後的數字 |
| reflex 門檻 20 幀（333 ms） | 對 20 幾歲用鍵盤的人剛好（單局 71%），但 0 偷跑的要求加上手機觸控延遲，40 歲以上幾乎過不了 ⇒ P2-3：建議改 24 幀並允許 2 次偷跑 |
| rhythm ±2/5/8 幀與能量 | 窗口對準看畫面的熟手沒問題；問題在於①**沒有延遲校正**；② 新手（σ 5 幀）的 ACC 只有約 62%，拿不到 B ⇒ P2-1 |
| simon 展示速度 | 1~5 步 42 幀 / 步、14 步起 22 幀 / 步（367 ms），比原版 Simon 後期還慢，速度本身不是問題；但 goal 15 步剛好落在最快的那一段，而且沒有回命機制 ⇒ P3-4（建議而已） |

### 方法（重現用；腳本都在 scratchpad，沒有新增工具檔）
1. **真人濾鏡**：在 `CT.current.bot` 外面包一層，攔截機器人的按鍵，再依真人模型延後輸出：每次按下另外延遲 N(3, 3) 幀；換到另一組鍵（例如 DRIFT ←→ 換到 PUMP A）時，若距離上一次按鍵不到 120 幀，再加 U(10, 20) 幀切換成本；可選 3~5% 機率分心 +30 幀；兩次按下最少間隔 4 幀；按住的長度不變。機器人本身的 `&lag=` 當作基本反應延遲。brain 用這套在真遊戲裡跑。
2. **rhythm 蒙地卡羅**：在頁面裡呼叫 `CT.Rhythm.Chart.get()` 取出真正的 72 份譜面，對每顆音符抽「偏差 + N(0, σ)」，再加上換軌時按錯方向的機率和分心率；判定、能量、ACC 和 B 門檻完全照 `main.js` 的規則，每種設定跑 1000 局。
3. **reflex 蒙地卡羅**：人類簡單反應時間用 ex-Gaussian（20 代 215±30 ms + τ35、40 代 245±35 + τ45、60 代 290±45 + τ60），系統延遲鍵盤 33 ms、iPhone 觸控 80 ms，每次 5% 偷跑、1% 分心，算法照 `updateTest()`，每種設定跑 20000 局。
4. **flash 競速**：照 `raceStart()` 的最近鄰路線和 CPU 參數算 CPU 用時；人類用時 = 起手延遲 + 每格移動 9~13 幀 + 每目標按 A 加上決策時間，每格記憶正確率 90~97%。
5. **觸控**：用 `tools/mobile_shot.py` 的 `Touch`（CDP 多點），iPhone 13 直向 390×664 / 橫向，座標取自 `NES.Touch.rects()`。
6. **聲音**：從 `song.js` 讀出音高 / 音色；EAR 預告音則在遊戲中逐幀讀 `apu.state()`，取當下 p1 / p2 的音量和 timer。即時播放延遲是在 Chromium 實際 `connectAudio()` 後讀 `apu.mode` / `baseLatency` / `outputLatency`。

## 缺陷表

| 編號 | 遊戲 | 重現步驟 | 預期 vs 實際 | 建議修法 | 證據 |
|---|---|---|---|---|---|
| **P2-1** | rhythm（判定 / 校正） | CROSS NORMAL 前 3 首（goal），用真人模型跑 1000 局 | **預期**：一般玩家練幾次就能拿到 B，跟著音樂按的人不會吃虧。<br>**實際**：<br>① 判定用 APU 正在產生的那一幀（`songFrame`），但聲音要經過輸出緩衝才聽得到。實測 `file://` 退回 ScriptProcessor 1024 時 baseLatency 10.7 ms + outputLatency 32 ms，再加約 2 個 1024 緩衝（21 ms × 2），合計約 75 ms ≈ **4.5 幀**；Pages（https）走 AudioWorklet 時，佇列本身就有 60~120 ms，合計約 5~8 幀；藍牙耳機再加 150 ms 以上。**跟著聲音按的人會系統性晚 4~8 幀**，而遊戲沒有任何 offset 設定。<br>② 量化結果（3 首都拿 B 的機率 / 任一首 FAILED 的機率）：鍵盤看畫面、σ 3.5 幀的人 **94.7% / 0%**；同一個人改成跟著聲音按（+5 幀）**0% / 61%**；新手 σ 5 幀 **0% / 6%**；新手手機 **0% / 38%**；σ 6 的玩家 **0% / 95%**。用藍牙耳機（+12 幀）**100% 失敗**。<br>③ 機器人的抖動是平均分佈的 ±jit，而且偏差是 0，所以量不出①。 | ① 標題加一列 **OFFSET −4 ~ +12 幀**，存檔；判定改用 `s − offset`；另外做一個「校正」小畫面：跟著 8 下拍點按 A，取中位數自動填入。預設值 +3（大約抵掉 ScriptProcessor 延遲）。<br>② NORMAL 窗口放寬到 **PERFECT ≤ 3、GREAT ≤ 6、GOOD ≤ 10**（`LATE` 跟著改 10），drain 5 → 4，GOOD 計 50 分，B 門檻 70 → 65（或 goal 改成「C 以上」）。模擬結果：σ 5 的新手 3 首全 B 從 0% 升到 **93%**、新手手機 **65%**，加上校正後 **76%**；熟手不受影響。EASY 可以再寬一級（4 / 8 / 12）。<br>③ 測試加一條：偏差 +5、σ 3.5 的模型在 offset = 5 時要能拿到 B | `03_rhythm_cross_full_vs_ear.png`；`rhythm/chart.js:25-31`（WIN / LATE / drain）、`main.js:255`（songFrame） |
| **P2-2** | rhythm（EAR 只靠聲音） | `cart4.html?game=rhythm&bot=1&rmode=cross&song=2&diff=1&sight=2`，逐幀讀 `apu.state()` | **預期**：這是 brief §1-4 要的「只靠聲音」進階模式，要難但要能玩。<br>**實際**：<br>① 預告音 `rhythm_cue0..3` 是 **C6 / E6 / G6 / C7、12.5% 占空比、音量 6、只響 3 幀（50 ms）**。旋律 p1 同時在 C5~A6 響，音量 9~10，**音域重疊，而且音量比預告音高**，等於被旋律蓋掉。<br>② 自己的命中音 `rhythm_hit0..3` **也是同樣四個音高**（同在 p2）。NORMAL 八分音符 12 幀一顆，預告提前 1 拍（24 幀），結果會聽到「下下顆的預告」和「這顆的命中音」交錯，分不出哪個是提示。<br>③ 只靠一個 50 ms 單音去認出 4 選 1 的絕對音高，一般人很難；EAR 在 NORMAL / HARD 幾乎只有絕對音感的人能玩 | ① EAR 時命中音改成雜訊短擊（不帶音高）。② 預告音改成音量 10~12、長 6~8 幀，四軌除了音高也用**不同音色**區分（↑ 50% 長音、↓ 12.5% 撥弦、← 25% 下滑、→ 50% 雙擊）。③ EAR 預告改成提前 2 拍，或者限定只能選 EASY / NORMAL；HARD + EAR 不開放。④ 數拍小節順便把 4 個預告音由低到高播一次，當作參考音 | `rhythm/song.js:229-232`；量測：p1 vol 9~10 / cue vol 6（song 1~3，62 / 93 / 87 個預告音都有發聲） |
| **P2-3** | reflex（SIMPLE goal） | SIMPLE 5 次；用人類反應時間模型跑 20000 局 | **預期**：goal 是「一般人反應正常就過」。<br>**實際**：門檻 20 幀 + **任何一次偷跑（含 TOO SOON）goal 就失敗**。單局過關率：20 代鍵盤 71%、**40 代鍵盤 42%**、**20 代 iPhone 33%**、**40 代 iPhone 2%**、60 代鍵盤 2%。光是「0 偷跑」這一條，在 5% 偷跑率下就只剩 77%。手機觸控本身約多 2~3 幀（實測遊戲內取樣只多 1 幀：手放下後第 11 幀按，記成 12 幀；其餘是硬體延遲），這部分玩家無法控制 | ① `GOAL_AVG` 20 → **24 幀（≈ 400 ms）**。② 偷跑只重測不判失敗，或允許 ≤ 2 次（結算顯示偷跑數不變）。模擬：門檻 24 + 允許 2 次 ⇒ 20 代 / 40 代鍵盤 94%、iPhone 20 代 94%、40 代 77%、60 代鍵盤 58%（3 局內 92%）。③ 稱號表保留不動（PULSAR ≤ 12 幀依然是炫耀用）。④ 說明頁加一句 `TOUCH SCREENS ADD ~50MS` | `07_reflex_touch_landscape.png`；`reflex/main.js:44,333` |
| **P2-4** | brain JUGGLE（DRIFT） | `cart4.html?game=brain&bot=1&botmode=2&lag=20&seed=11`，掛上真人濾鏡（切換 10~20 幀） | **預期**：goal「撐過 90 秒」在一般人多玩幾次後可以達成。<br>**實際**：純機器人 lag 15 / 30 都過，失敗分佈 `[DRIFT, PUMP, SIGNAL, SHIELD]` = [0,0,0,0] / [3,0,0,0]。lag 35 在 42 秒、lag 40 在 35 秒 GAME OVER。lag 20 + 切換成本，3 個種子分別在 **56 / 61 / 70 秒**失敗；lag 25 + 切換 + 3% 分心，3 個種子都在 **37~38 秒**失敗。**15 次失誤全部是 `DRIFT HIT THE END!`**，其他三件 0 失誤。原因是推力 24（8.8）是風力 5~9 的 3~5 倍：終端速度 1.5 px/幀，視線離開 0.5 秒就會從一端衝到另一端；風力第 3 級（9）時，從安全區邊緣漂到盡頭只要約 50 幀。另外 JUGGLE 5 心、`heartPerLevel 0`，不回心 | ① DRIFT 推力 24 → **14**（第 4、5 級 16），阻尼 `dv/16` → `dv/12`。② 第 1~3 級風力 5 / 7 / 9 → **4 / 5 / 6**（OVERTIME 的第 4、5 級維持原值，留給高手）。③ 盡頭改成「撞到彈回 + 閃紅」：連撞 2 次（或撞後 60 幀內沒有拉回安全區）才算失誤。④ 每進入下一個 STAGE 回 1 心（`heartPerLevel: 1`）。⑤ 測試加一條：lag 20 + 切換 10~20 的濾鏡要能撐過 90 秒（≥ 2/3 種子） | `08_brain_juggle_drift_fail_human.png`（36.7 秒第 2 次撞端）；`brain/multi.js:31-35,207-212` |
| **P2-5** | flash（RACE ZIPPY） | 標題選 4 RACE、HARD | **預期**：EASY 新手會贏、NORMAL 五五波、HARD 是熟手的挑戰。<br>**實際**：CPU 用時是決定性的（`think + step × (路線格數 + 目標數)`，沒有抖動）。人類用十字鍵一格一格移動，每格 9~13 幀，還要加上決策。模擬 5 戰先 5 勝：熟手 EASY 100% / NORMAL 59% / **HARD 0%**；一般 100% / 15% / 0%；新手 / 觸控 73% / 9% / 0%。HARD 6 幀一格 = 每秒 10 格，超過十字鍵連按的人類上限；PROGRESS 裡機器人 lag 12 / 24 出現 5:0 / 0:5，也是這個原因 | CPUS 改成 **EASY {step 20, acc 190, think 45}、NORMAL {15, 225, 30}、HARD {11, 240, 22}**，每步再加 ±3 幀亂數抖動（用遊戲自己的 `rnd()`，可重現）。模擬：一般玩家對 NORMAL 勝率約 90%、熟手對 HARD 約 35%、新手對 EASY 100%。也可以加簡單的拉鋸（落後 2 分時 CPU step +2） | `09_flash_race_hard.png`；`flash/main.js:32-36,441-455` |
| **P2-6** | simon OCTET / tune（B + 方向） | iPhone 13 橫向：先按十字鍵右，1 幀後按 B（`06_…png`）；鍵盤上同理 | **預期**：「按住 B + 方向」兩鍵幾乎同時按時，能判成高音組。<br>**實際**：判定只看**方向鍵按下那一幀** B 有沒有按著（`simon/main.js:262`、`tune/main.js:368 keyFromDir`），沒有容錯。實測：B 先按 / 同一幀按 → 高音組（tone 5）✓；**方向先 1 幀 / 3 幀 → 低音組（tone 1）**，simon 直接 MISS 扣命，tune 算彈錯音。人兩手同時按的時間差常見 10~40 ms（1~2 幀），兩指觸控更大 | 方向鍵按下後**延後 4 幀才判定**：這 4 幀內 B 變成按下就升為高音組（鍵音也延後 4 幀，67 ms 聽不出來）。tune 的節奏計時改用「方向按下那一幀」，不受延後影響。或者改成：方向按下後 4 幀內按 B，就把剛剛的低音改判為高音（simon 要先暫緩 MISS 判定）。說明頁加 `HOLD B FIRST`。測試加「方向先 2 幀再 B ⇒ 高音」 | `06_touch_octet_dir1f_before_B_l.png`；`simon/main.js:261-262`、`tune/main.js:368` |
| **P2-7** | 觸控十字鍵 × 四方向遊戲（simon / reflex CHOICE·ARROW / rhythm CROSS / brain SIGNAL / tune） | iPhone 13 直向，在十字鍵 0.3 ~ 0.9 半徑處，從「上」往右偏 0~40° 點下 | **預期**：四方向遊戲裡，偏 25° 仍然算正方向。<br>**實際**：engine 是 8 扇區，正方向只有 **±22.5°**（換扇區磁滯 6°）：偏 0~22° 讀成 UP=16，**25~40° 讀成 UP+RIGHT=144**。各款怎麼處理斜方向：simon 依 `[UP, RIGHT, DOWN, LEFT]` 取第一個 ⇒ 想按「右」卻偏上 26° 時判成「上」，實測 **`MISS — THAT STAR WAS MOON`**；reflex `relevant()` 取 UP / DOWN 優先 ⇒ `WRONG WAY`；rhythm 兩軌都觸發，多出來那一軌算空按 −1 能量。拇指點擊的角度誤差 σ 約 10~15°，估計 **6~13% 的點擊會落進斜區**；simon 打到 15 步大約要按 120 下，等於 3~4 次斷命 | ①（總控 / engine，`touch.js`）加 `NES.Touch.setWays(4)`：四方向模式下扇區改成 ±45°，只輸出單一方向，遊戲 init 時呼叫、`CT.back` 時還原。cart4 的 simon / reflex / rhythm（CROSS）/ tune / brain SIGNAL、cart3 的 lines 都適用。② 在 engine 改好之前，遊戲端可以先擋：同一幀出現兩個方向的按下邊緣時，simon / reflex 都不判定（等下一個單一方向）；rhythm 只判有音符的那一軌、另一軌不扣能量 | `05_touch_dpad_26deg_diagonal_simon_p.png`；`engine/touch.js:51-54,596-603` |
| P3-1 | 選單圖示（`games/cart4/cart.js`） | 看選單 8 個圖示，對照遊戲畫面 | 對不上的有 5 款：<br>• flash：圖示亮格是**金色**，遊戲亮格是**青綠底白菱形**。<br>• tune：圖示是**青色**管子，遊戲是 4 根**橘**（DO~FA）+ 4 根**藍**（SO~DO）的星鐘管。<br>• rhythm：洋紅細十字，線條細、看不出是什麼；遊戲是洋紅星核、四個灰環星門，加上青 / 綠 / 橘 / 粉四色星籽。<br>• reflex：藍色信號燈加閃電，遊戲是**大圓燈**（紅 = 等、綠 = 按），還有四方訊號艙。<br>• brain：粉紅大腦，遊戲完全沒有腦的造型（四格控制台、左藍右綠分割）。<br>另外 color 的方塊是青色，遊戲是藍 ■；simon 四顆天體縮成 16×16 太擠。cards 相符 | flash 改成藍格加 2~3 個青綠亮格（白點）；tune 改成橘 2 根 + 藍 2 根的垂管加金色星軌；rhythm 改成 2×2 粗星核加四個灰環、四色星籽各 1 個；reflex 改成紅 / 綠半半的大圓燈；brain 改成 2×2 四格框（青 / 金框），中間一顆粉紅星；color 的方塊改成藍 $12。只改 `SLOTS[].icon` | `01_menu_icons_vs_ingame.png` |
| P3-2 | cards / flash / tune / reflex / brain / color（HUD 貼頂） | 遊玩畫面最上方 | 第一列 HUD 落在名稱表第 1 列，也就是可見區域的 y = 0。用截圖量第一列亮像素：cards / flash / tune / brain / color 遊玩都是 **y = 0**，reflex 測驗中也是 y = 0；simon、rhythm 是 y = 8（正確）。標題畫面 simon「ECHO」、tune「STAR MELODY」大字、brain 也從 y = 0 開始。和 qa-r6 P3-6、qa-r7 P3-5 同一類問題（手機有瀏海時像被切掉） | 有空列的款 HUD 往下移一列（從名稱表第 2 列開始）；tune / simon 標題大字從第 2 列開始。沒有空間的款至少讓卡帶內一致 | `02_titles_hud_top_row1.png` |
| P3-3 | simon / tune / brain 標題（文字擁擠） | 開各款標題 | 違反 R5 §6「段落之間空一列」：<br>• simon：5 個模式 + 2 行說明連續 7 列沒有空列。<br>• tune：按鍵列 `← ↓ ↑ → ←B↓B↑B→B` 黏成一串，`B=HOLD` 擠到第 30 欄；`HINT ON (L/R)` 在第 27 列，和 `PUSH START` 同一列。<br>• brain：模式名和副標兩兩相連。<br>另外 simon 遊玩 HUD 的 `CLASSIC` 一路寫到第 31 欄貼右邊（`05_…png` 右上） | simon：模式改成單欄，說明另起一段，前後空列。tune：按鍵列拆成兩列（`KEY  ←  ↓  ↑  →` / `B+   ←  ↓  ↑  →`），對齊上方唱名。brain：每個模式之間空一列，或者只在選中的那一項顯示副標 | `02_…png`、`05_…png` |
| P3-4 | simon（goal 曲線） | CLASSIC 第 14 步起 | 展示時間 15 + 7 幀從第 14 步開始，所以 goal 的 15 步剛好落在最快的那一段；3 條命而且**不會回命**（`MAX_LIVES = 5` 只在密技時用到）。速度本身合理（比原版 Simon 後期還慢），但一般人的序列記憶廣度大約 8~12 步，15 步對「開頭友善」偏難 | ① 15 + 7 這一段改成第 16 步起才用（goal 之前最快是 19 + 8）。② 每過 5 步回 1 命（上限 5），或者 goal 改成 12 步、15 步改成「PULSAR 稱號」 | `simon/main.js:51-56`、`:27` |
| P3-5 | tune（節奏判定） | REPLAY 第 5、6 級（goal） | 每個音距的誤差 ≤ max(6 幀, 30%)，但**只要有一個音距超出就整題失敗**。一般人重打節奏的誤差 σ 約 12~15%：7 個音距時整題失敗率約 8~28%。再加上 P2-6 的 B 組時間差，goal 那幾級會卡住 | `RH_PCT` 0.30 → 0.35；第 5~8 級允許 1 個音距超出（只扣 PERFECT，不判錯） | `tune/main.js:32,300-307` |
| P3-6 | simon EAR / tune HINT OFF / rhythm EAR（沒有聲音檢查） | iPhone 開啟靜音開關，或分頁靜音時進入只靠聲音的模式 | iOS Safari 的 Web Audio 會被靜音開關消音，遊戲沒有任何「聽不到聲音」的提示；只靠聲音的模式會被當成 bug | 選到這些模式時，先出一個 `SOUND CHECK`：播出四個鍵音，畫面寫 `HEAR IT? A=YES  B=BACK`，按 B 回標題並提示 `CHECK SILENT SWITCH / VOLUME` | — |
| P3-7 | simon（原創性：鍵音） | 看 `simon/song.js` 檔頭 | 四個鍵音是 A4 / C♯5 / E5 / A5，**A 大三和弦**。原版 Simon 的四音最常見的說法是 E / C♯ / A / E，同樣是 A 大三和弦（只是轉位不同）。外觀已經完全原創（十字排列的四顆天體，不是四色扇形圓盤），只差聲音這一點 | 改用非三和弦的組合，例如五聲音階的 C5 / D5 / G5 / A5（或 D / E / A / B），和原作拉開；OCTET 第二組再補五聲音階的其他音 | `simon/song.js:21-25`；來源見下 |
| P3-8 | engine（給總控；不是 cart4 的檔） | Chromium 實際接上聲音（`connectAudio()`）後，即時跑 180 幀 | APU 每幀推進 **59690** 週期，應該是 29780。原因是 nes.js 每幀呼叫 `apu.tick()`，ScriptProcessor / Worklet 又另外呼叫 `render()` 要樣本，**兩邊都在推進同一個時鐘**（apu.js 檔頭寫「只能擇一」）。因為 music.js 用 halt + 軟體音量包絡，聽起來影響不大；但 frame counter、sweep、線性計數器實際上跑兩倍速，樣本也是在要料的時間點取暫存器狀態（約 ±1 幀抖動）。這和 P2-1 的節奏延遲同源 | 接上喇叭後 `update()` 不要再呼叫 `apu.tick()`，或者讓 tick 產生的樣本進 ring buffer，播放端只取 buffer、不再 render。另外提供 `nes.audioLatencyFrames()`（baseLatency + outputLatency + 佇列）給 rhythm 當 offset 預設值 | `engine/nes.js:229-231`、`engine/apu.js:603-608,641-645` |

## 人類難度調整建議表

| 款 / 參數 | 現值 | 量測（真人模型） | 建議值 | 調整後預估 |
|---|---|---|---|---|
| rhythm 判定窗口（NORMAL） | P2 / G5 / GOOD8、drain 5、GOOD 40 分、B ≥ 70 | σ 5 新手 3 首全 B：0%；手機 0% | P3 / G6 / GOOD10、drain 4、GOOD 50、B ≥ 65 | σ 5：93%；手機 65% |
| rhythm 延遲校正 | 無 | 跟著聲音按（+5 幀）：0% B、61% FAILED | OFFSET −4~+12（預設 +3）+ 自動校正 | 加上校正後和看畫面相同 |
| rhythm EAR | 預告音 vol 6、3 幀、和命中音同音高 | 預告音被旋律（vol 9~10）蓋住 | 預告音 vol 10~12、6~8 幀、四種音色；命中音改成雜訊；預告提前 2 拍 | — |
| reflex goal | 平均 ≤ 20 幀、0 偷跑 | 40 代鍵盤 42%、iPhone 20 代 33% / 40 代 2% | ≤ 24 幀、偷跑 ≤ 2 | 94% / 94% / 77% |
| reflex COLOR / ARROW | to 60 / 75 幀 | 選擇反應 + 衝突約 30~40 幀 | 不用改 | — |
| brain JUGGLE DRIFT | 推力 24、風 5/7/9/11/13、`dv/16` | lag 20 + 切換：37~70 秒失敗 | 推力 14（第 4、5 級 16）、風 4/5/6/11/13、`dv/12`、撞端彈回、每 STAGE 回 1 心 | 預期 lag 20 + 切換可以撐過 90 秒（請 fix-r8 用 `scratchpad human.js` 同法回測） |
| brain TWIN | — | lag 20 + 切換：撐到第 4~5 / 8 級 | 第 6~8 級隕石速度 −15%（可選） | — |
| brain TILT / TRACER | — | lag 25~30 加抖動 0~1 失誤 | 不用改（TRACER 第 6 級雙物件 + STEP 題偏難，有重看可以接受） | — |
| flash RACE | E 16/200/30、N 11/230/22、H 6/250/12 | 一般玩家對 NORMAL 15%、HARD 0% | E 20/190/45、N 15/225/30、H 11/240/22，加 ±3 幀抖動 | 一般玩家對 NORMAL 約 90%、熟手對 HARD 約 35% |
| simon | 14 步起 15+7、3 命不回 | 速度可以接受 | 15+7 從第 16 步起；每 5 步 +1 命 | — |
| simon / tune B 組 | 同一幀判定 | 方向早 1 幀就判成低音組 | 4 幀容錯 | — |
| tune 節奏 | max(6 幀, 30%)，一個音距錯就整題錯 | 7 個音距失敗率 8~28% | 35%，第 5 級起容許 1 個 | — |
| cards 經典 4×4 | 上限 24 步 | 記憶模型中位 13~15 步、≤ 24 步 99% | 不用改 | — |
| color 色字 | 限時 180~120 幀、goal 3000 | 延遲 60 幀的機器人有 4869 分 | 不用改 | — |

## 實測紀錄（沒有發現問題的項目）
- **流程**：cart4 選單 8 槽逐一 A 進入 → 暫停 → 按住 START+SELECT 80 幀回選單，**8 / 8 正常**，選單曲 `cart4_menu` 有播放、BEST 欄是 6 字元（`000000` / `00STEP` / `  LV00` / ` ---MS`）。8 款機器人各跑 3000 幀，沒有頁面錯誤。
- **聲音（音高 / 音色）**：
  - simon 四鍵 A4 / C♯5 / E5 / A5，最小音程 3 半音，四種占空比和包絡各不同，**好分辨**。OCTET 八音合起來是 A 大調音階（最小 1 半音），但第二組疊了八度琶音，聽得出是哪一組。
  - rhythm 四軌命中音 C6 / E6 / G6 / C7（最小 3 半音）。
  - tune 是 C 大調 8 音、同一種鐘琴音色，最小 1 半音（E–F、B–C）；這是旋律重現本來就需要的，HINT ON 有亮管、HIGH-LOW 有畫高度，tri 主音持續音也能當參考。
  - 遊玩中的 BGM 只用 tri + noi，鍵音走 p1，聲道不會互搶（和 agent 的測試一致）。
- **靜音時的視覺提示**：simon 亮 / 暗的亮度對比 3.1 ~ 7.2 : 1，再加上四角星芒精靈，EYE 模式看得清楚；tune HINT ON 亮管加時間軸；rhythm FULL / FADE 不需要聲音。只靠聲音的是 EAR / HINT OFF 這些進階模式，符合 brief。
- **觸控**：
  - reflex：手放下後第 11 幀按 A，記成 12 幀（遊戲內取樣只多 1 幀），4 / 4 次正確，**沒有誤判偷跑**；手指一直放在 A 上不會造成誤判（要有按下邊緣才算）。
  - 兩指同按 B + 方向，在 B 先按或同一幀按時都正確（問題只在方向先按，見 P2-6）。
  - 觸控十字鍵按住滑動 UP → RIGHT：−55° ~ −15° 是斜方向，−10° 以後是 RIGHT，有磁滯，不會抖動。
- **原創性**：
  - rhythm：四方匯入中央星門加脈動星核，沒有箭頭板、透視指板、黑白磚，**不像** DDR / Guitar Hero / Piano Tiles。
  - simon：外觀完全不同於 Simon 玩具（P3-7 只有鍵音）。
  - cards：18 種牌面原創。
  - color：Stroop 用 6 色 6 形，字是墨色而不是字義顏色，配合手把對照圖，呈現方式是自己的；SHAPE ASSIST 的取捨已寫在 PROGRESS。
- **硬限制極端情境**（全部 overFrames 0）：
  - rhythm BLADE SUPERNOVA HARD jit 6：每線 8（剛好上限）、尖峰 39。
  - rhythm DUO 曲 6 HARD FADE：每線 6。
  - rhythm 全部不按（全 MISS → FAILED）：每線 3。
  - cards VS 6×5：每線 4、尖峰 45。
  - brain TWIN 第 8 級：每線 8、尖峰 48。
  - brain JUGGLE：尖峰 106。
  - flash RACE HARD：尖峰 71。
  - simon OCTET：每線 3。
  - color lag 0：尖峰 82。
- **cart1~3 迴歸**：pinball / pop / lines / labyrinth 機器人各 1500 幀，每線 ≤ 7、over 0、沒有錯誤；cart1 / cart2 / cart3 選單各進出 2 款，選單曲和回選單都正常。

## 各款簡評
| 款 | 簡評 |
|---|---|
| **選單（cart4）** | 霓虹粉紅 logo 加玫瑰紅框，和前三張卡明顯不同，選單曲和 BEST 都正常。有 5 個圖示要對照遊戲重畫（P3-1）。 |
| **cards** | 牌面原創又好認，翻牌動畫和配對框都好，CPU 記憶力分級合理，步數上限寬鬆。只有 HUD 貼頂（P3-2）。 |
| **simon** | 外觀原創，鍵音好分辨，聲道分工正確。要處理 B 組時間差（P2-6）、觸控斜方向（P2-7）、標題文字擁擠（P3-3）、goal 曲線（P3-4）、鍵音和弦（P3-7）。 |
| **flash** | 四種模式內容紮實，五種格子狀態用顏色和形狀雙重區分。競速 CPU 要重調（P2-5）。 |
| **tune** | 星鐘管鍵盤原創，題目由規則產生、主音持續音當參考，設計很好。B 組時間差（P2-6）、節奏容錯（P3-5）、標題按鍵列（P3-3）要修。 |
| **rhythm** | 譜面直接從曲子產生、和 driver row 對位，外觀原創，四種模式完整。**最需要修**：延遲校正和窗口（P2-1）、EAR 模式（P2-2）。 |
| **reflex** | 以幀計時、偷跑和 TOO SOON 判定正確，在觸控下也沒有誤判。goal 門檻要放寬（P2-3）。 |
| **brain** | 四個模式完整，split / 屬性分區做得漂亮。JUGGLE 的 DRIFT 是唯一的難度瓶頸（P2-4）。 |
| **color** | Stroop 呈現清楚，6 色 6 形加手把對照圖，goal 寬鬆。只有 HUD 貼頂（P3-2）。 |
| **cart1~3 迴歸** | 沒有被改壞。 |

## 建議 fix-r8 分卡（依檔案所有權）
| 卡 | 檔案 | 項目 |
|---|---|---|
| fix-r8-beat | `games/cart4/{rhythm,reflex}/**`、`test_rhythm.py`、`test_reflex.py` | **P2-1** OFFSET + 校正 + 窗口 / drain / B 門檻；**P2-2** EAR 預告音 / 命中音；**P2-3** reflex goal 24 幀 + 偷跑 ≤ 2；P2-7 遊戲端斜方向處理（rhythm 不扣能量、reflex 不判）；P3-2（reflex HUD）、P3-6（rhythm EAR 聲音檢查） |
| fix-r8-sound | `games/cart4/{simon,tune}/**`、`test_simon.py`、`test_tune.py` | **P2-6** B 組 4 幀容錯；P2-7 遊戲端斜方向不判；P3-2 / P3-3 標題與 HUD；P3-4 simon 速度和回命；P3-5 tune 節奏容錯；P3-6 聲音檢查；P3-7 鍵音改五聲音階 |
| fix-r8-memory | `games/cart4/{cards,flash}/**`、`test_cards.py`、`test_flash.py` | **P2-5** 競速 CPU 參數 + 抖動；P3-2 HUD |
| fix-r8-brain | `games/cart4/brain/**`、`test_brain.py` | **P2-4** DRIFT 推力 / 風 / 阻尼 / 彈回 + 每 STAGE 回心，用真人濾鏡回測；P2-7 SIGNAL 斜方向；P3-2 / P3-3 |
| fix-r8-shell+color | `games/cart4/cart.js`、`games/cart4/color/**` | P3-1 圖示（等其他卡定案後再對照截圖）；P3-2（color HUD） |
| 總控 / engine | `engine/touch.js`、`engine/nes.js`、`engine/apu.js` | **P2-7** `NES.Touch.setWays(4)`（四方向 ±45°）；P3-8 APU 雙重推進 + `audioLatencyFrames()`（R9 收尾前處理，或者記錄到後續） |

- 回測用的真人濾鏡：`human.js` 的作法是在 `CT.current.bot` 外面包一層，攔截上升沿，延後 N(3, 3) 幀，換組再加 10~20 幀切換成本。建議 fix-r8-brain / fix-r8-beat 把同樣的模型寫進各自的 `test_*.py`，當作「人類難度」測試，以後就不會再出現「機器人 0 失誤，量不出難度」。
- 來源（P3-7 Simon 的音）：[Simon (game) — Wikipedia](https://en.wikipedia.org/wiki/Simon_(game))、[Simon says（mitchkahle）](https://mitchkahle.substack.com/p/simon-says)、[IEEE Spectrum: simon game](https://spectrum.ieee.org/simon-game)（不同來源的說法不一致：E–C♯–A–E 是最常見的說法，IEEE 寫的是 G–C–E–G，所以標為 [推論]）。

# R9 qa-r9（2026-11-13）

## 摘要
- 範圍：《星塵文創 6 合 1》`cart5.html` 的選單和 6 款（adventure / escape / quiz / words / typing / paint），中文文字系統 `CT.Text`，cart1~4 迴歸，單檔版 build。這是最後一張卡，以「交給使用者驗收」的標準來看：中文讀起來順不順、題目對不對、真人玩不玩得下去、手機能不能操作。
- 先確認的基本盤：`playthrough_cart --page cart5.html --all` 6 / 6 goal 達成（每線 ≤ 5、overFrames 0、尖峰 ≤ 150）；textdemo 2000 字長文 5842 幀、over 0；`test_cart` cart1~5 全過（198 / 189 / 189 / 189 / 163）；`test_touch` 995 / 995；`build.py --check --src cart5.html` PASS（內嵌 49 檔），另外 build 到 scratchpad 實際開啟，6 款機器人各跑 1500 幀，沒有錯誤、缺字 0、over 0。
- 結論：**P1 × 1、P2 × 4、P3 × 10**。
  - **P1-1（escape）**：撥盤鎖特寫畫面的字形池只有 120 磚，第一室輸入正解 **7142 時一定會有一格數字變成空白**（第三室試錯一次後也會）。這是第一間密室的主謎題，使用者會以為壞掉了。
  - **P2-1（quiz）**：goal「限時連答 ≥ 3000 分」用真人模型（讀題 3~5 秒）量，**達成率 0%**；讀很快的人（2~3 秒）也只有 5%。
  - **P2-2（quiz 對戰）**：電腦「普通」一般玩家勝率 3%、「強」0%。
  - **P2-3（paint 臨摹）**：評分太寬鬆。STAR FORT 只畫一個灰色實心方塊就拿 **A**，GIFT BOX 一個方塊拿 **B**（= goal 達成）；把畫面切成 4×4 格的大方塊，8 張都至少 B。
  - **P2-4（CT.Text 斷行）**：連續的收尾標點（`？！`、`」。`、`……`）和破折號 `——` 會被拆到兩行，下一行以標點開頭。adventure 有 12 處，**第一頁就是**「小島—／—星港鎮」。另外 `—` 的字形和「一」幾乎一樣，拆開後讀起來像「小島一」。
- 中文品質：1305 個字串、22,412 字逐頁讀完，**沒有錯字、沒有簡體字**（OpenCC s2t 掃描，只抓到台 / 床 / 群這類異體對照，不算錯）。故事語氣溫柔、全年齡、原創，語句通順。15px 字身在 16×16 格裡清楚，手機直向 1.52 倍時筆畫有些粗細不均，但讀得出來。
- 題庫：216 題全部查證，**沒有答錯的題目**。有 3 題的誤答選項設計可以再改（P3-9）。

### 方法（重現用；腳本都在 scratchpad，沒有新增工具檔）
1. **文字掃描**：用正規式抽出 `games/cart5/**/*.js` 裡含中文的字串常值（1305 條），先用 OpenCC（`opencc-python-reimplemented`，裝在 scratchpad）做逐字 s2t 比對，再人工逐條讀。斷行檢查是在 node 裡直接呼叫 `CT.Text.wrap(s, 26)`（adventure / escape / quiz 的對話框都是 26 欄），找「行首是收尾標點或 `—`」以及「上一行以 `—` 結尾」的情況。
2. **quiz 真人模型**（蒙地卡羅，每種設定 20000 局，規則照 `quiz/main.js:210-232, 270-280`）：先在遊戲裡量題目打字階段平均 11 幀，這段時間不計時，所以讀題幾乎都在計時中。每題的計時 = 讀題加決策 U(3, 5) 秒（中級 +0.5、高級 +1 秒）+ 游標 0~2 格 × 0.28 秒 + 按 A 0.25 秒 + |N(0, 0.3)|。正確率依初 / 中 / 高級：一般 92 / 78 / 60%、小朋友 85 / 60 / 40%。答錯扣 5 秒。對戰模式照 `planCpu()` / `cpuAct()` 的規則算。
3. **paint 評分**：在 node 裡載入 `paint/core.js` + `pics.js`，對 8 張範例分別做：8×8 方塊照抄、16×16、32×32 大方塊、單一外框實心方塊、只用一色但形狀完全一樣、整張位移，算 `C.score()`。另外在遊戲裡實際用 BLOCK 工具畫一個方塊後 FINISH，結果和模擬一致（`05_…png`）。
4. **typing 手把負擔**：用遊戲自己的 `KB.path()`（BFS），算出各級字表平均每字要按幾下十字鍵，人類每格 13 幀、每字母加 22 幀（找鍵加按 A），再和 `LEVELS` 的出字間隔比較。
5. **escape 撥盤**：在 `ppu.setTile` 掛 hook，記錄撥盤格子是被誰寫入的；同時讀 `GAME.state().s.text` 的 `overflow / free / pool`。
6. **手機**：`tools/mobile_shot.py` 加上自己寫的 CDP 觸控腳本，iPhone 13 直向（390×664）和橫向（750×342）：adventure 用 A 翻頁、escape 游標、typing 鍵盤、paint 兩指（A + 十字鍵）畫線。
7. **迴歸**：cart1~4 選單各進出 2 款（maze / pinball、laser / pop、mines / labyrinth、simon / rhythm），cart5 六款都進出一次，用按住 START+SELECT 80 幀回選單；每次確認 `NES.Touch.ways()` 回到 8；另外跑 `test_cart` cart1~5 和 `test_touch`。

## 缺陷表

| 編號 | 遊戲 | 重現步驟 | 預期 vs 實際 | 建議修法 | 證據 |
|---|---|---|---|---|---|
| **P1-1** | escape（撥盤鎖字形池） | 第一室：照提示打開大門的密碼鎖，依序把四位數撥成 7 → 1 → 4 → 2（撥到第三位的 2、3、4 時就會發生）。第三室玻璃櫃的鎖：撥錯按一次 A，出現「打不開……好像不對。」之後再撥 | **預期**：四格數字一直都看得到。<br>**實際**：撥盤特寫的 bank 自己只用 29 磚，但字形池被 `POOL_MAX = 120` 限住（30 個全形字）。畫面上同時有：HUD 房名 + 「離開」、機關標題「大門的密碼鎖」、說明「上下改數字，左右換位置，按 A 試開。」、加上 4 個不同的全形數字，總共 31 字 = 124 磚，超過 120。結果 `runJob` 走 overflow 分支，**把那一格寫成 TX_BLANK（41 號磚）**，而且一直保持空白，直到改成已經在快取裡的數字才會再出現。實測：lock 撥到 `7142` 時 overflow 3、free 0；cab 試錯一次後 overflow 1、free 0；lights 按 A 之後 free 0（剛好沒有爆）。機器人照樣解得開（它不看數字），所以測試沒有抓到 | ① `build()` 的池大小改成「這個畫面實際剩多少就給多少」：`pool = 256 − used`（撥盤畫面約 203 磚），`POOL_MAX` 只套用在磁磚多的牆面。② 或者撥盤畫面的說明改成精靈 / 8×8 英數字，不放在字形池。③ `test_escape.py` 加一條：每把撥盤鎖都撥出「4 個不同的值」，再加一次試錯訊息，要求 `overflow == 0`，並且讀名稱表確認 4 格都不是空白磚 | `02_escape_dial_digit_missing.png`（左：手動撥 7142；右：機器人過關時的畫面）；`escape/main.js:28,64-74,341,398`、`text.js:343-352` |
| **P2-1** | quiz（goal 門檻） | 限時連答、全部分類，用真人模型跑 20000 局 | **預期**：一般玩家玩幾次就能達到 goal。<br>**實際**：機器人每題只讀 1.5 秒，所以 lag 40 還有 2670~5406 分。真人模型的達成率：讀題 2~3 秒的快手 **5.2%**（中位數 1949 分）；**一般人 3~5 秒 0%**（中位數 1302、p90 1932）；慢讀 4~6 秒 0%；小朋友 0%。把時間改成 90 秒、扣時改 3 秒，一般人也只有 5% | `GOAL_SCORE` 3000 → **1200**。模擬達成率：快手 93% / 一般 62% / 慢讀 31% / 小朋友 26%（如果想再寬一點，用 1000：97 / 79 / 63 / 46%）。標題的 `GOAL` 顯示會跟著改。機器人的讀題時間改成 `lag + 120 + 3 × 題長` 幀，比較接近人類，測試才量得出真正的難度 | `04_quiz_title_goal3000_question.png`；`quiz/main.js:33,214` |
| **P2-2** | quiz（對戰電腦） | 對戰 10 題，電腦三級各跑 20000 局 | **預期**：弱 = 新手會贏、普通 = 有輸有贏、強 = 挑戰。<br>**實際**：電腦作答 150~300 / 100~220 / 60~150 幀（2.5~5 / 1.7~3.7 / 1~2.5 秒），一般人讀題就要 3~5 秒。勝率：一般玩家 **弱 46% / 普通 3% / 強 0%**；快手 97 / 20 / 0%；小朋友 37 / 2 / 0% | `CPU` 改成 `{240,420,.55}`、`{200,330,.7}`、`{140,260,.8}`。模擬：一般玩家 97 / 37 / 0.5%，快手 100 / 97 / 29%，小朋友 92 / 23 / 0%。「強」就留給讀得快的人 | `quiz/main.js:35,189-192` |
| **P2-3** | paint（臨摹評分太寬） | COPY CHALLENGE 選 STAR FORT，用 BLOCK 工具在範例的外框位置畫一個灰色實心方塊，按 FINISH；GIFT BOX 也照做 | **預期**：要大致照著畫才拿得到 B（goal）。<br>**實際**：STAR FORT **85 分 A「CLEAR! WELL DONE」**，GIFT BOX 77 分 B。8 張範例的離線計算：<br>• 外框實心方塊：77B / 49C / 63C / 74B / 69B / 52C / 62C / 85A<br>• 4×4 大方塊（32×32 px）：72B / 73B / 87A / 75B / 81A / 69B / 77B / 74B（**8 張都 ≥ B**）<br>• 只用一色但形狀一樣：76~92，大多 A<br>原因：① 32×32 格加上 ±1 格容差，等於容許 ±4 px，再加上「格子裡至少 4/16 是墨」，大塊色面幾乎每格都算命中；② 顏色只佔 `0.5 + 0.5 × col`，全部畫錯色最多也只扣一半 | 評分改成 **64×64 格（2 px）、±1 格容差、`score = 100 × f1² × col`**，門檻 **S 93 / A 85 / B 72 / C 55**。離線結果：8×8 方塊照抄 83~97（S 5 張、A 3 張）；模擬人畫的（8×8 方塊、整體位移 ±3 px、8% 格子漏畫）77~96，都在 B 以上；16×16 方塊 61~81；外框方塊 **25~65（全部 < B）**；32×32 大方塊 47~70（全部 < B）。`test_paint.py` 加一條：「外框實心方塊在 8 張範例都 < B」 | `05_paint_copy_one_rect_A_B.png`；`paint/core.js:386-421` |
| **P2-4** | CT.Text（斷行與 `—` 字形；影響 adventure） | 開 adventure 開場第 1 頁；或者用 `CT.Text.wrap(s, 26)` 跑 adventure 的全部字串 | **預期**：行首不放收尾標點；`——`、`……` 不拆開。<br>**實際**：`wrapSeg()` 的避頭規則只在「上一行最後一個字不是收尾標點」時才把它一起帶到下一行。所以連續的收尾標點（`？！`、`」。`、`……`）放不下時，第二個標點會跑到下一行行首；`—` 不在 `CLOSE_PUNCT` 裡，`——` 可以直接被拆開。adventure 一共 12 處：L63「小島—／—星港鎮」（**開場第 1 頁**）、L52「「星橋」／。燈塔…」、L217「星星？／！」、L305 / 333 / 424 / 599「…／…」、L411「《星港傳說集》／。」、L459「「吵醒」／。」、L567「天空—／—」、L67「見習郵差——／小羽」（最後這處沒有拆開，但也不理想）。escape 和 quiz 用同樣的欄寬，0 處。<br>另外 `—` 的點陣是第 8 列 12 px（x 1~12），「一」是第 7 列 14 px，**兩個字幾乎一樣**，兩個 `—` 之間還留了 4 px 空隙，所以畫面上「——」看起來像「一 一」，拆開之後就是「小島一」 | ① `text.js` 的避頭：行首遇到收尾標點時，往回找到第一個「不是收尾標點」的字，把它和後面的標點一起帶到下一行（最多帶 3 個字）；`—` 加進不可拆的成對字元，`——`、`……` 當成一個單位。② `tools/cjk_glyphs.py` 對 `—`（U+2014）特別處理：畫成 x 0~15 滿寬（左右不留白），讓兩個 `—` 接成一條線，和「一」明顯不同。③ `test_text.py` 加一條：掃描 cart5 全部字串，在 26 / 24 / 22 欄時都沒有「行首收尾標點」，也沒有拆開的 `——` / `……` | `03_adv_dash_split_line.png`；`text.js:30-31,120-133`；`glyphs.js` 的 `—` |
| P3-1 | 選單圖示（`games/cart5/cart.js`） | 看選單 6 個圖示，對照遊戲畫面（`01_…png`） | • adventure：圖示是**白色藏寶圖加橘色路線**，遊戲主視覺是**夜晚的紅白燈塔**（標題、燈塔前、星橋都是）。<br>• escape：圖示是**天藍色的門**，第一室的大門是**橘色木門加黃色數字鍵盤，牆是紅褐色**。<br>• words：圖示是**橘 / 白字母磚**，遊戲字格是**深藍底白字，找到的字變玫瑰紅**；而且 B 磚往下掉了半格，壓到下一列「星塵打字」的位置。<br>quiz（紫色問號泡泡）、typing（青色鍵盤 + 金色鍵）、paint（調色盤）都符合 | adventure 改成紅白燈塔加深藍夜空和一顆星；escape 改成橘色木門 + 黃色鍵盤鎖，背景紅褐色；words 改成兩塊深藍字磚（$02 底、白字，其中一塊玫瑰紅 $15），兩塊對齊在同一列 | `01_menu_icons_vs_ingame.png` |
| P3-2 | adventure（壞結局怎麼回來 / 存檔） | 在燈座把玻璃珠放進去 → 結局 4「霧中的港口」 | 畫面寫「按 C/★ 可以回到剛才的選擇」，也就是**正常的重來要用密技**：會算進 `runCheats`，之後走到真結局 goal 也是 false。如果玩家看到結局卡片直接按 A，會回到標題，而遊戲**沒有自動存檔**（只有系統 → 存檔的 3 格），沒有手動存過就要從閣樓重頭來（真結局路線大約 20 分鐘） | ① 壞結局的卡片改成「A：回到剛才的選擇　B：回標題」，用的是 `g.snap`，不算密技。② 每次換場景時自動存到第 0 格「自動」，標題的「繼續遊戲」預設讀它。③ 卡片上的英文混用（`C/★：回到剛才的選擇`）一起改掉 | `adventure/main.js:364-382,497-509`；`text_story.js:600,606` |
| P3-3 | typing（實體鍵盤對應沒有還原） | PC：進 typing → METEOR 開打 → Esc 暫停 → 按住 Enter+Shift 回選單 → 在選單按 Z / X / W A S D | **預期**：回到選單後鍵盤恢復正常。<br>**實際**：在選單裡 `NES.Input.mask()` 對 Z / X / W / A / S / D / Shift 都是 0（只有方向鍵有作用），**要等進了下一款遊戲才會恢復**。另外暫停時 Shift 也讀成 0。影響不大（方向鍵和 Enter 在選單還能用），但第一次遇到會以為按鍵壞了 | `exit()` 和 registry 回選單的路徑（`CT.back` 前）都呼叫 `Phys.release()`，把對應立刻還原，不要等到放開按鍵；暫停時也把 Shift 一起還原 | `typing/kbd.js` `Phys`、`typing/main.js` exit |
| P3-4 | 中英混用 / 半形字太小（adventure、escape、quiz、paint） | 看各款的說明頁和結算畫面 | ① adventure 說明頁和 escape 說明最後一頁還是英文：`HOLD START+SELECT: MENU`、`C/★ = CHEAT`；這張卡本來就是中文文字卡，其他行都是中文。② quiz 題目裡的英文（例如「英文 water 的意思是？」）、escape 的「按 A 試開」、評價「S」都是 8×8 半形字，夾在 15 px 中文中間顯得很小，escape 結算的評價 **S 只有 8 px**，看起來很沒成就感。③ paint 整款的 UI 都是英文（`FILL EVERY AREA`、`COPY THE PICTURE AT RIGHT…`），選單上的名字卻是「星塵畫室」 | ① 說明改成「按住 START+SELECT：回選單」「C／★：密技（立即提示）」。② escape 結算的評價改成 16×16 大字（用全形 Ｓ／Ａ／Ｂ／Ｃ 或放大的點陣）；quiz 句中的英文單字可以改用全形英數，或至少讓 8×8 半形字貼齊行的底線。③ paint 的標題 / 清單 / 說明 / 結算畫面（不是畫布畫面）改用 `CT.Text` 中文：這些畫面不需要畫布池，可以另外開一個有字形池的 bank | `06_…png`、`02_…png`（左下）、`12_typing_words_paint.png` |
| P3-5 | escape（標題 / 故事圖） | 開 escape 標題，按 A 進開場故事 | ① 標題和故事圖**最左邊 x = 0~1 有一整排等距的白點**（星空產生器在第 0 欄排成一直線），像是畫面壞掉。② 開場故事圖裡的朔叔（藍色精靈）**浮在天空中**，腳下沒有地面，旁邊還有一顆金色圓球 | 星空產生器避開 x < 4，或在整個畫面上隨機分佈；朔叔的 y 改成站在地平線上（例如 y + 48），或改成站在圓頂旁 | `06_escape_title_story_art.png` |
| P3-6 | 手機：typing / words（只能用十字鍵） | iPhone 13 直向，用畫面十字鍵打字 | 用遊戲的 BFS 算：每個字平均要按十字鍵 **8.7（LV1）/ 14.1（LV5）/ 20.3（LV9）**下。人類每格 13 幀 + 每字母 22 幀，LV1~3 打一個字的時間是出字間隔的 0.6~0.8 倍（可以玩），**LV4 0.98、LV5 1.13、LV7 1.46**。所以 goal（到 LV5）勉強做得到，但手機玩家沒有實體鍵盤，LV6 以後基本上過不去，而且一直按十字鍵很累。STAR PROBE 一次猜字也要按 10~15 下 | 有觸控時，**直接點畫面上的鍵盤就算打那個字**（`NES.Touch` 的點擊座標換算成畫面 px，再對到 `KB.keys` 的範圍；`?` 在說明頁註明「手機可以直接點鍵盤」）。paint 的畫布、escape 的游標也可以用同樣的方法（點哪裡游標就跳到哪裡）。這是 brief §1-4 之外的加分項，不改也可以，但手機體驗會差很多 | `08_mobile_typing_portrait_paint_landscape.png`；`typing/main.js:30-41` |
| P3-7 | escape（說明頁） | 標題 → 遊戲說明 | 7 個主題一頁一個，每頁只有 2~3 行字，放在 10 行高的框裡，要按 7 次 A；最後一頁是英文（P3-4） | 兩個主題合一頁（【目標】+【移動】、【調查】+【物品】、【組合】+【提示】、【評價】+ 按鍵），頁數 7 → 4 | `escape/text_ui.js:21-28` |
| P3-8 | 總控：dist | `ls dist/` | 還沒有 `dist/星塵文創6合1.html`（其他 8 個都有）。`build.py --src cart5.html --out <scratchpad>` 產生的單檔 1043 KB，開起來 6 款都正常、沒有載入失敗 | commit 前跑 `$PY tools/build.py --src cart5.html` | — |
| P3-9 | quiz（題目選項） | 看題庫 | 答案都正確，但有 3 題的誤答選項可以改得更好：<br>• 地理初 #4「野生企鵝大多生活在哪個半球？」：誤答「東半球」「西半球」和「南半球」**不是互斥的分類**（南極的企鵝同時也在東 / 西半球）。<br>• 地理高 #3「世界上面積最大的湖泊是？裏海」：裏海算湖還是海有爭議，建議題目加「一般認為」。<br>• 自然中 #9「冰山大部分體積在水面的？下方 / 上方 / 左側 / 右側」：「左側」「右側」太明顯是湊數的 | 企鵝題的誤答改成「北半球 / 赤道上 / 北極圈內」；裏海題加「一般認為」；冰山題改成問「大約幾成在水面下？九成 / 一半 / 兩成 / 全部」 | 下面「題庫查證表」 |
| P3-10 | 選單（`cart.js` 文字） | 看選單下方兩行說明 | `A/START PLAY  SELECT NEXT` 從第 4 欄開始，`HOLD START+SELECT = MENU` 從第 3 欄開始，兩行沒有對齊；`CART-5` 和 `BEST` 疊成兩行，貼在一起 | 兩行置中或從同一欄開始；`BEST` 往下移一列，或放到分數欄正上方 | `01_menu_icons_vs_ingame.png` |

## 題庫查證表（216 題全部查過，下面列出 48 題的依據；✔ = 正確）

| 題（類.級.序） | 題目 → 正解 | 判定 / 依據 |
|---|---|---|
| 自然.初.1 | 一大氣壓下水的沸點 → 攝氏 100 度 | ✔ 標準大氣壓定義 |
| 自然.初.2 | 離太陽最近的行星 → 水星 | ✔ |
| 自然.初.4 | 蜘蛛幾隻腳 → 8 | ✔ 蛛形綱 4 對步足 |
| 自然.初.5 | 哺乳類 → 鯨魚（鯊魚 / 企鵝 / 鱷魚為誤答） | ✔ |
| 自然.初.11 | 昆蟲 → 螞蟻（蜘蛛 / 蜈蚣 / 蝸牛為誤答） | ✔ 昆蟲 3 對足；蜘蛛是蛛形綱、蜈蚣是唇足綱 |
| 自然.中.3 | 人體最大的器官 → 皮膚 | ✔ 題目有寫「一般認為」 |
| 自然.中.4 | 體積最大的行星 → 木星 | ✔ |
| 自然.中.5 | 鯨魚用什麼呼吸 → 肺 | ✔ |
| 自然.中.12 | 鐵生鏽 → 氧氣和水 | ✔ |
| 自然.高.1 | 光速 → 約 30 萬公里 / 秒 | ✔ 299,792 km/s |
| 自然.高.2 | 人體質量最多的元素 → 氧 | ✔ 約 65% |
| 自然.高.3 | DNA 雙螺旋模型 → 1953 年 | ✔ Watson & Crick, Nature 1953 |
| 自然.高.5 | 大氣中最多的氣體 → 氮氣 | ✔ 約 78% |
| 自然.高.7 | 空氣中音速 → 約 340 m/s | ✔ 20°C 約 343 m/s |
| 自然.高.12 | 不是金屬 → 硫 | ✔ |
| 地理.初.1 | 臺灣最高峰 → 玉山 | ✔ 3952 m |
| 地理.初.8 | 吉薩金字塔 → 埃及 | ✔ |
| 地理.初.10 | 原產澳洲 → 袋鼠（大貓熊是臺灣用語） | ✔ |
| 地理.中.1 | 一般認為最長的河 → 尼羅河 | ✔ 題目有「一般認為」，選項裡也沒有亞馬遜河，不會有爭議 |
| 地理.中.4 | 澳洲首都 → 坎培拉 | ✔ |
| 地理.中.5 | 臺灣最長的河川 → 濁水溪 | ✔ 186.6 km |
| 地理.中.6 | 不算南北極最大的沙漠 → 撒哈拉 | ✔ |
| 地理.中.7 | 赤道經過 → 肯亞 | ✔ |
| 地理.中.10 | 臺灣面積最大的縣 → 花蓮縣 | ✔ 約 4629 km²（比臺東、南投大） |
| 地理.中.12 | 本初子午線經過 → 倫敦 | ✔ 格林威治 |
| 地理.高.1 | 最深的海溝 → 馬里亞納 | ✔ |
| 地理.高.2 | 不算大陸最大的島 → 格陵蘭 | ✔ |
| 地理.高.5 | 北回歸線 → 北緯 23.5 度 | ✔ 實際約 23.44° |
| 地理.高.6 | 落差最大的瀑布 → 天使瀑布 | ✔ 979 m |
| 地理.高.10 | 尼羅河注入 → 地中海 | ✔ |
| 地理.高.12 | 臺灣位在哪兩個板塊交界 → 歐亞板塊與菲律賓海板塊 | ✔ |
| 歷史.初.2 | 第一位踏上月球的人 → 阿姆斯壯 | ✔ 1969 |
| 歷史.初.8 | 造紙術 → 中國 | ✔ 誤答已經避開埃及（紙莎草） |
| 歷史.中.4 | 活字印刷 → 畢昇 | ✔ 沈括《夢溪筆談》 |
| 歷史.中.9 | 不是四大發明 → 蒸汽機 | ✔ |
| 歷史.中.11 | 發現鐳 → 居禮夫婦 | ✔ 1898 |
| 歷史.高.3 | 古騰堡印刷 → 15 世紀 | ✔ 約 1440~1450 |
| 歷史.高.6 | 羅馬帝國第一位皇帝 → 屋大維 | ✔ 凱撒不是皇帝 |
| 歷史.高.9 | 首次環球航行的船隊由誰率領出發 → 麥哲倫 | ✔ 題目寫「率領出發」，避開了麥哲倫死在途中的爭議 |
| 歷史.高.11 | 明治維新 → 1868 | ✔ |
| 生活.初.5 | 臺灣火災 → 119 | ✔ |
| 生活.中.1 | 臺灣報警 → 110 | ✔ |
| 生活.高.3 | CPR 按壓 → 每分鐘 100~120 下 | ✔ AHA / 臺灣衛福部 |
| 生活.高.5 | 臺灣家用插座 → 110 V | ✔ |
| 生活.高.12 | 高鐵最南端的站 → 高雄（左營） | ✔ 屏東延伸線還沒通車 |
| 語文.中.10 | 床前明月光 → 李白 | ✔《靜夜思》 |
| 語文.高.2 | 推敲 → 賈島 | ✔ |
| 語文.高.5 | 蘇軾自號 → 東坡居士 | ✔（青蓮居士 = 李白、五柳先生 = 陶淵明、香山居士 = 白居易，誤答都對得上人） |
| 遊戲.中.1 | 紅白機日本發售 → 1983 | ✔ 1983-07-15 |
| 遊戲.中.2 / .3 / .4 | APU 5 聲道 / 每線 8 精靈 / 一畫面 64 精靈 | ✔ 2A03、OAM 64 項 |
| 遊戲.中.5 | 輸出解析度 → 256×240 | ✔（NTSC 一般只看得到 224 線，但輸出確實是 240） |
| 遊戲.高.1 / .2 | CPU 基礎 → 6502、RAM → 2 KB | ✔ Ricoh 2A03 |
| 遊戲.高.4 | 背景配色單位 → 16×16 | ✔ 屬性表 |
| 遊戲.高.6 | NES 紐約試賣 → 1985 | ✔ 1985 年 10 月 |
| 遊戲.高.8 | 磁碟機 → 1986 | ✔ 1986-02-21 |
| 遊戲.高.10 | 三角波的特色 → 沒有音量控制 | ✔ 只有開 / 關 |
| 遊戲.高.12 | NTSC CPU 時脈 → 1.79 MHz | ✔ 1.789773 MHz |

其他 160 多題（顏色、季節、成語、英文單字、度量衡、交通安全…）都是常識題，答案正確，選項之間也沒有重疊。**有疑義：0 題答錯；選項可以改進：3 題（P3-9）。**

## 中文文字品質

| 項目 | 結果 |
|---|---|
| 錯字 / 簡體字 | 1305 個字串（22,412 字）用 OpenCC 逐字比對，**0 個簡體字**；人工逐條讀完，**0 個錯字**（「搆不著」「大貓熊」「臺灣」等用字都符合臺灣習慣） |
| 語病 / 不通順 | 沒有發現。adventure 的對白很有個性（齒輪爺爺「老頭子的直覺」、拾光的童言童語），escape 的提示三段一段比一段清楚 |
| 截斷 | 對話框沒有：`T.box` 依池容量自動分頁，adventure / quiz 各 1500 次隨機按鍵 overflow 0。escape 的撥盤畫面例外（P1-1） |
| 斷行 / 標點 | 單一標點的避頭避尾正確；連續標點和 `——` 有問題（P2-4） |
| 逐字速度 | 每字 2 幀（約每秒 30 字），句末停 8 幀；A 一下寫完整頁、再按 A 翻頁。大部分人讀得比它慢，所以不會覺得在等字。（沒有速度設定和訊息回看，屬於加分項，不列缺陷） |
| 名牌 / ▼■ | 名牌在框的左上角，▼ 翻頁、■ 結束都會閃，清楚 |
| 字形清晰度 | 15 px 字身在桌機 2× 和手機橫向 1.53× 都很清楚；手機直向 1.52×（DPR 3）有些筆畫粗細不一，但「傍」「晚」「塞」「燈」這類筆畫多的字都還分得出來（`07_…png`） |
| 全年齡 / 原創 | adventure《消失的星燈》、escape《天文台的三道考驗》都是原創故事，沒有暴力或恐怖內容。壞結局的語氣也很溫和（「回籠覺」） |

## 實測紀錄（沒有發現問題的項目）
- **adventure**：機器人 29 步走完真結局。10 個地點加變體都看過，場景圖原創、好看（燈塔、鐘錶店、天文台、星石林地都很有特色）。提示系統 12 段：搶回星核路線（`g.f.grab`）也正確跳過「讓孩子聽音樂」那幾段，**不會卡關**。選單文字 ≤ 3 字、右欄不擠。
- **escape**：三間的謎題鏈我自己推過一遍：書背 + 彩虹順序 → 7142；九燈初始 `[1,1,0/1,0,0/0,0,1]` 照提示按上中、中左、正中三下就全亮；齒輪大小 ▲●★；管線 / 光路提示的方向序列和正解路徑逐格對過；太陽系儀 [5,3,4] 按甲 2、乙 3、丙 1 次後三圈都是 0；黑板 ▲=4、●=3、■=4、◆=2 → 4342，答案唯一；寶石照望遠鏡看到的「藍白紅黃」。**線索都在房間裡，提示三段給得很漸進，很公平**。時間限制 15 / 20 / 25 分鐘也很寬裕。
- **words**：STAR PROBE 用 ★ ◎ · 符號標在字母**正下方**，字格和字母本身不上色，7 次機會，名稱和外觀都**不像 Wordle**。WORD HUNT 的拉選手感好，找到的字變玫瑰紅也清楚。
- **typing**：METEOR 下一個要按的鍵會亮金色，手把玩家很容易跟。goal（LV5）手把真人做得到（見 P3-6 的數字），SENTENCE 的評價門檻也有分手把 / 鍵盤兩套，很合理。外觀是隕石帶字往基地掉，和 ZType 一類同屬「打字射擊」這個大類型，但畫面是自己的。
- **paint**：大填色（鋸齒線把畫布分成好幾區後，填中間最大的一區）：VBlank 尖峰 149、over 0，進度條會顯示，幾幀就完成；因為同樣內容的磁磚會共用，畫面幾乎是一次就變色。8 張著色本線稿都是原創；工具列是自己的設計，**不像 Mario Paint**（沒有印章、沒有蒼蠅小遊戲，游標是箭頭 / 十字）。
- **quiz**：題目打字階段平均 11 幀，這段不計時；依程式，暫停時會把題目藏起來（不能暫停偷想），設計很好。心算鍵盤游標照規格走。
- **硬限制極端情境**（全部 overFrames 0）：textdemo 2000 字 53 頁（尖峰 136）；paint 大填色（尖峰 149）；escape 機器人走完第一室（轉身、進出特寫每次都在 `CT.blank` 裡整片重建，尖峰 137），另外手動把三間的 7 種機關各開一次，都沒有超支；adventure 走完真結局，換了 15 次場景（尖峰 136、每線 4）。
- **手機（iPhone 13）**：直向 adventure 按 A 翻頁正常（打字中按 A → 寫完整頁，再按 → 下一頁）；橫向 escape 按住十字鍵 40 幀，游標移動 104 px（前 8 幀每幀 1 px、之後每幀 3 px，符合規格）；直向 typing 按住右 30 幀，游標 g → s（12 / 4 連發，會繞回）；橫向 paint 兩指（按住 A + 十字鍵）可以畫線。觸控區沒有重疊，`test_touch` 995 / 995。
- **cart1~4 迴歸**：maze / pinball / laser / pop / mines / labyrinth / simon / rhythm 都能進出，回選單後 `NES.Touch.ways()` = 8（R8 的 `setWays` 重設正常），沒有頁面錯誤；`test_cart` cart1~5 全過。
- **單檔版**：`build.py --src cart5.html --out <scratchpad>` 產生 1043 KB，選單 6 款都有註冊，6 款機器人各跑 1500 幀，缺字 0、over 0、沒有錯誤。

## 各款簡評
| 款 | 簡評 |
|---|---|
| **選單（cart5）** | 紫色立體 logo、橄欖金邊框，和前四張卡明顯不同。有 3 個圖示沒有對上遊戲畫面（P3-1），下方說明兩行沒對齊（P3-10）。 |
| **CT.Text** | 整個系統做得很扎實：動態上傳有計預算、LRU、自動分頁不截斷，2000 字長文也沒問題。要補的是連續標點 / 破折號的斷行和 `—` 字形（P2-4）。 |
| **adventure** | **這張卡最好的一款**。故事溫柔完整，5 種結局，場景圖漂亮，提示系統不會讓人卡關。要改的是壞結局的回復方式和自動存檔（P3-2），還有開場第 1 頁的斷行（P2-4）。 |
| **escape** | 謎題設計公平、提示漸進、三間難度遞增，機關種類也多。**P1-1 一定要修**（第一室輸入正解時數字會消失）；另外是標題圖的小瑕疵和說明頁太散（P3-5、P3-7）。 |
| **quiz** | 216 題答案全對、分類分級清楚，不能暫停偷想的設計很好。**goal 3000 和對戰電腦的速度都是照機器人訂的**，真人做不到（P2-1、P2-2）。 |
| **words** | 三個模式都完整，STAR PROBE 的回饋方式是自己的，WORD HUNT 手感好。圖示顏色要改（P3-1）。 |
| **typing** | 下一鍵提示讓手把也玩得下去，goal 合理。實體鍵盤對應在回選單時沒有還原（P3-3）；手機只能用十字鍵，比較累（P3-6）。 |
| **paint** | 動態 CHR 和分幀上傳做得很好，著色本線稿可愛。**臨摹評分太寬**，一個方塊就能過關（P2-3）；UI 全是英文（P3-4）。 |
| **cart1~4 迴歸** | 沒有被改壞。 |

## 建議 fix-r9 分卡（依檔案所有權）
| 卡 | 檔案 | 項目 |
|---|---|---|
| fix-r9-escape | `games/cart5/escape/**`、`games/cart5/test_escape.py` | **P1-1** 撥盤畫面字形池（`pool = 256 − used`）+ 測試；P3-4（說明英文、評價大字）；P3-5 星空白點 / 朔叔位置；P3-7 說明頁合併 |
| fix-r9-quiz | `games/cart5/quiz/**`、`games/cart5/test_quiz.py` | **P2-1** GOAL 1200 + 機器人讀題時間；**P2-2** 電腦三級參數；P3-9 三題的誤答選項 |
| fix-r9-paint | `games/cart5/paint/**`、`games/cart5/test_paint.py` | **P2-3** 臨摹評分 64×64 / f1² × col / 門檻 93·85·72·55 + 「外框方塊 < B」的測試（改完要確認機器人 8 張還是 ≥ B）；P3-4 標題 / 說明 / 結算改中文（可選） |
| fix-r9-text | `games/cart5/text.js`、`tools/cjk_glyphs.py`、`games/cart5/glyphs.js`、`games/cart5/test_text.py` | **P2-4** 連續標點避頭、`——` / `……` 不拆、`—` 滿寬字形 + 全字串掃描測試（改完 adventure / escape / quiz 的分頁可能會變，請三款的測試都重跑一次） |
| fix-r9-adventure | `games/cart5/adventure/**`、`games/cart5/test_adventure.py` | P3-2 壞結局 A = 回到選擇（不算密技）+ 換場景自動存檔；P3-4 說明頁中文 |
| fix-r9-type | `games/cart5/{typing,words}/**`、`test_typing.py`、`test_words.py` | P3-3 回選單時立刻還原 `Phys` 對應；P3-6 觸控直接點鍵盤（可選） |
| fix-r9-shell | `games/cart5/cart.js` | P3-1 adventure / escape / words 圖示；P3-10 下方說明對齊 |
| 總控 | `dist/` | P3-8 產生 `dist/星塵文創6合1.html`；fix-r9 全部修完後跑 `run_all` + `playthrough --page cart5.html --all` |

- P1-1、P2-4 修完之後，請 fix 卡用本報告的方法 1（`T.wrap` 全字串掃描）和方法 5（每把撥盤鎖撥 4 個不同的值 + 試錯一次，`overflow == 0`）回測。
- 截圖：`shots/qa-r9/` 共 12 張（01 選單圖示對照、02 撥盤數字消失、03 破折號拆行、04 quiz 標題 GOAL 3000、05 臨摹一個方塊拿 A / B、06 escape 標題 / 故事圖、07 手機直向 adventure、08 手機 typing / paint、09 paint 大填色、10 escape 七種機關、11 adventure 場景、12 typing / words / paint）。
