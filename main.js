const timelineContainer = document.getElementById('timelineContainer');
const searchInput = document.getElementById('searchInput');
const noResults = document.getElementById('noResults');
const modal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContent');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalHeader = document.getElementById('modalHeader');
const modalName = document.getElementById('modalName');
const modalDate = document.getElementById('modalDate');
const modalStory = document.getElementById('modalStory');
const modalSource = document.getElementById('modalSource');
const modalLogic = document.getElementById('modalLogic');
const modalEpoch = document.getElementById('modalEpoch');
const langLoader = document.getElementById('lang-loader');
const htmlRoot = document.documentElement;
const contactForm = document.getElementById('contactForm');
const contactSuccess = document.getElementById('contactSuccess');
const languageStorageKey = 'preferredLanguage';

const state = {
    filter: 'all',
    searchTerm: '',
    anchorId: null,
    modalOpenId: null,
    scrollTop: 0
};

let renderRafId = null;

const epochNames = {
    'epoch-1': { ar: 'اليمن والجذور', en: 'Yemen & Origins', es: 'Yemen y orígenes' },
    'epoch-2': { ar: 'العهد النبوي', en: 'Prophetic Era', es: 'Época profética' },
    'epoch-3': { ar: 'الأندلس', en: 'Al-Andalus', es: 'Al-Ándalus' },
    'epoch-4': { ar: 'الهجرة', en: 'Migration', es: 'Migración' },
    'epoch-5': { ar: 'ليبيا', en: 'Libya', es: 'Libia' }
};

function getData() {
    return window.FamilyTreeData || { meta: {}, nodes: [] };
}

function getLang() {
    return (getData().meta?.lang || 'ar').toLowerCase();
}

function initializeUI() {
    const data = getData();
    const dir = data.meta?.dir || 'rtl';
    const lang = data.meta?.lang || 'ar';

    htmlRoot.setAttribute('lang', lang);
    htmlRoot.setAttribute('dir', dir);
    document.body.style.direction = dir;

    if (dir === 'rtl') {
        document.body.classList.remove('ltr-mode');
        document.body.classList.add('rtl-mode');
    } else {
        document.body.classList.remove('rtl-mode');
        document.body.classList.add('ltr-mode');
    }

    const flexContainers = document.querySelectorAll('.flex-row-responsive');
    flexContainers.forEach((container) => {
        if (dir === 'rtl') {
            container.style.flexDirection = 'row-reverse';
        } else {
            container.style.flexDirection = 'row';
        }
    });

    updateLanguageSelect(lang);
}

function getEpochName(type) {
    const lang = getLang();
    return epochNames[type]?.[lang] || epochNames[type]?.ar || type;
}

function applyTranslations() {
    const { translations = {} } = getData();

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const value = translations[key];
        if (typeof value === 'string') {
            el.innerHTML = value;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (!key) return;
        const value = translations[key];
        if (typeof value === 'string') {
            el.setAttribute('placeholder', value);
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        if (!key) return;
        const value = translations[key];
        if (typeof value === 'string') {
            el.setAttribute('title', value);
        }
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
        const key = el.getAttribute('data-i18n-alt');
        if (!key) return;
        const value = translations[key];
        if (typeof value === 'string') {
            el.setAttribute('alt', value);
        }
    });
}

function renderPoemSections() {
    const { translations = {} } = getData();
    document.querySelectorAll('[data-i18n-lines]').forEach((container) => {
        const key = container.getAttribute('data-i18n-lines');
        if (!key) return;
        const value = translations[key];
        if (!value) {
            container.innerHTML = '';
            return;
        }

        const lines = Array.isArray(value) ? value : [value];
        container.innerHTML = '';

        lines.forEach((line) => {
            const lineEl = document.createElement('p');
            lineEl.className = 'poem-line';
            if (typeof line === 'string' && line.includes('...')) {
                const parts = line.split('...');
                const first = parts.shift()?.trim() || '';
                const second = parts.join('...').trim();
                lineEl.innerHTML = `
                    <span class="verse-part">${first}</span>
                    <span class="verse-divider">…</span>
                    <span class="verse-part">${second}</span>
                `;
            } else {
                lineEl.textContent = line;
            }
            container.appendChild(lineEl);
        });
    });
}

function updateSearchPlaceholder() {
    const { i18n, translations } = getData();
    if (searchInput && (i18n?.search_placeholder || translations?.search_placeholder)) {
        searchInput.placeholder = translations?.search_placeholder || i18n.search_placeholder;
    }
}

function renderTimeline() {
    return new Promise((resolve) => {
        if (renderRafId) cancelAnimationFrame(renderRafId);

        renderRafId = requestAnimationFrame(() => {
            const { nodes } = getData();
            timelineContainer.innerHTML = '';

            const filtered = nodes.filter((item) => {
                const matchFilter = state.filter === 'all' || item.type === state.filter;
                const matchSearch = state.searchTerm
                    ? item.name.toLowerCase().includes(state.searchTerm.toLowerCase())
                    : true;
                return matchFilter && matchSearch;
            });

            if (filtered.length === 0) {
                noResults.classList.remove('hidden');
                resolve();
                return;
            }
            noResults.classList.add('hidden');

            const isRtl = (getData().meta?.dir || 'rtl') === 'rtl';
            const fragment = document.createDocumentFragment();

            filtered.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = `bg-white rounded-lg p-5 shadow-sm hover:shadow-md border-r-4 ${item.type}-border flex justify-between items-center cursor-pointer transition-all animate-fade-up`;
                card.style.animationDelay = `${index * 0.05}s`;
                card.dataset.nodeId = item.id;

                let dateColor = 'text-slate-400';
                if (item.type === 'epoch-1') dateColor = 'epoch-1-text';
                else if (item.type === 'epoch-2') dateColor = 'epoch-2-text';
                else if (item.type === 'epoch-3') dateColor = 'epoch-3-text';
                else if (item.type === 'epoch-4') dateColor = 'epoch-4-text';
                else if (item.type === 'epoch-5') dateColor = 'epoch-5-text';

                const badgeText = item.badge || '';
                let badgeClass = 'badge-historical';
                if (
                    badgeText.includes('موثق') ||
                    badgeText.includes('صحابي') ||
                    badgeText.includes('وقف') ||
                    badgeText.toLowerCase().includes('documented')
                ) {
                    badgeClass = 'badge-verified';
                }

                const dotPosition = isRtl
                    ? 'absolute -right-[43px]'
                    : 'absolute -left-[43px]';
                const contentPadding = isRtl ? 'md:pr-4' : 'md:pl-4';

                const docButton = item.doc_img
                    ? `
            <button onclick="event.stopPropagation(); showDocumentModal('${item.doc_img}', '${item.doc_title}', '${item.doc_desc_key}')"
                class="mt-3 w-full py-1 px-3 bg-[#d4af37]/10 border border-[#d4af37] text-[#8d6e63] text-xs font-bold rounded hover:bg-[#d4af37] hover:text-white transition flex items-center justify-center gap-2">
                <span>📜</span> <span>${getData().translations?.btn_view_doc || 'View Document 1002 AH'}</span>
            </button>
          `
                    : '';

                card.innerHTML = `
          <div class="md:w-full ${contentPadding} relative">
            <div class="hidden md:block ${dotPosition} top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow bg-current ${dateColor}"></div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${item.name.split('.')[0]}</span>
            </div>
            <h3 class="font-bold text-lg text-slate-800">${item.name.split('. ')[1] || item.name}</h3>
            <div class="flex flex-wrap gap-2 mt-2">
              <span class="text-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 ${dateColor}">📅 ${item.date}</span>
              <span class="text-[10px] font-bold px-2 py-1 rounded ${badgeClass}">${badgeText}</span>
            </div>
            ${docButton}
          </div>
          <div class="text-slate-200 text-2xl transform group-hover:scale-110 transition">👁️</div>
        `;

                card.addEventListener('click', () => openModal(item));
                fragment.appendChild(card);
            });

            timelineContainer.appendChild(fragment);
            resolve();
        });
    });
}

function openModal(data) {
    const { translations = {} } = getData();
    const modalDocBody = document.getElementById('modalDocBody');
    const modalDefaultBody = document.getElementById('modalDefaultBody');
    const modalDocImage = document.getElementById('modalDocImage');
    const modalDocTranscription = document.getElementById('modalDocTranscription');
    const modalDateRow = document.getElementById('modalDateRow');
    if (modalDefaultBody) modalDefaultBody.classList.remove('hidden');
    if (modalDocBody) modalDocBody.classList.add('hidden');
    if (modalDocImage) modalDocImage.src = '';
    if (modalDocTranscription) modalDocTranscription.innerText = '';
    if (modalDateRow) modalDateRow.classList.remove('hidden');

    modalName.innerText = data.name;
    modalDate.innerHTML = data.date;
    modalStory.innerText =
        data.story === '--' ? translations.modal_story_fallback || 'حلقة وصل في سلسلة النسب المتواترة.' : data.story;
    modalSource.innerText = data.src;
    modalLogic.innerText =
        data.logic === '--' ? translations.modal_logic_fallback || 'تسلسل طبيعي للأجيال.' : data.logic;
    modalEpoch.innerText = getEpochName(data.type);
    state.modalOpenId = data.id;

    modalHeader.className =
        'p-6 text-white rounded-t-2xl flex justify-between items-start relative overflow-hidden transition-colors duration-300';
    if (data.type === 'epoch-1') modalHeader.classList.add('bg-[#8D6E63]');
    else if (data.type === 'epoch-2') modalHeader.classList.add('bg-[#4CAF50]');
    else if (data.type === 'epoch-3') modalHeader.classList.add('bg-[#C62828]');
    else if (data.type === 'epoch-4') modalHeader.classList.add('bg-[#7E57C2]');
    else if (data.type === 'epoch-5') modalHeader.classList.add('bg-[#1976D2]');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeModal() {
    modalBackdrop.classList.add('opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function showDocumentModal(img, titleKey, transcriptionKey) {
    const { translations = {} } = getData();
    const modalDocBody = document.getElementById('modalDocBody');
    const modalDefaultBody = document.getElementById('modalDefaultBody');
    const modalDocImage = document.getElementById('modalDocImage');
    const modalDocTranscription = document.getElementById('modalDocTranscription');
    const modalDateRow = document.getElementById('modalDateRow');

    if (!modalDocBody || !modalDefaultBody || !modalDocImage || !modalDocTranscription) {
        return;
    }

    modalDocImage.src = img || '';
    const resolvedTitle = translations[titleKey] || titleKey || '';
    const resolvedTranscription = translations[transcriptionKey] || transcriptionKey || '';
    modalName.innerText = resolvedTitle;
    if (modalDateRow) modalDateRow.classList.add('hidden');
    modalStory.innerText = '';
    modalSource.innerText = '';
    modalLogic.innerText = '';
    modalDocTranscription.innerText = resolvedTranscription;

    modalHeader.className =
        'p-6 text-white rounded-t-2xl flex justify-between items-start relative overflow-hidden transition-colors duration-300';
    modalHeader.classList.add('bg-[#d4af37]');
    modalDefaultBody.classList.add('hidden');
    modalDocBody.classList.remove('hidden');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function openDocModal(img, title, desc) {
    const docModal = document.getElementById('docModal');
    const docBackdrop = document.getElementById('docBackdrop');
    const docContent = document.getElementById('docContent');
    const docTitle = document.getElementById('docTitle');
    const docImage = document.getElementById('docImage');
    const docDesc = document.getElementById('docDesc');

    if (!docModal || !docBackdrop || !docContent || !docTitle || !docImage || !docDesc) return;

    docTitle.innerText = title || '';
    docImage.src = img || '';
    docDesc.innerText = desc || '';

    docModal.classList.remove('hidden');
    setTimeout(() => {
        docBackdrop.classList.remove('opacity-0');
        docContent.classList.remove('scale-95', 'opacity-0');
        docContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeDocModal() {
    const docModal = document.getElementById('docModal');
    const docBackdrop = document.getElementById('docBackdrop');
    const docContent = document.getElementById('docContent');

    if (!docModal || !docBackdrop || !docContent) return;

    docBackdrop.classList.add('opacity-0');
    docContent.classList.remove('scale-100', 'opacity-100');
    docContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => docModal.classList.add('hidden'), 300);
}

function switchTab(tabId) {
    const tabs = ['tree', 'figures', 'library', 'poem', 'author'];
    const currentTab = tabs.find(id => !document.getElementById(`view-${id}`).classList.contains('hidden'));

    if (currentTab === tabId) return;

    tabs.forEach((id) => {
        const view = document.getElementById(`view-${id}`);
        const btn = document.getElementById(`tab-${id}`);

        if (id === tabId) {
            // Activate new tab
            view.classList.remove('hidden');
            view.classList.add('animate-fade-up');
            btn.classList.add('active', 'text-white/90');
            btn.classList.remove('text-white/60');
        } else {
            // Deactivate others
            view.classList.add('hidden');
            view.classList.remove('animate-fade-up');
            btn.classList.remove('active', 'text-white/90');
            btn.classList.add('text-white/60');
        }
    });

    // Scroll to top if needed
    if (window.scrollY > 300) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function filterTimeline(filterKey, btn) {
    const epochMap = {
        'all': 'all',
        'yemen': 'epoch-1',
        'prophet': 'epoch-2',
        'andalus': 'epoch-3',
        'migration': 'epoch-4',
        'libya': 'epoch-5'
    };

    state.filter = epochMap[filterKey] || filterKey;

    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.classList.remove('active', 'bg-amber-700', 'text-white', 'shadow-lg', 'shadow-amber-700/20');
        button.classList.add('bg-slate-800/50', 'text-slate-400', 'hover:bg-slate-700', 'border', 'border-slate-700/50');
    });

    if (btn) {
        btn.classList.remove('bg-slate-800/50', 'text-slate-400', 'hover:bg-slate-700', 'border', 'border-slate-700/50');
        btn.classList.add('active', 'bg-amber-700', 'text-white', 'shadow-lg', 'shadow-amber-700/20');
    }

    renderTimeline().then(() => {
        setupIntersectionObserver();
    });
}

function setupIntersectionObserver() {
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('opacity-100', 'translate-y-0');
                entry.target.classList.remove('opacity-0', 'translate-y-4');
            }
        });
    }, options);

    document.querySelectorAll('.animate-fade-up').forEach(el => {
        el.classList.add('opacity-0', 'translate-y-4', 'transition-all', 'duration-700', 'ease-out');
        observer.observe(el);
    });
}

async function changeLanguage(langCode) {
    if (langCode === getLang()) return;

    captureAnchorState();
    langLoader.classList.add('visible');
    try {
        await loadLanguageScript(langCode);
        await initializeWebsite(langCode);
    } catch (error) {
        console.error('Language switch failed:', error);
    } finally {
        langLoader.classList.remove('visible');
    }
}

function updateLanguageSelect(lang) {
    const select = document.getElementById('lang-select');
    if (select) {
        select.value = lang;
    }
}

function captureAnchorState() {
    state.scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const cards = Array.from(document.querySelectorAll('[data-node-id]'));
    if (!cards.length) return;
    const viewportCenter = window.innerHeight / 2;
    let closest = null;
    let closestDistance = Infinity;
    cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < closestDistance) {
            closestDistance = distance;
            closest = card;
        }
    });
    state.anchorId = closest?.dataset?.nodeId || null;
}

function restoreAnchorState() {
    if (state.anchorId) {
        const anchor = document.querySelector(`[data-node-id="${state.anchorId}"]`);
        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            const targetScroll = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
            window.scrollTo({ top: targetScroll, behavior: 'auto' });
            return;
        }
    }
    window.scrollTo({ top: state.scrollTop, behavior: 'auto' });
}

function loadLanguageScript(langCode) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById('family-tree-data');
        if (existing) existing.remove();

        const script = document.createElement('script');
        script.id = 'family-tree-data';
        script.src = `data/data_${langCode}.js?t=${Date.now()}`;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function initializeWebsite(langCode) {
    try {
        localStorage.setItem(languageStorageKey, langCode);
    } catch (error) {
        console.warn('Unable to save language preference', error);
    }

    initializeUI();
    applyTranslations();
    renderPoemSections();
    updateSearchPlaceholder();
    await renderTimeline();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            restoreAnchorState();
            if (state.modalOpenId) {
                const node = getData().nodes.find((item) => item.id === state.modalOpenId);
                if (node) openModal(node);
            }
        });
    });
}

function resolveInitialLanguage() {
    let savedLanguage = null;
    try {
        savedLanguage = localStorage.getItem(languageStorageKey);
    } catch (error) {
        console.warn('Unable to read language preference', error);
    }

    if (savedLanguage) {
        return savedLanguage;
    }

    const browserLanguage = (navigator.language || '').toLowerCase();
    if (browserLanguage.startsWith('pl')) return 'pl';
    if (browserLanguage.startsWith('tr')) return 'tr';
    if (browserLanguage.startsWith('es')) return 'es';
    if (browserLanguage.startsWith('en')) return 'en';
    return 'ar';
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (!modal.classList.contains('hidden')) {
            closeModal();
        }
        const docModal = document.getElementById('docModal');
        if (docModal && !docModal.classList.contains('hidden')) {
            closeDocModal();
        }
    }
});

modalBackdrop?.addEventListener('click', () => {
    if (!modal.classList.contains('hidden')) closeModal();
});

const docBackdrop = document.getElementById('docBackdrop');
docBackdrop?.addEventListener('click', () => {
    const docModal = document.getElementById('docModal');
    if (docModal && !docModal.classList.contains('hidden')) closeDocModal();
});

const closeButton = document.getElementById('modalCloseButton');
if (closeButton) {
    closeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!modal.classList.contains('hidden')) closeModal();
    });
}

const docCloseButton = document.getElementById('docCloseButton');
if (docCloseButton) {
    docCloseButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeDocModal();
    });
}

searchInput?.addEventListener('input', (event) => {
    state.searchTerm = event.target.value || '';
    renderTimeline();
});

if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (contactSuccess) {
            contactSuccess.classList.add('hidden');
        }

        try {
            const response = await fetch(contactForm.action, {
                method: 'POST',
                headers: {
                    Accept: 'application/json'
                },
                body: new FormData(contactForm)
            });

            if (response.ok) {
                contactForm.reset();
                contactSuccess?.classList.remove('hidden');
            } else {
                console.error('Form submission failed', response.statusText);
            }
        } catch (error) {
            console.error('Form submission error', error);
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Detect Language
    let currentLang = resolveInitialLanguage();
    if (!['ar', 'en', 'tr', 'pl', 'es'].includes(currentLang)) currentLang = 'ar';

    // Set the dropdown value to match current language
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = currentLang;

    // 2. Show Loading Spinner
    langLoader.classList.add('visible');

    try {
        // 3. Load ONLY the needed data file
        await loadLanguageScript(currentLang);

        // 4. Initialize App
        await initializeWebsite(currentLang);
    } catch (error) {
        console.error("Initialization failed", error);
    } finally {
        // 5. Hide Spinner
        langLoader.classList.remove('visible');
    }
});

window.switchTab = switchTab;
window.filterTimeline = filterTimeline;
window.changeLanguage = changeLanguage;
window.closeModal = closeModal;
window.openModal = openModal;
window.openDocModal = openDocModal;
window.showDocumentModal = showDocumentModal;
window.closeDocModal = closeDocModal;

function loadYoutubeVideo(wrapper) {
    const container = wrapper.querySelector('.youtube-container');
    if (!container) return;

    if (container.querySelector('iframe')) return;

    const iframe = document.createElement('iframe');
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.src = "https://www.youtube.com/embed/videoseries?list=PLx2j-W6hDiG6a9AAPBQgCRjG_t1Ge--dl&autoplay=1";
    iframe.title = "YouTube video player";
    iframe.frameBorder = "0";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);
    container.classList.remove('hidden');
}
window.loadYoutubeVideo = loadYoutubeVideo;
