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

### Pin to your taskbar

Windows won't let you pin `start.bat` directly, so make a proper shortcut once:

1. Double-click **`make-app.bat`**. This drops an **Andah Language Tree** shortcut
   on your Desktop and in the Start Menu (it runs the same hidden launcher as
   `start.bat`).
2. Right-click that shortcut → **Show more options** → **Pin to taskbar**.

Now the taskbar icon opens the app in one click. To give it a custom icon, drop an
`assets/icon.ico` into the project and re-run `make-app.bat`.

## Using it

- **Right-click empty space** → *New language here* — a box appears at that year;
  type its name, press Enter, done.
- **Right-click a language** → Rename / Edit details / New daughter / New stage /
  Borrowing / Delete.
- **Drag a box up or down** to move it in time (a live readout shows the year).
  Hold **Ctrl** while dragging to move it *and all its descendants* together.
- **Drag the ● handle** on a box's bottom edge into empty space → a new daughter
  is born where you drop it.
- **Double-click** a box to open its edit form; press **F2** to rename it in
  place. **Del / Backspace** deletes the selected language, borrowing, or event.
  **Ctrl+Z / Ctrl+Y** undo and redo.
- **Every change saves instantly** (with a backup each time). **Ctrl+S** just
  flashes "All changes saved ✓" for peace of mind.
- **Scroll** to zoom — the year under the cursor stays put. **Drag empty space**
  to pan; **Shift+scroll** pans sideways; **Fit view** brings the whole tree back.
- **Click a box** for details: years, lineage, daughters, borrowings, notes.
  Click a **borrowing arrow** or a **timeline event** to inspect it too.
- **Find a language** with **Search** (or **Ctrl+K**) — type a name, Enter jumps
  to it. **Arrow keys** then walk the tree (up = parent, down = child, left/right
  = siblings).
- **Collapse a subtree**: select a language and press **c** (or use the panel
  button); a **+N** badge shows how many descendants are folded away. Press **c**
  again — or click the badge — to expand.
- **Scrub year**: toggle **Scrub year**, then drag the year chip in the gutter —
  languages not yet born (or already dead) at that year dim, so you can see the
  living map at any moment.
- **Timeline events**: add historical events (a single year or a spanning band —
  "The Long Winter", a migration) from the panel's **Timeline** section; they draw
  across the whole width behind the tree.
- **Borrowings have kinds** — loanwords, substrate, superstrate, areal — each with
  its own dash signature; all are shown in the panel's legend alongside the stage /
  branch / creole line styles.
- **Export** the whole tree as a **PNG or SVG** image (toolbar, or the panel's
  *Export image…*).
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

## PolyGlot

Give a language a **PolyGlot file** (its `.pgd`) in *Edit details*, then set the
**PolyGlot launcher** path once in **Settings** (the full path to `PolyGlot.exe`
or `PolyGlot.jar`; the `ANDAH_POLYGLOT_PATH` environment variable overrides it).
The language's detail panel then shows an **Open in PolyGlot** button that launches
it with that file. Until the launcher path is set, the button reports what's
missing rather than doing anything.

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
