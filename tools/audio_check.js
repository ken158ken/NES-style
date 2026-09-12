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
  'splash', 'bubble', 'wind', 'torch', 'fuse', 'melt', 'hardblock', 'count', 'count_end', 'ride', 'warp', 'essence',
  // Round 5（audio5）追加 —— 12 種新能力
  //   武器系
  'gun', 'shotgun', 'reload', 'shuriken', 'teleport', 'iai', 'slash_big', 'bow', 'arrow', 'arrow_rain', 'wallkick',
  //   魔法系
  'fireball', 'icewall', 'thunder', 'magic_circle', 'magic_big', 'timestop', 'timeresume', 'slowmo', 'rewind',
  'blackhole', 'meteor', 'gravity_lift', 'clone_summon', 'clone_swap', 'clone_rush',
  //   變身系
  'giant_grow', 'stomp', 'giant_roar', 'shrink', 'dragon_breath', 'dragon_dash', 'tail_whip', 'wing_flap',
  'rocket_punch', 'missile', 'jet', 'mech_step', 'armor_break', 'ghost_phase', 'possess', 'unpossess', 'ghost_wail',
  //   通用
  'transform', 'untransform', 'ultimate', 'max',
  // Round 8（audio8）追加 —— 24 種混合能力代表音（2 層合成）
  'mix_flamesword', 'mix_frostsword', 'mix_thunderblade', 'mix_flamegun', 'mix_frostgun', 'mix_thunderbow',
  'mix_flamehammer', 'mix_stonehammer', 'mix_shadowblade', 'mix_starmage', 'mix_frostdragon', 'mix_thundermech',
  'mix_flamebow', 'mix_frosthammer', 'mix_thundersword', 'mix_flameninja', 'mix_frostninja', 'mix_thundergun',
  'mix_stonegiant', 'mix_flamedragon', 'mix_thunderdragon', 'mix_timebeam', 'mix_gravityblade', 'mix_hammermech',
  // Round 8 —— 20 招覺醒招 + 量表 / 發動 / 結束
  'awk_fire', 'awk_sword', 'awk_beam', 'awk_cutter', 'awk_spark', 'awk_stone', 'awk_ice', 'awk_hammer',
  'awk_gunner', 'awk_ninja', 'awk_blade', 'awk_bow', 'awk_mage', 'awk_time', 'awk_gravity', 'awk_clone',
  'awk_giant', 'awk_dragon', 'awk_mech', 'awk_ghost', 'awk_ready', 'awk_start', 'awk_end',
  // Round 8 —— 挑戰模式
  'tick', 'time_up', 'floor_clear', 'nohit_fail', 'new_record'];
const SPEC_MUSIC = ['title', 'select', 'green', 'castle', 'island', 'cloud', 'dedede', 'boss', 'finalboss', 'invincible', 'clear', 'gameover', 'ending',
  // Round 1 追加
  'boss2', 'finalboss2', 'secret', 'miniboss',
  // Round 2（audio2）追加
  'result', 'arena', 'arena_rest', 'w_intro', 'green2', 'castle2', 'island2', 'cloud2', 'dedede2',
  // Round 5（audio5）追加
  'ultimate_loop', 'transform_jingle',
  // Round 6 / 7（world6 / world7 agent 自行加入 audio.js 的世界曲，補進名單）
  'space', 'space2', 'shadowboss', 'shadowboss2', 'dream', 'dream2', 'nightmare', 'nightmare2', 'trueend',
  // Round 8（audio8）追加：挑戰模式
  'challenge', 'tower', 'timeattack'];
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
for (const n of SPEC_SFX) A.SFX_NAMES.includes(n) ? null : fail('sfx 未實作（SPEC 名單）: ' + n);
for (const n of SPEC_MUSIC) A.MUSIC_NAMES.includes(n) ? null : fail('music 未實作（SPEC 名單）: ' + n);
// src 引用了但尚未實作的名稱：其他 agent 的檔案還在開發中，只列出提醒，不算失敗
const unknownSfx = [...usedSfx].filter(n => !A.SFX_NAMES.includes(n)).sort();
const unknownMusic = [...usedMusic].filter(n => !A.MUSIC_NAMES.includes(n)).sort();
if (unknownSfx.length) console.log('  WARN src 引用了未實作的 sfx（請回報總控 / audio agent 補做）: ' + unknownSfx.join(', '));
if (unknownMusic.length) console.log('  WARN src 引用了未實作的 music（請回報總控 / audio agent 補做）: ' + unknownMusic.join(', '));
if (!unknownSfx.length && !unknownMusic.length) ok('src 引用的 sfx / music 名稱全部已實作');
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
  // 呼叫間隔（幀）：可連續呼叫的音效，節流值必須小於呼叫間隔才不會被吃掉
  const need = { count: 4, fuse: 6, gun: 6, dragon_breath: 6, jet: 4, tick: 60 };
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

// ---------- Round 8：混合 / 覺醒 / 挑戰 ----------
console.log('[Round 8：混合 / 覺醒 / 挑戰]');
{
  // 混合能力：直接從 abilities_mix*.js 的組合表解析 mixkey（不需執行那些檔案），確保 24 組一個都不漏
  const mixKeys = [];
  for (const f of ['src/abilities_mix.js', 'src/abilities_mix2.js']) {
    const fp = path.join(ROOT, f);
    if (!fs.existsSync(fp)) { console.log('  WARN 找不到 ' + f + '（略過混合能力名單比對）'); continue; }
    const src = fs.readFileSync(fp, 'utf8');
    for (const m of src.matchAll(/^\s*\['(\w+)',\s*'(\w+)',\s*'(\w+)',/gm)) mixKeys.push(m[1]);
  }
  if (mixKeys.length) {
    if (mixKeys.length !== 24) fail(`abilities_mix*.js 解析到 ${mixKeys.length} 組混合能力（預期 24）`);
    for (const k of mixKeys) if (!A.SFX_NAMES.includes('mix_' + k)) fail('缺少混合能力音效 mix_' + k);
    ok(`24 組混合能力代表音 mix_<mixkey> 齊全（${mixKeys.length} 組比對自 abilities_mix*.js）`);
  }
  // 覺醒招：從 awaken.js 解析 M('key', ...) 的 20 個 basekey
  const awkFile = path.join(ROOT, 'src/awaken.js');
  if (!fs.existsSync(awkFile)) console.log('  WARN 找不到 src/awaken.js（略過覺醒招名單比對）');
  else {
    const src = fs.readFileSync(awkFile, 'utf8');
    const keys = [...src.matchAll(/^\s*M\('(\w+)',/gm)].map(m => m[1]);
    if (keys.length !== 20) fail(`awaken.js 解析到 ${keys.length} 招覺醒招（預期 20）`);
    for (const k of keys) if (!A.SFX_NAMES.includes('awk_' + k)) fail('缺少覺醒招音效 awk_' + k);
    for (const k of ['awk_ready', 'awk_start', 'awk_end']) if (!A.SFX_NAMES.includes(k)) fail('缺少 ' + k);
    ok(`20 招覺醒招 awk_<basekey> + awk_ready / awk_start / awk_end 齊全（比對自 awaken.js）`);
  }
  // 節流：覺醒招 500ms、混合招 80ms、tick 900ms
  const thr = A.SFX_THROTTLE || {};
  for (const n of A.SFX_NAMES) {
    if (n.startsWith('awk_') && thr[n] !== 500) fail(`${n} 節流應為 500ms（目前 ${thr[n]}）`);
    if (n.startsWith('mix_') && thr[n] !== 80) fail(`${n} 節流應為 80ms（目前 ${thr[n]}）`);
  }
  if (thr.tick !== 900) fail(`tick 節流應為 900ms（目前 ${thr.tick}）`);
  ok('節流：awk_* = 500ms、mix_* = 80ms、tick = 900ms');
  // 挑戰模式三曲
  for (const k of ['challenge', 'tower', 'timeattack']) {
    if (!A.MUSIC_NAMES.includes(k)) { fail('缺少挑戰模式音樂 ' + k); continue; }
    if (A.SONGS[k].loop === false) fail(`${k} 應為循環曲`);
  }
  ok('挑戰模式音樂 challenge / tower / timeattack 皆為 loop');
}

// ---------- 音樂速度倍率 setTempoMul ----------
console.log('[音樂速度倍率 setTempoMul]');
{
  if (typeof A.setTempoMul !== 'function' || typeof A.getTempoMul !== 'function') fail('setTempoMul() / getTempoMul() 缺少');
  else {
    const cases = [[1, 1], [1.3, 1.3], [1.15, 1.15], [0.5, 1], [-2, 1], [9, 1.3], [NaN, 1], ['x', 1], [undefined, 1]];
    for (const [inp, want] of cases) {
      const got = A.setTempoMul(inp);
      if (Math.abs(got - want) > 1e-9) fail(`setTempoMul(${JSON.stringify(inp)}) → ${got}（應為 ${want}）`);
      if (A.getTempoMul() !== got) fail('getTempoMul() 與 setTempoMul() 回傳不一致');
      if (A.status().tempo !== got) fail('status().tempo 未反映倍率');
    }
    // 播放中改倍率不得拋錯、不得換歌
    A.music('tower'); A.setTempoMul(1.25); A.music('tower'); A.setTempoMul(1);
    if (A.musicKey !== 'tower') fail('setTempoMul 影響了 musicKey');
    A.music(null);
    if (A.getTempoMul() !== 1) fail('setTempoMul(1) 未還原');
    ok('setTempoMul 夾限 1.0~1.3、非數字視為 1、播放中可改、status().tempo 正確');
  }
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
