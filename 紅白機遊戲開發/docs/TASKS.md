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
