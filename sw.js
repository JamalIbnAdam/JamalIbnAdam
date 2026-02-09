const CACHE_NAME = 'jamalibnadam-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './main.js',
    './manifest.json',
    './logo.webp',
    './Official_Authorization_Document_optimized.png',
    './data/data_ar.js',
    './data/data_en.js',
    './data/data_es.js',
    './data/data_pl.js',
    './data/data_tr.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                    console.warn('Some assets failed to cache:', err);
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
