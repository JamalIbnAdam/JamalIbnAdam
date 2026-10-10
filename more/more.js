/* /more/ (figures, library, poem, author): the same shell as the home page — language, theme — and the page's own few behaviours. */
(() => {
'use strict';

const languageStorageKey = 'preferredLanguage';
const themeStorageKey = 'treeTheme';           // shared with / and /tree/
const languages = ['ar', 'en', 'tr', 'pl', 'es'];
const siteRoot = new URL('../', document.currentScript.src).href;
const htmlRoot = document.documentElement;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strings = () => (window.FamilyTreeData && window.FamilyTreeData.translations) || {};
const t = (key) => (typeof strings()[key] === 'string' ? strings()[key] : key);

let settled = false;
// a link to one section (more/#poem): the text, the cards and the fonts arrive after the page opens and move the section,
// so for the first few seconds the page goes back to it whenever its height changes — unless the reader has started to scroll
const opened = Date.now();
let touched = false;
['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, () => { touched = true; }, { once: true, passive: true }));
function goToHash() {
    if (touched || location.hash.length < 2 || Date.now() - opened > 5000) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
}
if ('ResizeObserver' in window) {
    const watch = new ResizeObserver(goToHash);
    watch.observe(document.getElementById('more-main'));
    setTimeout(() => watch.disconnect(), 5000);
}

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
    const url = `${siteRoot}data/data_${langCode}.js`;
    return loadScript(`${url}?t=${Date.now()}`).catch(() => loadScript(url));
}

// the poem: one verse per line — its first half, a gap, then its second half. The verses are Arabic in every language.
function renderPoem() {
    document.querySelectorAll('[data-i18n-lines]').forEach((box) => {
        const value = strings()[box.getAttribute('data-i18n-lines')];
        const lines = Array.isArray(value) ? value : value ? [value] : [];
        box.textContent = '';
        lines.forEach((line) => {
            const p = document.createElement('p');
            p.className = 'poem-line';
            p.dir = 'rtl';
            p.lang = 'ar';
            String(line).split(' ... ').forEach((half) => {
                const span = document.createElement('span');
                span.className = 'verse-part';
                span.textContent = half.trim();
                p.appendChild(span);
            });
            box.appendChild(p);
        });
    });
}

// «منهج البحث»: on a phone each card is closed and shows its title and its first line; on a wide screen the cards are open
let methodsPlaced = false;
function renderMethods() {
    document.querySelectorAll('.sg-method').forEach((card) => {
        const first = card.querySelector('.sg-method-body p, .sg-method-body li');
        card.querySelector('.sg-teaser').textContent = first ? first.textContent : '';
        if (!methodsPlaced) card.open = !window.matchMedia('(max-width: 700px)').matches;
    });
    methodsPlaced = true;
}

function applyTranslations() {
    const data = window.FamilyTreeData || {};
    const translations = data.translations || {};
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const value = translations[el.getAttribute('data-i18n')];
        if (typeof value === 'string') el.innerHTML = value;
    });
    [['data-i18n-placeholder', 'placeholder'], ['data-i18n-alt', 'alt'], ['data-i18n-aria', 'aria-label']].forEach(([from, to]) => {
        document.querySelectorAll(`[${from}]`).forEach((el) => {
            const value = translations[el.getAttribute(from)];
            if (typeof value === 'string') el.setAttribute(to, value.replace(/<[^>]*>/g, ''));
        });
    });
    const lang = (data.meta && data.meta.lang) || 'ar';
    htmlRoot.setAttribute('lang', lang);
    htmlRoot.setAttribute('dir', (data.meta && data.meta.dir) || 'rtl');
    if ($('lang-select')) $('lang-select').value = lang;
    renderPoem();
    renderMethods();
    renderFigures();
    window.SourcesList.render($('more-sources'), t);
    updateThemeLabel();
    if (!settled) goToHash();
    settled = true;
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

/* ---------- «الأنصار في ليبيا»: data/ansar-libya.json, grouped by region; every card carries its evidence ---------- */
// The names, places, claims, notes and quotes are shown exactly as the data has them, in Arabic, in every language.
let figures = null, unlinked = null;
const REGION_KEYS = { 'طرابلس والساحل الغربي': 'fig_region_tripoli', 'الجبل الغربي وغريان': 'fig_region_jabal', 'برقة': 'fig_region_barqa', 'فزان والجنوب': 'fig_region_fezzan' };
const pageText = (page) => (/ص\s?\d/.test(String(page)) ? String(page) : t('fig_page').replace('{p}', page));   // some pages already say «ص240»
// a page picture is shown only for our own book scans (the book of Dr. Muhammad); other books show quote and page only
const ownScan = (e) => e.image && e.src === 'ansar';
function evidenceHtml(e, sources) {
    const src = [sources[e.src] || e.source || '', e.page ? pageText(e.page) : '', e.date || ''].filter(Boolean).join(' · ');
    return `<li>${e.quote ? `<p class="sg-quote" dir="rtl" lang="ar">«${esc(e.quote)}»</p>` : ''}<p class="sg-src">${esc(src)}</p>` +
        (e.via ? `<p class="sg-src">${esc(t('fig_via'))} <span dir="rtl" lang="ar">${esc(e.via)}</span></p>` : '') +
        (ownScan(e) ? `<button type="button" class="sg-thumb" data-img="${esc(e.image)}" data-quote="${esc(e.quote || '')}" data-src="${esc(src)}" aria-label="${esc(t('tree_open_doc'))}: ${esc(pageText(e.page))}"><img src="${esc(e.image)}" alt="" loading="lazy" decoding="async" width="96" height="128"></button>` : '') + '</li>';
}
function figureCard(item, sources) {
    const where = [item.place, item.era].filter(Boolean).join(' · ');
    return `<article class="sg-card sg-fig" id="fig-${esc(item.id)}"><h3 dir="rtl" lang="ar">${esc(item.name)}</h3>` +
        (where ? `<p class="sg-where" dir="rtl" lang="ar">📍 ${esc(where)}</p>` : '') +
        `<p class="sg-claim" dir="rtl" lang="ar">${esc(item.claim)}</p>` +
        (item.note ? `<p class="sg-note" dir="rtl" lang="ar">${esc(item.note)}</p>` : '') +
        `<details class="sg-ev"><summary>${esc(t('fig_evidence').replace('{n}', item.evidence.length))}</summary><ol>${item.evidence.map((e) => evidenceHtml(e, sources)).join('')}</ol></details>` +
        (item.tree_link ? `<a class="sg-btn sg-btn-line" href="${esc(item.tree_link)}">${esc(t('fig_in_tree'))}</a>` : '') + '</article>';
}
function renderFigures() {
    if (!figures) return;
    const open = new Set([...document.querySelectorAll('#more-figures details[open]')].map((d) => d.parentNode.id));
    const groups = figures.regions.map((region, i) => ({ id: `fig-r${i + 1}`, title: t(REGION_KEYS[region] || region), cards: figures.items.filter((x) => x.region === region).map((x) => figureCard(x, figures.sources)) }));
    // the fifth group: the figures of Brak al-Shati that are not linked to the tree yet (data/figures-unlinked.json)
    if (unlinked && unlinked.length) groups.push({ id: 'fig-r5', title: t('fig_region_unlinked'), cards: unlinked.map((p, i) => figureCard({ id: `unlinked-${i + 1}`, name: p.name_as_written, claim: p.note_for_display, evidence: (p.evidence || []).map((e) => ({ ...e, src: 'ansar' })) }, { ansar: '' })) });
    const shown = groups.filter((g) => g.cards.length);
    $('more-fig-note').textContent = figures.note_ar || '';
    $('more-fig-chips').innerHTML = shown.map((g) => `<a href="more/#${g.id}">${esc(g.title)}</a>`).join('');
    $('more-figures').innerHTML = shown.map((g) => `<section class="sg-region" id="${g.id}"><h3 class="sg-region-h">${esc(g.title)}</h3><div class="sg-grid">${g.cards.join('')}</div></section>`).join('');
    open.forEach((id) => { const d = document.getElementById(id)?.querySelector('details'); if (d) d.open = true; });
    goToHash();
}
function loadFigures() {
    const get = (file) => fetch(`${siteRoot}data/${file}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${file}: HTTP ${r.status}`))));
    get('ansar-libya.json').then((data) => { figures = data; renderFigures(); }).catch((error) => console.warn('Unable to load the figures', error));
    get('figures-unlinked.json').then((list) => { unlinked = list; renderFigures(); }).catch(() => { });
}

/* ---------- the page reader: the book page, its quote and its source ---------- */
const reader = $('more-reader');
function openReader(button) {
    $('more-reader-title').textContent = button.dataset.src;
    $('more-reader-img').src = button.dataset.img;
    $('more-reader-quote').textContent = button.dataset.quote ? `«${button.dataset.quote}»` : '';
    $('more-reader-src').textContent = button.dataset.src;
    $('more-reader-x').setAttribute('aria-label', t('tree_close'));
    reader.classList.remove('zoom');
    if (typeof reader.showModal === 'function') reader.showModal(); else reader.setAttribute('open', '');
}
document.addEventListener('click', (event) => {
    const thumb = event.target.closest('.sg-thumb');
    if (thumb) { openReader(thumb); return; }
    if (event.target.closest('#more-reader-x') || event.target === reader) { reader.close(); return; }
    if (event.target.id === 'more-reader-img') reader.classList.toggle('zoom');   // a tap enlarges the page; another one fits it again
});

/* ---------- the nasheed: nothing is asked of YouTube until the visitor presses play; then the card becomes the player ---------- */
$('more-nasheed').addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/8e90r1lZMP4?autoplay=1&rel=0';
    iframe.title = 'ملحمة الأنصار في أرض ليبيا';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    $('more-nasheed-box').replaceChildren(iframe);
});

/* ---------- the playlist loads only when asked for ---------- */
$('more-video').addEventListener('click', () => {
    const box = $('more-video');
    if (box.querySelector('iframe')) return;
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/videoseries?list=PLx2j-W6hDiG6a9AAPBQgCRjG_t1Ge--dl&autoplay=1';
    iframe.title = 'YouTube video player';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    box.appendChild(iframe);
});

/* ---------- contact form; «أرسل بياناتك» on the tree page arrives here with its message ready ---------- */
const contactForm = $('contactForm'), contactSuccess = $('contactSuccess');
const preset = new URLSearchParams(location.search).get('msg');
if (preset) {
    contactForm.elements.message.value = preset.slice(0, 2000);
    window.addEventListener('load', () => { $('contact').scrollIntoView({ block: 'start' }); });
}
contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    contactSuccess.hidden = true;
    try {
        const response = await fetch(contactForm.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(contactForm) });
        if (response.ok) {
            contactForm.reset();
            contactSuccess.hidden = false;
        } else {
            console.error('Form submission failed', response.statusText);
        }
    } catch (error) {
        console.error('Form submission error', error);
    }
});

/* ---------- boot ---------- */
$('lang-select').addEventListener('change', (event) => changeLanguage(event.target.value));
changeLanguage(resolveInitialLanguage());
loadFigures();
// the library's references: the same list, drawn by the same code, as on the home page
window.SourcesList.load().then(() => window.SourcesList.render($('more-sources'), t)).catch((error) => console.warn('Unable to load the sources list', error));

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${siteRoot}sw.js`).catch((err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
})();
