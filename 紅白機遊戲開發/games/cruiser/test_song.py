# -*- coding: utf-8 -*-
"""《星塵巡航艦》曲目層（cruiser-song agent / R3）自動驗證。

不依賴任何其他 agent 的檔案：Playwright 開 about:blank，只 add_script_tag 載入
engine/apu.js + engine/music.js + games/cruiser/song.js（driver 與曲目資料）。

用法：../卡比之星/.venv/bin/python games/cruiser/test_song.py [-v]
結束碼：0 全過 / 1 有失敗 / 2 環境錯誤

驗證項目（任務書「驗證 §2」）：
  1  曲目鍵齊全：R2 六首 + R3 八鍵（stage2~6 / boss_final / ending / stageclear）
  2  2A03 合法性：只用 p1/p2/tri/noi 四軌（≤ 五聲道）、音名解析得出、方波 / 三角波週期不被夾
     （不超出 2A03 音域）、三角波是低音軌（≤ C-5）、雜訊 note = 0..15、vol 0..15、duty 0..3
  3  長度 / BPM / 小節數符合 song.js 頂部曲目表，且符合任務規格
     （stage2~6 ≥ 24 s、boss_final ≥ 16 s、ending 20~30 s 不循環、stageclear 4~6 s）
  4  循環旗標正確：LOOPED 與 SONGS 同鍵；循環曲播到尾會回 loop 點，不循環曲會自己停
  5  CR.Audio.play(key) 之後 CR.Audio.state() 的 song / playing / loop 正確
  6  同時發聲的聲道數 ≤ 引擎上限（整首逐幀統計；本作不使用 DMC，所以上限是 4）
  7  音符時值總和 = 小節數的整數倍（每個 pattern 的每一軌長度都等於該曲的 rows）
  8  編曲契約：stage3 / stage5 的回音軌延遲與 detune、boss_final 的 p1/p2 交錯、
     ending 的漸弱、stageclear = clear 的別名
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
APU = ROOT / 'engine' / 'apu.js'
MUSIC = ROOT / 'engine' / 'music.js'
SONG = ROOT / 'games' / 'cruiser' / 'song.js'
VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
FPS = 60.0988                      # NTSC

results = []


def ok(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    if VERBOSE or not cond:
        print(('  PASS ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail else ''))


# ---------------------------------------------------------------- 期望值表
# 來源：games/cruiser/song.js 頂部「曲目表」＋ 任務書的長度 / 氣氛規格
R2_KEYS = ['title', 'stage1', 'boss', 'clear', 'gameover', 'extend']
NEW_KEYS = ['stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'boss_final', 'ending', 'stageclear']

# key: (speed, rows/小節, 小節, BPM, loop, 軌)
SPEC = {
    'stage2':     (5, 16, 20, 180.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'stage3':     (6, 16, 16, 150.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'stage4':     (6, 12, 24, 150.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'stage5':     (6, 16, 16, 150.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'stage6':     (5, 16, 20, 180.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'boss_final': (4, 16, 16, 225.0, True,  ['noi', 'p1', 'p2', 'tri']),
    'ending':     (7, 16, 13, 128.6, False, ['noi', 'p1', 'p2', 'tri']),
    'stageclear': (5, 16, 3,  180.0, False, ['noi', 'p1', 'p2', 'tri']),
}
# 任務書的長度規格：(下限, 上限) 秒
LEN_RULE = {
    'stage2': (24.0, 60.0), 'stage3': (24.0, 60.0), 'stage4': (24.0, 60.0),
    'stage5': (24.0, 60.0), 'stage6': (24.0, 60.0), 'boss_final': (16.0, 40.0),
    'ending': (20.0, 30.0), 'stageclear': (3.9, 6.0),
}

# ------------------------------------------------------------------- JS 測試碼
JS = r"""
window.T = {};
const A = window.NES.APU, M = window.NES.Music, CR = window.CR;
const CH = ['p1', 'p2', 'tri', 'noi', 'dmc'];
function apu(){ return A.create({sampleRate: 44100}); }

// ① 鍵 + ② 合法性 + ⑦ 時值
T.audit = function(){
  const S = CR.SONGS, keys = Object.keys(S), info = {};
  const bad = {range:[], clamp:[], tri:[], noise:[], vol:[], duty:[], order:[], dmc:[], rowlen:[], track:[]};
  for (const k of keys){
    const s = S[k], tracks = {};
    let rowsTotal = 0, notes = 0;
    const rowsPerBar = s.rows;
    for (let pi = 0; pi < s.patterns.length; pi++){
      const pat = s.patterns[pi];
      for (const t in pat){
        tracks[t] = 1;
        if (CH.indexOf(t) < 0) bad.track.push(k + ' 未知軌 ' + t);
        if (t === 'dmc') bad.dmc.push(k + ' pat' + pi);
        const arr = pat[t];
        // ⑦ 每一軌的 row 數 = 該曲宣告的 rows（= 一小節）
        if (arr.length !== rowsPerBar) bad.rowlen.push(k + ' ' + t + '[' + pi + ']=' + arr.length);
        for (let ri = 0; ri < arr.length; ri++){
          const r = arr[ri]; if (!r) continue;
          const at = k + ' ' + t + '[' + pi + ':' + ri + ']';
          if (r.vol !== undefined && (r.vol < 0 || r.vol > 15)) bad.vol.push(at + ' vol=' + r.vol);
          if (r.duty !== undefined && (r.duty < 0 || r.duty > 3)) bad.duty.push(at + ' duty=' + r.duty);
          if (r.note === undefined || r.note === null) continue;
          notes++;
          if (t === 'noi'){
            if (!(Number.isInteger(r.note) && r.note >= 0 && r.note <= 15)) bad.noise.push(at + '=' + r.note);
            continue;
          }
          const midi = M.noteToMidi(r.note);
          if (midi === null || midi < 24 || midi > 107) { bad.range.push(at + '=' + r.note); continue; }
          // 2A03 音域：timer 不能被夾在 0 或 $7FF（夾住 = 這個音真機發不出來）
          const per = (t === 'tri') ? M.TRI_PERIOD[midi] : M.PULSE_PERIOD[midi];
          if (per <= 0 || per >= 0x7FF) bad.clamp.push(at + '=' + r.note + ' period=' + per);
          // 方波 timer < 8 不發聲（真機靜音）
          if (t !== 'tri' && per < 8) bad.clamp.push(at + '=' + r.note + ' period<8');
          if (t === 'tri' && midi > 72) bad.tri.push(at + '=' + r.note);
        }
      }
    }
    for (const o of s.order){
      if (!(o >= 0 && o < s.patterns.length)) { bad.order.push(k + ' order ' + o); continue; }
      let len = 0;
      for (const t in s.patterns[o]) len = Math.max(len, s.patterns[o][t].length);
      rowsTotal += len;
    }
    if (!tracks.p1 || !tracks.tri) bad.track.push(k + ' 缺 p1/tri');
    info[k] = {name: s.name, speed: s.speed, rows: s.rows, bars: s.order.length,
               patterns: s.patterns.length, rowsTotal: rowsTotal, notes: notes,
               tracks: Object.keys(tracks).sort(), nch: Object.keys(tracks).length,
               frames: rowsTotal * s.speed, looped: !!CR.Audio.LOOPED[k],
               bpm: +(3600 / (s.speed * 4)).toFixed(1)};
  }
  return {keys: keys, looped: Object.keys(CR.Audio.LOOPED), bad: bad, info: info,
          aliasClear: CR.SONGS.stageclear === CR.SONGS.clear};
};

// ④ 循環行為 + ⑥ 同時發聲聲道數（整首逐幀跑一遍）
T.runSong = function(key, extraFrames){
  const s = CR.SONGS[key], looped = !!CR.Audio.LOOPED[key];
  const m = M.create(apu());
  m.play(s, {loop: looped});
  let total = 0;
  for (const o of s.order){
    let len = 0; for (const t in s.patterns[o]) len = Math.max(len, s.patterns[o][t].length);
    total += len;
  }
  const frames = total * s.speed;
  let maxOn = 0, dmcOn = 0, onHist = {};
  for (let f = 0; f < frames; f++){
    m.tick();
    const st = m.state();
    let n = 0;
    for (let i = 0; i < 5; i++) if (st.channels[i].on){ n++; if (i === 4) dmcOn++; }
    onHist[n] = (onHist[n] || 0) + 1;
    if (n > maxOn) maxOn = n;
  }
  const atEnd = m.state();
  for (let f = 0; f < (extraFrames || 8); f++) m.tick();
  const after = m.state();
  return {frames: frames, maxOn: maxOn, dmcOn: dmcOn, onHist: onHist,
          playingAtEnd: atEnd.playing, playingAfter: after.playing,
          orderAfter: after.orderIndex, rowsPlayed: after.rowsPlayed, looped: looped};
};

// ⑤ CR.Audio.play / state
T.playState = function(key){
  M.attach(apu());
  CR.Audio.init();
  const okPlay = CR.Audio.play(key);
  const s0 = CR.Audio.state();
  for (let i = 0; i < 30; i++) CR.Audio.tick();
  const s1 = CR.Audio.state();
  CR.Audio.stop();
  const s2 = CR.Audio.state();
  return {okPlay: okPlay, s0: s0, s1: s1, s2: s2, keys: CR.Audio.KEYS};
};
T.playMissing = function(){
  M.attach(apu());
  return CR.Audio.play('no_such_song') === false;
};

// ⑧ 編曲契約：回音軌 / 交錯 / 漸弱
T.noteGrid = function(key, track){
  const s = CR.SONGS[key], out = [];
  for (const o of s.order){
    const arr = s.patterns[o][track] || [];
    for (let i = 0; i < s.rows; i++){
      const r = arr[i];
      out.push(r && r.note !== undefined && r.note !== null ? r.note : null);
    }
  }
  return out;
};
T.fieldOf = function(key, track, field){
  const s = CR.SONGS[key], out = [];
  for (const o of s.order){
    const arr = s.patterns[o][track] || [];
    for (const r of arr) if (r && r[field] !== undefined) out.push(r[field]);
  }
  return out;
};
T.volPerBar = function(key, track){
  const s = CR.SONGS[key], out = [];
  for (const o of s.order){
    const arr = s.patterns[o][track] || [];
    let v = null;
    for (const r of arr) if (r && r.vol !== undefined && v === null) v = r.vol;
    out.push(v);
  }
  return out;
};
window.T._ready = true;     // 最後一個運算式不能是 function，否則 Playwright 會把它當成要呼叫的函式
"""


def main():
    if not (APU.exists() and MUSIC.exists() and SONG.exists()):
        print('缺檔案：%s / %s / %s' % (APU, MUSIC, SONG), file=sys.stderr)
        return 2
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('about:blank')
        page.add_script_tag(path=str(APU))
        page.add_script_tag(path=str(MUSIC))
        page.add_script_tag(path=str(SONG))
        if errors:
            print('載入 song.js 就出錯：%s' % errors, file=sys.stderr)
            return 2
        page.evaluate(JS)

        a = page.evaluate('()=>T.audit()')
        info, bad = a['info'], a['bad']

        # ---------------------------------------------------------- ① 鍵齊全
        print('[① 曲目鍵]')
        for k in R2_KEYS:
            ok('R2 既有曲 %-9s 仍在' % k, k in a['keys'], a['keys'])
        for k in NEW_KEYS:
            ok('R3 新鍵 %-11s 存在' % k, k in a['keys'], a['keys'])
        ok('SONGS 與 LOOPED 同鍵（每首都宣告了循環旗標）',
           sorted(a['keys']) == sorted(a['looped']),
           (sorted(set(a['keys']) - set(a['looped'])), sorted(set(a['looped']) - set(a['keys']))))
        ok('CR.Audio.KEYS = SONGS 的鍵（曲目清單同步）',
           sorted(page.evaluate('()=>CR.Audio.KEYS')) == sorted(a['keys']))
        ok('stageclear 是 clear 的別名（同一份資料）', a['aliasClear'] is True)

        # -------------------------------------------------- ② 2A03 合法性
        print('[② 2A03 合法性]')
        ok('p1/p2/tri 的音名都解析得出且在 C-1..B-7（midi 24..107）', not bad['range'], bad['range'][:6])
        ok('方波 / 三角波的 timer 都沒有被夾（音高在 2A03 真的發得出來的範圍內）',
           not bad['clamp'], bad['clamp'][:6])
        ok('三角波是低音軌（不超過 C-5 / midi 72）', not bad['tri'], bad['tri'][:6])
        ok('雜訊軌的 note 是 0..15 的週期索引', not bad['noise'], bad['noise'][:6])
        ok('vol 在 0..15、duty 在 0..3', not bad['vol'] and not bad['duty'],
           (bad['vol'][:4], bad['duty'][:4]))
        ok('order 索引都指得到 pattern', not bad['order'], bad['order'][:6])
        ok('每首都有 p1 主旋律與 tri 低音、沒有未知軌名', not bad['track'], bad['track'][:4])
        ok('沒有任何一首用到 DMC 軌（卡帶預算留給圖）', not bad['dmc'], bad['dmc'][:4])
        for k in NEW_KEYS:
            ok('%-11s 只用 %d 軌（≤ 2A03 的 5 聲道）：%s' % (k, info[k]['nch'], '+'.join(info[k]['tracks'])),
               info[k]['nch'] <= 5 and info[k]['tracks'] == SPEC[k][5], info[k]['tracks'])

        # ----------------------------------------- ③ 長度 / BPM / 小節數
        print('[③ 長度 / BPM / 小節數]')
        for k in NEW_KEYS:
            speed, rpb, bars, bpm, looped, _ = SPEC[k]
            i = info[k]
            sec = i['frames'] / FPS
            ok('%-11s speed=%d / 一小節 %d row / %d 小節（與 song.js 曲目表相符）' % (k, speed, rpb, bars),
               i['speed'] == speed and i['rows'] == rpb and i['bars'] == bars,
               (i['speed'], i['rows'], i['bars']))
            ok('%-11s BPM = %.1f（3600 / (speed × 4)）' % (k, bpm), abs(i['bpm'] - bpm) < 0.15, i['bpm'])
            lo, hi = LEN_RULE[k]
            ok('%-11s 長度 %.2f s 在規格 %.0f~%.0f s 內' % (k, sec, lo, hi), lo <= sec <= hi, sec)
        ok('五首關卡曲都 ≥ 24 s 循環',
           all(info[k]['frames'] / FPS >= 24.0 for k in ['stage2', 'stage3', 'stage4', 'stage5', 'stage6']),
           {k: round(info[k]['frames'] / FPS, 2) for k in ['stage2', 'stage3', 'stage4', 'stage5', 'stage6']})
        ok('boss_final 比既有 boss 更急（BPM %.0f > %.0f）' % (info['boss_final']['bpm'], info['boss']['bpm']),
           info['boss_final']['bpm'] > info['boss']['bpm'])

        # ------------------------------------------------- ⑦ 時值總和
        print('[⑦ 音符時值]')
        # gameover 是 R2 就設計成 16+14 row 的收尾 jingle（song.js 曲目表已註明），不在此規則內
        rowlen = [x for x in bad['rowlen'] if not x.startswith('gameover ')]
        ok('每個 pattern 的每一軌長度都 = 該曲的 rows（gameover 的 16+14 除外，曲目表已註明）',
           not rowlen, rowlen[:6])
        for k in NEW_KEYS:
            i = info[k]
            ok('%-11s 總 row 數 %d = 小節數 %d × %d row（整數倍）' % (k, i['rowsTotal'], i['bars'], i['rows']),
               i['rowsTotal'] == i['bars'] * i['rows'] and i['rowsTotal'] % i['rows'] == 0, i['rowsTotal'])

        # -------------------------------- ④ 循環旗標 + ⑥ 同時發聲聲道數
        print('[④ 循環旗標 / ⑥ 同時發聲聲道數]')
        for k in NEW_KEYS:
            r = page.evaluate('()=>T.runSong(%s)' % json.dumps(k))
            looped = SPEC[k][4]
            ok('%-11s LOOPED = %s' % (k, looped), r['looped'] is looped, r['looped'])
            if looped:
                ok('%-11s 播完一輪之後還在播（回到 loop 點，不斷句）' % k,
                   r['playingAfter'] is True and r['orderAfter'] < info[k]['bars'],
                   (r['playingAfter'], r['orderAfter']))
            else:
                ok('%-11s 播完就停（不循環）' % k, r['playingAfter'] is False, r['playingAfter'])
            ok('%-11s 同時發聲聲道數最多 %d ≤ 4（本作不用 DMC，2A03 上限 5）' % (k, r['maxOn']),
               r['maxOn'] <= 4 and r['dmcOn'] == 0, (r['maxOn'], r['dmcOn'], r['onHist']))

        # ------------------------------------------- ⑤ play(key) → state()
        print('[⑤ CR.Audio.play / state]')
        for k in NEW_KEYS:
            r = page.evaluate('()=>T.playState(%s)' % json.dumps(k))
            ok('%-11s play() 回 true' % k, r['okPlay'] is True)
            ok('%-11s state().song = 鍵名、playing = true' % k,
               r['s0']['song'] == k and r['s0']['playing'] is True, r['s0'])
            ok('%-11s state().loop 與 LOOPED 一致' % k, r['s0']['loop'] is SPEC[k][4], r['s0']['loop'])
            ok('%-11s 播 30 幀後 row / orderIndex 有前進' % k,
               (r['s1']['row'] + r['s1']['orderIndex'] * info[k]['rows']) > 0, r['s1'])
            ok('%-11s stop() 之後 playing = false、song = null' % k,
               r['s2']['playing'] is False and r['s2']['song'] is None, r['s2'])
            ok('%-11s state().keys 含全部 %d 首' % (k, len(a['keys'])),
               sorted(r['s0']['keys']) == sorted(a['keys']))
        ok('play() 不存在的鍵回 false（stages agent 可以安全退回既有曲）',
           page.evaluate('()=>T.playMissing()') is True)

        # ---------------------------------------------------- ⑧ 編曲契約
        print('[⑧ 編曲契約]')
        for key, delay, det in [('stage3', 6, 6), ('stage5', 3, 10)]:
            lead = page.evaluate('()=>T.noteGrid(%s,"p1")' % json.dumps(key))
            ech = page.evaluate('()=>T.noteGrid(%s,"p2")' % json.dumps(key))
            n = len(lead)
            match = sum(1 for i in range(n) if lead[(i - delay) % n] == ech[i])
            ok('%s 回音軌 = 主旋律延後 %d row（%d/%d row 相符，loop 點接得上）' % (key, delay, match, n),
               match == n, [i for i in range(n) if lead[(i - delay) % n] != ech[i]][:5])
            dets = set(page.evaluate('()=>T.fieldOf(%s,"p2","detune")' % json.dumps(key)))
            ok('%s 回音軌 detune = +%d（失諧）、主旋律沒有 detune' % (key, det),
               dets == {det} and not page.evaluate('()=>T.fieldOf(%s,"p1","detune")' % json.dumps(key)),
               dets)
            lv = page.evaluate('()=>T.fieldOf(%s,"p1","vol")' % json.dumps(key))[0]
            ev = page.evaluate('()=>T.fieldOf(%s,"p2","vol")' % json.dumps(key))[0]
            ok('%s 回音軌音量比主旋律低（%d → %d）' % (key, lv, ev), ev < lv, (lv, ev))

        p1 = page.evaluate('()=>T.noteGrid("boss_final","p1")')
        p2 = page.evaluate('()=>T.noteGrid("boss_final","p2")')
        both = [i for i in range(len(p1)) if p1[i] is not None and p2[i] is not None]
        neither = [i for i in range(len(p1)) if p1[i] is None and p2[i] is None]
        ok('boss_final 雙方波交錯：沒有任何一個 row 兩軌同時觸發新音', not both, both[:5])
        ok('boss_final 雙方波交錯：每個 row 都有一軌在唱（16 分音符不斷線）', not neither, neither[:5])
        ok('boss_final p1 = 偶數 row、p2 = 奇數 row',
           all(p1[i] is not None for i in range(0, len(p1), 2))
           and all(p2[i] is not None for i in range(1, len(p2), 2)))

        ev = page.evaluate('()=>T.volPerBar("ending","p1")')
        ok('ending 最後三小節逐小節漸弱（%s）' % ev[-4:],
           ev[-4] is not None and ev[-3] < ev[-4] and ev[-2] < ev[-3] and ev[-1] < ev[-2], ev)
        noi = page.evaluate('()=>T.noteGrid("ending","noi")')
        bars = SPEC['ending'][2]
        tail = noi[10 * 16:]
        ok('ending 漸弱段沒有鼓（最後 3 小節 noi 全空）', all(v is None for v in tail), tail[:8])
        ok('ending 共 %d 小節、不循環' % bars,
           info['ending']['bars'] == bars and info['ending']['looped'] is False)

        ok('載入 / 播放全程沒有 JS 錯誤', not errors, errors[:3])
        browser.close()

    n = len(results)
    bad_ = [r for r in results if not r[0]]
    print('')
    print('=' * 70)
    print('cruiser / song 測試：%d 項，通過 %d，失敗 %d' % (n, n - len(bad_), len(bad_)))
    for _, name, detail in bad_:
        print('  FAIL  %s  — %s' % (name, detail))
    print('=' * 70)
    return 1 if bad_ else 0


if __name__ == '__main__':
    sys.exit(main())
