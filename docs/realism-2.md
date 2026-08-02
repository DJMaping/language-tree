# Realism, round two

`docs/realism-plan.md` closed five measured gaps and its own final section names
what it left standing. This is the plan for those, re-measured first so the
numbers are current rather than remembered.

Every figure below comes from `npm run earth` and `npm run audit` on the
`diachronic-engine` branch at commit `242b886`, before any of this landed.

---

## The thesis

Round one fixed the engine's *lexicon*. Words now get replaced, branches move at
different speeds, inventories no longer ratchet upwards. What it did not touch is
the engine's model of **grammar**, and the shape of that hole is specific:

> **Morphology in this engine can only ever be destroyed.** Sound change eats
> endings, `erosion.js` reports the damage, and nothing anywhere builds anything
> back. A real language runs both processes at once — Latin lost its case system
> and simultaneously grew a definite article, a perfect auxiliary and a future
> tense out of ordinary verbs. The engine has the loss and none of the renewal.

That single asymmetry accounts for most of what still reads as generated:

- morphological erosion is measured at 3.7–11.4 points per millennium against
  Earth's 55–80 at the fast end, because the only thing that can erode a
  paradigm is phonology, and phonology is slow;
- every language's grammatical categories are the proto's categories minus
  whatever fell off, so no daughter has a category its ancestor lacked;
- there is no source of new morphology, so the sixty-third century looks like the
  proto with holes in it rather than like a different language.

Alongside it sit three smaller but very visible gaps: meaning changes only
inside a semantic domain, homophony accumulates and nothing repairs it, and
every language on the chart spells itself perfectly phonemically, which no
literate culture has ever done.

Ranked, as before, by realism gained ÷ risk.

---

## Baseline — what the numbers say today

```
1. RATE OF SOUND CHANGE        13.9 / 13.5 / 16.2 / 7.4 / 14.7 / 12.3 per 1000yr
2. COGNATE RETENTION           84% / 72% / 52% / 53%   at <1k / 1-2k / 2-3k / 3-4.5k
3. INVENTORY                   in range for five of six; Arten out of range
4. MORPHOLOGICAL EROSION       3.7 / 5.5 / 9.6 / 8.0 / 11.4 / 10.6 points per 1000yr
5. LEXICAL REPLACEMENT         65.5% of core meanings replaced (Earth 60-73%) ✓
```

Section 2 is wrong in shape as well as in level. Earth's retention curve is
monotone — two languages cannot become *more* similar as they get further apart —
and the measured curve rises from 52% to 53% between the 2000–3000 and 3000–4500
bands. That is not slow decay, it is a **measurement artefact**, and by the
repo's own standing rule 6 (*measurement bugs are worse than output bugs*) it is
the first thing to fix, before anything is tuned against it.

Section 4 is the headline. The fast tail does not exist: the fastest family in
the engine erodes at a fifth of the rate of Old English → English.

---

## 1. Analogical levelling — **the big one this round**

**Measured:** zero. `erosion.js` says so itself, in a comment that is careful to
label what it detects as phonological syncretism precisely *because* the other
kind is not modelled.

**Earth:** English levelled almost every strong verb; *holp* became *helped*,
*clomb* became *climbed*, and the ones that survived — *be, go, see, take* — are
the high-frequency ones. Levelling is not a footnote to sound change, it is the
other half of how morphology dies.

### Why it is worth more than its size suggests

Levelling is the mechanism that makes case systems collapse *wholesale*. Sound
change merges the dative and ablative in one declension; analogy then spreads
that merger to the other four, because speakers generalise the pattern rather
than maintaining a distinction that only survives in a minority of nouns. That is
why Latin's six cases did not decay gently to five and a half — they went to two
and then to none.

Phonology alone gives a slow, class-by-class trickle, which is exactly the 3.7 to
11.4 points per millennium measured above. Analogy is the accelerator.

### Three mechanisms, all attested, in ascending order of destructiveness

| mechanism | Earth | what it does here |
|---|---|---|
| **stem levelling** | Old English *ceosan/curon* → *choose/chose*; Verner's alternation erased by analogy | the stem allomorph of the most frequent cell is extended across the paradigm, removing an alternation sound change created |
| **class absorption** | English *-s* plural spread from one Old English declension to nearly all nouns | a class with few members adopts a larger class's endings |
| **syncretism extension** | Latin's case system collapsing in Romance | a merger holding in a majority of classes is generalised to the rest, deleting the distinction language-wide |

### How

A levelling is a **dated event in the ChangeSet**, like a sound change and like a
replacement — pinned, deterministic, re-timeable, and visible in the change log:

```js
changeSet.levellings = [
  { year, kind: 'stem' | 'class' | 'syncretism',
    cls, cells, from, to, note, trigger: '<the rule that made it irregular>' }
]
```

Applied in `evolve()` after the ruleset and after replacement, because it is a
*reaction* to what phonology did. Every levelling names the sound change it is
repairing, which is the display that makes it read as history rather than as
noise.

**Resistance is by frequency and nothing else.** `zipfWeight(rank)` already
exists and is already used for exactly this argument in `replacement.js`.
Suppletive entries (`irregular: true`) are immune outright — that is what
suppletion *is*.

- **New:** `js/engine/morphology/analogy.js`
- **Touches:** `generate.js` (emit levellings per edge), `project.js` (apply),
  `erosion.js` (distinguish the two causes in the report), `lang-panel.js`
- **Verify:** `npm run earth` section 4 should widen to include branches above 30
  points per millennium while conservative ones stay under 8. If every family
  moves the same way it is a shared-catalogue leak, not tuning — standing rule 1.

---

## 2. Grammaticalisation — the renewal side

**Measured:** zero. No content word has ever become a bound morpheme.

**Earth:** it is one of the most regular processes in language change, regular
enough that the clines are the same across unrelated families. Latin *habeo*
"I have" became the Romance perfect and then, glued on, the Romance future
(*cantare habeo* → *chanterai*). Mandarin 了 *le* is 了 *liǎo* "to finish".
English *going to* → *gonna*. The demonstrative *ille* became French *le*.

### Why this is the deepest item on the list

Because it is the only thing that can give a daughter a category its ancestor did
not have. Without it, `MORPH_TYPES` is a ceiling: whatever the proto declared is
the most grammar the family will ever have, and every stage below is a subset.
With it, a language that has just lost its case endings can grow adpositions into
new ones — which is not a repair the engine chooses, it is what actually happened
in Romance, in Indo-Aryan, and in Chinese.

It is also the honest answer to the roadmap's warning about teleology. The engine
must never *steer toward* a target typology. But a grammaticalisation cline is
not a target, it is a **source**: a specific, attested, frequency-driven path
that a specific existing lexeme may travel. The engine does not decide the
language needs a future tense; it notices that the language has a high-frequency
verb "go", that "go" is on the venitive→future cline, and rolls.

### The clines, all attested, none invented

```
go / come            → future, andative                 (English, French, Bantu, Tamil)
have / hold / get    → perfect, possessive              (Romance, Germanic, Hindi)
finish / complete    → completive, perfective           (Mandarin 了, Yoruba, Tok Pisin)
be / stand / sit     → progressive, copula              (English, Irish, Dutch)
that (dem)           → definite article, complementiser (Romance, Greek, English "that")
one                  → indefinite article               (Romance, German, Turkish)
back / head / face   → adposition, then case affix      (everywhere; the commonest cline there is)
say                  → quotative, complementiser        (Ewe, Japanese, Hindi)
person / body / self → reflexive, then agreement        (Basque, Slavic)
not + minimiser      → new negator                      (French ne...pas, Jespersen's cycle)
```

### How

Also a dated ChangeSet event. The steps mirror the attested process exactly:

1. **Bleaching** — the source lexeme's meaning generalises. The lexical entry
   survives alongside it: that is Hopper's *layering*, and it is why English
   still has a full verb "go" as well as the *going-to* future.
2. **Phonological reduction** — grammaticalised material erodes faster than
   ordinary words because it is more frequent. The new morph is a truncation of
   the source, one or two segments, chosen so the join is legal.
3. **Bonding** — it becomes a paradigm cell, and from that moment it evolves
   through every subsequent sound change like any other string, which means it
   can itself erode away later and be renewed again. That cycle is the point.

- **New:** `js/engine/morphology/grammaticalisation.js`
- **Touches:** `generate.js`, `project.js`, `paradigm.js` (accept new categories
  mid-family), `lang-panel.js`
- **Verify:** a new `npm run earth` section — at least one family should acquire
  a category its proto lacked, and the source lexeme should still be present as
  an independent word.

---

## 3. Semantic shift along real paths

**Measured:** the `neighbour` replacement strategy picks any same-domain,
same-POS word. `lang-vs-earth.js` already flags this as the known limitation:
shifts are constrained by domain but not by a **path**.

**Earth:** meaning change is not a random walk through a semantic field. It runs
along a small number of relations that recur across unrelated languages —
*tongue* → *language*, *head* → *chief*, *see* → *know*, *grasp* → *understand*,
*heavy* → *sad*. "Cheek" does not become "belly" anywhere.

### Why it matters more than it sounds

Because it is where **false friends** come from, and false friends are the single
most convincing artefact a language family can produce. German *Gift* is
"poison"; English *gift* is a present. Both are the same word. Nothing in this
engine can currently produce that pair, because a meaning only ever moves when it
is displacing another word, and it lands in the same domain it started in.

Drift that happens *without* replacement is what produces divergent glosses
across sisters — and that is a cognate table where the forms match and the
meanings do not, which is what a real comparative table looks like.

### How

A curated relation table over the concept list, every pair carrying its attested
example. Seven shift types: metaphor, metonymy, broadening, narrowing,
pejoration, amelioration, bleaching. Emitted as dated ChangeSet events; the
entry keeps its full gloss history so the panel can print the chain.

- **New:** `js/engine/lexicon/semantics.js`
- **Touches:** `replacement.js` (neighbour draws from the table),
  `generate.js`, `project.js`, `lang-panel.js`
- **Verify:** a new `npm run earth` section counting false-friend pairs — cognate
  pairs whose glosses have diverged. Zero today; a six-thousand-year family
  should have dozens.

---

## 4. Homophony pressure

**Measured:** `npm run audit` shows Dahen-Kino at 1.51 syllables per word and
falling, with hundreds of words sharing a form. Nothing repairs it.

**Earth:** Sinitic went disyllabic *because* sound change destroyed enough
contrasts to make monosyllables ambiguous. 目 *mù* "eye" is now 眼睛 *yǎnjīng*;
虎 *hǔ* "tiger" is 老虎 *lǎohǔ*. Erosion and repair run together.

### How — and why it is not teleology

The temptation is a rule that says "if ambiguity exceeds X, compound". That is a
declaration about the output and the repo forbids it (standing rule 3).

The honest version reuses machinery that already exists. `replacement.js` already
has a **derivative-displaces-base** strategy, and a derivative is by construction
longer than its base. So: *weight that strategy by how ambiguous the base has
become*. A word with four homophones is likelier to give way to its own
transparent derivative than a word with none — which is a statement about
speakers avoiding ambiguity, i.e. a mechanism, and the disyllabification falls
out of it as a consequence rather than a target.

- **Touches:** `replacement.js` only.
- **Verify:** `npm run audit` `sylPerWo` should stop falling monotonically; the
  homophone count in `npm run check` should stabilise rather than compound.

---

## 5. Orthographic depth

**Measured:** zero. `evolve()` accepts `orthographyFrozen`, `project.js` reads it
off `sidecar.nodes[id].orthographyFrozenAt`, and **no family sets it**, so every
language in the chart spells itself perfectly phonemically at every stage.

**Earth:** no literate culture has ever done this. English spelling was fixed
around 1450 and the Great Vowel Shift ran underneath it, which is why *knight* is
/naɪt/. French *eaux* is /o/. This is one of the most immediately recognisable
signs of a language with a history.

### How

The machinery is built; it needs turning on and displaying. A `standardisedAt`
year per family (and optionally per branch, since a branch can standardise
separately — Serbian and Croatian), then an **orthographic depth** metric: the
share of words whose spelling no longer matches their pronunciation, and the mean
edit distance between the two.

- **Touches:** `lang-config.json`, `project.js`, `romanise.js`, `lang-panel.js`,
  `lang-vs-earth.js`
- **Verify:** depth near zero at the standardisation year, rising with every
  century after it. A stage 500 years past standardisation should have visible
  silent letters.

---

## 6. Fix the retention curve first

Section 2 is non-monotone, which means it is measuring something other than what
it claims. Probable cause: the bands mix pairs at very different depths, and deep
pairs are dominated by one enormous family whose internal structure differs from
the others. Fix the measurement — bin by actual divergence depth, weight families
equally, exclude pairs whose common ancestor is the proto itself — *then* look at
whether the level needs tuning.

Standing rule 6. Fix the ruler before trusting the reading.

---

## Ordering

| # | item | why here |
|---|---|---|
| 1 | Fix the retention measurement | nothing below can be judged without it |
| 2 | Semantic paths + false friends | independent, low risk, big visible payoff |
| 3 | Homophony pressure | one file, and it interacts with 2 |
| 4 | Analogical levelling | needs the erosion report it reads |
| 5 | Grammaticalisation | the deepest, and it wants levelling in place first so renewal and loss can be seen fighting |
| 6 | Orthographic depth | cosmetic in the code, enormous in the reading |
| 7 | Compounding | **not planned** — forced by the measurement in item 2; see below |
| 8 | Re-measure, re-record goldens | items 2–7 all re-roll every family; record the snapshot once |

---

---

## What it did — measured after

All six items landed. `npm run earth` before and after, same seeds, same tree.

### The ruler was broken first

Section 2 was non-monotone (52% at 2000–3000 rising to 53% at 3000–4500), and
**two separate measurement errors** were responsible, both pushing the same way:

- divergence was dated from the later diverging child's birth, pretending two
  lineages shared a stretch they did not;
- and each pair was scored over "the first 100 core glosses in A's entry array",
  which is a *different* hundred meanings for every pair once replacement starts
  moving what counts as core — so no two figures shared a denominator.

Fixed (split at the common ancestor's birth, a fixed Swadesh-100, families
weighted equally), the curve is monotone and lands inside the Earth anchors at
every depth:

| depth | before | after | Earth |
|---|---|---|---|
| <1000 | 84% | **83%** | ~89% (Spanish/Portuguese) |
| 1000–2000 | 72% | **67%** | ~60–75% (Eng/Ger, Sp/Fr) |
| 2000–3000 | 52% | **54%** | ~71% (Sp/Romanian) |
| 3000–4500 | 53% ↑ | **49%** | ~40% (Eng/Russian) |
| 4500+ | *(hidden)* | **38%** | ~27% (Eng/Hindi) |

Section 4 had the same disease and worse. "Points lost per millennium since the
proto" **cannot** produce Earth's 55–80: survival starts near 90% and floors near
10%, so eighty points spread over six millennia is arithmetically capped around
thirteen. It was measuring the tree's depth, not its speed. It now reports the
steepest comparable window as well, which is what Latin→French actually is.

### Morphology

|  | before | after |
|---|---|---|
| slowest lineage | 3.7 pts/1000yr | **2.2** (Siaa) — the Icelandic end |
| fastest lineage | 11.4 | **15.9** |
| steepest 1200yr+ window | *(the measure could not express it)* | **5.2 → 25.0** across families |
| categories a daughter has that its proto lacked | 0 | **40 grammaticalised, 129 abandoned** |
| leaves whose category inventory differs from the proto | 0 | **129 of 137** |

Alqiran is the shape that was previously impossible: it lost ACC, GEN, DAT, PRS
and PST, and grew INS and PRF. A Romance-style rebuild — the inherited system
collapsed and a new one was assembled out of adpositions and an auxiliary.

The fast end is still short of Latin→French's 55. The remaining distance is
honest rather than hidden: this tree has **three contact events across 284
languages**, so the borrowing that carried much of Romance's restructuring has
almost nothing to work with here. That is a property of DJ's data, not of the
engine, and drawing more borrowing arrows on the chart is what would close it.

### Semantics and orthography

|  | before | after |
|---|---|---|
| false friends (cognates whose meanings diverged) | 0 | **6,001**, of which 328 keep an identical form |
| words carrying a recorded semantic shift | 0 | **1,839** |
| orthographic depth | 0% everywhere | **up to 86%**; 23% mean in Dahen-Kino |
| core meanings replaced | 65.5% | **71.7%** (Earth 60–73%) |
| syllables per word, Dahen-Kino | 1.51 and falling | **1.77** |

The false friends read the way they should: `/o/` is "soft" in Alqiran and "weak"
in Vascohn (Latin *mollis*); `/rwra/` is "shame" in Beluue and "debt" in Atirhan
Dahen (German *Schuld*). The orthography produces silent letters nobody wrote:
⟨phu⟩ said /pu/, ⟨hrar⟩ said /hra/, ⟨tsli⟩ said /tli/.

### The item that was not in the plan

**Compounding**, and it was forced by a measurement rather than chosen.

Constraining the neighbour strategy to the path table was right, and it cut the
replacement rate to 26% of what the 18%-per-millennium calibration asks for. The
diagnosis was that **41% of core meanings had no available replacement at all**:
a Swadesh meaning very rarely has a licensed incoming path — which is the whole
reason Swadesh chose those meanings — and half of them have no derivative either.

The tempting fix was to widen the table until the numbers came back. That would
have been fitting rather than modelling, and the paths it needed do not exist:
"cheek" does not become "belly" in any language, whatever the arithmetic wants.

The real answer was that a mechanism was missing. On Earth, a language that does
not borrow much replaces vocabulary by **compounding** — Mandarin 目 *mù* "eye"
gave way to 眼睛 *yǎnjīng*, German builds *Handschuh* rather than borrowing a word
for glove, Icelandic coins *tölva* rather than taking "computer". It was already
on the roadmap as a v2 item, for a related reason: the engine generated erosion
and had no repair for the homophony it left. Adding it restored the rate to 100%
of target *and* moved Dahen-Kino's syllables-per-word from 1.51 to 1.77, which is
the disyllabification the roadmap predicted would need exactly this.

### What the work cost

Seven new or rewritten engine modules, **612 tests passing** (up from 575), all
`lang-check` invariants holding, and the golden changeset re-recorded.

Three defects the new tests and checks caught, all silent:

- `levelled()` spliced at the first point of divergence rather than replacing the
  stem positionally, so a dominant stem *kura-* and an outlier *kiran* produced
  *kurairan* — gluing the outlier onto the stem instead of replacing its front;
- the free-drift planner built its "who holds this meaning" index over simplex
  words only, so a core meaning held by a derivative looked *unclaimed* and could
  be evicted by exactly the route the core guard exists to prevent;
- category loss matched cells on their first component, which is a case for nouns
  but a TENSE for verbs — so "PRS.3PL has merged with PRS.3SG everywhere", a
  statement about person, deleted the entire present tense.

And one thing that was missing rather than broken: **the minimal word
constraint**. A one-segment paradigm cell met a deletion rule and became a word
with no sounds in it, which then propagated through levelling to every cell that
copied it. No language tolerates that, and the languages that come close put up
an explicit floor. A change that would empty a word now simply fails to apply to
it — blocking rather than repairing, because repair would mean inventing
segments and blocking leaves the exception a real minimality constraint leaves.

Finally, one invariant that turned out to be wrong rather than violated.
`lang-check` asserted survival can never rise, which was true when loss was the
only thing modelled. It now asserts the sharper thing: **sound change is
monotonic, speakers are not** — a rise is a failure *unless* there was an analogy
or renewal event on that edge. Latin *honos* → *honor* is restoration by analogy,
and forbidding it would have re-asserted the exact assumption this work removes.

---

## What NOT to do

1. **Do not let levelling become a paradigm-fixer.** Analogy is not tidiness. It
   destroys distinctions as often as it restores them, and a levelling that only
   ever makes tables prettier is a script, not a model. Every levelling event
   must be able to *lose* a contrast.

2. **Do not grammaticalise into a target.** The engine must never notice that a
   language has lost its cases and therefore build it some adpositions. It rolls
   against the clines available to the lexemes it has; if a family ends up with
   no future tense for four thousand years, that is a fact about the family.

3. **Do not invent semantic relations.** Every pair in the shift table needs a
   real example attached. A plausible-sounding path with no attestation is
   exactly the fabrication this whole engine exists to avoid.

4. **Do not let orthography drift become gibberish.** Frozen spelling diverges
   from speech; it does not become random. The spelling is *the old
   pronunciation*, which means it must stay derivable from the form at the
   freeze year, not perturbed.

5. **Do not tune against Dahen-Kino.** Standing rule 1. Six families, every time.
