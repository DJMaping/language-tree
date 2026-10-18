/**
 * Generating the proto root lexicon.
 *
 * The aim is a lexicon that sounds like ONE language rather than a scatter of
 * legal syllables. Three things do that work:
 *
 *   1. **Frequency-weighted segments.** Phonemes are not chosen uniformly. Each
 *      is weighted by how often it actually turns up in the mined corpus, so
 *      the common sounds stay common. A language where /f/ and /n/ are equally
 *      likely does not sound like a language.
 *
 *   2. **Zipf's law of abbreviation.** Frequent words are short. This is one of
 *      the most robust quantitative universals there is — it holds in every
 *      language ever measured, and it is why English has "I, go, do, be, one"
 *      and not five-syllable equivalents. So root length is drawn against
 *      frequency rank, not independently of it.
 *
 *   3. **Phonologically conditioned inflection classes.** A root's declension
 *      or conjugation class is decided by how the stem ENDS, the way Latin's
 *      five declensions are really just "stem in -ā, -o, -consonant, -u, -ē".
 *      This matters enormously later: when a sound change alters stem-final
 *      segments, it reshuffles class membership, and the mess it leaves behind
 *      is what analogy then has to clean up. Classes assigned arbitrarily would
 *      be immune to sound change, and the whole erosion story would never fire.
 */

import { isVowel, wordToIpa, parseWord } from '../features.js';
import { syllabify, assignStress, shapeOf } from '../phonology/phonotactics.js';
import { zipfWeight } from '../rng.js';

// ---------------------------------------------------------------------------
// Segment pools
// ---------------------------------------------------------------------------

/**
 * Build frequency-weighted pools of segments from the mined corpus.
 *
 * The profile counts DAUGHTER segments; the inventory holds PROTO segments. The
 * segment map bridges the two, so a proto *b inherits the corpus frequency of
 * the daughter /p/ that reflects it — otherwise every reconstructed segment
 * would look unattested and fall back to the floor weight, flattening the
 * distribution the mining worked to establish.
 */
export function buildPools(inventory, profile, segmentMap = new Map()) {
    const toProto = (ipa) => segmentMap.get(ipa) || ipa;

    // Accumulate corpus counts onto proto segments.
    const onsetW = new Map();
    const codaW = new Map();
    const vowelW = new Map();
    for (const c of profile.consonants) {
        const key = toProto(c.ipa);
        onsetW.set(key, (onsetW.get(key) || 0) + c.onset);
        codaW.set(key, (codaW.get(key) || 0) + c.coda);
    }
    for (const v of profile.vowels) {
        const key = toProto(v.ipa.replace('ː', ''));
        vowelW.set(key, (vowelW.get(key) || 0) + v.count);
    }

    // Every phoneme in the inventory gets a floor weight, so segments the
    // corpus happens not to attest (because names are a small and biased
    // sample) can still appear — just rarely.
    const FLOOR = 1.5;
    const consonants = inventory.consonants;
    const vowels = inventory.vowels.filter((v) => !v.f.long);

    return {
        onsets: consonants.map((ph) => ({ ph, w: (onsetW.get(ph.ipa) || 0) + FLOOR })),
        codas: consonants.map((ph) => ({ ph, w: (codaW.get(ph.ipa) || 0) + FLOOR * 0.2 })),
        vowels: vowels.map((ph) => ({ ph, w: (vowelW.get(ph.ipa) || 0) + FLOOR })),
    };
}

/** Syllable-shape statistics read off the mined corpus. */
export function shapeStats(profile) {
    const total = profile.syllableShapes.reduce((a, s) => a + s.count, 0) || 1;
    const frac = (test) => profile.syllableShapes.filter((s) => test(s.key)).reduce((a, s) => a + s.count, 0) / total;
    return {
        pOnset: frac((k) => k.startsWith('C')),
        pComplexOnset: frac((k) => k.startsWith('CC')),
        pCoda: frac((k) => /C$/.test(k) && !/^C+$/.test(k)),
        pDiphthong: frac((k) => k.includes('VV')),
        meanSyllables: profile.meanSyllablesPerWord || 2,
    };
}

// ---------------------------------------------------------------------------
// Form generation
// ---------------------------------------------------------------------------

/** Build one syllable honouring the phonotactic spec. */
function makeSyllable(pools, pt, stats, rng, { allowCoda = true, needOnset = false } = {}) {
    const onset = [];
    if (needOnset || rng.bool(stats.pOnset)) {
        // A complex onset is only possible if the language licenses one, and
        // then only from the licensed list — this language allows *tr and
        // nothing else, so we don't roll a random cluster and hope.
        const licensed = pt.onset.licensedExceptions || [];
        if (pt.onset.max > 1 && licensed.length && rng.bool(stats.pComplexOnset / Math.max(stats.pOnset, 0.01))) {
            const pick = rng.pick(licensed);
            try { onset.push(...parseWord(pick)); } catch { /* fall through to simple */ }
        }
        if (!onset.length) onset.push(rng.pickWeighted(pools.onsets, (o) => o.w).ph);
    }

    const nucleus = [];
    const diphs = pt.nucleus?.diphthongs || [];
    if (diphs.length && rng.bool(stats.pDiphthong)) {
        try { nucleus.push(...parseWord(rng.pick(diphs))); } catch { /* fall through */ }
    }
    if (!nucleus.length) nucleus.push(rng.pickWeighted(pools.vowels, (v) => v.w).ph);

    const coda = [];
    if (allowCoda && pt.coda.max > 0 && rng.bool(stats.pCoda)) {
        const allowed = pt.coda.allowed && pt.coda.allowed.length
            ? pools.codas.filter((c) => pt.coda.allowed.includes(c.ph.ipa))
            : pools.codas;
        if (allowed.length) coda.push(rng.pickWeighted(allowed, (c) => c.w).ph);
    }

    return [...onset, ...nucleus, ...coda];
}

/**
 * How many syllables should a root of this frequency rank have?
 *
 * Zipf's law of abbreviation: the commonest words are the shortest, so the
 * expected length rises with rank, from 0.7 of the language's mean at the top
 * of the lexicon to 1.2 of it in the tail (about the mean overall).
 *
 * The mean is the one the family's own names show. This used to claim it was
 * "tuned to land on the corpus's own mean" while never reading it: every
 * proto got about 1.9 syllables per word, so a family whose languages are
 * called Bewilojega and Hozutuxepi (3.6 syllables) started as short as one
 * whose languages are called Qai and Xia. Clamped to 1.4-3.4, the range of
 * Earth's basic vocabularies (Vietnamese at the short end, Hawaiian and
 * Swahili at the long one).
 */
function syllableCount(rank, stats, rng) {
    const mean = Math.max(1.4, Math.min(3.4, stats.meanSyllables || 2));
    const expected = mean * (0.7 + 0.5 * Math.min(1, rank / 400));
    // One syllable plus a Poisson number more: a word has at least one.
    const lambda = Math.max(0.05, expected - 1);
    const limit = Math.exp(-lambda);
    let extra = 0;
    for (let p = rng.next(); p > limit && extra < 4; p *= rng.next()) extra += 1;
    return 1 + extra;
}

/** Generate one root form. */
export function makeRootForm(pools, pt, stats, rng, rank) {
    const n = syllableCount(rank, stats, rng);
    const out = [];
    for (let i = 0; i < n; i++) {
        // Medial codas are rarer than final ones in an open-syllable language —
        // a coda before another consonant is exactly what cluster
        // simplification later goes after.
        const allowCoda = i === n - 1 ? true : rng.bool(0.4);

        /**
         * Hiatus avoidance. If the previous syllable ended in a vowel and this
         * one begins with one, the two vowels sit adjacent — and unless that
         * pair is a licensed diphthong, we've just invented a sequence the
         * language doesn't permit (*ta.ai for /traai/).
         *
         * Languages hate this. Onsetless syllables are overwhelmingly
         * word-INITIAL; medial hiatus gets repaired by glide insertion, glottal
         * stop insertion, or coalescence in language after language. Demanding
         * an onset after a vowel is the cheapest way to respect that, and it
         * leaves genuine word-initial vowels untouched.
         */
        const prev = out[out.length - 1];
        const needOnset = i > 0 && prev && isVowel(prev) && rng.bool(0.92);

        out.push(...makeSyllable(pools, pt, stats, rng, { allowCoda, needOnset }));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Inflection classes
// ---------------------------------------------------------------------------

/**
 * Assign an inflection class from the shape of the stem's ending.
 *
 * Phonologically transparent on purpose. Latin's declensions are stem-final
 * *-ā, *-o, *-i, *-u, *-ē with the endings glued on; Russian's are the same
 * story. Because class membership is readable off the stem, a sound change that
 * merges stem-final vowels merges declensions, and a sound change that deletes
 * them destroys the system entirely — which is precisely what happened between
 * Latin and French, and what will happen here without anyone scripting it.
 */
export function classOf(form, pos) {
    // Only the open, inflecting word classes have declensions and conjugations.
    // Pronouns, numerals and particles are closed classes: they inflect (often
    // irregularly) but they don't belong to a productive class, and pretending
    // they do would let analogy level them, which is the opposite of what
    // happens — closed-class items are the LAST to regularise.
    if (!['n', 'v', 'adj'].includes(pos)) return null;

    const last = form[form.length - 1];
    const prefix = pos === 'v' ? 'v' : (pos === 'adj' ? 'a' : 'n');
    if (!last) return `${prefix}1`;
    if (!isVowel(last)) return `${prefix}4`;             // consonant stem
    if (last.f.height >= 4) return `${prefix}1`;         // low vowel stem  (/a/)
    if (last.f.back === 1) return `${prefix}2`;          // front vowel stem (/i e/)
    return `${prefix}3`;                                  // back vowel stem  (/u o/)
}

/**
 * The handful of verbs that stay irregular forever.
 *
 * Suppletion — "go/went", "be/was", "good/better" — survives only in items used
 * often enough that every speaker hears the irregular form constantly. Below
 * that frequency threshold, analogy regularises them within a few generations.
 * So irregularity is granted strictly by rank, and the same rank test later
 * decides what resists levelling.
 */
export const SUPPLETION_CANDIDATES = ['be', 'go', 'come', 'do', 'have', 'give', 'say', 'eat', 'see'];

// ---------------------------------------------------------------------------
// The lexicon
// ---------------------------------------------------------------------------

/**
 * Generate the proto lexicon.
 *
 * @param concepts   from conceptList()
 * @param phonology  { inventory, phonotactics, profile, segmentMap }
 * @param rng        seeded stream
 */
export function generateLexicon(concepts, phonology, rng, opts = {}) {
    const { inventory, phonotactics: pt, profile, segmentMap } = phonology;
    const pools = buildPools(inventory, profile, segmentMap);
    const stats = shapeStats(profile);
    const maxRetries = opts.maxRetries ?? 12;

    // Frequency ranks follow the concept priority order, jittered inside blocks
    // so the curve isn't a perfect copy of Swadesh's ordering — real frequency
    // never is.
    const ranked = jitterRanks(concepts, rng, opts.jitterBlock ?? 25);

    const seen = new Map(); // ipa string → root id, for homophone control
    const roots = [];
    let homophones = 0;

    // an appended concept may borrow a frequent one's rank (swadesh.js EVERYDAY rankAs), touching no other word
    const rankOf = new Map(ranked.map((c, i) => [c.gloss, i + 1]));
    ranked.forEach((concept, i) => {
        const rank = concept.rankAs && rankOf.has(concept.rankAs) ? rankOf.get(concept.rankAs) : i + 1;
        let form = null;
        /**
         * One random stream PER CONCEPT. A single stream run across all 600
         * concepts, with a variable number of draws per word, meant any change
         * early on (one more name in the evidence, one retry) shifted every
         * word after it: a one-letter rename changed 52% of a proto. Now a
         * change reaches only the words whose own draws it affects.
         */
        const wordRng = opts.streamFor ? opts.streamFor(concept.gloss) : rng;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const candidate = makeRootForm(pools, pt, stats, wordRng, rank);
            const key = wordToIpa(candidate);
            if (!seen.has(key)) { form = candidate; seen.set(key, `r${pad(roots.length)}`); break; }
            // Give up gracefully. A language with NO homophones would itself be
            // unnatural — every real lexicon has some.
            if (attempt === maxRetries) { form = candidate; homophones += 1; }
        }

        const sylls = assignStress(syllabify(form, pt), pt.stress.rule);
        roots.push({
            id: `r${pad(roots.length)}`,
            form,
            ipa: wordToIpa(form),
            gloss: concept.gloss,
            pos: concept.pos,
            domain: concept.domain,
            core: concept.core,
            rank,
            zipf: zipfWeight(rank),
            class: classOf(form, concept.pos),
            syllables: sylls.length,
            shape: sylls.map(shapeOf).join('.'),
            stressIndex: sylls.findIndex((s) => s.stress === 1),
            irregular: SUPPLETION_CANDIDATES.includes(concept.gloss),
            derivedFrom: null,
        });
    });

    return { roots, stats: { homophones, total: roots.length, ...summarise(roots) } };
}

function pad(n) { return String(n).padStart(4, '0'); }

/**
 * Shuffle ranks a little inside fixed-size blocks. Preserves the broad
 * frequency ordering (core vocabulary stays at the top) without pretending
 * Swadesh's list order is a frequency count.
 */
function jitterRanks(concepts, rng, block) {
    const out = [];
    for (let i = 0; i < concepts.length; i += block) {
        out.push(...rng.shuffle(concepts.slice(i, i + block)));
    }
    return out;
}

function summarise(roots) {
    const bySyll = {};
    const byClass = {};
    for (const r of roots) {
        bySyll[r.syllables] = (bySyll[r.syllables] || 0) + 1;
        byClass[r.class] = (byClass[r.class] || 0) + 1;
    }
    const meanSyll = roots.reduce((a, r) => a + r.syllables, 0) / Math.max(1, roots.length);
    return { bySyllables: bySyll, byClass, meanSyllables: meanSyll };
}

/** Readable dump for the CLI and review gates. */
export function formatLexicon(lex, { limit = 30, romanise = null } = {}) {
    const L = [];
    const s = lex.stats;
    L.push(`${s.total} roots — mean ${s.meanSyllables.toFixed(2)} syllables; ${s.homophones} homophone collisions accepted`);
    L.push(`By syllable count: ${Object.entries(s.bySyllables).map(([k, v]) => `${k}σ×${v}`).join('  ')}`);
    L.push(`By inflection class: ${Object.entries(s.byClass).sort().map(([k, v]) => `${k}×${v}`).join('  ')}`);
    L.push('');
    for (const r of lex.roots.slice(0, limit)) {
        const rom = romanise ? ` ⟨${romanise(r.form)}⟩` : '';
        L.push(`  ${String(r.rank).padStart(3)}. *${r.ipa}${rom}`.padEnd(30) + `${r.gloss} (${r.pos}, ${r.class})${r.irregular ? ' [irregular]' : ''}`);
    }
    return L.join('\n');
}
