/* App-like touch, shared by /, /tree/ and /more/: no long-press menu anywhere on the page.
   The exceptions are the text of a document, a quote, a note and the references list, and form fields. */
(() => {
'use strict';
const KEEP = '.ft-reader .tp, .ft-panel .qt, .ft-panel .note, #home-sources, #more-sources, .sg-quote, .sg-src, input, textarea, [contenteditable]';
document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target && target.closest && target.closest(KEEP)) return;
    event.preventDefault();
});
})();

/* The section menu marks where the reader is: the tree page's own tile, or the section of this page that is in view. */
(() => {
'use strict';
const tiles = [...document.querySelectorAll('.sg-nav a[data-nav]')];
if (!tiles.length) return;
const mark = (key, value) => tiles.forEach((a) => { if (a.dataset.nav === key) a.setAttribute('aria-current', value); else a.removeAttribute('aria-current'); });
if (/\/tree\/(?:index\.html)?$/.test(location.pathname)) { mark('tree', 'page'); return; }
// the sections of this page that the menu names (home: tree, journey, sources; /more/: figures, library, methods, poem, author)
const here = tiles.map((a) => ({ key: a.dataset.nav, el: document.getElementById(a.dataset.nav) })).filter((x) => x.el);
if (!here.length) return;
let waiting = false;
function update() {
    waiting = false;
    const line = window.innerHeight * 0.4;
    let current = /\/more\//.test(location.pathname) ? here[0].key : null;   // /more/ opens on its first section; the home page's top is none of them
    for (const x of here) if (x.el.getBoundingClientRect().top <= line) current = x.key;
    mark(current, 'location');
}
const later = () => { if (!waiting) { waiting = true; requestAnimationFrame(update); } };
window.addEventListener('scroll', later, { passive: true });
window.addEventListener('hashchange', () => setTimeout(update, 60));
window.addEventListener('load', update);
update();
})();
