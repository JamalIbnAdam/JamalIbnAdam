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
    uthamna: { floats: ['ath_m', 'a_aqd_father_uthman'] },
    abdulwahid: { floats: ['yahmad'] }
  }
};
const SLOT = { med: 0, hm: 150, fd: 238, umar: 336, tulip: 462, ali: 604, note: 702 };
const MED_R = 74;

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
const total = new Map();   // all descendants, folded or not
(function count(list) { for (const p of list) if (!total.has(p.id)) (function c(id, seen) { if (seen.has(id)) return 0; seen.add(id); let n = 0; for (const k of kids.get(id)) n += 1 + c(k, seen); total.set(id, n); return n; })(p.id, new Set()); })(persons);

// a hidden person keeps the node, so descendants keep their chain, but not the name
const nameOf = p => p.placeholder ? '؟' : p.hidden ? t('tree_hidden_name') : p.name_as_written;
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
      if (!use.length) items.push({ img, src: e.image, e, d: null });
      else use.forEach(d => items.push({ img, src: e.image, e, d }));
    }
    for (const d of docsByPerson.get(id) || []) {
      if (seen.has(d.image_id) && !items.some(it => it.d === d)) continue;
      if (items.some(it => it.d === d)) continue;
      items.push({ img: d.image_id, src: `assets/evidence/${d.image_id}.webp`, e: null, d });
    }
  }
  const thumbs = []; items.forEach((it, i) => { if (!thumbs.some(th => th.img === it.img)) thumbs.push({ img: it.img, i, it }); });
  const out = { items, bare, thumbs, count: thumbs.length + bare.length };
  docCache.set(id, out); return out;
}
// «📄 N وثائق» / «قرينة من الوثائق» / «رواية الأسرة»: the evidence for the link to the father, as a neutral fact
function docsLabel(n) { return n <= 1 ? t('tree_docs_1') : n === 2 ? t('tree_docs_2') : n <= 10 ? t('tree_docs_few', { n }) : t('tree_docs_many', { n }); }
function linkLabel(p) { const k = stKey(p.status); return k === 'ok' ? docsLabel(docsOf(p.id).count) : k === 'maybe' ? t('tree_link_maybe') : t('tree_link_trad'); }
const linkExplain = p => t('tree_explain_' + stKey(p.status));

/* ---------- what is unfolded ---------- */
const ROOT = CONFIG.fanRoot;
const open = new Set();   // names whose children are drawn
function openBelow(id, depth = CONFIG.openDepth) { if (depth <= 0 || !kids.has(id)) return; open.add(id); for (const c of kids.get(id)) openBelow(c, depth - 1); }
function openPathTo(id) { let p = byId.get(id), guard = 0; while (p && p.father_id && guard++ < 200) { open.add(p.father_id); p = byId.get(p.father_id); } }
function resetOpen() { open.clear(); openBelow(ROOT); }
const vkids = id => open.has(id) ? kids.get(id) : [];
resetOpen();

/* ---------- fan layout: generations above the medallion ---------- */
let fan = new Map();     // id -> {d, a, r, x, y, nr, W}
let descN = new Map(), BASE = 300, fanBox = { x0: 0, x1: 0, y0: 0, y1: 0 };
const nodeR = d => d <= 1 ? 42 : d === 2 ? 38 : 30;
const need = d => 2 * nodeR(d) + 12;
const GAP = 78;
const A = CONFIG.fanDeg * Math.PI / 180;
const ringR = (base, d) => d <= 0 ? 0 : d === 1 ? Math.max(210, base * 0.36) : d === 2 ? Math.max(330, base * 0.66) : Math.max(330 + (d - 2) * GAP, base + (d - 3) * GAP);
function layout() {
  const widths = base => {
    const W = new Map(), seen = new Set();
    (function w(id, d) {
      seen.add(id);
      let s = 0; for (const c of vkids(id)) if (!seen.has(c)) s += w(c, d + 1);
      const v = Math.max(d > 0 ? need(d) / ringR(base, d) : 0, s);
      W.set(id, v); return v;
    })(ROOT, 0);
    return W;
  };
  let lo = 300, hi = 60000;
  if (widths(lo).get(ROOT) <= A) hi = lo;
  else for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (widths(m).get(ROOT) <= A) hi = m; else lo = m; }
  BASE = hi; const Wf = widths(BASE);
  fan = new Map(); descN = new Map();
  (function place(id, d, a0) {
    const w = Wf.get(id), a = a0 - w / 2, r = ringR(BASE, d);
    fan.set(id, { d, a, r, W: w, nr: d === 0 ? MED_R : nodeR(d), x: d === 0 ? 0 : r * Math.sin(a), y: d === 0 ? 0 : -r * Math.cos(a) });
    const ks = vkids(id).filter(c => Wf.has(c));
    let s = ks.reduce((sum, c) => sum + Wf.get(c), 0), cur = a0 - (w - s) / 2, n = 1;
    for (const c of ks) { n += place(c, d + 1, cur); cur -= Wf.get(c); }
    descN.set(id, n); return n;
  })(ROOT, 0, Math.min(A, Wf.get(ROOT)) / 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of fan.values()) { x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); }
  fanBox = { x0, x1, y0, y1 };
}

/* ---------- unattached branches: small upward trees ---------- */
const inFan = new Set(); (function walk(id) { inFan.add(id); kids.get(id).forEach(walk); })(ROOT);
const placed = new Set([...inFan, ...CONFIG.spine]);
const floatRoots = persons.filter(p => !placed.has(p.id) && !(p.father_id && byId.has(p.father_id))).map(p => p.id);
// anything still unreachable (e.g. a cycle) becomes its own root
const reach = new Set(placed);
const mark = id => { reach.add(id); kids.get(id).forEach(c => !reach.has(c) && mark(c)); };
floatRoots.forEach(mark);
persons.forEach(p => { if (!reach.has(p.id)) { floatRoots.push(p.id); mark(p.id); } });
const FS = 72, FL = 90, FR = 28;
const ftrees = floatRoots.map(rid => {
  let slot = 0, maxL = 0; const local = new Map();
  (function lay(id, l) {
    maxL = Math.max(maxL, l);
    const ks = kids.get(id).filter(c => !placed.has(c) && !local.has(c));
    let x;
    if (!ks.length) x = slot++ * FS;
    else { const xs = ks.map(c => (lay(c, l + 1), local.get(c).x)); x = (xs[0] + xs[xs.length - 1]) / 2; }
    local.set(id, { x, l });
    return x;
  })(rid, 0);
  return { rid, local, w: Math.max(1, slot) * FS, h: maxL };
});
const ali = byId.get(CONFIG.spine[0]), umar = byId.get(CONFIG.spine[1]), abd = byId.get(CONFIG.spine[2]);

/* ---------- dom ---------- */
const stage = $('ft-stage'), treeEl = $('ft-tree'), world = $('ft-world'), panel = $('ft-panel');
const pName = $('ft-pName'), pEyebrow = $('ft-pEyebrow'), pLine = $('ft-pLine'), pBadges = $('ft-pBadges'), pBody = $('ft-pBody');
const q = $('ft-q'), results = $('ft-results'), t87 = $('ft-t1987');
const floats = $('ft-floats'), fcards = $('ft-fcards'), legendEl = $('ft-legend'), tip = $('ft-tip');
legendEl.open = window.innerWidth >= 1024;   // a chip on small screens, open on desktop

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
let L = {}, nodeEls = new Map(), spineEls = new Map(), flo = new Set(), keyLabels = [];
let selected = null, currentK = 1, grown = false;

// the branch from a father to a child: [start, control, control, end]
function edgePts(pid, cid) {
  const p = fan.get(pid), c = fan.get(cid);
  if (p.d === 0) {
    const sa = Math.max(-0.9, Math.min(0.9, c.a * 0.5));
    return [pt(MED_R - 6, sa), pt(c.r * 0.45, sa * 0.6), pt(c.r * 0.7, c.a), [c.x, c.y]];
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
// one ink for every branch; only the line style says how the link to the father is known
function drawEdge(d, status, w, parent) {
  const k = stKey(status), a = { class: `edge ${k}`, d, 'stroke-width': f1(w) };
  if (k === 'ok') a.pathLength = 1;
  else if (k === 'maybe') a['stroke-dasharray'] = `${f1(Math.max(7, w * 1.7))} ${f1(Math.max(5, w * 1.2))}`;
  else a['stroke-dasharray'] = `0.1 ${f1(Math.max(5, w * 1.9))}`;
  return el('path', a, parent);
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
  L = {}; nodeEls = new Map(); spineEls = new Map(); flo = new Set();
  ['edges', 'leaves', 'trunk', 'nodes', 'chips', 'spine', 'klabs'].forEach(n => L[n] = el('g', { class: 'L-' + n }, world));

  /* branches, thickest first, each with its sparse leaves (about one for every three names) */
  const leafy = new Set([...fan.keys()].filter(id => id !== ROOT).sort((a, b) => seed(a) - seed(b)).filter((id, i) => i % 3 === 0));
  [...fan.keys()].filter(id => id !== ROOT).sort((a, b) => total.get(b) - total.get(a)).forEach(id => {
    const p = byId.get(id), P = edgePts(p.father_id, id);
    drawEdge(pathD(P), p.status, edgeW(total.get(id)), L.edges);
    const h = seed(id);
    if (leafy.has(id)) {
      const u = 0.42 + (h >>> 3) % 30 / 100, [x, y, ang] = bez(P, u), side = (h >>> 9) & 1 ? 1 : -1;
      sprig((h >>> 5) % 3, x, y, ang + side * (0.75 + ((h >>> 12) % 50) / 100), 20 + (h >>> 18) % 9, L.leaves);
    }
  });

  /* fruits */
  for (const [id, f] of fan) {
    if (id === ROOT) continue;
    const P = edgePts(byId.get(id).father_id, id);
    makeNode(id, f.x, f.y, f.nr, L.nodes, Math.atan2(P[2][1] - P[3][1], P[2][0] - P[3][0]));
  }

  /* folded generations: a «+N» chip just beyond the name; the branch stays open-ended */
  for (const [id, f] of fan) {
    if (id === ROOT || open.has(id) || !kids.get(id).length) continue;
    const n = total.get(id), text = '+' + n, w = measure(text, `700 13px ${uiFont}`) + 16;
    const ux = Math.sin(f.a), uy = -Math.cos(f.a), d = f.nr + 9 + Math.abs(ux) * w / 2 + Math.abs(uy) * 11;
    const g = el('g', { class: 'chip', transform: `translate(${f1(f.x + ux * d)},${f1(f.y + uy * d)})`, tabindex: '0', role: 'button', 'data-expand': id, 'aria-label': t('tree_expand_n', { n, name: nameOf(byId.get(id)) }) }, L.chips);
    el('rect', { x: f1(-w / 2), y: -11, width: f1(w), height: 22, rx: 11 }, g);
    el('text', { x: 0, y: 1 }, g).textContent = text;
  }

  /* unknown ancestors: one label over each run of «؟» fruits */
  for (const [id, f] of fan) {
    const p = byId.get(id), fa = byId.get(p.father_id);
    if (!p.placeholder || (fa && fa.placeholder)) continue;
    let n = 1, c = p; while (vkids(c.id).length === 1 && byId.get(vkids(c.id)[0]).placeholder) { c = byId.get(vkids(c.id)[0]); n++; }
    const es = p.estimate || {};
    el('text', { class: 'phlab', x: f1(f.x), y: f1(f.y - f.nr - 12) }, L.chips).textContent = t('tree_unknown_chain', { n }) + (es.min != null ? ' ' + t('tree_unknown_range', { min: es.min, max: es.max }) : '');
  }

  /* trunk, roots, leaves, laurel */
  (function drawTrunk() {
    const T = L.trunk, base = SLOT.note - 30;
    // roots: tendrils fading into the ground
    [[-1, 150, 46], [1, 150, 46], [-1, 92, 70], [1, 92, 70], [-1, 40, 60], [1, 40, 60]].forEach(([sgn, dx, dy], i) => {
      el('path', { class: 'root-line', 'stroke-width': i < 2 ? 9 : 6, d: `M${sgn * 40},${base - 30} Q${sgn * (dx * 0.6)},${base + dy * 0.2} ${sgn * dx},${base + dy}` }, T);
    });
    el('path', { class: 'trunk', d: `M-48,-10 C-52,180 -58,420 -62,${base - 70} C-66,${base - 25} -95,${base - 4} -150,${base + 8} L150,${base + 8} C95,${base - 4} 66,${base - 25} 62,${base - 70} C58,420 52,180 48,-10 Z` }, T);
    // leaves on the trunk flanks
    [[60, -1], [130, 1], [200, -1], [275, 1], [400, -1], [395, 1], [520, -1], [530, 1]].forEach(([y, s], i) => {
      const xEdge = s * (49 + y * 0.022);
      leaf(xEdge, y, s > 0 ? -0.55 - (i % 2) * 0.25 : Math.PI + 0.55 + (i % 2) * 0.25, 40, 11, T);
      leaf(xEdge, y + 14, s > 0 ? -0.05 : Math.PI + 0.05, 28, 8, T);
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
    el('path', { class: 'void-line', d: `M${side * 52},${ym} L${side * 84},${ym}` }, S);
    pill(side * (88 + pillW(label) / 2), ym, label, k, S);
  }
  function spineItem(id) { const g = el('g', { class: 'spine-item', tabindex: '0', role: 'button', 'data-id': id, 'aria-label': byId.get(id)?.name_as_written || id }, S); spineEls.set(id, g); return g; }

  // connectors (drawn first, under plaques)
  connector(SLOT.ali - 40, SLOT.umar + 28, umar.status, linkLabel(umar), -1);
  connector(SLOT.umar - 28, SLOT.med + MED_R, abd.status, linkLabel(abd), -1);
  // void below Ali
  el('path', { class: 'void-line', d: `M0,${SLOT.ali + 40} L0,${SLOT.note - 22}` }, S);
  el('text', { class: 'void-note', x: 0, y: SLOT.note + 34 }, S).textContent = t('tree_above_ali');

  // root plaque (cartouche)
  (function () {
    const g = spineItem(ali.id), y = SLOT.ali, w = 300, h = 84, n = 18;
    el('path', { class: 'plaque ' + stKey(ali.status), d: `M${-w / 2 + n},${y - h / 2} H${w / 2 - n} L${w / 2},${y} L${w / 2 - n},${y + h / 2} H${-w / 2 + n} L${-w / 2},${y} Z` }, g);
    el('path', { class: 'plaque-in', d: `M${-w / 2 + n + 6},${y - h / 2 + 7} H${w / 2 - n - 6} L${w / 2 - 9},${y} L${w / 2 - n - 6},${y + h / 2 - 7} H${-w / 2 + n + 6} L${-w / 2 + 9},${y} Z` }, g);
    el('text', { class: 'ptxt', x: 0, y: y - 12, 'font-size': 30, 'font-weight': 700 }, g).textContent = ali.name_as_written;
    el('text', { class: 'psub', x: 0, y: y + 22 }, g).textContent = t('tree_poster_only', { x: CONFIG.posterAli });
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

  // link from the medallion to its sons: label the first strong one
  (function () {
    const sons = kids.get(ROOT).filter(c => fan.has(c));
    const main = sons.sort((a, b) => descN.get(b) - descN.get(a))[0];
    if (!main) return;
    const c = fan.get(main), [x, y] = pt(c.r * 0.5, c.a * 0.55);
    pill(x + 74, y + 30, linkLabel(byId.get(main)), stKey(byId.get(main).status), S);
  })();

  drawFloats();
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

/* unattached branches: one small upward tree per card, in their own block under the stage */
function drawFloats() {
  fcards.textContent = '';
  ftrees.forEach(f => {
    const W = f.w + 28, H = f.h * FL + FR * 2 + 34;
    const fig = document.createElement('figure'); fig.className = 'ft-fcard';
    const s = el('svg', { class: 'ft-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group' });
    const gE = el('g', {}, s), gN = el('g', {}, s);
    const P = id => { const p = f.local.get(id); return [14 + FS / 2 + (f.w - FS) - p.x, H - 16 - FR - p.l * FL]; };   // RTL: first child on the right
    for (const [id] of f.local) {
      flo.add(id);
      const p = byId.get(id); if (id === f.rid) continue;
      const [x, y] = P(id), [px, py] = P(p.father_id);
      drawEdge(`M${f1(px)},${f1(py)} C${f1(px)},${f1(py - FL * 0.55)} ${f1(x)},${f1(y + FL * 0.55)} ${f1(x)},${f1(y)}`, p.status, edgeW(total.get(id)), gE);
    }
    for (const [id] of f.local) { const [x, y] = P(id); makeNode(id, x, y, FR, gN, id === f.rid ? null : Math.PI / 2); }
    const cap = document.createElement('figcaption');
    cap.textContent = (byId.get(f.rid).branch || '').replace(/^\d\s*/, '');
    fig.append(s, cap); fcards.appendChild(fig);
  });
}

/* ---------- names inside the fruits (fitted with the fonts that are loaded) ---------- */
function fitLabels() {
  const nameFont = cssVar('--ft-f-name');
  const width = (l, f) => measure(l, `700 100px ${nameFont}`) * f / 100;   // one measurement per name, scaled
  const fitsIn = (lines, f, r) => lines.length === 1 ? width(lines[0], f) <= 2 * r - 9 :
    lines.every((l, i) => { const yy = (i ? 1 : -1) * 1.05 * f; return width(l, f) <= 2 * Math.sqrt(Math.max(0, r * r - yy * yy)) - 7; });
  for (const [, n] of nodeEls) {
    const opts = [[n.label]], words = n.label.split(/\s+/);
    if (words.length > 1) { opts.push(splitLines(n.label)); if (words.length === 2) opts.push(words); }
    let best = null;
    for (const lines of opts) {
      let fs = Math.min(lines.length > 1 ? n.r * 0.5 : n.r * 0.58, 18);
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
    const f = fan.get(id); if (!f) continue;
    keyLabels.push({ id, n, t: null, x: n.x, y: n.y, r: n.r, w: measure(n.label, `700 12px ${nameFont}`) + 8, d: f.d, ux: Math.sin(f.a), uy: -Math.cos(f.a), shown: null });
  }
  lastLodK = 0; applyLOD(currentK, true);
}

/* ---------- zoom / pan ---------- */
const svg = d3.select(treeEl);
const DETAIL_PX = 9;       // smallest on-screen size at which the name inside a fruit is used; below it the name moves outside
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
  for (const kl of keyLabels) { kl.out = (kl.n.fs || 0) * k < DETAIL_PX; if (kl.out !== kl.wasOut) { kl.n.g.classList.toggle('ext', kl.out); kl.wasOut = kl.out; } if (kl.out) outside++; kl.box = [kl.x * k, kl.y * k, kl.r * k + 1, kl.r * k + 1]; put(kl.box); }
  put([0, 0, MED_R * k, MED_R * k]); put([0, SLOT.note / 2 * k, 150 * k, (SLOT.note / 2 + 30) * k]);   // medallion, trunk
  const show = (kl, mode, x, y) => {
    if (!kl.t) { if (!mode) return; kl.t = el('text', { class: 'klab' }, L.klabs); }
    if (kl.shown !== mode) { kl.t.textContent = mode === 'name' ? kl.n.label : mode === 'dots' ? '…' : ''; if (mode) kl.t.removeAttribute('display'); else kl.t.setAttribute('display', 'none'); kl.shown = mode; }
    if (mode) { kl.t.setAttribute('x', f1(x)); kl.t.setAttribute('y', f1(y)); kl.t.setAttribute('transform', `translate(${f1(kl.x)},${f1(kl.y)}) scale(${(1 / k).toFixed(4)})`); }
  };
  if (outside) {
    const order = keyLabels.filter(kl => kl.out).sort((a, b) => a.d - b.d || total.get(b.id) - total.get(a.id));
    for (const kl of order) {
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
  return { x0: Math.min(fanBox.x0, -170) - 30, x1: Math.max(fanBox.x1, 170) + 30, y0: fanBox.y0 - 34, y1: Math.max(fanBox.y1, SLOT.note + 50) };
}
const mqMobile = window.matchMedia('(max-width:720px)');
const isMobile = () => mqMobile.matches;
// the phone stage has a fixed share of the screen (set in tree.css) and opens on the medallion and the first generations;
// resizing it to the tree after load would push the page about
function sizeStage() { stage.style.height = ''; }
function viewRect() {
  const W = stage.clientWidth, H = stage.clientHeight, isOpen = panel.classList.contains('open');
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
  if (mode === 'home') b.y1 = SLOT.umar + 46;
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
  if (flo.has(id)) { nodeEls.get(id)?.g.closest('.ft-fcard')?.scrollIntoView({ block: 'center', behavior: reduced || !ms ? 'auto' : 'smooth' }); return; }
  if (!visible()) return;
  const [x, y] = posOf(id), v = viewRect();
  if (isMobile()) kMin = Math.min(kMin, 1);
  const k = Math.max(d3.zoomTransform(treeEl).k, kMin);
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * x, v.y + v.h / 2 - k * y).scale(k), ms);
}
$('ft-zin').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1.4);
$('ft-zout').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1 / 1.4);
$('ft-zfit').onclick = () => fit(550, 'all');
$('ft-goFloat').onclick = () => floats.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });

/* ---------- unfolding ---------- */
function redraw(after) { draw(); sizeStage(); if (after) requestAnimationFrame(after); }
function expand(id) { openBelow(id); redraw(() => centerOn(id, Math.min(1, d3.zoomTransform(treeEl).k), 450)); }
function showAll() { for (const id of inFan) if (kids.get(id).length) open.add(id); redraw(() => fit(550, 'all')); }
function foldAll() { resetOpen(); if (selected && inFan.has(selected)) { openPathTo(selected); openBelow(selected); } redraw(() => fit(550, 'home')); }
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
  host.querySelectorAll('.ft-fcard.hit, .node.hit').forEach(e => e.classList.remove('hit'));
  const b = CONFIG.branches[branchKey]; if (!b) return [];
  if (b.floats) { const cards = b.floats.map(id => nodeEls.get(id)?.g.closest('.ft-fcard')).filter(Boolean); cards.forEach(c => c.classList.add('hit')); return cards; }
  const n = ring(nodeEls.get(b.root)); if (n) n.g.classList.add('hit');
  return n ? [n.g] : [];
}
function focusBranch(key, ms = 700) {
  const b = CONFIG.branches[key]; if (!b) return false;
  branchKey = key;
  if (b.root && byId.has(b.root)) { openPathTo(b.root); (function all(id) { if (kids.get(id).length) open.add(id); kids.get(id).forEach(all); })(b.root); draw(); sizeStage(); }
  const marked = markBranch(); if (!marked.length) return false;
  if (b.floats) { marked[0].scrollIntoView({ block: 'center', behavior: reduced || !ms ? 'auto' : 'smooth' }); return true; }
  if (!visible()) return false;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  (function walk(id) { const f = fan.get(id); if (!f) return; x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); vkids(id).forEach(walk); })(b.root);
  stage.scrollIntoView({ block: 'center', behavior: 'auto' });
  const v = viewRect(), pad = isMobile() ? 34 : 80;
  const k = Math.min(1.6, (v.w - pad * 2) / (x1 - x0), (v.h - pad * 2) / (y1 - y0));
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * (x0 + x1) / 2, v.y + v.h / 2 - k * (y0 + y1) / 2).scale(k), ms);
  return true;
}

/* ---------- 1987 toggle ---------- */
t87.addEventListener('change', () => {
  treeEl.classList.toggle('show87', t87.checked);
  if (t87.checked) { const v = viewRect(), k = Math.max(0.45, Math.min(1, v.h / 900, v.w / 640)); go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * 90, v.y + v.h / 2 - k * 335).scale(k)); }
});

/* ---------- person panel ---------- */
const stPill = (p, label) => `<span class="st ${stKey(p.status)}" title="${esc(linkExplain(p))}">${esc(label || linkLabel(p))}</span>`;
const personBtn = id => { const p = byId.get(id); return p ? `<button type="button" class="pl" data-go="${esc(id)}">${esc(nameOf(p))}</button>` : ''; };
const level = c => { const s = String(c || ''); return s.startsWith('عالية') ? 3 : s.startsWith('متوسطة') ? 2 : s.startsWith('منخفضة') ? 1 : 0; };
const dotsHtml = (c, title, withText = true) => { const n = level(c); return c ? `<span class="conf" title="${esc(title)}: ${esc(c)}">${n ? [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') : ''}${withText ? ' ' + esc(c) : ''}</span>` : ''; };
const pageTxt = pg => pg == null || pg === '' ? '' : (typeof pg === 'number' || /^\d+$/.test(String(pg)) ? t('tree_page_book', { n: pg }) : String(pg));
const ahTxt = v => /^\d+$/.test(String(v)) ? `${v}${t('tree_ah')}` : String(v);
const docDate = it => it.d ? (it.d.date_hijri && /^\d+$/.test(String(it.d.date_hijri)) ? ahTxt(it.d.date_hijri) : '') : (it.e && /^\d+/.test(String(it.e.date || '')) ? ahTxt(String(it.e.date).match(/^\d+/)[0]) : '');
function genText(p) { return p.generation == null ? t('tree_gen_unknown') : p.generation === 0 ? t('tree_gen_zero') : p.generation < 0 ? t('tree_gen_top', { n: p.generation }) : t('tree_gen', { n: p.generation }); }
function ancestors(id, stopAt) { const out = []; let p = byId.get(id), guard = 0; while (p && p.father_id && byId.has(p.father_id) && guard++ < 200) { p = byId.get(p.father_id); out.push(p); if (p.id === stopAt) break; } return out; }
// «بن … بن … بن عبد الله سبال العين»: every father is a link
function lineageHtml(p) {
  const up = ancestors(p.id, inFan.has(p.id) && p.id !== ROOT ? ROOT : null); if (!up.length) return '';
  const first = / بنت /.test(' ' + p.name_as_written + ' ') ? 'بنت' : 'بن';
  return up.map((a, i) => `<span class="bn">${i ? 'بن' : first}</span> <button type="button" class="lk" data-go="${esc(a.id)}">${esc(shortName(a))}</button>`).join(' ');
}
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
  pEyebrow.textContent = [genText(p), p.branch].filter(Boolean).join(' · ');
  pName.textContent = nameOf(p);
  pLine.innerHTML = lineageHtml(p);
  if (p.placeholder) {
    pBadges.innerHTML = '';
    pBody.innerHTML = `<section class="sec"><p class="note">${esc((p.estimate && p.estimate.basis) || t('tree_unknown_basis'))}</p></section>`;
    showPanel(id); if (center) requestAnimationFrame(() => centerOn(id)); return;
  }
  const f = p.father_id && byId.get(p.father_id), ks = kids.get(id) || [], k = stKey(p.status);
  pBadges.innerHTML = (f ? stPill(p) : '') + (!p.living && p.earliest_doc_date ? `<span class="bd">${esc(t('tree_earliest'))}: ${esc(ahTxt(p.earliest_doc_date))}</span>` : '');
  let html = '';
  const chain = ancestors(id, ROOT);
  if (chain.length && chain[chain.length - 1].id === ROOT) html += `<section class="sec"><button type="button" class="cta" data-chain="${esc(id)}">${esc(t('tree_chain_btn'))}</button></section>`;
  if (!f) html += `<section class="sec"><p class="muted">${esc(id === CONFIG.spine[0] ? t('tree_above_ali') : t('tree_father_none'))}</p></section>`;
  if (ks.length) html += `<section class="sec"><h4>${esc(t('tree_children'))} (${ks.length})</h4><div class="chips">${ks.map(personBtn).join('')}</div></section>`;
  if (!p.living) {
    const S = stripHtml(id);
    html += `<section class="sec"><h4>${esc(t('tree_docs'))} (${S.count})</h4>${S.count ? S.html : `<p class="muted">${esc(t('tree_docs_none'))}</p>`}</section>`;
    // family tradition: the notes say who told it
    if (k === 'trad' && p.notes) html += `<section class="sec"><h4>${esc(t('tree_link_trad'))}</h4><p class="srcline">${esc(p.notes)}</p></section>`;
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
function showPanel(id) { placePanel(id); panel.classList.add('open'); floats.classList.toggle('has-panel', panel.parentNode === floats); }
function closePanel() { panel.classList.remove('open'); floats.classList.remove('has-panel'); setSelected(null); }
$('ft-pClose').onclick = closePanel;
panel.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (b) { if (!b.dataset.go.startsWith('r87')) openPerson(b.dataset.go); return; }
  const th = e.target.closest('[data-doc]'); if (th) { openReader(th.dataset.of, +th.dataset.doc); return; }
  const ch = e.target.closest('[data-chain]'); if (ch) { location.hash = '#/chain/' + ch.dataset.chain; return; }
  const ad = e.target.closest('[data-add]'); if (ad) { const box = ad.nextElementSibling; box.hidden = !box.hidden; if (!box.hidden) box.innerHTML = addBoxHtml(ad.dataset.add); ad.setAttribute('aria-expanded', String(!box.hidden)); }
});
// the sheet is in <body> on phones, in the block that holds the selected name on desktop, and in the stage in full screen
function placePanel(id) { const target = stage.classList.contains('fs') ? stage : isMobile() ? document.body : (id && flo.has(id) ? floats : stage); if (panel.parentNode !== target) target.appendChild(panel); floats.classList.toggle('has-panel', target === floats && panel.classList.contains('open')); }
mqMobile.addEventListener('change', () => placePanel(selected)); placePanel(selected);

function onActivate(e) {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  const c = e.target.closest('[data-expand]'); if (c) { e.preventDefault(); hideTip(); expand(c.dataset.expand); return; }
  const g = e.target.closest('[data-id]'); if (!g) return;
  e.preventDefault();
  hideTip();
  const id = g.dataset.id;
  openPerson(id);
  // a finger has no hover: show the tooltip briefly once the tree has settled
  if (lastPointer === 'touch') { clearTimeout(tipTimer); tipTimer = setTimeout(() => { const n = nodeEls.get(id) || { g: spineEls.get(id) }; if (n.g) showTip(n.g); tipTimer = setTimeout(hideTip, 2500); }, 750); }
}
['click', 'keydown'].forEach(type => { world.addEventListener(type, onActivate); fcards.addEventListener(type, onActivate); });

/* ---------- tooltip: full name and lineage line, for every fruit and plaque ---------- */
let lastPointer = 'mouse', tipTimer;
function lineage(id) { return [byId.get(id), ...ancestors(id)].reverse().map(shortName).join(' ← '); }
function showTip(g) {
  const p = byId.get(g.dataset.id); if (!p || !g.isConnected) return;
  tip.innerHTML = `<b>${esc(nameOf(p))}</b><span>${esc(lineage(p.id))}</span>`;
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
  $('ft-rTitle').textContent = (d && d.doc_type) || pageTxt(e && e.page) || t('tree_docs');
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
chainEl.innerHTML = `<header class="ch"><div><h2 id="ft-cTitle"></h2><p id="ft-cSum"></p></div><button type="button" id="ft-cClose">${icon(IC.x)}</button></header><ol class="cl" id="ft-cList"></ol>`;
document.body.appendChild(chainEl);
trap(chainEl);
let chainId = null, chainIO = null, chainPushed = false;
function renderChain(id) {
  const p = byId.get(id); if (!p) return false;
  const line = [p, ...ancestors(id, ROOT)];
  const c = { ok: 0, maybe: 0, trad: 0 }; line.forEach(x => { if (x.id !== ROOT || x.father_id) c[stKey(x.status)]++; });
  $('ft-cTitle').textContent = t('tree_chain_title');
  $('ft-cSum').textContent = [t('tree_chain_n', { n: line.length }), t('tree_chain_ok', { n: c.ok }), c.maybe ? t('tree_chain_maybe', { n: c.maybe }) : '', t('tree_chain_trad', { n: c.trad })].filter(Boolean).join(' · ');
  $('ft-cClose').setAttribute('aria-label', t('tree_close'));
  // a run of unknown ancestors is one card
  const cards = [];
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    if (x.placeholder) { let n = 1; while (line[i + 1] && line[i + 1].placeholder) { n++; i++; } cards.push({ ph: true, n, x }); } else cards.push({ x });
  }
  $('ft-cList').innerHTML = cards.map((cd, i) => {
    const x = cd.x, last = i === cards.length - 1;
    if (cd.ph) { const es = x.estimate || {}; return `<li class="cc ph"><div class="card"><b>${esc(t('tree_unknown_chain', { n: cd.n }))}</b>${es.min != null ? `<span class="muted"> ${esc(t('tree_unknown_range', { min: es.min, max: es.max }))}</span>` : ''}</div><i class="ln trad"></i></li>`; }
    const D = x.living ? { thumbs: [], count: 0 } : docsOf(x.id), k = stKey(x.status);
    const thumbs = D.thumbs.slice(0, 5).map(th => `<button type="button" class="th" data-doc="${th.i}" data-of="${esc(x.id)}" aria-label="${esc(t('tree_open_doc'))}: ${esc(pageTxt(th.it.d ? th.it.d.page : th.it.e.page))}"><img src="${esc(asset(th.it.src))}" alt="" loading="lazy" decoding="async" width="60" height="76"></button>`).join('') + (D.thumbs.length > 5 ? `<span class="more">+${D.thumbs.length - 5}</span>` : '');
    return `<li class="cc${last && x.id === ROOT ? ' root' : ''}"><div class="card"><span class="gen">${esc(genText(x))}</span><b class="nm">${esc(nameOf(x))}</b>${thumbs ? `<div class="strip">${thumbs}</div>` : ''}</div>${last ? '' : `<i class="ln ${k}"></i><span class="lb" title="${esc(linkExplain(x))}">${esc(linkLabel(x))}</span>`}</li>`;
  }).join('');
  if (chainIO) chainIO.disconnect();
  const items = [...chainEl.querySelectorAll('.cc')];
  if (reduced || !('IntersectionObserver' in window)) items.forEach(li => li.classList.add('in'));
  else { chainIO = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); chainIO.unobserve(en.target); } }), { root: chainEl, rootMargin: '0px 0px -12% 0px' }); items.forEach(li => chainIO.observe(li)); }
  return true;
}
function openChain(id) {
  if (!renderChain(id)) return;
  chainId = id; chainEl.hidden = false; chainEl.scrollTop = 0; document.documentElement.classList.add('ft-noscroll');
  requestAnimationFrame(() => $('ft-cClose').focus());
}
function closeChain() { if (chainEl.hidden) return; chainEl.hidden = true; chainId = null; if (!stage.classList.contains('fs')) document.documentElement.classList.remove('ft-noscroll'); }
// Back closes the chain: it is opened by setting the hash, and closed by going back to where it was opened from
$('ft-cClose').onclick = () => { if (chainPushed) history.back(); else { history.replaceState(null, '', location.pathname + location.search); closeChain(); } };
chainEl.addEventListener('click', e => { const th = e.target.closest('[data-doc]'); if (th) openReader(th.dataset.of, +th.dataset.doc); });
chainEl.addEventListener('keydown', e => { if (e.key === 'Escape' && reader.hidden) $('ft-cClose').click(); });

/* ---------- routes ---------- */
let booted = false;
function onHash() {
  const h = location.hash, c = /^#\/chain\/([\w-]+)$/.exec(h), b = /^#\/b\/([\w-]+)$/.exec(h);
  if (c && byId.has(c[1])) { chainPushed = booted; openChain(c[1]); return true; }
  closeChain();
  return b ? focusBranch(b[1]) : false;
}
window.addEventListener('hashchange', () => { closeReader(); onHash(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && reader.hidden && chainEl.hidden) { if (stage.classList.contains('fs')) setFull(false); else if (panel.classList.contains('open')) closePanel(); } });

/* ---------- search ---------- */
const index = persons.filter(searchable).map(p => ({ id: p.id, n: norm(p.name_as_written + ' ' + (p.short_name || '')), p }));
let hits = [], cursor = 0;
function renderHits() {
  results.innerHTML = hits.length ? hits.map((h, i) => `<li role="option" id="ft-opt${i}" aria-selected="${i === cursor}" data-go="${esc(h.id)}"><span class="rn">${esc(h.p.name_as_written)}</span><span class="rm">${esc(lineage(h.id))}</span></li>`).join('')
    : `<li class="empty">${esc(t('tree_search_empty'))}</li>`;
  results.hidden = false; q.setAttribute('aria-expanded', 'true');
}
q.addEventListener('input', () => {
  const s = norm(q.value);
  if (!s) { results.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  const toks = s.split(' ');
  hits = index.filter(x => toks.every(tok => x.n.includes(tok))).sort((a, b) => (a.n.startsWith(s) ? 0 : 1) - (b.n.startsWith(s) ? 0 : 1) || a.n.length - b.n.length).slice(0, 10);
  cursor = 0; renderHits();
});
q.addEventListener('keydown', e => {
  if (results.hidden || !hits.length) return;
  if (e.key === 'ArrowDown') { cursor = (cursor + 1) % hits.length; renderHits(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cursor = (cursor - 1 + hits.length) % hits.length; renderHits(); e.preventDefault(); }
  else if (e.key === 'Enter') { choose(hits[cursor].id); e.preventDefault(); }
  else if (e.key === 'Escape') { results.hidden = true; }
});
results.addEventListener('mousedown', e => { const li = e.target.closest('[data-go]'); if (li) { e.preventDefault(); choose(li.dataset.go); } });
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
  const line = k => `<svg viewBox="0 0 46 14" aria-hidden="true"><path d="M2 7H44" class="lg ${k}"/></svg>`;
  $('ft-legend-body').innerHTML = ['ok', 'maybe', 'trad'].map(k => `<div class="row">${line(k)}<span><b>${esc(k === 'ok' ? t('tree_legend_ok') : t('tree_link_' + k))}</b><small>${esc(t('tree_explain_' + k))}</small></span></div>`).join('') +
    `<p class="say">${esc(t('tree_legend_say'))}</p><div class="hint">${esc(t('tree_legend_hint'))}</div>`;
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
    if (selected && !flo.has(selected) && panel.classList.contains('open')) centerOn(selected, d3.zoomTransform(treeEl).k, 0); else fit(0);
    if (first) requestAnimationFrame(() => { onHash(); booted = true; });
  }, 150);
}).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(sizeStage, 250));
window.addEventListener('resize', () => { clearTimeout(rt); sizeStage(); });

window.__ftree = { openPerson, centerOn, fit, focusBranch, showAll, foldAll, expand, openReader, zoomTo: tr => svg.call(zoom.transform, tr), get fan() { return fan; }, count: () => persons.length, drawnCount: () => new Set([...host.querySelectorAll('.ft-svg [data-id]')].map(e => e.dataset.id).filter(id => !id.startsWith('r87_'))).size };
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
