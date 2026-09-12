# -*- coding: utf-8 -*-
"""
以 Playwright(Chromium) 開啟 tools/audio_test.html，用 OfflineAudioContext 離線渲染每個音效、每首曲子與每個環境音層，
檢查：不拋錯、輸出非靜音（peak > 門檻）、不爆音（peak < 1.0）。
另檢查即時 API：音量 / duck / ambient / 節流表 / Round 8 的 mix_ · awk_ 節流與 setTempoMul（音樂速度倍率 1.0~1.3）。
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
    ap.add_argument('--amb-secs', type=float, default=5.0, help='每個環境音層渲染秒數')
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
        # 環境音層 ambient()：逐一切換、同 key 不重啟、music(null) 不影響、ambient(null) 停止
        amb = pg.evaluate("""()=>{
            const out = {names: KB.audio.AMBIENT_NAMES.slice(), steps: []};
            for (const k of KB.audio.AMBIENT_NAMES) { KB.audio.ambient(k); KB.audio.ambient(k); out.steps.push([k, KB.audio.status().ambient]); }
            KB.audio.ambient('water'); KB.audio.music('green');
            out.afterMusic = KB.audio.status().ambient;
            KB.audio.music(null);
            out.afterMusicNull = KB.audio.status().ambient;
            KB.audio.ambient('zzz');
            out.afterBad = KB.audio.status().ambient;
            KB.audio.ambient(null);
            out.afterNull = KB.audio.status().ambient;
            return out;
        }""")
        print('ambient      :', amb)
        if st1.get('ctxState') == 'running':
            if not all(a == b for a, b in amb['steps']):
                print('  <-- ambient 切換異常'); bad += 1
            if amb['afterMusic'] != 'water' or amb['afterMusicNull'] != 'water':
                print('  <-- music() / music(null) 影響了 ambient（應互相獨立）'); bad += 1
            if amb['afterBad'] is not None or amb['afterNull'] is not None:
                print('  <-- ambient(null) / 未知名稱處理異常'); bad += 1
        # 高頻音效節流：可連續呼叫的音效（count 每 4 幀、fuse / gun / dragon_breath 每 6 幀、jet 每 4 幀）必須放行
        thr = pg.evaluate("()=>({t: KB.audio.SFX_THROTTLE, d: KB.audio.THROTTLE_MS})")
        for name, frames in (('count', 4), ('fuse', 6), ('gun', 6), ('dragon_breath', 6), ('jet', 4), ('tick', 60)):
            v = thr['t'].get(name, thr['d'])
            if v >= frames * 1000 / 60:
                print(f"  <-- sfx '{name}' 節流 {v}ms ≥ 呼叫間隔 {frames*1000/60:.0f}ms"); bad += 1
        names_all = set(pg.evaluate("()=>KB.audio.SFX_NAMES"))
        ghost = sorted(set(thr['t']) - names_all)
        if ghost:
            print('  <-- 節流表有不存在的音效:', ','.join(ghost)); bad += len(ghost)
        print('throttle     :', f"{len(thr['t'])} 項（預設 {thr['d']}ms）", thr['t'])
        # Round 8：mix_*（80ms）/ awk_*（500ms）節流規則
        r8 = pg.evaluate("""()=>{
            const t = KB.audio.SFX_THROTTLE, n = KB.audio.SFX_NAMES;
            const bad = [];
            for (const k of n) {
              if (k.indexOf('awk_') === 0 && t[k] !== 500) bad.push(k + '=' + t[k] + '(want 500)');
              if (k.indexOf('mix_') === 0 && t[k] !== 80) bad.push(k + '=' + t[k] + '(want 80)');
            }
            return {bad, mix: n.filter(k=>k.indexOf('mix_')===0).length, awk: n.filter(k=>k.indexOf('awk_')===0).length, tick: t.tick};
        }""")
        if r8['bad']:
            print('  <-- Round 8 節流異常:', ', '.join(r8['bad'])); bad += len(r8['bad'])
        if r8['mix'] != 24: print(f"  <-- mix_* 音效 {r8['mix']} 個（預期 24）"); bad += 1
        if r8['awk'] != 23: print(f"  <-- awk_* 音效 {r8['awk']} 個（預期 20 招 + ready/start/end = 23）"); bad += 1
        if r8['tick'] != 900: print(f"  <-- tick 節流 {r8['tick']}ms（預期 900）"); bad += 1
        print('round8       :', f"mix_* {r8['mix']} 個 / awk_* {r8['awk']} 個 / tick {r8['tick']}ms")
        # 音樂速度倍率 setTempoMul（挑戰塔隨層數加速）
        tempo = pg.evaluate("""()=>{
            if (typeof KB.audio.setTempoMul !== 'function') return {missing: true};
            const out = {set: []};
            for (const v of [1, 1.15, 1.3, 0.4, 9, NaN, 'x', undefined]) out.set.push([String(v), KB.audio.setTempoMul(v)]);
            KB.audio.music('tower'); KB.audio.setTempoMul(1.3);
            out.playing = KB.audio.status().playing; out.tempo = KB.audio.status().tempo;
            return out;
        }""")
        if tempo.get('missing'):
            print('  <-- 缺少 KB.audio.setTempoMul'); bad += 1
        else:
            want = {'1': 1, '1.15': 1.15, '1.3': 1.3, '0.4': 1, '9': 1.3, 'NaN': 1, 'x': 1, 'undefined': 1}
            for k, v in tempo['set']:
                if abs(v - want[k]) > 1e-9:
                    print(f'  <-- setTempoMul({k}) → {v}（應為 {want[k]}）'); bad += 1
            if tempo['tempo'] != 1.3: print('  <-- status().tempo 未反映倍率'); bad += 1
            if st1.get('ctxState') == 'running':
                pg.wait_for_timeout(500)
                tst = pg.evaluate("()=>KB.audio.status()")
                if tst['playing'] != 'tower' or tst['step'] <= 0:
                    print('  <-- 加速播放中音序器異常:', tst); bad += 1
            pg.evaluate("()=>{ KB.audio.setTempoMul(1); KB.audio.music(null); }")
        print('tempoMul     :', tempo)
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
            const buf = kind === 'sfx' ? await KB.audio.renderSfx(name)
                      : kind === 'amb' ? await KB.audio.renderAmbient(name, secs)
                      : await KB.audio.renderSong(name, secs);
            const st = window.__audioStats(buf);
            if (wantData) st.data = Array.from(buf.getChannelData(0));
            st.sr = buf.sampleRate;
            return st;
        }"""
        names = ([('sfx', n) for n in pg.evaluate("()=>KB.audio.SFX_NAMES")]
                 + [('music', n) for n in pg.evaluate("()=>KB.audio.MUSIC_NAMES")]
                 + [('amb', n) for n in pg.evaluate("()=>KB.audio.AMBIENT_NAMES")])
        for kind, name in names:
            if only and name not in only:
                continue
            try:
                secs = a.secs if kind == 'music' else (a.amb_secs if kind == 'amb' else None)
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
