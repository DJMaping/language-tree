# `data/languages.json` — schema reference

This is the canonical reference for the one data file the whole app runs on.
The file is strict JSON (no comments), so this document is where the schema lives;
`CLAUDE.md` carries a condensed copy for AI sessions.

Validation is enforced by [`js/validate.js`](../js/validate.js) — in the browser on
load and before every save, on the server on every write, and from the terminal via
`npm run validate`. An invalid file never renders garbage and never gets written.

## Top level

```json
{
  "_readme": "free text — ignored by the app, kept by saves",
  "config": { "title": "Languages of Andah", "presentYear": 1776, "axis": { "zeroLabel": "1" } },
  "languages": [ ... ],
  "borrowings": [ ... ],
  "events": [ ... ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `config.presentYear` | yes (integer) | "Now": living languages read `– now`, the Now line sits here. Lore note: Andah year ≈ Earth year − 250 (Earth 2015 = Andah 1765). |
| `config.title` | no | Shown in the topbar and overview panel. |
| `config.axis.zeroLabel` | no | Label for the year-0 axis tick (default `"0"`; the demo uses `"1"` for a no-year-zero calendar). Years in the data are ordinary integers either way; negative years are fine everywhere. |
| `config.polyglotPath` | no | Full path to `PolyGlot.exe`/`.jar` for the *Open in PolyGlot* button. The `ANDAH_POLYGLOT_PATH` env var overrides it. |
| `languages` | yes (array) | One object per language **or stage** — see below. |
| `borrowings` | no (array) | Dashed influence arrows, separate from ancestry. |
| `events` | no (array) | Timeline events drawn across the axis — separate from ancestry. |

## Language entry

```json
{
  "id": "old-demovian",
  "name": "Old Demovian",
  "born": -350,
  "died": 450,
  "parentId": "proto-demovian",
  "relation": "stage",
  "secondaryParentId": "tessic",
  "order": 0,
  "color": "#7a4fa0",
  "notes": "Free text shown in the panel.",
  "polyglotFile": "conlangs/old-demovian.pgd"
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | Lowercase slug `a-z 0-9 -`, unique, **never changes** (all references use ids, so renaming a language touches only `name`). The in-app forms generate it from the name. |
| `name` | yes | Display name; rename freely. |
| `born` | yes | Integer Andah year (negative = before the epoch). |
| `died` | no | Integer ≥ `born`. With no stage successor this is an **extinction** (†). With a stage successor it is just the hand-over year to the next stage — no †. Omit for living languages. |
| `parentId` | no | Absent = family root. Must reference an existing id. |
| `relation` | with `parentId` | `"branch"` = daughter language (new column). `"stage"` = the same language renamed over time (continues straight down the parent's column). A language can have **at most one** stage successor, and a stage must be born strictly after its predecessor; a branch child may share its parent's birth year. |
| `secondaryParentId` | no | Second parent for creoles/mixed languages (drawn as a long-dashed connector). Requires `parentId`; must differ from it. |
| `order` | no | Integer sibling sort hint — lower sorts further left (siblings default to birth-year order). Also orders family roots. |
| `color` | no | CSS color overriding the family palette for this language **and its descendants**. |
| `notes` | no | Free text for the detail panel. |
| `polyglotFile` | no | Reserved path to a PolyGlot `.pgd` file. Shown in the panel; launching PolyGlot from the app is planned, not built. |

## Borrowing entry

```json
{ "id": "b1", "fromId": "brelvic", "toId": "old-demovian", "year": -200, "label": "sea-trade loanwords" }
```

`id` unique (forms generate `b1, b2, …`), `fromId`/`toId` must reference existing,
distinct languages; `year` (integer) and `label` are optional and only decorate the
arrow's label pill.

## Validation rules (complete list)

1. `config.presentYear` integer; `languages` an array.
2. Ids unique and slug-shaped; `name` non-empty; `born` integer.
3. `died` integer and ≥ `born`.
4. `parentId` exists; `relation` is `branch`/`stage` and appears if-and-only-if `parentId` does.
5. No cycles in the ancestry graph.
6. Stage child `born` **>** parent `born`; at most one stage child per language.
7. Branch child `born` ≥ parent `born`.
8. `secondaryParentId` exists, ≠ primary parent, ≠ self, and requires a primary parent.
9. Borrowings: both ends exist and differ; `year` integer if present.

Errors come back as `path: message` pairs, e.g.
`languages[3].born: A stage must begin after its previous stage (Old Demovian was born -350).`

## Hand-editing notes

- The running app watches the file and refreshes itself about a second after you save.
- Every in-app save first copies the current file to `backups/` (last 20 kept) and then
  writes atomically — the data file is never left half-written.
- Saves preserve key order, so diffs stay minimal. Keep new entries in the same key
  order as above for tidy diffs.
