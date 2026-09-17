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
