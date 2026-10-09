# jamalibnadam.com

Static site served by GitHub Pages from the `main` branch (repo root).

## Pages
- `/` — home page: `index.html`, `home.css`, `home.js`
- `/tree/` — the evidence tree: `tree/index.html`, `tree/tree.js`, `tree/tree.css`, `tree/page.js`
- `/more/` — figures, library, poem and author views: `more/index.html` with `styles.css` and `main.js`

## Data
- `data/tree.json`, `data/docs.json` — persons and document records for the tree
- `data/stats.json` — the three numbers on the home page, generated from the two files above
- `data/sources.json` — the references list on the home page (`group`, `group_en`, `title_ar`, optional `note_ar`, `url`, `pdf`, `license`)
- `data/data_<lang>.js` — UI strings for ar, en, es, pl, tr

## After every data update
```
node scripts/build-stats.mjs
```
This rewrites `data/stats.json` from `data/tree.json` and `data/docs.json`. Commit it with the data.
Also bump `CACHE_NAME` in `sw.js` so installed copies pick up the change.

## Local preview
```
python3 -m http.server 8080
```
Then open http://localhost:8080.
