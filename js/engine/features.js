/**
 * The distinctive-feature system.
 *
 * A phoneme in this engine is NOT a character. It is a bundle of articulatory
 * features, and the IPA string is only how we render that bundle for display.
 * Everything downstream depends on this:
 *
 *   - Sound changes match on features, so "all voiceless stops" is a QUERY
 *     rather than a hand-written list. That is what makes a rule apply to the
 *     right set of segments even after the inventory has changed underneath it.
 *   - Vowel height and backness are NUMERIC, not categorical. Raising, lowering,
 *     fronting and backing are then arithmetic on a vowel space, which is what
 *     lets the engine model a genuine chain shift: when /e/ raises to /i/ it
 *     leaves a hole at height 2, and /a/ can be dragged up into it.
 *
 * A phoneme's `id` is its IPA string. Identity across a merger is NOT carried by
 * the id — it is carried by the derivation history on each word, which records
 * every (rule, before, after) step. That is how the etymology display can still
 * say "this /p/ was a /b/ until Rule 12 devoiced it", even though /b/ no longer
 * exists in the language at all.
 */

// ---------------------------------------------------------------------------
// Feature vocabularies
// ---------------------------------------------------------------------------

/** Places of articulation, ordered front → back. The order is meaningful:
 *  assimilation and place shifts move along it by small steps. */
export const PLACES = [
    'bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar',
    'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar',
    'uvular', 'pharyngeal', 'glottal',
];

/** Manners of articulation, ordered by increasing sonority. */
export const MANNERS = [
    'stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant',
];

/**
 * The sonority hierarchy. Higher = more sonorous = closer to a vowel.
 *
 * This drives the Sonority Sequencing Principle: within a syllable, sonority
 * rises towards the nucleus and falls away from it. /pra/ is a legal syllable,
 * /rpa/ is not. Nearly every language obeys it, and nearly every language
 * licenses a short list of exceptions — /s/+stop being the famous one, which is
 * why English can begin a word with "st-" in defiance of the principle.
 */
export const SONORITY = {
    stop: 1, affricate: 2, fricative: 3, nasal: 4,
    trill: 5, tap: 5, lateral: 6, approximant: 7, vowel: 10,
};

/** Vowel height: 1 = close (high), 5 = open (low). */
export const HEIGHTS = { close: 1, closeMid: 2, mid: 3, openMid: 4, open: 5 };
/** Vowel backness: 1 = front, 2 = central, 3 = back. */
export const BACKNESS = { front: 1, central: 2, back: 3 };

// ---------------------------------------------------------------------------
// IPA tables
// ---------------------------------------------------------------------------

// place → manner → [voiceless, voiced]. `null` = not articulable / not used.
const C_TABLE = {
    bilabial:     { stop: ['p', 'b'], affricate: ['p͡ɸ', 'b͡β'], fricative: ['ɸ', 'β'], nasal: [null, 'm'], trill: [null, 'ʙ'] },
    // No labiodental STOP row on purpose. /p̪ b̪/ are attested in a handful of
    // languages worldwide and essentially never arise from ordinary sound
    // change: when /f/ or /v/ hardens, it hardens to /p/ or /b/. Leaving the
    // row out makes snapConsonant() walk a hardened labiodental to bilabial,
    // which is what actually happens.
    labiodental:  { fricative: ['f', 'v'], nasal: [null, 'ɱ'], approximant: [null, 'ʋ'] },
    dental:       { stop: ['t̪', 'd̪'], affricate: ['t̪͡θ', 'd̪͡ð'], fricative: ['θ', 'ð'], nasal: [null, 'n̪'] },
    alveolar:     { stop: ['t', 'd'], affricate: ['t͡s', 'd͡z'], fricative: ['s', 'z'], nasal: [null, 'n'], trill: [null, 'r'], tap: [null, 'ɾ'], approximant: [null, 'ɹ'] },
    postalveolar: { affricate: ['t͡ʃ', 'd͡ʒ'], fricative: ['ʃ', 'ʒ'] },
    retroflex:    { stop: ['ʈ', 'ɖ'], affricate: ['ʈ͡ʂ', 'ɖ͡ʐ'], fricative: ['ʂ', 'ʐ'], nasal: [null, 'ɳ'], tap: [null, 'ɽ'], approximant: [null, 'ɻ'] },
    // Alveolo-palatal is a place in its own right, not a variety of palatal.
    // It is where the Mandarin <j q x> series lives, and where palatalisation
    // of dentals most often lands, so it earns its own column.
    alveolopalatal: { affricate: ['t͡ɕ', 'd͡ʑ'], fricative: ['ɕ', 'ʑ'] },
    palatal:      { stop: ['c', 'ɟ'], affricate: ['c͡ç', 'ɟ͡ʝ'], fricative: ['ç', 'ʝ'], nasal: [null, 'ɲ'], approximant: [null, 'j'] },
    velar:        { stop: ['k', 'ɡ'], affricate: ['k͡x', 'ɡ͡ɣ'], fricative: ['x', 'ɣ'], nasal: [null, 'ŋ'], approximant: [null, 'ɰ'] },
    labiovelar:   { stop: ['k͡p', 'ɡ͡b'], approximant: [null, 'w'] },
    uvular:       { stop: ['q', 'ɢ'], affricate: ['q͡χ', 'ɢ͡ʁ'], fricative: ['χ', 'ʁ'], nasal: [null, 'ɴ'], trill: [null, 'ʀ'] },
    pharyngeal:   { fricative: ['ħ', 'ʕ'] },
    glottal:      { stop: ['ʔ', null], fricative: ['h', 'ɦ'] },
};

// Laterals live in their own table — laterality cross-cuts manner.
const C_LATERAL = {
    alveolar:  { fricative: ['ɬ', 'ɮ'], affricate: ['t͡ɬ', 'd͡ɮ'], approximant: [null, 'l'] },
    retroflex: { approximant: [null, 'ɭ'] },
    palatal:   { approximant: [null, 'ʎ'] },
    velar:     { approximant: [null, 'ʟ'] },
};

// height,backness,round → IPA
const V_TABLE = {
    '1,1,0': 'i',  '1,1,1': 'y',  '1,2,0': 'ɨ',  '1,2,1': 'ʉ',  '1,3,0': 'ɯ',  '1,3,1': 'u',
    '2,1,0': 'e',  '2,1,1': 'ø',  '2,2,0': 'ɘ',  '2,2,1': 'ɵ',  '2,3,0': 'ɤ',  '2,3,1': 'o',
    '3,1,0': 'e̞',  '3,1,1': 'ø̞',  '3,2,0': 'ə',  '3,2,1': 'ɵ̞',  '3,3,0': 'ɤ̞',  '3,3,1': 'o̞',
    '4,1,0': 'ɛ',  '4,1,1': 'œ',  '4,2,0': 'ɜ',  '4,2,1': 'ɞ',  '4,3,0': 'ʌ',  '4,3,1': 'ɔ',
    '5,1,0': 'a',  '5,1,1': 'ɶ',  '5,2,0': 'ä',  '5,2,1': 'ɒ̈',  '5,3,0': 'ɑ',  '5,3,1': 'ɒ',
};

// Modifier diacritics, applied in this order after the base symbol.
const MOD_ASPIRATED   = 'ʰ';
const MOD_GLOTTALISED = 'ʼ';
const MOD_PALATALISED = 'ʲ';
const MOD_LABIALISED  = 'ʷ';
const MOD_NASALISED   = '̃'; // combining tilde
const MOD_LONG        = 'ː';

/** Tone is written with the standard IPA chao-style letters, high → low. */
export const TONE_MARKS = { 1: '˩', 2: '˨', 3: '˧', 4: '˦', 5: '˥' };

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

const DEFAULT_C = {
    place: 'alveolar', manner: 'stop', voice: false, lateral: false,
    aspirated: false, glottalised: false, palatalised: false, labialised: false,
    long: false,
};

/**
 * `stress` sits on the VOWEL, not on the syllable, and it is carried through
 * every transformation rather than recomputed.
 *
 * This is not a convenience — it is required for correctness. Latin fixed its
 * stress by classical vowel QUANTITY, then lost the quantity distinction
 * entirely while the stress stayed exactly where it was. Recomputing stress
 * after each rule would move it when the conditioning was destroyed, and every
 * Romance diphthongisation would land on the wrong syllable.
 *
 * The same applies to Verner's Law, which is conditioned on the position of the
 * PIE accent — an accent Proto-Germanic then abolished in favour of fixed
 * initial stress. A rule can only see that accent if the accent is a property
 * of the segment that survives the rules operating around it.
 *
 * 0 = unstressed, 1 = primary, 2 = secondary.
 */
const DEFAULT_V = {
    height: 5, back: 2, round: false, nasal: false, long: false, tone: null, stress: 0,
};

/** Build the IPA rendering of a consonant feature bundle. */
function renderConsonant(f) {
    const table = f.lateral ? C_LATERAL : C_TABLE;
    const row = table[f.place];
    const pair = row && row[f.manner];
    let base = pair ? pair[f.voice ? 1 : 0] : null;

    // Fall back gracefully: a voiced segment with no dedicated symbol gets the
    // voiceless one plus a voicing diacritic, and vice versa. Sound changes
    // routinely produce segments no language happens to have a letter for.
    if (!base && pair) base = pair[f.voice ? 0 : 1] + (f.voice ? '̬' : '̥');
    if (!base) base = '?';

    let s = base;
    if (f.aspirated) s += MOD_ASPIRATED;
    if (f.glottalised) s += MOD_GLOTTALISED;
    if (f.palatalised) s += MOD_PALATALISED;
    if (f.labialised) s += MOD_LABIALISED;
    if (f.long) s += MOD_LONG;
    return s;
}

/** Build the IPA rendering of a vowel feature bundle. */
function renderVowel(f) {
    const h = clamp(Math.round(f.height), 1, 5);
    const b = clamp(Math.round(f.back), 1, 3);
    let s = V_TABLE[`${h},${b},${f.round ? 1 : 0}`] || '?';
    if (f.nasal) s += MOD_NASALISED;
    if (f.long) s += MOD_LONG;
    if (f.tone) s += (TONE_MARKS[f.tone] || '');
    return s;
}

function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

/**
 * Snap a feature bundle to the nearest combination a human can actually
 * articulate.
 *
 * Feature deltas compose freely, and free composition produces impossibilities.
 * "Make this fricative a stop" applied to /f/ asks for a labiodental stop;
 * "make this stop a trill" applied to /k/ asks for a velar trill, which cannot
 * be done at all. A generator that emitted those would fill the inventory with
 * segments no language has — and, worse, with segments this module has no
 * symbol for, which surfaced as a literal "?" in the phoneme chart.
 *
 * The repair walks outward along the place-of-articulation scale to the nearest
 * place where the requested manner IS articulable. That mirrors what speakers
 * do: an articulation that can't be made at one place is made at the closest
 * one that works.
 *
 * Crucially the snap happens BEFORE the feature bundle is frozen, so `f` and
 * `ipa` always describe the same segment. If the two could disagree, every
 * feature matcher downstream would be quietly testing a segment that doesn't
 * exist.
 */
function snapConsonant(f) {
    const table = f.lateral ? C_LATERAL : C_TABLE;
    const articulable = (place) => Boolean(table[place] && table[place][f.manner]);
    if (articulable(f.place)) return f;

    const idx = PLACES.indexOf(f.place);
    for (let d = 1; d < PLACES.length; d++) {
        for (const cand of [PLACES[idx - d], PLACES[idx + d]]) {
            if (cand && articulable(cand)) return { ...f, place: cand };
        }
    }
    // The manner is impossible everywhere (a lateral trill, say). Fall back to
    // the manner's nearest neighbour on the sonority scale rather than emitting
    // a segment with no symbol.
    const fallbackManner = { trill: 'tap', tap: 'approximant', affricate: 'fricative', approximant: 'fricative' }[f.manner] || 'fricative';
    if (fallbackManner !== f.manner) return snapConsonant({ ...f, manner: fallbackManner });
    return { ...f, lateral: false, place: 'alveolar', manner: 'fricative' };
}

/** Make a consonant. Unspecified features take sensible defaults. */
export function consonant(spec) {
    const f = snapConsonant({ ...DEFAULT_C, ...spec });
    const ipa = renderConsonant(f);
    return Object.freeze({ id: ipa, ipa, type: 'C', f: Object.freeze(f) });
}

/** Make a vowel. Unspecified features take sensible defaults. */
export function vowel(spec) {
    const f = { ...DEFAULT_V, ...spec };
    f.height = clamp(f.height, 1, 5);
    f.back = clamp(f.back, 1, 3);
    const ipa = renderVowel(f);
    return Object.freeze({ id: ipa, ipa, type: 'V', f: Object.freeze(f) });
}

export const isVowel = (ph) => ph && ph.type === 'V';
export const isConsonant = (ph) => ph && ph.type === 'C';

/** Sonority of a segment, for the sequencing principle and syllabification. */
export function sonorityOf(ph) {
    if (!ph) return 0;
    if (ph.type === 'V') return SONORITY.vowel;
    if (ph.f.lateral) return SONORITY.lateral;
    return SONORITY[ph.f.manner] ?? 1;
}

// ---------------------------------------------------------------------------
// Reading IPA back in (for hand-written rules, imported rulesets, fixtures)
// ---------------------------------------------------------------------------

const REVERSE = new Map(); // base symbol → partial feature bundle
(function buildReverse() {
    for (const [place, row] of Object.entries(C_TABLE)) {
        for (const [manner, pair] of Object.entries(row)) {
            pair.forEach((sym, i) => {
                if (sym && !REVERSE.has(sym)) REVERSE.set(sym, { type: 'C', place, manner, voice: i === 1, lateral: false });
            });
        }
    }
    for (const [place, row] of Object.entries(C_LATERAL)) {
        for (const [manner, pair] of Object.entries(row)) {
            pair.forEach((sym, i) => {
                if (sym && !REVERSE.has(sym)) REVERSE.set(sym, { type: 'C', place, manner, voice: i === 1, lateral: true });
            });
        }
    }
    for (const [key, sym] of Object.entries(V_TABLE)) {
        const [h, b, r] = key.split(',').map(Number);
        if (!REVERSE.has(sym)) REVERSE.set(sym, { type: 'V', height: h, back: b, round: !!r });
    }
})();

// Longest-first, so 't͡ʃ' is matched before 't'.
const BASE_SYMBOLS = [...REVERSE.keys()].sort((a, b) => b.length - a.length);

/**
 * Parse a single IPA segment into a phoneme. Returns null if unrecognised.
 * Handles the modifier diacritics this engine emits, in any order.
 */
export function fromIpa(sym) {
    if (!sym) return null;
    let rest = sym;
    const mods = { aspirated: false, glottalised: false, palatalised: false, labialised: false, nasal: false, long: false, tone: null };

    // Peel modifiers off the end.
    let changed = true;
    while (changed) {
        changed = false;
        for (const [mark, key] of [[MOD_LONG, 'long'], [MOD_LABIALISED, 'labialised'], [MOD_PALATALISED, 'palatalised'],
            [MOD_GLOTTALISED, 'glottalised'], [MOD_ASPIRATED, 'aspirated'], [MOD_NASALISED, 'nasal']]) {
            if (rest.endsWith(mark)) { mods[key] = true; rest = rest.slice(0, -mark.length); changed = true; }
        }
        for (const [tone, mark] of Object.entries(TONE_MARKS)) {
            if (rest.endsWith(mark)) { mods.tone = Number(tone); rest = rest.slice(0, -mark.length); changed = true; }
        }
    }

    const base = BASE_SYMBOLS.find((s) => s === rest);
    if (!base) return null;
    const feat = REVERSE.get(base);
    if (feat.type === 'C') {
        return consonant({
            place: feat.place, manner: feat.manner, voice: feat.voice, lateral: feat.lateral,
            aspirated: mods.aspirated, glottalised: mods.glottalised,
            palatalised: mods.palatalised, labialised: mods.labialised, long: mods.long,
        });
    }
    return vowel({ height: feat.height, back: feat.back, round: feat.round, nasal: mods.nasal, long: mods.long, tone: mods.tone });
}

/**
 * Parse a whitespace- or space-separated IPA string into a word (array of
 * phonemes). Segments may also be written unseparated if each is a single
 * symbol; we greedily match longest-first.
 */
export function parseWord(str) {
    if (Array.isArray(str)) return str;
    const out = [];
    let i = 0;
    const s = str.replace(/\s+/g, '');
    // Pending stress mark, applied to the next vowel encountered. Written in
    // the IPA position (before the syllable) but stored on the nucleus.
    let pendingStress = 0;
    while (i < s.length) {
        if (s[i] === 'ˈ') { pendingStress = 1; i += 1; continue; }
        if (s[i] === 'ˌ') { pendingStress = 2; i += 1; continue; }
        if (s[i] === '.') { i += 1; continue; } // explicit syllable break, informational only
        let matched = null;
        // Try progressively shorter chunks so 't͡ʃʰ' beats 't͡ʃ' beats 't'.
        for (let len = Math.min(6, s.length - i); len >= 1; len--) {
            const chunk = s.slice(i, i + len);
            const ph = fromIpa(chunk);
            if (ph) { matched = { ph, len }; break; }
        }
        if (!matched) throw new Error(`parseWord: unrecognised IPA at index ${i} of "${str}" ("${s.slice(i, i + 3)}…")`);
        let ph = matched.ph;
        if (pendingStress && ph.type === 'V') {
            ph = vowel({ ...ph.f, stress: pendingStress });
            pendingStress = 0;
        }
        out.push(ph);
        i += matched.len;
    }
    return out;
}

/**
 * Render a word with stress marks, for display.
 *
 * IPA places the stress mark before the whole SYLLABLE, not before the vowel:
 * /paˈteːr/, not /patˈeːr/. Since stress is stored on the nucleus, the mark has
 * to be walked back over the onset — and "the onset" is decided by sonority,
 * the same way syllabification decides it. From the vowel, absorb preceding
 * consonants for as long as the cluster keeps rising in sonority towards the
 * nucleus: /kanta/ gives kanˈta (only /t/ is the onset, since /nt/ falls),
 * while /patreː/ gives paˈtreː (/tr/ rises).
 */
export function wordToIpaStressed(word) {
    const markAt = new Map();
    for (let i = 0; i < word.length; i++) {
        const ph = word[i];
        if (ph.type !== 'V' || !ph.f.stress) continue;
        let start = i;
        while (start > 0 && word[start - 1].type === 'C') {
            const candidate = word.slice(start - 1, i);
            let rising = true;
            for (let k = 1; k < candidate.length; k++) {
                if (sonorityOf(candidate[k]) <= sonorityOf(candidate[k - 1])) { rising = false; break; }
            }
            if (!rising) break;
            start -= 1;
        }
        if (!markAt.has(start)) markAt.set(start, ph.f.stress === 1 ? 'ˈ' : 'ˌ');
    }
    let out = '';
    word.forEach((ph, i) => {
        if (markAt.has(i)) out += markAt.get(i);
        out += ph.ipa;
    });
    return out;
}

/** Render a word back to a plain IPA string. */
export function wordToIpa(word) {
    return word.map((ph) => ph.ipa).join('');
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * A matcher is a plain object describing a set of segments:
 *
 *   { type: 'C', manner: 'stop', voice: false }     voiceless stops
 *   { type: 'V', height: [1, 2] }                    high and high-mid vowels
 *   { manner: { not: 'stop' } }                      anything but a stop
 *   { is: 'p' }                                      exactly /p/
 *   { class: 'obstruent' }                           a named natural class
 *   { any: [m1, m2] }                                union of matchers
 *
 * Feature values may be a scalar, an array (membership), or `{not: v}`.
 */
export function matches(ph, m) {
    if (!ph || !m) return false;
    if (m.any) return m.any.some((sub) => matches(ph, sub));
    if (m.is !== undefined) {
        const list = Array.isArray(m.is) ? m.is : [m.is];
        if (!list.includes(ph.ipa)) return false;
    }
    if (m.class !== undefined) {
        const list = Array.isArray(m.class) ? m.class : [m.class];
        if (!list.some((c) => inClass(ph, c))) return false;
    }
    if (m.type !== undefined && ph.type !== m.type) return false;

    for (const [key, want] of Object.entries(m)) {
        if (key === 'type' || key === 'is' || key === 'class' || key === 'any') continue;
        const have = ph.f[key];
        if (!valueMatches(have, want)) return false;
    }
    return true;
}

function valueMatches(have, want) {
    if (want === undefined) return true;
    if (want && typeof want === 'object' && !Array.isArray(want)) {
        if ('not' in want) return !valueMatches(have, want.not);
        if ('min' in want && !(have >= want.min)) return false;
        if ('max' in want && !(have <= want.max)) return false;
        return true;
    }
    if (Array.isArray(want)) return want.includes(have);
    return have === want;
}

/**
 * Named natural classes — the groupings that sound changes actually reference.
 * These aren't arbitrary: each one is a set that behaves as a unit in attested
 * changes somewhere in the world.
 */
export const NATURAL_CLASSES = {
    vowel:        (ph) => ph.type === 'V',
    consonant:    (ph) => ph.type === 'C',
    obstruent:    (ph) => ph.type === 'C' && ['stop', 'affricate', 'fricative'].includes(ph.f.manner),
    sonorant:     (ph) => ph.type === 'V' || (ph.type === 'C' && ['nasal', 'trill', 'tap', 'approximant'].includes(ph.f.manner)),
    stop:         (ph) => ph.type === 'C' && ph.f.manner === 'stop',
    fricative:    (ph) => ph.type === 'C' && ph.f.manner === 'fricative',
    affricate:    (ph) => ph.type === 'C' && ph.f.manner === 'affricate',
    nasal:        (ph) => ph.type === 'C' && ph.f.manner === 'nasal',
    liquid:       (ph) => ph.type === 'C' && (ph.f.lateral || ['trill', 'tap'].includes(ph.f.manner)),
    lateral:      (ph) => ph.type === 'C' && ph.f.lateral,
    rhotic:       (ph) => ph.type === 'C' && !ph.f.lateral && ['trill', 'tap'].includes(ph.f.manner),
    glide:        (ph) => ph.type === 'C' && ph.f.manner === 'approximant' && !ph.f.lateral,
    voiced:       (ph) => ph.type === 'V' || ph.f.voice,
    voiceless:    (ph) => ph.type === 'C' && !ph.f.voice,
    // "Coronal" and "labial" are the two classes that turn up most in
    // assimilation rules, because they're the easiest places to shift towards.
    coronal:      (ph) => ph.type === 'C' && ['dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal'].includes(ph.f.place),
    labial:       (ph) => ph.type === 'C' && ['bilabial', 'labiodental'].includes(ph.f.place),
    dorsal:       (ph) => ph.type === 'C' && ['palatal', 'velar', 'labiovelar', 'uvular'].includes(ph.f.place),
    guttural:     (ph) => ph.type === 'C' && ['uvular', 'pharyngeal', 'glottal'].includes(ph.f.place),
    sibilant:     (ph) => ph.type === 'C' && ['alveolar', 'postalveolar', 'retroflex', 'alveolopalatal'].includes(ph.f.place)
                          && ['fricative', 'affricate'].includes(ph.f.manner) && !ph.f.lateral,
    // Front vowels are the trigger for palatalisation, the single most common
    // conditioned change in the world's languages.
    frontVowel:   (ph) => ph.type === 'V' && ph.f.back === 1,
    backVowel:    (ph) => ph.type === 'V' && ph.f.back === 3,
    highVowel:    (ph) => ph.type === 'V' && ph.f.height <= 2,
    lowVowel:     (ph) => ph.type === 'V' && ph.f.height >= 4,
    roundVowel:   (ph) => ph.type === 'V' && ph.f.round,
    longVowel:    (ph) => ph.type === 'V' && ph.f.long,
};

export function inClass(ph, name) {
    const fn = NATURAL_CLASSES[name];
    if (!fn) throw new Error(`Unknown natural class "${name}"`);
    return fn(ph);
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * Apply a feature delta to a phoneme, returning a NEW phoneme.
 *
 * Values may be absolute (`{voice: true}`, `{height: 2}`) or relative for the
 * numeric vowel dimensions (`{height: '-1'}` = raise by one step, since height
 * counts downwards from close). Relative deltas are how chain shifts are
 * expressed: every vowel in the shifting set moves the same distance through
 * the space, and the arithmetic keeps them from colliding.
 */
export function applyDelta(ph, delta) {
    if (!delta) return ph;
    const f = { ...ph.f };
    for (const [key, val] of Object.entries(delta)) {
        if (typeof val === 'string' && /^[+-]\d+(\.\d+)?$/.test(val)) {
            f[key] = (Number(f[key]) || 0) + Number(val);
        } else {
            f[key] = val;
        }
    }
    // A delta may change a segment's type outright — vocalisation (/l/ → /u/)
    // and consonantisation (/i/ → /j/) are both common and both do this.
    const wantType = delta.type || ph.type;
    if (wantType === 'V') {
        return vowel({
            height: f.height ?? 5, back: f.back ?? 2, round: f.round ?? false,
            nasal: f.nasal ?? false, long: f.long ?? false, tone: f.tone ?? null,
            // Stress MUST survive a feature change. A rule that lowers /o/ to
            // /ɔ/ is not a rule that unstresses the syllable, and if stress
            // were dropped here every stress-conditioned rule downstream of any
            // other vowel rule would silently fail to fire.
            stress: f.stress ?? 0,
        });
    }
    return consonant({
        place: f.place ?? 'alveolar', manner: f.manner ?? 'stop', voice: f.voice ?? false,
        lateral: f.lateral ?? false, aspirated: f.aspirated ?? false, glottalised: f.glottalised ?? false,
        palatalised: f.palatalised ?? false, labialised: f.labialised ?? false, long: f.long ?? false,
    });
}

/** Human-readable description, for the change log and grammar sketch. */
export function describe(ph) {
    if (!ph) return '∅';
    if (ph.type === 'V') {
        const h = ['', 'close', 'close-mid', 'mid', 'open-mid', 'open'][clamp(Math.round(ph.f.height), 1, 5)];
        const b = ['', 'front', 'central', 'back'][clamp(Math.round(ph.f.back), 1, 3)];
        const bits = [ph.f.long && 'long', ph.f.nasal && 'nasal', h, b, ph.f.round ? 'rounded' : 'unrounded', 'vowel'];
        return bits.filter(Boolean).join(' ');
    }
    const bits = [
        ph.f.long && 'long', ph.f.aspirated && 'aspirated', ph.f.glottalised && 'ejective',
        ph.f.palatalised && 'palatalised', ph.f.labialised && 'labialised',
        ph.f.voice ? 'voiced' : 'voiceless', ph.f.place, ph.f.lateral && 'lateral', ph.f.manner,
    ];
    return bits.filter(Boolean).join(' ');
}
