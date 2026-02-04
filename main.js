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
const langFab = document.getElementById('langFab');
const htmlRoot = document.documentElement;

const state = {
    filter: 'all',
    searchTerm: '',
    anchorId: null,
    modalOpenId: null,
    scrollTop: 0
};

const epochNames = {
    'epoch-1': { ar: 'اليمن والجذور', en: 'Yemen & Origins' },
    'epoch-2': { ar: 'العهد النبوي', en: 'Prophetic Era' },
    'epoch-3': { ar: 'الأندلس', en: 'Al-Andalus' },
    'epoch-4': { ar: 'الهجرة', en: 'Migration' },
    'epoch-5': { ar: 'ليبيا', en: 'Libya' }
};

function getData() {
    return window.FamilyTreeData || { meta: {}, nodes: [] };
}

function getLang() {
    return (getData().meta?.lang || 'ar').toLowerCase();
}

function applyDirection() {
    const { meta } = getData();
    const dir = meta?.dir || 'rtl';
    htmlRoot.setAttribute('dir', dir);
    htmlRoot.setAttribute('lang', meta?.lang || 'ar');
    document.body.style.direction = dir;
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

function updateSearchPlaceholder() {
    const { i18n, translations } = getData();
    if (searchInput && (i18n?.search_placeholder || translations?.search_placeholder)) {
        searchInput.placeholder = translations?.search_placeholder || i18n.search_placeholder;
    }
}

function renderTimeline() {
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
        return;
    }
    noResults.classList.add('hidden');

    const isRtl = (getData().meta?.dir || 'rtl') === 'rtl';

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
      </div>
      <div class="text-slate-200 text-2xl transform group-hover:scale-110 transition">👁️</div>
    `;

        card.addEventListener('click', () => openModal(item));
        timelineContainer.appendChild(card);
    });
}

function openModal(data) {
    const { translations = {} } = getData();
    modalName.innerText = data.name;
    modalDate.innerText = data.date;
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

function switchTab(tabId) {
    ['tree', 'figures', 'library', 'author'].forEach((id) => {
        document.getElementById(`view-${id}`).classList.add('hidden');
        document.getElementById(`tab-${id}`).classList.remove('active', 'text-white/90');
        document.getElementById(`tab-${id}`).classList.add('text-white/60');
    });

    document.getElementById(`view-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}`).classList.add('active', 'text-white/90');
    document.getElementById(`tab-${tabId}`).classList.remove('text-white/60');
}

function filterEpoch(epoch) {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.remove('bg-slate-800', 'text-white', 'ring-2', 'ring-slate-800');
        btn.classList.add('bg-white');
    });
    state.filter = epoch;
    renderTimeline();
}

function toggleLangMenu() {
    langFab.classList.toggle('active');
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
    captureAnchorState();
    langLoader.classList.add('visible');

    const existing = document.getElementById('family-tree-data');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'family-tree-data';
    script.src = `data/data_${langCode}.js?t=${Date.now()}`;
    script.onload = () => {
        applyDirection();
        applyTranslations();
        updateSearchPlaceholder();
        renderTimeline();
        restoreAnchorState();
        if (state.modalOpenId) {
            const node = getData().nodes.find((item) => item.id === state.modalOpenId);
            if (node) openModal(node);
        }
        langLoader.classList.remove('visible');
    };
    script.onerror = () => {
        console.error('Failed to load language data:', langCode);
        langLoader.classList.remove('visible');
    };
    document.body.appendChild(script);
}

document.addEventListener('click', (event) => {
    if (langFab && !langFab.contains(event.target)) {
        langFab.classList.remove('active');
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
    }
});

modalBackdrop?.addEventListener('click', () => {
    if (!modal.classList.contains('hidden')) closeModal();
});

const closeButton = document.getElementById('modalCloseButton');
if (closeButton) {
    closeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!modal.classList.contains('hidden')) closeModal();
    });
}

searchInput?.addEventListener('input', (event) => {
    state.searchTerm = event.target.value || '';
    renderTimeline();
});

document.querySelectorAll('.lang-option').forEach((button) => {
    button.addEventListener('click', () => {
        const lang = button.getAttribute('data-lang');
        if (lang && lang !== getLang()) {
            loadLanguageScript(lang);
        }
    });
});

applyDirection();
applyTranslations();
updateSearchPlaceholder();
renderTimeline();

window.switchTab = switchTab;
window.filterEpoch = filterEpoch;
window.toggleLangMenu = toggleLangMenu;
window.closeModal = closeModal;
window.openModal = openModal;