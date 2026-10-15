/**
 * FAMILY CHARACTER, inferred from the evidence.
 *
 * DJ's decision (13 Oct 2026): a family's character, its sounds, word shape,
 * morphology and word order, is decided by the engine from the canon names,
 * not hand-picked; any dial can be fixed in data/lang-config.json, and a
 * declared value always wins. Before this every family was born with the same
 * defaults (agglutinative, nominative-accusative, five vowels, the Middle
 * Chinese voicing reconstruction) and a dice-rolled word order, so six
 * families came out as typological clones.
 *
 * The inference uses only correlations that hold across Earth's languages, and
 * a seed for what the evidence cannot decide:
 *
 *   word shape → morphology. Words of about one syllable mean little room for
 *     affixes: the isolating languages of East and Southeast Asia. Long words
 *     mean affixes stacked on stems: Turkish, Finnish, Quechua, Swahili. In
 *     between, either fusion or agglutination, so the seed decides.
 *   morphology → word order. Suffixing agglutinative languages are mostly
 *     verb-final (Greenberg's Universal 4; Dryer's counts); isolating ones are
 *     mostly verb-medial. Drawn with those biases, never forced.
 *   word order → affix position. Verb-final languages are overwhelmingly
 *     suffixing; verb-medial and verb-initial ones use prefixes far more.
 *   alignment. Mostly nominative-accusative; ergative a minority, likelier in
 *     verb-final languages (Basque, Hindi, Georgian's past).
 *   laryngeal. The consonants the names show, taken at face value, unless a
 *     family reconstructs something behind them (Dahen-Kino's voicing).
 *
 * Returns the settings plus the reason for each, so the character report can
 * say why a family came out as it did.
 */

const ORDER_BY_MORPHOLOGY = {
    isolating: { SVO: 0.72, SOV: 0.16, VSO: 0.1, VOS: 0.02 },
    agglutinative: { SOV: 0.68, SVO: 0.2, VSO: 0.08, VOS: 0.04 },
    fusional: { SVO: 0.45, SOV: 0.4, VSO: 0.13, VOS: 0.02 },
    polysynthetic: { SOV: 0.5, VSO: 0.25, SVO: 0.15, VOS: 0.1 },
};
const HEAD_FINAL = new Set(['SOV', 'OSV', 'OVS']);

/** How many cases, by type, at the proto stage (WALS 49A, a little richer than Earth today). */
export const CASE_RATES = {
    agglutinative: { 0: 0.32, 2: 0.06, 3: 0.05, 4: 0.06, 5: 0.08, 6: 0.10, 7: 0.08, 8: 0.08, 9: 0.06, 10: 0.05, 12: 0.04, 14: 0.02 },
    fusional: { 0: 0.28, 2: 0.10, 3: 0.10, 4: 0.12, 5: 0.10, 6: 0.14, 7: 0.10, 8: 0.04, 9: 0.02 },
    polysynthetic: { 0: 0.45, 2: 0.08, 3: 0.08, 4: 0.08, 5: 0.07, 6: 0.08, 7: 0.06, 8: 0.05, 9: 0.03, 10: 0.02 },
};
/** The cases beyond the core two, in the order languages tend to add them. */
export const EXTRA_CASES = ['GEN', 'DAT', 'LOC', 'ABL', 'INS', 'COM', 'ALL', 'ELA', 'ILL', 'ESS', 'PRT', 'TRA', 'VOC'];

export function inferCharacter(profile, rng, declared = {}) {
    const syl = profile?.meanSyllablesPerWord || 2;
    const reasons = {};

    let type = declared.morphology?.type;
    if (type) reasons.morphology = 'set in lang-config';
    else if (syl <= 1.6) { type = 'isolating'; reasons.morphology = `the evidence averages ${syl.toFixed(2)} syllables a word: no room for affixes`; }
    else if (syl >= 2.8) { type = 'agglutinative'; reasons.morphology = `the evidence averages ${syl.toFixed(2)} syllables a word: long words built of stacked affixes`; }
    else {
        type = rng.bool(0.5) ? 'fusional' : 'agglutinative';
        reasons.morphology = `${syl.toFixed(2)} syllables a word fits fusion or agglutination; the seed chose ${type}`;
    }

    let order = declared.syntax?.order;
    if (order) reasons.order = 'set in lang-config';
    else {
        const w = ORDER_BY_MORPHOLOGY[type] || ORDER_BY_MORPHOLOGY.fusional;
        order = rng.pickWeighted(Object.keys(w), (k) => w[k]);
        reasons.order = `drawn with the bias ${type} languages show on Earth (${Object.entries(w).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')})`;
    }
    const headFinal = HEAD_FINAL.has(order);

    let alignment = declared.morphology?.alignment;
    if (alignment) reasons.alignment = 'set in lang-config';
    else {
        alignment = rng.bool(headFinal ? 0.25 : 0.1) ? 'erg-abs' : 'nom-acc';
        reasons.alignment = `${alignment === 'erg-abs' ? 'ergative' : 'accusative'}, drawn at Earth's rate for a ${headFinal ? 'verb-final' : 'verb-medial'} language`;
    }

    const laryngeal = declared.laryngeal || 'asIs';
    reasons.laryngeal = declared.laryngeal ? 'set in lang-config' : 'the consonants the evidence shows, at face value';

    /**
     * Vowel count. Names are spelled, and a spelling with the five Latin vowel
     * letters cannot show a sixth or seventh vowel, so five qualities in the
     * evidence is the orthography's floor, not a finding; every family mined
     * exactly /i e a o u/. Where the evidence shows no more than that, the
     * count is drawn from Earth's spread (WALS 2A, Maddieson: about 16% of
     * languages have 2-4 vowel qualities, 51% have 5-6, 32% have 7 or more).
     */
    let vowelCount = declared.vowelCount;
    if (vowelCount != null) reasons.vowels = 'set in lang-config';
    else {
        const mined = (profile?.vowels || []).filter((v) => !String(v.ipa).includes('ː')).length;
        if (mined > 5) { vowelCount = Math.min(7, mined); reasons.vowels = `${mined} vowel qualities in the evidence`; }
        else {
            const W = { 3: 0.08, 4: 0.08, 5: 0.35, 6: 0.16, 7: 0.33 };
            vowelCount = Number(rng.pickWeighted(Object.keys(W), (k) => W[k]));
            reasons.vowels = `the spelling shows only five vowel letters, so ${vowelCount} was drawn at Earth's rates`;
        }
    }

    /**
     * Cases. A morphological type does not fix how many: Swahili is
     * agglutinative with none, Finnish agglutinative with fifteen. WALS 49A
     * (Iggesen): about half of Earth's languages mark no case on nouns, and
     * among the rest 2-5 and 6 or more are about as common as each other.
     * Drawn at those rates by type (a little richer than Earth's present,
     * since daughters wear cases down), unless declared.
     */
    let cases = declared.morphology?.cases ?? null;
    if (cases) reasons.cases = 'set in lang-config';
    else if (type === 'isolating') { cases = []; reasons.cases = 'none: an isolating language marks nothing on the noun'; }
    else {
        const W = CASE_RATES[type] || CASE_RATES.agglutinative;
        const n = Number(rng.pickWeighted(Object.keys(W), (k) => W[k]));
        cases = n ? ['NOM', 'ACC', ...EXTRA_CASES.slice(0, Math.max(0, n - 2))] : [];
        reasons.cases = n ? `${n} cases, drawn at Earth's rates for a${type === 'agglutinative' ? 'n' : ''} ${type} language` : `no case marking, as about half of Earth's languages (drawn at Earth's rates for a${type === 'agglutinative' ? 'n' : ''} ${type} language)`;
    }

    const suffixShare = headFinal ? 0.9 : order === 'SVO' ? 0.65 : 0.45;
    reasons.affixes = `${Math.round(suffixShare * 100)}% suffixes, as ${headFinal ? 'verb-final' : 'verb-medial and verb-initial'} languages lean`;

    return {
        morphology: { ...(declared.morphology || {}), type, alignment, cases },
        syntax: { ...(declared.syntax || {}), order },
        laryngeal,
        vowelCount,
        headFinal,
        suffixShare,
        reasons,
    };
}
