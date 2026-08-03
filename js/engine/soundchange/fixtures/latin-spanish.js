/**
 * REGRESSION FIXTURE — Latin → Spanish.
 *
 * A twenty-rule chain covering two thousand years, and a harder test than
 * Grimm's Law because almost every rule here depends on another one having
 * already run, or on another one NOT having run yet.
 *
 * The two orderings worth staring at:
 *
 * **Intervocalic voicing BEFORE degemination** — counterfeeding, and the reason
 * Spanish has "gota" from GUTTAM rather than *"goda". Latin's geminate /tt/ is
 * not intervocalic in the relevant sense, so voicing skips it; degemination
 * then produces a brand-new single /t/ between vowels, but voicing has already
 * been and gone. Flip these two rules and a whole class of words comes out
 * wrong.
 *
 * **Velar vocalisation and yod-raising BEFORE diphthongisation** — bleeding.
 * Stressed /ɔ/ normally diphthongises to /we/ (FOCUM > "fuego"). But in OCTŌ
 * the /k/ first vocalises to a yod, the yod raises /ɔ/ to /o/, and by the time
 * diphthongisation runs there is no /ɔ/ left to work on. Result: "ocho", not
 * *"uecho". The diphthongisation rule is never told about /kt/; it simply
 * arrives too late.
 *
 * Long vowels are written with ː. Latin stress is assigned by the moraic
 * trochee (the "Latin rule": penult if heavy, else antepenult) and then BAKED
 * onto the vowels, so it survives the loss of vowel quantity that follows —
 * exactly as it did historically.
 */

import { makeRule } from '../rule.js';

const V = { type: 'V' };
const stressed = { type: 'V', stress: 'stressed' };

export const LATIN_SPANISH_RULES = [
    // ── 1. Loss of final -m ────────────────────────────────────────────────
    // Already weak in Classical Latin — the poets ignore it in scansion.
    makeRule({ id: 'ls-01', category: 'deletion', label: 'loss of final -m',
        a: { is: 'm' }, b: { empty: true }, env: { after: [{ boundary: '#' }] },
        analogue: 'Latin LVPVM > lupu > Spanish "lobo"' }),

    // ── 2–6. The Vulgar Latin vowel restructuring ──────────────────────────
    // Latin contrasted vowels by LENGTH; Romance rebuilt the system on QUALITY.
    // The order inside this block is not free. Short /e/ must lower to /ɛ/
    // before short /i/ lowers to /e/, or the two would merge; and the long
    // vowels must shorten LAST, or long ī would be caught by the ĭ > e rule.
    // Getting this wrong merges the wrong pairs — and it is precisely why Latin
    // ē and ĭ fell together while ī stayed apart.
    makeRule({ id: 'ls-02', category: 'vowel', label: 'ĕ > ɛ',
        a: { type: 'V', height: 2, back: 1, long: false }, b: { delta: { height: 4 } },
        analogue: 'Latin PETRAM > Spanish "piedra"' }),
    makeRule({ id: 'ls-03', category: 'vowel', label: 'ŏ > ɔ',
        a: { type: 'V', height: 2, back: 3, round: true, long: false }, b: { delta: { height: 4 } },
        analogue: 'Latin FOCVM > Spanish "fuego"' }),
    makeRule({ id: 'ls-04', category: 'vowel', label: 'ĭ > e',
        a: { type: 'V', height: 1, back: 1, long: false }, b: { delta: { height: 2 } },
        analogue: 'Latin PILVM > Spanish "pelo" — ĭ and ē merge' }),
    makeRule({ id: 'ls-05', category: 'vowel', label: 'ŭ > o',
        a: { type: 'V', height: 1, back: 3, round: true, long: false }, b: { delta: { height: 2 } },
        analogue: 'Latin LVPVM > Spanish "lobo" — ŭ and ō merge' }),
    makeRule({ id: 'ls-06', category: 'vowel', label: 'loss of contrastive length',
        a: { type: 'V', long: true }, b: { delta: { long: false } },
        analogue: 'The quantity system collapses everywhere in Romance; the stress it had already assigned stays put' }),

    // ── 7–9. The /kt/ chain ────────────────────────────────────────────────
    // Three rules that feed each other in strict sequence, and collectively
    // BLEED the diphthongisation that follows.
    makeRule({ id: 'ls-07', category: 'lenition', label: 'k > j / _t (velar vocalisation)',
        a: { is: 'k' }, b: { set: 'j' }, env: { after: [{ is: 't' }] },
        analogue: 'Latin NOCTEM > *nojte > Spanish "noche"' }),
    makeRule({ id: 'ls-08a', category: 'assimilation', label: 'ɔ > o / _j (yod raising)',
        a: { type: 'V', height: 4, back: 3 }, b: { delta: { height: 2 } }, env: { after: [{ is: 'j' }] },
        analogue: 'Latin OCTŌ > "ocho", NOT *"uecho" — the yod raises the vowel out of reach of diphthongisation' }),
    makeRule({ id: 'ls-08b', category: 'assimilation', label: 'ɛ > e / _j',
        a: { type: 'V', height: 4, back: 1 }, b: { delta: { height: 2 } }, env: { after: [{ is: 'j' }] } }),
    makeRule({ id: 'ls-08c', category: 'assimilation', label: 'a > e / _j',
        a: { type: 'V', height: 5 }, b: { set: 'e' }, env: { after: [{ is: 'j' }] },
        analogue: 'Latin LACTEM > *lajte > *lejte > Spanish "leche"' }),
    makeRule({ id: 'ls-09', category: 'assimilation', label: 'jt > t͡ʃ',
        a: { seq: [{ is: 'j' }, { is: 't' }] }, b: { set: 't͡ʃ' },
        analogue: 'Latin OCTŌ > Spanish "ocho"; LACTEM > "leche"' }),

    // ── 10. Diphthongisation of the stressed open-mid vowels ───────────────
    // The signature Spanish change, and the one the /kt/ chain above has
    // already starved of half its inputs.
    makeRule({ id: 'ls-10a', category: 'vowel', label: 'stressed ɛ > je',
        a: { ...stressed, height: 4, back: 1 }, b: { set: 'je' },
        analogue: 'Latin SEPTEM > Spanish "siete"; TERRAM > "tierra"' }),
    makeRule({ id: 'ls-10b', category: 'vowel', label: 'stressed ɔ > we',
        a: { ...stressed, height: 4, back: 3 }, b: { set: 'we' },
        analogue: 'Latin FOCVM > Spanish "fuego"; SCHOLAM > "escuela"' }),

    // ── 11. Intervocalic lenition ──────────────────────────────────────────
    // MUST precede degemination. The environment includes a following liquid,
    // because the muta-cum-liquida cluster counts as an onset: PETRAM > piedra,
    // PATREM > padre.
    makeRule({ id: 'ls-11', category: 'lenition', label: 'voiceless stop > voiced / V _ (V|liquid)',
        a: { type: 'C', manner: 'stop', voice: false },
        b: { delta: { voice: true } },
        env: { before: [V], after: [{ any: [V, { class: 'liquid' }] }] },
        analogue: 'Latin VĪTAM > Spanish "vida"; AMĪCVM > "amigo"; LVPVM > "lobo"' }),

    // ── 12. Cluster simplification ─────────────────────────────────────────
    // AFTER lenition, and that is load-bearing. SEPTEM still had its /p/ when
    // lenition ran, so the /t/ was not intervocalic and did not voice. Only
    // then does the /p/ drop, giving "siete" — with a /t/. Run this rule before
    // lenition and Spanish would say *"siede".
    makeRule({ id: 'ls-12', category: 'deletion', label: 'p > ∅ / _t',
        a: { is: 'p' }, b: { empty: true }, env: { after: [{ is: 't' }] },
        analogue: 'Latin SEPTEM > Spanish "siete"' }),

    // ── 13. Degemination ───────────────────────────────────────────────────
    // The counterfeeding partner of rule 11: it manufactures new intervocalic
    // singletons that lenition will never see.
    makeRule({ id: 'ls-13b', category: 'deletion', label: 'tt > t',
        a: { seq: [{ is: 't' }, { is: 't' }] }, b: { set: 't' },
        analogue: 'Latin GVTTAM > Spanish "gota" — with /t/, because voicing had already run' }),
    makeRule({ id: 'ls-13c', category: 'deletion', label: 'pp > p',
        a: { seq: [{ is: 'p' }, { is: 'p' }] }, b: { set: 'p' } }),
    makeRule({ id: 'ls-13d', category: 'deletion', label: 'kk > k',
        a: { seq: [{ is: 'k' }, { is: 'k' }] }, b: { set: 'k' } }),
    makeRule({ id: 'ls-13e', category: 'assimilation', label: 'nn > ɲ',
        a: { seq: [{ is: 'n' }, { is: 'n' }] }, b: { set: 'ɲ' },
        analogue: 'Latin ANNVM > Spanish "año" — the source of the letter ñ, originally an abbreviation for double n' }),
    makeRule({ id: 'ls-13f', category: 'assimilation', label: 'll > ʎ',
        a: { seq: [{ is: 'l' }, { is: 'l' }] }, b: { set: 'ʎ' },
        analogue: 'Latin CABALLVM > Spanish "caballo"' }),

    // ── 14. Unstressed open-mid vowels merge back ──────────────────────────
    // The ɛ/e and ɔ/o contrasts survive only under stress; elsewhere they
    // collapse. That asymmetry is why the diphthongs appear only in stressed
    // syllables and alternate within paradigms (puedo / podemos).
    makeRule({ id: 'ls-14a', category: 'vowel', label: 'unstressed ɛ > e',
        a: { type: 'V', height: 4, back: 1, stress: 'unstressed' }, b: { delta: { height: 2 } } }),
    makeRule({ id: 'ls-14b', category: 'vowel', label: 'unstressed ɔ > o',
        a: { type: 'V', height: 4, back: 3, stress: 'unstressed' }, b: { delta: { height: 2 } } }),

    // ── 15. Prothesis ──────────────────────────────────────────────────────
    // Spanish forbids an initial /s/+consonant cluster and repairs it with a
    // vowel. Still productive today: "estrés", "esnob", "eslogan".
    // The following consonant must be a true consonant, not a glide: SEPTEM
    // gives "siete" with no prothetic vowel, because /sj/ is /s/ plus the
    // on-glide of a rising diphthong, and the syllable is /sje/ — an ordinary
    // onset, not the illegal /s/+obstruent cluster the rule exists to repair.
    makeRule({ id: 'ls-15', category: 'insertion', label: '∅ > e / #_ sC',
        a: { empty: true }, b: { set: 'e' },
        env: { before: [{ boundary: '#' }], after: [{ is: 's' }, { type: 'C', manner: { not: 'approximant' } }] },
        analogue: 'Latin SCHOLAM > Spanish "escuela"; STELLAM > "estrella"' }),
];

/**
 * Attested outcomes.
 *
 * Written in the phonemic form Spanish orthography stands for: "fuego" is
 * /fweɡo/, "ocho" is /ot͡ʃo/, "año" is /aɲo/.
 */
export const LATIN_SPANISH_CASES = [
    { latin: 'viːta',   expect: 'vida',    spanish: 'vida',    gloss: 'life',
      why: 'intervocalic /t/ voices — the single commonest change in Western Romance' },
    { latin: 'lupum',   expect: 'lobo',    spanish: 'lobo',    gloss: 'wolf',
      why: 'final -m drops, ŭ lowers to o twice, intervocalic /p/ voices to /b/' },
    { latin: 'amiːkum', expect: 'amiɡo',   spanish: 'amigo',   gloss: 'friend',
      why: 'stress sits on the heavy penult by the Latin rule, and stays there after length is lost' },
    { latin: 'fokum',   expect: 'fweɡo',   spanish: 'fuego',   gloss: 'fire',
      why: 'ŏ > ɔ > we under stress, and the /k/ voices — two changes in one short word' },
    { latin: 'petram',  expect: 'pjedra',  spanish: 'piedra',  gloss: 'stone',
      why: 'diphthongisation plus lenition before a liquid (muta cum liquida)' },
    { latin: 'septem',  expect: 'sjete',   spanish: 'siete',   gloss: 'seven',
      why: 'ORDERING TEST: /p/ still shields the /t/ when lenition runs, so the /t/ survives; the /p/ drops afterwards' },
    { latin: 'ɡuttam',  expect: 'ɡota',    spanish: 'gota',    gloss: 'drop',
      why: 'ORDERING TEST: the geminate escapes lenition, and degemination arrives too late for it to voice' },
    { latin: 'annum',   expect: 'aɲo',     spanish: 'año',     gloss: 'year',
      why: 'geminate /nn/ palatalises rather than simplifying — the origin of ñ' },
    { latin: 'oktoː',   expect: 'ot͡ʃo',   spanish: 'ocho',    gloss: 'eight',
      why: 'BLEEDING TEST: the yod raises ɔ to o before diphthongisation can reach it, so "ocho" not *"uecho"' },
    { latin: 'laktem',  expect: 'let͡ʃe',  spanish: 'leche',   gloss: 'milk',
      why: 'the same /kt/ chain, with a > e before the yod' },
    { latin: 'noktem',  expect: 'not͡ʃe',  spanish: 'noche',   gloss: 'night',
      why: 'the /kt/ chain again — three etyma, one mechanism' },
    { latin: 'skolam',  expect: 'eskwela', spanish: 'escuela', gloss: 'school',
      why: 'diphthongisation plus prothesis; the epenthetic vowel is unstressed because stress was fixed before it existed' },
];

/**
 * The two ordering pairs, isolated. Each is asserted to produce a DIFFERENT
 * (and historically wrong) result when the two rules are swapped — which is the
 * only way to prove the engine is genuinely sequential rather than accidentally
 * getting the right answer.
 */
export const ORDERING_PAIRS = [
    {
        name: 'counterfeeding: lenition before degemination',
        input: 'ɡuttam',
        rules: ['ls-01', 'ls-05', 'ls-11', 'ls-13b'],
        correct: 'ɡota',
        swapped: ['ls-01', 'ls-05', 'ls-13b', 'ls-11'],
        swappedResult: 'ɡoda',
        note: 'Degemination first would hand lenition a fresh intervocalic /t/. History ran them the other way.',
    },
    {
        name: 'counterfeeding: lenition before cluster simplification',
        input: 'septem',
        rules: ['ls-01', 'ls-02', 'ls-10a', 'ls-11', 'ls-12', 'ls-14a'],
        correct: 'sjete',
        swapped: ['ls-01', 'ls-02', 'ls-10a', 'ls-12', 'ls-11', 'ls-14a'],
        swappedResult: 'sjede',
        note: 'Drop the /p/ first and the /t/ becomes intervocalic in time to voice, giving a Spanish that never existed.',
    },
];
