# 紅白機遊戲開發 — 任務板

# R1 核心引擎（2026-09-17 開工）
使用者確認：依 docs/PLAN.md 開 R1；第一款 = 橫向平台動作（工作名《星塵勇者》）。**素材全部原創**、不做 ROM。
所有 agent 必讀：CLAUDE.md、docs/PLAN.md §1~§2、對應的 docs/research 章節、本檔 §API 契約。Python 用 `../卡比之星/.venv/bin/python`（playwright / pillow 已裝）；截圖必用 Read 看圖；不 git。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| ppu | engine/ppu.js、engine/palette.js、tools/test_ppu.py | 64 色 NTSC 調色盤（$0D 禁用）、名稱表 ×2 + 屬性表 + 鏡像、OAM 64 / 8×8 與 8×16、每線 8 精靈上限 + 閃爍輪替、精靈優先權 / 翻轉、捲動 + 掃描線分割（狀態列）、整數倍放大無平滑、輸出 256×240 裁 224；stats 統計 |
| apu | engine/apu.js、engine/music.js、tools/apu_render.py、tools/test_apu.py | 2A03 五聲道暫存器級模擬（方波 ×2 占空比 / 掃頻 / 包絡、三角波 32 階、雜訊 LFSR 長短模式 NTSC 週期表、DPCM 1-bit）、非線性混音、frame counter 240Hz、離線渲染 + 即時（AudioWorklet，退 ScriptProcessor）；FamiTracker 式 pattern 音樂驅動（每幀 tick、琶音 / 顫音 / 占空比包絡）、音效搶聲道優先權 |
| chr-lint | engine/chr.js、engine/nes_lint.js、tools/nes_lint.py、tools/test_chr.py | CHR 圖樣表：文字格式 8×8 2bpp 磁磚、bank / 圖樣表切換、256 上限；nes_lint.js 執行期檢查（同屏 ≤ 25 色、每線 > 8 精靈、非 64 色、非 8px 對齊 → 報錯或洋紅）；nes_lint.py 掃 PNG 截圖逐像素驗 64 色 / ≤ 25 色（容許整數放大） |
| core | engine/fixed.js、engine/input.js、engine/cpu_timing.js、tools/test_core.py | 定點數（位置 1/16 px、速度 8.8）、手把 8 鍵每幀取樣 + pressed / released + 記錄 / 重播 + 腳本注入、60.0988 Hz 固定步（無 dt 補間、step(n) 同步推進供測試、NTSC / PAL 模式、幀預算計數） |
| tools | engine/nes.js、game.html、tools/shot.py、tools/build.py、tools/run_all.sh、docs/ENGINE_API.md | 命名空間 / 載入順序 / 除錯 API `__nes`（?debug=1）、遊戲入口頁（整數放大置中、鍵盤焦點）、Playwright 截圖工具（沿用卡比 shot.py 的 --script 語法）、單檔打包、一鍵跑全部測試；把 §API 契約整理成 ENGINE_API.md 並在各模組完成後核對實作是否相符 |
| demo（第二波） | games/demo/*、game.html（掛 demo） | 測試房：捲動背景 + 狀態列分割 + 10 個以上精靈同線閃爍 + 一首短曲 + 2 音效 + 主角以 SMB 常數走跳 |
| qa1（第二波） | docs/QA_REPORT.md | lint 全過、APU wav 頻譜、60fps、debug API、截圖 |

## API 契約（wave 1 各 agent 平行實作的依據；有異動寫進 PROGRESS.md 自己區段「契約異動」）
- 每個 engine 檔都是 classic script、IIFE、零相依：`window.NES = window.NES || {};` 然後掛自己的模組。載入順序：palette → fixed → input → cpu_timing → chr → ppu → nes_lint → apu → music → nes.js → games/*。
- 各模組**自己的測試不得依賴別人的檔案**：tools/test_*.py 用 playwright 開 `about:blank` 後 `page.add_script_tag(path=...)` 只載入自己（與 palette.js / fixed.js 這種葉節點）。
- `NES.PALETTE`（palette.js，ppu agent）：64 × [r,g,b]（NTSC 常用表，來源寫在檔頭）、`NES.PALETTE.FORBIDDEN = [0x0D]`、`NES.PALETTE.rgb(i)`、`NES.PALETTE.nearest(r,g,b)`。
- `NES.FX`（fixed.js）：`SUB = 16`（位置單位 1/16 px）、`toSub(px) / toPx(sub) / floorPx(sub)`；速度 8.8：`v88(hi, lo)`、`addVel(posSub, v88)`（速度 1/256 px/幀 累加到 1/16 px 位置，餘數保留在 `.frac`）。全部整數運算。
- `NES.Input`（input.js）：`BTN = {A:1, B:2, SELECT:4, START:8, UP:16, DOWN:32, LEFT:64, RIGHT:128}`（NES 順序）；`poll()` 每幀一次（由 Timing 呼叫）；`held(b) / pressed(b) / released(b)`；`mask()`；`inject(mask, frames)` 腳本注入（優先於鍵盤）；`record() / stopRecord() / replay(arr)`；預設鍵盤：方向鍵 / WASD、Z=A、X=B、Enter=START、Shift=SELECT。
- `NES.Timing`（cpu_timing.js）：`create({update, draw, hz: 60.0988})` → `{start(), stop(), step(n), frame, hz, setMode('ntsc'|'pal'), budget: {set(bytes), use(n), over}}`；`step(n)` 同步跑 n 幀（不走 rAF），每幀順序：Input.poll → update → draw。
- `NES.CHR`（chr.js）：`tile(rows)`：8 個字串各 8 字元，字元 `.123` → `Uint8Array(64)`；`bank(name, obj)` 建 bank（≤ 256 tile，回傳 `{name, tiles, index(name)}`）；`setPattern(0|1, bankName)`；`get(table, idx)` → Uint8Array(64)；超過 256 或字元非法 → throw。
- `NES.PPU`（ppu.js）：`create(canvas, {scale})` → ppu：`setBackdrop(c)`、`setBgPalette(i, [c1,c2,c3])`、`setSprPalette(i, [..])`（c 為 0..63、$0D throw）；`setTile(nt, col, row, tile)`、`setAttr(nt, col16, row16, pal)`、`fillTiles(nt, col, row, w, h, tile)`、`mirroring('h'|'v')`、`scroll(x, y)`、`split(scanline, {x, y, nt})`（分割後段的捲動；`null` 取消）；`sprite(i, {x, y, tile, pal, flipH, flipV, behind})`、`clearSprites()`、`spriteMode(8|16)`；`render()` 畫一幀（先寫入 `ppu.frame` = Uint8ClampedArray 256×240×4，再整數放大到 canvas、裁上下各 8 列）；`ppu.stats = {colors, maxSpritesLine, flickered}`；`flicker: 'rotate'|'none'`。
- `NES.Lint`（nes_lint.js）：`frame(ppu)` → `{ok, colors, badPixels, overLine[]}`；`oam(ppu)`；`strict = false` 時只回報、`true` 時 throw；`NES.Lint.magenta`（違規像素改畫洋紅的開關）。
- `NES.APU`（apu.js）：`create({sampleRate: 44100})` → `apu`：`write(addr, val)`（$4000~$4017 語意）、`tick()` 每幀（內含 240Hz frame counter 4 次）、`render(nSamples)` → Float32Array（離線）、`connect(audioContext)` 即時播放、`mix()` 用非線性公式（研究 06 §1）。
- `NES.Music`（music.js）：song 格式寫在檔頭（pattern 陣列、每列 = 1 幀或 speed 幀、指令：note/inst/vol/arp/vib/duty/stop）；`play(song, {loop})`、`stop()`、`sfx(name, {priority, channels})`（搶聲道：優先權高者佔用，結束後音樂復原）、`tick()` 每幀（由遊戲 update 呼叫）、`define(name, sfxData)`。
- `NES.nes.js`（tools agent）：`NES.VERSION`、`NES.boot({canvas, game})`；`?debug=1` → `window.__nes = {step(n), press(mask, n), state(), frame(), lint(), stats()}`。
- 除錯 / 測試慣例同卡比：`tools/shot.py --script "press right 40; tap a 1; step 10" --out shots/agent_x/foo.png`；每個 agent 截圖存 `shots/agent_<名>/`（shots/ 不進 git，記得加 .gitignore）。

---
# R2 《星塵巡航艦》— 宇宙巡航艦風格橫向射擊（2026-09-19 開工）
使用者需求（2026-09-19 更正）：**紅白機專案不限一款遊戲**——深入研究多款紅白機經典並各自實作，共用 engine/；本輪**新增**一款 **宇宙巡航艦（Gradius）** 風格橫向射擊（沙羅曼蛇 / Life Force 是不同續作，資料要分清楚），先資料整理、同步開發；**星塵勇者（平台）R2 同時進行**（見下方「R2b」）。內容一律原創，只借鑑機制與手感數字。

## 總控已做骨架（勿重做）
- 入口 `cruiser.html`（`game.html` 是 demo）；腳本順序：engine 契約順序（**新增 `engine/shmup.js` 在 nes.js 之前**）→ `games/cruiser/chr_ship.js → chr_world.js → song.js → ship.js → enemies.js → boss.js → stage1.js → main.js`（最後一檔設 `window.GAME`）。
- `tools/shot.py --url cruiser.html ...`（相對路徑已支援）；`tools/build.py --src cruiser.html` → `dist/星塵巡航艦.html`；`run_all.sh` 會自動跑 `games/*/test_*.py`。
- `engine/shmup.js` 目前是空骨架，engine agent 整檔重寫。

## API 契約（各 agent 平行依據；異動寫在 PROGRESS 自己區段「契約異動」，由總控整合）
全域 `window.CR`（cruiser 命名空間），座標一律 **像素整數**（精靈 x 0..255、y 0..239），內部速度用 `NES.FX` 定點數（8.8）或 1/16 px 子像素，遊戲物件對外暴露整數 `x, y, w, h`（碰撞框左上 + 寬高，**碰撞框比精靈小**：船 12×6、敵 12×12、子彈 4×4）。

### engine/shmup.js（engine agent）— `NES.SH`
| 成員 | 簽章 | 說明 |
|---|---|---|
| `NES.SH.SIN[256]` / `COS[256]` | `Int16Array`，8.8 定點（256 = 1.0） | 角度 0..255 = 一圈；`NES.SH.atan2(dy, dx) → 0..255`（查表，不用 Math.atan2） |
| `NES.SH.aim(sx, sy, tx, ty, speed88)` | `→ {vx, vy}`（8.8） | 瞄準射擊速度向量；速度單位 px/幀 ×256 |
| `NES.SH.aabb(a, b)` | `({x,y,w,h},{x,y,w,h}) → boolean` | 整數 AABB |
| `NES.SH.Pool(n, factory)` | `→ {alloc() → obj\|null, free(obj), each(fn), count, items}` | 固定大小物件池（無 GC）；alloc 失敗回 null（NES 風：沒槽就不生成） |
| `NES.SH.OAM(ppu, {reserve})` | `→ {begin(), add({x,y,tile,pal,flipH,flipV,behind,prio}), end()}` | 每幀精靈配置：`begin()` 清、`add` 收集（`prio` 0 最高：船 / 選項 / 自機彈 → 敵彈 → 敵 → 爆炸）、`end()` 依 prio 排序寫進 OAM 0..63，**同 prio 之間每幀輪替起點**（軟體 sprite cycling，`ppu.flickerStep = 0`）；超過 64 的丟棄並計 `dropped`。y ≥ 240 或 x 超界的自動略過 |
| `NES.SH.Scroller(ppu, {nt: 2, cols, tileAt(col,row), attrAt(col16,row16)})` | `→ {update(camX), reset(camX)}` | 水平捲動名稱表串流：每幀 `update(camX)` 只寫新露出的那一欄（30 格 + 屬性 ≤ 45 byte，符合 160 預算）+ `ppu.scroll`；`reset` 一次補滿兩張名稱表（在 rendering 關閉 / init 時） |
| `NES.SH.Spawner(table)` | `table: [{col, fn}]`（col = 關卡欄，遞增） `→ {update(camCol, ctx), reset()}` | camCol 前進到 col 時呼叫 `fn(ctx)`；倒退不重觸發 |
| `NES.SH.Timer` | 小工具：`every(n, frames)` 之類可有可無 | |
測試 `tools/test_shmup.py`：SIN/COS 誤差、atan2 八方 ±1、aim 速度長度、Pool 滿了回 null、OAM 排序 / 輪替 / 丟棄、Scroller 每幀寫入 byte ≤ 45 且 200 幀後名稱表內容與 `tileAt` 一致、Spawner 單次觸發。

### games/cruiser（ship agent：chr_ship.js、ship.js、main.js、test_cruiser.py）
- **CHR**：精靈圖樣表 1 的磚 **0..127 由 chr_ship.js 定義**（船 16×8 兩幀、選項 8×8 光球 2 幀、自機彈 / 雙向彈 / 雷射段 / 飛彈、爆炸 4 幀、能量膠囊 2 幀、護盾），`CR.SPR_SHIP = { name: rows }`；**128..255 由 chr_world.js**（敵人 / 魔王），`CR.SPR_WORLD`。背景圖樣表 0：**0..63 HUD / 字型**（chr_ship.js，可用 `NES.CHR.DEMO.text` 的字型磚複製）、**64..255 地形**（chr_world.js，`CR.BG_WORLD`）。main.js `init` 把兩邊合併：`NES.CHR.bank('cr_spr', Object.assign({}, CR.SPR_SHIP, CR.SPR_WORLD))`，磚名以 `S_` / `W_` 前綴避免衝突；**索引由 bank 順序決定，各自不要假設固定數字，用 `bank.index(name)`**。8×8 精靈模式（船 16×8 = 2 顆精靈）。
- **調色盤**：精靈 0 = 船 / 選項（藍白橘），1 = 自機彈 / 雷射（白黃），2 = 敵人 A（stage 用），3 = 敵人 B / 魔王（stage 用）；背景 0 = HUD，1..3 = 地形（stage 用）。底色 `$0F`。
- **HUD**：畫面**下方 32 線**（split，掃描線 208 起）：第 1 行 `1P 0000000  HI 0000000`、第 2 行能量表 `SPEED MISSILE DOUBLE LASER OPTION ?`（目前選中反白 = 用屬性表換調色盤或用不同磚），第 3 行剩餘船數。**遊戲區 = 0..207 線**。
- **船（Gradius 手感）**：`CR.ship = { x, y, w:12, h:6, alive, speed(1..5), power:{missile,double,laser,option:0..2,shield}, gauge:0..6, shots:[{x,y,w,h,alive,dmg,kind}], options:[{x,y}], invul, lives, score, hi }`。速度等級 1 = 1.5 px/f … 5 = 3.5（研究整理後可調）；自機彈同時 ≤ 2 發（雷射為連續段、每段 1 顆精靈、最長 4 段）、飛彈斜下落地後沿地面滾；DOUBLE = 前 + 斜上 45°（與雷射互斥）；OPTION 沿船的軌跡延遲跟隨（環形歷史緩衝 64 筆，每個 option 延遲 16 幀）；膠囊撿一顆 gauge+1，B 鍵啟用當前格（Gradius 規則：格 1 SPEED、2 MISSILE、3 DOUBLE、4 LASER、5 OPTION、6 ? = 護盾）；死亡 → 失去全部強化、回上一個檢查點（`CR.stage.checkpoint(camX)`），剩餘船 -1；0 船 → GAME OVER 畫面。
- **main.js**：`window.GAME = {init, update, draw, state}`；模式 title → play → dead → gameover；每幀順序：讀輸入 → 船 / 選項 / 自機彈 → `CR.stage.update(g)` → 碰撞（自機彈 × 敵：`NES.SH.aabb`，命中呼 `enemy.hit(dmg)`；敵 / 敵彈 / 地形 × 船：船 `die()`）→ 撿膠囊 → HUD → `nes.music.tick()`；`draw`：`NES.SH.OAM` begin / add（船 prio 0、選項 0、自機彈 1、敵彈 2、敵 3、爆炸 4）/ end，`CR.stage.draw(oam)` 由 stage 自己 add；`state()` 回 `{mode, x, y, speed, gauge, power, lives, score, camX, enemies, shots, stage}`。
- **test_cruiser.py**：Playwright 開 `cruiser.html?debug=1&scale=1&mute=1`，用 `__nes.step / inject / state`：船移動速度 ±0.1 px、自機彈上限、膠囊 → gauge、B 啟用 → speed 升、option 跟隨延遲 16 幀、死亡回檢查點且強化歸零、HUD 磚正確、lint（同屏 ≤ 25 色、每線 8 精靈由 OAM 輪替處理）。**不要**在 test 裡依賴 stage 的具體敵人位置（用 `CR.stage.spawnTest && CR.stage.spawnTest(kind, x, y)` 生成，stage agent 提供）。

### games/cruiser（stage agent：chr_world.js、enemies.js、boss.js、stage1.js、test_stage1.py）
- `CR.stage`（stage1.js 建立）：`{ init(ppu), update(g), draw(oam), checkpoint(camX) → 檢查點 camX, restart(camX), enemies: Pool, bullets: Pool, capsules: Pool, camX, speed(px/f 8.8，預設 1.0), length(欄數), bossActive, cleared, spawnTest(kind, x, y) }`。地形：原創「小行星帶 → 星際要塞內部」12 畫面寬（384 欄）、有天花板 / 地板凸起（`solidAt(x, y) → boolean` 給 main 判船撞地形、給飛彈滾地）、用 `NES.SH.Scroller`；捲動用 `NES.SH.Spawner` 表生怪。
- 敵人（enemies.js，`CR.Enemies`）：至少 4 種原創：① 編隊 5 隻蛇行小蜂（全滅掉膠囊）② 地面砲台（貼地板 / 天花板，瞄準射擊 `NES.SH.aim`）③ 之字型飛行體 ④ 直衝硬殼（hp 3）；每隻 `{x,y,w,h,alive,hp,score,hit(dmg),kill()}`，死亡 → 爆炸（4 幀）+ 依旗標掉膠囊；敵彈 4×4 直線。精靈磚 `CR.SPR_WORLD`（前綴 `W_`）。
- 魔王（boss.js，`CR.Boss`）：原創「核心要塞」48×48（多顆精靈拼、可用 8×8 + 背景磚組合避免每線 > 8）：外殼板 4 片先打（各 hp 8）→ 核心露出（hp 16）→ 三連雷射掃射 + 環形彈；死亡大爆炸、關卡 `cleared=true` → main 顯示 STAGE CLEAR。
- **test_stage1.py**：Scroller 400 幀 lint 綠、Spawner 出怪數、編隊全滅掉膠囊、砲台瞄準方向、魔王三階段 hp、`solidAt` 與名稱表一致、每幀名稱表寫入 ≤ 160 byte（`__nes.stats().budget.over === 0`）。

### games/cruiser/song.js + engine/music.js（audio agent）
- `CR.Audio = { init(nes), play(key), sfx(name), tick(nes) }`；曲：`stage1`（原創，宇宙巡航艦式：方波琶音主旋律 + 三角波走低音 + 雜訊鼓，含回音軌 detune）、`boss`、`clear`（過關 jingle）、`gameover`、`title`；音效：`shot`、`laser`、`missile`、`hit`、`explode`、`capsule`、`powerup`、`die`、`extend`（搶聲道優先權表）。
- engine/music.js 補 **滑音 / detune（QA R1 P2-7 / X15）**：效果欄 `slide`、`detune` 至少一種，供回音軌用；`tools/test_apu.py` 補測；`tools/apu_render.py` 離線渲染每首 10 秒 + 頻譜檢查只含五聲道。

### 資料整理（research agents）
- **research-gradius**：`docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md`：系列史（1985 街機 Gradius → 1986 FC 宇宙巡航艦；1986 街機沙羅曼蛇 → 1987 FC 沙羅曼蛇；Life Force 差異；台灣卡帶稱呼「沙羅曼蛇」的混用）、**FC 版技術規格**（Mapper、精靈閃爍策略、捲動、HUD）、能量表系統完整規則（每格內容、順序、? 的護盾、速度上限）、Option 跟隨演算法（位置歷史緩衝）、武器（雙向 / 雷射 / 飛彈）行為與傷害、敵人 / 編隊 / 膠囊規則（紅色編隊全滅掉膠囊、藍膠囊清屏）、魔王 Big Core 結構、關卡構成與檢查點 / 復活制度、難度 rank、隱藏要素（Konami 指令）、沙羅曼蛇差異（直向關、雙人、掉落式強化、生命制 vs 檢查點）；每個數字標 [源]/[推論]，來源網址清單。**手感數字表**（船速各級 px/幀、子彈速度、捲動速度）盡量找反組譯或幀計數來源，找不到標 [推論] 並給估計法。
- **research-shmup**：`docs/research/11_橫向射擊設計與技術.md`：NES 橫向射擊實作技術（OAM 分配與優先權、每線 8 精靈的閃爍策略、子彈池上限、瞄準查表、名稱表欄串流、以捲動位置為鍵的出怪表、碰撞框縮小原則、檢查點 / 復活平衡、rank 難度、魔王模式設計、音樂技法：回音軌 / 琶音 / 雜訊鼓）、同類作品對照表（Gradius / 沙羅曼蛇 / R-Type 移植 / 超惑星戰記 / 太空戰士 Abadox 等，機制對照非內容）、原創設計建議清單（給本專案：敵人 8 種原型、魔王 3 種原型、關卡節奏曲線）。完成後跑 `../卡比之星/.venv/bin/python tools/build_html.py` 更新 index.html，並把兩份新文件加進 `README.md` 目錄（research-gradius 不跑 build_html，避免撞檔）。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| research-gradius | docs/research/03_經典遊戲深度解析/16_宇宙巡航艦_沙羅曼蛇.md | 見上 |
| research-shmup | docs/research/11_橫向射擊設計與技術.md、README.md（目錄）、index.html（build_html 產物） | 見上 |
| engine | engine/shmup.js、tools/test_shmup.py、docs/ENGINE_API.md（新增 §15 NES.SH） | 見上 |
| ship | games/cruiser/chr_ship.js、ship.js、main.js、test_cruiser.py | 見上 |
| stage | games/cruiser/chr_world.js、enemies.js、boss.js、stage1.js、test_stage1.py | 見上 |
| audio | games/cruiser/song.js、engine/music.js、tools/test_apu.py、tools/apu_render.py | 見上 |
| qa2（第二波，總控派）| docs/QA_REPORT.md | run_all、lint、手感對照研究表、通關機器人、截圖 |

---
# R2b 《星塵勇者》W1 — 平台動作第一世界（2026-09-19 與 R2 同步開工）
依 PLAN §4 R2：主角完整狀態機、碰撞（斜坡可選）、鏡頭雙向鎖、W1 四關 + 3 種敵人 + 1 魔王、手感測試 ±1 幀、W1 機器人通關。`games/demo` 維持測試房不動；正式遊戲放 **`games/star/`**（全域 `ST`），入口 **`star.html`**（總控已建，腳本順序：engine 契約順序 → `games/star/chr_hero.js → chr_world.js → song.js → hero.js → enemies.js → boss.js → levels_w1.js → main.js`）；`tools/shot.py --url star.html`、`tools/build.py --src star.html` → `dist/星塵勇者.html`（`game.html` 的 demo 改輸出 `dist/星塵測試室.html`）。可直接用 `NES.SH.Scroller / Spawner / OAM / aabb`（engine agent 本輪同時在寫，簽章見 R2 契約；空殼時自備 fallback 並註明）。

## 契約
- **CHR**：精靈表 1 磚 0..127 `ST.SPR_HERO`（`H_` 前綴：主角 16×24 走 3 幀 / 跳 / 蹲 / 滑 / 受傷 / 死亡，8×16 模式、`tile16` 配對、`oam16` 規則）由 star-hero；128..255 `ST.SPR_WORLD`（`W_`：敵 3 種各 2 幀、魔王 32×32、道具、粒子）由 star-world；背景表 0：0..63 HUD 字型（star-hero，可複製 DEMO 字型磚）、64..255 地形 `ST.BG_WORLD`（star-world）。main.js init 合併成 `st_spr` / `st_bg`，索引用 `bank.index(name)`。
- **調色盤**：精靈 0 主角、1 道具 / 粒子、2 / 3 敵人 / 魔王；背景 0 HUD、1..3 地形。HUD 在**上方 32 線**（同 demo `split(32)`）。
- **關卡**（star-world，`levels_w1.js`）：`ST.LEVELS['1-1'..'1-4']` 各 `{ cols, tileAt(col,row), attrAt(c16,r16), start:{x,y}, goal:{col}, checkpoints:[col], spawns:[{col, kind, x, y}], theme:'ground'|'cave'|'sky'|'castle', music }`；磚語意表 `ST.TILE = { EMPTY, GROUND, BRICK, QBLOCK, USED, PLATFORM(單向), SPIKE, PIPE, COIN, GOAL, LAVA, SLOPE_L, SLOPE_R(可選) }` + `ST.solidKind(tile) → 'solid'|'oneway'|'hurt'|'none'|'slopeL'|'slopeR'`；地圖用壓縮字串 / RLE，四關：1-1 草原教學（走跳、金幣、? 磚）、1-2 洞窟（狹路、尖刺、單向平台）、1-3 天空（浮台、飛行敵）、1-4 城堡（熔岩、魔王）；每關 8~16 畫面寬。
- **主角**（star-hero，`hero.js`）：`ST.hero = { x, y, w:12, h:22, vx, vy, state:'idle|walk|run|jump|fall|crouch|slide|hurt|dead', facing, onGround, inv, coins, lives, score, power }`；物理全走 `NES.FX.SMB`（走 / 跑 / 加速表 / 轉身 / 雙重力跳 / 首幀半格重力）；B 跑（P 表可選）；↓ 蹲（碰撞框 12×14）；斜坡上蹲 = 滑行（有斜坡才做）；受傷（無敵 120 幀閃爍、擊退）；死亡（跳起後落出畫面 → 回檢查點、lives-1；0 → GAME OVER）；踩敵（回彈 -3）；金幣 100 → +1 up；? 磚頂出金幣 / 道具；GOAL 觸碰 → 結算 → 下一關。
- **鏡頭**（star-hero，main.js）：雙向鎖（往右推進 40% 觸發、往左可回捲但不越過檢查點左緣可選）、垂直固定；名稱表欄串流用 `NES.SH.Scroller`（左右都要能補欄）。
- **敵人**（star-world，`enemies.js`）：3 種原創：① `roller` 岩球（走路、撞牆轉向、可踩）② `bouncer` 彈跳球（固定節奏跳、踩了停 1 秒再彈）③ `flyer` 飛行體（正弦、不可踩需跳過）；`{x,y,w,h,alive,kind,hit(),stompable}`；魔王（`boss.js`）「鐵鎚王」32×32：跳躍 + 丟錘（拋物線）、踩頭 3 次或斧頭機關；打贏 → 城堡結算。
- **音樂**（star-audio，`games/star/song.js`）：`ST.Audio = { init, play(key), sfx(name), tick }`；曲：ground / cave / sky / castle / boss / clear / death / gameover；音效：jump / stomp / coin / powerup / hurt / bump / goal。**只能改 song.js**（engine/music.js 屬 R2 audio agent）。
- **測試**：`games/star/test_star.py`（star-hero）：手感 ±1 幀對照 `docs/research/03_經典遊戲深度解析/01_超級瑪利歐兄弟.md` 的常數表（靜止→全速幀數、4 格 / 5 格跳高度、跑跳距離、無敵幀）、狀態機轉移、單向平台、尖刺、死亡回檢查點、金幣 / ? 磚、鏡頭雙向、預算 over=0、lint；`games/star/test_w1.py`（star-world）：四關 tileAt 合法、每關可達性（起點到 GOAL 存在跳躍可達路徑：用簡單 BFS 以 4 格跳 / 5 格距離估）、敵人行為、魔王階段、attr / 25 色 lint。
- **機器人**（star-hero，`tools/playthrough_star.py`）：`--level 1-1`，貪婪策略（向右、前方有牆 / 坑 / 敵人就跳，卡住回退重試，種子 RNG），四關都要 cleared，印 frames / deaths；被 qa2 與 run_all 使用。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| star-hero | games/star/chr_hero.js、hero.js、main.js、test_star.py、tools/playthrough_star.py | 主角狀態機 + 物理 + 鏡頭 + HUD + 主程式 + 手感測試 + 機器人 |
| star-world | games/star/chr_world.js、levels_w1.js、enemies.js、boss.js、test_w1.py | W1 四關地圖與磚語意、3 敵、魔王、可達性測試 |
| star-audio | games/star/song.js | 8 曲 + 7 音效（原創） |

---
# R3 cruiser 擴關 —— 《星塵巡航艦》六關（2026-09-25 開工）
使用者需求（2026-09-25）：「**紅白機的巡航艦需要大擴關卡，關卡太少了**」。
R2 只有關卡 1（空戰段 → 小行星帶 → 星際要塞 → 核心要塞，2816 px）。R3 做到 **6 關**（原作 FC 七關的節奏，
研究 16 §7-2），每關**不同地形主題、不同敵人組合、不同魔王**，全破後進**第二輪（loop）**難度提升。

## 架構（R2 的 stage1.js 拆成資料 + 執行）
| 檔 | 內容 |
|---|---|
| `games/cruiser/stages.js` | **只有資料**：`CR.STAGES[1..6]`（地形 RLE / 主題磚對應 / 大隕石 / 難度參數 / 出怪表 / 魔王 key / 曲目 key）+ 共用出怪骨架 `CR.StageData.buildWaves` |
| `games/cruiser/stage_runtime.js` | **執行層**（取代 stage1.js）：`CR.stage` 介面與 R2 契約**一字未改**，只多 `load(n)` / `index` / `setLoop(n)` / `escapeT` |
| `games/cruiser/boss.js` | 關卡 1 魔王「核心要塞」（不動）＋ 魔王登記處 `CR.Bosses`（`CR.Bosses.core`） |
| `games/cruiser/bosses.js` | 參數化魔王機 `makeBoss(cfg)` + 關卡 2..6 的五隻魔王（介面與 boss.js 相同） |
| `games/cruiser/enemies.js` | 擴充 `KINDS`（+10 種）與 **每關難度參數表** `setParams()` |
| `games/cruiser/chr_world.js` | +51 精靈磚 / +9 背景磚、**每關調色盤表 `CR.STAGE_PAL`**（結構磚六關共用，只換顏色） |
| `games/cruiser/main.js` | `stageclear` → 分數結算 → `load(n+1)`；第 6 關破 → `ending` → 第二輪；`?stage=N`；HUD 關卡編號；脫出倒數 |

## 六關規格（實作值）
| 關 | 主題 | 長度 px | 欄 | 通道下限 | 魔王（總血量） | 新要素 |
|---|---|---|---|---|---|---|
| 1 | ASTEROID BELT 小行星帶 → 星際要塞 | 2816 | 384 | 18 列 | CORE FORTRESS（24） | R2 原封不動（機器人 0 死 6455 幀是回歸基準） |
| 2 | VOLCANO 火山星 / 熔岩 | 2560 | 352 | 18 列 | EYE FORTRESS（20） | 火山彈（拋物線、不可破壞）、貼牆爬行砲 |
| 3 | STONEHENGE 石陣 / 巨石迷宮 | 2816 | 384 | 18 列 | TWIN MOAI（20，兩顆頭） | 可破壞岩壁、石像（只有嘴可打）、環狀彈 |
| 4 | INVERTED WORLD 倒立世界 | 2688 | 368 | 17 列 | MIRROR CORE（24，上下對稱雙核） | 上下鏡像地形 + **減速段**、分裂體、追蹤導彈 |
| 5 | BIO CAVERN 生物洞窟 | 2944 | 400 | 17 列 | BIO CORE（26） | 伸縮觸手（敵人物件，非磚）、孵化卵 |
| 6 | MOTHER SHIP 敵母艦最終要塞 | 3072 | 416 | 16 列 | MOTHER BRAIN（40） | 四方砲台、三連雷射、**脫出倒數** → ENDING → 第二輪 |

- 檢查點一律**每 512 px**；魔王復活點 = `camMax - 56`（死在魔王戰只要空捲 112 幀）。
- 安全規則（fix2 訂的，六關通用，`buildWaves` 會自動過濾）：①檢查點後 22 欄內不放固定砲
  ②檢查點後 14 欄內至少一隻紅色單體（1 發必掉膠囊）。檢查點 0 = 開局，不適用②。
- 難度曲線寫成**一張參數表**（`stages.js` 的 `params`）：敵彈倍率 1.00→1.30、砲台週期 90→88、
  同屏上限 10→14；第二輪起 runtime 再加成（彈速 +24/輪、週期 −10/輪，有上下限）。
- **CHR 不做 bank 切換**：結構磚（牆 / 地板 / 天花板 / 管線）六關共用，主題只靠 **`CR.STAGE_PAL` 換調色盤**
  + 每關 1~2 張 signature 磚（FC 時代標準手法）。用量：精靈 103/128、背景 42/192。

## 驗收
- `games/cruiser/test_stage1.py` 174 項全綠（介面沒變）、`test_cruiser.py` 292 項、
  **新增 `games/cruiser/test_stages.py` 217 項**（六關資料 / 通道寬度 / 出怪表安全規則 / 10 種新敵人 /
  5 隻新魔王 / 難度曲線 / 切關 / ENDING / 第二輪 / `?stage=` / 每關三張截圖 + lint）。
- `tools/playthrough_cruiser.py` 加 `--stage N` / `--all` / `--chain` / `--assist`；
  六關**純實力（不用密技）各自 0 死通關**，`--chain` 一口氣 1→6 → ENDING 也 0 死。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| cruiser-stages | games/cruiser/{stages,stage_runtime,bosses,boss,enemies,chr_world,main}.js、test_cruiser.py、test_stages.py、cruiser.html、tools/playthrough_cruiser.py | 見上（**不動 song.js**：那是 cruiser-song agent 的） |
| cruiser-song | games/cruiser/song.js | `stage2`~`stage6`、`boss_final`、`ending` 七首新曲 |

---

# R3 star W2 —《星塵勇者》世界 2「熔岩礦坑」（2026-09-25）

依 `docs/PLAN.md` §4「R3 內容 A」的 W2 部分：四關 + 世界 2 魔王 + 新敵 + 新道具 + 世界選擇，
並把 R2b / R2c 留下的三個待辦收掉（無敵星未放進關卡、旗桿下滑演出、一鍵無敵擋不住熔岩 / 掉坑）。

## 主題與節奏
| 關 | 主題 | 欄（畫面） | 檢查點 | 新機制 / 壓力 |
|---|---|---|---|---|
| 2-1 | mine 礦坑入口 | 320（10） | 102、190 | **教學關**：崩塌礦石磚 → 蒸氣彈簧 → 礦車升降板，依序各給一次安全示範 |
| 2-2 | mine 崩落礦道 | 320（10） | 100、196 | **節奏關**：崩塌磚連段 + 彈簧接力 + 蝙蝠；天花板高低起伏 |
| 2-3 | magma 熔岩豎坑 | 288（9） | 94、190 | **機關關**：垂直升降板塔 + 間歇泉 + 熔岩坑 |
| 2-4 | forge 熔爐要塞 | 256（8） | 100、172 | **魔王前哨**（護甲礦兵密集）+ 魔王「熔心巨像」 |

- 長度 / 檢查點數 / 時限（300）/ 起點安全區沿用 W1 慣例；坑與熔岩帶一律 ≤ 8 欄、牆高 ≤ 3 列。
- **每個機關都有純地形的備援路線**（友善版）：不靠升降板 / 彈簧也走得完，機關是「比較輕鬆 / 拿得到金幣」那條。

## 四個新機制（全部是**關卡資料裡的物件**，不是硬編碼）
| 機制 | 資料 | 行為 |
|---|---|---|
| 礦車升降板 mover | `level.movers[] = {c,r,w,axis:'x'|'y',range,period,phase}` | 位置是**時間的三角波純函式** ⇒ 可預測、可重現，通關機器人能往前推演；單向平台語意，站上去被水平帶著走 |
| 崩塌礦石磚 crumble | 磚語意 `ST.TILE.CRUMBLE` | 踩住 36 幀後碎掉（最後 12 幀抖動預警）、240 幀後復原；碎掉只重寫 1 byte 名稱表 |
| 蒸氣彈簧 spring | 磚語意 `ST.TILE.SPRING` | 站上去以 `Hero.launch(−5 px/幀 + 固定小重力)` 彈高 100 px（≈12.5 格），高度與有沒有按 A 無關 |
| 熔岩間歇泉 geyser | `level.geysers[] = {c,r,h,period,on,phase}` | 週期噴火柱（噴發前 24 幀冒小火預警），也是時間的純函式 |

## 新敵 / 魔王 / 道具
- 敵人（`enemies_w2.js`，走新的 `ST.Enemies.register()` 登記表，W1 三種一行未動）：
  ④ `bat` 礦坑蝙蝠（倒掛 → 主角進 72 px 才醒 → 俯衝後平飛，可踩）
  ⑤ `armor` 護甲礦兵（走路 0.5 px/幀、坑邊轉向、**不可踩**，逼玩家繞路或吃無敵星）
  ⑥ `spitter` 岩漿噴吐者（固定不動，每 100 幀朝主角吐拋物線火球，可踩）＋ ⑦ `fire` 火球（一次性投射物）
- 魔王（`boss_w2.js`，`ST.BossW2`，介面同 `ST.Boss`）：**熔心巨像** 32×32、5 格血、**三階段**
  （walk → jump → slam 落地兩道衝擊波 → [階段 2 起] spit 火球 → rest 弱點窗口；血量越低走得越快、休息越短）。
- 道具：**無敵星**（`level.items[] = {c,r,kind:'star'}`）→ `hero.star` 旗標 480 幀：熔岩 / 尖刺 / 火柱不致命、
  撞到敵人直接打倒、掉坑被拉回檢查點（不扣命）。一鍵密技（C / ★密技）現在也帶這個旗標。

## 檔案所有權（本輪）
| agent | 擁有檔案 | 內容 |
|---|---|---|
| star-w2 | `games/star/{chr_w2,levels_w2,objects_w2,enemies_w2,boss_w2,song_w2}.js`（新增）、`games/star/{chr_world,hero,enemies,levels_w1,main,song}.js`（擴充）、`star.html`、`tools/playthrough_star.py`、`games/star/test_w2.py`（新增）、`test_star.py` | 見上 |

- `engine/` 一行未改。
- `levels_w1.js` 擴充成「磚語意 + Level 類別 + W1 四關」：新增磚碼 44..55、`ST.LevelKit`（Level / rle /
  `addTheme` / 常數）與 `ST.Levels.register(def)`，讓 `levels_w2.js` 不必複製建圖程式。
- `song.js` 新增 `ST.Audio.BUILD`（Builder / mel / drm / echoOf / stab / hold / INST）、`has(key)`、
  `register(key, song, info)`；`play(key)` 行為**不變**（未知 key 仍 warn + 回 false），
  缺鍵退回既有曲由 `main.js` 的 `songKey()` 負責（契約同 cruiser）。

## 驗收
- `games/star/test_w2.py` **187 項**（CHR 容量 / 新磚語意 / 三主題 / 四關資料 / 可達性 BFS（含升降板）/
  坑寬・危險帶・牆高 / 機關純函式與行為 / 三新敵 + 火球 / 魔王三階段可擊破 / 四首新曲 / lint /
  真頁機關會動 + 無敵星 + 旗桿演出 + 每關 3 張截圖）。
- `games/star/test_star.py` 226 → **249 項**（⑪ R3 組 23 項：旗桿下滑演出、無敵星旗標、
  一鍵密技擋熔岩 / 掉坑、標題世界選擇、破完 1-4 自動接 2-1；並把「破關畫面」改成驗最後一關 2-4）。
- `games/star/test_w1.py` 177 項不變全綠。
- `tools/playthrough_star.py` 加 `--w2` / `--all8`，模擬器加入升降板與間歇泉的時間預測、
  新增「站在升降板上就別往右跑」的 riding 分支；W1 四關結果與 R2c **完全相同**。

---

# R4 star W4 —《星塵勇者》世界 4「機械要塞」（2026-10-08）

依 `docs/R4_BRIEF.md` 任務卡 **F4-2**：四關 + 世界 4 魔王 + 三種新敵 + 三個新機制 + 新曲 + 原創 CHR，
外加「崩塌磚視覺抖動」與 `NES.SH.OAM` 的 16×16 便利 add。

## 主題與節奏
| 關 | 主題 | 欄（畫面） | 檢查點 | 新機制 / 壓力 |
|---|---|---|---|---|
| 4-1 | works 輸入樓層 | 320（10） | 112、196 | **教學關**：順向輸送帶 → 逆向輸送帶 → 齒輪升降台 → 雷射柵欄，依序各給一次安全示範 |
| 4-2 | works 傳送帶迷宮 | 320（10） | 100、212 | **節奏關**：順 / 逆帶接力 + 崩塌鋼板連段 + 升降台 + 無人機；天花板高低起伏 |
| 4-3 | core 核心反應層 | 288（9） | 96、196 | **機關關**：雷射節奏 + 垂直升降台塔 + 電漿池（LAVA）+ 重裝守衛 |
| 4-4 | citadel 要塞核心 | 256（8） | 100、172 | **魔王前哨**（守衛走廊）+ 魔王「核心守護者」 |

- 長度 / 檢查點數 / 時限（300）/ 起點安全區沿用 W1・W2 慣例；坑與電漿帶一律 ≤ 8 欄、牆高 ≤ 3 列。
- **每個機關都有純地形的備援路線**（友善版）：不靠輸送帶 / 升降台 / 彈簧也走得完。
- 逆向輸送帶一律 ≤ 12 欄：跑速 2.5 − 帶速 0.5 = 2.0 px/幀 **仍然前進**，不可能卡死。

## 三個新機制（全部是**關卡資料裡的物件**，不是硬編碼）
| 機制 | 資料 | 行為 |
|---|---|---|
| 輸送帶 belt | `level.belts[] = {c, r, w, dir}` | 站在第 r 列帶面上 → 每幀 ±0.5 px（**位置的純函式**）；撞牆不推。外觀是背景磚 `TILE.BRIDGE`（works 主題 → `BG_BELT`），資料與磚逐欄一致（測試會比對） |
| 雷射柵欄 laser | `level.lasers[] = {c, r, h, period, on, phase}` | 週期開關的垂直光柵（**時間的純函式**），開啟前 24 幀在發射口閃預警；碰到 = 受傷，無敵星期間無效 |
| 齒輪升降台 lift | `level.lifts[] = {c, r, w, axis:'x'\|'y', range, period, phase}` | 三角波純函式、單向平台語意、站上去被水平帶著走（`hero.onMover`） |

> 三者都掛在 `ST.ObjectsW4`（`init / seek / update / draw` 介面同 `ST.Objects`），
> `main.js` 只插入四行呼叫。純函式出口：`now() / liftTops(t) / hazardHit(x,y,w,h,t) / convAt(x,row)`。

## 新敵 / 魔王
- 敵人（`enemies_w4.js`，走 `ST.Enemies.register()`，W1 / W2 的敵人一行未動；**繪製一律用 `oam.add16`**）：
  ⑧ `drone` 巡邏無人機（生成點 ±range 來回 + 正弦浮動 ±8 px，**可踩**）
  ⑨ `guard` 重裝守衛（護罩關閉 150 幀**不可踩**、排氣窗開啟 60 幀**可踩**，關閉前 20 幀閃爍預警
     ＝ 研究 04 §2 那類敵人的**第二解法：等時機**）
  ⑩ `sentry` 螺栓砲塔（固定，每 90 幀射水平螺栓，射前 20 幀亮砲口）＋ ⑪ `bolt` 螺栓彈（一次性）
- 魔王（`boss_w4.js`，`ST.BossW4`，介面同 `ST.Boss` / `ST.BossW2`）：**核心守護者** 32×32、5 血、**三階段**
  （walk → jump → slam 放兩顆沿地面滾的齒輪 → [階段 2 起] volley 水平螺栓 → rest 弱點窗口）。
  `level.bossKind = 'guardian'`，`main.js` 依此選模組。

## 精靈 bank 切換（本輪的硬限制與解法）
精靈圖樣表 **256 磚**，R3 結束時已用掉 252（SPR_HERO 66 + SPR_WORLD 116 + SPR_W2 70）。
⇒ 照真機（MMC3）做 **每個世界一張精靈 bank**：
```js
ST.SprBanks.register(4, 'st_spr_w4', ST.SPR_W4);   // chr_w4.js
ST.SprBanks.apply(level);                          // main.js 換關時（W3 / W5 共用這一行）
```
- 新 bank = `SPR_HERO + SPR_WORLD + SPR_WN`，**前 182 磚與主 bank 逐磚相同** ⇒ 主角與 W1 世界精靈
  的索引完全不變（`ST.heroTiles` / `enemies.js` 的快取都還是對的）；`apply()` 另外會重新指一次 `ST.heroTiles`。
- 離開該世界自動指回 `ST.sprBank`；`ppu.render()` 每幀清磚快取 ⇒ 切了立刻生效。
- **之後不要再往 `ST.SPR_WORLD` / `ST.SPR_W2` 加磚**。

## 引擎新 API（`engine/shmup.js`，只插入）
`NES.SH.OAM.add16({x, y, tileL, tileR | tiles:[L,R], pal, prio, flipH, flipV, behind})` /
`push16(x, y, tileL, tileR, pal, prio, flags)`：16×16 精靈（8×16 模式下 = 左右兩個 8×16）的便利 add，
**自己處理 flipH 的「兩塊各自翻 + 左右對調」**；回傳實際收下的塊數 0..2。
文件在 `docs/ENGINE_API.md` §15.4。

## 檔案所有權（本輪）
| agent | 擁有檔案 | 內容 |
|---|---|---|
| star-w4 | `games/star/{chr_w4,objects_w4,enemies_w4,boss_w4,levels_w4,song_w4}.js` + `test_w4.py`（新增）；`engine/shmup.js`、`docs/ENGINE_API.md`、`tools/test_shmup.py`、`games/star/main.js`、`star.html`、`tools/playthrough_star.py`、`games/star/test_star.py`（**只插入 / 不改既有行為**） | 見上 |

## 驗收
- `games/star/test_w4.py` **224 項**（bank 切換與逐名索引對齊 / 三主題 / 四關資料（含「輸送帶資料 vs 磚」
  逐欄比對）/ 可達性 BFS（含升降台）/ 坑寬・危險帶・牆高・安全區 / 三機關的純函式與行為 /
  三新敵 + 螺栓（含守衛弱點窗口）/ 魔王三階段可擊破 / 三首新曲 / lint /
  真頁 bank 切換・輸送帶推人・雷射傷人・升降台載人・**崩塌抖動粒子（4-1 與 2-1 各驗一次）**・
  魔王擊破・標題 SELECT 切 WORLD 4・四關旗桿演出・每關 3 張截圖 + lint）。
- `tools/test_shmup.py` 157 → **168 項**（`add16` / `push16` 11 項）。
- `games/star/{test_w1,test_w2}.py` 177 / 187 項不變全綠；`test_star.py` 249 項全綠
  （「最後一關」偵測改成通用版：4-4 → 3-4 → 2-4 → 1-4）。
- `tools/playthrough_star.py --w4` **四關全部 cleared、deaths = 0**；`--all8` 與 R3 一幀不差。
- `bash tools/run_all.sh` 總結 **PASS**。

# R4 star-meta（F4-3）：世界地圖 / 密碼存檔 / 副武器（2026-10-08 完成）

## 內容
| 系統 | 規格 |
|---|---|
| **世界地圖** | 一個世界一張 **8 × 5 格**節點圖（格 = 4×4 磚 = 32×32 px，對齊 16×16 屬性區塊）。節點照「蛇行」slot 排：關卡（stage 1..4）→ 道具屋 → 支線（stage ≥ 5）。走格子動畫 2 px/幀、已通關節點打勾、鎖住的節點換 pal 2（灰）。**節點來源是 `ST.LEVELS` / `ST.Levels.ids` ⇒ 之後用 `ST.Levels.register` 掛新世界，地圖自動長出來**。原創背景磚 23 個（`ST.BG_MAP`，`M_` 前綴），精靈一磚未加（玩家棋子直接用主角精靈） |
| **密碼存檔** | 10 個字母（字母表 `ABCDEFGHJKLMNPRT`，16 個 = 4 bit/字）＝ 40 bit：通關位元 16（4 世界 × 4 關）／命 4／擁有 2 + 選中 2／分數千位 8／校驗 8。`ST.Password` 是**純函式**（零相依、不碰 DOM / PPU），畫面在 `ST.PasswordUI`。壞碼（長度 / 非法字 / 校驗）一律拒絕 |
| **副武器** | 火球（平拋 2.5 px/幀、射程 ≈ 80 px）／飛鏢（直線 4 px/幀）。**B 按下瞬間**發射（按住 B 仍是跑步 ⇒ 手感不變）、**↓ + B 或 SELECT** 切換、同屏 3 發 / 冷卻 16 幀 / 彈藥有限或無限（道具屋買）。取得：關卡的「指定 ? 磚」或地圖道具屋。**護甲礦兵要 2 發 = 研究 04 §2 的第二解法**；魔王 / 鐵鎚免疫 |

## 入口鍵
標題：`SELECT` 輪替 `WORLD 1 → 2 → … → PASSWORD`、`START` 直接開始（舊行為不變）、
**`UP` 或 `B` 進世界地圖**、選到 `PASSWORD` 時 `START` 進密碼輸入。
地圖：方向鍵走格子、`A` 進關卡 / 開道具屋、`B` 回標題。
密碼畫面：`↑↓` 換字母、`←→` 換字位、`A` 下一位、`START` 確認、`B` / `SELECT` 離開。

## 檔案所有權（本卡）
| agent | 擁有檔案 | 說明 |
|---|---|---|
| star-meta | `games/star/{password,subweapon,worldmap}.js` + `games/star/test_meta.py`（新增）；`games/star/{main,hero,enemies_w2}.js`、`star.html`、`tools/playthrough_star.py`（**只插入**，逐處清單見 `docs/PROGRESS.md`「star-meta（R4）§4」） | `engine/` 未改、`docs/ENGINE_API.md` 不需異動 |

## 驗收
- `games/star/test_meta.py` **150 項**（密碼往返 / 壞碼 150 組替換 ≥ 95% 被擋 / id ↔ 位元 / 地圖版面與解鎖
  四種狀態 / **註冊新世界自動長節點** / 23 磚 CHR 合法 / 標題輪替 / 走格子 10 幀 = 20 px / 道具屋四種購買 +
  金幣不足 / 密碼畫面輸入與壞碼 / 副武器發射・冷卻・切換・彈藥・無限 / **按住 B 跑 60 幀位移與無副武器時相同** /
  護甲礦兵 2 發・一般敵 1 發・魔王免疫 / 隱藏 ? 磚 / 破關密碼 / 舊功能回歸）。
- `games/star/test_star.py` 249 項、`test_w1.py` 177 項、`test_w2.py` 187 項**全綠且一項未改**。
- `tools/playthrough_star.py --all8` 八關全 cleared、frames 與 R3 **一幀不差**；
  新增 `--map`（標題 → 地圖 → 走格子 → 進 1-2 → 通關，`cleared=True deaths=0`）；`--cheat` 37 項全過。
- `bash tools/run_all.sh` 總結 **PASS**。

---

# R4 cruiser —《星塵巡航艦》rank / 第 7 關魔王連戰 / 波動 / 隱藏獎勵 / 結局 + 排行（2026-10-08，卡 F4-4）

R3 做到 6 關 + 第二輪。R4 把「第二輪平衡」補上真正的動態難度，並補齊一款 FC 射擊該有的收尾：
最終關、真最終魔王、新裝備、隱藏要素、結局名單、分數排行。

## 架構（新增 4 支純功能檔，全部零相依、缺席不致命）
| 檔 | 內容 |
|---|---|
| `games/cruiser/rank.js` | `CR.Rank`：rank 0..7 = clamp(火力 + 存活加成 + 輪數加成 − 死亡罰)，每幀重算；效果表（敵彈速 / 砲台週期 / 瞄準發數 / 編隊隻數 / 預判）；`?rank=0` 與 `localStorage.cruiser_rank` 可關 |
| `games/cruiser/bonus.js` | `CR.Bonus`：七關各 1 個隱藏獎勵（擊殺型 4 個 / 位置型 3 個），獎勵 = 1UP 或全消彈 + 5000 分，一局每關 1 次 |
| `games/cruiser/credits.js` | `CR.Credits`：真機式垂直捲動名單（30 列環形緩衝、每 8 px 補 1 列 32 byte、捲動期間 `split(null)`） |
| `games/cruiser/hiscore.js` | `CR.HiScore`：`localStorage.cruiser_scores` 前 10 名 + 3 字母名字輸入（A..Z 與 `.`） |
| `games/cruiser/bosses.js` | 加 `CFGS` / `boost()` / **`makeRush()`** 與 `CR.Bosses.rush`；`makeBoss` 加 `warnFrames` / `beamH`（預設 = R3 行為） |
| `games/cruiser/stages.js` | `CR.STAGE_COUNT` 6 → **7**，新增 `S7`「BOSS RUSH」（純資料） |
| `games/cruiser/ship.js` | 新裝備 **RIPPLE（波動）** + Option 三種編隊（TRAIL / FIXED / ORBIT） |
| `games/cruiser/main.js` | 三個新模式 `credits` / `entry` / `scores`；遊戲中 SELECT = 切編隊；手機「編隊」DOM 鈕 |

## 第 7 關「BOSS RUSH」規格（實作值）
| 項目 | 值 |
|---|---|
| 欄數 / camMax / 通道下限 | 160 欄 / 1024 px / 20 列 |
| 接近段 | 欄 0..127 純星空，13 波補給，**零固定砲**（連戰前要能把能量表湊滿） |
| 連戰室 | 欄 128..159（上下各 2 列） |
| 連戰內容 | 六關魔王強化版（血 ×0.75 / 射速 ×0.9 / 環形彈 ×0.7 / 無追蹤導彈 / 雷射預告 48 幀・判定 4 px）→ **OMEGA I / II / III**（原創真最終魔王三形態，第三形態含脫出倒數 420 幀） |
| 總血量 | **196**（六隻強化版合計 120 + OMEGA 三形態 20 / 18 / 38） |
| 友善版 | 每打掉一隻掉 4 顆膠囊；死亡接關**從打到的那一隻繼續**並再補 4 顆 |
| 除錯入口 | `?stage=7`、`?stage=7&rush=N`（跳到第 N 隻） |

## rank 效果表（一張表，寫在 `rank.js`，不散在程式裡）
| rank | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 敵彈速倍率 | 1.000 | 1.000 | 1.250 | 1.250 | 1.313 | 1.313 | 1.375 | 1.438 |
| 砲台週期倍率 | 1.000 | 1.000 | 1.000 | 0.938 | 0.875 | 0.813 | 0.750 | 0.688 |
| 瞄準砲台發數 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 3 |
| fan 編隊 +n | 0 | 0 | 0 | 0 | +1 | +1 | +2 | +2 |
| 預判射擊 | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |

- rank 0 / 1 全是 1.000 ⇒ **開局與每次復活的手感 = R3**；`turretPeriod()` 的 90 / 130 一個數字沒動。
- **裸機不隨時間升 rank**（存活加成要求 equip ≥ 1）＝ 研究 11 §13.2 的「難度跟著火力走」。
- 出怪表（哪一欄生什麼）永遠不變，rank 只改「同一波 fan 有幾隻」。

## 流程
`STAGE 7 CLEAR` → `ENDING`（R3 畫面不變）→ START → `credits`（名單 + 新曲 `credits`）
→ `entry`（上榜才有的 3 字母輸入）→ `scores`（前 10 名）→ START → **第二輪**。
GAME OVER + START：有上榜才進 `entry`，沒上榜維持 R2 的「直接回標題」；標題 **SELECT** 看榜。

## 驗收
- `games/cruiser/test_r4.py` **115 項**（rank 升降 / 第 7 關資料與 9 隻魔王 / 波動彈道 /
  三種編隊 / 隱藏觸發 / 排行插入與 localStorage / 名單捲動 / 密技仍在 / `draw()` 不拋例外）。
- `test_cruiser.py` 303、`test_stage1.py` **174（一行未改）**、`test_stages.py` 218、`test_song.py` 154。
- `tools/apu_render.py --game cruiser --song credits` 7 項全 PASS。
- `tools/playthrough_cruiser.py`：`--stage 7` 與 `--chain`（七關 → ENDING）**純實力 0 死通關**，
  `--all` 七關全 cleared 0 死；`--norank` 可做 A/B 對照。
- `bash tools/run_all.sh` 總結 PASS。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| cruiser-r4 | `games/cruiser/**`（含 `rank/bonus/credits/hiscore.js`、`test_r4.py`）、`tools/playthrough_cruiser.py`、`cruiser.html`（Edit 插入 script） | 見上（**engine/ 一個字沒動**；手機「編隊」鈕是 cruiser 自己的 DOM 鈕，不是 `NES.Touch` 的第 8 顆鍵） |

---

# R4 star W3 —《星塵勇者》世界 3「霧沼古樹」（2026-10-08，卡 F4-1）

依 `docs/R4_BRIEF.md` F4-1：四關 3-1 ~ 3-4、新敵 3 種 + 魔王（兩條打法）、新機關 ≥ 3、新曲 ≥ 2、
原創 CHR、`?level=3-1`、標題 SELECT 切 WORLD 3、`test_w3.py` ≥ 30 項、機器人 `--w3` 四關 0 死通關。

## 主題與節奏
| 關 | 主題 | 欄（畫面） | 檢查點 | 新機關 / 壓力 |
|---|---|---|---|---|
| 3-1 | swamp 毒沼淺灘（開闊天空 + 霧帶 + 遠樹剪影） | 320（10） | 102、190 | **教學關**：會縮的樹菇 → 孢子雲 → 藤蔓鞦韆，依序各給一次安全示範 |
| 3-2 | swamp 霧中蘆葦道 | 320（10） | 100、196 | **螢火暗區**（140–230 欄：調色盤換暗版 + 螢火繞著主角照明）+ 鬼火 |
| 3-3 | grove 古樹迴廊（樹幹內部） | 288（9） | 100、180 | **機關關**：藤蔓接力 ×3 + 樹菇連段 ×5（垂直取向） |
| 3-4 | hollow 樹心空洞 | 256（8） | 100、172 | **魔王前哨**（荊棘藤走廊）+ 魔王「樹心魔」 |

- 長度 / 檢查點數 / 時限（300）/ 起點安全區沿用 W1 / W2 慣例；毒水坑與無底坑一律 ≤ 8 欄。
- **每個機關都有純地形的備援路線**（友善版）：樹菇 / 藤蔓一律架在實地上方（掉下來只是掉回地面），
  `test_w3.py` ④ 會把樹菇全部拔掉再 BFS 一次驗「不靠機關也走得到旗桿」。

## 四個新機關（全部是**關卡資料裡的物件**，不是硬編碼；走 `ST.Objects` 擴充）
| 機關 | 資料 | 行為 |
|---|---|---|
| 藤蔓鞦韆 vine | `level.vines[] = {c,r,len,range,period,phase}` | 擺角 = 時間的純函式（三角波 + 拋物線 y）；按住 ↑ 抓、按 A 放手（−4.5 px/幀 ≈ 81 px 高 + 帶走水平速度）；放手後 20 幀是「藤蔓衝撞」窗口 |
| 會縮的樹菇 cap | `level.caps[] = {c,r,w,period,on,phase}` | 單向平台，週期 192（在 128 / 不在 64），消失前 20 幀縮小預警；**掛進 `ST.Objects.moverTops(t)`** |
| 孢子雲 spore | `level.spores[] = {c,r,axis,range,period,phase}` | 會移動的危險 16×16；**掛進 `ST.Objects.hazardHit(...)`** |
| 螢火暗區 gloom | `level.glooms[] = {c0,c1,flies}` | 走進去整組調色盤換暗版（`ST.PAL_W3_DARK`）+ 螢火繞著主角；純視覺 |

## 新敵 / 魔王
- 敵人（`enemies_w3.js`，走 `ST.Enemies.register()`，W1 / W2 的敵人一行未動）：
  ⑧ `leaper` 沼蛙（每 110 幀躍一次、39 px 高 / 26 px 遠、預警 20 幀，**可踩**）
  ⑨ `thorn` 荊棘藤（150 幀循環：收起 90 幀可踩 / 伸刺 60 幀不可踩，伸刺前 20 幀閃爍）
  ⑩ `wisp` 鬼火（無視地形、0.3125 px/幀飄向主角 + 正弦上下，**不可踩**）
- 魔王（`boss_w3.js`，`ST.BossW3`，介面同 `ST.Boss`）：**樹心魔** 32×32、5 格血、三階段
  （walk → slam 長根刺（預警 24 幀）→ [階段 2 起] spit 毒果 → open 樹心張開＝弱點窗口）。
  **兩條打法**：① open 時踩樹心 ×5（其餘時間樹皮是護甲，踩了只彈開）② 藤蔓衝撞 ×3（一次 2 格、不必等 open）。

## 檔案所有權（本卡）
| agent | 擁有檔案 | 內容 |
|---|---|---|
| star-w3 | `games/star/{chr_w3,levels_w3,objects_w3,enemies_w3,boss_w3,song_w3}.js`、`games/star/test_w3.py`（皆新增） | 見上 |

- `engine/` 一行未改；W1 / W2 / W4 的程式與資料一行未改。
- 共用檔**只插入**：`main.js` 5 行（WORLD 清單 / 魔王模組 / 魔王重置 / 魔王曲 / BG_W3 合併）、
  `star.html` 6 行 script、`tools/playthrough_star.py`（`LEVELS_W3` / `--w3` / `HAS_OBJ2` 加上 W3 機關）。
- 精靈 CHR 走 F4-2 的 **`ST.SprBanks` 每世界分頁**（`register(3, 'st_spr_w3', SPR_W3)`）：
  `st_spr_w3` = 主角 66 + W1 世界 116 + W3 64 = **246 / 256 磚**，前 182 磚與主 bank 逐名同索引。
- 曲目 `swamp / grove / hollow / boss3` 用 `ST.Audio.BUILD` 註冊；`play(key)` 行為不變。

## 驗收
- `games/star/test_w3.py` **169 項**（CHR 分頁與索引對齊 / 三主題換皮與調色盤 / 四關資料合法性 /
  可達性 BFS（含樹菇，另驗純地形備援）/ 四個機關的純函式與互動 / 三新敵 / 魔王兩條打法 /
  四首新曲 / lint / 真頁機關會動 + 暗區 + 無敵星 + 魔王可擊破 + 旗桿演出 + 標題 WORLD 3）。
- `tools/playthrough_star.py --w3`：3-1 1090 幀 / 3-2 1160 / 3-3 899 / 3-4 1838，**四關 0 死**；
  `--all`（W1 基準）與 R3 **一幀不差**。
- `bash tools/run_all.sh` 總結 PASS；截圖 `shots/agent_w3/` 3 張（樹菇 / 暗區 / 魔王房）。

---
# R4 《星塵機甲》契約 —— 洛克人 2 風格選關動作射擊（2026-10-08 開工，R1 完成）

依 `docs/R4_BRIEF.md` 卡 **F4-5 mech-r1**：第三款新遊戲，全域 **`MG`**、入口 **`mech.html`**、
資料夾 `games/mech/`。規格來源 `docs/research/03_經典遊戲深度解析/03_洛克人2.md`（每條都標章節）。
**內容（名稱 / 美術 / 音樂 / 關卡）全部原創**，只借鑑機制與手感數字。

## 總控骨架（勿重做）
- 入口 `mech.html`，腳本順序 = engine 契約順序 →
  `chr_mech.js → chr_world.js → song.js → weapons.js → hero.js → enemies.js → bosses.js → levels.js → main.js`
  （最後一檔設 `window.GAME`）。
- `tools/build.py --src mech.html` → `dist/星塵機甲.html`；`tools/run_all.sh` 已納入 `build.py --check mech.html`；
  `tools/shot.py --url mech.html --query "stage=frost&room=3"`。
- **engine/ 一行未改**（只用既有的 `NES.FX / PPU / CHR / SH.OAM / SH.Pool / SH.aabb / Touch`）。

## API 契約
| 模組 | 全域 | 內容 |
|---|---|---|
| `chr_mech.js` | `MG.SPR_MECH`（77 磚）/ `MG.BG_FONT`（67 磚）/ `MG.textTiles` | 主角 16×24 **8×8 精靈模式**（一個姿勢 6 磚、`名稱 + 0..5` row-major）、手臂砲、彈 / 蓄力環、爆炸、道具、**血條 5 階磚**；HUD 字型沿用 `NES.CHR.DEMO.FONT` + 選關面板磚 |
| `chr_world.js` | `MG.BG_WORLD`（20 磚）/ `MG.SPR_WORLD`（100 磚）/ `MG.THEMES` | 兩關**共用同一組結構磚**，主題靠 `MG.THEMES[key]` 換調色盤 + 1 張 signature 磚（同 R3 cruiser 的 `CR.STAGE_PAL` 策略）；雜魚 4 種 × 2 幀 16×16、頭目 2 隻 × 2 幀 32×32 |
| `song.js` | `MG.Audio`（= `{init, play, stop, sfx, tick, has, validate, BUILD}`）、`MG.SONGS` | **8 首原創曲**（select / stage1 / stage2 / boss / weapon / clear / death / gameover）+ **18 個音效**（只佔 p2 / noi）。自帶 Builder ⇒ `tools/apu_render.py --game mech` 只載 apu + music + 本檔就能離線渲染（檔尾有 `window.CR.SONGS` 相容掛點，CR 已存在時不覆蓋） |
| `weapons.js` | `MG.Weapons` | 彈池（自機 8 / 敵 16，`SH.Pool`）、能量 28 格、**N×N 傷害表 `MG.Weapons.DMG`**、`fire(h, lvl)` / `canFire` / `canCharge` / `cycle(d)` / `damageTo(bossKey, shot)` |
| `hero.js` | `MG.Hero` | 狀態機 `idle / run / jump / fall / slide / climb / hurt / dead`；**無加速度**、空中完全可控、放開 A 立刻停止上升、滑行、三連發上限、蓄力兩段、梯子、受擊後退 + 無敵閃爍、尖刺 / 熔岩即死 |
| `enemies.js` | `MG.Enemies` | 4 種雜魚（walker / sentry / flyer / hopper），`spawn(kind, col, row)` / `hit(e, dmg, g)` / `update(g)` / `draw(oam, tiles)`；**進畫面才生成、離開就銷毀** |
| `bosses.js` | `MG.Bosses` | `create(key)` / `update(b, g)` / `hit(b, dmg, g)` / `draw(b, oam, tiles)` / `box(b)` / `state(b)`；兩隻參數化頭目機，HP 28、兩階段 |
| `levels.js` | `MG.TILE / MG.solidKind / MG.LEVELS / MG.SELECT / MG.Levels` | 磚語意 20 種、房間 = **32×30 磚 = 一張名稱表**、run-length 的列清單建圖、消失磚純函式 `vanishOn/Warn/Phase` |
| `main.js` | `window.GAME` / `GAME.dev` | 模式機、換房、HUD（精靈）、武器選單、碰撞、一鍵密技、`state()` 與 30 個 `dev.*` 鉤子 |

## 手感常數（研究 03_洛克人2 §②，全部整數定點數）
| 項目 | 值 | 來源 |
|---|---|---|
| 水平速度 | **1.375 px/幀**（`v88(1,96)`），**沒有加速度**：按下即定速、放開即停 | [源] §②「手感規則」 |
| 空中控制 | 完全可轉向、無空中慣性 | [源] §② |
| 跳躍 | `v0 = −5.293 px/幀`、`g = 0.25 px/幀²`（起跳首幀半格，同 engine leapfrog）⇒ **跳高 56.03 px = 3.5 格磚**、滯空 ≈ 43 幀 | [源] §②＋[引擎] ENGINE_API §3 |
| 可變高度 | **放開 A 立刻停止上升**（不是減速） | [源] §② |
| 下墜上限 | 6 px/幀 | [推論] |
| 滑行 | 2.5 px/幀 × 26 幀，碰撞框 12×**16**（可鑽 2 格高隧道） | [推論]（洛克人 3 起的動作，本作列標配） |
| 爬梯 | 1.25 px/幀；**爬梯可射擊**、按 A 鬆手落下、梯頂要完整爬出 | [源] §② |
| 射擊 | 普通彈**同屏 3 發**；蓄力 **30 幀 = 2 傷 / 60 幀 = 3 傷** | [源] §②＋[契約] |
| 受傷 | 扣血 → **強制後退 1 px/幀 + 硬直 16 幀 + 無敵 90 幀（閃爍）** | [源] §② |
| 血量 / 頭目 HP | 都是 **28**（研究 ③「魔王 HP 統一 28」⇒ 只維護一張 N×N 傷害表） | [源] §⑤⑩ |

## 關卡（研究 §③「以畫面為單位切換」）
- **一個房間 = 一張名稱表（32 × 30 磚）**，相機永遠不動；換房時才捲動，而且**每幀只補 1 欄 / 1 列**
  （水平 32 幀、垂直 30 幀，**單幀 ≤ 48 byte**，遠低於 160 VBlank 預算）。
  水平用 `ppu.mirroring('v')` + `scroll(x)`、垂直用 `ppu.mirroring('h')` + `scroll(0, y)`；**engine 一行未改**。
- 連線：`room.next = 'right' | 'up' | 'down' | null`；往 next 走 ⇒ 下一間、往「上一間 next 的反方向」走 ⇒ 回上一間。
| 關 | key | 畫面名 | 房間 | 中繼點 | 頭目 | 機制 |
|---|---|---|---|---|---|---|
| 1 | frost | FROST PLANT 冰晶工廠 | 7 | 1-A / 1-F | 霜棱機兵 FROST | 教學室 → 坑 → **梯子上行換房** → 高台 + 消失磚獎勵 → 尖刺走廊 → 前哨 → 魔王 |
| 2 | blaze | BLAZE FURNACE 熔鐵熔爐 | 7 | 2-A / 2-E / 2-F | 爆焰機兵 BLAZE | 熔岩 → **垂直落下換房** → 落點 → 熔岩 + 消失磚獎勵 → 滑行隧道 + 梯子上行 → 前哨 → 魔王 |
- **消失磚（Yoku Block）**：週期 120 幀（出現 72 / 最後 16 幀閃爍預警 / 消失 48），B 群相位差 60。
  研究 ⑩⑨ 要求「先在安全處示範一次」⇒ 1-D 在實心地板上方先給一塊；而且**一律放在獎勵路線**，
  主路線不靠節拍（友善版，對齊專案既有裁示；通關機器人把消失磚當成不存在仍然能通關＝這條的驗收）。

## 頭目與武器剋制環（研究 §⑤⑩②③）
| 頭目 | HP | 招式循環 | 弱點（10 傷 = 3 發倒） | 第二階段（HP ≤ 14） |
|---|---|---|---|---|
| FROST | 28 | 等待 → 冰棱三連扇形 → 等待 → 跳躍 + 落地兩道冰震波 | 爆焰彈 BLAZE BOMB | 多一招全螢幕衝刺（附無敵） |
| BLAZE | 28 | 等待 → 三道火柱（固定 x = 60/120/180、預警 24 幀） → 等待 → 八方火環 | 冰棱彈 FROST SHOT | 同上 |
- 基礎砲 1 傷（28 發）、中段蓄力 2 傷、全蓄力 3 傷 ⇒ **沒有弱點武器也打得死**（避免 Boobeam Trap 式死局，研究 ⑩⑩）。
- 火柱固定在 x = 60 / 120 / 180 ⇒ **左右角落永遠安全**（友善版，也是機器人能 0 死的原因）。

## 驗收
- `games/mech/test_mech.py` **150 項**（手感 ±1 幀 / 狀態機 / 射擊蓄力 / 梯子 / 即死磚 / 消失磚純函式 /
  四種換房 + 單幀 byte + 預算 / 武器選單 / 弱點傷害表 / 中繼點與 GAME OVER / 兩關資料 +
  **每房可達性 BFS（消失磚不算）** / 7 張 lint / 600 幀預算 / 8 曲驗證 / 一鍵密技）。
- `tools/playthrough_mech.py`：`--stage frost` **2302 幀 0 死**、`--stage blaze` **2014 幀 0 死**、
  `--all`（選關 → FROST → 選關 → BLAZE，第二關用剛拿到的 FROST SHOT）**3848 幀 0 死**、
  `--cheat` 14 項全過。
- `bash tools/run_all.sh` 全綠；`tools/build.py --check --src mech.html` PASS。

| agent | 擁有檔案 | 內容 |
|---|---|---|
| mech-r1 | `games/mech/**`（新增 9 檔）、`mech.html`（新增）、`tools/playthrough_mech.py`（新增）、`tools/{run_all.sh,build.py,shot.py}`（Edit 插入）、`README.md` / `index.html`（Edit 插入入口）、`docs/TASKS.md`（本段） | 見上 |

## 追加（2026-10-08 使用者回饋）：互動物件 / 道具圖示 2×
使用者：「整體圖示太小、人太大；圖示可以變大一倍，例如問號箱等等；怪物好像還好。」
查核後確認「小的只有背景磚」（敵人 16×16 / 無敵星 16×16 / 主角 16×24 本來就夠大）。

| 物件 | 2× 後 | 碰撞 |
|---|---|---|
| 金幣 / 旗桿頂端 | 16×16（2×2 磚，往上 + 右長） | 不變（非固體）；金幣**撿取範圍跟著放大** |
| ? 磚 / 用過的磚 / 磚塊 | 8×16（1×2 磚，往上長；水平連段沒有往右的空間） | 上半格 = **單向平台** ⇒ 可達性只增不減、不會「站進磚裡」 |

擁有檔：`games/star/icons2x.js`（新，`ST.Icons2x` + `ST.BG_ICON2X` 14 磚，背景 bank 218 → 232/256，
**精靈 bank 一磚未加**）；`games/star/main.js`（`scrTileAt` / `attrAt` / `kindAt` / `writeTileArea` /
play 迴圈 / `init` / `dev` 插入）、`star.html`、`games/star/test_star.py`（一條斷言放寬）。
驗收：`test_meta.py` 150 → **182 項**全過；`test_star/w1/w2/w3/w4` 全綠；`--all8` 八關全 cleared、
deaths 與 R3 相同（2-1 / 2-2 的 frames 因多了落腳點 +26 / +1）；lint 每線精靈 ≤ 8；`run_all.sh` PASS。
新世界只要用既有磚碼（COIN / QBLOCK / USED / BRICK / GOAL_TOP）就自動吃到 2×；
關掉用 `GAME.dev.icons2x(false)`。

### R4 fix-r4 契約（2026-10-08，收尾）

**範圍**：`docs/QA_REPORT.md` 新章 `# R4 qa-r4（2026-10-08）` 缺陷表的 **P2 ×4 + P3 ×6（全部）**。
**所有權（本卡改過的檔，都只改數值 / 插入，沒改介面；`engine/` 一行未改）**：
`games/star/icons2x.js`（`fits` 放寬 + `rowFits` 整排一致 + 旗子 SPEC + `cands`）、
`games/star/subweapon.js`（`kindOf`）、`games/star/main.js`（`dev.giveSub` / `hudMapStatic` / `hudWrite` 插入）、
`games/star/worldmap.js`（`drawShop` 清除範圍）、`games/star/{levels_w3,levels_w4,boss_w3,boss_w4}.js`（P3-2 編排數值）、
`games/cruiser/main.js`（匯出 `CR.muteBudget`）、`games/cruiser/credits.js`（`skip()` 包 mute）、
`tools/playthrough_star.py`（硬直中放開 A、退後時動量保護）、`tools/test_touch.py`（只改 docstring）、
`games/star/{test_meta,test_w3,test_w4}.py`、`games/cruiser/test_r4.py`、`docs/{PROGRESS,QA_REPORT,TASKS}.md`。

**驗收（已達成）**：`bash tools/run_all.sh` 總結 PASS（19 支測試全綠）；回歸測試 +63 項
（`test_meta` 205 / `test_w3` 186 / `test_w4` 241 / `cruiser/test_r4` 121）；
旗桿球與旗子 **16/16 關 2×**、16 關 **0 排**金幣大小不一；
W3 / W4 八關機器人全程每線精靈 **≤ 8**（3-1 是 7，其餘 8）不靠輪替；
**`--w4` 新基準（icons2x 開著）：1197 / 1075 / 1086 / 1578 幀，四關 0 死**；
`--w3` 四關 0 死、`--all8` 八關 cleared（1-1 仍 1 死，R3 以來就是）、`--map` / `--cheat` 全過；
cruiser `--chain` ending / 47610 / 0 死、mech `--all` 3821 / 0 死；
credits 快轉 `overFrames = 0`（修前 1、peak 960）。
