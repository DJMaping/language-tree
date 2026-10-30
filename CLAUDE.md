# CLAUDE.md

This file guides Claude Code when working in this repository.

## What this is

A standalone local visualizer/editor for **DJ's Andah conlang family trees over
time** — a vertical timeline (oldest at top, Andah years, negatives before the
epoch) drawing languages as boxes: stages chain straight down one column
(Proto-X → Old X → Modern X), daughters branch sideways, creole second parents
and borrowing arrows are dashed overlays. Vanilla HTML/CSS/JS + SVG with a
**zero-dependency** Node server. It is deliberately **not** part of the
andah_games website repo (sibling folder), and must stay dependency-free.

## Run / verify

```bash
npm start            # dev server on http://localhost:4177 (plain, stays running)
npm run validate     # schema-check data/languages.json — RUN THIS AFTER EVERY HAND-EDIT
npm test             # zero-dep unit tests for validate.js + model.js (vitality, structure)
```

DJ launches it via **start.bat** → `scripts/hidden-launch.vbs` runs
`node server.js --open --auto-exit` with no console: `--open` prefers an
Edge/Chrome `--app=` window (desktop-app feel), `--auto-exit` shuts the server
down ~45s after the last SSE client (i.e. the window) disappears. `npm start`
has neither flag, so it behaves like a normal dev server.

If port 4177 is busy the app is already running (the server exits politely).
API for programmatic checks: `GET /api/data` → `{rev, doc}`, `PUT /api/data`
with `{baseRev, doc}` (409 on stale rev, 400 with `{errors:[{path,message}]}`),
`GET /api/version`, `GET /api/events` (SSE; fires on external file edits),
`POST /api/open-polyglot {id}` → `{ok:true}` or `{error}` (launches PolyGlot).

## File map

| Path | Purpose |
|---|---|
| `data/languages.json` | **The single source of truth.** Everything else renders it. |
| `server.js` | Static + versioned data API + atomic writes + rolling backups + SSE watch + `/api/open-polyglot`. Zero-dep — keep it that way. |
| `js/validate.js` | Shared schema validation (browser + server + CLI all import it). |
| `js/model.js` | Indexes over the doc (children, stage chains, family colors) + `lineageOf`/`siblingsOf` (highlight + keyboard nav) + `borrowingById`/`eventById`. |
| `js/layout.js` | Column layout: chains share a column, branch subtrees pack rightward; a `collapsed` Set folds subtrees and yields `hiddenCounts` for the +N badges. |
| `js/view.js` | SVG renderer (semantic zoom). Also draws the interaction overlays, borrowing kinds, timeline events, collapse badges, lineage-highlight/scrub classes. Typed `selected` ({type,id}). |
| `js/axis.js` | Adaptive year ticks (century → decade → year by zoom) + the draggable year-scrubber chip. |
| `js/main.js` | State owner + all gestures, context menus, typed selection, undo/redo, collapse, scrub, keyboard nav, search/export/polyglot wiring, save/reload/SSE flow. |
| `js/menu.js` | Generic context-menu component (`showMenu`/`closeMenu`). |
| `js/search.js` | Ctrl+K language finder overlay (jumps via `focusLanguage`). |
| `js/export.js` | PNG/SVG image export (re-renders the tree into a standalone, self-styled SVG). |
| `js/panel.js` / `js/forms.js` | Stateless detail panel / `<dialog>` edit forms (languages, borrowings-with-kind, events, settings). |
| `start.bat` + `scripts/hidden-launch.vbs` | Invisible-server launcher for the app-window experience. |
| `docs/schema.md` | Canonical schema reference. |
| `js/engine/lexicon/semantics.js` | Attested semantic-shift paths (metaphor, metonymy, broadening, narrowing, pejoration, amelioration, bleaching). Constrains replacement's neighbour strategy and produces false friends. Every path carries a real example — **an unattested path is a fabrication and does not belong in the table.** |
| `js/engine/morphology/analogy.js` | Analogical levelling: stem levelling, class absorption, syncretism extension. The accelerator that gives morphological erosion a fast tail. Frequency is the only thing that resists. |
| `js/engine/morphology/grammaticalisation.js` | Content word → bound morpheme along attested clines, plus outright category loss. The only mechanism that can give a daughter a category its proto lacked. |
| `js/engine/phonology/tidy.js` | The counter-pressure that runs alongside the ruleset: neutralises contrasts with no functional load, caps the vowel cross-product, collapses impossible triple segments, and reduces over-long high-frequency words. Functional load is measured in **minimal pairs, not token counts** — a segment occurring twice is not marginal if those two words are "you (pl)" and "five". Paradigm cells are excluded from reduction: morphology erodes through the ruleset, not here. |
| `scripts/lang-correspond.js` | The comparative method, run blind. Throws away the derivation histories, aligns cognates from surface forms alone, and prints the sound-correspondence table a linguist would build — then scores whether the family is reconstructible at all. Reconstructs against the compared languages' **most recent common ancestor**, and conditions each correspondence on its environment; without both, the numbers are meaningless. Validated on a 200-year split, which must score near-perfect (it gives 91.9%). |
| `js/engine/lexicon/therapy.js` | Repair of homonymic clash (Gilliéron's gat/cattus). Decides which collisions a language will not tolerate — closed classes above all — and rebuilds the rarer member as a compound. Without it, 87% of languages had two closed-class meanings on one form and 10% had two homophonous pronouns. Not every clash is repaired, and modelling that is the point. |
| `scripts/lang-scorecard.js` | `npm run scorecard`: the table every review gate looks at. Every family over its living leaves against Earth bands: vowelless words, homophony, irregular words (read off the derivations), blind regularity, inventories on one ruler, the marked-series ratchet, frozen living parents. `--save`/`--compare` for before/after. Counting lives in `scripts/measures.js` so both sides of a comparison use one ruler. |
| `scripts/lang-pin.js` | `npm run pin -- <root>`: pin an approved family (frozen evidence names + pinned sound changes) to `data/lang/<root>.lang.json`, listed in `data/lang/index.json`; `--unpin`, `--check`. A pinned family survives renames, new boxes and drags (which only re-time). Unpinned families regenerate freely. |
| `data/lang/` | Pin files, one per pinned family, plus `index.json`. Written only by `lang-pin.js`. |
| `js/views.js` + `js/views/*.js` | The **Views window** (top-bar Views, or V; Esc closes): language map, typology maps, family dashboard, measured relatedness, word across the tree, name forge, dictionary, contact web, era snapshots. Map outlines from `data/canon/country-shapes.json` (DJ's map via andah-atlas). |
| `js/views/history.js` | **Through time**: DJ's 657 yearly civilisation maps as a language map (year slider, play; ONE layer at a time, commoners or rulers, never merged (DJ); colour by language, family, any typology feature or one word; isoglosses; contact arrows), and tables for civilisation -> language, border/sea/sea-trade/superstrate/substrate suggestions (approve -> borrowings with `until` and `strength`), date clashes, Paint.NET keyframes. Data from `data/cache/years/` (in git since 15 Oct 2026, except ocr/ and kf/). |
| `scripts/build-years.py` + `scripts/build_years_languages.py` | `npm run years` (all; ~4 min) / `npm run years-languages` (~2 min; after editing civs, keyframes, shift dials or the chart). Stage 1 reads `Documents/Andah Hisotry/Every Year` (AFA+BFA folders) into 4000x2000 frames (palette PNGs; the working grid for shift, areas, borders and names is every other pixel, 2000x1000), reading legends with Windows OCR (`scripts/ocr.ps1`). Stage 2: civ -> language (name, else what its own people spoke on the commoners' map), rulers' layer, the commoners' layer from KEYFRAMES ONLY (`scripts/build_years_commoners.py`: 1765 = DJ's family map by country, `data/canon/family-map-legend.json`; starter keyframes every 100 years worked out backwards, 'earlier rulers, else lost'; between keyframes a place switches once its new family has ruled it ~300 years; dials in `data/history/shift.json`; OLD DIALECTS (`npm run dialects`: scripts/build_years_dialects.py proposes into `data/history/dialects.json`, scripts/build-dialects.js adds them to the chart as `"generated": "old-dialect"` branches named "<City> <Language>" from `data/canon/cities.json` or an engine-forged region, and the build carves each standard's land among them; generated languages are NOT evidence for a family's character, so adding them never changes existing words); `data/language-maps/starters.json` records the app's own files, an edited one is DJ's and never overwritten), borders, sea, sea trade (`data/canon/sea-lanes.json`), clashes, continuum colours, permanent paint key (`data/language-maps/key.json`). DJ's choices: `data/history/civs.json`, `decisions.json`; his keyframes: `data/language-maps/<year> - rulers|commoners.png`. Needs Python with numpy, scipy, Pillow. |
| `js/views/{matrix,origins,sounds,shapes,distances}.js` | Contact matrix; word origins (vocabulary layers through time); sounds (IPA charts, comparison, sound-change timeline); tree shapes (radial, sunburst, treemap); distance plots (MDS, splits network). |
| `scripts/build-earth.js` | `npm run earth-map`: the Earth side of the typology maps from Natural Earth (andah-atlas copy) + WALS CSVs (`data/earth-src/wals/`, not in git) + `data/canon/earth-main-languages.json`; shared bands in `js/views/typology-bins.js`. |
| `scripts/typology-score.js`, `scripts/assign-cases.js` | `npm run typology`: Andah's living languages against WALS per feature, one vote per branch as WALS samples (`--raw` for one per language); the scorecard for Earth-likeness (DJ, 15 Oct 2026: tune toward Earth). `assign-cases.js --write`: stratified case systems per family at Earth's rates into lang-config.json (`casesBy` marks them; hand-set cases are left alone). Each family's `consonantTarget` (lang-config; Claude's picks 15 Oct, DJ: "you pick"; `assign-consonants.js` can redo them by stratified draw) sizes its proto inventory and pulls its lineages back to that size. The engine's typology gate is in `soundchange/generate.js` (WALS 1A/2A/11A frequencies). |
| `scripts/render-view.js`, `scripts/render-years.py` | A view to HTML/PNG (headless Edge), and yearly maps to PNG or GIF, for sending to DJ's laptop. |
| `scripts/build-views.js` | `npm run views`: precomputes `data/views.json` (every language's features and 207 basic words with cognate ids, each family's measured distances and UPGMA tree) for the views that compare all languages; about 30 s. Rerun after editing the chart; the window warns when stale. |
| `scripts/build-evidence.js`, `scripts/world.js`, `js/engine/character.js` | Each family's evidence corpus (canon city names, `data/evidence.json`), the shared inputs every script passes to `createProject`, and the inference of a family's character from that evidence (`npm run character` reports it). |
| `js/views/glyph-editor.js`, `js/views/script-hands.js` | The Scripts window's **Draw** and **Hands** tabs: draw or trace a sign, pick a script's hand from four. They save through `POST /api/scripts/own` (server.js), which writes `data/scripts-own.json`, then `scripts/patch-own.js` (seconds; the full `npm run scripts` only when a drawing is carried down) and the fonts (docs/writing-systems-plan.md, step 9). |
| `js/engine/script/own.js`, `js/engine/script/trace.js` | DJ's own hand: signs keyed by what they write (as the lock keys them), the signs that came from one, a hand change that keeps letters on their line; and a drawing traced into strokes. Shared by the browser and the build. |
| `data/scripts-own.json` | DJ's drawn signs and picked hands. They win over the engine and over `data/scripts-lock.json`; written only through the app. |
| `docs/overhaul-plan.md` | The language-tree overhaul plan (Oct 2026): findings, phases, review gates and what each phase delivered. |
| `backups/` | Server-managed rolling backups. **Never edit, never commit** (gitignored). |

## The data file (condensed — full rules in docs/schema.md)

```json
{
  "config": { "title": "…", "presentYear": 1776, "axis": { "zeroLabel": "1" } },
  "languages": [
    { "id": "proto-demovian", "name": "Proto-Demovian", "born": -800, "died": -350 },
    { "id": "old-demovian", "name": "Old Demovian", "born": -350, "died": 450,
      "parentId": "proto-demovian", "relation": "stage" },
    { "id": "brelvic", "name": "Brelvic", "born": -420, "died": 900,
      "parentId": "proto-demovian", "relation": "branch" },
    { "id": "portside-creole", "name": "Portside Creole", "born": 1500,
      "parentId": "demovian", "relation": "branch", "secondaryParentId": "tessic" }
  ],
  "borrowings": [
    { "id": "b1", "fromId": "brelvic", "toId": "old-demovian", "year": -200,
      "label": "sea-trade loanwords", "kind": "loan" }
  ],
  "events": [
    { "id": "ev1", "label": "The Long Winter", "year": 800, "endYear": 950, "color": "#b32424" }
  ]
}
```

Key rules (all machine-enforced; violations block the save and name the path):

- `id`: lowercase slug, unique. **Auto-tracks `name`**: renaming a language (F2 inline
  or the edit form) reslugs the id and cascades the change through every reference
  (`parentId`, `secondaryParentId`, borrowings' `fromId`/`toId`) in one validated save.
  Don't hand-rename an id without cascading, and don't rely on an id staying stable
  across a rename (external bookmarks/localStorage collapse-state for the old id are dropped).
- `born`/`died` integers; `died ≥ born`; omit `died` for living languages. A `died`
  WITH a stage successor is a hand-over year (no †), without one it's an extinction (†).
- `diverged` (optional bool): the language evolved away into its descendants
  (e.g. a proto-language), not a death — no † and **no end marker** at all (the
  descendants carry the line onward). `died` is optional here: if omitted, the end
  year is auto-derived from the last successor's birth — a branch daughter OR a stage
  successor (`model.diedOf`/`divergenceYearOf`); set `died` to override. Needs a
  `died` or ≥1 successor (daughter or stage). Use this rather than an extinction †
  for proto-languages — no death date required.
- `relation` `"stage"` = same language renamed (max ONE stage child per language;
  stage born strictly > parent born). `"branch"` = daughter (born ≥ parent born).
- `secondaryParentId` (creoles) requires and must differ from `parentId`. No ancestry cycles.
- Optional language fields: `order` (sibling sort, lower = left), `color` (subtree
  override), `notes`, `polyglotFile` (path to its `.pgd`; drives the panel's *Open in
  PolyGlot* button).
- Attestation/certainty flags (optional booleans): `reconstructed` (unattested — dashed
  box + leading `*`), `bornCirca`/`diedCirca` (approximate endpoint — label reads `c.<year>`,
  and `bornCirca` feathers the box's top edge). All proto-* roots are marked reconstructed.
- `populationSeries` (optional): a few `{year, count}` speaker points. Drives an
  **endangerment badge** (colored dot, top-right of the box) derived by `model.vitalityOf`
  on the UNESCO scale — EX Extinct / CR Critically / SE Severely / DE Definitely
  Endangered / VU Vulnerable / NE Safe (peak-relative ratio, so scale-independent;
  recovering promotes one step, capped at VU) — plus a sparkline in the panel. While
  scrubbing/playing the badge reflects the population AT the play-head year
  (`model.vitalityAt`). Opt-in: no series → no badge.
- `region` (optional string): a geographic area, independent of ancestry. The overview's
  **Regions** section (and the detail panel) offer a `focus-region` that dims other regions
  (a `state.filter` of `{kind:'region', region}`, alongside living/family). The edit form
  autocompletes existing region names. Regions are deliberately unpopulated in the demo data —
  they're DJ's worldbuilding to fill in.
- `borrowings[].kind` ∈ `loan` (default, may be omitted) / `substrate` / `superstrate`
  / `areal`; `year`/`label` optional.
- `events[]` are a separate historical layer: `id`, `label`, `year` required;
  `endYear` (spanning band), `notes`, `color` optional. Not part of ancestry.
- `config.polyglotPath` (optional): full path to `PolyGlot.exe`/`.jar` for the
  launch feature; the `ANDAH_POLYGLOT_PATH` env var overrides it.

## When DJ asks you to generate languages/families

- Edit `data/languages.json` directly, then run `npm run validate`. If the app is
  open it refreshes itself (SSE) — no need to touch the server or restart anything.
- Andah years: negative = before the epoch; present is `config.presentYear`
  (lore: Andah year = Earth year − 250). Keep dates plausible against parents.
- The **Demovian + Tessic families are disposable demo content** — replaceable
  wholesale when real families arrive.
- DJ's **real** lore names live on his Andah wiki (e.g. Lastnu, Inanian, Ocunese,
  Shie Dahen, Qai Dahen, Verstian, Praesian; families Casa-Mahean, Kuhn,
  Dahen-Kino, Zanalaric, Alzuria-Ayuman). **Never invent history/dates for those
  real names without asking him** — invented placeholder families are fine, lore
  pollution is not.
- Alternatively use the API (`GET /api/data` for `{rev, doc}`, `PUT` back with
  `baseRev`), but direct file editing is simpler and equivalent.

## Interaction model (v2 — don't regress these)

Direct manipulation is the primary authoring path; the side panel and dialogs are
secondary. All of it flows through the same `applyEdit`/`saveFromUi` pipeline
(clone doc → mutate → validate → PUT), so every gesture is validated, backed up,
and undoable:

- Right-click canvas → "New language here (born N)"; right-click box → full action menu.
- Creates are **instant + inline-named**: a ghost box + name input appear in place
  (`state.pending`); Enter commits, Esc discards. Nothing is saved until the name lands.
- Dragging a box vertically changes `born` (Ctrl = whole subtree shifts, `died`
  included; a language glued to a stage successor moves `born` only). Illegal drops
  are clamped live or rejected by validation with a toast + snap-back.
- Dragging the ● bottom handle off a box creates a daughter at the drop year.
- Ctrl+Z/Ctrl+Y = in-session undo/redo (doc snapshots). The history is **cleared on
  external file changes** so undo can never clobber VS Code/Claude edits.
- Ctrl+S is intercepted and only flashes "All changes saved ✓" — saving is always automatic.
- Selection is **typed**: `state.selection = {type: 'lang'|'borrowing'|'event', id}`.
  A plain left-click selects: a box selects via the pointer gesture (single tap =
  select, double tap = edit form), a borrowing arrow / event band via `onClick`;
  clicking empty canvas clears it. The panel branches on the type. `Del`/`Backspace`
  delete the selection (any type); `Esc` clears it. Deleting a single language
  **splices**: its children reattach to its parent (a stage child stays a stage
  if the chain slot is free), dangling second-parent links/borrowings are
  cleaned up — descendants are only ever deleted by the rubber-band multi-delete. Box selection lives in the
  `box`-gesture `!moved` branch of `onPointerUp` because native `dblclick` fires
  unreliably once a pointer is captured — don't move it back onto the DOM `dblclick`.
- **Collapse** (`state.collapsed` Set, persisted to localStorage; `c` key or badge)
  folds a subtree → `computeLayout(model, collapsed)`; **scrub** (`state.scrub.year`)
  dims languages not alive that year; **lineage highlight** follows hover/selection
  via `model.lineageOf`. These are view-only — none of them touch the data file.
- **Search** (Ctrl+K, `js/search.js`) and **arrow-key nav** move the selection via
  `focusLanguage` (expands collapsed ancestors + centers). **Export** (`js/export.js`)
  re-renders a clean, self-styled SVG → PNG/SVG download.

## Invariants to preserve

- `server.js` stays zero-dependency (Node built-ins only); the whole repo has no
  npm dependencies and no build step.
- Never bypass `writeDocAtomic` semantics: backup → tmp write → rename.
- Don't touch `backups/`; don't commit it.
- The visual theme mirrors DJ's site (andah_games/css/style.css tokens); keep new
  UI on the CSS custom properties, never hardcoded colors. Family palette slots
  `--fam-0..7` are a validated colorblind-safe set — don't reorder or "improve" them.
- **Anything that rewrites a word form must push a step into its derivation
  history.** The lexicon and the etymology have to agree; `scripts/lang-check.js`
  enforces it and has caught two silent rewrites (degemination, frequency
  reduction) that between them left 77,000 words whose recorded history ended on
  a form the lexicon no longer showed.
- **A new draw must come from its own derived RNG stream**
  (`derive(seed, …, purpose)`), never from a stream something else is already
  consuming. Taking one value from a shared stream shifts every draw after it:
  adding one `rng.bool()` inside `buildPhonotactics` reshuffled the ruleset on all
  255 edges. That is what the per-purpose streams in `rng.js` exist to prevent.
- **A rule that changed nothing is not necessarily a bug** — it may have been
  bled by an earlier rule on the same edge, which is one of the four ordering
  interactions the engine exists to reproduce.
