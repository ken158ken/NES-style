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
| **P2-1** | **HUD 能量表標籤擠成一整串** `SPEEDMISSLDOUBLLASEROPTON  ?`（6 格 × 5 欄 = 30 欄，格與格之間沒有空欄） | `GAME.state().hud` 第 2 行實測：<br>`SPEEDMISSLDOUBLLASEROPTON  ?`<br>第 3 行的格框 `[---][---][---][---]<===>[---]` 反白倒是清楚可辨 | 可見區 32 欄，建議三選一：<br>**(a) 4 欄縮寫 + 空欄**：`SPD MSL DBL LSR OPT  ?` → 6×3 + 5 空 = 23 欄，左右各留 4 欄置中，字與格框完全對齊（**推薦，改動最小**）。<br>(b) 保留 5 字但**只顯示 5 格**，`?` 用單字元格塞在最右：`SPEED MISSL DOUBL LASER OPTON?`（6×5+4 空 = 34 欄 → 超出，需砍一格）。<br>(c) 標籤列改成**只畫目前選中的那一格的全名**（`> OPTION <` 置中），格框列仍畫 6 格 —— 最接近原作 HUD 的資訊密度，也最省磚。 |
| **P2-2** | **魔王曲 `boss` 從未播放**（song.js 有 10.65 s 的 boss 曲、`tools/apu_render.py` 也渲染過它，但 `main.js` 沒有呼叫點） | `grep -n "Audio.*play" games/cruiser/main.js` → 只有 `title` / `stage1` / `gameover` / `clear` | 在 main 的 update 偵測 `CR.stage.bossActive` 由 false→true 時 `CR.Audio.play('boss')`；魔王死亡（`cleared`）再由 `toStageClear()` 切 `clear`。順便把 P1-3 的復活重播寫成「依 `bossActive` 選 `boss` 或 `stage1`」。 |
| **P2-3** | **復活後的「死循環」**：無強化 + 速度 1.0 的復活狀態，在檢查點 1024 / 1536 之後的要塞段幾乎過不去 | 機器人分段驗證（`shots/agent_qa2/segments.py`，各段 1300 幀 = 650 px）：<br>`camX 1024 → 只前進 148 px，死 2 次（都是敵彈）`<br>`camX 1536 → 只前進 107 px，死 3 次（都是敵彈）`<br>**帶滿強化重跑同兩段也一樣卡**（190 px / 107 px）。全關跑測三條命連續死在 **camX 1230 / 1264**（欄 154~158）與 **camX 1644**（欄 205） | ① 復活時保留 1 級 SPEED（或直接給 `speed = 2`），是現代橫捲射擊的標準緩解；<br>② 欄 144~158、欄 194~210 的砲台改成「貼地 / 貼天不要同時」或把該段砲台射擊間隔由 90 幀放寬到 120 幀；<br>③ 這兩段的天花板 / 地板落差（欄 195→200 由 `ceil 4/floor 7` 變 `ceil 7/floor 4`）讓可用高度只剩 15 列，配合瞄準彈容錯極低。 |
| **P2-4** | **敵彈幾乎看不見**：4×4 判定 / 8×8 精靈的深綠色（spr2 `$1A`）小點，在黑底星空與藍色要塞背景上對比都很低 | `shots/agent_qa2/seg/segp_1536.png`（Read 看圖：船鼻子前方 1 px 處那顆綠點就是致命彈）、`ux/T_fortress_in.png` 畫面正中央的綠點 | 敵彈換成**高亮色 + 每 2 幀閃白**（例如用 spr1 的白 / 黃，或把 `$1A` 換成 `$2A`）；或把彈心畫成 2×2 白點 + 綠外框（NES 常見作法，不多花磚）。 |
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
| **P2-1** | **魔王曲 `boss` 從未播放**。song.js 有 17.04 秒的 `boss`（A 小調 16 分下行動機），star-audio 在 PROGRESS 明寫呼叫點「魔王出現 → `ST.Audio.play('boss')`」，但 `main.js` 一個 `boss` 字串都沒有 | `grep -n "audio('play'" games/star/main.js` → 只有 `lv.music` / `title` / `clear` / `death` / `gameover`。實測走到魔王房 `ST.Boss.active === true` 時 `ST.Audio.state().song` 仍是 **`castle`** | `main.js` 的 play 分支裡偵測 `ST.Boss && ST.Boss.active` 由 false→true ⇒ `audio('play','boss')`；魔王死亡 / 離開魔王房 / 檢查點復活時再依 `ST.Boss.active` 決定回 `lv.music` 還是續播 `boss`（`respawn()` 也要一起改，不然死在魔王房復活會變回 castle）。**負責：star-hero** |
| **P2-2** | **標題曲不存在**：`main.js:776` 呼叫 `audio('play','title')`，但 `games/star/song.js:714` 的 `KEYS` 只有 `ground/cave/sky/castle/boss/invincible/clear/death/gameover` —— **沒有 `title`**。`play()` 吞例外回 `false`，所以標題畫面**照常播著 1-1 的 `ground`**，而且完全不會報錯 | `star.html?debug=1&scale=1&mute=1`（不帶 level）→ `ST.Audio.state().song` = **`ground`**（期望 `title`） | 二選一：**(a)** star-audio 在 `song.js` 補一首短的 `title`（8~16 小節、可重用 ground 的動機），`KEYS` 加 `'title'`；**(b)** star-hero 把 `audio('play','title')` 改成一個明確存在的 key。**推薦 (a)**，因為標題畫面沿用關卡曲會讓進關時「音樂沒有變化」，少了一個很關鍵的節奏斷點。順帶建議 `ST.Audio.play()` 遇到不存在的 key 時 `console.warn` 一行，這種靜默失敗很難抓。**負責：star-audio（主）+ star-hero（確認）** |
| **P2-3** | **1-1 / 1-3 背景過於空曠**（總控已點名，這裡給實測密度）。逐磚統計四關的裝飾磚： | 1-1：384 欄 = **12 畫面**，裝飾磚 66 ⇒ **5.5 磚 / 畫面**（雲 12 磚 = 6 朵、山 18 磚 = 6 座、灌木 12、樹 12 磚 = 6 棵）＝ 平均**一個畫面只有 0.5 朵雲 + 0.5 座山 + 1 叢灌木 + 0.5 棵樹**。<br>1-2：320 欄 = 10 畫面，20 磚（全是鐘乳石）⇒ **2.0 / 畫面**。<br>**1-3：384 欄 = 12 畫面，42 磚（星星 34、雲只有 4 磚 = 2 朵）⇒ 3.5 / 畫面，而且天空 14 列裡只有零星小星點**。<br>1-4：256 欄 = 8 畫面，10 磚（窗）⇒ **1.2 / 畫面**。<br>證據：`shots/agent_qa2s/b_11.png`（畫面上 2/3 是純藍）、`b_13.png`（天空幾乎全空）、`d_hurt.png`、`g_gameover.png` | 具體數字建議（都在 bg1..3 現有調色盤內，不需要新色）：<br>**1-1**：雲 6→**16 朵**（分成「高雲列 6 / 中雲列 9」兩條高度帶，別全擠同一列 —— 目前雲全在同一 row，所以上半屏完全空白）、山 6→**10 座**（山用 bg3、可交錯大小兩種）、灌木 6→**12**、樹 6→**10**。目標 **12~14 磚 / 畫面**，約等於原作草原關的密度。<br>**1-3**：雲 2→**12 朵**（天空關的雲要當「假地板」的視覺暗示，順便讓玩家看得出速度）、星點 34→**50** 並分 3 種大小、再加一條「遠山 / 雲海」剪影帶在 row 20~21（浮台下方），讓畫面有地平線。<br>**1-4**：窗 10→**16**，另加「火把」（2 磚、可用 anim 兩幀）每 2 畫面一支 —— 城堡黑底是對的，但需要幾個亮點當節奏標記。<br>**1-2** 可維持（洞窟黑底是還原的一部分），但建議在頂板下加一排「岩層紋」磚讓天花板不要是純色塊。<br>**負責：star-world** |
| **P2-4** | **主角造型辨識度不足**（總控已點名）。放大看過 `shots/agent_qa2s/z_hero_zoom.png`：**黑色描邊是有的**（這點總控的描述可以修正），問題在**剪影沒有特徵**——頭是一個圓角矩形兜帽、臉是一塊平坦的膚色方塊 + 兩條眼線 + 一條嘴，身體是一塊藍色橢圓 + 一條橫向膚色帶（本意是手臂，看起來像腰帶）。縮到實際大小（`b_11.png`）就變成「一個藍色小人」，跟敵人以外的東西沒有記憶點 | `z_hero_zoom.png`（6 倍放大）、`h_hud.png`（4 倍）、`b_11.png`（3 倍實際遊玩大小） | 用**剪影**解決，不加色數（精靈調色盤 0 仍是 3 色 + 透明）：<br>① **頭上加不對稱特徵**：兜帽右後方拉出一條 4~6 px 的**尖角 / 帽尾**（靜止時垂下、跑步時後飄 1 px），這一筆就能讓剪影在 16 px 寬裡立刻可辨。<br>② **加圍巾**：脖子位置往後拉 6~8 px 的飄帶（用第 3 色，跑步 / 跳躍時改用另一組磚讓它上揚）——比帽子更能傳達「速度」。<br>③ **臉別佔滿頭**：目前膚色塊 10×6 太大，縮成 6×4 並把兜帽開口收窄，頭就不會看起來像「戴頭套的大臉」。<br>④ **手臂與軀幹分離**：現在的橫向膚色帶請改成「軀幹兩側各一段 2×4 的手臂」，走路 3 幀讓手臂前後擺動 1 px —— 動起來的辨識度比靜態造型更重要。<br>⑤ 胸口加一個 2×2 的**星形徽記**（呼應「星塵」），第 3 色即可。<br>**負責：star-hero（`chr_hero.js`）** |
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
