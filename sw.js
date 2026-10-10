const CACHE_NAME = 'jamalibnadam-1c7f0dd272';
// document scans are not precached: each one is cached the first time it is viewed
const EVIDENCE_CACHE = 'jamalibnadam-evidence';
const EVIDENCE_PATH = '/assets/evidence/';
const EVIDENCE_MAX = 100;
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './logo.webp',
    './theme.js?v=400528e3de',
    './sources.js?v=5f6f975b6e',
    './install.js?v=106657188c',
    './touch.js?v=1347000355',
    './icons/icon-192.png',
    './data/data_ar.js?v=67605a376c',
    './data/data_en.js?v=14390e2180',
    './data/data_es.js?v=bc9c2ae893',
    './data/data_pl.js?v=e2fb61e00c',
    './data/data_tr.js?v=d5e4462f07',
    './tree/',
    './home.css?v=50cc5eb38d',
    './home.js?v=9e84c0ce9c',
    './data/sources.json?v=af366f2bbd',
    './data/stats.json?v=851fc52dc0',
    './more/',
    './more/more.js?v=92172b951d',
    './data/ansar-libya.json?v=e3ef693176',
    './data/figures-unlinked.json?v=d83716b80d'
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

/* Every script, style and data file is asked for as file?v=<hash of its content> (scripts/stamp.mjs): a changed file has
   a new address. Such an address never changes its content, so the kept copy is used at once; a page can therefore never
   get an old file for a new one, and old and new cannot mix. The pages themselves, and anything asked for without a
   stamp, come from the network first; the kept copy is for when there is no network. */
const FRESH = /\.(?:html|js|css|json)$/;
function stamped(request, url) {
    return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(url.href).then((kept) => {
            if (kept) return kept;
            return fetch(request).then((response) => {
                if (response.ok) cache.put(url.href, response.clone());
                return response;
            }).catch(() => {
                // no network and this exact version was never kept: an older copy of the file is better than nothing
                return cache.match(request, { ignoreSearch: true }).then((old) => {
                    if (old) return old;
                    throw new Error('offline, and no kept copy of ' + url.pathname);
                });
            });
        });
    });
}
function networkFirst(request, url) {
    const key = url.origin + url.pathname;          // without ?msg= and the like
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
        event.respondWith(request.mode !== 'navigate' && url.searchParams.has('v') ? stamped(request, url) : networkFirst(request, url));
        return;
    }
    // images, fonts and icons do not change under a name: the kept copy first
    event.respondWith(caches.match(request).then((response) => response || fetch(request)));
});
