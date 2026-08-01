# Realism plan

Five measured gaps between the generated families and the attested record, and
how to close them. Every figure here comes from `npm run earth`; re-run it after
each item to see whether the number actually moved.

**The thesis.** The engine models *regular sound change* well — it reproduces
Grimm's Law, Verner's Law and a twenty-rule Latin→Spanish chain over attested
data. But sound change is only one of the mechanisms of language change, and the
others are what make real families messy. As it stands these are *"what a
language family would look like if only the Neogrammarians had been right"*:
every correspondence regular, every etymology derivable, nothing unexplained.
Real families have residue.

Ranked by realism gained ÷ risk.

---

## 1. Lexical replacement — **the big one**

**Measured:** 0 of 36,983 core meanings replaced. Zero, across every family.
**Earth:** Swadesh retention falls to ~86% per millennium — a language replaces
about one core word in seven every thousand years. Over 6,000 years that
compounds to ~40% retention, which is why English and Hindi share only ~27% of
their core vocabulary.

### Why it matters more than anything else on this list

It is not one gap, it is the cause of several. With no replacement:

- cognate percentages are **100% by construction**, so the comparative table has
  no gaps and lexicostatistics would measure nothing;
- there are **no false friends** — every cognate pair keeps an identical gloss,
  so no *hound* / *Hund*;
- there are **no etymological puzzles** — no word whose origin is a mystery,
  because every word's origin is derivable by construction;
- 6,000-year-old families remain **trivially relatable** at a glance.

### The four attested mechanisms, and what the engine already has for each

| mechanism | Earth example | what exists already |
|---|---|---|
| a derivative displaces its base | Latin *auris* "ear" → Romance from *auricula* "little ear" (French *oreille*); *avis* "bird" → Spanish *pájaro* < *passer* "sparrow" | `derivedFrom` links every derivative to its base — **free** |
| a loan displaces the native word | Old English *niman* "take" displaced by Norse *taka* | `contact.js` already produces datable loans — **nearly free** |
| a semantic neighbour shifts into the slot | Latin *caput* "head" displaced by *testa* "pot" (French *tête*) | `domain` and the concept list give neighbours — cheap |
| taboo replacement | PIE "bear" replaced by "the brown one" (Germanic *bero*), "honey-eater" (Slavic *medvedь*) | needs a small taboo-prone concept list — cheap |

Three of the four are almost free because the raw material is already there.

### How

A replacement is a **dated event in the ChangeSet**, exactly like a sound change
— so it is pinned, deterministic, re-timeable, and appears in the change log:

```js
changeSet.replacements = [
  { year, meaning: 'river', from: 'r0142', to: 'r0300',
    strategy: 'derivative' | 'loan' | 'neighbour' | 'taboo', note }
]
```

Applied in `evolve()` after the ruleset: the `to` entry takes the meaning, and
the `from` entry is kept but marked `retired` with the gloss it used to carry —
so the panel can say *"formerly 'river'"*, which is where etymological texture
comes from. Do **not** delete it; on Earth the displaced word usually narrows
rather than vanishing (English *hound* survives, just narrowed).

Cognate tracking then falls out: `cognateSet` looks up by root id, so if one
sister's "river" is `r0300` and another's is `r0142`, the table shows a gap
without any extra machinery.

- **New:** `js/engine/lexicon/replacement.js`
- **Touches:** `generate.js` (emit replacements per edge), `project.js` (apply
  them), `lang-panel.js` (show retired words and gaps)
- **Rate:** 14% of core meanings per 1,000 years, scaled by edge duration and
  weighted so that high-frequency core items resist — that resistance is why
  "two", "eye" and "I" are stable across whole families.
- **Effort:** a day. **Risk:** medium — it changes what the comparative table
  shows, which is the most visible display in the app.
- **Verify:** `npm run earth` section 2 should fall from 95/85/79/73/56 towards
  the Earth curve. Target ~85% at 1,000 years and ~30% at 5,500.

---

## 2. Branch-rate variation

**Measured:** every family sits within 9–12 changes per millennium, and every
branch within a family sits at the same rate. The `rate` field exists on every
edge and is **always 1**.
**Earth:** Icelandic barely moved in a thousand years; English was demolished in
the same span. Both are Germanic.

This is arguably the deepest structural gap, because it means the families have
no internal *character* — no conservative highland branch, no fast-moving
contact-zone branch.

### How

Draw the rate per branch and make it **heritable**, so a conservative lineage
tends to stay conservative:

```js
rate = clamp(parentRate * lognormal(1, 0.30), 0.4, 2.2)
```

drawn from the branch's own derived seed, so it is deterministic and editing one
branch cannot disturb a sister. Heritability is the point — it is Sapir's drift,
an inherited tendency down a lineage rather than a coin flip per edge.

Optionally bias it by what the chart already knows: a branch with borrowing
arrows is in a contact zone and should run faster; an isolated one slower. That
uses `borrowings[]`, which is already wired.

- **Touches:** `generate.js` only.
- **Effort:** hours. **Risk:** low — but it re-rolls every family, so land it
  with item 1 and re-record the golden snapshot once.
- **Verify:** the per-family spread in `npm run earth` section 1 should widen to
  roughly 6–25 rather than 9–12.

---

## 3. Inventories only ever grow

**Measured:** proto 13 → daughters 25; proto 26 → 33. Every family, one
direction.
**Earth:** inventories fluctuate around a band. They do not ratchet.

Two causes, two fixes:

**(a) There is no consonant merger.** `vowel-merger` was added and works; its
consonant counterpart was never written. Mirror it: merge two consonants
adjacent in feature space — /ʃ/ into /s/, /ɡ/ into /k/, a retroflex series into
its alveolar counterpart. Attested constantly: Old English lost the /x/ of
*niht*; Spanish merged /b/ and /v/; most of English merged /ʍ/ into /w/.

**(b) Merger pressure should scale with crowding.** Weight the merger templates
by current inventory size, so a language with 40 consonants merges more readily
than one with 15. That gives a **self-regulating band** rather than a hard cap,
and there is a real mechanism behind it — a crowded space has smaller
perceptual margins between neighbouring segments, so contrasts are harder to
maintain.

- **Touches:** `catalogue.js` (new template + size-scaled weights).
- **Effort:** hours. **Risk:** low.
- **Verify:** `npm run earth` section 3 — daughter means should stop exceeding
  their proto systematically. `npm run audit` `qualities` column should stop
  climbing.

---

## 4. Morphology erodes about ten times too slowly

**Measured:** 3–14 points of inflection lost per millennium.
**Earth:** Latin → French lost *all* case marking in 1,800 years, ~55 points per
millennium. Old English → English about 80. But Finnish and Hungarian have kept
15+ cases over a comparable span.

So the mean is too low — but the real problem is the **absence of a fast tail**.
Earth has both extremes; the engine has neither. Fixing item 2 gets much of this
for free, because a fast branch erodes fast.

Beyond that, two mechanisms are missing and both are already scoped in
`docs/roadmap.md` as v2:

**(a) Analogical levelling.** When sound change makes a paradigm irregular,
speakers regularise it — and that *collapses* distinctions faster than phonology
alone. English levelled almost every strong verb; the ones that survived are the
high-frequency ones, which the engine can already express because every entry
carries a Zipfian `rank`. This is the single biggest accelerator available.

**(b) Case loss as a grammatical event.** When two cases become homophonous in
every class, the language may drop the distinction outright and recruit an
adposition instead. That is the "compensation" already designed for — and note
the standing rule against teleology: this must be a *bias applied after the
fact*, never a target the engine steers toward.

- **New:** `js/engine/morphology/analogy.js`
- **Effort:** a day. **Risk:** medium — levelling is where a generator most
  easily starts inventing rather than modelling.
- **Verify:** `npm run earth` section 4 — the spread should widen to include
  branches at 40+ points per millennium while others stay under 10.

---

## 5. Sound change slightly slow

**Measured:** 9–12 changes per millennium. **Earth:** roughly 15–30 between
well-documented stages, though the figure is soft and depends on what counts as
one change.

`intervalFor()` draws `uniform(50, 150)` years per change — mean 100, so 10 per
millennium. Moving to `uniform(40, 110)` gives a mean near 75, i.e. ~13, and
combined with item 2's variance the fast branches would reach 20+.

- **Touches:** `generate.js`, one line.
- **Effort:** minutes. **Risk:** low in isolation, but it compounds with every
  other item here — do it **last**, once the others have landed, and re-measure
  before and after.

---

## Ordering

| # | item | blocks | note |
|---|---|---|---|
| 1 | Branch-rate variation | 4, 5 | cheapest, and item 4 depends on it |
| 2 | Consonant merger + crowding pressure | — | independent, low risk |
| 3 | **Lexical replacement** | the comparative table, lexicostatistics | the headline |
| 4 | Analogical levelling | — | after 1, since fast branches need something to level |
| 5 | Interval tightening | — | last, and re-measure |

Items 1 and 3 both re-roll every family, so land them together and re-record the
golden changeset snapshot once rather than twice.

---

## What NOT to do

1. **Do not make replacement random.** A generator that swaps arbitrary roots
   produces noise. Every replacement must name its mechanism — derivative, loan,
   neighbour or taboo — and the displaced word must be kept and marked, because
   the *residue* is the point. A family where words vanish cleanly is no more
   realistic than one where nothing ever changes.

2. **Do not let high-frequency core vocabulary be replaced freely.** "I", "two",
   "eye" and "not" are stable across whole families, and that stability is what
   makes the comparative method work at all. Weight replacement against `rank`.

3. **Do not cap inventory size directly.** A hard cap is a rule about the
   output; crowding pressure is a mechanism that produces the same distribution
   for a reason. Same distinction as everywhere else in this engine — bias the
   process, never decree the result.

4. **Do not chase the Earth numbers to three decimal places.** The Earth figures
   are themselves soft: "changes per millennium" depends on what a handbook
   counts as one change, and glottochronology's constant retention rate is
   discredited *as a dating method* even though the retention measurements
   stand. Landing in the right band is success; matching exactly would mean
   something has been fitted rather than modelled.

5. **Do not add semantic drift as a cosmetic gloss-shuffle.** It is on the v2
   list and it should be done properly — broadening, narrowing, amelioration,
   pejoration, metaphor, bleaching — or not at all. Randomly perturbing glosses
   would produce false friends that mean nothing.
