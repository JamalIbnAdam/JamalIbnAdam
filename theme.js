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
