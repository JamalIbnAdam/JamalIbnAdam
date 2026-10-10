/* Runs in <head>, before first paint, on every page. Kept in a file so that no page needs an inline script. */
(function () {
    // theme: the stored choice (one key for /, /tree/ and /more/), otherwise dark
    try { var t = localStorage.getItem('treeTheme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { }
    // the web fonts' stylesheet is fetched without blocking the page, then switched on
    var links = document.querySelectorAll('link[data-late-css]');
    for (var i = 0; i < links.length; i++) (function (link) {
        var on = function () { link.media = 'all'; };
        if (link.sheet) on(); else link.addEventListener('load', on);
    })(links[i]);
})();


/* When a new version of the site takes over (a new service worker), the page loads it once, by itself: no second visit
   is needed. Never on the very first visit, never twice in a row, and not while someone is typing in a form or
   reading a document: it then waits until they have finished. */
(function () {
    if (!('serviceWorker' in navigator)) return;
    var had = !!navigator.serviceWorker.controller, KEY = 'siteReloadedAt';
    navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!had) { had = true; return; }                       // the first worker of a first visit: nothing to update
        var last = 0;
        try { last = Number(sessionStorage.getItem(KEY) || 0); } catch (e) { return; }   // without the guard, do not risk a loop
        if (Date.now() - last < 15000) return;
        var busy = function () {
            var a = document.activeElement;
            return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || !!document.querySelector('.ft-reader:not([hidden]), dialog[open]');
        };
        (function go() {
            if (busy()) { setTimeout(go, 2000); return; }
            try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { return; }
            location.reload();
        })();
    });
})();
