# Realism plan 2 — the mechanisms that are not sound change

The first realism plan closed five measured gaps and is done. `npm run earth`
now reports the engine as in-band on rate of change, inventory size and lexical
replacement. What it also reports, in its own words, is what is **still absent**:

> STILL ABSENT: analogical levelling (only phonological syncretism is modelled),
> grammaticalisation (no content word has become an affix), and syntax (word
> order never changes).
>
> REMAINING LIMITATION: the neighbour strategy is constrained by semantic DOMAIN
> and part of speech, but not by a semantic PATH.

That is the honest list, and this plan closes it.

**The thesis.** Plan 1 fixed the engine's *arithmetic* — the right number of
changes, the right amount of replacement, the right inventory sizes. The numbers
are now in band and the output still does not feel like a language, because
every mechanism in the engine is still a mechanism that operates on **sounds**.
Sound change plus lexical replacement gives you a family that is correctly
*distant*. It does not give you one that is correctly *messy*, because all four
of the mechanisms that produce mess — analogy, grammaticalisation, semantic
drift and reanalysis — operate on **structure and meaning**, and none of them
are here.

The tell is that everything in a generated language is currently explicable.
Every form is derivable, every paradigm cell eroded exactly as its phonology
predicts, every meaning is either the proto meaning or a documented replacement.
Real languages are full of things that are the way they are because of something
that happened to a *different* word, or because a form was rebuilt on the
analogy of a pattern, or because the spelling stopped moving three hundred years
before the pronunciation did. Residue is not noise added to a clean system. It
is the fingerprint of the system having been used by people.

DJ's brief, answered at the top of the session:

| Question | Answer |
|---|---|
| Scope | All of it — mechanisms, how it reads, and the out-of-band numbers |
| Churn | Re-roll freely; re-record the golden snapshot once at the end |
| Pilot | Alzuria-Ayuman, verified across all six |
| Teleology | Strict mechanism only, but a family's config may seed the *preconditions* |
| Feel | All four: readable etymology, grammar with a history, spelling that lags speech, irregulars and doublets |
| Onomastics | Yes — an archaic name layer |
| Variation | Registers **and** dialect variation |

---

## The measurements this plan starts from

Taken from `npm run earth` before any of the work below.

| | measured | Earth | verdict |
|---|---|---|---|
| Rate of change, Amnant | 7.4 / 1000yr | 15–30 | **SLOW** |
| Rate of change, others | 12.3–16.2 | 15–30 | in range |
| Inventory, Arten | proto 10 → 17 | bulk 20–37 | **OUT OF RANGE** |
| Cognate retention <1000yr | 84% | ~89% | close |
| 1000–2000 | 72% | 60–75% | in range |
| 2000–3000 | 52% | ~71% | **too low** |
| 3000–4500 | 53% | ~40% | **too high** |
| Morphological erosion | 3.7–11.4 pts / 1000yr | 55 (Latin→French), 80 (OE→ModE) | **an order of magnitude slow** |
| Analogical levelling | not modelled | ubiquitous | absent |
| Grammaticalisation | not modelled | ubiquitous | absent |
| Word-order change | not modelled | Latin SOV → Romance SVO | absent |
| Orthographic depth | 0 (spelling always tracks speech) | English ~0.4 mismatch | absent |

The two retention rows are the interesting pair. The curve is the wrong
**shape**: it falls off a cliff between 1,000 and 3,000 years and then goes
flat. Earth's falls smoothly and keeps falling. A flat tail means something is
saturating — sisters are independently landing on the *same* replacement, so the
measure counts a shared innovation as a shared retention. That is a modelling
bug wearing the costume of a calibration problem, and it gets diagnosed in
item 9 rather than tuned away.

---

# Part 1 — The four missing mechanisms

## 1. Semantic paths — `js/engine/lexicon/semantics.js`

**First, because three other items depend on it.** Grammaticalisation is
bleaching plus reduction, and bleaching is a semantic path. False friends are
two sisters taking different paths from one etymon. The `neighbour` replacement
strategy is currently a domain-and-POS match, which is why the earth report flags
it: *"cheek" does not become "belly" in any language*, but nothing currently
stops it.

### What is wrong with domain matching

A semantic domain is a bag. `body` contains "head", "foot", "belly", "cheek",
"liver". Real semantic change does not move freely inside a bag; it follows a
small number of relations that recur in unrelated families with startling
regularity:

- **head** → 'top', 'leader', 'source of a river' — in English, Latin, Chinese,
  Arabic, Hungarian, independently.
- **tongue** → 'language' — English, Latin *lingua*, Russian *язык*, Arabic
  *lisān*, Chinese, again independently.
- **mouth** → 'opening', 'river mouth'. **foot** → 'bottom', 'base'.
  **eye** → 'hole', 'spring of water'. **heart** → 'centre', 'courage'.
- **grasp** → 'understand' (English *grasp*, Latin *comprehendere*, German
  *begreifen*, Greek). **see** → 'know'. **hear** → 'obey' (Latin *oboedire* <
  *audire*).

These are not idioms. They are the same handful of cognitive relations —
metaphor from body to space, metonymy from part to whole, from concrete to
abstract — running in language after language. A curated table of them is not a
cheat; it is the data.

### The seven change types, all attested, all distinguishable

| type | what happens | example |
|---|---|---|
| **broadening** | the sense widens | *dog* was one breed; *bird* was a nestling |
| **narrowing** | the sense contracts | *meat* was any food; *deer* was any animal; *hound* narrowed under pressure from *dog* |
| **metaphor** | mapped to another domain by resemblance | *foot of the hill*, *head of the valley* |
| **metonymy** | mapped by contiguity or part-whole | *tongue* → language; *hand* → worker |
| **amelioration** | the sense improves | *knight* was 'boy'; *nice* was 'ignorant' |
| **pejoration** | the sense degrades | *silly* was 'blessed'; *villain* was 'farmhand' |
| **bleaching** | lexical content drains, grammatical function remains | *go* → future marker |

### How

`SEMANTIC_PATHS` — a hand-curated table over the existing concept list, each
entry `{from, to, type, note, analogue}`. Roughly 150 paths, every one with a
real-world attestation in its note, because the standing rule is that if a change
cannot name its analogue it does not belong in the catalogue.

Shifts become **dated events in the ChangeSet**, exactly like sound changes and
replacements — pinned, deterministic, re-timeable, visible in the change log:

```js
changeSet.shifts = [
  { year, rootId, from: 'tongue', to: 'language', type: 'metonymy',
    keepsOld: true, note, analogue }
]
```

`keepsOld` is the residue rule again. A broadened or metaphorically extended
word keeps its original sense alongside the new one (polysemy is the normal
state; complete replacement of a sense is the exception), so the entry carries
`alsoMeans`. Narrowing and pejoration *do* displace.

Then two things fall out for free:

- **`neighbour` replacement gets honest.** The replacing word must stand in an
  attested relation to the target. `caput` → `testa` is licensed because
  'pot/shell' → 'head' is a real metaphor path; 'cheek' → 'belly' is not
  licensed by anything and stops happening.
- **False friends become meaningful.** `falseFriends()` already exists and
  currently finds only pairs where a replacement moved a gloss. With paths, two
  sisters take *different* paths from one etymon and the pair has a story:
  cognate, one narrowed, one metaphorised.

**Rate:** semantic change is faster than lexical replacement — most words in a
long-lived language shift sense at least once. Target ~25% of open-class entries
carrying at least one shift per millennium, weighted *towards* mid-frequency
items (the very commonest are grammaticalised instead, the very rarest are not
used enough to drift).

**Verify:** a new `earth` section reporting the distribution of shift types
against the rough attested distribution (metaphor and metonymy dominant,
amelioration rarest), and a count of false-friend pairs between sister leaves.

---

## 2. Analogical levelling — `js/engine/morphology/analogy.js`

**Measured:** morphology erodes at 3.7–11.4 points per millennium against
Earth's 55–80 for the fast cases. The engine models only *phonological*
syncretism — `erosion.js` says so explicitly and declines to claim otherwise,
which was the right call and is the gap this closes.

Phonology alone cannot get to Modern French. What finishes the job is speakers:
sound change makes a paradigm irregular, and the next generation regularises it.
That *collapses* distinctions much faster than phonology does, and it is the
single biggest accelerator available.

### The two signatures, which must not be conflated

**Paradigm levelling** — an alternating stem is levelled to one allomorph. Old
English *ċēosan / curon* had a Verner alternation /s/~/r/; Modern English
*choose / chose* levelled it. German levelled the same alternation the other way
in *war / waren*. The alternation was phonologically regular and speakers
destroyed it because it was *irregular from the paradigm's point of view*.

**Class transfer** — a member of a minor class moves to the majority class.
English had hundreds of strong verbs; *holp* → *helped*, *clomb* → *climbed*,
*wrought* → *worked*. The rule is brutally simple and entirely frequency-driven:
below a usage threshold, a speaker who has not heard the irregular form often
enough reaches for the productive pattern instead.

### Why frequency is the whole mechanism

`rank` and `zipfWeight` already exist on every entry, and they are exactly the
right hook. Irregularity survives only where a form is heard often enough that
every child learns it whole. English kept *be/was/were*, *go/went*,
*good/better* — the highest-frequency items in the language — and levelled the
rest. Bybee's frequency effects are one of the best-supported results in
historical morphology, and they are already expressible here.

So: probability of levelling ∝ (irregularity of the form) × (1 − frequency).
No thresholds decreed, no target morphology declared.

### How

Dated events on the ChangeSet, applied after the ruleset and after replacement:

```js
changeSet.analogies = [
  { year, kind: 'levelling' | 'class-transfer',
    cls, cell, target: 'para:n2:GEN.SG',
    from: 'ipa-before', to: 'ipa-after', model: 'the cell generalised from',
    note, analogue }
]
```

Levelling *creates* syncretism, so `erosion.js` must learn a second cause value
alongside `sound-change` and `never-distinct`: `analogy`. It already refuses to
claim analogy without modelling it; now it can, and it will attribute correctly
— which matters, because "these two cells merged because a vowel was lost" and
"these two cells merged because speakers rebuilt one on the other" are different
historical facts.

- **New:** `js/engine/morphology/analogy.js`
- **Touches:** `generate.js` (emit), `project.js` (apply), `erosion.js` (attribute), `lang-panel.js` (show)
- **Effort:** a day. **Risk:** medium — this is where a generator most easily
  starts *inventing* rather than modelling. The guard is that levelling may only
  ever replace a form with one that **already exists in the same paradigm or
  class**; it may never coin a form.
- **Verify:** `earth` section 4 spread should widen to include branches above 40
  points per millennium while conservative ones stay under 10. Both tails, not a
  higher mean.

---

## 3. Grammaticalisation — `js/engine/morphology/grammaticalisation.js`

**The headline item for "grammar with a history".** No content word has ever
become an affix in this engine, which means every language's grammatical
inventory is the proto's grammatical inventory minus whatever eroded. Morphology
is a ratchet that only goes down. On Earth it is a **cycle**: erosion destroys
case marking, and grammaticalisation builds new marking out of ordinary words,
which then erodes in its turn.

That cycle is why Latin lost its cases and French built a new definite article
out of *ille* 'that'; why English lost its future and built a new one out of
*will* 'want' and *going to*; why Chinese, having no inflection left at all,
grammaticalised 了 out of a verb meaning 'finish'.

### The clines

Each is a documented pathway, each requires a source lexeme the concept list
already guarantees (this is why `swadesh.js` puts "be, have, do, go, come,
finish, want, one, that" in the high-priority tier — the comment there says so).

| source | becomes | attested in |
|---|---|---|
| 'go' (motion) | future | English *going to*, French *aller*, Swahili, Zulu |
| 'want' | future | English *will*, Greek *θα*, Romanian, Serbian |
| 'have' | perfect | Romance, Germanic, Albanian |
| 'finish' | completive / perfective | Mandarin 了, Yoruba, Haitian, Thai |
| 'be' / 'stand' / 'sit' | progressive, copula | English *be -ing*, Spanish *estar* < *stare* |
| 'that' (demonstrative) | definite article | Romance < *ille*, Germanic, Hungarian |
| 'one' (numeral) | indefinite article | Romance, Germanic, Turkish *bir* |
| body-part noun ('back', 'face', 'belly') | adposition → case | Hungarian, Basque, Mande, Chinese 上/下 |
| 'say' | complementiser / quotative | Ewe, Japanese, Hindi, African-American English *talkin'bout* |
| 'give' | dative / benefactive marker | Chinese 给, Thai, Vietnamese |
| 'come from' | ablative / past | widespread |
| 'not' + noun ('step', 'thing') | new negator (Jespersen's cycle) | French *ne…pas*, Welsh, Arabic |

### The three hallmarks, all of which must show

Grammaticalisation is not a relabelling. It has a signature, and if the engine
produces only the semantic half it will read as a gloss change and convince
nobody.

1. **Bleaching.** The gloss goes from lexical to grammatical. That is a
   semantic path (item 1), of type `bleaching`.
2. **Phonological reduction.** The grammaticalised form erodes *faster* than the
   lexical one, because it is now unstressed, clitic and hyper-frequent. *going
   to* → *gonna*, *ille* → *le*, *habeo* → *-ai*. Modelled by giving the
   grammaticalised entry a boosted reduction pass and a rank of 1 — after which
   ordinary sound change does the rest, because it is still an ordinary entry.
3. **Layering.** The source word **stays in the language with its lexical
   meaning**. English still has *go* and *will* and *have* as ordinary verbs
   alongside their grammatical uses. This is the residue rule for the third
   time, and it is what stops the lexicon quietly draining.

### Coalescence — where new morphology comes from

Once reduced far enough and consistently adjacent to its host, the form fuses:
it stops being a word and becomes a paradigm cell. Latin *cantare habeo* →
French *chanterai*, a genuine new future tense built out of two ordinary words in
about eight hundred years.

This is the piece that makes morphology a cycle rather than a ratchet, and it is
also the "compensation" the old roadmap scoped and never built. When a case is
lost to erosion, an adposition may grammaticalise into a new one — **but only
because the preconditions arose**, never because a case was lost and something
had to fill the hole. That distinction is the whole of standing rule 3, and the
implementation enforces it by checking preconditions *before* looking at what
was lost, and never passing the erosion report into the chooser at all.

### Guarding against teleology

DJ's answer was "strict, but seed the conditions". Concretely:

- A cline fires only if **its source lexeme exists, is above a frequency
  threshold, and the construction slot is available** (no existing future
  marker → 'go' may grammaticalise into one; an existing one → it may not,
  because renewal is a different and rarer event).
- `lang-config.json` may carry `clineWeights: {<clineId>: multiplier}` clamped
  to [0.05, 5], exactly like the existing `drift` block. **Multipliers only.**
  A family may be more prone to building postpositions out of body parts. No
  family may declare that it *will have* postpositions.
- Nothing anywhere reads the target typology, and nothing reads the erosion
  report to decide what to build.

- **New:** `js/engine/morphology/grammaticalisation.js`
- **Touches:** `generate.js`, `project.js`, `paradigm.js` (accept a new cell),
  `erosion.js` (survival must count gained cells too), `lang-panel.js`
- **Effort:** two days. **Risk:** high — it is the most visible new machinery and
  the easiest place to cheat.
- **Verify:** a new `earth` section counting grammaticalisation events per
  family and per millennium, with the source and target of each. A family that
  produces none over six thousand years is a bug; a family that produces one
  every edge is a worse one. Target: 1 per 1,500–3,000 years per lineage.

---

## 4. Syntax that drifts — `js/engine/syntax/parameters.js`

**Measured:** word order never changes. Every one of the 284 stages has its
proto's syntax.

### What is stored

Basic order (SOV / SVO / VSO / VOS / OVS / OSV, drawn at the proto with the
attested typological frequencies — SOV ~41%, SVO ~35%, VSO ~7%, the rest rare)
plus the Greenbergian correlates: adposition type, genitive order, relative
clause order, adjective order, complementiser position, auxiliary order.

**Coherence** is checked, not enforced. OV languages tend to postpositions,
GenN, RelN and clause-final complementisers; VO the mirror image. *Tend to* —
German is VO in main clauses and OV in subordinate ones, Mandarin is SVO with
postpositions and prenominal relatives, Persian is SOV with prepositions. A
language that is 100% Greenberg-coherent is as unnatural as one that is random.
So the proto is drawn ~80% coherent and incoherence is a state the model
tolerates.

### Drift as a consequence, never a decree

Three mechanisms, each already available:

1. **Case loss removes the licence for free order.** Latin could put the object
   anywhere because the accusative said which noun it was. When erosion killed
   the case endings, word order had to carry the information instead, and the
   pragmatically dominant order rigidified. This is the single best-documented
   word-order change there is, and the engine already computes the erosion
   figure that triggers it. When `inflectionalSurvival` falls through a
   threshold on an edge, order rigidity rises and the dominant order fixes.
2. **Contact.** `arealFeatures()` already exists and already runs on `areal`
   borrowing arrows. Word order is the classic areal feature — it is why the
   Balkan sprachbund exists and why Ethiopian Semitic went SOV surrounded by
   Cushitic. An areal arrow can transfer an order parameter.
3. **Reanalysis.** A grammaticalised adposition (item 3) changes the adposition
   parameter, which then drags its correlates over subsequent edges — Greenberg
   drift as an actual process, playing out across several stages rather than
   snapping.

- **New:** `js/engine/syntax/parameters.js`, `js/engine/syntax/drift.js`
- **Touches:** `project.js`, `text/sentence.js` (sample sentences must render in
  the stage's own order — this is where the change becomes visible), `lang-panel.js`
- **Effort:** a day. **Risk:** medium.
- **Verify:** at least one lineage in six families should change basic order over
  6,000 years, and most should not. Earth's rate is slow: PIE→English is one
  change (SOV→SVO) in 5,500 years.

---

# Part 2 — Making it read like a language

## 5. Spelling that lags speech — orthographic depth

**The mechanism is written and has never once fired.** `romanise.js` documents
it in its header, `evolve()` takes an `orthographyFrozen` flag, and
`sidecar.nodes[id].orthographyFrozenAt` is the switch. Nothing sets it, no
config exposes it, and there are no sidecars on disk. Every language in the tree
therefore has a perfectly phonemic orthography, which no literate language on
Earth has ever had for long.

There is also a real bug hiding behind the flag. `evolve()` currently does:

```js
const romanisation = frozen ? parentState.romanisation : buildRomanisation(inventory);
```

That freezes the **map** and then spells the **current** segments through it.
That is a stale map, not orthographic depth: a word whose /x/ was deleted spells
without the letter, because the segment is gone from the form. Real depth is the
other way round — the spelling records the form the word had *at the freeze*,
and keeps recording it forever while the pronunciation walks away.

### How

- A stage may **standardise** its orthography at a year. Every entry's spelling
  is then computed from its historical form at that year (available already —
  the derivation history stores every intermediate form with its date) and
  stored as `spelledAs`. Descendants inherit `spelledAs` unchanged.
- The panel shows ⟨spelling⟩ against /pronunciation/, and flags the mismatch:
  *spelled as it was pronounced in 1140*.
- **Spelling reforms** re-sync partially. German 1996, Portuguese 1990, Russian
  1918, Turkish 1928 — a fraction of the lexicon is re-spelled and the rest is
  left, which is precisely why a reformed orthography is still not phonemic.
  `reforms: [{year, scope: 'partial' | 'full', share}]`.
- **Which stage standardises** is a config decision with a sane default:
  a stage with a long life and many descendants is the one that gets written
  down. Config may override per node. This is seeding a precondition, not
  decreeing a result.

**Measure:** grapheme–phoneme mismatch rate — the share of entries whose
spelling does not round-trip to their current pronunciation. English ≈ 0.4,
French ≈ 0.35, Spanish ≈ 0.05, Finnish ≈ 0.0. A family with a 12th-century
standardisation and 600 years of change afterwards should land near English.

**Why it is worth doing first among the presentation items:** it is the single
cheapest thing on this list that makes output look like a real language, because
irregular spelling is the most *immediately visible* property of a language with
a history.

---

## 6. Doublets, and the learned stratum

**Doublets** — the same etymon entering the language twice by different routes,
so the two forms show different amounts of change. English *chief* (Norman
French, before the change) and *chef* (Parisian French, after) are the same
Latin *caput*. *Cattle* and *chattel*, *warranty* and *guarantee*, *shirt* and
*skirt*. Spanish *llave* (inherited) and *clave* (learned), both *clavem*.

The engine can already produce these and does not label them. After evolution,
find entries in one stage descending from the same proto root by different
routes — one inherited, one borrowed, or two borrowings at different dates — and
mark the pair. The dating is free and it is the good part: **a loan borrowed
before a sound change underwent it and one borrowed after did not**, so a word's
shape dates its arrival. The panel can say so.

**The learned stratum** is the mechanism that generates doublets in bulk, and it
is missing. A family with a literary or liturgical ancestor re-borrows from its
own older stage: Latin into Romance, Sanskrit *tatsama* into Hindi, Classical
Chinese into Japanese, Church Slavonic into Russian. The learned form is
*conservative* — it skips the sound changes the inherited word underwent,
because it is taken from the page rather than inherited from the mouth.

This is expressible with what exists: mark a stage as a `classicalSource` in
config, and its descendants receive borrowings *from it as it was*, which
`loansFor` already does correctly (`stateAtYear(donor, contactYear)` — borrowing
from a language is borrowing from the language it was). What is new is the
config flag and the automatic contact edges.

The payoff is not the words. It is that this **is** the formal register (item 7)
and it is why the formal register of real languages sounds different from the
colloquial one.

---

## 7. Registers and dialects

DJ asked for both.

**Registers.** Two per stage, formal and colloquial, differing in exactly the
two ways real registers differ:

- The **formal** register is *conservative* and *learned-heavy*. It keeps
  distinctions the colloquial has lost and draws on the classical stratum
  (item 6) — Latinate English, Sino-Japanese, Modern Standard Arabic.
- The **colloquial** register carries an extra reduction pass over the
  highest-frequency items: unstressed vowel deletion, cluster simplification,
  contraction of grammaticalised forms. *going to* → *gonna* is a register fact
  before it is a historical one.

Both are derived, not authored. The colloquial pass is the ordinary rule engine
run with a small fast-speech ruleset over the top of the frequency-ranked head
of the lexicon.

**Dialects.** A sound change with `probability < 1` already gives lexical
diffusion. A *dialect* is the geographic version of the same idea: a change that
reached part of the speech area and stopped. Model it as a small number of
changes per stage flagged `dialectal` with an area label; both reflexes are kept
in the lexicon, standard and dialectal.

Deliberately modest: 1–3 areas per stage, only for stages long-lived enough to
have developed them, and off by default for short edges. The risk here is not
linguistic, it is that every display in the app has to decide which variant to
show — so the default view stays the standard and variants are an expandable
detail.

The English *hound*/*dog* and the north/south *bath* vowel are the same
phenomenon at different scales; getting both is what makes a language look
inhabited rather than specified.

---

## 8. The archaic onomastic layer

Place names are the most conservative stratum any language has. They preserve
forms centuries after the ordinary vocabulary moved on, they keep dead phonemes,
they keep archaic spellings hardest of all (*Leicester*, *Worcester*,
*Featherstonehaugh*), and they are frequently **unanalysable** to their own
speakers — nobody hearing *London* or *Thames* is parsing a meaning.

`names.js` already generates names from a stage's phonology. What makes them
*archaic* is four rules, each of which is a restriction rather than an addition:

1. A toponym is **coined at a year** and then inherited. It undergoes sound
   change like any word.
2. It is **exempt from lexical replacement** entirely. This is what makes it
   archaic — the ordinary word is replaced, the name is not.
3. It is **exempt from analogical levelling and phonotactic repair**, because it
   is opaque. Speakers do not repair what they cannot parse. This is how names
   end up carrying segments and clusters the living language has lost.
4. Its spelling **freezes early and hard**, and is exempt from spelling reforms.

Then the name's etymology is a real fact the panel can print: *Kaastini, from
the Proto-Alzuria compound \*kaas-tin-i "salt harbour", opaque since c. 400 —
the ordinary word for "salt" was replaced by a loan in Old Alzurian*. That
sentence is the whole reason to do this.

---

## 9. Calibration, last

Done **after** everything above, because every item changes the numbers and
tuning before they land would be fitting to a moving target. This is the same
ordering discipline as plan 1's item 5.

**9a. Amnant runs at 7.4 changes / 1000yr.** Diagnose before tuning. The
suspicion is candidate starvation rather than a rate problem: `candidateSequence`
caps each template at two uses and rejects any rule that `hasEffect` says changes
nothing, so a family with a small inventory and initial stress can simply run out
of applicable templates before `CANDIDATE_DEPTH`. If so the fix is in the
catalogue's coverage, not in `intervalFor`.

**9b. Arten's proto has 10 phonemes.** Below Rotokas, which is famous for being
the smallest inventory on Earth at 11. The cause is a thin name corpus giving the
miner little to work with. The fix is a typological floor at generation with a
recorded reason, not a post-hoc top-up.

**9c. The retention curve's shape.** 52% at 2,000–3,000 years and 53% at
3,000–4,500 is not a decay curve, it is a cliff and a plateau. Diagnose the
plateau first: the hypothesis is **parallel innovation** — sisters independently
replacing the same meaning with the same neighbour, which the measure then
scores as retention. If confirmed, the fix is that replacement draws from a
per-branch seeded stream so sisters diverge, which is a correctness fix that
happens to move a number.

Items 1–3 all push retention *down*, so 9c may fix itself. Measure, then decide.

---

# Part 3 — Making it visible

## 10. The dictionary entry

Everything above is worthless if it cannot be read. One composed panel block per
word, which is the deliverable DJ actually asked for:

```
⟨kaastin⟩  /kaːʃtin/   "harbour"   n., class n4, formal register

  *kaas-tin-i  →  kaastini  →  kaːʃtini  →  kaːʃtin
  *salt-place-NOM         Old Alzurian        Middle           Modern

  from  *kaas "salt" + *tin PLACE
  sense narrowed 'salt-place' → 'harbour', c. 210        (metonymy)
  the base *kaas was replaced by the Ayuman loan sarv c. 480, leaving this
    form opaque

  spelled as pronounced in 1140; ⟨aa⟩ has been /aː/ → /aː/ but ⟨st⟩ is now /ʃt/
  doublet: kastin "salt-cellar", borrowed back from Old Alzurian c. 900
  cognates: Tainic kohtin "port", Ayuman xastin "market"
  false friend: Ayuman xastin means "market", not "harbour"
```

Nothing in that block is invented for the display. Every line is a fact some
module already computed and nothing currently prints.

## 11. Measurement

`lang-vs-earth.js` gains sections for each new mechanism, because the standing
rule is that a claim without a measurement is an opinion:

- semantic shift types per millennium, against the attested distribution
- analogical levelling events, and the resulting erosion tail
- grammaticalisation events per lineage, with source → target
- word-order changes across the six families
- orthographic mismatch rate against English / French / Spanish / Finnish
- doublet count, and the dating spread within each pair
- false-friend pairs between sister leaves

`scripts/test-generator.js` gains assertions for each; `scripts/test-engine.js`
keeps Grimm, Verner and Latin→Spanish passing throughout, and **those must never
go red**. They are the trust gate and nothing in this plan is worth breaking
them for.

---

# Ordering

| # | item | why here |
|---|---|---|
| 1 | Semantic paths | three later items depend on it |
| 2 | Analogical levelling | needs only paradigms, which exist |
| 3 | Grammaticalisation | needs bleaching (1) and paradigms (2) |
| 4 | Syntax drift | needs the erosion signal that 2 and 3 produce |
| 5 | Orthographic depth | independent; cheapest large gain in "feels real" |
| 6 | Doublets + learned stratum | independent; feeds 7 |
| 7 | Registers + dialects | needs 6 for the formal register |
| 8 | Archaic names | needs 1 and 5 (exemptions from replacement and reform) |
| 9 | Calibration | last, once the numbers have stopped moving |
| 10 | Dictionary entry | last, once there is something to print |
| 11 | Measurement | continuous — extended as each item lands |

Everything re-rolls the families. The golden changeset snapshot is re-recorded
**once**, at the end.

---

# What NOT to do

Inherited from plan 1 and the roadmap's standing rules, plus four new ones this
plan's subject matter invites.

1. **Do not let grammaticalisation fill a hole.** A language that builds a new
   case *because* it lost one is teleology wearing a mechanism's clothes. The
   chooser must never see the erosion report. Preconditions first, always.

2. **Do not coin forms in analogy.** Levelling replaces one existing form with
   another existing form. The moment analogy is allowed to invent a shape, it
   becomes a random-form generator with a linguistics-flavoured name, and every
   irregularity it produces is meaningless.

3. **Do not let semantic paths run in both directions freely.** 'tongue' →
   'language' is attested everywhere; 'language' → 'tongue' is not. Metaphor runs
   concrete → abstract, body → space, space → time. The table is directed, and
   making it symmetric to save table entries would destroy the one property that
   makes it data rather than decoration.

4. **Do not make orthographic depth cosmetic.** Spelling a word oddly is not
   depth. Depth is the *derivable claim* that this spelling was accurate at a
   named year and the pronunciation moved afterwards — which means the historical
   form must actually be looked up, not approximated. If the panel cannot say
   which century the spelling is honest for, the feature is a texture filter.

5. **Do not chase the Earth numbers to three decimal places.** Unchanged from
   plan 1. Landing in the right band is success; matching exactly would mean
   something was fitted rather than modelled.

6. **Do not tune against Alzuria-Ayuman.** It is the pilot for *building*
   against, not for tuning to. Every change is checked across all six with
   `npm run audit --compare` and `npm run earth`. A measure moving the same way
   in all six families is a shared-catalogue leak, not a family being tuned.

7. **Do not delete anything.** The residue rule, which by now has come up in
   replacement, semantic shift and grammaticalisation independently: the
   displaced word narrows, the source word of a cline stays lexical, the archaic
   spelling survives the reform. A family where things vanish cleanly is no more
   realistic than one where nothing ever changes.

---

> **Note added after writing.** A second Claude Code session was running against
> this repo at the same time, working on the same brief from its own plan in
> [realism-2.md](realism-2.md). To avoid two processes writing `project.js` and
> `generate.js` concurrently, the items this plan covers that the other does not
> — syntax drift, doublets and the learned stratum, registers and dialects, and
> the archaic name layer — were built on the branch **`realism-2-variation`**.
>
> ```
> git checkout realism-2-variation
> npm test && npm run variation
> ```
>
> The full execution record, the file-by-file merge notes and three decisions
> that need DJ are in that branch's copy of this document.
