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
- `populationSeries` (optional): a few `{year, count}` speaker points. Drives a **vitality
  badge** (colored dot, top-right of the box) derived by `model.vitalityOf` — dead / moribund /
  declining / stable / thriving (peak-relative, so scale-independent) — plus a sparkline in the
  panel. While scrubbing/playing the badge reflects the population AT the play-head year
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
  delete the selection (any type); `Esc` clears it. Box selection lives in the
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
