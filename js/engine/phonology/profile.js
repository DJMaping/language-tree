/**
 * Mining a phonological profile out of language NAMES.
 *
 * This is the step that makes generated languages feel like they belong to the
 * world they're in rather than to a random number generator.
 *
 * The reasoning is the same reasoning a historical linguist uses on a corpus of
 * place-names in a language with no surviving texts. Onomastic evidence —
 * toponyms, ethnonyms, glossonyms — is often all that survives of a lost
 * language (Pictish, Iberian, most of pre-Roman Europe), and it is genuinely
 * informative: names preserve the segment inventory, the syllable canon, and
 * the positional constraints even when nothing else does. What they CANNOT tell
 * you is anything not written down — tone, stress, vowel length, phonation.
 * That's why tone is a separate decision and not mined here.
 *
 * The chart's 112 Dahen-Kino names are exactly such a corpus.
 *
 * Input is an array of plain strings. This module never touches the filesystem
 * or the DOM — the caller supplies names, the caller renders the report.
 */

import { fromIpa, parseWord, isVowel } from '../features.js';
import { syllabify, shapeOf } from './phonotactics.js';

/**
 * The parse used while MINING is deliberately permissive: at this stage we do
 * not yet know the language's constraints, so we let sonority alone decide and
 * read off what the corpus actually contains. The constraints are then derived
 * FROM the result, in buildPhonotactics().
 */
const MINING_PT = {
    onset: { max: 3, sonorityMinDistance: 1, licensedExceptions: [], forbidden: [] },
    coda: { max: 3, allowed: null, licensedExceptions: [] },
};

// ---------------------------------------------------------------------------
// Stripping the English scaffolding
// ---------------------------------------------------------------------------

/**
 * The chart labels languages in English: "Old Dahen", "Proto-Kino",
 * "Northern Shie", "Xuqilinese". Those wrappers are OUR metalanguage, not the
 * language's own phonology, and mining them would put an English /p r ow t ow/
 * into every proto-inventory. Strip them first.
 */
const QUALIFIERS = new Set([
    'proto', 'pre', 'old', 'middle', 'ancient', 'early', 'late', 'classical',
    'modern', 'common', 'standard', 'northern', 'southern', 'eastern', 'western',
    'north', 'south', 'east', 'west', 'central', 'high', 'low', 'great', 'greater',
    'lesser', 'upper', 'lower', 'new', 'literary', 'vulgar', 'koine', 'creole',
    'pidgin', 'insular', 'continental', 'coastal', 'imperial',
    // Compound compass points — "Northeastern Dahen" would otherwise donate
    // English /nɔːθiːstən/ to the proto-inventory.
    'northeastern', 'northwestern', 'southeastern', 'southwestern',
    'northeast', 'northwest', 'southeast', 'southwest',
    // Metalinguistic nouns.
    'dialect', 'dialects', 'language', 'languages', 'group', 'branch', 'cluster',
    'variety', 'varieties', 'vernacular', 'tongue', 'speech', 'family',
]);

/**
 * English derivational suffixes we glue onto foreign stems. "-ese" in
 * "Xuqilinese" is Romance, not Dahen-Kino, and would otherwise contribute a
 * spurious /iːz/ to the inventory.
 *
 * Deliberately conservative. "-an" and "-ic" are NOT stripped: they are too
 * often part of the stem, and stripping them mangles more names than it
 * rescues (Atirhan → *atirh loses a real final vowel; Faigan, Ankotoan likewise).
 * A false negative here just leaves one English syllable in a 89-stem corpus;
 * a false positive corrupts the stem itself.
 */
const GLOSSONYM_SUFFIXES = ['nese', 'ese', 'ish', 'ite', 'ian'];

export function stemsOf(name) {
    return String(name)
        .toLowerCase()
        .split(/[\s\-–—/(),.']+/)
        .filter(Boolean)
        .filter((tok) => !QUALIFIERS.has(tok))
        .map(stripSuffix)
        // Filter AGAIN after stripping: "Oldese" reduces to "old", which is a
        // qualifier, not a stem.
        .filter((tok) => tok.length >= 2 && !QUALIFIERS.has(tok));
}

function stripSuffix(tok) {
    for (const suf of GLOSSONYM_SUFFIXES) {
        if (tok.length >= suf.length + 3 && tok.endsWith(suf)) return tok.slice(0, -suf.length);
    }
    return tok;
}

// ---------------------------------------------------------------------------
// Reading the romanisation
// ---------------------------------------------------------------------------

/**
 * Graphemes are not phonemes, and the same letter means different things in
 * different transcription traditions. <q> is /k/ in Latin, /q/ in Arabist
 * transcription and /t͡ɕʰ/ in Pinyin; <x> is /ks/, /ʃ/ or /ɕ/ depending on who
 * wrote it. Guessing wrong distorts the whole inventory, so we detect the
 * convention from the corpus rather than assuming one.
 *
 * Ordered longest-first: multigraphs must win over their component letters.
 */
const READINGS = {
    /** A conservative "European transcription" reading. */
    generic: [
        ['ch', 't͡ʃ'], ['sh', 'ʃ'], ['zh', 'ʒ'], ['th', 'θ'], ['ph', 'f'], ['kh', 'x'],
        ['gh', 'ɣ'], ['ng', 'ŋ'], ['ny', 'ɲ'], ['ts', 't͡s'], ['tz', 't͡s'], ['dz', 'd͡z'],
        ['qu', 'kʷ'], ['ll', 'l'], ['rr', 'r'], ['ss', 's'], ['nn', 'n'], ['pp', 'p'],
        ['tt', 't'], ['kk', 'k'], ['bb', 'b'], ['dd', 'd'], ['gg', 'ɡ'], ['cs', 'ks'],
        ['sj', 'ʃ'],
        ['p', 'p'], ['b', 'b'], ['t', 't'], ['d', 'd'], ['k', 'k'], ['g', 'ɡ'],
        ['c', 'k'], ['q', 'q'], ['f', 'f'], ['v', 'v'], ['s', 's'], ['z', 'z'],
        ['h', 'h'], ['m', 'm'], ['n', 'n'], ['l', 'l'], ['r', 'r'], ['w', 'w'],
        ['y', 'j'], ['j', 'd͡ʒ'], ['x', 'ks'],
        ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'],
    ],
    /**
     * A Pinyin-style reading. The important structural consequence: Pinyin's
     * <b d g> are NOT voiced — they are unaspirated voiceless stops, and <p t k>
     * are their aspirated partners. Reading a Pinyin-flavoured corpus with a
     * European table would invent a voicing contrast the corpus never had, and
     * hand the daughter languages the wrong raw material for tonogenesis
     * (which feeds on voicing, or on its absence).
     */
    pinyin: [
        ['zh', 'ʈ͡ʂ'], ['ch', 'ʈ͡ʂʰ'], ['sh', 'ʂ'], ['ng', 'ŋ'], ['ts', 't͡s'],
        // <th ph kh> aren't Pinyin, but this corpus has them, and in a system
        // whose primary laryngeal contrast is ASPIRATION rather than voicing
        // they read naturally as the aspirated stops. Without these entries the
        // reader falls through to t+h and invents cluster onsets that aren't
        // there — which then corrupts the syllable template downstream.
        ['th', 'tʰ'], ['ph', 'pʰ'], ['kh', 'kʰ'], ['gh', 'ɣ'],
        ['sj', 'ɕ'], ['cs', 'ks'],
        // Doubled letters: this transcription has no length contrast, so they
        // spell a single segment.
        ['nn', 'n'], ['ss', 's'], ['ll', 'l'], ['rr', 'ɻ'], ['tt', 't'], ['kk', 'k'],
        ['pp', 'pʰ'], ['bb', 'p'], ['dd', 't'], ['gg', 'k'], ['zz', 't͡s'], ['ck', 'k'],
        // Doubled VOWELS are a quirk of this transcription, not a length
        // contrast (DJ's call, and it matches the distribution — they cluster
        // in a handful of names rather than forming a systematic contrast).
        // Length is therefore something the daughters have to EARN, and the
        // obvious way is compensatory lengthening when a coda is lost — the
        // same event that generates tone.
        ['aa', 'a'], ['ee', 'e'], ['ii', 'i'], ['oo', 'o'], ['uu', 'u'],
        ['b', 'p'], ['p', 'pʰ'], ['d', 't'], ['t', 'tʰ'], ['g', 'k'], ['k', 'kʰ'],
        ['j', 't͡ɕ'], ['q', 't͡ɕʰ'], ['x', 'ɕ'], ['z', 't͡s'], ['c', 't͡sʰ'], ['s', 's'],
        ['r', 'ɻ'], ['h', 'h'], ['f', 'f'], ['m', 'm'], ['n', 'n'], ['l', 'l'],
        ['w', 'w'], ['v', 'v'],
        // <e> is read as plain /e/, NOT Mandarin's /ɤ/. The unrounded back mid
        // vowel is a Mandarin-specific quirk, not a property of East-Asian
        // transcription generally, and reading it in would produce the
        // typologically odd five-vowel set /a i o u ɤ/. /i e a o u/ is the
        // canonical five-vowel system and is what the universals expect.
        ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'],
    ],
};

/**
 * Score the corpus for a Pinyin-style transcription. The diagnostics are the
 * graphemes that are near-impossible in a European reading but routine in
 * Pinyin: <zh>, bare <q> without a following <u>, non-final <x>, and the
 * vowel sequences <ao ou ia iu uo>.
 */
export function detectReading(stems) {
    const text = stems.join(' ');
    let score = 0;
    const hits = {};
    const bump = (label, n, weight) => { if (n) { hits[label] = n; score += n * weight; } };

    // Weighted by how DIAGNOSTIC each grapheme actually is. <zh>, bare <q> and
    // non-final <x> are near-impossible in a European transcription and routine
    // in an East-Asian one, so they carry the decision. Vowel sequences like
    // <ao ou ia> are only weak evidence — Romance, Polynesian and Finnic are
    // full of them too — so they get a small weight and can't swamp the signal.
    bump('zh', count(text, /zh/g), 3);
    bump('q not before u', count(text, /q(?!u)/g), 3);
    bump('non-final x', count(text, /x(?![\s]|$)/g), 2);
    bump('ao/ou/ia/iu/uo', count(text, /ao|ou|ia|iu|uo/g), 0.3);
    bump('final -ng', count(text, /ng\b/g), 1);
    // Counter-evidence for a European reading.
    bump('qu (Latinate)', -count(text, /qu/g), 3);
    bump('th/ph/gh (Hellenic)', -count(text, /th|ph|gh/g), 2);

    /**
     * The score must also be DENSE. With the canon city names in the evidence
     * a family can have a thousand stems, and a scattering of <x> <q> <ng>
     * across them (Lycroa's Fujanza, Mijang, Rexianzu) passed the bare
     * threshold and read all of Alzuria-Ayuman as Pinyin: aspirated and
     * retroflex series nothing else in its evidence supports. Dahen-Kino's
     * names score 34 per hundred stems; Alzuria-Ayuman's evidence 12.
     */
    const dense = score / Math.max(1, stems.length) >= 0.2;
    return { reading: score >= 8 && dense ? 'pinyin' : 'generic', score, hits };
}

function count(s, re) { return (s.match(re) || []).length; }

/** Convert one stem into a phoneme array using the chosen reading. */
export function readStem(stem, reading = 'generic') {
    const table = READINGS[reading] || READINGS.generic;
    const out = [];
    const unknown = [];
    const VOWEL_LETTERS = 'aeiouäöü';
    let i = 0;
    while (i < stem.length) {
        let hit = null;
        // <y> is the one grapheme whose value is positional in every European
        // transcription tradition: a glide before a vowel ("Ywa" /jwa/), a
        // vowel elsewhere ("Vally" /vali/). Resolving it by context rather than
        // by table avoids inventing word-final glides that no language likes.
        if (stem[i] === 'y') {
            const next = stem[i + 1];
            hit = { graph: 'y', ipa: next && VOWEL_LETTERS.includes(next) ? 'j' : 'i' };
        }
        for (const [graph, ipa] of table) {
            if (hit) break;
            if (stem.startsWith(graph, i)) { hit = { graph, ipa }; break; }
        }
        if (!hit) { unknown.push(stem[i]); i += 1; continue; }
        // One grapheme may spell more than one phoneme (<x> = /ks/).
        try {
            for (const ph of parseWord(hit.ipa)) out.push(ph);
        } catch {
            const ph = fromIpa(hit.ipa);
            // Never fail silently. If the reading table names an IPA symbol the
            // feature tables can't build, that's a gap in the engine, not in the
            // corpus — dropping it quietly would leave a whole series missing
            // from the inventory with no indication why.
            if (ph) out.push(ph);
            else unknown.push(`${hit.graph}→${hit.ipa}?`);
        }
        i += hit.graph.length;
    }
    return { phonemes: out, unknown };
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

/**
 * Build a PhonologicalProfile from a list of names.
 *
 * The profile is EVIDENCE, not a language. It goes on to constrain inventory
 * generation (which then also has to satisfy typological universals), rather
 * than being used directly — the corpus is small and full of gaps, exactly like
 * a real onomastic corpus.
 */
export function mineProfile(names, opts = {}) {
    /**
     * Mining runs in TWO passes, and it has to.
     *
     * Pass 1 syllabifies with no diphthongs declared, because we don't yet know
     * which vowel sequences the language treats as single nuclei. From that
     * pass we read off which sequences are frequent enough to be diphthongs.
     *
     * Pass 2 re-syllabifies knowing them. Only the second pass produces
     * trustworthy syllable-shape statistics — and those statistics are what
     * root generation is calibrated against, so getting them wrong would
     * quietly mis-shape every word in the language.
     */
    if (!opts._pass2) {
        const first = mineProfile(names, { ...opts, _pass2: true, _diphthongs: [] });
        const diphthongs = first.vowelSequences
            .filter((v) => v.count >= (opts.diphthongCutoff ?? 3))
            .map((v) => v.key);
        const second = mineProfile(names, { ...opts, _pass2: true, _diphthongs: diphthongs });
        second.passes = 2;
        second.detectedDiphthongs = diphthongs;
        // Vowel sequences are only visible in the first pass; the second pass
        // has already folded them into nuclei.
        second.vowelSequences = first.vowelSequences;
        return second;
    }

    const stems = [...new Set(names.flatMap(stemsOf))];
    const detection = opts.reading ? { reading: opts.reading, score: null, hits: {} } : detectReading(stems);
    const reading = detection.reading;
    const miningPt = { ...MINING_PT, nucleus: { diphthongs: opts._diphthongs || [] } };

    const cons = new Map();   // ipa → {onset, coda, total}
    const vows = new Map();   // ipa → count
    const vSeq = new Map();   // "a+i" → count
    const onsetClusters = new Map();
    const codaSet = new Map();
    const shapes = new Map();
    const unknownGraphemes = new Map();
    let sylTotal = 0, geminateHits = 0, wordFinalCoda = 0, wordCount = 0;

    for (const stem of stems) {
        const { phonemes, unknown } = readStem(stem, reading);
        unknown.forEach((g) => unknownGraphemes.set(g, (unknownGraphemes.get(g) || 0) + 1));
        if (!phonemes.length) continue;
        wordCount += 1;
        if (/(.)\1/.test(stem)) geminateHits += 1;

        const sylls = syllabify(phonemes, miningPt);
        sylTotal += sylls.length;

        sylls.forEach((s, si) => {
            shapes.set(shapeOf(s), (shapes.get(shapeOf(s)) || 0) + 1);
            s.onset.forEach((ph) => tallyC(cons, ph, 'onset'));
            s.coda.forEach((ph) => { tallyC(cons, ph, 'coda'); codaSet.set(ph.ipa, (codaSet.get(ph.ipa) || 0) + 1); });
            s.nucleus.forEach((ph) => vows.set(ph.ipa, (vows.get(ph.ipa) || 0) + 1));
            if (s.onset.length > 1) {
                const key = s.onset.map((p) => p.ipa).join('');
                onsetClusters.set(key, (onsetClusters.get(key) || 0) + 1);
            }
            if (si === sylls.length - 1 && s.coda.length) wordFinalCoda += 1;
        });

        // Vowel sequences (adjacent nuclei) — diphthong candidates.
        for (let i = 1; i < phonemes.length; i++) {
            if (isVowel(phonemes[i]) && isVowel(phonemes[i - 1])) {
                const key = phonemes[i - 1].ipa + phonemes[i].ipa;
                vSeq.set(key, (vSeq.get(key) || 0) + 1);
            }
        }
    }

    const consonants = [...cons.entries()]
        .map(([ipa, v]) => ({ ipa, ...v, freq: v.total / Math.max(1, sumOf(cons, 'total')) }))
        .sort((a, b) => b.total - a.total);
    const vowels = [...vows.entries()]
        .map(([ipa, count]) => ({ ipa, count, freq: count / Math.max(1, sum(vows)) }))
        .sort((a, b) => b.count - a.count);

    const maxOnset = Math.max(1, ...[...shapes.keys()].map((s) => (s.match(/^C+/) || [''])[0].length));
    const maxCoda = Math.max(0, ...[...shapes.keys()].map((s) => (s.match(/C+$/) || [''])[0].length - (/^C+$/.test(s) ? s.length : 0)));

    return {
        source: { names: names.length, stems: stems.length, words: wordCount },
        reading, detection,
        consonants,
        vowels,
        vowelSequences: sortedEntries(vSeq),
        onsetClusters: sortedEntries(onsetClusters),
        codas: sortedEntries(codaSet),
        syllableShapes: sortedEntries(shapes),
        syllableTemplate: template(maxOnset, maxCoda),
        maxOnset,
        maxCoda: Math.max(0, maxCoda),
        meanSyllablesPerWord: wordCount ? sylTotal / wordCount : 0,
        closedWordRate: wordCount ? wordFinalCoda / wordCount : 0,
        writtenGeminates: geminateHits,
        unknownGraphemes: sortedEntries(unknownGraphemes),
    };
}

function tallyC(map, ph, slot) {
    const cur = map.get(ph.ipa) || { onset: 0, coda: 0, total: 0 };
    cur[slot] += 1; cur.total += 1;
    map.set(ph.ipa, cur);
}
function sum(map) { let t = 0; for (const v of map.values()) t += v; return t; }
function sumOf(map, key) { let t = 0; for (const v of map.values()) t += v[key]; return t; }
function sortedEntries(map) {
    return [...map.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}
function template(maxOnset, maxCoda) {
    return '(C)'.repeat(Math.max(0, maxOnset - 1)) + 'C'.repeat(0) + '(C)'.repeat(0)
        + (maxOnset > 0 ? '' : '') + 'V' + '(C)'.repeat(Math.max(0, maxCoda));
}

/** Human-readable report — used by the CLI and the review gate. */
export function formatProfile(p, { limit = 24 } = {}) {
    const L = [];
    L.push(`Corpus: ${p.source.names} names → ${p.source.stems} distinct stems (${p.source.words} readable)`);
    L.push(`Transcription read as: ${p.reading}` + (p.detection.score !== null ? `  (score ${p.detection.score}; ${Object.entries(p.detection.hits).map(([k, v]) => `${k}×${v}`).join(', ')})` : ''));
    L.push('');
    L.push(`Consonants (${p.consonants.length}), by frequency — onset/coda counts:`);
    L.push('  ' + p.consonants.slice(0, limit).map((c) => `${c.ipa}(${c.onset}/${c.coda})`).join('  '));
    L.push('');
    L.push(`Vowels (${p.vowels.length}):`);
    L.push('  ' + p.vowels.map((v) => `${v.ipa}×${v.count}`).join('  '));
    L.push('');
    L.push(`Vowel sequences: ${p.vowelSequences.slice(0, 14).map((v) => `${v.key}×${v.count}`).join('  ') || '(none)'}`);
    L.push(`Attested codas:  ${p.codas.slice(0, 14).map((v) => `${v.key}×${v.count}`).join('  ') || '(none — fully open syllables)'}`);
    L.push(`Onset clusters:  ${p.onsetClusters.slice(0, 12).map((v) => `${v.key}×${v.count}`).join('  ') || '(none — simple onsets only)'}`);
    L.push('');
    L.push(`Syllable shapes: ${p.syllableShapes.slice(0, 10).map((s) => `${s.key || 'V'}×${s.count}`).join('  ')}`);
    L.push(`Template: ${p.syllableTemplate}   max onset ${p.maxOnset}, max coda ${p.maxCoda}`);
    L.push(`Mean ${p.meanSyllablesPerWord.toFixed(2)} syllables/word; ${(p.closedWordRate * 100).toFixed(0)}% of words end in a consonant`);
    if (p.writtenGeminates) L.push(`Doubled letters in ${p.writtenGeminates} stems — possible length/gemination contrast`);
    if (p.unknownGraphemes.length) L.push(`Unread graphemes: ${p.unknownGraphemes.map((u) => `${u.key}×${u.count}`).join(' ')}`);
    return L.join('\n');
}
