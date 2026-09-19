# NES 核心引擎 API（R1）

> 本檔是 `docs/TASKS.md`「API 契約」的正式版：每個模組一節，列出函式、參數、回傳、範例與規格來源章節。
> 契約以本檔與 TASKS.md 為準；實作與契約的落差記在最後一節「實作差異」。
> 版本：`NES.VERSION`（engine/nes.js）。

## 目錄
1. [通則（命名空間、載入順序、測試規則）](#1-通則)
2. [NES.PALETTE — engine/palette.js](#2-nespalette-enginepalettejs)
3. [NES.FX — engine/fixed.js](#3-nesfx-enginefixedjs)
4. [NES.Input — engine/input.js](#4-nesinput-engineinputjs)
5. [NES.Timing — engine/cpu_timing.js](#5-nestiming-enginecpu_timingjs)
6. [NES.CHR — engine/chr.js](#6-neschr-enginechrjs)
7. [NES.PPU — engine/ppu.js](#7-nesppu-engineppujs)
8. [NES.Lint — engine/nes_lint.js](#8-neslint-enginenes_lintjs)
9. [NES.APU — engine/apu.js](#9-nesapu-engineapujs)
10. [NES.Music — engine/music.js](#10-nesmusic-enginemusicjs)
11. [NES.boot / 除錯 API — engine/nes.js](#11-nesboot--除錯-api-enginenesjs)
12. [game 物件介面（games/*）](#12-game-物件介面)
13. [工具：shot.py / build.py / run_all.sh](#13-工具)
14. [實作差異（實測核對）](#14-實作差異實測核對)
15. [NES.SH — engine/shmup.js（R2 射擊共用工具）](#15-nessh-engineshmupjs)
16. [NES.Touch — engine/touch.js（R2 手機觸控虛擬手把）](#16-nestouch-enginetouchjs)

---

## 1. 通則

| 項目 | 規則 |
|---|---|
| 檔案型態 | 每個 `engine/*.js` 都是 classic script + IIFE、**零相依**；開頭 `window.NES = window.NES \|\| {};` 再掛自己的模組 |
| 載入順序 | `palette → fixed → input → cpu_timing → chr → ppu → nes_lint → apu → music → shmup → touch → nes.js → games/*`（三個入口頁與 `tools/build.py` 都以此為準，build.py `--check` 會驗證） |
| 解析度 | PPU 內部 256×240，顯示裁上下各 8 列 → **256×224**；桌機整數倍放大、無平滑。手機（觸控裝置或短邊 < 600）允許 **CSS 小數倍**：backing store 仍是整數倍（`nes.setScale` 只收整數），CSS 縮到目標尺寸 + `image-rendering: pixelated`（§16） |
| 幀率 | NTSC `60.0988` Hz 固定步；無 delta-time 補間；每幀一次輸入取樣 |
| 單位 | 位置 1/16 px、速度 8.8（1/256 px/幀）；全部整數運算 |
| 色彩 | 只能用 64 色 NES 調色盤（`$0D` 禁用）；同屏 ≤ 25 色 |
| 測試 | 各模組的 `tools/test_*.py` **不得依賴別人的檔案**：playwright 開 `about:blank` 後 `page.add_script_tag(path=...)` 只載入自己（與 palette.js / fixed.js 這類葉節點） |
| 截圖 | `tools/shot.py`，存 `shots/agent_<名>/`（`shots/` 已 gitignore）；截完必須用 Read 看圖 |
| 常數 | `NES.W = 256`、`NES.H = 240`、`NES.VISIBLE_H = 224`、`NES.HZ = 60.0988`、`NES.VERSION`、`NES.TITLE`（皆由 nes.js 定義） |

規格來源：`docs/PLAN.md` §1~§2、`docs/research/01_硬體規格與限制.md`。

---

## 2. NES.PALETTE（engine/palette.js）

擁有者：ppu agent ｜ 來源：研究 01 §3.4（NES 系統調色盤）、05 §1（色彩系統實務）

| 成員 | 型別 | 說明 |
|---|---|---|
| `NES.PALETTE` | `Array<[r,g,b]>` 長度 64 | 索引 `$00`~`$3F` 的 NTSC RGB 近似值；來源寫在檔頭 |
| `NES.PALETTE.FORBIDDEN` | `number[]` | `[0x0D]`（blacker-than-black，禁止使用） |
| `NES.PALETTE.rgb(i)` | `(i:number) → [r,g,b]` | 取色；`i` 超出 0..63 應 throw |
| `NES.PALETTE.nearest(r,g,b)` | `(r,g,b) → number` | 最接近的調色盤索引（跳過 FORBIDDEN） |

```js
NES.PALETTE.rgb(0x21);            // 天空藍 [r,g,b]
NES.PALETTE.nearest(255, 0, 0);   // → 最接近的紅色索引
NES.PALETTE.FORBIDDEN.includes(0x0D);  // true
```

---

## 3. NES.FX（engine/fixed.js）

擁有者：core agent ｜ 來源：研究 03 各篇（SMB 反組譯常數）、04 §6（手感 / 子像素）

| 成員 | 簽章 | 說明 |
|---|---|---|
| `NES.FX.SUB` | `16` | 位置單位：1 px = 16 sub |
| `toSub(px)` | `(px:number) → int` | px → 位置單位 |
| `toPx(sub)` | `(sub:int) → number` | 位置單位 → px |
| `floorPx(sub)` | `(sub:int) → int` | 取整數像素（繪製用，必須 floor 而非 round） |
| `v88(hi, lo)` | `(hi:int, lo:int) → int` | 8.8 速度：整數部 `hi`、小數部 `lo`（1/256 px/幀） |
| `Vec(px, frac)` / `vecSub(sub, frac)` | `→ {sub, frac}` | **位置的正式寫法**：餘數放在物件裡，每幀零配置、多實體不互相污染 |
| `vadd(vec, v)` | `(vec, v:int) → int` | 位置前進一幀（vel 累加到 sub），回傳新的 `vec.sub` |
| `vpx(vec)` / `vpxf(vec)` / `vsetPx` / `vsetSub` | | 取整數 px / 浮點 px / 設定 |
| `Acc(v)` / `aadd(av, a)` / `aset` / `aapproach(av, target, a)` | | **速度的正式寫法** `{v, frac}`；`aapproach` 朝目標逼近且不過衝（加速 / 摩擦 / 煞車共用） |
| `addVel(vec, v)` / `addAcc(av, a)` | | **相容別名**（= `vadd` / `aadd`）。舊的 `addVel(posSub, v, frac) → int` 與全域 `NES.FX.frac` 已於 R1 fix1 **移除**（多實體共用會互相污染）；傳舊參數會 throw 明確訊息 |
| `clamp / sign / abs / absMax / mulShr`、`NES.FX.SMB` | | 整數數學、SMB 反組譯常數表 + 跳躍規則（見下） |

> **`docs/TASKS.md` §API 契約寫的 `addVel(posSub, v88) → {pos, frac}` 已作廢，一律以本檔為準。**

### `NES.FX.SMB` — SMB1 常數表 + 唯一一套跳躍規則

`maxRun/maxWalk/maxWater/maxCutscene`、`accRun/accWalk/friction/turnShift`、`airRunSpeed`、
5 段 `jump[]`（`vy0/gHold/gFall/belowSpeed/h`）與 `jumpFor(absVel)`、`swim/whirlpool`、
`diffToHaltJump`、`enemySlow/enemyFast`、`intervalTimer/injuryFrames/starFrames`。
**每個原始位元組都標在 `engine/fixed.js` 註解裡**（來源：研究 03/01 ②、SMBDIS.ASM）。

| 函式 | 說明 |
|---|---|
| `SMB.jumpState(vyAcc?)` | 跳躍狀態 `{seg, vy, fastFall, startSub, first, skipFirst}`；傳入自己的 `Acc` 就共用同一個速度物件 |
| `SMB.jumpStart(js, absVxVel, pySub)` | 起跳：依 \|vx\| 選 5 段之一、設初速、記起跳高度 |
| `SMB.jumpGravity(js, aHeld, pySub, maxFall)` | 每個滯空幀呼叫一次：按住 A = `gHold`，放開**且已離地 ≥ 1 px**（`diffToHaltJump`）= `gFall`；起跳首幀套半格重力 |
| `SMB.jumpBounce(js, vel, pySub)` | 重設垂直速度但不算新的一次跳躍（踩敵回彈用） |
| `SMB.jumpSim({hold, vx, skipFirst})` | 純模擬，回傳 `{apexPx, apexSub, airFrames}`；測試對照用 |
| `SMB.skipGravityFirstFrame` | `true`（預設、半格）/ `'full'` / `false`，見下表 |

**起跳首幀的重力（R1 fix1 總控裁定，QA P1-4 / P1-5）**：半隱式 Euler（先加重力再位移）
會系統性低估半個重力步，所以「剛好 4 格牆 / 5 格牆」跳不過去。修正是**起跳後第 1 幀只套半格重力**
（leapfrog / 中點積分），離散和 = `v0²/2g` = 連續解：

| `skipGravityFirstFrame` | 長按靜止跳 | 長按全速跳 | 點按 1 幀 | 對照研究 03/01 |
|---|---:|---:|---:|---|
| `true` / `'half'`（預設） | **64.00 px（4 格）** | **80.00 px（5 格）** | 19.6875 px | 64 / 80 ±0 |
| `'full'`（整幀不加重力） | 66.00 px | 82.50 px | 20.3125 px | +2 / +2.5 |
| `false`（舊行為） | 62.00 px | 77.50 px | 19.1250 px | −2 / −2.5 |

`tools/test_core.py`（`jumpSim`）與 `games/demo/test_demo.py`（真的跑一次 demo）量到的是**同一組數字**。

```js
// 位置 / 速度（正式寫法，每幀零配置）
const px = NES.FX.Vec(32);               // x = 32 px
const vx = NES.FX.Acc(0);
NES.FX.aapproach(vx, NES.FX.SMB.maxWalk, NES.FX.SMB.accWalk);   // 加速到走路上限
NES.FX.vadd(px, vx.v);                   // px.sub / px.frac 一起更新
NES.FX.vpx(px);                          // 畫面上的整數 x

// 跳躍（core 與遊戲共用同一套規則）
const js = NES.FX.SMB.jumpState(vy);     // vy = NES.FX.Acc(0)
if (onGround && NES.Input.pressed(NES.Input.BTN.A)) {
  NES.FX.SMB.jumpStart(js, NES.FX.abs(vx.v), py.sub);
  onGround = false;
}
if (!onGround) NES.FX.SMB.jumpGravity(js, NES.Input.held(NES.Input.BTN.A), py.sub, NES.FX.v88(4, 0));
NES.FX.vadd(py, vy.v);                   // 順序固定：先重力、再位移
```

> 全部整數運算：不得出現浮點累加，否則手感測試（±1 幀）會失準。

---

## 4. NES.Input（engine/input.js）

擁有者：core agent ｜ 來源：研究 01 §2（手把）、04 §6（輸入延遲 / DAS）

| 成員 | 簽章 | 說明 |
|---|---|---|
| `NES.Input.BTN` | `{A:1, B:2, SELECT:4, START:8, UP:16, DOWN:32, LEFT:64, RIGHT:128}` | NES 硬體順序的位元遮罩 |
| `poll()` | `() → void` | **每幀一次**，由 `NES.Timing` 在 update 之前呼叫；遊戲不要自己呼叫 |
| `held(b)` / `pressed(b)` / `released(b)` | `(b:int) → boolean` | 按住 / 本幀按下 / 本幀放開 |
| `mask()` | `() → int` | 本幀的八鍵遮罩 |
| `inject(mask, frames)` | `(mask:int, frames:int) → void` | 腳本注入，**優先於鍵盤**；`frames` 幀後自動失效；`inject(0,0)` = 立即放開 |
| `record()` / `stopRecord()` / `replay(arr)` | | 錄製 / 停止（回傳每幀 mask 陣列）/ 重播 |

預設鍵盤：方向鍵或 WASD、`Z`=A、`X`=B、`Enter`=START、`Shift`=SELECT。

```js
if (NES.Input.pressed(NES.Input.BTN.A)) jump();
if (NES.Input.held(NES.Input.BTN.RIGHT)) walk(1);
NES.Input.inject(NES.Input.BTN.RIGHT | NES.Input.BTN.A, 30);   // 腳本：右+A 按 30 幀
```

---

## 5. NES.Timing（engine/cpu_timing.js）

擁有者：core agent ｜ 來源：研究 01 §2（CPU / 幀率）、PLAN §1「節奏」

`NES.Timing.create({update, draw, hz})` → `timing`

| 成員 | 簽章 | 說明 |
|---|---|---|
| `start()` / `stop()` | | rAF 主迴圈開關 |
| `step(n)` | `(n:int) → int` | **同步**跑 n 幀（不走 rAF），回傳目前 frame；測試 / 截圖用 |
| `frame` | `int` | 已跑幀數 |
| `hz` | `number` | 目前幀率（NTSC 60.0988 / PAL 50.0070） |
| `setMode(m)` | `'ntsc' \| 'pal'` | 切換幀率 |
| `budget` | 見下 | VBlank 寫入預算（模擬「只能改 ~160 bytes」），超過 `over = true` |

每幀順序固定：**`Input.poll()` → `update()` → `draw()`**（`draw` 由 `NES.boot` 接成
`game.draw() → ppu.render() → ppu.endFrame()`）。

#### `timing.budget`（VBlank 寫入預算 — R1 fix1 起真的生效）

`NES.boot` 會把它綁到 `ppu.budget`，之後 **PPU 的每個寫入函式都自動計帳**（見 §7），
遊戲不必自己呼叫 `use()`。每幀開頭 `reset()`。

| 成員 | 說明 |
|---|---|
| `limit` / `set(bytes)` | 'ppu' 通道上限，NTSC 預設 **160 byte/幀**（PAL 500）；`set()` 之後 `setMode` 不再覆蓋 |
| `oamLimit` / `setOam(bytes)` | 'oam' 通道上限，預設 **256 byte**（$4014 DMA 一整頁影子 OAM） |
| `use(n, kind)` | `kind` 省略 = `'ppu'`（名稱表 / 屬性表 / 調色盤），`'oam'` = 精靈；回傳「是否仍在預算內」 |
| `used` / `oamUsed` / `left()` / `oamLeft()` / `peak` / `oamPeak` | 本幀用量與歷史尖峰 |
| `over` / `overFrames` / `overBy` / `overKind` | 本幀是否超支 / 累計超支幀數 / 超出量 / 哪條通道 |
| `strict` | `true` = 超支直接 throw（`NES.boot({strictBudget:true})` 或 `?debug=1` 手動開） |
| `mute` | `true` = 暫停計帳（`__nes.render()` 重畫時自動開關，避免同一幀算兩次） |
| `reset()` / `clear()` / `report()` | 每幀清空（並推進 `serial`）/ 連統計一起清 / 取明細（`__nes.stats().budget`） |

> **為什麼 OAM 是獨立通道**：真機的 OAM 走 `$4014` DMA（513 cycle 一次搬 256 byte），
> 與「VBlank 期間能對 `$2007` 寫幾個 byte」是兩段不同的頻寬。所以一幀寫滿 64 個精靈
> （256 byte）**不算**超支，同一槽重複寫也只算一次（一幀只有一次 DMA）。
> 真正會超支的是 `setTile / fillTiles` ——一幀最多 160 byte ≈ **一欄名稱表（26）+ 屬性（13）+ 狀態列**。
> `game.init()` 期間的寫入等同「rendering 關閉時的初始化」，`NES.boot` 會在 init 後 `clear()`。

```js
const t = NES.Timing.create({ update: tick, draw: render, hz: 60.0988 });
t.start();        // 正式遊玩
t.step(60);       // 測試：同步跑 60 幀
```

---

## 6. NES.CHR（engine/chr.js）

擁有者：chr-lint agent ｜ 來源：研究 05 §2（磁磚經濟）、01 §3.2（圖樣表）

| 成員 | 簽章 | 說明 |
|---|---|---|
| `tile(rows)` | `(rows: string[8]) → Uint8Array(64)` | 8 個字串各 8 字元，字元 `.123` 對應調色盤索引 0~3；字元非法 → throw |
| `bank(name, obj)` | `(name, {tileName: rows}) → {name, tiles, index(name)}` | 建 bank；> 256 tile → throw |
| `setPattern(table, bankName)` | `(0\|1, string) → void` | 把 bank 綁到圖樣表 0（通常背景）或 1（通常精靈） |
| `get(table, idx)` | `(0\|1, int) → Uint8Array(64)` | 取磁磚像素 |
| `tile16(top, bottom)` | `→ {tall:true, top, bottom}` | 8×16 精靈的上下兩塊（bank 會自動對齊到偶數索引） |
| `slice(rows)` / `sliceNamed(rows, prefix)` / `fromString(s)` | | 把任意 W×H（8 的倍數）文字圖切成 8×8 磁磚 |
| `getBank(name)` / `banks()` / `pattern(t)` / `reset()` | | bank 查詢與重置 |
| `NES.CHR.DEMO` | | 原創美術：`bg`（字型 + 地形）、`spr`（8×8 切片）、**`spr16`（8×16 配對版）**、`oam16(name)`、`text(str)`、`hero/enemy` |

> **8×16 精靈要用 `DEMO.spr16`**（R1 fix1 補上，QA P2-4 / X12）：8×16 模式下 PPU 會把
> 「偶數索引 + 下一格」當成上下半塊（`tile & 0xFE`），所以 8×8 切片不能直接用。
> `DEMO.oam16(name)` 回傳的值已經把「圖樣表 1」的 bit0 加好（= `index | 1`），直接填進 OAM 的 tile 欄。
> ```js
> NES.CHR.setPattern(1, 'demo_spr16');   ppu.setPatternTables(0, 1);   ppu.spriteMode(16);
> ppu.sprite(0, { x: 64, y: 96, tile: NES.CHR.DEMO.oam16('HERO_TOP_L'), pal: 0 });
> ```

```js
NES.CHR.bank('hero', {
  head: ['..111...', '.11211..', '11221 1.', /* … 共 8 行 */]
});
NES.CHR.setPattern(1, 'hero');
const t = NES.CHR.get(1, NES.CHR.bank('hero').index('head'));
```

> 2bpp：每像素只有 0~3；0 在精靈是透明、在背景是該屬性組的底色。

---

## 7. NES.PPU（engine/ppu.js）

擁有者：ppu agent ｜ 來源：研究 01 §3（PPU）、05 §1 / §3 / §5

`NES.PPU.create(canvas, {scale})` → `ppu`

### 調色盤
| 函式 | 說明 |
|---|---|
| `setBackdrop(c)` | 底色（0..63；`$0D` → throw） |
| `setBgPalette(i, [c1,c2,c3])` | 背景第 i 組（0~3）的 3 色；色 0 = 底色 |
| `setSprPalette(i, [c1,c2,c3])` | 精靈第 i 組（0~3）；色 0 = 透明 |

同屏上限：1 底色 + 4×3 + 4×3 = **25 色**。

### 名稱表 / 屬性表 / 捲動
| 函式 | 說明 |
|---|---|
| `setTile(nt, col, row, tile)` | 名稱表 nt（0/1）第 (col,row) 格（32×30）放磁磚編號（預算 1 byte） |
| `setAttr(nt, col16, row16, pal)` | 16×16 屬性區塊指定調色盤組 0~3（預算 1 byte） |
| `fillTiles(nt, col, row, w, h, tile)` | 矩形填磁磚（預算 = 實際寫入格數） |
| `fillAttr(nt, col16, row16, w, h, pal)` | 矩形填屬性（預算 = 區塊數） |
| `mirroring('h'\|'v')` | 名稱表鏡像 |
| `scroll(x, y)` | 捲動 |
| `split(scanline, {x, y, nt})` | 掃描線分割（狀態列 / 假視差）；`split(null)` 取消 |

### 精靈（OAM）
| 函式 | 說明 |
|---|---|
| `sprite(i, {x, y, tile, pal, flipH, flipV, behind})` | 第 i 個（0~63）OAM；`behind` = 背景優先權（OAM 預算 4 byte / 槽 / 幀） |
| `getSprite(i)` / `ppu.oam` | 讀回單一精靈 / 全部 64 個的唯讀檢視（`NES.Lint.oam()` 用） |
| `oamBytes()` | 256 byte 的硬體 OAM 鏡像（Y / tile / 屬性 / X） |
| `clearSprites()` | 清空 OAM（= 整頁 256 byte） |
| `spriteMode(8\|16)` | 8×8 / 8×16 |
| `ppu.flicker` / `ppu.flickerStep` | `'rotate'`（每線超過 8 個時輪替 → 閃爍）或 `'none'`；每幀前進幾個 OAM 索引（預設 8；設 0 = 遊戲自己做 sprite cycling） |
| `oamStart()` | 目前的輪替起點（除錯用） |

### 輸出
| 成員 | 說明 |
|---|---|
| `render()` | 畫一幀：先寫 `ppu.frame`，再整數放大到 canvas 並裁上下各 8 列。**純函式**：同一份狀態重畫幾次都得到同一張圖（R1 fix1 / QA P1-2） |
| `endFrame()`（別名 `advanceFlicker()`） | 一幀結束：推進 OAM 閃爍輪替指標。順序固定 `render() → endFrame()`，`NES.boot` 的 Timing draw 階段已接好；`__nes.render()` **只呼叫 render** ⇒ 截圖可重現 |
| `ppu.budget` | `timing.budget`（`NES.boot` 綁定）或 `null`；`null` 時所有計帳都是 no-op |
| `ppu.frame` | `Uint8ClampedArray` 256×240×4（RGBA），lint 逐像素掃描的對象 |
| `ppu.indexFrame` | `Uint8Array` 256×240，每像素最終的 NES 調色盤索引（測試最好用這個） |
| `ppu.stats` | `{colors, maxSpritesLine, flickered}` |

> **預設 `flicker='rotate'` + `flickerStep=8`**：同一條掃描線上連號的 16 個精靈，
> 兩幀的聯集剛好畫齊（第 1 幀 OAM 0..7、第 2 幀 8..15）。遊戲若要自己控制輪替順序，
> 設 `ppu.flickerStep = 0` 再自行改寫 OAM 配置（`games/demo` 就是這樣做的）。

> **前置條件**：`chr.js` 在場時，`render()` 需要先 `NES.CHR.setPattern(0/1, bank)`，否則丟
> 「pattern table 0 尚未 setPattern」。`NES.boot` 會在 `game.init()` 之前塞一個全空白 bank
> `__nes_blank` 當保底（遊戲自己 setPattern 會覆蓋掉），所以沒有 demo 時也能開出黑畫面。

> `ppu.stats` 實際還多了 `{dropped, overLines[], sprites, ms, frames}`（契約的超集；
> 注意欄位名是 **`overLines`**，見 §14 差異 D2）。

```js
const ppu = NES.PPU.create(document.getElementById('nes'), { scale: 3 });
ppu.setBackdrop(0x0F);
ppu.setBgPalette(0, [0x21, 0x11, 0x01]);
ppu.fillTiles(0, 0, 26, 32, 4, 0x10);        // 地面
ppu.scroll(cameraX & 0xFF, 0);
ppu.split(32, { x: 0, y: 0 });               // 上方 32 線固定 = 狀態列
ppu.sprite(0, { x: 40, y: 100, tile: 1, pal: 0, flipH: false });
ppu.render();
```

---

## 8. NES.Lint（engine/nes_lint.js）

擁有者：chr-lint agent ｜ 來源：PLAN §1 驗收、研究 05 §1 / §3

| 成員 | 簽章 | 說明 |
|---|---|---|
| `frame(ppu)` | `(ppu) → {ok, colors, badPixels, overLine[]}` | 掃 `ppu.frame`：同屏色數、非 64 色像素、每線超過 8 精靈的掃描線清單 |
| `oam(ppu)` | `(ppu) → 物件` | OAM 檢查（越界 / 調色盤組錯誤等） |
| `NES.Lint.strict` | `boolean` | `false` 只回報、`true` 違規即 throw |
| `NES.Lint.magenta` | `boolean` | 把違規像素改畫洋紅 |

```js
NES.Lint.strict = true;            // 開發時讓違規立刻爆
const r = NES.Lint.frame(ppu);     // {ok:false, colors:27, badPixels:12, overLine:[96,97]}
```

執行期以外還有 `tools/nes_lint.py`（掃 PNG 截圖逐像素驗 64 色 / ≤25 色，容許整數放大），由 `tools/run_all.sh` 抽查。

---

## 9. NES.APU（engine/apu.js）

擁有者：apu agent ｜ 來源：研究 06 §1（2A03 五聲道）、§2（技法）、§6（Web Audio 復刻）

`NES.APU.create({sampleRate})` → `apu`

| 函式 | 說明 |
|---|---|
| `write(addr, val)` | `$4000`~`$4017` 暫存器語意（方波 ×2 占空比 / 掃頻 / 包絡、三角波、雜訊 LFSR、DPCM、frame counter） |
| `tick()` | 每幀呼叫一次（內含 240 Hz frame counter 走 4 次）。**由 `NES.boot` 自動呼叫**（game.update 之後） |
| `render(nSamples)` | `→ Float32Array`，離線渲染（`tools/apu_render.py` 產 wav 驗頻譜） |

> `tools/apu_render.py` 遊戲曲目模式（R2）：`$PY tools/apu_render.py --game cruiser [--song stage1] --seconds 10` → `shots/agent_audio/*.wav` + 五聲道成分四段檢查（暫存器稽核 / 逐聲道單獨渲染 / 頻譜覆蓋 / 無 NaN 不削波）。
| `connect(audioContext)` | 即時播放（AudioWorklet，退 ScriptProcessor）。**由 `nes.connectAudio()` 在使用者第一次按鍵 / 點擊時呼叫** |
| `mix()` | 非線性混音公式（研究 06 §1） |

```js
apu.write(0x4000, 0x9F);   // 方波 1：占空比 50%、固定音量
apu.write(0x4002, 0xFD); apu.write(0x4003, 0x08);
const pcm = apu.render(44100);  // 離線 1 秒
```

---

## 10. NES.Music（engine/music.js）

擁有者：apu agent ｜ 來源：研究 06 §2（作曲技法）、§4（音效設計）

song 格式定義寫在 `engine/music.js` 檔頭（pattern 陣列；每列 = 1 幀或 speed 幀；指令 `note / inst / vol / arp / vib / duty / cut / detune / slide / stop`）。

**入口**：`NES.Music.attach(apu)` 先把 APU 綁給預設 driver，之後 `NES.Music.play/stop/sfx/tick/define`
才能用（否則 throw「請先呼叫 NES.Music.attach(apu)」）。**`NES.boot` 已經幫你 attach**，
遊戲直接呼叫 `NES.Music.*` 或 `nes.music.*` 即可（兩者是同一個 driver）。
另有 `NES.Music.create(apu)` 工廠可開獨立 driver、`NES.Music.DEMO` 示範曲、`state()` / `stopSfx()` / `record()`。

| 函式 | 說明 |
|---|---|
| `play(song, {loop})` | 播放樂曲 |
| `stop()` | 停止 |
| `sfx(name, {priority, channels})` | 音效搶聲道：優先權高者佔用，結束後音樂復原 |
| `define(name, sfxData)` | 註冊音效 |
| `tick()` | 每幀呼叫一次，**由遊戲的 `update()` 呼叫**（不是 nes.js） |
| `state()` | channel 快照，R2 起新增 `detune / slide / slideAcc` 三欄 |

### 效果欄（R2 audio agent 新增；格式向下相容，demo 曲零改動）
| 欄 | 說明 |
|---|---|
| `detune: n` | 固定週期偏移（+ = 音變低），持續到下次改寫，**換音不歸零**（回音軌用） |
| `slide: n` | 每幀週期 ±n（累積） |
| `slide: {rate, to: 'C-5'}` | portamento：滑到目標音停 |
| `slide: {rate, limit: m}` | 夾在 ±m |
最終週期 = 基礎音高（note + arp + vib + 樂器 pitch）+ detune + slide 累積量；觸發新音 → slideAcc 歸零、detune 保留。雜訊 / DMC 軌不受影響；音效的幀也吃數字型 `detune` / `slide`。

```js
NES.Music.define('jump', { ch: 'pulse1', priority: 2, rows: [/* … */] });
NES.Music.play(SONGS.overworld, { loop: true });
NES.Music.sfx('jump', { priority: 2, channels: ['pulse1'] });
// 遊戲 update 內：
update(nes) { nes.music && nes.music.tick(); }
```

---

## 11. NES.boot / 除錯 API（engine/nes.js）

擁有者：tools agent

### 常數
`NES.VERSION`、`NES.TITLE`、`NES.W = 256`、`NES.H = 240`、`NES.VISIBLE_H = 224`、`NES.HZ = 60.0988`
工具函式 `NES.toMask(spec)`：`129 | 'a' | 'a,right' | ['a','right']` → 按鍵遮罩。

### `NES.boot(opt) → nes`

| 參數 | 預設 | 說明 |
|---|---|---|
| `canvas` | 自動建立並 append | `HTMLCanvasElement` 或 CSS 選擇器 |
| `game` | 空遊戲（黑畫面） | `{init, update, draw, state}` 物件，或 `function(nes)` 工廠 |
| `scale` | `?scale=` 或 1 | 整數放大倍率 |
| `debug` | `?debug=1` | debug 時 **Timing 不自動 start**，畫面只由 `__nes.step()` 推進 |
| `mute` | `?mute=1` | **只代表不接喇叭**：APU 照樣建立與 `tick()`，音樂邏輯 / 離線渲染在測試中才與正式一致 |
| `hz` | `NES.HZ` | 傳給 `NES.Timing.create` |

回傳的 `nes`：`{canvas, ctx, ppu, apu, music, input, timing, game, scale, debug, missing[], start(), stop(), step(n), render(), setScale(s), connectAudio()}`。

啟動流程：
1. 取得 / 建立 canvas；
2. `NES.PPU.create(canvas, {scale})`（缺 ppu.js → 黑畫面 stub）；
3. 取 `NES.Input`、建立 `NES.APU.create({sampleRate:44100})`、`NES.Music.attach(apu)`（單例優先；沒有 `attach` 才退 `create(apu)`）；
   `chr.js` 在場但沒有 pattern table 時塞空白 bank `__nes_blank` 保底；
4. `NES.Timing.create({update, draw, hz})`
   - `update` = `game.update(nes)` → `apu.tick()`
   - `draw` = `game.draw(nes)` → `ppu.render()`
5. `game.init(nes)`；
6. **debug**：只畫一幀、不 start；**非 debug**：`timing.start()`，並在使用者第一次 `keydown` / `pointerdown` 時建立 `AudioContext` 並 `apu.connect(ctx)`（瀏覽器自動播放政策）。

> **容錯**：任一 engine 模組缺席都不會讓 boot 失敗（PPU / Input / Timing 有 stub，APU / Music / Lint 則略過），缺席清單在 `nes.missing` 與 `__nes.stats().missing`。R1 平行開發期間 `game.html` 因此隨時可開。

### `window.__nes`（只有 `?debug=1` 才存在）

| 函式 | 說明 |
|---|---|
| `step(n)` | 同步推進 n 幀，回傳 frame |
| `press(spec, n)` | 按住 `spec`（mask / `'a'` / `['a','right']`）n 幀並推進 n 幀 |
| `tap(spec, n)` | 按 n 幀（預設 1）後放開 |
| `release()` | 立刻放開所有注入按鍵 |
| `render()` | 重畫一幀但**不推進**任何邏輯（截圖前用）。R1 fix1 起是真的純重畫：PPU 的 OAM 閃爍輪替指標不動、VBlank 預算也不重複計帳 ⇒ **連續呼叫幾次都得到同一張圖**（QA P1-2） |
| `state()` | `game.state?.()` 併上 `{frame, hz, stats}` |
| `frame()` / `snapshot()` | canvas 的 base64 PNG（data URL）；取不到時回 `ppu.frame` 摘要 `{w,h,nonBlack,avg}`。⚠️ `frame()` 與 `state().frame` / `stats().frame`（**幀號**）同名不同義，所以另給別名 `snapshot()`（QA P2-2） |
| `lint()` | `NES.Lint.frame(ppu)`；另補上 `maxSpritesLine`、`ppuOverLines`（PPU 自己統計的超線）與 `oamError`；未載入 → `{ok:true, skipped:true}` |
| `stats()` | `{frame, hz, colors, maxSpritesLine, flickered, budgetOver, budget, scale, missing, stub}`；`budget` 是 `timing.budget.report()`（`{limit, used, peak, left, oamLimit, oamUsed, oamPeak, over, overFrames, overBy, overKind, strict}`） |
| `missing()` / `setScale(s)` / `nes()` / `version` | 便利函式 |

```js
__nes.press(['right'], 40);      // 右走 40 幀
__nes.tap('a', 1);               // 跳
__nes.step(30);
__nes.lint();                    // {ok:true, colors:19, badPixels:0, overLine:[]}
__nes.stats().budget;            // {limit:160, used:39, ..., oamUsed:256, over:false}
__nes.nes().timing.budget.strict = true;   // 之後哪一幀寫爆 VBlank 就直接 throw
```

---

## 12. game 物件介面

`games/<遊戲>/` 的最後一個檔案要設定 `window.GAME`（或 `NES.game`）：

```js
window.GAME = {
  init(nes)  { /* 建 CHR bank、設調色盤、初始化關卡 */ },
  update(nes){ /* 讀 NES.Input、跑物理、nes.music && nes.music.tick() */ },
  draw(nes)  { /* 寫 nes.ppu 的名稱表 / OAM；不要自己呼叫 ppu.render() */ },
  state()    { return { x, y, vx, vy, room }; }   // 除錯 / 測試用（可省略）
};
```
- `draw()` 結束後 `nes.boot` 會自動 `ppu.render()`。
- 新增檔案要同時加進 `game.html` 的 games 區塊（`tools/build.py` 會自動補上漏列的，但會警告）。

---

## 13. 工具

| 工具 | 用法 |
|---|---|
| `tools/shot.py` | `$PY tools/shot.py --script "press right 40; tap a 1; step 30; shot jump" --seq 6:4 --scale 3 --lint --out shots/agent_x/run.png`<br>script：`press <k,k> <n> \| tap <k> <n> \| step <n> \| release \| shot <name>`；key：`a b select start up down left right`；`--lint` 截完跑 `__nes.lint()`，違規 exit 1；另有 `--state --stats --console --steps --keys --query --url` |
| `tools/build.py` | `$PY tools/build.py` → `dist/星塵勇者.html`（單檔）；`--check` 只驗載入順序與 engine 缺檔 |
| `tools/run_all.sh` | `bash tools/run_all.sh [--quick] [--shots N]`：node --check → **`tools/test_*.py` + `games/*/test_*.py`**（fix1 起涵蓋遊戲層，QA P1-1 / X1）→ `build.py --check` → 冒煙截圖 → `nes_lint.py` 抽查 → PASS/FAIL 表 |
| `tools/mobile_shot.py` | `$PY tools/mobile_shot.py --page cruiser.html --device "iPhone 13" --landscape --touch "tap 697 75 3; step 90; down 0 147 253; up 0" --rects --out shots/agent_x/m.png`：以 Playwright 手機裝置描述（觸控 / DPR）開入口頁，截**整個 viewport**（含觸控按鍵）；touch 指令 `tap/down/move/up/step/key/shot`；另有 `--dist --url --scale --query --eval --state --rects --run --console --hint --list` |
| `tools/test_touch.py` | `$PY tools/test_touch.py [--only cruiser]`：三頁 × iPhone 13 橫 / Pixel 5 直 × 18 項 + 桌機 1280×800 × 6 項 = **180 項**（版面不壓畫面 / 不出界、backing 整數、小數倍 CSS、觸控輸入端對端、鍵盤淡出） |
| `tools/nes_lint.py` | `$PY tools/nes_lint.py --palette engine/palette.js shots/**/*.png`：逐像素驗 64 色 / ≤ 25 色 / 整數放大無平滑 |

`$PY = ../卡比之星/.venv/bin/python`（已裝 playwright / pillow）。

---

## 14. 實作差異（實測核對）

**核對方法**（2026-09-17，tools agent）：`node --check` 全部 10 個 `engine/*.js` → playwright 開 `about:blank`
依契約順序 `add_script_tag` 載入全套 → 逐項檢查契約成員的存在 / 型別 / 行為（含 throw 條件），
再用 `game.html?debug=1` 實際 boot、注入測試 game（磁磚 + 屬性 + 捲動 + 分割 + 12 個同線精靈）跑 50 幀截圖與 lint。

**結果：80 項檢查 79 通過**（palette 6/6、fixed 6/7、input 10/10、cpu_timing 10/10、chr 7/7、ppu 19/19、
nes_lint 5/5、apu 8/8、music 6/6、nes 2/2）；10 檔語法全 OK、載入全套 0 console error。

> **2026-09-17 第二次核對（R1 fix1，依 `docs/QA_REPORT.md`「R1 驗收（qa1）」逐條處理）**：
> 下表的 **D1 / D2 / D3 已經全部修好**（D2 / D3 在 qa1 驗收時其實就已修好，只是本檔沒更新 ⇒ QA P1-7）。
> 新增的差異 / 定案記在 **D8–D11**。全套測試：core 108 / ppu 144 / chr 91 / apu 57 / demo 55 = **455 項 0 失敗**。

| # | 模組 | 契約寫的 | 實作 | 影響 / 處置 |
|---|---|---|---|---|
| D1 | fixed.js | `addVel(posSub, v88)` → `{pos, frac}` | **✅ 已定案（fix1）**：正式寫法是 `Vec{sub,frac}` + `vadd` / `Acc{v,frac}` + `aadd`（餘數在物件內）；`addVel(vec,v)` / `addAcc(av,a)` 只是相容別名；全域 `NES.FX.frac` 與 `addVel.frac` **已移除**，傳舊參數會 throw 明確訊息 | 契約（TASKS.md §API）的舊簽章作廢，**一律以本檔 §3 為準**。QA P1-3 / X3 結案 |
| D2 | ppu.js ↔ nes_lint.js | `Lint.frame(ppu).overLine[]` 回報每線 > 8 精靈的掃描線 | **✅ 已修好**：`ppu.stats.overLine` 與 `overLines` 是同一個陣列參照，`Lint.frame()` 讀得到 | qa1 實測 `__nes.lint().overLine` 回 32 條掃描線 `[176..207]`。（本欄在 fix1 之前寫的是舊狀態 ⇒ QA P1-7） |
| D3 | ppu.js ↔ nes_lint.js | `Lint.oam(ppu)` | **✅ 已修好**：PPU 提供公開的 `ppu.oam`（唯讀檢視，每次重新產生）與 `ppu.oamBytes()`（256 byte 硬體鏡像） | qa1 實測 `NES.Lint.oam(ppu)` 回 `{ok:true, count:28, maxLine:14, spriteHeight:16}`。（本欄在 fix1 之前寫的是舊狀態 ⇒ QA P1-7） |
| D4 | chr.js ↔ ppu.js | 契約沒說 render 前一定要 setPattern | `chr.js` 載入後若沒 `setPattern`，`ppu.render()` 會 throw | `NES.boot` 在 `game.init()` 前塞空白 bank `__nes_blank` 保底（§7）。遊戲照常自己 setPattern |
| D5 | music.js | `NES.Music.play/stop/sfx/tick/define` 直接可用 | 必須先 `NES.Music.attach(apu)`；另有 `create(apu)` 工廠 | `NES.boot` 已自動 `attach`，且 `nes.music === NES.Music`（同一個 driver），契約寫法可直接用。若自行 `create(apu)` 會得到**另一個** driver，`NES.Music.play()` 不會驅動它 |
| D6 | nes_lint.py | 逐像素驗 64 色 / ≤ 25 色 | 純黑畫面會固定跳「畫面含與禁用色 $0D 相同的 RGB」提醒（$0D 與 $0F 的 RGB 都是 #000000，無法從像素分辨） | 只是提醒、不算違規（該圖仍 PASS）。`tools/run_all.sh` 以 exit code 判定，不受影響 |
| D7 | 多處 | — | 各模組都提供契約以外的附加 API（`CHR.tile16/slice/DEMO`、`PPU.stats.{dropped,sprites,ms,frames}`、`FX.SMB` 常數表、`APU.PULSE_TABLE/LENGTH_TABLE`、`Music.DEMO/state/record`、`Lint.check/summary`） | 契約的**超集**，不衝突。使用前請看各檔檔頭 |
| D8 | ppu.js（fix1 新增） | 契約沒說 `render()` 有沒有副作用 | `render()` **是純函式**；OAM 閃爍輪替改由 `ppu.endFrame()`（別名 `advanceFlicker()`）推進 | 一幀 = `game.draw() → ppu.render() → ppu.endFrame()`，`NES.boot` 已接好；直接用 `NES.PPU.create()` 的程式（如 `tools/test_ppu.py`）要自己在每幀結束呼叫 `endFrame()`，否則精靈不會閃爍。QA P1-2 / X2 結案 |
| D9 | cpu_timing.js ↔ ppu.js（fix1 新增） | `timing.budget` 只是介面，**沒有任何呼叫端** | PPU 的 `setTile/setAttr/fillTiles/fillAttr/sprite/clearSprites/setBgPalette/setSprPalette/setBackdrop` 都會以實際 byte 數計帳；`NES.boot` 把 `timing.budget` 綁到 `ppu.budget` | 兩條通道：`'ppu'` 160 byte/幀、`'oam'` 256 byte/幀（$4014 DMA）。超支 → `over=true` + `overFrames++`，`__nes.stats().budget` 看得到，`budget.strict=true` 直接 throw。`ppu.budget` 為 `null`（單元測試）時全部 no-op。QA P1-6 / X5 結案 |
| D10 | fixed.js（fix1 新增） | 契約沒寫跳躍規則 | `NES.FX.SMB.jumpState/jumpStart/jumpGravity/jumpBounce/jumpSim` 是**唯一一套**規則，`games/demo` 與 `tools/test_core.py` 共用；`skipGravityFirstFrame` 預設開（起跳首幀半格重力） | 長按靜止跳 **64.00 px（4 格）**、全速跳 **80.00 px（5 格）**、點按 1 幀 **19.6875 px**，兩邊量到同一個數字。QA P1-4 / P1-5 / X4 結案 |
| D11 | chr.js（fix1 新增） | — | 新增 `NES.CHR.DEMO.spr16`（8×16 配對 bank，已註冊為 `demo_spr16`）與 `DEMO.oam16(name)` | 用 8×16 的遊戲不用再自己 `tile16()` 重建一次（`games/demo/chr.js` 已改用）。QA P2-4 / X12 結案 |
| D12 | music.js（R2 audio） | P2-7 / X15 滑音 / detune 未實作 | 已實作 `slide`（數字 / portamento / limit）與 `detune`，格式向下相容 | demo 曲零改動、R1 57 項零修改全綠；test_apu 103 項。QA R1 P2-7 / X15 結案 |

**跨模組實測（`game.html` + 注入測試 game，50 幀）**：CHR bank → 名稱表 / 16×16 屬性 → 捲動 → `split(32)` 狀態列分割 →
12 個同線精靈（實際畫 8 個、`flickered` 生效）→ `NES.Lint.frame` = `{ok:true, colors:6, badPixels:0}`；
`NES.Music.play(DEMO)` + `sfx('jump')` 跑 30 幀後 `apu.render(2000)` 樣本全非零；
`dist/星塵勇者.html`（153 KB 單檔）在 1024×768 視窗自動放大 3 倍置中（768×672）、0 console error、非 debug 下 Timing 自動跑約 60 fps。
截圖：`shots/agent_tools/boot.png`（無 demo 的黑畫面）、`shots/agent_tools/e2e_test.png`（注入測試 game）。

---

## 15. NES.SH（engine/shmup.js）

擁有者：engine agent（R2）｜ 契約來源：`docs/TASKS.md`「R2《星塵巡航艦》§ engine/shmup.js」
載入順序：**`ppu.js` 之後、`nes.js` 之前**（`cruiser.html` / `build.py` 已排好）。零相依（只用傳進來的 `ppu`）。

橫向射擊（宇宙巡航艦式）的共用工具：整數三角函數、瞄準、AABB、物件池、
每幀 OAM 配置（含軟體 sprite cycling）、名稱表欄串流、以關卡欄為鍵的出怪表。

### 15.1 角度與單位

| 項目 | 規則 |
|---|---|
| 角度 | **一圈 = 256 單位**（0..255）；`0 = 右(+x)`、`64 = 下(+y)`、`128 = 左(-x)`、`192 = 上(-y)`（螢幕 y 向下 ⇒ 角度增加 = 順時針） |
| 三角函數 | 8.8 定點（`256 = 1.0`），`Int16Array` 查表；**執行期不呼叫 Math 的三角函數**（只在載入時建表） |
| 速度 | 8.8（1/256 px/幀），與 `NES.FX.v88` 同單位 ⇒ 可直接餵 `NES.FX.vadd(vec, v)` |
| 碰撞 | 整數像素 `{x, y, w, h}`（左上 + 寬高），碰撞框比精靈小（船 12×6、敵 12×12、彈 4×4） |

### 15.2 數學 / 工具

| 成員 | 簽章 | 說明 |
|---|---|---|
| `NES.SH.SIN` / `COS` | `Int16Array(256)` | 8.8 正弦 / 餘弦表（與 `Math` 的誤差 ≤ 0.5/256） |
| `sin(a)` / `cos(a)` | `(int) → int` | 同上但自動 `a & 255` |
| `atan2(dy, dx)` | `(int, int) → 0..255` | 八分法 + 反正切查表；八個主方向精確、全 256 個方向誤差 ≤ 1 單位；`(0,0) → 0` |
| `aim(sx, sy, tx, ty, speed88[, out])` | `→ {vx, vy, a}` | 瞄準射擊的 8.8 速度向量；長度誤差 < 1%。**傳 `out` 就重複使用該物件**（每幀零配置） |
| `vel(angle, speed88[, out])` | `→ {vx, vy, a}` | 直接用角度算速度（環形彈幕、固定角度彈） |
| `aabb(a, b)` | `({x,y,w,h}, {x,y,w,h}) → bool` | 整數 AABB；**相鄰不算重疊**（`a.x + a.w === b.x` → false），寬或高為 0 一律 false |
| `inRect(x, y, r)` / `clamp(v, lo, hi)` | | 點在矩形內 / 整數夾限 |
| `every(frame, n[, phase])` | `→ bool` | 每 n 幀成立一次 |
| `Timer(period[, phase])` | `→ {t, period, tick(), reset(p)}` | 小計時器：`tick()` 每 period 幀回一次 true |

### 15.3 `NES.SH.Pool(n, factory)` — 固定大小物件池（無 GC）

| 成員 | 說明 |
|---|---|
| `alloc()` | 取一個空槽（`obj.alive = true`）；**沒槽了回 `null`**（NES 風：不生成） |
| `free(obj)` | 歸還（`obj.alive = false`）；重複釋放 / 外來物件安全回 `false` |
| `each(fn, ctx)` | 走訪活著的物件 `fn(obj, i)`；**途中或先前被設成 `alive = false` 的會就地回收** |
| `count` / `size` / `items` / `isAlive(i)` | 活著幾個 / 總槽數 / 全部物件（含死的）/ 某槽是否活著 |
| `freeAll()`（別名 `reset()`） | 全部歸還（換關 / 檢查點復活） |

> 建構時就把 n 個物件全造好，之後只切換「活 / 死」⇒ **執行期零配置、零 GC**。
> 物件由 `factory(i)` 提供，本模組只加一個 `alive` 旗標與非列舉的 `_pi`（槽號）。

### 15.4 `NES.SH.OAM(ppu, {reserve, step, max, hideY, margin})` — 每幀精靈配置

| 成員 | 說明 |
|---|---|
| `begin()` | 開始收集這一幀（清空 `n / dropped / skipped`） |
| `add(s)` | 收集一個 `{x, y, tile, pal, flipH, flipV, behind, prio}`（**可以重複使用同一個物件**）；回傳是否收下 |
| `push(x, y, tile, pal, prio, flags)` | 低階版（`flags` bit0 flipH / bit1 flipV / bit2 behind），完全不配置物件 |
| `end()` | 依 `prio` 穩定排序後寫進 OAM `reserve..63`，回傳實際寫入數 |
| `used` / `dropped` / `skipped` / `n` / `capacity` / `frames` | 本幀寫入 / 被丟棄 / 越界略過 / 收集數 / 可用槽數 / 已跑幀數 |
| `resetCycle()` | 輪替指標歸零（換關、要可重現的截圖時用） |

- **`prio` 0 最高**（船 / 選項 / 自機彈 → 1 敵彈 → 2 敵 → 3 爆炸…，0..7）；同 `prio` 內維持 `add` 的順序。
- **同 `prio` 每幀輪替起點**（預設 `step = 8`）＝ 軟體 sprite cycling：同一條掃描線上 12 顆同 `prio` 的精靈，**連續兩幀的聯集會畫齊全部 12 顆**（PPU 每線只畫 8 個）。
- 超過可用槽數的**丟棄並計 `dropped`**（因為有輪替，每幀被丟的是不同的那幾顆）。
- `y >= 240`、`y < -margin`、`x >= 256`、`x < -margin`（`margin` 預設 16）的在 `add()` 就**略過並計 `skipped`**，不佔槽。
- 沒用到的槽會寫成 `y = 240` 隱藏（`hideUnused: false` 可關）。
- `reserve: n` 保留 OAM 前 n 槽給遊戲自己寫（例如固定的船），本模組從第 n 槽開始寫。

### 15.5 `NES.SH.Scroller(ppu, {nt: 2, cols, tileAt, attrAt, row0, rows, ahead, maxCols, mirror})`

| 成員 | 說明 |
|---|---|
| `reset(camX)` | **一次補滿兩張名稱表（64 欄）**＋屬性，並套用 `ppu.mirroring('v')`；回傳寫入 byte 數（2400）。只能在 `init` / 換關 / 檢查點復活（rendering 關閉）時呼叫 |
| `update(camX)` | 每幀呼叫：只寫「新露出」的欄（預設最多 1 欄 / 幀）；**回傳本幀寫入 byte 數（≤ 45）** |
| `writeColumn(c)` / `colBytes(c)` | 手動寫世界第 c 欄 / 查一欄要幾 byte |
| `next` / `bytes` / `peak` / `columns` / `pending(camX)` | 下一個待寫的世界欄 / 上一幀 byte / 單幀尖峰 / 累計欄數 / 落後幾欄（>0 = 相機太快） |

- 映射：世界第 `c` 欄固定寫進 **`c & 63`** → 名稱表 `(c >> 5) & 1` 的第 `c & 31` 欄；
  所以水平捲動必須是 **垂直鏡像 `ppu.mirroring('v')`（左右兩張不同）**，`reset()` 會自動設好（`{mirror: false}` 可關）。
- 一欄 = `rows` 個磁磚（預設 30 列，row 0..29）+ **每 2 欄一次**的 16×16 屬性（15 個）= **最多 45 byte / 幀**，
  遠低於 NTSC 的 160 byte VBlank 預算（§5）。
- `row0` / `rows`：**下方有 HUD 的話請用 `{row0: 0, rows: 26}`**，把列 26..29 留給狀態列（否則地形會蓋掉 HUD 的名稱表）。此時一欄 = 26 + 13 = 39 byte。
- `cols`：關卡總欄數（0 = 不限），到底之後不再往前寫。
- `ahead`（預設 34）：補到「畫面右緣再往右 2 欄」；`maxCols`（預設 1）：每幀最多補幾欄——**改大會超出 VBlank 預算**，只在相機速度 > 8 px/幀 時才考慮。
- **不會**動 `ppu.scroll` / `ppu.split`：那是遊戲自己的事（見下方範例）。

### 15.6 `NES.SH.Spawner(table)` — 以關卡欄為鍵的出怪表

`table` = `[{col, fn}, …]`（沒排序也可以，建構時會排）。

| 成員 | 說明 |
|---|---|
| `update(camCol, ctx)` | 觸發所有 `col <= camCol` 且還沒觸發過的項目，呼叫 `fn(ctx, col, entry)`；回傳本幀觸發數。**一幀跨多欄會全部觸發；相機倒退不重觸發** |
| `reset()` | 全部重來（關卡重啟） |
| `seek(camCol)` | 檢查點復活：把 `col <= camCol` 的直接標成已觸發（**不執行 `fn`**） |
| `index` / `fired` / `remaining()` | 進度 / 已觸發數 / 還剩幾筆 |

### 15.7 最小射擊迴圈（20 行）

```js
const SH = NES.SH, ppu = nes.ppu;
ppu.flickerStep = 0;                                      // ★ 輪替改由 SH.OAM 做
const oam = SH.OAM(ppu, { reserve: 0 });
const scr = SH.Scroller(ppu, { nt: 2, cols: 384, rows: 26,   // 下 4 列留給 HUD
  tileAt: (c, r) => stage.tile(c, r), attrAt: (c16, r16) => stage.pal(c16, r16) });
const bullets = SH.Pool(16, () => ({ x: 0, y: 0, w: 4, h: 4, vx: 0, vy: 0 }));
const spawn = SH.Spawner([{ col: 40, fn: (g) => g.addEnemy(260, 80) }]);
scr.reset(0);                                             // init：一次補滿兩張名稱表
// ---- 每幀 update ----
camX += 1;                                                 // 相機 1 px/幀
scr.update(camX);                                          // ≤ 45 byte
spawn.update(camX >> 3, game);
bullets.each(b => { b.x += b.vx >> 8; if (b.x > 255) b.alive = false; });
const v = SH.aim(turret.x, turret.y, ship.x, ship.y, 384, tmp);   // 瞄準射擊（tmp 重複使用）
if (SH.aabb(ship, enemy)) ship.die();
// ---- 每幀 draw ----
ppu.scroll(camX % 512, 0, 0);                              // 捲動由遊戲設
ppu.split(208, { x: 0, y: 208, nt: 0 });                   // 下方 32 線 HUD
oam.begin();
oam.add({ x: ship.x, y: ship.y, tile: T_SHIP, pal: 0, prio: 0 });
bullets.each(b => oam.add({ x: b.x, y: b.y, tile: T_SHOT, pal: 1, prio: 1 }));
stage.draw(oam);                                           // 敵 prio 3、敵彈 2、爆炸 4
oam.end();                                                 // 排序 + 輪替 + 寫 OAM
```

### 15.8 注意事項

1. **一定要先設 `ppu.flickerStep = 0`**：`SH.OAM` 自己做軟體 sprite cycling，PPU 內建的輪替會跟它打架（畫面變成隨機閃）。`ppu.flicker` 維持 `'rotate'` 即可（`stats.flickered` 仍會統計超線）。
2. **VBlank 預算**：`Scroller.update()` ≤ 45 byte / 幀；HUD 的分數更新等其他寫入要自己算進 160 byte（`__nes.stats().budget`）。`Scroller.reset()` 是 2400 byte，**只能在 init / 關閉 rendering 時做**。
3. **OAM DMA 是另一條通道**：`oam.end()` 每幀寫滿 64 槽 = 256 byte，剛好等於 `oamLimit`，不算超支（§5 D9）。
4. **`aim()` / `vel()` 預設會 new 一個物件**：每幀會跑很多次的地方請傳 `out` 重複使用。
5. **相機瞬移**（換關 / 檢查點復活）要呼叫 `Scroller.reset(camX)` + `Spawner.seek(col)` + `Pool.freeAll()`，不要只改 `camX`。
6. 角度 0 是**右**、64 是**下**。敵人「往左飛」= 角度 128。
7. 測試：`tools/test_shmup.py`（157 項，含 `indexFrame` 實測兩幀聯集畫齊 12 顆、600 幀預算不超支）。

---

## 16. NES.Touch（engine/touch.js）

擁有者：nes-touch agent ｜ R2 ｜ 借用 `../卡比之星/src/touch.js`（Round 11/11b）的寫法，改成 NES 八鍵

手機觸控虛擬手把：**純 DOM 覆蓋層**（自己建 `<div>` + 自注入 `<style>`），三個入口頁只要載入
`engine/touch.js`（排在 `nes.js` 之前）就有按鍵；`tools/build.py` 內嵌後 dist 單檔也自然帶著。

### 16.1 按鍵配置

| 元件 | 說明 |
|---|---|
| 搖桿 / 十字鍵 | `layout.stick = 'stick'`（預設，圓形搖桿 + 旋鈕 + 8 刻度）或 `'dpad'`（四箭頭）。**8 方向**（45° 扇區 + **±6° 磁滯**）、死區（stick 0.20 / dpad 0.26 × 底座半徑）、**浮動底座**（`stickFloat`，在感應區內落指就把底座搬過去，放開回原位） |
| `A` | 右下最大顆（紅） |
| `B` | A 的左邊（橘） |
| `SELECT` / `START` | 小長條（直向＝主排上方一列；橫向＝動作鍵側上方上下疊） |
| 全螢幕 | 四角括號圖示（藍）；`document.fullscreenElement` 切換，iOS Safari 沒有 API 時整顆隱藏 |

### 16.2 API

| 成員 | 簽章 | 說明 |
|---|---|---|
| `NES.Touch.available` | `boolean` | 這台機器有觸控（`ontouchstart` / `maxTouchPoints`） |
| `active()` | `() → boolean` | 覆蓋層目前顯示中 |
| `show()` / `hide()` | | 強制顯示 / 隱藏（等於把 `layout.mode` 設成 `'on'` / `'off'` 並存檔） |
| `layout` | `{mode, side, size, opacity, stick, stickFloat}` | `mode`：`'auto'`（觸控裝置才顯示，預設）/ `'on'` / `'off'`；`side`：`'right'`（A/B 在右，預設）/ `'left'`；`size` 0.6~1.6；`opacity` 0.15~1（預設 0.8）；`stick`：`'stick'`（預設）/ `'dpad'`；`stickFloat` bool |
| `setLayout(o)` | `(o) → layout` | 即時套用 + 存 `localStorage.nes_touch`；回傳套用後的 `layout` |
| `rects()` | `() → {dpad,a,b,select,start,fs}` | 各鍵在 viewport 的 CSS px 矩形 `{x,y,w,h,cx,cy}`（測試 / 版面檢查用） |
| `mask()` | `() → int` | 觸控目前按著的 NES 八鍵遮罩 |
| `dirs()` / `sector()` / `tickOn()` | | 方向狀態 / 目前扇區（-1 ＝ 死區）/ 亮著的刻度 |
| `floatZone()` / `padHome()` / `floating()` | | 浮動感應區矩形 / 底座原位 / 是否浮動中 |
| `relayout()` / `releaseAll()` | | 手動重排 / 放掉所有按鍵 |
| `buttons` / `el` / `overlapping` | | 按鍵 DOM / 覆蓋層根節點 / 這次排版有沒有壓到畫面 |

```js
NES.Touch.setLayout({ side: 'left', stick: 'dpad', size: 1.2, opacity: 0.9 });
NES.Touch.rects().a;          // {x, y, w, h, cx, cy}
NES.Touch.mask();             // 例如 129 = A|RIGHT
```

### 16.3 輸入接法（**不改 input.js**）與取捨

`engine/input.js` 沒有可以「OR 進去」的第三來源（沒有 `setExternal`），因此 touch.js 用既有的
`NES.Input.inject(mask, frames)`（來源優先權 `replay > inject > 鍵盤 | Gamepad`）：

| 狀態 | 動作 |
|---|---|
| 觸控有按鍵（遮罩變動時） | `NES.Input.clearInject()` → `NES.Input.inject(mask, 1e9)`（＝按住到放開） |
| 觸控全部放開 | `NES.Input.inject(0, 0)`（清空佇列 ⇒ 鍵盤 / 手把**立刻**恢復） |
| 看門狗（每 6 幀） | 佇列被別人清掉 / 耗盡時（`injectPending() < 4096`）自動補回來 |

> **取捨（要知道的兩件事）**
> 1. 觸控按著的期間，鍵盤 / 手把被 inject 蓋掉（不會 OR 起來）；全部放開後立即恢復。手機上不會同時用兩種輸入，桌機上覆蓋層預設不顯示 ⇒ 實務上不衝突。
> 2. 觸控按著的期間，腳本注入（`__nes.press/tap`、`tools/shot.py`）會被 `clearInject()` 清掉。截圖 / 測試工具不會同時做這兩件事。
> 若之後要「觸控 OR 鍵盤」，需要 core agent 在 input.js 加 `setExternal(mask)`（跨檔需求，見 PROGRESS）。

### 16.4 顯示 / 淡出 / 音訊解鎖 / 設定

- `mode: 'auto'`：觸控裝置才顯示；**鍵盤 / 手把輸入後淡出**（`transition: opacity .22s`），**再觸控又出現**。
- 第一次觸控會做音訊解鎖：`nes.apu.unlock()`（若有）→ 否則 `nes.connectAudio()`（§9 / §11）→ 再 `audioCtx.resume()`；`pointerdown` 與 `pointerup` 都呼叫一次（iOS 要在 `touchend` 裡 resume）。
- 設定存 `localStorage.nes_touch`（JSON，欄位同 `layout`）。純觸控裝置若存成 `'off'` 會自動退回 `'auto'`（避免沒有任何入口能點回來）。
- 切到背景（`visibilitychange`）/ 失焦（`blur`）會 `releaseAll()` + `inject(0,0)`，不會卡住方向。

### 16.5 入口頁契約：`window.NES_LAYOUT` 與 `nes-resize`

三個入口頁（`game.html` / `star.html` / `cruiser.html`）的啟動段每次 `fit()` + `place()` 之後都會設：

```js
window.NES_LAYOUT = { x, y, w, h, scale, back, portrait, mobile, safe:{t,r,b,l}, vw, vh };
window.dispatchEvent(new Event('nes-resize'));
```

| 欄位 | 說明 |
|---|---|
| `x, y, w, h` | canvas 在 viewport 的 CSS px 矩形（`w = 256 × scale`，可小數） |
| `scale` | **顯示**倍率（手機可小數） |
| `back` | **backing store** 倍率（整數 1~4，= `nes.scale`；`nes.setScale` 只改 backing store，QA R1 P2-1） |
| `portrait` / `mobile` | 直向 / 手機（觸控裝置或短邊 < 600；`?scale=N` 時強制 false） |
| `safe` | `env(safe-area-inset-*)` 實測 px（隱藏探針量的） |

`fit()` 規則：

| 情況 | 倍率 | 位置 |
|---|---|---|
| `?scale=N` | N（整數，維持截圖可重現） | 置中（等同桌機） |
| 桌機（非觸控且短邊 ≥ 600） | `floor(min(vw/256, vh/224))`，至少 1 | 置中、座標取整 |
| 手機直向 | `vw / 256`（寬填滿；`224×s` 超高才縮） | 貼上方（`y = safe.top`），下方整片給按鍵 |
| 手機橫向 | `min(vh/224, (vw − 留白)/256)`；留白 = 手機 220 / 平板（短邊 ≥ 500）340 + safe | 置中 ⇒ 兩側各 ≥ 110px（平板 170px）給按鍵 |

小數倍時 backing store 取 `ceil(scale)`（1~4 的整數），CSS 縮到目標尺寸 + `image-rendering: pixelated`。
其他：viewport `viewport-fit=cover, user-scalable=no`、`100dvh`、`touch-action:none`、旋轉 / `visualViewport`
resize 會二次觸發（iOS 工具列收合延遲）、`?touch=1` / `?touch=0` 可強制顯示 / 隱藏按鍵（桌機截圖用）。

### 16.6 注意事項

1. 覆蓋層排版**一律避開畫面**：直向放畫面下方，橫向放左右留白；每顆按鍵再做一次 `avoid()`（推出畫面 → 夾進安全區），真的塞不下才半透明壓上去並把 `NES.Touch.overlapping` 設成 `true`。
2. 浮動搖桿的感應區排在所有按鍵**之前**（同層後者疊在上面）⇒ 手指落在 A/B/START 上時永遠是按鍵優先。
3. `tools/shot.py`（桌機、`?scale=1`、非觸控）不受影響：覆蓋層在非觸控環境預設隱藏，而且 shot.py 是 `canvas.toDataURL()` 不是頁面截圖。整頁截圖請用 `tools/mobile_shot.py`。
4. 測試：`tools/test_touch.py`（180 項）。
