/* Page shell for /tree/: language loading and static strings, reusing the site's data/data_<lang>.js.
   tree.js redraws itself when <html lang> changes. */
(() => {
'use strict';

const languageStorageKey = 'preferredLanguage';
const languages = ['ar', 'en', 'tr', 'pl', 'es'];
const siteRoot = new URL('../', document.currentScript.src).href;
const select = document.getElementById('lang-select');
const htmlRoot = document.documentElement;

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

// fresh copy first, as on the home page; the plain URL is the one the service worker keeps for offline use
function loadLanguageScript(langCode) {
    const file = `data/data_${langCode}.js`, hash = (window.SITE_V || {})[file];
    // asked for as file?v=<hash of its content> (data/version.js, written by scripts/stamp.mjs)
    return loadScript(siteRoot + file + (hash ? `?v=${hash}` : '')).catch(() => loadScript(siteRoot + file));
}

function applyTranslations() {
    const data = window.FamilyTreeData || {};
    const translations = data.translations || {};
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const value = translations[el.getAttribute('data-i18n')];
        if (typeof value === 'string') el.innerHTML = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const value = translations[el.getAttribute('data-i18n-placeholder')];
        if (typeof value === 'string') el.setAttribute('placeholder', value);
    });
    if (typeof translations.tree_page_title === 'string') document.title = translations.tree_page_title;
    const lang = (data.meta && data.meta.lang) || 'ar';
    if (select) select.value = lang;
    labelTheme();
    htmlRoot.setAttribute('dir', (data.meta && data.meta.dir) || 'rtl');
    htmlRoot.setAttribute('lang', lang);   // last: this is the signal tree.js redraws on
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

// sun/moon switch: dark unless the visitor chose otherwise (the choice is applied before first paint in index.html)
const themeStorageKey = 'treeTheme';
const themeButton = document.getElementById('home-theme');   // the shared header's button
function labelTheme() {
    const translations = (window.FamilyTreeData && window.FamilyTreeData.translations) || {};
    const label = translations[htmlRoot.getAttribute('data-theme') === 'light' ? 'home_theme_to_dark' : 'home_theme_to_light'];
    if (themeButton && typeof label === 'string') themeButton.setAttribute('aria-label', label);
}
if (themeButton) {
    themeButton.setAttribute('aria-pressed', String(htmlRoot.getAttribute('data-theme') !== 'light'));
    themeButton.addEventListener('click', () => {
        const next = htmlRoot.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        htmlRoot.setAttribute('data-theme', next);
        themeButton.setAttribute('aria-pressed', String(next === 'dark'));
        labelTheme();
        try {
            localStorage.setItem(themeStorageKey, next);
        } catch (error) {
            console.warn('Unable to save theme preference', error);
        }
    });
}

if (select) select.addEventListener('change', (event) => changeLanguage(event.target.value));
changeLanguage(resolveInitialLanguage());

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${siteRoot}sw.js`).catch((err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
})();
