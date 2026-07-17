# Andah Language Tree

A standalone local tool for mapping how the conlangs of Andah evolve over time —
Proto-language → stages → daughter branches, drawn as boxes on a vertical timeline
(oldest at the top) with an Andah-year axis that sharpens from centuries to decades
to single years as you zoom.

## Quick start

Double-click **`start.bat`** — it starts the local server and opens
<http://localhost:4177> in your browser.

(Equivalent: `npm start`, then open the URL yourself. Requires Node ≥ 20, no
dependencies to install.)

## Using it

- **Scroll** to zoom — the year under the cursor stays put. **Drag** to pan.
  **Shift+scroll** pans sideways. **Fit view** brings the whole tree back.
- **Click a box** for details: years, lineage, daughters, borrowings, notes.
- **Add things** with the toolbar (`+ Root language`, `+ Borrowing`, `Settings`) and
  the buttons in a selected language's panel (`Edit`, `Add stage`, `Add daughter`,
  `Add borrowing`, `Delete`).
- The four line styles (solid stage line, elbow branch, long-dash creole parent,
  short-dash borrowing arrow) are shown in the panel's legend.
- `☾ Dark` toggles the theme (shared taste with djmapping.com).

## The data file is the source of truth

Everything lives in **`data/languages.json`**. The forms edit that file; you can
equally edit it by hand in VS Code — or ask Claude to generate whole families —
and the open page refreshes itself within a second. Schema reference:
[`docs/schema.md`](docs/schema.md). Check your hand-edits with:

```bash
npm run validate
```

If the file ever won't parse, the app shows a recovery banner instead of a broken
tree, listing the most recent backups.

## Andah calendar

The axis uses Andah years; years before the epoch are negative. "Now" is
`config.presentYear` (edit it in **Settings**) — seeded as **1776**, from the lore
mapping *Andah year = Earth year − 250* used by the djmapping.com GDP data
(Earth 2015 = Andah 1765).

## Backups & recovery

Every save first copies the current file into **`backups/`** (the newest 20 are
kept) and then writes atomically. To roll back: stop the server, copy a backup
over `data/languages.json`, start again. **Download backup** in the toolbar saves
a copy anywhere you like. `backups/` is gitignored — commit `data/languages.json`
itself for history.

## Working with Claude

Open this folder in VS Code and ask for what you want — "add an Ilvish-descended
trade pidgin around year 1400", "give the Tessic family three medieval daughter
languages". Claude edits `data/languages.json` directly (the conventions live in
`CLAUDE.md`), and the tree updates live while the app is open.

## The demo family

Ships with the placeholder **Demovian** and **Tessic** families exercising every
feature (stages, branches, an extinction, a creole, a borrowing). Delete them or
have Claude replace them when your real languages arrive.

## PolyGlot (planned)

Each language has an optional `polyglotFile` field for its PolyGlot `.pgd` file,
shown in the detail panel. Launching PolyGlot from the app is a planned upgrade —
the server has a reserved spot for the endpoint (`server.js`, bottom of the route
table).

## Troubleshooting

- **Port 4177 busy** — the app is probably already running; the server says so and
  just opens the page.
- **Page says the server is unreachable** — start it with `start.bat` and reload.
- **Red banner about the data file** — the JSON has a syntax error or breaks a
  schema rule; the banner (and `npm run validate`) name the exact spot.
