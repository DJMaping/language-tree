/**
 * Shared rulers for the measurement scripts.
 *
 * One function per quantity, used on BOTH sides of every comparison. The
 * Earth report once counted a proto's vowels raw (every toned and long variant
 * a separate vowel) and its daughters' vowels as stripped qualities, so every
 * family appeared to shrink or grow for reasons that were only the ruler. A
 * measure that is computed in two places drifts; computed here, it cannot.
 */

import { phonemicConsonants } from '../js/engine/phonology/phonemes.js';

/** Tone, length, nasality and aspiration marks, which do not make a new vowel quality. */
const PROSODIC = /[ːʰ˩˨˧˦˥̃]/gu;
const TONE_MARKS = /[˩˨˧˦˥]/gu;

export const qualityOf = (ph) => ph.ipa.replace(PROSODIC, '');

const isV = (ph) => ph.type === 'V';

/**
 * Inventory size two ways.
 *
 * `qualities` is the WALS-style count: consonants plus distinct vowel
 * qualities. `phoible` is the PHOIBLE-style count: long and nasal vowels are
 * segments of their own and tone counts once per level. Both are applied to the
 * proto and to the daughters alike.
 */
export function inventoryCounts(inventory, entries = null) {
    // With the words, consonants are phonemes: allophones (Spanish [β] of /b/)
    // are not counted (js/engine/phonology/phonemes.js), as WALS does not.
    const phones = new Set(inventory.consonants.map((c) => c.ipa)).size;
    const consonants = entries ? phonemicConsonants(entries).consonants.length : phones;
    const qualities = new Set(inventory.vowels.map(qualityOf)).size;
    const vowelSegments = new Set(inventory.vowels.map((v) => v.ipa.replace(TONE_MARKS, ''))).size;
    const toneLevels = new Set(inventory.vowels.map((v) => v.f.tone).filter((t) => t != null && t !== 0)).size;
    return {
        consonants,
        phones,
        qualities,
        toneLevels,
        walsSize: consonants + qualities,
        phoibleSize: consonants + vowelSegments + toneLevels,
    };
}

const PALATAL_AFFRICATE = /^(t͡ʃ|d͡ʒ|t͡ɕ|d͡ʑ|c͡ç|ɟ͡ʝ)/u;

/**
 * The marked series the shared catalogue is prone to spreading to everyone.
 *
 * Presence, not frequency: the question is whether a family can end up WITHOUT
 * the series, and a ratchet shows up as a series that every leaf has.
 */
export const SERIES = {
    aspirates: (inv) => inv.consonants.some((c) => c.f.aspirated),
    palatalAffricates: (inv) => inv.consonants.some((c) => PALATAL_AFFRICATE.test(c.ipa)),
    schwa: (inv) => inv.vowels.some((v) => qualityOf(v) === 'ə'),
    h: (inv) => inv.consonants.some((c) => c.ipa === 'h' || c.ipa === 'ɦ'),
    tone: (inv) => inv.vowels.some((v) => v.f.tone != null && v.f.tone !== 0),
    frontRounded: (inv) => inv.vowels.some((v) => v.f.round && v.f.back === 1),
};

export function seriesOf(inventory) {
    return Object.fromEntries(Object.entries(SERIES).map(([k, test]) => [k, test(inventory)]));
}

/** A word with no vowel at all (syllabic consonants are rare on Earth and never the norm). */
export const isVowelless = (entry) => !entry.form.some(isV);

/** A word reduced to a single consonant. */
export const isSingleConsonant = (entry) => entry.form.length === 1 && !isV(entry.form[0]);

/** Below a CV syllable: one segment, or no vowel. Where most runaway homophony lives. */
export const isSubMinimal = (entry) => entry.form.length < 2 || isVowelless(entry);

export const vowelCount = (entry) => entry.form.filter(isV).length;

/** Lexemes a reader sees: not an inflected cell, not retired. */
export const liveLexemes = (state) => state.entries.filter((e) => !e.retired && !e.paradigm && e.form?.length);
