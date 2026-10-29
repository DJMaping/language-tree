# Deeper dictionaries

DJ, 30 Oct 2026: "the level of complexity of like how many words are actually being used and what they mean and the how big is the dictionary". Step 4 of the plan in `writing-systems-plan.md`.

## What changed

| | Before | Now |
|---|---|---|
| Concepts per family | about 760 | about 1,500, plus Andah's own species |
| Meanings in a living language (1765) | about 1,450 | 2,800 to 3,200 |
| Older words changed by the addition | | none of 18,600 in 12 languages |

- **The wider vocabulary** (`js/engine/lexicon/wider.js`): 731 everyday concepts across the 28 domains. Animals and plants are *kinds*, not Earth species ("bird of prey", "needle tree", "beast of burden"), because Andah's beasts and plants are its own.
- **One word for two meanings** (`WIDER_COLEX`, 27 pairs): fire and flame, sky and heaven, meat and flesh, time and weather, among others, at rough Database of Cross-Linguistic Colexifications (CLICS) shares. Each lineage joins and splits them over time, as `colexify.js` does for hand and arm.
- **Andah's tamed animals and crops** (`lexicon/species.js`, `scripts/build-domestication.js`, `data/canon/domestication.json`), from DJ's map "Domesticating plants and Animals in Andah (Janus)". There are 26 hearths and 67 species. Each species is native to the family at its hearth and spreads at about 1 km a year over land, and a quarter of that over sea. A species that reached a family before its proto is in the proto as an old loan. One that arrives later is borrowed that year from the hearth family's language, or named afresh where that language is unknown. Contact lends species sooner (`contact.js makeLoans`).
- **The written preview**: the panel's "At a glance" draws its sample sentence in the language's own script (`lang-panel.js scriptPreview`).

## The stability rule

Every new entry carries `wider: true` and is left out of every count the engine plans by. That covers the sound-change sample, the tidy census, homonym therapy, the inventory and syllable census, class sizes and exemplars, affix shapes, homophone blocking, loan counts (loans run in two passes) and the loan guard on shared senses. This is why adding them changed no older word. **Any new count over the whole lexicon must skip `e.wider`, or it re-rolls whole families.** Check with `.probe/churn.mjs` against `.probe/words-before.json`.

## Waiting on DJ

1. **The older list's Earth farm species**: dog, horse, cow, sheep, goat, pig, chicken, wheat, rice, barley, wine and more, in every language since the start. They could be re-labelled as his species (keeping each language's word), dropped, or kept as living beside his.
2. **Wild species names**: only the Barar and Zubis (trees), the brown Cial, the striped Slin, the Buthro and the Siita sand Yuant are named on the wiki. The dictionary uses general kinds until he names more.
3. **Hearth names I could not read for sure**: Rica, Te, Samvor, Odva, Bary, Atavala and Veuy are left out. The legend's unheaded columns (Arna to Nol) are entered as crops of no stated kind.
4. **Hearth placement**: the dots were placed by fitting a Robinson projection to his map (71% of the land agreeing). For example, Kari lands in Ealdorii, Passonia in Taval and Telitana in Maalle.

## Faith words and the fine words of the land

- **Faith words** (`lexicon/faith.js`): when a people takes up a faith, it takes many of the faith's words from the sacred language as it stood at the founding, as English took altar, saint and scripture from Latin. That is 22 words, roughly half the nouns and a third of the verbs, and each one displaces the native word. A sacred language's own descendants keep their native words. The faith and the year each language took it up come from the script history (`data/history/script-history.json` `faiths`, 132 languages). The sacred languages are my picks, for DJ's veto:

| Religion | Founded | Sacred language, as it stood |
|---|---|---|
| Tzinalli | 3000 BFA | Proto-Arten (2800 BFA, the oldest Arten on record) |
| Kallimethra | 1000 BFA | Saetnde, as Latin for the Church |
| Imarel | 400 BFA | Proto-Ankusano-Elaian, the makers of the Ankusano letters |
| Thessovai | 300 BFA | Osnealan |
| Kelhari | 200 BFA | Classical Ukhdari, as Arabic for Islam |
| Srivandha | 500 AFA | Sakernlesi, as Pali |
| Passanu | 500 AFA | Passonin |

- **The fine words of the land** (`lexicon/environment.js`, `scripts/build-environment.js` into `data/canon/environment.json`): 46 words for cold, polar, dry, tropical and coastal lands, such as powder snow, sea ice, dunes, dry riverbeds, the flood season and tide pools. They come from the Köppen shares of DJ's climate map and the coastal countries. A family whose homeland has the climate has them in its proto. A later language living in such a land coins its own at its birth.
- **A fix to the script history**: a script a people already wrote is no longer relabelled, and so redated, when a stronger reason brings the same script later. Casan's Dahen script dates from its birth in 2000 BFA, inherited, and is held by Kallimethra from 850 BFA (`heldBy`). Before, it read as Kallimethra's in 2000 BFA, a thousand years before the faith arose. No religion event now comes before its faith's founding.
