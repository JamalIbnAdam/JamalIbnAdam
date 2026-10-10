# jamalibnadam.com

Static site served by GitHub Pages from the `main` branch (repo root).

## Pages
- `/` — home page: `index.html`, `home.css`, `home.js`
- `/tree/` — the evidence tree: `tree/index.html`, `tree/tree.js`, `tree/tree.css`, `tree/page.js`
- `/more/` — figures, library, poem and author views: `more/index.html` with `home.css` (the home page's styles) and `more/more.js`

## Data
- `data/tree.json`, `data/docs.json` — persons and document records for the tree
- `data/stats.json` — the three numbers on the home page, generated from the two files above
- `data/sources.json` — the references list on the home page (`group`, `group_en`, `title_ar`, optional `note_ar`, `url`, `pdf`, `license`)
- `data/data_<lang>.js` — UI strings for ar, en, es, pl, tr

## After every data update
```
node scripts/build-stats.mjs
```
This rewrites `data/stats.json` from `data/tree.json`, `data/docs.json` and `data/sources.json` (the references count shown on the home page and the tree page). Commit it with the data.
Also bump `CACHE_NAME` in `sw.js` so installed copies pick up the change.

## Local preview
```
python3 -m http.server 8080
```
Then open http://localhost:8080.

`scripts/build-estimates.mjs` is the PM's tool that wrote the `birth_est` field (estimated birth dates) into `data/tree.json`. It is kept for the record; the site does not run it.
