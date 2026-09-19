/* 卡比之星（同人版）— Service Worker（Round 11 pwa agent）
 * scope = 本檔所在資料夾（GitHub Pages：/NES-style/卡比之星/），所有路徑一律相對 './'。
 * ⚠️ 下面兩行 `const VERSION` / `const ASSETS` 由 tools/build.py 自動產生（版本 = 所有資產內容的 sha1 前 10 碼），
 *    請勿手改；其餘程式碼可自由編輯，build.py 只會換這兩行。
 * 策略：install 預快取（逐個 add，個別失敗不整批失敗）／activate 清舊版 + claim／
 *       fetch 同源 GET「網路優先、失敗回快取」，導覽請求離線時回 ./index.html；跨域直接放行。
 */
const VERSION = '4b7a7ddbd5';
const ASSETS = [
  "./", "./index.html", "./src/const.js",
  "./src/gfx.js", "./src/input.js", "./src/audio.js",
  "./src/tilemap.js", "./src/entity.js", "./src/vfx.js",
  "./src/elements.js", "./src/art/font.js", "./src/art/kirby.js",
  "./src/art/enemies.js", "./src/art/bosses.js", "./src/art/world.js",
  "./src/art/items_ui.js", "./src/art/backgrounds.js", "./src/art/kirby_weapons.js",
  "./src/art/kirby_magic.js", "./src/art/kirby_forms.js", "./src/art/kirby_mix.js",
  "./src/art/helper.js", "./src/art/world6.js", "./src/art/kirby_mix2.js",
  "./src/art/kirby_awaken.js", "./src/art/world7.js", "./src/skins.js",
  "./src/player.js", "./src/abilities.js", "./src/abilities_weapons.js",
  "./src/abilities_magic.js", "./src/abilities_forms.js", "./src/abilities_mix.js",
  "./src/abilities_mix2.js", "./src/helper.js", "./src/items.js",
  "./src/enemies.js", "./src/enemies_weapons.js", "./src/enemies_magic.js",
  "./src/enemies_forms.js", "./src/bosses.js", "./src/bosses_w6.js",
  "./src/bosses_w7.js", "./src/levels.js", "./src/levels_w7.js",
  "./src/levels_extra.js", "./src/game.js", "./src/progression.js",
  "./src/awaken.js", "./src/records.js", "./src/saves.js",
  "./src/keyconfig.js", "./src/ui.js", "./src/menu.js",
  "./src/arena.js", "./src/challenge.js", "./src/touch.js",
  "./src/pwa.js", "./src/main.js", "./assets/fonts/fusion12-zh_hant.woff2",
  "./assets/fonts/unifont16-subset.woff2", "./assets/fonts/unifont_chars.txt", "./assets/manifest.webmanifest",
  "./assets/icons/icon-180.png", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

const CACHE = 'kirbystar-' + VERSION;

// ---- install：逐個預快取，個別失敗只記 log ----
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    const bad = ASSETS.filter((u, i) => results[i].status === 'rejected');
    if (bad.length) console.warn('[sw] 預快取失敗', bad.length, '/', ASSETS.length, bad.slice(0, 8));
    console.log('[sw] installed', VERSION, ASSETS.length - bad.length, '/', ASSETS.length);
  })());
});

// ---- activate：清掉舊版快取並立刻接管 ----
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n !== CACHE && n.startsWith('kirbystar-')) ? caches.delete(n) : null));
    await self.clients.claim();
    console.log('[sw] activated', VERSION);
  })());
});

// ---- 由頁面（KB.PWA.update）要求立刻換版 ----
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---- fetch：同源 GET 網路優先 → 失敗回快取 → 導覽回 index.html ----
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;            // 跨域：直接放行
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const idx = (await cache.match('./index.html', { ignoreSearch: true })) || (await cache.match('./'));
      if (idx) return idx;
    }
    throw err;
  }
}
