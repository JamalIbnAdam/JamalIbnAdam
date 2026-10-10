// Writes data/stats.json ({ names, documents, oldest_hijri, references }) from data/tree.json, data/docs.json and
// data/sources.json (the references list). The pages read this small file instead of the full data. Run after every data update:
//   node scripts/build-stats.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));

const tree = read('data/tree.json');
const docs = read('data/docs.json');
const sources = read('data/sources.json');   // the references list shown on the home page and in the library
const persons = (Array.isArray(tree) ? tree : tree.persons || []).filter((p) => !p.placeholder);
const dated = docs.map((d) => Number(d.date_hijri)).filter((n) => Number.isFinite(n) && n > 0);
const stats = { names: persons.length, documents: docs.length, oldest_hijri: dated.length ? Math.min(...dated) : null, references: sources.length };

fs.writeFileSync(new URL('data/stats.json', root), JSON.stringify(stats, null, 1) + '\n');
console.log('data/stats.json', stats);
