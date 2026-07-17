# Andah Language Tree

A standalone local tool for mapping how the conlangs of Andah evolve over time —
Proto-language → stages → daughter branches, drawn as boxes on a vertical timeline
(oldest at the top) with an Andah-year axis that sharpens from centuries to decades
to single years as you zoom.

## Quick start

Double-click **`start.bat`** — the tree opens in **its own app window** (no browser
tabs or address bar; own taskbar entry). The little engine behind it runs invisibly
and shuts itself down shortly after you close the window.

(Dev equivalent: `npm start`, then open <http://localhost:4177> in a browser.
Requires Node ≥ 20, no dependencies to install.)

## Using it

- **Right-click empty space** → *New language here* — a box appears at that year;
  type its name, press Enter, done.
- **Right-click a language** → Rename / Edit details / New daughter / New stage /
  Borrowing / Delete.
- **Drag a box up or down** to move it in time (a live readout shows the year).
  Hold **Ctrl** while dragging to move it *and all its descendants* together.
- **Drag the ● handle** on a box's bottom edge into empty space → a new daughter
  is born where you drop it.
- **Double-click** a box (or press **F2**) to rename it in place. **Del** deletes
  the selected language. **Ctrl+Z / Ctrl+Y** undo and redo.
- **Every change saves instantly** (with a backup each time). **Ctrl+S** just
  flashes "All changes saved ✓" for peace of mind.
- **Scroll** to zoom — the year under the cursor stays put. **Drag empty space**
  to pan; **Shift+scroll** pans sideways; **Fit view** brings the whole tree back.
- **Click a box** for details: years, lineage, daughters, borrowings, notes.
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

- **Port 4177 busy** — the app is probably already running; launching again just
  opens another window onto it.
- **Window says the server is unreachable** — launch via `start.bat` (or
  `npm start`) and reload.
- **Red banner about the data file** — the JSON has a syntax error or breaks a
  schema rule; the banner (and `npm run validate`) name the exact spot.
- **No app window, plain browser tab instead** — Edge/Chrome weren't found;
  the default browser is used as a fallback. Everything works the same there.
- **Undo after an outside edit** — Ctrl+Z history is cleared whenever the file is
  changed outside the app (VS Code/Claude), so undo can never wipe those edits.
