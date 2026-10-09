/* Evidence-based family tree for the dedicated page /tree/. Ported from the tree-v2 prototype (d3 v7.9.0).
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

/* ---------- presentation config (not data) ---------- */
const CONFIG = {
  spine: ['ali', 'umar', 'abdallah'],          // bottom → top on the trunk; the last one is the medallion
  fanRoot: 'abdallah',
  linkLabels: { abdallah: 'tree_link_strong' }, // default wording of a link (i18n key); a person's own link_label wins
  posterAli: 'الخزرجي الأنصاري',                 // extra words on the 1987 root plaque, not found in any document
  fanDeg: 250,
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
const hasStrings = () => typeof strings().tree_title === 'string';
const t = (key, vars) => {
  const s = strings()[key];
  const out = typeof s === 'string' ? s : key;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : out;
};

const stKey = s => !s ? 'author' : s === 'ثابت' ? 'ok' : s.startsWith('محتمل') ? 'maybe' : 'author';
const stText = s => t('tree_status_' + stKey(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[\[\]()«»…؟?،,.\/:\-—]/g, ' ').replace(/\s+/g, ' ').trim();

function shortName(p) {
  if (p.short_name) return p.short_name;
  let s = String(p.name_as_written || p.id).trim().replace(/^\([^)]*\)\s*/, '');
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

function init(persons, docs) {
/* ---------- data ---------- */
const byId = new Map(persons.map(p => [p.id, p]));
const kids = new Map(persons.map(p => [p.id, []]));
persons.forEach(p => { if (p.father_id && byId.has(p.father_id) && p.father_id !== p.id) kids.get(p.father_id).push(p.id); });
const linkLabel = p => p.link_label || (CONFIG.linkLabels[p.id] ? t(CONFIG.linkLabels[p.id]) : stText(p.status));

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

/* ---------- fan layout: generation rings above the medallion ---------- */
const ROOT = CONFIG.fanRoot;
const fan = new Map();     // id -> {d, a, r, x, y, nr, W}
const nodeR = d => d <= 1 ? 34 : d === 2 ? 30 : 24;
const need = d => 2 * nodeR(d) + 10;
const GAP = 68;
const A = CONFIG.fanDeg * Math.PI / 180;
const ringR = (base, d) => d <= 0 ? 0 : d === 1 ? Math.max(200, base * 0.36) : d === 2 ? Math.max(300, base * 0.66) : base + (d - 3) * GAP;
function widths(base) {
  const W = new Map(), seen = new Set();
  (function w(id, d) {
    seen.add(id);
    let s = 0; for (const c of kids.get(id)) if (!seen.has(c)) s += w(c, d + 1);
    const v = Math.max(d > 0 ? need(d) / ringR(base, d) : 0, s);
    W.set(id, v); return v;
  })(ROOT, 0);
  return W;
}
let lo = 300, hi = 20000;
for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (widths(m).get(ROOT) <= A) hi = m; else lo = m; }
const BASE = hi, Wf = widths(BASE);
const descN = new Map();
(function place(id, d, a0) {
  const w = Wf.get(id), a = a0 - w / 2, r = ringR(BASE, d);
  fan.set(id, { d, a, r, W: w, nr: d === 0 ? MED_R : nodeR(d), x: d === 0 ? 0 : r * Math.sin(a), y: d === 0 ? 0 : -r * Math.cos(a) });
  const ks = kids.get(id).filter(c => Wf.has(c));
  let s = ks.reduce((sum, c) => sum + Wf.get(c), 0), cur = a0 - (w - s) / 2, n = 1;
  for (const c of ks) { n += place(c, d + 1, cur); cur -= Wf.get(c); }
  descN.set(id, n); return n;
})(ROOT, 0, A / 2);
const maxDepth = Math.max(...[...fan.values()].map(f => f.d));

/* ---------- unattached branches: small upward trees ---------- */
const placed = new Set([...fan.keys(), ...CONFIG.spine]);
const floatRoots = persons.filter(p => !placed.has(p.id) && !(p.father_id && byId.has(p.father_id))).map(p => p.id);
// anything still unreachable (e.g. a cycle) becomes its own root
const reach = new Set(placed);
const mark = id => { reach.add(id); kids.get(id).forEach(c => !reach.has(c) && mark(c)); };
floatRoots.forEach(mark);
persons.forEach(p => { if (!reach.has(p.id)) { floatRoots.push(p.id); mark(p.id); } });

const FS = 66, FL = 84, FR = 26;
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
/* unattached branches: one small upward tree per card, in their own block under the stage */
function drawFloats() {
  fcards.textContent = '';
  ftrees.forEach(f => {
    const W = f.w + 24, H = f.h * FL + FR * 2 + 28;
    const fig = document.createElement('figure'); fig.className = 'ft-fcard';
    const s = el('svg', { class: 'ft-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group' });
    const gE = el('g', {}, s), gN = el('g', {}, s);
    const P = id => { const p = f.local.get(id); return [12 + FS / 2 + (f.w - FS) - p.x, H - 14 - FR - p.l * FL]; };   // RTL: first child on the right
    for (const [id] of f.local) {
      flo.add(id);
      const p = byId.get(id); if (id === f.rid) continue;
      const [x, y] = P(id), [px, py] = P(p.father_id);
      drawEdge(`M${f1(px)},${f1(py)} C${f1(px)},${f1(py - FL * 0.55)} ${f1(x)},${f1(y + FL * 0.55)} ${f1(x)},${f1(y)}`, p.status, edgeW(1 + countDesc(id)), gE);
    }
    for (const [id] of f.local) { const [x, y] = P(id); makeNode(id, x, y, FR, gN); }
    const cap = document.createElement('figcaption');
    cap.textContent = (byId.get(f.rid).branch || '').replace(/^\d\s*/, '');
    fig.append(s, cap); fcards.appendChild(fig);
  });
}
function countDesc(id) { let n = 0; for (const c of kids.get(id)) n += 1 + countDesc(c); return n; }
const fanBox = (() => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const f of fan.values()) { x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); } return { x0, x1, y0, y1 }; })();
const ali = byId.get(CONFIG.spine[0]), umar = byId.get(CONFIG.spine[1]), abd = byId.get(CONFIG.spine[2]);

/* ---------- dom ---------- */
const stage = $('ft-stage'), treeEl = $('ft-tree'), world = $('ft-world'), panel = $('ft-panel');
const pName = $('ft-pName'), pEyebrow = $('ft-pEyebrow'), pStatus = $('ft-pStatus'), pBody = $('ft-pBody');
const q = $('ft-q'), results = $('ft-results'), t87 = $('ft-t1987');
const floats = $('ft-floats'), fcards = $('ft-fcards'), legendEl = $('ft-legend'), tip = $('ft-tip');
legendEl.open = window.innerWidth >= 1024;   // a chip on small screens, open on desktop
const lightbox = document.createElement('div');
lightbox.className = 'ft-lightbox'; lightbox.hidden = true;
const lbImg = document.createElement('img'); lbImg.alt = '';
lightbox.appendChild(lbImg); document.body.appendChild(lightbox);

/* ---------- svg helpers ---------- */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const pt = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
const f1 = v => Math.round(v * 10) / 10;
const mctx = document.createElement('canvas').getContext('2d');
const cssVar = n => getComputedStyle(host).getPropertyValue(n).trim();
const measure = (text, font) => { mctx.font = font; return mctx.measureText(text).width; };
const edgeW = n => Math.min(19, 1.3 + 1.55 * Math.sqrt(Math.max(0, n - 1)));

// rebuilt by draw()
let L = {}, nodeEls = new Map(), spineEls = new Map(), groups = new Map(), blabEls = [], flo = new Set(), keyLabels = [];
let selected = null, currentK = 1;

function edgeD(pid, cid) {
  const p = fan.get(pid), c = fan.get(cid);
  if (p.d === 0) {
    const sa = Math.max(-0.9, Math.min(0.9, c.a * 0.5));
    const [sx, sy] = pt(MED_R - 6, sa), [m1x, m1y] = pt(c.r * 0.45, sa * 0.6), [m2x, m2y] = pt(c.r * 0.7, c.a);
    return `M${f1(sx)},${f1(sy)} C${f1(m1x)},${f1(m1y)} ${f1(m2x)},${f1(m2y)} ${f1(c.x)},${f1(c.y)}`;
  }
  const rm = (p.r + c.r) / 2, [ax, ay] = pt(rm, p.a), [bx, by] = pt(rm, c.a);
  return `M${f1(p.x)},${f1(p.y)} C${f1(ax)},${f1(ay)} ${f1(bx)},${f1(by)} ${f1(c.x)},${f1(c.y)}`;
}
function drawEdge(d, status, w, parent) {
  const k = stKey(status);
  if (k === 'author') {
    el('path', { class: 'edge author-out', d, 'stroke-width': f1(w + 2.4) }, parent);
    el('path', { class: 'edge author-in', d, 'stroke-width': f1(Math.max(1.2, w - 0.6)) }, parent);
  } else if (k === 'maybe') {
    el('path', { class: 'edge maybe', d, 'stroke-width': f1(w), 'stroke-dasharray': `${f1(Math.max(7, w * 1.7))} ${f1(Math.max(5, w * 1.1))}` }, parent);
  } else el('path', { class: 'edge ok', d, 'stroke-width': f1(w) }, parent);
}
function makeNode(id, x, y, r, parent) {
  const p = byId.get(id), k = stKey(p.status);
  const g = el('g', { class: `node ${k}`, transform: `translate(${f1(x)},${f1(y)})`, tabindex: '0', role: 'button', 'aria-label': `${p.name_as_written} — ${stText(p.status)}`, 'data-id': id }, parent);
  el('circle', { class: 'halo', r: r + 7 }, g);
  el('circle', { class: 'c', r }, g);
  const tx = el('text', { class: 'nl' }, g);
  nodeEls.set(id, { g, t: tx, r, x, y, k, label: shortName(p) });
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

/* ---------- draw: everything inside the svg, in the current language ---------- */
function draw() {
  const uiFont = cssVar('--ft-f-ui');
  const pillW = text => measure(text, `600 15px ${uiFont}`) + 26;
  world.textContent = '';
  L = {}; nodeEls = new Map(); spineEls = new Map(); groups = new Map(); blabEls = []; flo = new Set();
  ['rings', 'blabs', 'edges', 'trunk', 'nodes', 'spine', 'klabs'].forEach(n => L[n] = el('g', { class: 'L-' + n }, world));

  /* generation rings */
  const ringPad = 4 * Math.PI / 180;
  for (let d = 1; d <= maxDepth; d++) {
    const r = ringR(BASE, d), [x0, y0] = pt(r, -A / 2 - ringPad), [x1, y1] = pt(r, A / 2 + ringPad);
    el('path', { class: 'ringline', d: `M${f1(x0)},${f1(y0)} A${f1(r)},${f1(r)} 0 1 1 ${f1(x1)},${f1(y1)}` }, L.rings);
    const gen = (byId.get(ROOT).generation ?? 1) + d;
    const [lx, ly] = pt(r, A / 2 + ringPad + 0.035);
    el('text', { class: 'ringlab nl-ring', x: f1(lx), y: f1(ly), 'text-anchor': 'middle' }, L.rings).textContent = t('tree_gen', { n: gen });
  }

  /* edges */
  [...fan.entries()].filter(([id]) => id !== ROOT).sort((a, b) => descN.get(b[0]) - descN.get(a[0])).forEach(([id]) => {
    const p = byId.get(id);
    drawEdge(edgeD(p.father_id, id), p.status, edgeW(descN.get(id)), L.edges);
  });

  /* nodes */
  for (const [id, f] of fan) if (id !== ROOT) makeNode(id, f.x, f.y, f.nr, L.nodes);

  /* branch arcs: one per numbered house (1–7) */
  for (const [id, f] of fan) {
    const b = byId.get(id).branch || '', m = /^(\d)(?!\/)\s/.exec(b);
    if (!m || f.d === 0) continue;
    const g = groups.get(m[1]) || { n: m[1], a0: Infinity, a1: -Infinity, rmax: 0, names: new Map() };
    g.a0 = Math.min(g.a0, f.a - f.nr / f.r); g.a1 = Math.max(g.a1, f.a + f.nr / f.r);
    g.rmax = Math.max(g.rmax, f.r + f.nr);
    const clean = b.replace(/^\d\s*/, '').replace(/\s*\((الأصل|فرع منقطع)\)\s*$/, '').replace(/\s*—\s*(الأصل|بإسناد المؤلف)$/, '').trim();
    g.names.set(clean, (g.names.get(clean) || 0) + 1);
    groups.set(m[1], g);
  }
  for (const g of groups.values()) {
    const label = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const R = g.rmax + 40, a0 = g.a0, a1 = g.a1;
    const [bx0, by0] = pt(R - 18, a0), [bx1, by1] = pt(R - 18, a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const [ix0, iy0] = pt(R - 30, a0), [ix1, iy1] = pt(R - 30, a1);
    el('path', { class: 'bracket', d: `M${f1(ix0)},${f1(iy0)} L${f1(bx0)},${f1(by0)} A${f1(R - 18)},${f1(R - 18)} 0 ${large} 1 ${f1(bx1)},${f1(by1)} L${f1(ix1)},${f1(iy1)}` }, L.blabs);
    const pid = 'ft-arc' + g.n, [tx0, ty0] = pt(R, a0 - 0.3), [tx1, ty1] = pt(R, a1 + 0.3);
    el('path', { id: pid, d: `M${f1(tx0)},${f1(ty0)} A${f1(R)},${f1(R)} 0 ${(a1 - a0 + 0.6) > Math.PI ? 1 : 0} 1 ${f1(tx1)},${f1(ty1)}`, fill: 'none' }, L.blabs);
    const arcLen = R * (a1 - a0);
    const tx = el('text', { class: 'blab', 'font-size': 40 }, L.blabs);
    const tp = el('textPath', { href: '#' + pid, startOffset: '50%', 'text-anchor': 'middle' }, tx);
    tp.textContent = `${t('tree_branch', { n: g.n })} · ${label}`;
    blabEls.push({ t: tx, arcLen });
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
  if (selected) { nodeEls.get(selected)?.g.classList.add('sel'); spineEls.get(selected)?.classList.add('sel'); }
  markBranch();
  $('ft-zin').setAttribute('aria-label', t('tree_zoom_in')); $('ft-zin').title = t('tree_zoom_in');
  $('ft-zout').setAttribute('aria-label', t('tree_zoom_out')); $('ft-zout').title = t('tree_zoom_out');
  $('ft-zfit').setAttribute('aria-label', t('tree_zoom_fit')); $('ft-zfit').title = t('tree_zoom_fit');
  $('ft-pClose').setAttribute('aria-label', t('tree_close'));
  treeEl.setAttribute('aria-label', t('tree_aria'));
  panel.setAttribute('aria-label', t('tree_panel_label'));
  q.setAttribute('aria-label', t('tree_search_placeholder'));
  q.placeholder = t('tree_search_placeholder');
  q.dir = document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl';   // placeholder punctuation follows the UI language
}

/* ---------- labels inside circles (fit to the circle with the fonts that are loaded) ---------- */
function fitLabels() {
  const nameFont = cssVar('--ft-f-name');
  const width = (l, f) => measure(l, `700 ${f}px ${nameFont}`);
  const fitsIn = (lines, f, r) => lines.length === 1 ? width(lines[0], f) <= 2 * r - 9 :
    lines.every((l, i) => { const yy = (i ? 1 : -1) * 1.05 * f; return width(l, f) <= 2 * Math.sqrt(Math.max(0, r * r - yy * yy)) - 7; });
  for (const [, n] of nodeEls) {
    const opts = [[n.label]], words = n.label.split(/\s+/);
    if (words.length > 1) { opts.push(splitLines(n.label)); if (words.length === 2) opts.push(words); }
    let best = null;
    for (const lines of opts) {
      let fs = Math.min(lines.length > 1 ? n.r * 0.5 : n.r * 0.58, 17);
      while (fs > 6.5 && !fitsIn(lines, fs, n.r)) fs -= 0.5;
      if (!best || fs > best.fs + 0.4) best = { fs, lines };
    }
    let { fs, lines } = best;
    // never let a name spill out of its circle: at the smallest size, shorten it (the tooltip and the panel carry the full name)
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
  // branch arc labels shrink to fit their arc
  const callig = cssVar('--ft-f-callig');
  for (const b of blabEls) {
    let fs = 40;
    const w = measure(b.t.textContent, `700 ${fs}px ${callig}`);
    if (w > b.arcLen + 140) fs = Math.max(20, 40 * (b.arcLen + 140) / w);
    b.t.setAttribute('font-size', f1(fs));
  }
  buildKeyLabels();
}

/* names beside the circles while the names inside them are too small to read: 12px on screen, pushed outward
   from the circle, and dropped only where they would cover another name or another circle */
function buildKeyLabels() {
  const nameFont = cssVar('--ft-f-name');
  L.klabs.textContent = ''; keyLabels = [];
  for (const [id, n] of nodeEls) {
    const f = fan.get(id); if (!f) continue;
    const tx = el('text', { class: 'klab' + (n.k === 'author' ? ' author' : '') }, L.klabs);
    tx.textContent = n.label;
    keyLabels.push({ id, n, t: tx, x: n.x, y: n.y, r: n.r, room: f.W * f.r, w: measure(n.label, `700 12px ${nameFont}`) + 8, d: f.d, ux: Math.sin(f.a), uy: -Math.cos(f.a) });
  }
  applyLOD(currentK);
}

// true when a name box (screen px, relative to the medallion) would sit on a branch's arc title
function onArcTitle(cx, cy, hw, hh, k) {
  const ang = Math.atan2(cx, -cy), rad = Math.hypot(cx, cy) / k;
  const ext = (Math.abs(Math.sin(ang)) * hw + Math.abs(Math.cos(ang)) * hh) / k, da = hw / Math.max(1, Math.hypot(cx, cy));
  for (const g of groups.values()) if (ang + da > g.a0 - 0.06 && ang - da < g.a1 + 0.06 && rad + ext > g.rmax + 16 && rad - ext < g.rmax + 70) return true;
  return false;
}

/* ---------- zoom / pan ---------- */
const svg = d3.select(treeEl);
const DETAIL_PX = 10;      // smallest on-screen size at which the name inside a circle is used; below it the name moves outside
function applyLOD(k) {
  currentK = k;
  treeEl.classList.toggle('lod-near', k > 0.8);
  let outside = 0;
  for (const kl of keyLabels) { kl.out = (kl.n.fs || 0) * k < DETAIL_PX; kl.n.g.classList.toggle('ext', kl.out); if (kl.out) outside++; }
  if (outside) {
    const hit = (b, cx, cy, hw, hh) => Math.abs(b[0] - cx) < hw + b[2] && Math.abs(b[1] - cy) < hh + b[3];
    const circles = keyLabels.map(kl => [kl.x * k, kl.y * k, kl.r * k + 1, kl.r * k + 1]);
    const boxes = [[0, 0, MED_R * k, MED_R * k], [0, SLOT.note / 2 * k, 150 * k, (SLOT.note / 2 + 30) * k]];   // medallion, trunk
    const tr = d3.zoomTransform(treeEl), W = stage.clientWidth;
    const order = keyLabels.map((kl, i) => [kl, i]).sort((a, b) => a[0].d - b[0].d || b[0].room - a[0].room);
    for (const [kl, i] of order) {
      if (!kl.out) { kl.t.setAttribute('display', 'none'); continue; }
      const hw = kl.w / 2, hh = 8, gap = kl.r * k + 3, nx = kl.x * k, ny = kl.y * k;
      let at = null;
      for (const [ux, uy] of [[kl.ux, kl.uy], [0, 1], [0, -1], [kl.ux >= 0 ? 1 : -1, 0]]) {   // outward, below, above, beside
        const d = gap + Math.abs(ux) * hw + Math.abs(uy) * hh, cx = nx + ux * d, cy = ny + uy * d;
        if (boxes.some(b => hit(b, cx, cy, hw, hh)) || circles.some((c, j) => j !== i && hit(c, cx, cy, hw, hh))) continue;
        if (onArcTitle(cx, cy, hw, hh, k)) continue;
        const sx = tr.x + cx; if (sx - hw < 2 !== sx + hw < 2 || sx - hw > W - 2 !== sx + hw > W - 2) continue;   // would be cut by the stage edge
        at = [cx, cy]; break;
      }
      if (at) {
        boxes.push([at[0], at[1], hw, hh]);
        kl.t.removeAttribute('display');
        kl.t.setAttribute('x', f1(at[0] - nx)); kl.t.setAttribute('y', f1(at[1] - ny));
        kl.t.setAttribute('transform', `translate(${f1(kl.x)},${f1(kl.y)}) scale(${(1 / k).toFixed(4)})`);
      } else kl.t.setAttribute('display', 'none');
    }
  } else for (const kl of keyLabels) kl.t.setAttribute('display', 'none');
  if (L.rings) L.rings.style.display = k * 13 < 6 ? 'none' : '';
}
const zoom = d3.zoom().scaleExtent([0.05, 4])
  // cooperative gestures: the page keeps the plain wheel and the one-finger drag; Ctrl/⌘ + wheel, two fingers or a mouse drag move the tree
  .filter(e => e.type === 'wheel' ? (e.ctrlKey || e.metaKey) : e.type.startsWith('touch') ? e.touches.length > 1 : !e.button)
  .on('zoom', e => { world.setAttribute('transform', e.transform); applyLOD(e.transform.k); hideTip(); });
svg.call(zoom).on('dblclick.zoom', null);
const hintEl = $('ft-hint');
let hintTimer;
function hint(key) { hintEl.textContent = t(key); hintEl.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.hidden = true; }, 1500); }
treeEl.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) hint('tree_hint_wheel'); }, { passive: true });
treeEl.addEventListener('touchmove', e => { if (e.touches.length === 1) hint('tree_hint_touch'); }, { passive: true });

const visible = () => stage.clientWidth > 0 && stage.clientHeight > 0;
function contentBounds() {
  let x0 = Math.min(fanBox.x0, -160), x1 = Math.max(fanBox.x1, 160), y0 = fanBox.y0, y1 = Math.max(fanBox.y1, SLOT.note + 50);
  for (const g of groups.values()) { y0 = Math.min(y0, -(g.rmax + 80)); }
  const bb = L.blabs.getBBox(); if (bb.width) { x0 = Math.min(x0, bb.x); x1 = Math.max(x1, bb.x + bb.width); y0 = Math.min(y0, bb.y); }

  const rb = L.rings.getBBox(); if (rb.width) { x0 = Math.min(x0, rb.x); x1 = Math.max(x1, rb.x + rb.width); }
  return { x0, y0, x1, y1 };
}
const mqMobile = window.matchMedia('(max-width:720px)');
const isMobile = () => mqMobile.matches;
function viewRect() {
  const W = stage.clientWidth, H = stage.clientHeight, open = panel.classList.contains('open');
  if (!open) return { x: 0, y: 0, w: W, h: H };
  if (isMobile()) { const vis = (window.innerHeight - panel.offsetHeight) - stage.getBoundingClientRect().top; return { x: 0, y: 0, w: W, h: Math.max(90, Math.min(H, vis)) }; }
  if (panel.parentNode !== stage) return { x: 0, y: 0, w: W, h: H };
  const pw = panel.offsetWidth; return { x: pw, y: 0, w: W - pw, h: H };
}
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function go(tr, ms = 550) { (reduced || !ms ? svg : svg.transition().duration(ms).ease(d3.easeCubicInOut)).call(zoom.transform, tr); }
function fit(ms = 550) {
  if (!visible()) return;
  // the whole tree, branch arc labels included, inside the stage
  const b = contentBounds(), v = viewRect(), pad = isMobile() ? 16 : 22;
  const k = Math.min((v.w - pad * 2) / (b.x1 - b.x0), (v.h - pad * 2) / (b.y1 - b.y0));
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
function centerOn(id, kMin = 1.25, ms = 600) {
  if (flo.has(id)) { nodeEls.get(id)?.g.closest('.ft-fcard')?.scrollIntoView({ block: 'center', behavior: reduced || !ms ? 'auto' : 'smooth' }); return; }
  if (!visible()) return;
  const [x, y] = posOf(id), v = viewRect();
  if (isMobile()) kMin = Math.min(kMin, 1);
  const k = Math.max(d3.zoomTransform(treeEl).k, kMin);
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * x, v.y + v.h / 2 - k * y).scale(k), ms);
}
$('ft-zin').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1.4);
$('ft-zout').onclick = () => svg.transition().duration(reduced ? 0 : 250).call(zoom.scaleBy, 1 / 1.4);
$('ft-zfit').onclick = () => fit();
$('ft-goFloat').onclick = () => floats.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });

/* ---------- deep links: #/b/<key> opens the page centred on that branch ---------- */
let branchKey = null;      // the branch a deep link is showing; its marker survives redraws
function markBranch() {
  host.querySelectorAll('.ft-fcard.hit, .node.hit').forEach(e => e.classList.remove('hit'));
  const b = CONFIG.branches[branchKey]; if (!b) return [];
  if (b.floats) { const cards = b.floats.map(id => nodeEls.get(id)?.g.closest('.ft-fcard')).filter(Boolean); cards.forEach(c => c.classList.add('hit')); return cards; }
  const n = nodeEls.get(b.root); if (n) n.g.classList.add('hit');
  return n ? [n.g] : [];
}
function focusBranch(key, ms = 700) {
  const b = CONFIG.branches[key]; if (!b) return false;
  branchKey = key;
  const marked = markBranch(); if (!marked.length) return false;
  if (b.floats) { marked[0].scrollIntoView({ block: 'center', behavior: reduced || !ms ? 'auto' : 'smooth' }); return true; }
  if (!visible()) return false;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  (function walk(id) { const f = fan.get(id); if (!f) return; x0 = Math.min(x0, f.x - f.nr); x1 = Math.max(x1, f.x + f.nr); y0 = Math.min(y0, f.y - f.nr); y1 = Math.max(y1, f.y + f.nr); kids.get(id).forEach(walk); })(b.root);
  stage.scrollIntoView({ block: 'center', behavior: 'auto' });
  const v = viewRect(), pad = isMobile() ? 34 : 80;
  const k = Math.min(1.6, (v.w - pad * 2) / (x1 - x0), (v.h - pad * 2) / (y1 - y0));
  go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * (x0 + x1) / 2, v.y + v.h / 2 - k * (y0 + y1) / 2).scale(k), ms);
  return true;
}
function onHash() { const m = /^#\/b\/([\w-]+)$/.exec(location.hash); return m ? focusBranch(m[1]) : false; }
window.addEventListener('hashchange', onHash);

/* ---------- 1987 toggle ---------- */
t87.addEventListener('change', () => {
  treeEl.classList.toggle('show87', t87.checked);
  if (t87.checked) { const v = viewRect(), k = Math.max(0.45, Math.min(1, v.h / 900, v.w / 640)); go(d3.zoomIdentity.translate(v.x + v.w / 2 - k * 90, v.y + v.h / 2 - k * 335).scale(k)); }
});

/* ---------- panel ---------- */
const stPill = (s, label) => `<span class="st ${stKey(s)}">${esc(label || s || '—')}</span>`;
const personBtn = id => { const p = byId.get(id); return p ? `<button type="button" class="pl ${stKey(p.status)}" data-go="${esc(id)}">${esc(p.name_as_written)}</button>` : ''; };
const level = c => { const s = String(c || ''); return s.startsWith('عالية') ? 3 : s.startsWith('متوسطة') ? 2 : s.startsWith('منخفضة') ? 1 : 0; };
const dotsHtml = (c, title) => { const n = level(c); return c ? `<span class="conf c${n}" title="${esc(title)}">${n ? [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') : ''} ${esc(c)}</span>` : ''; };
const pageTxt = pg => pg == null || pg === '' ? '' : (typeof pg === 'number' || /^\d+$/.test(String(pg)) ? t('tree_page_book', { n: pg }) : String(pg));
const imgHtml = (src, page) => src
  ? `<button type="button" class="img has" data-img="${esc(asset(src))}" aria-label="${esc(t('tree_img_zoom'))}"><img src="${esc(asset(src))}" alt="${esc(t('tree_img_alt'))} ${esc(pageTxt(page))}" loading="lazy" decoding="async"></button>`
  : '';
// mandatory credits under every scan: where it was published and which archive file it came from
function creditHtml(recs) {
  const uniq = k => [...new Set(recs.map(d => d[k]).filter(Boolean))];
  return uniq('credit').map(c => `<div class="cr">${esc(c)}</div>`).join('') +
    uniq('original_owner').map(o => `<div class="cr">${esc(t('tree_owner'))} ${esc(o)}</div>`).join('');
}
function docHtml(d, n, nameInDoc) {
  const date = [d.date_as_written, d.date_hijri ? `(${d.date_hijri}${t('tree_ah')})` : ''].filter(Boolean).join(' ');
  const audit = [['tree_orig_vs_restored', d.original_vs_restored], ['tree_caption_vs_image', d.caption_vs_image], ['tree_better_image', d.needs_better_image_reason]].filter(x => x[1]);
  return `<div class="doc">
    <div class="dh">${n > 1 ? `<span class="dn">${esc(t('tree_doc_n', { i: d.doc_index, n }))}</span>` : ''}<span class="dt">${esc(d.doc_type || '')}</span><span>${esc(date || t('tree_no_date'))}</span>${dotsHtml(d.legibility, t('tree_legibility'))}</div>
    ${nameInDoc ? `<div class="meta2">${esc(t('tree_name_in_doc'))} ${esc(nameInDoc)}</div>` : ''}
    ${d.transcription_ar ? `<div class="ql">${esc(t('tree_transcription'))}</div><pre class="tr" dir="rtl">${esc(d.transcription_ar)}</pre>` : ''}
    ${d.explain_ar ? `<div class="ql">${esc(t('tree_explain'))}</div><p class="note">${esc(d.explain_ar)}</p>` : ''}
    ${audit.length ? `<details class="audit"><summary>${esc(t('tree_audit'))}</summary><dl>${audit.map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>` : ''}
  </div>`;
}
// one card per evidence item of the person; `seen` avoids repeating a page's full text when two quotes share a scan
function evHtml(e, seen) {
  const id = e.image ? imageId(e.image) : '', recs = docsByImage.get(id) || [];
  const repeat = id && seen.has(id); if (id) seen.add(id);
  let body = '';
  if (repeat) body = `<div class="meta2">${esc(t('tree_doc_above'))}</div>`;
  else if (recs.length) body = recs.map(d => docHtml(d, recs.length)).join('');
  else if (e.transcription || e.explain) body = `<div class="doc">${e.transcription ? `<div class="ql">${esc(t('tree_transcription'))}</div><pre class="tr" dir="rtl">${esc(e.transcription)}</pre>` : ''}${e.explain ? `<div class="ql">${esc(t('tree_explain'))}</div><p class="note">${esc(e.explain)}</p>` : ''}</div>`;
  return `<article class="ev">
    <div class="evh"><span class="pg">${esc(pageTxt(e.page))}</span><span>${esc(e.date || t('tree_no_date'))}</span>${dotsHtml(e.confidence, t('tree_confidence'))}</div>
    <div class="ql">${esc(t('tree_quote'))}</div>
    <p class="qt">${esc(e.quote || '')}</p>
    ${imgHtml(e.image, e.page)}${creditHtml(recs)}
    ${e.source ? `<div class="meta2">${esc(t('tree_source'))}: ${esc(e.source)}${e.doc_id ? ` · ${esc(e.doc_id)}` : ''}</div>` : ''}
    ${body}
  </article>`;
}
// documents that name the person although tree.json has no evidence item for that page
function mentionHtml(imgId, recs, pid) {
  return `<article class="ev">
    <div class="evh"><span class="pg">${esc(pageTxt(recs[0].page))}</span></div>
    ${imgHtml(`assets/evidence/${imgId}.webp`, recs[0].page)}${creditHtml(recs)}
    ${recs.map(d => docHtml(d, (docsByImage.get(imgId) || []).length, (d.persons.find(x => x.tree_id === pid) || {}).name)).join('')}
  </article>`;
}
function genText(p) { return p.generation == null ? t('tree_gen_unknown') : p.generation === 0 ? t('tree_gen_zero') : p.generation < 0 ? t('tree_gen_top', { n: p.generation }) : t('tree_gen', { n: p.generation }); }
function openPerson(id, { center = true } = {}) {
  if (id === 'r87_fadl' || id === 'r87_hm') return open1987(id, center);
  const p = byId.get(id); if (!p) return;
  setSelected(id);
  pEyebrow.textContent = [genText(p), p.branch].filter(Boolean).join(' · ');
  pName.textContent = p.name_as_written;
  const f = p.father_id && byId.get(p.father_id);
  // the status describes the link to the father, not the person: say so, once
  pStatus.innerHTML = stPill(p.status, f ? t('tree_link_to_father', { s: linkLabel(p) }) : stText(p.status));
  const ks = kids.get(id) || [];
  let fatherRow;
  if (f) fatherRow = personBtn(f.id);
  else if (id === CONFIG.spine[0]) fatherRow = `<span class="muted">${esc(t('tree_above_ali'))}</span>`;
  else fatherRow = `<span class="muted">${esc(t('tree_father_none'))}</span>`;
  const ev = p.evidence || [], seen = new Set();
  let html = `<section class="sec"><dl class="kv">
      <dt>${esc(t('tree_father'))}</dt><dd>${fatherRow}</dd>
      ${p.earliest_doc_date ? `<dt>${esc(t('tree_earliest'))}</dt><dd class="v">${esc(p.earliest_doc_date)}${/^\d+$/.test(p.earliest_doc_date) ? esc(t('tree_ah')) : ''}</dd>` : ''}
    </dl></section>`;
  if (ks.length) html += `<section class="sec"><h4>${esc(t('tree_children'))} (${ks.length})</h4><div class="chips">${ks.map(personBtn).join('')}</div></section>`;
  html += `<section class="sec"><h4>${esc(t('tree_docs'))} (${ev.length})</h4>${ev.length ? ev.map(e => evHtml(e, seen)).join('') : `<div class="box"><span class="v">${esc(t('tree_docs_none'))}</span></div>`}</section>`;
  const more = new Map();
  (docsByPerson.get(id) || []).forEach(d => { if (!seen.has(d.image_id)) { if (!more.has(d.image_id)) more.set(d.image_id, []); more.get(d.image_id).push(d); } });
  if (more.size) html += `<section class="sec"><h4>${esc(t('tree_docs_mention'))} (${more.size})</h4>${[...more].map(([img, recs]) => mentionHtml(img, recs, id)).join('')}</section>`;
  if (id === CONFIG.spine[0] && CONFIG.posterAli) html += `<section class="sec"><h4>${esc(t('tree_poster_title'))}</h4><p class="note">${esc(t('tree_poster_note', { name: p.name_as_written, x: CONFIG.posterAli }))}</p></section>`;
  if (p.notes) html += `<section class="sec"><h4>${esc(t('tree_audit'))}</h4><p class="note">${esc(p.notes)}</p></section>`;
  const av = p.author_version;
  if (av) html += `<section class="sec"><h4>${esc(t('tree_author_version'))}</h4><div class="box"><div>${esc(av.father_per_author || '')}</div><div>${stPill(av.status)}</div>${av.basis ? `<div class="muted">${esc(av.basis)}</div>` : ''}</div></section>`;
  pBody.innerHTML = html; pBody.scrollTop = 0;
  showPanel(id); if (center) requestAnimationFrame(() => centerOn(id, nodeEls.has(id) ? 1.25 : 0.95));
}
function open1987(id, center) {
  setSelected(id);
  pEyebrow.textContent = t('tree_r87_eyebrow');
  pName.textContent = CONFIG.reading1987.boxes.find(b => b.id === id).label;
  pStatus.innerHTML = `<span class="st author">${esc(t('tree_r87_status'))}</span>`;
  const ev = (umar.evidence || []).filter(e => String(e.page) === '168'), seen = new Set();
  const note = esc(t('tree_r87_note')).replace(/\{(\w+)\}/g, (m, k) => personBtn(k) || m);
  pBody.innerHTML = `<section class="sec"><p class="note">${note}</p></section>
    <section class="sec"><h4>${esc(t('tree_r87_text'))}</h4>${ev.map(e => evHtml(e, seen)).join('')}</section>
    <section class="sec"><h4>${esc(t('tree_r87_link'))}</h4><div class="chips">${personBtn('umar')} ${stPill(abd.status, linkLabel(abd))} ${personBtn(ROOT)}</div></section>`;
  pBody.scrollTop = 0;
  showPanel(id); if (center) requestAnimationFrame(() => centerOn(id, 0.95));
}
function setSelected(id) {
  if (selected) { nodeEls.get(selected)?.g.classList.remove('sel'); spineEls.get(selected)?.classList.remove('sel'); }
  selected = id; nodeEls.get(id)?.g.classList.add('sel'); spineEls.get(id)?.classList.add('sel');
}
function showPanel(id) { placePanel(id); panel.classList.add('open'); floats.classList.toggle('has-panel', panel.parentNode === floats); }
function closePanel() { panel.classList.remove('open'); floats.classList.remove('has-panel'); setSelected(null); }
function closeLightbox() { lightbox.hidden = true; lbImg.removeAttribute('src'); }
$('ft-pClose').onclick = closePanel;
pBody.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (b) { if (b.dataset.go.startsWith('r87')) return; openPerson(b.dataset.go); return; }
  const im = e.target.closest('[data-img]'); if (im) { lbImg.src = im.dataset.img; lightbox.hidden = false; }
});
lightbox.onclick = closeLightbox;
// the bottom sheet is position:fixed, but #view-tree keeps a transform from its fade-up animation, so on phones it lives in <body>
// on desktop it sits in the block that holds the selected name: the stage, or the unattached-branches block
function placePanel(id) { const target = isMobile() ? document.body : (id && flo.has(id) ? floats : stage); if (panel.parentNode !== target) target.appendChild(panel); floats.classList.toggle('has-panel', target === floats && panel.classList.contains('open')); }
mqMobile.addEventListener('change', () => placePanel(selected)); placePanel(selected);

function onActivate(e) {
  const g = e.target.closest('[data-id]'); if (!g) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  hideTip();
  openPerson(g.dataset.id);
  // a finger has no hover: show the tooltip briefly once the tree has settled
  if (lastPointer === 'touch') { clearTimeout(tipTimer); tipTimer = setTimeout(() => { showTip(g); tipTimer = setTimeout(hideTip, 2500); }, 750); }
}
['click', 'keydown'].forEach(type => { world.addEventListener(type, onActivate); fcards.addEventListener(type, onActivate); });

/* ---------- tooltip: full name and lineage line, for every circle and plaque ---------- */
let lastPointer = 'mouse', tipTimer;
function lineage(id) {
  const out = []; let p = byId.get(id), guard = 0;
  while (p && guard++ < 40) { out.unshift(shortName(p)); p = p.father_id && byId.get(p.father_id); }
  return out.join(' ← ');
}
function showTip(g) {
  const p = byId.get(g.dataset.id); if (!p || !g.isConnected) return;
  tip.innerHTML = `<b>${esc(p.name_as_written)}</b><span>${esc(lineage(p.id))}</span>`;
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!lightbox.hidden) closeLightbox(); else if (panel.classList.contains('open')) closePanel(); } });

/* ---------- search ---------- */
const index = persons.map(p => ({ id: p.id, n: norm(p.name_as_written + ' ' + (p.short_name || '')), p }));
let hits = [], cursor = 0;
function renderHits() {
  results.innerHTML = hits.length ? hits.map((h, i) => `<li role="option" id="ft-opt${i}" aria-selected="${i === cursor}" data-go="${esc(h.id)}"><span class="rn">${esc(h.p.name_as_written)}</span><span class="rm">${esc([genText(h.p), h.p.branch].filter(Boolean).join(' · '))}</span></li>`).join('')
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
  const n = nodeEls.get(id);
  if (n) { n.g.classList.remove('hit'); void n.g.getBBox(); n.g.classList.add('hit'); setTimeout(() => n.g.classList.remove('hit'), 3400); }
  openPerson(id, { center: false });
  requestAnimationFrame(() => centerOn(id, n ? 1.4 : 0.95, 700));
}

/* ---------- legend ---------- */
function drawLegend() {
  const c = { ok: 0, maybe: 0, author: 0 }; persons.forEach(p => c[stKey(p.status)]++);
  const sample = k => {
    const line = k === 'author' ? '<path d="M2 10H24" stroke="var(--ft-author)" stroke-width="5" stroke-linecap="round"/><path d="M2 10H24" stroke="var(--ft-sheet)" stroke-width="2.4" stroke-linecap="round"/>'
      : k === 'maybe' ? '<path d="M2 10H24" stroke="var(--ft-maybe)" stroke-width="3" stroke-dasharray="5 3"/>' : '<path d="M2 10H24" stroke="var(--ft-trunk)" stroke-width="3" stroke-linecap="round"/>';
    const circ = k === 'author' ? '<circle cx="36" cy="10" r="8" fill="var(--ft-sheet)" stroke="var(--ft-author)" stroke-width="1.3" stroke-dasharray="1.6 2.6"/>'
      : k === 'maybe' ? '<circle cx="36" cy="10" r="8" fill="var(--ft-sheet)" stroke="var(--ft-maybe)" stroke-width="2" stroke-dasharray="4 2.6"/>' : '<circle cx="36" cy="10" r="8" fill="var(--ft-sheet)" stroke="var(--ft-ink)" stroke-width="2"/>';
    return `<svg viewBox="0 0 46 20" aria-hidden="true">${line}${circ}</svg>`;
  };
  $('ft-legend-body').innerHTML = `<div class="lt">${esc(t('tree_legend_title'))}</div>
    ${['ok', 'maybe', 'author'].map(k => `<div class="row">${sample(k)}<span>${esc(t('tree_status_' + k))}</span><span class="n">${c[k]}</span></div>`).join('')}
    <div class="hint">${esc(t('tree_legend_hint'))}</div>`;
}

/* ---------- boot ---------- */
let drawn = false, fitted = false, lastW = 0, lastH = 0;
function render() {
  if (!hasStrings()) return;
  draw(); drawn = true;
  if (!fitted && visible()) { fit(0); fitted = true; lastW = stage.clientWidth; lastH = stage.clientHeight; requestAnimationFrame(onHash); }
  if (selected && panel.classList.contains('open')) openPerson(selected, { center: false });
}
render();
// main.js sets <html lang> after it has loaded data/data_<lang>.js: draw then, and redraw on every language switch
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
// circle labels are measured with the web fonts, which load late
if (document.fonts) {
  let ft; const refit = () => { clearTimeout(ft); ft = setTimeout(() => { if (drawn) draw(); }, 60); };
  if (document.fonts.ready) document.fonts.ready.then(refit);
  document.fonts.addEventListener?.('loadingdone', refit);
}
// refit when the stage changes size; a hidden tab reports 0×0, so close anything that floats above the page
let rt;
new ResizeObserver(() => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (!visible()) { closeLightbox(); if (panel.classList.contains('open')) closePanel(); return; }
    if (!drawn) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (fitted && W === lastW && H === lastH) return;
    const first = !fitted;
    lastW = W; lastH = H; fitted = true; fit(0);
    if (first) requestAnimationFrame(onHash);
  }, 150);
}).observe(stage);

window.__ftree = { openPerson, centerOn, fit, fan, focusBranch, count: () => new Set([...host.querySelectorAll('.ft-svg [data-id]')].map(e => e.dataset.id).filter(id => !id.startsWith('r87_'))).size };
}

/* ---------- load ---------- */
const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
Promise.all([getJSON(asset('data/tree.json')), getJSON(asset('data/docs.json'))])
  .then(([tree, docs]) => init(Array.isArray(tree) ? tree : (tree.persons || []), Array.isArray(docs) ? docs : []))
  .catch(err => {
    console.error('Family tree failed to load', err);
    const box = document.createElement('div');
    box.className = 'ft-error';
    box.textContent = t('tree_load_error');
    $('ft-stage').appendChild(box);
  });
})();
