/* Install UI, shared by /, /tree/ and /more/. Self-contained: it brings its own styles and Arabic defaults,
   and reads translations from data/data_<lang>.js when the page has loaded them.
   - already running as the installed app: nothing
   - everywhere else the header button is shown at once; it never waits for an event. Pressing it:
       · the browser's own install prompt, when the browser has offered one (beforeinstallprompt)
       · iPhone/iPad: a sheet with the three Share-menu steps
       · Android (Chrome without a prompt, Samsung Internet, Firefox, others): a sheet with the menu steps
       · computers: a sheet saying where the browser keeps «install» (or that it has none)
   - phones and tablets, from any browser, also get a one-time bar («لاحقاً» keeps it away for 14 days) */
(() => {
'use strict';

const DEFAULTS = {
    install_btn: 'ثبّت التطبيق',
    install_bar: 'ثبّت السجل الذهبي على هاتفك — يفتح كتطبيق بلا متصفح',
    install_now: 'تثبيت',
    install_later: 'لاحقاً',
    install_close: 'إغلاق',
    install_ios_title: 'أضِف التطبيق إلى شاشتك في 3 خطوات',
    install_ios_1: 'اضغط زر المشاركة',
    install_ios_1_note: 'في سفاري أسفل الشاشة، وفي الآيباد أعلاها',
    install_ios_2: 'مرّر للأسفل واختر "إضافة إلى الشاشة الرئيسية"',
    install_ios_3: 'اضغط "إضافة" في الزاوية العليا',
    install_ios_add: 'إضافة',
    install_ios_other: 'إن لم تجد الخيار فافتح الموقع في سفاري',
    install_and_title: 'ثبّت التطبيق من قائمة المتصفح',
    install_and_1: 'اضغط زر القائمة ☰ أسفل الشاشة',
    install_and_2: 'اختر "إضافة الصفحة إلى" ثم "الشاشة الرئيسية"',
    install_ff: '⋮ ← تثبيت',
    install_and_chrome_1: 'اضغط ⋮ أعلى الشاشة، ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»',
    install_desk_title: 'ثبّت التطبيق على حاسوبك',
    install_desk_chrome: 'اضغط أيقونة التثبيت في شريط العنوان، أو القائمة ⋮ ← تثبيت',
    install_desk_safari: 'ملف ← إضافة إلى Dock',
    install_desk_ff: 'هذا المتصفح لا يدعم التثبيت؛ افتح الموقع في Chrome أو Edge أو Safari'
};
const t = (key) => {
    const tr = window.FamilyTreeData && window.FamilyTreeData.translations;
    return (tr && typeof tr[key] === 'string' && tr[key]) || DEFAULTS[key];
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ua = navigator.userAgent || '';
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
if (standalone) return;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
const isAndroid = /Android/.test(ua);
const isFirefox = /Firefox|FxiOS/.test(ua);
const isSamsung = /SamsungBrowser/.test(ua);
const isMobile = isIOS || isAndroid || /Mobi|Tablet|Silk|Kindle/.test(ua);          // phones and tablets: they also get the bar
const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(ua);

const LATER_KEY = 'installBarLater', SEEN_KEY = 'installSeen', LATER_MS = 14 * 24 * 60 * 60 * 1000;
const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

/* ---------- styles ---------- */
const css = `
.ins-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid rgba(212,175,55,.6);background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.ins-btn svg{width:18px;height:18px;fill:none;stroke:#d4af37;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ins-bar,.ins-sheet{position:fixed;z-index:9600;inset-inline:0;bottom:0;margin-inline:auto;width:min(560px,100%);box-sizing:border-box;background:#1a201d;color:#e8e4da;border:1px solid rgba(212,175,55,.5);border-bottom:0;border-radius:16px 16px 0 0;font-family:'Noto Kufi Arabic',sans-serif;font-size:15px;line-height:1.7;box-shadow:0 -10px 36px rgb(0 0 0/.4);padding:16px 18px calc(16px + env(safe-area-inset-bottom,0px))}
.ins-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.ins-bar p{margin:0;flex:1 1 220px}
.ins-bar .ins-acts{display:flex;gap:8px;flex:none}
.ins-go,.ins-no,.ins-x{min-height:44px;padding:0 18px;border-radius:10px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.ins-go{background:#d4af37;color:#1a1608;border:0}
.ins-no,.ins-x{background:transparent;color:#e8e4da;border:1px solid rgba(232,228,218,.3)}
.ins-x{position:absolute;top:12px;inset-inline-end:12px;width:44px;padding:0;display:grid;place-items:center}
.ins-x svg{width:14px;height:14px;stroke:currentColor;stroke-width:2;stroke-linecap:round;fill:none}
.ins-sheet h2{margin:0 0 12px;padding-inline-end:52px;font-family:'Amiri',serif;font-size:24px;line-height:1.5;color:#d4af37}
.ins-sheet ol{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.ins-sheet li{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:center}
.ins-sheet .ins-ic{width:44px;height:44px;border-radius:10px;background:#121614;border:1px solid rgba(232,228,218,.18);display:grid;place-items:center;color:#4aa3ff}
.ins-sheet .ins-ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ins-sheet .ins-pill{font-size:12px;font-weight:700;color:#4aa3ff;white-space:nowrap}
.ins-sheet .ins-n{font-weight:700;color:#d4af37;margin-inline-end:6px}
.ins-sheet small{display:block;color:#a9a596;font-size:13px}
.ins-sheet .ins-other{margin:12px 0 0;color:#a9a596;font-size:13px}
.ins-arrow{position:fixed;z-index:9601;left:50%;margin-left:-14px;width:28px;height:28px;color:#d4af37;pointer-events:none}
.ins-arrow.down{bottom:calc(4px + env(safe-area-inset-bottom,0px))}
.ins-arrow.up{top:6px;left:auto;right:96px;margin:0;transform:rotate(180deg)}
.ins-arrow svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.ins-sheet.has-arrow{bottom:40px;border-bottom:1px solid rgba(212,175,55,.5);border-radius:16px;width:min(560px,calc(100% - 16px));padding-bottom:16px}
@media (prefers-reduced-motion:no-preference){.ins-arrow.down{animation:ins-bob 1.1s ease-in-out infinite alternate}.ins-arrow.up{animation:ins-bob-up 1.1s ease-in-out infinite alternate}}
@keyframes ins-bob{from{transform:translateY(-6px)}to{transform:translateY(2px)}}
@keyframes ins-bob-up{from{transform:rotate(180deg) translateY(-6px)}to{transform:rotate(180deg) translateY(2px)}}
[hidden].ins-btn,[hidden].ins-bar,[hidden].ins-sheet,[hidden].ins-arrow{display:none!important}`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const ICON = {
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M12 7v7M9 11.5l3 3 3-3"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 6.5 12 3l4 3.5M7 10H6a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18 10h-1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10M12 13v4M10 15h4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M6 13.5l6 6 6-6"/></svg>'
};

/* ---------- pieces ---------- */
let deferredPrompt = null, button = null, bar = null, sheet = null, arrow = null;

function makeButton() {
    const slot = document.querySelector('[data-install-slot]');
    if (!slot || button) return;
    button = document.createElement('button');
    button.type = 'button'; button.className = 'ins-btn';
    slot.appendChild(button);
    button.addEventListener('click', act);
    label();
}
function label() { if (button) button.innerHTML = `${ICON.phone}<span>${esc(t('install_btn'))}</span>`; }

function closeSheet() {
    if (sheet) { sheet.remove(); sheet = null; }
    if (arrow) { arrow.remove(); arrow = null; }
}
function openSheet(kind) {
    closeSheet(); hideBar();
    sheet = document.createElement('div');
    sheet.className = 'ins-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-labelledby', 'ins-title');
    sheet.dir = document.documentElement.dir || 'rtl';
    const step = (n, icon, text, note) => `<li><span class="ins-ic">${icon}</span><span><span class="ins-n">${n}.</span>${esc(text)}${note ? `<small>${esc(note)}</small>` : ''}</span></li>`;
    if (kind === 'ios') {
        sheet.innerHTML = `<button type="button" class="ins-x" aria-label="${esc(t('install_close'))}">${ICON.x}</button>
<h2 id="ins-title">${esc(t('install_ios_title'))}</h2>
<ol>${step(1, ICON.share, t('install_ios_1'), t('install_ios_1_note'))}${step(2, ICON.plus, t('install_ios_2'))}${step(3, `<span class="ins-pill">${esc(t('install_ios_add'))}</span>`, t('install_ios_3'))}</ol>
${isIOSSafari ? '' : `<p class="ins-other">${esc(t('install_ios_other'))}</p>`}`;
        // a small arrow at the Share button: bottom centre on iPhone, top on iPad
        arrow = document.createElement('div');
        arrow.className = 'ins-arrow ' + (isIPad ? 'up' : 'down'); arrow.setAttribute('aria-hidden', 'true'); arrow.innerHTML = ICON.arrow;
        document.body.appendChild(arrow);
        if (!isIPad) sheet.classList.add('has-arrow');
    } else if (kind === 'desktop') {
        // a computer: where this browser keeps «install», or that it has none
        const text = isMacSafari ? t('install_desk_safari') : isFirefox ? t('install_desk_ff') : t('install_desk_chrome');
        sheet.innerHTML = `<button type="button" class="ins-x" aria-label="${esc(t('install_close'))}">${ICON.x}</button>
<h2 id="ins-title">${esc(t('install_desk_title'))}</h2>
<ol><li><span class="ins-ic">${ICON.phone}</span><span>${esc(text)}</span></li></ol>`;
    } else {
        // Android: Samsung Internet's menu is at the bottom; Firefox has one step; Chrome (when it has offered no prompt) and the rest use ⋮
        const steps = isFirefox ? step(1, ICON.menu, t('install_ff')) : isSamsung ? step(1, ICON.menu, t('install_and_1')) + step(2, ICON.home, t('install_and_2')) : step(1, ICON.menu, t('install_and_chrome_1'));
        sheet.innerHTML = `<button type="button" class="ins-x" aria-label="${esc(t('install_close'))}">${ICON.x}</button>
<h2 id="ins-title">${esc(t('install_and_title'))}</h2>
<ol>${steps}</ol>`;
    }
    sheet.dataset.kind = kind === 'ios' ? 'ios' : kind === 'desktop' ? (isMacSafari ? 'desktop-safari' : isFirefox ? 'desktop-firefox' : 'desktop-chrome') : (isFirefox ? 'android-firefox' : isSamsung ? 'android-samsung' : 'android-chrome');
    document.body.appendChild(sheet);
    sheet.querySelector('.ins-x').addEventListener('click', closeSheet);
    sheet.querySelector('.ins-x').focus();
}
function act() {
    if (deferredPrompt) {
        const p = deferredPrompt; deferredPrompt = null;
        p.prompt();
        if (p.userChoice && p.userChoice.then) p.userChoice.then(() => hideBar()).catch(() => {});
        return;
    }
    openSheet(isIOS ? 'ios' : isMobile ? 'android' : 'desktop');
}

function hideBar() { if (bar) { bar.remove(); bar = null; } }
// never over the document reader, the lineage chain or a form
const busy = () => !!document.querySelector('.ft-reader:not([hidden]), .ft-chain:not([hidden]), .ft-stage.fs, dialog[open], form:focus-within') || !!sheet;
function showBar() {
    if (bar || standaloneNow()) return;
    const later = Number(store.get(LATER_KEY) || 0);
    if (later && Date.now() - later < LATER_MS) return;
    if (busy()) { setTimeout(showBar, 3000); return; }
    bar = document.createElement('div');
    bar.className = 'ins-bar'; bar.setAttribute('role', 'region'); bar.dir = document.documentElement.dir || 'rtl';
    bar.innerHTML = `<p>${esc(t('install_bar'))}</p><div class="ins-acts"><button type="button" class="ins-go">${esc(t('install_now'))}</button><button type="button" class="ins-no">${esc(t('install_later'))}</button></div>`;
    document.body.appendChild(bar);
    bar.querySelector('.ins-go').addEventListener('click', () => { hideBar(); act(); });
    // «لاحقاً»: quiet for 14 days; if storage is unavailable the bar simply shows once per visit
    bar.querySelector('.ins-no').addEventListener('click', () => { store.set(LATER_KEY, String(Date.now())); hideBar(); });
}
const standaloneNow = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let barPlanned = false;
function planBar() {
    if (barPlanned) return; barPlanned = true;
    // not in the first 10 seconds of the first visit
    const first = !store.get(SEEN_KEY);
    store.set(SEEN_KEY, '1');
    setTimeout(showBar, first ? 10000 : 2500);
}

/* ---------- wiring ---------- */
// the browser's own prompt is kept for the button when it comes; nothing waits for it
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; hideBar(); closeSheet(); if (button) button.hidden = true; });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
// the pages set <html lang> when their strings arrive
new MutationObserver(() => { label(); if (bar) { hideBar(); showBar(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

function start() {
    makeButton();               // at once, on every browser that is not the installed app
    if (isMobile) planBar();    // the bar is for phones and tablets; never on a computer
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
