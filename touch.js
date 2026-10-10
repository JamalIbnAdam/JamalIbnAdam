/* App-like touch, shared by /, /tree/ and /more/: no text selection and no long-press menu anywhere on the page, so the
   browser has no word to offer a search for. Only form fields keep them. What a reader may want to take away — a
   reference, a document's text, a quote, a source line — has a «نسخ» (copy) button instead. */
(() => {
'use strict';
const KEEP = 'input, textarea, [contenteditable]';
document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target && target.closest && target.closest(KEEP)) return;
    event.preventDefault();
});

/* ---------- copy buttons ---------- */
const DEFAULTS = { copy_btn: 'نسخ', copy_done: 'نُسخ ✓' };
const t = (key) => { const tr = window.FamilyTreeData && window.FamilyTreeData.translations; return (tr && typeof tr[key] === 'string' && tr[key]) || DEFAULTS[key]; };
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"></rect><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"></path></svg>';
// the markup of a button that copies the given text; the page scripts use it where they build their own lists
window.copyButton = (text) => `<button type="button" class="cp" data-copy="${String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}" aria-label="${t('copy_btn')}">${ICON}</button>`;
async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (error) {
        // older browsers, or a page the browser will not let write to the clipboard directly
        const field = document.createElement('textarea');
        field.value = text; field.setAttribute('readonly', ''); field.style.cssText = 'position: fixed; top: 0; opacity: 0;';
        (document.querySelector('dialog[open]') || document.body).appendChild(field);
        field.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        field.remove();
        return ok;
    }
}
document.addEventListener('click', async (event) => {
    const button = event.target.closest && event.target.closest('.cp');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    // the text given to the button, or the text of the element it stands for (its own parent, or the one named by data-copy-from)
    const from = button.dataset.copyFrom ? document.getElementById(button.dataset.copyFrom) : button.parentElement;
    const text = button.dataset.copy != null ? button.dataset.copy : (from ? from.innerText : '');
    if (!(await copyText(text.replace(/\u00a0/g, ' ').trim()))) return;
    button.dataset.done = t('copy_done');           // «نُسخ ✓», drawn by CSS for a moment (it is not part of the text)
    clearTimeout(button.doneTimer);
    button.doneTimer = setTimeout(() => { delete button.dataset.done; }, 1500);
}, true);
// a quote and a source line get their button wherever a page draws them
const WANT = '.qt, .sg-quote, .sg-src';
function decorate(rootEl) {
    if (!rootEl.querySelectorAll) return;
    const list = rootEl.matches && rootEl.matches(WANT) ? [rootEl] : [];
    rootEl.querySelectorAll(WANT).forEach((el) => list.push(el));
    list.forEach((el) => {
        if (!el.textContent.trim() || el.querySelector(':scope > .cp')) return;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'cp'; button.setAttribute('aria-label', t('copy_btn')); button.innerHTML = ICON;
        el.appendChild(button);
    });
}
const start = () => {
    decorate(document.body);
    new MutationObserver((records) => records.forEach((r) => { r.addedNodes.forEach((node) => { if (node.nodeType === 1) decorate(node); }); if (r.target.nodeType === 1 && r.target.matches(WANT)) decorate(r.target); })).observe(document.body, { childList: true, subtree: true });
};
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
// the label follows the page's language
new MutationObserver(() => document.querySelectorAll('.cp').forEach((b) => b.setAttribute('aria-label', t('copy_btn')))).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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
