/**
 * The concept list the lexicon is built from.
 *
 * ## Why Swadesh first
 *
 * Morris Swadesh's list is not "the 207 commonest words". It is a deliberately
 * chosen set of concepts that are *culturally neutral and resistant to
 * borrowing*: body parts, low numerals, pronouns, basic natural phenomena,
 * elementary verbs. Languages replace words for "computer" and "king" freely,
 * but they very rarely borrow a word for "eye", "two" or "I".
 *
 * That resistance is what makes the list useful here, twice over:
 *
 *   1. It guarantees every daughter language can say the things a comparative
 *      table needs to compare. A cognate set is only interesting if the concept
 *      survives in every branch.
 *   2. It seeds the frequency curve correctly. These concepts sit at the top of
 *      any frequency count, and high frequency is what makes a word resist
 *      analogical levelling — which is why "be", "go" and "foot/feet" stay
 *      irregular in English while thousands of rarer words regularised.
 *
 * So the generator covers all 207 before it generates anything else.
 *
 * ## Beyond the core
 *
 * The remaining roots fill out semantic domains a world actually needs —
 * kinship, agriculture, weather, tools, trade, abstractions. These are the ones
 * that WILL drift, borrow and be replaced, which is exactly what makes them
 * interesting for semantic change later.
 *
 * Each entry is [gloss, part of speech, semantic domain].
 */

import { PATH_GLOSSES } from './semantics.js';

/** Parts of speech used across the engine. */
export const POS = {
    n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb',
    pron: 'pronoun', dem: 'demonstrative', num: 'numeral', quant: 'quantifier',
    interrog: 'interrogative', neg: 'negator', adp: 'adposition',
    conj: 'conjunction', part: 'particle',
};

/**
 * The Swadesh 207. Order is the traditional one, which matters: the first
 * hundred are the more stable "Swadesh 100" subset, so index doubles as a
 * rough stability ranking.
 */
export const SWADESH_207 = [
    ['I', 'pron', 'person'], ['you (sg)', 'pron', 'person'], ['he', 'pron', 'person'],
    ['we', 'pron', 'person'], ['you (pl)', 'pron', 'person'], ['they', 'pron', 'person'],
    ['this', 'dem', 'grammar'], ['that', 'dem', 'grammar'], ['here', 'adv', 'space'],
    ['there', 'adv', 'space'], ['who', 'interrog', 'grammar'], ['what', 'interrog', 'grammar'],
    ['where', 'interrog', 'space'], ['when', 'interrog', 'time'], ['how', 'interrog', 'grammar'],
    ['not', 'neg', 'grammar'], ['all', 'quant', 'quantity'], ['many', 'quant', 'quantity'],
    ['some', 'quant', 'quantity'], ['few', 'quant', 'quantity'], ['other', 'adj', 'quantity'],
    ['one', 'num', 'quantity'], ['two', 'num', 'quantity'], ['three', 'num', 'quantity'],
    ['four', 'num', 'quantity'], ['five', 'num', 'quantity'],
    ['big', 'adj', 'quality'], ['long', 'adj', 'quality'], ['wide', 'adj', 'quality'],
    ['thick', 'adj', 'quality'], ['heavy', 'adj', 'quality'], ['small', 'adj', 'quality'],
    ['short', 'adj', 'quality'], ['narrow', 'adj', 'quality'], ['thin', 'adj', 'quality'],
    ['woman', 'n', 'person'], ['man (male)', 'n', 'person'], ['man (human)', 'n', 'person'],
    ['child', 'n', 'kinship'], ['wife', 'n', 'kinship'], ['husband', 'n', 'kinship'],
    ['mother', 'n', 'kinship'], ['father', 'n', 'kinship'],
    ['animal', 'n', 'animal'], ['fish', 'n', 'animal'], ['bird', 'n', 'animal'],
    ['dog', 'n', 'animal'], ['louse', 'n', 'animal'], ['snake', 'n', 'animal'],
    ['worm', 'n', 'animal'],
    ['tree', 'n', 'plant'], ['forest', 'n', 'plant'], ['stick', 'n', 'plant'],
    ['fruit', 'n', 'plant'], ['seed', 'n', 'plant'], ['leaf', 'n', 'plant'],
    ['root', 'n', 'plant'], ['bark', 'n', 'plant'], ['flower', 'n', 'plant'],
    ['grass', 'n', 'plant'], ['rope', 'n', 'tool'],
    ['skin', 'n', 'body'], ['meat', 'n', 'food'], ['blood', 'n', 'body'],
    ['bone', 'n', 'body'], ['fat', 'n', 'body'], ['egg', 'n', 'food'],
    ['horn', 'n', 'body'], ['tail', 'n', 'body'], ['feather', 'n', 'body'],
    ['hair', 'n', 'body'], ['head', 'n', 'body'], ['ear', 'n', 'body'],
    ['eye', 'n', 'body'], ['nose', 'n', 'body'], ['mouth', 'n', 'body'],
    ['tooth', 'n', 'body'], ['tongue', 'n', 'body'], ['fingernail', 'n', 'body'],
    ['foot', 'n', 'body'], ['leg', 'n', 'body'], ['knee', 'n', 'body'],
    ['hand', 'n', 'body'], ['wing', 'n', 'body'], ['belly', 'n', 'body'],
    ['guts', 'n', 'body'], ['neck', 'n', 'body'], ['back', 'n', 'body'],
    ['breast', 'n', 'body'], ['heart', 'n', 'body'], ['liver', 'n', 'body'],
    ['drink', 'v', 'action'], ['eat', 'v', 'action'], ['bite', 'v', 'action'],
    ['suck', 'v', 'action'], ['spit', 'v', 'action'], ['vomit', 'v', 'action'],
    ['blow', 'v', 'action'], ['breathe', 'v', 'action'], ['laugh', 'v', 'action'],
    ['see', 'v', 'perception'], ['hear', 'v', 'perception'], ['know', 'v', 'cognition'],
    ['think', 'v', 'cognition'], ['smell', 'v', 'perception'], ['fear', 'v', 'cognition'],
    ['sleep', 'v', 'action'], ['live', 'v', 'action'], ['die', 'v', 'action'],
    ['kill', 'v', 'action'], ['fight', 'v', 'action'], ['hunt', 'v', 'action'],
    ['hit', 'v', 'action'], ['cut', 'v', 'action'], ['split', 'v', 'action'],
    ['stab', 'v', 'action'], ['scratch', 'v', 'action'], ['dig', 'v', 'action'],
    ['swim', 'v', 'motion'], ['fly', 'v', 'motion'], ['walk', 'v', 'motion'],
    ['come', 'v', 'motion'], ['lie (down)', 'v', 'motion'], ['sit', 'v', 'motion'],
    ['stand', 'v', 'motion'], ['turn', 'v', 'motion'], ['fall', 'v', 'motion'],
    ['give', 'v', 'action'], ['hold', 'v', 'action'], ['squeeze', 'v', 'action'],
    ['rub', 'v', 'action'], ['wash', 'v', 'action'], ['wipe', 'v', 'action'],
    ['pull', 'v', 'action'], ['push', 'v', 'action'], ['throw', 'v', 'action'],
    ['tie', 'v', 'action'], ['sew', 'v', 'action'], ['count', 'v', 'cognition'],
    ['say', 'v', 'speech'], ['sing', 'v', 'speech'], ['play', 'v', 'action'],
    ['float', 'v', 'motion'], ['flow', 'v', 'motion'], ['freeze', 'v', 'weather'],
    ['swell', 'v', 'action'],
    ['sun', 'n', 'nature'], ['moon', 'n', 'nature'], ['star', 'n', 'nature'],
    ['water', 'n', 'nature'], ['rain', 'n', 'weather'], ['river', 'n', 'nature'],
    ['lake', 'n', 'nature'], ['sea', 'n', 'nature'], ['salt', 'n', 'food'],
    ['stone', 'n', 'nature'], ['sand', 'n', 'nature'], ['dust', 'n', 'nature'],
    ['earth', 'n', 'nature'], ['cloud', 'n', 'weather'], ['fog', 'n', 'weather'],
    ['sky', 'n', 'nature'], ['wind', 'n', 'weather'], ['snow', 'n', 'weather'],
    ['ice', 'n', 'weather'], ['smoke', 'n', 'nature'], ['fire', 'n', 'nature'],
    ['ash', 'n', 'nature'], ['burn', 'v', 'action'], ['road', 'n', 'space'],
    ['mountain', 'n', 'nature'],
    ['red', 'adj', 'colour'], ['green', 'adj', 'colour'], ['yellow', 'adj', 'colour'],
    ['white', 'adj', 'colour'], ['black', 'adj', 'colour'],
    ['night', 'n', 'time'], ['day', 'n', 'time'], ['year', 'n', 'time'],
    ['warm', 'adj', 'quality'], ['cold', 'adj', 'quality'], ['full', 'adj', 'quality'],
    ['new', 'adj', 'quality'], ['old', 'adj', 'quality'], ['good', 'adj', 'quality'],
    ['bad', 'adj', 'quality'], ['rotten', 'adj', 'quality'], ['dirty', 'adj', 'quality'],
    ['straight', 'adj', 'quality'], ['round', 'adj', 'quality'], ['sharp', 'adj', 'quality'],
    ['dull', 'adj', 'quality'], ['smooth', 'adj', 'quality'], ['wet', 'adj', 'quality'],
    ['dry', 'adj', 'quality'], ['correct', 'adj', 'quality'], ['near', 'adj', 'space'],
    ['far', 'adj', 'space'], ['right (side)', 'adj', 'space'], ['left (side)', 'adj', 'space'],
    ['at', 'adp', 'grammar'], ['in', 'adp', 'grammar'], ['with', 'adp', 'grammar'],
    ['and', 'conj', 'grammar'], ['if', 'conj', 'grammar'], ['because', 'conj', 'grammar'],
    ['name', 'n', 'speech'],
];

/**
 * The extended lexicon. Culture-bearing vocabulary — the words that DO get
 * borrowed, replaced and shifted in meaning, which is precisely what makes them
 * useful for modelling semantic drift and loanword strata later.
 */
export const EXTENDED = [
    // ── kinship and society ────────────────────────────────────────────────
    ['brother', 'n', 'kinship'], ['sister', 'n', 'kinship'], ['son', 'n', 'kinship'],
    ['daughter', 'n', 'kinship'], ['grandfather', 'n', 'kinship'], ['grandmother', 'n', 'kinship'],
    ['uncle', 'n', 'kinship'], ['aunt', 'n', 'kinship'], ['cousin', 'n', 'kinship'],
    ['nephew', 'n', 'kinship'], ['orphan', 'n', 'kinship'], ['widow', 'n', 'kinship'],
    ['ancestor', 'n', 'kinship'], ['descendant', 'n', 'kinship'], ['clan', 'n', 'society'],
    ['family', 'n', 'kinship'], ['friend', 'n', 'society'], ['enemy', 'n', 'society'],
    ['guest', 'n', 'society'], ['stranger', 'n', 'society'], ['neighbour', 'n', 'society'],
    ['people', 'n', 'society'], ['crowd', 'n', 'society'], ['tribe', 'n', 'society'],
    ['chief', 'n', 'society'], ['king', 'n', 'society'], ['queen', 'n', 'society'],
    ['lord', 'n', 'society'], ['servant', 'n', 'society'], ['slave', 'n', 'society'],
    ['priest', 'n', 'religion'], ['elder', 'n', 'society'], ['warrior', 'n', 'war'],
    ['thief', 'n', 'society'], ['judge', 'n', 'society'], ['messenger', 'n', 'society'],
    ['merchant', 'n', 'trade'], ['smith', 'n', 'craft'], ['farmer', 'n', 'agriculture'],
    ['shepherd', 'n', 'agriculture'], ['hunter', 'n', 'action'], ['fisherman', 'n', 'action'],
    ['weaver', 'n', 'craft'], ['potter', 'n', 'craft'], ['builder', 'n', 'craft'],
    ['singer', 'n', 'speech'], ['healer', 'n', 'society'], ['teacher', 'n', 'cognition'],

    // ── body, health, life ─────────────────────────────────────────────────
    ['face', 'n', 'body'], ['forehead', 'n', 'body'], ['cheek', 'n', 'body'],
    ['chin', 'n', 'body'], ['lip', 'n', 'body'], ['throat', 'n', 'body'],
    ['shoulder', 'n', 'body'], ['elbow', 'n', 'body'], ['finger', 'n', 'body'],
    ['thumb', 'n', 'body'], ['toe', 'n', 'body'], ['heel', 'n', 'body'],
    ['rib', 'n', 'body'], ['skull', 'n', 'body'], ['brain', 'n', 'body'],
    ['lung', 'n', 'body'], ['kidney', 'n', 'body'], ['vein', 'n', 'body'],
    ['sweat', 'n', 'body'], ['tear', 'n', 'body'], ['breath', 'n', 'body'],
    ['voice', 'n', 'speech'], ['wound', 'n', 'body'], ['scar', 'n', 'body'],
    ['sickness', 'n', 'body'], ['pain', 'n', 'body'], ['medicine', 'n', 'body'],
    ['corpse', 'n', 'body'], ['strength', 'n', 'quality'], ['weakness', 'n', 'quality'],
    ['hunger', 'n', 'body'], ['thirst', 'n', 'body'], ['shadow', 'n', 'nature'],

    // ── animals ────────────────────────────────────────────────────────────
    ['horse', 'n', 'animal'], ['cow', 'n', 'animal'], ['bull', 'n', 'animal'],
    ['sheep', 'n', 'animal'], ['goat', 'n', 'animal'], ['pig', 'n', 'animal'],
    ['deer', 'n', 'animal'], ['bear', 'n', 'animal'], ['wolf', 'n', 'animal'],
    ['fox', 'n', 'animal'], ['hare', 'n', 'animal'], ['mouse', 'n', 'animal'],
    ['cat', 'n', 'animal'], ['eagle', 'n', 'animal'], ['crow', 'n', 'animal'],
    ['duck', 'n', 'animal'], ['goose', 'n', 'animal'], ['chicken', 'n', 'animal'],
    ['bee', 'n', 'animal'], ['fly (insect)', 'n', 'animal'], ['ant', 'n', 'animal'],
    ['spider', 'n', 'animal'], ['frog', 'n', 'animal'], ['crab', 'n', 'animal'],
    ['shell', 'n', 'animal'], ['nest', 'n', 'animal'], ['herd', 'n', 'agriculture'],
    ['claw', 'n', 'body'], ['hoof', 'n', 'body'], ['fur', 'n', 'body'],

    // ── plants and agriculture ─────────────────────────────────────────────
    ['field', 'n', 'agriculture'], ['garden', 'n', 'agriculture'], ['grain', 'n', 'agriculture'],
    ['wheat', 'n', 'agriculture'], ['rice', 'n', 'agriculture'], ['barley', 'n', 'agriculture'],
    ['bean', 'n', 'agriculture'], ['plough', 'n', 'agriculture'], ['harvest', 'n', 'agriculture'],
    ['sow', 'v', 'agriculture'], ['reap', 'v', 'agriculture'], ['grind', 'v', 'agriculture'],
    ['mill', 'n', 'agriculture'], ['branch', 'n', 'plant'], ['trunk', 'n', 'plant'],
    ['thorn', 'n', 'plant'], ['reed', 'n', 'plant'], ['moss', 'n', 'plant'],
    ['mushroom', 'n', 'plant'], ['vine', 'n', 'plant'], ['nut', 'n', 'plant'],
    ['berry', 'n', 'plant'], ['oil', 'n', 'food'], ['honey', 'n', 'food'],
    ['milk', 'n', 'food'], ['cheese', 'n', 'food'], ['bread', 'n', 'food'],
    ['soup', 'n', 'food'], ['beer', 'n', 'food'], ['wine', 'n', 'food'],
    ['cook', 'v', 'food'], ['bake', 'v', 'food'], ['boil', 'v', 'food'],
    ['roast', 'v', 'food'], ['ripe', 'adj', 'quality'], ['raw', 'adj', 'quality'],
    ['sweet', 'adj', 'perception'], ['sour', 'adj', 'perception'], ['bitter', 'adj', 'perception'],

    // ── tools, craft, dwelling ─────────────────────────────────────────────
    ['house', 'n', 'dwelling'], ['door', 'n', 'dwelling'], ['wall', 'n', 'dwelling'],
    ['roof', 'n', 'dwelling'], ['floor', 'n', 'dwelling'], ['window', 'n', 'dwelling'],
    ['hearth', 'n', 'dwelling'], ['village', 'n', 'dwelling'], ['city', 'n', 'dwelling'],
    ['market', 'n', 'trade'], ['temple', 'n', 'religion'], ['tomb', 'n', 'religion'],
    ['bridge', 'n', 'dwelling'], ['well', 'n', 'dwelling'], ['fence', 'n', 'dwelling'],
    ['knife', 'n', 'tool'], ['axe', 'n', 'tool'], ['hammer', 'n', 'tool'],
    ['needle', 'n', 'tool'], ['basket', 'n', 'tool'], ['pot', 'n', 'tool'],
    ['cup', 'n', 'tool'], ['bag', 'n', 'tool'], ['wheel', 'n', 'tool'],
    ['cart', 'n', 'tool'], ['boat', 'n', 'tool'], ['sail', 'n', 'tool'],
    ['oar', 'n', 'tool'], ['net', 'n', 'tool'], ['hook', 'n', 'tool'],
    ['bow', 'n', 'war'], ['arrow', 'n', 'war'], ['spear', 'n', 'war'],
    ['sword', 'n', 'war'], ['shield', 'n', 'war'], ['armour', 'n', 'war'],
    ['cloth', 'n', 'craft'], ['thread', 'n', 'craft'], ['wool', 'n', 'craft'],
    ['leather', 'n', 'craft'], ['shoe', 'n', 'craft'], ['belt', 'n', 'craft'],
    ['clothing', 'n', 'craft'], ['iron', 'n', 'craft'], ['copper', 'n', 'craft'],
    ['gold', 'n', 'trade'], ['silver', 'n', 'trade'], ['clay', 'n', 'craft'],
    ['glass', 'n', 'craft'], ['rope (thick)', 'n', 'tool'], ['ladder', 'n', 'tool'],

    // ── landscape, weather, sky ────────────────────────────────────────────
    ['hill', 'n', 'nature'], ['valley', 'n', 'nature'], ['plain', 'n', 'nature'],
    ['desert', 'n', 'nature'], ['swamp', 'n', 'nature'], ['island', 'n', 'nature'],
    ['coast', 'n', 'nature'], ['cave', 'n', 'nature'], ['cliff', 'n', 'nature'],
    ['spring (water)', 'n', 'nature'], ['stream', 'n', 'nature'], ['wave', 'n', 'nature'],
    ['flood', 'n', 'weather'], ['storm', 'n', 'weather'], ['thunder', 'n', 'weather'],
    ['lightning', 'n', 'weather'], ['hail', 'n', 'weather'], ['dew', 'n', 'weather'],
    ['frost', 'n', 'weather'], ['heat', 'n', 'weather'], ['dawn', 'n', 'time'],
    ['dusk', 'n', 'time'], ['noon', 'n', 'time'], ['midnight', 'n', 'time'],
    ['season', 'n', 'time'], ['summer', 'n', 'time'], ['winter', 'n', 'time'],
    ['spring (season)', 'n', 'time'], ['autumn', 'n', 'time'], ['month', 'n', 'time'],
    ['morning', 'n', 'time'], ['evening', 'n', 'time'], ['yesterday', 'adv', 'time'],
    ['tomorrow', 'adv', 'time'], ['today', 'adv', 'time'], ['now', 'adv', 'time'],
    ['always', 'adv', 'time'], ['never', 'adv', 'time'], ['often', 'adv', 'time'],
    ['again', 'adv', 'time'], ['already', 'adv', 'time'], ['soon', 'adv', 'time'],

    // ── motion and space ───────────────────────────────────────────────────
    ['go', 'v', 'motion'], ['run', 'v', 'motion'], ['jump', 'v', 'motion'],
    ['climb', 'v', 'motion'], ['crawl', 'v', 'motion'], ['carry', 'v', 'motion'],
    ['bring', 'v', 'motion'], ['send', 'v', 'motion'], ['follow', 'v', 'motion'],
    ['flee', 'v', 'motion'], ['chase', 'v', 'motion'], ['arrive', 'v', 'motion'],
    ['leave', 'v', 'motion'], ['return', 'v', 'motion'], ['enter', 'v', 'motion'],
    ['cross', 'v', 'motion'], ['rise', 'v', 'motion'], ['descend', 'v', 'motion'],
    ['above', 'adp', 'space'], ['below', 'adp', 'space'], ['before', 'adp', 'space'],
    ['behind', 'adp', 'space'], ['between', 'adp', 'space'], ['inside', 'adp', 'space'],
    ['outside', 'adp', 'space'], ['around', 'adp', 'space'], ['through', 'adp', 'space'],
    ['towards', 'adp', 'space'], ['from', 'adp', 'space'], ['edge', 'n', 'space'],
    ['middle', 'n', 'space'], ['corner', 'n', 'space'], ['side', 'n', 'space'],
    ['top', 'n', 'space'], ['bottom', 'n', 'space'], ['hole', 'n', 'space'],
    ['place', 'n', 'space'], ['path', 'n', 'space'], ['border', 'n', 'space'],

    // ── mind, speech, society, abstraction ─────────────────────────────────
    ['word', 'n', 'speech'], ['story', 'n', 'speech'], ['song', 'n', 'speech'],
    ['lie (untruth)', 'n', 'speech'], ['truth', 'n', 'cognition'], ['question', 'n', 'speech'],
    ['answer', 'n', 'speech'], ['oath', 'n', 'speech'], ['law', 'n', 'society'],
    ['custom', 'n', 'society'], ['war', 'n', 'war'], ['peace', 'n', 'society'],
    ['debt', 'n', 'trade'], ['price', 'n', 'trade'], ['gift', 'n', 'trade'],
    ['trade', 'v', 'trade'], ['buy', 'v', 'trade'], ['sell', 'v', 'trade'],
    ['pay', 'v', 'trade'], ['work', 'n', 'action'], ['rest', 'v', 'action'],
    ['dream', 'n', 'cognition'], ['soul', 'n', 'religion'], ['god', 'n', 'religion'],
    ['spirit', 'n', 'religion'], ['sacrifice', 'n', 'religion'], ['curse', 'n', 'religion'],
    ['blessing', 'n', 'religion'], ['magic', 'n', 'religion'], ['omen', 'n', 'religion'],
    ['fate', 'n', 'religion'], ['shame', 'n', 'cognition'], ['honour', 'n', 'cognition'],
    ['anger', 'n', 'cognition'], ['joy', 'n', 'cognition'], ['sorrow', 'n', 'cognition'],
    ['love', 'v', 'cognition'], ['hate', 'v', 'cognition'], ['want', 'v', 'cognition'],
    ['need', 'v', 'cognition'], ['believe', 'v', 'cognition'], ['forget', 'v', 'cognition'],
    ['remember', 'v', 'cognition'], ['learn', 'v', 'cognition'], ['teach', 'v', 'cognition'],
    ['ask', 'v', 'speech'], ['answer', 'v', 'speech'], ['call', 'v', 'speech'],
    ['shout', 'v', 'speech'], ['whisper', 'v', 'speech'], ['tell', 'v', 'speech'],
    ['promise', 'v', 'speech'], ['praise', 'v', 'speech'], ['curse', 'v', 'speech'],
    ['choose', 'v', 'cognition'], ['find', 'v', 'cognition'], ['lose', 'v', 'action'],
    ['seek', 'v', 'action'], ['wait', 'v', 'action'], ['help', 'v', 'action'],
    ['make', 'v', 'action'], ['build', 'v', 'craft'], ['break', 'v', 'action'],
    ['open', 'v', 'action'], ['close', 'v', 'action'], ['cover', 'v', 'action'],
    ['fill', 'v', 'action'], ['empty', 'v', 'action'], ['hide', 'v', 'action'],
    ['show', 'v', 'action'], ['take', 'v', 'action'], ['put', 'v', 'action'],
    ['keep', 'v', 'action'], ['steal', 'v', 'action'], ['guard', 'v', 'action'],
    ['rule', 'v', 'society'], ['obey', 'v', 'society'], ['serve', 'v', 'society'],
    ['marry', 'v', 'kinship'], ['be born', 'v', 'kinship'], ['grow', 'v', 'action'],

    // ── qualities and colours ──────────────────────────────────────────────
    ['blue', 'adj', 'colour'], ['grey', 'adj', 'colour'], ['brown', 'adj', 'colour'],
    ['bright', 'adj', 'quality'], ['dark', 'adj', 'quality'], ['deep', 'adj', 'quality'],
    ['shallow', 'adj', 'quality'], ['high', 'adj', 'quality'], ['low', 'adj', 'quality'],
    ['strong', 'adj', 'quality'], ['weak', 'adj', 'quality'], ['soft', 'adj', 'quality'],
    ['hard', 'adj', 'quality'], ['heavy (dense)', 'adj', 'quality'], ['light (weight)', 'adj', 'quality'],
    ['fast', 'adj', 'quality'], ['slow', 'adj', 'quality'], ['clean', 'adj', 'quality'],
    ['beautiful', 'adj', 'quality'], ['ugly', 'adj', 'quality'], ['true', 'adj', 'cognition'],
    ['false', 'adj', 'cognition'], ['brave', 'adj', 'quality'], ['afraid', 'adj', 'cognition'],
    ['wise', 'adj', 'cognition'], ['foolish', 'adj', 'cognition'], ['rich', 'adj', 'trade'],
    ['poor', 'adj', 'trade'], ['holy', 'adj', 'religion'], ['free', 'adj', 'society'],
    ['whole', 'adj', 'quantity'], ['empty', 'adj', 'quantity'], ['alone', 'adj', 'quantity'],
    ['first', 'num', 'quantity'], ['last', 'adj', 'quantity'], ['half', 'quant', 'quantity'],
    ['six', 'num', 'quantity'], ['seven', 'num', 'quantity'], ['eight', 'num', 'quantity'],
    ['nine', 'num', 'quantity'], ['ten', 'num', 'quantity'], ['hundred', 'num', 'quantity'],
    ['thousand', 'num', 'quantity'], ['every', 'quant', 'quantity'], ['none', 'quant', 'quantity'],
    ['both', 'quant', 'quantity'], ['much', 'quant', 'quantity'], ['more', 'quant', 'quantity'],
    ['less', 'quant', 'quantity'], ['enough', 'quant', 'quantity'],

    // ── grammatical words that erode into morphology later ─────────────────
    ['be', 'v', 'grammar'], ['have', 'v', 'grammar'], ['do', 'v', 'grammar'],
    ['can', 'v', 'grammar'], ['must', 'v', 'grammar'], ['become', 'v', 'grammar'],
    ['finish', 'v', 'grammar'], ['begin', 'v', 'grammar'], ['seem', 'v', 'grammar'],
    ['self', 'pron', 'grammar'], ['each other', 'pron', 'grammar'], ['someone', 'pron', 'grammar'],
    ['something', 'pron', 'grammar'], ['nothing', 'pron', 'grammar'], ['which', 'interrog', 'grammar'],
    ['why', 'interrog', 'grammar'], ['yes', 'part', 'grammar'], ['no', 'part', 'grammar'],
    ['or', 'conj', 'grammar'], ['but', 'conj', 'grammar'], ['than', 'conj', 'grammar'],
    ['very', 'adv', 'quantity'], ['only', 'adv', 'quantity'], ['also', 'adv', 'grammar'],
    ['perhaps', 'adv', 'cognition'], ['thus', 'adv', 'grammar'], ['still', 'adv', 'time'],
];

/**
 * The concept list for a project, in PRIORITY order.
 *
 * Priority matters because the list is longer than most projects want, and a
 * naive truncation would cut whatever happens to sit at the end. Three tiers:
 *
 *   0. The Swadesh core — always present, in every language, no exceptions.
 *   1. Grammatical and numeral vocabulary, PLUS the endpoints of the attested
 *      semantic-shift paths. These look boring and are the most important
 *      entries in the file: grammaticalisation clines run through them ("go" →
 *      future, "have" → perfect, "finish" → completive, "one" → indefinite
 *      article), and a language missing "be" or "ten" can't do the things a
 *      later stage needs it to do.
 *
 *      The shift endpoints are here for the same reason, and it is not a
 *      cosmetic promotion. "wise", "obey", "clean" and "take" all sit near the
 *      end of the extended list, so a 600-word lexicon truncated them away —
 *      and every path leading to or from them silently never fired. The table
 *      looked full and did nothing, which is the worst kind of defect because
 *      it produces no error at all.
 *   2. Everything else — culture vocabulary, which is the first to be cut and
 *      the first to be borrowed.
 *
 * Duplicate gloss+POS pairs are dropped. ["answer", n] and ["answer", v] are
 * genuinely distinct concepts and both survive; a true duplicate would silently
 * create two roots for one meaning and break the cognate tables.
 */
/**
 * EVERYDAY vocabulary (DJ, 17 Oct 2026: "would it be possible to add a
 * translator?"). The Swadesh and extended lists are what a comparativist
 * needs; a translation needs the words people say: book, write, money,
 * school, young, happy, hello. Every one of these was missing. They come
 * LAST, after every other tier, because a root's id is its position in the
 * list: appended, they leave every existing word as it was.
 */
export const EVERYDAY = [
    ['book', 'n', 'craft'], ['letter', 'n', 'speech'], ['paper', 'n', 'craft'], ['school', 'n', 'society'],
    ['student', 'n', 'society'], ['money', 'n', 'trade'], ['food', 'n', 'food'], ['meal', 'n', 'food'],
    ['table', 'n', 'dwelling'], ['chair', 'n', 'dwelling'], ['bed', 'n', 'dwelling'], ['room', 'n', 'dwelling'],
    ['street', 'n', 'dwelling'], ['town', 'n', 'society'], ['country', 'n', 'society'], ['land', 'n', 'nature'],
    ['world', 'n', 'nature'], ['army', 'n', 'war'], ['soldier', 'n', 'war'], ['weapon', 'n', 'war'],
    ['ship', 'n', 'craft'], ['time', 'n', 'time'], ['hour', 'n', 'time'], ['week', 'n', 'time'],
    ['life', 'n', 'cognition'], ['death', 'n', 'religion'], ['mind', 'n', 'cognition'], ['idea', 'n', 'cognition'],
    ['thing', 'n', 'cognition'], ['home', 'n', 'dwelling'], ['person', 'n', 'society'], ['boy', 'n', 'kinship'],
    ['girl', 'n', 'kinship'], ['baby', 'n', 'kinship'], ['music', 'n', 'speech'], ['game', 'n', 'society'],
    ['art', 'n', 'craft'], ['picture', 'n', 'craft'], ['colour', 'n', 'colour'], ['number', 'n', 'trade'],
    ['part', 'n', 'space'], ['end', 'n', 'time'], ['news', 'n', 'speech'], ['light', 'n', 'nature'],
    ['language', 'n', 'speech'],
    ['write', 'v', 'speech'], ['read', 'v', 'speech'], ['speak', 'v', 'speech'], ['talk', 'v', 'speech'],
    ['understand', 'v', 'cognition'], ['like', 'v', 'cognition'], ['try', 'v', 'action'], ['use', 'v', 'action'],
    ['win', 'v', 'war'], ['stop', 'v', 'motion'], ['stay', 'v', 'motion'], ['wake', 'v', 'action'],
    ['dance', 'v', 'action'], ['weep', 'v', 'perception'], ['feel', 'v', 'perception'], ['hope', 'v', 'cognition'],
    ['meet', 'v', 'motion'], ['lead', 'v', 'society'], ['travel', 'v', 'motion'], ['change', 'v', 'action'],
    ['move', 'v', 'motion'],
    ['young', 'adj', 'quality'], ['happy', 'adj', 'quality'], ['sad', 'adj', 'quality'], ['angry', 'adj', 'quality'],
    ['easy', 'adj', 'quality'], ['difficult', 'adj', 'quality'], ['important', 'adj', 'quality'], ['early', 'adj', 'time'],
    ['late', 'adj', 'time'], ['different', 'adj', 'quality'], ['same', 'adj', 'quality'], ['ready', 'adj', 'quality'],
    ['sick', 'adj', 'quality'], ['tired', 'adj', 'quality'], ['loud', 'adj', 'quality'], ['quiet', 'adj', 'quality'],
    ['dangerous', 'adj', 'quality'], ['safe', 'adj', 'quality'], ['kind', 'adj', 'quality'], ['proud', 'adj', 'quality'],
    ['hot', 'adj', 'quality'],
    ['then', 'adv', 'time'],
    ['for', 'adp', 'grammar'], ['about', 'adp', 'grammar'],
    ['hello', 'part', 'speech'], ['thanks', 'part', 'speech'], ['please', 'part', 'speech'], ['goodbye', 'part', 'speech'],
    // the word that makes a statement a yes-no question, where a language has one
    // (Japanese ka, Mandarin ma, Finnish -ko): syntax.question says whether it is used
    ['question particle', 'part', 'grammar'],
];

export function conceptList(size = 600) {
    const seen = new Set();
    const tiers = [[], [], [], []];
    const HIGH_PRIORITY_DOMAINS = new Set(['grammar', 'quantity', 'person']);

    const push = (gloss, pos, domain, core) => {
        const key = `${gloss}|${pos}`;
        if (seen.has(key)) return;
        seen.add(key);
        const tier = core ? 0 : (HIGH_PRIORITY_DOMAINS.has(domain) || PATH_GLOSSES.has(gloss) ? 1 : 2);
        tiers[tier].push({ gloss, pos, domain, core });
    };

    for (const [g, p, d] of SWADESH_207) push(g, p, d, true);
    for (const [g, p, d] of EXTENDED) push(g, p, d, false);
    // the everyday tier, always last (see EVERYDAY)
    for (const [g, p, d] of EVERYDAY) {
        const key = `${g}|${p}`;
        if (!seen.has(key)) { seen.add(key); tiers[3].push({ gloss: g, pos: p, domain: d, core: false }); }
    }

    const ordered = [...tiers[0], ...tiers[1], ...tiers[2], ...tiers[3]];
    return ordered
        .slice(0, Math.max(SWADESH_207.length, size))
        .map((c, index) => ({ ...c, index }));
}

export const SWADESH_COUNT = SWADESH_207.length;
export const EXTENDED_COUNT = EXTENDED.length;
