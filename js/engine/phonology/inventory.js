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

    // 3 ── Repair against the implicational universals.
    const { consonants, log } = enforceUniversals(attested);
    if (log.length) notes.push('Universals applied:', ...log.map((l) => '  ' + l));

    // 4 ── Sanity-check the resulting size and C:V ratio.
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
