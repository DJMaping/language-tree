# Deeper dictionaries

DJ, 30 Oct 2026: "the level of complexity of like how many words are actually being used and what they mean and the how big is the dictionary". Step 4 of the plan in `writing-systems-plan.md`.

## What changed

| | Before | Now |
|---|---|---|
| Concepts per family | about 760 | about 1,500, plus Andah's own species |
| Meanings in a living language (1765) | about 1,450 | 2,800 to 3,200 |
| Older words changed by the addition | | none of 18,600 in 12 languages |

- **The wider vocabulary** (`js/engine/lexicon/wider.js`): 774 everyday concepts across the 28 domains. The wild animals and plants carry Earth's names as stand-ins for Andah's own (DJ's choice).
- **One word for two meanings** (`WIDER_COLEX`, 27 pairs): fire and flame, sky and heaven, meat and flesh, time and weather, among others, at rough Database of Cross-Linguistic Colexifications (CLICS) shares. Each lineage joins and splits them over time, as `colexify.js` does for hand and arm.
- **Andah's tamed animals and crops** (`lexicon/species.js`, `scripts/build-domestication.js`, `data/canon/domestication.json`), from DJ's map "Domesticating plants and Animals in Andah (Janus)". There are 26 hearths and 67 species. Each species is native to the family at its hearth and spreads at about 1 km a year over land, and a quarter of that over sea. A species that reached a family before its proto is in the proto as an old loan. One that arrives later is borrowed that year from the hearth family's language, or named afresh where that language is unknown. Contact lends species sooner (`contact.js makeLoans`).
- **The written preview**: the panel's "At a glance" draws its sample sentence in the language's own script (`lang-panel.js scriptPreview`).

## The stability rule

Every new entry carries `wider: true` and is left out of every count the engine plans by. That covers the sound-change sample, the tidy census, homonym therapy, the inventory and syllable census, class sizes and exemplars, affix shapes, homophone blocking, loan counts (loans run in two passes) and the loan guard on shared senses. This is why adding them changed no older word. **Any new count over the whole lexicon must skip `e.wider`, or it re-rolls whole families.** Check with `.probe/churn.mjs` against `.probe/words-before.json`.

## Waiting on DJ

1. **Done**: the older list's Earth farm species are re-labelled as his (`lexicon/relabel.js`, DJ approved the matches). Dog is the Farl, cow and bull the Verr, sheep the Osig, goat the Nema, pig the Ata, chicken the Tnsiam, horse the Taletana, wheat the Vasis, barley the Tomeu and rice the Kenio. Each language keeps its word; the panel, dictionary, word lists and translator show and read the new names.
2. **Wild species**: DJ chose Earth stand-ins. Earth's names (lion, oak, whale) are English labels for Andah's own until he names them. The wiki names only the Barar, Zubis, brown Cial, striped Slin, Buthro and Siita sand Yuant.
3. **Hearth names**: Rica, Te, Samvor, Odva, Bary, Atavala and Veuy are added as read (DJ), as crops of no stated kind, like the legend's unheaded columns (Arna to Nol).
4. **Hearth placement**: the dots were placed by fitting a Robinson projection to his map (71% of the land agreeing). For example, Kari lands in Ealdorii, Passonia in Taval and Telitana in Maalle.

## Faith words and the fine words of the land

- **Faith words** (`lexicon/faith.js`): when a people takes up a faith, it takes many of the faith's words from the sacred language as it stood at the founding, as English took altar, saint and scripture from Latin. That is 22 words, roughly half the nouns and a third of the verbs, and each one displaces the native word. A sacred language's own descendants keep their native words. The faith and the year each language took it up come from the script history (`data/history/script-history.json` `faiths`, 132 languages). **Switched off (30 Oct 2026)**: DJ found none of my sacred-language picks right ("come back to this later"). `SACRED` in `lexicon/faith.js` is empty until he names each religion's sacred language and the year its words freeze at. The machinery is ready, and he can say "Kallimethra: Old Emaran" and so on.

- **The fine words of the land** (`lexicon/environment.js`, `scripts/build-environment.js` into `data/canon/environment.json`): 46 words for cold, polar, dry, tropical and coastal lands, such as powder snow, sea ice, dunes, dry riverbeds, the flood season and tide pools. They come from the Köppen shares of DJ's climate map and the coastal countries. A family whose homeland has the climate has them in its proto. A later language living in such a land coins its own at its birth.
- **A fix to the script history**: a script a people already wrote is no longer relabelled, and so redated, when a stronger reason brings the same script later. Casan's Dahen script dates from its birth in 2000 BFA, inherited, and is held by Kallimethra from 850 BFA (`heldBy`). Before, it read as Kallimethra's in 2000 BFA, a thousand years before the faith arose. No religion event now comes before its faith's founding.

## Borrowing by field, against Earth (30 Oct 2026)

`npm run check:loans` measures each field's share of loanwords in 40 living languages, against the World Loanword Database (WOLD: Haspelmath and Tadmor 2009). Before, loans piled into the superstrate's seven fields (56 to 61%, against Earth's 24 to 41%), and tools, houses, farming, time and speech borrowed almost nothing (Earth 22 to 37%). Every loan is now drawn by its field's Earth borrowability, with the contact's own fields half as likely again (`contact.js` `WOLD`, `selectLoans` `wold`):

| Field | Before | Now | Earth |
|---|---|---|---|
| religion | 58% | 45% | 41% |
| society | 61% | 42% | 31% |
| the house | 1% | 37% | 37% |
| plants | 11% | 32% | 30% |
| farming | 3% | 31% | 30% |
| tools | 1% | 21% | 24% |
| speech | 1% | 19% | 22% |
| the body | 3% | 15% | 14% |
| all | 27% | 27% | about 24% |

This moves older words, which DJ allows ("you can redo the words ... as many times as you want"). The scripts stay as they are through the lock (`npm run scripts:lock`, `data/scripts-lock.json`). Every sign is kept by what it writes (a letter by its sound, a word-sign by its word), and only a new sound or word gets a new sign.

## Shifts, compounds and sayings (30 Oct 2026)

- **Meaning shifts into the new words** (`wider.js` `WIDER_SHIFTS`, `semantics.js` `planWiderShifts`): 42 attested Earth shifts. The feather becomes the pen (Latin penna), the camp the castle (castra), salt the wages (salarium), a noise a rumour (rumor). Each path has its own stream, at about one chance in eleven per thousand years. The older word keeps its first sense as a second sense of the same word, and the wider word it lands on retires. A living language now has 32 to 50 second senses, from 4 to 8 at the start.
- **Compounds of a language's own words** (`lexicon/compounds.js`): 78 recipes, such as eye + hair for the eyebrow, horse + house for the stable, rain + time for the rainy season, and fire + dust for gunpowder. A family builds them as often as its type does: isolating 75%, polysynthetic 60%, agglutinative 55%, fusional 35%. A pair of parts makes only one word.
- **Sayings** (`lexicon/idioms.js`, the panel's Sayings section): character and feeling told through the body, in 29 meanings. Each family seats feeling in the heart, liver, belly or head, and keeps one attested picture per meaning; a language now and then takes another (one in five). The brave are big- or strong-hearted, the liar has two tongues or a crooked one, the dead close their eyes or lose their breath (Kövecses 2000; Sharifian et al. 2008). Each saying is the language's own words, in its own adjective and verb order.
- **The tens built of the language's own numbers** (`compounds.js composeTens`): thirty is "three ten", as Chinese sānshí and Old English thrītig. About one family in five counts by twenties (WALS 131A: 42 of 196 languages vigesimal or mixed), chosen by a hash of its seed: twenty is its own word, forty "two twenty", fifty "two twenty ten", as French quatre-vingts and Welsh deugain. Nine of the 30 families count by twenties, Arten (the Mesoamerican-like line) among them, as Maya and Nahuatl do.
- **Cousins called brothers and sisters** (`WIDER_COLEX` `brother-cousin`, with `older: true` for a pair of older words): the Hawaiian kin terms of about a third of the world's societies (Murdock's Ethnographic Atlas).

## The modern world's words (30 Oct 2026)

1765 AFA is Earth's 2015, so a language needs the modern world's words. `lexicon/modern.js` had 28, from the newspaper to the mobile phone. It now has 87, adding football (team, goal, match, player, referee, league, stadium, coach, captain, fan, trophy, champion, world cup), politics (president, election, political party, republic, constitution, minister, embassy, passport), money (bank, company, banknote, insurance), science and machines (engine, machine, battery, motor, submarine, rocket, robot, camera, telescope, microscope, atom, science, university, museum, library), media (magazine, advertisement, email, website, video) and daily life (supermarket, hotel, restaurant, airport, motorway, bus, clock, glasses, hospital, doctor). Each one is dated as on Earth less 250 years. Each language calques it from its own words (German Fernsehen "far-seeing"), gives an old word the sense (German Tor "gate" for a goal), or borrows it from Lastnu (`npm run lastnu` builds Lastnu's words). The translator reads them by their plain word ("goal"), and reads "score" as "make", as Spanish meter un gol "put a goal".
