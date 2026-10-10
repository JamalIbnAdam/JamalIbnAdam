import fs from 'node:fs';
const T = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const by = new Map(T.map(p => [p.id, p]));
const kids = new Map(); T.forEach(p => { if (p.father_id) (kids.get(p.father_id) || kids.set(p.father_id, []).get(p.father_id)).push(p); });
const use = p => !p.placeholder && !p.living;
const R = new Map(); // id -> [lo,hi] Hijri birth
const why = new Map();
const set = (id, lo, hi, w) => { R.set(id, [lo, hi]); why.set(id, w); };
// hand anchors: only where a document shows the person alive and acting, or the owner gave the year
const A = {
  m3: [930, 1000, 'حفيدته ضوء بنت فضل بن محمد مذكورة سنة 1057هـ (ص154)، وابنه طاهر سنة 1089هـ (ص138)'],
  y5_yusuf: [983, 1025, 'اشترى أرضاً في آقار سنة 1043هـ (ص150–151)، فكان راشداً حياً حينها'],
  abs7: [1060, 1110, 'خاطبه السلطان في رسالة نحو 1130–1137هـ (ص148، ص164؛ القراءة منخفضة الثقة)'],
  mab8: [1090, 1150, 'ابنه أبو بكر شاهد في وثيقة 1186هـ (ص158، ص219)'],
  a_abd_yusuf: [1150, 1190, 'خاطبه السلطان برسالتين سنة 1211هـ و1219هـ (ص152، ص165)'],
  s6_salim: [1030, 1070, 'تقدير المؤلف: وُلد نحو 1045هـ'],
  oj15: [1327, 1331, 'سنة ميلاده 1911م بإفادة الأسرة'],
};
const HUGE = [700, 1450];
for (const p of T) if (use(p) || p.id === 'oj16') R.set(p.id, [...HUGE]);
for (const [id, [lo, hi, w]] of Object.entries(A)) set(id, lo, hi, w);
// upper bound from the earliest document that names the person: born no later than that year
const firstYear = s => { const m = String(s || '').match(/\d{3,4}/g); if (!m) return null; const n = m.map(Number).filter(x => x >= 900 && x <= 1450); return n.length ? Math.min(...n) : null; };
for (const p of T) if (R.has(p.id) && !A[p.id]) { const y = firstYear(p.earliest_doc_date); if (y && !/تقدير/.test(String(p.earliest_doc_date))) { const r = R.get(p.id); r[1] = Math.min(r[1], y); } }
// father–son spacing 18..60 years, propagated both ways
for (let it = 0; it < 60; it++) {
  let ch = false;
  for (const p of T) {
    const f = p.father_id && R.get(p.father_id), c = R.get(p.id);
    if (!f || !c) continue;
    const lo = Math.max(c[0], f[0] + 18), hi = Math.min(c[1], f[1] + 60);
    const flo = Math.max(f[0], c[0] - 60), fhi = Math.min(f[1], c[1] - 18);
    if (lo !== c[0] || hi !== c[1] || flo !== f[0] || fhi !== f[1]) { c[0] = lo; c[1] = hi; f[0] = flo; f[1] = fhi; ch = true; }
  }
  if (!ch) break;
}
const bad = [...R].filter(([, r]) => r[0] > r[1]); if (bad.length) { console.error('CONTRADICTION', bad); process.exit(1); }
// generation prior from the direct line: centre of each generation's range on the owner's line
const line = []; let x = by.get('oj15'); while (x) { line.push(x); x = by.get(x.father_id); }
const centre = new Map(line.filter(p => R.has(p.id) && p.generation != null).map(p => [p.generation, (R.get(p.id)[0] + R.get(p.id)[1]) / 2]));
const gens = [...centre.keys()].sort((a, b) => a - b);
const prior = g => { if (centre.has(g)) return centre.get(g); const lo = gens.filter(k => k < g).pop(), hi = gens.find(k => k > g); if (lo == null) return centre.get(hi) - 30 * (hi - g); if (hi == null) return centre.get(lo) + 32 * (g - lo); return centre.get(lo) + (centre.get(hi) - centre.get(lo)) * (g - lo) / (hi - lo); };
const out = {};
for (const p of T) {
  if (!use(p) || !R.has(p.id)) continue;
  let [lo, hi] = R.get(p.id), kind = A[p.id] ? 'doc' : 'calc', basis = why.get(p.id);
  let gLo = p.generation, gHi = p.generation;
  if (gLo == null) {   // below a run of unknown ancestors: generation = known ancestor + named steps + the run's estimated length
    let y = p, steps = 0, run = null;
    while (y && (y.generation == null || y.placeholder)) { if (y.placeholder) { run = run || y.estimate; } else steps++; y = by.get(y.father_id); }
    if (y && run) { gLo = y.generation + steps + run.min; gHi = y.generation + steps + run.max; }
  }
  if (hi - lo > 60 && gLo != null && gHi != null && p.generation == null) {
    const d = 45, plo = Math.round(prior(gLo) - d), phi = Math.round(prior(gHi) + d);
    const nlo = Math.max(lo, plo), nhi = Math.min(hi, phi);
    if (nlo <= nhi) { lo = nlo; hi = nhi; kind = 'gen'; }
  }
  if (hi - lo > 60 && p.generation != null) {
    const onLine = line.includes(p), d = onLine ? 35 : 45, c = prior(p.generation), plo = Math.round(c - d), phi = Math.round(c + d);
    const nlo = Math.max(lo, plo), nhi = Math.min(hi, phi);
    if (nlo <= nhi) { lo = nlo; hi = nhi; kind = 'gen'; }
  }
  out[p.id] = { lo, hi, kind, basis, g: p.generation, gLo, gHi };
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
const toG = h => Math.round(h * 0.970224 + 621.5774);
for (const p of line.reverse()) { const o = out[p.id]; if (o) console.log(p.generation, p.name_as_written.padEnd(28), o.lo + '–' + o.hi + 'هـ', '(' + toG(o.lo) + '–' + toG(o.hi) + 'م)', o.kind); else console.log(p.generation, p.name_as_written, '—'); }
const w = Object.values(out).map(o => o.hi - o.lo); console.log('count', w.length, 'width<=40', w.filter(v => v <= 40).length, '41-60', w.filter(v => v > 40 && v <= 60).length, '>60', w.filter(v => v > 60).length);
console.log('no estimate (deceased):', T.filter(p => use(p) && !out[p.id]).map(p => p.id).join(','));
