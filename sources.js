/* «المراجع المستخدمة في البحث»: one list (data/sources.json) drawn by one piece of code, on the home page and in the library.
   Books are added in the JSON file, without touching the code. */
(() => {
'use strict';
const siteRoot = new URL('./', document.currentScript.src).href;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let sources = null, loading = null;

function load() {
    if (!loading) loading = fetch(`${siteRoot}data/sources.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sources.json: HTTP ${r.status}`)))).then((list) => { sources = list; return list; });
    return loading;
}

// box: the element to fill; t: the page's translate function. The list is in Arabic for Arabic and in English otherwise.
function render(box, t) {
    if (!sources || !box) return;
    const english = document.documentElement.getAttribute('lang') !== 'ar';
    const groups = [];
    sources.forEach((b) => {
        let g = groups.find((x) => x.group === b.group);
        if (!g) groups.push((g = { group: b.group, title: (english && b.group_en) || b.group, items: [] }));
        g.items.push(b);
    });
    // a PDF is offered only when its licence allows it; otherwise the link goes to where the book is legally hosted
    const link = (b) => (b.pdf && (b.license === 'public-domain' || b.license === 'permission')
        ? `<a href="${esc(b.pdf)}" style="font-size: 12px; color: var(--h-gold);">${esc(t('home_src_download'))}</a>`
        : b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" style="font-size: 12px; color: var(--h-gold);">${esc(t('home_src_open'))}</a>` : '');
    box.innerHTML = groups.map((g) => `<div style="flex: 1 1 340px; min-width: 0;">
<h3 style="margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--h-hair); font-family: 'Amiri', serif; font-size: 22px; color: var(--h-gold);">${esc(g.title)}</h3>
<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px;">
${g.items.map((b) => `<li style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; font-size: 15px;">
<span style="flex: 1 1 220px; color: var(--h-ink);">${esc((english && b.title_en) || b.title_ar)}</span>
${link(b)}
${(english && b.note_en) || b.note_ar ? `<p style="flex: 1 1 100%; margin: 6px 0 0; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--h-hair); font-size: 14px; line-height: 1.9; color: var(--h-ink2);">${esc((english && b.note_en) || b.note_ar)}</p>` : ''}
</li>`).join('\n')}
</ul>
</div>`).join('\n');
}

window.SourcesList = { load, render };
})();
