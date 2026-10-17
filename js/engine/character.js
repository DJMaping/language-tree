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

import { GENDER_RATES, GENDER_SYSTEMS, genderValues } from './morphology/gender.js';
import { drawClassifierSpec } from './morphology/classifiers.js';
import { drawPronounSpec } from './morphology/pronouns.js';
import { drawArticleSpec } from './morphology/articles.js';
import { drawMoodSpec } from './morphology/moods.js';

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
    else if (syl >= 2.8) {
        /**
         * The longest words of all are sometimes whole clauses: a
         * polysynthetic language builds the object into the verb and marks
         * subject and object on it (Mohawk, Inuktitut, Chukchi). About one
         * of Earth's languages in five (DJ, 17 Oct 2026: "build it").
         */
        type = syl >= 3 && rng.bool(0.4) ? 'polysynthetic' : 'agglutinative';
        reasons.morphology = type === 'polysynthetic'
            ? `the evidence averages ${syl.toFixed(2)} syllables a word, long enough for whole clauses in a word; the seed chose polysynthesis`
            : `the evidence averages ${syl.toFixed(2)} syllables a word: long words built of stacked affixes`;
    }
    else {
        /**
         * Fusion is the rarer of the two on Earth: about one language in
         * eight that inflects (WALS 20A and 26A; Indo-European is most of
         * them), agglutination the rest. An even draw made five of Andah's
         * families fusional and 30% of its genera (8% of Earth's).
         */
        type = rng.bool(0.3) ? 'fusional' : 'agglutinative';
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
        /**
         * Among Earth's languages that mark case at all, about a third mark
         * it ergatively (WALS 98A: 32 of 92), nearly all of them verb-final
         * or verb-initial. Drawn at 25% and 10%, Andah's case-marking genera
         * were 7% ergative against Earth's 17% of all languages.
         */
        alignment = rng.bool(headFinal ? 0.4 : 0.15) ? 'erg-abs' : 'nom-acc';
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

    /**
     * Gender (morphology/gender.js): none, masculine and feminine, with a
     * neuter, animate and inanimate, or four to eight noun classes, drawn at
     * Earth's rates for the family's type. Drawn last, so every other trait
     * draws as it did.
     */
    let gender = declared.morphology?.gender ?? null;
    let genderCount = declared.morphology?.genderCount ?? null;
    if (gender) reasons.gender = 'set in lang-config';
    else {
        const W = GENDER_RATES[type] || GENDER_RATES.agglutinative;
        gender = rng.pickWeighted(Object.keys(W), (k) => W[k]);
        if (gender === 'classes') genderCount = 4 + Math.floor(rng.float(0, 4.999));
        reasons.gender = gender === 'none'
            ? `no gender, as about half of Earth's languages`
            : `${GENDER_SYSTEMS[gender].label}${genderCount ? ` (${genderCount})` : ''}, drawn at Earth's rates for a${type === 'agglutinative' ? 'n' : ''} ${type} language`;
    }
    const genders = genderValues(gender, genderCount);

    /**
     * Numeral classifiers (morphology/classifiers.js): none, optional or
     * obligatory, drawn at Earth's rates for the type and rarer with gender;
     * lang-config may declare one ("classifiers": "obligatory"). Drawn after
     * gender, so every other trait draws as it did.
     */
    const clf = drawClassifierSpec(rng, type, gender, declared.morphology?.classifiers ?? null);
    reasons.classifiers = clf.reason;

    /**
     * Pronouns (morphology/pronouns.js): two words for "we" or one, and a
     * polite "you" or none, at Earth's rates; lang-config may declare
     * "clusivity": true/false and "polite": "plural"/"noun"/"they"/"she"/"none".
     */
    const prn = drawPronounSpec(rng, { clusivity: declared.morphology?.clusivity, polite: declared.morphology?.polite });
    reasons.pronouns = prn.reason;

    // Articles (morphology/articles.js); lang-config may declare
    // "definiteArticle" and "indefiniteArticle".
    const art = drawArticleSpec(rng, { definiteArticle: declared.morphology?.definiteArticle, indefiniteArticle: declared.morphology?.indefiniteArticle });
    reasons.articles = art.reason;

    // Moods (morphology/moods.js): commands, "don't", wishes; lang-config may
    // declare "imperative", "prohibitive" and "irrealis".
    const mood = drawMoodSpec(rng, { type, order }, declared.morphology || {});
    reasons.moods = mood.reason;

    return {
        morphology: { ...(declared.morphology || {}), type, alignment, cases, gender, genders, classifiers: clf.spec, pronouns: prn.spec, articles: art.spec, moods: mood.spec },
        syntax: { ...(declared.syntax || {}), order },
        laryngeal,
        vowelCount,
        headFinal,
        suffixShare,
        reasons,
    };
}
