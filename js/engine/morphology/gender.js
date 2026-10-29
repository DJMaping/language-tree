/**
 * Grammatical gender and noun classes (17 Oct 2026, DJ: "I do want these to
 * be incredibly complicated like languages").
 *
 * About 44% of Earth's languages sort their nouns into genders (WALS 30A,
 * Corbett): two (masculine and feminine: French, Hebrew, Hindi), three (with
 * a neuter: Latin, German, Russian), animate against inanimate (Ojibwe,
 * Basque in part), or as many as eight to twenty noun classes (Swahili,
 * Zulu, the Bantu languages). A gender shows in AGREEMENT: an adjective,
 * a pronoun or a verb takes a form that depends on the noun. Andah had none.
 *
 * How a noun gets its gender here is how it happens on Earth: by meaning
 * where meaning is clear (a woman is feminine, a person is in the human
 * class), and otherwise by form, which is why most Latin nouns in -a are
 * feminine and a German loanword in -ung is feminine too. Assigned once,
 * a gender is inherited and outlives the form that suggested it, so the
 * correlation blurs with time as it has in German. Words made later get one
 * by the same rules: a compound its head's (German der Handschuh, from der
 * Schuh), a diminutive often the neuter (das Mädchen, from die Magd), a loan
 * by its form and meaning (German die Garage).
 *
 * Gender is lost the way it is on Earth, not by decree: its agreement
 * endings wear away with the rest of the inflection, and when sound change
 * has made a gender's endings identical to another's everywhere, the gender
 * is gone and its nouns join the one it fell together with (Latin's neuter
 * into the Romance masculine; Old English's three genders into none).
 * grammaticalisation.js applies that.
 */

/** The systems, and the gender values each has (the first is the default). */
export const GENDER_SYSTEMS = {
    none: { label: 'no gender', values: [] },
    sex2: { label: 'masculine and feminine', values: ['M', 'F'] },
    sex3: { label: 'masculine, feminine and neuter', values: ['M', 'F', 'N'] },
    animacy: { label: 'animate and inanimate', values: ['AN', 'IN'] },
    classes: { label: 'noun classes', values: ['HUM', 'ANI', 'PLA', 'THG', 'MAS', 'ABS', 'LNG', 'RND'] },
};

/** Labels for the panel and the gloss. */
export const GENDER_LABELS = {
    M: 'masculine', F: 'feminine', N: 'neuter', AN: 'animate', IN: 'inanimate',
    HUM: 'human class', ANI: 'animal class', PLA: 'plant class', THG: 'thing class',
    MAS: 'mass and liquid class', ABS: 'abstract class', LNG: 'long-thing class', RND: 'round-thing class',
};

/**
 * How likely each system is, by the family's morphological type, tuned so
 * Andah's spread comes out near Earth's (WALS 30A: none 56%, two 19%,
 * three 10%, four 5%, five or more 9%): gender is rare in isolating
 * languages (Mandarin), uncommon in agglutinative ones except for the
 * Bantu-like noun-class languages, usual in fusional ones (Indo-European,
 * Afro-Asiatic), and animacy is the polysynthetic kind (Algonquian).
 */
export const GENDER_RATES = {
    isolating: { none: 0.95, animacy: 0.05 },
    agglutinative: { none: 0.66, sex2: 0.04, sex3: 0.06, animacy: 0.04, classes: 0.2 },
    // a three-gender proto often ends as two (Latin's neuter in Romance), so
    // fusional families start with three more often than they end with it
    // (two genders run high in Andah, 47% against WALS 30A's 19%, because one family of some 260 languages, Alzuria-Ayuman,
    // inherited them from its proto as the Indo-European languages share theirs: a family's history, not these rates, 30 Oct 2026)
    fusional: { none: 0.2, sex2: 0.22, sex3: 0.54, animacy: 0.04 },
    polysynthetic: { none: 0.5, animacy: 0.28, sex2: 0.04, sex3: 0.06, classes: 0.12 },
};

const FEMALE = new Set(['woman', 'mother', 'wife', 'sister', 'daughter', 'grandmother', 'aunt', 'queen', 'widow', 'girl']);
const MALE = new Set(['man (male)', 'father', 'husband', 'brother', 'son', 'grandfather', 'uncle', 'king', 'boy', 'lord']);
const ANIMATE_DOMAINS = new Set(['person', 'kinship', 'animal']);
export const ANIMATE_GLOSSES = new Set(['god', 'spirit', 'soul', 'warrior', 'thief', 'judge', 'messenger', 'merchant', 'smith', 'farmer', 'shepherd',
    'hunter', 'fisherman', 'weaver', 'potter', 'builder', 'singer', 'healer', 'teacher', 'chief', 'king', 'queen', 'lord', 'servant', 'priest',
    'elder', 'guest', 'stranger', 'enemy', 'friend', 'slave', 'neighbour', 'people', 'crowd', 'tribe', 'clan', 'orphan', 'student', 'soldier',
    'person', 'baby', 'army']);
/** Bantu-like class by meaning; what fits none goes by form. */
const CLASS_OF_DOMAIN = {
    person: 'HUM', kinship: 'HUM', animal: 'ANI', plant: 'PLA', agriculture: 'PLA', tool: 'THG', craft: 'THG', dwelling: 'THG',
    war: 'THG', trade: 'THG', food: 'MAS', weather: 'MAS', nature: 'MAS', cognition: 'ABS', religion: 'ABS', speech: 'ABS',
    society: 'ABS', time: 'ABS', quality: 'ABS', body: 'RND', space: 'LNG', colour: 'ABS',
};
const LONG_THINGS = new Set(['stick', 'snake', 'rope', 'rope (thick)', 'spear', 'road', 'river', 'tree', 'path', 'arrow', 'hair', 'neck', 'leg', 'tail', 'worm', 'thread', 'bridge', 'stream']);
const ROUND_THINGS = new Set(['egg', 'fruit', 'stone', 'eye', 'head', 'moon', 'sun', 'nut', 'berry', 'seed', 'breast', 'knee', 'pot', 'cup', 'wheel', 'shell']);

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

/** By form: a word ending in a low or front vowel leans feminine, as Latin -a does. */
function byForm(entry, values) {
    const last = entry.form?.[entry.form.length - 1];
    const u = (hash(`gender|${entry.id}`) % 1000) / 1000;
    if (values.includes('F') && last?.type === 'V' && (last.f.height >= 4 || last.f.back === 1)) return u < 0.8 ? 'F' : 'M';
    if (values.includes('N') && last?.type === 'C') return u < 0.45 ? 'N' : 'M';
    if (values.includes('N')) return u < 0.25 ? 'N' : u < 0.45 ? 'F' : 'M';
    return u < 0.3 && values.includes('F') ? 'F' : values[0];
}

/** One noun's gender in a system, from its meaning, its make-up and its form. */
export function genderOf(entry, system, byId, values = GENDER_SYSTEMS[system]?.values || []) {
    if (!values.length || entry.pos !== 'n') return null;
    if (entry.gender && values.includes(entry.gender)) return entry.gender;
    const gloss = entry.gloss;
    // a person's sex outranks everything else (das Mädchen is the famous exception)
    if (values.includes('F') && FEMALE.has(gloss)) return 'F';
    if (values.includes('M') && MALE.has(gloss)) return 'M';
    // a compound takes its head's gender
    if (entry.compoundOf?.head && byId) {
        const head = byId.get(entry.compoundOf.head);
        if (head && head !== entry) return genderOf(head, system, byId, values);
    }
    // a derivative by its affix, as -chen makes German neuters and -tio Latin feminines
    const affix = entry.derivedFrom?.affix;
    if (affix && byId) {
        const base = byId.get(entry.derivedFrom.base);
        if (affix === 'DIM' && values.includes('N')) return 'N';
        if ((affix === 'DIM' || affix === 'AUG' || affix === 'COLL') && base && base.pos === 'n') return genderOf(base, system, byId, values);
        if (affix === 'AGENT') return values.includes('HUM') ? 'HUM' : values.includes('AN') ? 'AN' : 'M';
        if (affix === 'ABSTRACT') return values.includes('ABS') ? 'ABS' : values.includes('F') ? 'F' : values.includes('IN') ? 'IN' : values[0];
        if (affix === 'INSTRUMENT' || affix === 'PLACE') return values.includes('N') ? 'N' : values.includes('THG') ? 'THG' : values.includes('IN') ? 'IN' : 'M';
    }
    if (system === 'sex2' || system === 'sex3') {
        if (FEMALE.has(gloss)) return 'F';
        if (MALE.has(gloss)) return 'M';
        if (ANIMATE_GLOSSES.has(gloss) || entry.domain === 'person' || entry.domain === 'kinship') return 'M';
        return byForm(entry, values);
    }
    if (system === 'animacy') {
        return ANIMATE_DOMAINS.has(entry.domain) || ANIMATE_GLOSSES.has(gloss) ? 'AN' : 'IN';
    }
    if (system === 'classes') {
        let c = ANIMATE_GLOSSES.has(gloss) ? 'HUM' : LONG_THINGS.has(gloss) ? 'LNG' : ROUND_THINGS.has(gloss) ? 'RND' : CLASS_OF_DOMAIN[entry.domain];
        if (!c || !values.includes(c)) c = values[hash(`class|${entry.id}`) % values.length];
        return c;
    }
    return null;
}

/**
 * Where the class is marked on the noun (character.js nounClassPrefix), a
 * noun's class is its declension, as in Bantu: the declension of the human
 * class is "nHUM", and so on. A class of one (a common word's own paradigm,
 * morphology/irregular.js) keeps its own.
 */
export const nounClassOf = (g) => (g ? `n${g}` : null);
export const genderOfClass = (cls) => {
    const g = typeof cls === 'string' && cls[0] === 'n' ? cls.slice(1) : null;
    return g && GENDER_SYSTEMS.classes.values.includes(g) ? g : null;
};
const ownParadigm = (cls) => /^[vna]x\d+$/.test(String(cls));

/**
 * Give every noun that has none its gender (new words, loans, the proto's
 * lexicon); where the class is marked on the noun, its declension follows
 * (a loan takes the class its meaning puts it in, Swahili ki-tabu from
 * Arabic kitāb, its ki- read as the class prefix).
 */
export function assignGenders(entries, system, values = GENDER_SYSTEMS[system]?.values || [], { classPrefix = false } = {}) {
    if (!values.length) return entries;
    const byId = new Map(entries.map((e) => [e.id, e]));
    let changed = false;
    const out = entries.map((e) => {
        if (e.pos !== 'n' || e.paradigm) return e;
        const g = genderOf(e, system, byId, values);
        const cls = classPrefix && g && !ownParadigm(e.class) ? nounClassOf(g) : e.class;
        if (g === e.gender && cls === e.class) return e;
        changed = true;
        return { ...e, gender: g, class: cls };
    });
    return changed ? out : entries;
}

/**
 * He, she and it: separate words, or one (WALS 44A: two languages in three
 * have no gender in their pronouns at all, Finnish hän, Turkish o, Mandarin
 * tā). A sex-based gender almost always shows in the pronoun, and a neuter
 * makes "it" a word of its own; an animate-inanimate system often has an
 * inanimate pronoun; a genderless language now and then has "she" anyway,
 * as English does. Where they are one word, "she" and "it" are the same word
 * as "he" (sameWordAs), and stay so as it changes.
 */
export function pronounGender(entries, system, rng) {
    const he = entries.find((e) => e.gloss === 'he' && e.pos === 'pron');
    if (!he) return entries;
    const sex = system === 'sex2' || system === 'sex3';
    const sheOwn = sex ? rng.bool(0.95) : rng.bool(0.12);
    const itOwn = system === 'sex3' ? rng.bool(0.9) : system === 'animacy' ? rng.bool(0.7) : system === 'classes' ? rng.bool(0.6) : sheOwn && rng.bool(0.6);
    const same = (e) => ({ ...e, form: he.form, ipa: he.ipa, syllables: he.syllables, sameWordAs: he.id, class: he.class });
    return entries.map((e) => {
        if (e.pos !== 'pron') return e;
        if (e.gloss === 'she' && !sheOwn) return same(e);
        if (e.gloss === 'it' && !itOwn) return same(e);
        return e;
    });
}

/** The values a system has, trimmed to `count` for a noun-class system. */
export function genderValues(system, count = null) {
    const v = GENDER_SYSTEMS[system]?.values || [];
    return system === 'classes' && count ? v.slice(0, count) : v;
}
