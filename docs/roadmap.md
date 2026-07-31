# Roadmap

Where the diachronic engine stands and what happens next.

Written after a six-dimension audit of why generated Standard Dahen scored 3/9
against Mandarin. Everything here is measured, not estimated — run
`node scripts/lang-audit.js` and `node scripts/lang-report.js "Standard Dahen"
--typology` to reproduce any figure.

---

## Where it stands

**Working and trustworthy.** The sound-change engine reproduces Grimm's Law,
Verner's Law and a twenty-rule Latin→Spanish chain over 22 attested etyma, and
proves its ordering is real by asserting the *wrong* output when rules are
swapped. 41 app tests + 83 engine tests. That suite is the reason anything else
here can be believed.

**Working.** Proto-generation from mined name evidence, per-edge rulesets,
lazy derivation of all 112 Dahen-Kino stages in ~2.7 s, per-word etymologies,
comparative tables, and a panel in the app.

**Not built yet.** Morphology beyond paradigm storage, Schleicher's Fable,
exports, and the whole of the v2 grammar layer.

### Current measurements

| | Dahen-Kino | Target |
|---|---|---|
| schwa share | 24.9% | <12% |
| toned vowels | 34.2% | 0% or ~100%, not in between |
| onset clusters | 49.6% of words | ~0% |
| syllables/word | 1.75 | 1.9–2.0 ✓ |
| segment loss | 0 ✓ | 0 |

Standard Dahen scores **3/9** on the Mandarin scorecard: syllables/word, open
syllables and the aspiration contrast pass; tone, voiced obstruents, clusters,
codas, vowel qualities and schwa share fail.

---

## Phase 1 — Finish the Sinitic character (the current brief)

Ordered by impact ÷ risk. Hard dependencies noted.

### 1.1 Generator regression coverage — **first, before anything else**

`scripts/test.js` covers the app; `scripts/test-engine.js` covers rule
application. **Nothing covers the generator**, which is why six defects survived
in it. Add `scripts/test-generator.js`:

- a **golden changeset** — the template-id sequence per edge for a fixed seed,
  so "this change silently rewrote every language" becomes a visible diff;
- a **non-Sinitic guard** — assert the five other families' toned-vowel share
  and tone-category count stay in band. This is the single check that catches a
  Mandarin fix leaking into Alzuria-Ayuman;
- **phonotactic conformance** — every surface onset satisfies that stage's own
  `isLegalOnset`; `flatten(syllabify(w)).length === w.length`;
- **deletion coverage** — for each of the six stress rules, at least one
  template *that deletes a vowel* is applicable and effective. Not "some
  deletion-category template" — `final-consonant-loss` would pass that while
  every vowel-deletion rule was dead, which is exactly the bug that shipped.

### 1.2 Tone: make a real system reachable — **the biggest item**

Today tone is a **privative contrast on a minority of words**, which is not a
tone system. Four parts:

1. **`js/engine/phonology/tone.js`** — separate tone CATEGORY from its
   REALISATION. The current feature is a single Chao level 1–5 with no contour.
   Mandarin's tones are 55, 35, 214, 51 — three of the four are contours.
   Without this the best reachable outcome is a four-*level* register system
   that ticks the box and sounds nothing like Mandarin. **This is the one place
   where passing the scorecard is not the same as succeeding.**
2. **Fix both guards.** `tonogenesis-coda` and `tonogenesis-voicing` each carry
   `!inv.vowels.some(v => v.f.tone)`. Coda tonogenesis fired on the very first
   edge and thereby locked the voicing split out of all seven descendants — the
   exact change the proto was reconstructed to enable. Replace with
   *source-availability* tests.
3. **`tone-register-split`**, weight 0, `PAIRED`-only, splitting **downward**:
   voiced and breathy onsets *depress* F0, 陽 is the low register. Include
   sonorants in the trigger class (Middle Chinese 次濁 patterns with 全濁).
4. **Extend the devoicing partner to fricatives.** It currently targets stops
   and affricates only, so voiced fricatives survive and the register split
   stays predictable from the surviving onset — allophonic pitch, not a toneme.

Also fix the analogue strings: the Vietnamese tonogenesis note has its sources
swapped, and "Middle Chinese final stops lost in Mandarin, which produced the
tone categories" reverses the causality — the categories predate that loss and
入聲 was *defined* by the stops.

**Depends on:** `PAIRED` atomicity (below).

### 1.3 `PAIRED` atomicity

`pairedWith` is written and read nowhere. The candidate slice has no awareness
of pairing, so a chain can be cut in half by the duration cut — Standard Dahen's
own edge ends on `vowel-nasalisation` with its `final-consonant-loss` partner
truncated away, leaving nasalised vowels whose conditioning nasal is still
present. Three fixes: retract rather than extend at the slice; roll the trigger
back out when a partner fails; persist `pairedWith` in `serialiseChangeSet`.

### 1.4 Cluster and coda reduction

`repairClusters` exists but defaults to `'none'`. Turning it on for a family
whose canon licenses only `tr` should clear most of the 49.6%. Note the true
figure was previously hidden at 17.9% by the syllabifier bug — this is a bigger
problem than it looked, not a new one.

Codas need `final-consonant-loss` to be able to see ŋ, ɳ, w, j, which
[the phonotactics re-derivation] now permits for the first time.

**Consider amending the scorecard's coda row to allow /j w/**: Mandarin's -i/-u
offglides in *ai ei ao ou* are exactly /j w/ codas, so the current predicate is
arguably mis-specified. That is a defensible correction, not gaming — but it
should be flagged in the commit that makes it.

### 1.5 The drift mechanism

`generateChangeSet` already takes a fourth `opts` parameter and **ignores it** —
that is the actual architectural blocker for any per-family steering.

- `data/lang-config.json` gains an optional `drift` block:
  `{ templateWeights: {<id>: <multiplier>}, maxPerEdge: {<id>: <n>} }`
- `generate.js` multiplies the catalogue weight by it, clamped to [0.05, 5].
- **Multipliers only, never absolute weights**, so the catalogue stays the single
  source of typological truth and a family can only tilt it.
- **Validate at load and throw.** A typo currently degrades silently to "no bias
  at all", and nothing validates `lang-config.json` today.
- **A weight of 0 does not remove a template** — `pickWeighted` falls back to a
  uniform draw over the whole pool. Pre-filter instead.
- **Boost nothing before it works.** Multipliers on templates that are bound to
  stale lists or blocked guards are wasted.

Dahen-Kino's profile then damps `reduction-to-schwa` (to 0.4, capped at once per
edge), `anaptyxis`, `prothesis`, `breaking` and `liquid-metathesis`; and boosts
`minor-syllable-reduction`, `schwa-syncope`, `final-consonant-loss`,
`cluster-simplification` and the tonogenesis chain.

**Two things not to do here.** Do not zero anything — an ablation that banned
reduction outright scored *worse*, because reduction was masking a length
explosion (*horse* came out as `pʰy˩wijeːjejeːjejaluhu`). And do not chase
syllables/word below ~1.9: Mandarin's disyllabicity came from **compounding as a
repair for homophony**, not from more deletion. The family already has the
erosion — 417 words now share a form — and what is missing is the repair.

### 1.6 Romanisation

Currently emits `⟨ne2⟩`, `⟨qu˩⟩`, `⟨dehennq'wo˩⟩`. Two causes: `baseIpa` doesn't
strip Chao tone letters, so toned segments miss the preference table and spell as
raw IPA; and 66 of 86 preference lists hold exactly one candidate, so the first
collision falls through to appending a digit.

**Do this after the phonology settles, not before** — and specifically *after*
tone lands, or the fix has to be done twice. The "freeze the orthography at
standardisation" design is already documented and still unwired; freezing today's
output would immortalise `⟨e2⟩`.

---

## Phase 2 — Morphology (the outstanding v1 commitment)

This was in the approved v1 scope and is the piece that stops daughters being
grammatical clones of their proto.

- **Paradigms as real phoneme strings** — already designed; each cell is an affix
  made of real segments, so sound changes eat them like any other string.
- **Erosion → syncretism.** When unstressed finals go, `-am` and `-um` both
  become `-ə` then `-∅`, and ACC.SG/DAT.SG have merged with nobody authoring it.
  `erosion.js` detects the collapse and attributes it to the responsible rule.
- **Suppletion** for the high-frequency irregulars, resisting levelling by rank.
- **Greenbergian coherence checks** on the syntax parameters.

Note the interaction with Phase 1: **final stress protects suffixes**, so
Dahen-Kino's morphology should erode from the *front*. That is the right result —
it is what produced Sinitic's isolating character — but it means the erosion
machinery must be tested against a family with initial or penultimate stress
too, or half of it will never fire.

---

## Phase 3 — Schleicher's Fable (review gate 3)

The glossed template (lemma ids + morphological features + a dependency tree)
rendered through each stage's own lexicon, paradigms and word order. Depends on
Phase 2 — without paradigms there is nothing to inflect.

This is the gate where output quality gets judged by reading rather than by
measuring, and it is worth reaching sooner rather than later for exactly that
reason.

---

## Phase 4 — Exports

- **Lexurgy `.lsc` export** (import deferred, per your call).
- **PolyGlot `.pgd`** so generated languages open in the tool you already use.
- **CSV lexicon**, JSON project, printable grammar sketch.
- **`scripts/lang.js`** headless CLI tying the above together.

---

## Phase 5 — v2 grammar

Designed for, not built: grammaticalisation clines, analogy and levelling,
reanalysis, Jespersen's cycle and the other renewal cycles, alignment shift,
semantic drift and false friends, contact and loanword strata, sprachbund,
dialect continua, creolisation.

**Two additions the audit surfaced that were not in the original design and
should be:**

1. **Compounding / lexeme fusion.** Sinitic went disyllabic *because* sound
   change destroyed enough contrasts to make monosyllables ambiguous. The engine
   generates the erosion and has no repair, so the homophony just accumulates.
   This belongs in `js/engine/lexicon/`.
2. **Contour tone** — see 1.2.

---

## Standing rules

Learned the hard way; violating any of these is how the engine gets worse while
the scorecard gets better.

1. **Never tune against one family.** Five of six had no config until now, so
   every "this won't damage the others" claim was untestable. Run
   `scripts/lang-audit.js --compare` on every change; a measure moving the *same
   way across all six* is a shared-catalogue leak, not a family being tuned.
2. **Never gate a template on a date, a year window or a branch name.**
   Candidates depend only on the seed and the edge identity. Dragging a box on
   the chart must not rewrite six thousand years of sound history.
3. **No declared target typology with engine-chosen repairs.** A constraint
   table mapping "no voiced obstruents" to a hand-written repair list is a script
   with an abstraction layer, and a language that changes *in order to reach* a
   state is teleology. A multiplier biases which of several plausible histories
   happened; a constraint decrees the destination.
4. **No `preset: "sinitic"` anywhere `js/engine` can see.** Even data-driven, a
   named bundle makes "sinitic" part of the engine's vocabulary — and flattens
   real variation, since Wu kept the voicing contrast Mandarin lost and Cantonese
   kept the coda stops. Expand presets to numbers at config load; let the engine
   see only numbers.
5. **Splits stay earned.** A new phoneme appears only because a rule created a
   conditioned allophone and a *later* rule destroyed the conditioning. Never by
   fiat.
6. **Measurement bugs are worse than output bugs.** The syllabifier silently
   dropped segments in 1799 words, and every statistic taken of the engine was
   computed off it. Fix the ruler before trusting the reading.
