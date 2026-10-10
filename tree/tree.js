/* Evidence-based family tree for the dedicated page /tree/ (d3 v7.9.0, vendored).
   Data: data/tree.json (persons) and data/docs.json (one record per document on a scanned page).
   UI strings: the tree_* keys in data/data_<lang>.js. Person names and document text stay in Arabic. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const host = $('ftree');
if (!host || !window.d3) return;
const d3 = window.d3;
// this file lives in /tree/, the data and the scans at the site root
const SITE_ROOT = new URL('../', document.currentScript.src).href;
const asset = path => /^(?:[a-z]+:|\/)/i.test(path) ? path : SITE_ROOT + path;

/* ---------- owner configuration ---------- */
const CONTRIBUTE_URL = '';   // WhatsApp or e-mail link for contributions; the send link stays hidden while this is empty
const FORM_ENDPOINT = '';    // form service endpoint (part B); unused while empty

/* ---------- presentation config (not data) ---------- */
const CONFIG = {
  spine: ['ali', 'umar', 'abdallah'],          // bottom → top on the trunk; the last one is the medallion
  fanRoot: 'abdallah',
  plaqueAli: 'علي الجداوي الأنصاري',            // the base of the tree, as the tribe's documents name the lineage
  // the elders named in the book's footnote for each testimony page (the data carries the footnote as one quote)
  testimonyNames: { 'ansar-p091': ['الحاج محمد القاضي الرشيد الأنصاري', 'الحاج أبو بكر البركولي الأنصاري', 'الحاج المجذوب الأنصاري', 'الحاج النعماني الأنصاري'] },
  posterAli: 'الخزرجي الأنصاري',                 // extra words on the 1987 root plaque, not found in any document
  fanDeg: 250,
  openDepth: 2,                                // generations shown below an opened name; the rest fold into a «+N» chip
  reading1987: { boxes: [{ id: 'r87_fadl', label: 'فضل' }, { id: 'r87_hm', label: 'الحاج محمد' }] },
  verse: ['رب هب لي من لدنك', 'ذرية طيبة', 'إنك سميع الدعاء'],
  // deep links from the home page's branch cards: /tree/#/b/<key>
  branches: {
    muhammad: { root: 'm3' },
    belqasim: { root: 'b3' },
    qasim: { root: 'q3' },
    uthamna: { roots: ['a_aqd_father_uthman', 'ath_m_father'] },
    abdulwahid: { root: 'yahmad' }
  }
};
// places along the trunk, measured down from the medallion's centre; set by setSlots() for the current crown
let SLOT = { med: 0, hm: 150, fd: 238, umar: 336, tulip: 462, ali: 604 };
const TRUNK_SHARE = 0.375;   // the trunk, from the plaque's top to the medallion's bottom, is 35–40% of the tree's height
const MED_R = 74;

const t87 = $('ft-t1987');

/* ---------- strings ---------- */
const strings = () => (window.FamilyTreeData && window.FamilyTreeData.translations) || {};
const hasStrings = () => typeof strings().tree_h1 === 'string';
const t = (key, vars) => {
  const s = strings()[key];
  const out = typeof s === 'string' ? s : key;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : out;
};

// the status of a person describes the evidence for the link to the father; it is shown as a neutral fact
const stKey = s => s === 'ثابت' ? 'ok' : String(s || '').startsWith('محتمل') ? 'maybe' : 'trad';
// the source of a name, in words: documents, an indication, the civil registry, the author's tree, or the elders' account
const srcKey = s => { const k = stKey(s); return k !== 'trad' ? k : String(s || '').startsWith('السجل المدني') ? 'civil' : String(s || '').startsWith('من شجرة المؤلف') ? 'author' : 'trad'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[\[\]()«»…؟?،,.\/:\-—]/g, ' ').replace(/\s+/g, ' ').trim();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
};

function shortNameOf(name) {
  let s = String(name || '').trim().replace(/^\([^)]*\)\s*/, '');
  const cuts = [' بن ', ' بنت ', ' ابن ', ' ابنة ', ' (', ' / ', ' يشهر ', ' [', ' —'];
  let end = s.length;
  for (const c of cuts) { const i = s.indexOf(c); if (i > 0 && i < end) end = i; }
  return s.slice(0, end).trim();
}
function splitLines(s) {
  const raw = s.split(/\s+/), tok = [];
  for (let i = 0; i < raw.length; i++) {
    if (/^(عبد|أبو|أبي|ابو|بو|أم)$/.test(raw[i]) && raw[i + 1]) { tok.push(raw[i] + ' ' + raw[i + 1]); i++; } else tok.push(raw[i]);
  }
  if (tok.length < 2) return [s];
  let best = null;
  for (let k = 1; k < tok.length; k++) {
    const a = tok.slice(0, k).join(' '), b = tok.slice(k).join(' ');
    const m = Math.max(a.length, b.length);
    if (!best || m < best.m) best = { m, l: [a, b] };
  }
  return best.l;
}
// small deterministic hash, so leaves keep their place and angle between visits
function seed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }

function init(persons, docs) {
/* ---------- data ---------- */
const byId = new Map(persons.map(p => [p.id, p]));
const kids = new Map(persons.map(p => [p.id, []]));
persons.forEach(p => { if (p.father_id && byId.has(p.father_id) && p.father_id !== p.id) kids.get(p.father_id).push(p.id); });
const total = new Map();   // named descendants, folded or not; placeholders are not counted anywhere
(function c(id) { let n = 0; for (const k of kids.get(id)) n += (byId.get(k).placeholder ? 0 : 1) + c(k); total.set(id, n); return n; })(persons.find(p => !p.father_id || !byId.has(p.father_id)).id);
persons.forEach(p => { if (!total.has(p.id)) total.set(p.id, 0); });
// a run of placeholders between two named persons: «قيد البحث — تقديراً N أجيال»
const chainInfo = new Map();   // placeholder id -> { start, list, heads }
persons.forEach(p => {
  if (!p.placeholder || (byId.get(p.father_id) || {}).placeholder) return;
  const list = [p.id]; let c = p;
  while (kids.get(c.id).length === 1 && byId.get(kids.get(c.id)[0]).placeholder) { c = byId.get(kids.get(c.id)[0]); list.push(c.id); }
  const info = { start: p.id, list, heads: kids.get(c.id), estimate: p.estimate || {} };
  list.forEach(id => chainInfo.set(id, info));
});
const chainLabel = info => t('tree_unknown_chain', { n: info.list.length }) + (info.estimate.min != null ? ' ' + t('tree_unknown_range', { min: info.estimate.min, max: info.estimate.max }) : '');

// a hidden person keeps the node, so descendants keep their chain, but not the name
const nameOf = p => p.placeholder ? t('tree_unknown_name') : p.hidden ? t('tree_hidden_name') : p.name_as_written;
const shortName = p => p.placeholder ? '؟' : p.hidden ? t('tree_hidden_name') : (p.short_name || shortNameOf(p.name_as_written || p.id));
const searchable = p => !p.hidden && !p.placeholder;

// docs.json: image_id is the evidence file name without ".webp"; a page can hold several documents
const imageId = src => String(src || '').split('/').pop().replace(/\.webp$/, '');
const docsByImage = new Map(), docsByPerson = new Map();
docs.slice().sort((a, b) => (a.doc_index || 0) - (b.doc_index || 0)).forEach(d => {
  if (!docsByImage.has(d.image_id)) docsByImage.set(d.image_id, []);
  docsByImage.get(d.image_id).push(d);
  new Set((d.persons || []).map(x => x.tree_id).filter(Boolean)).forEach(id => {
    if (!docsByPerson.has(id)) docsByPerson.set(id, []);
    docsByPerson.get(id).push(d);
  });
});
// every document that names a person: the evidence items of tree.json, then other docs.json records that mention the id
const docCache = new Map();
function docsOf(id) {
  if (docCache.has(id)) return docCache.get(id);
  const p = byId.get(id), items = [], bare = [], seen = new Set();
  if (p && !p.living) {
    for (const e of p.evidence || []) {
      if (!e.image) { bare.push(e); continue; }
      const img = imageId(e.image), recs = docsByImage.get(img) || [];
      if (seen.has(img)) continue; seen.add(img);
      const mine = recs.filter(d => (d.persons || []).some(x => x.tree_id === id));
      const use = mine.length ? mine : recs;
      // the elders' testimony recorded in the book: shown in its own section, opened in the reader, never counted as a document
      if (e.kind === 'testimony') items.push({ img, src: e.image, e, d: null, testimony: true });
      else if (!use.length) items.push({ img, src: e.image, e, d: null });
      else use.forEach(d => items.push({ img, src: e.image, e, d }));
    }
    for (const d of docsByPerson.get(id) || []) {
      if (seen.has(d.image_id) && !items.some(it => it.d === d)) continue;
      if (items.some(it => it.d === d)) continue;
      items.push({ img: d.image_id, src: `assets/evidence/${d.image_id}.webp`, e: null, d });
    }
  }
  const thumbs = [], testimony = [];
  items.forEach((it, i) => { if (it.testimony) testimony.push({ img: it.img, i, it }); else if (!thumbs.some(th => th.img === it.img)) thumbs.push({ img: it.img, i, it }); });
  const out = { items, bare, thumbs, testimony, count: thumbs.length + bare.length };
  docCache.set(id, out); return out;
}
// «📄 N وثائق» / «قرينة من الوثائق» / «رواية الأسرة»: the evidence for the link to the father, as a neutral fact
function docsLabel(n) { return n <= 1 ? t('tree_docs_1') : n === 2 ? t('tree_docs_2') : n <= 10 ? t('tree_docs_few', { n }) : t('tree_docs_many', { n }); }
// The labels of a link, documents first: «📄 N وثائق», then «🏛 السجل المدني وحفظ القبيلة» when the person is also in the
// civil registry (status, or the also_civil flag). The other sources are one label each, as before.
function linkLabels(p) {
  const k = srcKey(p.status), n = docsOf(p.id).count;
  if (k === 'ok') return [docsLabel(n), ...(p.also_civil ? [t('tree_link_civil')] : [])];
  if (k === 'civil') return [...(n ? [docsLabel(n)] : []), t('tree_link_civil')];
  return [t('tree_link_' + k)];
}
const linkLabel = p => linkLabels(p).join(' · ');
// for the chain's counts: a generation with documents is counted as documented, even if it is also in the civil registry
const countKey = p => { const k = srcKey(p.status); return k === 'civil' && docsOf(p.id).count ? 'ok' : k; };

const mqMobile = window.matchMedia('(max-width:720px)');
const isMobile = () => mqMobile.matches;

/* ---------- what is unfolded ---------- */
const ROOT = CONFIG.fanRoot;
const open = new Set();   // names whose children are drawn
function openBelow(id, depth = CONFIG.openDepth) { if (depth <= 0 || !kids.has(id)) return; open.add(id); for (const c of kids.get(id)) openBelow(c, depth - 1); }
function openPathTo(id) { let p = byId.get(id), guard = 0; while (p && p.father_id && guard++ < 200) { open.add(p.father_id); p = byId.get(p.father_id); } }
function resetOpen() { open.clear(); openBelow(ROOT); }
// a placeholder chain is always drawn through to the named person at its end; on a phone a chain longer than
// four circles shows three, then «⋯ N», then that person, until the «⋯» is tapped
const unfoldedChains = new Set();
const compactChain = info => isMobile() && info.list.length > 4 && !unfoldedChains.has(info.start);
const vkids = id => { const info = chainInfo.get(id); if (info) return compactChain(info) && info.list.indexOf(id) === 2 ? info.heads : kids.get(id); return open.has(id) ? kids.get(id) : []; };
resetOpen();

/* ---------- fan layout: generations above the medallion ---------- */
let fan = new Map();     // id -> {d, a, r, x, y, nr, W}
let descN = new Map(), BASE = 300, fanBox = { x0: 0, x1: 0, y0: 0, y1: 0 };
// phones get larger fruits, so a name can stay inside its fruit when a branch is zoomed
const nodeR = d => isMobile() ? (d <= 1 ? 46 : d === 2 ? 42 : 36) : (d <= 1 ? 42 : d === 2 ? 38 : 30);
const need = d => 2 * nodeR(d) + 12;
const GAP = 78;
const A = CONFIG.fanDeg * Math.PI / 180;
const ringR = (base, d) => d <= 0 ? 0 : d === 1 ? Math.max(210, base * 0.36) : d === 2 ? Math.max(330, base * 0.66) : Math.max(330 + (d - 2) * GAP, base + (d - 3) * GAP);
const PH_R = 13;           // a placeholder circle
const PILL_FS = 12, PILL_MIN_PX = 10;   // the chain pill's font size, and the on-screen size below which the pills are hidden
let vparent = new Map();   // the name each drawn name hangs from (a folded chain skips its hidden circles)
function layout() {
  // placeholders do not take a generation ring of their own: they sit in a short row between two named generations
  const measureAll = base => {
    const W = new Map(), G = new Map();
    (function w(id, nd, par) {
      const ph = !!byId.get(id).placeholder, nr = !par ? MED_R : ph ? PH_R : nodeR(nd);
      const info = ph ? chainInfo.get(id) : null, step = info ? Math.max(2 * PH_R + 8, 210 / (compactChain(info) ? 3 : info.list.length)) : 0;
      const r = !par ? 0 : ph ? par.r + (par.ph ? step : par.nr + PH_R + 12) : Math.max(ringR(base, nd), par.r + par.nr + nr + (par.ph ? 10 : 14));
      const me = { r, nr, ph, nd };
      let s = 0; for (const c of vkids(id)) s += w(c, byId.get(c).placeholder ? nd : nd + 1, me);
      const v = Math.max(par ? (2 * nr + (ph ? 8 : 12)) / r : 0, s);
      W.set(id, v); G.set(id, me); return v;
    })(ROOT, 0, null);
    return { W, G };
  };
  let lo = 300, hi = 60000;
  if (measureAll(lo).W.get(ROOT) <= A) hi = lo;
  else for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (measureAll(m).W.get(ROOT) <= A) hi = m; else lo = m; }
  BASE = hi; const { W: Wf, G } = measureAll(BASE);
  fan = new Map(); descN = new Map(); vparent = new Map();
  (function place(id, a0, pid) {
    const w = Wf.get(id), a = a0 - w / 2, g = G.get(id);
    fan.set(id, { d: g.nd, a, r: g.r, W: w, nr: g.nr, x: pid == null ? 0 : g.r * Math.sin(a), y: pid == null ? 0 : -g.r * Math.cos(a) });
    if (pid != null) vparent.set(id, pid);
    const ks = vkids(id).filter(c => Wf.has(c));
    let s = ks.reduce((sum, c) => sum + Wf.get(c), 0), cur = a0 - (w - s) / 2, n = 1;
    for (const c of ks) { n += place(c, cur, id); cur -= Wf.get(c); }
    descN.set(id, n); return n;
  })(ROOT, Math.min(A, Wf.get(ROOT)) / 2, null);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of fan.values()) { x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); }
  fanBox = { x0, x1, y0, y1 };
  setSlots();
}
// عمر, the verse plaque and علي's plaque are spaced along a trunk whose length follows the crown;
// the two 1987 boxes need room between the medallion and عمر, so the trunk is longer while they are shown
function setSlots() {
  const show87 = !!(t87 && t87.checked), crown = -fanBox.y0 + 34, fixed = MED_R + 84 + 62;   // above the trunk, and the plaque with its line below it
  const S = Math.max(show87 ? 488 : 302, TRUNK_SHARE / (1 - TRUNK_SHARE) * (crown + fixed));
  const at = f => Math.round(MED_R + f * S);
  SLOT = show87 ? { med: 0, hm: at(0.156), fd: at(0.336), umar: at(0.537), tulip: at(0.795), ali: MED_R + S + 42 }
    : { med: 0, hm: at(0.1), fd: at(0.16), umar: at(0.2), tulip: at(0.57), ali: MED_R + S + 42 };
}

const inFan = new Set(); (function walk(id) { inFan.add(id); kids.get(id).forEach(walk); })(ROOT);
const ali = byId.get(CONFIG.spine[0]), umar = byId.get(CONFIG.spine[1]), abd = byId.get(CONFIG.spine[2]);

/* ---------- dom ---------- */
const stage = $('ft-stage'), treeEl = $('ft-tree'), world = $('ft-world'), panel = $('ft-panel');
const pName = $('ft-pName'), pEyebrow = $('ft-pEyebrow'), pLine = $('ft-pLine'), pBadges = $('ft-pBadges'), pBody = $('ft-pBody');
const q = $('ft-q'), results = $('ft-results');
const legendEl = $('ft-legend'), tip = $('ft-tip');
legendEl.open = window.innerWidth >= 1024;   // a chip on small screens, open on desktop (the tree is then fitted beside it)

/* ---------- svg helpers ---------- */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const pt = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
const f1 = v => Math.round(v * 10) / 10;
const mctx = document.createElement('canvas').getContext('2d');
const cssVar = n => getComputedStyle(host).getPropertyValue(n).trim();
const mcache = new Map(); let mfont = '';
const measure = (text, font) => { const key = font + '|' + text; let w = mcache.get(key); if (w === undefined) { if (mfont !== font) { mctx.font = font; mfont = font; } w = mctx.measureText(text).width; mcache.set(key, w); } return w; };
const edgeW = n => Math.min(19, 1.5 + 1.55 * Math.sqrt(Math.max(0, n)));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// rebuilt by draw()
let L = {}, nodeEls = new Map(), spineEls = new Map(), keyLabels = [], pillItems = [], solidBoxes = [], chipBoxesNow = [], trunkHalf = () => 100;
let selected = null, currentK = 1, grown = false;

// the branch from a father to a child: [start, control, control, end]
function edgePts(pid, cid) {
  const p = fan.get(pid), c = fan.get(cid);
  if (pid === ROOT) {
    // the limbs leave the medallion low on its flanks and swing wide before they rise, like an olive crown
    const lim = A / 2 - 0.05, sa = Math.max(-1.75, Math.min(1.75, c.a * 1.3 + Math.sign(c.a) * 0.18)), wide = x => Math.max(-lim, Math.min(lim, x));
    return [pt(MED_R - 6, sa), pt(Math.max(MED_R + 30, c.r * 0.42), Math.max(-1.75, Math.min(1.75, c.a * 1.45 + Math.sign(c.a) * 0.12))), pt(c.r * 0.8, wide(c.a * 1.12)), [c.x, c.y]];
  }
  const rm = (p.r + c.r) / 2;
  return [[p.x, p.y], pt(rm, p.a), pt(rm, c.a), [c.x, c.y]];
}
const pathD = P => `M${f1(P[0][0])},${f1(P[0][1])} C${f1(P[1][0])},${f1(P[1][1])} ${f1(P[2][0])},${f1(P[2][1])} ${f1(P[3][0])},${f1(P[3][1])}`;
function bez(P, u) {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  const x = a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], y = a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1];
  const dx = 3 * v * v * (P[1][0] - P[0][0]) + 6 * v * u * (P[2][0] - P[1][0]) + 3 * u * u * (P[3][0] - P[2][0]);
  const dy = 3 * v * v * (P[1][1] - P[0][1]) + 6 * v * u * (P[2][1] - P[1][1]) + 3 * u * u * (P[3][1] - P[2][1]);
  return [x, y, Math.atan2(dy, dx)];
}
// one ink and one solid line for every branch: how the link to the father is known is written in the person's card
function drawEdge(d, status, w, parent) {
  return el('path', { class: `edge ${stKey(status)}`, d, 'stroke-width': f1(w), pathLength: 1 }, parent);
}
// a name is a fruit on the branch: a soft disc with a gold hairline rim and a tiny stem towards the father
function makeNode(id, x, y, r, parent, toward) {
  const p = byId.get(id);
  const g = el('g', { class: 'node' + (p.placeholder ? ' ph' : ''), transform: `translate(${f1(x)},${f1(y)})`, tabindex: '0', role: 'button', 'aria-label': `${nameOf(p)} — ${linkLabel(p)}`, 'data-id': id }, parent);
  if (toward != null) el('path', { class: 'stem', d: `M${f1(Math.cos(toward) * (r - 1))},${f1(Math.sin(toward) * (r - 1))} L${f1(Math.cos(toward) * (r + 7))},${f1(Math.sin(toward) * (r + 7))}` }, g);
  el('circle', { class: 'c', r }, g);
  const tx = el('text', { class: 'nl' }, g);
  nodeEls.set(id, { g, t: tx, r, x, y, label: shortName(p) });
  return g;
}
function leafPath(x, y, ang, len, wid) {
  const c = Math.cos(ang), s = Math.sin(ang), P = (u, v) => `${f1(x + u * c - v * s)},${f1(y + u * s + v * c)}`;
  return { body: `M${P(0, 0)} Q${P(len * 0.45, -wid)} ${P(len, 0)} Q${P(len * 0.45, wid)} ${P(0, 0)}Z`, vein: `M${P(len * 0.12, 0)} L${P(len * 0.8, 0)}` };
}
function leaf(x, y, ang, len, wid, parent) {
  const l = leafPath(x, y, ang, len, wid);
  el('path', { class: 'leaf', d: l.body }, parent);
  el('path', { class: 'leaf-vein', d: l.vein }, parent);
}
// three leaf shapes along the branches: an olive leaf, an olive pair, a small palm frond
function sprig(kind, x, y, ang, size, parent) {
  if (kind === 0) el('path', { class: 'leaf', d: leafPath(x, y, ang, size, size * 0.26).body }, parent);
  else if (kind === 1) { el('path', { class: 'leaf', d: leafPath(x, y, ang - 0.55, size * 0.9, size * 0.24).body }, parent); el('path', { class: 'leaf', d: leafPath(x, y, ang + 0.6, size * 0.8, size * 0.22).body }, parent); }
  else [-0.7, -0.35, 0, 0.35, 0.7].forEach((da, i) => el('path', { class: 'leaf', d: leafPath(x, y, ang + da, size * (i === 2 ? 1.05 : i % 2 ? 0.92 : 0.72), size * 0.11).body }, parent));
}

/* ---------- draw: everything inside the svg, in the current language ---------- */
function draw() {
  const uiFont = cssVar('--ft-f-ui');
  const pillW = text => measure(text, `600 15px ${uiFont}`) + 26;
  layout();
  world.textContent = '';
  L = {}; nodeEls = new Map(); spineEls = new Map();
  ['edges', 'leaves', 'trunk', 'nodes', 'chips', 'spine', 'klabs'].forEach(n => L[n] = el('g', { class: 'L-' + n }, world));

  const chipBoxes = [];   // [cx, cy, half width, half height] of every chip, so the chain pills keep clear of them
  /* branches, thickest first, each with its sparse leaves (about one for every three names) */
  const leafy = new Set([...fan.keys()].filter(id => id !== ROOT).sort((a, b) => seed(a) - seed(b)).filter((id, i) => i % 3 === 0));
  [...fan.keys()].filter(id => id !== ROOT).sort((a, b) => total.get(b) - total.get(a)).forEach(id => {
    const p = byId.get(id), up = vparent.get(id), P = edgePts(up, id);
    drawEdge(pathD(P), p.placeholder || byId.get(up).placeholder ? 'قيد البحث' : p.status, p.placeholder ? 2.2 : edgeW(total.get(id)), L.edges);
    // a folded chain: «⋯ N» on the link, where the hidden circles would be
    if (byId.get(up).placeholder && p.father_id !== up) {
      const info = chainInfo.get(up), [mx, my] = bez(P, 0.45), text = '⋯ ' + (info.list.length - 3), w = measure(text, `700 13px ${uiFont}`) + 16;
      const g = el('g', { class: 'chip', transform: `translate(${f1(mx)},${f1(my)})`, tabindex: '0', role: 'button', 'data-chain': info.start, 'aria-label': t('tree_chain_more', { n: info.list.length - 3 }) }, L.chips);
      el('rect', { x: f1(-w / 2), y: -11, width: f1(w), height: 22, rx: 11 }, g); el('text', { x: 0, y: 1 }, g).textContent = text;
      chipBoxes.push([mx, my, w / 2, 11]);
    }
    const h = seed(id);
    if (leafy.has(id)) {
      const u = 0.42 + (h >>> 3) % 30 / 100, [x, y, ang] = bez(P, u), side = (h >>> 9) & 1 ? 1 : -1;
      sprig((h >>> 5) % 3, x, y, ang + side * (0.75 + ((h >>> 12) % 50) / 100), 20 + (h >>> 18) % 9, L.leaves);
    }
  });

  /* fruits */
  for (const [id, f] of fan) {
    if (id === ROOT) continue;
    const P = edgePts(vparent.get(id), id);
    makeNode(id, f.x, f.y, f.nr, L.nodes, byId.get(id).placeholder ? null : Math.atan2(P[2][1] - P[3][1], P[2][0] - P[3][0]));
  }

  /* folded generations: a «+N» chip just beyond the name; the branch stays open-ended */
  for (const [id, f] of fan) {
    if (id === ROOT || open.has(id) || !kids.get(id).length || byId.get(id).placeholder) continue;
    const n = total.get(id), text = '+' + n, w = measure(text, `700 13px ${uiFont}`) + 16;
    const ux = Math.sin(f.a), uy = -Math.cos(f.a), d = f.nr + 9 + Math.abs(ux) * w / 2 + Math.abs(uy) * 11;
    const g = el('g', { class: 'chip', transform: `translate(${f1(f.x + ux * d)},${f1(f.y + uy * d)})`, tabindex: '0', role: 'button', 'data-expand': id, 'aria-label': t('tree_expand_n', { n, name: nameOf(byId.get(id)) }) }, L.chips);
    el('rect', { x: f1(-w / 2), y: -11, width: f1(w), height: 22, rx: 11 }, g);
    el('text', { x: 0, y: 1 }, g).textContent = text;
    chipBoxes.push([f.x + ux * d, f.y + uy * d, w / 2, 11]);
  }

  /* one horizontal pill for each chain of «؟» circles: «قيد البحث · ≈N». It opens the same small panel.
     applyLOD() puts it beside the end nearest the named head, clear of the fruits, the names, the chips and the other pills. */
  pillItems = []; chipBoxesNow = chipBoxes;
  solidBoxes = chipBoxes.slice(); for (const [id, f] of fan) if (byId.get(id).placeholder) solidBoxes.push([f.x, f.y, f.nr + 2, f.nr + 2]);
  const sibAngles = [...fan.entries()].filter(([id]) => vparent.get(id) === ROOT).map(([, f]) => f.a).sort((x, y) => x - y);
  for (const info of new Set(chainInfo.values())) {
    const shown = info.list.filter(id => fan.has(id)).map(id => fan.get(id)); if (!shown.length) continue;
    const a = shown[0].a, text = t('tree_unknown_pill', { n: info.list.length }), hw = (measure(text, `600 ${PILL_FS}px ${uiFont}`) + 20) / 2, hh = 12;
    const i = sibAngles.indexOf(a), gapLo = i > 0 ? a - sibAngles[i - 1] : 9, gapHi = i >= 0 && i < sibAngles.length - 1 ? sibAngles[i + 1] - a : 9;
    const g = el('g', { class: 'chip phpill', tabindex: '0', role: 'button', 'data-id': info.start, 'aria-label': chainLabel(info), display: 'none' }, L.chips);
    el('rect', { x: f1(-hw), y: -hh, width: f1(2 * hw), height: 2 * hh, rx: hh }, g); el('text', { x: 0, y: 1 }, g).textContent = text;
    // anchors: the circle nearest the head first, then back along the chain; sideways from the chain, the roomier side first
    pillItems.push({ g, hw, hh, anchors: shown.slice().reverse().map(f => [f.x, f.y]), ux: Math.cos(a), uy: Math.sin(a), first: gapHi >= gapLo ? 1 : -1 });
  }

  /* trunk, roots, leaves, laurel */
  (function drawTrunk() {
    const T = L.trunk, top = -22, base = SLOT.ali + 4, H = base - top;
    /* An old olive trunk, drawn with paths only. It is stout and uneven, with a burl on each flank, and flares where it
       meets علي's plaque (it ends behind the plaque: nothing is drawn beneath him, and there are no roots). Three strands
       wind around each other up the trunk — lighter where one passes in front, darker behind — and fuse under عبد الله. */
    const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    const bump = (v, at, w) => Math.exp(-((v - at) / w) * ((v - at) / w));
    trunkHalf = (y, sg) => {
      const v = Math.max(0, Math.min(1, (y - top) / H));
      const body = 88 + 6 * Math.sin(v * 3.1) + 16 * ss(0.3, 0.8, v) + 36 * Math.pow(v, 5);              // shoulders, belly, flare
      const rough = sg < 0 ? 5 * Math.sin(v * 17 + 0.6) + 3 * Math.sin(v * 41 + 2) + 13 * bump(v, 0.44, 0.07) - 7 * bump(v, 0.63, 0.05)
        : 5 * Math.sin(v * 19 + 3.4) + 3 * Math.sin(v * 37 + 1) + 12 * bump(v, 0.7, 0.06) - 6 * bump(v, 0.36, 0.05);
      return body + rough * ss(0, 0.08, v) * (1 - ss(0.93, 1, v));
    };
    const spline = pts => { let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]; d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`; } return d; };
    const N = 40, yAt = v => top + v * H;
    const side = sg => Array.from({ length: N + 1 }, (_, i) => [sg * trunkHalf(yAt(i / N), sg), yAt(i / N)]);
    el('path', { class: 'trunk', d: spline(side(-1)) + ' L' + spline(side(1).reverse()).slice(1) + ' Z' }, T);
    // the shadow of a strand that passes behind fades in and out along it, so there is no hard step at the flank
    const grad = el('linearGradient', { id: 'ft-strand-shade', x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, T));
    [[0, 0], [0.42, 1], [0.58, 1], [1, 0]].forEach(([o, a]) => el('stop', { class: 'shade-stop', offset: o, 'stop-opacity': a }, grad));
    // the three strands
    const TURNS = 1.55, PH = [0.5, 0.5 + 2 * Math.PI / 3, 0.5 + 4 * Math.PI / 3];
    const mid = v => (trunkHalf(yAt(v), 1) - trunkHalf(yAt(v), -1)) / 2, wide = v => (trunkHalf(yAt(v), 1) + trunkHalf(yAt(v), -1)) / 2;
    const fuse = v => ss(0.1, 0.4, v);                                                    // 0 under the medallion (one stem), 1 lower down
    const cx = (j, v) => mid(v) + Math.sin(2 * Math.PI * TURNS * v + PH[j]) * wide(v) * 0.5 * fuse(v);
    const sw = (j, v) => wide(v) * (0.62 + 0.55 * (1 - fuse(v)) + 0.07 * Math.sin(v * 23 + j * 2));
    const depth = (j, v) => Math.cos(2 * Math.PI * TURNS * v + PH[j]);
    const M = 120, runs = [];
    PH.forEach((_, j) => { let from = 0, front = depth(j, 0) >= 0; for (let i = 1; i <= M; i++) { const f = depth(j, i / M) >= 0; if (f !== front || i === M) { runs.push({ j, a: Math.max(0, from / M - 0.012), b: Math.min(1, i / M + 0.012), front }); from = i; front = f; } } });
    const edge = (r, sg) => { const n = Math.max(4, Math.round((r.b - r.a) * 46)); return Array.from({ length: n + 1 }, (_, i) => { const v = r.a + (r.b - r.a) * i / n; return [cx(r.j, v) + sg * sw(r.j, v) / 2, yAt(v)]; }); };
    runs.sort((x, y) => x.front - y.front || y.a - x.a).forEach(r => {
      if (fuse(r.b) < 0.05) return;                                                        // fused: the plain stem shows
      const l = edge(r, -1), rt = edge(r, 1), k = r.front ? 'front' : 'back';
      const body = spline(l) + ' L' + spline(rt.slice().reverse()).slice(1) + ' Z';
      el('path', { class: 'strand', d: body }, T);
      if (!r.front) el('path', { class: 'strand-shade', d: body, fill: 'url(#ft-strand-shade)' }, T);   // in shadow where it passes behind
      el('path', { class: 'strand-edge ' + k, d: spline(l) }, T); el('path', { class: 'strand-edge ' + k, d: spline(rt) }, T);
      // bark: a few darker curved strokes along the grain of the strand, and one lighter ridge where it faces the light
      if (r.front) el('path', { class: 'ridge', d: spline(edge(r, -1).map((pt0, i) => [pt0[0] + (rt[i][0] - pt0[0]) * 0.3, pt0[1]]).slice(2, -2)) }, T);
      const h = seed('bark' + r.j + Math.round(r.a * 100));
      for (let b = 0; b < (r.front ? 3 : 1); b++) {
        const u0 = 0.12 + ((h >>> (b * 7)) % 50) / 100, len = 0.18 + ((h >>> (b * 5 + 3)) % 14) / 100, across = 0.5 + ((h >>> (b * 4 + 9)) % 30) / 100;
        const pts = Array.from({ length: 6 }, (_, i) => { const u = Math.min(0.96, u0 + len * i / 5), k2 = Math.min(l.length - 1, Math.round(u * (l.length - 1))); return [l[k2][0] + (rt[k2][0] - l[k2][0]) * (across + 0.05 * Math.sin(i * 1.7 + b)), l[k2][1]]; });
        el('path', { class: 'bark', d: spline(pts) }, T);
      }
    });
    // an old hollow and a knot, on the open bark between the plaques
    const g0 = SLOT.tulip + 44, g1 = SLOT.ali - 46;
    [[-0.5, 0.66, 9, 17, -12], [0.74, 0.2, 7, 10, 14]].forEach(([fx, fg, rx, ry, rot]) => {
      const y = g0 + (g1 - g0) * fg, x = fx * trunkHalf(y, fx);
      const g = el('g', { transform: `translate(${f1(x)},${f1(y)}) rotate(${rot})` }, T);
      el('ellipse', { class: 'knot-ring', rx: rx + 5, ry: ry + 6 }, g); el('ellipse', { class: 'knot-ring in', rx: rx + 2, ry: ry + 2.5 }, g); el('ellipse', { class: 'knot', rx, ry }, g);
    });
    // leaves on the trunk flanks
    [[0.1, -1], [0.22, 1], [0.34, -1], [0.46, 1], [0.66, -1], [0.65, 1], [0.86, -1], [0.88, 1]].forEach(([fy, sg], i) => {
      const y = top + H * fy, xEdge = sg * (trunkHalf(y, sg) + 1);
      leaf(xEdge, y, sg > 0 ? -0.55 - (i % 2) * 0.25 : Math.PI + 0.55 + (i % 2) * 0.25, 40, 11, T);
      leaf(xEdge, y + 14, sg > 0 ? -0.05 : Math.PI + 0.05, 28, 8, T);
    });
    // laurel around the lower half of the medallion
    const LR = MED_R + 10;
    for (let i = 0; i < 8; i++) {
      [1, -1].forEach(side => {
        const a = side > 0 ? Math.PI * (0.98 - i * 0.075) : Math.PI * (1.02 + i * 0.075);
        const [x, y] = pt(LR, a);
        const tx = side > 0 ? -Math.cos(a) : Math.cos(a), ty = side > 0 ? -Math.sin(a) : Math.sin(a);
        leaf(x, y, Math.atan2(ty, tx) + (i % 2 ? 0.55 : -0.55) * side, 22 - i * 0.6, 6.5, T);
      });
    }
  })();

  /* spine: plaques, connectors, medallion */
  const S = L.spine;
  function pill(x, y, text, k, parent) {
    const g = el('g', { class: `pill ${k}` }, parent), w = pillW(text);
    el('rect', { x: f1(x - w / 2), y: y - 13, width: f1(w), height: 26, rx: 13 }, g);
    el('text', { x: f1(x), y }, g).textContent = text;
    return g;
  }
  function connector(y0, y1, status, label, side) {
    const k = stKey(status);
    el('path', { class: `conn ${k}`, d: `M0,${y0} L0,${y1}` }, S);
    const ym = (y0 + y1) / 2;
    const out = trunkHalf(ym, side) + 8;   // the label stands clear of the bark
    el('path', { class: 'void-line', d: `M${side * 52},${ym} L${side * (out + 26)},${ym}` }, S);
    pill(side * (out + 30 + pillW(label) / 2), ym, label, k, S);
  }
  function spineItem(id) { const g = el('g', { class: 'spine-item', tabindex: '0', role: 'button', 'data-id': id, 'aria-label': byId.get(id)?.name_as_written || id }, S); spineEls.set(id, g); return g; }

  // connectors (drawn first, under plaques)
  connector(SLOT.ali - 40, SLOT.umar + 28, umar.status, linkLabel(umar), -1);
  connector(SLOT.umar - 28, SLOT.med + MED_R, abd.status, linkLabel(abd), -1);
  // under علي: the tribe's line, and nothing else
  el('text', { class: 'base-line', x: 0, y: SLOT.ali + 78 }, S).textContent = t('tree_base_line');

  // root plaque (cartouche)
  (function () {
    const g = spineItem(ali.id), y = SLOT.ali, w = 300, h = 84, n = 18;
    el('path', { class: 'plaque ' + stKey(ali.status), d: `M${-w / 2 + n},${y - h / 2} H${w / 2 - n} L${w / 2},${y} L${w / 2 - n},${y + h / 2} H${-w / 2 + n} L${-w / 2},${y} Z` }, g);
    el('path', { class: 'plaque-in', d: `M${-w / 2 + n + 6},${y - h / 2 + 7} H${w / 2 - n - 6} L${w / 2 - 9},${y} L${w / 2 - n - 6},${y + h / 2 - 7} H${-w / 2 + n + 6} L${-w / 2 + 9},${y} Z` }, g);
    el('text', { class: 'ptxt', x: 0, y: y - 12, 'font-size': 30, 'font-weight': 700 }, g).textContent = CONFIG.plaqueAli;
    // the line under the name is shrunk when a translation is too long for the plaque
    const sub = t('tree_poster_only', { x: CONFIG.posterAli }), subW = measure(sub, `400 12px ${uiFont}`);
    el('text', { class: 'psub', x: 0, y: y + 22, style: `font-size:${f1(Math.min(12, 12 * (w - 2 * n - 28) / subW))}px` }, g).textContent = sub;
  })();

  // tulip plaque with the verse
  (function () {
    const g = el('g', { class: 'tulip' }, S), y = SLOT.tulip;
    const T = (x, yy) => `${x},${y + yy}`;
    el('path', { class: 'plaque', d: `M${T(0, 70)} C${T(-66, 66)} ${T(-100, 24)} ${T(-96, -38)} L${T(-94, -70)} C${T(-76, -54)} ${T(-60, -48)} ${T(-44, -44)} C${T(-32, -64)} ${T(-15, -77)} ${T(0, -84)} C${T(15, -77)} ${T(32, -64)} ${T(44, -44)} C${T(60, -48)} ${T(76, -54)} ${T(94, -70)} L${T(96, -38)} C${T(100, 24)} ${T(66, 66)} ${T(0, 70)} Z` }, g);
    CONFIG.verse.forEach((l, i) => el('text', { class: 'verse', x: 0, y: y - 22 + i * 30, 'font-size': i === 1 ? 21 : 18, 'font-weight': 700 }, g).textContent = l);
  })();

  // Umar box
  (function () {
    const g = spineItem(umar.id), y = SLOT.umar;
    el('rect', { class: 'plaque ' + stKey(umar.status), x: -78, y: y - 28, width: 156, height: 56, rx: 7 }, g);
    el('text', { class: 'ptxt', x: 0, y: y - 2, 'font-size': 30, 'font-weight': 700 }, g).textContent = shortName(umar);
  })();

  // 1987 reading (hidden by default)
  const r87 = el('g', { class: 'r87' }, S);
  [[CONFIG.reading1987.boxes[0], SLOT.fd], [CONFIG.reading1987.boxes[1], SLOT.hm]].forEach(([b, y]) => {
    const g = el('g', { class: 'spine-item', tabindex: '0', role: 'button', 'data-id': b.id, 'aria-label': `${b.label} — ${t('tree_r87_aria')}` }, r87);
    spineEls.set(b.id, g);
    el('rect', { class: 'plaque', x: -74, y: y - 25, width: 148, height: 50, rx: 7 }, g);
    el('text', { class: 'ptxt', x: 0, y: y - 1, 'font-size': 25 }, g).textContent = b.label;
  });
  const ym87 = (SLOT.fd + SLOT.hm) / 2;
  const lines87 = [t('tree_r87_callout_1'), t('tree_r87_callout_2'), t('tree_r87_callout_3')];
  const cw = Math.max(250, ...lines87.map(l => measure(l, `500 12.5px ${uiFont}`) + 28));
  el('path', { class: 'lead', d: `M78,${SLOT.fd} C120,${SLOT.fd} 120,${ym87} 150,${ym87}` }, r87);
  el('path', { class: 'lead', d: `M78,${SLOT.hm} C120,${SLOT.hm} 120,${ym87} 150,${ym87}` }, r87);
  el('rect', { class: 'callout', x: 150, y: ym87 - 44, width: f1(cw), height: 88, rx: 8 }, r87);
  lines87.forEach((l, i) => el('text', { class: 'ctxt', x: f1(150 + cw / 2), y: ym87 - 22 + i * 23 }, r87).textContent = l);

  // medallion
  (function () {
    const g = spineItem(abd.id), k = stKey(abd.status);
    el('circle', { class: 'plaque ' + k, r: MED_R, cx: 0, cy: 0 }, g);
    el('circle', { class: 'plaque-in', r: MED_R - 9, cx: 0, cy: 0 }, g);
    el('text', { class: 'ptxt', x: 0, y: -16, 'font-size': 31, 'font-weight': 700 }, g).textContent = 'عبد الله';
    el('text', { class: 'ptxt', x: 0, y: 22, 'font-size': 25 }, g).textContent = 'سبال العين';
  })();


  fitLabels();
  drawLegend();
  if (selected) { ring(nodeEls.get(selected))?.g.classList.add('sel'); spineEls.get(selected)?.classList.add('sel'); }
  markBranch();
  treeEl.classList.toggle('sway', !reduced && fan.size <= 400);   // the sway repaints the svg, so not on very large trees
  if (!grown && !reduced) { grown = true; treeEl.classList.add('grow'); setTimeout(() => treeEl.classList.remove('grow'), 1300); }
  [['ft-zin', 'tree_zoom_in'], ['ft-zout', 'tree_zoom_out'], ['ft-zfit', 'tree_zoom_fit'], ['ft-zfull', 'tree_fullscreen'], ['ft-pClose', 'tree_close'], ['ft-theme', 'tree_theme']].forEach(([id, key]) => { const b = $(id); if (b) { b.setAttribute('aria-label', t(key)); b.title = t(key); } });
  treeEl.setAttribute('aria-label', t('tree_aria'));
  panel.setAttribute('aria-label', t('tree_panel_label'));
  q.setAttribute('aria-label', t('tree_search_placeholder'));
  q.placeholder = t('tree_search_placeholder');
  q.dir = document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl';   // placeholder punctuation follows the UI language
  drawStats();
}

/* ---------- names inside the fruits (fitted with the fonts that are loaded) ---------- */
function fitLabels() {
  const nameFont = cssVar('--ft-f-name');
  const width = (l, f) => measure(l, `700 100px ${nameFont}`) * f / 100;   // one measurement per name, scaled
  const fitsIn = (lines, f, r) => lines.length === 1 ? width(lines[0], f) <= 2 * r - 9 :
    lines.every((l, i) => { const yy = (i ? 1 : -1) * 1.05 * f; return width(l, f) <= 2 * Math.sqrt(Math.max(0, r * r - yy * yy)) - 7; });
  for (const [id, n] of nodeEls) {
    if (byId.get(id).placeholder) { n.t.textContent = ''; n.t.setAttribute('font-size', 15); el('tspan', { x: 0, dy: 1 }, n.t).textContent = '؟'; n.fs = 99; continue; }
    const opts = [[n.label]], words = n.label.split(/\s+/);
    if (words.length > 1) { opts.push(splitLines(n.label)); if (words.length === 2) opts.push(words); }
    let best = null;
    for (const lines of opts) {
      let fs = Math.min(lines.length > 1 ? n.r * 0.5 : n.r * 0.58, 20);
      while (fs > 9 && !fitsIn(lines, fs, n.r)) fs -= 0.5;
      if (!best || fs > best.fs + 0.4) best = { fs, lines };
    }
    let { fs, lines } = best;
    // never let a name spill out of its fruit: at the smallest size, shorten it (the tooltip and the panel carry the full name)
    lines = lines.slice();
    while (!fitsIn(lines, fs, n.r)) {
      let j = 0; lines.forEach((l, i) => { if (width(l, fs) > width(lines[j], fs)) j = i; });
      const cut = lines[j].replace(/…$/, ''); if (cut.length <= 1) break;
      lines[j] = cut.slice(0, -1).trimEnd() + '…';
    }
    n.t.textContent = '';
    n.t.setAttribute('font-size', fs);
    lines.forEach((l, i) => el('tspan', { x: 0, dy: lines.length === 1 ? 1 : (i === 0 ? f1(-0.55 * fs) : f1(1.18 * fs)) }, n.t).textContent = l);
    n.fs = fs;
  }
  buildKeyLabels();
}

/* names beside the fruits while the names inside them are too small to read: 12px on screen, pushed outward,
   and replaced by «…» (the tooltip has the name) only where they would cover another name or another fruit */
function buildKeyLabels() {
  const nameFont = cssVar('--ft-f-name');
  L.klabs.textContent = ''; keyLabels = [];
  for (const [id, n] of nodeEls) {
    const f = fan.get(id); if (!f || byId.get(id).placeholder) continue;
    keyLabels.push({ id, n, t: null, x: n.x, y: n.y, r: n.r, w: measure(n.label, `700 12px ${nameFont}`) + 8, d: f.d, ux: Math.sin(f.a), uy: -Math.cos(f.a), shown: null });
  }
  lastLodK = 0; applyLOD(currentK, true);
}

/* ---------- zoom / pan ---------- */
const svg = d3.select(treeEl);
const DETAIL_PX = 9;       // smallest on-screen size at which the name inside a fruit is used (7.5 on phones)
let lastLodK = 0, lodTimer = 0;
function applyLOD(k, force) {
  currentK = k;
  treeEl.classList.toggle('lod-low', k < 0.5);     // leaves and stems fade out
  treeEl.classList.toggle('lod-far', k < 0.2);     // fruits are a few pixels wide: plain discs and plain lines
  if (!force && lastLodK && Math.abs(k - lastLodK) / lastLodK < 0.025) return;
  lastLodK = k;
  const CELL = 64, grid = new Map();
  const put = b => { for (let gx = Math.floor((b[0] - b[2]) / CELL); gx <= Math.floor((b[0] + b[2]) / CELL); gx++) for (let gy = Math.floor((b[1] - b[3]) / CELL); gy <= Math.floor((b[1] + b[3]) / CELL); gy++) { const key = gx * 100003 + gy; const a = grid.get(key); if (a) a.push(b); else grid.set(key, [b]); } };
  const hits = (cx, cy, hw, hh, self) => { for (let gx = Math.floor((cx - hw) / CELL); gx <= Math.floor((cx + hw) / CELL); gx++) for (let gy = Math.floor((cy - hh) / CELL); gy <= Math.floor((cy + hh) / CELL); gy++) { const a = grid.get(gx * 100003 + gy); if (a) for (const b of a) if (b !== self && Math.abs(b[0] - cx) < hw + b[2] && Math.abs(b[1] - cy) < hh + b[3]) return true; } return false; };
  let outside = 0;
  const phone = isMobile(), minPx = phone ? 7.5 : DETAIL_PX;
  for (const kl of keyLabels) { kl.out = (kl.n.fs || 0) * k < minPx; if (kl.out !== kl.wasOut) { kl.n.g.classList.toggle('ext', kl.out); kl.wasOut = kl.out; } if (kl.out) outside++; kl.box = [kl.x * k, kl.y * k, kl.r * k + 1, kl.r * k + 1]; put(kl.box); }
  put([0, 0, MED_R * k, MED_R * k]); put([0, SLOT.ali / 2 * k, 150 * k, (SLOT.ali / 2 + 50) * k]);   // medallion, trunk
  for (const b of solidBoxes) put([b[0] * k, b[1] * k, b[2] * k, b[3] * k]);                          // «؟» circles and chips
  // chain pills, before the names so that the names keep clear of them. Zoomed out a little, a pill is held at a readable
  // size (up to a third larger than drawn); where it would still fall below 10px on screen the pills go and the circles stay
  const ps = Math.min(1.35, Math.max(1, (PILL_MIN_PX + 0.5) / (PILL_FS * k))), pillsOn = PILL_FS * k * ps >= PILL_MIN_PX;
  const placed = [];
  // exact test in world units: a pill's rectangle against the round fruits and circles, the chips and the other pills
  const free = (cx, cy, hw, hh) => {
    for (const n of nodeEls.values()) { const dx = Math.max(Math.abs(n.x - cx) - hw, 0), dy = Math.max(Math.abs(n.y - cy) - hh, 0); if (dx * dx + dy * dy < (n.r + 3) * (n.r + 3)) return false; }
    const mx = Math.max(Math.abs(cx) - hw, 0), my = Math.max(Math.abs(cy) - hh, 0); if (mx * mx + my * my < (MED_R + 8) * (MED_R + 8)) return false;
    for (const b of chipBoxesNow) if (Math.abs(b[0] - cx) < hw + b[2] + 3 && Math.abs(b[1] - cy) < hh + b[3] + 3) return false;
    for (const b of placed) if (Math.abs(b[0] - cx) < hw + b[2] + 4 && Math.abs(b[1] - cy) < hh + b[3] + 4) return false;
    return true;
  };
  for (const it of pillItems) {
    let at = null;
    if (pillsOn) {
      const hw = it.hw * ps, hh = it.hh * ps, sx = it.ux >= 0 ? it.first : -it.first;
      // beside the circle nearest the head first, then back along the chain; sideways from the chain or level with it, nudged outward step by step
      search: for (const [ax, ay] of it.anchors) for (let step = 0; step < 6; step++) for (const [ux, uy] of [[it.ux * it.first, it.uy * it.first], [sx, 0], [-it.ux * it.first, -it.uy * it.first], [-sx, 0]]) {
        const d = PH_R + 5 + Math.abs(ux) * hw + Math.abs(uy) * hh + step * 8 / k, cx = ax + ux * d, cy = ay + uy * d;
        if (free(cx, cy, hw, hh)) { at = [cx * k, cy * k]; placed.push([cx, cy, hw, hh]); put([cx * k, cy * k, hw * k, hh * k]); break search; }
      }
    }
    if (at) { it.g.setAttribute('transform', `translate(${f1(at[0] / k)},${f1(at[1] / k)}) scale(${ps.toFixed(4)})`); it.g.removeAttribute('display'); }
    else it.g.setAttribute('display', 'none');
  }
  const show = (kl, mode, x, y) => {
    if (!kl.t) { if (!mode) return; kl.t = el('text', { class: 'klab' }, L.klabs); }
    if (kl.shown !== mode) { kl.t.textContent = mode === 'name' ? kl.n.label : mode === 'dots' ? '…' : ''; if (mode) kl.t.removeAttribute('display'); else kl.t.setAttribute('display', 'none'); kl.shown = mode; }
    if (mode) { kl.t.setAttribute('x', f1(x)); kl.t.setAttribute('y', f1(y)); kl.t.setAttribute('transform', `translate(${f1(kl.x)},${f1(kl.y)}) scale(${(1 / k).toFixed(4)})`); }
  };
  if (outside) {
    const order = keyLabels.filter(kl => kl.out).sort((a, b) => a.d - b.d || total.get(b.id) - total.get(a.id));
    for (const kl of order) {
      // phones: no names outside the fruits; a name too small to read becomes «…», with the name in the tooltip and the panel
      if (phone) { show(kl, kl.r * k >= 5 ? 'dots' : '', 0, 0); continue; }
      const hw = kl.w / 2, hh = 8, gap = kl.r * k + 3, nx = kl.x * k, ny = kl.y * k;
      let at = null;
      for (const [ux, uy] of [[kl.ux, kl.uy], [0, 1], [0, -1], [kl.ux >= 0 ? 1 : -1, 0]]) {   // outward, below, above, beside
        const d = gap + Math.abs(ux) * hw + Math.abs(uy) * hh, cx = nx + ux * d, cy = ny + uy * d;
        if (hits(cx, cy, hw, hh, kl.box)) continue;
        at = [cx, cy]; break;
      }
      if (at) { put([at[0], at[1], hw, hh]); show(kl, 'name', at[0] - nx, at[1] - ny); }
      else show(kl, kl.r * k >= 5 ? 'dots' : '', 0, 0);   // never an empty fruit: an ellipsis, with the name in the tooltip (below 10px across it is a dot, not a fruit)
    }
  }
  for (const kl of keyLabels) if (!kl.out) show(kl, '', 0, 0);
}
const zoom = d3.zoom().scaleExtent([0.03, 4])
  // cooperative gestures: the page keeps the plain wheel and the one-finger drag; Ctrl/⌘ + wheel, two fingers or a mouse drag move the tree
  .filter(e => e.type === 'wheel' ? (e.ctrlKey || e.metaKey || stage.classList.contains('fs')) : e.type.startsWith('touch') ? (e.touches.length > 1 || stage.classList.contains('fs')) : !e.button)
  .on('end', () => { if (legendCovers()) legendEl.open = false; })
  .on('zoom', e => {
    world.setAttribute('transform', e.transform);
    // with thousands of names, re-placing the outside names on every frame is the expensive part: do it between frames
    if (keyLabels.length > 400) { currentK = e.transform.k; treeEl.classList.add('moving'); clearTimeout(lodTimer); lodTimer = setTimeout(() => { treeEl.classList.remove('moving'); applyLOD(currentK); }, 140); } else applyLOD(e.transform.k);
    hideTip();
  });
svg.call(zoom).on('dblclick.zoom', null);
const hintEl = $('ft-hint');
let hintTimer;
function hint(key) { hintEl.textContent = t(key); hintEl.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.hidden = true; }, 1500); }
treeEl.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey && !stage.classList.contains('fs')) hint('tree_hint_wheel'); }, { passive: true });
treeEl.addEventListener('touchmove', e => { if (e.touches.length === 1 && !stage.classList.contains('fs')) hint('tree_hint_touch'); }, { passive: true });

const visible = () => stage.clientWidth > 0 && stage.clientHeight > 0;
function contentBounds() {
  return { x0: Math.min(fanBox.x0, -170) - 30, x1: Math.max(fanBox.x1, 170) + 30, y0: fanBox.y0 - 34, y1: Math.max(fanBox.y1, SLOT.ali + 104) };
}
// the phone stage has a fixed share of the screen (set in tree.css) and opens on the medallion and the first generations;
// resizing it to the tree after load would push the page about
function sizeStage() { stage.style.height = ''; }
// the legend never lies over a fruit: while it is open the tree is fitted beside it (below it on phones),
// and it folds itself away as soon as the tree is moved under it
function legendCovers() {
  if (!legendEl.open || !visible()) return false;
  const tr = d3.zoomTransform(treeEl), s = stage.getBoundingClientRect(), l = legendEl.getBoundingClientRect();
  const x0 = l.left - s.left - 4, x1 = l.right - s.left + 4, y0 = l.top - s.top - 4, y1 = l.bottom - s.top + 4;
  const hit = (x, y, rx, ry) => { const sx = tr.x + x * tr.k, sy = tr.y + y * tr.k; return sx + rx * tr.k > x0 && sx - rx * tr.k < x1 && sy + ry * tr.k > y0 && sy - ry * tr.k < y1; };
  for (const f of fan.values()) if (hit(f.x, f.y, f.nr, f.nr)) return true;
  return hit(0, SLOT.umar, 80, 30) || hit(0, SLOT.tulip, 100, 85) || hit(0, SLOT.ali, 152, 44);
}
function legendInset() {
  if (!legendEl.open || (panel.classList.contains('open') && panel.parentNode === stage)) return null;
  const s = stage.getBoundingClientRect(), l = legendEl.getBoundingClientRect();
  return isMobile() ? { top: l.bottom - s.top + 6 } : { left: l.right - s.left + 8 };
}
function viewRect() {
  const W = stage.clientWidth, H = stage.clientHeight, isOpen = panel.classList.contains('open'), ins = legendInset();
  if (!isOpen && ins) return ins.top ? { x: 0, y: ins.top, w: W - 46, h: H - ins.top } : { x: ins.left, y: 0, w: W - ins.left, h: H };
  if (!isOpen) return isMobile() ? { x: 0, y: 0, w: W - 46, h: H } : { x: 0, y: 0, w: W, h: H };   // phones: keep clear of the zoom buttons
  if (panel.parentNode === document.body) { const vis = (window.innerHeight - panel.offsetHeight) - stage.getBoundingClientRect().top; return { x: 0, y: 0, w: W, h: Math.max(90, Math.min(H, vis)) }; }
  if (panel.parentNode !== stage) return { x: 0, y: 0, w: W, h: H };
  if (isMobile()) return { x: 0, y: 0, w: W, h: Math.max(90, H - panel.offsetHeight) };
  const pw = panel.offsetWidth; return { x: pw, y: 0, w: W - pw, h: H };
}
function go(tr, ms = 550) { (reduced || !ms ? svg : svg.transition().duration(ms).ease(d3.easeCubicInOut)).call(zoom.transform, tr); }
let fitMode = 'home';
// home: the medallion, عمر below it and the generations above, large enough to read; all: down to the roots
function fit(ms = 550, mode = fitMode) {
  if (!visible()) return;
  fitMode = mode;
  const b = contentBounds(), v = viewRect(), pad = isMobile() ? 16 : 22;
  const k = Math.min(1.5, (v.w - pad * 2) / (b.x1 - b.x0), (v.h - pad * 2) / (b.y1 - b.y0));
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * (b.x0 + b.x1) / 2, v.y + v.h / 2 - k * (b.y0 + b.y1) / 2).scale(k), ms);
}
function posOf(id) {
  const n = nodeEls.get(id); if (n) return [n.x, n.y];
  if (id === ROOT) return [0, 0];
  if (id === CONFIG.spine[0]) return [0, SLOT.ali];
  if (id === CONFIG.spine[1]) return [0, SLOT.umar];
  if (id === 'r87_fadl') return [0, SLOT.fd];
  if (id === 'r87_hm') return [0, SLOT.hm];
  return [0, 0];
}
function centerOn(id, kMin = 1.1, ms = 600) {
  if (!visible()) return;
  const [x, y] = posOf(id), v = viewRect();
  if (isMobile()) kMin = Math.min(kMin, 1);
  const k = Math.max(d3.zoomTransform(treeEl).k, kMin);
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * x, v.y + v.h / 2 - k * y).scale(k), ms);
}
$('ft-zin').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1.4);
$('ft-zout').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1 / 1.4);
$('ft-zfit').onclick = () => fit(550, 'all');

/* ---------- unfolding ---------- */
function redraw(after) { draw(); sizeStage(); if (after) requestAnimationFrame(after); }
function expand(id) { openBelow(id); redraw(() => centerOn(id, Math.min(1, d3.zoomTransform(treeEl).k), 450)); }
function showAll() { legendEl.open = false; for (const id of inFan) if (kids.get(id).length) open.add(id); redraw(() => fit(550, 'all')); }
function foldAll() { resetOpen(); if (selected && inFan.has(selected)) { openPathTo(selected); openBelow(selected); } redraw(() => fit(550, 'home')); }
// opened by hand over the tree: make room for it instead of covering names
legendEl.addEventListener('toggle', () => { if (legendEl.open && drawn && fitted && legendCovers()) fit(350); });
$('ft-all').onclick = showAll;
$('ft-fold').onclick = foldAll;
// search, deep links and the chain can reach any name: unfold the way to it first
function reveal(id) {
  if (!inFan.has(id) || id === ROOT) return false;
  const before = open.size; openPathTo(id); openBelow(id);
  if (open.size === before && fan.has(id)) return false;
  draw(); sizeStage(); return true;
}

/* ---------- full screen and phone orientation ---------- */
function setFull(on) {
  stage.classList.toggle('fs', on); document.documentElement.classList.toggle('ft-noscroll', on);
  $('ft-zfull').setAttribute('aria-pressed', on ? 'true' : 'false');
  placePanel(selected);
  if (on) {
    if (stage.requestFullscreen) stage.requestFullscreen().then(() => { try { const l = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (l && l.catch) l.catch(() => {}); } catch (e) { /* iOS and desktop ignore this */ } }).catch(() => {});
  } else {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* not locked */ }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  sizeStage();
}
$('ft-zfull').onclick = () => setFull(!stage.classList.contains('fs'));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && stage.classList.contains('fs')) setFull(false); });
const rotateHint = $('ft-rotate');
function maybeRotateHint() { rotateHint.hidden = !(isMobile() && window.innerHeight > window.innerWidth && !store.get('treeRotateHintSeen')); }
$('ft-rotate-x').onclick = () => { store.set('treeRotateHintSeen', '1'); rotateHint.hidden = true; };
maybeRotateHint();

/* ---------- deep links: #/b/<key> opens the page centred on that branch ---------- */
let branchKey = null;      // the branch a deep link is showing; its marker survives redraws
function markBranch() {
  host.querySelectorAll('.node.hit').forEach(e => e.classList.remove('hit'));
  const b = CONFIG.branches[branchKey]; if (!b) return [];
  return (b.roots || [b.root]).map(id => ring(nodeEls.get(id))).filter(Boolean).map(n => { n.g.classList.add('hit'); return n.g; });
}
function focusBranch(key, ms = 700) {
  const b = CONFIG.branches[key]; if (!b) return false;
  const roots = (b.roots || [b.root]).filter(id => byId.has(id)); if (!roots.length) return false;
  branchKey = key;
  roots.forEach(rid => { openPathTo(rid); (function all(id) { if (kids.get(id).length) open.add(id); kids.get(id).forEach(all); })(rid); });
  draw(); sizeStage();
  if (!markBranch().length || !visible()) return false;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  roots.forEach(rid => (function walk(id) { const f = fan.get(id); if (!f) return; x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); vkids(id).forEach(walk); })(rid));
  stage.scrollIntoView({ block: 'center', behavior: 'auto' });
  const v = viewRect(), pad = isMobile() ? 34 : 80;
  // phones: never so far out that the names leave their fruits; a wide branch is then panned, not shrunk
  const k = Math.min(1.6, Math.max(isMobile() ? 0.56 : 0, Math.min((v.w - pad * 2) / (x1 - x0), (v.h - pad * 2) / (y1 - y0))));
  const f0 = fan.get(roots[0]), wide = k * (x1 - x0) > v.w, cx = wide ? f0.x : (x0 + x1) / 2, cy = wide ? Math.min(f0.y, (y0 + y1) / 2 + (v.h / 2 - 70) / k) : (y0 + y1) / 2;
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * cx, v.y + v.h / 2 - k * cy).scale(k), ms);
  return true;
}

/* ---------- 1987 toggle ---------- */
t87.addEventListener('change', () => {
  draw();
  treeEl.classList.toggle('show87', t87.checked);
  if (t87.checked) { const v = viewRect(), k = Math.max(0.45, Math.min(1, v.h / 900, v.w / 640)); go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * 90, v.y + v.h / 2 - k * SLOT.umar).scale(k)); } else fit();
});

/* ---------- person panel ---------- */
const stPill = (p, label) => (label ? [label] : linkLabels(p)).map(x => `<span class="st ${stKey(p.status)}">${esc(x)}</span>`).join('');
const personBtn = id => { const p = byId.get(id); return p ? `<button type="button" class="pl" data-go="${esc(id)}">${esc(nameOf(p))}</button>` : ''; };
const level = c => { const s = String(c || ''); return s.startsWith('عالية') ? 3 : s.startsWith('متوسطة') ? 2 : s.startsWith('منخفضة') ? 1 : 0; };
const dotsHtml = (c, title, withText = true) => { const n = level(c); return c ? `<span class="conf" title="${esc(title)}: ${esc(c)}">${n ? [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') : ''}${withText ? ' ' + esc(c) : ''}</span>` : ''; };
const pageTxt = pg => pg == null || pg === '' ? '' : (typeof pg === 'number' || /^\d+$/.test(String(pg)) ? t('tree_page_book', { n: pg }) : String(pg));
const ahTxt = v => /^\d+$/.test(String(v)) ? `${v}${t('tree_ah')}` : String(v);
const docDate = it => it.d ? (it.d.date_hijri && /^\d+$/.test(String(it.d.date_hijri)) ? ahTxt(it.d.date_hijri) : '') : (it.e && /^\d+/.test(String(it.e.date || '')) ? ahTxt(String(it.e.date).match(/^\d+/)[0]) : '');
function genText(p) { return p.generation == null ? t('tree_gen_unknown') : p.generation === 0 ? t('tree_gen_zero') : p.generation < 0 ? t('tree_gen_top', { n: p.generation }) : t('tree_gen', { n: p.generation }); }
function ancestors(id, stopAt) { const out = []; let p = byId.get(id), guard = 0; while (p && p.father_id && byId.has(p.father_id) && guard++ < 200) { p = byId.get(p.father_id); out.push(p); if (p.id === stopAt) break; } return out; }
/* The lineage in words, the Arab way: from the person to the oldest known ancestor, joined by «بن», with no arrows.
   «جمال بن عمر بن … بن الحاج فضل بن عبد الله سبال العين بن عمر بن علي الجداوي الأنصاري» */
function nasabParts(id) {
  const line = [byId.get(id), ...ancestors(id)], out = [];
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    if (x.placeholder) { let n = 1; while (line[i + 1] && line[i + 1].placeholder) { n++; i++; } out.push({ id: x.id, gap: true, text: t('tree_nasab_gap', { n }) }); continue; }   // a run of «؟» is one segment
    let name = x.id === CONFIG.spine[0] ? CONFIG.plaqueAli : shortName(x);
    if (out.length && !x.hidden) name = name.replace(/^أبو(?=\s)/, 'أبي');   // genitive after «بن»
    out.push({ id: x.id, text: name });
  }
  return out;
}
const binOf = p => t(/ بنت /.test(' ' + p.name_as_written + ' ') ? 'tree_bint' : 'tree_bin');
function nasabText(id) { const p = byId.get(id), bin = t('tree_bin'); return nasabParts(id).map((a, i) => i ? `${i === 1 ? binOf(p) : bin} ${a.text}` : a.text).join(' '); }
// the panel's line carries on from the name above it: «بن … بن … بن علي الجداوي الأنصاري», every father a link
function lineageHtml(p) {
  const bin = t('tree_bin');
  return nasabParts(p.id).slice(1).map((a, i) => `<span class="bn">${esc(i ? bin : binOf(p))}</span> <button type="button" class="lk" data-go="${esc(a.id)}">${esc(a.text)}</button>`).join(' ');
}
// a chain of placeholders: «حلقات بين <the named ancestor above> و<the named head below>»
const plainName = p => nameOf(p).replace(/\s*[(（][^)）]*[)）]\s*$/, '');   // the name without a bracketed epithet
const chainEnds = info => { const above = byId.get((byId.get(info.start) || {}).father_id); return { above: above && !above.placeholder ? above : null, heads: info.heads.map(h => byId.get(h)).filter(Boolean) }; };
function betweenText(info) { const e = chainEnds(info); return e.above && e.heads.length ? t('tree_unknown_between', { a: plainName(e.above), b: e.heads.map(plainName).join(t('tree_and')) }) : ''; }
function betweenHtml(info) {
  const e = chainEnds(info); if (!e.above || !e.heads.length) return '';
  const link = a => `<button type="button" class="lk" data-go="${esc(a.id)}">${esc(plainName(a))}</button>`;
  return esc(t('tree_unknown_between')).replace('{a}', link(e.above)).replace('{b}', e.heads.map(link).join(esc(t('tree_and'))));
}
// the data keeps its own audit trail («التصنيف السابق: …») at the end of a note; it is not part of the public source line
const publicNote = s => String(s || '').replace(/\s*\|?\s*التصنيف السابق:[^.|]*\.?\s*$/, '').trim();
function stripHtml(id) {
  const D = docsOf(id);
  const thumbs = D.thumbs.map(th => {
    const leg = th.it.d ? dotsHtml(th.it.d.legibility, t('tree_legibility'), false) : (th.it.e ? dotsHtml(th.it.e.confidence, t('tree_confidence'), false) : '');
    const page = pageTxt(th.it.d ? th.it.d.page : th.it.e.page);
    return `<button type="button" class="th" data-doc="${th.i}" data-of="${esc(id)}" aria-label="${esc(t('tree_open_doc'))}: ${esc(page)}"><img src="${esc(asset(th.it.src))}" alt="" loading="lazy" decoding="async" width="120" height="150"><span class="thm"><b>${esc(docDate(th.it) || t('tree_no_date'))}</b>${leg}</span><span class="thp">${esc(page)}</span></button>`;
  }).join('');
  // a document whose image has not been published: a short title, the quote, and the long reference as the source line
  const bare = D.bare.map(e => {
    const ref = String(e.page ?? ''), title = e.title || ref.split(/[:(]/)[0].trim() || t('tree_docs');
    return `<div class="noimg"><b>${esc(title)}</b>${e.date ? `<span class="thd">${esc(e.date)}</span>` : ''}${e.quote ? `<p class="qt">${esc(e.quote)}</p>` : ''}<span class="muted">${esc(t('tree_img_unpublished'))}</span>${CONTRIBUTE_URL ? ` <a class="lnk" href="${esc(contributeHref(t('tree_have_image_msg', { name: nameOf(byId.get(id)), ref })))}" target="_blank" rel="noopener">${esc(t('tree_have_image'))}</a>` : ''}<span class="src">${esc(t('tree_source'))}: ${esc(e.source || ref)}</span></div>`;
  }).join('');
  return { html: (thumbs ? `<div class="strip">${thumbs}</div>` : '') + bare, count: D.count };
}
const contributeHref = msg => CONTRIBUTE_URL + (CONTRIBUTE_URL.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(msg);
function openPerson(id, { center = true } = {}) {
  if (id === 'r87_fadl' || id === 'r87_hm') return open1987(id, center);
  const p = byId.get(id); if (!p) return;
  reveal(id);
  setSelected(id);
  const info = p.placeholder ? chainInfo.get(id) || { start: id, list: [id], estimate: p.estimate || {}, heads: [] } : null;
  // a chain is not one generation: no generation line, and «حلقات بين … و…» in place of the lineage line
  pEyebrow.textContent = (info ? [p.branch] : [genText(p), p.branch]).filter(Boolean).join(' · ');
  pName.textContent = info ? chainLabel(info) : nameOf(p);
  pLine.innerHTML = info ? betweenHtml(info) : lineageHtml(p);
  if (info) {
    pBadges.innerHTML = '';
    pBody.innerHTML = `<section class="sec"><p class="note">${esc(info.estimate.basis || t('tree_unknown_basis'))}</p></section>` + (info.heads.length ? `<section class="sec"><div class="chips">${info.heads.map(personBtn).join('')}</div></section>` : '');
    showPanel(id); if (center) requestAnimationFrame(() => centerOn(id)); return;
  }
  const f = p.father_id && byId.get(p.father_id), ks = kids.get(id) || [], k = stKey(p.status), src = srcKey(p.status);
  pBadges.innerHTML = (f ? stPill(p) : '') + (!p.living && p.earliest_doc_date ? `<span class="bd">${esc(t('tree_earliest'))}: ${esc(ahTxt(p.earliest_doc_date))}</span>` : '');
  let html = '';
  const chain = ancestors(id, ROOT);
  if (chain.length && chain[chain.length - 1].id === ROOT) html += `<section class="sec"><button type="button" class="cta" data-chain="${esc(id)}">${esc(t('tree_chain_btn'))}</button> <button type="button" class="add" data-share="${esc(id)}">${esc(t('tree_share'))}</button></section>`;
  if (!f) html += `<section class="sec"><p class="muted">${esc(id === CONFIG.spine[0] ? t('tree_above_ali') : t('tree_father_none'))}</p></section>`;
  if (ks.length) html += `<section class="sec"><h4>${esc(t('tree_children'))} (${ks.length})</h4><div class="chips">${ks.map(personBtn).join('')}</div></section>`;
  if (!p.living) {
    const S = stripHtml(id);
    // the civil registry needs no document picture: the documents section is shown for it only when there is one
    if (S.count || src !== 'civil') html += `<section class="sec"><h4>${esc(t('tree_docs'))} (${S.count})</h4>${S.count ? S.html : `<p class="muted">${esc(t('tree_docs_none'))}</p>`}</section>`;
    // the testimony of the tribe's elders: its chip, the elders' names, and the book page in the reader
    docsOf(id).testimony.forEach(th => {
      const names = CONFIG.testimonyNames[th.img] || [], page = pageTxt(th.it.e.page);
      html += `<section class="sec tst"><span class="st">${esc(t('tree_testimony_chip'))}</span>${names.length ? `<ul class="who">${names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<div class="strip"><button type="button" class="th" data-doc="${th.i}" data-of="${esc(id)}" aria-label="${esc(t('tree_open_doc'))}: ${esc(page)}"><img src="${esc(asset(th.it.src))}" alt="" loading="lazy" decoding="async" width="120" height="150"><span class="thp">${esc(page)}</span></button></div><span class="src">${esc(t('tree_source'))}: ${esc(th.it.e.source || page)}</span></section>`;
    });
    // the civil registry, the author's tree or the elders' account: the notes say where it comes from
    if (k === 'trad' && p.notes) html += `<section class="sec"><h4>${esc(t('tree_link_' + src))}</h4><p class="srcline">${esc(publicNote(p.notes))}</p></section>`;
    const audit = [];
    if (id === CONFIG.spine[0] && CONFIG.posterAli) audit.push(`<h5>${esc(t('tree_poster_title'))}</h5><p class="note">${esc(t('tree_poster_note', { name: p.name_as_written, x: CONFIG.posterAli }))}</p>`);
    if (k !== 'trad' && p.notes) audit.push(`<p class="note">${esc(p.notes)}</p>`);
    const av = p.author_version;
    if (av) audit.push(`<h5>${esc(t('tree_author_version'))}</h5><p class="note">${esc(av.father_per_author || '')}${av.basis ? ` <span class="muted">${esc(av.basis)}</span>` : ''}</p>`);
    if (audit.length) html += `<details class="audit"><summary>${esc(t('tree_audit'))}</summary>${audit.join('')}</details>`;
  }
  // an open branch: anyone from the family can send the next generation
  if (!ks.length) html += `<section class="sec"><button type="button" class="add" data-add="${esc(id)}"><span aria-hidden="true">+</span> ${esc(t('tree_add_children'))}</button><div class="addbox" hidden></div></section>`;
  pBody.innerHTML = html; pBody.scrollTop = 0;
  showPanel(id); if (center) requestAnimationFrame(() => centerOn(id));
}
function open1987(id, center) {
  setSelected(id);
  pEyebrow.textContent = t('tree_r87_eyebrow');
  pName.textContent = CONFIG.reading1987.boxes.find(b => b.id === id).label;
  pLine.innerHTML = '';
  pBadges.innerHTML = `<span class="st trad">${esc(t('tree_link_trad'))}</span>`;
  const note = esc(t('tree_r87_note')).replace(/\{(\w+)\}/g, (m, k) => personBtn(k) || m);
  const S = stripHtml('umar');
  pBody.innerHTML = `<section class="sec"><p class="note">${note}</p></section>
    <section class="sec"><h4>${esc(t('tree_r87_text'))}</h4>${S.html}</section>
    <section class="sec"><h4>${esc(t('tree_r87_link'))}</h4><div class="chips">${personBtn('umar')} ${stPill(abd)} ${personBtn(ROOT)}</div></section>`;
  pBody.scrollTop = 0;
  showPanel(id); if (center) requestAnimationFrame(() => centerOn(id, 0.95));
}
// where the new names would attach: the parent's id and full chain, ready to send
function addBoxHtml(id) {
  const p = byId.get(id), line = [p, ...ancestors(id)].map(shortName).join(' بن ');
  const msg = t('tree_add_msg', { name: nameOf(p), id, chain: line });
  return `<p class="muted">${esc(t('tree_add_where'))}</p><p class="note">${esc(line)}</p><p class="mono">parent_id: ${esc(id)}</p>` +
    (CONTRIBUTE_URL ? `<a class="cta" href="${esc(contributeHref(msg))}" target="_blank" rel="noopener">${esc(t('tree_add_send'))}</a>` : `<p class="muted">${esc(t('tree_add_soon'))}</p>`) +
    `<p class="muted small">${esc(t('tree_add_moderation'))}</p>`;
}
// the gold ring around a selected or highlighted fruit is added on demand, not carried by every fruit
function ring(n) { if (n && !n.g.querySelector('.halo')) n.g.insertBefore(el('circle', { class: 'halo', r: n.r + 7 }), n.g.querySelector('.c')); return n; }
function setSelected(id) {
  if (selected) { nodeEls.get(selected)?.g.classList.remove('sel'); spineEls.get(selected)?.classList.remove('sel'); }
  selected = id; ring(nodeEls.get(id))?.g.classList.add('sel'); spineEls.get(id)?.classList.add('sel');
}
function showPanel(id) { placePanel(id); panel.classList.add('open'); }
function closePanel() { panel.classList.remove('open'); setSelected(null); }
$('ft-pClose').onclick = closePanel;
panel.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (b) { if (!b.dataset.go.startsWith('r87')) openPerson(b.dataset.go); return; }
  const th = e.target.closest('[data-doc]'); if (th) { openReader(th.dataset.of, +th.dataset.doc); return; }
  const ch = e.target.closest('[data-chain]'); if (ch) { location.hash = '#/chain/' + ch.dataset.chain; return; }
  const sh = e.target.closest('[data-share]'); if (sh) { shareChain(sh.dataset.share); return; }
  const ad = e.target.closest('[data-add]'); if (ad) { const box = ad.nextElementSibling; box.hidden = !box.hidden; if (!box.hidden) box.innerHTML = addBoxHtml(ad.dataset.add); ad.setAttribute('aria-expanded', String(!box.hidden)); }
});
// the sheet is in <body> on phones, and in the stage on desktop and in full screen
function placePanel() { const target = stage.classList.contains('fs') || !isMobile() ? stage : document.body; if (panel.parentNode !== target) target.appendChild(panel); }
mqMobile.addEventListener('change', () => { placePanel(selected); if (drawn) { draw(); fit(0); } }); placePanel(selected);

function onActivate(e) {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  const c = e.target.closest('[data-expand]'); if (c) { e.preventDefault(); hideTip(); expand(c.dataset.expand); return; }
  const ch = e.target.closest('[data-chain]'); if (ch) { e.preventDefault(); hideTip(); unfoldedChains.add(ch.dataset.chain); redraw(() => centerOn(ch.dataset.chain, Math.min(1, d3.zoomTransform(treeEl).k), 450)); return; }
  const g = e.target.closest('[data-id]'); if (!g) return;
  e.preventDefault();
  hideTip();
  const id = g.dataset.id;
  openPerson(id);
  // a finger has no hover: show the tooltip briefly once the tree has settled
  if (lastPointer === 'touch') { clearTimeout(tipTimer); tipTimer = setTimeout(() => { const n = nodeEls.get(id) || { g: spineEls.get(id) }; if (n.g) showTip(n.g); tipTimer = setTimeout(hideTip, 2500); }, 750); }
}
['click', 'keydown'].forEach(type => world.addEventListener(type, onActivate));

/* ---------- tooltip: full name and lineage line, for every fruit and plaque ---------- */
let lastPointer = 'mouse', tipTimer;
function showTip(g) {
  const p = byId.get(g.dataset.id); if (!p || !g.isConnected) return;
  tip.innerHTML = p.placeholder && chainInfo.has(p.id) ? `<b>${esc(chainLabel(chainInfo.get(p.id)))}</b><span>${esc(betweenText(chainInfo.get(p.id)))}</span>` : `<b>${esc(nameOf(p))}</b><span>${esc(nasabText(p.id))}</span>`;
  tip.hidden = false;
  const r = g.getBoundingClientRect(), h = host.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  const x = Math.max(4, Math.min(h.width - tw - 4, r.left + r.width / 2 - h.left - tw / 2));
  const y = r.top - th - 8 < 0 ? r.bottom - h.top + 8 : r.top - h.top - th - 8;
  tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
}
function hideTip() { clearTimeout(tipTimer); tip.hidden = true; }
const tipTarget = e => { const g = e.target.closest && e.target.closest('.ft-svg [data-id]'); return g && host.contains(g) ? g : null; };
host.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);
host.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const g = tipTarget(e); if (g) showTip(g); });
host.addEventListener('pointerout', e => { const g = tipTarget(e); if (g && !g.contains(e.relatedTarget)) hideTip(); });
host.addEventListener('focusin', e => { const g = tipTarget(e); if (g && g.matches(':focus-visible')) showTip(g); });
host.addEventListener('focusout', hideTip);

/* ---------- dialogs: shared focus handling ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';
function trap(dialog) {
  dialog.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = [...dialog.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
const icon = d => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = { x: 'M3 3l10 10M13 3 3 13', plus: 'M8 3v10M3 8h10', minus: 'M3 8h10', fit: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4', rot: 'M13 8a5 5 0 1 1-1.6-3.7M13 2v3h-3', prev: 'M6 3l5 5-5 5', next: 'M10 3 5 8l5 5' };

/* ---------- document reader («قارئ الوثيقة») ---------- */
const reader = document.createElement('div');
reader.className = 'ft-reader'; reader.hidden = true; reader.dir = 'rtl';
reader.setAttribute('role', 'dialog'); reader.setAttribute('aria-modal', 'true'); reader.setAttribute('aria-labelledby', 'ft-rTitle');
reader.innerHTML = `<header class="rh">
    <div class="rt"><h2 id="ft-rTitle"></h2><div class="rm" id="ft-rMeta"></div></div>
    <div class="rnav"><button type="button" id="ft-rClose">${icon(IC.x)}</button><button type="button" id="ft-rNext">${icon(IC.next)}</button><span id="ft-rCount"></span><button type="button" id="ft-rPrev">${icon(IC.prev)}</button></div>
  </header>
  <div class="rb">
    <div class="rv" id="ft-rView"><img id="ft-rImg" alt="" draggable="false">
      <div class="rtools"><button type="button" id="ft-rIn">${icon(IC.plus)}</button><button type="button" id="ft-rOut">${icon(IC.minus)}</button><button type="button" id="ft-rFit">${icon(IC.fit)}</button><button type="button" id="ft-rRot">${icon(IC.rot)}</button></div>
    </div>
    <div class="rs" id="ft-rSheet"><button type="button" class="grab" id="ft-rGrab"><i></i></button>
      <div class="tabs" role="tablist" id="ft-rTabs"></div>
      <div class="tp" id="ft-rPane" role="tabpanel" tabindex="0"></div>
    </div>
  </div>`;
document.body.appendChild(reader);
trap(reader);
const rImg = $('ft-rImg'), rView = $('ft-rView'), rPane = $('ft-rPane'), rTabs = $('ft-rTabs'), rSheet = $('ft-rSheet');
const R = { list: [], i: 0, tab: 'text', of: null, back: null };
const V = { s: 1, x: 0, y: 0, rot: 0, min: 0.1 };
function vApply() { rImg.style.transform = `translate(-50%,-50%) translate(${V.x}px,${V.y}px) rotate(${V.rot}deg) scale(${V.s})`; }
function vFit() {
  const w = rImg.naturalWidth, h = rImg.naturalHeight; if (!w) return;
  const turned = V.rot % 180 !== 0, bw = turned ? h : w, bh = turned ? w : h;
  V.s = Math.min((rView.clientWidth - 24) / bw, (rView.clientHeight - 24) / bh); V.min = V.s * 0.5; V.x = 0; V.y = 0; vApply();
}
function vZoom(f, cx, cy) {
  const r = rView.getBoundingClientRect(), px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2), py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
  const s = Math.max(V.min, Math.min(8, V.s * f)), g = s / V.s;
  V.x = px - (px - V.x) * g; V.y = py - (py - V.y) * g; V.s = s; vApply();
}
rImg.addEventListener('load', vFit);
rView.addEventListener('wheel', e => { e.preventDefault(); vZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY); }, { passive: false });
const ptrs = new Map(); let pinch = 0, lastTap = 0;
rView.addEventListener('pointerdown', e => { if (e.target.closest('.rtools')) return; rView.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
rView.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId); if (!prev) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { V.x += e.clientX - prev[0]; V.y += e.clientY - prev[1]; vApply(); }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) vZoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; }
});
const pEnd = e => { if (!ptrs.delete(e.pointerId)) return; pinch = 0; if (e.type === 'pointerup' && e.pointerType === 'touch' && !ptrs.size) { const now = Date.now(); if (now - lastTap < 300) vToggle(e.clientX, e.clientY); lastTap = now; } };
rView.addEventListener('pointerup', pEnd); rView.addEventListener('pointercancel', pEnd);
function vToggle(cx, cy) { const fitS = V.min * 2; if (V.s > fitS * 1.3) vFit(); else vZoom(2.6, cx, cy); }
rView.addEventListener('dblclick', e => { if (!e.target.closest('.rtools')) vToggle(e.clientX, e.clientY); });
$('ft-rIn').onclick = () => vZoom(1.4); $('ft-rOut').onclick = () => vZoom(1 / 1.4); $('ft-rFit').onclick = vFit;
$('ft-rRot').onclick = () => { V.rot = (V.rot + 90) % 360; vFit(); };
// phone: the text is a sheet over the image; drag its handle, or tap it to step through three heights
const SHEET = [22, 48, 82]; let sheetH = 48;
const setSheet = h => { sheetH = Math.max(14, Math.min(88, h)); reader.style.setProperty('--ft-sheet-h', sheetH + '%'); requestAnimationFrame(vFit); };
(function () {
  const grab = $('ft-rGrab'); let y0 = null, h0 = 0, moved = false;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; h0 = sheetH; moved = false; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', e => { if (y0 == null) return; const dy = e.clientY - y0; if (Math.abs(dy) > 4) moved = true; if (moved) { sheetH = Math.max(14, Math.min(88, h0 - dy / reader.clientHeight * 100)); reader.style.setProperty('--ft-sheet-h', sheetH + '%'); } });
  grab.addEventListener('pointerup', () => { if (y0 == null) return; y0 = null; if (moved) setSheet(SHEET.reduce((a, b) => Math.abs(b - sheetH) < Math.abs(a - sheetH) ? b : a)); else setSheet(SHEET[(SHEET.indexOf(SHEET.reduce((a, b) => Math.abs(b - sheetH) < Math.abs(a - sheetH) ? b : a)) + 1) % SHEET.length]); });
})();
// [؟] unclear, […] illegible, [ممزق] torn: small muted chips, explained under the text
const MARKS = [['[؟]', '؟', 'tree_mark_unclear'], ['[…]', '…', 'tree_mark_illegible'], ['[ممزق]', 'ممزق', 'tree_mark_torn']];
function transcriptHtml(s) {
  let h = esc(s);
  for (const [raw, glyph] of MARKS) h = h.split(esc(raw)).join(`<span class="mk">${glyph}</span>`);
  return h;
}
function readerTabs(it) {
  const d = it.d, e = it.e, tabs = [];
  const quote = e && e.quote ? `<div class="ql">${esc(t('tree_quote'))}</div><p class="qt">${esc(e.quote)}</p>` : '';
  if (d && d.transcription_ar) tabs.push(['text', t('tree_transcription'), `${quote}<pre class="tr" dir="rtl">${transcriptHtml(d.transcription_ar)}</pre><p class="mkl">${MARKS.map(([, g, k]) => `<span class="mk">${g}</span> ${esc(t(k))}`).join(' · ')}</p>`]);
  else if (quote) tabs.push(['text', t('tree_quote'), quote]);
  if (d && d.explain_ar) tabs.push(['explain', t('tree_explain'), `<p class="note">${esc(d.explain_ar)}</p>`]);
  // the source is given once: the credit of the record, then the owner of the original
  const src = d ? `<p class="note">${esc(d.credit || '')}</p>${d.original_owner ? `<p class="own">${esc(t('tree_owner'))} ${esc(d.original_owner)}</p>${d.original_owner_source ? `<p class="muted small">${esc(d.original_owner_source)}</p>` : ''}` : ''}` : `<p class="note">${esc((e && e.source) || '')}</p>`;
  tabs.push(['source', t('tree_source'), src]);
  const audit = d ? [['tree_orig_vs_restored', d.original_vs_restored], ['tree_caption_vs_image', d.caption_vs_image], ['tree_better_image', d.needs_better_image_reason]].filter(x => x[1]) : [];
  if (audit.length) tabs.push(['audit', t('tree_audit'), `<dl class="au">${audit.map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`]);
  return tabs;
}
function renderReader() {
  const it = R.list[R.i], d = it.d, e = it.e;
  $('ft-rTitle').textContent = it.testimony ? t('tree_legend_testimony') : (d && d.doc_type) || pageTxt(e && e.page) || t('tree_docs');
  const date = d ? [d.date_as_written, d.date_hijri && /^\d+$/.test(String(d.date_hijri)) ? `(${ahTxt(d.date_hijri)})` : ''].filter(Boolean).join(' ') : (e && e.date) || '';
  $('ft-rMeta').innerHTML = `<span class="pg">${esc(pageTxt(d ? d.page : e.page))}</span><span>${esc(date || t('tree_no_date'))}</span>${d ? dotsHtml(d.legibility, t('tree_legibility')) : dotsHtml(e && e.confidence, t('tree_confidence'))}${d && d.needs_better_image ? `<span class="bd need">${esc(t('tree_needs_image'))}</span>` : ''}`;
  $('ft-rCount').textContent = `${R.i + 1} / ${R.list.length}`;
  $('ft-rPrev').disabled = R.i === 0; $('ft-rNext').disabled = R.i === R.list.length - 1;
  const src = asset(it.src);
  if (rImg.getAttribute('src') !== src) { V.rot = 0; rImg.removeAttribute('src'); rImg.src = src; rImg.alt = `${t('tree_img_alt')} ${pageTxt(d ? d.page : e.page)}`; }
  const tabs = readerTabs(it); if (!tabs.some(x => x[0] === R.tab)) R.tab = tabs[0][0];
  rTabs.innerHTML = tabs.map(([k, label]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === R.tab}" tabindex="${k === R.tab ? 0 : -1}">${esc(label)}</button>`).join('');
  rPane.innerHTML = tabs.find(x => x[0] === R.tab)[2]; rPane.scrollTop = 0;
  [['ft-rPrev', 'tree_prev_doc'], ['ft-rNext', 'tree_next_doc'], ['ft-rClose', 'tree_close'], ['ft-rIn', 'tree_zoom_in'], ['ft-rOut', 'tree_zoom_out'], ['ft-rFit', 'tree_fit_image'], ['ft-rRot', 'tree_rotate'], ['ft-rGrab', 'tree_sheet_handle']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
}
function openReader(personId, index) {
  const list = docsOf(personId).items; if (!list.length) return;
  R.list = list; R.i = Math.max(0, Math.min(list.length - 1, index || 0)); R.of = personId; R.back = document.activeElement;
  reader.hidden = false; document.documentElement.classList.add('ft-noscroll');
  renderReader(); requestAnimationFrame(() => { vFit(); $('ft-rClose').focus(); });
}
function closeReader() { if (reader.hidden) return; reader.hidden = true; rImg.removeAttribute('src'); if (chainEl.hidden && !stage.classList.contains('fs')) document.documentElement.classList.remove('ft-noscroll'); if (R.back && R.back.isConnected) R.back.focus(); }
const stepReader = n => { const i = R.i + n; if (i >= 0 && i < R.list.length) { R.i = i; renderReader(); } };
$('ft-rClose').onclick = closeReader; $('ft-rPrev').onclick = () => stepReader(-1); $('ft-rNext').onclick = () => stepReader(1);
rTabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { R.tab = b.dataset.tab; renderReader(); rTabs.querySelector('[aria-selected="true"]').focus(); } });
reader.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); closeReader(); }
  // the list reads right to left: the left arrow goes on to the next document
  else if (e.key === 'ArrowLeft' && !e.target.closest('[role=tab]')) stepReader(1);
  else if (e.key === 'ArrowRight' && !e.target.closest('[role=tab]')) stepReader(-1);
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.closest('[role=tab]')) { const bs = [...rTabs.querySelectorAll('[role=tab]')], i = bs.indexOf(e.target.closest('[role=tab]')), j = (i + (e.key === 'ArrowLeft' ? 1 : -1) + bs.length) % bs.length; R.tab = bs[j].dataset.tab; renderReader(); rTabs.querySelector('[aria-selected="true"]').focus(); }
});
window.addEventListener('resize', () => { if (!reader.hidden) vFit(); });

/* ---------- «سلسلة نسبي بالأدلة»: the chain from a person down to عبد الله سبال العين ---------- */
const chainEl = document.createElement('div');
chainEl.className = 'ft-chain'; chainEl.hidden = true; chainEl.dir = 'rtl';
chainEl.setAttribute('role', 'dialog'); chainEl.setAttribute('aria-modal', 'true'); chainEl.setAttribute('aria-labelledby', 'ft-cTitle');
chainEl.innerHTML = `<header class="ch"><div><h2 id="ft-cTitle"></h2><p id="ft-cSum"></p></div><button type="button" id="ft-cShare" class="share"></button><button type="button" id="ft-cClose">${icon(IC.x)}</button></header><p class="nasab" id="ft-cNasab"></p><ol class="cl" id="ft-cList"></ol>`;
document.body.appendChild(chainEl);
trap(chainEl);
let chainId = null, chainIO = null, chainPushed = false;
// «19 جيلاً · 8 منها موثّق بوثائق · …»: every link to a father, counted by its source
function chainSummary(line) {
  const c = { ok: 0, maybe: 0, civil: 0, author: 0, trad: 0 }; line.forEach(x => { if (!x.placeholder && x.father_id && byId.has(x.father_id)) c[countKey(x)]++; });
  return [t(line.some(x => x.placeholder) ? 'tree_chain_n_est' : 'tree_chain_n', { n: line.length }), t('tree_chain_ok', { n: c.ok }), ...['maybe', 'civil', 'author', 'trad'].map(k => c[k] ? t('tree_chain_' + k, { n: c[k] }) : '')].filter(Boolean).join(' · ');
}
function renderChain(id) {
  const p = byId.get(id); if (!p) return false;
  const line = [p, ...ancestors(id)];   // down to the oldest known ancestor
  $('ft-cTitle').textContent = t('tree_chain_title');
  $('ft-cSum').textContent = chainSummary(line);
  $('ft-cNasab').textContent = nasabText(id);
  $('ft-cShare').textContent = t('tree_share_chain');
  $('ft-cClose').setAttribute('aria-label', t('tree_close'));
  // a run of unknown ancestors is one card
  const cards = [];
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    if (x.placeholder) { let n = 1; while (line[i + 1] && line[i + 1].placeholder) { n++; i++; } cards.push({ ph: true, n, x }); } else cards.push({ x });
  }
  $('ft-cList').innerHTML = cards.map((cd, i) => {
    const x = cd.x, last = i === cards.length - 1;
    if (cd.ph) { const es = x.estimate || {}; return `<li class="cc ph"><div class="card"><b class="nm">${esc(t('tree_unknown_chain', { n: cd.n }))}${es.min != null ? ` <span class="muted">${esc(t('tree_unknown_range', { min: es.min, max: es.max }))}</span>` : ''}</b>${es.basis ? `<p class="basis">${esc(es.basis)}</p>` : ''}</div><i class="ln trad"></i></li>`; }
    const D = x.living ? { thumbs: [], count: 0 } : docsOf(x.id), k = stKey(x.status);
    const thumbs = D.thumbs.slice(0, 5).map(th => `<button type="button" class="th" data-doc="${th.i}" data-of="${esc(x.id)}" aria-label="${esc(t('tree_open_doc'))}: ${esc(pageTxt(th.it.d ? th.it.d.page : th.it.e.page))}"><img src="${esc(asset(th.it.src))}" alt="" loading="lazy" decoding="async" width="60" height="76"></button>`).join('') + (D.thumbs.length > 5 ? `<span class="more">+${D.thumbs.length - 5}</span>` : '');
    return `<li class="cc${x.id === ROOT ? ' root' : ''}"><div class="card"><span class="gen">${esc(genText(x))}</span><b class="nm">${esc(x.id === CONFIG.spine[0] ? CONFIG.plaqueAli : nameOf(x))}</b>${thumbs ? `<div class="strip">${thumbs}</div>` : ''}</div>${last ? '' : `<i class="ln ${k}"></i><span class="lb">${(srcKey(x.status) === 'trad' ? [t('tree_link_trad_short')] : linkLabels(x)).map(l => `<span>${esc(l)}</span>`).join('')}</span>`}</li>`;
  }).join('');
  if (chainIO) chainIO.disconnect();
  const items = [...chainEl.querySelectorAll('.cc')];
  if (reduced || !('IntersectionObserver' in window)) items.forEach(li => li.classList.add('in'));
  else { chainIO = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); chainIO.unobserve(en.target); } }), { root: chainEl, rootMargin: '0px 0px -12% 0px' }); items.forEach(li => chainIO.observe(li)); }
  return true;
}
function openChain(id) {
  if (!renderChain(id)) return;
  chainId = id; chainEl.hidden = false; chainEl.scrollTop = 0; document.documentElement.classList.add('ft-noscroll', 'ft-chain-open');
  requestAnimationFrame(() => $('ft-cClose').focus());
}
function closeChain() { if (chainEl.hidden) return; chainEl.hidden = true; chainId = null; document.documentElement.classList.remove('ft-chain-open'); if (!stage.classList.contains('fs')) document.documentElement.classList.remove('ft-noscroll'); }
// Back closes the chain: it is opened by setting the hash, and closed by going back to where it was opened from
$('ft-cClose').onclick = () => { if (chainPushed) history.back(); else { history.replaceState(null, '', location.pathname + location.search); closeChain(); } };
chainEl.addEventListener('click', e => { const th = e.target.closest('[data-doc]'); if (th) openReader(th.dataset.of, +th.dataset.doc); });
chainEl.addEventListener('keydown', e => { if (e.key === 'Escape' && reader.hidden) $('ft-cClose').click(); });

/* ---------- share my chain: a picture drawn here in the page, and a line of text. Nothing leaves the page but what the reader sends. ---------- */
const SHARE_W = 1080, SHARE_H = 1350, SITE_URL = 'https://jamalibnadam.com/';
const loadImage = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
function wrapLines(ctx, text, maxWidth) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) { const next = line ? line + ' ' + word : word; if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}
async function shareCanvas(id) {
  const p = byId.get(id), line = [p, ...ancestors(id)];
  const nameFont = 'Amiri, serif', uiFont = '"Noto Kufi Arabic", sans-serif';
  if (document.fonts) { await Promise.all(['700 64px Amiri', '400 40px Amiri', '500 30px "Noto Kufi Arabic"'].map(f => document.fonts.load(f, 'السجل الذهبي 19').catch(() => { }))); await document.fonts.ready; }
  const cv = document.createElement('canvas'); cv.width = SHARE_W; cv.height = SHARE_H;
  const ctx = cv.getContext('2d'), gold = '#d4af37', ink = '#e8e4da', ink2 = '#a9a596', cx = SHARE_W / 2;
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#121614'; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.strokeRect(34, 34, SHARE_W - 68, SHARE_H - 68);       // a thin gold double frame
  ctx.lineWidth = 1.5; ctx.strokeRect(50, 50, SHARE_W - 100, SHARE_H - 100);
  try { const logo = await loadImage(asset('logo.webp')), r = 70; ctx.save(); ctx.beginPath(); ctx.arc(cx, 160, r, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(logo, cx - r, 160 - r, 2 * r, 2 * r); ctx.restore(); ctx.beginPath(); ctx.arc(cx, 160, r + 3, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke(); } catch (e) { /* the picture is drawn without the logo */ }
  ctx.fillStyle = gold; ctx.font = `700 54px ${nameFont}`; ctx.fillText(t('tree_h1'), cx, 318);
  ctx.beginPath(); ctx.moveTo(cx - 150, 356); ctx.lineTo(cx + 150, 356); ctx.lineWidth = 1.5; ctx.stroke();
  // the name, large; shrunk only if it is wider than the frame
  let size = 84; ctx.fillStyle = ink; do { ctx.font = `700 ${size}px ${nameFont}`; size -= 4; } while (ctx.measureText(nameOf(p)).width > SHARE_W - 200 && size > 40);
  ctx.fillText(nameOf(p), cx, 478);
  // the whole lineage, wrapped and centred: the font is shrunk until it fits the space; nothing is cut
  const text = nasabText(id), top = 560, bottom = 1085; let fs = 50, lines, lh;
  do { ctx.font = `400 ${fs}px ${nameFont}`; lines = wrapLines(ctx, text, SHARE_W - 220); lh = fs * 1.75; fs -= 2; } while (lines.length * lh > bottom - top && fs > 18);
  ctx.fillStyle = ink; lines.forEach((l, i) => ctx.fillText(l, cx, top + (bottom - top - lines.length * lh) / 2 + lh * (i + 0.72)));
  // the same counts as the chain's header
  ctx.fillStyle = gold; let ss = 32, sum = chainSummary(line), sl; do { ctx.font = `500 ${ss}px ${uiFont}`; sl = wrapLines(ctx, sum, SHARE_W - 200); ss -= 2; } while (sl.length > 2 && ss > 18);
  sl.forEach((l, i) => ctx.fillText(l, cx, 1160 + i * (ss + 2) * 1.7));
  ctx.fillStyle = ink2; ctx.direction = 'ltr'; ctx.font = `500 30px ${uiFont}`; ctx.fillText('jamalibnadam.com', cx, 1274);
  return cv;
}
const shareUrl = id => `${SITE_URL}tree/#/chain/${id}`;
const shareText = id => t('tree_share_text', { name: nameOf(byId.get(id)), line: nasabText(id), site: t('tree_h1'), url: shareUrl(id) });
const shareBox = document.createElement('dialog');
shareBox.className = 'ft-share'; shareBox.dir = 'rtl';
document.body.appendChild(shareBox);
shareBox.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });   // Escape closes this box only
shareBox.addEventListener('click', async e => {
  if (e.target === shareBox || e.target.closest('[data-x]')) { shareBox.close(); return; }
  if (e.target.closest('[data-copy]')) {
    const url = shareBox.dataset.url; let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (err) {
      const f = document.createElement('textarea'); f.value = url; f.setAttribute('readonly', ''); f.style.cssText = 'position: fixed; top: 0; opacity: 0;'; shareBox.appendChild(f); f.select();
      try { ok = document.execCommand('copy'); } catch (err2) { ok = false; } f.remove();
    }
    if (ok) shareBox.querySelector('.done').hidden = false;
  }
});
async function shareChain(id) {
  if (!byId.has(id)) return;
  const cv = await shareCanvas(id), text = shareText(id), url = shareUrl(id);
  const blob = await new Promise(resolve => cv.toBlob(resolve, 'image/png'));
  const file = blob && typeof File === 'function' ? new File([blob], 'nasab.png', { type: 'image/png' }) : null;
  // phones: the system's own share sheet (WhatsApp and the other apps), with the picture
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  // elsewhere: WhatsApp with the text, the picture to save, or the link to copy
  const data = cv.toDataURL('image/png');
  shareBox.dataset.url = url;
  shareBox.innerHTML = `<header><h2>${esc(t('tree_share_chain'))}</h2><button type="button" data-x aria-label="${esc(t('tree_close'))}">${icon(IC.x)}</button></header>
<img src="${data}" alt="${esc(text)}" width="216" height="270">
<div class="acts"><a class="b wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${esc(t('tree_share_wa'))}</a><a class="b" href="${data}" download="nasab-${esc(id)}.png">${esc(t('tree_share_dl'))}</a><button type="button" class="b" data-copy>${esc(t('tree_share_copy'))}</button></div>
<p class="done" role="status" hidden>${esc(t('share_success'))}</p>`;
  if (typeof shareBox.showModal === 'function') shareBox.showModal(); else shareBox.setAttribute('open', '');
}
$('ft-cShare').onclick = () => { if (chainId) shareChain(chainId); };

/* ---------- routes ---------- */
let booted = false;
function onHash() {
  const h = location.hash, c = /^#\/chain\/([\w-]+)$/.exec(h), b = /^#\/b\/([\w-]+)$/.exec(h);
  if (c && byId.has(c[1])) { chainPushed = booted; openChain(c[1]); return true; }
  closeChain();
  // from the home page: a person, a document, or a name typed into its search box
  const p = /^#\/p\/([\w-]+)$/.exec(h), d = /^#\/d\/([\w-]+)\/(\d+)$/.exec(h), s = /^#\/q\/(.+)$/.exec(h);
  if (p && byId.has(p[1])) { openPerson(p[1]); return true; }
  if (d) {
    const rec = (docsByImage.get(d[1]) || []).find(x => String(x.doc_index) === d[2]) || (docsByImage.get(d[1]) || [])[0];
    const owner = rec && ((rec.persons || []).map(x => x.tree_id).find(id => id && byId.has(id)) || persons.find(x => (x.evidence || []).some(e => imageId(e.image) === d[1]))?.id);
    if (owner) { openPerson(owner, { center: false }); const i = docsOf(owner).items.findIndex(it => it.d === rec); openReader(owner, Math.max(0, i)); return true; }
    return false;
  }
  if (s) { let text = s[1]; try { text = decodeURIComponent(text); } catch (e) { /* keep as typed */ } stage.scrollIntoView({ block: 'nearest' }); q.value = text; q.dispatchEvent(new Event('input')); q.focus(); return true; }
  return b ? focusBranch(b[1]) : false;
}
window.addEventListener('hashchange', () => { closeReader(); onHash(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && reader.hidden && chainEl.hidden) { if (stage.classList.contains('fs')) setFull(false); else if (panel.classList.contains('open')) closePanel(); } });

/* ---------- search ---------- */
// aliases (other names a person is known by) are for searching only: they are never shown as the name
const index = persons.filter(searchable).map(p => ({ id: p.id, n: norm([p.name_as_written, p.short_name || '', ...(p.aliases || [])].join(' ')), p }));
/* A chain is revealed only for a three-part name: one's own name, the father's and the grandfather's («جمال عمر أحمد»).
   Names are compared word by word after folding: no tashkeel, أ/إ/آ → ا, ى → ي, ة → ه (norm), no «بن / ابن / بنت», no titles,
   and «عبد الله» = «عبدالله», «أبي بكر» = «أبو بكر» (each is one word). */
const nameWords = s => norm(s).replace(/(^| )(بن|ابن|بنت|ابنه)(?= |$)/g, ' ').replace(/(^| )(الحاج|الشيخ|الفقيه|المرابط|سيدي)(?= )/g, ' ')
  .replace(/(^| )(ابي|ابا)(?= )/g, '$1ابو').replace(/(^| )(عبد|ابو) +/g, '$1$2').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
const coreKey = p => nameWords(shortNameOf(p.name_as_written || ''))[0] || '';   // the person's own name: nothing in brackets, nothing after «بن»
const keysOf = new Map(persons.map(p => [p.id, new Set(p.placeholder ? [] : [coreKey(p), ...(p.aliases || []).map(a => nameWords(a)[0] || '')].filter(Boolean))]));   // the name, and any alias
// word 1 is the person, word 2 the father, word 3 the grandfather; any further word goes on up the line
function matchesLine(p, words) {
  let x = p;
  for (const w of words) { if (!x || !keysOf.get(x.id).has(w)) return false; x = byId.get(x.father_id); }
  return true;
}
let hits = [], cursor = 0, fullMatch = false, wordCount = 0;
// a name that is not in the tree yet: an invitation to send it; the button opens the contact form with the typed text in the message
function notFoundHtml() {
  const msg = t('tree_nf_msg', { q: q.value.trim() });
  return `<li class="empty nf"><p>${esc(t('tree_nf_text'))}</p><a class="nf-btn" href="../more/?msg=${encodeURIComponent(msg)}#contact">${esc(t('tree_nf_btn'))}</a></li>`;
}
function renderHits() {
  // the full chain is written only under a three-part match; otherwise the name and its generation
  const list = hits.map((h, i) => `<li role="option" id="ft-opt${i}" aria-selected="${i === cursor}" data-go="${esc(h.id)}"><span class="rn">${esc(h.p.name_as_written)}</span><span class="rm">${esc(fullMatch ? nasabText(h.id) : genText(h.p))}</span></li>`).join('');
  const hint = `<li class="empty hint">${esc(t('tree_search_hint'))}</li>`;
  results.innerHTML = fullMatch ? list : wordCount < 3 ? list + hint : list || notFoundHtml();
  results.hidden = false; q.setAttribute('aria-expanded', 'true');
}
q.addEventListener('input', () => {
  const s = norm(q.value);
  if (!s) { results.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  const toks = s.split(' '), words = nameWords(q.value);
  wordCount = words.length;
  // three words or more: the persons whose own name, father and grandfather are these words
  hits = wordCount >= 3 ? index.filter(x => matchesLine(x.p, words)).slice(0, 10) : [];
  fullMatch = hits.length > 0;
  // otherwise, for research: those who have died can be found by any part of the name. The living appear only on a three-part match.
  if (!fullMatch) hits = index.filter(x => !x.p.living && toks.every(tok => x.n.includes(tok))).sort((a, b) => (a.n.startsWith(s) ? 0 : 1) - (b.n.startsWith(s) ? 0 : 1) || a.n.length - b.n.length).slice(0, 10);
  cursor = 0; renderHits();
});
q.addEventListener('keydown', e => {
  if (results.hidden || !hits.length) return;
  if (e.key === 'ArrowDown') { cursor = (cursor + 1) % hits.length; renderHits(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cursor = (cursor - 1 + hits.length) % hits.length; renderHits(); e.preventDefault(); }
  else if (e.key === 'Enter') { choose(hits[cursor].id); e.preventDefault(); }
  else if (e.key === 'Escape') { results.hidden = true; }
});
results.addEventListener('mousedown', e => {
  const li = e.target.closest('[data-go]'); if (li) { e.preventDefault(); choose(li.dataset.go); return; }
  if (e.target.closest('.nf')) e.preventDefault();   // keep the box open while the invitation is read
});
q.addEventListener('blur', () => setTimeout(() => { results.hidden = true; q.setAttribute('aria-expanded', 'false'); }, 120));
function choose(id) {
  results.hidden = true; q.blur();
  openPerson(id, { center: false });
  const n = ring(nodeEls.get(id));
  if (n) { n.g.classList.remove('hit'); void n.g.getBBox(); n.g.classList.add('hit'); setTimeout(() => n.g.classList.remove('hit'), 3400); }
  requestAnimationFrame(() => centerOn(id, n ? 1.2 : 0.95, 700));
}

/* ---------- legend and header numbers ---------- */
function drawLegend() {
  // no line samples: every line is solid, and the source of each name is written in its card
  const items = ['tree_legend_doc', 'tree_link_civil', 'tree_link_maybe', 'tree_legend_testimony', 'tree_link_trad', 'tree_link_author', 'tree_legend_unknown'];
  $('ft-legend-body').innerHTML = `<p class="lead">${esc(t('tree_legend_intro'))}</p><ul>${items.map(k => `<li><b>${esc(t(k))}</b></li>`).join('')}</ul>` +
    `<p class="say">${esc(t('tree_legend_say'))}</p><a class="how" href="../more/#methods">${esc(t('methods_h'))}</a><div class="hint">${esc(t('tree_legend_hint'))}</div>`;
}
// every number comes from the data
function drawStats() {
  const dated = docs.map(d => Number(d.date_hijri)).filter(n => Number.isFinite(n) && n > 0);
  ['ft-st-persons', 'ft-st-docs', 'ft-st-oldest'].forEach(id => $(id).classList.remove('wait'));
  $('ft-st-persons').textContent = persons.filter(p => !p.placeholder).length;
  $('ft-st-docs').textContent = docs.length;
  $('ft-st-oldest').textContent = dated.length ? ahTxt(Math.min(...dated)) : '—';
}

/* ---------- boot ---------- */
let drawn = false, fitted = false, lastW = 0, lastH = 0;
function render() {
  if (!hasStrings()) return;
  draw(); drawn = true; sizeStage();
  if (!fitted && visible()) { fit(0); fitted = true; lastW = stage.clientWidth; lastH = stage.clientHeight; requestAnimationFrame(() => { onHash(); booted = true; }); }
  if (selected && panel.classList.contains('open')) openPerson(selected, { center: false });
  if (chainId) renderChain(chainId);
  if (!reader.hidden) renderReader();
}
render();
// page.js sets <html lang> after it has loaded data/data_<lang>.js: draw then, and redraw on every language switch
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
// the names are measured with the web fonts, which load late
if (document.fonts) {
  let ft; const refit = () => { clearTimeout(ft); ft = setTimeout(() => { if (drawn) fitLabels(); }, 60); };
  if (document.fonts.ready) document.fonts.ready.then(refit);
  document.fonts.addEventListener?.('loadingdone', refit);
}
// refit when the stage changes size (window resize, phone rotation, full screen); the selection is kept
let rt;
new ResizeObserver(() => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (!visible() || !drawn) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (fitted && W === lastW && H === lastH) return;
    const first = !fitted;
    lastW = W; lastH = H; fitted = true;
    maybeRotateHint();
    if (selected && panel.classList.contains('open')) centerOn(selected, d3.zoomTransform(treeEl).k, 0); else fit(0);
    if (first) requestAnimationFrame(() => { onHash(); booted = true; });
  }, 150);
}).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(sizeStage, 250));
window.addEventListener('resize', () => { clearTimeout(rt); sizeStage(); });

window.__ftree = { shareCanvas, shareText, shareChain, openPerson, centerOn, fit, focusBranch, showAll, foldAll, expand, openReader, zoomTo: tr => svg.call(zoom.transform, tr), get fan() { return fan; }, count: () => persons.filter(p => !p.placeholder).length, drawnCount: () => new Set([...host.querySelectorAll('.ft-svg [data-id]')].map(e => e.dataset.id).filter(id => !id.startsWith('r87_'))).size };
}

/* ---------- load ---------- */
const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
// a same-origin test file can stand in for tree.json: /tree/?data=<path>.json (used for the 2,000-name performance test)
const override = new URLSearchParams(location.search).get('data');
const treeUrl = override && /^[\w./-]+\.json$/.test(override) && !override.includes('..') ? asset(override) : asset('data/tree.json');
Promise.all([getJSON(treeUrl), getJSON(asset('data/docs.json'))])
  .then(([tree, docs]) => init(Array.isArray(tree) ? tree : (tree.persons || []), Array.isArray(docs) ? docs : []))
  .catch(err => {
    console.error('Family tree failed to load', err);
    const box = document.createElement('div');
    box.className = 'ft-error';
    box.textContent = t('tree_load_error');
    $('ft-stage').appendChild(box);
  });
})();
