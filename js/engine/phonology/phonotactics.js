/**
 * Phonotactics: what a possible word looks like, and where the stress falls.
 *
 * Two things live here, and the second one matters far more than it looks.
 *
 * ## Syllable structure
 *
 * The syllable canon (what may fill an onset, a nucleus, a coda) plus the
 * Sonority Sequencing Principle, plus a language-specific list of licensed
 * exceptions. This decides which words are pronounceable, which loanwords get
 * repaired and how, and which clusters a later sound change will simplify.
 *
 * ## Stress — the highest-leverage single decision in the whole engine
 *
 * Stress does not just sound different. Stress decides WHICH SYLLABLES ERODE,
 * and erosion of syllables is what destroys morphology. Everything downstream
 * follows from it:
 *
 *   - Fixed INITIAL stress (Proto-Germanic) makes every non-first syllable
 *     weak. Suffixes are non-first. So Germanic ate its own case endings and
 *     had to rebuild with word order, prepositions and articles — which is the
 *     entire structural history of English in one sentence.
 *
 *   - Fixed FINAL stress protects suffixes and starves prefixes and initial
 *     syllables instead (French, where Latin's initial syllables collapsed:
 *     "hospitāle" > "hôtel").
 *
 *   - PENULTIMATE or weight-sensitive stress erodes selectively, so paradigms
 *     fracture into irregular classes rather than levelling wholesale.
 *
 * Choosing this at the proto-stage is choosing, six thousand years in advance,
 * whether the daughters end up looking like English or like Lithuanian.
 */

import { isVowel, sonorityOf, parseWord, vowel, consonant } from '../features.js';

// ---------------------------------------------------------------------------
// Stress systems
// ---------------------------------------------------------------------------

export const STRESS_RULES = {
    initial: {
        label: 'fixed initial',
        note: 'Stress always on the first syllable. Erodes suffixes; drives loss of case marking and a shift to analytic syntax. (Proto-Germanic, Finnish, Hungarian, Czech.)',
    },
    final: {
        label: 'fixed final',
        note: 'Stress always on the last syllable. Protects suffixes, erodes initial and medial syllables. (French, Persian, Turkish.)',
    },
    penultimate: {
        label: 'fixed penultimate',
        note: 'Stress on the second-to-last syllable. Erodes the final syllable but shelters the stem. (Polish, Swahili, Quechua.)',
    },
    antepenultimate: {
        label: 'fixed antepenultimate',
        note: 'Stress on the third-to-last syllable. Rare as a fixed rule; produces long unstressed tails that erode fast. (Macedonian.)',
    },
    moraicTrochee: {
        label: 'weight-sensitive (moraic trochee)',
        note: 'Stress the penult if it is heavy (long vowel or closed), otherwise the antepenult — the Latin Rule. Because stress then depends on syllable weight, a sound change that alters weight moves the stress, and paradigms fracture into irregular classes instead of levelling. (Latin, Classical Arabic.)',
    },
    iambic: {
        label: 'weight-sensitive iamb',
        note: 'Stress the second mora of a foot built from the left. Tends to lengthen stressed vowels and reduce or delete the unstressed ones between feet. (Many Algonquian and Australian languages.)',
    },
};

// ---------------------------------------------------------------------------
// Syllabification
// ---------------------------------------------------------------------------

/**
 * Is this consonant cluster a legal onset?
 *
 * The Sonority Sequencing Principle: sonority must RISE monotonically towards
 * the nucleus. /pra/ is fine (stop 1 → trill 5 → vowel); /rpa/ is not. Many
 * languages additionally demand a minimum sonority DISTANCE, which is why
 * English allows /pl-/ (1→6, distance 5) but not /*tl-/ (1→6 at the same place,
 * blocked for a different, place-based reason) and why /*pn-/ (1→4) is
 * marginal.
 *
 * Every language then licenses a handful of exceptions, and they are almost
 * always /s/ + stop: English "stop, spring, ski" all begin with a sonority
 * FALL. The standard analysis is that this /s/ sits outside the syllable proper
 * — which is why it behaves oddly in reduplication, in stress and in child
 * language.
 */
export function isLegalOnset(cluster, pt) {
    if (cluster.length === 0) return true;
    if (cluster.length > pt.onset.max) return false;
    if (cluster.length === 1) return !pt.onset.forbidden?.includes(cluster[0].ipa);

    const key = cluster.map((c) => c.ipa).join('');
    if (pt.onset.licensedExceptions?.includes(key)) return true;

    for (let i = 1; i < cluster.length; i++) {
        const rise = sonorityOf(cluster[i]) - sonorityOf(cluster[i - 1]);
        if (rise < (pt.onset.sonorityMinDistance ?? 1)) return false;
    }
    return true;
}

/** Is this consonant cluster a legal coda? Sonority must FALL away from the nucleus. */
export function isLegalCoda(cluster, pt) {
    if (cluster.length === 0) return true;
    if (cluster.length > pt.coda.max) return false;
    if (pt.coda.allowed && cluster.some((c) => !pt.coda.allowed.includes(c.ipa))) {
        const key = cluster.map((c) => c.ipa).join('');
        if (!pt.coda.licensedExceptions?.includes(key)) return false;
    }
    for (let i = 1; i < cluster.length; i++) {
        if (sonorityOf(cluster[i]) > sonorityOf(cluster[i - 1])) return false;
    }
    return true;
}

/**
 * Split a phoneme string into syllables by ONSET MAXIMISATION: every consonant
 * that can legally begin a syllable does. /a.tra/ beats /at.ra/. This is the
 * cross-linguistic default and it's why English speakers hear "a-stro-no-my"
 * rather than "as-tron-om-y".
 *
 * The parse matters diachronically, not just descriptively: a consonant parsed
 * into an onset is protected, and one parsed into a coda is exposed to coda
 * lenition, final devoicing and deletion. The same segment survives or dies
 * depending on which side of the boundary it lands.
 */
export function syllabify(phonemes, pt = DEFAULT_PT) {
    const diphthongs = new Set(pt.nucleus?.diphthongs || []);

    /**
     * Find the nuclei. A nucleus is one vowel — UNLESS this vowel and the next
     * form a diphthong the language actually licenses, in which case the pair
     * is a single complex nucleus.
     *
     * This distinction is not cosmetic. Whether /ia/ is one syllable or two
     * changes the syllable count, the stress placement, and the syllable-shape
     * statistics that root generation is calibrated against. Reading every
     * vowel sequence as hiatus would make this language look 34% vowel-initial
     * when it is nothing of the sort.
     */
    const nuclei = []; // arrays of indices
    for (let i = 0; i < phonemes.length; i++) {
        if (!isVowel(phonemes[i])) continue;
        const next = phonemes[i + 1];
        if (next && isVowel(next) && diphthongs.has(phonemes[i].ipa + next.ipa)) {
            nuclei.push([i, i + 1]);
            i += 1;
        } else {
            nuclei.push([i]);
        }
    }
    if (!nuclei.length) return [{ onset: phonemes.slice(), nucleus: [], coda: [], stress: 0 }];

    const sylls = [];
    let appendix = [];
    for (let n = 0; n < nuclei.length; n++) {
        const first = nuclei[n][0];
        const prevLast = n === 0 ? -1 : nuclei[n - 1][nuclei[n - 1].length - 1];
        const between = phonemes.slice(prevLast + 1, first);

        // Grow the onset leftwards as far as legality allows (onset maximisation).
        let split = between.length;
        while (split > 0 && isLegalOnset(between.slice(split - 1), pt)) split -= 1;

        const onset = between.slice(split);
        const leftover = between.slice(0, split);
        if (n > 0) {
            sylls[sylls.length - 1].coda = leftover;
        } else if (leftover.length) {
            /**
             * Word-initial consonants that cannot be parsed into the onset.
             *
             * There is no preceding syllable to give them to, and dropping them
             * — which is what this did — silently deletes segments from the
             * word. It corrupted 1799 words in one family alone, and since every
             * syllable-shape, coda, cluster and syllable-count statistic is
             * computed off this function, it corrupted every measurement taken
             * of the engine's output too.
             *
             * The standard analysis is an extrasyllabic APPENDIX: a segment
             * licensed by the word rather than by the syllable. English /s/ in
             * "spring" and "street" violates sonority sequencing and sits
             * outside the syllable proper — the same account this module already
             * gives for licensed /s/+stop exceptions. Russian /rt/ in рта and
             * Georgian initial /brdɣv-/ are handled the same way. Nobody
             * analyses them as deleted.
             */
            appendix = leftover;
        }
        sylls.push({ onset, nucleus: nuclei[n].map((i) => phonemes[i]), coda: [], stress: 0 });
    }
    const lastNuc = nuclei[nuclei.length - 1];
    sylls[sylls.length - 1].coda = phonemes.slice(lastNuc[lastNuc.length - 1] + 1);
    if (appendix.length) sylls[0].appendix = appendix;
    return sylls;
}

/**
 * Syllable weight in MORAE. A short vowel is one mora; a long vowel or a coda
 * consonant adds another. Two or more morae = "heavy".
 *
 * Weight is the currency of stress in a large fraction of the world's
 * languages, and it is why sound change and stress feed each other: lose a
 * coda, the syllable goes light, and the stress moves somewhere else.
 */
export function weightOf(syll) {
    let morae = 0;
    for (const v of syll.nucleus) morae += v.f.long ? 2 : 1;
    if (syll.coda.length) morae += 1;
    return morae;
}
export const isHeavy = (syll) => weightOf(syll) >= 2;

/** Assign primary stress in place, returning the same array. */
export function assignStress(sylls, rule = 'penultimate') {
    if (!sylls.length) return sylls;
    sylls.forEach((s) => { s.stress = 0; });
    const n = sylls.length;
    let idx;

    switch (rule) {
        case 'initial': idx = 0; break;
        case 'final': idx = n - 1; break;
        case 'antepenultimate': idx = Math.max(0, n - 3); break;
        case 'moraicTrochee':
            // The Latin Rule. Monosyllables and disyllables stress the first
            // syllable; longer words stress the penult if it is heavy, else the
            // antepenult.
            if (n <= 2) idx = 0;
            else idx = isHeavy(sylls[n - 2]) ? n - 2 : n - 3;
            break;
        case 'iambic': {
            // Build binary feet from the left, stress the right-hand (heavier)
            // member of the first foot that contains a heavy syllable.
            idx = Math.min(1, n - 1);
            for (let i = 0; i < n; i++) if (isHeavy(sylls[i])) { idx = i; break; }
            break;
        }
        case 'penultimate':
        default: idx = Math.max(0, n - 2); break;
    }
    sylls[idx].stress = 1;

    /**
     * Long words get an alternating secondary beat, which keeps a
     * five-syllable word pronounceable and protects the syllables it lands on
     * from reduction.
     *
     * Two restrictions, both real. Secondary stress needs room: it doesn't
     * appear in words of three syllables or fewer. And it never lands on the
     * final syllable — final syllables are the prosodically weakest position in
     * the word, which is exactly why they are the ones that erode.
     */
    if (n >= 4) {
        for (let i = idx - 2; i >= 0; i -= 2) sylls[i].stress = sylls[i].stress || 2;
        for (let i = idx + 2; i < n - 1; i += 2) sylls[i].stress = sylls[i].stress || 2;
    }
    return sylls;
}

/**
 * Apply the stress rule and BAKE the result onto the vowels, returning a new
 * segment array.
 *
 * Once stress is on the segments it survives every later rule, which is what
 * makes stress-conditioned change work across a long chain: a rule can still
 * ask "was this syllable stressed?" thousands of years after the conditions
 * that assigned the stress have been destroyed. Latin lost vowel quantity but
 * kept the stress quantity had assigned; Germanic abolished the PIE accent but
 * Verner's Law had already used it.
 *
 * Words that already carry an explicit stress mark are left alone — lexical
 * accent (PIE, Ancient Greek, Russian) is not derivable from a rule.
 */
export function markStress(segments, pt, { force = false } = {}) {
    if (!force && segments.some((ph) => isVowel(ph) && ph.f.stress)) return segments;
    const sylls = assignStress(syllabify(segments, pt), pt.stress?.rule || 'penultimate');
    const stressOf = new Map();
    for (const s of sylls) for (const v of s.nucleus) stressOf.set(v, s.stress);

    const out = [];
    let seen = 0;
    for (const ph of segments) {
        if (!isVowel(ph)) { out.push(ph); continue; }
        // Map by position, since identical vowels are the same frozen object.
        const syll = sylls[syllableIndexOfNucleus(sylls, seen)];
        out.push(vowel({ ...ph.f, stress: syll ? syll.stress : 0 }));
        seen += 1;
    }
    return out;
}

function syllableIndexOfNucleus(sylls, nucleusOrdinal) {
    let count = 0;
    for (let i = 0; i < sylls.length; i++) {
        count += sylls[i].nucleus.length;
        if (nucleusOrdinal < count) return i;
    }
    return sylls.length - 1;
}

/**
 * Repair illegal vowel hiatus left behind by sound change.
 *
 * When a rule deletes an intervocalic consonant it leaves two vowels adjacent,
 * and if that sequence isn't a diphthong the language licenses, the result is a
 * shape the language does not permit. Left alone it compounds: two rounds of
 * elision produce three vowels in a row, and the "language" stops being one.
 *
 * Real languages don't tolerate this. They repair it, and the repairs are the
 * same handful everywhere:
 *
 *   - identical vowels COALESCE into a single long vowel
 *     (Latin *co-operire > cooperire > French "couvrir"; Greek contract verbs)
 *   - different vowels get a GLIDE between them, /j/ after a front vowel and
 *     /w/ after a round one
 *     (Spanish "leer" [leˈjeɾ]; Indonesian and Swahili do it systematically)
 *
 * This is a phonotactic CONSPIRACY: a set of unrelated rules whose combined
 * effect is to preserve a structural constraint. Conspiracies are one of the
 * standard arguments that languages enforce output shapes and not merely
 * sequences of changes, so applying the repair after the ruleset — rather than
 * writing it as another ordered rule — is the linguistically honest placement.
 */
export function repairHiatus(segments, pt) {
    const licensed = new Set(pt?.nucleus?.diphthongs || []);
    const licensesLength = pt?.nucleus?.longVowels !== false;
    let out = segments;

    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        const next = [];
        for (let i = 0; i < out.length; i++) {
            const a = out[i];
            const b = out[i + 1];
            if (!b || !isVowel(a) || !isVowel(b) || licensed.has(a.ipa + b.ipa)) { next.push(a); continue; }

            if (a.ipa === b.ipa) {
                // Coalescence. The two morae normally survive as length — but
                // only if the language HAS length. Ignoring that quietly undid
                // quantity-collapse every stage, because this runs after the
                // whole ruleset.
                next.push(licensesLength ? vowel({ ...a.f, long: true }) : a);
                i += 1;
            } else {
                // Glide epenthesis, chosen by the FIRST vowel's own colour: the
                // inserted glide is the consonantal counterpart of the vowel
                // that precedes it, which is why it sounds like nothing at all.
                next.push(a);
                next.push(a.f.round || a.f.back === 3 ? WGLIDE : JGLIDE);
            }
            changed = true;
        }
        out = next;
        if (!changed) break;
    }
    return out;
}

const JGLIDE = consonant({ place: 'palatal', manner: 'approximant', voice: true });
const WGLIDE = consonant({ place: 'labiovelar', manner: 'approximant', voice: true });

/**
 * Repair onset clusters the language does not license.
 *
 * The mirror of repairHiatus, and needed for the same reason. Vowel deletion
 * (syncope, apocope, reduction-and-loss) leaves consonants adjacent, and if the
 * result is not a legal onset the language has acquired a shape it forbids.
 * Without this, adding any vowel-deletion rule produces `hmlu`, `jjɣi`, `bt͡ɕĩn`.
 *
 * All three strategies are attested, and which one a language uses is a real
 * parameter rather than a detail:
 *
 *   'epenthesis'  break the cluster with a vowel — Japanese loan adaptation
 *                 (ストライキ /sɯtoraiki/), Spanish prothesis (SCHOLA >
 *                 "escuela", still productive in "estrés")
 *   'deletion'    drop the offending segment — Greek /kt/ > /t/
 *   'none'        tolerate it (the default: most languages tolerate more than
 *                 their canon strictly licenses)
 *
 * `'none'` is the default deliberately. A repair that fires unasked would
 * rewrite every family the moment this shipped, and a language whose surface
 * never violates its own canon is itself unrealistic — English "sixths" is not
 * a legal onset anywhere.
 *
 * Never "keep the least sonorous member": no language repairs /str/ to /s/.
 */
export function repairClusters(segments, pt) {
    const mode = pt?.onset?.repair || 'none';
    if (mode === 'none') return segments;

    const sylls = syllabify(segments, pt);
    let changed = false;
    const out = [];

    for (const s of sylls) {
        const pre = [...(s.appendix || []), ...s.onset];
        if (pre.length <= 1 || isLegalOnset(pre, pt)) {
            out.push(...pre, ...s.nucleus, ...s.coda);
            continue;
        }
        changed = true;
        if (mode === 'epenthesis') {
            // Break at the first illegal junction, keeping both consonants.
            const filler = pt.nucleus?.epentheticVowel
                ? parseWord(pt.nucleus.epentheticVowel)[0]
                : vowel({ height: 3, back: 2 });
            out.push(pre[0], filler, ...pre.slice(1), ...s.nucleus, ...s.coda);
        } else {
            // Deletion: drop from the LEFT, which is where the illegal member is
            // in a sonority-falling onset (*rpa → pa, not ra).
            out.push(...pre.slice(1), ...s.nucleus, ...s.coda);
        }
    }
    return changed ? out : segments;
}

/** Flatten syllables back to a phoneme array. */
export function flatten(sylls) {
    return sylls.flatMap((s) => [...(s.appendix || []), ...s.onset, ...s.nucleus, ...s.coda]);
}

/** Compact shape string for a syllable: "CVC", "CCV", "V"… */
export function shapeOf(syll) {
    return 'C'.repeat((syll.appendix || []).length + syll.onset.length)
        + 'V'.repeat(syll.nucleus.length) + 'C'.repeat(syll.coda.length);
}

// ---------------------------------------------------------------------------
// Building a phonotactics spec from a mined profile
// ---------------------------------------------------------------------------

export const DEFAULT_PT = {
    onset: { max: 2, sonorityMinDistance: 1, licensedExceptions: [], forbidden: [] },
    nucleus: { diphthongs: [], longVowels: false },
    coda: { max: 1, allowed: null, licensedExceptions: [] },
    syllabification: 'onset-maximisation',
    stress: { rule: 'penultimate' },
};

/**
 * Derive the phonotactic spec from the mined evidence.
 *
 * As with the inventory, the proto is deliberately made no more permissive than
 * the evidence demands: a cluster type attested once across 85 stems is treated
 * as a daughter innovation, not as proto stock. Phonotactics loosen and tighten
 * over time, and a proto-language that already licensed everything gives its
 * daughters nothing to do.
 */
export function buildPhonotactics(profile, rng, opts = {}) {
    const notes = [];
    // The profile is stated in DAUGHTER segments. If the inventory was
    // reconstructed behind them (aspiration → voicing), the phonotactic
    // statements have to be translated too, or the proto ends up licensing a
    // cluster like *tʰɻ that its own inventory cannot spell.
    const map = opts.segmentMap || new Map();
    const tr = (ipa) => map.get(ipa) || ipa;
    // Translate a CLUSTER segment-by-segment, not character-by-character: /tʰɻ/
    // is two segments, and splitting on characters would strand the aspiration
    // diacritic and produce nonsense like *dʰɻ.
    const trSeq = (key) => {
        try { return parseWord(key).map((ph) => tr(ph.ipa)).join(''); }
        catch { return key; }
    };

    // Onsets: keep the attested maximum, but demand more than a single
    // attestation before granting a cluster slot.
    const clusterEvidence = profile.onsetClusters.filter((c) => c.count >= (opts.clusterCutoff ?? 2));
    const maxOnset = clusterEvidence.length ? 2 : 1;
    if (!clusterEvidence.length && profile.onsetClusters.length) {
        notes.push(`Onset clusters attested only once each (${profile.onsetClusters.map((c) => c.key).join(' ')}) — treated as later innovations; the proto has simple onsets.`);
    }

    // Codas: take the segments with real support. In a language whose corpus is
    // 85% open syllables, the coda inventory is the interesting constraint, and
    // a small coda inventory is a loaded gun — codas are where tone comes from
    // when they are lost.
    const codaCutoff = opts.codaCutoff ?? 2;
    const codaAllowed = [...new Set(profile.codas.filter((c) => c.count >= codaCutoff).map((c) => tr(c.key)))];
    const codaDropped = profile.codas.filter((c) => c.count < codaCutoff).map((c) => c.key);
    if (codaDropped.length) notes.push(`Codas attested <${codaCutoff}× withheld from the proto: ${codaDropped.join(' ')}`);

    // Diphthongs: a vowel sequence with real support is a diphthong; a one-off
    // is hiatus.
    const diphthongs = profile.vowelSequences.filter((v) => v.count >= (opts.diphthongCutoff ?? 3)).map((v) => v.key);

    const stressRule = opts.stress || 'penultimate';

    return {
        syllable: '(C)'.repeat(maxOnset) + 'V' + '(C)'.repeat(Math.min(1, codaAllowed.length ? 1 : 0)),
        onset: {
            max: maxOnset,
            sonorityMinDistance: 1,
            licensedExceptions: clusterEvidence.map((c) => trSeq(c.key)),
            forbidden: [],
        },
        nucleus: { diphthongs, longVowels: !!opts.vowelLength },
        coda: { max: codaAllowed.length ? 1 : 0, allowed: codaAllowed, licensedExceptions: [] },
        syllabification: 'onset-maximisation',
        stress: { rule: stressRule, ...STRESS_RULES[stressRule] },
        openSyllableRate: openRate(profile),
        notes,
    };
}

function openRate(profile) {
    const total = profile.syllableShapes.reduce((a, s) => a + s.count, 0) || 1;
    const open = profile.syllableShapes.filter((s) => !/C$/.test(s.key)).reduce((a, s) => a + s.count, 0);
    return open / total;
}

export function formatPhonotactics(pt) {
    const L = [];
    L.push(`Syllable template: ${pt.syllable}`);
    L.push(`Onset:   max ${pt.onset.max}${pt.onset.licensedExceptions.length ? `, licensed clusters ${pt.onset.licensedExceptions.join(' ')}` : ' (simple onsets only)'}`);
    L.push(`Nucleus: ${pt.nucleus.diphthongs.length ? `diphthongs ${pt.nucleus.diphthongs.join(' ')}` : 'monophthongs only'}${pt.nucleus.longVowels ? ', contrastive length' : ''}`);
    L.push(`Coda:    ${pt.coda.max === 0 ? 'none — fully open syllables' : `max ${pt.coda.max}, allowed ${pt.coda.allowed.join(' ')}`}`);
    L.push(`Open syllables: ${(pt.openSyllableRate * 100).toFixed(0)}% of the corpus`);
    L.push(`Stress:  ${pt.stress.label}`);
    L.push(`         ${pt.stress.note}`);
    if (pt.notes?.length) { L.push(''); L.push(...pt.notes); }
    return L.join('\n');
}
