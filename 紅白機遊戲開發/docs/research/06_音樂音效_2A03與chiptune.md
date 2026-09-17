# 06 音樂 / 音效：2A03 與 chiptune

## 摘要（10 行內）

1. NES 的音源是 CPU 內建的 **2A03（NTSC）/ 2A07（PAL）APU**，共 5 聲道：方波 ×2、三角波 ×1、雜訊 ×1、DPCM ×1 [源]。
2. 方波有 4 種占空比（12.5% / 25% / 50% / 25% 反相），音量 4 bit（16 階）；三角波**沒有音量控制**、固定 4 bit 32 階梯波；雜訊是 15-bit LFSR [源]。
3. 實務上 = 旋律（方波 1）+ 和聲 / 回音（方波 2）+ 低音（三角波）+ 鼓（雜訊）+ 取樣鼓（DPCM），音效必須**搶**其中一軌 [源+推論]。
4. 核心作曲技法：**琶音模擬和弦**、**第二方波做回音**、震音 / 顫音、滑音、占空比快速切換、三角波兼任低音與大鼓 [源]。
5. 名曲共通點：強動機、短循環（多為 8～32 小節）、少聲部但高密度、記憶點放在前 4 小節 [源+推論]。
6. 音效設計本質是「**波形 + 頻率掃描 + 極短包絡**」三個參數的組合 [推論]。
7. 工具鏈：FamiTracker / Dn-FamiTracker / FamiStudio → NSF / NSF2；遊戲內引擎用 famitone2 / GGSound / FamiStudio Sound Engine [源]。
8. Web Audio 復刻要點：`PeriodicWave` 做任意占空比、`ScriptProcessor`/預算 buffer 做 LFSR 雜訊、**lookahead 排程（25ms tick / 100ms 預排）** [源]。
9. GB 是 2 方波 + **波形記憶體（32×4-bit）** + 雜訊，且有**左右聲像**；GBA 改為 2 路 8-bit PCM（DirectSound）+ 舊 4 聲道 [源]。
10. 本專案建議：沿用 `../卡比之星/src/audio.js` 的 4 軌 step sequencer 架構，補上占空比包絡、琶音、回音軌與「音效搶軌」機制 [推論]。

---

## 目錄

- [一、2A03 五聲道細節與音色](#一2a03-五聲道細節與音色)
- [二、chiptune 作曲技法](#二chiptune-作曲技法)
- [三、名曲分析](#三名曲分析)
- [四、音效設計](#四音效設計)
- [五、音樂驅動程式與工具](#五音樂驅動程式與工具)
- [六、用 Web Audio 復刻 2A03](#六用-web-audio-復刻-2a03)
- [七、GB / GBC / GBA 音源差異](#七gb--gbc--gba-音源差異)
- [八、原創作曲工作流程與 20 條檢查表](#八原創作曲工作流程與-20-條檢查表)
- [九、來源](#九來源)

---

## 一、2A03 五聲道細節與音色

### 1.1 總覽表

| # | 聲道 | 暫存器 | 音高解析度 | 音量 | 典型角色 |
|---|---|---|---|---|---|
| 1 | Pulse 1（方波 1） | `$4000-$4003` | 11-bit timer | 4-bit（0-15）或包絡 | 主旋律 [源] |
| 2 | Pulse 2（方波 2） | `$4004-$4007` | 11-bit timer | 4-bit 或包絡 | 和聲 / 對位 / 回音 [源] |
| 3 | Triangle（三角波） | `$4008-$400B` | 11-bit timer | **無音量控制**（只有開 / 關） | 低音線、偶爾當大鼓 [源] |
| 4 | Noise（雜訊） | `$400C-$400F` | 16 段查表週期 | 4-bit 或包絡 | 鼓組、風聲、爆炸 [源] |
| 5 | DMC / DPCM | `$4010-$4013` | 16 段取樣率 | 7-bit 輸出位準 | 取樣鼓、人聲、貝斯 [源] |

> 全部由 `$4015` 控制各聲道開關；`$4017` 是 frame counter（見 1.7）[源]。

### 1.2 方波（Pulse 1 / 2）

**占空比與音色對應** [源]（`$4000` bit 7-6 = DD）：

| DD | 序列 | 占空比 | 聽感 | 常見用途 |
|---|---|---|---|---|
| 0 | `0 0 0 0 0 0 0 1` | 12.5% | 細、尖、鼻音、「電子」 | 清亮旋律、閃爍音效、回音軌 |
| 1 | `0 0 0 0 0 0 1 1` | 25% | 亮但有厚度，最「紅白機」 | **最常用的主旋律** |
| 2 | `0 0 0 0 1 1 1 1` | 50% | 圓、空心、像單簧管 | 和聲、柔和主題、貝斯替代 |
| 3 | `1 1 1 1 1 1 0 0` | 25% 反相 | **聽起來與 25% 相同**（只有相位相反） | 與 DD=1 交替可做「相位錯覺」 |

- 頻率公式：`f = f_CPU / (16 × (t + 1))`，NTSC `f_CPU = 1.789773 MHz`，t 為 11-bit timer [源]。
  - 反推：`t = f_CPU / (16 × f) - 1`。
- **t < 8 會讓該方波靜音**（不論是直接寫入或 sweep 造成）；NTSC 最高輸出約 12.4 kHz [源]。
  - [推論] 這代表方波實際可用的最高音約在 B7 附近，再高就會突然消音——這是 NES 音樂很少寫超高音的硬體原因。
- **Sweep 單元**（`$4001`）：硬體自動做頻率滑移，格式 `EPPP.NSSS`（E 啟用、PPP 週期、N 負向、SSS 位移量）[源]。
  - [推論] 這是「跳躍音效」上滑、「下墜音效」下滑最省 CPU 的做法，音效程式只要寫一次暫存器。
- **包絡（envelope）**：`$4000` 的 `lc.vvvv`——c=1 時 vvvv 是固定音量；c=0 時 vvvv 是包絡衰減速率，產生自動 decay [源]。
- **長度計數器（length counter）**：`$4003` 高 5 bit 查表載入，時間到自動消音 [源]。

**兩支方波的音色差異**：硬體上完全相同；聽感差異來自作曲家給它們不同的占空比、音量與音域 [推論]。

### 1.3 三角波（Triangle）

- 輸出是 **32 步階梯波**：`15,14,13,...,1,0,0,1,...,14,15`，即 4-bit 量化的三角波 [源]。
- 頻率公式：`f = f_CPU / (32 × (t + 1))`；**timer 以 CPU 時脈計數（不是 CPU/2）**，NTSC 理論可達約 55.9 kHz [源]。
- **沒有音量暫存器**：只能「響」或「停」，靠 linear counter（`$4008`）+ length counter 控制長度 [源]。
  - [推論] 所以三角波在混音中永遠是同一個響度，作曲時要靠**音符密度與音域**而非力度來塑造低音表情。
- `$4008` 的 linear counter 是比 length counter 更精細的時間閘門，讓三角波能做短促斷奏 [源]。
- **低 timer 值（0 或 1）產生超音波**，等於「靜音」；《洛克人 2》就用這招關掉三角波，但恢復可聽頻率時會有 **popping（爆音）** [源]。
  - [推論] 這正是很多 NES 曲子低音有輕微「喀」聲的來源，復刻時可刻意加入極短的 click 來仿真。
- **三角波當鼓**：把三角波瞬間設到極低音（約 40-80 Hz）再立刻切掉，得到一個帶音高的「咚」；配合雜訊的 snare 就構成完整鼓組 [推論；技法在 NES 曲目中極常見]。

**混音權重**（線性近似）[源]：

```
pulse_out = 0.00752 × (pulse1 + pulse2)
tnd_out   = 0.00851×triangle + 0.00494×noise + 0.00335×dmc
```

- [推論] 三角波係數（0.00851）比雜訊（0.00494）、DPCM（0.00335）高，所以三角波在真機上其實**相當突出**，復刻時不要把 bass 壓太小。
- 精確非線性公式 [源]：
  ```
  pulse_out = 95.88 / ((8128 / (pulse1 + pulse2)) + 100)
  tnd_out   = 159.79 / (1 / ((triangle/8227) + (noise/12241) + (dmc/22638)) + 100)
  output    = pulse_out + tnd_out      // 0.0 ~ 1.0
  ```
- [推論] 非線性混音代表「聲道越多，每軌越小聲」，有天然的軟壓縮效果——Web Audio 復刻可用 `DynamicsCompressor` 近似（`../卡比之星/src/audio.js` 已經這樣做）。

### 1.4 雜訊（Noise）

- 15-bit LFSR；每次 timer 觸發時，回授 = `bit0 XOR bit1`（mode=0）或 `bit0 XOR bit6`（mode=1）[源]。
- **mode=0**：週期 32767 步 → 聽感是「白雜訊 / 沙沙聲」 [源]。
- **mode=1**（`$400E` bit 7）：週期 93 或 31 步 → 聽感是**有音高的金屬 / 馬達聲**，可當「調式雜訊」 [源]。
  - [推論] mode=1 是做「機械音、雷射、蜂鳴」的關鍵，很多人復刻時忘了做這一支，聲音就少了 NES 味。
- NTSC 週期查表（16 段，CPU cycles）[源]：
  `4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068`
  - index 0 最高（最亮的「嘶」）→ index 15 最低（最粗的「隆」）。

**典型雜訊鼓組對應** [推論，取自常見 NES 曲目慣例]：

| 鼓 | 雜訊 period index | mode | 包絡 | 說明 |
|---|---|---|---|---|
| 大鼓 kick | 12-14（低） | 0 | 極快衰減（2-4 frame） | 常再疊三角波低音強化 |
| 小鼓 snare | 5-8（中） | 0 | 快衰減（4-8 frame） | 音量比 kick 稍低 |
| 閉合 hi-hat | 0-2（高） | 0 | 極短（1-2 frame） | 密集節奏用 |
| 開放 hi-hat / 鈸 | 0-2（高） | 0 | 長衰減（10-20 frame） | 樂句結尾 |
| 金屬 / 雷射 | 3-6 | **1** | 中等 | 有音高的「嗡」 |

### 1.5 DPCM / DMC（取樣聲道）

- 1-bit delta 編碼：每個 bit 讓 7-bit 輸出位準 ±2（有上下限夾住）[源]。
- 16 段取樣率，NTSC 從 rate `$0` = 428 CPU cycles（4181.71 Hz）到 rate `$F` = 54 cycles（33143.9 Hz）[源]。
- **記憶體限制** [源]：
  - 取樣位址 = `%11AAAAAA.AA000000` = `$C000 + (A × 64)` → 只能放在 `$C000` 以上、且 64 bytes 對齊。
  - 長度 = `%LLLL.LLLL0001` bytes，**最長 4081 bytes**。
  - [推論] 4081 bytes ÷ 8 bit/byte ÷ 4181 Hz ≈ **最長約 7.8 秒**（最低取樣率）；若用常見的中等取樣率，一個鼓聲只有 0.1-0.3 秒——這就是為什麼 DPCM 幾乎只拿來做鼓與短促人聲。
- `$4011` 可直接寫 7-bit 位準 → 部分遊戲用 CPU 硬推 PCM 播人聲，但會吃掉大量 CPU [源+推論]。
- **已知硬體問題**：DMC 取樣的 DMA 會偷 CPU cycle，並且可能破壞同時進行的手把讀取或 PPU 暫存器讀取（NTSC 2A03）；需要特殊的重讀手把程式碼；PAL 2A07 沒這問題 [源]。
  - [推論] 這是「用了 DPCM 就偶爾掉輸入」的歷史原因，也是很多 homebrew 乾脆不用 DPCM 的理由。

### 1.6 聲道優先與音效搶聲道規則

NES 沒有硬體混音器，5 軌就是 5 軌；音效要發聲就必須**暫時接管**某一軌 [源：FamiStudio/GGSound 引擎皆以「SFX 與音樂共用聲道」設計]。

常見規則 [推論，歸納自多個引擎與遊戲聽感]：

| 音效類型 | 搶哪一軌 | 理由 |
|---|---|---|
| 跳躍、射擊、選單、拾取 | **Pulse 2** | 旋律在 Pulse 1，犧牲和聲最不傷主題 |
| 爆炸、受傷、腳步、落地 | **Noise** | 鼓短暫消失幾乎聽不出來 |
| 大型演出（魔王登場、取得道具 jingle） | Pulse 1 + Pulse 2（甚至整首暫停） | 刻意讓音樂讓位 |
| 語音、特殊鼓 | DPCM | 本來就是取樣軌 |
| **三角波** | **儘量不要搶** | 低音一斷，整首會「空掉」 |

- **優先權 / 佇列**：引擎通常給每個音效一個 priority，高優先權可打斷低的；同一軌上新音效直接覆蓋舊的 [源：FamiStudio 引擎有 `FAMISTUDIO_CFG_SFX_STREAMS` 可設定同時可播的音效數]。
- [推論] 設計原則：**一首曲子要在「少一軌」的情況下仍然成立**。這是 NES 作曲的隱性規範。

### 1.7 Frame Counter（節拍骨架）

- 4-step 模式：quarter frame ≈ **240 Hz**（時脈包絡與三角波 linear counter）、half frame ≈ **120 Hz**（length counter 與 sweep）、frame IRQ ≈ **60 Hz**（NTSC 每 29830 CPU cycles）[源]。
- 5-step 模式：quarter ≈ 192 Hz、half ≈ 96 Hz、**不產生 IRQ** [源]。
- [推論] 對作曲的意義：音樂驅動程式幾乎都掛在 **60 Hz NMI（每幀一次）** 上更新。所以 NES 音樂的**最小時間單位 = 1 幀 ≈ 16.67 ms**；所謂「speed / tempo」其實是「幾幀走一個 row」。
  - 常見：speed 6 → 每 row 6 幀 = 100 ms；4/4 拍 16 分音符一 row，等於 **150 BPM**。
  - 公式：`BPM = 3600 / (speed × rows_per_beat)`（NTSC 60 Hz，4 row/beat 時 `BPM = 900 / speed`）[推論，由 60 Hz 推導]。

---

## 二、chiptune 作曲技法

### 2.1 琶音（Arpeggio）模擬和弦

- 單軌無法同時發多音，作曲家用**每 1-2 幀切換一個音**的高速琶音造成「和弦」錯覺 [源]。
- 表示法：FamiTracker 的 `0xy` 效果 = 以「根音 / +x 半音 / +y 半音」循環 [源：FamiTracker 效果欄慣例]。
  - 大三和弦 = `047`（0, +4, +7）
  - 小三和弦 = `037`
  - 大七 = `04B`（0,+4,+11）；屬七 = `04A`
  - 減七 = `036`
- [推論] 速度感：
  - **每幀換一次（60 Hz）**：聽起來像一團「嗡嗡」的和弦（經典 C64 / NES 音色）。
  - **每 2-3 幀換一次（20-30 Hz）**：能聽出個別音，像豎琴刷弦。
  - **每 4 幀以上**：已經是可辨識的分解和弦樂句，不再是「假和弦」。
- 用途：Pulse 2 打琶音 + Pulse 1 唱旋律 + 三角波走根音 = **三軌做出完整編曲**，這是 NES 音樂的標準配方 [推論]。

### 2.2 回音（Echo）用第二方波

- 做法：把 Pulse 1 的旋律複製到 Pulse 2，**延後 2-6 row**、音量降到 1/3-1/2、占空比改成更細的 12.5% [源]。
- 效果：在沒有殘響硬體的 NES 上製造空間感，特別適合洞窟、太空、悲傷主題 [推論]。
- 進階：回音軌**微微失諧（detune）**（FamiTracker `Pxx` 效果）可以做「合唱 / 閃爍」效果 [源]。
- [推論] 成本：回音軌會整個佔用 Pulse 2，所以在需要和聲的段落必須放棄回音——這種「二選一」正是 NES 編曲的節奏。

### 2.3 震音（Tremolo）與顫音（Vibrato）

| 技法 | 調變對象 | NES 實作 | 典型參數 |
|---|---|---|---|
| 顫音 vibrato | 音高 | 每幀微調 timer；FamiTracker `4xy`（x=速度, y=深度） | 速度 5-7、深度 2-4；**延遲 8-16 幀再進入**更自然 [推論] |
| 震音 tremolo | 音量 | 每幀改 4-bit 音量；`7xy` | 方波可用；**三角波做不到**（無音量） [源] |
| 占空比顫動 | 音色 | 每 2-4 幀在 12.5%/25%/50% 之間切換 | 做「電子風琴」「拉弦」質感 [推論] |

- [推論] 顫音是 chiptune 最廉價的「表情」：長音只要加 vibrato，就從「電子嗶聲」變成「樂器」。反之，短音加 vibrato 只會糊掉。

### 2.4 滑音（Slide / Portamento / Pitch bend）

- **硬體 sweep**（`$4001`）：只有方波有，速度由 SSS 決定，每 half frame（120 Hz）更新一次 [源]。
- **軟體 slide**：驅動程式每幀把 timer 往目標值推進，可用在三角波 [推論]。
- FamiTracker 效果：`1xx` 上滑、`2xx` 下滑、`3xx` portamento（滑向下一個音）、`Qxy`/`Rxy` 音符滑移 [源：FamiTracker 效果欄慣例]。
- 用法 [推論]：
  - 旋律結尾 `3xx` 滑到下個音 → 「吉他推弦」感。
  - 低音 `2xx` 快速下滑 → 「合成貝斯 drop」。
  - 整軌瞬間上滑 → 「加速 / 變身」演出。

### 2.5 快速占空比切換

- 在**同一個音符內**改變占空比，等於免費的「濾波器掃描」[推論]。
- 常見包絡（duty envelope）：
  - `50% → 25% → 12.5%`（逐漸變細）＝ 音色「收斂」，像撥弦衰減。
  - `12.5% → 25%`（音頭細、身體厚）＝ 有 attack 的感覺。
  - `25% ↔ 12.5%` 每 2 幀交替 ＝ 粗糙的「失真吉他」質感。
- [推論] Web Audio 復刻時這是**最能拉開「像 NES」與「不像」的細節**，因為單一固定方波聽起來會像廉價合成器。

### 2.6 三角波低音線寫法

- 因為沒有音量，三角波**不能做力度變化**，所有表情靠音符本身 [源]。
- [推論] 實務寫法：
  1. **八分音符固定根音**（最基本，撐住律動）。
  2. **走音線（walking bass）**：根音 → 五度 → 八度 → 經過音，讓低音自己有旋律感（《洛克人》系列典型）。
  3. **八度跳躍（octave bounce）**：根音 / 高八度交替，製造彈跳感（《超級瑪利歐》地面曲）。
  4. **低音 + 鼓兩用**：在拍點上插入 1-2 幀的極低音（40-70 Hz）當大鼓，再回到低音線。
  5. **不要寫太低**：當年電視喇叭放不出低頻，所以 NES 低音常寫在 **C2-C4**（比現代 bass 高）[源]。
- 短暫消音技巧：把 timer 設 0/1（超音波）比關閉 length counter 更快，但恢復時有爆音 [源]。

### 2.7 雜訊鼓 pattern

[推論] 以 16 分音符為一 row、每小節 16 row 表示（`k`=kick, `s`=snare, `h`=閉合 hat, `-`=休止）：

| 風格 | Pattern（16 步） | 適用 |
|---|---|---|
| 基本搖滾 | `k-h-s-h-k-h-s-h-` | 通用關卡 |
| 八分 hat | `khhskhhskhhskhhs` 的雜訊版 | 節奏感強的動作關 |
| 疾走（16 beat） | `khhhshhhkhhhshhh` | 魔王戰、高速捲軸 |
| 拉丁 / 切分 | `k--k--s---k--s--` | 明亮地面曲（瑪利歐系） |
| 極簡 | `k-------s-------` | 氛圍曲、迷宮 |
| 無鼓 | 全空，改用三角波點綴 | 恐怖 / 太空（《Metroid》路線）[源：田中宏和刻意去旋律化] |

- **過門（fill）**：在 4 / 8 小節的最後 1 小節，把 hat 換成連續 16 分雜訊 + 音量遞增，是最便宜的「段落分隔」[推論]。

### 2.8 每小節資料量與 loop 結構

- NES 音樂是**指令流（pattern + order table）**，不是取樣：一首 2 分鐘的曲子壓縮後常在 **1-3 KB** [推論，依 famitone2 / GGSound 的資料格式估算]。
- 省空間的手段 [源+推論]：
  - **pattern 重用**：order table 反覆指向同幾個 pattern。
  - **短 loop**：主題 8-16 小節就循環。
  - **聲部錯位重用**：Pulse 2 重用 Pulse 1 的 pattern，只是 transpose。
- 真實案例：《洛克人 2》Dr. Wily Stage 1 因為**卡帶空間不足**，被迫在 Stage 2 沿用同一首；作曲家 Takashi Tateishi 表示「如果當時空間夠，這首會完全不一樣」[源]。

**曲式建議（NES 慣例）** [推論]：

```
Intro (2-4 小節)  →  A 主題 (8-16)  →  B 副題 (8-16)  →  過門 (2-4)  →  loop 回到 A
                     ↑ loop point 通常設在 Intro 之後，避免每次循環都重播前奏
```

- **loop point 很重要**：前奏只在第一次播，之後從主題開始，否則每 30 秒聽到一次前奏會很煩 [推論]。
- 總長度建議：**關卡曲 30-60 秒 loop、魔王曲 20-40 秒、選單 15-30 秒、jingle 2-5 秒不循環** [推論]。

---

## 三、名曲分析

> 以下調性 / 速度為公開資料與常見樂譜分析；聲部分配為聽感歸納 [源 / 推論分別標註]。
> **本專案不會使用任何上述旋律**，只學習其結構原則。

### 3.1 《超級瑪利歐兄弟》地面 BGM（近藤浩治, 1985）

| 項目 | 內容 |
|---|---|
| 調性 | **C 大調** [源] |
| 拍號 / 速度 | 4/4；記譜約 **100 BPM**（實際聽感雙倍時間 200 BPM）[源] |
| 音域 | 旋律 G3 - A5 [源] |
| 節奏 | **拉丁節奏 + swing + 大量切分音** [源] |
| 影響來源 | 近藤自述受日本 fusion 樂團 **T-SQUARE**（1984 年〈Sister Marian〉）影響 [源] |

- **聲部分配** [推論]：Pulse 1 = 旋律（25% 占空比）；Pulse 2 = 平行三 / 六度和聲，同時在空拍插入短和弦；三角波 = 八度跳躍低音；雜訊 = 極簡拉丁鼓型。
- **記憶點**：開頭 `E E - E - C E - G` 的**切分 + 休止**，第一小節就把「彈跳」的動感講完 [推論]。
- **開發故事**：這首花的時間最長；近藤會先寫一版放進遊戲，若無法配合瑪利歐奔跑跳躍的體感就整首丟掉重寫；他實際玩了很多次才抓到基本旋律與速度 [源]。
- **地位**：2023 年成為**第一首入選美國國會圖書館「國家錄音登記處」的電玩音樂** [源]。
- **時間不足加速**：剩餘時間 < 100 時音樂加速——最早的「動態音樂」之一 [源]。
  - [推論] 這在 Web Audio 只要調整 scheduler 的 `secondsPerStep` 即可，`../卡比之星/src/audio.js` 的 `setTempoMul()` 已具備此能力。

### 3.2 《薩爾達傳說》序曲（近藤浩治, 1986）

| 項目 | 內容 |
|---|---|
| 由來 | 原本標題畫面用的是**拉威爾《波麗露》**改編，但發現版權還差約一個月才到期（拉威爾逝世未滿 50 年），只好緊急替換 [源] |
| 創作時間 | 近藤**熬夜一晚**完成 [源] |
| 素材來源 | 取材自他已寫好的「地上主題（Overworld Theme）」 [源] |

- **聲部分配** [推論]：Pulse 1 = 進行曲式主題；Pulse 2 = 三度和聲 / 對位；三角波 = 行進低音；雜訊 = 軍鼓滾奏。
- **記憶點**：開頭的**上行大跳 + 附點節奏**，帶有進行曲的英雄感 [推論]。
- **對本專案的啟示**：限制（版權、時間）反而逼出更強的原創動機——且**絕不可改編有版權的曲子**（見 `09_法律與原創原則.md`）[推論]。

### 3.3 《洛克人 2》Dr. Wily Stage 1（立石孝, 1988）

| 項目 | 內容 |
|---|---|
| 調性 | **升 C 小調 / 升 C 弗里吉安**（Phrygian）[源] |
| 速度 | 約 **150-180 BPM** [源] |
| 特徵 | 大量切分、和弦與旋律複雜度都遠高於同期作品 [源] |

- **聲部分配** [推論]：Pulse 1 = 16 分音符高速旋律；Pulse 2 = 琶音和弦墊（典型 `037` 小三和弦琶音）；三角波 = 快速走音低音線（幾乎是第二旋律）；雜訊 = 16 beat 鼓組。
- **記憶點**：前奏的**琶音上行 + 突然進入的主題**；弗里吉安的 ♭2 音給了「邪惡感」 [推論]。
- **開發故事**：這是立石第一首被音效總監通過的曲子，因此定調了整張原聲帶；因卡帶空間不足，Stage 2 直接沿用 [源]。
- **技法重點**：這首是「**三角波當第二旋律**」的教科書——低音不只撐拍，它自己在唱 [推論]。

### 3.4 《惡魔城》Vampire Killer（山下絹代, 1986）

| 項目 | 內容 |
|---|---|
| 作曲 | 山下絹代（與寺島聰惠共同以筆名 "James Banana" 掛名 NES 版）[源] |
| 風格 | 快節奏、小調；定義了整個惡魔城系列的音樂格式 [源] |
| 調性 | 小調（常見譜為 A 小調 / D 小調移調版本）[源，Hooktheory 分析] |

- **聲部分配** [推論]：Pulse 1 = 主題（大量 16 分音符與滑音）；Pulse 2 = 對位 / 琶音；三角波 = 八分音符驅動低音；雜訊 = 穩定 disco 式 4/4 鼓。
- **記憶點**：主題的**反覆音型 + 半音下行**，配合快速節奏產生「追逐感」 [推論]。
- **技法重點**：極高的**音符密度**（幾乎每個 row 都有音）——這是惡魔城系列「緊張」的來源，但也吃最多 pattern 空間 [推論]。

### 3.5 《勇者鬥惡龍》序曲（椙山浩一, 1986）

| 項目 | 內容 |
|---|---|
| 創作時間 | 椙山自述**約 5 分鐘寫成**；但他補充「是 50 年經驗 + 5 分鐘」 [源] |
| 風格 | 刻意採用**古典 / 巴洛克晚期至古典早期**風格，因為他認為古典樂比搖滾更適合中世紀奇幻世界 [源] |
| 結構 | 短號式號角動機 → 進行曲主題，僅約 20-30 秒卻成為系列不變的標誌 [源+推論] |

- **聲部分配** [推論]：Pulse 1 = 號角動機；Pulse 2 = 三度平行 / 和弦琶音；三角波 = 進行曲低音（強拍根音、弱拍五度）。
- **記憶點**：開頭的**上行四度 + 附點**號角動機，只有 4 個音就建立「冒險開始」的期待 [推論]。
- **對本專案的啟示**：**開場 jingle 只需要 4-8 個音**，但必須是整個作品最強的動機 [推論]。

### 3.6 《Metroid》Brinstar（田中宏和, 1986）

| 項目 | 內容 |
|---|---|
| 設計哲學 | 田中不滿當時遊戲音樂「流行、輕快的曲調」與遊戲氛圍不合，刻意寫出**大量無旋律（amelodic）、緊張、不協和**的配樂 [源] |
| 手法 | 把**音樂與音效視為同一個「生物」**來設計，而非兩個分離的系統 [源] |
| 靈感 | 受電影《Birdy》影響，希望整個遊戲的音樂到最後才轉亮 [源] |

- **聲部分配** [推論]：Pulse 1 = 短促動機（而非長旋律）；Pulse 2 = 不協和的平行音程（四度 / 三全音）；三角波 = 低音 ostinato；雜訊 = 稀疏、不規則。
- **記憶點**：**反覆的低音 ostinato**（同一個音型無限重複）製造「壓迫的孤獨感」 [推論]。
- **技法重點**：這證明 **NES 音樂不一定要有旋律**；氛圍曲可以只用音程、節奏與音色 [推論]。對本專案的「洞窟 / 深層區域」極有參考價值。

### 3.7 《星之卡比》Green Greens（石川淳, 1992, Game Boy）

| 項目 | 內容 |
|---|---|
| 設計哲學 | 石川選擇**簡單的節奏與旋律**，確保在 Game Boy 不佳的喇叭上也能聽清楚——刻意與同期「壓榨硬體極限」的風潮相反 [源] |
| 和聲策略 | 因為複雜和弦在 GB 喇叭上會變糊，他改用**簡單旋律 + 琶音 + 低音線來暗示和聲進行** [源] |
| 目標 | 寫成「**小孩子能哼出來**」的旋律 [源] |
| 其他 | 他也負責 1-Up jingle 與 Warp Star 的顫音音效 [源] |

- **聲部分配** [推論]：Square 1 = 旋律；Square 2 = 琶音 / 對位；Wave = 低音；Noise = 輕鼓。
- **記憶點**：明亮的大調、**級進為主的旋律**（好唱）、每 2 小節一個清楚的樂句斷句 [推論]。
- **對本專案的啟示（最重要的一條）**：在**瀏覽器 / 手機喇叭**上，石川的策略比「塞滿聲部」更有效——**先確保能哼**，再談技巧 [推論]。

### 3.8 《Tetris》Type A（Korobeiniki，田中宏和編曲, 1989, Game Boy）

| 項目 | 內容 |
|---|---|
| 原曲 | 俄羅斯民謠〈Korobeiniki〉，取材自 Nikolay Nekrasov 於 **1861 年**發表於《Sovremennik》雜誌的詩 [源] |
| 特徵 | 原曲以**逐漸加速**與舞曲風格聞名 [源] |
| 調性 | **A 小調** [源] |
| Game Boy 版 | 1989 年由**田中宏和**改編為 Type A [源] |
| 後續 | Tetris 公司自 **2002 年起要求每個版本都必須收錄** [源] |

- **聲部分配** [推論]：Square 1 = 主旋律；Square 2 = 平行三度 / 六度和聲（這是本曲「豐滿」的關鍵）；Wave = 跳躍低音（根音-五度）；Noise = 極簡鼓。
- **記憶點**：A 小調的**下行旋律 + 明確的 i-VII-VI-V 進行**，加上民謠的重複結構，非常好記 [推論]。
- **版權警告**：原曲旋律因年代久遠屬公有領域，**但田中的編曲與 Tetris 公司的商標 / 授權另計**；本專案一律不使用 [推論]。

### 3.9 名曲的共通結構（歸納）[推論]

| 共通點 | 說明 |
|---|---|
| 動機極短 | 4-8 個音就能辨識（DQ 序曲、Zelda 序曲） |
| 前 4 小節定生死 | 因為玩家會反覆聽到 loop 開頭 |
| 節奏先於旋律 | 近藤為了配合跑跳體感重寫多次 [源] |
| 少即是多 | 石川為了喇叭品質刻意簡化 [源] |
| 低音自己會唱 | 洛克人的三角波是第二旋律 |
| 一軌消失仍成立 | 因為音效隨時會搶軌 |
| 明確的 loop point | 前奏不重播 |

---

## 四、音效設計

### 4.1 音效的三個參數

任何 8-bit 音效都可以拆成 [推論]：

1. **波形**：方波（12.5 / 25 / 50%）、三角波、雜訊（mode 0 / 1）、DPCM。
2. **頻率軌跡**：上滑 / 下滑 / 跳躍 / 顫動 / 固定。
3. **包絡與長度**：attack 幾乎永遠是 0，重點在 decay 長度（通常 2-30 幀 = 33-500 ms）。

### 4.2 典型音效參數表

> 頻率單位 Hz，時間單位 ms。以下為**本專案建議的合成參數**，可直接餵給 Web Audio [推論；參考通用 chiptune 音效設計慣例 [源]]。

| 音效 | 波形 | 頻率軌跡 | 長度 | 音量包絡 | 備註 |
|---|---|---|---|---|---|
| **跳躍 jump** | 方波 25% | 220 → 880（上滑，指數）| 120-150 | 快 attack、線性 decay | 上滑約 2 個八度；短於 100ms 會像「嗶」 |
| **二段跳** | 方波 12.5% | 440 → 1320 | 100 | 同上但更短 | 比一段跳高一個五度以示區別 |
| **射擊 shoot** | 方波 12.5% | 1200 → 300（**下滑**）| 80-100 | 瞬間衰減 | 下滑 = 「發射」；上滑 = 「充能」 |
| **雷射 laser** | 雜訊 **mode 1** + 方波 | 高 → 低 | 150 | 中等 decay | mode 1 的金屬感是關鍵 |
| **命中 hit（打到敵人）** | 雜訊 mode 0（period 5-8） | — | 60-80 | 極快 decay | 可疊一個下滑方波增加「重量」 |
| **受傷 hurt（玩家）** | 方波 50% | 600 → 200，加顫音 | 250-350 | 中等 | 比 hit 長，讓玩家「感覺到」 |
| **拾取 coin / item** | 方波 25% | **兩音**：B5 → E6（上行五度）| 60 + 250 | 第二音長衰減 | 上行音程 = 「獲得」的通用語言 |
| **1-Up / 完成 jingle** | 方波 ×2 | 上行琶音 4-6 音 | 500-900 | 每音短 | 用大三和弦琶音；此時音樂應 duck |
| **死亡 death** | 方波 25% + 三角波 | 下行半音階或下行琶音 | 800-1500 | 長 | 通常**停止音樂**再播 |
| **爆炸 explosion** | 雜訊 mode 0（period 12-15） | 低通截止 3000 → 200 | 400-700 | 長 decay | 加低通掃描比純雜訊真實得多 |
| **選單移動 cursor** | 方波 12.5% | 固定 880 | 30-40 | 極短 | 必須極短，否則連按會糊 |
| **選單確認 confirm** | 方波 25% | 兩音上行（C6 → G6） | 40 + 80 | 短 | |
| **選單取消 cancel** | 方波 25% | 兩音下行（G5 → C5） | 40 + 90 | 短 | 與 confirm 鏡像 |
| **錯誤 error** | 方波 50% | 固定低音 150，方波抖動 | 200 | 方形包絡 | 刻意「難聽」 |
| **腳步 step** | 雜訊 period 10-12 | — | 25 | 極短 | 音量要很小（約主音量 15%） |
| **開門 / 機關** | 三角波 + 雜訊 | 低音上滑 | 400 | 中 | |
| **充能 charge** | 方波 12.5% | 低 → 高，循環顫動 | 循環 | 持續 | 可用 LFO 調變 |

### 4.3 音效設計原則

1. **音效不可與旋律同音域**：旋律多在 C4-C6，音效請放 C6 以上或用雜訊 [推論]。
2. **上行 = 正面，下行 = 負面**：跳躍 / 拾取 / 確認上行，射擊 / 受傷 / 取消下行 [推論]。
3. **節流（throttle）**：同一音效在短時間內重複呼叫要吃掉，否則會疊成噪音牆。`../卡比之星/src/audio.js` 已用 `SFX_THROTTLE`（預設 80 ms，高頻音效放寬到 25-45 ms）處理 [源：該檔案註解]。
4. **ducking**：大型 jingle 播放時把音樂降到 30-35%，播完回復 [源：該檔案 `duck()` / `DUCK_PAUSE=0.3`]。
5. **音效總量**：同時最多 3-4 個音效，超過就丟棄低優先權的 [推論]。
6. **音效也要有「音樂性」**：把音效的音高對齊當前曲子的調式（例如都用五聲音階音），整體會和諧很多 [推論——這是現代做法，NES 時代較少]。

---

## 五、音樂驅動程式與工具

### 5.1 作曲工具

| 工具 | 平台 / 目標 | 重點 | 授權 |
|---|---|---|---|
| **FamiTracker** | NES / Famicom | 最經典的 NES tracker，效果欄語法成為業界標準；原版已久未更新 | 免費 [源] |
| **0CC-FamiTracker** | NES | FamiTracker 分支，加了大量效果與匯出 | 免費 [源] |
| **Dn-FamiTracker** | NES | **0CC 的分支**，整合大量修正與新功能，目前最活躍的 FamiTracker 系 [源] | 免費 |
| **FamiStudio** | NES | 現代 UI（可用鋼琴捲軸而非 tracker 格），內建自家 sound engine 與 NSF / ROM 匯出；支援 VRC6 / VRC7 / FDS / S5B / MMC5 / EPSM / N163 等擴充（一次一種）[源] | 開源 |
| **Furnace** | 多平台 | 相容 DefleMask 模組；支援 Genesis / SMS / **Game Boy** / PCE / NES / C64 / YM2151 / Neo Geo / AY-3-8910 / Amiga / TIA 等 [源] | 開源 |
| **DefleMask** | 多平台 | 跨平台多系統 tracker，支援 Genesis / SMS / GB / PCE / NES（含 VRC7、FDS）/ C64 / Arcade / NeoGeo / MSX2 [源] | 商業 |
| **LSDj（Little Sound Dj）** | Game Boy（真機卡帶） | 幾乎把 GB 全部能力交給使用者；**少數支援取樣的 GB 工具**，內建鼓組與語音合成；兩台 GB 可用連線埠串接倍增聲道；作者 Johan Kotlinski 維護逾 20 年 [源] | 商業 |
| **hUGETracker** | Game Boy（homebrew） | 專為 GB 遊戲開發設計；比 LSDj 少一些複雜功能但**播放常式快、輸出小、CPU 佔用低**，適合放進 homebrew 遊戲；GB Studio 整合 [源] | 開源 |

### 5.2 NSF 家族格式

| 格式 | 說明 |
|---|---|
| **NSF** | NES Sound Format；本質是一個含 6502 程式碼 + 資料的 ROM 映像 + header，播放器提供 CPU 與 APU。相容性最廣 [源] |
| **NSFe** | 擴充 metadata：每首曲名、長度等 [源] |
| **NSF2** | 向下相容的擴充，涵蓋 NSFe 的 metadata，並加入 IRQ 等功能 [源] |

- FamiStudio 可匯出 NSF / NSFe，也能匯入 NSF2（若未使用進階功能）[源]。

### 5.3 遊戲內音樂引擎（跑在 6502 上）

| 引擎 | 作者 | 特點 |
|---|---|---|
| **famitone2** | Shiru | NES homebrew 的事實標準之一；支援 2A03 全部 5 軌；體積小、CPU 低（約 1800 cycles 為基準 100%）[源] |
| **famitone5.0** | nesdoug | famitone 系列的後續改良版 [源] |
| **GGSound** | gradualgames | 支援 FamiTracker 的一個子集，因此**比完整 FamiTracker driver 省 CPU**；轉換腳本比 famitone2 穩定（famitone2 的轉換器常報 note range error）；**音效整合比 famitone2 容易**；代價是作曲者多半得把效果烘進 envelope [源] |
| **FamiStudio Sound Engine** | BleuBleu | 「**大幅改造過的 famitone2**」；支援 FamiStudio 全部功能與擴充音源；以 `FAMISTUDIO_CFG_*` / `FAMISTUDIO_USE_*` 開關裁切功能（PAL/NTSC、SFX 串流數、DPCM、平滑顫音、滑音、琶音、音量 / 音高軌…）；zeropage 只用 7 bytes；單次匯出上限 64 種樂器 / 17 首曲、音域 C0-B7 [源] |

- **共通設計**：音效與音樂**共用聲道**，由引擎依優先權決定誰發聲 [源]。

### 5.4 GB / GBA 音樂引擎

| 引擎 | 平台 | 說明 |
|---|---|---|
| **hUGEDriver** | GB | hUGETracker 的播放常式，可與 GBDK / GB Studio 整合 [源] |
| **GBT Player** | GB | 較早的 GB 音樂播放器；hUGETracker 定位為它的升級 [源] |
| **Maxmod** | GBA / NDS | devkitPro 內建；使用 **DMA 1 與 2** 把波形送進 Direct Sound FIFO，ARM7 的 **Timer 0** 用來計時更新事件；支援 MOD / S3M / XM / IT [源] |
| **Krawall** | GBA | XM / S3M 播放器；曾是商業產品，授權給《魔戒》《蜘蛛人》《The Sims》等遊戲；以**忠實的 XM/S3M 實作與高品質混音常式**著稱；2013 年起以 LGPL 開源 [源] |

---

## 六、用 Web Audio 復刻 2A03

### 6.1 方波：任意占空比

**做法 A：`PeriodicWave`（推薦）** [源：Web Audio API]

用傅立葉級數合成占空比 d 的脈衝波：

```js
function makePulse(ctx, duty, N = 48) {
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 1; k < N; k++) {
    re[k] = 2 / (k * Math.PI) * Math.sin(2 * Math.PI * k * duty);
    im[k] = 2 / (k * Math.PI) * (1 - Math.cos(2 * Math.PI * k * duty));
  }
  return ctx.createPeriodicWave(re, im);   // 預設會正規化
}
```

- 優點：**內建 band-limit**，不會 aliasing；一次建好重複使用。
- 缺點：占空比無法在單音內連續變化（要換 wave 就得 `setPeriodicWave()`，或準備多個振盪器交叉淡入）。
- [推論] 本專案至少要備 `12.5% / 25% / 50%` 三種；`../卡比之星/src/audio.js` 目前只做了 `p25` 與 `p12`，**建議補上 50%**（`OscillatorNode.type='square'` 就是 50%，已可用）並加上「占空比包絡」。

**做法 B：`WaveShaper` + 鋸齒波**

把鋸齒波丟進 `WaveShaperCurve` 做閾值，可即時調占空比（把閾值當成參數調變），但會 aliasing；需 oversample `'4x'` 緩解 [推論]。

**做法 C：`AudioWorklet` 逐樣本模擬**

最忠實：直接實作 8 步序列器 + 11-bit timer + 包絡 + sweep + length counter [推論]。
- [推論] 成本高但可以做到**真正的 NES 行為**（包含 t<8 靜音、sweep 的整數截斷）。若本專案要「電子音樂像素遊戲」而非「精確模擬器」，做法 A 就足夠。

### 6.2 三角波量化

真機三角波是 **4-bit 32 階**，聽起來比純三角波「粗」一些 [源]。

```js
// 用 WaveShaper 把 OscillatorNode('triangle') 量化成 16 階
function makeQuantCurve(levels = 16, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * 2 - 1;                    // -1..1
    c[i] = Math.round((x + 1) / 2 * (levels - 1)) / (levels - 1) * 2 - 1;
  }
  return c;
}
const ws = ctx.createWaveShaper();
ws.curve = makeQuantCurve(16);
ws.oversample = '4x';   // 減少量化產生的 aliasing
```

- [推論] 另外，三角波**沒有音量變化**，所以復刻時 bass 軌應該用**固定 gain**（只有 on/off），不要寫 velocity——這是「像不像 NES」的重要細節。
- 音域建議 C2-C4 [源：當年 TV 喇叭低頻不足]，在瀏覽器 / 手機喇叭上同樣適用 [推論]。

### 6.3 雜訊：LFSR

不要用 `Math.random()`，要用真正的 15-bit LFSR 才有 NES 的「顆粒感」 [推論]。

```js
function makeLfsrBuffer(ctx, seconds = 1, mode = 0) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let reg = 1;                                  // 15-bit, 初值非 0
  for (let i = 0; i < len; i++) {
    const bit = (reg ^ (reg >> (mode ? 6 : 1))) & 1;
    reg = (reg >> 1) | (bit << 14);
    d[i] = (reg & 1) ? -1 : 1;                  // bit0=1 時輸出靜音位準（真機語意）
  }
  return buf;
}
```

- **控制音高**：真機用 16 段查表週期；Web Audio 可以用 `AudioBufferSourceNode.playbackRate` 近似，或直接用不同 `period` 重建 buffer [推論]。
  - 對照表：NTSC period `4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068` CPU cycles → 實際雜訊時脈 `1789773 / period` Hz [源]。
- **mode=1（93 步短循環）** 必做，這是金屬 / 雷射音色 [源]。
- [推論] `../卡比之星/src/audio.js` 目前用 `Math.random()` 填 1 秒 buffer（見 `makeRes()`）。**建議改成 LFSR**，並準備 mode 0 / mode 1 兩顆 buffer；這是一個低風險、高回報的改動。

### 6.4 DPCM 模擬

- 若要「像」而非「準」：用短取樣（自製鼓聲）以 `AudioBufferSourceNode` 播放，並**降取樣到 ~8-16 kHz + 量化到 7-bit** 以取得 DPCM 的粗糙感 [推論]。
- 若要更接近：實作 1-bit delta 解碼（每 bit 使輸出 ±2，夾在 0-127），再上採樣 [源：DMC 規格]。
- **長度上限提醒**：真機一個 DPCM 樣本最長 4081 bytes [源]；復刻時可以不管，但若要維持「NES 美學」，建議自我約束在 **0.2 秒以內的短鼓** [推論]。

### 6.5 節拍排程：lookahead

**這是 Web Audio 音樂最重要的一件事** [源：Chris Wilson, "A Tale of Two Clocks"]。

- 問題：`setTimeout` / `setInterval` 在主執行緒，受版面配置、繪圖、GC 影響，**可能偏移數十毫秒以上** [源]。
- 解法：**合作式排程**
  1. 每 **~25 ms** 用 `setTimeout` 呼叫一次 scheduler。
  2. 每次呼叫時，把**未來 ~100 ms** 內所有該發的音一次排進 Web Audio（用絕對時間 `ctx.currentTime + offset`）。
  3. 畫面同步用 `requestAnimationFrame`，但時間基準一律讀 `AudioContext.currentTime` [源]。
- 這樣可容忍主執行緒 50 ms 以上的卡頓 [源]。
- [推論] `../卡比之星/src/audio.js` 已用 `LOOKAHEAD = 0.1, TICK_MS = 25`，**與官方建議完全一致**，這部分不需要改。

**NES 風格的時間格（可選但推薦）** [推論]：

```js
// 用「幀」當最小單位，模擬 60 Hz 驅動
const FRAME = 1 / 60;                 // 16.667 ms
const speed = 6;                      // 每 row 幾幀
const secPerRow = FRAME * speed;      // 0.1 s
const bpm = 3600 / (speed * 4);       // 4 row/beat → 150 BPM
```

這麼做的好處：琶音、顫音、占空比包絡全部以「幀」為單位描述，與 FamiTracker 的資料可以直接對應 [推論]。

### 6.6 與 `../卡比之星/src/audio.js` 現有做法的對照建議

> 已讀該檔頂部註解與關鍵函式；以下是**建議**，不代表現況有錯 [推論]。

| 項目 | 現況 | 建議 | 優先度 |
|---|---|---|---|
| 占空比脈衝波 | `makePulse()` 用 48 次諧波 `PeriodicWave`，備有 `p25` / `p12` | ✅ 做法正確。**補 `p50`** 並加入「占空比包絡」（音符內切換 wave） | 中 |
| 三角波 | `OscillatorNode.type='triangle'`（`setWave` 的 `'tri'`） | 加 `WaveShaper` 做 **16 階量化**；bass 軌改成**固定音量** | 高（最像 NES 的改動） |
| 雜訊 | `makeRes()` 用 `Math.random()` 填 1 秒 buffer | 改 **15-bit LFSR**，並多做一顆 **mode=1（93 步）** buffer | 高 |
| 雜訊音高 | 用 `BiquadFilter` 塑形 | 額外提供「16 段 period」對照表，讓鼓音色與 NES 對齊 | 中 |
| 排程 | `LOOKAHEAD=0.1, TICK_MS=25` | ✅ 與官方建議一致，不動 | — |
| 軌道編制 | p1 主旋律(25%)、p2 和聲(12.5%)、bass 三角、drum 噪音 | ✅ 就是 2A03 的編制。可考慮加**第 5 軌 DPCM 風格鼓**或把 p2 拆成「和聲 / 回音」兩種模式 | 中 |
| 音效搶軌 | 音效走獨立的 `sfxBus`，與音樂並行 | **可選**：為求 NES 味，可在音效播放時短暫靜音對應音樂軌（p2 或 drum） | 低（現代做法其實更好聽） |
| ducking | `duck()` / `DUCK_PAUSE=0.3` / `DUCK_TMP=0.35` | ✅ 已足夠 | — |
| 節流 | `SFX_THROTTLE` 預設 80 ms，並針對高頻音效放寬 | ✅ 設計完善，直接沿用這張表的思路 | — |
| 壓縮器 | `DynamicsCompressor`（threshold -10, ratio 6） | ✅ 近似 2A03 的非線性混音 | — |
| 琶音 | 未見專用機制 | **新增 `arp: [0,4,7]` 音符參數**，以「每 N 幀換一音」實作 | 高（最能增加和聲豐富度） |
| 回音 | 未見專用機制 | 新增「p2 = p1 延遲 3 row、音量 ×0.4、占空比 12.5%」的自動回音模式 | 中 |
| 顫音 | `tone()` 已支援 `vib: {rate, depth}` | ✅ 已有。建議加 **delay**（延遲 8-16 幀才進入顫音） | 低 |
| 離線渲染 | 已有 `renderSong` / `renderSfx`（`OfflineAudioContext`） | ✅ 很好，可用於自動測試與波形比對 | — |

---

## 七、GB / GBC / GBA 音源差異

### 7.1 Game Boy（DMG）/ Game Boy Color 的 LR35902 音源

4 個聲道 [源]：

| # | 聲道 | 內容 | 暫存器 |
|---|---|---|---|
| 1 | Square 1 | 方波 + **頻率掃描（sweep）** + 長度 + 包絡 | `NR10-NR14`（`FF10-FF14`） |
| 2 | Square 2 | 方波 + 長度 + 包絡（無 sweep） | `NR21-NR24` |
| 3 | **Wave** | **32 個 4-bit 取樣的波形記憶體**，音量僅 4 檔 | `NR30-NR34` + Wave RAM `FF30-FF3F` |
| 4 | Noise | LFSR（**15-bit 或 7-bit 兩種寬度**） | `NR41-NR44` |
| — | 控制 | 主音量 + Vin / **左右聲像** / 電源與狀態 | `NR50` / `NR51` / `NR52` |

**訊號鏈** [源]：
- CH1：`Sweep → Timer → Duty → Length → Envelope → Mixer`
- CH2：`Timer → Duty → Length → Envelope → Mixer`
- CH3：`Timer → Wave → Length → Volume → Mixer`
- CH4：`Timer → LFSR → Length → Envelope → Mixer`

**頻率公式** [源]：
- 方波：period = `(2048 - freq) × 4` 時脈；音訊頻率 = `4194304 / period`
  - 即 `f = 131072 / (2048 - x)` Hz
- 波形聲道：period = `(2048 - freq) × 2` 時脈 → `f = 65536 / (2048 - x)` Hz
  - 推導：波形聲道每 `(2048-x)×2` 個時脈前進**一個取樣**，一個完整波形有 32 個取樣，所以實際音高 = `4194304 / ((2048-x) × 2 × 32)` = `65536 / (2048 - x)` Hz [源+推論]。

**波形聲道音量（NR32）** [源]：

| 碼 | 右移 | 音量 |
|---|---|---|
| 0 | 4 | 0%（靜音） |
| 1 | 0 | 100% |
| 2 | 1 | 50% |
| 3 | 2 | 25% |

**雜訊除數碼（NR43，0-7）** [源]：`8, 16, 32, 48, 64, 80, 96, 112`
- 寬度 mode=1 → **7-bit LFSR**（短循環，金屬感），對應 NES 的 mode=1 [源]。

**立體聲聲像** [源]：
- `NR51` 有 8 個 bit，分別決定 4 個聲道是否送到左 / 右。
- **只有「左 / 右 / 兩邊 / 靜音」四種**，沒有連續 pan 值。
- `NR50` 設左右主音量各 0-7，並可混入卡帶的 Vin 音源。

### 7.2 GB 與 NES 的作曲差異

| 面向 | NES（2A03） | GB（DMG） | 對作曲的影響 |
|---|---|---|---|
| 低音聲道 | 三角波（**無音量**） | **Wave 聲道（可換波形、有 4 檔音量）** | GB 的低音更靈活，可做「類 FM」音色；也能拿來當第三支旋律 [推論] |
| 方波數 | 2 | 2 | 相同 |
| 雜訊 | 15-bit / 93 步 | 15-bit / **7-bit** | 概念相同 |
| 取樣 | DPCM（獨立聲道） | **無專用取樣聲道**；LSDj 用 CPU 硬推 Wave RAM 來播取樣 [源] | GB 上取樣成本很高 |
| 聲像 | 單聲道 | **左 / 右分離** | GB 可把回音軌 pan 到另一邊，空間感更好 [推論] |
| 喇叭 | 電視 | **極小的單體喇叭 / 耳機** | 必須簡化和聲（石川淳的策略）[源] |

- **GB 專屬技法** [推論]：
  1. **Wave RAM 即時換波形** → 在一個音符內把波形從「方波」換成「鋸齒」再換成「三角」，等於免費的濾波掃描。
  2. **Wave 聲道當第二旋律**：因為有音量控制，比 NES 三角波更適合唱旋律。
  3. **聲像分離**：主旋律置中（左右都送），回音 / 琶音 pan 到單邊。
  4. **7-bit LFSR 做金屬打擊**：GB 的「金屬 hi-hat」味道。

### 7.3 Game Boy Advance

**兩套系統並存** [源]：

1. **舊的 4 聲道**（DMG 相容：2 方波 + wave + 雜訊）——向下相容，也可與新音源混用。
2. **Direct Sound（DMA Sound）A / B**：兩個 **8-bit 有號 PCM** 通道 [源]。
   - 樣本寫入 `0x040000A0`（`REG_FIFO_A`）起的連續位址，該位址是 **FIFO**，低位址先播 [源]。
   - FIFO 內部容量 **8 × 32-bit = 32 bytes** [源]。
   - 用 **DMA channel 1 或 2** 從內部記憶體搬資料進 FIFO [源]。
   - **取樣率由 Timer 0 或 Timer 1 的溢位決定**，兩個 Direct Sound 通道可用不同 timer 跑不同頻率 [源]。
   - **軟體混音**時兩個通道通常共用同一個 timer [源]。

**對作曲的影響** [推論]：

| 面向 | NES / GB | GBA |
|---|---|---|
| 音源本質 | **合成**（寫暫存器） | **取樣播放 + 軟體混音** |
| 聲部數 | 硬體上限 4-5 | 由 CPU 混音能力決定（Maxmod 通常 8-16 軌） |
| 音色 | 受限於方波 / 三角 / 雜訊 | **任何取樣**（真鼓、吉他、人聲） |
| 資料量 | 極小（1-3 KB / 曲） | 取樣吃 ROM，是主要瓶頸 |
| 製作流程 | Tracker + 硬體效果 | **MOD / XM / IT 模組**（像 PC 的 tracker 音樂） |
| 常見引擎 | famitone2 / GGSound | **Maxmod**（MOD/S3M/XM/IT）、**Krawall**（XM/S3M）[源] |

- [推論] **創作差異最大的一點**：NES / GB 作曲家是在「編程音色」，GBA 作曲家是在「選取樣 + 編曲」。若本專案要「電子音樂像素風」，可以刻意選 **NES/GB 的合成美學**（音色一致、資料小），而不是 GBA 的取樣路線。

---

## 八、原創作曲工作流程與 20 條檢查表

### 8.1 建議工作流程

```
①  決定情緒與場景（3 個形容詞：例如「明亮 / 彈跳 / 好奇」）
     ↓
②  寫動機（4-8 個音，能哼、能在 2 秒內聽完）        ← 最重要的一步
     ↓
③  決定調性與速度（小調 = 緊張 / 大調 = 明亮；BPM 對齊 60 Hz 幀格）
     ↓
④  聲部分配（p1 旋律 / p2 和聲或回音 / tri 低音 / noise 鼓）
     ↓
⑤  先做 8 小節 A 段 → 確認「一軌消失仍成立」
     ↓
⑥  寫 B 段（對比：轉調 / 換節奏 / 換音域）
     ↓
⑦  加過門（最後 1 小節的鼓 fill 或琶音上行）
     ↓
⑧  設 loop point（跳過前奏）、決定總長（30-60 秒）
     ↓
⑨  加細節（顫音、占空比包絡、回音、滑音）
     ↓
⑩  與遊戲一起測：音效會不會蓋掉旋律？在手機喇叭聽得清楚嗎？
```

**近藤浩治的方法（值得直接抄）** [源]：寫好 → **放進遊戲玩** → 若無法配合動作的體感就**整首丟掉重寫**。音樂不是獨立作品，是遊戲手感的一部分。

### 8.2 20 條檢查表

> 完成一首曲子後逐條檢查 [推論，綜合上述來源]。

**動機與旋律**

1. ☐ 動機在 **4-8 個音**內能被辨識，而且**能哼**（石川淳標準）[源]。
2. ☐ 前 **4 小節**就出現最強的記憶點（loop 開頭會被反覆聽到）。
3. ☐ 旋律以**級進為主**、跳進為輔；跳進之後有反向級進填補。
4. ☐ 旋律音域集中在 **C4-C6**，不與音效（C6 以上）打架。
5. ☐ 每 2 小節有清楚的**樂句斷句**（呼吸點），不要一路塞滿。

**和聲與聲部**

6. ☐ Pulse 2 明確扮演一個角色（**和聲 / 對位 / 回音 / 琶音**擇一），不是隨便加音。
7. ☐ 至少有一段用**琶音模擬和弦**（`047` / `037` 等），證明有用上這個技法。
8. ☐ 三角波低音**自己有旋律感**（不是整首同一個音）。
9. ☐ 三角波寫在 **C2-C4**，不要太低（小喇叭放不出來）[源]。
10. ☐ 把 Pulse 2 **關掉**播一次，曲子仍然成立（因為音效會搶軌）。

**節奏與鼓**

11. ☐ 鼓型與遊戲動作的**速度感一致**（跑步 = 八分、衝刺 = 十六分、探索 = 稀疏）。
12. ☐ 每 4 或 8 小節有一個**過門（fill）**。
13. ☐ 雜訊 kick / snare / hat 的**音高（period）明顯不同**，能分辨三種鼓。
14. ☐ BPM 對齊 60 Hz 幀格（`BPM = 900 / speed`，speed 為整數）[推論]。

**結構與長度**

15. ☐ 有明確的 **loop point**，循環時不重播前奏。
16. ☐ 單曲 loop 長度在 **30-60 秒**（關卡）/ **20-40 秒**（魔王）/ **2-5 秒**（jingle）。
17. ☐ A 段與 B 段有**明確對比**（轉調、換音域、換節奏密度至少一項）。

**混音與整合**

18. ☐ 在**手機喇叭 / 筆電喇叭**上聽過一次，旋律仍然清楚。
19. ☐ 播放 jingle 時音樂有 **duck**（降到 30-35%），播完平滑回復 [源]。
20. ☐ **全部原創**：沒有引用任何現有遊戲旋律、沒有使用版權 ROM 抽出的資料；素材與工具授權已確認 [源：`09_法律與原創原則.md` / README 原則]。

---

## 九、來源

### NESdev Wiki（硬體規格）

- APU 總覽 — https://www.nesdev.org/wiki/APU
- APU basics — https://www.nesdev.org/wiki/APU_basics
- APU Pulse（占空比、頻率公式、sweep、t<8 靜音） — https://www.nesdev.org/wiki/APU_Pulse
- APU Triangle（32 步序列、無音量、超音波靜音） — https://www.nesdev.org/wiki/APU_Triangle
- APU Noise（15-bit LFSR、mode 1 的 93 步、NTSC period 表） — https://www.nesdev.org/wiki/APU_Noise
- APU DMC / DPCM（rate 表、4081 bytes 上限、DMA 與手把讀取衝突） — https://www.nesdev.org/wiki/APU_DMC
- APU Mixer（非線性混音公式與線性近似） — https://www.nesdev.org/wiki/APU_Mixer
- APU Frame Counter（240/120/60 Hz、4-step 與 5-step） — https://www.nesdev.org/wiki/APU_Frame_Counter
- NES Audio (APU) 綜述 — https://www.emulationonline.com/systems/nes/apu-audio/
- NESdev 論壇：NES sound effects — https://forums.nesdev.org/viewtopic.php?t=4836

### Game Boy / GBA 硬體

- Game Boy sound hardware（NR10-NR52、Wave RAM、頻率公式、除數表、NR51 聲像） — https://gbdev.gg8.se/wiki/articles/Gameboy_sound_hardware
- Pan Docs — Audio — https://gbdev.io/pandocs/Audio.html
- GBATEK：GBA Sound Channel A and B - DMA Sound — https://problemkaputt.de/gbatek-gba-sound-channel-a-and-b-dma-sound.htm
- gbadoc：Direct Sound — https://gbadev.net/gbadoc/audio/directsound.html
- BeLogic：Gameboy Advance Direct Sound — http://belogic.com/gba/directsound.shtml
- Maxmod Hardware Usage（DMA 1/2、Timer 0） — https://maxmod.devkitpro.org/ref/articles/HardwareUsage.html

### 工具與引擎

- FamiStudio Sound Engine 文件（功能開關、擴充音源、SFX 串流、資源佔用） — https://famistudio.org/doc/soundengine/
- FamiStudio 匯出（NSF / NSFe / ROM） — https://famistudio.org/doc/export/
- FamiStudio Sound Engine（GitHub 文件） — https://github.com/BleuBleu/FamiStudio/blob/master/Docs/docs/soundengine.md
- GGSound（README 與設計目標） — https://github.com/gradualgames/ggsound
- GGSound 發表討論串（與 famitone2 的比較） — https://forums.nesdev.org/viewtopic.php?t=11655
- famitone2（nesicide 內附） — https://github.com/christopherpow/nesicide/tree/master/tools/famitone2
- famitone5.0 — https://github.com/nesdoug/famitone5.0
- neslib 的 FamiTone2 音訊系統說明 — https://deepwiki.com/clbr/neslib/5-audio-system-(famitone2)
- NES Sound Format（NSF / NSFe / NSF2） — http://fileformats.archiveteam.org/wiki/NES_Sound_Format
- hUGETracker 手冊 — https://superdisk.github.io/hUGETracker/
- hUGETracker（GitHub） — https://github.com/SuperDisk/hUGETracker
- Getting Started in hUGETracker（GB Studio Central） — https://gbstudiocentral.com/tips/getting-started-in-hugetracker/
- LSDj（Battle of the Bits Lyceum） — https://battleofthebits.com/lyceum/View/LSDJ
- Furnace tracker（支援晶片清單） — https://github.com/tildearrow/furnace
- DefleMask 官網 — https://www.deflemask.com/
- Krawall（XM/S3M GBA 播放器，LGPL 開源） — https://github.com/sebknzl/krawall
- Krawall（Battle of the Bits Lyceum） — https://battleofthebits.com/lyceum/View/Krawall
- Creating Music and Sound for the NES: A Primer for Using FamiTracker — https://megacatstudios.com/blogs/retro-development/creating-music-and-sound-for-nes-games

### Web Audio

- Chris Wilson, "A Tale of Two Clocks" — Scheduling Web Audio with Precision（25 ms tick / 100 ms lookahead） — https://web.dev/articles/audio-scheduling
- MDN：PeriodicWave — https://developer.mozilla.org/en-US/docs/Web/API/PeriodicWave
- MDN：WaveShaperNode — https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode

### 作曲家訪談與樂曲分析

- 近藤浩治 2001 年訪談（翻譯） — https://shmuplations.com/kojikondo/
- Nintendo Life：近藤浩治談 Mario 與 Zelda（2001 訪談翻譯報導） — https://www.nintendolife.com/news/2016/11/composer_koji_kondo_talks_super_mario_and_zelda_in_freshly_translated_2001_interview
- Wikipedia：Super Mario Bros. theme（C 大調、4/4、100 BPM、T-SQUARE 影響、2023 年入選國家錄音登記處） — https://en.wikipedia.org/wiki/Super_Mario_Bros._theme
- 美國國會圖書館：Super Mario Bros. Theme 專文（PDF） — https://www.loc.gov/static/programs/national-recording-preservation-board/documents/Super-Mario-Brothers-Theme_Gibson.pdf
- Twenty Thousand Hertz：Super Mario Bros. — https://www.20k.org/episodes/super-mario-bros
- Hooktheory：Super Mario Bros Overworld Theme 分析 — https://www.hooktheory.com/theorytab/view/koji-kondo/super-mario-bros-overworld-theme
- Zelda Universe：〈The Copyright Incident〉—— 波麗露與 Zelda 主題的由來 — https://zeldauniverse.net/2019/10/22/zeldas-study-the-copyright-incident-responsible-for-the-iconic-zelda-theme/
- Nintendo Life：Zelda 開場曲差點不存在 — https://www.nintendolife.com/news/2016/11/an_intriguing_tale_of_how_the_legend_of_zeldas_iconic_opening_song_almost_never_happened
- Siliconera：Mega Man 2 作曲家立石孝談 Wily Stage 1 — https://www.siliconera.com/mega-man-2s-composer-reveals-how-wily-stage-1-and-other-themes-came-to-be/
- Rockman Corner：立石孝幕後訪談 — https://www.rockman-corner.com/2019/01/go-behind-scenes-of-mega-man-2-with.html
- Hooktheory：Mega Man 2 - Dr Wily Stage 1 分析（升 C 小調 / 弗里吉安） — https://www.hooktheory.com/theorytab/view/takashi-tateishi/mega-man-2---dr-wily-stage-1
- VGMO：Mega Man 1 & 2 音效團隊訪談（松前真奈美的作曲流程、6502 資料化） — https://vgmonline.net/megamaninterview/
- Brave Wave：A Conversation with Manami Matsumae — https://bravewave.net/interviews/a-conversation-with-manami-matsumae/
- Hooktheory：Castlevania - Vampire Killer 分析 — https://www.hooktheory.com/theorytab/view/kinuyo-yamashita/castlevania---vampire-killer
- Wikipedia：Kinuyo Yamashita — https://en.wikipedia.org/wiki/Kinuyo_Yamashita
- Original Sound Version：Dragon Quest Overture 只花 5 分鐘 — https://www.originalsoundversion.com/dragon-quest-overture-took-5-minutes-to-write/
- Dragon Quest Wiki：Overture — https://dragon-quest.org/wiki/Overture
- Wikipedia：Koichi Sugiyama — https://en.wikipedia.org/wiki/Koichi_Sugiyama
- Shinesparkers：Hirokazu Tanaka 訪談 — https://shinesparkers.net/interviews/hirokazu-tanaka/
- Metroid Database：Metroid Music（田中宏和的 amelodic 手法） — https://metroiddatabase.com/old_site/m1/music.php
- Tommi Salomaa：Music and Sound in Nintendo's Metroid（分析論文 PDF） — http://www.tommisalomaa.com/misc/metroid_music_analysis.pdf
- WiKirby：Jun Ishikawa（GB 喇叭限制下的簡化策略） — https://wikirby.com/wiki/Jun_Ishikawa
- WiKirby：Green Greens (theme) — https://wikirby.com/wiki/Green_Greens_(theme)
- WiKirby：Kirby's Dream Land 開發史 — https://wikirby.com/wiki/Kirby%27s_Dream_Land/development
- Wikipedia：Korobeiniki（1861 年 Nekrasov 詩、1989 年田中宏和改編 Type A、A 小調、2002 年起強制收錄） — https://en.wikipedia.org/wiki/Korobeiniki
- Red Bull Music Academy：Yuzo Koshiro 訪談（PC-88、自製 MML "Music Love"、Mucom88） — https://daily.redbullmusicacademy.com/2014/09/yuzo-koshiro-interview/
- shmuplations：Yuzo Koshiro 2001 訪談 — https://shmuplations.com/yuzokoshiro/
- shmuplations：Streets of Rage 作曲家訪談合集 — https://shmuplations.com/sormusic/
- Red Bull Music Academy：Nobuo Uematsu 訪談（「限制越多越有創意」） — https://daily.redbullmusicacademy.com/2014/10/nobuo-uematsu-interview/
- Red Bull Music Academy：Yoko Shimomura 訪談（Street Fighter II 的創作流程） — https://daily.redbullmusicacademy.com/2014/09/yoko-shimomura-interview/

### chiptune 技法教學

- Ozzed：How to make 8-bit Music — A comprehensive guide（回音、琶音、聲部分配） — https://ozzed.net/how-to-make-8-bit-music.shtml
- Baby Audio：Chiptune Producer's Guide — https://babyaud.io/blog/chiptune-producers-guide
- LANDR：How to Make Chiptune Music in 7 Steps — https://blog.landr.com/how-to-make-chiptune-music/
- 8UP：What Is 8-Bit Sound? NES Audio Limitations — https://8bitsamples.com/pages/what-is-8-bit-sound
- SFX Engine：How to Create Retro Game Sounds — https://sfxengine.com/blog/how-to-create-retro-game-sounds
- OpenGameArt：Kickin' it old school — Setting up NES style chiptunes — https://opengameart.org/forumtopic/kickin-it-old-school-setting-up-nes-style-chiptunes

### 本專案內部參照

- `../卡比之星/src/audio.js`（既有 Web Audio 實作：`makePulse` / `makeRes` / `LOOKAHEAD=0.1, TICK_MS=25` / `SFX_THROTTLE` / `duck()` / `renderSong`）
- `docs/research/01_硬體規格與限制.md`（APU 在整體硬體中的位置）
- `docs/research/07_掌機_GB_GBC_GBA_規格與差異.md`
- `docs/research/09_法律與原創原則.md`
