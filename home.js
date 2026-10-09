/* Home page (index.html): language, theme, the three numbers, the stage-1 name sheets and the sources list.
   The markup is the design's own; this file only fills it from the data. */
(() => {
'use strict';

const languageStorageKey = 'preferredLanguage';
const themeStorageKey = 'treeTheme';           // shared with /tree/
const languages = ['ar', 'en', 'tr', 'pl', 'es'];
const CONTRIBUTE_URL = '';                       // WhatsApp or e-mail link; the send button stays hidden while this is empty
const htmlRoot = document.documentElement;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strings = () => (window.FamilyTreeData && window.FamilyTreeData.translations) || {};
const t = (key) => (typeof strings()[key] === 'string' ? strings()[key] : key);

/* ---------- language (the same files and the same stored choice as the rest of the site) ---------- */
function resolveInitialLanguage() {
    try {
        const saved = localStorage.getItem(languageStorageKey);
        if (languages.includes(saved)) return saved;
    } catch (error) {
        console.warn('Unable to read language preference', error);
    }
    const browserLanguage = (navigator.language || '').toLowerCase();
    if (browserLanguage.startsWith('pl')) return 'pl';
    if (browserLanguage.startsWith('tr')) return 'tr';
    if (browserLanguage.startsWith('es')) return 'es';
    if (browserLanguage.startsWith('en')) return 'en';
    return 'ar';
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = $('family-tree-data');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.id = 'family-tree-data';
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function loadLanguageScript(langCode) {
    const url = `data/data_${langCode}.js`;
    return loadScript(`${url}?t=${Date.now()}`).catch(() => loadScript(url));
}

function applyTranslations() {
    const data = window.FamilyTreeData || {};
    const translations = data.translations || {};
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const value = translations[el.getAttribute('data-i18n')];
        if (typeof value === 'string') el.innerHTML = value;
    });
    [['data-i18n-placeholder', 'placeholder'], ['data-i18n-alt', 'alt']].forEach(([from, to]) => {
        document.querySelectorAll(`[${from}]`).forEach((el) => {
            const value = translations[el.getAttribute(from)];
            if (typeof value === 'string') el.setAttribute(to, value);
        });
    });
    const lang = (data.meta && data.meta.lang) || 'ar';
    htmlRoot.setAttribute('lang', lang);
    htmlRoot.setAttribute('dir', (data.meta && data.meta.dir) || 'rtl');
    if ($('lang-select')) $('lang-select').value = lang;
    $('home-preview').setAttribute('aria-label', t('home_tree_aria'));
    $('home-gap').setAttribute('aria-label', t('home_gap_aria'));
    $('home-sheet-x').setAttribute('aria-label', t('tree_close'));
    document.querySelector('label[for="sg-search"]').textContent = t('home_search_label');
    updateThemeLabel();
    renderSources();
    closeSheet();
}

async function changeLanguage(langCode) {
    try {
        await loadLanguageScript(langCode);
        try {
            localStorage.setItem(languageStorageKey, langCode);
        } catch (error) {
            console.warn('Unable to save language preference', error);
        }
        applyTranslations();
    } catch (error) {
        console.error('Language load failed:', error);
    }
}

/* ---------- theme ---------- */
function updateThemeLabel() {
    $('home-theme').setAttribute('aria-label', htmlRoot.getAttribute('data-theme') === 'light' ? t('home_theme_to_dark') : t('home_theme_to_light'));
}
$('home-theme').addEventListener('click', () => {
    const next = htmlRoot.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    htmlRoot.setAttribute('data-theme', next);
    try {
        localStorage.setItem(themeStorageKey, next);
    } catch (error) {
        console.warn('Unable to save theme preference', error);
    }
    updateThemeLabel();
});

/* ---------- the three numbers, computed from the data ---------- */
// data/stats.json is generated from tree.json and docs.json by scripts/build-stats.mjs
function loadNumbers() {
    fetch('data/stats.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stats.json: HTTP ${r.status}`))))
        .then((stats) => {
            $('home-st-persons').textContent = stats.names;
            $('home-st-docs').textContent = stats.documents;
            if (stats.oldest_hijri) $('home-st-oldest').textContent = `${stats.oldest_hijri}${t('tree_ah') === 'tree_ah' ? 'هـ' : t('tree_ah')}`;
        })
        .catch((error) => console.warn('Unable to load the numbers', error));
}

/* ---------- search: the tree page does the searching ---------- */
$('home-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const q = $('sg-search').value.trim();
    location.href = q ? `tree/#/q/${encodeURIComponent(q)}` : 'tree/';
});

/* ---------- stage 1: each name opens a small sheet with its source and its story ---------- */
const sheet = $('home-sheet');
let sheetOpener = null;
function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (sheetOpener && sheetOpener.isConnected) sheetOpener.focus();
}
function openSheet(bead) {
    const beads = [...document.querySelectorAll('.sg-bead')];
    // the timeline nodes p_001–p_033 follow the beads in order; the two names under review have no node yet
    const index = beads.slice(0, beads.indexOf(bead)).filter((b) => !b.dataset.verify).length;
    const node = bead.dataset.verify ? null : ((window.FamilyTreeData && window.FamilyTreeData.nodes) || [])[index];
    $('home-sheet-name').textContent = bead.dataset.bead;
    $('home-sheet-src').textContent = node ? [node.src ? `${t('tree_source')}: ${node.src}` : '', node.date || ''].filter(Boolean).join(' · ') : '';
    $('home-sheet-story').textContent = node ? node.story || node.logic || '' : t('home_verify_note');
    sheetOpener = bead;
    sheet.hidden = false;
    $('home-sheet-x').focus();
}
document.addEventListener('click', (event) => {
    const bead = event.target.closest('.sg-bead');
    if (bead) { openSheet(bead); return; }
    if (!sheet.hidden && !event.target.closest('#home-sheet')) closeSheet();
});
$('home-sheet-x').addEventListener('click', closeSheet);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });

/* ---------- sources: data/sources.json, so books are added without touching the code ---------- */
let sources = null;
function renderSources() {
    if (!sources) return;
    const english = htmlRoot.getAttribute('lang') !== 'ar';
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
    $('home-sources').innerHTML = groups.map((g) => `<div style="flex: 1 1 340px; min-width: 0;">
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
function loadSources() {
    fetch('data/sources.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sources.json: HTTP ${r.status}`))))
        .then((list) => { sources = list; renderSources(); })
        .catch((error) => console.warn('Unable to load the sources list', error));
}

/* ---------- boot ---------- */
if (CONTRIBUTE_URL) { $('home-send').href = CONTRIBUTE_URL; $('home-send').hidden = false; }
$('lang-select').addEventListener('change', (event) => changeLanguage(event.target.value));
changeLanguage(resolveInitialLanguage());
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
window.addEventListener('load', () => idle(() => { loadSources(); loadNumbers(); }));

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
})();
