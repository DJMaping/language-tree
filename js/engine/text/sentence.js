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
    {
        id: 'passage',
        english: 'The old man came to the river at night. He saw a white bird on a stone. '
            + 'The bird said: I know your name. The man was afraid and did not speak. '
            + 'The bird flew to the mountain, and the man went to his house. '
            + 'He said to his children: I saw a star fall into the sea. But they did not believe him.',
        note: 'A long passage - enough running speech to hear the rhythm, the syllable canon and the tone.',
        long: true,
        clauses: [
            [
                { gloss: 'old', role: 'modifier', cell: null },
                { gloss: 'man (human)', role: 'subject', cell: 'NOM.SG' },
                { gloss: 'come', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'river', role: 'oblique', cell: 'DAT.SG' },
                { gloss: 'night', role: 'oblique2', cell: 'LOC.SG' },
            ],
            [
                { gloss: 'he', role: 'subject', cell: null },
                { gloss: 'see', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'white', role: 'modifier', cell: null },
                { gloss: 'bird', role: 'object', cell: 'ACC.SG' },
                { gloss: 'stone', role: 'oblique', cell: 'LOC.SG' },
            ],
            [
                { gloss: 'bird', role: 'subject', cell: 'NOM.SG' },
                { gloss: 'say', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'I', role: 'subject2', cell: null },
                { gloss: 'know', role: 'verb2', cell: 'PRS.1SG' },
                { gloss: 'name', role: 'object', cell: 'ACC.SG' },
            ],
            [
                { gloss: 'man (human)', role: 'subject', cell: 'NOM.SG' },
                { gloss: 'fear', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'and', role: 'particle', cell: null },
                { gloss: 'not', role: 'particle2', cell: null },
                { gloss: 'say', role: 'verb2', cell: 'PST.3SG' },
            ],
            [
                { gloss: 'bird', role: 'subject', cell: 'NOM.SG' },
                { gloss: 'fly', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'mountain', role: 'oblique', cell: 'DAT.SG' },
                { gloss: 'and', role: 'particle', cell: null },
                { gloss: 'man (human)', role: 'subject2', cell: 'NOM.SG' },
                { gloss: 'go', role: 'verb2', cell: 'PST.3SG' },
                { gloss: 'house', role: 'oblique2', cell: 'DAT.SG' },
            ],
            [
                { gloss: 'he', role: 'subject', cell: null },
                { gloss: 'say', role: 'verb', cell: 'PST.3SG' },
                { gloss: 'child', role: 'oblique', cell: 'DAT.PL' },
                { gloss: 'I', role: 'subject2', cell: null },
                { gloss: 'see', role: 'verb2', cell: 'PST.1SG' },
                { gloss: 'star', role: 'object', cell: 'ACC.SG' },
                { gloss: 'fall', role: 'verb3', cell: 'PST.3SG' },
                { gloss: 'sea', role: 'oblique2', cell: 'LOC.SG' },
            ],
            [
                { gloss: 'but', role: 'particle', cell: null },
                { gloss: 'they', role: 'subject', cell: null },
                { gloss: 'not', role: 'particle2', cell: null },
                { gloss: 'believe', role: 'verb', cell: 'PST.3PL' },
            ],
        ],
    },
];

/**
 * Word order.
 *
 * All six basic orders, because `syntax/parameters.js` can now draw any of them
 * and `syntax/drift.js` can move a language between them. A language whose case
 * marking has eroded away depends on order to say who did what to whom, which is
 * why English fixed its order as its cases collapsed — so the order matters
 * more, not less, as the morphology decays, and this is the display where that
 * becomes visible.
 *
 * Obliques sit next to the verb on the side the head direction puts them: before
 * it in a head-final language (where they carry postpositions), after it in a
 * head-initial one.
 */
const ORDERS = {
    SVO: ['subject', 'verb', 'object', 'oblique', 'oblique2', 'subject2', 'verb2', 'verb3'],
    SOV: ['subject', 'object', 'oblique', 'oblique2', 'verb', 'subject2', 'verb2', 'verb3'],
    VSO: ['verb', 'subject', 'object', 'oblique', 'oblique2', 'subject2', 'verb2', 'verb3'],
    VOS: ['verb', 'object', 'oblique', 'oblique2', 'subject', 'subject2', 'verb2', 'verb3'],
    OVS: ['object', 'oblique', 'oblique2', 'verb', 'subject', 'subject2', 'verb2', 'verb3'],
    OSV: ['object', 'oblique', 'oblique2', 'subject', 'verb', 'subject2', 'verb2', 'verb3'],
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
export function inflect(entry, cell, state) {
    if (!cell || !entry?.class) return entry?.form ?? null;
    const cls = state.paradigm?.classes?.[entry.class];
    const target = cls?.cells?.[cell];
    if (!cls || !target) return entry.form;
    // The exemplar's own forms are the forms: a common word with a paradigm
    // of its own (morphology/irregular.js) says exactly what its cells say,
    // irregularities and suppletion included (went, not *goed).
    if (cls.exemplarId === entry.id && target.form?.length) return target.form;

    // The exemplar's bare stem, as it stands at this stage.
    const stemEntry = state.entries.find((e) => e.id === cls.exemplarId);
    const stem = stemEntry?.form;
    if (!stem) return entry.form;

    // The ending is whatever the inflected exemplar has beyond its stem.
    const ex = target.form || [];
    let shared = 0;
    while (shared < stem.length && shared < ex.length && stem[shared].ipa === ex[shared].ipa) shared += 1;
    /**
     * A PREFIX, where the language puts its markers in front (a cell grown
     * from a word that came before the stem, in a language stressed on the
     * first syllable): the inflected form ends with the stem and adds before
     * it. Read as an ending, the whole inflected exemplar was glued onto the
     * other word.
     */
    let tail = 0;
    while (tail < stem.length && tail < ex.length && stem[stem.length - 1 - tail].ipa === ex[ex.length - 1 - tail].ipa) tail += 1;
    if (tail > shared && tail >= Math.max(1, stem.length - 1) && ex.length > tail) {
        return repairHiatus([...ex.slice(0, ex.length - tail), ...entry.form], state.phonotactics);
    }
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
    /**
     * A passage is several clauses, each ordered independently and then joined.
     * Running speech is what you need in order to hear a language's rhythm - a
     * single clause of four words tells you almost nothing about its cadence.
     */
    if (sentence.clauses) {
        const parts = sentence.clauses.map((words) =>
            renderSentence(state, { ...sentence, clauses: null, words }, opts));
        const joined = parts.map((x) => x.spelling.replace(/[.]$/, '')).join('. ');
        return {
            id: sentence.id,
            english: sentence.english,
            note: sentence.note,
            long: true,
            words: parts.flatMap((x) => x.words),
            clauses: parts,
            ipa: parts.map((x) => x.ipa).join(' \u2016 '),
            readerIpa: readerSafe(parts.map((x) => x.ipa).join(', ')),
            spelling: capitaliseFirst(joined) + '.',
            missing: parts.flatMap((x) => x.missing),
        };
    }

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

    /**
     * Order the clause; modifiers and particles travel with the word they
     * belong to.
     *
     * Which SIDE an adjective sits on is its own parameter, drawn separately
     * from the basic order and only weakly correlated with it — English is
     * verb-object with the adjective in front, and so are Mandarin, Russian and
     * German. So it is read off `syntax.adjective` rather than inferred.
     */
    const adjAfter = (opts.syntax || state.syntax)?.adjective === 'NAdj';
    const positioned = [];
    for (const role of order) {
        for (let i = 0; i < built.length; i++) {
            const w = built[i];
            if (w.role !== role) continue;
            const before = built[i - 1];
            const modifierFirst = before && before.role === 'modifier' && !adjAfter;
            if (before && (modifierFirst || before.role === 'particle') && !positioned.includes(before)) {
                positioned.push(before);
            }
            positioned.push(w);
            if (before && before.role === 'modifier' && adjAfter && !positioned.includes(before)) {
                positioned.push(before);
            }
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
        readerIpa: readerSafe(words.map((w) => w.ipa).join(' ')),
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
 * IPA that an online reader can actually pronounce.
 *
 * ipa-reader.com and the sites like it drive Amazon Polly, which understands a
 * subset of the IPA and silently mangles the rest. Three things have to go:
 *
 *   - TIE BARS. Polly reads an affricate written /t\u0361s/ as two segments or
 *     drops it outright; it has to be a plain sequence.
 *   - CHAO TONE LETTERS. Polly has no pitch control from IPA at all, so a toned
 *     vowel either fails to parse or is read as a stray character.
 *   - The fine diacritics - lowering, raising, the voicing marks - which it
 *     does not know.
 *
 * The true IPA is kept alongside this. It is a listening aid, not the language:
 * what you hear is the segments and the rhythm, and NOT the tone, which is a
 * real part of the language that no such reader can voice.
 */
/**
 * The substitution table.
 *
 * Deleting an unsupported segment was the original approach and it is the wrong
 * one: strip /\u0255/ out of a word and you hear a hole where a sound should be, and
 * 106 of them went missing across a sample of three sentences in 25 languages.
 * Every segment is mapped to the nearest thing Polly can say instead, so the
 * word keeps its shape and its syllable count.
 *
 * The single nastiest entry is `\u0261`. That is U+0261, LATIN SMALL LETTER SCRIPT G,
 * which is the correct IPA character and is NOT the ASCII `g` a reader expects \u2014
 * they look identical on screen and 30 of them were being silently dropped.
 */
const READER_MAP = new Map(Object.entries({
    // Consonants Polly has no symbol for, mapped by nearest place and manner.
    '\u0261': 'g', '\u0262': 'g', 'q': 'k', 'c': 'k', '\u025F': 'g', '\u0294': '',
    '\u0255': '\u0283', '\u0291': '\u0292', '\u0282': '\u0283', '\u0290': '\u0292', '\u00E7': 'h', '\u029D': 'j',
    '\u03B2': 'v', '\u0278': 'f', '\u028B': 'v', '\u0271': 'm',
    'x': 'h', '\u0263': 'g', '\u03C7': 'h', '\u0281': 'r', '\u0127': 'h', '\u0295': '', '\u0266': 'h',
    '\u0288': 't', '\u0256': 'd', '\u0273': 'n', '\u027D': 'r', '\u027B': 'r', '\u026D': 'l',
    '\u0272': 'nj', '\u0274': '\u014B', '\u028E': 'l', '\u029F': 'l', '\u026C': 'l', '\u026E': 'l',
    '\u027E': 'r', '\u0280': 'r', '\u0299': 'b', '\u0270': 'w', '\u0265': 'w',
    // implosives (Vietnamese, Sindhi): the plain voiced stop is the nearest a reader can say
    '\u0253': 'b', '\u0257': 'd', '\u1D91': 'd', '\u0284': 'g', '\u0260': 'g', '\u029B': 'g',
    // Vowels. Front rounded goes to its unrounded partner, central to schwa \u2014
    // the substitutions a naive listener makes anyway.
    'y': 'i', '\u00F8': 'e', '\u0153': '\u025B', '\u0276': '\u00E6',
    '\u0268': '\u026A', '\u0289': 'u', '\u026F': 'u', '\u0258': '\u0259', '\u0275': '\u0259',
    '\u0264': '\u028C', '\u025C': '\u028C', '\u025E': '\u028C', '\u0250': '\u028C', '\u00E4': '\u0251', '\u0252': '\u0254',
    /**
     * Bare /a/ is the commonest vowel in most of these languages, and English
     * has no such monophthong \u2014 /a/ occurs only inside the diphthongs /a\u026A/ and
     * /a\u028A/ \u2014 so a reader handed a lone 'a' has nothing to say, and 1,286 of them
     * were coming out silent. Mapped to /\u0251/, the vowel of "father", which is the
     * substitution an English speaker makes without being asked.
     */
    'a': '\u0251',
}));

/**
 * IPA that an online reader can actually pronounce.
 *
 * ipa-reader.com and the sites like it drive Amazon Polly, which understands a
 * subset of the IPA and silently mangles the rest. What has to go:
 *
 *   - TIE BARS. Polly reads an affricate written /t\u0361s/ as two segments or drops
 *     it outright; it has to be a plain sequence.
 *   - CHAO TONE LETTERS. Polly has no pitch control from IPA at all, so a toned
 *     vowel either fails to parse or is read as a stray character.
 *   - ASPIRATION AND SECONDARY ARTICULATION. English stops are aspirated
 *     anyway, so dropping the mark costs nothing audible.
 *   - NASALISATION. There is no nasal vowel in the inventory Polly works from;
 *     the oral vowel underneath is the closest audible thing.
 *   - The fine diacritics \u2014 lowering, raising, the voicing marks.
 *
 * Then everything left that Polly still cannot say is SUBSTITUTED rather than
 * removed, so the word keeps its shape.
 *
 * The true IPA is kept alongside this. It is a listening aid, not the language:
 * what you hear is the segments and the rhythm, and NOT the tone, the
 * aspiration or the vowel rounding, all of which are real parts of the language
 * that no such reader can voice.
 */
export function readerSafe(ipa) {
    const stripped = String(ipa)
        .replace(/\u0361/g, '')                                       // tie bars
        .replace(/[\u02E5-\u02E9]/g, '')                              // Chao tone letters
        .replace(/[\u02B0\u02BC\u02B2\u02B7]/g, '')                                       // aspiration, ejective, secondary
        .replace(/[\u0303\u031E\u031D\u032C\u0325\u0339\u031F\u0330\u032A]/g, ''); // nasalisation, dental, fine marks

    let out = '';
    for (const ch of stripped) out += READER_MAP.has(ch) ? READER_MAP.get(ch) : ch;

    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Every character `readerSafe` is allowed to emit.
 *
 * Exported so a test can assert the output stays inside it: the failure mode
 * here is silent \u2014 the reader simply says nothing where a segment should be \u2014
 * so the only way to know it still works is to check.
 */
export const READER_ALPHABET = new Set([
    ...'pbtdkgfv\u03B8\u00F0sz\u0283\u0292hmn\u014Blr\u0279wj',      // consonants
    ...'ie\u025B\u00E6\u0251\u0254ou\u028A\u028C\u0259\u026A',                 // vowels
    ...' ,.\u02C8\u02CC\u02D0',                        // prosody and punctuation
]);

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
