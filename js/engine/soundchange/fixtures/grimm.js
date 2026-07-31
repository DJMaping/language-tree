/**
 * REGRESSION FIXTURE — Grimm's Law and Verner's Law.
 *
 * Proto-Indo-European → Proto-Germanic, the most famous sound law in
 * linguistics and the one the whole discipline was built on. If the engine can
 * reproduce it, it can be trusted with invented languages.
 *
 * This fixture is chosen deliberately, because it exercises three things no
 * simpler test would:
 *
 * 1. **A CHAIN SHIFT with counterfeeding order.** Grimm's Law is three linked
 *    changes that would collide if applied in the wrong sequence. The voiced
 *    stops become voiceless (*d > t), and the voiceless stops become fricatives
 *    (*t > θ). If those ran in the other order, every *d would end up as θ and
 *    the entire Germanic consonant system would be wrong. Running "voiceless →
 *    fricative" FIRST means the new /t/ from *d arrives too late to be caught:
 *    textbook counterfeeding, and the reason a push chain preserves contrasts
 *    instead of collapsing them.
 *
 * 2. **A negative environment — the Germanic spirant law.** Grimm's Law is
 *    blocked after /s/. That is why English kept the /t/ in "star", "stone" and
 *    "guest" while losing it everywhere else ("three", "tooth", "heart"). Any
 *    engine that can't express "not after X" gets these wrong.
 *
 * 3. **A STRESS-CONDITIONED rule on an accent the language then abolished.**
 *    Verner's Law voices Grimm's new fricatives when the preceding vowel was
 *    unaccented in PIE. Proto-Germanic went on to move all stress to the first
 *    syllable, erasing the very conditioning that produced the alternation —
 *    which is why "father" has /ð/ but "brother" has /θ/, and why nobody could
 *    explain it for fifty years. Passing this proves stress is carried on the
 *    segments rather than recomputed.
 *
 * Inputs are pre-Germanic forms with the PIE accent marked. Laryngeals and
 * syllabic resonants are normalised away: the claim under test is the
 * CONSONANT correspondences, not the whole of Indo-European vocalism.
 */

import { makeRule } from '../rule.js';

const notAfterS = [{ not: { is: 's' } }];

/**
 * Grimm's Law, stated the way the handbooks state it: as a table of
 * correspondences, one rule per place of articulation.
 *
 * It could be written as a single feature rule ("voiceless stop → fricative"),
 * but that would produce /t/ → /s/, and Germanic's reflex is the DENTAL /θ/,
 * not the alveolar sibilant. The place shift is real and the explicit table is
 * the honest way to say so.
 */
export const GRIMM_RULES = [
    // ── Stage 1: voiceless stops → voiceless fricatives ────────────────────
    // Runs FIRST. Everything about the chain depends on this.
    makeRule({ id: 'grimm-1a', category: 'lenition', label: 'Grimm 1: *p > f',
        a: { is: 'p' }, b: { set: 'f' }, env: { before: notAfterS },
        analogue: 'PIE *pṓds > PGmc *fōts > English "foot"' }),
    makeRule({ id: 'grimm-1b', category: 'lenition', label: 'Grimm 1: *t > θ',
        a: { is: 't' }, b: { set: 'θ' }, env: { before: notAfterS },
        analogue: 'PIE *tréyes > PGmc *þrīz > English "three"' }),
    makeRule({ id: 'grimm-1c', category: 'lenition', label: 'Grimm 1: *k > x',
        a: { is: 'k' }, b: { set: 'x' }, env: { before: notAfterS },
        analogue: 'PIE *ḱm̥tóm > PGmc *hundą > English "hundred"' }),
    makeRule({ id: 'grimm-1d', category: 'lenition', label: 'Grimm 1: *kʷ > xʷ',
        a: { is: 'kʷ' }, b: { set: 'xʷ' }, env: { before: notAfterS },
        analogue: 'PIE *kʷod > PGmc *hwat > English "what"' }),

    // ── Stage 2: voiced stops → voiceless stops ────────────────────────────
    // Runs SECOND. Its output (/t/ from *d) is exactly what stage 1 would have
    // eaten. Counterfeeding order is what saves it.
    makeRule({ id: 'grimm-2a', category: 'fortition', label: 'Grimm 2: *b > p',
        a: { is: 'b' }, b: { set: 'p' },
        analogue: 'PIE *dʰeub- > PGmc *deupaz > English "deep"' }),
    makeRule({ id: 'grimm-2b', category: 'fortition', label: 'Grimm 2: *d > t',
        a: { is: 'd' }, b: { set: 't' },
        analogue: 'PIE *déḱm̥ > PGmc *tehun > English "ten"' }),
    makeRule({ id: 'grimm-2c', category: 'fortition', label: 'Grimm 2: *ɡ > k',
        a: { is: 'ɡ' }, b: { set: 'k' },
        analogue: 'PIE *ǵénu- > PGmc *knewą > English "knee"' }),
    makeRule({ id: 'grimm-2d', category: 'fortition', label: 'Grimm 2: *ɡʷ > kʷ',
        a: { is: 'ɡʷ' }, b: { set: 'kʷ' },
        analogue: 'PIE *gʷeyh₃- > PGmc *kwikwaz > English "quick"' }),

    // ── Stage 3: voiced aspirates → voiced stops ───────────────────────────
    // Runs THIRD, filling the gap stage 2 just vacated. This is what makes it a
    // PUSH CHAIN rather than three unrelated changes: each step moves into the
    // space the one before it emptied, and no contrast is lost.
    makeRule({ id: 'grimm-3a', category: 'chainshift', label: 'Grimm 3: *bʰ > b',
        a: { is: 'bʰ' }, b: { set: 'b' },
        analogue: 'PIE *bʰréh₂tēr > PGmc *brōþēr > English "brother"' }),
    makeRule({ id: 'grimm-3b', category: 'chainshift', label: 'Grimm 3: *dʰ > d',
        a: { is: 'dʰ' }, b: { set: 'd' },
        analogue: 'PIE *dʰwer- > PGmc *duraz > English "door"' }),
    makeRule({ id: 'grimm-3c', category: 'chainshift', label: 'Grimm 3: *ɡʰ > ɡ',
        a: { is: 'ɡʰ' }, b: { set: 'ɡ' },
        analogue: 'PIE *ǵʰostis > PGmc *gastiz > English "guest"' }),
    makeRule({ id: 'grimm-3d', category: 'chainshift', label: 'Grimm 3: *ɡʷʰ > ɡʷ',
        a: { is: 'ɡʷʰ' }, b: { set: 'ɡʷ' },
        analogue: 'PIE *gʷʰermos > PGmc *warmaz > English "warm"' }),
];

/**
 * Verner's Law.
 *
 * Grimm's new voiceless fricatives — and inherited /s/ — become voiced when the
 * immediately preceding vowel did NOT carry the PIE accent.
 *
 * Expressed as a single feature rule, because unlike Grimm's Law this one
 * genuinely is uniform across places: it only changes voicing.
 */
export const VERNER_RULE = makeRule({
    id: 'verner', category: 'assimilation', label: "Verner's Law",
    a: { type: 'C', manner: 'fricative', voice: false },
    b: { delta: { voice: true } },
    env: { before: [{ type: 'V', stress: 'unstressed' }] },
    analogue: 'PIE *ph₂tḗr > PGmc *fadēr ("father", accent follows) vs *bʰréh₂tēr > *brōþēr ("brother", accent precedes)',
    note: 'Conditioned on an accent Proto-Germanic then abolished in favour of fixed initial stress — which is why the alternation looks arbitrary in the daughter languages.',
});

export const GRIMM_VERNER = [...GRIMM_RULES, VERNER_RULE];

/**
 * Attested correspondences. `expect` is the Proto-Germanic consonantism.
 *
 * Vowels are carried through unchanged — this fixture makes no claim about
 * Germanic vocalism, which is a separate and much messier story.
 */
export const GRIMM_CASES = [
    { pie: 'paˈteːr',    expect: 'faˈðeːr',    gloss: 'father',
      why: 'p > f; t > θ then Verner voices it to ð, because the accent is on the FOLLOWING syllable' },
    { pie: 'ˈbʰraːteːr', expect: 'ˈbraːθeːr',  gloss: 'brother',
      why: 'bʰ > b; t > θ and Verner is BLOCKED, because the preceding syllable is accented — the minimal pair with "father"' },
    { pie: 'ˈtrejes',    expect: 'ˈθrejez',    gloss: 'three',
      why: 't > θ; final *s voiced to z by Verner after an unaccented vowel' },
    { pie: 'ˈdekam',     expect: 'ˈtexam',     gloss: 'ten',
      why: 'd > t (Grimm 2) and k > x (Grimm 1) in the same word — the counterfeeding order test: the new /t/ must NOT become θ' },
    { pie: 'ˈɡʰostis',   expect: 'ˈɡostiz',    gloss: 'guest',
      why: 'ɡʰ > ɡ; the /t/ SURVIVES because it follows /s/ (spirant law); final s > z by Verner' },
    { pie: 'ˈpiskos',    expect: 'ˈfiskoz',    gloss: 'fish',
      why: 'p > f, but /k/ survives after /s/ — the spirant law again, which is why English has "fish" not *"fihh"' },
    { pie: 'ˈkʷod',      expect: 'ˈxʷot',      gloss: 'what',
      why: 'kʷ > xʷ and d > t; labiovelars shift as a unit' },
    { pie: 'ˈbʰeroː',    expect: 'ˈberoː',     gloss: 'bear/carry',
      why: 'bʰ > b, the third stage of the chain moving into the gap the second stage left' },
    { pie: 'ˈswekuros',  expect: 'ˈswexuroz',  gloss: 'father-in-law',
      why: 'k > x, and Verner is blocked because the preceding vowel IS accented; the final s still voices' },
    { pie: 'sweˈkruːs',  expect: 'sweˈɣruːs',  gloss: 'mother-in-law',
      why: 'the same root with the accent moved: now Verner DOES apply, x > ɣ. The pair is the whole of Verner’s Law in two words' },
];
