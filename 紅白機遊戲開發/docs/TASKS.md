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
