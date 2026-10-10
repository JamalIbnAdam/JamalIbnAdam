/* Home page (index.html): language, theme, the three numbers, the stage-1 name sheets and the sources list.
   The markup is the design's own; this file only fills it from the data. */
(() => {
'use strict';

const languageStorageKey = 'preferredLanguage';
const themeStorageKey = 'treeTheme';           // shared with /tree/
const languages = ['ar', 'en', 'tr', 'pl', 'es'];
const CONTRIBUTE_URL = '';                       // WhatsApp or e-mail link; the send button stays hidden while this is empty
const htmlRoot = document.documentElement;
// an element this script expects but an older kept page does not have is stood in for by a detached one: nothing throws
const missing = new Map();
const $ = (id) => document.getElementById(id) || missing.get(id) || missing.set(id, document.createElement('div')).get(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a data file is asked for as file?v=<hash of its content> (data/version.js, written by scripts/stamp.mjs)
const ver = (path) => { const h = (window.SITE_V || {})[path]; return h ? `${path}?v=${h}` : path; };
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
        const existing = document.getElementById('family-tree-data');
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
    return loadScript(ver(url)).catch(() => loadScript(url));
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
    // «أرسل وثيقة» opens the contact form with the card's title as the subject of the message
    $('home-gap-send').href = `more/?msg=${encodeURIComponent(`${t('home_gap_h')}: `)}#contact`;
    $('home-gap-copied').hidden = true;
    $('home-sheet-x').setAttribute('aria-label', t('tree_close'));
    const searchLabel = document.querySelector('label[for="sg-search"]');
    if (searchLabel) searchLabel.textContent = t('home_search_label');
    updateThemeLabel();
    renderSources();
    renderBeadDates();
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
    fetch(ver('data/stats.json')).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stats.json: HTTP ${r.status}`))))
        .then((stats) => {
            $('home-st-refs').textContent = stats.references;   // the references list, counted by build-stats
            $('home-st-docs').textContent = stats.documents;
            if (stats.oldest_hijri) $('home-st-oldest').textContent = `${stats.oldest_hijri}${t('tree_ah') === 'tree_ah' ? 'هـ' : t('tree_ah')}`;
        })
        .catch((error) => console.warn('Unable to load the numbers', error));
}

/* ---------- search: the tree page does the searching ---------- */
// the words of a name as the tree counts them: no tashkeel, no «بن / ابن / بنت», and «عبد الله» or «أبو بكر» is one word
const nameWordCount = (text) => String(text || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(^| )(بن|ابن|بنت)(?= |$)/g, ' ').replace(/(^| )(عبد|ابو|ابي) +/g, '$1$2').trim().split(/\s+/).filter(Boolean).length;
$('home-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const q = $('sg-search').value.trim();
    // a chain is shown only for a three-part name (own name, father, grandfather); the tree page does the matching
    const short = nameWordCount(q) < 3;
    $('home-search-hint').hidden = !short;
    if (!short) location.href = `tree/#/q/${encodeURIComponent(q)}`;
});

/* ---------- stage 1: each name opens a small sheet with its source and its story ---------- */
const sheet = $('home-sheet');
let sheetOpener = null;
function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (sheetOpener && sheetOpener.isConnected) sheetOpener.focus();
}
// the 35 beads are the 35 timeline nodes, in order
const timeline = () => (window.FamilyTreeData && window.FamilyTreeData.nodes) || [];
const nodeName = (node) => String(node.name || '').replace(/^\d+\.\s*/, '');
function openSheet(bead) {
    const node = timeline()[[...document.querySelectorAll('.sg-bead')].indexOf(bead)];
    $('home-sheet-name').textContent = node ? nodeName(node) : bead.dataset.bead;
    $('home-sheet-src').textContent = node ? [node.src ? `${t('tree_source')}: ${node.src}` : '', node.date || ''].filter(Boolean).join(' · ') : '';
    $('home-sheet-story').textContent = node ? node.story || node.logic || '' : '';
    sheetOpener = bead;
    sheet.hidden = false;
    $('home-sheet-x').focus();
}
// the date is on the bead itself, not only in its sheet: a small second line, in Gregorian years (none for the ancient names)
function renderBeadDates() {
    const nodes = timeline();
    document.querySelectorAll('.sg-bead').forEach((bead, i) => {
        const short = nodes[i] && nodes[i].date_short;
        let line = bead.querySelector('.sg-bead-date');
        if (!short) { if (line) line.remove(); return; }
        if (!line) { line = document.createElement('small'); line.className = 'sg-bead-date'; bead.appendChild(line); }
        line.textContent = short;
    });
}
document.addEventListener('click', (event) => {
    const bead = event.target.closest('.sg-bead');
    if (bead) { openSheet(bead); return; }
    if (!sheet.hidden && !event.target.closest('#home-sheet')) closeSheet();
});
$('home-sheet-x').addEventListener('click', closeSheet);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });

/* ---------- sources: data/sources.json, drawn by sources.js (the library on /more/ shows the same list) ---------- */
function renderSources() { window.SourcesList.render($('home-sources'), t); }
function loadSources() {
    window.SourcesList.load().then(renderSources).catch((error) => console.warn('Unable to load the sources list', error));
}

/* ---------- «شارك هذه الصفحة»: the phone's own share sheet, or the link copied ---------- */
$('home-gap-share').addEventListener('click', async () => {
    const url = 'https://jamalibnadam.com/', title = document.title;
    if (navigator.share) {
        try { await navigator.share({ title, url }); return; } catch (error) {
            if (error && error.name === 'AbortError') return;   // the visitor closed the sheet
        }
    }
    // no share sheet here (or it failed): copy the link and say so
    let copied = false;
    try {
        await navigator.clipboard.writeText(url);
        copied = true;
    } catch (error) {
        // older browsers, or a page the browser will not let write to the clipboard directly
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position: fixed; top: 0; opacity: 0;';
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
        field.remove();
    }
    if (!copied) { console.warn('Unable to copy the link'); return; }
    $('home-gap-copied').hidden = false;
    setTimeout(() => { $('home-gap-copied').hidden = true; }, 4000);
});

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
