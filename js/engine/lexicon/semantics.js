/**
 * Semantic change, along paths that real languages actually take.
 *
 * ## The gap this closes
 *
 * `replacement.js` can already move a meaning from one etymon to another, and
 * one of its four mechanisms is a semantic NEIGHBOUR broadening into the slot.
 * But "neighbour" was defined as *any word in the same semantic domain with the
 * same part of speech* — so the word for "cheek" could take over "belly", and
 * "wing" could take over "guts", because all four are body parts and all four
 * are nouns.
 *
 * That is not how meaning moves. Semantic change is one of the most patterned
 * things in historical linguistics: the same handful of relations turn up again
 * and again in unrelated families, to the point that a shift like "tongue" →
 * "language" or "moon" → "month" is close to a universal. There is no language
 * anywhere in which the word for "cheek" came to mean "belly".
 *
 * So this module supplies the missing constraint: a curated table of licensed
 * paths, every one with a real attested example attached. If a shift is not on
 * the table, it does not happen. That is deliberately restrictive — the standing
 * rule for this engine is that an unattested path is a fabrication, and the
 * whole point of the exercise is to model rather than to invent.
 *
 * ## What it buys, beyond tidiness
 *
 * FALSE FRIENDS. German *Gift* is "poison"; English *gift* is a present. They
 * are the same word: Proto-Germanic *giftiz "a giving", which narrowed to "dose
 * (of medicine)" in German and then to "poison". A cognate pair whose forms
 * still match and whose meanings no longer do is the single most convincing
 * artefact a real language family produces, and nothing in this engine could
 * produce one, because a meaning only ever moved while displacing another word
 * and it always landed in the domain it started in.
 *
 * Two mechanisms here, and they are genuinely different events:
 *
 *   DISPLACEMENT   word A shifts into word B's meaning and pushes B out. This is
 *                  `replacement.js`'s neighbour strategy, now drawing its
 *                  candidates from the path table instead of the domain bucket.
 *                  Latin *testa* "pot" → "head", displacing *caput*.
 *
 *   FREE DRIFT     word A shifts and nothing takes its old meaning, so the
 *                  language simply stops having a word for that concept. This is
 *                  restricted to non-core, lower-frequency vocabulary, where a
 *                  gap is unremarkable — every language has concepts it does not
 *                  lexicalise. This is what produces false friends across
 *                  sisters, because the drift happens on one branch and not the
 *                  other.
 */

import { zipfWeight } from '../rng.js';

// ---------------------------------------------------------------------------
// The seven ways a meaning moves
// ---------------------------------------------------------------------------

/**
 * The standard typology of semantic change. Every path below is tagged with one
 * of these, and the tag is shown in the panel, because "the word for 'stranger'
 * came to mean 'enemy'" is a much better line when it also says *why* that is a
 * normal thing for a word to do.
 */
export const SHIFT_TYPES = {
    metaphor: {
        label: 'metaphor',
        note: 'A resemblance across domains — concrete to abstract, body to mind, space to time. The commonest single source of new meaning in any language.',
        example: 'Latin acutus "sharp (of a blade)" → "sharp (of a mind)"; English grasp, see, warm',
    },
    metonymy: {
        label: 'metonymy',
        note: 'An association within one domain — material for object, part for whole, container for contents, place for institution.',
        example: 'Latin ferrum "iron" also means "sword"; English "the Crown", "a good table"',
    },
    broadening: {
        label: 'broadening',
        note: 'The word covers more than it used to: a specific becomes a general.',
        example: 'Latin passer "sparrow" → Spanish pájaro "bird"; Old English docga, one breed, → dog',
    },
    narrowing: {
        label: 'narrowing',
        note: 'The word covers less than it used to: a general becomes a specific. Usually the culturally salient member takes the whole label.',
        example: 'Old English deor "animal" → deer; mete "food" → meat; corn "grain" → maize in America',
    },
    pejoration: {
        label: 'pejoration',
        note: 'The word acquires a worse sense. Words for people go this way far more often than the reverse.',
        example: 'Latin hostis "stranger" → "enemy"; English knave "boy" → "rogue"; villain "farmhand" → "criminal"',
    },
    amelioration: {
        label: 'amelioration',
        note: 'The word acquires a better sense. Rarer than pejoration, and usually driven by politeness or by titles inflating.',
        example: 'Latin senior "older" → French seigneur, Spanish señor "lord"; English knight "boy" → "knight"',
    },
    bleaching: {
        label: 'bleaching',
        note: 'The word loses specific content and becomes general or grammatical. The first step of grammaticalisation.',
        example: 'Latin homo "man" → French on "one, someone"; English thing, once "assembly"',
    },
};

// ---------------------------------------------------------------------------
// The licensed paths
// ---------------------------------------------------------------------------

/**
 * Every entry: [source gloss, target gloss, type, attested example].
 *
 * Both glosses must exist in `swadesh.js`'s concept list and must share a part
 * of speech — `validatePaths()` below asserts both, and the engine tests run it,
 * so a typo here fails the suite rather than silently producing a path that can
 * never fire.
 *
 * The attestation is not decoration. It is the check on this table: if a path
 * cannot be given a real example it does not belong here, however plausible it
 * sounds. "Plausible-sounding but unattested" is precisely the failure mode this
 * engine exists to avoid.
 */
export const SHIFT_PATHS = [
    // ── body → space, and body → person ──────────────────────────────────────
    ['head', 'chief', 'metaphor', 'Latin caput "head" → "leader"; English head of state; the same metaphor in Hausa, Turkish and Japanese'],
    ['head', 'top', 'metaphor', 'Latin caput montis "head of the mountain"; English the head of the stairs'],
    ['foot', 'bottom', 'metaphor', 'Latin pes montis "foot of the mountain"; English the foot of the bed'],
    ['heart', 'middle', 'metaphor', 'Latin cor gave English core; the heart of the city, the heart of the matter'],
    ['mouth', 'door', 'metaphor', 'Latin ostium "door, entrance" is derived from os "mouth"; English the mouth of a cave'],
    ['eye', 'spring (water)', 'metaphor', 'Arabic ʿayn and Hebrew ayin mean both "eye" and "spring, well"'],
    ['hand', 'servant', 'metonymy', 'English farmhand, all hands on deck; Latin manus for a body of men'],
    ['tongue', 'voice', 'metonymy', 'Latin lingua "tongue" → "language, speech"; Greek glōssa; the tongue standing for speech is close to universal'],
    ['breath', 'spirit', 'metaphor', 'Latin spiritus "breath" → "spirit"; Greek pneuma; Hebrew ruach "wind, breath, spirit"'],
    ['breath', 'soul', 'metaphor', 'Latin anima "breath" → "soul"; Sanskrit ātman is cognate with German atmen "to breathe"'],
    ['shadow', 'soul', 'metaphor', 'Greek skia; the shadow as the departed self is attested across Africa, Melanesia and the ancient Mediterranean'],
    ['blood', 'family', 'metonymy', 'Latin sanguis; English blood relation, of noble blood'],
    ['seed', 'descendant', 'metaphor', 'Hebrew zeraʿ, Latin semen, Greek sperma; English the seed of Abraham'],

    // ── perception → cognition ───────────────────────────────────────────────
    ['see', 'know', 'metaphor', 'PIE *weid- "see" gave Greek oida "I know", Latin video, English wit — the oldest attested example of the metaphor'],
    ['hear', 'obey', 'metaphor', 'Latin audire "hear" → oboedire "obey"; German hören / gehorchen; French entendre'],
    ['hold', 'know', 'metaphor', 'Latin comprehendere "seize" → "understand"; German begreifen < greifen "grasp"; English grasp a point'],
    ['know', 'can', 'bleaching', 'English can < Old English cunnan "to know"; Spanish saber "know" also means "know how to"'],
    ['follow', 'obey', 'metaphor', 'German folgen "follow" → "obey"; Latin sequi and its derivatives across Romance'],

    // ── physical quality → mental quality ────────────────────────────────────
    ['sharp', 'wise', 'metaphor', 'Latin acutus "sharp" → "acute, clever"; English sharp, keen; French fin'],
    ['dull', 'foolish', 'metaphor', 'English dull, blunt, thick; German stumpf'],
    ['bright', 'beautiful', 'metaphor', 'Latin clarus "bright" → "illustrious"; English brilliant'],
    ['dark', 'bad', 'metaphor', 'Latin obscurus; English dark deeds — the light/dark to good/bad mapping is one of the most widespread metaphors on record'],
    ['hard', 'brave', 'metaphor', 'Latin durus; English hard man, tough; German hart'],
    ['soft', 'weak', 'metaphor', 'Latin mollis "soft" → "weak, unmanly"; English soft, a softie'],
    ['sweet', 'good', 'metaphor', 'Latin suavis and dulcis both extend from taste to general approval; English sweet of you'],
    ['bitter', 'bad', 'metaphor', 'Latin amarus; English a bitter experience, bitterness'],
    ['clean', 'holy', 'metaphor', 'Greek katharos "clean" → "pure, holy"; Sanskrit śuddha; Latin purus'],
    ['straight', 'correct', 'metaphor', 'Latin rectus "straight" → "correct, right"; English right < the same root; German recht'],
    ['old', 'wise', 'metaphor', 'Latin senex / senatus; the elder as the knower is attested wherever there are elders'],

    // ── pejoration and amelioration ──────────────────────────────────────────
    ['stranger', 'enemy', 'pejoration', 'Latin hostis meant "stranger" in the Twelve Tables and "enemy" by the classical period — the textbook case'],
    ['guest', 'stranger', 'pejoration', 'PIE *ghosti- gave both Latin hospes "guest" and hostis "stranger, enemy"'],
    ['child', 'servant', 'pejoration', 'Greek pais "child" → "slave"; French garçon; English knave < Old English cnafa "boy"'],
    ['elder', 'lord', 'amelioration', 'Latin senior "older" → French seigneur, Spanish señor, Italian signore'],
    ['chief', 'king', 'amelioration', 'Titles inflate: English king < Germanic *kuningaz, the man of the kin; Latin rex from a root meaning "to rule straight"'],
    ['pain', 'work', 'pejoration', 'French travail "work" < Late Latin trepalium, an instrument of torture; English travail keeps the older sense'],
    ['debt', 'shame', 'metaphor', 'German Schuld means both "debt" and "guilt"; the Lord\'s Prayer uses the same word for both in Aramaic and Greek'],

    // ── broadening and narrowing ─────────────────────────────────────────────
    ['animal', 'deer', 'narrowing', 'Old English deor "animal" → deer; German Tier kept the general sense'],
    ['grain', 'wheat', 'narrowing', 'English corn means "grain" in Britain and "maize" in America — the salient local crop takes the general word'],
    ['woman', 'wife', 'narrowing', 'Old English wīf "woman" → wife; German Weib kept the older sense'],
    ['man (male)', 'husband', 'narrowing', 'English man and wife; Latin vir; French mari beside homme'],
    ['village', 'city', 'broadening', 'Old English tūn "enclosure, farmstead" → town; settlement words inflate as settlements grow'],
    ['walk', 'go', 'broadening', 'Latin ambulare "to walk" → French aller "to go"'],
    ['custom', 'law', 'narrowing', 'Latin mos, mores "custom" → the moral and legal sense; English common law is codified custom'],

    // ── metonymy: material, part, container, place ───────────────────────────
    ['iron', 'sword', 'metonymy', 'Latin ferrum means both "iron" and "sword"; Homer uses "bronze" for a weapon'],
    ['clay', 'pot', 'metonymy', 'Greek keramos "potter\'s clay" → "pottery"; English china'],
    ['skin', 'leather', 'metonymy', 'English hide; Latin pellis; the material and the treated material share a word almost everywhere'],
    ['wool', 'cloth', 'metonymy', 'English worsted, woollens; Latin lana used for woollen cloth'],
    ['horn', 'cup', 'metonymy', 'Drinking horns: Germanic *hurnaz and Greek keras both name the vessel as well as the material'],
    ['sail', 'boat', 'metonymy', 'English a fleet of thirty sail; Homeric Greek does the same with oars'],
    ['roof', 'house', 'metonymy', 'Latin tectum "roof" → "house"; English a roof over your head'],
    ['house', 'family', 'metonymy', 'Latin domus; Chinese 家 jiā is both; the House of Windsor'],
    ['leather', 'shoe', 'metonymy', 'The material for the object; Spanish cuero, and English leathers for boots'],

    // ── time, sky, landscape ─────────────────────────────────────────────────
    ['moon', 'month', 'metonymy', 'English moon and month are the same word; Latin mensis; Greek mēn — one of the most widespread etymologies on Earth'],
    ['sun', 'day', 'metonymy', 'Japanese 日 hi is both sun and day; Turkish gün "day" beside güneş "sun"'],
    ['winter', 'year', 'metonymy', 'Old Norse counted age in winters; English ten winters old; Latin used summers for the same purpose'],
    ['star', 'fate', 'metonymy', 'Latin astrum → "destiny"; English disaster is literally "ill-starred"'],
    ['sea', 'lake', 'broadening', 'German See is "lake" as a masculine and "sea" as a feminine; the Sea of Galilee is a lake'],
    ['road', 'custom', 'metaphor', 'Chinese 道 dào "road" → "way, doctrine"; English she has her ways; Latin via used the same way'],
    ['fire', 'anger', 'metaphor', 'Chinese 火气 huǒqì "fire-breath" is temper; English burning with rage, inflamed'],

    // ── verbs: motion, posture, transaction ──────────────────────────────────
    ['stand', 'be', 'bleaching', 'Latin stare "to stand" → Spanish and Portuguese estar "to be"'],
    ['sit', 'live', 'metaphor', 'Turkish oturmak "sit" → "reside"; English the village sits in a valley'],
    ['turn', 'become', 'metaphor', 'German werden "become" < PIE *wert- "to turn"; English turn into, turn sour'],
    ['go', 'die', 'bleaching', 'Euphemism: English pass away, depart; Latin abire; the same avoidance in language after language'],
    ['sleep', 'die', 'metaphor', 'Greek and Latin both use sleep for death; English fell asleep in the Lord'],
    ['fall', 'die', 'metonymy', 'English the fallen; German gefallen; universal in military registers'],
    ['take', 'buy', 'metaphor', 'Latin emere originally meant "to take" and came to mean "to buy"'],
    ['cut', 'choose', 'metaphor', 'Latin decidere "to cut off" → "to decide"; English cut a deal'],
    ['tie', 'promise', 'metaphor', 'Latin obligare "to bind" → "to oblige"; English bound by a promise'],

    // ── society, religion, mind ──────────────────────────────────────────────
    ['father', 'priest', 'metaphor', 'Kinship terms for religious office are attested across Christianity, Islam and Buddhism; Latin pater in pontifex usage'],
    ['brother', 'friend', 'broadening', 'Kin terms broadening to allies is attested in Arabic, Swahili and English alike'],
    ['medicine', 'magic', 'broadening', 'Greek pharmakon covers drug, poison and spell at once'],
    ['name', 'honour', 'metonymy', 'English a good name, make a name for oneself; Hebrew shem'],
];

/**
 * Paths that change the part of speech — kept OUT of the table above.
 *
 * These are real, attested and among the most frequent shifts there are, and
 * every one of them is the first step of GRAMMATICALISATION rather than a
 * lexical change: a body part becoming an adposition, a noun becoming a
 * pronoun. The consequence is not that one word means something else, it is
 * that the language has acquired a piece of grammar.
 *
 * So `grammaticalisation.js` owns them, and the same-part-of-speech rule stands
 * here — a lexical shift that quietly turned a noun into a preposition would
 * leave the noun slot empty and the syntax unchanged, which is the worst of both.
 */
export const CATEGORY_CHANGING_PATHS = [
    ['back', 'n', 'behind', 'adp', 'English behind < be + hindan; Hausa bāya "back" is also "behind" — body-part adpositions are near-universal'],
    ['face', 'n', 'before', 'adp', 'Hebrew lifnei "before" < panim "face"; Chinese 前 qián'],
    ['head', 'n', 'self', 'pron', 'Basque buru "head" serves as the reflexive; Hausa kâi does the same'],
    ['man (human)', 'n', 'someone', 'pron', 'Latin homo "man" → French on "one, someone"; German man beside Mann'],
    ['hand', 'n', 'five', 'num', 'Numerals from the hand are among the commonest etymologies there are'],
];

/**
 * Taxonomic sets, for the two shift types that are about category size rather
 * than about a specific pair.
 *
 * A path table cannot list every specific-to-general pair — that is a schema,
 * not a fact, and the attestation belongs to the schema. Spanish *pájaro* from
 * Latin *passer* "sparrow" is the licence for all of these at once.
 */
const TAXONOMY = [
    { general: 'bird', members: ['eagle', 'crow', 'duck', 'goose', 'chicken'] },
    { general: 'animal', members: ['wolf', 'fox', 'bear', 'deer', 'hare', 'mouse', 'cat', 'horse', 'cow', 'sheep', 'goat', 'pig'] },
    { general: 'grain', members: ['wheat', 'rice', 'barley'] },
    { general: 'tree', members: ['vine', 'reed'] },
];
const TAXONOMY_NOTE = {
    broadening: 'Latin passer "sparrow" gave Spanish pájaro "bird"; Latin avis, the general word, died out. A salient member taking over the category is one of the commonest shifts there is.',
    narrowing: 'Old English deor "animal" narrowed to deer, and fugol "bird" survives as fowl for poultry. The general word contracts onto whichever member matters most locally.',
};

// ---------------------------------------------------------------------------
// Indices
// ---------------------------------------------------------------------------

function buildPaths() {
    const all = SHIFT_PATHS.map(([from, to, type, attested]) => ({ from, to, type, attested }));
    // A pair spelled out above beats the schema-level one: the explicit entry
    // carries the specific attestation, and "Old English deor → deer" is a
    // better line than the generic note about salient members.
    const explicit = new Set(all.map((p) => `${p.from}→${p.to}`));
    const add = (from, to, type, attested) => {
        if (explicit.has(`${from}→${to}`)) return;
        explicit.add(`${from}→${to}`);
        all.push({ from, to, type, attested });
    };
    for (const t of TAXONOMY) {
        for (const m of t.members) {
            add(m, t.general, 'broadening', TAXONOMY_NOTE.broadening);
            add(t.general, m, 'narrowing', TAXONOMY_NOTE.narrowing);
        }
    }
    return all;
}

export const ALL_PATHS = buildPaths();

/**
 * Every gloss that appears at either end of a licensed path.
 *
 * `swadesh.js` promotes these into its priority tier. Without that, a shorter
 * lexicon truncates the culture vocabulary — which is where most of these live —
 * and a path whose target is missing simply never fires. The table would look
 * full and do nothing, which is the failure mode that is hardest to notice.
 */
export const PATH_GLOSSES = new Set([
    ...ALL_PATHS.flatMap((p) => [p.from, p.to]),
    ...CATEGORY_CHANGING_PATHS.flatMap(([from, , to]) => [from, to]),
]);

const FROM_INDEX = new Map();
const TO_INDEX = new Map();
for (const p of ALL_PATHS) {
    if (!FROM_INDEX.has(p.from)) FROM_INDEX.set(p.from, []);
    FROM_INDEX.get(p.from).push(p);
    if (!TO_INDEX.has(p.to)) TO_INDEX.set(p.to, []);
    TO_INDEX.get(p.to).push(p);
}

/** The shifts this meaning can undergo. */
export const shiftsFrom = (gloss) => FROM_INDEX.get(gloss) || [];
/** The shifts that could deliver a word INTO this meaning. */
export const shiftsInto = (gloss) => TO_INDEX.get(gloss) || [];
/** Is this specific move licensed? Returns the path, or null. */
export function shiftBetween(fromGloss, toGloss) {
    return shiftsFrom(fromGloss).find((p) => p.to === toGloss) || null;
}

/**
 * Self-check, run by the test suite.
 *
 * A path whose endpoints are not both in the concept list can never fire, and a
 * path across parts of speech would produce a noun where a verb is wanted. Both
 * are silent failures — the table would look full and do nothing — so they are
 * asserted rather than trusted.
 */
export function validatePaths(concepts) {
    const posOf = new Map(concepts.map((c) => [c.gloss, c.pos]));
    const problems = [];
    const unreachable = [];
    const seen = new Set();
    for (const p of ALL_PATHS) {
        const key = `${p.from}→${p.to}`;
        if (seen.has(key)) problems.push(`duplicate path ${key}`);
        seen.add(key);
        if (!p.attested) problems.push(`${key} has no attested example`);
        if (p.from === p.to) problems.push(`${key} is a no-op`);
        if (!posOf.has(p.from) || !posOf.has(p.to)) { unreachable.push(key); continue; }
        if (posOf.get(p.from) !== posOf.get(p.to)) {
            problems.push(`"${p.from}" (${posOf.get(p.from)}) → "${p.to}" (${posOf.get(p.to)}) crosses part of speech — category-changing shifts belong in grammaticalisation.js`);
        }
    }
    for (const [from, fromPos, to, toPos] of CATEGORY_CHANGING_PATHS) {
        if (posOf.has(from) && posOf.get(from) !== fromPos) problems.push(`"${from}" is ${posOf.get(from)}, declared ${fromPos}`);
        if (posOf.has(to) && posOf.get(to) !== toPos) problems.push(`"${to}" is ${posOf.get(to)}, declared ${toPos}`);
        if (!posOf.has(from) || !posOf.has(to)) unreachable.push(`${from}→${to}`);
    }
    return { problems, unreachable };
}

// ---------------------------------------------------------------------------
// Free drift
// ---------------------------------------------------------------------------

/**
 * How much free drift a stretch of time produces.
 *
 * Deliberately far below the lexical replacement rate. Replacement is a change
 * of which word carries a meaning, which happens constantly; free drift is a
 * meaning being ABANDONED — the language ceasing to have a word for a concept it
 * used to name — which is much rarer and only happens to vocabulary nobody
 * needs often. 3% of eligible entries per millennium keeps it as texture rather
 * than as attrition.
 */
export function driftCount(eligible, years, rate = 1) {
    return Math.max(0, Math.round(eligible * 0.03 * (years / 1000) * rate));
}

/**
 * Plan the free semantic drifts for one edge.
 *
 * Restricted to non-core, lower-frequency entries, and only where the target
 * meaning's own word is NOT itself core — otherwise this would quietly become a
 * second, unaudited replacement mechanism operating on the comparative set.
 *
 * Returns dated events for the ChangeSet, exactly like sound changes and
 * replacements: pinned, deterministic, re-timeable, and readable in the log.
 */
export function planShifts(parentState, rng, { from, to, rate = 1, count } = {}) {
    const entries = parentState.entries || [];
    const live = entries.filter((e) => !e.retired && !e.paradigm);
    /**
     * Only simplex, non-core words drift freely. A derivative's gloss is
     * generated ("one who drinks") rather than a concept, so it has no path;
     * and a core meaning must not be abandoned, or the comparative set would
     * acquire a hole no lexicostatistical count could see.
     */
    const eligible = live.filter((e) => !e.core && !e.derivedFrom && shiftsFrom(e.gloss).length);
    if (!eligible.length) return [];

    const n = count ?? driftCount(eligible.length, Math.max(0, (to ?? from) - from), rate);
    if (n <= 0) return [];

    /**
     * Who currently holds each meaning — over EVERY live entry, derivatives
     * included.
     *
     * Restricting this to simplex words was a real defect: replacement's
     * derivative strategy routinely hands a core meaning to a derived form, and
     * a derivative holding "tree" made the slot look empty. Drift then moved a
     * word for "reed" into it, quietly evicting a core meaning by the exact
     * route the core guard exists to prevent.
     */
    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);

    const events = [];
    const used = new Set();
    const span = Math.max(1, (to ?? from) - from);

    for (let i = 0; i < n * 8 && events.length < n; i++) {
        /**
         * Weighted against frequency, like everything else that destroys
         * information here. A common word's meaning is reinforced every time
         * anyone uses it; a rare one's is not, which is why obsolescent
         * vocabulary drifts and "eye" does not.
         */
        const entry = rng.pickWeighted(eligible, (e) => (used.has(e.id) ? 0 : Math.max(0, 1 - zipfWeight(e.rank) * 2.2)));
        if (!entry || used.has(entry.id)) continue;

        // Only into a slot whose current occupant is not core vocabulary: this
        // mechanism must not touch the comparative set.
        const options = shiftsFrom(entry.gloss).filter((p) => {
            const holder = byGloss.get(p.to);
            return !holder || (!holder.core && holder.id !== entry.id && !used.has(holder.id));
        });
        if (!options.length) continue;

        const path = rng.pick(options);
        used.add(entry.id);
        const displaced = byGloss.get(path.to);
        if (displaced) used.add(displaced.id);

        events.push({
            year: Math.round(from + ((events.length + 0.5) / n) * span),
            id: entry.id,
            fromGloss: entry.gloss,
            toGloss: path.to,
            type: path.type,
            attested: path.attested,
            displaced: displaced ? displaced.id : null,
        });
    }
    return events;
}

/**
 * Meaning shifts into the wider vocabulary (lexicon/wider.js WIDER_SHIFTS):
 * for each attested path whose two meanings the language has, a chance of
 * about one in eleven per thousand years (the older list's drift rate), each
 * on a stream of its own (`rngFor(path)`), so a path added or taken away
 * moves no other. The drifting word must not be core, and the word it lands
 * on is a wider one, which gives way.
 */
export function planWiderShifts(state, rngFor, paths, { from, to, rate = 1 } = {}) {
    const live = (state.entries || []).filter((e) => !e.retired && !e.paradigm);
    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    const years = Math.max(0, (to ?? from) - from);
    const events = [];
    const used = new Set();
    for (const [a, b, type, attested] of paths) {
        const A = byGloss.get(a), B = byGloss.get(b);
        if (!A || !B || A.core || !B.wider || used.has(A.id) || used.has(B.id) || A.derivedFrom) continue;
        const rng = rngFor(`${a}>${b}`);
        if (!rng.bool(1 - Math.exp(-0.09 * rate * (years / 1000)))) continue;
        used.add(A.id); used.add(B.id);
        events.push({ year: Math.round(from + years * rng.float(0.15, 0.85)), id: A.id, fromGloss: a, toGloss: b, type, attested, displaced: B.id, wider: true });
    }
    return events.sort((x, y) => x.year - y.year);
}

/**
 * Apply the drifts to a lexicon.
 *
 * The entry keeps a `glossHistory` — every meaning it has ever carried, with the
 * year and the type of each move. That chain is the display: *"tʰaru — 'enemy',
 * formerly 'stranger' (pejoration, c. 340), formerly 'guest' (pejoration, c.
 * −900)"* reads like an etymological dictionary, which is the whole objective.
 */
export function applyShifts(entries, events) {
    if (!events?.length) return entries;
    const index = new Map(entries.map((e, i) => [e.id, i]));
    const out = entries.slice();

    for (const ev of events) {
        const i = index.get(ev.id);
        if (i == null) continue;
        const e = out[i];
        if (e.gloss !== ev.fromGloss) continue;   // upstream drift already moved it

        const moved = {
            ...e,
            gloss: ev.toGloss,
            glossHistory: [...(e.glossHistory || []), {
                gloss: ev.fromGloss, until: ev.year, type: ev.type, attested: ev.attested,
            }],
            shifted: { from: ev.fromGloss, type: ev.type, year: ev.year, attested: ev.attested },
        };
        /**
         * POLYSEMY FIRST. A word that takes on a new sense keeps its old one
         * until some other word has taken that over: English "go" came to mean
         * "die" and still means "go". Moved outright, the old meaning was left
         * with no word, and every living language lacked about 13 common ones
         * (half of a sample had no word for "go", others for "brother",
         * "house", "take", "sweet"), which the translator met at once. Where
         * nothing else carries it, the word stays as it was and a second entry
         * of the same word takes the new sense (`sameWordAs`, sharing its
         * etymology); the old sense goes only through replacement, as on
         * Earth.
         */
        let landed = ev.id;
        const otherCarrier = out.some((x, k) => k !== i && !x.retired && !x.paradigm && x.gloss === ev.fromGloss);
        if (otherCarrier) out[i] = moved;
        else {
            const id = `${e.id}~${ev.toGloss}`;
            if (index.has(id)) continue;
            // (a sense taken in the wider vocabulary, lexicon/wider.js, is of it)
            out.push({ ...moved, id, sameWordAs: e.id, core: false, ...(ev.wider ? { wider: true } : {}) });
            index.set(id, out.length - 1);
            landed = id;
        }

        /**
         * The word the drifter landed on top of is RETIRED, not deleted — same
         * principle as replacement. A word displaced from its meaning usually
         * narrows or survives in a fixed phrase rather than vanishing outright.
         */
        if (ev.displaced != null) {
            const j = index.get(ev.displaced);
            if (j != null && !out[j].retired) {
                out[j] = { ...out[j], gloss: `${ev.toGloss} (archaic)`, retired: true, retiredGloss: ev.toGloss, replacedBy: landed };
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// The payoff: false friends
// ---------------------------------------------------------------------------

/**
 * Cognate pairs whose meanings have diverged.
 *
 * Same etymon in both languages, different gloss — which is what a false friend
 * IS. The forms need not still match; *Gift* and *gift* happen to, but *guest*
 * and *hostile* are the same word too.
 *
 * This is the measurement that says whether the semantic layer is doing
 * anything, and it is also the most enjoyable thing the app can show.
 */
export function falseFriends(stateA, stateB, { limit = 40 } = {}) {
    // by WORD: a second sense of a word (sameWordAs) is the same word
    const b = new Map();
    for (const e of stateB.entries) {
        if (e.retired || e.paradigm) continue;
        const k = e.sameWordAs ?? e.id;
        if (!b.has(k)) b.set(k, []);
        b.get(k).push(e);
    }

    const out = [];
    for (const ea of stateA.entries) {
        if (ea.retired || ea.paradigm) continue;
        const key = ea.sameWordAs ?? ea.id;
        const senses = b.get(key);
        if (!senses || senses.some((x) => x.gloss === ea.gloss)) continue;
        const eb = senses[0];
        out.push({
            id: key,
            a: { ipa: ea.ipa, gloss: ea.gloss, shifted: ea.shifted || null },
            b: { ipa: eb.ipa, gloss: eb.gloss, shifted: eb.shifted || null },
            // A pair whose forms are still similar is the striking kind.
            formsMatch: ea.ipa === eb.ipa,
        });
    }
    // The ones where the form still matches are the ones worth showing first.
    out.sort((x, y) => (y.formsMatch ? 1 : 0) - (x.formsMatch ? 1 : 0));
    return out.slice(0, limit);
}

/** Readable log for the panel and the CLI. */
export function formatShifts(events) {
    if (!events?.length) return '';
    return events.map((ev) => (
        `  c.${String(ev.year).padStart(5)}  "${ev.fromGloss}" → "${ev.toGloss}"   (${ev.type})`
    )).join('\n');
}
