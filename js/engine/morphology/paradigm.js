/**
 * Inflectional paradigms — and why they are stored as whole words.
 *
 * ## The one design decision that matters
 *
 * A paradigm cell here is not an affix. It is a COMPLETE INFLECTED WORD: stem
 * plus ending, built at the proto stage and then carried through every sound
 * change as an ordinary lexical entry.
 *
 * Storing bare affixes and composing them on demand would be cheaper and would
 * be wrong, because a sound change does not apply to an affix — it applies to a
 * word. Whether a case ending survives depends on where the stress falls in the
 * whole inflected form, on how many syllables precede it, and on what consonant
 * sits at the stem-affix junction. Latin's *-um* and *-am* fell together as
 * *-ə* and then vanished because of what happened to WORDS ending in them.
 *
 * So the cells are added to the lexicon and evolve with it. They get sound
 * changes, derivation histories and phonotactic repair for free, and the
 * erosion of the paradigm is a consequence of the phonology rather than a
 * separate thing anyone has to script.
 *
 * ## Why one exemplar per class, and what that costs
 *
 * 727 nouns × 10 cells × 284 stages is over two million forms. Instead the
 * engine inflects ONE exemplar per inflection class — which is exactly what a
 * historical grammar prints, one specimen per declension, and for the same
 * reason.
 *
 * The known limitation, stated honestly: a class containing both monosyllabic
 * and trisyllabic stems will not erode uniformly under a stress rule that
 * counts from the end of the word, so one exemplar can claim a merger that does
 * not hold for the whole class. `erosion.js` therefore re-checks every merger it
 * finds against a sample of real class members before reporting it.
 */

import { wordToIpa, wordToIpaStressed, isVowel } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * The morphological type scale, and what each point means in cells.
 *
 * Cell count is the thing that actually distinguishes these types. An isolating
 * language marks nothing on the word (Mandarin, Vietnamese); an agglutinative
 * one stacks transparent affixes (Turkish, Finnish, Swahili); a fusional one
 * packs several categories into one unanalysable ending (Latin *-īs* is
 * genitive AND singular AND third-declension).
 */
export const MORPH_TYPES = {
    // No inflection at all: an isolating verb no more agrees with its subject
    // than a Mandarin one does (it had a present tense and three person
    // endings, so Standard Dahen said pʰau, pʰa, pʰaʃ for "I, he, they blow").
    isolating: {
        label: 'isolating',
        cases: [], numbers: ['SG'], tenses: [],
        note: 'Grammatical relations are carried by word order and particles, not by endings. Mandarin, Vietnamese, Yoruba.',
    },
    agglutinative: {
        label: 'agglutinative',
        cases: ['NOM', 'ACC', 'GEN', 'DAT', 'LOC'], numbers: ['SG', 'PL'], tenses: ['PRS', 'PST'],
        note: 'One affix, one meaning, stacked transparently. Turkish, Finnish, Swahili, Quechua.',
    },
    fusional: {
        label: 'fusional',
        cases: ['NOM', 'ACC', 'GEN', 'DAT', 'ABL'], numbers: ['SG', 'PL'], tenses: ['PRS', 'PST'],
        note: 'One ending carries several categories at once and cannot be segmented. Latin, Russian, Greek.',
    },
    polysynthetic: {
        label: 'polysynthetic',
        cases: ['ABS', 'ERG', 'GEN', 'DAT', 'LOC', 'INS'], numbers: ['SG', 'DU', 'PL'], tenses: ['PRS', 'PST', 'FUT'],
        note: 'Whole clauses inside a word: the verb marks its subject and its object, and takes common objects into itself (morphology/incorporation.js). Inuktitut, Mohawk, Chukchi.',
    },
};

export const CASE_NOTES = {
    NOM: 'nominative — the subject', ACC: 'accusative — the object',
    ERG: 'ergative — the agent of a transitive verb', ABS: 'absolutive — the subject of an intransitive, and the object of a transitive',
    GEN: 'genitive — possession', DAT: 'dative — the recipient',
    LOC: 'locative — place', ABL: 'ablative — source', INS: 'instrumental — the means',
    COM: 'comitative — together with', ALL: 'allative — motion to', ELA: 'elative — out of',
    ILL: 'illative — into', ESS: 'essive — as, in the state of', PRT: 'partitive — part of, some of',
    TRA: 'translative — becoming', VOC: 'vocative — addressing someone',
    ADE: 'adessive — on, at', ABE: 'abessive — without', SUP: 'superessive — on top of',
};

/** The default morphology for a family that has not declared one. */
export const DEFAULT_MORPHOLOGY = {
    type: 'agglutinative',
    alignment: 'nom-acc',
    cases: null,      // null → take the type's default
    numbers: null,
    tenses: null,
    /**
     * All six persons. With three (1SG, 3SG, 3PL) a language had no way to
     * say "you go" or "we go", which a translation needs at once; most
     * inflecting languages on Earth mark all six (Latin, Turkish, Finnish,
     * Swahili), and sound change and levelling wear them down (English kept
     * one: -s).
     */
    persons: ['1SG', '2SG', '3SG', '1PL', '2PL', '3PL'],
};

/** Resolve a config into a concrete category inventory. */
export function resolveCategories(config = {}) {
    const m = { ...DEFAULT_MORPHOLOGY, ...(config.morphology || {}) };
    const type = MORPH_TYPES[m.type] || MORPH_TYPES.agglutinative;
    const cases = m.cases ?? type.cases;
    /**
     * A polysynthetic verb agrees with its object as well as its subject
     * (Mohawk k-, "I" acting alone, against khe-, "I" acting on someone), so
     * its table has cells for the transitive combinations too, written
     * subject>object: 1SG>3SG "I ... him or her".
     */
    const persons = m.type === 'isolating' && !config.morphology?.persons ? []
        : (m.type === 'polysynthetic' || m.objectAgreement) && !config.morphology?.persons
            ? [...m.persons, ...TRANSITIVE]
            : m.persons;
    // Ergative alignment renames the two core cases; it does not add any.
    const core = m.alignment === 'erg-abs' ? ['ABS', 'ERG'] : ['NOM', 'ACC'];
    const resolved = cases.length
        ? [...core, ...cases.filter((c) => !['NOM', 'ACC', 'ABS', 'ERG'].includes(c))]
        : [];
    return {
        type: m.type,
        typeNote: type.note,
        alignment: m.alignment,
        // gender (morphology/gender.js): the system, and the values that
        // agreement still tells apart
        gender: m.gender ?? 'none',
        genders: m.genders ?? [],
        cases: resolved,
        numbers: m.numbers ?? type.numbers,
        tenses: m.tenses ?? type.tenses,
        persons,
        // person markers before the stem or after it, and tense where persons go first (character.js)
        personPosition: m.personPosition ?? 'suffix',
        tensePosition: m.tensePosition ?? 'suffix',
        // whose person the verb marks: the subject, or in an ergative language the absolutive (character.js)
        agreement: m.agreement ?? 'subject',
    };
}

/** The subject>object cells of a polysynthetic verb. */
export const TRANSITIVE = ['1SG>3SG', '3SG>1SG', '3SG>3SG'];

// ---------------------------------------------------------------------------
// Building the endings
// ---------------------------------------------------------------------------

/**
 * Generate one inflectional ending.
 *
 * Kept short and phonologically simple. Inflectional affixes are the most
 * frequent morphemes in a language, and Zipf's law of abbreviation applies to
 * bound morphemes as forcefully as to words: Latin's case endings are one
 * syllable, Turkish's are one or two, and nothing anywhere is four.
 *
 * The unmarked cell is usually ZERO. Nominative singular in Latin, Russian and
 * Turkish is bare or nearly so, and that asymmetry is not decoration — it is
 * why the nominative is the citation form and why it survives longest.
 */
export function makeEnding(pools, rng, { zeroAllowed = false } = {}) {
    if (zeroAllowed && rng.bool(0.7)) return [];
    const v = rng.pickWeighted(pools.vowels, (x) => x.w).ph;
    const c = rng.pickWeighted(pools.codas.length ? pools.codas : pools.onsets, (x) => x.w).ph;
    // -V, -VC and -CV are the shapes real endings take.
    const roll = rng.next();
    if (roll < 0.35) return [v];
    if (roll < 0.75) return [v, c];
    return [c, v];
}

/**
 * Build the ending table for one inflection class.
 *
 * Classes differ in their endings — that is what makes them classes. Latin's
 * five declensions are really "stem in -ā, -o, -consonant, -u, -ē" with
 * partially shared endings glued on, and the engine's `classOf` already assigns
 * a class from the stem's final segment for exactly this reason.
 */
function endingsFor(cats, pools, rng, pos, stacked = null) {
    const cells = {};
    /**
     * AGGLUTINATION: one affix, one meaning. Each category value has a single
     * morph shared by every cell and every class, and a cell is the stem with
     * its morphs stacked in order: number then case (Turkish ev-ler-i, "house-
     * PL-ACC"), tense then person. Before this, "agglutinative" was a label:
     * every cell drew its own unrelated ending, a fusional portmanteau, and not
     * one noun class in any family had a separable plural marker.
     */
    // An adjective agrees with its noun in gender and number (morphology/gender.js).
    if (pos === 'adj') {
        for (const g of cats.genders || []) {
            for (const n of cats.numbers) {
                cells[`${g}.${n}`] = stacked
                    ? [...(stacked.gender?.[g] || []), ...stacked.number[n]]
                    : makeEnding(pools, rng, { zeroAllowed: g === cats.genders[0] && n === cats.numbers[0] });
            }
        }
        return cells;
    }
    if (stacked) {
        if (pos === 'v') {
            for (const t of cats.tenses) {
                for (const p of cats.persons) {
                    // subject marker, then object marker: one affix, one meaning
                    const [s, o] = p.split('>');
                    const person = o ? [...stacked.person[s], ...stacked.object[o]] : stacked.person[p];
                    // persons before the stem where the language puts them there, tense after (Swahili ni-na-soma
                    // has it before, after the person: SM-TAM-stem)
                    cells[`${t}.${p}`] = cats.personPosition !== 'prefix' ? [...stacked.tense[t], ...person]
                        : cats.tensePosition === 'prefix' ? { pre: [...person, ...stacked.tense[t]], post: [] }
                            : { pre: person, post: stacked.tense[t] };
                }
            }
        } else {
            for (const c of cats.cases) for (const n of cats.numbers) cells[`${c}.${n}`] = [...stacked.number[n], ...stacked.case[c]];
        }
        return cells;
    }
    if (pos === 'v') {
        for (const t of cats.tenses) {
            for (const p of cats.persons) {
                cells[`${t}.${p}`] = makeEnding(pools, rng, { zeroAllowed: t === cats.tenses[0] && p === '3SG' });
            }
        }
        return cells;
    }
    for (const c of cats.cases) {
        for (const n of cats.numbers) {
            // The nominative/absolutive singular is the unmarked cell.
            const unmarked = (c === cats.cases[0]) && n === cats.numbers[0];
            cells[`${c}.${n}`] = makeEnding(pools, rng, { zeroAllowed: unmarked });
        }
    }
    return cells;
}

// ---------------------------------------------------------------------------
// The paradigm
// ---------------------------------------------------------------------------

/**
 * A class of one: a common verb or noun with a paradigm of its own, which is
 * how it comes to be irregular (morphology/irregular.js). 'vx1', 'nx3'.
 */
export const isIrregularClass = (cls) => /^[vna]x\d+$/.test(String(cls));

/**
 * Mood cells (morphology/moods.js): the imperative (IMP.2SG, IMP.2PL), the
 * irrealis series (IRR.<person>: an optative or a subjunctive) and a
 * non-firsthand past (NFH.<person>, morphology/evidentials.js). They are
 * paradigm cells like any other, appended after the tense cells, but they are
 * moods, not tenses: levelling, category loss and the inflection measure
 * leave them out, and so does the sound-change probe, so adding them changes
 * no other word.
 */
export const MOOD_SLOTS = new Set(['IMP', 'IRR', 'NFH']);
export const slotOf = (cell) => String(cell).split('.')[0];
export const isMoodCell = (cell) => MOOD_SLOTS.has(slotOf(cell));
export const isMoodCellEntry = (e) => typeof e?.id === 'string' && e.id.startsWith('para:') && isMoodCell(e.id.split(':')[2]);
/** Words of the mood and evidential systems: "don't", "let", a reportative particle. */
export const isMoodWord = (e) => /^(mood|evid):/.test(String(e?.id));
/**
 * A form split around its stem: what comes before it and what after. Where
 * person markers stand before the stem (Swahili ni-na-soma) the stem sits
 * inside the form, and reading only from the front took the whole form for
 * an ending.
 *
 * The stem inside a form need not be the bare stem exactly: a prefix moves
 * the stress or makes a consonant intervocalic, and the stem inside the forms
 * goes a little its own way (Bantu n-dila beside lila). So the whole stem is
 * aligned against the stretch of the form it best matches, and found where at
 * most a third of its segments differ (none in a stem of one or two).
 * `found` is false where it is not there at all: the form is then all after it.
 */
export function splitAround(stem, form, { exact = false } = {}) {
    if (!stem?.length || !form?.length) return { pre: [], post: form ? form.slice() : [], found: false };
    let p = 0;
    while (p < stem.length && p < form.length && stem[p].ipa === form[p].ipa) p += 1;
    if (p === stem.length) return { pre: [], post: form.slice(p), found: true };
    // the whole stem against any stretch of the form: cost of edits, and where the stretch starts
    const m = stem.length, n = form.length;
    let D = Array.from({ length: n + 1 }, () => 0), S = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const d = [i], s = [0];
        for (let j = 1; j <= n; j++) {
            const sub = D[j - 1] + (stem[i - 1].ipa === form[j - 1].ipa ? 0 : 1);
            const del = D[j] + 1, ins = d[j - 1] + 1;
            if (sub <= del && sub <= ins) { d[j] = sub; s[j] = S[j - 1]; } else if (del <= ins) { d[j] = del; s[j] = S[j]; } else { d[j] = ins; s[j] = s[j - 1]; }
        }
        D = d; S = s;
    }
    let best = null;
    for (let j = 1; j <= n; j++) {
        if (!best || D[j] < best.cost || (D[j] === best.cost && Math.abs(j - S[j] - m) < Math.abs(best.end - best.start - m))) best = { cost: D[j], start: S[j], end: j };
    }
    if (!best || best.cost > (exact ? 0 : Math.floor(m / 3))) return { pre: [], post: form.slice(p), found: false };
    return { pre: form.slice(0, best.start), post: form.slice(best.end), found: true };
}

/**
 * A form split for inflecting another word like it: the stem intact inside
 * it, else the form split by its paradigm, else the stem found with a sound
 * or two changed. In that order, because a tense ending that took the place
 * of the stem's last vowel (lʲija, past u-lʲij-i) reads as a changed stem
 * with no ending, and a member verb lost its past.
 */
export function splitForm(stem, cells, cell) {
    const form = cells?.[cell]?.form;
    const a = splitAround(stem, form, { exact: true });
    if (a.found) return a;
    const p = paradigmSplit(cells, cell);
    if (p) return p;
    const t = splitAround(stem, form);
    return t.found ? t : null;
}

/** How many trailing segments two forms share. */
export function sharedSuffix(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i].ipa === b[b.length - 1 - i].ipa) i += 1;
    return i;
}

/**
 * A form split by its paradigm, as a speaker would split it, where the bare
 * stem is no longer to be found inside it (the stem inside the forms has gone
 * its own way). The persons of one tense share what comes after the person
 * marker, the stem and the tense ending, and differ before it; two tenses
 * share the stem and differ after it. Null where the paradigm does not say.
 */
export function paradigmSplit(cells, cell) {
    const form = cells?.[cell]?.form;
    if (!form?.length) return null;
    const rightOf = (slot, f) => {
        const others = Object.entries(cells).filter(([k, x]) => slotOf(k) === slot && x.form?.length && wordToIpa(x.form) !== wordToIpa(f)).map(([, x]) => sharedSuffix(f, x.form));
        if (!others.length) return null;
        // the longest right-hand part most of the other persons share with this form
        const sorted = others.sort((a, b) => b - a);
        const k = sorted[Math.max(0, Math.ceil(sorted.length * 0.6) - 1)];
        return k ? f.slice(f.length - Math.min(k, f.length)) : null;
    };
    const slot = slotOf(cell);
    const right = rightOf(slot, form);
    if (!right) return null;
    const pre = form.slice(0, form.length - right.length);
    // the tense ending: what this tense's right-hand part has beyond another tense's
    const other = Object.keys(cells).find((k) => slotOf(k) !== slot && !isMoodCell(k) && cells[k].form?.length);
    const otherRight = other ? rightOf(slotOf(other), cells[other].form) : null;
    if (!otherRight) return { pre, post: [] };
    // the tense after the stem (the right-hand parts share their start), or before it, after the person (their end)
    let i = 0;
    while (i < right.length && i < otherRight.length && right[i].ipa === otherRight[i].ipa) i += 1;
    const j = sharedSuffix(right, otherRight);
    if (j > i) return { pre: [...pre, ...right.slice(0, right.length - j)], post: [] };
    return { pre, post: i ? right.slice(i) : [] };
}

/** What a form has beyond a stem it starts with: the ending (as inflect reads it). */
export function stemTail(stem, form) {
    let i = 0;
    while (i < stem.length && i < form.length && stem[i].ipa === form[i].ipa) i += 1;
    return form.slice(i);
}

const PARADIGM_PREFIX = 'para';
/** Paradigm entries are lexicon entries with a reserved id shape. */
export const isParadigmEntry = (e) => typeof e.id === 'string' && e.id.startsWith(`${PARADIGM_PREFIX}:`);
export const cellIdOf = (cls, cell) => `${PARADIGM_PREFIX}:${cls}:${cell}`;
export function parseCellId(id) {
    const [, cls, cell] = id.split(':');
    return { cls, cell };
}

/**
 * Choose the exemplar for a class.
 *
 * The most frequent member, with the median syllable count — the word a grammar
 * would actually print. Frequency matters because a high-frequency exemplar is
 * the one speakers generalise FROM, and syllable count matters because a stress
 * rule that counts from the end treats a long stem differently from a short one.
 */
function exemplarFor(entries, cls) {
    const members = entries.filter((e) => e.class === cls && !e.derivedFrom && !isParadigmEntry(e));
    if (!members.length) return null;
    const sylls = members.map((m) => m.syllables).sort((a, b) => a - b);
    const median = sylls[Math.floor(sylls.length / 2)];
    const typical = members.filter((m) => m.syllables === median);
    const pool = typical.length ? typical : members;
    return pool.reduce((best, m) => (m.rank < best.rank ? m : best), pool[0]);
}

/**
 * Build the proto-language's paradigms and the lexicon entries that carry them.
 *
 * Returns { paradigm, entries } — the entries are appended to the lexicon so
 * they evolve with it.
 */
export function buildParadigms(entries, phonology, pools, rng, config = {}) {
    const cats = resolveCategories(config);
    const { phonotactics: pt } = phonology;
    if (!cats.cases.length && !cats.tenses.length && !(cats.genders || []).length) {
        return { paradigm: { categories: cats, classes: {} }, entries: [] };
    }

    const classes = {};
    const cellEntries = [];
    const seen = new Set(entries.map((e) => e.class).filter(Boolean));

    /**
     * One morph per category value, distinct from its siblings. The singular
     * and the nominative/absolutive are unmarked, as they almost always are in
     * agglutinative languages (Turkish ev, ev-ler; Finnish talo, talo-t); the
     * first tense usually is.
     */
    const morphsFor = (values, { firstZero, firstAlwaysZero = false }) => {
        const out = {};
        const used = new Set();
        values.forEach((v, i) => {
            let m = [];
            if (i === 0 && firstAlwaysZero) { out[v] = m; used.add(''); return; }
            for (let tries = 0; tries < 12; tries++) {
                m = makeEnding(pools, rng, { zeroAllowed: firstZero && i === 0 });
                const key = wordToIpa(m);
                if (!used.has(key)) { used.add(key); break; }
            }
            out[v] = m;
        });
        return out;
    };
    const stacked = ['agglutinative', 'polysynthetic'].includes(cats.type) ? {
        number: morphsFor(cats.numbers, { firstZero: true, firstAlwaysZero: true }),
        case: morphsFor(cats.cases, { firstZero: true, firstAlwaysZero: true }),
        tense: morphsFor(cats.tenses, { firstZero: true }),
        person: morphsFor(cats.persons.filter((p) => !p.includes('>')), { firstZero: false }),
        ...(cats.persons.some((p) => p.includes('>')) ? {
            object: morphsFor([...new Set(cats.persons.filter((p) => p.includes('>')).map((p) => p.split('>')[1]))], { firstZero: false }),
        } : {}),
        ...((cats.genders || []).length ? { gender: morphsFor(cats.genders, { firstZero: true }) } : {}),
    } : null;

    // adjective classes last, so a family without gender draws its noun and
    // verb endings exactly as it did before adjectives could agree; the
    // classes of one after everything, taking their old class's endings
    const endingsOfClass = {};
    for (const cls of [...seen].sort((a, b) => isIrregularClass(a) - isIrregularClass(b) || (a[0] === 'a') - (b[0] === 'a') || (a < b ? -1 : a > b ? 1 : 0))) {
        const pos = cls[0] === 'v' ? 'v' : (cls[0] === 'a' ? 'adj' : 'n');
        // An adjective inflects only to agree with a gender (morphology/gender.js).
        if (pos === 'adj' && !(cats.genders || []).length) continue;

        const exemplar = exemplarFor(entries, cls);
        if (!exemplar) continue;

        // Drawn sequentially off the one seeded stream. Deterministic, which is
        // what matters; adding a class shifts later classes' endings, and that is
        // acceptable because classes are fixed at proto-build time. A class of
        // one starts with the endings of the class it would otherwise be in:
        // its irregularity is what sound change does to it afterwards.
        const endings = (isIrregularClass(cls) && endingsOfClass[exemplar.baseClass]) || endingsFor(cats, pools, rng, pos, stacked);
        endingsOfClass[cls] = endings;
        const cells = {};
        for (const [cell, ending] of Object.entries(endings)) {
            // The whole inflected word, with the stem-affix junction repaired
            // the way any compound would be.
            // noun-class agreement is a prefix (Swahili m-tu m-zuri, "good person")
            const prefix = pos === 'adj' && cats.gender === 'classes';
            // an ending, or (persons before the stem) the part before it and the part after
            const parts = Array.isArray(ending) ? (prefix ? { pre: ending, post: [] } : { pre: [], post: ending }) : ending;
            const joined = repairHiatus([...parts.pre, ...exemplar.form, ...parts.post], pt);
            /**
             * `key` carries STRESS; `ipa` does not.
             *
             * Two cells are homophonous only if they sound the same, and stress
             * is part of sounding the same — Latin's third-declension forms are
             * distinguished by it, and English "ˈrecord" and "reˈcord" are not
             * the same word. Comparing on the bare IPA counted stress-distinct
             * forms as merged, and then a stress-conditioned rule pulled them
             * apart again, which surfaced as a paradigm apparently un-merging.
             */
            cells[cell] = { ending: Array.isArray(ending) ? wordToIpa(ending) : `${wordToIpa(parts.pre)}-…-${wordToIpa(parts.post)}`, form: joined, ipa: wordToIpa(joined), key: wordToIpaStressed(joined) };
            cellEntries.push({
                id: cellIdOf(cls, cell),
                form: joined,
                ipa: wordToIpa(joined),
                gloss: `${exemplar.gloss}.${cell}`,
                pos,
                domain: 'grammar',
                core: true,
                // Inflected forms of a common word are themselves common, and
                // frequency is what will later decide what resists levelling.
                rank: Math.max(1, exemplar.rank),
                zipf: 0,
                class: cls,
                syllables: syllabify(joined, pt).length,
                irregular: exemplar.irregular,
                derivedFrom: null,
                paradigm: { cls, cell, stem: exemplar.id, stemGloss: exemplar.gloss },
            });
        }
        classes[cls] = {
            pos,
            exemplarId: exemplar.id,
            exemplarGloss: exemplar.gloss,
            exemplarForm: wordToIpa(exemplar.form),
            members: entries.filter((e) => e.class === cls).length,
            /**
             * How many cells this class started with, carried down the tree
             * unchanged.
             *
             * The survival measure needs a fixed denominator. Once a language
             * can DROP a category outright, counting distinct forms against the
             * cells it currently has produces the wrong sign: a language that
             * abandons a slot marking nothing would score as having MORE
             * inflection than before, because the syncretic cell it deleted
             * stopped dragging the ratio down. Measured against the proto's
             * count, losing a category reads as loss, which is what it is.
             */
            baseCells: Object.keys(cells).length,
            // a common word's own paradigm (morphology/irregular.js)
            irregular: isIrregularClass(cls),
            cells,
        };
    }

    return { paradigm: { categories: cats, classes }, entries: cellEntries, morphs: stacked };
}

/**
 * Re-read the paradigm out of an evolved lexicon.
 *
 * The cells travelled through the sound changes as ordinary words; this puts
 * them back into a table so the collapse can be seen.
 */
export function paradigmFromEntries(entries, previousParadigm, categories) {
    if (!previousParadigm) return null;
    const classes = {};
    for (const e of entries) {
        if (!isParadigmEntry(e)) continue;
        const { cls, cell } = parseCellId(e.id);
        if (!classes[cls]) {
            const prev = previousParadigm.classes?.[cls];
            // a class new on this edge (a common word given a paradigm of its
            // own, morphology/irregular.js) takes its particulars from its cells
            classes[cls] = prev ? { ...prev, cells: {} } : {
                pos: cls[0] === 'v' ? 'v' : (cls[0] === 'a' ? 'adj' : 'n'),
                exemplarId: e.paradigm?.stem ?? null, exemplarGloss: e.paradigm?.stemGloss ?? '',
                exemplarForm: '', members: 1, baseCells: 0, irregular: isIrregularClass(cls), cells: {},
            };
        }
        classes[cls].cells[cell] = { form: e.form, ipa: e.ipa, key: wordToIpaStressed(e.form) };
    }
    /**
     * A class that has lost EVERY cell stays in the table, empty.
     *
     * Otherwise it drops out of the survival denominator entirely, and a
     * language that abandoned its verbal inflection altogether would score as
     * having MORE inflection than one that kept a collapsing remnant of it. The
     * class still existed; it simply marks nothing now, and that is the most
     * complete kind of loss there is.
     */
    for (const [cls, prev] of Object.entries(previousParadigm.classes || {})) {
        // except a common word's own paradigm, dropped when another word took
        // over its meaning (morphology/irregular.js): nothing eroded there
        if (!classes[cls] && !prev.irregular) classes[cls] = { ...prev, cells: {} };
    }

    /**
     * `baseCells` is a HIGH-WATER MARK, not the proto's count.
     *
     * It is the denominator the survival measure divides by, and it has to move
     * in one direction only. Dropping a slot must read as loss, so the
     * denominator cannot shrink with it; but a language that GROWS a case out
     * of a postposition genuinely has more inflection than before, so the
     * denominator has to admit the new cell or the renewal would score as
     * nothing having happened.
     */
    for (const c of Object.values(classes)) {
        // moods are counted apart (morphology/moods.js)
        c.baseCells = Math.max(c.baseCells ?? 0, Object.keys(c.cells).filter((n) => !isMoodCell(n)).length);
    }
    return { categories: categories || previousParadigm.categories, classes };
}

/**
 * The ENDINGS of a class, with its stem factored out.
 *
 * A class is defined by its endings — Latin's five declensions are five sets of
 * endings, not five sets of words — but the paradigm stores whole inflected
 * words, so the stem has to come off before two classes can be compared. The
 * longest prefix shared by every cell in the class is the stem; what is left is
 * the ending, which is exactly the operation a grammarian performs by eye.
 */
export function endingsOf(paradigm, cls) {
    const c = paradigm?.classes?.[cls];
    const cells = Object.entries(c?.cells || {});
    if (cells.length < 2) return null;

    const strings = cells.map(([, v]) => v.ipa || '');
    let prefix = strings[0];
    for (const s of strings.slice(1)) {
        let i = 0;
        while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
        prefix = prefix.slice(0, i);
    }
    const out = {};
    for (const [name, v] of cells) out[name] = (v.ipa || '').slice(prefix.length);
    return { stem: prefix, endings: out };
}

/**
 * Which classes have fallen together.
 *
 * Sound change erodes the endings that distinguished two declensions until
 * nothing separates them but the shape of their stems, and at that point they
 * are one class with two stem types — which is how Latin's fourth declension
 * ended up absorbed into the second, and how the Old English weak/strong
 * distinction went. The engine reproduced the collapse faithfully and then went
 * on reporting the classes separately: Standard Dahen listed n2 and n3 as
 * distinct while both inflected -jaw/-je/-ja/-o/-jo, identically, in every cell.
 *
 * Returns groups of two or more class ids sharing an ending set.
 */
export function conflatedClasses(paradigm) {
    const byKey = new Map();
    for (const cls of Object.keys(paradigm?.classes || {})) {
        // a class of one starts with its base class's endings by design
        if (isIrregularClass(cls)) continue;
        const e = endingsOf(paradigm, cls);
        if (!e) continue;
        const names = Object.keys(e.endings).sort();
        if (!names.length) continue;
        const key = `${cls[0]}|${names.map((n) => `${n}=${e.endings[n]}`).join(',')}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(cls);
    }
    return [...byKey.values()].filter((g) => g.length > 1);
}

/** Render a class's table for the CLI. */
export function formatParadigm(paradigm, cls) {
    const c = paradigm?.classes?.[cls];
    if (!c) return `(no class ${cls})`;
    const L = [`${cls} — exemplar "${c.exemplarGloss}" (${c.members} members)`];
    const cells = Object.entries(c.cells);
    const byForm = new Map();
    for (const [name, v] of cells) {
        const k = v.key ?? v.ipa;
        if (!byForm.has(k)) byForm.set(k, []);
        byForm.get(k).push(name);
    }
    for (const [name, v] of cells) {
        const shared = byForm.get(v.key ?? v.ipa);
        const mark = shared.length > 1 ? `  = ${shared.filter((s) => s !== name).join(', ')}` : '';
        L.push(`   ${name.padEnd(10)} ${v.ipa}${mark}`);
    }
    const distinct = byForm.size;
    L.push(`   ${distinct}/${cells.length} cells still distinct`);
    return L.join('\n');
}
