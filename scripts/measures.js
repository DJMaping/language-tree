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

/**
 * The sound chapters of WALS beyond size and tone (18 Oct 2026, DJ: "keep
 * improving the sound systems"), each read off a language the way its WALS
 * chapter defines it, from the consonant PHONEMES (phonemes.js: an allophone
 * is not a consonant of its own) and the words. A pattern counts when at
 * least 1% of the words show it: WALS codes what a language allows, and a
 * handful of odd words is not an allowance.
 */
const SHARE = 0.01;
const isC = (ph) => ph.type === 'C';
const liquidOrGlide = (ph) => isC(ph) && (ph.f.lateral || ['trill', 'tap', 'approximant'].includes(ph.f.manner));
const obstruent = (ph) => ['stop', 'affricate', 'fricative'].includes(ph.f.manner);

const GLIDES = new Set(['j', 'w', 'ɥ', 'ɰ']);

/**
 * WALS 12A (Maddieson): simple (C)V; moderately complex, one coda or C +
 * liquid/glide onsets; complex, more. Read as WALS reads it: a doubled
 * consonant is one long one (Italian -tt-), and a glide after a vowel is the
 * second half of a diphthong (English "wild" has no cluster before the l).
 */
export function syllableStructure(entries, opts = {}) {
    let words = 0, moderate = 0, complex = 0;
    for (const e of entries) {
        if (e.retired || !e.form?.length || !e.form.some((p) => p.type === 'V')) continue;
        words += 1;
        const runs = [];
        let run = [], seenV = false;
        for (const ph of e.form) {
            if (isC(ph)) {
                if (run.length && run[run.length - 1].ipa === ph.ipa) continue;
                if (!run.length && seenV && GLIDES.has(ph.ipa)) continue;
                run.push(ph);
            } else if (ph.type === 'V') { runs.push({ cs: run, initial: !seenV }); run = []; seenV = true; }
        }
        const final = run;
        let mod = false, cx = false;
        for (const { cs, initial } of runs) {
            const k = cs.length;
            if (k === 0) continue;
            if (initial) {
                if (k === 2 && liquidOrGlide(cs[1])) mod = true;
                else if (k >= 2) cx = true;
                continue;
            }
            // between vowels: the onset takes one consonant, or two if the second is a liquid or glide
            const onset = k >= 2 && liquidOrGlide(cs[k - 1]) ? 2 : 1;
            const coda = k - onset;
            if (onset === 2) mod = true;
            if (coda >= 1) mod = true;
            if (coda >= 2) cx = true;
        }
        if (final.length >= 1) mod = true;
        if (final.length >= 2) cx = true;
        if (cx) complex += 1;
        else if (mod) moderate += 1;
    }
    if (!words) return null;
    if (opts.shares) return [+(moderate / words).toFixed(4), +(complex / words).toFixed(4)];
    // a canon, not a handful of compounds: complex clusters in 3% of the words, codas in 5%
    if (complex / words >= 0.03) return 'complex';
    if ((moderate + complex) / words >= 0.05) return 'moderately complex';
    return 'simple';
}

/** WALS 4A, 6A, 7A, 8A, 9A, 10A, 14A, 18A and 19A. */
export function soundTypology(inventory, entries, phonotactics) {
    const live = entries.filter((e) => !e.retired && e.form?.length);
    const cs = phonemicConsonants(entries).consonants;
    const has = (pred) => cs.some(pred);
    const pairs = (manner) => {
        const at = new Map();
        for (const c of cs) {
            if (c.f.manner !== manner || c.f.lateral || c.f.place === 'glottal') continue;
            if (!at.has(c.f.place)) at.set(c.f.place, new Set());
            at.get(c.f.place).add(!!c.f.voice);
        }
        return [...at.values()].some((s) => s.size === 2);
    };
    const vp = pairs('stop'), vf = pairs('fricative');
    const voicing = vp && vf ? 'in both' : vp ? 'in plosives alone' : vf ? 'in fricatives alone' : 'none';

    const uvStop = has((c) => c.f.place === 'uvular' && (c.f.manner === 'stop' || c.f.manner === 'affricate'));
    const uvCont = has((c) => c.f.place === 'uvular' && !['stop', 'affricate', 'nasal'].includes(c.f.manner));
    const uvulars = uvStop && uvCont ? 'stops and continuants' : uvStop ? 'stops only' : uvCont ? 'continuants only' : 'none';

    // a glottalised voiceless obstruent is an ejective, a glottalised voiced stop an implosive
    const ej = has((c) => c.f.glottalised && !c.f.voice), imp = has((c) => c.f.glottalised && c.f.voice);
    const glottalized = ej && imp ? 'ejectives and implosives' : ej ? 'ejectives' : imp ? 'implosives' : 'none';

    const l = has((c) => c.ipa === 'l');
    const latObs = has((c) => c.f.lateral && obstruent(c));
    const latAny = has((c) => c.f.lateral);
    const laterals = l ? (latObs ? '/l/ and lateral obstruents' : '/l/ only')
        : latObs ? 'lateral obstruents but no /l/' : latAny ? 'laterals but no /l/' : 'no laterals';

    const words = Math.max(1, live.length);
    const ng = has((c) => c.ipa === 'ŋ');
    const ngInitial = live.filter((e) => e.form[0]?.ipa === 'ŋ').length / words >= SHARE / 2;
    const velarNasal = !ng ? 'none' : ngInitial ? 'word-initially too' : 'not word-initially';

    // a nasal vowel contrasts once it stands where no nasal consonant follows to explain it
    const freeNasal = live.filter((e) => e.form.some((p, i) => p.type === 'V' && p.f.nasal
        && !(e.form[i + 1] && isC(e.form[i + 1]) && e.form[i + 1].f.manner === 'nasal'))).length;
    const nasalVowels = inventory.vowels.some((v) => v.f.nasal) && freeNasal / words >= SHARE ? 'present' : 'absent';

    const STRESS = { initial: 'initial', final: 'ultimate', penultimate: 'penultimate', antepenultimate: 'antepenultimate', moraicTrochee: 'no fixed stress', iambic: 'no fixed stress' };
    const stress = STRESS[phonotactics?.stress?.rule] ?? null;

    // /h/ is no fricative here: WALS 18A has Hawaiian, with h alone, among the languages without them
    const noB = !has((c) => c.f.place === 'bilabial'), noF = !has((c) => c.f.manner === 'fricative' && c.f.place !== 'glottal'), noN = !has((c) => c.f.manner === 'nasal');
    const commonAbsent = noB && noN ? 'no bilabials or nasals' : noF && noN ? 'no fricatives or nasals'
        : noB ? 'no bilabials' : noF ? 'no fricatives' : noN ? 'no nasals' : 'all present';

    const lv = has((c) => c.f.place === 'labiovelar' && (c.f.manner === 'stop' || c.f.manner === 'nasal'));
    const ph = has((c) => c.f.place === 'pharyngeal');
    const th = has((c) => c.ipa === 'θ' || c.ipa === 'ð');
    const uncommon = ph && th ? 'pharyngeals and "th"' : lv ? 'labial-velars' : ph ? 'pharyngeals' : th ? '"th" sounds' : 'none';

    return { voicing, uvulars, glottalized, laterals, velarNasal, nasalVowels, syllableStructure: syllableStructure(entries), syllableShares: syllableStructure(entries, { shares: true }), stress, commonAbsent, uncommon };
}
