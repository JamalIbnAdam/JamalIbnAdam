/* App-like touch, shared by /, /tree/ and /more/: no long-press menu on the tree, images, header or nav.
   It is not blocked page-wide: transcriptions, quotes and the references list can still be selected and copied. */
(() => {
'use strict';
const BLOCK = 'header, nav, img, svg, .sg-nav, .nav-tabs-container, .ft-stage, .ft-fcards';
const KEEP = '.ft-reader .tp, .ft-panel .qt, .ft-panel .note, #home-sources';
document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    if (target.closest(KEEP)) return;
    if (target.closest(BLOCK)) event.preventDefault();
});
})();
