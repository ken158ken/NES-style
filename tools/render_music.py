# -*- coding: utf-8 -*-
"""
以 Playwright(Chromium) 開啟 tools/audio_test.html，用 OfflineAudioContext 離線渲染每個音效與每首曲子，
檢查：不拋錯、輸出非靜音（peak > 門檻）、不爆音（peak < 1.0）。
也可輸出 WAV 供人耳試聽。
用法：
  python tools/render_music.py                 # 只檢查
  python tools/render_music.py --wav shots/audio   # 另存 WAV（每首曲子渲染 --secs 秒；音效渲染 2.5 秒）
  python tools/render_music.py --secs 12 --only green,boss
"""
import argparse, pathlib, struct, sys, wave
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'tools' / 'audio_test.html').as_uri()

def write_wav(path, samples, sr):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(struct.pack('<%dh' % len(samples), *[max(-32767, min(32767, int(s * 32767))) for s in samples]))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--secs', type=float, default=8.0, help='每首曲子渲染秒數（循環曲）')
    ap.add_argument('--wav', default='', help='輸出 WAV 目錄')
    ap.add_argument('--only', default='', help='只處理這些名稱（逗號分隔）')
    a = ap.parse_args()
    only = set(a.only.split(',')) if a.only else None
    logs, bad = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(PAGE)
        pg.wait_for_function('()=>window.KB && KB.audio && KB.audio.SFX_NAMES')
        # 即時 API：未 unlock 前連打不得拋錯，且 music 會 pending；unlock 後 pending 曲自動播放、音序器實際推進、切歌 / 停止 / 靜音皆正常
        pg.evaluate("""()=>{ for (const n of KB.audio.SFX_NAMES) { KB.audio.sfx(n); KB.audio.sfx(n); } KB.audio.music('green'); }""")
        st0 = pg.evaluate("()=>KB.audio.status()")
        print('before unlock:', st0)
        pg.evaluate("()=>KB.audio.unlock()")
        pg.keyboard.press('KeyM'); pg.keyboard.press('KeyM')   # M 鍵切換靜音兩次
        pg.wait_for_timeout(1200)
        st1 = pg.evaluate("()=>KB.audio.status()")
        print('after unlock :', st1)
        pg.evaluate("""()=>{ for (const n of KB.audio.SFX_NAMES) KB.audio.sfx(n); KB.audio.music('green'); KB.audio.music('boss'); }""")
        pg.wait_for_timeout(700)
        st2 = pg.evaluate("()=>KB.audio.status()")
        print('after switch :', st2)
        pg.evaluate("()=>KB.audio.music(null)")
        pg.wait_for_timeout(200)
        st3 = pg.evaluate("()=>KB.audio.status()")
        print('after stop   :', st3)
        # 音量 / duck API（提供給 ui-menu）
        api = pg.evaluate("()=>['setVolume','getVolume','duck','setMute','status'].filter(k=>typeof KB.audio[k]!=='function')")
        if api:
            print('  <-- 缺少 API:', api); bad += 1
        vol = pg.evaluate("""()=>{
            const before = KB.audio.getVolume();
            KB.audio.setVolume({music:0.35}); const a = KB.audio.getVolume();
            KB.audio.setVolume({sfx:0.5});    const b = KB.audio.getVolume();
            KB.audio.setVolume({music:2, sfx:-1}); const c = KB.audio.getVolume();
            KB.audio.duck(true);  const d = KB.audio.status().ducked;
            KB.audio.duck(false); const e = KB.audio.status().ducked;
            KB.audio.setVolume(before);
            return {a, b, c, d, e, restored: KB.audio.getVolume()};
        }""")
        okvol = (vol['a']['music'] == 0.35 and vol['b']['sfx'] == 0.5 and vol['b']['music'] == 0.35
                 and vol['c']['music'] == 1 and vol['c']['sfx'] == 0 and vol['d'] is True and vol['e'] is False)
        print('volume/duck  :', vol, '' if okvol else '  <-- 音量 / duck API 異常')
        if not okvol: bad += 1
        if st1.get('ctxState') == 'running':
            if not (st1['unlocked'] and st1['playing'] == 'green' and st1['step'] > 0 and not st1['muted']): print('  <-- 即時音序器狀態異常'); bad += 1
            if not (st2['playing'] == 'boss' and st3['playing'] is None): print('  <-- 切歌 / 停止異常'); bad += 1
        else:
            print('  (此環境 AudioContext 無法啟動，略過即時音序器檢查)')
        js = """async ([kind, name, secs, wantData]) => {
            const buf = kind === 'sfx' ? await KB.audio.renderSfx(name) : await KB.audio.renderSong(name, secs);
            const st = window.__audioStats(buf);
            if (wantData) st.data = Array.from(buf.getChannelData(0));
            st.sr = buf.sampleRate;
            return st;
        }"""
        names = [('sfx', n) for n in pg.evaluate("()=>KB.audio.SFX_NAMES")] + [('music', n) for n in pg.evaluate("()=>KB.audio.MUSIC_NAMES")]
        for kind, name in names:
            if only and name not in only:
                continue
            try:
                secs = a.secs if kind == 'music' else None
                st = pg.evaluate(js, [kind, name, secs, bool(a.wav)])
                flag = ''
                if st['peak'] < 0.02: flag = '  <-- 幾乎無聲'; bad += 1
                if st['peak'] >= 0.999: flag = '  <-- 爆音(clip)'; bad += 1
                print(f"{kind:5} {name:10} peak={st['peak']:.3f} rms={st['rms']:.4f} secs={st['secs']}{flag}")
                if a.wav:
                    write_wav(pathlib.Path(a.wav) / f'{kind}_{name}.wav', st['data'], st['sr'])
            except Exception as e:
                bad += 1
                print(f'{kind:5} {name:10} ERROR {e}')
        if only:
            missing = sorted(only - {n for _, n in names})
            if missing:
                print('  <-- --only 指定了不存在的名稱:', ','.join(missing)); bad += len(missing)
        b.close()
    errs = [l for l in logs if 'error' in l.lower()]
    if errs:
        print('\n'.join(errs)); bad += len(errs)
    print('\n' + ('全部通過' if not bad else f'{bad} 項異常'))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
