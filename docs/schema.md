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
| `died` | no | Integer ≥ `born`. With no stage successor this is an **extinction** (†). With a stage successor it is just the hand-over year to the next stage — no †. With `diverged: true` it is the year the language evolved away into its descendants — no †. Omit for living languages. |
| `diverged` | no | `true` marks the language as having **evolved away into its descendants** (e.g. a proto-language) rather than dying out. No † and **no end marker** — its descendant branches/stages carry the line onward (a fork/tail there just reads as clutter). The panel reads *"evolved away into its descendants."* `died` is **optional**: leave it off and the end year is derived automatically from its **last successor's birth** — a branch daughter *or* a stage successor (a rename is as much a hand-off as a split); set it explicitly to override. Needs either a `died` or at least one successor (daughter or stage). |
| `reconstructed` | no | `true` marks an **unattested / reconstructed** language (proto-languages, unrecorded intermediate nodes). Drawn with a dashed box outline and a leading `*` on the name, per the historical-linguistics convention. Omit or `false` = attested. |
| `bornCirca` | no | `true` marks the birth year as **approximate**. The box label reads `c.<year>` and the box's top edge (which sits on the birth year) is feathered into a soft band, so a guessed date no longer reads as exact. |
| `diedCirca` | no | `true` marks the death/hand-over year as **approximate** — the label reads `c.<year>`. |
| `populationSeries` | no | Array of `{ year, count }` speaker points (a few is enough). Drives an **endangerment badge** on the box — a semantic dot on the UNESCO scale: **NE** Safe / Not Endangered · **VU** Vulnerable · **DE** Definitely Endangered · **SE** Severely Endangered · **CR** Critically Endangered · **EX** Extinct — derived peak-relatively by `model.vitalityOf` (ratio of latest count to the language's own peak; a recovering population reads one step safer, capped at VU; EX only for a true extinction). While scrubbing/playing it reflects the population at the play-head year via `model.vitalityAt`. Also drives a sparkline in the detail panel. Each `year` is an integer, each `count` a number ≥ 0. Omit for languages with no recorded population. |
| `region` | no | Free-text geographic area (e.g. `"Northern Isles"`), independent of ancestry. The overview lists regions with a **focus** that dims the others (same mechanism as family focus); the edit form autocompletes existing region names. |
| `parentId` | no | Absent = family root. Must reference an existing id. |
| `relation` | with `parentId` | `"branch"` = daughter language (new column). `"stage"` = the same language renamed over time (continues straight down the parent's column). A language can have **at most one** stage successor, and a stage must be born strictly after its predecessor; a branch child may share its parent's birth year. |
| `secondaryParentId` | no | Second parent for creoles/mixed languages (drawn as a long-dashed connector). Requires `parentId`; must differ from it. |
| `order` | no | Integer sibling sort hint — lower sorts further left (siblings default to birth-year order). Also orders family roots. |
| `color` | no | CSS color overriding the family palette for this language **and its descendants**. |
| `groupId` | no | References a `groups[]` entry (see below). Paints this language **and its descendants** with the group's color — the way to colour sub-branches of one family (e.g. Germanic vs Romance) differently. A per-language `color` still wins over the group; a descendant's own `groupId`/`color` overrides an inherited one. |
| `notes` | no | Free text for the detail panel. |
| `polyglotFile` | no | Reserved path to a PolyGlot `.pgd` file. Shown in the panel; launching PolyGlot from the app is planned, not built. |

## Classification group entry (`groups[]`, optional)

```json
{ "id": "germanic", "name": "Germanic", "color": "#4e79a7" }
```

A named color layer independent of ancestry. Assign one to a language via its
`groupId`; the color flows down to descendants (until a nearer `color`/`groupId`
overrides). All three fields are required; `id` is a unique lowercase slug. Manage
them in-app via the panel's **Groups → Manage groups…**, or per-language in the edit
form's *Classification group* field (which can create one inline). Deleting a group
in the manager unassigns it from every language that used it.

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
3. `died` integer and ≥ `born`. `reconstructed`/`bornCirca`/`diedCirca`/`diverged`, if present, are booleans (`diverged` needs either a `died` year or at least one daughter branch to derive it from). `populationSeries`, if present, is an array of `{year:int, count:number≥0}`. `region`, if present, is a string.
4. `parentId` exists; `relation` is `branch`/`stage` and appears if-and-only-if `parentId` does.
5. No cycles in the ancestry graph.
6. Stage child `born` **>** parent `born`; at most one stage child per language.
7. Branch child `born` ≥ parent `born`.
8. `secondaryParentId` exists, ≠ primary parent, ≠ self, and requires a primary parent.
9. Borrowings: both ends exist and differ; `year` integer if present.
10. Groups (if present): an array; each has a unique slug `id`, non-empty `name`, non-empty `color`. Every language `groupId` must reference a defined group.

Errors come back as `path: message` pairs, e.g.
`languages[3].born: A stage must begin after its previous stage (Old Demovian was born -350).`

## Hand-editing notes

- The running app watches the file and refreshes itself about a second after you save.
- Every in-app save first copies the current file to `backups/` (last 20 kept) and then
  writes atomically — the data file is never left half-written.
- Saves preserve key order, so diffs stay minimal. Keep new entries in the same key
  order as above for tidy diffs.
