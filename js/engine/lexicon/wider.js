/**
 * The wider vocabulary (DJ, 30 Oct 2026: "the level of complexity of like
 * how many words are actually being used and what they mean and the how big
 * is the dictionary"). The concept list (swadesh.js) gave each language some
 * 760 roots and, with derivation, about 1,450 meanings: the size of High
 * Valyrian, half of Dothraki, and a fraction of a living language. These are
 * the next 640 or so: the everyday words of a farming, trading, writing
 * world (the parts of the body a doctor names, the beasts and plants of the
 * field and the wild, the tools of the house and the workshop, the offices
 * of a state, the words of a faith and of a war, the finer words of thought
 * and speech), each with its part of speech and its domain.
 *
 * They come after every other concept (swadesh.js conceptList, tier 4) and
 * each draws from a stream of its own (roots.js streamFor; derivation.js
 * `fresh`), so adding them changes no word a language already had. A
 * family's `lexiconSize` (data/lang-config.json) says how far down the list
 * it reaches.
 *
 * Each entry is [gloss, part of speech, semantic domain].
 */

export const WIDER = [
    // body
    ['eyebrow', 'n', 'body'], ['eyelash', 'n', 'body'], ['eyelid', 'n', 'body'], ['nostril', 'n', 'body'], ['jaw', 'n', 'body'], ['gum (mouth)', 'n', 'body'],
    ['beard', 'n', 'body'], ['moustache', 'n', 'body'], ['wrist', 'n', 'body'], ['ankle', 'n', 'body'], ['hip', 'n', 'body'], ['waist', 'n', 'body'],
    ['navel', 'n', 'body'], ['thigh', 'n', 'body'], ['calf (leg)', 'n', 'body'], ['sole (of foot)', 'n', 'body'], ['palm (of hand)', 'n', 'body'], ['knuckle', 'n', 'body'],
    ['joint', 'n', 'body'], ['muscle', 'n', 'body'], ['nerve', 'n', 'body'], ['stomach', 'n', 'body'], ['bladder', 'n', 'body'], ['womb', 'n', 'body'],
    ['spine', 'n', 'body'], ['chest', 'n', 'body'], ['armpit', 'n', 'body'], ['nipple', 'n', 'body'], ['pus', 'n', 'body'], ['phlegm', 'n', 'body'],
    ['urine', 'n', 'body'], ['dung', 'n', 'body'], ['saliva', 'n', 'body'], ['blister', 'n', 'body'], ['bruise', 'n', 'body'], ['fever', 'n', 'body'],
    ['cough', 'v', 'body'], ['itch', 'v', 'body'], ['sneeze', 'v', 'body'], ['yawn', 'v', 'body'], ['limb', 'n', 'body'], ['flesh', 'n', 'body'],
    ['bleed', 'v', 'body'], ['heal', 'v', 'body'], ['plague', 'n', 'body'], ['pregnant', 'adj', 'body'],
    // animal: Earth's names as stand-ins for Andah's own beasts (DJ, 30 Oct 2026: "Earth stand-ins" for the wild ones, until he names
    // them); its tamed ones are his own, on his domestication map (lexicon/species.js)
    ['lion', 'n', 'animal'], ['tiger', 'n', 'animal'], ['elephant', 'n', 'animal'], ['camel', 'n', 'animal'], ['donkey', 'n', 'animal'], ['mule', 'n', 'animal'],
    ['calf (animal)', 'n', 'animal'], ['lamb', 'n', 'animal'], ['foal', 'n', 'animal'], ['puppy', 'n', 'animal'], ['cub', 'n', 'animal'], ['rat', 'n', 'animal'],
    ['bat (animal)', 'n', 'animal'], ['owl', 'n', 'animal'], ['hawk', 'n', 'animal'], ['dove', 'n', 'animal'], ['swan', 'n', 'animal'], ['parrot', 'n', 'animal'],
    ['sparrow', 'n', 'animal'], ['turtle', 'n', 'animal'], ['lizard', 'n', 'animal'], ['crocodile', 'n', 'animal'], ['whale', 'n', 'animal'], ['dolphin', 'n', 'animal'],
    ['shark', 'n', 'animal'], ['eel', 'n', 'animal'], ['oyster', 'n', 'animal'], ['octopus', 'n', 'animal'], ['beetle', 'n', 'animal'], ['butterfly', 'n', 'animal'],
    ['moth', 'n', 'animal'], ['mosquito', 'n', 'animal'], ['flea', 'n', 'animal'], ['wasp', 'n', 'animal'], ['scorpion', 'n', 'animal'], ['leech', 'n', 'animal'],
    ['snail', 'n', 'animal'], ['toad', 'n', 'animal'], ['boar', 'n', 'animal'], ['buffalo', 'n', 'animal'], ['monkey', 'n', 'animal'], ['squirrel', 'n', 'animal'],
    ['otter', 'n', 'animal'], ['seal (animal)', 'n', 'animal'], ['vulture', 'n', 'animal'], ['heron', 'n', 'animal'], ['locust', 'n', 'animal'], ['termite', 'n', 'animal'],
    ['mare', 'n', 'animal'], ['stallion', 'n', 'animal'], ['ram', 'n', 'animal'], ['hen', 'n', 'animal'], ['cock', 'n', 'animal'], ['prey', 'n', 'animal'],
    ['herd (animals)', 'n', 'animal'], ['flock', 'n', 'animal'], ['den', 'n', 'animal'], ['scale (fish)', 'n', 'animal'], ['fin', 'n', 'animal'], ['beak', 'n', 'animal'],
    ['hoof', 'n', 'animal'], ['paw', 'n', 'animal'],
    // plant: Earth's names as stand-ins for Andah's own (as the animals)
    ['oak', 'n', 'plant'], ['pine', 'n', 'plant'], ['palm (tree)', 'n', 'plant'], ['willow', 'n', 'plant'], ['birch', 'n', 'plant'], ['cedar', 'n', 'plant'],
    ['bamboo', 'n', 'plant'], ['cotton', 'n', 'plant'], ['flax', 'n', 'plant'], ['hemp', 'n', 'plant'], ['olive', 'n', 'plant'], ['grape', 'n', 'plant'],
    ['apple', 'n', 'plant'], ['pear', 'n', 'plant'], ['fig', 'n', 'plant'], ['date (fruit)', 'n', 'plant'], ['onion', 'n', 'plant'], ['garlic', 'n', 'plant'],
    ['pepper', 'n', 'plant'], ['cabbage', 'n', 'plant'], ['pea', 'n', 'plant'], ['lentil', 'n', 'plant'], ['millet', 'n', 'plant'], ['maize', 'n', 'plant'],
    ['oats', 'n', 'plant'], ['rye', 'n', 'plant'], ['herb', 'n', 'plant'], ['weed', 'n', 'plant'], ['bush', 'n', 'plant'], ['hay', 'n', 'plant'],
    ['straw', 'n', 'plant'], ['sap', 'n', 'plant'], ['resin', 'n', 'plant'], ['pollen', 'n', 'plant'], ['blossom', 'n', 'plant'], ['sprout', 'n', 'plant'],
    ['stem', 'n', 'plant'], ['husk', 'n', 'plant'], ['kernel', 'n', 'plant'], ['gourd', 'n', 'plant'], ['melon', 'n', 'plant'], ['wilt', 'v', 'plant'],
    ['bloom', 'v', 'plant'], ['rot', 'v', 'plant'], ['timber', 'n', 'plant'], ['firewood', 'n', 'plant'], ['jungle', 'n', 'plant'], ['grove', 'n', 'plant'],
    ['tuber', 'n', 'plant'],
    // food
    ['flour', 'n', 'food'], ['dough', 'n', 'food'], ['butter', 'n', 'food'], ['cream', 'n', 'food'], ['sugar', 'n', 'food'], ['vinegar', 'n', 'food'],
    ['spice', 'n', 'food'], ['porridge', 'n', 'food'], ['stew', 'n', 'food'], ['broth', 'n', 'food'], ['sausage', 'n', 'food'], ['cake', 'n', 'food'],
    ['tea', 'n', 'food'], ['juice', 'n', 'food'], ['liquor', 'n', 'food'], ['feast', 'n', 'food'], ['breakfast', 'n', 'food'], ['supper', 'n', 'food'],
    ['taste', 'n', 'food'], ['slice', 'n', 'food'], ['crumb', 'n', 'food'], ['knead', 'v', 'food'], ['fry', 'v', 'food'], ['ferment', 'v', 'food'],
    ['sip', 'v', 'food'], ['chew', 'v', 'food'], ['swallow', 'v', 'food'], ['lick', 'v', 'food'], ['starve', 'v', 'food'], ['fast (abstain)', 'v', 'food'],
    ['hungry', 'adj', 'food'], ['thirsty', 'adj', 'food'], ['sweets', 'n', 'food'], ['dried meat', 'n', 'food'],
    // tool
    ['saw', 'n', 'tool'], ['chisel', 'n', 'tool'], ['drill', 'n', 'tool'], ['nail (metal)', 'n', 'tool'], ['pin', 'n', 'tool'], ['comb', 'n', 'tool'],
    ['mirror', 'n', 'tool'], ['key', 'n', 'tool'], ['lock', 'n', 'tool'], ['chain', 'n', 'tool'], ['spoon', 'n', 'tool'], ['fork', 'n', 'tool'],
    ['plate', 'n', 'tool'], ['bowl', 'n', 'tool'], ['jar', 'n', 'tool'], ['barrel', 'n', 'tool'], ['bucket', 'n', 'tool'], ['broom', 'n', 'tool'],
    ['brush', 'n', 'tool'], ['lamp', 'n', 'tool'], ['candle', 'n', 'tool'], ['torch', 'n', 'tool'], ['anvil', 'n', 'tool'], ['tongs', 'n', 'tool'],
    ['spade', 'n', 'tool'], ['hoe', 'n', 'tool'], ['sickle', 'n', 'tool'], ['scythe', 'n', 'tool'], ['sieve', 'n', 'tool'], ['loom', 'n', 'tool'],
    ['spindle', 'n', 'tool'], ['scales (weighing)', 'n', 'tool'], ['whip', 'n', 'tool'], ['saddle', 'n', 'tool'], ['anchor', 'n', 'tool'], ['mast', 'n', 'tool'],
    ['raft', 'n', 'tool'], ['sledge', 'n', 'tool'], ['wagon', 'n', 'tool'], ['harness', 'n', 'tool'], ['tool', 'n', 'tool'], ['box', 'n', 'tool'],
    ['handle', 'n', 'tool'], ['blade', 'n', 'tool'], ['lid', 'n', 'tool'], ['trap', 'n', 'tool'],
    // dwelling
    ['tent', 'n', 'dwelling'], ['hut', 'n', 'dwelling'], ['palace', 'n', 'dwelling'], ['castle', 'n', 'dwelling'], ['fortress', 'n', 'dwelling'], ['tower', 'n', 'dwelling'],
    ['stair', 'n', 'dwelling'], ['gate', 'n', 'dwelling'], ['yard', 'n', 'dwelling'], ['courtyard', 'n', 'dwelling'], ['kitchen', 'n', 'dwelling'], ['storehouse', 'n', 'dwelling'],
    ['barn', 'n', 'dwelling'], ['stable', 'n', 'dwelling'], ['cellar', 'n', 'dwelling'], ['pillar', 'n', 'dwelling'], ['beam', 'n', 'dwelling'], ['brick', 'n', 'dwelling'],
    ['tile', 'n', 'dwelling'], ['chimney', 'n', 'dwelling'], ['threshold', 'n', 'dwelling'], ['shelter', 'n', 'dwelling'], ['camp', 'n', 'dwelling'], ['inn', 'n', 'dwelling'],
    ['harbour', 'n', 'dwelling'], ['square (town)', 'n', 'dwelling'], ['quarter (town)', 'n', 'dwelling'], ['ruin', 'n', 'dwelling'],
    // craft
    ['carpenter', 'n', 'craft'], ['mason', 'n', 'craft'], ['tailor', 'n', 'craft'], ['shoemaker', 'n', 'craft'], ['tanner', 'n', 'craft'], ['dye', 'n', 'craft'],
    ['paint', 'n', 'craft'], ['carve', 'v', 'craft'], ['weave', 'v', 'craft'], ['spin (thread)', 'v', 'craft'], ['forge', 'v', 'craft'], ['polish', 'v', 'craft'],
    ['bronze', 'n', 'craft'], ['tin', 'n', 'craft'], ['lead (metal)', 'n', 'craft'], ['steel', 'n', 'craft'], ['jewel', 'n', 'craft'], ['pearl', 'n', 'craft'],
    ['ring (jewellery)', 'n', 'craft'], ['necklace', 'n', 'craft'], ['statue', 'n', 'craft'], ['pottery', 'n', 'craft'], ['silk', 'n', 'craft'], ['linen', 'n', 'craft'],
    ['needlework', 'n', 'craft'], ['workshop', 'n', 'craft'], ['craftsman', 'n', 'craft'], ['ink', 'n', 'craft'], ['pen', 'n', 'craft'], ['page', 'n', 'craft'],
    ['scroll', 'n', 'craft'], ['map', 'n', 'craft'], ['seal (stamp)', 'n', 'craft'],
    // agriculture
    ['orchard', 'n', 'agriculture'], ['vineyard', 'n', 'agriculture'], ['pasture', 'n', 'agriculture'], ['meadow', 'n', 'agriculture'], ['furrow', 'n', 'agriculture'], ['irrigate', 'v', 'agriculture'],
    ['ditch', 'n', 'agriculture'], ['dam', 'n', 'agriculture'], ['manure', 'n', 'agriculture'], ['yoke', 'n', 'agriculture'], ['thresh', 'v', 'agriculture'], ['winnow', 'v', 'agriculture'],
    ['graze', 'v', 'agriculture'], ['milk (v)', 'v', 'agriculture'], ['shear', 'v', 'agriculture'], ['breed', 'v', 'agriculture'], ['plant (v)', 'v', 'agriculture'], ['water (v)', 'v', 'agriculture'],
    ['granary', 'n', 'agriculture'], ['crop', 'n', 'agriculture'], ['drought', 'n', 'agriculture'], ['famine', 'n', 'agriculture'], ['fallow', 'adj', 'agriculture'], ['livestock', 'n', 'agriculture'],
    ['fodder', 'n', 'agriculture'], ['terrace (field)', 'n', 'agriculture'],
    // nature
    ['ocean', 'n', 'nature'], ['bay', 'n', 'nature'], ['strait', 'n', 'nature'], ['peninsula', 'n', 'nature'], ['delta', 'n', 'nature'], ['waterfall', 'n', 'nature'],
    ['rapids', 'n', 'nature'], ['pond', 'n', 'nature'], ['mud', 'n', 'nature'], ['rock', 'n', 'nature'], ['pebble', 'n', 'nature'], ['boulder', 'n', 'nature'],
    ['gravel', 'n', 'nature'], ['soil', 'n', 'nature'], ['peak', 'n', 'nature'], ['ridge', 'n', 'nature'], ['slope', 'n', 'nature'], ['pass (mountain)', 'n', 'nature'],
    ['gorge', 'n', 'nature'], ['volcano', 'n', 'nature'], ['earthquake', 'n', 'nature'], ['tide', 'n', 'nature'], ['current (water)', 'n', 'nature'], ['foam', 'n', 'nature'],
    ['beach', 'n', 'nature'], ['shore', 'n', 'nature'], ['horizon', 'n', 'nature'], ['eclipse', 'n', 'nature'], ['comet', 'n', 'nature'], ['spark', 'n', 'nature'],
    ['flame', 'n', 'nature'], ['coal', 'n', 'nature'], ['marsh', 'n', 'nature'], ['oasis', 'n', 'nature'], ['glacier', 'n', 'nature'], ['reef', 'n', 'nature'],
    // weather
    ['breeze', 'n', 'weather'], ['gale', 'n', 'weather'], ['drizzle', 'n', 'weather'], ['rainbow', 'n', 'weather'], ['sunshine', 'n', 'weather'], ['shade', 'n', 'weather'],
    ['mist', 'n', 'weather'], ['weather', 'n', 'weather'], ['climate', 'n', 'weather'], ['rainy season', 'n', 'weather'], ['dry season', 'n', 'weather'], ['blizzard', 'n', 'weather'],
    ['thaw', 'v', 'weather'], ['clear (sky)', 'adj', 'weather'], ['cloudy', 'adj', 'weather'], ['humid', 'adj', 'weather'],
    // time
    ['century', 'n', 'time'], ['decade', 'n', 'time'], ['generation', 'n', 'time'], ['age (era)', 'n', 'time'], ['moment', 'n', 'time'], ['past', 'n', 'time'],
    ['future', 'n', 'time'], ['festival', 'n', 'time'], ['holiday', 'n', 'time'], ['calendar', 'n', 'time'], ['while', 'n', 'time'], ['later', 'adv', 'time'],
    ['recently', 'adv', 'time'], ['sometimes', 'adv', 'time'], ['seldom', 'adv', 'time'], ['forever', 'adv', 'time'], ['ancient', 'adj', 'time'], ['modern', 'adj', 'time'],
    ['last year', 'adv', 'time'], ['next year', 'adv', 'time'],
    // quantity
    ['twenty', 'num', 'quantity'], ['thirty', 'num', 'quantity'], ['forty', 'num', 'quantity'], ['fifty', 'num', 'quantity'], ['sixty', 'num', 'quantity'], ['seventy', 'num', 'quantity'],
    ['eighty', 'num', 'quantity'], ['ninety', 'num', 'quantity'], ['pair', 'n', 'quantity'], ['dozen', 'n', 'quantity'], ['third (fraction)', 'n', 'quantity'], ['quarter (fraction)', 'n', 'quantity'],
    ['double', 'adj', 'quantity'], ['most', 'quant', 'quantity'], ['several', 'quant', 'quantity'], ['amount', 'n', 'quantity'], ['measure', 'n', 'quantity'], ['weight', 'n', 'quantity'],
    // quality
    ['rough', 'adj', 'quality'], ['sticky', 'adj', 'quality'], ['tight', 'adj', 'quality'], ['loose', 'adj', 'quality'], ['steep', 'adj', 'quality'], ['flat', 'adj', 'quality'],
    ['hollow', 'adj', 'quality'], ['solid', 'adj', 'quality'], ['crooked', 'adj', 'quality'], ['broken', 'adj', 'quality'], ['fresh', 'adj', 'quality'], ['stale', 'adj', 'quality'],
    ['cheap', 'adj', 'quality'], ['expensive', 'adj', 'quality'], ['rare', 'adj', 'quality'], ['common', 'adj', 'quality'], ['strange', 'adj', 'quality'], ['famous', 'adj', 'quality'],
    ['honest', 'adj', 'quality'], ['cruel', 'adj', 'quality'], ['gentle', 'adj', 'quality'], ['lazy', 'adj', 'quality'], ['diligent', 'adj', 'quality'], ['generous', 'adj', 'quality'],
    ['greedy', 'adj', 'quality'], ['clever', 'adj', 'quality'], ['stupid', 'adj', 'quality'], ['calm', 'adj', 'quality'], ['wild', 'adj', 'quality'], ['tame', 'adj', 'quality'],
    ['secret', 'adj', 'quality'], ['naked', 'adj', 'quality'], ['blind', 'adj', 'quality'], ['deaf', 'adj', 'quality'], ['mute', 'adj', 'quality'], ['lame', 'adj', 'quality'],
    ['alive', 'adj', 'quality'], ['dead', 'adj', 'quality'], ['empty-handed', 'adj', 'quality'], ['busy', 'adj', 'quality'], ['useful', 'adj', 'quality'], ['useless', 'adj', 'quality'],
    ['noble (adj)', 'adj', 'quality'], ['humble', 'adj', 'quality'], ['fierce', 'adj', 'quality'], ['shy', 'adj', 'quality'], ['fat (adj)', 'adj', 'quality'], ['thin (body)', 'adj', 'quality'],
    // colour
    ['purple', 'adj', 'colour'], ['pink', 'adj', 'colour'], ['orange (colour)', 'adj', 'colour'], ['pale', 'adj', 'colour'], ['shiny', 'adj', 'colour'], ['spotted', 'adj', 'colour'],
    // action
    ['fold', 'v', 'action'], ['bend', 'v', 'action'], ['twist', 'v', 'action'], ['pour', 'v', 'action'], ['spill', 'v', 'action'], ['drip', 'v', 'action'],
    ['sweep', 'v', 'action'], ['scrub', 'v', 'action'], ['peel', 'v', 'action'], ['stir', 'v', 'action'], ['mix', 'v', 'action'], ['shake', 'v', 'action'],
    ['knock', 'v', 'action'], ['kick', 'v', 'action'], ['slap', 'v', 'action'], ['pinch', 'v', 'action'], ['grab', 'v', 'action'], ['catch', 'v', 'action'],
    ['drop', 'v', 'action'], ['lift', 'v', 'action'], ['hang', 'v', 'action'], ['lean', 'v', 'action'], ['press', 'v', 'action'], ['tear (rip)', 'v', 'action'],
    ['crush', 'v', 'action'], ['scatter', 'v', 'action'], ['gather', 'v', 'action'], ['collect', 'v', 'action'], ['pile', 'v', 'action'], ['wrap', 'v', 'action'],
    ['untie', 'v', 'action'], ['bury', 'v', 'action'], ['kindle', 'v', 'action'], ['extinguish', 'v', 'action'], ['destroy', 'v', 'action'], ['repair', 'v', 'action'],
    ['measure (v)', 'v', 'action'], ['weigh', 'v', 'action'], ['divide', 'v', 'action'], ['share', 'v', 'action'], ['borrow', 'v', 'action'], ['lend', 'v', 'action'],
    ['exchange', 'v', 'action'], ['hire', 'v', 'action'], ['punish', 'v', 'action'], ['forgive', 'v', 'action'], ['reward', 'v', 'action'], ['betray', 'v', 'action'],
    ['defend', 'v', 'action'], ['attack', 'v', 'action'], ['conquer', 'v', 'action'], ['surrender', 'v', 'action'], ['escape', 'v', 'action'], ['imprison', 'v', 'action'],
    ['release', 'v', 'action'], ['kneel', 'v', 'action'], ['bow (bend)', 'v', 'action'], ['embrace', 'v', 'action'], ['kiss', 'v', 'action'], ['prepare', 'v', 'action'],
    ['protect', 'v', 'action'], ['save (rescue)', 'v', 'action'], ['own', 'v', 'action'], ['belong', 'v', 'action'], ['allow', 'v', 'action'], ['forbid', 'v', 'action'],
    // motion
    ['wander', 'v', 'motion'], ['sail (v)', 'v', 'motion'], ['row (boat)', 'v', 'motion'], ['ride', 'v', 'motion'], ['drive (animals)', 'v', 'motion'], ['march', 'v', 'motion'],
    ['sink', 'v', 'motion'], ['drown', 'v', 'motion'], ['slip', 'v', 'motion'], ['roll', 'v', 'motion'], ['slide', 'v', 'motion'], ['hurry', 'v', 'motion'],
    ['approach', 'v', 'motion'], ['pass (by)', 'v', 'motion'], ['wade', 'v', 'motion'], ['dive', 'v', 'motion'], ['journey', 'n', 'motion'], ['step', 'n', 'motion'],
    // cognition
    ['doubt', 'v', 'cognition'], ['guess', 'v', 'cognition'], ['decide', 'v', 'cognition'], ['plan', 'v', 'cognition'], ['imagine', 'v', 'cognition'], ['wonder', 'v', 'cognition'],
    ['recognise', 'v', 'cognition'], ['notice', 'v', 'cognition'], ['ignore', 'v', 'cognition'], ['worry', 'v', 'cognition'], ['regret', 'v', 'cognition'], ['trust', 'v', 'cognition'],
    ['respect', 'v', 'cognition'], ['envy', 'n', 'cognition'], ['pity', 'n', 'cognition'], ['mercy', 'n', 'cognition'], ['wisdom', 'n', 'cognition'], ['knowledge', 'n', 'cognition'],
    ['reason', 'n', 'cognition'], ['opinion', 'n', 'cognition'], ['secret (n)', 'n', 'cognition'], ['mystery', 'n', 'cognition'], ['memory', 'n', 'cognition'], ['attention', 'n', 'cognition'],
    ['courage', 'n', 'cognition'], ['patience', 'n', 'cognition'], ['luck', 'n', 'cognition'], ['danger', 'n', 'cognition'], ['purpose', 'n', 'cognition'], ['habit', 'n', 'cognition'],
    // speech
    ['complain', 'v', 'speech'], ['argue', 'v', 'speech'], ['agree', 'v', 'speech'], ['refuse', 'v', 'speech'], ['deny', 'v', 'speech'], ['admit', 'v', 'speech'],
    ['warn', 'v', 'speech'], ['advise', 'v', 'speech'], ['command', 'v', 'speech'], ['invite', 'v', 'speech'], ['greet', 'v', 'speech'], ['joke', 'n', 'speech'],
    ['riddle', 'n', 'speech'], ['proverb', 'n', 'speech'], ['poem', 'n', 'speech'], ['poet', 'n', 'speech'], ['speech', 'n', 'speech'], ['gesture', 'n', 'speech'],
    ['rumour', 'n', 'speech'], ['insult', 'n', 'speech'], ['blame', 'v', 'speech'], ['apologise', 'v', 'speech'], ['explain', 'v', 'speech'], ['describe', 'v', 'speech'],
    ['announce', 'v', 'speech'], ['translate', 'v', 'speech'], ['sign (symbol)', 'n', 'speech'], ['letter (of alphabet)', 'n', 'speech'],
    // society
    ['citizen', 'n', 'society'], ['noble (n)', 'n', 'society'], ['peasant', 'n', 'society'], ['beggar', 'n', 'society'], ['prisoner', 'n', 'society'], ['prison', 'n', 'society'],
    ['ally', 'n', 'society'], ['rival', 'n', 'society'], ['envoy', 'n', 'society'], ['tax', 'n', 'society'], ['tribute', 'n', 'society'], ['treaty', 'n', 'society'],
    ['council', 'n', 'society'], ['assembly', 'n', 'society'], ['court (law)', 'n', 'society'], ['crime', 'n', 'society'], ['punishment', 'n', 'society'], ['wealth', 'n', 'society'],
    ['poverty', 'n', 'society'], ['inheritance', 'n', 'society'], ['wedding', 'n', 'society'], ['funeral', 'n', 'society'], ['ceremony', 'n', 'society'], ['host', 'n', 'society'],
    ['household', 'n', 'society'], ['capital (city)', 'n', 'society'], ['province', 'n', 'society'], ['empire', 'n', 'society'], ['kingdom', 'n', 'society'], ['guard (n)', 'n', 'society'],
    ['official', 'n', 'society'], ['emperor', 'n', 'society'], ['prince', 'n', 'society'], ['princess', 'n', 'society'], ['nation', 'n', 'society'], ['colony', 'n', 'society'],
    ['rebel', 'n', 'society'], ['rebellion', 'n', 'society'], ['exile', 'n', 'society'], ['vote', 'v', 'society'], ['freedom', 'n', 'society'], ['duty', 'n', 'society'],
    // kinship
    ['grandchild', 'n', 'kinship'], ['stepmother', 'n', 'kinship'], ['stepfather', 'n', 'kinship'], ['parent-in-law', 'n', 'kinship'], ['brother-in-law', 'n', 'kinship'], ['sister-in-law', 'n', 'kinship'],
    ['twin', 'n', 'kinship'], ['firstborn', 'n', 'kinship'], ['heir', 'n', 'kinship'], ['bride', 'n', 'kinship'], ['bridegroom', 'n', 'kinship'], ['relative', 'n', 'kinship'],
    ['divorce', 'v', 'kinship'], ['adopt', 'v', 'kinship'], ['widower', 'n', 'kinship'], ['parents', 'n', 'kinship'], ['offspring', 'n', 'kinship'], ['lineage', 'n', 'kinship'],
    // trade
    ['coin', 'n', 'trade'], ['wages', 'n', 'trade'], ['profit', 'n', 'trade'], ['loss', 'n', 'trade'], ['loan', 'n', 'trade'], ['shop', 'n', 'trade'],
    ['goods', 'n', 'trade'], ['cargo', 'n', 'trade'], ['bargain', 'v', 'trade'], ['cost', 'v', 'trade'], ['customer', 'n', 'trade'], ['rent', 'n', 'trade'],
    ['contract', 'n', 'trade'], ['owe', 'v', 'trade'], ['earn', 'v', 'trade'], ['spend', 'v', 'trade'], ['save (money)', 'v', 'trade'], ['waste', 'v', 'trade'],
    ['barter', 'v', 'trade'], ['caravan', 'n', 'trade'], ['port', 'n', 'trade'], ['warehouse', 'n', 'trade'], ['treasure', 'n', 'trade'], ['ransom', 'n', 'trade'],
    // religion
    ['pray', 'v', 'religion'], ['prayer', 'n', 'religion'], ['worship', 'v', 'religion'], ['faith', 'n', 'religion'], ['heaven', 'n', 'religion'], ['hell', 'n', 'religion'],
    ['demon', 'n', 'religion'], ['ghost', 'n', 'religion'], ['shrine', 'n', 'religion'], ['altar', 'n', 'religion'], ['idol', 'n', 'religion'], ['pilgrim', 'n', 'religion'],
    ['pilgrimage', 'n', 'religion'], ['saint', 'n', 'religion'], ['monk', 'n', 'religion'], ['prophet', 'n', 'religion'], ['ritual', 'n', 'religion'], ['offering', 'n', 'religion'],
    ['scripture', 'n', 'religion'], ['sin', 'n', 'religion'], ['virtue', 'n', 'religion'], ['oracle', 'n', 'religion'], ['witch', 'n', 'religion'], ['charm (amulet)', 'n', 'religion'],
    ['afterlife', 'n', 'religion'], ['heretic', 'n', 'religion'], ['convert', 'v', 'religion'], ['bless', 'v', 'religion'],
    // war
    ['battle', 'n', 'war'], ['siege', 'n', 'war'], ['helmet', 'n', 'war'], ['banner', 'n', 'war'], ['horseman', 'n', 'war'], ['raid', 'n', 'war'],
    ['ambush', 'n', 'war'], ['victory', 'n', 'war'], ['defeat', 'n', 'war'], ['general (n)', 'n', 'war'], ['troop', 'n', 'war'], ['fleet', 'n', 'war'],
    ['sling', 'n', 'war'], ['dagger', 'n', 'war'], ['club (weapon)', 'n', 'war'], ['scout', 'n', 'war'], ['spy', 'n', 'war'], ['retreat', 'v', 'war'],
    ['flag', 'n', 'war'], ['camp (army)', 'n', 'war'], ['wall (city)', 'n', 'war'], ['cannon', 'n', 'war'], ['gun', 'n', 'war'], ['gunpowder', 'n', 'war'],
    // perception
    ['look', 'v', 'perception'], ['watch', 'v', 'perception'], ['listen', 'v', 'perception'], ['touch', 'v', 'perception'], ['taste (v)', 'v', 'perception'], ['stare', 'v', 'perception'],
    ['sound', 'n', 'perception'], ['noise', 'n', 'perception'], ['silence', 'n', 'perception'], ['scent', 'n', 'perception'], ['flavour', 'n', 'perception'], ['glimpse', 'n', 'perception'],
    // space
    ['north', 'n', 'space'], ['south', 'n', 'space'], ['east', 'n', 'space'], ['west', 'n', 'space'], ['front', 'n', 'space'], ['surface', 'n', 'space'],
    ['distance', 'n', 'space'], ['direction', 'n', 'space'], ['region', 'n', 'space'], ['crossroads', 'n', 'space'], ['way (route)', 'n', 'space'], ['far side', 'n', 'space'],
    ['upstream', 'adv', 'space'], ['downstream', 'adv', 'space'], ['ahead', 'adv', 'space'], ['back (adv)', 'adv', 'space'],
];

/**
 * One word for two meanings, where one of them is a wider word (DJ, 30 Oct
 * 2026, the deeper dictionaries: "polysemy, CLICS-style"). The commonest
 * colexifications in the Database of Cross-Linguistic Colexifications
 * (CLICS) that the older list could not show: fire and flame, sky and
 * heaven, meat and flesh. Read as lexicon/colexify.js reads its pairs: `a`
 * the older meaning whose word spreads, `b` the wider meaning that takes it
 * or gets a word of its own (`partners` the compound's first part), `p`
 * roughly the share of the world's languages with one word for both. The
 * shares are rounded estimates from CLICS's spread of each pair, not counts.
 * Each pair draws from a stream of its own, so adding one moves no other.
 */
export const WIDER_COLEX = [
    // older pairs too (`older`: B need not be a wider word): cousins called brothers and sisters, the Hawaiian kin terms of about a
    // third of the world's societies (Murdock's Ethnographic Atlas), as in Hawaiian, Yoruba and much of Polynesia
    { key: 'brother-cousin', a: 'brother', b: 'cousin', p: 0.33, older: true, partners: ['other', 'far'], attested: 'Hawaiian, Yoruba and much of Polynesia call cousins brothers and sisters (the Hawaiian kin terms)' },
    { key: 'fire-flame', a: 'fire', b: 'flame', p: 0.45, partners: ['tongue', 'red'], attested: 'Japanese hi and many languages of Africa and the Americas name the fire and its flame with one word' },
    { key: 'sky-heaven', a: 'sky', b: 'heaven', p: 0.55, partners: ['god', 'high'], attested: 'German Himmel, French ciel and Russian nebo are the sky and heaven both; English split them' },
    { key: 'meat-flesh', a: 'meat', b: 'flesh', p: 0.55, partners: ['body', 'skin'], attested: 'German Fleisch and Spanish carne are meat and living flesh alike' },
    { key: 'earth-soil', a: 'earth', b: 'soil', p: 0.5, partners: ['black', 'field'], attested: 'Spanish tierra and German Erde are the earth and the soil in it' },
    { key: 'stone-rock', a: 'stone', b: 'rock', p: 0.5, partners: ['big', 'mountain'], attested: 'German Stein and Russian kamen’ serve for a pebble and a crag alike' },
    { key: 'see-look', a: 'see', b: 'look', p: 0.3, partners: [], attested: 'Japanese miru is to see and to look; English keeps them apart' },
    { key: 'look-watch', a: 'look', b: 'watch', p: 0.4, partners: [], attested: 'Spanish mirar is to look and to watch' },
    { key: 'hear-listen', a: 'hear', b: 'listen', p: 0.35, partners: [], attested: 'Japanese kiku is to hear and to listen (and to ask)' },
    { key: 'borrow-lend', a: 'borrow', b: 'lend', p: 0.4, partners: [], attested: 'German leihen and Russian odolzhit’ serve for borrowing and lending' },
    { key: 'fog-mist', a: 'fog', b: 'mist', p: 0.55, partners: ['thin', 'morning'], attested: 'German Nebel is fog and mist alike' },
    { key: 'word-speech', a: 'word', b: 'speech', p: 0.3, partners: ['many', 'long'], attested: 'Greek logos is the word and the speech made of words' },
    { key: 'spirit-ghost', a: 'spirit', b: 'ghost', p: 0.35, partners: ['dead', 'night'], attested: 'German Geist is the spirit and the ghost' },
    { key: 'shadow-ghost', a: 'shadow', b: 'ghost', p: 0.12, partners: ['dead', 'night'], attested: 'Homer’s dead are skiai, "shadows"; many languages call a ghost the shadow of the dead' },
    { key: 'old-ancient', a: 'old', b: 'ancient', p: 0.45, partners: [], attested: 'Japanese furui and Russian staryi serve for old and ancient' },
    { key: 'know-recognise', a: 'know', b: 'recognise', p: 0.3, partners: [], attested: 'Old English cnāwan was to know and to recognise' },
    { key: 'belly-stomach', a: 'belly', b: 'stomach', p: 0.45, partners: ['food', 'inside'], attested: 'Russian zhivot and Japanese onaka are the belly and the stomach in everyday speech' },
    { key: 'sea-ocean', a: 'sea', b: 'ocean', p: 0.5, partners: ['big', 'great'], attested: 'Japanese umi is the sea and the ocean' },
    { key: 'war-battle', a: 'war', b: 'battle', p: 0.25, partners: ['one', 'day'], attested: 'Mandarin zhàn is war and battle; Old English hild was both' },
    { key: 'door-gate', a: 'door', b: 'gate', p: 0.4, partners: ['big', 'town'], attested: 'Spanish puerta is a door and a gate' },
    { key: 'needle-pin', a: 'needle', b: 'pin', p: 0.35, partners: ['small', 'head'], attested: 'Japanese hari is a needle and a pin' },
    { key: 'money-coin', a: 'money', b: 'coin', p: 0.35, partners: ['round', 'metal'], attested: 'Spanish moneda is a coin and money; many words for money were the coin’s name' },
    { key: 'time-weather', a: 'time', b: 'weather', p: 0.15, partners: ['sky', 'day'], attested: 'Spanish tiempo and French temps are time and the weather' },
    { key: 'taste-flavour', a: 'taste', b: 'flavour', p: 0.55, partners: [], attested: 'Spanish sabor and German Geschmack are taste and flavour' },
    { key: 'sound-noise', a: 'sound', b: 'noise', p: 0.4, partners: ['bad', 'loud'], attested: 'Japanese oto is a sound and a noise' },
    { key: 'ask-pray', a: 'ask', b: 'pray', p: 0.3, partners: [], attested: 'Italian pregare is to pray and to beg; Old English biddan to ask and to pray' },
    { key: 'chicken-hen', a: 'chicken', b: 'hen', p: 0.5, partners: ['female', 'mother'], attested: 'Spanish gallina is the hen and the chicken as a kind' },
    { key: 'pig-boar', a: 'pig', b: 'boar', p: 0.3, partners: ['wild', 'forest'], attested: 'many languages call the boar the "wild pig" or simply the pig: Mandarin y\u011bzh\u016b, French sanglier from "solitary pig"' },
    { key: 'flower-blossom', a: 'flower', b: 'blossom', p: 0.6, partners: ['tree', 'spring'], attested: 'Spanish flor and Japanese hana are the flower and the blossom' },
    { key: 'tree-timber', a: 'tree', b: 'timber', p: 0.45, partners: ['dry', 'cut'], attested: 'Japanese ki and Russian drevo name the tree and its wood; tree and wood is among the commonest colexifications in CLICS' },
];

/**
 * Meaning shifts into the wider vocabulary (lexicon/semantics.js planWiderShifts): an older
 * word takes on a new meaning as on Earth, the feather becoming the pen,
 * the camp the castle, a noise a rumour. The older word keeps its first
 * sense where nothing else carries it (a second sense of the same word);
 * the wider word it lands on gives way. Each [from, to, type, the Earth
 * precedent].
 */
export const WIDER_SHIFTS = [
    ["feather", "pen", "metonymy", "Latin penna \"feather\" became the pen, cut from a quill; English pen from it"],
    ["salt", "wages", "metonymy", "Latin salarium, the soldier's salt money, gave English salary"],
    ["livestock", "wealth", "metonymy", "Latin pecunia \"money\" from pecus \"cattle\"; Old English feoh \"cattle\" gave English fee"],
    ["camp", "castle", "narrowing", "Latin castra \"camp\" gave castellum and English castle"],
    ["stranger", "pilgrim", "narrowing", "Latin peregrinus \"foreigner\" became the pilgrim"],
    ["spirit", "demon", "pejoration", "Greek daimon, a spirit or godling, became the demon"],
    ["spirit", "ghost", "narrowing", "Old English gast was any spirit before it was the dead's"],
    ["picture", "idol", "narrowing", "Greek eidolon \"image\" became the idol"],
    ["general (n)", "emperor", "amelioration", "Latin imperator, a victorious general, became the emperor"],
    ["assembly", "council", "narrowing", "Latin concilium \"a calling together\" became the council"],
    ["courtyard", "court (law)", "metonymy", "Latin cohors \"yard\" gave the court, the king's and then the judge's"],
    ["storehouse", "shop", "narrowing", "Old English sceoppa \"shed, booth\" gave English shop"],
    ["storehouse", "cellar", "narrowing", "Latin cellarium \"storeroom\" became the cellar"],
    ["flock", "troop", "metaphor", "French troupe from troupeau \"flock\""],
    ["flag", "banner", "narrowing", "Old French baniere, a flag that marked a lord's men"],
    ["reed", "cannon", "metaphor", "Latin canna \"reed, tube\" gave Italian cannone and English cannon"],
    ["tooth", "comb", "metaphor", "Sanskrit jambha \"tooth\" is cognate with Greek gomphos and Old English camb \"comb\""],
    ["clay", "brick", "metonymy", "the word for clay names the brick across the Near East (Akkadian libittu, Arabic tub)"],
    ["clay", "pottery", "metonymy", "Greek keramos \"potter's clay\" became ceramics"],
    ["seal (stamp)", "coin", "metonymy", "a coin is a stamped piece; Latin moneta, the mint, from the temple of Juno Moneta"],
    ["feast", "festival", "narrowing", "Latin festum \"feast\" gave festival and English feast both"],
    ["knowledge", "wisdom", "amelioration", "Greek sophia, skill in a craft, became wisdom"],
    ["heart", "courage", "metaphor", "Latin cor \"heart\" gave French courage and English courage"],
    ["pity", "mercy", "narrowing", "Latin pietas \"duty, devotion\" became pity, and misericordia mercy"],
    ["noise", "rumour", "metonymy", "Latin rumor \"a noise, a murmur\" became the rumour"],
    ["word", "proverb", "narrowing", "Latin proverbium from verbum \"word\"; Greek logos for a saying"],
    ["song", "poem", "narrowing", "Greek ode \"song\" became the ode; a poem was sung before it was written"],
    ["leaf", "page", "metaphor", "English leaf of a book; Latin folium \"leaf\" gave folio"],
    ["sign (symbol)", "letter (of alphabet)", "narrowing", "Greek gramma \"a mark\" became the letter"],
    ["cloth", "map", "metonymy", "Latin mappa \"napkin, cloth\" gave the map, drawn on cloth"],
    ["shelter", "harbour", "narrowing", "Old English herebeorg \"army shelter\" gave English harbour"],
    ["fire", "flame", "narrowing", "the word for fire names the flame in many languages (CLICS)"],
    ["hearth", "kitchen", "metonymy", "Latin focus \"hearth\" gave the place the food is cooked, and French feu \"fire\""],
    ["guard (n)", "prison", "metonymy", "the guard names the guardhouse and the gaol (Old French gaole, a cage)"],
    ["chief", "prince", "narrowing", "Latin princeps \"the first, the chief\" became the prince"],
    ["kingdom", "empire", "broadening", "Latin imperium \"command\" became the realm of an emperor"],
    ["gift", "tribute", "narrowing", "a gift to a lord becomes the tribute owed him (Latin tributum)"],
    ["price", "tax", "narrowing", "Latin taxare \"to assess, set the price\" gave English tax"],
    ["debt", "loan", "metonymy", "Old Norse lan, a lending, and the debt it makes"],
    ["dust", "gunpowder", "narrowing", "English powder, French poudre \"dust\", Latin pulvis"],
    ["roof", "tile", "metonymy", "Latin tegula \"tile\" from tegere \"to cover\", as the roof covers"],
    ["sky", "heaven", "metaphor", "the sky names heaven in most of the world's languages"],
];
