const CACHE_NAME = 'jamalibnadam-v34';
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
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // 'reload': straight from the server, never from the browser's own HTTP cache, so a new version
                // cannot be built out of an old page and a new script
                return cache.addAll(ASSETS_TO_CACHE.map((url) => new Request(url, { cache: 'reload' }))).catch((err) => {
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

// Pages, scripts, styles and data: the network first, so a page and its script always come from the same deploy.
// The fresh copy is kept (without any ?query) for when there is no network; only then is the kept copy used.
const FRESH = /\.(?:html|js|css|json)$/;
function networkFirst(request, url) {
    const key = url.origin + url.pathname;
    return caches.open(CACHE_NAME).then((cache) => {
        return fetch(request, { cache: 'no-cache' }).then((response) => {
            if (response.ok) cache.put(key, response.clone());
            return response;
        }).catch(() => {
            return cache.match(key).then((kept) => kept || cache.match(request, { ignoreSearch: true })).then((kept) => {
                if (kept) return kept;
                throw new Error('offline, and no kept copy of ' + url.pathname);
            });
        });
    });
}

self.addEventListener('fetch', (event) => {
    const request = event.request, url = new URL(request.url);
    // other sites (fonts, the video, the contact form) are left to the browser, under the page's own rules
    if (url.origin !== self.location.origin || request.method !== 'GET') return;
    if (url.pathname.includes(EVIDENCE_PATH)) {
        event.respondWith(evidenceCacheFirst(request));
        return;
    }
    if (request.mode === 'navigate' || url.pathname.endsWith('/') || FRESH.test(url.pathname)) {
        event.respondWith(networkFirst(request, url));
        return;
    }
    // images, fonts and icons do not change under a name: the kept copy first
    event.respondWith(caches.match(request).then((response) => response || fetch(request)));
});
