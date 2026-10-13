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


## Progress: Phases 0 to 2 done (13 Oct 2026, branch `overhaul`)

Measured with `npm run scorecard` over every family's living languages, on DJ's merged tree. Numbers move a few
points whenever the families regenerate, so read the direction, not the last digit.

| Measure | Before (main) | Now | Earth / target |
|---|---|---|---|
| Core words with no vowel | 0.3–17.8% | 0 everywhere | 0 |
| Core words that are one consonant | up to 10.3% | 0 | 0 |
| Core words sharing a form with another word | 28–56% | 17–33% | 15% or less |
| All words sharing a form | 45–68% | 15–34% | 20% or less |
| Inherited core words with an irregular history | not measured | 9–25% | 10–20% |
| Blind comparative method, four leaves | DK 47.7%, AA 23% | DK 51.9%, AA 57.7% | (information only) |
| Syllables per core word | 1.0–1.8 | 1.55–1.94 | follows the names |
| Family × series cells at 80%+ of leaves | 30/36 | 17/36 | half the baseline |
| Tone levels in a tonal family | 1 | 2–3 | 2+ |
| Series that can be lost again | 1 of 6 | 6 of 6 | all |
| Living languages frozen at birth | 8 | 0 | 0 |
| Core meanings with no word | 103 | 0 | 0 |
| Learned loans identical to the native word | 1,920 | about 125 | 0 |
| Words changed by renaming or adding a language (pinned family) | 98–99% | 0% | 0 |
| Words changed by dragging a language 50 years (pinned) | 48–57% | 4–14% | what the later split brings |

### What changed
- **Phase 0:** `npm run scorecard`; one ruler (`scripts/measures.js`) for proto and daughters; the Earth report's
  living-language gap measured honestly. The handoff's "U+FFFD bug" was the old harness's placeholder for a
  meaning with no word.
- **Phase 1:** the last vowel is never deleted; frequency reduction erodes compounds only; coined words get a history
  from coinage; loans and therapy no longer orphan meanings; liquid metathesis is regular and a word is only logged
  as escaping a change it was eligible for. A functional-load gate on rule choice (Wedel, Kaplan & Jackson 2013)
  and inhibited sound change (Blevins & Wedel 2009). The lineage model: each language owns its lifetime, a
  daughter starts from her parent as it stood at the split, sisters share innovations, living parents keep
  changing. Removers for tone, aspiration, affricates, /h/, schwa and front rounded vowels; tone in registers and
  layers, weighted by monosyllabicity; inherited family drift; proto word length and erosion follow the names;
  real glide-strengthening outcomes; vowel harmony works.
- **Phase 2:** a stable `uid` survives renames; one random stream per concept; pin files (`npm run pin`) freeze an
  approved family's evidence and sound changes; a lock button per word in the Lexicon (`locks` on the language).

### Still open
- Homophony is still above target in places (Arten 33%), and tone, once a proto gains it, reaches most of the family.
- **Dahen-Kino reads less Sinitic than before** (longer words, fewer tones per word; see the table). Its character
  sheet in Phase 4 should fix this from the evidence rather than by hand-tuning now.
- Moved to Phase 4 (they are family character, not mechanism): affix position from head direction, agglutination
  with separable morphs, and the proto defaults (Middle Chinese voicing, five vowels) for the provisional families.
- Cross-family contact still delivers nothing (Phase 5, as planned). Nothing is pinned yet: pin a family once its
  character is approved.

### Core words, before and after (two living languages per family)

| Language | | I | two | water | fire | sun | moon | stone | fish | eye | mother | night | eat |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Qai Qi (Dahen-Kino) | before | nai | nt͡su | nãβ | t͡ɕro˩ | t͡ɕhi | hpu | do˩ | pl | d͡ʑre˩ | nli | ə̃nru | htʰuː˩ |
| | after | o | ala | ɖəldo | t͡ɕəβəlo | t͡ɕadbo | əlto | tʰat͡ɕle | bəβa | ɖəɣe | no | ʑəro | nhe |
| Xin Kuriang (Dahen-Kino) | before | ne | nət͡swo̞ | lit͡ɕhwəwãm | t͡ɕrwo̞wo̞ | lit͡ɕhi | t͡ɕhiːwo̞ | hwo̞ | wli | d͡ʑrət͡ʃi | nli | ərwo̞ | ho̞ |
| | after | o | lɘja | ʈʰalo | halo | hjao | hazo˨ | halɘ | pʰa | ʈʰɘ | njao | ɕaru | nɘ |
| Alqiran (Alzuria-Ayuman) | before | h | r | f | ɜːh | wo˩hmi | ma | i˩ | pʰt͡ʃə˩na˩ | t͡ʃa˩xtwo˩ | ɡlwo˩ | bɜ | — |
| | after | hu | t͡ɕjil | az | luzɣjir | pzir | rwaz | ãz | ɸrja | pɸər | t͡ʃrəɣvuz | t͡ɕiʃmuz | hizztzur |
| Eute (Alzuria-Ayuman) | before | ho | t͡ʃa˩re | t͡ʃə˩htʰa | rwetʰh | rwe | ehtʰi˩tʰ | h | eme | hrezu˩ | ol | ŋjar | wo |
| | after | huh | t͡ɕjəl | a | luzɣjar | ʔla | rwaː | aː | ɸrjət͡ɕa | kuw | har | təʃmus | hihthur |
| Bayudaiar (Arten) | before | na | ma | t͡ʃlɛ˩ | hŋi | ɸ | ɸ | ɸ | xɸ | im | kʰu | ɾi | i |
| | after | e | ʑje̞˨ | kãm | ha˦haː | ajwu | ejj | tu | ka˦ | a | je̞˨ | iwu˩ | ɕe̞˨wuw |
| Bewilojega (Amnant) | before | pʰa | tʰm | mẽŋ | bwəwõː | pʰwok | leː | mled | kʰwoː | do | kʰneb | bwod | ŋwod |
| | after | pu | ŋix | hutʃi | d͡ʑji | wulət͡ɕ | naβd͡ʑawəx | hjẽmβuɡən | nwəŋ | bjid͡ʑən | d͡ʑizwĩn | ɡuːhilən | hu |
| Divopaneyi (Amnant) | before | ba | tm | hõm | wõmp | wo | lɘh | mlɘt | wohp | d͡ʑɘ | kẽmbẽn | won | ŋwot |
| | after | pu | ŋih | hiʃi | ɖjiɸ | wul | naβʑa˨wəh | hjimpwən | nwəŋ | ʝiɕ | ɖi˨zwĩn | kyːhi | hu |
| Zarsing (Tainabide) | before | n | oːs | t͡ɕnẽm | ljextʰõn | t͡ɕjarr | t͡ʃjejr | ot͡ʃ | t͡ɕejn | orm | t͡ʃjejr | at͡ʃ | ar |
| | after | il | nimim | iβjiljan | ʝan | ʝan | nimjawk | rjilin | nipja | ʝʝam | ljawim | lamjilm | tʰjirin |
| Ikzen (Tainabide) | before | n | sn | d͡ʑnĩm | n | d͡ʑriː | əst͡ʃiː | ut͡ʃ | ijn | ũːm | t͡ʃiː | a | əsril |
| | after | il | namim | ciβjaljaː | caː˨ | ca˨n | namjawk | rjaliː | pja | jam | lɛːwa | lamjal | azjaraː |
| Marame (Queians) | before | je | βuje | kʰa | βa | nj | ɡəlje | je | pa | ɸ | uh | jeɸ | blu |
| | after | d͡ʒax | jəjɘ | pʰax | awe̞ɸ | nowɣawəjas | bawe̞ | d͡ʒãm | maɣɘ̃lɘsəsaɸ | ɟaɣe̞ɸ | t͡ʃjɘ̃nə̃mãm | d͡ʒije̞ɸ | waɣɣax |
| Cicaecu (Queians) | before | kʰi˩ | mi | pʰh | am | nwuːj | kʰli | tuhpʰiː | pʰa | kʰuɸ | w | kʰi˩ɸ | mlwu |
| | after | ʒa˨ | cʰji | a | awəɸ | nɔwɣa˨wəjas | pʰa˦w | pʰwɤm | malisə˦sa˦ɸ | cʰa˨ɸ | pʰjiɣniməm | ʒi˨jəɸ | waɣa˨ |


## Progress: Phase 3 done (13 Oct 2026)

`scripts/build-skeleton.js` rebuilt the chart from `data/canon/` (the People Atlas extract of DJ's family map and
the wiki's native-speaker list with its branch column). Re-runnable and idempotent. 284 to 383 languages:

| Family | Nodes | Living |
|---|---|---|
| Alzuria-Ayuman | 146 | 57 |
| Dahen-Kino | 119 | 70 |
| Casa-Mahean | 22 | 17 |
| Arten | 21 | 12 |
| Ankusano-Elaian | 14 | 9 |
| Tainabide | 12 | 6 |
| Amnant | 10 | 5 |
| Quaians | 7 | 3 |
| Irasumi | 7 | 3 |
| Zanalaric | 6 | 5 |
| Tabber-Nij | 6 | 4 |
| Pyrru-Kanqer | 5 | 4 |
| Kuhn | 5 | 4 |
| Isu-Omelic | 2 | 1 |
| Lastnu | 1 | 1 |

- All 14 map families with their map branches; every canon language (35 ranked, 70 named on country pages) is a node.
- Map spellings (Saetnde, Surtan, Eserign, Quaians); Seljan moved to Tainabide (Mintarchesee, beside Ikzen).
- The Arten branch is the Arten macrolanguage (581M); Dahen, Qai Dahen and Shie Dahen are macrolanguages too.
- Lastnu is a constructed root with dashed lines to Emaran, Lycroan, Estijan, Arten, Dahen and Alqiran.
- Each language carries its 1765 speakers and the states it is official in, marked colonial where the map shows another
  family; each branch carries the states where the map gives it the majority. The panel shows all of it.
- New families have no engine settings yet, so they draw on the chart without words; their character comes in Phase 4.
- **Every new date is a placeholder** (new families at -3000, their branches at -2000, languages at 800, colonial
  varieties at 1650, Lastnu at 1700) until Phase 5 anchors them to the wiki's history.
- Engine fixes found on the way: tones that arose after a spelling was frozen spelled "undefined"; place names are now
  coined and carried through the lineage model and wear at the seam (Bristol), so old names can be opaque again.

## Decisions for later phases (not needed to start)

- **Phase 3:** is Dahen (709M) a macrolanguage over the tree's Dahen varieties? Is Praesian the same as Fravala?
  Is Eosl dying (tree: 300 speakers) or common (wiki: one of Central Ayuma's most common)?
- **Phase 4:** Dahen-Kino word order. The default follows the Sinitic goal (SVO) unless DJ wants to keep the dice-rolled OVS.
- **Phase 5:** Lastnu's date, place and makers; when and where writing arose; the outcome of each major conquest;
  whether Unwosian and Carthic are isolates or early branches; Atirhan Dahen's two parents.
