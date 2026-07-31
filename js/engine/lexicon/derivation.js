/**
 * Derivational morphology.
 *
 * Without this, a lexicon is 600 unrelated atoms and every daughter inherits
 * 600 unrelated atoms. With it, the lexicon has FAMILIES — "work / worker /
 * workshop", "see / sight / visible" — and that changes what the sound-change
 * engine can produce downstream in two ways that matter:
 *
 *   1. **Shared irregularity.** A sound change that hits the base hits every
 *      derivative, so a whole family shifts together and stays visibly related.
 *      That's why English "sign / signal / signature" still look like kin
 *      despite /saɪn/ vs /sɪɡn/.
 *
 *   2. **Analogical pressure.** When sound change breaks the resemblance
 *      between a base and its derivative, speakers repair it — or don't, and
 *      the pair splits into two unrelated words. "Holy / holiday" no longer
 *      feels derived; neither does "cupboard" from "cup + board". Opaque
 *      derivatives are a rich source of the irregularity that makes a lexicon
 *      feel old.
 *
 * The affix meanings below are the cross-linguistically commonest derivational
 * categories — agent, abstract, instrument, place, diminutive, causative — the
 * ones that appear again and again in unrelated families.
 */

import { wordToIpa, isVowel } from '../features.js';
import { syllabify, assignStress, isLegalOnset, isLegalCoda } from '../phonology/phonotactics.js';
import { classOf } from './roots.js';

/**
 * The derivational categories, with the source and target word class and a
 * rough productivity. Productivity is how large a share of eligible bases
 * actually take the affix — real derivation is never exhaustive, and the gaps
 * are as informative as the forms.
 */
export const DERIVATIONS = [
    { key: 'AGENT', label: 'agent noun', from: 'v', to: 'n', gloss: (g) => `one who ${g}s`, productivity: 0.45,
      note: 'Verb → "one who does it". English -er, Latin -tor, Turkish -ci. Among the most productive derivations anywhere.' },
    { key: 'ABSTRACT', label: 'abstract noun', from: ['v', 'adj'], to: 'n', gloss: (g, pos) => pos === 'adj' ? `${g}ness` : `the act of ${g}ing`, productivity: 0.40,
      note: 'Quality or action as a thing. English -ness/-ity/-ing, Latin -tio.' },
    { key: 'INSTRUMENT', label: 'instrument noun', from: 'v', to: 'n', gloss: (g) => `thing for ${g}ing`, productivity: 0.22,
      note: 'Verb → the tool. Frequently the same affix as AGENT, which is why "cooker" is ambiguous in English.' },
    { key: 'PLACE', label: 'place noun', from: ['v', 'n'], to: 'n', gloss: (g) => `place of ${g}`, productivity: 0.20,
      note: 'Locative nominal. English -ery, Latin -arium, Arabic ma-.' },
    { key: 'DIM', label: 'diminutive', from: 'n', to: 'n', gloss: (g) => `little ${g}`, productivity: 0.30,
      note: 'Diminutives are unusually stable and unusually prone to lexicalising — Latin "auricula" (little ear) simply replaced "auris" in Romance.' },
    { key: 'AUG', label: 'augmentative', from: 'n', to: 'n', gloss: (g) => `great ${g}`, productivity: 0.14 },
    { key: 'CAUS', label: 'causative', from: 'v', to: 'v', gloss: (g) => `cause to ${g}`, productivity: 0.35,
      note: 'Extremely common as a derivation and a frequent source of new transitive verbs. Often fossilises into unanalysable pairs — English "sit/set", "lie/lay", "fall/fell".' },
    { key: 'ADJZ', label: 'adjectiviser', from: 'n', to: 'adj', gloss: (g) => `of or like ${g}`, productivity: 0.32 },
    { key: 'PRIV', label: 'privative', from: 'n', to: 'adj', gloss: (g) => `without ${g}`, productivity: 0.18 },
    { key: 'COLL', label: 'collective', from: 'n', to: 'n', gloss: (g) => `${g}s collectively`, productivity: 0.16 },
];

/**
 * Generate an affix shape.
 *
 * Affixes are short — usually one light syllable — because they are, by
 * definition, the most frequent morphemes in the language, and Zipf's law of
 * abbreviation applies to bound morphemes as forcefully as to words. They are
 * also phonologically simple: an affix with a complex onset is rare, and one
 * that violates the language's phonotactics is impossible.
 */
function makeAffix(pools, pt, rng, position) {
    const vowel = rng.pickWeighted(pools.vowels, (v) => v.w).ph;
    const cons = rng.pickWeighted(pools.onsets, (o) => o.w).ph;
    if (position === 'suffix') {
        // A suffix beginning with a consonant is the safe default: it can be
        // appended to a vowel-final stem without hiatus, and to a
        // consonant-final stem it forms a medial cluster the language must
        // then resolve — which is itself a useful source of later change.
        return rng.bool(0.75) ? [cons, vowel] : [vowel];
    }
    return rng.bool(0.7) ? [cons, vowel] : [vowel];
}

/**
 * Build the language's derivational affix inventory.
 *
 * Affix POSITION correlates with the stress rule. This language has fixed FINAL
 * stress, which shelters suffixes and starves anything before the stem — so a
 * prefix-heavy system would be eroded away almost as fast as it was built. The
 * generator therefore weights position against the stress rule rather than
 * choosing at random.
 */
export function generateAffixes(phonology, pools, rng) {
    const { phonotactics: pt } = phonology;
    const stress = pt.stress.rule;
    // Final stress protects suffixes; initial stress protects prefixes.
    const pSuffix = stress === 'final' ? 0.85 : stress === 'initial' ? 0.45 : 0.7;

    const used = new Set();
    return DERIVATIONS.map((d) => {
        const position = rng.bool(pSuffix) ? 'suffix' : 'prefix';
        let form = null;
        for (let i = 0; i < 20; i++) {
            const cand = makeAffix(pools, pt, rng, position);
            const key = wordToIpa(cand);
            // Two derivations sharing one affix is realistic (English -er is
            // agent AND instrument AND comparative), but it should be a
            // deliberate collision, not the default.
            if (!used.has(key) || rng.bool(0.15)) { used.add(key); form = cand; break; }
        }
        return { ...d, position, form: form || makeAffix(pools, pt, rng, position), ipa: wordToIpa(form || []) };
    });
}

/**
 * Apply the affix inventory across the lexicon, producing derived lexemes.
 *
 * Derivatives keep a pointer to their base and to the affix used, so the
 * etymology display can say "*ruod͡ʑam-ki (eater) ← *ruod͡ʑam (eat) + AGENT"
 * and so a later analogical repair knows what the transparent form would be.
 */
export function deriveLexemes(roots, affixes, phonology, rng, opts = {}) {
    const { phonotactics: pt } = phonology;
    const limit = opts.limit ?? Infinity;
    const out = [];

    for (const affix of affixes) {
        const sources = Array.isArray(affix.from) ? affix.from : [affix.from];
        const eligible = roots.filter((r) => sources.includes(r.pos) && !r.derivedFrom);
        for (const base of eligible) {
            if (out.length >= limit) break;
            // Productivity is frequency-biased: derivation applies most freely
            // to common bases, which is why irregular high-frequency words have
            // large word families and rare words often have none.
            const p = affix.productivity * (0.6 + 0.4 * Math.min(1, 200 / base.rank));
            if (!rng.bool(p)) continue;

            const form = attach(base.form, affix, pt);
            if (!form) continue;
            const sylls = assignStress(syllabify(form, pt), pt.stress.rule);
            out.push({
                id: `${base.id}+${affix.key}`,
                form,
                ipa: wordToIpa(form),
                gloss: affix.gloss(base.gloss, base.pos),
                pos: affix.to,
                domain: base.domain,
                core: false,
                // A derivative is always rarer than its base. Pushing it down
                // the frequency curve matters: it makes derivatives the first
                // casualties of analogy and the last to resist levelling.
                rank: Math.round(base.rank * (1.6 + rng.next())),
                class: classOf(form, affix.to),
                syllables: sylls.length,
                stressIndex: sylls.findIndex((s) => s.stress === 1),
                irregular: false,
                derivedFrom: { base: base.id, affix: affix.key },
            });
        }
    }
    return out;
}

/**
 * Glue an affix to a stem, repairing the join if the language forbids it.
 *
 * Real morphology does exactly this — the point where two morphemes meet is
 * where languages insert linking vowels, delete one of two identical segments,
 * or assimilate. Getting the repair right at the proto stage means the daughter
 * languages inherit a plausible boundary rather than an impossible cluster.
 */
function attach(stem, affix, pt) {
    if (affix.position === 'prefix') {
        const joined = [...affix.form, ...stem];
        return repairJoin(joined, affix.form.length, pt);
    }
    const joined = [...stem, ...affix.form];
    return repairJoin(joined, stem.length, pt);
}

function repairJoin(segments, boundary, pt) {
    const a = segments[boundary - 1];
    const b = segments[boundary];
    if (!a || !b) return segments;

    // Two identical adjacent segments degeminate — near-universal where the
    // language has no length contrast.
    if (a.ipa === b.ipa) return [...segments.slice(0, boundary), ...segments.slice(boundary + 1)];

    // Vowel + vowel that isn't a licensed diphthong: drop the first. This is
    // elision, and it's what Latin, Greek and Sanskrit all did at morpheme
    // boundaries.
    if (isVowel(a) && isVowel(b)) {
        const diphs = pt.nucleus?.diphthongs || [];
        if (!diphs.includes(a.ipa + b.ipa)) {
            return [...segments.slice(0, boundary - 1), ...segments.slice(boundary)];
        }
    }

    // Consonant + consonant: legal only if it parses as coda + onset.
    if (!isVowel(a) && !isVowel(b)) {
        if (!isLegalCoda([a], pt) || !isLegalOnset([b], pt)) {
            return [...segments.slice(0, boundary - 1), ...segments.slice(boundary)];
        }
    }
    return segments;
}

export function formatAffixes(affixes) {
    return affixes.map((a) => {
        const shape = a.position === 'suffix' ? `-${a.ipa}` : `${a.ipa}-`;
        return `  ${a.key.padEnd(10)} ${shape.padEnd(8)} ${a.label} (${(a.productivity * 100).toFixed(0)}% productive)`;
    }).join('\n');
}
