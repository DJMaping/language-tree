/**
 * Generating a phoneme inventory.
 *
 * Two ideas do most of the work here, and both are what separate this from
 * "pick 25 IPA symbols at random".
 *
 * ## 1. Implicational universals
 *
 * Inventories are not random subsets of the IPA chart. Across the world's
 * ~7,000 languages the same implications hold almost without exception: if a
 * language has /g/ it has /b/ and /d/; if it has voiced fricatives it has
 * voiceless ones; if it has any nasal it has /n/; if it has front rounded
 * vowels it has front unrounded ones. Violating them produces an inventory that
 * feels instantly, indefinably wrong. Every one enforced below is annotated
 * with the generalisation it encodes.
 *
 * ## 2. A proto-language is SIMPLER than the sum of its daughters
 *
 * The mined profile is a snapshot of the daughters as they are now, which means
 * it contains every innovation any branch ever made, all superimposed. Handing
 * that whole set to the proto would be a category error: it would give the
 * ancestor a richer inventory than any of its descendants and leave the
 * daughters nothing to innovate.
 *
 * So marginal segments — those attested in only one or two stems across the
 * whole corpus — are treated as LATER innovations and withheld from the proto.
 * They can then arise properly, from the sound changes on individual branches.
 * That is why Old Chinese is reconstructed without the retroflex series that
 * Middle Chinese unmistakably has.
 */

import { consonant, vowel, fromIpa, describe } from '../features.js';

// ---------------------------------------------------------------------------
// Typological targets
// ---------------------------------------------------------------------------

/**
 * Inventory sizes in the world's languages cluster hard around the mid-twenties.
 * WALS puts the mean near 25 with the great bulk between 20 and 37; the tails
 * (Rotokas ~11, !Xóõ 100+) are genuinely exceptional and shouldn't be produced
 * by a default roll.
 */
export const SIZE_BANDS = {
    small: [11, 19],
    typical: [20, 37],
    large: [38, 60],
};

/**
 * Canonical vowel systems. These are not "common" systems — they are very
 * nearly the ONLY systems at each size. A 3-vowel language has /i a u/; a
 * 5-vowel language has /i e a o u/. The engine treats deviation as something
 * that has to be earned by a sound change, not chosen at random.
 */
export const CANONICAL_VOWELS = {
    3: [['i', 1, 1, false], ['a', 5, 1, false], ['u', 1, 3, true]],
    4: [['i', 1, 1, false], ['e', 2, 1, false], ['a', 5, 1, false], ['u', 1, 3, true]],
    5: [['i', 1, 1, false], ['e', 2, 1, false], ['a', 5, 1, false], ['o', 2, 3, true], ['u', 1, 3, true]],
    6: [['i', 1, 1, false], ['e', 2, 1, false], ['a', 5, 1, false], ['o', 2, 3, true], ['u', 1, 3, true], ['ə', 3, 2, false]],
    7: [['i', 1, 1, false], ['e', 2, 1, false], ['ɛ', 4, 1, false], ['a', 5, 1, false], ['ɔ', 4, 3, true], ['o', 2, 3, true], ['u', 1, 3, true]],
};

/** Places where a stop series is near-universal, in order of robustness. */
const CORE_STOP_PLACES = ['bilabial', 'alveolar', 'velar'];

/**
 * How common each consonant is across the world's languages, commonest first.
 *
 * Approximate shares, in the spirit of PHOIBLE and UPSID rather than copied
 * from either — the ORDER is what matters here and the order is not in dispute.
 * /m n k j p w/ are in the overwhelming majority of languages; /θ ɸ ɮ/ are in
 * a few per cent.
 *
 * Used only to decide what a thin corpus most likely failed to attest. Nothing
 * here overrides the mined evidence: a segment the corpus DOES attest is in the
 * inventory whatever this list says, and a segment the config withholds stays
 * withheld.
 */
export const CONSONANT_PRIOR = [
    ['m', 0.96], ['k', 0.89], ['j', 0.84], ['p', 0.83], ['w', 0.82], ['n', 0.78],
    ['t', 0.68], ['l', 0.68], ['s', 0.67], ['h', 0.63], ['ŋ', 0.63], ['b', 0.63],
    ['ɡ', 0.57], ['d', 0.56], ['ʃ', 0.45], ['r', 0.44], ['f', 0.44], ['ɲ', 0.42],
    ['t͡ʃ', 0.40], ['ʔ', 0.37], ['z', 0.30], ['v', 0.27], ['d͡ʒ', 0.27], ['t͡s', 0.22],
    ['x', 0.18], ['ɾ', 0.18], ['c', 0.14], ['q', 0.14], ['ɣ', 0.13], ['β', 0.10],
    ['d͡z', 0.10], ['ʒ', 0.10], ['ð', 0.05], ['ɸ', 0.05], ['θ', 0.04],
];

/**
 * Estimate how many consonants the corpus never showed us.
 *
 * ## The problem this solves
 *
 * A family's proto-inventory is mined from its daughters' NAMES, and the number
 * of names varies enormously: 139 for Alzuria-Ayuman, six for Arten. Six words
 * cannot contain twenty-five distinct consonants, so the miner honestly
 * reported six, and the reconstruction came out with ten phonemes — below
 * Rotokas, which is famous for being the smallest inventory ever recorded.
 *
 * That is not a fact about Arten. It is a fact about how many Arten languages
 * are drawn on the chart, and a proto-language's phonology should not depend on
 * that.
 *
 * ## Why this is an estimate and not a floor
 *
 * The tempting fix is to top every inventory up to twenty-five. That is a rule
 * about the OUTPUT, and the repo's standing rule 3 forbids exactly this shape of
 * fix: bias the process, never decree the result.
 *
 * The honest version is that "how many kinds did I fail to observe" is a solved
 * statistical problem. Chao's estimator, standard in ecology for exactly this
 * question, reads the answer off how many kinds were seen only ONCE:
 *
 *     S_estimated = S_observed + f1² / (2·f2)
 *
 * where f1 is the number of segments attested exactly once and f2 exactly
 * twice. The intuition is sound and worth stating: a sample full of
 * once-only observations is obviously still finding new things, so a lot is
 * missing; a sample where everything turned up repeatedly has probably found
 * nearly everything. A corpus of 139 names yields a correction near zero, and
 * one of six names yields a large one, *without anyone deciding that in
 * advance*.
 *
 * Chao's estimator is a LOWER bound, and known to under-correct for very small
 * samples. That is the right direction to err — it prefers to leave the proto
 * too austere rather than invent a phonology — and it is why the documented
 * floor below it exists as a backstop rather than as the mechanism.
 */
/** A consonant under this share of the names' consonants is not proto stock. */
const MARGINAL_SHARE = 0.004;
/** Inferred consonants fill an inventory up to this, never beyond. */
const INFERRED_CEILING = 20;

export function estimateUnseen(counts) {
    const observed = counts.length;
    const f1 = counts.filter((n) => n === 1).length;
    const f2 = counts.filter((n) => n === 2).length;
    if (!f1) return { observed, unseen: 0, f1, f2, note: 'every segment was attested more than once — the corpus has probably found them all' };
    // With no doubletons the estimator is undefined; the standard bias-corrected
    // form substitutes f1(f1-1)/2, which is what is used here.
    const correction = f2 > 0 ? (f1 * f1) / (2 * f2) : (f1 * (f1 - 1)) / 2;
    return {
        observed,
        unseen: Math.max(0, Math.round(correction)),
        f1,
        f2,
        note: `${f1} segment${f1 === 1 ? '' : 's'} attested exactly once and ${f2} exactly twice — Chao's estimator puts roughly ${Math.round(correction)} more beyond the corpus`,
    };
}

// ---------------------------------------------------------------------------
// Reconstructing behind the evidence
// ---------------------------------------------------------------------------

/**
 * Turn an ASPIRATION contrast in the attested daughters into a VOICING contrast
 * in the reconstructed proto.
 *
 * This inverts one of the best-documented sound changes in linguistics. Middle
 * Chinese had a three-way onset contrast (voiceless / voiceless aspirated /
 * voiced). The voicing distinction split every tone into a higher "yin" and a
 * lower "yang" register, and only THEN did the voiced series devoice — merging
 * into the voiceless series and leaving the tone split behind as its only
 * trace. Modern Mandarin therefore has an aspiration contrast and four tones
 * where its ancestor had a voicing contrast and no tone split at all.
 *
 * Reading the modern spelling literally would hand the proto the END of that
 * process. Running it backwards gives the proto the raw material to go through
 * it — which is the whole point of having a diachronic engine.
 *
 *   daughter /pʰ/ (aspirated)          ← proto /p/  (plain voiceless)
 *   daughter /p/  (plain voiceless)    ← proto /b/  (voiced)
 */
export function reconstructVoicingBehindAspiration(phonemes) {
    const out = [];
    const notes = [];
    for (const ph of phonemes) {
        if (ph.type !== 'C' || !['stop', 'affricate'].includes(ph.f.manner)) { out.push(ph); continue; }
        if (ph.f.aspirated) {
            const plain = consonant({ ...ph.f, aspirated: false, voice: false });
            out.push(plain);
            notes.push(`${ph.ipa} ← *${plain.ipa} (aspirate reflects a plain voiceless proto-stop)`);
        } else if (!ph.f.voice) {
            const voiced = consonant({ ...ph.f, voice: true });
            out.push(voiced);
            notes.push(`${ph.ipa} ← *${voiced.ipa} (unaspirated reflects a VOICED proto-stop, devoiced after the tone split)`);
        } else {
            out.push(ph);
        }
    }
    return { phonemes: dedupe(out), notes };
}

function dedupe(list) {
    const seen = new Map();
    for (const ph of list) if (!seen.has(ph.ipa)) seen.set(ph.ipa, ph);
    return [...seen.values()];
}

// ---------------------------------------------------------------------------
// The universals
// ---------------------------------------------------------------------------

/**
 * Repair an inventory until it satisfies the implicational universals.
 * Returns the repaired consonant list plus a log of which universal fired and
 * what it added — the log is shown in the panel so the reasoning is visible.
 */
export function enforceUniversals(consonants) {
    const set = new Map(consonants.map((p) => [p.ipa, p]));
    const log = [];
    const has = (ipa) => set.has(ipa);
    const add = (ph, why) => {
        if (!set.has(ph.ipa)) { set.set(ph.ipa, ph); log.push(`+${ph.ipa} — ${why}`); }
    };
    const all = () => [...set.values()];

    // ── /p t k/ ─────────────────────────────────────────────────────────────
    // A voiceless stop series at the three core places is as close to universal
    // as anything gets. Languages lacking one lack /p/ (Arabic) or /ɡ/ (Dutch),
    // essentially never /t/.
    for (const place of CORE_STOP_PLACES) {
        const plain = consonant({ place, manner: 'stop', voice: false });
        if (!has(plain.ipa)) add(plain, 'voiceless stops at the three core places are near-universal');
    }

    // ── Voiced stops imply their voiceless partners ─────────────────────────
    // No language contrasts /b d ɡ/ without also having /p t k/. The voiced
    // series is always the marked member.
    for (const ph of all()) {
        if (ph.type === 'C' && ph.f.manner === 'stop' && ph.f.voice) {
            const vl = consonant({ ...ph.f, voice: false });
            add(vl, `a voiced stop implies its voiceless partner (${ph.ipa} ⇒ ${vl.ipa})`);
        }
    }

    // ── /ɡ/ implies /b/ and /d/ ─────────────────────────────────────────────
    // Voiced stops are acquired front-to-back and lost back-to-front, because
    // voicing is aerodynamically hardest at the velum (the smaller the cavity
    // behind the closure, the faster the pressure equalises and voicing dies).
    // That is exactly why Dutch, Czech and Thai have the /ɡ/-shaped hole.
    if (has('ɡ')) {
        add(consonant({ place: 'bilabial', manner: 'stop', voice: true }), '/ɡ/ implies /b/ — voicing is hardest at the velum, so /ɡ/ is the first to go and the last to appear');
        add(consonant({ place: 'alveolar', manner: 'stop', voice: true }), '/ɡ/ implies /d/');
    }

    // ── Voiced fricatives imply voiceless ones ──────────────────────────────
    for (const ph of all()) {
        if (ph.type === 'C' && ph.f.manner === 'fricative' && ph.f.voice) {
            const vl = consonant({ ...ph.f, voice: false });
            add(vl, `a voiced fricative implies its voiceless partner (${ph.ipa} ⇒ ${vl.ipa})`);
        }
    }

    // ── Any nasal implies /n/; two or more imply /m n/ ──────────────────────
    const nasals = all().filter((p) => p.type === 'C' && p.f.manner === 'nasal');
    if (nasals.length) {
        add(consonant({ place: 'alveolar', manner: 'nasal', voice: true }), 'any nasal system includes /n/ — the single most common consonant on earth');
        if (nasals.length >= 2) add(consonant({ place: 'bilabial', manner: 'nasal', voice: true }), 'a two-nasal system is /m n/');
    }

    // ── /ŋ/ without /n/ is unattested; /ŋ/ implies a velar stop ─────────────
    if (has('ŋ')) add(consonant({ place: 'velar', manner: 'stop', voice: false }), '/ŋ/ implies a velar stop at the same place');

    // ── At least one liquid and one glide ───────────────────────────────────
    // Languages with no liquid at all are vanishingly rare and all in one small
    // area of the Pacific Northwest and Amazonia.
    if (!all().some((p) => p.f.lateral || ['trill', 'tap'].includes(p.f.manner))) {
        add(consonant({ place: 'alveolar', manner: 'approximant', voice: true, lateral: true }), 'essentially every language has at least one liquid');
    }
    if (!all().some((p) => p.f.manner === 'approximant' && !p.f.lateral)) {
        add(consonant({ place: 'palatal', manner: 'approximant', voice: true }), 'a glide is expected; /j/ is the commonest');
    }

    // ── Affricates imply a fricative at or near the same place ──────────────
    for (const ph of all()) {
        if (ph.type === 'C' && ph.f.manner === 'affricate') {
            const fric = consonant({ place: ph.f.place, manner: 'fricative', voice: ph.f.voice, lateral: ph.f.lateral });
            const anySibilant = all().some((p) => p.f.manner === 'fricative' && p.f.place === ph.f.place);
            if (!anySibilant) add(fric, `an affricate implies a fricative at its place of release (${ph.ipa} ⇒ ${fric.ipa})`);
        }
    }

    // ── Aspiration and glottalisation are series, not scatter ───────────────
    // If a language has aspirated stops it has them across the whole stop
    // series, not at one arbitrary place.
    for (const feature of ['aspirated', 'glottalised']) {
        const marked = all().filter((p) => p.f.manner === 'stop' && p.f[feature]);
        if (marked.length && marked.length < CORE_STOP_PLACES.length) {
            for (const place of CORE_STOP_PLACES) {
                const ph = consonant({ place, manner: 'stop', voice: false, [feature]: true });
                add(ph, `${feature} stops form a complete series, not a scatter`);
            }
        }
    }

    return { consonants: [...set.values()], log };
}

/** Build a canonical vowel system of a given size, with optional length. */
export function buildVowels(size, { length = false, nasal = false } = {}) {
    const spec = CANONICAL_VOWELS[Math.max(3, Math.min(7, size))] || CANONICAL_VOWELS[5];
    const base = spec.map(([, h, b, r]) => vowel({ height: h, back: b, round: r }));
    const out = [...base];
    // Length and nasality double the system rather than adding odd members —
    // that's how they work in every language that has them.
    if (length) for (const v of base) out.push(vowel({ ...v.f, long: true }));
    if (nasal) for (const v of base) out.push(vowel({ ...v.f, nasal: true }));
    return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Build a proto-inventory from a mined profile.
 *
 * @param profile      output of mineProfile()
 * @param rng          a seeded stream from rng.js
 * @param opts.laryngeal        'voicing' | 'aspiration' | 'asIs'
 * @param opts.marginalCutoff   corpus count at or below which a segment is
 *                              treated as a later innovation, not proto stock
 * @param opts.vowelCount       canonical vowel system size
 * @param opts.vowelLength      contrastive length at the proto stage
 * @param opts.withhold         segments attested in the corpus but deliberately
 *                              kept OUT of the proto, to be innovated later
 * @param opts.deriveFrom       {daughterIpa: protoIpa} — a well-attested
 *                              daughter segment reflecting a simpler ancestor
 */
export function generateInventory(profile, rng, opts = {}) {
    const {
        laryngeal = 'voicing',
        marginalCutoff = 2,
        vowelCount = profile.vowels.filter((v) => !v.ipa.includes('ː')).length || 5,
        vowelLength = false,
        withhold = [],
        deriveFrom = {},
        consonantTarget = null,
    } = opts;

    const notes = [];
    const withheld = [];
    const unreadable = [];

    /**
     * Glides are exempt from the marginal-attestation cutoff.
     *
     * Not special pleading — a spelling artefact. Every Latin-based
     * transcription conflates the glides with their vowel partners: <i>/<y> for
     * /j/, <u>/<w> for /w/. A corpus of names therefore systematically
     * UNDER-counts glides relative to how common they are in the language, and
     * a raw frequency cutoff would throw away segments that are near-universal.
     * /j/ is present in roughly 84% of the world's languages.
     */
    const GLIDE_EXEMPT = ['j', 'w'];

    // `segmentMap` records daughter-form → proto-form throughout, so that the
    // phonotactic spec (coda inventory, licensed clusters) can be re-expressed
    // in terms of the reconstructed proto rather than the attested daughters.
    const segmentMap = new Map();

    // 1 ── Start from the attested consonants, dropping the marginal ones.
    // Marginal is relative as well as absolute: in a corpus of thousands of
    // name segments, a consonant seen a handful of times is a later
    // innovation or a borrowing in a few names, not proto stock (DJ, 15 Oct
    // 2026, thin toward Earth: Andah had almost no inventories of 18 or
    // fewer consonants, where Earth has 38%).
    const consonantTokens = profile.consonants.reduce((n, c) => n + c.total, 0) || 1;
    let attested = [];
    for (const c of profile.consonants) {
        // Explicitly withheld: well attested, but judged a later innovation.
        // The corpus is the sum of every branch's innovations superimposed, so
        // "well attested across the family" and "present in the ancestor" are
        // different claims.
        if (withhold.includes(c.ipa)) { withheld.push({ ipa: c.ipa, count: c.total, reason: 'held for later innovation' }); continue; }

        // A daughter segment that reflects a simpler ancestor. Retroflexion is
        // the standard case: Mandarin's /ɻ/ and /ʂ/ go back to plain *r and
        // *sr, and no reconstruction of Old Chinese gives the proto a retroflex
        // series. Same logic as the laryngeal reconstruction, one segment at a
        // time.
        const target = deriveFrom[c.ipa];
        if (target) {
            const ph = fromIpa(target);
            if (ph) {
                attested.push(ph);
                segmentMap.set(c.ipa, target);
                notes.push(`${c.ipa} ← *${target} (retroflexion/marked place treated as a daughter innovation)`);
                continue;
            }
        }

        const ph = fromIpa(c.ipa);
        if (!ph) { unreadable.push(c.ipa); continue; }
        if (c.total <= marginalCutoff && !GLIDE_EXEMPT.includes(c.ipa)) {
            withheld.push({ ipa: c.ipa, count: c.total, reason: `≤${marginalCutoff} attestations` });
            continue;
        }
        if (c.total / consonantTokens < MARGINAL_SHARE && !GLIDE_EXEMPT.includes(c.ipa)) {
            withheld.push({ ipa: c.ipa, count: c.total, reason: `under ${(MARGINAL_SHARE * 100).toFixed(1)}% of the consonants in the names` });
            continue;
        }
        attested.push(ph);
    }
    if (unreadable.length) notes.push(`⚠ Unreadable segments skipped: ${unreadable.join(' ')} — the feature tables have no entry for these.`);
    if (withheld.length) {
        notes.push(`Withheld from the proto as later innovations: ${withheld.map((w) => `${w.ipa}×${w.count} (${w.reason})`).join(', ')}`);
    }

    // 2 ── Reconstruct the laryngeal system behind the evidence.
    if (laryngeal === 'voicing') {
        const before = attested.slice();
        const r = reconstructVoicingBehindAspiration(attested);
        attested = r.phonemes;
        for (const ph of before) {
            if (ph.type !== 'C' || !['stop', 'affricate'].includes(ph.f.manner)) continue;
            const proto = ph.f.aspirated
                ? consonant({ ...ph.f, aspirated: false, voice: false })
                : (!ph.f.voice ? consonant({ ...ph.f, voice: true }) : ph);
            if (proto.ipa !== ph.ipa) segmentMap.set(ph.ipa, proto.ipa);
        }
        if (r.notes.length) notes.push('Laryngeal reconstruction (Middle-Chinese pattern, run backwards):', ...r.notes.map((n) => '  ' + n));
    }

    /**
     * 3 ── Restore what the corpus was too small to show.
     *
     * The evidence CONSTRAINS the reconstruction; it does not determine it.
     * Nobody reconstructs a six-phoneme proto because they happen to have six
     * daughters — they reconstruct what the attested segments imply, and mark
     * the rest as inferred. See estimateUnseen() for why the number comes from
     * Chao's estimator rather than from a target.
     *
     * Two things are never touched: a segment the config deliberately withheld
     * as a later innovation, and one it mapped to a simpler ancestor. Both are
     * judgements a human made at a review gate, and an estimator does not get
     * to overrule them.
     */
    const inferred = [];
    {
        const est = estimateUnseen(profile.consonants.map((c) => c.total));
        const present = new Set(attested.map((p) => p.ipa));
        const offLimits = new Set([...withhold, ...Object.keys(deriveFrom)]);
        let toAdd = est.unseen;

        /**
         * The backstop, and it is a claim about the world rather than a target.
         * Rotokas is the smallest inventory ever recorded at eleven phonemes
         * and is famous precisely because it is the smallest. An inventory
         * below it is not a rare language, it is an artefact — so the floor
         * fires only when the estimator has already had its say and the result
         * is still outside anything attested.
         */
        const FLOOR = SIZE_BANDS.small[0];
        const projected = () => attested.length + toAdd + vowelCount;
        if (projected() < FLOOR) toAdd += FLOOR - projected();
        /**
         * The ceiling. Chao's estimate is generous on a small corpus with many
         * one-off segments (Proto-Pyrru-Kanqer drew thirteen extra consonants
         * from sixteen attested). Inference fills a gap the evidence cannot
         * show; it does not make a language richer than a typical one. So it
         * stops at Earth's typical consonant count (WALS 1A: mean about 22,
         * median about 21); what the names attest is kept whatever its size.
         */
        toAdd = Math.min(toAdd, Math.max(0, INFERRED_CEILING - attested.length));

        for (const [ipa] of CONSONANT_PRIOR) {
            if (toAdd <= 0) break;
            if (present.has(ipa) || offLimits.has(ipa)) continue;
            const ph = fromIpa(ipa);
            if (!ph) continue;
            // Marked, so the panel can separate what the names attest from what
            // typology supplies. A reconstruction that cannot tell you which of
            // its segments are evidence and which are inference is not a
            // reconstruction.
            attested.push({ ...ph, inferred: true });
            inferred.push(ipa);
            present.add(ipa);
            toAdd -= 1;
        }
        if (inferred.length) {
            notes.push(`Beyond the corpus: ${est.note}.`);
            notes.push(`  Supplied from cross-linguistic frequency, marked as inferred rather than attested: ${inferred.join(' ')}`);
            notes.push('  These are the commonest consonants on earth, and a language of this size almost certainly had them; the corpus is simply too small to show it.');
        }
    }

    /**
     * 3b ── The family's size on Earth's scale (lang-config `consonantTarget`,
     * spread across the families by scripts/assign-consonants.js). Earth's
     * families differ widely, from Hawaiian's eight consonants to the
     * Caucasus's fifty, and Andah's all sat near twenty-two. Above the target,
     * the inferred consonants go first, then the least attested, each kept
     * as a later innovation rather than proto stock; below it, the commonest
     * consonants the names do not show are supplied, then whole series
     * (aspirated, then ejective stops), the way rich systems grow.
     */
    if (consonantTarget) {
        const countOf = new Map(profile.consonants.map((c) => [c.ipa, c.total]));
        while (attested.length > consonantTarget) {
            let k = attested.findIndex((p) => p.inferred);
            if (k < 0) {
                let low = Infinity;
                attested.forEach((p, i) => {
                    if (GLIDE_EXEMPT.includes(p.ipa) || ['m', 'n', 'p', 't', 'k'].includes(p.ipa)) return;
                    const n = countOf.get(p.ipa) ?? 0;
                    if (n < low) { low = n; k = i; }
                });
            }
            if (k < 0) break;
            const [gone] = attested.splice(k, 1);
            const ix = inferred.indexOf(gone.ipa);
            if (ix >= 0) inferred.splice(ix, 1);
            else withheld.push({ ipa: gone.ipa, count: countOf.get(gone.ipa) ?? 0, reason: `beyond the family's size (${consonantTarget})` });
        }
        const present = new Set(attested.map((p) => p.ipa));
        const offLimits = new Set([...withhold, ...Object.keys(deriveFrom)]);
        const supply = (ph) => {
            if (!ph || present.has(ph.ipa) || offLimits.has(ph.ipa) || attested.length >= consonantTarget) return;
            attested.push({ ...ph, inferred: true });
            inferred.push(ph.ipa);
            present.add(ph.ipa);
        };
        /**
         * In a weighted random order, each consonant as likely to come as it
         * is common on Earth, not always the same few: supplied in one fixed
         * order every family short of its size took m k j p w n t l s h ŋ, so
         * fifteen of eighteen protos had ŋ (WALS 9A: half of Earth's
         * languages have none) and all had l. Two languages of one size do
         * not share one inventory.
         */
        const order = CONSONANT_PRIOR.map(([ipa, p]) => [ipa, Math.pow(rng.float(0, 1), 1 / p)]).sort((x, y) => y[1] - x[1]);
        for (const [ipa] of order) supply(fromIpa(ipa));
        for (const feature of ['aspirated', 'glottalised']) {
            for (const p of attested.filter((x) => !x.f.voice && (x.f.manner === 'stop' || x.f.manner === 'affricate') && !x.f.aspirated && !x.f.glottalised)) {
                supply(consonant({ ...p.f, [feature]: true }));
            }
        }
        notes.push(`Sized to ${consonantTarget} consonants (the family's place on Earth's spread, set in lang-config).`);
    }

    // 4 ── Repair against the implicational universals, then hold the size:
    // what the universals add is paid for by the least attested segment they
    // do not require (the cut ran before them, and they put f and p back).
    let { consonants, log } = enforceUniversals(attested);
    if (consonantTarget) {
        const countOf = new Map(profile.consonants.map((c) => [c.ipa, c.total]));
        const required = new Set(log.map((l) => l.split(' ')[0].slice(1)));
        while (consonants.length > consonantTarget) {
            let k = -1, low = Infinity;
            consonants.forEach((p, i) => {
                if (required.has(p.ipa) || GLIDE_EXEMPT.includes(p.ipa) || ['m', 'n', 'p', 't', 'k'].includes(p.ipa)) return;
                const n = p.inferred ? -1 : (countOf.get(p.ipa) ?? 0);
                if (n < low) { low = n; k = i; }
            });
            if (k < 0) break;
            const gone = consonants[k];
            const again = enforceUniversals(consonants.filter((_, i) => i !== k));
            if (again.consonants.length >= consonants.length) break;
            consonants = again.consonants;
            if (!gone.inferred) withheld.push({ ipa: gone.ipa, count: countOf.get(gone.ipa) ?? 0, reason: `beyond the family's size (${consonantTarget}) once the universals were in` });
        }
    }
    if (log.length) notes.push('Universals applied:', ...log.map((l) => '  ' + l));

    // 5 ── Sanity-check the resulting size and C:V ratio.
    const vowels = buildVowels(vowelCount, { length: vowelLength });
    const total = consonants.length + vowels.length;
    const band = total < SIZE_BANDS.typical[0] ? 'small' : total > SIZE_BANDS.typical[1] ? 'large' : 'typical';
    const ratio = consonants.length / Math.max(1, vowels.length);
    if (ratio > 6) notes.push(`⚠ consonant:vowel ratio ${ratio.toFixed(1)}:1 is high — plausible but unusual`);
    if (ratio < 1.5) notes.push(`⚠ consonant:vowel ratio ${ratio.toFixed(1)}:1 is low for a language with this syllable canon`);

    return {
        consonants: sortConsonants(consonants),
        vowels,
        size: total,
        band,
        ratio,
        withheld,
        inferred,
        segmentMap,
        notes,
    };
}

/** Chart order: by place front→back, then by manner, then voiceless first. */
export function sortConsonants(list) {
    const PLACE_ORDER = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
    const MANNER_ORDER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];
    return [...list].sort((a, b) =>
        MANNER_ORDER.indexOf(a.f.manner) - MANNER_ORDER.indexOf(b.f.manner)
        || PLACE_ORDER.indexOf(a.f.place) - PLACE_ORDER.indexOf(b.f.place)
        || (a.f.voice ? 1 : 0) - (b.f.voice ? 1 : 0)
        || a.ipa.localeCompare(b.ipa));
}

/** An IPA-chart-shaped text rendering, for the CLI and the review gate. */
export function formatInventory(inv) {
    const L = [];
    const PLACE_ORDER = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
    const SHORT = { bilabial: 'bilab', labiodental: 'labdt', dental: 'dent', alveolar: 'alv', postalveolar: 'postalv', retroflex: 'retro', alveolopalatal: 'alvpal', palatal: 'pal', velar: 'vel', labiovelar: 'lab-vel', uvular: 'uvu', pharyngeal: 'phar', glottal: 'glot' };
    const MANNER_ORDER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];

    const places = PLACE_ORDER.filter((p) => inv.consonants.some((c) => c.f.place === p));
    const w = 9;
    L.push(`Consonants (${inv.consonants.length})`);
    L.push('           ' + places.map((p) => SHORT[p].padEnd(w)).join(''));
    for (const manner of MANNER_ORDER) {
        const row = inv.consonants.filter((c) => c.f.manner === manner && !c.f.lateral);
        if (!row.length) continue;
        L.push(manner.padEnd(11) + places.map((p) => row.filter((c) => c.f.place === p).map((c) => c.ipa).join(' ').padEnd(w)).join(''));
    }
    const lat = inv.consonants.filter((c) => c.f.lateral);
    if (lat.length) L.push('lateral    ' + places.map((p) => lat.filter((c) => c.f.place === p).map((c) => c.ipa).join(' ').padEnd(w)).join(''));
    L.push('');
    L.push(`Vowels (${inv.vowels.length}): ${inv.vowels.map((v) => v.ipa).join(' ')}`);
    L.push(`Total ${inv.size} phonemes — ${inv.band} band; C:V ratio ${inv.ratio.toFixed(1)}:1`);
    if (inv.notes.length) { L.push(''); L.push(...inv.notes); }
    return L.join('\n');
}
