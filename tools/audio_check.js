// 音訊離線檢查（Node，無需瀏覽器）：
//   node tools/audio_check.js
// 1. 載入 src/const.js + src/audio.js（以 stub 的 window / location 模擬）
// 2. 比對 src/*.js 內所有 KB.audio.sfx('x') / music('x') / this.sfx = 'x' 名稱都有實作
// 3. 比對 SPEC 第 9 節列出的名稱都有實作
// 4. 檢查每首曲子：段落內各軌小節數一致、每小節 16 個 token、音符 / 鼓 token 合法、循環曲 ≥ 16 小節
// 5. 環境音層 ambient()：名稱齊全、可重複呼叫、層設定合法
// 6. 音效節流表：高頻呼叫的音效（count 每 4 幀、fuse 每 6 幀）節流值必須小於呼叫間隔
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

// ---------- 載入 ----------
const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, performance: { now: () => Date.now() } };
sandbox.window = sandbox; sandbox.location = { search: '' }; sandbox.document = { addEventListener() { }, hidden: false };
sandbox.addEventListener = () => { };
vm.createContext(sandbox);
for (const f of ['src/const.js', 'src/audio.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const KB = sandbox.KB;
if (!KB || !KB.audio) { console.error('KB.audio 未定義'); process.exit(1); }
const A = KB.audio;

let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

// ---------- 介面 ----------
console.log('[介面]');
for (const k of ['sfx', 'music', 'ambient', 'unlock', 'setMute', 'toggleMute', 'setVolume', 'getVolume', 'duck', 'status']) (typeof A[k] === 'function') ? ok(k + '()') : fail(k + '() 缺少');
// 無 AudioContext 環境下呼叫不得拋錯
try { A.unlock(); A.sfx('jump'); A.sfx('nope'); A.music('green'); A.music('green'); A.music(null); A.music('zzz'); A.ambient('water'); A.ambient('zzz'); A.ambient(null); A.ambient(); A.setMute(true); A.toggleMute(); ok('無 AudioContext 時全部呼叫不拋錯'); }
catch (e) { fail('無 AudioContext 時拋錯: ' + e); }
// 全部音效 / 音樂逐一呼叫（含 duck / 音量）不得拋錯
try {
  for (const n of A.SFX_NAMES) A.sfx(n);
  for (const k of A.MUSIC_NAMES) A.music(k);
  for (const k of A.AMBIENT_NAMES) { A.ambient(k); A.ambient(k); }
  A.music(null); A.ambient(null); A.duck(true); A.duck(false); A.setMute(false);
  ok('逐一呼叫全部 sfx / music / ambient / duck 不拋錯');
} catch (e) { fail('逐一呼叫拋錯: ' + e); }
// 音量 API：0~1 夾限、回傳格式、任一參數可省略
try {
  const v0 = A.getVolume();
  if (typeof v0.music !== 'number' || typeof v0.sfx !== 'number' || typeof v0.muted !== 'boolean') fail('getVolume() 應回傳 {music, sfx, muted}');
  A.setVolume({ music: 0.4 }); if (A.getVolume().music !== 0.4 || A.getVolume().sfx !== v0.sfx) fail('setVolume({music}) 未正確套用 / 影響了 sfx');
  A.setVolume({ sfx: 0.25 }); if (A.getVolume().sfx !== 0.25) fail('setVolume({sfx}) 未正確套用');
  A.setVolume({ music: 5, sfx: -3 }); const c = A.getVolume(); if (c.music !== 1 || c.sfx !== 0) fail('setVolume 未夾限到 0~1');
  A.setVolume({}); A.setVolume(); A.setVolume({ music: 'x' });
  A.setVolume({ music: v0.music, sfx: v0.sfx });
  ok('setVolume / getVolume（夾限、可省略、存檔）');
} catch (e) { fail('音量 API 拋錯: ' + e); }

// ---------- 名稱比對 ----------
console.log('[音效 / 音樂名稱]');
const SPEC_SFX = ['jump', 'inhale', 'spit', 'swallow', 'hurt', 'die', 'enemyhit', 'enemydie', 'block', 'item', '1up', 'ability', 'door', 'boss_hurt', 'boss_die', 'menu', 'select', 'float', 'exhale', 'sword', 'fire', 'beam', 'cutter', 'spark', 'ice', 'hammer', 'stone', 'land', 'slide', 'clear', 'pause',
  // Round 1 追加（提供給其他 agent）
  'unpause', 'lowhp', 'oneup', 'bigstar', 'charge', 'charge_ready', 'unlock', 'phase2', 'menu_back',
  // Round 2（audio2）追加
  'splash', 'bubble', 'wind', 'torch', 'fuse', 'melt', 'hardblock', 'count', 'count_end', 'ride', 'warp', 'essence'];
const SPEC_MUSIC = ['title', 'select', 'green', 'castle', 'island', 'cloud', 'dedede', 'boss', 'finalboss', 'invincible', 'clear', 'gameover', 'ending',
  // Round 1 追加
  'boss2', 'finalboss2', 'secret', 'miniboss',
  // Round 2（audio2）追加
  'result', 'arena', 'arena_rest', 'w_intro', 'green2', 'castle2', 'island2', 'cloud2', 'dedede2'];
const SPEC_AMBIENT = ['water', 'wind', 'cave', 'castle'];
const usedSfx = new Set(), usedMusic = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js') && f !== 'audio.js')) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  for (const m of src.matchAll(/audio\.sfx\(\s*'([^']+)'/g)) usedSfx.add(m[1]);
  for (const m of src.matchAll(/\bsfx\s*[:=]\s*'([^']+)'/g)) usedSfx.add(m[1]);
  for (const m of src.matchAll(/audio\.music\(\s*'([^']+)'/g)) usedMusic.add(m[1]);
  for (const m of src.matchAll(/\bmusic:\s*'([^']+)'/g)) usedMusic.add(m[1]);
}
// 關卡主題也會當作音樂 key（game.js: this.level.music || this.theme）
for (const t of (KB.THEMES || [])) usedMusic.add(t);
for (const n of new Set([...SPEC_SFX, ...usedSfx])) A.SFX_NAMES.includes(n) ? null : fail('sfx 未實作: ' + n);
for (const n of new Set([...SPEC_MUSIC, ...usedMusic])) A.MUSIC_NAMES.includes(n) ? null : fail('music 未實作: ' + n);
ok(`sfx 實作 ${A.SFX_NAMES.length} 種，程式引用 ${usedSfx.size} 種，SPEC ${SPEC_SFX.length} 種`);
ok(`music 實作 ${A.MUSIC_NAMES.length} 首，程式引用 ${usedMusic.size} 個 key，SPEC ${SPEC_MUSIC.length} 首`);
console.log('  sfx  : ' + A.SFX_NAMES.join(', '));
console.log('  music: ' + A.MUSIC_NAMES.join(', '));

// ---------- 環境音層 ----------
console.log('[環境音 ambient]');
const usedAmb = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js') && f !== 'audio.js')) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  for (const m of src.matchAll(/audio\.ambient\(\s*'([^']+)'/g)) usedAmb.add(m[1]);
  for (const m of src.matchAll(/\bambient:\s*'([^']+)'/g)) usedAmb.add(m[1]);
}
if (!Array.isArray(A.AMBIENT_NAMES)) fail('AMBIENT_NAMES 缺少');
else {
  for (const n of new Set([...SPEC_AMBIENT, ...usedAmb])) A.AMBIENT_NAMES.includes(n) ? null : fail('ambient 未實作: ' + n);
  for (const k of A.AMBIENT_NAMES) {
    const a = A.AMBIENT[k];
    if (!a || !Array.isArray(a.layers) || !a.layers.length) { fail(`ambient ${k}: 缺少 layers`); continue; }
    a.layers.forEach((L, i) => {
      if (typeof L.vol !== 'number' || L.vol <= 0 || L.vol > 0.2) fail(`ambient ${k} layer${i}: vol ${L.vol} 應為 0~0.2（環境音需低音量）`);
      if (L.type && typeof L.f !== 'number') fail(`ambient ${k} layer${i}: 有濾波型別卻沒有頻率 f`);
    });
    const tot = a.layers.reduce((n, L) => n + L.vol * (L.amp ? 1 + L.amp.depth : 1), 0) + (a.drone ? a.drone.vol : 0);
    if (tot > 0.25) fail(`ambient ${k}: 各層總音量 ${tot.toFixed(3)} 過大（應 ≤ 0.25）`);
    if (tot < 0.04) fail(`ambient ${k}: 各層總音量 ${tot.toFixed(3)} 過小（離線渲染會被判為靜音）`);
  }
  ok(`ambient 實作 ${A.AMBIENT_NAMES.length} 種（${A.AMBIENT_NAMES.join(', ')}），程式引用 ${usedAmb.size} 種`);
  // ambient 與 music 互不影響
  A.music(null); A.ambient('cave');
  if (A.ambientKey !== 'cave') fail('ambient() 未記錄 ambientKey');
  A.music('green');
  if (A.ambientKey !== 'cave') fail('music() 影響了 ambient');
  A.music(null);
  if (A.ambientKey !== 'cave') fail('music(null) 停掉了 ambient（應互相獨立）');
  A.ambient(null);
  if (A.ambientKey !== null) fail('ambient(null) 未清除');
  ok('ambient 與 music 互相獨立（music(null) 不影響 ambient）');
}

// ---------- 節流表 ----------
console.log('[音效節流]');
{
  const FRAME = 1000 / 60;
  const need = { count: 4, fuse: 6 };          // 呼叫間隔（幀）
  const thr = A.SFX_THROTTLE || {};
  const def = A.THROTTLE_MS || 80;
  for (const [n, frames] of Object.entries(need)) {
    const t = (thr[n] !== undefined) ? thr[n] : def;
    if (t >= frames * FRAME) fail(`sfx '${n}' 每 ${frames} 幀（${(frames * FRAME).toFixed(0)}ms）呼叫一次，節流 ${t}ms 會被吃掉`);
  }
  for (const [n, t] of Object.entries(thr)) {
    if (!A.SFX_NAMES.includes(n)) fail(`節流表有不存在的音效 '${n}'`);
    if (typeof t !== 'number' || t < 0 || t > 1000) fail(`節流表 '${n}' 值 ${t} 不合理`);
  }
  ok(`節流表 ${Object.keys(thr).length} 項（預設 ${def}ms）：` + Object.entries(thr).map(([k, v]) => `${k}=${v}`).join(', '));
}

// ---------- 曲目檢查 ----------
console.log('[曲目]');
const NOTE = /^[A-G][#b]?\d$/, DRUM = /^[ksho c]$/;
const rows = [];
for (const key of A.MUSIC_NAMES) {
  const s = A.SONGS[key];
  const order = s.order || Object.keys(s.sec);
  let bars = 0;
  for (const secName of order) {
    const sec = s.sec[secName];
    if (!sec) { fail(`${key}: 段落 ${secName} 不存在`); continue; }
    const counts = A.TRACKS.map(t => (sec[t] || []).length);
    if (new Set(counts).size !== 1) fail(`${key}.${secName}: 各軌小節數不一致 ${JSON.stringify(counts)}`);
    bars += counts[0];
    for (const t of A.TRACKS) {
      (sec[t] || []).forEach((bar, bi) => {
        const toks = bar.trim().split(/\s+/);
        if (toks.length !== 16) fail(`${key}.${secName}.${t} 第 ${bi + 1} 小節有 ${toks.length} 個 token（應為 16）: "${bar}"`);
        toks.forEach((tok, ti) => {
          if (t === 'drum') { if (!DRUM.test(tok) && tok !== '.' && tok !== '-') fail(`${key}.${secName}.drum 第 ${bi + 1} 小節 token "${tok}" 不合法`); }
          else if (tok !== '.' && tok !== '-') {
            if (!NOTE.test(tok) || A.noteFreq(tok) === null) fail(`${key}.${secName}.${t} 第 ${bi + 1} 小節 token "${tok}" 不是合法音符`);
            else { const f = A.noteFreq(tok); if (f < 40 || f > 4500) fail(`${key}.${secName}.${t} 音符 ${tok} 頻率 ${f.toFixed(0)}Hz 超出範圍`); }
          }
          if (tok === '-' && bi === 0 && ti === 0) fail(`${key}.${secName}.${t} 第一個 token 為延音，前面沒有音符`);
        });
      });
    }
  }
  if (s.loop !== false && bars < 16) fail(`${key}: 循環曲僅 ${bars} 小節（需 ≥ 16）`);
  if (order.length < 2 && s.loop !== false) fail(`${key}: 循環曲缺少段落變化（order=${order.join('')}）`);
  const c = A.compileSong(s);
  const secs = c.bars * 16 * c.stepDur;
  let notes = 0; for (const t of ['p1', 'p2', 'bass']) notes += c.tracks[t].filter(x => x !== '.' && x !== '-').length;
  rows.push({ key, bpm: s.bpm, bars: c.bars, sections: order.join(''), loop: s.loop !== false, secs: secs.toFixed(1), notes });
}
console.table(rows);
if (fails) { console.log(`\n${fails} 項失敗`); process.exit(1); }
console.log('\n全部通過');
