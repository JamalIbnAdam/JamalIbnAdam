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

// the poem: one line per verse, its two halves side by side
function renderPoem() {
    document.querySelectorAll('[data-i18n-lines]').forEach((box) => {
        const value = strings()[box.getAttribute('data-i18n-lines')];
        const lines = Array.isArray(value) ? value : value ? [value] : [];
        box.textContent = '';
        lines.forEach((line) => {
            const p = document.createElement('p');
            p.className = 'poem-line';
            if (typeof line === 'string' && line.includes('...')) {
                const parts = line.split('...');
                const first = (parts.shift() || '').trim();
                p.innerHTML = `<span class="verse-part">${first}</span><span class="verse-divider">…</span><span class="verse-part">${parts.join('...').trim()}</span>`;
            } else p.textContent = line;
            box.appendChild(p);
        });
    });
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

/* ---------- figures named in the book but not linked to the tree (data/figures-unlinked.json) ---------- */
function addUnlinkedFigures() {
    fetch(`${siteRoot}data/figures-unlinked.json`).then((r) => (r.ok ? r.json() : [])).then((list) => {
        list.forEach((p) => {
            const e = (p.evidence || [])[0] || {};
            const card = document.createElement('article');
            card.className = 'sg-card';
            card.dir = 'rtl';
            card.innerHTML = `<h3>${esc(p.name_as_written)}</h3><p>${esc(p.note_for_display)}</p>` +
                (e.quote ? `<p class="sg-quote">«${esc(e.quote)}»</p>` : '') +
                (e.image ? `<a href="${esc(e.image)}" target="_blank" rel="noopener"><img class="sg-shot" src="${esc(e.image)}" alt="" loading="lazy" decoding="async"></a>` : '') +
                `<p class="sg-meta">${esc([e.source, e.page, e.date].filter(Boolean).join(' · '))}</p>`;
            $('more-figures').appendChild(card);
        });
        goToHash();
    }).catch(() => { });
}

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
addUnlinkedFigures();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${siteRoot}sw.js`).catch((err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
})();
