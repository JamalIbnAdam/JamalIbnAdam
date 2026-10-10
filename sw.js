const CACHE_NAME = 'jamalibnadam-v19';
// document scans are not precached: each one is cached the first time it is viewed
const EVIDENCE_CACHE = 'jamalibnadam-evidence';
const EVIDENCE_PATH = '/assets/evidence/';
const EVIDENCE_MAX = 100;
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './logo.webp',
    './theme.js',
    './sources.js',
    './install.js',
    './touch.js',
    './icons/icon-192.png',
    './data/data_ar.js',
    './data/data_en.js',
    './data/data_es.js',
    './data/data_pl.js',
    './data/data_tr.js',
    './tree/',
    './home.css',
    './home.js',
    './data/sources.json',
    './data/stats.json',
    './more/',
    './more/more.js',
    './data/ansar-libya.json',
    './data/figures-unlinked.json'
];
// the evidence tree's own files are fetched only by /tree/: cached there on first use, never from the home page
const TREE_RUNTIME = [
    '/tree/tree.css',
    '/tree/tree.js',
    '/tree/page.js',
    '/assets/vendor/d3.v7.9.0.min.js',
    '/data/tree.json',
    '/data/docs.json'
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
                    if (cacheName !== CACHE_NAME && cacheName !== EVIDENCE_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

function evidenceCacheFirst(request) {
    return caches.open(EVIDENCE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    cache.put(request, response.clone()).then(() => cache.keys()).then((keys) => {
                        // oldest first: keep the newest EVIDENCE_MAX scans
                        return Promise.all(keys.slice(0, Math.max(0, keys.length - EVIDENCE_MAX)).map((key) => cache.delete(key)));
                    });
                }
                return response;
            });
        });
    });
}

function treeCacheFirst(request) {
    return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) cache.put(request, response.clone());
                return response;
            });
        });
    });
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    // other sites (fonts, the video, the contact form) are left to the browser, under the page's own rules
    if (url.origin !== self.location.origin) return;
    if (event.request.method === 'GET' && url.origin === self.location.origin) {
        if (url.pathname.includes(EVIDENCE_PATH)) {
            event.respondWith(evidenceCacheFirst(event.request));
            return;
        }
        if (!url.search && TREE_RUNTIME.some((path) => url.pathname.endsWith(path))) {
            event.respondWith(treeCacheFirst(event.request));
            return;
        }
    }
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
