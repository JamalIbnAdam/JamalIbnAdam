const CACHE_NAME = 'jamalibnadam-v1';
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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
