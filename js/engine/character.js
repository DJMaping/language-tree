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
import { drawEvidentialSpec } from './morphology/evidentials.js';

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
// the last three for the largest systems: Finnish adessive -lla and abessive -tta, Hungarian superessive -on
export const EXTRA_CASES = ['GEN', 'DAT', 'LOC', 'ABL', 'INS', 'COM', 'ALL', 'ELA', 'ILL', 'ESS', 'PRT', 'TRA', 'VOC', 'ADE', 'ABE', 'SUP'];

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
        // 0.4 and 0.15 left 12% of Andah's genera ergative against 17% (18 Oct 2026)
        alignment = rng.bool(headFinal ? 0.48 : 0.2) ? 'erg-abs' : 'nom-acc';
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

    // Evidentials (morphology/evidentials.js): how the speaker knows; lang-config
    // may declare "evidentials": "none" or a state (Ip, Ia, Dp, Da, It, Dt, X, Im).
    const evid = drawEvidentialSpec(rng, { type, order }, declared.morphology || {});
    reasons.evidentials = evid.reason;

    /**
     * Stress (WALS 14A, 502 languages), where the config is silent. Every
     * family once took the engine's default, the penult, so 60% of Andah's
     * languages stressed the penult against Earth's 22%, and 6% had no fixed
     * stress against 44% (mostly weight-sensitive: Latin, Arabic, Hindi).
     * The weight-sensitive share splits between the Latin rule (moraic
     * trochee) and iambs; Earth's second- and third-syllable rules (3%) have
     * no rule of their own here.
     */
    const STRESS_EARTH = { moraicTrochee: 0.29, iambic: 0.15, penultimate: 0.22, initial: 0.18, final: 0.10, antepenultimate: 0.03 };
    const stress = declared.stress ?? rng.pickWeighted(Object.keys(STRESS_EARTH), (k) => STRESS_EARTH[k]);
    reasons.stress = declared.stress ? 'set in lang-config' : "drawn from Earth's spread (WALS 14A)";

    /**
     * Object agreement (WALS 102A: half of Earth's languages mark both subject
     * and object on the verb, Swahili a-li-ki-soma "he read it", Georgian,
     * Hungarian's definite conjugation, Quechua, Basque; Turkish and Finnish
     * mark the subject only). Only polysynthetic families had it: 61% of
     * Andah marked the subject alone against 19%.
     */
    const objectAgreement = declared.morphology?.objectAgreement
        ?? (type === 'polysynthetic' ? true : type === 'agglutinative' ? rng.bool(0.6) : type === 'fusional' ? rng.bool(0.4) : false);
    /**
     * A future tense of the verb's own at the proto (WALS 67A: half of
     * Earth's languages have an inflectional future); else only a later one
     * grown from "go" or "want" (grammaticalisation.js): 21% of Andah had one.
     */
    const tenses = declared.morphology?.tenses
        ?? (type === 'agglutinative' || type === 'fusional' ? ['PRS', 'PST', ...(rng.bool(0.4) ? ['FUT'] : [])] : undefined);
    /**
     * Person markers before the verb stem (WALS 26A: prefixing languages are
     * 16% of Earth's and "equal" ones 15%): Swahili ni-na-soma "I am
     * reading", the Mayan and Athabaskan languages. Far commoner where the
     * verb comes before its object, since subject pronouns before the verb
     * fuse onto it. Only where markers stack: a fusional portmanteau stays an
     * ending. Every Andah paradigm was built of endings alone: 77% of Andah
     * was strongly suffixing against 42%. A quarter as likely where the first
     * syllable of the word is stressed, since the prefix would take the stress
     * from the stem: prefixing languages stress the stem or count from the end
     * of the word (Bantu the penult), and fixed initial stress goes with
     * suffixes (Finnish, Hungarian). WALS 26A by 83A: equal or prefixing in
     * 16% of Earth's object-verb languages and 43% of its verb-object ones
     * (more of those with affixes to place).
     */
    const prefixP = (headFinal ? 0.18 : 0.55) * (stress === 'initial' ? 0.25 : 1);
    const personPosition = declared.morphology?.personPosition
        ?? (type === 'agglutinative' || type === 'polysynthetic' ? (rng.bool(prefixP) ? 'prefix' : 'suffix') : 'suffix');
    if (personPosition === 'prefix') reasons.affixes += `; person markers before the verb stem${declared.morphology?.personPosition ? ' (set in lang-config)' : `, drawn at ${Math.round(prefixP * 100)}% for a${type === 'agglutinative' ? 'n' : ''} ${type} ${headFinal ? 'verb-final' : 'verb-medial or verb-initial'} language${stress === 'initial' ? ' stressed on its first syllable' : ''}`}`;
    /**
     * And tense before the stem too, after the person (Swahili ni-li-soma
     * "I read", a-ta-soma "she will read"): tense and aspect are prefixes in
     * 54% of Earth's prefixing languages and mixed in 22% (WALS 69A by 26A).
     * Where persons come first and tense after, the language is "equal".
     */
    const tensePosition = declared.morphology?.tensePosition
        ?? (personPosition === 'prefix' && rng.bool(0.5) ? 'prefix' : 'suffix');
    if (tensePosition === 'prefix') reasons.affixes += '; tense before the stem as well, after the person';

    /**
     * A remote past beside the recent one (WALS 66A: 18% of Earth's languages,
     * nearly a third of those with a past tense, mark how long ago a thing
     * happened: the Bantu today-past and earlier-past, Kikuyu, Yagua's five
     * degrees). PST is then the recent past and REM the remote one, and a
     * daughter lets them fall together like any other pair of cells. Not one
     * Andah language had a remoteness distinction. Drawn last, so every other
     * trait draws as it did. (A polysynthetic paradigm's tenses otherwise
     * come from its type in morphology/paradigm.js.)
     */
    const baseTenses = tenses ?? (type === 'polysynthetic' ? ['PRS', 'PST', 'FUT'] : null);
    const remote = !declared.morphology?.tenses && !!baseTenses?.includes('PST') && rng.bool(0.3);
    const at = baseTenses ? baseTenses.indexOf('PST') + 1 : 0;
    const tensesNow = remote ? [...baseTenses.slice(0, at), 'REM', ...baseTenses.slice(at)] : tenses;
    /**
     * Which argument the verb agrees with in an ergative language without
     * object agreement: the subject of every verb, or the absolutive, the
     * subject of an intransitive verb and the object of a transitive one
     * (Avar, Chechen, the Hindi perfective: WALS 102A's "only the P
     * argument", 6% of Earth's languages and nearly all of them ergative;
     * 1% of Andah's). Drawn last.
     */
    const agreement = declared.morphology?.agreement
        ?? (alignment === 'erg-abs' && !objectAgreement && type !== 'isolating' && rng.bool(0.4) ? 'absolutive' : 'subject');
    /**
     * Aspect in place of tense (WALS 66A: 40% of Earth's languages have no
     * past tense, and some of them inflect a great deal: Classical Arabic
     * kataba "wrote, has written" is a perfective, not a past, and the
     * Oceanic languages mark what is completed, not when). A perfective where
     * the past would be, one family in five, and no remote past to go with
     * it; not where what the speaker did not see is a past of its own
     * (evidentials.js). Every Andah family that inflected was founded with a
     * past: 30% of its languages had none against Earth's 40%. Drawn last,
     * so every other trait draws as it did.
     */
    const tenseList = tensesNow ?? baseTenses;
    const aspectual = !declared.morphology?.tenses && !!tenseList?.includes('PST')
        && !['It', 'Dt', 'X'].includes(evid.spec?.state) && rng.bool(0.2);
    const tensesFinal = aspectual ? tenseList.filter((t) => t !== 'REM').map((t) => (t === 'PST' ? 'PFV' : t)) : tensesNow;
    if (aspectual) reasons.affixes += '; a perfective aspect where a past would be (what is done, not when), as Classical Arabic and the Oceanic languages have';

    return {
        stress,
        morphology: { ...(declared.morphology || {}), type, alignment, cases, gender, genders, classifiers: clf.spec, pronouns: prn.spec, articles: art.spec, moods: mood.spec, evidentials: evid.spec,
            objectAgreement, personPosition, tensePosition, agreement, ...(tensesFinal ? { tenses: tensesFinal } : {}) },
        syntax: { ...(declared.syntax || {}), order },
        laryngeal,
        vowelCount,
        headFinal,
        suffixShare,
        reasons,
    };
}
