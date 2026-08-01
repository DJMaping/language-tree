/**
 * Sample sentences — the same sentence rendered in every language.
 *
 * A sentence cannot be stored as a string. A string cannot grow case endings or
 * lose them, and the whole point is to watch it change. So each sentence is a
 * GLOSSED TEMPLATE: a list of meanings plus the grammatical features each one
 * carries, which every stage then renders through its own lexicon, its own
 * paradigm and its own word order.
 *
 * That is why the same template can be shown side by side across six thousand
 * years and across sister languages, and why the divergence you see is real
 * rather than decorative — nothing here is written per language.
 *
 * This is Schleicher's Fable in miniature. Schleicher wrote his in
 * Proto-Indo-European in 1868 precisely so that successive reconstructions
 * could be compared on the same text; it has been rewritten many times since as
 * the reconstruction changed, which is exactly the use being made of it here.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';

/**
 * The templates.
 *
 * Chosen so that every word is Swadesh core — present in every language the
 * engine can generate — and so that between them they exercise the grammatical
 * categories that erode: subject and object case, number, tense, and an
 * oblique.
 */
export const SENTENCES = [
    {
        id: 'gift',
        english: 'The woman gives water to the child.',
        note: 'Exercises three cases at once: subject, object and recipient.',
        words: [
            { gloss: 'woman', role: 'subject', cell: 'NOM.SG' },
            { gloss: 'give', role: 'verb', cell: 'PRS.3SG' },
            { gloss: 'water', role: 'object', cell: 'ACC.SG' },
            { gloss: 'child', role: 'oblique', cell: 'DAT.SG' },
        ],
    },
    {
        id: 'mountain',
        english: 'Two men went to the mountain.',
        note: 'Plural subject and a past tense — the two cells that erode first.',
        words: [
            { gloss: 'two', role: 'modifier', cell: null },
            { gloss: 'man (human)', role: 'subject', cell: 'NOM.PL' },
            { gloss: 'go', role: 'verb', cell: 'PST.3PL' },
            { gloss: 'mountain', role: 'oblique', cell: 'LOC.SG' },
        ],
    },
    {
        id: 'fire',
        english: 'I see the fire and the smoke.',
        note: 'First person, and two coordinated objects.',
        words: [
            { gloss: 'I', role: 'subject', cell: null },
            { gloss: 'see', role: 'verb', cell: 'PRS.1SG' },
            { gloss: 'fire', role: 'object', cell: 'ACC.SG' },
            { gloss: 'and', role: 'particle', cell: null },
            { gloss: 'smoke', role: 'object', cell: 'ACC.SG' },
        ],
    },
];

/**
 * Word order.
 *
 * Defaults to SVO, which is the commonest order after SOV and the one that
 * needs no special handling. A language whose case marking has eroded away
 * depends on order to say who did what to whom, which is why English fixed its
 * order as its cases collapsed — so the order matters more, not less, as the
 * morphology decays.
 */
const ORDERS = {
    SVO: ['subject', 'verb', 'object', 'oblique'],
    SOV: ['subject', 'object', 'oblique', 'verb'],
    VSO: ['verb', 'subject', 'object', 'oblique'],
};

/**
 * Inflect one lexeme for one paradigm cell.
 *
 * The stem is the language's own word; the ending is taken from its class's
 * paradigm by subtracting the exemplar's stem from the exemplar's inflected
 * form. That indirection is deliberate: the paradigm cells are the forms that
 * actually travelled through the sound changes, so the ending they yield is the
 * eroded one rather than the proto one.
 */
function inflect(entry, cell, state) {
    if (!cell || !entry?.class) return entry?.form ?? null;
    const cls = state.paradigm?.classes?.[entry.class];
    const target = cls?.cells?.[cell];
    if (!cls || !target) return entry.form;

    // The exemplar's bare stem, as it stands at this stage.
    const stemEntry = state.entries.find((e) => e.id === cls.exemplarId);
    const stem = stemEntry?.form;
    if (!stem) return entry.form;

    // The ending is whatever the inflected exemplar has beyond its stem.
    const ex = target.form || [];
    let shared = 0;
    while (shared < stem.length && shared < ex.length && stem[shared].ipa === ex[shared].ipa) shared += 1;
    const ending = ex.slice(shared);
    if (!ending.length) return entry.form;          // the cell has gone to zero

    return repairHiatus([...entry.form, ...ending], state.phonotactics);
}

/**
 * Render one sentence in one language.
 *
 * Words whose meaning has been REPLACED are looked up by gloss, so the sentence
 * automatically uses whatever word the language now has — which is the point:
 * two sisters can render the same template with entirely different etyma.
 */
export function renderSentence(state, sentence, opts = {}) {
    const order = ORDERS[opts.order || state.syntax?.order || 'SVO'] || ORDERS.SVO;

    const lookup = (gloss) => state.entries.find((e) => e.gloss === gloss && !e.retired && !e.paradigm)
        || state.entries.find((e) => e.gloss === gloss && !e.paradigm)
        || null;

    const built = sentence.words.map((w) => {
        const entry = lookup(w.gloss);
        if (!entry) return { ...w, missing: true };
        const form = inflect(entry, w.cell, state);
        return {
            ...w,
            entryId: entry.id,
            form,
            ipa: wordToIpa(form || entry.form),
            spelling: state.romanisation.spell(form || entry.form),
            // Whether this language still uses the proto etymon for this
            // meaning, or has replaced it — the thing that makes two sisters
            // render the same sentence with different words.
            replaced: !!entry.replaced,
            inflected: !!(w.cell && form && wordToIpa(form) !== entry.ipa),
        };
    });

    // Order the clause; modifiers and particles keep their position beside the
    // word they belong to.
    const positioned = [];
    for (const role of order) {
        for (let i = 0; i < built.length; i++) {
            const w = built[i];
            if (w.role !== role) continue;
            const before = built[i - 1];
            if (before && (before.role === 'modifier' || before.role === 'particle') && !positioned.includes(before)) {
                positioned.push(before);
            }
            positioned.push(w);
            const after = built[i + 1];
            if (after && (after.role === 'particle') && !positioned.includes(after)) positioned.push(after);
        }
    }
    for (const w of built) if (!positioned.includes(w)) positioned.push(w);

    const words = positioned.filter((w) => !w.missing);
    return {
        id: sentence.id,
        english: sentence.english,
        note: sentence.note,
        words,
        ipa: words.map((w) => w.ipa).join(' '),
        spelling: capitaliseFirst(words.map((w) => w.spelling).join(' ')) + '.',
        missing: positioned.filter((w) => w.missing).map((w) => w.gloss),
    };
}

/** All sentences for one language. */
export function renderAll(state, opts) {
    return SENTENCES.map((s) => renderSentence(state, s, opts));
}

function capitaliseFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/**
 * A prose description of what the language sounds like.
 *
 * The panel shows an IPA chart and a set of tables, which answer "what are the
 * phonemes" but not "what does it sound like". This answers the second question
 * in the terms a reader actually thinks in — open or closed syllables, tonal or
 * not, clustered or not, long words or short.
 */
export function describeLanguage(state) {
    const inv = state.inventory;
    const pt = state.phonotactics;
    const bits = [];

    const vowelQualities = new Set(inv.vowels.map((v) => v.ipa.replace(/[ː˩˨˧˦˥̃]/gu, ''))).size;
    bits.push(`${inv.consonants.length} consonants and ${vowelQualities} vowel qualities`);

    if (inv.vowels.some((v) => v.f.tone)) {
        const levels = new Set(inv.vowels.map((v) => v.f.tone).filter(Boolean)).size;
        bits.push(`${levels === 1 ? 'a marginal pitch contrast' : `${levels} tones`}`);
    }

    // Syllable feel, measured rather than asserted.
    let open = 0, total = 0, clustered = 0, syl = 0, words = 0;
    for (const e of state.entries.slice(0, 400)) {
        if (e.paradigm) continue;
        words += 1;
        const ss = syllabify(e.form, pt);
        syl += ss.length;
        for (const s of ss) {
            total += 1;
            if (!s.coda.length) open += 1;
            if ((s.appendix || []).length + s.onset.length > 1) clustered += 1;
        }
    }
    const openPct = total ? open / total : 0;
    const clusterPct = total ? clustered / total : 0;
    const perWord = words ? syl / words : 0;

    bits.push(openPct > 0.8 ? 'mostly open syllables' : openPct > 0.55 ? 'a mix of open and closed syllables' : 'mostly closed syllables');
    if (clusterPct > 0.15) bits.push('frequent consonant clusters');
    else if (clusterPct < 0.04) bits.push('almost no consonant clusters');
    bits.push(perWord < 1.6 ? 'short words, often one syllable' : perWord < 2.2 ? 'words of one or two syllables' : 'longer words of two or three syllables');

    if (inv.vowels.some((v) => v.f.nasal)) bits.push('nasal vowels');
    if (inv.vowels.some((v) => v.f.long)) bits.push('a length contrast');
    if (inv.consonants.some((c) => c.f.aspirated)) bits.push('aspirated stops');

    const surv = state.erosion?.survival;
    if (surv != null) {
        bits.push(surv > 0.8 ? 'and a fully intact case system'
            : surv > 0.5 ? 'and a partly collapsed case system'
                : 'and heavily eroded inflection');
    }

    return bits.join(', ').replace(/,([^,]*)$/, ',$1');
}
