/**
 * Numeral classifiers (17 Oct 2026, DJ: "I do want these to be incredibly
 * complicated like languages").
 *
 * Mandarin cannot say "three books". It says sān běn shū, "three CLF book",
 * where běn, once "root, stem", is the word for counting bound volumes, and
 * sān tiáo yú, "three CLF fish", where tiáo, once "twig", counts long things.
 * About one language in five on Earth must put such a word between a numeral
 * and its noun, and about one in six may (WALS 55A, Gil: 78 obligatory, 62
 * optional, 260 without, of 400). They cluster in the isolating languages of
 * East and Southeast Asia (Chinese, Thai, Vietnamese, Burmese, Hmong), but
 * agglutinative Japanese has them as endings on the numeral (san-bon, "three
 * long things"), as do the Mayan and Micronesian languages, and Turkish (üç
 * tane elma) and Persian (se tā sib) have one optional general one.
 *
 * WHERE THEY COME FROM. A classifier is a noun bleached into a counting word:
 * "person" for people (Thai khon, Malay orang), "body", "tail" or "head" for
 * animals (Thai tua, Malay ekor, Mandarin tóu), "twig", "root" or "stick" for
 * long things (Mandarin tiáo and gēn, Japanese hon), "leaf" for flat things
 * (Thai bai), "seed" or "grain" for small round ones (Malay biji, Mandarin
 * lì), "tree" for plants, "back" or "seat" for buildings (Thai lăng, Mandarin
 * zuò). A system starts small, usually with one general word used to count
 * discrete things ("fruit", "grain", "thing": Malay buah, Turkish tane,
 * Vietnamese cái), becomes obligatory, and grows: Old Chinese mostly counted
 * with the bare numeral, Han Chinese began to add a word, and by Middle
 * Chinese there were dozens. It also erodes. The general classifier spreads
 * at the expense of the specific ones (colloquial Mandarin says gè for nearly
 * anything), a specific one falls out of use, and now and then a language
 * gives the system up.
 *
 * WHAT GOES WITH THEM. Classifiers go with nouns that do not mark the plural
 * (Greenberg 1972; Sanches): a language with a plural ending on every noun
 * rarely needs them, and one that has them leaves the noun bare after a
 * numeral (Japanese hon san-satsu, "book three-CLF", never *hon-tachi). Few
 * languages have both classifiers and gender. Mandarin and Thai use them with
 * "this" and "that" as well (zhè běn shū, "this CLF book"); Japanese does not;
 * and in Cantonese the classifier alone, without a numeral, makes a noun
 * definite (zek3 gau2, "CLF dog", "the dog").
 *
 * WHICH NOUN TAKES WHICH. By meaning, with the borderline nouns settled
 * differently in each language: a fish is an animal in Thai (tua) and a long
 * thing in Mandarin (tiáo); a chair a tool in Mandarin (bǎ, "grasp") and an
 * animal-bodied thing in Thai (tua, it has legs). Each system draws its own
 * choices for the borderline nouns when it arises and passes them down; as
 * the general classifier spreads, the nouns at a class's edge go over to it
 * first and its core last. Days, nights, years and the like are units in
 * themselves and are counted bare (Mandarin sān tiān, "three days").
 *
 * The classifier words are lexicon entries (pos 'clf'), so sound change wears
 * them like any word and they drift apart from the nouns they came from, as
 * gè no longer means "bamboo stalk". Like a paradigm cell they carry
 * `paradigm`, the engine's mark of grammar, so replacement, drift, therapy and
 * the rest pass them by. The system's settings sit in
 * paradigm.categories.classifiers.
 */

import { wordToIpa } from '../features.js';
import { syllabify } from '../phonology/phonotactics.js';
import { ANIMATE_GLOSSES } from './gender.js';

/**
 * The classes, the nouns each grows from (commonest path first) and how often
 * a system has one (Allan 1977; Aikhenvald 2000: animacy first, then shape,
 * then function).
 */
export const CLASSIFIER_CLASSES = {
    GEN: { label: 'general', sources: ['thing', 'piece', 'fruit', 'grain'], weight: 0,
        attested: 'Mandarin 个 gè, once "bamboo stalk"; Malay buah "fruit"; Turkish tane "grain"; Vietnamese cái "thing"' },
    HUM: { label: 'people', sources: ['person', 'man (male)', 'mouth', 'name'], weight: 1,
        attested: 'Thai khon and Malay orang "person"; Mandarin 口 kǒu "mouth" for the members of a household, 名 míng "name"' },
    ANI: { label: 'animals', sources: ['body', 'tail', 'head', 'animal'], weight: 0.9,
        attested: 'Thai tua "body", Malay ekor "tail", Mandarin 头 tóu "head" for cattle and pigs' },
    LONG: { label: 'long things', sources: ['branch', 'stick', 'root', 'rope'], weight: 0.85,
        attested: 'Mandarin 条 tiáo "twig" and 根 gēn "root", Japanese 本 hon "root", Malay batang "trunk"' },
    FLAT: { label: 'flat things', sources: ['leaf', 'skin', 'bark', 'cloth'], weight: 0.75,
        attested: 'Thai bai "leaf", Malay helai "strand, sheet", Mandarin 张 zhāng "spread out" and 片 piàn "slice"' },
    ROUND: { label: 'small round things', sources: ['seed', 'grain', 'eye', 'egg', 'stone'], weight: 0.7,
        attested: 'Malay biji "seed", Mandarin 颗 kē "kernel" and 粒 lì "grain", Thai lûuk "child, fruit"' },
    PLANT: { label: 'plants', sources: ['tree', 'root', 'grass'], weight: 0.45,
        attested: 'Mandarin 棵 kē, Thai tôn "trunk", Malay pohon "tree"' },
    TOOL: { label: 'tools and vehicles', sources: ['hand', 'hold', 'stick'], weight: 0.4,
        attested: 'Mandarin 把 bǎ "grasp" for knives, chairs and keys; Thai khan "handle, stalk" for carts, spoons and umbrellas' },
    BLD: { label: 'buildings and places', sources: ['back', 'house', 'roof'], weight: 0.35,
        attested: 'Thai lăng "back" for houses; Mandarin 座 zuò "seat" for buildings, bridges and mountains' },
};
export const CLASSIFIER_LABELS = Object.fromEntries(Object.entries(CLASSIFIER_CLASSES).map(([k, v]) => [k, v.label]));

/** How a system's use is spoken of. */
export const CLASSIFIER_USE = {
    optional: 'optional, as Turkish tane and Persian tā',
    obligatory: 'obligatory, as in Mandarin, Thai and Japanese',
};

/**
 * How likely a family is to start with a system, by its type (proto stage):
 * the isolating languages of East and Southeast Asia nearly all have one,
 * those of West Africa (Yoruba, Ewe) mostly not; agglutinative Japanese,
 * Korean and Mayan have obligatory ones and the Turkic languages an optional
 * tane, Finnish none; among the fusional languages WALS codes (Indo-European
 * and Afro-Asiatic), about three in four have none, a fifth an optional one
 * (Persian, Armenian, Romani) and a few an obligatory one (Bengali, Assamese).
 * Gender makes one rarer: Persian and Armenian have no gender.
 */
export const CLASSIFIER_RATES = {
    isolating: { none: 0.3, optional: 0.2, obligatory: 0.5 },
    agglutinative: { none: 0.72, optional: 0.14, obligatory: 0.14 },
    fusional: { none: 0.78, optional: 0.18, obligatory: 0.04 },
    polysynthetic: { none: 0.84, optional: 0.08, obligatory: 0.08 },
};
/** How often the classifier is an ending on the numeral (Japanese san-bon), by type. */
const BOUND_RATE = { isolating: 0, agglutinative: 0.5, polysynthetic: 0.6, fusional: 0.3 };

// --- which noun takes which ---------------------------------------------------------

const COLLECTIVE = new Set(['army', 'crowd', 'tribe', 'clan', 'people', 'family']);
const LONG_NOUNS = new Set(['stick', 'rope', 'rope (thick)', 'spear', 'road', 'river', 'path', 'arrow', 'hair', 'thread', 'stream',
    'street', 'snake', 'worm', 'tail', 'branch', 'root', 'bone', 'leg', 'arm', 'finger', 'neck', 'tongue', 'pole', 'belt', 'vine', 'line']);
const FLAT_NOUNS = new Set(['leaf', 'skin', 'bark', 'cloth', 'paper', 'letter', 'picture', 'map', 'blanket', 'feather', 'wing',
    'board', 'plate', 'page', 'face', 'door', 'mat', 'sail', 'shield']);
const ROUND_NOUNS = new Set(['egg', 'fruit', 'stone', 'eye', 'seed', 'grain', 'nut', 'berry', 'moon', 'sun', 'star', 'heart',
    'tooth', 'ball', 'pearl', 'drop', 'bead', 'bean', 'pea', 'apple', 'wheel', 'cup', 'pot', 'bowl', 'basket', 'bag', 'box', 'jar']);
const PLANT_NOUNS = new Set(['tree', 'grass', 'flower', 'plant', 'bush', 'vine', 'bamboo', 'reed', 'crop', 'forest']);
const TOOL_NOUNS = new Set(['knife', 'axe', 'sword', 'bow', 'hammer', 'saw', 'plough', 'sickle', 'needle', 'key', 'spoon', 'chair',
    'boat', 'ship', 'cart', 'wagon', 'net', 'umbrella', 'fan', 'gun', 'pen', 'brush', 'comb', 'drum', 'weapon', 'tool', 'oar', 'loom']);
const BUILDING_NOUNS = new Set(['house', 'village', 'city', 'town', 'temple', 'wall', 'bridge', 'tower', 'palace', 'castle', 'mountain',
    'hill', 'island', 'school', 'shop', 'market', 'room', 'home', 'tomb', 'fort', 'hut', 'tent', 'well', 'harbour', 'country']);
/** Two homes, the commoner first: a table is flat in Mandarin (zhāng) and counted like an animal, a thing with legs, in Thai (tua). */
const BORDERLINE = {
    fish: ['ANI', 'LONG'], snake: ['LONG', 'ANI'], worm: ['LONG', 'ANI'], eel: ['LONG', 'ANI'],
    table: ['FLAT', 'ANI'], bed: ['FLAT', 'ANI'], chair: ['TOOL', 'ANI'], tree: ['PLANT', 'LONG'], spear: ['LONG', 'TOOL'],
    bow: ['TOOL', 'LONG'], boat: ['TOOL', 'LONG'], ship: ['TOOL', 'BLD'], river: ['LONG', 'BLD'], road: ['LONG', 'BLD'],
    mountain: ['BLD', 'ROUND'], hill: ['BLD', 'ROUND'], island: ['BLD', 'ROUND'], cup: ['ROUND', 'TOOL'], pot: ['ROUND', 'TOOL'],
    door: ['FLAT', 'TOOL'], wheel: ['ROUND', 'TOOL'], letter: ['FLAT', 'ROUND'], head: ['ROUND', 'ANI'],
};
/** Units in themselves, counted without a classifier (Mandarin sān tiān, "three days"). */
const UNITS = new Set(['day', 'night', 'year', 'month', 'week', 'hour', 'moment', 'season', 'winter', 'summer']);

/**
 * The classes a noun could take, best first. A compound counts by its head,
 * a diminutive by its base, an agent noun as a person, a tool noun as a tool.
 */
export function classifierCandidates(entry, byId, depth = 0) {
    if (!entry || entry.pos !== 'n' || depth > 4) return [];
    if (entry.compoundOf?.head && byId) {
        const head = byId.get(entry.compoundOf.head);
        if (head && head !== entry && head.pos === 'n') return classifierCandidates(head, byId, depth + 1);
    }
    const affix = entry.derivedFrom?.affix;
    if (affix === 'AGENT') return ['HUM'];
    if (affix === 'INSTRUMENT') return ['TOOL'];
    if (affix === 'PLACE') return ['BLD'];
    if (affix && byId) {
        const base = byId.get(entry.derivedFrom.base);
        if (base && base !== entry && base.pos === 'n' && ['DIM', 'AUG', 'COLL'].includes(affix)) return classifierCandidates(base, byId, depth + 1);
    }
    const g = entry.gloss;
    if (UNITS.has(g)) return ['SELF'];
    if (BORDERLINE[g]) return BORDERLINE[g];
    if (COLLECTIVE.has(g)) return [];
    if (entry.domain === 'person' || entry.domain === 'kinship' || ANIMATE_GLOSSES.has(g)) return ['HUM'];
    if (entry.domain === 'animal') return ['ANI'];
    if (LONG_NOUNS.has(g)) return ['LONG'];
    if (FLAT_NOUNS.has(g)) return ['FLAT'];
    if (ROUND_NOUNS.has(g)) return ['ROUND'];
    if (PLANT_NOUNS.has(g) || entry.domain === 'plant') return ['PLANT'];
    if (TOOL_NOUNS.has(g)) return ['TOOL'];
    if (BUILDING_NOUNS.has(g)) return ['BLD'];
    return [];
}

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const unit = (s) => (hash(s) % 100000) / 100000;

/**
 * The class a noun is counted with in a system: a class the system has,
 * 'GEN' for the general classifier, 'SELF' for a noun counted bare, or null
 * where there is no system.
 */
export function classifierOf(entry, system, byId) {
    if (!system || !entry || entry.pos !== 'n') return null;
    const cands = classifierCandidates(entry, byId);
    if (cands[0] === 'SELF') return 'SELF';
    // this system's own choice for a borderline noun, inherited with the system
    const order = cands.length > 1 && unit(`${system.seed}|pick|${entry.id}`) < 0.35 ? [cands[1], cands[0], ...cands.slice(2)] : cands;
    for (let i = 0; i < order.length; i++) {
        const c = order[i];
        if (!system.classes.includes(c)) continue;
        // the general classifier takes a class's edge first and its core last
        const level = system.erosion?.[c] ?? 0;
        if (unit(`${system.seed}|erode|${entry.id}|${c}`) < (i === 0 ? level * 0.6 : level)) return 'GEN';
        return c;
    }
    return 'GEN';
}

/** The classifier word for a class, where the language has one. */
export function classifierWord(entries, cls) {
    return entries.find((e) => e.classifier === cls && !e.retired) || null;
}

/** A noun's first syllable: what a classifier keeps once it is an ending (Japanese -hon). */
function firstSyllable(form, pt) {
    const s = syllabify(form, pt)[0];
    const out = s ? [...(s.onset || []), ...(s.nucleus || []), ...(s.coda || [])] : form;
    return out.length ? out : form;
}

/** A classifier word made from a noun. */
export function makeClassifier(cls, source, phonotactics, { bound = false, year = null } = {}) {
    const form = bound ? firstSyllable(source.form, phonotactics) : source.form;
    return {
        id: `clf:${cls}:${source.id}`,
        form,
        ipa: wordToIpa(form),
        gloss: `classifier: ${CLASSIFIER_CLASSES[cls].label}`,
        pos: 'clf',
        domain: 'grammar',
        core: false,
        rank: Math.max(1, source.rank ?? 1),
        zipf: 0,
        syllables: syllabify(form, phonotactics).length,
        irregular: false,
        derivedFrom: null,
        classifier: cls,
        // grammar, not vocabulary: every lexical process passes it by
        paradigm: { cls: 'clf', cell: `CLF.${cls}`, stem: source.id, stemGloss: source.gloss },
        grammaticalisedFrom: {
            lexeme: source.id, gloss: source.gloss, year, cline: `classifier-${cls}`,
            attested: CLASSIFIER_CLASSES[cls].attested,
        },
    };
}

// --- the proto-language ------------------------------------------------------------------

/**
 * The proto's use of classifiers, drawn by the family's type and gender
 * (character.js), or as lang-config declares: 'none', 'optional' or
 * 'obligatory'. Returns the spec buildClassifierSystem realises, or null.
 */
export function drawClassifierSpec(rng, type, gender, declared = null) {
    let use = declared;
    let reason = 'set in lang-config';
    if (!use) {
        const W = { ...(CLASSIFIER_RATES[type] || CLASSIFIER_RATES.agglutinative) };
        if (gender && gender !== 'none') { W.optional *= 0.15; W.obligatory *= 0.15; }
        use = rng.pickWeighted(Object.keys(W), (k) => W[k]);
        reason = use === 'none'
            ? 'no numeral classifiers, as about two languages in three'
            : `${use} numeral classifiers, drawn at Earth's rates for a${type === 'agglutinative' ? 'n' : ''} ${type} language${gender && gender !== 'none' ? ' with gender' : ''}`;
    }
    // drawn whatever was declared, so a declaration changes nothing else
    const order = rng.bool(0.85) ? 'num-clf' : 'clf-num';
    const bound = rng.bool(BOUND_RATE[type] ?? 0.3);
    const withDem = rng.bool(0.65);
    const definite = rng.bool(0.12);
    const count = use === 'obligatory' ? rng.int(3, 8) : (rng.bool(0.45) ? 1 : 0);
    if (use === 'none') return { spec: null, reason };
    return {
        spec: { use, order, bound, withDem: use === 'obligatory' && !bound && withDem, definite: use === 'obligatory' && !bound && withDem && definite, count },
        reason,
    };
}

/** The noun a class grows from: the commoner path first, a rarer one now and then. */
function pickSource(cls, byGloss, used, rng) {
    const avail = CLASSIFIER_CLASSES[cls].sources.map((g) => byGloss.get(g)).filter((e) => e && !used.has(e.id) && e.form?.length);
    if (!avail.length) return null;
    const e = rng.pickWeighted(avail, (x) => 1 / (1 + avail.indexOf(x)) ** 1.5);
    used.add(e.id);
    return e;
}

/** The live lexemes a classifier can grow from, by meaning. */
function sourcesOf(entries) {
    const byGloss = new Map();
    for (const e of entries) {
        if (e.retired || e.paradigm || !(e.pos === 'n' || e.pos === 'v')) continue;
        if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    }
    return byGloss;
}

/** Build the proto's classifier words and system from its spec. */
export function buildClassifierSystem(entries, spec, phonotactics, rng, { seed, year = null } = {}) {
    if (!spec) return { system: null, entries: [] };
    const byGloss = sourcesOf(entries);
    const used = new Set();
    const gen = pickSource('GEN', byGloss, used, rng);
    if (!gen) return { system: null, entries: [] };
    const made = [makeClassifier('GEN', gen, phonotactics, { bound: spec.bound, year })];
    const pool = Object.keys(CLASSIFIER_CLASSES).filter((c) => c !== 'GEN');
    for (let i = 0; i < spec.count && pool.length; i++) {
        const cls = spec.use === 'optional' ? 'HUM' : rng.pickWeighted(pool, (c) => CLASSIFIER_CLASSES[c].weight);
        pool.splice(pool.indexOf(cls), 1);
        const src = pickSource(cls, byGloss, used, rng);
        if (src) made.push(makeClassifier(cls, src, phonotactics, { bound: spec.bound, year }));
    }
    return {
        system: {
            use: spec.use, order: spec.order, bound: spec.bound, withDem: spec.withDem, definite: spec.definite,
            classes: made.map((m) => m.classifier), erosion: {}, seed, since: year,
        },
        entries: made,
    };
}

// --- change --------------------------------------------------------------------------------

/** Per thousand years, scaled by the branch rate. */
const RISE = { isolating: 0.22, agglutinative: 0.035, polysynthetic: 0.03, fusional: 0.012 };
const TO_OBLIGATORY = { isolating: 0.18, agglutinative: 0.08, polysynthetic: 0.08, fusional: 0.04 };
const TO_OPTIONAL = 0.06;
const LOSE_OPTIONAL = 0.1;
const GROW = { obligatory: 1, optional: 0.2 };
const CLASS_LOSS = 0.05;
const MAX_CLASSES = 9;
const STEP = 250;

/**
 * Plan a lifetime's changes to the classifier system, from the language as it
 * was founded: a system arising, turning obligatory, gaining and losing
 * classes, the general classifier spreading, the classifier coming into use
 * with "this" and "that" or as a definite, fusing onto the numeral, or the
 * system fading. Dated events, in order, for the changeset.
 */
export function planClassifiers(state, rng, { from, to, rate = 1, key = '' } = {}) {
    const cats = state.paradigm?.categories;
    if (!cats) return [];
    const years = Math.max(0, (to ?? from) - from);
    if (years <= 0) return [];
    const type = cats.type || 'agglutinative';
    const byGloss = sourcesOf(state.entries || []);
    const used = new Set((state.entries || []).filter((e) => e.classifier && !e.retired).map((e) => e.grammaticalisedFrom?.lexeme));
    let sys = cats.classifiers ? { ...cats.classifiers, classes: [...cats.classifiers.classes] } : null;
    const genders = (cats.genders || []).length > 0;
    const plural = type !== 'isolating' && (cats.numbers || []).some((n) => n !== 'SG');
    const events = [];
    let erosion = {};
    const flush = (year) => {
        const amounts = Object.fromEntries(Object.entries(erosion).filter(([c, a]) => a > 0.005 && sys?.classes.includes(c)).map(([c, a]) => [c, +a.toFixed(3)]));
        if (Object.keys(amounts).length) events.push({ kind: 'classifier', step: 'erosion', year, amounts, note: 'the general classifier spread to nouns that had taken a specific one' });
        erosion = {};
    };

    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        if (!sys) {
            const p = (RISE[type] ?? 0.03) * k * (genders ? 0.15 : 1) * (plural ? 0.5 : 1);
            if (!rng.bool(p)) continue;
            const classes = [];
            const gen = pickSource('GEN', byGloss, used, rng);
            if (!gen) continue;
            classes.push({ cls: 'GEN', sourceId: gen.id, sourceGloss: gen.gloss });
            if (rng.bool(0.45)) {
                const h = pickSource('HUM', byGloss, used, rng);
                if (h) classes.push({ cls: 'HUM', sourceId: h.id, sourceGloss: h.gloss });
            }
            const order = rng.bool(0.85) ? 'num-clf' : 'clf-num';
            const bound = rng.bool((BOUND_RATE[type] ?? 0.3) * 0.5);
            const seed = `${key}@${year}`;
            events.push({
                kind: 'classifier', step: 'rise', year, use: 'optional', order, bound, seed, classes,
                note: `"${gen.gloss}" came into use as a word for counting things${classes.length > 1 ? `, and "${classes[1].sourceGloss}" for counting people` : ''}`,
                attested: 'Turkish tane (from "grain") and Persian tā are optional general classifiers; Han Chinese began counting with such words where Old Chinese mostly had not',
            });
            sys = { use: 'optional', order, bound, withDem: false, definite: false, classes: classes.map((c) => c.cls), erosion: {}, seed, since: year };
            continue;
        }
        const specific = sys.classes.filter((c) => c !== 'GEN');
        if (sys.use === 'optional') {
            if (rng.bool((TO_OBLIGATORY[type] ?? 0.2) * k)) {
                events.push({ kind: 'classifier', step: 'obligatory', year, note: 'a numeral could no longer stand before a noun without its classifier',
                    attested: 'Chinese classifiers, occasional in Old Chinese, were obligatory by Middle Chinese; Bengali -ṭa and -jon, optional in Middle Bengali, are close to obligatory now' });
                sys.use = 'obligatory';
            } else if (rng.bool(LOSE_OPTIONAL * k * (specific.length ? 0.5 : 1.5))) {
                flush(year);
                events.push({ kind: 'classifier', step: 'lost', year, note: 'counting words fell out of use; numerals stand before the bare noun again',
                    attested: 'an optional general classifier can simply be dropped, as Hungarian darab and English "head" (of cattle) are a choice, not a rule' });
                sys = null;
                continue;
            }
        } else if (rng.bool(TO_OPTIONAL * k)) {
            events.push({ kind: 'classifier', step: 'optional', year, note: 'classifiers became a choice after numerals rather than a rule',
                attested: 'colloquial Indonesian often counts without the classifiers buah and ekor that formal Malay keeps' });
            sys.use = 'optional';
        }
        // a new class: a noun of the right shape or kind bleaches into a counting word
        const missing = Object.keys(CLASSIFIER_CLASSES).filter((c) => c !== 'GEN' && !sys.classes.includes(c));
        if (missing.length && sys.classes.length < MAX_CLASSES && rng.bool((GROW[sys.use] ?? 0.1) * k)) {
            const cls = rng.pickWeighted(missing, (c) => CLASSIFIER_CLASSES[c].weight);
            const src = pickSource(cls, byGloss, used, rng);
            if (src) {
                events.push({
                    kind: 'classifier', step: 'new-class', year, cls, sourceId: src.id, sourceGloss: src.gloss,
                    note: `"${src.gloss}" became the classifier for ${CLASSIFIER_CLASSES[cls].label}`,
                    attested: CLASSIFIER_CLASSES[cls].attested,
                });
                sys.classes.push(cls);
            }
        }
        // a specific class wears out, the likelier the further the general one has spread
        if (specific.length) {
            const worn = specific.reduce((s, c) => s + (sys.erosion?.[c] ?? 0) + (erosion[c] ?? 0), 0) / specific.length;
            if (rng.bool(CLASS_LOSS * specific.length * k * (sys.use === 'optional' ? 1.5 : 1) * (1 + 3 * worn))) {
                const cls = rng.pick(specific);
                events.push({ kind: 'classifier', step: 'class-lost', year, cls,
                    note: `the classifier for ${CLASSIFIER_CLASSES[cls].label} fell out of use; its nouns are counted with the general one`,
                    attested: 'colloquial Mandarin counts with gè much that the written language counts with a specific classifier' });
                sys.classes = sys.classes.filter((c) => c !== cls);
                delete erosion[cls];
            }
        }
        for (const c of sys.classes) if (c !== 'GEN') erosion[c] = (erosion[c] ?? 0) + rng.float(0, 0.12) * k;
        if (sys.use === 'obligatory' && !sys.bound) {
            if (!sys.withDem && rng.bool(0.2 * k)) {
                events.push({ kind: 'classifier', step: 'with-dem', year, value: true, note: 'classifiers came into use with "this" and "that" as well as with numerals',
                    attested: 'Mandarin zhè běn shū, "this CLF book"' });
                sys.withDem = true;
            } else if (sys.withDem && !sys.definite && !cats.definite && !cats.articles?.definite && rng.bool(0.06 * k)) {
                events.push({ kind: 'classifier', step: 'definite', year, value: true, note: 'a classifier alone before a noun came to make it definite',
                    attested: 'Cantonese zek3 gau2, "CLF dog", is "the dog"; so in Hmong and Wenzhounese' });
                sys.definite = true;
            }
        }
        if (!sys.bound && type !== 'isolating' && rng.bool(0.08 * k)) {
            events.push({ kind: 'classifier', step: 'bound', year, note: 'the classifiers fused onto the numerals as endings',
                attested: 'Japanese san-bon, "three long things", and the Mayan numeral classifiers are endings on the numeral' });
            sys.bound = true;
            sys.withDem = false;
            sys.definite = false;
        }
        if ((t / STEP) % 2 === 1) flush(year);
    }
    if (sys) flush(Math.round(from + years * 0.95));
    return events;
}

/**
 * Apply a lifetime's classifier events to the evolved lexicon and the
 * category list. New classifier words are made from their source nouns as
 * those now stand, after this lifetime's sound changes, as a grammaticalised
 * cell is (grammaticalisation.js).
 */
export function applyClassifiers(entries, events, { phonotactics, categories } = {}) {
    if (!events?.length) return { entries, applied: [], categories: null };
    let out = entries;
    let sys = categories?.classifiers
        ? { ...categories.classifiers, classes: [...categories.classifiers.classes], erosion: { ...(categories.classifiers.erosion || {}) } }
        : null;
    const applied = [];
    const find = (id) => out.find((e) => e.id === id) || null;
    for (const ev of events) {
        if (ev.step === 'rise') {
            if (sys) continue;
            const made = [];
            for (const c of ev.classes || []) {
                const src = find(c.sourceId);
                if (src?.form?.length) made.push(makeClassifier(c.cls, src, phonotactics, { bound: ev.bound, year: ev.year }));
            }
            if (!made.some((m) => m.classifier === 'GEN')) continue;
            out = [...out, ...made];
            sys = { use: ev.use, order: ev.order, bound: ev.bound, withDem: false, definite: false, classes: made.map((m) => m.classifier), erosion: {}, seed: ev.seed, since: ev.year };
        } else if (!sys) {
            continue;
        } else if (ev.step === 'new-class') {
            if (sys.classes.includes(ev.cls)) continue;
            const src = find(ev.sourceId);
            if (!src?.form?.length) continue;
            out = [...out, makeClassifier(ev.cls, src, phonotactics, { bound: sys.bound, year: ev.year })];
            sys.classes = [...sys.classes, ev.cls];
        } else if (ev.step === 'class-lost') {
            if (ev.cls === 'GEN' || !sys.classes.includes(ev.cls)) continue;
            out = out.filter((e) => e.classifier !== ev.cls);
            sys.classes = sys.classes.filter((c) => c !== ev.cls);
            delete sys.erosion[ev.cls];
        } else if (ev.step === 'erosion') {
            for (const [c, a] of Object.entries(ev.amounts || {})) if (sys.classes.includes(c)) sys.erosion[c] = Math.min(0.7, +((sys.erosion[c] || 0) + a).toFixed(3));
        } else if (ev.step === 'obligatory' || ev.step === 'optional') {
            sys.use = ev.step;
        } else if (ev.step === 'lost') {
            out = out.filter((e) => !e.classifier);
            sys = null;
        } else if (ev.step === 'with-dem') {
            sys.withDem = !!ev.value;
        } else if (ev.step === 'definite') {
            sys.definite = !!ev.value;
        } else if (ev.step === 'bound') {
            sys.bound = true; sys.withDem = false; sys.definite = false;
            out = out.map((e) => {
                if (!e.classifier) return e;
                const form = firstSyllable(e.form, phonotactics);
                return form.length === e.form.length ? e : { ...e, form, ipa: wordToIpa(form), syllables: 1 };
            });
        } else continue;
        applied.push(ev);
    }
    if (!applied.length) return { entries, applied, categories: null };
    return { entries: out, applied, categories: { ...(categories || {}), classifiers: sys } };
}

/** One line of the system, for notes and reports. */
export function describeClassifiers(system, entries = null, spell = null) {
    if (!system) return 'no numeral classifiers';
    const words = system.classes.map((c) => {
        const w = entries ? classifierWord(entries, c) : null;
        return `${CLASSIFIER_CLASSES[c]?.label ?? c}${w ? ` ${spell ? spell(w) : w.ipa}` : ''}`;
    });
    return `numeral classifiers, ${system.use}${system.bound ? ' (endings on the numeral)' : ''}: ${words.join(', ')}`;
}

/** Readable log for the panel and the CLI. */
export function formatClassifierChanges(events) {
    return (events || []).filter((ev) => ev.step !== 'erosion').map((ev) => `  c.${String(ev.year).padStart(5)}  ${ev.note}`).join('\n');
}
