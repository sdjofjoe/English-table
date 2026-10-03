const CACHE = 'cet6-monitor-v5';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './css/style.css', './js/main.js', './js/db.js', './js/plan.js',
  './js/encourage.js', './js/ocr.js', './js/quiz.js', './js/charts.js', './js/sfx.js',
  './js/pages/today.js', './js/pages/checkin.js', './js/pages/words.js',
  './js/pages/quiz.js', './js/pages/stats.js', './js/pages/settings.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => hit))
  );
});
