# Diachronic engine — data schema & module breakdown

Proposal for review. Nothing in here is built yet.

The goal: the 284 boxes on the chart stop being labels and become **language stages**.
Each node carries a full `LanguageState` (phonology, lexicon, paradigms, syntax,
sample text); each edge carries an ordered `ChangeSet` that turns the parent state
into the child state. `evolve(parentState, changeSet) → childState` is a pure
function, so any branch is fully re-derivable after you edit a rule.

## Decisions this design encodes

| Decision | Choice |
|---|---|
| Anchoring | Free generation — no existing words to honour |
| Storage | Derive on demand; disk holds proto spec + pinned rulesets + overrides only |
| Tree authority | Read-only. The engine may *propose*, never write `languages.json` |
| Pilot | Dahen-Kino (112 nodes, −4500 → 1765) |
| v1 scope | Phonology-complete **+ paradigm erosion/syncretism** |
| Proto phonology | Mined from the family's own 112 language names |
| Tone | Atonal proto → tonogenesis on selected branches |
| Lexicon | ~600 roots, Swadesh 207 covered first |
| Change rate | Realistic: 1 significant change per 50–150 years |
| Rule stability | Pinned once generated; re-dating re-times, never rerolls |
| Orthography | Freezes at a standardisation year; spelling reforms re-sync partially |
| Sample text | Schleicher's Fable, stored as a glossed template |
| Interop | Lexurgy export (v1) + import (v2); PolyGlot `.pgd` export |
| UI | New sections in the existing side panel |

## Non-negotiables inherited from the repo

- **Zero npm dependencies, no build step.** Plain ES modules, Node ≥ 20.
- **`server.js` untouched.** The engine is pure client/CLI code; the server stays a
  dumb file server with the existing data API.
- **`data/languages.json` is never written by the engine.** All linguistic data
  lives in sidecar files, so the existing validator, atomic writes, backups and
  undo history keep working exactly as they do today.

---

# 1. Files on disk

One sidecar per family root, alongside the tree data:

```
data/lang/proto-dahen-kino.lang.json
data/lang/proto-alzuria-ayuman.lang.json
…
```

```jsonc
{
  "schemaVersion": 1,
  "rootId": "proto-dahen-kino",
  "seed": "dahen-kino/4f2a",       // one seed per family; same seed ⇒ same family, exactly
  "proto":   { /* ProtoSpec — §2 */ },
  "edges":   { "old-dahen": { /* ChangeSet — §4 */ }, … },  // keyed by CHILD id
  "contact": [ /* ContactEvent — v2, mirrors borrowings[] */ ],
  "nodes":   { "dahen": { /* NodeOverlay — §6 */ }, … },
  "texts":   { "schleicher": { /* GlossedText — §7 */ } }
}
```

An edge is keyed by its **child** id because every node has exactly one primary
parent — so child id uniquely identifies the edge. Secondary parents (creoles;
currently only *Atirhan Dahen*) and `borrowings[]` become `contact[]` entries in v2.

Typical size: a few hundred KB per family. The ~67,000 derived word-forms
(600 roots × 112 nodes) are **never** written — they're recomputed by `evolve()`
and memoised in RAM.

---

# 2. `ProtoSpec` — the language at the root

```jsonc
{
  "phonology": {
    "consonants": [ Phoneme ],
    "vowels":     [ Phoneme ],
    "suprasegmentals": {
      "tone":   null,                          // atonal at the root, by decision
      "length": { "vowel": true, "consonant": false },
      "stress": { "type": "penultimate", "weightSensitive": false }
    },
    "harmony": null
  },
  "phonotactics": { /* §3 */ },
  "morphology":   { /* §5 */ },
  "syntax":       { /* §5 */ },
  "lexicon":      [ Root ],
  "romanisation": { "map": { "ŋ": "ng", "t͡ɕ": "q" }, "digraphs": ["ng","zh","ts"] }
}
```

## 2.1 `Phoneme` — features are the primitives

A phoneme is **not** a character. It's a feature bundle with a stable id; the IPA
string is just how we render it. Every sound-change rule matches on features, which
is what makes natural classes work: "all voiceless stops" is a query, not a list.

```jsonc
// consonant
{ "id": "p", "ipa": "p", "type": "C",
  "f": { "place": "bilabial", "manner": "stop", "voice": false,
         "nasal": false, "aspirated": false, "glottalised": false,
         "lateral": false, "long": false } }

// vowel
{ "id": "e", "ipa": "e", "type": "V",
  "f": { "height": 2, "back": 1, "round": false,
         "nasal": false, "long": false, "tone": null } }
```

Height/backness are **numeric** (1–5, 1–3) so raising, lowering, fronting and chain
shifts are arithmetic on a vowel space, not a lookup table. That's what lets the
engine model a drag chain: `a` raises into the gap `e` left behind.

A phoneme id is **stable across mergers**. When /b/ merges into /p/, the derivation
history still records that this word's segment *was* `b` — which is exactly what you
need to display an etymology, and what makes a later split recoverable.

## 2.2 Implicational universals (enforced at generation)

Inventories aren't random draws. The generator applies attested implications and
refuses to emit a violating inventory:

- Voiced stops imply voiceless ones. /g/ implies /b/ and /d/ (and gaps go the other
  way: a language missing one voiced stop is usually missing /g/ or /p/, per the
  well-known Dutch/Arabic/Thai gaps).
- Voiced fricatives imply voiceless fricatives.
- Any nasals ⇒ /n/. Two nasals ⇒ /m n/.
- Front rounded vowels imply front unrounded ones; back unrounded imply back rounded.
- 3-vowel systems are /i a u/; 5-vowel systems /i e a o u/. Anything else needs a
  reason, and the generator records one.
- Aspiration/glottalisation series are all-or-nothing across places, not scattered.

Inventory size targets: 20–37 phonemes typical, ~11 small, 60+ large; C:V ratio held
in a plausible band (roughly 2:1 to 6:1) so you don't get 40 consonants and 3 vowels
unless the profile explicitly asked for it.

## 2.3 `profile.js` — mining the names

This is the step that makes the output feel like *your* world. The 112 Dahen-Kino
language names (*Qai, Zhao, Wuhou, Tsjinai, Xuqilinese, Zayliabao, Xia, Haowou,
Siaa, Kaastini, Secssu*) are themselves phonological evidence. The miner extracts:

- **Segment inventory** implied by the graphemes and digraphs (`zh`, `ts`, `x`, `q`
  → a sibilant/affricate series; `ng` → /ŋ/).
- **Syllable shape** by scanning onsets/nuclei/codas across all names — Dahen-Kino
  reads as heavily CV/CVn with rich vowel sequences (au, ou, ia, ao, ai, uia).
- **Positional constraints**: which consonants appear word-finally at all.
- **Vowel-sequence frequency**, which decides whether those are diphthongs or hiatus.

It emits a `PhonologicalProfile` you can read and edit before anything downstream is
generated. The proto-inventory is then generated *to fit the profile*, subject to the
universals above.

---

# 3. Phonotactics

```jsonc
{
  "syllable": "(C)(C)V(C)",
  "onset": {
    "max": 2,
    "sonorityMinDistance": 2,          // sonority sequencing principle
    "licensedExceptions": [ ["s", "stop"] ],
    "banned": [ ["stop","stop"] ]
  },
  "nucleus": { "diphthongs": ["ai","au","ou","ia"], "longVowels": true },
  "coda":    { "max": 1, "allowed": ["n","ŋ","k","t","p"] },
  "syllabification": "onset-maximisation",
  "stress": { "type": "penultimate" }
}
```

**Sonority sequencing**: sonority rises towards the nucleus and falls away from it,
on the scale stop < affricate < fricative < nasal < liquid < glide < vowel. `pra-`
is fine, `rpa-` isn't. Real languages license a short list of exceptions — /s/+stop
being the famous one (English *stop*, *spring*) — so that's a per-language list
rather than a hard rule.

**Stress matters more than anything else here.** Unstressed syllables are what erode,
and erosion is what destroys morphology. The stress rule chosen at the root
determines, thousands of years later, whether the daughters lose their case endings
(final stress → weak initial syllables → prefix loss; initial stress → weak finals →
suffix loss, the Germanic story).

---

# 4. `ChangeSet` and `Rule` — the heart of it

```jsonc
{
  "childId": "old-dahen", "parentId": "proto-dahen-kino",
  "from": -4500, "to": -1500,
  "seed": "…",                  // derived: hash(familySeed, childId) — see §8
  "generated": true,            // flips to false the moment you hand-edit
  "rate": 1.0,                  // per-edge multiplier
  "rules": [ Rule, … ],         // ORDERED. The order IS the semantics.
  "morphEffects": [ … ],        // §5 — derived, inspectable, not hand-authored
  "orthography": { "standardisedAt": 875, "reforms": [ { "year": 1520, "scope": "partial" } ] }
}
```

```jsonc
{
  "id": "r07",
  "year": -3120,                     // WHEN inside the edge — drives the scrubber
  "category": "lenition",
  "template": "intervocalic-voicing",
  "a":   { "match": { "manner": "stop", "voice": false } },   // features, phoneme set, or "∅"
  "b":   { "delta": { "voice": true } },                       // features, phoneme set, or "∅"
  "env": { "before": [{ "type": "V" }], "after": [{ "type": "V" }],
           "boundary": null, "stress": null, "morphBoundary": false },
  "probability": 1.0,                // < 1.0 ⇒ lexical diffusion
  "conditions": { "minRank": null, "domains": null },
  "analogue": "Latin vīta > Spanish vida — intervocalic voicing of /p t k/",
  "note": "The first step of the Western Romance lenition chain."
}
```

## 4.1 Rule ordering is the point

Applying rules in sequence rather than simultaneously is what produces the four
classic interaction types, and they're what make output look real rather than
generated:

- **Feeding** — rule A creates new inputs for rule B.
- **Bleeding** — rule A destroys inputs rule B would have had.
- **Counterfeeding** — B would have fed A, but runs after it, so the change looks
  "incomplete" and leaves an irregularity.
- **Counterbleeding** — A applies, then B removes its conditioning environment, so
  the result is opaque and can no longer be explained by the surface forms.

Counterbleeding in particular is the source of the "why on earth is this word
irregular" texture that hand-built conlangs almost never have.

## 4.2 The catalogue

`catalogue.js` is a hand-curated set of ~120 change templates, each with its natural
conditioning environment baked in and each carrying a real-world attested analogue
(stored, and shown in the change log). Categories:

| Category | Examples |
|---|---|
| Lenition | Intervocalic voicing, spirantisation, flapping, elision (*vita > vida*, *focum > fuego*) |
| Fortition | Word-initial hardening, gemination, glide strengthening |
| Assimilation | Nasal place assimilation, palatalisation before front vowels, i-umlaut, harmony spread |
| Dissimilation | Grassmann's Law, liquid dissimilation |
| Deletion | Apocope, syncope of unstressed vowels, cluster simplification, final devoicing → loss |
| Insertion | Prothesis (*schola > escuela*), anaptyxis, excrescent stops |
| Rearrangement | Metathesis, especially of liquids |
| Vowel change | Monophthongisation, diphthongisation, breaking, raising/lowering, reduction to schwa |
| Chain shifts | Push and drag chains — Grimm's Law, the Great Vowel Shift, the High German shift |
| Prosodic | Compensatory lengthening, stress shift, **tonogenesis** |

**Naturalness check.** `naturalness.js` scores a proposed rule for phonetic
plausibility and rejects the implausible — an unconditioned `k > l` never gets
generated, and if you hand-write one the panel flags it rather than silently
accepting it. Every generated rule can name its attested analogue; if it can't, it
isn't in the catalogue.

## 4.3 Mergers and splits, done honestly

- A **merger** is unconditioned, or its environment collapses. Two phoneme ids start
  mapping to one surface segment. Irreversible, and the etymology remembers both.
- A **split** is *never* generated by fiat. It only happens the way it happens in
  reality: a rule creates a conditioned allophone, then a *later* rule destroys the
  conditioning environment, and the allophone is stranded as a separate phoneme.
  That two-step is what phonemicisation actually is, and modelling it properly is
  most of why the results will look real.

`tone.js` uses exactly the same machinery: tonogenesis is a split where the
conditioning factor (a lost voicing contrast, or a lost coda /ʔ/ or /s/) transfers
its cue to pitch on the vowel before disappearing. That's how Chinese, Vietnamese
and Punjabi got tone, and it's how Dahen-Kino will.

## 4.4 Rate of change

Rules per edge = `duration / uniform(50, 150) × rate`, drawn from the edge's derived
seed. Dahen-Kino's edges run 100–3000 years (median 600), so a typical edge gets
4–12 changes and the deep reconstructed edges get 20–60. Each rule is assigned a
`year` inside the span so the **time scrubber can show intermediate stages**: at year
Y, apply the rules dated ≤ Y.

**Pinned, not rerolled.** Once generated, a ChangeSet is written to the sidecar and
never regenerates itself. Drag a box and change the edge from 600 to 900 years, and
the existing rules are simply re-spread across the new span — same rules, new dates.
Regeneration is an explicit button, and the panel warns when an edge's rule count has
drifted far from what its duration would suggest.

---

# 5. Morphology in v1 — erosion as a consequence

The failure mode to avoid is a daughter that sounds completely different but has
identical grammar. In v1 that's addressed the cheap and correct way: paradigms are
carried *through* the sound changes rather than around them.

```jsonc
"morphology": {
  "type": "agglutinative",              // isolating ↔ agglutinative ↔ fusional ↔ polysynthetic
  "nominal": {
    "alignment": "nom-acc",
    "cases": ["NOM","ACC","GEN","DAT","LOC","INS"],
    "numbers": ["SG","PL"],
    "genders": ["I","II"],
    "definiteness": false,
    "classes": { "n1": { "NOM.SG": "-∅", "ACC.SG": "-am", … } }
  },
  "verbal": {
    "tenses": ["PRS","PST"], "aspects": ["IPFV","PFV"],
    "moods": ["IND","SBJV","IMP"], "voices": ["ACT","MID"],
    "agreement": ["1SG","2SG","3SG","1PL","2PL","3PL"],
    "classes": { "v1": { … } },
    "suppletive": ["be","go"]           // high-frequency irregulars, resist levelling
  }
}
```

Each paradigm cell is a real affix made of real phonemes, so it is subject to every
sound change like any other string. When an edge's rules eat unstressed final
syllables, `-am` and `-um` both become `-ə`, then `-∅` — and **`ACC.SG` and `DAT.SG`
have merged, without anyone authoring that merger.** `erosion.js` detects the
resulting syncretism, records it in `morphEffects`, and the panel shows the paradigm
table shrinking stage by stage with a note on which sound change collapsed which
cells.

Syntax parameters are stored and displayed in v1, and checked for **Greenbergian
coherence** (OV ⇒ postpositions, GenN, clause-final complementisers; VO ⇒ the
mirror image), warning on an incoherent hand-configuration. Actual word-order *drift*
is v2.

**Deferred to v2** (designed for, not built): grammaticalisation clines, analogy and
levelling, reanalysis, Jespersen's cycle and the other renewal cycles, alignment
shift, semantic drift, contact/sprachbund, dialect continua, creolisation.

---

# 6. `NodeOverlay` — your hand on the tiller

```jsonc
{
  "overrides":       { "r0142": { "form": ["t","a","ŋ"], "reason": "I like this better" } },
  "glossOverrides":  { "r0142": "river" },          // manual semantic drift
  "orthographyFrozenAt": 875,
  "notes": "…"
}
```

Overrides are applied *after* `evolve()`, so they survive rule edits upstream, and
the panel marks any overridden form so you always know what's derived and what's
hand-set.

---

# 7. Sample text

Schleicher's Fable can't be a string — a string can't grow case endings or lose
them. It's stored as a glossed template: lemma ids + morphological features + a
minimal dependency tree, which `realise.js` renders through each stage's own lexicon,
paradigms and word order.

```jsonc
{ "id": "schleicher", "title": "The Sheep and the Horses",
  "sentences": [
    { "id": "s1",
      "words": [
        { "lemma": "r0301", "gloss": "sheep",  "f": { "case": "NOM", "num": "SG", "def": true } },
        { "lemma": "r0455", "gloss": "wool",   "f": { "case": "ACC", "num": "SG" } },
        { "lemma": "r0102", "gloss": "not.have","f": { "case": null, "tense": "PST", "person": "3SG" } }
      ],
      "tree": { "head": 2, "deps": [ [2,0,"subj"], [2,1,"obj"] ] } } ] }
```

You never write a word of it. Same template, 112 renderings, and you can read the
divergence across sisters at a glance.

---

# 8. Determinism

- One seed per family, stored in the sidecar.
- Every random draw goes through `rng.js` — a seeded PRNG (mulberry32), never
  `Math.random()`.
- **Per-node derived streams**: a node's RNG is seeded from
  `hash(familySeed, nodeId, purpose)`. This matters: it means editing a rule on one
  branch does *not* reshuffle the draws on a sibling branch. Without it, one edit
  would silently rewrite half the family.
- `evolve()` results are memoised by `hash(parentStateHash, changeSetHash)`, so a
  rule edit invalidates exactly that node and its descendants and nothing else.

---

# 9. Module breakdown

Everything under `js/engine/` is pure, dependency-free ES modules, importable
unchanged from Node (CLI, tests) and the browser (worker). No DOM, no fetch, no fs.

```
js/engine/
  rng.js                seeded PRNG + derived streams
  features.js           feature system, matchers, natural classes, IPA ⇄ features
  phonology/
    profile.js          mine language NAMES → PhonologicalProfile
    inventory.js        inventory generation + implicational universals
    phonotactics.js     syllable templates, sonority, syllabification, stress
    tone.js             tone systems + tonogenesis triggers
  soundchange/
    rule.js             Rule type, matcher compilation, application to one word
    apply.js            ordered application, diffusion, derivation-step recording
    catalogue.js        ~120 curated templates with attested analogues
    generate.js         choose a plausible ordered ruleset for an edge
    chainshift.js       push/drag chains as linked rule sets
    naturalness.js      plausibility scoring and rejection
    lexurgy.js          .lsc export (v1) / import (v2)
  lexicon/
    swadesh.js          the 207 list + semantic domains
    roots.js            root generation, Swadesh-first, Zipfian ranks
    derivation.js       agent/abstract/causative/diminutive morphology
    etymology.js        derivation-history structures + formatting
  morphology/
    paradigm.js         declension/conjugation classes, paradigm tables
    erosion.js          syncretism detection after sound change
    suppletion.js       high-frequency irregulars
  syntax/
    parameters.js       word order + Greenbergian correlations + coherence warnings
  text/
    schleicher.js       the glossed template
    realise.js          render a GlossedText through a LanguageState
  export/
    polyglot.js         .pgd writer
    csv.js json.js sketch.js
  project.js            sidecar load/save, evolve() fold, caching, invalidation
  propose.js            "may propose, never apply" suggestions

js/lang-panel.js        panel sections (Phonology / Lexicon / Grammar / Sample / Changes)
js/lang-worker.js       Web Worker host — keeps a 112-node recompute off the UI thread
scripts/lang.js         headless CLI: generate | evolve | export | report
scripts/test-engine.js  engine tests + real-world regression fixtures
data/lang/*.lang.json   the sidecars
```

`js/main.js`, `js/panel.js`, `js/view.js`, `server.js` and `data/languages.json`
are touched only to *hook in* the new panel sections — no behavioural changes to the
existing app.

---

# 10. Tests — the trust gate

The engine is only worth using on invented languages if it reproduces real ones.
Before any Dahen-Kino output is generated, these must pass:

1. **Grimm's Law + Verner's Law** over ~40 PIE roots → attested Proto-Germanic.
   Verner is the good test: it's *conditioned by the position of PIE accent*, so
   getting it right proves stress-sensitive environments work.
2. **Latin → Spanish**, ~50 etyma through an ordered ~20-rule chain (lenition,
   palatalisation, diphthongisation of short *e*/*o*, apocope, cluster
   simplification) → attested Spanish. *vita > vida*, *focum > fuego*,
   *schola > escuela*, *octo > ocho*, *lactem > leche*.
3. **Ordering interactions** — one test each for feeding, bleeding, counterfeeding
   and counterbleeding, each asserting a *different* result when the order is flipped.
4. **Split** — allophone created, conditioning environment later destroyed,
   phonemicisation asserted.
5. **Determinism** — same seed, byte-identical family; edit one branch, sisters
   unchanged.

Run through the existing zero-dep `scripts/test.js` harness, so `npm test` covers
both the app and the engine.

---

# 11. Build order

| # | Step | Gate |
|---|---|---|
| 1 | `rng`, `features`, IPA tables | — |
| 2 | `profile.js` — mine the 112 Dahen-Kino names | **you review the profile** |
| 3 | `inventory` + `phonotactics` + stress → Proto-Dahen-Kino phonology | **you review the proto** |
| 4 | `swadesh` + `roots` + `derivation` → 600 roots | |
| 5 | `rule` + `apply` + `catalogue` + **all of §10** | **trust gate — nothing proceeds until these pass** |
| 6 | `generate` — ruleset per edge from duration | |
| 7 | `paradigm` + `erosion` | |
| 8 | `project.js` fold + caching + sidecar I/O | |
| 9 | Schleicher realisation | **you read the fable in 6 sisters** |
| 10 | Panel sections + worker | |
| 11 | Exports — Lexurgy, PolyGlot, CSV, JSON, grammar sketch | |

Three review gates before anything is generated at scale, and the regression suite
sits between the design and the output.
