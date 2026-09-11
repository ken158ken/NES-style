// 音訊離線檢查（Node，無需瀏覽器）：
//   node tools/audio_check.js
// 1. 載入 src/const.js + src/audio.js（以 stub 的 window / location 模擬）
// 2. 比對 src/*.js 內所有 KB.audio.sfx('x') / music('x') / this.sfx = 'x' 名稱都有實作
// 3. 比對 SPEC 第 9 節列出的名稱都有實作
// 4. 檢查每首曲子：段落內各軌小節數一致、每小節 16 個 token、音符 / 鼓 token 合法、循環曲 ≥ 16 小節
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
for (const k of ['sfx', 'music', 'unlock', 'setMute', 'toggleMute']) (typeof A[k] === 'function') ? ok(k + '()') : fail(k + '() 缺少');
// 無 AudioContext 環境下呼叫不得拋錯
try { A.unlock(); A.sfx('jump'); A.sfx('nope'); A.music('green'); A.music('green'); A.music(null); A.music('zzz'); A.setMute(true); A.toggleMute(); ok('無 AudioContext 時全部呼叫不拋錯'); }
catch (e) { fail('無 AudioContext 時拋錯: ' + e); }

// ---------- 名稱比對 ----------
console.log('[音效 / 音樂名稱]');
const SPEC_SFX = ['jump', 'inhale', 'spit', 'swallow', 'hurt', 'die', 'enemyhit', 'enemydie', 'block', 'item', '1up', 'ability', 'door', 'boss_hurt', 'boss_die', 'menu', 'select', 'float', 'exhale', 'sword', 'fire', 'beam', 'cutter', 'spark', 'ice', 'hammer', 'stone', 'land', 'slide', 'clear', 'pause'];
const SPEC_MUSIC = ['title', 'select', 'green', 'castle', 'island', 'cloud', 'dedede', 'boss', 'finalboss', 'invincible', 'clear', 'gameover', 'ending'];
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
console.log('  sfx: ' + A.SFX_NAMES.join(', '));

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
