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
```

DJ launches it via **start.bat** → `scripts/hidden-launch.vbs` runs
`node server.js --open --auto-exit` with no console: `--open` prefers an
Edge/Chrome `--app=` window (desktop-app feel), `--auto-exit` shuts the server
down ~45s after the last SSE client (i.e. the window) disappears. `npm start`
has neither flag, so it behaves like a normal dev server.

If port 4177 is busy the app is already running (the server exits politely).
API for programmatic checks: `GET /api/data` → `{rev, doc}`, `PUT /api/data`
with `{baseRev, doc}` (409 on stale rev, 400 with `{errors:[{path,message}]}`),
`GET /api/version`, `GET /api/events` (SSE; fires on external file edits).

## File map

| Path | Purpose |
|---|---|
| `data/languages.json` | **The single source of truth.** Everything else renders it. |
| `server.js` | Static + versioned data API + atomic writes + rolling backups + SSE watch. Zero-dep — keep it that way. |
| `js/validate.js` | Shared schema validation (browser + server + CLI all import it). |
| `js/model.js` | Indexes over the doc (children, stage chains, family colors). |
| `js/layout.js` | Column layout: chains share a column, branch subtrees pack rightward. |
| `js/view.js` | SVG renderer (semantic zoom — recomputes screen coords per frame). |
| `js/axis.js` | Adaptive year ticks (century → decade → year by zoom). |
| `js/main.js` | State owner + all gestures (pan/zoom, time-drag, branch-handle drag, inline rename/create, link mode), context menus, undo/redo, shortcuts, save/reload/SSE flow. |
| `js/menu.js` | Generic context-menu component (`showMenu`/`closeMenu`). |
| `js/panel.js` / `js/forms.js` | Stateless detail panel / `<dialog>` edit forms. |
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
    { "id": "b1", "fromId": "brelvic", "toId": "old-demovian", "year": -200, "label": "sea-trade loanwords" }
  ]
}
```

Key rules (all machine-enforced; violations block the save and name the path):

- `id`: lowercase slug, unique, **immutable** — never reuse or rename one; only `name` changes on rename.
- `born`/`died` integers; `died ≥ born`; omit `died` for living languages. A `died`
  WITH a stage successor is a hand-over year (no †), without one it's an extinction (†).
- `relation` `"stage"` = same language renamed (max ONE stage child per language;
  stage born strictly > parent born). `"branch"` = daughter (born ≥ parent born).
- `secondaryParentId` (creoles) requires and must differ from `parentId`. No ancestry cycles.
- Optional: `order` (sibling sort, lower = left), `color` (subtree override),
  `notes`, `polyglotFile` (reserved for the future PolyGlot-open feature — leave the
  mechanism unbuilt unless DJ asks).

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

## Invariants to preserve

- `server.js` stays zero-dependency (Node built-ins only); the whole repo has no
  npm dependencies and no build step.
- Never bypass `writeDocAtomic` semantics: backup → tmp write → rename.
- Don't touch `backups/`; don't commit it.
- The visual theme mirrors DJ's site (andah_games/css/style.css tokens); keep new
  UI on the CSS custom properties, never hardcoded colors. Family palette slots
  `--fam-0..7` are a validated colorblind-safe set — don't reorder or "improve" them.
