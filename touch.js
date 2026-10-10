/* App-like touch, shared by /, /tree/ and /more/: no long-press menu anywhere on the page.
   The exceptions are the text of a document, a quote, a note and the references list, and form fields. */
(() => {
'use strict';
const KEEP = '.ft-reader .tp, .ft-panel .qt, .ft-panel .note, #home-sources, .sg-quote, .sg-src, input, textarea, [contenteditable]';
document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target && target.closest && target.closest(KEEP)) return;
    event.preventDefault();
});
})();
