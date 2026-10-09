// Writes data/stats.json ({ names, documents, oldest_hijri }) from data/tree.json and data/docs.json.
// The home page reads this small file instead of the full data. Run after every data update:
//   node scripts/build-stats.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));

const tree = read('data/tree.json');
const docs = read('data/docs.json');
const persons = (Array.isArray(tree) ? tree : tree.persons || []).filter((p) => !p.placeholder);
const dated = docs.map((d) => Number(d.date_hijri)).filter((n) => Number.isFinite(n) && n > 0);
const stats = { names: persons.length, documents: docs.length, oldest_hijri: dated.length ? Math.min(...dated) : null };

fs.writeFileSync(new URL('data/stats.json', root), JSON.stringify(stats, null, 1) + '\n');
console.log('data/stats.json', stats);
