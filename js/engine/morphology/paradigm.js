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
    isolating: {
        label: 'isolating',
        cases: [], numbers: ['SG'], tenses: ['PRS'],
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
        note: 'Whole clauses inside a word. Inuktitut, Mohawk, Chukchi.',
    },
};

export const CASE_NOTES = {
    NOM: 'nominative — the subject', ACC: 'accusative — the object',
    ERG: 'ergative — the agent of a transitive verb', ABS: 'absolutive — the subject of an intransitive, and the object of a transitive',
    GEN: 'genitive — possession', DAT: 'dative — the recipient',
    LOC: 'locative — place', ABL: 'ablative — source', INS: 'instrumental — the means',
};

/** The default morphology for a family that has not declared one. */
export const DEFAULT_MORPHOLOGY = {
    type: 'agglutinative',
    alignment: 'nom-acc',
    cases: null,      // null → take the type's default
    numbers: null,
    tenses: null,
    persons: ['1SG', '3SG', '3PL'],
};

/** Resolve a config into a concrete category inventory. */
export function resolveCategories(config = {}) {
    const m = { ...DEFAULT_MORPHOLOGY, ...(config.morphology || {}) };
    const type = MORPH_TYPES[m.type] || MORPH_TYPES.agglutinative;
    const cases = m.cases ?? type.cases;
    // Ergative alignment renames the two core cases; it does not add any.
    const core = m.alignment === 'erg-abs' ? ['ABS', 'ERG'] : ['NOM', 'ACC'];
    const resolved = cases.length
        ? [...core, ...cases.filter((c) => !['NOM', 'ACC', 'ABS', 'ERG'].includes(c))]
        : [];
    return {
        type: m.type,
        typeNote: type.note,
        alignment: m.alignment,
        cases: resolved,
        numbers: m.numbers ?? type.numbers,
        tenses: m.tenses ?? type.tenses,
        persons: m.persons,
    };
}

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
function makeEnding(pools, rng, { zeroAllowed = false } = {}) {
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
function endingsFor(cats, pools, rng, pos) {
    const cells = {};
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
    if (!cats.cases.length && !cats.tenses.length) {
        return { paradigm: { categories: cats, classes: {} }, entries: [] };
    }

    const classes = {};
    const cellEntries = [];
    const seen = new Set(entries.map((e) => e.class).filter(Boolean));

    for (const cls of [...seen].sort()) {
        const pos = cls[0] === 'v' ? 'v' : (cls[0] === 'a' ? 'adj' : 'n');
        // Adjectives inflect like nouns where they inflect at all; giving them a
        // separate table would double the size for no linguistic gain here.
        if (pos === 'adj') continue;

        const exemplar = exemplarFor(entries, cls);
        if (!exemplar) continue;

        // Drawn sequentially off the one seeded stream. Deterministic, which is
        // what matters; adding a class shifts later classes' endings, and that is
        // acceptable because classes are fixed at proto-build time.
        const endings = endingsFor(cats, pools, rng, pos);
        const cells = {};
        for (const [cell, ending] of Object.entries(endings)) {
            // The whole inflected word, with the stem-affix junction repaired
            // the way any compound would be.
            const joined = repairHiatus([...exemplar.form, ...ending], pt);
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
            cells[cell] = { ending: wordToIpa(ending), form: joined, ipa: wordToIpa(joined), key: wordToIpaStressed(joined) };
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
            cells,
        };
    }

    return { paradigm: { categories: cats, classes }, entries: cellEntries };
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
            const prev = previousParadigm.classes?.[cls] || {};
            classes[cls] = { ...prev, cells: {} };
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
        if (!classes[cls]) classes[cls] = { ...prev, cells: {} };
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
        c.baseCells = Math.max(c.baseCells ?? 0, Object.keys(c.cells).length);
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
