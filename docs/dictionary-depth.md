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

## Next in this step

- Faith words from each religion's sacred language (DJ: my picks, for his veto).
- Words for what a homeland lacks: borrowed, else described (DJ's choice).
- Extra fine words where climate or coast call for them (DJ's choice).
