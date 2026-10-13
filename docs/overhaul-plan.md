# Language tree overhaul: the plan (13 Oct 2026)

Built from the handoff (miraheze-local branch `language-tree-handoff`), the 10 agent reports that finished,
the partial experiments of the 7 that the network cut off, and DJ's scope decisions of 13 Oct.

## Where things stand

- Repo cloned on this PC at `C:\Users\danny\language-tree`, main at 3d86fc7. All tests pass (41 + 134 + 451 + 380 + 41).
- **Not on GitHub, so not here:** DJ's 13 Oct edits on the other PC (subgroups Azatin, Passonin, Nasucisan,
  Surtian and Mahen on the Alzuria-Ayuman primaries, regions on Azatin and Nasucisan, zero label "0 AFA",
  Vascohn 1525 to 1531) and Claude's living-leaf fix to `scripts/lang-vs-earth.js` section 9.
- The cut-off engine investigators changed code only in scratch copies, which weren't saved. Their patch
  scripts and before/after measurements were saved, though, so five fixes are already written and measured
  (marked **measured** below).

## What is wrong

### Words (the engine)

| Problem | Measured now | Main cause |
|---|---|---|
| Words with no vowel | 6.7% of core words in living languages; Alzuria-Ayuman leaves 12.5%; Arten *sun = moon = stone = ɸ* | Frequency reduction deletes a word's last vowel (87% of cases) |
| Irregular sound change | Blind comparative method: 47.7% regular for Dahen-Kino (Earth 80–90%) | Frequency reduction outside compounds makes half the irregular words |
| Homophony | 45–68% of leaf words share a form with another word | Sub-minimal forms (22% of core homophony), mergers with no functional-load check |
| Every family sounds alike | Tone, aspiration, palatal affricates, /h/ and schwa reach 80–100% of leaves in all six families; only one tone level (˩) exists anywhere | The sound-change catalogue can add these but never remove them; one shared rate table; Middle Chinese defaults for every family |
| Living parents frozen | Standard Dahen stops at 1300, Old Lirali at −300 (8 such languages) | Only leaves get a lifetime of change; daughters copy the parent's birth state, not its state at the split |
| Contact between families does nothing | Emaran → Atirhan Dahen superstrate: 0 loans (232 inside one family); creole second parent ignored | Each family is derived in a sealed project |
| Integrity bugs | 1,920 "learned" loans identical to the native word; 110 orphaned entries; 2,567 reductions with no history step; therapy rebuilding inflected forms; U+FFFD characters; Lycroan → Eldjan substrate dated 1300, before Lycroan exists (1400) | Several small bugs (patches written) |
| No family character | All six protos: /i e a o u/, agglutinative, nom-acc, same root length; vowel harmony can never fire; affix position comes from stress; word order is a dice roll (Dahen-Kino OVS) | Defaults and seeds instead of evidence; a harmony donor bug |
| Unstable | Renaming one box regenerates 90–99% of its family; dragging can change 84% of a descendant | One random stream over 600 concepts; seeds keyed to the name-derived id; nothing pinned; no locks |
| Rulers | Proto and daughters counted differently; allophones counted as phonemes; the tone guard passes while every family is tonal | Measurement scripts |

### The tree (canon)

- 6 of the 14 families on DJ's map; 28 of about 105 canon languages. Arten (581M L1) and Lastnu (2,995M total) have no node.
  By population the tree covers Ayuma 98% but Acrola 9.8%, Mahea 0.9% and Quia 0%.
- Seljan sits in Alzuria-Ayuman but canon makes it Tainabide. Spellings differ from the map: Saestnde/Saetnde,
  Surtian/Surtan, Queians/Quaians, Esereign/Eserign, Ankuano-/Ankusano-Elaian. Secssu (Dahen-Kino) clashes with Secsuu (Casa-Mahean).
- Dates are placeholders: 229 of 284 births fall on 50-year marks; protos live for millennia; none of the 15 primary
  branches has died out; 0 events, 3 borrowings, 0 regions; the title still says "Languages of Ayuma".
- Some wiki dates contradict the tree (an Arten kingdom by 2740 BFA against Proto-Arten at −2159; the Vestorian
  Empire by 470 BFA against Vestorian born 700 AFA).

## How the work runs

A branch `overhaul` in a worktree at `C:\Users\danny\language-tree-overhaul`, so main and the open app are untouched.
Every phase ends with `npm test`, `npm run validate`, a one-page scorecard and a review gate; it merges to main when
DJ is happy. No generated word is locked yet, so output regenerates freely; the golden snapshot is re-recorded once per phase.

## Phase 0: rulers and baseline (small)

- Redo the lang-vs-earth section 9 fix. One inventory counter for proto and daughters, plus a PHOIBLE-style count.
- `lang-audit` gains: share of leaves with each marked series, an appear/disappear ratchet line, vowelless and
  single-consonant words, homophony split by cause. A catalogue-symmetry test replaces the weak tone guard.
- New `npm run scorecard`: the single table every gate reviews, each family against Earth bands.

**Output:** the baseline scorecard.

## Phase 1: word engine fixes (medium to large)

Applied in this order, each one measured against the scorecard:

1. **Integrity (measured).** The last vowel is never deleted; a word holding a core meaning can't be a loan source;
   therapy repairs words, not inflected forms; learned loans identical to the native word are dropped; every
   rewrite is logged in the history; U+FFFD and orphans fixed; a contact dated before its donor exists is flagged.
2. **Frequency reduction only in compounds (measured).** Irregular words fall from 26% to 12% in both big families,
   and common words stay shorter than rare ones.
3. **Lineage (measured).** Living languages with daughters keep changing to the present; a daughter branches from its
   parent's state at the split year.
4. **Reversible sound systems.** Removal changes (tone loss, deaspiration, deaffrication, h-loss, central-vowel merger)
   and a functional-load gate on mergers go in together: the removers alone raised homophony in 5 of 6 families.
   Glide strengthening gets real outcomes (not always d͡ʑ), schwa reduction follows stress, and the defaults stop being Middle Chinese.
5. **Tone.** Several levels and contours, a second tonogenesis adds a level, and tone can be lost.
6. **Family drift.** Each family and branch inherits its own sound-change tendencies, so families stop converging.
   Also the vowel-harmony donor fix, affix position from head direction, and agglutination with separable morphs.

**Targets:** vowelless core words 0; ≥ 80% regular on the blind comparative method; core homophony toward Earth
(about 15% or less); family × feature cells at ≥ 80% of leaves down from 32/48 to 16/48 or fewer; at least 2 tone
levels wherever tone exists.
**Gate:** the scorecard, plus a core-word table per family (I, two, water, sun, moon, stone, fish and so on).

## Phase 2: stability and locks (medium)

- One random stream per concept, and seeds keyed to a stable uid instead of the name-derived id, so renames stop rerolling.
- A frozen evidence list per family.
- A pinned file per family (`data/lang/<root>.lang.json`: approved profile, inventory, proto words, rule sets), so
  dragging a box re-times its changes instead of rerolling them.
- **Locks:** a word or name DJ approves is recorded in its history, never changes, and is inherited by descendants.
- After each save, a short "% changed" note per family.

**Gate:** DJ renames and drags boxes in the app; nothing outside the edit rerolls.

## Phase 3: the world skeleton from canon (medium to large)

- A `families[]` registry from the People Atlas: 14 families with their map branches, kind (family, isolate,
  constructed, creole), speakers and wiki page.
- A node `kind` and `extraParents` with roles (lexifier, substrate, source), generalising `secondaryParentId`.
- Every family gets its map branches as subgroups and its canon languages as leaves (about 105). Arten is rebuilt
  (6 branches, living Arten as a macrolanguage), Seljan moves to Tainabide, Lastnu becomes a constructed node, and the
  7 official-language mismatches become colonial varieties.
- 1765 speakers (L1 and L2) from the wiki lists; regions from the Atlas states.
- Dates flagged `placeholder` or `anchored`; title "Languages of Andah"; DJ's 13 Oct edits re-applied.
- Families with no engine settings yet still draw on the chart (no words).

**Gate:** chart screenshots per family; DJ approves the skeleton.

## Phase 4: family character from evidence (medium, per family)

- Evidence = canon city names in each family's countries (weighted by the map's branch shares), canon language and
  branch names, and canon words on the wiki.
- The engine infers each family's character (sounds, word shape, tone tendency, morphology, word order) from that
  evidence, as DJ decided; DJ can override any dial.
- The two review gates per family (mined profile, then proto inventory) become an in-app flow, run for all 14 families.

**Gate:** per family.

## Phase 5: history and contact (large)

- Claude drafts from the wiki, the Grand Game Timescale and the Colonial Assignments artifact: events, conquest
  outcomes (heavy superstrate, shift, or little trace), colonial spreads and contact arrows. DJ approves before any of it feeds the engine.
- A world-level contact pass, so cross-family loans, creoles and Lastnu's sources actually deliver words.
- Lastnu built from its sources: mostly Emaran, Lycroan and Alzurian; partly Estijan and Arten; minor Dahen, Alqiran
  and small Alzuria-Ayuman languages.
- Dates snapped to events, extinctions where history kills languages, and classical or liturgical languages that cross families.

**Gate:** the history draft first, then the result.

## Phase 6: scale to 300–500 living languages (large)

- Regional and minority languages per country from the map shares; isolates and small families in refuges; dialect
  and macrolanguage status.
- `npm run shape` keeps the tree Earth-shaped. Performance work (a full derivation already takes 52 s for 284 nodes).

**Gate:** per continent.

## Decisions for later phases (not needed to start)

- **Phase 3:** is Dahen (709M) a macrolanguage over the tree's Dahen varieties? Is Praesian the same as Fravala?
  Is Eosl dying (tree: 300 speakers) or common (wiki: one of Central Ayuma's most common)?
- **Phase 4:** Dahen-Kino word order. The default follows the Sinitic goal (SVO) unless DJ wants to keep the dice-rolled OVS.
- **Phase 5:** Lastnu's date, place and makers; when and where writing arose; the outcome of each major conquest;
  whether Unwosian and Carthic are isolates or early branches; Atirhan Dahen's two parents.
