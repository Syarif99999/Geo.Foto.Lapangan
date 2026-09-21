// Geotag GPS - Service Worker
const CACHE_NAME = 'geotag-gps-v49';
const TILE_CACHE = 'geotag-tiles-v1';
const TILE_MAX = 400;   // batas jumlah tile peta yang disimpan (v48)
const CACHEABLE_HOSTS = ['cdnjs.cloudflare.com', 'www.gstatic.com'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com', 'services.arcgisonline.com'];
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './app.js',
  './peta-pantau.html',
  './pantau.js',
  './firebase-config.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== TILE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first untuk semua request: selalu coba ambil versi terbaru dari internet dulu.
// Kalau berhasil, simpan ke cache. Kalau gagal (offline), baru pakai cache lama.
// Strategi ini sengaja dipilih (bukan cache-first) supaya HP tidak "nyangkut"
// di versi lama saat aplikasi diperbarui.
// v48: sebelumnya SEMUA request (termasuk ratusan tile peta & panggilan Firestore)
// disimpan tanpa batas sehingga cache membengkak. Sekarang:
//  - file aplikasi & pustaka CDN  -> network-first, disimpan seperti biasa
//  - tile peta                    -> disimpan di cache terpisah, dibatasi TILE_MAX
//  - request lain (Firestore, geocoding, dll) -> tidak disentuh service worker
async function trimCache(name, max){
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for(let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isTile = TILE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  const isLib = CACHEABLE_HOSTS.includes(url.hostname);
  if(!sameOrigin && !isTile && !isLib) return;

  const targetCache = isTile ? TILE_CACHE : CACHE_NAME;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if(res && (res.status === 200 || res.type === 'opaque')){
          const resClone = res.clone();
          caches.open(targetCache)
            .then((cache) => cache.put(req, resClone))
            .then(() => { if(isTile) trimCache(TILE_CACHE, TILE_MAX); })
            .catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (sameOrigin ? caches.match('./index.html') : Response.error())))
  );
});
