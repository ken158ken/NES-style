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

---

## 1. 通則

| 項目 | 規則 |
|---|---|
| 檔案型態 | 每個 `engine/*.js` 都是 classic script + IIFE、**零相依**；開頭 `window.NES = window.NES \|\| {};` 再掛自己的模組 |
| 載入順序 | `palette → fixed → input → cpu_timing → chr → ppu → nes_lint → apu → music → nes.js → games/*`（`game.html` 與 `tools/build.py` 都以此為準，build.py `--check` 會驗證） |
| 解析度 | PPU 內部 256×240，顯示裁上下各 8 列 → **256×224**；整數倍放大、無平滑 |
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

song 格式定義寫在 `engine/music.js` 檔頭（pattern 陣列；每列 = 1 幀或 speed 幀；指令 `note / inst / vol / arp / vib / duty / stop`）。

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

**跨模組實測（`game.html` + 注入測試 game，50 幀）**：CHR bank → 名稱表 / 16×16 屬性 → 捲動 → `split(32)` 狀態列分割 →
12 個同線精靈（實際畫 8 個、`flickered` 生效）→ `NES.Lint.frame` = `{ok:true, colors:6, badPixels:0}`；
`NES.Music.play(DEMO)` + `sfx('jump')` 跑 30 幀後 `apu.render(2000)` 樣本全非零；
`dist/星塵勇者.html`（153 KB 單檔）在 1024×768 視窗自動放大 3 倍置中（768×672）、0 console error、非 debug 下 Timing 自動跑約 60 fps。
截圖：`shots/agent_tools/boot.png`（無 demo 的黑畫面）、`shots/agent_tools/e2e_test.png`（注入測試 game）。
