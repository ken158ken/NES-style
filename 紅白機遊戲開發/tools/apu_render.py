# -*- coding: utf-8 -*-
"""
tools/apu_render.py — 用 Playwright 載入 engine/apu.js + engine/music.js，
離線 render 出 PCM、寫成 16-bit WAV，並做簡單頻譜檢查。

用法：
    ../卡比之星/.venv/bin/python tools/apu_render.py
    ../卡比之星/.venv/bin/python tools/apu_render.py --seconds 15 --rate 44100
    ../卡比之星/.venv/bin/python tools/apu_render.py --only demo,p1_a4
    ../卡比之星/.venv/bin/python tools/apu_render.py --song mySong.js:MY_SONG   # 自訂曲（全域變數名）

輸出：shots/agent_apu/*.wav（shots/ 不進 git）

頻譜檢查（純 Python，不需 numpy；自帶 radix-2 FFT）：
  - 各聲道單獨開時的基頻是否正確（自相關 + 頻譜峰值雙重估計）
  - 三角波換音高時振幅不變（真機沒有音量暫存器）
  - 雜訊長模式是寬頻（頻譜平坦度高）、方波是窄帶（平坦度低）
"""
import argparse, base64, cmath, math, pathlib, struct, sys, wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
APU = ROOT / 'engine' / 'apu.js'
MUSIC = ROOT / 'engine' / 'music.js'
OUTDIR = ROOT / 'shots' / 'agent_apu'

# ------------------------------------------------------------------ 訊號分析

def fft(a):
    n = len(a)
    if n == 1:
        return a
    ev = fft(a[0::2]); od = fft(a[1::2])
    out = [0j] * n
    for k in range(n // 2):
        t = cmath.exp(-2j * cmath.pi * k / n) * od[k]
        out[k] = ev[k] + t
        out[k + n // 2] = ev[k] - t
    return out


def next_pow2(n):
    p = 1
    while p < n:
        p *= 2
    return p


def spectrum(x):
    """回傳 (magnitudes, n) — 已去直流、加 Hann 窗。"""
    n = next_pow2(len(x))
    m = sum(x) / len(x)
    w = [(x[i] - m) * (0.5 - 0.5 * math.cos(2 * math.pi * i / (len(x) - 1))) for i in range(len(x))]
    w += [0.0] * (n - len(w))
    F = fft([complex(v, 0) for v in w])
    return [abs(v) for v in F[:n // 2]], n


def autocorr_f0(x, sr, fmin=50.0, fmax=5000.0):
    """FFT 自相關估基頻。"""
    m = sum(x) / len(x)
    y = [v - m for v in x]
    n = next_pow2(2 * len(y))
    F = fft([complex(v, 0) for v in y] + [0j] * (n - len(y)))
    P = [complex(abs(v) ** 2, 0) for v in F]
    R = fft([v.conjugate() for v in P])
    R = [(v.conjugate() / n).real for v in R]
    lo = max(1, int(sr / fmax))
    hi = min(len(y) // 2, int(sr / fmin))
    if hi <= lo or R[0] <= 0:
        return 0.0, 0.0
    # 先跳過「第一個負值」之前的區段，否則平滑波形（例如低音三角波）
    # 會在極小 lag 上得到假峰值
    start = lo
    while start < hi and R[start] > 0:
        start += 1
    if start >= hi:
        start = lo
    best, bl = -1e30, start
    for lag in range(start, hi):
        if R[lag] > best:
            best, bl = R[lag], lag
    # 拋物線內插提高解析度
    if 1 <= bl < len(R) - 1:
        a, b, c = R[bl - 1], R[bl], R[bl + 1]
        d = a - 2 * b + c
        if d != 0:
            bl = bl + 0.5 * (a - c) / d
    return sr / bl, best / R[0]


def peak_freq(x, sr):
    mags, n = spectrum(x)
    k = max(range(2, len(mags)), key=lambda i: mags[i])
    return k * sr / n


def flatness(x, sr, lo=100.0, hi=15000.0):
    """頻譜平坦度（幾何平均 / 算術平均）：接近 1 = 寬頻雜訊，接近 0 = 純音。"""
    mags, n = spectrum(x)
    k0 = max(1, int(lo * n / sr)); k1 = min(len(mags) - 1, int(hi * n / sr))
    vals = [max(m, 1e-12) for m in mags[k0:k1]]
    if not vals:
        return 0.0
    g = math.exp(sum(math.log(v) for v in vals) / len(vals))
    a = sum(vals) / len(vals)
    return g / a


def harmonic_db(x, sr, f0, n):
    """第 n 次諧波相對基頻的 dB。"""
    mags, N = spectrum(x)
    def at(f):
        k = int(round(f * N / sr))
        return max(mags[max(1, k - 2): k + 3]) if k + 3 < len(mags) else 1e-12
    h1, hn = at(f0), at(f0 * n)
    return 20 * math.log10(max(hn, 1e-12) / max(h1, 1e-12))


def rms(x):
    m = sum(x) / len(x)
    return math.sqrt(sum((v - m) ** 2 for v in x) / len(x))


def ptp(x):
    return max(x) - min(x)


def write_wav(path, samples, sr):
    path.parent.mkdir(parents=True, exist_ok=True)
    m = sum(samples) / len(samples)
    data = bytearray()
    clipped = 0
    for v in samples:
        s = int(round((v - m) * 32767))
        if s > 32767:
            s = 32767; clipped += 1
        elif s < -32768:
            s = -32768; clipped += 1
        data += struct.pack('<h', s)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(bytes(data))
    return clipped


# ---------------------------------------------------------------- JS 渲染碼

JS = r"""
window.R = (function(){
  const A = window.NES.APU, M = window.NES.Music;

  function b64(f32){
    const n = f32.length;
    let mean = 0; for (let i=0;i<n;i++) mean += f32[i]; mean /= n;
    const i16 = new Int16Array(n);
    for (let i=0;i<n;i++){
      let s = Math.round((f32[i]-mean) * 32767);
      if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
      i16[i] = s;
    }
    const bytes = new Uint8Array(i16.buffer);
    let str = '';
    for (let i=0;i<bytes.length;i+=8192)
      str += String.fromCharCode.apply(null, bytes.subarray(i, i+8192));
    return btoa(str);
  }
  function rawb64(f32){          // 未去直流，讓 Python 自己處理
    const n = f32.length;
    const i16 = new Int16Array(n);
    for (let i=0;i<n;i++){
      let s = Math.round(f32[i] * 32767);
      if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
      i16[i] = s;
    }
    const bytes = new Uint8Array(i16.buffer);
    let str = '';
    for (let i=0;i<bytes.length;i+=8192)
      str += String.fromCharCode.apply(null, bytes.subarray(i, i+8192));
    return btoa(str);
  }

  function raw(sr){ return A.create({sampleRate: sr, highpass: 0, lowpass: 0}); }
  function nes(sr){ return A.create({sampleRate: sr}); }   // 真機式濾波（90Hz HP / 14kHz LP）

  // 單聲道測試音：回傳未濾波的原始混音（分析用）
  function tone(kind, sr, seconds, opt){
    opt = opt || {};
    const a = raw(sr);
    const P = M.PULSE_PERIOD, T = M.TRI_PERIOD;
    if (kind === 'p1' || kind === 'p2'){
      const base = kind === 'p1' ? 0x4000 : 0x4004;
      const bit  = kind === 'p1' ? 1 : 2;
      const p = P[M.noteToMidi(opt.note)];
      a.write(0x4015, bit);
      a.write(base+0, ((opt.duty||1)<<6) | 0x30 | 15);
      a.write(base+1, 0x08);
      a.write(base+2, p & 0xFF);
      a.write(base+3, (1<<3) | ((p>>8)&7));
    } else if (kind === 'tri'){
      const p = T[M.noteToMidi(opt.note)];
      a.write(0x4015, 4);
      a.write(0x4008, 0xFF);
      a.write(0x400A, p & 0xFF);
      a.write(0x400B, (1<<3) | ((p>>8)&7));
    } else if (kind === 'noise'){
      a.write(0x4015, 8);
      a.write(0x400C, 0x30 | 15);
      a.write(0x400E, (opt.mode ? 0x80 : 0) | (opt.period & 15));
      a.write(0x400F, 1<<3);
    } else if (kind === 'dpcm'){
      a.setDpcmSample(opt.bytes);
      a.write(0x4010, 0x40 | (opt.rate & 15));     // loop
      a.write(0x4011, 64);
      a.write(0x4012, 0);
      a.write(0x4013, Math.max(0, Math.ceil((opt.bytes.length-1)/16)));
      a.write(0x4015, 0x10);
    } else if (kind === 'all'){
      // 五聲道同時（測非線性混音）
      const p = P[M.noteToMidi('A-4')];
      a.write(0x4015, 0x1F);
      a.write(0x4000, (1<<6)|0x30|15); a.write(0x4001,8);
      a.write(0x4002, p&0xFF); a.write(0x4003,(1<<3)|((p>>8)&7));
      const p2 = P[M.noteToMidi('E-5')];
      a.write(0x4004, (1<<6)|0x30|15); a.write(0x4005,8);
      a.write(0x4006, p2&0xFF); a.write(0x4007,(1<<3)|((p2>>8)&7));
      const t = T[M.noteToMidi('A-2')];
      a.write(0x4008,0xFF); a.write(0x400A,t&0xFF); a.write(0x400B,(1<<3)|((t>>8)&7));
      a.write(0x400C,0x30|10); a.write(0x400E,6); a.write(0x400F,1<<3);
    }
    return a.render(Math.round(sr*seconds));
  }

  function song(sr, seconds, songObj){
    const a = nes(sr);
    const m = M.create(a);
    m.define('jump', M.DEMO.sfx.jump);
    m.define('coin', M.DEMO.sfx.coin);
    m.play(songObj || M.DEMO.song, {loop:true});
    const frames = Math.round(seconds * A.FRAME_HZ);
    const parts = []; let total = 0;
    for (let f=0; f<frames; f++){
      m.tick();
      const b = a.tick();
      parts.push(b); total += b.length;
    }
    const out = new Float32Array(total);
    let o = 0;
    for (const p of parts){ out.set(p, o); o += p.length; }
    return out;
  }

  function sfxOnly(sr, name, seconds){
    const a = nes(sr);
    const m = M.create(a);
    m.define(name, M.DEMO.sfx[name]);
    m.sfx(name);
    const frames = Math.round(seconds * A.FRAME_HZ);
    const parts = []; let total = 0;
    for (let f=0; f<frames; f++){
      if (f === 2) m.sfx(name);
      m.tick();
      const b = a.tick(); parts.push(b); total += b.length;
    }
    const out = new Float32Array(total); let o=0;
    for (const p of parts){ out.set(p,o); o+=p.length; }
    return out;
  }

  // 原創 DPCM 取樣：1-bit 差分編碼的短打擊聲（衰減方波 → delta 編碼）
  function drumSample(nBytes){
    const bytes = new Uint8Array(nBytes);
    let level = 64, target, t = 0;
    for (let i=0;i<nBytes;i++){
      let b = 0;
      for (let k=0;k<8;k++){
        const env = Math.max(0, 1 - t/(nBytes*8));
        const ph = Math.sin(t * 0.35) + 0.6*Math.sin(t*1.7+1.1);
        target = 64 + 50 * env * (ph > 0 ? 1 : -1);
        const bit = (target > level) ? 1 : 0;
        level += bit ? 2 : -2;
        if (level > 127) level = 127; if (level < 0) level = 0;
        b |= bit << k;
        t++;
      }
      bytes[i] = b;
    }
    return bytes;
  }

  // 三角波瞬時輸出的位準集合（真機 32 階 = 0..15 各出現兩次）
  function triLevels(){
    const a = raw(44100);
    a.write(0x4015,4); a.write(0x4008,0xFF);
    a.write(0x400A,0x0F); a.write(0x400B,(1<<3)|0);
    a.clock(7457);
    const set = {};
    for (let i=0;i<200;i++){ a.clock(16); set[a.state().triangle.out] = 1; }
    const levels = Object.keys(set).map(Number).sort((x,y)=>x-y);
    return {count: levels.length, levels: levels};
  }

  return {tone, song, sfxOnly, drumSample, b64, rawb64, triLevels,
          noteFreq: function(n){ return M.freqOf(M.noteToMidi(n)); },
          pulseF: function(n){ const p = M.PULSE_PERIOD[M.noteToMidi(n)]; return A.CPU_HZ/(16*(p+1)); },
          triF:   function(n){ const p = M.TRI_PERIOD[M.noteToMidi(n)];   return A.CPU_HZ/(32*(p+1)); }};
})();
"""


def decode(b64s):
    raw = base64.b64decode(b64s)
    n = len(raw) // 2
    ints = struct.unpack('<%dh' % n, raw)
    return [v / 32767.0 for v in ints]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seconds', type=float, default=10.0, help='曲子渲染秒數（預設 10）')
    ap.add_argument('--rate', type=int, default=44100)
    ap.add_argument('--tone-seconds', type=float, default=1.0)
    ap.add_argument('--out-dir', default=str(OUTDIR))
    ap.add_argument('--only', default='', help='逗號分隔，只跑這些 clip')
    ap.add_argument('--song', default='', help='自訂曲：<js 檔路徑>:<全域變數名>')
    args = ap.parse_args()

    outdir = pathlib.Path(args.out_dir)
    only = set(s.strip() for s in args.only.split(',') if s.strip())
    sr = args.rate

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('需要 playwright：../卡比之星/.venv/bin/python -m pip install playwright', file=sys.stderr)
        return 2

    results = []
    checks = []

    def ck(name, ok, detail=''):
        checks.append((name, bool(ok), detail))
        print('  [%s] %s%s' % ('PASS' if ok else 'FAIL', name, ('  — ' + detail) if detail else ''))

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('about:blank')
        page.add_script_tag(path=str(APU))
        page.add_script_tag(path=str(MUSIC))
        song_expr = 'null'
        if args.song:
            f, _, var = args.song.partition(':')
            page.add_script_tag(path=f)
            song_expr = 'window.' + (var or 'SONG')
        page.evaluate(JS)
        if errs:
            print('JS 錯誤：', errs, file=sys.stderr)
            return 2

        ts = args.tone_seconds

        clips = [
            ('demo_song', "()=>R.b64(R.song(%d, %f, %s))" % (sr, args.seconds, song_expr), '整首 demo（五聲道 + 真機式濾波）'),
            ('p1_a4_duty1', "()=>R.rawb64(R.tone('p1',%d,%f,{note:'A-4',duty:1}))" % (sr, ts), '方波 1 / A-4 / 25%'),
            ('p1_a4_duty0', "()=>R.rawb64(R.tone('p1',%d,%f,{note:'A-4',duty:0}))" % (sr, ts), '方波 1 / A-4 / 12.5%'),
            ('p1_a4_duty2', "()=>R.rawb64(R.tone('p1',%d,%f,{note:'A-4',duty:2}))" % (sr, ts), '方波 1 / A-4 / 50%'),
            ('p2_a5', "()=>R.rawb64(R.tone('p2',%d,%f,{note:'A-5',duty:1}))" % (sr, ts), '方波 2 / A-5'),
            ('tri_a2', "()=>R.rawb64(R.tone('tri',%d,%f,{note:'A-2'}))" % (sr, ts), '三角波 / A-2'),
            ('tri_a3', "()=>R.rawb64(R.tone('tri',%d,%f,{note:'A-3'}))" % (sr, ts), '三角波 / A-3'),
            ('tri_c4', "()=>R.rawb64(R.tone('tri',%d,%f,{note:'C-4'}))" % (sr, ts), '三角波 / C-4'),
            ('noise_long_p4', "()=>R.rawb64(R.tone('noise',%d,%f,{mode:0,period:4}))" % (sr, ts), '雜訊 長模式 / period 4'),
            ('noise_long_p12', "()=>R.rawb64(R.tone('noise',%d,%f,{mode:0,period:12}))" % (sr, ts), '雜訊 長模式 / period 12（大鼓域）'),
            ('noise_short_p4', "()=>R.rawb64(R.tone('noise',%d,%f,{mode:1,period:4}))" % (sr, ts), '雜訊 短模式（93 步）/ period 4'),
            ('noise_short_p8', "()=>R.rawb64(R.tone('noise',%d,%f,{mode:1,period:8}))" % (sr, ts), '雜訊 短模式 / period 8（金屬感）'),
            ('dpcm_drum', "()=>R.rawb64(R.tone('dpcm',%d,%f,{rate:14,bytes:R.drumSample(64)}))" % (sr, ts), 'DPCM 原創鼓（1-bit 差分）'),
            ('all_channels', "()=>R.rawb64(R.tone('all',%d,%f,{}))" % (sr, ts), '五聲道同時（非線性混音）'),
            ('sfx_jump', "()=>R.b64(R.sfxOnly(%d,'jump',1.0))" % sr, '音效 jump'),
            ('sfx_coin', "()=>R.b64(R.sfxOnly(%d,'coin',1.2))" % sr, '音效 coin'),
        ]

        data = {}
        print('== 渲染 ==')
        for name, expr, desc in clips:
            if only and name not in only:
                continue
            b = page.evaluate(expr)
            x = decode(b)
            data[name] = x
            p = outdir / (name + '.wav')
            clipped = write_wav(p, x, sr)
            dur = len(x) / sr
            print('  %-16s %6.2fs  RMS=%.4f  峰峰值=%.4f  %s%s'
                  % (name, dur, rms(x), ptp(x), desc, ('  ⚠ 削波 %d' % clipped) if clipped else ''))
            results.append((name, p, dur))

        # 期望頻率（由 APU timer 反算，不是等程音高，所以會有 ±0.5% 的量化差）
        exp = {}
        for n in ['A-4', 'A-5']:
            exp[n] = page.evaluate("()=>R.pulseF('%s')" % n)
        for n in ['A-2', 'A-3', 'C-4']:
            exp[n] = page.evaluate("()=>R.triF('%s')" % n)
        tri_levels = page.evaluate("()=>R.triLevels()")
        browser.close()

    print('\n== 頻譜檢查 ==')
    win = 8192

    def seg(name):
        x = data[name]
        s = min(len(x) // 4, sr // 4)
        return x[s:s + win]

    # 1) 各聲道單獨開時基頻正確
    for name, note, kind in [('p1_a4_duty1', 'A-4', '方波 1'), ('p1_a4_duty0', 'A-4', '方波 1 12.5%'),
                             ('p1_a4_duty2', 'A-4', '方波 1 50%'), ('p2_a5', 'A-5', '方波 2'),
                             ('tri_a2', 'A-2', '三角波'), ('tri_a3', 'A-3', '三角波'),
                             ('tri_c4', 'C-4', '三角波')]:
        if name not in data:
            continue
        x = seg(name)
        f0, conf = autocorr_f0(x, sr)
        fp = peak_freq(x, sr)
        want = exp[note]
        err = abs(f0 - want) / want * 100
        ck('基頻 %-10s %s = %.1f Hz（期望 %.1f）' % (name, kind, f0, want),
           err < 1.0, '誤差 %.2f%%、頻譜峰 %.1f Hz、自相關信心 %.2f' % (err, fp, conf))

    # 2) 三角波沒有音量控制：不同音高的峰峰值應相同
    if 'tri_a2' in data and 'tri_a3' in data and 'tri_c4' in data:
        amps = [ptp(data[n]) for n in ['tri_a2', 'tri_a3', 'tri_c4']]
        spread = (max(amps) - min(amps)) / max(amps)
        ck('三角波無音量變化（三個音高的峰峰值一致）', spread < 0.02,
           'A-2=%.5f A-3=%.5f C-4=%.5f 差異 %.3f%%' % (amps[0], amps[1], amps[2], spread * 100))
        # 三角波的諧波結構：3 次諧波約 -19 dB（方波 50% 約 -9.5 dB）
        d3_tri = harmonic_db(seg('tri_c4'), sr, exp['C-4'], 3)
        d3_sq = harmonic_db(seg('p1_a4_duty2'), sr, exp['A-4'], 3)
        ck('三角波諧波結構（3 次諧波 %.1f dB，比 50%% 方波的 %.1f dB 弱）' % (d3_tri, d3_sq),
           d3_tri < -14 and d3_tri < d3_sq - 5)
        ck('三角波瞬時輸出只有 16 個位準（32 階梯波）', tri_levels['count'] == 16,
           '位準集合 = %s' % tri_levels['levels'])

    # 3) 雜訊寬頻 / 方波窄帶
    if 'noise_long_p4' in data and 'p1_a4_duty1' in data:
        fn = flatness(seg('noise_long_p4'), sr)
        fp = flatness(seg('p1_a4_duty1'), sr)
        ck('雜訊長模式是寬頻（平坦度 %.3f）' % fn, fn > 0.2, '方波平坦度 %.3f' % fp)
        ck('方波是窄帶（平坦度 %.3f < 雜訊 %.3f）' % (fp, fn), fp < fn / 2)
    if 'noise_short_p4' in data and 'noise_long_p4' in data:
        fs = flatness(seg('noise_short_p4'), sr)
        fl = flatness(seg('noise_long_p4'), sr)
        ck('雜訊短模式是窄帶有音高（平坦度 %.3f << 長模式 %.3f）' % (fs, fl), fs < fl / 4)
        # period index 4（4 cycles）的 93 步循環約 4811 Hz，在 44.1kHz 下每週期只有 9 個樣本、
        # 自相關解析度不足；改用 period index 8（202 cycles）驗證循環頻率。
        if 'noise_short_p8' in data:
            f0s, conf = autocorr_f0(seg('noise_short_p8'), sr, fmin=40.0, fmax=1000.0)
            want = 1789773.0 / 202 / 93      # LFSR 時脈 / 93 步
            ck('雜訊短模式循環頻率 %.1f Hz（理論 %.1f Hz = 1789773/202/93）' % (f0s, want),
               abs(f0s - want) / want < 0.03, '自相關信心 %.2f' % conf)
    if 'noise_long_p12' in data and 'noise_long_p4' in data:
        # period 12 的頻譜重心應該明顯低於 period 4
        def centroid(x):
            mags, n = spectrum(x)
            num = sum(m * k for k, m in enumerate(mags))
            den = sum(mags) or 1
            return num / den * sr / n
        c4, c12 = centroid(seg('noise_long_p4')), centroid(seg('noise_long_p12'))
        ck('雜訊週期索引越大 → 頻譜越低（%.0f Hz → %.0f Hz）' % (c4, c12), c12 < c4 * 0.6)

    # 4) 非線性混音：五聲道同時的振幅小於各聲道振幅相加
    if 'all_channels' in data:
        solo = sum(ptp(data[n]) for n in ['p1_a4_duty1', 'p2_a5', 'tri_a2', 'noise_long_p12'] if n in data)
        both = ptp(data['all_channels'])
        ck('非線性混音：合奏峰峰值 %.4f < 各聲道相加 %.4f' % (both, solo), both < solo,
           '壓縮比 %.2f' % (both / solo if solo else 0))

    # 5) demo 曲：有訊號、不削波、頻譜含低中高三段
    if 'demo_song' in data:
        x = data['demo_song']
        pk = max(abs(v) for v in x)
        ck('demo 曲有訊號且不削波', 0.02 < pk < 0.999, '峰值 %.4f、RMS %.4f' % (pk, rms(x)))
        mags, n = spectrum(x[sr: sr + win])
        def band(lo, hi):
            k0, k1 = int(lo * n / sr), int(hi * n / sr)
            return sum(mags[k0:k1])
        lo, mid, hi = band(60, 300), band(300, 2000), band(2000, 12000)
        ck('demo 曲低 / 中 / 高頻都有能量', lo > 0 and mid > 0 and hi > 0,
           '低=%.1f 中=%.1f 高=%.1f' % (lo, mid, hi))

    npass = sum(1 for _, ok, _ in checks if ok)
    print('\n輸出目錄：%s' % outdir)
    print('檢查 %d 項，通過 %d，失敗 %d' % (len(checks), npass, len(checks) - npass))
    return 0 if npass == len(checks) else 1


if __name__ == '__main__':
    sys.exit(main())
