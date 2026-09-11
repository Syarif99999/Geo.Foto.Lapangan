// Geo Foto Lapangan - Service Worker
const CACHE_NAME = 'geo-foto-lapangan-v12';
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first untuk semua request: selalu coba ambil versi terbaru dari internet dulu.
// Kalau berhasil, simpan ke cache. Kalau gagal (offline), baru pakai cache lama.
// Strategi ini sengaja dipilih (bukan cache-first) supaya HP tidak "nyangkut"
// di versi lama saat aplikasi diperbarui.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
